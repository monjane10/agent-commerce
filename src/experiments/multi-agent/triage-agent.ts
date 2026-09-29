import { Agent, handoff } from "@openai/agents";

import type {
  AgentCommerceContext,
} from "../../agent/context.js";

import {
  salesAgent,
} from "./sales-agent.js";

import {
  inventoryAgent,
} from "./inventory-agent.js";


// EXPERIMENTO (não faz parte da arquitetura ativa).
// Ver README.md nesta pasta.
//
// ======================================================
// TRIAGE AGENT
//
// Apenas identifica o domínio e transfere o controlo
// ao especialista. Não executa lógica de negócio.
// ======================================================

const INSTRUCOES_TRIAGEM = `
És o agente de triagem. Não resolves pedidos sozinho:
escolhe um especialista e transfere o controlo.

- Pedidos sobre vendas, faturação, histórico de
  vendas e clientes comerciais ("procura <nome>"):
  transfere para o Sales Agent.
- Pedidos sobre produtos, catálogo, stock atual
  e cadastro de produtos:
  transfere para o Inventory Agent.
`;


export const triageAgent =
  new Agent<AgentCommerceContext>({
    name:
      "Triage Agent",

    model:
      process.env.OPENAI_MODEL!,

    instructions:
      INSTRUCOES_TRIAGEM,

    handoffs: [
      handoff(
        salesAgent,
        {
          toolNameOverride:
            "transfer_to_sales_agent",

          toolDescriptionOverride:
            "Handles sales, revenue, sales history, commercial customers and creating sales.",
        },
      ),

      handoff(
        inventoryAgent,
        {
          toolNameOverride:
            "transfer_to_inventory_agent",

          toolDescriptionOverride:
            "Handles products, catalog, current stock and creating products.",
        },
      ),
    ],
  });
