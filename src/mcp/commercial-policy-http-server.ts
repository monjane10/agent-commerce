// ======================================================
// SERVIDOR MCP INDEPENDENTE (Streamable HTTP, READ-ONLY)
//
// Arranque: npm run mcp:http (ouve sempre 127.0.0.1:3002)
// Externo (Fase 4): via reverse proxy + MCP_PUBLIC_BASE_URL
//
// Fase 4: URLs OAuth externas configuráveis, trust proxy
// explícito, /ready. Só localhost. NÃO expor publicamente.
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
  lerUrlPublica,
  confiarNoProxy,
  ipCliente,
  extrairBearer,
  criarLimitador,
  RATE_LIMIT_JANELA_MS,
  RATE_LIMIT_MAX_POR_IP,
  type ConfigOAuth,
  type UrlsPublicas,
} from "./commercial-policy-auth.js";


const HOST = "127.0.0.1";

const PORTA = Number(
  process.env.MCP_COMMERCIAL_POLICY_PORT ?? 3002,
);

// Separação interno/externo (Fase 4): o Node ouve sempre
// em loopback; URLs OAuth/metadata usam a base pública
// quando configurada, senão a interna direta.
const URLS_PUBLICAS: UrlsPublicas | null = (() => {
  try {
    return lerUrlPublica();
  }
  catch (erro) {
    console.error(
      erro instanceof Error ? erro.message : erro,
    );

    process.exit(1);
  }
})();

const URL_RECURSO = URLS_PUBLICAS
  ? URLS_PUBLICAS.resourceUrl
  : `http://${HOST}:${PORTA}/mcp`;

const URL_METADATA = URLS_PUBLICAS
  ? URLS_PUBLICAS.metadataUrl
  : urlMetadataRecurso(HOST, PORTA);

const TRUST_PROXY = confiarNoProxy();


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
      // READINESS: processo vivo E inicializado
      // (config OAuth carregada). Não testa IdP/JWKS.
      // ==================================================

      if (
        req.url === "/ready" &&
        req.method === "GET"
      ) {
        res.writeHead(200, {
          "Content-Type": "application/json",
        });
        res.end('{"status":"ready"}');
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
        const ip = ipCliente(req, TRUST_PROXY);

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
 internal:
 http://${HOST}:${PORTA}/mcp
${URLS_PUBLICAS ? ` external:\n ${URLS_PUBLICAS.resourceUrl}\n` : ""}===================================
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
