// ======================================================
// AGENT API — lógica partilhada CLI/API
//
// Usa o mesmo agente, tools, contexto, Session, State,
// guardrails, tracing e observabilidade da CLI.
// Só o transporte de HITL difere (pending approvals
// em memória em vez de readline s/n).
// ======================================================

import { performance } from "node:perf_hooks";

import { randomUUID } from "node:crypto";

import { supabase } from "../lib/supabase.js";

import { SupabaseSession } from "../sessions/supabase-session.js";

import { atualizarTituloConversa } from "../conversations/title.service.js";

import { agente } from "../agent/commerce-agent.js";

import type { AgentCommerceContext } from "../agent/context.js";

import {
  carregarContexto,
} from "../agent/runtime/run-agent.js";

import {
  atualizarStatusAprovacao,
  obterResumoVendaAprovacao,
  obterResumoProdutoAprovacao,
} from "../agent/runtime/approval.js";

import {
  criarRunner,
} from "../agent/runtime/tracing.js";

import {
  ativarObservabilidadeLocal,
  mostrarResumoExecucao,
} from "../agent/runtime/observability.js";

import {
  guardarRuntime,
  consumirRuntime,
  existePendenteParaConversa,
  criarLinhaApproval,
  marcarDecisao,
  expirarSeOrfa,
  obterDonoDaConversaDoApproval,
  type OperacaoAprovacao,
} from "./approval-store.js";

import type {
  AuthenticatedUser,
} from "./auth.js";


// ======================================================
// ERROS HTTP
// ======================================================

export type CodigoErro =
  | "invalid_request"
  | "conversation_not_found"
  | "approval_not_found"
  | "approval_pending"
  | "payload_too_large"
  | "unsupported_media_type"
  | "internal_error";

export class ErroApi extends Error {
  readonly estado: number;
  readonly codigo: CodigoErro;

  constructor(
    estado: number,
    codigo: CodigoErro,
  ) {
    super(codigo);

    this.estado = estado;
    this.codigo = codigo;
  }
}


// ======================================================
// RESUMOS JSON (sem objetos internos do SDK)
// ======================================================

export type ResumoVendaApi = {
  cliente: string;
  produto: string;
  quantidade: number;
  metodoPagamento: string;
  precoUnitario: number | null;
  total: number | null;
  moeda: string;
};

export type ResumoProdutoApi = {
  nome: string;
  preco: number;
  quantidadeInicial: number;
  moeda: string;
};

export type RespostaChat =
  | {
      status: "completed";
      conversationId: number;
      message: string;
    }
  | {
      status: "approval_required";
      conversationId: number;
      approval: {
        id: string;
        operation: OperacaoAprovacao;
        summary:
          | ResumoVendaApi
          | ResumoProdutoApi;
      };
    };


// ======================================================
// SESSÃO POR CONVERSA NUMÉRICA
// ======================================================

// SupabaseSession só é construída DEPOIS da
// verificação de ownership (nunca JWT de A com
// conversa de B). Conversas legadas user_id null
// não pertencem a ninguém: 404, não 403 (não
// revelar existência de recursos alheios).
async function resolverSessaoExistente(
  conversationId: number,
  userId: string,
): Promise<{
  session: SupabaseSession;
  sessionId: string;
  conversaId: number;
}> {
  const { data, error } = await supabase
    .from("conversas")
    .select("id, sdk_session_id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new ErroApi(500, "internal_error");
  }

  if (
    !data ||
    typeof data.sdk_session_id !== "string" ||
    data.sdk_session_id === ""
  ) {
    throw new ErroApi(
      404,
      "conversation_not_found",
    );
  }

  const sessionId: string =
    data.sdk_session_id;

  const session = new SupabaseSession({
    sessionId,
  });

  const conversaId =
    await session.getConversaId();

  return {
    session,
    sessionId,
    conversaId,
  };
}

