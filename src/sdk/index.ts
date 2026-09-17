import "dotenv/config";

import {
  Agent,
  run,
  tool,
} from "@openai/agents";

import type {
  RunContext,
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
  criarEstadoInicial,
  obterEstado,
  atualizarEstado,
} from "../state/agent-state.js";

import type {
  AgentState,
} from "../state/agent-state.js";

import {
  SupabaseSession,
} from "./supabase-session.js";


// ======================================================
// CONTEXTO DO AGENTE
// ======================================================

type AgentCommerceContext = {
  conversaId: number;
  estado: AgentState;
};


// ======================================================
// VENDA EM CURSO
// ======================================================

function vendaEmCurso(
  estado: AgentState,
): boolean {
  if (
    estado.operacao !== "criar_venda"
  ) {
    return false;
  }

  return ![
    "idle",
    "concluida",
    "erro",
    "cancelada",
  ].includes(
    estado.status,
  );
}


// ======================================================
// ATUALIZAR ESTADO + CONTEXTO
// ======================================================

async function atualizarEstadoContexto(
  runContext:
    RunContext<AgentCommerceContext> | undefined,

  dados: Partial<
    Omit<
      AgentState,
      "conversa_id" | "updated_at"
    >
  >,
): Promise<AgentState | null> {
  if (!runContext) {
    return null;
  }


  const novoEstado =
    await atualizarEstado(
      runContext.context.conversaId,
      dados,
    );


  runContext.context.estado =
    novoEstado;


  return novoEstado;
}


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

  execute: async (
    {
      nome,
    },

    runContext?:
      RunContext<AgentCommerceContext>,
  ) => {
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


    if (
      runContext &&
      vendaEmCurso(
        runContext.context.estado,
      )
    ) {
      if (
        resultado.encontrado &&
        "produto" in resultado &&
        resultado.produto
      ) {
        await atualizarEstadoContexto(
          runContext,
          {
            produto_id:
              resultado.produto.id,

            produto_nome:
              resultado.produto.nome,

            status:
              "produto_identificado",
          },
        );
      }
      else {
        await atualizarEstadoContexto(
          runContext,
          {
            produto_id:
              null,

            status:
              "aguardando_produto",
          },
        );
      }
    }


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

  parameters:
    z.object({}),

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

  execute: async (
    {
      nome,
    },

    runContext?:
      RunContext<AgentCommerceContext>,
  ) => {
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


    const clientes =
      "clientes" in resultado &&
      Array.isArray(
        resultado.clientes,
      )
        ? resultado.clientes
        : [];


    if (
      runContext &&
      vendaEmCurso(
        runContext.context.estado,
      )
    ) {
      // -----------------------------------------------
      // UM CLIENTE
      // -----------------------------------------------

      if (
        clientes.length === 1
      ) {
        const cliente =
          clientes[0];


        if (cliente) {
          await atualizarEstadoContexto(
            runContext,
            {
              cliente_id:
                cliente.id,

              cliente_nome:
                cliente.nome,

              status:
                "cliente_identificado",
            },
          );
        }
      }

      // -----------------------------------------------
      // VÁRIOS CLIENTES
      // -----------------------------------------------

      else if (
        clientes.length > 1
      ) {
        await atualizarEstadoContexto(
          runContext,
          {
            cliente_id:
              null,

            status:
              "aguardando_cliente",
          },
        );
      }

      // -----------------------------------------------
      // NENHUM CLIENTE
      // -----------------------------------------------

      else {
        await atualizarEstadoContexto(
          runContext,
          {
            cliente_id:
              null,

            status:
              "aguardando_cliente",
          },
        );
      }
    }


    return resultado;
  },
});


// ======================================================
// TOOL 5 - PREPARAR VENDA
// ======================================================

