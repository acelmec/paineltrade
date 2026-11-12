import type { Candle } from '../services/db';
import type { WidgetConfig } from './widgetRegistry';
import { getChartTimeFromDate, getTradingSessionKey } from './date';
import { predictNQDualProbabilities } from './axionMLPredictorEngine';
import { getCachedMLStudies, type StudyRecord } from '../services/mlService';

export type IndicatorCategory = 'Tendência' | 'SMC' | 'Volatilidade' | 'Osciladores' | 'Volume' | 'Níveis' | 'ALGORITMOS';

export interface IndicatorParamDef {
  key: string;
  label: string;
  type: 'number' | 'select' | 'boolean' | 'string';
  default: any;
  options?: { label: string; value: any }[];
  min?: number;
  max?: number;
  step?: number;
}

export interface IndicatorDefinition {
  type: string;
  name: string;
  category: IndicatorCategory;
  description: string;
  overlay: boolean; // true = gráfico principal | false = sub-painel inferior
  paramDefs: IndicatorParamDef[];
  defaultStyle: {
    color: string;
    lineWidth: 1 | 2 | 3 | 4;
    lineStyle: 'solid' | 'dashed' | 'dotted';
    secondaryColor?: string;
    fillColor?: string;
  };
}

export interface IndicatorConfig {
  id: string; // Ex: 'ema-1723456789'
  type: string;
  name: string;
  category: IndicatorCategory;
  visible: boolean;
  overlay: boolean;
  params: Record<string, any>;
  style: {
    color: string;
    lineWidth: 1 | 2 | 3 | 4;
    lineStyle: 'solid' | 'dashed' | 'dotted';
    secondaryColor?: string;
    tertiaryColor?: string;
    fillColor?: string;
  };
}

export interface ChartTemplate {
  id: string;
  name: string;
  indicators: IndicatorConfig[];
  widgets?: WidgetConfig[];
  timeframe?: number;
  isDefault?: boolean;
  isDefaultPanel2?: boolean;
  created_at?: string;
}

export const PRESET_CHART_TEMPLATES: ChartTemplate[] = [
  {
    id: 'preset-smc',
    name: '🏦 Template SMC Institucional (Order Blocks + BOS + VWAP)',
    indicators: [
      {
        id: 'smc-ob-preset',
        type: 'SMC_OB',
        name: 'SMC - Order Blocks (Demand & Supply)',
        category: 'SMC',
        visible: true,
        overlay: true,
        params: { lookback: 100 },
        style: { color: '#22c55e', lineWidth: 1, lineStyle: 'solid', secondaryColor: '#ef4444' }
      },
      {
        id: 'smc-bos-preset',
        type: 'SMC_BOS_CHOCH',
        name: 'SMC - Break of Structure & CHoCH',
        category: 'SMC',
        visible: true,
        overlay: true,
        params: { swingLength: 5 },
        style: { color: '#06b6d4', lineWidth: 1, lineStyle: 'dashed', secondaryColor: '#a855f7' }
      },
      {
        id: 'vwap-preset',
        type: 'VWAP',
        name: 'VWAP Diária',
        category: 'Volume',
        visible: true,
        overlay: true,
        params: { showDeviations: true },
        style: { color: '#e11d48', lineWidth: 2, lineStyle: 'solid' }
      }
    ]
  },
  {
    id: 'preset-tma-ema',
    name: '🟢 Template Canal TMA & Médias Exponenciais (Scalper)',
    indicators: [
      {
        id: 'tma-preset',
        type: 'TMA',
        name: 'Canal TMA (Não-Repintável)',
        category: 'Tendência',
        visible: true,
        overlay: true,
        params: { period: 20, atrMultiplier: 2.0, atrPeriod: 14 },
        style: { color: '#06b6d4', lineWidth: 2, lineStyle: 'solid', secondaryColor: '#ec4899' }
      },
      {
        id: 'ema9-preset',
        type: 'EMA',
        name: 'Média Móvel Exponencial (EMA 9)',
        category: 'Tendência',
        visible: true,
        overlay: true,
        params: { period: 9, source: 'close' },
        style: { color: '#22c55e', lineWidth: 2, lineStyle: 'solid' }
      },
      {
        id: 'ema21-preset',
        type: 'EMA',
        name: 'Média Móvel Exponencial (EMA 21)',
        category: 'Tendência',
        visible: true,
        overlay: true,
        params: { period: 21, source: 'close' },
        style: { color: '#eab308', lineWidth: 2, lineStyle: 'solid' }
      }
    ]
  },
  {
    id: 'preset-elliott-rsi',
    name: '🌊 Template Ondas de Elliott & Oscilador RSI',
    indicators: [
      {
        id: 'elliott-preset',
        type: 'ElliottWaves',
        name: 'Ondas de Elliott Automáticas (1-5 & ABC)',
        category: 'SMC',
        visible: true,
        overlay: true,
        params: { deviation: 1.5 },
        style: { color: '#38bdf8', lineWidth: 2, lineStyle: 'solid', secondaryColor: '#f43f5e' }
      },
      {
        id: 'rsi-preset',
        type: 'RSI',
        name: 'RSI / IFR (14)',
        category: 'Osciladores',
        visible: true,
        overlay: false,
        params: { period: 14, overbought: 70, oversold: 30 },
        style: { color: '#f59e0b', lineWidth: 2, lineStyle: 'solid' }
      }
    ]
  }
];

export interface VolumeHeatmapBin {
  priceBottom: number;
  priceTop: number;
  priceMid: number;
  volume: number;
  intensity: number; // 0.0 a 1.0 normalizado
}

export interface VolumeLevelsData {
  poc: number;
  vah: number;
  val: number;
  totalVolume: number;
  referenceDateStr: string;
  nakedPocs: { price: number; dateStr: string }[];
}

export interface VolumeHvnBlock {
  priceCenter: number;
  priceTop: number;
  priceBottom: number;
  volume: number;
  rank: number;
}

export interface VolumeProfileAnalysisResult {
  bins: VolumeHeatmapBin[];
  levels: VolumeLevelsData;
  hvnBlocks: VolumeHvnBlock[];
  sessionCandlesCount: number;
  minPrice: number;
  maxPrice: number;
}

export interface VolumeSpikePivotDetail {
  id: string;
  isPivotHigh: boolean;
  isPivotLow: boolean;
  level: number;
  startIndex: number;
  endIndex: number | null;
  volume: number;
  avgVolume: number;
  startTime: number;
  endTime: number | null;
  barsAgo: number;
  distancePts: number;
}

export interface VolumeSpikePivotsAnalysisResult {
  detectedPivots: VolumeSpikePivotDetail[];
  activePivots: VolumeSpikePivotDetail[];
  activeBuyLevels: VolumeSpikePivotDetail[];
  activeSellLevels: VolumeSpikePivotDetail[];
  nearestBuyLevel: number;
  nearestSellLevel: number;
  recentBuyLevel: number;
  recentSellLevel: number;
  distanceToNearestBuy: number;
  distanceToNearestSell: number;
  activeBuyCount: number;
  activeSellCount: number;
  spikeStatus: 'compra' | 'venda' | 'neutro';
  touchBuy: 'sim' | 'nao';
  touchSell: 'sim' | 'nao';
  wasPivotHighBreachedLast: boolean;
}

export function calculateVolumeSpikePivotsAnalysis(
  candles: Candle[],
  params?: {
    barsToCheck?: number;
    volumeAveragePeriod?: number;
    volumeMultiple?: number;
    currentPrice?: number;
  }
): VolumeSpikePivotsAnalysisResult {
  const barsToCheck = Math.max(3, Number(params?.barsToCheck || 5));
  const volumeAvgPeriod = Math.max(1, Number(params?.volumeAveragePeriod || 20));
  const volumeMultiple = Math.max(1.0, Number(params?.volumeMultiple || 1.5));

  const emptyResult: VolumeSpikePivotsAnalysisResult = {
    detectedPivots: [],
    activePivots: [],
    activeBuyLevels: [],
    activeSellLevels: [],
    nearestBuyLevel: 0,
    nearestSellLevel: 0,
    recentBuyLevel: 0,
    recentSellLevel: 0,
    distanceToNearestBuy: 9999,
    distanceToNearestSell: 9999,
    activeBuyCount: 0,
    activeSellCount: 0,
    spikeStatus: 'neutro',
    touchBuy: 'nao',
    touchSell: 'nao',
    wasPivotHighBreachedLast: false
  };

  if (!candles || candles.length < Math.max(barsToCheck, volumeAvgPeriod)) {
    return emptyResult;
  }

  const times = candles.map(getCandleTimeSeconds);
  const evalPrice = typeof params?.currentPrice === 'number' && params.currentPrice > 0
    ? params.currentPrice
    : Number(candles[candles.length - 1]?.close || 0);

  const detectedPivots: VolumeSpikePivotDetail[] = [];
  const activePivotsList: VolumeSpikePivotDetail[] = [];
  let wasPivotHighBreachedLast = false;
  const centerOffset = Math.ceil(barsToCheck / 2.0);

  for (let i = 0; i < candles.length; i++) {
    // 1. Em cada barra, verificar rompimento das linhas ativas pelo fechamento atual (Close[0])
    if (i > 0) {
      const currentClose = candles[i].close;
      for (let pIdx = activePivotsList.length - 1; pIdx >= 0; pIdx--) {
        const pivot = activePivotsList[pIdx];
        if (pivot.isPivotHigh && currentClose > pivot.level) {
          pivot.endIndex = i;
          pivot.endTime = times[i] || null;
          wasPivotHighBreachedLast = true;
          activePivotsList.splice(pIdx, 1);
        } else if (pivot.isPivotLow && currentClose < pivot.level) {
          pivot.endIndex = i;
          pivot.endTime = times[i] || null;
          wasPivotHighBreachedLast = false;
          activePivotsList.splice(pIdx, 1);
        }
      }
    }

    if (i < barsToCheck || i < volumeAvgPeriod) continue;

    const centerBarIndex = i - centerOffset;
    if (centerBarIndex < 0) continue;

    const centerCandle = candles[centerBarIndex];
    if (!centerCandle) continue;

    // 2. Verificar se a vela central é máxima ou mínima estrita na janela de 1..barsToCheck
    let isPivotHigh = true;
    let isPivotLow = true;

    for (let k = 1; k <= barsToCheck; k++) {
      if (k === centerOffset) continue;
      const compIdx = i - k;
      if (compIdx < 0 || compIdx >= candles.length) continue;
      const compCandle = candles[compIdx];
      if (centerCandle.high < compCandle.high) isPivotHigh = false;
      if (centerCandle.low > compCandle.low) isPivotLow = false;
    }

    if (!isPivotHigh && !isPivotLow) continue;

    // 3. Verificar se já existe pivô ativo no mesmo nível de preço exato
    const existsHigh = activePivotsList.some(
      p => p.isPivotHigh && p.level === centerCandle.high
    );
    const existsLow = activePivotsList.some(
      p => p.isPivotLow && p.level === centerCandle.low
    );

    // 4. Média de volume dos últimos volumeAveragePeriod candles
    let sumVol = 0;
    for (let v = 0; v < volumeAvgPeriod; v++) {
      const compVolIdx = i - v;
      if (compVolIdx >= 0 && compVolIdx < candles.length) {
        sumVol += (candles[compVolIdx].volume || 0);
      }
    }
    const avgVol = volumeAvgPeriod > 0 ? sumVol / volumeAvgPeriod : 0;
    const centerVol = centerCandle.volume || 0;
    const isSpike = avgVol > 0 && centerVol > (avgVol * volumeMultiple);

    if (!isSpike) continue;

    if (isPivotHigh && !existsHigh) {
      const highPivot: VolumeSpikePivotDetail = {
        id: `spike_high_${centerBarIndex}_${centerCandle.high}`,
        isPivotHigh: true,
        isPivotLow: false,
        level: centerCandle.high,
        startIndex: centerBarIndex,
        endIndex: null,
        volume: centerVol,
        avgVolume: avgVol,
        startTime: times[centerBarIndex] || 0,
        endTime: null,
        barsAgo: (candles.length - 1) - centerBarIndex,
        distancePts: Math.abs(centerCandle.high - evalPrice)
      };
      activePivotsList.push(highPivot);
      detectedPivots.push(highPivot);
    }

    if (isPivotLow && !existsLow) {
      const lowPivot: VolumeSpikePivotDetail = {
        id: `spike_low_${centerBarIndex}_${centerCandle.low}`,
        isPivotLow: true,
        isPivotHigh: false,
        level: centerCandle.low,
        startIndex: centerBarIndex,
        endIndex: null,
        volume: centerVol,
        avgVolume: avgVol,
        startTime: times[centerBarIndex] || 0,
        endTime: null,
        barsAgo: (candles.length - 1) - centerBarIndex,
        distancePts: Math.abs(evalPrice - centerCandle.low)
      };
      activePivotsList.push(lowPivot);
      detectedPivots.push(lowPivot);
    }
  }

  // Atualizar barsAgo e distancePts para todos os pivôs
  const lastIdx = candles.length - 1;
  detectedPivots.forEach(p => {
    p.barsAgo = lastIdx - p.startIndex;
    p.distancePts = Math.abs(evalPrice - p.level);
  });

  const activePivots = detectedPivots.filter(p => p.endIndex === null);

  // Níveis de Compra (Suportes): pivôs de baixa ativos abaixo ou próximos do preço
  const activeBuyLevels = activePivots
    .filter(p => p.isPivotLow)
    .sort((a, b) => b.level - a.level); // Mais próximos ao preço (mais altos) primeiro

  // Níveis de Venda (Resistências): pivôs de alta ativos acima ou próximos do preço
  const activeSellLevels = activePivots
    .filter(p => p.isPivotHigh)
    .sort((a, b) => a.level - b.level); // Mais próximos ao preço (mais baixos) primeiro

  const nearestBuyLevel = activeBuyLevels.length > 0 ? activeBuyLevels[0].level : 0;
  const nearestSellLevel = activeSellLevels.length > 0 ? activeSellLevels[0].level : 0;

  const allActiveBuy = activePivots.filter(p => p.isPivotLow);
  const recentBuyLevel = allActiveBuy.length > 0 ? allActiveBuy[allActiveBuy.length - 1].level : 0;

  const allActiveSell = activePivots.filter(p => p.isPivotHigh);
  const recentSellLevel = allActiveSell.length > 0 ? allActiveSell[allActiveSell.length - 1].level : 0;

  const distanceToNearestBuy = nearestBuyLevel > 0 ? Math.abs(evalPrice - nearestBuyLevel) : 9999;
  const distanceToNearestSell = nearestSellLevel > 0 ? Math.abs(nearestSellLevel - evalPrice) : 9999;

  // Status de spike na barra de formação ou recente
  const lastP = detectedPivots[detectedPivots.length - 1];
  let spikeStatus: 'compra' | 'venda' | 'neutro' = 'neutro';
  if (lastP && lastP.barsAgo <= 1) {
    spikeStatus = lastP.isPivotHigh ? 'venda' : 'compra';
  }

  // Toque / Teste
  const lastCandle = candles[candles.length - 1];
  let touchBuy: 'sim' | 'nao' = 'nao';
  let touchSell: 'sim' | 'nao' = 'nao';

  if (nearestBuyLevel > 0 && lastCandle) {
    if (lastCandle.low <= nearestBuyLevel + 2.0 && lastCandle.close >= nearestBuyLevel - 2.0) {
      touchBuy = 'sim';
    }
  }

  if (nearestSellLevel > 0 && lastCandle) {
    if (lastCandle.high >= nearestSellLevel - 2.0 && lastCandle.close <= nearestSellLevel + 2.0) {
      touchSell = 'sim';
    }
  }

  return {
    detectedPivots,
    activePivots,
    activeBuyLevels,
    activeSellLevels,
    nearestBuyLevel,
    nearestSellLevel,
    recentBuyLevel,
    recentSellLevel,
    distanceToNearestBuy,
    distanceToNearestSell,
    activeBuyCount: activeBuyLevels.length,
    activeSellCount: activeSellLevels.length,
    spikeStatus,
    touchBuy,
    touchSell,
    wasPivotHighBreachedLast
  };
}

export interface CalculatedIndicatorSeries {
  id: string;
  type: string;
  overlay: boolean;
  series: {
    name: string;
    type: 'line' | 'histogram' | 'markers';
    color: string;
    lineWidth?: 1 | 2 | 3 | 4;
    lineStyle?: number; // 0 = solid, 1 = dotted, 2 = dashed
    data: { time: number; value?: number; open?: number; high?: number; low?: number; close?: number; color?: string }[];
  }[];
  markers?: { time: number; position: 'aboveBar' | 'belowBar' | 'inBar'; color: string; shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown'; text: string; sound?: string }[];
  customData?: {
    volumeProfile?: VolumeProfileAnalysisResult;
    [key: string]: any;
  };
}

// Extract price source from candle
export function getCandlePrice(c: Candle, source: string = 'close'): number {
  switch (source) {
    case 'open': return c.open;
    case 'high': return c.high;
    case 'low': return c.low;
    case 'hl2': return (c.high + c.low) / 2;
    case 'hlc3': return (c.high + c.low + c.close) / 3;
    case 'ohlc4': return (c.open + c.high + c.low + c.close) / 4;
    case 'close':
    default: return c.close;
  }
}

// Convert ISO timestamp or candle object to UNIX seconds for Lightweight-Charts
export function getCandleTimeSeconds(c: any): number {
  if (!c) return 0;
  if (typeof c.time === 'number' && !isNaN(c.time) && c.time > 0) {
    return c.time;
  }
  if (c.timestamp) {
    const ms = new Date(c.timestamp).getTime();
    if (!isNaN(ms)) return Math.floor(ms / 1000);
  }
  return 0;
}

/**
 * DISPOSITIVO DE SEGURANÇA UNIVERSAL: Sanitizador de Séries de Linha / Histograma
 * Filtra qualquer ponto que contenha null, undefined, NaN, Infinity ou timestamp inválido.
 * Garante que a série seja estritamente crescente no tempo para o Lightweight-Charts.
 */
export function sanitizeLineSeriesData(data: any[]): { time: number; value: number }[] {
  if (!Array.isArray(data) || data.length === 0) return [];
  const valid: { time: number; value: number }[] = [];
  let lastTime = -Infinity;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (!item) continue;
    let t = typeof item.time === 'number' ? item.time : 0;
    if (t <= 0 && item.timestamp) {
      const ms = new Date(item.timestamp).getTime();
      if (!isNaN(ms)) t = Math.floor(ms / 1000);
    }
    const v = Number(item.value);
    if (
      isNaN(t) || t <= 0 ||
      item.value === null || item.value === undefined ||
      isNaN(v) || !isFinite(v)
    ) {
      continue;
    }
    const cleanPoint: any = { time: t, value: v };
    if (typeof item.color === 'string' && item.color.trim()) {
      cleanPoint.color = item.color;
    }

    if (t === lastTime) {
      valid[valid.length - 1] = cleanPoint;
    } else if (t > lastTime) {
      valid.push(cleanPoint);
      lastTime = t;
    }
  }

  return valid;
}

/**
 * DISPOSITIVO DE SEGURANÇA UNIVERSAL: Sanitizador de Candles (OHLC)
 * Filtra qualquer candle com preço null/NaN ou time inválido, deduplica timestamps
 * e elimina spikes/outliers anômalos que deformam a escala do gráfico ou distorcem indicadores.
 */
export function sanitizeCandleSeriesData(data: any[]): any[] {
  if (!Array.isArray(data) || data.length === 0) return [];
  const basic: any[] = [];
  let lastTime = -Infinity;

  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (!c) continue;
    let t = typeof c.time === 'number' ? c.time : 0;
    if (t <= 0 && c.timestamp) {
      const ms = new Date(c.timestamp).getTime();
      if (!isNaN(ms)) t = Math.floor(ms / 1000);
    }
    const o = Number(c.open);
    const h = Number(c.high);
    const l = Number(c.low);
    const cl = Number(c.close);
    if (
      isNaN(t) || t <= 0 ||
      c.open === null || c.high === null || c.low === null || c.close === null ||
      isNaN(o) || isNaN(h) || isNaN(l) || isNaN(cl) ||
      !isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(cl) ||
      o <= 0 || h <= 0 || l <= 0 || cl <= 0
    ) {
      continue;
    }
    const safeCandle = {
      ...c,
      time: t,
      open: o,
      high: Math.max(o, h, l, cl),
      low: Math.min(o, h, l, cl),
      close: cl
    };
    if (t === lastTime && basic.length > 0) {
      basic[basic.length - 1] = safeCandle;
    } else if (t > lastTime) {
      basic.push(safeCandle);
      lastTime = t;
    }
  }

  if (basic.length === 0) return [];

  // Proteção Anti-Spike / Detecção de Outliers Absolutos
  const closes = basic.map(c => c.close).sort((a, b) => a - b);
  const medianPrice = closes[Math.floor(closes.length / 2)] || basic[0].close;

  const sanitized: any[] = [];
  let prevClose = basic[0].close;

  for (let i = 0; i < basic.length; i++) {
    const c = basic[i];
    let o = c.open;
    let cl = c.close;
    let h = c.high;
    let l = c.low;

    // Desvio aberrante em relação à mediana da série (> 35%)
    if (medianPrice > 0) {
      if (Math.abs(cl - medianPrice) / medianPrice > 0.35 || Math.abs(o - medianPrice) / medianPrice > 0.35) {
        o = prevClose;
        cl = prevClose;
        h = prevClose;
        l = prevClose;
      }
    }

    // Salto isolado (> 8% em 1 barra)
    if (prevClose > 0 && Math.abs(cl - prevClose) / prevClose > 0.08) {
      const nextC = basic[i + 1];
      if (nextC && prevClose > 0 && Math.abs(nextC.close - prevClose) / prevClose < 0.04) {
        o = prevClose;
        cl = prevClose;
        h = prevClose;
        l = prevClose;
      } else if (!nextC) {
        o = prevClose;
        cl = prevClose;
        h = prevClose;
        l = prevClose;
      }
    }

    // Preserva a máxima e mínima reais de mercado (High/Low) sem truncar ou deformar pavios legítimos
    const clean = {
      ...c,
      open: o,
      high: Math.max(o, cl, h),
      low: Math.min(o, cl, l),
      close: cl
    };

    prevClose = clean.close;
    sanitized.push(clean);
  }

  return sanitized;
}

