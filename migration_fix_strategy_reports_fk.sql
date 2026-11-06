-- Migration para remover restrição de Foreign Key rígida em painelvm_strategy_reports(strategy_id)
-- Isso permite que strategy_id armazene tanto IDs da tabela painelvm_prompts quanto da tabela painelvm_custom_strategies (Algoritmos)

ALTER TABLE painelvm_strategy_reports 
DROP CONSTRAINT IF EXISTS painelvm_strategy_reports_strategy_id_fkey;
