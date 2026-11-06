// Módulo de catálogo, metadados e formatação para Indicadores Parametrizáveis do Construtor de Algoritmos

export type AlgorithmIndicatorCategory = 
  | 'Tendência' 
  | 'Osciladores' 
  | 'Volatilidade' 
  | 'Volume' 
  | 'Níveis' 
  | 'SMC' 
  | 'Momentum & Sentimento' 
  | 'Notícias & Padrões' 
  | 'Preço & Vela';

export interface ParamSpec {
  key: string;
  label: string;
  type: 'number' | 'select' | 'string' | 'boolean';
  default: any;
  options?: { label: string; value: any }[];
  min?: number;
  max?: number;
  step?: number;
}

export interface AlgorithmIndicatorDef {
  id: string;
  name: string;
  category: AlgorithmIndicatorCategory;
  description?: string;
  isCategorical?: boolean;
  paramDefs?: ParamSpec[];
  subSeries?: { label: string; value: string }[];
}

export const ALGORITHM_INDICATOR_CATEGORIES: AlgorithmIndicatorCategory[] = [
  'Tendência',
  'Osciladores',
  'Volatilidade',
  'Volume',
  'Níveis',
  'SMC',
  'Momentum & Sentimento',
  'Notícias & Padrões',
  'Preço & Vela'
];

