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

import {
  criarConversa,
  guardarMensagem,
  atualizarResponseId,
  buscarUltimaConversa,
} from "./memory/conversas.js";

import {
  criarEstadoInicial,
  obterEstado,
  atualizarEstado,
} from "./state/agent-state.js";


// ======================================================
// OPENAI
// ======================================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


// ======================================================
// TOOLS
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
  conversaId: number,
  nome: string,
  argumentos: Record<string, unknown>,
) {

  switch (nome) {

    // ==================================================
    // CONSULTAR STOCK
    // ==================================================

    case "consultar_stock":

      return await consultarStock(
        argumentos.produto as string,
      );


    // ==================================================
    // BUSCAR PRODUTO
    // ==================================================

    case "buscar_produto": {

      const resultado =
        await buscarProduto(
          argumentos.nome as string,
        );


      if (
        resultado.encontrado &&
        resultado.produto
      ) {

        await atualizarEstado(
          conversaId,
          {
            status:
              "produto_identificado",

            produto_id:
              resultado.produto.id,

            produto_nome:
              resultado.produto.nome,
          },
        );
      }


      return resultado;
    }


    // ==================================================
    // LISTAR PRODUTOS
    // ==================================================

    case "listar_produtos":

      return await listarProdutos();


    // ==================================================
    // BUSCAR CLIENTE
    // ==================================================

    case "buscar_cliente": {

      const resultado =
        await buscarCliente(
          argumentos.nome as string,
        );


      if (
        resultado.encontrado &&
        resultado.clientes
      ) {

        // ==============================================
        // APENAS UM CLIENTE ENCONTRADO
        // ==============================================

        if (
          resultado.clientes.length === 1
        ) {

          const cliente =
            resultado.clientes[0];


          if (cliente) {

            await atualizarEstado(
              conversaId,
              {
                operacao:
                  "criar_venda",

                status:
                  "cliente_identificado",

                cliente_id:
                  cliente.id,

                cliente_nome:
                  cliente.nome,
              },
            );
          }

        } else {

          // ============================================
          // MAIS DE UM CLIENTE ENCONTRADO
          // ============================================

          await atualizarEstado(
            conversaId,
            {
              operacao:
                "criar_venda",

              status:
                "aguardando_cliente",

              cliente_id:
                null,

              cliente_nome:
                null,
            },
          );
        }
      }


      return resultado;
    }


    // ==================================================
    // CRIAR VENDA
    // ==================================================

    case "criar_venda": {

      // ================================================
      // MARCAR OPERAÇÃO COMO EM EXECUÇÃO
      // ================================================

      await atualizarEstado(
        conversaId,
        {
          operacao:
            "criar_venda",

          status:
            "executando_venda",

          cliente_id:
            argumentos.cliente_id as number,

          produto_id:
            argumentos.produto_id as number,

          quantidade:
            argumentos.quantidade as number,

          metodo_pagamento:
            argumentos.metodo_pagamento as string,
        },
      );


      // ================================================
      // CRIAR VENDA REAL
      // ================================================

      const resultado =
        await criarVenda(
          argumentos.cliente_id as number,
          argumentos.produto_id as number,
          argumentos.quantidade as number,
          argumentos.metodo_pagamento as string,
        );


      const resultadoVenda =
        resultado as Record<
          string,
          unknown
        >;


      // ================================================
      // VENDA COM SUCESSO
      // ================================================

      if (
        resultadoVenda.sucesso === true
      ) {

        await atualizarEstado(
          conversaId,
          {
            status:
              "concluida",

            cliente_nome:
              resultadoVenda.cliente as string,

            produto_nome:
              resultadoVenda.produto as string,
          },
        );

      } else {

        // ==============================================
        // ERRO NA VENDA
        // ==============================================

        await atualizarEstado(
          conversaId,
          {
            status:
              "erro",
          },
        );
      }


      return resultado;
    }


    default:

      throw new Error(
        `Tool desconhecida: ${nome}`,
      );
  }
}


// ======================================================
// INSTRUÇÕES BASE DO AGENTE
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

- Pergunta ao utilizador qual é o cliente correto.

- Quando o utilizador escolher um cliente depois de
  uma situação ambígua, usa buscar_cliente novamente
  com o nome completo antes de criar a venda.

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
// CONSTRUIR INSTRUÇÕES COM AGENT STATE
// ======================================================

