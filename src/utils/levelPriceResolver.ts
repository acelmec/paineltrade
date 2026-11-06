/**
 * Utility for resolving structural level prices (Gamma, HVL, High/Low 1D, Adjust, BL, GEX, etc.)
 * and calculating trade management parameters (SL, TP, Contracts) for manual and drawing operations.
 */

export function resolveLevelPrice(
  side: 'COMPRA' | 'VENDA',
  type: 'SL' | 'TP',
  entryRef: number,
  gammaLevels?: any,
  slPoints: number = 50,
  tpPoints: number = 25
): number {
  const allLevels: number[] = [];
  if (gammaLevels) {
    const addLvl = (val: any) => {
      if (val === undefined || val === null || val === '' || val === '--') return;
      if (Array.isArray(val)) {
        val.forEach(item => addLvl(item));
        return;
      }
      if (typeof val === 'string' && val.includes(',')) {
        val.split(',').forEach(item => addLvl(item));
        return;
      }
      const n = parseFloat(String(val));
      if (!isNaN(n) && n > 0 && !allLevels.includes(n)) {
        allLevels.push(Number(n.toFixed(2)));
      }
    };

    addLvl(gammaLevels.hvl);
    addLvl(gammaLevels.call);
    addLvl(gammaLevels.call_resistance);
    addLvl(gammaLevels.put);
    addLvl(gammaLevels.put_support);
    addLvl(gammaLevels.max1d);
    addLvl(gammaLevels.max_1d);
    addLvl(gammaLevels.min1d);
    addLvl(gammaLevels.min_1d);
    addLvl(gammaLevels.prev);
    addLvl(gammaLevels.prev_day_adjust);
    addLvl(gammaLevels.prevH);
    addLvl(gammaLevels.prev_day_high);
    addLvl(gammaLevels.prevL);
    addLvl(gammaLevels.prev_day_low);
    addLvl(gammaLevels.hvl0);
    addLvl(gammaLevels.hvl_0dte);
    addLvl(gammaLevels.call0);
    addLvl(gammaLevels.call_resistance_0dte);
    addLvl(gammaLevels.put0);
    addLvl(gammaLevels.put_support_0dte);
    addLvl(gammaLevels.gwall);
    addLvl(gammaLevels.gamma_wall_0dte);
    addLvl(gammaLevels.bl);
    addLvl(gammaLevels.gex);
  }

  allLevels.sort((a, b) => a - b);

  const minSl = Math.max(1, slPoints || 50);
  const minTp = Math.max(1, tpPoints || 25);

  if (type === 'SL') {
    if (side === 'COMPRA') {
      const valid = allLevels.filter(lvl => lvl < entryRef && (entryRef - lvl) >= minSl);
      if (valid.length > 0) return Number(Math.max(...valid).toFixed(2));
      const allBelow = allLevels.filter(lvl => lvl < entryRef);
      return allBelow.length > 0 ? Number(Math.min(...allBelow).toFixed(2)) : Number((entryRef - minSl).toFixed(2));
    } else {
      const valid = allLevels.filter(lvl => lvl > entryRef && (lvl - entryRef) >= minSl);
      if (valid.length > 0) return Number(Math.min(...valid).toFixed(2));
      const allAbove = allLevels.filter(lvl => lvl > entryRef);
      return allAbove.length > 0 ? Number(Math.max(...allAbove).toFixed(2)) : Number((entryRef + minSl).toFixed(2));
    }
  } else {
    if (side === 'COMPRA') {
      const valid = allLevels.filter(lvl => lvl > entryRef && (lvl - entryRef) >= minTp);
      if (valid.length > 0) return Number(Math.min(...valid).toFixed(2));
      const allAbove = allLevels.filter(lvl => lvl > entryRef);
      return allAbove.length > 0 ? Number(Math.max(...allAbove).toFixed(2)) : Number((entryRef + minTp).toFixed(2));
    } else {
      const valid = allLevels.filter(lvl => lvl < entryRef && (entryRef - lvl) >= minTp);
      if (valid.length > 0) return Number(Math.max(...valid).toFixed(2));
      const allBelow = allLevels.filter(lvl => lvl < entryRef);
      return allBelow.length > 0 ? Number(Math.min(...allBelow).toFixed(2)) : Number((entryRef - minTp).toFixed(2));
    }
  }
}