const prepararVendaTool = tool({
  name: "preparar_venda",

  description:
    "Prepara e guarda o estado estruturado de uma operação de venda antes da sua execução.",

  parameters: z.object({
    cliente_nome:
      z.string().nullable(),

    produto_nome:
      z.string().nullable(),

    quantidade:
      z
        .number()
        .int()
        .positive()
        .nullable(),

    metodo_pagamento:
      z.string().nullable(),
  }),

  execute: async (
    {
      cliente_nome,
      produto_nome,
      quantidade,
      metodo_pagamento,
    },

    runContext?:
      RunContext<AgentCommerceContext>,
  ) => {
    if (!runContext) {
      return {
        sucesso:
          false,

        erro:
          "Contexto do agente não disponível.",
      };
    }


    const estadoAtual =
      runContext.context.estado;


    const continuarVenda =
      vendaEmCurso(
        estadoAtual,
      );


    const clienteNomeFinal =
      cliente_nome ??
      (
        continuarVenda
          ? estadoAtual.cliente_nome
          : null
      );


    const produtoNomeFinal =
      produto_nome ??
      (
        continuarVenda
          ? estadoAtual.produto_nome
          : null
      );


    const quantidadeFinal =
      quantidade ??
      (
        continuarVenda
          ? estadoAtual.quantidade
          : null
      );


    const metodoPagamentoFinal =
      metodo_pagamento ??
      (
        continuarVenda
          ? estadoAtual.metodo_pagamento
          : null
      );


    const clienteIdFinal =
      continuarVenda
        ? estadoAtual.cliente_id
        : null;


    const produtoIdFinal =
      continuarVenda
        ? estadoAtual.produto_id
        : null;


    let status =
      "preparando_venda";


    if (!clienteNomeFinal) {
      status =
        "aguardando_cliente";
    }
    else if (!produtoNomeFinal) {
      status =
        "aguardando_produto";
    }
    else if (!quantidadeFinal) {
      status =
        "aguardando_quantidade";
    }
    else if (!metodoPagamentoFinal) {
      status =
        "aguardando_pagamento";
    }


    const novoEstado =
      await atualizarEstadoContexto(
        runContext,
        {
          operacao:
            "criar_venda",

          status,

          cliente_id:
            clienteIdFinal,

          cliente_nome:
            clienteNomeFinal,

          produto_id:
            produtoIdFinal,

          produto_nome:
            produtoNomeFinal,

          quantidade:
            quantidadeFinal,

          metodo_pagamento:
            metodoPagamentoFinal,
        },
      );


    console.log(
      "\nEstado da venda preparado:",
    );

    console.log(
      novoEstado,
    );


    return {
      sucesso:
        true,

      estado:
        novoEstado,
    };
  },
});


// ======================================================
// TOOL 6 - CRIAR VENDA
// ======================================================

const criarVendaTool = tool({
  name: "criar_venda",

  description:
    "Regista uma venda para um cliente e produto previamente identificados e atualiza o stock.",

  // ====================================================
  // HUMAN-IN-THE-LOOP
  // ====================================================

  needsApproval: true,

  parameters: z.object({
    cliente_id:
      z
        .number()
        .int()
        .positive(),

    produto_id:
      z
        .number()
        .int()
        .positive(),

    quantidade:
      z
        .number()
        .int()
        .positive(),

    metodo_pagamento:
      z.string(),
  }),

  execute: async (
    {
      cliente_id,
      produto_id,
      quantidade,
      metodo_pagamento,
    },

    runContext?:
      RunContext<AgentCommerceContext>,
  ) => {
    // IMPORTANTE:
    // este código só é executado DEPOIS
    // da aprovação humana.

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


    await atualizarEstadoContexto(
      runContext,
      {
        operacao:
          "criar_venda",

        status:
          "executando_venda",

        cliente_id,

        produto_id,

        quantidade,

        metodo_pagamento,
      },
    );


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


    const vendaResultado =
      resultado as {
        sucesso?: boolean;
        cliente?: string;
        produto?: string;
      } | null;


    // ==================================================
    // VENDA CONCLUÍDA
    // ==================================================

    if (
      vendaResultado?.sucesso ===
      true
    ) {
      await atualizarEstadoContexto(
        runContext,
        {
          status:
            "concluida",

          cliente_nome:
            typeof vendaResultado.cliente ===
            "string"
              ? vendaResultado.cliente
              : (
                runContext?.context.estado
                  .cliente_nome ??
                null
              ),

          produto_nome:
            typeof vendaResultado.produto ===
            "string"
              ? vendaResultado.produto
              : (
                runContext?.context.estado
                  .produto_nome ??
                null
              ),
        },
      );
    }

    // ==================================================
    // ERRO
    // ==================================================

    else {
      await atualizarEstadoContexto(
        runContext,
        {
          status:
            "erro",
        },
      );
    }


    return resultado;
  },
});


