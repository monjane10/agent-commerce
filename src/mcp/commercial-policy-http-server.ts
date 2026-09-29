// ======================================================
// SERVIDOR MCP INDEPENDENTE (Streamable HTTP, READ-ONLY)
//
// Arranque: npm run mcp:http
// Endpoint: http://127.0.0.1:3002/mcp
//
// Fase 3A: Bearer auth (MCP_COMMERCIAL_POLICY_TOKEN)
// + rate limit em memória. Só localhost. NÃO está pronto
// para exposição pública (falta OAuth/TLS — ver Fase 3B).
// ======================================================

import "dotenv/config";

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import {
  criarCommercialPolicyMcpServer,
} from "./commercial-policy-shared.js";

import {
  lerTokenPoliticas,
  compararTokens,
  extrairBearer,
  criarLimitador,
  RATE_LIMIT_JANELA_MS,
  RATE_LIMIT_MAX_POR_IP,
} from "./commercial-policy-auth.js";


const HOST = "127.0.0.1";

const PORTA = Number(
  process.env.MCP_COMMERCIAL_POLICY_PORT ?? 3002,
);


let TOKEN_ESPERADO = "";

try {
  TOKEN_ESPERADO = lerTokenPoliticas();
}
catch {
  console.error(
    "MCP_COMMERCIAL_POLICY_TOKEN não configurado.",
  );

  process.exit(1);
}


const verificarLimite = criarLimitador(
  RATE_LIMIT_JANELA_MS,
  RATE_LIMIT_MAX_POR_IP,
);


function ipPedido(
  req: IncomingMessage,
): string {
  return req.socket.remoteAddress ?? "desconhecido";
}


function lerCorpo(
  req: IncomingMessage,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = [];

    req.on("data", (parte: Buffer) => {
      partes.push(parte);
    });

    req.on("end", () => {
      if (partes.length === 0) {
        resolve(undefined);
        return;
      }

      try {
        resolve(
          JSON.parse(
            Buffer.concat(partes).toString("utf-8"),
          ),
        );
      }
      catch (erro) {
        reject(erro);
      }
    });

    req.on("error", reject);
  });
}


const http = createServer(
  async (
    req: IncomingMessage,
    res: ServerResponse,
  ) => {
    try {
      // ==================================================
      // HEALTH CHECK (diagnóstico, não é MCP tool)
      // Deliberadamente público: só responde status.
      // ==================================================

      if (
        req.url === "/health" &&
        req.method === "GET"
      ) {
        res.writeHead(200, {
          "Content-Type": "application/json",
        });
        res.end('{"status":"ok"}');
        return;
      }


      // ==================================================
      // MCP (protocolo Streamable HTTP, stateless)
      //
      // Ordem: rate limit (conta tudo, inclusive sem
      // auth) -> Bearer auth -> transporte MCP.
      // ==================================================

      if (req.url === "/mcp") {
        const ip = ipPedido(req);

        if (!verificarLimite(ip)) {
          console.log(
            "[MCP] rate limit exceeded",
          );

          res.writeHead(429, {
            "Content-Type": "application/json",
            "Retry-After": "60",
          });

          res.end('{"error":"too_many_requests"}');

          return;
        }

        const recebido = extrairBearer(
          req.headers.authorization,
        );

        if (
          !compararTokens(recebido, TOKEN_ESPERADO)
        ) {
          console.log(
            "[MCP] request unauthorized",
          );

          res.writeHead(401, {
            "Content-Type": "application/json",
            "WWW-Authenticate": "Bearer",
          });

          res.end('{"error":"unauthorized"}');

          return;
        }

        const servidor =
          criarCommercialPolicyMcpServer();

        const transporte =
          new StreamableHTTPServerTransport();

        try {
          // Cast pontual só no connect: as declarações do
          // SDK 1.31 usam uniões explícitas com undefined
          // que colidem com exactOptionalPropertyTypes.
          await servidor.connect(
            transporte as Transport,
          );

          const corpo =
            req.method === "POST"
              ? await lerCorpo(req)
              : undefined;

          await transporte.handleRequest(
            req,
            res,
            corpo,
          );
        }
        finally {
          await transporte.close().catch(() => undefined);
          await servidor.close().catch(() => undefined);
        }

        return;
      }


      res.writeHead(404);
      res.end();
    }
    catch {
      if (!res.headersSent) {
        res.writeHead(400);
      }

      res.end();
    }
  },
);


http.listen(PORTA, HOST, () => {
  console.log(`
===================================
 Commercial Policy MCP Server
 listening at:
 http://${HOST}:${PORTA}/mcp
===================================
`);
});


function encerrar(): void {
  http.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(0);
  }, 2000).unref();
}


process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);
