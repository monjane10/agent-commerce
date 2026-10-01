import { MCPServerStreamableHttp } from "@openai/agents";

import {
  urlServidorMCP,
} from "./commercial-policy-auth.js";

import {
  criarOAuthProvider,
  executarLoginOAuth,
} from "./oauth-provider.js";


// ======================================================
// CLIENTE MCP — POLÍTICAS COMERCIAIS (Streamable HTTP)
//
// Servidor independente (npm run mcp:http), somente leitura.
// OAuth Authorization Code + PKCE via authProvider nativo.
// Sem child process: apenas conecta à URL.
// Lifecycle de aplicação: connect no arranque,
// close no encerramento (ver src/cli/main.ts).
// ======================================================

export const MCP_POLITICAS_HOST = "127.0.0.1";

export const MCP_POLITICAS_PORTA = Number(
  process.env.MCP_COMMERCIAL_POLICY_PORT ?? 3002,
);

export const MCP_POLITICAS_URL = (() => {
  try {
    return urlServidorMCP();
  }
  catch (erro) {
    console.error(
      erro instanceof Error ? erro.message : erro,
    );

    process.exit(1);
  }
})();


function mensagemErroSegura(
  erro: unknown,
): string {
  if (
    erro instanceof Error &&
    erro.message.trim() !== ""
  ) {
    return erro.message;
  }

  if (
    typeof erro === "string" &&
    erro.trim() !== ""
  ) {
    return erro;
  }

  return "falha desconhecida na conexão MCP";
}


const provedorOAuth = criarOAuthProvider();


export function obterProvedorOAuth(): typeof provedorOAuth {
  return provedorOAuth;
}


export const servidorPoliticasMCP =
  new MCPServerStreamableHttp({
    name: "commercial-policies",

    url: MCP_POLITICAS_URL,

    cacheToolsList: true,

    // Boundary único com o campo `any` do SDK 0.18.0:
    // o objeto entregue implementa OAuthClientProvider
    // tipado do MCP SDK 1.31.0.
    authProvider: provedorOAuth,
  });


export async function conectarPoliticasMCP(): Promise<void> {
  try {
    await servidorPoliticasMCP.connect();

    console.log(
      `MCP commercial-policies conectado via Streamable HTTP (${MCP_POLITICAS_URL}).`,
    );

    return;
  }
  catch {
    // Sem token válido: login interativo (uma vez) e retry.
    await executarLoginOAuth(
      provedorOAuth,
      MCP_POLITICAS_URL,
    );

    try {
      await servidorPoliticasMCP.connect();

      console.log(
        `MCP commercial-policies conectado via Streamable HTTP (${MCP_POLITICAS_URL}).`,
      );
    }
    catch (erro) {
      // NOTA: o SDK imprime antes "Error initializing MCP
      // server: object" — é redação de segurança interna
      // dele (getSafeErrorType), não o erro real. O motivo
      // legível vai abaixo, sem secrets.
      console.error(
        "Erro técnico: não foi possível conectar ao MCP commercial-policies " +
        `em ${MCP_POLITICAS_URL}. Verifica se o servidor está rodando (npm run mcp:http).`,
      );

      console.error(
        `Motivo: ${mensagemErroSegura(erro)}`,
      );

      throw new Error(
        "MCP commercial-policies indisponível.",
      );
    }
  }
}


export async function desconectarPoliticasMCP(): Promise<void> {
  await servidorPoliticasMCP.close();
}
