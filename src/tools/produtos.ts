import { supabase } from "../lib/supabase.js";

import {
  prepararTermosBusca,
} from "../utils/busca.js";

export async function buscarProduto(
  nome: string,
) {
  const termos =
    prepararTermosBusca(nome);

  let query = supabase
    .from("produtos")
    .select(
      "id, nome, preco, moeda, quantidade",
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
      `Erro ao buscar produto: ${error.message}`,
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
      produtoEncontrado,
  };
}


export async function listarProdutos() {
  const { data, error } =
    await supabase
      .from("produtos")
      .select(
        "id, nome, preco, moeda, quantidade",
      )
      .order(
        "nome",
      );

  if (error) {
    throw new Error(
      `Erro ao listar produtos: ${error.message}`,
    );
  }

  return data;
}