-- ======================================================
-- Agent Commerce — conversas.user_id (Fase 6A)
--
-- Correr uma vez no Supabase SQL editor.
--
-- user_id nullable: conversas historicas (CLI, fase
-- API key) continuam NULL e seguem acessiveis a CLI.
-- A API autenticada so acessa user_id = auth.uid().
-- Enforcement principal na aplicacao (service_role
-- faz bypass a RLS); sem RLS nova nesta fase.
-- ======================================================

alter table public.conversas
  add column if not exists user_id uuid null
  references auth.users (id)
  on delete set null;

create index if not exists conversas_user_id_idx
  on public.conversas (user_id);
