import {
  supabase,
} from "../lib/supabase.js";


export function gerarTitulo(
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


export function extrairTextoUsuario(
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


export async function atualizarTitulosAntigos():
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


export async function atualizarTituloConversa(
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
