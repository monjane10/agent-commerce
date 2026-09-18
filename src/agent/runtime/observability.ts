import { performance } from "node:perf_hooks";

import type {
  Runner,
} from "@openai/agents";


// ======================================================
// TIPOS
// ======================================================

type UsageResumo = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type ResumoExecucaoParams = {
  duracaoMs: number;
  usage: UsageResumo;
};


// ======================================================
// OBSERVABILIDADE DO RUNNER
// ======================================================

export function ativarObservabilidadeLocal(
  runner: Runner,
) {
  const inicioTools =
    new WeakMap<object, number>();


  // ====================================================
  // AGENT START
  // ====================================================

  runner.on(
    "agent_start",
    (
      _context,
      agent,
    ) => {
      console.log(
        `\n[OBS] Agente iniciado: ${agent.name}`,
      );
    },
  );


  // ====================================================
  // TOOL START
  // ====================================================

  runner.on(
    "agent_tool_start",
    (
      _context,
      _agent,
      tool,
      { toolCall },
    ) => {
      inicioTools.set(
        toolCall as object,
        performance.now(),
      );

      console.log(
        `[OBS] Tool iniciada: ${tool.name}`,
      );
    },
  );


  // ====================================================
  // TOOL END
  // ====================================================

  runner.on(
    "agent_tool_end",
    (
      _context,
      _agent,
      tool,
      _result,
      { toolCall },
    ) => {
      const inicio =
        inicioTools.get(
          toolCall as object,
        );

      if (inicio === undefined) {
        console.log(
          `[OBS] Tool terminada: ${tool.name}`,
        );

        return;
      }

      const duracao =
        performance.now() -
        inicio;

      inicioTools.delete(
        toolCall as object,
      );

      console.log(
        `[OBS] Tool terminada: ${tool.name} (${Math.round(
          duracao,
        )} ms)`,
      );
    },
  );


  // ====================================================
  // AGENT END
  // ====================================================

  runner.on(
    "agent_end",
    (
      _context,
      agent,
      _output,
    ) => {
      console.log(
        `[OBS] Agente terminado: ${agent.name}`,
      );
    },
  );
}


// ======================================================
// RESUMO DA EXECUÇÃO
// ======================================================

export function mostrarResumoExecucao(
  params: ResumoExecucaoParams,
) {
  const segundos =
    params.duracaoMs / 1000;

  console.log(
    "\n-----------------------------------",
  );

  console.log(
    "OBSERVABILIDADE",
  );

  console.log(
    "-----------------------------------",
  );

  console.log(
    `Duração ativa: ${segundos.toFixed(2)} s`,
  );

  console.log(
    `Requests ao modelo: ${params.usage.requests}`,
  );

  console.log(
    `Input tokens: ${params.usage.inputTokens}`,
  );

  console.log(
    `Output tokens: ${params.usage.outputTokens}`,
  );

  console.log(
    `Total tokens: ${params.usage.totalTokens}`,
  );

  console.log(
    "-----------------------------------\n",
  );
}