-- Script SQL para criação das novas tabelas no Supabase (Prefixo painelvm_)
-- Execute este script no SQL Editor do seu console Supabase.

-- 1. Tabela de Sessões para Controle de Acesso Único
CREATE TABLE IF NOT EXISTS painelvm_users_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id TEXT NOT NULL UNIQUE,
    session_id TEXT NOT NULL,
    allow_telegram_news BOOLEAN DEFAULT false,
    allow_alerts BOOLEAN DEFAULT false,
    allow_operations BOOLEAN DEFAULT false,
    allow_share_strategies BOOLEAN DEFAULT false,
    allow_simulator BOOLEAN DEFAULT false,
    allow_panel_mode_2 BOOLEAN DEFAULT false,
    allow_copy_trading BOOLEAN DEFAULT false,
    max_strategies INTEGER DEFAULT 2,
    max_accounts INTEGER DEFAULT 5,
    email TEXT,
    ip_address TEXT,
    last_access TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE painelvm_users_sessions ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso para Sessões
CREATE POLICY "Permitir leitura da própria sessão" 
    ON painelvm_users_sessions FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Permitir inserção/atualização da própria sessão" 
    ON painelvm_users_sessions FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Permitir update da própria sessão" 
    ON painelvm_users_sessions FOR UPDATE 
    USING (auth.uid() = user_id);

-- 2. Tabela de Painéis
CREATE TABLE IF NOT EXISTS painelvm_panels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id TEXT,
    instance_id TEXT DEFAULT 'painel_principal' NOT NULL,
    name TEXT DEFAULT 'Painel Principal' NOT NULL,
    point_value NUMERIC DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE painelvm_panels ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso para Painéis
CREATE POLICY "Usuários podem ver seus próprios painéis" 
    ON painelvm_panels FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar seus próprios painéis" 
    ON painelvm_panels FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar seus próprios painéis" 
    ON painelvm_panels FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar seus próprios painéis" 
    ON painelvm_panels FOR DELETE 
    USING (auth.uid() = user_id);

-- 3. Tabela de Configurações do Painel
CREATE TABLE IF NOT EXISTS painelvm_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    panel_id UUID NOT NULL UNIQUE REFERENCES painelvm_panels(id) ON DELETE CASCADE,
    ai_provider TEXT DEFAULT 'groq' NOT NULL, -- 'groq' | 'gemini' | 'openai'
    groq_api_key TEXT,
    gemini_api_key TEXT,
    openai_api_key TEXT,
    groq_model TEXT DEFAULT 'meta-llama/llama-4-scout-17b-16e-instruct' NOT NULL,
    gemini_model TEXT DEFAULT 'gemini-2.0-flash' NOT NULL,
    openai_model TEXT DEFAULT 'gpt-4o-mini' NOT NULL,
    intervalo INT DEFAULT 30000 NOT NULL, -- Em milissegundos
    enviar_imagem_ia BOOLEAN DEFAULT true NOT NULL,
    ai_trigger_mode TEXT DEFAULT 'tempo' NOT NULL, -- 'tempo' | 'alerta'
    telegram_enabled BOOLEAN DEFAULT false NOT NULL,
    telegram_bot_token TEXT,
    telegram_chat_id TEXT,
    telegram_send_image BOOLEAN DEFAULT true NOT NULL,
    telegram_send_signal BOOLEAN DEFAULT true NOT NULL,
    gamma_symbol TEXT DEFAULT 'NQ' NOT NULL,
    instance_id_market TEXT DEFAULT 'nt8_main' NOT NULL,
    instance_id_force TEXT DEFAULT 'painel_principal' NOT NULL,
    instance_id_screen TEXT DEFAULT 'nt8_main' NOT NULL,
    source_market TEXT DEFAULT 'supabase' NOT NULL, -- 'local' | 'supabase'
    source_screen TEXT DEFAULT 'supabase' NOT NULL, -- 'local' | 'supabase'
    ai_system_prompt TEXT DEFAULT 'Você é um analista de trading de alta precisão (Vortex AI).
