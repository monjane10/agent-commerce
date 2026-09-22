import { performance } from "node:perf_hooks";

import readline from "node:readline/promises";

import {
  SupabaseSession,
} from "../../sessions/supabase-session.js";

import {
  criarEstadoInicial,
  obterEstado,
} from "../../state/agent-state.js";

import type {
  AgentCommerceContext,
} from "../context.js";

import {
  agente,
} from "../commerce-agent.js";

import {
  atualizarStatusAprovacao,
  obterResumoVendaAprovacao,
} from "./approval.js";

import {
  mostrarResumoAprovacao,
} from "../../cli/approval-view.js";

import {
  criarRunner,
} from "./tracing.js";

import {
  ativarObservabilidadeLocal,
  mostrarResumoExecucao,
} from "./observability.js";


export async function carregarContexto(
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


export async function executarComAprovacao(
  rl:
    readline.Interface,

  texto:
    string,

  session:
    SupabaseSession,

  contexto:
    AgentCommerceContext,

  sessionId:
    string,
) {
  // ====================================================
  // PRIMEIRA EXECUÇÃO
  // ====================================================

  const runner =
    criarRunner({
      sessionId,
      contexto,
    });

  ativarObservabilidadeLocal(
    runner,
  );

  let duracaoAtivaMs = 0;

  let inicioExecucao =
    performance.now();

  let resultado =
    await runner.run(
      agente,
      texto,
      {
        session,

        context:
          contexto,
      },
    );

  duracaoAtivaMs +=
    performance.now() -
    inicioExecucao;


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

    inicioExecucao =
      performance.now();

    resultado =
      await runner.run(
        agente,
        resultado.state,
        {
          session,
        },
      );

    duracaoAtivaMs +=
      performance.now() -
      inicioExecucao;
  }


  // ====================================================
  // RESUMO DA OBSERVABILIDADE
  // ====================================================

  const usage =
    resultado.state.usage;

  mostrarResumoExecucao({
    duracaoMs:
      duracaoAtivaMs,

    usage: {
      requests:
        usage.requests,

      inputTokens:
        usage.inputTokens,

      outputTokens:
        usage.outputTokens,

      totalTokens:
        usage.totalTokens,
    },
  });


  return resultado;
}
