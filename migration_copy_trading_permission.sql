-- MIGRATION: PERMISSÃO DE ACESSO AO COPY TRADING NT8
-- Execute este script no SQL Editor do console do Supabase.

-- 1. Adicionar coluna allow_copy_trading na tabela de sessões (padrão false para novos usuários)
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS allow_copy_trading BOOLEAN DEFAULT false;

-- 2. Garantir que o admin sempre tenha a permissão como true
UPDATE painelvm_users_sessions 
SET allow_copy_trading = true 
WHERE subscription_id = 'admin' OR email = 'admin@vortex.com';

-- 3. Forçar o Supabase/PostgREST a recarregar o cache de schema da API imediatamente:
NOTIFY pgrst, 'reload schema';
