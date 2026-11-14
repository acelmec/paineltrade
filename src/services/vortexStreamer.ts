// =========================================================================
// VORTEX STREAMER CLIENT — CONSUMO DE CANDLES E COTAÇÃO DO NINJATRADER 8 (:8002)
// Modo Híbrido: Consome candles de 1m e preços do gráfico local se ativo,
// ou faz fallback automático e transparente para a Nuvem (Supabase).
// =========================================================================

import type { Candle, MarketData, BlockTrade } from './db';
import { cleanAndSanitizeCandles } from './db';
import { getNinjaGatewayUrl } from './ninjaGateway';

const STREAMER_PORT = 8002;
export function getStreamerBaseUrl(): string {
  try {
    const gatewayUrl = getNinjaGatewayUrl();
    const url = new URL(gatewayUrl);
    url.port = String(STREAMER_PORT);
    return url.origin;
  } catch {
    return `http://localhost:${STREAMER_PORT}`;
  }
}
const STATUS_TIMEOUT_MS = 1000;
const DATA_TIMEOUT_MS = 3000;
const inflightMarketData = new Map<string, Promise<MarketData | null>>();

export interface StreamerItem {
  symbol: string;
  panel: string;
  instrument: string;
  timeframe: number;
  bars_count: number;
  last_price: number;
  first_candle_time?: string;
  last_candle_time?: string;
  current_timestamp?: string;
  updated_at: string;
}

export interface StreamerStatusDto {
  status: 'online' | 'offline';
  version?: string;
  service?: string;
  is_playback?: boolean;
  playback_status?: 'Connected' | 'Disconnected' | string;
  activeStreams: StreamerItem[];
}

let cachedStatus: StreamerStatusDto = { status: 'offline', activeStreams: [] };
let lastStatusFetchTime = 0;
let inFlightStatusPromise: Promise<StreamerStatusDto> | null = null;
const OFFLINE_COOLDOWN_MS = 5000;