export const ALGORITHM_INDICATORS: AlgorithmIndicatorDef[] = [
  // --- TENDÊNCIA ---
  {
    id: 'SMA',
    name: 'Média Móvel Simples (SMA)',
    category: 'Tendência',
    description: 'Média aritmética simples dos preços.',
    paramDefs: [
      { key: 'period', label: 'Período', type: 'number', default: 20, min: 1, max: 500 },
      {
        key: 'source', label: 'Fonte', type: 'select', default: 'close', options: [
          { label: 'Fechamento', value: 'close' },
          { label: 'Abertura', value: 'open' },
          { label: 'Máxima', value: 'high' },
          { label: 'Mínima', value: 'low' },
          { label: 'HL/2', value: 'hl2' },
          { label: 'HLC/3', value: 'hlc3' }
        ]
      }
    ]
  },
  {
    id: 'EMA',
    name: 'Média Móvel Exponencial (EMA)',
    category: 'Tendência',
    description: 'Média exponencial com maior peso aos preços recentes.',
    paramDefs: [
      { key: 'period', label: 'Período', type: 'number', default: 21, min: 1, max: 500 },
      {
        key: 'source', label: 'Fonte', type: 'select', default: 'close', options: [
          { label: 'Fechamento', value: 'close' },
          { label: 'Abertura', value: 'open' },
          { label: 'Máxima', value: 'high' },
          { label: 'Mínima', value: 'low' },
          { label: 'HL/2', value: 'hl2' },
          { label: 'HLC/3', value: 'hlc3' }
        ]
      }
    ]
  },
  {
    id: 'TMA',
    name: 'Canal TMA (Não-Repintável)',
    category: 'Tendência',
    description: 'Média móvel triangular com envelope ATR.',
    subSeries: [
      { label: 'TMA Linha Central', value: 'main' },
      { label: 'TMA Banda Superior', value: 'upper' },
      { label: 'TMA Banda Inferior', value: 'lower' },
      { label: 'TMA Range do Canal (pontos)', value: 'range' }
    ],
    paramDefs: [
      { key: 'period', label: 'Período TMA', type: 'number', default: 20, min: 2, max: 200 },
      { key: 'atrMultiplier', label: 'Mult. ATR', type: 'number', default: 2.0, min: 0.1, max: 10, step: 0.1 }
    ]
  },
  {
    id: 'MA_CLOUD_FILTER',
    name: 'MA Cloud Filter (Nuvem de Médias Móveis)',
    category: 'Tendência',
    description: 'Filtro validador de tendência ou retorno à média (reversão) com controle de distâncias mín/máx e média AVG entre duas médias.',
    subSeries: [
      { label: 'Validação Geral do Filtro (aprovado / reprovado)', value: 'status' },
      { label: 'Direção Válida do Filtro (compra / venda / neutro)', value: 'direction' },
      { label: 'Apenas COMPRA Válida (compra / neutro)', value: 'buy_valid' },
      { label: 'Apenas VENDA Válida (venda / neutro)', value: 'sell_valid' },
      { label: 'Distância entre Médias (pontos)', value: 'cloud_diff' },
      { label: 'Média Rápida (Preço)', value: 'fast_ma' },
      { label: 'Média Lenta (Preço)', value: 'slow_ma' }
    ],
    paramDefs: [
      { key: 'fastPeriod', label: 'Período Média Rápida (SMA)', type: 'number', default: 8, min: 1, max: 200, step: 1 },
      { key: 'slowPeriod', label: 'Período Média Lenta (SMA)', type: 'number', default: 21, min: 2, max: 500, step: 1 },
      { key: 'minDistance', label: 'Distância Mínima entre Médias (Pts)', type: 'number', default: 0.0, min: 0.0, max: 500.0, step: 0.5 },
      { key: 'maxDistance', label: 'Distância Máxima entre Médias (Pts)', type: 'number', default: 100.0, min: 1.0, max: 2000.0, step: 0.5 },
      { key: 'reverseLogic', label: 'Reversão / Retorno à Média (ReverseLogic)', type: 'boolean', default: false },
      { key: 'useAutoAvg', label: 'Calcular Média da Distância (Auto AVG)', type: 'boolean', default: false },
      { key: 'barCount', label: 'Qtd Barras para Auto AVG', type: 'number', default: 5, min: 1, max: 50, step: 1 }
    ]
  },
  {
    id: 'Supertrend',
    name: 'Supertrend',
    category: 'Tendência',
    description: 'Indicador de tendência baseado no ATR com sinal de virada.',
    subSeries: [
      { label: 'Linha Supertrend', value: 'line' },
      { label: 'Tendência Atual (compra/venda)', value: 'trend' },
      { label: 'Sinal Virada COMPRA (Verde)', value: 'signal_buy' },
      { label: 'Sinal Virada VENDA (Vermelho)', value: 'signal_sell' }
    ],
    paramDefs: [
      { key: 'atrPeriod', label: 'Período ATR', type: 'number', default: 10, min: 1, max: 100 },
      { key: 'multiplier', label: 'Multiplicador', type: 'number', default: 3.0, min: 0.5, max: 10, step: 0.1 }
    ]
  },
  {
    id: 'AXION_TREND',
    name: '🔥 Axion Trend (Completo: Setas, Candles, Histograma e Conciliação)',
    category: 'Tendência',
    description: 'Sistema completo Axion Trend (RSM + MACDBB de Bolinhas + Squeeze + FST/RSI-IFT) com Sinais de Setas, Tendência dos Candles Coloridos e Tendência Conciliada com filtro de Nível Zero.',
    subSeries: [
      { label: '🏹 Sinais de Compra e Venda (Setas do Gráfico) [compra / venda / neutro]', value: 'signal_arrow' },
      { label: '🕯️ Tendência dos Candles Coloridos (Verde=compra / Vermelho=venda / Cinza=neutro)', value: 'candle_trend' },
      { label: '⚡ Tendência Conciliada (Candles + Média Bolinhas >0 Compra / <0 Venda) [compra / venda / neutro]', value: 'conciliated_trend' },
      { label: '🎯 Sinal Virada Conciliada (Início do Alinhamento) [compra / venda / neutro]', value: 'conciliated_signal' },
      { label: '🟢🔴 Média de Bolinhas do Histograma com Filtro Zero (>0 Compra / <0 Venda)', value: 'macdbb_zero_trend' },
      { label: '🎨 Cor da Média de Bolinhas (MACDBB: compra / venda / neutro)', value: 'macdbb_state' },
      { label: '📊 Linha Vertical Bull/Bear (Sinal de Transição)', value: 'bullbear_signal' },
      { label: '📈 Valor Numérico da Média de Bolinhas (MACDBB Line)', value: 'macdbb_line' },
      { label: '📊 Valor Numérico do Histograma (MACD Diff)', value: 'macd_diff' },
      { label: '📈 Banda Superior Bollinger do MACD (Upper)', value: 'bb_upper' },
      { label: '📉 Banda Inferior Bollinger do MACD (Lower)', value: 'bb_lower' },
      { label: '➖ Linha Central Bollinger do MACD (Midline)', value: 'bb_midline' }
    ],
    paramDefs: [
      { key: 'macdFastLength', label: 'MACD Período Rápido (Fast)', type: 'number', default: 12, min: 2, max: 100, step: 1 },
      { key: 'macdSlowLength', label: 'MACD Período Lento (Slow)', type: 'number', default: 26, min: 5, max: 200, step: 1 },
      { key: 'macdLength', label: 'MACD Sinal (Smooth)', type: 'number', default: 5, min: 1, max: 50, step: 1 },
      { key: 'macdBandLength', label: 'Período Bollinger do MACD', type: 'number', default: 15, min: 3, max: 100, step: 1 },
      { key: 'macdNumOfDev', label: 'Desvios Padrão Bollinger do MACD', type: 'number', default: 1.0, min: 0.2, max: 5.0, step: 0.1 },
      { key: 'squeezeLength', label: 'Período TTM Squeeze', type: 'number', default: 20, min: 5, max: 100, step: 1 },
      { key: 'fstLength', label: 'Período FST (Swing)', type: 'number', default: 38, min: 5, max: 200, step: 1 },
      { key: 'fstRetrace', label: 'Retração FST (%)', type: 'number', default: 25.0, min: 1.0, max: 90.0, step: 1.0 },
      { key: 'includeFST', label: 'Incluir Filtro FST nas Setas', type: 'boolean', default: true },
      { key: 'includeRSIIFT', label: 'Incluir Filtro RSI-IFT nas Setas', type: 'boolean', default: true }
    ]
  },
  {
    id: 'AXION_TREND_ARROWS',
    name: '🏹 Axion Trend: Sinais de Compra e Venda (Setas)',
    category: 'Tendência',
    description: 'Dispara COMPRA ou VENDA exatamente nas barras em que o indicador Axion Trend plota as setas de Compra (verde) ou Venda (vermelha) no gráfico.',
    isCategorical: true,
    paramDefs: [
      { key: 'macdFastLength', label: 'MACD Período Rápido (Fast)', type: 'number', default: 12, min: 2, max: 100, step: 1 },
      { key: 'macdSlowLength', label: 'MACD Período Lento (Slow)', type: 'number', default: 26, min: 5, max: 200, step: 1 },
      { key: 'macdLength', label: 'MACD Sinal (Smooth)', type: 'number', default: 5, min: 1, max: 50, step: 1 },
      { key: 'macdBandLength', label: 'Período Bollinger do MACD', type: 'number', default: 15, min: 3, max: 100, step: 1 },
      { key: 'macdNumOfDev', label: 'Desvios Padrão Bollinger do MACD', type: 'number', default: 1.0, min: 0.2, max: 5.0, step: 0.1 },
      { key: 'fstLength', label: 'Período FST (Swing)', type: 'number', default: 38, min: 5, max: 200, step: 1 },
      { key: 'fstRetrace', label: 'Retração FST (%)', type: 'number', default: 25.0, min: 1.0, max: 90.0, step: 1.0 },
      { key: 'includeFST', label: 'Incluir Filtro FST nas Setas', type: 'boolean', default: true },
      { key: 'includeRSIIFT', label: 'Incluir Filtro RSI-IFT nas Setas', type: 'boolean', default: true }
    ]
  },
  {
    id: 'AXION_TREND_CANDLES',
    name: '🕯️ Axion Trend: Tendência dos Candles (Verde / Vermelho)',
    category: 'Tendência',
    description: 'Identifica a tendência atual dos candles coloridos do Axion Trend: COMPRA quando o candle está Verde (RSM Buy), VENDA quando o candle está Vermelho (RSM Sell) e NEUTRO quando Cinza.',
    isCategorical: true,
    paramDefs: [
      { key: 'macdFastLength', label: 'MACD Período Rápido (Fast)', type: 'number', default: 12, min: 2, max: 100, step: 1 },
      { key: 'macdSlowLength', label: 'MACD Período Lento (Slow)', type: 'number', default: 26, min: 5, max: 200, step: 1 }
    ]
  },
  {
    id: 'AXION_TREND_CONCILIATED',
    name: '⚡ Axion Trend: Conciliação (Candles + Média Bolinhas >0 Compra / <0 Venda)',
    category: 'Tendência',
    description: 'Conciliação dos Candles Coloridos (Verdes/Vermelhos) com a Média de Bolinhas do Histograma (MACDBB): COMPRA quando Candle é Verde + Média de Bolinhas é Verde e está ACIMA do nível 0; VENDA quando Candle é Vermelho + Média de Bolinhas é Vermelha e está ABAIXO do nível 0.',
    isCategorical: true,
    subSeries: [
      { label: '⚡ Estado Contínuo da Tendência Conciliada (compra / venda / neutro)', value: 'conciliated_trend' },
      { label: '🎯 Sinal Apenas na Barra de Início da Conciliação (compra / venda / neutro)', value: 'conciliated_signal' }
    ],
    paramDefs: [
      { key: 'macdFastLength', label: 'MACD Período Rápido (Fast)', type: 'number', default: 12, min: 2, max: 100, step: 1 },
      { key: 'macdSlowLength', label: 'MACD Período Lento (Slow)', type: 'number', default: 26, min: 5, max: 200, step: 1 },
      { key: 'macdLength', label: 'MACD Sinal (Smooth)', type: 'number', default: 5, min: 1, max: 50, step: 1 },
      { key: 'macdBandLength', label: 'Período Bollinger do MACD', type: 'number', default: 15, min: 3, max: 100, step: 1 },
      { key: 'macdNumOfDev', label: 'Desvios Padrão Bollinger do MACD', type: 'number', default: 1.0, min: 0.2, max: 5.0, step: 0.1 }
    ]
  },

  // --- OSCILADORES ---
  {
    id: 'RSI',
    name: 'RSI / IFR',
    category: 'Osciladores',
    description: 'Índice de Força Relativa (0 a 100).',
    paramDefs: [
      { key: 'period', label: 'Período', type: 'number', default: 14, min: 2, max: 100 }
    ]
  },
  {
    id: 'MACD',
    name: 'MACD',
    category: 'Osciladores',
    description: 'Convergência e Divergência de Médias Móveis com detecção inteligente de divergências.',
    subSeries: [
      { label: 'MACD Histograma', value: 'histogram' },
      { label: 'MACD Linha', value: 'line' },
      { label: 'MACD Sinal', value: 'signal' },
      { label: 'Divergência de ALTA (Sinal Compra)', value: 'divergence_bullish' },
      { label: 'Divergência de BAIXA (Sinal Venda)', value: 'divergence_bearish' },
      { label: 'Divergência Qualquer (Direção compra/venda/neutro)', value: 'divergence_trend' }
    ],
    paramDefs: [
      { key: 'fastPeriod', label: 'EMA Rápida', type: 'number', default: 12, min: 1, max: 100 },
      { key: 'slowPeriod', label: 'EMA Lenta', type: 'number', default: 26, min: 2, max: 200 },
      { key: 'signalPeriod', label: 'Sinal', type: 'number', default: 9, min: 1, max: 50 },
      {
        key: 'divergenceMode',
        label: 'Modo de Cálculo de Divergência',
        type: 'select',
        default: 'swing_pivots',
        options: [
          { label: '🎯 Pivôs de Swing & Contração (Clássico / TradingView)', value: 'swing_pivots' },
          { label: '🌊 Ondas por Cruzamento de Zero (Macro / Estrutural)', value: 'zero_cross' }
        ]
      },
      { key: 'divergenceMinBars', label: 'Distância Mínima de Barras', type: 'number', default: 5, min: 3, max: 30 },
      { key: 'divergenceLookback', label: 'Lookback Máximo (Barras)', type: 'number', default: 60, min: 10, max: 120 }
    ]
  },
  {
    id: 'EMACD',
    name: 'e-MACD (Impulso Institucional)',
    category: 'Osciladores',
    description: 'Indicador de explosão de volatilidade e zonas mortas.',
    subSeries: [
      { label: 'e-MACD Histograma Geral (+/-)', value: 'histogram' },
      { label: 'e-MACD Histograma COMPRA', value: 'histogram_compra' },
      { label: 'e-MACD Histograma VENDA', value: 'histogram_venda' },
      { label: 'e-MACD Tamanho Absoluto', value: 'histogram_abs' },
      { label: 'e-MACD Linha de Explosão', value: 'explosion' },
      { label: 'e-MACD Dead Zone (Volume)', value: 'deadzone' },
      { label: 'e-MACD Tendência (compra/venda/neutro)', value: 'trend' }
    ],
    paramDefs: [
      { key: 'fastPeriod', label: 'Rápida', type: 'number', default: 12, min: 1, max: 100 },
      { key: 'slowPeriod', label: 'Lenta', type: 'number', default: 26, min: 2, max: 200 },
      { key: 'signalPeriod', label: 'Sinal', type: 'number', default: 9, min: 1, max: 50 }
    ]
  },

  // --- VOLATILIDADE ---
  {
    id: 'Bollinger',
    name: 'Bandas de Bollinger',
    category: 'Volatilidade',
    description: 'Envelopes de desvio padrão em torno de uma média.',
    subSeries: [
      { label: 'Banda Superior', value: 'upper' },
      { label: 'Linha Central (SMA)', value: 'middle' },
      { label: 'Banda Inferior', value: 'lower' }
    ],
    paramDefs: [
      { key: 'period', label: 'Período', type: 'number', default: 20, min: 2, max: 200 },
      { key: 'stdDev', label: 'Desvio Padrão', type: 'number', default: 2.0, min: 0.5, max: 5, step: 0.1 }
    ]
  },
  {
    id: 'atrRatio',
    name: 'ATR Ratio',
    category: 'Volatilidade',
    description: 'Razão da amplitude média real (volatilidade relativa).'
  },
  {
    id: 'zScore',
    name: 'Z-Score',
    category: 'Volatilidade',
    description: 'Desvio padronizado do preço atual em relação à média.'
  },
  {
    id: 'TIME_HEATMAP',
    name: 'Time Heatmap',
    category: 'Volatilidade',
    description: 'Pontuação de calor intradiária (0 a 100) baseada no histórico de volatilidade e volume do horário.',
    subSeries: [
      { label: 'Score Térmico (0 a 100)', value: 'score' },
      { label: 'Status da Zona (quente/neutro/frio)', value: 'status' }
    ],
    paramDefs: [
      { key: 'lookbackDays', label: 'Dias de Histórico', type: 'number', default: 10, min: 1, max: 60 },
      {
        key: 'scope',
        label: 'Escopo',
        type: 'select',
        default: 'custom_window',
        options: [
          { label: 'Faixa Específica', value: 'custom_window' },
          { label: 'Toda a Sessão', value: 'all_session' }
        ]
      },
      { key: 'startTime', label: 'Início (HH:MM)', type: 'string', default: '09:30' },
      { key: 'endTime', label: 'Fim (HH:MM)', type: 'string', default: '12:30' },
      {
        key: 'heatMode',
        label: 'Modo',
        type: 'select',
        default: 'trend_volume',
        options: [
          { label: 'Volume de Tendência', value: 'trend_volume' },
          { label: 'Volatilidade de Range', value: 'volatility_range' },
          { label: 'Volume Relativo', value: 'relative_volume' }
        ]
      },
      { key: 'hotThreshold', label: 'Gatilho Zona Quente (Score)', type: 'number', default: 70, min: 40, max: 95 },
      { key: 'showGhostCandles', label: 'Velas Fantasma no Gráfico', type: 'boolean', default: true },
      { key: 'forecastCandlesCount', label: 'Qtd. Velas de Projeção', type: 'number', default: 5, min: 1, max: 100 },
      { key: 'showForecastBadge', label: 'Badge de Probabilidade ao Lado do Preço', type: 'boolean', default: true },
      { key: 'showExpansionCorridor', label: 'Corredor de Volatilidade', type: 'boolean', default: true }
    ]
  },

  // --- VOLUME ---
  {
    id: 'VWAP',
    name: 'VWAP Diária',
    category: 'Volume',
    description: 'Preço Médio Ponderado por Volume.',
    paramDefs: [
      {
        key: 'resetMode', label: 'Reinício de Sessão', type: 'select', default: 'session_1800', options: [
          { label: 'Global (18:00 EST / 19:00 BRT)', value: 'session_1800' },
          { label: 'RTH Nova York (09:30 EST)', value: 'session_0930' },
          { label: 'Dia UTC (00:00)', value: 'daily_utc' }
        ]
      }
    ]
  },
  {
    id: 'pva',
    name: 'PVA Clímax (Volume Anômalo)',
    category: 'Volume',
    isCategorical: true,
    description: 'Volume institucional anômalo (compra/venda/neutro).'
  },
  {
    id: 'buyVolume',
    name: 'Volume de Compra',
    category: 'Volume',
    description: 'Volume agressivo de compra.'
  },
  {
    id: 'sellVolume',
    name: 'Volume de Venda',
    category: 'Volume',
    description: 'Volume agressivo de venda.'
  },
  {
    id: 'delta',
    name: 'Delta Absoluto',
    category: 'Volume',
    description: 'Diferença entre volume comprador e vendedor.'
  },
  {
    id: 'deltaRatio',
    name: 'Delta Ratio',
    category: 'Volume',
    description: 'Razão do delta em relação ao volume total.'
  },
  {
    id: 'blocktrades_side',
    name: 'Último Block Trade (Direção)',
    category: 'Volume',
    isCategorical: true,
    description: 'Direção do último grande lote (compra/venda/neutro).'
  },
  {
    id: 'blockTrades_volume',
    name: 'Último Block Trade (Volume)',
    category: 'Volume',
    description: 'Tamanho em contratos do último block trade.'
  },
  {
    id: 'VOLUME_LEVELS',
    name: 'Níveis de Volume Institucional (VPOC / VAH / VAL / Naked POCs)',
    category: 'Volume',
    description: 'Volume Profile com VPOC, VAH, VAL e POCs Virgens / Não Tocadas (Naked POCs).',
    subSeries: [
      { label: '⚡ TODOS os Níveis de Volume (Mais Próximo: VPOC, Naked POCs, VAH, VAL)', value: 'all' },
      { label: 'VPOC (Point of Control - Maior Volume)', value: 'poc' },
      { label: '⚡ TODAS as VPOC Não Tocadas / Naked POCs (Mais Próxima)', value: 'all_naked_pocs' },
      { label: 'VPOC Não Tocada #1 (Naked POC Mais Recente)', value: 'naked_poc1' },
      { label: 'VPOC Não Tocada #2 (Naked POC 2)', value: 'naked_poc2' },
      { label: 'VPOC Não Tocada #3 (Naked POC 3)', value: 'naked_poc3' },
      { label: 'VAH (Value Area High - Topo 70%)', value: 'vah' },
      { label: 'VAL (Value Area Low - Fundo 70%)', value: 'val' },
      { label: 'Distância até VPOC (Pontos)', value: 'dist_poc' },
      { label: 'Distância até VPOC Não Tocada Mais Próxima (Pontos)', value: 'dist_naked_poc' },
      { label: 'Distância até VAH (Pontos)', value: 'dist_vah' },
      { label: 'Distância até VAL (Pontos)', value: 'dist_val' }
    ],
    paramDefs: [
      {
        key: 'sessionMode',
        label: 'Modo de Análise',
        type: 'select',
        default: 'all',
        options: [
          { label: 'Toda a Sessão (24h)', value: 'all' },
          { label: 'Horário Personalizado (HH:MM)', value: 'custom' },
          { label: 'Últimas X Velas (Timeframe Atual)', value: 'bars' }
        ]
      },
      { key: 'lookbackBars', label: 'Quantidade de Velas (Timeframe Atual)', type: 'number', default: 30, min: 3, max: 500, step: 1 },
      { key: 'customStart', label: 'Horário Início (HH:MM)', type: 'string', default: '09:00' },
      { key: 'customEnd', label: 'Horário Fim (HH:MM)', type: 'string', default: '18:00' },
      { key: 'lookbackDays', label: 'Dias de Histórico (Lookback)', type: 'number', default: 1, min: 1, max: 5 },
      { key: 'valueAreaPct', label: 'Percentual Value Area (%)', type: 'number', default: 70, min: 50, max: 90, step: 5 }
    ]
  },
  {
    id: 'VOLUME_HVN_BLOCKS',
    name: 'Blocos de Absorção & HVN (High Volume Nodes)',
    category: 'Volume',
    description: 'Zonas e caixas de absorção institucional identificadas por nós de alto volume (HVN).',
    subSeries: [
      { label: '⚡ TODOS os Blocos HVN (Mais Próximo)', value: 'all' },
      { label: 'Bloco HVN #1 - Centro (Maior Volume)', value: 'hvn1' },
      { label: 'Bloco HVN #1 - Topo (Teto de Absorção)', value: 'hvn1_top' },
      { label: 'Bloco HVN #1 - Fundo (Piso de Absorção)', value: 'hvn1_bottom' },
      { label: 'Bloco HVN #2 - Centro', value: 'hvn2' },
      { label: 'Bloco HVN #2 - Topo (Teto)', value: 'hvn2_top' },
      { label: 'Bloco HVN #2 - Fundo (Piso)', value: 'hvn2_bottom' },
      { label: 'Bloco HVN #3 - Centro', value: 'hvn3' },
      { label: 'Bloco HVN #3 - Topo (Teto)', value: 'hvn3_top' },
      { label: 'Bloco HVN #3 - Fundo (Piso)', value: 'hvn3_bottom' },
      { label: 'Bloco HVN #4 - Centro', value: 'hvn4' },
      { label: 'Bloco HVN #4 - Topo (Teto)', value: 'hvn4_top' },
      { label: 'Bloco HVN #4 - Fundo (Piso)', value: 'hvn4_bottom' },
      { label: 'Bloco HVN #5 - Centro', value: 'hvn5' },
      { label: 'Bloco HVN #5 - Topo (Teto)', value: 'hvn5_top' },
      { label: 'Bloco HVN #5 - Fundo (Piso)', value: 'hvn5_bottom' },
      { label: 'Bloco HVN #6 - Centro', value: 'hvn6' },
      { label: 'Bloco HVN #6 - Topo (Teto)', value: 'hvn6_top' },
      { label: 'Bloco HVN #6 - Fundo (Piso)', value: 'hvn6_bottom' },
      { label: 'Distância até Bloco HVN Mais Próximo (Pontos)', value: 'dist_nearest' },
      { label: 'Preço Dentro de Qualquer Bloco HVN (sim / nao)', value: 'inside_any' }
    ],
    paramDefs: [
      { key: 'topNodesCount', label: 'Qtd de Blocos (Top Nodes)', type: 'number', default: 3, min: 1, max: 6, step: 1 },
      { key: 'blockThicknessPct', label: 'Espessura do Bloco (%)', type: 'number', default: 0.5, min: 0.1, max: 2.0, step: 0.1 },
      {
        key: 'sessionMode',
        label: 'Modo de Análise',
        type: 'select',
        default: 'all',
        options: [
          { label: 'Toda a Sessão (24h)', value: 'all' },
          { label: 'Horário Personalizado (HH:MM)', value: 'custom' },
          { label: 'Últimas X Velas (Timeframe Atual)', value: 'bars' }
        ]
      },
      { key: 'lookbackBars', label: 'Quantidade de Velas (Timeframe Atual)', type: 'number', default: 30, min: 3, max: 500, step: 1 },
      { key: 'customStart', label: 'Horário Início (HH:MM)', type: 'string', default: '09:00' },
      { key: 'customEnd', label: 'Horário Fim (HH:MM)', type: 'string', default: '18:00' },
      { key: 'lookbackDays', label: 'Dias de Histórico (Lookback)', type: 'number', default: 1, min: 1, max: 5 }
    ]
  },
  {
    id: 'VOLUME_SPIKE_PIVOTS',
    name: 'Volume Spike Pivots',
    category: 'Volume',
    description: 'Pivôs de máxima e mínima formados com picos anômalos de volume e níveis horizontais de compra (suporte) e venda (resistência).',
    subSeries: [
      { label: 'Nível de Compra Mais Próximo (Suporte Ativo)', value: 'nearest_buy_level' },
      { label: 'Nível de Venda Mais Próximo (Resistência Ativa)', value: 'nearest_sell_level' },
      { label: 'Nível de Compra Mais Recente (Último Fundo Spike)', value: 'recent_buy_level' },
      { label: 'Nível de Venda Mais Recente (Último Topo Spike)', value: 'recent_sell_level' },
      { label: 'Distância até Nível de Compra (Pontos)', value: 'dist_buy_level' },
      { label: 'Distância até Nível de Venda (Pontos)', value: 'dist_sell_level' },
      { label: 'Qtd Níveis de Compra Ativos Abaixo do Preço', value: 'active_buy_count' },
      { label: 'Qtd Níveis de Venda Ativos Acima do Preço', value: 'active_sell_count' },
      { label: 'Status de Spike na Vela (compra / venda / neutro)', value: 'spike_status' },
      { label: 'Toque em Nível de Compra (sim / nao)', value: 'touch_buy' },
      { label: 'Toque em Nível de Venda (sim / nao)', value: 'touch_sell' }
    ],
    paramDefs: [
      { key: 'barsToCheck', label: 'Janela de Barras (Bars to Check)', type: 'number', default: 5, min: 3, max: 50, step: 1 },
      { key: 'volumeAveragePeriod', label: 'Período Média Volume (SMA)', type: 'number', default: 20, min: 1, max: 200, step: 1 },
      { key: 'volumeMultiple', label: 'Multiplicador de Volume', type: 'number', default: 1.5, min: 1.0, max: 10.0, step: 0.1 }
    ]
  },

  // --- NÍVEIS ---
  {
    id: 'LEVELS_GAMMA',
    name: 'Níveis 1: Gamma & Volatilidade',
    category: 'Níveis',
    description: 'Pivots centrais de volatilidade, transição de regime e Gamma Wall (HVL, GWall, HVL0).',
    subSeries: [
      { label: '⚡ TODOS os Níveis Gamma (Mais Próximo)', value: 'all' },
      { label: 'HVL (Pivot Gamma)', value: 'hvl' },
      { label: 'GWall (Gamma Wall)', value: 'gwall' },
      { label: 'HVL0 (HVL Strike 0)', value: 'hvl0' }
    ],
    paramDefs: [
      { key: 'showHvl', label: 'Exibir HVL (Pivot Gamma)', type: 'boolean', default: true },
      { key: 'showGwall', label: 'Exibir GWall (Gamma Wall)', type: 'boolean', default: true },
      { key: 'showHvl0', label: 'Exibir HVL0 (Strike 0)', type: 'boolean', default: true }
    ]
  },
  {
    id: 'LEVELS_OPTIONS',
    name: 'Níveis 2: Barreiras de Opções',
    category: 'Níveis',
    description: 'Zonas de concentração de Opções (Call Wall, Put Wall, Call0, Put0).',
    subSeries: [
      { label: '⚡ TODOS os Níveis de Opções (Mais Próximo)', value: 'all' },
      { label: 'Call Wall Principal', value: 'call' },
      { label: 'Put Wall Principal', value: 'put' },
      { label: 'Call0 Intradiária', value: 'call0' },
      { label: 'Put0 Intradiária', value: 'put0' }
    ],
    paramDefs: [
      { key: 'showCall', label: 'Exibir Call Wall', type: 'boolean', default: true },
      { key: 'showPut', label: 'Exibir Put Wall', type: 'boolean', default: true },
      { key: 'showCall0', label: 'Exibir Call0', type: 'boolean', default: true },
      { key: 'showPut0', label: 'Exibir Put0', type: 'boolean', default: true }
    ]
  },
  {
    id: 'LEVELS_DAILY',
    name: 'Níveis 3: Pregão & Referências Diárias',
    category: 'Níveis',
    description: 'Projeções diárias, preço de ajuste e extremas anteriores (Max, Min, Ajuste, MxAnt, MnAnt).',
    subSeries: [
      { label: '⚡ TODOS os Níveis Diários (Mais Próximo)', value: 'all' },
      { label: 'Máxima Projetada (Max)', value: 'max1d' },
      { label: 'Mínima Projetada (Min)', value: 'min1d' },
      { label: 'Ajuste / Fechamento Anterior', value: 'prev' },
      { label: 'Máxima Anterior (MxAnt)', value: 'prevH' },
      { label: 'Mínima Anterior (MnAnt)', value: 'prevL' }
    ],
    paramDefs: [
      { key: 'showMax1d', label: 'Exibir Máxima Projetada', type: 'boolean', default: true },
      { key: 'showMin1d', label: 'Exibir Mínima Projetada', type: 'boolean', default: true },
      { key: 'showPrev', label: 'Exibir Ajuste / Fechamento', type: 'boolean', default: true },
      { key: 'showPrevH', label: 'Exibir Máxima Anterior', type: 'boolean', default: true },
      { key: 'showPrevL', label: 'Exibir Mínima Anterior', type: 'boolean', default: true }
    ]
  },
  {
    id: 'GammaLevels',
    name: 'Níveis Gamma Completos (Todos os Níveis Somados)',
    category: 'Níveis',
    description: 'Avaliação combinada de todos os níveis institucionais (HVL, GWall, Call, Put, Max, Min, Ajuste, MxAnt, MnAnt).',
    subSeries: [
      { label: '⚡ TODOS os Níveis Somados (Mais Próximo)', value: 'all' },
      { label: 'HVL (Pivot Gamma)', value: 'hvl' },
      { label: 'GWall (Gamma Wall)', value: 'gwall' },
      { label: 'HVL0 (HVL Strike 0)', value: 'hvl0' },
      { label: 'Call Wall Principal', value: 'call' },
      { label: 'Put Wall Principal', value: 'put' },
      { label: 'Call0 Intradiária', value: 'call0' },
      { label: 'Put0 Intradiária', value: 'put0' },
      { label: 'Máxima Projetada (Max)', value: 'max1d' },
      { label: 'Mínima Projetada (Min)', value: 'min1d' },
      { label: 'Ajuste / Fechamento Anterior', value: 'prev' },
      { label: 'Máxima Anterior (MxAnt)', value: 'prevH' },
      { label: 'Mínima Anterior (MnAnt)', value: 'prevL' }
    ]
  },
  {
    id: 'LEVELS_LIQUIDITY',
    name: 'Níveis 4: Liquidez & Exposição (BL / GEX)',
    category: 'Níveis',
    description: 'Níveis de liquidez compradora (BL1..BL5) e exposição Gamma (GEX1..GEX3).',
    subSeries: [
      { label: '⚡ TODOS os Níveis BL & GEX (Mais Próximo)', value: 'all' },
      { label: '⚡ TODOS os Níveis BL (Compra 1..5 - Mais Próximo)', value: 'all_bl' },
      { label: '⚡ TODOS os Níveis GEX (Exposição 1..3 - Mais Próximo)', value: 'all_gex' },
      { label: 'BL 1 (Compra 1)', value: 'bl1' },
      { label: 'BL 2 (Compra 2)', value: 'bl2' },
      { label: 'BL 3 (Compra 3)', value: 'bl3' },
      { label: 'BL 4 (Compra 4)', value: 'bl4' },
      { label: 'BL 5 (Compra 5)', value: 'bl5' },
      { label: 'GEX 1 (Gamma Exposição 1)', value: 'gex1' },
      { label: 'GEX 2 (Gamma Exposição 2)', value: 'gex2' },
      { label: 'GEX 3 (Gamma Exposição 3)', value: 'gex3' }
    ],
    paramDefs: [
      { key: 'showBl', label: 'Exibir Grupo BL', type: 'boolean', default: true },
      { key: 'showGex', label: 'Exibir Grupo GEX', type: 'boolean', default: true }
    ]
  },
  {
    id: 'LEVELS_SESSION_PERCENT',
    name: 'Níveis 5: Percentuais de Abertura da Sessão',
    category: 'Níveis',
    description: 'Linhas percentuais projetadas a partir do preço de abertura.',
    subSeries: [
      { label: '⚡ TODOS os Níveis Percentuais (Mais Próximo)', value: 'all' },
      { label: 'Abertura da Sessão (0.0%)', value: 'center' },
      { label: 'Alta +1 (+1x Passo)', value: 'upper1' },
      { label: 'Alta +2 (+2x Passo)', value: 'upper2' },
      { label: 'Alta +3 (+3x Passo)', value: 'upper3' },
      { label: 'Baixa -1 (-1x Passo)', value: 'lower1' },
      { label: 'Baixa -2 (-2x Passo)', value: 'lower2' },
      { label: 'Baixa -3 (-3x Passo)', value: 'lower3' }
    ],
    paramDefs: [
      { key: 'sessionStart', label: 'Horário Abertura (HH:MM)', type: 'string', default: '09:00' },
      { key: 'stepPercent', label: 'Passo Percentual (%)', type: 'number', default: 0.5, min: 0.05, max: 20, step: 0.05 },
      { key: 'showCenter', label: 'Exibir Linha Central (0.0%)', type: 'boolean', default: true }
    ]
  },
  {
    id: 'LEVELS_TIME_RANGE',
    name: 'Níveis 6: Faixa de Horário',
    category: 'Níveis',
    description: 'Projeção de Máxima, Mínima e 50% formados na janela de horário.',
    subSeries: [
      { label: '⚡ TODOS os Níveis do Range (Mais Próximo)', value: 'all' },
      { label: 'Máxima do Range', value: 'high' },
      { label: 'Ponto Médio (50%)', value: 'mid' },
      { label: 'Mínima do Range', value: 'low' }
    ],
    paramDefs: [
      {
        key: 'sessionMode',
        label: 'Modo de Horário',
        type: 'select',
        default: 'custom',
        options: [
          { label: 'Personalizar Horário (HH:MM)', value: 'custom' },
          { label: 'Toda a Sessão (Sessão Operacional do Sistema)', value: 'all' }
        ]
      },
      {
        key: 'useFullSession',
        label: 'Marcar Toda a Sessão (19h às 18h)',
        type: 'boolean',
        default: false
      },
      { key: 'startTime', label: 'Horário Inicial (HH:MM)', type: 'string', default: '09:00' },
      { key: 'endTime', label: 'Horário Final (HH:MM)', type: 'string', default: '09:30' },
      { key: 'sessionEnd', label: 'Desarme Sessão (HH:MM)', type: 'string', default: '18:00' },
      { key: 'showHigh', label: 'Exibir Máxima do Período', type: 'boolean', default: true },
      { key: 'showLow', label: 'Exibir Mínima do Período', type: 'boolean', default: true },
      { key: 'showMid', label: 'Exibir Ponto Médio (50%)', type: 'boolean', default: true }
    ]
  },
  {
    id: 'nearest_resistance',
    name: 'Resistência Gamma Mais Próxima',
    category: 'Níveis',
    description: 'Preço da resistência Gamma virgem acima do preço.',
    paramDefs: [
      { key: 'minDistancePts', label: 'Distância Mínima (pts)', type: 'number', default: 5, min: 0, max: 500 }
    ]
  },
  {
    id: 'nearest_support',
    name: 'Suporte Gamma Mais Próximo',
    category: 'Níveis',
    description: 'Preço do suporte Gamma virgem abaixo do preço.',
    paramDefs: [
      { key: 'minDistancePts', label: 'Distância Mínima (pts)', type: 'number', default: 5, min: 0, max: 500 }
    ]
  },
  {
    id: 'distance_to_resistance',
    name: 'Distância para Resistência (pontos)',
    category: 'Níveis',
    description: 'Distância em pontos até a resistência Gamma mais próxima.'
  },
  {
    id: 'distance_to_support',
    name: 'Distância para Suporte (pontos)',
    category: 'Níveis',
    description: 'Distância em pontos até o suporte Gamma mais próximo.'
  },

  // --- SMC ---
  {
    id: 'SMC_OB',
    name: 'SMC - Order Blocks (Demand & Supply)',
    category: 'SMC',
    subSeries: [
      { label: 'Order Block Compra (Demand)', value: 'demand' },
      { label: 'Order Block Venda (Supply)', value: 'supply' }
    ]
  },
  {
    id: 'SMC_RANGE_FILTER',
    name: 'SMC - Filtro Estrutural de Range (Breakout / Pullback)',
    category: 'SMC',
    description: 'Filtro validador de consolidação, movimento esticado e zonas de rompimento (Breakout) ou recuo (Pullback) em uma janela de velas.',
    subSeries: [
      { label: 'Validação Geral do Filtro (aprovado / reprovado)', value: 'status' },
      { label: 'Direção da Zona Válida (compra / venda / neutro)', value: 'zone_direction' },
      { label: 'Sinal de Breakout (compra / venda / neutro)', value: 'breakout_status' },
      { label: 'Sinal de Pullback (compra / venda / neutro)', value: 'pullback_status' },
      { label: 'Apenas Breakout de ALTA (compra / neutro)', value: 'breakout_buy' },
      { label: 'Apenas Breakout de BAIXA (venda / neutro)', value: 'breakout_sell' },
      { label: 'Apenas Pullback de ALTA (compra / neutro)', value: 'pullback_buy' },
      { label: 'Apenas Pullback de BAIXA (venda / neutro)', value: 'pullback_sell' },
      { label: 'Tamanho da Amplitude do Range (pontos)', value: 'block_range' },
      { label: 'Preço Máxima do Bloco (Resistência)', value: 'block_high' },
      { label: 'Preço Mínima do Bloco (Suporte)', value: 'block_low' }
    ],
    paramDefs: [
      { key: 'candleHistory', label: 'Qtd Velas de Histórico (Lookback)', type: 'number', default: 10, min: 2, max: 200, step: 1 },
      { key: 'rangeMinSize', label: 'Amplitude Mínima (Pontos)', type: 'number', default: 0.0, min: 0.0, max: 1000.0, step: 0.5 },
      { key: 'rangeMaxSize', label: 'Amplitude Máxima (Pontos)', type: 'number', default: 200.0, min: 1.0, max: 2000.0, step: 0.5 },
      { key: 'limitMinPct', label: 'Distância Mínima (% do Range)', type: 'number', default: 0.0, min: 0.0, max: 100.0, step: 1.0 },
      { key: 'limitMaxPct', label: 'Distância Máxima (% do Range)', type: 'number', default: 50.0, min: 1.0, max: 200.0, step: 1.0 },
      {
        key: 'filterMode',
        label: 'Tipo de Validação / Modo',
        type: 'select',
        default: 'both',
        options: [
          { label: 'Ambos (Breakout OU Pullback)', value: 'both' },
          { label: 'Apenas Rompimento (Breakout)', value: 'breakout' },
          { label: 'Apenas Recuo (Pullback)', value: 'pullback' }
        ]
      },
      { key: 'allowBreakout', label: 'Habilitar Breakout (OB_BREAKOUT)', type: 'boolean', default: true },
      { key: 'allowPullback', label: 'Habilitar Pullback (OB_PULLBACK)', type: 'boolean', default: true }
    ]
  },
  {
    id: 'SMC_BOS_CHOCH',
    name: 'SMC - Break of Structure (BOS) & CHoCH',
    category: 'SMC',
    description: 'Identificação estrutural de continuação (BOS) e reversão de tendência (CHoCH).',
    subSeries: [
      { label: 'Sinal Geral Estrutural (compra / venda / neutro)', value: 'signal' },
      { label: 'Break of Structure - BOS (compra / venda / neutro)', value: 'bos' },
      { label: 'Change of Character - CHoCH (compra / venda / neutro)', value: 'choch' },
      { label: 'BOS de ALTA (compra / neutro)', value: 'bos_bullish' },
      { label: 'BOS de BAIXA (venda / neutro)', value: 'bos_bearish' },
      { label: 'CHoCH de ALTA (compra / neutro)', value: 'choch_bullish' },
      { label: 'CHoCH de BAIXA (venda / neutro)', value: 'choch_bearish' },
      { label: 'Preço de Rompimento da Estrutura', value: 'price' }
    ],
    paramDefs: [
      { key: 'swingLength', label: 'Comprimento Swing (Sensibilidade Pivôs)', type: 'number', default: 5, min: 2, max: 20, step: 1 }
    ]
  },
  {
    id: 'FVG',
    name: 'Fair Value Gaps (FVG)',
    category: 'SMC',
    subSeries: [
      { label: 'FVG Compra Topo', value: 'fvg_compra_topo' },
      { label: 'FVG Compra Centro', value: 'fvg_compra_centro' },
      { label: 'FVG Compra Fundo', value: 'fvg_compra_fundo' },
      { label: 'FVG Venda Topo', value: 'fvg_venda_topo' },
      { label: 'FVG Venda Centro', value: 'fvg_venda_centro' },
      { label: 'FVG Venda Fundo', value: 'fvg_venda_fundo' },
      { label: 'FVG Geral Tamanho (pontos)', value: 'fvg_tamanho' },
      { label: 'FVG Geral Tipo (compra/venda)', value: 'fvg_tipo' }
    ]
  },
  {
    id: 'ElliottWaves',
    name: 'Ondas de Elliott Automáticas',
    category: 'SMC',
    description: 'Contagem automática de ondas impulsivas (1..5) e corretivas (A..C).',
    subSeries: [
      { label: 'Onda Atual (1..5 / A..C)', value: 'wave' },
      { label: 'Confirmação Onda 1 (Impulso Alta)', value: 'wave_1' },
      { label: 'Confirmação Onda 2 (Correção)', value: 'wave_2' },
      { label: 'Confirmação Onda 3 (Impulso Forte)', value: 'wave_3' },
      { label: 'Confirmação Onda 4 (Correção)', value: 'wave_4' },
      { label: 'Confirmação Onda 5 (Final Impulso)', value: 'wave_5' },
      { label: 'Confirmação Onda A (Início Correção)', value: 'wave_a' },
      { label: 'Confirmação Onda B (Repique)', value: 'wave_b' },
      { label: 'Confirmação Onda C (Final Correção)', value: 'wave_c' }
    ],
    paramDefs: [
      { key: 'deviation', label: 'Sensibilidade Pivô (%)', type: 'number', default: 1.5, min: 0.2, max: 10, step: 0.1 }
    ]
  },

  // --- MOMENTUM & SENTIMENTO ---
  {
    id: 'buy_strength',
    name: 'Força Compra Gamma',
    category: 'Momentum & Sentimento'
  },
  {
    id: 'sell_strength',
    name: 'Força Venda Gamma',
    category: 'Momentum & Sentimento'
  },
  {
    id: 'gamma_bias',
    name: 'Viés Gamma (compra/venda)',
    category: 'Momentum & Sentimento',
    isCategorical: true
  },
  {
    id: 'sentiment',
    name: 'Sentimento Macro (%)',
    category: 'Momentum & Sentimento'
  },
  {
    id: 'market_sentiment',
    name: 'Sentimento Micro (%)',
    category: 'Momentum & Sentimento'
  },
  {
    id: 'estado',
    name: 'Acelerômetro (Estado)',
    category: 'Momentum & Sentimento',
    isCategorical: true
  },
  {
    id: 'printsPerSecond',
    name: 'Prints/Seg (Velocidade do Mercado)',
    category: 'Momentum & Sentimento'
  },
  {
    id: 'FORCA_MOMENTUM',
    name: 'Força Momentum',
    category: 'Momentum & Sentimento',
    description: 'Força e impulso em tempo real por ativo ou média total das Big Techs.',
    paramDefs: [
      {
        key: 'asset',
        label: 'Ativo / Grupo',
        type: 'select',
        default: 'total',
        options: [
          { label: 'Total (Média de Todos os Ativos)', value: 'total' },
          { label: 'NASDAQ', value: 'nasdaq' },
          { label: 'S&P 500', value: 'sp500' },
          { label: 'NVIDIA', value: 'nvidia' },
          { label: 'APPLE', value: 'apple' },
          { label: 'MICROSOFT', value: 'microsoft' },
          { label: 'AMAZON', value: 'amazon' },
          { label: 'ALPHABET (Google)', value: 'alphabet' },
          { label: 'META', value: 'meta' },
          { label: 'TESLA', value: 'tesla' },
          { label: 'USD Index', value: 'usdindex' },
          { label: 'VIX', value: 'vix' }
        ]
      }
    ]
  },

  // --- NOTÍCIAS & PADRÕES ---
  {
    id: 'noticia_impacto',
    name: 'Notícia Econômica (Impacto)',
    category: 'Notícias & Padrões',
    isCategorical: true
  },
  {
    id: 'noticia_minutos',
    name: 'Notícia Econômica (Minutos Decorridos)',
    category: 'Notícias & Padrões'
  },
  {
    id: 'noticia_pais',
    name: 'Notícia Econômica (País)',
    category: 'Notícias & Padrões',
    isCategorical: true
  },
  {
    id: 'pattern_engolfo',
    name: 'Padrão Engolfo (compra/venda/neutro)',
    category: 'Notícias & Padrões',
    isCategorical: true
  },
  {
    id: 'pattern_pinbar',
    name: 'Padrão Pinbar (compra/venda/neutro)',
    category: 'Notícias & Padrões',
    isCategorical: true
  },
  {
    id: 'pattern_180',
    name: 'Padrão Bull 180 / Bear 180',
    category: 'Notícias & Padrões',
    isCategorical: true
  },
  {
    id: 'pattern_star3',
    name: 'Padrão Estrela de Reversão / 3 Candles (compra/venda/neutro)',
    category: 'Notícias & Padrões',
    isCategorical: true
  },
  {
    id: 'pattern_chute',
    name: 'Padrão Chute / Kicking (compra/venda/neutro)',
    category: 'Notícias & Padrões',
    isCategorical: true
  },

  // --- PREÇO & VELA ---
  {
    id: 'price',
    name: 'Preço Atual (Fechamento)',
    category: 'Preço & Vela'
  },
  {
    id: 'candle_open',
    name: 'Abertura do Candle',
    category: 'Preço & Vela'
  },
  {
    id: 'candle_high',
    name: 'Máxima do Candle',
    category: 'Preço & Vela'
  },
  {
    id: 'candle_low',
    name: 'Mínima do Candle',
    category: 'Preço & Vela'
  },
  {
    id: 'candle_close',
    name: 'Fechamento do Candle',
    category: 'Preço & Vela'
  },
  {
    id: 'candle_size',
    name: 'Tamanho Total do Candle (pontos)',
    category: 'Preço & Vela'
  },
  {
    id: 'candle_body',
    name: 'Corpo do Candle (pontos)',
    category: 'Preço & Vela'
  }
];

