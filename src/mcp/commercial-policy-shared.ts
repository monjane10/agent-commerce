// ======================================================
// DEFINIÇÃO PARTILHADA DO SERVIDOR MCP (READ-ONLY)
//
// Cria o servidor com a tool consultar_politicas_comerciais.
// Usada pelo transporte stdio e pelo HTTP (Streamable).
// Não escreve ficheiros, não toca no Supabase.
// ======================================================

import { readFileSync } from "node:fs";

import { dirname, join } from "node:path";

import { fileURLToPath } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";

import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";


type Politicas = {
  metodos_pagamento: string[];
  devolucao: string;
  atendimento: string;
};


function carregarPoliticas(): Politicas {
  const pasta =
    dirname(fileURLToPath(import.meta.url));

  // O ficheiro de dados é fixo e interno ao servidor.
  // O parâmetro "topico" nunca é usado como path.
  const caminho = join(
    pasta,
    "..",
    "..",
    "data",
    "politicas-comerciais.json",
  );

  const conteudo =
    readFileSync(caminho, "utf-8");

  const dados: unknown =
    JSON.parse(conteudo);

  if (
    typeof dados !== "object" ||
    dados === null
  ) {
    throw new Error(
      "Ficheiro de políticas inválido.",
    );
  }

  const registo =
    dados as Record<string, unknown>;

  const metodos =
    registo["metodos_pagamento"];

  const devolucao =
    registo["devolucao"];

  const atendimento =
    registo["atendimento"];

  if (
    !Array.isArray(metodos) ||
    typeof devolucao !== "string" ||
    typeof atendimento !== "string"
  ) {
    throw new Error(
      "Ficheiro de políticas inválido.",
    );
  }

  return {
    metodos_pagamento: metodos.filter(
      (m): m is string => typeof m === "string",
    ),
    devolucao,
    atendimento,
  };
}


function textoTopico(
  politicas: Politicas,
  topico: unknown,
): string {
  const normalizado =
    typeof topico === "string"
      ? topico.trim().toLowerCase()
      : "";


  if (
    normalizado === "pagamentos" ||
    normalizado === "pagamento"
  ) {
    return `Métodos de pagamento aceites (demonstração): ${politicas.metodos_pagamento.join(", ")}.`;
  }


  if (
    normalizado === "devolucao" ||
    normalizado === "devolução"
  ) {
    return `Política de devolução (demonstração): ${politicas.devolucao}`;
  }


  if (
    normalizado === "atendimento"
  ) {
    return `Atendimento (demonstração): ${politicas.atendimento}`;
  }


  return [
    "Políticas comerciais (demonstração):",
    `Métodos de pagamento: ${politicas.metodos_pagamento.join(", ")}.`,
    `Devolução: ${politicas.devolucao}`,
    `Atendimento: ${politicas.atendimento}`,
  ].join("\n");
}


export function criarCommercialPolicyMcpServer(): Server {
  const politicas = carregarPoliticas();

  const servidor = new Server(
    {
      name: "politicas-comerciais",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );


  servidor.setRequestHandler(
    ListToolsRequestSchema,
    async () => ({
      tools: [
        {
          name: "consultar_politicas_comerciais",
          description:
            "Consulta as políticas comerciais de demonstração (pagamentos, devolução, atendimento). Somente leitura.",
          inputSchema: {
            type: "object",
            properties: {
              topico: {
                type: "string",
                description:
                  "Tópico: pagamentos, devolucao ou atendimento. Vazio devolve todas as políticas.",
              },
            },
            required: [],
          },
        },
      ],
    }),
  );


  servidor.setRequestHandler(
    CallToolRequestSchema,
    async (pedido) => {
      if (
        pedido.params.name !==
        "consultar_politicas_comerciais"
      ) {
        throw new Error(
          `Tool desconhecida: ${pedido.params.name}`,
        );
      }

      const argumentos =
        pedido.params.arguments ?? {};

      const topico =
        typeof argumentos === "object" &&
        argumentos !== null &&
        "topico" in argumentos
          ? (argumentos as Record<string, unknown>)["topico"]
          : undefined;

      return {
        content: [
          {
            type: "text",
            text: textoTopico(politicas, topico),
          },
        ],
      };
    },
  );


  return servidor;
}
