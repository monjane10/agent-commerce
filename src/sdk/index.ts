import "dotenv/config";

import {
  Agent,
  run,
  tool,
} from "@openai/agents";

import { z } from "zod";

import readline from "node:readline/promises";

import {
  stdin as input,
  stdout as output,
} from "node:process";

import {
  randomUUID,
} from "node:crypto";

import {
  consultarStock,
} from "../tools/stock.js";

import {
  buscarProduto,
  listarProdutos,
} from "../tools/produtos.js";

import {
  buscarCliente,
} from "../tools/clientes.js";

import {
  criarVenda,
} from "../tools/vendas.js";

import {
  supabase,
} from "../lib/supabase.js";

import {
  SupabaseSession,
} from "./supabase-session.js";


// ======================================================
// TOOL 1 - CONSULTAR STOCK
// ======================================================

const consultarStockTool = tool({
  name: "consultar_stock",

  description:
    "Consulta especificamente a quantidade disponível em stock de um produto.",

  parameters: z.object({
    produto: z.string(),
  }),

  execute: async ({
    produto,
  }) => {
    console.log(
      "\nTool executada:",
    );

    console.log(
      "consultar_stock",
    );

    console.log(
      "Produto:",
    );

    console.log(
      produto,
    );


    const resultado =
      await consultarStock(
        produto,
      );


    console.log(
      "Resultado:",
    );

    console.log(
      resultado,
    );


    return resultado;
  },
});


// ======================================================
// TOOL 2 - BUSCAR PRODUTO
// ======================================================

const buscarProdutoTool = tool({
  name: "buscar_produto",

  description:
    "Procura informações completas de um produto, incluindo nome, preço, moeda e quantidade disponível.",

  parameters: z.object({
    nome: z.string(),
  }),

  execute: async ({
    nome,
  }) => {
    console.log(
      "\nTool executada:",
    );

    console.log(
      "buscar_produto",
    );

    console.log(
      "Produto procurado:",
    );

    console.log(
      nome,
    );


    const resultado =
      await buscarProduto(
        nome,
      );


    console.log(
      "Resultado:",
    );

    console.log(
      resultado,
    );


    return resultado;
  },
});


// ======================================================
// TOOL 3 - LISTAR PRODUTOS
// ======================================================

const listarProdutosTool = tool({
  name: "listar_produtos",

  description:
    "Lista todos os produtos disponíveis no sistema, incluindo nome, preço, moeda e quantidade em stock.",

  parameters: z.object({}),

  execute: async () => {
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
    );

    console.log(
      resultado,
    );


    return resultado;
  },
});


// ======================================================
// TOOL 4 - BUSCAR CLIENTE
// ======================================================

const buscarClienteTool = tool({
  name: "buscar_cliente",

  description:
    "Procura clientes pelo nome e devolve os clientes encontrados com ID, nome e email.",

  parameters: z.object({
    nome: z.string(),
  }),

  execute: async ({
    nome,
  }) => {
    console.log(
      "\nTool executada:",
    );

    console.log(
      "buscar_cliente",
    );

    console.log(
      "Cliente procurado:",
    );

    console.log(
      nome,
    );


    const resultado =
      await buscarCliente(
        nome,
      );


    console.log(
      "Resultado:",
    );

    console.log(
      resultado,
    );


    return resultado;
  },
});


// ======================================================
// TOOL 5 - CRIAR VENDA
// ======================================================

const criarVendaTool = tool({
  name: "criar_venda",

  description:
    "Regista uma venda para um cliente e produto previamente identificados e atualiza o stock.",

  parameters: z.object({
    cliente_id: z
      .number()
      .int()
      .positive(),

    produto_id: z
      .number()
      .int()
      .positive(),

    quantidade: z
      .number()
      .int()
      .positive(),

    metodo_pagamento:
      z.string(),
  }),

  execute: async ({
    cliente_id,
    produto_id,
    quantidade,
    metodo_pagamento,
  }) => {
    console.log(
      "\nTool executada:",
    );

    console.log(
      "criar_venda",
    );

    console.log(
      "Dados da venda:",
    );

    console.log({
      cliente_id,
      produto_id,
      quantidade,
      metodo_pagamento,
    });


    const resultado =
      await criarVenda(
        cliente_id,
        produto_id,
        quantidade,
        metodo_pagamento,
      );


    console.log(
      "Resultado:",
    );

    console.log(
      resultado,
    );


    return resultado;
  },
});


