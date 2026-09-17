import { supabase } from "../lib/supabase.js";

export async function criarVenda(
  clienteId: number,
  produtoId: number,
  quantidade: number,
  metodoPagamento: string,
) {
  const { data, error } = await supabase.rpc(
    "criar_venda",
    {
      p_cliente_id: clienteId,
      p_produto_id: produtoId,
      p_quantidade: quantidade,
      p_metodo_pagamento: metodoPagamento,
    },
  );

  if (error) {
    return {
      sucesso: false,
      erro: error.message,
    };
  }

  return data;
}