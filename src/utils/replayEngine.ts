import { normalizeStrategyStages } from '../services/db';
import type { Candle, GammaLevels, CustomStrategy, BrokerAccount } from '../services/db';
import { isTimeInSessions, getTradingSessionKey, getSaoPauloDate } from './date';
import { LEGACY_INDICATOR_MAP } from './algorithmIndicators';
import { calculateMACDDivergences, calculateVolumeProfileAnalysis, calculateAxionTrend } from './indicatorRegistry';

export interface ReplayOrder {
  id: string;
  account_id: string;
  strategy_id?: string | null;
  strategy_name: string;
  side: 'COMPRA' | 'VENDA';
  type: 'MARKET' | 'LIMIT' | 'STOP';
  order_price?: number; // Preço limite ou stop se aplicável
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  exit_price: number | null;
  status: 'Pendente' | 'Em Andamento' | 'Gain' | 'Loss' | 'Cancelado' | 'Encerrado';
  contrato: number;
  entry_time: string;
  signal_time?: string;
  exit_time?: string | null;
  points?: number;
  profit_usd?: number;
  description: string;
  symbol?: string;
  panel_id?: string | null;
  instance_id?: string;
  close_reason?: 'TP' | 'SL' | 'MANUAL' | 'ROBOT_REVERSE' | 'DAILY_STOP' | 'DAILY_TARGET' | 'EXPIRED';
  // Suporte a ATM
  atm_breakeven_trigger_pts?: number;
  atm_breakeven_offset_pts?: number;
  atm_trailing_trigger_pts?: number;
  atm_trailing_dist_pts?: number;
  highest_favorable_price?: number;
  breakeven_applied?: boolean;
}

export interface ReplayAccountConfig extends BrokerAccount {
  // Configurações customizáveis para simulação
}

export const DEFAULT_REPLAY_ACCOUNT: ReplayAccountConfig = {
  id: 'replay_account_demo',
  user_id: 'local_user',
  account_type: 'internal_demo',
  account_name: 'Conta Replay (Simulação)',
  balance: 50000,
  initial_balance: 50000,
  currency: 'USD',
  is_master: false,
  is_active: true,
  dd_mode: 'intraday_trailing',
  max_drawdown_usd: 2500,
  daily_stop_loss_usd: 1000,
  daily_max_gain_usd: 1500,
  daily_max_entries: 999,
  allow_multi_signals: false,
  profit_target_usd: 3000,
  consistency_pct: 30,
  simulate_elimination: false,
  manual_trading_enabled: true,
  manual_max_lots: 5,
  manual_max_daily_trades: 999,
  trader_daily_stop_loss_usd: 1000,
  trader_daily_take_profit_usd: 1500,
  high_watermark: 50000,
  eod_baseline_balance: 50000,
  enforce_dd_lockout: false,
  status: 'active',
  created_at: new Date().toISOString()
};

// Agregação de velas de 1m para timeframes maiores (ex: 2m, 3m, 5m, 10m, 15m, 30m, 1h, 4h, 1D)
export function aggregateReplayCandles(raw1mCandles: Candle[], timeframeMinutes: number): Candle[] {
  if (timeframeMinutes <= 1 || raw1mCandles.length === 0) return raw1mCandles;

  const buckets: { [key: number]: Candle[] } = {};

  raw1mCandles.forEach(c => {
    const timeMs = new Date(c.timestamp).getTime();
    if (isNaN(timeMs)) return;
    const bucketTime = Math.floor(timeMs / (timeframeMinutes * 60 * 1000)) * (timeframeMinutes * 60 * 1000);
    if (!buckets[bucketTime]) {
      buckets[bucketTime] = [];
    }
    buckets[bucketTime].push(c);
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

// Micro-passos por vela para simulação fluida intra-candle
export function generateCandleMicroSteps(candle: Candle): number[] {
  const isBullish = candle.close >= candle.open;
  if (isBullish) {
    return [candle.open, candle.low, candle.high, candle.close];
  } else {
    return [candle.open, candle.high, candle.low, candle.close];
  }
}

/**
 * Simula a oscilação realista segundo-a-segundo dentro de um candle de 1 minuto (0s a 59s).
 * Inclui fases de impulso, retração, formação de pavios e micro-ruído orgânico de mercado.
 */
export function calculateIntraCandleSimulatedState(
  candle: Candle,
  second: number,
  candleIndexSeed: number = 0
): { currentPrice: number; formingCandle: Candle } {
  const sec = Math.max(0, Math.min(59, second));
  const open = candle.open;
  const high = candle.high;
  const low = candle.low;
  const close = candle.close;
  const isBullish = close >= open;
  const range = Math.max(0.25, high - low);

  // Micro-ruído fractal/orgânico suave (nulo na abertura e fechamento)
  const noiseFactor = Math.sin((sec / 59) * Math.PI);
  const seed = (candleIndexSeed % 100) + 1;
  const noise = (
    Math.sin(sec * 1.7 + seed) * 0.4 +
    Math.cos(sec * 3.3 + seed * 2) * 0.3 +
    Math.sin(sec * 5.1 + seed * 3) * 0.3
  ) * (range * 0.04) * noiseFactor;

  let basePrice = open;

  if (isBullish) {
    if (sec < 15) {
      // Fase 1 (0..14s): Teste de fundo / pavio inferior
      const t = sec / 15;
      const ease = t * t * (3 - 2 * t);
      basePrice = open + (low - open) * ease;
    } else if (sec < 45) {
      // Fase 2 (15..44s): Impulso principal de alta até a máxima
      const t = (sec - 15) / 30;
      const pullbackWave = Math.sin(t * Math.PI * 4) * (range * 0.08);
      const ease = t * t * (3 - 2 * t);
      basePrice = low + (high - low) * ease + pullbackWave;
    } else {
      // Fase 3 (45..59s): Retração suave da máxima até o fechamento
      const t = (sec - 45) / 14;
      const ease = t * t * (3 - 2 * t);
      basePrice = high + (close - high) * ease;
    }
  } else {
    // Bearish
    if (sec < 15) {
      // Fase 1 (0..14s): Teste de topo / pavio superior
      const t = sec / 15;
      const ease = t * t * (3 - 2 * t);
      basePrice = open + (high - open) * ease;
    } else if (sec < 45) {
      // Fase 2 (15..44s): Impulso principal de baixa até a mínima
      const t = (sec - 15) / 30;
      const pullbackWave = -Math.sin(t * Math.PI * 4) * (range * 0.08);
      const ease = t * t * (3 - 2 * t);
      basePrice = high + (low - high) * ease + pullbackWave;
    } else {
      // Fase 3 (45..59s): Retração suave da mínima até o fechamento
      const t = (sec - 45) / 14;
      const ease = t * t * (3 - 2 * t);
      basePrice = low + (close - low) * ease;
    }
  }

  let currentPrice = basePrice + noise;
  currentPrice = Math.max(low, Math.min(high, currentPrice));

  if (sec === 0) currentPrice = open;

  let currentDynamicHigh = Math.max(open, currentPrice);
  let currentDynamicLow = Math.min(open, currentPrice);

  if (isBullish) {
    if (sec >= 15) currentDynamicLow = low;
    if (sec >= 45) currentDynamicHigh = high;
  } else {
    if (sec >= 15) currentDynamicHigh = high;
    if (sec >= 45) currentDynamicLow = low;
  }

  if (sec === 59) {
    currentPrice = close;
    currentDynamicHigh = high;
    currentDynamicLow = low;
  }

  const formingCandle: Candle = {
    ...candle,
    open: open,
    high: Math.max(currentDynamicHigh, currentPrice),
    low: Math.min(currentDynamicLow, currentPrice),
    close: currentPrice,
    volume: candle.volume ? Math.round((candle.volume * (sec + 1)) / 60) : undefined
  };

  return { currentPrice, formingCandle };
}

// Verificação de Limites Operacionais da Conta Replay
export function checkReplayOperationalLimits(
  account: ReplayAccountConfig,
  currentTrades: ReplayOrder[],
  currentDateISO: string
): { allowed: boolean; reason?: string } {
  if (!account.is_active || account.status === 'failed_lockout') {
    return { allowed: false, reason: 'Conta Replay inativa ou bloqueada por limite de risco atingido.' };
  }

  // Filtrar operações do dia simulado
  const dateStr = currentDateISO.split('T')[0];
  const dayFinishedTrades = currentTrades.filter(
    t => t.status === 'Gain' || t.status === 'Loss' || t.status === 'Encerrado'
  ).filter(t => (t.exit_time || t.entry_time).startsWith(dateStr));

  // 1. Limite Diário de Operações (0 ou >= 999 = Ilimitado)
  const rawMax = (account.daily_max_entries !== undefined && account.daily_max_entries !== null)
    ? Number(account.daily_max_entries)
    : (account.manual_max_daily_trades !== undefined ? Number(account.manual_max_daily_trades) : 999);
  const maxEntries = rawMax <= 0 ? 999999 : rawMax;
  if (maxEntries > 0 && maxEntries < 999999 && dayFinishedTrades.length >= maxEntries) {
    return { allowed: false, reason: `Limite diário de ${maxEntries} operações atingido para a Conta Replay.` };
  }

  // 2. Limite de Perda Diária (Daily Stop Loss USD)
  const dayPnL = dayFinishedTrades.reduce((acc, t) => acc + (t.profit_usd || 0), 0);
  const maxLoss = account.daily_stop_loss_usd || account.trader_daily_stop_loss_usd || 1000;
  if (dayPnL <= -Math.abs(maxLoss)) {
    return { allowed: false, reason: `Limite de perda diária de -$${maxLoss.toFixed(2)} atingido na Conta Replay (PnL Hoje: -$${Math.abs(dayPnL).toFixed(2)}).` };
  }

  // 3. Meta Diária de Lucro (Daily Profit Target USD)
  const maxGain = account.daily_max_gain_usd || account.trader_daily_take_profit_usd || 1500;
  if (dayPnL >= maxGain) {
    return { allowed: false, reason: `Meta diária de lucro de +$${maxGain.toFixed(2)} atingida na Conta Replay (PnL Hoje: +$${dayPnL.toFixed(2)}).` };
  }

  return { allowed: true };
}

// Funções Utilitárias de Indicadores para o Motor de Replay
function calculateSMAValues(data: { close: number }[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(0);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += Number(data[i - j]?.close || 0);
      }
      result.push(sum / period);
    }
  }
  return result;
}

function calculateEMAValues(data: { close: number }[], period: number): number[] {
  const ema: number[] = [];
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < Math.min(period, data.length); i++) {
    sum += data[i].close;
  }
  let prevEma = sum / Math.min(period, data.length);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      ema.push(0);
    } else if (i === period - 1) {
      ema.push(prevEma);
    } else {
      const val = data[i].close * k + prevEma * (1 - k);
      ema.push(val);
      prevEma = val;
    }
  }
  return ema;
}

function calculateRSIValues(data: { close: number }[], period = 14): number[] {
  const rsi: number[] = [];
  if (data.length <= period) return new Array(data.length).fill(50);
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i].close - data[i - 1].close;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      rsi.push(50);
    } else if (i === period) {
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    } else {
      const diff = data[i].close - data[i - 1].close;
      const currentGain = diff > 0 ? diff : 0;
      const currentLoss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + currentGain) / period;
      avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    }
  }
  return rsi;
}

export interface ReplaySequenceState {
  currentStageIndex: number;
  candlesSinceStageCompletion: number;
  lastCheckedCandleTime: string;
  lastCompletedCandleTime?: string;
}

export const replaySequenceStateMap: Record<string, ReplaySequenceState> = {};

export function resetReplaySequenceStates(): void {
  for (const k in replaySequenceStateMap) {
    delete replaySequenceStateMap[k];
  }
}

// Auxiliar Universal para Cálculo de Suporte e Resistência Gamma Dinâmicos relativos a qualquer preço
export function computeDynamicSupportResistance(
  price: number,
  levels: any
): { nearestSupport: number; nearestResistance: number; distanceToSupport: number; distanceToResistance: number } {
  if (!levels || !price || isNaN(price) || price <= 0) {
    return { nearestSupport: 0, nearestResistance: 0, distanceToSupport: 9999, distanceToResistance: 9999 };
  }

  const allLevels: number[] = [];
  const addLevel = (val: any) => {
    const num = Number(val);
    if (!isNaN(num) && num > 0) allLevels.push(num);
  };

  addLevel(levels.hvl);
  addLevel(levels.gwall || levels.gamma_wall_0dte);
  addLevel(levels.hvl0 || levels.hvl_0dte);
  addLevel(levels.call || levels.call_resistance);
  addLevel(levels.put || levels.put_support);
  addLevel(levels.call0 || levels.call_resistance_0dte);
  addLevel(levels.put0 || levels.put_support_0dte);
  addLevel(levels.max1d || levels.max_1d);
  addLevel(levels.min1d || levels.min_1d);
  addLevel(levels.prev || levels.prev_day_adjust);
  addLevel(levels.prevH || levels.prev_day_high);
  addLevel(levels.prevL || levels.prev_day_low);

  if (Array.isArray(levels.bl)) levels.bl.forEach(addLevel);
  if (Array.isArray(levels.gex)) levels.gex.forEach(addLevel);

  const supports = allLevels.filter(lvl => lvl < price);
  const resistances = allLevels.filter(lvl => lvl > price);

  const nearestSupport = supports.length > 0 ? Math.max(...supports) : (Number(levels.nearest_support) || 0);
  const nearestResistance = resistances.length > 0 ? Math.min(...resistances) : (Number(levels.nearest_resistance) || 0);

  const distanceToSupport = nearestSupport > 0 ? Math.abs(price - nearestSupport) : 9999;
  const distanceToResistance = nearestResistance > 0 ? Math.abs(nearestResistance - price) : 9999;

  return { nearestSupport, nearestResistance, distanceToSupport, distanceToResistance };
}