// ======================================================
// AGENTE
// ======================================================

const agente = new Agent({
  name:
    "Agente Comercial",

  model:
    process.env.OPENAI_MODEL!,

  instructions: `
És um assistente comercial responsável por produtos,
stock, clientes e vendas.

Tens ferramentas para consultar e alterar informações
reais do sistema.

========================================================
PRODUTOS E STOCK
========================================================

- Se o utilizador perguntar especificamente pela
  quantidade disponível de um produto, usa
  consultar_stock.

- Se o utilizador perguntar pelo preço, moeda,
  informações completas ou detalhes de um produto,
  usa buscar_produto.

- Se o utilizador pedir para listar, mostrar ou
  conhecer os produtos disponíveis, usa
  listar_produtos.

- Se o utilizador perguntar qual é o produto mais
  barato, mais caro ou fizer uma comparação entre
  todos os produtos, usa listar_produtos e analisa
  os dados devolvidos.

========================================================
CLIENTES
========================================================

- Para identificar um cliente, usa buscar_cliente.

- Nunca inventes IDs de clientes.

- Usa exclusivamente IDs devolvidos pela tool
  buscar_cliente.

- Se buscar_cliente devolver vários clientes,
  não escolhas sozinho.

- Nesse caso, apresenta as opções encontradas e pede
  ao utilizador para indicar qual é o cliente correto.

- Se o utilizador posteriormente indicar um cliente
  específico depois de uma pesquisa ambígua, usa
  buscar_cliente novamente com o nome completo.

========================================================
VENDAS
========================================================

- Quando o utilizador pedir para registar uma venda,
  identifica primeiro o cliente usando
  buscar_cliente.

- Depois identifica o produto usando
  buscar_produto.

- Nunca inventes cliente_id.

- Nunca inventes produto_id.

- Usa exclusivamente IDs devolvidos pelas tools.

- Só usa criar_venda depois de ter identificado
  corretamente o cliente e o produto.

- Usa exatamente a quantidade indicada pelo
  utilizador.

- Usa o método de pagamento indicado pelo
  utilizador.

- Se o método de pagamento não tiver sido informado,
  pede ao utilizador antes de criar a venda.

- Não inventes métodos de pagamento.

- Se houver vários clientes possíveis, não cries
  a venda até o utilizador esclarecer qual cliente
  pretende.

- Depois de criar_venda, informa claramente se a
  operação foi concluída ou se ocorreu algum erro.

========================================================
CONTEXTO DA CONVERSA
========================================================

- Usa o histórico da conversa para compreender
  referências como:

  "esse produto"
  "esse cliente"
  "dele"
  "dela"
  "o mais barato"
  "o produto anterior"

- Mesmo tendo contexto da conversa, nunca inventes
  informações que deveriam vir da base de dados.

- Quando precisares de dados atuais do negócio,
  usa as tools.

========================================================
REGRAS GERAIS
========================================================

- Nunca inventes preços, quantidades, stock,
  clientes ou IDs.

- Usa sempre os dados devolvidos pelas tools como
  fonte de verdade.

- Os preços estão em Metical (MZN).

- Responde sempre em português.
`,

  tools: [
    consultarStockTool,
    buscarProdutoTool,
    listarProdutosTool,
    buscarClienteTool,
    criarVendaTool,
  ],
});


// ======================================================
// TIPO DE CONVERSA SDK
// ======================================================

type ConversaSdk = {
  id: number;

  titulo: string;

  sdk_session_id: string;

  created_at: string;

  updated_at: string;
};


// ======================================================
// BUSCAR ÚLTIMA CONVERSA SDK
// ======================================================

async function buscarUltimaConversaSdk():
  Promise<ConversaSdk | null> {

  const {
    data,
    error,
  } = await supabase
    .from("conversas")
    .select(`
      id,
      titulo,
      sdk_session_id,
      created_at,
      updated_at
    `)
    .not(
      "sdk_session_id",
      "is",
      null,
    )
    .order(
      "updated_at",
      {
        ascending: false,
      },
    )
    .limit(1);


  if (error) {
    throw new Error(
      `Erro ao procurar conversa: ${error.message}`,
    );
  }


  const conversa =
    data?.[0];


  if (
    !conversa ||
    !conversa.sdk_session_id
  ) {
    return null;
  }


  return {
    id:
      conversa.id,

    titulo:
      conversa.titulo,

    sdk_session_id:
      conversa.sdk_session_id,

    created_at:
      conversa.created_at,

    updated_at:
      conversa.updated_at,
  };
}


