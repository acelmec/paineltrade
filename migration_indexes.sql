-- Script de migração para criação de índices de banco de dados no Supabase
-- Execute este script no SQL Editor do console do seu Supabase para buscas e filtros instantâneos.

-- 1. Índice para a tabela market_data (utilizada nas consultas de preço em tempo real)
CREATE INDEX IF NOT EXISTS idx_market_data_instance_id_id 
ON market_data (instance_id, id DESC);

-- 2. Índice para a tabela painelvm_strategy_reports (filtrados por user_id ou subscription_id e ordenados por data)
CREATE INDEX IF NOT EXISTS idx_painelvm_strategy_reports_user_id_created 
ON painelvm_strategy_reports (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_painelvm_strategy_reports_sub_id_created 
ON painelvm_strategy_reports (subscription_id, created_at DESC);

-- 3. Índice para a tabela painelvm_candles_1m (caso não tenha sido criado pelo schema.sql)
CREATE INDEX IF NOT EXISTS idx_painelvm_candles_1m_instance_timestamp 
ON painelvm_candles_1m (instance_id, timestamp DESC);

-- 4. Notificar PostgREST para recarregar o cache de esquemas
NOTIFY pgrst, 'reload schema';