// Catálogo de Definições de Indicadores Disponíveis
export const INDICATOR_DEFINITIONS: Record<string, IndicatorDefinition> = {
  EMA: {
    type: 'EMA',
    name: 'Média Móvel Exponencial (EMA)',
    category: 'Tendência',
    description: 'Média móvel que dá maior peso aos preços mais recentes.',
    overlay: true,
    paramDefs: [
      { key: 'period', label: 'Período', type: 'number', default: 21, min: 1, max: 500 },
      {
        key: 'source', label: 'Preço Fonte', type: 'select', default: 'close', options: [
          { label: 'Fechamento', value: 'close' },
          { label: 'Abertura', value: 'open' },
          { label: 'Máxima', value: 'high' },
          { label: 'Mínima', value: 'low' },
          { label: 'HL/2 (Média Máx/Min)', value: 'hl2' },
          { label: 'HLC/3', value: 'hlc3' }
        ]
      },
      {
        key: 'barMode',
        label: 'Modo de Execução das Barras',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' },
          { label: '⚡ Barra em Tempo Real (Candle Aberto)', value: 'realtime' }
        ]
      }
    ],
    defaultStyle: { color: '#3b82f6', lineWidth: 2, lineStyle: 'solid' }
  },
  SMA: {
    type: 'SMA',
    name: 'Média Móvel Simples (SMA)',
    category: 'Tendência',
    description: 'Média aritmética simples dos preços de fechamento.',
    overlay: true,
    paramDefs: [
      { key: 'period', label: 'Período', type: 'number', default: 20, min: 1, max: 500 },
      {
        key: 'source', label: 'Preço Fonte', type: 'select', default: 'close', options: [
          { label: 'Fechamento', value: 'close' },
          { label: 'Abertura', value: 'open' },
          { label: 'Máxima', value: 'high' },
          { label: 'Mínima', value: 'low' },
          { label: 'HL/2', value: 'hl2' },
          { label: 'HLC/3', value: 'hlc3' }
        ]
      },
      {
        key: 'barMode',
        label: 'Modo de Execução das Barras',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' },
          { label: '⚡ Barra em Tempo Real (Candle Aberto)', value: 'realtime' }
        ]
      }
    ],
    defaultStyle: { color: '#eab308', lineWidth: 2, lineStyle: 'solid' }
  },
  TMA: {
    type: 'TMA',
    name: 'Canal TMA (Triangular Moving Average - Não Repintável)',
    category: 'Tendência',
    description: 'Média móvel triangular de dupla suavização com envelope de volatilidade superior e inferior que não repinta.',
    overlay: true,
    paramDefs: [
      { key: 'period', label: 'Período TMA', type: 'number', default: 20, min: 2, max: 200 },
      { key: 'atrMultiplier', label: 'Multiplicador de Banda', type: 'number', default: 2.0, min: 0.1, max: 10, step: 0.1 },
      { key: 'atrPeriod', label: 'Período ATR', type: 'number', default: 14, min: 1, max: 100 },
      {
        key: 'barMode',
        label: 'Modo de Execução das Barras',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' },
          { label: '⚡ Barra em Tempo Real (Candle Aberto)', value: 'realtime' }
        ]
      }
    ],
    defaultStyle: { color: '#06b6d4', lineWidth: 2, lineStyle: 'solid', secondaryColor: '#ec4899', fillColor: '#06b6d420' }
  },
  Supertrend: {
    type: 'Supertrend',
    name: 'Supertrend',
    category: 'Tendência',
    description: 'Indicador de acompanhamento de tendência baseado no ATR.',
    overlay: true,
    paramDefs: [
      { key: 'atrPeriod', label: 'Período ATR', type: 'number', default: 10, min: 1, max: 100 },
      { key: 'multiplier', label: 'Multiplicador', type: 'number', default: 3.0, min: 0.5, max: 10, step: 0.1 },
      {
        key: 'barMode',
        label: 'Modo de Execução das Barras',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' },
          { label: '⚡ Barra em Tempo Real (Candle Aberto)', value: 'realtime' }
        ]
      }
    ],
    defaultStyle: { color: '#22c55e', lineWidth: 2, lineStyle: 'solid', secondaryColor: '#ef4444' }
  },
  Bollinger: {
    type: 'Bollinger',
    name: 'Bandas de Bollinger',
    category: 'Volatilidade',
    description: 'Envelopes plotados a um nível de desvio padrão acima e abaixo da média móvel.',
    overlay: true,
    paramDefs: [
      { key: 'period', label: 'Período', type: 'number', default: 20, min: 2, max: 200 },
      { key: 'stdDev', label: 'Desvio Padrão', type: 'number', default: 2.0, min: 0.5, max: 5, step: 0.1 },
      {
        key: 'barMode',
        label: 'Modo de Execução das Barras',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' },
          { label: '⚡ Barra em Tempo Real (Candle Aberto)', value: 'realtime' }
        ]
      }
    ],
    defaultStyle: { color: '#a855f7', lineWidth: 1, lineStyle: 'solid', secondaryColor: '#c084fc', fillColor: '#a855f715' }
  },
  RSI: {
    type: 'RSI',
    name: 'RSI / IFR (Índice de Força Relativa)',
    category: 'Osciladores',
    description: 'Oscilador que mede a velocidade e a mudança dos movimentos de preços (0-100).',
    overlay: false,
    paramDefs: [
      { key: 'period', label: 'Período', type: 'number', default: 14, min: 2, max: 100 },
      { key: 'overbought', label: 'Nível Sobrecompra', type: 'number', default: 70, min: 50, max: 95 },
      { key: 'oversold', label: 'Nível Sobrevenda', type: 'number', default: 30, min: 5, max: 50 },
      {
        key: 'barMode',
        label: 'Modo de Execução das Barras',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' },
          { label: '⚡ Barra em Tempo Real (Candle Aberto)', value: 'realtime' }
        ]
      }
    ],
    defaultStyle: { color: '#f59e0b', lineWidth: 2, lineStyle: 'solid', secondaryColor: '#ef4444' }
  },
  MACD: {
    type: 'MACD',
    name: 'MACD (Moving Average Convergence Divergence)',
    category: 'Osciladores',
    description: 'Indicador de momento de acompanhamento de tendência e divergências de mercado.',
    overlay: false,
    paramDefs: [
      { key: 'fastPeriod', label: 'EMA Rápida', type: 'number', default: 12, min: 1, max: 100 },
      { key: 'slowPeriod', label: 'EMA Lenta', type: 'number', default: 26, min: 2, max: 200 },
      { key: 'signalPeriod', label: 'Sinal', type: 'number', default: 9, min: 1, max: 50 },
      {
        key: 'barMode',
        label: 'Modo de Execução das Barras',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' },
          { label: '⚡ Barra em Tempo Real (Candle Aberto)', value: 'realtime' }
        ]
      },
      { key: 'showDivergence', label: 'Marcar Divergências', type: 'boolean', default: true },
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
      { key: 'divergenceConfirmationBars', label: 'Barras de Confirmação (Anti-Repaint)', type: 'number', default: 2, min: 1, max: 5 },
      { key: 'divergenceOnlyClosedBars', label: 'Apenas Barra Fechada (Não Repintar)', type: 'boolean', default: true },
      { key: 'divergenceMinBars', label: 'Distância Mínima (Barras)', type: 'number', default: 5, min: 3, max: 20 },
      { key: 'divergenceLookback', label: 'Lookback Máximo (Barras)', type: 'number', default: 60, min: 10, max: 120 },
      { key: 'showDivergenceOnPrice', label: 'Marcar no Gráfico de Preços', type: 'boolean', default: true }
    ],
    defaultStyle: { color: '#3b82f6', lineWidth: 2, lineStyle: 'solid', secondaryColor: '#f97316' }
  },
  EMACD: {
    type: 'EMACD',
    name: 'e-MACD / MACD Explosion (Impulso Institucional)',
    category: 'Osciladores',
    description: 'Indicador institucional de explosão de volatilidade e zonas mortas no sub-painel.',
    overlay: false,
    paramDefs: [
      { key: 'fastPeriod', label: 'Rápida', type: 'number', default: 12, min: 1, max: 100 },
      { key: 'slowPeriod', label: 'Lenta', type: 'number', default: 26, min: 2, max: 200 },
      { key: 'signalPeriod', label: 'Sinal', type: 'number', default: 9, min: 1, max: 50 },
      {
        key: 'barMode',
        label: 'Modo de Execução das Barras',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' },
          { label: '⚡ Barra em Tempo Real (Candle Aberto)', value: 'realtime' }
        ]
      }
    ],
    defaultStyle: { color: '#3b82f6', lineWidth: 2, lineStyle: 'solid', secondaryColor: '#eab308' }
  },
  ElliottWaves: {
    type: 'ElliottWaves',
    name: 'Ondas de Elliott Automáticas (1-2-3-4-5 & A-B-C)',
    category: 'SMC',
    description: 'Mapeamento automático de ciclos de ondas impulsivas (1 a 5) e corretivas (A, B, C) via pivôs de mercado.',
    overlay: true,
    paramDefs: [
      { key: 'deviation', label: 'Sensibilidade Pivô (%)', type: 'number', default: 1.5, min: 0.2, max: 10, step: 0.1 },
      {
        key: 'barMode',
        label: 'Cálculo de Barra',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' },
          { label: '⚡ Barra em Tempo Real (Candle Aberto)', value: 'realtime' }
        ]
      }
    ],
    defaultStyle: { color: '#38bdf8', lineWidth: 2, lineStyle: 'solid', secondaryColor: '#f43f5e' }
  },
  SMC_OB: {
    type: 'SMC_OB',
    name: 'SMC - Order Blocks (Demand & Supply)',
    category: 'SMC',
    description: 'Blocos de ordens institucionais de compra (Demand) e venda (Supply) não mitigados.',
    overlay: true,
    paramDefs: [
      { key: 'lookback', label: 'Velas de Análise', type: 'number', default: 100, min: 20, max: 500 },
      {
        key: 'barMode',
        label: 'Cálculo de Barra',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' },
          { label: '⚡ Barra em Tempo Real (Candle Aberto)', value: 'realtime' }
        ]
      }
    ],
    defaultStyle: { color: '#22c55e', lineWidth: 1, lineStyle: 'solid', secondaryColor: '#ef4444' }
  },
  SMC_BOS_CHOCH: {
    type: 'SMC_BOS_CHOCH',
    name: 'SMC - Break of Structure (BOS) & CHoCH',
    category: 'SMC',
    description: 'Identificação de quebra de estrutura (BOS) e mudança de caráter (CHoCH).',
    overlay: true,
    paramDefs: [
      { key: 'swingLength', label: 'Comprimento Swing', type: 'number', default: 5, min: 2, max: 20 },
      {
        key: 'barMode',
        label: 'Cálculo de Barra',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' },
          { label: '⚡ Barra em Tempo Real (Candle Aberto)', value: 'realtime' }
        ]
      }
    ],
    defaultStyle: { color: '#06b6d4', lineWidth: 1, lineStyle: 'dashed', secondaryColor: '#a855f7' }
  },
  SMC_Liquidity: {
    type: 'SMC_Liquidity',
    name: 'SMC - Liquidity Pools (EQH / EQL)',
    category: 'SMC',
    description: 'Detecção de topos iguais (Equal Highs) e fundos iguais (Equal Lows) onde há acúmulo de liquidez.',
    overlay: true,
    paramDefs: [
      { key: 'thresholdTicks', label: 'Tolerância (Ticks)', type: 'number', default: 3, min: 0, max: 20 },
      {
        key: 'barMode',
        label: 'Cálculo de Barra',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' },
          { label: '⚡ Barra em Tempo Real (Candle Aberto)', value: 'realtime' }
        ]
      }
    ],
    defaultStyle: { color: '#eab308', lineWidth: 1, lineStyle: 'dotted' }
  },
  VWAP: {
    type: 'VWAP',
    name: 'VWAP Diária (Volume Weighted Average Price)',
    category: 'Volume',
    description: 'Preço médio ponderado por volume reiniciado a cada início de sessão intradiária configurada.',
    overlay: true,
    paramDefs: [
      {
        key: 'resetMode',
        label: 'Reinício de Sessão',
        type: 'select',
        default: 'session_1900',
        options: [
          { label: 'Início de Sessão Global (Configuração do Sistema)', value: 'session_1900' },
          { label: 'Início de Sessão Global (18:00 BRT / 17:00 EST)', value: 'session_1800' },
          { label: 'Abertura RTH Nova York (09:30 EST)', value: 'session_0930' },
          { label: 'Novo Dia Calendário (00:00 UTC)', value: 'daily_utc' },
          { label: 'Horário Personalizado (Definir abaixo)', value: 'custom' }
        ]
      },
      { key: 'sessionStart', label: 'Horário de Início (HH:MM)', type: 'string', default: '19:00' },
      {
        key: 'barMode',
        label: 'Cálculo de Barra',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' },
          { label: '⚡ Barra em Tempo Real (Candle Aberto)', value: 'realtime' }
        ]
      }
    ],
    defaultStyle: { color: '#e11d48', lineWidth: 2, lineStyle: 'solid', secondaryColor: '#fb7185' }
  },
  LEVELS_GAMMA: {
    type: 'LEVELS_GAMMA',
    name: 'Níveis 1: Gamma & Volatilidade (HVL, GWall, HVL0)',
    category: 'Níveis',
    description: 'Pivots centrais de volatilidade, transição de regime e Gamma Wall institucional (HVL, GWall, HVL0).',
    overlay: true,
    paramDefs: [
      { key: 'showHvl', label: 'Exibir HVL (Pivot Gamma Principal)', type: 'boolean', default: true },
      { key: 'showGwall', label: 'Exibir GWall (Gamma Wall Principal)', type: 'boolean', default: true },
      { key: 'showHvl0', label: 'Exibir HVL0 (HVL Intradiário Strike 0)', type: 'boolean', default: true }
    ],
    defaultStyle: { color: '#a855f7', lineWidth: 1, lineStyle: 'dashed' }
  },
  LEVELS_OPTIONS: {
    type: 'LEVELS_OPTIONS',
    name: 'Níveis 2: Barreiras de Opções (Call & Put Walls)',
    category: 'Níveis',
    description: 'Zonas de maior concentração de contratos de Opções (Call Wall, Put Wall, Call0, Put0).',
    overlay: true,
    paramDefs: [
      { key: 'showCall', label: 'Exibir Call Wall Principal', type: 'boolean', default: true },
      { key: 'showPut', label: 'Exibir Put Wall Principal', type: 'boolean', default: true },
      { key: 'showCall0', label: 'Exibir Call0 Intradiária (Strike 0)', type: 'boolean', default: true },
      { key: 'showPut0', label: 'Exibir Put0 Intradiária (Strike 0)', type: 'boolean', default: true }
    ],
    defaultStyle: { color: '#ef4444', lineWidth: 1, lineStyle: 'dashed', secondaryColor: '#22c55e' }
  },
  LEVELS_DAILY: {
    type: 'LEVELS_DAILY',
    name: 'Níveis 3: Pregão & Referências Diárias (Max, Min, Ajuste)',
    category: 'Níveis',
    description: 'Projeções de amplitude diária, preço de ajuste e extremas da sessão anterior (Max, Min, Ajuste, MxAnt, MnAnt).',
    overlay: true,
    paramDefs: [
      { key: 'showMax1d', label: 'Exibir Máxima Projetada (Max)', type: 'boolean', default: true },
      { key: 'showMin1d', label: 'Exibir Mínima Projetada (Min)', type: 'boolean', default: true },
      { key: 'showPrev', label: 'Exibir Preço de Ajuste / Fechamento', type: 'boolean', default: true },
      { key: 'showPrevH', label: 'Exibir Máxima Anterior (MxAnt)', type: 'boolean', default: true },
      { key: 'showPrevL', label: 'Exibir Mínima Anterior (MnAnt)', type: 'boolean', default: true }
    ],
    defaultStyle: { color: '#06b6d4', lineWidth: 1, lineStyle: 'dashed', secondaryColor: '#eab308' }
  },
  LEVELS_LIQUIDITY: {
    type: 'LEVELS_LIQUIDITY',
    name: 'Níveis 4: Liquidez & Exposição (BL e GEX Dinâmicos)',
    category: 'Níveis',
    description: 'Camadas de ordens de compra institucional (BL1..BL10) e níveis de exposição Gamma (GEX1..GEX10).',
    overlay: true,
    paramDefs: [
      { key: 'showBl', label: 'Exibir Grupo BL (Níveis de Compra)', type: 'boolean', default: true },
      { key: 'showBl1', label: 'BL 1', type: 'boolean', default: true },
      { key: 'showBl2', label: 'BL 2', type: 'boolean', default: true },
      { key: 'showBl3', label: 'BL 3', type: 'boolean', default: true },
      { key: 'showBl4', label: 'BL 4', type: 'boolean', default: true },
      { key: 'showBl5', label: 'BL 5', type: 'boolean', default: true },
      { key: 'showBl6', label: 'BL 6', type: 'boolean', default: true },
      { key: 'showBl7', label: 'BL 7', type: 'boolean', default: true },
      { key: 'showBl8', label: 'BL 8', type: 'boolean', default: true },
      { key: 'showBl9', label: 'BL 9', type: 'boolean', default: true },
      { key: 'showBl10', label: 'BL 10', type: 'boolean', default: true },
      { key: 'showGex', label: 'Exibir Grupo GEX (Exposição Gamma)', type: 'boolean', default: true },
      { key: 'showGex1', label: 'GEX 1', type: 'boolean', default: true },
      { key: 'showGex2', label: 'GEX 2', type: 'boolean', default: true },
      { key: 'showGex3', label: 'GEX 3', type: 'boolean', default: true },
      { key: 'showGex4', label: 'GEX 4', type: 'boolean', default: true },
      { key: 'showGex5', label: 'GEX 5', type: 'boolean', default: true },
      { key: 'showGex6', label: 'GEX 6', type: 'boolean', default: true },
      { key: 'showGex7', label: 'GEX 7', type: 'boolean', default: true },
      { key: 'showGex8', label: 'GEX 8', type: 'boolean', default: true },
      { key: 'showGex9', label: 'GEX 9', type: 'boolean', default: true },
      { key: 'showGex10', label: 'GEX 10', type: 'boolean', default: true }
    ],
    defaultStyle: { color: '#3b82f6', lineWidth: 1, lineStyle: 'dashed', secondaryColor: '#a855f7' }
  },
  LEVELS_SESSION_PERCENT: {
    type: 'LEVELS_SESSION_PERCENT',
    name: 'Níveis 5: Percentuais de Abertura da Sessão',
    category: 'Níveis',
    description: 'Traça a linha central da abertura da sessão e projeta até 5 níveis percentuais de alta e baixa.',
    overlay: true,
    paramDefs: [
      { key: 'sessionStart', label: 'Horário de Abertura (HH:MM)', type: 'string', default: '09:00' },
      { key: 'stepPercent', label: 'Passo Percentual (% por nível)', type: 'number', default: 0.5, min: 0.05, max: 20, step: 0.05 },
      { key: 'showCenter', label: 'Exibir Linha Central (Abertura 0.0%)', type: 'boolean', default: true },
      { key: 'showUpper1', label: 'Exibir Nível Alta +1 (+1x Passo)', type: 'boolean', default: true },
      { key: 'showUpper2', label: 'Exibir Nível Alta +2 (+2x Passo)', type: 'boolean', default: true },
      { key: 'showUpper3', label: 'Exibir Nível Alta +3 (+3x Passo)', type: 'boolean', default: true },
      { key: 'showUpper4', label: 'Exibir Nível Alta +4 (+4x Passo)', type: 'boolean', default: false },
      { key: 'showUpper5', label: 'Exibir Nível Alta +5 (+5x Passo)', type: 'boolean', default: false },
      { key: 'showLower1', label: 'Exibir Nível Baixa -1 (-1x Passo)', type: 'boolean', default: true },
      { key: 'showLower2', label: 'Exibir Nível Baixa -2 (-2x Passo)', type: 'boolean', default: true },
      { key: 'showLower3', label: 'Exibir Nível Baixa -3 (-3x Passo)', type: 'boolean', default: true },
      { key: 'showLower4', label: 'Exibir Nível Baixa -4 (-4x Passo)', type: 'boolean', default: false },
      { key: 'showLower5', label: 'Exibir Nível Baixa -5 (-5x Passo)', type: 'boolean', default: false }
    ],
    defaultStyle: { color: '#22c55e', lineWidth: 1, lineStyle: 'dashed', secondaryColor: '#ef4444' }
  },
  LEVELS_TIME_RANGE: {
    type: 'LEVELS_TIME_RANGE',
    name: 'Níveis 6: Faixa de Máxima & Mínima por Horário',
    category: 'Níveis',
    description: 'Calcula e projeta a Máxima, Mínima e Ponto Médio formados no intervalo de horário personalizado ou durante toda a sessão operacional.',
    overlay: true,
    paramDefs: [
      {
        key: 'sessionMode',
        label: 'Modo de Horário',
        type: 'select',
        default: 'custom',
        options: [
          { label: 'Personalizar Horário (Definir HH:MM)', value: 'custom' },
          { label: 'Toda a Sessão (Sessão Operacional do Sistema - 19h às 18h)', value: 'all' }
        ]
      },
      {
        key: 'useFullSession',
        label: 'Marcar Toda a Sessão (19h às 18h)',
        type: 'boolean',
        default: false
      },
      { key: 'startTime', label: 'Horário Inicial (HH:MM)', type: 'string', default: '09:00' },
      { key: 'endTime', label: 'Horário Final Range (HH:MM)', type: 'string', default: '09:30' },
      { key: 'sessionEnd', label: 'Fim da Sessão / Desarme (HH:MM)', type: 'string', default: '18:00' },
      { key: 'showHigh', label: 'Exibir Máxima do Período', type: 'boolean', default: true },
      { key: 'showLow', label: 'Exibir Mínima do Período', type: 'boolean', default: true },
      { key: 'showMid', label: 'Exibir Ponto Médio (50% do Range)', type: 'boolean', default: true },
      { key: 'extendSession', label: 'Estender Linhas até o Fim da Sessão', type: 'boolean', default: true }
    ],
    defaultStyle: { color: '#06b6d4', lineWidth: 2, lineStyle: 'solid', secondaryColor: '#f97316' }
  },
  GammaLevels: {
    type: 'GammaLevels',
    name: 'Níveis Gamma Completos (Legado)',
    category: 'Níveis',
    description: 'Exibe todas as linhas de Suporte e Resistência Gamma calculadas pelo motor institucional.',
    overlay: true,
    paramDefs: [],
    defaultStyle: { color: '#a855f7', lineWidth: 1, lineStyle: 'solid' }
  },
  PVA: {
    type: 'PVA',
    name: 'Volume Anômalo / PVA',
    category: 'Volume',
    description: 'Destaca barras com volume institucional anômalo no gráfico.',
    overlay: true,
    paramDefs: [],
    defaultStyle: { color: '#38bdf8', lineWidth: 1, lineStyle: 'solid' }
  },
  FVG: {
    type: 'FVG',
    name: 'Fair Value Gaps (FVG)',
    category: 'SMC',
    description: 'Identifica desequilíbrios de preço (Gaps de Valor Justo) no gráfico.',
    overlay: true,
    paramDefs: [
      {
        key: 'barMode',
        label: 'Cálculo de Barra',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' },
          { label: '⚡ Barra em Tempo Real (Candle Aberto)', value: 'realtime' }
        ]
      }
    ],
    defaultStyle: { color: '#eab308', lineWidth: 1, lineStyle: 'solid' }
  },
  VOLUME_HEATMAP: {
    type: 'VOLUME_HEATMAP',
    name: 'Zonas de Calor de Volume (Heatmap do Fundo)',
    category: 'Volume',
    description: 'Renderiza zonas térmicas translúcidas no fundo do gráfico baseadas na densidade de volume por nível de preço da sessão anterior.',
    overlay: true,
    paramDefs: [
      {
        key: 'sessionMode',
        label: 'Modo de Análise',
        type: 'select',
        default: 'all',
        options: [
          { label: 'Analisar Toda a Sessão (24h)', value: 'all' },
          { label: 'Horário Personalizado (Definir HH:MM)', value: 'custom' },
          { label: 'Últimas X Velas (Timeframe Atual)', value: 'bars' }
        ]
      },
      { key: 'lookbackBars', label: 'Quantidade de Velas (Timeframe Atual)', type: 'number', default: 30, min: 3, max: 500, step: 1 },
      { key: 'customStart', label: 'Horário Início (HH:MM)', type: 'string', default: '09:00' },
      { key: 'customEnd', label: 'Horário Fim (HH:MM)', type: 'string', default: '18:00' },
      { key: 'lookbackDays', label: 'Dias de Histórico (Lookback)', type: 'number', default: 1, min: 1, max: 5 },
      { key: 'binsCount', label: 'Resolução (Nº de Faixas)', type: 'number', default: 50, min: 20, max: 120, step: 5 },
      { key: 'maxOpacity', label: 'Opacidade Máxima (%)', type: 'number', default: 22, min: 5, max: 60, step: 1 },
      {
        key: 'colorTheme',
        label: 'Tema Térmico',
        type: 'select',
        default: 'cyberpunk',
        options: [
          { label: 'Cyberpunk (Ciano → Magenta)', value: 'cyberpunk' },
          { label: 'Fogo / Térmico (Âmbar → Laranja → Vermelho)', value: 'fire' },
          { label: 'Plasma Institucional (Azul → Roxo → Amarelo)', value: 'plasma' },
          { label: 'Matrix Neon (Verde Gradiente)', value: 'matrix' }
        ]
      },
      { key: 'minThreshold', label: 'Filtro Mínimo de Relevância (%)', type: 'number', default: 10, min: 0, max: 50, step: 5 }
    ],
    defaultStyle: { color: '#06b6d4', lineWidth: 1, lineStyle: 'solid', secondaryColor: '#ec4899' }
  },
  VOLUME_LEVELS: {
    type: 'VOLUME_LEVELS',
    name: 'Níveis de Volume Institucional (VPOC / VAH / VAL / Naked POC)',
    category: 'Volume',
    description: 'Projeta no pregão atual as linhas de VPOC, VAH e VAL (por sessão, horário ou últimas X velas do timeframe atual) e as POCs Virgens (Naked POCs) não testadas.',
    overlay: true,
    paramDefs: [
      {
        key: 'sessionMode',
        label: 'Modo de Análise',
        type: 'select',
        default: 'all',
        options: [
          { label: 'Analisar Toda a Sessão (24h)', value: 'all' },
          { label: 'Horário Personalizado (Definir HH:MM)', value: 'custom' },
          { label: 'Últimas X Velas (Timeframe Atual)', value: 'bars' }
        ]
      },
      { key: 'lookbackBars', label: 'Quantidade de Velas (Timeframe Atual)', type: 'number', default: 30, min: 3, max: 500, step: 1 },
      { key: 'customStart', label: 'Horário Início (HH:MM)', type: 'string', default: '09:00' },
      { key: 'customEnd', label: 'Horário Fim (HH:MM)', type: 'string', default: '18:00' },
      { key: 'lookbackDays', label: 'Dias de Histórico (Lookback)', type: 'number', default: 1, min: 1, max: 5 },
      { key: 'valueAreaPct', label: 'Percentual da Value Area (%)', type: 'number', default: 70, min: 50, max: 90, step: 5 },
      { key: 'showPoc', label: 'Exibir Linha do VPOC', type: 'boolean', default: true },
      { key: 'showVahVal', label: 'Exibir Linhas de VAH & VAL', type: 'boolean', default: true },
      { key: 'showNakedPocs', label: 'Exibir Naked POCs (Virgens)', type: 'boolean', default: true }
    ],
    defaultStyle: { color: '#f59e0b', lineWidth: 2, lineStyle: 'solid', secondaryColor: '#06b6d4', fillColor: '#a855f7' }
  },
  VOLUME_HVN_BLOCKS: {
    type: 'VOLUME_HVN_BLOCKS',
    name: 'Blocos de Absorção & HVN (High Volume Nodes)',
    category: 'Volume',
    description: 'Identifica os principais picos de volume (por sessão, horário ou últimas X velas do timeframe atual) e renderiza caixas de liquidez/absorção institucional.',
    overlay: true,
    paramDefs: [
      {
        key: 'sessionMode',
        label: 'Modo de Análise',
        type: 'select',
        default: 'all',
        options: [
          { label: 'Analisar Toda a Sessão (24h)', value: 'all' },
          { label: 'Horário Personalizado (Definir HH:MM)', value: 'custom' },
          { label: 'Últimas X Velas (Timeframe Atual)', value: 'bars' }
        ]
      },
      { key: 'lookbackBars', label: 'Quantidade de Velas (Timeframe Atual)', type: 'number', default: 30, min: 3, max: 500, step: 1 },
      { key: 'customStart', label: 'Horário Início (HH:MM)', type: 'string', default: '09:00' },
      { key: 'customEnd', label: 'Horário Fim (HH:MM)', type: 'string', default: '18:00' },
      { key: 'lookbackDays', label: 'Dias de Histórico (Lookback)', type: 'number', default: 1, min: 1, max: 5 },
      { key: 'topNodesCount', label: 'Quantidade de Blocos (Top Nodes)', type: 'number', default: 3, min: 1, max: 6, step: 1 },
      { key: 'blockThicknessPct', label: 'Espessura do Bloco (%)', type: 'number', default: 0.5, min: 0.1, max: 2.0, step: 0.1 },
      { key: 'blockOpacity', label: 'Opacidade do Bloco (%)', type: 'number', default: 25, min: 5, max: 60, step: 5 }
    ],
    defaultStyle: { color: '#3b82f6', lineWidth: 1, lineStyle: 'solid', fillColor: '#3b82f633' }
  },
  VOLUME_SPIKE_PIVOTS: {
    type: 'VOLUME_SPIKE_PIVOTS',
    name: 'Volume Spike Pivots',
    category: 'Volume',
    description: 'Detecta pivôs formados em velas com volume acima da média (Spikes) e projeta níveis horizontais de suporte e resistência até o rompimento.',
    overlay: true,
    paramDefs: [
      { key: 'barsToCheck', label: 'Janela de Barras (Bars to Check)', type: 'number', default: 5, min: 3, max: 100, step: 1 },
      { key: 'volumeAveragePeriod', label: 'Período Média Volume (SMA)', type: 'number', default: 20, min: 1, max: 500, step: 1 },
      { key: 'volumeMultiple', label: 'Multiplicador de Volume', type: 'number', default: 1.5, min: 1.0, max: 10.0, step: 0.1 },
      { key: 'maxHistoryPivots', label: 'Máx. Níveis no Gráfico', type: 'number', default: 100, min: 5, max: 300, step: 5 },
      { key: 'showBreachedLines', label: 'Exibir Níveis Rompidos', type: 'boolean', default: true },
      { key: 'showMarkers', label: 'Exibir Rótulos nos Candles', type: 'boolean', default: false }
    ],
    defaultStyle: { color: '#22c55e', secondaryColor: '#ef4444', lineWidth: 2, lineStyle: 'solid' }
  },
  TIME_HEATMAP: {
    type: 'TIME_HEATMAP',
    name: 'Time Heatmap',
    category: 'Volatilidade',
    description: 'Mapeia zonas de calor intradiárias de volatilidade, volume relativo (RVOL) e tendência por horários em relação à média histórica dos últimos dias com auto-ajuste ao timeframe.',
    overlay: false,
    paramDefs: [
      { key: 'lookbackDays', label: 'Dias de Histórico (Lookback)', type: 'number', default: 10, min: 1, max: 60, step: 1 },
      {
        key: 'scope',
        label: 'Escopo de Horário',
        type: 'select',
        default: 'custom_window',
        options: [
          { label: 'Faixa de Horário Específica', value: 'custom_window' },
          { label: 'Toda a Sessão (Dia Completo)', value: 'all_session' }
        ]
      },
      { key: 'startTime', label: 'Horário Inicial (HH:MM)', type: 'string', default: '09:30' },
      { key: 'endTime', label: 'Horário Final (HH:MM)', type: 'string', default: '12:30' },
      {
        key: 'heatMode',
        label: 'Modo de Análise Térmica',
        type: 'select',
        default: 'trend_volume',
        options: [
          { label: 'Volume de Tendência (Volume + Range + Direção)', value: 'trend_volume' },
          { label: 'Volatilidade de Range (Expansão Máx/Mín)', value: 'volatility_range' },
          { label: 'Volume Relativo por Horário (RVOL-T)', value: 'relative_volume' }
        ]
      },
      { key: 'hotThreshold', label: 'Gatilho de Zona Quente (Score 0-100)', type: 'number', default: 70, min: 40, max: 95, step: 5 },
      { key: 'showVerticalLines', label: 'Exibir Linhas Verticais de Região no Gráfico', type: 'boolean', default: true },
      { key: 'showGhostCandles', label: 'Exibir Velas Fantasma de Projeção', type: 'boolean', default: true },
      { key: 'forecastCandlesCount', label: 'Qtd. Velas de Projeção no Gráfico', type: 'number', default: 5, min: 1, max: 100, step: 1 },
      { key: 'showForecastBadge', label: 'Exibir Card de Probabilidade ao Lado do Preço', type: 'boolean', default: true },
      { key: 'showExpansionCorridor', label: 'Exibir Corredor de Volatilidade Projetada', type: 'boolean', default: true }
    ],
    defaultStyle: { color: '#f97316', secondaryColor: '#ef4444', lineWidth: 2, lineStyle: 'solid' }
  },
  CANDLE_PATTERNS: {
    type: 'CANDLE_PATTERNS',
    name: 'Padrões de Candlestick',
    category: 'Tendência',
    description: 'Detecta padrões de reversão e continuidade: Engolfo (E), Pinbar (P), Bull/Bear 180 (B), Estrela de Reversão / 3 Candles (3) e Chute / Kicking (C).',
    overlay: true,
    paramDefs: [
      // 1. Engolfo
      { key: 'showEngolfo', label: 'Engolfo (E)', type: 'boolean', default: true },
      { key: 'minPointsEngolfo', label: 'Mínimo de Pontos - Engolfo', type: 'number', default: 0, min: 0, max: 1000, step: 0.5 },
      {
        key: 'barModeEngolfo',
        label: 'Modo de Execução - Engolfo',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' }
        ]
      },
      {
        key: 'soundEngolfo',
        label: 'Alerta Sonoro - Engolfo',
        type: 'select',
        default: 'none',
        options: [
          { label: '🔇 Sem Som', value: 'none' },
          { label: '🔔 Padrão Axion (Beep 440Hz)', value: 'default_axion' },
          { label: '✨ Chime Cristalino (900Hz Suave)', value: 'crystal_chime' },
          { label: '⚡ Pulso Cyberpunk (Bip Duplo 650Hz)', value: 'cyber_pulse' },
          { label: '🔮 Gongo Zen (320Hz Ressonante)', value: 'zen_gong' },
          { label: '🚀 Alerta Radar (Acorde Tríade 520Hz)', value: 'radar_ping' }
        ]
      },

      // 2. Pinbar
      { key: 'showPinbar', label: 'Pinbar / Martelo / Shooting Star (P)', type: 'boolean', default: true },
      { key: 'minPointsPinbar', label: 'Mínimo de Pontos - Pinbar', type: 'number', default: 0, min: 0, max: 1000, step: 0.5 },
      {
        key: 'barModePinbar',
        label: 'Modo de Execução - Pinbar',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' }
        ]
      },
      {
        key: 'soundPinbar',
        label: 'Alerta Sonoro - Pinbar',
        type: 'select',
        default: 'none',
        options: [
          { label: '🔇 Sem Som', value: 'none' },
          { label: '🔔 Padrão Axion (Beep 440Hz)', value: 'default_axion' },
          { label: '✨ Chime Cristalino (900Hz Suave)', value: 'crystal_chime' },
          { label: '⚡ Pulso Cyberpunk (Bip Duplo 650Hz)', value: 'cyber_pulse' },
          { label: '🔮 Gongo Zen (320Hz Ressonante)', value: 'zen_gong' },
          { label: '🚀 Alerta Radar (Acorde Tríade 520Hz)', value: 'radar_ping' }
        ]
      },

      // 3. Bull 180 / Bear 180 (Com opção de barra real opcional)
      { key: 'showPattern180', label: 'Bull 180 / Bear 180 (B)', type: 'boolean', default: true },
      { key: 'minPoints180', label: 'Mínimo de Pontos - Candle 2 (Bull/Bear 180)', type: 'number', default: 0, min: 0, max: 1000, step: 0.5 },
      {
        key: 'barMode180',
        label: 'Modo de Execução - Bull/Bear 180',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada', value: 'closed' },
          { label: '⚡ Barra em Tempo Real (Candle Aberto)', value: 'realtime' }
        ]
      },
      {
        key: 'sound180',
        label: 'Alerta Sonoro - Bull/Bear 180',
        type: 'select',
        default: 'none',
        options: [
          { label: '🔇 Sem Som', value: 'none' },
          { label: '🔔 Padrão Axion (Beep 440Hz)', value: 'default_axion' },
          { label: '✨ Chime Cristalino (900Hz Suave)', value: 'crystal_chime' },
          { label: '⚡ Pulso Cyberpunk (Bip Duplo 650Hz)', value: 'cyber_pulse' },
          { label: '🔮 Gongo Zen (320Hz Ressonante)', value: 'zen_gong' },
          { label: '🚀 Alerta Radar (Acorde Tríade 520Hz)', value: 'radar_ping' }
        ]
      },

      // 4. Estrela de Reversão / 3 Candles
      { key: 'showStar3Candles', label: 'Estrela de Reversão / 3 Candles (3)', type: 'boolean', default: true },
      { key: 'minPointsStar3', label: 'Mínimo de Pontos - Estrela 3 Candles', type: 'number', default: 0, min: 0, max: 1000, step: 0.5 },
      {
        key: 'barModeStar3',
        label: 'Modo de Execução - Estrela 3 Candles',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' }
        ]
      },
      {
        key: 'soundStar3',
        label: 'Alerta Sonoro - Estrela 3 Candles',
        type: 'select',
        default: 'none',
        options: [
          { label: '🔇 Sem Som', value: 'none' },
          { label: '🔔 Padrão Axion (Beep 440Hz)', value: 'default_axion' },
          { label: '✨ Chime Cristalino (900Hz Suave)', value: 'crystal_chime' },
          { label: '⚡ Pulso Cyberpunk (Bip Duplo 650Hz)', value: 'cyber_pulse' },
          { label: '🔮 Gongo Zen (320Hz Ressonante)', value: 'zen_gong' },
          { label: '🚀 Alerta Radar (Acorde Tríade 520Hz)', value: 'radar_ping' }
        ]
      },

      // 5. Chute / Kicking
      { key: 'showChute', label: 'Chute / Kicking (C)', type: 'boolean', default: true },
      { key: 'minPointsChute', label: 'Mínimo de Pontos - Chute', type: 'number', default: 0, min: 0, max: 1000, step: 0.5 },
      {
        key: 'barModeChute',
        label: 'Modo de Execução - Chute',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' }
        ]
      },
      {
        key: 'soundChute',
        label: 'Alerta Sonoro - Chute',
        type: 'select',
        default: 'none',
        options: [
          { label: '🔇 Sem Som', value: 'none' },
          { label: '🔔 Padrão Axion (Beep 440Hz)', value: 'default_axion' },
          { label: '✨ Chime Cristalino (900Hz Suave)', value: 'crystal_chime' },
          { label: '⚡ Pulso Cyberpunk (Bip Duplo 650Hz)', value: 'cyber_pulse' },
          { label: '🔮 Gongo Zen (320Hz Ressonante)', value: 'zen_gong' },
          { label: '🚀 Alerta Radar (Acorde Tríade 520Hz)', value: 'radar_ping' }
        ]
      }
    ],
    defaultStyle: { color: '#22c55e', secondaryColor: '#ef4444', lineWidth: 1, lineStyle: 'solid' }
  },
  AXION_ML_PREDICTOR: {
    type: 'AXION_ML_PREDICTOR',
    name: '🧠 Axion ML Predictor NQ (+25/-12)',
    category: 'ALGORITMOS',
    description: 'Sistema preditivo institucional treinado em Machine Learning (LightGBM). Identifica movimentos estatísticos de +25 pontos de TP e -12 pontos de SL com filtros de risco e radar visual de pré-formação.',
    overlay: true,
    paramDefs: [
      {
        key: 'selectedModel',
        label: '🧠 Remodelagem / Modelo Ativo',
        type: 'select',
        default: 'auto',
        options: [
          { label: '🤖 Auto (Estudo Mais Recente do Ativo)', value: 'auto' },
          { label: '⚙️ Axion Padrão Institucional (+25/-12)', value: 'default_v1' }
        ]
      },
      {
        key: 'thresholdCompra',
        label: 'Gatilho Probabilidade Compra (Long)',
        type: 'number',
        default: 0.35,
        min: 0.28,
        max: 0.50,
        step: 0.01
      },
      {
        key: 'thresholdVenda',
        label: 'Gatilho Probabilidade Venda (Short)',
        type: 'number',
        default: 0.35,
        min: 0.28,
        max: 0.50,
        step: 0.01
      },
      {
        key: 'armingThreshold',
        label: 'Radar Pré-Sinal Compra (Long)',
        type: 'number',
        default: 0.325,
        min: 0.25,
        max: 0.45,
        step: 0.01
      },
      {
        key: 'armingThresholdVenda',
        label: 'Radar Pré-Sinal Venda (Short)',
        type: 'number',
        default: 0.325,
        min: 0.25,
        max: 0.45,
        step: 0.01
      },
      {
        key: 'minAtr14',
        label: 'Filtro Volatilidade Mínima (ATR 14)',
        type: 'number',
        default: 8.0,
        min: 2.0,
        max: 30.0,
        step: 0.5
      },
      {
        key: 'maxDistSma60',
        label: 'Filtro Distância Máx. SMA 60',
        type: 'number',
        default: 80.0,
        min: 20.0,
        max: 200.0,
        step: 5.0
      },
      {
        key: 'filterRth',
        label: 'Filtro Horário RTH (Desmarque para operar 24h / Madrugada)',
        type: 'boolean',
        default: false
      },
      {
        key: 'showTargets',
        label: 'Projetar Linhas TP (+25) e SL (-12)',
        type: 'boolean',
        default: true
      },
      {
        key: 'showFloatingHud',
        label: 'Exibir Painel HUD Radar Flutuante',
        type: 'boolean',
        default: true
      },
      {
        key: 'alternateSignals',
        label: 'Alternar Sinais (Não repetir mesmo lado)',
        type: 'boolean',
        default: true
      },
      {
        key: 'minCooldownBars',
        label: 'Intervalo Mínimo entre Sinais (Barras)',
        type: 'number',
        default: 5,
        min: 1,
        max: 30,
        step: 1
      },
      {
        key: 'labelStyle',
        label: 'Estilo do Texto do Marcador',
        type: 'select',
        default: 'percentage_only',
        options: [
          { label: '🎯 Apenas Percentual (36%)', value: 'percentage_only' },
          { label: '🏷️ Completo (ML COMPRA 36%)', value: 'full' },
          { label: '🔕 Apenas Seta (Sem Texto)', value: 'arrow_only' }
        ]
      },
      {
        key: 'barMode',
        label: 'Modo de Execução',
        type: 'select',
        default: 'realtime',
        options: [
          { label: '⚡ Barra em Formação (Radar Realtime)', value: 'realtime' },
          { label: '🔒 Barra Fechada (Confirmação)', value: 'closed' }
        ]
      },
      {
        key: 'soundSignal',
        label: 'Alerta Sonoro de Sinal Confirmado',
        type: 'select',
        default: 'cyber_pulse',
        options: [
          { label: '🔇 Sem Som', value: 'none' },
          { label: '🔔 Padrão Axion (Beep 440Hz)', value: 'default_axion' },
          { label: '⚡ Pulso Cyberpunk (Bip Duplo 650Hz)', value: 'cyber_pulse' },
          { label: '🚀 Alerta Radar (Acorde Tríade 520Hz)', value: 'radar_ping' }
        ]
      }
    ],
    defaultStyle: { color: '#10b981', secondaryColor: '#ef4444', lineWidth: 2, lineStyle: 'solid' }
  },
  WYCKOFF_STRUCTURAL_SWEEPS: {
    type: 'WYCKOFF_STRUCTURAL_SWEEPS',
    name: '⚡ Wyckoff Structural Sweeps & Reclaim',
    category: 'ALGORITMOS',
    description: 'Rastreador estrutural institucional de Trading Ranges (Caixotes), Rompimentos Falsos (Spring / Sweeps de Liquidez) e Absorção Reclaim. Sincronizado com os modelos e alvos TP/SL da Central Quantitativa (ABA 3).',
    overlay: true,
    paramDefs: [
      {
        key: 'selectedModel',
        label: '⚡ Estudo Estrutural Vinculado',
        type: 'select',
        default: 'auto',
        options: [
          { label: '🤖 Auto (Estudo Estrutural Mais Recente)', value: 'auto' }
        ]
      },
      {
        key: 'direction',
        label: 'Direção Operacional',
        type: 'select',
        default: 'both',
        options: [
          { label: '🔄 Ambos (Compra no Spring & Venda no Upthrust)', value: 'both' },
          { label: '🟢 Apenas Compra (Spring / Piso)', value: 'buy_only' },
          { label: '🔴 Apenas Venda (Upthrust / Teto)', value: 'sell_only' }
        ]
      },
      {
        key: 'showRanges',
        label: '📦 Desenhar Caixote Ativo (Qtd. Velas e Tamanho em Pts)',
        type: 'boolean',
        default: true
      },
      {
        key: 'requireGammaConfluence',
        label: 'Filtrar Confluência Institucional (0DTE / HVL / GEX)',
        type: 'boolean',
        default: false
      },
      {
        key: 'showReclaims',
        label: 'Exibir Sinal de Entrada (🟢 BUY / 🔴 SELL)',
        type: 'boolean',
        default: true
      },
      {
        key: 'showSweeps',
        label: 'Exibir Ponto de Varredura (⚡ SWEEP)',
        type: 'boolean',
        default: true
      },
      {
        key: 'minRangeCandles',
        label: 'Mínimo de Velas do Caixote',
        type: 'number',
        default: 12,
        min: 8,
        max: 40,
        step: 1
      },
      {
        key: 'maxRangeCandles',
        label: 'Máximo de Velas do Caixote',
        type: 'number',
        default: 30,
        min: 15,
        max: 80,
        step: 1
      },
      {
        key: 'sweepTolerancePts',
        label: 'Profundidade Mín. do Sweep (Pts)',
        type: 'number',
        default: 3.0,
        min: 1.0,
        max: 20.0,
        step: 0.5
      },
      {
        key: 'soundSignal',
        label: 'Alerta Sonoro de Reclaim Confirmado',
        type: 'select',
        default: 'cyber_pulse',
        options: [
          { label: '🔇 Sem Som', value: 'none' },
          { label: '🔔 Padrão Axion (Beep 440Hz)', value: 'default_axion' },
          { label: '⚡ Pulso Cyberpunk (Bip Duplo 650Hz)', value: 'cyber_pulse' },
          { label: '🚀 Alerta Radar (Acorde Tríade 520Hz)', value: 'radar_ping' }
        ]
      }
    ],
    defaultStyle: { color: '#f59e0b', secondaryColor: '#10b981', lineWidth: 2, lineStyle: 'solid' }
  },
  AXION_TREND: {
    type: 'AXION_TREND',
    name: '🔥 Axion Trend (Candles + Setas + Histograma BB)',
    category: 'Tendência',
    description: 'Sistema institucional completo de tendência (B4 Engine): coloração dinâmica de candles (Verde/Vermelho/Cinza via RSM), setas de entrada confirmadas, histograma MACD com Bandas de Bollinger, linha de bolinhas coloridas (MACDBB), Squeeze na linha zero, transição estrutural Bull/Bear e tendência conciliada com filtro de nível zero.',
    overlay: true,
    paramDefs: [
      { key: 'colorBars', label: '🎨 Colorir Candles de Tendência (Verde / Vermelho / Cinza)', type: 'boolean', default: true },
      { key: 'showArrows', label: '🏹 Exibir Setas de Compra e Venda no Gráfico', type: 'boolean', default: true },
      { key: 'showConciliatedArrows', label: '⚡ Exibir Marcadores da Tendência Conciliada (Candles + Média Bolinhas >/< 0)', type: 'boolean', default: false },
      { key: 'showSubPanel', label: '📊 Exibir Sub-Painel do Histograma e Média de Bolinhas', type: 'boolean', default: true },
      { key: 'showBullBearLines', label: '🏛️ Exibir Barras Verticais Bull/Bear no Sub-Painel', type: 'boolean', default: true },
      { key: 'macdFastLength', label: 'MACDBB Período Rápido (Fast)', type: 'number', default: 12, min: 1, max: 200 },
      { key: 'macdSlowLength', label: 'MACDBB Período Lento (Slow)', type: 'number', default: 26, min: 1, max: 200 },
      { key: 'macdLength', label: 'MACDBB Suavização (Smooth)', type: 'number', default: 5, min: 1, max: 100 },
      { key: 'macdBandLength', label: 'MACDBB Período Bandas Bollinger', type: 'number', default: 15, min: 1, max: 100 },
      { key: 'macdNumOfDev', label: 'MACDBB Desvio Padrão (StdDev)', type: 'number', default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: 'squeezeLength', label: 'Squeeze Período (Bollinger/Keltner)', type: 'number', default: 30, min: 2, max: 200 },
      { key: 'fstLength', label: 'Fib SuperTrend Período', type: 'number', default: 11, min: 1, max: 100 },
      { key: 'fstRetrace', label: 'Fib SuperTrend Retração (%)', type: 'number', default: 23.6, min: 1, max: 100, step: 0.1 },
      { key: 'fstUseHighLow', label: 'Fib SuperTrend Usar High/Low', type: 'boolean', default: true },
      { key: 'includeFST', label: 'Bull/Bear Incluir Fib SuperTrend', type: 'boolean', default: true },
      { key: 'includeRSIIFT', label: 'Bull/Bear Incluir RSI IFT', type: 'boolean', default: true },
      {
        key: 'barMode',
        label: 'Modo de Execução',
        type: 'select',
        default: 'closed',
        options: [
          { label: '🔒 Barra Fechada (Padrão)', value: 'closed' },
          { label: '⚡ Barra em Formação (Tempo Real)', value: 'realtime' }
        ]
      },
      {
        key: 'soundSignal',
        label: 'Alerta Sonoro de Seta',
        type: 'select',
        default: 'none',
        options: [
          { label: '🔇 Sem Som', value: 'none' },
          { label: '🔔 Padrão Axion (Beep 440Hz)', value: 'default_axion' },
          { label: '✨ Chime Cristalino (900Hz Suave)', value: 'crystal_chime' },
          { label: '⚡ Pulso Cyberpunk (Bip Duplo 650Hz)', value: 'cyber_pulse' },
          { label: '🚀 Alerta Radar (Acorde Tríade 520Hz)', value: 'radar_ping' }
        ]
      }
    ],
    defaultStyle: { color: '#22c55e', secondaryColor: '#ef4444', lineWidth: 2, lineStyle: 'solid' }
  },
  MOMENTUM_CONFLUENCE: {
    type: 'MOMENTUM_CONFLUENCE',
    name: '🌊 Momentum Matrix (Força de Ações & Confluência)',
    category: 'Osciladores',
    description: 'Subpainel com linhas de força percentual de momentum (0 a 100%) a cada 1m. Permite analisar NQ e ES individuais ou combinados, as 7 Big Techs individuais ou somadas na cesta Mag7, além de VIX e DXY individuais, com linha central no 50 para mapear rallies e confluências de reversão.',
    overlay: false,
    paramDefs: [
      {
        key: 'showFxFlow',
        label: '🌐 Exibir IndexMoneyFlow (IMF)',
        type: 'boolean',
        default: true
      },
      {
        key: 'indicesMode',
        label: 'Modo Índices Futuros',
        type: 'select',
        default: 'combined',
        options: [
          { label: '🔗 NQ + ES Somados (Índices Combinados)', value: 'combined' },
          { label: '📊 NQ e ES Individuais', value: 'individual' },
          { label: '🚫 Ocultar Índices', value: 'off' }
        ]
      },
      {
        key: 'stocksMode',
        label: 'Modo Big Techs (7 Ações)',
        type: 'select',
        default: 'combined',
        options: [
          { label: '🔥 Cesta das 7 Big Techs Somadas (Mag7 Basket)', value: 'combined' },
          { label: '🏢 Ações Individuais (Switches Individuais)', value: 'individual' },
          { label: '🚫 Ocultar Ações', value: 'off' }
        ]
      },
      { key: 'showVix', label: '⚡ Exibir VIX (Volatilidade)', type: 'boolean', default: true },
      { key: 'invertVix', label: '🔄 Inverter VIX (100 - VIX para correlacionar com alta)', type: 'boolean', default: false },
      { key: 'showDxy', label: '💵 Exibir DXY / USD Index (Isolado)', type: 'boolean', default: false },
      { key: 'invertDxy', label: '🔄 Inverter DXY (100 - DXY para correlacionar com alta)', type: 'boolean', default: false },
      { key: 'showEurJpy', label: '💴 Exibir EUR/JPY (Risco Global)', type: 'boolean', default: false },
      { key: 'showUsdJpy', label: '💴 Exibir USD/JPY (Carry Trade)', type: 'boolean', default: false },
      { key: 'showEurUsd', label: '💶 Exibir EUR/USD (Fluxo Euro/Dólar)', type: 'boolean', default: false },
      { key: 'showNq', label: 'Exibir NQ (quando no modo individual)', type: 'boolean', default: true },
      { key: 'showEs', label: 'Exibir ES (quando no modo individual)', type: 'boolean', default: true },
      { key: 'showNvidia', label: 'Exibir NVIDIA (NVDA)', type: 'boolean', default: true },
      { key: 'showMicrosoft', label: 'Exibir Microsoft (MSFT)', type: 'boolean', default: true },
      { key: 'showApple', label: 'Exibir Apple (AAPL)', type: 'boolean', default: true },
      { key: 'showAmazon', label: 'Exibir Amazon (AMZN)', type: 'boolean', default: true },
      { key: 'showAlphabet', label: 'Exibir Alphabet (GOOGL)', type: 'boolean', default: true },
      { key: 'showMeta', label: 'Exibir Meta (META)', type: 'boolean', default: true },
      { key: 'showTesla', label: 'Exibir Tesla (TSLA)', type: 'boolean', default: true },
      { key: 'showCenter50', label: 'Linha Central 50 (Equilíbrio Neutro)', type: 'boolean', default: true },
      { key: 'showExtremeLevels', label: 'Linhas Extremas de Rally (80 / 20)', type: 'boolean', default: true }
    ],
    defaultStyle: { color: '#06b6d4', secondaryColor: '#eab308', lineWidth: 2, lineStyle: 'solid' }
  }
};

