-- Migration para adicionar campos de gestão de risco USD em painelvm_settings
ALTER TABLE painelvm_settings ADD COLUMN IF NOT EXISTS chart_manual_sizing_mode TEXT DEFAULT 'lote';
ALTER TABLE painelvm_settings ADD COLUMN IF NOT EXISTS chart_manual_risk_usd NUMERIC DEFAULT 250;
