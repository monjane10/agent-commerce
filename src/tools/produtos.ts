import { supabase } from "../lib/supabase.js";

export async function buscarProduto(
  nome: string,
) {
  const { data, error } = await supabase
    .from("produtos")
    .select(
      "id, nome, preco, moeda, quantidade",
    )
    .ilike("nome", `%${nome}%`)
    .limit(1);

  if (error) {
    throw new Error(
      `Erro ao buscar produto: ${error.message}`,
    );
  }

  if (!data || data.length === 0) {
    return {
      encontrado: false,
      mensagem: "Produto não encontrado",
    };
  }

  return {
    encontrado: true,
    produto: data[0],
  };
}

export async function listarProdutos() {
  const { data, error } = await supabase
    .from("produtos")
    .select(
      "id, nome, preco, moeda, quantidade",
    )
    .order("nome");

  if (error) {
    throw new Error(
      `Erro ao listar produtos: ${error.message}`,
    );
  }

  return data;
}