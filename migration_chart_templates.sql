-- MIGRATION: TABELA DE TEMPLATES GRÁFICOS DE INDICADORES (MODO 2)
-- Execute este script no SQL Editor do console do Supabase.

CREATE TABLE IF NOT EXISTS painelvm_chart_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    indicators JSONB NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS na tabela de templates gráficos
ALTER TABLE painelvm_chart_templates ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DROP POLICY IF EXISTS "Usuário pode ver seus próprios templates" ON painelvm_chart_templates;
CREATE POLICY "Usuário pode ver seus próprios templates"
    ON painelvm_chart_templates FOR SELECT
    USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'admin@vortex.com');

DROP POLICY IF EXISTS "Usuário pode gerenciar seus próprios templates" ON painelvm_chart_templates;
CREATE POLICY "Usuário pode gerenciar seus próprios templates"
    ON painelvm_chart_templates FOR ALL
    USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'admin@vortex.com');

-- Recarregar cache de schema
NOTIFY pgrst, 'reload schema';