// Avaliação Técnica Completa de Robôs / Algoritmos sobre a janela de candles no Replay
export function evaluateReplayRobot(
  strat: CustomStrategy,
  candlesSlice: Candle[],
  gammaLevels: GammaLevels | null,
  _pointValue: number,
  currentReplayTime: string,
  closedCandleTime?: string,
  customSequenceStateMap?: Record<string, { currentStageIndex: number; candlesSinceStageCompletion: number; lastCheckedCandleTime?: string; lastCompletedCandleTime?: string }>,
  skipAggregation?: boolean
): { side: 'COMPRA' | 'VENDA' | null; description: string } {
  if (!strat || !candlesSlice || candlesSlice.length < 5) {
    return { side: null, description: '' };
  }

  const executionMode = strat.execution_mode || 'closed';

  // 1. Validação de Sessões / Horários Permitidos (com precisão de segundos e suporte a Barra Fechada)
  if (strat.sessions && strat.sessions.length > 0) {
    const inCurrentSession = isTimeInSessions(currentReplayTime, strat.sessions);
    const inClosedSession = closedCandleTime ? isTimeInSessions(closedCandleTime, strat.sessions) : false;
    const inSession = executionMode === 'closed' ? (inCurrentSession || inClosedSession) : inCurrentSession;
    if (!inSession) {
      return { side: null, description: 'Fora do horário permitido do robô' };
    }
  }

  // 2. Ajuste de Timeframe da Estratégia
  const stratTf = (strat as any).timeframe || 1;
  const candlesToCalc = (!skipAggregation && stratTf > 1) ? aggregateReplayCandles(candlesSlice, stratTf) : candlesSlice;
  if (candlesToCalc.length < 5) {
    return { side: null, description: '' };
  }

  const targetIndex = executionMode === 'closed' ? candlesToCalc.length - 2 : candlesToCalc.length - 1;
  if (targetIndex < 1) return { side: null, description: '' };

  const currentCandle = candlesToCalc[targetIndex];
  const prevCandle = candlesToCalc[targetIndex - 1];

  const lastCandleOpen = Number(currentCandle.open);
  const lastCandleHigh = Number(currentCandle.high);
  const lastCandleLow = Number(currentCandle.low);
  const lastCandleClose = Number(currentCandle.close);
  const prevCandleOpen = Number(prevCandle.open);
  const prevCandleHigh = Number(prevCandle.high);
  const prevCandleLow = Number(prevCandle.low);
  const prevCandleClose = Number(prevCandle.close);

  const lastCandleSize = Math.max(0, lastCandleHigh - lastCandleLow);
  const lastCandleBody = Math.abs(lastCandleClose - lastCandleOpen);
  const prevCandleSize = Math.max(0, prevCandleHigh - prevCandleLow);
  const prevCandleBody = Math.abs(prevCandleClose - prevCandleOpen);

  // 3. Padrões de Candlestick em Tempo Real
  let pinbarPattern = 'neutro';
  let engulfingPattern = 'neutro';
  let pattern180 = 'neutro';

  const range = lastCandleHigh - lastCandleLow;
  const isLastBullish = lastCandleClose > lastCandleOpen;
  const isLastBearish = lastCandleClose < lastCandleOpen;
  const isPrevBullish = prevCandleClose > prevCandleOpen;
  const isPrevBearish = prevCandleClose < prevCandleOpen;

  if (range > 0) {
    const lowerWick = Math.min(lastCandleOpen, lastCandleClose) - lastCandleLow;
    const upperWick = lastCandleHigh - Math.max(lastCandleOpen, lastCandleClose);
    if (isLastBullish && lowerWick / range >= 0.55) {
      pinbarPattern = 'compra';
    } else if (isLastBearish && upperWick / range >= 0.55) {
      pinbarPattern = 'venda';
    }
  }

  if (lastCandleHigh > prevCandleHigh && lastCandleLow < prevCandleLow) {
    if (isLastBullish) engulfingPattern = 'compra';
    else if (isLastBearish) engulfingPattern = 'venda';
  }

  const meetsSize80 = prevCandleSize > 0 ? (lastCandleSize >= prevCandleSize * 0.80) : true;

  if (isPrevBearish && isLastBullish) {
    if (lastCandleClose >= prevCandleOpen && meetsSize80) {
      pattern180 = 'compra';
    }
  } else if (isPrevBullish && isLastBearish) {
    if (lastCandleClose <= prevCandleOpen && meetsSize80) {
      pattern180 = 'venda';
    }
  }

  let star3Pattern = 'neutro';
  const prev2Candle = targetIndex >= 2 ? candlesToCalc[targetIndex - 2] : null;
  if (prevCandle && prev2Candle) {
    const c1Close = lastCandleClose, c1Open = lastCandleOpen, c1High = lastCandleHigh, c1Low = lastCandleLow;
    const c2Close = Number(prevCandle.close), c2Open = Number(prevCandle.open), c2High = Number(prevCandle.high), c2Low = Number(prevCandle.low);
    const c3Close = Number(prev2Candle.close), c3Open = Number(prev2Candle.open), c3High = Number(prev2Candle.high), c3Low = Number(prev2Candle.low);

    const isC1Bull = c1Close > c1Open;
    const isC1Bear = c1Close < c1Open;
    const isC2Bull = c2Close > c2Open;
    const isC2Bear = c2Close < c2Open;
    const isC3Bull = c3Close > c3Open;
    const isC3Bear = c3Close < c3Open;

    const mid3 = (c3High + c3Low) / 2;

    // Compra: Candle 3 venda, Candle 2 venda com mínima menor que candle 3 (c2Low < c3Low)
    // Candle 1 (Gatilho): alta (isC1Bull), máxima acima da máxima do candle 2 (c1High > c2High), mínima abaixo da mínima do candle 2 (c1Low < c2Low) e fechamento acima do fechamento do candle 2 (c1Close > c2Close)
    // Regra de Não Invasão: máxima do candle 1 abaixo da metade do range do candle 3 (c1High <= mid3)
    if (isC3Bear && isC2Bear && isC1Bull && c2Low < c3Low && c1High > c2High && c1Low < c2Low && c1Close > c2Close && c1High <= mid3) {
      star3Pattern = 'compra';
    }
    // Venda: Candle 3 compra, Candle 2 compra com máxima maior que candle 3 (c2High > c3High)
    // Candle 1 (Gatilho): baixa (isC1Bear), máxima acima da máxima do candle 2 (c1High > c2High), mínima abaixo da mínima do candle 2 (c1Low < c2Low) e fechamento abaixo do fechamento do candle 2 (c1Close < c2Close)
    // Regra de Não Invasão: mínima do candle 1 acima da metade do range do candle 3 (c1Low >= mid3)
    else if (isC3Bull && isC2Bull && isC1Bear && c2High > c3High && c1High > c2High && c1Low < c2Low && c1Close < c2Close && c1Low >= mid3) {
      star3Pattern = 'venda';
    }
  }

  let chutePattern = 'neutro';
  if (prevCandle) {
    const c1Close = lastCandleClose, c1Open = lastCandleOpen, c1High = lastCandleHigh, c1Low = lastCandleLow;
    const c2Close = Number(prevCandle.close), c2Open = Number(prevCandle.open), c2High = Number(prevCandle.high), c2Low = Number(prevCandle.low);

    const isC1Bull = c1Close > c1Open;
    const isC1Bear = c1Close < c1Open;
    const isC2Bull = c2Close > c2Open;
    const isC2Bear = c2Close < c2Open;

    const b1 = Math.abs(c1Close - c1Open);
    const b2 = Math.abs(c2Close - c2Open);
    const r1 = c1High - c1Low;
    const r2 = c2High - c2Low;

    const wicks1 = r1 - b1;
    const wicks2 = r2 - b2;

    const isMarubozu1 = b1 > 0 && (wicks1 / b1) <= 0.30;
    const isMarubozu2 = b2 > 0 && (wicks2 / b2) <= 0.30;

    if (isMarubozu1 && isMarubozu2) {
      if (isC2Bear && isC1Bull && (c1Low > c2High || c1Open > c2Open)) {
        chutePattern = 'compra';
      } else if (isC2Bull && isC1Bear && (c1High < c2Low || c1Open < c2Open)) {
        chutePattern = 'venda';
      }
    }
  }

  // 4. PVA Clímax de Volume
  let stratPvaType = 'neutro';
  const pvaTargetIdx = targetIndex;
  if (pvaTargetIdx >= 10 && candlesToCalc[pvaTargetIdx]) {
    const prev10 = candlesToCalc.slice(pvaTargetIdx - 10, pvaTargetIdx);
    if (prev10.length === 10) {
      const sumVol = prev10.reduce((acc, c) => acc + (Number(c.volume) || 0), 0);
      const avgVol = sumVol / 10;
      let highestVolumeRange = 0;
      for (const c of prev10) {
        const vol = Number(c.volume) || 0;
        const h = Number(c.high) || 0;
        const l = Number(c.low) || 0;
        const r = vol * (h - l);
        if (r > highestVolumeRange) highestVolumeRange = r;
      }
      const curVol = Number(currentCandle.volume) || 0;
      const curVolRange = curVol * (lastCandleHigh - lastCandleLow);
      const isClimax = curVol > 0 && avgVol > 0 && ((highestVolumeRange > 0 && curVolRange >= highestVolumeRange) || (curVol >= avgVol * 2.0));
      if (isClimax) {
        if (lastCandleClose > lastCandleOpen) stratPvaType = 'compra';
        else if (lastCandleClose < lastCandleOpen) stratPvaType = 'venda';
      }
    }
  }

  // 5. Médias Móveis e Osciladores
  const calcData = candlesToCalc.slice(0, targetIndex + 1);
  const sma8Arr = calculateSMAValues(calcData, 8);
  const sma20Arr = calculateSMAValues(calcData, 20);
  const sma50Arr = calculateSMAValues(calcData, 50);
  const rsiArr = calculateRSIValues(calcData, 14);

  const lastSma8 = sma8Arr.length > 0 ? sma8Arr[sma8Arr.length - 1] : lastCandleClose;
  const lastSma20 = sma20Arr.length > 0 ? sma20Arr[sma20Arr.length - 1] : lastCandleClose;
  const lastSma50 = sma50Arr.length > 0 ? sma50Arr[sma50Arr.length - 1] : lastCandleClose;
  const lastRsi = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : 50;

  const prevSma8 = sma8Arr.length > 1 ? sma8Arr[sma8Arr.length - 2] : prevCandleClose;
  const prevSma20 = sma20Arr.length > 1 ? sma20Arr[sma20Arr.length - 2] : prevCandleClose;
  const prevSma50 = sma50Arr.length > 1 ? sma50Arr[sma50Arr.length - 2] : prevCandleClose;
  const prevRsi = rsiArr.length > 1 ? rsiArr[rsiArr.length - 2] : 50;

  const calcCloses = calcData.map(c => Number(c.close || 0));
  const calcSlice20 = calcCloses.slice(-20);
  const mean20 = calcSlice20.reduce((a, b) => a + b, 0) / Math.max(1, calcSlice20.length);
  const variance20 = calcSlice20.reduce((a, b) => a + Math.pow(b - mean20, 2), 0) / Math.max(1, calcSlice20.length);
  const stdDev20 = Math.sqrt(variance20);
  const zScoreVal = stdDev20 > 0 ? (lastCandleClose - mean20) / stdDev20 : 0;

  const ema12Arr = calculateEMAValues(calcData, 12);
  const ema26Arr = calculateEMAValues(calcData, 26);
  const histVal = (ema12Arr[ema12Arr.length - 1] || 0) - (ema26Arr[ema26Arr.length - 1] || 0);
  const thresholdVal = stdDev20 * 0.15;

  let simEstado = 'NORMAL';
  if (zScoreVal >= 2.0) simEstado = 'EXAUSTÃO COMPRA';
  else if (zScoreVal <= -2.0) simEstado = 'EXAUSTÃO VENDA';
  else if (histVal > thresholdVal * 1.5) simEstado = 'EXPLOSÃO COMPRA';
  else if (histVal < -thresholdVal * 1.5) simEstado = 'EXPLOSÃO VENDA';
  else if (histVal > 0) simEstado = 'COMPRA';
  else if (histVal < 0) simEstado = 'VENDA';

  // 6. Registry Completo de Indicadores
  const registry: Record<string, any> = {
    'price': lastCandleClose,
    'close': lastCandleClose,
    'candle_close': lastCandleClose,
    'open': lastCandleOpen,
    'candle_open': lastCandleOpen,
    'high': lastCandleHigh,
    'candle_high': lastCandleHigh,
    'low': lastCandleLow,
    'candle_low': lastCandleLow,
    'candle_size': lastCandleSize,
    'candle_body': lastCandleBody,
    'pattern_pinbar': pinbarPattern,
    'pattern_engolfo': engulfingPattern,
    'pattern_180': pattern180,
    'pattern_star3': star3Pattern,
    'pattern_chute': chutePattern,
    'pva': stratPvaType,
    'estado': simEstado,
    'zScore': zScoreVal,
    'atrRatio': 1.0,
    'sma8': lastSma8,
    'sma20': lastSma20,
    'sma50': lastSma50,
    'rsi': lastRsi,
    'dist_sma8_sma20': Math.abs(lastSma8 - lastSma20),
    'dist_sma20_sma50': Math.abs(lastSma20 - lastSma50),
    'dist_price_sma8': Math.abs(lastCandleClose - lastSma8),
    'dist_price_sma20': Math.abs(lastCandleClose - lastSma20),
    'dist_price_sma50': Math.abs(lastCandleClose - lastSma50)
  };

  const registryPrev: Record<string, any> = {
    'price': prevCandleClose,
    'close': prevCandleClose,
    'candle_close': prevCandleClose,
    'open': prevCandleOpen,
    'candle_open': prevCandleOpen,
    'high': prevCandleHigh,
    'candle_high': prevCandleHigh,
    'low': prevCandleLow,
    'candle_low': prevCandleLow,
    'candle_size': prevCandleSize,
    'candle_body': prevCandleBody,
    'pattern_pinbar': 'neutro',
    'pattern_engolfo': 'neutro',
    'pattern_180': 'neutro',
    'pattern_star3': 'neutro',
    'pattern_chute': 'neutro',
    'pva': 'neutro',
    'estado': simEstado,
    'zScore': zScoreVal,
    'atrRatio': 1.0,
    'sma8': prevSma8,
    'sma20': prevSma20,
    'sma50': prevSma50,
    'rsi': prevRsi,
    'dist_sma8_sma20': Math.abs(prevSma8 - prevSma20),
    'dist_sma20_sma50': Math.abs(prevSma20 - prevSma50),
    'dist_price_sma8': Math.abs(prevCandleClose - prevSma8),
    'dist_price_sma20': Math.abs(prevCandleClose - prevSma20),
    'dist_price_sma50': Math.abs(prevCandleClose - prevSma50)
  };

  // Preencher Níveis Gamma e Suportes/Resistências Dinâmicos em AMBOS os Registries (com Fallback Estrutural)
  let effectiveGamma: any = gammaLevels ? { ...gammaLevels } : null;
  if (!effectiveGamma && calcData.length >= 5) {
    const sysStart = (strat as any).global_cycle_start || '20:00:00';
    const sessionsMap = new Map<string, { high: number; low: number; close: number }[]>();
    const sessionKeysOrder: string[] = [];
    for (let i = 0; i < calcData.length; i++) {
      const c = calcData[i];
      const sKey = getTradingSessionKey((c as any).time || c.timestamp, sysStart);
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
    const prevKey = sessionKeysOrder.length >= 2 ? sessionKeysOrder[sessionKeysOrder.length - 2] : sessionKeysOrder[0];
    const prevCandles = prevKey ? (sessionsMap.get(prevKey) || []) : [];
    if (prevCandles.length > 0) {
      let pH = -Infinity;
      let pL = Infinity;
      for (const pc of prevCandles) {
        if (pc.high > pH) pH = pc.high;
        if (pc.low < pL) pL = pc.low;
      }
      const pClose = prevCandles[prevCandles.length - 1].close;
      const diff = (pH !== -Infinity && pL !== Infinity && pH > pL) ? (pH - pL) : (pClose > 0 ? pClose * 0.01 : 100);

      effectiveGamma = {
        hvl: ((pH + pL + pClose) / 3).toFixed(2),
        gwall: (pH + diff * 0.382).toFixed(2),
        hvl0: (((pClose + (pH + pL) / 2) / 2)).toFixed(2),
        call: pH.toFixed(2),
        put: pL.toFixed(2),
        call0: (pClose + diff * 0.236).toFixed(2),
        put0: (pClose - diff * 0.236).toFixed(2),
        max1d: (pClose + diff).toFixed(2),
        min1d: (pClose - diff).toFixed(2),
        prev: pClose.toFixed(2),
        prevH: pH.toFixed(2),
        prevL: pL.toFixed(2)
      };
    }
  }

  if (effectiveGamma) {
    const g = effectiveGamma;
    const populateGamma = (reg: Record<string, any>) => {
      reg['gamma_hvl'] = Number(g.hvl || 0);
      reg['gamma_gwall'] = Number(g.gwall || g.gamma_wall_0dte || 0);
      reg['gamma_hvl0'] = Number(g.hvl0 || g.hvl_0dte || 0);
      reg['gamma_call'] = Number(g.call || g.call_resistance || 0);
      reg['gamma_put'] = Number(g.put || g.put_support || 0);
      reg['gamma_call0'] = Number(g.call0 || g.call_resistance_0dte || 0);
      reg['gamma_put0'] = Number(g.put0 || g.put_support_0dte || 0);
      reg['gamma_max1d'] = Number(g.max1d || g.max_1d || 0);
      reg['gamma_min1d'] = Number(g.min1d || g.min_1d || 0);
      reg['gamma_prev'] = Number(g.prev || g.prev_day_adjust || 0);
      reg['gamma_prevH'] = Number(g.prevH || g.prev_day_high || 0);
      reg['gamma_prevL'] = Number(g.prevL || g.prev_day_low || 0);

      if (Array.isArray(g.bl)) {
        for (let i = 0; i < Math.min(10, g.bl.length); i++) {
          reg[`gamma_bl${i + 1}`] = Number(g.bl[i] || 0);
        }
      }
      if (Array.isArray(g.gex)) {
        for (let i = 0; i < Math.min(10, g.gex.length); i++) {
          reg[`gamma_gex${i + 1}`] = Number(g.gex[i] || 0);
        }
      }
    };

    populateGamma(registry);
    populateGamma(registryPrev);

    // Suporte e Resistência Dinâmicos relativos a cada preço
    const curSR = computeDynamicSupportResistance(lastCandleClose, effectiveGamma);
    registry['nearest_resistance'] = curSR.nearestResistance;
    registry['nearest_support'] = curSR.nearestSupport;
    registry['distance_to_resistance'] = curSR.distanceToResistance;
    registry['distance_to_support'] = curSR.distanceToSupport;

    const prevSR = computeDynamicSupportResistance(prevCandleClose, effectiveGamma);
    registryPrev['nearest_resistance'] = prevSR.nearestResistance;
    registryPrev['nearest_support'] = prevSR.nearestSupport;
    registryPrev['distance_to_resistance'] = prevSR.distanceToResistance;
    registryPrev['distance_to_support'] = prevSR.distanceToSupport;
  }

  // Preencher Níveis de Volume Profile (VPOC, VAH, VAL, Naked POCs) e Blocos HVN em AMBOS os Registries
  try {
    if (calcData.length >= 3) {
      const vpResult = calculateVolumeProfileAnalysis(calcData, {
        sessionMode: 'all',
        topNodesCount: 6,
        lookbackDays: 1,
        valueAreaPct: 70
      });
      if (vpResult && vpResult.levels) {
        const populateVP = (reg: Record<string, any>) => {
          reg['vpoc'] = vpResult.levels.poc || 0;
          reg['vah'] = vpResult.levels.vah || 0;
          reg['val_level'] = vpResult.levels.val || 0;
          reg['naked_pocs'] = vpResult.levels.nakedPocs || [];
          reg['naked_poc1'] = vpResult.levels.nakedPocs?.[0]?.price || 0;
          reg['naked_poc2'] = vpResult.levels.nakedPocs?.[1]?.price || 0;
          reg['naked_poc3'] = vpResult.levels.nakedPocs?.[2]?.price || 0;

          if (Array.isArray(vpResult.hvnBlocks)) {
            reg['hvn_blocks'] = vpResult.hvnBlocks;
            for (let i = 0; i < Math.min(6, vpResult.hvnBlocks.length); i++) {
              const blk = vpResult.hvnBlocks[i];
              reg[`hvn${i + 1}_center`] = blk.priceCenter;
              reg[`hvn${i + 1}_top`] = blk.priceTop;
              reg[`hvn${i + 1}_bottom`] = blk.priceBottom;
            }
          }
        };
        populateVP(registry);
        populateVP(registryPrev);
      }
    }
  } catch (e) {
    // Manter valores limpos caso erro transitório
  }

  // 7. Avaliação Universal de Condições
  const isStateMatching = (sourceVal: any, targetVal: any): boolean => {
    const norm = (s: any) =>
      String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[_-]+/g, ' ')
        .toUpperCase()
        .trim();

    const s = norm(sourceVal);
    const t = norm(targetVal);
    if (!s || !t) return false;
    if (s === t) return true;

    // Explosão Compra
    const isTargetExplosionBuy =
      (t.includes('EXPLOSAO') || t.includes('EXPLOSION')) &&
      (t.includes('COMPRA') || t.includes('BUY') || t.includes('ALTA'));
    if (isTargetExplosionBuy) {
      return (
        (s.includes('EXPLOSAO') || s.includes('EXPLOSION')) &&
        (s.includes('COMPRA') || s.includes('BUY') || s.includes('ALTA'))
      );
    }

    // Explosão Venda
    const isTargetExplosionSell =
      (t.includes('EXPLOSAO') || t.includes('EXPLOSION')) &&
      (t.includes('VENDA') || t.includes('SELL') || t.includes('BAIXA'));
    if (isTargetExplosionSell) {
      return (
        (s.includes('EXPLOSAO') || s.includes('EXPLOSION')) &&
        (s.includes('VENDA') || s.includes('SELL') || s.includes('BAIXA'))
      );
    }

    // Exaustão de Compra / Alta (topo)
    const isTargetExhaustionBuy =
      (t.includes('EXAUSTAO') || t.includes('EXHAUSTION')) &&
      (t.includes('COMPRA') || t.includes('BUY') || t.includes('ALTA'));
    if (isTargetExhaustionBuy) {
      return (
        (s.includes('EXAUSTAO') || s.includes('EXHAUSTION')) &&
        (s.includes('COMPRA') || s.includes('BUY') || s.includes('ALTA'))
      );
    }

    // Exaustão de Venda / Baixa (fundo)
    const isTargetExhaustionSell =
      (t.includes('EXAUSTAO') || t.includes('EXHAUSTION')) &&
      (t.includes('VENDA') || t.includes('SELL') || t.includes('BAIXA'));
    if (isTargetExhaustionSell) {
      return (
        (s.includes('EXAUSTAO') || s.includes('EXHAUSTION')) &&
        (s.includes('VENDA') || s.includes('SELL') || s.includes('BAIXA'))
      );
    }

    // Compressão
    const isTargetCompression = t.includes('COMPRESSAO') || t.includes('COMPRESSION');
    if (isTargetCompression) {
      return s.includes('COMPRESSAO') || s.includes('COMPRESSION');
    }

    // Normal
    if (t === 'NORMAL') {
      return s === 'NORMAL';
    }

    // Aguardando / Neutro
    if (t === 'AGUARDANDO' || t === 'NEUTRO' || t === 'WAITING' || t === 'NEUTRAL') {
      return s === 'AGUARDANDO' || s === 'NEUTRO' || s === 'WAITING' || s === 'NEUTRAL';
    }

    // Sair
    if (t === 'SAIR' || t === 'EXIT') {
      return s === 'SAIR' || s === 'EXIT';
    }

    // Compra geral (apenas se não for exaustão)
    const isTargetBuy = t === 'COMPRA' || t === 'BUY';
    if (isTargetBuy) {
      if (s.includes('EXAUSTAO') || s.includes('EXHAUSTION')) return false;
      return s === 'COMPRA' || s === 'BUY' || s.includes('COMPRA') || s.includes('BUY');
    }

    // Venda geral (apenas se não for exaustão)
    const isTargetSell = t === 'VENDA' || t === 'SELL';
    if (isTargetSell) {
      if (s.includes('EXAUSTAO') || s.includes('EXHAUSTION')) return false;
      return s === 'VENDA' || s === 'SELL' || s.includes('VENDA') || s.includes('SELL');
    }

    return s === t;
  };

  const parseNum = (v: any): number | null => {
    if (typeof v === 'number') return isNaN(v) ? null : v;
    if (typeof v === 'string') {
      const clean = v.replace(/,/g, '.').replace(/[^\d.-]/g, '');
      const p = parseFloat(clean);
      return isNaN(p) ? null : p;
    }
    return null;
  };

  const getIndicatorVal = (condOrKey: any, isTarget: boolean, isPrev: boolean): { val: any; num: number | null } => {
    let key = '';
    let param = 0;
    let params: Record<string, any> = {};
    let subSeries = '';

    if (typeof condOrKey === 'string') {
      key = condOrKey;
    } else if (condOrKey && typeof condOrKey === 'object') {
      if (isTarget) {
        key = condOrKey.target_indicator || condOrKey.target_value || condOrKey.target || condOrKey.value || '';
        param = Number(condOrKey.target_param1 || condOrKey.target_param || condOrKey.param2 || 0);
        params = condOrKey.target_params || {};
        subSeries = condOrKey.target_subSeries || '';
      } else {
        key = condOrKey.source || condOrKey.indicator || '';
        param = Number(condOrKey.param1 || condOrKey.param || 0);
        params = condOrKey.source_params || condOrKey.params || {};
        subSeries = condOrKey.source_subSeries || condOrKey.subSeries || '';
      }
    }
    if (!key && condOrKey && typeof condOrKey === 'object') {
      key = String(isTarget ? (condOrKey.target_value || condOrKey.value || '') : (condOrKey.source || condOrKey.indicator || ''));
    }

    if (LEGACY_INDICATOR_MAP[key]) {
      const leg = LEGACY_INDICATOR_MAP[key];
      key = leg.indicatorId;
      if (leg.subSeries && !subSeries) subSeries = leg.subSeries;
      if (leg.params) params = { ...leg.params, ...params };
    }

    const activeReg = isPrev ? registryPrev : registry;
    const activeHist = isPrev ? calcData.slice(0, -1) : calcData;

    // Indicadores CALCULÁVEIS: sempre recalculados a partir dos candles históricos.
    // NÃO devem ser interceptados pelo registry (que é para dados externos: PVA, VWAP, eMacd etc).
    const normKey = String(key || '').toLowerCase().trim();
    const CALCULABLE_KEYS = ['sma', 'ema', 'rsi', 'macd', 'bollinger', 'tma', 'supertrend', 'smc_bos_choch', 'smc_range_filter', 'order_block_range', 'smc_ob_range', 'ma_cloud_filter', 'macloud_filter', 'ma_cloud', 'macloud', 'axion_trend', 'axiontrend'];
    const isCalculable = CALCULABLE_KEYS.some(ci => normKey === ci || normKey.startsWith(ci + '_') || normKey.startsWith(ci + '-'));

    if (!isCalculable && activeReg[key] !== undefined) {
      const raw = activeReg[key];
      const num = parseNum(raw);
      return { val: raw, num };
    }
    const smaMatch = normKey.match(/^sma[_\-]?(\d+)$/);
    if (smaMatch || normKey === 'sma') {
      const period = params.period || param || (smaMatch ? parseInt(smaMatch[1], 10) : 20);
      const smaArr = calculateSMAValues(activeHist, period);
      const val = smaArr.length > 0 ? smaArr[smaArr.length - 1] : 0;
      return { val, num: val };
    }
    const emaMatch = normKey.match(/^ema[_\-]?(\d+)$/);
    if (emaMatch || normKey === 'ema') {
      const period = params.period || param || (emaMatch ? parseInt(emaMatch[1], 10) : 21);
      const emaArr = calculateEMAValues(activeHist, period);
      const val = emaArr.length > 0 ? emaArr[emaArr.length - 1] : 0;
      return { val, num: val };
    }
    const rsiMatch = normKey.match(/^rsi[_\-]?(\d+)$/);
    if (rsiMatch || normKey === 'rsi') {
      const period = params.period || param || (rsiMatch ? parseInt(rsiMatch[1], 10) : 14);
      const rsiArr = calculateRSIValues(activeHist, period);
      const val = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : 50;
      return { val, num: val };
    }

    if (normKey === 'macd') {
      const fast = params.fastPeriod || 12;
      const slow = params.slowPeriod || 26;
      const sig = params.signalPeriod || 9;
      const divMinBars = Number(params.divergenceMinBars || 5);
      const divLookback = Number(params.divergenceLookback || 60);

      const emaFast = calculateEMAValues(activeHist, fast);
      const emaSlow = calculateEMAValues(activeHist, slow);
      const macdLine: number[] = [];
      for (let i = 0; i < activeHist.length; i++) {
        macdLine.push((emaFast[i] || 0) - (emaSlow[i] || 0));
      }
      const macdCandles = macdLine.map(v => ({ close: v }));
      const signalLine = calculateEMAValues(macdCandles, sig);

      const subNorm = String(subSeries || '').toLowerCase().trim();

      // Detecção e avaliação de divergências de alta e baixa do MACD
      if (subNorm.includes('divergence') || subNorm.includes('divergencia')) {
        const histArr: { time: number; value: number }[] = [];
        const candleData = activeHist.map((c: any, i: number) => {
          const rawT = c.timestamp || c.time || (i + 1);
          const numT = typeof rawT === 'number' ? rawT : (new Date(rawT).getTime() / 1000);
          const mVal = macdLine[i] || 0;
          const sVal = signalLine[i] || 0;
          histArr.push({ time: numT, value: mVal - sVal });
          return {
            time: numT,
            high: Number(c.high || c.close || 0),
            low: Number(c.low || c.close || 0),
            close: Number(c.close || 0)
          };
        });

        const divMode = (params.divergenceMode as any) || 'swing_pivots';
        const divs = calculateMACDDivergences(candleData, histArr, divLookback, divMinBars, 2, true, divMode);

        const isDivergenceRecent = (div: any): boolean => {
          if (!div) return false;
          const peakIdx = candleData.findIndex((c: any) => c.time === div.t2);
          if (peakIdx < 0) return false;
          const barsSincePeak = (candleData.length - 1) - peakIdx;
          return barsSincePeak >= 2 && barsSincePeak <= 4;
        };

        const matchingBull = divs.filter(d => d.type === 'BULLISH').find(d => isDivergenceRecent(d));
        const matchingBear = divs.filter(d => d.type === 'BEARISH').find(d => isDivergenceRecent(d));

        if (subNorm === 'divergence_bullish' || subNorm === 'divergencia_alta' || subNorm === 'sinal_compra') {
          const isBull = Boolean(matchingBull);
          return { val: isBull ? 'compra' : 'neutro', num: isBull ? 1 : 0 };
        }
        if (subNorm === 'divergence_bearish' || subNorm === 'divergencia_baixa' || subNorm === 'sinal_venda') {
          const isBear = Boolean(matchingBear);
          return { val: isBear ? 'venda' : 'neutro', num: isBear ? 1 : 0 };
        }
        if (subNorm === 'divergence_trend' || subNorm === 'divergencia_tendencia' || subNorm === 'divergence' || subNorm === 'divergencia') {
          if (matchingBull) return { val: 'compra', num: 1 };
          if (matchingBear) return { val: 'venda', num: -1 };
          return { val: 'neutro', num: 0 };
        }
      }

      let val = 0;
      const idx = activeHist.length - 1;
      if (idx >= 0) {
        if (subSeries === 'line') val = macdLine[idx];
        else if (subSeries === 'signal') val = signalLine[idx];
        else val = (macdLine[idx] || 0) - (signalLine[idx] || 0);
      }
      return { val, num: val };
    }

    if (normKey === 'bollinger') {
      const period = params.period || 20;
      const stdDevMult = params.stdDev || params.multiplier || params.atrMultiplier || 2.0;
      if (activeHist.length < period) return { val: 0, num: 0 };
      const slice = activeHist.slice(-period);
      const mean = slice.reduce((sum, c) => sum + (c.close || 0), 0) / period;
      const variance = slice.reduce((sum, c) => sum + Math.pow((c.close || 0) - mean, 2), 0) / period;
      const stdDev = Math.sqrt(variance);

      const subNorm = String(subSeries || '').toLowerCase().trim();
      let val = mean;
      if (subNorm.includes('upper') || subNorm.includes('superior') || subNorm.includes('topo') || subNorm.includes('high') || subNorm === '1') {
        val = mean + stdDev * stdDevMult;
      } else if (subNorm.includes('lower') || subNorm.includes('inferior') || subNorm.includes('fundo') || subNorm.includes('low') || subNorm === '2') {
        val = mean - stdDev * stdDevMult;
      }
      return { val, num: val };
    }

    if (normKey === 'tma') {
      const period = params.period || param || 20;
      const mult = params.atrMultiplier || params.mult || params.multiplier || params.stdDev || 2.0;
      if (activeHist.length < period) return { val: 0, num: 0 };
      const halfPeriod = Math.ceil((period + 1) / 2);

      // Otimização de Performance: TMA no candle atual depende apenas dos últimos candles necessários
      const neededLookback = Math.max(period + 20, halfPeriod * 2 + 16);
      const histSlice = activeHist.length > neededLookback ? activeHist.slice(-neededLookback) : activeHist;

      const prices = histSlice.map(c => Number(c.close || 0));
      const sma1: number[] = [];
      for (let i = 0; i < prices.length; i++) {
        if (i < halfPeriod - 1) { sma1.push(prices[i]); continue; }
        let sum = 0;
        for (let j = 0; j < halfPeriod; j++) sum += prices[i - j];
        sma1.push(sum / halfPeriod);
      }
      let sum = 0;
      const lastIdx = prices.length - 1;
      for (let j = 0; j < halfPeriod; j++) sum += sma1[lastIdx - j];
      const tmaVal = sum / halfPeriod;

      let atr = 0;
      const lookback = Math.min(lastIdx, 14);
      for (let k = lastIdx - lookback + 1; k <= lastIdx; k++) {
        if (k > 0) {
          const h = Number(histSlice[k].high || histSlice[k].close);
          const l = Number(histSlice[k].low || histSlice[k].close);
          const prevC = Number(histSlice[k - 1].close);
          atr += Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
        }
      }
      atr = atr / (lookback || 1);

      const subNorm = String(subSeries || '').toLowerCase().trim();
      let val = tmaVal;
      if (subNorm.includes('range') || subNorm.includes('tamanho') || subNorm.includes('largura') || subNorm.includes('width')) {
        // Range / Tamanho do canal em pontos entre a banda superior e a banda inferior
        val = (atr * mult) * 2;
      } else if (subNorm.includes('upper') || subNorm.includes('superior') || subNorm.includes('topo') || subNorm.includes('high') || subNorm === '1') {
        val = tmaVal + atr * mult;
      } else if (subNorm.includes('lower') || subNorm.includes('inferior') || subNorm.includes('fundo') || subNorm.includes('low') || subNorm === '2') {
        val = tmaVal - atr * mult;
      }
      return { val, num: val };
    }

    if (normKey === 'forca_momentum' || normKey === 'momentum_forca') {
      const assetKey = String(params.asset || 'total').toLowerCase();
      const regKey = assetKey === 'total' ? 'momentum_forca_total' : `momentum_forca_${assetKey}`;
      if (activeReg[regKey] !== undefined) {
        const val = activeReg[regKey];
        return { val, num: parseNum(val) };
      }
      // Cálculo dinâmico para Replay/Backtest baseado na ação de preço dos candles
      const period = 14;
      const slice = activeHist.slice(-period);
      if (slice.length < 2) return { val: 50, num: 50 };
      const firstClose = slice[0].close || slice[0].open || 1;
      const lastClose = slice[slice.length - 1].close || firstClose;
      const pctChange = ((lastClose - firstClose) / firstClose) * 100;
      let rawMom = 50 + pctChange * 15;
      if (assetKey === 'vix') rawMom = 100 - rawMom; // VIX move em direção oposta ao mercado
      else if (assetKey === 'tesla' || assetKey === 'nvidia') rawMom = 50 + pctChange * 20; // Maior volatilidade
      const momVal = Math.min(98, Math.max(2, Math.round(rawMom * 10) / 10));
      return { val: momVal, num: momVal };
    }

    if (['sentiment', 'market_sentiment', 'sentiment_macro', 'sentiment_micro'].includes(normKey)) {
      if (activeReg[normKey] !== undefined) {
        const val = activeReg[normKey];
        return { val, num: parseNum(val) };
      }
      // Sentimento dinâmico no Replay (0-100%) baseado no preço vs SMA20
      const period = 20;
      const slice = activeHist.slice(-period);
      if (slice.length < 2) return { val: 50, num: 50 };
      const sma = slice.reduce((sum, c) => sum + (c.close || 0), 0) / slice.length;
      const lastClose = slice[slice.length - 1].close || sma;
      const diffPct = sma !== 0 ? ((lastClose - sma) / sma) * 100 : 0;
      const sentVal = Math.min(95, Math.max(5, Math.round((50 + diffPct * 25) * 10) / 10));
      return { val: sentVal, num: sentVal };
    }

    if (normKey === 'estado') {
      if (activeReg['estado'] !== undefined && activeReg['estado'] !== '') {
        const val = activeReg['estado'];
        return { val, num: null };
      }
      // Cálculo dinâmico do Acelerômetro (Estado Operacional) para Replay/Backtest
      const period = 20;
      const slice = activeHist.slice(-period);
      if (slice.length < 2) return { val: 'AGUARDANDO', num: null };
      const closes = slice.map(c => Number(c.close || 0));
      const ema12 = calculateEMAValues(slice, 12);
      const ema26 = calculateEMAValues(slice, 26);
      const hist = (ema12[ema12.length - 1] || 0) - (ema26[ema26.length - 1] || 0);
      const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
      const variance = closes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / closes.length;
      const stdDev = Math.sqrt(variance);
      const threshold = stdDev * 0.15;
      const z = stdDev > 0 ? (closes[closes.length - 1] - mean) / stdDev : 0;

      let estVal = 'NORMAL';
      if (z >= 2.0) estVal = 'EXAUSTÃO COMPRA';
      else if (z <= -2.0) estVal = 'EXAUSTÃO VENDA';
      else if (hist > threshold * 1.5) estVal = 'EXPLOSÃO COMPRA';
      else if (hist < -threshold * 1.5) estVal = 'EXPLOSÃO VENDA';
      else if (hist > 0) estVal = 'COMPRA';
      else if (hist < 0) estVal = 'VENDA';

      return { val: estVal, num: null };
    }

    if (normKey === 'elliottwaves' || normKey === 'elliott_waves') {
      const rawWave = String(activeReg['wave'] || activeReg['elliott_wave'] || '1').toUpperCase();
      if (subSeries.startsWith('wave_')) {
        const targetWave = subSeries.replace('wave_', '').toUpperCase();
        const isMatch = rawWave === targetWave;
        return { val: isMatch ? targetWave : 'neutro', num: isMatch ? 1 : 0 };
      }
      return { val: rawWave, num: parseNum(rawWave) };
    }

    if (normKey === 'supertrend') {
      const period = Number(params.atrPeriod || params.period || param || 10);
      const factor = Number(params.multiplier || params.factor || 3.0);
      if (activeHist.length <= period) return { val: 0, num: 0 };

      // 1. True Range (TR)
      const trList: number[] = [activeHist[0].high - activeHist[0].low];
      for (let i = 1; i < activeHist.length; i++) {
        const h = activeHist[i].high;
        const l = activeHist[i].low;
        const prevC = activeHist[i - 1].close;
        trList.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));
      }

      // 2. Wilder's RMA ATR (Padrão Oficial TradingView)
      const atrList: number[] = new Array(activeHist.length).fill(0);
      let initialSum = 0;
      for (let i = 0; i < period; i++) {
        initialSum += trList[i];
      }
      let prevAtr = initialSum / period;
      atrList[period - 1] = prevAtr;

      for (let i = period; i < activeHist.length; i++) {
        const curAtr = (prevAtr * (period - 1) + trList[i]) / period;
        atrList[i] = curAtr;
        prevAtr = curAtr;
      }

      // 3. Supertrend Bands (TradingView Algorithm)
      const upperBand: number[] = new Array(activeHist.length).fill(0);
      const lowerBand: number[] = new Array(activeHist.length).fill(0);
      const trendArr: number[] = new Array(activeHist.length).fill(1);

      const hl2_0 = (activeHist[period - 1].high + activeHist[period - 1].low) / 2;
      const atr_0 = atrList[period - 1];
      upperBand[period - 1] = hl2_0 + factor * atr_0;
      lowerBand[period - 1] = hl2_0 - factor * atr_0;
      trendArr[period - 1] = activeHist[period - 1].close >= hl2_0 ? 1 : -1;

      let supertrendVal = 0;
      let isBuyFlip = false;
      let isSellFlip = false;

      for (let i = period; i < activeHist.length; i++) {
        const hl2 = (activeHist[i].high + activeHist[i].low) / 2;
        const atr = atrList[i];
        const basicUpper = hl2 + factor * atr;
        const basicLower = hl2 - factor * atr;

        const prevUpper = upperBand[i - 1];
        const prevLower = lowerBand[i - 1];
        const prevClose = activeHist[i - 1].close;
        const prevTrend = trendArr[i - 1];

        const currLower = (prevClose > prevLower) ? Math.max(basicLower, prevLower) : basicLower;
        const currUpper = (prevClose < prevUpper) ? Math.min(basicUpper, prevUpper) : basicUpper;

        lowerBand[i] = currLower;
        upperBand[i] = currUpper;

        let currTrend = prevTrend;
        if (prevTrend === 1 && activeHist[i].close < prevLower) {
          currTrend = -1;
        } else if (prevTrend === -1 && activeHist[i].close > prevUpper) {
          currTrend = 1;
        }
        trendArr[i] = currTrend;

        if (i === activeHist.length - 1) {
          isBuyFlip = (prevTrend === -1 && currTrend === 1);
          isSellFlip = (prevTrend === 1 && currTrend === -1);
          supertrendVal = currTrend === 1 ? currLower : currUpper;
        }
      }

      const trend = trendArr[activeHist.length - 1] || 1;

      if (subSeries === 'signal_buy' || subSeries === 'sinal_compra') {
        return { val: isBuyFlip ? 'compra' : 'neutro', num: isBuyFlip ? 1 : 0 };
      }
      if (subSeries === 'signal_sell' || subSeries === 'sinal_venda') {
        return { val: isSellFlip ? 'venda' : 'neutro', num: isSellFlip ? 1 : 0 };
      }
      if (subSeries === 'trend' || subSeries === 'tendencia') {
        const tStr = trend === 1 ? 'compra' : 'venda';
        return { val: tStr, num: trend };
      }
      return { val: supertrendVal, num: supertrendVal };
    }

    if (normKey === 'axion_trend' || normKey === 'axiontrend' || normKey.startsWith('axion_trend_')) {
      const sliceHist = activeHist.length > 220 ? activeHist.slice(-220) : activeHist;
      const axRes = calculateAxionTrend(sliceHist, params);
      const lastBar = axRes.last;
      if (!lastBar) return { val: 'neutro', num: 0 };

      const subNorm = String(subSeries || '').toLowerCase().trim();

      if (normKey === 'axion_trend_arrows' || subNorm === 'signal_arrow' || subNorm === 'arrows' || subNorm === 'setas' || subNorm === 'sinal') {
        const sig = lastBar.arrowSignal;
        const num = sig === 'compra' ? 1 : sig === 'venda' ? -1 : 0;
        return { val: sig, num };
      }

      if (normKey === 'axion_trend_candles' || subNorm === 'candle_trend' || subNorm === 'candles' || subNorm === 'cor_candle') {
        const cTrend = lastBar.candleTrend;
        const num = cTrend === 'compra' ? 1 : cTrend === 'venda' ? -1 : 0;
        return { val: cTrend, num };
      }

      if (normKey === 'axion_trend_conciliated' || subNorm === 'conciliated_trend' || subNorm === 'conciliated_signal' || subNorm === 'conciliacao' || subNorm === 'conciliated') {
        if (subNorm === 'conciliated_signal') {
          const cSig = lastBar.conciliatedSignal;
          const num = cSig === 'compra' ? 1 : cSig === 'venda' ? -1 : 0;
          return { val: cSig, num };
        }
        const cTrend = lastBar.conciliatedTrend;
        const num = cTrend === 'compra' ? 1 : cTrend === 'venda' ? -1 : 0;
        return { val: cTrend, num };
      }

      if (subNorm === 'macdbb_zero_trend') {
        const zTrend = lastBar.macdbbZeroTrend;
        const num = zTrend === 'compra' ? 1 : zTrend === 'venda' ? -1 : 0;
        return { val: zTrend, num };
      }

      if (subNorm === 'macdbb_state') {
        const mState = lastBar.macdbbState;
        const num = mState === 'compra' ? 1 : mState === 'venda' ? -1 : 0;
        return { val: mState, num };
      }

      if (subNorm === 'bullbear_signal' || subNorm === 'bullbear_trend') {
        const bVal = subNorm === 'bullbear_signal' ? lastBar.bullBearSignal : lastBar.bullBearTrend;
        const num = bVal === 'compra' ? 1 : bVal === 'venda' ? -1 : 0;
        return { val: bVal, num };
      }

      if (subNorm === 'macdbb_line') return { val: lastBar.macdbbLine, num: lastBar.macdbbLine };
      if (subNorm === 'macd_diff') return { val: lastBar.rsmMacdDiff, num: lastBar.rsmMacdDiff };
      if (subNorm === 'bb_upper') return { val: lastBar.macdbbUpper, num: lastBar.macdbbUpper };
      if (subNorm === 'bb_lower') return { val: lastBar.macdbbLower, num: lastBar.macdbbLower };
      if (subNorm === 'bb_midline') return { val: lastBar.macdbbMidline, num: lastBar.macdbbMidline };

      const defSig = lastBar.arrowSignal;
      return { val: defSig, num: defSig === 'compra' ? 1 : defSig === 'venda' ? -1 : 0 };
    }

    if (['price', 'preco', 'close', 'fechamento'].includes(normKey)) {
      const val = isPrev ? prevCandleClose : lastCandleClose;
      return { val, num: val };
    }

    const refPrice = isPrev ? prevCandleClose : lastCandleClose;

    // Handlers para Níveis Gamma roteados pelo subSeries para as chaves corretas do registry
    if (normKey === 'levels_gamma') {
      const subMap: Record<string, string> = { hvl: 'gamma_hvl', gwall: 'gamma_gwall', hvl0: 'gamma_hvl0' };
      const sub = (subSeries || '').toLowerCase().trim();
      if (!sub || sub === 'any' || sub === 'todos') {
        const pool = [Number(activeReg['gamma_hvl'] || 0), Number(activeReg['gamma_gwall'] || 0), Number(activeReg['gamma_hvl0'] || 0)].filter(v => v > 0);
        if (pool.length > 0) {
          const closest = pool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
          return { val: closest, num: closest };
        }
      }
      const regKey = subMap[sub] || 'gamma_hvl';
      const val = activeReg[regKey] !== undefined ? Number(activeReg[regKey]) : 0;
      return { val, num: val };
    }
    if (normKey === 'levels_options') {
      const subMap: Record<string, string> = { call: 'gamma_call', put: 'gamma_put', call0: 'gamma_call0', put0: 'gamma_put0' };
      const sub = (subSeries || '').toLowerCase().trim();
      if (!sub || sub === 'any' || sub === 'todos') {
        const pool = [Number(activeReg['gamma_call'] || 0), Number(activeReg['gamma_put'] || 0), Number(activeReg['gamma_call0'] || 0), Number(activeReg['gamma_put0'] || 0)].filter(v => v > 0);
        if (pool.length > 0) {
          const closest = pool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
          return { val: closest, num: closest };
        }
      }
      const regKey = subMap[sub] || 'gamma_call';
      const val = activeReg[regKey] !== undefined ? Number(activeReg[regKey]) : 0;
      return { val, num: val };
    }
    if (normKey === 'levels_daily') {
      const subMap: Record<string, string> = { max1d: 'gamma_max1d', min1d: 'gamma_min1d', prev: 'gamma_prev', prevh: 'gamma_prevH', prevl: 'gamma_prevL' };
      const sub = (subSeries || '').toLowerCase().trim();
      if (!sub || sub === 'any' || sub === 'todos') {
        const pool = [Number(activeReg['gamma_max1d'] || 0), Number(activeReg['gamma_min1d'] || 0), Number(activeReg['gamma_prev'] || 0), Number(activeReg['gamma_prevH'] || 0), Number(activeReg['gamma_prevL'] || 0)].filter(v => v > 0);
        if (pool.length > 0) {
          const closest = pool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
          return { val: closest, num: closest };
        }
      }
      const regKey = subMap[sub] || 'gamma_max1d';
      const val = activeReg[regKey] !== undefined ? Number(activeReg[regKey]) : 0;
      return { val, num: val };
    }
    if (normKey === 'gammalevels') {
      const subMap: Record<string, string> = {
        hvl: 'gamma_hvl', gwall: 'gamma_gwall', hvl0: 'gamma_hvl0',
        call: 'gamma_call', put: 'gamma_put', call0: 'gamma_call0', put0: 'gamma_put0',
        max1d: 'gamma_max1d', min1d: 'gamma_min1d', prev: 'gamma_prev', prevh: 'gamma_prevH', prevl: 'gamma_prevL'
      };
      const sub = (subSeries || '').toLowerCase().trim();
      if (!sub || sub === 'any' || sub === 'todos') {
        const pool = [
          Number(activeReg['gamma_hvl'] || 0), Number(activeReg['gamma_gwall'] || 0), Number(activeReg['gamma_hvl0'] || 0),
          Number(activeReg['gamma_call'] || 0), Number(activeReg['gamma_put'] || 0), Number(activeReg['gamma_call0'] || 0), Number(activeReg['gamma_put0'] || 0),
          Number(activeReg['gamma_max1d'] || 0), Number(activeReg['gamma_min1d'] || 0), Number(activeReg['gamma_prev'] || 0), Number(activeReg['gamma_prevH'] || 0), Number(activeReg['gamma_prevL'] || 0)
        ].filter(v => v > 0);
        if (pool.length > 0) {
          const closest = pool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
          return { val: closest, num: closest };
        }
      }
      const regKey = subMap[sub] || 'gamma_hvl';
      const val = activeReg[regKey] !== undefined ? Number(activeReg[regKey]) : 0;
      return { val, num: val };
    }
    if (normKey === 'nearest_resistance') {
      const val = activeReg['nearest_resistance'] !== undefined ? Number(activeReg['nearest_resistance']) : 0;
      return { val, num: val };
    }
    if (normKey === 'nearest_support') {
      const val = activeReg['nearest_support'] !== undefined ? Number(activeReg['nearest_support']) : 0;
      return { val, num: val };
    }
    if (normKey === 'distance_to_resistance') {
      const val = activeReg['distance_to_resistance'] !== undefined ? Number(activeReg['distance_to_resistance']) : 9999;
      return { val, num: val };
    }
    if (normKey === 'distance_to_support') {
      const val = activeReg['distance_to_support'] !== undefined ? Number(activeReg['distance_to_support']) : 9999;
      return { val, num: val };
    }
    if (normKey === 'levels_liquidity') {
      const sub = (subSeries || '').toLowerCase().trim();
      const blPool = [
        Number(activeReg['gamma_bl1'] || 0), Number(activeReg['gamma_bl2'] || 0),
        Number(activeReg['gamma_bl3'] || 0), Number(activeReg['gamma_bl4'] || 0),
        Number(activeReg['gamma_bl5'] || 0)
      ].filter(v => v > 0);
      const gexPool = [
        Number(activeReg['gamma_gex1'] || 0), Number(activeReg['gamma_gex2'] || 0),
        Number(activeReg['gamma_gex3'] || 0)
      ].filter(v => v > 0);

      if (!sub || sub === 'all' || sub === 'todos' || sub === 'any') {
        const pool = [...blPool, ...gexPool];
        if (pool.length > 0) {
          const closest = pool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
          return { val: closest, num: closest };
        }
      }
      if (sub === 'all_bl') {
        if (blPool.length > 0) {
          const closest = blPool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
          return { val: closest, num: closest };
        }
      }
      if (sub === 'all_gex') {
        if (gexPool.length > 0) {
          const closest = gexPool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
          return { val: closest, num: closest };
        }
      }
      const subMap: Record<string, string> = {
        bl1: 'gamma_bl1', bl2: 'gamma_bl2', bl3: 'gamma_bl3', bl4: 'gamma_bl4', bl5: 'gamma_bl5',
        gex1: 'gamma_gex1', gex2: 'gamma_gex2', gex3: 'gamma_gex3'
      };
      const regKey = subMap[sub] || `gamma_${sub}`;
      const val = activeReg[regKey] !== undefined ? Number(activeReg[regKey]) : 0;
      return { val, num: val };
    }

    if (normKey === 'volume_levels') {
      const sub = (subSeries || '').toLowerCase().trim();
      let poc = Number(activeReg['vpoc'] || 0);
      let vah = Number(activeReg['vah'] || 0);
      let val = Number(activeReg['val_level'] || 0);
      let nakedList: any[] = Array.isArray(activeReg['naked_pocs']) ? activeReg['naked_pocs'] : [];

      if (params && (params.sessionMode === 'bars' || params.sessionMode === 'custom' || (params.lookbackDays && params.lookbackDays !== 1) || (params.valueAreaPct && params.valueAreaPct !== 70))) {
        const customVp = calculateVolumeProfileAnalysis(activeHist, {
          sessionMode: params.sessionMode || 'all',
          customStart: params.customStart || '09:00',
          customEnd: params.customEnd || '18:00',
          lookbackDays: params.lookbackDays || 1,
          lookbackBars: params.lookbackBars || 30,
          valueAreaPct: params.valueAreaPct || 70
        });
        if (customVp?.levels) {
          poc = customVp.levels.poc || 0;
          vah = customVp.levels.vah || 0;
          val = customVp.levels.val || 0;
          nakedList = customVp.levels.nakedPocs || [];
        }
      }

      const nakedPrices = nakedList.map((p: any) => Number(p.price || 0)).filter(p => p > 0);

      if (!sub || sub === 'all' || sub === 'todos' || sub === 'any') {
        const pool = [poc, vah, val, ...nakedPrices].filter(p => p > 0);
        if (pool.length > 0) {
          const closest = pool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
          return { val: closest, num: closest };
        }
        return { val: poc || refPrice, num: poc || refPrice };
      }
      if (sub === 'all_naked_pocs' || sub === 'naked_pocs' || sub === 'todos_naked') {
        if (nakedPrices.length > 0) {
          const closest = nakedPrices.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
          return { val: closest, num: closest };
        }
        return { val: 0, num: 0 };
      }
      if (sub === 'poc' || sub === 'vpoc') {
        return { val: poc, num: poc };
      }
      if (sub === 'vah') {
        return { val: vah, num: vah };
      }
      if (sub === 'val') {
        return { val: val, num: val };
      }
      if (sub === 'naked_poc1') {
        const p1 = Number(nakedPrices[0] || activeReg['naked_poc1'] || 0);
        return { val: p1, num: p1 };
      }
      if (sub === 'naked_poc2') {
        const p2 = Number(nakedPrices[1] || activeReg['naked_poc2'] || 0);
        return { val: p2, num: p2 };
      }
      if (sub === 'naked_poc3') {
        const p3 = Number(nakedPrices[2] || activeReg['naked_poc3'] || 0);
        return { val: p3, num: p3 };
      }
      if (sub === 'dist_poc') {
        const dist = Math.abs(refPrice - poc);
        return { val: dist, num: dist };
      }
      if (sub === 'dist_vah') {
        const dist = Math.abs(refPrice - vah);
        return { val: dist, num: dist };
      }
      if (sub === 'dist_val') {
        const dist = Math.abs(refPrice - val);
        return { val: dist, num: dist };
      }
      if (sub === 'dist_naked_poc') {
        if (nakedPrices.length > 0) {
          const closest = nakedPrices.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
          const dist = Math.abs(refPrice - closest);
          return { val: dist, num: dist };
        }
        return { val: 9999, num: 9999 };
      }
      return { val: poc, num: poc };
    }

    if (normKey === 'volume_hvn_blocks' || normKey === 'hvn_blocks' || normKey === 'hvn') {
      const sub = (subSeries || '').toLowerCase().trim();
      let hvnList: any[] = Array.isArray(activeReg['hvn_blocks']) ? activeReg['hvn_blocks'] : [];

      if (params && (params.sessionMode === 'bars' || params.sessionMode === 'custom' || (params.lookbackDays && params.lookbackDays !== 1) || params.topNodesCount || params.blockThicknessPct)) {
        const customVp = calculateVolumeProfileAnalysis(activeHist, {
          sessionMode: params.sessionMode || 'all',
          customStart: params.customStart || '09:00',
          customEnd: params.customEnd || '18:00',
          lookbackDays: params.lookbackDays || 1,
          lookbackBars: params.lookbackBars || 30,
          topNodesCount: params.topNodesCount || 6,
          blockThicknessPct: params.blockThicknessPct || 0.5
        });
        if (customVp?.hvnBlocks) {
          hvnList = customVp.hvnBlocks;
        }
      }

      const centers = hvnList.map((b: any) => Number(b.priceCenter || 0)).filter(p => p > 0);

      if (!sub || sub === 'all' || sub === 'todos' || sub === 'any') {
        if (centers.length > 0) {
          const closest = centers.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
          return { val: closest, num: closest };
        }
        return { val: refPrice, num: refPrice };
      }
      if (sub === 'dist_nearest') {
        if (centers.length > 0) {
          const closest = centers.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
          const dist = Math.abs(refPrice - closest);
          return { val: dist, num: dist };
        }
        return { val: 9999, num: 9999 };
      }
      if (sub === 'inside_any') {
        const isInside = hvnList.some((b: any) => refPrice >= b.priceBottom && refPrice <= b.priceTop);
        return { val: isInside ? 'sim' : 'nao', num: isInside ? 1 : 0 };
      }

      // Níveis específicos (hvn1, hvn1_top, hvn1_bottom, etc.)
      const match = sub.match(/^hvn(\d+)(?:_(center|top|bottom))?$/);
      if (match) {
        const rank = parseInt(match[1], 10);
        const part = match[2] || 'center';
        const blk = hvnList.find((b: any) => b.rank === rank) || hvnList[rank - 1];
        if (blk) {
          const v = part === 'top' ? blk.priceTop : part === 'bottom' ? blk.priceBottom : blk.priceCenter;
          return { val: v, num: v };
        }
        const regVal = Number(activeReg[`hvn${rank}_${part}`] || activeReg[`hvn${rank}_center`] || 0);
        return { val: regVal, num: regVal };
      }

      return { val: centers[0] || refPrice, num: centers[0] || refPrice };
    }

    if (normKey === 'vwap') {
      const resetMode = params.resetMode || 'session_1900';
      let sessionStartStr = String(params.sessionStart || '19:00').slice(0, 5);
      if (resetMode === 'session_1900') sessionStartStr = '19:00';
      else if (resetMode === 'session_1800') sessionStartStr = '18:00';
      else if (resetMode === 'session_0930') sessionStartStr = '09:30';
      else if (resetMode === 'daily_utc') sessionStartStr = '00:00';

      const cycleStartFull = sessionStartStr.includes(':') ? (sessionStartStr.split(':').length === 2 ? `${sessionStartStr}:00` : sessionStartStr) : '19:00:00';

      const lastCandle: any = activeHist[activeHist.length - 1];
      const lastTime = lastCandle ? (lastCandle.timestamp || (typeof lastCandle.time === 'number' ? lastCandle.time * 1000 : lastCandle.time)) : null;
      const currentSessionKey = lastTime ? getTradingSessionKey(lastTime, cycleStartFull) : '';

      let sumPV = 0;
      let sumV = 0;
      for (let i = 0; i < activeHist.length; i++) {
        const c: any = activeHist[i];
        const cTime = c.timestamp || (typeof c.time === 'number' ? c.time * 1000 : c.time);
        if (cTime && currentSessionKey) {
          if (getTradingSessionKey(cTime, cycleStartFull) !== currentSessionKey) {
            continue;
          }
        }
        const p = (Number(c.high || 0) + Number(c.low || 0) + Number(c.close || 0)) / 3;
        const v = Number(c.volume || 1);
        sumPV += p * v;
        sumV += v;
      }
      const val = sumV > 0 ? sumPV / sumV : (activeHist[activeHist.length - 1]?.close || 0);
      return { val, num: val };
    }

    if (normKey === 'levels_session_percent') {
      const stepPct = Number(params.stepPercent || 0.5);
      const center = Number(activeReg['candle_open'] || activeReg['open'] || activeHist[0]?.open || activeHist[0]?.close || refPrice);
      const sub = (subSeries || '').toLowerCase();
      const u1 = center * (1 + stepPct / 100);
      const u2 = center * (1 + (2 * stepPct) / 100);
      const u3 = center * (1 + (3 * stepPct) / 100);
      const l1 = center * (1 - stepPct / 100);
      const l2 = center * (1 - (2 * stepPct) / 100);
      const l3 = center * (1 - (3 * stepPct) / 100);

      if (!sub || sub === 'all' || sub === 'todos' || sub === 'any') {
        const pool = [center, u1, u2, u3, l1, l2, l3].filter(p => p > 0);
        if (pool.length > 0) {
          const closest = pool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
          return { val: closest, num: closest };
        }
        return { val: center, num: center };
      }
      if (sub === 'center') return { val: center, num: center };
      if (sub === 'upper1') return { val: u1, num: u1 };
      if (sub === 'upper2') return { val: u2, num: u2 };
      if (sub === 'upper3') return { val: u3, num: u3 };
      if (sub === 'lower1') return { val: l1, num: l1 };
      if (sub === 'lower2') return { val: l2, num: l2 };
      if (sub === 'lower3') return { val: l3, num: l3 };
      return { val: center, num: center };
    }

    if (normKey === 'levels_time_range') {
      const isAll = params.sessionMode === 'all' || params.useFullSession === true;
      const startTime = isAll ? '19:00' : String(params.startTime || '09:00');
      const endTime = isAll ? '18:00' : String(params.endTime || '09:30');

      const lastCandle = activeHist[activeHist.length - 1];
      const lastTime = lastCandle ? (lastCandle.timestamp || (typeof (lastCandle as any).time === 'number' ? (lastCandle as any).time * 1000 : (lastCandle as any).time)) : null;
      const currentSessionKey = lastTime ? getTradingSessionKey(lastTime, '19:00:00') : '';

      const filtered = activeHist.filter(c => {
        const cTime = c.timestamp || (typeof (c as any).time === 'number' ? (c as any).time * 1000 : (c as any).time);
        if (!cTime) return isAll;
        if (currentSessionKey && getTradingSessionKey(cTime, '19:00:00') !== currentSessionKey) {
          return false;
        }
        if (isAll) return true;
        const d = getSaoPauloDate(cTime);
        const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        if (startTime <= endTime) {
          return hhmm >= startTime && hhmm <= endTime;
        } else {
          return hhmm >= startTime || hhmm <= endTime;
        }
      });
      const rangeCandles = filtered.length > 0 ? filtered : (lastCandle ? [lastCandle] : activeHist);
      const highs = rangeCandles.map(c => Number(c.high || c.close || 0));
      const lows = rangeCandles.map(c => Number(c.low || c.close || 0));
      const maxH = Math.max(...highs);
      const minL = Math.min(...lows);
      const mid = (maxH + minL) / 2;

      activeReg['time_range_high'] = maxH;
      activeReg['time_range_mid'] = mid;
      activeReg['time_range_low'] = minL;

      const sub = (subSeries || '').toLowerCase();
      if (!sub || sub === 'all' || sub === 'todos' || sub === 'any') {
        const pool = [maxH, mid, minL].filter(v => v > 0);
        if (pool.length > 0) {
          const closest = pool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
          return { val: closest, num: closest };
        }
      }
      let val = mid;
      if (sub === 'high') val = maxH;
      else if (sub === 'low') val = minL;
      return { val, num: val };
    }

    if (['buyvolume', 'sellvolume', 'delta', 'deltaratio'].includes(normKey)) {
      const lastC = activeHist[activeHist.length - 1] || {};
      const totV = Number(lastC.volume || 100);
      const isBull = Number(lastC.close || 0) >= Number(lastC.open || 0);
      const bVol = Number((lastC as any).buyVolume || (lastC as any).buy_volume || (isBull ? totV * 0.7 : totV * 0.3));
      const sVol = Number((lastC as any).sellVolume || (lastC as any).sell_volume || (isBull ? totV * 0.3 : totV * 0.7));
      if (normKey === 'buyvolume') return { val: bVol, num: bVol };
      if (normKey === 'sellvolume') return { val: sVol, num: sVol };
      if (normKey === 'delta') return { val: bVol - sVol, num: bVol - sVol };
      if (normKey === 'deltaratio') {
        const ratio = totV > 0 ? (bVol - sVol) / totV : 0;
        return { val: ratio, num: ratio };
      }
    }

    if (normKey === 'smc_ob') {
      const sub = (subSeries || '').toLowerCase();
      const isDemand = sub === 'demand';
      let obVal = activeHist[activeHist.length - 1]?.close || 0;
      for (let i = activeHist.length - 2; i >= 0; i--) {
        const c = activeHist[i];
        if (isDemand && (c.close || 0) < (c.open || 0)) {
          obVal = c.low || c.close || 0;
          break;
        } else if (!isDemand && (c.close || 0) > (c.open || 0)) {
          obVal = c.high || c.close || 0;
          break;
        }
      }
      return { val: obVal, num: obVal };
    }

    if (normKey === 'smc_bos_choch') {
      const swingLen = Math.max(2, Math.min(20, Number(params.swingLength || 5)));
      let lastSwingHigh: { index: number; price: number } | null = null;
      let lastSwingLow: { index: number; price: number } | null = null;
      let currentTrend: 1 | -1 = 1;
      let targetBOS: 'compra' | 'venda' | 'neutro' = 'neutro';
      let targetCHoCH: 'compra' | 'venda' | 'neutro' = 'neutro';
      let lastBreakPrice = 0;

      const targetIdx = activeHist.length - 1;

      for (let i = 0; i < activeHist.length; i++) {
        const p = i - swingLen;
        if (p >= swingLen) {
          let isHigh = true;
          let isLow = true;
          const pH = Number(activeHist[p].high || 0);
          const pL = Number(activeHist[p].low || 0);
          for (let k = 1; k <= swingLen; k++) {
            if (pH <= Number(activeHist[p - k].high || 0) || pH <= Number(activeHist[p + k].high || 0)) isHigh = false;
            if (pL >= Number(activeHist[p - k].low || 0) || pL >= Number(activeHist[p + k].low || 0)) isLow = false;
          }

          if (isHigh) {
            lastSwingHigh = { index: p, price: pH };
          }
          if (isLow) {
            lastSwingLow = { index: p, price: pL };
          }
        }

        // Avaliar rompimento na barra i
        const closeI = Number(activeHist[i].close || 0);
        if (lastSwingHigh && closeI > lastSwingHigh.price) {
          const isBOS = currentTrend === 1;
          if (i === targetIdx) {
            if (isBOS) targetBOS = 'compra';
            else targetCHoCH = 'compra';
          }
          lastBreakPrice = lastSwingHigh.price;
          currentTrend = 1;
          lastSwingHigh = null;
        } else if (lastSwingLow && closeI < lastSwingLow.price) {
          const isBOS = currentTrend === -1;
          if (i === targetIdx) {
            if (isBOS) targetBOS = 'venda';
            else targetCHoCH = 'venda';
          }
          lastBreakPrice = lastSwingLow.price;
          currentTrend = -1;
          lastSwingLow = null;
        }
      }

      const sub = String(subSeries || '').toLowerCase().trim();
      if (sub === 'bos') {
        return { val: targetBOS, num: targetBOS === 'compra' ? 1 : targetBOS === 'venda' ? -1 : 0 };
      }
      if (sub === 'choch') {
        return { val: targetCHoCH, num: targetCHoCH === 'compra' ? 1 : targetCHoCH === 'venda' ? -1 : 0 };
      }
      if (sub === 'bos_bullish') {
        const match = targetBOS === 'compra' ? 'compra' : 'neutro';
        return { val: match, num: match === 'compra' ? 1 : 0 };
      }
      if (sub === 'bos_bearish') {
        const match = targetBOS === 'venda' ? 'venda' : 'neutro';
        return { val: match, num: match === 'venda' ? 1 : 0 };
      }
      if (sub === 'choch_bullish') {
        const match = targetCHoCH === 'compra' ? 'compra' : 'neutro';
        return { val: match, num: match === 'compra' ? 1 : 0 };
      }
      if (sub === 'choch_bearish') {
        const match = targetCHoCH === 'venda' ? 'venda' : 'neutro';
        return { val: match, num: match === 'venda' ? 1 : 0 };
      }
      if (sub === 'price') {
        return { val: lastBreakPrice, num: lastBreakPrice };
      }

      // Default / signal: qualquer quebra recente
      const combinedSig = targetBOS !== 'neutro' ? targetBOS : targetCHoCH;
      return { val: combinedSig, num: combinedSig === 'compra' ? 1 : combinedSig === 'venda' ? -1 : 0 };
    }

    if (normKey === 'smc_range_filter' || normKey === 'order_block_range' || normKey === 'smc_ob_range') {
      const candleHistory = Math.max(2, Number(params.candleHistory || 10));
      const rangeMinSize = Number(params.rangeMinSize !== undefined ? params.rangeMinSize : 0.0);
      const rangeMaxSize = Number(params.rangeMaxSize !== undefined ? params.rangeMaxSize : 200.0);
      const limitMinPct = Number(params.limitMinPct !== undefined ? params.limitMinPct : 0.0);
      const limitMaxPct = Number(params.limitMaxPct !== undefined ? params.limitMaxPct : 50.0);
      const filterMode = String(params.filterMode || 'both').toLowerCase();
      const allowBreakout = params.allowBreakout !== false && (filterMode === 'both' || filterMode === 'breakout');
      const allowPullback = params.allowPullback !== false && (filterMode === 'both' || filterMode === 'pullback');

      const barsToAnalyze = Math.min(candleHistory, activeHist.length - 1);
      if (barsToAnalyze < 1) {
        return { val: 'reprovado', num: 0 };
      }

      let blockHigh = -Infinity;
      let blockLow = Infinity;
      const lastIdx = activeHist.length - 1;

      for (let i = 1; i <= barsToAnalyze; i++) {
        const cIdx = lastIdx - i;
        if (cIdx >= 0) {
          const h = Number(activeHist[cIdx].high || activeHist[cIdx].close || 0);
          const l = Number(activeHist[cIdx].low || activeHist[cIdx].close || 0);
          if (h > blockHigh) blockHigh = h;
          if (l < blockLow) blockLow = l;
        }
      }

      const blockRange = blockHigh - blockLow;
      const sub = String(subSeries || '').toLowerCase().trim();

      if (sub === 'block_high') return { val: blockHigh, num: blockHigh };
      if (sub === 'block_low') return { val: blockLow, num: blockLow };
      if (sub === 'block_range') return { val: blockRange, num: blockRange };

      // 1. Validar range
      const isRangeValid = blockRange >= rangeMinSize && blockRange <= rangeMaxSize;
      if (!isRangeValid) {
        if (sub === 'status') return { val: 'reprovado', num: 0 };
        return { val: 'neutro', num: 0 };
      }

      const triggerCandle = activeHist[lastIdx] || {};
      const triggerClose = Number(triggerCandle.close || 0);
      const triggerOpen = Number(triggerCandle.open || triggerClose);
      const isBullishCandle = triggerClose >= triggerOpen;
      const isBearishCandle = triggerClose <= triggerOpen;

      const minDistance = blockRange * (limitMinPct / 100.0);
      const maxDistance = blockRange * (limitMaxPct / 100.0);

      let isBreakoutBuy = false;
      let isBreakoutSell = false;
      let isPullbackBuy = false;
      let isPullbackSell = false;

      if (allowBreakout) {
        isBreakoutBuy = isBullishCandle && triggerClose >= (blockHigh + minDistance) && triggerClose <= (blockHigh + maxDistance);
        isBreakoutSell = isBearishCandle && triggerClose <= (blockLow - minDistance) && triggerClose >= (blockLow - maxDistance);
      }

      if (allowPullback) {
        const maxPullbackDist = blockRange * (limitMaxPct / 100.0);
        const minPullbackDist = blockRange * (limitMinPct / 100.0);
        isPullbackBuy = triggerClose >= (blockLow + minPullbackDist) && triggerClose <= (blockLow + maxPullbackDist);
        isPullbackSell = triggerClose <= (blockHigh - minPullbackDist) && triggerClose >= (blockHigh - maxPullbackDist);
      }

      if (sub === 'breakout_buy') {
        return { val: isBreakoutBuy ? 'compra' : 'neutro', num: isBreakoutBuy ? 1 : 0 };
      }
      if (sub === 'breakout_sell') {
        return { val: isBreakoutSell ? 'venda' : 'neutro', num: isBreakoutSell ? 1 : 0 };
      }
      if (sub === 'pullback_buy') {
        return { val: isPullbackBuy ? 'compra' : 'neutro', num: isPullbackBuy ? 1 : 0 };
      }
      if (sub === 'pullback_sell') {
        return { val: isPullbackSell ? 'venda' : 'neutro', num: isPullbackSell ? 1 : 0 };
      }
      if (sub === 'breakout_status') {
        const bSig = isBreakoutBuy ? 'compra' : isBreakoutSell ? 'venda' : 'neutro';
        return { val: bSig, num: bSig === 'compra' ? 1 : bSig === 'venda' ? -1 : 0 };
      }
      if (sub === 'pullback_status') {
        const pSig = isPullbackBuy ? 'compra' : isPullbackSell ? 'venda' : 'neutro';
        return { val: pSig, num: pSig === 'compra' ? 1 : pSig === 'venda' ? -1 : 0 };
      }

      // Status geral do filtro / direção
      const isBuyAny = isBreakoutBuy || isPullbackBuy;
      const isSellAny = isBreakoutSell || isPullbackSell;

      if (sub === 'zone_direction') {
        const dir = isBuyAny ? 'compra' : isSellAny ? 'venda' : 'neutro';
        return { val: dir, num: dir === 'compra' ? 1 : dir === 'venda' ? -1 : 0 };
      }

      const isApproved = isBuyAny || isSellAny;
      return { val: isApproved ? 'aprovado' : 'reprovado', num: isApproved ? 1 : 0 };
    }

    if (normKey === 'ma_cloud_filter' || normKey === 'macloud_filter' || normKey === 'ma_cloud' || normKey === 'macloud') {
      const fastPeriod = Math.max(1, Number(params.fastPeriod || 8));
      const slowPeriod = Math.max(2, Number(params.slowPeriod || 21));
      const minDistance = Number(params.minDistance !== undefined ? params.minDistance : 0.0);
      const maxDistance = Number(params.maxDistance !== undefined ? params.maxDistance : 100.0);
      const reverseLogic = params.reverseLogic === true;
      const useAutoAvg = params.useAutoAvg === true;
      const barCount = Math.max(1, Number(params.barCount || 5));

      const fastSMA = calculateSMAValues(activeHist, fastPeriod);
      const slowSMA = calculateSMAValues(activeHist, slowPeriod);

      const lastIdx = activeHist.length - 1;
      const e = fastSMA.length > 0 ? (fastSMA[fastSMA.length - 1] || 0) : 0;
      const s = slowSMA.length > 0 ? (slowSMA[slowSMA.length - 1] || 0) : 0;

      // Calcular diff (direto ou AutoRangeAVG)
      let diff = Math.abs(e - s);
      if (useAutoAvg) {
        let totalDiff = 0;
        let count = 0;
        for (let i = 0; i < barCount; i++) {
          const idx = lastIdx - i;
          if (idx >= 0 && idx < fastSMA.length && idx < slowSMA.length) {
            totalDiff += Math.abs((fastSMA[idx] || 0) - (slowSMA[idx] || 0));
            count++;
          }
        }
        diff = count > 0 ? totalDiff / count : diff;
      }

      const sub = String(subSeries || '').toLowerCase().trim();
      if (sub === 'cloud_diff' || sub === 'diff') return { val: diff, num: diff };
      if (sub === 'fast_ma' || sub === 'fast') return { val: e, num: e };
      if (sub === 'slow_ma' || sub === 'slow') return { val: s, num: s };

      // 1. Validar limites de distância
      const isDistanceValid = diff >= minDistance && diff <= maxDistance;
      if (!isDistanceValid) {
        if (sub === 'status') return { val: 'reprovado', num: 0 };
        return { val: 'neutro', num: 0 };
      }

      // 2. Validação da Direção (Conforme NinjaTrader CheckMACLOUDFilter)
      let isBuyValid = false;
      let isSellValid = false;

      if (!reverseLogic) {
        isBuyValid = e > s;
        isSellValid = e < s;
      } else {
        isBuyValid = e < s;
        isSellValid = e > s;
      }

      if (sub === 'buy_valid') {
        return { val: isBuyValid ? 'compra' : 'neutro', num: isBuyValid ? 1 : 0 };
      }
      if (sub === 'sell_valid') {
        return { val: isSellValid ? 'venda' : 'neutro', num: isSellValid ? 1 : 0 };
      }
      if (sub === 'direction') {
        const dir = isBuyValid ? 'compra' : isSellValid ? 'venda' : 'neutro';
        return { val: dir, num: dir === 'compra' ? 1 : dir === 'venda' ? -1 : 0 };
      }

      const isApproved = isBuyValid || isSellValid;
      return { val: isApproved ? 'aprovado' : 'reprovado', num: isApproved ? 1 : 0 };
    }

    const parseNumVal = parseNum(key);
    return { val: key, num: parseNumVal };
  };

  const normalizeOp = (opRaw: string): string => {
    const op = String(opRaw || '').toLowerCase().trim();
    if (['cross_above', 'crosses_above', 'cruzou_acima', 'crossesabove', 'crossabove', 'cruzacima', 'cruz. acima', 'cruz.acima', 'cruz_acima'].includes(op)) return 'cross_above';
    if (['cross_below', 'crosses_below', 'cruzou_abaixo', 'crossesbelow', 'crossbelow', 'cruzabaixo', 'cruz. abaixo', 'cruz.abaixo', 'cruz_abaixo'].includes(op)) return 'cross_below';
    if (['gt', '>', 'greater_than', 'maior', 'maior_que'].includes(op)) return 'gt';
    if (['gte', '>=', 'greater_equal', 'maior_igual'].includes(op)) return 'gte';
    if (['lt', '<', 'less_than', 'menor', 'menor_que'].includes(op)) return 'lt';
    if (['lte', '<=', 'less_equal', 'menor_igual'].includes(op)) return 'lte';
    if (['eq', '=', '==', 'equal', 'igual'].includes(op)) return 'eq';
    if (['neq', '!=', 'not_equal', 'diferente'].includes(op)) return 'neq';
    return op;
  };

  const evalCond = (cond: any): boolean => {
    if (!cond) return false;
    const op = normalizeOp(cond.operator || cond.comparator || cond.op);
    const isTargetIndicator = cond.target_type === 'indicator' || (!cond.target_type && Boolean(cond.target_indicator));
    const sourceCurr = getIndicatorVal(cond, false, false);
    const sourcePrev = getIndicatorVal(cond, false, true);
    const targetCurr = isTargetIndicator 
      ? getIndicatorVal(cond, true, false) 
      : { val: cond.target_value ?? cond.value ?? cond.target ?? cond.target_param1, num: parseNum(cond.target_value ?? cond.value ?? cond.target ?? cond.target_param1) };
    const targetPrev = isTargetIndicator 
      ? getIndicatorVal(cond, true, true) 
      : targetCurr;

    if (sourceCurr.val === undefined || sourceCurr.val === null) return false;

    if (op === 'gt') { if (sourceCurr.num === null || targetCurr.num === null) return false; return sourceCurr.num > targetCurr.num; }
    if (op === 'gte') { if (sourceCurr.num === null || targetCurr.num === null) return false; return sourceCurr.num >= targetCurr.num; }
    if (op === 'lt') { if (sourceCurr.num === null || targetCurr.num === null) return false; return sourceCurr.num < targetCurr.num; }
    if (op === 'lte') { if (sourceCurr.num === null || targetCurr.num === null) return false; return sourceCurr.num <= targetCurr.num; }
    if (op === 'eq') {
      if (typeof sourceCurr.val === 'string' || typeof targetCurr.val === 'string') {
        return isStateMatching(sourceCurr.val, targetCurr.val);
      }
      return sourceCurr.val == targetCurr.val;
    }
    if (op === 'neq') {
      if (typeof sourceCurr.val === 'string' || typeof targetCurr.val === 'string') {
        return !isStateMatching(sourceCurr.val, targetCurr.val);
      }
      return sourceCurr.val != targetCurr.val;
    }
    const targetKeyNorm = String(cond.target_indicator || cond.target_value || cond.target || '').toLowerCase().trim();
    const isTargetNearestResistance = targetKeyNorm === 'nearest_resistance';
    const isTargetNearestSupport = targetKeyNorm === 'nearest_support';

    if (op === 'cross_above') {
      const currentA = sourceCurr.num;
      const currentB = targetCurr.num;
      const prevA = sourcePrev.num;
      const prevB = targetPrev.num;
      if (currentA === null || prevA === null) return false;

      // Rompimento de Resistência Dinâmica (Preço estava abaixo/igual da resistência anterior e agora rompeu acima)
      if (isTargetNearestResistance && prevB !== null && prevB > 0) {
        return currentA > prevB && prevA <= prevB;
      }
      // Rompimento/Retorno acima do Suporte Dinâmico
      if (isTargetNearestSupport && prevB !== null && prevB > 0) {
        return currentA > prevB && prevA <= prevB;
      }

      // Se for grupo de níveis com subSeries 'all', 'todos', 'any' ou vazio
      const targetSub = String(cond.target_subSeries || '').toLowerCase().trim();
      const isLevelGroup = ['levels_gamma', 'levels_options', 'levels_daily', 'levels_time_range', 'gammalevels', 'levels_liquidity', 'levels_session_percent', 'volume_levels', 'volume_hvn_blocks'].includes(targetKeyNorm);
      const isAllOrAny = !targetSub || ['all', 'todos', 'any', 'all_bl', 'all_gex', 'all_naked_pocs', 'naked_pocs'].includes(targetSub);
      if (isLevelGroup && isAllOrAny) {
        let pool: number[] = [];
        if (targetKeyNorm === 'levels_gamma') {
          pool = [Number(registry['gamma_hvl'] || 0), Number(registry['gamma_gwall'] || 0), Number(registry['gamma_hvl0'] || 0)];
        } else if (targetKeyNorm === 'levels_options') {
          pool = [Number(registry['gamma_call'] || 0), Number(registry['gamma_put'] || 0), Number(registry['gamma_call0'] || 0), Number(registry['gamma_put0'] || 0)];
        } else if (targetKeyNorm === 'levels_daily') {
          pool = [Number(registry['gamma_max1d'] || 0), Number(registry['gamma_min1d'] || 0), Number(registry['gamma_prev'] || 0), Number(registry['gamma_prevH'] || 0), Number(registry['gamma_prevL'] || 0)];
        } else if (targetKeyNorm === 'gammalevels') {
          pool = [
            Number(registry['gamma_hvl'] || 0), Number(registry['gamma_gwall'] || 0), Number(registry['gamma_hvl0'] || 0),
            Number(registry['gamma_call'] || 0), Number(registry['gamma_put'] || 0), Number(registry['gamma_call0'] || 0), Number(registry['gamma_put0'] || 0),
            Number(registry['gamma_max1d'] || 0), Number(registry['gamma_min1d'] || 0), Number(registry['gamma_prev'] || 0), Number(registry['gamma_prevH'] || 0), Number(registry['gamma_prevL'] || 0)
          ];
        } else if (targetKeyNorm === 'levels_liquidity') {
          if (targetSub === 'all_bl') {
            pool = [Number(registry['gamma_bl1'] || 0), Number(registry['gamma_bl2'] || 0), Number(registry['gamma_bl3'] || 0), Number(registry['gamma_bl4'] || 0), Number(registry['gamma_bl5'] || 0)];
          } else if (targetSub === 'all_gex') {
            pool = [Number(registry['gamma_gex1'] || 0), Number(registry['gamma_gex2'] || 0), Number(registry['gamma_gex3'] || 0)];
          } else {
            pool = [
              Number(registry['gamma_bl1'] || 0), Number(registry['gamma_bl2'] || 0), Number(registry['gamma_bl3'] || 0), Number(registry['gamma_bl4'] || 0), Number(registry['gamma_bl5'] || 0),
              Number(registry['gamma_gex1'] || 0), Number(registry['gamma_gex2'] || 0), Number(registry['gamma_gex3'] || 0)
            ];
          }
        } else if (targetKeyNorm === 'levels_session_percent') {
          const openPrice = Number(registry['candle_open'] || registry['open'] || lastCandleClose);
          const stepPercent = Number(cond.target_params?.stepPercent || 0.5);
          pool = [
            openPrice,
            openPrice * (1 + (stepPercent * 1) / 100),
            openPrice * (1 + (stepPercent * 2) / 100),
            openPrice * (1 + (stepPercent * 3) / 100),
            openPrice * (1 - (stepPercent * 1) / 100),
            openPrice * (1 - (stepPercent * 2) / 100),
            openPrice * (1 - (stepPercent * 3) / 100)
          ];
        } else if (targetKeyNorm === 'levels_time_range') {
          pool = [Number(registry['time_range_high'] || 0), Number(registry['time_range_mid'] || 0), Number(registry['time_range_low'] || 0)];
        } else if (targetKeyNorm === 'volume_levels') {
          const poc = Number(registry['vpoc'] || 0);
          const vah = Number(registry['vah'] || 0);
          const val = Number(registry['val_level'] || 0);
          const nakedList: any[] = Array.isArray(registry['naked_pocs']) ? registry['naked_pocs'] : [];
          const nakedPrices = nakedList.map((p: any) => Number(p.price || 0)).filter(p => p > 0);
          if (targetSub === 'all_naked_pocs' || targetSub === 'naked_pocs') {
            pool = nakedPrices;
          } else {
            pool = [poc, vah, val, ...nakedPrices];
          }
        } else if (targetKeyNorm === 'volume_hvn_blocks') {
          const hvnList: any[] = Array.isArray(registry['hvn_blocks']) ? registry['hvn_blocks'] : [];
          pool = hvnList.map((b: any) => Number(b.priceCenter || 0)).filter(p => p > 0);
          if (pool.length === 0) {
            pool = [
              Number(registry['hvn1_center'] || 0), Number(registry['hvn2_center'] || 0), Number(registry['hvn3_center'] || 0),
              Number(registry['hvn4_center'] || 0), Number(registry['hvn5_center'] || 0), Number(registry['hvn6_center'] || 0)
            ];
          }
        }
        const validPool = pool.filter(v => typeof v === 'number' && isFinite(v) && v > 0);
        if (validPool.length > 0) {
          const anyCross = validPool.some(lvl => prevA <= lvl && currentA > lvl);
          if (anyCross) return true;
        }
      }

      if (currentB === null || prevB === null) return false;
      // Cruzamento genuíno: A estava menor ou igual a B na barra anterior E agora está estritamente acima de B
      return currentA > currentB && prevA <= prevB;
    }
    if (op === 'cross_below') {
      const currentA = sourceCurr.num;
      const currentB = targetCurr.num;
      const prevA = sourcePrev.num;
      const prevB = targetPrev.num;
      if (currentA === null || prevA === null) return false;

      // Rompimento de Suporte Dinâmico (Preço estava acima/igual do suporte anterior e agora rompeu abaixo)
      if (isTargetNearestSupport && prevB !== null && prevB > 0) {
        return currentA < prevB && prevA >= prevB;
      }
      // Rompimento/Retorno abaixo da Resistência Dinâmica
      if (isTargetNearestResistance && prevB !== null && prevB > 0) {
        return currentA < prevB && prevA >= prevB;
      }

      // Se for grupo de níveis com subSeries 'all', 'todos', 'any' ou vazio
      const targetSub = String(cond.target_subSeries || '').toLowerCase().trim();
      const isLevelGroup = ['levels_gamma', 'levels_options', 'levels_daily', 'levels_time_range', 'gammalevels', 'levels_liquidity', 'levels_session_percent', 'volume_levels', 'volume_hvn_blocks'].includes(targetKeyNorm);
      const isAllOrAny = !targetSub || ['all', 'todos', 'any', 'all_bl', 'all_gex', 'all_naked_pocs', 'naked_pocs'].includes(targetSub);
      if (isLevelGroup && isAllOrAny) {
        let pool: number[] = [];
        if (targetKeyNorm === 'levels_gamma') {
          pool = [Number(registry['gamma_hvl'] || 0), Number(registry['gamma_gwall'] || 0), Number(registry['gamma_hvl0'] || 0)];
        } else if (targetKeyNorm === 'levels_options') {
          pool = [Number(registry['gamma_call'] || 0), Number(registry['gamma_put'] || 0), Number(registry['gamma_call0'] || 0), Number(registry['gamma_put0'] || 0)];
        } else if (targetKeyNorm === 'levels_daily') {
          pool = [Number(registry['gamma_max1d'] || 0), Number(registry['gamma_min1d'] || 0), Number(registry['gamma_prev'] || 0), Number(registry['gamma_prevH'] || 0), Number(registry['gamma_prevL'] || 0)];
        } else if (targetKeyNorm === 'gammalevels') {
          pool = [
            Number(registry['gamma_hvl'] || 0), Number(registry['gamma_gwall'] || 0), Number(registry['gamma_hvl0'] || 0),
            Number(registry['gamma_call'] || 0), Number(registry['gamma_put'] || 0), Number(registry['gamma_call0'] || 0), Number(registry['gamma_put0'] || 0),
            Number(registry['gamma_max1d'] || 0), Number(registry['gamma_min1d'] || 0), Number(registry['gamma_prev'] || 0), Number(registry['gamma_prevH'] || 0), Number(registry['gamma_prevL'] || 0)
          ];
        } else if (targetKeyNorm === 'levels_liquidity') {
          if (targetSub === 'all_bl') {
            pool = [Number(registry['gamma_bl1'] || 0), Number(registry['gamma_bl2'] || 0), Number(registry['gamma_bl3'] || 0), Number(registry['gamma_bl4'] || 0), Number(registry['gamma_bl5'] || 0)];
          } else if (targetSub === 'all_gex') {
            pool = [Number(registry['gamma_gex1'] || 0), Number(registry['gamma_gex2'] || 0), Number(registry['gamma_gex3'] || 0)];
          } else {
            pool = [
              Number(registry['gamma_bl1'] || 0), Number(registry['gamma_bl2'] || 0), Number(registry['gamma_bl3'] || 0), Number(registry['gamma_bl4'] || 0), Number(registry['gamma_bl5'] || 0),
              Number(registry['gamma_gex1'] || 0), Number(registry['gamma_gex2'] || 0), Number(registry['gamma_gex3'] || 0)
            ];
          }
        } else if (targetKeyNorm === 'levels_session_percent') {
          const openPrice = Number(registry['candle_open'] || registry['open'] || lastCandleClose);
          const stepPercent = Number(cond.target_params?.stepPercent || 0.5);
          pool = [
            openPrice,
            openPrice * (1 + (stepPercent * 1) / 100),
            openPrice * (1 + (stepPercent * 2) / 100),
            openPrice * (1 + (stepPercent * 3) / 100),
            openPrice * (1 - (stepPercent * 1) / 100),
            openPrice * (1 - (stepPercent * 2) / 100),
            openPrice * (1 - (stepPercent * 3) / 100)
          ];
        } else if (targetKeyNorm === 'levels_time_range') {
          pool = [Number(registry['time_range_high'] || 0), Number(registry['time_range_mid'] || 0), Number(registry['time_range_low'] || 0)];
        } else if (targetKeyNorm === 'volume_levels') {
          const poc = Number(registry['vpoc'] || 0);
          const vah = Number(registry['vah'] || 0);
          const val = Number(registry['val_level'] || 0);
          const nakedList: any[] = Array.isArray(registry['naked_pocs']) ? registry['naked_pocs'] : [];
          const nakedPrices = nakedList.map((p: any) => Number(p.price || 0)).filter(p => p > 0);
          if (targetSub === 'all_naked_pocs' || targetSub === 'naked_pocs') {
            pool = nakedPrices;
          } else {
            pool = [poc, vah, val, ...nakedPrices];
          }
        } else if (targetKeyNorm === 'volume_hvn_blocks') {
          const hvnList: any[] = Array.isArray(registry['hvn_blocks']) ? registry['hvn_blocks'] : [];
          pool = hvnList.map((b: any) => Number(b.priceCenter || 0)).filter(p => p > 0);
          if (pool.length === 0) {
            pool = [
              Number(registry['hvn1_center'] || 0), Number(registry['hvn2_center'] || 0), Number(registry['hvn3_center'] || 0),
              Number(registry['hvn4_center'] || 0), Number(registry['hvn5_center'] || 0), Number(registry['hvn6_center'] || 0)
            ];
          }
        }
        const validPool = pool.filter(v => typeof v === 'number' && isFinite(v) && v > 0);
        if (validPool.length > 0) {
          const anyCross = validPool.some(lvl => prevA >= lvl && currentA < lvl);
          if (anyCross) return true;
        }
      }

      if (currentB === null || prevB === null) return false;
      // Cruzamento genuíno: A estava maior ou igual a B na barra anterior E agora está estritamente abaixo de B
      return currentA < currentB && prevA >= prevB;
    }
    return false;
  };

  // --- AVALIAÇÃO SEQUENCIAL MULTI-ETAPAS NO REPLAY ---
  const buyStagesNorm = normalizeStrategyStages(strat.buy_stages || strat.buy_conditions, 'buy');
  const sellStagesNorm = normalizeStrategyStages(strat.sell_stages || strat.sell_conditions, 'sell');

  const targetCandleTime = currentCandle ? String(currentCandle.timestamp) : '';

  const evalSequentialSide = (sideKey: 'buy' | 'sell', stages: any[]): boolean => {
    if (!stages || stages.length === 0) return false;
    const activeStages = stages.filter(s => s.conditions && s.conditions.length > 0);
    if (activeStages.length === 0) return false;

    // Se possui apenas 1 estágio simples, avalia diretamente no candle corrente
    if (activeStages.length === 1) {
      const st = activeStages[0];
      return st.logic === 'OR'
        ? st.conditions.some((c: any) => evalCond(c))
        : st.conditions.every((c: any) => evalCond(c));
    }

    // Para múltiplos estágios (Lógica 1 ➔ Lógica 2...):
    const seqMap = customSequenceStateMap || replaySequenceStateMap;
    const stateKey = `${strat.id || strat.name}_${sideKey}`;
    if (!seqMap[stateKey]) {
      seqMap[stateKey] = {
        currentStageIndex: 0,
        candlesSinceStageCompletion: 0,
        lastCheckedCandleTime: targetCandleTime
      };
    }

    const seqState = seqMap[stateKey];

    // Se avançou para um novo candle, incrementa contador de velas de espera
    if (targetCandleTime && seqState.lastCheckedCandleTime !== targetCandleTime) {
      if (seqState.currentStageIndex > 0) {
        seqState.candlesSinceStageCompletion += 1;
      }
      seqState.lastCheckedCandleTime = targetCandleTime;
    }

    if (seqState.currentStageIndex >= activeStages.length) {
      seqState.currentStageIndex = 0;
      seqState.candlesSinceStageCompletion = 0;
    }

    const currentStage = activeStages[seqState.currentStageIndex];
    const maxWait = currentStage?.max_wait_candles !== undefined
      ? Number(currentStage.max_wait_candles)
      : ((strat as any).max_wait_candles !== undefined ? Number((strat as any).max_wait_candles) : 0);

    // Verifica expiração da tolerância de tempo (max_wait_candles): se não ativar no limite, reseta tudo para a Lógica 1 (0 = ilimitado)
    if (seqState.currentStageIndex > 0 && maxWait > 0) {
      if (seqState.candlesSinceStageCompletion > maxWait) {
        seqState.currentStageIndex = 0;
        seqState.candlesSinceStageCompletion = 0;
        seqState.lastCompletedCandleTime = undefined;
      }
    }

    const evalStageConditions = (st: any): boolean => {
      if (!st || !st.conditions || st.conditions.length === 0) return false;
      return st.logic === 'OR'
        ? st.conditions.some((c: any) => evalCond(c))
        : st.conditions.every((c: any) => evalCond(c));
    };

    while (seqState.currentStageIndex < activeStages.length) {
      const stageToEval = activeStages[seqState.currentStageIndex];
      const stageMet = evalStageConditions(stageToEval);

      if (stageMet) {
        const isFinalStage = seqState.currentStageIndex === activeStages.length - 1;
        if (isFinalStage) {
          // Todas as etapas foram concluídas em sequência! Dispara a ordem e reseta IMEDIATAMENTE para a Lógica 1 (impossibilita 2º disparo)
          seqState.currentStageIndex = 0;
          seqState.candlesSinceStageCompletion = 0;
          seqState.lastCompletedCandleTime = targetCandleTime;
          return true;
        } else {
          // Etapa intermediária concluída! Avança para a próxima etapa na sequência
          seqState.currentStageIndex += 1;
          seqState.candlesSinceStageCompletion = 0;
          seqState.lastCompletedCandleTime = targetCandleTime;
          continue;
        }
      } else {
        break;
      }
    }

    return false;
  };

  const buyMet = evalSequentialSide('buy', buyStagesNorm);
  const sellMet = evalSequentialSide('sell', sellStagesNorm);

  if (buyMet && !sellMet) {
    return { side: 'COMPRA', description: `Robô ${strat.name} gerou sinal de COMPRA @ ${lastCandleClose.toFixed(2)}` };
  }
  if (sellMet && !buyMet) {
    return { side: 'VENDA', description: `Robô ${strat.name} gerou sinal de VENDA @ ${lastCandleClose.toFixed(2)}` };
  }

  return { side: null, description: '' };
}

