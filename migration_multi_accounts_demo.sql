-- Migration: Suporte a Múltiplas Contas Demonstrativas Globais, Copy Trading, Roteamento e Risco Operacional por Conta
-- Executar no SQL Editor do Supabase

-- 1. Tabela de Contas de Negociação Globais (Escopo de Usuário)
CREATE TABLE IF NOT EXISTS painelvm_broker_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_type TEXT DEFAULT 'internal_demo' NOT NULL, -- 'internal_demo' | 'tradovate_demo' | 'tradovate_live'
    tradovate_account_id BIGINT,
    account_name TEXT NOT NULL, -- Ex: "Conta Demo Principal", "Demo Apex 50k", "Conta Master"
    balance NUMERIC DEFAULT 50000.00 NOT NULL,
    initial_balance NUMERIC DEFAULT 50000.00 NOT NULL,
    currency TEXT DEFAULT 'USD' NOT NULL,
    is_master BOOLEAN DEFAULT false NOT NULL, -- Define se é conta MASTER para Copy Trading
    is_active BOOLEAN DEFAULT true NOT NULL,
    
    -- Configurações de Risco e Gestão Operacional da Conta
    dd_mode TEXT DEFAULT 'intraday_trailing' NOT NULL, -- 'intraday_trailing' | 'eod'
    max_drawdown_usd NUMERIC DEFAULT 2500.00 NOT NULL,
    daily_stop_loss_usd NUMERIC DEFAULT 1000.00 NOT NULL,
    daily_max_gain_usd NUMERIC DEFAULT 2000.00 NOT NULL, -- Gain Máximo Diário (Meta)
    daily_max_entries INT DEFAULT 10 NOT NULL, -- Limite de Operações Diárias
    allow_multi_signals BOOLEAN DEFAULT true NOT NULL, -- Se true, permite 1 sinal por ativo diferente; se false, apenas 1 sinal total na conta
    high_watermark NUMERIC DEFAULT 50000.00 NOT NULL, -- Pico máximo de equity (para Intraday Trailing DD)
    eod_baseline_balance NUMERIC DEFAULT 50000.00 NOT NULL, -- Saldo base no início da sessão (para EOD DD)
    enforce_dd_lockout BOOLEAN DEFAULT true NOT NULL, -- Se true, trava/reprova a conta ao violar DD; se false, apenas alerta
    status TEXT DEFAULT 'active' NOT NULL, -- 'active' | 'failed_lockout'
    
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Garantir que as novas colunas existam caso a tabela já tenha sido criada em etapas anteriores
ALTER TABLE painelvm_broker_accounts ADD COLUMN IF NOT EXISTS daily_max_gain_usd NUMERIC DEFAULT 2000.00;
ALTER TABLE painelvm_broker_accounts ADD COLUMN IF NOT EXISTS daily_max_entries INT DEFAULT 10;
ALTER TABLE painelvm_broker_accounts ADD COLUMN IF NOT EXISTS allow_multi_signals BOOLEAN DEFAULT true;
ALTER TABLE painelvm_broker_accounts ADD COLUMN IF NOT EXISTS profit_target_usd NUMERIC DEFAULT 3000.00;
ALTER TABLE painelvm_broker_accounts ADD COLUMN IF NOT EXISTS consistency_pct NUMERIC DEFAULT 40.0;
ALTER TABLE painelvm_broker_accounts ADD COLUMN IF NOT EXISTS simulate_elimination BOOLEAN DEFAULT true;

-- Habilitar RLS em painelvm_broker_accounts
ALTER TABLE painelvm_broker_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver suas próprias contas" ON painelvm_broker_accounts;
CREATE POLICY "Usuários podem ver suas próprias contas"
    ON painelvm_broker_accounts FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem criar suas próprias contas" ON painelvm_broker_accounts;
CREATE POLICY "Usuários podem criar suas próprias contas"
    ON painelvm_broker_accounts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar suas próprias contas" ON painelvm_broker_accounts;
CREATE POLICY "Usuários podem atualizar suas próprias contas"
    ON painelvm_broker_accounts FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem deletar suas próprias contas" ON painelvm_broker_accounts;
CREATE POLICY "Usuários podem deletar suas próprias contas"
    ON painelvm_broker_accounts FOR DELETE
    USING (auth.uid() = user_id);

-- Trigger / Função para Limitar Máximo de 5 Contas Demonstrativas por Usuário
CREATE OR REPLACE FUNCTION check_demo_accounts_limit()
RETURNS TRIGGER AS $$
DECLARE
    accounts_count INTEGER;
