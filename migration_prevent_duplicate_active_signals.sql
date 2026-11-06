-- Script de migração para corrigir duplicidades existentes e aplicar a trava única no Supabase

-- 1. Tratar relatórios duplicados antigos com status 'Em Andamento'
-- Altera o status para 'Cancelado' mantendo apenas a operação mais recente para cada conta + painel
UPDATE painelvm_strategy_reports r
SET status = 'Cancelado',
    closed_at = NOW(),
    description = COALESCE(r.description, '') || ' [Cancelado: Duplicidade]'
WHERE r.status = 'Em Andamento'
  AND r.id NOT IN (
    SELECT DISTINCT ON (account_id, panel_id) id
    FROM painelvm_strategy_reports
    WHERE status = 'Em Andamento'
      AND account_id IS NOT NULL
      AND panel_id IS NOT NULL
    ORDER BY account_id, panel_id, created_at DESC
  );

-- 2. Recriar o índice único parcial para proibir futuras duplicidades
DROP INDEX IF EXISTS idx_unique_active_signal_per_account_panel;

CREATE UNIQUE INDEX idx_unique_active_signal_per_account_panel 
ON painelvm_strategy_reports (account_id, panel_id) 
WHERE status = 'Em Andamento';

-- 3. Notificar PostgREST para recarregar a estrutura das tabelas
NOTIFY pgrst, 'reload schema';
