import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

import { homedir, tmpdir } from "node:os";

import { join } from "node:path";


// ======================================================
// TOKEN STORE LOCAL (DEV ONLY — plaintext)
//
// Guarda OAuth tokens fora do repositório. NÃO é seguro
// para produção (usar Credential Manager/Keychain).
// ======================================================

function pastaBase(): string {
  const localAppData =
    process.env.LOCALAPPDATA;

  if (
    typeof localAppData === "string" &&
    localAppData !== ""
  ) {
    return join(localAppData, "agent-commerce", "oauth");
  }

  return join(homedir(), ".agent-commerce", "oauth");
}


function caminhoTokens(): string {
  return join(pastaBase(), "commercial-policies.json");
}


export function guardarTokensLocais(
  tokens: unknown,
): void {
  mkdirSync(pastaBase(), { recursive: true });

  writeFileSync(
    caminhoTokens(),
    JSON.stringify(tokens ?? {}),
    { mode: 0o600 },
  );
}


export function carregarTokensLocais(): unknown | undefined {
  try {
    const conteudo =
      readFileSync(caminhoTokens(), "utf-8");

    const valor: unknown = JSON.parse(conteudo);

    if (
      typeof valor !== "object" ||
      valor === null
    ) {
      return undefined;
    }

    return valor;
  }
  catch {
    return undefined;
  }
}


export function limparTokensLocais(): void {
  try {
    unlinkSync(caminhoTokens());
  }
  catch {
    // Sem tokens guardados: nada a fazer.
  }
}


export function caminhoStoreParaDiagnostico(): string {
  return caminhoTokens();
}
