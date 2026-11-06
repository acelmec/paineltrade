-- Script de migração para corrigir o relógio de atualização do mercado (market_data)
-- Execute este script no SQL Editor do console do seu Supabase.

-- 1. Garantir que a coluna updated_at existe e tem o default now()
ALTER TABLE market_data ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Criar a função do trigger para definir updated_at = now() a cada UPDATE
CREATE OR REPLACE FUNCTION trigger_set_market_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Vincular o trigger à tabela market_data
DROP TRIGGER IF EXISTS trg_set_market_data_updated_at ON market_data;
CREATE TRIGGER trg_set_market_data_updated_at
BEFORE UPDATE ON market_data
FOR EACH ROW
EXECUTE FUNCTION trigger_set_market_data_updated_at();

-- 4. Atualizar as linhas existentes para que fiquem com o timestamp correto de agora
UPDATE market_data SET updated_at = now();

-- 5. Recarregar o cache de esquemas
NOTIFY pgrst, 'reload schema';
