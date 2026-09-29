// ======================================================
// SERVIDOR MCP INDEPENDENTE (Streamable HTTP, READ-ONLY)
//
// Arranque: npm run mcp:http
// Endpoint: http://127.0.0.1:3002/mcp
//
// Processo próprio, stateless (um transporte por pedido).
// Só localhost. NÃO está pronto para exposição pública
// (sem auth/TLS/rate limit — ver Fase 3).
// ======================================================

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


const HOST = "127.0.0.1";

const PORTA = Number(
  process.env.MCP_COMMERCIAL_POLICY_PORT ?? 3002,
);


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
      // ==================================================

      if (req.url === "/mcp") {
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
