import readline from "node:readline/promises";

import {
  stdin as input,
  stdout as output,
} from "node:process";

import {
  SupabaseSession,
} from "../sessions/supabase-session.js";

import {
  escolherSessao,
} from "../conversations/conversation-menu.js";

import {
  atualizarTituloConversa,
} from "../conversations/title.service.js";

import {
  carregarContexto,
  executarComAprovacao,
} from "../agent/runtime/run-agent.js";


export async function iniciarAplicacao():
  Promise<void> {
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
          sessionId,
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
