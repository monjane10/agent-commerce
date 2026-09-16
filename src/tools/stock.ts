import { produtos } from "../data/produtos.js";

export async function consultarStock(produto: string) {
  const encontrado = produtos.find((item) =>
    item.nome.toLowerCase().includes(produto.toLowerCase()),
  );

  if (!encontrado) {
    return {
      encontrado: false,
      mensagem: "Produto não encontrado",
    };
  }

  return {
    encontrado: true,
    produto: encontrado.nome,
    quantidade: encontrado.quantidade,
  };
}