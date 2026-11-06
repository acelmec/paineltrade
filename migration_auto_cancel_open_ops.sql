-- Script de migração para Gestão de Encerramento de Operações Abertas e Pausa Automática de Alertas em Mercado Parado (15s)
-- Execute este script no SQL Editor do seu Supabase (https://supabase.com/dashboard)

ALTER TABLE painelvm_settings 
ADD COLUMN IF NOT EXISTS auto_cancel_open_ops_enabled BOOLEAN DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS auto_cancel_open_ops_time TEXT DEFAULT '17:59:00' NOT NULL,
ADD COLUMN IF NOT EXISTS pause_alerts_on_stale_market BOOLEAN DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS stale_market_timeout_sec INT DEFAULT 15 NOT NULL;

-- Recarregar o cache de esquemas do PostgREST para reconhecer as novas colunas
NOTIFY pgrst, 'reload schema';
