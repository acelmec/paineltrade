-- ==============================================================================
-- MIGRAÇÃO: Transformar nasdaq_force em Tabela de Histórico Contínuo Minuto a Minuto
-- ==============================================================================

-- 1. Adicionar a coluna timestamp se ainda não existir
ALTER TABLE nasdaq_force ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ;

-- 2. Preencher registros legados que eventualmente estejam com timestamp nulo
UPDATE nasdaq_force 
SET timestamp = updated_at 
WHERE timestamp IS NULL AND updated_at IS NOT NULL;

-- Para quaisquer registros restantes sem data, atribui NOW()
UPDATE nasdaq_force 
SET timestamp = NOW() 
WHERE timestamp IS NULL;

-- 3. Tornar o timestamp NOT NULL e com default NOW()
ALTER TABLE nasdaq_force ALTER COLUMN timestamp SET DEFAULT NOW();
ALTER TABLE nasdaq_force ALTER COLUMN timestamp SET NOT NULL;

-- 4. Remover a restrição antiga que impedia múltiplos registros por instance_id
ALTER TABLE nasdaq_force DROP CONSTRAINT IF EXISTS nasdaq_force_instance_id_key;

-- 5. Criar chave única composta para permitir 1 registro por instância por minuto
ALTER TABLE nasdaq_force DROP CONSTRAINT IF EXISTS uq_nasdaq_force_instance_timestamp;
ALTER TABLE nasdaq_force ADD CONSTRAINT uq_nasdaq_force_instance_timestamp UNIQUE (instance_id, timestamp);

-- 6. Criar índice para busca de série temporal e aproximação rápida
CREATE INDEX IF NOT EXISTS idx_nasdaq_force_instance_timestamp 
ON nasdaq_force (instance_id, timestamp DESC);
