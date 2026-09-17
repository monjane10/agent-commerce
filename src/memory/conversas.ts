import { supabase } from "../lib/supabase.js";

export type Conversa = {
  id: number;
  titulo: string;
  openai_response_id: string | null;
  created_at: string;
  updated_at: string;
};

// ======================================================
// CRIAR CONVERSA
// ======================================================

export async function criarConversa(
  titulo: string,
): Promise<Conversa> {

  const { data, error } = await supabase
    .from("conversas")
    .insert({
      titulo,
    })
    .select()
    .single();

  if (error) {
    throw new Error(
      `Erro ao criar conversa: ${error.message}`,
    );
  }

  return data;
}


// ======================================================
// GUARDAR MENSAGEM
// ======================================================

export async function guardarMensagem(
  conversaId: number,
  role: "user" | "assistant",
  conteudo: string,
) {
  const { error } = await supabase
    .from("mensagens")
    .insert({
      conversa_id: conversaId,
      role,
      conteudo,
    });

  if (error) {
    throw new Error(
      `Erro ao guardar mensagem: ${error.message}`,
    );
  }
}


// ======================================================
// ATUALIZAR RESPONSE ID
// ======================================================

export async function atualizarResponseId(
  conversaId: number,
  responseId: string,
) {
  const { error } = await supabase
    .from("conversas")
    .update({
      openai_response_id: responseId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversaId);

  if (error) {
    throw new Error(
      `Erro ao atualizar conversa: ${error.message}`,
    );
  }
}


// ======================================================
// BUSCAR ÚLTIMA CONVERSA
// ======================================================

export async function buscarUltimaConversa():
  Promise<Conversa | null> {

  const { data, error } = await supabase
    .from("conversas")
    .select("*")
    .order("updated_at", {
      ascending: false,
    })
    .limit(1);

  if (error) {
    throw new Error(
      `Erro ao buscar conversa: ${error.message}`,
    );
  }

  const conversa = data?.[0];

  if (!conversa) {
    return null;
  }

  return conversa;
}