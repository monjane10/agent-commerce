import { supabase } from "../lib/supabase.js";


export type AgentState = {
  conversa_id: number;

  operacao: string | null;

  status: string;

  cliente_id: number | null;
  cliente_nome: string | null;

  produto_id: number | null;
  produto_nome: string | null;

  quantidade: number | null;

  metodo_pagamento: string | null;

  updated_at: string;
};


// ======================================================
// CRIAR ESTADO INICIAL
// ======================================================

export async function criarEstadoInicial(
  conversaId: number,
) {
  const { data, error } = await supabase
    .from("agent_state")
    .insert({
      conversa_id: conversaId,
      status: "idle",
    })
    .select()
    .single();


  if (error) {
    throw new Error(
      `Erro ao criar estado: ${error.message}`,
    );
  }


  return data;
}


// ======================================================
// OBTER ESTADO
// ======================================================

export async function obterEstado(
  conversaId: number,
): Promise<AgentState | null> {

  const { data, error } = await supabase
    .from("agent_state")
    .select("*")
    .eq(
      "conversa_id",
      conversaId,
    )
    .maybeSingle();


  if (error) {
    throw new Error(
      `Erro ao obter estado: ${error.message}`,
    );
  }


  return data;
}


// ======================================================
// ATUALIZAR ESTADO
// ======================================================

export async function atualizarEstado(
  conversaId: number,
  dados: Partial<
    Omit<
      AgentState,
      "conversa_id" | "updated_at"
    >
  >,
) {

  const { data, error } = await supabase
    .from("agent_state")
    .update({
      ...dados,

      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "conversa_id",
      conversaId,
    )
    .select()
    .single();


  if (error) {
    throw new Error(
      `Erro ao atualizar estado: ${error.message}`,
    );
  }


  return data;
}