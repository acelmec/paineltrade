// =====================================================================
// VORTEX WEB — TRADINGVIEW & CHART ERROR LOGGING & DIAGNOSTIC ENGINE
// =====================================================================

export interface ChartErrorEntry {
  id: string;
  timestamp: string;
  timeMs: number;
  type: 'lightweight-charts' | 'indicator-calc' | 'drawings' | 'unhandled-rejection' | 'error-boundary' | 'data-sanitizer';
  message: string;
  stack?: string;
  componentStack?: string;
  panelId?: string;
  panelName?: string;
  timeframe?: number;
  activeIndicators?: string[];
  graphicElement?: string;
  elementCategory?: 'indicator' | 'drawings' | 'markers' | 'levels' | 'news' | 'engine' | 'widgets' | 'unknown';
  probableFile?: string;
  actionableFix?: string;
  candleCount?: number;
  url: string;
  userAgent: string;
  count: number;
  lastOccurred: string;
}

const STORAGE_KEY = 'vortex_tw_error_logs';
const MAX_LOGS = 150;

/**
 * Analisador heurístico inteligente: descobre exatamente qual elemento gráfico,
 * indicador, overlay de desenhos ou cálculo causou a exceção.
 */
export function identifyGraphicElement(
  message: string = '',
  stack: string = '',
  componentStack: string = '',
  customElement?: string
): {
  graphicElement: string;
  elementCategory: 'indicator' | 'drawings' | 'markers' | 'levels' | 'news' | 'engine' | 'widgets' | 'unknown';
  probableFile: string;
  actionableFix: string;
} {
  if (customElement) {
    return {
      graphicElement: customElement,
      elementCategory: 'indicator',
      probableFile: 'src/components/CandleChart.tsx',
      actionableFix: 'Verifique os dados alimentados nesta série/elemento.'
    };
  }

  const combined = `${message} ${stack} ${componentStack}`.toLowerCase();

  // 1. Camada de Desenhos (Overlay de Retângulos, Fibonacci, Linhas de Tendência)
  if (
    combined.includes('chartdrawingsoverlay') ||
    combined.includes('distancetosegment') ||
    combined.includes('evaluatedrawingtrigger') ||
    combined.includes('drawingengine') ||
    combined.includes('calculatefibonacciprices')
  ) {
    return {
      graphicElement: '🎨 Camada de Desenhos no Gráfico (ChartDrawingsOverlay)',
      elementCategory: 'drawings',
      probableFile: 'src/components/ChartDrawingsOverlay.tsx',
      actionableFix: 'Falha durante o cálculo de projeção de coordenadas ou renderização no canvas 2D de desenhos interativos.'
    };
  }

  // 2. Widgets Overlay (DOM, Tape, Relógio, Book)
  if (combined.includes('chartwidgetsoverlay') || combined.includes('widgetregistry')) {
    return {
      graphicElement: '🧩 Camada de Widgets Overlay (ChartWidgetsOverlay)',
      elementCategory: 'widgets',
      probableFile: 'src/components/ChartWidgetsOverlay.tsx',
      actionableFix: 'Falha na atualização de dados ou posicionamento de widgets sobre o gráfico.'
    };
  }

  // 3. Marcadores de Sinais, Robôs e Alertas (createSeriesMarkers / setMarkers)
  if (
    combined.includes('markersplugin') ||
    combined.includes('createseriesmarkers') ||
    combined.includes('setmarkers') ||
    combined.includes('dynamicmarkers') ||
    combined.includes('trademarkers')
  ) {
    return {
      graphicElement: '📍 Marcadores de Sinais & Robôs (Series Markers Plugin)',
      elementCategory: 'markers',
      probableFile: 'src/components/CandleChart.tsx',
      actionableFix: 'Tentativa de aplicar marcadores com posições ou preços incompatíveis com a escala atual de velas.'
    };
  }

  // 4. Séries de Linha Órfãs ou Cor do Cursor (SeriesBarColorer / LinePaneView)
  if (combined.includes('seriesbarcolorer') || combined.includes('linepaneview')) {
    return {
      graphicElement: '📈 Série de Linha de Indicador (MACD / Supertrend / SMA / EMA / Waddah)',
      elementCategory: 'indicator',
      probableFile: 'src/utils/indicatorRegistry.ts',
      actionableFix: 'O cursor passou sobre uma linha com valores vazios/nulos. A série precisa de setData([]) quando desativada.'
    };
  }

  // 5. Escala de Preço / Conversão de Coordenadas (priceToCoordinate / coordinateToPrice)
  if (combined.includes('pricetocoordinate') || combined.includes('coordinatetoprice')) {
    return {
      graphicElement: '📐 Conversor de Coordenadas da Escala de Preço (PriceScale)',
      elementCategory: 'engine',
      probableFile: 'src/components/CandleChart.tsx',
      actionableFix: 'Tentativa de converter preço em pixel antes de candleSeries.setData() ter sido processado pela escala.'
    };
  }

  // 6. Escala Temporal / Timestamps Fora de Ordem (timeToCoordinate / Assertion failed)
  if (
    combined.includes('timetocoordinate') ||
    combined.includes('assertion failed') ||
    combined.includes('ensurenotnull')
  ) {
    return {
      graphicElement: '⏱️ Escala de Tempo & Feed de Candles (TimeScale)',
      elementCategory: 'engine',
      probableFile: 'src/components/CandleChart.tsx',
      actionableFix: 'Timestamps dos candles ou séries não estão em ordem estritamente crescente ou contêm valores duplicados/inválidos.'
    };
  }

  // 7. Níveis Gamma / Linhas de Referência (HVL, Call, Put, Ajuste, GWall)
  if (
    combined.includes('gammalevels') ||
    combined.includes('levelprice') ||
    combined.includes('updatelevellabels') ||
    combined.includes('hvl') ||
    combined.includes('gwall')
  ) {
    return {
      graphicElement: '🎯 Linhas de Níveis Gamma & Preços de Referência',
      elementCategory: 'levels',
      probableFile: 'src/components/CandleChart.tsx',
      actionableFix: 'Falha ao alinhar as linhas horizontais de níveis ou seus rótulos laterais na escala de preço.'
    };
  }

  // 8. Fair Value Gap (FVG)
  if (combined.includes('calculatefvgs') || combined.includes('fvgseriesdata')) {
    return {
      graphicElement: '📊 Blocos de Fair Value Gap (FVG)',
      elementCategory: 'indicator',
      probableFile: 'src/context/AppContext.tsx',
      actionableFix: 'Inconsistência nos intervalos de preços ou tempo das caixas de desequilíbrio (FVG).'
    };
  }

  // 9. Volume Profile / Heatmap de Horários / Spike Pivots
  if (
    combined.includes('timeheatmap') ||
    combined.includes('spikepivots') ||
    combined.includes('volumeanalysis') ||
    combined.includes('hvnblocks')
  ) {
    return {
      graphicElement: '🔥 Análise de Volume & Heatmap de Horários',
      elementCategory: 'indicator',
      probableFile: 'src/utils/indicatorRegistry.ts',
      actionableFix: 'Falha no processamento da matriz de volume intradiário ou pivôs de spike.'
    };
  }

  // 10. Linhas e Marcadores de Notícias
  if (combined.includes('newslist') || combined.includes('fetchnews')) {
    return {
      graphicElement: '📰 Linhas e Marcadores de Notícias Econômicas',
      elementCategory: 'news',
      probableFile: 'src/components/CandleChart.tsx',
      actionableFix: 'Timestamp da notícia com formato inválido ou fora do range de datas carregado no gráfico.'
    };
  }

  // Default: Motor Central do Lightweight Charts
  return {
    graphicElement: '📊 Motor Principal do Gráfico (Lightweight Charts)',
    elementCategory: 'engine',
    probableFile: 'src/components/CandleChart.tsx',
    actionableFix: 'Exceção interna do motor de desenho de candles.'
  };
}

