// ======================================================
// SEGURANÇA MCP — OAuth Resource Server (Fase 3B)
//
// Valida JWTs RS256 via JWKS do IdP configurado.
// Bearer shared-secret da Fase 3A foi movido para
// src/experiments/mcp-shared-token/ (legado local).
//
// NÃO substitui OAuth completo para deployment público.
// ======================================================

import {
  createPublicKey,
  createVerify,
  type KeyObject,
} from "node:crypto";

import { isIP } from "node:net";

import type {
  IncomingMessage,
} from "node:http";


export const SCOPE_POLITICAS_LEITURA = "policies:read";

export const RATE_LIMIT_JANELA_MS = 60000;

export const RATE_LIMIT_MAX_POR_IP = 60;

const JWKS_TTL_MS = 300000;


export type ConfigOAuth = {
  issuer: string;
  audience: string;
  jwksUri: string;
};


export function lerConfigOAuth(): ConfigOAuth {
  const issuer =
    process.env.MCP_AUTH_ISSUER;

  const audience =
    process.env.MCP_AUTH_AUDIENCE;

  const jwksUri =
    process.env.MCP_AUTH_JWKS_URI;

  if (
    typeof issuer !== "string" ||
    issuer.trim() === "" ||
    typeof audience !== "string" ||
    audience.trim() === "" ||
    typeof jwksUri !== "string" ||
    jwksUri.trim() === ""
  ) {
    throw new Error(
      "Configuração OAuth incompleta: define MCP_AUTH_ISSUER, MCP_AUTH_AUDIENCE e MCP_AUTH_JWKS_URI.",
    );
  }

  return {
    issuer: issuer.trim(),
    audience: audience.trim(),
    jwksUri: jwksUri.trim(),
  };
}


export function urlPadraoPoliticas(
  host: string,
  porta: number,
): string {
  return `http://${host}:${porta}/mcp`;
}


// URL do servidor MCP usada pelo cliente E pelo OAuth
// (resource): pública validada > explícita > loopback.
// Centraliza para nunca divergirem (audience estrita).
export function urlServidorMCP(): string {
  const publica = lerUrlPublica();

  if (publica) {
    return publica.resourceUrl;
  }

  const explicita =
    process.env.MCP_COMMERCIAL_POLICY_URL;

  if (
    typeof explicita === "string" &&
    explicita.trim() !== ""
  ) {
    return explicita.trim();
  }

  const porta = Number(
    process.env.MCP_COMMERCIAL_POLICY_PORT ?? 3002,
  );

  return `http://127.0.0.1:${porta}/mcp`;
}


export function urlMetadataRecurso(
  host: string,
  porta: number,
): string {
  return `http://${host}:${porta}/.well-known/oauth-protected-resource/mcp`;
}


// ======================================================
// URL PÚBLICA (Fase 4)
//
// MCP_PUBLIC_BASE_URL define o modo HTTPS atrás de proxy.
// Ausente = modo direto interno (http loopback).
// Quando definida exige https: sem credenciais/query/fragment.
// Nunca derivar de Host/X-Forwarded-Host (Host injection).
// ======================================================

export type UrlsPublicas = {
  base: string;
  resourceUrl: string;
  metadataUrl: string;
};


export function lerUrlPublica(): UrlsPublicas | null {
  const base =
    process.env.MCP_PUBLIC_BASE_URL;

  if (
    typeof base !== "string" ||
    base.trim() === ""
  ) {
    return null;
  }

  const normalizada = base.trim().replace(/\/+$/g, "");

  let url: URL;

  try {
    url = new URL(normalizada);
  }
  catch {
    throw new Error(
      "MCP_PUBLIC_BASE_URL inválida.",
    );
  }

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      "MCP_PUBLIC_BASE_URL inválida: usa https sem credenciais, query ou fragmento.",
    );
  }

  return {
    base: url.origin,
    resourceUrl: `${url.origin}/mcp`,
    metadataUrl: `${url.origin}/.well-known/oauth-protected-resource/mcp`,
  };
}


export function confiarNoProxy(): boolean {
  return process.env.MCP_TRUST_PROXY === "1";
}


function eLoopback(ip: string): boolean {
  return ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1";
}


// IP do cliente: socket por padrão; X-Forwarded-For só quando
// trust proxy ativo E a conexão vem do proxy (loopback).
export function ipCliente(
  req: IncomingMessage,
  trustProxy: boolean,
): string {
  const socketIp =
    req.socket.remoteAddress ?? "desconhecido";

  if (
    !trustProxy ||
    !eLoopback(socketIp)
  ) {
    return socketIp;
  }

  const cabecalho = req.headers["x-forwarded-for"];

  const primeiro =
    (Array.isArray(cabecalho) ? cabecalho[0] : cabecalho)
      ?.split(",")[0]
      ?.trim() ?? "";

  return primeiro !== "" && isIP(primeiro) !== 0
    ? primeiro
    : socketIp;
}


