// ======================================================
// APPROVAL STORE (API v1 — em memória)
//
// approvalId (randomUUID) -> PendingApproval.
// One-time: consumir remove atomicamente do Map.
// RunState/interruption nunca saem para HTTP.
// ======================================================

import type {
  RunState,
  RunToolApprovalItem,
} from "@openai/agents";

import type {
  AgentCommerceContext,
} from "../agent/context.js";

import type {
  agente,
} from "../agent/commerce-agent.js";

export type OperacaoAprovacao =
  | "criar_venda"
  | "criar_produto";

export type EstadoExecucao = RunState<
  AgentCommerceContext,
  typeof agente
>;

export type PendingApproval = {
  approvalId: string;
  conversaId: number;
  sessionId: string;
  operacao: OperacaoAprovacao;
  estado: EstadoExecucao;
  interruption: RunToolApprovalItem;
  createdAt: number;
};

const pendentes =
  new Map<string, PendingApproval>();

export function guardarApproval(
  pendente: PendingApproval,
): void {
  pendentes.set(
    pendente.approvalId,
    pendente,
  );
}

export function consumirApproval(
  approvalId: string,
): PendingApproval | undefined {
  const pendente =
    pendentes.get(approvalId);

  if (!pendente) {
    return undefined;
  }

  pendentes.delete(approvalId);

  return pendente;
}

export function existeApprovalParaConversa(
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