async function criarNovaSessao(
  mensagem: string,
  userId: string,
): Promise<{
  session: SupabaseSession;
  sessionId: string;
  conversaId: number;
}> {
  const sessionId = `agent-commerce-${randomUUID()}`;

  const session = new SupabaseSession({
    sessionId,
  });

  const conversaId =
    await session.getConversaId();

  await atualizarTituloConversa(
    sessionId,
    mensagem,
  );

  // Owner escolhido pelo servidor (id do JWT),
  // nunca pelo cliente. Só carimba se ainda null
  // (corrida improvável, nunca roubar owner).
  const { error } = await supabase
    .from("conversas")
    .update({ user_id: userId })
    .eq("id", conversaId)
    .is("user_id", null);

  if (error) {
    throw new ErroApi(500, "internal_error");
  }

  return {
    session,
    sessionId,
    conversaId,
  };
}


// ======================================================
// TEXTO FINAL DO AGENTE
// ======================================================

function textoFinal(
  finalOutput: unknown,
): string {
  if (typeof finalOutput === "string") {
    return finalOutput;
  }

  return "";
}


// ======================================================
// PASSAGEM ÚNICA (primeira execução)
// ======================================================

async function executarPassagemInicial(
  texto: string,
  session: SupabaseSession,
  contexto: AgentCommerceContext,
  sessionId: string,
) {
  const runner = criarRunner({
    sessionId,
    contexto,
    interface: "api",
  });

  ativarObservabilidadeLocal(runner);

  const inicio = performance.now();

  const resultado = await runner.run(
    agente,
    texto,
    {
      session,

      context: contexto,

      toolExecution: {
        preApprovalInputGuardrails: true,
      },
    },
  );

  const duracaoMs =
    performance.now() - inicio;

  const usage = resultado.state.usage;

  mostrarResumoExecucao({
    duracaoMs,

    usage: {
      requests: usage.requests,

      inputTokens: usage.inputTokens,

      outputTokens: usage.outputTokens,

      totalTokens: usage.totalTokens,
    },
  });

  return resultado;
}


// ======================================================
// INTERRUPÇÃO -> APPROVAL_REQUIRED
// ======================================================

async function registarInterrupcao(
  resultado: Awaited<
    ReturnType<typeof executarPassagemInicial>
  >,
  contexto: AgentCommerceContext,
  sessionId: string,
  conversaId: number,
): Promise<RespostaChat> {
  const interrupcoes =
    resultado.interruptions ?? [];

  const interruption = interrupcoes[0];

  if (!interruption) {
    return {
      status: "completed",
      conversationId: conversaId,
      message: textoFinal(
        resultado.finalOutput,
      ),
    };
  }

  const nomeTool = interruption.name;

  if (
    nomeTool !== "criar_venda" &&
    nomeTool !== "criar_produto"
  ) {
    throw new ErroApi(500, "internal_error");
  }

  const operacao: OperacaoAprovacao =
    nomeTool;

  let summary:
    | ResumoVendaApi
    | ResumoProdutoApi;

  if (operacao === "criar_venda") {
    await atualizarStatusAprovacao(
      contexto,
      "aguardando_aprovacao",
    );

    const resumo =
      await obterResumoVendaAprovacao(
        contexto,
        interruption.arguments,
      );

    summary = {
      cliente: resumo.clienteNome,
      produto: resumo.produtoNome,
      quantidade: resumo.quantidade,
      metodoPagamento:
        resumo.metodoPagamento,
      precoUnitario: resumo.precoUnitario,
      total: resumo.total,
      moeda: resumo.moeda,
    };
  } else {
    const resumo =
      obterResumoProdutoAprovacao(
        interruption.arguments,
      );

    summary = {
      nome: resumo.nome,
      preco: resumo.preco,
      quantidadeInicial: resumo.quantidade,
      moeda: resumo.moeda,
    };
  }

  const approvalId = randomUUID();

  // Durable primeiro, runtime depois: se a base
  // falhar, nada fica pendente em memoria.
  await criarLinhaApproval({
    id: approvalId,
    conversaId,
    operacao,
    summary,
  });

  guardarRuntime({
    approvalId,
    conversaId,
    sessionId,
    operacao,
    estado: resultado.state,
    interruption,
    createdAt: Date.now(),
  });

  return {
    status: "approval_required",
    conversationId: conversaId,
    approval: {
      id: approvalId,
      operation: operacao,
      summary,
    },
  };
}


