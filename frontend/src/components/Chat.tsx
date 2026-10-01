import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { AgentApiError } from "../types/api";
import {
  mensagemErroAmigavel,
  postChat,
} from "../lib/agent-api";
import { MessageBubble, type ChatMessage } from "./MessageBubble";

type Props = {
  emailUtilizador: string;
  aoSair: () => void;
};

function novoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const MENSAGEM_APPROVAL =
  "Esta operação requer confirmação antes de ser executada. " +
  "A aprovação será feita numa próxima fase; por agora, pode começar uma nova conversa.";

export function Chat({ emailUtilizador, aoSair }: Props) {
  const [mensagens, setMensagens] = useState<ChatMessage[]>([]);
  const [rascunho, setRascunho] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(
    null,
  );
  const [approvalPendente, setApprovalPendente] = useState(false);
  const [aEnviar, setAEnviar] = useState(false);
  const aEnviarRef = useRef(false);

  function novaConversa() {
    // Limpa apenas o estado local. Isto NÃO cancela o approval
    // persistido no backend (Fase 7B tratará approve/reject).
    setConversationId(null);
    setMensagens([]);
    setApprovalPendente(false);
    setRascunho("");
  }

  async function sair() {
    await supabase.auth.signOut();
    // App volta ao login via onAuthStateChange; estado do
    // Chat é descartado com a desmontagem do componente.
    aoSair();
  }

  function adicionarSistema(
    content: string,
    requestId?: string | null,
  ) {
    setMensagens((atuais) => [
      ...atuais,
      {
        id: novoId(),
        role: "system",
        content,
        requestId: requestId ?? undefined,
      },
    ]);
  }

  async function enviar() {
    const texto = rascunho.trim();
    // Impede duplo envio e mensagens vazias.
    if (texto === "" || aEnviarRef.current || approvalPendente) return;
    aEnviarRef.current = true;
    setAEnviar(true);

    const mensagemUtilizador: ChatMessage = {
      id: novoId(),
      role: "user",
      content: texto,
    };
    setMensagens((atuais) => [...atuais, mensagemUtilizador]);
    setRascunho("");

    try {
      const resposta = await postChat(texto, conversationId);
      setConversationId(resposta.conversationId);

      if (resposta.status === "completed") {
        setMensagens((atuais) => [
          ...atuais,
          { id: novoId(), role: "assistant", content: resposta.message },
        ]);
      } else {
        // Fase 7A: reconhecer approval_required sem botões
        // approve/reject e sem quebrar. O backend responde
        // 409 se a mesma conversa continuar com approval
        // pendente, por isso o composer é bloqueado.
        setApprovalPendente(true);
        const resumo = `Operação: ${resposta.approval.operation}. ${resposta.approval.summary}`;
        adicionarSistema(`${MENSAGEM_APPROVAL}\n${resumo}`);
      }
    } catch (erro) {
      if (
        erro instanceof AgentApiError &&
        erro.code === "approval_pending"
      ) {
        setApprovalPendente(true);
      }
      if (erro instanceof AgentApiError && erro.httpStatus === 401) {
        // Sessão irrecuperável (refresh já tentado uma vez
        // no API client): terminar sessão e voltar ao login.
        await supabase.auth.signOut();
        aoSair();
        return;
      }
      const requestId =
        erro instanceof AgentApiError ? erro.requestId : null;
      adicionarSistema(mensagemErroAmigavel(erro), requestId);
    } finally {
      aEnviarRef.current = false;
      setAEnviar(false);
    }
  }

  function teclaPressionada(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra linha.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void enviar();
    }
  }

  const composerBloqueado = aEnviar || approvalPendente;

  return (
    <div className="chat">
      <header className="chat-cabecalho">
        <div className="chat-marca">
          <strong>Agent Commerce</strong>
          <span className="chat-email">{emailUtilizador}</span>
        </div>
        <div className="chat-acoes">
          <button
            className="botao botao-secundario"
            type="button"
            onClick={novaConversa}
          >
            Nova conversa
          </button>
          <button
            className="botao botao-secundario"
            type="button"
            onClick={() => void sair()}
          >
            Sair
          </button>
        </div>
      </header>

      {approvalPendente ? (
        <p className="aviso" role="status">
          Existe uma operação pendente de confirmação. Comece uma
          nova conversa para continuar.
        </p>
      ) : null}

      <main className="chat-mensagens" aria-live="polite">
        {mensagens.length === 0 ? (
          <p className="chat-vazio">
            Olá! Pergunte, por exemplo, pelo stock ou preço de um
            produto.
          </p>
        ) : (
          mensagens.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))
        )}
        {aEnviar ? (
          <p className="chat-pensar" role="status">
            A pensar…
          </p>
        ) : null}
      </main>

      <footer className="chat-composer">
        <label className="sr-only" htmlFor="mensagem">
          Mensagem
        </label>
        <textarea
          id="mensagem"
          className="campo campo-mensagem"
          aria-label="Mensagem para o Agent Commerce"
          rows={2}
          placeholder={
            approvalPendente
              ? "Conversa bloqueada — inicie uma nova conversa"
              : "Escreva a sua mensagem… (Enter envia, Shift+Enter quebra linha)"
          }
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onKeyDown={teclaPressionada}
          disabled={composerBloqueado}
        />
        <button
          className="botao botao-primario"
          type="button"
          onClick={() => void enviar()}
          disabled={composerBloqueado || rascunho.trim() === ""}
        >
          Enviar
        </button>
      </footer>
    </div>
  );
}
