// =========================================================================
// BINANCE CLOUD SERVICE — INTEGRAÇÃO DIRETA REST & WEBSOCKET
// Suporte a Spot e Futuros USDT-M com Assinatura HMAC-SHA256 nativa
// =========================================================================

import type { Candle } from './db';
import { cleanAndSanitizeCandles } from './db';

export const BINANCE_SPOT_REST_URL = 'https://api.binance.com';
export const BINANCE_FUTURES_REST_URL = 'https://fapi.binance.com';
export const BINANCE_FUTURES_TESTNET_URL = 'https://testnet.binancefuture.com';
export const BINANCE_SPOT_TESTNET_URL = 'https://testnet.binance.vision';

export function resolveBinanceBaseRestUrl(hostUrl?: string, isFutures = false, isDemo = false): string {
  const normHost = (hostUrl || '').toLowerCase();

  // 1. Futuros Testnet (Demo)
  if (isDemo || normHost.includes('testnet.binancefuture.com') || (isFutures && normHost.includes('testnet'))) {
    if (typeof window !== 'undefined' && window.location) {
      return `${window.location.origin}/binance-future-testnet`;
    }
    return BINANCE_FUTURES_TESTNET_URL;
  }

  // 2. Spot Testnet (Demo)
  if (normHost.includes('testnet.binance.vision') || normHost.includes('vision') || (isDemo && !isFutures)) {
    if (typeof window !== 'undefined' && window.location) {
      return `${window.location.origin}/binance-spot-testnet`;
    }
    return BINANCE_SPOT_TESTNET_URL;
  }

  // 3. Futuros Real (fapi.binance.com)
  if (isFutures || normHost.includes('fapi.binance.com')) {
    if (typeof window !== 'undefined' && window.location) {
      return `${window.location.origin}/binance-fapi`;
    }
    return BINANCE_FUTURES_REST_URL;
  }

  // 4. Spot Real (api.binance.com)
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.origin}/binance-api`;
  }
  return BINANCE_SPOT_REST_URL;
}

export function getBinanceSpotRestUrl(): string {
  return resolveBinanceBaseRestUrl(undefined, false, false);
}


export interface BinanceAccountInfo {
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  accountType: string;
  balances: Array<{
    asset: string;
    free: string;
    locked: string;
  }>;
  totalBalanceUsd?: number;
  suggestedSymbols?: string[];
}

export interface BinanceOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  isFutures?: boolean;
  hostUrl?: string;
}

// =========================================================================
// ASSINATURA CRIPTOGRÁFICA HMAC-SHA256 (Nativa via Web Crypto API)
// =========================================================================
async function generateHmacSignature(queryString: string, apiSecret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret.trim());
  const messageData = encoder.encode(queryString);

  const cryptoObj = (typeof window !== 'undefined' && window.crypto) ? window.crypto : (globalThis as any).crypto;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error('Web Crypto API não disponível no ambiente');
  }

  const cryptoKey = await cryptoObj.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await cryptoObj.subtle.sign('HMAC', cryptoKey, messageData);
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Sincronização automática de relógio com a Binance para evitar erro -1021 (Timestamp ahead of server's time)
let binanceTimeOffsetMs = 0;
let lastTimeSyncTimestamp = 0;

export async function getBinanceServerTime(isFutures = false, hostUrl?: string): Promise<number> {
  const now = Date.now();
  if (now - lastTimeSyncTimestamp > 60000 || lastTimeSyncTimestamp === 0) {
    try {
      const isExplicitFutures = isFutures || (hostUrl && (hostUrl.includes('future') || hostUrl.includes('fapi')));
      const baseUrl = resolveBinanceBaseRestUrl(hostUrl, Boolean(isExplicitFutures));
      const endpoint = isExplicitFutures ? '/fapi/v1/time' : '/api/v3/time';
      const timeRes = await fetch(`${baseUrl}${endpoint}`).catch(() => fetch(`${BINANCE_SPOT_REST_URL}/api/v3/time`));
      if (timeRes && timeRes.ok) {
        const timeData = await timeRes.json();
        if (timeData && timeData.serverTime) {
          binanceTimeOffsetMs = Number(timeData.serverTime) - Date.now();
          lastTimeSyncTimestamp = Date.now();
        }
      }
    } catch {}
  }
  return Date.now() + binanceTimeOffsetMs;
}

// =========================================================================
// CONSULTA DE SALDO E STATUS DA CONTA (SPOT OU FUTUROS)
// =========================================================================
export async function fetchBinanceAccount(
  apiKey: string,
  apiSecret: string,
  isFutures = false,
  hostUrl?: string
): Promise<BinanceAccountInfo | null> {
  if (!apiKey || !apiSecret) return null;

  try {
    const isExplicitFutures = isFutures || (hostUrl && (hostUrl.includes('future') || hostUrl.includes('fapi')));
    const timestamp = await getBinanceServerTime(Boolean(isExplicitFutures), hostUrl);
    const queryString = `timestamp=${timestamp}&recvWindow=60000`;
    const signature = await generateHmacSignature(queryString, apiSecret);

    const baseUrl = resolveBinanceBaseRestUrl(hostUrl, Boolean(isExplicitFutures));
    const endpoint = isExplicitFutures ? '/fapi/v2/account' : '/api/v3/account';
    const fullUrl = `${baseUrl}${endpoint}?${queryString}&signature=${signature}`;

    let res: Response;
    try {
      res = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'X-MBX-APIKEY': apiKey.trim(),
          'Content-Type': 'application/json'
        }
      });
    } catch (proxyErr) {
      const fallbackUrl = isExplicitFutures ? BINANCE_FUTURES_TESTNET_URL : BINANCE_SPOT_REST_URL;
      res = await fetch(`${fallbackUrl}${endpoint}?${queryString}&signature=${signature}`, {
        method: 'GET',
        headers: {
          'X-MBX-APIKEY': apiKey.trim(),
          'Content-Type': 'application/json'
        }
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[BinanceService] Falha ao consultar conta (${res.status}):`, errText);
      return null;
    }

    const data = await res.json();
    let totalUsd = 0;
    const balancesList: any[] = [];

    if (isFutures) {
      // Futuros USDT-M
      if (Array.isArray(data.assets)) {
        data.assets.forEach((a: any) => {
          const wallet = Number(a.walletBalance || 0);
          if (wallet > 0) {
            balancesList.push({
              asset: a.asset,
              free: String(a.availableBalance || 0),
              locked: String(Number(a.walletBalance) - Number(a.availableBalance))
            });
            if (a.asset === 'USDT' || a.asset === 'BUSD' || a.asset === 'USDC') {
              totalUsd += wallet;
            }
          }
        });
      }
      totalUsd = Number(data.totalWalletBalance || totalUsd);
    } else {
      // Spot
      if (Array.isArray(data.balances)) {
        data.balances.forEach((b: any) => {
          const free = Number(b.free || 0);
          const locked = Number(b.locked || 0);
          if (free > 0 || locked > 0) {
            balancesList.push({
              asset: b.asset,
              free: String(free),
              locked: String(locked)
            });
            if (b.asset === 'USDT' || b.asset === 'BUSD' || b.asset === 'USDC') {
              totalUsd += free + locked;
            }
          }
        });
      }

      // Converte moedas não-USD (ex: BRL, BTC, ETH) para equivalência em USD
      if (balancesList.length > 0) {
        try {
          const nonUsd = balancesList.filter(b => b.asset !== 'USDT' && b.asset !== 'BUSD' && b.asset !== 'USDC');
          if (nonUsd.length > 0) {
            const pricesRes = await fetch(`${baseUrl}/api/v3/ticker/price`).catch(() => fetch(`${BINANCE_SPOT_REST_URL}/api/v3/ticker/price`));
            if (pricesRes.ok) {
              const pricesArr: Array<{ symbol: string; price: string }> = await pricesRes.json();
              const priceMap = new Map(pricesArr.map(p => [p.symbol, Number(p.price)]));
              for (const b of nonUsd) {
                const qty = Number(b.free) + Number(b.locked);
                if (qty <= 0) continue;
                if (b.asset === 'BRL') {
                  const usdtBrl = priceMap.get('USDTBRL');
                  if (usdtBrl && usdtBrl > 0) totalUsd += qty / usdtBrl;
                } else {
                  const usdtPrice = priceMap.get(`${b.asset}USDT`);
                  if (usdtPrice && usdtPrice > 0) totalUsd += qty * usdtPrice;
                }
              }
            }
          }
        } catch (priceErr) {
          console.warn('[BinanceService] Falha ao converter tickers para USD:', priceErr);
        }
      }
    }

    const suggestedSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
    balancesList.forEach(b => {
      if (b.asset !== 'USDT' && b.asset !== 'BUSD' && b.asset !== 'USDC' && b.asset !== 'BRL') {
        const pair = `${b.asset}USDT`;
        if (!suggestedSymbols.includes(pair)) {
          suggestedSymbols.push(pair);
        }
      }
    });

    return {
      canTrade: data.canTrade !== false,
      canWithdraw: data.canWithdraw !== false,
      canDeposit: data.canDeposit !== false,
      accountType: isFutures ? 'FUTURES_USDT' : (data.accountType || 'SPOT'),
      balances: balancesList,
      totalBalanceUsd: totalUsd,
      suggestedSymbols
    };
  } catch (err: any) {
    console.error('[BinanceService] Erro na requisição de conta:', err.message);
    return null;
  }
}