// Helper universal para extrair Date de qualquer objeto de vela
function parseCandleDate(c: any): Date {
  if (!c) return new Date(0);
  if (typeof c.time === 'number' && !isNaN(c.time) && c.time > 0) {
    return new Date(c.time * 1000);
  }
  if (c.timestamp) {
    const t = getChartTimeFromDate(c.timestamp);
    if (t > 0) return new Date(t * 1000);
    const d = new Date(c.timestamp);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(0);
}

// Helper para extrair informações de data, hora e sessão no fuso do gráfico (São Paulo / Brasília UTC-3)
function getCandleSessionInfo(
  c: any,
  systemSessionStart: string = '20:00:00',
  sessionMode: 'all' | 'custom' = 'all',
  customStart: string = '09:00',
  customEnd: string = '18:00'
): { sessionKey: string; dateStr: string; timeStr: string; inCustomWindow: boolean } | null {
  const dUtc = parseCandleDate(c);
  if (!dUtc || isNaN(dUtc.getTime()) || dUtc.getTime() === 0) return null;

  // Ajuste mandatório para o fuso horário de Brasília (UTC-3):
  // O gráfico e os parâmetros do usuário (ex: 11:31 às 11:45) estão no horário local de São Paulo.
  const SP_OFFSET_MS = -3 * 3600 * 1000;
  const dSp = new Date(dUtc.getTime() + SP_OFFSET_MS);

  const y = dSp.getUTCFullYear();
  const m = String(dSp.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dSp.getUTCDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;

  const hh = String(dSp.getUTCHours()).padStart(2, '0');
  const mm = String(dSp.getUTCMinutes()).padStart(2, '0');
  const timeStr = `${hh}:${mm}`;

  const sysStartStr = (systemSessionStart ? systemSessionStart.slice(0, 5) : '20:00');

  // Se a vela ocorre a partir do início da sessão (ex: >= 20:00 BRT),
  // ela pertence à sessão do PRÓXIMO dia de negociação.
  let sessionKey = dateStr;
  if (timeStr >= sysStartStr) {
    const nextDay = new Date(dSp.getTime() + 24 * 3600 * 1000);
    const ny = nextDay.getUTCFullYear();
    const nm = String(nextDay.getUTCMonth() + 1).padStart(2, '0');
    const nd = String(nextDay.getUTCDate()).padStart(2, '0');
    sessionKey = `${ny}-${nm}-${nd}`;
  }

  let inCustomWindow = true;
  if (sessionMode === 'custom') {
    const cStart = (customStart ? customStart.slice(0, 5) : '09:00');
    const cEnd = (customEnd ? customEnd.slice(0, 5) : '18:00');
    if (cStart <= cEnd) {
      inCustomWindow = timeStr >= cStart && timeStr <= cEnd;
    } else {
      inCustomWindow = timeStr >= cStart || timeStr <= cEnd;
    }
  }

  return { sessionKey, dateStr, timeStr, inCustomWindow };
}

// Função Avançada de Cálculo de Volume Profile por Sessão ou Janela de Velas
export function calculateVolumeProfileAnalysis(
  candles: any[],
  options: {
    sessionMode?: 'all' | 'custom' | 'bars';
    customStart?: string;
    customEnd?: string;
    systemSessionStart?: string;
    systemSessionEnd?: string;
    lookbackDays?: number;
    lookbackBars?: number;
    binsCount?: number;
    valueAreaPct?: number;
    topNodesCount?: number;
    blockThicknessPct?: number;
  } = {}
): VolumeProfileAnalysisResult | null {
  if (!candles || candles.length < 3) return null;

  const sessionMode = options.sessionMode || 'all';
  const customStart = options.customStart || '09:00';
  const customEnd = options.customEnd || '18:00';
  const systemSessionStart = options.systemSessionStart || '20:00:00';
  const lookbackDays = Math.max(1, Math.min(5, options.lookbackDays || 1));
  const lookbackBars = Math.max(3, Math.min(500, options.lookbackBars || 30));
  const binsCount = Math.max(20, Math.min(150, options.binsCount || 50));
  const valueAreaPct = Math.max(50, Math.min(95, options.valueAreaPct || 70));
  const topNodesCount = Math.max(1, Math.min(6, options.topNodesCount || 3));
  const blockThicknessPct = Math.max(0.1, Math.min(3.0, options.blockThicknessPct || 0.5));

  let finalCandles: any[] = [];
  let targetSessions: string[] = [];
  let priorCompletedSessions: string[] = [];
  const sessionsMap = new Map<string, { candle: any; inCustomWindow: boolean }[]>();

  if (sessionMode === 'bars') {
    finalCandles = candles.length > lookbackBars ? candles.slice(-lookbackBars) : candles;
    targetSessions = [`Últimas ${finalCandles.length} velas`];
  } else {
    // 1. Agrupar velas por Sessão de Mercado (baseada no início de sessão, ex: 19:00 BRT)
    candles.forEach(c => {
      const info = getCandleSessionInfo(c, systemSessionStart, sessionMode, customStart, customEnd);
      if (!info) return;
      if (!sessionsMap.has(info.sessionKey)) {
        sessionsMap.set(info.sessionKey, []);
      }
      sessionsMap.get(info.sessionKey)!.push({ candle: c, inCustomWindow: info.inCustomWindow });
    });

    const uniqueSessions = Array.from(sessionsMap.keys()).sort();
    if (uniqueSessions.length === 0) return null;

    // A última sessão da lista é a sessão corrente (em andamento)
    const currentActiveSession = uniqueSessions[uniqueSessions.length - 1];
    priorCompletedSessions = uniqueSessions.slice(0, uniqueSessions.length - 1);

    if (priorCompletedSessions.length > 0) {
      targetSessions = priorCompletedSessions.slice(-lookbackDays);
    } else {
      // Se só houver 1 sessão disponível no histórico inicial, usa a sessão disponível
      targetSessions = [currentActiveSession];
    }

    const sessionCandles: any[] = [];
    targetSessions.forEach(sKey => {
      const sCandles = sessionsMap.get(sKey) || [];
      sCandles.forEach(item => {
        if (item.inCustomWindow) {
          sessionCandles.push(item.candle);
        }
      });
    });

    finalCandles = sessionCandles.length >= 3 
      ? sessionCandles 
      : (priorCompletedSessions.length > 0 
          ? ((sessionsMap.get(priorCompletedSessions[priorCompletedSessions.length - 1]) || []).map(i => i.candle)) 
          : candles);
  }
  
  if (!finalCandles || finalCandles.length === 0) return null;

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  finalCandles.forEach(c => {
    if (c.low !== undefined && c.low < minPrice) minPrice = c.low;
    if (c.high !== undefined && c.high > maxPrice) maxPrice = c.high;
  });

  if (!isFinite(minPrice) || !isFinite(maxPrice) || minPrice >= maxPrice) {
    const refClose = finalCandles[0].close || 100;
    minPrice = refClose * 0.99;
    maxPrice = refClose * 1.01;
  }

  const range = maxPrice - minPrice;
  const step = range / binsCount;

  const bins: VolumeHeatmapBin[] = [];
  for (let i = 0; i < binsCount; i++) {
    const priceBottom = minPrice + i * step;
    const priceTop = minPrice + (i + 1) * step;
    const priceMid = (priceBottom + priceTop) / 2;
    bins.push({
      priceBottom,
      priceTop,
      priceMid,
      volume: 0,
      intensity: 0
    });
  }

  finalCandles.forEach(c => {
    const vol = (c.volume && c.volume > 0) ? c.volume : 1;
    let bStart = Math.floor((c.low - minPrice) / step);
    let bEnd = Math.floor((c.high - minPrice) / step);
    bStart = Math.max(0, Math.min(binsCount - 1, bStart));
    bEnd = Math.max(0, Math.min(binsCount - 1, bEnd));

    const coveredBins = bEnd - bStart + 1;
    const volPerBin = vol / coveredBins;

    for (let b = bStart; b <= bEnd; b++) {
      bins[b].volume += volPerBin;
    }
  });

  let maxVol = 0;
  let pocIdx = 0;
  let totalVol = 0;

  bins.forEach((b, idx) => {
    totalVol += b.volume;
    if (b.volume > maxVol) {
      maxVol = b.volume;
      pocIdx = idx;
    }
  });

  bins.forEach(b => {
    b.intensity = maxVol > 0 ? (b.volume / maxVol) : 0;
  });

  const pocPrice = bins[pocIdx].priceMid;

  const targetAreaVol = totalVol * (valueAreaPct / 100);
  let accVol = bins[pocIdx].volume;
  let upIdx = pocIdx + 1;
  let downIdx = pocIdx - 1;

  while (accVol < targetAreaVol && (upIdx < binsCount || downIdx >= 0)) {
    const upVol = upIdx < binsCount ? bins[upIdx].volume : -1;
    const downVol = downIdx >= 0 ? bins[downIdx].volume : -1;

    if (upVol >= downVol && upIdx < binsCount) {
      accVol += upVol;
      upIdx++;
    } else if (downIdx >= 0) {
      accVol += downVol;
      downIdx--;
    } else if (upIdx < binsCount) {
      accVol += upVol;
      upIdx++;
    } else {
      break;
    }
  }

  const vahIdx = Math.min(binsCount - 1, Math.max(pocIdx, upIdx - 1));
  const valIdx = Math.max(0, Math.min(pocIdx, downIdx + 1));
  const vahPrice = bins[vahIdx].priceTop;
  const valPrice = bins[valIdx].priceBottom;

  const peakCandidates: { idx: number; volume: number; priceMid: number }[] = [];
  for (let i = 1; i < binsCount - 1; i++) {
    if (bins[i].volume > bins[i - 1].volume && bins[i].volume > bins[i + 1].volume) {
      peakCandidates.push({ idx: i, volume: bins[i].volume, priceMid: bins[i].priceMid });
    }
  }
  if (!peakCandidates.some(p => p.idx === pocIdx)) {
    peakCandidates.push({ idx: pocIdx, volume: bins[pocIdx].volume, priceMid: bins[pocIdx].priceMid });
  }

  peakCandidates.sort((a, b) => b.volume - a.volume);
  const selectedPeaks = peakCandidates.slice(0, topNodesCount);

  const halfThickness = range * (blockThicknessPct / 100) * 0.5;
  const hvnBlocks: VolumeHvnBlock[] = selectedPeaks.map((peak, r) => ({
    priceCenter: peak.priceMid,
    priceTop: peak.priceMid + halfThickness,
    priceBottom: peak.priceMid - halfThickness,
    volume: peak.volume,
    rank: r + 1
  }));

  // Calcular Naked POCs (POCs de sessões anteriores ou janelas anteriores de velas que ainda não foram tocados pelas velas posteriores)
  const nakedPocs: { price: number; dateStr: string }[] = [];
  if (sessionMode === 'bars') {
    for (let w = 1; w <= 5; w++) {
      const endIdx = candles.length - w * lookbackBars;
      const startIdx = endIdx - lookbackBars;
      if (endIdx <= 0 || startIdx < 0) break;
      const wCandles = candles.slice(startIdx, endIdx);
      if (wCandles.length < 3) continue;

      let dMin = Infinity, dMax = -Infinity;
      wCandles.forEach(c => {
        if (c.low < dMin) dMin = c.low;
        if (c.high > dMax) dMax = c.high;
      });
      if (!isFinite(dMin) || !isFinite(dMax) || dMin >= dMax) continue;

      const dStep = (dMax - dMin) / 30;
      const dBins = new Array(30).fill(0);
      wCandles.forEach(c => {
        const v = c.volume || 1;
        const bs = Math.max(0, Math.min(29, Math.floor((c.low - dMin) / dStep)));
        const be = Math.max(0, Math.min(29, Math.floor((c.high - dMin) / dStep)));
        const k = be - bs + 1;
        for (let b = bs; b <= be; b++) dBins[b] += v / k;
      });
      let dMaxV = 0, dPocIdx = 0;
      dBins.forEach((v, idx) => {
        if (v > dMaxV) { dMaxV = v; dPocIdx = idx; }
      });
      const histPocPrice = dMin + (dPocIdx + 0.5) * dStep;
      const subsequentCandles = candles.slice(endIdx);
      const wasTouched = subsequentCandles.some(c => c.low <= histPocPrice && c.high >= histPocPrice);
      if (!wasTouched) {
        nakedPocs.push({ price: histPocPrice, dateStr: `-${w * lookbackBars}v` });
      }
    }
  } else if (priorCompletedSessions.length > 0) {
    const historicalSessions = priorCompletedSessions.slice(-5);
    historicalSessions.forEach((histSessionKey) => {
      const sItems = sessionsMap.get(histSessionKey) || [];
      const sCandles = sItems.filter(i => i.inCustomWindow).map(i => i.candle);
      if (sCandles.length < 5) return;

      let dMin = Infinity, dMax = -Infinity;
      sCandles.forEach(c => {
        if (c.low < dMin) dMin = c.low;
        if (c.high > dMax) dMax = c.high;
      });
      if (!isFinite(dMin) || !isFinite(dMax) || dMin >= dMax) return;

      const dStep = (dMax - dMin) / 30;
      const dBins = new Array(30).fill(0);
      sCandles.forEach(c => {
        const v = c.volume || 1;
        let bs = Math.max(0, Math.min(29, Math.floor((c.low - dMin) / dStep)));
        let be = Math.max(0, Math.min(29, Math.floor((c.high - dMin) / dStep)));
        const k = be - bs + 1;
        for (let b = bs; b <= be; b++) dBins[b] += v / k;
      });
      let dMaxV = 0, dPocIdx = 0;
      dBins.forEach((v, idx) => {
        if (v > dMaxV) { dMaxV = v; dPocIdx = idx; }
      });
      const histPocPrice = dMin + (dPocIdx + 0.5) * dStep;

      const lastDayTime = parseCandleDate(sCandles[sCandles.length - 1]).getTime();
      const subsequentCandles = candles.filter(c => parseCandleDate(c).getTime() > lastDayTime);
      const wasTouched = subsequentCandles.some(c => c.low <= histPocPrice && c.high >= histPocPrice);

      if (!wasTouched) {
        nakedPocs.push({ price: histPocPrice, dateStr: histSessionKey });
      }
    });
  }

  return {
    bins,
    levels: {
      poc: pocPrice,
      vah: vahPrice,
      val: valPrice,
      totalVolume: totalVol,
      referenceDateStr: targetSessions.join(', '),
      nakedPocs
    },
    hvnBlocks,
    sessionCandlesCount: finalCandles.length,
    minPrice,
    maxPrice
  };
}

// Funções de Cálculo dos Indicadores

/**
 * Estabilizador de Barra Fechada para Séries de Indicadores:
 * Quando em modo Barra Fechada (closed), o valor na vela em formação (último candle)
 * é mantido estático/congelado no valor consolidado da barra fechada anterior,
 * impedindo que a curva ou histograma repinte ou oscile a cada tick intra-barra.
 */
function applyClosedBarStabilization<T extends { time: number; value: number }>(
  data: T[],
  isClosedMode: boolean,
  lastTime: number
): T[] {
  if (!isClosedMode || !data || data.length === 0 || !lastTime) return data;
  const lastPoint = data[data.length - 1];
  if (lastPoint && lastPoint.time < lastTime) {
    return [...data, { ...lastPoint, time: lastTime }];
  }
  return data;
}

function _calculateIndicatorInternal(
  cConfig: IndicatorConfig,
  candles: Candle[],
  options?: {
    systemSessionStart?: string;
    systemSessionEnd?: string;
    marketContext?: ScreenConfluenceContext;
    timeframeMinutes?: number;
    gammaLevels?: any;
  }
): CalculatedIndicatorSeries | null {
  if (!candles || candles.length === 0) return null;

  const times = candles.map(getCandleTimeSeconds);
  const lastTime = times[times.length - 1];

  switch (cConfig.type) {
    case 'SMA': {
      const period = cConfig.params.period || 20;
      const source = cConfig.params.source || 'close';
      const isClosedMode = (cConfig.params?.barMode ?? 'closed') !== 'realtime';
      const calcCandles = (isClosedMode && candles.length >= 2) ? candles.slice(0, -1) : candles;
      const calcTimes = calcCandles.map(getCandleTimeSeconds);
      const prices = calcCandles.map(c => getCandlePrice(c, source));
      const data: { time: number; value: number }[] = [];

      for (let i = 0; i < calcCandles.length; i++) {
        if (i < period - 1) continue;
        let sum = 0;
        for (let j = 0; j < period; j++) sum += prices[i - j];
        data.push({ time: calcTimes[i], value: sum / period });
      }

      const finalData = applyClosedBarStabilization(data, isClosedMode, lastTime);

      return {
        id: cConfig.id,
        type: 'SMA',
        overlay: true,
        series: [{
          name: `${cConfig.name} (${period})`,
          type: 'line',
          color: cConfig.style.color,
          lineWidth: cConfig.style.lineWidth,
          lineStyle: cConfig.style.lineStyle === 'dashed' ? 2 : cConfig.style.lineStyle === 'dotted' ? 1 : 0,
          data: finalData
        }]
      };
    }

    case 'EMA': {
      const period = cConfig.params.period || 21;
      const source = cConfig.params.source || 'close';
      const isClosedMode = (cConfig.params?.barMode ?? 'closed') !== 'realtime';
      const calcCandles = (isClosedMode && candles.length >= 2) ? candles.slice(0, -1) : candles;
      const calcTimes = calcCandles.map(getCandleTimeSeconds);
      const prices = calcCandles.map(c => getCandlePrice(c, source));
      const data: { time: number; value: number }[] = [];

      if (prices.length > 0) {
        const k = 2 / (period + 1);
        let emaVal = prices[0];
        data.push({ time: calcTimes[0], value: emaVal });

        for (let i = 1; i < calcCandles.length; i++) {
          emaVal = prices[i] * k + emaVal * (1 - k);
          data.push({ time: calcTimes[i], value: emaVal });
        }
      }

      const finalData = applyClosedBarStabilization(data, isClosedMode, lastTime);

      return {
        id: cConfig.id,
        type: 'EMA',
        overlay: true,
        series: [{
          name: `${cConfig.name} (${period})`,
          type: 'line',
          color: cConfig.style.color,
          lineWidth: cConfig.style.lineWidth,
          lineStyle: cConfig.style.lineStyle === 'dashed' ? 2 : cConfig.style.lineStyle === 'dotted' ? 1 : 0,
          data: finalData
        }]
      };
    }

    case 'TMA': {
      // Triangular Moving Average Non-Repainting Centered/Double Smoothed
      const period = cConfig.params.period || 20;
      const mult = cConfig.params.atrMultiplier || 2.0;
      const halfPeriod = Math.ceil((period + 1) / 2);
      const isClosedMode = (cConfig.params?.barMode ?? 'closed') !== 'realtime';
      const calcCandles = (isClosedMode && candles.length >= 2) ? candles.slice(0, -1) : candles;
      const calcTimes = calcCandles.map(getCandleTimeSeconds);
      const prices = calcCandles.map(c => getCandlePrice(c, 'close'));
      
      // Calculate first SMA of halfPeriod
      const sma1: number[] = [];
      for (let i = 0; i < calcCandles.length; i++) {
        if (i < halfPeriod - 1) {
          sma1.push(prices[i]);
          continue;
        }
        let sum = 0;
        for (let j = 0; j < halfPeriod; j++) sum += prices[i - j];
        sma1.push(sum / halfPeriod);
      }

      // Calculate second SMA of halfPeriod over sma1 to yield TMA
      const tmaData: { time: number; value: number }[] = [];
      const upperData: { time: number; value: number }[] = [];
      const lowerData: { time: number; value: number }[] = [];

      for (let i = 0; i < calcCandles.length; i++) {
        if (i < halfPeriod * 2 - 2) continue;
        let sum = 0;
        for (let j = 0; j < halfPeriod; j++) sum += sma1[i - j];
        const tmaVal = sum / halfPeriod;

        // ATR for bands
        let atr = 0;
        const lookback = Math.min(i, 14);
        for (let k = i - lookback + 1; k <= i; k++) {
          if (k > 0) atr += Math.max(calcCandles[k].high - calcCandles[k].low, Math.abs(calcCandles[k].high - calcCandles[k - 1].close));
        }
        atr = atr / (lookback || 1);

        tmaData.push({ time: calcTimes[i], value: tmaVal });
        upperData.push({ time: calcTimes[i], value: tmaVal + atr * mult });
        lowerData.push({ time: calcTimes[i], value: tmaVal - atr * mult });
      }

      const finalTma = applyClosedBarStabilization(tmaData, isClosedMode, lastTime);
      const finalUpper = applyClosedBarStabilization(upperData, isClosedMode, lastTime);
      const finalLower = applyClosedBarStabilization(lowerData, isClosedMode, lastTime);

      return {
        id: cConfig.id,
        type: 'TMA',
        overlay: true,
        series: [
          {
            name: `TMA Central (${period})`,
            type: 'line',
            color: cConfig.style.color,
            lineWidth: cConfig.style.lineWidth,
            data: finalTma
          },
          {
            name: `TMA Sup`,
            type: 'line',
            color: cConfig.style.secondaryColor || '#ec4899',
            lineWidth: 1,
            lineStyle: 2,
            data: finalUpper
          },
          {
            name: `TMA Inf`,
            type: 'line',
            color: cConfig.style.secondaryColor || '#ec4899',
            lineWidth: 1,
            lineStyle: 2,
            data: finalLower
          }
        ]
      };
    }

    case 'Bollinger': {
      const period = cConfig.params.period || 20;
      const stdDevMult = cConfig.params.stdDev || 2.0;
      const isClosedMode = (cConfig.params?.barMode ?? 'closed') !== 'realtime';
      const calcCandles = (isClosedMode && candles.length >= 2) ? candles.slice(0, -1) : candles;
      const calcTimes = calcCandles.map(getCandleTimeSeconds);
      const prices = calcCandles.map(c => getCandlePrice(c, 'close'));

      const middle: { time: number; value: number }[] = [];
      const upper: { time: number; value: number }[] = [];
      const lower: { time: number; value: number }[] = [];

      for (let i = 0; i < calcCandles.length; i++) {
        if (i < period - 1) continue;
        let sum = 0;
        for (let j = 0; j < period; j++) sum += prices[i - j];
        const mean = sum / period;

        let varianceSum = 0;
        for (let j = 0; j < period; j++) varianceSum += Math.pow(prices[i - j] - mean, 2);
        const stdDev = Math.sqrt(varianceSum / period);

        middle.push({ time: calcTimes[i], value: mean });
        upper.push({ time: calcTimes[i], value: mean + stdDev * stdDevMult });
        lower.push({ time: calcTimes[i], value: mean - stdDev * stdDevMult });
      }

      const finalMiddle = applyClosedBarStabilization(middle, isClosedMode, lastTime);
      const finalUpper = applyClosedBarStabilization(upper, isClosedMode, lastTime);
      const finalLower = applyClosedBarStabilization(lower, isClosedMode, lastTime);

      return {
        id: cConfig.id,
        type: 'Bollinger',
        overlay: true,
        series: [
          { name: 'Banda Média', type: 'line', color: cConfig.style.color, lineWidth: cConfig.style.lineWidth, data: finalMiddle },
          { name: 'Banda Superior', type: 'line', color: cConfig.style.secondaryColor || '#c084fc', lineWidth: 1, lineStyle: 2, data: finalUpper },
          { name: 'Banda Inferior', type: 'line', color: cConfig.style.secondaryColor || '#c084fc', lineWidth: 1, lineStyle: 2, data: finalLower }
        ]
      };
    }

    case 'RSI': {
      const period = cConfig.params.period || 14;
      const isClosedMode = (cConfig.params?.barMode ?? 'closed') !== 'realtime';
      const calcCandles = (isClosedMode && candles.length >= 2) ? candles.slice(0, -1) : candles;
      const calcTimes = calcCandles.map(getCandleTimeSeconds);
      const prices = calcCandles.map(c => getCandlePrice(c, 'close'));
      const rsiData: { time: number; value: number }[] = [];

      if (calcCandles.length <= period) return null;

      let gains = 0;
      let losses = 0;

      for (let i = 1; i <= period; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
      }

      let avgGain = gains / period;
      let avgLoss = losses / period;

      for (let i = period; i < calcCandles.length; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff > 0) {
          avgGain = (avgGain * (period - 1) + diff) / period;
          avgLoss = (avgLoss * (period - 1)) / period;
        } else {
          avgGain = (avgGain * (period - 1)) / period;
          avgLoss = (avgLoss * (period - 1) - diff) / period;
        }

        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsiVal = 100 - (100 / (1 + rs));
        rsiData.push({ time: calcTimes[i], value: rsiVal });
      }

      const finalRsi = applyClosedBarStabilization(rsiData, isClosedMode, lastTime);

      return {
        id: cConfig.id,
        type: 'RSI',
        overlay: false,
        series: [{
          name: `RSI (${period})`,
          type: 'line',
          color: cConfig.style.color,
          lineWidth: cConfig.style.lineWidth,
          data: finalRsi
        }]
      };
    }

    case 'MACD': {
      const fastPeriod = cConfig.params.fastPeriod || 12;
      const slowPeriod = cConfig.params.slowPeriod || 26;
      const signalPeriod = cConfig.params.signalPeriod || 9;
      const showDivergence = cConfig.params.showDivergence !== false;
      const divergenceMode = (cConfig.params.divergenceMode as any) || 'swing_pivots';
      const divMinBars = cConfig.params.divergenceMinBars || 5;
      const divLookback = cConfig.params.divergenceLookback || 60;
      const divConfirmationBars = cConfig.params.divergenceConfirmationBars ?? 2;
      const divOnlyClosedBars = cConfig.params.divergenceOnlyClosedBars !== false;
      const isClosedMode = (cConfig.params?.barMode ?? 'closed') !== 'realtime';
      const calcCandles = (isClosedMode && candles.length >= 2) ? candles.slice(0, -1) : candles;

      const macdRes = calculateMACD(
        calcCandles.map(c => ({ time: getCandleTimeSeconds(c), close: getCandlePrice(c, 'close') })),
        fastPeriod,
        slowPeriod,
        signalPeriod
      );

      const divergences = showDivergence
        ? calculateMACDDivergences(
            calcCandles.map(c => ({ time: getCandleTimeSeconds(c), high: c.high, low: c.low, close: c.close })),
            macdRes.histogram,
            divLookback,
            divMinBars,
            divConfirmationBars,
            divOnlyClosedBars,
            divergenceMode
          )
        : [];

      // As divergências já são plotadas no gráfico com a caixa estilizada e linha conectora (DIV MACD no CandleChart)
      // Mantemos markers vazio para evitar duplicidade de marcação (texto puro sobreposto)
      const markers: any[] = [];

      const finalMacd = applyClosedBarStabilization(macdRes.macd, isClosedMode, lastTime);
      const finalSignal = applyClosedBarStabilization(macdRes.signal, isClosedMode, lastTime);
      const finalHist = applyClosedBarStabilization(macdRes.histogram, isClosedMode, lastTime);

      return {
        id: cConfig.id,
        type: 'MACD',
        overlay: false,
        series: [
          { name: `MACD (${fastPeriod},${slowPeriod})`, type: 'line', color: cConfig.style.color || '#3b82f6', lineWidth: cConfig.style.lineWidth || 2, data: finalMacd },
          { name: `Sinal (${signalPeriod})`, type: 'line', color: cConfig.style.secondaryColor || '#f97316', lineWidth: 1, lineStyle: 2, data: finalSignal },
          { name: 'Histograma', type: 'line', color: '#10b981', lineWidth: 2, data: finalHist }
        ],
        markers,
        customData: {
          macd: finalMacd,
          signal: finalSignal,
          histogram: finalHist,
          divergences
        }
      };
    }

    case 'EMACD':
    case 'MACD_EXPLOSION': {
      const isClosedMode = (cConfig.params?.barMode ?? 'closed') !== 'realtime';
      const calcCandles = (isClosedMode && candles.length >= 2) ? candles.slice(0, -1) : candles;
      const calcTimes = calcCandles.map(getCandleTimeSeconds);
      const emacdRes = calculateEMACD(calcCandles);

      const histData: { time: number; value: number }[] = [];
      const expData: { time: number; value: number }[] = [];
      const deadData: { time: number; value: number }[] = [];

      for (let i = 0; i < calcCandles.length; i++) {
        const t = calcTimes[i];
        histData.push({ time: t, value: emacdRes.histogram[i] || 0 });
        expData.push({ time: t, value: emacdRes.explosion[i] || 0 });
        deadData.push({ time: t, value: emacdRes.deadZone[i] || 20 });
      }

      const finalHist = applyClosedBarStabilization(histData, isClosedMode, lastTime);
      const finalExp = applyClosedBarStabilization(expData, isClosedMode, lastTime);
      const finalDead = applyClosedBarStabilization(deadData, isClosedMode, lastTime);

      return {
        id: cConfig.id,
        type: cConfig.type,
        overlay: false,
        series: [
          { name: 'e-MACD Histograma', type: 'line', color: cConfig.style.color || '#3b82f6', lineWidth: cConfig.style.lineWidth || 2, data: finalHist },
          { name: 'Linha de Explosão', type: 'line', color: cConfig.style.secondaryColor || '#eab308', lineWidth: 2, data: finalExp },
          { name: 'Dead Zone', type: 'line', color: '#64748b', lineWidth: 1, lineStyle: 2, data: finalDead }
        ],
        customData: {
          histogram: emacdRes.histogram,
          histogram_compra: emacdRes.histogram_compra,
          histogram_venda: emacdRes.histogram_venda,
          explosion: emacdRes.explosion,
          deadZone: emacdRes.deadZone,
          trend: emacdRes.trend
        }
      };
    }

    case 'FVG': {
      const minTicks = cConfig.params.minimumTicks || 1;
      const tickSize = cConfig.params.tickSize || 1.0;
      const extendUntil = cConfig.params.extendUntil || 1;
      const barsToExtend = cConfig.params.barsToExtend || 10;
      const enforceSameDirection = cConfig.params.enforceSameDirection || false;
      const isClosedMode = (cConfig.params?.barMode ?? 'closed') !== 'realtime';
      const calcCandles = (isClosedMode && candles.length >= 2) ? candles.slice(0, -1) : candles;

      const gaps = calculateFVGs(calcCandles, minTicks, tickSize, extendUntil, barsToExtend, enforceSameDirection);
      const unmitigatedGaps = gaps.filter(g => !g.isFilled);

      return {
        id: cConfig.id,
        type: 'FVG',
        overlay: true,
        series: [],
        markers: [],
        customData: {
          gaps,
          unmitigatedGaps
        }
      };
    }

    case 'ElliottWaves': {
      // Auto Elliott Waves Engine with True Percentage Sensitivity & Structural Trend Validation
      const markers: { time: number; position: 'aboveBar' | 'belowBar'; color: string; shape: 'circle'; size: number; text: string }[] = [];
      const deviationPct = (Number(cConfig.params.deviation) || 1.5) / 100;
      const isClosedMode = (cConfig.params?.barMode ?? 'closed') !== 'realtime';
      const calcCandles = (isClosedMode && candles.length >= 2) ? candles.slice(0, -1) : candles;
      const calcTimes = (isClosedMode && times.length >= 2) ? times.slice(0, -1) : times;
      const windowSize = 3;

      interface PivotPoint {
        index: number;
        time: number;
        type: 'H' | 'L';
        price: number;
      }

      // Step 1: Extract Significant Swings filtered strictly by percentage deviation threshold
      const pivots: PivotPoint[] = [];

      for (let i = windowSize; i < calcCandles.length - windowSize; i++) {
        let isHigh = true;
        let isLow = true;
        for (let k = 1; k <= windowSize; k++) {
          if (calcCandles[i].high < calcCandles[i - k].high || calcCandles[i].high < calcCandles[i + k].high) isHigh = false;
          if (calcCandles[i].low > calcCandles[i - k].low || calcCandles[i].low > calcCandles[i + k].low) isLow = false;
        }

        if (!isHigh && !isLow) continue;

        const price = isHigh ? calcCandles[i].high : calcCandles[i].low;
        const type: 'H' | 'L' = isHigh ? 'H' : 'L';

        if (pivots.length === 0) {
          pivots.push({ index: i, time: calcTimes[i], type, price });
        } else {
          const lastPivot = pivots[pivots.length - 1];

          if (lastPivot.type === type) {
            // Same type: update if more extreme
            if (type === 'H' && price > lastPivot.price) {
              pivots[pivots.length - 1] = { index: i, time: calcTimes[i], type, price };
            } else if (type === 'L' && price < lastPivot.price) {
              pivots[pivots.length - 1] = { index: i, time: calcTimes[i], type, price };
            }
          } else {
            // Opposite type: check if percentage move exceeds deviationPct threshold
            const movePct = Math.abs(price - lastPivot.price) / lastPivot.price;
            if (movePct >= deviationPct) {
              pivots.push({ index: i, time: calcTimes[i], type, price });
            }
          }
        }
      }

      // Step 2: Validate Trend Structure & Map Elliott Impulse (1-2-3-4-5) and Corrective (A-B-C) Waves
      let currentWaveCycle: { wave: string; pivot: PivotPoint }[] = [];

      for (let p = 0; p < pivots.length; p++) {
        const curr = pivots[p];

        if (currentWaveCycle.length === 0) {
          currentWaveCycle.push({ wave: '1', pivot: curr });
          continue;
        }

        const count = currentWaveCycle.length;
        const w1 = currentWaveCycle[0].pivot;
        const isBullish = w1.type === 'H';

        if (count === 1) {
          // Expect Wave 2 (retracement)
          if (curr.type !== w1.type) {
            const validRetrace = isBullish ? curr.price > w1.price * 0.92 : curr.price < w1.price * 1.08;
            if (validRetrace) {
              currentWaveCycle.push({ wave: '2', pivot: curr });
            } else {
              currentWaveCycle = [{ wave: '1', pivot: curr }];
            }
          }
        } else if (count === 2) {
          // Expect Wave 3 (must break Wave 1 extreme)
          const validW3 = isBullish ? (curr.type === 'H' && curr.price > w1.price) : (curr.type === 'L' && curr.price < w1.price);
          if (validW3) {
            currentWaveCycle.push({ wave: '3', pivot: curr });
          } else {
            currentWaveCycle = [{ wave: '1', pivot: curr }];
          }
        } else if (count === 3) {
          // Expect Wave 4 (retracement: must NOT overlap Wave 1)
          const validW4 = isBullish ? (curr.type === 'L' && curr.price > w1.price) : (curr.type === 'H' && curr.price < w1.price);
          if (validW4) {
            currentWaveCycle.push({ wave: '4', pivot: curr });
          } else {
            currentWaveCycle = [{ wave: '1', pivot: curr }];
          }
        } else if (count === 4) {
          // Expect Wave 5 (must break Wave 3 extreme)
          const w3 = currentWaveCycle[2].pivot;
          const validW5 = isBullish ? (curr.type === 'H' && curr.price > w3.price) : (curr.type === 'L' && curr.price < w3.price);
          if (validW5) {
            currentWaveCycle.push({ wave: '5', pivot: curr });
          } else {
            currentWaveCycle = [{ wave: '1', pivot: curr }];
          }
        } else if (count === 5) {
          // Expect Wave A
          currentWaveCycle.push({ wave: 'A', pivot: curr });
        } else if (count === 6) {
          // Expect Wave B
          currentWaveCycle.push({ wave: 'B', pivot: curr });
        } else if (count === 7) {
          // Expect Wave C
          currentWaveCycle.push({ wave: 'C', pivot: curr });

          // Emit complete cycle markers
          currentWaveCycle.forEach(item => {
            markers.push({
              time: item.pivot.time,
              position: item.pivot.type === 'H' ? 'aboveBar' : 'belowBar',
              color: item.pivot.type === 'H' ? '#38bdf8' : '#f43f5e',
              shape: 'circle',
              size: 0,
              text: item.wave
            });
          });

          currentWaveCycle = [];
        }
      }

      // Also render active impulse markers if at least Wave 3 is established
      if (currentWaveCycle.length >= 3) {
        currentWaveCycle.forEach(item => {
          markers.push({
            time: item.pivot.time,
            position: item.pivot.type === 'H' ? 'aboveBar' : 'belowBar',
            color: item.pivot.type === 'H' ? '#38bdf8' : '#f43f5e',
            shape: 'circle',
            size: 0,
            text: item.wave
          });
        });
      }

      return {
        id: cConfig.id,
        type: 'ElliottWaves',
        overlay: true,
        series: [],
        markers,
        customData: {
          waveCycle: currentWaveCycle,
          markers
        }
      };
    }

    case 'SMC_OB': {
      // Smart Money Concepts - Order Blocks (Bullish / Bearish)
      const markers: { time: number; position: 'aboveBar' | 'belowBar'; color: string; shape: 'square'; text: string }[] = [];
      const orderBlocks: { type: 'bullish' | 'bearish'; top: number; bottom: number; time: number }[] = [];
      const isClosedMode = (cConfig.params?.barMode ?? 'closed') !== 'realtime';
      const calcCandles = (isClosedMode && candles.length >= 2) ? candles.slice(0, -1) : candles;
      const calcTimes = (isClosedMode && times.length >= 2) ? times.slice(0, -1) : times;
      
      for (let i = 3; i < calcCandles.length; i++) {
        // Bullish OB: strong up move breaking prior high
        const strongUp = calcCandles[i].close > calcCandles[i].open && (calcCandles[i].close - calcCandles[i].open) > (calcCandles[i - 1].high - calcCandles[i - 1].low) * 1.5;
        if (strongUp && calcCandles[i - 1].close < calcCandles[i - 1].open) {
          markers.push({
            time: calcTimes[i - 1],
            position: 'belowBar',
            color: '#22c55e',
            shape: 'square',
            text: 'Bullish OB'
          });
          orderBlocks.push({
            type: 'bullish',
            top: calcCandles[i - 1].high,
            bottom: calcCandles[i - 1].low,
            time: calcTimes[i - 1]
          });
        }

        // Bearish OB: strong down move breaking prior low
        const strongDown = calcCandles[i].close < calcCandles[i].open && (calcCandles[i].open - calcCandles[i].close) > (calcCandles[i - 1].high - calcCandles[i - 1].low) * 1.5;
        if (strongDown && calcCandles[i - 1].close > calcCandles[i - 1].open) {
          markers.push({
            time: calcTimes[i - 1],
            position: 'aboveBar',
            color: '#ef4444',
            shape: 'square',
            text: 'Bearish OB'
          });
          orderBlocks.push({
            type: 'bearish',
            top: calcCandles[i - 1].high,
            bottom: calcCandles[i - 1].low,
            time: calcTimes[i - 1]
          });
        }
      }

      return {
        id: cConfig.id,
        type: 'SMC_OB',
        overlay: true,
        series: [],
        markers,
        customData: {
          orderBlocks
        }
      };
    }

    case 'VWAP': {
      const resetMode = cConfig.params?.resetMode || 'session_1900';
      const customStartStr = cConfig.params?.sessionStart || '19:00';
      const isClosedMode = (cConfig.params?.barMode ?? 'closed') !== 'realtime';
      const calcCandles = (isClosedMode && candles.length >= 2) ? candles.slice(0, -1) : candles;
      const calcTimes = (isClosedMode && times.length >= 2) ? times.slice(0, -1) : times;
      const vwapData: { time: number; value: number }[] = [];

      let sessionStartStr = '19:00:00';
      if (resetMode === 'session_1900') {
        sessionStartStr = '19:00:00';
      } else if (resetMode === 'session_1800') {
        sessionStartStr = '18:00:00';
      } else if (resetMode === 'session_0930') {
        sessionStartStr = '09:30:00';
      } else if (resetMode === 'daily_utc') {
        sessionStartStr = '00:00:00';
      } else if (customStartStr) {
        sessionStartStr = customStartStr.includes(':')
          ? (customStartStr.split(':').length === 2 ? `${customStartStr}:00` : customStartStr)
          : '19:00:00';
      }

      let cumVol = 0;
      let cumVolPrice = 0;
      let lastSessionKey = '';

      for (let i = 0; i < calcCandles.length; i++) {
        const t = calcTimes[i];
        if (!t || isNaN(t) || t <= 0) continue;

        // Chave de sessão operacional via getTradingSessionKey:
        // Mantém velas das 19:00 até as 18:59 do dia seguinte rigorosamente agrupadas na mesma sessão,
        // sem reinício indevido à meia-noite (24:00/00:00).
        const currentSessionKey = getTradingSessionKey(t, sessionStartStr);
        const isNewSession = i === 0 || (lastSessionKey !== '' && currentSessionKey !== lastSessionKey);
        lastSessionKey = currentSessionKey;

        if (isNewSession) {
          cumVol = 0;
          cumVolPrice = 0;
        }

        const cHigh = Number(calcCandles[i]?.high) || Number(calcCandles[i]?.close) || 0;
        const cLow = Number(calcCandles[i]?.low) || Number(calcCandles[i]?.close) || 0;
        const cClose = Number(calcCandles[i]?.close) || 0;
        const tp = (cHigh + cLow + cClose) / 3;
        const vol = Math.max(1, Number(calcCandles[i]?.volume) || 1);

        if (isFinite(tp) && tp > 0) {
          cumVol += vol;
          cumVolPrice += tp * vol;
        }

        const vVal = cumVol > 0 ? (cumVolPrice / cumVol) : tp;
        if (isFinite(vVal) && vVal > 0) {
          vwapData.push({
            time: t,
            value: vVal
          });
        }
      }

      const stabilizedVwap = applyClosedBarStabilization(vwapData, isClosedMode, lastTime);
      const safeVwapData = sanitizeLineSeriesData(stabilizedVwap);

      const displayLabel = resetMode === 'session_1900'
        ? '19:00'
        : resetMode === 'session_1800'
        ? '18:00'
        : resetMode === 'session_0930'
        ? '09:30'
        : resetMode === 'daily_utc'
        ? '00:00 UTC'
        : (customStartStr || '19:00');

      return {
        id: cConfig.id,
        type: 'VWAP',
        overlay: true,
        series: [{
          name: `VWAP Diária (${displayLabel})`,
          type: 'line',
          color: cConfig.style.color || '#e11d48',
          lineWidth: cConfig.style.lineWidth || 2,
          data: safeVwapData
        }]
      };
    }

    case 'SMC_BOS_CHOCH': {
      const markers: { time: number; position: 'aboveBar' | 'belowBar'; color: string; shape: 'arrowUp' | 'arrowDown'; text: string }[] = [];
      const len = Math.max(2, cConfig.params.swingLength || 5);
      const isClosedMode = (cConfig.params?.barMode ?? 'closed') !== 'realtime';
      const calcCandles = (isClosedMode && candles.length >= 2) ? candles.slice(0, -1) : candles;
      const calcTimes = (isClosedMode && times.length >= 2) ? times.slice(0, -1) : times;

      let lastSwingHigh: { index: number; price: number } | null = null;
      let lastSwingLow: { index: number; price: number } | null = null;
      let currentTrend: 1 | -1 = 1;

      for (let i = 0; i < calcCandles.length; i++) {
        const t = calcTimes[i];
        if (!t || isNaN(t) || t <= 0) continue;

        // Confirmação de pivôs no passado (p = i - len)
        const p = i - len;
        if (p >= len && p < calcCandles.length) {
          const pHigh = Number(calcCandles[p]?.high);
          const pLow = Number(calcCandles[p]?.low);

          if (isFinite(pHigh) && isFinite(pLow) && pHigh > 0 && pLow > 0) {
            let isHigh = true;
            let isLow = true;
            for (let k = 1; k <= len; k++) {
              const kPrevHigh = Number(calcCandles[p - k]?.high) || 0;
              const kNextHigh = Number(calcCandles[p + k]?.high) || 0;
              const kPrevLow = Number(calcCandles[p - k]?.low) || 0;
              const kNextLow = Number(calcCandles[p + k]?.low) || 0;

              if (pHigh <= kPrevHigh || pHigh <= kNextHigh) isHigh = false;
              if (pLow >= kPrevLow || pLow >= kNextLow) isLow = false;
            }

            if (isHigh) {
              lastSwingHigh = { index: p, price: pHigh };
            }
            if (isLow) {
              lastSwingLow = { index: p, price: pLow };
            }
          }
        }

        const curClose = Number(calcCandles[i]?.close);
        if (!isFinite(curClose) || curClose <= 0) continue;

        // Bullish Breakout acima de lastSwingHigh imediatamente no candle i
        if (lastSwingHigh && curClose > lastSwingHigh.price) {
          const isBOS = currentTrend === 1;
          const label = isBOS ? 'BOS ▲' : 'CHoCH ▲';
          const color = isBOS ? '#06b6d4' : '#a855f7';

          if (!markers.some(m => m.time === t)) {
            markers.push({
              time: t,
              position: 'belowBar',
              color,
              shape: 'arrowUp',
              text: label
            });
          }

          currentTrend = 1;
          lastSwingHigh = null;
        }

        // Bearish Breakout abaixo de lastSwingLow imediatamente no candle i
        if (lastSwingLow && curClose < lastSwingLow.price) {
          const isBOS = currentTrend === -1;
          const label = isBOS ? 'BOS ▼' : 'CHoCH ▼';
          const color = isBOS ? '#ec4899' : '#f43f5e';

          if (!markers.some(m => m.time === t)) {
            markers.push({
              time: t,
              position: 'aboveBar',
              color,
              shape: 'arrowDown',
              text: label
            });
          }

          currentTrend = -1;
          lastSwingLow = null;
        }
      }

      return {
        id: cConfig.id,
        type: 'SMC_BOS_CHOCH',
        overlay: true,
        series: [],
        markers,
        customData: {
          markers: markers.map(m => ({ text: m.text, position: m.position, time: m.time }))
        }
      };
    }

    case 'SMC_Liquidity': {
      const markers: { time: number; position: 'aboveBar' | 'belowBar'; color: string; shape: 'square'; text: string }[] = [];
      const isClosedMode = (cConfig.params?.barMode ?? 'closed') !== 'realtime';
      const calcCandles = (isClosedMode && candles.length >= 2) ? candles.slice(0, -1) : candles;
      const calcTimes = (isClosedMode && times.length >= 2) ? times.slice(0, -1) : times;

      for (let i = 2; i < calcCandles.length; i++) {
        const diffHigh = Math.abs(calcCandles[i].high - calcCandles[i - 1].high);
        const diffLow = Math.abs(calcCandles[i].low - calcCandles[i - 1].low);

        if (diffHigh <= 1.5) {
          markers.push({
            time: calcTimes[i],
            position: 'aboveBar',
            color: '#eab308',
            shape: 'square',
            text: 'EQH Liquidity'
          });
        }
        if (diffLow <= 1.5) {
          markers.push({
            time: calcTimes[i],
            position: 'belowBar',
            color: '#eab308',
            shape: 'square',
            text: 'EQL Liquidity'
          });
        }
      }

      return {
        id: cConfig.id,
        type: 'SMC_Liquidity',
        overlay: true,
        series: [],
        markers,
        customData: {
          liquidityPools: markers.map(m => ({ text: m.text, position: m.position, time: m.time }))
        }
      };
    }

    case 'Supertrend': {
      const period = Number(cConfig.params?.atrPeriod || cConfig.params?.period || 10);
      const factor = Number(cConfig.params?.multiplier || cConfig.params?.factor || 3.0);
      const isClosedMode = (cConfig.params?.barMode ?? 'closed') !== 'realtime';
      const calcCandles = (isClosedMode && candles.length >= 2) ? candles.slice(0, -1) : candles;
      const trendData: { time: number; value: number }[] = [];
      const markers: { time: number; position: 'aboveBar' | 'belowBar'; color: string; shape: 'arrowUp' | 'arrowDown'; text: string }[] = [];

      if (!calcCandles || calcCandles.length <= period) return null;

      const safeCandles: { high: number; low: number; close: number; time: number }[] = [];
      for (let i = 0; i < calcCandles.length; i++) {
        const c = calcCandles[i];
        if (!c) continue;
        const h = Number(c.high ?? c.close);
        const l = Number(c.low ?? c.close);
        const cl = Number(c.close);
        const t = times[i];
        if (isNaN(h) || isNaN(l) || isNaN(cl) || !isFinite(h) || !isFinite(l) || !isFinite(cl) || isNaN(t) || t <= 0) {
          continue;
        }
        safeCandles.push({ high: h, low: l, close: cl, time: t });
      }

      if (safeCandles.length <= period) return null;

      // 1. True Range (TR)
      const trList: number[] = [safeCandles[0].high - safeCandles[0].low];
      for (let i = 1; i < safeCandles.length; i++) {
        const h = safeCandles[i].high;
        const l = safeCandles[i].low;
        const prevC = safeCandles[i - 1].close;
        trList.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));
      }

      // 2. Wilder's RMA ATR (Padrão Oficial TradingView)
      const atrList: number[] = new Array(safeCandles.length).fill(0);
      let initialSum = 0;
      for (let i = 0; i < period; i++) {
        initialSum += trList[i];
      }
      let prevAtr = initialSum / period;
      atrList[period - 1] = prevAtr;

      for (let i = period; i < safeCandles.length; i++) {
        const curAtr = (prevAtr * (period - 1) + trList[i]) / period;
        atrList[i] = curAtr;
        prevAtr = curAtr;
      }

      // 3. Bandas Supertrend e Rastreio de Tendência Imutável
      const upperBand: number[] = new Array(safeCandles.length).fill(0);
      const lowerBand: number[] = new Array(safeCandles.length).fill(0);
      const trendArr: number[] = new Array(safeCandles.length).fill(1);

      const hl2_0 = (safeCandles[period - 1].high + safeCandles[period - 1].low) / 2;
      const atr_0 = atrList[period - 1];
      upperBand[period - 1] = hl2_0 + factor * atr_0;
      lowerBand[period - 1] = hl2_0 - factor * atr_0;
      trendArr[period - 1] = safeCandles[period - 1].close >= hl2_0 ? 1 : -1;

      for (let i = period; i < safeCandles.length; i++) {
        const hl2 = (safeCandles[i].high + safeCandles[i].low) / 2;
        const atr = atrList[i];
        const basicUpper = hl2 + factor * atr;
        const basicLower = hl2 - factor * atr;

        const prevUpper = upperBand[i - 1];
        const prevLower = lowerBand[i - 1];
        const prevClose = safeCandles[i - 1].close;
        const prevTrend = trendArr[i - 1];

        // Trailing Stop de Compra (só sobe se candle anterior estava acima do stop)
        const currLower = (prevClose > prevLower) ? Math.max(basicLower, prevLower) : basicLower;
        // Trailing Stop de Venda (só desce se candle anterior estava abaixo do stop)
        const currUpper = (prevClose < prevUpper) ? Math.min(basicUpper, prevUpper) : basicUpper;

        lowerBand[i] = currLower;
        upperBand[i] = currUpper;

        // Determinação Estrita de Tendência
        let currTrend = prevTrend;
        if (prevTrend === 1 && safeCandles[i].close < prevLower) {
          currTrend = -1;
        } else if (prevTrend === -1 && safeCandles[i].close > prevUpper) {
          currTrend = 1;
        }
        trendArr[i] = currTrend;

        const t = safeCandles[i].time;

        // Marcadores de Virada de Tendência
        if (currTrend !== prevTrend) {
          if (currTrend === 1) {
            markers.push({
              time: t,
              position: 'belowBar',
              color: '#22c55e',
              shape: 'arrowUp',
              text: 'COMPRA'
            });
          } else {
            markers.push({
              time: t,
              position: 'aboveBar',
              color: '#ef4444',
              shape: 'arrowDown',
              text: 'VENDA'
            });
          }
        }

        const val = currTrend === 1 ? currLower : currUpper;
        if (typeof val === 'number' && !isNaN(val) && isFinite(val)) {
          trendData.push({ time: t, value: val });
        }
      }

      const finalTrend = applyClosedBarStabilization(trendData, isClosedMode, lastTime);

      return {
        id: cConfig.id,
        type: 'Supertrend',
        overlay: true,
        series: [
          {
            name: `Supertrend (${period}, ${factor})`,
            type: 'line',
            color: cConfig.style?.color || '#3b82f6',
            lineWidth: (cConfig.style?.lineWidth || 2) as any,
            data: sanitizeLineSeriesData(finalTrend)
          }
        ],
        markers
      };
    }

    case 'VOLUME_HEATMAP': {
      const result = calculateVolumeProfileAnalysis(candles, {
        sessionMode: cConfig.params.sessionMode || 'all',
        customStart: cConfig.params.customStart || '09:00',
        customEnd: cConfig.params.customEnd || '18:00',
        systemSessionStart: options?.systemSessionStart,
        systemSessionEnd: options?.systemSessionEnd,
        lookbackDays: cConfig.params.lookbackDays || 1,
        lookbackBars: cConfig.params.lookbackBars || 30,
        binsCount: cConfig.params.binsCount || 50
      });

      if (!result) return null;

      return {
        id: cConfig.id,
        type: 'VOLUME_HEATMAP',
        overlay: true,
        series: [],
        customData: {
          volumeProfile: result,
          maxOpacity: cConfig.params.maxOpacity ?? 22,
          colorTheme: cConfig.params.colorTheme || 'cyberpunk',
          minThreshold: cConfig.params.minThreshold ?? 10
        }
      };
    }

    case 'VOLUME_LEVELS': {
      const showPoc = cConfig.params.showPoc ?? true;
      const showVahVal = cConfig.params.showVahVal ?? true;
      const valueAreaPct = cConfig.params.valueAreaPct || 70;

      const result = calculateVolumeProfileAnalysis(candles, {
        sessionMode: cConfig.params.sessionMode || 'all',
        customStart: cConfig.params.customStart || '09:00',
        customEnd: cConfig.params.customEnd || '18:00',
        systemSessionStart: options?.systemSessionStart,
        systemSessionEnd: options?.systemSessionEnd,
        lookbackDays: cConfig.params.lookbackDays || 1,
        lookbackBars: cConfig.params.lookbackBars || 30,
        valueAreaPct
      });

      if (!result) return null;

      return {
        id: cConfig.id,
        type: 'VOLUME_LEVELS',
        overlay: true,
        series: [],
        customData: {
          volumeProfile: result,
          showPoc,
          showVahVal,
          showNakedPocs: cConfig.params.showNakedPocs ?? true,
          pocColor: cConfig.style.color || '#f59e0b',
          vahColor: cConfig.style.secondaryColor || '#06b6d4',
          valColor: cConfig.style.tertiaryColor || '#a855f7'
        }
      };
    }

    case 'VOLUME_HVN_BLOCKS': {
      const topNodesCount = cConfig.params.topNodesCount || 3;
      const blockThicknessPct = cConfig.params.blockThicknessPct || 0.5;

      const result = calculateVolumeProfileAnalysis(candles, {
        sessionMode: cConfig.params.sessionMode || 'all',
        customStart: cConfig.params.customStart || '09:00',
        customEnd: cConfig.params.customEnd || '18:00',
        systemSessionStart: options?.systemSessionStart,
        systemSessionEnd: options?.systemSessionEnd,
        lookbackDays: cConfig.params.lookbackDays || 1,
        lookbackBars: cConfig.params.lookbackBars || 30,
        topNodesCount,
        blockThicknessPct
      });

      if (!result) return null;

      return {
        id: cConfig.id,
        type: 'VOLUME_HVN_BLOCKS',
        overlay: true,
        series: [],
        customData: {
          volumeProfile: result,
          blockOpacity: cConfig.params.blockOpacity ?? 25,
          blockColor: cConfig.style.color || '#3b82f6'
        }
      };
    }

    case 'LEVELS_SESSION_PERCENT': {
      const sessionStartStr = cConfig.params.sessionStart || '19:00';
      const stepPercent = Number(cConfig.params.stepPercent) || 0.5;
      const showCenter = cConfig.params.showCenter !== false;
      const showUpper1 = cConfig.params.showUpper1 !== false;
      const showUpper2 = cConfig.params.showUpper2 !== false;
      const showUpper3 = cConfig.params.showUpper3 !== false;
      const showUpper4 = cConfig.params.showUpper4 === true;
      const showUpper5 = cConfig.params.showUpper5 === true;
      const showLower1 = cConfig.params.showLower1 !== false;
      const showLower2 = cConfig.params.showLower2 !== false;
      const showLower3 = cConfig.params.showLower3 !== false;
      const showLower4 = cConfig.params.showLower4 === true;
      const showLower5 = cConfig.params.showLower5 === true;

      const targetStartStr = (sessionStartStr ? sessionStartStr.slice(0, 5) : '19:00');

      const upColor = cConfig.style.color || '#22c55e';
      const lowColor = cConfig.style.secondaryColor || '#ef4444';
      const upLineWidth = cConfig.style.lineWidth || 1;
      const upLineStyle = cConfig.style.lineStyle === 'solid' ? 0 : cConfig.style.lineStyle === 'dotted' ? 1 : 2;

      const sysStart = options?.systemSessionStart || '20:00:00';

      // Agrupar estritamente por Sessão Operacional do Sistema (ex: Domingo 19h -> Segunda 17h59) no fuso de Brasília
      const sessionsMap = new Map<string, { candle: Candle; time: number; timeStr: string }[]>();
      for (let i = 0; i < candles.length; i++) {
        const t = times[i];
        const sInfo = getCandleSessionInfo(candles[i], sysStart, 'all');
        if (!sInfo) continue;
        const sessionKey = sInfo.sessionKey;

        if (!sessionsMap.has(sessionKey)) {
          sessionsMap.set(sessionKey, []);
        }
        sessionsMap.get(sessionKey)!.push({ candle: candles[i], time: t, timeStr: sInfo.timeStr });
      }

      const series: CalculatedIndicatorSeries['series'] = [];

      sessionsMap.forEach((sData, sessionKey) => {
        if (sData.length === 0) return;

        // Localizar a primeira vela a partir do horário de abertura configurado (targetStartStr)
        let openIndex = -1;
        for (let i = 0; i < sData.length; i++) {
          if (sData[i].timeStr >= targetStartStr) {
            openIndex = i;
            break;
          }
        }
        if (openIndex === -1) {
          openIndex = 0;
        }

        const sessionOpen = Number(sData[openIndex].candle.open || sData[openIndex].candle.close || 0);
        if (sessionOpen <= 0) return;

        const open = sessionOpen;
        const centerData: { time: number; value: number }[] = [];
        const up1Data: { time: number; value: number }[] = [];
        const up2Data: { time: number; value: number }[] = [];
        const up3Data: { time: number; value: number }[] = [];
        const up4Data: { time: number; value: number }[] = [];
        const up5Data: { time: number; value: number }[] = [];
        const low1Data: { time: number; value: number }[] = [];
        const low2Data: { time: number; value: number }[] = [];
        const low3Data: { time: number; value: number }[] = [];
        const low4Data: { time: number; value: number }[] = [];
        const low5Data: { time: number; value: number }[] = [];

        // Plotagem contínua através da meia-noite (23:59 -> 00:00 -> 18:00) para todas as velas da sessão
        for (let i = openIndex; i < sData.length; i++) {
          const t = sData[i].time;
          if (showCenter) centerData.push({ time: t, value: open });
          if (showUpper1) up1Data.push({ time: t, value: open * (1 + (stepPercent * 1) / 100) });
          if (showUpper2) up2Data.push({ time: t, value: open * (1 + (stepPercent * 2) / 100) });
          if (showUpper3) up3Data.push({ time: t, value: open * (1 + (stepPercent * 3) / 100) });
          if (showUpper4) up4Data.push({ time: t, value: open * (1 + (stepPercent * 4) / 100) });
          if (showUpper5) up5Data.push({ time: t, value: open * (1 + (stepPercent * 5) / 100) });
          if (showLower1) low1Data.push({ time: t, value: open * (1 - (stepPercent * 1) / 100) });
          if (showLower2) low2Data.push({ time: t, value: open * (1 - (stepPercent * 2) / 100) });
          if (showLower3) low3Data.push({ time: t, value: open * (1 - (stepPercent * 3) / 100) });
          if (showLower4) low4Data.push({ time: t, value: open * (1 - (stepPercent * 4) / 100) });
          if (showLower5) low5Data.push({ time: t, value: open * (1 - (stepPercent * 5) / 100) });
        }

        if (showCenter && centerData.length > 0) {
          series.push({
            name: `Abertura (${sessionKey})`,
            type: 'line',
            color: '#ffffff',
            lineWidth: Math.min(4, upLineWidth + 1) as any,
            lineStyle: 0,
            data: centerData
          });
        }

        const addLevelSeries = (name: string, data: typeof up1Data, color: string) => {
          if (data.length > 0) {
            series.push({
              name: `${name} (${sessionKey})`,
              type: 'line',
              color,
              lineWidth: upLineWidth,
              lineStyle: upLineStyle,
              data
            });
          }
        };

        if (showUpper1) addLevelSeries(`+${stepPercent * 1}%`, up1Data, upColor);
        if (showUpper2) addLevelSeries(`+${stepPercent * 2}%`, up2Data, upColor);
        if (showUpper3) addLevelSeries(`+${stepPercent * 3}%`, up3Data, upColor);
        if (showUpper4) addLevelSeries(`+${stepPercent * 4}%`, up4Data, upColor);
        if (showUpper5) addLevelSeries(`+${stepPercent * 5}%`, up5Data, upColor);

        if (showLower1) addLevelSeries(`-${stepPercent * 1}%`, low1Data, lowColor);
        if (showLower2) addLevelSeries(`-${stepPercent * 2}%`, low2Data, lowColor);
        if (showLower3) addLevelSeries(`-${stepPercent * 3}%`, low3Data, lowColor);
        if (showLower4) addLevelSeries(`-${stepPercent * 4}%`, low4Data, lowColor);
        if (showLower5) addLevelSeries(`-${stepPercent * 5}%`, low5Data, lowColor);
      });

      return {
        id: cConfig.id,
        type: 'LEVELS_SESSION_PERCENT',
        overlay: true,
        series
      };
    }

    case 'LEVELS_TIME_RANGE': {
      const isAllSession = cConfig.params.sessionMode === 'all' || cConfig.params.useFullSession === true;
      const sysStart = options?.systemSessionStart || '20:00:00';
      const sysEnd = options?.systemSessionEnd || '18:00:00';

      const startTimeStr = isAllSession
        ? sysStart.slice(0, 5)
        : (cConfig.params.startTime || '09:00').slice(0, 5);
      const endTimeStr = isAllSession
        ? sysEnd.slice(0, 5)
        : (cConfig.params.endTime || '09:30').slice(0, 5);
      const showHigh = cConfig.params.showHigh !== false;
      const showLow = cConfig.params.showLow !== false;
      const showMid = cConfig.params.showMid !== false;
      const extendSession = isAllSession ? true : (cConfig.params.extendSession !== false);

      // Agrupar estritamente por Sessão Operacional do Sistema (fuso de Brasília UTC-3)
      const sessionsMap = new Map<string, { candle: Candle; time: number; timeStr: string }[]>();
      for (let i = 0; i < candles.length; i++) {
        const t = times[i];
        const sInfo = getCandleSessionInfo(candles[i], sysStart, 'all');
        if (!sInfo) continue;
        const sessionKey = sInfo.sessionKey;

        if (!sessionsMap.has(sessionKey)) {
          sessionsMap.set(sessionKey, []);
        }
        sessionsMap.get(sessionKey)!.push({ candle: candles[i], time: t, timeStr: sInfo.timeStr });
      }

      const highColor = cConfig.style.color || '#06b6d4';
      const lowColor = cConfig.style.secondaryColor || '#f97316';
      const rLineWidth = cConfig.style.lineWidth || 2;
      const rLineStyle = cConfig.style.lineStyle === 'dashed' ? 2 : cConfig.style.lineStyle === 'dotted' ? 1 : 0;

      const series: CalculatedIndicatorSeries['series'] = [];
      const timeRangeDays: {
        dateKey: string;
        rangeHigh: number;
        rangeLow: number;
        mid: number;
        rangePoints: number;
        startTime: number;
        endTime: number;
        isAllSession?: boolean;
      }[] = [];

      sessionsMap.forEach((sData, sessionKey) => {
        let rangeHigh = -Infinity;
        let rangeLow = Infinity;
        let startWindowIdx = -1;
        let endWindowIdx = -1;

        if (isAllSession) {
          // Modo Toda a Sessão: considera todos os candles formados nesta sessão desde a abertura (ex: 19h)
          startWindowIdx = 0;
          endWindowIdx = sData.length - 1;
          for (let i = 0; i < sData.length; i++) {
            const h = Number(sData[i].candle.high ?? sData[i].candle.close ?? 0);
            const l = Number(sData[i].candle.low ?? sData[i].candle.close ?? 0);
            if (h > rangeHigh) rangeHigh = h;
            if (l < rangeLow) rangeLow = l;
          }
        } else {
          // Modo Customizado: identificar candles da janela personalizada [startTimeStr, endTimeStr]
          for (let i = 0; i < sData.length; i++) {
            const tm = sData[i].timeStr;
            let inWin = false;
            if (startTimeStr <= endTimeStr) {
              inWin = tm >= startTimeStr && tm <= endTimeStr;
            } else {
              inWin = tm >= startTimeStr || tm <= endTimeStr;
            }

            if (inWin) {
              if (startWindowIdx === -1) startWindowIdx = i;
              endWindowIdx = i;
              const h = Number(sData[i].candle.high ?? sData[i].candle.close ?? 0);
              const l = Number(sData[i].candle.low ?? sData[i].candle.close ?? 0);
              if (h > rangeHigh) rangeHigh = h;
              if (l < rangeLow) rangeLow = l;
            }
          }
        }

        // Se a sessão ainda não atingiu o horário inicial de abertura ou não tem dados válidos
        if (rangeHigh === -Infinity || rangeLow === Infinity || rangeHigh < rangeLow || startWindowIdx === -1) return;

        const mid = (rangeHigh + rangeLow) / 2;
        const dayHigh: { time: number; value: number }[] = [];
        const dayLow: { time: number; value: number }[] = [];
        const dayMid: { time: number; value: number }[] = [];

        // Plotagem contínua: do início da janela de referência até o fim da sessão (mesmo após 23:59 até 18:00)
        const plotEndIdx = (extendSession || isAllSession) ? sData.length - 1 : (endWindowIdx !== -1 ? endWindowIdx : sData.length - 1);
        for (let i = startWindowIdx; i <= plotEndIdx; i++) {
          const t = sData[i].time;
          if (showHigh) dayHigh.push({ time: t, value: rangeHigh });
          if (showLow) dayLow.push({ time: t, value: rangeLow });
          if (showMid) dayMid.push({ time: t, value: mid });
        }

        const sTime = (dayMid[0]?.time) || (dayHigh[0]?.time) || (dayLow[0]?.time) || 0;
        const eTime = (dayMid[dayMid.length - 1]?.time) || (dayHigh[dayHigh.length - 1]?.time) || (dayLow[dayLow.length - 1]?.time) || 0;
        timeRangeDays.push({
          dateKey: sessionKey,
          rangeHigh,
          rangeLow,
          mid,
          rangePoints: rangeHigh - rangeLow,
          startTime: sTime,
          endTime: eTime,
          isAllSession
        });

        const highLabel = isAllSession ? `Máx Sessão (${sessionKey})` : `Máx (${sessionKey})`;
        const lowLabel = isAllSession ? `Mín Sessão (${sessionKey})` : `Mín (${sessionKey})`;
        const midLabel = isAllSession ? `Médio Sessão 50% (${sessionKey})` : `Médio 50% (${sessionKey})`;

        if (showHigh && dayHigh.length > 0) {
          series.push({
            name: highLabel,
            type: 'line',
            color: highColor,
            lineWidth: rLineWidth,
            lineStyle: rLineStyle,
            data: dayHigh
          });
        }

        if (showLow && dayLow.length > 0) {
          series.push({
            name: lowLabel,
            type: 'line',
            color: lowColor,
            lineWidth: rLineWidth,
            lineStyle: rLineStyle,
            data: dayLow
          });
        }

        if (showMid && dayMid.length > 0) {
          series.push({
            name: midLabel,
            type: 'line',
            color: '#eab308',
            lineWidth: 1,
            lineStyle: 2,
            data: dayMid
          });
        }
      });

      return {
        id: cConfig.id,
        type: 'LEVELS_TIME_RANGE',
        overlay: true,
        series,
        customData: {
          timeRangeDays,
          showMid
        }
      };
    }

    case 'LEVELS_DAILY': {
      let fallbackDaily: {
        prevH?: number;
        prevL?: number;
        prev?: number;
        max1d?: number;
        min1d?: number;
      } | null = null;

      if (candles && candles.length >= 5) {
        const sysStart = options?.systemSessionStart || '20:00:00';
        const sessionsMap = new Map<string, { high: number; low: number; close: number }[]>();
        const sessionKeysOrder: string[] = [];

        for (let i = 0; i < candles.length; i++) {
          const c = candles[i];
          const sInfo = getCandleSessionInfo(c, sysStart, 'all');
          if (!sInfo) continue;
          const sKey = sInfo.sessionKey;
          if (!sessionsMap.has(sKey)) {
            sessionsMap.set(sKey, []);
            sessionKeysOrder.push(sKey);
          }
          sessionsMap.get(sKey)!.push({
            high: Number(c.high ?? c.close ?? 0),
            low: Number(c.low ?? c.close ?? 0),
            close: Number(c.close ?? 0)
          });
        }

        if (sessionKeysOrder.length >= 2) {
          const prevKey = sessionKeysOrder[sessionKeysOrder.length - 2];
          const prevCandles = sessionsMap.get(prevKey) || [];
          if (prevCandles.length > 0) {
            let pH = -Infinity;
            let pL = Infinity;
            for (const pc of prevCandles) {
              if (pc.high > pH) pH = pc.high;
              if (pc.low < pL) pL = pc.low;
            }
            const pClose = prevCandles[prevCandles.length - 1].close;

            let atrSum = 0;
            const atrLen = Math.min(14, candles.length - 1);
            for (let k = candles.length - atrLen; k < candles.length; k++) {
              const h = Number(candles[k].high ?? candles[k].close ?? 0);
              const l = Number(candles[k].low ?? candles[k].close ?? 0);
              atrSum += Math.abs(h - l);
            }
            const avgRange = atrLen > 0 ? atrSum / atrLen : 0;

            fallbackDaily = {
              prevH: pH !== -Infinity ? pH : undefined,
              prevL: pL !== Infinity ? pL : undefined,
              prev: pClose > 0 ? pClose : undefined,
              max1d: (pClose > 0 && avgRange > 0) ? pClose + (avgRange * 1.5) : undefined,
              min1d: (pClose > 0 && avgRange > 0) ? pClose - (avgRange * 1.5) : undefined
            };
          }
        }
      }

      return {
        id: cConfig.id,
        type: 'LEVELS_DAILY',
        overlay: true,
        series: [],
        customData: {
          showGamma: true,
          params: cConfig.params || {},
          fallbackDaily
        }
      };
    }

    case 'GammaLevels':
    case 'GAMMA_LEVELS':
    case 'LEVELS_GAMMA':
    case 'LEVELS_OPTIONS':
    case 'LEVELS_LIQUIDITY': {
      return {
        id: cConfig.id,
        type: cConfig.type,
        overlay: true,
        series: [],
        customData: {
          showGamma: true,
          params: cConfig.params || {}
        }
      };
    }

    case 'VOLUME_SPIKE_PIVOTS': {
      const barsToCheck = Math.max(3, Number(cConfig.params?.barsToCheck || 5));
      const volumeAvgPeriod = Math.max(1, Number(cConfig.params?.volumeAveragePeriod || 20));
      const volumeMultiple = Math.max(1.0, Number(cConfig.params?.volumeMultiple || 1.5));
      const maxHistory = Math.max(5, Number(cConfig.params?.maxHistoryPivots ?? cConfig.params?.maxActiveLines ?? 100));
      const showBreached = cConfig.params?.showBreachedLines !== false;
      const showMarkers = cConfig.params?.showMarkers === true;

      const highColor = cConfig.style?.color || '#22c55e';
      const lowColor = cConfig.style?.secondaryColor || '#ef4444';
      const lineWidth = (cConfig.style?.lineWidth || 2) as 1 | 2 | 3 | 4;
      const lineStyle = cConfig.style?.lineStyle === 'dashed' ? 2 : cConfig.style?.lineStyle === 'dotted' ? 1 : 0;

      const analysis = calculateVolumeSpikePivotsAnalysis(candles, {
        barsToCheck,
        volumeAveragePeriod: volumeAvgPeriod,
        volumeMultiple
      });

      if (!analysis.detectedPivots || analysis.detectedPivots.length === 0) {
        return {
          id: cConfig.id,
          type: 'VOLUME_SPIKE_PIVOTS',
          overlay: true,
          series: [],
          markers: [],
          customData: {
            analysis
          }
        };
      }

      const markers: { time: number; position: 'aboveBar' | 'belowBar'; color: string; shape: 'arrowUp' | 'arrowDown'; text: string }[] = [];
      if (showMarkers) {
        analysis.detectedPivots.forEach(pivot => {
          if (pivot.isPivotHigh) {
            markers.push({
              time: times[pivot.startIndex] || pivot.startTime,
              position: 'aboveBar',
              color: highColor,
              shape: 'arrowDown',
              text: `Spike High (${pivot.level.toFixed(1)})`
            });
          } else if (pivot.isPivotLow) {
            markers.push({
              time: times[pivot.startIndex] || pivot.startTime,
              position: 'belowBar',
              color: lowColor,
              shape: 'arrowUp',
              text: `Spike Low (${pivot.level.toFixed(1)})`
            });
          }
        });
      }

      // Montar dados para renderização acelerada no Canvas 2D (zero sobrecarga de séries no Lightweight Charts)
      const selectedPivots = showBreached
        ? analysis.detectedPivots.slice(-maxHistory)
        : analysis.activePivots.slice(-maxHistory);

      return {
        id: cConfig.id,
        type: 'VOLUME_SPIKE_PIVOTS',
        overlay: true,
        series: [], // Séries vazias para evitar criação e destruição contínua de dezenas de LineSeries no Lightweight Charts
        markers,
        customData: {
          analysis,
          selectedPivots,
          highColor,
          lowColor,
          lineWidth,
          lineStyle,
          showBreached,
          detectedPivots: analysis.detectedPivots,
          activePivots: analysis.activePivots,
          activeBuyLevels: analysis.activeBuyLevels,
          activeSellLevels: analysis.activeSellLevels,
          nearestBuyLevel: analysis.nearestBuyLevel,
          nearestSellLevel: analysis.nearestSellLevel,
          recentBuyLevel: analysis.recentBuyLevel,
          recentSellLevel: analysis.recentSellLevel,
          distanceToNearestBuy: analysis.distanceToNearestBuy,
          distanceToNearestSell: analysis.distanceToNearestSell,
          activeBuyCount: analysis.activeBuyCount,
          activeSellCount: analysis.activeSellCount,
          spikeStatus: analysis.spikeStatus,
          touchBuy: analysis.touchBuy,
          touchSell: analysis.touchSell,
          wasPivotHighBreachedLast: analysis.wasPivotHighBreachedLast
        }
      };
    }

    case 'TIME_HEATMAP': {
      const lookbackDays = Math.max(1, Number(cConfig.params?.lookbackDays || 10));
      const scope = cConfig.params?.scope || 'custom_window';
      const startTime = cConfig.params?.startTime || '09:30';
      const endTime = cConfig.params?.endTime || '12:30';
      const heatMode = cConfig.params?.heatMode || 'trend_volume';
      const hotThreshold = Math.max(40, Math.min(95, Number(cConfig.params?.hotThreshold || 70)));
      const showVerticalLines = cConfig.params?.showVerticalLines !== false;
      const verticalLineColor = cConfig.params?.verticalLineColor || '#38bdf888';
      const showGhostCandles = cConfig.params?.showGhostCandles !== false;
      const forecastCandlesCount = Math.max(1, Math.min(100, Number(cConfig.params?.forecastCandlesCount || 5)));
      const showForecastBadge = cConfig.params?.showForecastBadge !== false;
      const showExpansionCorridor = cConfig.params?.showExpansionCorridor !== false;

      const sysStart = options?.systemSessionStart || '19:00:00';

      const analysis = calculateTimeHeatmap(
        candles,
        {
          lookbackDays,
          scope,
          startTime,
          endTime,
          heatMode,
          hotThreshold,
          showGhostCandles,
          forecastCandlesCount,
          showForecastBadge,
          showExpansionCorridor
        },
        { systemSessionStart: sysStart, marketContext: options?.marketContext }
      );

      const scoreData: { time: number; value: number }[] = [];
      const thresholdData: { time: number; value: number }[] = [];

      for (const b of analysis.bars) {
        scoreData.push({ time: b.time, value: b.baselineScore ?? b.score });
        thresholdData.push({ time: b.time, value: hotThreshold });
      }

      return {
        id: cConfig.id,
        type: cConfig.type as 'TIME_HEATMAP' | 'TIME_HEATMAP_HURST',
        overlay: false,
        series: [
          {
            name: `Score Térmico (${heatMode === 'trend_volume' ? 'Tendência' : heatMode === 'volatility_range' ? 'Range' : 'RVOL'})`,
            type: 'line',
            color: cConfig.style?.color || '#f97316',
            lineWidth: (cConfig.style?.lineWidth || 2) as 1 | 2 | 3 | 4,
            data: scoreData
          },
          {
            name: `Limiar Zona Quente (${hotThreshold}%)`,
            type: 'line',
            color: cConfig.style?.secondaryColor || '#ef4444',
            lineWidth: 1,
            lineStyle: 2,
            data: thresholdData
          }
        ],
        customData: {
          analysis,
          windowLines: analysis.windowLines,
          ghostCandles: analysis.ghostCandles,
          sentimentGhostCandles: analysis.sentimentGhostCandles,
          corridor: analysis.corridor,
          forecastSummary: analysis.forecastSummary,
          sentimentForecastSummary: analysis.sentimentForecastSummary,
          sentimentConfluence: analysis.sentimentConfluence,
          showVerticalLines,
          verticalLineColor,
          showGhostCandles,
          forecastCandlesCount,
          showForecastBadge,
          showExpansionCorridor,
          currentStatus: analysis.currentStatus,
          currentScore: analysis.currentScore,
          hotThreshold
        }
      };
    }

    case 'CANDLE_PATTERNS': {
      const showEngolfo = cConfig.params.showEngolfo !== false;
      const minPointsEngolfo = Number(cConfig.params.minPointsEngolfo) || 0;
      const barModeEngolfo = cConfig.params.barModeEngolfo || 'closed';
      const soundEngolfo = cConfig.params.soundEngolfo || 'none';

      const showPinbar = cConfig.params.showPinbar !== false;
      const minPointsPinbar = Number(cConfig.params.minPointsPinbar) || 0;
      const barModePinbar = cConfig.params.barModePinbar || 'closed';
      const soundPinbar = cConfig.params.soundPinbar || 'none';

      const showPattern180 = cConfig.params.showPattern180 !== false;
      const minPoints180 = Number(cConfig.params.minPoints180) || 0;
      const barMode180 = cConfig.params.barMode180 || 'closed';
      const sound180 = cConfig.params.sound180 || 'none';

      const showStar3Candles = cConfig.params.showStar3Candles !== false;
      const minPointsStar3 = Number(cConfig.params.minPointsStar3) || 0;
      const barModeStar3 = cConfig.params.barModeStar3 || 'closed';
      const soundStar3 = cConfig.params.soundStar3 || 'none';

      const showChute = cConfig.params.showChute !== false;
      const minPointsChute = Number(cConfig.params.minPointsChute) || 0;
      const barModeChute = cConfig.params.barModeChute || 'closed';
      const soundChute = cConfig.params.soundChute || 'none';

      const buyColor = cConfig.style?.color || '#22c55e';
      const sellColor = cConfig.style?.secondaryColor || '#ef4444';

      const markers: CalculatedIndicatorSeries['markers'] = [];
      const lastIndex = candles.length - 1;

      // Detecção inteligente de barra em formação vs barra já fechada
      const lastCandle = candles[lastIndex];
      let lastCandleMs = 0;
      if (lastCandle?.timestamp) {
        lastCandleMs = new Date(lastCandle.timestamp).getTime();
      } else if (typeof (lastCandle as any)?.time === 'number') {
        const tNum = (lastCandle as any).time;
        lastCandleMs = tNum < 1e11 ? (tNum * 1000) : tNum;
      }

      let tfMinutes = Number(options?.timeframeMinutes) || 1;
      if (candles.length >= 2 && (!options?.timeframeMinutes || options.timeframeMinutes <= 1)) {
        const dtSec = Math.abs((times[times.length - 1] || 0) - (times[times.length - 2] || 0));
        if (dtSec >= 60 && dtSec <= 86400) {
          tfMinutes = Math.round(dtSec / 60);
        }
      }
      const barDurationMs = Math.max(60000, tfMinutes * 60000);
      const isLastCandleForming = lastCandleMs > 0 && (Date.now() - lastCandleMs < barDurationMs);

      // Itera candles a partir do índice 2 para garantir histórico de 3 velas
      for (let i = 2; i < candles.length; i++) {
        const isLastCandle = i === lastIndex;
        const isForming = isLastCandle && isLastCandleForming;
        const c1 = candles[i];     // Vela gatilho (atual fechada ou em tempo real se barMode permitir)
        const c2 = candles[i - 1]; // Vela anterior
        const c3 = candles[i - 2]; // Vela prévia (2 barras atrás)
        const t = times[i];

        const o1 = Number(c1.open), c1Val = Number(c1.close), h1 = Number(c1.high), l1 = Number(c1.low);
        const o2 = Number(c2.open), c2Val = Number(c2.close), h2 = Number(c2.high), l2 = Number(c2.low);
        const o3 = Number(c3.open), c3Val = Number(c3.close), h3 = Number(c3.high), l3 = Number(c3.low);

        const isBull1 = c1Val > o1;
        const isBear1 = c1Val < o1;
        const isBull2 = c2Val > o2;
        const isBear2 = c2Val < o2;
        const isBull3 = c3Val > o3;
        const isBear3 = c3Val < o3;

        const range1 = h1 - l1;

        // 1. PINBAR / MARTELO / SHOOTING STAR (P)
        // Para melhor garantia: fechamento de acordo com a cor (Compra: isBull1; Venda: isBear1)
        if (showPinbar && (!isForming || barModePinbar === 'realtime') && range1 > 0 && range1 >= minPointsPinbar) {
          const lowerWick1 = Math.min(o1, c1Val) - l1;
          const upperWick1 = h1 - Math.max(o1, c1Val);
          if (isBull1 && lowerWick1 / range1 >= 0.55) {
            markers.push({
              time: t,
              position: 'belowBar',
              color: buyColor,
              shape: 'circle',
              text: 'P',
              sound: soundPinbar
            });
          } else if (isBear1 && upperWick1 / range1 >= 0.55) {
            markers.push({
              time: t,
              position: 'aboveBar',
              color: sellColor,
              shape: 'circle',
              text: 'P',
              sound: soundPinbar
            });
          }
        }

        // 2. ENGOLFO (E)
        if (showEngolfo && (!isForming || barModeEngolfo === 'realtime') && range1 >= minPointsEngolfo) {
          if (h1 > h2 && l1 < l2) {
            if (isBull1 && isBear2) {
              markers.push({
                time: t,
                position: 'belowBar',
                color: buyColor,
                shape: 'circle',
                text: 'E',
                sound: soundEngolfo
              });
            } else if (isBear1 && isBull2) {
              markers.push({
                time: t,
                position: 'aboveBar',
                color: sellColor,
                shape: 'circle',
                text: 'E',
                sound: soundEngolfo
              });
            }
          }
        }

        // 3. BULL 180 / BEAR 180 (B)
        // O tamanho mínimo é avaliado com base no Candle 2 (range2 >= minPoints180)
        // Bull 180: Candle 1 verde fecha acima da abertura do candle anterior (c1Val >= o2) e tamanho do candle 1 cobre pelo menos 80% do candle 2 (range1 >= range2 * 0.8)
        // Bear 180: Candle 1 vermelho fecha abaixo da abertura do candle anterior (c1Val <= o2) e tamanho do candle 1 cobre pelo menos 80% do candle 2 (range1 >= range2 * 0.8)
        if (showPattern180 && (!isForming || barMode180 === 'realtime')) {
          const range2 = h2 - l2;
          const meetsMinPoints2 = range2 >= minPoints180;
          const meetsSize80 = range2 > 0 ? (range1 >= range2 * 0.80) : true;

          if (meetsMinPoints2 && isBear2 && isBull1 && c1Val >= o2 && meetsSize80) {
            markers.push({
              time: t,
              position: 'belowBar',
              color: buyColor,
              shape: 'circle',
              text: 'B',
              sound: sound180
            });
          } else if (meetsMinPoints2 && isBull2 && isBear1 && c1Val <= o2 && meetsSize80) {
            markers.push({
              time: t,
              position: 'aboveBar',
              color: sellColor,
              shape: 'circle',
              text: 'B',
              sound: sound180
            });
          }
        }

        // 4. ESTRELA DE REVERSÃO / 3 CANDLES (3)
        if (showStar3Candles && (!isForming || barModeStar3 === 'realtime') && range1 >= minPointsStar3) {
          const mid3 = (h3 + l3) / 2;
          // Compra (Morning Reversal / 3 Candles Alta):
          // Candle 3: baixa (isBear3)
          // Candle 2: baixa (isBear2) com mínima menor que o candle 3 (l2 < l3)
          // Candle 1 (Gatilho): alta (isBull1), máxima acima da máxima do candle 2 (h1 > h2), mínima abaixo da mínima do candle 2 (l1 < l2) e fechamento acima do fechamento do candle 2 (c1Val > c2Val)
          // Regra de Não Invasão: máxima do candle 1 abaixo da metade do range do candle 3 (h1 <= mid3)
          if (isBear3 && isBear2 && isBull1 && l2 < l3 && h1 > h2 && l1 < l2 && c1Val > c2Val && h1 <= mid3) {
            markers.push({
              time: t,
              position: 'belowBar',
              color: buyColor,
              shape: 'circle',
              text: '3',
              sound: soundStar3
            });
          }
          // Venda (Evening Reversal / 3 Candles Baixa):
          // Candle 3: alta (isBull3)
          // Candle 2: alta (isBull2) com máxima maior que o candle 3 (h2 > h3)
          // Candle 1 (Gatilho): baixa (isBear1), máxima acima da máxima do candle 2 (h1 > h2), mínima abaixo da mínima do candle 2 (l1 < l2) e fechamento abaixo do fechamento do candle 2 (c1Val < c2Val)
          // Regra de Não Invasão: mínima do candle 1 acima da metade do range do candle 3 (l1 >= mid3)
          else if (isBull3 && isBull2 && isBear1 && h2 > h3 && h1 > h2 && l1 < l2 && c1Val < c2Val && l1 >= mid3) {
            markers.push({
              time: t,
              position: 'aboveBar',
              color: sellColor,
              shape: 'circle',
              text: '3',
              sound: soundStar3
            });
          }
        }

        // 5. CHUTE / KICKING PATTERN (C)
        // Dois candles fortes de direções opostas com gap entre eles e pavios <= 30% do corpo
        if (showChute && (!isForming || barModeChute === 'realtime') && range1 >= minPointsChute) {
          const body1 = Math.abs(c1Val - o1);
          const body2 = Math.abs(c2Val - o2);
          const totalWicks1 = range1 - body1;
          const range2 = h2 - l2;
          const totalWicks2 = range2 - body2;

          // Pavios não devem representar mais de 30% do corpo
          const isMarubozu1 = body1 > 0 && (totalWicks1 / body1) <= 0.30;
          const isMarubozu2 = body2 > 0 && (totalWicks2 / body2) <= 0.30;

          if (isMarubozu1 && isMarubozu2) {
            // Chute de Alta (Kicking Bullish):
            // Candle 2: Baixa / Black Marubozu
            // Candle 1: Alta / White Marubozu com Gap de Alta (l1 > h2 ou o1 > o2)
            if (isBear2 && isBull1 && (l1 > h2 || o1 > o2)) {
              markers.push({
                time: t,
                position: 'belowBar',
                color: buyColor,
                shape: 'circle',
                text: 'C',
                sound: soundChute
              });
            }
            // Chute de Baixa (Kicking Bearish):
            // Candle 2: Alta / White Marubozu
            // Candle 1: Baixa / Black Marubozu com Gap de Baixa (h1 < l2 || o1 < o2)
            else if (isBull2 && isBear1 && (h1 < l2 || o1 < o2)) {
              markers.push({
                time: t,
                position: 'aboveBar',
                color: sellColor,
                shape: 'circle',
                text: 'C',
                sound: soundChute
              });
            }
          }
        }
      }

      return {
        id: cConfig.id,
        type: 'CANDLE_PATTERNS',
        overlay: true,
        series: [],
        markers
      };
    }

    case 'AXION_ML_PREDICTOR': {
      // 🧠 Axion ML Predictor NQ (+25/-12)
      // Inferência LightGBM em tempo real com Radar Bidirecional (Compra & Venda) e Projeções de Alvo
      const thresholdCompra = Number(cConfig.params?.thresholdCompra) || 0.35;
      const thresholdVenda = Number(cConfig.params?.thresholdVenda) || 0.35;
      const armingThreshold = Number(cConfig.params?.armingThreshold) || 0.325;
      const armingThresholdVenda = Number(cConfig.params?.armingThresholdVenda) || 0.325;
      const minAtr14 = Number(cConfig.params?.minAtr14) || 5.0;
      const maxDistSma60 = Number(cConfig.params?.maxDistSma60) || 80.0;
      const filterRth = cConfig.params?.filterRth === true; // Default false para 24h
      const showTargets = cConfig.params?.showTargets !== false;
      const isClosedMode = cConfig.params?.barMode === 'closed';
      const soundSignal = cConfig.params?.soundSignal || 'cyber_pulse';
      const alternateSignals = cConfig.params?.alternateSignals !== false; // Default true: não repete mesmo lado consecutivamente
      const minCooldownBars = Number(cConfig.params?.minCooldownBars ?? 5); // Intervalo mínimo de barras entre sinais
      const labelStyle = cConfig.params?.labelStyle || 'percentage_only'; // Default: apenas o percentual limpo

      const markers: any[] = [];

      if (!candles || candles.length < 65) {
        return {
          id: cConfig.id,
          type: 'AXION_ML_PREDICTOR',
          overlay: true,
          series: [],
          markers: [],
          customData: {
            radar: {
              status: 'Aguardando mais candles...',
              direction: 'NEUTRO',
              probability: 0,
              probBuy: 0,
              probSell: 0,
              isArming: false,
              isSignal: false,
              rthActive: false,
              atr14: 0,
              distSma60: 0
            }
          }
        };
      }

      // Arrays auxiliares para médias móveis e indicadores
      const nCandles = candles.length;
      const closes = new Float64Array(nCandles);
      const highs = new Float64Array(nCandles);
      const lows = new Float64Array(nCandles);
      const opens = new Float64Array(nCandles);
      const volumes = new Float64Array(nCandles);
      const trs = new Float64Array(nCandles);

      for (let i = 0; i < nCandles; i++) {
        const c = candles[i];
        opens[i] = Number(c.open);
        highs[i] = Number(c.high);
        lows[i] = Number(c.low);
        closes[i] = Number(c.close);
        volumes[i] = Number(c.volume || 0);

        if (i === 0) {
          trs[i] = highs[i] - lows[i];
        } else {
          const prevC = closes[i - 1];
          trs[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - prevC), Math.abs(lows[i] - prevC));
        }
      }

      // Variáveis para sessão diária
      let currentSessionDate = '';
      let sessionHigh = -Infinity;
      let sessionLow = Infinity;
      let lastActiveSignalTime = 0;
      let lastSignalDirection: 'COMPRA' | 'VENDA' | null = null;
      let lastSignalBarIndex = -999;

      // Resolução da Remodelagem / Estudo de Machine Learning selecionado
      const selectedModelKey = String(cConfig.params?.selectedModel || 'auto');
      const allCachedStudies = getCachedMLStudies();
      let activeStudy: StudyRecord | null = null;

      if (selectedModelKey !== 'default_v1') {
        if (allCachedStudies[selectedModelKey]) {
          activeStudy = allCachedStudies[selectedModelKey];
        } else if (selectedModelKey === 'auto') {
          activeStudy = allCachedStudies['NQ'] || Object.values(allCachedStudies)[0] || null;
        } else if (selectedModelKey.startsWith('ES')) {
          activeStudy = allCachedStudies['ES'] || null;
        } else if (selectedModelKey.startsWith('GC')) {
          activeStudy = allCachedStudies['GC'] || null;
        } else if (selectedModelKey.startsWith('NQ')) {
          activeStudy = allCachedStudies['NQ'] || null;
        } else {
          // Busca por correspondência no nome do modelo
          const found = Object.values(allCachedStudies).find(s => s.id === selectedModelKey || s.model_name === selectedModelKey);
          if (found) activeStudy = found;
        }
      }

      // Estudo baseline NQ caso ainda não haja estudo no cache local
      if (!activeStudy && selectedModelKey !== 'default_v1') {
        activeStudy = {
          symbol: 'NQ',
          last_run: '2026-10-07T18:11:28Z',
          data_start: '2026-09-11',
          data_end: '2026-10-07',
          total_candles: 25336,
          analyzed_samples: 24534,
          test_samples: 3681,
          metrics: { accuracy: 66.4, auc: 0.5091, high_confidence_precision: 66.4, baseline_winrate: 33.14 },
          active_features_count: 41,
          active_features: [],
          test_config: { use_candle_patterns: true, use_levels: true, use_rsi: true, use_atr: true, use_macd: true, use_moving_averages: true, use_volume: true },
          top_patterns: [
            { pattern: 'RSI Sobrecomprado (>70)', column: 'rsi_overbought', total_occurrences: 3237, wins: 1221, winrate: 37.7 },
            { pattern: 'MACD Histograma Positivo', column: 'macd_cross_bull', total_occurrences: 992, wins: 361, winrate: 36.4 },
            { pattern: 'Estrela Cadente', column: 'shooting_star', total_occurrences: 388, wins: 141, winrate: 36.3 },
            { pattern: 'Engolfo de Baixa', column: 'bearish_engulfing', total_occurrences: 1677, wins: 605, winrate: 36.1 },
            { pattern: 'RSI Sobrevendido (<30)', column: 'rsi_oversold', total_occurrences: 3190, wins: 1142, winrate: 35.8 },
            { pattern: 'Martelo', column: 'hammer', total_occurrences: 449, wins: 158, winrate: 35.2 }
          ],
          status: 'success'
        };
      }

      const activeModelLabel = activeStudy
        ? `Axion ${activeStudy.symbol} (${activeStudy.metrics?.accuracy || 66.4}% Acc)`
        : 'Axion ML Padrão (+25/-12)';

      let latestRadarInfo = {
        status: 'Monitorando Mercado...',
        direction: 'NEUTRO' as 'COMPRA' | 'VENDA' | 'NEUTRO',
        probability: 0,
        probBuy: 0,
        probSell: 0,
        strengthScore: 0,
        strengthLabel: 'NEUTRO' as 'NEUTRO' | 'FRACA' | 'MODERADA' | 'FORTE' | 'INSTITUCIONAL',
        isArming: false,
        isSignal: false,
        rthActive: false,
        atr14: 0,
        distSma60: 0,
        lastPrice: closes[nCandles - 1],
        distToCallRes: undefined as number | undefined,
        distToPutSup: undefined as number | undefined,
        currentHvl: undefined as number | undefined,
        dynamicTp: undefined as number | undefined,
        dynamicSl: undefined as number | undefined,
        tacticalPerspective: undefined as string | undefined,
        tacticalTag: undefined as 'REVERSAO' | 'BREAKOUT' | 'CORREDOR' | 'COMPRESSAO' | 'NEUTRO' | undefined,
        activeModelName: activeModelLabel,
        confluentPattern: undefined as string | undefined
      };

      // Avaliação ponto a ponto
      const evalLimit = isClosedMode ? nCandles - 1 : nCandles;

      for (let i = 60; i < evalLimit; i++) {
        const c = candles[i];
        const t = times[i];
        const close = closes[i];
        const open = opens[i];
        const high = highs[i];
        const low = lows[i];
        const vol = volumes[i];

        // Atualizar máximas e mínimas do dia (sessão local -03:00)
        const dObj = parseCandleDate(c);
        const dateKey = `${dObj.getFullYear()}-${dObj.getMonth() + 1}-${dObj.getDate()}`;
        if (dateKey !== currentSessionDate) {
          currentSessionDate = dateKey;
          sessionHigh = high;
          sessionLow = low;
        } else {
          if (high > sessionHigh) sessionHigh = high;
          if (low < sessionLow) sessionLow = low;
        }

        // 1. Anatomia
        const body = Math.abs(close - open);
        const upper_wick = high - Math.max(open, close);
        const lower_wick = Math.min(open, close) - low;
        const c_range = Math.max(high - low, 1e-6);
        const body_ratio = body / c_range;
        const upper_wick_ratio = upper_wick / c_range;
        const lower_wick_ratio = lower_wick / c_range;
        const close_position = (close - low) / c_range;
        const direction = close > open ? 1 : (close < open ? -1 : 0);

        // 2. Retornos
        const return_1 = close - closes[i - 1];
        const return_5 = close - closes[i - 5];
        const return_15 = close - closes[i - 15];
        const return_30 = close - closes[i - 30];

        // 3. Volatilidade ATR 14 e ATR 5
        let sumTr14 = 0;
        for (let k = i - 13; k <= i; k++) sumTr14 += trs[k];
        const atr_14 = sumTr14 / 14;

        let sumTr5 = 0;
        for (let k = i - 4; k <= i; k++) sumTr5 += trs[k];
        const atr_5 = sumTr5 / 5;

        const volatility_ratio = c_range / Math.max(atr_14, 1e-6);

        // range_zscore (rolling 60)
        let sumR60 = 0;
        for (let k = i - 59; k <= i; k++) sumR60 += (highs[k] - lows[k]);
        const meanR60 = sumR60 / 60;
        let sumVar60 = 0;
        for (let k = i - 59; k <= i; k++) {
          const diff = (highs[k] - lows[k]) - meanR60;
          sumVar60 += diff * diff;
        }
        const stdR60 = Math.sqrt(sumVar60 / 60);
        const range_zscore = stdR60 > 0 ? (c_range - meanR60) / stdR60 : 0;

        // 4. Médias Móveis Institucionais (SMA 20 e SMA 60)
        let sum20 = 0;
        for (let k = i - 19; k <= i; k++) sum20 += closes[k];
        const sma_20 = sum20 / 20;

        let sum60 = 0;
        for (let k = i - 59; k <= i; k++) sum60 += closes[k];
        const sma_60 = sum60 / 60;

        const dist_from_sma20 = close - sma_20;
        const dist_from_sma60 = close - sma_60;

        let sumVar20 = 0;
        for (let k = i - 19; k <= i; k++) {
          const diff = closes[k] - sma_20;
          sumVar20 += diff * diff;
        }
        const std20 = Math.sqrt(sumVar20 / 20);
        const zscore_20 = std20 > 0 ? (close - sma_20) / std20 : 0;

        const dist_from_high = sessionHigh - close;
        const dist_from_low = close - sessionLow;

        // 5. Padrões de Candle
        const hammer = (lower_wick > 2 * body && upper_wick < 0.3 * body) ? 1 : 0;
        const shooting_star = (upper_wick > 2 * body && lower_wick < 0.3 * body) ? 1 : 0;
        const strong_candle = body > 0.7 * atr_14 ? 1 : 0;
        const doji = body < 0.1 * c_range ? 1 : 0;

        // 6. Contexto Temporal Cíclico
        const minuteOfDay = dObj.getUTCHours() * 60 + dObj.getUTCMinutes();
        const time_sin = Math.sin(2 * Math.PI * minuteOfDay / 1440.0);
        const time_cos = Math.cos(2 * Math.PI * minuteOfDay / 1440.0);

        // 7. Volume
        let sumVol20 = 0;
        for (let k = i - 19; k <= i; k++) sumVol20 += volumes[k];
        const volume_sma_20 = sumVol20 / 20;
        const volume_ratio = volume_sma_20 > 0 ? vol / volume_sma_20 : 1;

        // Extrair TODA a Rede de Níveis Institucionais Ativos (Gamma, GEX, BL, Diários, 0DTE)
        const gLevels = options?.gammaLevels;
        const allKnownLevels: number[] = [];
        if (gLevels && typeof gLevels === 'object') {
          const standardKeys = ['hvl', 'call', 'put', 'call_resistance', 'put_support', 'hvl0', 'hvl_0dte', 'call0', 'call_resistance_0dte', 'put0', 'put_support_0dte', 'gwall', 'gamma_wall_0dte', 'max1d', 'min1d', 'prev', 'prevH', 'prevL'];
          standardKeys.forEach(k => {
            const v = Number(gLevels[k]);
            if (!isNaN(v) && v > 0) allKnownLevels.push(v);
          });
          if (Array.isArray(gLevels.gex)) {
            gLevels.gex.forEach((v: any) => {
              const num = Number(v);
              if (!isNaN(num) && num > 0) allKnownLevels.push(num);
            });
          }
          if (Array.isArray(gLevels.bl)) {
            gLevels.bl.forEach((v: any) => {
              const num = Number(v);
              if (!isNaN(num) && num > 0) allKnownLevels.push(num);
            });
          }
        }

        // Determinar Suporte Imediato e Resistência Imediata mais próximos
        let nearestRes = Infinity;
        let nearestSup = -Infinity;
        for (let lvl of allKnownLevels) {
          if (lvl > close && lvl < nearestRes) nearestRes = lvl;
          if (lvl < close && lvl > nearestSup) nearestSup = lvl;
        }

        const currentCallRes = Number.isFinite(nearestRes) ? nearestRes : Number(gLevels?.call_resistance || gLevels?.call_resistance_0dte || (sessionHigh + 50));
        const currentPutSup = Number.isFinite(nearestSup) ? nearestSup : Number(gLevels?.put_support || gLevels?.put_support_0dte || (sessionLow - 50));
        const currentHvl = Number(gLevels?.hvl || gLevels?.hvl_0dte || (sessionHigh + sessionLow) / 2);

        // 8. Distâncias Reais para a Barreira Imediata
        const dist_to_hvl = close - currentHvl;
        const dist_to_call_res = currentCallRes - close;
        const dist_to_put_sup = close - currentPutSup;
        const gamma_regime = close >= currentHvl ? 1 : -1;
        const headroom_tp25 = dist_to_call_res - 25.0;

        // Vetor exato de 35 features
        const rawVector = [
          body, upper_wick, lower_wick, c_range, body_ratio,
          upper_wick_ratio, lower_wick_ratio, close_position, direction,
          return_1, return_5, return_15, return_30,
          atr_14, atr_5, volatility_ratio, range_zscore,
          dist_from_sma20, dist_from_sma60, zscore_20,
          dist_from_high, dist_from_low,
          hammer, shooting_star, strong_candle, doji,
          time_sin, time_cos,
          volume_sma_20, volume_ratio,
          dist_to_hvl, dist_to_call_res, dist_to_put_sup, gamma_regime, headroom_tp25
        ];

        // Inferência DUAL LightGBM (< 0.08ms)
        let { probBuy, probSell } = predictNQDualProbabilities(rawVector);

        // 🚀 SCALPER MOMENTUM ADAPTIVO BASEADO NA SMA 20 (Suave, Progressivo e Sem Saltos de Abertura)
        // Substituída a SMA 9 (muito ruidosa e propensa a saltos intradiários) pela SMA 20 como âncora de tendência de scalping.
        // O ajuste é progressivo (sem degraus binários Liga/Desliga), eliminando picos abruptos na abertura de novas barras.
        const distSma20 = close - sma_20;
        const trendAlignment = Math.tanh(distSma20 / 12.0) * (return_5 !== 0 ? Math.tanh(return_5 / 15.0) : 0);
        
        if (trendAlignment > 0.05) {
          // Tendência compradora em andamento: fortalece a compra de forma proporcional à sustentação
          const boostFactor = 1.0 + 0.12 * trendAlignment;
          probBuy = Math.min(0.65, probBuy * boostFactor);
          probSell = Math.max(0.18, probSell * (1.0 - 0.12 * trendAlignment));
        } else if (trendAlignment < -0.05) {
          // Tendência vendedora em andamento: fortalece a venda de forma proporcional à sustentação
          const absAlignment = Math.abs(trendAlignment);
          const boostFactor = 1.0 + 0.12 * absAlignment;
          probSell = Math.min(0.65, probSell * boostFactor);
          probBuy = Math.max(0.18, probBuy * (1.0 - 0.12 * absAlignment));
        }

        // Checagem de RTH (09:30 às 16:00 Nova York -> 13:30 às 20:00 UTC)
        const nyMinutes = ((dObj.getUTCHours() * 60 + dObj.getUTCMinutes()) - 240 + 1440) % 1440;
        const isRthNow = nyMinutes >= (9 * 60 + 30) && nyMinutes <= (16 * 60);

        // 8.5 Confluência de Volume Institucional (Volume Ratio > 1.2x com deslocamento direcional)
        const isVolumeExpansionBuy = volume_ratio >= 1.15 && close > open && body >= 6.0;
        const isVolumeExpansionSell = volume_ratio >= 1.15 && close < open && body >= 6.0;

        // Se houver volume institucional alinhado, aplica bônus de convicção
        if (isVolumeExpansionBuy && trendAlignment >= 0) {
          probBuy = Math.min(0.68, probBuy * 1.08 + 0.015);
        } else if (isVolumeExpansionSell && trendAlignment <= 0) {
          probSell = Math.min(0.68, probSell * 1.08 + 0.015);
        }

        // 8.6 Confluência com a Remodelagem Ativa (Padrões Assertivos Detectados no Estudo do Usuário)
        let activeConfluentPattern: string | undefined = undefined;
        if (activeStudy && Array.isArray(activeStudy.top_patterns) && activeStudy.top_patterns.length > 0) {
          const prevClose = i > 0 ? closes[i - 1] : close;
          const prevOpen = i > 0 ? opens[i - 1] : open;

          let gainSum = 0;
          let lossSum = 0;
          for (let k = Math.max(1, i - 13); k <= i; k++) {
            const diff = closes[k] - closes[k - 1];
            if (diff > 0) gainSum += diff;
            else lossSum -= diff;
          }
          const avgLoss = lossSum / 14;
          const rsiVal = avgLoss === 0 ? 100 : 100 - (100 / (1 + (gainSum / 14) / avgLoss));

          const cfg = activeStudy.test_config || {};
          const allowCandle = cfg.use_candle_patterns !== false;
          const allowRsi = cfg.use_rsi !== false;

          for (const pat of activeStudy.top_patterns) {
            let matched = false;
            let isBull = false;

            // Ignora o padrão se a categoria dele foi desativada na remodelagem
            if (pat.column.startsWith('rsi_') && !allowRsi) continue;
            if (['shooting_star', 'hammer', 'bearish_engulfing', 'bullish_engulfing', 'wick_rejection_ema'].includes(pat.column) && !allowCandle) continue;

            if (pat.column === 'rsi_overbought' && rsiVal > 70) {
              matched = true; isBull = false;
            } else if (pat.column === 'rsi_oversold' && rsiVal < 30) {
              matched = true; isBull = true;
            } else if (pat.column === 'shooting_star' && shooting_star === 1) {
              matched = true; isBull = false;
            } else if (pat.column === 'hammer' && hammer === 1) {
              matched = true; isBull = true;
            } else if (pat.column === 'bearish_engulfing' && close < open && prevClose > prevOpen && close < prevOpen && open > prevClose) {
              matched = true; isBull = false;
            } else if (pat.column === 'bullish_engulfing' && close > open && prevClose < prevOpen && close > prevOpen && open < prevClose) {
              matched = true; isBull = true;
            }

            if (matched) {
              activeConfluentPattern = `${pat.pattern} (${pat.winrate}%)`;
              const boost = Math.min(0.04, Math.max(0.012, (pat.winrate - 33.0) / 150.0));
              if (isBull) {
                probBuy = Math.min(0.70, probBuy + boost);
              } else {
                probSell = Math.min(0.70, probSell + boost);
              }
              break;
            }
          }
        }


        // Filtros de Qualidade Institucionais (com flexibilidade para scalpers com aceleração na SMA 20)
        const passesAtr = atr_14 >= minAtr14;
        const passesSma60 = Math.abs(dist_from_sma60) <= maxDistSma60 || (Math.abs(trendAlignment) > 0.35 && Math.abs(return_5) > 15);
        const passesRth = !filterRth || isRthNow;
        const passesAllFilters = passesAtr && passesSma60 && passesRth;

        // Sinais Bidirecionais DEDICADOS:
        const isBuySignal = probBuy >= thresholdCompra && passesAllFilters && (probBuy > probSell);
        const isSellSignal = probSell >= thresholdVenda && passesAllFilters && (probSell > probBuy);

        // Radar de Formação / Arming:
        const isBuyArming = probBuy >= armingThreshold && probBuy < thresholdCompra && passesAllFilters && (probBuy > probSell);
        const isSellArming = probSell >= armingThresholdVenda && probSell < thresholdVenda && passesAllFilters && (probSell > probBuy);

        // 9. Classificador Tático Institucional Genérico (Normalizado por ATR e Malha Gamma)
        // Funciona universalmente para qualquer ativo (NQ, ES, YM, WIN, WDO, CL, GC, etc.)
        const atrSafe = Math.max(0.5, atr_14);
        const probDiff = Math.abs(probBuy - probSell);
        const nearThreshold = 0.45 * atrSafe; // Limiar de proximidade de nível (fração de ATR)
        const isNearSup = dist_to_put_sup <= nearThreshold;
        const isNearRes = dist_to_call_res <= nearThreshold;

        // Rejeições/Exaustões em Nível Gamma
        const isRejectingSup = isNearSup && lower_wick >= 0.7 * body && close >= open;
        const isRejectingRes = isNearRes && upper_wick >= 0.7 * body && close <= open;

        // Breakouts de Nível Gamma com Volume Institucional
        const isBreakingRes = close > (currentCallRes - 0.2 * atrSafe) && isVolumeExpansionBuy && return_5 > 0;
        const isBreakingSup = close < (currentPutSup + 0.2 * atrSafe) && isVolumeExpansionSell && return_5 < 0;

        // Corredor e Headroom (Espaço livre até a barreira em múltiplos de ATR)
        const headroomResAtr = dist_to_call_res / atrSafe;
        const headroomSupAtr = dist_to_put_sup / atrSafe;

        // Determinação da Perspectiva Tática Gamma:
        let tacticalPerspective = 'Mercado em Equilíbrio (Consolidação)';
        let tacticalTag: 'REVERSAO' | 'BREAKOUT' | 'CORREDOR' | 'COMPRESSAO' | 'NEUTRO' = 'NEUTRO';

        if (isBreakingRes) {
          tacticalPerspective = `🚀 Breakout de Alta (Rompeu Barreira com Volume)`;
          tacticalTag = 'BREAKOUT';
        } else if (isBreakingSup) {
          tacticalPerspective = `💥 Breakout de Baixa (Rompeu Suporte com Volume)`;
          tacticalTag = 'BREAKOUT';
        } else if (isRejectingSup) {
          tacticalPerspective = `🛡️ Defesa de Suporte Gamma (Rejeição confirmada)`;
          tacticalTag = 'REVERSAO';
        } else if (isRejectingRes) {
          tacticalPerspective = `🛡️ Defesa de Resistência Gamma (Exaustão de alta)`;
          tacticalTag = 'REVERSAO';
        } else if (probBuy > probSell && headroomResAtr >= 1.4) {
          tacticalPerspective = `🎯 Corredor Aberto (${headroomResAtr.toFixed(1)}x ATR até Resistência)`;
          tacticalTag = 'CORREDOR';
        } else if (probSell > probBuy && headroomSupAtr >= 1.4) {
          tacticalPerspective = `🎯 Corredor Aberto (${headroomSupAtr.toFixed(1)}x ATR até Suporte)`;
          tacticalTag = 'CORREDOR';
        } else if (dist_to_call_res <= 0.6 * atrSafe || dist_to_put_sup <= 0.6 * atrSafe) {
          tacticalPerspective = `⚠️ Espaço Comprimido contra Barreira Gamma`;
          tacticalTag = 'COMPRESSAO';
        } else if (probDiff >= 0.035) {
          tacticalPerspective = probBuy > probSell ? '📈 Pressão compradora em aceleração' : '📉 Pressão vendedora em aceleração';
        }

        // Projeção de Alvo e Stop baseada na Modelagem Selecionada (TP/SL em Pontos) ou Volatilidade (ATR)
        const dynamicTpDistance = activeStudy?.tp_points && activeStudy.tp_points > 0
          ? Number(activeStudy.tp_points)
          : Math.round(Math.max(10.0, atrSafe * 2.0) * 10) / 10;
        const dynamicSlDistance = activeStudy?.sl_points && activeStudy.sl_points > 0
          ? Number(activeStudy.sl_points)
          : Math.round(Math.max(5.0, atrSafe * 1.0) * 10) / 10;

        // Se for o último candle em análise, popula o HUD detalhado
        if (i === evalLimit - 1) {
          let radarStatus = tacticalPerspective;
          let radarDirection: 'COMPRA' | 'VENDA' | 'NEUTRO' = 'NEUTRO';

          const maxProb = Math.max(probBuy, probSell);
          
          let strengthScore = 0;
          let strengthLabel: 'NEUTRO' | 'FRACA' | 'MODERADA' | 'FORTE' | 'INSTITUCIONAL' = 'NEUTRO';

          if (isBuySignal) {
            radarStatus = `🎯 SINAL DE COMPRA (+${dynamicTpDistance} pts)`;
            radarDirection = 'COMPRA';
            strengthScore = Math.min(100, Math.round(70 + Math.max(0, (probBuy - thresholdCompra) / 0.06) * 30));
            strengthLabel = strengthScore >= 85 ? 'INSTITUCIONAL' : 'FORTE';
          } else if (isSellSignal) {
            radarStatus = `🎯 SINAL DE VENDA (-${dynamicTpDistance} pts)`;
            radarDirection = 'VENDA';
            strengthScore = Math.min(100, Math.round(70 + Math.max(0, (probSell - thresholdVenda) / 0.06) * 30));
            strengthLabel = strengthScore >= 85 ? 'INSTITUCIONAL' : 'FORTE';
          } else if (isBuyArming) {
            radarStatus = `⚡ RADAR: COMPRA EM FORMAÇÃO`;
            radarDirection = 'COMPRA';
            strengthScore = 60;
            strengthLabel = 'MODERADA';
          } else if (isSellArming) {
            radarStatus = `⚡ RADAR: VENDA EM FORMAÇÃO`;
            radarDirection = 'VENDA';
            strengthScore = 60;
            strengthLabel = 'MODERADA';
          } else if (probDiff >= 0.035 && maxProb >= 0.325) {
            radarDirection = probBuy > probSell ? 'COMPRA' : 'VENDA';
            radarStatus = radarDirection === 'COMPRA' ? '📈 PRESSÃO COMPRADORA' : '📉 PRESSÃO VENDEDORA';
            const isVolActive = (radarDirection === 'COMPRA' && isVolumeExpansionBuy) || (radarDirection === 'VENDA' && isVolumeExpansionSell);
            strengthScore = Math.min(48, Math.round(probDiff * 450) + (isVolActive ? 12 : 0));
            strengthLabel = isVolActive || strengthScore >= 40 ? 'MODERADA' : 'FRACA';
          } else {
            radarDirection = 'NEUTRO';
            radarStatus = '⚖️ MERCADO EM EQUILÍBRIO';
            strengthScore = 0;
            strengthLabel = 'NEUTRO';
          }

          const primaryProb = radarDirection === 'VENDA' ? probSell : (radarDirection === 'COMPRA' ? probBuy : maxProb);

          latestRadarInfo = {
            status: radarStatus,
            direction: radarDirection,
            probability: Math.round(primaryProb * 1000) / 10,
            probBuy: Math.round(probBuy * 1000) / 10,
            probSell: Math.round(probSell * 1000) / 10,
            strengthScore,
            strengthLabel,
            isArming: isBuyArming || isSellArming,
            isSignal: isBuySignal || isSellSignal,
            rthActive: isRthNow,
            atr14: Math.round(atr_14 * 100) / 100,
            distSma60: Math.round(dist_from_sma60 * 100) / 100,
            lastPrice: close,
            distToCallRes: Math.round(dist_to_call_res * 10) / 10,
            distToPutSup: Math.round(dist_to_put_sup * 10) / 10,
            currentHvl: Math.round(currentHvl * 10) / 10,
            dynamicTp: dynamicTpDistance,
            dynamicSl: dynamicSlDistance,
            tacticalPerspective,
            tacticalTag,
            activeModelName: activeModelLabel,
            confluentPattern: activeConfluentPattern
          };
        }

        // Validação de Cooldown e Alternância de Sinais (Evita enxurrada de sinais repetitivos na mesma direção)
        const passesCooldown = (i - lastSignalBarIndex) >= minCooldownBars;
        const canTakeBuy = isBuySignal && t > lastActiveSignalTime && passesCooldown && (!alternateSignals || lastSignalDirection !== 'COMPRA');
        const canTakeSell = isSellSignal && t > lastActiveSignalTime && passesCooldown && (!alternateSignals || lastSignalDirection !== 'VENDA');

        // Formatação limpa do texto do marcador
        const getMarkerText = (prob: number, side: 'COMPRA' | 'VENDA') => {
          const pct = `${(prob * 100).toFixed(0)}%`;
          if (labelStyle === 'arrow_only') return '';
          if (labelStyle === 'percentage_only') return pct;
          return `ML ${side} ${pct}`;
        };

        // Se for sinal confirmado de COMPRA, adiciona marcador e projeção dinâmica
        if (canTakeBuy) {
          lastActiveSignalTime = t;
          lastSignalDirection = 'COMPRA';
          lastSignalBarIndex = i;

          markers.push({
            time: t,
            position: 'belowBar',
            color: '#10b981',
            shape: 'arrowUp',
            text: getMarkerText(probBuy, 'COMPRA'),
            size: 2,
            sound: soundSignal
          });

          if (showTargets) {
            // Os alvos de TP e SL já são incorporados pontualmente no próprio marcador do candle
          }
        }
        // Se for sinal confirmado de VENDA, adiciona marcador e projeção dinâmica
        else if (canTakeSell) {
          lastActiveSignalTime = t;
          lastSignalDirection = 'VENDA';
          lastSignalBarIndex = i;

          markers.push({
            time: t,
            position: 'aboveBar',
            color: '#ef4444',
            shape: 'arrowDown',
            text: getMarkerText(probSell, 'VENDA'),
            size: 2,
            sound: soundSignal
          });

          if (showTargets) {
            // Os alvos de TP e SL já são incorporados pontualmente no próprio marcador do candle
          }
        }
      }

      const series: any[] = [];

      return {
        id: cConfig.id,
        type: 'AXION_ML_PREDICTOR',
        overlay: true,
        series,
        markers,
        customData: {
          radar: latestRadarInfo
        }
      };
    }

    case 'WYCKOFF_STRUCTURAL_SWEEPS': {
      // ⚡ Wyckoff Structural Sweeps & Reclaim (Bidirecional: Compra & Venda com Caixote Real)
      const minRange = Number(cConfig.params?.minRangeCandles) || 12;
      const maxRange = Number(cConfig.params?.maxRangeCandles) || 30;
      const sweepTol = Number(cConfig.params?.sweepTolerancePts) || 3.0;
      const directionMode = String(cConfig.params?.direction || 'both');
      const showRanges = cConfig.params?.showRanges !== false;
      const showSweeps = cConfig.params?.showSweeps !== false;
      const showReclaims = cConfig.params?.showReclaims !== false;
      const requireGamma = cConfig.params?.requireGammaConfluence === true;
      const selectedModelId = cConfig.params?.selectedModel;

      const markers: any[] = [];

      if (!candles || candles.length < maxRange + 10) {
        return {
          id: cConfig.id,
          type: 'WYCKOFF_STRUCTURAL_SWEEPS',
          overlay: true,
          series: [],
          markers: [],
          customData: {
            radar: { status: 'SCANNING', direction: 'NEUTRO', tpPoints: 25, slPoints: 12 }
          }
        };
      }

      // Estimativa adaptativa de ATR para compatibilidade universal (NQ, ES, Dow, etc.)
      let atrApprox = 5.0;
      if (candles.length >= 14) {
        let trSum = 0;
        const lookback = Math.min(25, candles.length);
        for (let j = candles.length - lookback; j < candles.length; j++) {
          trSum += Math.max(Number(candles[j].high) - Number(candles[j].low), 1e-4);
        }
        atrApprox = trSum / lookback;
      }

      // 1. Extrair Parâmetros de TP e SL do Estudo Selecionado
      let dynamicTpDistance = 25.0;
      let dynamicSlDistance = 12.0;

      try {
        if (typeof window !== 'undefined') {
          const cachedStudies = (window as any).__vortex_ml_studies_cache || {};
          let targetStudy: any = null;
          if (selectedModelId && selectedModelId !== 'auto') {
            targetStudy = Object.values(cachedStudies).find((s: any) => s.id === selectedModelId || s.model_name === selectedModelId);
          } else {
            targetStudy = Object.values(cachedStudies).find(
              (s: any) => s.model_type === 'structural_pattern_study' ||
              s.model_name?.toLowerCase().includes('spring') ||
              s.model_name?.toLowerCase().includes('sweep')
            );
          }
          if (targetStudy) {
            if (targetStudy.metrics?.best_tp) dynamicTpDistance = Number(targetStudy.metrics.best_tp);
            else if (targetStudy.tp_points) dynamicTpDistance = Number(targetStudy.tp_points);

            if (targetStudy.metrics?.best_sl) dynamicSlDistance = Number(targetStudy.metrics.best_sl);
            else if (targetStudy.sl_points) dynamicSlDistance = Number(targetStudy.sl_points);
          }
        }
      } catch (_) {}

      // Níveis de Gamma para checagem de confluência
      const gLevels = options?.gammaLevels;
      const put0 = Number(gLevels?.put0 || gLevels?.put_support_0dte || gLevels?.put || 0);
      const call0 = Number(gLevels?.call0 || gLevels?.call_resistance_0dte || gLevels?.call || 0);
      const hvl = Number(gLevels?.hvl0 || gLevels?.hvl || gLevels?.hvl_0dte || 0);
      const adjust = Number(gLevels?.prev || gLevels?.prev_day_adjust || 0);
      const gexList: number[] = Array.isArray(gLevels?.gex) ? gLevels.gex.map(Number).filter(Boolean) : [];
      const blList: number[] = Array.isArray(gLevels?.bl) ? gLevels.bl.map(Number).filter(Boolean) : [];
      const concreteLevels = [...gexList.slice(7, 10), ...blList.slice(7, 10)];
      const topLevels = [...gexList.slice(0, 3), ...blList.slice(0, 3)];

      const nCandles = candles.length;
      let lastSignalIndex = -100;
      let activeRangeLow = 0;
      let activeRangeHigh = 0;
      let lastSweepLevel = 0;
      let radarStatus: 'SCANNING' | 'RANGE_DETECTED' | 'SWEEP_ARMED' | 'RECLAIM_BUY' | 'RECLAIM_SELL' = 'SCANNING';

      // Estrutura do Caixote mais recente (para desenho limpo sem cruzar linhas)
      let latestBox: { startIdx: number; endIdx: number; high: number; low: number; len: number; height: number } | null = null;

      // Sweep pendente aguardando reclaim
      let pendingSweep: {
        index: number;
        extreme: number;
        time: number;
        type: 'BUY' | 'SELL';
        hasInst: boolean;
        instTag: string;
        rangeLow: number;
        rangeHigh: number;
        rangeLen: number;
        rangeHeight: number;
        rangeStartIndex: number;
      } | null = null;

      for (let i = maxRange; i < nCandles; i++) {
        const c = candles[i];
        const cTime = times[i];
        if (!cTime || isNaN(cTime)) continue;

        // Cooldown entre sinais estruturais
        if (i - lastSignalIndex < 10) {
          pendingSweep = null;
          continue;
        }

        // Se há um Sweep pendente aguardando confirmação de Reclaim
        if (pendingSweep) {
          // Invalidação por rompimento verdadeiro
          if (pendingSweep.type === 'BUY' && c.close < pendingSweep.extreme - sweepTol * 2) {
            pendingSweep = null; radarStatus = 'SCANNING'; continue;
          }
          if (pendingSweep.type === 'SELL' && c.close > pendingSweep.extreme + sweepTol * 2) {
            pendingSweep = null; radarStatus = 'SCANNING'; continue;
          }

          if (i - pendingSweep.index > 5) {
            pendingSweep = null; radarStatus = 'SCANNING'; continue;
          }

          const isReclaimConfirmed = pendingSweep.type === 'BUY'
            ? c.close >= pendingSweep.rangeLow
            : c.close <= pendingSweep.rangeHigh;

          if (isReclaimConfirmed) {
            if (!requireGamma || pendingSweep.hasInst) {
              lastSignalIndex = i;
              radarStatus = pendingSweep.type === 'BUY' ? 'RECLAIM_BUY' : 'RECLAIM_SELL';

              latestBox = {
                startIdx: pendingSweep.rangeStartIndex,
                endIdx: i,
                high: pendingSweep.rangeHigh,
                low: pendingSweep.rangeLow,
                len: pendingSweep.rangeLen,
                height: pendingSweep.rangeHeight
              };

              // Marcador com quantidade de candles e pontos do caixote
              if (showRanges) {
                const startCandleTime = times[pendingSweep.rangeStartIndex] || cTime;
                markers.push({
                  time: startCandleTime,
                  position: pendingSweep.type === 'BUY' ? 'aboveBar' : 'belowBar',
                  color: '#38bdf8',
                  shape: 'square',
                  size: 1,
                  text: `📦 CAIXOTE: ${pendingSweep.rangeLen} velas | ${pendingSweep.rangeHeight} pts`
                });
              }

              // Marcador de Reclaim (Sem linhas conectadas que cruzam a tela)
              if (showReclaims) {
                markers.push({
                  time: cTime,
                  position: pendingSweep.type === 'BUY' ? 'belowBar' : 'aboveBar',
                  color: pendingSweep.type === 'BUY' ? '#10b981' : '#ef4444',
                  shape: pendingSweep.type === 'BUY' ? 'arrowUp' : 'arrowDown',
                  size: 2,
                  text: pendingSweep.type === 'BUY'
                    ? (pendingSweep.hasInst ? `👑 WYCKOFF BUY (${pendingSweep.instTag}) [+${dynamicTpDistance}/-${dynamicSlDistance}]` : `🟢 WYCKOFF BUY [+${dynamicTpDistance}/-${dynamicSlDistance}]`)
                    : (pendingSweep.hasInst ? `👑 WYCKOFF SELL (${pendingSweep.instTag}) [+${dynamicTpDistance}/-${dynamicSlDistance}]` : `🔴 WYCKOFF SELL [+${dynamicTpDistance}/-${dynamicSlDistance}]`)
                });
              }
            }
            pendingSweep = null;
            continue;
          }
          continue;
        }

        // 3. Identificação de Caixote Lateral Real [i - k ... i - 1]
        let rangeFound = false;
        let rLow = Infinity;
        let rHigh = -Infinity;
        let rLen = 0;

        for (let k = minRange; k <= maxRange; k++) {
          const slice = candles.slice(i - k, i);
          const l = Math.min(...slice.map(s => s.low));
          const h = Math.max(...slice.map(s => s.high));
          const span = h - l;

          // Descarta fatias com forte tendência direcional
          const firstThirdMean = (slice[0].close + slice[1].close) / 2;
          const lastThirdMean = (slice[k - 2].close + slice[k - 1].close) / 2;
          const slopeRatio = Math.abs(firstThirdMean - lastThirdMean) / Math.max(span, 1e-4);

          const minSpan = Math.max(1.5, Math.min(sweepTol * 1.5, atrApprox * 0.7));
          const maxSpan = Math.max(sweepTol * 30, atrApprox * 8.0);

          if (slopeRatio < 0.60 && span >= minSpan && span <= maxSpan) {
            rangeFound = true;
            rLow = l;
            rHigh = h;
            rLen = k;
            break;
          }
        }

        if (rangeFound && rLow < Infinity) {
          activeRangeLow = rLow;
          activeRangeHigh = rHigh;
          radarStatus = 'RANGE_DETECTED';

          const rHeight = Number((rHigh - rLow).toFixed(1));
          const rangeStartIndex = i - rLen;

          // Checar Sweep de Compra (Spring no Piso)
          const sweepDepthBuy = rLow - c.low;
          const cRange = Math.max(c.high - c.low, 1e-4);
          const lowerWick = Math.min(c.open, c.close) - c.low;
          const hasAbsorptionBuy = (lowerWick / cRange) >= 0.25 || c.close > (c.low + cRange * 0.35);

          const minSweep = Math.max(0.5, Math.min(sweepTol, atrApprox * 0.15));
          const maxSweep = Math.max(sweepTol * 8, atrApprox * 3.5);

          const isSweepBuy = (directionMode === 'both' || directionMode === 'buy_only') &&
            sweepDepthBuy >= minSweep && sweepDepthBuy <= maxSweep && hasAbsorptionBuy;

          // Checar Sweep de Venda (Upthrust no Teto)
          const sweepDepthSell = c.high - rHigh;
          const upperWick = c.high - Math.max(c.open, c.close);
          const hasAbsorptionSell = (upperWick / cRange) >= 0.25 || c.close < (c.high - cRange * 0.35);

          const isSweepSell = (directionMode === 'both' || directionMode === 'sell_only') &&
            sweepDepthSell >= minSweep && sweepDepthSell <= maxSweep && hasAbsorptionSell;

          if (isSweepBuy) {
            let hasInst = false;
            let instTag = '';
            if (put0 > 0 && Math.abs(c.low - put0) <= 15.0) { hasInst = true; instTag = '0DTE'; }
            else if (hvl > 0 && Math.abs(c.low - hvl) <= 15.0) { hasInst = true; instTag = 'HVL'; }
            else if (adjust > 0 && Math.abs(c.low - adjust) <= 15.0) { hasInst = true; instTag = 'AJUSTE'; }
            else if (concreteLevels.some(lvl => Math.abs(c.low - lvl) <= 15.0)) { hasInst = true; instTag = 'GEX'; }

            if (!requireGamma || hasInst) {
              radarStatus = 'SWEEP_ARMED';
              lastSweepLevel = c.low;

              if (showSweeps) {
                markers.push({
                  time: cTime,
                  position: 'belowBar',
                  color: hasInst ? '#f59e0b' : '#38bdf8',
                  shape: 'circle',
                  size: 1,
                  text: hasInst ? `⚡ SWEEP (${instTag})` : '⚡ SWEEP'
                });
              }

              // Se fechou de volta no mesmo candle
              if (c.close >= rLow) {
                lastSignalIndex = i;
                radarStatus = 'RECLAIM_BUY';

                latestBox = {
                  startIdx: rangeStartIndex,
                  endIdx: i,
                  high: rHigh,
                  low: rLow,
                  len: rLen,
                  height: rHeight
                };

                if (showRanges) {
                  const startCandleTime = times[rangeStartIndex] || cTime;
                  markers.push({
                    time: startCandleTime,
                    position: 'aboveBar',
                    color: '#38bdf8',
                    shape: 'square',
                    size: 1,
                    text: `📦 CAIXOTE: ${rLen} velas | ${rHeight} pts`
                  });
                }

                if (showReclaims) {
                  markers.push({
                    time: cTime,
                    position: 'belowBar',
                    color: '#10b981',
                    shape: 'arrowUp',
                    size: 2,
                    text: hasInst ? `👑 WYCKOFF BUY (${instTag}) [+${dynamicTpDistance}/-${dynamicSlDistance}]` : `🟢 WYCKOFF BUY [+${dynamicTpDistance}/-${dynamicSlDistance}]`
                  });
                }
              } else {
                pendingSweep = {
                  index: i,
                  extreme: c.low,
                  time: cTime,
                  type: 'BUY',
                  hasInst,
                  instTag,
                  rangeLow: rLow,
                  rangeHigh: rHigh,
                  rangeLen: rLen,
                  rangeHeight: rHeight,
                  rangeStartIndex
                };
              }
            }
          } else if (isSweepSell) {
            let hasInst = false;
            let instTag = '';
            if (call0 > 0 && Math.abs(c.high - call0) <= 15.0) { hasInst = true; instTag = '0DTE'; }
            else if (hvl > 0 && Math.abs(c.high - hvl) <= 15.0) { hasInst = true; instTag = 'HVL'; }
            else if (adjust > 0 && Math.abs(c.high - adjust) <= 15.0) { hasInst = true; instTag = 'AJUSTE'; }
            else if (topLevels.some(lvl => Math.abs(c.high - lvl) <= 15.0)) { hasInst = true; instTag = 'GEX'; }

            if (!requireGamma || hasInst) {
              radarStatus = 'SWEEP_ARMED';
              lastSweepLevel = c.high;

              if (showSweeps) {
                markers.push({
                  time: cTime,
                  position: 'aboveBar',
                  color: hasInst ? '#f59e0b' : '#f43f5e',
                  shape: 'circle',
                  size: 1,
                  text: hasInst ? `⚡ SWEEP (${instTag})` : '⚡ SWEEP'
                });
              }

              // Se fechou de volta no mesmo candle
              if (c.close <= rHigh) {
                lastSignalIndex = i;
                radarStatus = 'RECLAIM_SELL';

                latestBox = {
                  startIdx: rangeStartIndex,
                  endIdx: i,
                  high: rHigh,
                  low: rLow,
                  len: rLen,
                  height: rHeight
                };

                if (showRanges) {
                  const startCandleTime = times[rangeStartIndex] || cTime;
                  markers.push({
                    time: startCandleTime,
                    position: 'belowBar',
                    color: '#f43f5e',
                    shape: 'square',
                    size: 1,
                    text: `📦 CAIXOTE: ${rLen} velas | ${rHeight} pts`
                  });
                }

                if (showReclaims) {
                  markers.push({
                    time: cTime,
                    position: 'aboveBar',
                    color: '#ef4444',
                    shape: 'arrowDown',
                    size: 2,
                    text: hasInst ? `👑 WYCKOFF SELL (${instTag}) [+${dynamicTpDistance}/-${dynamicSlDistance}]` : `🔴 WYCKOFF SELL [+${dynamicTpDistance}/-${dynamicSlDistance}]`
                  });
                }
              } else {
                pendingSweep = {
                  index: i,
                  extreme: c.high,
                  time: cTime,
                  type: 'SELL',
                  hasInst,
                  instTag,
                  rangeLow: rLow,
                  rangeHigh: rHigh,
                  rangeLen: rLen,
                  rangeHeight: rHeight,
                  rangeStartIndex
                };
              }
            }
          }
        }
      }

      // Atualizar estado global do radar para os widgets de tela
      if (typeof window !== 'undefined') {
        (window as any).__vortex_wyckoff_radar = {
          status: radarStatus,
          rangeLow: activeRangeLow,
          rangeHigh: activeRangeHigh,
          sweepLevel: lastSweepLevel,
          tpPoints: dynamicTpDistance,
          slPoints: dynamicSlDistance
        };
      }

      // Nenhuma série contínua de linha traçada: os alvos e identificadores do caixote
      // e sweeps são representados 100% como marcadores discretos ancorados em cada vela,
      // evitando cruzamento de linhas entre sinais e sem expansão indevida da escala temporal.
      const series: any[] = [];

      return {
        id: cConfig.id,
        type: 'WYCKOFF_STRUCTURAL_SWEEPS',
        overlay: true,
        series,
        markers,
        customData: {
          radar: {
            status: radarStatus,
            direction: radarStatus === 'RECLAIM_BUY' ? 'COMPRA' : radarStatus === 'RECLAIM_SELL' ? 'VENDA' : 'NEUTRO',
            rangeLow: activeRangeLow,
            rangeHigh: activeRangeHigh,
            tpPoints: dynamicTpDistance,
            slPoints: dynamicSlDistance,
            latestBox
          }
        }
      };
    }

    case 'AXION_TREND': {
      const isClosedMode = (cConfig.params?.barMode ?? 'closed') !== 'realtime';
      const calcCandles = (isClosedMode && candles.length >= 2) ? candles.slice(0, -1) : candles;
      const axionRes = calculateAxionTrend(calcCandles, cConfig.params || {});

      const colorBars = cConfig.params?.colorBars !== false;
      const showArrows = cConfig.params?.showArrows !== false;
      const showConciliatedArrows = cConfig.params?.showConciliatedArrows === true;
      const showSubPanel = cConfig.params?.showSubPanel !== false;
      const showBullBearLines = cConfig.params?.showBullBearLines !== false;
      const soundSignal = cConfig.params?.soundSignal || 'none';

      // Se estiver em modo Barra Fechada, estender a cor do último candle fechado para a barra atual em formação (ou manter neutro)
      const candleColorMap: Record<number, string> = { ...axionRes.candleColorMap };
      if (isClosedMode && candles.length >= 2 && axionRes.last) {
        const formingTime = getCandleTimeSeconds(candles[candles.length - 1]);
        if (formingTime > 0 && candleColorMap[formingTime] === undefined) {
          candleColorMap[formingTime] = axionRes.last.candleColor;
        }
      }

      const markers: {
        time: number;
        position: 'aboveBar' | 'belowBar' | 'inBar';
        color: string;
        shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
        text: string;
        size?: number;
        sound?: string;
      }[] = [];

      for (let i = 0; i < axionRes.bars.length; i++) {
        const b = axionRes.bars[i];
        if (!b.time || b.time <= 0) continue;

        if (showArrows) {
          if (b.arrowSignal === 'compra') {
            markers.push({
              time: b.time,
              position: 'belowBar',
              color: '#22c55e',
              shape: 'arrowUp',
              text: '▲',
              size: 0,
              sound: soundSignal
            });
          } else if (b.arrowSignal === 'venda') {
            markers.push({
              time: b.time,
              position: 'aboveBar',
              color: '#ef4444',
              shape: 'arrowDown',
              text: '▼',
              size: 0,
              sound: soundSignal
            });
          }
        }

        if (showConciliatedArrows && b.conciliatedSignal !== 'neutro') {
          if (b.conciliatedSignal === 'compra' && (!showArrows || b.arrowSignal !== 'compra')) {
            markers.push({
              time: b.time,
              position: 'belowBar',
              color: '#10b981',
              shape: 'arrowUp',
              text: '▲⚡',
              size: 0,
              sound: soundSignal
            });
          } else if (b.conciliatedSignal === 'venda' && (!showArrows || b.arrowSignal !== 'venda')) {
            markers.push({
              time: b.time,
              position: 'aboveBar',
              color: '#f43f5e',
              shape: 'arrowDown',
              text: '▼⚡',
              size: 0,
              sound: soundSignal
            });
          }
        }
      }

      return {
        id: cConfig.id,
        type: 'AXION_TREND',
        overlay: true,
        series: [],
        markers,
        customData: {
          bars: axionRes.bars,
          last: axionRes.last,
          candleColorMap,
          colorBars,
          showArrows,
          showConciliatedArrows,
          showSubPanel,
          showBullBearLines
        }
      };
    }

    case 'MOMENTUM_CONFLUENCE':
    case 'MOMENTUM_MATRIX': {
      return {
        id: cConfig.id,
        type: 'MOMENTUM_CONFLUENCE',
        overlay: false,
        series: [],
        markers: [],
        customData: {
          params: cConfig.params
        }
      };
    }

    default:
      return null;
  }
}

