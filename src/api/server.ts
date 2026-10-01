// ======================================================
// AGENT COMMERCE API (local, sem framework)
//
// node:http em 127.0.0.1:AGENT_API_PORT (default 3005).
//
// GET  /health
// POST /api/chat
// POST /api/approvals/:approvalId
// ======================================================

import "dotenv/config";

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

const HOST = "127.0.0.1";

const PORTA = Number(
  process.env.AGENT_API_PORT ?? 3005,
);

const LIMITE_BODY_BYTES = 1024 * 1024;

function responderJson(
  res: ServerResponse,
  estado: number,
  corpo: unknown,
): void {
  res.writeHead(estado, {
    "Content-Type": "application/json",
  });

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

const servidor = createServer(
  async (
    req: IncomingMessage,
    res: ServerResponse,
  ) => {
    try {
      const caminho =
        caminhoNormalizado(req.url);

      if (
        req.method === "GET" &&
        caminho === "/health"
      ) {
        responderJson(res, 200, {
          status: "ok",
        });

        return;
      }

      if (
        req.method === "POST" &&
        caminho === "/api/chat"
      ) {
        if (!eJson(req)) {
          responderJson(res, 415, {
            error:
              "unsupported_media_type",
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
        );

        if (resposta.status === "completed") {
          responderJson(res, 200, {
            status: "completed",
            conversationId:
              resposta.conversationId,
            message: resposta.message,
          });

          return;
        }

        responderJson(res, 200, {
          status: "approval_required",
          conversationId:
            resposta.conversationId,
          approval: resposta.approval,
        });

        return;
      }

      if (
        req.method === "POST" &&
        caminho.startsWith("/api/approvals/")
      ) {
        if (!eJson(req)) {
          responderJson(res, 415, {
            error:
              "unsupported_media_type",
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
          responderJson(res, 404, {
            error: "approval_not_found",
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
          );

        if (resposta.status === "completed") {
          responderJson(res, 200, {
            status: "completed",
            conversationId:
              resposta.conversationId,
            message: resposta.message,
          });

          return;
        }

        responderJson(res, 200, {
          status: "approval_required",
          conversationId:
            resposta.conversationId,
          approval: resposta.approval,
        });

        return;
      }

      responderJson(res, 404, {
        error: "not_found",
      });
    } catch (erro) {
      if (erro instanceof ErroApi) {
        responderJson(res, erro.estado, {
          error: erro.codigo,
        });

        return;
      }

      console.error(
        erro instanceof Error
          ? erro.message
          : erro,
      );

      if (!res.headersSent) {
        responderJson(res, 500, {
          error: "internal_error",
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
