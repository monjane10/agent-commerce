import type {
  AgentInputItem,
  Session,
} from "@openai/agents-core";

import { supabase } from "../lib/supabase.js";


// ======================================================
// CONVERTER JSON DO SUPABASE PARA ITEM DO AGENTS SDK
// ======================================================

function converterParaAgentInputItem(
  valor: unknown,
): AgentInputItem {
  return valor as AgentInputItem;
}


// ======================================================
// SUPABASE SESSION
// ======================================================

export class SupabaseSession implements Session {
  private readonly sessionId: string;

  private conversaId: number | null = null;


  constructor(options: {
    sessionId: string;
  }) {
    this.sessionId = options.sessionId;
  }


  // ====================================================
  // GARANTIR QUE A CONVERSA EXISTE
  // ====================================================

  private async garantirConversa(): Promise<number> {
    // Se já temos o ID carregado nesta execução,
    // não precisamos consultar novamente.
    if (this.conversaId !== null) {
      return this.conversaId;
    }


    // ==================================================
    // PROCURAR CONVERSA EXISTENTE
    // ==================================================

    const {
      data: conversaExistente,
      error: erroBusca,
    } = await supabase
      .from("conversas")
      .select("id")
      .eq(
        "sdk_session_id",
        this.sessionId,
      )
      .maybeSingle();


    if (erroBusca) {
      throw new Error(
        `Erro ao procurar sessão: ${erroBusca.message}`,
      );
    }


    // ==================================================
    // REUTILIZAR CONVERSA EXISTENTE
    // ==================================================

    if (conversaExistente) {
      this.conversaId =
        conversaExistente.id;

      return conversaExistente.id;
    }


    // ==================================================
    // CRIAR NOVA CONVERSA
    // ==================================================

    const {
      data: novaConversa,
      error: erroCriacao,
    } = await supabase
      .from("conversas")
      .insert({
        titulo:
          "Conversa Agents SDK",

        sdk_session_id:
          this.sessionId,
      })
      .select("id")
      .single();


    if (erroCriacao) {
      throw new Error(
        `Erro ao criar sessão: ${erroCriacao.message}`,
      );
    }


    if (!novaConversa) {
      throw new Error(
        "Não foi possível criar a conversa.",
      );
    }


    this.conversaId =
      novaConversa.id;


    return novaConversa.id;
  }


  // ====================================================
  // OBTER ID DA CONVERSA
  // ====================================================

  async getConversaId(): Promise<number> {
    return this.garantirConversa();
  }


  // ====================================================
  // GET SESSION ID
  // ====================================================

  async getSessionId(): Promise<string> {
    await this.garantirConversa();

    return this.sessionId;
  }


  // ====================================================
  // GET ITEMS
  // ====================================================

  async getItems(
    limit?: number,
  ): Promise<AgentInputItem[]> {
    const conversaId =
      await this.garantirConversa();


    // ==================================================
    // SEM LIMITE
    // ==================================================

    if (limit === undefined) {
      const {
        data,
        error,
      } = await supabase
        .from("sdk_session_items")
        .select(
          "id, item",
        )
        .eq(
          "conversa_id",
          conversaId,
        )
        .order(
          "id",
          {
            ascending: true,
          },
        );


      if (error) {
        throw new Error(
          `Erro ao carregar histórico: ${error.message}`,
        );
      }


      const itens =
        (data ?? []).map(
          (registo) =>
            converterParaAgentInputItem(
              registo.item,
            ),
        );


      return itens;
    }


    // ==================================================
    // LIMITE INVÁLIDO
    // ==================================================

    if (limit <= 0) {
      return [];
    }


    // ==================================================
    // ÚLTIMOS N ITENS
    // ==================================================

    const {
      data,
      error,
    } = await supabase
      .from("sdk_session_items")
      .select(
        "id, item",
      )
      .eq(
        "conversa_id",
        conversaId,
      )
      .order(
        "id",
        {
          ascending: false,
        },
      )
      .limit(
        limit,
      );


    if (error) {
      throw new Error(
        `Erro ao carregar histórico: ${error.message}`,
      );
    }


    // O Supabase devolve do mais recente
    // para o mais antigo.
    //
    // O Agents SDK precisa da ordem cronológica.
    const itens =
      (data ?? [])
        .reverse()
        .map(
          (registo) =>
            converterParaAgentInputItem(
              registo.item,
            ),
        );


    return itens;
  }


  // ====================================================
  // ADD ITEMS
  // ====================================================

  async addItems(
    items: AgentInputItem[],
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }


    const conversaId =
      await this.garantirConversa();


    const registos =
      items.map(
        (item) => ({
          conversa_id:
            conversaId,

          item,
        }),
      );


    const {
      error,
    } = await supabase
      .from("sdk_session_items")
      .insert(
        registos,
      );


    if (error) {
      throw new Error(
        `Erro ao guardar histórico: ${error.message}`,
      );
    }


    // ==================================================
    // ATUALIZAR DATA DA CONVERSA
    // ==================================================

    const {
      error: erroUpdate,
    } = await supabase
      .from("conversas")
      .update({
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        conversaId,
      );


    if (erroUpdate) {
      throw new Error(
        `Erro ao atualizar conversa: ${erroUpdate.message}`,
      );
    }
  }


  // ====================================================
  // POP ITEM
  // ====================================================

  async popItem():
    Promise<AgentInputItem | undefined> {
    const conversaId =
      await this.garantirConversa();


    // ==================================================
    // PROCURAR ÚLTIMO ITEM
    // ==================================================

    const {
      data,
      error,
    } = await supabase
      .from("sdk_session_items")
      .select(
        "id, item",
      )
      .eq(
        "conversa_id",
        conversaId,
      )
      .order(
        "id",
        {
          ascending: false,
        },
      )
      .limit(1)
      .maybeSingle();


    if (error) {
      throw new Error(
        `Erro ao obter último item: ${error.message}`,
      );
    }


    if (!data) {
      return undefined;
    }


    // ==================================================
    // REMOVER ÚLTIMO ITEM
    // ==================================================

    const {
      error: erroDelete,
    } = await supabase
      .from("sdk_session_items")
      .delete()
      .eq(
        "id",
        data.id,
      );


    if (erroDelete) {
      throw new Error(
        `Erro ao remover último item: ${erroDelete.message}`,
      );
    }


    return converterParaAgentInputItem(
      data.item,
    );
  }


  // ====================================================
  // CLEAR SESSION
  // ====================================================

  async clearSession(): Promise<void> {
    const conversaId =
      await this.garantirConversa();


    const {
      error,
    } = await supabase
      .from("sdk_session_items")
      .delete()
      .eq(
        "conversa_id",
        conversaId,
      );


    if (error) {
      throw new Error(
        `Erro ao limpar sessão: ${error.message}`,
      );
    }
  }
}
