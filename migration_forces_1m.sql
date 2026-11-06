-- Migration: Tabela de Histórico Minuto a Minuto das Forças (Nasdaq Force 1m)
-- Permite comparar incrementos percentuais de força e cruzar viés de sentimentos candle a candle.

CREATE TABLE IF NOT EXISTS painelvm_forces_1m (
    idx BIGSERIAL PRIMARY KEY,
    instance_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    nasdaq_compra NUMERIC DEFAULT 0,
    nasdaq_venda NUMERIC DEFAULT 0,
    sp500_compra NUMERIC DEFAULT 0,
    sp500_venda NUMERIC DEFAULT 0,
    usdindex_compra NUMERIC DEFAULT 0,
    usdindex_venda NUMERIC DEFAULT 0,
    vix_compra NUMERIC DEFAULT 0,
    vix_venda NUMERIC DEFAULT 0,
    nvidia_compra NUMERIC DEFAULT 0,
    nvidia_venda NUMERIC DEFAULT 0,
    microsoft_compra NUMERIC DEFAULT 0,
    microsoft_venda NUMERIC DEFAULT 0,
    apple_compra NUMERIC DEFAULT 0,
    apple_venda NUMERIC DEFAULT 0,
    meta_compra NUMERIC DEFAULT 0,
    meta_venda NUMERIC DEFAULT 0,
    amazon_compra NUMERIC DEFAULT 0,
    amazon_venda NUMERIC DEFAULT 0,
    alphabet_compra NUMERIC DEFAULT 0,
    alphabet_venda NUMERIC DEFAULT 0,
    tesla_compra NUMERIC DEFAULT 0,
    tesla_venda NUMERIC DEFAULT 0,
    forca_final_compra NUMERIC DEFAULT 0,
    forca_final_venda NUMERIC DEFAULT 0,
    direcao INT DEFAULT 0,
    nasdaq_aberto BOOLEAN DEFAULT true,
    modo TEXT DEFAULT 'normal',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_painelvm_forces_1m UNIQUE (instance_id, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_painelvm_forces_1m_instance_timestamp 
ON painelvm_forces_1m (instance_id, timestamp DESC);
