import { clientes } from "../data/clientes.js";
import { produtos } from "../data/produtos.js";
import { vendas } from "../data/vendas.js";

export async function criarVenda(
  clienteId: number,
  produtoId: number,
  quantidade: number,
  metodoPagamento: string,
) {
  const cliente = clientes.find(
    (item) => item.id === clienteId,
  );

  if (!cliente) {
    return {
      sucesso: false,
      erro: "Cliente não encontrado",
    };
  }

  const produto = produtos.find(
    (item) => item.id === produtoId,
  );

  if (!produto) {
    return {
      sucesso: false,
      erro: "Produto não encontrado",
    };
  }

  if (quantidade <= 0) {
    return {
      sucesso: false,
      erro: "A quantidade deve ser maior que zero",
    };
  }

  if (produto.quantidade < quantidade) {
    return {
      sucesso: false,
      erro: "Stock insuficiente",

      stockDisponivel: produto.quantidade,
      quantidadeSolicitada: quantidade,
    };
  }

  const total =
    produto.preco * quantidade;

  const venda = {
    id: vendas.length + 1,

    clienteId: cliente.id,
    produtoId: produto.id,

    quantidade,

    precoUnitario: produto.preco,
    total,

    metodoPagamento,

    criadaEm: new Date().toISOString(),
  };

  vendas.push(venda);

  // Atualização do stock
  produto.quantidade -= quantidade;

  return {
    sucesso: true,

    venda,

    cliente: {
      id: cliente.id,
      nome: cliente.nome,
    },

    produto: {
      id: produto.id,
      nome: produto.nome,
      quantidadeVendida: quantidade,
      stockRestante: produto.quantidade,
    },

    moeda: produto.moeda,
  };
}