/**
 * Ponto de Entrada Seguro de Indicadores:
 * Executa o cálculo e aplica o Dispositivo de Segurança (sanitização de séries e marcadores),
 * garantindo que nenhum item null, undefined, NaN ou com tempo inválido seja enviado ao gráfico.
 */
export function calculateIndicator(
  cConfig: IndicatorConfig,
  candles: Candle[],
  options?: {
    systemSessionStart?: string;
    systemSessionEnd?: string;
    marketContext?: ScreenConfluenceContext;
    timeframeMinutes?: number;
    gammaLevels?: any;
  }
): CalculatedIndicatorSeries | null {
  try {
    const calculated = _calculateIndicatorInternal(cConfig, candles, options);
    if (!calculated) return null;

    // Sanitização de Séries de Linha / Histograma
    if (calculated.series && Array.isArray(calculated.series)) {
      calculated.series.forEach(s => {
        if (s && s.data && Array.isArray(s.data)) {
          s.data = sanitizeLineSeriesData(s.data);
        }
      });
    }

    // Sanitização de Marcadores (remover markers com time/shape/color nulos ou inválidos)
    if (calculated.markers && Array.isArray(calculated.markers)) {
      calculated.markers = calculated.markers.filter(
        m => m && typeof m.time === 'number' && !isNaN(m.time) && m.time > 0 && m.position && m.shape
      );
    }

    return calculated;
  } catch (err) {
    console.warn(`[INDICATOR_SAFEGUARD] Falha ao calcular indicador ${cConfig?.type}:`, err);
    return null;
  }
}

