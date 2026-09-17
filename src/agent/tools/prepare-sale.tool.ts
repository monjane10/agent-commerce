import { tool } from "@openai/agents";

import type { RunContext } from "@openai/agents";

import { z } from "zod";

import type {
  AgentCommerceContext,
} from "../context.js";

import {
  vendaEmCurso,
  atualizarEstadoContexto,
} from "../context.js";


export const prepararVendaTool = tool({
  name:
    "preparar_venda",

  description:
    "Prepara e guarda o estado estruturado de uma operação de venda antes da sua execução.",

  parameters:
    z.object({
      cliente_nome:
        z
          .string()
          .nullable(),

      produto_nome:
        z
          .string()
          .nullable(),

      quantidade:
        z
          .number()
          .int()
          .positive()
          .nullable(),

      metodo_pagamento:
        z
          .string()
          .nullable(),
    }),

  execute: async (
    {
      cliente_nome,
      produto_nome,
      quantidade,
      metodo_pagamento,
    },

    runContext?:
      RunContext<AgentCommerceContext>,
  ) => {
    if (!runContext) {
      return {
        sucesso:
          false,

        erro:
          "Contexto do agente não disponível.",
      };
    }


    const estadoAtual =
      runContext.context.estado;


    const continuarVenda =
      vendaEmCurso(
        estadoAtual,
      );


    // ==================================================
    // PRESERVAR DADOS DA VENDA ATUAL
    // ==================================================

    const clienteNomeFinal =
      cliente_nome ??
      (
        continuarVenda
          ? estadoAtual.cliente_nome
          : null
      );


    const produtoNomeFinal =
      produto_nome ??
      (
        continuarVenda
          ? estadoAtual.produto_nome
          : null
      );


    const quantidadeFinal =
      quantidade ??
      (
        continuarVenda
          ? estadoAtual.quantidade
          : null
      );


    const metodoPagamentoFinal =
      metodo_pagamento ??
      (
        continuarVenda
          ? estadoAtual.metodo_pagamento
          : null
      );


    const clienteIdFinal =
      continuarVenda
        ? estadoAtual.cliente_id
        : null;


    const produtoIdFinal =
      continuarVenda
        ? estadoAtual.produto_id
        : null;


    // ==================================================
    // DETERMINAR STATUS
    // ==================================================

    let status =
      "preparando_venda";


    if (!clienteNomeFinal) {
      status =
        "aguardando_cliente";
    }
    else if (!produtoNomeFinal) {
      status =
        "aguardando_produto";
    }
    else if (!quantidadeFinal) {
      status =
        "aguardando_quantidade";
    }
    else if (!metodoPagamentoFinal) {
      status =
        "aguardando_pagamento";
    }


    const novoEstado =
      await atualizarEstadoContexto(
        runContext,
        {
          operacao:
            "criar_venda",

          status,

          cliente_id:
            clienteIdFinal,

          cliente_nome:
            clienteNomeFinal,

          produto_id:
            produtoIdFinal,

          produto_nome:
            produtoNomeFinal,

          quantidade:
            quantidadeFinal,

          metodo_pagamento:
            metodoPagamentoFinal,
        },
      );


    console.log(
      "\nEstado da venda preparado:",
    );

    console.log(
      novoEstado,
    );


    return {
      sucesso:
        true,

      estado:
        novoEstado,
    };
  },
});
