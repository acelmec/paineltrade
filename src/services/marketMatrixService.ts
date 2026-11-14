// ============================================================================
// VortexWeb — Market Matrix & Strike Levels Service (Feed Grix / NinjaFeed)
// Consumo em tempo real de https://db.vemviraramesa.com.br/rest/v1/ninjafeed_kv
// ============================================================================

import type { OptionsMarketData } from './db';

export interface MarketMatrixData {
  // Metadados
  data: string;
  hora_et: string;
  fetchedAt: Date;
  qqq: number;
  spy: number;
  fator: number;
  fator_data?: string;
  fator_hora_et?: string;
  fatorEtOk: boolean;

  // Níveis de Opções/Gamma QQQ
  cw: number;        // Call Wall
  pw: number;        // Put Wall
  poc: number;       // POC
  flip: number;      // Flip Zone
  gw_sup: number;    // Gamma Wall superior
  gw_inf: number;    // Gamma Wall inferior
  sigma_sup?: number;
  sigma_inf?: number;
  range_min?: number;
  range_max?: number;

  // Heatmap OI & VOL
  hm_oi_call?: number;
  hm_oi_put?: number;
  hm_oi_flip?: number;
  hm_vol_call?: number;
  hm_vol_put?: number;
  hm_vol_flip?: number;

  // Métricas QQQ (-100 a +100 ou 0 a 100)
  net_gamma: number;
  analytics: number;
  rho: number;
  ms_qqq: number;
  anchors_qqq: number;
  hedge_qqq: number;
  smart_delta_qqq: number;
  tail_risk_qqq: number;
  vol_smile_qqq: number;
  vap_qqq: number;
  sr_call_qqq: number;
  sr_put_qqq: number;
  flow_qqq: number;
  phc_bull: number;

  // Métricas SPY
  spy_cw?: number;
  spy_pw?: number;
  spy_flip?: number;
  spy_net_gamma: number;
  spy_analytics: number;
  spy_rho: number;
  ms_spy: number;
  flow_spy: number;
  anchors_spy?: number;

  // Setup Abertura
  setup_abertura_qqq: number;
  setup_abertura_spy: number;

  // Travas de Estrutura de Mercado
  ms_trava: number;       // -1 = COMPRA PROIBIDA, 1 = VENDA PROIBIDA, 0 = LIVRE
  ms_spy_trava?: number;

  // Outros campos
  skew_qqq?: number;
  iv_atm_qqq?: number;
  rawKv: Record<string, string>;
}

const SUPABASE_FEED_URL = 'https://db.vemviraramesa.com.br/rest/v1/ninjafeed_kv?select=chave,valor';
const SUPABASE_FEED_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzE1MDUwODAwLAogICJleHAiOiAxODcyODE3MjAwCn0.vHuoZIP0JA10sCL-aBCQOhRffgwTPr9PWydjogh3yzk';

let cachedMatrixData: MarketMatrixData | null = null;
let lastFetchTime = 0;
let isFetching = false;
let pollingIntervalId: any = null;
let subscriberCount = 0;

const listeners: Array<(data: MarketMatrixData) => void> = [];

