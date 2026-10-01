// ======================================================
// AGENT COMMERCE API (local, sem framework)
//
// node:http em 127.0.0.1:AGENT_API_PORT (default 3005).
//
// GET  /health                   (público)
// POST /api/chat                 (JWT Supabase)
// POST /api/approvals/:approvalId (JWT Supabase)
//
// Pipeline por request (Fase 6A):
//   request ID
//   -> headers de segurança
//   -> rate limit (antes de auth: credenciais
//      inválidas também contam)
//   -> Supabase auth (Bearer JWT, user do Auth)
//   -> body parsing (limite 1 MB)
//   -> validation
//   -> ownership (conversa/approval do user)
//   -> route handler
//
// IP = socket remoto. Sem X-Forwarded-For.
// Sem HSTS (HTTP localhost), sem CORS (sem browser).
// approval UUID NÃO é credencial: decidir exige
// sempre Authorization Bearer (ver approval-store).
// ======================================================

import "dotenv/config";

import { randomUUID } from "node:crypto";

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import {
  processarChat,
  decidirApproval,
  ErroApi,
} from "./agent-api.js";

import {
  expirarPendentesArranque,
} from "./approval-store.js";

import {
  autenticarPedido,
  CABECALHO_WWW_AUTHENTICATE,
} from "./auth.js";

import type {
  AuthenticatedUser,
} from "./auth.js";

import {
  criarLimitador,
} from "./rate-limit.js";

const HOST = "127.0.0.1";

const PORTA = Number(
  process.env.AGENT_API_PORT ?? 3005,
);

const LIMITE_BODY_BYTES = 1024 * 1024;

// 60 req/min geral em /api/*; 20 req/min em approvals.
const JANELA_MS = 60000;

const limiteGeral = criarLimitador(
  JANELA_MS,
  60,
);

const limiteApprovals = criarLimitador(
  JANELA_MS,
  20,
);

function ipRemoto(
  req: IncomingMessage,
): string {
  return (
    req.socket.remoteAddress ??
    "desconhecido"
  );
}

function responder(
  res: ServerResponse,
  caminho: string,
  requestId: string,
  estado: number,
  corpo: unknown,
  extras?: Record<string, string>,
): void {
  const cabecalhos: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Request-Id": requestId,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...extras,
  };

  if (caminho.startsWith("/api/")) {
    cabecalhos["Cache-Control"] =
      "no-store";
  }

  res.writeHead(estado, cabecalhos);

  res.end(JSON.stringify(corpo));
}

function caminhoNormalizado(
  url: string | undefined,
): string {
  const bruto = (url ?? "/").split("?")[0] ?? "/";

  if (
    bruto.length > 1 &&
    bruto.endsWith("/")
  ) {
    return bruto.slice(0, -1);
  }

  return bruto;
}

function eJson(
  req: IncomingMessage,
): boolean {
  const tipo =
    req.headers["content-type"] ?? "";

  const texto = Array.isArray(tipo)
    ? tipo[0] ?? ""
    : tipo;

  return texto
    .split(";")[0]
    ?.trim()
    .toLowerCase() ===
    "application/json";
}

function lerBodyLimitado(
  req: IncomingMessage,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = [];

    let tamanho = 0;

    let excedeu = false;

    req.on("data", (parte: Buffer) => {
      if (excedeu) {
        return;
      }

      tamanho += parte.length;

      if (tamanho > LIMITE_BODY_BYTES) {
        excedeu = true;

        reject(
          new ErroApi(
            413,
            "payload_too_large",
          ),
        );

        req.destroy();

        return;
      }

      partes.push(parte);
    });

    req.on("end", () => {
      if (excedeu) {
        return;
      }

      resolve(
        Buffer.concat(partes).toString(
          "utf-8",
        ),
      );
    });

    req.on("error", reject);
  });
}

