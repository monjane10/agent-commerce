import { tool } from "@openai/agents";

import type { RunContext } from "@openai/agents";

import { z } from "zod";

import {
  criarVenda,
} from "../../tools/vendas.js";

import type {
  AgentCommerceContext,
} from "../context.js";

import {
  atualizarEstadoContexto,
} from "../context.js";


export const criarVendaTool = tool({
  name:
    "criar_venda",

  description:
    "Regista uma venda para um cliente e produto previamente identificados e atualiza o stock.",


  // ====================================================
  // HUMAN-IN-THE-LOOP
  // ====================================================

  needsApproval:
    true,


  parameters:
    z.object({
      cliente_id:
        z
          .number()
          .int()
          .positive(),

      produto_id:
        z
          .number()
          .int()
          .positive(),

      quantidade:
        z
          .number()
          .int()
          .positive(),

      metodo_pagamento:
        z.string(),
    }),


  execute: async (
    {
      cliente_id,
      produto_id,
      quantidade,
      metodo_pagamento,
    },

    runContext?:
      RunContext<AgentCommerceContext>,
  ) => {
    // Este código só executa
    // DEPOIS da aprovação humana.

    console.log(
      "\nTool executada:",
    );

    console.log(
      "criar_venda",
    );


    await atualizarEstadoContexto(
      runContext,
      {
        operacao:
          "criar_venda",

        status:
          "executando_venda",

        cliente_id,

        produto_id,

        quantidade,

        metodo_pagamento,
      },
    );


    const resultado =
      await criarVenda(
        cliente_id,
        produto_id,
        quantidade,
        metodo_pagamento,
      );


    console.log(
      "Resultado:",
      resultado,
    );


    const vendaResultado =
      resultado as {
        sucesso?: boolean;
        cliente?: string;
        produto?: string;
      } | null;


    // ==================================================
    // SUCESSO
    // ==================================================

    if (
      vendaResultado?.sucesso ===
      true
    ) {
      await atualizarEstadoContexto(
        runContext,
        {
          status:
            "concluida",

          cliente_nome:
            typeof vendaResultado.cliente ===
            "string"
              ? vendaResultado.cliente
              : (
                runContext
                  ?.context
                  .estado
                  .cliente_nome ??
                null
              ),

          produto_nome:
            typeof vendaResultado.produto ===
            "string"
              ? vendaResultado.produto
              : (
                runContext
                  ?.context
                  .estado
                  .produto_nome ??
                null
              ),
        },
      );
    }

    // ==================================================
    // ERRO
    // ==================================================

    else {
      await atualizarEstadoContexto(
        runContext,
        {
          status:
            "erro",
        },
      );
    }


    return resultado;
  },
});