export interface TradeManagementParams {
  side: 'COMPRA' | 'VENDA';
  entryPrice: number;
  drawingTrigger?: any;
  panelSettings?: any;
  globalSettings?: any;
  gammaLevels?: any;
  pointValue?: number;
  isReplay?: boolean;
}

export function calculateTradeManagement(params: TradeManagementParams) {
  const { side, entryPrice, panelSettings, globalSettings, gammaLevels, pointValue = 2.0, isReplay = false } = params;

  const currentSettings = panelSettings || globalSettings || {};

  // 0. Verifica se a Boleta está com ATM ligado e recupera a Estratégia ATM ativa
  const atmActiveKey = isReplay ? 'vortex_replay_atm_active' : 'vortex_atm_active';
  const atmStratKey = isReplay ? 'vortex_replay_active_atm' : 'vortex_active_atm';

  const isATMActive = typeof window !== 'undefined'
    ? (localStorage.getItem(atmActiveKey) === 'true' || (!isReplay && localStorage.getItem('vortex_atm_active') === 'true'))
    : false;

  let activeATM: any = null;
  if (isATMActive && typeof window !== 'undefined') {
    const saved = localStorage.getItem(atmStratKey) || localStorage.getItem('vortex_active_atm');
    if (saved) {
      try { activeATM = JSON.parse(saved); } catch (_) {}
    }
  }

  // 1. Determinar o modo de stop da Boleta: 'nivel', 'pontos', 'grafico', 'copilot' ou 'range'
  let stopMode: 'pontos' | 'nivel' | 'grafico' | 'copilot' | 'range' = 'pontos';
  if (isReplay && typeof window !== 'undefined') {
    const savedMode = localStorage.getItem('vortex_replay_stop_mode');
    if (savedMode === 'nivel' || savedMode === 'pontos' || savedMode === 'grafico' || savedMode === 'copilot' || savedMode === 'range') {
      stopMode = savedMode as any;
    } else {
      stopMode = (currentSettings.chart_manual_trade_mode as any) || 'pontos';
    }
  } else {
    stopMode = (currentSettings.chart_manual_trade_mode as any) || 'pontos';
  }

  // Tenta carregar os preços marcados manualmente no gráfico
  let customSlPrice: number | null = null;
  let customTpPrice: number | null = null;
  if (stopMode === 'grafico' && typeof window !== 'undefined') {
    const keySl = isReplay ? 'vortex_replay_custom_sl_price' : 'vortex_custom_sl_price';
    const keyTp = isReplay ? 'vortex_replay_custom_tp_price' : 'vortex_custom_tp_price';
    const slVal = localStorage.getItem(keySl);
    const tpVal = localStorage.getItem(keyTp);
    if (slVal) customSlPrice = Number(slVal);
    if (tpVal) customTpPrice = Number(tpVal);
  } else if (stopMode === 'copilot' && typeof window !== 'undefined') {
    const slVal = localStorage.getItem('vortex_copilot_sl_price');
    const tpVal = localStorage.getItem('vortex_copilot_tp_price');
    if (slVal) customSlPrice = Number(slVal);
    if (tpVal) customTpPrice = Number(tpVal);
  }

  // 2. Determinar o modo de dimensionamento do lote da Boleta: 'risco' ou 'lote'
  let sizingMode: 'lote' | 'risco' = 'lote';
  if (isReplay && typeof window !== 'undefined') {
    const savedSizing = localStorage.getItem('vortex_replay_sizing_mode');
    if (savedSizing === 'risco' || savedSizing === 'lote') {
      sizingMode = savedSizing;
    } else {
      sizingMode = currentSettings.chart_manual_sizing_mode === 'risco' ? 'risco' : 'lote';
    }
  } else {
    sizingMode = currentSettings.chart_manual_sizing_mode === 'risco' ? 'risco' : 'lote';
  }

  // 3. Pontos base de Stop e Take da Boleta
  let slPoints = 50;
  let tpPoints = 50;

  if (isReplay && typeof window !== 'undefined') {
    const rSl = localStorage.getItem('vortex_replay_sl_points');
    const rTp = localStorage.getItem('vortex_replay_tp_points');
    slPoints = rSl ? (Number(rSl) || 50) : (Number(currentSettings.chart_manual_sl_points) || 50);
    tpPoints = rTp ? (Number(rTp) || 50) : (Number(currentSettings.chart_manual_tp_points) || 50);
  } else {
    slPoints = Number(currentSettings.chart_manual_sl_points) || 50;
    tpPoints = Number(currentSettings.chart_manual_tp_points) || 50;
  }

  // 4. Cálculo do Preço de Stop Loss e Take Profit (Gráfico Directo vs Nível Estrutural vs Pontos Fixo)
  let slPrice = 0;
  let tpPrice = 0;

  if ((stopMode === 'grafico' || stopMode === 'copilot') && customSlPrice !== null && customSlPrice > 0) {
    slPrice = customSlPrice;
    tpPrice = (customTpPrice !== null && customTpPrice > 0) ? customTpPrice : (side === 'COMPRA' ? entryPrice + tpPoints : entryPrice - tpPoints);
  } else if (stopMode === 'range') {
    const keyRef = isReplay ? 'vortex_replay_range_candle_ref' : 'vortex_range_candle_ref';
    const keyMult = isReplay ? 'vortex_replay_range_tp_multiplier' : 'vortex_range_tp_multiplier';
    const candleRef = typeof window !== 'undefined' ? Number(localStorage.getItem(keyRef) || currentSettings.chart_manual_range_candle_ref || 1) : 1;
    const tpMult = typeof window !== 'undefined' ? Number(localStorage.getItem(keyMult) || currentSettings.chart_manual_range_tp_multiplier || 1.0) : 1.0;
    const rangeRes = calculateRangeHlLevels(side, entryPrice, (params as any).candles || [], candleRef, tpMult, 0.25);
    slPrice = rangeRes.slPrice;
    tpPrice = rangeRes.tpPrice;
  } else if (stopMode === 'nivel') {
    slPrice = resolveLevelPrice(side, 'SL', entryPrice, gammaLevels, slPoints, tpPoints);
    tpPrice = resolveLevelPrice(side, 'TP', entryPrice, gammaLevels, slPoints, tpPoints);
  } else {
    slPrice = side === 'COMPRA' ? entryPrice - slPoints : entryPrice + slPoints;
    tpPrice = side === 'COMPRA' ? entryPrice + tpPoints : entryPrice - tpPoints;
  }

  // Distância efetiva de Stop em pontos
  const calculatedSlPts = Math.max(1, Math.abs(entryPrice - slPrice));

  // 5. Cálculo do Lote de Contratos (Fixo vs Risco Moeda $)
  let riskUsd = 250;
  let baseContracts = 1;

  if (isReplay && typeof window !== 'undefined') {
    const rRisk = localStorage.getItem('vortex_replay_risk_usd');
    const rContracts = localStorage.getItem('vortex_replay_contracts');
    riskUsd = rRisk ? (Number(rRisk) || 250) : (Number(currentSettings.chart_manual_risk_usd) || 250);
    baseContracts = rContracts ? (Number(rContracts) || 1) : (Number(currentSettings.chart_manual_contracts) || 1);
  } else {
    riskUsd = Number(currentSettings.chart_manual_risk_usd) || 250;
    baseContracts = Number(currentSettings.chart_manual_contracts) || 1;
  }

  let contracts = 1;
  if (sizingMode === 'risco') {
    contracts = Math.max(1, Math.floor(riskUsd / (calculatedSlPts * pointValue)));
  } else {
    contracts = baseContracts;
  }

  const hasValidATM = isATMActive && !!activeATM && Array.isArray(activeATM.brackets) && activeATM.brackets.length > 0;

  return {
    isATMActive: hasValidATM,
    activeATM,
    slPrice: Number(slPrice.toFixed(2)),
    tpPrice: Number(tpPrice.toFixed(2)),
    contracts,
    stopMode,
    sizingMode,
    calculatedSlPts,
    slPoints,
    tpPoints
  };
}

