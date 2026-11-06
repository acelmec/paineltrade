import { createChart, LineSeries, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import type { Candle } from '../services/db';
import { sanitizeLineSeriesData, sanitizeCandleSeriesData } from './indicatorRegistry';

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

function parseTimestampToSeconds(ts: string | number): number {
  if (typeof ts === 'number') {
    return ts > 1e11 ? Math.floor(ts / 1000) : ts;
  }
  if (!ts) return Math.floor(Date.now() / 1000);
  const cleanStr = String(ts).replace(' ', 'T');
  const d = new Date(cleanStr);
  if (!isNaN(d.getTime())) {
    return Math.floor(d.getTime() / 1000);
  }
  return Math.floor(Date.now() / 1000);
}

function calculateSMA(data: { time: number; close: number }[], period: number) {
  const sma = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    sma.push({
      time: data[i].time,
      value: sum / period,
    });
  }
  return sma;
}

function calculateEMA(data: { time: number; close: number }[], period: number) {
  const ema = [];
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  let emaVal = data[0].close;
  
  ema.push({ time: data[0].time, value: emaVal });
  
  for (let i = 1; i < data.length; i++) {
    emaVal = data[i].close * k + emaVal * (1 - k);
    ema.push({
      time: data[i].time,
      value: emaVal,
    });
  }
  return ema;
}

function calculateRSI(data: { time: number; close: number }[], period: number = 14) {
  const rsi = [];
  if (data.length <= period) return [];
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const diff = data[i].close - data[i - 1].close;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsiVal = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
  
  rsi.push({ time: data[period].time, value: rsiVal });
  
  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i].close - data[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    
    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiVal = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
    
    rsi.push({ time: data[i].time, value: rsiVal });
  }
  return rsi;
}

function calculateMACD(data: { time: number; close: number }[]) {
  if (data.length < 26) return { macd: [], signal: [], histogram: [] };
  
  const ema12 = calculateEMA(data, 12);
  const ema26 = calculateEMA(data, 26);
  
  const macdLine: { time: number; close: number }[] = [];
  const ema26Map = new Map(ema26.map(e => [e.time, e.value]));
  
  for (const e12 of ema12) {
    const e26Val = ema26Map.get(e12.time);
    if (e26Val !== undefined) {
      macdLine.push({
        time: e12.time,
        close: e12.value - e26Val
      });
    }
  }
  
  const signalLine = calculateEMA(macdLine, 9);
  const signalMap = new Map(signalLine.map(s => [s.time, s.value]));
  
  const finalMacd = [];
  const finalSignal = [];
  const histogram = [];
  
  for (const m of macdLine) {
    const sigVal = signalMap.get(m.time);
    if (sigVal !== undefined) {
      finalMacd.push({ time: m.time, value: m.close });
      finalSignal.push({ time: m.time, value: sigVal });
      histogram.push({ time: m.time, value: m.close - sigVal });
    }
  }
  
  return {
    macd: finalMacd,
    signal: finalSignal,
    histogram
  };
}

