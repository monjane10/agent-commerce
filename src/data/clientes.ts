export type Cliente = {
  id: number;
  nome: string;
  email: string;
};

export const clientes: Cliente[] = [
  {
    id: 1,
    nome: "João Manuel",
    email: "joao@email.com",
  },
  {
    id: 2,
    nome: "Maria Alberto",
    email: "maria@email.com",
  },
  {
    id: 3,
    nome: "Carlos António",
    email: "carlos@email.com",
  },
];