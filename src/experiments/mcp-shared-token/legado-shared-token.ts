// ======================================================
// LEGADO Fase 3A — shared Bearer token (referência)
//
// Movido para aqui quando o caminho principal passou a
// OAuth Resource Server (Fase 3B). NÃO usar em produção.
// Bearer partilhado não substitui OAuth para deployment
// público. Mantido apenas como referência local.
// ======================================================

import {
  createHash,
  timingSafeEqual,
} from "node:crypto";


export function lerTokenPoliticasLegado(): string {
  const token =
    process.env.MCP_COMMERCIAL_POLICY_TOKEN;

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


export function compararTokensLegado(
  recebido: unknown,
  esperado: string,
): boolean {
  if (
    typeof recebido !== "string" ||
    recebido === ""
  ) {
    return false;
  }

  const resumoRecebido = createHash("sha256")
    .update(recebido, "utf-8")
    .digest();

  const resumoEsperado = createHash("sha256")
    .update(esperado, "utf-8")
    .digest();

  return timingSafeEqual(
    resumoRecebido,
    resumoEsperado,
  );
}
