import { useState } from "react";
import { supabase } from "../lib/supabase";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aEntrar, setAEntrar] = useState(false);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    if (aEntrar) return;
    setErro(null);
    setAEntrar(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        // Mensagem genérica: sem resposta bruta do Supabase.
        setErro(
          "Não foi possível iniciar sessão. Verifique os seus dados.",
        );
      }
      // Sucesso: App reage via onAuthStateChange.
    } catch {
      setErro(
        "Não foi possível iniciar sessão. Verifique os seus dados.",
      );
    } finally {
      setAEntrar(false);
    }
  }

  return (
    <div className="ecra-centrado">
      <div className="cartao-login">
        <h1 className="marca">Agent Commerce</h1>
        <p className="subtitulo">Assistente comercial inteligente</p>
        <form onSubmit={submeter} className="formulario">
          <label className="rotulo" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="campo"
            type="email"
            autoComplete="email"
            placeholder="utilizador@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={aEntrar}
            required
          />
          <label className="rotulo" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="campo"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={aEntrar}
            required
          />
          {erro ? (
            <p className="erro" role="alert">
              {erro}
            </p>
          ) : null}
          <button
            className="botao botao-primario"
            type="submit"
            disabled={aEntrar}
          >
            {aEntrar ? "A entrar…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
