import readline from "node:readline/promises";

import {
  randomUUID,
} from "node:crypto";

import {
  listarConversasSdk,
} from "./conversation.service.js";

import {
  atualizarTitulosAntigos,
} from "./title.service.js";


type SessaoSelecionada = {
  sessionId: string;

  novaConversa: boolean;
};


function formatarData(
  data: string,
): string {
  return new Date(
    data,
  ).toLocaleString(
    "pt-MZ",
  );
}


function gerarSessionId():
  string {
  return (
    `agent-commerce-${randomUUID()}`
  );
}


export async function escolherSessao(
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
