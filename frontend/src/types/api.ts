// Tipos da Agent Commerce API (espelho mínimo do backend).
// O backend responde sempre JSON com requestId nos erros.

export type ChatCompletedResponse = {
  status: "completed";
  conversationId: number;
  message: string;
};

export type ApprovalSummary = {
  id: string;
  operation: string;
  // O backend envia summary como objeto (ex.: {nome, preco,
  // quantidadeInicial, moeda} ou {cliente, produto, ...}).
  summary: string | Record<string, string | number | boolean | null>;
};

export type ChatApprovalRequiredResponse = {
  status: "approval_required";
  conversationId: number;
  approval: ApprovalSummary;
};

export type ChatSuccessResponse =
  | ChatCompletedResponse
  | ChatApprovalRequiredResponse;

export type ApiErrorCode =
  | "unauthorized"
  | "origin_not_allowed"
  | "not_found"
  | "conversation_not_found"
  | "approval_not_found"
  | "approval_pending"
  | "too_many_requests"
  | "payload_too_large"
  | "unsupported_media_type"
  | "invalid_request"
  | "internal_error"
  | "unknown_error";

// Erro próprio do API client: HTTP status + código + requestId.
export class AgentApiError extends Error {
  readonly httpStatus: number;
  readonly code: ApiErrorCode;
  readonly requestId: string | null;
  readonly retryAfterSeg: number | null;

  constructor(
    httpStatus: number,
    code: ApiErrorCode,
    requestId: string | null,
    retryAfterSeg: number | null,
    message: string,
  ) {
    super(message);
    this.name = "AgentApiError";
    this.httpStatus = httpStatus;
    this.code = code;
    this.requestId = requestId;
    this.retryAfterSeg = retryAfterSeg;
  }
}
