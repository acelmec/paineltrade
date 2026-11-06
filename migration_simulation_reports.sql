-- Migration: Criar tabela separada para relatórios de simulação/backtesting
CREATE TABLE IF NOT EXISTS painelvm_simulation_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    simulation_id TEXT, -- ID único da rodada de simulação
    simulation_name TEXT, -- Nome/Descrição da rodada de simulação
    strategy_id TEXT,
    strategy_name TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('COMPRA', 'VENDA')),
    entry_price NUMERIC NOT NULL,
    stop_loss NUMERIC,
    take_profit NUMERIC,
    exit_price NUMERIC,
    status TEXT NOT NULL CHECK (status IN ('Gain', 'Stop', 'Em Andamento', 'Cancelado')),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    simulated_time TIMESTAMPTZ, -- Data/Hora exata do candle onde a ordem ocorreu
    closed_at TIMESTAMPTZ,
    instance_id TEXT,
    panel_id UUID REFERENCES painelvm_panels(id) ON DELETE CASCADE,
    contrato NUMERIC DEFAULT 1 NOT NULL
);

-- Ativar RLS
ALTER TABLE painelvm_simulation_reports ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para isolamento por usuário
CREATE POLICY "Usuários podem ver seus relatórios de simulação" 
    ON painelvm_simulation_reports FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem inserir seus relatórios de simulação" 
    ON painelvm_simulation_reports FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar seus relatórios de simulação" 
    ON painelvm_simulation_reports FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar seus relatórios de simulação" 
    ON painelvm_simulation_reports FOR DELETE 
    USING (auth.uid() = user_id);

-- Índices para buscas de alta performance
CREATE INDEX IF NOT EXISTS idx_simulation_reports_user_sim_id 
    ON painelvm_simulation_reports (user_id, simulation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_simulation_reports_simulated_time 
    ON painelvm_simulation_reports (simulated_time DESC);