Analise o contexto do mercado abaixo e decida se há um sinal claro de COMPRA, VENDA, SAIR ou AGUARDANDO.

Você deve responder EXCLUSIVAMENTE em formato JSON puro, seguindo exatamente esta estrutura:
{
  "sinal": "COMPRA" | "VENDA" | "SAIR" | "AGUARDANDO",
  "confianca": "percentual de confiança, ex: 85%",
  "alvo": "preço alvo sugerido ou ''--''",
  "stop": "preço de stop loss sugerido ou ''--''",
  "resumo": "Explicação curta e lógica em português para a tomada de decisão baseada nos níveis de suporte/resistência, sentimento e delta de agressão.",
  "gatilho": "Gatilho técnico rápido que confirmou a entrada ou ''--''",
  "alerta": "Informação de alerta de risco relevante (ex: notícia iminente) ou ''--''"
}',
    alert_zscore_min NUMERIC DEFAULT -2.0,
    alert_zscore_max NUMERIC DEFAULT 2.0,
    alert_delta_min NUMERIC DEFAULT -10000,
    alert_delta_max NUMERIC DEFAULT 10000,
    alert_sound_enabled BOOLEAN DEFAULT true,
    alert_popup_enabled BOOLEAN DEFAULT true,
    telegram_only_signals BOOLEAN DEFAULT false,
    news_alert_before INT DEFAULT 10,
    news_alert_after INT DEFAULT 10,
    news_cooldown INT DEFAULT 30,
    news_telegram BOOLEAN DEFAULT false,
    news_sound BOOLEAN DEFAULT false,
    news_countries TEXT[] DEFAULT ARRAY['USD', 'EUR', 'GBP', 'JPY'],
    news_impact_high BOOLEAN DEFAULT true,
    news_impact_medium BOOLEAN DEFAULT false,
    news_impact_low BOOLEAN DEFAULT false,
    disabled_levels TEXT[] DEFAULT ARRAY[]::TEXT[],
    forces_active_symbols TEXT[] DEFAULT ARRAY['nasdaq_impulso', 'sp505_impulso', 'vix_impulso', 'usdindex_impulso', 'nvidia_impulso', 'microsoft_impulso', 'apple_impulso', 'meta_impulso', 'amazon_impulso', 'alphabet_impulso', 'tesla_impulso'],
    manual_strategy_id TEXT,
    chart_manual_sizing_mode TEXT DEFAULT 'lote',
    chart_manual_risk_usd NUMERIC DEFAULT 250,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE painelvm_settings ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso para Configurações (unidas via Relação com Painéis)
CREATE POLICY "Usuários podem ver as configurações de seus painéis" 
    ON painelvm_settings FOR SELECT 
    USING (EXISTS (
        SELECT 1 FROM painelvm_panels 
        WHERE painelvm_panels.id = painelvm_settings.panel_id 
        AND painelvm_panels.user_id = auth.uid()
    ));

CREATE POLICY "Usuários podem criar as configurações de seus painéis" 
    ON painelvm_settings FOR INSERT 
    WITH CHECK (EXISTS (
        SELECT 1 FROM painelvm_panels 
        WHERE painelvm_panels.id = painelvm_settings.panel_id 
        AND painelvm_panels.user_id = auth.uid()
    ));

CREATE POLICY "Usuários podem atualizar as configurações de seus painéis" 
    ON painelvm_settings FOR UPDATE 
    USING (EXISTS (
        SELECT 1 FROM painelvm_panels 
        WHERE painelvm_panels.id = painelvm_settings.panel_id 
        AND painelvm_panels.user_id = auth.uid()
    ));

