import { spawn } from "node:child_process";

import { randomBytes } from "node:crypto";

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import {
  auth,
  UnauthorizedError,
  type OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";

import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

import {
  guardarTokensLocais,
  carregarTokensLocais,
  limparTokensLocais,
} from "./oauth-token-store.js";

import {
  urlServidorMCP,
} from "./commercial-policy-auth.js";


// ======================================================
// OAUTH CLIENT (Authorization Code + PKCE S256)
//
// Public client (sem secret). O SDK gera PKCE/state;
// este módulo fornece storage, callback local, browser
// e orquestração. Fluxo pesado fica no MCP SDK.
// ======================================================

export const OAUTH_SCOPE_PADRAO = "policies:read";

export const OAUTH_REDIRECT_PADRAO =
  "http://127.0.0.1:38123/oauth/callback";

export const OAUTH_CALLBACK_TIMEOUT_MS = 120000;


export type ConfigOAuthClient = {
  clientId: string;
  redirectUri: string;
  resourceUrl: string;
  scope: string;
  abrirBrowser: boolean;
};


export function lerConfigOAuthClient(): ConfigOAuthClient {
  const clientId =
    process.env.MCP_OAUTH_CLIENT_ID;

  if (
    typeof clientId !== "string" ||
    clientId.trim() === ""
  ) {
    throw new Error(
      "MCP_OAUTH_CLIENT_ID não configurado.",
    );
  }

  const redirectUri =
    process.env.MCP_OAUTH_REDIRECT_URI ??
    OAUTH_REDIRECT_PADRAO;

  const resourceUrl =
    process.env.MCP_OAUTH_RESOURCE ??
    urlServidorMCP();

  return {
    clientId: clientId.trim(),
    redirectUri,
    resourceUrl,
    scope:
      process.env.MCP_OAUTH_SCOPE ??
      OAUTH_SCOPE_PADRAO,
    abrirBrowser:
      process.env.MCP_OAUTH_NO_BROWSER !== "1",
  };
}


export type ResultadoCallback =
  | { tipo: "codigo"; code: string; state: string }
  | { tipo: "erro"; erro: string; descricao: string }
  | { tipo: "timeout" };


export function iniciarCallbackOAuth(
  redirectUri: string,
  timeoutMs: number = OAUTH_CALLBACK_TIMEOUT_MS,
): {
  aguardar: () => Promise<ResultadoCallback>;
  fechar: () => Promise<void>;
} {
  const url = new URL(redirectUri);

  let resolver: ((r: ResultadoCallback) => void) | null = null;

  const promessa = new Promise<ResultadoCallback>(
    (resolve) => {
      resolver = resolve;
    },
  );

  const temporizador = setTimeout(() => {
    if (resolver) {
      const f = resolver;
      resolver = null;
      f({ tipo: "timeout" });
    }
  }, timeoutMs);

  temporizador.unref?.();

  const servidor = createServer(
    (
      req: IncomingMessage,
      res: ServerResponse,
    ) => {
      try {
        if (
          req.method !== "GET" ||
          !req.url?.startsWith(url.pathname)
        ) {
          res.writeHead(404);
          res.end();
          return;
        }

        const params = new URL(
          req.url,
          "http://127.0.0.1",
        ).searchParams;

        const erro = params.get("error");

        if (erro) {
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
          });
          res.end(
            "<html><body><h1>Autenticação cancelada.</h1><p>Podes fechar esta janela.</p></body></html>",
          );

          if (resolver) {
            const f = resolver;
            resolver = null;
            clearTimeout(temporizador);
            f({
              tipo: "erro",
              erro,
              descricao: params.get("error_description") ?? "",
            });
          }

          return;
        }

        const code = params.get("code") ?? "";
        const state = params.get("state") ?? "";

        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
        });
        res.end(
          "<html><body><h1>Autenticação concluída.</h1><p>Podes fechar esta janela e voltar ao terminal.</p></body></html>",
        );

        if (resolver) {
          const f = resolver;
          resolver = null;
          clearTimeout(temporizador);
          f({ tipo: "codigo", code, state });
        }
      }
      catch {
        if (!res.headersSent) {
          res.writeHead(400);
        }
        res.end();
      }
    },
  );

  const porta = Number(url.port || "80");

  const promessaEscuta = new Promise<void>(
    (resolve, reject) => {
      servidor.once("error", (erro: unknown) => {
        if (
          typeof erro === "object" &&
          erro !== null &&
          "code" in erro &&
          (erro as Record<string, unknown>)["code"] ===
            "EADDRINUSE"
        ) {
          reject(
            new Error(
              `Porta do callback OAuth ocupada (${url.port}): outra execução aberta?`,
            ),
          );

          return;
        }

        reject(erro);
      });
      servidor.listen(porta, "127.0.0.1", () => resolve());
    },
  );

  return {
    aguardar: async () => {
      await promessaEscuta;
      return promessa;
    },
    fechar: async () => {
      clearTimeout(temporizador);
      await new Promise<void>((resolve) => {
        servidor.close(() => resolve());
      });
    },
  };
}


