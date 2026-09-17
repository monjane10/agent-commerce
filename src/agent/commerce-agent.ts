import { Agent } from "@openai/agents";

import type {
  AgentCommerceContext,
} from "./context.js";

import {
  construirInstrucoes,
} from "./instructions.js";

import {
  consultarStockTool,
  buscarProdutoTool,
  listarProdutosTool,
  buscarClienteTool,
  prepararVendaTool,
  criarVendaTool,
} from "./tools/index.js";


export const agente =
  new Agent<AgentCommerceContext>({
    name:
      "Agente Comercial",

    model:
      process.env.OPENAI_MODEL!,

    instructions:
      construirInstrucoes,

    tools: [
      consultarStockTool,
      buscarProdutoTool,
      listarProdutosTool,
      buscarClienteTool,
      prepararVendaTool,
      criarVendaTool,
    ],
  });
