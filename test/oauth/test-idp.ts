// ======================================================
// TEST ONLY — NOT FOR PRODUCTION
//
// Authorization Server mínimo para validar a Fase 4
// (Caddy + HTTPS) localmente. Utilizador simulado:
// auto-aprova sem login real.
//
// Chave RSA gerada em memória no arranque; private key
// nunca vai para disco, Git ou respostas.
// ======================================================

import { createServer } from "node:http";

import {
  generateKeyPairSync,
  createSign,
  createHash,
  createPublicKey,
  randomBytes,
} from "node:crypto";


const HOST = "127.0.0.1";
const PORTA = Number(process.env.OAUTH_TEST_IDP_PORT ?? 4100);
const ISS = `http://${HOST}:${PORTA}`;
const AUD = "https://mcp.localhost/mcp";
const CLIENT_ID = "agent-commerce-cli";
const REDIRECT_OK = "http://127.0.0.1:38123/oauth/callback";
const CODE_TTL_MS = 60000;

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const JWK = {
  ...createPublicKey(
    publicKey.export({ format: "pem", type: "pkcs1" }),
  ).export({ format: "jwk" }),
  kid: "test-1",
  alg: "RS256",
  use: "sig",
};

type CodigoGuardado = {
  challenge: string;
  redirect: string;
  scope: string;
  expiraEm: number;
};

const codigos = new Map<string, CodigoGuardado>();
const refreshes = new Map<string, { scope: string }>();


function b64urlJson(valor: unknown): string {
  return Buffer.from(JSON.stringify(valor), "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


function assinar(payload: Record<string, unknown>): string {
  const head = b64urlJson({ alg: "RS256", typ: "JWT", kid: "test-1" });
  const body = b64urlJson(payload);
  const sign = createSign("RSA-SHA256");
  sign.update(`${head}.${body}`, "utf-8");
  const sig = sign
    .sign(privateKey, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${head}.${body}.${sig}`;
}


function accessToken(scope: string): string {
  const agora = Math.floor(Date.now() / 1000);
  return assinar({
    iss: ISS,
    aud: AUD,
    exp: agora + 600,
    iat: agora,
    scope,
  });
}


function desafioConfere(verifier: string, challenge: string): boolean {
  return (
    createHash("sha256")
      .update(verifier, "utf-8")
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "") === challenge
  );
}


const http = createServer((req, res) => {
  const url = new URL(req.url ?? "/", ISS);
  const json = (code: number, obj: unknown): void => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };

  if (url.pathname === "/jwks" && req.method === "GET") {
    json(200, { keys: [JWK] });
    return;
  }

  if (
    (url.pathname === "/.well-known/oauth-authorization-server" ||
      url.pathname === "/.well-known/openid-configuration") &&
    req.method === "GET"
  ) {
    json(200, {
      issuer: ISS,
      authorization_endpoint: `${ISS}/authorize`,
      token_endpoint: `${ISS}/token`,
      jwks_uri: `${ISS}/jwks`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["policies:read"],
    });
    return;
  }

  if (url.pathname === "/authorize" && req.method === "GET") {
    const q = url.searchParams;
    const redirect = q.get("redirect_uri") ?? "";
    const state = q.get("state") ?? "";

    if (
      q.get("client_id") !== CLIENT_ID ||
      redirect !== REDIRECT_OK ||
      q.get("response_type") !== "code" ||
      q.get("code_challenge_method") !== "S256" ||
      !q.get("code_challenge") ||
      !state
    ) {
      res.writeHead(400);
      res.end("authorize inválido (TEST)");
      return;
    }

    const code = randomBytes(16).toString("hex");
    codigos.set(code, {
      challenge: q.get("code_challenge") ?? "",
      redirect,
      scope: q.get("scope") ?? "policies:read",
      expiraEm: Date.now() + CODE_TTL_MS,
    });

    res.writeHead(302, {
      Location: `${redirect}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    });
    res.end();
    return;
  }

  // Emissão direta (atalho TEST ONLY para variações de teste)
  if (url.pathname === "/token" && req.method === "GET") {
    const q = url.searchParams;
    const agora = Math.floor(Date.now() / 1000);
    const expSeg = Number(q.get("expSeg") ?? "600");
    const head = b64urlJson({ alg: "RS256", typ: "JWT", kid: "test-1" });
    const body = b64urlJson({
      iss: q.get("iss") ?? ISS,
      aud: q.get("aud") ?? AUD,
      exp: agora + expSeg,
      iat: agora,
      scope: q.get("scope") ?? "policies:read",
    });
    const sign = createSign("RSA-SHA256");
    sign.update(`${head}.${body}`, "utf-8");
    const sig = sign
      .sign(privateKey, "base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    json(200, { token: `${head}.${body}.${sig}` });
    return;
  }

  if (url.pathname === "/token" && req.method === "POST") {
    let corpo = "";
    req.on("data", (p: Buffer) => {
      corpo += p.toString("utf-8");
    });
    req.on("end", () => {
      const params = new URLSearchParams(corpo);

      if (params.get("grant_type") === "authorization_code") {
        const code = params.get("code") ?? "";
        const dados = codigos.get(code);
        codigos.delete(code);

        if (
          !dados ||
          dados.expiraEm <= Date.now() ||
          params.get("client_id") !== CLIENT_ID ||
          params.get("redirect_uri") !== dados.redirect ||
          !desafioConfere(
            params.get("code_verifier") ?? "",
            dados.challenge,
          )
        ) {
          json(400, { error: "invalid_grant" });
          return;
        }

        const refresh = randomBytes(16).toString("hex");
        refreshes.set(refresh, { scope: dados.scope });
        json(200, {
          access_token: accessToken(dados.scope),
          token_type: "Bearer",
          expires_in: 600,
          refresh_token: refresh,
          scope: dados.scope,
        });
        return;
      }

      if (params.get("grant_type") === "refresh_token") {
        const refresh = params.get("refresh_token") ?? "";
        const dados = refreshes.get(refresh);
        refreshes.delete(refresh);

        if (!dados) {
          json(400, { error: "invalid_grant" });
          return;
        }

        const novo = randomBytes(16).toString("hex");
        refreshes.set(novo, { scope: dados.scope });
        json(200, {
          access_token: accessToken(dados.scope),
          token_type: "Bearer",
          expires_in: 600,
          refresh_token: novo,
          scope: dados.scope,
        });
        return;
      }

      json(400, { error: "unsupported_grant_type" });
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

http.listen(PORTA, HOST, () => {
  console.log(`Test IdP (TEST ONLY) em ${ISS}`);
});
