-- Script SQL para criação das novas tabelas no Supabase (Prefixo painelvm_)
-- Execute este script no SQL Editor do seu console Supabase.

-- 1. Tabela de Sessões para Controle de Acesso Único
CREATE TABLE IF NOT EXISTS painelvm_users_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
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
    instance_id TEXT DEFAULT 'painel_principal' NOT NULL,
    name TEXT DEFAULT 'Painel Principal' NOT NULL,
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
    gemini_model TEXT DEFAULT 'gemini-1.5-flash' NOT NULL,
    openai_model TEXT DEFAULT 'gpt-4o-mini' NOT NULL,
    intervalo INT DEFAULT 30000 NOT NULL, -- Em milissegundos
    enviar_imagem_ia BOOLEAN DEFAULT true NOT NULL,
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
