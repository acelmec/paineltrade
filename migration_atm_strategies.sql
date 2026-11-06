-- Migration: Tabela de Estratégias ATM (NinjaTrader 8 Style) por Usuário
CREATE TABLE IF NOT EXISTS painelvm_atm_strategies (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brackets JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE painelvm_atm_strategies ENABLE ROW LEVEL SECURITY;

-- Policy de Leitura (Select)
CREATE POLICY "Permitir leitura de templates ATM do usuario"
  ON painelvm_atm_strategies FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

-- Policy de Inserção (Insert)
CREATE POLICY "Permitir criacao de templates ATM do usuario"
  ON painelvm_atm_strategies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy de Atualização (Update)
CREATE POLICY "Permitir edicao de templates ATM do usuario"
  ON painelvm_atm_strategies FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy de Exclusão (Delete)
CREATE POLICY "Permitir exclusao de templates ATM do usuario"
  ON painelvm_atm_strategies FOR DELETE
  USING (auth.uid() = user_id);
