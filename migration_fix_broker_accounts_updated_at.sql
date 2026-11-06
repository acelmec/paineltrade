-- ==============================================================================
-- MIGRATION: ADICIONAR updated_at à tabela painelvm_broker_accounts
-- Execute no SQL Editor do Supabase
-- ==============================================================================

-- Esta coluna estava faltando e causava falha silenciosa em TODOS os updates
-- da tabela painelvm_broker_accounts (erro PGRST204 do PostgREST)
ALTER TABLE painelvm_broker_accounts
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- Preencher registros existentes com a data de criação
UPDATE painelvm_broker_accounts
SET updated_at = created_at
WHERE updated_at IS NULL;

-- Recarregar cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';
