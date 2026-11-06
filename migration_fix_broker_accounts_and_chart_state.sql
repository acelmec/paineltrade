-- ==============================================================================
-- MIGRATION: ADIÇÃO DE TODAS AS COLUNAS DE CONTAS E TABELA DE ESTADO DO GRÁFICO
-- Execute este script no SQL Editor do Console Supabase
-- ==============================================================================

-- 1. ADICIONAR TODAS AS COLUNAS DE REGRAS OPERACIONAIS EM painelvm_broker_accounts
ALTER TABLE painelvm_broker_accounts 
ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'axion',
ADD COLUMN IF NOT EXISTS profit_target_usd NUMERIC DEFAULT 3000.00,
ADD COLUMN IF NOT EXISTS consistency_pct NUMERIC DEFAULT 40.0,
ADD COLUMN IF NOT EXISTS simulate_elimination BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS send_localhost BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS manual_strategy_id TEXT,
ADD COLUMN IF NOT EXISTS execution_symbol TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS symbol_mapping TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS manual_trading_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS manual_start_time TEXT DEFAULT '09:00:00',
ADD COLUMN IF NOT EXISTS manual_end_time TEXT DEFAULT '17:00:00',
ADD COLUMN IF NOT EXISTS manual_max_lots INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS manual_max_daily_trades INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS trader_daily_stop_loss_usd NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS trader_daily_take_profit_usd NUMERIC DEFAULT 0;


-- 2. TABELA DE ESTADO DO GRÁFICO POR CONTA E ATIVO (INDICADORES, WIDGETS, TIMEFRAME)
CREATE TABLE IF NOT EXISTS painelvm_account_chart_state (
    id TEXT PRIMARY KEY, -- formato: 'chart_{account_id}_{symbol}'
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    indicators JSONB NOT NULL DEFAULT '[]'::jsonb,
    widgets JSONB NOT NULL DEFAULT '[]'::jsonb,
    timeframe INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE painelvm_account_chart_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver estado dos gráficos de suas contas" ON painelvm_account_chart_state;
CREATE POLICY "Usuários podem ver estado dos gráficos de suas contas"
    ON painelvm_account_chart_state FOR SELECT
    USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'admin@vortex.com' OR user_id IS NULL);

DROP POLICY IF EXISTS "Usuários podem gerenciar estado dos gráficos de suas contas" ON painelvm_account_chart_state;
CREATE POLICY "Usuários podem gerenciar estado dos gráficos de suas contas"
    ON painelvm_account_chart_state FOR ALL
    USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'admin@vortex.com');

-- Recarregar cache de schema
NOTIFY pgrst, 'reload schema';