export async function generateCandleChartScreenshot(options: {
  candles: Candle[];
  gammaLevels: any | null;
  disabledLevels: string[];
  showSma9: boolean;
  showEma21: boolean;
  showEma50: boolean;
  showRsi: boolean;
  showMacd: boolean;
  candleBarCount?: number;
}): Promise<string | null> {
  const {
    candles,
    gammaLevels,
    disabledLevels,
    showSma9,
    showEma21,
    showEma50,
    showRsi,
    showMacd,
    candleBarCount,
  } = options;

  if (!candles || candles.length === 0) return null;

  // 1. Create container simulating 1024x768 display
  const containerWidth = 1024;
  const totalHeight = 768;
  const rsiHeight = showRsi ? 140 : 0;
  const macdHeight = showMacd ? 140 : 0;
  const mainHeight = totalHeight - rsiHeight - macdHeight;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '0px';
  container.style.top = '0px';
  container.style.width = `${containerWidth}px`;
  container.style.height = `${totalHeight}px`;
  container.style.background = '#090d16';
  container.style.zIndex = '-9999';
  container.style.opacity = '0.01';
  container.style.pointerEvents = 'none';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  document.body.appendChild(container);

  // Child divs
  const mainDiv = document.createElement('div');
  mainDiv.style.width = `${containerWidth}px`;
  mainDiv.style.height = `${mainHeight}px`;
  mainDiv.style.display = 'block';
  container.appendChild(mainDiv);

  let rsiDiv: HTMLDivElement | null = null;
  if (showRsi) {
    rsiDiv = document.createElement('div');
    rsiDiv.style.width = `${containerWidth}px`;
    rsiDiv.style.height = `${rsiHeight}px`;
    rsiDiv.style.borderTop = '1px solid #1e293b';
    rsiDiv.style.display = 'block';
    container.appendChild(rsiDiv);
  }

  let macdDiv: HTMLDivElement | null = null;
  if (showMacd) {
    macdDiv = document.createElement('div');
    macdDiv.style.width = `${containerWidth}px`;
    macdDiv.style.height = `${macdHeight}px`;
    macdDiv.style.borderTop = '1px solid #1e293b';
    macdDiv.style.display = 'block';
    container.appendChild(macdDiv);
  }

  const commonOptions = {
    width: containerWidth,
    layout: {
      background: { color: '#090d16' },
      textColor: '#94a3b8',
      fontSize: 12,
      fontFamily: 'JetBrains Mono, monospace'
    },
    grid: {
      vertLines: { color: '#1e293b50' },
      horzLines: { color: '#1e293b50' },
    },
    timeScale: {
      borderColor: '#334155',
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 12,
      barSpacing: 8,
    },
    rightPriceScale: {
      visible: true,
      borderColor: '#334155',
      borderVisible: true,
      minimumWidth: 85,
    }
  };

  // Convert candle times to UNIX timestamps safely
  const chartData = candles
    .map(c => ({
      time: parseTimestampToSeconds(c.timestamp) as any,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume || 0)
    }))
    .filter(c => !isNaN(c.time) && c.time > 0)
    .sort((a, b) => a.time - b.time);

  // Filter unique timestamps
  const uniqueChartData = [];
  const seenTimes = new Set();
  for (const d of chartData) {
    if (!seenTimes.has(d.time)) {
      seenTimes.add(d.time);
      uniqueChartData.push(d);
    }
  }

  if (uniqueChartData.length === 0) {
    document.body.removeChild(container);
    return null;
  }

  // Determine bottom-most panel to show time scale
  const isMainBottom = !showRsi && !showMacd;
  const isRsiBottom = showRsi && !showMacd;

  const mainChart = createChart(mainDiv, {
    ...commonOptions,
    height: mainHeight,
    timeScale: {
      ...commonOptions.timeScale,
      visible: isMainBottom
    }
  });

  const candleSeries = mainChart.addSeries(CandlestickSeries, {
    upColor: '#10b981',
    downColor: '#ef4444',
    borderVisible: false,
    wickUpColor: '#10b981',
    wickDownColor: '#ef4444',
  });
  candleSeries.setData(sanitizeCandleSeriesData(uniqueChartData) as any);

  // Indicators
  const closeData = uniqueChartData.map(d => ({ time: d.time, close: d.close }));

  if (showSma9 && uniqueChartData.length >= 8) {
    const smaData = sanitizeLineSeriesData(calculateSMA(closeData, 8));
    if (smaData.length > 0) {
      const smaSeries = mainChart.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false
      } as any);
      smaSeries.setData(smaData as any);
    }
  }

  if (showEma21 && uniqueChartData.length >= 20) {
    const emaData = sanitizeLineSeriesData(calculateSMA(closeData, 20));
    if (emaData.length > 0) {
      const emaSeries = mainChart.addSeries(LineSeries, {
        color: '#f97316',
        lineWidth: 2,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false
      } as any);
      emaSeries.setData(emaData as any);
    }
  }

  if (showEma50 && uniqueChartData.length >= 50) {
    const emaData = sanitizeLineSeriesData(calculateSMA(closeData, 50));
    if (emaData.length > 0) {
      const emaSeries = mainChart.addSeries(LineSeries, {
        color: '#d946ef',
        lineWidth: 2,
        title: '',
        lastValueVisible: false,
        priceLineVisible: false
      } as any);
      emaSeries.setData(emaData as any);
    }
  }

  // Volume
  const volumeSeries = mainChart.addSeries(HistogramSeries, {
    color: '#3b82f640',
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
    title: '',
    lastValueVisible: false,
    priceLineVisible: false
  } as any);
  mainChart.priceScale('volume').applyOptions({
    scaleMargins: { top: 0.8, bottom: 0 },
  });
  const safeVolumeData = sanitizeLineSeriesData(uniqueChartData.map(d => ({
    time: d.time,
    value: d.volume,
    color: d.close >= d.open ? '#10b98130' : '#ef444430'
  })));
  volumeSeries.setData(safeVolumeData as any);

  // Gamma Levels
  if (gammaLevels) {
    Object.entries(LEVEL_CONFIGS).forEach(([key, cfg]) => {
      if (disabledLevels.includes(key)) return;
      const priceRaw = (gammaLevels as any)[key];
      const priceVal = Number(priceRaw);
      if (priceRaw !== undefined && priceRaw !== null && !isNaN(priceVal) && priceVal > 0) {
        candleSeries.createPriceLine({
          price: priceVal,
          color: cfg.color,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: false,
          title: cfg.label,
        });
      }
    });
  }

  // RSI
  let rsiChart: any = null;
  if (showRsi && rsiDiv && uniqueChartData.length > 14) {
    rsiChart = createChart(rsiDiv, {
      ...commonOptions,
      height: rsiHeight,
      timeScale: {
        ...commonOptions.timeScale,
        visible: isRsiBottom
      }
    });
    const rsiSeries = rsiChart.addSeries(LineSeries, {
      color: '#6366f1',
      lineWidth: 2,
      title: '',
      lastValueVisible: false,
      priceLineVisible: false
    } as any);
    rsiSeries.setData(calculateRSI(closeData, 14) as any);

    const level70 = rsiChart.addSeries(LineSeries, { color: '#ef444440', lineWidth: 1, lineStyle: 2, title: '', lastValueVisible: false, priceLineVisible: false } as any);
    level70.setData(uniqueChartData.map(d => ({ time: d.time, value: 70 })) as any);
    const level30 = rsiChart.addSeries(LineSeries, { color: '#10b98140', lineWidth: 1, lineStyle: 2, title: '', lastValueVisible: false, priceLineVisible: false } as any);
    level30.setData(uniqueChartData.map(d => ({ time: d.time, value: 30 })) as any);
  }

  // MACD
  let macdChart: any = null;
  if (showMacd && macdDiv && uniqueChartData.length > 26) {
    macdChart = createChart(macdDiv, {
      ...commonOptions,
      height: macdHeight,
      timeScale: {
        ...commonOptions.timeScale,
        visible: true
      }
    });
    const { macd, signal, histogram } = calculateMACD(closeData);
    const macdSeries = macdChart.addSeries(LineSeries, { color: '#2563eb', lineWidth: 2, title: '', lastValueVisible: false, priceLineVisible: false } as any);
    macdSeries.setData(macd as any);
    const signalSeries = macdChart.addSeries(LineSeries, { color: '#e11d48', lineWidth: 2, title: '', lastValueVisible: false, priceLineVisible: false } as any);
    signalSeries.setData(signal as any);
    const histSeries = macdChart.addSeries(HistogramSeries, { priceScaleId: 'hist', title: '', lastValueVisible: false, priceLineVisible: false } as any);
    macdChart.priceScale('hist').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    histSeries.setData(histogram.map(h => ({ time: h.time, value: h.value, color: h.value >= 0 ? '#10b98180' : '#ef444480' })) as any);
  }

  // Synchronize logical range so current (latest) candles are centered/framed properly on right
  const charts = [mainChart, rsiChart, macdChart].filter(Boolean);
  if (charts.length > 0) {
    const totalBars = uniqueChartData.length;
    const barCount = Math.min(candleBarCount || 80, totalBars);
    const logicalRange = {
      from: totalBars - barCount,
      to: totalBars + 4, // 4 bars right offset margin
    };

    charts.forEach(c => {
      c.timeScale().setVisibleLogicalRange(logicalRange as any);
    });
  }

  // Microtask wait for full canvas paint
  await new Promise(resolve => setTimeout(resolve, 450));

  try {
    const activeCanvases: HTMLCanvasElement[] = [];
    const mainCanvas = mainChart.takeScreenshot();
    if (mainCanvas) activeCanvases.push(mainCanvas);

    if (showRsi && rsiChart) {
      const rsiCanvas = rsiChart.takeScreenshot();
      if (rsiCanvas) activeCanvases.push(rsiCanvas);
    }

    if (showMacd && macdChart) {
      const macdCanvas = macdChart.takeScreenshot();
      if (macdCanvas) activeCanvases.push(macdCanvas);
    }

    if (activeCanvases.length === 0) return null;

    if (activeCanvases.length === 1) {
      const b64 = mainCanvas.toDataURL('image/png');
      mainChart.remove();
      document.body.removeChild(container);
      return b64;
    }

    const mergedCanvas = document.createElement('canvas');
    mergedCanvas.width = containerWidth;
    mergedCanvas.height = activeCanvases.reduce((sum, c) => sum + c.height, 0);

    const ctx = mergedCanvas.getContext('2d');
    if (!ctx) return null;

    let currentY = 0;
    activeCanvases.forEach(c => {
      ctx.drawImage(c, 0, currentY);
      currentY += c.height;
    });

    const b64 = mergedCanvas.toDataURL('image/png');

    // Cleanup
    mainChart.remove();
    if (rsiChart) rsiChart.remove();
    if (macdChart) macdChart.remove();
    document.body.removeChild(container);

    return b64;
  } catch (err) {
    console.error('Error taking offscreen screenshot:', err);
    try {
      mainChart.remove();
      if (rsiChart) rsiChart.remove();
      if (macdChart) macdChart.remove();
      document.body.removeChild(container);
    } catch (_) {}
    return null;
  }
}

