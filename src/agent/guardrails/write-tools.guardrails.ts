import {
  defineToolInputGuardrail,
  ToolGuardrailFunctionOutputFactory,
} from "@openai/agents";

import type {
  AgentCommerceContext,
} from "../context.js";


// ======================================================
// GUARDRAILS DE INPUT (determinísticos, sem LLM)
//
// Camada: schema -> guardrail -> HITL -> business
// validation -> Supabase.
//
// Sem side effects, sem BD, idempotentes.
// Para input inválido usa rejectContent (sem crash).
// ======================================================

function parseArgumentos(
  argumentos: string,
): Record<string, unknown> | null {
  try {
    const valor: unknown =
      JSON.parse(argumentos);

    if (
      typeof valor !== "object" ||
      valor === null
    ) {
      return null;
    }

    return valor as Record<string, unknown>;
  }
  catch {
    return null;
  }
}


function eIdValido(
  valor: unknown,
): boolean {
  return typeof valor === "number" &&
    Number.isFinite(valor) &&
    Number.isInteger(valor) &&
    valor > 0;
}


function eTextoNaoVazio(
  valor: unknown,
): boolean {
  return typeof valor === "string" &&
    valor.trim() !== "";
}


function eNumeroFinito(
  valor: unknown,
): boolean {
  return typeof valor === "number" &&
    Number.isFinite(valor);
}


// ======================================================
// criar_venda
// ======================================================

export const criarVendaInputGuardrail =
  defineToolInputGuardrail<AgentCommerceContext>({
    name: "criar_venda_guard",

    run: async ({ toolCall }) => {
      const args =
        parseArgumentos(toolCall.arguments);

      if (!args) {
        console.log(
          "[GUARD] criar_venda bloqueada: parâmetros inválidos",
        );

        return ToolGuardrailFunctionOutputFactory.rejectContent(
          "Os parâmetros da venda são inválidos.",
        );
      }

      if (!eIdValido(args.cliente_id)) {
        console.log(
          "[GUARD] criar_venda bloqueada: cliente_id inválido",
        );

        return ToolGuardrailFunctionOutputFactory.rejectContent(
          "O cliente da venda não foi identificado corretamente.",
        );
      }

      if (!eIdValido(args.produto_id)) {
        console.log(
          "[GUARD] criar_venda bloqueada: produto_id inválido",
        );

        return ToolGuardrailFunctionOutputFactory.rejectContent(
          "O produto da venda não foi identificado corretamente.",
        );
      }

      const quantidade = args.quantidade;

      if (
        typeof quantidade !== "number" ||
        !Number.isFinite(quantidade) ||
        !Number.isInteger(quantidade) ||
        quantidade <= 0
      ) {
        console.log(
          "[GUARD] criar_venda bloqueada: quantidade inválida",
        );

        return ToolGuardrailFunctionOutputFactory.rejectContent(
          "A quantidade da venda deve ser um número inteiro maior que zero.",
        );
      }

      if (!eTextoNaoVazio(args.metodo_pagamento)) {
        console.log(
          "[GUARD] criar_venda bloqueada: método de pagamento inválido",
        );

        return ToolGuardrailFunctionOutputFactory.rejectContent(
          "O método de pagamento da venda não foi informado.",
        );
      }

      return ToolGuardrailFunctionOutputFactory.allow();
    },
  });


// ======================================================
// criar_produto
// ======================================================

export const criarProdutoInputGuardrail =
  defineToolInputGuardrail<AgentCommerceContext>({
    name: "criar_produto_guard",

    run: async ({ toolCall }) => {
      const args =
        parseArgumentos(toolCall.arguments);

      if (!args) {
        console.log(
          "[GUARD] criar_produto bloqueado: parâmetros inválidos",
        );

        return ToolGuardrailFunctionOutputFactory.rejectContent(
          "Os parâmetros do produto são inválidos.",
        );
      }

      if (!eTextoNaoVazio(args.nome)) {
        console.log(
          "[GUARD] criar_produto bloqueado: nome inválido",
        );

        return ToolGuardrailFunctionOutputFactory.rejectContent(
          "O nome do produto é obrigatório.",
        );
      }

      const preco = args.preco;

      if (
        !eNumeroFinito(preco) ||
        (preco as number) < 0
      ) {
        console.log(
          "[GUARD] criar_produto bloqueado: preço inválido",
        );

        return ToolGuardrailFunctionOutputFactory.rejectContent(
          "O preço do produto deve ser um número maior ou igual a zero.",
        );
      }

      const quantidade = args.quantidade;

      if (
        typeof quantidade !== "number" ||
        !Number.isFinite(quantidade) ||
        !Number.isInteger(quantidade) ||
        quantidade < 0
      ) {
        console.log(
          "[GUARD] criar_produto bloqueado: quantidade inválida",
        );

        return ToolGuardrailFunctionOutputFactory.rejectContent(
          "A quantidade inicial deve ser um número inteiro maior ou igual a zero.",
        );
      }

      if (
        args.moeda !== undefined &&
        !eTextoNaoVazio(args.moeda)
      ) {
        console.log(
          "[GUARD] criar_produto bloqueado: moeda inválida",
        );

        return ToolGuardrailFunctionOutputFactory.rejectContent(
          "A moeda do produto é inválida.",
        );
      }

      return ToolGuardrailFunctionOutputFactory.allow();
    },
  });
