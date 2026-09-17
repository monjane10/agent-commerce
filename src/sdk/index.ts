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
// TIPOS DA APROVAÇÃO
// ======================================================

type DadosVendaAprovacao = {
  cliente_id?: number;
  produto_id?: number;
  quantidade?: number;
  metodo_pagamento?: string;
};


type ResumoVendaAprovacao = {
  clienteNome: string;
  produtoNome: string;

  quantidade: number;

  metodoPagamento: string;

  precoUnitario: number | null;

  moeda: string;

  total: number | null;
};


// ======================================================
// VERIFICAR SE EXISTE VENDA EM CURSO
// ======================================================

function vendaEmCurso(
  estado: AgentState,
): boolean {
  if (
    estado.operacao !==
    "criar_venda"
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
  name:
    "consultar_stock",

  description:
    "Consulta especificamente a quantidade disponível em stock de um produto.",

  parameters:
    z.object({
      produto:
        z.string(),
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
      produto,
    );


    const resultado =
      await consultarStock(
        produto,
      );


    console.log(
      "Resultado:",
      resultado,
    );


    return resultado;
  },
});


// ======================================================
// TOOL 2 - BUSCAR PRODUTO
// ======================================================

const buscarProdutoTool = tool({
  name:
    "buscar_produto",

  description:
    "Procura informações completas de um produto, incluindo nome, preço, moeda e quantidade disponível.",

  parameters:
    z.object({
      nome:
        z.string(),
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
      nome,
    );


    const resultado =
      await buscarProduto(
        nome,
      );


    console.log(
      "Resultado:",
      resultado,
    );


    // ==================================================
    // EXTRAIR PRODUTO DE FORMA SEGURA
    // ==================================================

    let produto:
      {
        id: number;
        nome: string;
      } | undefined;


    if (
      typeof resultado ===
        "object" &&
      resultado !== null &&
      "produto" in resultado
    ) {
      produto =
        (
          resultado as {
            produto?: {
              id: number;
              nome: string;
            };
          }
        ).produto;
    }


    // ==================================================
    // ATUALIZAR ESTADO DE VENDA
    // ==================================================

    if (
      runContext &&
      vendaEmCurso(
        runContext.context.estado,
      )
    ) {
      if (produto) {
        await atualizarEstadoContexto(
          runContext,
          {
            produto_id:
              produto.id,

            produto_nome:
              produto.nome,

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
  name:
    "listar_produtos",

  description:
    "Lista todos os produtos disponíveis no sistema, incluindo nome, preço, moeda e quantidade em stock.",

  parameters:
    z.object({}),

  execute:
    async () => {
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
        resultado,
      );


      return resultado;
    },
});


// ======================================================
// TOOL 4 - BUSCAR CLIENTE
// ======================================================

const buscarClienteTool = tool({
  name:
    "buscar_cliente",

  description:
    "Procura clientes pelo nome e devolve os clientes encontrados com ID, nome e email.",

  parameters:
    z.object({
      nome:
        z.string(),
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
      nome,
    );


    const resultado =
      await buscarCliente(
        nome,
      );


    console.log(
      "Resultado:",
      resultado,
    );


    // ==================================================
    // EXTRAIR CLIENTES
    // ==================================================

    let clientes:
      Array<{
        id: number;
        nome: string;
        email?: string | null;
      }> = [];


    if (
      typeof resultado ===
        "object" &&
      resultado !== null &&
      "clientes" in resultado &&
      Array.isArray(
        resultado.clientes,
      )
    ) {
      clientes =
        resultado.clientes;
    }


    // ==================================================
    // ATUALIZAR AGENT STATE
    // ==================================================

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
      // CLIENTE AMBÍGUO
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
      // NÃO ENCONTRADO
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
  name:
    "preparar_venda",

  description:
    "Prepara e guarda o estado estruturado de uma operação de venda antes da sua execução.",

  parameters:
    z.object({
      cliente_nome:
        z
          .string()
          .nullable(),

      produto_nome:
        z
          .string()
          .nullable(),

      quantidade:
        z
          .number()
          .int()
          .positive()
          .nullable(),

      metodo_pagamento:
        z
          .string()
          .nullable(),
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


    // ==================================================
    // PRESERVAR DADOS DA VENDA ATUAL
    // ==================================================

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


    // ==================================================
    // DETERMINAR STATUS
    // ==================================================

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
  name:
    "criar_venda",

  description:
    "Regista uma venda para um cliente e produto previamente identificados e atualiza o stock.",


  // ====================================================
  // HUMAN-IN-THE-LOOP
  // ====================================================

  needsApproval:
    true,


  parameters:
    z.object({
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
    // Este código só executa
    // DEPOIS da aprovação humana.

    console.log(
      "\nTool executada:",
    );

    console.log(
      "criar_venda",
    );


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
      resultado,
    );


    const vendaResultado =
      resultado as {
        sucesso?: boolean;
        cliente?: string;
        produto?: string;
      } | null;


    // ==================================================
    // SUCESSO
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
                runContext
                  ?.context
                  .estado
                  .cliente_nome ??
                null
              ),

          produto_nome:
            typeof vendaResultado.produto ===
            "string"
              ? vendaResultado.produto
              : (
                runContext
                  ?.context
                  .estado
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
  todos os produtos, usa listar_produtos.

========================================================
CLIENTES
========================================================

- Para identificar um cliente, usa buscar_cliente.

- Nunca inventes IDs de clientes.

- Usa exclusivamente IDs devolvidos por
  buscar_cliente.

- Se buscar_cliente devolver vários clientes,
  não escolhas sozinho.

- Apresenta os NOMES dos clientes ao utilizador.

- Nunca peças ao utilizador para escolher um ID.

- O ID é apenas um identificador interno do sistema.

- Se existirem vários clientes, mostra informações
  compreensíveis como nome e email.

- Depois de o utilizador indicar o cliente correto,
  usa buscar_cliente novamente com o nome completo.

========================================================
VENDAS
========================================================

- Quando o utilizador pedir uma nova venda,
  usa primeiro preparar_venda.

- preparar_venda guarda de forma estruturada
  os dados fornecidos pelo utilizador.

- Depois identifica o cliente com buscar_cliente.

- Depois identifica o produto com buscar_produto.

- Nunca inventes cliente_id.

- Nunca inventes produto_id.

- Nunca peças cliente_id ou produto_id ao utilizador.

- IDs são detalhes internos da aplicação.

- Só usa criar_venda quando cliente e produto
  estiverem corretamente identificados.

- Nunca uses IDs de uma venda anterior para uma
  nova venda.

- Usa exatamente a quantidade indicada.

- Usa exatamente o método de pagamento indicado.

- Se faltar quantidade, pergunta ao utilizador.

- Se faltar método de pagamento, pergunta ao
  utilizador.

- Não inventes métodos de pagamento.

- Se houver vários clientes possíveis, aguarda
  o esclarecimento do utilizador.

- Se o produto não existir, não executes a venda.

========================================================
APROVAÇÃO HUMANA
========================================================

- criar_venda exige aprovação humana.

- A aplicação apresenta os detalhes da venda.

- A pessoa deve aprovar com base em nomes e dados
  compreensíveis, nunca com base apenas em IDs.

- Nunca tentes contornar a aprovação.

- Uma venda só está concluída depois de criar_venda
  ser efetivamente executada.

- Se a venda for rejeitada, considera a operação
  cancelada.

- Não tentes executar novamente uma venda rejeitada
  sem um novo pedido explícito.

========================================================
CONTEXTO DA CONVERSA
========================================================

- Usa o histórico para compreender expressões como:

  "esse produto"
  "esse cliente"
  "dele"
  "dela"
  "o anterior"
  "o mais barato"

- A Session guarda o histórico.

- O Agent State guarda o estado estruturado
  da operação.

- O histórico e o estado são complementares.

- Para preços, stock, clientes, produtos e outros
  dados atuais, consulta sempre as tools.

========================================================
REGRAS GERAIS
========================================================

- Nunca inventes preços.

- Nunca inventes stock.

- Nunca inventes clientes.

- Nunca inventes produtos.

- Nunca inventes IDs.

- Os dados das tools são a fonte de verdade.

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

Usa este estado apenas como contexto estruturado.

Os dados atuais devolvidos pelas tools e pela base
de dados continuam a ser a fonte de verdade.

Se o estado estiver com status "concluida", "erro"
ou "cancelada" e surgir um novo pedido de venda,
começa uma nova operação com preparar_venda.
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
// TIPOS DE CONVERSA
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
        ascending:
          false,
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
// EXTRAIR TEXTO DO UTILIZADOR
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
    mensagem.role !==
    "user"
  ) {
    return null;
  }


  // ====================================================
  // STRING
  // ====================================================

  if (
    typeof mensagem.content ===
    "string"
  ) {
    const texto =
      mensagem.content.trim();


    return texto || null;
  }


  // ====================================================
  // ARRAY
  // ====================================================

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
        typeof parte !==
          "object" ||
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
      .from(
        "sdk_session_items",
      )
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
          ascending:
            true,
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
        new Date()
          .toISOString(),
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
  rl:
    readline.Interface,
): Promise<SessaoSelecionada> {
  await atualizarTitulosAntigos();


  const conversas =
    await listarConversasSdk();


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


  while (true) {
    const escolha =
      await rl.question(
        "Escolha uma opção: ",
      );


    const opcao =
      escolha
        .trim()
        .toLowerCase();


    // ==================================================
    // NOVA
    // ==================================================

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


    // ==================================================
    // EXISTENTE
    // ==================================================

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
// CARREGAR CONTEXTO
// ======================================================

async function carregarContexto(
  session:
    SupabaseSession,
): Promise<AgentCommerceContext> {
  const conversaId =
    await session
      .getConversaId();


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
// ATUALIZAR STATUS DA APROVAÇÃO
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
// EXTRAIR ARGUMENTOS DA VENDA
// ======================================================

function extrairArgumentosVenda(
  argumentos: unknown,
): DadosVendaAprovacao {
  let valor:
    unknown =
    argumentos;


  if (
    typeof valor ===
    "string"
  ) {
    try {
      valor =
        JSON.parse(
          valor,
        );
    }
    catch {
      throw new Error(
        "Não foi possível interpretar os dados da venda para aprovação.",
      );
    }
  }


  if (
    typeof valor !==
      "object" ||
    valor === null
  ) {
    throw new Error(
      "Os dados da venda para aprovação são inválidos.",
    );
  }


  const objeto =
    valor as Record<
      string,
      unknown
    >;


  const dados:
    DadosVendaAprovacao = {};


  if (
    typeof objeto.cliente_id ===
    "number"
  ) {
    dados.cliente_id =
      objeto.cliente_id;
  }


  if (
    typeof objeto.produto_id ===
    "number"
  ) {
    dados.produto_id =
      objeto.produto_id;
  }


  if (
    typeof objeto.quantidade ===
    "number"
  ) {
    dados.quantidade =
      objeto.quantidade;
  }


  if (
    typeof objeto.metodo_pagamento ===
    "string"
  ) {
    dados.metodo_pagamento =
      objeto.metodo_pagamento;
  }


  return dados;
}


// ======================================================
// OBTER RESUMO DA VENDA
// ======================================================

async function obterResumoVendaAprovacao(
  contexto:
    AgentCommerceContext,

  argumentos:
    unknown,
): Promise<ResumoVendaAprovacao> {
  const dados =
    extrairArgumentosVenda(
      argumentos,
    );


  const clienteId =
    dados.cliente_id ??
    contexto.estado.cliente_id;


  const produtoId =
    dados.produto_id ??
    contexto.estado.produto_id;


  const quantidade =
    dados.quantidade ??
    contexto.estado.quantidade;


  const metodoPagamento =
    dados.metodo_pagamento ??
    contexto.estado.metodo_pagamento;


  // ====================================================
  // VALIDAR DADOS
  // ====================================================

  if (!clienteId) {
    throw new Error(
      "Não foi possível identificar o cliente da venda.",
    );
  }


  if (!produtoId) {
    throw new Error(
      "Não foi possível identificar o produto da venda.",
    );
  }


  if (
    !quantidade ||
    quantidade <= 0
  ) {
    throw new Error(
      "Quantidade da venda inválida.",
    );
  }


  if (!metodoPagamento) {
    throw new Error(
      "Método de pagamento não identificado.",
    );
  }


  // ====================================================
  // BUSCAR NOMES REAIS NA BASE DE DADOS
  // ====================================================

  const [
    resultadoCliente,
    resultadoProduto,
  ] =
    await Promise.all([
      supabase
        .from("clientes")
        .select(
          "id, nome",
        )
        .eq(
          "id",
          clienteId,
        )
        .maybeSingle(),

      supabase
        .from("produtos")
        .select(
          `
          id,
          nome,
          preco,
          moeda
          `,
        )
        .eq(
          "id",
          produtoId,
        )
        .maybeSingle(),
    ]);


  // ====================================================
  // CLIENTE
  // ====================================================

  if (
    resultadoCliente.error
  ) {
    throw new Error(
      `Erro ao obter cliente para aprovação: ${resultadoCliente.error.message}`,
    );
  }


  if (
    !resultadoCliente.data
  ) {
    throw new Error(
      "Cliente da venda não encontrado.",
    );
  }


  // ====================================================
  // PRODUTO
  // ====================================================

  if (
    resultadoProduto.error
  ) {
    throw new Error(
      `Erro ao obter produto para aprovação: ${resultadoProduto.error.message}`,
    );
  }


  if (
    !resultadoProduto.data
  ) {
    throw new Error(
      "Produto da venda não encontrado.",
    );
  }


  // ====================================================
  // PREÇO
  // ====================================================

  const precoConvertido =
    Number(
      resultadoProduto.data
        .preco,
    );


  const precoUnitario =
    Number.isFinite(
      precoConvertido,
    )
      ? precoConvertido
      : null;


  const moeda =
    resultadoProduto.data
      .moeda ??
    "MZN";


  const total =
    precoUnitario !== null
      ? precoUnitario *
        quantidade
      : null;


  return {
    clienteNome:
      resultadoCliente.data
        .nome,

    produtoNome:
      resultadoProduto.data
        .nome,

    quantidade,

    metodoPagamento,

    precoUnitario,

    moeda,

    total,
  };
}


// ======================================================
// FORMATAR DINHEIRO
// ======================================================

function formatarDinheiro(
  valor:
    number,

  moeda:
    string,
): string {
  try {
    return new Intl.NumberFormat(
      "pt-MZ",
      {
        style:
          "currency",

        currency:
          moeda,

        minimumFractionDigits:
          2,
      },
    ).format(
      valor,
    );
  }
  catch {
    return `${valor.toFixed(
      2,
    )} ${moeda}`;
  }
}


// ======================================================
// MOSTRAR APROVAÇÃO
// ======================================================

function mostrarResumoAprovacao(
  resumo:
    ResumoVendaAprovacao,
): void {
  console.log(`
===================================
       APROVAÇÃO NECESSÁRIA
===================================

Dados da venda:

Cliente: ${resumo.clienteNome}
Produto: ${resumo.produtoNome}
Quantidade: ${resumo.quantidade}
Método de pagamento: ${resumo.metodoPagamento}`);


  if (
    resumo.precoUnitario !==
    null
  ) {
    console.log(
      `Preço unitário: ${formatarDinheiro(
        resumo.precoUnitario,
        resumo.moeda,
      )}`,
    );
  }


  if (
    resumo.total !==
    null
  ) {
    console.log(
      `Total: ${formatarDinheiro(
        resumo.total,
        resumo.moeda,
      )}`,
    );
  }


  console.log();
}


// ======================================================
// EXECUTAR COM APROVAÇÃO HUMANA
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
  // ENQUANTO EXISTIREM INTERRUPÇÕES
  // ====================================================

  while (
    resultado.interruptions
      .length > 0
  ) {
    const interrupcoes =
      resultado.interruptions;


    for (
      const interruption
      of interrupcoes
    ) {
      // ================================================
      // ESTADO
      // ================================================

      await atualizarStatusAprovacao(
        contexto,
        "aguardando_aprovacao",
      );


      // ================================================
      // BUSCAR DADOS HUMANOS DA VENDA
      // ================================================

      const resumo =
        await obterResumoVendaAprovacao(
          contexto,
          interruption.arguments,
        );


      // ================================================
      // MOSTRAR NOMES, NÃO IDs
      // ================================================

      mostrarResumoAprovacao(
        resumo,
      );


      // ================================================
      // PERGUNTAR
      // ================================================

      let decidido =
        false;


      while (!decidido) {
        const resposta =
          await rl.question(
            "Confirmar venda? (s/n): ",
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
            "\nVenda aprovada.\n",
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
                "A venda foi rejeitada pelo utilizador. A operação deve ser considerada cancelada.",
            },
          );


          console.log(
            "\nVenda rejeitada.\n",
          );


          decidido =
            true;
        }

        // ==============================================
        // INVÁLIDO
        // ==============================================

        else {
          console.log(
            '\nResposta inválida. Escreve "s" para confirmar ou "n" para rejeitar.\n',
          );
        }
      }
    }


    // ==================================================
    // RETOMAR O MESMO RUN
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
  // SESSION
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
  // LOOP DA CONVERSA
  // ====================================================

  while (true) {
    const mensagem =
      await rl.question(
        "Você: ",
      );


    const texto =
      mensagem.trim();


    // ==================================================
    // VAZIO
    // ==================================================

    if (!texto) {
      continue;
    }


    // ==================================================
    // SAIR
    // ==================================================

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
        await session
          .getSessionId();


        await atualizarTituloConversa(
          sessionId,
          texto,
        );


        novaConversa =
          false;
      }


      // ================================================
      // CONTEXTO
      // ================================================

      const contexto =
        await carregarContexto(
          session,
        );


      // ================================================
      // RUN + HUMAN IN THE LOOP
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