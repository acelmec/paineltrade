export type WidgetType = 
  | 'speedometer'
  | 'block_trades'
  | 'accelerometer'
  | 'gamma_bias'
  | 'delta_meter'
  | 'momentum_asset'
  | 'momentum_overview'
  | 'grix_analytics'
  | 'grix_anchors'
  | 'grix_flow'
  | 'grix_stock_replacement'
  | 'projecao_mercado'
  | 'axion_ml_radar'
  | 'gamma_quant_map'
  | 'wyckoff_structural_radar';

export interface WidgetPosition {
  x: number; // pixels from left of chart container
  y: number; // pixels from top of chart container
}

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  visible: boolean;
  position: WidgetPosition;
  collapsed?: boolean;
  opacity?: number; // 0.2 to 1.0 (default 0.92)
  params: Record<string, any>;
}

export interface WidgetDefinition {
  type: WidgetType;
  name: string;
  icon: string;
  description: string;
  defaultPosition: WidgetPosition;
  defaultParams: Record<string, any>;
}

export const MOMENTUM_ASSETS = [
  { symbol: 'NASDAQ', shortName: 'NDAQ', fullName: 'Nasdaq 100' },
  { symbol: 'S&P 500', shortName: 'SP500', fullName: 'S&P 500' },
  { symbol: 'USD Index', shortName: 'DXY', fullName: 'Dólar DXY (Invertido)' },
  { symbol: 'VIX', shortName: 'VIX', fullName: 'Volatilidade VIX (Invertido)' },
  { symbol: 'NVIDIA', shortName: 'NVDA', fullName: 'NVIDIA Corp' },
  { symbol: 'Tesla', shortName: 'TSLA', fullName: 'Tesla Inc' },
  { symbol: 'Apple', shortName: 'AAPL', fullName: 'Apple Inc' },
  { symbol: 'Microsoft', shortName: 'MSFT', fullName: 'Microsoft Corp' },
  { symbol: 'Meta', shortName: 'META', fullName: 'Meta Platforms' },
  { symbol: 'Amazon', shortName: 'AMZN', fullName: 'Amazon.com' },
  { symbol: 'Alphabet', shortName: 'GOOGL', fullName: 'Alphabet Google' },
  { symbol: 'FORÇA FINAL', shortName: 'FORCA', fullName: 'Força Média Geral' }
];

