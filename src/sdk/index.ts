import "dotenv/config";

import {
  Agent,
  run,
  tool,
} from "@openai/agents";

import { z } from "zod";

import { consultarStock } from "../tools/stock.js";

import {
  buscarProduto,
  listarProdutos,
} from "../tools/produtos.js";


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

  execute: async ({ produto }) => {
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

  execute: async ({ nome }) => {
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
// AGENTE
// ======================================================

const agente = new Agent({
  name: "Agente Comercial",

  model:
    process.env.OPENAI_MODEL!,

  instructions: `
És um assistente comercial responsável por produtos
e stock.

Tens ferramentas para consultar informações reais
do sistema.

REGRAS:

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

- Nunca inventes preços ou quantidades.

- Usa sempre os dados devolvidos pelas tools.

- Os preços estão em Metical (MZN).

- Responde sempre em português.
`,

  tools: [
    consultarStockTool,
    buscarProdutoTool,
    listarProdutosTool,
  ],
});


// ======================================================
// EXECUÇÃO
// ======================================================

async function main() {
 const pergunta =
  "Qual é o produto mais barato que temos?";


  console.log(
    "\nUtilizador:",
  );

  console.log(
    pergunta,
  );


  const resultado =
    await run(
      agente,
      pergunta,
    );


  console.log(
    "\nAssistente:",
  );

  console.log(
    resultado.finalOutput,
  );
}


// ======================================================
// INICIAR
// ======================================================

main().catch(
  (error) => {
    console.error(
      "\nErro:",
      error,
    );

    process.exit(1);
  },
);