-- 4. Tabela de Prompts e Estratégias IA
CREATE TABLE IF NOT EXISTS painelvm_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    panel_id UUID REFERENCES painelvm_panels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    confluences TEXT NOT NULL,
    trigger_entry TEXT NOT NULL,
    stop_loss_type TEXT DEFAULT 'points' NOT NULL, -- 'points' | 'regions'
    stop_loss_value TEXT NOT NULL,
    take_profit_type TEXT DEFAULT 'points' NOT NULL, -- 'points' | 'regions'
    take_profit_value TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Se a tabela já existir em bancos anteriores, adicionar a coluna panel_id:
ALTER TABLE painelvm_prompts ADD COLUMN IF NOT EXISTS panel_id UUID REFERENCES painelvm_panels(id) ON DELETE CASCADE;
ALTER TABLE painelvm_prompts ADD COLUMN IF NOT EXISTS prompt_type TEXT DEFAULT 'context_filter';
ALTER TABLE painelvm_prompts ADD COLUMN IF NOT EXISTS trigger_strategy_id TEXT;

ALTER TABLE painelvm_prompts ENABLE ROW LEVEL SECURITY;

-- Adicionar a coluna point_value na tabela de painéis se ainda não existir
ALTER TABLE painelvm_panels ADD COLUMN IF NOT EXISTS point_value NUMERIC DEFAULT 1.0;

-- Adicionar a coluna forces_active_symbols na tabela de configurações se ainda não existir
ALTER TABLE painelvm_settings ADD COLUMN IF NOT EXISTS forces_active_symbols TEXT[] DEFAULT ARRAY['nasdaq_impulso', 'sp505_impulso', 'vix_impulso', 'usdindex_impulso', 'nvidia_impulso', 'microsoft_impulso', 'apple_impulso', 'meta_impulso', 'amazon_impulso', 'alphabet_impulso', 'tesla_impulso'];


CREATE POLICY "Usuários podem ver seus próprios prompts ou prompts do sistema" 
    ON painelvm_prompts FOR SELECT 
    USING (is_admin = true OR auth.uid() = user_id);

CREATE POLICY "Usuários podem criar seus próprios prompts" 
    ON painelvm_prompts FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar seus próprios prompts" 
    ON painelvm_prompts FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar seus próprios prompts" 
    ON painelvm_prompts FOR DELETE 
    USING (auth.uid() = user_id);

-- Adicionar a coluna analyze_chart na tabela de prompts se ainda não existir
ALTER TABLE painelvm_prompts ADD COLUMN IF NOT EXISTS analyze_chart BOOLEAN DEFAULT true;

-- Adicionar a coluna instance_id na tabela de relatórios de estratégia se ainda não existir
ALTER TABLE painelvm_strategy_reports ADD COLUMN IF NOT EXISTS instance_id TEXT;

-- Remover colunas antigas/descontinuadas se existirem
ALTER TABLE painelvm_strategy_reports DROP COLUMN IF EXISTS id_painel;
ALTER TABLE painelvm_strategy_reports DROP COLUMN IF EXISTS id_instance;

-- Adicionar colunas para sessões restritas na tabela de sessões
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS restricted_session_id TEXT;
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS restricted_updated_at TIMESTAMPTZ;
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS allow_telegram_news BOOLEAN DEFAULT false;
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS allow_alerts BOOLEAN DEFAULT false;
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS allow_operations BOOLEAN DEFAULT false;
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS max_strategies INTEGER DEFAULT 2;
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS max_accounts INTEGER DEFAULT 5;
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS allow_share_strategies BOOLEAN DEFAULT false;
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS allow_simulator BOOLEAN DEFAULT false;
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS allow_panel_mode_2 BOOLEAN DEFAULT false;

