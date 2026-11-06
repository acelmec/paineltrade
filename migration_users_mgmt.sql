-- MIGRATION: GESTÃO DE USUÁRIOS E BLOQUEIO DE IP
-- Execute este script no SQL Editor do console do seu Supabase.

-- 1. Adicionar novas colunas na tabela de sessões para rastreamento
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE painelvm_users_sessions ADD COLUMN IF NOT EXISTS last_access TIMESTAMPTZ DEFAULT now();

-- 2. Atualizar as políticas de RLS de painelvm_users_sessions para permitir que o administrador veja e gerencie todas as sessões
DROP POLICY IF EXISTS "Permitir leitura de todas as sessões para admin" ON painelvm_users_sessions;
CREATE POLICY "Permitir leitura de todas as sessões para admin" 
    ON painelvm_users_sessions FOR SELECT 
    USING (auth.jwt() ->> 'email' = 'admin@vortex.com');

DROP POLICY IF EXISTS "Permitir gerenciamento total de sessões para admin" ON painelvm_users_sessions;
CREATE POLICY "Permitir gerenciamento total de sessões para admin" 
    ON painelvm_users_sessions FOR ALL 
    USING (auth.jwt() ->> 'email' = 'admin@vortex.com');

-- 3. Criar a tabela de IPs Bloqueados
CREATE TABLE IF NOT EXISTS painelvm_blocked_ips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS na tabela de IPs Bloqueados
ALTER TABLE painelvm_blocked_ips ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso para IPs Bloqueados
DROP POLICY IF EXISTS "Permitir leitura pública de IPs bloqueados" ON painelvm_blocked_ips;
CREATE POLICY "Permitir leitura pública de IPs bloqueados" 
    ON painelvm_blocked_ips FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Permitir gerenciamento de IPs bloqueados para admin" ON painelvm_blocked_ips;
CREATE POLICY "Permitir gerenciamento de IPs bloqueados para admin" 
    ON painelvm_blocked_ips FOR ALL 
    USING (auth.jwt() ->> 'email' = 'admin@vortex.com');