const parseNum = (val: string | undefined): number => {
  if (!val) return NaN;
  const cleaned = val.trim().replace('~', '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? NaN : n;
};

export const parseMarketMatrixKv = (rows: Array<{ chave: string; valor: string }>): MarketMatrixData => {
  const kv: Record<string, string> = {};
  for (const row of rows) {
    if (row && row.chave) {
      kv[row.chave.trim().toLowerCase()] = row.valor ?? '';
    }
  }

  const getNum = (key: string): number => parseNum(kv[key.toLowerCase()]);

  const qqq = getNum('qqq') || 674.25;
  const fator = getNum('fator') || 41.2375;

  let msTrava = getNum('ms_trava');
  if (isNaN(msTrava)) {
    msTrava = 0;
  } else if (msTrava < -0.5) {
    msTrava = -1;
  } else if (msTrava > 0.5) {
    msTrava = 1;
  } else {
    msTrava = 0;
  }

  const data: MarketMatrixData = {
    data: kv['data'] || '',
    hora_et: kv['hora_et'] || '',
    fetchedAt: new Date(),
    qqq,
    spy: getNum('spy') || 0,
    fator,
    fator_data: kv['fator_data'],
    fator_hora_et: kv['fator_hora_et'],
    fatorEtOk: Boolean(kv['fator_data'] && kv['fator_hora_et']),

    // Níveis QQQ
    cw: getNum('cw') || getNum('gw_sup') || 0,
    pw: getNum('pw') || getNum('gw_inf') || 0,
    poc: getNum('poc') || 0,
    flip: getNum('flip') || 0,
    gw_sup: getNum('gw_sup') || 0,
    gw_inf: getNum('gw_inf') || 0,
    sigma_sup: getNum('sigma_sup'),
    sigma_inf: getNum('sigma_inf'),
    range_min: getNum('range_min'),
    range_max: getNum('range_max'),

    // Heatmap
    hm_oi_call: getNum('hm_oi_call'),
    hm_oi_put: getNum('hm_oi_put'),
    hm_oi_flip: getNum('hm_oi_flip'),
    hm_vol_call: getNum('hm_vol_call'),
    hm_vol_put: getNum('hm_vol_put'),
    hm_vol_flip: getNum('hm_vol_flip'),

    // Métricas QQQ
    net_gamma: getNum('net_gamma') || 0,
    analytics: getNum('analytics') || 0,
    rho: getNum('rho') || 0,
    ms_qqq: getNum('ms_qqq') || 0,
    anchors_qqq: getNum('anchors_qqq') || 0,
    hedge_qqq: getNum('hedge_qqq') || 0,
    smart_delta_qqq: getNum('smart_delta_qqq') || 0,
    tail_risk_qqq: getNum('tail_risk_qqq') || 0,
    vol_smile_qqq: getNum('vol_smile_qqq') || 0,
    vap_qqq: getNum('vap_qqq') || 0,
    sr_call_qqq: getNum('sr_call_qqq') || 0,
    sr_put_qqq: getNum('sr_put_qqq') || 0,
    flow_qqq: getNum('flow_qqq') || 0,
    phc_bull: getNum('phc_bull') || 0,

    // Métricas SPY
    spy_cw: getNum('spy_cw'),
    spy_pw: getNum('spy_pw'),
    spy_flip: getNum('spy_flip'),
    spy_net_gamma: getNum('spy_net_gamma') || 0,
    spy_analytics: getNum('spy_analytics') || 0,
    spy_rho: getNum('spy_rho') || 0,
    ms_spy: getNum('ms_spy') || 0,
    flow_spy: getNum('flow_spy') || 0,
    anchors_spy: getNum('anchors_spy'),

    // Setup Abertura
    setup_abertura_qqq: getNum('setup_abertura_qqq') || 0,
    setup_abertura_spy: getNum('setup_abertura_spy') || 0,

    ms_trava: msTrava,
    ms_spy_trava: getNum('ms_spy_trava'),

    skew_qqq: getNum('skew_qqq'),
    iv_atm_qqq: getNum('iv_atm_qqq'),
    rawKv: kv
  };

  return data;
};

export async function fetchMarketMatrixData(force = false): Promise<MarketMatrixData | null> {
  const now = Date.now();
  if (!force && cachedMatrixData && now - lastFetchTime < 2500) {
    return cachedMatrixData;
  }

  if (isFetching) {
    return cachedMatrixData;
  }

  isFetching = true;
  try {
    const res = await fetch(SUPABASE_FEED_URL, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_FEED_KEY,
        Authorization: `Bearer ${SUPABASE_FEED_KEY}`,
        Accept: 'application/json'
      }
    });

    if (!res.ok) {
      console.warn(`[MarketMatrix] Erro HTTP ${res.status} ao carregar feed`);
      return cachedMatrixData;
    }

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return cachedMatrixData;
    }

    const parsed = parseMarketMatrixKv(rows);
    cachedMatrixData = parsed;
    lastFetchTime = now;

    // Dispara para ouvintes
    for (const listener of listeners) {
      try {
        listener(parsed);
      } catch (err) {
        console.error('[MarketMatrix] Erro no listener:', err);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vortex_market_matrix_update', { detail: parsed }));
    }

    return parsed;
  } catch (err) {
    console.warn('[MarketMatrix] Exceção ao consultar feed:', err);
    return cachedMatrixData;
  } finally {
    isFetching = false;
  }
}

export function getCachedMarketMatrixData(): MarketMatrixData | null {
  return cachedMatrixData;
}

export function subscribeMarketMatrix(callback: (data: MarketMatrixData) => void): () => void {
  listeners.push(callback);
  subscriberCount++;

  if (cachedMatrixData) {
    callback(cachedMatrixData);
  }

  if (subscriberCount === 1) {
    // Inicia polling a cada 3 segundos
    fetchMarketMatrixData(true);
    pollingIntervalId = setInterval(() => {
      fetchMarketMatrixData(false);
    }, 3000);
  }

  return () => {
    const idx = listeners.indexOf(callback);
    if (idx !== -1) {
      listeners.splice(idx, 1);
    }
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0 && pollingIntervalId) {
      clearInterval(pollingIntervalId);
      pollingIntervalId = null;
    }
  };
}

/**
 * Converte um nível de Strike do QQQ para pontos do NQ/MNQ.
 * Segue a exata calibração do NinjaTrader AxionGrixLevels:
 * Preço NQ = (qqqPrice * fator) + basis
 */
