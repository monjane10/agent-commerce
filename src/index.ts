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