function validarChat(
  corpo: unknown,
): {
  message: string;
  conversationId: number | undefined;
} {
  if (
    typeof corpo !== "object" ||
    corpo === null
  ) {
    throw new ErroApi(400, "invalid_request");
  }

  const registo = corpo as Record<
    string,
    unknown
  >;

  const mensagem = registo["message"];

  if (
    typeof mensagem !== "string" ||
    mensagem.trim() === ""
  ) {
    throw new ErroApi(400, "invalid_request");
  }

  const conversa = registo["conversationId"];

  if (
    conversa === undefined ||
    conversa === null
  ) {
    return {
      message: mensagem.trim(),
      conversationId: undefined,
    };
  }

  if (
    typeof conversa !== "number" ||
    !Number.isInteger(conversa) ||
    conversa <= 0
  ) {
    throw new ErroApi(400, "invalid_request");
  }

  return {
    message: mensagem.trim(),
    conversationId: conversa,
  };
}

function validarDecision(
  corpo: unknown,
): string {
  if (
    typeof corpo !== "object" ||
    corpo === null
  ) {
    throw new ErroApi(400, "invalid_request");
  }

  const registo = corpo as Record<
    string,
    unknown
  >;

  const decision = registo["decision"];

  if (
    decision !== "approve" &&
    decision !== "reject"
  ) {
    throw new ErroApi(400, "invalid_request");
  }

  return decision;
}

function eRotaApprovals(
  caminho: string,
): boolean {
  return caminho.startsWith("/api/approvals/");
}