// Estrutura padronizada de sinal histórico de algoritmos no modo Indicador
export interface HistoricalIndicatorSignal {
  id: string;
  strategyId: string;
  strategyName: string;
  side: 'COMPRA' | 'VENDA';
  action: 'alert';
  time: string | number;
  price: number;
  description: string;
  isHistorical: boolean;
  isAlert: boolean;
}

// Varredura Retrospectiva Completa (Back-Scan Warmup):
// Percorre as velas anteriores do gráfico avaliando o algoritmo em modo Indicador (action === 'alert')
// para plotar o histórico determinístico de sinais nas barras antigas.
export function scanHistoricalIndicatorSignals(
  strat: CustomStrategy,
  candles: Candle[],
  gammaLevels: GammaLevels | null = null,
  pointValue: number = 20,
  maxBarsToScan: number = 3000,
  chartTimeframe: number = 1
): HistoricalIndicatorSignal[] {
  if (!strat || !candles || candles.length < 5) return [];

  const executionMode = strat.execution_mode || 'closed';
  const stratTf = (strat as any).timeframe || 1;
  const skipAggregation = chartTimeframe === stratTf || stratTf <= 1;

  // Se o gráfico estiver em timeframe diferente (ex: 1m e robô em 5m), ajustamos a resolução
  const candlesPool = (!skipAggregation && stratTf > 1)
    ? aggregateReplayCandles(candles, stratTf)
    : candles;

  if (candlesPool.length < 5) return [];

  const signals: HistoricalIndicatorSignal[] = [];
  const sequenceStateMap: Record<string, any> = {};

  const totalBars = candlesPool.length;
  // Escanear da barra mais antiga até a atual (até 3000 barras para cobrir 3 dias de histórico completo)
  const maxBars = Math.min(maxBarsToScan, 3000);
  const startIdx = Math.max(5, totalBars - maxBars);

  // Evitar sinais repetidos no mesmo candle
  const seenCandleKeys = new Set<string>();

  // Lookback máximo para cálculo de indicadores em cada candle (O(1) estável)
  const WARMUP_LOOKBACK = 120;
  const padFn = (n: number) => String(n).padStart(2, '0');

  for (let i = startIdx; i < totalBars; i++) {
    const sliceStart = Math.max(0, i - WARMUP_LOOKBACK);
    const slice = candlesPool.slice(sliceStart, i + 1);
    const evalCandle = candlesPool[i];
    const prevCandle = candlesPool[i - 1];

    let candleTimeStr = '12:00:00';
    let closedTimeStr = '12:00:00';
    let rawTimeStr = '';
    try {
      const rawT = evalCandle.timestamp || (evalCandle as any).time;
      if (rawT) {
        const d = getSaoPauloDate(rawT);
        if (!isNaN(d.getTime())) {
          candleTimeStr = `${padFn(d.getHours())}:${padFn(d.getMinutes())}:${padFn(d.getSeconds())}`;
          rawTimeStr = d.toISOString();
        }
      }
      const rawPrevT = prevCandle?.timestamp || (prevCandle as any)?.time;
      if (rawPrevT) {
        const dPrev = getSaoPauloDate(rawPrevT);
        if (!isNaN(dPrev.getTime())) {
          closedTimeStr = `${padFn(dPrev.getHours())}:${padFn(dPrev.getMinutes())}:${padFn(dPrev.getSeconds())}`;
        }
      }
    } catch {}

    const res = evaluateReplayRobot(
      strat,
      slice,
      gammaLevels,
      pointValue,
      candleTimeStr,
      closedTimeStr,
      sequenceStateMap,
      true // já ajustado em candlesPool
    );

    if (res && res.side) {
      // No modo closed, a decisão foi na barra fechada (index length - 2 da slice, que é i - 1)
      const markerCandle = executionMode === 'closed' ? (prevCandle || evalCandle) : evalCandle;
      const markerTime = markerCandle.timestamp || (markerCandle as any).time || rawTimeStr;
      const markerPrice = Number(markerCandle.close || 0);
      const candleKey = `${strat.id}_${markerTime}`;

      if (!seenCandleKeys.has(candleKey)) {
        seenCandleKeys.add(candleKey);
        signals.push({
          id: `hist-alert-${strat.id}-${markerTime}`,
          strategyId: String(strat.id),
          strategyName: strat.name,
          side: res.side,
          action: 'alert',
          time: markerTime,
          price: markerPrice,
          description: res.description,
          isHistorical: true,
          isAlert: true
        });
      }
    }
  }

  return signals;
}