// =========================================================================
// HISTÓRICO DE CANDLES (KLINES) PÚBLICO (SEM NECESSIDADE DE CHAVE)
// =========================================================================
export async function fetchBinanceCandles(
  symbol = 'BTCUSDT',
  interval = '1m',
  limit = 1000,
  isFutures = false,
  hostUrl?: string
): Promise<Candle[]> {
  try {
    const cleanSym = symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const isDemo = Boolean(hostUrl && hostUrl.includes('testnet'));

    // 1. Tenta a rota resolvida com suporte a proxy local
    const baseUrl = resolveBinanceBaseRestUrl(hostUrl, isFutures, isDemo);
    const endpoint = isFutures ? '/fapi/v1/klines' : '/api/v3/klines';
    const url = `${baseUrl}${endpoint}?symbol=${cleanSym}&interval=${interval}&limit=${limit}`;

    let res = await fetch(url).catch(() => null);

    // 2. Se falhar (ex: Testnet com histórico vazio ou erro no proxy testnet), tenta o proxy de produção
    if (!res || !res.ok) {
      const prodProxy = isFutures ? '/binance-fapi' : '/binance-api';
      const prodUrl = typeof window !== 'undefined'
        ? `${window.location.origin}${prodProxy}${endpoint}?symbol=${cleanSym}&interval=${interval}&limit=${limit}`
        : `${isFutures ? BINANCE_FUTURES_REST_URL : BINANCE_SPOT_REST_URL}${endpoint}?symbol=${cleanSym}&interval=${interval}&limit=${limit}`;
      res = await fetch(prodUrl).catch(() => null);
    }

    // 3. Fallback cruzado: se Futuros falhar, tenta Spot
    if (!res || !res.ok) {
      const spotFallback = typeof window !== 'undefined'
        ? `${window.location.origin}/binance-api/api/v3/klines?symbol=${cleanSym}&interval=${interval}&limit=${limit}`
        : `${BINANCE_SPOT_REST_URL}/api/v3/klines?symbol=${cleanSym}&interval=${interval}&limit=${limit}`;
      res = await fetch(spotFallback).catch(() => null);
    }

    // 4. Último fallback: chamada direta à API pública da Binance
    if (!res || !res.ok) {
      const directUrl = isFutures
        ? `https://fapi.binance.com/fapi/v1/klines?symbol=${cleanSym}&interval=${interval}&limit=${limit}`
        : `https://api.binance.com/api/v3/klines?symbol=${cleanSym}&interval=${interval}&limit=${limit}`;
      res = await fetch(directUrl).catch(() => null);
    }

    if (!res || !res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    const rawCandles: Candle[] = data.map((item: any[]) => {
      const openTime = new Date(item[0]).toISOString();
      return {
        timestamp: openTime,
        open: Number(item[1] || 0),
        high: Number(item[2] || 0),
        low: Number(item[3] || 0),
        close: Number(item[4] || 0),
        volume: Number(item[5] || 0)
      };
    });

    return cleanAndSanitizeCandles(rawCandles);
  } catch (err) {
    console.warn('[BinanceService] Falha ao carregar klines da Binance:', err);
    return [];
  }
}

// =========================================================================
// WEBSOCKET NATIVO EM TEMPO REAL (CANDLES 1M & PREÇO TICK-BY-TICK)
// =========================================================================
let activeBinanceWs: WebSocket | null = null;
let activeSubscribedSymbol = '';
let lastBinanceBid = 0;
let lastBinanceAsk = 0;

export function subscribeBinanceMarketData(symbol = 'BTCUSDT', isFutures = false): void {
  if (typeof window === 'undefined') return;

  const cleanSym = symbol.replace(/[^A-Za-z0-9]/g, '').toLowerCase();

  // Bloqueio apenas se o próprio símbolo solicitado NÃO for de cripto
  const isCryptoSymbol = cleanSym.endsWith('usdt') || cleanSym.endsWith('busd') || cleanSym.endsWith('usdc') ||
    /^(btc|eth|sol|bnb|xrp|doge|ada|avax|dot|link|near|sui|pepe)/i.test(cleanSym);

  if (!isCryptoSymbol) {
    const activePlat = localStorage.getItem('vortex_active_account_platform');
    if (activePlat && ['mt4', 'mt5', 'nt8'].includes(activePlat.toLowerCase())) {
      console.log('[BinanceService] ⛔ Subscrição Binance ignorada para ativo não-cripto:', cleanSym);
      unsubscribeBinanceMarketData();
      return;
    }
  }
  if (activeBinanceWs && activeSubscribedSymbol === cleanSym && activeBinanceWs.readyState === WebSocket.OPEN) {
    return;
  }

  // Encerra conexão anterior se mudar de símbolo
  if (activeBinanceWs) {
    try { activeBinanceWs.close(); } catch {}
    activeBinanceWs = null;
  }

  activeSubscribedSymbol = cleanSym;
  // Subscrição combinada: kline de 1m + bookTicker (Bid/Ask em tempo real)
  const wsUrl = isFutures
    ? `wss://fstream.binance.com/stream?streams=${cleanSym}@kline_1m/${cleanSym}@bookTicker`
    : `wss://stream.binance.com:9443/stream?streams=${cleanSym}@kline_1m/${cleanSym}@bookTicker`;

  try {
    const ws = new WebSocket(wsUrl);
    activeBinanceWs = ws;

    ws.onopen = () => {
      console.log(`[BinanceService] 🔌 WebSocket ao vivo conectado para ${cleanSym.toUpperCase()}`);
    };

    ws.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data);
        const msg = raw?.data || raw;
        if (!msg) return;

        // Atualização de BookTicker (Melhor Bid e Melhor Ask com Spread real)
        if (msg.b && msg.a) {
          lastBinanceBid = Number(msg.b);
          lastBinanceAsk = Number(msg.a);
          const sym = String(msg.s || cleanSym).toUpperCase();
          if (typeof window !== 'undefined' && lastBinanceBid > 0 && lastBinanceAsk > 0) {
            window.dispatchEvent(new CustomEvent('vortex_streamer_tick', {
              detail: {
                symbol: sym,
                panel: sym,
                price: lastBinanceBid,
                bid: lastBinanceBid,
                ask: lastBinanceAsk,
                spread: Number((lastBinanceAsk - lastBinanceBid).toFixed(4)),
                updated_at: new Date().toISOString()
              }
            }));
          }
          return;
        }

        if (!msg.k) return;

        const k = msg.k;
        const sym = String(k.s || cleanSym).toUpperCase();
        const price = Number(k.c || 0);

        const curBid = lastBinanceBid > 0 ? lastBinanceBid : price;
        const curAsk = lastBinanceAsk > 0 ? lastBinanceAsk : (price > 0 ? price + 0.5 : price);

        if (price > 0 && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vortex_streamer_tick', {
            detail: {
              symbol: sym,
              panel: sym,
              price: price,
              bid: curBid,
              ask: curAsk,
              spread: Number((curAsk - curBid).toFixed(4)),
              open: Number(k.o || price),
              high: Number(k.h || price),
              low: Number(k.l || price),
              close: price,
              volume: Number(k.v || 0),
              timestamp: new Date(k.t).toISOString(),
              updated_at: new Date(msg.E || Date.now()).toISOString(),
              isBar: k.x === true // k.x é true quando a vela consolidou/fechou!
            }
          }));
        }
      } catch {}
    };

    ws.onerror = (err) => {
      console.warn('[BinanceService] Erro no WebSocket da Binance:', err);
    };

    ws.onclose = () => {
      console.log(`[BinanceService] WebSocket fechado para ${cleanSym.toUpperCase()}`);
      if (activeSubscribedSymbol === cleanSym) {
        setTimeout(() => subscribeBinanceMarketData(cleanSym, isFutures), 3000);
      }
    };
  } catch (err) {
    console.warn('[BinanceService] Falha ao iniciar WebSocket Binance:', err);
  }
}