const servidor = createServer(
  async (
    req: IncomingMessage,
    res: ServerResponse,
  ) => {
    // Request ID gerado sempre no servidor;
    // X-Request-Id externo nunca reutilizado.
    const requestId = randomUUID();

    const caminho =
      caminhoNormalizado(req.url);

    const metodo = req.method ?? "";

    console.log(
      `[API] request=${requestId} ${metodo} ${caminho}`,
    );

    const responderAqui = (
      estado: number,
      corpo: unknown,
      extras?: Record<string, string>,
    ): void => {
      console.log(
        `[API] request=${requestId} status=${estado}`,
      );

      responder(
        res,
        caminho,
        requestId,
        estado,
        corpo,
        extras,
      );
    };

    const erroComId = (
      codigo: string,
    ): Record<string, string> => ({
      error: codigo,
      requestId,
    });

    let utilizador: AuthenticatedUser | null =
      null;

    try {
      // ================================================
      // HEALTH (público no-op)
      // ================================================

      if (
        metodo === "GET" &&
        caminho === "/health"
      ) {
        responderAqui(200, {
          status: "ok",
        });

        return;
      }

      // ================================================
      // RATE LIMIT (/api/*, antes de auth)
      // ================================================

      if (caminho.startsWith("/api/")) {
        const geral = limiteGeral(
          ipRemoto(req),
        );

        if (!geral.permitido) {
          responderAqui(
            429,
            erroComId("too_many_requests"),
            {
              "Retry-After": String(
                geral.retryAfterSeg,
              ),
            },
          );

          return;
        }

        if (eRotaApprovals(caminho)) {
          const especifico =
            limiteApprovals(
              ipRemoto(req),
            );

          if (!especifico.permitido) {
            responderAqui(
              429,
              erroComId("too_many_requests"),
              {
                "Retry-After": String(
                  especifico.retryAfterSeg,
                ),
              },
            );

            return;
          }
        }

        // ==============================================
        // AUTH JWT (Supabase; 401 genérico sem
        // distinguir ausente/inválido/expirado)
        // ==============================================

        const autenticado =
          await autenticarPedido(
            req,
            requestId,
          );

        if (!autenticado) {
          responderAqui(
            401,
            erroComId("unauthorized"),
            {
              "WWW-Authenticate":
                CABECALHO_WWW_AUTHENTICATE,
            },
          );

          return;
        }

        utilizador = autenticado;
      }

      if (
        metodo === "POST" &&
        caminho === "/api/chat"
      ) {
        // Defesa em profundidade: rotas /api/*
        // passam sempre pela auth acima.
        if (!utilizador) {
          responderAqui(
            401,
            erroComId("unauthorized"),
            {
              "WWW-Authenticate":
                CABECALHO_WWW_AUTHENTICATE,
            },
          );

          return;
        }

        if (!eJson(req)) {
          responderAqui(415, {
            error:
              "unsupported_media_type",
            requestId,
          });

          return;
        }

        let corpo: unknown;

        try {
          corpo = JSON.parse(
            await lerBodyLimitado(req),
          );
        } catch (erro) {
          if (erro instanceof ErroApi) {
            throw erro;
          }

          throw new ErroApi(
            400,
            "invalid_request",
          );
        }

        const pedido = validarChat(corpo);

        const resposta = await processarChat(
          pedido.message,
          pedido.conversationId,
          utilizador,
        );

        if (resposta.status === "completed") {
          responderAqui(200, {
            status: "completed",
            conversationId:
              resposta.conversationId,
            message: resposta.message,
          });

          return;
        }

        responderAqui(200, {
          status: "approval_required",
          conversationId:
            resposta.conversationId,
          approval: resposta.approval,
        });

        return;
      }

      if (
        metodo === "POST" &&
        eRotaApprovals(caminho)
      ) {
        if (!utilizador) {
          responderAqui(
            401,
            erroComId("unauthorized"),
            {
              "WWW-Authenticate":
                CABECALHO_WWW_AUTHENTICATE,
            },
          );

          return;
        }

        if (!eJson(req)) {
          responderAqui(415, {
            error:
              "unsupported_media_type",
            requestId,
          });

          return;
        }

        const idBruto = caminho.slice(
          "/api/approvals/".length,
        );

        if (
          idBruto === "" ||
          idBruto.includes("/")
        ) {
          responderAqui(404, {
            error: "approval_not_found",
            requestId,
          });

          return;
        }

        let corpo: unknown;

        try {
          corpo = JSON.parse(
            await lerBodyLimitado(req),
          );
        } catch (erro) {
          if (erro instanceof ErroApi) {
            throw erro;
          }

          throw new ErroApi(
            400,
            "invalid_request",
          );
        }

        const decision =
          validarDecision(corpo);

        const resposta =
          await decidirApproval(
            decodeURIComponent(idBruto),
            decision,
            utilizador,
          );

        if (resposta.status === "completed") {
          responderAqui(200, {
            status: "completed",
            conversationId:
              resposta.conversationId,
            message: resposta.message,
          });

          return;
        }

        responderAqui(200, {
          status: "approval_required",
          conversationId:
            resposta.conversationId,
          approval: resposta.approval,
        });

        return;
      }

      responderAqui(404, {
        error: "not_found",
        requestId,
      });
    } catch (erro) {
      if (erro instanceof ErroApi) {
        responderAqui(erro.estado, {
          error: erro.codigo,
          requestId,
        });

        return;
      }

      // Stack só no log interno, com requestId.
      // Resposta pública: sem stack, sem secrets.
      console.error(
        `[API] request=${requestId} erro interno: ${
          erro instanceof Error
            ? erro.stack ?? erro.message
            : erro
        }`,
      );

      if (!res.headersSent) {
        responderAqui(500, {
          error: "internal_error",
          requestId,
        });
      } else {
        res.end();
      }
    }
  },
);

servidor.listen(PORTA, HOST, () => {
  console.log(
    `Agent Commerce API em http://${HOST}:${PORTA}`,
  );

  // RunState vivia so em memoria: pendentes de um
  // processo anterior nunca podem retomar.
  expirarPendentesArranque().then(
    (quantidade) => {
      if (quantidade > 0) {
        console.log(
          `Approvals expirados no arranque: ${quantidade}.`,
        );
      }
    },
    (erro) => {
      console.error(
        erro instanceof Error
          ? erro.message
          : erro,
      );
    },
  );
});

function encerrar(): void {
  servidor.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(0);
  }, 2000).unref();
}

process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);
