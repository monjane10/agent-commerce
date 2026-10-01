-- ======================================================
-- Agent Commerce — agent_approvals (HITL da API HTTP)
--
-- Correr uma vez no Supabase SQL editor.
--
-- Modelo:
--   Supabase (durable): id, conversa, operacao, status,
--     summary, timestamps.
--   Memoria do runtime (volatil): RunState + interruption.
--
-- O summary e aprovado/rejeitado sobrevivem a restarts;
-- o RunState nao: pendentes no arranque passam a expired.
-- ======================================================

create table if not exists public.agent_approvals (
  id uuid primary key,

  conversa_id bigint not null
    references public.conversas (id)
    on delete cascade,

  operation text not null
    check (
      operation in (
        'criar_venda',
        'criar_produto'
      )
    ),

  status text not null default 'pending'
    check (
      status in (
        'pending',
        'approved',
        'rejected',
        'expired'
      )
    ),

  summary jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  decided_at timestamptz
);

create index if not exists agent_approvals_conversa_idx
  on public.agent_approvals (conversa_id);

create index if not exists agent_approvals_status_idx
  on public.agent_approvals (status)
  where status = 'pending';