// ======================================================
// POST /api/chat
// ======================================================

export async function processarChat(
  mensagem: string,
  conversationId: number | undefined,
  user: AuthenticatedUser,
): Promise<RespostaChat> {
  let resolvida: {
    session: SupabaseSession;
    sessionId: string;
    conversaId: number;
  };

  if (conversationId === undefined) {
    resolvida = await criarNovaSessao(
      mensagem,
      user.id,
    );
  } else {
    resolvida = await resolverSessaoExistente(
      conversationId,
      user.id,
    );
  }

  if (
    await existePendenteParaConversa(
      resolvida.conversaId,
    )
  ) {
    throw new ErroApi(
      409,
      "approval_pending",
    );
  }

  const contexto = await carregarContexto(
    resolvida.session,
  );

  const resultado =
    await executarPassagemInicial(
      mensagem,
      resolvida.session,
      contexto,
      resolvida.sessionId,
    );

  return registarInterrupcao(
    resultado,
    contexto,
    resolvida.sessionId,
    resolvida.conversaId,
  );
}


// ======================================================
// POST /api/approvals/:approvalId
// ======================================================

export async function decidirApproval(
  approvalId: string,
  decision: string,
  user: AuthenticatedUser,
): Promise<RespostaChat> {
  if (
    decision !== "approve" &&
    decision !== "reject"
  ) {
    throw new ErroApi(400, "invalid_request");
  }

  // Ownership ANTES do consumo one-time: tentativa
  // de outro utilizador dá 404 e preserva o pending
  // do dono (não consome o claim).
  const dono =
    await obterDonoDaConversaDoApproval(
      approvalId,
    );

  if (dono !== user.id) {
    throw new ErroApi(
      404,
      "approval_not_found",
    );
  }

  // Consumo one-time: a partir daqui o id morre
  // na memoria. Sem runtime, retomar e impossivel:
  // expira a linha se ainda estiver pending.
  const pendente =
    consumirRuntime(approvalId);

  if (!pendente) {
    await expirarSeOrfa(approvalId).catch(
      () => undefined,
    );

    throw new ErroApi(
      404,
      "approval_not_found",
    );
  }

  const session = new SupabaseSession({
    sessionId: pendente.sessionId,
  });

  const contexto = await carregarContexto(
    session,
  );

  const runner = criarRunner({
    sessionId: pendente.sessionId,
    contexto,
    interface: "api",
  });

  ativarObservabilidadeLocal(runner);

  if (pendente.operacao === "criar_venda") {
    await atualizarStatusAprovacao(
      contexto,
      decision === "approve"
        ? "aprovada"
        : "cancelada",
    );
  }

  if (decision === "approve") {
    pendente.estado.approve(
      pendente.interruption,
    );
  } else {
    pendente.estado.reject(
      pendente.interruption,
      pendente.operacao === "criar_venda"
        ? {
            message:
              "A venda foi rejeitada pelo utilizador. A operação deve ser considerada cancelada.",
          }
        : {
            message:
              "O cadastro do produto foi rejeitado pelo utilizador. A operação deve ser considerada cancelada.",
          },
    );
  }

  // Linha durable acompanha a decisao humana;
  // a retomada abaixo usa so a memoria.
  await marcarDecisao(
    approvalId,
    decision === "approve"
      ? "approved"
      : "rejected",
  );

  const inicio = performance.now();

  const resultado = await runner.run(
    agente,
    pendente.estado,
    {
      session,

      toolExecution: {
        preApprovalInputGuardrails: true,
      },
    },
  );

  const duracaoMs =
    performance.now() - inicio;

  const usage = resultado.state.usage;

  mostrarResumoExecucao({
    duracaoMs,

    usage: {
      requests: usage.requests,

      inputTokens: usage.inputTokens,

      outputTokens: usage.outputTokens,

      totalTokens: usage.totalTokens,
    },
  });

  // Cadeia rara: nova interrupção após retomar.
  return registarInterrupcao(
    resultado,
    contexto,
    pendente.sessionId,
    pendente.conversaId,
  );
}
