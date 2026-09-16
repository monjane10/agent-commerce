export type Produto = {
  id: number;
  nome: string;
  preco: number;
  quantidade: number;
};

export const produtos: Produto[] = [
  {
    id: 1,
    nome: "Luvas de Boxe",
    preco: 2500,
    quantidade: 12,
  },
  {
    id: 2,
    nome: "Kimono",
    preco: 4500,
    quantidade: 8,
  },
  {
    id: 3,
    nome: "Caneleiras",
    preco: 1800,
    quantidade: 4,
  },
];