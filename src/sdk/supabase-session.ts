import type {
  AgentInputItem,
  Session,
} from "@openai/agents-core";

import { supabase } from "../lib/supabase.js";


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
    // Se já carregámos a conversa nesta execução,
    // não precisamos consultar novamente.
    if (this.conversaId !== null) {
      return this.conversaId;
    }


    // Procurar conversa existente
    const {
      data: conversaExistente,
      error: erroBusca,
    } = await supabase
      .from("conversas")
      .select("id")
      .eq("sdk_session_id", this.sessionId)
      .maybeSingle();


    if (erroBusca) {
      throw new Error(
        `Erro ao procurar sessão: ${erroBusca.message}`,
      );
    }


    // Se já existe, reutilizamos
    if (conversaExistente) {
      this.conversaId = conversaExistente.id;

      return conversaExistente.id;
    }


    // Criar uma nova conversa
    const {
      data: novaConversa,
      error: erroCriacao,
    } = await supabase
      .from("conversas")
      .insert({
        titulo: "Conversa Agents SDK",
        sdk_session_id: this.sessionId,
      })
      .select("id")
      .single();


    if (erroCriacao) {
      throw new Error(
        `Erro ao criar sessão: ${erroCriacao.message}`,
      );
    }


    this.conversaId = novaConversa.id;

    return novaConversa.id;
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


    // --------------------------------------------------
    // SEM LIMITE
    // --------------------------------------------------

    if (limit === undefined) {
      const {
        data,
        error,
      } = await supabase
        .from("sdk_session_items")
        .select("id, item")
        .eq("conversa_id", conversaId)
        .order("id", {
          ascending: true,
        });


      if (error) {
        throw new Error(
          `Erro ao carregar histórico: ${error.message}`,
        );
      }


      const items: AgentInputItem[] =
        (data ?? []).map((registo) => {
          return registo.item as AgentInputItem;
        });


      return items;
    }


    // --------------------------------------------------
    // LIMITE ZERO OU NEGATIVO
    // --------------------------------------------------

    if (limit <= 0) {
      return [];
    }


    // --------------------------------------------------
    // ÚLTIMOS N ITENS
    // --------------------------------------------------

    const {
      data,
      error,
    } = await supabase
      .from("sdk_session_items")
      .select("id, item")
      .eq("conversa_id", conversaId)
      .order("id", {
        ascending: false,
      })
      .limit(limit);


    if (error) {
      throw new Error(
        `Erro ao carregar histórico: ${error.message}`,
      );
    }


    // O Supabase devolve do mais recente
    // para o mais antigo.
    //
    // O Agents SDK espera ordem cronológica.
    const items: AgentInputItem[] =
      (data ?? [])
        .reverse()
        .map((registo) => {
          return registo.item as AgentInputItem;
        });


    return items;
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
      items.map((item) => {
        return {
          conversa_id: conversaId,
          item: item,
        };
      });


    const {
      error,
    } = await supabase
      .from("sdk_session_items")
      .insert(registos);


    if (error) {
      throw new Error(
        `Erro ao guardar histórico: ${error.message}`,
      );
    }


    // Atualizar a data da conversa
    const {
      error: erroUpdate,
    } = await supabase
      .from("conversas")
      .update({
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", conversaId);


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


    // Procurar o item mais recente
    const {
      data,
      error,
    } = await supabase
      .from("sdk_session_items")
      .select("id, item")
      .eq("conversa_id", conversaId)
      .order("id", {
        ascending: false,
      })
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


    // Remover o último item
    const {
      error: erroDelete,
    } = await supabase
      .from("sdk_session_items")
      .delete()
      .eq("id", data.id);


    if (erroDelete) {
      throw new Error(
        `Erro ao remover último item: ${erroDelete.message}`,
      );
    }


    const item =
      data.item as AgentInputItem;


    return item;
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
      .eq("conversa_id", conversaId);


    if (error) {
      throw new Error(
        `Erro ao limpar sessão: ${error.message}`,
      );
    }
  }
}