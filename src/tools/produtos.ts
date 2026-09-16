import { produtos } from "../data/produtos.js";

export async function buscarProduto(nome: string) {
  const encontrado = produtos.find((produto) =>
    produto.nome.toLowerCase().includes(nome.toLowerCase()),
  );

  if (!encontrado) {
    return {
      encontrado: false,
      mensagem: "Produto não encontrado",
    };
  }

  return {
    encontrado: true,
    produto: encontrado,
  };
}

export async function listarProdutos() {
  return produtos;
}