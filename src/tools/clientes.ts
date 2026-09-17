import { supabase } from "../lib/supabase.js";

export async function buscarCliente(
  nome: string,
) {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nome, email")
    .ilike("nome", `%${nome}%`);

  if (error) {
    throw new Error(
      `Erro ao buscar cliente: ${error.message}`,
    );
  }

  if (!data || data.length === 0) {
    return {
      encontrado: false,
      mensagem: "Cliente não encontrado",
    };
  }

  return {
    encontrado: true,
    clientes: data,
  };
}