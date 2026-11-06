-- ==============================================================================
-- SCRIPT DE ATUALIZAÇÃO DO SUPABASE: PERMISSÃO DE UPDATE E COLUNAS DE CONFIGURAÇÃO
-- Execute este script no SQL Editor do Supabase (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. Permissão de RLS para o UPDATE na tabela painelvm_settings (CRÍTICO)
DROP POLICY IF EXISTS "Usuários podem atualizar as configurações de seus painéis" ON painelvm_settings;

CREATE POLICY "Usuários podem atualizar as configurações de seus painéis" 
    ON painelvm_settings FOR UPDATE 
    USING (EXISTS (
        SELECT 1 FROM painelvm_panels 
        WHERE painelvm_panels.id = painelvm_settings.panel_id 
        AND painelvm_panels.user_id = auth.uid()
    ));

-- 2. Garantir a existência de todas as colunas de configurações
ALTER TABLE painelvm_settings ADD COLUMN IF NOT EXISTS disabled_levels TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE painelvm_settings ADD COLUMN IF NOT EXISTS forces_active_symbols TEXT[] DEFAULT ARRAY['nasdaq_impulso', 'sp505_impulso', 'vix_impulso', 'usdindex_impulso', 'nvidia_impulso', 'microsoft_impulso', 'apple_impulso', 'meta_impulso', 'amazon_impulso', 'alphabet_impulso', 'tesla_impulso'];
ALTER TABLE painelvm_settings ADD COLUMN IF NOT EXISTS general_prompt_enabled BOOLEAN DEFAULT false;
ALTER TABLE painelvm_settings ADD COLUMN IF NOT EXISTS general_prompt_frequency INT DEFAULT 15;
ALTER TABLE painelvm_settings ADD COLUMN IF NOT EXISTS general_prompt_start_time TEXT DEFAULT '09:00';
ALTER TABLE painelvm_settings ADD COLUMN IF NOT EXISTS general_prompt_end_time TEXT DEFAULT '18:00';
ALTER TABLE painelvm_settings ADD COLUMN IF NOT EXISTS general_prompt_template TEXT;
ALTER TABLE painelvm_settings ADD COLUMN IF NOT EXISTS general_prompt_telegram_send_image BOOLEAN DEFAULT true;
ALTER TABLE painelvm_settings ADD COLUMN IF NOT EXISTS general_prompt_telegram_enabled BOOLEAN DEFAULT true;
ALTER TABLE painelvm_settings ADD COLUMN IF NOT EXISTS general_prompt_days TEXT DEFAULT 'all';
