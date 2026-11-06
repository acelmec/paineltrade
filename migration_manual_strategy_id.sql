-- Migration para alterar strategy_id para TEXT em painelvm_strategy_reports e adicionar manual_strategy_id na tabela painelvm_settings
ALTER TABLE painelvm_strategy_reports DROP CONSTRAINT IF EXISTS painelvm_strategy_reports_strategy_id_fkey;
ALTER TABLE painelvm_strategy_reports ALTER COLUMN strategy_id TYPE TEXT;

ALTER TABLE painelvm_settings ADD COLUMN IF NOT EXISTS manual_strategy_id TEXT;
