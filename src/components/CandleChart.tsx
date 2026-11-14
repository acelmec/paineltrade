import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createChart, LineSeries, CandlestickSeries, HistogramSeries, createSeriesMarkers } from 'lightweight-charts';
import type { IChartApi } from 'lightweight-charts';
import type { Candle, GammaLevels } from '../services/db';
import {
  resolvePanelTickSize,
  roundToTick,
  getTickDecimals,
  isSameAsset,
  fetchForces1mHistorySupabase,
  processMomentumMatrixSeries,
  type MomentumMatrixProcessedSeries
} from '../services/db';
import { useApp, calculateFVGs } from '../context/AppContext';
import { getAccountManualStrategyId, saveAccountStrategySupabase, updateStrategyReportLevelsSupabase } from '../services/db';
import { getChartTimeFromDate, parseInputToDate, getTradingSessionKey, isCandleInSessionPause, getSaoPauloDate, formatSaoPauloDayMonth, formatSaoPauloTime } from '../utils/date';
import {
  calculateIndicator,
  calculateMACD,
  calculateMACDDivergences,
  calculateTimeHeatmap,
  calculateAxionTrend,
  sanitizeLineSeriesData,
  sanitizeCandleSeriesData,
  type MacdDivergence,
  type IndicatorConfig
} from '../utils/indicatorRegistry';
import type { DrawingItem, DrawingToolType } from '../types/chartDrawings';
import { evaluateDrawingTrigger } from '../utils/drawingEngine';
import { calculateTradeManagement, calculateRangeHlLevels, resolveLevelPrice } from '../utils/levelPriceResolver';
import { ChartDrawingsOverlay } from './ChartDrawingsOverlay';
import { playPatternSound } from '../utils/soundEffects';
import { recordChartError } from '../utils/chartErrorLogger';
import { scanHistoricalIndicatorSignals, type HistoricalIndicatorSignal } from '../utils/replayEngine';
import { getStreamerBlockTrades, fetchStreamerBlockTrades } from '../services/vortexStreamer';
import {
  fetchMarketMatrixData,
  subscribeMarketMatrix,
  convertQqqToNq,
  type MarketMatrixData
} from '../services/marketMatrixService';
import { useIsMobile } from '../utils/platform';

// Formatadores memoizados de alta performance para o fuso de Brasília (America/Sao_Paulo) no eixo do gráfico
const spChartTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

const spChartDayMonthFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit'
});

const spChartMonthFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  month: 'short'
});

const spChartYearFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric'
});

const spChartFullFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: 'short',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

function safeChartTimeToDate(time: any): Date | null {
  if (time === null || time === undefined) return null;
  try {
    if (typeof time === 'number') {
      if (isNaN(time) || time <= 0) return null;
      return new Date(time < 1e11 ? time * 1000 : time);
    }
    if (typeof time === 'object' && 'year' in time && 'month' in time && 'day' in time) {
      return new Date(Date.UTC(time.year, time.month - 1, time.day));
    }
    if (typeof time === 'string') {
      return parseInputToDate(time);
    }
  } catch {
    return null;
  }
  return null;
}

interface CandleChartProps {
  candles: Candle[];
  isLoading?: boolean;
  loadingProgress?: {
    isLoading: boolean;
    percent: number;
    loaded: number;
    total: number;
    days: number;
    isExplicitDaysChange?: boolean;
  };
  instanceId?: string;
  onDoubleClick?: () => void;
  height?: string | number;
  isZoomed?: boolean;
  timeframe?: number;
  setTimeframe?: (tf: number) => void;
  onClose?: () => void;
  simulatedReports?: any[];
  activePosition?: any;
  simulatedPrice?: number;
  gammaLevels?: GammaLevels | null;
  isSimulator?: boolean;
  newsList?: any[];
  activeIndicators?: IndicatorConfig[];
  fitChartTrigger?: number;
  hideManualTradeBar?: boolean;
  showRobots?: boolean;
  setShowRobots?: (show: boolean) => void;
  showTradeMarkers?: boolean;
  setShowTradeMarkers?: (show: boolean) => void;
  showOrderLines?: boolean;
  showIndicatorsLegend?: boolean;
  setShowIndicatorsLegend?: (show: boolean) => void;
  autoCenter?: boolean;
  setAutoCenter?: (center: boolean) => void;
  resetViewTrigger?: number;
  forceCandleView?: boolean;
  drawings?: DrawingItem[];
  onUpdateDrawing?: (updated: DrawingItem) => void;
  onFinishDrawing?: (newDrawing: DrawingItem) => void;
  activeDrawingTool?: DrawingToolType | null;
  selectedDrawingId?: string | null;
  onSelectDrawing?: (drawing: DrawingItem | null) => void;
  onOpenDrawingSettings?: (drawing: DrawingItem) => void;
  onDeleteDrawing?: (id: string) => void;
  onUpdateReportLevels?: (reportId: string, newSl: number | null, newTp: number | null) => void;
  customSignals?: any[];
  onOpenIndicatorsManager?: () => void;
  activeWidgets?: any[];
  panel?: any;
  marketData?: any;
  isFocused?: boolean;
}

const LEVEL_CONFIGS: Record<string, { label: string; color: string }> = {
  hvl: { label: 'HVL', color: '#a855f7' },
  call: { label: 'Call', color: '#ef4444' },
  put: { label: 'Put', color: '#22c55e' },
  max1d: { label: 'Max', color: '#06b6d4' },
  min1d: { label: 'Min', color: '#eab308' },
  prev: { label: 'Ajuste', color: '#f97316' },
  prevH: { label: 'MxAnt', color: '#f87171' },
  prevL: { label: 'MnAnt', color: '#4ade80' },
  hvl0: { label: 'HVL0', color: '#c084fc' },
  call0: { label: 'Call0', color: '#fca5a5' },
  put0: { label: 'Put0', color: '#86efac' },
  gwall: { label: 'GWall', color: '#fbbf24' },
};

// Aggregate 1-minute candles into custom timeframes
function aggregateCandles(candles: Candle[], timeframeMinutes: number): Candle[] {
  if (timeframeMinutes <= 1 || candles.length === 0) return candles;

  const buckets: { [key: number]: Candle[] } = {};

  candles.forEach(c => {
    if (!c || !c.timestamp) return;
    const o = Number(c.open);
    const h = Number(c.high);
    const l = Number(c.low);
    const cl = Number(c.close);
    if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(cl) || o <= 0 || h <= 0 || l <= 0 || cl <= 0) return;

    const timeMs = new Date(c.timestamp).getTime();
    if (isNaN(timeMs)) return;
    const bucketTime = Math.floor(timeMs / (timeframeMinutes * 60 * 1000)) * (timeframeMinutes * 60 * 1000);
    if (!buckets[bucketTime]) {
      buckets[bucketTime] = [];
    }
    buckets[bucketTime].push({
      ...c,
      open: o,
      high: Math.max(o, h, cl),
      low: Math.min(o, l, cl),
      close: cl
    });
  });

  const sortedKeys = Object.keys(buckets).map(Number).sort((a, b) => a - b);

  return sortedKeys.map(bucketTime => {
    const group = buckets[bucketTime];
    group.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const open = group[0].open;
    const close = group[group.length - 1].close;
    const high = Math.max(...group.map(g => g.high));
    const low = Math.min(...group.map(g => g.low));
    const volume = group.reduce((acc, g) => acc + (g.volume || 0), 0);

    return {
      timestamp: new Date(bucketTime).toISOString(),
      open,
      high,
      low,
      close,
      volume
    };
  });
}

// Indicator Helpers
function calculateSMA(data: { time: number; close: number }[], period: number) {
  const sma = [];
  if (!data || data.length === 0) return [];
  for (let i = 0; i < data.length; i++) {
    const windowSize = Math.min(i + 1, period);
    let sum = 0;
    let valid = true;
    for (let j = 0; j < windowSize; j++) {
      const c = data[i - j]?.close;
      if (typeof c !== 'number' || isNaN(c) || !isFinite(c)) {
        valid = false;
        break;
      }
      sum += c;
    }
    const t = data[i]?.time;
    if (valid && typeof t === 'number' && !isNaN(t) && t > 0) {
      const val = sum / windowSize;
      if (!isNaN(val) && isFinite(val)) {
        sma.push({ time: t, value: val });
      }
    }
  }
  return sanitizeLineSeriesData(sma);
}

function calculateEMA(data: { time: number; close: number }[], period: number) {
  const ema = [];
  if (!data || data.length === 0) return [];
  const k = 2 / (period + 1);
  const firstClose = data[0]?.close;
  const firstTime = data[0]?.time;
  if (typeof firstClose !== 'number' || isNaN(firstClose) || !isFinite(firstClose) || typeof firstTime !== 'number' || isNaN(firstTime) || firstTime <= 0) return [];
  let emaVal = firstClose;
  
  ema.push({ time: firstTime, value: emaVal });
  
  for (let i = 1; i < data.length; i++) {
    const c = data[i]?.close;
    const t = data[i]?.time;
    if (typeof c === 'number' && !isNaN(c) && isFinite(c) && typeof t === 'number' && !isNaN(t) && t > 0) {
      emaVal = c * k + emaVal * (1 - k);
      if (!isNaN(emaVal) && isFinite(emaVal)) {
        ema.push({ time: t, value: emaVal });
      }
    }
  }
  return sanitizeLineSeriesData(ema);
}

function calculateRSI(data: { time: number; close: number }[], period: number = 14) {
  if (!data || data.length === 0) return [];
  const rsi: { time: number; value: number }[] = [];
  
  const firstTime = data[0]?.time;
  if (typeof firstTime === 'number' && !isNaN(firstTime) && firstTime > 0) {
    rsi.push({ time: firstTime, value: 50 });
  }
  if (data.length === 1) return sanitizeLineSeriesData(rsi);

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i < Math.min(period, data.length); i++) {
    const curC = data[i]?.close;
    const prevC = data[i - 1]?.close;
    const t = data[i]?.time;
    if (typeof curC !== 'number' || isNaN(curC) || !isFinite(curC) || typeof prevC !== 'number' || isNaN(prevC) || !isFinite(prevC) || typeof t !== 'number' || isNaN(t) || t <= 0) {
      continue;
    }
    const diff = curC - prevC;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    
    avgGain = (avgGain * (i - 1) + gain) / i;
    avgLoss = (avgLoss * (i - 1) + loss) / i;
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsiVal = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - (100 / (1 + rs));
    if (!isNaN(rsiVal) && isFinite(rsiVal)) {
      rsi.push({ time: t, value: Math.max(0, Math.min(100, rsiVal)) });
    }
  }

  for (let i = period; i < data.length; i++) {
    const curC = data[i]?.close;
    const prevC = data[i - 1]?.close;
    const t = data[i]?.time;
    if (typeof curC !== 'number' || isNaN(curC) || !isFinite(curC) || typeof prevC !== 'number' || isNaN(prevC) || !isFinite(prevC) || typeof t !== 'number' || isNaN(t) || t <= 0) {
      continue;
    }
    const diff = curC - prevC;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsiVal = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - (100 / (1 + rs));
    if (!isNaN(rsiVal) && isFinite(rsiVal)) {
      rsi.push({ time: t, value: Math.max(0, Math.min(100, rsiVal)) });
    }
  }
  return sanitizeLineSeriesData(rsi);
}

export { calculateMACD, calculateMACDDivergences, type MacdDivergence };

function calculateEMACD(
  data: { time: number; close: number; open: number; high: number; low: number; volume: number }[]
) {
  if (data.length < 30) return { histogram: [], explosion: [], deadZone: [] };

  const sensitivity = 150;
  const channelLength = 20;
  const mult = 2.0;

  // 1. Calculate Standard MACD Line = EMA(12) - EMA(26)
  const ema12 = calculateEMA(data, 12);
  const ema26 = calculateEMA(data, 26);
  const ema26Map = new Map(ema26.map(e => [e.time, e.value]));
  
  const macdValues: { time: number; value: number }[] = [];
  for (const e12 of ema12) {
    const e26Val = ema26Map.get(e12.time);
    if (e26Val !== undefined) {
      macdValues.push({
        time: e12.time,
        value: e12.value - e26Val
      });
    }
  }

  const macdMap = new Map(macdValues.map(m => [m.time, m.value]));

  // 2. Calculate Bollinger Band Width (Explosion Line) = 4.0 * StdDev(close, 20)
  const explosionLine: { time: number; value: number }[] = [];
  let firstValidExplosionVal = 0;
  if (data.length >= channelLength) {
    const slice = data.slice(0, channelLength);
    const mean = slice.reduce((sum, item) => sum + item.close, 0) / channelLength;
    const variance = slice.reduce((sum, item) => sum + Math.pow(item.close - mean, 2), 0) / channelLength;
    firstValidExplosionVal = 2 * mult * Math.sqrt(variance);
  }

  for (let i = 0; i < data.length; i++) {
    if (i < channelLength - 1) {
      explosionLine.push({
        time: data[i].time,
        value: firstValidExplosionVal
      });
    } else {
      const slice = data.slice(i - channelLength + 1, i + 1);
      const mean = slice.reduce((sum, item) => sum + item.close, 0) / channelLength;
      const variance = slice.reduce((sum, item) => sum + Math.pow(item.close - mean, 2), 0) / channelLength;
      const stdDev = Math.sqrt(variance);
      explosionLine.push({
        time: data[i].time,
        value: 2 * mult * stdDev
      });
    }
  }

  // 3. Loop through candles and construct WAE trend bars
  const histogram: { time: number; value: number; color: string }[] = [];
  const deadZone: { time: number; value: number }[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < 11) {
      histogram.push({
        time: data[i].time,
        value: 0,
        color: '#38bdf8'
      });
      deadZone.push({
        time: data[i].time,
        value: 20
      });
      continue;
    }

    const item = data[i];
    const prevItem = data[i - 1];

    const currentMacd = macdMap.get(item.time) || 0;
    const prevMacd = macdMap.get(prevItem.time) || 0;

    const t1 = (currentMacd - prevMacd) * sensitivity;

    const trendUp = t1 >= 0 ? t1 : 0;
    const trendDown = t1 < 0 ? -t1 : 0;

    // PVA Climax check
    const prev10 = data.slice(i - 10, i);
    const sumVol = prev10.reduce((acc, c) => acc + (c.volume || 0), 0);
    const avgVol = sumVol / 10;

    let highestVolumeRange = 0;
    for (const c of prev10) {
      const vol = c.volume || 0;
      const h = c.high;
      const l = c.low;
      const range = vol * (h - l);
      if (range > highestVolumeRange) {
        highestVolumeRange = range;
      }
    }

    const currentVol = item.volume || 0;
    const currentHigh = item.high;
    const currentLow = item.low;
    const currentVolumeRange = currentVol * (currentHigh - currentLow);

    const isClimax = (currentVolumeRange >= highestVolumeRange) || (currentVol >= avgVol * 2.0);
    const isBullish = item.close > item.open;

    const prevMacd2 = macdMap.get(data[i - 2]?.time || 0) || 0;
    const prevT1 = (prevMacd - prevMacd2) * sensitivity;
    const prevTrendUp = prevT1 >= 0 ? prevT1 : 0;
    const prevTrendDown = prevT1 < 0 ? -prevT1 : 0;

    let color = '#38bdf8';
    let val = 0;

    if (t1 >= 0) {
      val = t1;
      if (isClimax) {
        color = isBullish ? '#22c55e' : '#d946ef';
      } else {
        color = trendUp < prevTrendUp ? '#cbd5e1' : '#38bdf8';
      }
    } else {
      val = -t1;
      if (isClimax) {
        color = isBullish ? '#22c55e' : '#d946ef';
      } else {
        color = trendDown < prevTrendDown ? '#f87171' : '#ef4444';
      }
    }

    histogram.push({
      time: item.time,
      value: val,
      color
    });

    deadZone.push({
      time: item.time,
      value: 20
    });
  }

  return {
    histogram: sanitizeLineSeriesData(histogram),
    explosion: sanitizeLineSeriesData(explosionLine),
    deadZone: sanitizeLineSeriesData(deadZone)
  };
}

const BLACK_CROSSHAIR_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M12 2v20M2 12h20' stroke='%23ffffff' stroke-width='3' stroke-linecap='square'/%3E%3Cpath d='M12 2v20M2 12h20' stroke='%23000000' stroke-width='1.5' stroke-linecap='square'/%3E%3C/svg%3E") 12 12, crosshair`;

export const isLightChartBackground = (bg?: string): boolean => {
  if (!bg) return false;
  const hex = bg.trim().toLowerCase();
  if (hex === '#fff' || hex === '#ffffff' || hex === 'white') return true;
  const clean = hex.replace('#', '');
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return (0.299 * r + 0.587 * g + 0.114 * b) > 160;
    }
  }
  return false;
};

export const getChartThemeColors = (themeName?: string, customOverrides?: any) => {
  let baseColors = {
    bg: '#000000',
    textColor: '#cbd5e1',
    gridColor: '#15224480',
    borderColor: '#1e325c',
    crosshairColor: '#60a5fa',
    upColor: '#10b981',
    downColor: '#ef4444',
    wickUpColor: '#10b981',
    wickDownColor: '#ef4444',
    borderVisible: false
  };

  switch (themeName) {
    case 'black':
    case 'ninja_black':
      baseColors = {
        bg: '#000000',
        textColor: '#f4f4f5',
        gridColor: '#18181b80',
        borderColor: '#27272a',
        crosshairColor: '#a1a1aa',
        upColor: '#22c55e',
        downColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
        borderVisible: false
      };
      break;
    case 'slate':
    case 'cinza_escuro':
    case 'ninja_slate':
      baseColors = {
        bg: '#000000',
        textColor: '#e2e8f0',
        gridColor: '#22283880',
        borderColor: '#333c4f',
        crosshairColor: '#94a3b8',
        upColor: '#10b981',
        downColor: '#f43f5e',
        wickUpColor: '#10b981',
        wickDownColor: '#f43f5e',
        borderVisible: false
      };
      break;
    case 'light':
    case 'cinza_grafite':
    case 'ninja_light':
      baseColors = {
        bg: '#ffffff',
        textColor: '#334155',
        gridColor: '#e2e8f0',
        borderColor: '#cbd5e1',
        crosshairColor: '#0f172a',
        upColor: '#16a34a',
        downColor: '#dc2626',
        wickUpColor: '#16a34a',
        wickDownColor: '#dc2626',
        borderVisible: true
      };
      break;
    case 'midnight':
    case 'azul_noturno':
    case 'ninja_carbon':
    case 'ninja_midnight':
    default:
      baseColors = {
        bg: '#000000',
        textColor: '#cbd5e1',
        gridColor: '#15224480',
        borderColor: '#1e325c',
        crosshairColor: '#60a5fa',
        upColor: '#10b981',
        downColor: '#ef4444',
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
        borderVisible: false
      };
      break;
  }

  // Overrides personalizados vindos de settings ou localStorage
  const upColor = customOverrides?.chart_candle_up_color ||
                  customOverrides?.candleUpColor ||
                  (typeof localStorage !== 'undefined' ? localStorage.getItem('vortex_chart_candle_up_color') : null) ||
                  baseColors.upColor;

  const downColor = customOverrides?.chart_candle_down_color ||
                    customOverrides?.candleDownColor ||
                    (typeof localStorage !== 'undefined' ? localStorage.getItem('vortex_chart_candle_down_color') : null) ||
                    baseColors.downColor;

  const gridEnabled = customOverrides?.chart_grid_enabled !== undefined
    ? customOverrides.chart_grid_enabled !== false
    : (customOverrides?.gridEnabled !== undefined
        ? customOverrides.gridEnabled !== false
        : (typeof localStorage !== 'undefined' && localStorage.getItem('vortex_chart_grid_enabled') !== null
            ? localStorage.getItem('vortex_chart_grid_enabled') !== 'false'
            : true));

  const customGridColor = customOverrides?.chart_grid_color ||
                          customOverrides?.gridColor ||
                          (typeof localStorage !== 'undefined' ? localStorage.getItem('vortex_chart_grid_color') : null);

  const gridColor = !gridEnabled
    ? 'rgba(0,0,0,0)'
    : (customGridColor || baseColors.gridColor);

  const borderVisible = customOverrides?.chart_candle_border_visible !== undefined
    ? customOverrides.chart_candle_border_visible !== false
    : (customOverrides?.candleBorderVisible !== undefined
        ? customOverrides.candleBorderVisible !== false
        : (typeof localStorage !== 'undefined' && localStorage.getItem('vortex_chart_candle_border_visible') !== null
            ? localStorage.getItem('vortex_chart_candle_border_visible') !== 'false'
            : baseColors.borderVisible));

  return {
    ...baseColors,
    upColor,
    downColor,
    wickUpColor: upColor,
    wickDownColor: downColor,
    gridColor,
    gridEnabled,
    borderVisible
  };
};

interface ChartErrorBoundaryProps {
  children: React.ReactNode;
  instanceId?: string;
}

interface ChartErrorBoundaryState {
  hasError: boolean;
  recoveryKey: number;
}

export class ChartErrorBoundary extends React.Component<ChartErrorBoundaryProps, ChartErrorBoundaryState> {
  public static displayName = 'ChartErrorBoundary';
  private retryTimer: any = null;
  private lastErrorTime: number = 0;
  private recentErrorCount: number = 0;

  public state: ChartErrorBoundaryState = {
    hasError: false,
    recoveryKey: 0
  };

  public static getDerivedStateFromError(): Partial<ChartErrorBoundaryState> {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const now = Date.now();
    if (now - this.lastErrorTime < 5000) {
      this.recentErrorCount++;
    } else {
      this.recentErrorCount = 1;
    }
    this.lastErrorTime = now;

    recordChartError({
      type: 'lightweight-charts',
      message: error?.message || String(error || 'Erro no componente do gráfico'),
      stack: error?.stack || '',
      componentStack: errorInfo?.componentStack || '',
      panelId: this.props.instanceId || 'painel_chart'
    });
    console.warn('[ChartErrorBoundary] Exceção do motor gráfico isolada localmente:', error?.message || error);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.recentErrorCount <= 2) {
      this.retryTimer = setTimeout(() => {
        this.setState(prev => ({
          hasError: false,
          recoveryKey: prev.recoveryKey + 1
        }));
      }, 400);
    } else {
      this.forceUpdate();
    }
  }

  public componentWillUnmount() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
  }

  public render() {
    if (this.state.hasError) {
      if (this.recentErrorCount > 2) {
        return (
          <div className="w-full h-full min-h-[200px] bg-[#0b0e14] flex flex-col items-center justify-center text-slate-400 text-xs font-mono select-none space-y-3 p-4">
            <span className="text-amber-400 font-semibold text-sm">Instabilidade gráfica transitória detectada</span>
            <span className="text-[11px] text-slate-500 max-w-sm text-center">Os dados do ativo continuam sendo processados em segundo plano.</span>
            <button
              onClick={() => {
                this.recentErrorCount = 0;
                this.setState(prev => ({ hasError: false, recoveryKey: prev.recoveryKey + 1 }));
              }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition-colors"
            >
              Restaurar Gráfico
            </button>
          </div>
        );
      }
      return (
        <div className="w-full h-full min-h-[200px] bg-[#000000] flex items-center justify-center text-slate-500 text-xs font-mono select-none">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>Sincronizando gráfico...</span>
          </div>
        </div>
      );
    }
    return <React.Fragment key={`${this.props.instanceId || 'chart'}_${this.state.recoveryKey}`}>{this.props.children}</React.Fragment>;
  }
}

const MobilePriceReferenceLine: React.FC<{
  candleSeriesRef: React.RefObject<any>;
  currentPrice: number;
  isLastCandleUp: boolean;
  onRestorePriceScale: () => void;
}> = ({ candleSeriesRef, currentPrice, isLastCandleUp, onRestorePriceScale }) => {
  const [topCoord, setTopCoord] = useState<number | null>(null);

  useEffect(() => {
    let animId: number;
    const updateCoord = () => {
      if (candleSeriesRef.current && typeof candleSeriesRef.current.priceToCoordinate === 'function') {
        const coord = candleSeriesRef.current.priceToCoordinate(currentPrice);
        if (typeof coord === 'number' && !isNaN(coord) && coord > 0) {
          setTopCoord(coord);
        }
      }
      animId = requestAnimationFrame(updateCoord);
    };
    updateCoord();
    return () => cancelAnimationFrame(animId);
  }, [candleSeriesRef, currentPrice]);

  if (topCoord === null) return null;

  return (
    <div
      style={{ top: `${topCoord}px` }}
      className="absolute left-0 right-0 pointer-events-none z-30 flex items-center justify-start -translate-y-1/2"
    >
      {/* Card discreto com o preço justificado à esquerda */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onRestorePriceScale();
        }}
        className={`pointer-events-auto px-2 py-0.5 rounded-r-md font-mono font-black text-[10px] shadow-lg flex items-center gap-1 active:scale-95 transition cursor-pointer select-none border-r-2 shrink-0 ${
          isLastCandleUp
            ? 'bg-emerald-600/95 text-white border-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
            : 'bg-rose-600/95 text-white border-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
        }`}
        title="Toque para reexibir a escala vertical de preços"
      >
        <span>{currentPrice.toFixed(2)}</span>
      </div>

      {/* Linha horizontal tracejada do card até a margem direita */}
      <div className="w-full border-b border-dashed border-cyan-400/50 shadow-sm" />
    </div>
  );
};

const CandleChartInner: React.FC<CandleChartProps> = ({
  candles,
  instanceId,
  isLoading: _isLoading = false,
  loadingProgress,
  onDoubleClick,
  height = '100%',
  isZoomed = false,
  timeframe: timeframeProp,
  setTimeframe: setTimeframeProp,
  onClose,
  simulatedReports,
  activePosition,
  simulatedPrice,
  gammaLevels: gammaLevelsProp,
  isSimulator,
  newsList: newsListProp,
  activeIndicators: activeIndicatorsRaw,
  fitChartTrigger,
  hideManualTradeBar = false,
  showRobots: showRobotsProp,
  setShowRobots: setShowRobotsProp,
  showTradeMarkers: showTradeMarkersProp,
  setShowTradeMarkers: setShowTradeMarkersProp,
  showOrderLines = true,
  showIndicatorsLegend: _showIndicatorsLegend,
  setShowIndicatorsLegend: _setShowIndicatorsLegend,
  autoCenter: autoCenterProp,
  setAutoCenter: setAutoCenterProp,
  resetViewTrigger,
  forceCandleView = false,
  drawings,
  onUpdateDrawing,
  onFinishDrawing,
  activeDrawingTool,
  selectedDrawingId,
  onSelectDrawing,
  onOpenDrawingSettings,
  onDeleteDrawing,
  onUpdateReportLevels: onUpdateReportLevelsProp,
  customSignals: customSignalsProp,
  onOpenIndicatorsManager,
  activeWidgets: activeWidgetsRaw,
  panel: panelProp,
  marketData: marketDataProp,
  isFocused = true
}) => {
  const activeIndicatorsKey = useMemo(() => {
    if (!activeIndicatorsRaw) return '__undef__';
    try {
      return JSON.stringify(activeIndicatorsRaw);
    } catch {
      return String(activeIndicatorsRaw.length);
    }
  }, [activeIndicatorsRaw]);
  const activeIndicators = useMemo(() => activeIndicatorsRaw, [activeIndicatorsKey]);

  const activeWidgetsKey = useMemo(() => {
    if (!activeWidgetsRaw) return '__undef__';
    try {
      return JSON.stringify(activeWidgetsRaw);
    } catch {
      return String(activeWidgetsRaw.length);
    }
  }, [activeWidgetsRaw]);
  const activeWidgetsProp = useMemo(() => activeWidgetsRaw, [activeWidgetsKey]);

  const [localTimeframe, setLocalTimeframe] = useState<number>(1);
  const timeframe = timeframeProp !== undefined ? timeframeProp : localTimeframe;
  const setTimeframe = setTimeframeProp !== undefined ? setTimeframeProp : setLocalTimeframe;
  const chartRootRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);
  const emacdContainerRef = useRef<HTMLDivElement>(null);
  const timeHeatmapContainerRef = useRef<HTMLDivElement>(null);
  const axionTrendContainerRef = useRef<HTMLDivElement>(null);
  const momentumMatrixContainerRef = useRef<HTMLDivElement>(null);
  const bottomControlsRef = useRef<HTMLDivElement>(null);

  const [forecastMode, setForecastMode] = useState<'historico' | 'hurst'>(() => {
    try {
      const saved = localStorage.getItem('vortex_time_heatmap_forecast_mode');
      if (saved === 'hurst' || saved === 'historico') return saved;
    } catch {}
    return 'historico';
  });
  const forecastModeRef = useRef<'historico' | 'hurst'>(forecastMode);
  forecastModeRef.current = forecastMode;

  const [subPanelHeight, setSubPanelHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('vortex_subpanel_height');
      if (saved) {
        const val = Number(saved);
        if (val >= 60 && val <= 350) return val;
      }
    } catch {}
    return 100;
  });
  const indicatorHeightRef = useRef<number>(subPanelHeight);
  indicatorHeightRef.current = subPanelHeight;
  const resizeChartsRef = useRef<(() => void) | null>(null);

  const mainChartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const macdChartRef = useRef<IChartApi | null>(null);
  const emacdChartRef = useRef<IChartApi | null>(null);
  const timeHeatmapChartRef = useRef<IChartApi | null>(null);
  const axionTrendChartRef = useRef<IChartApi | null>(null);
  const momentumMatrixChartRef = useRef<IChartApi | null>(null);

  // Momentum Matrix Subpanel Refs & Snapshot
  const momentumCombinedIndicesSeriesRef = useRef<any | null>(null);
  const momentumCombinedStocksSeriesRef = useRef<any | null>(null);
  const momentumFxFlowSeriesRef = useRef<any | null>(null);
  const momentumEurJpySeriesRef = useRef<any | null>(null);
  const momentumUsdJpySeriesRef = useRef<any | null>(null);
  const momentumEurUsdSeriesRef = useRef<any | null>(null);
  const momentumVixSeriesRef = useRef<any | null>(null);
  const momentumDxySeriesRef = useRef<any | null>(null);
  const momentumNqSeriesRef = useRef<any | null>(null);
  const momentumEsSeriesRef = useRef<any | null>(null);
  const momentumIndividualTechPoolRef = useRef<Map<string, any>>(new Map());
  const momentumMatrixDataRef = useRef<MomentumMatrixProcessedSeries | null>(null);
  const [momentumMatrixSnapshot, setMomentumMatrixSnapshot] = useState<any | null>(() => ({
    combinedIndices: 50,
    combinedStocks: 50,
    fxFlow: 50,
    vix: 50,
    dxy: 50,
    eurjpy: 50,
    eurusd: 50,
    usdjpy: 50,
    nq: 50,
    es: 50,
    timestamp: new Date().toISOString(),
    confluenceState: 'neutral'
  }));

  // Series Refs
  const candleSeriesRef = useRef<any | null>(null);
  const volumeSeriesRef = useRef<any | null>(null);
  const smaSeriesRef = useRef<any | null>(null);
  const ema21SeriesRef = useRef<any | null>(null);
  const ema50SeriesRef = useRef<any | null>(null);
  const rsiSeriesRef = useRef<any | null>(null);
  const macdLineSeriesRef = useRef<any | null>(null);
  const macdSignalSeriesRef = useRef<any | null>(null);
  const macdHistSeriesRef = useRef<any | null>(null);
  const emacdHistSeriesRef = useRef<any | null>(null);
  const emacdExplosionSeriesRef = useRef<any | null>(null);
  const emacdDeadZoneSeriesRef = useRef<any | null>(null);
  const timeHeatmapHistSeriesRef = useRef<any | null>(null);
  const timeHeatmapLineSeriesRef = useRef<any | null>(null);
  const timeHeatmapForecastSeriesRef = useRef<any | null>(null);
  const timeHeatmapThresholdSeriesRef = useRef<any | null>(null);
  const axionTrendHistSeriesRef = useRef<any | null>(null);
  const axionTrendUpperSeriesRef = useRef<any | null>(null);
  const axionTrendMidSeriesRef = useRef<any | null>(null);
  const axionTrendLowerSeriesRef = useRef<any | null>(null);
  const axionTrendMacdbbSeriesRef = useRef<any | null>(null);
  const axionTrendZeroSeriesRef = useRef<any | null>(null);
  const fvgUpSeriesPoolRef = useRef<any[]>([]);
  const fvgDownSeriesPoolRef = useRef<any[]>([]);
  const confirmedMacdDivergencesRef = useRef<Map<string, MacdDivergence>>(new Map());
  const lastTimeframeRef = useRef<number>(timeframe);
  const lastSmaCountRef = useRef<number>(0);
  const lastEma21CountRef = useRef<number>(0);
  const lastEma50CountRef = useRef<number>(0);
  const lastRsiCountRef = useRef<number>(0);
  const lastMacdCountRef = useRef<number>(0);
  const lastEmacdHistCountRef = useRef<number>(0);
  const markersPluginRef = useRef<any | null>(null);
  const dynamicSeriesPoolRef = useRef<Map<string, any[]>>(new Map());
  const dynamicMarkersRef = useRef<any[]>([]);
  const playedPatternMarkersRef = useRef<Set<string>>(new Set());
  const tradeMarkersRef = useRef<any[]>([]);
  const updateMarkersRef = useRef<any>(null);
  const lastAppliedMarkersStrRef = useRef<string>('');
  const lastAppliedLevelsKeyRef = useRef<string>('');
  const volumeAnalysisResultsRef = useRef<{
    heatmap?: { result: any; maxOpacity: number; colorTheme: string; minThreshold: number } | null;
    levels?: { result: any; showPoc: boolean; showVahVal: boolean; showNakedPocs: boolean; pocColor: string; vahColor: string; valColor: string } | null;
    hvnBlocks?: { result: any; blockOpacity: number; blockColor: string } | null;
    spikePivots?: { selectedPivots: any[]; highColor: string; lowColor: string; lineWidth: number; lineStyle: number; showBreached: boolean } | null;
  }>({});
  const timeRangeResultsRef = useRef<any[]>([]);
  const timeHeatmapResultsRef = useRef<any[]>([]);
  const sessionsColorBgRef = useRef<any[]>([]);
  const orderFlowCvdRef = useRef<any | null>(null);
  const currentPriceRef = useRef<number | null>(null);
  const chartDataRef = useRef<any[]>([]);
  const autoCenterRef = useRef<boolean>(false);
  const autoCenterHalfSpanRef = useRef<number | null>(null);
  const lastPanelKeyRef = useRef<string | null>(null);

  // Block Trades tracking refs para identificação visual nos candles
  const rawBlockTradesHistoryRef = useRef<Array<{
    id: string;
    timeSec: number;
    price: number;
    volume: number;
    side: 'COMPRA' | 'VENDA';
    timeStr?: string;
  }>>([]);
  const candleBlockTradesMapRef = useRef<Map<number, { buyVolumes: number[]; sellVolumes: number[] }>>(new Map());
  const processedTradeKeysRef = useRef<Set<string>>(new Set());
  const activeWidgetsRef = useRef<any[]>(activeWidgetsProp || []);
  void rawBlockTradesHistoryRef;
  void candleBlockTradesMapRef;
  void processedTradeKeysRef;
  void activeWidgetsRef;

  updateMarkersRef.current = () => {
    try {
      if (!markersPluginRef.current) return;

      // Guard: se o candleSeries não tem dados ainda, o priceScale não está inicializado
      // e o lightweight-charts lançará "Value is null" ao tentar converter preço em coordenada.
      // Nesse caso, limpamos os marcadores e abortamos silenciosamente.
      const seriesData = chartDataRef.current;
      if (!seriesData || seriesData.length === 0) {
        try { markersPluginRef.current.setMarkers([]); } catch (_) {}
        lastAppliedMarkersStrRef.current = '';
        return;
      }

      const combined = [...(tradeMarkersRef.current || []), ...(dynamicMarkersRef.current || [])];
      const minTime = seriesData[0]?.time || 0;
      const maxTime = seriesData[seriesData.length - 1]?.time || Infinity;
      const valid = combined
        .filter(m => 
          m &&
          typeof m.time === 'number' &&
          !isNaN(m.time) &&
          m.time >= minTime &&
          m.time <= maxTime &&
          (m.position === 'aboveBar' || m.position === 'belowBar' || m.position === 'inBar') &&
          (m.shape === 'arrowUp' || m.shape === 'arrowDown' || m.shape === 'circle' || m.shape === 'square')
        )
        .map(m => ({
          time: m.time,
          position: m.position,
          shape: m.shape,
          color: m.color || '#3b82f6',
          text: typeof m.text === 'string' ? m.text : '',
          size: typeof m.size === 'number' && !isNaN(m.size) ? m.size : 1
        }));

      valid.sort((a, b) => a.time - b.time);

      const markersKey = valid.map(m => `${m.time}_${m.position}_${m.shape}_${m.text}_${m.color}_${m.size}`).join('|');
      if (markersKey === lastAppliedMarkersStrRef.current) {
        return; // Conteúdo dos marcadores não mudou, evita re-render e efeito de piscar
      }
      lastAppliedMarkersStrRef.current = markersKey;

      try {
        markersPluginRef.current.setMarkers(valid as any);
      } catch (e: any) {
        recordChartError({
          type: 'lightweight-charts',
          message: 'Erro no plugin de marcadores: ' + (e?.message || e),
          stack: e?.stack || '',
          panelId: instanceId || 'painel_chart'
        });
      }
    } catch (err: any) {
      recordChartError({
        type: 'lightweight-charts',
        message: 'Erro ao processar marcadores: ' + (err?.message || err),
        stack: err?.stack || '',
        panelId: instanceId || 'painel_chart'
      });
    }
  };

  const isFirstDataLoadRef = useRef(true);
  const isHistoryPlottedRef = useRef(false);
  const lastChartDataLengthRef = useRef<number>(0);
  const lastChartDataTimeRef = useRef<number>(0);
  const lastRecentCandlesRef = useRef<string>('');
  const lastPriceFormatColorRef = useRef<string>('');
  const isDocumentVisibleRef = useRef<boolean>(typeof document !== 'undefined' ? !document.hidden : true);

  const {
    gammaLevels: contextGammaLevels, settings: appSettings, allSettings, saveSettings,
    screenshot, marketData: contextMarketData, reports, prompts, createReportAction, updateReportAction, updateReportLevelsAction, runManualAIAnalysis,
    checkOperationalLimits,
    user, isAuthenticated, activePanel: appActivePanel, panels, switchPanel, setReports,
    customStrategies, publicStrategies, pausedStrategyIds,
    customSignals: appCustomSignals,
    accounts, activeAccount, switchAccount,
    accountStrategies, setAccountStrategies,
    forces, addLog
  } = useApp() as any;

  const activePanel = panelProp || appActivePanel;
  const settings = (panelProp && allSettings?.[panelProp.id]) ? allSettings[panelProp.id] : appSettings;
  const marketData = marketDataProp !== undefined ? marketDataProp : contextMarketData;

  const customSignals = customSignalsProp !== undefined ? customSignalsProp : appCustomSignals;

  const panelKey = activePanel?.id || instanceId || 'main_panel';
  const profileKey = activeAccount?.id || user?.id || 'default_account';

  // Configurações e Visibilidade de Indicadores Isolados por Painel e por Perfil de Usuário
  const [panelIndicators, setPanelIndicators] = useState<{
    showSma9: boolean;
    showEma21: boolean;
    showEma50: boolean;
    showRsi: boolean;
    showMacd: boolean;
    showPva: boolean;
    showEMacd: boolean;
    showFvg: boolean;
  }>(() => {
    try {
      const saved = localStorage.getItem(`vortex_chart_ind_${profileKey}_${panelKey}`) ||
                    localStorage.getItem(`vortex_chart_ind_${panelKey}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      showSma9: true,
      showEma21: true,
      showEma50: true,
      showRsi: false,
      showMacd: false,
      showPva: false,
      showEMacd: false,
      showFvg: false,
    };
  });

  // Estado em tempo real do Radar Preditivo Axion ML (+25/-12 pts)
  const [axionMLRadarState, setAxionMLRadarState] = useState<{
    visible: boolean;
    status: string;
    direction: 'COMPRA' | 'VENDA' | 'NEUTRO';
    probability: number;
    probBuy?: number;
    probSell?: number;
    strengthScore?: number;
    strengthLabel?: 'NEUTRO' | 'FRACA' | 'MODERADA' | 'FORTE' | 'INSTITUCIONAL';
    isArming: boolean;
    isSignal: boolean;
    rthActive: boolean;
    atr14: number;
    distSma60: number;
    lastPrice: number;
    distToCallRes?: number;
    distToPutSup?: number;
    currentHvl?: number;
    dynamicTp?: number;
    dynamicSl?: number;
    tacticalPerspective?: string;
    tacticalTag?: 'REVERSAO' | 'BREAKOUT' | 'CORREDOR' | 'COMPRESSAO' | 'NEUTRO';
    activeModelName?: string;
    confluentPattern?: string;
  } | null>(null);

  // Ao trocar de painel ou conta, carrega o perfil exclusivo de indicadores desse painel
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`vortex_chart_ind_${profileKey}_${panelKey}`) ||
                    localStorage.getItem(`vortex_chart_ind_${panelKey}`);
      if (saved) {
        setPanelIndicators(JSON.parse(saved));
      } else {
        setPanelIndicators({
          showSma9: true,
          showEma21: true,
          showEma50: true,
          showRsi: false,
          showMacd: false,
          showPva: false,
          showEMacd: false,
          showFvg: false,
        });
      }
    } catch {}
  }, [panelKey, profileKey]);

  const { showSma9, showEma21, showEma50, showRsi, showMacd, showPva, showEMacd, showFvg } = panelIndicators;

  const [cursorMode, setCursorMode] = useState<'crosshair' | 'arrow'>(() => {
    try {
      return localStorage.getItem('vortex_chart_cursor_mode') === 'arrow' ? 'arrow' : 'crosshair';
    } catch {
      return 'crosshair';
    }
  });
  const cursorModeRef = useRef<'crosshair' | 'arrow'>(cursorMode);
  useEffect(() => {
    cursorModeRef.current = cursorMode;
  }, [cursorMode]);

  useEffect(() => {
    const handleCursorModeChanged = (e: any) => {
      const nextMode = e?.detail?.mode === 'arrow' ? 'arrow' : 'crosshair';
      setCursorMode(nextMode);
    };
    window.addEventListener('vortex_cursor_mode_changed', handleCursorModeChanged);
    return () => window.removeEventListener('vortex_cursor_mode_changed', handleCursorModeChanged);
  }, []);

  const [isLightChartBg, setIsLightChartBg] = useState<boolean>(() => {
    try {
      const activeKey = settings?.chart_color_theme || localStorage.getItem('vortex_chart_theme') || 'ninja_carbon';
      return isLightChartBackground(getChartThemeColors(activeKey).bg);
    } catch {
      return false;
    }
  });

  const [inspectedCandle, setInspectedCandle] = useState<{
    candle: any;
    x: number;
    y: number;
    tickSize: number;
  } | null>(null);
  const isRightInspectingRef = useRef<boolean>(false);

  const updateInspectedCandleAtClientPos = useCallback((clientX: number, clientY: number) => {
    const container = mainContainerRef.current;
    const chart = mainChartRef.current;
    const data = chartDataRef.current;
    if (!container || !chart || !data || data.length === 0) {
      setInspectedCandle(null);
      return;
    }
    const rect = container.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    if (mouseX < 0 || mouseY < 0 || mouseX > rect.width || mouseY > rect.height) {
      setInspectedCandle(null);
      return;
    }
    const logical = chart.timeScale().coordinateToLogical(mouseX);
    if (logical === null || isNaN(logical)) {
      setInspectedCandle(null);
      return;
    }
    const idx = Math.round(logical);
    if (idx < 0 || idx >= data.length) {
      setInspectedCandle(null);
      return;
    }
    const targetCandle = data[idx];
    if (!targetCandle) {
      setInspectedCandle(null);
      return;
    }
    const tickSize = resolvePanelTickSize(activePanel, settings);
    setInspectedCandle({
      candle: targetCandle,
      x: mouseX,
      y: mouseY,
      tickSize
    });
  }, [activePanel, settings]);

  useEffect(() => {
    const handleGlobalMove = (e: PointerEvent | MouseEvent) => {
      if (!isRightInspectingRef.current) return;
      updateInspectedCandleAtClientPos(e.clientX, e.clientY);
    };
    const stopInspect = () => {
      if (isRightInspectingRef.current) {
        isRightInspectingRef.current = false;
        setInspectedCandle(null);
      }
    };
    window.addEventListener('pointermove', handleGlobalMove);
    window.addEventListener('pointerup', stopInspect);
    window.addEventListener('pointercancel', stopInspect);
    window.addEventListener('mouseup', stopInspect);
    window.addEventListener('blur', stopInspect);
    return () => {
      window.removeEventListener('pointermove', handleGlobalMove);
      window.removeEventListener('pointerup', stopInspect);
      window.removeEventListener('pointercancel', stopInspect);
      window.removeEventListener('mouseup', stopInspect);
      window.removeEventListener('blur', stopInspect);
    };
  }, [updateInspectedCandleAtClientPos]);

  const [isBoletaCollapsed, setIsBoletaCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(`vortex_hide_boleta_${activePanel?.id || 'main'}`);
      return saved === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`vortex_hide_boleta_${activePanel?.id || 'main'}`);
      setIsBoletaCollapsed(saved === 'true');
    } catch {}
  }, [activePanel?.id]);

  // Autoajuste dinâmico da altura do gráfico ao ocultar/mostrar a boleta
  useEffect(() => {
    const run = () => {
      if (resizeChartsRef.current) {
        resizeChartsRef.current();
      }
      if (updateLevelLabelsRef.current) {
        updateLevelLabelsRef.current();
      }
    };
    run();
    const t1 = setTimeout(run, 40);
    const t2 = setTimeout(run, 150);
    const t3 = setTimeout(run, 300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isBoletaCollapsed]);

  const isSimulatorMode = Boolean(isSimulator || simulatedReports !== undefined || simulatedPrice !== undefined);

  // Robôs e Prompts vinculados à conta de negociação selecionada
  const accountLinkedStrategies = useMemo(() => {
    if (!activeAccount) return [];
    return (accountStrategies || []).filter((s: any) => s.account_id === activeAccount.id);
  }, [accountStrategies, activeAccount]);

  const [internalNews, setInternalNews] = useState<any[]>([]);
  useEffect(() => {
    if (newsListProp && newsListProp.length > 0) {
      setInternalNews(newsListProp);
    } else {
      import('../services/db').then(m => {
        m.fetchNewsSupabase().then(res => {
          if (res) setInternalNews(res);
        });
      });
    }
  }, [newsListProp]);

  const gammaLevels = gammaLevelsProp !== undefined ? gammaLevelsProp : contextGammaLevels;

  const settingsRef = useRef<any>(settings);
  const saveSettingsRef = useRef<any>(saveSettings);
  const reportsRef = useRef<any>(reports);
  const updateReportLevelsActionRef = useRef<any>(updateReportLevelsAction);
  // 🛡️ Trava Anti-Reversão de Níveis SL/TP no Gráfico: impede que refetches ou ticks voltem preços antigos
  const optimisticReportLevelsRef = useRef<Map<string, { stop_loss?: number | null; take_profit?: number | null; timestamp: number }>>(new Map());

  useEffect(() => {
    settingsRef.current = settings;
    saveSettingsRef.current = saveSettings;
  }, [settings, saveSettings]);

  useEffect(() => {
    // Ao receber nova lista de relatórios, aplica os níveis otimistas recentes se ainda válidos (< 30s)
    if (reports && reports.length > 0) {
      const now = Date.now();
      const patched = reports.map((r: any) => {
        const opt = optimisticReportLevelsRef.current.get(r.id);
        if (opt && (now - opt.timestamp) < 30000 && r.status === 'Em Andamento') {
          return {
            ...r,
            stop_loss: opt.stop_loss !== undefined ? opt.stop_loss : r.stop_loss,
            take_profit: opt.take_profit !== undefined ? opt.take_profit : r.take_profit
          };
        }
        return r;
      });
      reportsRef.current = patched;
    } else {
      reportsRef.current = reports;
    }
  }, [reports]);

  // Listener para sincronização instantânea dos níveis (SL/TP) vindos de comandos do Copilot / Boleta / Backend
  useEffect(() => {
    const handleLevelsUpdated = (e: any) => {
      const { id, stop_loss, take_profit } = e.detail || {};
      if (!id) return;
      optimisticReportLevelsRef.current.set(id, {
        stop_loss,
        take_profit,
        timestamp: Date.now()
      });
      if (reportsRef.current) {
        reportsRef.current = reportsRef.current.map((r: any) => {
          if (r.id === id || (r.master_operation_id === id && r.status === 'Em Andamento')) {
            return { ...r, stop_loss, take_profit };
          }
          return r;
        });
      }
      if (updateLevelLabelsRef.current) {
        updateLevelLabelsRef.current();
      }
    };

    window.addEventListener('vortex_report_levels_updated', handleLevelsUpdated);
    return () => {
      window.removeEventListener('vortex_report_levels_updated', handleLevelsUpdated);
    };
  }, []);

  useEffect(() => {
    updateReportLevelsActionRef.current = updateReportLevelsAction;
  }, [updateReportLevelsAction]);

  const [tempViewMode, setTempViewMode] = useState<'candles' | 'screenshot'>(
    (forceCandleView || hideManualTradeBar)
      ? 'candles'
      : (settings?.source_screen === 'candles' ? 'candles' : 'screenshot')
  );

  useEffect(() => {
    if (forceCandleView || hideManualTradeBar) {
      setTempViewMode('candles');
    } else {
      setTempViewMode(settings?.source_screen === 'candles' ? 'candles' : 'screenshot');
    }
  }, [settings?.source_screen, forceCandleView, hideManualTradeBar]);

  const isMobile = useIsMobile();
  const [hidePriceScaleMobile, setHidePriceScaleMobile] = useState<boolean>(() => {
    try {
      return localStorage.getItem('vortex_mobile_hide_price_scale') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('vortex_mobile_hide_price_scale', String(hidePriceScaleMobile));
    } catch {}
  }, [hidePriceScaleMobile]);

  const [manualTradeMode, setManualTradeMode] = useState<'nivel' | 'pontos' | 'grafico' | 'copilot' | 'range'>(() => {
    try {
      localStorage.setItem('vortex_stop_mode', 'pontos');
    } catch {}
    return 'pontos';
  });
  const [manualSizingMode, setManualSizingMode] = useState<'lote' | 'risco'>(() => {
    try {
      const saved = localStorage.getItem('vortex_manual_sizing_mode') as any;
      if (saved) return saved;
    } catch {}
    return (settings?.chart_manual_sizing_mode as any) || 'lote';
  });
  const [manualRiskUsd, setManualRiskUsd] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('vortex_manual_risk_usd');
      if (saved) return Number(saved);
    } catch {}
    return Number(settings?.chart_manual_risk_usd || 250);
  });
  const [manualSlPoints, setManualSlPoints] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('vortex_manual_sl_points');
      if (saved) return Number(saved);
    } catch {}
    return Number(settings?.chart_manual_sl_points || 50);
  });
  const [manualTpPoints, setManualTpPoints] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('vortex_manual_tp_points');
      if (saved) return Number(saved);
    } catch {}
    return Number(settings?.chart_manual_tp_points || 50);
  });
  const [manualContracts, setManualContracts] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('vortex_manual_contracts');
      if (saved) return Number(saved);
    } catch {}
    return Number(settings?.chart_manual_contracts || settings?.contracts || 1);
  });

  useEffect(() => {
    try { localStorage.setItem('vortex_manual_contracts', String(manualContracts)); } catch {}
  }, [manualContracts]);
  useEffect(() => {
    try { localStorage.setItem('vortex_manual_sl_points', String(manualSlPoints)); } catch {}
  }, [manualSlPoints]);
  useEffect(() => {
    try { localStorage.setItem('vortex_manual_tp_points', String(manualTpPoints)); } catch {}
  }, [manualTpPoints]);
  useEffect(() => {
    try { localStorage.setItem('vortex_manual_risk_usd', String(manualRiskUsd)); } catch {}
  }, [manualRiskUsd]);
  useEffect(() => {
    try { localStorage.setItem('vortex_manual_sizing_mode', manualSizingMode); } catch {}
  }, [manualSizingMode]);
  useEffect(() => {
    try { localStorage.setItem('vortex_stop_mode', manualTradeMode); } catch {}
  }, [manualTradeMode]);

  useEffect(() => {
    const handleForcePontos = () => {
      setManualTradeMode('pontos');
      try {
        localStorage.setItem(isSimulator ? 'vortex_replay_stop_mode' : 'vortex_stop_mode', 'pontos');
      } catch {}
    };
    window.addEventListener('vortex_force_stop_mode_pontos', handleForcePontos);
    return () => window.removeEventListener('vortex_force_stop_mode_pontos', handleForcePontos);
  }, [isSimulator]);

  useEffect(() => {
    if (!mainChartRef.current) return;
    try {
      const pScaleOptions = {
        rightPriceScale: {
          visible: isMobile ? !hidePriceScaleMobile : true,
          minimumWidth: isMobile ? (hidePriceScaleMobile ? 0 : 55) : 85,
        }
      };
      mainChartRef.current.applyOptions(pScaleOptions);
      if (rsiChartRef.current) rsiChartRef.current.applyOptions(pScaleOptions);
      if (macdChartRef.current) macdChartRef.current.applyOptions(pScaleOptions);
      if (emacdChartRef.current) emacdChartRef.current.applyOptions(pScaleOptions);
      if (timeHeatmapChartRef.current) timeHeatmapChartRef.current.applyOptions(pScaleOptions);
      if (axionTrendChartRef.current) axionTrendChartRef.current.applyOptions(pScaleOptions);
      if (momentumMatrixChartRef.current) momentumMatrixChartRef.current.applyOptions(pScaleOptions);

      if (updateLevelLabelsRef.current) {
        updateLevelLabelsRef.current();
      }
      setTimeout(() => {
        if (resizeChartsRef.current) resizeChartsRef.current();
        window.dispatchEvent(new Event('resize'));
      }, 30);
    } catch {}
  }, [hidePriceScaleMobile, isMobile]);

  const lastPriceScaleTapRef = useRef<number>(0);
  const lastChartTapRef = useRef<number>(0);
  const handlePriceScaleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    const touch = e.changedTouches?.[0];
    if (!touch || !mainContainerRef.current) return;
    const rect = mainContainerRef.current.getBoundingClientRect();
    const now = Date.now();

    // Toque nos últimos 75px da largura do gráfico (onde fica a escala de preço vertical)
    if (touch.clientX >= rect.right - 75) {
      if (now - lastPriceScaleTapRef.current < 350) {
        setHidePriceScaleMobile(prev => !prev);
        lastPriceScaleTapRef.current = 0;
        return;
      }
      lastPriceScaleTapRef.current = now;
      return;
    }

    // Toque no corpo do gráfico: dois toques rápidos mostram ou ocultam o menu do rodapé
    if (now - lastChartTapRef.current < 350) {
      window.dispatchEvent(new CustomEvent('vortex_toggle_bottom_nav'));
      lastChartTapRef.current = 0;
      return;
    }
    lastChartTapRef.current = now;
  }, [isMobile]);
  // Estado de Marcação Interativa de SL/TP no Gráfico (Passo 1: SL, Passo 2: TP)
  const [markingSlTpState, setMarkingSlTpState] = useState<'marking_sl' | 'marking_tp' | null>(null);
  const [tempSlPrice, setTempSlPrice] = useState<number | null>(null);
  const [customMarkersVersion, setCustomMarkersVersion] = useState<number>(0);
  const [showLevels, setShowLevels] = useState<boolean>(true);
  const [localShowTradeMarkers, setLocalShowTradeMarkers] = useState<boolean>(true);
  const showTradeMarkers = showTradeMarkersProp !== undefined ? showTradeMarkersProp : localShowTradeMarkers;
  const setShowTradeMarkers = setShowTradeMarkersProp !== undefined ? setShowTradeMarkersProp : setLocalShowTradeMarkers;

  const [localShowRobots, setLocalShowRobots] = useState<boolean>(false);
  const showRobots = showRobotsProp !== undefined ? showRobotsProp : localShowRobots;
  const setShowRobots = setShowRobotsProp !== undefined ? setShowRobotsProp : setLocalShowRobots;
  const [proposedTrade, setProposedTrade] = useState<{
    entry: number;
    stopLoss: number | null;
    takeProfit: number | null;
    side: 'COMPRA' | 'VENDA';
  } | null>(null);

  const effectiveShowSma9 = activeIndicators ? false : showSma9;
  const effectiveShowEma21 = activeIndicators ? false : showEma21;
  const effectiveShowEma50 = activeIndicators ? false : showEma50;

  const effectiveShowGamma = activeIndicators
    ? activeIndicators.some(i => (i.type === 'GammaLevels' || i.type === 'GAMMA_LEVELS' || i.type === 'LEVELS_GAMMA' || i.type === 'LEVELS_OPTIONS' || i.type === 'LEVELS_DAILY' || i.type === 'LEVELS_LIQUIDITY') && i.visible)
    : showLevels;

  const effectiveShowPva = activeIndicators
    ? activeIndicators.some(i => i.type === 'PVA' && i.visible)
    : showPva;

  const effectiveShowFvg = activeIndicators
    ? activeIndicators.some(i => i.type === 'FVG' && i.visible)
    : showFvg;

  const effectiveShowRsi = activeIndicators
    ? activeIndicators.some(i => i.type === 'RSI' && i.visible)
    : showRsi;

  const effectiveShowMacd = activeIndicators
    ? activeIndicators.some(i => i.type === 'MACD' && i.visible)
    : showMacd;

  const effectiveShowEMacd = activeIndicators
    ? activeIndicators.some(i => (i.type === 'EMACD' || i.type === 'MACD_EXPLOSION') && i.visible)
    : showEMacd;

  const effectiveShowTimeHeatmap = activeIndicators
    ? activeIndicators.some(i => (i.type === 'TIME_HEATMAP' || i.type === 'TIME_HEATMAP_HURST') && i.visible)
    : false;

  const axionTrendIndConfig = useMemo(() => {
    return (activeIndicators || []).find(i => i.type === 'AXION_TREND' && i.visible);
  }, [activeIndicators]);

  const effectiveShowAxionTrend = Boolean(axionTrendIndConfig);
  const effectiveShowAxionTrendSubPanel = Boolean(axionTrendIndConfig && axionTrendIndConfig.params?.showSubPanel !== false);
  const effectiveShowAxionTrendColorBars = Boolean(axionTrendIndConfig && axionTrendIndConfig.params?.colorBars !== false);

  const momentumMatrixIndConfig = useMemo(() => {
    return (activeIndicators || []).find(i => (i.type === 'MOMENTUM_CONFLUENCE' || i.type === 'MOMENTUM_MATRIX') && i.visible);
  }, [activeIndicators]);

  const effectiveShowMomentumMatrix = Boolean(momentumMatrixIndConfig);

  const strikeLevelsIndConfig = useMemo(() => {
    return (activeIndicators || []).find(i => (i.type === 'STRIKE_LEVELS' || i.type === 'StrikeLevels') && i.visible);
  }, [activeIndicators]);

  const effectiveShowStrikeLevels = Boolean(strikeLevelsIndConfig);
  const [_marketMatrixFeed, setMarketMatrixFeed] = useState<MarketMatrixData | null>(null);
  const marketMatrixFeedRef = useRef<MarketMatrixData | null>(null);

  useEffect(() => {
    if (!effectiveShowStrikeLevels) return;

    fetchMarketMatrixData().then(d => {
      if (d) {
        setMarketMatrixFeed(d);
        marketMatrixFeedRef.current = d;
        if (updateLevelLabelsRef.current) {
          updateLevelLabelsRef.current(true);
        }
      }
    });

    const unsubscribe = subscribeMarketMatrix((d) => {
      setMarketMatrixFeed(d);
      marketMatrixFeedRef.current = d;
      if (updateLevelLabelsRef.current) {
        updateLevelLabelsRef.current(true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [effectiveShowStrikeLevels]);

  const proposedTradeRef = useRef<any>(proposedTrade);
  useEffect(() => {
    proposedTradeRef.current = proposedTrade;
  }, [proposedTrade]);

  // Ref para rastrear instâncias ativas de linhas de preço (Entry, SL, TP) para atualização em tempo real (0ms)
  const tradePriceLinesMapRef = useRef<Map<string, { entry?: any; sl?: any; tp?: any }>>(new Map());

  // Ref para armazenar estado do arrasto em tempo real (Stop Loss / Take Profit)
  const draggedLevelsRef = useRef<{
    reportId: string | null;
    type: 'stop_loss' | 'take_profit' | null;
    price: number | null;
  }>({ reportId: null, type: null, price: null });

  // Função para iniciar o arrasto interativo e suave das linhas de SL e TP (suporta Mouse, Touchscreen e Pointer Events)
  const startDraggingLevel = (reportId: string, type: 'stop_loss' | 'take_profit', initialPrice: number, e: React.PointerEvent | React.MouseEvent | React.TouchEvent | PointerEvent | MouseEvent | TouchEvent) => {
    if ('cancelable' in e && e.cancelable) e.preventDefault();
    if ('stopPropagation' in e) e.stopPropagation();

    draggedLevelsRef.current = {
      reportId,
      type,
      price: initialPrice
    };

    const getEventClientY = (evt: PointerEvent | MouseEvent | TouchEvent): number | null => {
      if ('touches' in evt && evt.touches && evt.touches.length > 0) {
        return evt.touches[0].clientY;
      }
      if ('changedTouches' in evt && evt.changedTouches && evt.changedTouches.length > 0) {
        return evt.changedTouches[0].clientY;
      }
      if ('clientY' in evt && typeof evt.clientY === 'number') {
        return evt.clientY;
      }
      return null;
    };

    let animationFrameId: number | null = null;

    const handleMove = (moveEvent: PointerEvent | MouseEvent | TouchEvent) => {
      if ('cancelable' in moveEvent && moveEvent.cancelable) moveEvent.preventDefault();
      if (!mainContainerRef.current || !candleSeriesRef.current) return;
      const rect = mainContainerRef.current.getBoundingClientRect();
      const clientY = getEventClientY(moveEvent);
      if (clientY === null) return;
      const mouseY = clientY - rect.top;
      
      let newPrice = candleSeriesRef.current.coordinateToPrice(mouseY);
      if (newPrice === null || isNaN(newPrice) || newPrice <= 0) {
        const pTop = candleSeriesRef.current.coordinateToPrice ? candleSeriesRef.current.coordinateToPrice(0) : null;
        const pBottom = candleSeriesRef.current.coordinateToPrice ? candleSeriesRef.current.coordinateToPrice(rect.height) : null;
        if (pTop !== null && pBottom !== null && !isNaN(pTop) && !isNaN(pBottom) && pTop !== pBottom) {
          newPrice = pTop + (mouseY / rect.height) * (pBottom - pTop);
        }
      }

      const refClose = (chartDataRef.current && chartDataRef.current.length > 0)
        ? chartDataRef.current[chartDataRef.current.length - 1].close
        : null;
      const isPriceSafe = (p: number | null | undefined): boolean => {
        if (typeof p !== 'number' || isNaN(p) || !isFinite(p) || p <= 0) return false;
        if (refClose && refClose > 0) {
          if (p > refClose * 2.8 || p < refClose * 0.35) return false;
        }
        return true;
      };

      if (newPrice !== null && !isNaN(newPrice) && isPriceSafe(newPrice)) {
        const tickSize = resolvePanelTickSize(activePanel, settings);
        const roundedPrice = roundToTick(newPrice, tickSize);
        draggedLevelsRef.current.price = roundedPrice;

        // ⚡ Atualização Instantânea da Linha Horizontal no Gráfico (0ms feedback)
        const priceLines = tradePriceLinesMapRef.current.get(reportId);
        if (priceLines) {
          if (type === 'stop_loss' && priceLines.sl) {
            try { priceLines.sl.applyOptions({ price: roundedPrice }); } catch (_) {}
          } else if (type === 'take_profit' && priceLines.tp) {
            try { priceLines.tp.applyOptions({ price: roundedPrice }); } catch (_) {}
          }
        }

        if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(() => {
          try {
            if (updateLevelLabelsRef.current) updateLevelLabelsRef.current();
          } catch (_) {}
        });
      }
    };

    const handleEnd = async () => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      window.removeEventListener('pointermove', handleMove as any);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
      window.removeEventListener('mousemove', handleMove as any);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove as any);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);

      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      const { reportId: targetId, type: dragType, price: rawFinalPrice } = draggedLevelsRef.current;
      const tickSize = resolvePanelTickSize(activePanel, settings);
      const finalPrice = rawFinalPrice !== null ? roundToTick(rawFinalPrice, tickSize) : null;

      if (targetId && dragType && finalPrice !== null) {
        if (targetId === 'custom_marker') {
          const keySl = isSimulatorMode || isSimulator ? 'vortex_replay_custom_sl_price' : 'vortex_custom_sl_price';
          const keyTp = isSimulatorMode || isSimulator ? 'vortex_replay_custom_tp_price' : 'vortex_custom_tp_price';
          if (dragType === 'stop_loss') {
            localStorage.setItem(keySl, String(finalPrice));
          } else if (dragType === 'take_profit') {
            localStorage.setItem(keyTp, String(finalPrice));
          }
          const sl = Number(localStorage.getItem(keySl)) || finalPrice;
          const tp = Number(localStorage.getItem(keyTp)) || finalPrice;
          window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated', { detail: { sl, tp } }));
        } else if (targetId === 'proposed' && proposedTradeRef.current) {
          setProposedTrade(prev => prev ? {
            ...prev,
            stopLoss: dragType === 'stop_loss' ? finalPrice : prev.stopLoss,
            takeProfit: dragType === 'take_profit' ? finalPrice : prev.takeProfit
          } : null);
        } else if (isSimulatorMode || isSimulator) {
          const currentSl = activePosition ? (activePosition.stop_loss !== undefined ? activePosition.stop_loss : activePosition.stopLoss) : null;
          const currentTp = activePosition ? (activePosition.take_profit !== undefined ? activePosition.take_profit : activePosition.takeProfit) : null;
          const newSl = dragType === 'stop_loss' ? finalPrice : (!isNaN(Number(currentSl)) ? roundToTick(Number(currentSl), tickSize) : null);
          const newTp = dragType === 'take_profit' ? finalPrice : (!isNaN(Number(currentTp)) ? roundToTick(Number(currentTp), tickSize) : null);

          if (activePosition) {
            activePosition.stop_loss = newSl;
            activePosition.stopLoss = newSl;
            activePosition.take_profit = newTp;
            activePosition.takeProfit = newTp;
          }

          if (onUpdateReportLevelsProp) {
            onUpdateReportLevelsProp(targetId || activePosition?.id || 'active-pos', newSl, newTp);
          }
        } else {
          // Busca inteligente multi-camada para garantir a sincronização do relatório
          const targetPanelInstance = activePanel?.instance_id || instanceId || 'painel_principal';
          const targetPanelId = activePanel?.id || null;
          const targetAccountId = activeAccount?.id || null;

          let currentReport = (reportsRef.current || []).find((r: any) => r.id === targetId);
          if (!currentReport) {
            // Busca por operação em andamento deste painel/conta
            currentReport = (reportsRef.current || []).find(
              (r: any) => r.status === 'Em Andamento' && (
                (targetAccountId && r.account_id === targetAccountId) ||
                r.panel_id === targetPanelId ||
                r.instance_id === targetPanelInstance ||
                !r.panel_id
              )
            );
          }
          if (!currentReport && (reportsRef.current || []).length > 0) {
            currentReport = (reportsRef.current || []).find((r: any) => r.status === 'Em Andamento');
          }

          const actualReportId = currentReport?.id || (targetId !== 'proposed' && targetId !== 'active-pos' ? targetId : null);

          if (actualReportId) {
            const currentSl = currentReport && 'stop_loss' in currentReport ? Number(currentReport.stop_loss) : null;
            const currentTp = currentReport && 'take_profit' in currentReport ? Number(currentReport.take_profit) : null;
            const newSl = dragType === 'stop_loss' ? finalPrice : (!isNaN(Number(currentSl)) ? roundToTick(Number(currentSl), tickSize) : null);
            const newTp = dragType === 'take_profit' ? finalPrice : (!isNaN(Number(currentTp)) ? roundToTick(Number(currentTp), tickSize) : null);

            const curPrice = currentPriceRef.current || (chartDataRef.current.length > 0 ? chartDataRef.current[chartDataRef.current.length - 1].close : null);
            let safeSl = newSl;
            const opSide = currentReport?.side || activePosition?.side;
            if (dragType === 'stop_loss' && safeSl !== null && curPrice && curPrice > 0) {
              if (opSide === 'COMPRA' && safeSl >= curPrice) {
                safeSl = roundToTick(curPrice - tickSize, tickSize);
              } else if (opSide === 'VENDA' && safeSl <= curPrice) {
                safeSl = roundToTick(curPrice + tickSize, tickSize);
              }
            }

            // Atualiza de imediato o objeto local na referência e salva trava otimista
            if (currentReport) {
              currentReport.stop_loss = safeSl;
              currentReport.take_profit = newTp;
            }
            if (activePosition) {
              activePosition.stop_loss = safeSl;
              activePosition.stopLoss = safeSl;
              activePosition.take_profit = newTp;
              activePosition.takeProfit = newTp;
            }
            optimisticReportLevelsRef.current.set(actualReportId, {
              stop_loss: safeSl,
              take_profit: newTp,
              timestamp: Date.now()
            });

            if (onUpdateReportLevelsProp) {
              onUpdateReportLevelsProp(actualReportId, safeSl, newTp);
            }
            if (updateReportLevelsActionRef.current) {
              await updateReportLevelsActionRef.current(actualReportId, safeSl, newTp, curPrice);
            } else {
              await updateStrategyReportLevelsSupabase(actualReportId, safeSl, newTp, curPrice);
            }
          }
        }
      }

      draggedLevelsRef.current = { reportId: null, type: null, price: null };
      if (updateLevelLabelsRef.current) updateLevelLabelsRef.current();
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';

    window.addEventListener('pointermove', handleMove as any, { passive: false });
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
    window.addEventListener('mousemove', handleMove as any);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove as any, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);
  };

  // Refs para monitorar inatividade de dados de mercado (dados repetitivos / mercado parado)
  const lastMarketTimestampRef = useRef<string | null>(null);
  const lastMarketUpdateReceivedTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (marketData && marketData.timestamp && marketData.timestamp !== '--:--:--') {
      if (marketData.timestamp !== lastMarketTimestampRef.current) {
        lastMarketTimestampRef.current = marketData.timestamp;
        lastMarketUpdateReceivedTimeRef.current = Date.now();
      }
    }
  }, [marketData?.timestamp]);

  // Sincronizar activeWidgetsRef sempre que activeWidgetsProp mudar
  useEffect(() => {
    activeWidgetsRef.current = activeWidgetsProp || [];
    syncBlockTradesToCandles();
  }, [activeWidgetsProp]);

  // Mapear trades qualificados para cada candle histórico e em formação
  const syncBlockTradesToCandles = useCallback(() => {
    const candles = chartDataRef.current;
    if (!candles || candles.length === 0) return;

    const trades = rawBlockTradesHistoryRef.current;

    // Configurações atuais do widget Block Trades
    const blockTradesWidget = (activeWidgetsRef.current || activeWidgetsProp || []).find(
      (w: any) => w.type === 'block_trades'
    );
    const minContracts = typeof blockTradesWidget?.params?.minContracts === 'number'
      ? blockTradesWidget.params.minContracts
      : 50;

    // Se não há trades no histórico, apenas limpa se necessário e redesenha
    if (trades.length === 0) {
      if (candleBlockTradesMapRef.current.size > 0) {
        candleBlockTradesMapRef.current.clear();
        if (updateLevelLabelsRef.current) updateLevelLabelsRef.current();
      }
      return;
    }

    // Filtrar trades com volume >= minContracts
    const qualifiedTrades = trades.filter(t => t.volume >= minContracts);
    const newMap = new Map<number, { buyVolumes: number[]; sellVolumes: number[] }>();

    // Helper determinístico para encontrar o candle exato do trade por Data, Hora, Minuto e Timeframe
    const findCandleForTradeExact = (tradeTimeStr: string): number | null => {
      if (!candles || candles.length === 0 || !tradeTimeStr) return null;
      const parts = String(tradeTimeStr).trim().split(':');
      if (parts.length < 2) return null;
      const tHours = parseInt(parts[0], 10);
      const tMinutes = parseInt(parts[1], 10);
      const tSeconds = parts[2] ? parseInt(parts[2], 10) : 0;
      if (isNaN(tHours) || isNaN(tMinutes)) return null;

      const latestC = candles[candles.length - 1];
      const lMatch = (latestC.timestamp || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
      if (!lMatch) return null;

      let tYear = parseInt(lMatch[1], 10);
      let tMonth = parseInt(lMatch[2], 10) - 1;
      let tDay = parseInt(lMatch[3], 10);
      const lHours = parseInt(lMatch[4], 10);

      // Transição de Meia-Noite:
      // Se a vela mais recente do gráfico é da madrugada (ex: 00:03) e o trade foi às 23:38, ele ocorreu no dia anterior
      if (tHours > lHours + 12) {
        const prev = new Date(tYear, tMonth, tDay - 1);
        tYear = prev.getFullYear();
        tMonth = prev.getMonth();
        tDay = prev.getDate();
      } else if (lHours > tHours + 12) {
        // Se a vela atual é das 23:59 e o trade já é 00:00 (dia seguinte)
        const next = new Date(tYear, tMonth, tDay + 1);
        tYear = next.getFullYear();
        tMonth = next.getMonth();
        tDay = next.getDate();
      }

      // Convenção NinjaTrader 8: a barra é marcada no seu fechamento.
      // Ex: um trade ocorrido às 23:53:08 pertence à barra das 23:54 (em 1m).
      // Se o horário é 00:13:10, a barra em formação é rotulada como 00:14.
      const tf = Math.max(1, timeframe || 1);
      // Arredonda para cima para o próximo múltiplo do timeframe
      const targetTotalMinutes = Math.ceil((tHours * 60 + tMinutes + (tSeconds > 0 ? 0.001 : 0)) / tf) * tf;

      let targetYear = tYear;
      let targetMonth = tMonth;
      let targetDay = tDay;

      // Se virou a meia-noite pelo fechamento da barra (ex: trade às 23:59:15 fecha na barra 00:00 do dia seguinte):
      if (targetTotalMinutes >= 24 * 60) {
        const dNextDay = new Date(tYear, tMonth, tDay + 1);
        targetYear = dNextDay.getFullYear();
        targetMonth = dNextDay.getMonth();
        targetDay = dNextDay.getDate();
      }

      const candleHourMinute = targetTotalMinutes % (24 * 60);
      const targetH = Math.floor(candleHourMinute / 60);
      const targetM = candleHourMinute % 60;
      const targetTotalMinOfDay = targetH * 60 + targetM;

      const tDateKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;

      for (let i = candles.length - 1; i >= 0; i--) {
        const c = candles[i];
        const ts = c.timestamp || '';
        const m = ts.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
        if (!m) continue;

        if (m[1] !== tDateKey) continue;

        const cHours = parseInt(m[2], 10);
        const cMinutes = parseInt(m[3], 10);
        const cTotalMinutes = cHours * 60 + cMinutes;

        if (cTotalMinutes === targetTotalMinOfDay) {
          return c.time;
        }
      }

      return null;
    };

    qualifiedTrades.forEach(t => {
      const rawTimeStr = t.timeStr || (t.id ? String(t.id).split('_')[0] : '');
      const matchedCandleTime = findCandleForTradeExact(rawTimeStr);

      if (matchedCandleTime !== null) {
        const entry = newMap.get(matchedCandleTime) || { buyVolumes: [], sellVolumes: [] };
        if (t.side === 'COMPRA') {
          entry.buyVolumes.push(t.volume);
        } else if (t.side === 'VENDA') {
          entry.sellVolumes.push(t.volume);
        }
        newMap.set(matchedCandleTime, entry);
      }
    });

    // Ordenar os volumes de cada candle do menor (mais próximo ao pavio) para o maior (mais externo),
    // preservando sempre os maiores contratos caso haja múltiplas agressões no mesmo candle:
    // - Na COMPRA (abaixo do candle): menor na linha de cima, maior na linha de baixo.
    // - Na VENDA (acima do candle): menor na linha de baixo, maior na linha de cima.
    newMap.forEach((entry) => {
      if (entry.buyVolumes.length > 1) {
        entry.buyVolumes = entry.buyVolumes
          .sort((a, b) => b - a)
          .slice(0, 5)
          .sort((a, b) => a - b);
      }
      if (entry.sellVolumes.length > 1) {
        entry.sellVolumes = entry.sellVolumes
          .sort((a, b) => b - a)
          .slice(0, 5)
          .sort((a, b) => a - b);
      }
    });

    candleBlockTradesMapRef.current = newMap;
    if (updateLevelLabelsRef.current) {
      updateLevelLabelsRef.current();
    }
  }, [timeframe, activeWidgetsProp]);

  // Carregar histórico de Block Trades do sessionStorage se houver
  useEffect(() => {
    try {
      const storageKey = `vortex_bt_trades_${instanceId || 'main'}`;
      const cached = sessionStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          const sanitized: any[] = [];
          parsed.forEach((p: any) => {
            const rawTime = p.timeStr || (p.id ? String(p.id).split('_')[0] : '');
            if (rawTime && p.volume && p.price) {
              sanitized.push({
                ...p,
                timeSec: 0,
                timeStr: rawTime
              });
              if (p.id) processedTradeKeysRef.current.add(p.id);
            }
          });
          rawBlockTradesHistoryRef.current = sanitized;
          syncBlockTradesToCandles();
        }
      }
    } catch (_) {}
  }, [instanceId, syncBlockTradesToCandles]);

  // Helper unificado de ingestão de Block Trades com deduplicação
  const ingestBlockTrades = useCallback((tradesList: any[], clearOld = false) => {
    if (clearOld) {
      rawBlockTradesHistoryRef.current = [];
      processedTradeKeysRef.current.clear();
      if (candleBlockTradesMapRef.current.size > 0) {
        candleBlockTradesMapRef.current.clear();
        if (updateLevelLabelsRef.current) updateLevelLabelsRef.current();
      }
    }
    if (!tradesList || !Array.isArray(tradesList) || tradesList.length === 0) return;
    let hasNew = false;
    tradesList.forEach((t: any) => {
      if (!t || !t.volume || !t.price) return;
      const side: 'COMPRA' | 'VENDA' = String(t.side || 'COMPRA').toUpperCase() === 'COMPRA' ? 'COMPRA' : 'VENDA';
      const key = `${t.time || ''}_${t.price}_${t.volume}_${side}`;
      if (processedTradeKeysRef.current.has(key)) return;
      processedTradeKeysRef.current.add(key);

      rawBlockTradesHistoryRef.current.push({
        id: key,
        timeSec: 0,
        price: Number(t.price),
        volume: Number(t.volume),
        side,
        timeStr: String(t.time || '')
      });
      hasNew = true;
    });

    if (hasNew) {
      if (rawBlockTradesHistoryRef.current.length > 1000) {
        rawBlockTradesHistoryRef.current = rawBlockTradesHistoryRef.current.slice(-1000);
      }
      try {
        const storageKey = `vortex_bt_trades_${instanceId || 'main'}`;
        sessionStorage.setItem(storageKey, JSON.stringify(rawBlockTradesHistoryRef.current.slice(-500)));
      } catch (_) {}

      syncBlockTradesToCandles();
    }
  }, [instanceId, syncBlockTradesToCandles]);

  const lastEffectiveSourceRef = useRef<string>('auto');

  // Monitorar Block Trades da fonte selecionada (NT8 Local vs Supabase Nuvem)
  useEffect(() => {
    let isSubscribed = true;
    const blockTradesWidget = (activeWidgetsRef.current || activeWidgetsProp || []).find(
      (w: any) => w.type === 'block_trades'
    );
    const dataSource: 'auto' | 'nt8' | 'supabase' = blockTradesWidget?.params?.dataSource || 'auto';

    const syncTrades = async () => {
      let localTrades = getStreamerBlockTrades(activePanel, settings);
      if (dataSource === 'nt8' || (dataSource === 'auto' && localTrades.length === 0)) {
        try {
          const fetched = await fetchStreamerBlockTrades(activePanel, settings);
          if (isSubscribed && Array.isArray(fetched) && fetched.length > 0) {
            localTrades = fetched;
          }
        } catch (_) {}
      }

      const supabaseTrades = marketData?.blockTrades || [];
      const hasLocal = localTrades.length > 0;
      const effectiveSource = dataSource === 'nt8'
        ? 'nt8'
        : (dataSource === 'supabase' ? 'supabase' : (hasLocal ? 'nt8' : 'supabase'));

      const sourceChanged = lastEffectiveSourceRef.current !== effectiveSource;
      lastEffectiveSourceRef.current = effectiveSource;

      const tradesToIngest = effectiveSource === 'nt8' ? localTrades : supabaseTrades;
      if (isSubscribed) {
        ingestBlockTrades(tradesToIngest, sourceChanged);
      }
    };

    syncTrades();

    return () => {
      isSubscribed = false;
    };
  }, [activeWidgetsProp, marketData?.blockTrades, ingestBlockTrades, activePanel, settings]);

  // Monitorar novos Block Trades recebidos via WebSocket do NinjaTrader 8 local
  useEffect(() => {
    const handleLocalTrade = (e: any) => {
      const blockTradesWidget = (activeWidgetsRef.current || activeWidgetsProp || []).find(
        (w: any) => w.type === 'block_trades'
      );
      const dataSource: 'auto' | 'nt8' | 'supabase' = blockTradesWidget?.params?.dataSource || 'auto';
      if (dataSource === 'supabase') return; // Se configurado como estritamente Supabase, ignora push local do NT8

      if (e.detail) {
        ingestBlockTrades([e.detail]);
      }
    };

    window.addEventListener('vortex_local_block_trade', handleLocalTrade);
    return () => {
      window.removeEventListener('vortex_local_block_trade', handleLocalTrade);
    };
  }, [activeWidgetsProp, ingestBlockTrades]);

  const initialSyncedPanelIdRef = useRef<string | null>(null);
  const lastSyncedSettingsTradeModeRef = useRef<string | null>(null);
  const lastSyncedSettingsSizingModeRef = useRef<string | null>(null);

  // Sincronizar configurações quando carregadas do Supabase ou alteradas na Boleta
  useEffect(() => {
    if (!settings) return;
    const isNewPanel = activePanel?.id !== initialSyncedPanelIdRef.current;
    if (isNewPanel) {
      initialSyncedPanelIdRef.current = activePanel?.id || 'main';
      isFirstDataLoadRef.current = true;
      setManualTradeMode('pontos');
      lastSyncedSettingsTradeModeRef.current = settings.chart_manual_trade_mode || 'pontos';
      try {
        localStorage.setItem(isSimulator ? 'vortex_replay_stop_mode' : 'vortex_stop_mode', 'pontos');
      } catch {}
    } else if (settings.chart_manual_trade_mode && settings.chart_manual_trade_mode !== lastSyncedSettingsTradeModeRef.current && settings.chart_manual_trade_mode !== manualTradeMode) {
      lastSyncedSettingsTradeModeRef.current = settings.chart_manual_trade_mode;
      setManualTradeMode(settings.chart_manual_trade_mode);
    } else if (settings.chart_manual_trade_mode) {
      lastSyncedSettingsTradeModeRef.current = settings.chart_manual_trade_mode;
    }
    if (settings.chart_manual_sizing_mode) {
      const mode = settings.chart_manual_sizing_mode === 'risco' ? 'risco' : 'lote';
      if (isNewPanel || (mode !== lastSyncedSettingsSizingModeRef.current && mode !== manualSizingMode)) {
        lastSyncedSettingsSizingModeRef.current = mode;
        setManualSizingMode(mode);
      } else {
        lastSyncedSettingsSizingModeRef.current = mode;
      }
    }
    if (settings.chart_manual_risk_usd !== undefined) {
      const r = Number(settings.chart_manual_risk_usd);
      if (isNewPanel || r !== manualRiskUsd) setManualRiskUsd(r);
    }
    if (settings.chart_manual_sl_points !== undefined) {
      const sl = Number(settings.chart_manual_sl_points);
      if (isNewPanel || sl !== manualSlPoints) setManualSlPoints(sl);
    }
    if (settings.chart_manual_tp_points !== undefined) {
      const tp = Number(settings.chart_manual_tp_points);
      if (isNewPanel || tp !== manualTpPoints) setManualTpPoints(tp);
    }
    if (settings.chart_manual_contracts !== undefined) {
      const c = Number(settings.chart_manual_contracts);
      if (isNewPanel || c !== manualContracts) setManualContracts(c);
    } else if (settings.contracts !== undefined) {
      const c = Number(settings.contracts);
      if (isNewPanel || c !== manualContracts) setManualContracts(c);
    }
    if (settings.chart_show_levels !== undefined && (isNewPanel || settings.chart_show_levels !== showLevels)) {
      setShowLevels(settings.chart_show_levels);
    }
    if (showTradeMarkersProp === undefined && settings.chart_show_trade_markers !== undefined && (isNewPanel || settings.chart_show_trade_markers !== showTradeMarkers)) {
      setShowTradeMarkers(settings.chart_show_trade_markers);
    }
  }, [settings, activePanel?.id]);

  const activeTrade = useMemo(() => {
    if (isSimulatorMode) return null;
    const targetId = activePanel?.instance_id || instanceId || 'painel_principal';
    const activeAccountId = activeAccount?.id || null;
    const currentAssetSymbol = activePanel?.symbol || activePanel?.name || 'NQ';
    return (reports || []).find(
      (r: any) =>
        (r.instance_id === targetId || (!r.instance_id && targetId === 'painel_principal')) &&
        r.status === 'Em Andamento' &&
        (!activeAccountId || r.account_id === activeAccountId) &&
        (!r.symbol || isSameAsset(r.symbol, currentAssetSymbol))
    );
  }, [reports, activePanel?.instance_id, instanceId, activeAccount?.id, isSimulatorMode, activePanel?.symbol, activePanel?.name]);

  const pointValueForPanel = activePanel?.point_value !== undefined && activePanel?.point_value !== null ? Number(activePanel.point_value) : 1.0;

  const effectiveSlPoints = useMemo(() => {
    const isReplay = isSimulatorMode || isSimulator;
    const atmActiveKey = isReplay ? 'vortex_replay_atm_active' : 'vortex_atm_active';
    const atmStratKey = isReplay ? 'vortex_replay_active_atm' : 'vortex_active_atm';
    const keySl = isReplay ? 'vortex_replay_custom_sl_price' : 'vortex_custom_sl_price';
    const keyMode = isReplay ? 'vortex_replay_stop_mode' : 'vortex_stop_mode';

    const isATM = typeof window !== 'undefined' ? localStorage.getItem(atmActiveKey) === 'true' : false;
    if (isATM && typeof window !== 'undefined') {
      try {
        const savedAtm = localStorage.getItem(atmStratKey);
        if (savedAtm) {
          const parsed = JSON.parse(savedAtm);
          const firstB = parsed?.brackets?.[0];
          if (firstB && firstB.stopLossPts > 0) {
            const isTicks = parsed?.unit === 'ticks';
            const tickSz = resolvePanelTickSize(activePanel, settings);
            return isTicks ? (firstB.stopLossPts * tickSz) : firstB.stopLossPts;
          }
        }
      } catch (_) {}
    }

    const currentMode = (typeof window !== 'undefined' ? localStorage.getItem(keyMode) : null) || manualTradeMode || settings?.chart_manual_trade_mode || 'pontos';

    const refEntry = currentPriceRef.current || (chartDataRef.current.length > 0 ? chartDataRef.current[chartDataRef.current.length - 1].close : 0);

    if (currentMode === 'grafico') {
      const savedSl = typeof window !== 'undefined' ? localStorage.getItem(keySl) : null;
      const customSl = tempSlPrice !== null ? tempSlPrice : (savedSl ? Number(savedSl) : null);
      if (customSl !== null && customSl > 0 && refEntry > 0) {
        return Math.max(0.25, Math.abs(refEntry - customSl));
      }
    } else if (currentMode === 'copilot') {
      const savedCopilot = typeof window !== 'undefined' ? localStorage.getItem('vortex_copilot_sl_price') : null;
      if (savedCopilot && Number(savedCopilot) > 0 && refEntry > 0) {
        return Math.max(0.25, Math.abs(refEntry - Number(savedCopilot)));
      }
    } else if (currentMode === 'range') {
      const keyRef = isReplay ? 'vortex_replay_range_candle_ref' : 'vortex_range_candle_ref';
      const keyMult = isReplay ? 'vortex_replay_range_tp_multiplier' : 'vortex_range_tp_multiplier';
      const candleRef = typeof window !== 'undefined' ? Number(localStorage.getItem(keyRef) || 1) : 1;
      const tpMult = typeof window !== 'undefined' ? Number(localStorage.getItem(keyMult) || 1.0) : 1.0;
      const tickSz = resolvePanelTickSize(activePanel, settings);
      const rangeRes = calculateRangeHlLevels('COMPRA', refEntry, chartDataRef.current || [], candleRef, tpMult, tickSz);
      if (rangeRes.slPts > 0) return rangeRes.slPts;
    }

    return manualSlPoints && manualSlPoints > 0 ? manualSlPoints : 50;
  }, [
    manualTradeMode,
    settings?.chart_manual_trade_mode,
    manualSlPoints,
    tempSlPrice,
    customMarkersVersion,
    isSimulatorMode,
    isSimulator,
    activePanel?.id,
    activePanel?.point_value,
    marketData?.price
  ]);

  const riskPerSingleContractUsd = Math.max(0.01, effectiveSlPoints * pointValueForPanel);
  const calculatedRiskContracts = useMemo(() => {
    if (manualSizingMode !== 'risco') return manualContracts || 1;
    const targetRiskUsd = manualRiskUsd && manualRiskUsd > 0 ? manualRiskUsd : 250;
    return Math.max(1, Math.floor(targetRiskUsd / riskPerSingleContractUsd));
  }, [manualSizingMode, manualRiskUsd, riskPerSingleContractUsd, manualContracts]);

  const finalContractsToUse = manualSizingMode === 'risco' ? calculatedRiskContracts : (manualContracts || 1);

  useEffect(() => {
    if (updateTradePriceLinesRef.current) updateTradePriceLinesRef.current();
    if (updateLevelLabelsRef.current) updateLevelLabelsRef.current(true);
  }, [finalContractsToUse, manualSizingMode, manualRiskUsd, manualContracts, customMarkersVersion, tempSlPrice, markingSlTpState]);

  const handleManualTrade = async (side: 'COMPRA' | 'VENDA') => {
    // 1) Verificar se o mercado está em andamento (se temos dados ativos e não repetitivos)
    if (!marketData || !marketData.timestamp || marketData.timestamp === '--:--:--') {
      alert('Estamos sem dados de mercado para efetuar sua operação !');
      return;
    }

    const dbTime = marketData.updated_at ? new Date(marketData.updated_at).getTime() : 0;
    const now = Date.now();
    const timeDiff = dbTime > 0 ? now - dbTime : 0;

    // Se o banco não é atualizado há mais de 45 segundos (ajustado para detecção de mercado parado)
    if (dbTime > 0 && timeDiff > 45000) {
      alert('Estamos sem dados de mercado para efetuar sua operação !');
      return;
    }

    // Se os dados recebidos pelo painel forem repetitivos (não mudam há mais de 30 segundos)
    if (
      lastMarketTimestampRef.current &&
      marketData.timestamp === lastMarketTimestampRef.current &&
      now - lastMarketUpdateReceivedTimeRef.current > 30000
    ) {
      alert('Estamos sem dados de mercado para efetuar sua operação !');
      return;
    }

    const lastPrice = aggregatedCandles.length > 0 ? aggregatedCandles[aggregatedCandles.length - 1].close : null;
    const resolvedPrice = marketData?.price && marketData.price !== '--' ? Number(marketData.price) : lastPrice;

    if (!resolvedPrice || isNaN(resolvedPrice)) {
      alert('Preço atual não disponível para realizar a operação manual.');
      return;
    }

    // Verificar limites operacionais antes de abrir operação manual
    if (activePanel) {
      const opCheck = await checkOperationalLimits(activePanel.id);
      if (!opCheck.allowed) {
        alert(`❌ Operação Bloqueada:\n${opCheck.reason}`);
        return;
      }
    }

    const levelPrices: number[] = [];
    if (gammaLevels) {
      Object.keys(LEVEL_CONFIGS).forEach(key => {
        const val = (gammaLevels as any)[key];
        const num = Number(val);
        if (val !== undefined && val !== null && !isNaN(num) && num > 0) {
          levelPrices.push(num);
        }
      });
      if (Array.isArray(gammaLevels.gex)) {
        gammaLevels.gex.forEach((val: number) => {
          const num = Number(val);
          if (!isNaN(num) && num > 0) levelPrices.push(num);
        });
      }
      if (Array.isArray(gammaLevels.bl)) {
        gammaLevels.bl.forEach((val: number) => {
          const num = Number(val);
          if (!isNaN(num) && num > 0) levelPrices.push(num);
        });
      }
    }

    const sortedLevels = Array.from(new Set(levelPrices)).sort((a, b) => a - b);
    const levelsBelow = sortedLevels.filter(lvl => lvl < resolvedPrice);
    const levelsAbove = sortedLevels.filter(lvl => lvl > resolvedPrice);

    const levelBelow = levelsBelow.length > 0 ? levelsBelow[levelsBelow.length - 1] : null;
    const levelAbove = levelsAbove.length > 0 ? levelsAbove[0] : null;

    const isReplay = isSimulatorMode || isSimulator;
    const keyMode = isReplay ? 'vortex_replay_stop_mode' : 'vortex_stop_mode';
    const activeStopMode = (typeof window !== 'undefined' ? localStorage.getItem(keyMode) : null) || manualTradeMode || settings?.chart_manual_trade_mode || 'pontos';

    let stopLoss: number | null = null;
    let takeProfit: number | null = null;

    if (activeStopMode === 'range') {
      const keyRef = isReplay ? 'vortex_replay_range_candle_ref' : 'vortex_range_candle_ref';
      const keyMult = isReplay ? 'vortex_replay_range_tp_multiplier' : 'vortex_range_tp_multiplier';
      const candleRef = typeof window !== 'undefined' ? Number(localStorage.getItem(keyRef) ?? 1) : 1;
      const tpMult = typeof window !== 'undefined' ? Number(localStorage.getItem(keyMult) ?? 1.0) : 1.0;
      const tickSz = resolvePanelTickSize(activePanel, settings);
      const rangeRes = calculateRangeHlLevels(side, resolvedPrice, chartDataRef.current || [], candleRef, tpMult, tickSz);
      stopLoss = rangeRes.slPrice;
      takeProfit = rangeRes.tpPrice;
    } else if (activeStopMode === 'grafico') {
      const keySl = isReplay ? 'vortex_replay_custom_sl_price' : 'vortex_custom_sl_price';
      const keyTp = isReplay ? 'vortex_replay_custom_tp_price' : 'vortex_custom_tp_price';
      const savedSl = typeof window !== 'undefined' ? localStorage.getItem(keySl) : null;
      const savedTp = typeof window !== 'undefined' ? localStorage.getItem(keyTp) : null;
      const customSl = tempSlPrice !== null ? tempSlPrice : (savedSl ? Number(savedSl) : null);
      const customTp = savedTp ? Number(savedTp) : null;
      stopLoss = customSl !== null ? customSl : (side === 'COMPRA' ? resolvedPrice - manualSlPoints : resolvedPrice + manualSlPoints);
      takeProfit = customTp !== null ? customTp : (side === 'COMPRA' ? resolvedPrice + manualTpPoints : resolvedPrice - manualTpPoints);
    } else if (activeStopMode === 'pontos') {
      if (side === 'COMPRA') {
        takeProfit = resolvedPrice + manualTpPoints;
        stopLoss = resolvedPrice - manualSlPoints;
      } else {
        takeProfit = resolvedPrice - manualTpPoints;
        stopLoss = resolvedPrice + manualSlPoints;
      }
    } else {
      // Mode 'nivel' with minimum points check
      if (side === 'COMPRA') {
        const minTpPrice = resolvedPrice + manualTpPoints;
        const minSlPrice = resolvedPrice - manualSlPoints;
        takeProfit = levelAbove !== null ? Math.max(levelAbove, minTpPrice) : minTpPrice;
        stopLoss = levelBelow !== null ? Math.min(levelBelow, minSlPrice) : minSlPrice;
      } else {
        const minTpPrice = resolvedPrice - manualTpPoints;
        const minSlPrice = resolvedPrice + manualSlPoints;
        takeProfit = levelBelow !== null ? Math.min(levelBelow, minTpPrice) : minTpPrice;
        stopLoss = levelAbove !== null ? Math.max(levelAbove, minSlPrice) : minSlPrice;
      }
    }

    // Set proposed trade levels first so they are painted immediately on the chart
    setProposedTrade({
      entry: resolvedPrice,
      stopLoss,
      takeProfit,
      side
    });

    // Wait 50ms for React state render to complete, then prompt or execute
    setTimeout(async () => {
      let accepted = true;
      const needsIaValidate = settings?.chart_manual_ia_validate === true;

      if (needsIaValidate) {
         const confirmMsg = `🤖 Validação Inteligente Axion TradeStation:\n` +
          `----------------------------------------\n` +
          `Esta operação manual de ${side} será enviada para validação da Inteligência Artificial no template ativo.\n` +
          `Entrada: ${resolvedPrice.toFixed(2)}\n` +
          `Stop Loss: ${stopLoss ? stopLoss.toFixed(2) : 'Sem Nível'}\n` +
          `Take Profit: ${takeProfit ? takeProfit.toFixed(2) : 'Sem Nível'}\n\n` +
          `Deseja prosseguir e acionar a análise de IA?`;
        accepted = window.confirm(confirmMsg);
      } else if (settings?.chart_confirm_manual_trade !== false) {
        const confirmMsg = `Confirmar Operação Manual:\n` +
          `----------------------------------------\n` +
          `Direção: ${side}\n` +
          `Painel: ${activePanel?.name || 'painel_principal'}\n` +
          `Entrada: ${resolvedPrice.toFixed(2)}\n` +
          `Stop Loss: ${stopLoss ? stopLoss.toFixed(2) : 'Sem Nível'}\n` +
          `Take Profit: ${takeProfit ? takeProfit.toFixed(2) : 'Sem Nível'}`;

        accepted = window.confirm(confirmMsg);
      }

      // Clear proposed lines
      setProposedTrade(null);

      if (!accepted) {
        return;
      }

      if (!isAuthenticated || !user) {
        alert('Sessão inválida ou desconectada. Por favor, recarregue a página ou realize login novamente.');
        return;
      }

      // Se em modo LOTE FIXO, validar contra o limite máximo de contratos da conta
      if (manualSizingMode === 'lote') {
        const maxAllowedLots = Number(activeAccount?.manual_max_lots || 0);
        if (maxAllowedLots > 0 && manualContracts > maxAllowedLots) {
          alert(`❌ Operação bloqueada: A quantidade de contratos solicitada (${manualContracts}) excede o limite máximo permitido para a conta "${activeAccount?.account_name}" (${maxAllowedLots}).`);
          return;
        }
      }

      if (needsIaValidate) {
        try {
          // Trigger the AI validation cycle
          const aiRes = await runManualAIAnalysis();
          
          if (aiRes && aiRes.success && aiRes.sinal === side) {
            alert(`✅ Operação Validada e Executada pela IA!\n` +
              `----------------------------------------\n` +
              `Direção: ${side}\n` +
              `Confiança da IA: ${aiRes.confianca}\n` +
              `Resumo: ${aiRes.resumo || 'Sem resumo'}\n` +
              `SL IA: ${aiRes.stop} | TP IA: ${aiRes.alvo}`);
          } else {
            const reason = aiRes?.resumo || 'A IA não identificou confluência técnica para o sinal solicitado.';
            const detectedSignal = aiRes?.sinal || 'AGUARDANDO';
            alert(`❌ Operação Cancelada (IA Não Validou):\n` +
              `----------------------------------------\n` +
              `Direção Solicitada: ${side}\n` +
              `Sinal Detectado pela IA: ${detectedSignal}\n` +
              `Motivo: ${reason}`);
          }
        } catch (error: any) {
          console.error('[IA VALIDATE] Erro ao validar:', error);
          alert(`❌ Erro ao validar operação com a IA: ${error.message || error}`);
        }
      } else {
        const panelInstanceId = activePanel?.instance_id || 'painel_principal';
        const activeManualStrategyId = getAccountManualStrategyId(activeAccount);
        const payload = {
          account_id: activeAccount?.id || null,
          strategy_id: activeManualStrategyId,
          strategy_name: 'Entrada Manual',
          side,
          entry_price: resolvedPrice,
          stop_loss: stopLoss,
          take_profit: takeProfit,
          exit_price: null,
          status: 'Em Andamento' as const,
          description: `[${activePanel?.name || 'Painel'}] Entrada manual executada via gráfico (${side})`,
          instance_id: panelInstanceId,
          panel_id: activePanel?.id || null,
          contrato: finalContractsToUse
        };

        const newReport = await createReportAction(payload);
        if (!newReport) {
          alert('Não foi possível registrar a operação manual. Verifique se a conta selecionada está ativa e configurada na Gestão de Contas.');
        }
      }
    }, 50);
  };

  const handleFlatAllTrades = async () => {
    if (!isAuthenticated || !user) {
      alert('Sessão desconectada. Por favor, realize login novamente.');
      return;
    }
    const targetId = activePanel?.instance_id || instanceId || 'painel_principal';
    const activeAccountId = activeAccount?.id || null;
    const openReports = (reports || []).filter((r: any) =>
      (r.status === 'Em Andamento' || r.status === 'Pendente') &&
      (r.instance_id === targetId || (!r.instance_id && targetId === 'painel_principal')) &&
      (!activeAccountId || r.account_id === activeAccountId)
    );

    if (openReports.length === 0 && !activeTrade) {
      alert('Nenhuma operação em andamento para zerar.');
      return;
    }

    if (settings?.chart_confirm_manual_trade !== false) {
      if (!window.confirm(`Deseja zerar e encerrar todas as operações abertas de ${activePanel?.name || 'painel'}?`)) return;
    }

    for (const r of openReports) {
      await updateReportAction(r.id, 'Cancelado');
    }
    if (activeTrade && !openReports.some((r: any) => r.id === activeTrade.id)) {
      await updateReportAction(activeTrade.id, 'Cancelado');
    }
  };

  const handleBreakeven = async () => {
    try {
      const targetId = activePanel?.instance_id || instanceId || 'painel_principal';
      const activeAccountId = activeAccount?.id || null;
      const openReportsForChart = (reports || []).filter((r: any) =>
        (r.status === 'Em Andamento' || r.status === 'Pendente') &&
        (r.instance_id === targetId || (!r.instance_id && targetId === 'painel_principal')) &&
        (!activeAccountId || r.account_id === activeAccountId)
      );

      if (openReportsForChart.length === 0 && !activeTrade) return;

      const targetReports = openReportsForChart.length > 0 ? openReportsForChart : [activeTrade];
      const curPrice = currentLivePrice || 0;
      const tickSize = resolvePanelTickSize(activePanel, settings) || 0.25;

      const updates = targetReports.map((r: any) => {
        const entry = Number(r.entry_price || 0);
        if (entry <= 0) return null;
        let newStop = entry;
        if (r.side === 'COMPRA') {
          newStop = (curPrice >= entry + 1.5) ? (entry + 0.5) : entry;
          if (curPrice > 0 && newStop >= curPrice - tickSize) {
            newStop = Math.min(entry, curPrice - tickSize);
          }
        } else if (r.side === 'VENDA') {
          newStop = (curPrice <= entry - 1.5 && curPrice > 0) ? (entry - 0.5) : entry;
          if (curPrice > 0 && newStop <= curPrice + tickSize) {
            newStop = Math.max(entry, curPrice + tickSize);
          }
        }
        return {
          id: r.id,
          stopLoss: roundToTick(newStop, tickSize),
          takeProfit: r.take_profit ? Number(r.take_profit) : null
        };
      }).filter(Boolean);

      if (updates.length === 0) return;

      const updatesMap = new Map(updates.map((u: any) => [u.id, u.stopLoss]));

      if (setReports) {
        setReports((prev: any) => (prev || []).map((r: any) =>
          updatesMap.has(r.id) ? { ...r, stop_loss: updatesMap.get(r.id) } : r
        ));
      }

      await Promise.all(
        updates.map((u: any) =>
          updateReportLevelsAction
            ? updateReportLevelsAction(u.id, u.stopLoss, u.takeProfit, curPrice)
            : updateStrategyReportLevelsSupabase(u.id, u.stopLoss, u.takeProfit, curPrice)
        )
      );
    } catch (err) {
      console.error('[CANDLE_CHART] Erro ao mover breakeven:', err);
    }
  };

  const toggleViewMode = () => {
    const nextMode = tempViewMode === 'candles' ? 'screenshot' : 'candles';
    setTempViewMode(nextMode);
    if (nextMode === 'candles') {
      setTimeout(() => {
        if (resizeChartsRef.current) {
          resizeChartsRef.current();
        }
      }, 50);
    }
  };

  interface ViewportState {
    barCount: number;
    offsetFromEnd: number;
    isScrolledLeft: boolean;
    from?: number;
    to?: number;
    time?: number;
  }

  const lastBarCountRef = useRef<number>(
    (() => {
      try {
        const panelStored = localStorage.getItem(`vortex_chart_bar_count_${panelKey}`);
        if (panelStored) {
          const num = Number(panelStored);
          if (!isNaN(num) && num > 5) return num;
        }
      } catch (_) {}
      try {
        const stored = localStorage.getItem('vortex_chart_bar_count');
        if (stored) {
          const num = Number(stored);
          if (!isNaN(num) && num > 5) return num;
        }
      } catch (_) {}
      return settings?.chart_candle_bar_count || 100;
    })()
  );

  const lastViewportStateRef = useRef<ViewportState>(
    (() => {
      try {
        const saved = sessionStorage.getItem(`vortex_viewport_${panelKey}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed.barCount === 'number' && parsed.barCount > 5) {
            return parsed;
          }
        }
      } catch (_) {}
      try {
        const panelBarCount = localStorage.getItem(`vortex_chart_bar_count_${panelKey}`) || localStorage.getItem('vortex_chart_bar_count');
        const bc = panelBarCount ? parseInt(panelBarCount, 10) : (settings?.chart_candle_bar_count || 100);
        if (!isNaN(bc) && bc > 5) {
          return { barCount: bc, offsetFromEnd: 0, isScrolledLeft: false };
        }
      } catch (_) {}
      return { barCount: 100, offsetFromEnd: 0, isScrolledLeft: false };
    })()
  );

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`vortex_viewport_${panelKey}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.barCount === 'number' && parsed.barCount > 5) {
          lastViewportStateRef.current = parsed;
          lastBarCountRef.current = parsed.barCount;
          return;
        }
      }
    } catch (_) {}
    try {
      const stored = localStorage.getItem(`vortex_chart_bar_count_${panelKey}`) || localStorage.getItem('vortex_chart_bar_count');
      if (stored) {
        const bc = parseInt(stored, 10);
        if (!isNaN(bc) && bc > 5) {
          lastBarCountRef.current = bc;
          lastViewportStateRef.current = { barCount: bc, offsetFromEnd: 0, isScrolledLeft: false };
        }
      }
    } catch (_) {}
  }, [panelKey]);

  const applySavedViewport = useCallback((forceRealTime = false) => {
    if (!mainChartRef.current || chartDataRef.current.length === 0) return;
    const curLen = chartDataRef.current.length;
    
    let vp = lastViewportStateRef.current;
    if (!vp || !vp.barCount || vp.barCount <= 5) {
      try {
        const saved = sessionStorage.getItem(`vortex_viewport_${panelKey}`);
        if (saved) vp = JSON.parse(saved);
      } catch (_) {}
    }

    const barCount = vp?.barCount && vp.barCount > 5 && vp.barCount < 1000 ? vp.barCount : (lastBarCountRef.current || 100);
    const safeBarCount = Math.max(10, Math.min(barCount, 800));
    const isScrolledLeft = !forceRealTime && !!vp?.isScrolledLeft && ((vp.offsetFromEnd || 0) > 15) && (curLen > 20);

    let targetTo: number;
    let targetFrom: number;

    if (isScrolledLeft) {
      targetTo = Math.max(safeBarCount, curLen - (vp.offsetFromEnd || 0));
      targetFrom = targetTo - safeBarCount;
    } else {
      targetTo = curLen + 5;
      targetFrom = targetTo - safeBarCount;
    }

    try {
      mainChartRef.current.timeScale().setVisibleLogicalRange({
        from: targetFrom as any,
        to: targetTo as any
      });
      mainChartRef.current.priceScale('right').applyOptions({ autoScale: true });

      [rsiChartRef.current, macdChartRef.current, emacdChartRef.current, timeHeatmapChartRef.current].forEach(sc => {
        if (sc) {
          try {
            sc.timeScale().setVisibleLogicalRange({ from: targetFrom as any, to: targetTo as any });
          } catch (_) {}
        }
      });
    } catch (err: any) {
      recordChartError({
        type: 'lightweight-charts',
        message: 'Erro ao restaurar viewport do gráfico: ' + (err?.message || err),
        stack: err?.stack || '',
        panelId: instanceId || 'painel_chart'
      });
    }
  }, [panelKey, instanceId]);

  const saveBarCountTimeoutRef = useRef<any>(null);

  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (saveBarCountTimeoutRef.current) {
        clearTimeout(saveBarCountTimeoutRef.current);
      }
    };
  }, []);

  const activePriceLinesRef = useRef<any[]>([]);
  const updateTradePriceLinesRef = useRef<(() => void) | null>(null);
  const isFocusedRef = useRef<boolean>(isFocused);
  isFocusedRef.current = isFocused;
  const activePanelIdRef = useRef<string | null>(activePanel?.id || null);
  activePanelIdRef.current = activePanel?.id || null;

  useEffect(() => {
    const handleStartMarking = () => {
      if (!isFocusedRef.current) return;

      try {
        localStorage.setItem('vortex_custom_sltp_panel_id', activePanelIdRef.current || 'main');
      } catch {}

      lastChartSelectionTimeRef.current = 0;
      setMarkingSlTpState('marking_sl');
      markingSlTpStateRef.current = 'marking_sl';
      setTempSlPrice(null);
      tempSlPriceRef.current = null;
      setCustomMarkersVersion(v => v + 1);
      if (updateTradePriceLinesRef.current) updateTradePriceLinesRef.current();
      if (updateLevelLabelsRef.current) updateLevelLabelsRef.current();
    };
    const handleCustomSlTpUpdated = () => {
      const isReplay = isSimulatorMode || isSimulator;
      const keyMode = isReplay ? 'vortex_replay_stop_mode' : 'vortex_stop_mode';
      const savedMode = typeof window !== 'undefined' ? localStorage.getItem(keyMode) : null;
      if (savedMode && (savedMode === 'pontos' || savedMode === 'nivel' || savedMode === 'grafico' || savedMode === 'copilot' || savedMode === 'range')) {
        setManualTradeMode(savedMode as any);
      }
      if (!isReplay && typeof window !== 'undefined') {
        const savedSizing = localStorage.getItem('vortex_manual_sizing_mode') || localStorage.getItem('vortex_sizing_mode');
        if (savedSizing === 'lote' || savedSizing === 'risco') {
          setManualSizingMode(savedSizing);
        }
        const savedContracts = localStorage.getItem('vortex_manual_contracts');
        if (savedContracts !== null && !isNaN(Number(savedContracts)) && Number(savedContracts) > 0) {
          setManualContracts(Number(savedContracts));
        }
        const savedRisk = localStorage.getItem('vortex_manual_risk_usd');
        if (savedRisk !== null && !isNaN(Number(savedRisk)) && Number(savedRisk) > 0) {
          setManualRiskUsd(Number(savedRisk));
        }
      }
      setCustomMarkersVersion(v => v + 1);
      if (updateTradePriceLinesRef.current) updateTradePriceLinesRef.current();
      if (updateLevelLabelsRef.current) updateLevelLabelsRef.current(true);
    };
    window.addEventListener('vortex_start_marking_sltp', handleStartMarking);
    window.addEventListener('vortex_custom_sltp_updated', handleCustomSlTpUpdated);
    window.addEventListener('vortex_reports_updated', handleCustomSlTpUpdated);
    return () => {
      window.removeEventListener('vortex_start_marking_sltp', handleStartMarking);
      window.removeEventListener('vortex_custom_sltp_updated', handleCustomSlTpUpdated);
      window.removeEventListener('vortex_reports_updated', handleCustomSlTpUpdated);
    };
  }, []);

  const markingSlTpStateRef = useRef(markingSlTpState);
  markingSlTpStateRef.current = markingSlTpState;
  const tempSlPriceRef = useRef(tempSlPrice);
  tempSlPriceRef.current = tempSlPrice;
  const lastChartSelectionTimeRef = useRef<number>(0);
  const handleChartPriceSelectionRef = useRef<((clickY: number) => void) | null>(null);

  const handleChartPriceSelection = useCallback((clickY: number) => {
    const currentState = markingSlTpStateRef.current;
    if (!currentState || !candleSeriesRef.current || !mainContainerRef.current) return;

    // Evita disparo duplo/triplo no mesmo clique/toque (subscribeClick + onClick + touchend)
    const now = Date.now();
    if (now - lastChartSelectionTimeRef.current < 250) return;
    lastChartSelectionTimeRef.current = now;

    const series = candleSeriesRef.current;
    const price = series.coordinateToPrice ? series.coordinateToPrice(clickY) : null;
    if (!price || isNaN(price)) return;

    const cleanPrice = Number(price.toFixed(2));
    const isSim = isSimulatorMode || isSimulator;
    const keySl = isSim ? 'vortex_replay_custom_sl_price' : 'vortex_custom_sl_price';
    const keyTp = isSim ? 'vortex_replay_custom_tp_price' : 'vortex_custom_tp_price';
    const keyMode = isSim ? 'vortex_replay_stop_mode' : 'vortex_stop_mode';

    if (currentState === 'marking_sl') {
      setTempSlPrice(cleanPrice);
      tempSlPriceRef.current = cleanPrice;
      localStorage.setItem(keySl, String(cleanPrice));
      localStorage.removeItem(keyTp);
      localStorage.setItem(keyMode, 'grafico');
      setMarkingSlTpState('marking_tp');
      markingSlTpStateRef.current = 'marking_tp';
      setCustomMarkersVersion(v => v + 1);
      if (updateTradePriceLinesRef.current) updateTradePriceLinesRef.current();
      if (updateLevelLabelsRef.current) updateLevelLabelsRef.current();
      window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated', { detail: { sl: cleanPrice, tp: null } }));
    } else if (currentState === 'marking_tp') {
      const sl = tempSlPriceRef.current || cleanPrice;
      const tp = cleanPrice;

      localStorage.setItem(keySl, String(sl));
      localStorage.setItem(keyTp, String(tp));
      localStorage.setItem(keyMode, 'grafico');

      setMarkingSlTpState(null);
      markingSlTpStateRef.current = null;
      setTempSlPrice(null);
      tempSlPriceRef.current = null;
      setCustomMarkersVersion(v => v + 1);

      if (updateTradePriceLinesRef.current) updateTradePriceLinesRef.current();
      if (updateLevelLabelsRef.current) updateLevelLabelsRef.current();
      window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated', { detail: { sl, tp } }));
    }
  }, [isSimulator, isSimulatorMode]);

  handleChartPriceSelectionRef.current = handleChartPriceSelection;

  const handleChartCanvasClick = (e: React.MouseEvent) => {
    if (!mainContainerRef.current) return;
    const rect = mainContainerRef.current.getBoundingClientRect();
    handleChartPriceSelection(e.clientY - rect.top);
  };

  // Parse, aggregate and sort candles (excluindo velas pós-sessão > 18:00:00 e preservando o candle das 18:00:00)
  const aggregatedCandles = useMemo(() => {
    const cycleEnd = settings?.global_cycle_end || '18:00:00';
    const cycleStart = settings?.global_cycle_start || '19:00:00';
    const sym = activePanel?.symbol || activePanel?.name || settings?.gamma_symbol || instanceId || '';
    const filtered = (candles || []).filter(c =>
      c && c.timestamp && !isCandleInSessionPause(c.timestamp, cycleEnd, cycleStart, sym, settings)
    );
    return aggregateCandles(filtered, timeframe);
  }, [candles, timeframe, settings?.global_cycle_end, settings?.global_cycle_start, settings?.general_prompt_days, activePanel?.symbol, activePanel?.name, settings?.gamma_symbol, instanceId]);

  // Algoritmos no Modo INDICADOR (action === 'alert') ativos para a conta/painel atual
  const activeIndicatorStrategies = useMemo(() => {
    const currentAccountId = activeAccount?.id || null;
    const currentPanelId = activePanel?.id || instanceId;
    const currentPausedIds = pausedStrategyIds || [];

    const indicatorAlgoIds = new Set(
      (activeIndicators || [])
        .filter((i: any) => i.type === 'ALGORITMO' && i.visible !== false && i.params?.strategy_id)
        .map((i: any) => String(i.params.strategy_id))
    );

    const allStrats = [
      ...(customStrategies || []),
      ...(publicStrategies || [])
    ];

    const uniqueMap = new Map<string, any>();
    allStrats.forEach(s => {
      if (s && s.id) uniqueMap.set(String(s.id), s);
    });

    return Array.from(uniqueMap.values()).filter((strat: any) => {
      if (!strat || !strat.id) return false;
      const stratIdStr = String(strat.id);

      // Prioridade 1: Inserido diretamente no catálogo de indicadores do gráfico (tipo ALGORITMO)
      // Se o usuário clicou em "Inserir no Gráfico", deve plotar imediatamente independente de vínculos de conta
      if (indicatorAlgoIds.has(stratIdStr)) return true;

      // Prioridade 2: Modo INDICADOR (action === 'alert') autônomo
      if (strat.action !== 'alert') return false;
      if (currentPausedIds.map(String).includes(stratIdStr)) return false;

      // Verificar correspondência com o painel atual (se configurado)
      const stratTargetPanelId = (strat.panel_id && strat.panel_id !== 'all') 
        ? strat.panel_id 
        : (strat.risk_settings?.target_panel_id || null);
      if (stratTargetPanelId && stratTargetPanelId !== 'all') {
        const targetNorm = stratTargetPanelId.toLowerCase();
        const pName = (activePanel?.name || '').toLowerCase();
        const pSym = (activePanel?.symbol || '').toLowerCase();
        const isMatch = stratTargetPanelId === currentPanelId ||
          stratTargetPanelId === activePanel?.instance_id ||
          (pName && pName === targetNorm) ||
          (pSym && pSym === targetNorm);
        if (!isMatch) return false;
      }

      // Regra de Vínculo com Contas (AGENTS.md):
      const isActive = strat.active !== false && strat.is_active !== false && strat.is_enabled !== false;
      if (!isActive) return false;

      // Se há conta selecionada no gráfico: verificar se está vinculada a ela
      if (currentAccountId) {
        const isLinkedToCurrentAcc = (accountStrategies || []).some(
          (s: any) => String(s.manual_strategy_id) === stratIdStr && s.account_id === currentAccountId && s.is_enabled !== false
        );
        if (isLinkedToCurrentAcc) return true;
      }

      // Se não há conta selecionada ou é modo geral, verifica se há vínculo em qualquer conta ativa
      const isLinkedToAnyActiveAcc = (accounts || []).some((acc: any) =>
        acc.is_active !== false && (accountStrategies || []).some(
          (s: any) => String(s.manual_strategy_id) === stratIdStr && s.account_id === acc.id && s.is_enabled !== false
        )
      );
      return isLinkedToAnyActiveAcc;
    });
  }, [
    customStrategies,
    publicStrategies,
    accountStrategies,
    accounts,
    activeAccount?.id,
    activePanel?.id,
    activePanel?.instance_id,
    activePanel?.name,
    activePanel?.symbol,
    instanceId,
    pausedStrategyIds,
    activeIndicators
  ]);

  // Cache inteligente de sinais históricos de indicadores:
  // Só re-escaneia se o timeframe, lista de robôs, ou o último candle consolidado (fechado) mudar.
  // Protege contra execuções síncronas a cada tick intra-candle (que congelavam a interface).
  const historicalSignalsCacheRef = useRef<{
    cacheKey: string;
    signals: HistoricalIndicatorSignal[];
  }>({ cacheKey: '', signals: [] });

  // Varredura Retrospectiva: calcula os sinais das barras antigas do gráfico para os algoritmos-indicadores
  const historicalIndicatorSignals = useMemo(() => {
    if (isSimulator) return [];
    if (!aggregatedCandles || aggregatedCandles.length < 5 || activeIndicatorStrategies.length === 0) {
      historicalSignalsCacheRef.current = { cacheKey: '', signals: [] };
      return [];
    }

    // Identificador único da barra consolidada (completamente imune a oscilações de preço do candle aberto)
    const closedCount = aggregatedCandles.length - 1;
    const lastClosedCandle = closedCount > 0 ? aggregatedCandles[closedCount - 1] : aggregatedCandles[0];
    const lastClosedTime = lastClosedCandle?.timestamp || (lastClosedCandle as any)?.time || 0;
    const firstCandleTime = aggregatedCandles[0]?.timestamp || (aggregatedCandles[0] as any)?.time || 0;
    const stratKey = activeIndicatorStrategies.map((s: any) => `${s.id}_${s.updated_at || ''}_${s.execution_mode || 'closed'}`).join('|');
    const panelKey = activePanel?.symbol || activePanel?.name || instanceId || '';

    const currentCacheKey = `${panelKey}_tf${timeframe}_strats[${stratKey}]_bars${aggregatedCandles.length}_first${firstCandleTime}_closed${lastClosedTime}`;

    if (historicalSignalsCacheRef.current.cacheKey === currentCacheKey) {
      return historicalSignalsCacheRef.current.signals;
    }

    const signals: HistoricalIndicatorSignal[] = [];
    const barsToScan = Math.min(aggregatedCandles.length, 3000);

    activeIndicatorStrategies.forEach((strat: any) => {
      try {
        const stratSignals = scanHistoricalIndicatorSignals(
          strat,
          aggregatedCandles,
          gammaLevels,
          20,
          barsToScan,
          timeframe
        );
        if (stratSignals && stratSignals.length > 0) {
          signals.push(...stratSignals);
        }
      } catch (err) {
        console.warn(`[CandleChart] Erro na varredura histórica do indicador ${strat.name}:`, err);
      }
    });

    historicalSignalsCacheRef.current = {
      cacheKey: currentCacheKey,
      signals
    };

    return signals;
  }, [aggregatedCandles, activeIndicatorStrategies, gammaLevels, timeframe, activePanel?.symbol, activePanel?.name, instanceId]);

  // Unifica sinais em tempo real com sinais históricos (desduplicando por estratégia e timestamp de vela)
  const combinedIndicatorSignals = useMemo(() => {
    const res = [...(customSignals || [])];
    const seenMap = new Set(res.map((s: any) => `${s.strategyId || ''}_${getChartTimeFromDate(s.time)}`));

    for (const h of historicalIndicatorSignals) {
      const chartT = getChartTimeFromDate(h.time);
      const key = `${h.strategyId || ''}_${chartT}`;
      if (!seenMap.has(key)) {
        seenMap.add(key);
        res.push(h);
      }
    }
    return res;
  }, [customSignals, historicalIndicatorSignals]);

  const currentLivePrice = useMemo(() => {
    if (marketData?.price && marketData.price !== '--' && !isNaN(Number(marketData.price))) {
      return Number(marketData.price);
    }
    if (aggregatedCandles.length > 0) {
      return aggregatedCandles[aggregatedCandles.length - 1].close;
    }
    return 0;
  }, [marketData?.price, aggregatedCandles]);

  const activeTradeInfo = useMemo(() => {
    if (!activeTrade || !currentLivePrice) {
      return {
        pnlDisplay: 'R$ 0,00',
        pnlColorClass: 'text-slate-400',
        ptsDiffDisplay: '0.0 pts',
        side: activeTrade?.side || 'COMPRA',
        contracts: Number(activeTrade?.contrato || (activeTrade as any)?.quantity || 1)
      };
    }
    const entry = activeTrade.entry_price || currentLivePrice;
    const side = activeTrade.side;
    const diff = side === 'COMPRA' ? (currentLivePrice - entry) : (entry - currentLivePrice);
    const contracts = Number(activeTrade.contrato || (activeTrade as any).quantity || 1);
    const pointVal = activePanel?.point_value !== undefined && activePanel?.point_value !== null ? Number(activePanel.point_value) : 1;
    const pnl = diff * contracts * pointVal;

    const isBrl = activeAccount?.currency === 'BRL' || activePanel?.currency === 'BRL' || (activePanel?.name && (activePanel.name.includes('WIN') || activePanel.name.includes('WDO')));
    const sign = pnl > 0 ? '+' : pnl < 0 ? '-' : '';
    const absVal = Math.abs(pnl);
    const formatted = isBrl
      ? `${sign}R$ ${absVal.toFixed(2).replace('.', ',')}`
      : `${sign}$ ${absVal.toFixed(2)}`;
    
    const color = pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-rose-400' : 'text-slate-300';
    const ptsSign = diff > 0 ? '+' : diff < 0 ? '-' : '';
    const ptsFormatted = `${ptsSign}${Math.abs(diff).toFixed(1)} pts`;

    return {
      pnlDisplay: formatted,
      pnlColorClass: color,
      ptsDiffDisplay: ptsFormatted,
      side,
      contracts
    };
  }, [activeTrade, currentLivePrice, activePanel, activeAccount]);

  const axionTrendData = useMemo(() => {
    if (!effectiveShowAxionTrend || !aggregatedCandles || aggregatedCandles.length < 5) return null;
    const rawItems: any[] = [];
    let lastTime = -1;
    for (let i = 0; i < aggregatedCandles.length; i++) {
      const c = aggregatedCandles[i];
      const t = getChartTimeFromDate(c.timestamp);
      if (t <= 0) continue;
      const o = Number(c.open);
      const h = Number(c.high);
      const l = Number(c.low);
      const cl = Number(c.close);
      if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(cl) || o <= 0 || h <= 0 || l <= 0 || cl <= 0) continue;
      const item = {
        time: t,
        timestamp: c.timestamp,
        open: o,
        high: Math.max(o, h, l, cl),
        low: Math.min(o, h, l, cl),
        close: cl,
        volume: c.volume || 0
      };
      if (t === lastTime && rawItems.length > 0) {
        rawItems[rawItems.length - 1] = item;
      } else if (t > lastTime) {
        rawItems.push(item);
        lastTime = t;
      }
    }
    if (rawItems.length < 5) return null;
    return calculateAxionTrend(rawItems, axionTrendIndConfig?.params || {});
  }, [
    aggregatedCandles,
    effectiveShowAxionTrend,
    axionTrendIndConfig
  ]);

  const chartData = useMemo(() => {
    // Preserva sempre as velas na tela; nunca zera o gráfico em atualizações normais em segundo plano
    if (loadingProgress?.isLoading && loadingProgress?.isExplicitDaysChange && (!aggregatedCandles || aggregatedCandles.length === 0)) return [];
    if (!aggregatedCandles || aggregatedCandles.length === 0) return [];

    // Convert to lightweight chart item format and deduplicate in a single pass
    // Usamos getChartTimeFromDate para mapear deterministicamente para o horário de Brasília (UTC-3)
    const unique: any[] = [];
    let lastTime = -1;

    for (let i = 0; i < aggregatedCandles.length; i++) {
      const c = aggregatedCandles[i];
      const t = getChartTimeFromDate(c.timestamp);
      if (t <= 0) continue;

      const o = Number(c.open);
      const h = Number(c.high);
      const l = Number(c.low);
      const cl = Number(c.close);
      if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(cl) || o <= 0 || h <= 0 || l <= 0 || cl <= 0) continue;

      const safeHigh = Math.max(o, h, l, cl);
      const safeLow = Math.min(o, h, l, cl);

      const item = {
        time: t,
        timestamp: c.timestamp,
        open: o,
        high: safeHigh,
        low: safeLow,
        close: cl,
        volume: c.volume || 0
      };

      if (t === lastTime && unique.length > 0) {
        unique[unique.length - 1] = item;
      } else if (t > lastTime) {
        unique.push(item);
        lastTime = t;
      }
    }

    if (effectiveShowAxionTrendColorBars && axionTrendData?.candleColorMap) {
      const colorMap = axionTrendData.candleColorMap;
      const axionColored = unique.map(item => {
        const cColor = colorMap[item.time] || '#64748b';
        return {
          ...item,
          color: cColor,
          borderColor: cColor,
          wickColor: cColor
        };
      });
      return sanitizeCandleSeriesData(axionColored);
    }

    if (!effectiveShowPva) {
      return sanitizeCandleSeriesData(unique);
    }

    // Apply PVA climax candle colors
    const pvaColored = unique.map((item, index) => {
      const isBullish = item.close >= item.open;
      if (index < 10) {
        return item;
      }

      // 10 candles anteriores (exclui o atual)
      let sumVol = 0;
      let highestVolumeRange = 0;
      const startIdx = index - 10;
      for (let j = startIdx; j < index; j++) {
        const c = unique[j];
        const vol = c.volume || 0;
        sumVol += vol;
        const range = vol * (c.high - c.low);
        if (range > highestVolumeRange) {
          highestVolumeRange = range;
        }
      }
      const avgVol = sumVol / 10;

      const currentVol = item.volume || 0;
      const currentVolumeRange = currentVol * (item.high - item.low);

      const isClimax = (currentVolumeRange >= highestVolumeRange) || (currentVol >= avgVol * 2.0);

      if (isClimax) {
        // Cores PVA Clímax: Verde para alta, Magenta/Vermelho para baixa
        const color = isBullish ? '#22c55e' : '#f43f5e';
        return {
          ...item,
          color,
          borderColor: color,
          wickColor: color
        };
      } else {
        // Cores PVSRA para velas normais: Tons neutros de cinza/ardósia mais claros
        const color = isBullish ? '#64748b' : '#334155';
        return {
          ...item,
          color,
          borderColor: color,
          wickColor: color
        };
      }
    });

    return sanitizeCandleSeriesData(pvaColored);
  }, [aggregatedCandles, effectiveShowPva, effectiveShowAxionTrendColorBars, axionTrendData, loadingProgress?.isLoading]);

  useEffect(() => {
    chartDataRef.current = chartData;
    if (typeof window !== 'undefined') {
      (window as any).__vortex_active_chart_candles = chartData;
    }
    syncBlockTradesToCandles();
  }, [chartData]);

  // Monitoramento e Execução Automática de Gatilhos de Desenhos (Reversão / Rompimento)
  useEffect(() => {
    if (!drawings || drawings.length === 0 || !chartData || chartData.length === 0) return;
    const latestCandle = chartData[chartData.length - 1];
    const prevCandle = chartData.length > 1 ? chartData[chartData.length - 2] : undefined;
    if (!latestCandle) return;

    drawings.forEach(async (drawing) => {
      if (!drawing.trigger || !drawing.trigger.enabled || drawing.trigger.status !== 'armed') return;

      const evalRes = evaluateDrawingTrigger(drawing, latestCandle as any, prevCandle as any);
      if (evalRes && evalRes.triggered) {
        // Validação de Confirmação do Painel
        if (evalRes.requireConfirmation) {
          const isBullish = forces && forces.length > 0 && forces[0]?.buy > forces[0]?.sell;
          const isBearish = forces && forces.length > 0 && forces[0]?.sell > forces[0]?.buy;
          if (evalRes.side === 'COMPRA' && isBearish) {
            console.log('[DESENHO TRIGGER] Compra bloqueada: painel em confluência baixista.');
            return;
          }
          if (evalRes.side === 'VENDA' && isBullish) {
            console.log('[DESENHO TRIGGER] Venda bloqueada: painel em confluência altista.');
            return;
          }
        }

        // 1. Desativação imediata (One-Shot Trigger - Sempre desarma ao tocar)
        const updated: DrawingItem = {
          ...drawing,
          trigger: {
            ...drawing.trigger,
            status: 'triggered',
            lastTriggeredAt: new Date().toISOString()
          }
        };
        if (onUpdateDrawing) {
          onUpdateDrawing(updated);
        }

        // 2. Validação de Gestão de Risco Global da Conta
        if (checkOperationalLimits && activeAccount) {
          const opCheck = await checkOperationalLimits(activePanel?.id, undefined, activeAccount, false);
          if (!opCheck.allowed) {
            console.log(`[DESENHO TRIGGER] Bloqueado por gestão de risco na conta ${activeAccount.account_name}: ${opCheck.reason}. Gatilho desarmado.`);
            if (addLog) {
              addLog('ROBÔ', `⚠️ Gatilho ${evalRes.description} desarmado sem abrir ordem [Conta: ${activeAccount.account_name}]: ${opCheck.reason}`, 'alerta');
            }
            return;
          }
        }

        // 3. Regra de Posição Única por Ativo na Conta
        const currentSymbol = activePanel?.name || 'NQ';
        const hasOpenPosInAsset = (reports || []).some((r: any) => 
          r.status === 'Em Andamento' &&
          String(r.account_id) === String(activeAccount?.id) &&
          (r.panel_id === activePanel?.id || (r.description && r.description.includes(currentSymbol)) || r.instance_id === activePanel?.instance_id)
        );

        if (hasOpenPosInAsset) {
          console.log(`[DESENHO TRIGGER] Bloqueado: Conta ${activeAccount?.account_name} já possui ordem em andamento no ativo ${currentSymbol}. Gatilho desarmado.`);
          if (addLog) {
            addLog('ROBÔ', `⚠️ Gatilho ${evalRes.description} desarmado [Conta: ${activeAccount?.account_name}]: Conta já possui posição aberta no ativo ${currentSymbol}.`, 'alerta');
          }
          return;
        }

        // 4. Disparo da ordem para a conta ativa
        if (createReportAction && activeAccount) {
          try {
            const manualStratId = getAccountManualStrategyId(activeAccount);
            const entryPrice = Number(evalRes.price || latestCandle.close);
            const targetPanelForAcc = activePanel;
            const panelSettings = targetPanelForAcc ? (allSettings?.[targetPanelForAcc.id] || settings) : settings;
            const pointVal = targetPanelForAcc?.point_value !== undefined && targetPanelForAcc?.point_value !== null ? Number(targetPanelForAcc.point_value) : 1.0;

            const mgmt = calculateTradeManagement({
              side: evalRes.side,
              entryPrice,
              drawingTrigger: drawing.trigger,
              panelSettings,
              globalSettings: settings,
              gammaLevels: gammaLevelsProp || contextGammaLevels,
              pointValue: pointVal
            });

            let orderCreated = false;

            if (mgmt.isATMActive && mgmt.activeATM && mgmt.activeATM.brackets) {
              // Execução via Estratégia ATM configurada na Boleta
              for (let idx = 0; idx < mgmt.activeATM.brackets.length; idx++) {
                const bracket = mgmt.activeATM.brackets[idx];
                const bSlPts = bracket.stopLossPts;
                const bTpPts = bracket.takeProfitPts;
                const bSlPrice = evalRes.side === 'COMPRA' ? entryPrice - bSlPts : entryPrice + bSlPts;
                const bTpPrice = evalRes.side === 'COMPRA' ? entryPrice + bTpPts : entryPrice - bTpPts;

                const beStr = bracket.autoBreakevenEnabled ? ` | BE: ${bracket.autoBreakevenTriggerPts}+${bracket.autoBreakevenOffsetPts}` : '';
                const trailStr = bracket.trailingStopEnabled ? ` | TRAIL: ${bracket.trailingStopTriggerPts}/${bracket.trailingStopStepPts}` : '';

                const res = await createReportAction({
                  strategy_id: manualStratId,
                  strategy_name: mgmt.activeATM.brackets.length > 1 ? `${evalRes.description} (Alvo ${idx + 1})` : evalRes.description,
                  instance_id: activePanel?.instance_id || 'painel_principal',
                  side: evalRes.side,
                  entry_price: entryPrice,
                  stop_loss: Number(bSlPrice.toFixed(2)),
                  take_profit: Number(bTpPrice.toFixed(2)),
                  exit_price: null,
                  status: 'Em Andamento',
                  description: `[${currentSymbol}] ${evalRes.description} - ${mgmt.activeATM.name} (${bracket.quantity}x - SL: ${bSlPts}pt / TP: ${bTpPts}pt${beStr}${trailStr})`,
                  panel_id: activePanel?.id || null,
                  contrato: bracket.quantity,
                  account_id: activeAccount?.id || null,
                  is_atm: true,
                  allow_multi: true
                } as any);
                if (res) orderCreated = true;
              }
            } else {
              // Execução via Gestão Boleta (Pontos ou Nível / Lote Fixo ou Risco $)
              const contracts = mgmt.contracts;
              const slPrice = mgmt.slPrice;
              const tpPrice = mgmt.tpPrice;

              const res = await createReportAction({
                strategy_id: manualStratId,
                strategy_name: evalRes.description,
                instance_id: activePanel?.instance_id || 'painel_principal',
                side: evalRes.side,
                entry_price: entryPrice,
                stop_loss: slPrice,
                take_profit: tpPrice,
                exit_price: null,
                status: 'Em Andamento',
                description: `${evalRes.description} (${contracts}x @ ${entryPrice.toFixed(2)})`,
                panel_id: activePanel?.id || null,
                contrato: contracts,
                account_id: activeAccount?.id || null
              });
              if (res) orderCreated = true;
            }

            if (addLog) {
              addLog(
                'ROBÔ',
                `⚡ Gatilho de Desenho Executado: ${evalRes.description} -> Ordem de ${evalRes.side} @ ${entryPrice.toFixed(2)}`,
                'sistema'
              );
            }

            // Exclui imediatamente o elemento desenhado do gráfico para entrada única se criou ordem
            if (orderCreated && onDeleteDrawing) {
              onDeleteDrawing(drawing.id);
            }
          } catch (err: any) {
            console.error('[DESENHO TRIGGER] Erro ao enviar ordem do desenho:', err);
          }
        }
      }
    });
  }, [chartData, drawings, activeAccount, activePanel, forces, createReportAction, onUpdateDrawing, onDeleteDrawing, addLog]);

  const sma9Data = useMemo(() => {
    if (!effectiveShowSma9 || chartData.length < 1) return [];
    const closeData = chartData.map(d => ({ time: d.time, close: d.close }));
    return calculateSMA(closeData, 8);
  }, [chartData.length, chartData[chartData.length - 1]?.close, effectiveShowSma9]);

  const ema21Data = useMemo(() => {
    if (!effectiveShowEma21 || chartData.length < 1) return [];
    const closeData = chartData.map(d => ({ time: d.time, close: d.close }));
    return calculateSMA(closeData, 20);
  }, [chartData.length, chartData[chartData.length - 1]?.close, effectiveShowEma21]);

  const ema50Data = useMemo(() => {
    if (!effectiveShowEma50 || chartData.length < 1) return [];
    const closeData = chartData.map(d => ({ time: d.time, close: d.close }));
    return calculateSMA(closeData, 50);
  }, [chartData.length, chartData[chartData.length - 1]?.close, effectiveShowEma50]);

  const rsiData = useMemo(() => {
    if (!effectiveShowRsi || chartData.length < 1) return [];
    const closeData = chartData.map(d => ({ time: d.time, close: d.close }));
    return calculateRSI(closeData, 14);
  }, [chartData.length, chartData[chartData.length - 1]?.close, effectiveShowRsi]);

  const macdConfig = useMemo(() => {
    return (activeIndicators || []).find(i => i.type === 'MACD');
  }, [activeIndicators]);

  const macdFastPeriod = Number(macdConfig?.params?.fastPeriod || 12);
  const macdSlowPeriod = Number(macdConfig?.params?.slowPeriod || 26);
  const macdSignalPeriod = Number(macdConfig?.params?.signalPeriod || 9);
  const showMacdDivergence = macdConfig?.params?.showDivergence !== false;
  const macdDivergenceMode = (macdConfig?.params?.divergenceMode as any) || 'swing_pivots';
  const macdDivergenceMinBars = Number(macdConfig?.params?.divergenceMinBars || 5);
  const macdDivergenceLookback = Number(macdConfig?.params?.divergenceLookback || 60);
  const showMacdDivergenceOnPrice = macdConfig?.params?.showDivergenceOnPrice !== false;
  const macdDivergenceConfirmationBars = Number(macdConfig?.params?.divergenceConfirmationBars ?? 2);
  const macdDivergenceOnlyClosedBars = macdConfig?.params?.divergenceOnlyClosedBars !== false;

  const prevMacdDivModeRef = useRef<string>(macdDivergenceMode);
  useEffect(() => {
    if (prevMacdDivModeRef.current !== macdDivergenceMode) {
      prevMacdDivModeRef.current = macdDivergenceMode;
      confirmedMacdDivergencesRef.current.clear();
    }
  }, [macdDivergenceMode]);

  const macdData = useMemo(() => {
    if (!effectiveShowMacd || chartData.length < macdSlowPeriod) return null;
    const closeData = chartData.map(d => ({ time: d.time, close: d.close }));
    return calculateMACD(closeData, macdFastPeriod, macdSlowPeriod, macdSignalPeriod);
  }, [chartData.length, chartData[chartData.length - 1]?.close, effectiveShowMacd, macdFastPeriod, macdSlowPeriod, macdSignalPeriod]);

  const macdDivergences = useMemo(() => {
    if (!effectiveShowMacd || !showMacdDivergence || !macdData || !macdData.histogram || macdData.histogram.length < 15) return [];
    const freshlyCalculated = calculateMACDDivergences(
      chartData,
      macdData.histogram,
      macdDivergenceLookback,
      macdDivergenceMinBars,
      macdDivergenceConfirmationBars,
      macdDivergenceOnlyClosedBars,
      macdDivergenceMode
    );

    // Merge into persistent confirmed store (Anti-Repaint)
    const store = confirmedMacdDivergencesRef.current;
    freshlyCalculated.forEach(div => {
      if (div && div.id) {
        store.set(div.id, div);
      }
    });

    // Prune divergences that fall completely outside the chart history window
    if (chartData.length > 0) {
      const minChartTime = chartData[0].time;
      for (const [id, div] of store.entries()) {
        if (div.t2 < minChartTime) {
          store.delete(id);
        }
      }
    }

    return Array.from(store.values());
  }, [
    effectiveShowMacd,
    showMacdDivergence,
    macdData,
    chartData,
    macdDivergenceMode,
    macdDivergenceLookback,
    macdDivergenceMinBars,
    macdDivergenceConfirmationBars,
    macdDivergenceOnlyClosedBars
  ]);

  const emacdData = useMemo(() => {
    if (!effectiveShowEMacd || chartData.length < 30) return null;
    return calculateEMACD(chartData);
  }, [chartData.length, chartData[chartData.length - 1]?.close, effectiveShowEMacd]);

  const closedCandlesCount = chartData.length;
  const lastClosedBar = chartData.length >= 2 ? chartData[chartData.length - 2] : (chartData[0] || null);
  const lastClosedBarTime = lastClosedBar ? lastClosedBar.time : 0;
  const lastClosedBarClose = lastClosedBar ? lastClosedBar.close : 0;

  const closedMarketDataRef = useRef<any>(marketData);
  useEffect(() => {
    // Congelar e atualizar snapshot de marketData no fechamento de cada candle
    if (marketData) {
      closedMarketDataRef.current = { ...marketData };
    }
  }, [lastClosedBarTime]);

  const timeHeatmapData = useMemo(() => {
    if (!effectiveShowTimeHeatmap || !chartData || chartData.length === 0) return null;
    const indConfig = (activeIndicators || []).find(i => i.type === 'TIME_HEATMAP' && i.visible);
    const paramsToUse = indConfig?.params || {};
    const sysStart = settings?.global_cycle_start || settings?.session1_start || '20:00:00';

    const latestPrice = chartData[chartData.length - 1]?.close || lastClosedBarClose || 0;

    return calculateTimeHeatmap(
      chartData as any,
      paramsToUse,
      {
        systemSessionStart: sysStart,
        marketContext: {
          currentPrice: latestPrice,
          marketData: closedMarketDataRef.current || marketData,
          gammaLevels: effectiveShowGamma ? (gammaLevelsProp || gammaLevels) : undefined,
          volumeProfile: (activeIndicators?.some(i => (i.type === 'VOLUME_LEVELS' || i.type === 'VOLUME_HEATMAP' || i.type === 'VOLUME_PROFILE') && i.visible))
            ? volumeAnalysisResultsRef.current?.levels?.result?.levels
            : undefined,
          hvnBlocks: (activeIndicators?.some(i => i.type === 'VOLUME_HVN_BLOCKS' && i.visible))
            ? (volumeAnalysisResultsRef.current?.hvnBlocks?.result?.hvnBlocks as any[])
            : undefined,
          activeIndicators,
          activeWidgets: activeWidgetsProp,
          forces,
          panelIndicators: {
            showSma9: effectiveShowSma9,
            showEma21: effectiveShowEma21,
            showEma50: effectiveShowEma50,
            showRsi: effectiveShowRsi,
            showMacd: effectiveShowMacd,
            showPva: effectiveShowPva,
            showEMacd: effectiveShowEMacd,
            showFvg: effectiveShowFvg
          },
          effectiveShowGamma
        }
      }
    );
  }, [
    closedCandlesCount,
    lastClosedBarTime,
    lastClosedBarClose,
    activeIndicators,
    activeWidgetsProp,
    forces,
    effectiveShowTimeHeatmap,
    settings?.global_cycle_start,
    settings?.session1_start,
    effectiveShowGamma,
    gammaLevelsProp,
    gammaLevels,
    effectiveShowSma9,
    effectiveShowEma21,
    effectiveShowEma50,
    effectiveShowRsi,
    effectiveShowMacd,
    effectiveShowPva,
    effectiveShowEMacd,
    effectiveShowFvg,
    panelIndicators
  ]);

  useEffect(() => {
    if (timeHeatmapData) {
      timeHeatmapResultsRef.current = [timeHeatmapData];
    } else {
      timeHeatmapResultsRef.current = [];
    }
    if (updateLevelLabelsRef.current) {
      updateLevelLabelsRef.current();
    }
  }, [timeHeatmapData]);

  // Função para aplicar dados nas séries do gráfico Momentum Matrix
  const updateMomentumMatrixSeriesOnChart = useCallback((data: MomentumMatrixProcessedSeries | null) => {
    if (!momentumMatrixChartRef.current || !data) return;
    try {
      if (momentumFxFlowSeriesRef.current) {
        momentumFxFlowSeriesRef.current.setData(sanitizeLineSeriesData(data.fxFlow || []));
      }
      if (momentumCombinedIndicesSeriesRef.current) {
        momentumCombinedIndicesSeriesRef.current.setData(sanitizeLineSeriesData(data.combinedIndices || []));
      }
      if (momentumCombinedStocksSeriesRef.current) {
        momentumCombinedStocksSeriesRef.current.setData(sanitizeLineSeriesData(data.combinedStocks || []));
      }
      if (momentumEurJpySeriesRef.current) {
        momentumEurJpySeriesRef.current.setData(sanitizeLineSeriesData(data.eurjpy || []));
      }
      if (momentumUsdJpySeriesRef.current) {
        momentumUsdJpySeriesRef.current.setData(sanitizeLineSeriesData(data.usdjpy || []));
      }
      if (momentumEurUsdSeriesRef.current) {
        momentumEurUsdSeriesRef.current.setData(sanitizeLineSeriesData(data.eurusd || []));
      }
      if (momentumVixSeriesRef.current) {
        momentumVixSeriesRef.current.setData(sanitizeLineSeriesData(data.vix || []));
      }
      if (momentumDxySeriesRef.current) {
        momentumDxySeriesRef.current.setData(sanitizeLineSeriesData(data.dxy || []));
      }
      if (momentumNqSeriesRef.current) {
        momentumNqSeriesRef.current.setData(sanitizeLineSeriesData(data.nq || []));
      }
      if (momentumEsSeriesRef.current) {
        momentumEsSeriesRef.current.setData(sanitizeLineSeriesData(data.es || []));
      }
      // Séries individuais das 7 ações
      const techPool = momentumIndividualTechPoolRef.current;
      if (techPool) {
        const keys: (keyof MomentumMatrixProcessedSeries)[] = ['nvidia', 'microsoft', 'apple', 'amazon', 'alphabet', 'meta', 'tesla'];
        keys.forEach(k => {
          const s = techPool.get(k);
          if (s) {
            s.setData(sanitizeLineSeriesData((data[k] as any[]) || []));
          }
        });
      }
    } catch (err) {
      console.warn('[CandleChart] Erro ao aplicar dados nas séries de Momentum Matrix:', err);
    }
  }, []);

  const forcesRef = useRef(forces);
  useEffect(() => {
    forcesRef.current = forces;
  }, [forces]);

  const momentumMatrixIndConfigRef = useRef(momentumMatrixIndConfig);
  useEffect(() => {
    momentumMatrixIndConfigRef.current = momentumMatrixIndConfig;
  }, [momentumMatrixIndConfig]);

  // Efeito para carregar histórico e sincronizar dados a cada 1m do MOMENTUM_CONFLUENCE
  useEffect(() => {
    if (!effectiveShowMomentumMatrix) {
      momentumMatrixDataRef.current = null;
      return;
    }

    let isDisposed = false;
    const targetInstId = settings?.instance_id_force || 'painel_principal_web';

    const loadMomentumHistory = async () => {
      try {
        console.log('[MOMENTUM_MATRIX] Buscando histórico 1m para:', targetInstId);
        let rows = await fetchForces1mHistorySupabase(targetInstId, 1000);
        console.log('[MOMENTUM_MATRIX] Linhas recebidas de nasdaq_force:', rows ? rows.length : 0);

        if (isDisposed) return;

        const currentCandles = chartDataRef.current || [];
        const currentParams = momentumMatrixIndConfigRef.current?.params;
        const currentForces = forcesRef.current;

        const processed = processMomentumMatrixSeries(rows || [], currentParams, currentCandles, currentForces);
        (processed as any)._rawRows = rows || [];
        momentumMatrixDataRef.current = processed;

        if (processed.latestSnapshot) {
          setMomentumMatrixSnapshot(processed.latestSnapshot);
        }
        updateMomentumMatrixSeriesOnChart(processed);
      } catch (err) {
        console.error('[CandleChart] Erro ao carregar histórico de momentum_matrix:', err);
      }
    };

    loadMomentumHistory();

    // Polling a cada 10 segundos para atualizar as séries com o novo minuto consolidado
    const pollTimer = setInterval(() => {
      if (!isDisposed) {
        loadMomentumHistory();
      }
    }, 10000);

    return () => {
      isDisposed = true;
      clearInterval(pollTimer);
    };
  }, [
    effectiveShowMomentumMatrix,
    settings?.instance_id_force,
    updateMomentumMatrixSeriesOnChart
  ]);

  // Sincronização em tempo real do snapshot com base nas forças ao vivo (entre ciclos de 1m)
  useEffect(() => {
    if (!effectiveShowMomentumMatrix || !forces || !Array.isArray(forces) || forces.length === 0) return;
    const rawRows = (momentumMatrixDataRef.current as any)?._rawRows || [];
    const p = momentumMatrixIndConfigRef.current?.params;
    const currentCandles = chartDataRef.current || [];
    const processed = processMomentumMatrixSeries(rawRows, p, currentCandles, forces);
    (processed as any)._rawRows = rawRows;
    if (processed.latestSnapshot) {
      setMomentumMatrixSnapshot(processed.latestSnapshot);
    }
  }, [forces, effectiveShowMomentumMatrix]);

  const fvgSeriesData = useMemo(() => {
    if (!effectiveShowFvg || chartData.length < 3) return { up: [], down: [] };

    // extendUntil: 1, barsToExtend: 10, minimumTicks: 1, enforceSameDirection: false, tickSize: 1.0 (defaults as per NinjaTrader code defaults)
    const gaps = calculateFVGs(chartData, 1, 1.0, 1, 10, false);
    
    // We filter active (unfilled) gaps so that older gaps continue to draw continuously alongside newer gaps
    const recentUpGaps = gaps.filter(g => g.isUp).slice(-15);
    const recentDownGaps = gaps.filter(g => !g.isUp).slice(-15);

    const upSeriesList: any[][] = recentUpGaps.map(gap => {
      const candleData = [];
      const start = gap.startIndex;
      const end = gap.isFilled && gap.endIndex !== -1 ? Math.min(gap.endIndex, chartData.length - 1) : chartData.length - 1;
      const topVal = gap.top;
      const bottomVal = gap.bottom;
      for (let k = start; k <= end; k++) {
        if (chartData[k]) {
          candleData.push({
            time: chartData[k].time,
            open: topVal,
            high: topVal,
            low: bottomVal,
            close: bottomVal
          });
        }
      }
      return candleData;
    });

    const downSeriesList: any[][] = recentDownGaps.map(gap => {
      const candleData = [];
      const start = gap.startIndex;
      const end = gap.isFilled && gap.endIndex !== -1 ? Math.min(gap.endIndex, chartData.length - 1) : chartData.length - 1;
      const topVal = gap.top;
      const bottomVal = gap.bottom;
      for (let k = start; k <= end; k++) {
        if (chartData[k]) {
          candleData.push({
            time: chartData[k].time,
            open: topVal,
            high: topVal,
            low: bottomVal,
            close: bottomVal
          });
        }
      }
      return candleData;
    });

    return { up: upSeriesList, down: downSeriesList };
  }, [chartData, effectiveShowFvg]);

  const [localAutoCenter, setLocalAutoCenter] = useState<boolean>(false);
  const autoCenter = autoCenterProp !== undefined ? autoCenterProp : localAutoCenter;
  const setAutoCenter = setAutoCenterProp !== undefined ? setAutoCenterProp : setLocalAutoCenter;

  const currentPanelKey = activePanel?.id || instanceId || 'main';

  // Detect asset/panel change and cleanly reset view and scaling for the new asset
  useEffect(() => {
    if (lastPanelKeyRef.current !== null && lastPanelKeyRef.current !== currentPanelKey) {
      isFirstDataLoadRef.current = true;
      isHistoryPlottedRef.current = false;
      lastChartDataLengthRef.current = 0;
      lastChartDataTimeRef.current = 0;
      lastRecentCandlesRef.current = '';
      lastAppliedLevelsKeyRef.current = '';
      lastAppliedMarkersStrRef.current = '';
      currentPriceRef.current = null;
      autoCenterHalfSpanRef.current = null;
      lastSmaCountRef.current = 0;
      lastEma21CountRef.current = 0;
      lastEma50CountRef.current = 0;
      lastRsiCountRef.current = 0;
      lastMacdCountRef.current = 0;
      lastEmacdHistCountRef.current = 0;
      confirmedMacdDivergencesRef.current.clear();

      if (candleSeriesRef.current) {
        activePriceLinesRef.current.forEach(line => {
          try { candleSeriesRef.current?.removePriceLine(line); } catch (_) {}
        });
        activePriceLinesRef.current = [];
        tradePriceLinesMapRef.current.clear();
        try { candleSeriesRef.current.setData([]); } catch (_) {}
      }

      if (mainChartRef.current) {
        try {
          mainChartRef.current.priceScale('right').applyOptions({
            autoScale: true,
            scaleMargins: {
              top: 0.06,
              bottom: 0.06,
            },
          });
        } catch (_) {}
      }
    }
    lastPanelKeyRef.current = currentPanelKey;
  }, [currentPanelKey]);

  const centerChart = useCallback(() => {
    if (mainChartRef.current) {
      try {
        autoCenterHalfSpanRef.current = null;
        mainChartRef.current.priceScale('right').applyOptions({
          autoScale: true,
          scaleMargins: {
            top: 0.06,
            bottom: 0.06,
          },
        });
        mainChartRef.current.timeScale().scrollToRealTime();
      } catch (err) {
        console.error('Error centering chart:', err);
      }
    }
  }, []);

  useEffect(() => {
    autoCenterRef.current = autoCenter;
    autoCenterHalfSpanRef.current = null;
    if (mainChartRef.current && autoCenter) {
      try {
        mainChartRef.current.priceScale('right').applyOptions({
          autoScale: true,
          scaleMargins: {
            top: 0.06,
            bottom: 0.06,
          },
        });
      } catch (_) {}
    }
  }, [autoCenter]);

  // Recalcular autoCenter e escala de candles proporcionalmente quando subpainéis forem adicionados ou removidos
  useEffect(() => {
    if (autoCenterRef.current && mainChartRef.current) {
      autoCenterHalfSpanRef.current = null;
      try {
        mainChartRef.current.priceScale('right').applyOptions({
          autoScale: true,
          scaleMargins: {
            top: 0.06,
            bottom: 0.06,
          },
        });
      } catch (_) {}
    }
  }, [effectiveShowRsi, effectiveShowMacd, effectiveShowEMacd, effectiveShowTimeHeatmap]);

  useEffect(() => {
    if (fitChartTrigger && mainChartRef.current) {
      applySavedViewport(true);
    }
  }, [fitChartTrigger, applySavedViewport]);

  useEffect(() => {
    if (resetViewTrigger && mainChartRef.current) {
      if (lastViewportStateRef.current) {
        lastViewportStateRef.current.isScrolledLeft = false;
        lastViewportStateRef.current.offsetFromEnd = 0;
      }
      try {
        sessionStorage.removeItem(`vortex_viewport_${panelKey}`);
      } catch (_) {}
      applySavedViewport(true);
    }
  }, [resetViewTrigger, applySavedViewport, panelKey]);

  useEffect(() => {
    const lastCandle = chartDataRef.current.length > 0 ? chartDataRef.current[chartDataRef.current.length - 1] : null;
    const lastPrice = lastCandle ? lastCandle.close : null;
    let resolvedPrice = marketData?.price && marketData.price !== '--' ? Number(marketData.price) : lastPrice;
    if (simulatedPrice !== undefined && simulatedPrice > 0) {
      resolvedPrice = simulatedPrice;
    }
    currentPriceRef.current = resolvedPrice;

    // Diretriz de Segurança e Estabilidade:
    // O candle corrente só dispara plotagem/atualização APÓS o carregamento e plotagem consolidada do histórico!
    if (!isHistoryPlottedRef.current || chartDataRef.current.length < 2 || loadingProgress?.isLoading) {
      return;
    }

    if (!resolvedPrice || isNaN(resolvedPrice) || resolvedPrice <= 0 || !candleSeriesRef.current || !lastCandle) {
      return;
    }

    // Proteção contra salto anômalo (> 8%) durante troca de ativo ou dessincronia temporária
    if (lastCandle.close > 0 && Math.abs(resolvedPrice - lastCandle.close) / lastCandle.close > 0.08) {
      return;
    }

    // Modo Simulador / Replay: sincronizado diretamente pelo motor de replay
    if (isSimulator) {
      const openPrice = Number(lastCandle.open) || resolvedPrice;
      const updatedLast = {
        ...lastCandle,
        close: resolvedPrice,
        high: Math.max(Number(lastCandle.high || openPrice), resolvedPrice),
        low: Math.min(Number(lastCandle.low || openPrice), resolvedPrice)
      };
      try {
        candleSeriesRef.current.update(updatedLast);
        if (chartDataRef.current && chartDataRef.current.length > 0) {
          chartDataRef.current[chartDataRef.current.length - 1] = updatedLast;
        }
      } catch (_) {}
      return;
    }

    // Identificação do tempo da barra em segundos
    const tfMin = Math.max(1, timeframe || 1);
    const bucketSec = tfMin * 60;

    const lastCandleTimeSec = typeof lastCandle.time === 'number'
      ? lastCandle.time
      : (lastCandle.timestamp ? getChartTimeFromDate(lastCandle.timestamp) : 0);

    // Determina o horário de referência do tick atual (via timestamp da cotação ou relógio sincronizado)
    let tickSec = 0;
    if (marketData?.updated_at) {
      const parsed = parseInputToDate(marketData.updated_at);
      if (parsed && !isNaN(parsed.getTime()) && parsed.getTime() > 0) {
        tickSec = Math.floor(parsed.getTime() / 1000);
      }
    }
    if (!tickSec || isNaN(tickSec) || tickSec <= 0) {
      tickSec = Math.floor(Date.now() / 1000);
    }

    const currentBucketSec = Math.floor(tickSec / bucketSec) * bucketSec;

    // REGRA DE OURO INVIOLÁVEL: CANDLE FECHADO É SAGRADO E NUNCA PODE SER MUTADO!
    // Se o último candle do array possui tempo anterior ao bucket corrente (currentBucketSec > lastCandleTimeSec),
    // ele é um candle já consolidado/fechado. Jamais deve sofrer alteração de open, high, low ou close.
    if (currentBucketSec === lastCandleTimeSec) {
      // Caso 1: O último candle do array é de fato a vela em formação do minuto corrente.
      // Atualizamos seu close, high e low em tempo real
      const openPrice = Number(lastCandle.open) || resolvedPrice;
      const isBullish = resolvedPrice >= openPrice;
      const updatedCurrent: any = {
        ...lastCandle,
        time: lastCandleTimeSec,
        close: resolvedPrice,
        high: Math.max(Number(lastCandle.high || openPrice), resolvedPrice),
        low: Math.min(Number(lastCandle.low || openPrice), resolvedPrice)
      };
      if (effectiveShowAxionTrendColorBars && axionTrendData?.last) {
        const cColor = axionTrendData.last.candleColor || '#64748b';
        updatedCurrent.color = cColor;
        updatedCurrent.borderColor = cColor;
        updatedCurrent.wickColor = cColor;
      } else if (effectiveShowPva && !lastCandle.isClimax) {
        const normalColor = isBullish ? '#64748b' : '#334155';
        updatedCurrent.color = normalColor;
        updatedCurrent.borderColor = normalColor;
        updatedCurrent.wickColor = normalColor;
      }
      try {
        candleSeriesRef.current.update(updatedCurrent);
        if (chartDataRef.current && chartDataRef.current.length > 0) {
          chartDataRef.current[chartDataRef.current.length - 1] = updatedCurrent;
        }
      } catch (_) {}
    } else if (currentBucketSec > lastCandleTimeSec) {
      // Caso 2: Virou o minuto! O candle anterior fechou e está CONGELADO / IMUTÁVEL.
      // Instancia a nova vela em formação para o minuto corrente (apenas se gap for recente <= 3 barras)
      const gapBars = Math.floor((currentBucketSec - lastCandleTimeSec) / bucketSec);
      if (gapBars <= 3) {
        const isBullish = true;
        const newCandle: any = {
          time: currentBucketSec,
          timestamp: new Date(currentBucketSec * 1000).toISOString(),
          open: resolvedPrice,
          high: resolvedPrice,
          low: resolvedPrice,
          close: resolvedPrice,
          volume: 0
        };
        if (effectiveShowAxionTrendColorBars && axionTrendData?.last) {
          const cColor = axionTrendData.last.candleColor || '#64748b';
          newCandle.color = cColor;
          newCandle.borderColor = cColor;
          newCandle.wickColor = cColor;
        } else if (effectiveShowPva) {
          const normalColor = isBullish ? '#64748b' : '#334155';
          newCandle.color = normalColor;
          newCandle.borderColor = normalColor;
          newCandle.wickColor = normalColor;
        }
        try {
          candleSeriesRef.current.update(newCandle);
          chartDataRef.current.push(newCandle);
        } catch (_) {}
      }
    }

    if (autoCenterRef.current && mainChartRef.current) {
      try {
        mainChartRef.current.priceScale('right').applyOptions({
          autoScale: true,
          scaleMargins: {
            top: 0.06,
            bottom: 0.06,
          },
        });
      } catch (_) {}
    }
  }, [marketData?.price, marketData?.updated_at, simulatedPrice, timeframe, effectiveShowPva]);

  const updateLevelLabelsRef = useRef<((immediate?: boolean) => void) | null>(null);
  const showOrderLinesRef = useRef<boolean>(showOrderLines);
  showOrderLinesRef.current = showOrderLines;
  useEffect(() => {
    if (updateTradePriceLinesRef.current) updateTradePriceLinesRef.current();
    if (updateLevelLabelsRef.current) updateLevelLabelsRef.current(true);
  }, [showOrderLines]);
  const drawingsRedrawRef = useRef<(() => void) | null>(null);
  const rafLabelsRef = useRef<number | null>(null);
  const labelsPoolRef = useRef<Map<string, HTMLElement>>(new Map());
  const newsPoolRef = useRef<Map<string, HTMLElement>>(new Map());

  // Pré-cálculo memoizado de Níveis Diários da Sessão Anterior (evita varrer 1500+ candles a cada frame de pan/zoom)
  const dailySessionFallbackLevels = useMemo(() => {
    if (!chartData || chartData.length < 5) return null;
    const sysStart = settings?.global_cycle_start || settings?.session1_start || '20:00:00';
    const sessionsMap = new Map<string, { high: number; low: number; close: number }[]>();
    const sessionKeysOrder: string[] = [];

    for (let i = 0; i < chartData.length; i++) {
      const c = chartData[i];
      const sKey = getTradingSessionKey(c.time, sysStart);
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

    if (sessionKeysOrder.length < 2) return null;
    const prevKey = sessionKeysOrder[sessionKeysOrder.length - 2];
    const prevCandles = sessionsMap.get(prevKey) || [];
    if (prevCandles.length === 0) return null;

    let pH = -Infinity;
    let pL = Infinity;
    for (const pc of prevCandles) {
      if (pc.high > pH) pH = pc.high;
      if (pc.low < pL) pL = pc.low;
    }
    const pClose = prevCandles[prevCandles.length - 1].close;
    const diff = (pH !== -Infinity && pL !== Infinity && pH > pL) ? (pH - pL) : 0;

    return {
      prevH: pH !== -Infinity ? String(pH) : null,
      prevL: pL !== Infinity ? String(pL) : null,
      prev: pClose > 0 ? String(pClose) : null,
      max1d: pClose > 0 && diff > 0 ? String(pClose + diff) : null,
      min1d: pClose > 0 && diff > 0 ? String(pClose - diff) : null
    };
  }, [closedCandlesCount, lastClosedBarTime, settings?.global_cycle_start, settings?.session1_start]);

  // Pré-cálculo memoizado de Quebras de Sessão e Gaps de Fim de Semana (evita criar 800 objetos Date por frame de pan/zoom)
  const precomputedSessionBreaks = useMemo(() => {
    if (!chartData || chartData.length <= 1) return [];
    const cycleStartStr = settings?.global_cycle_start || settings?.session1_start || '20:00:00';
    const startIdx = Math.max(1, chartData.length - 400);
    const breaks: Array<{
      prevT: number;
      currT: number;
      isWeekendGap: boolean;
      endLabel: string;
      startLabel: string;
    }> = [];

    for (let i = startIdx; i < chartData.length; i++) {
      const prevBar = chartData[i - 1];
      const currBar = chartData[i];
      const prevT = prevBar.time;
      const currT = currBar.time;

      const prevSession = getTradingSessionKey(prevT, cycleStartStr);
      const currSession = getTradingSessionKey(currT, cycleStartStr);
      const timeDiffHours = (currT - prevT) / 3600;
      const isWeekendGap = timeDiffHours >= 24;
      const isSessionChange = prevSession !== currSession || isWeekendGap;

      if (isSessionChange) {
        let endLabel = '';
        if (isWeekendGap) {
          const pDayStr = formatSaoPauloDayMonth(prevT);
          const pTimeStr = formatSaoPauloTime(prevT, false);
          endLabel = `🏁 Fechamento (${pDayStr} ${pTimeStr})`;
        }

        const formattedDate = formatSaoPauloDayMonth(currT);
        const timeStr = formatSaoPauloTime(currT, false);
        const startLabel = isWeekendGap ? `🗓️ Abertura Semanal (${formattedDate} ${timeStr})` : `📅 Sessão (${formattedDate} ${timeStr})`;

        breaks.push({ prevT, currT, isWeekendGap, endLabel, startLabel });
      }
    }
    return breaks;
  }, [closedCandlesCount, lastClosedBarTime, settings?.global_cycle_start, settings?.session1_start]);

  // Pré-cálculo memoizado de Notícias Econômicas filtradas e alinhadas aos candles (evita Intl.DateTimeFormat e O(N*M) por frame)
  const precomputedFilteredNews = useMemo(() => {
    if (settings?.news_chart_markers === false) return [];
    const activeNewsList = newsListProp && newsListProp.length > 0 ? newsListProp : internalNews;
    if (!activeNewsList || activeNewsList.length === 0) return [];

    const allowedCountries = (settings?.news_countries && Array.isArray(settings.news_countries) && settings.news_countries.length > 0)
      ? settings.news_countries.map((c: string) => c.toUpperCase())
      : null;

    const impHigh = settings?.news_impact_high !== false;
    const impMedium = settings?.news_impact_medium !== false;
    const impLow = settings?.news_impact_low === true;

    const getCountryFlag = (code: string) => {
      const c = String(code || '').toUpperCase();
      if (c === 'USD' || c === 'US') return '🇺🇸';
      if (c === 'EUR' || c === 'EU' || c === 'EZ') return '🇪🇺';
      if (c === 'GBP' || c === 'UK') return '🇬🇧';
      if (c === 'JPY' || c === 'JP') return '🇯🇵';
      if (c === 'CAD' || c === 'CA') return '🇨🇦';
      if (c === 'AUD' || c === 'AU') return '🇦🇺';
      if (c === 'CHF' || c === 'CH') return '🇨🇭';
      if (c === 'CNY' || c === 'CN') return '🇨🇳';
      if (c === 'NZD' || c === 'NZ') return '🇳🇿';
      if (c === 'MXN' || c === 'MX') return '🇲🇽';
      if (c === 'BRL' || c === 'BR') return '🇧🇷';
      return '🌐';
    };

    const result: Array<{
      id: string;
      news: any;
      targetTime: number;
      color: string;
      bulls: string;
      timeStr: string;
      country: string;
      flagEmoji: string;
      title: string;
    }> = [];

    activeNewsList.forEach((n: any, idx: number) => {
      if (allowedCountries) {
        const itemCountry = String(n.country || n.currency || '').toUpperCase();
        const isCountryMatch = allowedCountries.some((c: string) =>
          c === itemCountry ||
          (c === 'USD' && itemCountry === 'US') ||
          (c === 'EUR' && (itemCountry === 'EU' || itemCountry === 'EZ')) ||
          (c === 'GBP' && itemCountry === 'UK') ||
          (c === 'JPY' && itemCountry === 'JP') ||
          (c === 'CAD' && itemCountry === 'CA') ||
          (c === 'AUD' && itemCountry === 'AU') ||
          (c === 'CHF' && itemCountry === 'CH') ||
          (c === 'CNY' && itemCountry === 'CN') ||
          (c === 'NZD' && itemCountry === 'NZ') ||
          (c === 'MXN' && itemCountry === 'MX')
        );
        if (!isCountryMatch) return;
      }

      const impRaw = String(n.impact || '').toLowerCase();
      if (impRaw === 'high' || impRaw === 'alto' || impRaw === '3') {
        if (!impHigh) return;
      } else if (impRaw === 'medium' || impRaw === 'medio' || impRaw === '2') {
        if (!impMedium) return;
      } else if (impRaw === 'low' || impRaw === 'baixo' || impRaw === '1') {
        if (!impLow) return;
      }

      const newsTimeSec = getChartTimeFromDate(n.date || n.event_date);
      if (newsTimeSec <= 0) return;

      let closestTime: number | null = null;
      let minDiff = 900;
      if (chartData && chartData.length > 0) {
        for (let i = 0; i < chartData.length; i++) {
          const cTime = chartData[i].time;
          const diff = Math.abs(cTime - newsTimeSec);
          if (diff < minDiff) {
            minDiff = diff;
            closestTime = cTime;
          }
        }
      }

      const targetTime = closestTime !== null ? closestTime : newsTimeSec;
      let bulls = '🐂';
      let color = '#22c55e';
      if (impRaw === 'high' || impRaw === 'alto' || impRaw === '3') {
        bulls = '🐂🐂🐂';
        color = '#ef4444';
      } else if (impRaw === 'medium' || impRaw === 'medio' || impRaw === '2') {
        bulls = '🐂🐂';
        color = '#f97316';
      }

      const newsDateObj = new Date(n.date || n.event_date);
      const timeStr = !isNaN(newsDateObj.getTime())
        ? newsDateObj.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
        : '';

      const country = n.country || n.currency || 'US';
      const flagEmoji = getCountryFlag(country);
      const title = n.title || n.event_name || 'Notícia';

      result.push({
        id: String(n.id || `${targetTime}_${idx}`),
        news: n,
        targetTime,
        color,
        bulls,
        timeStr,
        country,
        flagEmoji,
        title
      });
    });

    return result;
  }, [
    newsListProp,
    internalNews,
    settings?.news_chart_markers,
    settings?.news_countries,
    settings?.news_impact_high,
    settings?.news_impact_medium,
    settings?.news_impact_low,
    closedCandlesCount,
    lastClosedBarTime
  ]);

  // Latest ref pattern to always have the freshest state/props in callbacks without closing over stale values
  useEffect(() => {
    const upsertPooledEl = (
      container: HTMLElement,
      pool: Map<string, HTMLElement>,
      usedKeys: Set<string>,
      key: string,
      content: string,
      isHtml: boolean,
      styleStr: string,
      title?: string
    ): HTMLElement => {
      usedKeys.add(key);
      let el = pool.get(key) as any;
      if (!el) {
        el = document.createElement('div');
        pool.set(key, el);
      }
      if (el.parentElement !== container) {
        container.appendChild(el);
      }
      if (el.__prevContent !== content) {
        if (isHtml) {
          el.innerHTML = content;
        } else {
          el.textContent = content;
        }
        el.__prevContent = content;
      }
      if (el.__prevStyle !== styleStr) {
        el.setAttribute('style', styleStr);
        el.__prevStyle = styleStr;
      }
      if (title !== undefined && el.__prevTitle !== title) {
        el.title = title;
        el.__prevTitle = title;
      }
      return el;
    };

    const cleanupPooledEls = (pool: Map<string, HTMLElement>, usedKeys: Set<string>) => {
      pool.forEach((el: any, key) => {
        if (!usedKeys.has(key)) {
          if (el.__prevStyle !== 'display: none;') {
            el.setAttribute('style', 'display: none;');
            el.__prevStyle = 'display: none;';
          }
          if (pool.size > 250) {
            try { el.remove(); } catch (_) {}
            pool.delete(key);
          }
        }
      });
    };

    const executeUpdateLevelLabels = () => {
      try {
        const containerEl = mainContainerRef.current;
        const series = candleSeriesRef.current;
        if (!series || !containerEl) return;

        let labelsContainer = containerEl.querySelector('.chart-level-labels') as HTMLElement;
        if (!labelsContainer) {
          labelsContainer = document.createElement('div');
          labelsContainer.className = 'chart-level-labels';
          labelsContainer.setAttribute('style', 'position: absolute; right: 0; top: 0; bottom: 0; left: 0; pointer-events: none; z-index: 50; overflow: hidden;');

          const handleDelegatedPointer = (e: Event) => {
            const target = e.target as HTMLElement;
            if (!target) return;
            const histBtn = target.closest('#btn-mode-hist');
            const hurstBtn = target.closest('#btn-mode-hurst');
            if (histBtn) {
              e.stopPropagation();
              e.preventDefault();
              forecastModeRef.current = 'historico';
              setForecastMode('historico');
              try { localStorage.setItem('vortex_time_heatmap_forecast_mode', 'historico'); } catch (_) {}
              if (updateLevelLabelsRef.current) updateLevelLabelsRef.current(true);
            } else if (hurstBtn) {
              e.stopPropagation();
              e.preventDefault();
              forecastModeRef.current = 'hurst';
              setForecastMode('hurst');
              try { localStorage.setItem('vortex_time_heatmap_forecast_mode', 'hurst'); } catch (_) {}
              if (updateLevelLabelsRef.current) updateLevelLabelsRef.current(true);
            }
          };

          labelsContainer.addEventListener('pointerdown', handleDelegatedPointer, { passive: false });
          labelsContainer.addEventListener('click', handleDelegatedPointer, { passive: false });
          containerEl.appendChild(labelsContainer);
          labelsPoolRef.current.clear();
        }

        const usedLabelKeys = new Set<string>();
        const labelPool = labelsPoolRef.current;

      // 0. Renderizar Volume Heatmap Canvas e HVN Blocks no fundo
      let volumeCanvas = containerEl.querySelector('.chart-volume-canvas') as HTMLCanvasElement;
      if (!volumeCanvas) {
        volumeCanvas = document.createElement('canvas');
        volumeCanvas.className = 'chart-volume-canvas';
        volumeCanvas.setAttribute('style', 'position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; z-index: 20;');
        containerEl.appendChild(volumeCanvas);
      }

      const dpr = window.devicePixelRatio || 1;
      const cWidth = containerEl.clientWidth || 800;
      const cHeight = containerEl.clientHeight || 400;
      const effectivePriceScaleWidth = isMobile ? (hidePriceScaleMobile ? 0 : 55) : 80;
      const chartAreaWidth = Math.max(50, cWidth - effectivePriceScaleWidth);

      // Helper de interpolação matemática de preço para coordenada Y
      // Garante que mesmo com zoom extremo ou compressão, a posição vertical seja calculada perfeitamente
      const pTop = series.coordinateToPrice ? series.coordinateToPrice(0) : null;
      const pBottom = series.coordinateToPrice ? series.coordinateToPrice(cHeight) : null;
      const lastCandle = chartDataRef.current.length > 0 ? chartDataRef.current[chartDataRef.current.length - 1] : null;
      const refClose = lastCandle ? lastCandle.close : null;

      const safePriceToY = (price: number): number | null => {
        if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;
        // Se o preço for de uma escala completamente alienígena (> 3.5x ou < 0.25x do preço do ativo atual), ignorar para não poluir ou distorcer a escala
        if (refClose && refClose > 0) {
          if (price > refClose * 3.5 || price < refClose * 0.25) {
            return null;
          }
        }
        try {
          const directY = series.priceToCoordinate(price);
          if (directY !== null && typeof directY === 'number' && Number.isFinite(directY)) return directY;
        } catch (_) {}

        if (pTop !== null && pBottom !== null && Number.isFinite(pTop) && Number.isFinite(pBottom) && pTop !== pBottom) {
          const y = ((price - pTop) / (pBottom - pTop)) * cHeight;
          return (typeof y === 'number' && Number.isFinite(y)) ? y : null;
        }
        return null;
      };

      const hasWorkstationLevels = Boolean(
        activeIndicators && activeIndicators.some(i => 
          ['LEVELS_GAMMA', 'LEVELS_OPTIONS', 'LEVELS_DAILY', 'LEVELS_LIQUIDITY', 'GammaLevels', 'GAMMA_LEVELS'].includes(i.type) && i.visible
        )
      );
      const shouldShowLevels = hasWorkstationLevels ? true : (showLevels && effectiveShowGamma);

      let disabledLevels: string[] = (settings?.disabled_levels && Array.isArray(settings.disabled_levels)) ? settings.disabled_levels : [];
      let indGamma: IndicatorConfig | undefined;
      let indOptions: IndicatorConfig | undefined;
      let indDaily: IndicatorConfig | undefined;
      let indLiquidity: IndicatorConfig | undefined;
      let indLegacy: IndicatorConfig | undefined;
      let indLiquidityForFilter: IndicatorConfig | undefined;

      if (hasWorkstationLevels && activeIndicators) {
        indGamma = activeIndicators.find(i => i.type === 'LEVELS_GAMMA' && i.visible);
        indOptions = activeIndicators.find(i => i.type === 'LEVELS_OPTIONS' && i.visible);
        indDaily = activeIndicators.find(i => i.type === 'LEVELS_DAILY' && i.visible);
        indLiquidity = activeIndicators.find(i => i.type === 'LEVELS_LIQUIDITY' && i.visible);
        indLegacy = activeIndicators.find(i => (i.type === 'GammaLevels' || i.type === 'GAMMA_LEVELS') && i.visible);
        indLiquidityForFilter = indLiquidity;

        const disabledSet = new Set<string>();

        // Grupo 1: Gamma & Volatilidade
        if (indGamma) {
          if (indGamma.params?.showHvl === false) disabledSet.add('hvl');
          if (indGamma.params?.showGwall === false) disabledSet.add('gwall');
          if (indGamma.params?.showHvl0 === false) disabledSet.add('hvl0');
        } else if (!indLegacy) {
          disabledSet.add('hvl');
          disabledSet.add('gwall');
          disabledSet.add('hvl0');
        }

        // Grupo 2: Barreiras de Opções
        if (indOptions) {
          if (indOptions.params?.showCall === false) disabledSet.add('call');
          if (indOptions.params?.showPut === false) disabledSet.add('put');
          if (indOptions.params?.showCall0 === false) disabledSet.add('call0');
          if (indOptions.params?.showPut0 === false) disabledSet.add('put0');
        } else if (!indLegacy) {
          disabledSet.add('call');
          disabledSet.add('put');
          disabledSet.add('call0');
          disabledSet.add('put0');
        }

        // Grupo 3: Níveis de Pregão & Diários
        if (indDaily) {
          if (indDaily.params?.showMax1d === false) disabledSet.add('max1d');
          if (indDaily.params?.showMin1d === false) disabledSet.add('min1d');
          if (indDaily.params?.showPrev === false) disabledSet.add('prev');
          if (indDaily.params?.showPrevH === false) disabledSet.add('prevH');
          if (indDaily.params?.showPrevL === false) disabledSet.add('prevL');
        } else if (!indLegacy) {
          disabledSet.add('max1d');
          disabledSet.add('min1d');
          disabledSet.add('prev');
          disabledSet.add('prevH');
          disabledSet.add('prevL');
        }

        // Grupo 4: Liquidez & Exposição Dinâmica
        if (indLiquidity) {
          if (indLiquidity.params?.showBl === false) disabledSet.add('bl_count');
          if (indLiquidity.params?.showGex === false) disabledSet.add('gex_count');
        } else if (!indLegacy) {
          disabledSet.add('bl_count');
          disabledSet.add('gex_count');
        }

        disabledLevels = Array.from(disabledSet);
      }

      // Preparação de Níveis com Fallback de Sessão Anterior pré-calculado (O(1) durante pan/zoom)
      const effectiveLevels: any = gammaLevels ? { ...gammaLevels } : {};
      if (indDaily && dailySessionFallbackLevels) {
        if ((!effectiveLevels.prevH || effectiveLevels.prevH === '--' || isNaN(Number(effectiveLevels.prevH))) && dailySessionFallbackLevels.prevH) {
          effectiveLevels.prevH = dailySessionFallbackLevels.prevH;
        }
        if ((!effectiveLevels.prevL || effectiveLevels.prevL === '--' || isNaN(Number(effectiveLevels.prevL))) && dailySessionFallbackLevels.prevL) {
          effectiveLevels.prevL = dailySessionFallbackLevels.prevL;
        }
        if ((!effectiveLevels.prev || effectiveLevels.prev === '--' || isNaN(Number(effectiveLevels.prev))) && dailySessionFallbackLevels.prev) {
          effectiveLevels.prev = dailySessionFallbackLevels.prev;
        }
        if ((!effectiveLevels.max1d || effectiveLevels.max1d === '--' || isNaN(Number(effectiveLevels.max1d))) && dailySessionFallbackLevels.max1d) {
          effectiveLevels.max1d = dailySessionFallbackLevels.max1d;
        }
        if ((!effectiveLevels.min1d || effectiveLevels.min1d === '--' || isNaN(Number(effectiveLevels.min1d))) && dailySessionFallbackLevels.min1d) {
          effectiveLevels.min1d = dailySessionFallbackLevels.min1d;
        }
      }

      const getDashPattern = (style?: string) => {
        if (style === 'solid') return [];
        if (style === 'dotted') return [2, 4];
        return [6, 4]; // default dashed
      };

      const getLevelStyle = (key: string, defaultColor: string) => {
        if (['hvl', 'gwall', 'hvl0'].includes(key) && indGamma) {
          let c = defaultColor;
          if (key === 'hvl') c = indGamma.style?.color || defaultColor;
          else if (key === 'gwall') c = indGamma.style?.secondaryColor || defaultColor;
          else if (key === 'hvl0') c = indGamma.style?.tertiaryColor || defaultColor;
          return {
            color: c,
            lineWidth: (indGamma.style?.lineWidth || 1),
            lineStyle: indGamma.style?.lineStyle || 'dashed'
          };
        }
        if (['call', 'put', 'call0', 'put0'].includes(key) && indOptions) {
          let c = defaultColor;
          if (key === 'call') c = indOptions.style?.color || defaultColor;
          else if (key === 'put') c = indOptions.style?.secondaryColor || defaultColor;
          else if (key === 'call0') c = '#fca5a5';
          else if (key === 'put0') c = '#86efac';
          return {
            color: c,
            lineWidth: (indOptions.style?.lineWidth || 1),
            lineStyle: indOptions.style?.lineStyle || 'dashed'
          };
        }
        if (['max1d', 'min1d', 'prev', 'prevH', 'prevL'].includes(key) && indDaily) {
          let c = defaultColor;
          if (key === 'max1d') c = indDaily.style?.color || defaultColor;
          else if (key === 'min1d') c = indDaily.style?.secondaryColor || defaultColor;
          else if (key === 'prev') c = indDaily.style?.tertiaryColor || defaultColor;
          else c = defaultColor;
          return {
            color: c,
            lineWidth: (indDaily.style?.lineWidth || 1),
            lineStyle: indDaily.style?.lineStyle || 'dashed'
          };
        }
        if (indLegacy) {
          return {
            color: defaultColor,
            lineWidth: (indLegacy.style?.lineWidth || 1),
            lineStyle: indLegacy.style?.lineStyle || 'dashed'
          };
        }
        return {
          color: defaultColor,
          lineWidth: 1,
          lineStyle: 'dashed'
        };
      };

      if (volumeCanvas.width !== cWidth * dpr || volumeCanvas.height !== cHeight * dpr) {
        volumeCanvas.width = cWidth * dpr;
        volumeCanvas.height = cHeight * dpr;
      }

      let forecastCanvas = containerEl.querySelector('.chart-forecast-canvas') as HTMLCanvasElement;
      if (!forecastCanvas) {
        forecastCanvas = document.createElement('canvas');
        forecastCanvas.className = 'chart-forecast-canvas';
        forecastCanvas.setAttribute('style', 'position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; z-index: 48;');
        containerEl.appendChild(forecastCanvas);
      }
      if (forecastCanvas.width !== cWidth * dpr || forecastCanvas.height !== cHeight * dpr) {
        forecastCanvas.width = cWidth * dpr;
        forecastCanvas.height = cHeight * dpr;
      }
      const fCtx = forecastCanvas.getContext('2d');

      let btCanvas = containerEl.querySelector('.chart-blocktrades-canvas') as HTMLCanvasElement;
      if (!btCanvas) {
        btCanvas = document.createElement('canvas');
        btCanvas.className = 'chart-blocktrades-canvas';
        btCanvas.setAttribute('style', 'position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; z-index: 47;');
        containerEl.appendChild(btCanvas);
      }
      if (btCanvas.width !== cWidth * dpr || btCanvas.height !== cHeight * dpr) {
        btCanvas.width = cWidth * dpr;
        btCanvas.height = cHeight * dpr;
      }
      const btCtx = btCanvas.getContext('2d');
      if (btCtx) {
        btCtx.save();
        btCtx.scale(dpr, dpr);
        btCtx.clearRect(0, 0, cWidth, cHeight);
      }
      if (fCtx) {
        fCtx.save();
        fCtx.scale(dpr, dpr);
        fCtx.clearRect(0, 0, cWidth, cHeight);
      }

      const ctx = volumeCanvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, cWidth, cHeight);

        const effectivePriceScaleWidth = isMobile ? (hidePriceScaleMobile ? 0 : 55) : 80;
        const chartAreaWidth = Math.max(50, cWidth - effectivePriceScaleWidth);

        // 0. Renderizar Coloração de Fundo das Sessões de Mercado (Ásia, Londres, NY)
        const timeScale = mainChartRef.current?.timeScale();
        const currentThemeKey = settings?.chart_color_theme || localStorage.getItem('vortex_chart_theme') || 'ninja_carbon';
        const isLightChartTheme = currentThemeKey === 'ninja_light' || currentThemeKey === 'light' || currentThemeKey === 'cinza_grafite';

        if (ctx && timeScale && sessionsColorBgRef.current && sessionsColorBgRef.current.length > 0) {
          sessionsColorBgRef.current.forEach((block: any, bIdx: number) => {
            const x1 = timeScale.timeToCoordinate(block.startTime as any);
            const x2 = timeScale.timeToCoordinate(block.endTime as any);
            if (x1 !== null && x2 !== null && !isNaN(x1) && !isNaN(x2)) {
              const xLeft = Math.min(x1, x2);
              const w = Math.max(10, Math.abs(x2 - x1));
              if (xLeft + w >= 0 && xLeft <= chartAreaWidth) {
                // Em temas com fundo branco, ajusta a opacidade para 16-18% para que o azul e ciano fiquem nítidos e bonitos em tons pastéis
                let fillColor = block.color;
                if (isLightChartTheme) {
                  if (block.session === 'asia') fillColor = 'rgba(99, 102, 241, 0.18)';
                  else if (block.session === 'london') fillColor = 'rgba(6, 182, 212, 0.18)';
                  else if (block.session === 'newyork') fillColor = 'rgba(245, 158, 11, 0.16)';
                }

                ctx.fillStyle = fillColor;
                ctx.fillRect(xLeft, 0, w, cHeight);

                // Linha divisória sutil vertical no início da sessão
                ctx.save();
                ctx.strokeStyle = fillColor.replace(/[\d.]+\)$/, '0.45)');
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(xLeft, 0);
                ctx.lineTo(xLeft, cHeight);
                ctx.stroke();
                ctx.restore();

                // Rótulo elegante da Sessão no topo
                if (block.showLabel && xLeft >= 0 && xLeft <= chartAreaWidth - 90) {
                  const tagKey = `sess_bg_${block.session}_${block.startTime}_${bIdx}`;
                  const badgeColor = block.session === 'newyork' ? '#d97706' : block.session === 'london' ? '#0891b2' : '#6366f1';
                  const tagBg = isLightChartTheme ? '#ffffff' : 'rgba(15, 23, 42, 0.88)';
                  const tagStyle = `position: absolute; left: ${Math.max(4, xLeft + 6)}px; top: 10px; color: ${badgeColor}; font-size: 9.5px; font-family: 'JetBrains Mono', monospace; font-weight: 700; background: ${tagBg}; padding: 2px 5px; border-radius: 3px; border: 1px solid ${badgeColor}66; box-shadow: 0 1px 2px rgba(0,0,0,0.1); line-height: 1; white-space: nowrap; pointer-events: none; user-select: none; z-index: 52;`;
                  upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, tagKey, block.label, false, tagStyle);
                }
              }
            }
          });
        }

        // HUD Informativo Discreto de Order Flow CVD (no canto inferior esquerdo do gráfico)
        if (orderFlowCvdRef.current) {
          const cvdInfo = orderFlowCvdRef.current;
          const lastCvd = cvdInfo.lastCvd ?? 0;
          const lastDelta = cvdInfo.lastDelta ?? 0;
          const isCvdPos = lastCvd >= 0;
          const isDeltaPos = lastDelta >= 0;
          const hudKey = 'orderflow_cvd_hud';
          const hudHtml = `🌊 CVD: <b style="color: ${isCvdPos ? '#34d399' : '#f87171'}">${isCvdPos ? '+' : ''}${lastCvd.toLocaleString('pt-BR')}</b> &nbsp;|&nbsp; Delta Barra: <b style="color: ${isDeltaPos ? '#34d399' : '#f87171'}">${isDeltaPos ? '+' : ''}${lastDelta.toLocaleString('pt-BR')}</b>`;
          const hudStyle = `position: absolute; left: 14px; bottom: 30px; font-size: 11px; font-family: 'JetBrains Mono', monospace; color: #94a3b8; background: rgba(15, 23, 42, 0.85); padding: 3px 8px; border-radius: 5px; border: 1px solid rgba(56, 189, 248, 0.3); backdrop-filter: blur(4px); pointer-events: none; user-select: none; z-index: 55;`;
          upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, hudKey, hudHtml, true, hudStyle);
        }

        // A. Renderizar Volume Heatmap (Zonas de Calor)
        const heatmapData = volumeAnalysisResultsRef.current?.heatmap;
        if (heatmapData && heatmapData.result?.bins && heatmapData.result.bins.length > 0) {
          const bins = heatmapData.result.bins;
          const maxOp = (heatmapData.maxOpacity || 22) / 100;
          const minThresh = (heatmapData.minThreshold || 10) / 100;
          const theme = heatmapData.colorTheme || 'cyberpunk';

          bins.forEach((b: any) => {
            if (b.intensity < minThresh) return;
            const yTop = safePriceToY(b.priceTop);
            const yBottom = safePriceToY(b.priceBottom);
            if (yTop === null || yBottom === null) return;

            const y = Math.min(yTop, yBottom);
            const h = Math.max(1, Math.abs(yBottom - yTop));
            if (y + h < 0 || y > cHeight) return;

            const norm = Math.max(0, Math.min(1, b.intensity));
            const alpha = norm * maxOp;

            let fill = `rgba(6, 182, 212, ${alpha})`;
            if (theme === 'cyberpunk') {
              const r = Math.round(6 + (236 - 6) * norm);
              const g = Math.round(182 + (72 - 182) * norm);
              const bCol = Math.round(212 + (153 - 212) * norm);
              fill = `rgba(${r}, ${g}, ${bCol}, ${alpha})`;
            } else if (theme === 'fire') {
              if (norm < 0.5) {
                const t = norm * 2;
                const r = Math.round(245 + (249 - 245) * t);
                const g = Math.round(158 + (115 - 158) * t);
                const bCol = Math.round(11 + (22 - 11) * t);
                fill = `rgba(${r}, ${g}, ${bCol}, ${alpha})`;
              } else {
                const t = (norm - 0.5) * 2;
                const r = Math.round(249 + (239 - 249) * t);
                const g = Math.round(115 + (68 - 115) * t);
                const bCol = Math.round(22 + (68 - 22) * t);
                fill = `rgba(${r}, ${g}, ${bCol}, ${alpha})`;
              }
            } else if (theme === 'plasma') {
              if (norm < 0.5) {
                const t = norm * 2;
                const r = Math.round(59 + (168 - 59) * t);
                const g = Math.round(130 + (85 - 130) * t);
                const bCol = Math.round(246 + (247 - 246) * t);
                fill = `rgba(${r}, ${g}, ${bCol}, ${alpha})`;
              } else {
                const t = (norm - 0.5) * 2;
                const r = Math.round(168 + (251 - 168) * t);
                const g = Math.round(85 + (191 - 85) * t);
                const bCol = Math.round(247 + (36 - 247) * t);
                fill = `rgba(${r}, ${g}, ${bCol}, ${alpha})`;
              }
            } else if (theme === 'matrix') {
              const r = Math.round(21 + (34 - 21) * norm);
              const g = Math.round(128 + (197 - 128) * norm);
              const bCol = Math.round(61 + (94 - 61) * norm);
              fill = `rgba(${r}, ${g}, ${bCol}, ${alpha})`;
            }

            ctx.fillStyle = fill;
            ctx.fillRect(0, y, chartAreaWidth, h);
          });
        }

        // B. Renderizar HVN Blocks (Blocos de Absorção)
        const hvnData = volumeAnalysisResultsRef.current?.hvnBlocks;
        if (hvnData && hvnData.result?.hvnBlocks && hvnData.result.hvnBlocks.length > 0) {
          const blocks = hvnData.result.hvnBlocks;
          const bColor = hvnData.blockColor || '#3b82f6';
          const bOpacity = (hvnData.blockOpacity || 25) / 100;

          blocks.forEach((blk: any) => {
            const yTop = safePriceToY(blk.priceTop);
            const yBottom = safePriceToY(blk.priceBottom);
            if (yTop === null || yBottom === null) return;

            const y = Math.min(yTop, yBottom);
            const h = Math.max(2, Math.abs(yBottom - yTop));
            if (y + h < 0 || y > cHeight) return;

            ctx.fillStyle = `${bColor}${Math.round(bOpacity * 255).toString(16).padStart(2, '0')}`;
            ctx.fillRect(0, y, chartAreaWidth, h);

            ctx.strokeStyle = `${bColor}99`;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(0, y, chartAreaWidth, h);
            ctx.setLineDash([]);
          });
        }

        // C. Renderizar Níveis Institucionais no Canvas (VPOC, VAH, VAL, Naked POCs) de ponta a ponta
        const levelsData = volumeAnalysisResultsRef.current?.levels;
        if (levelsData && levelsData.result?.levels) {
          const poc = levelsData.result.levels.poc;
          const vah = levelsData.result.levels.vah;
          const val = levelsData.result.levels.val;
          const pocColor = levelsData.pocColor || '#f59e0b';
          const vahColor = levelsData.vahColor || '#06b6d4';
          const valColor = levelsData.valColor || '#a855f7';

          // Linha VPOC (Sólida de Alta Relevância)
          if (levelsData.showPoc && poc && poc > 0) {
            const y = safePriceToY(poc);
            if (y !== null && !isNaN(y) && y >= 0 && y <= cHeight) {
              ctx.strokeStyle = pocColor;
              ctx.lineWidth = 2;
              ctx.setLineDash([]);
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(chartAreaWidth, y);
              ctx.stroke();
            }
          }

          // Linhas VAH e VAL (Tracejadas)
          if (levelsData.showVahVal) {
            if (vah && vah > 0) {
              const y = safePriceToY(vah);
              if (y !== null && !isNaN(y) && y >= 0 && y <= cHeight) {
                ctx.strokeStyle = vahColor;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(chartAreaWidth, y);
                ctx.stroke();
                ctx.setLineDash([]);
              }
            }

            if (val && val > 0) {
              const y = safePriceToY(val);
              if (y !== null && !isNaN(y) && y >= 0 && y <= cHeight) {
                ctx.strokeStyle = valColor;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(chartAreaWidth, y);
                ctx.stroke();
                ctx.setLineDash([]);
              }
            }
          }

          // Linhas Naked POCs (Pontilhadas)
          if (levelsData.showNakedPocs && levelsData.result.levels.nakedPocs) {
            const npocs = levelsData.result.levels.nakedPocs;
            npocs.forEach((np: any) => {
              const y = safePriceToY(np.price);
              if (y !== null && !isNaN(y) && y >= 0 && y <= cHeight) {
                ctx.strokeStyle = '#ef4444dd';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 3]);
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(chartAreaWidth, y);
                ctx.stroke();
                ctx.setLineDash([]);
              }
            });
          }
        }

        // D. Renderizar Linhas Horizontais de Níveis Gamma no Canvas (HVL, Call, Put, Max, Min, GWall, GEX 1..10, BL 1..10) de ponta a ponta
        if (effectiveLevels && Object.keys(effectiveLevels).length > 0 && shouldShowLevels) {
          // 1. Níveis Principais (LEVEL_CONFIGS)
          Object.entries(LEVEL_CONFIGS).forEach(([key, cfg]) => {
            if (disabledLevels.includes(key)) return;
            const priceRaw = (effectiveLevels as any)[key];
            const priceVal = Number(priceRaw);
            if (priceRaw !== undefined && priceRaw !== null && !isNaN(priceVal) && priceVal > 0) {
              const y = safePriceToY(priceVal);
              if (y !== null && !isNaN(y) && y >= 0 && y <= cHeight) {
                const st = getLevelStyle(key, cfg.color);
                ctx.strokeStyle = st.color;
                ctx.lineWidth = st.lineWidth;
                ctx.setLineDash(getDashPattern(st.lineStyle));
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(chartAreaWidth, y);
                ctx.stroke();
                ctx.setLineDash([]);
              }
            }
          });

          // 2. Níveis de Exposição GEX 1..10
          if (!disabledLevels.includes('gex_count') && Array.isArray(effectiveLevels.gex)) {
            const gexLineWidth = indLiquidityForFilter?.style?.lineWidth || (indLegacy?.style?.lineWidth || 1);
            const gexLineStyle = indLiquidityForFilter?.style?.lineStyle || (indLegacy?.style?.lineStyle || 'dashed');
            const gexColor = indLiquidityForFilter?.style?.secondaryColor || '#a855f7';

            effectiveLevels.gex.forEach((priceVal: number, index: number) => {
              const gexNum = (index % 10) + 1;
              if (indLiquidityForFilter && indLiquidityForFilter.params && indLiquidityForFilter.params[`showGex${gexNum}`] === false) {
                return;
              }
              if (priceVal > 0) {
                const y = safePriceToY(priceVal);
                if (y !== null && !isNaN(y) && y >= 0 && y <= cHeight) {
                  ctx.strokeStyle = gexColor;
                  ctx.lineWidth = gexLineWidth;
                  ctx.setLineDash(getDashPattern(gexLineStyle));
                  ctx.beginPath();
                  ctx.moveTo(0, y);
                  ctx.lineTo(chartAreaWidth, y);
                  ctx.stroke();
                  ctx.setLineDash([]);
                }
              }
            });
          }

          // 3. Níveis de Compra BL 1..10
          if (!disabledLevels.includes('bl_count') && Array.isArray(effectiveLevels.bl)) {
            const blLineWidth = indLiquidityForFilter?.style?.lineWidth || (indLegacy?.style?.lineWidth || 1);
            const blLineStyle = indLiquidityForFilter?.style?.lineStyle || (indLegacy?.style?.lineStyle || 'dashed');
            const blColor = indLiquidityForFilter?.style?.color || '#3b82f6';

            effectiveLevels.bl.forEach((priceVal: number, index: number) => {
              const blNum = (index % 10) + 1;
              if (indLiquidityForFilter && indLiquidityForFilter.params && indLiquidityForFilter.params[`showBl${blNum}`] === false) {
                return;
              }
              if (priceVal > 0) {
                const y = safePriceToY(priceVal);
                if (y !== null && !isNaN(y) && y >= 0 && y <= cHeight) {
                  ctx.strokeStyle = blColor;
                  ctx.lineWidth = blLineWidth;
                  ctx.setLineDash(getDashPattern(blLineStyle));
                  ctx.beginPath();
                  ctx.moveTo(0, y);
                  ctx.lineTo(chartAreaWidth, y);
                  ctx.stroke();
                  ctx.setLineDash([]);
                }
              }
            });
          }
        }

        // 4. Renderizar Linhas Horizontais de Volume Spike Pivots no Canvas 2D (Alta Performance, Zero Séries no LW Charts)
        const spikeData = volumeAnalysisResultsRef.current?.spikePivots;
        if (spikeData && spikeData.selectedPivots && spikeData.selectedPivots.length > 0 && mainChartRef.current) {
          const timeScale = mainChartRef.current.timeScale();
          const pList = spikeData.selectedPivots;
          const highColor = spikeData.highColor;
          const lowColor = spikeData.lowColor;
          const lineWidth = spikeData.lineWidth || 2;
          const dashPattern = spikeData.lineStyle === 2 ? [6, 4] : (spikeData.lineStyle === 1 ? [2, 4] : []);

          pList.forEach((pivot: any) => {
            if (!pivot || typeof pivot.level !== 'number' || !Number.isFinite(pivot.level) || pivot.level <= 0) return;
            const y = safePriceToY(pivot.level);
            if (y === null || typeof y !== 'number' || !Number.isFinite(y) || y < 0 || y > cHeight) return;

            // Converter tempo de início em coordenada X
            let startX = 0;
            if (pivot.startTime) {
              const sx = timeScale.timeToCoordinate(pivot.startTime as any);
              if (sx !== null && typeof sx === 'number' && Number.isFinite(sx)) {
                startX = Math.max(0, sx);
              }
            }

            // Se o pivô foi rompido, desenhar até o tempo do rompimento; se está ativo, desenhar até o final do gráfico
            let endX = chartAreaWidth;
            if (pivot.endTime && pivot.endIndex !== null) {
              const ex = timeScale.timeToCoordinate(pivot.endTime as any);
              if (ex !== null && typeof ex === 'number' && Number.isFinite(ex)) {
                endX = Math.min(chartAreaWidth, Math.max(startX, ex));
              }
            }

            if (endX < 0 || startX > chartAreaWidth) return;

            const isHigh = pivot.isPivotHigh;
            const strokeCol = isHigh ? highColor : lowColor;

            ctx.strokeStyle = strokeCol;
            ctx.lineWidth = lineWidth;
            ctx.setLineDash(dashPattern);
            ctx.beginPath();
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
            ctx.stroke();
            ctx.setLineDash([]);
          });
        }

        // E. Renderizar Linhas do Indicador STRIKE_LEVELS (Gamma & Opções do Feed Grix)
        if (effectiveShowStrikeLevels && marketMatrixFeedRef.current) {
          const f = marketMatrixFeedRef.current;
          const params = strikeLevelsIndConfig?.params || {};
          const currentPrice = (chartData && chartData.length > 0) ? chartData[chartData.length - 1].close : 0;
          const manualFactor = Number(params.fatorManual) || 0;
          const calibrate = params.calibrarPeloPreco !== false;

          interface RawStrikeLvl {
            name: string;
            qqq: number;
            color: string;
            lineWidth: number;
            lineStyle: 'solid' | 'dashed';
          }

          const rawList: RawStrikeLvl[] = [];

          if (params.showCallWall !== false && f.cw > 0) {
            rawList.push({ name: 'Call Wall', qqq: f.cw, color: '#32cd32', lineWidth: 1.5, lineStyle: 'dashed' });
          }
          if (params.showPoc !== false && f.poc > 0) {
            rawList.push({ name: 'POC', qqq: f.poc, color: '#f59e0b', lineWidth: 1.5, lineStyle: 'dashed' });
          }
          if (params.showPutWall !== false && f.pw > 0) {
            rawList.push({ name: 'Put Wall', qqq: f.pw, color: '#ef4444', lineWidth: 1.5, lineStyle: 'dashed' });
          }
          if (params.showGammaWallSup !== false && f.gw_sup > 0) {
            rawList.push({ name: 'Gamma Wall', qqq: f.gw_sup, color: '#3cb371', lineWidth: 1.2, lineStyle: 'solid' });
          }
          if (params.showFlip !== false && f.flip > 0) {
            rawList.push({ name: 'Flip Zone', qqq: f.flip, color: '#d1d5db', lineWidth: 1.2, lineStyle: 'solid' });
          }
          if (params.showGammaWallInf !== false && f.gw_inf > 0) {
            rawList.push({ name: 'Gamma Wall inf.', qqq: f.gw_inf, color: '#dc2626', lineWidth: 1.2, lineStyle: 'solid' });
          }
          if (params.showSigma !== false) {
            if (f.sigma_sup && f.sigma_sup > 0) rawList.push({ name: 'SIGMA ↑ venda', qqq: f.sigma_sup, color: '#ef4444', lineWidth: 1.8, lineStyle: 'solid' });
            if (f.sigma_inf && f.sigma_inf > 0) rawList.push({ name: 'SIGMA ↓ compra', qqq: f.sigma_inf, color: '#22c55e', lineWidth: 1.8, lineStyle: 'solid' });
          }
          if (params.showHeatmap !== false) {
            if (f.hm_oi_call && f.hm_oi_call > 0) rawList.push({ name: 'HM call (OI)', qqq: f.hm_oi_call, color: '#8fbc8f', lineWidth: 1.0, lineStyle: 'dashed' });
            if (f.hm_oi_put && f.hm_oi_put > 0) rawList.push({ name: 'HM put (OI)', qqq: f.hm_oi_put, color: '#bc8f8f', lineWidth: 1.0, lineStyle: 'dashed' });
            if (f.hm_oi_flip && f.hm_oi_flip > 0) rawList.push({ name: 'HM flip (OI)', qqq: f.hm_oi_flip, color: '#c0c0c0', lineWidth: 1.0, lineStyle: 'dashed' });
            if (f.hm_vol_call && f.hm_vol_call > 0) rawList.push({ name: 'HM call (VOL)', qqq: f.hm_vol_call, color: '#7fffd4', lineWidth: 1.0, lineStyle: 'dashed' });
            if (f.hm_vol_put && f.hm_vol_put > 0) rawList.push({ name: 'HM put (VOL)', qqq: f.hm_vol_put, color: '#fa8072', lineWidth: 1.0, lineStyle: 'dashed' });
            if (f.hm_vol_flip && f.hm_vol_flip > 0) rawList.push({ name: 'HM flip (VOL)', qqq: f.hm_vol_flip, color: '#b0c4de', lineWidth: 1.0, lineStyle: 'dashed' });
          }
          if (params.showRange !== false) {
            if (f.range_max && f.range_max > 0) rawList.push({ name: 'Range máx. (venda)', qqq: f.range_max, color: '#ee82ee', lineWidth: 1.6, lineStyle: 'dashed' });
            if (f.range_min && f.range_min > 0) rawList.push({ name: 'Range mín. (compra)', qqq: f.range_min, color: '#ee82ee', lineWidth: 1.6, lineStyle: 'dashed' });
          }

          // Agrupamento de níveis no mesmo preço
          const groupedLevels: RawStrikeLvl[] = [];
          for (const item of rawList) {
            const ex = groupedLevels.find(x => Math.abs(x.qqq - item.qqq) < 0.005);
            if (!ex) {
              groupedLevels.push({ ...item });
            } else {
              ex.name += ` · ${item.name}`;
              if (item.lineWidth > ex.lineWidth) {
                ex.lineWidth = item.lineWidth;
                ex.color = item.color;
              }
            }
          }

          // Linhas sutis de todos os strikes a cada 1.00 de QQQ
          if (params.showStrikes === true && series.coordinateToPrice) {
            const pTopVal = series.coordinateToPrice(0);
            const pBottomVal = series.coordinateToPrice(cHeight);
            if (pTopVal && pBottomVal) {
              const minPrice = Math.min(pTopVal, pBottomVal);
              const maxPrice = Math.max(pTopVal, pBottomVal);
              const factorVal = manualFactor > 0 ? manualFactor : (f.fator || 41.2375);
              const k0 = Math.floor(minPrice / factorVal) - 1;
              const k1 = Math.ceil(maxPrice / factorVal) + 1;
              const maxK = Math.min(k1, k0 + 150);
              for (let k = k0; k <= maxK; k++) {
                const nqK = convertQqqToNq(k, f, currentPrice, manualFactor, 0, calibrate);
                const yK = safePriceToY(nqK);
                if (yK !== null && !isNaN(yK) && yK >= 0 && yK <= cHeight) {
                  const isMainStrike = (k % 5 === 0);
                  ctx.strokeStyle = isMainStrike ? 'rgba(148, 163, 184, 0.28)' : 'rgba(100, 116, 139, 0.15)';
                  ctx.lineWidth = isMainStrike ? 1.0 : 0.6;
                  ctx.setLineDash(isMainStrike ? [] : [3, 3]);
                  ctx.beginPath();
                  ctx.moveTo(0, yK);
                  ctx.lineTo(chartAreaWidth, yK);
                  ctx.stroke();
                  ctx.setLineDash([]);
                }
              }
            }
          }

          // Desenhar cada linha agrupada
          for (const g of groupedLevels) {
            const nqPrice = convertQqqToNq(g.qqq, f, currentPrice, manualFactor, 0, calibrate);
            if (nqPrice > 0) {
              const y = safePriceToY(nqPrice);
              if (y !== null && !isNaN(y) && y >= 0 && y <= cHeight) {
                ctx.strokeStyle = g.color;
                ctx.lineWidth = g.lineWidth;
                ctx.setLineDash(g.lineStyle === 'dashed' ? [6, 4] : []);
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(chartAreaWidth, y);
                ctx.stroke();
                ctx.setLineDash([]);
              }
            }
          }
        }

        ctx.restore();
      }

      // D. Tags Flutuantes de Volume Levels e HVN com Alta Legibilidade
      if (labelsContainer) {
        const levelsData = volumeAnalysisResultsRef.current?.levels;
        if (levelsData && levelsData.result?.levels) {
          const poc = levelsData.result.levels.poc;
          const vah = levelsData.result.levels.vah;
          const val = levelsData.result.levels.val;
          const pocColor = levelsData.pocColor || '#f59e0b';
          const vahColor = levelsData.vahColor || '#06b6d4';
          const valColor = levelsData.valColor || '#a855f7';

          if (levelsData.showPoc && poc && poc > 0) {
            const y = safePriceToY(poc);
            if (y !== null && !isNaN(y) && y >= 0 && y <= containerEl.clientHeight) {
              const tagStyle = `position: absolute; left: 10px; top: ${y - 12}px; color: ${pocColor}; font-size: 11.5px; font-family: 'JetBrains Mono', monospace; font-weight: 700; background: #070b14f5; padding: 2.5px 8px; border-radius: 4px; border: 1px solid ${pocColor}aa; line-height: 1; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.8); z-index: 55;`;
              upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, 'vol_poc', 'VPOC', false, tagStyle);
            }
          }

          if (levelsData.showVahVal) {
            if (vah && vah > 0) {
              const y = safePriceToY(vah);
              if (y !== null && !isNaN(y) && y >= 0 && y <= containerEl.clientHeight) {
                const tagStyle = `position: absolute; left: 10px; top: ${y - 12}px; color: ${vahColor}; font-size: 11.5px; font-family: 'JetBrains Mono', monospace; font-weight: 700; background: #070b14f5; padding: 2.5px 8px; border-radius: 4px; border: 1px solid ${vahColor}aa; line-height: 1; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.8); z-index: 55;`;
                upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, 'vol_vah', 'VAH 70%', false, tagStyle);
              }
            }

            if (val && val > 0) {
              const y = safePriceToY(val);
              if (y !== null && !isNaN(y) && y >= 0 && y <= containerEl.clientHeight) {
                const tagStyle = `position: absolute; left: 10px; top: ${y - 12}px; color: ${valColor}; font-size: 11.5px; font-family: 'JetBrains Mono', monospace; font-weight: 700; background: #070b14f5; padding: 2.5px 8px; border-radius: 4px; border: 1px solid ${valColor}aa; line-height: 1; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.8); z-index: 55;`;
                upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, 'vol_val', 'VAL 70%', false, tagStyle);
              }
            }
          }

          if (levelsData.showNakedPocs && levelsData.result.levels.nakedPocs) {
            levelsData.result.levels.nakedPocs.forEach((np: any, npIdx: number) => {
              const y = safePriceToY(np.price);
              if (y !== null && !isNaN(y) && y >= 0 && y <= containerEl.clientHeight) {
                const tagStyle = `position: absolute; left: 10px; top: ${y - 12}px; color: #ef4444; font-size: 11px; font-family: 'JetBrains Mono', monospace; font-weight: 700; background: #070b14f5; padding: 2.5px 8px; border-radius: 4px; border: 1px solid #ef4444aa; line-height: 1; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.8); z-index: 55;`;
                upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, `vol_npoc_${np.price}_${npIdx}`, `NPOC [${np.dateStr}]`, false, tagStyle);
              }
            });
          }
        }

        const hvnData = volumeAnalysisResultsRef.current?.hvnBlocks;
        if (hvnData && hvnData.result?.hvnBlocks) {
          const bColor = hvnData.blockColor || '#3b82f6';
          hvnData.result.hvnBlocks.forEach((blk: any, bIdx: number) => {
            const y = safePriceToY(blk.priceCenter);
            if (y !== null && !isNaN(y) && y >= 0 && y <= containerEl.clientHeight) {
              const hvnRight = isMobile && hidePriceScaleMobile ? 12 : 95;
              const tagStyle = `position: absolute; right: ${hvnRight}px; top: ${y - 12}px; color: ${bColor}; font-size: 11.5px; font-family: 'JetBrains Mono', monospace; font-weight: 700; background: #070b14f5; padding: 2.5px 8px; border-radius: 4px; border: 1px solid ${bColor}bb; line-height: 1; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.8); z-index: 54;`;
              upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, `vol_hvn_${blk.rank}_${bIdx}`, `HVN #${blk.rank}`, false, tagStyle);
            }
          });
        }

        // E. Legenda de Pontos (Máxima - Mínima) para LEVELS_TIME_RANGE (Sem moldura / apenas texto)
        const timeRanges = timeRangeResultsRef.current || [];
        if (timeRanges.length > 0) {
          const timeScale = mainChartRef.current?.timeScale();
          const visibleRange = timeScale?.getVisibleRange ? timeScale.getVisibleRange() : null;

          timeRanges.forEach((tr: any) => {
            if (tr.rangePoints > 0 && tr.mid > 0 && tr.startTime > 0) {
              if (visibleRange && visibleRange.from && visibleRange.to) {
                const vFrom = typeof visibleRange.from === 'number' ? visibleRange.from : ((visibleRange.from as any)?.timestamp || 0);
                const vTo = typeof visibleRange.to === 'number' ? visibleRange.to : ((visibleRange.to as any)?.timestamp || 0);
                const rangeEnd = tr.endTime || tr.startTime;
                if (vFrom > 0 && vTo > 0) {
                  if (rangeEnd < vFrom || tr.startTime > vTo) {
                    return;
                  }
                }
              }

              const y = safePriceToY(tr.mid);
              const xStart = timeScale ? timeScale.timeToCoordinate(tr.startTime as any) : null;
              const xEnd = timeScale && tr.endTime ? timeScale.timeToCoordinate(tr.endTime as any) : null;

              if (y !== null && !isNaN(y) && y >= 0 && y <= containerEl.clientHeight) {
                if (xStart === null && xEnd === null) return;
                if (xEnd !== null && xEnd < 0) return;
                if (xStart !== null && xStart > chartAreaWidth) return;

                let posX: number | null = null;
                if (xStart !== null && !isNaN(xStart) && xStart >= 0) {
                  posX = xStart + 6;
                } else if (xEnd !== null && !isNaN(xEnd) && xEnd > 20) {
                  posX = 12;
                }

                if (posX !== null && posX >= 0 && posX <= chartAreaWidth - 40) {
                  // 1. Tag Ponto Médio / Range Pontos
                  const ptsFormatted = tr.rangePoints.toFixed(2);
                  const styleMid = `position: absolute; left: ${posX}px; top: ${y - 14}px; color: #facc15; font-size: 11px; font-family: 'JetBrains Mono', monospace; font-weight: 700; line-height: 1; white-space: nowrap; text-shadow: 0 1px 3px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9); z-index: 55; pointer-events: none; user-select: none;`;
                  upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, `tr_mid_${tr.startTime}`, `${ptsFormatted} pts`, false, styleMid);

                  // 2. Tag Máxima
                  if (tr.rangeHigh > 0) {
                    const yHigh = safePriceToY(tr.rangeHigh);
                    if (yHigh !== null && !isNaN(yHigh) && yHigh >= 0 && yHigh <= containerEl.clientHeight) {
                      const hFormatted = tr.rangeHigh.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      const styleHigh = `position: absolute; left: ${posX}px; top: ${yHigh - 14}px; color: #06b6d4; font-size: 11px; font-family: 'JetBrains Mono', monospace; font-weight: 700; line-height: 1; white-space: nowrap; text-shadow: 0 1px 3px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9); z-index: 55; pointer-events: none; user-select: none;`;
                      upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, `tr_high_${tr.startTime}`, `${tr.isAllSession ? 'Máx Sessão' : 'Máx'} ${hFormatted}`, false, styleHigh);
                    }
                  }

                  // 3. Tag Mínima
                  if (tr.rangeLow > 0) {
                    const yLow = safePriceToY(tr.rangeLow);
                    if (yLow !== null && !isNaN(yLow) && yLow >= 0 && yLow <= containerEl.clientHeight) {
                      const lFormatted = tr.rangeLow.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      const styleLow = `position: absolute; left: ${posX}px; top: ${yLow + 2}px; color: #f97316; font-size: 11px; font-family: 'JetBrains Mono', monospace; font-weight: 700; line-height: 1; white-space: nowrap; text-shadow: 0 1px 3px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9); z-index: 55; pointer-events: none; user-select: none;`;
                      upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, `tr_low_${tr.startTime}`, `${tr.isAllSession ? 'Mín Sessão' : 'Mín'} ${lFormatted}`, false, styleLow);
                    }
                  }
                }
              }
            }
          });
        }

        // F. Renderizar Linhas Verticais de Quebra de Sessões (Session Breaks & Weekend Gaps)
        const timeScale = mainChartRef.current?.timeScale();
        if (ctx && precomputedSessionBreaks && precomputedSessionBreaks.length > 0 && timeScale) {
          precomputedSessionBreaks.forEach((sb: any, sbIdx: number) => {
            const { prevT, currT, isWeekendGap, endLabel, startLabel } = sb;
            const xStart = timeScale.timeToCoordinate(currT as any);
            const xEnd = timeScale.timeToCoordinate(prevT as any);

            // 1. Linha vertical no encerramento de sexta-feira (se for gap de fim de semana)
            if (isWeekendGap && xEnd !== null && !isNaN(xEnd) && xEnd >= 0 && xEnd <= chartAreaWidth) {
              ctx.save();
              ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);
              ctx.beginPath();
              ctx.moveTo(xEnd, 0);
              ctx.lineTo(xEnd, cHeight);
              ctx.stroke();
              ctx.restore();

              if (endLabel) {
                const tagEndKey = `sb_end_${prevT}_${sbIdx}`;
                const styleStr = `position: absolute; left: ${Math.max(4, xEnd - 120)}px; bottom: 24px; color: #f87171; font-size: 10px; font-family: 'JetBrains Mono', monospace; font-weight: 700; background: #0f172aee; padding: 2px 6px; border-radius: 4px; border: 1px solid #ef444466; line-height: 1; white-space: nowrap; pointer-events: none; user-select: none; z-index: 52;`;
                upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, tagEndKey, endLabel, false, styleStr);
              }
            }

            // 2. Linha vertical na abertura da sessão (Diária ou Retorno Semanal no Domingo)
            if (xStart !== null && !isNaN(xStart) && xStart >= 0 && xStart <= chartAreaWidth) {
              ctx.save();
              ctx.strokeStyle = isWeekendGap ? 'rgba(59, 130, 246, 0.65)' : 'rgba(148, 163, 184, 0.35)';
              ctx.lineWidth = isWeekendGap ? 1.5 : 1;
              ctx.setLineDash([4, 4]);
              ctx.beginPath();
              ctx.moveTo(xStart, 0);
              ctx.lineTo(xStart, cHeight);
              ctx.stroke();
              ctx.restore();

              if (startLabel) {
                const tagStartKey = `sb_start_${currT}_${sbIdx}`;
                const styleStr = `position: absolute; left: ${Math.min(chartAreaWidth - 140, Math.max(4, xStart + 4))}px; top: 14px; color: ${isWeekendGap ? '#60a5fa' : '#94a3b8'}; font-size: 10px; font-family: 'JetBrains Mono', monospace; font-weight: 700; background: #0f172aee; padding: 2px 6px; border-radius: 4px; border: 1px solid ${isWeekendGap ? '#3b82f688' : '#334155'}; line-height: 1; white-space: nowrap; pointer-events: none; user-select: none; z-index: 52;`;
                upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, tagStartKey, startLabel, false, styleStr);
              }
            }
          });
        }
        // G. Renderizar Projeções do TIME_HEATMAP (Linhas Verticais, Corredor de Volatilidade, Velas Fantasma e Card de Projeção)
        let timeHeatmapList = (timeHeatmapResultsRef.current && timeHeatmapResultsRef.current.length > 0)
          ? timeHeatmapResultsRef.current
          : (timeHeatmapData ? [timeHeatmapData] : []);
        const drawCtx = fCtx || ctx;
        if (drawCtx && timeScale && timeHeatmapList.length > 0) {
          timeHeatmapList.forEach((item: any) => {
            // 1. Linhas Verticais Discretas de Região de Tempo
            if (item.showVerticalLines !== false) {
              const lineColor = item.verticalLineColor || 'rgba(56, 189, 248, 0.45)';
              const lines = item.windowLines || [];

              lines.forEach((wl: any) => {
                const xStart = timeScale.timeToCoordinate(wl.startTime as any);
                const xEnd = timeScale.timeToCoordinate(wl.endTime as any);

                if (xStart !== null && !isNaN(xStart) && xStart >= 0 && xStart <= chartAreaWidth) {
                  drawCtx.save();
                  drawCtx.strokeStyle = lineColor;
                  drawCtx.lineWidth = 1;
                  drawCtx.setLineDash([4, 4]);
                  drawCtx.beginPath();
                  drawCtx.moveTo(xStart, 0);
                  drawCtx.lineTo(xStart, cHeight);
                  drawCtx.stroke();
                  drawCtx.restore();

                  const tagStyle = `position: absolute; left: ${Math.min(chartAreaWidth - 110, Math.max(4, xStart + 4))}px; top: 34px; color: #38bdf8; font-size: 9.5px; font-family: 'JetBrains Mono', monospace; font-weight: 700; background: rgba(15, 23, 42, 0.85); padding: 2px 5px; border-radius: 3px; border: 1px solid rgba(56, 189, 248, 0.4); line-height: 1; white-space: nowrap; pointer-events: none; user-select: none; z-index: 52;`;
                  upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, `th_start_${wl.startTime}`, `⏰ Início [${wl.startTimeStr}]`, false, tagStyle);
                }

                if (xEnd !== null && !isNaN(xEnd) && xEnd >= 0 && xEnd <= chartAreaWidth) {
                  drawCtx.save();
                  drawCtx.strokeStyle = lineColor;
                  drawCtx.lineWidth = 1;
                  drawCtx.setLineDash([4, 4]);
                  drawCtx.beginPath();
                  drawCtx.moveTo(xEnd, 0);
                  drawCtx.lineTo(xEnd, cHeight);
                  drawCtx.stroke();
                  drawCtx.restore();

                  const tagStyle = `position: absolute; left: ${Math.min(chartAreaWidth - 100, Math.max(4, xEnd - 90))}px; top: 34px; color: #38bdf8; font-size: 9.5px; font-family: 'JetBrains Mono', monospace; font-weight: 700; background: rgba(15, 23, 42, 0.85); padding: 2px 5px; border-radius: 3px; border: 1px solid rgba(56, 189, 248, 0.4); line-height: 1; white-space: nowrap; pointer-events: none; user-select: none; z-index: 52;`;
                  upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, `th_end_${wl.endTime}`, `⏰ Fim [${wl.endTimeStr}]`, false, tagStyle);
                }
              });
            }

            // Determinar coordenadas geométricas para as projeções futuras
            const currentChartData = (chartDataRef.current && chartDataRef.current.length > 0) ? chartDataRef.current : chartData;
            if (!currentChartData || currentChartData.length === 0) return;

            const lastBar = currentChartData[currentChartData.length - 1];
            const rawXLast = timeScale.timeToCoordinate(lastBar.time as any);
            const xLast: number = (rawXLast !== null && !isNaN(Number(rawXLast))) ? Number(rawXLast) : (chartAreaWidth - 120);

            let barSpacing = 6;
            if (currentChartData.length >= 2) {
              const prevBar = currentChartData[currentChartData.length - 2];
              const rawXPrev = timeScale.timeToCoordinate(prevBar.time as any);
              const xPrev = rawXPrev !== null && !isNaN(Number(rawXPrev)) ? Number(rawXPrev) : null;
              if (xPrev !== null && Math.abs(xLast - xPrev) >= 0.5) {
                barSpacing = Math.abs(xLast - xPrev);
              }
            }

            // Largura fiel e idêntica ao padrão dos candles nativos do Lightweight Charts
            let candleWidth = 1;
            if (barSpacing >= 5) {
              candleWidth = Math.max(2, Math.round(barSpacing * 0.7));
            } else if (barSpacing >= 3) {
              candleWidth = Math.max(1, Math.floor(barSpacing - 1));
            }

            // 2. Velas Fantasma de Projeção Histórica (Vazadas somente nas bordas com largura padrão)
            const ghostListToUse = item.ghostCandles || [];

            if (item.showGhostCandles !== false && ghostListToUse && ghostListToUse.length > 0) {
              drawCtx.save();
              // Clip estrito para garantir que NENHUM elemento de projeção ultrapasse a margem da escala de preços
              drawCtx.beginPath();
              drawCtx.rect(0, 0, chartAreaWidth - 4, cHeight);
              drawCtx.clip();

              ghostListToUse.forEach((gc: any) => {
                const gx = xLast + gc.index * barSpacing;
                // Não desenha se estiver fora da área visível ou invadindo a legenda de preço à direita
                if (gx - candleWidth / 2 < 0 || gx + candleWidth / 2 > chartAreaWidth - 4) return;

                const yOpen = safePriceToY(gc.open);
                const yClose = safePriceToY(gc.close);
                const yHigh = gc.high !== undefined ? safePriceToY(gc.high) : null;
                const yLow = gc.low !== undefined ? safePriceToY(gc.low) : null;
                if (yOpen === null || yClose === null) return;

                const isBull = gc.isBullish;
                // Cores nítidas para os contornos vazados
                const bodyBorder = isBull ? '#22c55e' : '#ef4444';
                const wickColor = isBull ? '#22c55e' : '#ef4444';
                const lineWidth = 1.4;

                const bodyTop = Math.min(yOpen, yClose);
                const bodyBottom = Math.max(yOpen, yClose);
                const bodyHeight = Math.max(2.5, bodyBottom - bodyTop);
                const bodyLeft = Math.round(gx - candleWidth / 2);

                // 1. Pavio Superior Pontilhado (do High até o topo do corpo vazado - nunca corta o interior)
                if (yHigh !== null && !isNaN(yHigh) && yHigh < bodyTop) {
                  drawCtx.save();
                  drawCtx.strokeStyle = wickColor;
                  drawCtx.lineWidth = 1.2;
                  drawCtx.setLineDash([2, 2]);
                  drawCtx.beginPath();
                  drawCtx.moveTo(gx, yHigh);
                  drawCtx.lineTo(gx, bodyTop);
                  drawCtx.stroke();
                  drawCtx.restore();
                }

                // 2. Pavio Inferior Pontilhado (da base do corpo vazado até o Low - nunca corta o interior)
                if (yLow !== null && !isNaN(yLow) && yLow > bodyBottom) {
                  drawCtx.save();
                  drawCtx.strokeStyle = wickColor;
                  drawCtx.lineWidth = 1.2;
                  drawCtx.setLineDash([2, 2]);
                  drawCtx.beginPath();
                  drawCtx.moveTo(gx, bodyBottom);
                  drawCtx.lineTo(gx, yLow);
                  drawCtx.stroke();
                  drawCtx.restore();
                }

                // 3. Corpo Vazado Pontilhado do Candle (Efeito fantasma tracejado/pontilhado)
                drawCtx.save();
                drawCtx.strokeStyle = bodyBorder;
                drawCtx.lineWidth = lineWidth;
                drawCtx.setLineDash([2, 2]);
                drawCtx.beginPath();
                drawCtx.rect(bodyLeft, bodyTop, candleWidth, bodyHeight);
                drawCtx.stroke();
                drawCtx.restore();
              });

              drawCtx.restore();
            }

            // 3. Card Flutuante de Previsão Direcional com Posicionamento Responsivo e Dinâmico
            const fs = item.forecastSummary;

            if (item.showForecastBadge !== false && fs) {
              const yCurrent = safePriceToY(lastBar.close);
              if (yCurrent !== null && !isNaN(yCurrent)) {
                const rawBull = Number(fs.bullProbability || 50);
                const rawBear = Number(fs.bearProbability || (100 - rawBull));

                const isBull = fs.direction === 'COMPRA' || rawBull >= 54;
                const isBear = fs.direction === 'VENDA' || rawBear >= 54;

                let dirColor = '#eab308';
                let dirArrow = '● EQUILÍBRIO';
                let winRate = Math.max(rawBull, rawBear);

                if (isBull) {
                  dirColor = rawBull >= 65 ? '#22c55e' : '#4ade80';
                  dirArrow = rawBull >= 75 ? '▲ ALTA FORTE' : '▲ ALTA';
                  winRate = rawBull;
                } else if (isBear) {
                  dirColor = rawBear >= 65 ? '#ef4444' : '#f87171';
                  dirArrow = rawBear >= 75 ? '▼ BAIXA FORTE' : '▼ BAIXA';
                  winRate = rawBear;
                } else {
                  dirColor = '#eab308';
                  dirArrow = '● EQUILÍBRIO';
                  winRate = Math.max(rawBull, rawBear);
                }

                // Calcular limites verticais (Y) e horizontais (X) de todos os candles fantasmas
                let minGhostY: number | null = null;
                let maxGhostY: number | null = null;

                if (ghostListToUse && ghostListToUse.length > 0) {
                  ghostListToUse.forEach((gc: any) => {
                    const yO = safePriceToY(gc.open);
                    const yC = safePriceToY(gc.close);
                    const yH = gc.high !== undefined ? safePriceToY(gc.high) : null;
                    const yL = gc.low !== undefined ? safePriceToY(gc.low) : null;

                    [yO, yC, yH, yL].forEach(y => {
                      if (y !== null && !isNaN(y)) {
                        minGhostY = minGhostY === null ? y : Math.min(minGhostY, y);
                        maxGhostY = maxGhostY === null ? y : Math.max(maxGhostY, y);
                      }
                    });
                  });
                }

                const cardWidth = 195;
                const cardHeight = 100;
                const ghostCount = Math.max(1, ghostListToUse && ghostListToUse.length > 0 ? ghostListToUse.length : (item.forecastCandlesCount || 5));

                // Posição Horizontal (X): Centralizado entre 1º e último candle, com margem mínima no 2º candle
                const firstGhostX = xLast + 1 * barSpacing;
                const lastGhostX = xLast + ghostCount * barSpacing;
                const centerGhostX = (firstGhostX + lastGhostX) / 2;

                let cardLeft = centerGhostX - (cardWidth / 2);
                const minLeft = ghostCount >= 2 ? (xLast + 1.4 * barSpacing) : (xLast + 0.8 * barSpacing);
                if (cardLeft < minLeft) {
                  cardLeft = minLeft;
                }
                const maxLeft = Math.max(10, chartAreaWidth - cardWidth - 8);
                if (cardLeft > maxLeft) {
                  cardLeft = maxLeft;
                }

                // Posição Vertical (Y):
                let cardTop = yCurrent - (cardHeight / 2);

                if (isBull) {
                  const baseBottom = maxGhostY !== null ? maxGhostY : yCurrent;
                  cardTop = baseBottom + 16;
                  if (cardTop + cardHeight > cHeight - 15) {
                    if (minGhostY !== null && minGhostY - cardHeight - 16 >= 15) {
                      cardTop = minGhostY - cardHeight - 16;
                    } else {
                      cardTop = Math.max(15, cHeight - cardHeight - 15);
                    }
                  }
                } else if (isBear) {
                  const baseTop = minGhostY !== null ? minGhostY : yCurrent;
                  cardTop = baseTop - cardHeight - 16;
                  if (cardTop < 15) {
                    if (maxGhostY !== null && maxGhostY + 16 + cardHeight <= cHeight - 15) {
                      cardTop = maxGhostY + 16;
                    } else {
                      cardTop = 15;
                    }
                  }
                } else {
                  const baseBottom = maxGhostY !== null ? maxGhostY : yCurrent;
                  cardTop = baseBottom + 16;
                  if (cardTop + cardHeight > cHeight - 15) {
                    cardTop = Math.max(15, (minGhostY !== null ? minGhostY : yCurrent) - cardHeight - 16);
                  }
                }

                const cardStyle = `position: absolute; left: ${Math.round(cardLeft)}px; top: ${Math.round(cardTop)}px; width: ${cardWidth}px; background: rgba(10, 15, 29, 0.96); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1.5px solid ${dirColor}99; border-left: 4px solid ${dirColor}; border-radius: 8px; padding: 7px 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.92), 0 0 16px ${dirColor}26; color: #f8fafc; font-family: 'JetBrains Mono', monospace; pointer-events: none; user-select: none; z-index: 56; box-sizing: border-box;`;
                const cardHtml = `
                  <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10px; font-weight: 700; margin-bottom: 4px;">
                    <span style="color: #94a3b8; font-size: 9.5px; font-weight: 700;">🕒 Previsão Sazonal</span>
                    <span style="color: ${dirColor}; font-weight: 800; font-size: 10px; background: ${dirColor}20; padding: 1px 5px; border-radius: 4px; border: 1px solid ${dirColor}50;">${fs.forecastCandlesCount}V</span>
                  </div>
                  <div style="display: flex; align-items: baseline; gap: 5px; margin-bottom: 2px;">
                    <span style="font-size: 14.5px; font-weight: 900; color: ${dirColor}; letter-spacing: 0.2px;">${dirArrow} ${winRate}%</span>
                  </div>
                  <div style="font-size: 9px; color: #64748b; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 175px;">
                    Horário Projetado: [${fs.futureTimeStr}]
                  </div>
                  <div style="font-size: 10px; color: #cbd5e1; line-height: 1.3; font-weight: 500;">
                    <span>Média: <strong style="color: #f8fafc; font-weight: 700;">±${fs.expectedRangePts} pts</strong></span>
                    <span style="color: #94a3b8; margin-left: 3px; font-weight: 600;">(+${fs.expectedUpPts}/-${fs.expectedDownPts})</span>
                  </div>
                `;
                upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, 'th_forecast_badge', cardHtml, true, cardStyle);
              }
            }
          });
        }

        if (fCtx) {
          fCtx.restore();
        }

        if (btCtx) {
          try {
            const blockTradesWidget = (activeWidgetsRef.current || activeWidgetsProp || []).find(
              (w: any) => w.type === 'block_trades' && w.visible !== false
            );
            const widgetParams = blockTradesWidget?.params || {};
            const showOnCandles = blockTradesWidget ? (widgetParams.showOnCandles !== false) : false;
            const candleFontSize = typeof widgetParams.candleFontSize === 'number' ? widgetParams.candleFontSize : 11;
            const pixelOffset = typeof widgetParams.pixelOffset === 'number' ? widgetParams.pixelOffset : 8;
            const minContracts = typeof widgetParams.minContracts === 'number' ? widgetParams.minContracts : 50;

            if (showOnCandles && chartDataRef.current && chartDataRef.current.length > 0 && mainChartRef.current) {
              const timeScale = mainChartRef.current.timeScale();
              btCtx.font = `bold ${candleFontSize}px 'JetBrains Mono', 'Roboto Mono', monospace`;
              btCtx.textAlign = 'center';

              const lineStep = candleFontSize + 2;
              const map = candleBlockTradesMapRef.current;
              const allCandles = chartDataRef.current;

              let startIdx = 0;
              let endIdx = allCandles.length - 1;
              const logRange = timeScale.getVisibleLogicalRange ? timeScale.getVisibleLogicalRange() : null;
              if (logRange) {
                startIdx = Math.max(0, Math.floor(logRange.from) - 2);
                endIdx = Math.min(allCandles.length - 1, Math.ceil(logRange.to) + 2);
              }

              for (let ci = startIdx; ci <= endIdx; ci++) {
                const candle = allCandles[ci];
                if (!candle) continue;
                const tradeData = map.get(candle.time);
                if (!tradeData) continue;

                const sellList = (tradeData.sellVolumes || []).filter((v: number) => typeof v === 'number' && v >= minContracts);
                const buyList = (tradeData.buyVolumes || []).filter((v: number) => typeof v === 'number' && v >= minContracts);
                if (sellList.length === 0 && buyList.length === 0) continue;

                const x = timeScale.timeToCoordinate(candle.time as any);
                if (x === null || isNaN(x) || x < -30 || x > cWidth + 30) continue;

                // Venda: menor contrato mais próximo do pavio (abaixo) e maior contrato na linha acima
                if (sellList.length > 0) {
                  const highY = safePriceToY(candle.high);
                  if (highY !== null && !isNaN(highY) && highY >= 0 && highY <= cHeight) {
                    btCtx.save();
                    btCtx.textBaseline = 'bottom';
                    btCtx.fillStyle = '#f43f5e';
                    btCtx.shadowColor = 'rgba(0, 0, 0, 0.9)';
                    btCtx.shadowBlur = 4;
                    sellList.forEach((vol: number, idx: number) => {
                      const yPos = highY - pixelOffset - (idx * lineStep);
                      if (yPos >= -20 && yPos <= cHeight + 20) {
                        btCtx.fillText(String(vol), x, yPos);
                      }
                    });
                    btCtx.restore();
                  }
                }

                // Compra: menor contrato na linha acima (mais próximo do pavio) e maior contrato na linha abaixo
                if (buyList.length > 0) {
                  const lowY = safePriceToY(candle.low);
                  if (lowY !== null && !isNaN(lowY) && lowY >= 0 && lowY <= cHeight) {
                    btCtx.save();
                    btCtx.textBaseline = 'top';
                    btCtx.fillStyle = '#10b981';
                    btCtx.shadowColor = 'rgba(0, 0, 0, 0.9)';
                    btCtx.shadowBlur = 4;
                    buyList.forEach((vol: number, idx: number) => {
                      const yPos = lowY + pixelOffset + (idx * lineStep);
                      if (yPos >= -20 && yPos <= cHeight + 20) {
                        btCtx.fillText(String(vol), x, yPos);
                      }
                    });
                    btCtx.restore();
                  }
                }
              }
            }
          } catch (btErr) {
            console.warn('[BLOCK_TRADES_CANVAS] Erro ao renderizar nos candles:', btErr);
          } finally {
            btCtx.restore();
          }
        }

      if (effectiveLevels && Object.keys(effectiveLevels).length > 0 && shouldShowLevels) {
        Object.entries(LEVEL_CONFIGS).forEach(([key, cfg]) => {
          if (disabledLevels.includes(key)) return;
          const priceRaw = (effectiveLevels as any)[key];
          const priceVal = Number(priceRaw);
          if (priceRaw !== undefined && priceRaw !== null && !isNaN(priceVal) && priceVal > 0) {
            const y = safePriceToY(priceVal);
            if (y !== null && !isNaN(y) && y >= 0 && y <= containerEl.clientHeight) {
              const st = getLevelStyle(key, cfg.color);
              const styleStr = `position: absolute; left: 8px; top: ${y - 11}px; color: ${st.color}; font-size: 12px; font-family: 'JetBrains Mono', monospace; font-weight: bold; background: #090d16f0; padding: 2.5px 7px; border-radius: 3px; border: 1px solid ${st.color}80; line-height: 1; white-space: nowrap; box-shadow: 0 2px 5px rgba(0,0,0,0.6); z-index: 52;`;
              upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, `lvl_${key}`, cfg.label, false, styleStr);
            }
          }
        });

        if (!disabledLevels.includes('gex_count') && Array.isArray(effectiveLevels.gex)) {
          effectiveLevels.gex.forEach((priceVal: number, index: number) => {
            const gexNum = (index % 10) + 1;
            if (indLiquidityForFilter && indLiquidityForFilter.params && indLiquidityForFilter.params[`showGex${gexNum}`] === false) {
              return;
            }
            if (priceVal > 0) {
              const y = safePriceToY(priceVal);
              if (y !== null && !isNaN(y) && y >= 0 && y <= containerEl.clientHeight) {
                const styleStr = `position: absolute; left: 8px; top: ${y - 11}px; color: #a855f7; font-size: 12px; font-family: 'JetBrains Mono', monospace; font-weight: bold; background: #090d16f0; padding: 2.5px 7px; border-radius: 3px; border: 1px solid #a855f780; line-height: 1; white-space: nowrap; box-shadow: 0 2px 5px rgba(0,0,0,0.6); z-index: 52;`;
                upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, `lvl_gex_${index}`, `GEX${gexNum}`, false, styleStr);
              }
            }
          });
        }

        if (!disabledLevels.includes('bl_count') && Array.isArray(effectiveLevels.bl)) {
          effectiveLevels.bl.forEach((priceVal: number, index: number) => {
            const blNum = (index % 10) + 1;
            if (indLiquidityForFilter && indLiquidityForFilter.params && indLiquidityForFilter.params[`showBl${blNum}`] === false) {
              return;
            }
            if (priceVal > 0) {
              const y = safePriceToY(priceVal);
              if (y !== null && !isNaN(y) && y >= 0 && y <= containerEl.clientHeight) {
                const styleStr = `position: absolute; left: 8px; top: ${y - 11}px; color: #3b82f6; font-size: 12px; font-family: 'JetBrains Mono', monospace; font-weight: bold; background: #090d16e0; padding: 2.5px 7px; border-radius: 3px; border: 1px solid #3b82f650; line-height: 1; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.4); z-index: 52;`;
                upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, `lvl_bl_${index}`, `BL${blNum}`, false, styleStr);
              }
            }
          });
        }
      }

      // Renderizar Rótulos do Indicador STRIKE_LEVELS (Gamma & Opções do Feed Grix)
      if (effectiveShowStrikeLevels && marketMatrixFeedRef.current && labelsContainer) {
        const f = marketMatrixFeedRef.current;
        const params = strikeLevelsIndConfig?.params || {};
        const currentPrice = (chartData && chartData.length > 0) ? chartData[chartData.length - 1].close : 0;
        const manualFactor = Number(params.fatorManual) || 0;
        const calibrate = params.calibrarPeloPreco !== false;

        interface RawStrikeLvl {
          name: string;
          qqq: number;
          color: string;
          lineWidth: number;
        }

        const rawList: RawStrikeLvl[] = [];
        if (params.showCallWall !== false && f.cw > 0) rawList.push({ name: 'Call Wall', qqq: f.cw, color: '#32cd32', lineWidth: 1.5 });
        if (params.showPoc !== false && f.poc > 0) rawList.push({ name: 'POC', qqq: f.poc, color: '#f59e0b', lineWidth: 1.5 });
        if (params.showPutWall !== false && f.pw > 0) rawList.push({ name: 'Put Wall', qqq: f.pw, color: '#ef4444', lineWidth: 1.5 });
        if (params.showGammaWallSup !== false && f.gw_sup > 0) rawList.push({ name: 'Gamma Wall', qqq: f.gw_sup, color: '#3cb371', lineWidth: 1.2 });
        if (params.showFlip !== false && f.flip > 0) rawList.push({ name: 'Flip Zone', qqq: f.flip, color: '#d1d5db', lineWidth: 1.2 });
        if (params.showGammaWallInf !== false && f.gw_inf > 0) rawList.push({ name: 'Gamma Wall inf.', qqq: f.gw_inf, color: '#dc2626', lineWidth: 1.2 });
        if (params.showSigma !== false) {
          if (f.sigma_sup && f.sigma_sup > 0) rawList.push({ name: 'SIGMA ↑ venda', qqq: f.sigma_sup, color: '#ef4444', lineWidth: 1.8 });
          if (f.sigma_inf && f.sigma_inf > 0) rawList.push({ name: 'SIGMA ↓ compra', qqq: f.sigma_inf, color: '#22c55e', lineWidth: 1.8 });
        }
        if (params.showHeatmap !== false) {
          if (f.hm_oi_call && f.hm_oi_call > 0) rawList.push({ name: 'HM call (OI)', qqq: f.hm_oi_call, color: '#8fbc8f', lineWidth: 1.0 });
          if (f.hm_oi_put && f.hm_oi_put > 0) rawList.push({ name: 'HM put (OI)', qqq: f.hm_oi_put, color: '#bc8f8f', lineWidth: 1.0 });
          if (f.hm_oi_flip && f.hm_oi_flip > 0) rawList.push({ name: 'HM flip (OI)', qqq: f.hm_oi_flip, color: '#c0c0c0', lineWidth: 1.0 });
          if (f.hm_vol_call && f.hm_vol_call > 0) rawList.push({ name: 'HM call (VOL)', qqq: f.hm_vol_call, color: '#7fffd4', lineWidth: 1.0 });
          if (f.hm_vol_put && f.hm_vol_put > 0) rawList.push({ name: 'HM put (VOL)', qqq: f.hm_vol_put, color: '#fa8072', lineWidth: 1.0 });
          if (f.hm_vol_flip && f.hm_vol_flip > 0) rawList.push({ name: 'HM flip (VOL)', qqq: f.hm_vol_flip, color: '#b0c4de', lineWidth: 1.0 });
        }
        if (params.showRange !== false) {
          if (f.range_max && f.range_max > 0) rawList.push({ name: 'Range máx. (venda)', qqq: f.range_max, color: '#ee82ee', lineWidth: 1.6 });
          if (f.range_min && f.range_min > 0) rawList.push({ name: 'Range mín. (compra)', qqq: f.range_min, color: '#ee82ee', lineWidth: 1.6 });
        }

        const groupedLevels: RawStrikeLvl[] = [];
        for (const item of rawList) {
          const ex = groupedLevels.find(x => Math.abs(x.qqq - item.qqq) < 0.005);
          if (!ex) {
            groupedLevels.push({ ...item });
          } else {
            ex.name += ` · ${item.name}`;
            if (item.lineWidth > ex.lineWidth) {
              ex.lineWidth = item.lineWidth;
              ex.color = item.color;
            }
          }
        }

        // Traça os rótulos agrupados no canto direito do gráfico (estilo NinjaTrader)
        groupedLevels.forEach((g, idx) => {
          const nqPrice = convertQqqToNq(g.qqq, f, currentPrice, manualFactor, 0, calibrate);
          if (nqPrice > 0) {
            const y = safePriceToY(nqPrice);
            if (y !== null && !isNaN(y) && y >= 0 && y <= containerEl.clientHeight) {
              const labelText = `${g.name} QQQ ${g.qqq.toFixed(2)} | NQ ${nqPrice.toFixed(2)}`;
              const styleStr = `position: absolute; right: ${effectivePriceScaleWidth + 8}px; top: ${y - 10}px; color: ${g.color}; font-size: 11px; font-family: 'JetBrains Mono', monospace; font-weight: bold; background: #090d16f0; padding: 2px 6px; border-radius: 3px; border: 1px solid ${g.color}70; line-height: 1; white-space: nowrap; box-shadow: 0 2px 5px rgba(0,0,0,0.7); z-index: 52;`;
              upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, `strike_lvl_${idx}`, labelText, false, styleStr);
            }
          }
        });

        // Rodapé do Feed Grix no canto inferior direito
        if (params.showFeedStatus !== false) {
          const feedTime = f.hora_et ? `${f.hora_et} ET` : 'ativo';
          const feedFooterStyle = `position: absolute; right: ${effectivePriceScaleWidth + 12}px; bottom: 8px; font-size: 10px; font-family: 'JetBrains Mono', monospace; color: #94a3b8; background: rgba(9, 13, 22, 0.85); padding: 2px 7px; border-radius: 3px; border: 1px solid #334155; line-height: 1.2; z-index: 45; pointer-events: none;`;
          const feedFooterText = `Feed Grix: dados ${feedTime} · QQQ ${f.qqq.toFixed(2)} (fator ${f.fator.toFixed(4)})`;
          upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, 'strike_feed_footer', feedFooterText, false, feedFooterStyle);
        }
      }

      // Draw Trade labels (Entry, Stop Loss, Take Profit) para todas as operações ativas ou proposta
      {
        const targetId = activePanel?.instance_id || instanceId || 'painel_principal';
        const activeAccountId = activeAccount?.id || null;
        const currentReportsToUse: any[] = (reportsRef.current && reportsRef.current.length > 0) ? reportsRef.current : (reports || []);
        const activeReportsToDraw = isSimulatorMode
          ? (simulatedReports && Array.isArray(simulatedReports)
              ? simulatedReports.filter((r: any) => r.status === 'Em Andamento')
              : [])
          : currentReportsToUse.filter(
              (r: any) =>
                (r.panel_id === activePanel?.id || r.instance_id === targetId || (!r.instance_id && targetId === 'painel_principal')) &&
                r.status === 'Em Andamento' &&
                (!activeAccountId || r.account_id === activeAccountId)
            );

        const tradesToDraw: any[] = [...activeReportsToDraw];
        if (activePosition) {
          const actEntry = activePosition.entry_price !== undefined ? activePosition.entry_price : activePosition.entryPrice;
          const actSl = activePosition.stop_loss !== undefined ? activePosition.stop_loss : activePosition.stopLoss;
          const actTp = activePosition.take_profit !== undefined ? activePosition.take_profit : activePosition.takeProfit;
          const actStrat = activePosition.strategy_name || activePosition.strategyName || 'Operação';
          const actLots = activePosition.contrato || activePosition.contracts || 1;

          const isClosedInReports = isSimulatorMode ? false : currentReportsToUse.some(
            (r: any) => (r.id === activePosition.id || (r.entry_price === actEntry && r.side === activePosition.side)) && r.status !== 'Em Andamento'
          );
          if (!isClosedInReports) {
            const alreadyInReports = tradesToDraw.some((r: any) => r.id === activePosition.id || (r.entry_price === actEntry && r.side === activePosition.side && r.take_profit === actTp));
            if (!alreadyInReports) {
              tradesToDraw.push({
                id: activePosition.id || 'active-pos',
                entry_price: actEntry,
                stop_loss: actSl,
                take_profit: actTp,
                strategy_name: actStrat,
                side: activePosition.side,
                contrato: actLots,
                status: 'Em Andamento'
              });
            }
          }
        }
        if (proposedTrade) {
          tradesToDraw.push({ ...proposedTrade, isProposed: true, id: 'proposed' });
        }

        const hasRealTrades = tradesToDraw.length > 0;
        const keySl = isSimulatorMode || isSimulator ? 'vortex_replay_custom_sl_price' : 'vortex_custom_sl_price';
        const keyTp = isSimulatorMode || isSimulator ? 'vortex_replay_custom_tp_price' : 'vortex_custom_tp_price';
        const keyMode = isSimulatorMode || isSimulator ? 'vortex_replay_stop_mode' : 'vortex_stop_mode';
        const currentStopMode = typeof window !== 'undefined' ? localStorage.getItem(keyMode) : null;
        const savedSl = typeof window !== 'undefined' ? localStorage.getItem(keySl) : null;
        const savedTp = typeof window !== 'undefined' ? localStorage.getItem(keyTp) : null;
        const activeMarkingState = markingSlTpStateRef.current;
        const activeTempSl = tempSlPriceRef.current;
        const customSl = activeTempSl !== null ? activeTempSl : (activeMarkingState === 'marking_sl' ? null : (savedSl ? Number(savedSl) : null));
        const customTp = (activeMarkingState === 'marking_sl' || activeMarkingState === 'marking_tp') ? null : (savedTp ? Number(savedTp) : null);
        const markerPanelId = typeof window !== 'undefined' ? localStorage.getItem('vortex_custom_sltp_panel_id') : null;
        const isMarkerForThisPanel = isSimulatorMode || isSimulator || !markerPanelId || !activePanel?.id || markerPanelId === activePanel.id;

        if (!hasRealTrades && isMarkerForThisPanel && (currentStopMode === 'grafico' || activeMarkingState !== null) && (customSl !== null || customTp !== null)) {
          const refEntry = currentPriceRef.current || (chartDataRef.current.length > 0 ? chartDataRef.current[chartDataRef.current.length - 1].close : 0);
          tradesToDraw.push({
            id: 'custom_marker',
            entry_price: refEntry,
            stop_loss: customSl !== null ? customSl : 0,
            take_profit: customTp !== null ? customTp : 0,
            strategy_name: 'Marcação Gráfico',
            side: (customSl && customSl < refEntry ? 'COMPRA' : 'VENDA'),
            contrato: finalContractsToUse || 1,
            isProposed: true,
            isProvisionalMarker: true
          });
        }

        if (!hasRealTrades && currentStopMode === 'range') {
          const refEntry = currentPriceRef.current || (chartDataRef.current.length > 0 ? chartDataRef.current[chartDataRef.current.length - 1].close : 0);
          if (refEntry > 0) {
            const keyRangeRef = isSimulatorMode || isSimulator ? 'vortex_replay_range_candle_ref' : 'vortex_range_candle_ref';
            const keyRangeMult = isSimulatorMode || isSimulator ? 'vortex_replay_range_tp_multiplier' : 'vortex_range_tp_multiplier';
            const keyRangeSide = isSimulatorMode || isSimulator ? 'vortex_replay_range_side' : 'vortex_range_side';
            const candleRef = typeof window !== 'undefined' ? Number(localStorage.getItem(keyRangeRef) || (settings?.chart_manual_range_candle_ref ?? 1)) : 1;
            const tpMult = typeof window !== 'undefined' ? Number(localStorage.getItem(keyRangeMult) || (settings?.chart_manual_range_tp_multiplier ?? 1.0)) : 1.0;
            const rangeSide = typeof window !== 'undefined' ? (localStorage.getItem(keyRangeSide) || 'COMPRA') : 'COMPRA';
            const candles = chartDataRef.current || [];
            const tickSz = resolvePanelTickSize(activePanel, settings) || 0.25;

            if (rangeSide === 'COMPRA' || rangeSide === 'AMBOS') {
              const buyLvl = calculateRangeHlLevels('COMPRA', refEntry, candles, candleRef, tpMult, tickSz);
              tradesToDraw.push({
                id: 'range_marker_buy',
                entry_price: refEntry,
                stop_loss: buyLvl.slPrice,
                take_profit: buyLvl.tpPrice,
                strategy_name: 'Range HL (Compra)',
                side: 'COMPRA',
                contrato: finalContractsToUse || 1,
                isProposed: true,
                isProvisionalMarker: true,
                rangeOffset: 88
              });
            }

            if (rangeSide === 'VENDA' || rangeSide === 'AMBOS') {
              const sellLvl = calculateRangeHlLevels('VENDA', refEntry, candles, candleRef, tpMult, tickSz);
              tradesToDraw.push({
                id: 'range_marker_sell',
                entry_price: refEntry,
                stop_loss: sellLvl.slPrice,
                take_profit: sellLvl.tpPrice,
                strategy_name: 'Range HL (Venda)',
                side: 'VENDA',
                contrato: finalContractsToUse || 1,
                isProposed: true,
                isProvisionalMarker: true,
                rangeOffset: rangeSide === 'AMBOS' ? 290 : 88
              });
            }
          }
        }

        if (!hasRealTrades && currentStopMode === 'nivel') {
          const refEntry = currentPriceRef.current || (chartDataRef.current.length > 0 ? chartDataRef.current[chartDataRef.current.length - 1].close : 0);
          if (refEntry > 0) {
            const keyNivelSide = isSimulatorMode || isSimulator ? 'vortex_replay_nivel_side' : 'vortex_nivel_side';
            const nivelSide = typeof window !== 'undefined' ? (localStorage.getItem(keyNivelSide) || 'AMBOS') : 'AMBOS';
            const tickSz = resolvePanelTickSize(activePanel, settings) || 0.25;
            const ptsSl = manualSlPoints && manualSlPoints > 0 ? manualSlPoints : 50;
            const ptsTp = manualTpPoints && manualTpPoints > 0 ? manualTpPoints : 25;

            if (nivelSide === 'COMPRA' || nivelSide === 'AMBOS') {
              const slBuy = roundToTick(resolveLevelPrice('COMPRA', 'SL', refEntry, gammaLevels, ptsSl, ptsTp), tickSz);
              const tpBuy = roundToTick(resolveLevelPrice('COMPRA', 'TP', refEntry, gammaLevels, ptsSl, ptsTp), tickSz);
              tradesToDraw.push({
                id: 'nivel_marker_buy',
                entry_price: refEntry,
                stop_loss: slBuy,
                take_profit: tpBuy,
                strategy_name: 'Nível (Compra)',
                side: 'COMPRA',
                contrato: finalContractsToUse || 1,
                isProposed: true,
                isProvisionalMarker: true,
                rangeOffset: 88
              });
            }

            if (nivelSide === 'VENDA' || nivelSide === 'AMBOS') {
              const slSell = roundToTick(resolveLevelPrice('VENDA', 'SL', refEntry, gammaLevels, ptsSl, ptsTp), tickSz);
              const tpSell = roundToTick(resolveLevelPrice('VENDA', 'TP', refEntry, gammaLevels, ptsSl, ptsTp), tickSz);
              tradesToDraw.push({
                id: 'nivel_marker_sell',
                entry_price: refEntry,
                stop_loss: slSell,
                take_profit: tpSell,
                strategy_name: 'Nível (Venda)',
                side: 'VENDA',
                contrato: finalContractsToUse || 1,
                isProposed: true,
                isProvisionalMarker: true,
                rangeOffset: nivelSide === 'AMBOS' ? 290 : 88
              });
            }
          }
        }

        {
          const showCards = showOrderLinesRef.current;
          const axisFontSize = (settings?.chart_scale_font_size || Number(typeof localStorage !== 'undefined' ? localStorage.getItem('vortex_chart_scale_font_size') : 12)) || 12;
          const paneWidth = mainChartRef.current?.paneSize?.()?.width;
          const priceScaleWidth = mainChartRef.current?.priceScale('right')?.width?.() || 85;
          const priceAxisLeft = (typeof paneWidth === 'number' && paneWidth > 0)
            ? (paneWidth + 1)
            : Math.max(0, containerEl.clientWidth - priceScaleWidth + 1);
          const makePriceAxisBadgeStyle = (yPos: number, bg: string, zIdx: number, opacityVal: number, extraStyle = '') =>
            `position: absolute; left: ${priceAxisLeft}px; top: ${yPos}px; transform: translateY(-50%); color: #ffffff; background: ${bg}; font-size: ${axisFontSize}px; font-family: 'JetBrains Mono', monospace; font-weight: 500; padding: 2px 9px; border-radius: 2px; line-height: 1.25; white-space: nowrap; z-index: ${zIdx}; opacity: ${opacityVal}; ${extraStyle}`;

          tradesToDraw.forEach(tradeToDraw => {
          const tradeId = tradeToDraw.id || 'proposed';
          const isCustomMarker = tradeId === 'custom_marker';
          const isRangeMarker = tradeId === 'range_marker_buy' || tradeId === 'range_marker_sell' || tradeId === 'range_marker';
          const isLevelMarker = tradeId === 'nivel_marker_buy' || tradeId === 'nivel_marker_sell' || tradeId === 'nivel_marker';
          const rightOffset = (tradeToDraw as any).rangeOffset || (isMobile && hidePriceScaleMobile ? 12 : 88);
          const entryPrice = 'entry_price' in tradeToDraw ? Number((tradeToDraw as any).entry_price) : Number((tradeToDraw as any).entry);
          const rawStopLossPrice = 'stop_loss' in tradeToDraw ? Number((tradeToDraw as any).stop_loss) : Number((tradeToDraw as any).stopLoss);
          const rawTakeProfitPrice = 'take_profit' in tradeToDraw ? Number((tradeToDraw as any).take_profit) : Number((tradeToDraw as any).takeProfit);
          const sideText = 'side' in tradeToDraw ? (tradeToDraw as any).side : '';
          const isProposed = !!tradeToDraw.isProposed || !('id' in tradeToDraw && tradeToDraw.id !== 'proposed');

          const rawContracts = Number((tradeToDraw as any).contrato || (tradeToDraw as any).contracts || (tradeToDraw as any).quantity || (tradeToDraw as any).lots || (isProposed ? finalContractsToUse : 1));
          const contractsCount = isNaN(rawContracts) || rawContracts <= 0 ? 1 : rawContracts;
          const qtyPrefix = contractsCount > 1 ? `${contractsCount}x ` : '';

          const isDraggingSl = draggedLevelsRef.current.reportId === tradeId && draggedLevelsRef.current.type === 'stop_loss';
          const isDraggingTp = draggedLevelsRef.current.reportId === tradeId && draggedLevelsRef.current.type === 'take_profit';

          const opt = optimisticReportLevelsRef.current.get(tradeId);
          const isOptValid = opt && (Date.now() - opt.timestamp < 30000);

          const stopLossPrice = isDraggingSl && draggedLevelsRef.current.price !== null
            ? draggedLevelsRef.current.price
            : (isOptValid && opt.stop_loss !== undefined
                ? (opt.stop_loss !== null ? Number(opt.stop_loss) : 0)
                : rawStopLossPrice);

          const takeProfitPrice = isDraggingTp && draggedLevelsRef.current.price !== null
            ? draggedLevelsRef.current.price
            : (isOptValid && opt.take_profit !== undefined
                ? (opt.take_profit !== null ? Number(opt.take_profit) : 0)
                : rawTakeProfitPrice);

          let slEl: HTMLElement | null = null;
          let tpEl: HTMLElement | null = null;

          if (!isNaN(stopLossPrice) && stopLossPrice > 0) {
            const y = safePriceToY(stopLossPrice);
            if (y !== null && !isNaN(y) && y >= -40 && y <= containerEl.clientHeight + 40) {
              const ptsDiff = !isNaN(entryPrice) && entryPrice > 0 ? Math.abs(stopLossPrice - entryPrice) : 0;
              const slUsd = ptsDiff * contractsCount * pointValueForPanel;
              const isBuy = sideText === 'COMPRA' || sideText === 'BUY';
              const isSlGain = !isNaN(entryPrice) && entryPrice > 0 && (isBuy ? stopLossPrice > entryPrice : stopLossPrice < entryPrice);
              const isSlBe = !isNaN(entryPrice) && entryPrice > 0 && Math.abs(stopLossPrice - entryPrice) < 0.01;

              const slSign = isSlGain ? '+' : (isSlBe ? '' : '-');
              const slUsdStr = ptsDiff > 0 ? `${slSign}$${slUsd.toFixed(2)}` : (isSlBe ? '$0.00' : '');
              const ptsDiffStr = ptsDiff > 0 ? `${ptsDiff.toFixed(2)} pts` : (isSlBe ? '0.00 pts' : '');
              const ptsLabel = (ptsDiff > 0 || isSlBe) ? ` (${qtyPrefix}${slUsdStr ? `${slUsdStr} | ` : ''}${ptsDiffStr})` : '';
              const slTitle = isCustomMarker 
                ? 'SL MARCADO ↕' 
                : (isRangeMarker 
                    ? `SL RANGE (${sideText}) ↕` 
                    : (isLevelMarker
                        ? `SL NÍVEL (${sideText}) ↕`
                        : (isSlGain ? 'STOP GAIN ↕' : (isSlBe ? 'BREAK-EVEN ↕' : 'STOP ↕'))));

              const slColor = isSlGain ? '#10b981' : (isSlBe ? '#38bdf8' : '#ef4444');
              const slBg = isDraggingSl ? (isSlGain ? '#064e3b' : (isSlBe ? '#0c4a6e' : '#7f1d1d')) : '#090d16e0';
              const slBorder = isDraggingSl ? (isSlGain ? '2px solid #34d399' : (isSlBe ? '2px solid #38bdf8' : '2px solid #f87171')) : `1.5px solid ${slColor}`;
              const slShadow = isDraggingSl ? `0 0 12px ${slColor}` : '0 1px 4px rgba(0,0,0,0.5)';

              if (showCards) {
                const styleSl = `position: absolute; right: ${rightOffset}px; top: ${y - 12}px; color: ${slColor}; font-size: 13px; font-family: 'JetBrains Mono', monospace; font-weight: bold; background: ${slBg}; padding: 3px 7px; border-radius: 4px; border: ${slBorder}; line-height: 1; white-space: nowrap; box-shadow: ${slShadow}; opacity: ${isProposed ? 0.9 : 1}; pointer-events: auto; cursor: ${isRangeMarker || isLevelMarker ? 'default' : 'ns-resize'}; user-select: none; touch-action: none; z-index: ${isDraggingSl ? 200 : 110};`;
                const slTooltip = isRangeMarker
                  ? `SL Range HL (${sideText}): ${stopLossPrice.toFixed(2)} (${ptsDiffStr} | ${slUsdStr}). Baseado na ${sideText === 'COMPRA' ? 'mínima' : 'máxima'} dos candles.`
                  : (isLevelMarker
                      ? `SL Nível (${sideText}): ${stopLossPrice.toFixed(2)} (${ptsDiffStr} | ${slUsdStr}). Baseado em níveis técnicos e gamma.`
                      : `${isSlGain ? 'Stop Gain' : (isSlBe ? 'Break-Even' : 'Stop Loss')}: ${stopLossPrice.toFixed(2)} (${ptsDiffStr}). Clique e arraste para ajustar.`);
                slEl = upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, `trade_sl_${tradeId}`, `<span>${slTitle}${ptsLabel}</span>`, true, styleSl, slTooltip);
                if (!isRangeMarker && !isLevelMarker) {
                  (slEl as any).onpointerdown = (e: any) => startDraggingLevel(tradeId, 'stop_loss', stopLossPrice, e);
                  (slEl as any).onmousedown = (e: any) => startDraggingLevel(tradeId, 'stop_loss', stopLossPrice, e);
                  (slEl as any).ontouchstart = (e: any) => startDraggingLevel(tradeId, 'stop_loss', stopLossPrice, e);
                }
              }

              const badgeBg = isDraggingSl 
                ? (isSlGain ? '#059669' : (isSlBe ? '#0284c7' : '#b91c1c')) 
                : slColor;
              const styleSlBadge = makePriceAxisBadgeStyle(
                y,
                badgeBg,
                isDraggingSl ? 200 : 110,
                isProposed ? 0.9 : 1,
                `box-shadow: ${isDraggingSl ? `0 0 10px ${slColor}` : 'none'}; pointer-events: auto; cursor: ${isRangeMarker || isLevelMarker ? 'default' : 'ns-resize'}; user-select: none; touch-action: none;`
              );
              const slBadgeTooltip = isRangeMarker ? `SL Range HL: ${stopLossPrice.toFixed(2)}` : (isLevelMarker ? `SL Nível: ${stopLossPrice.toFixed(2)}` : `Clique e arraste para ajustar o ${isSlGain ? 'Stop Gain' : (isSlBe ? 'Break-Even' : 'Stop Loss')}`);
              const slBadgeEl = upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, `trade_sl_badge_${tradeId}`, stopLossPrice.toFixed(2), false, styleSlBadge, slBadgeTooltip);
              if (!isRangeMarker && !isLevelMarker) {
                (slBadgeEl as any).onpointerdown = (e: any) => startDraggingLevel(tradeId, 'stop_loss', stopLossPrice, e);
                (slBadgeEl as any).onmousedown = (e: any) => startDraggingLevel(tradeId, 'stop_loss', stopLossPrice, e);
                (slBadgeEl as any).ontouchstart = (e: any) => startDraggingLevel(tradeId, 'stop_loss', stopLossPrice, e);
              }
            }
          }

          if (!isNaN(takeProfitPrice) && takeProfitPrice > 0) {
            const y = safePriceToY(takeProfitPrice);
            if (y !== null && !isNaN(y) && y >= -40 && y <= containerEl.clientHeight + 40) {
              const ptsDiff = !isNaN(entryPrice) && entryPrice > 0 ? Math.abs(takeProfitPrice - entryPrice) : 0;
              const tpUsd = ptsDiff * contractsCount * pointValueForPanel;
              const tpUsdStr = ptsDiff > 0 ? `+$${tpUsd.toFixed(2)}` : '';
              const ptsDiffStr = ptsDiff > 0 ? `${ptsDiff.toFixed(2)} pts` : '';
              const ptsLabel = ptsDiff > 0 ? ` (${qtyPrefix}${tpUsdStr ? `${tpUsdStr} | ` : ''}${ptsDiffStr})` : '';
              const stratName = String((tradeToDraw as any).strategy_name || (tradeToDraw as any).strategyName || '');
              const targetMatch = stratName.match(/Alvo\s*(\d+)/i);
              const targetNumStr = targetMatch ? ` ${targetMatch[1]}` : '';
              const tpTitle = isCustomMarker 
                ? 'TP MARCADO ↕' 
                : (isRangeMarker 
                    ? `TP RANGE (${sideText}) ↕` 
                    : (isLevelMarker
                        ? `TP NÍVEL (${sideText}) ↕`
                        : `ALVO${targetNumStr} ↕`));

              if (showCards) {
                const styleTp = `position: absolute; right: ${rightOffset}px; top: ${y - 12}px; color: #22c55e; font-size: 13px; font-family: 'JetBrains Mono', monospace; font-weight: bold; background: ${isDraggingTp ? '#14532d' : '#090d16e0'}; padding: 3px 7px; border-radius: 4px; border: ${isDraggingTp ? '2px solid #4ade80' : '1.5px solid #22c55e'}; line-height: 1; white-space: nowrap; box-shadow: ${isDraggingTp ? '0 0 12px rgba(34,197,94,0.9)' : '0 1px 4px rgba(0,0,0,0.5)'}; opacity: ${isProposed ? 0.7 : 1}; pointer-events: auto; cursor: ${isRangeMarker || isLevelMarker ? 'default' : 'ns-resize'}; user-select: none; touch-action: none; z-index: ${isDraggingTp ? 200 : 110};`;
                const tpTooltip = isRangeMarker
                  ? `TP Range HL (${sideText}): ${takeProfitPrice.toFixed(2)} (${tpUsdStr} | ${ptsDiffStr}). Baseado no fator multiplicador.`
                  : (isLevelMarker
                      ? `TP Nível (${sideText}): ${takeProfitPrice.toFixed(2)} (${tpUsdStr} | ${ptsDiffStr}). Baseado em níveis técnicos e gamma.`
                      : `Take Profit: ${takeProfitPrice.toFixed(2)} (${tpUsdStr} | ${ptsDiffStr}). Clique e arraste para ajustar.`);
                tpEl = upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, `trade_tp_${tradeId}`, `<span>${tpTitle}${ptsLabel}</span>`, true, styleTp, tpTooltip);
                if (!isRangeMarker && !isLevelMarker) {
                  (tpEl as any).onpointerdown = (e: any) => startDraggingLevel(tradeId, 'take_profit', takeProfitPrice, e);
                  (tpEl as any).onmousedown = (e: any) => startDraggingLevel(tradeId, 'take_profit', takeProfitPrice, e);
                  (tpEl as any).ontouchstart = (e: any) => startDraggingLevel(tradeId, 'take_profit', takeProfitPrice, e);
                }
              }

              const styleTpBadge = makePriceAxisBadgeStyle(
                y,
                isDraggingTp ? '#15803d' : '#22c55e',
                isDraggingTp ? 200 : 110,
                isProposed ? 0.7 : 1,
                `box-shadow: ${isDraggingTp ? '0 0 10px rgba(34,197,94,0.9)' : 'none'}; pointer-events: auto; cursor: ${isRangeMarker || isLevelMarker ? 'default' : 'ns-resize'}; user-select: none; touch-action: none;`
              );
              const tpBadgeTooltip = isRangeMarker ? `TP Range HL: ${takeProfitPrice.toFixed(2)}` : (isLevelMarker ? `TP Nível: ${takeProfitPrice.toFixed(2)}` : 'Clique e arraste para ajustar o Take Profit');
              const tpBadgeEl = upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, `trade_tp_badge_${tradeId}`, takeProfitPrice.toFixed(2), false, styleTpBadge, tpBadgeTooltip);
              if (!isRangeMarker && !isLevelMarker) {
                (tpBadgeEl as any).onpointerdown = (e: any) => startDraggingLevel(tradeId, 'take_profit', takeProfitPrice, e);
                (tpBadgeEl as any).onmousedown = (e: any) => startDraggingLevel(tradeId, 'take_profit', takeProfitPrice, e);
                (tpBadgeEl as any).ontouchstart = (e: any) => startDraggingLevel(tradeId, 'take_profit', takeProfitPrice, e);
              }
            }
          }

          if (!isCustomMarker && !isRangeMarker && !isLevelMarker && !isNaN(entryPrice) && entryPrice > 0) {
            const y = safePriceToY(entryPrice);
            if (y !== null && !isNaN(y) && y >= -40 && y <= containerEl.clientHeight + 40) {
              const currentPriceVal = currentPriceRef.current || (chartDataRef.current.length > 0 ? chartDataRef.current[chartDataRef.current.length - 1].close : entryPrice);
              const isBuy = sideText === 'COMPRA' || sideText === 'BUY';
              const curPtsDiff = isBuy ? (currentPriceVal - entryPrice) : (entryPrice - currentPriceVal);
              const curPnlUsd = curPtsDiff * contractsCount * pointValueForPanel;
              const pnlSign = curPnlUsd >= 0 ? '+' : '-';
              const ptsSign = curPtsDiff >= 0 ? '+' : '-';
              const pnlFormatted = `${pnlSign}$${Math.abs(curPnlUsd).toFixed(2)}`;
              const ptsFormatted = `${ptsSign}${Math.abs(curPtsDiff).toFixed(2)} pts`;

              if (showCards) {
                const entryText = !isMobile
                  ? (sideText || 'ENTRADA')
                  : (isProposed
                      ? `${sideText || 'ENTRADA'} ${qtyPrefix}(PENDENTE)`
                      : `${sideText || 'ENTRADA'} ${qtyPrefix}(${pnlFormatted} | ${ptsFormatted})`);

                const entryBg = isProposed ? '#090d16e0' : (curPnlUsd >= 0 ? '#064e3be0' : '#4c0519e0');
                const entryBorder = isProposed ? '#38bdf8' : (curPnlUsd >= 0 ? '#10b981' : '#f43f5e');
                const entryTextColor = isProposed ? '#38bdf8' : (curPnlUsd >= 0 ? '#34d399' : '#fb7185');

                const refCardWidth = Math.max(slEl ? slEl.offsetWidth : 0, tpEl ? tpEl.offsetWidth : 0);
                const entryPositionStyle = (!isMobile && refCardWidth > 0)
                  ? `right: ${rightOffset + refCardWidth / 2}px; transform: translateX(50%);`
                  : `right: ${rightOffset}px;`;

                const styleEntry = `position: absolute; ${entryPositionStyle} top: ${y - 11}px; color: ${entryTextColor}; font-size: 13px; font-family: 'JetBrains Mono', monospace; font-weight: bold; background: ${entryBg}; padding: 3px 6px; border-radius: 3px; border: 1px solid ${entryBorder}; line-height: 1; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.4); opacity: ${isProposed ? 0.7 : 1};`;
                upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, `trade_entry_${tradeId}`, entryText, false, styleEntry);
              }

              const styleBadge = makePriceAxisBadgeStyle(y, '#0284c7', 100, isProposed ? 0.7 : 1);
              upsertPooledEl(labelsContainer, labelPool, usedLabelKeys, `trade_badge_${tradeId}`, entryPrice.toFixed(2), false, styleBadge);
            }
          }
        });
        }
      }

      cleanupPooledEls(labelPool, usedLabelKeys);
    }

      // Render Economic News Vertical Lines & Footer Badges in Chart Panel (Pooled DOM, zero innerHTML clearing)
      let newsOverlayContainer = containerEl.querySelector('.chart-news-overlay') as HTMLElement;
      if (!newsOverlayContainer) {
        newsOverlayContainer = document.createElement('div');
        newsOverlayContainer.className = 'chart-news-overlay';
        newsOverlayContainer.setAttribute('style', 'position: absolute; right: 0; top: 0; bottom: 0; left: 0; pointer-events: none; z-index: 45; overflow: hidden;');
        containerEl.appendChild(newsOverlayContainer);
        newsPoolRef.current.clear();
      }

      const usedNewsKeys = new Set<string>();
      if (settings?.news_chart_markers !== false && mainChartRef.current && precomputedFilteredNews.length > 0) {
        const timeScale = mainChartRef.current.timeScale();
        const visibleNewsItems: Array<typeof precomputedFilteredNews[0] & { x: number }> = [];

        precomputedFilteredNews.forEach(item => {
          const x = timeScale.timeToCoordinate(item.targetTime as any);
          if (x !== null && !isNaN(x) && x >= -20 && x <= containerEl.clientWidth + 20) {
            visibleNewsItems.push({ ...item, x });
          }
        });

        visibleNewsItems.sort((a, b) => a.x - b.x);
        const occupiedRowsByX: { x: number; row: number }[] = [];

        visibleNewsItems.forEach(item => {
          let rowIndex = 0;
          const nearbyItems = occupiedRowsByX.filter(occ => Math.abs(occ.x - item.x) < 30);
          if (nearbyItems.length > 0) {
            const maxRow = Math.max(...nearbyItems.map(i => i.row));
            rowIndex = maxRow + 1;
          }
          occupiedRowsByX.push({ x: item.x, row: rowIndex });

          const bottomPx = 24 + rowIndex * 22;

          // 1. Linha Vertical Estendida até a legenda no rodapé
          const lineKey = `news_line_${item.id}`;
          const lineStyle = `position: absolute; left: ${item.x}px; top: 0; bottom: ${bottomPx}px; width: 0px; border-left: 1.5px dashed ${item.color}; opacity: 0.75; pointer-events: none; z-index: 40;`;
          upsertPooledEl(newsOverlayContainer, newsPoolRef.current, usedNewsKeys, lineKey, '', false, lineStyle);

          // 2. Legenda de Notícia no Rodapé do Painel de Candles
          const badgeKey = `news_badge_${item.id}`;
          const badgeWidthEstimate = 180;
          const leftPx = Math.max(4, Math.min(item.x - 20, containerEl.clientWidth - badgeWidthEstimate));
          const badgeStyle = `position: absolute; left: ${leftPx}px; bottom: ${bottomPx - 2}px; background: #090d16f5; border: 1px solid ${item.color}80; border-radius: 4px; padding: 2px 6px; font-size: 10px; font-family: 'JetBrains Mono', monospace; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.6); pointer-events: auto; cursor: default; z-index: 45; display: flex; align-items: center; gap: 6px; line-height: 1.2;`;
          const badgeHtml = `
            <span style="color: ${item.color}; font-weight: 800; display: inline-flex; align-items: center; gap: 3px;">
              ${item.flagEmoji} ${item.country} ${item.bulls}
            </span>
            ${item.timeStr ? `<span style="color: #94a3b8; font-weight: 600; font-size: 9px;">${item.timeStr}</span>` : ''}
            <span style="color: #e2e8f0; font-weight: 500; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: bottom;" title="${item.title}">${item.title}</span>
          `;
          upsertPooledEl(newsOverlayContainer, newsPoolRef.current, usedNewsKeys, badgeKey, badgeHtml, true, badgeStyle);
        });
      }
      cleanupPooledEls(newsPoolRef.current, usedNewsKeys);

      // Render Axion Trend Dots (Bolinhas), Squeeze Dots & Bull/Bear Vertical Bars in Sub-chart with 2D Canvas
      if (effectiveShowAxionTrendSubPanel && axionTrendContainerRef.current) {
        let axionCanvas = axionTrendContainerRef.current.querySelector('.axion-trend-overlay-canvas') as HTMLCanvasElement;
        if (!axionCanvas) {
          axionCanvas = document.createElement('canvas');
          axionCanvas.className = 'axion-trend-overlay-canvas';
          axionCanvas.setAttribute('style', 'position: absolute; inset: 0; pointer-events: none; z-index: 45; width: 100%; height: 100%;');
          axionTrendContainerRef.current.style.position = 'relative';
          axionTrendContainerRef.current.appendChild(axionCanvas);
        }
        const aWidth = axionTrendContainerRef.current.clientWidth;
        const aHeight = axionTrendContainerRef.current.clientHeight;
        if (axionCanvas.width !== aWidth * dpr || axionCanvas.height !== aHeight * dpr) {
          axionCanvas.width = aWidth * dpr;
          axionCanvas.height = aHeight * dpr;
        }
        const aCtx = axionCanvas.getContext('2d');
        if (aCtx) {
          aCtx.save();
          aCtx.scale(dpr, dpr);
          aCtx.clearRect(0, 0, aWidth, aHeight);

          if (axionTrendChartRef.current && axionTrendMacdbbSeriesRef.current && axionTrendData?.bars && axionTrendData.bars.length > 0) {
            const timeScale = axionTrendChartRef.current.timeScale();
            const macdbbSeries = axionTrendMacdbbSeriesRef.current;
            const showBullBear = axionTrendIndConfig?.params?.showBullBearLines !== false;
            const rightScaleWidth = 85;
            const plotMaxX = Math.max(10, aWidth - rightScaleWidth);

            const yZero = macdbbSeries.priceToCoordinate(0);

            for (let i = 0; i < axionTrendData.bars.length; i++) {
              const b = axionTrendData.bars[i];
              if (!b || !b.time) continue;
              const x = timeScale.timeToCoordinate(b.time as any);
              if (x === null || typeof x !== 'number' || !Number.isFinite(x) || x < 2 || x > plotMaxX) continue;

              // 1. Vertical Bull/Bear Transition Bars (full height of sub-panel)
              if (showBullBear && (b.bullBearSignal === 'compra' || b.bullBearSignal === 'venda')) {
                aCtx.save();
                aCtx.fillStyle = b.bullBearSignal === 'compra' ? 'rgba(22, 163, 74, 0.55)' : 'rgba(220, 38, 38, 0.55)';
                aCtx.fillRect(x - 3.5, 0, 7, aHeight);
                aCtx.restore();
              }

              // 2. White Squeeze Dots on Zero Line
              if (b.squeeze && yZero !== null && typeof yZero === 'number' && Number.isFinite(yZero)) {
                aCtx.save();
                aCtx.fillStyle = '#ffffff';
                aCtx.beginPath();
                aCtx.arc(x, yZero, 2.6, 0, Math.PI * 2);
                aCtx.fill();
                aCtx.restore();
              }

              // 3. Colored Bolinhas (Dots) on MACDBB Line (Green above Upper, Red below Lower, Gray inside)
              if (Number.isFinite(b.macdbbLine)) {
                const yDot = macdbbSeries.priceToCoordinate(b.macdbbLine);
                if (yDot !== null && typeof yDot === 'number' && Number.isFinite(yDot) && yDot >= 2 && yDot <= aHeight - 2) {
                  aCtx.save();
                  aCtx.fillStyle = b.macdbbDotColor || '#94a3b8';
                  aCtx.beginPath();
                  aCtx.arc(x, yDot, 2.8, 0, Math.PI * 2);
                  aCtx.fill();
                  aCtx.restore();
                }
              }
            }
          }
          aCtx.restore();
        }
      }

      // Render MACD Divergences in Sub-chart with 2D Canvas (Zero SVG churn)
      if (effectiveShowMacd && macdContainerRef.current) {
        let macdCanvas = macdContainerRef.current.querySelector('.macd-divergence-canvas') as HTMLCanvasElement;
        if (!macdCanvas) {
          macdCanvas = document.createElement('canvas');
          macdCanvas.className = 'macd-divergence-canvas';
          macdCanvas.setAttribute('style', 'position: absolute; inset: 0; pointer-events: none; z-index: 45; width: 100%; height: 100%;');
          macdContainerRef.current.style.position = 'relative';
          macdContainerRef.current.appendChild(macdCanvas);
        }
        const mWidth = macdContainerRef.current.clientWidth;
        const mHeight = macdContainerRef.current.clientHeight;
        if (macdCanvas.width !== mWidth * dpr || macdCanvas.height !== mHeight * dpr) {
          macdCanvas.width = mWidth * dpr;
          macdCanvas.height = mHeight * dpr;
        }
        const mCtx = macdCanvas.getContext('2d');
        if (mCtx) {
          mCtx.save();
          mCtx.scale(dpr, dpr);
          mCtx.clearRect(0, 0, mWidth, mHeight);

          if (showMacdDivergence && macdChartRef.current && macdHistSeriesRef.current && macdDivergences && macdDivergences.length > 0) {
            const timeScale = macdChartRef.current.timeScale();
            const histSeries = macdHistSeriesRef.current;

            macdDivergences.forEach(div => {
              try {
                if (!div || div.t1 === null || div.t1 === undefined || div.t2 === null || div.t2 === undefined ||
                    div.hist1 === null || div.hist1 === undefined || isNaN(div.hist1) ||
                    div.hist2 === null || div.hist2 === undefined || isNaN(div.hist2)) return;

                const x1 = timeScale.timeToCoordinate(div.t1 as any);
                const x2 = timeScale.timeToCoordinate(div.t2 as any);
                const y1 = histSeries.priceToCoordinate(div.hist1);
                const y2 = histSeries.priceToCoordinate(div.hist2);

                if (x1 === null || x2 === null || typeof x1 !== 'number' || typeof x2 !== 'number' ||
                    y1 === null || y2 === null || typeof y1 !== 'number' || typeof y2 !== 'number') return;

                if (Number.isFinite(x1) && Number.isFinite(x2) && Number.isFinite(y1) && Number.isFinite(y2) &&
                    x2 >= 0 && x1 <= mWidth) {
                  const isBull = div.type === 'BULLISH';
                  const strokeColor = isBull ? '#10b981' : '#f43f5e';

                  mCtx.save();
                  mCtx.strokeStyle = strokeColor;
                  mCtx.lineWidth = 2;
                  mCtx.setLineDash([4, 3]);
                  mCtx.beginPath();
                  mCtx.moveTo(x1, y1);
                  mCtx.lineTo(x2, y2);
                  mCtx.stroke();

                  mCtx.setLineDash([]);
                  mCtx.fillStyle = strokeColor;
                  if (x1 >= 0 && x1 <= mWidth) {
                    mCtx.beginPath();
                    mCtx.arc(x1, y1, 2.5, 0, Math.PI * 2);
                    mCtx.fill();
                  }
                  if (x2 >= 0 && x2 <= mWidth) {
                    mCtx.beginPath();
                    mCtx.arc(x2, y2, 3.5, 0, Math.PI * 2);
                    mCtx.fill();

                    const tagText = isBull ? '▲ DIV ALTA' : '▼ DIV BAIXA';
                    const labelTop = isBull ? Math.min(mHeight - 10, y2 + 12) : Math.max(10, y2 - 8);
                    const labelLeft = Math.max(2, Math.min(x2 - 20, mWidth - 65));
                    mCtx.font = "800 8.5px 'JetBrains Mono', monospace";
                    mCtx.fillStyle = isBull ? '#064e3b' : '#881337';
                    mCtx.fillRect(labelLeft, labelTop - 9, 60, 13);
                    mCtx.strokeStyle = strokeColor;
                    mCtx.lineWidth = 1;
                    mCtx.strokeRect(labelLeft, labelTop - 9, 60, 13);
                    mCtx.fillStyle = '#ffffff';
                    mCtx.fillText(tagText, labelLeft + 3, labelTop);
                  }
                  mCtx.restore();
                }
              } catch (_) {}
            });
          }
          mCtx.restore();
        }
      }

      // Render MACD Divergence Lines on Main Price Chart via 2D Canvas (Zero SVG churn)
      if (mainContainerRef.current) {
        let mainDivCanvas = mainContainerRef.current.querySelector('.chart-macd-divergence-canvas') as HTMLCanvasElement;
        if (!mainDivCanvas) {
          mainDivCanvas = document.createElement('canvas');
          mainDivCanvas.className = 'chart-macd-divergence-canvas';
          mainDivCanvas.setAttribute('style', 'position: absolute; inset: 0; pointer-events: none; z-index: 44; width: 100%; height: 100%;');
          mainContainerRef.current.appendChild(mainDivCanvas);
        }
        if (mainDivCanvas.width !== cWidth * dpr || mainDivCanvas.height !== cHeight * dpr) {
          mainDivCanvas.width = cWidth * dpr;
          mainDivCanvas.height = cHeight * dpr;
        }
        const mdCtx = mainDivCanvas.getContext('2d');
        if (mdCtx) {
          mdCtx.save();
          mdCtx.scale(dpr, dpr);
          mdCtx.clearRect(0, 0, cWidth, cHeight);

          if (effectiveShowMacd && showMacdDivergence && showMacdDivergenceOnPrice && macdDivergences && macdDivergences.length > 0 && mainChartRef.current && candleSeriesRef.current) {
            const timeScale = mainChartRef.current.timeScale();
            const candleSeries = candleSeriesRef.current;

            macdDivergences.forEach(div => {
              try {
                if (!div || div.t1 === null || div.t1 === undefined || div.t2 === null || div.t2 === undefined ||
                    div.price1 === null || div.price1 === undefined || isNaN(div.price1) ||
                    div.price2 === null || div.price2 === undefined || isNaN(div.price2)) return;

                const px1 = timeScale.timeToCoordinate(div.t1 as any);
                const px2 = timeScale.timeToCoordinate(div.t2 as any);
                const py1 = candleSeries.priceToCoordinate(div.price1);
                const py2 = candleSeries.priceToCoordinate(div.price2);

                if (px1 === null || px2 === null || typeof px1 !== 'number' || typeof px2 !== 'number' ||
                    py1 === null || py2 === null || typeof py1 !== 'number' || typeof py2 !== 'number') return;

                if (Number.isFinite(px1) && Number.isFinite(px2) && Number.isFinite(py1) && Number.isFinite(py2) &&
                    px2 >= 0 && px1 <= cWidth) {
                  const isBull = div.type === 'BULLISH';
                  const strokeColor = isBull ? '#10b981' : '#f43f5e';

                  mdCtx.save();
                  mdCtx.strokeStyle = strokeColor;
                  mdCtx.lineWidth = 2;
                  mdCtx.setLineDash([5, 3]);
                  mdCtx.beginPath();
                  mdCtx.moveTo(px1, py1);
                  mdCtx.lineTo(px2, py2);
                  mdCtx.stroke();

                  mdCtx.setLineDash([]);
                  mdCtx.fillStyle = strokeColor;
                  if (px1 >= 0 && px1 <= cWidth) {
                    mdCtx.beginPath();
                    mdCtx.arc(px1, py1, 2.5, 0, Math.PI * 2);
                    mdCtx.fill();
                  }
                  if (px2 >= 0 && px2 <= cWidth) {
                    mdCtx.beginPath();
                    mdCtx.arc(px2, py2, 3.5, 0, Math.PI * 2);
                    mdCtx.fill();

                    const tagText = isBull ? '▲ DIV MACD' : '▼ DIV MACD';
                    const labelY = isBull ? Math.min(cHeight - 10, py2 + 16) : Math.max(10, py2 - 10);
                    const labelX = Math.max(2, Math.min(px2 - 25, cWidth - 75));
                    mdCtx.font = "800 8.5px 'JetBrains Mono', monospace";
                    mdCtx.fillStyle = '#090d16f0';
                    mdCtx.fillRect(labelX, labelY - 9, 65, 13);
                    mdCtx.strokeStyle = strokeColor;
                    mdCtx.lineWidth = 1.5;
                    mdCtx.strokeRect(labelX, labelY - 9, 65, 13);
                    mdCtx.fillStyle = strokeColor;
                    mdCtx.fillText(tagText, labelX + 4, labelY);
                  }
                  mdCtx.restore();
                }
              } catch (_) {}
            });
          }
          mdCtx.restore();
        }
      }
      } catch (err: any) {
        recordChartError({
          type: 'drawings',
          message: 'Erro no cálculo/renderização de níveis e etiquetas: ' + (err?.message || err),
          stack: err?.stack || '',
          panelId: instanceId || 'painel_chart'
        });
      }
    };

    updateLevelLabelsRef.current = (immediate?: boolean) => {
      if (immediate) {
        if (rafLabelsRef.current) {
          cancelAnimationFrame(rafLabelsRef.current);
          rafLabelsRef.current = null;
        }
        executeUpdateLevelLabels();
      } else {
        if (!rafLabelsRef.current) {
          rafLabelsRef.current = requestAnimationFrame(() => {
            rafLabelsRef.current = null;
            executeUpdateLevelLabels();
          });
        }
      }
    };

    return () => {
      if (rafLabelsRef.current) {
        cancelAnimationFrame(rafLabelsRef.current);
        rafLabelsRef.current = null;
      }
    };
  });

  // Effect 1: Chart Creation & Layout Instantiation
  useEffect(() => {
    if (!mainContainerRef.current) return;

    // Reset containers
    mainContainerRef.current.innerHTML = '';
    if (rsiContainerRef.current) rsiContainerRef.current.innerHTML = '';
    if (macdContainerRef.current) macdContainerRef.current.innerHTML = '';
    if (emacdContainerRef.current) emacdContainerRef.current.innerHTML = '';
    if (timeHeatmapContainerRef.current) timeHeatmapContainerRef.current.innerHTML = '';
    if (axionTrendContainerRef.current) axionTrendContainerRef.current.innerHTML = '';
    if (momentumMatrixContainerRef.current) momentumMatrixContainerRef.current.innerHTML = '';
    dynamicSeriesPoolRef.current.clear();

    const currentThemeKey = settings?.chart_color_theme || localStorage.getItem('vortex_chart_theme') || 'ninja_carbon';
    const themeColors = getChartThemeColors(currentThemeKey);

    const commonOptions = {
      layout: {
        background: { color: themeColors.bg },
        textColor: themeColors.textColor,
        fontSize: (settings?.chart_scale_font_size || Number(typeof localStorage !== 'undefined' ? localStorage.getItem('vortex_chart_scale_font_size') : 12)) || 12,
        fontFamily: 'JetBrains Mono, monospace'
      },
      localization: {
        locale: 'pt-BR',
        dateFormat: "dd MMM ''yy",
        timeFormatter: (time: any) => {
          try {
            const d = safeChartTimeToDate(time);
            if (!d || isNaN(d.getTime())) return '';
            const parts = spChartFullFormatter.formatToParts(d);
            const getVal = (type: string) => parts.find(p => p.type === type)?.value || '';
            const m = getVal('month').replace('.', '');
            return `${getVal('day')} ${m}. '${getVal('year')}   ${getVal('hour')}:${getVal('minute')}`;
          } catch {
            return '';
          }
        }
      },
      grid: {
        vertLines: { color: themeColors.gridColor },
        horzLines: { color: themeColors.gridColor },
      },
      crosshair: {
        mode: cursorModeRef.current === 'arrow' ? 2 : 1,
        vertLine: {
          visible: cursorModeRef.current !== 'arrow',
          color: themeColors.crosshairColor,
          labelBackgroundColor: isLightChartBackground(themeColors.bg) ? '#0f172a' : '#1e293b',
        },
        horzLine: {
          visible: cursorModeRef.current !== 'arrow',
          color: themeColors.crosshairColor,
          labelBackgroundColor: isLightChartBackground(themeColors.bg) ? '#0f172a' : '#1e293b',
        },
      },
      handleScale: {
        mouseWheel: false,
        pinch: true,
        axisPressedMouseMove: true,
      },
      timeScale: {
        borderColor: themeColors.borderColor,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
        minBarSpacing: 1,
        maxBarSpacing: 25,
        fixLeftEdge: false,
        fixRightEdge: false,
        tickMarkFormatter: (time: any, tickMarkType: any) => {
          try {
            const d = safeChartTimeToDate(time);
            if (!d || isNaN(d.getTime())) return '';
            if (tickMarkType === 0) {
              return spChartYearFormatter.format(d);
            }
            if (tickMarkType === 1) {
              return spChartMonthFormatter.format(d);
            }
            if (tickMarkType === 2) {
              return spChartDayMonthFormatter.format(d);
            }
            return spChartTimeFormatter.format(d);
          } catch {
            return '';
          }
        }
      },
      rightPriceScale: {
        visible: isMobile ? !hidePriceScaleMobile : true,
        borderColor: themeColors.borderColor,
        borderVisible: true,
        minimumWidth: isMobile ? (hidePriceScaleMobile ? 0 : 55) : 85,
        autoScale: true,
        scaleMargins: {
          top: 0.06,
          bottom: 0.06,
        },
      }
    };

    let totalHeight = chartRootRef.current && chartRootRef.current.clientHeight > 0
      ? chartRootRef.current.clientHeight
      : 0;
    if (chartRootRef.current?.parentElement && chartRootRef.current.parentElement.clientHeight > totalHeight) {
      totalHeight = chartRootRef.current.parentElement.clientHeight;
    }
    if (totalHeight <= 0) {
      totalHeight = isZoomed ? Math.max(300, window.innerHeight * 0.82) : 350;
    }
    const toolbarHeight = isZoomed && toolbarRef.current ? toolbarRef.current.offsetHeight : (isZoomed ? 36 : 0);
    const isBoletaVisible = tempViewMode === 'candles' && !hideManualTradeBar && !isBoletaCollapsed;
    const bottomControlsHeight = isBoletaVisible && bottomControlsRef.current
      ? bottomControlsRef.current.offsetHeight
      : (isBoletaVisible ? (isMobile ? 112 : 105) : 0);
    const containerPadding = 8;
    const availableHeight = Math.max(200, totalHeight - toolbarHeight - bottomControlsHeight - containerPadding);

    let activeIndicatorCount = 0;
    if (effectiveShowRsi) activeIndicatorCount++;
    if (effectiveShowMacd) activeIndicatorCount++;
    if (effectiveShowEMacd) activeIndicatorCount++;
    if (effectiveShowTimeHeatmap) activeIndicatorCount++;
    if (effectiveShowAxionTrendSubPanel) activeIndicatorCount++;
    if (effectiveShowMomentumMatrix) activeIndicatorCount++;

    const indicatorSpacing = activeIndicatorCount * 5;

    // Set initial ref value if not already set or if container height changed
    const defaultIndicatorHeight = Math.max(70, Math.min(120, Math.floor((availableHeight - indicatorSpacing) * 0.22)));
    if (!indicatorHeightRef.current || indicatorHeightRef.current === 90) {
      indicatorHeightRef.current = subPanelHeight || defaultIndicatorHeight;
    }
    const indicatorHeight = indicatorHeightRef.current || subPanelHeight || defaultIndicatorHeight;
    const mainChartHeight = availableHeight - indicatorSpacing - (indicatorHeight * activeIndicatorCount);

    const lastActiveIndicator = effectiveShowMomentumMatrix ? 'momentumMatrix' : (effectiveShowAxionTrendSubPanel ? 'axionTrend' : (effectiveShowTimeHeatmap ? 'timeHeatmap' : (effectiveShowEMacd ? 'emacd' : (effectiveShowMacd ? 'macd' : (effectiveShowRsi ? 'rsi' : 'main')))));

    // Compute a stable root container width (guaranteed to be non-zero)
    const rootWidth = chartRootRef.current && chartRootRef.current.clientWidth > 0
      ? chartRootRef.current.clientWidth
      : 500;

    // 1. Create Main Chart
    lastAppliedLevelsKeyRef.current = '';
    activePriceLinesRef.current = [];
    tradePriceLinesMapRef.current.clear();

    const mainChart = createChart(mainContainerRef.current, {
      ...commonOptions,
      width: rootWidth,
      height: mainChartHeight,
      timeScale: {
        ...commonOptions.timeScale,
        visible: lastActiveIndicator === 'main'
      }
    });
    mainChartRef.current = mainChart;

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: themeColors.upColor,
      downColor: themeColors.downColor,
      borderVisible: themeColors.borderVisible || false,
      borderColor: themeColors.borderColor,
      wickUpColor: themeColors.wickUpColor,
      wickDownColor: themeColors.wickDownColor,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
      priceLineVisible: false,
      priceLineColor: showPva ? '#b91c1c' : '#ef4444',
      autoscaleInfoProvider: (original: any) => {
        const defaultInfo = original();
        
        // Strict autoscale derived ONLY from visible candles in chartData
        const currentData = chartDataRef.current;
        if (mainChartRef.current && currentData && currentData.length > 0) {
          try {
            const logicalRange = mainChartRef.current.timeScale().getVisibleLogicalRange();
            if (logicalRange) {
              const fromIndex = Math.max(0, Math.floor(logicalRange.from));
              const toIndex = Math.min(currentData.length - 1, Math.ceil(logicalRange.to));
              
              if (fromIndex <= toIndex && fromIndex < currentData.length) {
                let candleMin = Infinity;
                let candleMax = -Infinity;

                for (let i = fromIndex; i <= toIndex; i++) {
                  const bar = currentData[i];
                  if (bar) {
                    if (bar.low !== undefined && bar.low < candleMin) candleMin = bar.low;
                    if (bar.high !== undefined && bar.high > candleMax) candleMax = bar.high;
                  }
                }

                // If live currentPrice is present and we're looking near real-time (rightmost bars),
                // ensure the vertical price scale always encloses the current price (guarded against cross-asset stale price)
                const curPrice = currentPriceRef.current;
                if (curPrice !== null && curPrice !== undefined && curPrice > 0 && !isNaN(curPrice)) {
                  const isCompatibleWithCandles = candleMin === Infinity || (
                    candleMin > 0 && candleMax > 0 &&
                    curPrice >= candleMin * 0.65 && curPrice <= candleMax * 1.35
                  );
                  if (isCompatibleWithCandles && toIndex >= currentData.length - 15) {
                    if (curPrice < candleMin) candleMin = curPrice;
                    if (curPrice > candleMax) candleMax = curPrice;
                  }
                }

                if (candleMin < Infinity && candleMax > -Infinity && candleMin > 0) {
                  if (autoCenterRef.current && curPrice && curPrice > 0) {
                    if (!autoCenterHalfSpanRef.current || autoCenterHalfSpanRef.current <= 0) {
                      const diff = candleMax - candleMin;
                      const initialHalf = diff > 0 ? (diff * 0.6) : (curPrice * 0.005);
                      autoCenterHalfSpanRef.current = initialHalf;
                    }

                    const fixedHalf = autoCenterHalfSpanRef.current;
                    return {
                      priceRange: {
                        minValue: curPrice - fixedHalf,
                        maxValue: curPrice + fixedHalf,
                      },
                    };
                  }

                  const diff = candleMax - candleMin;
                  const rangePadding = diff > 0 ? diff * 0.08 : (candleMin * 0.002);
                  return {
                    priceRange: {
                      minValue: candleMin - rangePadding,
                      maxValue: candleMax + rangePadding,
                    },
                  };
                }
              }
            }
          } catch (_) {}
        }
        return defaultInfo;
      }
    });
    candleSeriesRef.current = candleSeries;
    lastChartDataLengthRef.current = 0;
    lastChartDataTimeRef.current = 0;

    const markersApi = createSeriesMarkers(candleSeries, []);
    markersPluginRef.current = markersApi;

    // Sincronizador de renderização zero-lag com Lightweight Charts:
    // Chamado internamente durante o frame de paint do motor de gráficos, logo após as escalas de tempo e preço serem recalculadas.
    // Garante que todas as marcações, desenhos, divergências e etiquetas se movam no exato mesmo frame dos candles.
    try {
      (candleSeries as any).attachPrimitive({
        updateAllViews() {
          if (drawingsRedrawRef.current) drawingsRedrawRef.current();
          if (updateLevelLabelsRef.current) updateLevelLabelsRef.current(true);
        },
        paneViews() { return []; },
        timeAxisViews() { return []; },
        priceAxisViews() { return []; }
      });
    } catch (_) {}

    // SMA 9
    let smaSeries: any = null;
    if (effectiveShowSma9) {
      smaSeries = mainChart.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      } as any);
      try { smaSeries.setData([]); } catch (_) {}
    }
    smaSeriesRef.current = smaSeries;

    // EMA 21
    let ema21Series: any = null;
    if (effectiveShowEma21) {
      ema21Series = mainChart.addSeries(LineSeries, {
        color: '#f97316',
        lineWidth: 2,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      } as any);
      try { ema21Series.setData([]); } catch (_) {}
    }
    ema21SeriesRef.current = ema21Series;

    // EMA 50
    let ema50Series: any = null;
    if (effectiveShowEma50) {
      ema50Series = mainChart.addSeries(LineSeries, {
        color: '#d946ef',
        lineWidth: 2,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      } as any);
      try { ema50Series.setData([]); } catch (_) {}
    }
    ema50SeriesRef.current = ema50Series;

    // FVG Up and Down Series Pools (support up to 15 parallel overlapping active gaps)
    const MAX_FVG_POOLS = 15;
    const fvgUpPool: any[] = [];
    const fvgDownPool: any[] = [];

    if (effectiveShowFvg) {
      for (let s = 0; s < MAX_FVG_POOLS; s++) {
        fvgUpPool.push(mainChart.addSeries(CandlestickSeries, {
          upColor: 'rgba(34, 197, 94, 0.25)',
          downColor: 'rgba(34, 197, 94, 0.25)',
          borderUpColor: 'rgba(34, 197, 94, 0.4)',
          borderDownColor: 'rgba(34, 197, 94, 0.4)',
          wickUpColor: 'rgba(0, 0, 0, 0)',
          wickDownColor: 'rgba(0, 0, 0, 0)',
          priceLineVisible: false,
          lastValueVisible: false
        }));
        fvgDownPool.push(mainChart.addSeries(CandlestickSeries, {
          upColor: 'rgba(239, 68, 68, 0.25)',
          downColor: 'rgba(239, 68, 68, 0.25)',
          borderUpColor: 'rgba(239, 68, 68, 0.4)',
          borderDownColor: 'rgba(239, 68, 68, 0.4)',
          wickUpColor: 'rgba(0, 0, 0, 0)',
          wickDownColor: 'rgba(0, 0, 0, 0)',
          priceLineVisible: false,
          lastValueVisible: false
        }));
      }
    }
    fvgUpSeriesPoolRef.current = fvgUpPool;
    fvgDownSeriesPoolRef.current = fvgDownPool;

    // 2. Create RSI Chart if enabled
    let rsiChart: IChartApi | null = null;
    let rsiSeries: any = null;

    if (effectiveShowRsi && rsiContainerRef.current) {
      rsiChart = createChart(rsiContainerRef.current, {
        ...commonOptions,
        width: rootWidth,
        height: indicatorHeight,
        handleScroll: false,
        handleScale: false,
        timeScale: {
          ...commonOptions.timeScale,
          visible: lastActiveIndicator === 'rsi'
        }
      });
      rsiChartRef.current = rsiChart;

      rsiSeries = rsiChart.addSeries(LineSeries, {
        color: '#6366f1',
        lineWidth: 2,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      } as any);
      try { rsiSeries.setData([]); } catch (_) {}

      try {
        rsiSeries.createPriceLine({
          price: 70,
          color: '#ef444460',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: false,
          title: ''
        });
        rsiSeries.createPriceLine({
          price: 30,
          color: '#10b98160',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: false,
          title: ''
        });
      } catch (_) {}
    }
    rsiSeriesRef.current = rsiSeries;

    // 3. Create MACD Chart if enabled
    let macdChart: IChartApi | null = null;
    let macdSeries: any = null;
    let signalSeries: any = null;
    let histSeries: any = null;

    if (effectiveShowMacd && macdContainerRef.current) {
      macdChart = createChart(macdContainerRef.current, {
        ...commonOptions,
        width: rootWidth,
        height: indicatorHeight,
        handleScroll: false,
        handleScale: false,
        timeScale: {
          ...commonOptions.timeScale,
          visible: lastActiveIndicator === 'macd'
        }
      });
      macdChartRef.current = macdChart;

      macdSeries = macdChart.addSeries(LineSeries, {
        color: '#2563eb',
        lineWidth: 2,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      } as any);
      try { macdSeries.setData([]); } catch (_) {}

      signalSeries = macdChart.addSeries(LineSeries, {
        color: '#e11d48',
        lineWidth: 2,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      } as any);
      try { signalSeries.setData([]); } catch (_) {}

      histSeries = macdChart.addSeries(HistogramSeries, {
        color: '#10b98180',
        title: '',
        lastValueVisible: false,
        priceLineVisible: false
      } as any);
      try { histSeries.setData([]); } catch (_) {}

      macdChart.priceScale('right').applyOptions({
        scaleMargins: { top: 0.12, bottom: 0.12 },
        autoScale: true
      });
    }
    macdLineSeriesRef.current = macdSeries;
    macdSignalSeriesRef.current = signalSeries;
    macdHistSeriesRef.current = histSeries;

    // 4. Create e-MACD Chart if enabled
    let emacdChart: IChartApi | null = null;
    let emacdHistSeries: any = null;
    let emacdExplosionSeries: any = null;
    let emacdDeadZoneSeries: any = null;

    if (effectiveShowEMacd && emacdContainerRef.current) {
      emacdChart = createChart(emacdContainerRef.current, {
        ...commonOptions,
        width: rootWidth,
        height: indicatorHeight,
        handleScroll: false,
        handleScale: false,
        timeScale: {
          ...commonOptions.timeScale,
          visible: lastActiveIndicator === 'emacd'
        }
      });
      emacdChartRef.current = emacdChart;

      emacdHistSeries = emacdChart.addSeries(HistogramSeries, {
        title: '',
        lastValueVisible: false,
        priceLineVisible: false
      } as any);
      try { emacdHistSeries.setData([]); } catch (_) {}

      emacdExplosionSeries = emacdChart.addSeries(LineSeries, {
        color: '#eab308',
        lineWidth: 2,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      } as any);
      try { emacdExplosionSeries.setData([]); } catch (_) {}

      emacdDeadZoneSeries = emacdChart.addSeries(LineSeries, {
        color: '#3b82f650',
        lineWidth: 1.5,
        lineStyle: 2,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      } as any);
      try { emacdDeadZoneSeries.setData([]); } catch (_) {}
    }
    emacdHistSeriesRef.current = emacdHistSeries;
    emacdExplosionSeriesRef.current = emacdExplosionSeries;
    emacdDeadZoneSeriesRef.current = emacdDeadZoneSeries;

    // 5. Create Time Heatmap Chart if enabled
    let timeHeatmapChart: IChartApi | null = null;
    let timeHeatmapHistSeries: any = null;
    let timeHeatmapLineSeries: any = null;
    let timeHeatmapForecastSeries: any = null;
    let timeHeatmapThresholdSeries: any = null;

    if (effectiveShowTimeHeatmap && timeHeatmapContainerRef.current) {
      timeHeatmapChart = createChart(timeHeatmapContainerRef.current, {
        ...commonOptions,
        width: rootWidth,
        height: indicatorHeight,
        handleScroll: false,
        handleScale: false,
        timeScale: {
          ...commonOptions.timeScale,
          visible: lastActiveIndicator === 'timeHeatmap'
        }
      });
      timeHeatmapChartRef.current = timeHeatmapChart;

      timeHeatmapHistSeries = timeHeatmapChart.addSeries(HistogramSeries, {
        title: '',
        lastValueVisible: false,
        priceLineVisible: false
      } as any);
      try { timeHeatmapHistSeries.setData([]); } catch (_) {}

      timeHeatmapLineSeries = timeHeatmapChart.addSeries(LineSeries, {
        color: '#f97316',
        lineWidth: 2,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      } as any);
      try { timeHeatmapLineSeries.setData([]); } catch (_) {}

      timeHeatmapForecastSeries = timeHeatmapChart.addSeries(LineSeries, {
        color: '#38bdf8',
        lineWidth: 2,
        lineStyle: 2, // Pontilhado para indicar projeção futura
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      } as any);
      try { timeHeatmapForecastSeries.setData([]); } catch (_) {}

      timeHeatmapThresholdSeries = timeHeatmapChart.addSeries(LineSeries, {
        color: '#ef444480',
        lineWidth: 1,
        lineStyle: 2,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      } as any);
      try { timeHeatmapThresholdSeries.setData([]); } catch (_) {}

      timeHeatmapChart.priceScale('right').applyOptions({
        scaleMargins: { top: 0.1, bottom: 0.05 },
        autoScale: true
      });
    }
    timeHeatmapHistSeriesRef.current = timeHeatmapHistSeries;
    timeHeatmapLineSeriesRef.current = timeHeatmapLineSeries;
    timeHeatmapForecastSeriesRef.current = timeHeatmapForecastSeries;
    timeHeatmapThresholdSeriesRef.current = timeHeatmapThresholdSeries;

    // 6. Create Axion Trend Sub-panel Chart if enabled
    let axionTrendChart: IChartApi | null = null;
    let axionTrendHistSeries: any = null;
    let axionTrendUpperSeries: any = null;
    let axionTrendMidSeries: any = null;
    let axionTrendLowerSeries: any = null;
    let axionTrendZeroSeries: any = null;
    let axionTrendMacdbbSeries: any = null;

    if (effectiveShowAxionTrendSubPanel && axionTrendContainerRef.current) {
      axionTrendChart = createChart(axionTrendContainerRef.current, {
        ...commonOptions,
        width: rootWidth,
        height: indicatorHeight,
        handleScroll: false,
        handleScale: false,
        timeScale: {
          ...commonOptions.timeScale,
          visible: lastActiveIndicator === 'axionTrend'
        }
      });
      axionTrendChartRef.current = axionTrendChart;

      axionTrendHistSeries = axionTrendChart.addSeries(HistogramSeries, {
        title: '',
        lastValueVisible: false,
        priceLineVisible: false
      } as any);
      try { axionTrendHistSeries.setData([]); } catch (_) {}

      axionTrendUpperSeries = axionTrendChart.addSeries(LineSeries, {
        color: '#ffffff',
        lineWidth: 1,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      } as any);
      try { axionTrendUpperSeries.setData([]); } catch (_) {}

      axionTrendMidSeries = axionTrendChart.addSeries(LineSeries, {
        color: '#ffffff',
        lineWidth: 1,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      } as any);
      try { axionTrendMidSeries.setData([]); } catch (_) {}

      axionTrendLowerSeries = axionTrendChart.addSeries(LineSeries, {
        color: '#ffffff',
        lineWidth: 1,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      } as any);
      try { axionTrendLowerSeries.setData([]); } catch (_) {}

      axionTrendZeroSeries = axionTrendChart.addSeries(LineSeries, {
        color: '#47556980',
        lineWidth: 1,
        lineStyle: 2,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      } as any);
      try { axionTrendZeroSeries.setData([]); } catch (_) {}

      axionTrendMacdbbSeries = axionTrendChart.addSeries(LineSeries, {
        color: '#22c55e',
        lineWidth: 1,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
      } as any);
      try { axionTrendMacdbbSeries.setData([]); } catch (_) {}

      try {
        (axionTrendMacdbbSeries as any).attachPrimitive({
          updateAllViews() {
            if (updateLevelLabelsRef.current) updateLevelLabelsRef.current(true);
          },
          paneViews() { return []; },
          timeAxisViews() { return []; },
          priceAxisViews() { return []; }
        });
      } catch (_) {}

      axionTrendChart.priceScale('right').applyOptions({
        scaleMargins: { top: 0.12, bottom: 0.12 },
        autoScale: true
      });
    }
    axionTrendHistSeriesRef.current = axionTrendHistSeries;
    axionTrendUpperSeriesRef.current = axionTrendUpperSeries;
    axionTrendMidSeriesRef.current = axionTrendMidSeries;
    axionTrendLowerSeriesRef.current = axionTrendLowerSeries;
    axionTrendZeroSeriesRef.current = axionTrendZeroSeries;
    axionTrendMacdbbSeriesRef.current = axionTrendMacdbbSeries;

    // 7. Create Momentum Matrix Sub-panel Chart if enabled
    let momentumMatrixChart: IChartApi | null = null;
    let momentumCombinedIndicesSeries: any = null;
    let momentumCombinedStocksSeries: any = null;
    let momentumFxFlowSeries: any = null;
    let momentumEurJpySeries: any = null;
    let momentumUsdJpySeries: any = null;
    let momentumEurUsdSeries: any = null;
    let momentumVixSeries: any = null;
    let momentumDxySeries: any = null;
    let momentumNqSeries: any = null;
    let momentumEsSeries: any = null;
    const individualTechPool = new Map<string, any>();

    if (effectiveShowMomentumMatrix && momentumMatrixContainerRef.current) {
      momentumMatrixChart = createChart(momentumMatrixContainerRef.current, {
        ...commonOptions,
        width: rootWidth,
        height: indicatorHeight,
        handleScroll: false,
        handleScale: false,
        timeScale: {
          ...commonOptions.timeScale,
          visible: lastActiveIndicator === 'momentumMatrix'
        }
      });
      momentumMatrixChartRef.current = momentumMatrixChart;

      const p = momentumMatrixIndConfig?.params || {};
      const indicesMode = p.indicesMode || 'combined';
      const stocksMode = p.stocksMode || 'combined';
      const showFxFlow = p.showFxFlow !== false;
      const showVix = p.showVix !== false;
      const showDxy = p.showDxy === true;
      const showEurJpy = p.showEurJpy === true;
      const showUsdJpy = p.showUsdJpy === true;
      const showEurUsd = p.showEurUsd === true;
      const showCenter50 = p.showCenter50 !== false;
      const showExtremeLevels = p.showExtremeLevels !== false;
      const levelHigh = Number(p.levelHigh || 80);
      const levelLow = Number(p.levelLow || 20);

      // Cesta Sintética de Fluxo de Capitais Global (IMF / FX Flow)
      if (showFxFlow) {
        momentumFxFlowSeries = momentumMatrixChart.addSeries(LineSeries, {
          color: p.colorFxFlow || '#06b6d4',
          lineWidth: 2,
          title: 'IMF',
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: () => ({
            priceRange: { minValue: 0, maxValue: 100 }
          })
        } as any);
        try { momentumFxFlowSeries.setData([]); } catch (_) {}
      }

      // Índices Combinados (NQ + ES)
      if (indicesMode === 'combined') {
        momentumCombinedIndicesSeries = momentumMatrixChart.addSeries(LineSeries, {
          color: p.colorCombinedIndices || '#38bdf8',
          lineWidth: 2,
          title: 'NQ+ES',
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: () => ({
            priceRange: { minValue: 0, maxValue: 100 }
          })
        } as any);
        try { momentumCombinedIndicesSeries.setData([]); } catch (_) {}
      } else if (indicesMode === 'individual') {
        if (p.showNq !== false) {
          momentumNqSeries = momentumMatrixChart.addSeries(LineSeries, {
            color: p.colorNq || '#38bdf8',
            lineWidth: 2,
            title: 'NQ',
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
            autoscaleInfoProvider: () => ({
              priceRange: { minValue: 0, maxValue: 100 }
            })
          } as any);
          try { momentumNqSeries.setData([]); } catch (_) {}
        }
        if (p.showEs !== false) {
          momentumEsSeries = momentumMatrixChart.addSeries(LineSeries, {
            color: p.colorEs || '#3b82f6',
            lineWidth: 2,
            title: 'ES',
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
            autoscaleInfoProvider: () => ({
              priceRange: { minValue: 0, maxValue: 100 }
            })
          } as any);
          try { momentumEsSeries.setData([]); } catch (_) {}
        }
      }

      // Cesta Big Techs (Mag7) ou Ações Individuais
      if (stocksMode === 'combined') {
        momentumCombinedStocksSeries = momentumMatrixChart.addSeries(LineSeries, {
          color: p.colorCombinedStocks || '#eab308',
          lineWidth: 2,
          title: 'Mag7',
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: () => ({
            priceRange: { minValue: 0, maxValue: 100 }
          })
        } as any);
        try { momentumCombinedStocksSeries.setData([]); } catch (_) {}
      } else if (stocksMode === 'individual') {
        const techDefs = [
          { key: 'nvidia', label: 'NVDA', color: p.colorNvidia || '#22c55e', flag: p.showNvidia !== false },
          { key: 'microsoft', label: 'MSFT', color: p.colorMicrosoft || '#0284c7', flag: p.showMicrosoft !== false },
          { key: 'apple', label: 'AAPL', color: p.colorApple || '#94a3b8', flag: p.showApple !== false },
          { key: 'amazon', label: 'AMZN', color: p.colorAmazon || '#f97316', flag: p.showAmazon !== false },
          { key: 'alphabet', label: 'GOOGL', color: p.colorAlphabet || '#ea580c', flag: p.showAlphabet !== false },
          { key: 'meta', label: 'META', color: p.colorMeta || '#6366f1', flag: p.showMeta !== false },
          { key: 'tesla', label: 'TSLA', color: p.colorTesla || '#ef4444', flag: p.showTesla !== false },
        ];
        techDefs.forEach(td => {
          if (td.flag) {
            const s = momentumMatrixChart!.addSeries(LineSeries, {
              color: td.color,
              lineWidth: 1,
              title: td.label,
              lastValueVisible: false,
              priceLineVisible: false,
              crosshairMarkerVisible: false,
              autoscaleInfoProvider: () => ({
                priceRange: { minValue: 0, maxValue: 100 }
              })
            } as any);
            try { s.setData([]); } catch (_) {}
            individualTechPool.set(td.key, s);
          }
        });
      }

      // Pares Cambiais Individuais (se habilitados)
      if (showEurJpy) {
        momentumEurJpySeries = momentumMatrixChart.addSeries(LineSeries, {
          color: '#10b981',
          lineWidth: 1,
          title: 'EUR/JPY',
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } })
        } as any);
        try { momentumEurJpySeries.setData([]); } catch (_) {}
      }
      if (showUsdJpy) {
        momentumUsdJpySeries = momentumMatrixChart.addSeries(LineSeries, {
          color: '#f59e0b',
          lineWidth: 1,
          title: 'USD/JPY',
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } })
        } as any);
        try { momentumUsdJpySeries.setData([]); } catch (_) {}
      }
      if (showEurUsd) {
        momentumEurUsdSeries = momentumMatrixChart.addSeries(LineSeries, {
          color: '#6366f1',
          lineWidth: 1,
          title: 'EUR/USD',
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } })
        } as any);
        try { momentumEurUsdSeries.setData([]); } catch (_) {}
      }

      // VIX Individual
      if (showVix) {
        momentumVixSeries = momentumMatrixChart.addSeries(LineSeries, {
          color: p.colorVix || '#a855f7',
          lineWidth: 2,
          title: 'VIX',
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: () => ({
            priceRange: { minValue: 0, maxValue: 100 }
          })
        } as any);
        try { momentumVixSeries.setData([]); } catch (_) {}
      }

      // DXY Individual (Opcional)
      if (showDxy) {
        momentumDxySeries = momentumMatrixChart.addSeries(LineSeries, {
          color: p.colorDxy || '#10b981',
          lineWidth: 2,
          title: 'DXY',
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: () => ({
            priceRange: { minValue: 0, maxValue: 100 }
          })
        } as any);
        try { momentumDxySeries.setData([]); } catch (_) {}
      }

      // Linhas guias horizontais (Linha Central 50, Níveis 80/20 e limites 0/100)
      const refSeriesForLines = momentumFxFlowSeries || momentumCombinedIndicesSeries || momentumCombinedStocksSeries || momentumVixSeries || momentumDxySeries || momentumNqSeries;
      if (refSeriesForLines) {
        try {
          refSeriesForLines.createPriceLine({
            price: 100,
            color: '#33415530',
            lineWidth: 1,
            lineStyle: 0,
            axisLabelVisible: false,
            title: ''
          });
          refSeriesForLines.createPriceLine({
            price: 0,
            color: '#33415530',
            lineWidth: 1,
            lineStyle: 0,
            axisLabelVisible: false,
            title: ''
          });

          if (showCenter50) {
            refSeriesForLines.createPriceLine({
              price: 50,
              color: '#94a3b8',
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: '50'
            });
          }
          if (showExtremeLevels) {
            refSeriesForLines.createPriceLine({
              price: levelHigh,
              color: '#ef444460',
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: false,
              title: '80'
            });
            refSeriesForLines.createPriceLine({
              price: levelLow,
              color: '#10b98160',
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: false,
              title: '20'
            });
          }
        } catch (_) {}
      }

      // Escala de preço estável [0 a 100]
      momentumMatrixChart.priceScale('right').applyOptions({
        autoScale: true,
        scaleMargins: { top: 0.08, bottom: 0.08 }
      });
    }

    momentumCombinedIndicesSeriesRef.current = momentumCombinedIndicesSeries;
    momentumCombinedStocksSeriesRef.current = momentumCombinedStocksSeries;
    momentumFxFlowSeriesRef.current = momentumFxFlowSeries;
    momentumEurJpySeriesRef.current = momentumEurJpySeries;
    momentumUsdJpySeriesRef.current = momentumUsdJpySeries;
    momentumEurUsdSeriesRef.current = momentumEurUsdSeries;
    momentumVixSeriesRef.current = momentumVixSeries;
    momentumDxySeriesRef.current = momentumDxySeries;
    momentumNqSeriesRef.current = momentumNqSeries;
    momentumEsSeriesRef.current = momentumEsSeries;
    momentumIndividualTechPoolRef.current = individualTechPool;

    // Se já houver dados carregados no ref, aplica imediatamente nas séries
    if (momentumMatrixDataRef.current) {
      updateMomentumMatrixSeriesOnChart(momentumMatrixDataRef.current);
    }

    // Synchronize time scales (One-way: Main -> Sub-charts) and update level labels
    const syncHandlers: { timeScale: any; handler: () => void }[] = [];
    const subCharts = [rsiChart, macdChart, emacdChart, timeHeatmapChart, axionTrendChart, momentumMatrixChart].filter(Boolean) as IChartApi[];
    const mainTimeScale = mainChart.timeScale();
    let isSyncing = false;
    
    const handler = () => {
      const logicalRange = mainTimeScale.getVisibleLogicalRange();

      // 1. Sync sub-charts
      if (subCharts.length > 0 && !isSyncing && logicalRange) {
        isSyncing = true;
        subCharts.forEach(c => {
          try {
            c.timeScale().setVisibleLogicalRange(logicalRange);
          } catch (_) {}
        });
        setTimeout(() => {
          isSyncing = false;
        }, 0);
      }

      // 2. Track & save visible bar count (zoom level) and horizontal scroll position
      if (logicalRange && isMountedRef.current) {
        const containerEl = mainContainerRef.current;
        // Ignore zoom updates when container is collapsing during unmount/page transitions
        if (containerEl && containerEl.clientWidth > 100 && containerEl.clientHeight > 100) {
          const barCount = Math.round(logicalRange.to - logicalRange.from);
          if (barCount > 5 && barCount < 1000) {
            lastBarCountRef.current = barCount;
            const curLen = chartDataRef.current?.length || 0;
            const offsetFromEnd = curLen > 0 ? Math.round(curLen - logicalRange.to) : 0;
            const isScrolledLeft = offsetFromEnd > 15;

            const vpState = {
              barCount,
              offsetFromEnd: isScrolledLeft ? offsetFromEnd : 0,
              isScrolledLeft,
              from: logicalRange.from,
              to: logicalRange.to,
              dataLength: curLen,
              time: Date.now()
            };
            lastViewportStateRef.current = vpState;
            
            if (saveBarCountTimeoutRef.current) {
              clearTimeout(saveBarCountTimeoutRef.current);
            }
            saveBarCountTimeoutRef.current = setTimeout(() => {
              try {
                sessionStorage.setItem(`vortex_viewport_${panelKey}`, JSON.stringify(vpState));
                localStorage.setItem(`vortex_chart_bar_count_${panelKey}`, String(barCount));
                localStorage.setItem('vortex_chart_bar_count', String(barCount));
              } catch (_) {}
            }, 300);
          }
        }
      }

      // 3. Update level labels
      if (updateLevelLabelsRef.current) {
        updateLevelLabelsRef.current();
      }
    };
    mainTimeScale.subscribeVisibleLogicalRangeChange(handler);
    syncHandlers.push({ timeScale: mainTimeScale, handler });

    // Set first data load flag so that Effect 2 fits content when data arrives
    isFirstDataLoadRef.current = true;

    // Resize Handler
    const handleResize = () => {
      if (!chartRootRef.current) return;
      let totalHeight = chartRootRef.current.clientHeight > 0
        ? chartRootRef.current.clientHeight
        : 0;
      if (chartRootRef.current.parentElement && chartRootRef.current.parentElement.clientHeight > totalHeight) {
        totalHeight = chartRootRef.current.parentElement.clientHeight;
      }
      if (totalHeight <= 0) {
        totalHeight = isZoomed ? Math.max(300, window.innerHeight * 0.82) : 350;
      }
      const toolbarHeight = isZoomed && toolbarRef.current ? toolbarRef.current.offsetHeight : (isZoomed ? 36 : 0);
      const isBoletaVisible = tempViewMode === 'candles' && !hideManualTradeBar && !isBoletaCollapsed;
      const bottomControlsHeight = isBoletaVisible && bottomControlsRef.current
        ? bottomControlsRef.current.offsetHeight
        : (isBoletaVisible ? (isMobile ? 112 : 105) : 0);
      const containerPadding = 4;
      const availableHeight = Math.max(180, totalHeight - toolbarHeight - bottomControlsHeight - containerPadding);
      
      let activeIndicatorCount = 0;
      if (effectiveShowRsi) activeIndicatorCount++;
      if (effectiveShowMacd) activeIndicatorCount++;
      if (effectiveShowEMacd) activeIndicatorCount++;
      if (effectiveShowTimeHeatmap) activeIndicatorCount++;
      if (effectiveShowAxionTrendSubPanel) activeIndicatorCount++;
      if (effectiveShowMomentumMatrix) activeIndicatorCount++;

      const indicatorSpacing = activeIndicatorCount * 5;
      const indicatorHeight = indicatorHeightRef.current || subPanelHeight;
      const mainChartHeight = availableHeight - indicatorSpacing - (indicatorHeight * activeIndicatorCount);
      const width = chartRootRef.current.clientWidth > 0 ? chartRootRef.current.clientWidth : 500;

      if (mainChartRef.current) {
        mainChartRef.current.resize(width, mainChartHeight);
      }
      if (rsiChartRef.current && effectiveShowRsi) {
        rsiChartRef.current.resize(width, indicatorHeight);
      }
      if (macdChartRef.current && effectiveShowMacd) {
        macdChartRef.current.resize(width, indicatorHeight);
      }
      if (emacdChartRef.current && effectiveShowEMacd) {
        emacdChartRef.current.resize(width, indicatorHeight);
      }
      if (timeHeatmapChartRef.current && effectiveShowTimeHeatmap) {
        timeHeatmapChartRef.current.resize(width, indicatorHeight);
      }
      if (axionTrendChartRef.current && effectiveShowAxionTrendSubPanel) {
        axionTrendChartRef.current.resize(width, indicatorHeight);
      }
      if (momentumMatrixChartRef.current && effectiveShowMomentumMatrix) {
        momentumMatrixChartRef.current.resize(width, indicatorHeight);
      }

      // Update level labels coordinate alignment
      if (updateLevelLabelsRef.current) {
        updateLevelLabelsRef.current();
      }
    };
    resizeChartsRef.current = handleResize;

    const runResize = () => {
      handleResize();
      setTimeout(handleResize, 50);
      setTimeout(handleResize, 150);
    };

    const resizeObserver = new ResizeObserver(() => {
      runResize();
    });
    if (chartRootRef.current) {
      resizeObserver.observe(chartRootRef.current);
    }
    if (chartRootRef.current?.parentElement) {
      resizeObserver.observe(chartRootRef.current.parentElement);
    }
    if (mainContainerRef.current) {
      resizeObserver.observe(mainContainerRef.current);
    }

    window.addEventListener('resize', runResize);
    window.addEventListener('focus', runResize);
    window.addEventListener('vortex_bottom_nav_collapsed', runResize);
    document.addEventListener('visibilitychange', runResize);

    // Custom wheel handler to keep smooth zoom and preserve viewport when scrolled into past
    const handleWheel = (e: WheelEvent) => {
      if (!mainChartRef.current) return;
      const dataLen = chartDataRef.current.length;
      if (dataLen === 0) return;

      e.preventDefault();

      const timeScale = mainChartRef.current.timeScale();
      const currentRange = timeScale.getVisibleLogicalRange();
      if (!currentRange) return;

      const currentBarCount = currentRange.to - currentRange.from;
      if (currentBarCount <= 0) return;

      const factor = e.deltaY < 0
        ? Math.pow(0.88, Math.min(Math.abs(e.deltaY) / 100, 3))
        : Math.pow(1.14, Math.min(Math.abs(e.deltaY) / 100, 3));

      let newBarCount = Math.round(currentBarCount * factor);
      const minBars = 8;
      const maxBars = Math.min(dataLen, 1000);
      newBarCount = Math.max(minBars, Math.min(maxBars, newBarCount));

      let targetTo: number;
      let targetFrom: number;

      // Se o usuário navegou para o histórico (à esquerda), dar zoom mantendo o foco relativo no cursor
      if (currentRange.to < dataLen - 5) {
        const rect = rootEl?.getBoundingClientRect();
        const mouseRatio = rect && rect.width > 0 ? Math.max(0.1, Math.min(0.9, (e.clientX - rect.left) / rect.width)) : 0.5;
        const currentCenter = currentRange.from + currentBarCount * mouseRatio;
        targetFrom = currentCenter - newBarCount * mouseRatio;
        targetTo = targetFrom + newBarCount;
      } else {
        // No tempo real: manter a margem de respiro à direita
        targetTo = dataLen + 12;
        targetFrom = targetTo - newBarCount;
      }

      timeScale.setVisibleLogicalRange({
        from: targetFrom,
        to: targetTo
      });
    };

    const rootEl = chartRootRef.current;
    if (rootEl) {
      rootEl.addEventListener('wheel', handleWheel, { passive: false });
    }

    // Sincronização contínua durante arraste de escala de preço, zoom e pan
    const handleChartInteraction = () => {
      if (updateLevelLabelsRef.current) {
        updateLevelLabelsRef.current();
      }
    };

    const mainContainerEl = mainContainerRef.current;
    if (mainContainerEl) {
      mainContainerEl.addEventListener('pointerdown', handleChartInteraction, { passive: true });
      mainContainerEl.addEventListener('pointermove', handleChartInteraction, { passive: true });
      mainContainerEl.addEventListener('pointerup', handleChartInteraction, { passive: true });
      mainContainerEl.addEventListener('wheel', handleChartInteraction, { passive: true });
    }

    mainChart.subscribeCrosshairMove(handleChartInteraction);

    // Suporte robusto para marcação de SL/TP com clique e toque nativo no mobile (🎯 TOQUE)
    const handleMainChartClick = (param: any) => {
      if (param && param.point && param.point.y !== undefined) {
        handleChartPriceSelectionRef.current?.(param.point.y);
      }
    };
    mainChart.subscribeClick(handleMainChartClick);

    const handleMobileTouchSelection = (e: TouchEvent) => {
      if (!markingSlTpStateRef.current || !mainContainerEl) return;
      const touch = e.changedTouches?.[0] || e.touches?.[0];
      if (touch) {
        const rect = mainContainerEl.getBoundingClientRect();
        handleChartPriceSelectionRef.current?.(touch.clientY - rect.top);
      }
    };
    if (mainContainerEl) {
      mainContainerEl.addEventListener('touchend', handleMobileTouchSelection, { passive: true });
    }

    // Trigger an initial resize layout pass after browser has finished laying out elements
    const initialResizeTimer = setTimeout(runResize, 100);

    return () => {
      try {
        mainChart.unsubscribeClick(handleMainChartClick);
      } catch (_) {}
      if (rootEl) {
        rootEl.removeEventListener('wheel', handleWheel);
      }
      if (mainContainerEl) {
        mainContainerEl.removeEventListener('pointerdown', handleChartInteraction);
        mainContainerEl.removeEventListener('pointermove', handleChartInteraction);
        mainContainerEl.removeEventListener('pointerup', handleChartInteraction);
        mainContainerEl.removeEventListener('wheel', handleChartInteraction);
        mainContainerEl.removeEventListener('touchend', handleMobileTouchSelection);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', runResize);
      window.removeEventListener('focus', runResize);
      window.removeEventListener('vortex_bottom_nav_collapsed', runResize);
      document.removeEventListener('visibilitychange', runResize);
      clearTimeout(initialResizeTimer);

      // Unsubscribe all timescale sync handlers
      syncHandlers.forEach(({ timeScale, handler }) => {
        try {
          timeScale.unsubscribeVisibleLogicalRangeChange(handler);
        } catch (_) {}
      });

      mainChart.remove();
      mainChartRef.current = null;
      candleSeriesRef.current = null;
      lastChartDataLengthRef.current = 0;
      lastChartDataTimeRef.current = 0;
      markersPluginRef.current = null;
      volumeSeriesRef.current = null;
      smaSeriesRef.current = null;
      ema21SeriesRef.current = null;
      ema50SeriesRef.current = null;
      fvgUpSeriesPoolRef.current = [];
      fvgDownSeriesPoolRef.current = [];
      dynamicSeriesPoolRef.current.clear();
      activePriceLinesRef.current = [];
      tradePriceLinesMapRef.current.clear();
      lastAppliedLevelsKeyRef.current = '';

      if (rsiChart) {
        rsiChart.remove();
        rsiChartRef.current = null;
        rsiSeriesRef.current = null;
      }
      if (macdChart) {
        macdChart.remove();
        macdChartRef.current = null;
        macdLineSeriesRef.current = null;
        macdSignalSeriesRef.current = null;
        macdHistSeriesRef.current = null;
      }
      if (emacdChart) {
        emacdChart.remove();
        emacdChartRef.current = null;
        emacdHistSeriesRef.current = null;
        emacdExplosionSeriesRef.current = null;
        emacdDeadZoneSeriesRef.current = null;
      }
      if (timeHeatmapChart) {
        timeHeatmapChart.remove();
        timeHeatmapChartRef.current = null;
        timeHeatmapHistSeriesRef.current = null;
        timeHeatmapLineSeriesRef.current = null;
        timeHeatmapForecastSeriesRef.current = null;
        timeHeatmapThresholdSeriesRef.current = null;
      }
      if (axionTrendChart) {
        axionTrendChart.remove();
        axionTrendChartRef.current = null;
        axionTrendHistSeriesRef.current = null;
        axionTrendUpperSeriesRef.current = null;
        axionTrendMidSeriesRef.current = null;
        axionTrendLowerSeriesRef.current = null;
        axionTrendZeroSeriesRef.current = null;
        axionTrendMacdbbSeriesRef.current = null;
      }
      if (momentumMatrixChart) {
        momentumMatrixChart.remove();
        momentumMatrixChartRef.current = null;
        momentumCombinedIndicesSeriesRef.current = null;
        momentumCombinedStocksSeriesRef.current = null;
        momentumVixSeriesRef.current = null;
        momentumDxySeriesRef.current = null;
        momentumNqSeriesRef.current = null;
        momentumEsSeriesRef.current = null;
        momentumIndividualTechPoolRef.current.clear();
      }
    };
  }, [
    effectiveShowSma9,
    effectiveShowEma21,
    effectiveShowEma50,
    effectiveShowRsi,
    effectiveShowMacd,
    effectiveShowEMacd,
    effectiveShowTimeHeatmap,
    effectiveShowAxionTrendSubPanel,
    effectiveShowMomentumMatrix,
    momentumMatrixIndConfig,
    isZoomed,
    settings?.chart_color_theme
  ]);

  // Real-time Theme Dynamic Update Effect (Sem recarregar a tela)
  useEffect(() => {
    const applyCurrentTheme = (themeKey?: string) => {
      const activeKey = themeKey || settings?.chart_color_theme || localStorage.getItem('vortex_chart_theme') || 'black';
      const colors = getChartThemeColors(activeKey);
      const lightBg = isLightChartBackground(colors.bg);
      setIsLightChartBg(lightBg);
      const isArrow = cursorModeRef.current === 'arrow';

      if (mainChartRef.current) {
        mainChartRef.current.applyOptions({
          layout: {
            background: { color: colors.bg },
            textColor: colors.textColor
          },
          grid: {
            vertLines: { color: colors.gridColor },
            horzLines: { color: colors.gridColor }
          },
          crosshair: {
            mode: isArrow ? 2 : 1,
            vertLine: {
              visible: !isArrow,
              color: colors.crosshairColor,
              labelBackgroundColor: lightBg ? '#0f172a' : '#1e293b',
            },
            horzLine: {
              visible: !isArrow,
              color: colors.crosshairColor,
              labelBackgroundColor: lightBg ? '#0f172a' : '#1e293b',
            },
          },
          timeScale: {
            borderColor: colors.borderColor
          },
          rightPriceScale: {
            visible: isMobile ? !hidePriceScaleMobile : true,
            borderColor: colors.borderColor,
            minimumWidth: isMobile ? (hidePriceScaleMobile ? 0 : 55) : 85,
            scaleMargins: {
              top: 0.06,
              bottom: 0.06,
            },
          }
        });
      }

      if (candleSeriesRef.current) {
        candleSeriesRef.current.applyOptions({
          upColor: colors.upColor,
          downColor: colors.downColor,
          borderVisible: colors.borderVisible || false,
          borderColor: colors.borderColor,
          wickUpColor: colors.wickUpColor,
          wickDownColor: colors.wickDownColor
        });
      }

      if (rsiChartRef.current) {
        rsiChartRef.current.applyOptions({
          layout: { background: { color: colors.bg }, textColor: colors.textColor },
          grid: { vertLines: { color: colors.gridColor }, horzLines: { color: colors.gridColor } }
        });
      }
      if (macdChartRef.current) {
        macdChartRef.current.applyOptions({
          layout: { background: { color: colors.bg }, textColor: colors.textColor },
          grid: { vertLines: { color: colors.gridColor }, horzLines: { color: colors.gridColor } }
        });
      }
      if (emacdChartRef.current) {
        emacdChartRef.current.applyOptions({
          layout: { background: { color: colors.bg }, textColor: colors.textColor },
          grid: { vertLines: { color: colors.gridColor }, horzLines: { color: colors.gridColor } }
        });
      }
      if (axionTrendChartRef.current) {
        axionTrendChartRef.current.applyOptions({
          layout: { background: { color: colors.bg }, textColor: colors.textColor },
          grid: { vertLines: { color: colors.gridColor }, horzLines: { color: colors.gridColor } }
        });
      }
      if (momentumMatrixChartRef.current) {
        momentumMatrixChartRef.current.applyOptions({
          layout: { background: { color: colors.bg }, textColor: colors.textColor },
          grid: { vertLines: { color: colors.gridColor }, horzLines: { color: colors.gridColor } }
        });
      }
    };

    applyCurrentTheme(settings?.chart_color_theme);

    const handleThemeEvent = (e: any) => {
      if (e.detail?.theme) {
        applyCurrentTheme(e.detail.theme);
      }
    };

    const handleCustomStylesEvent = () => {
      applyCurrentTheme(settings?.chart_color_theme);
    };

    window.addEventListener('vortex_chart_theme_changed', handleThemeEvent);
    window.addEventListener('vortex_chart_custom_styles_changed', handleCustomStylesEvent);
    return () => {
      window.removeEventListener('vortex_chart_theme_changed', handleThemeEvent);
      window.removeEventListener('vortex_chart_custom_styles_changed', handleCustomStylesEvent);
    };
  }, [
    settings?.chart_color_theme,
    settings?.chart_candle_up_color,
    settings?.chart_candle_down_color,
    settings?.chart_grid_enabled,
    settings?.chart_grid_color,
    settings?.chart_candle_border_visible,
    settings?.chart_price_line_visible,
    settings?.chart_scale_font_size
  ]);

  // Atualiza modo do cursor (Mira vs Seta livre) em tempo real no gráfico
  useEffect(() => {
    if (!mainChartRef.current) return;
    const activeKey = settings?.chart_color_theme || localStorage.getItem('vortex_chart_theme') || 'black';
    const colors = getChartThemeColors(activeKey);
    const lightBg = isLightChartBackground(colors.bg);
    const isArrow = cursorMode === 'arrow';
    try {
      mainChartRef.current.applyOptions({
        crosshair: {
          mode: isArrow ? 2 : 1,
          vertLine: {
            visible: !isArrow,
            color: colors.crosshairColor,
            labelBackgroundColor: lightBg ? '#0f172a' : '#1e293b',
          },
          horzLine: {
            visible: !isArrow,
            color: colors.crosshairColor,
            labelBackgroundColor: lightBg ? '#0f172a' : '#1e293b',
          },
        }
      });
    } catch (_) {}
  }, [cursorMode, settings?.chart_color_theme]);

  // Helper para alinhar o timestamp de ordens/sinais exatamente ao timestamp do candle correspondente na tela
  const findCandleTimeForDate = useCallback((dateInput: any, candles: any[], tfMinutes: number = 1): number | null => {
    if (!candles || candles.length === 0 || !dateInput) return null;
    const orderDate = getSaoPauloDate(dateInput);
    if (isNaN(orderDate.getTime())) return null;

    const oYear = orderDate.getFullYear();
    const oMonth = orderDate.getMonth();
    const oDay = orderDate.getDate();
    const oMinuteOfDay = orderDate.getHours() * 60 + orderDate.getMinutes();

    let bestCandle: any = null;
    let minDiffMinutes = Infinity;

    for (let i = candles.length - 1; i >= 0; i--) {
      const c = candles[i];
      const cDate = getSaoPauloDate(c.timestamp || (c as any).time);
      if (isNaN(cDate.getTime())) continue;

      if (cDate.getFullYear() === oYear && cDate.getMonth() === oMonth && cDate.getDate() === oDay) {
        const cMinuteOfDay = cDate.getHours() * 60 + cDate.getMinutes();
        const diff = Math.abs(cMinuteOfDay - oMinuteOfDay);
        if (diff < minDiffMinutes) {
          minDiffMinutes = diff;
          bestCandle = c;
          if (diff === 0) break;
        }
      }
    }

    const maxAllowedDiff = Math.max(1, tfMinutes) * 2;
    if (bestCandle && minDiffMinutes <= maxAllowedDiff) {
      return bestCandle.time;
    }
    return null;
  }, []);

  const updateTradePriceLines = useCallback(() => {
    if (!candleSeriesRef.current) return;

    const targetId = activePanel?.instance_id || instanceId || 'painel_principal';
    const activeAccountId = activeAccount?.id || null;
    const isSimulatorMode = isSimulator || (simulatedReports && simulatedReports.length > 0);
    const currentReportsToUse: any[] = (reportsRef.current && reportsRef.current.length > 0) ? reportsRef.current : (reports || []);
    const activeReportsToDraw = isSimulatorMode
      ? (simulatedReports && Array.isArray(simulatedReports)
          ? simulatedReports.filter((r: any) => r.status === 'Em Andamento')
          : [])
      : currentReportsToUse.filter(
          (r: any) =>
            (r.panel_id === activePanel?.id || r.instance_id === targetId || (!r.instance_id && targetId === 'painel_principal')) &&
            r.status === 'Em Andamento' &&
            (!activeAccountId || r.account_id === activeAccountId)
        );

    const isDraggingNow = Boolean(draggedLevelsRef.current?.type);

    const tradesToDraw: any[] = [...activeReportsToDraw];
    if (activePosition) {
      const actEntry = activePosition.entry_price !== undefined ? activePosition.entry_price : activePosition.entryPrice;
      const actSl = activePosition.stop_loss !== undefined ? activePosition.stop_loss : activePosition.stopLoss;
      const actTp = activePosition.take_profit !== undefined ? activePosition.take_profit : activePosition.takeProfit;
      const actStrat = activePosition.strategy_name || activePosition.strategyName || 'Operação';
      const actLots = activePosition.contrato || activePosition.contracts || activePosition.quantity || 1;

      // No modo simulador, nunca cruzar activePosition com reports reais
      const isClosedInReports = isSimulatorMode ? false : currentReportsToUse.some(
        (r: any) => (r.id === activePosition.id || (r.entry_price === actEntry && r.side === activePosition.side)) && r.status !== 'Em Andamento'
      );
      if (!isClosedInReports) {
        const alreadyInReports = tradesToDraw.some((r: any) => r.id === activePosition.id || (r.entry_price === actEntry && r.side === activePosition.side));
        if (!alreadyInReports) {
          tradesToDraw.push({
            id: activePosition.id || 'active-pos',
            entry_price: actEntry,
            stop_loss: actSl,
            take_profit: actTp,
            strategy_name: actStrat,
            side: activePosition.side,
            contrato: actLots,
            status: 'Em Andamento'
          });
        }
      }
    }
    if (proposedTrade) {
      tradesToDraw.push({ ...proposedTrade, isProposed: true, id: 'proposed', contrato: finalContractsToUse });
    }

    const hasRealTrades = tradesToDraw.length > 0;
    const keySl = isSimulatorMode || isSimulator ? 'vortex_replay_custom_sl_price' : 'vortex_custom_sl_price';
    const keyTp = isSimulatorMode || isSimulator ? 'vortex_replay_custom_tp_price' : 'vortex_custom_tp_price';
    const keyMode = isSimulatorMode || isSimulator ? 'vortex_replay_stop_mode' : 'vortex_stop_mode';
    const currentStopMode = typeof window !== 'undefined' ? localStorage.getItem(keyMode) : null;
    const savedSl = typeof window !== 'undefined' ? localStorage.getItem(keySl) : null;
    const savedTp = typeof window !== 'undefined' ? localStorage.getItem(keyTp) : null;
    const activeMarkingState = markingSlTpStateRef.current;
    const activeTempSl = tempSlPriceRef.current;
    const customSl = activeTempSl !== null ? activeTempSl : (activeMarkingState === 'marking_sl' ? null : (savedSl ? Number(savedSl) : null));
    const customTp = (activeMarkingState === 'marking_sl' || activeMarkingState === 'marking_tp') ? null : (savedTp ? Number(savedTp) : null);
    const markerPanelId = typeof window !== 'undefined' ? localStorage.getItem('vortex_custom_sltp_panel_id') : null;
    const isMarkerForThisPanel = isSimulatorMode || isSimulator || !markerPanelId || !activePanel?.id || markerPanelId === activePanel.id;

    if (!hasRealTrades && isMarkerForThisPanel && (currentStopMode === 'grafico' || activeMarkingState !== null) && (customSl !== null || customTp !== null)) {
      const refEntry = currentPriceRef.current || (chartDataRef.current.length > 0 ? chartDataRef.current[chartDataRef.current.length - 1].close : 0);
      tradesToDraw.push({
        id: 'custom_marker',
        entry_price: refEntry,
        stop_loss: customSl !== null ? customSl : 0,
        take_profit: customTp !== null ? customTp : 0,
        strategy_name: 'Marcação Gráfico',
        side: (customSl && customSl < refEntry ? 'COMPRA' : 'VENDA'),
        contrato: finalContractsToUse || 1,
        isProposed: true,
        isProvisionalMarker: true
      });
    }

    if (!hasRealTrades && currentStopMode === 'range') {
      const refEntry = currentPriceRef.current || (chartDataRef.current.length > 0 ? chartDataRef.current[chartDataRef.current.length - 1].close : 0);
      if (refEntry > 0) {
        const keyRangeRef = isSimulatorMode || isSimulator ? 'vortex_replay_range_candle_ref' : 'vortex_range_candle_ref';
        const keyRangeMult = isSimulatorMode || isSimulator ? 'vortex_replay_range_tp_multiplier' : 'vortex_range_tp_multiplier';
        const keyRangeSide = isSimulatorMode || isSimulator ? 'vortex_replay_range_side' : 'vortex_range_side';
        const candleRef = typeof window !== 'undefined' ? Number(localStorage.getItem(keyRangeRef) || (settings?.chart_manual_range_candle_ref ?? 1)) : 1;
        const tpMult = typeof window !== 'undefined' ? Number(localStorage.getItem(keyRangeMult) || (settings?.chart_manual_range_tp_multiplier ?? 1.0)) : 1.0;
        const rangeSide = typeof window !== 'undefined' ? (localStorage.getItem(keyRangeSide) || 'COMPRA') : 'COMPRA';
        const candles = chartDataRef.current || [];
        const tickSz = resolvePanelTickSize(activePanel, settings) || 0.25;

        if (rangeSide === 'COMPRA' || rangeSide === 'AMBOS') {
          const buyLvl = calculateRangeHlLevels('COMPRA', refEntry, candles, candleRef, tpMult, tickSz);
          tradesToDraw.push({
            id: 'range_marker_buy',
            entry_price: refEntry,
            stop_loss: buyLvl.slPrice,
            take_profit: buyLvl.tpPrice,
            strategy_name: 'Range HL (Compra)',
            side: 'COMPRA',
            contrato: finalContractsToUse || 1,
            isProposed: true,
            isProvisionalMarker: true
          });
        }

        if (rangeSide === 'VENDA' || rangeSide === 'AMBOS') {
          const sellLvl = calculateRangeHlLevels('VENDA', refEntry, candles, candleRef, tpMult, tickSz);
          tradesToDraw.push({
            id: 'range_marker_sell',
            entry_price: refEntry,
            stop_loss: sellLvl.slPrice,
            take_profit: sellLvl.tpPrice,
            strategy_name: 'Range HL (Venda)',
            side: 'VENDA',
            contrato: finalContractsToUse || 1,
            isProposed: true,
            isProvisionalMarker: true
          });
        }
      }
    }

    if (!hasRealTrades && currentStopMode === 'nivel') {
      const refEntry = currentPriceRef.current || (chartDataRef.current.length > 0 ? chartDataRef.current[chartDataRef.current.length - 1].close : 0);
      if (refEntry > 0) {
        const keyNivelSide = isSimulatorMode || isSimulator ? 'vortex_replay_nivel_side' : 'vortex_nivel_side';
        const nivelSide = typeof window !== 'undefined' ? (localStorage.getItem(keyNivelSide) || 'AMBOS') : 'AMBOS';
        const tickSz = resolvePanelTickSize(activePanel, settings) || 0.25;
        const ptsSl = manualSlPoints && manualSlPoints > 0 ? manualSlPoints : 50;
        const ptsTp = manualTpPoints && manualTpPoints > 0 ? manualTpPoints : 25;

        if (nivelSide === 'COMPRA' || nivelSide === 'AMBOS') {
          const slBuy = roundToTick(resolveLevelPrice('COMPRA', 'SL', refEntry, gammaLevels, ptsSl, ptsTp), tickSz);
          const tpBuy = roundToTick(resolveLevelPrice('COMPRA', 'TP', refEntry, gammaLevels, ptsSl, ptsTp), tickSz);
          tradesToDraw.push({
            id: 'nivel_marker_buy',
            entry_price: refEntry,
            stop_loss: slBuy,
            take_profit: tpBuy,
            strategy_name: 'Nível (Compra)',
            side: 'COMPRA',
            contrato: finalContractsToUse || 1,
            isProposed: true,
            isProvisionalMarker: true
          });
        }

        if (nivelSide === 'VENDA' || nivelSide === 'AMBOS') {
          const slSell = roundToTick(resolveLevelPrice('VENDA', 'SL', refEntry, gammaLevels, ptsSl, ptsTp), tickSz);
          const tpSell = roundToTick(resolveLevelPrice('VENDA', 'TP', refEntry, gammaLevels, ptsSl, ptsTp), tickSz);
          tradesToDraw.push({
            id: 'nivel_marker_sell',
            entry_price: refEntry,
            stop_loss: slSell,
            take_profit: tpSell,
            strategy_name: 'Nível (Venda)',
            side: 'VENDA',
            contrato: finalContractsToUse || 1,
            isProposed: true,
            isProvisionalMarker: true
          });
        }
      }
    }

    const keyRangeRef = isSimulatorMode || isSimulator ? 'vortex_replay_range_candle_ref' : 'vortex_range_candle_ref';
    const keyRangeMult = isSimulatorMode || isSimulator ? 'vortex_replay_range_tp_multiplier' : 'vortex_range_tp_multiplier';
    const keyRangeSide = isSimulatorMode || isSimulator ? 'vortex_replay_range_side' : 'vortex_range_side';
    const candleRefKey = typeof window !== 'undefined' ? (localStorage.getItem(keyRangeRef) || '1') : '1';
    const tpMultKey = typeof window !== 'undefined' ? (localStorage.getItem(keyRangeMult) || '1') : '1';
    const rangeSideKey = typeof window !== 'undefined' ? (localStorage.getItem(keyRangeSide) || 'COMPRA') : 'COMPRA';
    const lastCloseKey = chartDataRef.current.length > 0 ? chartDataRef.current[chartDataRef.current.length - 1].close : 0;
    const rangeKey = currentStopMode === 'range' ? `_r_${candleRefKey}_${tpMultKey}_${rangeSideKey}_${lastCloseKey}` : '';

    const keyNivelSide = isSimulatorMode || isSimulator ? 'vortex_replay_nivel_side' : 'vortex_nivel_side';
    const nivelSideKey = typeof window !== 'undefined' ? (localStorage.getItem(keyNivelSide) || 'AMBOS') : 'AMBOS';
    const nivelKey = currentStopMode === 'nivel' ? `_n_${nivelSideKey}_${lastCloseKey}` : '';

    const customMarkerKey = `${currentStopMode}_${markingSlTpState}_${customSl}_${customTp}_${finalContractsToUse}${rangeKey}${nivelKey}`;
    const levelsKey = `${activeAccountId || 'no_acc'}_${targetId}_${activeReportsToDraw.map((r: any) => `${r.id}_${r.stop_loss}_${r.take_profit}_${r.entry_price}_${r.contrato || (r as any).quantity || 1}`).join('|')}_${activePosition ? `${activePosition.id}_${activePosition.stop_loss ?? activePosition.stopLoss}_${activePosition.take_profit ?? activePosition.takeProfit}_${activePosition.entry_price ?? activePosition.entryPrice}_${activePosition.contrato ?? activePosition.contracts ?? 1}` : ''}_${proposedTrade ? `${proposedTrade.stopLoss}_${proposedTrade.takeProfit}_${proposedTrade.entry}_${finalContractsToUse}` : ''}_${customMarkerKey}`;

    const expectedTradesCount = tradesToDraw.length;
    const needsRedraw = levelsKey !== lastAppliedLevelsKeyRef.current || isDraggingNow || (expectedTradesCount > 0 && activePriceLinesRef.current.length === 0);

    if (needsRedraw) {
      lastAppliedLevelsKeyRef.current = levelsKey;

      // Clear old price lines
      activePriceLinesRef.current.forEach(line => {
        try {
          if (candleSeriesRef.current) {
            candleSeriesRef.current.removePriceLine(line);
          }
        } catch (e) {}
      });
      activePriceLinesRef.current = [];
      tradePriceLinesMapRef.current.clear();

      // Plot Active Trades Entry, Stop Loss, e Take Profit para todas as operações abertas, proposta ou marcação personalizada
      tradesToDraw.forEach(tradeToDraw => {
        const tradeId = tradeToDraw.id || 'proposed';
        const isCustomMarker = tradeId === 'custom_marker';
        const isRangeMarker = tradeId === 'range_marker_buy' || tradeId === 'range_marker_sell' || tradeId === 'range_marker';
        const isLevelMarker = tradeId === 'nivel_marker_buy' || tradeId === 'nivel_marker_sell' || tradeId === 'nivel_marker';
        const entryPrice = 'entry_price' in tradeToDraw ? Number((tradeToDraw as any).entry_price) : Number((tradeToDraw as any).entry);
        const rawStopLossPrice = 'stop_loss' in tradeToDraw ? Number((tradeToDraw as any).stop_loss) : Number((tradeToDraw as any).stopLoss);
        const rawTakeProfitPrice = 'take_profit' in tradeToDraw ? Number((tradeToDraw as any).take_profit) : Number((tradeToDraw as any).takeProfit);
        const isProposed = !!tradeToDraw.isProposed || !('id' in tradeToDraw && tradeToDraw.id !== 'proposed' && tradeToDraw.id !== activePosition?.id);
        const isDraggingSl = draggedLevelsRef.current.reportId === tradeId && draggedLevelsRef.current.type === 'stop_loss';
        const isDraggingTp = draggedLevelsRef.current.reportId === tradeId && draggedLevelsRef.current.type === 'take_profit';

        const opt = optimisticReportLevelsRef.current.get(tradeId);
        const isOptValid = opt && (Date.now() - opt.timestamp < 30000);

        const stopLossPrice = isDraggingSl && draggedLevelsRef.current.price !== null
          ? draggedLevelsRef.current.price
          : (isOptValid && opt.stop_loss !== undefined
              ? (opt.stop_loss !== null ? Number(opt.stop_loss) : 0)
              : rawStopLossPrice);

        const takeProfitPrice = isDraggingTp && draggedLevelsRef.current.price !== null
          ? draggedLevelsRef.current.price
          : (isOptValid && opt.take_profit !== undefined
              ? (opt.take_profit !== null ? Number(opt.take_profit) : 0)
              : rawTakeProfitPrice);

        let lineEntry: any = null;
        let lineSl: any = null;
        let lineTp: any = null;

        if (!isCustomMarker && !isRangeMarker && !isLevelMarker && !isNaN(entryPrice) && entryPrice > 0) {
          try {
            lineEntry = candleSeriesRef.current.createPriceLine({
              price: entryPrice,
              color: isProposed ? '#38bdf888' : '#38bdf8',
              lineWidth: 2,
              lineStyle: isProposed ? 2 : 0,
              axisLabelVisible: false,
              title: '',
            });
            activePriceLinesRef.current.push(lineEntry);
          } catch (err) {
            console.error('Error creating entry price line:', err);
          }
        }

        if (!isNaN(stopLossPrice) && stopLossPrice > 0) {
          try {
            const sideText = 'side' in tradeToDraw ? (tradeToDraw as any).side : '';
            const isBuy = sideText === 'COMPRA' || sideText === 'BUY';
            const isSlGain = !isNaN(entryPrice) && entryPrice > 0 && (isBuy ? stopLossPrice > entryPrice : stopLossPrice < entryPrice);
            const isSlBe = !isNaN(entryPrice) && entryPrice > 0 && Math.abs(stopLossPrice - entryPrice) < 0.01;
            const slLineColor = isSlGain ? '#10b981' : (isSlBe ? '#38bdf8' : '#ef4444');

            lineSl = candleSeriesRef.current.createPriceLine({
              price: stopLossPrice,
              color: (isCustomMarker || isRangeMarker || isLevelMarker) ? slLineColor : (isProposed ? `${slLineColor}88` : slLineColor),
              lineWidth: isDraggingSl ? 3 : 2,
              lineStyle: isDraggingSl ? 0 : 2,
              axisLabelVisible: false,
              title: '',
            });
            activePriceLinesRef.current.push(lineSl);
          } catch (err) {
            console.error('Error creating stop loss price line:', err);
          }
        }

        if (!isNaN(takeProfitPrice) && takeProfitPrice > 0) {
          try {
            lineTp = candleSeriesRef.current.createPriceLine({
              price: takeProfitPrice,
              color: (isCustomMarker || isRangeMarker || isLevelMarker) ? '#22c55e' : (isProposed ? '#22c55e88' : '#22c55e'),
              lineWidth: isDraggingTp ? 3 : 2,
              lineStyle: isDraggingTp ? 0 : 2,
              axisLabelVisible: false,
              title: '',
            });
            activePriceLinesRef.current.push(lineTp);
          } catch (err) {
            console.error('Error creating take profit price line:', err);
          }
        }

        tradePriceLinesMapRef.current.set(tradeId, { entry: lineEntry, sl: lineSl, tp: lineTp });
      });
    }
  }, [activePanel, instanceId, activeAccount, isSimulator, simulatedReports, reports, activePosition, proposedTrade, finalContractsToUse, tempSlPrice, markingSlTpState, customMarkersVersion, showOrderLines, manualTradeMode]);

  useEffect(() => {
    updateTradePriceLinesRef.current = updateTradePriceLines;
  });

  // Effect 2: Update series data in-place to preserve user's zoom/scroll/pan state
  useEffect(() => {
    try {
      if (!candleSeriesRef.current) return;

    if (chartData.length < 2) {
      isHistoryPlottedRef.current = false;
      // CRÍTICO: zera os marcadores de comprimento/tempo para que a próxima carga completa
      // seja tratada como carga nova (setData) e não como "mesma vela" (update de 1 candle só).
      lastChartDataLengthRef.current = 0;
      lastChartDataTimeRef.current = 0;
      isFirstDataLoadRef.current = true;
      candleSeriesRef.current.setData([]);
      if (markersPluginRef.current) {
        try { markersPluginRef.current.setMarkers([]); } catch (_) {}
      }
      tradeMarkersRef.current = [];
      dynamicMarkersRef.current = [];
      lastAppliedMarkersStrRef.current = '';
      return;
    }

    // 1. Update main price series and indicators
    const targetColor = showPva ? '#b91c1c' : '#ef4444';
    const panelTickSize = resolvePanelTickSize(activePanel, settings);
    const panelPrecision = panelTickSize < 1 ? Math.max(2, getTickDecimals(panelTickSize)) : getTickDecimals(panelTickSize);
    const priceFmtKey = `${targetColor}_${panelTickSize}`;
    if (lastPriceFormatColorRef.current !== priceFmtKey) {
      lastPriceFormatColorRef.current = priceFmtKey;
      candleSeriesRef.current.applyOptions({
        priceFormat: {
          type: 'price',
          precision: panelPrecision,
          minMove: panelTickSize,
        },
        priceLineColor: targetColor
      });
    }

    const prevLen = lastChartDataLengthRef.current;
    const prevLastTime = lastChartDataTimeRef.current;
    const curLen = chartData.length;
    const curLastCandle = chartData[curLen - 1];
    const curLastTime = curLastCandle ? curLastCandle.time : 0;

    const isTfChanged = lastTimeframeRef.current !== timeframe;
    if (isTfChanged) {
      confirmedMacdDivergencesRef.current.clear();
      lastRecentCandlesRef.current = '';
    }
    lastTimeframeRef.current = timeframe;

    // Assinatura das 6 barras ANTERIORES à corrente (a corrente é atualizada via update() a cada tick).
    // Só há re-plotagem completa se uma vela já fechada mudar na fonte (ex.: fechamento final gravado no Supabase).
    const recentTail = chartData.slice(-7, -1);
    const recentTailSignature = recentTail.map(c => `${c.time}_${c.open}_${c.high}_${c.low}_${c.close}`).join('|');
    const hasPastBarsChanged = lastRecentCandlesRef.current !== '' && lastRecentCandlesRef.current !== recentTailSignature;
    lastRecentCandlesRef.current = recentTailSignature;

    const isSameCandle = !isTfChanged && prevLen > 0 && curLen === prevLen && curLastTime === prevLastTime && !hasPastBarsChanged;

    if (isSameCandle && curLastCandle) {
      try {
        candleSeriesRef.current.update(curLastCandle);
      } catch (_) {
        const savedRange = !autoCenterRef.current && mainChartRef.current ? mainChartRef.current.timeScale().getVisibleLogicalRange() : null;
        lastAppliedMarkersStrRef.current = '';
        if (markersPluginRef.current) {
          try { markersPluginRef.current.setMarkers([]); } catch (_) {}
        }
        candleSeriesRef.current.setData(chartData as any);
        if (!loadingProgress?.isLoading && chartData.length >= 2) {
          isHistoryPlottedRef.current = true;
        }
        if (savedRange && mainChartRef.current) {
          try { mainChartRef.current.timeScale().setVisibleLogicalRange(savedRange); } catch (_) {}
        }
      }
    } else {
      const isFirstLoad = prevLen === 0 || isFirstDataLoadRef.current;
      const isJump = isSimulator || Math.abs(curLen - prevLen) > 1;
      const savedRange = !isFirstLoad && !autoCenterRef.current && !isJump && mainChartRef.current && !isTfChanged 
        ? mainChartRef.current.timeScale().getVisibleLogicalRange() 
        : null;

      // Invalida o cache de marcadores ANTES do setData completo para forçar a reaplicação
      // depois que o novo priceScale for inicializado (evita "Value is null" do lightweight-charts)
      lastAppliedMarkersStrRef.current = '';
      if (markersPluginRef.current) {
        try { markersPluginRef.current.setMarkers([]); } catch (_) {}
      }

      candleSeriesRef.current.setData(chartData as any);
      if (!loadingProgress?.isLoading && chartData.length >= 2) {
        isHistoryPlottedRef.current = true;
      }

      if (mainChartRef.current) {
        if ((isFirstLoad || isTfChanged || (isSimulator && isJump)) && curLen > 0) {
          applySavedViewport(isTfChanged);

          if (curLen >= 15) {
            isFirstDataLoadRef.current = false;
          }
        } else if (autoCenterRef.current) {
          try {
            mainChartRef.current.priceScale('right').applyOptions({
              autoScale: true,
              scaleMargins: {
                top: 0.06,
                bottom: 0.06,
              },
            });
            const curLogicalRange = mainChartRef.current.timeScale().getVisibleLogicalRange();
            if (!curLogicalRange || curLogicalRange.to >= curLen - 5) {
              mainChartRef.current.timeScale().scrollToRealTime();
            } else if (savedRange) {
              mainChartRef.current.timeScale().setVisibleLogicalRange(savedRange);
            }
          } catch (_) {}
        } else if (savedRange) {
          try {
            mainChartRef.current.timeScale().setVisibleLogicalRange(savedRange);
          } catch (_) {}
        }
      }
    }

    lastChartDataLengthRef.current = curLen;
    lastChartDataTimeRef.current = curLastTime;

      // Adicionar marcadores de sinais dos algoritmos dinâmicos e sessões
      let markers: any[] = [];

      const isSimMode = !!isSimulator || (simulatedReports && simulatedReports.length > 0);

      // Adicionar marcadores de disparos de algoritmos e alertas
      if (combinedIndicatorSignals && combinedIndicatorSignals.length > 0) {
        const currentPanelId = activePanel?.id;
        const currentAccountId = activeAccount?.id || null;
        const indicatorAlgoIds = new Set(
          (activeIndicators || [])
            .filter((i: any) => i.type === 'ALGORITMO' && i.visible !== false && i.params?.strategy_id)
            .map((i: any) => String(i.params.strategy_id))
        );
        const activeStratIds = new Set<string>();
        (customStrategies || []).forEach((s: any) => {
          const sId = String(s.id);
          if ((s.active || indicatorAlgoIds.has(sId)) && !(pausedStrategyIds || []).map(String).includes(sId)) {
            activeStratIds.add(sId);
          }
        });
        (publicStrategies || []).forEach((s: any) => {
          const sId = String(s.id);
          if ((s.active || indicatorAlgoIds.has(sId)) && !(pausedStrategyIds || []).map(String).includes(sId)) {
            activeStratIds.add(sId);
          }
        });
        activeIndicatorStrategies.forEach((s: any) => activeStratIds.add(String(s.id)));

        const algoMarkers = combinedIndicatorSignals
          .filter((s: any) => {
            if (isSimMode) return true;
            if (currentPanelId && s.panelId && s.panelId !== currentPanelId) return false;
            const sId = String(s.strategyId || '');
            if (sId && !activeStratIds.has(sId)) return false;
            // Se o sinal possui conta vinculada, só renderiza se o gráfico estiver com essa conta selecionada
            if (s.accountId && currentAccountId && s.accountId !== currentAccountId) return false;
            return true;
          })
          .map((s: any) => {
            const isCompra = s.side === 'COMPRA';
            const isAlert = s.action === 'alert' || s.type === 'alert' || s.isAlert;
            const shiftedTime = findCandleTimeForDate(s.time, chartDataRef.current, timeframe || 1);
            if (!shiftedTime) return null;
            return {
              time: shiftedTime,
              position: isCompra ? 'belowBar' : 'aboveBar',
              color: isAlert ? (isCompra ? '#a855f7' : '#ec4899') : (isCompra ? '#22c55e' : '#ef4444'),
              shape: isAlert ? (isCompra ? 'arrowUp' : 'arrowDown') : (isCompra ? 'arrowUp' : 'arrowDown'),
              text: isAlert ? `🔔 ${s.strategyName || 'Robô'}` : `[ALGO] ${s.strategyName || 'Robô'}`,
              size: isAlert ? 1.8 : 2.0
            };
          })
          .filter((m: any) => m && m.time > 0);
        markers = [...markers, ...algoMarkers];
      }

      // Adicionar marcadores de ordens salvas nos relatórios reais (apenas se NÃO estiver em modo simulador)
      if (!isSimMode && reports && reports.length > 0) {
        const currentPanelId = activePanel?.id;
        const currentInstanceId = activePanel?.instance_id || instanceId || 'painel_principal';
        const currentAccountId = activeAccount?.id || null;
        const reportMarkers = reports
          .filter((r: any) =>
            (r.panel_id === currentPanelId || r.instance_id === currentInstanceId) &&
            (!currentAccountId || r.account_id === currentAccountId)
          )
          .map((r: any) => {
            const isCompra = r.side === 'COMPRA';
            // Alinha a ordem exatamente ao candle da tela em que foi executada (ex: 22:39, 22:42)
            const matchedTime = findCandleTimeForDate(r.created_at, chartDataRef.current, timeframe || 1);
            if (!matchedTime) return null;
            
            const stratName = String(r.strategy_name || '');
            const desc = String(r.description || '');
            let markerText = '';
            
            if (stratName.startsWith('RP ') || stratName.startsWith('RV ')) {
              markerText = stratName.split('(')[0].trim();
            } else if (desc.includes('RP ') || desc.includes('RV ')) {
              const match = desc.match(/(RP|RV)\s+(BOX|LINE|TREND|FIBO|CANAL)/i);
              markerText = match ? match[0].toUpperCase() : '';
            }

            return {
              time: matchedTime,
              position: isCompra ? 'belowBar' : 'aboveBar',
              color: isCompra ? '#22c55e' : '#ef4444',
              shape: isCompra ? 'arrowUp' : 'arrowDown',
              text: markerText,
              size: markerText ? 2.2 : 1.5
            };
          })
          .filter((m: any) => m && m.time > 0);

        for (const rm of reportMarkers) {
          if (!markers.some(m => m.time === rm.time && m.shape === rm.shape)) {
            markers.push(rm);
          }
        }
      }

      // Adicionar marcadores de simulação históricos se fornecidos (com desduplicação por tempo/formato)
      if (simulatedReports && simulatedReports.length > 0) {
        simulatedReports.forEach((s: any) => {
          const isCompra = s.side === 'COMPRA';
          const timeRaw = s.signal_time || s.signalTime || s.simulated_time || s.simulatedTime || s.entry_time || s.entryTime || s.created_at || s.timestamp;
          const shiftedTime = findCandleTimeForDate(timeRaw, chartDataRef.current, timeframe || 1);
          if (!shiftedTime || shiftedTime <= 0) return;
          const rawStratName = String(s.strategy_name || s.strategyName || s.description || '').replace(/^Robô\s*/i, '').trim();
          const isAi = rawStratName.includes('IA') || rawStratName.includes('🧠') || String(s.description || '').includes('IA');
          const shape = isCompra ? 'arrowUp' : 'arrowDown';

          if (!markers.some(m => m.time === shiftedTime && m.shape === shape)) {
            markers.push({
              time: shiftedTime,
              position: isCompra ? 'belowBar' : 'aboveBar',
              color: isAi ? '#06b6d4' : (isCompra ? '#22c55e' : '#ef4444'),
              shape,
              text: isAi ? `🧠 [IA] ${rawStratName.replace(/^[🧠⚡\s\[\]IAESTRATEGIA]*/g, '')}` : `[SIM] Robô ${rawStratName || 'Trade'}`,
              size: isAi ? 2 : 1.5
            });
          }
        });
      }

      // Adicionar marcador da posição ativa atual (somente se ainda não houver marcador pra esta vela/operação)
      if (activePosition) {
        const timeRaw = activePosition.simulatedTime || activePosition.simulated_time || activePosition.entry_time || activePosition.entryTime || activePosition.timestamp;
        if (timeRaw) {
          const isCompra = activePosition.side === 'COMPRA';
          const shiftedTime = findCandleTimeForDate(timeRaw, chartDataRef.current, timeframe || 1);
          const rawStratName = String(activePosition.strategyName || activePosition.strategy_name || activePosition.description || '').replace(/^Robô\s*/i, '').trim();
          const isAi = rawStratName.includes('IA') || rawStratName.includes('🧠');
          const shape = isCompra ? 'arrowUp' : 'arrowDown';

          if (shiftedTime && shiftedTime > 0 && !markers.some(m => Math.abs(m.time - shiftedTime) <= 10 && m.shape === shape)) {
            markers.push({
              time: shiftedTime,
              position: isCompra ? 'belowBar' : 'aboveBar',
              color: isAi ? '#06b6d4' : (isCompra ? '#22c55e' : '#ef4444'),
              shape,
              text: isAi ? `🧠 [ENTRADA IA] ${rawStratName.replace(/^[🧠⚡\s\[\]IAESTRATEGIA]*/g, '')}` : `[ENTRADA] Robô ${rawStratName || 'Manual'}`,
              size: 2.5
            });
          }
        }
      }

      tradeMarkersRef.current = showTradeMarkers ? markers : [];
      if (updateMarkersRef.current) {
        updateMarkersRef.current();
      }

      // Create new price lines for active Gamma Levels e Active Trades (apenas reconstrói se houver alteração real)
      updateTradePriceLines();

    // 3. Update SMA 9
    if (smaSeriesRef.current) {
      const safeSma9 = (effectiveShowSma9 && sma9Data) ? sanitizeLineSeriesData(sma9Data) : [];
      if (safeSma9.length > 0) {
        const canUpdateInPlace = isSameCandle && lastSmaCountRef.current === safeSma9.length;
        if (canUpdateInPlace) {
          try {
            const lastP = safeSma9[safeSma9.length - 1];
            if (lastP && typeof lastP.value === 'number' && !isNaN(lastP.value) && isFinite(lastP.value)) smaSeriesRef.current.update(lastP);
          } catch (_) {
            try { smaSeriesRef.current.setData(safeSma9 as any); lastSmaCountRef.current = safeSma9.length; } catch (_) {}
          }
        } else {
          try { smaSeriesRef.current.setData(safeSma9 as any); lastSmaCountRef.current = safeSma9.length; } catch (_) {}
        }
      } else {
        try { smaSeriesRef.current.setData([]); lastSmaCountRef.current = 0; } catch (_) {}
      }
    }

    // 4. Update EMA 21
    if (ema21SeriesRef.current) {
      const safeEma21 = (effectiveShowEma21 && ema21Data) ? sanitizeLineSeriesData(ema21Data) : [];
      if (safeEma21.length > 0) {
        const canUpdateInPlace = isSameCandle && lastEma21CountRef.current === safeEma21.length;
        if (canUpdateInPlace) {
          try {
            const lastP = safeEma21[safeEma21.length - 1];
            if (lastP && typeof lastP.value === 'number' && !isNaN(lastP.value) && isFinite(lastP.value)) ema21SeriesRef.current.update(lastP);
          } catch (_) {
            try { ema21SeriesRef.current.setData(safeEma21 as any); lastEma21CountRef.current = safeEma21.length; } catch (_) {}
          }
        } else {
          try { ema21SeriesRef.current.setData(safeEma21 as any); lastEma21CountRef.current = safeEma21.length; } catch (_) {}
        }
      } else {
        try { ema21SeriesRef.current.setData([]); lastEma21CountRef.current = 0; } catch (_) {}
      }
    }

    // 5. Update EMA 50
    if (ema50SeriesRef.current) {
      const safeEma50 = (effectiveShowEma50 && ema50Data) ? sanitizeLineSeriesData(ema50Data) : [];
      if (safeEma50.length > 0) {
        const canUpdateInPlace = isSameCandle && lastEma50CountRef.current === safeEma50.length;
        if (canUpdateInPlace) {
          try {
            const lastP = safeEma50[safeEma50.length - 1];
            if (lastP && typeof lastP.value === 'number' && !isNaN(lastP.value) && isFinite(lastP.value)) ema50SeriesRef.current.update(lastP);
          } catch (_) {
            try { ema50SeriesRef.current.setData(safeEma50 as any); lastEma50CountRef.current = safeEma50.length; } catch (_) {}
          }
        } else {
          try { ema50SeriesRef.current.setData(safeEma50 as any); lastEma50CountRef.current = safeEma50.length; } catch (_) {}
        }
      } else {
        try { ema50SeriesRef.current.setData([]); lastEma50CountRef.current = 0; } catch (_) {}
      }
    }

    // 6. Update RSI
    if (rsiSeriesRef.current) {
      const safeRsi = (effectiveShowRsi && rsiData) ? sanitizeLineSeriesData(rsiData) : [];
      if (safeRsi.length > 0) {
        const canUpdateInPlace = isSameCandle && lastRsiCountRef.current === safeRsi.length;
        if (canUpdateInPlace) {
          try {
            const lastP = safeRsi[safeRsi.length - 1];
            if (lastP && typeof lastP.value === 'number' && !isNaN(lastP.value) && isFinite(lastP.value)) rsiSeriesRef.current.update(lastP);
          } catch (_) {
            try { rsiSeriesRef.current.setData(safeRsi as any); lastRsiCountRef.current = safeRsi.length; } catch (_) {}
          }
        } else {
          try { rsiSeriesRef.current.setData(safeRsi as any); lastRsiCountRef.current = safeRsi.length; } catch (_) {}
        }
      } else {
        try { rsiSeriesRef.current.setData([]); lastRsiCountRef.current = 0; } catch (_) {}
      }
    }

    // 7. Update MACD
    if (macdLineSeriesRef.current) {
      const safeMacd = (effectiveShowMacd && macdData?.macd) ? sanitizeLineSeriesData(macdData.macd) : [];
      const safeSignal = (effectiveShowMacd && macdData?.signal) ? sanitizeLineSeriesData(macdData.signal) : [];
      const safeHist = (effectiveShowMacd && macdData?.histogram) ? sanitizeLineSeriesData(macdData.histogram) : [];

      if (safeMacd.length > 0) {
        const canUpdateInPlace = isSameCandle && lastMacdCountRef.current === safeMacd.length;
        if (canUpdateInPlace) {
          try {
            const lastMacd = safeMacd[safeMacd.length - 1];
            if (lastMacd && typeof lastMacd.value === 'number' && !isNaN(lastMacd.value) && isFinite(lastMacd.value)) {
              macdLineSeriesRef.current.update(lastMacd);
            }
            if (macdSignalSeriesRef.current && safeSignal.length > 0) {
              const lastSig = safeSignal[safeSignal.length - 1];
              if (lastSig && typeof lastSig.value === 'number' && !isNaN(lastSig.value) && isFinite(lastSig.value)) {
                macdSignalSeriesRef.current.update(lastSig);
              }
            }
            if (macdHistSeriesRef.current && safeHist.length > 0) {
              const h = safeHist[safeHist.length - 1];
              if (h && typeof h.value === 'number' && !isNaN(h.value) && isFinite(h.value)) {
                macdHistSeriesRef.current.update({
                  time: h.time,
                  value: h.value,
                  color: h.value >= 0 ? '#10b98180' : '#ef444480'
                });
              }
            }
          } catch (_) {
            try {
              macdLineSeriesRef.current.setData(safeMacd as any);
              if (macdSignalSeriesRef.current) macdSignalSeriesRef.current.setData(safeSignal as any);
              if (macdHistSeriesRef.current) {
                macdHistSeriesRef.current.setData(safeHist.map(h => ({
                  time: h.time,
                  value: h.value,
                  color: h.value >= 0 ? '#10b98180' : '#ef444480'
                })) as any);
              }
              lastMacdCountRef.current = safeMacd.length;
            } catch (_) {}
          }
        } else {
          try {
            macdLineSeriesRef.current.setData(safeMacd as any);
            if (macdSignalSeriesRef.current) macdSignalSeriesRef.current.setData(safeSignal as any);
            if (macdHistSeriesRef.current) {
              macdHistSeriesRef.current.setData(safeHist.map(h => ({ 
                time: h.time,
                value: h.value,
                color: h.value >= 0 ? '#10b98180' : '#ef444480'
              })) as any);
            }
            lastMacdCountRef.current = safeMacd.length;
          } catch (_) {}
        }
      } else {
        try {
          macdLineSeriesRef.current.setData([]);
          if (macdSignalSeriesRef.current) macdSignalSeriesRef.current.setData([]);
          if (macdHistSeriesRef.current) macdHistSeriesRef.current.setData([]);
          lastMacdCountRef.current = 0;
        } catch (_) {}
      }
    }

    // 8. Update e-MACD (Waddah MACD)
    if (emacdHistSeriesRef.current) {
      const safeHist = (effectiveShowEMacd && emacdData?.histogram) ? sanitizeLineSeriesData(emacdData.histogram) : [];
      const safeExp = (effectiveShowEMacd && emacdData?.explosion) ? sanitizeLineSeriesData(emacdData.explosion) : [];
      const safeDead = (effectiveShowEMacd && emacdData?.deadZone) ? sanitizeLineSeriesData(emacdData.deadZone) : [];

      if (safeHist.length > 0) {
        const canUpdateInPlace = isSameCandle && lastEmacdHistCountRef.current === safeHist.length;
        if (canUpdateInPlace) {
          try {
            const lastH = safeHist[safeHist.length - 1];
            if (lastH && typeof lastH.value === 'number' && !isNaN(lastH.value) && isFinite(lastH.value)) {
              emacdHistSeriesRef.current.update(lastH);
            }
            if (emacdExplosionSeriesRef.current && safeExp.length > 0) {
              const lastE = safeExp[safeExp.length - 1];
              if (lastE && typeof lastE.value === 'number' && !isNaN(lastE.value) && isFinite(lastE.value)) {
                emacdExplosionSeriesRef.current.update(lastE);
              }
            }
            if (emacdDeadZoneSeriesRef.current && safeDead.length > 0) {
              const lastD = safeDead[safeDead.length - 1];
              if (lastD && typeof lastD.value === 'number' && !isNaN(lastD.value) && isFinite(lastD.value)) {
                emacdDeadZoneSeriesRef.current.update(lastD);
              }
            }
          } catch (_) {
            try {
              emacdHistSeriesRef.current.setData(safeHist as any);
              if (emacdExplosionSeriesRef.current) emacdExplosionSeriesRef.current.setData(safeExp as any);
              if (emacdDeadZoneSeriesRef.current) emacdDeadZoneSeriesRef.current.setData(safeDead as any);
              lastEmacdHistCountRef.current = safeHist.length;
            } catch (_) {}
          }
        } else {
          try {
            emacdHistSeriesRef.current.setData(safeHist as any);
            if (emacdExplosionSeriesRef.current) emacdExplosionSeriesRef.current.setData(safeExp as any);
            if (emacdDeadZoneSeriesRef.current) emacdDeadZoneSeriesRef.current.setData(safeDead as any);
            lastEmacdHistCountRef.current = safeHist.length;
          } catch (_) {}
        }
      } else {
        try {
          emacdHistSeriesRef.current.setData([]);
          if (emacdExplosionSeriesRef.current) emacdExplosionSeriesRef.current.setData([]);
          if (emacdDeadZoneSeriesRef.current) emacdDeadZoneSeriesRef.current.setData([]);
          lastEmacdHistCountRef.current = 0;
        } catch (_) {}
      }
    }

    // 8.5 Update Time Heatmap
    if (timeHeatmapHistSeriesRef.current) {
      if (effectiveShowTimeHeatmap && timeHeatmapData && timeHeatmapData.bars && timeHeatmapData.bars.length > 0) {
        const histBars = timeHeatmapData.bars.map(b => {
          const isBull = b.isBullish !== undefined ? b.isBullish : true;
          let color = isBull ? '#0ea5e980' : '#64748b80'; // Frio

          if (b.zone === 'neutro') {
            color = isBull ? '#22c55e99' : '#f9731699';
          } else if (b.zone === 'aquecido') {
            color = isBull ? '#16a34acc' : '#ef4444cc';
          } else if (b.zone === 'hiper') {
            color = isBull ? '#15803d' : '#dc2626';
          }

          return {
            time: b.time,
            value: b.score,
            color
          };
        });

        const lineData = timeHeatmapData.bars.map(b => ({
          time: b.time,
          value: b.baselineScore ?? b.score
        }));

        const threshData = timeHeatmapData.bars.map(b => ({
          time: b.time,
          value: timeHeatmapData.hotThreshold
        }));

        const safeHist = sanitizeLineSeriesData(histBars);
        const safeLine = sanitizeLineSeriesData(lineData);
        const safeThresh = sanitizeLineSeriesData(threshData);

        try {
          timeHeatmapHistSeriesRef.current.setData(safeHist as any);
          if (timeHeatmapLineSeriesRef.current) timeHeatmapLineSeriesRef.current.setData(safeLine as any);
          if (timeHeatmapThresholdSeriesRef.current) timeHeatmapThresholdSeriesRef.current.setData(safeThresh as any);

          if (timeHeatmapForecastSeriesRef.current) {
            if (timeHeatmapData.forecastBars && timeHeatmapData.forecastBars.length > 0) {
              const forecastLineData = timeHeatmapData.forecastBars.map(b => ({
                time: b.time,
                value: b.baselineScore ?? b.score
              }));
              const safeForecast = sanitizeLineSeriesData(forecastLineData);
              timeHeatmapForecastSeriesRef.current.setData(safeForecast as any);
            } else {
              timeHeatmapForecastSeriesRef.current.setData([]);
            }
          }
        } catch (_) {}
      } else {
        try {
          timeHeatmapHistSeriesRef.current.setData([]);
          if (timeHeatmapLineSeriesRef.current) timeHeatmapLineSeriesRef.current.setData([]);
          if (timeHeatmapForecastSeriesRef.current) timeHeatmapForecastSeriesRef.current.setData([]);
          if (timeHeatmapThresholdSeriesRef.current) timeHeatmapThresholdSeriesRef.current.setData([]);
        } catch (_) {}
      }
    }

    // 8.6 Update Axion Trend Sub-panel (Histogram + Bollinger Bands on MACD + Colored MACDBB Line)
    if (axionTrendHistSeriesRef.current) {
      if (effectiveShowAxionTrendSubPanel && axionTrendData && axionTrendData.bars && axionTrendData.bars.length > 0) {
        const histBars = axionTrendData.bars.map(b => ({
          time: b.time,
          value: b.rsmMacdDiff,
          color: b.rsmHistColor
        }));
        const upperData = axionTrendData.bars.map(b => ({
          time: b.time,
          value: b.macdbbUpper,
          color: b.squeeze ? '#ea580c' : '#ffffff'
        }));
        const midData = axionTrendData.bars.map(b => ({
          time: b.time,
          value: b.macdbbMidline,
          color: '#ffffff'
        }));
        const lowerData = axionTrendData.bars.map(b => ({
          time: b.time,
          value: b.macdbbLower,
          color: b.squeeze ? '#ea580c' : '#ffffff'
        }));
        const zeroData = axionTrendData.bars.map(b => ({
          time: b.time,
          value: 0
        }));
        const macdbbData = axionTrendData.bars.map(b => ({
          time: b.time,
          value: b.macdbbLine,
          color: b.macdbbDotColor
        }));

        try {
          axionTrendHistSeriesRef.current.setData(sanitizeLineSeriesData(histBars) as any);
          if (axionTrendUpperSeriesRef.current) axionTrendUpperSeriesRef.current.setData(sanitizeLineSeriesData(upperData) as any);
          if (axionTrendMidSeriesRef.current) axionTrendMidSeriesRef.current.setData(sanitizeLineSeriesData(midData) as any);
          if (axionTrendLowerSeriesRef.current) axionTrendLowerSeriesRef.current.setData(sanitizeLineSeriesData(lowerData) as any);
          if (axionTrendZeroSeriesRef.current) axionTrendZeroSeriesRef.current.setData(sanitizeLineSeriesData(zeroData) as any);
          if (axionTrendMacdbbSeriesRef.current) axionTrendMacdbbSeriesRef.current.setData(sanitizeLineSeriesData(macdbbData) as any);
        } catch (_) {}
      } else {
        try {
          axionTrendHistSeriesRef.current.setData([]);
          if (axionTrendUpperSeriesRef.current) axionTrendUpperSeriesRef.current.setData([]);
          if (axionTrendMidSeriesRef.current) axionTrendMidSeriesRef.current.setData([]);
          if (axionTrendLowerSeriesRef.current) axionTrendLowerSeriesRef.current.setData([]);
          if (axionTrendZeroSeriesRef.current) axionTrendZeroSeriesRef.current.setData([]);
          if (axionTrendMacdbbSeriesRef.current) axionTrendMacdbbSeriesRef.current.setData([]);
        } catch (_) {}
      }
    }

    // 7.5 Update FVG Series Pools (allows up to 15 parallel active gaps without clipping)
    if (effectiveShowFvg) {
      if (mainChartRef.current && fvgUpSeriesPoolRef.current.length === 0) {
        const MAX_FVG_POOLS = 15;
        for (let s = 0; s < MAX_FVG_POOLS; s++) {
          fvgUpSeriesPoolRef.current.push(mainChartRef.current.addSeries(CandlestickSeries, {
            upColor: 'rgba(34, 197, 94, 0.25)',
            downColor: 'rgba(34, 197, 94, 0.25)',
            borderUpColor: 'rgba(34, 197, 94, 0.4)',
            borderDownColor: 'rgba(34, 197, 94, 0.4)',
            wickUpColor: 'rgba(0, 0, 0, 0)',
            wickDownColor: 'rgba(0, 0, 0, 0)',
            priceLineVisible: false,
            lastValueVisible: false
          }));
          fvgDownSeriesPoolRef.current.push(mainChartRef.current.addSeries(CandlestickSeries, {
            upColor: 'rgba(239, 68, 68, 0.25)',
            downColor: 'rgba(239, 68, 68, 0.25)',
            borderUpColor: 'rgba(239, 68, 68, 0.4)',
            borderDownColor: 'rgba(239, 68, 68, 0.4)',
            wickUpColor: 'rgba(0, 0, 0, 0)',
            wickDownColor: 'rgba(0, 0, 0, 0)',
            priceLineVisible: false,
            lastValueVisible: false
          }));
        }
      }

      for (let i = 0; i < fvgUpSeriesPoolRef.current.length; i++) {
        const series = fvgUpSeriesPoolRef.current[i];
        const data = fvgSeriesData.up[i] || [];
        try { series.setData(data as any); } catch (_) {}
      }
      for (let i = 0; i < fvgDownSeriesPoolRef.current.length; i++) {
        const series = fvgDownSeriesPoolRef.current[i];
        const data = fvgSeriesData.down[i] || [];
        try { series.setData(data as any); } catch (_) {}
      }
    } else {
      fvgUpSeriesPoolRef.current.forEach(series => { try { series?.setData([]); } catch (_) {} });
      fvgDownSeriesPoolRef.current.forEach(series => { try { series?.setData([]); } catch (_) {} });
    }

    // 8.7 Update Momentum Matrix Sub-panel (NQ+ES, Mag7 Techs, VIX, DXY alinhados por candle)
    if (momentumMatrixChartRef.current) {
      if (effectiveShowMomentumMatrix && momentumMatrixDataRef.current) {
        updateMomentumMatrixSeriesOnChart(momentumMatrixDataRef.current);
      }
    }

    // Fit content or restore saved zoom level on initial data load
    if (isFirstDataLoadRef.current && mainChartRef.current && chartData.length > 0) {
      applySavedViewport(false);
      isFirstDataLoadRef.current = false;
    }

    // 9. Align subcharts timescales (RSI, MACD, e-MACD, Time Heatmap) efficiently via RAF
    let rafId: number | null = null;
    const syncSubCharts = () => {
      if (!isDocumentVisibleRef.current) return;
      if (mainChartRef.current) {
        const logicalRange = mainChartRef.current.timeScale().getVisibleLogicalRange();
        if (logicalRange) {
          const subCharts = [
            rsiChartRef.current,
            macdChartRef.current,
            emacdChartRef.current,
            timeHeatmapChartRef.current,
            axionTrendChartRef.current,
            momentumMatrixChartRef.current
          ].filter(Boolean) as IChartApi[];
          subCharts.forEach(c => {
            try {
              c.timeScale().setVisibleLogicalRange(logicalRange);
            } catch (_) {}
          });
        }
      }
      if (updateLevelLabelsRef.current) {
        updateLevelLabelsRef.current();
      }
    };

    rafId = requestAnimationFrame(syncSubCharts);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
    } catch (err: any) {
      recordChartError({
        type: 'lightweight-charts',
        message: 'Erro ao atualizar dados das séries do gráfico: ' + (err?.message || err),
        stack: err?.stack || '',
        panelId: instanceId || 'painel_chart'
      });
    }
  }, [chartData, timeframe, effectiveShowSma9, effectiveShowEma21, effectiveShowEma50, effectiveShowRsi, effectiveShowMacd, showPva, effectiveShowEMacd, effectiveShowTimeHeatmap, timeHeatmapData, effectiveShowAxionTrendSubPanel, axionTrendData, effectiveShowMomentumMatrix, momentumMatrixSnapshot, updateMomentumMatrixSeriesOnChart, showFvg, sma9Data, ema21Data, ema50Data, rsiData, macdData, macdDivergences, showMacdDivergence, emacdData, fvgSeriesData, gammaLevels, activeIndicators, settings?.disabled_levels, activeTrade, proposedTrade, showLevels, showTradeMarkers, customSignals, combinedIndicatorSignals, historicalIndicatorSignals, reports, updateTradePriceLines]);

  // Mandatory Alignment on Timeframe Change (Always fit rightmost bars to right price scale with saved zoom)
  useEffect(() => {
    if (!mainChartRef.current || chartDataRef.current.length === 0) return;
    applySavedViewport(true);
  }, [timeframe, applySavedViewport]);

  // Dynamic Indicators Calculation & Drawing Effect (Modo 2 Plugin Registry Engine)
  useEffect(() => {
    try {
      if (!mainChartRef.current || !chartData || chartData.length === 0) return;

    // Track indicators currently active
    const activeIds = new Set((activeIndicators || []).filter(i => i.visible).map(i => i.id));

    // Remove series for indicators that were removed or hidden
    dynamicSeriesPoolRef.current.forEach((seriesList, indId) => {
      if (!activeIds.has(indId)) {
        seriesList.forEach(s => {
          try { s.setData([]); } catch (_) {}
          try { mainChartRef.current?.removeSeries(s); } catch (e) {}
        });
        dynamicSeriesPoolRef.current.delete(indId);
      }
    });

    volumeAnalysisResultsRef.current = {};
    timeRangeResultsRef.current = [];
    timeHeatmapResultsRef.current = [];
    sessionsColorBgRef.current = [];
    orderFlowCvdRef.current = null;

    if (!activeIndicators || activeIndicators.length === 0) {
      dynamicMarkersRef.current = [];
      if (updateMarkersRef.current) updateMarkersRef.current();
      if (updateLevelLabelsRef.current) updateLevelLabelsRef.current();
      return;
    }

    const allMarkers: any[] = [];
    let detectedMLRadar: any = null;

    const sysStart = settings?.global_cycle_start || settings?.session1_start || '19:00:00';
    const sysEnd = settings?.global_cycle_end || settings?.session1_end || '18:00:00';

    activeIndicators.forEach(indConfig => {
      if (!indConfig.visible) return;

      const isVolumeInd = (indConfig.type === 'VOLUME_HEATMAP' || indConfig.type === 'VOLUME_LEVELS' || indConfig.type === 'VOLUME_HVN_BLOCKS') && indConfig.params?.sessionMode !== 'bars';
      const candlesToUse = isVolumeInd && candles && candles.length >= 10 ? (candles as any) : (chartData as any);
      const calculated = calculateIndicator(indConfig, candlesToUse, {
        systemSessionStart: sysStart,
        systemSessionEnd: sysEnd,
        timeframeMinutes: timeframe,
        gammaLevels: gammaLevels
      });
      if (!calculated) return;

      // Capturar dados especializados para renderização de Volume
      if (indConfig.type === 'VOLUME_HEATMAP' && calculated.customData?.volumeProfile) {
        volumeAnalysisResultsRef.current.heatmap = {
          result: calculated.customData.volumeProfile,
          maxOpacity: calculated.customData.maxOpacity ?? 22,
          colorTheme: calculated.customData.colorTheme || 'cyberpunk',
          minThreshold: calculated.customData.minThreshold ?? 10
        };
      } else if (indConfig.type === 'VOLUME_LEVELS' && calculated.customData?.volumeProfile) {
        volumeAnalysisResultsRef.current.levels = {
          result: calculated.customData.volumeProfile,
          showPoc: calculated.customData.showPoc ?? true,
          showVahVal: calculated.customData.showVahVal ?? true,
          showNakedPocs: calculated.customData.showNakedPocs ?? true,
          pocColor: calculated.customData.pocColor || '#f59e0b',
          vahColor: calculated.customData.vahColor || '#06b6d4',
          valColor: calculated.customData.valColor || '#a855f7'
        };
      } else if (indConfig.type === 'VOLUME_HVN_BLOCKS' && calculated.customData?.volumeProfile) {
        volumeAnalysisResultsRef.current.hvnBlocks = {
          result: calculated.customData.volumeProfile,
          blockOpacity: calculated.customData.blockOpacity ?? 25,
          blockColor: calculated.customData.blockColor || '#3b82f6'
        };
      } else if (indConfig.type === 'LEVELS_TIME_RANGE' && calculated.customData?.timeRangeDays) {
        timeRangeResultsRef.current.push(...calculated.customData.timeRangeDays);
      } else if (indConfig.type === 'VOLUME_SPIKE_PIVOTS' && calculated.customData?.selectedPivots) {
        volumeAnalysisResultsRef.current.spikePivots = {
          selectedPivots: calculated.customData.selectedPivots,
          highColor: calculated.customData.highColor || '#22c55e',
          lowColor: calculated.customData.lowColor || '#ef4444',
          lineWidth: calculated.customData.lineWidth || 2,
          lineStyle: calculated.customData.lineStyle || 0,
          showBreached: calculated.customData.showBreached !== false
        };
      } else if (indConfig.type === 'TIME_HEATMAP' || indConfig.type === 'TIME_HEATMAP_HURST') {
        // TIME_HEATMAP é gerenciado de forma otimizada e livre de repaints pelo hook timeHeatmapData (estritamente em candle fechado)
        if (timeHeatmapData) {
          timeHeatmapResultsRef.current.push(timeHeatmapData);
        }
      } else if (indConfig.type === 'AXION_ML_PREDICTOR' && calculated.customData?.radar) {
        if (indConfig.params?.showFloatingHud !== false) {
          detectedMLRadar = {
            visible: true,
            ...calculated.customData.radar
          };
        }
      } else if (indConfig.type === 'SESSIONS_COLOR_BG' && calculated.customData?.sessionBlocks) {
        sessionsColorBgRef.current = calculated.customData.sessionBlocks;
      } else if (indConfig.type === 'ORDER_FLOW_CVD' && calculated.customData) {
        orderFlowCvdRef.current = calculated.customData;
      }

      // Filter only overlay indicators for main chart
      if (calculated.overlay && calculated.series && calculated.series.length > 0) {
        let existingSeriesList = dynamicSeriesPoolRef.current.get(indConfig.id);
        if (!existingSeriesList || existingSeriesList.length !== calculated.series.length) {
          if (existingSeriesList) {
            existingSeriesList.forEach(s => {
              try { mainChartRef.current?.removeSeries(s); } catch (e) {}
            });
          }
          existingSeriesList = [];
          calculated.series.forEach(sDef => {
            if (sDef.type === 'line') {
              try {
                const lineSeries = mainChartRef.current!.addSeries(LineSeries, {
                  color: sDef.color,
                  lineWidth: (sDef.lineWidth || 2) as any,
                  lineStyle: sDef.lineStyle || 0,
                  title: '',
                  lastValueVisible: false,
                  priceLineVisible: false,
                  crosshairMarkerVisible: false,
                  priceScaleId: 'right'
                });
                try { lineSeries.setData([]); } catch (_) {}
                existingSeriesList!.push(lineSeries);
              } catch (err) {
                console.error('[INDICATOR_ENGINE] Erro ao criar série de linha:', err);
              }
            }
          });
          dynamicSeriesPoolRef.current.set(indConfig.id, existingSeriesList);
        }

        // Atualizar dados nas séries existentes sem recriar/piscar (com dispositivo de segurança sanitizado)
        calculated.series.forEach((sDef, idx) => {
          const s = existingSeriesList && existingSeriesList[idx];
          if (s) {
            try {
              const safeData = (sDef && sDef.data) ? sanitizeLineSeriesData(sDef.data) : [];
              s.setData(safeData as any);
            } catch (err) {
              try { s.setData([]); } catch (_) {}
              console.warn('[INDICATOR_ENGINE] Erro seguro ao atualizar série de linha:', err);
            }
          }
        });
      } else {
        const prevList = dynamicSeriesPoolRef.current.get(indConfig.id);
        if (prevList && prevList.length > 0) {
          prevList.forEach(s => {
            try { s.setData([]); } catch (_) {}
            try { mainChartRef.current?.removeSeries(s); } catch (_) {}
          });
          dynamicSeriesPoolRef.current.delete(indConfig.id);
        }
      }

      if (calculated.markers && calculated.markers.length > 0) {
        allMarkers.push(...calculated.markers);

        // Disparo sonoro inteligente para marcadores de padrões recém-identificados
        if (candlesToUse && candlesToUse.length > 0) {
          const latestCandle = candlesToUse[candlesToUse.length - 1];
          const prevCandle = candlesToUse.length > 1 ? candlesToUse[candlesToUse.length - 2] : null;
          const latestTime = latestCandle?.time ? (typeof latestCandle.time === 'number' ? latestCandle.time : new Date(latestCandle.time).getTime() / 1000) : 0;
          const prevTime = prevCandle?.time ? (typeof prevCandle.time === 'number' ? prevCandle.time : new Date(prevCandle.time).getTime() / 1000) : 0;

          calculated.markers.forEach(m => {
            if (m.sound && m.sound !== 'none' && (m.time === latestTime || m.time === prevTime)) {
              const markerKey = `${indConfig.id}_${m.text}_${m.position}_${m.time}`;
              if (!playedPatternMarkersRef.current.has(markerKey)) {
                playedPatternMarkersRef.current.add(markerKey);
                if (playedPatternMarkersRef.current.size > 300) {
                  const first = playedPatternMarkersRef.current.values().next().value;
                  if (first) playedPatternMarkersRef.current.delete(first);
                }
                playPatternSound(m.sound);
              }
            }
          });
        }
      }
    });

    // Se o Widget axion_ml_radar estiver ativo e o indicador não foi adicionado manualmente, calcula o radar automaticamente
    const isWidgetRadarActive = activeWidgetsProp && activeWidgetsProp.some(w => w.type === 'axion_ml_radar' && w.visible !== false);
    if (!detectedMLRadar && isWidgetRadarActive && chartData && chartData.length >= 65) {
      try {
        const autoCalc = calculateIndicator({
          id: 'auto-ml-radar',
          type: 'AXION_ML_PREDICTOR',
          name: '🧠 Axion ML Radar',
          category: 'ALGORITMOS',
          visible: true,
          overlay: true,
          params: { showFloatingHud: true, showTargets: false },
          style: {
            color: '#06b6d4',
            lineWidth: 1,
            lineStyle: 'solid'
          }
        }, chartData as any, {
          systemSessionStart: sysStart,
          systemSessionEnd: sysEnd,
          timeframeMinutes: timeframe,
          gammaLevels: gammaLevels
        });
        if (autoCalc?.customData?.radar) {
          detectedMLRadar = {
            visible: true,
            ...autoCalc.customData.radar
          };
        }
      } catch (err) {
        console.warn('[AXION_ML] Erro ao auto-calcular radar para o widget:', err);
      }
    }

    // Armazenar e unificar marcadores SMC (Order Blocks, BOS/CHoCH, Liquidez, Elliott Waves, etc.)
    dynamicMarkersRef.current = allMarkers;
    setAxionMLRadarState(detectedMLRadar);

    // Sincronizar estado do Radar Axion ML globalmente para Widgets flutuantes e Copilot IA
    try {
      if (detectedMLRadar) {
        (window as any).__vortex_axion_ml_radar = detectedMLRadar;
        localStorage.setItem(`vortex_axion_ml_radar_${instanceId || 'main'}`, JSON.stringify(detectedMLRadar));
      } else {
        delete (window as any).__vortex_axion_ml_radar;
        localStorage.removeItem(`vortex_axion_ml_radar_${instanceId || 'main'}`);
      }
    } catch (_) {}

    if (updateMarkersRef.current) {
      updateMarkersRef.current();
    }
    if (updateLevelLabelsRef.current) {
      updateLevelLabelsRef.current();
    }
    } catch (err: any) {
      recordChartError({
        type: 'indicator-calc',
        message: 'Erro no processamento de indicadores dinâmicos: ' + (err?.message || err),
        stack: err?.stack || '',
        panelId: instanceId || 'painel_chart'
      });
    }
  }, [chartData, activeIndicators, candles, gammaLevels, activeWidgetsProp]);

  // Keyboard Navigation: Mover e aplicar zoom no gráfico com as Setas do Teclado
  useEffect(() => {
    const handleArrowNavigation = (e: KeyboardEvent) => {
      // Ignorar se o foco estiver em campos de digitação ou modais de entrada
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }

      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        return;
      }

      const mainChart = mainChartRef.current;
      if (!mainChart) return;
      const timeScale = mainChart.timeScale();
      const currentRange = timeScale.getVisibleLogicalRange();
      if (!currentRange) return;

      const span = currentRange.to - currentRange.from;
      // Passo de deslocamento horizontal (com Shift = deslocamento rápido)
      const step = e.shiftKey ? Math.max(15, Math.round(span * 0.25)) : Math.max(4, Math.round(span * 0.08));

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        timeScale.setVisibleLogicalRange({
          from: currentRange.from - step,
          to: currentRange.to - step,
        });
        if (updateLevelLabelsRef.current) updateLevelLabelsRef.current();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        timeScale.setVisibleLogicalRange({
          from: currentRange.from + step,
          to: currentRange.to + step,
        });
        if (updateLevelLabelsRef.current) updateLevelLabelsRef.current();
      } else if (e.key === 'ArrowUp') {
        // Zoom In: aproximar velas (reduzir quantidade de barras visíveis)
        e.preventDefault();
        const zoomStep = Math.max(2, Math.round(span * 0.1));
        const newSpan = span - zoomStep * 2;
        if (newSpan >= 8) {
          timeScale.setVisibleLogicalRange({
            from: currentRange.from + zoomStep,
            to: currentRange.to - zoomStep,
          });
          if (updateLevelLabelsRef.current) updateLevelLabelsRef.current();
        }
      } else if (e.key === 'ArrowDown') {
        // Zoom Out: afastar velas (aumentar quantidade de barras visíveis)
        e.preventDefault();
        const zoomStep = Math.max(2, Math.round(span * 0.1));
        timeScale.setVisibleLogicalRange({
          from: currentRange.from - zoomStep,
          to: currentRange.to + zoomStep,
        });
        if (updateLevelLabelsRef.current) updateLevelLabelsRef.current();
      }
    };

    window.addEventListener('keydown', handleArrowNavigation);
    return () => window.removeEventListener('keydown', handleArrowNavigation);
  }, []);

  // Drag to resize indicator height
  const startResizeDrag = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const startY = clientY;
    const startHeight = indicatorHeightRef.current || subPanelHeight;

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;
      const deltaY = currentY - startY;
      // Dragging upwards increases height, downwards decreases height
      const newHeight = Math.max(60, Math.min(320, Math.round(startHeight - deltaY)));
      indicatorHeightRef.current = newHeight;
      setSubPanelHeight(newHeight);
      if (resizeChartsRef.current) {
        resizeChartsRef.current();
      }
    };

    const handleEnd = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      try {
        localStorage.setItem('vortex_subpanel_height', String(indicatorHeightRef.current));
      } catch {}
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
  };

  return (
    <div ref={chartRootRef} className="flex flex-col w-full h-full min-h-0 select-none relative" style={{ height: height || '100%' }} onDoubleClickCapture={onDoubleClick}>
      {Boolean(((loadingProgress?.isLoading && (loadingProgress.percent < 100) && (!aggregatedCandles || aggregatedCandles.length === 0 || loadingProgress?.isExplicitDaysChange)) || ((!aggregatedCandles || aggregatedCandles.length === 0) && !isSimulator)) && tempViewMode === 'candles') && (
        <div className={`absolute inset-0 z-[60] flex flex-col items-center justify-center p-6 text-center select-none transition-all duration-300 ${
          chartData.length === 0 ? 'bg-[#090d16]/95' : 'bg-[#090d16]/75 backdrop-blur-sm'
        }`}>
          <div className="bg-[#111726]/95 border border-slate-700/80 shadow-2xl rounded-2xl p-6 max-w-sm w-full flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-200">
            {/* SVG Circular Gauge */}
            <div className="relative w-28 h-28 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                {/* Background Track */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="#1e293b"
                  strokeWidth="8"
                />
                {/* Progress Arc */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="url(#gauge-gradient)"
                  strokeWidth="8"
                  strokeDasharray={251.33}
                  strokeDashoffset={251.33 - (251.33 * Math.max(5, Math.min(100, loadingProgress?.percent ?? (chartData.length > 0 ? 100 : 20)))) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-300 ease-out"
                />
                <defs>
                  <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#06b6d4" />
                    <stop offset="50%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#10b981" />
                  </linearGradient>
                </defs>
              </svg>
              {/* Center Percent Text */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-black text-white font-mono tracking-tight drop-shadow-md">
                  {Math.round(loadingProgress?.percent ?? (chartData.length > 0 ? 100 : 25))}%
                </span>
              </div>
            </div>

            {/* Label */}
            <div className="flex flex-col items-center">
              <span className="text-sm font-bold text-slate-100">
                Carregando Histórico
              </span>
            </div>
          </div>
        </div>
      )}
      {/* Chart Toolbar - Only rendered when chart is zoomed */}
      {isZoomed && (
        <div ref={toolbarRef} className="flex items-center justify-between gap-1 px-1.5 py-1 bg-[#0f131c] border-b border-slate-800/80 text-[10px] font-sans select-none overflow-x-auto no-scrollbar whitespace-nowrap">
          {/* Left Group: Asset List Box, Timeframe, Quick Action Pills (IA, R, C, S, F, 🖥️) */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Asset / Panel List Box Dropdown */}
            <div className="flex items-center gap-0.5 bg-[#121622] hover:bg-[#181e2b] border border-slate-700/80 rounded px-1 py-0.5 text-[10px] font-black text-white tracking-wider uppercase transition-colors shrink-0 shadow-sm">
              <span className="text-slate-400 text-[10px] pointer-events-none">☰</span>
              <select
                value={activePanel?.id || ''}
                onChange={(e) => {
                  e.stopPropagation();
                  if (e.target.value && switchPanel) {
                    switchPanel(e.target.value);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="bg-transparent text-white font-black text-[10px] uppercase focus:outline-none cursor-pointer appearance-none pr-3"
                title="Selecionar Ativo / Painel"
              >
                {panels && panels.length > 0 ? (
                  panels.map((p: any) => {
                    const cleanName = p.name ? p.name.replace(/\s*\([^)]*\)/g, '').trim() : 'Painel';
                    return (
                      <option key={p.id} value={p.id} className="bg-slate-900 text-white font-bold">
                        {cleanName.toUpperCase()}
                      </option>
                    );
                  })
                ) : (
                  <option value={activePanel?.id || 'main'} className="bg-slate-900 text-white font-bold">
                    {(activePanel?.name || 'NQ').toUpperCase()}
                  </option>
                )}
              </select>
              <span className="text-slate-400 text-[8px] pointer-events-none -ml-2.5">▼</span>
            </div>

            {tempViewMode === 'candles' && setTimeframe && (
              <div className="flex items-center bg-blue-600 text-white rounded px-1 py-0.5 text-[9px] font-extrabold shadow-sm shrink-0">
                <select
                  value={timeframe}
                  onChange={(e) => {
                    e.stopPropagation();
                    setTimeframe(Number(e.target.value));
                  }}
                  className="bg-transparent text-white font-extrabold text-[9px] focus:outline-none cursor-pointer appearance-none text-center"
                  title="Timeframe"
                >
                  <option value={1} className="bg-slate-900 text-slate-100">1M</option>
                  <option value={2} className="bg-slate-900 text-slate-100">2M</option>
                  <option value={3} className="bg-slate-900 text-slate-100">3M</option>
                  <option value={5} className="bg-slate-900 text-slate-100">5M</option>
                  <option value={10} className="bg-slate-900 text-slate-100">10M</option>
                  <option value={15} className="bg-slate-900 text-slate-100">15M</option>
                  <option value={30} className="bg-slate-900 text-slate-100">30M</option>
                  <option value={60} className="bg-slate-900 text-slate-100">1H</option>
                  <option value={240} className="bg-slate-900 text-slate-100">4H</option>
                  <option value={1440} className="bg-slate-900 text-slate-100">1D</option>
                </select>
              </div>
            )}

            {/* Quick Action Pills */}
            <div className="flex items-center gap-0.5 shrink-0">
              {/* IA */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const nextVal = !settings?.chart_manual_ia_validate;
                  saveSettings({ chart_manual_ia_validate: nextVal });
                  if (nextVal) {
                    alert("🤖 Validação Inteligente Ativada!\nAs operações manuais abertas a partir de agora só serão executadas se a IA confirmar a confluência técnica no template ativo.");
                  }
                }}
                className={`px-1 py-0.5 rounded text-[8.5px] font-black transition active:scale-95 cursor-pointer border shadow-sm min-w-[16px] text-center ${
                  settings?.chart_manual_ia_validate
                    ? 'border-emerald-500 bg-emerald-600 text-white'
                    : 'border-red-500 bg-red-600 text-white'
                }`}
                title={settings?.chart_manual_ia_validate ? 'Validar entrada com IA (Ativo)' : 'Validar entrada com IA (Inativo)'}
              >
                IA
              </button>

              {tempViewMode === 'candles' && (
                <>
                  {/* R */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (mainChartRef.current) {
                        mainChartRef.current.priceScale('right').applyOptions({ autoScale: true });
                        mainChartRef.current.timeScale().fitContent();
                        mainChartRef.current.timeScale().applyOptions({ rightOffset: 12 });

                        if (rsiChartRef.current && showRsi) {
                          rsiChartRef.current.timeScale().fitContent();
                          rsiChartRef.current.timeScale().applyOptions({ rightOffset: 12 });
                        }
                        if (macdChartRef.current && showMacd) {
                          macdChartRef.current.timeScale().fitContent();
                          macdChartRef.current.timeScale().applyOptions({ rightOffset: 12 });
                        }
                      }
                    }}
                    className="px-1 py-0.5 rounded border border-slate-700 bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white transition active:scale-95 cursor-pointer font-black text-[8.5px] shadow-sm min-w-[16px] text-center"
                    title="Reenquadrar o gráfico (Reset View) [Ctrl+R]"
                  >
                    R
                  </button>

                  {/* C */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const newVal = !autoCenter;
                      setAutoCenter(newVal);
                      if (newVal) {
                        centerChart();
                      }
                    }}
                    className={`px-1 py-0.5 rounded border font-black transition active:scale-95 cursor-pointer text-[8.5px] shadow-sm min-w-[16px] text-center ${
                      autoCenter
                        ? 'border-yellow-500 bg-yellow-950/60 text-yellow-400'
                        : 'border-slate-700 bg-slate-850 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                    title={autoCenter ? 'Desativar Auto-Center [Ctrl+C]' : 'Centralizar preço atual no meio do gráfico (Auto-Center) [Ctrl+C]'}
                  >
                    C
                  </button>

                  {/* S */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = !showTradeMarkers;
                      setShowTradeMarkers(next);
                      try {
                        localStorage.setItem('vortex_ws_show_trade_markers', String(next));
                        localStorage.setItem(`vortex_ws_show_trade_markers_${activePanel?.id || 'main'}`, String(next));
                      } catch {}
                    }}
                    className={`px-1 py-0.5 rounded border font-black transition active:scale-95 cursor-pointer text-[8.5px] shadow-sm min-w-[16px] text-center ${
                      showTradeMarkers
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : 'border-red-500 bg-red-600 text-white'
                    }`}
                    title={showTradeMarkers ? 'Ocultar setas e legendas de posições [Ctrl+S]' : 'Mostrar setas e legendas de posições [Ctrl+S]'}
                  >
                    S
                  </button>

                  {/* F */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (mainChartRef.current) {
                        mainChartRef.current.priceScale('right').applyOptions({ autoScale: true });
                        mainChartRef.current.timeScale().fitContent();
                        mainChartRef.current.timeScale().applyOptions({ rightOffset: 12 });
                      }
                    }}
                    className="border border-amber-500/60 bg-slate-900 hover:bg-slate-800 font-mono font-black text-[8.5px] text-amber-400 px-1 py-0.5 rounded transition active:scale-95 shadow-sm min-w-[16px] text-center flex items-center justify-center cursor-pointer"
                    title="Alinhar Gráfico e Escala (NinjaTrader 8 - Botão F) [Ctrl+F]"
                  >
                    F
                  </button>

                  {/* Robôs */}
                  {!isSimulatorMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowRobots(!showRobots);
                      }}
                      className={`px-1 py-0.5 rounded border font-black transition active:scale-95 cursor-pointer text-[8.5px] shadow-sm min-w-[16px] text-center ${
                        showRobots
                          ? 'border-purple-500 bg-purple-600 text-white'
                          : 'border-slate-700 bg-slate-850 text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                      title={showRobots ? 'Ocultar Painel de Robôs' : 'Mostrar Painel de Robôs'}
                    >
                      🤖
                    </button>
                  )}
                </>
              )}

              {/* View Mode Toggle (Candles vs Screenshot) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleViewMode();
                }}
                className={`p-0.5 rounded border transition cursor-pointer text-[9px] shadow-sm ${
                  tempViewMode === 'candles'
                    ? 'border-slate-700 bg-slate-850 text-slate-300 hover:bg-slate-800 hover:text-white'
                    : 'border-blue-500 bg-blue-600 text-white'
                }`}
                title={tempViewMode === 'candles' ? 'Mudar para Captura de Tela (NT8)' : 'Mudar para Gráfico de Candles'}
              >
                🖥️
              </button>
            </div>
          </div>

          {/* Right Group: Indicators pill + Close */}
          <div className="flex items-center gap-1 shrink-0">
            {onOpenIndicatorsManager && (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenIndicatorsManager(); }}
                className="bg-[#182236] hover:bg-blue-900/40 border border-blue-500/40 text-blue-300 px-1.5 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-0.5 transition-all cursor-pointer shadow-sm active:scale-95"
                title="Gerenciar Indicadores Técnicos e Templates"
              >
                <span>📊 Ind.</span>
                {activeIndicators && (
                  <span className="bg-blue-600 text-white px-1 py-0.2 rounded-full text-[8.5px] font-extrabold">
                    {activeIndicators.filter(i => i.visible).length}
                  </span>
                )}
              </button>
            )}

            {/* Close Zoom */}
            {onClose && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="p-0.5 rounded-lg hover:bg-red-950/80 border border-transparent hover:border-red-500/40 text-slate-400 hover:text-red-400 font-bold transition-all cursor-pointer text-[11px]"
                title="Fechar Zoom"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Chart Canvas Area */}
      <div className="flex-1 w-full min-h-0 flex flex-col overflow-hidden bg-[#090d16] p-1 relative">

        {/* Minimalist Floating Robot Strategy Card Overlay */}
        {!isSimulatorMode && showRobots && (
          <div className="absolute top-3 left-3 z-30 p-3 bg-slate-900/95 border border-purple-800/80 rounded-xl shadow-2xl backdrop-blur-md max-w-xs w-72 flex flex-col gap-2.5 text-xs">
            <div className="flex items-center justify-between font-bold text-purple-300 pb-2 border-b border-slate-800">
              <span className="flex items-center gap-1.5 text-xs font-mono truncate" title={activeAccount?.account_name}>
                🤖 Robôs: <span className="text-emerald-400 font-bold">{activeAccount ? activeAccount.account_name : 'Nenhuma Conta'}</span>
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowRobots(false);
                }}
                className="text-slate-400 hover:text-white px-1 text-xs cursor-pointer font-mono"
                title="Fechar"
              >
                ✕
              </button>
            </div>
            
            <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
              {!activeAccount ? (
                <div className="text-slate-400 italic text-[11px] py-2 text-center">
                  Selecione uma conta para ver os robôs vinculados.
                </div>
              ) : accountLinkedStrategies.length === 0 ? (
                <div className="text-slate-400 text-[11px] py-3 text-center space-y-1">
                  <div className="font-semibold text-slate-300">Nenhum robô vinculado a esta conta.</div>
                  <div className="text-[10px] text-slate-500">Vincule estratégias no menu <strong>Gestão de Contas</strong>.</div>
                </div>
              ) : (
                accountLinkedStrategies.map((route: any) => {
                  const prompt = prompts?.find((p: any) => p.id === route.prompt_id);
                  const algo = customStrategies?.find((s: any) => s.id === route.manual_strategy_id) || publicStrategies?.find((s: any) => s.id === route.manual_strategy_id);
                  const stratName = prompt ? prompt.name : (algo ? algo.name : 'Estratégia');
                  const stratPanelId = prompt ? prompt.panel_id : algo?.panel_id;
                  const panelObj = panels?.find((p: any) => p.id === stratPanelId);
                  const panelName = panelObj ? panelObj.name : (activePanel?.name || 'Ativo Específico');
                  const isEnabled = route.is_enabled !== false;

                  return (
                    <div
                      key={route.id}
                      className={`p-2 rounded-lg border transition flex flex-col gap-1.5 ${
                        isEnabled
                          ? 'bg-purple-950/50 border-purple-500/40 text-purple-200 shadow-sm'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${isEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                          <span className="font-bold text-[11px] truncate" title={stratName}>{stratName}</span>
                          {algo?.action === 'alert' && (
                            <span className="px-1.5 py-0.2 rounded font-black text-[8px] uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                              🔔 ALERTA
                            </span>
                          )}
                        </div>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const nextEnabled = !isEnabled;
                            if (setAccountStrategies) {
                              setAccountStrategies((prev: any[]) => (prev || []).map((r: any) => r.id === route.id ? { ...r, is_enabled: nextEnabled } : r));
                            }
                            addLog('SISTEMA', `Robô '${stratName}' ${nextEnabled ? 'ATIVADO' : 'PAUSADO'} para a conta ${activeAccount?.account_name || ''}.`, 'sistema');
                            await saveAccountStrategySupabase({
                              id: route.id,
                              account_id: route.account_id,
                              prompt_id: route.prompt_id,
                              manual_strategy_id: route.manual_strategy_id,
                              contract_size_multiplier: route.contract_size_multiplier,
                              is_enabled: nextEnabled
                            });
                          }}
                          className={`px-2 py-0.5 rounded text-[9.5px] font-extrabold transition cursor-pointer shrink-0 border uppercase tracking-wider ${
                            isEnabled
                              ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400 shadow'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow'
                          }`}
                          title={isEnabled ? 'Pausar nesta conta' : 'Ativar nesta conta'}
                        >
                          {isEnabled ? '⏸️ Pausar' : '▶️ Ativar'}
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[9px] font-mono pt-1 border-t border-slate-800/60">
                        <span className="px-1.5 py-0.2 rounded font-black uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          🎯 {panelName}
                        </span>
                        <span className="px-1.5 py-0.2 rounded font-bold bg-purple-900/60 text-purple-300 border border-purple-800/40">
                          LOTE: {route.contract_size_multiplier || 1.0}x
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Screenshot View */}
        <div 
          className="flex-1 w-full flex items-center justify-center min-h-0 p-2 bg-[#090d16]"
          style={{ display: tempViewMode === 'screenshot' ? 'flex' : 'none' }}
        >
          {screenshot ? (
            <img
              src={`data:image/png;base64,${screenshot}`}
              alt="Captura NT8"
              className="max-h-full max-w-full object-contain border border-slate-800 rounded shadow-2xl"
              onDoubleClick={onDoubleClick}
            />
          ) : (
            <span className="text-slate-600 text-xs font-mono">Nenhuma captura disponível no Supabase</span>
          )}
        </div>

        {/* Candles View */}
        <div 
          className="flex-1 flex flex-col min-h-0" 
          style={{ display: tempViewMode === 'candles' ? 'flex' : 'none' }}
        >
          {/* Main Chart Wrapper */}
          <div
            className="w-full relative flex-1 min-h-0"
            onPointerDownCapture={(e) => {
              if (e.button === 2 && !activeDrawingTool) {
                isRightInspectingRef.current = true;
                updateInspectedCandleAtClientPos(e.clientX, e.clientY);
              }
            }}
            onContextMenuCapture={(e) => {
              if (!activeDrawingTool) {
                e.preventDefault();
              }
            }}
          >
            <div
              ref={mainContainerRef}
              onClick={handleChartCanvasClick}
              onTouchEnd={handlePriceScaleTouchEnd}
              className="w-full h-full relative"
              style={{
                cursor: cursorMode === 'arrow'
                  ? 'default'
                  : (isLightChartBg ? BLACK_CROSSHAIR_CURSOR : 'crosshair')
              }}
            />

            {/* Card flutuante de inspeção OHLCV do candle ao segurar botão direito */}
            {inspectedCandle && (() => {
              const c = inspectedCandle.candle;
              const decimals = inspectedCandle.tickSize < 1 ? Math.max(2, getTickDecimals(inspectedCandle.tickSize)) : getTickDecimals(inspectedCandle.tickSize);
              const d = safeChartTimeToDate(c.time);
              const dateStr = d && !isNaN(d.getTime())
                ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
                : '--/--/----';
              const timeStr = d && !isNaN(d.getTime())
                ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d)
                : '--:--:--';
              const isBull = Number(c.close) >= Number(c.open);
              const rangePts = Math.abs(Number(c.high) - Number(c.low));
              const containerW = mainContainerRef.current?.clientWidth || 600;
              const containerH = mainContainerRef.current?.clientHeight || 400;
              const leftPos = Math.min(Math.max(8, inspectedCandle.x + 16), Math.max(8, containerW - 210));
              const topPos = Math.min(Math.max(8, inspectedCandle.y + 16), Math.max(8, containerH - 195));
              return (
                <div
                  className="absolute z-[99999] pointer-events-none select-none rounded-xl border border-slate-600/80 bg-[#0b1220]/95 backdrop-blur-md shadow-2xl px-3 py-2.5 text-[11px] font-mono text-slate-100 min-w-[192px]"
                  style={{ left: `${leftPos}px`, top: `${topPos}px` }}
                >
                  <div className="flex items-center justify-between border-b border-slate-700/80 pb-1.5 mb-1.5 gap-3">
                    <span className="font-bold text-cyan-300">{dateStr}</span>
                    <span className="font-bold text-amber-300">{timeStr}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <span className="text-slate-400">Abertura:</span>
                    <span className="text-right font-semibold">{Number(c.open).toFixed(decimals)}</span>
                    <span className="text-slate-400">Máxima:</span>
                    <span className="text-right font-semibold text-emerald-400">{Number(c.high).toFixed(decimals)}</span>
                    <span className="text-slate-400">Mínima:</span>
                    <span className="text-right font-semibold text-rose-400">{Number(c.low).toFixed(decimals)}</span>
                    <span className="text-slate-400">Fechamento:</span>
                    <span className={`text-right font-bold ${isBull ? 'text-emerald-400' : 'text-rose-400'}`}>{Number(c.close).toFixed(decimals)}</span>
                    <span className="text-slate-400">Tamanho:</span>
                    <span className="text-right font-semibold text-amber-300">{rangePts.toFixed(decimals)} pts</span>
                    <span className="text-slate-400">Volume:</span>
                    <span className="text-right font-semibold text-sky-300">{Number(c.volume || 0).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              );
            })()}

            {/* Linha de Referência e Card de Preço quando a legenda vertical está oculta no mobile */}
            {isMobile && hidePriceScaleMobile && (
              <MobilePriceReferenceLine
                candleSeriesRef={candleSeriesRef}
                currentPrice={currentPriceRef.current || (chartDataRef.current.length > 0 ? chartDataRef.current[chartDataRef.current.length - 1].close : 0)}
                isLastCandleUp={chartDataRef.current.length > 0 ? chartDataRef.current[chartDataRef.current.length - 1].close >= chartDataRef.current[chartDataRef.current.length - 1].open : true}
                onRestorePriceScale={() => setHidePriceScaleMobile(false)}
              />
            )}

            {/* Banner de Instrução para Marcação de SL & TP no Gráfico */}
            {markingSlTpState && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-950/95 border-2 border-amber-500 px-4 py-2.5 rounded-xl text-xs font-bold text-amber-300 shadow-2xl flex items-center gap-3 animate-pulse pointer-events-auto select-none">
                <span>
                  {markingSlTpState === 'marking_sl'
                    ? '🎯 PASSO 1/2: Toque / Clique no gráfico para posicionar o STOP LOSS (SL)'
                    : '🎯 PASSO 2/2: Toque / Clique no gráfico para posicionar o TAKE PROFIT (TP)'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMarkingSlTpState(null);
                    setTempSlPrice(null);
                    setCustomMarkersVersion(v => v + 1);
                    if (updateTradePriceLinesRef.current) updateTradePriceLinesRef.current();
                    if (updateLevelLabelsRef.current) updateLevelLabelsRef.current();
                  }}
                  className="px-2.5 py-1 bg-rose-900 hover:bg-rose-800 text-rose-200 text-[10px] rounded font-extrabold cursor-pointer transition shadow"
                >
                  Cancelar
                </button>
              </div>
            )}

            {drawings && (
              <ChartDrawingsOverlay
                drawings={drawings}
                activeTool={activeDrawingTool || null}
                onFinishDrawing={onFinishDrawing || (() => {})}
                onUpdateDrawing={onUpdateDrawing || (() => {})}
                onSelectDrawing={onSelectDrawing || (() => {})}
                containerRef={mainContainerRef}
                seriesRef={candleSeriesRef}
                chartRef={mainChartRef}
                currentSymbol={activePanel?.name || 'NQ'}
                tickSize={resolvePanelTickSize(activePanel, settings)}
                currentAccountId={activeAccount?.id}
                selectedDrawingId={selectedDrawingId || null}
                onOpenSettings={onOpenDrawingSettings || (() => {})}
                onDeleteDrawing={onDeleteDrawing}
                timeframe={timeframe}
                chartData={chartData}
                registerRedrawRef={drawingsRedrawRef}
              />
            )}
          </div>
          
          {/* RSI Sub-chart */}
          {effectiveShowRsi && (
            <div className="w-full mt-1 relative flex flex-col shrink-0 overflow-hidden" style={{ height: subPanelHeight }}>
              {/* Splitter Resize Handle */}
              <div 
                className="h-5 -top-2.5 hover:bg-cyan-500/20 active:bg-cyan-500/30 cursor-ns-resize transition-all w-full flex items-center justify-center group z-30 absolute select-none"
                onMouseDown={startResizeDrag}
                onTouchStart={startResizeDrag}
                title="Arraste para ajustar a altura dos osciladores"
              >
                <div className="h-1 bg-slate-700/80 group-hover:bg-cyan-400 group-active:bg-cyan-400 w-24 rounded-full transition-all flex items-center justify-center shadow-md">
                  <div className="w-8 h-0.5 bg-slate-900 rounded-full" />
                </div>
              </div>
              <div ref={rsiContainerRef} className="w-full h-full border-t border-slate-850 overflow-hidden" />
            </div>
          )}

          {/* MACD Sub-chart */}
          {effectiveShowMacd && (
            <div className="w-full mt-1 relative flex flex-col shrink-0 overflow-hidden" style={{ height: subPanelHeight }}>
              {/* Splitter Resize Handle */}
              <div 
                className="h-5 -top-2.5 hover:bg-cyan-500/20 active:bg-cyan-500/30 cursor-ns-resize transition-all w-full flex items-center justify-center group z-30 absolute select-none"
                onMouseDown={startResizeDrag}
                onTouchStart={startResizeDrag}
                title="Arraste para ajustar a altura dos osciladores"
              >
                <div className="h-1 bg-slate-700/80 group-hover:bg-cyan-400 group-active:bg-cyan-400 w-24 rounded-full transition-all flex items-center justify-center shadow-md">
                  <div className="w-8 h-0.5 bg-slate-900 rounded-full" />
                </div>
              </div>
              <div ref={macdContainerRef} className="w-full h-full border-t border-slate-850 overflow-hidden" />
            </div>
          )}

          {/* e-MACD Sub-chart */}
          {effectiveShowEMacd && (
            <div className="w-full mt-1 relative flex flex-col shrink-0 overflow-hidden" style={{ height: subPanelHeight }}>
              {/* Splitter Resize Handle */}
              <div 
                className="h-5 -top-2.5 hover:bg-cyan-500/20 active:bg-cyan-500/30 cursor-ns-resize transition-all w-full flex items-center justify-center group z-30 absolute select-none"
                onMouseDown={startResizeDrag}
                onTouchStart={startResizeDrag}
                title="Arraste para ajustar a altura dos osciladores"
              >
                <div className="h-1 bg-slate-700/80 group-hover:bg-cyan-400 group-active:bg-cyan-400 w-24 rounded-full transition-all flex items-center justify-center shadow-md">
                  <div className="w-8 h-0.5 bg-slate-900 rounded-full" />
                </div>
              </div>
              <div ref={emacdContainerRef} className="w-full h-full border-t border-slate-850 overflow-hidden" />
            </div>
          )}

          {/* Time Heatmap Sub-chart */}
          {effectiveShowTimeHeatmap && (
            <div className="w-full mt-1 relative flex flex-col shrink-0 overflow-hidden" style={{ height: subPanelHeight }}>
              {/* Splitter Resize Handle */}
              <div 
                className="h-5 -top-2.5 hover:bg-cyan-500/20 active:bg-cyan-500/30 cursor-ns-resize transition-all w-full flex items-center justify-center group z-30 absolute select-none"
                onMouseDown={startResizeDrag}
                onTouchStart={startResizeDrag}
                title="Arraste para ajustar a altura dos osciladores"
              >
                <div className="h-1 bg-slate-700/80 group-hover:bg-cyan-400 group-active:bg-cyan-400 w-24 rounded-full transition-all flex items-center justify-center shadow-md">
                  <div className="w-8 h-0.5 bg-slate-900 rounded-full" />
                </div>
              </div>
              <div ref={timeHeatmapContainerRef} className="w-full h-full border-t border-slate-850 overflow-hidden" />
            </div>
          )}

          {/* Axion Trend Sub-chart (Histogram + MACD Bollinger Bands + Colored Bolinhas) */}
          {effectiveShowAxionTrendSubPanel && (
            <div className="w-full mt-1 relative flex flex-col shrink-0 overflow-hidden" style={{ height: subPanelHeight }}>
              {/* Splitter Resize Handle */}
              <div 
                className="h-5 -top-2.5 hover:bg-cyan-500/20 active:bg-cyan-500/30 cursor-ns-resize transition-all w-full flex items-center justify-center group z-30 absolute select-none"
                onMouseDown={startResizeDrag}
                onTouchStart={startResizeDrag}
                title="Arraste para ajustar a altura dos osciladores"
              >
                <div className="h-1 bg-slate-700/80 group-hover:bg-cyan-400 group-active:bg-cyan-400 w-24 rounded-full transition-all flex items-center justify-center shadow-md">
                  <div className="w-8 h-0.5 bg-slate-900 rounded-full" />
                </div>
              </div>
              <div ref={axionTrendContainerRef} className="w-full h-full border-t border-slate-850 overflow-hidden" />
            </div>
          )}

          {/* Momentum Matrix Sub-chart (NQ+ES, Mag7 Techs, VIX, DXY a cada 1m) */}
          {effectiveShowMomentumMatrix && (
            <div className="w-full mt-1 relative flex flex-col shrink-0 overflow-hidden bg-slate-950/70 rounded-md border border-slate-800/80 shadow-md" style={{ height: subPanelHeight }}>
              {/* Splitter Resize Handle */}
              <div 
                className="h-5 -top-2.5 hover:bg-cyan-500/20 active:bg-cyan-500/30 cursor-ns-resize transition-all w-full flex items-center justify-center group z-30 absolute select-none"
                onMouseDown={startResizeDrag}
                onTouchStart={startResizeDrag}
                title="Arraste para ajustar a altura dos osciladores"
              >
                <div className="h-1 bg-slate-700/80 group-hover:bg-cyan-400 group-active:bg-cyan-400 w-24 rounded-full transition-all flex items-center justify-center shadow-md">
                  <div className="w-8 h-0.5 bg-slate-900 rounded-full" />
                </div>
              </div>

              {/* Subpanel Header Overlay with Real-time Badges */}
              <div className="absolute top-1 left-2 z-10 flex items-center gap-1.5 select-none pointer-events-none flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1 bg-slate-900/90 px-1.5 py-0.5 rounded border border-cyan-800/50 shadow-sm">
                  🌊 MOMENTUM MATRIX (1m)
                </span>

                {momentumMatrixSnapshot && (
                  <>
                    {/* Badge IndexMoneyFlow (IMF) */}
                    {momentumMatrixIndConfig?.params?.showFxFlow !== false && typeof momentumMatrixSnapshot.fxFlow === 'number' && (
                      <span className={`text-[9.5px] font-bold font-mono px-1.5 py-0.5 rounded border shadow-sm ${
                        momentumMatrixSnapshot.fxFlow >= 50
                          ? 'bg-cyan-950/80 text-cyan-300 border-cyan-700/60'
                          : 'bg-rose-950/80 text-rose-300 border-rose-700/60'
                      }`}>
                        🌐 IMF: {momentumMatrixSnapshot.fxFlow}%
                      </span>
                    )}

                    {/* Badge NQ+ES */}
                    {momentumMatrixIndConfig?.params?.indicesMode !== 'off' && (
                      <span className={`text-[9.5px] font-bold font-mono px-1.5 py-0.5 rounded border shadow-sm ${
                        momentumMatrixSnapshot.combinedIndices >= 50
                          ? 'bg-sky-950/80 text-sky-300 border-sky-700/60'
                          : 'bg-rose-950/80 text-rose-300 border-rose-700/60'
                      }`}>
                        NQ+ES: {momentumMatrixSnapshot.combinedIndices}%
                      </span>
                    )}

                    {/* Badge Mag7 Techs */}
                    {momentumMatrixIndConfig?.params?.stocksMode !== 'off' && (
                      <span className={`text-[9.5px] font-bold font-mono px-1.5 py-0.5 rounded border shadow-sm ${
                        momentumMatrixSnapshot.combinedStocks >= 50
                          ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                          : 'bg-rose-950/80 text-rose-300 border-rose-700/60'
                      }`}>
                        Mag7: {momentumMatrixSnapshot.combinedStocks}%
                      </span>
                    )}

                    {/* Badge VIX */}
                    {momentumMatrixIndConfig?.params?.showVix !== false && (
                      <span className="text-[9.5px] font-bold font-mono px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-700/60 shadow-sm">
                        VIX: {momentumMatrixSnapshot.vix}%
                      </span>
                    )}

                    {/* Badge DXY (Opcional, padrão desligado) */}
                    {momentumMatrixIndConfig?.params?.showDxy === true && (
                      <span className="text-[9.5px] font-bold font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 shadow-sm">
                        DXY: {momentumMatrixSnapshot.dxy}%
                      </span>
                    )}

                    {/* Badges Pares FX Individuais (se habilitados) */}
                    {momentumMatrixIndConfig?.params?.showEurJpy === true && typeof momentumMatrixSnapshot.eurjpy === 'number' && (
                      <span className="text-[9.5px] font-bold font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 shadow-sm">
                        EUR/JPY: {momentumMatrixSnapshot.eurjpy}%
                      </span>
                    )}
                    {momentumMatrixIndConfig?.params?.showUsdJpy === true && typeof momentumMatrixSnapshot.usdjpy === 'number' && (
                      <span className="text-[9.5px] font-bold font-mono px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-700/60 shadow-sm">
                        USD/JPY: {momentumMatrixSnapshot.usdjpy}%
                      </span>
                    )}
                    {momentumMatrixIndConfig?.params?.showEurUsd === true && typeof momentumMatrixSnapshot.eurusd === 'number' && (
                      <span className="text-[9.5px] font-bold font-mono px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 shadow-sm">
                        EUR/USD: {momentumMatrixSnapshot.eurusd}%
                      </span>
                    )}

                    {/* Confluence Pill */}
                    <span className={`text-[9.5px] font-black uppercase px-2 py-0.5 rounded-full border shadow-sm ${
                      momentumMatrixSnapshot.confluenceState === 'bull_rally'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 animate-pulse'
                        : momentumMatrixSnapshot.confluenceState === 'bear_rally'
                        ? 'bg-red-500/20 text-red-300 border-red-500/50 animate-pulse'
                        : momentumMatrixSnapshot.confluenceState === 'divergence'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                        : 'bg-slate-800/80 text-slate-400 border-slate-700/50'
                    }`}>
                      {momentumMatrixSnapshot.confluenceState === 'bull_rally' ? '🟢 RALLY ALTA' :
                       momentumMatrixSnapshot.confluenceState === 'bear_rally' ? '🔴 RALLY BAIXA' :
                       momentumMatrixSnapshot.confluenceState === 'divergence' ? '🟡 DIVERGÊNCIA' : '⚪ NEUTRO'}
                    </span>
                  </>
                )}
              </div>

              <div ref={momentumMatrixContainerRef} className="w-full h-full border-t border-slate-850 overflow-hidden" />
            </div>
          )}
        </div>
      </div>

      {/* Bottom controls: Modern 4-row High Efficiency Boleta */}
      {tempViewMode === 'candles' && !hideManualTradeBar && !isBoletaCollapsed && (
        <div ref={bottomControlsRef} className={`px-2 py-1.5 bg-[#090d16] border-t border-slate-800/90 text-xs font-sans select-none w-full flex flex-col gap-1 shadow-2xl shrink-0 z-40 ${isMobile ? 'mb-0.5' : ''}`}>
          {/* Row 1: Account Selector + Sizing Mode (LOTE vs RISCO $) + Full Boleta / ATM Button + Collapse Chevron */}
          <div className="flex items-center justify-between gap-1">
            {/* Account Selector */}
            <div className="flex-1 min-w-0 max-w-[200px] sm:max-w-[260px]">
              {isSimulatorMode ? (
                <div className="flex items-center gap-1 bg-[#121622] border border-purple-800/60 rounded px-1.5 py-0.5 text-[10px] shadow-sm">
                  <span className="text-purple-400 font-bold text-[10px] shrink-0">💳</span>
                  <span className="text-purple-200 font-extrabold text-[10px] truncate">Simulation (SIM)</span>
                </div>
              ) : accounts && accounts.length > 0 ? (
                <div className="flex items-center gap-1 bg-[#121622] hover:bg-[#181e2b] border border-slate-700/80 rounded px-1.5 py-0.5 text-[10px] transition-colors">
                  <span className="text-emerald-400 font-bold text-[10px] shrink-0">💳</span>
                  <select
                    value={activeAccount?.id || accounts[0]?.id || ''}
                    onChange={(e) => {
                      e.stopPropagation();
                      const acc = accounts.find((a: any) => a.id === e.target.value);
                      if (acc) switchAccount(acc);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-transparent text-[10px] font-bold text-slate-200 focus:outline-none w-full truncate cursor-pointer appearance-none pr-3"
                    title="Conta de Negociação"
                  >
                    {accounts.map((a: any) => (
                      <option key={a.id} value={a.id} className="bg-slate-900 text-slate-100">
                        {a.account_name} ({a.platform ? a.platform.toUpperCase() : 'CONTA'})
                      </option>
                    ))}
                  </select>
                  <span className="text-slate-400 text-[8.5px] pointer-events-none shrink-0 -ml-2">▼</span>
                </div>
              ) : null}
            </div>

            {/* Sizing Mode (LOTE vs RISCO $), Full Boleta/ATM Button & Collapse Chevron */}
            <div className="flex items-center gap-1 shrink-0">
              <div className="flex items-center bg-[#121622] border border-slate-700/80 rounded p-0.5 text-[9px] font-bold shadow-sm">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setManualSizingMode('lote');
                    saveSettings({ chart_manual_sizing_mode: 'lote' });
                  }}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-black transition-all cursor-pointer ${
                    manualSizingMode === 'lote'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Lote fixo por quantidade de contratos"
                >
                  LOTE
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setManualSizingMode('risco');
                    saveSettings({ chart_manual_sizing_mode: 'risco' });
                  }}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-black transition-all cursor-pointer ${
                    manualSizingMode === 'risco'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Cálculo automático de lote por valor de risco em USD"
                >
                  RISCO ($)
                </button>
              </div>

              {/* Botão para Abrir Boleta Completa (ATM & Configurações Avançadas) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  window.dispatchEvent(new CustomEvent('vortex_open_mobile_boleta'));
                }}
                className="px-2 py-0.5 rounded bg-blue-900/60 hover:bg-blue-800 active:bg-blue-700 border border-blue-500/60 text-blue-300 hover:text-white font-extrabold text-[9px] flex items-center gap-1 active:scale-95 transition cursor-pointer shadow-sm tracking-tight"
                title="Abrir Boleta Completa (Estratégias ATM, Stops Dinâmicos e Alvos Parciais)"
              >
                <span>📋</span>
                <span>OPÇÕES / ATM</span>
              </button>

              {/* Collapse Chevron Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsBoletaCollapsed(true);
                  localStorage.setItem(`vortex_hide_boleta_${activePanel?.id || 'main'}`, 'true');
                }}
                className="p-1 rounded bg-[#121622] hover:bg-slate-800 border border-slate-700/80 text-slate-400 hover:text-slate-200 transition text-[9px] cursor-pointer shadow-sm"
                title="Recolher Boleta"
              >
                ▼
              </button>
            </div>
          </div>

          {/* Row 2: Quantity Stepper, PTS vs NÍVEL vs TOQUE, SL, TP */}
          <div className="flex items-center justify-between gap-1 py-0.5 text-[10px] overflow-x-auto no-scrollbar whitespace-nowrap">
            {/* Quantity Stepper (or Risk Input) */}
            {manualSizingMode === 'lote' ? (
              <div className="flex items-center gap-0.5 bg-[#121622] border border-slate-700/80 rounded px-1 py-0.5 shadow-sm shrink-0">
                <span className="text-slate-400 font-extrabold text-[8.5px] select-none uppercase mr-0.5">QTD</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setManualContracts(prev => Math.max(1, (prev || 1) - 1));
                  }}
                  className="w-4 h-4 rounded bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 font-bold flex items-center justify-center text-[10px] active:scale-95 cursor-pointer select-none"
                >
                  -
                </button>
                <input
                  type="text"
                  value={manualContracts || ''}
                  onChange={(e) => {
                    e.stopPropagation();
                    const val = e.target.value.replace(/\D/g, '');
                    setManualContracts(val ? Number(val) : 0);
                  }}
                  onBlur={() => {
                    if (!manualContracts || manualContracts < 1) setManualContracts(1);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-5 bg-transparent text-center text-white font-black text-[10px] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setManualContracts(prev => (prev || 1) + 1);
                  }}
                  className="w-4 h-4 rounded bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 font-bold flex items-center justify-center text-[10px] active:scale-95 cursor-pointer select-none"
                >
                  +
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-0.5 bg-[#121622] border border-slate-700/80 rounded px-1 py-0.5 shadow-sm shrink-0">
                <span className="text-emerald-400 font-extrabold text-[9px] select-none">$</span>
                <input
                  type="text"
                  value={manualRiskUsd || ''}
                  onChange={(e) => {
                    e.stopPropagation();
                    const val = e.target.value.replace(/\D/g, '');
                    setManualRiskUsd(val ? Number(val) : 0);
                  }}
                  onBlur={() => {
                    if (!manualRiskUsd || manualRiskUsd < 1) setManualRiskUsd(250);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-9 bg-transparent text-center text-emerald-400 font-black text-[10px] focus:outline-none"
                />
                <span className="text-[8.5px] text-purple-300 font-bold">~{calculatedRiskContracts}c</span>
              </div>
            )}

            {/* PTS vs NÍVEL vs TOQUE Pill */}
            <div className="flex items-center bg-[#121622] border border-slate-700/80 rounded p-0.5 text-[8.5px] font-bold shadow-sm shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setManualTradeMode('pontos');
                  saveSettings({ chart_manual_trade_mode: 'pontos' });
                }}
                className={`px-1.5 py-0.5 rounded text-[8.5px] font-black transition-all cursor-pointer ${
                  manualTradeMode === 'pontos'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Stop em pontos fixos"
              >
                PTS
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setManualTradeMode('nivel');
                  saveSettings({ chart_manual_trade_mode: 'nivel' });
                }}
                className={`px-1.5 py-0.5 rounded text-[8.5px] font-black transition-all cursor-pointer ${
                  manualTradeMode === 'nivel'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Stop em níveis estruturais"
              >
                NÍVEL
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setManualTradeMode('grafico');
                  saveSettings({ chart_manual_trade_mode: 'grafico' });
                  setMarkingSlTpState('marking_sl');
                  setTempSlPrice(null);
                }}
                className={`px-1.5 py-0.5 rounded text-[8.5px] font-black transition-all cursor-pointer ${
                  manualTradeMode === 'grafico' || markingSlTpState !== null
                    ? 'bg-amber-600 text-white shadow animate-pulse'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Marcar Stop Loss e Take Profit com clique/toque no gráfico"
              >
                🎯 TOQUE
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setManualTradeMode('range');
                  const isReplay = isSimulatorMode || isSimulator;
                  const keyMode = isReplay ? 'vortex_replay_stop_mode' : 'vortex_stop_mode';
                  if (typeof window !== 'undefined') localStorage.setItem(keyMode, 'range');
                  saveSettings({ chart_manual_trade_mode: 'range' });
                  window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
                }}
                className={`px-1.5 py-0.5 rounded text-[8.5px] font-black transition-all cursor-pointer ${
                  manualTradeMode === 'range'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Range HL (Stop Loss na Mínima/Máxima dos candles e Take Profit com Fator R:R)"
              >
                R
              </button>
            </div>

            {/* SL Input */}
            <div className="flex items-center gap-0.5 bg-[#121622] border border-slate-700/80 rounded px-1.5 py-0.5 shadow-sm shrink-0">
              <span className="text-red-400 font-black text-[8.5px] select-none">SL</span>
              <input
                type="text"
                value={manualSlPoints || ''}
                onChange={(e) => {
                  e.stopPropagation();
                  const val = e.target.value.replace(/\D/g, '');
                  setManualSlPoints(val ? Number(val) : 0);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-6 bg-transparent text-center text-slate-100 font-extrabold text-[10px] focus:outline-none"
              />
              <span className="text-slate-500 text-[8px]">pt</span>
            </div>

            {/* TP Input */}
            <div className="flex items-center gap-0.5 bg-[#121622] border border-slate-700/80 rounded px-1.5 py-0.5 shadow-sm shrink-0">
              <span className="text-emerald-400 font-black text-[8.5px] select-none">TP</span>
              <input
                type="text"
                value={manualTpPoints || ''}
                onChange={(e) => {
                  e.stopPropagation();
                  const val = e.target.value.replace(/\D/g, '');
                  setManualTpPoints(val ? Number(val) : 0);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-6 bg-transparent text-center text-slate-100 font-extrabold text-[10px] focus:outline-none"
              />
              <span className="text-slate-500 text-[8px]">pt</span>
            </div>
          </div>

          {/* Row 3: Compra/Venda OU BE/PnL/Zerar (quando houver posição aberta) */}
          {activeTrade ? (
            <div className="flex items-center justify-between gap-1.5 pt-0.5 animate-in fade-in duration-150">
              {/* Botão à Esquerda: Breakeven 🛡️ BE */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleBreakeven();
                }}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-black text-[10px] transition-all cursor-pointer shadow-md active:scale-95 flex items-center gap-1 shrink-0 border border-blue-400/40"
                title="Mover Stop Loss para o preço de entrada (Breakeven)"
              >
                <span>🛡️</span>
                <span>BE</span>
              </button>

              {/* Centro: Apenas PL e o valor */}
              <div className="flex-1 flex items-center justify-center bg-[#0c101a] border border-slate-700/80 rounded-lg py-1 px-2 text-center shadow-inner font-mono font-black text-xs">
                <span className="text-slate-400 text-[9.5px] mr-1 uppercase">L/P:</span>
                <span className={activeTradeInfo?.pnlColorClass || 'text-slate-300'}>
                  {activeTradeInfo?.pnlDisplay || 'R$ 0,00'}
                </span>
                {!isMobile && (
                  <span className={`text-[10px] ml-1 opacity-80 ${activeTradeInfo?.pnlColorClass || 'text-slate-400'}`}>
                    ({activeTradeInfo?.ptsDiffDisplay || '0.0 pts'})
                  </span>
                )}
              </div>

              {/* Botão à Direita: Fechar / Zerar */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleFlatAllTrades();
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-[10px] transition-all cursor-pointer shadow-md active:scale-95 flex items-center gap-1 shrink-0 border border-rose-400/40"
                title="Fechar posição imediatamente a mercado e cancelar ordens pendentes"
              >
                <span>✕</span>
                <span>ZERAR</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 pt-0.5 animate-in fade-in duration-150">
              {/* COMPRA BUTTON */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleManualTrade('COMPRA');
                }}
                className="bg-[#059669] hover:bg-[#10b981] active:bg-[#047857] active:scale-[0.98] text-white rounded-lg py-1.5 px-2 flex items-center justify-center transition-all shadow-md cursor-pointer border border-emerald-400/40 text-xs font-black tracking-wide"
                title="Executar Compra"
              >
                <span>COMPRA ({finalContractsToUse})</span>
              </button>

              {/* VENDA BUTTON */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleManualTrade('VENDA');
                }}
                className="bg-[#e11d48] hover:bg-[#f43f5e] active:bg-[#be123c] active:scale-[0.98] text-white rounded-lg py-1.5 px-2 flex items-center justify-center transition-all shadow-md cursor-pointer border border-rose-400/40 text-xs font-black tracking-wide"
                title="Executar Venda"
              >
                <span>VENDA ({finalContractsToUse})</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating Re-expand Button when Boleta is Collapsed */}
      {tempViewMode === 'candles' && !hideManualTradeBar && isBoletaCollapsed && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsBoletaCollapsed(false);
            localStorage.setItem(`vortex_hide_boleta_${activePanel?.id || 'main'}`, 'false');
          }}
          className="absolute bottom-2 left-4 z-30 px-2.5 py-1 bg-slate-950/90 hover:bg-slate-900 border border-slate-700/80 hover:border-blue-500/80 text-slate-300 hover:text-white rounded-md text-[10.5px] font-mono font-bold shadow-2xl backdrop-blur-md transition-all flex items-center gap-1.5 cursor-pointer select-none"
          title="Clique para reexibir a Boleta de Negociação"
        >
          <span>▲ Mostrar Boleta</span>
        </button>
      )}

      {/* Floating HUD: Radar Axion ML Predictor NQ (+25/-12) em Formação (somente se o widget axion_ml_radar não estiver ativo na tela) */}
      {axionMLRadarState && axionMLRadarState.visible && !(activeWidgetsProp && activeWidgetsProp.some(w => w.type === 'axion_ml_radar' && w.visible !== false)) && (
        <div className="absolute top-14 right-4 z-30 pointer-events-auto select-none">
          <div className={`px-3.5 py-2.5 rounded-xl backdrop-blur-md border shadow-2xl transition-all duration-300 font-mono w-[284px] max-w-[284px] box-border overflow-hidden ${
            axionMLRadarState.isSignal
              ? axionMLRadarState.direction === 'COMPRA'
                ? 'bg-emerald-950/90 border-emerald-500/80 shadow-emerald-500/25 ring-1 ring-emerald-500/60 animate-pulse'
                : 'bg-rose-950/90 border-rose-500/80 shadow-rose-500/25 ring-1 ring-rose-500/60 animate-pulse'
              : axionMLRadarState.isArming
                ? axionMLRadarState.direction === 'COMPRA'
                  ? 'bg-emerald-950/70 border-emerald-500/60 shadow-emerald-500/15 ring-1 ring-emerald-400/40'
                  : 'bg-rose-950/70 border-rose-500/60 shadow-rose-500/15 ring-1 ring-rose-400/40'
                : 'bg-slate-950/90 border-slate-800/90 text-slate-300'
          }`}>
            {/* Header: Título */}
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px]">🧠</span>
                <span className="text-[10.5px] font-bold tracking-wider uppercase text-white">
                  AXION ML RADAR
                </span>
              </div>
            </div>

            {/* Gauge de Probabilidade e Balanço de Forças */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-sans">
                <span className="text-slate-400 font-medium">Prob. Compra / Venda:</span>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className={`font-bold transition-all ${
                    (axionMLRadarState.probBuy ?? 0) >= 38
                      ? 'text-emerald-400 font-black'
                      : (axionMLRadarState.direction === 'COMPRA' && (axionMLRadarState.probBuy ?? 0) >= 34)
                        ? 'text-emerald-300 font-bold'
                        : 'text-slate-400'
                  }`}>
                    🟢 {(axionMLRadarState.probBuy ?? axionMLRadarState.probability).toFixed(1)}%
                  </span>
                  <span className="text-slate-600 font-light">|</span>
                  <span className={`font-bold transition-all ${
                    (axionMLRadarState.probSell ?? 0) >= 38
                      ? 'text-rose-400 font-black'
                      : (axionMLRadarState.direction === 'VENDA' && (axionMLRadarState.probSell ?? 0) >= 34)
                        ? 'text-rose-300 font-bold'
                        : 'text-slate-400'
                  }`}>
                    🔴 {(axionMLRadarState.probSell ?? 0).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Barra de Equilíbrio / Cabo de Guerra (Tug-of-War Balance) */}
              {(() => {
                const buyP = axionMLRadarState.probBuy ?? 30;
                const sellP = axionMLRadarState.probSell ?? 30;
                const totalP = Math.max(0.1, buyP + sellP);
                const baseBuyPct = Math.round((buyP / totalP) * 100);
                const dynamicBuyPct = Math.min(85, Math.max(15, baseBuyPct));
                const dynamicSellPct = 100 - dynamicBuyPct;
                const isNearEqual = Math.abs(dynamicBuyPct - 50) <= 3;

                const centerStatus = isNearEqual
                  ? '⚖️ EQUILÍBRIO'
                  : axionMLRadarState.direction === 'COMPRA'
                    ? '🟢 COMPRA'
                    : axionMLRadarState.direction === 'VENDA'
                      ? '🔴 VENDA'
                      : '⚪ NEUTRO';

                const centerStatusColor = isNearEqual
                  ? 'text-amber-400 font-bold'
                  : axionMLRadarState.direction === 'COMPRA'
                    ? 'text-emerald-400 font-black'
                    : axionMLRadarState.direction === 'VENDA'
                      ? 'text-rose-400 font-black'
                      : 'text-slate-400 font-semibold';

                return (
                  <div className="space-y-1">
                    <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-white/10 relative flex">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-300"
                        style={{ width: `${dynamicBuyPct}%` }}
                      />
                      <div className="absolute left-1/2 top-0 bottom-0 w-[1.5px] bg-white/50 -translate-x-1/2 z-10" />
                      <div
                        className="h-full bg-gradient-to-r from-rose-400 to-rose-600 transition-all duration-300"
                        style={{ width: `${dynamicSellPct}%` }}
                      />
                    </div>
                    {/* Status no centro entre percentuais de compra e venda */}
                    <div className="flex items-center justify-between text-[10px] font-mono px-0.5">
                      <span className={dynamicBuyPct >= 54 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                        Compra {dynamicBuyPct}%
                      </span>
                      <span className={`text-[10px] uppercase font-bold tracking-wide ${centerStatusColor}`}>
                        {centerStatus}
                      </span>
                      <span className={dynamicSellPct >= 54 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                        Venda {dynamicSellPct}%
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Status do Padrão em Formação (FONTE MAIOR) */}
              <div className="pt-1 border-t border-white/10 flex items-center justify-between">
                <span className={`font-bold tracking-tight text-[11.5px] leading-snug ${
                  axionMLRadarState.isSignal
                    ? axionMLRadarState.direction === 'COMPRA' ? 'text-emerald-300 font-black' : 'text-rose-300 font-black'
                    : axionMLRadarState.isArming
                      ? axionMLRadarState.direction === 'COMPRA' ? 'text-emerald-200 font-bold' : 'text-rose-200 font-bold'
                      : axionMLRadarState.direction === 'NEUTRO'
                        ? 'text-slate-300 font-medium'
                        : 'text-slate-200 font-semibold'
                }`}>
                  {axionMLRadarState.status || 'Aguardando gatilho...'}
                </span>
              </div>

              {/* Confluência de Níveis Gamma */}
              {axionMLRadarState.distToCallRes !== undefined && (
                <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[11px] text-slate-300 font-mono">
                  <span title="Distância até a Resistência Gamma mais próxima (Call Wall)">
                    Res.: <strong className="text-rose-400 font-bold">+{axionMLRadarState.distToCallRes}</strong>
                  </span>
                  <span className="text-slate-600">•</span>
                  <span title="Distância até o Suporte Gamma mais próximo (Put Wall)">
                    Sup.: <strong className="text-emerald-400 font-bold">-{axionMLRadarState.distToPutSup}</strong>
                  </span>
                </div>
              )}

              {/* Remodelagem Ativa & Padrão Confluente */}
              {axionMLRadarState.activeModelName && (
                <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[10px] text-cyan-400 font-mono">
                  <span className="truncate max-w-[165px]" title={`Modelo Ativo: ${axionMLRadarState.activeModelName}`}>
                    🧠 {axionMLRadarState.activeModelName}
                  </span>
                  {axionMLRadarState.confluentPattern ? (
                    <span className="text-amber-300 font-bold truncate max-w-[110px]" title={`Padrão Confluente: ${axionMLRadarState.confluentPattern}`}>
                      ✨ {axionMLRadarState.confluentPattern}
                    </span>
                  ) : (
                    <span className="text-slate-500 text-[9px]">Ativo</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

CandleChartInner.displayName = 'CandleChartInner';

export const CandleChart: React.FC<CandleChartProps> = (props) => {
  return (
    <ChartErrorBoundary instanceId={props.instanceId}>
      <CandleChartInner {...props} />
    </ChartErrorBoundary>
  );
};
CandleChart.displayName = 'CandleChart';



