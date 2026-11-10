-- ==============================================================================
-- VORTEX WEB — TABELA DE REGRAS DE COPY TRADING (NINJATRADER 8 & LOCAL)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.painelvm_copy_trading_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    master_account_id TEXT NOT NULL,
    slave_account_id TEXT NOT NULL,
    lot_multiplier NUMERIC DEFAULT 1.0,
    allowed_symbols TEXT DEFAULT 'TODOS',
    copy_manual_trades BOOLEAN DEFAULT true,
    copy_algo_trades BOOLEAN DEFAULT true,
    copy_atm_strategy BOOLEAN DEFAULT true,
    close_slaves_on_master_close BOOLEAN DEFAULT true,
    cancel_orphan_orders BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT painelvm_copy_trading_config_master_slave_unique UNIQUE (master_account_id, slave_account_id)
);

-- Garantir colunas caso a tabela já tenha sido criada em versão anterior
ALTER TABLE public.painelvm_copy_trading_config ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.painelvm_copy_trading_config ADD COLUMN IF NOT EXISTS allowed_symbols TEXT DEFAULT 'TODOS';
ALTER TABLE public.painelvm_copy_trading_config ADD COLUMN IF NOT EXISTS copy_manual_trades BOOLEAN DEFAULT true;
ALTER TABLE public.painelvm_copy_trading_config ADD COLUMN IF NOT EXISTS copy_algo_trades BOOLEAN DEFAULT true;
ALTER TABLE public.painelvm_copy_trading_config ADD COLUMN IF NOT EXISTS copy_atm_strategy BOOLEAN DEFAULT true;
ALTER TABLE public.painelvm_copy_trading_config ADD COLUMN IF NOT EXISTS close_slaves_on_master_close BOOLEAN DEFAULT true;
ALTER TABLE public.painelvm_copy_trading_config ADD COLUMN IF NOT EXISTS cancel_orphan_orders BOOLEAN DEFAULT false;
ALTER TABLE public.painelvm_copy_trading_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_copy_trading_user ON public.painelvm_copy_trading_config(user_id);
CREATE INDEX IF NOT EXISTS idx_copy_trading_master ON public.painelvm_copy_trading_config(master_account_id);
CREATE INDEX IF NOT EXISTS idx_copy_trading_slave ON public.painelvm_copy_trading_config(slave_account_id);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.painelvm_copy_trading_config ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS abrangentes
DROP POLICY IF EXISTS "Users can manage their own copy trading configs" ON public.painelvm_copy_trading_config;
CREATE POLICY "Users can manage their own copy trading configs"
ON public.painelvm_copy_trading_config
FOR ALL
USING (
    auth.uid() = user_id 
    OR user_id IS NULL
    OR EXISTS (
        SELECT 1 FROM painelvm_broker_accounts 
        WHERE (painelvm_broker_accounts.id::text = painelvm_copy_trading_config.master_account_id::text
               OR painelvm_broker_accounts.account_name = painelvm_copy_trading_config.master_account_id::text)
          AND painelvm_broker_accounts.user_id = auth.uid()
    )
)
WITH CHECK (
    auth.uid() = user_id 
    OR user_id IS NULL
    OR EXISTS (
        SELECT 1 FROM painelvm_broker_accounts 
        WHERE (painelvm_broker_accounts.id::text = painelvm_copy_trading_config.master_account_id::text
               OR painelvm_broker_accounts.account_name = painelvm_copy_trading_config.master_account_id::text)
          AND painelvm_broker_accounts.user_id = auth.uid()
    )
);
