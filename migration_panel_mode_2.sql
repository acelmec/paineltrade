-- MIGRATION: PERMISSÃO DE ACESSO AO MODO 2 (PAINEL TRADE AVANÇADO)
-- Execute este script no SQL Editor do console do Supabase.

ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS allow_panel_mode_2 BOOLEAN DEFAULT false;

-- Forçar o Supabase/PostgREST a recarregar o cache de schema da API imediatamente:
NOTIFY pgrst, 'reload schema';
