-- ==============================================================================
-- MIGRATION: CRIAÇÃO DE TABELAS DE PERFIS DE LAYOUT E TRAÇADOS GRÁFICOS
-- Execute este script no SQL Editor do Console Supabase
-- ==============================================================================

-- 1. TABELA DE PERFIS DE LAYOUT DOS CARDS (PAINEL 1)
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

DROP POLICY IF EXISTS "Usuários podem criar seus próprios perfis de layout" ON painelvm_user_profiles;
CREATE POLICY "Usuários podem criar seus próprios perfis de layout"
    ON painelvm_user_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'admin@vortex.com');

DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios perfis de layout" ON painelvm_user_profiles;
CREATE POLICY "Usuários podem atualizar seus próprios perfis de layout"
    ON painelvm_user_profiles FOR UPDATE
    USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'admin@vortex.com');

DROP POLICY IF EXISTS "Usuários podem deletar seus próprios perfis de layout" ON painelvm_user_profiles;
CREATE POLICY "Usuários podem deletar seus próprios perfis de layout"
    ON painelvm_user_profiles FOR DELETE
    USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'admin@vortex.com');


-- 2. TABELA DE TRAÇADOS E DESENHOS GRÁFICOS (PAINEL 2 / WORKSTATION / REPLAY)
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

-- Recarregar schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
