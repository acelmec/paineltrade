// =========================================================================
// CTRADER CLOUD SERVICE — INTEGRAÇÃO SPOTWARE OPEN API & STREAMER
// Suporte nativo a cTrader Cloud e cBot Gateway
// Copyright 2026, VM Gestão & Tecnologia Ltda — https://db.vemviraramesa.com.br
// =========================================================================

import type { Candle } from './db';
import { cleanAndSanitizeCandles } from './db';

const CTRADER_OPENAPI_BASE_URL = 'https://api.spotware.com';
const CTRADER_WS_URL = 'wss://live.ctraderapi.com:5035';

export interface CTraderAccountInfo {
  accountId: string | number;
  balance: number;
  equity: number;
  currency: string;
  leverage: number;
  brokerName?: string;
  positions?: CTraderPosition[];
}

export interface CTraderPosition {
  positionId: string | number;
  symbol: string;
  tradeType: 'BUY' | 'SELL';
  volume: number;
  entryPrice: number;
  pnl: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
}

export interface CTraderOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  lots: number;
  price?: number;
  slPoints?: number;
  tpPoints?: number;
}

let activeCTraderWs: WebSocket | null = null;
let activeSubscribedSymbol = '';

// =========================================================================
// CONSULTA DE SALDO E DETALHES DA CONTA CTRADER
// =========================================================================
export async function fetchCTraderAccount(
  token: string,
  accountId: string
): Promise<CTraderAccountInfo | null> {
  if (!token || !accountId) return null;

  try {
    const url = `${CTRADER_OPENAPI_BASE_URL}/connect/tradingaccounts/${accountId}?access_token=${encodeURIComponent(token.trim())}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      console.warn(`[cTraderService] Falha ao consultar conta (${res.status})`);
      return null;
    }

    const data = await res.json();
    return {
      accountId: data.accountId || accountId,
      balance: Number(data.balance || 0),
      equity: Number(data.equity || data.balance || 0),
      currency: data.depositCurrency || 'USD',
      leverage: Number(data.leverageInCents || 10000) / 100,
      brokerName: data.brokerTitleName || 'cTrader Broker',
      positions: []
    };
  } catch (err: any) {
    console.error('[cTraderService] Erro ao consultar conta cTrader:', err.message);
    return null;
  }
}

// =========================================================================
// CONSULTA DE CANDLES HISTÓRICOS CTRADER
// =========================================================================
export async function fetchCTraderCandles(
  symbol: string,
  _period = 'm1',
  count = 1000,
  token?: string
): Promise<Candle[]> {
  if (!token) return [];

  try {
    const cleanSym = symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const url = `${CTRADER_OPENAPI_BASE_URL}/connect/symbols/${cleanSym}/trendbars/m1?count=${count}&access_token=${encodeURIComponent(token.trim())}`;
    const res = await fetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data.trendbars)) return [];

    const rawCandles: Candle[] = data.trendbars.map((b: any) => ({
      timestamp: new Date(b.utcTimestampInMinutes * 60000).toISOString(),
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
      volume: Number(b.volume || 0)
    }));

    return cleanAndSanitizeCandles(rawCandles);
  } catch (err: any) {
    console.warn('[cTraderService] Falha ao buscar candles cTrader:', err.message);
    return [];
  }
}

// =========================================================================
// TRANSMISSÃO AO VIVO WEBSOCKET CTRADER OPEN API
// =========================================================================
export function subscribeCTraderMarketData(symbol: string): void {
  const cleanSym = symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (activeSubscribedSymbol === cleanSym && activeCTraderWs && activeCTraderWs.readyState === WebSocket.OPEN) {
    return;
  }

  if (activeCTraderWs) {
    try { activeCTraderWs.close(); } catch {}
    activeCTraderWs = null;
  }

  activeSubscribedSymbol = cleanSym;

  try {
    const ws = new WebSocket(CTRADER_WS_URL);
    activeCTraderWs = ws;

    ws.onopen = () => {
      console.log(`[cTraderService] 🔌 WebSocket conectado para ${cleanSym}`);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg && msg.bid && msg.ask) {
          const price = Number(msg.bid);
          if (price > 0 && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('vortex_streamer_tick', {
              detail: {
                symbol: cleanSym,
                panel: cleanSym,
                price: price,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: Number(msg.volume || 1),
                timestamp: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                isBar: false
              }
            }));
          }
        }
      } catch {}
    };

    ws.onclose = () => {
      if (activeSubscribedSymbol === cleanSym) {
        setTimeout(() => subscribeCTraderMarketData(cleanSym), 3000);
      }
    };
  } catch (err) {
    console.warn('[cTraderService] Falha ao conectar WebSocket cTrader:', err);
  }
}

export function unsubscribeCTraderMarketData(): void {
  if (activeCTraderWs) {
    activeSubscribedSymbol = '';
    try { activeCTraderWs.close(); } catch {}
    activeCTraderWs = null;
  }
}

// =========================================================================
// EXECUÇÃO DE ORDENS VIA CTRADER
// =========================================================================
export async function executeCTraderOrder(
  token: string,
  accountId: string,
  params: CTraderOrderParams
): Promise<{ success: boolean; orderId?: string | number; message?: string }> {
  if (!token || !accountId) {
    return { success: false, message: 'Credenciais cTrader ausentes.' };
  }

  try {
    const url = `${CTRADER_OPENAPI_BASE_URL}/connect/tradingaccounts/${accountId}/orders?access_token=${encodeURIComponent(token.trim())}`;
    const payload = {
      symbolName: params.symbol,
      tradeType: params.side,
      orderType: params.type,
      volume: params.lots,
      price: params.price
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, message: data.message || `Erro ${res.status} cTrader` };
    }

    return {
      success: true,
      orderId: data.orderId || Date.now(),
      message: 'Ordem cTrader enviada com sucesso'
    };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}