export const WIDGET_DEFINITIONS: Record<WidgetType, WidgetDefinition> = {
  speedometer: {
    type: 'speedometer',
    name: 'Velocímetro de Sentimento',
    icon: '⚡',
    description: 'Gauges com ponteiros em tempo real indicando Sentimento Macro (compensado) e Micro (mercado direto).',
    defaultPosition: { x: 20, y: 50 },
    defaultParams: {
      showMacro: true,
      showMicro: true
    }
  },
  block_trades: {
    type: 'block_trades',
    name: 'Block Trades Institucionais',
    icon: '🐋',
    description: 'Últimas ordens institucionais de alto volume com lado COMPRA/VENDA, quantidade, preço e horário.',
    defaultPosition: { x: 280, y: 50 },
    defaultParams: {
      limit: 5 // Default show 5 trades (options: 3, 5, 8, 10, 15, 20)
    }
  },
  accelerometer: {
    type: 'accelerometer',
    name: 'Acelerômetro de Mercado',
    icon: '⚡',
    description: 'Medidores de Z-Score e ATR Ratio com barras de gradiente dinâmico e status de expansão.',
    defaultPosition: { x: 20, y: 220 },
    defaultParams: {}
  },
  gamma_bias: {
    type: 'gamma_bias',
    name: 'Viés do Gamma & Níveis',
    icon: '🗺️',
    description: 'Viés consolidado (BULL/BEAR), pontuação de Score, força de confluência e suporte/resistência mais próximos.',
    defaultPosition: { x: 280, y: 220 },
    defaultParams: {}
  },
  delta_meter: {
    type: 'delta_meter',
    name: 'Medidor de Delta',
    icon: '⚖️',
    description: 'Barra de equilíbrio Delta Venda/Compra, Δ numérico, Delta Ratio, Prints por segundo e seletor de janelas.',
    defaultPosition: { x: 20, y: 380 },
    defaultParams: {
      windowMinutes: 1
    }
  },
  momentum_asset: {
    type: 'momentum_asset',
    name: 'Gauge de Ativo Momentum',
    icon: '💪',
    description: 'Gauge de força individual para qualquer ativo (NDAQ, SP500, DXY, NVDA, TSLA, etc.).',
    defaultPosition: { x: 280, y: 380 },
    defaultParams: {
      assetSymbol: 'NVIDIA'
    }
  },
  momentum_overview: {
    type: 'momentum_overview',
    name: 'Força Momentum (Cesta Geral)',
    icon: '📊',
    description: 'Lista completa resumida de todos os ativos da cesta de confluência do mercado.',
    defaultPosition: { x: 540, y: 50 },
    defaultParams: {}
  },
  grix_analytics: {
    type: 'grix_analytics',
    name: 'Core Analytics',
    icon: '📊',
    description: 'Progresso segmentado LED de Analytics QQQ, Estrutura de Mercado QQQ/SPY e status de IA.',
    defaultPosition: { x: 20, y: 50 },
    defaultParams: {}
  },
  grix_anchors: {
    type: 'grix_anchors',
    name: 'Anchors — SPY & QQQ',
    icon: '🧭',
    description: 'Velocímetros com ARO dinâmico de SPY e QQQ com percentuais e sinais COMPRA/VENDA.',
    defaultPosition: { x: 260, y: 50 },
    defaultParams: {}
  },
  grix_flow: {
    type: 'grix_flow',
    name: 'Flow & Exposure',
    icon: '🌊',
    description: 'Barras LED de Rho Index, Tail Risk, Volatility Smile QQQ/SPY e Net Gamma.',
    defaultPosition: { x: 20, y: 240 },
    defaultParams: {}
  },
  grix_stock_replacement: {
    type: 'grix_stock_replacement',
    name: 'Stock Replacement (QQQ)',
    icon: '🔄',
    description: 'Velocímetros com ARO dinâmico para estratégias de CALL e PUT com percentuais e sinais.',
    defaultPosition: { x: 260, y: 240 },
    defaultParams: {}
  },
  projecao_mercado: {
    type: 'projecao_mercado',
    name: 'Projeções de Mercado',
    icon: '🔭',
    description: 'Painel com Projeção técnica do NQ/QQQ, Resumo analítico e Viés de Mercado (Altista/Baixista/Neutro).',
    defaultPosition: { x: 20, y: 430 },
    defaultParams: {}
  },
  axion_ml_radar: {
    type: 'axion_ml_radar',
    name: 'Axion ML Radar',
    icon: '🧠',
    description: 'Radar preditivo de Machine Learning com probabilidades em tempo real, confluência Gamma, volume e alvos dinâmicos.',
    defaultPosition: { x: 20, y: 65 },
    defaultParams: {}
  },
  gamma_quant_map: {
    type: 'gamma_quant_map',
    name: 'Mapa Quantitativo de Gamma & Sessões',
    icon: '🗺️',
    description: 'Painel espacial com arquétipos de mercado, viés do dia e de momento, probabilidades por sessão e níveis projetados (TP/SL).',
    defaultPosition: { x: 20, y: 70 },
    defaultParams: {
      selectedStudyId: ''
    }
  },
  wyckoff_structural_radar: {
    type: 'wyckoff_structural_radar',
    name: 'Radar Wyckoff & Sweeps',
    icon: '⚡',
    description: 'Monitoramento em tempo real de Caixotes, Sweeps de liquidez, absorções Reclaim e confluências institucionais de Opções/Gamma.',
    defaultPosition: { x: 20, y: 75 },
    defaultParams: {
      selectedStudyId: ''
    }
  }
};

export const DEFAULT_ACTIVE_WIDGETS: WidgetConfig[] = [
  {
    id: 'widget-speedometer-default',
    type: 'speedometer',
    title: '⚡ Velocímetro de Sentimento',
    visible: true,
    position: { x: 15, y: 60 },
    collapsed: false,
    opacity: 1.0,
    params: { showMacro: true, showMicro: true }
  },
  {
    id: 'widget-blocktrades-default',
    type: 'block_trades',
    title: '🐋 Block Trades',
    visible: true,
    position: { x: 15, y: 220 },
    collapsed: false,
    opacity: 1.0,
    params: {
      limit: 5,
      minContracts: 50,
      showOnCandles: true,
      candleFontSize: 11,
      pixelOffset: 8
    }
  }
];