// Lista com IDs categóricos
export const CATEGORICAL_INDICATOR_IDS: string[] = ALGORITHM_INDICATORS
  .filter(ind => ind.isCategorical)
  .map(ind => ind.id);

export function isConditionCategorical(cond: any): boolean {
  if (!cond) return false;
  const source = cond.source || cond.indicator || '';
  if (CATEGORICAL_INDICATOR_IDS.includes(source)) return true;

  const subSeries = cond.subSeries || cond.source_subSeries || '';
  if (['pva', 'pattern_pinbar', 'pattern_engolfo', 'pattern_180', 'pattern_star3', 'pattern_chute', 'gamma_bias', 'fvg_tipo', 'blocktrades_side', 'blockTrades_side', 'emacd_trend'].includes(source)) return true;

  if ((source === 'Supertrend' || source === 'supertrend') && ['trend', 'signal_buy', 'signal_sell'].includes(subSeries)) return true;
  if ((source === 'MACD' || source === 'macd') && ['divergence_bullish', 'divergence_bearish', 'divergence_trend', 'divergence', 'divergencia_alta', 'divergencia_baixa'].includes(subSeries)) return true;
  if ((source === 'EMACD' || source === 'emacd') && subSeries === 'trend') return true;
  if ((source === 'VOLUME_SPIKE_PIVOTS' || source === 'volume_spike_pivots') && ['spike_status', 'touch_buy', 'touch_sell'].includes(subSeries)) return true;
  if ((source === 'VOLUME_HVN_BLOCKS' || source === 'volume_hvn_blocks') && subSeries === 'inside_any') return true;
  if (source === 'ElliottWaves' || source === 'elliottwaves') return true;
  if (source === 'noticia_impacto' || source === 'noticia_pais' || source === 'estado') return true;

  // SMC BOS / CHoCH, SMC Range Filter, MA Cloud Filter e Axion Trend
  if ((source === 'SMC_BOS_CHOCH' || source === 'smc_bos_choch') && ['signal', 'bos', 'choch', 'bos_bullish', 'bos_bearish', 'choch_bullish', 'choch_bearish'].includes(subSeries)) return true;
  if ((source === 'SMC_RANGE_FILTER' || source === 'smc_range_filter') && ['status', 'zone_direction', 'breakout_status', 'pullback_status', 'breakout_buy', 'breakout_sell', 'pullback_buy', 'pullback_sell'].includes(subSeries)) return true;
  if ((source === 'MA_CLOUD_FILTER' || source === 'ma_cloud_filter') && ['status', 'direction', 'buy_valid', 'sell_valid'].includes(subSeries)) return true;
  if (['AXION_TREND_ARROWS', 'axion_trend_arrows', 'AXION_TREND_CANDLES', 'axion_trend_candles', 'AXION_TREND_CONCILIATED', 'axion_trend_conciliated'].includes(source)) return true;
  if ((source === 'AXION_TREND' || source === 'axion_trend' || source === 'axiontrend') && ['signal_arrow', 'candle_trend', 'conciliated_trend', 'conciliated_signal', 'macdbb_zero_trend', 'macdbb_state', 'bullbear_signal', 'bullbear_trend', ''].includes(subSeries)) return true;

  return false;
}