-- Tabela para armazenar dados de candles históricos de 1 minuto
CREATE TABLE IF NOT EXISTS painelvm_candles_1m (
    idx BIGSERIAL PRIMARY KEY,
    instance_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    open NUMERIC NOT NULL,
    high NUMERIC NOT NULL,
    low NUMERIC NOT NULL,
    close NUMERIC NOT NULL,
    volume NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexar por instance_id e timestamp para buscas rápidas e ordenadas
CREATE INDEX IF NOT EXISTS idx_painelvm_candles_1m_instance_timestamp 
ON painelvm_candles_1m (instance_id, timestamp DESC);

-- Tabela para armazenar histórico minuto a minuto das forças dos ativos (Nasdaq Force 1m)
CREATE TABLE IF NOT EXISTS painelvm_forces_1m (
    idx BIGSERIAL PRIMARY KEY,
    instance_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    nasdaq_compra NUMERIC DEFAULT 0,
    nasdaq_venda NUMERIC DEFAULT 0,
    sp500_compra NUMERIC DEFAULT 0,
    sp500_venda NUMERIC DEFAULT 0,
    usdindex_compra NUMERIC DEFAULT 0,
    usdindex_venda NUMERIC DEFAULT 0,
    vix_compra NUMERIC DEFAULT 0,
    vix_venda NUMERIC DEFAULT 0,
    nvidia_compra NUMERIC DEFAULT 0,
    nvidia_venda NUMERIC DEFAULT 0,
    microsoft_compra NUMERIC DEFAULT 0,
    microsoft_venda NUMERIC DEFAULT 0,
    apple_compra NUMERIC DEFAULT 0,
    apple_venda NUMERIC DEFAULT 0,
    meta_compra NUMERIC DEFAULT 0,
    meta_venda NUMERIC DEFAULT 0,
    amazon_compra NUMERIC DEFAULT 0,
    amazon_venda NUMERIC DEFAULT 0,
    alphabet_compra NUMERIC DEFAULT 0,
    alphabet_venda NUMERIC DEFAULT 0,
    tesla_compra NUMERIC DEFAULT 0,
    tesla_venda NUMERIC DEFAULT 0,
    forca_final_compra NUMERIC DEFAULT 0,
    forca_final_venda NUMERIC DEFAULT 0,
    direcao INT DEFAULT 0,
    nasdaq_aberto BOOLEAN DEFAULT true,
    modo TEXT DEFAULT 'normal',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_painelvm_forces_1m UNIQUE (instance_id, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_painelvm_forces_1m_instance_timestamp 
ON painelvm_forces_1m (instance_id, timestamp DESC);

-- =========================================================================
-- 5. Tabela de Estudos e Remodelagens de Machine Learning (Axion ML Engine)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.painelvm_ml_studies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(30) NOT NULL,
    model_name VARCHAR(120) NOT NULL DEFAULT 'Axion Deep Learning Retest',
    model_type VARCHAR(60) NOT NULL DEFAULT 'tensorflow_patterns',
    last_run TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data_start VARCHAR(60),
    data_end VARCHAR(60),
    total_candles BIGINT DEFAULT 0,
    analyzed_samples INTEGER DEFAULT 0,
    test_samples INTEGER DEFAULT 0,
    tp_points NUMERIC DEFAULT 25.0,
    sl_points NUMERIC DEFAULT 12.0,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    active_features_count INTEGER DEFAULT 0,
    active_features JSONB NOT NULL DEFAULT '[]'::jsonb,
    test_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    top_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
    model_weights JSONB DEFAULT '{}'::jsonb,
    model_path TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    status VARCHAR(30) DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_painelvm_ml_studies_symbol ON public.painelvm_ml_studies(symbol);
CREATE INDEX IF NOT EXISTS idx_painelvm_ml_studies_active ON public.painelvm_ml_studies(is_active);
CREATE INDEX IF NOT EXISTS idx_painelvm_ml_studies_last_run ON public.painelvm_ml_studies(last_run DESC);

ALTER TABLE public.painelvm_ml_studies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura pública de modelos ML"
    ON public.painelvm_ml_studies FOR SELECT
    USING (true);

CREATE POLICY "Permitir inserção e atualização de modelos ML"
    ON public.painelvm_ml_studies FOR ALL
    USING (true)
    WITH CHECK (true);


