-- ==============================================================================
-- Migração VortexWeb: Adicionar colunas BID, ASK e SPREAD à tabela market_data
-- Permite que os indicadores (NinjaTrader 8, MT4, MT5) gravem cotações de
-- Livro de Ofertas (Bid/Ask) diretamente na nuvem Supabase.
-- ==============================================================================

ALTER TABLE public.market_data 
  ADD COLUMN IF NOT EXISTS bid NUMERIC,
  ADD COLUMN IF NOT EXISTS ask NUMERIC,
  ADD COLUMN IF NOT EXISTS spread NUMERIC;

-- Índice para consultas rápidas com bid/ask
CREATE INDEX IF NOT EXISTS idx_market_data_instance_price 
  ON public.market_data (instance_id, updated_at DESC);

COMMENT ON COLUMN public.market_data.bid IS 'Melhor preço de compra (Bid) no instante da cotação';
COMMENT ON COLUMN public.market_data.ask IS 'Melhor preço de venda (Ask) no instante da cotação';
COMMENT ON COLUMN public.market_data.spread IS 'Diferença entre Ask e Bid (Ask - Bid)';