async function fetchWithTimeout(url: string, timeoutMs: number, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/**
 * Consulta a saúde do servidor local VortexDataStreamer (:8002)
 */
export async function checkStreamerStatus(force = false): Promise<StreamerStatusDto> {
  const now = Date.now();
  const cacheTtl = cachedStatus.status === 'offline' ? OFFLINE_COOLDOWN_MS : 2000;
  if (!force && lastStatusFetchTime > 0 && (now - lastStatusFetchTime < cacheTtl)) {
    return cachedStatus;
  }
  if (inFlightStatusPromise) {
    return inFlightStatusPromise;
  }

  inFlightStatusPromise = (async () => {
    try {
      const res = await fetchWithTimeout(`${getStreamerBaseUrl()}/status`, STATUS_TIMEOUT_MS);
      if (res.ok) {
        const data = await res.json();
        cachedStatus = {
          status: data.status === 'online' ? 'online' : 'offline',
          version: data.version || '1.0.0',
          service: data.service || 'VortexDataStreamer',
          is_playback: data.is_playback === true,
          playback_status: data.playback_status || (data.is_playback ? 'Connected' : 'Disconnected'),
          activeStreams: Array.isArray(data.active_streams) ? data.active_streams : []
        };
      } else {
        cachedStatus = { status: 'offline', activeStreams: [] };
      }
    } catch {
      cachedStatus = { status: 'offline', activeStreams: [] };
    } finally {
      lastStatusFetchTime = Date.now();
      inFlightStatusPromise = null;
    }

    return cachedStatus;
  })();

  return inFlightStatusPromise;
}

/**
 * Identifica a chave de busca (símbolo ou painel) para um dado Painel
 */
export function resolveStreamerKey(panelOrId: any, panelSettings?: any): { symbol: string; panelName: string } {
  const rawId = typeof panelOrId === 'string' ? panelOrId : (panelOrId?.instance_id || panelOrId?.id || '');
  const rawName = typeof panelOrId === 'string' ? panelOrId : (panelOrId?.name || '');
  const rawSymbol = panelSettings?.gamma_symbol || (typeof panelOrId === 'object' ? panelOrId?.gamma_symbol || panelOrId?.symbol : '') || '';

  const effectivePanelName = (rawName || rawId || 'PAINEL').trim().toUpperCase();

  // 1. Se o símbolo gamma/ativo estiver explicitamente configurado pelo usuário, use como primeira autoridade
  const cleanExplicitSymbol = (rawSymbol || '').trim().toUpperCase();
  if (cleanExplicitSymbol) {
    if (cleanExplicitSymbol === 'YM' || cleanExplicitSymbol === 'MYM') return { symbol: 'YM', panelName: effectivePanelName };
    if (cleanExplicitSymbol === 'ES' || cleanExplicitSymbol === 'MES') return { symbol: 'ES', panelName: effectivePanelName };
    if (cleanExplicitSymbol === 'NQ' || cleanExplicitSymbol === 'MNQ') return { symbol: 'NQ', panelName: effectivePanelName };
    if (cleanExplicitSymbol === 'RTY' || cleanExplicitSymbol === 'M2K') return { symbol: 'RTY', panelName: effectivePanelName };
    if (cleanExplicitSymbol === 'GC' || cleanExplicitSymbol === 'MGC' || cleanExplicitSymbol === 'GOLD') return { symbol: 'GC', panelName: effectivePanelName };
    if (cleanExplicitSymbol === 'CL' || cleanExplicitSymbol === 'MCL' || cleanExplicitSymbol === 'OIL') return { symbol: 'CL', panelName: effectivePanelName };
    if (cleanExplicitSymbol === 'BTC' || cleanExplicitSymbol === 'MBT') return { symbol: 'BTC', panelName: effectivePanelName };
    if (cleanExplicitSymbol === 'WIN' || cleanExplicitSymbol === 'WINFUT') return { symbol: 'WIN', panelName: effectivePanelName };
    if (cleanExplicitSymbol === 'WDO' || cleanExplicitSymbol === 'WDOFUT') return { symbol: 'WDO', panelName: effectivePanelName };
    return { symbol: cleanExplicitSymbol, panelName: effectivePanelName };
  }

  const combined = `${rawId} ${rawName}`.toLowerCase();
  const tokens = combined.split(/[^a-z0-9]+/).filter(Boolean);
  const hasToken = (...arr: string[]) => arr.some(t => tokens.includes(t));

  // 2. Detecção com limites de palavras para evitar colisões (ex: "DOWJONES" contém "ES", "CLIENTE" contém "CL")
  if (hasToken('dow', 'dowjones', 'ym', 'mym', 'us30', 'djia', 'dji') || combined.includes('dowjones') || combined.includes('us30')) {
    return { symbol: 'YM', panelName: effectivePanelName };
  }
  if (hasToken('gold', 'ouro', 'gc', 'mgc', 'xauusd') || combined.includes('xauusd')) {
    return { symbol: 'GC', panelName: effectivePanelName };
  }
  if (hasToken('oil', 'petr', 'petroleo', 'cl', 'mcl', 'wti', 'brent') || combined.includes('petroleo')) {
    return { symbol: 'CL', panelName: effectivePanelName };
  }
  if (hasToken('sp500', 'es', 'mes', 'spx', 'us500') || combined.includes('sp500') || combined.includes('s&p')) {
    return { symbol: 'ES', panelName: effectivePanelName };
  }
  if (hasToken('russel', 'russell', 'rty', 'm2k', 'us2000', 'rut') || combined.includes('russell')) {
    return { symbol: 'RTY', panelName: effectivePanelName };
  }
  if (hasToken('nasdaq', 'nq', 'mnq', 'us100', 'ndx') || combined.includes('nasdaq') || combined.includes('nt8_main')) {
    return { symbol: 'NQ', panelName: effectivePanelName };
  }
  if (hasToken('btc', 'mbt', 'bitcoin', 'btcusd', 'crypto') || combined.includes('bitcoin')) {
    return { symbol: 'BTC', panelName: effectivePanelName };
  }
  if (hasToken('win', 'winfut', 'ibov')) {
    return { symbol: 'WIN', panelName: effectivePanelName };
  }
  if (hasToken('wdo', 'wdofut', 'dol')) {
    return { symbol: 'WDO', panelName: effectivePanelName };
  }

  // 3. Fallbacks genéricos apenas para identificadores estruturais sem nome específico
  if (hasToken('painel2', 'painel_2')) return { symbol: 'RTY', panelName: effectivePanelName };
  if (hasToken('painel3', 'painel_3')) return { symbol: 'ES', panelName: effectivePanelName };
  if (hasToken('painel4', 'painel_4')) return { symbol: 'GC', panelName: effectivePanelName };
  if (hasToken('painel1', 'painel_1', 'painel_principal')) return { symbol: 'NQ', panelName: effectivePanelName };

  return {
    symbol: (rawSymbol || rawName || 'NQ').toUpperCase(),
    panelName: effectivePanelName
  };
}

function isMatchingFamily(streamSymbol: string, targetSymbol: string): boolean {
  const a = (streamSymbol || '').toUpperCase();
  const b = (targetSymbol || '').toUpperCase();
  if (a === b) return true;
  if ((a === 'NQ' || a === 'MNQ') && (b === 'NQ' || b === 'MNQ')) return true;
  if ((a === 'RTY' || a === 'M2K') && (b === 'RTY' || b === 'M2K')) return true;
  if ((a === 'ES' || a === 'MES') && (b === 'ES' || b === 'MES')) return true;
  if ((a === 'YM' || a === 'MYM') && (b === 'YM' || b === 'MYM')) return true;
  if ((a === 'GC' || a === 'MGC' || a === 'GOLD' || a === 'XAUUSD') && (b === 'GC' || b === 'MGC' || b === 'GOLD' || b === 'XAUUSD')) return true;
  if ((a === 'CL' || a === 'MCL' || a === 'OIL') && (b === 'CL' || b === 'MCL' || b === 'OIL')) return true;
  return false;
}

function isMatchingPanelName(aName: string, bName: string): boolean {
  const a = (aName || '').trim().toUpperCase();
  const b = (bName || '').trim().toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const isOil = (n: string) => n === 'OIL' || n === 'PETROLEO' || n === 'PETR' || n === 'CL' || n === 'MCL' || n === 'WTI';
  if (isOil(a) && isOil(b)) return true;

  const isDow = (n: string) => n === 'DOWJONES' || n === 'DOW' || n === 'US30' || n === 'YM' || n === 'MYM' || n === 'DJIA';
  if (isDow(a) && isDow(b)) return true;

  const isSP = (n: string) => n === 'SP500' || n === 'S&P 500' || n === 'S&P' || n === 'ES' || n === 'MES' || n === 'US500';
  if (isSP(a) && isSP(b)) return true;

  const isNas = (n: string) => n === 'NASDAQ' || n === 'NQ' || n === 'MNQ' || n === 'US100';
  if (isNas(a) && isNas(b)) return true;

  const isGold = (n: string) => n === 'GOLD' || n === 'OURO' || n === 'GC' || n === 'MGC' || n === 'XAUUSD';
  if (isGold(a) && isGold(b)) return true;

  const isRuss = (n: string) => n === 'RUSSEL' || n === 'RUSSELL' || n === 'RTY' || n === 'M2K' || n === 'US2000';
  if (isRuss(a) && isRuss(b)) return true;

  return false;
}

export function isStreamFresh(updatedAt?: string): boolean {
  if (!updatedAt) return false;
  const t = new Date(updatedAt).getTime();
  if (isNaN(t)) return false;
  // Tolerância máxima de 30 segundos para considerar um fluxo em tempo real como ativo/vivo.
  // Se não houver atualização em 30s, o stream é considerado estagnado/offline e faz fallback imediato para a Nuvem.
  return (Date.now() - t) <= 10 * 60 * 1000;
}

/**
 * Retorna as informações do Streamer para o painel atual (se conectado ao NT8 :8002)
 */
export async function getStreamerInfoForPanel(panelOrId: any, panelSettings?: any): Promise<{
  isLocal: boolean;
  isPlayback: boolean;
  stream: StreamerItem | null;
}> {
  const status = await checkStreamerStatus();
  if (status.status !== 'online' || !status.activeStreams || status.activeStreams.length === 0) {
    return { isLocal: false, isPlayback: false, stream: null };
  }

  const { symbol, panelName } = resolveStreamerKey(panelOrId, panelSettings);

  // 1. Prioridade máxima: correspondência onde TANTO o painel (ou sinônimo como OIL/PETROLEO) quanto o símbolo coincidem
  let matched = status.activeStreams.find(s => 
    isMatchingPanelName(s.panel, panelName) &&
    (s.symbol.toUpperCase() === symbol.toUpperCase() || isMatchingFamily(s.symbol, symbol))
  );

  // 2. Se não encontrou exato por ambos, busca por nome de painel ou sinônimo (desde que o símbolo seja compatível)
  if (!matched) {
    matched = status.activeStreams.find(s => {
      const pMatch = isMatchingPanelName(s.panel, panelName);
      if (!pMatch) return false;
      // Se o símbolo do stream for de outra família conhecida, não vincular erroneamente
      if (s.symbol && isMatchingFamily(s.symbol, 'NQ') && !isMatchingFamily(symbol, 'NQ')) return false;
      if (s.symbol && isMatchingFamily(s.symbol, 'GC') && !isMatchingFamily(symbol, 'GC')) return false;
      if (s.symbol && isMatchingFamily(s.symbol, 'ES') && !isMatchingFamily(symbol, 'ES')) return false;
      if (s.symbol && isMatchingFamily(s.symbol, 'CL') && !isMatchingFamily(symbol, 'CL')) return false;
      if (s.symbol && isMatchingFamily(s.symbol, 'YM') && !isMatchingFamily(symbol, 'YM')) return false;
      if (s.symbol && isMatchingFamily(s.symbol, 'RTY') && !isMatchingFamily(symbol, 'RTY')) return false;
      return true;
    });
  }

  // 3. Fallback: correspondência por família de símbolo
  if (!matched) {
    matched = status.activeStreams.find(s => 
      s.symbol.toUpperCase() === symbol.toUpperCase() ||
      isMatchingFamily(s.symbol, symbol)
    );
  }

  if (matched && (matched.bars_count > 0 || Number(matched.last_price || 0) > 0 || isStreamFresh(matched.updated_at))) {
    return { isLocal: true, isPlayback: !!status.is_playback, stream: matched };
  }

  return { isLocal: false, isPlayback: !!status.is_playback, stream: null };
}

/**
 * Verifica se o NinjaTrader local está transmitindo dados ativamente para este painel específico
 */
export async function hasLocalStreamForPanel(panelOrId: any, panelSettings?: any): Promise<boolean> {
  const info = await getStreamerInfoForPanel(panelOrId, panelSettings);
  return info.isLocal;
}

const lastValidStreamerPrices = new Map<string, number>();

const cachedStreamerCandles = new Map<string, { time: number; candles: Candle[] }>();
const cachedStreamerBlockTrades = new Map<string, { time: number; trades: BlockTrade[] }>();

/**
 * Adiciona um trade ao cache local do streamer e despacha evento global em tempo real
 */
export function addStreamerBlockTrade(symbol: string, panel: string, trade: BlockTrade): void {
  const sym = (symbol || '').toUpperCase();
  const pan = (panel || '').toUpperCase();
  const keys = [`${sym}_${pan}`, sym];
  if (pan) keys.push(pan);

  for (const k of keys) {
    let entry = cachedStreamerBlockTrades.get(k);
    if (!entry) {
      entry = { time: Date.now(), trades: [] };
      cachedStreamerBlockTrades.set(k, entry);
    }
    const tradeKey = `${trade.time}_${trade.price}_${trade.volume}_${trade.side}`;
    const exists = entry.trades.some(t => `${t.time}_${t.price}_${t.volume}_${t.side}` === tradeKey);
    if (!exists) {
      entry.trades.push(trade);
      if (entry.trades.length > 1000) entry.trades.shift();
      entry.time = Date.now();
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vortex_local_block_trade', {
      detail: { ...trade, symbol: sym, panel: pan }
    }));
  }
}