function construirInstrucoesComEstado(
  estado: unknown,
) {

  return `
${INSTRUCOES}

========================================================
ESTADO ATUAL DA TAREFA
========================================================

${JSON.stringify(
  estado,
  null,
  2,
)}

Usa o estado apenas como contexto adicional.

Os dados obtidos diretamente pelas tools são sempre
a fonte de verdade.

Nunca inventes dados que não estejam no estado,
na mensagem do utilizador ou no resultado das tools.
`;
}


// ======================================================
// PROCESSAR UMA MENSAGEM
// ======================================================

async function processarMensagem(
  conversaId: number,
  mensagem: string,
  previousResponseId?: string,
): Promise<string> {


  // ====================================================
  // GARANTIR QUE EXISTE ESTADO PARA ESTA CONVERSA
  // ====================================================

  await criarEstadoInicial(
    conversaId,
  );


  // ====================================================
  // GUARDAR MENSAGEM DO UTILIZADOR
  // ====================================================

  await guardarMensagem(
    conversaId,
    "user",
    mensagem,
  );


  // ====================================================
  // CARREGAR ESTADO ATUAL
  // ====================================================

  let estadoAtual =
    await obterEstado(
      conversaId,
    );


  let instrucoesComEstado =
    construirInstrucoesComEstado(
      estadoAtual,
    );


  // ====================================================
  // PRIMEIRA CHAMADA AO MODELO
  // ====================================================

  let response =
    await openai.responses.create({

      model:
        process.env.OPENAI_MODEL!,

      instructions:
        instrucoesComEstado,

      input:
        mensagem,

      tools,

      tool_choice:
        "auto",

      parallel_tool_calls:
        true,

      ...(previousResponseId
        ? {
            previous_response_id:
              previousResponseId,
          }
        : {}),
    });


  // ====================================================
  // PROTEÇÃO CONTRA LOOPS INFINITOS
  // ====================================================

  const MAX_ITERACOES = 10;


  // ====================================================
  // AGENT LOOP
  // ====================================================

  for (
    let iteracao = 1;
    iteracao <= MAX_ITERACOES;
    iteracao++
  ) {

    console.log(
      `\n--- Iteração ${iteracao} ---`,
    );


    // ==================================================
    // ENCONTRAR TOOL CALLS
    // ==================================================

    const toolCalls =
      response.output.filter(
        (item) =>
          item.type === "function_call",
      );


    // ==================================================
    // SEM TOOL CALL = RESPOSTA FINAL
    // ==================================================

    if (
      toolCalls.length === 0
    ) {

      const respostaFinal =
        response.output_text ||
        "Não foi possível gerar uma resposta.";


      console.log(
        "\nAssistente:",
      );


      console.log(
        respostaFinal,
      );


      // ================================================
      // GUARDAR RESPOSTA
      // ================================================

      await guardarMensagem(
        conversaId,
        "assistant",
        respostaFinal,
      );


      // ================================================
      // GUARDAR RESPONSE ID
      // ================================================

      await atualizarResponseId(
        conversaId,
        response.id,
      );


      return response.id;
    }


    console.log(
      `\nO modelo pediu ${toolCalls.length} tool(s).`,
    );


    // ==================================================
    // RESULTADOS DAS TOOLS
    // ==================================================

    const toolOutputs: Array<{
      type: "function_call_output";
      call_id: string;
      output: string;
    }> = [];


    // ==================================================
    // EXECUTAR TOOLS
    // ==================================================

    for (
      const toolCall of toolCalls
    ) {

      if (
        toolCall.type !==
        "function_call"
      ) {
        continue;
      }


      console.log(
        "\nTool escolhida:",
      );


      console.log(
        toolCall.name,
      );


      // ================================================
      // CONVERTER ARGUMENTOS
      // ================================================

      const argumentos =
        JSON.parse(
          toolCall.arguments,
        ) as Record<
          string,
          unknown
        >;


      console.log(
        "Argumentos:",
      );


      console.log(
        argumentos,
      );


      // ================================================
      // EXECUTAR TOOL
      // ================================================

      const resultado =
        await executarTool(
          conversaId,
          toolCall.name,
          argumentos,
        );


      console.log(
        "Resultado:",
      );


      console.log(
        resultado,
      );


      // ================================================
      // GUARDAR RESULTADO PARA O MODELO
      // ================================================

      toolOutputs.push({

        type:
          "function_call_output",

        call_id:
          toolCall.call_id,

        output:
          JSON.stringify(
            resultado,
          ),
      });
    }


    // ==================================================
    // RECARREGAR ESTADO DEPOIS DAS TOOLS
    // ==================================================

    estadoAtual =
      await obterEstado(
        conversaId,
      );


    instrucoesComEstado =
      construirInstrucoesComEstado(
        estadoAtual,
      );


    // ==================================================
    // DEVOLVER RESULTADOS AO MODELO
    // ==================================================

    response =
      await openai.responses.create({

        model:
          process.env.OPENAI_MODEL!,

        instructions:
          instrucoesComEstado,

        previous_response_id:
          response.id,

        tools,

        tool_choice:
          "auto",

        parallel_tool_calls:
          true,

        input:
          toolOutputs,
      });
  }


  throw new Error(
    "O agente atingiu o limite máximo de iterações.",
  );
}