/**
 * Retorna todos os logs de erro registrados do motor gráfico e TradingView.
 */
export function getChartErrorLogs(): ChartErrorEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[ChartErrorLogger] Erro ao ler logs de erro do localStorage:', e);
    return [];
  }
}

/**
 * Registra uma nova ocorrência de erro do TradingView / Lightweight Charts ou cálculos de indicadores.
 * Agrupa duplicatas recentes para evitar flood de memória no navegador.
 */
export function recordChartError(data: Partial<ChartErrorEntry> & { message: string }): ChartErrorEntry {
  if (typeof window === 'undefined') {
    return {
      id: 'ssr',
      timestamp: new Date().toISOString(),
      timeMs: Date.now(),
      type: 'lightweight-charts',
      message: data.message,
      url: '',
      userAgent: '',
      count: 1,
      lastOccurred: new Date().toISOString()
    };
  }

  const now = new Date();
  const timeStr = now.toLocaleString('pt-BR');
  const nowMs = now.getTime();

  const idInfo = identifyGraphicElement(
    data.message || '',
    data.stack || '',
    data.componentStack || '',
    data.graphicElement
  );

  const logs = getChartErrorLogs();

  // Deduplicação inteligente: se o mesmo erro ocorreu nos últimos 15s no mesmo painel, apenas incrementa o contador
  const existingIndex = logs.findIndex(l => 
    l.message === data.message && 
    l.panelId === data.panelId && 
    (nowMs - l.timeMs) < 15000
  );

  let resultEntry: ChartErrorEntry;

  if (existingIndex !== -1) {
    const existing = logs[existingIndex];
    existing.count = (existing.count || 1) + 1;
    existing.lastOccurred = timeStr;
    existing.timeMs = nowMs;
    if (data.stack && !existing.stack) existing.stack = data.stack;
    if (data.componentStack && !existing.componentStack) existing.componentStack = data.componentStack;
    if (data.activeIndicators && data.activeIndicators.length > 0) existing.activeIndicators = data.activeIndicators;
    if (!existing.graphicElement) existing.graphicElement = idInfo.graphicElement;
    if (!existing.probableFile) existing.probableFile = idInfo.probableFile;
    if (!existing.actionableFix) existing.actionableFix = idInfo.actionableFix;
    resultEntry = existing;
    logs.splice(existingIndex, 1);
    logs.unshift(resultEntry);
  } else {
    resultEntry = {
      id: `tw_err_${nowMs}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: timeStr,
      timeMs: nowMs,
      type: data.type || 'lightweight-charts',
      message: data.message || 'Erro desconhecido no motor gráfico',
      stack: data.stack || '',
      componentStack: data.componentStack || '',
      panelId: data.panelId || 'global',
      panelName: data.panelName || 'Painel Principal',
      timeframe: data.timeframe || 1,
      activeIndicators: data.activeIndicators || [],
      graphicElement: data.graphicElement || idInfo.graphicElement,
      elementCategory: data.elementCategory || idInfo.elementCategory,
      probableFile: data.probableFile || idInfo.probableFile,
      actionableFix: data.actionableFix || idInfo.actionableFix,
      candleCount: data.candleCount || 0,
      url: window.location.href,
      userAgent: navigator.userAgent,
      count: 1,
      lastOccurred: timeStr
    };
    logs.unshift(resultEntry);
  }

  // Limita o armazenamento aos últimos MAX_LOGS itens
  const trimmed = logs.slice(0, MAX_LOGS);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed.slice(0, 30)));
    } catch (_) {}
  }

  // Dispara evento para reatividade em tempo real na interface administrativa
  try {
    window.dispatchEvent(new CustomEvent('vortex_chart_error_recorded', { detail: resultEntry }));
  } catch (_) {}

  return resultEntry;
}

/**
 * Limpa todos os logs de erro de TradingView armazenados.
 */
export function clearChartErrorLogs(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('vortex_chart_error_cleared'));
  } catch (_) {}
}

/**
 * Exporta um relatório diagnóstico completo em formato Markdown legível.
 */
export function exportChartErrorReport(): string {
  const logs = getChartErrorLogs();
  if (logs.length === 0) {
    return 'Nenhum erro de TradingView ou gráfico registrado até o momento.';
  }

  let report = `==================================================\n`;
  report += `    VORTEX WEB - RELATÓRIO DIAGNÓSTICO DE ERROS TW\n`;
  report += `==================================================\n`;
  report += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;
  report += `Total de Registros: ${logs.length}\n`;
  report += `Navegador: ${navigator.userAgent}\n`;
  report += `URL: ${window.location.href}\n\n`;

  logs.forEach((log, index) => {
    report += `--------------------------------------------------\n`;
    report += `[REGISTRO #${index + 1}] ID: ${log.id}\n`;
    report += `• Data/Hora: ${log.timestamp} (Última: ${log.lastOccurred})\n`;
    report += `• Ocorrências Repetidas: ${log.count}x\n`;
    report += `• Elemento Gráfico Identificado: ${log.graphicElement || 'N/A'}\n`;
    report += `• Arquivo Fonte Provável: ${log.probableFile || 'N/A'}\n`;
    report += `• Ação Recomendada: ${log.actionableFix || 'N/A'}\n`;
    report += `• Tipo: ${log.type.toUpperCase()}\n`;
    report += `• Painel: ${log.panelName} (ID: ${log.panelId}) | Timeframe: ${log.timeframe}m\n`;
    report += `• Total de Velas: ${log.candleCount}\n`;
    if (log.activeIndicators && log.activeIndicators.length > 0) {
      report += `• Indicadores Ativos: ${log.activeIndicators.join(', ')}\n`;
    }
    report += `• Mensagem: ${log.message}\n`;
    if (log.stack) {
      report += `• Stack Trace:\n${log.stack}\n`;
    }
    if (log.componentStack) {
      report += `• Component Stack:\n${log.componentStack}\n`;
    }
    report += `\n`;
  });

  return report;
}
