-- MIGRATION: PERMISSÃO DE COMPARTILHAMENTO DE ESTRATÉGIAS
-- Execute este script no SQL Editor do console do Supabase.

ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS allow_share_strategies BOOLEAN DEFAULT false;
