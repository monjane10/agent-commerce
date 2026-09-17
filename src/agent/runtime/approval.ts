import type { RunContext } from "@openai/agents";

import type { RunResult } from "@openai/agents";

import {
  supabase,
} from "../../lib/supabase.js";

import {
  atualizarEstado,
} from "../../state/agent-state.js";

import type {
  AgentCommerceContext,
} from "../context.js";

import type {
  DadosVendaAprovacao,
  ResumoVendaAprovacao,
} from "../context.js";


export async function atualizarStatusAprovacao(
  contexto:
    AgentCommerceContext,

  status:
    string,
): Promise<void> {
  const novoEstado =
    await atualizarEstado(
      contexto.conversaId,
      {
        status,
      },
    );


  contexto.estado =
    novoEstado;
}


export function extrairArgumentosVenda(
  argumentos: unknown,
): DadosVendaAprovacao {
  let valor:
    unknown =
    argumentos;


  if (
    typeof valor ===
    "string"
  ) {
    try {
      valor =
        JSON.parse(
          valor,
        );
    }
    catch {
      throw new Error(
        "Não foi possível interpretar os dados da venda para aprovação.",
      );
    }
  }


  if (
    typeof valor !==
      "object" ||
    valor === null
  ) {
    throw new Error(
      "Os dados da venda para aprovação são inválidos.",
    );
  }


  const objeto =
    valor as Record<
      string,
      unknown
    >;


  const dados:
    DadosVendaAprovacao = {};


  if (
    typeof objeto.cliente_id ===
    "number"
  ) {
    dados.cliente_id =
      objeto.cliente_id;
  }


  if (
    typeof objeto.produto_id ===
    "number"
  ) {
    dados.produto_id =
      objeto.produto_id;
  }


  if (
    typeof objeto.quantidade ===
    "number"
  ) {
    dados.quantidade =
      objeto.quantidade;
  }


  if (
    typeof objeto.metodo_pagamento ===
    "string"
  ) {
    dados.metodo_pagamento =
      objeto.metodo_pagamento;
  }


  return dados;
}


export async function obterResumoVendaAprovacao(
  contexto:
    AgentCommerceContext,

  argumentos:
    unknown,
): Promise<ResumoVendaAprovacao> {
  const dados =
    extrairArgumentosVenda(
      argumentos,
    );


  const clienteId =
    dados.cliente_id ??
    contexto.estado.cliente_id;


  const produtoId =
    dados.produto_id ??
    contexto.estado.produto_id;


  const quantidade =
    dados.quantidade ??
    contexto.estado.quantidade;


  const metodoPagamento =
    dados.metodo_pagamento ??
    contexto.estado.metodo_pagamento;


  // ====================================================
  // VALIDAR DADOS
  // ====================================================

  if (!clienteId) {
    throw new Error(
      "Não foi possível identificar o cliente da venda.",
    );
  }


  if (!produtoId) {
    throw new Error(
      "Não foi possível identificar o produto da venda.",
    );
  }


  if (
    !quantidade ||
    quantidade <= 0
  ) {
    throw new Error(
      "Quantidade da venda inválida.",
    );
  }


  if (!metodoPagamento) {
    throw new Error(
      "Método de pagamento não identificado.",
    );
  }


  // ====================================================
  // BUSCAR NOMES REAIS NA BASE DE DADOS
  // ====================================================

  const [
    resultadoCliente,
    resultadoProduto,
  ] =
    await Promise.all([
      supabase
        .from("clientes")
        .select(
          "id, nome",
        )
        .eq(
          "id",
          clienteId,
        )
        .maybeSingle(),

      supabase
        .from("produtos")
        .select(
          `
          id,
          nome,
          preco,
          moeda
          `,
        )
        .eq(
          "id",
          produtoId,
        )
        .maybeSingle(),
    ]);


  // ====================================================
  // CLIENTE
  // ====================================================

  if (
    resultadoCliente.error
  ) {
    throw new Error(
      `Erro ao obter cliente para aprovação: ${resultadoCliente.error.message}`,
    );
  }


  if (
    !resultadoCliente.data
  ) {
    throw new Error(
      "Cliente da venda não encontrado.",
    );
  }


  // ====================================================
  // PRODUTO
  // ====================================================

  if (
    resultadoProduto.error
  ) {
    throw new Error(
      `Erro ao obter produto para aprovação: ${resultadoProduto.error.message}`,
    );
  }


  if (
    !resultadoProduto.data
  ) {
    throw new Error(
      "Produto da venda não encontrado.",
    );
  }


  // ====================================================
  // PREÇO
  // ====================================================

  const precoConvertido =
    Number(
      resultadoProduto.data
        .preco,
    );


  const precoUnitario =
    Number.isFinite(
      precoConvertido,
    )
      ? precoConvertido
      : null;


  const moeda =
    resultadoProduto.data
      .moeda ??
    "MZN";


  const total =
    precoUnitario !== null
      ? precoUnitario *
        quantidade
      : null;


  return {
    clienteNome:
      resultadoCliente.data
        .nome,

    produtoNome:
      resultadoProduto.data
        .nome,

    quantidade,

    metodoPagamento,

    precoUnitario,

    moeda,

    total,
  };
}