function roundToTickLocal(val: number, tickSize: number = 0.25): number {
  if (!tickSize || tickSize <= 0) return Number(val.toFixed(2));
  return Number((Math.round(val / tickSize) * tickSize).toFixed(2));
}

/**
 * Cálculo do Stop Loss na Mínima/Máxima do Range de Candles e Take Profit com Fator Multiplicador
 * @param side 'COMPRA' | 'VENDA'
 * @param entryPrice Cotação de entrada
 * @param candles Lista de candles (1m ou timeframe ativo)
 * @param candleRef Número de candles anteriores a considerar (0 = apenas o atual, 1 = atual + 1 anterior, N = histórico)
 * @param tpMultiplier Fator multiplicador do Take Profit (ex: 1.0, 1.5, 2.0, 0.5)
 * @param tickSize Tamanho do tick do ativo (ex: 0.25 para NQ)
 */
export function calculateRangeHlLevels(
  side: 'COMPRA' | 'VENDA',
  entryPrice: number,
  candles: any[],
  candleRef: number = 1,
  tpMultiplier: number = 1.0,
  tickSize: number = 0.25
) {
  if (!candles || candles.length === 0 || entryPrice <= 0) {
    const defaultSl = 20;
    const defaultTp = Number((defaultSl * (tpMultiplier || 1.0)).toFixed(2));
    return {
      slPrice: side === 'COMPRA' ? entryPrice - defaultSl : entryPrice + defaultSl,
      tpPrice: side === 'COMPRA' ? entryPrice + defaultTp : entryPrice - defaultTp,
      slPts: defaultSl,
      tpPts: defaultTp,
      minLow: entryPrice - defaultSl,
      maxHigh: entryPrice + defaultSl
    };
  }

  const count = Math.max(1, (candleRef ?? 1) + 1);
  const targetCandles = candles.slice(-count);

  let minLow = Infinity;
  let maxHigh = -Infinity;

  targetCandles.forEach(c => {
    const rawL = c.low !== undefined ? c.low : (c.l !== undefined ? c.l : c.close);
    const rawH = c.high !== undefined ? c.high : (c.h !== undefined ? c.h : c.close);
    const l = Number(rawL);
    const h = Number(rawH);
    if (!isNaN(l) && l > 0 && l < minLow) minLow = l;
    if (!isNaN(h) && h > 0 && h > maxHigh) maxHigh = h;
  });

  if (minLow === Infinity || maxHigh === -Infinity) {
    minLow = entryPrice - 20;
    maxHigh = entryPrice + 20;
  }

  // 1 tick de respiro: abaixo da mínima para compra, acima da máxima para venda
  const safeMinLow = roundToTickLocal(minLow - tickSize, tickSize);
  const safeMaxHigh = roundToTickLocal(maxHigh + tickSize, tickSize);

  let slPrice = 0;
  let slPts = 0;

  if (side === 'COMPRA') {
    slPrice = (safeMinLow < entryPrice) ? safeMinLow : roundToTickLocal(entryPrice - (20 * tickSize), tickSize);
    slPts = Math.max(tickSize, Number((entryPrice - slPrice).toFixed(2)));
  } else {
    slPrice = (safeMaxHigh > entryPrice) ? safeMaxHigh : roundToTickLocal(entryPrice + (20 * tickSize), tickSize);
    slPts = Math.max(tickSize, Number((slPrice - entryPrice).toFixed(2)));
  }

  const mult = Math.max(0.1, tpMultiplier || 1.0);
  const tpPts = Math.max(tickSize, Number((slPts * mult).toFixed(2)));
  const tpPrice = roundToTickLocal(side === 'COMPRA' ? entryPrice + tpPts : entryPrice - tpPts, tickSize);

  return {
    slPrice,
    tpPrice,
    slPts,
    tpPts,
    minLow: safeMinLow,
    maxHigh: safeMaxHigh
  };
}
