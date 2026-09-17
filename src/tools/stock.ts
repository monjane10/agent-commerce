import { supabase } from "../lib/supabase.js";

export async function consultarStock(
  produto: string,
) {
  const { data, error } = await supabase
    .from("produtos")
    .select("id, nome, quantidade")
    .ilike("nome", `%${produto}%`)
    .limit(1);

  if (error) {
    throw new Error(
      `Erro ao consultar stock: ${error.message}`,
    );
  }

  const produtoEncontrado = data?.[0];

  if (!produtoEncontrado) {
    return {
      encontrado: false,
      mensagem: "Produto não encontrado",
    };
  }

  return {
    encontrado: true,
    produto: produtoEncontrado.nome,
    quantidade: produtoEncontrado.quantidade,
  };
}