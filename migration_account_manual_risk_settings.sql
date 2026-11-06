-- Script de migração para adicionar Gestão de Risco Operacional e Operações Manuais por Conta
-- Execute este script no SQL Editor do console do seu Supabase.

ALTER TABLE painelvm_broker_accounts 
ADD COLUMN IF NOT EXISTS manual_trading_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS manual_start_time TEXT DEFAULT '09:00:00',
ADD COLUMN IF NOT EXISTS manual_end_time TEXT DEFAULT '17:00:00',
ADD COLUMN IF NOT EXISTS manual_max_lots INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS manual_max_daily_trades INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS trader_daily_stop_loss_usd NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS trader_daily_take_profit_usd NUMERIC DEFAULT 0;

-- Recarregar o cache do PostgREST
NOTIFY pgrst, 'reload schema';
