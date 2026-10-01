import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as
  | string
  | undefined;
const supabaseAnonKey = import.meta.env
  .VITE_SUPABASE_ANON_KEY as string | undefined;

// Falha clara em desenvolvimento se a configuração essencial
// estiver ausente. Nunca imprimir chaves.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Configuração Supabase em falta: defina VITE_SUPABASE_URL e " +
      "VITE_SUPABASE_ANON_KEY em frontend/.env.local " +
      "(ver frontend/.env.example).",
  );
}

// Sessão gerida pelo supabase-js (persistência automática,
// refresh automático). Nada de localStorage/sessionStorage próprio.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
