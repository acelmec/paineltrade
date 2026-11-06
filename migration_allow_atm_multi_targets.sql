-- ==============================================================================
-- Script de Migração: Permitir Múltiplos Alvos (Brackets ATM) Concorrentes
-- Execute este script no SQL Editor do seu Supabase (https://db.vemviraramesa.com.br)
-- ==============================================================================

-- 1. Remove o índice único que impedia o 2º ou 3º alvo de uma estratégia ATM de ficar 'Em Andamento'
DROP INDEX IF EXISTS idx_unique_active_signal_per_account_panel;

-- 2. Criar índice de performance não-único para buscas rápidas de operações ativas
CREATE INDEX IF NOT EXISTS idx_active_signals_account_panel 
ON painelvm_strategy_reports (account_id, panel_id) 
WHERE status = 'Em Andamento';

-- 3. Notificar PostgREST para recarregar o schema
NOTIFY pgrst, 'reload schema';
