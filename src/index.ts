import "dotenv/config";
import OpenAI from "openai";

import { consultarStock } from "./tools/stock.js";
import {
  buscarProduto,
  listarProdutos,
} from "./tools/produtos.js";

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

    default:
      throw new Error(
        `Tool desconhecida: ${nome}`,
      );
  }
}

async function main() {
const pergunta =
  "Quais produtos temos disponíveis?";

  console.log("\nUtilizador:");
  console.log(pergunta);

  const response =
    await openai.responses.create({
      model: process.env.OPENAI_MODEL!,

      input: pergunta,

      tools,

      tool_choice: "auto",
    });

  const toolCall = response.output.find(
    (item) => item.type === "function_call",
  );

  if (
    !toolCall ||
    toolCall.type !== "function_call"
  ) {
    console.log("\nAssistente:");
    console.log(response.output_text);

    return;
  }

  console.log("\nTool escolhida:");
  console.log(toolCall.name);

  const argumentos = JSON.parse(
    toolCall.arguments,
  );

  console.log("\nArgumentos:");
  console.log(argumentos);

  const resultado = await executarTool(
    toolCall.name,
    argumentos,
  );

  console.log("\nResultado da Tool:");
  console.log(resultado);

  const finalResponse =
    await openai.responses.create({
      model: process.env.OPENAI_MODEL!,

      previous_response_id: response.id,

      tools,

      input: [
        {
          type: "function_call_output",

          call_id: toolCall.call_id,

          output: JSON.stringify(resultado),
        },
      ],
    });

  console.log("\nAssistente:");
  console.log(finalResponse.output_text);
}



main();