// --- Funções Auxiliares de Cálculo de MACD e Divergências ---

export interface MacdDivergence {
  id: string;
  type: 'BULLISH' | 'BEARISH';
  t1: number;
  t2: number;
  hist1: number;
  hist2: number;
  price1: number;
  price2: number;
}

export function calculateEMA(data: { time?: number; close: number }[], period: number): { time: number; value: number }[] {
  if (!data || data.length === 0) return [];
  const k = 2 / (period + 1);
  const emaData: { time: number; value: number }[] = [];
  const firstClose = data[0]?.close;
  const firstTime = (data[0]?.time !== undefined ? data[0].time : 1) as number;
  if (typeof firstClose !== 'number' || isNaN(firstClose)) return [];
  
  let emaVal = firstClose;
  emaData.push({ time: firstTime, value: emaVal });

  for (let i = 1; i < data.length; i++) {
    const c = data[i]?.close;
    const t = (data[i]?.time !== undefined ? data[i].time : i + 1) as number;
    if (typeof c === 'number' && !isNaN(c) && isFinite(c)) {
      emaVal = c * k + emaVal * (1 - k);
      if (!isNaN(emaVal) && isFinite(emaVal)) {
        emaData.push({ time: t, value: emaVal });
      }
    }
  }
  return emaData;
}

