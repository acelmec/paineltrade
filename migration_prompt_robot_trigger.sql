-- Migração para adicionar suporte a acionamento de IA por Robô/Algoritmo Técnico
-- Execute este script no SQL Editor do console do seu Supabase.

ALTER TABLE painelvm_prompts 
ADD COLUMN IF NOT EXISTS trigger_strategy_id UUID REFERENCES painelvm_custom_strategies(id) ON DELETE SET NULL;

-- Recarregar o cache de esquemas do PostgREST para reconhecer a nova coluna
NOTIFY pgrst, 'reload schema';
