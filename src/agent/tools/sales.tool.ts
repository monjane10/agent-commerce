import { tool } from "@openai/agents";

import { z } from "zod";

import {
  consultarVendas,
} from "../../tools/vendas.js";


export const consultarVendasTool = tool({
  name:
    "consultar_vendas",

  description:
    "Consulta histórico de vendas. Usa modo 'resumo' para contagens, faturação e unidades vendidas; usa 'detalhe' só para listar ou detalhar vendas. Apenas leitura.",

  parameters:
    z.object({
      cliente:
        z
          .string()
          .nullable()
          .optional(),

      produto:
        z
          .string()
          .nullable()
          .optional(),

      data_inicio:
        z
          .string()
          .nullable()
          .optional(),

      data_fim:
        z
          .string()
          .nullable()
          .optional(),

      limite:
        z
          .number()
          .int()
          .positive()
          .max(100)
          .nullable()
          .optional(),

      modo:
        z
          .enum([
            "resumo",
            "detalhe",
          ])
          .nullable()
          .optional(),
    }),

  execute: async ({
    cliente,
    produto,
    data_inicio,
    data_fim,
    limite,
    modo,
  }) => {
    console.log(
      "\nTool executada:",
    );

    console.log(
      "consultar_vendas",
    );


    const resultado =
      await consultarVendas({
        cliente:
          cliente ?? undefined,

        produto:
          produto ?? undefined,

        dataInicio:
          data_inicio ?? undefined,

        dataFim:
          data_fim ?? undefined,

        limite:
          limite ?? undefined,

        modo:
          modo ?? undefined,
      });


    console.log(
      "Resultado:",
      resultado,
    );


    return resultado;
  },
});
