import "dotenv/config";

import OpenAI from "openai";

import { createInterface } from "node:readline/promises";
import {
  stdin as input,
  stdout as output,
} from "node:process";

import { consultarStock } from "./tools/stock.js";

import {
  buscarProduto,
  listarProdutos,
} from "./tools/produtos.js";

import { buscarCliente } from "./tools/clientes.js";

import { criarVenda } from "./tools/vendas.js";


// ======================================================
// OPENAI
// ======================================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


// ======================================================
// TOOLS DISPONÍVEIS PARA O AGENTE
// ======================================================

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
          description:
            "Nome do produto que deve ser procurado",
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


// ======================================================
// EXECUTOR DAS TOOLS
// ======================================================

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


// ======================================================
// INSTRUÇÕES DO AGENTE
// ======================================================

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

- Se forem encontrados vários clientes com nomes
  semelhantes, não escolhas um deles sozinho.
  Pergunta ao utilizador qual é o cliente correto.

- Se o cliente não existir, não cries a venda.

- Se o produto não existir, não cries a venda.

- Se houver stock insuficiente, explica isso ao utilizador.

- Os preços estão em Metical (MZN).

- Depois de uma venda criada com sucesso, informa:
  cliente,
  produto,
  quantidade,
  preço unitário,
  total,
  método de pagamento
  e stock restante.

- Responde sempre em português.
`;


// ======================================================
// PROCESSAR UMA MENSAGEM DO UTILIZADOR
// ======================================================

async function processarMensagem(
  mensagem: string,
  previousResponseId?: string,
): Promise<string> {

  let response = await openai.responses.create({
    model: process.env.OPENAI_MODEL!,

    instructions: INSTRUCOES,

    input: mensagem,

    tools,

    tool_choice: "auto",

    parallel_tool_calls: true,

    ...(previousResponseId
      ? {
          previous_response_id:
            previousResponseId,
        }
      : {}),
  });


  // Proteção contra loops infinitos
  const MAX_ITERACOES = 10;


  for (
    let iteracao = 1;
    iteracao <= MAX_ITERACOES;
    iteracao++
  ) {

    console.log(
      `\n--- Iteração ${iteracao} ---`,
    );


    // Encontrar todas as function calls
    const toolCalls = response.output.filter(
      (item) =>
        item.type === "function_call",
    );


    // ==================================================
    // NÃO EXISTEM MAIS TOOLS PARA EXECUTAR
    // ==================================================

    if (toolCalls.length === 0) {

      console.log("\nAssistente:");

      console.log(
        response.output_text ||
          "Não foi possível gerar uma resposta.",
      );

      // Devolvemos o ID para continuar
      // a conversa posteriormente
      return response.id;
    }


    console.log(
      `\nO modelo pediu ${toolCalls.length} tool(s).`,
    );


    // Resultados que serão enviados
    // novamente ao modelo
    const toolOutputs: Array<{
      type: "function_call_output";
      call_id: string;
      output: string;
    }> = [];


    // ==================================================
    // EXECUTAR TODAS AS TOOLS PEDIDAS
    // ==================================================

    for (const toolCall of toolCalls) {

      if (
        toolCall.type !== "function_call"
      ) {
        continue;
      }


      console.log("\nTool escolhida:");

      console.log(toolCall.name);


      // Converter argumentos JSON
      const argumentos = JSON.parse(
        toolCall.arguments,
      ) as Record<string, unknown>;


      console.log("Argumentos:");

      console.log(argumentos);


      // Executar a função real
      const resultado =
        await executarTool(
          toolCall.name,
          argumentos,
        );


      console.log("Resultado:");

      console.log(resultado);


      // Preparar resultado para devolver
      // ao modelo
      toolOutputs.push({
        type: "function_call_output",

        call_id: toolCall.call_id,

        output: JSON.stringify(resultado),
      });
    }


    // ==================================================
    // DEVOLVER RESULTADOS DAS TOOLS AO MODELO
    // ==================================================

    response =
      await openai.responses.create({
        model:
          process.env.OPENAI_MODEL!,

        instructions: INSTRUCOES,

        previous_response_id:
          response.id,

        tools,

        tool_choice: "auto",

        parallel_tool_calls: true,

        input: toolOutputs,
      });
  }


  throw new Error(
    "O agente atingiu o limite máximo de iterações.",
  );
}


// ======================================================
// CONVERSA CONTÍNUA NO TERMINAL
// ======================================================

async function main() {

  const rl = createInterface({
    input,
    output,
  });


  let previousResponseId:
    | string
    | undefined;


  console.log(
    "\n===================================",
  );

  console.log(
    "       AGENT COMMERCE",
  );

  console.log(
    "===================================",
  );

  console.log(
    '\nEscreve "sair" para terminar.\n',
  );


  while (true) {

    const mensagem =
      await rl.question("Você: ");


    const mensagemLimpa =
      mensagem.trim();


    // Ignorar mensagens vazias
    if (!mensagemLimpa) {
      continue;
    }


    // Encerrar aplicação
    if (
      mensagemLimpa.toLowerCase() ===
      "sair"
    ) {

      console.log(
        "\nConversa terminada.",
      );

      rl.close();

      break;
    }


    try {

      previousResponseId =
        await processarMensagem(
          mensagemLimpa,
          previousResponseId,
        );


      console.log();

    } catch (error) {

      console.error(
        "\nErro ao processar mensagem:",
      );

      console.error(error);
    }
  }
}


// ======================================================
// INICIAR PROGRAMA
// ======================================================

main();