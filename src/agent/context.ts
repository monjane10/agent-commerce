import type { RunContext } from "@openai/agents";

import type { AgentState } from "../state/agent-state.js";

import { atualizarEstado } from "../state/agent-state.js";


export type AgentCommerceContext = {
  conversaId: number;
  estado: AgentState;
};


export type DadosVendaAprovacao = {
  cliente_id?: number;
  produto_id?: number;
  quantidade?: number;
  metodo_pagamento?: string;
};


export type ResumoVendaAprovacao = {
  clienteNome: string;
  produtoNome: string;
  quantidade: number;
  metodoPagamento: string;
  precoUnitario: number | null;
  moeda: string;
  total: number | null;
};


export function vendaEmCurso(
  estado: AgentState,
): boolean {
  if (
    estado.operacao !==
    "criar_venda"
  ) {
    return false;
  }


  return ![
    "idle",
    "concluida",
    "erro",
    "cancelada",
  ].includes(
    estado.status,
  );
}


export async function atualizarEstadoContexto(
  runContext:
    RunContext<AgentCommerceContext> | undefined,

  dados: Partial<
    Omit<
      AgentState,
      "conversa_id" | "updated_at"
    >
  >,
): Promise<AgentState | null> {
  if (!runContext) {
    return null;
  }


  const novoEstado =
    await atualizarEstado(
      runContext.context.conversaId,
      dados,
    );


  runContext.context.estado =
    novoEstado;


  return novoEstado;
}
