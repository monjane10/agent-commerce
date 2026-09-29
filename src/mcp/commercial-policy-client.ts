import { MCPServerStdio } from "@openai/agents";


// ======================================================
// CLIENTE MCP — POLÍTICAS COMERCIAIS
//
// Servidor local via stdio, somente leitura.
// Lifecycle de aplicação: connect no arranque,
// close no encerramento (ver src/cli/main.ts).
// ======================================================

export const servidorPoliticasMCP =
  new MCPServerStdio({
    name: "politicas-comerciais",

    command: process.execPath,

    args: [
      "--import",
      "tsx",
      "src/mcp/commercial-policy-server.ts",
    ],

    cwd: process.cwd(),
  });


export async function conectarPoliticasMCP(): Promise<void> {
  try {
    await servidorPoliticasMCP.connect();

    console.log(
      "MCP politicas-comerciais conectado.",
    );
  }
  catch (erro) {
    console.error(
      "Erro técnico: não foi possível iniciar o servidor MCP politicas-comerciais.",
    );

    console.error(
      erro,
    );

    throw new Error(
      "MCP politicas-comerciais indisponível.",
    );
  }
}


export async function desconectarPoliticasMCP(): Promise<void> {
  await servidorPoliticasMCP.close();
}
