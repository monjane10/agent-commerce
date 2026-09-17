import { tool } from "@openai/agents";

import type { RunContext } from "@openai/agents";

import { z } from "zod";

import {
  buscarCliente,
} from "../../tools/clientes.js";

import type {
  AgentCommerceContext,
} from "../context.js";

import {
  vendaEmCurso,
  atualizarEstadoContexto,
} from "../context.js";


export const buscarClienteTool = tool({
  name:
    "buscar_cliente",

  description:
    "Procura clientes pelo nome e devolve os clientes encontrados com ID, nome e email.",

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
      "buscar_cliente",
    );

    console.log(
      "Cliente procurado:",
      nome,
    );


    const resultado =
      await buscarCliente(
        nome,
      );


    console.log(
      "Resultado:",
      resultado,
    );


    // ==================================================
    // EXTRAIR CLIENTES
    // ==================================================

    let clientes:
      Array<{
        id: number;
        nome: string;
        email?: string | null;
      }> = [];


    if (
      typeof resultado ===
        "object" &&
      resultado !== null &&
      "clientes" in resultado &&
      Array.isArray(
        resultado.clientes,
      )
    ) {
      clientes =
        resultado.clientes;
    }


    // ==================================================
    // ATUALIZAR AGENT STATE
    // ==================================================

    if (
      runContext &&
      vendaEmCurso(
        runContext.context.estado,
      )
    ) {
      // -----------------------------------------------
      // UM CLIENTE
      // -----------------------------------------------

      if (
        clientes.length === 1
      ) {
        const cliente =
          clientes[0];


        if (cliente) {
          await atualizarEstadoContexto(
            runContext,
            {
              cliente_id:
                cliente.id,

              cliente_nome:
                cliente.nome,

              status:
                "cliente_identificado",
            },
          );
        }
      }

      // -----------------------------------------------
      // CLIENTE AMBÍGUO
      // -----------------------------------------------

      else if (
        clientes.length > 1
      ) {
        await atualizarEstadoContexto(
          runContext,
          {
            cliente_id:
              null,

            status:
              "aguardando_cliente",
          },
        );
      }

      // -----------------------------------------------
      // NÃO ENCONTRADO
      // -----------------------------------------------

      else {
        await atualizarEstadoContexto(
          runContext,
          {
            cliente_id:
              null,

            status:
              "aguardando_cliente",
          },
        );
      }
    }


    return resultado;
  },
});
