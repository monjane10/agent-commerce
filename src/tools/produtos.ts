import { supabase } from "../lib/supabase.js";

import {
  prepararTermosBusca,
} from "../utils/busca.js";

export async function buscarProduto(
  nome: string,
) {
  const termos =
    prepararTermosBusca(nome);

  let query = supabase
    .from("produtos")
    .select(
      "id, nome, preco, moeda, quantidade",
    );

  for (const termo of termos) {
    query = query.ilike(
      "nome",
      `%${termo}%`,
    );
  }

  const { data, error } =
    await query.limit(1);

  if (error) {
    throw new Error(
      `Erro ao buscar produto: ${error.message}`,
    );
  }

  const produtoEncontrado =
    data?.[0];

  if (!produtoEncontrado) {
    return {
      encontrado: false,
      mensagem:
        "Produto não encontrado",
    };
  }

  return {
    encontrado: true,
    produto:
      produtoEncontrado,
  };
}


export async function listarProdutos() {
  const { data, error } =
    await supabase
      .from("produtos")
      .select(
        "id, nome, preco, moeda, quantidade",
      )
      .order(
        "nome",
      );

  if (error) {
    throw new Error(
      `Erro ao listar produtos: ${error.message}`,
    );
  }

  return data;
}


// ======================================================
// CRIAÇÃO DE PRODUTO
// ======================================================

export type CriarProdutoInput = {
  nome: string;
  preco: number;
  quantidade: number;
  moeda?: string | undefined;
};


export type ProdutoResumo = {
  id: number;
  nome: string;
  preco: number;
  moeda: string;
  quantidade: number;
};


export type ResultadoCriarProduto =
  | {
    sucesso: true;
    produto: ProdutoResumo;
  }
  | {
    sucesso: false;
    motivo:
    | "dados_invalidos"
    | "produto_duplicado";
    erro: string;
    produto?: ProdutoResumo;
  };


function paraNumeroFinito(
  valor: unknown,
): number | null {
  const convertido =
    typeof valor === "number"
      ? valor
      : Number(valor);

  return Number.isFinite(convertido)
    ? convertido
    : null;
}


export async function criarProduto(
  input: CriarProdutoInput,
): Promise<ResultadoCriarProduto> {
  // ==================================================
  // VALIDAÇÕES DETERMINÍSTICAS
  // ==================================================

  const nome =
    typeof input.nome === "string"
      ? input.nome.trim()
      : "";

  if (!nome) {
    return {
      sucesso: false,
      motivo: "dados_invalidos",
      erro: "Nome do produto é obrigatório.",
    };
  }

  const preco =
    paraNumeroFinito(input.preco);

  if (
    preco === null ||
    preco < 0
  ) {
    return {
      sucesso: false,
      motivo: "dados_invalidos",
      erro: "Preço do produto inválido.",
    };
  }

  const quantidade =
    paraNumeroFinito(input.quantidade);

  if (
    quantidade === null ||
    !Number.isInteger(quantidade) ||
    quantidade < 0
  ) {
    return {
      sucesso: false,
      motivo: "dados_invalidos",
      erro: "Quantidade inicial inválida.",
    };
  }

  const moeda =
    typeof input.moeda === "string" &&
      input.moeda.trim() !== ""
      ? input.moeda.trim()
      : "MZN";


  // ==================================================
  // VERIFICAR DUPLICADO (case-insensitive)
  // ==================================================

  const {
    data: existente,
    error: erroBusca,
  } = await supabase
    .from("produtos")
    .select(
      "id, nome, preco, moeda, quantidade",
    )
    .ilike("nome", nome)
    .maybeSingle();

  if (erroBusca) {
    throw new Error(
      `Erro ao verificar produto: ${erroBusca.message}`,
    );
  }

  if (existente) {
    return {
      sucesso: false,
      motivo: "produto_duplicado",
      erro: `Produto "${existente.nome}" já existe no catálogo.`,
      produto: {
        id: Number(existente.id),
        nome: String(existente.nome),
        preco: Number(existente.preco),
        moeda: String(existente.moeda ?? "MZN"),
        quantidade: Number(existente.quantidade ?? 0),
      },
    };
  }


  // ==================================================
  // INSERT (id e created_at gerados pela base)
  // ==================================================

  const {
    data: inserido,
    error: erroInsert,
  } = await supabase
    .from("produtos")
    .insert({
      nome,
      preco,
      moeda,
      quantidade,
    })
    .select(
      "id, nome, preco, moeda, quantidade",
    )
    .single();

  if (erroInsert) {
    throw new Error(
      `Erro ao criar produto: ${erroInsert.message}`,
    );
  }


  return {
    sucesso: true,
    produto: {
      id: Number(inserido.id),
      nome: String(inserido.nome),
      preco: Number(inserido.preco),
      moeda: String(inserido.moeda ?? moeda),
      quantidade: Number(inserido.quantidade ?? quantidade),
    },
  };
}