// ======================================================
// INSTRUÇÕES BASE
// ======================================================

const INSTRUCOES_BASE = `
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

- Se o utilizador indicar depois um cliente específico
  após uma pesquisa ambígua, usa buscar_cliente
  novamente com o nome completo.

========================================================
VENDAS
========================================================

- Quando o utilizador pedir para registar uma nova
  venda, usa primeiro preparar_venda.

- preparar_venda serve para guardar de forma
  estruturada os dados fornecidos pelo utilizador.

- Depois de preparar a venda, identifica o cliente
  usando buscar_cliente.

- Identifica o produto usando buscar_produto.

- Nunca inventes cliente_id.

- Nunca inventes produto_id.

- Usa exclusivamente IDs devolvidos pelas tools.

- Só usa criar_venda depois de o cliente e o produto
  terem sido corretamente identificados.

- Nunca uses IDs de uma venda antiga ou concluída
  para iniciar uma venda nova.

- Usa exatamente a quantidade indicada pelo
  utilizador.

- Usa o método de pagamento indicado pelo
  utilizador.

- Se faltar quantidade, pede a quantidade antes
  de executar a venda.

- Se faltar método de pagamento, pede ao utilizador
  antes de executar a venda.

- Não inventes métodos de pagamento.

- Se houver vários clientes possíveis, não cries
  a venda até o utilizador esclarecer qual pretende.

- Depois da escolha do cliente, usa buscar_cliente
  novamente com o nome completo antes de criar
  a venda.

- Se o produto não existir, não executes a venda.

- Se criar_venda devolver erro de stock ou outro
  erro, informa claramente o utilizador.

========================================================
APROVAÇÃO HUMANA
========================================================

- A tool criar_venda exige aprovação humana.

- A aplicação controla a aprovação.

- Nunca tentes contornar a etapa de aprovação.

- Não consideres uma venda concluída enquanto
  criar_venda não tiver sido efetivamente executada.

- Se a venda for rejeitada pelo utilizador, considera
  a operação cancelada.

- Depois de uma rejeição, não tentes criar novamente
  a mesma venda sem um novo pedido explícito do
  utilizador.

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

- O histórico da conversa e o Agent State são
  complementares.

- A Session guarda o que foi conversado.

- O Agent State representa a operação estruturada
  que está em curso.

- Mesmo tendo histórico e estado, nunca inventes
  informações que deveriam vir da base de dados.

- Para preços, stock, IDs de clientes, IDs de produtos
  e outros dados atuais do negócio, usa as tools.

========================================================
REGRAS GERAIS
========================================================

- Nunca inventes preços, quantidades, stock,
  clientes ou IDs.

- Usa sempre os dados devolvidos pelas tools como
  fonte de verdade.

- Os preços estão em Metical (MZN).

- Responde sempre em português.
`;


// ======================================================
// INSTRUÇÕES DINÂMICAS
// ======================================================

function construirInstrucoes(
  runContext:
    RunContext<AgentCommerceContext>,
): string {
  return `
${INSTRUCOES_BASE}

========================================================
ESTADO ATUAL DA TAREFA
========================================================

${JSON.stringify(
  runContext.context.estado,
  null,
  2,
)}

O estado acima representa a tarefa estruturada
associada a esta conversa.

Usa-o apenas como contexto adicional.

O histórico da Session e os dados devolvidos pelas
tools continuam disponíveis.

Os resultados atuais das tools e da base de dados
são sempre a fonte de verdade.

Se o estado estiver com status "concluida", "erro"
ou "cancelada" e o utilizador pedir uma nova venda,
começa uma nova operação usando preparar_venda.
`;
}


// ======================================================
// AGENTE
// ======================================================

const agente =
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


// ======================================================
// TIPOS
// ======================================================

type ConversaSdk = {
  id: number;

  titulo: string;

  sdk_session_id: string;

  created_at: string;

  updated_at: string;
};


type SessaoSelecionada = {
  sessionId: string;

  novaConversa: boolean;
};


// ======================================================
// LISTAR CONVERSAS
// ======================================================

