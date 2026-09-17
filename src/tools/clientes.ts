import { clientes } from "../data/clientes.js";

export async function buscarCliente(nome: string) {
  const encontrados = clientes.filter((cliente) =>
    cliente.nome
      .toLowerCase()
      .includes(nome.toLowerCase()),
  );

  if (encontrados.length === 0) {
    return {
      encontrado: false,
      mensagem: "Cliente não encontrado",
    };
  }

  return {
    encontrado: true,
    clientes: encontrados,
  };
}