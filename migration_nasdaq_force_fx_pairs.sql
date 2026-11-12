-- ==============================================================================
-- MIGRAÇÃO: Adicionar Colunas de Fluxo Cambial (EURJPY, EURUSD, USDJPY) em nasdaq_force
-- ==============================================================================

ALTER TABLE nasdaq_force ADD COLUMN IF NOT EXISTS eurjpy_compra NUMERIC DEFAULT 50;
ALTER TABLE nasdaq_force ADD COLUMN IF NOT EXISTS eurjpy_venda NUMERIC DEFAULT 50;

ALTER TABLE nasdaq_force ADD COLUMN IF NOT EXISTS eurusd_compra NUMERIC DEFAULT 50;
ALTER TABLE nasdaq_force ADD COLUMN IF NOT EXISTS eurusd_venda NUMERIC DEFAULT 50;

ALTER TABLE nasdaq_force ADD COLUMN IF NOT EXISTS usdjpy_compra NUMERIC DEFAULT 50;
ALTER TABLE nasdaq_force ADD COLUMN IF NOT EXISTS usdjpy_venda NUMERIC DEFAULT 50;