export function calculateMACD(
  data: { time: number; close: number }[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
) {
  if (!data || data.length === 0) return { macd: [], signal: [], histogram: [] };
  
  const emaFast = calculateEMA(data, fastPeriod);
  const emaSlow = calculateEMA(data, slowPeriod);
  
  const macdLine: { time: number; close: number }[] = [];
  const emaSlowMap = new Map(emaSlow.map(e => [e.time, e.value]));
  
  for (const ef of emaFast) {
    const esVal = emaSlowMap.get(ef.time);
    if (esVal !== undefined) {
      macdLine.push({
        time: ef.time,
        close: ef.value - esVal
      });
    }
  }
  
  const signalLine = calculateEMA(macdLine, signalPeriod);
  const signalMap = new Map(signalLine.map(s => [s.time, s.value]));
  
  const finalMacd: { time: number; value: number }[] = [];
  const finalSignal: { time: number; value: number }[] = [];
  const histogram: { time: number; value: number }[] = [];
  
  for (const m of macdLine) {
    const sigVal = signalMap.get(m.time);
    if (sigVal !== undefined) {
      finalMacd.push({ time: m.time, value: m.close });
      finalSignal.push({ time: m.time, value: sigVal });
      histogram.push({ time: m.time, value: m.close - sigVal });
    }
  }
  
  return {
    macd: sanitizeLineSeriesData(finalMacd),
    signal: sanitizeLineSeriesData(finalSignal),
    histogram: sanitizeLineSeriesData(histogram)
  };
}

export function calculateMACDDivergences(
  candles: { time: number; high: number; low: number; close: number }[],
  histogram: { time: number; value: number }[],
  lookback: number = 60,
  minBars: number = 5,
  confirmationBars: number = 2,
  onlyClosedBars: boolean = true,
  mode: 'swing_pivots' | 'zero_cross' = 'swing_pivots'
): MacdDivergence[] {
  if (!histogram || histogram.length < 15 || !candles || candles.length < 15) return [];

  // Mapear candles por timestamp para alinhamento 100% perfeito
  // Se onlyClosedBars estiver ativado, a barra aberta em formação (último índice) é ignorada
  const maxIdx = onlyClosedBars && candles.length >= 3 ? candles.length - 2 : candles.length - 1;
  if (maxIdx < 14) return [];

  const maxValidTime = candles[maxIdx].time;

  const candleTimeMap = new Map<number, { index: number; high: number; low: number; close: number }>();
  for (let idx = 0; idx <= maxIdx; idx++) {
    const c = candles[idx];
    if (c && typeof c.time === 'number' && !isNaN(c.time)) {
      candleTimeMap.set(c.time, { index: idx, high: c.high, low: c.low, close: c.close });
    }
  }

  interface AlignedPoint {
    index: number;
    time: number;
    hist: number;
    high: number;
    low: number;
    close: number;
  }

  const aligned: AlignedPoint[] = [];
  for (const h of histogram) {
    if (!h || typeof h.time !== 'number' || isNaN(h.time) || typeof h.value !== 'number' || isNaN(h.value)) continue;
    if (h.time > maxValidTime) continue;
    const c = candleTimeMap.get(h.time);
    if (c) {
      aligned.push({
        index: c.index,
        time: h.time,
        hist: h.value,
        high: c.high,
        low: c.low,
        close: c.close
      });
    }
  }

  if (aligned.length < 15) return [];

  const divergences: MacdDivergence[] = [];
  const emittedPairIds = new Set<string>();

  if (mode === 'zero_cross') {
    // -------------------------------------------------------------
    // MODO 1: ONDAS POR CRUZAMENTO DE ZERO (MACRO / ESTRUTURAL)
    // -------------------------------------------------------------
    interface WaveSegment {
      isPositive: boolean;
      startIndex: number;
      endIndex: number;
      peakHist: number;
      extremePrice: number;
      extremePriceIndex: number;
      extremePriceTime: number;
    }

    const waveSegments: WaveSegment[] = [];
    let currentSeg: WaveSegment | null = null;

    for (let i = 0; i < aligned.length; i++) {
      const pt = aligned[i];
      const isPos = pt.hist >= 0;

      if (!currentSeg || currentSeg.isPositive !== isPos) {
        if (currentSeg && currentSeg.endIndex - currentSeg.startIndex >= 2) {
          waveSegments.push(currentSeg);
        }
        currentSeg = {
          isPositive: isPos,
          startIndex: pt.index,
          endIndex: pt.index,
          peakHist: pt.hist,
          extremePrice: isPos ? pt.high : pt.low,
          extremePriceIndex: pt.index,
          extremePriceTime: pt.time
        };
      } else {
        currentSeg.endIndex = pt.index;
        if (isPos) {
          if (pt.hist > currentSeg.peakHist) {
            currentSeg.peakHist = pt.hist;
          }
          if (pt.high > currentSeg.extremePrice) {
            currentSeg.extremePrice = pt.high;
            currentSeg.extremePriceIndex = pt.index;
            currentSeg.extremePriceTime = pt.time;
          }
        } else {
          if (pt.hist < currentSeg.peakHist) {
            currentSeg.peakHist = pt.hist;
          }
          if (pt.low < currentSeg.extremePrice) {
            currentSeg.extremePrice = pt.low;
            currentSeg.extremePriceIndex = pt.index;
            currentSeg.extremePriceTime = pt.time;
          }
        }
      }
    }

    if (currentSeg && currentSeg.endIndex - currentSeg.startIndex >= 2) {
      waveSegments.push(currentSeg);
    }

    interface Pivot {
      index: number;
      time: number;
      hist: number;
      extremePrice: number;
      isPeak: boolean;
    }

    const pivots: Pivot[] = [];
    waveSegments.forEach((seg, sIdx) => {
      const isCurrent = sIdx === waveSegments.length - 1;
      const peakIdx = seg.extremePriceIndex;
      const barsAfterPeak = maxIdx - peakIdx;

      if (!isCurrent || barsAfterPeak >= confirmationBars) {
        if (isCurrent && confirmationBars > 0) {
          let isTurning = false;
          for (let cIdx = peakIdx + 1; cIdx <= Math.min(maxIdx, peakIdx + confirmationBars); cIdx++) {
            const pt = aligned.find(a => a.index === cIdx);
            if (pt) {
              if (seg.isPositive && pt.hist < seg.peakHist) isTurning = true;
              if (!seg.isPositive && pt.hist > seg.peakHist) isTurning = true;
            }
          }
          if (!isTurning) return;
        }

        if (seg.isPositive && seg.peakHist > 0.001) {
          pivots.push({
            index: seg.extremePriceIndex,
            time: seg.extremePriceTime,
            hist: seg.peakHist,
            extremePrice: seg.extremePrice,
            isPeak: true
          });
        } else if (!seg.isPositive && seg.peakHist < -0.001) {
          pivots.push({
            index: seg.extremePriceIndex,
            time: seg.extremePriceTime,
            hist: seg.peakHist,
            extremePrice: seg.extremePrice,
            isPeak: false
          });
        }
      }
    });

    const peaks = pivots.filter(p => p.isPeak);
    for (let i = 0; i < peaks.length; i++) {
      for (let j = i + 1; j < peaks.length; j++) {
        const p1 = peaks[i];
        const p2 = peaks[j];
        const barDist = p2.index - p1.index;

        if (barDist < minBars) continue;
        if (barDist > lookback) break;

        const price1 = p1.extremePrice;
        const price2 = p2.extremePrice;
        const h1 = p1.hist;
        const h2 = p2.hist;

        if (price2 <= price1 || h2 >= h1 * 0.95) continue;

        let cutsThrough = false;
        const slope = (price2 - price1) / (p2.index - p1.index);
        for (let k = p1.index + 1; k < p2.index; k++) {
          const c = candles[k];
          if (!c) continue;
          const lineY = price1 + slope * (k - p1.index);
          if (c.high > lineY + 0.0001) {
            cutsThrough = true;
            break;
          }
        }
        if (cutsThrough) continue;

        const divId = `bear-${p1.time}-${p2.time}`;
        if (!emittedPairIds.has(divId)) {
          emittedPairIds.add(divId);
          divergences.push({
            id: divId,
            type: 'BEARISH',
            t1: p1.time,
            t2: p2.time,
            hist1: h1,
            hist2: h2,
            price1,
            price2
          });
        }
        break;
      }
    }

    const valleys = pivots.filter(p => !p.isPeak);
    for (let i = 0; i < valleys.length; i++) {
      for (let j = i + 1; j < valleys.length; j++) {
        const v1 = valleys[i];
        const v2 = valleys[j];
        const barDist = v2.index - v1.index;

        if (barDist < minBars) continue;
        if (barDist > lookback) break;

        const price1 = v1.extremePrice;
        const price2 = v2.extremePrice;
        const h1 = v1.hist;
        const h2 = v2.hist;

        if (price2 >= price1 || h2 <= h1 * 0.95) continue;

        let cutsThrough = false;
        const slope = (price2 - price1) / (v2.index - v1.index);
        for (let k = v1.index + 1; k < v2.index; k++) {
          const c = candles[k];
          if (!c) continue;
          const lineY = price1 + slope * (k - v1.index);
          if (c.low < lineY - 0.0001) {
            cutsThrough = true;
            break;
          }
        }
        if (cutsThrough) continue;

        const divId = `bull-${v1.time}-${v2.time}`;
        if (!emittedPairIds.has(divId)) {
          emittedPairIds.add(divId);
          divergences.push({
            id: divId,
            type: 'BULLISH',
            t1: v1.time,
            t2: v2.time,
            hist1: h1,
            hist2: h2,
            price1,
            price2
          });
        }
        break;
      }
    }
  } else {
    // -------------------------------------------------------------
    // MODO 2: PIVÔS DE SWING & CONTRAÇÃO (CLÁSSICO / TRADINGVIEW)
    // -------------------------------------------------------------
    interface SwingPivot {
      index: number;
      histIndex: number;
      time: number;
      hist: number;
      extremePrice: number;
    }

    const conf = Math.max(1, Math.min(confirmationBars, 3));
    const rawPeaks: SwingPivot[] = [];
    const rawValleys: SwingPivot[] = [];

    // Detecção de Pivôs de Swing no Histograma (Fractais)
    for (let i = 2; i < aligned.length - conf; i++) {
      const curr = aligned[i];
      const hCurr = curr.hist;

      // 1. Pivô de Topo no Histograma
      let isPeak = hCurr > aligned[i - 1].hist && hCurr >= aligned[i - 2].hist;
      if (isPeak) {
        for (let c = 1; c <= conf; c++) {
          if (hCurr < aligned[i + c].hist) {
            isPeak = false;
            break;
          }
        }
      }

      if (isPeak && hCurr > 0.0001) {
        let maxHigh = curr.high;
        let maxHighIndex = curr.index;
        let maxHighTime = curr.time;
        for (let k = Math.max(0, i - 2); k <= Math.min(aligned.length - 1, i + 2); k++) {
          if (aligned[k].high > maxHigh) {
            maxHigh = aligned[k].high;
            maxHighIndex = aligned[k].index;
            maxHighTime = aligned[k].time;
          }
        }
        rawPeaks.push({
          index: maxHighIndex,
          histIndex: i,
          time: maxHighTime,
          hist: hCurr,
          extremePrice: maxHigh
        });
      }

      // 2. Pivô de Fundo no Histograma
      let isValley = hCurr < aligned[i - 1].hist && hCurr <= aligned[i - 2].hist;
      if (isValley) {
        for (let c = 1; c <= conf; c++) {
          if (hCurr > aligned[i + c].hist) {
            isValley = false;
            break;
          }
        }
      }

      if (isValley && hCurr < -0.0001) {
        let minLow = curr.low;
        let minLowIndex = curr.index;
        let minLowTime = curr.time;
        for (let k = Math.max(0, i - 2); k <= Math.min(aligned.length - 1, i + 2); k++) {
          if (aligned[k].low < minLow) {
            minLow = aligned[k].low;
            minLowIndex = aligned[k].index;
            minLowTime = aligned[k].time;
          }
        }
        rawValleys.push({
          index: minLowIndex,
          histIndex: i,
          time: minLowTime,
          hist: hCurr,
          extremePrice: minLow
        });
      }
    }

    // Filtrar pivôs adjacentes muito próximos (mesmo swing)
    const cleanPeaks: SwingPivot[] = [];
    for (const p of rawPeaks) {
      if (cleanPeaks.length === 0) {
        cleanPeaks.push(p);
      } else {
        const prev = cleanPeaks[cleanPeaks.length - 1];
        if (p.histIndex - prev.histIndex < 3) {
          if (p.hist > prev.hist || p.extremePrice > prev.extremePrice) {
            cleanPeaks[cleanPeaks.length - 1] = p;
          }
        } else {
          cleanPeaks.push(p);
        }
      }
    }

    const cleanValleys: SwingPivot[] = [];
    for (const v of rawValleys) {
      if (cleanValleys.length === 0) {
        cleanValleys.push(v);
      } else {
        const prev = cleanValleys[cleanValleys.length - 1];
        if (v.histIndex - prev.histIndex < 3) {
          if (v.hist < prev.hist || v.extremePrice < prev.extremePrice) {
            cleanValleys[cleanValleys.length - 1] = v;
          }
        } else {
          cleanValleys.push(v);
        }
      }
    }

    // Análise de Divergências de Baixa (Bearish)
    for (let i = 0; i < cleanPeaks.length; i++) {
      for (let j = i + 1; j < cleanPeaks.length; j++) {
        const p1 = cleanPeaks[i];
        const p2 = cleanPeaks[j];
        const barDist = p2.index - p1.index;

        if (barDist < minBars) continue;
        if (barDist > lookback) break;

        const price1 = p1.extremePrice;
        const price2 = p2.extremePrice;
        const h1 = p1.hist;
        const h2 = p2.hist;

        if (price2 <= price1 || h2 >= h1) continue;

        let minHistBetween = Infinity;
        for (let k = p1.histIndex + 1; k < p2.histIndex; k++) {
          if (aligned[k].hist < minHistBetween) {
            minHistBetween = aligned[k].hist;
          }
        }
        const requiredPullback = Math.min(h1, h2) * 0.75;
        if (minHistBetween > requiredPullback) continue;

        let cutsThrough = false;
        const slope = (price2 - price1) / (p2.index - p1.index);
        const tolerance = Math.max(0.0001, (price2 - price1) * 0.08);
        for (let k = p1.index + 1; k < p2.index; k++) {
          const c = candles[k];
          if (!c) continue;
          const lineY = price1 + slope * (k - p1.index);
          if (c.high > lineY + tolerance) {
            cutsThrough = true;
            break;
          }
        }
        if (cutsThrough) continue;

        const divId = `bear-${p1.time}-${p2.time}`;
        if (!emittedPairIds.has(divId)) {
          emittedPairIds.add(divId);
          divergences.push({
            id: divId,
            type: 'BEARISH',
            t1: p1.time,
            t2: p2.time,
            hist1: h1,
            hist2: h2,
            price1,
            price2
          });
        }
        break;
      }
    }

    // Análise de Divergências de Alta (Bullish)
    for (let i = 0; i < cleanValleys.length; i++) {
      for (let j = i + 1; j < cleanValleys.length; j++) {
        const v1 = cleanValleys[i];
        const v2 = cleanValleys[j];
        const barDist = v2.index - v1.index;

        if (barDist < minBars) continue;
        if (barDist > lookback) break;

        const price1 = v1.extremePrice;
        const price2 = v2.extremePrice;
        const h1 = v1.hist;
        const h2 = v2.hist;

        if (price2 >= price1 || h2 <= h1) continue;

        let maxHistBetween = -Infinity;
        for (let k = v1.histIndex + 1; k < v2.histIndex; k++) {
          if (aligned[k].hist > maxHistBetween) {
            maxHistBetween = aligned[k].hist;
          }
        }
        const requiredRecovery = h1 + Math.abs(h1) * 0.20;
        if (maxHistBetween < requiredRecovery) continue;

        let cutsThrough = false;
        const slope = (price2 - price1) / (v2.index - v1.index);
        const tolerance = Math.max(0.0001, (price1 - price2) * 0.08);
        for (let k = v1.index + 1; k < v2.index; k++) {
          const c = candles[k];
          if (!c) continue;
          const lineY = price1 + slope * (k - v1.index);
          if (c.low < lineY - tolerance) {
            cutsThrough = true;
            break;
          }
        }
        if (cutsThrough) continue;

        const divId = `bull-${v1.time}-${v2.time}`;
        if (!emittedPairIds.has(divId)) {
          emittedPairIds.add(divId);
          divergences.push({
            id: divId,
            type: 'BULLISH',
            t1: v1.time,
            t2: v2.time,
            hist1: h1,
            hist2: h2,
            price1,
            price2
          });
        }
        break;
      }
    }
  }

  return divergences.filter(d => 
    d &&
    typeof d.t1 === 'number' && d.t1 > 0 && !isNaN(d.t1) &&
    typeof d.t2 === 'number' && d.t2 > 0 && !isNaN(d.t2) &&
    typeof d.price1 === 'number' && !isNaN(d.price1) && isFinite(d.price1) &&
    typeof d.price2 === 'number' && !isNaN(d.price2) && isFinite(d.price2) &&
    typeof d.hist1 === 'number' && !isNaN(d.hist1) && isFinite(d.hist1) &&
    typeof d.hist2 === 'number' && !isNaN(d.hist2) && isFinite(d.hist2)
  );
}

export interface FVGData {
  id: string;
  isUp: boolean;
  top: number;
  bottom: number;
  midpoint: number;
  startIndex: number;
  endIndex: number;
  barsAgoPrice: number;
  currentBarPrice: number;
  size: number;
  activeTop: number;
  activeBottom: number;
  isFilled: boolean;
}

export function calculateFVGs(
  candles: any[],
  minimumTicks: number = 1,
  tickSize: number = 1.0,
  _extendUntil: number = 1,
  _barsToExtend: number = 10,
  enforceSameDirection: boolean = false
): FVGData[] {
  const gaps: FVGData[] = [];
  if (!candles || candles.length < 3) return [];

  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i];
    const c1 = candles[i - 1];
    const c2 = candles[i - 2];

    const c0Low = Number(c0.low ?? c0.close);
    const c0High = Number(c0.high ?? c0.close);
    const c2Low = Number(c2.low ?? c2.close);
    const c2High = Number(c2.high ?? c2.close);

    const upGap = c0Low - c2High;
    const dnGap = c2Low - c0High;

    let isUp = false;
    let isDown = false;

    if (upGap >= minimumTicks * tickSize) {
      isUp = true;
      if (enforceSameDirection) {
        if (!(c0.close > c0.open && c1.close > c1.open && c2.close > c2.open)) {
          isUp = false;
        }
      }
    } else if (dnGap >= minimumTicks * tickSize) {
      isDown = true;
      if (enforceSameDirection) {
        if (!(c0.close < c0.open && c1.close < c1.open && c2.close < c2.open)) {
          isDown = false;
        }
      }
    }

    if (isUp) {
      gaps.push({
        id: `fvg_${i - 1}_up`,
        isUp: true,
        top: c0Low,
        bottom: c2High,
        midpoint: (c0Low + c2High) / 2,
        startIndex: i - 1,
        endIndex: -1,
        barsAgoPrice: c2High,
        currentBarPrice: c0Low,
        size: c0Low - c2High,
        activeTop: c0Low,
        activeBottom: c2High,
        isFilled: false
      });
    } else if (isDown) {
      gaps.push({
        id: `fvg_${i - 1}_down`,
        isUp: false,
        top: c2Low,
        bottom: c0High,
        midpoint: (c2Low + c0High) / 2,
        startIndex: i - 1,
        endIndex: -1,
        barsAgoPrice: c2Low,
        currentBarPrice: c0High,
        size: c2Low - c0High,
        activeTop: c2Low,
        activeBottom: c0High,
        isFilled: false
      });
    }
  }

  for (let g = 0; g < gaps.length; g++) {
    const gap = gaps[g];
    for (let k = gap.startIndex + 2; k < candles.length; k++) {
      const bar = candles[k];
      const bHigh = Number(bar.high ?? bar.close);
      const bLow = Number(bar.low ?? bar.close);

      if (gap.isUp) {
        if (bLow <= gap.bottom) {
          gap.isFilled = true;
          gap.endIndex = k;
          break;
        } else if (bLow < gap.activeTop) {
          gap.activeTop = bLow;
        }
      } else {
        if (bHigh >= gap.top) {
          gap.isFilled = true;
          gap.endIndex = k;
          break;
        } else if (bHigh > gap.activeBottom) {
          gap.activeBottom = bHigh;
        }
      }
    }
  }

  return gaps;
}

