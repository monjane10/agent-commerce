export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  requestId?: string;
};

function classeBolha(role: ChatMessage["role"]): string {
  if (role === "user") return "bolha bolha-utilizador";
  if (role === "assistant") return "bolha bolha-assistente";
  return "bolha bolha-sistema";
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div className={classeBolha(message.role)}>
      {/* Texto simples com quebras de linha preservadas.
          Sem markdown complexo, sem dangerouslySetInnerHTML. */}
      <p className="bolha-texto">{message.content}</p>
      {message.requestId ? (
        <p className="bolha-codigo">Código: {message.requestId}</p>
      ) : null}
    </div>
  );
}
