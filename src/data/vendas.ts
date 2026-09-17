export type Venda = {
  id: number;

  clienteId: number;
  produtoId: number;

  quantidade: number;

  precoUnitario: number;
  total: number;

  metodoPagamento: string;

  criadaEm: string;
};

export const vendas: Venda[] = [];