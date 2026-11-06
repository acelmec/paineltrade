-- ==============================================================================
-- MIGRATION: CENTRAL DE COMUNICADOS (BROADCAST MESSAGES)
-- ==============================================================================
-- Execute este script no SQL Editor do Supabase para garantir permissões plenas de RLS.

-- 1. Cria a tabela caso não exista
CREATE TABLE IF NOT EXISTS public.broadcast_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID,
    subject TEXT NOT NULL,
    content TEXT NOT NULL,
    send_whatsapp BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Índices para performance
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_created_at ON public.broadcast_messages(created_at DESC);

-- 3. Habilita Row Level Security
ALTER TABLE public.broadcast_messages ENABLE ROW LEVEL SECURITY;

-- 4. Leitura pública (qualquer usuário autenticado ou visitante pode ler comunicados)
DROP POLICY IF EXISTS "Permitir leitura de comunicados" ON public.broadcast_messages;
CREATE POLICY "Permitir leitura de comunicados"
    ON public.broadcast_messages FOR SELECT
    USING (true);

-- 5. Inserção, Atualização e Exclusão liberada para administradores ou service_role
DROP POLICY IF EXISTS "Permitir gerenciamento total de comunicados para admin" ON public.broadcast_messages;
CREATE POLICY "Permitir gerenciamento total de comunicados para admin"
    ON public.broadcast_messages FOR ALL
    USING (
        auth.jwt() ->> 'email' = 'admin@vortex.com'
        OR auth.role() = 'service_role'
    )
    WITH CHECK (
        auth.jwt() ->> 'email' = 'admin@vortex.com'
        OR auth.role() = 'service_role'
    );
