import "dotenv/config";
import OpenAI from "openai";

import { consultarStock } from "./tools/stock.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const tools = [
  {
    type: "function" as const,

    name: "consultar_stock",

    description:
      "Consulta a quantidade disponível em stock de um produto.",

    strict: true,

    parameters: {
      type: "object",
      properties: {
        produto: {
          type: "string",
          description: "Nome do produto que deve ser consultado",
        },
      },
      required: ["produto"],
      additionalProperties: false,
    },
  },
];

async function main() {
  const pergunta = "Quantas luvas de boxe temos em stock?";

  console.log("Utilizador:", pergunta);

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL!,
    input: pergunta,
    tools,
    tool_choice: "auto",
  });

  console.log("\nResposta inicial do modelo:");

  console.log(response.output);

  const toolCall = response.output.find(
    (item) => item.type === "function_call",
  );

  if (!toolCall || toolCall.type !== "function_call") {
    console.log("\nResposta:");
    console.log(response.output_text);
    return;
  }

  console.log("\nTool escolhida:");
  console.log(toolCall.name);

  console.log("\nArgumentos:");
  console.log(toolCall.arguments);

  const argumentos = JSON.parse(toolCall.arguments);

  if (toolCall.name === "consultar_stock") {
    const resultado = await consultarStock(argumentos.produto);

    console.log("\nResultado da nossa função:");
    console.log(resultado);

    const finalResponse = await openai.responses.create({
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

    console.log("\nResposta final:");
    console.log(finalResponse.output_text);
  }
}

main();