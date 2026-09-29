import { MCPServerStreamableHttp } from "@openai/agents";

import {
  urlPadraoPoliticas,
} from "./commercial-policy-auth.js";


// ======================================================
// CLIENTE MCP — POLÍTICAS COMERCIAIS (Streamable HTTP)
//
// Servidor independente (npm run mcp:http), somente leitura.
// Envia o access token OAuth via Authorization: Bearer.
// Token obtido fora de banda (variável local, nunca Git).
// authProvider automático não é usado: sem suporte tipado
// para fluxo browser na versão instalada (@openai/agents
// 0.18.0 expõe authProvider apenas como any).
// Sem child process: apenas conecta à URL.
// Lifecycle de aplicação: connect no arranque,
// close no encerramento (ver src/cli/main.ts).
// ======================================================

export const MCP_POLITICAS_HOST = "127.0.0.1";

export const MCP_POLITICAS_PORTA = Number(
  process.env.MCP_COMMERCIAL_POLICY_PORT ?? 3002,
);

export const MCP_POLITICAS_URL =
  process.env.MCP_COMMERCIAL_POLICY_URL ??
  urlPadraoPoliticas(MCP_POLITICAS_HOST, MCP_POLITICAS_PORTA);


function lerAccessToken(): string {
  const token =
    process.env.MCP_COMMERCIAL_POLICY_ACCESS_TOKEN;

  if (
    typeof token !== "string" ||
    token.trim() === ""
  ) {
    throw new Error(
      "MCP_COMMERCIAL_POLICY_ACCESS_TOKEN não configurado.",
    );
  }

  return token;
}


function criarServidorPoliticasMCP(): MCPServerStreamableHttp {
  // Fail-fast: sem access token não há conexão.
  const token = lerAccessToken();

  return new MCPServerStreamableHttp({
    name: "commercial-policies",

    url: MCP_POLITICAS_URL,

    cacheToolsList: true,

    requestInit: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}


export const servidorPoliticasMCP =
  criarServidorPoliticasMCP();


export async function conectarPoliticasMCP(): Promise<void> {
  try {
    await servidorPoliticasMCP.connect();

    console.log(
      `MCP commercial-policies conectado via Streamable HTTP (${MCP_POLITICAS_URL}).`,
    );
  }
  catch (erro) {
    console.error(
      "Erro técnico: não foi possível conectar ao MCP commercial-policies " +
      `em ${MCP_POLITICAS_URL}. Verifica se o servidor está rodando (npm run mcp:http).`,
    );

    console.error(
      erro,
    );

    throw new Error(
      "MCP commercial-policies indisponível.",
    );
  }
}


export async function desconectarPoliticasMCP(): Promise<void> {
  await servidorPoliticasMCP.close();
}
