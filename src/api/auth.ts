// ======================================================
// AUTH — Supabase JWT (Fase 6A, backend/API apenas)
//
// Utilizador -> Supabase Auth -> access token ->
// Authorization: Bearer <JWT> -> validacao aqui.
//
// Validacao via supabase.auth.getUser(jwt): metodo
// oficial server-side na versao instalada (2.116.0),
// que confirma assinatura/expiracao no Auth server.
// Sem decode manual, sem crypto improvisada.
//
// Retorna so id (+email opcional). JWT nunca vai para
// instructions, trace detalhado ou observabilidade.
// ======================================================

import type {
  IncomingMessage,
} from "node:http";

import { supabase } from "../lib/supabase.js";

export const CABECALHO_WWW_AUTHENTICATE =
  "Bearer";

// Contexto minimo. Sem token, sem password,
// sem userId vindo do body (id vem do Auth).
export type AuthenticatedUser = {
  id: string;
  email?: string;
};

// Só "Authorization: Bearer <token>".
// Query string, body, cookie: rejeitados.
export function extrairBearer(
  cabecalho: unknown,
): string | null {
  if (typeof cabecalho !== "string") {
    return null;
  }

  const partes = cabecalho.split(" ");

  if (partes.length !== 2) {
    return null;
  }

  if (
    partes[0]?.toLowerCase() !== "bearer"
  ) {
    return null;
  }

  const token = partes[1]?.trim() ?? "";

  return token === "" ? null : token;
}

// null = ausente/invalido/expirado (401 genérico
// no HTTP). Nunca logar o token.
export async function autenticarPedido(
  req: IncomingMessage,
  requestId: string,
): Promise<AuthenticatedUser | null> {
  const token = extrairBearer(
    req.headers.authorization,
  );

  if (!token) {
    return null;
  }

  const { data, error } =
    await supabase.auth.getUser(token);

  if (error || !data.user) {
    console.log(
      `[AUTH] request=${requestId} jwt rejeitado: ${
        error?.message ?? "sem utilizador"
      }`,
    );

    return null;
  }

  const utilizador: AuthenticatedUser = {
    id: data.user.id,
  };

  if (
    typeof data.user.email === "string"
  ) {
    utilizador.email = data.user.email;
  }

  return utilizador;
}
