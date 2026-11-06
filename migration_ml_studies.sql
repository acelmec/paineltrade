-- =========================================================================
-- VORTEX / AXION TRADESTATION — MACHINE LEARNING STUDIES & MODELS REGISTRY
-- Tabela para persistência permanente de estudos, remodelagens e métricas ML
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.painelvm_ml_studies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(30) NOT NULL,
    model_name VARCHAR(120) NOT NULL DEFAULT 'Axion Deep Learning Retest',
    model_type VARCHAR(60) NOT NULL DEFAULT 'tensorflow_patterns',
    last_run TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data_start VARCHAR(60),
    data_end VARCHAR(60),
    total_candles BIGINT DEFAULT 0,
    analyzed_samples INTEGER DEFAULT 0,
    test_samples INTEGER DEFAULT 0,
    tp_points NUMERIC DEFAULT 25.0,
    sl_points NUMERIC DEFAULT 12.0,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    active_features_count INTEGER DEFAULT 0,
    active_features JSONB NOT NULL DEFAULT '[]'::jsonb,
    test_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    top_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
    model_weights JSONB DEFAULT '{}'::jsonb,
    model_path TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    status VARCHAR(30) DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Garantir colunas se a tabela já existir previamente
ALTER TABLE public.painelvm_ml_studies ADD COLUMN IF NOT EXISTS tp_points NUMERIC DEFAULT 25.0;
ALTER TABLE public.painelvm_ml_studies ADD COLUMN IF NOT EXISTS sl_points NUMERIC DEFAULT 12.0;

-- Índices de alta performance
CREATE INDEX IF NOT EXISTS idx_painelvm_ml_studies_symbol ON public.painelvm_ml_studies(symbol);
CREATE INDEX IF NOT EXISTS idx_painelvm_ml_studies_active ON public.painelvm_ml_studies(is_active);
CREATE INDEX IF NOT EXISTS idx_painelvm_ml_studies_last_run ON public.painelvm_ml_studies(last_run DESC);

-- Trigger para atualização automática da coluna updated_at
CREATE OR REPLACE FUNCTION update_painelvm_ml_studies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_painelvm_ml_studies_updated_at ON public.painelvm_ml_studies;
CREATE TRIGGER trg_update_painelvm_ml_studies_updated_at
    BEFORE UPDATE ON public.painelvm_ml_studies
    FOR EACH ROW
    EXECUTE FUNCTION update_painelvm_ml_studies_updated_at();

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.painelvm_ml_studies ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso
DROP POLICY IF EXISTS "Permitir leitura pública de modelos ML" ON public.painelvm_ml_studies;
CREATE POLICY "Permitir leitura pública de modelos ML"
    ON public.painelvm_ml_studies
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Permitir inserção e atualização de modelos ML" ON public.painelvm_ml_studies;
CREATE POLICY "Permitir inserção e atualização de modelos ML"
    ON public.painelvm_ml_studies
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Seed / Registro Inicial com o Estudo Out-Of-Sample Treinado do NQ
INSERT INTO public.painelvm_ml_studies (
    symbol,
    model_name,
    model_type,
    last_run,
    data_start,
    data_end,
    total_candles,
    analyzed_samples,
    test_samples,
    metrics,
    active_features_count,
    active_features,
    test_config,
    top_patterns,
    is_active,
    status
) VALUES (
    'NQ',
    'Axion NQ Deep Learning Retest v1',
    'tensorflow_patterns',
    NOW(),
    '2026-09-11T06:53:00-03:00',
    '2026-10-07T15:10:00-03:00',
    25336,
    24534,
    3681,
    '{"accuracy": 66.4, "auc": 0.5091, "high_confidence_precision": 66.4, "baseline_winrate": 33.14}'::jsonb,
    41,
    '["body_ratio", "upper_wick_ratio", "lower_wick_ratio", "close_position", "direction", "return_1", "return_5", "return_15", "atr_14", "volatility_ratio", "range_zscore", "dist_sma9", "dist_ema21", "dist_ema50", "ma_trend", "ma_cross_bull", "ma_cross_bear", "hammer", "shooting_star", "bullish_engulfing", "bearish_engulfing", "doji", "wick_rejection_ema", "rsi_14", "rsi_delta", "rsi_oversold", "rsi_overbought", "macd_line", "macd_signal", "macd_hist", "macd_cross_bull", "macd_cross_bear", "dist_from_high", "dist_from_low", "near_session_high", "near_session_low", "volume_ratio", "volume_zscore", "volume_delta_ratio", "time_sin", "time_cos"]'::jsonb,
    '{"use_candle_patterns": true, "use_levels": true, "use_rsi": true, "use_atr": true, "use_macd": true, "use_moving_averages": true, "use_volume": true}'::jsonb,
    '[
      {"pattern": "RSI Sobrecomprado (>70)", "column": "rsi_overbought", "total_occurrences": 3237, "wins": 1221, "winrate": 37.7},
      {"pattern": "MACD Histograma Positivo", "column": "macd_cross_bull", "total_occurrences": 992, "wins": 361, "winrate": 36.4},
      {"pattern": "Estrela Cadente", "column": "shooting_star", "total_occurrences": 388, "wins": 141, "winrate": 36.3},
      {"pattern": "Engolfo de Baixa", "column": "bearish_engulfing", "total_occurrences": 1677, "wins": 605, "winrate": 36.1},
      {"pattern": "RSI Sobrevendido (<30)", "column": "rsi_oversold", "total_occurrences": 3190, "wins": 1142, "winrate": 35.8},
      {"pattern": "Martelo", "column": "hammer", "total_occurrences": 449, "wins": 158, "winrate": 35.2}
    ]'::jsonb,
    true,
    'success'
) ON CONFLICT DO NOTHING;
