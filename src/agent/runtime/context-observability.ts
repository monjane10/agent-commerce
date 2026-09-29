import type {
  AgentInputItem,
} from "@openai/agents";

import type {
  SupabaseSession,
} from "../../sessions/supabase-session.js";

import type {
  AgentState,
} from "../../state/agent-state.js";


// ======================================================
// DIAGNÓSTICO DE CONTEXTO (apenas medição)
//
// Não altera a Session, não resume, não trunca.
// Mede o que já está persistido antes de cada run
// principal e mostra apenas métricas (sem conteúdo).
// ======================================================

export const ULTIMOS_ITENS_ANALISE = 6;


export type TipoItemContexto = {
  tipo: string;
  quantidade: number;
  caracteres: number;
};


export type MetricasContexto = {
  conversaId: number;
  totalItens: number;
  user: number;
  assistant: number;
  ferramentas: number;
  reasoning: number;
  outros: number;
  tipos: TipoItemContexto[];
  caracteresTotais: number;
  caracteresRecentes: number;
  caracteresAntigos: number;
  maiorItemTipo: string;
  maiorItemCaracteres: number;
};


// ======================================================
// LEITURA SEGURA DE CAMPOS (sem conteúdo)
// ======================================================

function lerCampoTexto(
  item: AgentInputItem,
  campo: string,
): string | undefined {
  if (
    typeof item !== "object" ||
    item === null
  ) {
    return undefined;
  }

  const registo =
    item as Record<string, unknown>;

  const valor =
    registo[campo];

  return typeof valor === "string"
    ? valor
    : undefined;
}


// ======================================================
// CLASSIFICAÇÃO PELOS TIPOS REAIS DO SDK
// ======================================================

function classificarCategoria(
  item: AgentInputItem,
): string {
  const papel =
    lerCampoTexto(item, "role");

  if (papel === "user") {
    return "user";
  }

  if (papel === "assistant") {
    return "assistant";
  }

  const tipo =
    lerCampoTexto(item, "type") ??
    "desconhecido";

  if (tipo === "reasoning") {
    return "reasoning";
  }

  if (
    tipo.includes("function_call") ||
    tipo.includes("tool") ||
    tipo.includes("computer") ||
    tipo.includes("shell") ||
    tipo.includes("hosted") ||
    tipo.includes("program")
  ) {
    return "ferramentas";
  }

  return "outros";
}


function chaveTipo(
  item: AgentInputItem,
): string {
  const tipo =
    lerCampoTexto(item, "type") ??
    "desconhecido";

  const papel =
    lerCampoTexto(item, "role");

  return papel
    ? `${tipo}:${papel}`
    : tipo;
}


function medirItem(
  item: AgentInputItem,
): number {
  try {
    return JSON.stringify(item)?.length ?? 0;
  }
  catch {
    return 0;
  }
}


// ======================================================
// MEDIR SESSION ATUAL (leitura apenas)
// ======================================================

export async function medirContextoSession(
  session: SupabaseSession,
  conversaId: number,
): Promise<MetricasContexto> {
  const itens =
    await session.getItems();

  let user = 0;
  let assistant = 0;
  let ferramentas = 0;
  let reasoning = 0;
  let outros = 0;

  const porTipo =
    new Map<string, TipoItemContexto>();

  const tamanhos: number[] = [];

  let maiorItemTipo = "-";
  let maiorItemCaracteres = 0;

  for (const item of itens) {
    const tamanho = medirItem(item);
    tamanhos.push(tamanho);

    if (tamanho > maiorItemCaracteres) {
      maiorItemCaracteres = tamanho;
      maiorItemTipo = chaveTipo(item);
    }

    const categoria =
      classificarCategoria(item);

    if (categoria === "user") user += 1;
    else if (categoria === "assistant") assistant += 1;
    else if (categoria === "ferramentas") ferramentas += 1;
    else if (categoria === "reasoning") reasoning += 1;
    else outros += 1;

    const chave = chaveTipo(item);
    const existente = porTipo.get(chave);

    if (existente) {
      existente.quantidade += 1;
      existente.caracteres += tamanho;
    }
    else {
      porTipo.set(chave, {
        tipo: chave,
        quantidade: 1,
        caracteres: tamanho,
      });
    }
  }

  const caracteresTotais = tamanhos.reduce(
    (acumulado, tamanho) => acumulado + tamanho,
    0,
  );

  const recentes = tamanhos.slice(-ULTIMOS_ITENS_ANALISE);

  const caracteresRecentes = recentes.reduce(
    (acumulado, tamanho) => acumulado + tamanho,
    0,
  );

  return {
    conversaId,
    totalItens: itens.length,
    user,
    assistant,
    ferramentas,
    reasoning,
    outros,
    tipos: [...porTipo.values()].sort(
      (a, b) => b.caracteres - a.caracteres,
    ),
    caracteresTotais,
    caracteresRecentes,
    caracteresAntigos:
      caracteresTotais - caracteresRecentes,
    maiorItemTipo,
    maiorItemCaracteres,
  };
}


// ======================================================
// MOSTRAR MÉTRICAS (sem conteúdo sensível)
// ======================================================

export function mostrarMetricasContexto(
  metricas: MetricasContexto,
  estado: AgentState | null,
): void {
  console.log(
    "\n-----------------------------------",
  );

  console.log(
    "CONTEXTO DA SESSION",
  );

  console.log(
    "-----------------------------------",
  );

  console.log(
    `Conversa ID: ${metricas.conversaId}`,
  );

  console.log(
    `Total de itens: ${metricas.totalItens}`,
  );

  console.log(
    `User: ${metricas.user}`,
  );

  console.log(
    `Assistant: ${metricas.assistant}`,
  );

  console.log(
    `Ferramentas: ${metricas.ferramentas}`,
  );

  console.log(
    `Reasoning: ${metricas.reasoning}`,
  );

  console.log(
    `Outros: ${metricas.outros}`,
  );

  console.log(
    `Caracteres aproximados: ${metricas.caracteresTotais}`,
  );

  console.log(
    `Últimos ${ULTIMOS_ITENS_ANALISE} itens: ${metricas.caracteresRecentes} caracteres`,
  );

  console.log(
    `Itens antigos: ${metricas.caracteresAntigos} caracteres`,
  );

  console.log(
    `Maior item: ${metricas.maiorItemTipo} (${metricas.maiorItemCaracteres} caracteres)`,
  );

  for (const tipo of metricas.tipos) {
    console.log(
      `  - ${tipo.tipo}: ${tipo.quantidade} itens, ${tipo.caracteres} caracteres`,
    );
  }

  if (estado) {
    console.log(
      `Agent State: ${estado.status} / ${estado.operacao ?? "sem operação"}`,
    );
  }
  else {
    console.log(
      "Agent State: indisponível",
    );
  }

  console.log(
    "-----------------------------------",
  );
}
