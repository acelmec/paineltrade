-- Script de migração para adicionar a coluna contrato na tabela de relatórios
-- Execute este script no SQL Editor do console do seu Supabase.

ALTER TABLE painelvm_strategy_reports 
ADD COLUMN IF NOT EXISTS contrato INT DEFAULT 1 NOT NULL;

-- Recarregar o cache de esquemas do PostgREST para reconhecer as novas colunas
NOTIFY pgrst, 'reload schema';