export function calculateEMACD(data: { close: number; time?: number }[]): {
  histogram: number[];
  histogram_compra: number[];
  histogram_venda: number[];
  histogram_abs: number[];
  explosion: number[];
  deadZone: number[];
  trend: ('compra' | 'venda' | 'neutro')[];
} {
  if (!data || data.length < 30) {
    return {
      histogram: (data || []).map(() => 0),
      histogram_compra: (data || []).map(() => 0),
      histogram_venda: (data || []).map(() => 0),
      histogram_abs: (data || []).map(() => 0),
      explosion: (data || []).map(() => 0),
      deadZone: (data || []).map(() => 20),
      trend: (data || []).map(() => 'neutro' as const)
    };
  }

  const channelLength = 20;
  const mult = 2.0;

  const ema12 = calculateEMA(data, 12).map(e => e.value);
  const ema26 = calculateEMA(data, 26).map(e => e.value);
  const macdValues: number[] = [];
  for (let i = 0; i < data.length; i++) {
    macdValues.push((ema12[i] || 0) - (ema26[i] || 0));
  }

  const explosionLine: number[] = [];
  let firstValidExplosionVal = 0;
  if (data.length >= channelLength) {
    const slice = data.slice(0, channelLength);
    const mean = slice.reduce((sum, item) => sum + item.close, 0) / channelLength;
    const variance = slice.reduce((sum, item) => sum + Math.pow(item.close - mean, 2), 0) / channelLength;
    firstValidExplosionVal = 2 * mult * Math.sqrt(variance);
  }

  for (let i = 0; i < data.length; i++) {
    if (i < channelLength - 1) {
      explosionLine.push(firstValidExplosionVal);
    } else {
      const slice = data.slice(i - channelLength + 1, i + 1);
      const mean = slice.reduce((sum, item) => sum + item.close, 0) / channelLength;
      const variance = slice.reduce((sum, item) => sum + Math.pow(item.close - mean, 2), 0) / channelLength;
      explosionLine.push(2 * mult * Math.sqrt(variance));
    }
  }

  const deadZoneVal = 20;
  const deadZone = data.map(() => deadZoneVal);

  const histCompra: number[] = [];
  const histVenda: number[] = [];
  const histAbs: number[] = [];
  const trends: ('compra' | 'venda' | 'neutro')[] = [];

  for (let i = 0; i < data.length; i++) {
    const val = (macdValues[i] || 0) * 150;
    const absVal = Math.abs(val);
    histAbs.push(absVal);

    if (val >= 0) {
      histCompra.push(val);
      histVenda.push(0);
    } else {
      histCompra.push(0);
      histVenda.push(val);
    }

    const exp = explosionLine[i] || 0;
    if (absVal > exp && absVal > deadZoneVal) {
      trends.push(val >= 0 ? 'compra' : 'venda');
    } else {
      trends.push('neutro');
    }
  }

  return {
    histogram: macdValues.map(v => v * 150),
    histogram_compra: histCompra,
    histogram_venda: histVenda,
    histogram_abs: histAbs,
    explosion: explosionLine,
    deadZone,
    trend: trends
  };
}

export interface TimeHeatmapWindowLine {
  sessionKey: string;
  startTime: number;
  endTime: number;
  startTimeStr: string;
  endTimeStr: string;
}

export interface TimeHeatmapGhostCandle {
  index: number;
  time: number;
  timeStr: string;
  open: number;
  high: number;
  low: number;
  close: number;
  direction: 'COMPRA' | 'VENDA' | 'NEUTRO';
  isBullish: boolean;
  winRate: number; // ex: 75%
  expectedRange: number; // pts
  expectedDelta: number; // pts
  score: number;
  zone: 'frio' | 'neutro' | 'aquecido' | 'hiper';
}

export interface TimeHeatmapForecastSummary {
  direction: 'COMPRA' | 'VENDA' | 'NEUTRO';
  bullProbability: number; // 0 a 100
  bearProbability: number; // 0 a 100
  expectedRangePts: number;
  expectedUpPts: number;
  expectedDownPts: number;
  heatLevel: 'frio' | 'neutro' | 'aquecido' | 'hiper';
  timeStr: string;
  futureTimeStr: string;
  forecastCandlesCount: number;
  dominantFactorSummary?: string;
  mode?: 'historico';
}

export interface TimeHeatmapCorridorPoint {
  time: number;
  upper: number;
  lower: number;
  mid: number;
}

export interface TimeHeatmapBarResult {
  time: number;
  timeStr: string;
  sessionKey: string;
  score: number; // 0 a 100
  baselineScore: number; // Média histórica esperada para o horário (0 a 100)
  zone: 'frio' | 'neutro' | 'aquecido' | 'hiper';
  range: number;
  avgRange: number;
  volume: number;
  avgVolume: number;
  directionalRatio: number;
  inWindow: boolean;
  isForecast?: boolean;
  isBullish?: boolean;
  bullWinRate?: number;
  bearWinRate?: number;
  bodyDelta?: number;
}

export interface ScreenConfluenceContext {
  currentPrice?: number;
  marketData?: any;
  gammaLevels?: any;
  volumeProfile?: any;
  hvnBlocks?: any[];
  activeIndicators?: IndicatorConfig[];
  activeWidgets?: any[];
  forces?: any[];
  panelIndicators?: {
    showSma9?: boolean;
    showEma21?: boolean;
    showEma50?: boolean;
    showRsi?: boolean;
    showMacd?: boolean;
    showPva?: boolean;
    showEMacd?: boolean;
    showFvg?: boolean;
  };
  effectiveShowGamma?: boolean;
  effectiveShowVolumeProfile?: boolean;
  effectiveShowHvnBlocks?: boolean;
  isSentimentWidgetVisible?: boolean;
}

export interface ScreenConfluenceSentimentResult {
  direction: 'COMPRA' | 'VENDA' | 'NEUTRO';
  confluenceScore: number; // 50 a 99
  bullProbability: number; // 0 a 100
  bearProbability: number; // 0 a 100
  volatilityMultiplier: number; // 0.6 a 2.5
  dominantFactors: string[];
  dominantFactorSummary: string;
  layerBreakdown: {
    structureScore: number;
    flowScore: number;
    momentumScore: number;
    trendScore: number;
  };
}

/**
 * Motor de Confluência Ponderada da Tela:
 * Avalia o sentimento e intenção direcional viva do mercado com base estritamente
 * nos indicadores e widgets visíveis na tela, priorizando a Estrutura Institucional de Preço (Camada 1).
 * Suporta correlação invertida de VIX / USD Index e sincronização com adição/remoção de widgets.
 */
export function calculateScreenConfluenceSentiment(
  candles: Candle[],
  ctx?: ScreenConfluenceContext
): ScreenConfluenceSentimentResult {
  const currentPrice = Number(ctx?.currentPrice ?? (candles.length > 0 ? candles[candles.length - 1].close : 0)) || 0;
  const mData = ctx?.marketData || {};
  const gLevels = ctx?.gammaLevels || {};
  const vProfile = ctx?.volumeProfile || {};
  const hvnList = Array.isArray(ctx?.hvnBlocks) ? ctx.hvnBlocks : [];
  const pInd = ctx?.panelIndicators || {};
  const aInd = ctx?.activeIndicators || [];
  const aWidgets = Array.isArray(ctx?.activeWidgets) ? ctx.activeWidgets.filter((w: any) => w && w.visible !== false) : [];
  const hasWidgetsArray = Array.isArray(ctx?.activeWidgets);

  // Verificadores Estritos de Widgets da Tela
  const speedometerWidget = aWidgets.find(w => w.type === 'speedometer');
  const hasSpeedometer = hasWidgetsArray ? !!speedometerWidget : (mData.sentiment !== undefined || mData.macroSentiment !== undefined);
  const momentumAssetWidgets = aWidgets.filter(w => w.type === 'momentum_asset');
  const hasMomentumOverview = aWidgets.some(w => w.type === 'momentum_overview');
  const hasDeltaMeter = aWidgets.some(w => w.type === 'delta_meter');
  const hasAccelerometerWidget = aWidgets.some(w => w.type === 'accelerometer');
  const hasGammaBiasWidget = aWidgets.some(w => w.type === 'gamma_bias');

  // Verificadores Estritos de Indicadores no Gráfico
  const hasVisibleGamma = !!ctx?.effectiveShowGamma || hasGammaBiasWidget || (aInd.some(i => (i.type === 'GammaLevels' || i.type === 'GAMMA_LEVELS' || i.type === 'LEVELS_GAMMA' || i.type === 'LEVELS_OPTIONS' || i.type === 'LEVELS_DAILY' || i.type === 'LEVELS_LIQUIDITY') && i.visible));
  const hasVisibleVP = !!ctx?.effectiveShowVolumeProfile || (aInd.some(i => (i.type === 'VOLUME_LEVELS' || i.type === 'VOLUME_HEATMAP' || i.type === 'VOLUME_PROFILE') && i.visible));
  const hasVisibleHvn = !!ctx?.effectiveShowHvnBlocks || (aInd.some(i => i.type === 'VOLUME_HVN_BLOCKS' && i.visible));
  const hasVisibleDelta = hasDeltaMeter || aInd.some(i => (i.type === 'DELTA' || i.type === 'CVD' || i.type === 'TAPE_READING' || i.type === 'ORDER_FLOW') && i.visible);
  const hasVisibleAcelerometro = hasAccelerometerWidget || aInd.some(i => (i.type === 'ACELEROMETRO' || i.type === 'ATR' || i.type === 'VOLATILITY') && i.visible);
  const hasVisibleMacd = !!pInd.showMacd || !!pInd.showEMacd || aInd.some(i => (i.type === 'MACD' || i.type === 'EMACD' || i.type === 'MACD_EXPLOSION') && i.visible);
  const hasVisibleMa = !!pInd.showSma9 || !!pInd.showEma21 || !!pInd.showEma50 || aInd.some(i => (i.type === 'SMA' || i.type === 'EMA' || i.type === 'TMA' || i.type === 'SUPERTREND') && i.visible);
  const hasVisibleRsi = !!pInd.showRsi || aInd.some(i => i.type === 'RSI' && i.visible);

  const factors: { text: string; score: number; layer: number; weight: number }[] = [];

  // =========================================================================
  // CAMADA 1: ESTRUTURA INSTITUCIONAL DE PREÇO & LIQUIDEZ (PESO BASE: 40%)
  // =========================================================================
  let layer1Weight = 0;
  let layer1ScoreSum = 0;

  if (hasVisibleGamma) {
    const hvl = Number(gLevels.hvl || gLevels.hvl0 || 0);
    const callWall = Number(gLevels.call || gLevels.call0 || 0);
    const putWall = Number(gLevels.put || gLevels.put0 || 0);

    if (hvl > 0 && currentPrice > 0) {
      const diffPct = ((currentPrice - hvl) / hvl) * 100;
      if (diffPct >= 0.05) {
        factors.push({ text: 'Acima do Gamma HVL (Suporte)', score: +1.0, layer: 1, weight: 15 });
        layer1ScoreSum += 1.0 * 15;
        layer1Weight += 15;
      } else if (diffPct <= -0.05) {
        factors.push({ text: 'Abaixo do Gamma HVL (Resistência)', score: -1.0, layer: 1, weight: 15 });
        layer1ScoreSum += -1.0 * 15;
        layer1Weight += 15;
      }
    }

    if (callWall > 0 && putWall > 0 && currentPrice > 0) {
      const distCall = callWall - currentPrice;
      const distPut = currentPrice - putWall;
      if (distCall > 0 && distPut > 0) {
        const bias = distPut > distCall ? +0.6 : -0.6;
        factors.push({
          text: bias > 0 ? 'Afastado de Put Wall (Alta)' : 'Afastado de Call Wall (Baixa)',
          score: bias,
          layer: 1,
          weight: 10
        });
        layer1ScoreSum += bias * 10;
        layer1Weight += 10;
      }
    }
  }

  if (hasVisibleVP) {
    const poc = Number(vProfile.poc || 0);
    if (poc > 0 && currentPrice > 0) {
      if (currentPrice > poc) {
        factors.push({ text: 'Preço acima do VPOC', score: +0.8, layer: 1, weight: 10 });
        layer1ScoreSum += 0.8 * 10;
        layer1Weight += 10;
      } else if (currentPrice < poc) {
        factors.push({ text: 'Preço abaixo do VPOC', score: -0.8, layer: 1, weight: 10 });
        layer1ScoreSum += -0.8 * 10;
        layer1Weight += 10;
      }
    }
  }

  if (hasVisibleHvn && hvnList.length > 0 && currentPrice > 0) {
    const nearbyAbove = hvnList.filter((b: any) => b.price > currentPrice && (b.price - currentPrice) <= 20);
    const nearbyBelow = hvnList.filter((b: any) => b.price < currentPrice && (currentPrice - b.price) <= 20);
    if (nearbyBelow.length > nearbyAbove.length) {
      factors.push({ text: 'Suporte de Bloco HVN', score: +0.7, layer: 1, weight: 5 });
      layer1ScoreSum += 0.7 * 5;
      layer1Weight += 5;
    } else if (nearbyAbove.length > nearbyBelow.length) {
      factors.push({ text: 'Resistência de Bloco HVN', score: -0.7, layer: 1, weight: 5 });
      layer1ScoreSum += -0.7 * 5;
      layer1Weight += 5;
    }
  }

  // =========================================================================
  // CAMADA 2: FLUXO & SENTIMENTO GLOBAL (PESO BASE: 30%)
  // =========================================================================
  let layer2Weight = 0;
  let layer2ScoreSum = 0;

  // 2.1 Velocímetro de Sentimento Macro & Micro (apenas se o widget speedometer estiver ativo na tela)
  if (hasSpeedometer) {
    const showMacro = speedometerWidget ? speedometerWidget.params?.showMacro !== false : true;
    const showMicro = speedometerWidget ? speedometerWidget.params?.showMicro !== false : true;

    const rawMacro = Number(mData.sentiment ?? mData.macroSentiment ?? 50);
    const rawMicro = Number(mData.marketSentiment ?? mData.microSentiment ?? rawMacro);

    if (showMacro && !isNaN(rawMacro)) {
      const macroNormalized = (rawMacro - 50) / 50; // -1.0 a +1.0
      factors.push({
        text: `Sentimento Macro ${Math.round(rawMacro)}%`,
        score: macroNormalized,
        layer: 2,
        weight: 15
      });
      layer2ScoreSum += macroNormalized * 15;
      layer2Weight += 15;
    }

    if (showMicro && !isNaN(rawMicro) && (rawMicro !== rawMacro || !showMacro)) {
      const microNormalized = (rawMicro - 50) / 50;
      factors.push({
        text: `Sentimento Micro ${Math.round(rawMicro)}%`,
        score: microNormalized,
        layer: 2,
        weight: 10
      });
      layer2ScoreSum += microNormalized * 10;
      layer2Weight += 10;
    }
  }

  // 2.2 Gauges Individuais de Ativos Momentum (ex: Gauge VIX, Gauge NDAQ, Gauge NVDA, etc.)
  if (momentumAssetWidgets.length > 0) {
    momentumAssetWidgets.forEach(w => {
      const targetSymbol = (w.params?.assetSymbol || 'NVIDIA').toString();
      const upperSym = targetSymbol.toUpperCase();
      const isInverted = upperSym === 'VIX' || upperSym === 'USD INDEX' || upperSym === 'DXY';

      let buyVal = 50;
      if (upperSym === 'FORÇA FINAL') {
        const activeForces = (ctx?.forces || []).filter((f: any) => f.symbol !== 'FORÇA FINAL');
        buyVal = activeForces.length > 0
          ? Math.round(activeForces.reduce((acc: number, curr: any) => {
              const isInv = curr.symbol === 'VIX' || curr.symbol === 'USD Index' || curr.symbol === 'DXY';
              return acc + (isInv ? (100 - curr.buy) : curr.buy);
            }, 0) / activeForces.length)
          : 50;
      } else {
        const found = (ctx?.forces || []).find((f: any) =>
          f.symbol?.toLowerCase() === targetSymbol.toLowerCase() ||
          f.symbol === targetSymbol ||
          f.name?.toLowerCase() === targetSymbol.toLowerCase()
        );
        if (found) {
          buyVal = Number(found.buy ?? 50);
        } else if (isInverted && mData.vixBuy !== undefined) {
          buyVal = Number(mData.vixBuy);
        }
      }

      // Regra Financeira de Correlação Inversa (VIX / DXY):
      // VIX caindo / Venda (ex: 20% C / 80% V) = Sentimento ALTISTA / COMPRADOR para o mercado (+0.60 score)
      // VIX subindo / Compra (ex: 80% C / 20% V) = Sentimento BAIXISTA / VENDEDOR para o mercado (-0.60 score)
      const effectiveMarketScore = isInverted
        ? ((100 - buyVal) - 50) / 50   // 80% Venda -> (80 - 50)/50 = +0.60 (Alta)
        : (buyVal - 50) / 50;

      const factorText = isInverted
        ? `VIX ${Math.round(100 - buyVal)}% Venda (${effectiveMarketScore >= 0 ? 'Alta' : 'Baixa'})`
        : `Força ${targetSymbol} ${Math.round(buyVal)}%`;

      factors.push({
        text: factorText,
        score: effectiveMarketScore,
        layer: 2,
        weight: 15
      });
      layer2ScoreSum += effectiveMarketScore * 15;
      layer2Weight += 15;
    });
  }

  // 2.3 Força Momentum (Cesta Geral)
  if (hasMomentumOverview) {
    const allForces = (ctx?.forces || []).filter((f: any) => f.symbol !== 'FORÇA FINAL');
    if (allForces.length > 0) {
      const avgScore = allForces.reduce((acc: number, curr: any) => {
        const isInv = curr.symbol === 'VIX' || curr.symbol === 'USD Index' || curr.symbol === 'DXY';
        const effectiveBuy = isInv ? (100 - curr.buy) : curr.buy;
        return acc + ((effectiveBuy - 50) / 50);
      }, 0) / allForces.length;

      factors.push({
        text: `Cesta Macro Momentum (${avgScore >= 0 ? 'Alta' : 'Baixa'})`,
        score: avgScore,
        layer: 2,
        weight: 12
      });
      layer2ScoreSum += avgScore * 12;
      layer2Weight += 12;
    }
  }

  // 2.4 Delta Ratio / Agressão
  if (hasVisibleDelta) {
    const deltaRatio = Number(mData.deltaRatio ?? mData.delta_pct ?? 50);
    if (!isNaN(deltaRatio) && deltaRatio !== 50) {
      const deltaNormalized = (deltaRatio - 50) / 50;
      factors.push({
        text: `Delta Fluxo ${Math.round(deltaRatio)}%`,
        score: deltaNormalized,
        layer: 2,
        weight: 10
      });
      layer2ScoreSum += deltaNormalized * 10;
      layer2Weight += 10;
    }
  }

  // =========================================================================
  // CAMADA 3: ACELERAÇÃO & VOLATILIDADE (PESO BASE: 18%)
  // =========================================================================
  let layer3Weight = 0;
  let layer3ScoreSum = 0;

  const atrRatio = Math.max(0.2, Number(mData.atrRatio || mData.atr_ratio || 1.0));
  const zScore = Number(mData.zScore || mData.zscore || 0);

  let volatilityMultiplier = 1.0;
  if (atrRatio >= 1.25) {
    volatilityMultiplier = Math.min(2.0, 1.0 + (atrRatio - 1.0) * 0.7);
  } else if (atrRatio <= 0.75) {
    volatilityMultiplier = Math.max(0.65, atrRatio);
  } else {
    volatilityMultiplier = 1.0;
  }

  if (hasVisibleAcelerometro) {
    if (atrRatio >= 1.25) {
      factors.push({ text: `Aceleração (ATR ${atrRatio.toFixed(2)})`, score: zScore > 0 ? +0.8 : (zScore < 0 ? -0.8 : 0), layer: 3, weight: 10 });
      layer3ScoreSum += (zScore > 0 ? 0.8 : (zScore < 0 ? -0.8 : 0)) * 10;
      layer3Weight += 10;
    } else if (atrRatio <= 0.75) {
      factors.push({ text: `Compressão (ATR ${atrRatio.toFixed(2)})`, score: 0, layer: 3, weight: 6 });
      layer3Weight += 6;
    }
  }

  if (hasVisibleMacd && candles.length >= 26) {
    const cClose = candles[candles.length - 1].close;
    const prevClose = candles[candles.length - 2]?.close || cClose;
    const isMacdUp = cClose > prevClose;
    const macdScore = isMacdUp ? +0.7 : -0.7;
    factors.push({ text: isMacdUp ? 'Momentum MACD Alta' : 'Momentum MACD Baixa', score: macdScore, layer: 3, weight: 8 });
    layer3ScoreSum += macdScore * 8;
    layer3Weight += 8;
  }

  // =========================================================================
  // CAMADA 4: SEGUIDORES DE TENDÊNCIA & MÉDIAS MÓVEIS (PESO BASE: 12%)
  // =========================================================================
  let layer4Weight = 0;
  let layer4ScoreSum = 0;

  if (hasVisibleMa && candles.length >= 21) {
    const len = candles.length;
    const cClose = candles[len - 1].close;
    const sma9 = candles.slice(-9).reduce((acc, c) => acc + c.close, 0) / Math.min(9, len);
    const sma21 = candles.slice(-21).reduce((acc, c) => acc + c.close, 0) / Math.min(21, len);

    if (cClose > sma9 && sma9 > sma21) {
      factors.push({ text: 'Médias Alinhadas Compra', score: +1.0, layer: 4, weight: 8 });
      layer4ScoreSum += 1.0 * 8;
      layer4Weight += 8;
    } else if (cClose < sma9 && sma9 < sma21) {
      factors.push({ text: 'Médias Alinhadas Venda', score: -1.0, layer: 4, weight: 8 });
      layer4ScoreSum += -1.0 * 8;
      layer4Weight += 8;
    }
  }

  if (hasVisibleRsi && candles.length >= 14) {
    const rsiScore = currentPrice > (candles[candles.length - 14]?.close || currentPrice) ? +0.5 : -0.5;
    factors.push({ text: rsiScore > 0 ? 'RSI Positivo' : 'RSI Negativo', score: rsiScore, layer: 4, weight: 4 });
    layer4ScoreSum += rsiScore * 4;
    layer4Weight += 4;
  }

  // Normalização Global das Camadas Ativas Ponderadas
  const l1Norm = layer1Weight > 0 ? (layer1ScoreSum / layer1Weight) : 0;
  const l2Norm = layer2Weight > 0 ? (layer2ScoreSum / layer2Weight) : 0;
  const l3Norm = layer3Weight > 0 ? (layer3ScoreSum / layer3Weight) : 0;
  const l4Norm = layer4Weight > 0 ? (layer4ScoreSum / layer4Weight) : 0;

  const w1 = layer1Weight > 0 ? 0.40 : 0;
  const w2 = layer2Weight > 0 ? 0.30 : 0;
  const w3 = layer3Weight > 0 ? 0.18 : 0;
  const w4 = layer4Weight > 0 ? 0.12 : 0;
  const totalW = w1 + w2 + w3 + w4;

  const compositeScore = totalW > 0 ? (l1Norm * w1 + l2Norm * w2 + l3Norm * w3 + l4Norm * w4) / totalW : 0;

  // Probabilidade proporcional direta com precisão exata
  const bullProb = Math.round(Math.max(5, Math.min(95, 50 + compositeScore * 50)));
  const bearProb = 100 - bullProb;

  const direction: 'COMPRA' | 'VENDA' | 'NEUTRO' = bullProb >= 55 ? 'COMPRA' : (bearProb >= 55 ? 'VENDA' : 'NEUTRO');
  const confluenceScore = Math.max(bullProb, bearProb);

  const topFactors = factors
    .sort((a, b) => (Math.abs(b.score) * b.weight) - (Math.abs(a.score) * a.weight))
    .slice(0, 3)
    .map(f => f.text);

  const dominantSummary = topFactors.length > 0
    ? topFactors.slice(0, 2).join(' + ')
    : (direction === 'COMPRA' ? 'Confluência Compradora' : direction === 'VENDA' ? 'Confluência Vendedora' : 'Equilíbrio Neutro');

  return {
    direction,
    confluenceScore,
    bullProbability: bullProb,
    bearProbability: bearProb,
    volatilityMultiplier,
    dominantFactors: topFactors,
    dominantFactorSummary: dominantSummary,
    layerBreakdown: {
      structureScore: Math.round(l1Norm * 100),
      flowScore: Math.round(l2Norm * 100),
      momentumScore: Math.round(l3Norm * 100),
      trendScore: Math.round(l4Norm * 100)
    }
  };
}

export interface TimeHeatmapAnalysisResult {
  bars: TimeHeatmapBarResult[];
  forecastBars: TimeHeatmapBarResult[];
  ghostCandles: TimeHeatmapGhostCandle[];
  sentimentGhostCandles?: TimeHeatmapGhostCandle[];
  corridor: TimeHeatmapCorridorPoint[];
  forecastSummary: TimeHeatmapForecastSummary | null;
  sentimentForecastSummary?: TimeHeatmapForecastSummary | null;
  sentimentConfluence?: any;
  windowLines: TimeHeatmapWindowLine[];
  currentStatus: 'frio' | 'neutro' | 'aquecido' | 'hiper';
  currentScore: number;
  hotThreshold: number;
  showGhostCandles?: boolean;
  showForecastBadge?: boolean;
  showExpansionCorridor?: boolean;
  forecastCandlesCount?: number;
}