async function listarConversasSdk():
  Promise<ConversaSdk[]> {
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
    );


  if (error) {
    throw new Error(
      `Erro ao listar conversas: ${error.message}`,
    );
  }


  return (
    data ?? []
  )
    .filter(
      (conversa) =>
        conversa.sdk_session_id !==
        null,
    )
    .map(
      (conversa) => ({
        id:
          conversa.id,

        titulo:
          conversa.titulo,

        sdk_session_id:
          conversa.sdk_session_id!,

        created_at:
          conversa.created_at,

        updated_at:
          conversa.updated_at,
      }),
    );
}


// ======================================================
// FORMATAR DATA
// ======================================================

function formatarData(
  data: string,
): string {
  return new Date(
    data,
  ).toLocaleString(
    "pt-MZ",
  );
}


// ======================================================
// GERAR SESSION ID
// ======================================================

function gerarSessionId():
  string {
  return (
    `agent-commerce-${randomUUID()}`
  );
}


// ======================================================
// GERAR TÍTULO
// ======================================================

function gerarTitulo(
  mensagem: string,
): string {
  const texto =
    mensagem
      .replace(
        /\s+/g,
        " ",
      )
      .trim();


  const limite =
    60;


  if (
    texto.length <= limite
  ) {
    return texto;
  }


  return (
    texto
      .slice(
        0,
        limite - 3,
      )
      .trimEnd() +
    "..."
  );
}


// ======================================================
// EXTRAIR PRIMEIRA MENSAGEM USER
// ======================================================

function extrairTextoUsuario(
  item: unknown,
): string | null {
  if (
    typeof item !== "object" ||
    item === null
  ) {
    return null;
  }


  const mensagem =
    item as {
      role?: unknown;
      content?: unknown;
    };


  if (
    mensagem.role !== "user"
  ) {
    return null;
  }


  if (
    typeof mensagem.content ===
    "string"
  ) {
    const texto =
      mensagem.content.trim();


    return texto || null;
  }


  if (
    Array.isArray(
      mensagem.content,
    )
  ) {
    const partes:
      string[] = [];


    for (
      const parte
      of mensagem.content
    ) {
      if (
        typeof parte !== "object" ||
        parte === null
      ) {
        continue;
      }


      const conteudo =
        parte as {
          type?: unknown;
          text?: unknown;
        };


      if (
        conteudo.type ===
          "input_text" &&
        typeof conteudo.text ===
          "string"
      ) {
        partes.push(
          conteudo.text,
        );
      }
    }


    const texto =
      partes
        .join(" ")
        .trim();


    return texto || null;
  }


  return null;
}


// ======================================================
// ATUALIZAR TÍTULOS ANTIGOS
// ======================================================

async function atualizarTitulosAntigos():
  Promise<void> {
  const {
    data: conversas,
    error: erroConversas,
  } = await supabase
    .from("conversas")
    .select(`
      id,
      titulo,
      sdk_session_id
    `)
    .eq(
      "titulo",
      "Conversa Agents SDK",
    )
    .not(
      "sdk_session_id",
      "is",
      null,
    );


  if (erroConversas) {
    throw new Error(
      `Erro ao procurar conversas antigas: ${erroConversas.message}`,
    );
  }


  if (
    !conversas ||
    conversas.length === 0
  ) {
    return;
  }


  for (
    const conversa
    of conversas
  ) {
    const {
      data: itens,
      error: erroItens,
    } = await supabase
      .from("sdk_session_items")
      .select(
        "id, item",
      )
      .eq(
        "conversa_id",
        conversa.id,
      )
      .order(
        "id",
        {
          ascending: true,
        },
      );


    if (erroItens) {
      console.error(
        `Não foi possível analisar a conversa ${conversa.id}:`,
        erroItens.message,
      );

      continue;
    }


    if (
      !itens ||
      itens.length === 0
    ) {
      continue;
    }


    let primeiraMensagem:
      string | null = null;


    for (
      const registo
      of itens
    ) {
      const texto =
        extrairTextoUsuario(
          registo.item,
        );


      if (texto) {
        primeiraMensagem =
          texto;

        break;
      }
    }


    if (!primeiraMensagem) {
      continue;
    }


    const novoTitulo =
      gerarTitulo(
        primeiraMensagem,
      );


    const {
      error: erroUpdate,
    } = await supabase
      .from("conversas")
      .update({
        titulo:
          novoTitulo,
      })
      .eq(
        "id",
        conversa.id,
      );


    if (erroUpdate) {
      console.error(
        `Não foi possível atualizar o título da conversa ${conversa.id}:`,
        erroUpdate.message,
      );

      continue;
    }


    console.log(
      `Título atualizado: "${novoTitulo}"`,
    );
  }
}


