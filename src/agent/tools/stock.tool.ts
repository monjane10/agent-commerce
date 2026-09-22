import { tool } from "@openai/agents";

import { z } from "zod";

import {
  consultarStock,
} from "../../tools/stock.js";


export const consultarStockTool = tool({
  name:
    "consultar_stock",

  description:
    "Quantidade ATUAL em stock de um produto. Não usar para vendas já realizadas.",

  parameters:
    z.object({
      produto:
        z.string(),
    }),

  execute: async ({
    produto,
  }) => {
    console.log(
      "\nTool executada:",
    );

    console.log(
      "consultar_stock",
    );

    console.log(
      "Produto:",
      produto,
    );


    const resultado =
      await consultarStock(
        produto,
      );


    console.log(
      "Resultado:",
      resultado,
    );


    return resultado;
  },
});