BEGIN
    IF NEW.account_type = 'internal_demo' THEN
        SELECT COUNT(*) INTO accounts_count
        FROM painelvm_broker_accounts
        WHERE user_id = NEW.user_id AND account_type = 'internal_demo';

        IF accounts_count >= 5 THEN
            RAISE EXCEPTION 'Limite máximo de 5 contas demonstrativas atingido por usuário.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_demo_accounts_limit ON painelvm_broker_accounts;
CREATE TRIGGER enforce_demo_accounts_limit
BEFORE INSERT ON painelvm_broker_accounts
FOR EACH ROW EXECUTE FUNCTION check_demo_accounts_limit();

-- 2. Tabela de Vinculação de Algoritmos/Prompts por Conta (Roteamento N:N)
CREATE TABLE IF NOT EXISTS painelvm_account_strategies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES painelvm_broker_accounts(id) ON DELETE CASCADE,
    prompt_id UUID REFERENCES painelvm_prompts(id) ON DELETE CASCADE,
    manual_strategy_id TEXT,
    contract_size_multiplier NUMERIC DEFAULT 1.0 NOT NULL,
    is_enabled BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE painelvm_account_strategies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver rotas de estratégias de suas contas" ON painelvm_account_strategies;
CREATE POLICY "Usuários podem ver rotas de estratégias de suas contas"
    ON painelvm_account_strategies FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM painelvm_broker_accounts
        WHERE painelvm_broker_accounts.id = painelvm_account_strategies.account_id
        AND painelvm_broker_accounts.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Usuários podem criar rotas de estratégias de suas contas" ON painelvm_account_strategies;
CREATE POLICY "Usuários podem criar rotas de estratégias de suas contas"
    ON painelvm_account_strategies FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM painelvm_broker_accounts
        WHERE painelvm_broker_accounts.id = painelvm_account_strategies.account_id
        AND painelvm_broker_accounts.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Usuários podem atualizar rotas de estratégias de suas contas" ON painelvm_account_strategies;
CREATE POLICY "Usuários podem atualizar rotas de estratégias de suas contas"
    ON painelvm_account_strategies FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM painelvm_broker_accounts
        WHERE painelvm_broker_accounts.id = painelvm_account_strategies.account_id
        AND painelvm_broker_accounts.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Usuários podem deletar rotas de estratégias de suas contas" ON painelvm_account_strategies;
CREATE POLICY "Usuários podem deletar rotas de estratégias de suas contas"
    ON painelvm_account_strategies FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM painelvm_broker_accounts
        WHERE painelvm_broker_accounts.id = painelvm_account_strategies.account_id
        AND painelvm_broker_accounts.user_id = auth.uid()
    ));

-- 3. Tabela de Configuração de Copy Trading (MASTER -> SLAVE)
CREATE TABLE IF NOT EXISTS painelvm_copy_trading_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES painelvm_broker_accounts(id) ON DELETE CASCADE,
    slave_account_id UUID NOT NULL REFERENCES painelvm_broker_accounts(id) ON DELETE CASCADE,
    lot_multiplier NUMERIC DEFAULT 1.0 NOT NULL,
    copy_manual_trades BOOLEAN DEFAULT true NOT NULL,
    copy_algo_trades BOOLEAN DEFAULT true NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(master_account_id, slave_account_id)
);

ALTER TABLE painelvm_copy_trading_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem gerenciar copy trading de suas contas" ON painelvm_copy_trading_config;
CREATE POLICY "Usuários podem gerenciar copy trading de suas contas"
    ON painelvm_copy_trading_config FOR ALL
    USING (EXISTS (
        SELECT 1 FROM painelvm_broker_accounts
        WHERE painelvm_broker_accounts.id = painelvm_copy_trading_config.master_account_id
        AND painelvm_broker_accounts.user_id = auth.uid()
    ));

-- 4. Adicionar colunas account_id, master_operation_id e is_copy_trade na tabela de relatórios
ALTER TABLE painelvm_strategy_reports ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES painelvm_broker_accounts(id) ON DELETE CASCADE;
ALTER TABLE painelvm_strategy_reports ADD COLUMN IF NOT EXISTS master_operation_id UUID REFERENCES painelvm_strategy_reports(id) ON DELETE SET NULL;
ALTER TABLE painelvm_strategy_reports ADD COLUMN IF NOT EXISTS is_copy_trade BOOLEAN DEFAULT false;