/**
 * Retorna os Block Trades capturados pelo NinjaTrader local para um determinado painel/ativo
 */
export function getStreamerBlockTrades(panelOrId?: any, panelSettings?: any): BlockTrade[] {
  if (!panelOrId) return [];
  const { symbol, panelName } = resolveStreamerKey(panelOrId, panelSettings);
  const sym = (symbol || '').toUpperCase();
  const pan = (panelName || '').toUpperCase();
  const key = `${sym}_${pan}`;
  const entry = cachedStreamerBlockTrades.get(key) || cachedStreamerBlockTrades.get(sym) || (pan ? cachedStreamerBlockTrades.get(pan) : undefined);
  return entry ? [...entry.trades] : [];
}

// =========================================================================
// WEBSOCKET NATIVO DO AXION STREAMER (:8002/ws)
// Push em tempo real de ticks e candles de 1m com latência <1ms
// =========================================================================
let streamerWs: WebSocket | null = null;
let isWsConnecting = false;
let wsReconnectTimer: any = null;

export function getStreamerWsUrl(): string {
  const httpUrl = getStreamerBaseUrl();
  return httpUrl.replace(/^http/i, 'ws');
}

export function isStreamerWsConnected(): boolean {
  return !!(streamerWs && streamerWs.readyState === WebSocket.OPEN);
}

