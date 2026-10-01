import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { LoginForm } from "./components/LoginForm";
import { Chat } from "./components/Chat";

type EstadoAuth =
  | { fase: "loading" }
  | { fase: "anonimo" }
  | { fase: "autenticado"; session: Session };

export function App() {
  const [estado, setEstado] = useState<EstadoAuth>({ fase: "loading" });

  useEffect(() => {
    let ativo = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setEstado(
        data.session
          ? { fase: "autenticado", session: data.session }
          : { fase: "anonimo" },
      );
    });

    // Reage a login/logout/expiração, inclusive noutra aba.
    // Sem session, o chat nunca fica acessível.
    const { data: subscricao } = supabase.auth.onAuthStateChange(
      (_evento, session) => {
        if (!ativo) return;
        setEstado(
          session
            ? { fase: "autenticado", session }
            : { fase: "anonimo" },
        );
      },
    );

    return () => {
      ativo = false;
      subscricao.subscription.unsubscribe();
    };
  }, []);

  if (estado.fase === "loading") {
    return (
      <div className="ecra-centrado">
        <p className="carregando" role="status">
          A carregar…
        </p>
      </div>
    );
  }

  if (estado.fase === "anonimo") {
    return <LoginForm />;
  }

  return (
    <Chat
      emailUtilizador={estado.session.user.email ?? "utilizador"}
      aoSair={() => setEstado({ fase: "anonimo" })}
    />
  );
}
