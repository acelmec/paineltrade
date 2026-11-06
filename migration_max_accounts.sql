-- MIGRATION: ADICIONAR COLUNA MAX_ACCOUNTS NA TABELA DE SESSÕES
-- Execute este script no SQL Editor do seu Supabase Dashboard.

-- 1. Adicionar coluna max_accounts caso não exista (padrão 5 contas por usuário)
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS max_accounts INTEGER DEFAULT 5;

-- 2. Adicionar coluna max_strategies caso não exista (padrão 2 robôs por usuário)
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS max_strategies INTEGER DEFAULT 2;

-- 3. Atualizar registros existentes onde max_accounts está NULL
UPDATE painelvm_users_sessions SET max_accounts = 5 WHERE max_accounts IS NULL;

-- 4. Forçar o Supabase/PostgREST a recarregar o cache do schema imediatamente
NOTIFY pgrst, 'reload schema';
