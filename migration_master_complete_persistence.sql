-- ==============================================================================
-- VORTEX WEB — MIGRATION MASTER COMPLETA DE PERSISTÊNCIA NA NUVEM
-- Execute este script completo no SQL Editor do Console Supabase
-- ==============================================================================

-- 1. TABELA DE ALGORITMOS E ESTRATÉGIAS CUSTOMIZADAS (painelvm_custom_strategies)
CREATE TABLE IF NOT EXISTS painelvm_custom_strategies (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    strategy_type TEXT DEFAULT 'indicator',
    action TEXT DEFAULT 'alert',
    execution_mode TEXT DEFAULT 'closed',
    symbols JSONB DEFAULT '[]'::jsonb,
    timeframes JSONB DEFAULT '[]'::jsonb,
    sessions JSONB DEFAULT '[]'::jsonb,
    payload JSONB DEFAULT '{}'::jsonb,
    source TEXT DEFAULT 'builder',
    raw_prompt TEXT DEFAULT '',
    auto_manage_positions BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE painelvm_custom_strategies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver seus próprios algoritmos" ON painelvm_custom_strategies;
CREATE POLICY "Usuários podem ver seus próprios algoritmos"
    ON painelvm_custom_strategies FOR SELECT
    USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'admin@vortex.com' OR user_id IS NULL);

DROP POLICY IF EXISTS "Usuários podem gerenciar seus próprios algoritmos" ON painelvm_custom_strategies;
CREATE POLICY "Usuários podem gerenciar seus próprios algoritmos"
    ON painelvm_custom_strategies FOR ALL
    USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'admin@vortex.com');


-- 2. TABELA DE ESTRATÉGIAS ATM (painelvm_atm_strategies)
CREATE TABLE IF NOT EXISTS painelvm_atm_strategies (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    stop_ticks NUMERIC NOT NULL DEFAULT 20,
    take_ticks NUMERIC NOT NULL DEFAULT 40,
    trail_trigger_ticks NUMERIC DEFAULT NULL,
    trail_dist_ticks NUMERIC DEFAULT NULL,
    break_even_trigger_ticks NUMERIC DEFAULT NULL,
    break_even_offset_ticks NUMERIC DEFAULT 0,
    quantity_lots NUMERIC DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE painelvm_atm_strategies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver suas próprias estratégias ATM" ON painelvm_atm_strategies;
CREATE POLICY "Usuários podem ver suas próprias estratégias ATM"
    ON painelvm_atm_strategies FOR SELECT
    USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'admin@vortex.com' OR user_id IS NULL);

DROP POLICY IF EXISTS "Usuários podem gerenciar suas próprias estratégias ATM" ON painelvm_atm_strategies;
CREATE POLICY "Usuários podem gerenciar suas próprias estratégias ATM"
    ON painelvm_atm_strategies FOR ALL
    USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'admin@vortex.com');


-- 3. TABELA DE PERFIS DE LAYOUT DOS CARDS (painelvm_user_profiles)
CREATE TABLE IF NOT EXISTS painelvm_user_profiles (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    card_order JSONB NOT NULL DEFAULT '[]'::jsonb,
    hidden_cards JSONB NOT NULL DEFAULT '[]'::jsonb,
    card_columns JSONB DEFAULT '{}'::jsonb,
    card_col_spans JSONB DEFAULT '{}'::jsonb,
    card_heights JSONB DEFAULT '{}'::jsonb,
    card_widths JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE painelvm_user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver seus próprios perfis de layout" ON painelvm_user_profiles;
CREATE POLICY "Usuários podem ver seus próprios perfis de layout"
    ON painelvm_user_profiles FOR SELECT
    USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'admin@vortex.com' OR user_id IS NULL);

DROP POLICY IF EXISTS "Usuários podem gerenciar seus próprios perfis de layout" ON painelvm_user_profiles;
CREATE POLICY "Usuários podem gerenciar seus próprios perfis de layout"
    ON painelvm_user_profiles FOR ALL
    USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'admin@vortex.com');


-- 4. TABELA DE TRAÇADOS E DESENHOS GRÁFICOS (painelvm_chart_drawings)
CREATE TABLE IF NOT EXISTS painelvm_chart_drawings (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    drawings JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE painelvm_chart_drawings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver seus próprios desenhos gráficos" ON painelvm_chart_drawings;
CREATE POLICY "Usuários podem ver seus próprios desenhos gráficos"
    ON painelvm_chart_drawings FOR SELECT
    USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'admin@vortex.com' OR user_id IS NULL);

DROP POLICY IF EXISTS "Usuários podem gerenciar seus próprios desenhos gráficos" ON painelvm_chart_drawings;
CREATE POLICY "Usuários podem gerenciar seus próprios desenhos gráficos"
    ON painelvm_chart_drawings FOR ALL
    USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'admin@vortex.com');


-- 5. TABELA DE ESTADO DO GRÁFICO POR CONTA E ATIVO (painelvm_account_chart_state)
-- (Salva Indicadores Ativos, Widgets e Timeframe por Conta e Símbolo)
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


-- 6. TABELA DE VÍNCULO DE ROBÔS / IA ÀS CONTAS (painelvm_account_strategies)
CREATE TABLE IF NOT EXISTS painelvm_account_strategies (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    prompt_id TEXT,
    manual_strategy_id TEXT,
    contract_size_multiplier NUMERIC DEFAULT 1.0,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE painelvm_account_strategies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver rotas de estratégias de suas contas" ON painelvm_account_strategies;
CREATE POLICY "Usuários podem ver rotas de estratégias de suas contas"
    ON painelvm_account_strategies FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Usuários podem gerenciar rotas de estratégias de suas contas" ON painelvm_account_strategies;
CREATE POLICY "Usuários podem gerenciar rotas de estratégias de suas contas"
    ON painelvm_account_strategies FOR ALL
    USING (true);


-- 7. COLUNAS DE REGRAS OPERACIONAIS E CONFIGURAÇÕES DA CONTA (painelvm_broker_accounts)
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
ADD COLUMN IF NOT EXISTS trader_daily_take_profit_usd NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());


-- 8. RECARREGAR O SCHEMA CACHE DO POSTGREST
NOTIFY pgrst, 'reload schema';
