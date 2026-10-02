import { supabase } from "./supabase";
import {
  AgentApiError,
  type ApiErrorCode,
  type ChatSuccessResponse,
} from "../types/api";

const API_URL = (import.meta.env.VITE_AGENT_API_URL as string | undefined)
  ?.trim()
  .replace(/\/+$/, "");

if (!API_URL) {
  throw new Error(
    "Configuração em falta: defina VITE_AGENT_API_URL em " +
      "frontend/.env.local (ver frontend/.env.example).",
  );
}

type ErrorBody = {
  error?: unknown;
  requestId?: unknown;
};

const CODIGOS_CONHECIDOS: ReadonlySet<string> = new Set([
  "unauthorized",
  "origin_not_allowed",
  "not_found",
  "conversation_not_found",
  "approval_not_found",
  "approval_pending",
  "too_many_requests",
  "payload_too_large",
  "unsupported_media_type",
  "invalid_request",
  "internal_error",
]);

function normalizarCodigo(valor: unknown): ApiErrorCode {
  return typeof valor === "string" && CODIGOS_CONHECIDOS.has(valor)
    ? (valor as ApiErrorCode)
    : "unknown_error";
}

function extrairRetryAfter(valor: string | null): number | null {
  if (!valor) return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function obterAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  // JWT vai só no header Authorization. Nunca em URL, body ou logs.
  return session?.access_token ?? null;
}

