// ======================================================
// APPROVAL STORE (API)
//
// Duas camadas (ver diagrama):
//   Supabase agent_approvals (durable):
//     id, conversa_id, operation, status, summary,
//     created_at, updated_at, decided_at.
//   Memoria do runtime (volatil):
//     RunState + interruption (nunca vao para HTTP
//     nem para o Supabase).
//
// Status: pending -> approved | rejected | expired.
// One-time: consumir remove da memoria atomicamente;
// a linha passa a approved/rejected nesse momento.
// Pendentes no arranque passam a expired (RunState
// perdido no restart).
//
// NOTA: o approvalId (UUID) NÃO é credencial.
// Conhecer o id não autoriza nada: decidir exige
// sempre Authorization: Bearer (ver security.ts).
// ======================================================

import type {
  RunState,
  RunToolApprovalItem,
} from "@openai/agents";

import { supabase } from "../lib/supabase.js";

import type {
  AgentCommerceContext,
} from "../agent/context.js";

import type {
  agente,
} from "../agent/commerce-agent.js";

import type {
  ResumoVendaApi,
  ResumoProdutoApi,
} from "./agent-api.js";

export type OperacaoAprovacao =
  | "criar_venda"
  | "criar_produto";

export type EstadoExecucao = RunState<
  AgentCommerceContext,
  typeof agente
>;

export type StatusAprovacao =
  | "pending"
  | "approved"
  | "rejected"
  | "expired";

export type SummaryAprovacao =
  | ResumoVendaApi
  | ResumoProdutoApi;

export type PendingRuntime = {
  approvalId: string;
  conversaId: number;
  sessionId: string;
  operacao: OperacaoAprovacao;
  estado: EstadoExecucao;
  interruption: RunToolApprovalItem;
  createdAt: number;
};

const pendentes =
  new Map<string, PendingRuntime>();

export function guardarRuntime(
  pendente: PendingRuntime,
): void {
  pendentes.set(
    pendente.approvalId,
    pendente,
  );
}

export function consumirRuntime(
  approvalId: string,
): PendingRuntime | undefined {
  const pendente =
    pendentes.get(approvalId);

  if (!pendente) {
    return undefined;
  }

  pendentes.delete(approvalId);

  return pendente;
}

function temRuntimeParaConversa(
  conversaId: number,
): boolean {
  for (const pendente of pendentes.values()) {
    if (
      pendente.conversaId === conversaId
    ) {
      return true;
    }
  }

  return false;
}


// ======================================================
// SUPABASE agent_approvals
// ======================================================

export async function criarLinhaApproval(
  params: {
    id: string;
    conversaId: number;
    operacao: OperacaoAprovacao;
    summary: SummaryAprovacao;
  },
): Promise<void> {
  const agora = new Date().toISOString();

  const { error } = await supabase
    .from("agent_approvals")
    .insert({
      id: params.id,
      conversa_id: params.conversaId,
      operation: params.operacao,
      status: "pending",
      summary: params.summary,
      created_at: agora,
      updated_at: agora,
    });

  if (error) {
    throw new Error(
      `Erro ao registar approval: ${error.message}`,
    );
  }
}

export async function marcarDecisao(
  id: string,
  status: "approved" | "rejected",
): Promise<void> {
  const agora = new Date().toISOString();

  const { error } = await supabase
    .from("agent_approvals")
    .update({
      status,
      updated_at: agora,
      decided_at: agora,
    })
    .eq("id", id)
    .eq("status", "pending");

  if (error) {
    throw new Error(
      `Erro ao decidir approval: ${error.message}`,
    );
  }
}

async function marcarExpirada(
  id: string,
): Promise<void> {
  const agora = new Date().toISOString();

  const { error } = await supabase
    .from("agent_approvals")
    .update({
      status: "expired",
      updated_at: agora,
      decided_at: agora,
    })
    .eq("id", id)
    .eq("status", "pending");

  if (error) {
    throw new Error(
      `Erro ao expirar approval: ${error.message}`,
    );
  }
}

export async function lerStatus(
  id: string,
): Promise<StatusAprovacao | null> {
  const { data, error } = await supabase
    .from("agent_approvals")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao ler approval: ${error.message}`,
    );
  }

  if (!data) {
    return null;
  }

  return data.status as StatusAprovacao;
}

async function temPendenteNaBase(
  conversaId: number,
): Promise<boolean> {

  const { data, error } = await supabase
    .from("agent_approvals")
    .select("id")
    .eq("conversa_id", conversaId)
    .eq("status", "pending")
    .limit(1);

  if (error) {
    throw new Error(
      `Erro ao verificar pendencias: ${error.message}`,
    );
  }

  return (data ?? []).length > 0;
}


// ======================================================
// OPERACOES COMBINADAS
// ======================================================

// Lock de conversa: runtime OU base (cobre restart
// antes da expiracao de arranque).
export async function existePendenteParaConversa(
  conversaId: number,
): Promise<boolean> {
  if (
    temRuntimeParaConversa(conversaId)
  ) {
    return true;
  }

  return temPendenteNaBase(conversaId);
}

// Sem runtime mas linha pending: RunState perdeu-se
// (restart). Expira a linha; retomar e impossivel.
export async function expirarSeOrfa(
  id: string,
): Promise<boolean> {
  const status = await lerStatus(id);

  if (status !== "pending") {
    return false;
  }

  await marcarExpirada(id);

  return true;
}

// Arranque: nenhum pending antigo pode retomar
// (RunState vivia so em memoria).
export async function expirarPendentesArranque(): Promise<number> {
  const agora = new Date().toISOString();

  const { data, error } = await supabase
    .from("agent_approvals")
    .update({
      status: "expired",
      updated_at: agora,
      decided_at: agora,
    })
    .eq("status", "pending")
    .select("id");

  if (error) {
    throw new Error(
      `Erro ao expirar pendentes: ${error.message}`,
    );
  }

  return (data ?? []).length;
}


// ======================================================
// OWNERSHIP (Fase 6A)
//
// Approval pertence ao utilizador via conversa.
// null = inexistente, de outro, ou legada sem owner.
// Nunca revelar qual dos casos (404 genérico fora).
// ======================================================

export async function obterDonoDaConversaDoApproval(
  approvalId: string,
): Promise<string | null> {
  const { data: linha, error: erroLinha } =
    await supabase
      .from("agent_approvals")
      .select("conversa_id")
      .eq("id", approvalId)
      .maybeSingle();

  if (erroLinha) {
    throw new Error(
      `Erro ao ler approval: ${erroLinha.message}`,
    );
  }

  if (!linha) {
    return null;
  }

  const { data: conversa, error: erroConversa } =
    await supabase
      .from("conversas")
      .select("user_id")
      .eq("id", linha.conversa_id)
      .maybeSingle();

  if (erroConversa) {
    throw new Error(
      `Erro ao ler conversa: ${erroConversa.message}`,
    );
  }

  if (
    !conversa ||
    typeof conversa.user_id !== "string" ||
    conversa.user_id === ""
  ) {
    return null;
  }

  return conversa.user_id;
}
