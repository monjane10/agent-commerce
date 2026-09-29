import { tool } from "@openai/agents";

import { z } from "zod";

import {
  criarProduto,
} from "../../tools/produtos.js";


export const criarProdutoTool = tool({
  name:
    "criar_produto",

  description:
    "Cria um novo produto no catálogo com nome, preço e stock inicial. Use apenas quando todos os dados obrigatórios estiverem disponíveis. A operação requer aprovação humana.",


  // ====================================================
  // HUMAN-IN-THE-LOOP
  // ====================================================

  needsApproval:
    true,


  parameters:
    z.object({
      nome:
        z
          .string()
          .min(1),

      preco:
        z
          .number()
          .nonnegative(),

      quantidade:
        z
          .number()
          .int()
          .nonnegative(),

      moeda:
        z
          .string()
          .optional(),
    }),


  execute: async (
    {
      nome,
      preco,
      quantidade,
      moeda,
    },
  ) => {
    // Este código só executa
    // DEPOIS da aprovação humana.

    console.log(
      "\nTool executada:",
    );

    console.log(
      "criar_produto",
    );


    const resultado =
      await criarProduto({
        nome,
        preco,
        quantidade,
        moeda: moeda ?? undefined,
      });


    console.log(
      "Resultado:",
      resultado,
    );


    return resultado;
  },
});
