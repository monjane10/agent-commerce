// ======================================================
// SERVIDOR MCP INDEPENDENTE (Streamable HTTP, READ-ONLY)
//
// Arranque: npm run mcp:http
// Endpoint: http://127.0.0.1:3002/mcp
//
// Fase 3B: OAuth Resource Server (JWT RS256 via JWKS,
// issuer/audience/expiração/scopes) + rate limit.
// Só localhost. NÃO está pronto para exposição pública
// (falta IdP real/OAuth completo/TLS — ver Fase 3C).
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
  lerConfigOAuth,
  verificarTokenAcesso,
  metadataRecursoProtegido,
  urlMetadataRecurso,
  extrairBearer,
  criarLimitador,
  RATE_LIMIT_JANELA_MS,
  RATE_LIMIT_MAX_POR_IP,
  type ConfigOAuth,
} from "./commercial-policy-auth.js";


const HOST = "127.0.0.1";

const PORTA = Number(
  process.env.MCP_COMMERCIAL_POLICY_PORT ?? 3002,
);

const URL_RECURSO = `http://${HOST}:${PORTA}/mcp`;

const URL_METADATA = urlMetadataRecurso(HOST, PORTA);


let CONFIG_OAUTH: ConfigOAuth;

try {
  CONFIG_OAUTH = lerConfigOAuth();
}
catch {
  console.error(
    "Configuração OAuth incompleta: define MCP_AUTH_ISSUER, MCP_AUTH_AUDIENCE e MCP_AUTH_JWKS_URI.",
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
      // METADATA DO RECURSO PROTEGIDO (RFC 9728, público)
      // ==================================================

      if (
        (req.url === "/.well-known/oauth-protected-resource" ||
          req.url === "/.well-known/oauth-protected-resource/mcp") &&
        req.method === "GET"
      ) {
        res.writeHead(200, {
          "Content-Type": "application/json",
        });

        res.end(
          JSON.stringify(
            metadataRecursoProtegido(
              URL_RECURSO,
              CONFIG_OAUTH.issuer,
            ),
          ),
        );

        return;
      }


      // ==================================================
      // MCP (protocolo Streamable HTTP, stateless)
      //
      // Ordem: rate limit (conta tudo, inclusive sem
      // auth) -> verificação OAuth -> transporte MCP.
      // ==================================================

      if (req.url === "/mcp") {
        const ip = ipPedido(req);

        if (!verificarLimite(ip)) {
          console.log(
            "[MCP AUTH] rate limit exceeded",
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

        const verificacao =
          await verificarTokenAcesso(
            recebido,
            CONFIG_OAUTH,
          );

        if (!verificacao.ok) {
          if (verificacao.estado === 403) {
            console.log(
              "[MCP AUTH] insufficient_scope",
            );

            res.writeHead(403, {
              "Content-Type": "application/json",
              "WWW-Authenticate": `Bearer error="insufficient_scope", resource_metadata="${URL_METADATA}"`,
            });

            res.end('{"error":"insufficient_scope"}');

            return;
          }

          console.log(
            "[MCP AUTH] unauthorized",
          );

          res.writeHead(401, {
            "Content-Type": "application/json",
            "WWW-Authenticate": `Bearer resource_metadata="${URL_METADATA}"`,
          });

          res.end('{"error":"unauthorized"}');

          return;
        }

        console.log(
          "[MCP AUTH] authenticated",
        );

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
