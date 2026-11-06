-- Migration para adicionar a coluna symbol e atualizar registros antigos na tabela painelvm_strategy_reports

-- 1. Adicionar a coluna symbol na tabela se ainda não existir
ALTER TABLE painelvm_strategy_reports ADD COLUMN IF NOT EXISTS symbol TEXT;

-- 2. Atualizar registros antigos com base na instância dos painéis conhecidos
UPDATE painelvm_strategy_reports 
SET symbol = 'MNQU6' 
WHERE instance_id = 'painel_principal' 
  AND (symbol IS NULL OR symbol = '');

UPDATE painelvm_strategy_reports 
SET symbol = 'MGCZ6' 
WHERE instance_id = 'painel_gold' 
  AND (symbol IS NULL OR symbol = '');

UPDATE painelvm_strategy_reports 
SET symbol = 'ETHUSD' 
WHERE instance_id = 'painel_ethusd' 
  AND (symbol IS NULL OR symbol = '');

-- 3. Atualizar quaisquer outros registros antigos vinculados pelo panel_id na tabela painelvm_panels
UPDATE painelvm_strategy_reports r
SET symbol = p.gamma_symbol
FROM painelvm_panels p
WHERE r.panel_id = p.id
  AND (r.symbol IS NULL OR r.symbol = '')
  AND p.gamma_symbol IS NOT NULL;

-- 4. Fallback para quaisquer relatórios legados remanescentes sem símbolo
UPDATE painelvm_strategy_reports 
SET symbol = 'MNQU6' 
WHERE (symbol IS NULL OR symbol = '');
