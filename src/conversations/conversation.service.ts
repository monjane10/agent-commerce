import {
  supabase,
} from "../lib/supabase.js";


export type ConversaSdk = {
  id: number;

  titulo: string;

  sdk_session_id: string;

  created_at: string;

  updated_at: string;
};


export async function listarConversasSdk():
  Promise<ConversaSdk[]> {
  const {
    data,
    error,
  } = await supabase
    .from("conversas")
    .select(`
      id,
      titulo,
      sdk_session_id,
      created_at,
      updated_at
    `)
    .not(
      "sdk_session_id",
      "is",
      null,
    )
    .order(
      "updated_at",
      {
        ascending:
          false,
      },
    );


  if (error) {
    throw new Error(
      `Erro ao listar conversas: ${error.message}`,
    );
  }


  return (
    data ?? []
  )
    .filter(
      (conversa) =>
        conversa.sdk_session_id !==
        null,
    )
    .map(
      (conversa) => ({
        id:
          conversa.id,

        titulo:
          conversa.titulo,

        sdk_session_id:
          conversa.sdk_session_id!,

        created_at:
          conversa.created_at,

        updated_at:
          conversa.updated_at,
      }),
    );
}
