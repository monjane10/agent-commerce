import "dotenv/config";
import OpenAI from "openai";

import { consultarStock } from "./tools/stock.js";
import {
  buscarProduto,
  listarProdutos,
} from "./tools/produtos.js";
import { buscarCliente } from "./tools/clientes.js";
import { criarVenda } from "./tools/vendas.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const tools = [
  {
    type: "function" as const,

    name: "consultar_stock",

    description:
      "Consulta especificamente a quantidade disponível em stock de um produto.",

    strict: true,

    parameters: {
      type: "object",

      properties: {
        produto: {
          type: "string",
          description: "Nome do produto",
        },
      },

      required: ["produto"],

      additionalProperties: false,
    },
  },

  {
    type: "function" as const,

    name: "buscar_produto",

    description:
      "Procura informações completas de um produto, incluindo nome, preço e quantidade.",

    strict: true,

    parameters: {
      type: "object",

      properties: {
        nome: {
          type: "string",
          description: "Nome do produto que deve ser procurado",
        },
      },

      required: ["nome"],

      additionalProperties: false,
    },
  },

  {
    type: "function" as const,

    name: "listar_produtos",

    description:
      "Lista todos os produtos disponíveis no sistema.",

    strict: true,

    parameters: {
      type: "object",

      properties: {},

      required: [],

      additionalProperties: false,
    },
  },
  {
  type: "function" as const,

  name: "buscar_cliente",

  description:
    "Procura clientes cadastrados pelo nome. Deve ser usada para descobrir o ID real de um cliente.",

  strict: true,

  parameters: {
    type: "object",

    properties: {
      nome: {
        type: "string",
        description:
          "Nome ou parte do nome do cliente",
      },
    },

    required: ["nome"],
    additionalProperties: false,
  },
},
{
  type: "function" as const,

  name: "criar_venda",

  description:
    "Regista uma venda depois de o cliente e o produto terem sido identificados.",

  strict: true,

  parameters: {
    type: "object",

    properties: {
      cliente_id: {
        type: "integer",
        description:
          "ID real do cliente obtido através da tool buscar_cliente",
      },

      produto_id: {
        type: "integer",
        description:
          "ID real do produto obtido através da tool buscar_produto",
      },

      quantidade: {
        type: "integer",
        description:
          "Quantidade do produto a vender",
      },

      metodo_pagamento: {
        type: "string",
        description:
          "Método de pagamento utilizado pelo cliente",
      },
    },

    required: [
      "cliente_id",
      "produto_id",
      "quantidade",
      "metodo_pagamento",
    ],

    additionalProperties: false,
  },
},
];

async function executarTool(
  nome: string,
  argumentos: Record<string, unknown>,
) {
  switch (nome) {
    case "consultar_stock":
      return await consultarStock(
        argumentos.produto as string,
      );

    case "buscar_produto":
      return await buscarProduto(
        argumentos.nome as string,
      );

    case "listar_produtos":
      return await listarProdutos();
      case "buscar_cliente":
  return await buscarCliente(
    argumentos.nome as string,
  );

case "criar_venda":
  return await criarVenda(
    argumentos.cliente_id as number,
    argumentos.produto_id as number,
    argumentos.quantidade as number,
    argumentos.metodo_pagamento as string,
  );

    default:
      throw new Error(
        `Tool desconhecida: ${nome}`,
      );
  }
}

const INSTRUCOES = `
És um assistente comercial responsável por produtos,
stock, clientes e vendas.

REGRAS:

- Nunca inventes IDs de clientes ou produtos.

- Antes de criar uma venda, deves identificar o cliente
  usando buscar_cliente.

- Antes de criar uma venda, deves identificar o produto
  usando buscar_produto.

- Usa apenas IDs devolvidos pelas tools.

- Não inventes preços, stock ou dados de clientes.

- Se o cliente não existir, não cries a venda.

- Se o produto não existir, não cries a venda.

- Se houver stock insuficiente, explica isso ao utilizador.

- Os preços estão em Metical (MZN).

- Depois de uma venda criada com sucesso, informa:
  cliente, produto, quantidade, total, método de pagamento
  e stock restante.
`;

async function main() {
  const pergunta =
    "Quanto custam as luvas de boxe e quantas caneleiras temos em stock?";

  console.log("\nUtilizador:");
  console.log(pergunta);

  // Primeira chamada ao modelo
  let response = await openai.responses.create({
    model: process.env.OPENAI_MODEL!,
    input: pergunta,
    tools,
    tool_choice: "auto",
  });

  // Proteção para evitar loops infinitos
  const MAX_ITERACOES = 10;

  for (let iteracao = 1; iteracao <= MAX_ITERACOES; iteracao++) {
    console.log(`\n--- Iteração ${iteracao} ---`);

    // Procurar TODAS as tool calls pedidas pelo modelo
    const toolCalls = response.output.filter(
      (item) => item.type === "function_call",
    );

    // Se não pediu nenhuma tool, terminou
    if (toolCalls.length === 0) {
      console.log("\nAssistente:");
      console.log(response.output_text);
      return;
    }

    console.log(
      `\nO modelo pediu ${toolCalls.length} tool(s).`,
    );

    const toolOutputs: Array<{
      type: "function_call_output";
      call_id: string;
      output: string;
    }> = [];

    // Executar todas as tools solicitadas
    for (const toolCall of toolCalls) {
      if (toolCall.type !== "function_call") {
        continue;
      }

      console.log("\nTool escolhida:");
      console.log(toolCall.name);

      const argumentos = JSON.parse(
        toolCall.arguments,
      );

      console.log("Argumentos:");
      console.log(argumentos);

      const resultado = await executarTool(
        toolCall.name,
        argumentos,
      );

      console.log("Resultado:");
      console.log(resultado);

      // Guardamos o resultado para devolver ao modelo
      toolOutputs.push({
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: JSON.stringify(resultado),
      });
    }

    // Devolver os resultados das tools ao modelo
    response = await openai.responses.create({
      model: process.env.OPENAI_MODEL!,
      previous_response_id: response.id,
      tools,
      tool_choice: "auto",
      input: toolOutputs,
    });
  }

  throw new Error(
    "O agente atingiu o limite máximo de iterações.",
  );
}

main();
