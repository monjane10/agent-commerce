// ======================================================
// CONFIGURAÇÃO DE TRACING
// ======================================================

import { Runner } from "@openai/agents";

import type {
  AgentCommerceContext,
} from "../context.js";


type CriarRunnerParams = {
  sessionId: string;
  contexto: AgentCommerceContext;
};


// ======================================================
// CRIAR RUNNER COM TRACING CONFIGURADO
// ======================================================

export function criarRunner(
  params: CriarRunnerParams,
) {
  return new Runner({
    workflowName:
      "Agent Commerce",

    // Todos os runs da mesma conversa ficam associados.
    groupId:
      params.sessionId,

    traceMetadata: {
      aplicacao:
        "agent-commerce",

      conversa_id:
        String(
          params.contexto.conversaId,
        ),

      interface:
        "cli",
    },

    // Não enviar conteúdo sensível dos inputs/outputs
    // para o trace.
    traceIncludeSensitiveData:
      false,
  });
}