export function convertQqqToNq(
  qqqPrice: number,
  feed: MarketMatrixData | null,
  currentPrice?: number,
  manualFactor = 0,
  manualBase = 0,
  calibrateWithPrice = true
): number {
  if (!qqqPrice || isNaN(qqqPrice)) return NaN;
  const factor = manualFactor > 0 ? manualFactor : (feed?.fator && feed.fator > 0 ? feed.fator : 41.2375);

  let basis = manualBase;
  if (calibrateWithPrice && currentPrice && currentPrice > 0 && feed?.qqq && feed.qqq > 0) {
    const rawBasis = currentPrice - (feed.qqq * factor);
    // Histerese e limite de sanidade (se passar de 80 pts, mantém base manual/0)
    if (Math.abs(rawBasis) <= 80) {
      basis = rawBasis;
    }
  }

  return (qqqPrice * factor) + basis;
}

/**
 * Converte os dados brutos do MarketMatrix (NinjaFeed Grix) para a interface
 * OptionsMarketData consumida pelos widgets existentes (Core Analytics, Anchors,
 * Flow & Exposure, Stock Replacement e Projeções de Mercado).
 */
export function convertMarketMatrixToOptionsMarket(f: MarketMatrixData): OptionsMarketData {
  const qqqAnchorSignal = (f.anchors_qqq ?? 0) >= 0 ? 'BUY' : 'SELL';
  const spyAnchorSignal = (f.anchors_spy ?? 0) >= 0 ? 'BUY' : 'SELL';

  const callSignal = (f.sr_call_qqq ?? 0) >= 0 ? 'BUY' : 'SELL';
  const putSignal = (f.sr_put_qqq ?? 0) >= 0 ? 'BUY' : 'SELL';

  let bias = 'NEUTRAL';
  if (f.ms_trava === -1) {
    bias = 'BEARISH';
  } else if (f.ms_trava === 1) {
    bias = 'BULLISH';
  } else if (f.net_gamma > 20) {
    bias = 'BULLISH';
  } else if (f.net_gamma < -20) {
    bias = 'BEARISH';
  }

  const nqProj = `Níveis de Opções (Grix): QQQ $${f.qqq.toFixed(2)} | Fator: ${f.fator.toFixed(4)}\nCall Wall: $${f.cw.toFixed(2)} | POC: $${f.poc.toFixed(2)} | Put Wall: $${f.pw.toFixed(2)}\nFlip Zone: $${f.flip.toFixed(2)} | Gamma Wall: $${f.gw_sup.toFixed(2)} / $${f.gw_inf.toFixed(2)}`;

  const summary = `Estrutura de Mercado: QQQ ${f.ms_qqq.toFixed(1)} | SPY ${f.ms_spy.toFixed(1)}\nNet Gamma: ${f.net_gamma.toFixed(1)} | Trava MS: ${f.ms_trava === -1 ? 'COMPRA PROIBIDA' : f.ms_trava === 1 ? 'VENDA PROIBIDA' : 'LIVRE'}\nFluxo QQQ: ${f.flow_qqq.toFixed(1)}% | Fluxo SPY: ${f.flow_spy.toFixed(1)}% | PHC Bull: ${f.phc_bull.toFixed(1)}%`;

  return {
    id: `grix_${f.data}_${f.hora_et}`,
    market_symbol: 'NQ',
    gamma_wall_positivo: f.gw_sup,
    flip_zone: f.flip,
    gamma_wall_negativo: f.gw_inf,
    analytics: {
      analytics_qqq_pct: f.analytics,
      market_structure_qqq_pct: Math.abs(f.ms_qqq),
      market_structure_spy_pct: Math.abs(f.ms_spy),
      ai_status: f.ms_trava !== 0 ? (f.ms_trava === -1 ? 'TRAVA COMPRA' : 'TRAVA VENDA') : 'ACTIVE'
    },
    anchors: {
      spy_pct: Math.abs(f.anchors_spy ?? 50),
      spy_signal: spyAnchorSignal,
      qqq_pct: Math.abs(f.anchors_qqq),
      qqq_signal: qqqAnchorSignal
    },
    flow_and_exposure: {
      rho_index_pct: f.rho,
      tail_risk_pct: f.tail_risk_qqq,
      volatility_smile_qqq_pct: f.vol_smile_qqq,
      volatility_smile_spy_pct: f.vol_smile_qqq,
      net_gamma_pct: f.net_gamma
    },
    stock_replacement: {
      symbol: 'QQQ',
      call_pct: Math.abs(f.sr_call_qqq),
      call_signal: callSignal,
      put_pct: Math.abs(f.sr_put_qqq),
      put_signal: putSignal
    },
    market_bias: bias,
    nq_projection: nqProj,
    summary: summary,
    raw_data: f.rawKv,
    captured_at: f.fetchedAt.toISOString(),
    created_at: f.fetchedAt.toISOString()
  };
}
