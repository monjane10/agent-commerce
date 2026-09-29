import {
  createHash,
  timingSafeEqual,
} from "node:crypto";


// ======================================================
// SEGURANÇA LOCAL MCP (Fase 3A)
//
// Shared Bearer token via env. NÃO substitui OAuth
// para deployment público.
// ======================================================

export const NOME_VAR_TOKEN =
  "MCP_COMMERCIAL_POLICY_TOKEN";

export const RATE_LIMIT_JANELA_MS = 60000;

export const RATE_LIMIT_MAX_POR_IP = 60;


export function urlPadraoPoliticas(
  host: string,
  porta: number,
): string {
  return `http://${host}:${porta}/mcp`;
}


export function lerTokenPoliticas(): string {
  const token =
    process.env[NOME_VAR_TOKEN];

  if (
    typeof token !== "string" ||
    token.trim() === ""
  ) {
    throw new Error(
      "MCP_COMMERCIAL_POLICY_TOKEN não configurado.",
    );
  }

  return token;
}


function resumo(
  valor: string,
): Buffer {
  return createHash("sha256")
    .update(valor, "utf-8")
    .digest();
}


export function compararTokens(
  recebido: unknown,
  esperado: string,
): boolean {
  if (
    typeof recebido !== "string" ||
    recebido === ""
  ) {
    return false;
  }

  return timingSafeEqual(
    resumo(recebido),
    resumo(esperado),
  );
}


export function extrairBearer(
  cabecalho: unknown,
): string | null {
  if (
    typeof cabecalho !== "string"
  ) {
    return null;
  }

  const partes =
    cabecalho.split(" ");

  if (
    partes.length !== 2 ||
    partes[0]?.toLowerCase() !== "bearer"
  ) {
    return null;
  }

  const token = partes[1]?.trim() ?? "";

  return token === ""
    ? null
    : token;
}


type EntradaLimite = {
  contador: number;
  expiraEm: number;
};


export function criarLimitador(
  janelaMs: number,
  maximo: number,
): (chave: string) => boolean {
  const acessos =
    new Map<string, EntradaLimite>();

  return (chave: string): boolean => {
    const agora = Date.now();

    if (acessos.size > 1000) {
      for (const [k, v] of acessos) {
        if (v.expiraEm <= agora) {
          acessos.delete(k);
        }
      }
    }

    const entrada =
      acessos.get(chave);

    if (
      !entrada ||
      entrada.expiraEm <= agora
    ) {
      acessos.set(chave, {
        contador: 1,
        expiraEm: agora + janelaMs,
      });

      return true;
    }

    if (entrada.contador >= maximo) {
      return false;
    }

    entrada.contador += 1;

    return true;
  };
}
