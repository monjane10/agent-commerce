import { tool } from "@openai/agents";

import type { RunContext } from "@openai/agents";

import { z } from "zod";

import {
  buscarProduto,
  listarProdutos,
} from "../../tools/produtos.js";

import type {
  AgentCommerceContext,
} from "../context.js";

import {
  vendaEmCurso,
  atualizarEstadoContexto,
} from "../context.js";


export const buscarProdutoTool = tool({
  name:
    "buscar_produto",

  description:
    "Procura informações completas de um produto, incluindo nome, preço, moeda e quantidade disponível.",

  parameters:
    z.object({
      nome:
        z.string(),
    }),

  execute: async (
    {
      nome,
    },

    runContext?:
      RunContext<AgentCommerceContext>,
  ) => {
    console.log(
      "\nTool executada:",
    );

    console.log(
      "buscar_produto",
    );

    console.log(
      "Produto procurado:",
      nome,
    );


    const resultado =
      await buscarProduto(
        nome,
      );


    console.log(
      "Resultado:",
      resultado,
    );


    // ==================================================
    // EXTRAIR PRODUTO DE FORMA SEGURA
    // ==================================================

    let produto:
      {
        id: number;
        nome: string;
      } | undefined;


    if (
      typeof resultado ===
        "object" &&
      resultado !== null &&
      "produto" in resultado
    ) {
      produto =
        (
          resultado as {
            produto?: {
              id: number;
              nome: string;
            };
          }
        ).produto;
    }


    // ==================================================
    // ATUALIZAR ESTADO DE VENDA
    // ==================================================

    if (
      runContext &&
      vendaEmCurso(
        runContext.context.estado,
      )
    ) {
      if (produto) {
        await atualizarEstadoContexto(
          runContext,
          {
            produto_id:
              produto.id,

            produto_nome:
              produto.nome,

            status:
              "produto_identificado",
          },
        );
      }
      else {
        await atualizarEstadoContexto(
          runContext,
          {
            produto_id:
              null,

            status:
              "aguardando_produto",
          },
        );
      }
    }


    return resultado;
  },
});


export const listarProdutosTool = tool({
  name:
    "listar_produtos",

  description:
    "Lista todos os produtos disponíveis no sistema, incluindo nome, preço, moeda e quantidade em stock.",

  parameters:
    z.object({}),

  execute:
    async () => {
      console.log(
        "\nTool executada:",
      );

      console.log(
        "listar_produtos",
      );


      const resultado =
        await listarProdutos();


      console.log(
        "Resultado:",
        resultado,
      );


      return resultado;
    },
});
