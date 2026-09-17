import { tool } from "@openai/agents";

import { z } from "zod";

import {
  consultarStock,
} from "../../tools/stock.js";


export const consultarStockTool = tool({
  name:
    "consultar_stock",

  description:
    "Consulta especificamente a quantidade disponível em stock de um produto.",

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