// Erros TLS locais (ex. CA interna do Caddy ainda não
// confiada pelo Node). Nunca contornar: orientar o fix.
function eErroTls(erro: unknown): boolean {
  if (
    typeof erro !== "object" ||
    erro === null
  ) {
    return false;
  }

  const codigo =
    "code" in erro
      ? (erro as Record<string, unknown>)["code"]
      : undefined;

  const causa =
    "cause" in erro
      ? (erro as Record<string, unknown>)["cause"]
      : undefined;

  const codigos = [
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "CERT_HAS_EXPIRED",
    "ERR_TLS_CERT_ALTNAME_INVALID",
  ];

  if (
    typeof codigo === "string" &&
    codigos.includes(codigo)
  ) {
    return true;
  }

  return typeof causa === "object" &&
    causa !== null &&
    typeof (causa as Record<string, unknown>)["code"] ===
      "string" &&
    codigos.includes(
      (causa as Record<string, unknown>)["code"] as string,
    );
}


function orientarTls(): void {
  console.error(
    "TLS não confiável: o Node não reconhece o certificado local. " +
    "Executa `caddy trust` e define NODE_EXTRA_CA_CERTS para o " +
    "certificado raiz do Caddy. Nunca desative a validação TLS.",
  );
}


// Constrói argv seguro para abrir o browser (sem shell).
export function argvAbrirBrowser(
  url: URL,
): string[] | null {
  if (
    url.protocol !== "http:" &&
    url.protocol !== "https:"
  ) {
    return null;
  }

  if (process.platform === "win32") {
    return [
      process.env.ComSpec ?? "cmd.exe",
      "/c",
      "start",
      "",
      url.toString(),
    ];
  }

  if (process.platform === "darwin") {
    return ["open", url.toString()];
  }

  return ["xdg-open", url.toString()];
}


