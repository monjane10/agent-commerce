import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { AgentApiError, type ApprovalSummary } from "../types/api";
import {
  formatarResumo,
  mensagemErroAmigavel,
  postChat,
  postDecisaoApproval,
  type DecisaoApproval,
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
  "Reveja o resumo e aprove ou rejeite.";

export function Chat({ emailUtilizador, aoSair }: Props) {
  const [mensagens, setMensagens] = useState<ChatMessage[]>([]);
  const [rascunho, setRascunho] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(
    null,
  );
  // Approval pendente com dados para decidir (Fase 7B).
  // "Nova conversa" limpa só o estado local: NÃO cancela o
  // approval persistido no backend.
  const [approval, setApproval] = useState<ApprovalSummary | null>(
    null,
  );
  const [aEnviar, setAEnviar] = useState(false);
  const [aDecidir, setADecidir] = useState(false);
  // 409 sem approval conhecido (ex.: estado perdido): a
  // conversa continua bloqueada até nova conversa.
  const [bloqueado, setBloqueado] = useState(false);
  const aEnviarRef = useRef(false);

  function novaConversa() {
    setConversationId(null);
    setMensagens([]);
    setApproval(null);
    setBloqueado(false);
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
    if (texto === "" || aEnviarRef.current || approval !== null || bloqueado) return;
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
        // approval_required: guarda conversationId e o
        // approval (com id) para decisão, e bloqueia o
        // composer — o backend responde 409 se a mesma
        // conversa continuar com approval pendente.
        setApproval(resposta.approval);
        const resumo =
          `Operação: ${resposta.approval.operation}.\n` +
          formatarResumo(resposta.approval.summary);
        adicionarSistema(`${MENSAGEM_APPROVAL}\n${resumo}`);
      }
    } catch (erro) {
      if (
        erro instanceof AgentApiError &&
        erro.httpStatus === 409
      ) {
        setBloqueado(true);
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

  // Fluxo 7B: Confirmação humana -> Aprovar/Rejeitar ->
  // Execução -> resposta no próprio chat. Consumo one-time:
  // cada approval só pode ser decidido uma vez.
  async function decidir(decision: DecisaoApproval) {
    if (approval === null || aDecidir) return;
    setADecidir(true);
    try {
      const resposta = await postDecisaoApproval(
        approval.id,
        decision,
      );
      setConversationId(resposta.conversationId);

      if (resposta.status === "completed") {
        setApproval(null);
        setBloqueado(false);
        setMensagens((atuais) => [
          ...atuais,
          { id: novoId(), role: "assistant", content: resposta.message },
        ]);
      } else {
        // Cadeia rara: nova interrupção após retomar.
        setApproval(resposta.approval);
        const resumo =
          `Operação: ${resposta.approval.operation}.\n` +
          formatarResumo(resposta.approval.summary);
        adicionarSistema(`${MENSAGEM_APPROVAL}\n${resumo}`);
      }
    } catch (erro) {
      if (erro instanceof AgentApiError && erro.httpStatus === 401) {
        await supabase.auth.signOut();
        aoSair();
        return;
      }
      if (
        erro instanceof AgentApiError &&
        erro.code === "approval_not_found"
      ) {
        // Já decidida/expirada noutro local: libertar a
        // conversa e deixar o utilizador continuar.
        setApproval(null);
        setBloqueado(false);
      }
      const requestId =
        erro instanceof AgentApiError ? erro.requestId : null;
      adicionarSistema(mensagemErroAmigavel(erro), requestId);
    } finally {
      setADecidir(false);
    }
  }

  function teclaPressionada(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra linha.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void enviar();
    }
  }

  const composerBloqueado =
    aEnviar || approval !== null || bloqueado;

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

      {approval !== null ? (
        <section
          className="aprovacao"
          aria-label="Confirmação de operação"
        >
          <p className="aprovacao-titulo" role="status">
            Operação a aguardar confirmação: {approval.operation}
          </p>
          <p className="aprovacao-resumo">
            {formatarResumo(approval.summary)}
          </p>
          <div className="aprovacao-acoes">
            <button
              className="botao botao-primario"
              type="button"
              onClick={() => void decidir("approve")}
              disabled={aDecidir}
            >
              {aDecidir ? "A decidir…" : "Aprovar e executar"}
            </button>
            <button
              className="botao botao-secundario"
              type="button"
              onClick={() => void decidir("reject")}
              disabled={aDecidir}
            >
              Rejeitar
            </button>
          </div>
        </section>
      ) : bloqueado ? (
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
            composerBloqueado
              ? "Conversa bloqueada — decida a operação ou inicie uma nova conversa"
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
