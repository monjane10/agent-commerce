// ======================================================
// CONFIGURAÇÃO DE TRACING
// ======================================================

type CriarTracingOptionsParams = {
  sessionId: string;
  conversaId: number;
};


// ======================================================
// OPÇÕES DE TRACING PARA UM RUN
// ======================================================

export function criarTracingOptions(
  params: CriarTracingOptionsParams,
) {
  return {
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
          params.conversaId,
        ),

      interface:
        "cli",
    },

    // Não enviar conteúdo sensível dos inputs/outputs
    // para o trace.
    traceIncludeSensitiveData:
      false,
  };
}