// ======================================================
// ATUALIZAR TÍTULO DE NOVA CONVERSA
// ======================================================

async function atualizarTituloConversa(
  sessionId: string,
  primeiraMensagem: string,
): Promise<void> {
  const titulo =
    gerarTitulo(
      primeiraMensagem,
    );


  const {
    error,
  } = await supabase
    .from("conversas")
    .update({
      titulo,

      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "sdk_session_id",
      sessionId,
    );


  if (error) {
    throw new Error(
      `Erro ao atualizar título: ${error.message}`,
    );
  }
}


// ======================================================
// ESCOLHER CONVERSA
// ======================================================

async function escolherSessao(
  rl: readline.Interface,
): Promise<SessaoSelecionada> {
  await atualizarTitulosAntigos();


  const conversas =
    await listarConversasSdk();


  // ====================================================
  // NENHUMA CONVERSA
  // ====================================================

  if (
    conversas.length === 0
  ) {
    console.log(
      "Nenhuma conversa anterior encontrada.",
    );


    console.log(
      "Nova conversa iniciada.\n",
    );


    return {
      sessionId:
        gerarSessionId(),

      novaConversa:
        true,
    };
  }


  // ====================================================
  // MOSTRAR CONVERSAS
  // ====================================================

  console.log(
    "Conversas disponíveis:\n",
  );


  conversas.forEach(
    (
      conversa,
      indice,
    ) => {
      console.log(
        `${indice + 1} - ${conversa.titulo}`,
      );


      console.log(
        `    Atualizada: ${formatarData(
          conversa.updated_at,
        )}`,
      );


      console.log();
    },
  );


  console.log(
    "N - Nova conversa\n",
  );


  // ====================================================
  // SELEÇÃO
  // ====================================================

  while (true) {
    const escolha =
      await rl.question(
        "Escolha uma opção: ",
      );


    const opcao =
      escolha
        .trim()
        .toLowerCase();


    // --------------------------------------------------
    // NOVA CONVERSA
    // --------------------------------------------------

    if (
      opcao === "n"
    ) {
      console.log(
        "\nNova conversa iniciada.\n",
      );


      return {
        sessionId:
          gerarSessionId(),

        novaConversa:
          true,
      };
    }


    // --------------------------------------------------
    // CONVERSA EXISTENTE
    // --------------------------------------------------

    const numero =
      Number(
        opcao,
      );


    if (
      Number.isInteger(
        numero,
      ) &&
      numero >= 1 &&
      numero <=
        conversas.length
    ) {
      const conversa =
        conversas[
          numero - 1
        ];


      if (!conversa) {
        continue;
      }


      console.log(
        `\nConversa carregada: ${conversa.titulo}\n`,
      );


      return {
        sessionId:
          conversa.sdk_session_id,

        novaConversa:
          false,
      };
    }


    console.log(
      "\nOpção inválida.",
    );


    console.log(
      `Escolha um número entre 1 e ${conversas.length}, ou N para nova conversa.\n`,
    );
  }
}


// ======================================================
// CARREGAR CONTEXTO DO AGENTE
// ======================================================

async function carregarContexto(
  session:
    SupabaseSession,
): Promise<AgentCommerceContext> {
  const conversaId =
    await session.getConversaId();


  await criarEstadoInicial(
    conversaId,
  );


  const estado =
    await obterEstado(
      conversaId,
    );


  if (!estado) {
    throw new Error(
      "Não foi possível carregar o Agent State.",
    );
  }


  return {
    conversaId,
    estado,
  };
}


// ======================================================
// ATUALIZAR STATUS DURANTE APROVAÇÃO
// ======================================================

async function atualizarStatusAprovacao(
  contexto:
    AgentCommerceContext,

  status:
    string,
): Promise<void> {
  const novoEstado =
    await atualizarEstado(
      contexto.conversaId,
      {
        status,
      },
    );


  contexto.estado =
    novoEstado;
}


// ======================================================
// MOSTRAR ARGUMENTOS DA INTERRUPÇÃO
// ======================================================

function mostrarArgumentosAprovacao(
  argumentos: unknown,
): void {
  if (
    typeof argumentos ===
    "string"
  ) {
    try {
      const dados =
        JSON.parse(
          argumentos,
        );


      console.dir(
        dados,
        {
          depth: null,
        },
      );


      return;
    }
    catch {
      console.log(
        argumentos,
      );


      return;
    }
  }


  console.dir(
    argumentos,
    {
      depth: null,
    },
  );
}


// ======================================================
// EXECUTAR AGENTE COM HUMAN-IN-THE-LOOP
// ======================================================

async function executarComAprovacao(
  rl:
    readline.Interface,

  texto:
    string,

  session:
    SupabaseSession,

  contexto:
    AgentCommerceContext,
) {
  // ====================================================
  // PRIMEIRA EXECUÇÃO
  // ====================================================

  let resultado =
    await run(
      agente,
      texto,
      {
        session,

        context:
          contexto,
      },
    );


  // ====================================================
  // TRATAR INTERRUPÇÕES
  // ====================================================

  while (
    (
      resultado.interruptions
        ?.length ??
      0
    ) > 0
  ) {
    const interrupcoes =
      resultado.interruptions;


    for (
      const interruption
      of interrupcoes
    ) {
      // ================================================
      // MARCAR ESTADO
      // ================================================

      await atualizarStatusAprovacao(
        contexto,
        "aguardando_aprovacao",
      );


      // ================================================
      // MOSTRAR APROVAÇÃO
      // ================================================

      console.log(`
===================================
       APROVAÇÃO NECESSÁRIA
===================================
`);


      console.log(
        `Tool: ${interruption.name}`,
      );


      console.log(
        "\nArgumentos:",
      );


      mostrarArgumentosAprovacao(
        interruption.arguments,
      );


      console.log();


      // ================================================
      // ESPERAR DECISÃO HUMANA
      // ================================================

      let decidido =
        false;


      while (!decidido) {
        const resposta =
          await rl.question(
            "Confirmar operação? (s/n): ",
          );


        const escolha =
          resposta
            .trim()
            .toLowerCase();


        // ==============================================
        // APROVAR
        // ==============================================

        if (
          escolha === "s" ||
          escolha === "sim"
        ) {
          await atualizarStatusAprovacao(
            contexto,
            "aprovada",
          );


          resultado.state.approve(
            interruption,
          );


          console.log(
            "\nOperação aprovada.",
          );


          decidido =
            true;
        }

        // ==============================================
        // REJEITAR
        // ==============================================

        else if (
          escolha === "n" ||
          escolha === "nao" ||
          escolha === "não"
        ) {
          await atualizarStatusAprovacao(
            contexto,
            "cancelada",
          );


          resultado.state.reject(
            interruption,
            {
              message:
                "A operação foi rejeitada pelo utilizador e deve ser considerada cancelada.",
            },
          );


          console.log(
            "\nOperação rejeitada.",
          );


          decidido =
            true;
        }

        // ==============================================
        // RESPOSTA INVÁLIDA
        // ==============================================

        else {
          console.log(
            '\nResposta inválida. Escreve "s" para confirmar ou "n" para rejeitar.\n',
          );
        }
      }
    }


    // ==================================================
    // RETOMAR EXATAMENTE O RUN INTERROMPIDO
    // ==================================================

    resultado =
      await run(
        agente,
        resultado.state,
        {
          session,
        },
      );
  }


  return resultado;
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
  // ESCOLHER SESSÃO
  // ====================================================

  const escolhaSessao =
    await escolherSessao(
      rl,
    );


  const sessionId =
    escolhaSessao.sessionId;


  let novaConversa =
    escolhaSessao.novaConversa;


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
    // IGNORAR VAZIO
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
      // NOVA CONVERSA
      // ================================================

      if (novaConversa) {
        await session.getSessionId();


        await atualizarTituloConversa(
          sessionId,
          texto,
        );


        novaConversa =
          false;
      }


      // ================================================
      // CARREGAR AGENT STATE
      // ================================================

      const contexto =
        await carregarContexto(
          session,
        );


      // ================================================
      // EXECUTAR COM APROVAÇÃO
      // ================================================

      const resultado =
        await executarComAprovacao(
          rl,
          texto,
          session,
          contexto,
        );


      // ================================================
      // RESPOSTA
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