export function calculateTimeHeatmap(
  candles: Candle[],
  params?: {
    lookbackDays?: number;
    scope?: 'custom_window' | 'all_session';
    startTime?: string;
    endTime?: string;
    heatMode?: 'trend_volume' | 'volatility_range' | 'relative_volume';
    hotThreshold?: number;
    showGhostCandles?: boolean;
    forecastCandlesCount?: number;
    showForecastBadge?: boolean;
    showExpansionCorridor?: boolean;
  },
  options?: { systemSessionStart?: string; marketContext?: ScreenConfluenceContext }
): TimeHeatmapAnalysisResult {
  const lookbackDays = Math.max(1, Number(params?.lookbackDays || 10));
  const scope = params?.scope || 'custom_window';
  const startTimeStr = (params?.startTime || '09:30').slice(0, 5);
  const endTimeStr = (params?.endTime || '12:30').slice(0, 5);
  const heatMode = params?.heatMode || 'trend_volume';
  const hotThreshold = Math.max(40, Math.min(95, Number(params?.hotThreshold || 70)));
  const showGhostCandles = params?.showGhostCandles !== false;
  const forecastCandlesCount = Math.max(1, Math.min(100, Number(params?.forecastCandlesCount || 5)));
  const showForecastBadge = params?.showForecastBadge !== false;
  const showExpansionCorridor = params?.showExpansionCorridor !== false;
  const sysStart = options?.systemSessionStart || '19:00:00';

  if (!candles || candles.length === 0) {
    return {
      bars: [],
      forecastBars: [],
      ghostCandles: [],
      corridor: [],
      forecastSummary: null,
      windowLines: [],
      currentStatus: 'frio',
      currentScore: 0,
      hotThreshold,
      showGhostCandles,
      showForecastBadge,
      showExpansionCorridor,
      forecastCandlesCount
    };
  }

  // 1. Agrupar velas por Sessão Operacional (fuso UTC-3 Brasília)
  const sessionMap = new Map<string, { candle: Candle; time: number; timeStr: string; range: number; volume: number; de: number; isBullish: boolean; upExpansion: number; downExpansion: number; bodyDelta: number }[]>();
  const sessionKeysOrder: string[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const sInfo = getCandleSessionInfo(c, sysStart, 'all');
    if (!sInfo) continue;

    const t = getCandleTimeSeconds(c);
    const high = Number(c.high ?? c.close ?? 0);
    const low = Number(c.low ?? c.close ?? 0);
    const open = Number(c.open ?? c.close ?? 0);
    const close = Number(c.close ?? 0);
    const vol = Number(c.volume ?? 0);
    const range = Math.max(0, high - low);
    const de = range > 0 ? Math.abs(close - open) / range : 0.5;
    const isBullish = close >= open;
    const upExpansion = Math.max(0, high - open);
    const downExpansion = Math.max(0, open - low);
    const bodyDelta = close - open;

    if (!sessionMap.has(sInfo.sessionKey)) {
      sessionMap.set(sInfo.sessionKey, []);
      sessionKeysOrder.push(sInfo.sessionKey);
    }

    sessionMap.get(sInfo.sessionKey)!.push({
      candle: c,
      time: t,
      timeStr: sInfo.timeStr,
      range,
      volume: vol,
      de,
      isBullish,
      upExpansion,
      downExpansion,
      bodyDelta
    });
  }

  const barsResult: TimeHeatmapBarResult[] = [];
  const forecastBars: TimeHeatmapBarResult[] = [];
  const ghostCandles: TimeHeatmapGhostCandle[] = [];
  const corridor: TimeHeatmapCorridorPoint[] = [];
  let forecastSummary: TimeHeatmapForecastSummary | null = null;
  const windowLines: TimeHeatmapWindowLine[] = [];

  // 2. Para cada sessão, calcular as métricas históricas baseadas nos lookbackDays dias anteriores
  for (let sIdx = 0; sIdx < sessionKeysOrder.length; sIdx++) {
    const sessionKey = sessionKeysOrder[sIdx];
    const currentSessionData = sessionMap.get(sessionKey) || [];
    if (currentSessionData.length === 0) continue;

    // Sessões históricas anteriores para esta sessão (até lookbackDays dias)
    const prevSessions = sessionKeysOrder.slice(Math.max(0, sIdx - lookbackDays), sIdx);

    // Mapear médias históricas e viés direcional por timeStr (ex: "10:15")
    const historicalStatsByTime = new Map<string, {
      ranges: number[];
      volumes: number[];
      des: number[];
      bulls: number[];
      upExpansions: number[];
      downExpansions: number[];
      bodyDeltas: number[];
    }>();

    let totalHistRange = 0;
    let totalHistVol = 0;
    let totalHistCount = 0;

    for (const pKey of prevSessions) {
      const pData = sessionMap.get(pKey) || [];
      for (const item of pData) {
        if (!historicalStatsByTime.has(item.timeStr)) {
          historicalStatsByTime.set(item.timeStr, {
            ranges: [],
            volumes: [],
            des: [],
            bulls: [],
            upExpansions: [],
            downExpansions: [],
            bodyDeltas: []
          });
        }
        const st = historicalStatsByTime.get(item.timeStr)!;
        st.ranges.push(item.range);
        st.volumes.push(item.volume);
        st.des.push(item.de);
        st.bulls.push(item.isBullish ? 1 : 0);
        st.upExpansions.push(item.upExpansion);
        st.downExpansions.push(item.downExpansion);
        st.bodyDeltas.push(item.bodyDelta);

        totalHistRange += item.range;
        totalHistVol += item.volume;
        totalHistCount++;
      }
    }

    const globalAvgRange = totalHistCount > 0 ? totalHistRange / totalHistCount : 1.0;
    const globalAvgVol = totalHistCount > 0 ? totalHistVol / totalHistCount : 100.0;

    let winStartTs: number | null = null;
    let winEndTs: number | null = null;

    // Primeiro passo da sessão: calcular score instantâneo e baselineScore para cada candle
    const sessionBarsTemp: {
      time: number;
      timeStr: string;
      sessionKey: string;
      score: number;
      baselineScore: number;
      zone: 'frio' | 'neutro' | 'aquecido' | 'hiper';
      range: number;
      avgRange: number;
      volume: number;
      avgVolume: number;
      directionalRatio: number;
      inWindow: boolean;
      isBullish: boolean;
      bullWinRate: number;
      bearWinRate: number;
      bodyDelta: number;
    }[] = [];

    for (const item of currentSessionData) {
      let inWindow = true;
      if (scope === 'custom_window') {
        if (startTimeStr <= endTimeStr) {
          inWindow = item.timeStr >= startTimeStr && item.timeStr <= endTimeStr;
        } else {
          inWindow = item.timeStr >= startTimeStr || item.timeStr <= endTimeStr;
        }
      }

      if (inWindow) {
        if (winStartTs === null) winStartTs = item.time;
        winEndTs = item.time;
      }

      const hist = historicalStatsByTime.get(item.timeStr);
      let avgRange = item.range;
      let avgVolume = item.volume;
      let bullWinRate = 50;
      let bearWinRate = 50;

      if (hist && hist.ranges.length > 0) {
        avgRange = hist.ranges.reduce((a, b) => a + b, 0) / hist.ranges.length;
        avgVolume = hist.volumes.reduce((a, b) => a + b, 0) / hist.volumes.length;
        const totalBulls = hist.bulls.reduce((a, b) => a + b, 0);
        bullWinRate = Math.round((totalBulls / hist.bulls.length) * 100);
        bearWinRate = 100 - bullWinRate;
      }

      let score = 0;
      let baselineScore = 50;

      if (inWindow) {
        const safeAvgRange = Math.max(0.0001, avgRange);
        const safeAvgVol = Math.max(1, avgVolume);

        const rangeRatio = item.range / safeAvgRange;
        const volRatio = item.volume / safeAvgVol;
        const directionalRatio = item.de;

        if (heatMode === 'trend_volume') {
          const compRange = Math.min(2.0, rangeRatio) / 2.0;
          const compVol = Math.min(2.0, volRatio) / 2.0;
          const compDir = directionalRatio;
          const rawScore = compRange * 0.40 + compVol * 0.35 + compDir * 0.25;
          score = Math.round(Math.min(100, Math.max(0, rawScore * 100)));
        } else if (heatMode === 'volatility_range') {
          const rawScore = Math.min(2.5, rangeRatio) / 2.5;
          score = Math.round(Math.min(100, Math.max(0, rawScore * 100)));
        } else {
          // relative_volume
          const rawScore = Math.min(2.5, volRatio) / 2.5;
          score = Math.round(Math.min(100, Math.max(0, rawScore * 100)));
        }

        // Média Histórica Esperada do Horário (Baseline Normalizada)
        if (hist && hist.ranges.length > 0) {
          const hRange = hist.ranges.reduce((a, b) => a + b, 0) / hist.ranges.length;
          const hVol = hist.volumes.reduce((a, b) => a + b, 0) / hist.volumes.length;
          const hDe = hist.des.reduce((a, b) => a + b, 0) / hist.des.length;

          const rRatio = hRange / Math.max(0.0001, globalAvgRange);
          const vRatio = hVol / Math.max(1, globalAvgVol);

          if (heatMode === 'trend_volume') {
            const cRange = Math.min(2.0, rRatio) / 2.0;
            const cVol = Math.min(2.0, vRatio) / 2.0;
            const rawBScore = cRange * 0.40 + cVol * 0.35 + hDe * 0.25;
            baselineScore = Math.round(Math.min(100, Math.max(0, rawBScore * 100)));
          } else if (heatMode === 'volatility_range') {
            baselineScore = Math.round(Math.min(100, Math.max(0, (Math.min(2.5, rRatio) / 2.5) * 100)));
          } else {
            baselineScore = Math.round(Math.min(100, Math.max(0, (Math.min(2.5, vRatio) / 2.5) * 100)));
          }
        } else {
          baselineScore = score;
        }
      } else {
        score = 0;
        baselineScore = 0;
      }

      let zone: 'frio' | 'neutro' | 'aquecido' | 'hiper' = 'frio';
      if (!inWindow || score < 35) {
        zone = 'frio';
      } else if (score < hotThreshold) {
        zone = 'neutro';
      } else if (score < 85) {
        zone = 'aquecido';
      } else {
        zone = 'hiper';
      }

      sessionBarsTemp.push({
        time: item.time,
        timeStr: item.timeStr,
        sessionKey,
        score,
        baselineScore,
        zone,
        range: item.range,
        avgRange,
        volume: item.volume,
        avgVolume,
        directionalRatio: item.de,
        inWindow,
        isBullish: item.isBullish,
        bullWinRate,
        bearWinRate,
        bodyDelta: item.bodyDelta
      });
    }

    // Suavização Gaussiana / EMA Fluida da Curva de Média Histórica (raio 4 com pesos ponderados)
    const weights = [1, 2, 4, 7, 10, 7, 4, 2, 1];
    const radius = 4;
    for (let k = 0; k < sessionBarsTemp.length; k++) {
      const b = sessionBarsTemp[k];
      if (!b.inWindow) {
        barsResult.push({ ...b, isForecast: false });
        continue;
      }

      let weightedSum = 0;
      let totalWeight = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const targetIdx = k + offset;
        if (targetIdx >= 0 && targetIdx < sessionBarsTemp.length) {
          const neighbor = sessionBarsTemp[targetIdx];
          if (neighbor.inWindow) {
            const w = weights[offset + radius];
            weightedSum += neighbor.baselineScore * w;
            totalWeight += w;
          }
        }
      }

      const smoothedBaseline = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : b.baselineScore;

      barsResult.push({
        ...b,
        baselineScore: smoothedBaseline,
        isForecast: false
      });
    }

    if (scope === 'custom_window' && winStartTs !== null && winEndTs !== null) {
      windowLines.push({
        sessionKey,
        startTime: winStartTs,
        endTime: winEndTs,
        startTimeStr,
        endTimeStr
      });
    }

    // 3. Projeção Futura (Forecast) + Velas Fantasma + Corredor a partir do último candle da sessão atual
    if (sIdx === sessionKeysOrder.length - 1 && currentSessionData.length > 0) {
      let stepSeconds = 300; // 5 minutos padrão
      if (currentSessionData.length >= 2) {
        const diff = currentSessionData[currentSessionData.length - 1].time - currentSessionData[currentSessionData.length - 2].time;
        if (diff > 0 && diff <= 3600) stepSeconds = diff;
      }

      const lastCandle = currentSessionData[currentSessionData.length - 1];
      const lastBarRes = barsResult[barsResult.length - 1];
      const maxForecastBars = Math.max(60, forecastCandlesCount + 10);

      // Ponto de partida conectando suavemente com a última média calculada
      forecastBars.push({
        time: lastCandle.time,
        timeStr: lastCandle.timeStr,
        sessionKey,
        score: lastBarRes?.score || 50,
        baselineScore: lastBarRes?.baselineScore || 50,
        zone: lastBarRes?.zone || 'neutro',
        range: lastCandle.range,
        avgRange: lastCandle.range,
        volume: lastCandle.volume,
        avgVolume: lastCandle.volume,
        directionalRatio: lastCandle.de,
        inWindow: true,
        isForecast: true,
        isBullish: lastCandle.isBullish,
        bullWinRate: lastBarRes?.bullWinRate || 50,
        bearWinRate: lastBarRes?.bearWinRate || 50
      });

      const tempForecastList: {
        time: number;
        timeStr: string;
        baselineScore: number;
        inWindow: boolean;
        avgRange: number;
        avgUpExp: number;
        avgDownExp: number;
        avgBodyDelta: number;
        bullWinRate: number;
        bearWinRate: number;
      }[] = [];

      for (let f = 1; f <= maxForecastBars; f++) {
        const futureTs = lastCandle.time + f * stepSeconds;
        const fDate = new Date(futureTs * 1000 - 3 * 3600 * 1000);
        const hh = String(fDate.getUTCHours()).padStart(2, '0');
        const mm = String(fDate.getUTCMinutes()).padStart(2, '0');
        const futureTimeStr = `${hh}:${mm}`;

        let inWindow = true;
        if (scope === 'custom_window') {
          if (startTimeStr <= endTimeStr) {
            inWindow = futureTimeStr >= startTimeStr && futureTimeStr <= endTimeStr;
          } else {
            inWindow = futureTimeStr >= startTimeStr || futureTimeStr <= endTimeStr;
          }
        }

        const hist = historicalStatsByTime.get(futureTimeStr);
        let fScore = 45;
        let fRange = globalAvgRange;
        let fUpExp = globalAvgRange * 0.5;
        let fDownExp = globalAvgRange * 0.5;
        let fBodyDelta = 0;
        let fBullWinRate = 50;
        let fBearWinRate = 50;

        if (hist && hist.ranges.length > 0) {
          fRange = hist.ranges.reduce((a, b) => a + b, 0) / hist.ranges.length;
          const fVol = hist.volumes.reduce((a, b) => a + b, 0) / hist.volumes.length;
          const fDe = hist.des.reduce((a, b) => a + b, 0) / hist.des.length;
          fUpExp = hist.upExpansions.reduce((a, b) => a + b, 0) / hist.upExpansions.length;
          fDownExp = hist.downExpansions.reduce((a, b) => a + b, 0) / hist.downExpansions.length;
          fBodyDelta = hist.bodyDeltas.reduce((a, b) => a + b, 0) / hist.bodyDeltas.length;

          const totalBulls = hist.bulls.reduce((a, b) => a + b, 0);
          fBullWinRate = Math.round((totalBulls / hist.bulls.length) * 100);
          fBearWinRate = 100 - fBullWinRate;

          const rRatio = fRange / Math.max(0.0001, globalAvgRange);
          const vRatio = fVol / Math.max(1, globalAvgVol);

          if (heatMode === 'trend_volume') {
            const cRange = Math.min(2.0, rRatio) / 2.0;
            const cVol = Math.min(2.0, vRatio) / 2.0;
            const rawScore = cRange * 0.40 + cVol * 0.35 + fDe * 0.25;
            fScore = Math.round(Math.min(100, Math.max(0, rawScore * 100)));
          } else if (heatMode === 'volatility_range') {
            fScore = Math.round(Math.min(100, Math.max(0, (Math.min(2.5, rRatio) / 2.5) * 100)));
          } else {
            fScore = Math.round(Math.min(100, Math.max(0, (Math.min(2.5, vRatio) / 2.5) * 100)));
          }
        }

        if (!inWindow) {
          fScore = 0;
        }

        tempForecastList.push({
          time: futureTs,
          timeStr: futureTimeStr,
          baselineScore: fScore,
          inWindow,
          avgRange: fRange,
          avgUpExp: fUpExp,
          avgDownExp: fDownExp,
          avgBodyDelta: fBodyDelta,
          bullWinRate: fBullWinRate,
          bearWinRate: fBearWinRate
        });
      }

      // Suavização Gaussiana da curva de projeção futura
      for (let fk = 0; fk < tempForecastList.length; fk++) {
        const item = tempForecastList[fk];
        let weightedSum = 0;
        let totalWeight = 0;
        for (let offset = -radius; offset <= radius; offset++) {
          const targetIdx = fk + offset;
          if (targetIdx >= 0 && targetIdx < tempForecastList.length) {
            const neighbor = tempForecastList[targetIdx];
            if (neighbor.inWindow) {
              const w = weights[offset + radius];
              weightedSum += neighbor.baselineScore * w;
              totalWeight += w;
            }
          }
        }
        const smoothedFScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : item.baselineScore;
        let zone: 'frio' | 'neutro' | 'aquecido' | 'hiper' = 'frio';
        if (!item.inWindow || smoothedFScore < 35) zone = 'frio';
        else if (smoothedFScore < hotThreshold) zone = 'neutro';
        else if (smoothedFScore < 85) zone = 'aquecido';
        else zone = 'hiper';

        forecastBars.push({
          time: item.time,
          timeStr: item.timeStr,
          sessionKey,
          score: smoothedFScore,
          baselineScore: smoothedFScore,
          zone,
          range: item.avgRange,
          avgRange: item.avgRange,
          volume: globalAvgVol,
          avgVolume: globalAvgVol,
          directionalRatio: 0.5,
          inWindow: item.inWindow,
          isForecast: true,
          isBullish: item.bullWinRate >= 50,
          bullWinRate: item.bullWinRate,
          bearWinRate: item.bearWinRate
        });
      }

      // 4. Construção das Velas Fantasma e Corredores de Preço no Gráfico Principal
      const lastClosePrice = Number(lastCandle.candle.close ?? lastCandle.candle.open ?? 0);
      const numGhost = Math.min(forecastCandlesCount, tempForecastList.length);

      // Calcular ATR real recente do gráfico para garantir proporções e amplitudes autênticas de mercado
      const recentSlice = candles.slice(-25);
      const recentATR = recentSlice.length > 0
        ? (recentSlice.reduce((sum, c) => sum + Math.max(0.5, Number(c.high ?? c.close) - Number(c.low ?? c.close)), 0) / recentSlice.length)
        : 15.0;

      // Ponto zero do corredor no candle atual
      corridor.push({
        time: lastCandle.time,
        upper: lastClosePrice,
        lower: lastClosePrice,
        mid: lastClosePrice
      });

      // ==========================================
      // A. MODO 1: PROJEÇÃO HISTÓRICA (Sazonal Pura)
      // ==========================================
      let runningHistoricClose = lastClosePrice;
      let aggHistBull = 0;
      let aggHistBear = 0;
      let aggHistRange = 0;
      let aggHistUp = 0;
      let aggHistDown = 0;

      for (let g = 0; g < numGhost; g++) {
        const item = tempForecastList[g];
        const gOpen = runningHistoricClose;

        const effectiveRange = Math.max(recentATR * 0.85, item.avgRange > 0 ? item.avgRange : recentATR);
        let histDelta = item.avgBodyDelta !== 0
          ? item.avgBodyDelta
          : ((item.bullWinRate - 50) / 50) * (effectiveRange * 0.55);

        if (Math.abs(histDelta) < effectiveRange * 0.28) {
          histDelta = (item.bullWinRate >= 50 ? 1 : -1) * (effectiveRange * 0.38);
        }

        const isBull = histDelta >= 0;
        const gClose = gOpen + histDelta;
        runningHistoricClose = gClose;

        const bodyTop = Math.max(gOpen, gClose);
        const bodyBottom = Math.min(gOpen, gClose);
        const bodySize = Math.abs(histDelta);

        const minWickSize = Math.max(2.0, effectiveRange * 0.18);
        const totalWickSpace = Math.max(minWickSize * 2, effectiveRange - bodySize);
        const upperWickRatio = isBull ? 0.45 : 0.55;
        const upperWick = Math.max(minWickSize, totalWickSpace * upperWickRatio);
        const lowerWick = Math.max(minWickSize, totalWickSpace * (1 - upperWickRatio));

        const gHigh = bodyTop + upperWick;
        const gLow = bodyBottom - lowerWick;

        const candleWinRate = isBull ? item.bullWinRate : item.bearWinRate;
        const dir: 'COMPRA' | 'VENDA' | 'NEUTRO' = isBull
          ? (candleWinRate >= 54 ? 'COMPRA' : 'NEUTRO')
          : (candleWinRate <= 46 ? 'VENDA' : 'NEUTRO');

        ghostCandles.push({
          index: g + 1,
          time: item.time,
          timeStr: item.timeStr,
          open: Number(gOpen.toFixed(2)),
          high: Number(gHigh.toFixed(2)),
          low: Number(gLow.toFixed(2)),
          close: Number(gClose.toFixed(2)),
          direction: dir,
          isBullish: isBull,
          winRate: candleWinRate,
          expectedRange: Number(effectiveRange.toFixed(1)),
          expectedDelta: Number((gClose - gOpen).toFixed(1)),
          score: item.baselineScore,
          zone: item.baselineScore >= hotThreshold ? 'aquecido' : (item.baselineScore >= 35 ? 'neutro' : 'frio')
        });

        corridor.push({
          time: item.time,
          upper: Number(gHigh.toFixed(2)),
          lower: Number(gLow.toFixed(2)),
          mid: Number(((gHigh + gLow) / 2).toFixed(2))
        });

        aggHistBull += item.bullWinRate;
        aggHistBear += item.bearWinRate;
        aggHistRange += Math.max(effectiveRange, gHigh - gLow);
        aggHistUp += Math.max(0, gHigh - gOpen);
        aggHistDown += Math.max(0, gOpen - gLow);
      }

      if (numGhost > 0) {
        const meanBull = Math.round(aggHistBull / numGhost);
        const meanBear = Math.round(aggHistBear / numGhost);
        const fDirection: 'COMPRA' | 'VENDA' | 'NEUTRO' = meanBull >= 54 ? 'COMPRA' : (meanBear >= 54 ? 'VENDA' : 'NEUTRO');
        const lastGhost = ghostCandles[ghostCandles.length - 1];

        forecastSummary = {
          direction: fDirection,
          bullProbability: meanBull,
          bearProbability: meanBear,
          expectedRangePts: Number((aggHistRange / numGhost).toFixed(1)),
          expectedUpPts: Number((aggHistUp / numGhost).toFixed(1)),
          expectedDownPts: Number((aggHistDown / numGhost).toFixed(1)),
          heatLevel: (lastBarRes?.zone || 'neutro') as any,
          timeStr: lastCandle.timeStr,
          futureTimeStr: lastGhost ? lastGhost.timeStr : lastCandle.timeStr,
          forecastCandlesCount: numGhost,
          mode: 'historico'
        };
      }
    }
  }

  const lastBar = barsResult.length > 0 ? barsResult[barsResult.length - 1] : null;
  const currentStatus = lastBar ? lastBar.zone : 'frio';
  const currentScore = lastBar ? lastBar.score : 0;

  return {
    bars: barsResult,
    forecastBars,
    ghostCandles,
    corridor,
    forecastSummary,
    windowLines,
    currentStatus,
    currentScore,
    hotThreshold,
    showGhostCandles,
    showForecastBadge,
    showExpansionCorridor,
    forecastCandlesCount
  };
}

// ============================================================================
// 🔥 AXION TREND (B4 ENGINE) - CÁLCULO COMPLETO PARA GRÁFICO E ALGORITMOS
// ============================================================================

export interface AxionTrendBar {
  time: number;
  // 1. Tendência dos Candles Coloridos (RSM: Verde / Vermelho / Cinza)
  candleTrend: 'compra' | 'venda' | 'neutro';
  candleColor: string;
  // 2. Sinais de Compra e Venda conforme as Setas (Strategy_BuySignal / Strategy_SellSignal)
  arrowSignal: 'compra' | 'venda' | 'neutro';
  strategyTrend: 'compra' | 'venda' | 'neutro';
  // 3. Tendência Conciliada (Candles Coloridos + Média Bolinhas com Filtro de Nível Zero)
  // Compra = Candle Verde E Média Bolinhas Verde (acima da Banda Superior) E > 0
  // Venda  = Candle Vermelho E Média Bolinhas Vermelha (abaixo da Banda Inferior) E < 0
  conciliatedTrend: 'compra' | 'venda' | 'neutro';
  conciliatedSignal: 'compra' | 'venda' | 'neutro';
  // 4. Média do Histograma de Bolinhas (MACDBB) e Bandas de Bollinger
  macdbbLine: number;
  macdbbUpper: number;
  macdbbLower: number;
  macdbbMidline: number;
  macdbbDotColor: string;
  macdbbState: 'compra' | 'venda' | 'neutro';
  macdbbZeroTrend: 'compra' | 'venda' | 'neutro';
  // 5. Histograma RSM MACD Diff (12, 26, 9) e componentes RSM
  rsmMacdDiff: number;
  rsmHistColor: string;
  rsmRsi: number;
  rsmStoch: number;
  // 6. Squeeze e Direção Estrutural Bull/Bear (FST + RSI IFT)
  squeeze: boolean;
  bullBearTrend: 'compra' | 'venda' | 'neutro';
  bullBearSignal: 'compra' | 'venda' | 'neutro';
  fstDirection: number;
  rsiIftDirection: number;
}

export interface AxionTrendResult {
  bars: AxionTrendBar[];
  candleColorMap: Record<number, string>;
  last: AxionTrendBar | null;
}

function calcNT8EMA(values: number[], period: number): number[] {
  const n = values.length;
  if (n === 0) return [];
  const p = Math.max(1, period);
  const k = 2.0 / (1.0 + p);
  const out = new Array<number>(n);
  out[0] = values[0] || 0;
  for (let i = 1; i < n; i++) {
    out[i] = values[i] * k + out[i - 1] * (1.0 - k);
  }
  return out;
}

function calcNT8SMA(values: number[], period: number): number[] {
  const n = values.length;
  if (n === 0) return [];
  const p = Math.max(1, period);
  const out = new Array<number>(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += values[i] || 0;
    if (i >= p) {
      sum -= values[i - p] || 0;
      out[i] = sum / p;
    } else {
      out[i] = sum / (i + 1);
    }
  }
  return out;
}

function calcNT8StdDev(values: number[], period: number): number[] {
  const n = values.length;
  if (n === 0) return [];
  const p = Math.max(1, period);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - p + 1);
    const count = i - start + 1;
    let sum = 0;
    for (let j = start; j <= i; j++) sum += values[j] || 0;
    const avg = sum / count;
    let sumSq = 0;
    for (let j = start; j <= i; j++) {
      const diff = (values[j] || 0) - avg;
      sumSq += diff * diff;
    }
    out[i] = Math.sqrt(sumSq / count);
  }
  return out;
}

function calcNT8RSI(closes: number[], period: number): number[] {
  const n = closes.length;
  if (n === 0) return [];
  const p = Math.max(1, period);
  const out = new Array<number>(n);
  out[0] = 50;
  if (n === 1) return out;

  let avgUp = 0;
  let avgDown = 0;

  for (let i = 1; i < n; i++) {
    const diff = closes[i] - closes[i - 1];
    const up = diff > 0 ? diff : 0;
    const down = diff < 0 ? -diff : 0;

    if (i <= p) {
      avgUp = ((avgUp * (i - 1)) + up) / i;
      avgDown = ((avgDown * (i - 1)) + down) / i;
    } else {
      avgUp = (avgUp * (p - 1) + up) / p;
      avgDown = (avgDown * (p - 1) + down) / p;
    }

    if (avgDown === 0) {
      out[i] = avgUp === 0 ? 50 : 100;
    } else {
      const rs = avgUp / avgDown;
      out[i] = 100.0 - (100.0 / (1.0 + rs));
    }
  }
  return out;
}

export function calculateAxionTrend(
  candles: any[],
  params: Record<string, any> = {}
): AxionTrendResult {
  if (!candles || candles.length === 0) {
    return { bars: [], candleColorMap: {}, last: null };
  }

  const macdFastLength = Math.max(1, Number(params.macdFastLength ?? params.MACDBBfastLength ?? 12));
  const macdSlowLength = Math.max(2, Number(params.macdSlowLength ?? params.MACDBBslowLength ?? 26));
  const macdBandLength = Math.max(2, Number(params.macdBandLength ?? params.MACDBBbandLength ?? 15));
  const macdNumOfDev = Number(params.macdNumOfDev ?? params.MACDBBnumOfDev ?? 1.0);
  const squeezeLength = Math.max(2, Number(params.squeezeLength ?? params.SqueezeLength ?? 30));
  const fstLength = Math.max(1, Number(params.fstLength ?? params.FibSuperTrendLength ?? 11));
  const fstUseHighLow = params.fstUseHighLow !== undefined ? Boolean(params.fstUseHighLow) : (params.FibSuperTrendUseHighLow !== false);
  const includeFST = params.includeFST !== undefined ? Boolean(params.includeFST) : (params.BullBear_Include_FST !== false);
  const includeRSIIFT = params.includeRSIIFT !== undefined ? Boolean(params.includeRSIIFT) : (params.BullBear_Include_RSI_IFT !== false);

  const n = candles.length;
  const times = new Array<number>(n);
  const opens = new Array<number>(n);
  const highs = new Array<number>(n);
  const lows = new Array<number>(n);
  const closes = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const c = candles[i] || {};
    const rawT = c.time !== undefined ? c.time : c.timestamp;
    let tSec = 0;
    if (typeof rawT === 'number' && !isNaN(rawT)) {
      tSec = rawT > 1e11 ? Math.floor(rawT / 1000) : Math.floor(rawT);
    } else if (rawT) {
      tSec = getChartTimeFromDate(rawT);
    }
    times[i] = tSec;
    const cl = Number(c.close ?? 0);
    closes[i] = cl;
    opens[i] = Number(c.open ?? cl);
    highs[i] = Number(c.high ?? cl);
    lows[i] = Number(c.low ?? cl);
  }

  // 1. MACDBB (Linha de Bolinhas + Bandas de Bollinger sobre o MACD)
  const emaFast = calcNT8EMA(closes, macdFastLength);
  const emaSlow = calcNT8EMA(closes, macdSlowLength);
  const macdbbData = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    macdbbData[i] = emaFast[i] - emaSlow[i];
  }
  const macdbbMidline = calcNT8SMA(macdbbData, macdBandLength);
  const macdbbStd = calcNT8StdDev(macdbbData, macdBandLength);
  const macdbbUpper = new Array<number>(n);
  const macdbbLower = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    macdbbUpper[i] = macdbbMidline[i] + macdNumOfDev * macdbbStd[i];
    macdbbLower[i] = macdbbMidline[i] - macdNumOfDev * macdbbStd[i];
  }

  // 2. RSM (Coloração dos Candles Verdes/Vermelhos + Histograma MACD(12, 26, 9).Diff)
  const rsmEma12 = macdFastLength === 12 ? emaFast : calcNT8EMA(closes, 12);
  const rsmEma26 = macdSlowLength === 26 ? emaSlow : calcNT8EMA(closes, 26);
  const rsmMacdLine = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    rsmMacdLine[i] = rsmEma12[i] - rsmEma26[i];
  }
  const rsmMacdSignal = calcNT8EMA(rsmMacdLine, 9);
  const rsmMacdDiff = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    rsmMacdDiff[i] = rsmMacdLine[i] - rsmMacdSignal[i];
  }

  const rsmRsi = calcNT8RSI(closes, 7);
  const rsmStochVal = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const start14 = Math.max(0, i - 13);
    let minL = Infinity;
    let maxH = -Infinity;
    for (let j = start14; j <= i; j++) {
      if (lows[j] < minL) minL = lows[j];
      if (highs[j] > maxH) maxH = highs[j];
    }
    const denom = maxH - minL;
    rsmStochVal[i] = denom > 1e-9 ? (100.0 * (closes[i] - minL) / denom) : 50.0;
  }
  const rsmStochFastD = calcNT8SMA(rsmStochVal, 3);
  const rsmStochSlowK = calcNT8SMA(rsmStochFastD, 3);

  // 3. Squeeze (Bollinger vs Keltner / ATR)
  const trArr = new Array<number>(n);
  trArr[0] = Math.max(0, highs[0] - lows[0]);
  for (let i = 1; i < n; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    trArr[i] = Math.max(hl, hc, lc);
  }
  // Wilder's ATR / SMA ATR over squeezeLength
  const atrSqz = calcNT8SMA(trArr, squeezeLength);
  const stdSqz = calcNT8StdDev(closes, squeezeLength);
  const sqzSqueeze = new Array<boolean>(n);
  for (let i = 0; i < n; i++) {
    const denom = 1.5 * atrSqz[i];
    const bbsInd = denom > 1e-9 ? (2.0 * stdSqz[i]) / denom : 1.0;
    sqzSqueeze[i] = bbsInd < 1.0;
  }

  // 4. RSI IFT (Inverse Fisher Transform RSI)
  const rsi5 = calcNT8RSI(closes, 5);
  const rsiIftR = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    rsiIftR[i] = rsi5[i] - 50.0;
  }
  const rsiIftAvg = calcNT8EMA(rsiIftR, 9);
  const rsiIftInv = new Array<number>(n);
  const rsiIftDir = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    // Math.tanh(x) == (exp(2x) - 1) / (exp(2x) + 1)
    rsiIftInv[i] = Math.tanh(rsiIftAvg[i]);
    if (i === 0) {
      rsiIftDir[i] = 0;
    } else if (rsiIftInv[i - 1] > 0 && rsiIftInv[i] < 0) {
      rsiIftDir[i] = -1;
    } else if (rsiIftInv[i] > 0 && rsiIftInv[i - 1] < 0) {
      rsiIftDir[i] = 1;
    } else {
      rsiIftDir[i] = rsiIftDir[i - 1];
    }
  }

  // 5. Fib SuperTrend (FST)
  const fstH = fstUseHighLow ? highs : closes;
  const fstL = fstUseHighLow ? lows : closes;
  const fstMaxH = new Array<number>(n);
  const fstMinL = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const startFst = Math.max(0, i - fstLength + 1);
    let minV = Infinity;
    let maxV = -Infinity;
    for (let j = startFst; j <= i; j++) {
      if (fstL[j] < minV) minV = fstL[j];
      if (fstH[j] > maxV) maxV = fstH[j];
    }
    fstMinL[i] = minV;
    fstMaxH[i] = maxV;
  }

  const fstTrend = new Array<number>(n);
  const fstDir = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      fstTrend[i] = 0;
      fstDir[i] = 0;
    } else {
      fstTrend[i] = fstH[i] > fstMaxH[i - 1] ? 1 : (fstL[i] < fstMinL[i - 1] ? -1 : fstTrend[i - 1]);
      fstDir[i] = fstTrend[i] !== 1 ? -1 : (fstTrend[i] === 1 ? 1 : fstDir[i - 1]);
    }
  }

  // 6. Consolidação por Barra (BullBear, Setas, Candles e Tendência Conciliada)
  const bars: AxionTrendBar[] = new Array<AxionTrendBar>(n);
  const candleColorMap: Record<number, string> = {};

  let prevBullBearBuy = false;
  let prevBullBearSell = false;
  let prevStrategyBuy = false;
  let prevStrategySell = false;
  let prevConciliated: 'compra' | 'venda' | 'neutro' = 'neutro';

  for (let i = 0; i < n; i++) {
    const mData = macdbbData[i];
    const prevMData = i > 0 ? macdbbData[i - 1] : mData;
    const mUpper = macdbbUpper[i];
    const mLower = macdbbLower[i];
    const mMid = macdbbMidline[i];

    // MACDBB Buy/Sell e Cor das Bolinhas
    const macdbbBuy = mData > mUpper;
    const macdbbSell = mData <= mLower;

    let macdbbState: 'compra' | 'venda' | 'neutro' = 'neutro';
    let macdbbDotColor = sqzSqueeze[i] ? '#ea580c' : '#94a3b8'; // Chocolate em Squeeze, Gray normal
    if (mData >= mUpper) {
      macdbbState = 'compra';
      macdbbDotColor = mData >= prevMData ? '#22c55e' : '#15803d'; // Lime subindo, ForestGreen caindo
    } else if (mData <= mLower) {
      macdbbState = 'venda';
      macdbbDotColor = mData <= prevMData ? '#ef4444' : '#991b1b'; // Red caindo, Maroon subindo
    }

    // Média do Histograma (Bolinhas) com Filtro de Nível Zero
    let macdbbZeroTrend: 'compra' | 'venda' | 'neutro' = 'neutro';
    if (macdbbState === 'compra' && mData > 0) {
      macdbbZeroTrend = 'compra';
    } else if (macdbbState === 'venda' && mData < 0) {
      macdbbZeroTrend = 'venda';
    }

    // RSM Buy/Sell (Candles Verdes e Vermelhos)
    const rDiff = rsmMacdDiff[i];
    const prevRDiff = i > 0 ? rsmMacdDiff[i - 1] : rDiff;
    const rsmBuy = (rsmRsi[i] >= 50.0) && (rsmStochSlowK[i] >= 50.0) && (rDiff >= 0.0);
    const rsmSell = (rsmRsi[i] < 50.0) && (rsmStochSlowK[i] < 50.0) && (rDiff < 0.0);

    const candleTrend: 'compra' | 'venda' | 'neutro' = rsmBuy ? 'compra' : (rsmSell ? 'venda' : 'neutro');
    const candleColor = rsmBuy ? '#22c55e' : (rsmSell ? '#ef4444' : '#64748b');
    if (times[i] > 0) {
      candleColorMap[times[i]] = candleColor;
    }

    // Cor do Histograma RSM MACD Diff
    let rsmHistColor = '#64748b';
    if (rDiff > 0 && rDiff >= prevRDiff) rsmHistColor = '#22c55e';
    else if (rDiff > 0 && rDiff < prevRDiff) rsmHistColor = '#15803d';
    else if (rDiff < 0 && rDiff <= prevRDiff) rsmHistColor = '#ef4444';
    else if (rDiff < 0 && rDiff > prevRDiff) rsmHistColor = '#991b1b';

    // BullBear Direction
    const bullBearBuy = (!includeFST || fstDir[i] === 1) && (!includeRSIIFT || rsiIftDir[i] === 1);
    const bullBearSell = (!includeFST || fstDir[i] === -1) && (!includeRSIIFT || rsiIftDir[i] === -1);
    const bullBearTrend: 'compra' | 'venda' | 'neutro' = bullBearBuy ? 'compra' : (bullBearSell ? 'venda' : 'neutro');

    const bullBearBuyChange = i > 0 && bullBearBuy && !prevBullBearBuy;
    const bullBearSellChange = i > 0 && bullBearSell && !prevBullBearSell;
    const bullBearSignal: 'compra' | 'venda' | 'neutro' = bullBearBuyChange ? 'compra' : (bullBearSellChange ? 'venda' : 'neutro');

    // Strategy Signals (Setas do Indicador)
    const strategyBuy = bullBearBuy && macdbbBuy && rsmBuy;
    const strategySell = bullBearSell && macdbbSell && rsmSell;
    const strategyTrend: 'compra' | 'venda' | 'neutro' = strategyBuy ? 'compra' : (strategySell ? 'venda' : 'neutro');

    const strategyBuySignal = i > 0 && strategyBuy && !prevStrategyBuy;
    const strategySellSignal = i > 0 && strategySell && !prevStrategySell;
    const arrowSignal: 'compra' | 'venda' | 'neutro' = strategyBuySignal ? 'compra' : (strategySellSignal ? 'venda' : 'neutro');

    // Conciliação: Candles Coloridos (Verde/Vermelho) + Média de Bolinhas (Verde > 0 / Vermelha < 0)
    let conciliatedTrend: 'compra' | 'venda' | 'neutro' = 'neutro';
    if (candleTrend === 'compra' && macdbbZeroTrend === 'compra') {
      conciliatedTrend = 'compra';
    } else if (candleTrend === 'venda' && macdbbZeroTrend === 'venda') {
      conciliatedTrend = 'venda';
    }

    let conciliatedSignal: 'compra' | 'venda' | 'neutro' = 'neutro';
    if (conciliatedTrend === 'compra' && prevConciliated !== 'compra') {
      conciliatedSignal = 'compra';
    } else if (conciliatedTrend === 'venda' && prevConciliated !== 'venda') {
      conciliatedSignal = 'venda';
    }

    prevBullBearBuy = bullBearBuy;
    prevBullBearSell = bullBearSell;
    prevStrategyBuy = strategyBuy;
    prevStrategySell = strategySell;
    prevConciliated = conciliatedTrend;

    bars[i] = {
      time: times[i],
      candleTrend,
      candleColor,
      arrowSignal,
      strategyTrend,
      conciliatedTrend,
      conciliatedSignal,
      macdbbLine: Number(mData.toFixed(4)),
      macdbbUpper: Number(mUpper.toFixed(4)),
      macdbbLower: Number(mLower.toFixed(4)),
      macdbbMidline: Number(mMid.toFixed(4)),
      macdbbDotColor,
      macdbbState,
      macdbbZeroTrend,
      rsmMacdDiff: Number(rDiff.toFixed(4)),
      rsmHistColor,
      rsmRsi: Number(rsmRsi[i].toFixed(2)),
      rsmStoch: Number(rsmStochSlowK[i].toFixed(2)),
      squeeze: sqzSqueeze[i],
      bullBearTrend,
      bullBearSignal,
      fstDirection: fstDir[i],
      rsiIftDirection: rsiIftDir[i]
    };
  }

  return {
    bars,
    candleColorMap,
    last: bars.length > 0 ? bars[bars.length - 1] : null
  };
}


