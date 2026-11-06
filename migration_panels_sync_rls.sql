-- MIGRATION: ATUALIZAÇÃO DE RLS PARA SINCRONIZAÇÃO DE PAINÉIS DO ADMIN
-- Execute este script no SQL Editor do console do seu Supabase para aplicar.

-- 1. Atualizar políticas para a tabela painelvm_panels
DROP POLICY IF EXISTS "Usuários podem ver seus próprios painéis" ON painelvm_panels;
DROP POLICY IF EXISTS "Usuários podem ver seus próprios painéis ou os do admin" ON painelvm_panels;

CREATE POLICY "Usuários podem ver seus próprios painéis ou os do admin" 
    ON painelvm_panels FOR SELECT 
    USING (auth.uid() = user_id OR subscription_id = 'admin');

-- 2. Atualizar políticas para a tabela painelvm_settings
DROP POLICY IF EXISTS "Usuários podem ver as configurações de seus painéis" ON painelvm_settings;
DROP POLICY IF EXISTS "Usuários podem ver as configurações de seus painéis ou do admin" ON painelvm_settings;

CREATE POLICY "Usuários podem ver as configurações de seus painéis ou do admin" 
    ON painelvm_settings FOR SELECT 
    USING (EXISTS (
        SELECT 1 FROM painelvm_panels 
        WHERE painelvm_panels.id = painelvm_settings.panel_id 
        AND (painelvm_panels.user_id = auth.uid() OR painelvm_panels.subscription_id = 'admin')
    ));