// Mapeamento de compatibilidade retroativa para legados
export const LEGACY_INDICATOR_MAP: Record<string, { indicatorId: string; subSeries?: string; params?: Record<string, any> }> = {
  sma8: { indicatorId: 'SMA', params: { period: 8, source: 'close' } },
  sma20: { indicatorId: 'SMA', params: { period: 20, source: 'close' } },
  sma50: { indicatorId: 'SMA', params: { period: 50, source: 'close' } },
  rsi: { indicatorId: 'RSI', params: { period: 14 } },
  macd_histogram: { indicatorId: 'MACD', subSeries: 'histogram', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
  macd_line: { indicatorId: 'MACD', subSeries: 'line', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
  macd_signal: { indicatorId: 'MACD', subSeries: 'signal', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
  macd_divergence_bullish: { indicatorId: 'MACD', subSeries: 'divergence_bullish', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, divergenceMinBars: 5, divergenceLookback: 60 } },
  macd_divergence_bearish: { indicatorId: 'MACD', subSeries: 'divergence_bearish', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, divergenceMinBars: 5, divergenceLookback: 60 } },
  macd_divergence: { indicatorId: 'MACD', subSeries: 'divergence_trend', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, divergenceMinBars: 5, divergenceLookback: 60 } },
  emacd_histogram: { indicatorId: 'EMACD', subSeries: 'histogram', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
  emacd_histogram_compra: { indicatorId: 'EMACD', subSeries: 'histogram_compra', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
  emacd_histogram_venda: { indicatorId: 'EMACD', subSeries: 'histogram_venda', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
  emacd_histogram_abs: { indicatorId: 'EMACD', subSeries: 'histogram_abs', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
  emacd_explosion: { indicatorId: 'EMACD', subSeries: 'explosion', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
  emacd_deadzone: { indicatorId: 'EMACD', subSeries: 'deadzone', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
  emacd_trend: { indicatorId: 'EMACD', subSeries: 'trend', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
  fvg_compra_topo: { indicatorId: 'FVG', subSeries: 'fvg_compra_topo' },
  fvg_compra_centro: { indicatorId: 'FVG', subSeries: 'fvg_compra_centro' },
  fvg_compra_fundo: { indicatorId: 'FVG', subSeries: 'fvg_compra_fundo' },
  fvg_venda_topo: { indicatorId: 'FVG', subSeries: 'fvg_venda_topo' },
  fvg_venda_centro: { indicatorId: 'FVG', subSeries: 'fvg_venda_centro' },
  fvg_venda_fundo: { indicatorId: 'FVG', subSeries: 'fvg_venda_fundo' },
  fvg_topo: { indicatorId: 'FVG', subSeries: 'fvg_compra_topo' },
  fvg_centro: { indicatorId: 'FVG', subSeries: 'fvg_compra_centro' },
  fvg_fundo: { indicatorId: 'FVG', subSeries: 'fvg_compra_fundo' },
  fvg_tamanho: { indicatorId: 'FVG', subSeries: 'fvg_tamanho' },
  fvg_tipo: { indicatorId: 'FVG', subSeries: 'fvg_tipo' },
  momentum_forca_total: { indicatorId: 'FORCA_MOMENTUM', params: { asset: 'total' } },
  momentum_forca_nasdaq: { indicatorId: 'FORCA_MOMENTUM', params: { asset: 'nasdaq' } },
  momentum_forca_sp500: { indicatorId: 'FORCA_MOMENTUM', params: { asset: 'sp500' } },
  momentum_forca_vix: { indicatorId: 'FORCA_MOMENTUM', params: { asset: 'vix' } },
  momentum_forca_usdindex: { indicatorId: 'FORCA_MOMENTUM', params: { asset: 'usdindex' } },
  momentum_forca_nvidia: { indicatorId: 'FORCA_MOMENTUM', params: { asset: 'nvidia' } },
  momentum_forca_apple: { indicatorId: 'FORCA_MOMENTUM', params: { asset: 'apple' } },
  momentum_forca_microsoft: { indicatorId: 'FORCA_MOMENTUM', params: { asset: 'microsoft' } },
  momentum_forca_amazon: { indicatorId: 'FORCA_MOMENTUM', params: { asset: 'amazon' } },
  momentum_forca_alphabet: { indicatorId: 'FORCA_MOMENTUM', params: { asset: 'alphabet' } },
  momentum_forca_meta: { indicatorId: 'FORCA_MOMENTUM', params: { asset: 'meta' } },
  momentum_forca_tesla: { indicatorId: 'FORCA_MOMENTUM', params: { asset: 'tesla' } },
  tma: { indicatorId: 'TMA', subSeries: 'main' },
  tma_main: { indicatorId: 'TMA', subSeries: 'main' },
  tma_upper: { indicatorId: 'TMA', subSeries: 'upper' },
  tma_lower: { indicatorId: 'TMA', subSeries: 'lower' },
  tma_range: { indicatorId: 'TMA', subSeries: 'range' },
  axion_trend_arrows: { indicatorId: 'AXION_TREND_ARROWS' },
  axion_trend_candles: { indicatorId: 'AXION_TREND_CANDLES' },
  axion_trend_conciliated: { indicatorId: 'AXION_TREND_CONCILIATED', subSeries: 'conciliated_trend' }
};

// Helper para obter definição do indicador por ID
export function getAlgorithmIndicatorDef(id: string): AlgorithmIndicatorDef | undefined {
  if (!id) return undefined;
  const legacy = LEGACY_INDICATOR_MAP[id];
  const targetId = legacy ? legacy.indicatorId : id;
  return ALGORITHM_INDICATORS.find(ind => ind.id === targetId);
}

// Helper para formatar o nome amigável do indicador na condição com seus parâmetros
export function formatAlgorithmIndicatorLabel(cond: any, isTarget: boolean = false): string {
  if (!cond) return '';
  const key = isTarget 
    ? (cond.target_indicator || cond.target_value || '') 
    : (cond.source || cond.indicator || '');
  
  if (LEGACY_INDICATOR_MAP[key]) {
    const leg = LEGACY_INDICATOR_MAP[key];
    if (leg.indicatorId === 'SMA') return `SMA (${leg.params?.period})`;
    if (leg.indicatorId === 'MACD') return `MACD ${leg.subSeries} (12, 26, 9)`;
    if (leg.indicatorId === 'EMACD') return `e-MACD ${leg.subSeries} (12, 26, 9)`;
  }

  const def = getAlgorithmIndicatorDef(key);
  if (!def) return key;

  const params = isTarget ? (cond.target_params || {}) : (cond.source_params || cond.params || {});
  const subSeriesKey = isTarget ? cond.target_subSeries : (cond.subSeries || cond.source_subSeries);

  let paramStr = '';
  if (def.id === 'SMA' || def.id === 'EMA') {
    const period = params.period || cond.param1 || 20;
    paramStr = `(${period})`;
  } else if (def.id === 'RSI') {
    const period = params.period || cond.param1 || 14;
    paramStr = `(${period})`;
  } else if (def.id === 'MACD') {
    const fast = params.fastPeriod || 12;
    const slow = params.slowPeriod || 26;
    const sig = params.signalPeriod || 9;
    let subLabel = '';
    if (subSeriesKey === 'divergence_bullish') subLabel = ' [Divergência ALTA]';
    else if (subSeriesKey === 'divergence_bearish') subLabel = ' [Divergência BAIXA]';
    else if (subSeriesKey === 'divergence_trend' || subSeriesKey === 'divergence') subLabel = ' [Divergência]';
    else if (subSeriesKey) subLabel = ` [${subSeriesKey}]`;
    paramStr = `${subLabel} (${fast}, ${slow}, ${sig})`;
  } else if (def.id === 'EMACD') {
    const fast = params.fastPeriod || 12;
    const slow = params.slowPeriod || 26;
    const sig = params.signalPeriod || 9;
    const subLabel = subSeriesKey ? ` [${subSeriesKey}]` : '';
    paramStr = `${subLabel} (${fast}, ${slow}, ${sig})`;
  } else if (def.id === 'TMA') {
    const period = params.period || 20;
    const mult = params.atrMultiplier || 2.0;
    const subDef = def.subSeries?.find(s => s.value === subSeriesKey);
    const subLabel = subDef ? ` [${subDef.label}]` : (subSeriesKey ? ` [${subSeriesKey}]` : '');
    paramStr = `${subLabel} (${period}, mult: ${mult})`;
  } else if (def.id === 'Bollinger') {
    const period = params.period || 20;
    const stdDev = params.stdDev || 2.0;
    const subLabel = subSeriesKey ? ` [${subSeriesKey}]` : '';
    paramStr = `${subLabel} (${period}, std: ${stdDev})`;
  } else if (def.id === 'Supertrend') {
    const period = params.atrPeriod || 10;
    const mult = params.multiplier || 3.0;
    const subLabel = subSeriesKey ? ` [${subSeriesKey}]` : '';
    paramStr = `${subLabel} (${period}, mult: ${mult})`;
  } else if (def.id === 'FORCA_MOMENTUM') {
    const asset = (params.asset || 'total').toUpperCase();
    paramStr = ` (${asset})`;
  } else if (def.id === 'VOLUME_LEVELS' || def.id === 'VOLUME_HVN_BLOCKS') {
    const sMode = params.sessionMode || 'all';
    const subDef = def.subSeries?.find(s => s.value === subSeriesKey);
    const subLabel = subDef ? ` [${subDef.label}]` : (subSeriesKey ? ` [${subSeriesKey}]` : '');
    const modeLabel = sMode === 'bars'
      ? `${params.lookbackBars || 30} velas`
      : sMode === 'custom'
        ? `${params.customStart || '09:00'}-${params.customEnd || '18:00'}, ${params.lookbackDays || 1}d`
        : `24h, ${params.lookbackDays || 1}d`;
    paramStr = `${subLabel} (${modeLabel})`;
  } else if (def.id === 'VOLUME_SPIKE_PIVOTS') {
    const bars = params.barsToCheck || 5;
    const mult = params.volumeMultiple || 1.5;
    const subDef = def.subSeries?.find(s => s.value === subSeriesKey);
    const subLabel = subDef ? ` [${subDef.label}]` : (subSeriesKey ? ` [${subSeriesKey}]` : '');
    paramStr = `${subLabel} (${bars}b, ${mult}x)`;
  } else if (def.id === 'SMC_RANGE_FILTER') {
    const candles = params.candleHistory || 10;
    const minR = params.rangeMinSize !== undefined ? params.rangeMinSize : 0;
    const maxR = params.rangeMaxSize !== undefined ? params.rangeMaxSize : 200;
    const subDef = def.subSeries?.find(s => s.value === subSeriesKey);
    const subLabel = subDef ? ` [${subDef.label}]` : (subSeriesKey ? ` [${subSeriesKey}]` : '');
    paramStr = `${subLabel} (${candles}c, ${minR}-${maxR}pts)`;
  } else if (def.id === 'SMC_BOS_CHOCH') {
    const swing = params.swingLength || 5;
    const subDef = def.subSeries?.find(s => s.value === subSeriesKey);
    const subLabel = subDef ? ` [${subDef.label}]` : (subSeriesKey ? ` [${subSeriesKey}]` : '');
    paramStr = `${subLabel} (${swing} len)`;
  } else if (def.id === 'MA_CLOUD_FILTER') {
    const fast = params.fastPeriod || 8;
    const slow = params.slowPeriod || 21;
    const minD = params.minDistance !== undefined ? params.minDistance : 0;
    const maxD = params.maxDistance !== undefined ? params.maxDistance : 100;
    const rev = params.reverseLogic ? ' [Rev]' : '';
    const subDef = def.subSeries?.find(s => s.value === subSeriesKey);
    const subLabel = subDef ? ` [${subDef.label}]` : (subSeriesKey ? ` [${subSeriesKey}]` : '');
    paramStr = `${subLabel} (SMA ${fast}/${slow}, ${minD}-${maxD}pts${rev})`;
  } else if (def.id === 'AXION_TREND' || def.id === 'AXION_TREND_ARROWS' || def.id === 'AXION_TREND_CANDLES' || def.id === 'AXION_TREND_CONCILIATED') {
    const fast = params.macdFastLength || 12;
    const slow = params.macdSlowLength || 26;
    const subDef = def.subSeries?.find(s => s.value === subSeriesKey);
    const subLabel = subDef ? ` [${subDef.label}]` : (subSeriesKey ? ` [${subSeriesKey}]` : '');
    paramStr = `${subLabel} (${fast}/${slow})`;
  } else if (subSeriesKey) {
    paramStr = ` [${subSeriesKey}]`;
  }

  return `${def.name}${paramStr}`;
}

// Helper para símbolo de operador legível
export function getOperatorSymbol(op: string): string {
  const norm = String(op || '').toLowerCase().trim();
  if (norm === 'gt' || norm === '>') return '>';
  if (norm === 'lt' || norm === '<') return '<';
  if (norm === 'gte' || norm === '>=') return '>=';
  if (norm === 'lte' || norm === '<=') return '<=';
  if (norm === 'eq' || norm === '=' || norm === '==') return '=';
  if (norm === 'neq' || norm === '!=' || norm === '<>') return '!=';
  if (norm === 'cross_above' || norm === 'crosses_above') return 'cruzou acima';
  if (norm === 'cross_below' || norm === 'crosses_below') return 'cruzou abaixo';
  return op;
}

