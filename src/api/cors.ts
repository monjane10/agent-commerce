// ======================================================
// CORS — browser readiness (Fase 6C)
//
// CORS É POLÍTICA DE BROWSER, NÃO AUTENTICAÇÃO.
// Não substitui JWT, ownership, rate limit ou
// validação de input (todos permanecem).
//
// - Uma origin exata via AGENT_FRONTEND_ORIGIN
//   (ex.: http://localhost:5173). Sem wildcard,
//   sem startsWith/includes.
// - Ausente = CORS desativado: server-to-server e
//   PowerShell (sem Origin) continuam; browser não
//   recebe headers CORS.
// - Sem Allow-Credentials: frontend usa
//   Authorization: Bearer <JWT>, sem cookies.
// - Preflight OPTIONS: 204 sem auth/rate-limit.
// ======================================================

import type {
  IncomingMessage,
} from "node:http";

export type ConfigCors = {
  origem: string;
};

export function lerConfigCors():
  | ConfigCors
  | null {
  const bruta =
    process.env.AGENT_FRONTEND_ORIGIN;

  if (
    typeof bruta !== "string" ||
    bruta.trim() === ""
  ) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(bruta.trim());
  } catch {
    throw new Error(
      "AGENT_FRONTEND_ORIGIN inválida.",
    );
  }

  if (
    url.protocol !== "http:" &&
    url.protocol !== "https:"
  ) {
    throw new Error(
      "AGENT_FRONTEND_ORIGIN inválida.",
    );
  }

  // Normaliza para origin (scheme+host+porta):
  // host em minúsculas, sem path/query/fragmento.
  return { origem: url.origin };
}

export function lerOriginPedido(
  req: IncomingMessage,
): string | null {
  const bruta = req.headers.origin;

  if (typeof bruta !== "string") {
    return null;
  }

  const normalizada = bruta.trim();

  return normalizada === ""
    ? null
    : normalizada;
}

// Comparação exata com a configurada.
// Devolve a origin a espelhar, ou null.
export function origemEspelho(
  req: IncomingMessage,
  config: ConfigCors | null,
): string | null {
  if (!config) {
    return null;
  }

  const pedida = lerOriginPedido(req);

  if (!pedida) {
    return null;
  }

  return pedida === config.origem
    ? pedida
    : null;
}

export function cabecalhosCors(
  origem: string,
  preflight: boolean,
): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Origin": origem,
    Vary: "Origin",
    "Access-Control-Expose-Headers":
      "X-Request-Id",
  };

  if (!preflight) {
    return base;
  }

  return {
    ...base,
    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
  };
}