export function unsubscribeBinanceMarketData(): void {
  if (activeBinanceWs) {
    activeSubscribedSymbol = '';
    try { activeBinanceWs.close(); } catch {}
    activeBinanceWs = null;
  }
}

// =========================================================================
// ENVIO DE ORDENS DE COMPRA / VENDA NA BINANCE
// =========================================================================
export async function executeBinanceOrder(
  apiKey: string,
  apiSecret: string,
  params: BinanceOrderParams
): Promise<{ success: boolean; orderId?: string | number; message?: string }> {
  if (!apiKey || !apiSecret) {
    return { success: false, message: 'Chaves de API da Binance ausentes.' };
  }

  try {
    const isExplicitFutures = params.isFutures || (params.hostUrl && (params.hostUrl.includes('future') || params.hostUrl.includes('fapi')));
    const timestamp = await getBinanceServerTime(Boolean(isExplicitFutures), params.hostUrl);
    const cleanSym = params.symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    
    let queryObj: Record<string, any> = {
      symbol: cleanSym,
      side: params.side,
      type: params.type,
      quantity: params.quantity,
      timestamp: timestamp,
      recvWindow: 60000
    };

    if (params.type === 'LIMIT') {
      if (!params.price || params.price <= 0) {
        return { success: false, message: 'Preço obrigatório para ordens LIMIT.' };
      }
      queryObj.price = params.price;
      queryObj.timeInForce = params.timeInForce || 'GTC';
    }

    const queryString = Object.keys(queryObj)
      .map(key => `${key}=${encodeURIComponent(queryObj[key])}`)
      .join('&');

    const signature = await generateHmacSignature(queryString, apiSecret);
    const baseUrl = resolveBinanceBaseRestUrl(params.hostUrl, Boolean(isExplicitFutures));
    const endpoint = isExplicitFutures ? '/fapi/v1/order' : '/api/v3/order';
    const fullUrl = `${baseUrl}${endpoint}?${queryString}&signature=${signature}`;

    let res: Response;
    try {
      res = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey.trim(),
          'Content-Type': 'application/json'
        }
      });
    } catch (proxyErr) {
      const fallbackUrl = isExplicitFutures ? BINANCE_FUTURES_TESTNET_URL : BINANCE_SPOT_REST_URL;
      res = await fetch(`${fallbackUrl}${endpoint}?${queryString}&signature=${signature}`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey.trim(),
          'Content-Type': 'application/json'
        }
      });
    }

    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        message: data.msg || `Erro ${res.status}: ${JSON.stringify(data)}`
      };
    }

    return {
      success: true,
      orderId: data.orderId || data.clientOrderId,
      message: `Ordem ${params.side} ${cleanSym} executada com sucesso!`
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Exceção de rede: ${err.message}`
    };
  }
}
