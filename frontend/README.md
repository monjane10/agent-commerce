# Agent Commerce — Frontend (Fase 7A)

React + TypeScript + Vite + Supabase Auth + chat com a Agent Commerce API.

## Pré-requisitos

- Backend a correr em `http://127.0.0.1:3005` (`npm run api` na raiz,
  com `AGENT_FRONTEND_ORIGIN=http://localhost:5173` no `.env` da raiz).
- Utilizador criado no Supabase Auth (email/password) para login.

## Configuração

1. `npm install`
2. Copiar `.env.example` para `.env.local` e preencher:
   - `VITE_SUPABASE_URL` — URL do projeto Supabase
   - `VITE_SUPABASE_ANON_KEY` — chave **pública/anon** (nunca
     `service_role`, `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`
     ou `AGENT_API_KEY`)
   - `VITE_AGENT_API_URL=http://127.0.0.1:3005`
3. `npm run dev` → abre em `http://localhost:5173`
4. `npm run build` → build de produção (esperado: 0 erros)

## Notas

- A sessão é gerida pelo `supabase-js` (persiste ao refresh).
- `conversationId` vive só no estado do componente; refresh
  começa uma nova conversa.
- `approval_required` mostra mensagem informativa e bloqueia o
  composer; "Nova conversa" limpa só o estado local (NÃO cancela
  o approval no backend — approve/reject é a Fase 7B).