export class CommercialPolicyOAuthProvider
  implements OAuthClientProvider
{
  private verificador?: string;

  ultimoState?: string;

  ultimaUrlAutorizacao?: URL;

  constructor(
    readonly config: ConfigOAuthClient,
  ) {}

  get redirectUrl(): string {
    return this.config.redirectUri;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.config.redirectUri],
      grant_types: [
        "authorization_code",
        "refresh_token",
      ],
      response_types: ["code"],
      scope: this.config.scope,
      client_name: "Agent Commerce CLI",
    };
  }

  gerarState(): string {
    const state = randomBytes(16).toString("hex");
    this.ultimoState = state;
    return state;
  }

  state(): string {
    return this.gerarState();
  }

  async clientInformation(): Promise<OAuthClientInformationMixed> {
    return {
      client_id: this.config.clientId,
    } as OAuthClientInformationMixed;
  }

  tokens(): OAuthTokens | undefined {
    const bruto = carregarTokensLocais();

    if (
      typeof bruto !== "object" ||
      bruto === null
    ) {
      return undefined;
    }

    const reg = bruto as Record<string, unknown>;

    if (typeof reg["access_token"] !== "string") {
      return undefined;
    }

    const tokens: OAuthTokens = {
      access_token: reg["access_token"] as string,
      token_type: "Bearer",
    };

    if (typeof reg["refresh_token"] === "string") {
      tokens.refresh_token = reg["refresh_token"] as string;
    }

    if (typeof reg["expires_in"] === "number") {
      tokens.expires_in = reg["expires_in"] as number;
    }

    if (typeof reg["scope"] === "string") {
      tokens.scope = reg["scope"] as string;
    }

    return tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    console.log("[OAuth] token obtained");
    guardarTokensLocais(tokens);
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    this.ultimaUrlAutorizacao = url;
    console.log("[OAuth] authorization required");

    if (!this.config.abrirBrowser) {
      console.log(
        "Abra esta URL no navegador para continuar a autenticação:",
      );
      console.log(url.toString());
      return;
    }

    const argv = argvAbrirBrowser(url);

    if (!argv) {
      console.log(
        "Abra esta URL no navegador para continuar a autenticação:",
      );
      console.log(url.toString());
      return;
    }

    const [cmd, ...args] = argv;

    if (!cmd) {
      console.log(url.toString());
      return;
    }

    const filho = spawn(cmd, args, {
      detached: true,
      stdio: "ignore",
    });

    filho.unref();
  }

  async saveCodeVerifier(v: string): Promise<void> {
    this.verificador = v;
  }

  async codeVerifier(): Promise<string> {
    if (!this.verificador) {
      throw new Error(
        "PKCE verifier indisponível.",
      );
    }

    return this.verificador;
  }

  async validateResourceURL(
    serverUrl: string | URL,
  ): Promise<URL | undefined> {
    const atual = new URL(serverUrl.toString());
    const esperado = new URL(this.config.resourceUrl);

    if (
      atual.origin === esperado.origin &&
      atual.pathname === esperado.pathname
    ) {
      return new URL(this.config.resourceUrl);
    }

    return undefined;
  }

  async invalidateCredentials(): Promise<void> {
    limparTokensLocais();
  }
}


export function criarOAuthProvider(): CommercialPolicyOAuthProvider {
  return new CommercialPolicyOAuthProvider(
    lerConfigOAuthClient(),
  );
}


// ======================================================
// ORQUESTRADOR DE LOGIN
// ======================================================

export async function executarLoginOAuth(
  provider: CommercialPolicyOAuthProvider,
  serverUrl: string,
  timeoutMs: number = OAUTH_CALLBACK_TIMEOUT_MS,
): Promise<void> {
  const callback = iniciarCallbackOAuth(
    provider.config.redirectUri,
    timeoutMs,
  );

  try {
    await executarLoginOAuthInterno(
      provider,
      serverUrl,
      callback,
    );
  }
  catch (erro) {
    if (eErroTls(erro)) {
      orientarTls();
    }

    throw erro;
  }
  finally {
    await callback.fechar();
  }
}


async function executarLoginOAuthInterno(
  provider: CommercialPolicyOAuthProvider,
  serverUrl: string,
  callback: {
    aguardar: () => Promise<ResultadoCallback>;
  },
): Promise<void> {
  try {
    const resultado = await auth(provider, { serverUrl });

    if (resultado === "AUTHORIZED") {
      return;
    }
  }
  catch (erro) {
    // Falha fora do fluxo interativo (ex. refresh com
    // grant inválido): limpa e tenta uma única vez de novo.
    if (
      !(erro instanceof UnauthorizedError) &&
      provider.tokens() !== undefined
    ) {
      console.log("[OAuth] token inválido, nova autorização");
      await provider.invalidateCredentials();

      const segunda = await auth(provider, { serverUrl });

      if (segunda === "AUTHORIZED") {
        return;
      }
    }
    else {
      throw erro;
    }
  }

  const retorno = await callback.aguardar();

  if (retorno.tipo === "timeout") {
    throw new Error(
      "Autenticação expirou sem callback. Tenta novamente.",
    );
  }

  if (retorno.tipo === "erro") {
    throw new Error(
      "Autenticação cancelada pelo utilizador.",
    );
  }

  if (
    !retorno.code ||
    !retorno.state ||
    retorno.state !== provider.ultimoState
  ) {
    throw new Error(
      "Callback OAuth inválido: state não corresponde.",
    );
  }

  const final = await auth(provider, {
    serverUrl,
    authorizationCode: retorno.code,
  });

  if (final !== "AUTHORIZED") {
    throw new Error(
      "Não foi possível concluir a autenticação.",
    );
  }
}