async function chamarApi(
  token: string,
  caminho: string,
  corpo: unknown,
): Promise<Response> {
  return fetch(`${API_URL}${caminho}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
  });
}

function erroRede(): AgentApiError {
  // Backend desligado / rede indisponível. Não confundir
  // com erro de autenticação.
  return new AgentApiError(
    0,
    "unknown_error",
    null,
    null,
    "network_error",
  );
}

// Executa a chamada com JWT; em 401 tenta refreshSession UMA
// única vez e repete UMA vez. Sem loops de retry.
async function comAutenticacao(
  caminho: string,
  corpo: unknown,
): Promise<ChatSuccessResponse> {
  const token = await obterAccessToken();
  if (!token) {
    throw new AgentApiError(
      401,
      "unauthorized",
      null,
      null,
      "Sem sessão ativa.",
    );
  }

  let res: Response;
  try {
    res = await chamarApi(token, caminho, corpo);
  } catch {
    throw erroRede();
  }

  if (res.status === 401) {
    const { data } = await supabase.auth.refreshSession();
    const novoToken = data.session?.access_token ?? null;
    if (!novoToken) throw await tratarResposta401(res);
    let segunda: Response;
    try {
      segunda = await chamarApi(novoToken, caminho, corpo);
    } catch {
      throw erroRede();
    }
    if (segunda.status === 401) throw await tratarResposta401(segunda);
    return tratarResposta(segunda);
  }

  return tratarResposta(res);
}

// POST /api/chat. conversationId null = nova conversa.
export async function postChat(
  message: string,
  conversationId: number | null,
): Promise<ChatSuccessResponse> {
  return comAutenticacao(
    "/api/chat",
    conversationId === null
      ? { message }
      : { message, conversationId },
  );
}

export type DecisaoApproval = "approve" | "reject";

// POST /api/approvals/:approvalId. Consumo one-time no backend:
// depois de decidida, a mesma aprovação dá 404.
export async function postDecisaoApproval(
  approvalId: string,
  decision: DecisaoApproval,
): Promise<ChatSuccessResponse> {
  return comAutenticacao(
    `/api/approvals/${encodeURIComponent(approvalId)}`,
    { decision },
  );
}

async function lerResposta(
  res: Response,
): Promise<{ corpo: unknown; requestId: string | null }> {
  let corpo: unknown = null;
  try {
    corpo = await res.json();
  } catch {
    corpo = null;
  }
  const doCorpo =
    typeof corpo === "object" && corpo !== null
      ? (corpo as ErrorBody).requestId
      : null;
  // Preferir body.requestId, senão header X-Request-Id.
  const requestId =
    typeof doCorpo === "string" && doCorpo !== ""
      ? doCorpo
      : (res.headers.get("X-Request-Id") ?? null);
  return { corpo, requestId };
}

function eResumoApproval(valor: unknown): boolean {
  if (typeof valor === "string") return true;
  if (typeof valor !== "object" || valor === null) return false;
  return Object.values(valor).every(
    (v) =>
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean" ||
      v === null,
  );
}
function eSucesso(
  corpo: unknown,
): corpo is ChatSuccessResponse {
  if (typeof corpo !== "object" || corpo === null) return false;
  const r = corpo as Record<string, unknown>;
  if (r["status"] !== "completed" && r["status"] !== "approval_required")
    return false;
  if (typeof r["conversationId"] !== "number") return false;
  if (r["status"] === "completed")
    return typeof r["message"] === "string";
  const approval = r["approval"] as Record<string, unknown> | undefined;
  return (
    typeof approval?.["id"] === "string" &&
    typeof approval?.["operation"] === "string" &&
    eResumoApproval(approval?.["summary"])
  );
}

async function tratarResposta(res: Response): Promise<ChatSuccessResponse> {
  const { corpo, requestId } = await lerResposta(res);

  if (res.ok && eSucesso(corpo)) return corpo;

  const codigo = normalizarCodigo(
    (corpo as ErrorBody | null)?.error,
  );
  throw new AgentApiError(
    res.status,
    codigo,
    requestId,
    extrairRetryAfter(res.headers.get("Retry-After")),
    `Pedido falhou: ${codigo} (HTTP ${res.status})`,
  );
}

async function tratarResposta401(res: Response): Promise<AgentApiError> {
  const { corpo, requestId } = await lerResposta(res);
  const codigo = normalizarCodigo(
    (corpo as ErrorBody | null)?.error,
  );
  return new AgentApiError(
    res.status,
    codigo === "unknown_error" ? "unauthorized" : codigo,
    requestId,
    null,
    "unauthorized",
  );
}

// Renderiza o resumo vindo da API sem inventar dados:
// string tal como veio; objeto como linhas "chave: valor".
export function formatarResumo(
  summary: string | Record<string, string | number | boolean | null>,
): string {
  if (typeof summary === "string") return summary;
  return Object.entries(summary)
    .map(
      ([chave, valor]) =>
        `${chave}: ${valor === null ? "—" : String(valor)}`,
    )
    .join("\n");
}

// Mensagens amigáveis (sem expor detalhe técnico nem stack).
// requestId continua disponível em AgentApiError para suporte.
export function mensagemErroAmigavel(erro: unknown): string {
  if (erro instanceof AgentApiError) {
    if (erro.httpStatus === 0)
      return "Não foi possível ligar ao servidor. Verifique se o backend está a correr.";
    // Qualquer 409 bloqueia a conversa: há sempre um approval
    // pendente, mesmo que o código venha desconhecido.
    if (erro.httpStatus === 409)
      return "Existe uma operação pendente de confirmação nesta conversa.";
    switch (erro.code) {
      case "unauthorized":
        return "A sua sessão expirou. Inicie sessão novamente.";
      case "conversation_not_found":
        return "Esta conversa já não existe. Comece uma nova conversa.";
      case "approval_not_found":
        return "Esta operação já foi decidida ou expirou. Comece uma nova conversa.";
      case "approval_pending":
        return "Existe uma operação pendente de confirmação nesta conversa.";
      case "too_many_requests":
        return "Muitos pedidos em pouco tempo. Tente novamente daqui a pouco.";
      case "payload_too_large":
        return "Mensagem demasiado grande.";
      case "origin_not_allowed":
      case "internal_error":
        return "Não foi possível concluir o pedido. Tente novamente.";
      default:
        if (erro.httpStatus >= 500)
          return "Não foi possível concluir o pedido. Tente novamente.";
        return "Não foi possível concluir o pedido. Tente novamente.";
    }
  }
  return "Ocorreu um erro inesperado. Tente novamente.";
}