// ======================================================
// GERAR NOVO SESSION ID
// ======================================================

function gerarSessionId():
  string {

  return (
    `agent-commerce-${randomUUID()}`
  );
}


// ======================================================
// ESCOLHER SESSÃO
// ======================================================

async function escolherSessionId(
  rl: readline.Interface,
): Promise<string> {

  const ultimaConversa =
    await buscarUltimaConversaSdk();


  // ====================================================
  // NÃO EXISTE CONVERSA ANTERIOR
  // ====================================================

  if (!ultimaConversa) {
    const novaSessionId =
      gerarSessionId();


    console.log(
      "Nenhuma conversa anterior encontrada.",
    );

    console.log(
      "Nova conversa iniciada.\n",
    );


    return novaSessionId;
  }


  // ====================================================
  // EXISTE CONVERSA ANTERIOR
  // ====================================================

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
    `Sessão: ${ultimaConversa.sdk_session_id}`,
  );


  console.log(`
1 - Continuar conversa
2 - Nova conversa
`);


  while (true) {
    const escolha =
      await rl.question(
        "Escolha uma opção: ",
      );


    const opcao =
      escolha.trim();


    // ==================================================
    // CONTINUAR CONVERSA
    // ==================================================

    if (opcao === "1") {
      console.log(
        "\nConversa anterior carregada.\n",
      );


      return (
        ultimaConversa.sdk_session_id
      );
    }


    // ==================================================
    // NOVA CONVERSA
    // ==================================================

    if (opcao === "2") {
      const novaSessionId =
        gerarSessionId();


      console.log(
        "\nNova conversa iniciada.\n",
      );


      return novaSessionId;
    }


    // ==================================================
    // OPÇÃO INVÁLIDA
    // ==================================================

    console.log(
      "\nOpção inválida.",
    );

    console.log(
      "Escolha 1 ou 2.\n",
    );
  }
}


// ======================================================
// EXECUÇÃO
// ======================================================

async function main() {
  const rl =
    readline.createInterface({
      input,
      output,
    });


  console.log(`
===================================
    AGENT COMMERCE - AGENTS SDK
===================================
`);


  // ====================================================
  // ESCOLHER CONVERSA
  // ====================================================

  const sessionId =
    await escolherSessionId(
      rl,
    );


  // ====================================================
  // CRIAR SUPABASE SESSION
  // ====================================================

  const session =
    new SupabaseSession({
      sessionId,
    });


  console.log(
    `Sessão ativa: ${sessionId}`,
  );


  console.log(`
Escreve "sair" para terminar.
`);


  // ====================================================
  // CONVERSATION LOOP
  // ====================================================

  while (true) {
    const mensagem =
      await rl.question(
        "Você: ",
      );


    const texto =
      mensagem.trim();


    // --------------------------------------------------
    // IGNORAR TEXTO VAZIO
    // --------------------------------------------------

    if (!texto) {
      continue;
    }


    // --------------------------------------------------
    // SAIR
    // --------------------------------------------------

    if (
      texto.toLowerCase() ===
      "sair"
    ) {
      console.log(
        "\nConversa terminada.",
      );

      break;
    }


    try {
      // ================================================
      // EXECUTAR AGENTE
      // ================================================

      const resultado =
        await run(
          agente,
          texto,
          {
            session,
          },
        );


      // ================================================
      // RESPOSTA FINAL
      // ================================================

      console.log(
        "\nAssistente:",
      );


      console.log(
        resultado.finalOutput,
      );


      console.log();
    }
    catch (error) {
      console.error(
        "\nErro ao processar mensagem:",
      );


      console.error(
        error,
      );


      console.log();
    }
  }


  rl.close();
}


// ======================================================
// INICIAR
// ======================================================

main().catch(
  (error) => {
    console.error(
      "\nErro fatal:",
    );


    console.error(
      error,
    );


    process.exit(1);
  },
);