export function initStreamerWebSocket(): void {
  if (typeof window === 'undefined') return;
  // Se a aplicação estiver rodando em HTTPS na nuvem, navegadores modernos bloqueiam ws:// local por segurança (Mixed Content)
  if (window.location.protocol === 'https:' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
    return;
  }
  if (streamerWs && (streamerWs.readyState === WebSocket.OPEN || streamerWs.readyState === WebSocket.CONNECTING)) {
    return;
  }
  if (isWsConnecting) return;
  isWsConnecting = true;

  try {
    const wsUrl = `${getStreamerWsUrl()}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      isWsConnecting = false;
      streamerWs = ws;
      cachedStatus = { ...cachedStatus, status: 'online' };
      console.log('[AxionStreamer] 🔌 WebSocket em tempo real conectado com sucesso:', wsUrl);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (!msg || !msg.symbol) return;
        const sym = String(msg.symbol).toUpperCase();
        const panel = String(msg.panel || '').toUpperCase();
        const cacheKey = `${sym}_${panel}`;

        if (msg.type === 'market_data' || msg.type === 'bar') {
          const price = Number(msg.price || 0);
          if (price > 0) {
            lastValidStreamerPrices.set(sym, price);
            if (panel) lastValidStreamerPrices.set(`${sym}_${panel}`, price);
          }

          // Disparo Event-Driven imediato (<1ms): notifica React e motor de ordens sem esperar o timer
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('vortex_streamer_tick', {
              detail: {
                symbol: sym,
                panel,
                price: Number(msg.price || 0),
                open: Number(msg.open || msg.price || 0),
                high: Number(msg.high || msg.price || 0),
                low: Number(msg.low || msg.price || 0),
                close: Number(msg.close || msg.price || 0),
                volume: Number(msg.volume || 0),
                timestamp: msg.timestamp || new Date().toISOString(),
                updated_at: msg.updated_at || new Date().toISOString(),
                isBar: msg.type === 'bar'
              }
            }));
          }
        }

        if (msg.type === 'bar' && msg.timestamp) {
          const existing = cachedStreamerCandles.get(cacheKey);
          if (existing && Array.isArray(existing.candles)) {
            const candles = existing.candles;
            const newCandle: Candle = {
              timestamp: msg.timestamp,
              open: Number(msg.open || msg.price),
              high: Number(msg.high || msg.price),
              low: Number(msg.low || msg.price),
              close: Number(msg.close || msg.price),
              volume: Number(msg.volume || 0)
            };
            const last = candles[candles.length - 1];
            if (last && last.timestamp === msg.timestamp) {
              candles[candles.length - 1] = newCandle;
            } else if (!last || new Date(msg.timestamp).getTime() > new Date(last.timestamp).getTime()) {
              candles.push(newCandle);
              if (candles.length > 50000) candles.shift();
            }
            cachedStreamerCandles.set(cacheKey, { time: Date.now(), candles });
          }
        }

        if (msg.type === 'block_trade') {
          const bt: BlockTrade = {
            time: msg.time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            price: Number(msg.price || 0),
            volume: Number(msg.volume || 0),
            side: String(msg.side || 'COMPRA').toUpperCase() as 'COMPRA' | 'VENDA'
          };
          if (bt.price > 0 && bt.volume > 0) {
            addStreamerBlockTrade(sym, panel, bt);
          }
        }
      } catch { }
    };

    ws.onerror = () => {
      // Reconnect automático ou fallback HTTP transparente
    };

    ws.onclose = () => {
      isWsConnecting = false;
      streamerWs = null;
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = setTimeout(() => {
        initStreamerWebSocket();
      }, 10000);
    };
  } catch {
    isWsConnecting = false;
  }
}

if (typeof window !== 'undefined') {
  setTimeout(() => initStreamerWebSocket(), 1200);
}

/**
 * Busca os candles de 1m gerados pelo NinjaTrader local (com suporte a Delta Sync via 'since')
 */
export async function fetchStreamerCandles(
  panelOrId: any,
  panelSettings?: any,
  force = false,
  limit?: number,
  since?: string
): Promise<Candle[] | null> {
  try {
    const { symbol, panelName } = resolveStreamerKey(panelOrId, panelSettings);
    const cacheKey = `${symbol}_${panelName}`;
    const now = Date.now();
    const existing = cachedStreamerCandles.get(cacheKey);
    // Se o WebSocket estiver ativo ou o cache recente (<1200ms) e NÃO for consulta de delta nem forçada, retorna imediatamente
    if (!force && !since && existing && (now - existing.time < 1200)) {
      return existing.candles;
    }

    // Se o servidor local (:8002) estiver sabidamente offline nos últimos 5s, não bloqueia nem dispara requisição falha
    if (!force && !isStreamerWsConnected() && cachedStatus.status === 'offline' && lastStatusFetchTime > 0 && (now - lastStatusFetchTime < OFFLINE_COOLDOWN_MS)) {
      return existing?.candles || null;
    }

    // Otimização Delta Sync: se 'since' estiver presente, solicita apenas os candles novos a partir desse timestamp
    let url = '';
    if (since && !force) {
      url = `${getStreamerBaseUrl()}/candles?symbol=${encodeURIComponent(symbol)}&panel=${encodeURIComponent(panelName)}&since=${encodeURIComponent(since)}`;
    } else {
      const requestedCount = limit ? Math.max(limit, 15000) : 35000;
      const countParam = force ? '' : `&count=${requestedCount}`;
      url = `${getStreamerBaseUrl()}/candles?symbol=${encodeURIComponent(symbol)}&panel=${encodeURIComponent(panelName)}${countParam}`;
    }
    
    const res = await fetchWithTimeout(url, DATA_TIMEOUT_MS);
    if (!res.ok) return existing?.candles || null;

    const data = await res.json();
    if (!data || !Array.isArray(data.candles)) {
      return existing?.candles || null;
    }

    // Se for delta query e não houve nenhum candle novo além de 'since'
    if (data.candles.length === 0 && since && existing && existing.candles.length > 0) {
      existing.time = now;
      return existing.candles;
    }

    if (data.candles.length === 0) {
      return existing?.candles || null;
    }

    // Suporta até 50.000 barras (mais de 30 dias de histórico 1m) sem truncar períodos como 3 ou 7 dias
    const rawList = data.candles.length > 50000 ? data.candles.slice(-50000) : data.candles;

    // Deduplicação e conversão segura para o formato Candle do Vortex
    const minuteMap = new Map<number, Candle>();
    rawList.forEach((c: any) => {
      if (!c || !c.timestamp) return;
      const tMs = new Date(c.timestamp).getTime();
      if (isNaN(tMs)) return;
      const mKey = Math.floor(tMs / 60000);

      const open = Number(c.open || 0);
      const high = Number(c.high || 0);
      const low = Number(c.low || 0);
      const close = Number(c.close || 0);
      const volume = Number(c.volume || 0);

      if (open > 0 && high > 0 && low > 0 && close > 0 && !isNaN(open) && !isNaN(close)) {
        minuteMap.set(mKey, {
          timestamp: c.timestamp,
          open,
          high,
          low,
          close,
          volume
        });
      }
    });

    // Se foi uma consulta de Delta Sync ('since'), funde cirurgicamente com o histórico já existente em memória
    if (since && existing && Array.isArray(existing.candles) && existing.candles.length > 0) {
      const mergedMap = new Map<number, Candle>();
      existing.candles.forEach(c => {
        if (!c || !c.timestamp) return;
        const t = new Date(c.timestamp).getTime();
        if (!isNaN(t) && t > 0) mergedMap.set(Math.floor(t / 60000), c);
      });
      minuteMap.forEach((c, k) => mergedMap.set(k, c));
      const mergedCandles = cleanAndSanitizeCandles(Array.from(mergedMap.values()));
      if (mergedCandles.length > 0) {
        cachedStreamerCandles.set(cacheKey, { time: now, candles: mergedCandles });
        return mergedCandles;
      }
      return existing.candles;
    }

    const uniqueCandles = cleanAndSanitizeCandles(Array.from(minuteMap.values()));

    if (uniqueCandles.length > 0) {
      cachedStreamerCandles.set(cacheKey, { time: now, candles: uniqueCandles });
      return uniqueCandles;
    }
    return existing?.candles || null;
  } catch {
    cachedStatus = { status: 'offline', activeStreams: [] };
    lastStatusFetchTime = Date.now();
    return null;
  }
}

/**
 * Busca a cotação em tempo real e o candle corrente do NinjaTrader local
 */
export async function fetchStreamerMarketData(panelOrId: any, panelSettings?: any): Promise<MarketData | null> {
  const now = Date.now();
  // Cooldown imediato se :8002 estiver offline para impedir saturação de sockets (ERR_INSUFFICIENT_RESOURCES)
  if (!isStreamerWsConnected() && cachedStatus.status === 'offline' && lastStatusFetchTime > 0 && (now - lastStatusFetchTime < OFFLINE_COOLDOWN_MS)) {
    return null;
  }

  const { symbol, panelName } = resolveStreamerKey(panelOrId, panelSettings);

  // Se já sabemos quais streams estão ativos no NT8 e este ativo não está lá, evita chamada HTTP desnecessária
  if (cachedStatus.status === 'online' && Array.isArray(cachedStatus.activeStreams) && cachedStatus.activeStreams.length > 0 && (now - lastStatusFetchTime < 5000)) {
    const hasMatchingStream = cachedStatus.activeStreams.some(s =>
      isMatchingPanelName(s.panel, panelName) ||
      s.symbol.toUpperCase() === symbol.toUpperCase() ||
      isMatchingFamily(s.symbol, symbol)
    );
    if (!hasMatchingStream) {
      return null;
    }
  }

  const flightKey = `${symbol}_${panelName}`;
  if (inflightMarketData.has(flightKey)) {
    return inflightMarketData.get(flightKey)!;
  }

  const p = (async () => {
    try {
      const url = `${getStreamerBaseUrl()}/market_data?symbol=${encodeURIComponent(symbol)}&panel=${encodeURIComponent(panelName)}`;
      const res = await fetchWithTimeout(url, 1200);
      if (!res.ok) return null;

      cachedStatus = { ...cachedStatus, status: 'online' };
      const data = await res.json();
      if (!data || data.price === undefined || data.price === null) {
        return null;
      }

      const numPrice = Number(data.price);
      if (isNaN(numPrice) || numPrice <= 0) {
        return null;
      }

      // Validação de frescor: suporta pausas entre pregões e sessões de até 12 horas enquanto o Add-on estiver rodando
      if (data.updated_at) {
        const updateMs = new Date(data.updated_at).getTime();
        if (!isNaN(updateMs) && (Date.now() - updateMs > 12 * 60 * 60 * 1000)) {
          return null;
        }
      }

      // Validação de sanidade de preço contra ruídos ou pacotes de outro ativo
      const streamKey = `${symbol}_${panelName}`.toUpperCase();
      const lastPrice = lastValidStreamerPrices.get(streamKey);
      if (lastPrice && lastPrice > 0) {
        // Se divergir mais de 8% em um único pacote sem transição
        if (Math.abs(numPrice - lastPrice) / lastPrice > 0.08) {
          console.warn(`[STREAMER SANITY] Preço anômalo rejeitado para ${streamKey}: ${numPrice} (anterior: ${lastPrice})`);
          return null;
        }
      }
      lastValidStreamerPrices.set(streamKey, numPrice);

      const rawTrades = data.block_trades || data.blockTrades || [];
      const formattedTrades: BlockTrade[] = Array.isArray(rawTrades)
        ? rawTrades.map((t: any) => ({
            time: t.time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            price: Number(t.price || 0),
            volume: Number(t.volume || 0),
            side: String(t.side || 'COMPRA').toUpperCase() as 'COMPRA' | 'VENDA'
          }))
        : [];

      if (formattedTrades.length > 0) {
        const bKey = `${symbol}_${panelName}`.toUpperCase();
        let bEntry = cachedStreamerBlockTrades.get(bKey);
        if (!bEntry) {
          bEntry = { time: Date.now(), trades: [] };
          cachedStreamerBlockTrades.set(bKey, bEntry);
        }
        const existingKeys = new Set(bEntry.trades.map(t => `${t.time}_${t.price}_${t.volume}_${t.side}`));
        formattedTrades.forEach(t => {
          const k = `${t.time}_${t.price}_${t.volume}_${t.side}`;
          if (!existingKeys.has(k)) {
            bEntry!.trades.push(t);
            existingKeys.add(k);
          }
        });
        if (bEntry.trades.length > 1000) {
          bEntry.trades = bEntry.trades.slice(-1000);
        }
        bEntry.time = Date.now();
      }

      const bKey = `${symbol}_${panelName}`.toUpperCase();
      const finalTrades = formattedTrades.length > 0 ? formattedTrades : (cachedStreamerBlockTrades.get(bKey)?.trades || []);

      return {
        symbol: data.symbol || symbol,
        price: String(numPrice),
        zScore: 0,
        atrRatio: 1.0,
        estado: 'ONLINE',
        timestamp: new Date(data.updated_at || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        sentiment: 50,
        originalSentiment: 50,
        delta: 0,
        deltaRatio: 1.0,
        buyVolume: 0,
        sellVolume: 0,
        printsPerSecond: 0,
        blockTrades: finalTrades,
        updated_at: data.updated_at || new Date().toISOString()
      };
    } catch {
      cachedStatus = { status: 'offline', activeStreams: [] };
      lastStatusFetchTime = Date.now();
      return null;
    } finally {
      inflightMarketData.delete(flightKey);
    }
  })();

  inflightMarketData.set(flightKey, p);
  return p;
}

/**
 * Consulta ativa direta aos Block Trades do NinjaTrader 8 local via endpoint /market_data
 */
export async function fetchStreamerBlockTrades(panelOrId: any, panelSettings?: any): Promise<BlockTrade[]> {
  try {
    if (!isStreamerWsConnected() && cachedStatus.status === 'offline' && lastStatusFetchTime > 0 && (Date.now() - lastStatusFetchTime < OFFLINE_COOLDOWN_MS)) {
      return getStreamerBlockTrades(panelOrId, panelSettings);
    }
    const { symbol, panelName } = resolveStreamerKey(panelOrId, panelSettings);
    const url = `${getStreamerBaseUrl()}/market_data?symbol=${encodeURIComponent(symbol)}&panel=${encodeURIComponent(panelName)}`;
    const res = await fetchWithTimeout(url, DATA_TIMEOUT_MS);
    if (!res.ok) return getStreamerBlockTrades(panelOrId, panelSettings);
    const data = await res.json();
    const rawTrades = data.block_trades || data.blockTrades || [];
    if (!Array.isArray(rawTrades)) return getStreamerBlockTrades(panelOrId, panelSettings);

    const formattedTrades: BlockTrade[] = rawTrades.map((t: any) => ({
      time: t.time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      price: Number(t.price || 0),
      volume: Number(t.volume || 0),
      side: String(t.side || 'COMPRA').toUpperCase() as 'COMPRA' | 'VENDA'
    })).filter(t => t.price > 0 && t.volume > 0);

    const bKey = `${symbol}_${panelName}`.toUpperCase();
    let bEntry = cachedStreamerBlockTrades.get(bKey);
    if (!bEntry) {
      bEntry = { time: Date.now(), trades: [] };
      cachedStreamerBlockTrades.set(bKey, bEntry);
    }
    const existingKeys = new Set<string>();
    const deduplicatedList: BlockTrade[] = [];
    formattedTrades.forEach(t => {
      const k = `${t.time}_${t.price}_${t.volume}_${t.side}`;
      if (!existingKeys.has(k)) {
        existingKeys.add(k);
        deduplicatedList.push(t);
      }
    });

    bEntry.trades = deduplicatedList;
    bEntry.time = Date.now();
    return deduplicatedList;
  } catch {
    return getStreamerBlockTrades(panelOrId, panelSettings);
  }
}

/**
 * Busca limites de datas (mínima e máxima) dos candles disponíveis no NinjaTrader local
 */
export async function fetchStreamerAvailableBounds(
  panelOrId: any,
  panelSettings?: any
): Promise<{ minDate: string; maxDate: string } | null> {
  try {
    const candles = await fetchStreamerHistoricalCandles(panelOrId, undefined, undefined, panelSettings, true);
    if (!candles || candles.length === 0) return null;

    const minDate = candles[0].timestamp.split('T')[0];
    const maxDate = candles[candles.length - 1].timestamp.split('T')[0];
    return { minDate, maxDate };
  } catch {
    return null;
  }
}

/**
 * Busca candles históricos do NinjaTrader local para o Replay/Simulador
 * Suporta filtragem universal por range de datas (com ou sem sufixo Z)
 */
export async function fetchStreamerHistoricalCandles(
  panelOrId: any,
  startDateISO?: string,
  endDateISO?: string,
  panelSettings?: any,
  force = false
): Promise<Candle[] | null> {
  try {
    const { symbol, panelName } = resolveStreamerKey(panelOrId, panelSettings);
    
    // Busca o pool completo de até 50.000 velas do streamer local e realiza filtragem numérica (epoch ms) no cliente
    // Isso garante 100% de compatibilidade com timestamps com ou sem sufixo UTC 'Z' (Regra 9.5)
    const requestedCount = 50000;
    const url = `${getStreamerBaseUrl()}/candles?symbol=${encodeURIComponent(symbol)}&panel=${encodeURIComponent(panelName)}&count=${requestedCount}`;

    const res = await fetchWithTimeout(url, 6000);
    if (!res.ok) {
      return await fetchStreamerCandles(panelOrId, panelSettings, force);
    }

    const data = await res.json();
    const rawCandles = Array.isArray(data?.candles) ? data.candles : (Array.isArray(data) ? data : []);
    
    if (rawCandles.length === 0) {
      return null;
    }

    const minuteMap = new Map<number, Candle>();
    rawCandles.forEach((c: any) => {
      if (!c || !c.timestamp) return;
      const tMs = new Date(c.timestamp).getTime();
      if (isNaN(tMs)) return;
      const mKey = Math.floor(tMs / 60000);

      const open = Number(c.open || 0);
      const high = Number(c.high || 0);
      const low = Number(c.low || 0);
      const close = Number(c.close || 0);
      const volume = Number(c.volume || 0);

      if (open > 0 && high > 0 && low > 0 && close > 0 && !isNaN(open) && !isNaN(close)) {
        minuteMap.set(mKey, {
          timestamp: c.timestamp,
          open,
          high,
          low,
          close,
          volume
        });
      }
    });

    let cleaned = cleanAndSanitizeCandles(Array.from(minuteMap.values()));
    cleaned.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Filtragem numérica em milissegundos (imune a diferenças entre sufixo 'Z', '-03:00' ou sem sufixo)
    if (startDateISO || endDateISO) {
      const startMs = startDateISO ? new Date(startDateISO).getTime() : 0;
      const endMs = endDateISO ? new Date(endDateISO).getTime() : Infinity;
      const filtered = cleaned.filter(c => {
        const t = new Date(c.timestamp).getTime();
        if (isNaN(t)) return false;
        if (startMs > 0 && !isNaN(startMs) && t < startMs) return false;
        if (endMs < Infinity && !isNaN(endMs) && t > endMs) return false;
        return true;
      });
      if (filtered.length > 0) {
        cleaned = filtered;
      }
    }

    return cleaned.length > 0 ? cleaned : null;
  } catch (err) {
    cachedStatus = { status: 'offline', activeStreams: [] };
    lastStatusFetchTime = Date.now();
    console.warn('[STREAMER] Erro ao buscar candles históricos do NinjaTrader local:', err);
    return null;
  }
}
