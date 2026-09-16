type Produto = {
  nome: string;
  quantidade: number;
};

const produtos: Produto[] = [
  {
    nome: "Luvas de Boxe",
    quantidade: 12,
  },
  {
    nome: "Kimono",
    quantidade: 8,
  },
  {
    nome: "Caneleiras",
    quantidade: 4,
  },
];

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