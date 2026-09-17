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
// CRIAR OU OBTER ESTADO INICIAL
// ======================================================

export async function criarEstadoInicial(
  conversaId: number,
): Promise<AgentState> {

  // Primeiro verificamos se já existe
  const {
    data: estadoExistente,
    error: erroBusca,
  } = await supabase
    .from("agent_state")
    .select("*")
    .eq("conversa_id", conversaId)
    .maybeSingle();


  if (erroBusca) {
    throw new Error(
      `Erro ao verificar estado: ${erroBusca.message}`,
    );
  }


  // Se já existe, não criamos novamente
  if (estadoExistente) {
    return estadoExistente;
  }


  // Só cria se ainda não existir
  const { data, error } = await supabase
    .from("agent_state")
    .insert({
      conversa_id: conversaId,

      operacao: null,

      status: "idle",

      cliente_id: null,
      cliente_nome: null,

      produto_id: null,
      produto_nome: null,

      quantidade: null,

      metodo_pagamento: null,
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
    .eq("conversa_id", conversaId)
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
): Promise<AgentState> {

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