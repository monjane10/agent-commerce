import { supabase } from "../lib/supabase.js";

import {
  prepararTermosBusca,
} from "../utils/busca.js";

export async function consultarStock(
  produto: string,
) {
  const termos =
    prepararTermosBusca(produto);

  let query = supabase
    .from("produtos")
    .select(
      "id, nome, quantidade",
    );

  for (const termo of termos) {
    query = query.ilike(
      "nome",
      `%${termo}%`,
    );
  }

  const { data, error } =
    await query.limit(1);

  if (error) {
    throw new Error(
      `Erro ao consultar stock: ${error.message}`,
    );
  }

  const produtoEncontrado =
    data?.[0];

  if (!produtoEncontrado) {
    return {
      encontrado: false,
      mensagem:
        "Produto não encontrado",
    };
  }

  return {
    encontrado: true,
    produto:
      produtoEncontrado.nome,
    quantidade:
      produtoEncontrado.quantidade,
  };
}