// ======================================================
// APLICAÇÃO PRINCIPAL
// ======================================================

async function main() {

  const rl =
    createInterface({
      input,
      output,
    });


  console.log(
    "\n===================================",
  );

  console.log(
    "       AGENT COMMERCE",
  );

  console.log(
    "===================================\n",
  );


  // ====================================================
  // BUSCAR ÚLTIMA CONVERSA
  // ====================================================

  const ultimaConversa =
    await buscarUltimaConversa();


  let conversaId:
    number | null = null;


  let previousResponseId:
    string | undefined;


  // ====================================================
  // CONVERSA EXISTENTE
  // ====================================================

  if (
    ultimaConversa
  ) {

    console.log(
      "Encontrei uma conversa anterior:\n",
    );


    console.log(
      `ID: ${ultimaConversa.id}`,
    );


    console.log(
      `Título: ${ultimaConversa.titulo}`,
    );


    console.log(
      "\n1 - Continuar conversa",
    );


    console.log(
      "2 - Nova conversa\n",
    );


    const escolha =
      await rl.question(
        "Escolha uma opção: ",
      );


    // ==================================================
    // CONTINUAR
    // ==================================================

    if (
      escolha.trim() === "1"
    ) {

      conversaId =
        ultimaConversa.id;


      previousResponseId =
        ultimaConversa
          .openai_response_id ??
        undefined;


      // ================================================
      // GARANTIR QUE CONVERSAS ANTIGAS TAMBÉM TENHAM STATE
      // ================================================

      await criarEstadoInicial(
        conversaId,
      );


      console.log(
        "\nConversa retomada.\n",
      );

    } else {

      console.log(
        "\nNova conversa iniciada.\n",
      );
    }
  }


  console.log(
    'Escreve "sair" para terminar.\n',
  );


  // ====================================================
  // CONVERSATION LOOP
  // ====================================================

  while (true) {

    const mensagem =
      await rl.question(
        "Você: ",
      );


    const mensagemLimpa =
      mensagem.trim();


    // ==================================================
    // MENSAGEM VAZIA
    // ==================================================

    if (
      !mensagemLimpa
    ) {
      continue;
    }


    // ==================================================
    // SAIR
    // ==================================================

    if (
      mensagemLimpa
        .toLowerCase() ===
      "sair"
    ) {

      console.log(
        "\nConversa terminada.",
      );


      rl.close();


      break;
    }


    try {

      // ================================================
      // CRIAR CONVERSA
      // ================================================

      if (
        conversaId === null
      ) {

        let titulo =
          mensagemLimpa;


        if (
          titulo.length > 60
        ) {

          titulo =
            titulo.substring(
              0,
              60,
            ) + "...";
        }


        const novaConversa =
          await criarConversa(
            titulo,
          );


        conversaId =
          novaConversa.id;


        // ==============================================
        // CRIAR AGENT STATE
        // ==============================================

        await criarEstadoInicial(
          conversaId,
        );


        // ==============================================
        // NOVA CONVERSA NÃO TEM RESPONSE ANTERIOR
        // ==============================================

        previousResponseId =
          undefined;


        console.log(
          `\nNova conversa criada (ID ${conversaId}).`,
        );
      }


      // ================================================
      // PROCESSAR MENSAGEM
      // ================================================

      previousResponseId =
        await processarMensagem(
          conversaId,
          mensagemLimpa,
          previousResponseId,
        );


      console.log();

    } catch (error) {

      console.error(
        "\nErro ao processar mensagem:",
      );


      if (
        error instanceof Error
      ) {

        console.error(
          error.message,
        );

      } else {

        console.error(
          error,
        );
      }
    }
  }
}


// ======================================================
// INICIAR APLICAÇÃO
// ======================================================

main().catch(
  (error) => {

    console.error(
      "\nErro fatal ao iniciar aplicação:",
    );


    if (
      error instanceof Error
    ) {

      console.error(
        error.message,
      );

    } else {

      console.error(
        error,
      );
    }


    process.exit(1);
  },
);