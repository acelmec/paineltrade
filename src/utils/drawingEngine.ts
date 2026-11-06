import type { DrawingItem, DrawingPoint, DrawingToolType, TriggerMode } from '../types/chartDrawings';
import { FIB_LEVELS } from '../types/chartDrawings';
import type { Candle } from '../services/db';

/**
 * Cria um novo item de desenho com valores padrão
 */
export function createNewDrawing(
  type: DrawingToolType,
  firstPoint: DrawingPoint,
  symbol?: string,
  accountId?: string,
  timeframe?: number
): DrawingItem {
  const id = `draw_${type}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  
  let defaultColor = '#38bdf8';
  if (type === 'rectangle') defaultColor = '#fbbf24';
  if (type === 'fibonacci') defaultColor = '#a855f7';
  if (type === 'channel') defaultColor = '#34d399';
  if (type === 'text') defaultColor = '#ffffff';
  if (type === 'arrow') defaultColor = '#f59e0b';
  if (type === 'ruler') defaultColor = '#38bdf8';

  return {
    id,
    type,
    points: [firstPoint],
    color: defaultColor,
    lineWidth: 2,
    lineStyle: 0,
    fillColor: defaultColor,
    fillOpacity: 0.15,
    visible: true,
    locked: false,
    channelDistancePts: 30,
    textValue: type === 'text' ? 'Novo Texto' : undefined,
    textFontSize: type === 'text' ? 13 : undefined,
    trigger: {
      enabled: false, // Por padrão, automação por toque sempre desativada
      mode: 'reversal',
      targetFibLevel: 0.618,
      channelSide: 'both',
      requireConfirmation: false,
      status: 'disabled',
      contracts: 1,
      stopLossPts: 50,
      takeProfitPts: 50
    },
    createdAt: Date.now(),
    symbol,
    accountId,
    timeframe: timeframe || 1
  };
}

/**
 * Calcula o preço de uma linha de tendência em um determinado timestamp (com normalização de tempo e projeção futura)
 */
export function getTrendLinePriceAtTime(p1: DrawingPoint, p2: DrawingPoint, targetTime: number): number | null {
  if (!p1 || !p2) return null;

  const parseTimeSec = (t: any): number => {
    if (typeof t === 'number') {
      return t > 10000000000 ? Math.floor(t / 1000) : t;
    }
    if (typeof t === 'string') {
      const ms = new Date(t).getTime();
      if (!isNaN(ms)) return Math.floor(ms / 1000);
      const num = parseFloat(t);
      if (!isNaN(num)) return num > 10000000000 ? Math.floor(num / 1000) : num;
    }
    return NaN;
  };

  const t1 = parseTimeSec(p1.time);
  const t2 = parseTimeSec(p2.time);
  const tTarget = parseTimeSec(targetTime);

  if (isNaN(t1) || isNaN(t2) || isNaN(tTarget)) {
    return (p1.price + p2.price) / 2;
  }

  const dt = t2 - t1;
  if (dt === 0) return p1.price;
  const slope = (p2.price - p1.price) / dt;
  return p1.price + slope * (tTarget - t1);
}

/**
 * Calcula os preços de todos os níveis de Fibonacci entre 2 pontos
 */
export function calculateFibonacciPrices(p1: DrawingPoint, p2: DrawingPoint): Array<{ level: number; label: string; price: number; color: string }> {
  const high = Math.max(p1.price, p2.price);
  const low = Math.min(p1.price, p2.price);
  const diff = high - low;
  const isUpTrend = p2.price >= p1.price;

  return FIB_LEVELS.map(f => {
    const price = isUpTrend ? high - diff * f.level : low + diff * f.level;
    return {
      level: f.level,
      label: f.label,
      price: Math.round(price * 100) / 100,
      color: f.color
    };
  });
}

/**
 * Retorna o rótulo curto do desenho e modo de operação (ex: RP BOX, RV FIBO, RP LINE, etc.)
 */
export function getDrawingShortLabel(type: DrawingToolType, mode: TriggerMode): string {
  const prefix = mode === 'breakout' ? 'RP' : 'RV';
  let toolSuffix = 'LINE';
  if (type === 'trend_line') toolSuffix = 'TREND';
  else if (type === 'rectangle') toolSuffix = 'BOX';
  else if (type === 'fibonacci') toolSuffix = 'FIBO';
  else if (type === 'channel') toolSuffix = 'CANAL';
  return `${prefix} ${toolSuffix}`;
}

/**
 * Interface para resultado de avaliação de gatilho
 */
export interface TriggerEvaluationResult {
  triggered: boolean;
  drawingId: string;
  side: 'COMPRA' | 'VENDA';
  price: number;
  description: string;
  executionType: 'simple' | 'panel_bias' | 'algorithm';
  requireConfirmation: boolean;
  targetAlgorithmId?: string;
  targetAlgorithmName?: string;
}

/**
 * Avalia se um candle ou preço atual acionou o gatilho de um desenho
 */
export function evaluateDrawingTrigger(
  drawing: DrawingItem,
  currentCandle: Candle,
  prevCandle?: Candle
): TriggerEvaluationResult | null {
  if (!drawing.trigger || !drawing.trigger.enabled || (drawing.trigger.status !== 'armed' && drawing.trigger.status !== 'waiting_algo')) {
    return null;
  }

  const { mode, requireConfirmation, targetAlgorithmId, targetAlgorithmName } = drawing.trigger;
  const execType = drawing.trigger.executionType || (targetAlgorithmId ? 'algorithm' : (requireConfirmation ? 'panel_bias' : 'simple'));
  const shortLabel = getDrawingShortLabel(drawing.type, mode);
  const cHigh = currentCandle.high;
  const cLow = currentCandle.low;
  const prevClose = prevCandle ? prevCandle.close : currentCandle.open;
  
  const rawTime = currentCandle.timestamp;
  const candleTimeMs = typeof rawTime === 'number' ? rawTime : new Date(rawTime).getTime();
  const candleTimeSec = candleTimeMs > 10000000000 ? Math.floor(candleTimeMs / 1000) : candleTimeMs;

  const makeResult = (side: 'COMPRA' | 'VENDA', price: number, extraDesc?: string): TriggerEvaluationResult => ({
    triggered: true,
    drawingId: drawing.id,
    side,
    price,
    description: extraDesc ? `${shortLabel} ${extraDesc}` : `${shortLabel} (${price.toFixed(2)})`,
    executionType: execType,
    requireConfirmation: execType === 'panel_bias' || !!requireConfirmation,
    targetAlgorithmId,
    targetAlgorithmName
  });

  // 1. LINHA HORIZONTAL
  if (drawing.type === 'horizontal_line' && drawing.points.length >= 1) {
    const levelPrice = drawing.points[0].price;
    const touchesLevel = cLow <= levelPrice && cHigh >= levelPrice;

    if (touchesLevel) {
      if (mode === 'reversal') {
        const side = prevClose <= levelPrice ? 'VENDA' : 'COMPRA';
        return makeResult(side, levelPrice);
      } else if (mode === 'breakout') {
        const side = prevClose <= levelPrice ? 'COMPRA' : 'VENDA';
        return makeResult(side, levelPrice);
      }
    }
  }

  // 2. LINHA DE TENDÊNCIA
  if (drawing.type === 'trend_line' && drawing.points.length >= 2) {
    const p1 = drawing.points[0];
    const p2 = drawing.points[1];
    const trendPrice = getTrendLinePriceAtTime(p1, p2, candleTimeSec);

    if (trendPrice !== null && !isNaN(trendPrice)) {
      const touchesLine = cLow <= trendPrice && cHigh >= trendPrice;
      const isLTB = p2.price < p1.price; // Linha de Tendência de Baixa (inclinação descendente)

      if (touchesLine || (prevClose <= trendPrice && cHigh >= trendPrice) || (prevClose >= trendPrice && cLow <= trendPrice)) {
        if (mode === 'reversal') {
          // Em LTB (baixa), a reversão ao tocar/pullback na linha é sempre VENDA
          // Em LTA (alta), a reversão ao tocar/pullback na linha é sempre COMPRA
          const side = isLTB ? 'VENDA' : 'COMPRA';
          return makeResult(side, trendPrice);
        } else if (mode === 'breakout') {
          // Em LTB, o rompimento para cima é COMPRA
          // Em LTA, o rompimento para baixo é VENDA
          const side = isLTB ? 'COMPRA' : 'VENDA';
          return makeResult(side, trendPrice);
        }
      }
    }
  }

  // 3. RETÂNGULO (REGIÃO / BOX)
  if (drawing.type === 'rectangle' && drawing.points.length >= 2) {
    const minPrice = Math.min(drawing.points[0].price, drawing.points[1].price);
    const maxPrice = Math.max(drawing.points[0].price, drawing.points[1].price);

    const touchesUpper = cHigh >= maxPrice;
    const touchesLower = cLow <= minPrice;

    if (touchesUpper) {
      if (mode === 'reversal') {
        return makeResult('VENDA', maxPrice, `Topo [${maxPrice.toFixed(2)}]`);
      } else {
        return makeResult('COMPRA', maxPrice, `Rompimento Topo [${maxPrice.toFixed(2)}]`);
      }
    } else if (touchesLower) {
      if (mode === 'reversal') {
        return makeResult('COMPRA', minPrice, `Fundo [${minPrice.toFixed(2)}]`);
      } else {
        return makeResult('VENDA', minPrice, `Rompimento Fundo [${minPrice.toFixed(2)}]`);
      }
    }
  }

  // 4. RETRAÇÃO DE FIBONACCI
  if (drawing.type === 'fibonacci' && drawing.points.length >= 2) {
    const targetFib = drawing.trigger.targetFibLevel ?? 0.618;
    const fibLevels = calculateFibonacciPrices(drawing.points[0], drawing.points[1]);
    const target = fibLevels.find(f => Math.abs(f.level - targetFib) < 0.001) || fibLevels[4];

    if (target) {
      const fibPrice = target.price;
      const touchesFib = cLow <= fibPrice && cHigh >= fibPrice;
      const isDownFib = drawing.points[1].price < drawing.points[0].price;

      if (touchesFib || (prevClose <= fibPrice && cHigh >= fibPrice) || (prevClose >= fibPrice && cLow >= fibPrice)) {
        if (mode === 'reversal') {
          const side = isDownFib ? 'VENDA' : 'COMPRA';
          return makeResult(side, fibPrice, `${target.label} (${fibPrice.toFixed(2)})`);
        } else if (mode === 'breakout') {
          const side = isDownFib ? 'COMPRA' : 'VENDA';
          return makeResult(side, fibPrice, `${target.label} (${fibPrice.toFixed(2)})`);
        }
      }
    }
  }

  // 5. CANAL PARALELO / DE TENDÊNCIA
  if (drawing.type === 'channel' && drawing.points.length >= 2) {
    const p1 = drawing.points[0];
    const p2 = drawing.points[1];
    const midTrendPrice = getTrendLinePriceAtTime(p1, p2, candleTimeSec);

    if (midTrendPrice !== null && !isNaN(midTrendPrice)) {
      const dist = drawing.channelDistancePts || 30;
      const upperLinePrice = midTrendPrice + dist;
      const lowerLinePrice = midTrendPrice - dist;
      const side = drawing.trigger.channelSide || 'both';

      const touchesUpper = cHigh >= upperLinePrice;
      const touchesLower = cLow <= lowerLinePrice;

      if ((side === 'both' || side === 'upper') && touchesUpper) {
        if (mode === 'reversal') {
          return makeResult('VENDA', upperLinePrice, `Topo (${upperLinePrice.toFixed(2)})`);
        } else {
          return makeResult('COMPRA', upperLinePrice, `Topo (${upperLinePrice.toFixed(2)})`);
        }
      } else if ((side === 'both' || side === 'lower') && touchesLower) {
        if (mode === 'reversal') {
          return makeResult('COMPRA', lowerLinePrice, `Fundo (${lowerLinePrice.toFixed(2)})`);
        } else {
          return makeResult('VENDA', lowerLinePrice, `Fundo (${lowerLinePrice.toFixed(2)})`);
        }
      }
    }
  }

  return null;
}