export function metadataRecursoProtegido(
  resource: string,
  issuer: string,
): Record<string, unknown> {
  return {
    resource,
    authorization_servers: [issuer],
    scopes_supported: [SCOPE_POLITICAS_LEITURA],
    bearer_methods_supported: ["header"],
  };
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


function base64UrlParaJson(
  parte: string,
): Record<string, unknown> | null {
  try {
    const normalizada = parte
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const completada =
      normalizada +
      "=".repeat((4 - (normalizada.length % 4)) % 4);

    const valor: unknown = JSON.parse(
      Buffer.from(completada, "base64").toString("utf-8"),
    );

    if (
      typeof valor !== "object" ||
      valor === null
    ) {
      return null;
    }

    return valor as Record<string, unknown>;
  }
  catch {
    return null;
  }
}


type JwksCache = {
  chaves: Array<{
    kid: string | null;
    jwk: Record<string, unknown>;
  }>;
  expiraEm: number;
};

let cacheJwks: JwksCache | null = null;


async function obterChaves(
  jwksUri: string,
): Promise<JwksCache["chaves"]> {
  const agora = Date.now();

  if (
    cacheJwks &&
    cacheJwks.expiraEm > agora
  ) {
    return cacheJwks.chaves;
  }

  const resposta = await fetch(jwksUri);

  if (!resposta.ok) {
    throw new Error(
      "JWKS indisponível.",
    );
  }

  const corpo: unknown =
    await resposta.json();

  if (
    typeof corpo !== "object" ||
    corpo === null ||
    !("keys" in corpo) ||
    !Array.isArray(
      (corpo as Record<string, unknown>)["keys"],
    )
  ) {
    throw new Error(
      "JWKS inválido.",
    );
  }

  const chaves = (
    (corpo as Record<string, unknown>)["keys"] as unknown[]
  )
    .filter(
      (k): k is Record<string, unknown> =>
        typeof k === "object" &&
        k !== null &&
        (k as Record<string, unknown>)["kty"] === "RSA",
    )
    .map((k) => ({
      kid:
        typeof k["kid"] === "string"
          ? k["kid"]
          : null,
      jwk: k,
    }));

  cacheJwks = {
    chaves,
    expiraEm: agora + JWKS_TTL_MS,
  };

  return chaves;
}


function audAceita(
  aud: unknown,
  audience: string,
): boolean {
  if (typeof aud === "string") {
    return aud === audience;
  }

  if (Array.isArray(aud)) {
    return aud.some((a) => a === audience);
  }

  return false;
}


function recursoAceite(
  payload: Record<string, unknown>,
  audience: string,
): boolean {
  if (audAceita(payload["aud"], audience)) {
    return true;
  }

  const resource = payload["resource"];

  return typeof resource === "string" &&
    resource === audience;
}


function escopos(
  payload: Record<string, unknown>,
): string[] {
  const scope = payload["scope"];

  if (typeof scope !== "string") {
    return [];
  }

  return scope.split(" ").filter((s) => s !== "");
}


export type ResultadoVerificacao =
  | { ok: true; scopes: string[] }
  | { ok: false; estado: 401 | 403 };


export async function verificarTokenAcesso(
  token: string | null,
  config: ConfigOAuth,
): Promise<ResultadoVerificacao> {
  if (!token) {
    return { ok: false, estado: 401 };
  }

  const partes = token.split(".");

  if (partes.length !== 3) {
    return { ok: false, estado: 401 };
  }

  const cabecalho = base64UrlParaJson(partes[0] ?? "");
  const payload = base64UrlParaJson(partes[1] ?? "");
  const assinatura = partes[2] ?? "";

  if (!cabecalho || !payload || assinatura === "") {
    return { ok: false, estado: 401 };
  }

  if (cabecalho["alg"] !== "RS256") {
    return { ok: false, estado: 401 };
  }

  if (payload["iss"] !== config.issuer) {
    return { ok: false, estado: 401 };
  }

  if (!recursoAceite(payload, config.audience)) {
    return { ok: false, estado: 401 };
  }

  const agoraSeg = Math.floor(Date.now() / 1000);

  const exp = payload["exp"];
  const nbf = payload["nbf"];

  if (
    typeof exp !== "number" ||
    !(exp > agoraSeg)
  ) {
    return { ok: false, estado: 401 };
  }

  if (
    typeof nbf === "number" &&
    !(agoraSeg >= nbf)
  ) {
    return { ok: false, estado: 401 };
  }

  let chaves;
  try {
    chaves = await obterChaves(config.jwksUri);
  }
  catch {
    return { ok: false, estado: 401 };
  }

  const kid =
    typeof cabecalho["kid"] === "string"
      ? cabecalho["kid"]
      : null;

  const candidatas = kid
    ? chaves.filter((c) => c.kid === kid)
    : chaves;

  if (candidatas.length === 0) {
    return { ok: false, estado: 401 };
  }

  const assinado = `${partes[0]}.${partes[1]}`;

  let assinaturaOk = false;

  for (const candidata of candidatas) {
    try {
      const chave: KeyObject = createPublicKey({
        key: candidata.jwk,
        format: "jwk",
      });

      const verificador = createVerify("RSA-SHA256");
      verificador.update(assinado, "utf-8");

      const normalizada = assinatura
        .replace(/-/g, "+")
        .replace(/_/g, "/");

      const completada =
        normalizada +
        "=".repeat((4 - (normalizada.length % 4)) % 4);

      if (
        verificador.verify(
          chave,
          Buffer.from(completada, "base64"),
        )
      ) {
        assinaturaOk = true;
        break;
      }
    }
    catch {
      continue;
    }
  }

  if (!assinaturaOk) {
    return { ok: false, estado: 401 };
  }

  const lista = escopos(payload);

  if (!lista.includes(SCOPE_POLITICAS_LEITURA)) {
    return { ok: false, estado: 403 };
  }

  return { ok: true, scopes: lista };
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
