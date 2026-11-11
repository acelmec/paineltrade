import { supabase, supabaseAdmin } from '../supabaseClient';
import { getSaoPauloDate, getTradingSessionDate } from '../utils/date';
import { PRESET_ATM_STRATEGIES, type ATMStrategy } from '../utils/atmRegistry';
import type { DrawingItem } from '../types/chartDrawings';
import type { IndicatorConfig } from '../utils/indicatorRegistry';
import type { WidgetConfig } from '../utils/widgetRegistry';
import { checkNinjaStatus, syncNinjaCopyRules, syncNinjaAccountsRisk, executeNinjaRpc, type NinjaCopyRule } from './ninjaGateway';
import { hasLocalStreamForPanel, fetchStreamerCandles } from './vortexStreamer';

export const getStableManualStrategyId = (panelId?: string | null, existingId?: string | null): string => {
  if (existingId && typeof existingId === 'string' && existingId.trim() !== '') {
    return existingId.trim();
  }
  const key = `vortex_manual_strat_id_${panelId || 'default'}`;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = localStorage.getItem(key);
      if (stored && stored.trim() !== '') return stored.trim();
    } catch (e) {
      console.warn('[STORAGE] Erro ao ler manual_strategy_id de localStorage:', e);
    }
  }
  const newId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'b8f2d5e6-4a1c-4f89-9e23-7c1d5b3a8e90';
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(key, newId);
    } catch (e) {}
  }
  return newId;
};

// Helper para evitar que chamadas de rede do Supabase travem a UI por mais de 3.5 segundos
export const withDbTimeout = <T = any>(promise: Promise<T> | any, ms: number = 3500): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout de banco de dados (${ms}ms)`)), ms)
    )
  ]) as Promise<T>;
};

// Helper ultra-rápido para obter o usuário logado via sessão local em memória sem requisições HTTP adicionais
let cachedAuthUser: { user: any; ts: number } | null = null;
let inFlightAuthUserPromise: Promise<any> | null = null;

export async function getAuthUser(): Promise<any> {
  const now = Date.now();
  if (cachedAuthUser && cachedAuthUser.user && (now - cachedAuthUser.ts < 5000)) {
    return cachedAuthUser.user;
  }
  if (inFlightAuthUserPromise) {
    return inFlightAuthUserPromise;
  }
  inFlightAuthUserPromise = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        cachedAuthUser = { user: session.user, ts: Date.now() };
        return session.user;
      }
      const { data: { user } } = await withDbTimeout(supabase.auth.getUser(), 2500);
      if (user) {
        cachedAuthUser = { user, ts: Date.now() };
      }
      return user || null;
    } catch (e) {
      return cachedAuthUser?.user || null;
    } finally {
      inFlightAuthUserPromise = null;
    }
  })();
  return inFlightAuthUserPromise;
}

// Helper para validação de UUID no padrão Postgres
export const isValidUUID = (str?: string | null): boolean => {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
};

// Helper para geração segura de UUID compatível com Postgres
export const generateSecureUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (e) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Helper para cálculo e quantização de preços por Tamanho do Tick do Ativo (ex: 0.25 para NQ/ES, 0.10 para Ouro/Petróleo)
export function resolvePanelTickSize(panel?: any, settings?: any): number {
  if (panel?.tick_size !== undefined && panel?.tick_size !== null && Number(panel.tick_size) > 0) {
    return Number(panel.tick_size);
  }
  if (settings?.tick_size !== undefined && settings?.tick_size !== null && Number(settings.tick_size) > 0) {
    return Number(settings.tick_size);
  }
  const panelId = panel?.id || panel?.instance_id || '';
  if (typeof window !== 'undefined' && panelId) {
    const saved = localStorage.getItem(`vortex_panel_tick_size_${panelId}`);
    if (saved && Number(saved) > 0) return Number(saved);
  }
  const sym = (panel?.gamma_symbol || panel?.symbol || panel?.name || '').toUpperCase();
  if (sym.includes('NQ') || sym.includes('MNQ') || sym.includes('ES') || sym.includes('MES') || sym.includes('RTY') || sym.includes('M2K')) {
    return 0.25;
  }
  if (sym.includes('CL') || sym.includes('MCL') || sym.includes('GC') || sym.includes('MGC')) {
    return 0.10;
  }
  if (sym.includes('YM') || sym.includes('MYM')) {
    return 1.0;
  }
  if (sym.includes('WIN')) {
    return 5.0;
  }
  if (sym.includes('WDO')) {
    return 0.5;
  }
  return 0.25;
}

export function getTickDecimals(tickSize: number = 0.25): number {
  if (!tickSize || tickSize <= 0) return 2;
  const str = String(tickSize);
  if (str.includes('.')) {
    return str.split('.')[1].length;
  }
  return 0;
}

export function roundToTick(price: number, tickSize: number = 0.25): number {
  if (price === null || price === undefined || isNaN(price) || price === 0) return price;
  const step = tickSize > 0 ? tickSize : 0.25;
  const factor = 1 / step;
  const rounded = Math.round(price * factor) / factor;
  const decimals = getTickDecimals(step);
  return Number(rounded.toFixed(decimals));
}

export function formatPriceByTick(price: number, tickSize: number = 0.25): string {
  if (price === null || price === undefined || isNaN(price)) return '--';
  const decimals = getTickDecimals(tickSize);
  return price.toFixed(decimals);
}

export interface BlockTrade {
  time: string;
  price: number;
  volume: number;
  side: 'COMPRA' | 'VENDA' | string;
}

export interface MarketData {
  symbol: string;
  price: string;
  zScore: number;
  atrRatio: number;
  estado: string;
  timestamp: string;
  sentiment: number;
  marketSentiment?: number;
  delta: number;
  deltaRatio: number;
  deltaPct?: number;
  delta_pct?: number;
  printsPerSecond: number;
  blockTrades: BlockTrade[];
  buyVolume: number;
  sellVolume: number;
  originalSentiment?: number;
  updated_at?: string;
}

export interface NasdaqForce {
  forces: { symbol: string; buy: number; sell: number }[];
}

export interface GammaLevels {
  hvl?: string;
  call?: string;
  put?: string;
  max1d?: string;
  min1d?: string;
  prev?: string;
  prevH?: string;
  prevL?: string;
  hvl0?: string;
  call0?: string;
  put0?: string;
  gwall?: string;
  gex_count?: number;
  bl_count?: number;
  gex?: number[];
  bl?: number[];
  
  // Gamma Bias
  buy_strength?: number;
  sell_strength?: number;
  gamma_bias?: string;
  bias_score?: number;
  nearest_resistance?: number;
  nearest_support?: number;
  distance_to_resistance?: number;
  distance_to_support?: number;
  confluence_type?: string;
  recommended_strategy?: string;
  void_gamma_above?: number;
  void_gamma_below?: number;
  bias_timestamp?: string;
}

export interface OptionsMarketData {
  id?: string | number;
  market_symbol?: string;
  gamma_wall_positivo?: number;
  flip_zone?: number;
  gamma_wall_negativo?: number;
  analytics?: {
    analytics_qqq_pct?: number;
    market_structure_qqq_pct?: number;
    market_structure_spy_pct?: number;
    ai_status?: string;
  };
  anchors?: {
    spy_pct?: number;
    spy_signal?: string;
    qqq_pct?: number;
    qqq_signal?: string;
  };
  flow_and_exposure?: {
    rho_index_pct?: number;
    tail_risk_pct?: number;
    volatility_smile_qqq_pct?: number;
    volatility_smile_spy_pct?: number;
    net_gamma_pct?: number;
  };
  stock_replacement?: {
    symbol?: string;
    call_pct?: number;
    call_signal?: string;
    put_pct?: number;
    put_signal?: string;
  };
  market_bias?: string;
  nq_projection?: string;
  summary?: string;
  raw_data?: Record<string, any>;
  captured_at?: string;
  created_at?: string;
}

export interface EconomicNewsItem {
  id: string;
  date: Date;
  country: string;
  impact: 'high' | 'medium' | 'low';
  title: string;
  forecast: string;
  previous: string;
  unit: string;
}

export interface AIPrompt {
  id: string;
  user_id: string | null;
  panel_id?: string | null;
  atm_strategy_id?: string | null;
  name: string;
  description: string | null;
  confluences: string;
  trigger_entry: string;
  stop_loss_type: 'points' | 'regions';
  stop_loss_value: string;
  take_profit_type: 'points' | 'regions';
  take_profit_value: string;
  is_admin: boolean;
  analyze_chart?: boolean;
  trigger_strategy_id?: string | null;
  prompt_type?: 'context_filter' | 'signal_generator';
  created_at: string;
}



const inFlightMarketDataDb = new Map<string, Promise<MarketData | null>>();

// 1. Buscar Market Data do Supabase
export async function fetchMarketDataSupabase(instanceId: string): Promise<MarketData | null> {
  const key = instanceId || 'nt8_main';
  if (inFlightMarketDataDb.has(key)) {
    return inFlightMarketDataDb.get(key)!;
  }

  const p = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const { data, error } = await supabaseAdmin
        .from('market_data')
        .select('*')
        .eq('instance_id', key)
        .order('id', { ascending: false })
        .limit(1)
        .abortSignal(controller.signal)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      // Processar recent_trades (Block Trades)
      const recentTrades = data.recent_trades ? (typeof data.recent_trades === 'string' ? JSON.parse(data.recent_trades) : data.recent_trades) : [];
      const formattedTrades: BlockTrade[] = Array.isArray(recentTrades) ? recentTrades.map((t: any) => {
        return {
          time: t.time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          price: Number(t.price || 0),
          volume: Number(t.volume || 0),
          side: String(t.side || 'COMPRA').toUpperCase()
        };
      }) : [];

      return {
        symbol: data.symbol || '--',
        price: data.price !== undefined ? String(data.price) : '--',
        zScore: Number(data.zscore || 0),
        atrRatio: Number(data.atr_ratio || 0),
        estado: data.estado || 'AGUARDANDO',
        timestamp: data.updated_at ? new Date(data.updated_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : (data.ts || '--:--:--'),
        sentiment: Number(data.delta_pct !== undefined ? data.delta_pct : 50),
        originalSentiment: Number(data.delta_pct !== undefined ? data.delta_pct : 50),
        delta: Number(data.delta || 0),
        deltaRatio: Number(data.ratio !== undefined ? data.ratio : 1.0),
        deltaPct: Number(data.delta_pct !== undefined ? data.delta_pct : 50),
        delta_pct: Number(data.delta_pct !== undefined ? data.delta_pct : 50),
        buyVolume: Number(data.buy_volume || 0),
        sellVolume: Number(data.sell_volume || 0),
        printsPerSecond: Number(data.print_rate || 0),
        blockTrades: formattedTrades,
        updated_at: data.updated_at
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      inFlightMarketDataDb.delete(key);
    }
  })();

  inFlightMarketDataDb.set(key, p);
  return p;
}

const inFlightForceDb = new Map<string, Promise<NasdaqForce | null>>();
const cachedForceDb = new Map<string, { data: NasdaqForce; ts: number }>();

// 2. Buscar Força Nasdaq (nasdaq_force)
export async function fetchForceSupabase(instanceId: string): Promise<NasdaqForce | null> {
  const key = instanceId || 'painel_principal';
  const now = Date.now();
  const cached = cachedForceDb.get(key);
  if (cached && (now - cached.ts < 1200)) {
    return cached.data;
  }
  if (inFlightForceDb.has(key)) {
    return inFlightForceDb.get(key)!;
  }

  const p = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      let data: any = null;

      // 1. Tenta buscar pelo cliente supabaseAdmin (sem lock de sessão)
      const { data: clientData, error: clientError } = await supabaseAdmin
        .from('nasdaq_force')
        .select('*')
        .eq('instance_id', key)
        .order('id', { ascending: false })
        .limit(1)
        .abortSignal(controller.signal)
        .maybeSingle();

      if (!clientError && clientData) {
        data = clientData;
      } else if (key !== 'painel_principal') {
        const { data: fallbackData } = await supabaseAdmin
          .from('nasdaq_force')
          .select('*')
          .eq('instance_id', 'painel_principal')
          .order('id', { ascending: false })
          .limit(1)
          .abortSignal(controller.signal)
          .maybeSingle();
        if (fallbackData) data = fallbackData;
      }

      if (!data) {
        return cached?.data || null;
      }

      let forces: { symbol: string; buy: number; sell: number }[] = [];
      if (data.force_data) {
        const parsed = typeof data.force_data === 'string' ? JSON.parse(data.force_data) : data.force_data;
        forces = parsed;
      } else {
        const mapping = [
          { key: 'nasdaq', display: 'NASDAQ' },
          { key: 'sp500', display: 'S&P 500' },
          { key: 'usdindex', display: 'USD Index' },
          { key: 'vix', display: 'VIX' },
          { key: 'nvidia', display: 'NVIDIA' },
          { key: 'microsoft', display: 'MICROSOFT' },
          { key: 'apple', display: 'APPLE' },
          { key: 'meta', display: 'META' },
          { key: 'amazon', display: 'AMAZON' },
          { key: 'alphabet', display: 'ALPHABET' },
          { key: 'tesla', display: 'TESLA' },
          { key: 'forca_final', display: 'FORÇA FINAL' }
        ];

        mapping.forEach(m => {
          const buyVal = data[`${m.key}_compra`];
          const sellVal = data[`${m.key}_venda`];
          if (buyVal !== undefined && sellVal !== undefined && buyVal !== null && sellVal !== null) {
            forces.push({
              symbol: m.display,
              buy: Number(buyVal),
              sell: Number(sellVal)
            });
          }
        });
      }

      const result = { forces };
      cachedForceDb.set(key, { data: result, ts: Date.now() });
      return result;
    } catch {
      return cached?.data || null;
    } finally {
      clearTimeout(timer);
      inFlightForceDb.delete(key);
    }
  })();

  inFlightForceDb.set(key, p);
  return p;
}

/**
 * Converte registro cru do Supabase nasdaq_force para objeto formatado com array de forças
 */
function parseNasdaqForceRow(data: any): NasdaqForce {
  let forces: { symbol: string; buy: number; sell: number }[] = [];
  if (data.force_data) {
    forces = typeof data.force_data === 'string' ? JSON.parse(data.force_data) : data.force_data;
  } else {
    const mapping = [
      { key: 'nasdaq', display: 'NASDAQ' },
      { key: 'sp500', display: 'S&P 500' },
      { key: 'usdindex', display: 'USD Index' },
      { key: 'vix', display: 'VIX' },
      { key: 'nvidia', display: 'NVIDIA' },
      { key: 'microsoft', display: 'MICROSOFT' },
      { key: 'apple', display: 'APPLE' },
      { key: 'meta', display: 'META' },
      { key: 'amazon', display: 'AMAZON' },
      { key: 'alphabet', display: 'ALPHABET' },
      { key: 'tesla', display: 'TESLA' },
      { key: 'forca_final', display: 'FORÇA FINAL' }
    ];

    mapping.forEach(m => {
      const buyVal = data[`${m.key}_compra`];
      const sellVal = data[`${m.key}_venda`];
      if (buyVal !== undefined && sellVal !== undefined && buyVal !== null && sellVal !== null) {
        forces.push({
          symbol: m.display,
          buy: Number(buyVal),
          sell: Number(sellVal)
        });
      }
    });
  }
  return { forces };
}

/**
 * Busca histórico minuto a minuto das forças (nasdaq_force) para análise comparativa e deltas.
 * Fallback para painelvm_forces_1m se nasdaq_force não possuir histórico suficiente.
 */
export async function fetchForces1mHistorySupabase(instanceId: string, limit: number = 60): Promise<any[]> {
  try {
    const targetId = instanceId || 'painel_principal';
    // 1. Tentar primeiro na tabela nasdaq_force (novo histórico consolidado)
    const { data, error } = await supabase
      .from('nasdaq_force')
      .select('*')
      .eq('instance_id', targetId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (!error && data && data.length > 0) {
      return data;
    }

    // 2. Fallback para painelvm_forces_1m se nasdaq_force ainda não tiver histórico
    const { data: legacyData } = await supabase
      .from('painelvm_forces_1m')
      .select('*')
      .eq('instance_id', targetId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    return legacyData || [];
  } catch (err) {
    console.error('[DB] Exceção ao buscar histórico nasdaq_force:', err);
    return [];
  }
}

/**
 * Busca a força do Nasdaq por aproximação de dia e tempo (<= targetTime).
 * Permite resgatar, por exemplo, o estado das forças de 10 horas atrás ou do início do dia.
 */
export async function fetchNasdaqForceAtTime(
  instanceId: string,
  targetTime: string | Date | number
): Promise<{ force: NasdaqForce | null; timestamp: string | null; rawData: any | null }> {
  try {
    const targetId = instanceId || 'painel_principal';
    const isoTime = new Date(targetTime).toISOString();

    const { data, error } = await supabase
      .from('nasdaq_force')
      .select('*')
      .eq('instance_id', targetId)
      .lte('timestamp', isoTime)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn(`[DB] Erro ao buscar força por aproximação em nasdaq_force:`, error);
      return { force: null, timestamp: null, rawData: null };
    }

    if (!data) {
      // Se não encontrou <= targetTime, tenta o registro mais antigo disponível >= targetTime
      const { data: fallbackNext } = await supabase
        .from('nasdaq_force')
        .select('*')
        .eq('instance_id', targetId)
        .gte('timestamp', isoTime)
        .order('timestamp', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fallbackNext) {
        return {
          force: parseNasdaqForceRow(fallbackNext),
          timestamp: fallbackNext.timestamp || fallbackNext.updated_at,
          rawData: fallbackNext
        };
      }

      return { force: null, timestamp: null, rawData: null };
    }

    return {
      force: parseNasdaqForceRow(data),
      timestamp: data.timestamp || data.updated_at,
      rawData: data
    };
  } catch (err) {
    console.error('[DB] Exceção em fetchNasdaqForceAtTime:', err);
    return { force: null, timestamp: null, rawData: null };
  }
}

/**
 * Busca uma faixa temporal contínua de registros de forças para análise gráfica ou estatística.
 */
export async function fetchNasdaqForceRange(
  instanceId: string,
  startTime: string | Date | number,
  endTime: string | Date | number
): Promise<any[]> {
  try {
    const targetId = instanceId || 'painel_principal';
    const startIso = new Date(startTime).toISOString();
    const endIso = new Date(endTime).toISOString();

    const { data, error } = await supabase
      .from('nasdaq_force')
      .select('*')
      .eq('instance_id', targetId)
      .gte('timestamp', startIso)
      .lte('timestamp', endIso)
      .order('timestamp', { ascending: true });

    if (error) {
      console.warn(`[DB] Erro ao buscar intervalo em nasdaq_force:`, error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[DB] Exceção em fetchNasdaqForceRange:', err);
    return [];
  }
}

// 3. Buscar Níveis de Gamma (gamma_levels)
export async function fetchGammaLevelsSupabase(symbol: string): Promise<GammaLevels | null> {
  try {
    if (!symbol || typeof symbol !== 'string') {
      console.warn('[DB] fetchGammaLevelsSupabase chamado com símbolo inválido ou indefinido:', symbol);
      return null;
    }
    const cleanSymbol = symbol.trim().toUpperCase();
    if (!cleanSymbol) return null;
    console.log(`[DB] Iniciando busca em gamma_levels para: '${cleanSymbol}'`);
    
    const { data, error } = await supabase
      .from('gamma_levels')
      .select('*')
      .eq('reference_symbol', cleanSymbol)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`[DB] Erro Supabase ao buscar gamma_levels para '${cleanSymbol}':`, error);
      throw new Error(error.message || JSON.stringify(error));
    }

    if (!data) {
      console.warn(`[DB] Nenhum registro retornado para '${cleanSymbol}'`);
      return null;
    }

    console.log(`[DB] Registro de gamma_levels encontrado com sucesso para '${cleanSymbol}':`, data);

    const parseGammaArray = (val: any): number[] => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map(Number);
      return String(val)
        .split(',')
        .map(v => parseFloat(v.trim()))
        .filter(v => !isNaN(v) && v > 0);
    };

    return {
      hvl: data.hvl !== undefined ? String(data.hvl) : '--',
      call: data.call_resistance !== undefined ? String(data.call_resistance) : '--',
      put: data.put_support !== undefined ? String(data.put_support) : '--',
      max1d: data.max_1d !== undefined ? String(data.max_1d) : '--',
      min1d: data.min_1d !== undefined ? String(data.min_1d) : '--',
      prev: data.prev_day_adjust !== undefined ? String(data.prev_day_adjust) : '--',
      prevH: data.prev_day_high !== undefined ? String(data.prev_day_high) : '--',
      prevL: data.prev_day_low !== undefined ? String(data.prev_day_low) : '--',
      hvl0: data.hvl_0dte !== undefined ? String(data.hvl_0dte) : '--',
      call0: data.call_resistance_0dte !== undefined ? String(data.call_resistance_0dte) : '--',
      put0: data.put_support_0dte !== undefined ? String(data.put_support_0dte) : '--',
      gwall: data.gamma_wall_0dte !== undefined ? String(data.gamma_wall_0dte) : '--',
      gex_count: data.gex ? String(data.gex).split(',').length : 0,
      bl_count: data.bl ? String(data.bl).split(',').length : 0,
      gex: parseGammaArray(data.gex),
      bl: parseGammaArray(data.bl),

      // Gamma Bias
      buy_strength: data.buy_strength !== undefined ? Number(data.buy_strength) : 0,
      sell_strength: data.sell_strength !== undefined ? Number(data.sell_strength) : 0,
      gamma_bias: data.gamma_bias !== undefined ? String(data.gamma_bias) : '--',
      bias_score: data.bias_score !== undefined ? Number(data.bias_score) : 0,
      nearest_resistance: data.nearest_resistance !== undefined ? Number(data.nearest_resistance) : 0,
      nearest_support: data.nearest_support !== undefined ? Number(data.nearest_support) : 0,
      distance_to_resistance: data.distance_to_resistance !== undefined ? Number(data.distance_to_resistance) : 0,
      distance_to_support: data.distance_to_support !== undefined ? Number(data.distance_to_support) : 0,
      confluence_type: data.confluence_type !== undefined ? String(data.confluence_type) : '--',
      recommended_strategy: data.recommended_strategy !== undefined ? String(data.recommended_strategy) : '--',
      void_gamma_above: data.void_gamma_above !== undefined ? Number(data.void_gamma_above) : 0,
      void_gamma_below: data.void_gamma_below !== undefined ? Number(data.void_gamma_below) : 0,
      bias_timestamp: data.bias_timestamp !== undefined ? String(data.bias_timestamp) : '--'
    };
  } catch (err) {
    console.error('[DB] Erro ao buscar gamma_levels:', err);
    throw err;
  }
}

// 3a. Buscar Dados do Mercado de Opções (painvelvm_options_market)
export async function fetchOptionsMarketSupabase(): Promise<OptionsMarketData | null> {
  try {
    const { data, error } = await supabase
      .from('painvelvm_options_market')
      .select('*')
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[DB] Aviso Supabase ao consultar painvelvm_options_market:', error.message);
      return null;
    }

    if (!data) return null;

    return {
      id: data.id,
      market_symbol: data.market_symbol || 'NQ',
      gamma_wall_positivo: data.gamma_wall_positivo !== undefined ? Number(data.gamma_wall_positivo) : undefined,
      flip_zone: data.flip_zone !== undefined ? Number(data.flip_zone) : undefined,
      gamma_wall_negativo: data.gamma_wall_negativo !== undefined ? Number(data.gamma_wall_negativo) : undefined,
      analytics: data.analytics || undefined,
      anchors: data.anchors || undefined,
      flow_and_exposure: data.flow_and_exposure || undefined,
      stock_replacement: data.stock_replacement || undefined,
      market_bias: data.market_bias || undefined,
      nq_projection: data.nq_projection || undefined,
      summary: data.summary || undefined,
      raw_data: data.raw_data || undefined,
      captured_at: data.captured_at || undefined,
      created_at: data.created_at || undefined
    };
  } catch (err) {
    console.warn('[DB] Exceção ao buscar painvelvm_options_market:', err);
    return null;
  }
}

// 3b. Buscar Níveis de Gamma para Simulação por Símbolo e Intervalo de Data/Hora
export async function fetchGammaLevelsByDateSupabase(symbol: string, targetTimestampISO: string): Promise<GammaLevels | null> {
  try {
    const cleanSymbol = symbol.trim().toUpperCase();
    
    // Tenta buscar o registro de gamma_levels com timestamp <= targetTimestampISO (ou updated_at / recorded_at)
    const { data, error } = await supabase
      .from('gamma_levels')
      .select('*')
      .eq('reference_symbol', cleanSymbol)
      .lte('recorded_at', targetTimestampISO)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      // Tentar fallback ordenando por ID se a coluna criada_at não for usada para filtro ou se falhar
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('gamma_levels')
        .select('*')
        .eq('reference_symbol', cleanSymbol)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fallbackError || !fallbackData) {
        return null;
      }

      const parseGammaArray = (val: any): number[] => {
        if (!val) return [];
        if (Array.isArray(val)) return val.map(Number);
        return String(val)
          .split(',')
          .map(v => parseFloat(v.trim()))
          .filter(v => !isNaN(v) && v > 0);
      };

      return {
        hvl: fallbackData.hvl !== undefined ? String(fallbackData.hvl) : '--',
        call: fallbackData.call_resistance !== undefined ? String(fallbackData.call_resistance) : '--',
        put: fallbackData.put_support !== undefined ? String(fallbackData.put_support) : '--',
        max1d: fallbackData.max_1d !== undefined ? String(fallbackData.max_1d) : '--',
        min1d: fallbackData.min_1d !== undefined ? String(fallbackData.min_1d) : '--',
        prev: fallbackData.prev_day_adjust !== undefined ? String(fallbackData.prev_day_adjust) : '--',
        prevH: fallbackData.prev_day_high !== undefined ? String(fallbackData.prev_day_high) : '--',
        prevL: fallbackData.prev_day_low !== undefined ? String(fallbackData.prev_day_low) : '--',
        hvl0: fallbackData.hvl_0dte !== undefined ? String(fallbackData.hvl_0dte) : '--',
        call0: fallbackData.call_resistance_0dte !== undefined ? String(fallbackData.call_resistance_0dte) : '--',
        put0: fallbackData.put_support_0dte !== undefined ? String(fallbackData.put_support_0dte) : '--',
        gwall: fallbackData.gamma_wall_0dte !== undefined ? String(fallbackData.gamma_wall_0dte) : '--',
        gex_count: fallbackData.gex ? String(fallbackData.gex).split(',').length : 0,
        bl_count: fallbackData.bl ? String(fallbackData.bl).split(',').length : 0,
        gex: parseGammaArray(fallbackData.gex),
        bl: parseGammaArray(fallbackData.bl),
        gamma_bias: fallbackData.gamma_bias !== undefined ? String(fallbackData.gamma_bias) : '--'
      };
    }

    const parseGammaArray = (val: any): number[] => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map(Number);
      return String(val)
        .split(',')
        .map(v => parseFloat(v.trim()))
        .filter(v => !isNaN(v) && v > 0);
    };

    return {
      hvl: data.hvl !== undefined ? String(data.hvl) : '--',
      call: data.call_resistance !== undefined ? String(data.call_resistance) : '--',
      put: data.put_support !== undefined ? String(data.put_support) : '--',
      max1d: data.max_1d !== undefined ? String(data.max_1d) : '--',
      min1d: data.min_1d !== undefined ? String(data.min_1d) : '--',
      prev: data.prev_day_adjust !== undefined ? String(data.prev_day_adjust) : '--',
      prevH: data.prev_day_high !== undefined ? String(data.prev_day_high) : '--',
      prevL: data.prev_day_low !== undefined ? String(data.prev_day_low) : '--',
      hvl0: data.hvl_0dte !== undefined ? String(data.hvl_0dte) : '--',
      call0: data.call_resistance_0dte !== undefined ? String(data.call_resistance_0dte) : '--',
      put0: data.put_support_0dte !== undefined ? String(data.put_support_0dte) : '--',
      gwall: data.gamma_wall_0dte !== undefined ? String(data.gamma_wall_0dte) : '--',
      gex_count: data.gex ? String(data.gex).split(',').length : 0,
      bl_count: data.bl ? String(data.bl).split(',').length : 0,
      gex: parseGammaArray(data.gex),
      bl: parseGammaArray(data.bl),
      gamma_bias: data.gamma_bias !== undefined ? String(data.gamma_bias) : '--'
    };
  } catch (err) {
    console.error('[DB] Erro ao buscar gamma_levels por data:', err);
    return null;
  }
}

// 3c. Buscar Níveis de Gamma por Intervalo de Data/Hora para Simulação Rápida
export async function fetchGammaLevelsForRangeSupabase(
  symbol: string,
  startDateISO: string,
  endDateISO: string
): Promise<any[]> {
  try {
    const cleanSymbol = symbol.trim().toUpperCase();
    const { data, error } = await supabase
      .from('gamma_levels')
      .select('*')
      .eq('reference_symbol', cleanSymbol)
      .gte('recorded_at', startDateISO)
      .lte('recorded_at', endDateISO)
      .order('recorded_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[DB] Erro ao buscar gamma_levels por intervalo:', err);
    return [];
  }
}

// Auxiliar para converter registro cru do Supabase em interface GammaLevels
export function parseGammaLevelRecord(data: any): GammaLevels {
  const parseGammaArray = (val: any): number[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(Number);
    return String(val)
      .split(',')
      .map(v => parseFloat(v.trim()))
      .filter(v => !isNaN(v) && v > 0);
  };

  return {
    hvl: data.hvl !== undefined ? String(data.hvl) : '--',
    call: data.call_resistance !== undefined ? String(data.call_resistance) : '--',
    put: data.put_support !== undefined ? String(data.put_support) : '--',
    max1d: data.max_1d !== undefined ? String(data.max_1d) : '--',
    min1d: data.min_1d !== undefined ? String(data.min_1d) : '--',
    prev: data.prev_day_adjust !== undefined ? String(data.prev_day_adjust) : '--',
    prevH: data.prev_day_high !== undefined ? String(data.prev_day_high) : '--',
    prevL: data.prev_day_low !== undefined ? String(data.prev_day_low) : '--',
    hvl0: data.hvl_0dte !== undefined ? String(data.hvl_0dte) : '--',
    call0: data.call_resistance_0dte !== undefined ? String(data.call_resistance_0dte) : '--',
    put0: data.put_support_0dte !== undefined ? String(data.put_support_0dte) : '--',
    gwall: data.gamma_wall_0dte !== undefined ? String(data.gamma_wall_0dte) : '--',
    gex_count: data.gex ? String(data.gex).split(',').length : 0,
    bl_count: data.bl ? String(data.bl).split(',').length : 0,
    gex: parseGammaArray(data.gex),
    bl: parseGammaArray(data.bl),
    gamma_bias: data.gamma_bias !== undefined ? String(data.gamma_bias) : '--',
    bias_score: data.bias_score !== undefined ? Number(data.bias_score) : 0,
    buy_strength: data.buy_strength !== undefined ? Number(data.buy_strength) : 50,
    sell_strength: data.sell_strength !== undefined ? Number(data.sell_strength) : 50,
    nearest_resistance: data.nearest_resistance !== undefined ? Number(data.nearest_resistance) : 0,
    nearest_support: data.nearest_support !== undefined ? Number(data.nearest_support) : 0,
    distance_to_resistance: data.distance_to_resistance !== undefined ? Number(data.distance_to_resistance) : 9999,
    distance_to_support: data.distance_to_support !== undefined ? Number(data.distance_to_support) : 9999,
    confluence_type: data.confluence_type !== undefined ? String(data.confluence_type) : '--',
    recommended_strategy: data.recommended_strategy !== undefined ? String(data.recommended_strategy) : '--',
    void_gamma_above: data.void_gamma_above !== undefined ? Number(data.void_gamma_above) : 0,
    void_gamma_below: data.void_gamma_below !== undefined ? Number(data.void_gamma_below) : 0,
    bias_timestamp: data.bias_timestamp !== undefined ? String(data.bias_timestamp) : '--'
  };
}

// 4. Buscar Captura de Tela (screenshots)
export async function fetchScreenshotSupabase(instanceId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('screenshots')
      .select('image_data')
      .eq('instance_id', instanceId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error('[DB] Erro screenshots:', error);
      return null;
    }

    return data.image_data || null; // Espera-se que seja base64 string
  } catch (err) {
    console.error('[DB] Erro ao buscar screenshot:', err);
    return null;
  }
}

// 5. Buscar Notícias Econômicas (economic_news)
export async function fetchNewsSupabase(): Promise<EconomicNewsItem[]> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('economic_news')
      .select('*')
      .gte('event_date', today)
      .order('event_date', { ascending: true });

    if (error) {
      console.error('[DB] Erro economic_news:', error);
      return [];
    }

    return (data || []).map(item => ({
      id: String(item.id),
      date: new Date(item.event_date),
      country: item.country || 'US',
      impact: item.impact || 'low',
      title: item.title || item.event_name || '--',
      forecast: item.forecast || '',
      previous: item.previous || '',
      unit: item.unit || ''
    }));
  } catch (err) {
    console.error('[DB] Erro ao buscar notícias:', err);
    return [];
  }
}

// 5b. Buscar Notícias Econômicas por Intervalo de Data (para Simulação Histórica)
export async function fetchNewsForRangeSupabase(
  startDateISO: string,
  endDateISO: string
): Promise<EconomicNewsItem[]> {
  try {
    const { data, error } = await supabase
      .from('economic_news')
      .select('*')
      .gte('event_date', startDateISO)
      .lte('event_date', endDateISO)
      .order('event_date', { ascending: true });

    if (error) {
      console.error('[DB] Erro economic_news por intervalo:', error);
      return [];
    }

    return (data || []).map(item => ({
      id: String(item.id),
      date: new Date(item.event_date),
      country: item.country || 'US',
      impact: item.impact || 'low',
      title: item.title || item.event_name || '--',
      forecast: item.forecast || '',
      previous: item.previous || '',
      unit: item.unit || ''
    }));
  } catch (err) {
    console.error('[DB] Erro ao buscar notícias por intervalo:', err);
    return [];
  }
}

// Helper para determinar status da notícia em um timestamp específico (Realtime / Simulador)
export function getNewsStatusForTimestamp(
  newsList: any[],
  candleTimestamp: string | Date | number
): { impact: 'alto' | 'medio' | 'baixo' | 'nenhum'; minutesAgo: number; newsTitle: string; country: string } {
  if (!newsList || newsList.length === 0 || !candleTimestamp) {
    return { impact: 'nenhum', minutesAgo: 999, newsTitle: '', country: '' };
  }

  const candleTime = new Date(candleTimestamp).getTime();
  if (isNaN(candleTime)) {
    return { impact: 'nenhum', minutesAgo: 999, newsTitle: '', country: '' };
  }

  let bestImpactRank = 0; // 0 = nenhum, 1 = baixo, 2 = médio, 3 = alto
  let bestImpactStr: 'alto' | 'medio' | 'baixo' | 'nenhum' = 'nenhum';
  let minMinutesAgo = 999;
  let activeTitle = '';
  let activeCountry = '';

  for (const item of newsList) {
    const itemDate = item.date ? new Date(item.date).getTime() : (item.event_date ? new Date(item.event_date).getTime() : 0);
    if (isNaN(itemDate) || itemDate <= 0) continue;

    // Diferença em minutos entre o tempo do candle e a notícia
    const diffMs = candleTime - itemDate;
    const diffMinutes = Math.floor(diffMs / 60000);

    // Consideramos notícia ativa se o candle ocorreu no minuto da notícia ou até 5 minutos após (barra de explosão/impacto)
    if (diffMinutes >= 0 && diffMinutes <= 5) {
      const impRaw = String(item.impact || '').toLowerCase();
      let rank = 1;
      let impNormalized: 'alto' | 'medio' | 'baixo' = 'baixo';

      if (impRaw === 'high' || impRaw === 'alto' || impRaw === '3') {
        rank = 3;
        impNormalized = 'alto';
      } else if (impRaw === 'medium' || impRaw === 'medio' || impRaw === '2') {
        rank = 2;
        impNormalized = 'medio';
      } else {
        rank = 1;
        impNormalized = 'baixo';
      }

      if (rank > bestImpactRank || (rank === bestImpactRank && diffMinutes < minMinutesAgo)) {
        bestImpactRank = rank;
        bestImpactStr = impNormalized;
        minMinutesAgo = diffMinutes;
        activeTitle = item.title || item.event_name || '';
        activeCountry = item.country ? String(item.country).toUpperCase() : '';
      }
    }
  }

  return { impact: bestImpactStr, minutesAgo: minMinutesAgo, newsTitle: activeTitle, country: activeCountry };
}

// 6. Buscar Sinal Local (quando configurado no modo local)
export async function fetchLocalSinal(): Promise<MarketData | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1000);
  try {
    const gwUrl = typeof localStorage !== 'undefined' ? (localStorage.getItem('vortex_ninja_gateway_url') || 'http://localhost:8001').trim().replace(/\/+$/, '') : 'http://localhost:8001';
    const response = await fetch(`${gwUrl}/sinal`, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();

    const localTrades = data.block_trades || [];
    const formattedTrades: BlockTrade[] = Array.isArray(localTrades) ? localTrades.map((t: any) => {
      return {
        time: t.time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        price: Number(t.price || 0),
        volume: Number(t.volume || 0),
        side: String(t.side || 'COMPRA').toUpperCase()
      };
    }) : [];

    return {
      symbol: data.symbol || '--',
      price: data.price !== undefined ? String(data.price) : '--',
      zScore: Number(data.zscore || 0),
      atrRatio: Number(data.atr_ratio || 0),
      estado: data.estado || 'AGUARDANDO',
      timestamp: data.timestamp || '--:--:--',
      sentiment: Number(data.sentiment || 50),
      originalSentiment: Number(data.sentiment || 50),
      delta: Number(data.delta_value || 0),
      deltaRatio: Number(data.delta_ratio || 1.0),
      buyVolume: Number(data.buy_volume || 0),
      sellVolume: Number(data.sell_volume || 0),
      printsPerSecond: Number(data.prints_per_second || 0),
      blockTrades: formattedTrades,
      updated_at: data.updated_at || new Date().toISOString()
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return null;
  }
}

export const OFFICIAL_COPILOT_PRESET_PROMPTS: AIPrompt[] = [
  {
    id: 'preset-copilot-quant-360',
    user_id: null,
    name: '🤖 Copilot Quantitativo Institucional 360°',
    description: 'Análise completa com confluência de Volume Profile (VPOC/VAH/VAL/Naked POCs), Gamma Levels (HVL/GEX/BLs), Macro Índices (S&P 500, USDIndex, VIX) e Ações M7 com correlação inversa de VIX/DXY.',
    confluences: 'Confluência entre Volume Profile (VPOC, VAH, VAL, Naked POCs), Gamma Levels (Call Resistance, Put Support, HVL, GEX, BLs), Forças de Ações Magnificent 7 e Macro Índices. IMPORTANTE PARA NASDAQ/S&P500: VIX e USDINDEX (DXY) são INVERSAMENTE PROPORCIONAIS (VIX/DXY com força compradora = viés vendedor no NQ; VIX/DXY com força vendedora = fluxo comprador no NQ).',
    trigger_entry: 'Rejeição ou confirmação de rompimento em nível estrutural com confluência de delta e correlação macro (S&P500/M7 alinhados e VIX/DXY inversos).',
    stop_loss_type: 'regions',
    stop_loss_value: '15.0',
    take_profit_type: 'regions',
    take_profit_value: '30.0',
    is_admin: true,
    analyze_chart: true,
    prompt_type: 'signal_generator',
    created_at: '2026-01-01T00:00:00Z'
  },
  {
    id: 'preset-copilot-gamma-levels',
    user_id: null,
    name: '🟣 Copilot Gamma Levels & Reversão Institucional',
    description: 'Especialista em zonas de defesa institucional: Put Support 0DTE, Call Resistance 0DTE, HVL e Void Gamma com correlação macro inversa de VIX/DXY.',
    confluences: 'Preço testando Put Support ou Call Resistance de Opções 0DTE com Viés Gamma favorável e desaceleração do fluxo. Para compras em Put Support, verificar alívio de venda no VIX/USDINDEX.',
    trigger_entry: 'Toque e rejeição em Put 0DTE (Compra) ou Call 0DTE (Venda) com divergência de delta e confirmação macro.',
    stop_loss_type: 'regions',
    stop_loss_value: '12.0',
    take_profit_type: 'regions',
    take_profit_value: '25.0',
    is_admin: true,
    analyze_chart: true,
    prompt_type: 'signal_generator',
    created_at: '2026-01-01T00:00:00Z'
  },
  {
    id: 'preset-copilot-volume-profile',
    user_id: null,
    name: '📊 Copilot Volume Profile & Naked POC Scalper',
    description: 'Scalper institucional em retestes de Naked POCs, nós de alto volume (HVN Blocks) e Value Area (VAH/VAL) com validação de correlação inversa.',
    confluences: 'Reteste de Naked POC ou borda da Value Area (VAH/VAL 70%). Compras exigem VIX/USDINDEX sem pressão compradora forte.',
    trigger_entry: 'Falsa ruptura de VAH/VAL ou absorção em Naked POC alinhada ao fluxo institucional.',
    stop_loss_type: 'points',
    stop_loss_value: '10.0',
    take_profit_type: 'points',
    take_profit_value: '20.0',
    is_admin: true,
    analyze_chart: true,
    prompt_type: 'signal_generator',
    created_at: '2026-01-01T00:00:00Z'
  },
  {
    id: 'preset-copilot-momentum-breakout',
    user_id: null,
    name: '⚡ Copilot Momentum & Ruptura de Liquidez',
    description: 'Captura expansões de volatilidade e rompimentos com confirmação de Prints/s, Delta Ratio e alinhamento macro inverso de VIX/DXY.',
    confluences: 'ATR Ratio elevado (> 1.2), aceleração de Prints/s e rompimento de máximas/mínimas. Rompimentos de alta exigem VIX em queda/venda; rompimentos de baixa exigem VIX em alta/compra.',
    trigger_entry: 'Rompimento de nível institucional com spike de volume e confirmação direcional do S&P500.',
    stop_loss_type: 'points',
    stop_loss_value: '14.0',
    take_profit_type: 'points',
    take_profit_value: '35.0',
    is_admin: true,
    analyze_chart: true,
    prompt_type: 'signal_generator',
    created_at: '2026-01-01T00:00:00Z'
  }
];

let mockPrompts: AIPrompt[] = [];

const loadMockPrompts = () => {
  try {
    const saved = localStorage.getItem('vortex_custom_prompts');
    if (saved) {
      mockPrompts = JSON.parse(saved);
    }
  } catch (e) {
    console.error('[DB MOCK] Error loading custom prompts:', e);
  }
};

const saveMockPrompts = () => {
  try {
    localStorage.setItem('vortex_custom_prompts', JSON.stringify(mockPrompts));
  } catch (e) {
    console.error('[DB MOCK] Error saving custom prompts:', e);
  }
};

loadMockPrompts();

// 7. Buscar Prompts/Estratégias (Local-first com Sincronização Supabase)
export async function fetchPromptsSupabase(): Promise<AIPrompt[]> {
  loadMockPrompts();
  let localTypes: Record<string, 'context_filter' | 'signal_generator'> = {};
  let localTriggers: Record<string, string> = {};
  try {
    const rawMap = localStorage.getItem('vortex_prompt_types');
    if (rawMap) localTypes = JSON.parse(rawMap);
  } catch (e) {}
  try {
    const rawTriggers = localStorage.getItem('vortex_prompt_triggers');
    if (rawTriggers) localTriggers = JSON.parse(rawTriggers);
  } catch (e) {}

  const combinedMap = new Map<string, AIPrompt>();
  // Inserir os presets oficiais do Copilot por padrão
  OFFICIAL_COPILOT_PRESET_PROMPTS.forEach(p => combinedMap.set(p.id, p));

  // Inserir os prompts locais salvos pelo usuário
  mockPrompts.forEach(p => {
    combinedMap.set(p.id, {
      ...p,
      prompt_type: localTypes[p.id] || p.prompt_type || 'context_filter',
      trigger_strategy_id: p.trigger_strategy_id || localTriggers[p.id] || null
    });
  });

  try {
    const user = await getAuthUser();
    let query = supabase.from('painelvm_prompts').select('*');
    if (user && user.id) {
      query = query.or(`user_id.eq.${user.id},user_id.is.null,is_admin.eq.true`);
    }

    const { data, error } = await withDbTimeout(
      query.order('created_at', { ascending: true }),
      3500
    );
    
    if (!error && data) {
      data.forEach((p: any) => {
        const item: AIPrompt = {
          ...p,
          prompt_type: p.prompt_type || localTypes[p.id] || 'context_filter',
          trigger_strategy_id: p.trigger_strategy_id || localTriggers[p.id] || (mockPrompts.find(m => m.id === p.id)?.trigger_strategy_id) || null
        };
        combinedMap.set(p.id, item);

        // Atualizar mapas de metadados locais para consistência imediata
        if (item.prompt_type) saveLocalPromptType(item.id, item.prompt_type);
        if (item.trigger_strategy_id) saveLocalPromptTrigger(item.id, item.trigger_strategy_id);

        const mIdx = mockPrompts.findIndex(mp => mp.id === p.id);
        if (mIdx >= 0) {
          mockPrompts[mIdx] = item;
        } else if (!p.is_admin) {
          mockPrompts.push(item);
        }
      });
      saveMockPrompts();
    }
  } catch (err) {
    console.warn('[DB] Aviso ao buscar prompts do Supabase, usando dados locais:', err);
  }

  return Array.from(combinedMap.values());
}

// Helper interno para salvar tipo localmente
const saveLocalPromptType = (id: string, type: 'context_filter' | 'signal_generator') => {
  try {
    const rawMap = localStorage.getItem('vortex_prompt_types') || '{}';
    const map = JSON.parse(rawMap);
    map[id] = type;
    localStorage.setItem('vortex_prompt_types', JSON.stringify(map));
  } catch (e) {}
};

// Helper interno para salvar robô acionador localmente
const saveLocalPromptTrigger = (id: string, triggerId: string | null | undefined) => {
  try {
    const rawMap = localStorage.getItem('vortex_prompt_triggers') || '{}';
    const map = JSON.parse(rawMap);
    if (triggerId) {
      map[id] = triggerId;
    } else {
      delete map[id];
    }
    localStorage.setItem('vortex_prompt_triggers', JSON.stringify(map));
  } catch (e) {}
};

// 8. Salvar ou Atualizar Prompt no Supabase e Cache Local (Zero bloqueio e Local-First)
export async function savePromptSupabase(prompt: Partial<AIPrompt>): Promise<AIPrompt | null> {
  try {
    const user = await getAuthUser();
    const targetType = prompt.prompt_type || 'context_filter';
    const promptId = (prompt.id && isValidUUID(prompt.id)) ? prompt.id : generateSecureUUID();

    const fullPrompt: AIPrompt = {
      id: promptId,
      user_id: user?.id || prompt.user_id || 'local_user',
      panel_id: prompt.panel_id !== undefined ? prompt.panel_id : null,
      name: prompt.name || 'Nova Estratégia IA',
      description: prompt.description || null,
      confluences: prompt.confluences || '',
      trigger_entry: prompt.trigger_entry || '',
      stop_loss_type: prompt.stop_loss_type || 'points',
      stop_loss_value: String(prompt.stop_loss_value || '40'),
      take_profit_type: prompt.take_profit_type || 'points',
      take_profit_value: String(prompt.take_profit_value || '35'),
      is_admin: prompt.is_admin ?? false,
      analyze_chart: prompt.analyze_chart ?? false,
      trigger_strategy_id: prompt.trigger_strategy_id || null,
      prompt_type: targetType,
      created_at: prompt.created_at || new Date().toISOString()
    };

    // 1. Salvar localmente instantaneamente
    loadMockPrompts();
    const idx = mockPrompts.findIndex(p => p.id === promptId);
    if (idx >= 0) {
      mockPrompts[idx] = fullPrompt;
    } else {
      mockPrompts.unshift(fullPrompt);
    }
    saveMockPrompts();
    saveLocalPromptType(promptId, targetType);
    saveLocalPromptTrigger(promptId, fullPrompt.trigger_strategy_id);

    // 2. Sincronizar com Supabase com UPSERT atômico caso o usuário esteja autenticado
    if (user && user.id) {
      try {
        const payload: any = {
          id: promptId,
          name: fullPrompt.name,
          description: fullPrompt.description,
          confluences: fullPrompt.confluences,
          trigger_entry: fullPrompt.trigger_entry,
          stop_loss_type: fullPrompt.stop_loss_type,
          stop_loss_value: fullPrompt.stop_loss_value,
          take_profit_type: fullPrompt.take_profit_type,
          take_profit_value: fullPrompt.take_profit_value,
          is_admin: fullPrompt.is_admin,
          analyze_chart: fullPrompt.analyze_chart,
          trigger_strategy_id: fullPrompt.trigger_strategy_id,
          prompt_type: targetType,
          user_id: user.id
        };

        if (isValidUUID(fullPrompt.panel_id)) {
          payload.panel_id = fullPrompt.panel_id;
        }

        const { data: upsertData, error: upsertError } = await withDbTimeout(
          supabase
            .from('painelvm_prompts')
            .upsert(payload, { onConflict: 'id' })
            .select()
            .maybeSingle(),
          4000
        );

        if (upsertError) {
          console.warn('[DB] Erro no upsert do prompt no Supabase, tentando payload compatível:', upsertError.message);
          const safePayload = { ...payload };
          delete safePayload.trigger_strategy_id;
          delete safePayload.prompt_type;
          delete safePayload.analyze_chart;
          delete safePayload.panel_id;

          await withDbTimeout(
            supabase
              .from('painelvm_prompts')
              .upsert(safePayload, { onConflict: 'id' }),
            3500
          );
        } else if (upsertData) {
          const merged = { ...fullPrompt, ...upsertData };
          const mIdx = mockPrompts.findIndex(p => p.id === promptId);
          if (mIdx >= 0) mockPrompts[mIdx] = merged;
          saveMockPrompts();
          return merged;
        }
      } catch (syncErr) {
        console.warn('[DB] Prompt salvo localmente (aviso Supabase):', syncErr);
      }
    }

    return fullPrompt;
  } catch (err) {
    console.error('[DB] Erro ao salvar prompt:', err);
    return prompt as AIPrompt;
  }
}

// 9. Deletar Prompt do Supabase e Cache Local
export async function deletePromptSupabase(id: string): Promise<boolean> {
  try {
    loadMockPrompts();
    mockPrompts = mockPrompts.filter(p => p.id !== id);
    saveMockPrompts();
    saveLocalPromptTrigger(id, null);

    try {
      await withDbTimeout(
        supabase
          .from('painelvm_prompts')
          .delete()
          .eq('id', id),
        3500
      );
    } catch (e) {
      console.warn('[DB] Aviso ao deletar prompt no Supabase:', e);
    }

    return true;
  } catch (err) {
    console.error('[DB] Erro ao deletar prompt:', err);
    return false;
  }
}

export interface StrategyReport {
  is_atm?: boolean;
  allow_multi?: boolean;
  account_name?: string;
  id: string;
  user_id: string;
  strategy_id: string | null;
  strategy_name: string;
  side: 'COMPRA' | 'VENDA';
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  exit_price: number | null;
  status: 'Gain' | 'Stop' | 'Em Andamento' | 'Cancelado';
  description: string | null;
  created_at: string;
  closed_at: string | null;
  instance_id?: string | null;
  panel_id?: string | null;
  contrato?: number;
  account_id?: string | null;
    master_operation_id?: string | null;
  is_copy_trade?: boolean;
  symbol?: string | null;
  realized_pnl?: number | null;
  profit_points?: number | null;
}

export const ALLOWED_REPORT_DB_COLUMNS = new Set([
  'id',
  'user_id',
  'strategy_id',
  'strategy_name',
  'side',
  'entry_price',
  'stop_loss',
  'take_profit',
  'exit_price',
  'status',
  'description',
  'created_at',
  'closed_at',
  'subscription_id',
  'instance_id',
  'panel_id',
  'contrato',
  'account_id',
  'master_operation_id',
  'is_copy_trade',
  'symbol'
]);

export function sanitizeReportDbPayload(payload: any): any {
  if (!payload || typeof payload !== 'object') return payload;
  const sanitized: any = {};
  for (const key of Object.keys(payload)) {
    if (ALLOWED_REPORT_DB_COLUMNS.has(key)) {
      sanitized[key] = payload[key];
    }
  }
  return sanitized;
}

// Helpers de persistência local para relatórios de estratégia (evita que operações sumam em caso de timeout de rede)
export const getLocalStrategyReports = (): StrategyReport[] => {
  try {
    const subId = typeof localStorage !== 'undefined' ? (localStorage.getItem('vortex_subscription_id') || 'default') : 'default';
    const raw = (typeof localStorage !== 'undefined' && localStorage.getItem(`vortex_strategy_reports_local_${subId}`)) || 
                (typeof localStorage !== 'undefined' && localStorage.getItem('vortex_strategy_reports_local'));
    if (!raw) return [];
    const list: StrategyReport[] = JSON.parse(raw);
    // 🛡️ Filtra automaticamente qualquer relatório residual inconsistente:
    // Remove relatórios com 'Execução NT8' e status 'Em Andamento' gerados por auto-import indevido
    const cleaned = list.filter(r => {
      if (r.strategy_name === 'Execução NT8' && r.status === 'Em Andamento') return false;
      return true;
    });
    if (cleaned.length !== list.length) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`vortex_strategy_reports_local_${subId}`, JSON.stringify(cleaned));
        localStorage.setItem('vortex_strategy_reports_local', JSON.stringify(cleaned));
      }
    }
    return cleaned;
  } catch (e) {
    return [];
  }
};

export const saveLocalStrategyReports = (reports: StrategyReport[]) => {
  try {
    const subId = typeof localStorage !== 'undefined' ? (localStorage.getItem('vortex_subscription_id') || 'default') : 'default';
    const cleaned = reports.filter(r => !(r.strategy_name === 'Execução NT8' && r.status === 'Em Andamento'));
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`vortex_strategy_reports_local_${subId}`, JSON.stringify(cleaned.slice(0, 500)));
      localStorage.setItem('vortex_strategy_reports_local', JSON.stringify(cleaned.slice(0, 500)));
    }
  } catch (e) {}
};

// 10. Buscar relatórios do Supabase
export async function fetchStrategyReportsSupabase(): Promise<StrategyReport[]> {
  try {
    const user = await getAuthUser();
    const rawLocalList = getLocalStrategyReports();
    const localList = user ? rawLocalList.filter(r => !r.user_id || r.user_id === user.id) : rawLocalList;
    if (!user) return localList;

    const userEmail = user.email || '';
    const isSystemAdmin = userEmail.toLowerCase() === 'admin@vortex.com';
    const storedSubscriptionId = localStorage.getItem('vortex_subscription_id');

    let query = supabase
      .from('painelvm_strategy_reports')
      .select('*');

    if (isSystemAdmin && storedSubscriptionId === 'admin') {
      query = query.or(`subscription_id.eq.admin,user_id.eq.${user.id}`);
    } else if (storedSubscriptionId) {
      query = query.eq('user_id', user.id).eq('subscription_id', storedSubscriptionId);
    } else {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await withDbTimeout(
      query.order('created_at', { ascending: false }).limit(500),
      5000
    );

    if (error) {
      console.warn('[DB] Erro ao buscar relatórios no Supabase. Usando relatórios em cache:', error.message);
      return localList;
    }

    if (data) {
      const map = new Map<string, StrategyReport>();
      const localStatusMap = new Map(localList.map(r => [r.id, r]));

      data.forEach((r: any) => {
        const local = localStatusMap.get(r.id);
        // Se localmente a ordem já foi encerrada/cancelada e o banco ainda está 'Em Andamento', respeita o encerramento local recente
        if (local && (local.status === 'Cancelado' || local.status === 'Gain' || local.status === 'Stop') && r.status === 'Em Andamento') {
          map.set(r.id, { ...r, status: local.status, exit_price: local.exit_price, closed_at: local.closed_at });
        } else {
          map.set(r.id, r);
        }
      });

      localList.filter(r => !r.user_id || r.user_id === user.id).forEach(r => {
        if (!map.has(r.id)) {
          map.set(r.id, r);
        }
      });
      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      saveLocalStrategyReports(merged);
      return merged;
    }


    return localList;
  } catch (err) {
    console.error('[DB] Erro/Timeout ao buscar relatórios. Retornando cache local:', err);
    return getLocalStrategyReports();
  }
}

// 11. Inserir relatório no Supabase
export async function insertStrategyReportSupabase(
  report: Omit<StrategyReport, 'id' | 'created_at' | 'closed_at' | 'user_id'> & { created_at?: string }
): Promise<StrategyReport | null> {
  try {
    const user = await getAuthUser();
    const userId = user?.id;
    if (!userId) throw new Error('Usuário não autenticado.');

    const storedSubscriptionId = localStorage.getItem('vortex_subscription_id');

    // Limpar valores numéricos para evitar NaN no JSON
    const cleanReport = {
      ...report,
      stop_loss: (report.stop_loss !== null && report.stop_loss !== undefined && !isNaN(Number(report.stop_loss))) ? Number(report.stop_loss) : null,
      take_profit: (report.take_profit !== null && report.take_profit !== undefined && !isNaN(Number(report.take_profit))) ? Number(report.take_profit) : null,
      entry_price: (report.entry_price !== null && report.entry_price !== undefined && !isNaN(Number(report.entry_price))) ? Number(report.entry_price) : 0,
      contrato: (report.contrato !== null && report.contrato !== undefined && !isNaN(Number(report.contrato))) ? Number(report.contrato) : 1
    };

    const instanceIdToUse = cleanReport.instance_id || 'painel_principal';
    const subIdToUse = (cleanReport as any).subscription_id || storedSubscriptionId || null;

    const generatedId = (cleanReport as any).id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : (`loc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`));

    const payload: any = { 
      ...cleanReport, 
      id: generatedId,
      user_id: userId,
      created_at: (report as any).created_at || new Date().toISOString(),
      instance_id: instanceIdToUse,
      subscription_id: subIdToUse,
      status: (cleanReport as any).status || 'Em Andamento'
    };

    const allAccounts = getLocalBrokerAccounts();
    const targetAcc = allAccounts.find(a => a.id === payload.account_id);
    const isLocalExecutionAccount = isNinjaExecutionAccount(targetAcc);

    // 🔒 Proteção de Contas Sincronizadas NinjaTrader: Se a conta for NT8 e a ordem NÃO veio do próprio NT8, rejeita a inserção direta via painel.
    // Operações devem ser feitas em Contas Demo (com replicação via Copy Trading) ou diretamente no NinjaTrader 8.
    if (isLocalExecutionAccount && !(cleanReport as any).is_master_event && !(cleanReport as any).is_ninja_event) {
      console.warn(`[VORTEX] Ordem bloqueada: A conta "${targetAcc?.account_name}" é sincronizada com o NinjaTrader 8 e não aceita operações diretas do painel. Opere em Conta Demo (com replicação via Copy Trading) ou diretamente no NinjaTrader 8.`);
      return null;
    }

    // Salvar imediatamente no cache local para não sumir da tela
    const currentLocals = getLocalStrategyReports();
    const filteredLocals = currentLocals.filter(r => r.id !== payload.id);
    saveLocalStrategyReports([payload, ...filteredLocals]);

    // ⚡ DISPARO INSTANTÂNEO (0ms): Envia para o ConectorLocal APENAS se a conta tiver sincronização local ativa e não foi disparado pelo contexto
    if (isLocalExecutionAccount && !(cleanReport as any).already_dispatched) {
      // Garantir que nenhuma operação seja enviada ao NinjaTrader sem SL e TP
      let finalSl = Number(payload.stop_loss || 0);
      let finalTp = Number(payload.take_profit || 0);
      const entryP = Number(payload.entry_price || 0);

      if (finalSl <= 0 && entryP > 0) {
        finalSl = payload.side === 'COMPRA' ? entryP - 20 : entryP + 20;
        payload.stop_loss = finalSl;
      }
      if (finalTp <= 0 && entryP > 0) {
        finalTp = payload.side === 'COMPRA' ? entryP + 40 : entryP - 40;
        payload.take_profit = finalTp;
      }

      if (finalSl > 0 && finalTp > 0) {
        const resolvedSymbol = resolveAccountExecutionSymbol(targetAcc, payload.symbol);
        const stopPoints = entryP > 0 ? Math.abs(entryP - finalSl) : 0;
        const takePoints = entryP > 0 ? Math.abs(finalTp - entryP) : 0;

        const isAtm = Boolean(
          (payload as any).is_atm ||
          (payload.strategy_name && payload.strategy_name.includes('Alvo')) ||
          (payload.description && payload.description.includes('ATM'))
        );
        const allowMulti = Boolean(
          (payload as any).allow_multi ||
          (payload as any).allow_multi_signals ||
          targetAcc?.allow_multi_signals ||
          isAtm
        );

        const effectiveQty = Number(payload.contrato || (payload as any).quantity || 1);
        const localDispatchPayload = {
          ...payload,
          contrato: effectiveQty,
          quantity: effectiveQty,
          stop_loss: finalSl,
          take_profit: finalTp,
          stop_loss_points: stopPoints,
          take_profit_points: takePoints,
          symbol: resolvedSymbol,
          account_name: targetAcc?.account_name || payload.account_name,
          is_atm: isAtm,
          allow_multi: allowMulti
        };
        mirrorToLocalServer('/sinal_local', localDispatchPayload);
      }
    }


    const dbPayload = sanitizeReportDbPayload(payload);

    const { data, error } = await withDbTimeout(
      supabase
        .from('painelvm_strategy_reports')
        .insert([dbPayload])
        .select()
        .single(),
      5000
    );

    if (error) {
      console.warn('[DB] Erro ao inserir relatório no Supabase:', error.message);
      
      let safePayload = { ...dbPayload };
      if (error.message && (error.message.includes('realized_pnl') || error.message.includes('profit_points'))) {
        delete safePayload.realized_pnl;
        delete safePayload.profit_points;
      }

      // Se a falha for por erro em strategy_id (FK constraint, sintaxe de UUID inválida, etc.), anular o campo e tentar salvar novamente
      if (dbPayload.strategy_id || safePayload.realized_pnl === undefined) {
        try {
          const fallbackPayload = { ...safePayload, strategy_id: null };
          const { data: retryData, error: retryError } = await withDbTimeout(
            supabase
              .from('painelvm_strategy_reports')
              .insert([fallbackPayload])
              .select()
              .single(),
            5000
          );
          if (!retryError && retryData) {
            const alreadyDispatchedToSlaves = Boolean((fallbackPayload as any).already_dispatched_to_slaves || (cleanReport as any).already_dispatched_to_slaves);
            const isCopyTrade = Boolean((fallbackPayload as any).is_copy_trade || fallbackPayload.master_operation_id);
            if (!alreadyDispatchedToSlaves && !isCopyTrade) {
              await triggerCopyTradingForMaster(retryData, fallbackPayload);
            }
            return { ...retryData, realized_pnl: (payload as any).realized_pnl, profit_points: (payload as any).profit_points };
          }
        } catch (retryErr) {
          console.error('[DB] Erro ao retentar inserção:', retryErr);
        }
      }
      const alreadyDispatchedToSlaves = Boolean((payload as any).already_dispatched_to_slaves || (cleanReport as any).already_dispatched_to_slaves);
      const isCopyTrade = Boolean((payload as any).is_copy_trade || payload.master_operation_id);
      if (!alreadyDispatchedToSlaves && !isCopyTrade) {
        await triggerCopyTradingForMaster(payload, payload);
      }
      return payload;
    }

    const alreadyDispatchedToSlaves = Boolean((payload as any).already_dispatched_to_slaves || (cleanReport as any).already_dispatched_to_slaves);
    const isCopyTrade = Boolean((payload as any).is_copy_trade || payload.master_operation_id);
    if (data && !alreadyDispatchedToSlaves && !isCopyTrade) {
      await triggerCopyTradingForMaster(data, payload);
      return data;
    }

    if (!alreadyDispatchedToSlaves && !isCopyTrade) {
      await triggerCopyTradingForMaster(payload, payload);
    }
    return payload;
  } catch (err: any) {
    console.error('[DB] Exceção ao salvar relatório de estratégia:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard: determina se uma conta deve ter ordens enviadas ao NinjaTrader local.
// Apenas contas com platform 'nt8' ou 'mt5', send_localhost=true ou contas padrão NinjaTrader.
// Contas axion puras (sem flag local e sem nome Ninja) NUNCA vão ao NinjaTrader.
// ─────────────────────────────────────────────────────────────────────────────
export function isNinjaExecutionAccount(acc: any): boolean {
  if (!acc) return false;
  // 1. Flag explícita de envio local
  if (acc.send_localhost === true) return true;

  const platform = (acc.platform || '').toLowerCase();
  if (platform === 'nt8' || platform === 'mt5') return true;

  // 2. Auto-detecção inteligente por padrão de nome de conta NinjaTrader
  const name = (acc.account_name || acc.name || '').trim().toUpperCase();
  if (
    name.startsWith('SIM') ||
    name.startsWith('PLAYBACK') ||
    name.startsWith('FFFUNDED') ||
    name.startsWith('FFF') ||
    name.startsWith('PAAPEX') ||
    name.startsWith('APEX') ||
    name.startsWith('LFE')
  ) {
    return true;
  }

  // Contas axion puras sem flag local
  if (platform === 'axion' && !acc.send_localhost) return false;
  return false;
}

/**
 * Determina se uma conta é uma CONTA MASTER NINJATRADER.
 * Uma conta é Ninja Master se for executada no NinjaTrader E (for marcada como is_master ou estiver configurada como master em regra de copy trading).
 */
export function isNinjaMasterAccount(acc: any): boolean {
  if (!acc) return false;
  if (!isNinjaExecutionAccount(acc)) return false;
  if (acc.is_master === true) return true;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('vortex_copy_trading_configs') : null;
    if (!raw) return false;
    const configs = JSON.parse(raw);
    if (!Array.isArray(configs)) return false;
    const accId = acc.id;
    const accName = (acc.account_name || acc.name || '').trim().toLowerCase();
    return configs.some((c: any) => 
      c.is_active !== false && (
        c.master_account_id === accId || 
        (c.master_account_id && c.master_account_id.trim().toLowerCase() === accName)
      )
    );
  } catch {
    return false;
  }
}

// Helper unificado para espelhar eventos no ConectorLocal (HTTP :8001) e Túnel WebSocket Nuvem
export async function mirrorToLocalServer(path: string, payload: any): Promise<{ success: boolean; data?: any; error?: any; transport?: string }> {
  try {
    const normPath = path.startsWith('/') ? path : `/${path}`;
    const rpcAction = normPath.replace(/^\/+/, '');
    const rawBody = JSON.stringify(payload);
    console.log(`[MIRROR LOCAL/TUNNEL] Despachando ${normPath}:`, payload);

    // 1. Disparo secundário legado na porta 80 (MT4) caso exista
    try {
      fetch(`http://localhost:80${normPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: rawBody
      }).catch(() => {});
    } catch {}

    // 2. Despacho primário unificado (Local HTTP :8001 OU Túnel WebSocket Nuvem)
    const res = await executeNinjaRpc<any>(rpcAction, payload, 4000);
    if (res.data) {
      console.log(`[MIRROR LOCAL/TUNNEL] Sucesso via ${res.transport} para ${normPath}:`, res.data);
      const isSuccess = res.data.success !== false;
      return {
        success: isSuccess,
        data: res.data,
        transport: res.transport,
        error: !isSuccess ? (res.data.error || 'Erro no NinjaTrader') : undefined
      };
    }
    if (res.error) {
      console.warn(`[MIRROR LOCAL/TUNNEL] Falha via ${res.transport} para ${normPath}:`, res.error);
      return {
        success: false,
        error: typeof res.error === 'string' ? res.error : (res.error?.message || 'Falha de comunicação com NinjaTrader'),
        transport: res.transport
      };
    }
    return { success: false, error: 'Resposta vazia do NinjaTrader', transport: res.transport };
  } catch (err: any) {
    console.warn(`[MIRROR LOCAL/TUNNEL] Exceção ao despachar ${path}:`, err);
    return { success: false, error: err?.message || String(err) };
  }
}

export interface CopyTradingMessage {
  id: string;
  type: 'REJEITADO' | 'COPIADO' | 'ENCERRADO' | 'ALERTA';
  masterAccount: string;
  slaveAccount: string;
  symbol: string;
  side?: string;
  quantity?: number;
  reason?: string;
  message: string;
  timestamp: string;
}

const COPY_MESSAGES_STORAGE_KEY = 'vortex_copy_messages_log';

export function getLocalCopyMessages(): CopyTradingMessage[] {
  try {
    const raw = localStorage.getItem(COPY_MESSAGES_STORAGE_KEY);
    if (!raw) return [];
    const list: CopyTradingMessage[] = JSON.parse(raw);
    if (!Array.isArray(list)) return [];

    let allAccounts: BrokerAccount[] = [];
    try {
      allAccounts = getLocalBrokerAccounts();
    } catch {}

    const cleaned: CopyTradingMessage[] = [];
    const seenKeys = new Set<string>();

    for (const msg of list) {
      // Resolver símbolo real caso a mensagem antiga estivesse com símbolo genérico/simplificado
      let realSymbol = msg.symbol || '';
      const slaveAcc = allAccounts.find(a => 
        a.account_name?.toLowerCase() === msg.slaveAccount?.toLowerCase() || 
        a.id === msg.slaveAccount
      );
      const masterAcc = allAccounts.find(a => 
        a.account_name?.toLowerCase() === msg.masterAccount?.toLowerCase() || 
        a.id === msg.masterAccount
      );
      const effectiveAcc = slaveAcc || masterAcc;
      if (effectiveAcc && realSymbol) {
        realSymbol = resolveAccountExecutionSymbol(effectiveAcc, realSymbol);
      }

      // Normalizar chave por timestamp (janela de minuto) para limpar histórico legado duplicado
      const tsMinute = msg.timestamp ? new Date(msg.timestamp).toISOString().substring(0, 16) : '';
      const dedupKey = `${msg.type}_${(msg.masterAccount || '').toLowerCase()}_${(msg.slaveAccount || '').toLowerCase()}_${realSymbol.toLowerCase()}_${tsMinute}_${msg.reason || msg.message}`;

      if (!seenKeys.has(dedupKey)) {
        seenKeys.add(dedupKey);
        cleaned.push({
          ...msg,
          symbol: realSymbol || msg.symbol
        });
      }
    }

    return cleaned;
  } catch {
    return [];
  }
}

export function saveLocalCopyMessages(list: CopyTradingMessage[]): void {
  try {
    localStorage.setItem(COPY_MESSAGES_STORAGE_KEY, JSON.stringify(list.slice(0, 100)));
  } catch {}
}

export function clearLocalCopyMessages(): void {
  try {
    localStorage.removeItem(COPY_MESSAGES_STORAGE_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vortex_copy_messages_cleared'));
    }
  } catch {}
}

const lastLoggedCopyMessages = new Map<string, number>();

export function logCopyTradingMessage(entry: Omit<CopyTradingMessage, 'id' | 'timestamp'>) {
  // 🛡️ Garante que o símbolo da mensagem seja sempre o ativo real de execução configurado para a conta
  let realSymbol = entry.symbol || '';
  try {
    const allAccounts = getLocalBrokerAccounts();
    const slaveAcc = allAccounts.find(a => 
      a.account_name?.toLowerCase() === entry.slaveAccount?.toLowerCase() || 
      a.id === entry.slaveAccount
    );
    const masterAcc = allAccounts.find(a => 
      a.account_name?.toLowerCase() === entry.masterAccount?.toLowerCase() || 
      a.id === entry.masterAccount
    );
    const effectiveAcc = slaveAcc || masterAcc;
    if (effectiveAcc && realSymbol) {
      realSymbol = resolveAccountExecutionSymbol(effectiveAcc, realSymbol);
    }
  } catch {}

  // 🛡️ Deduplicação inteligente: evita spam de mensagens de rejeição/cópia idênticas nos últimos 8 segundos
  const dedupKey = `${entry.type}_${(entry.masterAccount || '').toLowerCase()}_${(entry.slaveAccount || '').toLowerCase()}_${realSymbol.toLowerCase()}_${entry.reason || entry.message}`;
  const now = Date.now();
  const lastTime = lastLoggedCopyMessages.get(dedupKey) || 0;
  if (now - lastTime < 8000) {
    return; // Suprime duplicata disparada pela mesma rajada/evento ou retorno de webhook
  }
  lastLoggedCopyMessages.set(dedupKey, now);

  if (lastLoggedCopyMessages.size > 200) {
    for (const [k, t] of lastLoggedCopyMessages.entries()) {
      if (now - t > 60000) lastLoggedCopyMessages.delete(k);
    }
  }

  const item: CopyTradingMessage = {
    ...entry,
    symbol: realSymbol || entry.symbol,
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString()
  };
  const current = getLocalCopyMessages();
  const updated = [item, ...current].slice(0, 100);
  saveLocalCopyMessages(updated);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vortex_copy_message_logged', { detail: item }));
  }
}

// Helper para Copy Trading: replica a ordem da MASTER para todas as contas SLAVE vinculadas
export async function triggerCopyTradingForMaster(masterReport: any, originalPayload: any): Promise<any[]> {
  const createdSlaves: any[] = [];
  try {
    const masterAccountId = originalPayload.account_id || masterReport.account_id;
    if (!masterAccountId) return createdSlaves;

    const allAccounts = getLocalBrokerAccounts();
    const masterAccount = allAccounts.find(a => a.id === masterAccountId || a.account_name === masterAccountId);
    const resolvedMasterId = masterAccount?.id || masterAccountId;
    const masterAccName = masterAccount?.account_name || originalPayload.account_name || 'Master';

    const localConfigs = getLocalCopyTradingConfigs();
    let slaves = localConfigs.filter(c => 
      (c.master_account_id === resolvedMasterId || c.master_account_id === masterAccountId || (masterAccount && c.master_account_id === masterAccount.account_name)) &&
      c.is_active !== false
    );

    // Se o cache local não tinha nada, consulta o Supabase
    if (slaves.length === 0) {
      try {
        const { data, error } = await supabase
          .from('painelvm_copy_trading_config')
          .select('*')
          .or(`master_account_id.eq.${resolvedMasterId},master_account_id.eq.${masterAccountId}`)
          .eq('is_active', true);
        if (!error && data && data.length > 0) slaves = data;
      } catch (e) {
        console.warn('[COPY TRADING] Aviso ao consultar configurações de copy:', e);
      }
    }

    if (!slaves || slaves.length === 0) return createdSlaves;

    const masterQty = Number(originalPayload.contrato || masterReport.contrato || (originalPayload as any).quantity || 1);

    for (const slaveConfig of slaves) {
      try {
        const slaveAccount = allAccounts.find(a => a.id === slaveConfig.slave_account_id || a.account_name === slaveConfig.slave_account_id);
        if (!slaveAccount) continue;
        
        // 🔒 Proteção Absoluta contra Auto-Copy (Master copiando para ela mesma)
        if (slaveAccount.id === masterAccount?.id || 
            slaveAccount.account_name?.toLowerCase() === masterAccName.toLowerCase() ||
            slaveConfig.slave_account_id === slaveConfig.master_account_id) {
          continue;
        }

        const rawMultiplier = (slaveConfig as any).lot_multiplier !== undefined && (slaveConfig as any).lot_multiplier !== null
          ? (slaveConfig as any).lot_multiplier
          : (slaveConfig as any).lotMultiplier;
        const ratio = Number(rawMultiplier);
        const safeRatio = (!isNaN(ratio) && ratio > 0) ? ratio : 1.0;
        let slaveQty = Math.round(masterQty * safeRatio);
        if (slaveQty < 1) slaveQty = 1;
        console.log(`⚡ [COPY TRADING] Master '${masterAccName}' (${masterQty}x) ➔ Slave '${slaveAccount.account_name}' (${slaveQty}x | Mult: ${safeRatio}x)`);

        const isAtm = Boolean(
          (originalPayload as any).is_atm ||
          (originalPayload.strategy_name && originalPayload.strategy_name.includes('Alvo')) ||
          (originalPayload.description && originalPayload.description.includes('ATM')) ||
          (originalPayload as any).allow_multi
        );

        // 🎯 Símbolo real de execução configurado para a conta Slave (ex: MNQ DEC26)
        const childSymbol = resolveAccountExecutionSymbol(slaveAccount, originalPayload.symbol || masterReport?.symbol || 'NQ');

        // 🔒 Validação de Gestão de Risco, Metas Diárias e Bloqueio de Posição no Mesmo Ativo na Conta Slave
        const currentLocals = getLocalStrategyReports();
        const validation = validateAccountTradingRules(slaveAccount, {
          panelId: originalPayload.panel_id,
          panelInstanceId: originalPayload.instance_id,
          symbol: childSymbol,
          side: originalPayload.side || masterReport?.side,
          isManualTrade: false,
          isAtm,
          reports: currentLocals,
          panels: []
        });

        if (!validation.allowed) {
          console.warn(`⚠️ [COPY TRADING] Ordem NÃO copiada para '${slaveAccount.account_name}': ${validation.reason}`);
          logCopyTradingMessage({
            type: 'REJEITADO',
            masterAccount: masterAccName,
            slaveAccount: slaveAccount.account_name,
            symbol: childSymbol,
            side: originalPayload.side || 'COMPRA',
            quantity: slaveQty,
            reason: validation.reason,
            message: `Ordem ${originalPayload.side || 'COMPRA'} (${slaveQty}x ${childSymbol}) REJEITADA para '${slaveAccount.account_name}': ${validation.reason}`
          });
          continue;
        }

        // 🎯 CÁLCULO BASEADO EM DISTÂNCIA DE PONTOS (Evita divergência de slippage/preço entre Master e Slave)
        const entryP = Number(originalPayload.entry_price || masterReport.entry_price || 0);
        let stopPoints = Number(originalPayload.stop_loss_points || masterReport.stop_loss_points || 0);
        let takePoints = Number(originalPayload.take_profit_points || masterReport.take_profit_points || 0);

        let finalSl = Number(originalPayload.stop_loss || masterReport.stop_loss || 0);
        let finalTp = Number(originalPayload.take_profit || masterReport.take_profit || 0);

        if (stopPoints <= 0 && entryP > 0 && finalSl > 0) {
          stopPoints = Math.abs(entryP - finalSl);
        }
        if (takePoints <= 0 && entryP > 0 && finalTp > 0) {
          takePoints = Math.abs(finalTp - entryP);
        }

        // Se a ordem original não possuir SL/TP, mantém 0 (sem inventar 20/40 pts falsos)
        if (finalSl <= 0 && stopPoints > 0 && entryP > 0) {
          finalSl = originalPayload.side === 'COMPRA' ? entryP - stopPoints : entryP + stopPoints;
        }
        if (finalTp <= 0 && takePoints > 0 && entryP > 0) {
          finalTp = originalPayload.side === 'COMPRA' ? entryP + takePoints : entryP - takePoints;
        }

        const childId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `copy_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const childPayload: any = {
          ...originalPayload,
          id: childId,
          account_id: slaveAccount.id,
          account_name: slaveAccount.account_name,
          contrato: slaveQty,
          quantity: slaveQty,
          stop_loss: finalSl,
          take_profit: finalTp,
          stop_loss_points: stopPoints,
          take_profit_points: takePoints,
          master_operation_id: masterReport.id || originalPayload.id || null,
          description: `[COPY de ${masterAccName}] ${originalPayload.description || ''}`,
          is_atm: isAtm,
          allow_multi: Boolean(slaveAccount.allow_multi_signals || isAtm),
          already_dispatched: true,
          status: 'Em Andamento',
          created_at: masterReport.created_at || new Date().toISOString()
        };

        // ⚡ 1. Disparo para ConectorLocal / NinjaTrader:
        // SE a Master E a Slave forem contas NinjaTrader, o motor C# do NT8 já executa a cópia internamente (<0.1ms)!
        // Disparar /sinal_local aqui geraria DUPLICAÇÃO DE LOTES na Slave!
        // Portanto, SÓ enviamos /sinal_local se a Master NÃO for conta Ninja e a Slave for Ninja.
        const isMasterNinja = isNinjaExecutionAccount(masterAccount);
        const isSlaveNinja = isNinjaExecutionAccount(slaveAccount);
        const alreadyDispatched = Boolean((originalPayload as any)?.already_dispatched_to_slaves);

        let dispatchSuccess = true;
        let dispatchError = '';

        if (isSlaveNinja && !alreadyDispatched && !isMasterNinja) {
          const copyPayload = {
            ...childPayload,
            symbol: childSymbol,
            account_name: slaveAccount.account_name,
            quantity: slaveQty,
            contrato: slaveQty,
            is_atm: isAtm,
            allow_multi: Boolean(slaveAccount.allow_multi_signals || isAtm)
          };
          const dispatchRes = await mirrorToLocalServer('/sinal_local', copyPayload);
          if (dispatchRes && dispatchRes.success === false) {
            dispatchSuccess = false;
            dispatchError = dispatchRes.error || dispatchRes.data?.error || 'Falha ao despachar ordem para o NinjaTrader';
          }
        }

        if (!dispatchSuccess) {
          console.warn(`⚠️ [COPY TRADING] Ordem rejeitada pelo NinjaTrader em '${slaveAccount.account_name}': ${dispatchError}`);
          logCopyTradingMessage({
            type: 'REJEITADO',
            masterAccount: masterAccName,
            slaveAccount: slaveAccount.account_name,
            symbol: childSymbol,
            side: originalPayload.side || 'COMPRA',
            quantity: slaveQty,
            reason: dispatchError,
            message: `Ordem ${originalPayload.side || 'COMPRA'} (${slaveQty}x ${childSymbol}) REJEITADA em '${slaveAccount.account_name}': ${dispatchError}`
          });
          continue;
        }

        logCopyTradingMessage({
          type: 'COPIADO',
          masterAccount: masterAccName,
          slaveAccount: slaveAccount.account_name,
          symbol: childSymbol,
          side: originalPayload.side || 'COMPRA',
          quantity: slaveQty,
          message: `Ordem ${originalPayload.side || 'COMPRA'} (${slaveQty}x ${childSymbol}) copiada para '${slaveAccount.account_name}' (Mult: ${ratio}x | SL: ${finalSl || '--'} | TP: ${finalTp || '--'})`
        });

        // 🔒 REGRA INVIOLÁVEL: Não criamos relatórios falsos no histórico/ordens ativas para contas NT8 que ainda não foram abertas no NinjaTrader!
        // Contas sincronizadas NT8 só exibem posições e ordens reais reportadas pelo NinjaTrader.
        if (isSlaveNinja) {
          continue;
        }

        createdSlaves.push(childPayload);

        // ⚡ 2. Salva imediatamente no cache local
        const curLocals = getLocalStrategyReports();
        if (!curLocals.some(r => r.id === childPayload.id)) {
          saveLocalStrategyReports([childPayload, ...curLocals]);
        }

        // 🔒 Premissa Arquitetural: Ordens copiadas em contas Slave não são gravadas no Supabase
        // (Apenas a conta MASTER gera sinal e persiste no banco).

      } catch (slaveErr) {
        console.error(`[COPY TRADING] Erro ao copiar ordem para conta slave:`, slaveErr);
      }
    }
  } catch (err) {
    console.error('[COPY TRADING] Erro geral ao processar cópia de ordens:', err);
  }
  return createdSlaves;
}

// 12. Atualizar status do relatório de estratégia no Supabase
// 12. Atualizar status do relatório de estratégia no Supabase
export async function updateStrategyReportStatusSupabase(
  id: string,
  status: 'Em Andamento' | 'Gain' | 'Stop' | 'Cancelado',
  exitPrice?: number | null,
  closedAt?: string | null,
  skipLocalMirror: boolean = false,
  forceNinjaFlat: boolean = false
): Promise<boolean> {
  // Atualizar cache local imediatamente (0ms) - propaga também para cópias vinculadas
  const localReports = getLocalStrategyReports();
  const reportObj = localReports.find(r => r.id === id);
  const finalExitPrice = exitPrice !== undefined ? exitPrice : null;
  const finalClosedAt = closedAt !== undefined ? closedAt : null;
  const updatedLocals = localReports.map(r => 
    (r.id === id || r.master_operation_id === id)
      ? { ...r, status, exit_price: finalExitPrice, closed_at: finalClosedAt }
      : r
  );
  saveLocalStrategyReports(updatedLocals);

  // Buscar conta e símbolo mapeado para espelhamento correto no ConectorLocal / NinjaTrader
  const allAccounts = getLocalBrokerAccounts();
  const targetAcc = allAccounts.find(a => a.id === reportObj?.account_id);
  const targetAccName = targetAcc?.account_name || (reportObj as any)?.account_name;
  const targetSymbol = resolveAccountExecutionSymbol(targetAcc, reportObj?.symbol || undefined);
  const isLocalExecutionAccount = isNinjaExecutionAccount(targetAcc);
  const shouldMirrorFlat = !skipLocalMirror && (status === 'Cancelado' || forceNinjaFlat === true);

  // ⚡ DISPARO INSTANTÂNEO (0ms): Espelha encerramento no NinjaTrader para conta principal se for 'Cancelado' ou encerramento forçado por TrailStop/BE
  if (isLocalExecutionAccount && shouldMirrorFlat) {
    mirrorToLocalServer('/sinal_local/status', { 
      id, 
      account_name: targetAccName,
      symbol: targetSymbol,
      status: 'Cancelado', 
      action: 'flat',
      exit_price: exitPrice, 
      closed_at: closedAt 
    });
  }

  // 🔗 COPY TRADING DISPARO INSTANTÂNEO: Espelha encerramento para todas as contas SLAVE com execução no NinjaTrader
  if (shouldMirrorFlat) {
    const processedSlaveAccounts = new Set<string>();

    // 1. Slaves que possuem relatório filho local
    const slaveReports = localReports.filter(r => r.master_operation_id === id && r.status === 'Em Andamento');
    for (const slaveRep of slaveReports) {
      const slaveAcc = allAccounts.find(a => a.id === slaveRep.account_id);
      if (slaveAcc && isNinjaExecutionAccount(slaveAcc)) {
        const slaveSymbol = resolveAccountExecutionSymbol(slaveAcc, slaveRep.symbol || undefined);
        const dedupeKey = `${slaveAcc.account_name}::${slaveSymbol}`;
        if (!processedSlaveAccounts.has(dedupeKey)) {
          processedSlaveAccounts.add(dedupeKey);
          mirrorToLocalServer('/sinal_local/status', {
            id: slaveRep.id,
            account_name: slaveAcc.account_name,
            symbol: slaveSymbol,
            status: 'Cancelado',
            action: 'flat',
            exit_price: exitPrice,
            closed_at: closedAt
          });
        }
      }
    }

    // 2. Slaves configuradas nas regras de Copy Trading ativas vinculadas a esta conta MASTER (ex: Master Demo -> Slaves NT8)
    const masterAccId = targetAcc?.id || reportObj?.account_id;
    const masterAccName = targetAcc?.account_name || (reportObj as any)?.account_name;
    const copyConfigs = getLocalCopyTradingConfigs();
    const activeRules = copyConfigs.filter(c => 
      c.is_active !== false && 
      (c.master_account_id === masterAccId || c.master_account_id === masterAccName || (masterAccName && c.master_account_id?.toLowerCase() === masterAccName.toLowerCase()))
    );

    for (const rule of activeRules) {
      const slaveAcc = allAccounts.find(a => a.id === rule.slave_account_id || a.account_name === rule.slave_account_id);
      if (slaveAcc && isNinjaExecutionAccount(slaveAcc) && slaveAcc.is_active !== false) {
        const slaveSymbol = resolveAccountExecutionSymbol(slaveAcc, reportObj?.symbol || undefined);
        const dedupeKey = `${slaveAcc.account_name}::${slaveSymbol}`;
        if (!processedSlaveAccounts.has(dedupeKey)) {
          processedSlaveAccounts.add(dedupeKey);
          mirrorToLocalServer('/sinal_local/status', {
            account_name: slaveAcc.account_name,
            symbol: slaveSymbol,
            status: 'Cancelado',
            action: 'flat',
            exit_price: exitPrice,
            closed_at: closedAt
          });
        }
      }
    }
  }

  try {
    const { error } = await withDbTimeout(
      supabase
        .from('painelvm_strategy_reports')
        .update({ status, exit_price: exitPrice, closed_at: closedAt })
        .eq('id', id),
      5000
    );

    if (error) {
      console.warn('[DB] Aviso ao sincronizar fechamento no Supabase:', error.message);
    }

    // Copy Trading Sync: Encerra ordens filhas vinculadas à conta MASTER no Supabase
    const { data: remoteSlaves } = await supabase
      .from('painelvm_strategy_reports')
      .update({ status, exit_price: exitPrice, closed_at: closedAt })
      .eq('master_operation_id', id)
      .eq('status', 'Em Andamento')
      .select();

    // Se houver slaves do Supabase com conta NinjaTrader que ainda não foram notificadas, dispara encerramento
    if (shouldMirrorFlat && remoteSlaves && remoteSlaves.length > 0) {
      for (const slaveRep of remoteSlaves) {
        const slaveAcc = allAccounts.find(a => a.id === slaveRep.account_id);
        if (slaveAcc && isNinjaExecutionAccount(slaveAcc)) {
          const slaveSymbol = resolveAccountExecutionSymbol(slaveAcc, slaveRep.symbol || undefined);
          mirrorToLocalServer('/sinal_local/status', {
            id: slaveRep.id,
            account_name: slaveAcc.account_name,
            symbol: slaveSymbol,
            status: 'Cancelado',
            action: 'flat',
            exit_price: exitPrice,
            closed_at: closedAt
          });
        }
      }
    }

    return true;
  } catch (err) {
    console.error('[DB] Erro ao atualizar relatório no Supabase:', err);
    return true; // Mantém a interface consistente com o estado local
  }
}

// 12b. Atualizar níveis de Stop Loss e Take Profit do relatório no Supabase
export async function updateStrategyReportLevelsSupabase(
  id: string,
  stopLoss: number | null,
  takeProfit: number | null,
  currentPrice?: number | null
): Promise<boolean> {
  const updatePayload = {
    stop_loss: stopLoss !== null && !isNaN(stopLoss) ? Number(stopLoss) : null,
    take_profit: takeProfit !== null && !isNaN(takeProfit) ? Number(takeProfit) : null
  };

  // Atualizar cache local imediatamente (0ms) - propaga também para cópias SLAVE em andamento
  const localReports = getLocalStrategyReports();
  const reportObj = localReports.find(r => r.id === id);
  const nowTs = Date.now();
  const updatedLocals = localReports.map(r => 
    (r.id === id || (r.master_operation_id === id && r.status === 'Em Andamento'))
      ? { ...r, stop_loss: updatePayload.stop_loss, take_profit: updatePayload.take_profit, _levels_modified_at: nowTs }
      : r
  );
  saveLocalStrategyReports(updatedLocals);

  // Buscar todas as contas disponíveis
  const allAccounts = getLocalBrokerAccounts();
  const targetAcc = allAccounts.find(a => a.id === reportObj?.account_id);

  // Helper para calcular e espelhar níveis no ConectorLocal / NinjaTrader
  const dispatchLevelsToNinja = (rep: any, acc: any) => {
    if (!acc || !isNinjaExecutionAccount(acc)) return;
    const repSymbol = resolveAccountExecutionSymbol(acc, rep.symbol || undefined);
    const entryP = Number(rep?.entry_price || 0);
    const slP = Number(updatePayload.stop_loss || 0);
    const tpP = Number(updatePayload.take_profit || 0);
    const isBe = (entryP > 0 && slP > 0 && Math.abs(entryP - slP) <= 0.75);
    const stopPoints = (entryP > 0 && slP > 0) ? Math.abs(entryP - slP) : 0;
    const takePoints = (entryP > 0 && tpP > 0) ? Math.abs(tpP - entryP) : 0;
    const offsetPoints = isBe ? (slP - entryP) : 0;
    const qty = rep?.contrato || (rep as any)?.quantity || 1;

    mirrorToLocalServer('/sinal_local/levels', { 
      id: rep.id, 
      account_name: acc.account_name,
      symbol: repSymbol,
      side: rep?.side,
      quantity: qty,
      contrato: qty,
      entry_price: entryP,
      stop_loss: slP, 
      take_profit: tpP,
      stop_loss_points: stopPoints,
      take_profit_points: takePoints,
      is_breakeven: isBe,
      offset_points: offsetPoints,
      current_price: (currentPrice && !isNaN(currentPrice) && currentPrice > 0) ? currentPrice : undefined
    });
  };

  // ⚡ DISPARO INSTANTÂNEO (0ms): Espelha nova posição de SL/TP para a conta Master (se for Ninja/Local)
  if (reportObj && targetAcc && isNinjaExecutionAccount(targetAcc)) {
    dispatchLevelsToNinja(reportObj, targetAcc);
  }

  // 🔗 COPY TRADING DISPARO INSTANTÂNEO: Espelha nova posição de SL/TP para todas as contas SLAVE vinculadas
  const processedLevelSlaves = new Set<string>();

  // 1. Slaves que possuem relatório filho local
  const slaveReports = localReports.filter(r => r.master_operation_id === id && r.status === 'Em Andamento');
  for (const slaveRep of slaveReports) {
    const slaveAcc = allAccounts.find(a => a.id === slaveRep.account_id);
    if (slaveAcc && isNinjaExecutionAccount(slaveAcc)) {
      processedLevelSlaves.add(slaveAcc.account_name);
      dispatchLevelsToNinja(slaveRep, slaveAcc);
    }
  }

  // 2. Slaves configuradas em regras de copy ativas vinculadas a esta Master (ex: Master Demo -> Slaves NT8)
  const masterAccId = targetAcc?.id || reportObj?.account_id;
  const masterAccName = targetAcc?.account_name || (reportObj as any)?.account_name;
  const copyConfigs = getLocalCopyTradingConfigs();
  const activeRules = copyConfigs.filter(c => 
    c.is_active !== false && 
    (c.master_account_id === masterAccId || c.master_account_id === masterAccName || (masterAccName && c.master_account_id?.toLowerCase() === masterAccName.toLowerCase()))
  );

  for (const rule of activeRules) {
    const slaveAcc = allAccounts.find(a => a.id === rule.slave_account_id || a.account_name === rule.slave_account_id);
    if (slaveAcc && isNinjaExecutionAccount(slaveAcc) && slaveAcc.is_active !== false && !processedLevelSlaves.has(slaveAcc.account_name)) {
      processedLevelSlaves.add(slaveAcc.account_name);
      dispatchLevelsToNinja(reportObj, slaveAcc);
    }
  }

  try {
    // 1. Atualiza o relatório principal (MASTER ou operação normal) se for um ID real
    if (id && !id.startsWith('temp_')) {
      const { error } = await withDbTimeout(
        supabase
          .from('painelvm_strategy_reports')
          .update(updatePayload)
          .eq('id', id),
        5000
      );

      if (error) {
        console.warn('[DB] Aviso ao sincronizar SL/TP no Supabase:', error.message);
      }
    }

    // 2. Copy Trading Sync: propaga SL/TP para as cópias SLAVE vinculadas ainda em andamento
    const { data: slaves, error: slaveErr } = await supabase
      .from('painelvm_strategy_reports')
      .update(updatePayload)
      .eq('master_operation_id', id)
      .eq('status', 'Em Andamento')
      .select();

    if (!slaveErr && slaves && slaves.length > 0) {
      console.log(`[DB] Copy Trading: SL/TP propagado para ${slaves.length} conta(s) SLAVE vinculada(s).`);
      // Dispara para qualquer slave remota que não estava no cache local
      for (const slaveRep of slaves) {
        if (!slaveReports.some(sr => sr.id === slaveRep.id)) {
          const slaveAcc = allAccounts.find(a => a.id === slaveRep.account_id);
          if (slaveAcc && isNinjaExecutionAccount(slaveAcc)) {
            dispatchLevelsToNinja(slaveRep, slaveAcc);
          }
        }
      }
    }

    return true;
  } catch (err) {
    console.error('[DB] Erro ao atualizar níveis do relatório:', err);
    return false;
  }
}


// 13. Deletar relatório do Supabase
export async function deleteStrategyReportSupabase(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('painelvm_strategy_reports')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[DB] Erro ao deletar relatório:', err);
    return false;
  }
}

// ================================================================
//  RELATÓRIOS DE SIMULAÇÃO (painelvm_simulation_reports)
// ================================================================

export interface AIGeneralAnalysisRecord {
  id: string;
  user_id: string;
  panel_id?: string;
  instance_id: string;
  direction: string;
  entry_point?: string;
  stop_loss?: string;
  take_profit?: string;
  market_analysis?: string;
  full_json?: any;
  created_at: string;
}

// Memory cache fallback for General Analyses if table doesn't exist yet in Supabase
let mockGeneralAnalyses: AIGeneralAnalysisRecord[] = [];

// 14. Inserir análise geral no Supabase
export async function insertGeneralAnalysisSupabase(
  analysis: Omit<AIGeneralAnalysisRecord, 'id' | 'created_at' | 'user_id'>
): Promise<AIGeneralAnalysisRecord | null> {
  try {
    const user = await getAuthUser();
    if (!user) throw new Error('Usuário não autenticado.');

    const payload = {
      ...analysis,
      user_id: user.id
    };

    const { data, error } = await withDbTimeout(
      supabase
        .from('painelvm_general_analyses')
        .insert([payload])
        .select()
        .single(),
      3500
    );

    if (error) {
      if (error.code === '42P01' || (error.message && error.message.includes('relation') && error.message.includes('does not exist'))) {
        console.warn('[DB] Tabela painelvm_general_analyses não existe no Supabase. Simulando gravação.');
        const mockRecord: AIGeneralAnalysisRecord = {
          id: 'mock-gp-id-' + Math.random(),
          user_id: user.id,
          ...analysis,
          created_at: new Date().toISOString()
        };
        mockGeneralAnalyses.unshift(mockRecord); // Prepend to show newest first
        return mockRecord;
      }
      throw error;
    }
    return data;
  } catch (err) {
    console.error('[DB] Erro ao inserir análise geral:', err);
    return null;
  }
}

// 15. Buscar análises gerais do Supabase
export async function fetchGeneralAnalysesSupabase(panelId?: string): Promise<AIGeneralAnalysisRecord[]> {
  try {
    const user = await getAuthUser();
    if (!user) return [];

    let query = supabase
      .from('painelvm_general_analyses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (panelId) {
      query = query.eq('panel_id', panelId);
    }

    const { data, error } = await withDbTimeout(query, 3500);
    if (error) {
      if (error.code === '42P01' || (error.message && error.message.includes('relation') && error.message.includes('does not exist'))) {
        console.warn('[DB] Tabela painelvm_general_analyses não existe no Supabase. Retornando em-memória.');
        let list = [...mockGeneralAnalyses];
        if (panelId) {
          list = list.filter(a => a.panel_id === panelId);
        }
        return list;
      }
      throw error;
    }
    return data || [];
  } catch (err) {
    console.error('[DB] Erro ao buscar análises gerais:', err);
    return [];
  }
}

export interface Candle {
  idx?: number;
  instance_id?: string;
  symbol?: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export const getLocalCandles = (instanceId: string): Candle[] => {
  try {
    const raw = localStorage.getItem(`vortex_candles_cache_${instanceId}`);
    if (!raw) return [];
    const parsed: Candle[] = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    // Validar se o cache local é recente (últimos 15 minutos).
    // Se for de pregão anterior ou horas atrás, descarta para evitar vela fantasma gigante.
    const last = parsed[parsed.length - 1];
    const lastMs = last?.timestamp ? new Date(last.timestamp).getTime() : 0;
    if (!lastMs || isNaN(lastMs) || (Date.now() - lastMs > 15 * 60 * 1000) || (lastMs - Date.now() > 5 * 60 * 1000)) {
      return [];
    }
    return parsed;
  } catch (e) {
    return [];
  }
};

let lastSaveCandlesTimes: { [key: string]: number } = {};
export const saveLocalCandles = (instanceId: string, candles: Candle[]) => {
  try {
    if (!candles || candles.length === 0) return;
    const now = Date.now();
    const last = lastSaveCandlesTimes[instanceId] || 0;
    if (now - last < 15000) return; // Throttle to max once every 15s
    lastSaveCandlesTimes[instanceId] = now;

    // Se a lista recebida for uma consulta leve (ex: 50 velas da ponta), mescla com o cache existente
    // para nunca encolher o histórico salvo no disco/localStorage
    const rawExisting = localStorage.getItem(`vortex_candles_cache_${instanceId}`);
    let merged = candles;
    if (rawExisting && candles.length < 500) {
      try {
        const parsed: Candle[] = JSON.parse(rawExisting);
        if (Array.isArray(parsed) && parsed.length > candles.length) {
          const map = new Map<number, Candle>();
          parsed.forEach(c => {
            const t = new Date(c.timestamp).getTime();
            if (!isNaN(t) && t > 0) map.set(Math.floor(t / 60000), c);
          });
          candles.forEach(c => {
            const t = new Date(c.timestamp).getTime();
            if (!isNaN(t) && t > 0) map.set(Math.floor(t / 60000), c);
          });
          merged = Array.from(map.values()).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        }
      } catch (_) {}
    }

    localStorage.setItem(`vortex_candles_cache_${instanceId}`, JSON.stringify(merged.slice(-2000)));
  } catch (e) {}
};

/**
 * 🛡️ Anti-Spike / Universal Sanitizer de Candles (OHLC)
 * Filtra e corrige qualquer vela corrompida, ticks zerados, pavios fantasmas ou quedas anômalas
 * que deformam a escala vertical do gráfico.
 */
export function cleanAndSanitizeCandles(rawCandles: Candle[]): Candle[] {
  if (!Array.isArray(rawCandles) || rawCandles.length === 0) return [];

  // 1. Filtro básico de integridade numérica
  const basicValid: Candle[] = [];
  for (let i = 0; i < rawCandles.length; i++) {
    const c = rawCandles[i];
    if (!c || !c.timestamp) continue;
    const o = Number(c.open);
    const h = Number(c.high);
    const l = Number(c.low);
    const cl = Number(c.close);
    if (
      isNaN(o) || isNaN(h) || isNaN(l) || isNaN(cl) ||
      !isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(cl) ||
      o <= 0 || h <= 0 || l <= 0 || cl <= 0
    ) {
      continue;
    }
    basicValid.push({
      timestamp: c.timestamp,
      open: o,
      high: Math.max(o, h, l, cl),
      low: Math.min(o, h, l, cl),
      close: cl,
      volume: c.volume !== undefined ? Number(c.volume) : undefined
    });
  }

  if (basicValid.length === 0) return [];

  // 2. Ordenação e deduplicação por minuto
  const minuteMap = new Map<number, Candle>();
  basicValid.forEach(c => {
    const ms = new Date(c.timestamp).getTime();
    if (isNaN(ms) || ms <= 0) return;
    const mKey = Math.floor(ms / 60000);
    minuteMap.set(mKey, c);
  });

  const sorted = Array.from(minuteMap.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  if (sorted.length === 0) return [];

  // 3. Estimativa da Mediana de Fechamento para Detecção de Outliers Absolutos
  const closesSorted = sorted.map(c => c.close).sort((a, b) => a - b);
  const medianPrice = closesSorted[Math.floor(closesSorted.length / 2)] || sorted[0].close;

  const result: Candle[] = [];
  let prevValidClose = sorted[0].close;

  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    let o = c.open;
    let cl = c.close;
    let h = c.high;
    let l = c.low;

    // Se o candle for uma aberração total em relação à mediana da série (> 35% de desvio)
    if (medianPrice > 0) {
      if (Math.abs(cl - medianPrice) / medianPrice > 0.35 || Math.abs(o - medianPrice) / medianPrice > 0.35) {
        o = prevValidClose;
        cl = prevValidClose;
        h = prevValidClose;
        l = prevValidClose;
      }
    }

    // Se houver um salto abrupto e isolado em relação ao candle anterior (> 8% de variação em 1m)
    if (prevValidClose > 0 && Math.abs(cl - prevValidClose) / prevValidClose > 0.08) {
      const nextC = sorted[i + 1];
      if (nextC && prevValidClose > 0 && Math.abs(nextC.close - prevValidClose) / prevValidClose < 0.04) {
        o = prevValidClose;
        cl = prevValidClose;
        h = prevValidClose;
        l = prevValidClose;
      } else if (!nextC) {
        o = prevValidClose;
        cl = prevValidClose;
        h = prevValidClose;
        l = prevValidClose;
      }
    }

    // Preserva a máxima e mínima reais de mercado (High/Low) sem truncar ou deformar pavios legítimos
    const cleanCandle: Candle = {
      ...c,
      open: o,
      high: Math.max(o, cl, h),
      low: Math.min(o, cl, l),
      close: cl
    };

    prevValidClose = cleanCandle.close;
    result.push(cleanCandle);
  }

  return result;
}

/**
 * Detecta se existe descontinuidade anormal (GAP > 5 min) em uma lista de candles,
 * desconsiderando as pausas regulares de mercado (break diário da CME 18h-19h BRT e fins de semana).
 */
export function detectInternalCandleGap(candles: Candle[]): boolean {
  if (!candles || candles.length < 2) return false;
  for (let i = 1; i < candles.length; i++) {
    const tPrev = new Date(candles[i - 1].timestamp).getTime();
    const tCurr = new Date(candles[i].timestamp).getTime();
    if (isNaN(tPrev) || isNaN(tCurr)) continue;
    const diffMin = (tCurr - tPrev) / (1000 * 60);
    if (diffMin > 5) {
      const dPrev = new Date(tPrev);
      const prevUtcHour = dPrev.getUTCHours();
      const prevDay = dPrev.getUTCDay(); // 0 = Domingo, 5 = Sexta, 6 = Sábado
      
      // Sexta para Domingo: pregão fecha sexta à tarde e reabre domingo à noite
      const isWeekendBreak = (prevDay === 5 && diffMin > 60) || prevDay === 6 || (prevDay === 0 && dPrev.getUTCHours() < 23);
      // Pausa diária da CME: seg a qui entre 20:00 UTC e 22:30 UTC (cobre tanto DST quanto Standard Time, 15m a 90m)
      const isDailyCmeBreak = (prevUtcHour >= 20 && prevUtcHour <= 22 && diffMin <= 90);

      if (!isWeekendBreak && !isDailyCmeBreak) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Mescla duas séries de candles sem deixar buracos ou sobreposições.
 * A série base (Supabase) fornece a integridade de longo prazo e preenche pausas do computador.
 * A série overlay (Streamer Local NT8) fornece os preços mais recentes e fiéis em tempo real.
 */
export function mergeCandleSeries(baseCandles: Candle[], overlayCandles: Candle[]): Candle[] {
  const map = new Map<number, Candle>();

  // 1. Base (Supabase / Histórico amplo contínuo)
  (baseCandles || []).forEach(c => {
    if (!c || !c.timestamp) return;
    const t = new Date(c.timestamp).getTime();
    if (isNaN(t)) return;
    map.set(Math.floor(t / 60000), c);
  });

  // 2. Overlay (Streamer Local NinjaTrader / Tempo real prevalece)
  (overlayCandles || []).forEach(c => {
    if (!c || !c.timestamp) return;
    const t = new Date(c.timestamp).getTime();
    if (isNaN(t)) return;
    map.set(Math.floor(t / 60000), c);
  });

  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return cleanAndSanitizeCandles(merged);
}

/**
 * Resolve os candidatos de instance_id válidos no Supabase para um painel específico.
 * Isso garante que painéis como SP500, GOLD, DOWJONES, OIL, RUSSEL e NASDAQ localizem
 * imediatamente suas tabelas no banco de dados (ex: painel_sp500_web com mais de 30.000 velas).
 */
export function resolveSupabaseCandleInstances(queryId: string, panelName?: string, panelSettings?: any): string[] {
  const cleanQ = (queryId || '').toLowerCase();
  const cleanP = (panelName || '').toLowerCase();
  const cleanScreen = (panelSettings?.instance_id_screen || '').toLowerCase();
  const combined = `${cleanQ} ${cleanP} ${cleanScreen}`.toLowerCase();

  const candidates: string[] = [];
  if (/(dow|mym|\bym\b|us30)/.test(combined)) {
    candidates.push('painel_us30_web', 'painel_us30');
  } else if (/(sp500|mes|s&p|\bes\b)/.test(combined)) {
    candidates.push('painel_sp500_web', 'painel_sp500');
  } else if (/(gold|mgc|\bgc\b|ouro)/.test(combined)) {
    candidates.push('painel_gold_web', 'painel_gold');
  } else if (/(oil|petroleo|petróleo|mcl|\bcl\b)/.test(combined)) {
    candidates.push('painel_cl_web', 'painel_cl');
  } else if (/(russel|m2k|\brty\b)/.test(combined)) {
    candidates.push('painel_m2k_web', 'painel_m2k');
  } else if (/(nasdaq|mnq|\bnq\b|principal)/.test(combined)) {
    candidates.push('painel_principal_web', 'painel_principal');
  }

  if (queryId) candidates.push(queryId);
  if (panelSettings?.instance_id_screen) candidates.push(panelSettings.instance_id_screen);
  return Array.from(new Set(candidates.filter(Boolean)));
}

const resolvedSupabaseTargetCache = new Map<string, { targetId: string; timestamp: number }>();

async function queryCandleChunkWithAbort(
  targetId: string,
  selectColumns: string,
  from: number,
  to: number,
  ascending: boolean,
  timeoutMs: number,
  startDateISO?: string,
  endDateISO?: string
): Promise<{ data: any[] | null; error: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let q = supabaseAdmin
      .from('painelvm_candles_1m')
      .select(selectColumns)
      .eq('instance_id', targetId);

    if (startDateISO) q = q.gte('timestamp', startDateISO);
    if (endDateISO) q = q.lte('timestamp', endDateISO);

    const res = await q
      .order('timestamp', { ascending })
      .range(from, to)
      .abortSignal(controller.signal);

    return { data: res.data, error: res.error };
  } catch (err) {
    return { data: null, error: err };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCandlesSupabase(
  panelId: string,
  panelInstanceId?: string,
  limit: number = 10000,
  targetPanelObj?: any,
  panelSettings?: any,
  onProgress?: (percent: number, loaded: number, total: number) => void
): Promise<Candle[]> {
  const queryId = panelInstanceId || panelId;
  const localCache = getLocalCandles(queryId);

  onProgress?.(15, 0, limit);

  // 1. Tentar coletar dados do streamer local NinjaTrader (:8002) se disponível
  // Timeout curto (1800ms) e retorno em 0ms se :8002 estiver em cooldown offline
  let localCandles: Candle[] | null = null;
  try {
    const contextTarget = targetPanelObj || queryId;
    localCandles = await withDbTimeout(
      (async () => {
        const hasLocal = await hasLocalStreamForPanel(contextTarget, panelSettings);
        return hasLocal ? await fetchStreamerCandles(contextTarget, panelSettings, false, limit) : null;
      })(),
      1800
    ).catch(() => null);
  } catch {
    localCandles = null;
  }

  const hasLocalData = Boolean(localCandles && localCandles.length > 0);
  const localSlice = hasLocalData ? localCandles!.slice(-limit) : [];
  const localHasGap = hasLocalData ? detectInternalCandleGap(localSlice) : false;
  const localCoversLimit = hasLocalData && (localCandles!.length >= limit || localCandles!.length >= 1000);
  // Se o NinjaTrader local tiver dados sem lacunas internas anormais no período solicitado, usamos com prioridade local
  if (hasLocalData && localCoversLimit && !localHasGap) {
    onProgress?.(100, localCandles!.length, limit);
    saveLocalCandles(queryId, localCandles!);
    return localSlice;
  }

  // 2. Se o local não tiver dados suficientes ou contiver um GAP (ex: computador desconectado),
  // buscamos o histórico completo no Supabase e realizamos a fusão híbrida
  try {
    let allRows: any[] = [];

    // Resolver os candidatos reais de tabelas/instâncias no Supabase com cache em memória (5 min TTL)
    const cacheKey = `${queryId}_${targetPanelObj?.name || ''}`;
    let resolvedTargetId = queryId;
    const cachedRes = resolvedSupabaseTargetCache.get(cacheKey);

    if (cachedRes && (Date.now() - cachedRes.timestamp < 300000)) {
      resolvedTargetId = cachedRes.targetId;
    } else {
      const candidates = resolveSupabaseCandleInstances(queryId, targetPanelObj?.name, panelSettings);
      let resolvedOk = false;
      if (candidates.length > 1) {
        const probes = await Promise.all(candidates.map(async (cand) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3000);
          try {
            const res = await supabaseAdmin
              .from('painelvm_candles_1m')
              .select('timestamp')
              .eq('instance_id', cand)
              .limit(1)
              .abortSignal(controller.signal);
            return Boolean(!res.error && res.data && res.data.length > 0);
          } catch {
            return false;
          } finally {
            clearTimeout(timer);
          }
        }));
        const idx = probes.findIndex(Boolean);
        if (idx >= 0) {
          resolvedTargetId = candidates[idx];
          resolvedOk = true;
        } else if (candidates.length > 0) {
          resolvedTargetId = candidates[0];
        }
      } else if (candidates.length === 1) {
        resolvedTargetId = candidates[0];
        resolvedOk = true;
      }
      if (resolvedOk) {
        resolvedSupabaseTargetCache.set(cacheKey, { targetId: resolvedTargetId, timestamp: Date.now() });
      }
    }

    onProgress?.(22, 0, limit);

    const selectColumns = 'timestamp, open, high, low, close, volume';

    // Paginação PARALELA controlada respeitando o teto do PostgREST (db_max_rows = 1000).
    // CONCURRENCY = 3 impede o esgotamento do pool de conexões HTTP do navegador (máx 6 por domínio).
    const CHUNK_SIZE = 1000;
    const CONCURRENCY = 3;
    const totalChunks = Math.ceil(limit / CHUNK_SIZE);
    let reachedEnd = false;
    let completedRows = 0;

    for (let waveStart = 0; waveStart < totalChunks && !reachedEnd; waveStart += CONCURRENCY) {
      const waveIndexes: number[] = [];
      for (let k = waveStart; k < Math.min(waveStart + CONCURRENCY, totalChunks); k++) waveIndexes.push(k);

      const waveResults = await Promise.all(waveIndexes.map(async (chunkIdx) => {
        const from = chunkIdx * CHUNK_SIZE;
        const to = Math.min(from + CHUNK_SIZE - 1, limit - 1);

        let res = await queryCandleChunkWithAbort(resolvedTargetId, selectColumns, from, to, false, 5000);
        if (res.error || !res.data) {
          res = await queryCandleChunkWithAbort(resolvedTargetId, selectColumns, from, to, false, 6000);
        }

        const rows = (res && !res.error && Array.isArray(res.data)) ? res.data : [];
        completedRows += rows.length;
        const pct = Math.min(92, Math.max(22, Math.round(22 + (completedRows / Math.max(1, limit)) * 70)));
        onProgress?.(pct, completedRows, limit);
        return { chunkIdx, rows, expected: to - from + 1 };
      }));

      waveResults.sort((a, b) => a.chunkIdx - b.chunkIdx);
      for (const r of waveResults) {
        if (r.rows.length > 0) allRows.push(...r.rows);
        if (r.rows.length < r.expected) {
          reachedEnd = true;
          break;
        }
      }
    }

    if (!allRows || allRows.length === 0) {
      if (hasLocalData) {
        onProgress?.(100, localCandles!.length, limit);
        saveLocalCandles(queryId, localCandles!);
        return localCandles!.slice(-limit);
      }
      onProgress?.(100, localCache.length, limit);
      return localCache;
    }

    onProgress?.(95, allRows.length, limit);

    // Inverte o array para que fique em ordem cronológica crescente para a plotagem do gráfico
    const chronologicalData = [...allRows].reverse();

    // Deduplicação estrita por minuto (evita linhas duplicadas no mesmo timestamp)
    const minuteMap = new Map<number, any>();
    chronologicalData.forEach(c => {
      if (!c || !c.timestamp) return;
      const tMs = new Date(c.timestamp).getTime();
      if (isNaN(tMs)) return;
      const mKey = Math.floor(tMs / 60000);
      minuteMap.set(mKey, c);
    });

    const uniqueRows = Array.from(minuteMap.values());

    const rawMapped: Candle[] = uniqueRows.map(c => ({
      timestamp: c.timestamp,
      open: Number(c.open || 0),
      high: Number(c.high || 0),
      low: Number(c.low || 0),
      close: Number(c.close || 0),
      volume: c.volume !== undefined ? Number(c.volume) : undefined
    }));

    const supabaseCandles = cleanAndSanitizeCandles(rawMapped);

    // Fusão Híbrida: Supabase (histórico passado amplo sem gaps) + Local NT8 (tempo real e candles mais recentes)
    const finalCandles = hasLocalData
      ? mergeCandleSeries(supabaseCandles, localCandles!)
      : supabaseCandles;

    if (finalCandles.length > 0) {
      saveLocalCandles(queryId, finalCandles);
    }

    onProgress?.(100, finalCandles.length, limit);
    return finalCandles.slice(-limit);
  } catch (err) {
    console.error('[DB] Erro inesperado ao buscar candles. Retornando dados locais:', err);
    if (hasLocalData) {
      onProgress?.(100, localCandles!.length, limit);
      return localCandles!.slice(-limit);
    }
    onProgress?.(100, localCache.length, limit);
    return localCache;
  }
}

export async function fetchAvailableCandleDateBoundsSupabase(
  instanceId: string,
  panelName?: string,
  panelSettings?: any
): Promise<{ minDate: string; maxDate: string } | null> {
  try {
    const resolved = resolveSupabaseCandleInstances(instanceId, panelName, panelSettings);
    const candidates = Array.from(new Set([...resolved, instanceId, 'painel_principal_web', 'painel_principal', 'nasdaq', 'nt8_main', 'NQ'].filter(Boolean)));

    const probeResults = await Promise.all(candidates.map(async (targetId) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      try {
        const [firstRes, lastRes] = await Promise.all([
          supabaseAdmin
            .from('painelvm_candles_1m')
            .select('timestamp')
            .eq('instance_id', targetId)
            .order('timestamp', { ascending: true })
            .limit(1)
            .abortSignal(controller.signal),
          supabaseAdmin
            .from('painelvm_candles_1m')
            .select('timestamp')
            .eq('instance_id', targetId)
            .order('timestamp', { ascending: false })
            .limit(1)
            .abortSignal(controller.signal)
        ]);
        if (firstRes.data && firstRes.data.length > 0 && lastRes.data && lastRes.data.length > 0) {
          return {
            minDate: firstRes.data[0].timestamp.split('T')[0],
            maxDate: lastRes.data[0].timestamp.split('T')[0]
          };
        }
        return null;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }));

    return probeResults.find(Boolean) || null;
  } catch (err) {
    console.error('[DB] Erro ao buscar limites de datas no banco:', err);
    return null;
  }
}

export async function fetchCandlesByDateRangeSupabase(
  instanceId: string,
  startDateISO: string,
  endDateISO: string,
  onProgress?: ((progress: FetchProgressInfo) => void) | ((progressText: string) => void) | ((p: any) => void),
  panelName?: string,
  panelSettings?: any
): Promise<Candle[]> {
  const emitProgress = (percent: number, loadedRows: number, totalRows: number, message: string) => {
    if (typeof onProgress === 'function') {
      onProgress({ percent, loadedRows, totalRows, message });
    }
  };

  try {
    console.log(`[SIMULATOR DB QUERY] Buscando candles para instance_id "${instanceId}" (${panelName || ''}) entre ${startDateISO} e ${endDateISO}`);
    emitProgress(10, 0, 0, 'Localizando série histórica no banco...');

    const resolved = resolveSupabaseCandleInstances(instanceId, panelName, panelSettings);
    const candidates = Array.from(new Set([...resolved, instanceId, 'painel_principal_web', 'painel_principal', 'nasdaq', 'nt8_main', 'NQ'].filter(Boolean)));
    let targetId = '';
    let effectiveStartISO = startDateISO;
    let effectiveEndISO = endDateISO;

    // 1. Sondagem rápida em paralelo (sem count: 'exact' lento!) para identificar a instância que possui dados no período
    const rangeProbes = await Promise.all(candidates.map(async (cand) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      try {
        const { data, error } = await supabaseAdmin
          .from('painelvm_candles_1m')
          .select('timestamp')
          .eq('instance_id', cand)
          .gte('timestamp', effectiveStartISO)
          .lte('timestamp', effectiveEndISO)
          .limit(1)
          .abortSignal(controller.signal);
        return (!error && data && data.length > 0) ? cand : null;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }));

    const matchedInRange = rangeProbes.find(Boolean);
    if (matchedInRange) {
      targetId = matchedInRange;
    } else {
      // Fallback: se o período solicitado estava fora dos limites do banco, localiza a instância válida e ajusta para os últimos dias disponíveis
      const bounds = await fetchAvailableCandleDateBoundsSupabase(instanceId, panelName, panelSettings);
      if (bounds && bounds.maxDate) {
        const dMax = new Date(`${bounds.maxDate}T00:00:00Z`);
        dMax.setUTCDate(dMax.getUTCDate() - 4);
        const fallbackStart = dMax.toISOString().split('T')[0];
        effectiveStartISO = `${fallbackStart < bounds.minDate ? bounds.minDate : fallbackStart}T00:00:00Z`;
        effectiveEndISO = `${bounds.maxDate}T23:59:59Z`;
        targetId = candidates[0] || instanceId;
        console.log(`[SIMULATOR DB QUERY] Ajustando janela para limites disponíveis no banco: ${effectiveStartISO} até ${effectiveEndISO} (${targetId})`);
      }
    }

    if (!targetId) {
      emitProgress(0, 0, 0, 'Nenhum candle encontrado para o período.');
      return [];
    }

    const startMs = new Date(effectiveStartISO).getTime();
    const endMs = new Date(effectiveEndISO).getTime();
    const estimatedTotal = (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs)
      ? Math.max(1000, Math.min(25000, Math.round((endMs - startMs) / 60000)))
      : 4320;

    emitProgress(20, 0, estimatedTotal, `Baixando velas históricas de 1 minuto (${targetId})...`);

    const selectColumns = 'timestamp, open, high, low, close, volume';
    const chunkSize = 1000; // Regra 9.2: Respeito mandatório ao teto do PostgREST (db_max_rows = 1000)
    const CONCURRENCY = 3;
    const maxChunks = 25; // Até 25.000 velas (~17 dias contínuos de 1m)
    let allData: any[] = [];
    let reachedEnd = false;

    for (let waveStart = 0; waveStart < maxChunks && !reachedEnd; waveStart += CONCURRENCY) {
      const waveIndexes: number[] = [];
      for (let k = waveStart; k < Math.min(waveStart + CONCURRENCY, maxChunks); k++) waveIndexes.push(k);

      const waveResults = await Promise.all(waveIndexes.map(async (chunkIdx) => {
        const from = chunkIdx * chunkSize;
        const to = from + chunkSize - 1;

        let res = await queryCandleChunkWithAbort(targetId, selectColumns, from, to, true, 5000, effectiveStartISO, effectiveEndISO);
        if (res.error || !res.data) {
          res = await queryCandleChunkWithAbort(targetId, selectColumns, from, to, true, 6000, effectiveStartISO, effectiveEndISO);
        }

        const rows = (res && !res.error && Array.isArray(res.data)) ? res.data : [];
        return { chunkIdx, rows };
      }));

      waveResults.sort((a, b) => a.chunkIdx - b.chunkIdx);
      for (const r of waveResults) {
        if (r.rows.length > 0) {
          allData.push(...r.rows);
          const dynamicTotal = Math.max(estimatedTotal, allData.length + (r.rows.length === chunkSize ? chunkSize : 0));
          const pct = Math.min(95, Math.max(20, Math.round(20 + (allData.length / dynamicTotal) * 75)));
          emitProgress(pct, allData.length, dynamicTotal, `Carregando candles históricos (${allData.length} velas recebidas)...`);
        }
        if (r.rows.length < chunkSize) {
          reachedEnd = true;
          break;
        }
      }
    }

    if (allData.length === 0) {
      emitProgress(0, 0, 0, 'Nenhum candle encontrado para o período.');
      return [];
    }

    emitProgress(100, allData.length, allData.length, `Carregadas ${allData.length} velas com sucesso.`);

    const rawRange = allData.map(c => ({
      timestamp: c.timestamp,
      open: Number(c.open || 0),
      high: Number(c.high || 0),
      low: Number(c.low || 0),
      close: Number(c.close || 0),
      volume: c.volume !== undefined ? Number(c.volume) : undefined
    }));

    return cleanAndSanitizeCandles(rawRange);
  } catch (err) {
    console.error('[DB] Erro ao buscar candles por intervalo de data:', err);
    return [];
  }
}

// 16. Deletar análise geral do Supabase
export async function deleteGeneralAnalysisSupabase(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('painelvm_general_analyses')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === '42P01' || (error.message && error.message.includes('relation') && error.message.includes('does not exist'))) {
        mockGeneralAnalyses = mockGeneralAnalyses.filter(a => a.id !== id);
        return true;
      }
      throw error;
    }
    return true;
  } catch (err) {
    console.error('[DB] Erro ao deletar análise geral:', err);
    return false;
  }
}

export interface StrategyLogicCondition {
  id: string;
  source: string;
  operator: string;
  target_type: 'value' | 'indicator' | string;
  target_value?: any;
  target_indicator?: string;
  target_params?: Record<string, any>;
  source_params?: Record<string, any>;
  params?: Record<string, any>;
  subSeries?: string;
  source_subSeries?: string;
  target_subSeries?: string;
  param1?: any;
  target_param1?: any;
}

export interface StrategyLogicStage {
  id: string;
  stage_number: number;
  name?: string;
  conditions: StrategyLogicCondition[];
  logic?: 'AND' | 'OR';
  max_wait_candles?: number; // 0 ou undefined = sem limite (na mesma sessão)
}

export function normalizeStrategyStages(rawList: any[], defaultPrefix: string = 'stage'): StrategyLogicStage[] {
  if (!rawList || !Array.isArray(rawList) || rawList.length === 0) {
    return [{
      id: `${defaultPrefix}_1`,
      stage_number: 1,
      name: 'Lógica 1',
      conditions: [],
      logic: 'AND',
      max_wait_candles: 0
    }];
  }

  // Se já for um array de estágios válidos
  const isAlreadyStages = rawList.every(item => item && typeof item === 'object' && Array.isArray(item.conditions));
  if (isAlreadyStages) {
    return rawList.map((st, idx) => ({
      id: st.id || `${defaultPrefix}_${idx + 1}_${Date.now()}`,
      stage_number: typeof st.stage_number === 'number' ? st.stage_number : idx + 1,
      name: st.name || `Lógica ${idx + 1}`,
      conditions: (st.conditions || []).map((c: any, cIdx: number) => ({
        ...c,
        id: (c && c.id && String(c.id).trim().length > 0) ? String(c.id) : `${defaultPrefix}_${idx + 1}_cond_${cIdx}_${Date.now()}`
      })),
      logic: st.logic === 'OR' ? 'OR' : 'AND',
      max_wait_candles: typeof st.max_wait_candles === 'number' ? st.max_wait_candles : 0
    }));
  }

  // Caso legado ou lista plana de condições (sem propriedade 'conditions')
  return [{
    id: `${defaultPrefix}_1`,
    stage_number: 1,
    name: 'Lógica 1',
    conditions: rawList.map((c: any, cIdx: number) => ({
      ...c,
      id: (c && c.id && String(c.id).trim().length > 0) ? String(c.id) : `${defaultPrefix}_1_cond_${cIdx}_${Date.now()}`
    })),
    logic: 'AND',
    max_wait_candles: 0
  }];
}

export interface CustomStrategy {
  id?: string;
  user_id?: string;
  panel_id?: string | null;
  atm_strategy_id?: string;
  name: string;
  description?: string;
  buy_conditions: StrategyLogicStage[] | any[];
  sell_conditions: StrategyLogicStage[] | any[];
  buy_stages?: StrategyLogicStage[];
  sell_stages?: StrategyLogicStage[];
  risk_settings: {
    lots: number;
    sizing_mode?: 'lote' | 'risco';
    max_risk_usd?: number;
    stop_value: string;
    stop_type: 'points' | 'regions';
    take_value: string;
    take_type: 'points' | 'regions';
    max_daily_trades: number;
  use_atm?: boolean;
  atm_strategy?: any;
  atm_strategy_name?: string;
    atm_strategy_id?: string;
    target_panel_id?: string;
  };
  active: boolean;
  is_public?: boolean;
  user_email?: string;
  timeframe?: number; // Timeframe para cálculo da lógica (ex: 1, 5, 15)
  action?: 'position' | 'alert'; // Ação: abrir posição ou apenas alerta
  sessions?: { start: string; end: string; active: boolean }[]; // Janelas de horários (até 2)
  max_entries?: number; // Quantidade limite de entradas do robô
  is_admin_featured?: boolean; // Se foi liberada pelo admin e não conta no limite do usuário
  is_copied?: boolean; // Se foi copiada de um setup público e possui regras protegidas
  execution_mode?: 'closed' | 'realtime'; // Modo de execução: Barra Fechada (closed) ou Barra Corrente (realtime)
  created_at?: string;
  updated_at?: string;
}

let mockStrategies: CustomStrategy[] = [];

const loadMockStrategies = () => {
  try {
    const saved = localStorage.getItem('vortex_mock_strategies');
    if (saved) {
      mockStrategies = JSON.parse(saved);
    }
  } catch (e) {
    console.error('[DB MOCK] Error loading mock strategies:', e);
  }
};

const saveMockStrategies = () => {
  try {
    localStorage.setItem('vortex_mock_strategies', JSON.stringify(mockStrategies));
  } catch (e) {
    console.error('[DB MOCK] Error saving mock strategies:', e);
  }
};

loadMockStrategies();

export function formatCustomStrategyForDb(strategy: CustomStrategy, userId: string, userEmail: string = ''): any {
  const stratId = (strategy.id && isValidUUID(strategy.id)) ? strategy.id : generateSecureUUID();
  
  const payload: any = {
    id: stratId,
    user_id: userId,
    name: strategy.name || 'Novo Algoritmo',
    description: strategy.description || null,
    buy_conditions: strategy.buy_conditions || strategy.buy_stages || [],
    sell_conditions: strategy.sell_conditions || strategy.sell_stages || [],
    risk_settings: strategy.risk_settings || {},
    active: strategy.active !== undefined ? strategy.active : false,
    is_public: strategy.is_public !== undefined ? strategy.is_public : false,
    is_admin_featured: strategy.is_admin_featured !== undefined ? strategy.is_admin_featured : false,
    timeframe: strategy.timeframe !== undefined ? strategy.timeframe : 1,
    action: strategy.action || 'alert',
    sessions: strategy.sessions || [],
    max_entries: strategy.max_entries !== undefined ? strategy.max_entries : 5,
    execution_mode: strategy.execution_mode || 'closed',
    user_email: userEmail || strategy.user_email || '',
    updated_at: new Date().toISOString()
  };

  if (strategy.created_at) {
    payload.created_at = strategy.created_at;
  }
  if (strategy.panel_id && isValidUUID(strategy.panel_id)) {
    payload.panel_id = strategy.panel_id;
  } else {
    payload.panel_id = null;
  }

  return payload;
}

export async function fetchCustomStrategies(panelId?: string): Promise<CustomStrategy[]> {
  try {
    loadMockStrategies();
    const user = await getAuthUser();
    const userId = user?.id;
    const userEmailNorm = user?.email?.toLowerCase().trim();

    let query = supabase.from('painelvm_custom_strategies').select('*');
    if (user) {
      if (user.email) {
        query = query.or(`user_id.eq.${user.id},user_email.ilike.%${user.email}%,is_public.eq.true,is_admin_featured.eq.true`);
      } else {
        query = query.eq('user_id', user.id);
      }
    } else {
      query = query.or('is_public.eq.true,is_admin_featured.eq.true');
    }

    let dbData: any[] = [];
    let dbSuccess = false;
    try {
      const { data, error } = await withDbTimeout(query.order('created_at', { ascending: false }), 4000);
      if (!error && data) {
        dbData = data;
        dbSuccess = true;
      }
    } catch (e) {
      console.warn('[DB] Timeout ou erro ao buscar estratégias no Supabase. Usando cache local:', e);
    }

    if (dbSuccess) {
      // Quando logado e o banco respondeu com sucesso, o banco é a fonte canônica para os robôs do usuário.
      // Preserva apenas presets locais que não têm registro no DB.
      const presets = mockStrategies.filter(s => s.id && s.id.startsWith('preset-'));
      const mergedMap = new Map<string, CustomStrategy>();
      presets.forEach(p => { if (p.id) mergedMap.set(p.id, p); });
      dbData.forEach(s => { if (s.id) mergedMap.set(s.id, s); });

      mockStrategies = Array.from(mergedMap.values());
      saveMockStrategies();
    }

    // Auto-migração transparente para o Supabase (apenas para algoritmos sem sync anterior)
    if (user && user.id && !dbSuccess) {
      const dbIds = new Set(dbData.map(d => d.id));
      const unpersisted = mockStrategies.filter(s => {
        if (!s.id || s.id.startsWith('preset-')) return false;
        if (!dbIds.has(s.id)) return true;
        if (s.user_id === 'local_user' || !s.user_id) return true;
        return false;
      });

      if (unpersisted.length > 0) {
        (async () => {
          for (const strat of unpersisted) {
            try {
              const payload = formatCustomStrategyForDb(strat, user.id, user.email || '');
              await withDbTimeout(
                supabase
                  .from('painelvm_custom_strategies')
                  .upsert(payload, { onConflict: 'id' }),
                3500
              );
            } catch (e) {
              console.warn('[DB AUTO-MIGRATE] Erro ao sincronizar algoritmo do cache para Supabase:', strat.name, e);
            }
          }
        })();
      }
    }

    // Filtrar para retornar apenas as estratégias pertinentes à consulta
    const matchesUser = (s: CustomStrategy) => {
      if (panelId && s.panel_id && s.panel_id !== 'all' && s.panel_id !== panelId) return false;
      if (s.is_public || s.is_admin_featured) return true;
      if (userId && s.user_id === userId) return true;
      if (userEmailNorm && s.user_email && s.user_email.toLowerCase().trim() === userEmailNorm) return true;
      if (s.user_id === 'local_user' || !s.user_id) return true;
      return false;
    };

    return mockStrategies.filter(matchesUser);
  } catch (err) {
    console.error('[DB] Erro ao buscar estratégias:', err);
    return panelId ? mockStrategies.filter(s => !s.panel_id || s.panel_id === 'all' || s.panel_id === panelId) : mockStrategies;
  }
}

export async function saveCustomStrategy(strategy: CustomStrategy): Promise<CustomStrategy | null> {
  try {
    loadMockStrategies();
    const user = await getAuthUser();
    const stratId = (strategy.id && isValidUUID(strategy.id)) ? strategy.id : generateSecureUUID();

    const fullStrategy: CustomStrategy = {
      ...strategy,
      id: stratId,
      user_id: user?.id || strategy.user_id || 'local_user',
      user_email: user?.email || strategy.user_email || '',
      updated_at: new Date().toISOString(),
      created_at: strategy.created_at || new Date().toISOString()
    };

    // Salvar localmente instantaneamente (0ms de bloqueio)
    const idx = mockStrategies.findIndex(s => s.id === stratId);
    if (idx >= 0) {
      mockStrategies[idx] = fullStrategy;
    } else {
      mockStrategies.unshift(fullStrategy);
    }
    saveMockStrategies();

    // Sincronizar com Supabase com upsert atômico e payload sanitizado
    if (user && user.id) {
      try {
        const payload = formatCustomStrategyForDb(fullStrategy, user.id, user.email || '');

        const { data, error } = await withDbTimeout(
          supabase
            .from('painelvm_custom_strategies')
            .upsert(payload, { onConflict: 'id' })
            .select()
            .maybeSingle(),
          4500
        );
        if (error) {
          console.error('[DB] Erro no upsert do Supabase para painelvm_custom_strategies:', error);
        } else if (data) {
          const merged = { ...fullStrategy, ...data };
          const mIdx = mockStrategies.findIndex(s => s.id === stratId);
          if (mIdx >= 0) mockStrategies[mIdx] = merged;
          saveMockStrategies();
          return merged;
        }
      } catch (syncErr) {
        console.warn('[DB] Estratégia sincronizada localmente (aviso Supabase):', syncErr);
      }
    }

    return fullStrategy;
  } catch (err) {
    console.error('[DB] Erro ao salvar estratégia:', err);
    return strategy;
  }
}

export async function deleteCustomStrategy(id: string): Promise<boolean> {
  try {
    // 1. Limpar vínculos locais
    mockStrategies = mockStrategies.filter(s => s.id !== id);
    saveMockStrategies();

    try {
      const raw = localStorage.getItem('vortex_account_strategies_local');
      if (raw) {
        const list = JSON.parse(raw);
        const filtered = list.filter((r: any) => r.manual_strategy_id !== id);
        localStorage.setItem('vortex_account_strategies_local', JSON.stringify(filtered));
      }
    } catch (e) {}

    // 2. Sincronizar com Supabase
    try {
      await withDbTimeout(
        supabase
          .from('painelvm_account_strategies')
          .delete()
          .eq('manual_strategy_id', id),
        4000
      );
      await withDbTimeout(
        supabase
          .from('painelvm_custom_strategies')
          .delete()
          .eq('id', id),
        4000
      );
    } catch (err) {
      console.warn('[DB] Aviso ao deletar no Supabase:', err);
    }

    return true;
  } catch (err) {
    console.error('[DB] Erro ao deletar estratégia:', err);
    mockStrategies = mockStrategies.filter(s => s.id !== id);
    saveMockStrategies();
    return true;
  }
}

export async function toggleCustomStrategyActive(id: string, activeStatus: boolean): Promise<boolean> {
  try {
    const idx = mockStrategies.findIndex(s => s.id === id);
    if (idx >= 0) {
      mockStrategies[idx].active = activeStatus;
      mockStrategies[idx].updated_at = new Date().toISOString();
      saveMockStrategies();
    }

    // Sincronizar com Supabase em background com timeout
    (async () => {
      try {
        await withDbTimeout(
          supabase
            .from('painelvm_custom_strategies')
            .update({ active: activeStatus, updated_at: new Date().toISOString() })
            .eq('id', id),
          3500
        );
      } catch (e) {
        console.warn('[DB] Toggle sincronizado localmente (aviso Supabase):', e);
      }
    })();

    return true;
  } catch (err) {
    console.error('[DB] Erro ao alternar status da estratégia:', err);
    const idx = mockStrategies.findIndex(s => s.id === id);
    if (idx >= 0) {
      mockStrategies[idx].active = activeStatus;
      mockStrategies[idx].updated_at = new Date().toISOString();
      saveMockStrategies();
      return true;
    }
    return false;
  }
}

export async function fetchPublicCustomStrategies(): Promise<CustomStrategy[]> {
  try {
    let dbData: any[] = [];
    try {
      const { data, error } = await withDbTimeout(
        supabase
          .from('painelvm_custom_strategies')
          .select('*')
          .eq('is_public', true)
          .order('created_at', { ascending: false }),
        3500
      );
      if (!error && data) {
        dbData = data;
      }
    } catch (e) {}

    const localPublic = mockStrategies.filter(s => s.is_public);
    const mergedMap = new Map<string, CustomStrategy>();
    localPublic.forEach(s => { if (s.id) mergedMap.set(s.id, s); });
    dbData.forEach(s => { if (s.id) mergedMap.set(s.id, { ...(mergedMap.get(s.id) || {}), ...s }); });

    return Array.from(mergedMap.values());
  } catch (err) {
    console.error('[DB] Erro ao buscar setups públicos:', err);
    return mockStrategies.filter(s => s.is_public);
  }
}

// ================================================================
// ESTRATÉGIAS ATM (painelvm_atm_strategies) COM PERSISTÊNCIA EM NUVEM
// ================================================================
export async function fetchAtmStrategiesSupabase(): Promise<ATMStrategy[]> {
  try {
    const user = await getAuthUser();
    let localList: ATMStrategy[] = PRESET_ATM_STRATEGIES;
    try {
      const savedLocal = localStorage.getItem('vortex_atm_strategies');
      if (savedLocal) localList = JSON.parse(savedLocal);
    } catch {}

    if (!user || !user.id) return localList;

    let dbData: any[] = [];
    try {
      const { data, error } = await withDbTimeout(
        supabase
          .from('painelvm_atm_strategies')
          .select('*')
          .order('created_at', { ascending: false }),
        3500
      );
      if (!error && data && data.length > 0) {
        dbData = data;
      }
    } catch (e) {
      console.warn('[DB] Aviso ao buscar estratégias ATM no Supabase:', e);
    }

    if (dbData.length > 0) {
      const dbList: ATMStrategy[] = dbData.map(d => ({
        id: d.id,
        name: d.name,
        brackets: typeof d.brackets === 'string' ? JSON.parse(d.brackets) : d.brackets,
        isDefault: d.is_default,
        created_at: d.created_at
      }));

      // Mesclar presets e estratégias do banco
      const mergedMap = new Map<string, ATMStrategy>();
      PRESET_ATM_STRATEGIES.forEach(p => mergedMap.set(p.id, p));
      localList.forEach(l => mergedMap.set(l.id, l));
      dbList.forEach(d => mergedMap.set(d.id, d));

      // Auto-migração para o Supabase de templates ATM criados localmente
      if (user && user.id) {
        const dbIds = new Set(dbList.map(d => d.id));
        const unpersisted = localList.filter(a => {
          if (!a.id || a.id.startsWith('atm-scalp') || a.id.startsWith('atm-dual') || a.id.startsWith('atm-runner')) return false;
          return !dbIds.has(a.id);
        });
        if (unpersisted.length > 0) {
          (async () => {
            for (const atm of unpersisted) {
              try {
                await withDbTimeout(
                  supabase
                    .from('painelvm_atm_strategies')
                    .upsert({
                      id: atm.id,
                      user_id: user.id,
                      name: atm.name,
                      brackets: atm.brackets,
                      is_default: atm.isDefault || false
                    }, { onConflict: 'id' }),
                  3500
                );
              } catch (e) {}
            }
          })();
        }
      }

      const finalList = Array.from(mergedMap.values());
      try {
        localStorage.setItem('vortex_atm_strategies', JSON.stringify(finalList));
      } catch {}
      return finalList;
    }

    return localList;
  } catch (err) {
    console.error('[DB] Erro ao buscar estratégias ATM:', err);
    return PRESET_ATM_STRATEGIES;
  }
}

export async function saveAtmStrategySupabase(strategy: ATMStrategy): Promise<boolean> {
  try {
    const user = await getAuthUser();
    
    // Atualizar cache local
    let currentList: ATMStrategy[] = PRESET_ATM_STRATEGIES;
    try {
      const saved = localStorage.getItem('vortex_atm_strategies');
      if (saved) currentList = JSON.parse(saved);
    } catch {}

    const idx = currentList.findIndex(a => a.id === strategy.id);
    if (idx >= 0) {
      currentList[idx] = strategy;
    } else {
      currentList.unshift(strategy);
    }
    try {
      localStorage.setItem('vortex_atm_strategies', JSON.stringify(currentList));
    } catch {}

    // Sincronizar com Supabase
    if (user && user.id) {
      await withDbTimeout(
        supabase
          .from('painelvm_atm_strategies')
          .upsert({
            id: strategy.id,
            user_id: user.id,
            name: strategy.name,
            brackets: strategy.brackets,
            is_default: strategy.isDefault || false
          }, { onConflict: 'id' }),
        3500
      );
    }
    return true;
  } catch (err) {
    console.warn('[DB] Erro ao sincronizar estratégia ATM no Supabase:', err);
    return true;
  }
}

export async function deleteAtmStrategySupabase(id: string): Promise<boolean> {
  try {
    const user = await getAuthUser();
    
    let currentList: ATMStrategy[] = PRESET_ATM_STRATEGIES;
    try {
      const saved = localStorage.getItem('vortex_atm_strategies');
      if (saved) currentList = JSON.parse(saved);
    } catch {}

    const updated = currentList.filter(a => a.id !== id);
    try {
      localStorage.setItem('vortex_atm_strategies', JSON.stringify(updated));
    } catch {}

    if (user && user.id && !id.startsWith('atm-scalp') && !id.startsWith('atm-dual') && !id.startsWith('atm-runner')) {
      await withDbTimeout(
        supabase
          .from('painelvm_atm_strategies')
          .delete()
          .eq('id', id),
        3500
      );
    }
    return true;
  } catch (err) {
    console.warn('[DB] Erro ao deletar estratégia ATM:', err);
    return true;
  }
}

// ================================================================
// TRAÇADOS E DESENHOS GRÁFICOS (painelvm_chart_drawings)
// ================================================================
export async function fetchChartDrawingsSupabase(accountId: string, symbol: string): Promise<DrawingItem[]> {
  const localKey = `vortex_chart_drawings_${accountId}_${symbol}`;
  let localDrawings: DrawingItem[] = [];
  try {
    const saved = localStorage.getItem(localKey);
    if (saved) localDrawings = JSON.parse(saved);
  } catch {}

  try {
    const user = await getAuthUser();
    if (!user || !user.id) return localDrawings;

    const rowId = `drawings_${accountId}_${symbol}`;
    const { data, error } = await withDbTimeout(
      supabase
        .from('painelvm_chart_drawings')
        .select('*')
        .eq('id', rowId)
        .maybeSingle(),
      3500
    );

    if (!error && data && data.drawings) {
      const remoteDrawings: DrawingItem[] = typeof data.drawings === 'string' ? JSON.parse(data.drawings) : data.drawings;
      if (Array.isArray(remoteDrawings)) {
        try {
          localStorage.setItem(localKey, JSON.stringify(remoteDrawings));
        } catch {}
        return remoteDrawings;
      }
    }
    return localDrawings;
  } catch (err) {
    return localDrawings;
  }
}

export async function saveChartDrawingsSupabase(accountId: string, symbol: string, drawings: DrawingItem[]): Promise<boolean> {
  const localKey = `vortex_chart_drawings_${accountId}_${symbol}`;
  try {
    localStorage.setItem(localKey, JSON.stringify(drawings));
  } catch {}

  try {
    const user = await getAuthUser();
    if (!user || !user.id) return true;

    const rowId = `drawings_${accountId}_${symbol}`;
    const payload = {
      id: rowId,
      user_id: user.id,
      account_id: accountId,
      symbol: symbol,
      drawings: drawings,
      updated_at: new Date().toISOString()
    };

    await withDbTimeout(
      supabase
        .from('painelvm_chart_drawings')
        .upsert(payload, { onConflict: 'id' }),
      4000
    );
    return true;
  } catch (err) {
    return true;
  }
}

// 17. Perfis de Layout por Usuário (painelvm_user_profiles)
export interface UserLayoutProfile {
  id: string;
  user_id?: string;
  name: string;
  card_order: string[];
  hidden_cards: string[];
  card_columns?: Record<string, string>;
  card_col_spans: Record<string, number>;
  card_heights: Record<string, number>;
  card_widths: Record<string, number>;
  created_at?: string;
}

export async function fetchUserLayoutProfilesSupabase(): Promise<UserLayoutProfile[]> {
  let localProfiles: UserLayoutProfile[] = [];
  try {
    const saved = localStorage.getItem('vortex_card_profiles');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        localProfiles = parsed.map((p: any) => ({
          id: p.id,
          name: p.name,
          card_order: p.cardOrder || p.card_order || [],
          hidden_cards: p.hiddenCards || p.hidden_cards || [],
          card_columns: p.cardColumns || p.card_columns,
          card_col_spans: p.colSpans || p.card_col_spans || {},
          card_heights: p.cardHeights || p.card_heights || {},
          card_widths: p.cardWidths || p.card_widths || {}
        }));
      }
    }
  } catch {}

  try {
    const user = await getAuthUser();
    if (!user) return localProfiles;

    const { data, error } = await withDbTimeout(
      supabase
        .from('painelvm_user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
      3500
    );

    if (error) {
      return localProfiles;
    }
    
    // Auto-migração para Supabase dos perfis que estavam salvos localmente
    if (user && user.id && localProfiles.length > 0) {
      const dbIds = new Set((data || []).map((d: any) => d.id));
      const unpersisted = localProfiles.filter(p => !dbIds.has(p.id));
      if (unpersisted.length > 0) {
        (async () => {
          for (const p of unpersisted) {
            try {
              await withDbTimeout(
                supabase
                  .from('painelvm_user_profiles')
                  .upsert({
                    ...p,
                    user_id: user.id,
                    updated_at: new Date().toISOString()
                  }, { onConflict: 'id' }),
                3500
              );
            } catch (e) {}
          }
        })();
      }
    }

    if (data && data.length > 0) {
      return data;
    }
    return localProfiles;
  } catch (err) {
    return localProfiles;
  }
}

export async function saveUserLayoutProfileSupabase(profile: Omit<UserLayoutProfile, 'created_at'>): Promise<UserLayoutProfile | null> {
  try {
    const user = await getAuthUser();
    
    // Atualizar no localStorage imediatamente
    try {
      const saved = localStorage.getItem('vortex_card_profiles');
      let list = saved ? JSON.parse(saved) : [];
      const idx = list.findIndex((p: any) => p.id === profile.id);
      const formattedForLocal = {
        id: profile.id,
        name: profile.name,
        cardOrder: profile.card_order,
        hiddenCards: profile.hidden_cards,
        cardColumns: profile.card_columns,
        colSpans: profile.card_col_spans,
        cardColSpans: profile.card_col_spans,
        cardHeights: profile.card_heights,
        cardWidths: profile.card_widths
      };
      if (idx >= 0) {
        list[idx] = formattedForLocal;
      } else {
        list.push(formattedForLocal);
      }
      localStorage.setItem('vortex_card_profiles', JSON.stringify(list));
    } catch {}

    if (!user) return null;

    const payload = {
      ...profile,
      user_id: user.id,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await withDbTimeout(
      supabase
        .from('painelvm_user_profiles')
        .upsert(payload, { onConflict: 'id' }),
      3500
    );

    if (error) {
      return null;
    }
    return data;
  } catch (err) {
    return null;
  }
}

export async function deleteUserLayoutProfileSupabase(profileId: string): Promise<boolean> {
  try {
    try {
      const saved = localStorage.getItem('vortex_card_profiles');
      if (saved) {
        const list = JSON.parse(saved);
        const filtered = list.filter((p: any) => p.id !== profileId);
        localStorage.setItem('vortex_card_profiles', JSON.stringify(filtered));
      }
    } catch {}

    const { error } = await supabase
      .from('painelvm_user_profiles')
      .delete()
      .eq('id', profileId);

    if (error) return false;
    return true;
  } catch (err) {
    return false;
  }
}

// ================================================================
// GESTÃO DE CONTAS DEMONSTRATIVAS GLOBAIS, COPY TRADE E RISK
// ================================================================

export type AccountPlatform = 'axion' | 'mt4' | 'mt5' | 'nt8';

export interface BrokerAccount {
  id: string;
  user_id: string;
  account_type: 'internal_demo' | 'tradovate_demo' | 'tradovate_live';
  platform?: AccountPlatform;
  tradovate_account_id?: number | null;
  account_name: string;
  balance: number;
  initial_balance: number;
  currency: string;
  is_master: boolean;
  is_active: boolean;
  dd_mode: 'intraday_trailing' | 'eod';
  max_drawdown_usd: number;
  daily_stop_loss_usd: number;
  daily_max_gain_usd?: number;
  daily_max_entries?: number;
  allow_multi_signals?: boolean;
  profit_target_usd?: number;
  consistency_pct?: number;
  simulate_elimination?: boolean;
  manual_trading_enabled?: boolean;
  manual_start_time?: string;
  manual_end_time?: string;
  manual_max_lots?: number;
  manual_max_daily_trades?: number;
  trader_daily_stop_loss_usd?: number;
  trader_daily_take_profit_usd?: number;
  manual_strategy_id?: string | null;
  send_localhost?: boolean;
  execution_symbol?: string;
  symbol_mapping?: string;
  high_watermark: number;
  eod_baseline_balance: number;
  enforce_dd_lockout: boolean;
  status: 'active' | 'failed_lockout';
  created_at: string;
}

export interface AccountStrategy {
  id: string;
  account_id: string;
  prompt_id?: string | null;
  manual_strategy_id?: string | null;
  panel_id?: string | null;
  contract_size_multiplier: number;
  is_enabled: boolean;
  created_at: string;
}

export interface CopyTradingConfig {
  master_account_name?: string;
  slave_account_name?: string;
  cancel_orphan_orders?: boolean;
  id: string;
  master_account_id: string;
  slave_account_id: string;
  lot_multiplier: number;
  allowed_symbols?: string; // 'TODOS' ou 'NQ, MNQ, ES, MES'
  copy_manual_trades: boolean;
  copy_algo_trades: boolean;
  copy_atm_strategy?: boolean; // Copiar estratégia ATM / Stop Loss e Take Profit da Master
  close_slaves_on_master_close?: boolean; // Fechar posições nas slaves automaticamente se a Master fechar
  is_active: boolean;
  created_at: string;
}

export interface RemoteCopySubscription {
  id: string;
  account_id: string; // Conta local de destino (onde executar a cópia)
  remote_source_id: string; // ID da conta master ou estratégia externa a seguir
  label?: string; // Descrição / Apelido (ex: Sala VIP, Robô Trader X)
  lot_multiplier: number; // Multiplicador de lotes (ex: 1.0)
  is_active: boolean; // Se está ativa para receber cópias
  created_at: string;
}

export interface AccountDrawdownMetrics {
  currentBalance: number;
  highWatermark: number;
  eodBaseline: number;
  intradayDrawdownUsd: number;
  intradayDrawdownPct: number;
  eodDrawdownUsd: number;
  eodDrawdownPct: number;
  dailyPnL: number;
  dailyEntriesCount: number;
  dailyStopViolated: boolean;
  dailyGainTargetMet: boolean;
  dailyMaxEntriesExceeded: boolean;
  maxDdViolated: boolean;
  maxSingleDayProfit: number;
  maxAllowedSingleDayProfit: number;
  consistencyPctCalculated: number;
  consistencyViolated: boolean;
  effectiveProfitBase: number;
  isLockedOut: boolean;
  isNinjaSynced?: boolean;
  ninjaLastSyncedAt?: string;
}

export interface NinjaAccountMetricsSnapshot {
  accountName: string;
  cashValue: number;
  realizedPnL: number;
  unrealizedPnL: number;
  dailyPnL: number;
  updatedAt: string;
}

export const getNinjaAccountMetricsCache = (): Record<string, NinjaAccountMetricsSnapshot> => {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('vortex_ninja_account_metrics_cache') : null;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const saveNinjaAccountMetricsCache = (data: Record<string, NinjaAccountMetricsSnapshot>) => {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('vortex_ninja_account_metrics_cache', JSON.stringify(data));
    }
  } catch {}
};

// Helpers locais para persistência e fallback de Contas Demonstrativas
export const getLocalBrokerAccounts = (): BrokerAccount[] => {
  try {
    const subId = typeof localStorage !== 'undefined' ? (localStorage.getItem('vortex_subscription_id') || 'default') : 'default';
    const raw = (typeof localStorage !== 'undefined' && localStorage.getItem(`vortex_broker_accounts_local_${subId}`)) || 
                (typeof localStorage !== 'undefined' && localStorage.getItem('vortex_broker_accounts_local'));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

export const saveLocalBrokerAccounts = (accounts: BrokerAccount[]) => {
  try {
    const subId = typeof localStorage !== 'undefined' ? (localStorage.getItem('vortex_subscription_id') || 'default') : 'default';
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`vortex_broker_accounts_local_${subId}`, JSON.stringify(accounts));
      localStorage.setItem('vortex_broker_accounts_local', JSON.stringify(accounts));
    }
  } catch (e) {}
};

const saveLocalBrokerAccount = (account: BrokerAccount) => {
  try {
    const list = getLocalBrokerAccounts();
    const idx = list.findIndex(a => a.id === account.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...account };
    } else {
      list.push(account);
    }
    saveLocalBrokerAccounts(list);
  } catch (e) {}
};

const deleteLocalBrokerAccount = (id: string, name?: string) => {
  try {
    const list = getLocalBrokerAccounts();
    const cleanName = name?.trim().toLowerCase();
    const filtered = list.filter(a => a.id !== id && (!cleanName || a.account_name?.trim().toLowerCase() !== cleanName));
    saveLocalBrokerAccounts(filtered);
  } catch (e) {}
};

// Helper interno para persistir regras customizadas por conta localmente
const saveLocalAccountRules = (id: string, rules: Partial<BrokerAccount>) => {
  try {
    const rawMap = localStorage.getItem('vortex_account_custom_rules') || '{}';
    const map = JSON.parse(rawMap);
    map[id] = {
      ...(map[id] || {}),
      ...(rules.account_name !== undefined ? { account_name: rules.account_name } : {}),
      ...(rules.platform !== undefined ? { platform: rules.platform } : {}),
      ...(rules.send_localhost !== undefined ? { send_localhost: rules.send_localhost } : {}),
      ...(rules.profit_target_usd !== undefined ? { profit_target_usd: Number(rules.profit_target_usd) } : {}),
      ...(rules.consistency_pct !== undefined ? { consistency_pct: Number(rules.consistency_pct) } : {}),
      ...(rules.simulate_elimination !== undefined ? { simulate_elimination: rules.simulate_elimination } : {}),
      ...(rules.manual_trading_enabled !== undefined ? { manual_trading_enabled: rules.manual_trading_enabled } : {}),
      ...(rules.manual_start_time !== undefined ? { manual_start_time: rules.manual_start_time } : {}),
      ...(rules.manual_end_time !== undefined ? { manual_end_time: rules.manual_end_time } : {}),
      ...(rules.manual_max_lots !== undefined ? { manual_max_lots: Number(rules.manual_max_lots) } : {}),
      ...(rules.manual_max_daily_trades !== undefined ? { manual_max_daily_trades: Number(rules.manual_max_daily_trades) } : {}),
      ...(rules.trader_daily_stop_loss_usd !== undefined ? { trader_daily_stop_loss_usd: Number(rules.trader_daily_stop_loss_usd) } : {}),
      ...(rules.trader_daily_take_profit_usd !== undefined ? { trader_daily_take_profit_usd: Number(rules.trader_daily_take_profit_usd) } : {}),
      ...(rules.manual_strategy_id !== undefined ? { manual_strategy_id: rules.manual_strategy_id } : {}),
      ...(rules.execution_symbol !== undefined ? { execution_symbol: rules.execution_symbol } : {}),
      ...(rules.symbol_mapping !== undefined ? { symbol_mapping: rules.symbol_mapping } : {})
    };
    localStorage.setItem('vortex_account_custom_rules', JSON.stringify(map));
  } catch (e) {}
};

/**
 * Resolve o ativo de execução real a partir da conta e do ativo do painel/gráfico.
 * O símbolo é retornado EXATAMENTE como configurado (ex: "MNQ SEP26") sem conversão,
 * para que o AddOn do NinjaTrader receba o formato nativo correto.
 */
const MARKET_SYMBOL_ALIASES: Record<string, string[]> = {
  NQ: ['NQ', 'NASDAQ', 'MNQ', 'NDX', 'US100', 'NAS100'],
  ES: ['ES', 'SP500', 'S&P500', 'MES', 'SPX', 'US500', 'SP'],
  RTY: ['RTY', 'RUSSELL', 'RUSSEL', 'M2K', 'US2000'],
  GC: ['GC', 'GOLD', 'OURO', 'MGC', 'XAUUSD'],
  CL: ['CL', 'OIL', 'PETROLEO', 'PETR', 'MCL', 'USOIL', 'WTI'],
  YM: ['YM', 'DOW', 'DOWJONES', 'MYM', 'US30', 'DJIA'],
  FDAX: ['FDAX', 'DAX', 'GER40', 'DE40', 'FDXM']
};

export const areMarketSymbolsEquivalent = (a?: string, b?: string): boolean => {
  if (!a || !b) return false;
  const cleanA = a.trim().toUpperCase();
  const cleanB = b.trim().toUpperCase();
  if (cleanA === cleanB || cleanA.startsWith(cleanB) || cleanB.startsWith(cleanA)) return true;

  for (const list of Object.values(MARKET_SYMBOL_ALIASES)) {
    const inA = list.some(sym => cleanA === sym || cleanA.startsWith(sym));
    const inB = list.some(sym => cleanB === sym || cleanB.startsWith(sym));
    if (inA && inB) return true;
  }
  return false;
};

export const resolveAccountExecutionSymbol = (account?: BrokerAccount | null, baseSymbol?: string): string => {
  if (!baseSymbol) return 'NQ';
  if (!account) return baseSymbol;

  // 1. Símbolo fixo de execução para a conta
  if (account.execution_symbol && account.execution_symbol.trim() !== '') {
    return account.execution_symbol.trim().replace(/\s+/g, ' ');
  }

  // 2. Mapeamento granular de/para (ex: "NQ->MNQ SEP26", "NQ->MNQ DEC26" ou "NQ:MNQ")
  if (account.symbol_mapping && account.symbol_mapping.trim() !== '') {
    const raw = account.symbol_mapping.trim();
    const cleanBase = baseSymbol.trim().toUpperCase();
    const pairs = raw.split(/[,;\n]/);
    for (const pair of pairs) {
      if (!pair || !pair.trim()) continue;
      let fromSym = '';
      let toSym = '';

      if (pair.includes('->')) {
        const idx = pair.indexOf('->');
        fromSym = pair.substring(0, idx).trim().toUpperCase();
        toSym = pair.substring(idx + 2).trim().toUpperCase();
      } else if (pair.includes('=>')) {
        const idx = pair.indexOf('=>');
        fromSym = pair.substring(0, idx).trim().toUpperCase();
        toSym = pair.substring(idx + 2).trim().toUpperCase();
      } else if (pair.includes(':')) {
        const idx = pair.indexOf(':');
        fromSym = pair.substring(0, idx).trim().toUpperCase();
        toSym = pair.substring(idx + 1).trim().toUpperCase();
      } else if (pair.includes('=')) {
        const idx = pair.indexOf('=');
        fromSym = pair.substring(0, idx).trim().toUpperCase();
        toSym = pair.substring(idx + 1).trim().toUpperCase();
      } else {
        const parts = pair.split(/[->:=]/).map(s => s.trim().toUpperCase()).filter(Boolean);
        if (parts.length >= 2) {
          fromSym = parts[0];
          toSym = parts[parts.length - 1];
        }
      }

      toSym = toSym.replace(/\s+/g, ' ').trim();

      if (fromSym && toSym) {
        if (areMarketSymbolsEquivalent(cleanBase, fromSym)) {
          return toSym;
        }
      }
    }
  }

  // 3. Fallback inteligente para contas NinjaTrader sem mapeamento configurado
  if (isNinjaExecutionAccount(account)) {
    // Procura se alguma outra conta no sistema possui a regra cadastrada (ex: Sim101 tem "NQ->MNQ DEC26")
    try {
      const allAccs = getLocalBrokerAccounts();
      for (const otherAcc of allAccs) {
        if (otherAcc.id !== account.id && otherAcc.symbol_mapping && otherAcc.symbol_mapping.trim() !== '') {
          const resolved = resolveAccountExecutionSymbol({ ...otherAcc, execution_symbol: '' }, baseSymbol);
          if (resolved && resolved !== baseSymbol) {
            return resolved;
          }
        }
      }
    } catch {}

    // Fallback para contrato vigente do trimestre (DEC26)
    const upper = baseSymbol.trim().toUpperCase();
    if (areMarketSymbolsEquivalent(upper, 'NQ')) return 'MNQ DEC26';
    if (areMarketSymbolsEquivalent(upper, 'RTY')) return 'M2K DEC26';
    if (areMarketSymbolsEquivalent(upper, 'ES')) return 'MES DEC26';
    if (areMarketSymbolsEquivalent(upper, 'GC')) return 'MGC DEC26';
    if (areMarketSymbolsEquivalent(upper, 'CL')) return 'MCL DEC26';
  }

  return baseSymbol;
};

export const getAccountManualStrategyId = (account?: BrokerAccount | null): string => {
  if (account && account.manual_strategy_id && account.manual_strategy_id.trim() !== '') {
    return account.manual_strategy_id.trim();
  }
  const accId = account?.id || 'default';
  const key = `vortex_account_manual_strat_id_${accId}`;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = localStorage.getItem(key);
      if (stored && stored.trim() !== '') return stored.trim();
    } catch (e) {}
  }
  const shortId = accId !== 'default' ? accId.slice(0, 8) : 'def';
  const rand = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36).slice(-6);
  const newId = `man-${shortId}-${rand}`;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(key, newId);
    } catch (e) {}
  }
  return newId;
};

export const generateAccountManualStrategyId = async (account: BrokerAccount): Promise<string> => {
  const shortId = account.id ? account.id.slice(0, 8) : 'def';
  const rand = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36).slice(-6);
  const newId = `man-${shortId}-${rand}`;
  const key = `vortex_account_manual_strat_id_${account.id}`;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(key, newId);
    } catch (e) {}
  }
  saveLocalAccountRules(account.id, { manual_strategy_id: newId });
  await updateAccountSupabase(account.id, { manual_strategy_id: newId });
  return newId;
};

export async function fetchAccountsSupabase(): Promise<BrokerAccount[]> {
  try {
    const user = await getAuthUser();
    const rawLocalList = getLocalBrokerAccounts();
    const localList = user ? rawLocalList.filter(acc => !acc.user_id || acc.user_id === user.id) : rawLocalList;
    if (!user) return localList;

    const storedSubscriptionId = localStorage.getItem('vortex_subscription_id');
    const userEmail = user.email || '';
    const isSystemAdmin = userEmail.toLowerCase() === 'admin@vortex.com';

    let dbData: any[] = [];
    let dbSuccess = false;
    try {
      const { data, error } = await withDbTimeout(
        supabase
          .from('painelvm_broker_accounts')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true }) as any,
        4000
      );
      if (!error && data) {
        if (storedSubscriptionId && storedSubscriptionId !== 'admin' && !isSystemAdmin) {
          dbData = data.filter((a: any) => {
            if (a.tradovate_account_id !== null && a.tradovate_account_id !== undefined) {
              return String(a.tradovate_account_id) === String(storedSubscriptionId);
            }
            const rawPlan = localStorage.getItem('vortex_plan_details');
            const plan = rawPlan ? JSON.parse(rawPlan) : null;
            return plan?.isLegacyProduct === true;
          });
        } else {
          dbData = data;
        }
        dbSuccess = true;
      }
    } catch (dbErr) {
      console.warn('[DB] Timeout ou erro ao buscar contas no Supabase. Usando cache local:', dbErr);
    }

    let localRulesMap: Record<string, any> = {};
    try {
      const rawRules = localStorage.getItem('vortex_account_custom_rules');
      if (rawRules) localRulesMap = JSON.parse(rawRules);
    } catch (e) {}

    if (dbSuccess) {
      // Quando logado e o banco respondeu com sucesso, o Supabase é a fonte de verdade.
      // Contas deletadas em outro PC não serão ressuscitadas pelo cache local deste PC.
      const finalAccounts = dbData.map(a => {
        const lr = localRulesMap[a.id] || {};
        const fullAcc: BrokerAccount = {
          ...a,
          account_name: a.account_name || lr.account_name || 'Conta',
          platform: a.platform || lr.platform || 'axion',
          send_localhost: a.send_localhost !== undefined ? a.send_localhost : (lr.send_localhost ?? false),
          execution_symbol: a.execution_symbol || lr.execution_symbol || '',
          symbol_mapping: a.symbol_mapping || lr.symbol_mapping || '',
          profit_target_usd: a.profit_target_usd !== undefined && a.profit_target_usd !== null
            ? Number(a.profit_target_usd)
            : (lr.profit_target_usd !== undefined ? Number(lr.profit_target_usd) : 3000),
          consistency_pct: a.consistency_pct !== undefined && a.consistency_pct !== null
            ? Number(a.consistency_pct)
            : (lr.consistency_pct !== undefined ? Number(lr.consistency_pct) : 40),
          simulate_elimination: (a.platform === 'nt8' || a.send_localhost || isNinjaExecutionAccount(a))
            ? false
            : (a.simulate_elimination !== undefined && a.simulate_elimination !== null
                ? a.simulate_elimination
                : (lr.simulate_elimination !== undefined ? lr.simulate_elimination : false)),
          manual_trading_enabled: a.manual_trading_enabled !== undefined && a.manual_trading_enabled !== null
            ? a.manual_trading_enabled
            : (lr.manual_trading_enabled !== undefined ? lr.manual_trading_enabled : true),
          manual_start_time: a.manual_start_time || lr.manual_start_time || '09:00:00',
          manual_end_time: a.manual_end_time || lr.manual_end_time || '17:00:00',
          manual_max_lots: a.manual_max_lots !== undefined && a.manual_max_lots !== null
            ? Number(a.manual_max_lots)
            : (lr.manual_max_lots !== undefined ? Number(lr.manual_max_lots) : 10),
          manual_max_daily_trades: a.manual_max_daily_trades !== undefined && a.manual_max_daily_trades !== null
            ? Number(a.manual_max_daily_trades)
            : (lr.manual_max_daily_trades !== undefined ? Number(lr.manual_max_daily_trades) : 0),
          trader_daily_stop_loss_usd: a.trader_daily_stop_loss_usd !== undefined && a.trader_daily_stop_loss_usd !== null
            ? Number(a.trader_daily_stop_loss_usd)
            : (lr.trader_daily_stop_loss_usd !== undefined ? Number(lr.trader_daily_stop_loss_usd) : 0),
          trader_daily_take_profit_usd: a.trader_daily_take_profit_usd !== undefined && a.trader_daily_take_profit_usd !== null
            ? Number(a.trader_daily_take_profit_usd)
            : (lr.trader_daily_take_profit_usd !== undefined ? Number(lr.trader_daily_take_profit_usd) : 0),
          manual_strategy_id: a.manual_strategy_id || lr.manual_strategy_id || getAccountManualStrategyId(a)
        };
        return fullAcc;
      });

      // Atualiza o cache local preservando contas de outros usuários se houver
      const otherUserAccounts = rawLocalList.filter(acc => acc.user_id && acc.user_id !== user.id);
      saveLocalBrokerAccounts([...otherUserAccounts, ...finalAccounts]);

      // Popula o mapa de regras personalizadas da máquina local para que contas NT8 mantenham todos os atributos
      finalAccounts.forEach(a => {
        saveLocalAccountRules(a.id, a);
      });

      return finalAccounts;
    } else {
      return localList;
    }
  } catch (err) {
    console.error('[DB] Exceção ao buscar contas:', err);
    return getLocalBrokerAccounts();
  }
}

// Helpers locais para persistência e fallback de rotas de estratégias
const getLocalAccountStrategies = (): AccountStrategy[] => {
  try {
    const raw = localStorage.getItem('vortex_account_strategies_local');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const saveLocalAccountStrategy = (route: AccountStrategy) => {
  try {
    const list = getLocalAccountStrategies();
    const filtered = list.filter(r => r.id !== route.id && !(r.account_id === route.account_id && r.manual_strategy_id === route.manual_strategy_id && r.prompt_id === route.prompt_id));
    filtered.push(route);
    localStorage.setItem('vortex_account_strategies_local', JSON.stringify(filtered));
  } catch (e) {}
};

const deleteLocalAccountStrategy = (id: string) => {
  try {
    const list = getLocalAccountStrategies();
    const filtered = list.filter(r => r.id !== id);
    localStorage.setItem('vortex_account_strategies_local', JSON.stringify(filtered));
  } catch (e) {}
};

export async function createDemoAccountSupabase(params: {
  account_name: string;
  initial_balance: number;
  platform?: AccountPlatform;
  dd_mode: 'intraday_trailing' | 'eod';
  max_drawdown_usd: number;
  daily_stop_loss_usd: number;
  daily_max_gain_usd?: number;
  daily_max_entries?: number;
  allow_multi_signals?: boolean;
  profit_target_usd?: number;
  consistency_pct?: number;
  simulate_elimination?: boolean;
  enforce_dd_lockout?: boolean;
  is_master?: boolean;
  send_localhost?: boolean;
  manual_trading_enabled?: boolean;
  manual_start_time?: string;
  manual_end_time?: string;
  manual_max_lots?: number;
  manual_max_daily_trades?: number;
  trader_daily_stop_loss_usd?: number;
  trader_daily_take_profit_usd?: number;
  execution_symbol?: string;
  symbol_mapping?: string;
}): Promise<BrokerAccount | null> {
  try {
    const user = await getAuthUser();
    const cleanAccountName = params.account_name.trim();

    // 🛡️ PREVENÇÃO DE DUPLICIDADE: Se já existir conta com mesmo nome, atualiza e retorna a existente
    const localAccounts = getLocalBrokerAccounts();
    const existingLocal = localAccounts.find(a =>
      a.account_name?.trim().toLowerCase() === cleanAccountName.toLowerCase() &&
      (!user || !a.user_id || a.user_id === user.id)
    );
    if (existingLocal) {
      const updated = await updateAccountSupabase(existingLocal.id, {
        ...params,
        account_name: cleanAccountName,
        is_active: true,
        status: 'active'
      });
      return updated || existingLocal;
    }

    if (user?.id) {
      try {
        const { data: existingDb } = await supabase
          .from('painelvm_broker_accounts')
          .select('*')
          .eq('user_id', user.id)
          .ilike('account_name', cleanAccountName)
          .maybeSingle();

        if (existingDb && existingDb.id) {
          saveLocalBrokerAccount(existingDb);
          const updated = await updateAccountSupabase(existingDb.id, {
            ...params,
            account_name: cleanAccountName,
            is_active: true,
            status: 'active'
          });
          return updated || existingDb;
        }
      } catch (checkErr) {
        console.warn('[DB] Checagem de conta existente no Supabase:', checkErr);
      }
    }

    const generatedId = generateSecureUUID();

    const localAccount: BrokerAccount = {
      id: generatedId,
      user_id: user?.id || 'local_user',
      account_type: 'internal_demo',
      platform: params.platform || 'axion',
      account_name: cleanAccountName,
      balance: Number(params.initial_balance) || 50000,
      initial_balance: Number(params.initial_balance) || 50000,
      currency: 'USD',
      high_watermark: Number(params.initial_balance) || 50000,
      eod_baseline_balance: Number(params.initial_balance) || 50000,
      dd_mode: params.dd_mode || 'intraday_trailing',
      max_drawdown_usd: Number(params.max_drawdown_usd) || 2500,
      daily_stop_loss_usd: Number(params.daily_stop_loss_usd) || 1000,
      daily_max_gain_usd: params.daily_max_gain_usd !== undefined ? Number(params.daily_max_gain_usd) : 2000,
      daily_max_entries: params.daily_max_entries !== undefined ? Number(params.daily_max_entries) : 0,
      allow_multi_signals: params.allow_multi_signals !== undefined ? params.allow_multi_signals : true,
      profit_target_usd: params.profit_target_usd !== undefined ? Number(params.profit_target_usd) : 3000,
      consistency_pct: params.consistency_pct !== undefined ? Number(params.consistency_pct) : 40,
      simulate_elimination: params.simulate_elimination !== undefined ? params.simulate_elimination : true,
      enforce_dd_lockout: params.enforce_dd_lockout !== undefined ? params.enforce_dd_lockout : true,
      is_master: params.is_master || false,
      is_active: true,
      status: 'active',
      send_localhost: params.send_localhost || false,
      execution_symbol: params.execution_symbol || '',
      symbol_mapping: params.symbol_mapping || '',
      manual_trading_enabled: params.manual_trading_enabled !== undefined ? params.manual_trading_enabled : true,
      manual_start_time: params.manual_start_time || '09:00:00',
      manual_end_time: params.manual_end_time || '17:00:00',
      manual_max_lots: params.manual_max_lots !== undefined ? Number(params.manual_max_lots) : 10,
      manual_max_daily_trades: params.manual_max_daily_trades !== undefined ? Number(params.manual_max_daily_trades) : 0,
      trader_daily_stop_loss_usd: params.trader_daily_stop_loss_usd !== undefined ? Number(params.trader_daily_stop_loss_usd) : 0,
      trader_daily_take_profit_usd: params.trader_daily_take_profit_usd !== undefined ? Number(params.trader_daily_take_profit_usd) : 0,
      created_at: new Date().toISOString()
    };

    saveLocalBrokerAccount(localAccount);
    saveLocalAccountRules(localAccount.id, params);

    if (user) {
      try {
        const storedSubscriptionId = typeof localStorage !== 'undefined' ? localStorage.getItem('vortex_subscription_id') : null;
        const subNumeric = storedSubscriptionId && !isNaN(Number(storedSubscriptionId)) ? Number(storedSubscriptionId) : null;

        const payload: any = {
          id: generatedId,
          user_id: user.id,
          account_type: 'internal_demo',
          platform: localAccount.platform || 'axion',
          account_name: params.account_name.trim(),
          balance: localAccount.balance,
          initial_balance: localAccount.initial_balance,
          currency: 'USD',
          high_watermark: localAccount.high_watermark,
          eod_baseline_balance: localAccount.eod_baseline_balance,
          dd_mode: localAccount.dd_mode,
          max_drawdown_usd: localAccount.max_drawdown_usd,
          daily_stop_loss_usd: localAccount.daily_stop_loss_usd,
          daily_max_gain_usd: localAccount.daily_max_gain_usd,
          daily_max_entries: localAccount.daily_max_entries,
          allow_multi_signals: localAccount.allow_multi_signals,
          profit_target_usd: localAccount.profit_target_usd,
          consistency_pct: localAccount.consistency_pct,
          simulate_elimination: localAccount.simulate_elimination,
          enforce_dd_lockout: localAccount.enforce_dd_lockout,
          is_master: localAccount.is_master,
          is_active: true,
          status: 'active',
          send_localhost: localAccount.send_localhost || false,
          execution_symbol: localAccount.execution_symbol || '',
          symbol_mapping: localAccount.symbol_mapping || '',
          manual_trading_enabled: localAccount.manual_trading_enabled !== false,
          manual_start_time: localAccount.manual_start_time || '09:00:00',
          manual_end_time: localAccount.manual_end_time || '17:00:00',
          manual_max_lots: localAccount.manual_max_lots || 10,
          manual_max_daily_trades: localAccount.manual_max_daily_trades || 0,
          trader_daily_stop_loss_usd: localAccount.trader_daily_stop_loss_usd || 0,
          trader_daily_take_profit_usd: localAccount.trader_daily_take_profit_usd || 0,
          tradovate_account_id: subNumeric
        };

        let { data, error } = await withDbTimeout(
          supabase
            .from('painelvm_broker_accounts')
            .insert([payload])
            .select()
            .maybeSingle() as any,
          5000
        );

        if (error) {
          console.error('[DB] Erro ao inserir conta no Supabase:', error);
          const safePayload = {
            id: generatedId,
            user_id: user.id,
            account_type: 'internal_demo',
            account_name: params.account_name.trim(),
            balance: localAccount.balance,
            initial_balance: localAccount.initial_balance,
            high_watermark: localAccount.high_watermark,
            eod_baseline_balance: localAccount.eod_baseline_balance,
            dd_mode: localAccount.dd_mode,
            max_drawdown_usd: localAccount.max_drawdown_usd,
            daily_stop_loss_usd: localAccount.daily_stop_loss_usd,
            status: 'active',
            tradovate_account_id: subNumeric
          };

          const res = await withDbTimeout(
            supabase
              .from('painelvm_broker_accounts')
              .insert([safePayload])
              .select()
              .maybeSingle() as any,
            4000
          );
          data = res.data;
        }

        if (data && data.id) {
          saveLocalBrokerAccount({ ...localAccount, ...data });
        }
      } catch (syncErr) {
        console.warn('[DB] Conta salva localmente (aviso Supabase):', syncErr);
      }
    }

    syncAllCopyRulesToNinjaTrader().catch(() => {});
    return localAccount;
  } catch (err) {
    console.error('[DB] Exceção ao criar conta demonstrativa:', err);
    return null;
  }
}

export async function updateAccountSupabase(
  accountId: string,
  updates: Partial<BrokerAccount>
): Promise<BrokerAccount | null> {
  try {
    saveLocalAccountRules(accountId, updates);
    const existingList = getLocalBrokerAccounts();
    const existing = existingList.find(a => a.id === accountId);
    const updatedAccount: BrokerAccount = {
      ...(existing || { id: accountId, user_id: 'local', account_type: 'internal_demo', account_name: 'Conta', balance: 50000, initial_balance: 50000, currency: 'USD', is_master: false, is_active: true, dd_mode: 'intraday_trailing', max_drawdown_usd: 2500, daily_stop_loss_usd: 1000, high_watermark: 50000, eod_baseline_balance: 50000, enforce_dd_lockout: true, status: 'active', created_at: new Date().toISOString() }),
      ...updates
    };
    saveLocalBrokerAccount(updatedAccount);

    // Sync com Supabase com timeout
    // IMPORTANTE: remover campos que não existem na tabela (updated_at, tradovate_account_id se não for alterado)
    try {
      const supabaseUpdates: any = { ...updates };
      // A tabela painelvm_broker_accounts não possui a coluna 'updated_at'
      delete supabaseUpdates.updated_at;
      // Remover campos undefined/null que causam erro de schema
      Object.keys(supabaseUpdates).forEach(key => {
        if (supabaseUpdates[key] === undefined) delete supabaseUpdates[key];
      });

      if (Object.keys(supabaseUpdates).length === 0) {
        return updatedAccount;
      }

      const { error } = await withDbTimeout(
        supabase
          .from('painelvm_broker_accounts')
          .update(supabaseUpdates)
          .eq('id', accountId) as any,
        4000
      );

      if (error) {
        console.warn('[DB] Tentando update adaptativo no Supabase:', error.message);
        // Remover campos desconhecidos pelo erro e tentar novamente
        const safeUpdates = { ...supabaseUpdates };
        if (error.message && error.message.includes('platform')) delete safeUpdates.platform;
        if (error.message && error.message.includes('profit_target_usd')) delete safeUpdates.profit_target_usd;
        if (error.message && error.message.includes('consistency_pct')) delete safeUpdates.consistency_pct;
        if (error.message && error.message.includes('simulate_elimination')) delete safeUpdates.simulate_elimination;
        if (error.message && error.message.includes('send_localhost')) delete safeUpdates.send_localhost;
        if (error.message && error.message.includes('manual_strategy_id')) delete safeUpdates.manual_strategy_id;
        if (error.message && error.message.includes('execution_symbol')) delete safeUpdates.execution_symbol;
        if (error.message && error.message.includes('symbol_mapping')) delete safeUpdates.symbol_mapping;
        if (error.message && error.message.includes('manual_start_time')) delete safeUpdates.manual_start_time;
        if (error.message && error.message.includes('manual_end_time')) delete safeUpdates.manual_end_time;
        if (error.message && error.message.includes('manual_trading_enabled')) delete safeUpdates.manual_trading_enabled;
        if (error.message && error.message.includes('trader_daily_stop_loss_usd')) delete safeUpdates.trader_daily_stop_loss_usd;
        if (error.message && error.message.includes('trader_daily_take_profit_usd')) delete safeUpdates.trader_daily_take_profit_usd;

        if (Object.keys(safeUpdates).length > 0) {
          const { error: error2 } = await withDbTimeout(
            supabase
              .from('painelvm_broker_accounts')
              .update(safeUpdates)
              .eq('id', accountId) as any,
            4000
          );
          if (error2) {
            console.warn('[DB] Update adaptativo com erro:', error2.message);
          }
        }
      }
    } catch (e) {
      console.warn('[DB] Atualização sincronizada localmente (aviso Supabase):', e);
    }

    syncAllCopyRulesToNinjaTrader().catch(() => {});
    return updatedAccount;
  } catch (err) {
    console.error('[DB] Exceção ao atualizar conta:', err);
    saveLocalAccountRules(accountId, updates);
    syncAllCopyRulesToNinjaTrader().catch(() => {});
    return { id: accountId, ...updates } as BrokerAccount;
  }
}

export async function resetDemoAccountSupabase(accountId: string, newInitialBalance?: number, _accountName?: string): Promise<BrokerAccount | null> {
  try {
    const list = getLocalBrokerAccounts();
    const acc = list.find(a => a.id === accountId);
    const initialBal = newInitialBalance !== undefined 
      ? newInitialBalance 
      : (acc?.initial_balance || 25000);

    if (acc) {
      if (newInitialBalance !== undefined) {
        acc.initial_balance = initialBal;
      }
      acc.balance = initialBal;
      acc.high_watermark = initialBal;
      acc.eod_baseline_balance = initialBal;
      acc.status = 'active';
      saveLocalBrokerAccount(acc);
    }

    try {
      const payload: any = {
        balance: initialBal,
        high_watermark: initialBal,
        eod_baseline_balance: initialBal,
        status: 'active'
      };
      if (newInitialBalance !== undefined) {
        payload.initial_balance = initialBal;
      }
      await withDbTimeout(
        supabase
          .from('painelvm_broker_accounts')
          .update(payload)
          .eq('id', accountId) as any,
        4000
      );
    } catch (e) {
      console.warn('[DB] Reset sincronizado localmente (aviso Supabase):', e);
    }

    syncAllCopyRulesToNinjaTrader().catch(() => {});
    return acc || null;
  } catch (err) {
    console.error('[DB] Exceção ao resetar conta:', err);
    return null;
  }
}

export async function deleteAccountSupabase(accountId: string, accountNameParam?: string): Promise<boolean> {
  try {
    // 1. Obter nome da conta caso não tenha sido passado
    const existingList = getLocalBrokerAccounts();
    const targetAccount = existingList.find(a => a.id === accountId);
    const accountName = (accountNameParam || targetAccount?.account_name || '').trim();

    // 2. Excluir conta do armazenamento local (por ID e por nome)
    deleteLocalBrokerAccount(accountId, accountName);

    // 3. Excluir relatórios locais vinculados a esta conta (Análise de Desempenho / StrategyReport)
    try {
      const reports = getLocalStrategyReports();
      const filteredReports = reports.filter(r => {
        const matchesId = r.account_id === accountId;
        const matchesName = accountName !== '' && r.description && r.description.toLowerCase().includes(accountName.toLowerCase());
        return !matchesId && !matchesName;
      });
      saveLocalStrategyReports(filteredReports);
    } catch (e) {
      console.warn('[DB] Erro ao limpar relatórios locais da conta:', e);
    }

    // 4. Limpar regras de Copy Trading locais (se for Master remove toda a regra; se for Slave retira a slave)
    try {
      const copyConfigs = getLocalCopyTradingConfigs();
      const filteredCopy = copyConfigs.filter(c => {
        const isMaster = c.master_account_id === accountId || (accountName !== '' && c.master_account_id.toLowerCase() === accountName.toLowerCase());
        const isSlave = c.slave_account_id === accountId || (accountName !== '' && c.slave_account_id.toLowerCase() === accountName.toLowerCase());
        return !isMaster && !isSlave;
      });
      saveLocalCopyTradingConfigs(filteredCopy);
    } catch (e) {
      console.warn('[DB] Erro ao limpar regras de copy locais da conta:', e);
    }

    // 5. Limpar rotas locais desta conta
    try {
      const raw = localStorage.getItem('vortex_account_strategies_local');
      if (raw) {
        const strats = JSON.parse(raw);
        const filtered = strats.filter((s: any) => s.account_id !== accountId);
        localStorage.setItem('vortex_account_strategies_local', JSON.stringify(filtered));
      }
    } catch (e) {}

    // 6. Sincronizar exclusão com Supabase com await completo
    try {
      // 6.1 Excluir relatórios de operações da conta na base de dados (Análise de Desempenho)
      await withDbTimeout(
        supabase
          .from('painelvm_strategy_reports')
          .delete()
          .eq('account_id', accountId) as any,
        6000
      );

      if (accountName !== '') {
        await withDbTimeout(
          supabase
            .from('painelvm_strategy_reports')
            .delete()
            .ilike('description', `%${accountName}%`) as any,
          6000
        );
      }

      // 6.2 Excluir vínculos de robôs/estratégias da conta
      await withDbTimeout(
        supabase
          .from('painelvm_account_strategies')
          .delete()
          .eq('account_id', accountId) as any,
        6000
      );

      // 6.3 Excluir regras de Copy Trading (tanto se for Master quanto se for Slave)
      const orFilters = [`master_account_id.eq.${accountId}`, `slave_account_id.eq.${accountId}`];
      if (accountName !== '') {
        orFilters.push(`master_account_id.eq.${accountName}`);
        orFilters.push(`slave_account_id.eq.${accountName}`);
      }
      await withDbTimeout(
        supabase
          .from('painelvm_copy_trading_config')
          .delete()
          .or(orFilters.join(',')) as any,
        6000
      );

      // 6.4 Excluir a conta de broker
      await withDbTimeout(
        supabase
          .from('painelvm_broker_accounts')
          .delete()
          .eq('id', accountId) as any,
        6000
      );

      if (accountName !== '') {
        const user = await getAuthUser();
        let query = supabase.from('painelvm_broker_accounts').delete().ilike('account_name', accountName);
        if (user?.id) {
          query = query.eq('user_id', user.id);
        }
        await withDbTimeout(query as any, 6000);
      }
    } catch (errSupabase) {
      console.warn('[DB] Aviso na exclusão remota no Supabase:', errSupabase);
    }

    // 7. Sincronizar limpeza imediatamente com o Add-On do NinjaTrader 8
    await syncAllCopyRulesToNinjaTrader().catch(() => {});
    return true;
  } catch (err) {
    console.error('[DB] Erro ao deletar conta:', err);
    return false;
  }
}

export async function fetchAccountStrategiesSupabase(): Promise<AccountStrategy[]> {
  try {
    const localList = getLocalAccountStrategies();

    let dbData: any[] = [];
    try {
      const { data, error } = await withDbTimeout(
        supabase
          .from('painelvm_account_strategies')
          .select('*') as any,
        3500
      );
      if (!error && data) {
        dbData = data;
      }
    } catch (dbErr) {
      console.warn('[DB] Timeout ao buscar rotas de estratégias no Supabase. Usando local:', dbErr);
    }

    // Mescla rotas do banco com rotas locais de forma deduplicada por conta + estratégia/prompt
    const mergedMap = new Map<string, AccountStrategy>();
    const getRouteUniqueKey = (r: AccountStrategy) => `${r.account_id}_${r.manual_strategy_id || ''}_${r.prompt_id || ''}`;

    localList.forEach(r => mergedMap.set(getRouteUniqueKey(r), r));
    dbData.forEach(r => mergedMap.set(getRouteUniqueKey(r), r));

    const finalRoutes = Array.from(mergedMap.values());
    try {
      localStorage.setItem('vortex_account_strategies_local', JSON.stringify(finalRoutes));
    } catch (e) {}

    return finalRoutes;
  } catch (err) {
    console.error('[DB] Exceção ao buscar rotas de estratégias:', err);
    return getLocalAccountStrategies();
  }
}

export async function saveAccountStrategySupabase(params: {
  id?: string;
  account_id: string;
  prompt_id?: string | null;
  manual_strategy_id?: string | null;
  panel_id?: string | null;
  contract_size_multiplier: number;
  is_enabled: boolean;
}): Promise<AccountStrategy | null> {
  try {
    const localList = getLocalAccountStrategies();
    const existing = localList.find(r => 
      (params.id && r.id === params.id) ||
      (r.account_id === params.account_id && (
        (params.manual_strategy_id && r.manual_strategy_id === params.manual_strategy_id) ||
        (params.prompt_id && r.prompt_id === params.prompt_id)
      ))
    );

    const stratId = params.id || existing?.id || generateSecureUUID();
    const payload: AccountStrategy = {
      id: stratId,
      account_id: params.account_id,
      prompt_id: params.prompt_id || null,
      manual_strategy_id: params.manual_strategy_id || null,
      contract_size_multiplier: Number(params.contract_size_multiplier) || 1.0,
      is_enabled: params.is_enabled !== undefined ? params.is_enabled : true,
      created_at: existing?.created_at || new Date().toISOString()
    };

    saveLocalAccountStrategy(payload);

    // Sync com Supabase
    (async () => {
      try {
        await withDbTimeout(
          supabase
            .from('painelvm_account_strategies')
            .upsert(payload, { onConflict: 'id' }) as any,
          3500
        );
      } catch (err) {
        console.warn('[DB] Rota de estratégia salva localmente (aviso Supabase):', err);
      }
    })();

    return payload;
  } catch (err) {
    console.error('[DB] Exceção ao salvar rota de estratégia:', err);
    return null;
  }
}

// ================================================================
// ESTADO DO GRÁFICO POR CONTA E ATIVO (painelvm_account_chart_state)
// Indicadores Ativos, Widgets e Timeframe Persistidos na Nuvem
// ================================================================
export interface AccountChartState {
  indicators?: IndicatorConfig[];
  widgets?: WidgetConfig[];
  timeframe?: number;
}

export async function fetchAccountChartStateSupabase(
  accountId: string,
  symbol: string
): Promise<AccountChartState | null> {
  const accKey = accountId || 'default';
  const symKey = symbol || 'default';
  const indKey = `vortex_active_indicators_${accKey}_${symKey}`;
  const widKey = `vortex_active_widgets_${accKey}_${symKey}`;

  let localInds: IndicatorConfig[] | undefined = undefined;
  let localWids: WidgetConfig[] | undefined = undefined;

  try {
    const rawInd = localStorage.getItem(indKey) || localStorage.getItem(`vortex_active_indicators_${symKey}`);
    if (rawInd) localInds = JSON.parse(rawInd);
  } catch {}

  try {
    const rawWid = localStorage.getItem(widKey) || localStorage.getItem(`vortex_active_widgets_${symKey}`);
    if (rawWid) localWids = JSON.parse(rawWid);
  } catch {}

  try {
    const user = await getAuthUser();
    if (!user || !user.id) {
      return { indicators: localInds, widgets: localWids };
    }

    const rowId = `chart_${accKey}_${symKey}`;
    const { data, error } = await withDbTimeout(
      supabase
        .from('painelvm_account_chart_state')
        .select('*')
        .eq('id', rowId)
        .maybeSingle() as any,
      3500
    );

    if (!error && data) {
      const remoteInds: IndicatorConfig[] = typeof data.indicators === 'string' ? JSON.parse(data.indicators) : data.indicators;
      const remoteWids: WidgetConfig[] = typeof data.widgets === 'string' ? JSON.parse(data.widgets) : data.widgets;
      const remoteTf: number = data.timeframe || 1;

      if (Array.isArray(remoteInds)) {
        try {
          localStorage.setItem(indKey, JSON.stringify(remoteInds));
          localStorage.setItem(`vortex_active_indicators_${symKey}`, JSON.stringify(remoteInds));
        } catch {}
      }
      if (Array.isArray(remoteWids)) {
        try {
          localStorage.setItem(widKey, JSON.stringify(remoteWids));
          localStorage.setItem(`vortex_active_widgets_${symKey}`, JSON.stringify(remoteWids));
        } catch {}
      }

      return {
        indicators: Array.isArray(remoteInds) ? remoteInds : localInds,
        widgets: Array.isArray(remoteWids) ? remoteWids : localWids,
        timeframe: remoteTf
      };
    }

    // Auto-migração: se existe no cache local mas não no banco, salva no Supabase
    if ((localInds && localInds.length > 0) || (localWids && localWids.length > 0)) {
      saveAccountChartStateSupabase(accKey, symKey, { indicators: localInds, widgets: localWids }).catch(() => {});
    }

    return { indicators: localInds, widgets: localWids };
  } catch (err) {
    return { indicators: localInds, widgets: localWids };
  }
}

export async function saveAccountChartStateSupabase(
  accountId: string,
  symbol: string,
  state: { indicators?: IndicatorConfig[]; widgets?: WidgetConfig[]; timeframe?: number }
): Promise<boolean> {
  const accKey = accountId || 'default';
  const symKey = symbol || 'default';
  const indKey = `vortex_active_indicators_${accKey}_${symKey}`;
  const widKey = `vortex_active_widgets_${accKey}_${symKey}`;

  // Salvar no cache local imediatamente (0ms)
  try {
    if (state.indicators) {
      localStorage.setItem(indKey, JSON.stringify(state.indicators));
      localStorage.setItem(`vortex_active_indicators_${symKey}`, JSON.stringify(state.indicators));
    }
    if (state.widgets) {
      localStorage.setItem(widKey, JSON.stringify(state.widgets));
      localStorage.setItem(`vortex_active_widgets_${symKey}`, JSON.stringify(state.widgets));
    }
  } catch {}

  try {
    const user = await getAuthUser();
    if (!user || !user.id) return true;

    const rowId = `chart_${accKey}_${symKey}`;
    const payload: any = {
      id: rowId,
      user_id: user.id,
      account_id: accKey,
      symbol: symKey,
      updated_at: new Date().toISOString()
    };
    if (state.indicators !== undefined) payload.indicators = state.indicators;
    if (state.widgets !== undefined) payload.widgets = state.widgets;
    if (state.timeframe !== undefined) payload.timeframe = state.timeframe;

    await withDbTimeout(
      supabase
        .from('painelvm_account_chart_state')
        .upsert(payload, { onConflict: 'id' }) as any,
      3500
    );
    return true;
  } catch (err) {
    return true;
  }
}

export async function deleteAccountStrategySupabase(id: string): Promise<boolean> {
  try {
    // Exclui localmente de forma instantânea (0ms de bloqueio de UI)
    deleteLocalAccountStrategy(id);

    // Sync com Supabase em background com timeout
    (async () => {
      try {
        await withDbTimeout(
          supabase
            .from('painelvm_account_strategies')
            .delete()
            .eq('id', id) as any,
          3500
        );
      } catch (err) {
        console.warn('[DB] Rota deletada localmente (aviso Supabase):', err);
      }
    })();

    return true;
  } catch (err) {
    console.error('[DB] Exceção ao deletar rota de estratégia:', err);
    deleteLocalAccountStrategy(id);
    return true;
  }
}

const COPY_CONFIGS_STORAGE_KEY = 'vortex_copy_trading_configs';

export function getLocalCopyTradingConfigs(): CopyTradingConfig[] {
  try {
    const subId = typeof localStorage !== 'undefined' ? (localStorage.getItem('vortex_subscription_id') || 'default') : 'default';
    const raw = (typeof localStorage !== 'undefined' && localStorage.getItem(`vortex_copy_trading_configs_${subId}`)) || 
                (typeof localStorage !== 'undefined' && localStorage.getItem(COPY_CONFIGS_STORAGE_KEY));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalCopyTradingConfigs(configs: CopyTradingConfig[]) {
  try {
    const subId = typeof localStorage !== 'undefined' ? (localStorage.getItem('vortex_subscription_id') || 'default') : 'default';
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`vortex_copy_trading_configs_${subId}`, JSON.stringify(configs));
      localStorage.setItem(COPY_CONFIGS_STORAGE_KEY, JSON.stringify(configs));
    }
    // Auto-sync com o Add-On do NinjaTrader em background
    syncAllCopyRulesToNinjaTrader().catch(() => {});
  } catch {}
}

let lastSyncedRulesPayload = '';
let lastSyncedRiskPayload = '';

export async function syncAllCopyRulesToNinjaTrader(_force?: boolean): Promise<boolean> {
  try {
    const status = await checkNinjaStatus();
    if (status.status !== 'online') {
      return false;
    }

    const allAccounts = getLocalBrokerAccounts();
    const copyConfigs = getLocalCopyTradingConfigs();

    // 🔒 Envia para a gestão de risco do NT8 APENAS contas NinjaTrader sincronizadas que estão ATIVAS
    const ninjaAccounts = allAccounts.filter(a => isNinjaExecutionAccount(a) && a.is_active !== false);

    const accountRisks = ninjaAccounts.map(a => ({
      account_name: a.account_name,
      daily_loss_limit: Number(a.trader_daily_stop_loss_usd || a.daily_stop_loss_usd || 0),
      daily_profit_target: Number(a.trader_daily_take_profit_usd || a.daily_max_gain_usd || 0),
      max_daily_trades: (a.manual_max_daily_trades !== undefined && a.manual_max_daily_trades !== null && (a.manual_max_daily_trades as any) !== '')
        ? Number(a.manual_max_daily_trades)
        : ((a.daily_max_entries !== undefined && a.daily_max_entries !== null && (a.daily_max_entries as any) !== '') ? Number(a.daily_max_entries) : 0),
      max_lots: Number(a.manual_max_lots || 0),
      trading_start_time: a.manual_start_time || '',
      trading_end_time: a.manual_end_time || '',
      allow_multi_signals: a.allow_multi_signals !== false
    }));

    // 🛡️ Sincroniza o monitor de gestão de risco do NinjaTrader apenas se houver alterações reais
    const riskPayloadStr = JSON.stringify(accountRisks);
    if (_force || riskPayloadStr !== lastSyncedRiskPayload) {
      try {
        const ok = await syncNinjaAccountsRisk(accountRisks);
        if (ok) lastSyncedRiskPayload = riskPayloadStr;
      } catch (riskErr) {
        console.warn('[NinjaGateway] Aviso ao sincronizar risco de contas com NinjaTrader:', riskErr);
      }
    }

    const ninjaRules: NinjaCopyRule[] = [];
    const seenPairs = new Set<string>();

    for (const c of (copyConfigs || [])) {
      const masterAcc = allAccounts.find(a => a.id === c.master_account_id || a.account_name === c.master_account_id);
      const slaveAcc = allAccounts.find(a => a.id === c.slave_account_id || a.account_name === c.slave_account_id);

      const masterName = (masterAcc?.account_name || c.master_account_id || '').trim();
      const slaveName = (slaveAcc?.account_name || c.slave_account_id || '').trim();

      if (!masterName || !slaveName) continue;

      const pairKey = `${masterName.toLowerCase()}::${slaveName.toLowerCase()}`;
      if (seenPairs.has(pairKey)) continue; // Deduplicação estrita Master -> Slave
      seenPairs.add(pairKey);

      // Uma regra só é considerada ativa se a regra em si estiver ativa E tanto Master quanto Slave estiverem ativas
      const isMasterActive = masterAcc ? (masterAcc.is_active !== false) : true;
      const isSlaveActive = slaveAcc ? (slaveAcc.is_active !== false) : true;
      const isRuleActive = (c.is_active !== false) && isMasterActive && isSlaveActive;

      ninjaRules.push({
        id: c.id,
        masterAccount: masterName,
        slaveAccount: slaveName,
        lotMultiplier: Number(c.lot_multiplier || 1),
        isActive: isRuleActive,
        allowedSymbols: c.allowed_symbols || 'TODOS',
        executionSymbol: slaveAcc?.execution_symbol || undefined,
        symbolMapping: slaveAcc?.symbol_mapping || undefined,
        maxDailyLoss: Number(slaveAcc?.trader_daily_stop_loss_usd || slaveAcc?.daily_stop_loss_usd || 0),
        dailyProfitTarget: Number(slaveAcc?.trader_daily_take_profit_usd || slaveAcc?.daily_max_gain_usd || 0),
        maxDailyTrades: (slaveAcc?.manual_max_daily_trades !== undefined && slaveAcc?.manual_max_daily_trades !== null && (slaveAcc?.manual_max_daily_trades as any) !== '')
          ? Number(slaveAcc.manual_max_daily_trades)
          : ((slaveAcc?.daily_max_entries !== undefined && slaveAcc?.daily_max_entries !== null && (slaveAcc?.daily_max_entries as any) !== '') ? Number(slaveAcc.daily_max_entries) : 0),
        copyAtmStrategy: c.copy_atm_strategy !== false,
        closeSlavesOnMasterClose: c.close_slaves_on_master_close !== false,
        cancelOrphanOrders: c.cancel_orphan_orders === true
      });
    }

    // ⚡ Otimização Inteligente: Se as regras não mudaram, não reenvia RPC e não reescreve disco no NinjaTrader
    const rulesPayloadStr = JSON.stringify(ninjaRules);
    if (!_force && rulesPayloadStr === lastSyncedRulesPayload) {
      return true;
    }

    const syncOk = await syncNinjaCopyRules(ninjaRules, accountRisks);
    if (syncOk) {
      lastSyncedRulesPayload = rulesPayloadStr;
    }
    return syncOk;
  } catch (err) {
    console.warn('[NinjaGateway] Erro ao sincronizar regras de copy com NinjaTrader:', err);
    return false;
  }
}

export function resolveAccountUuid(accountIdentifier: string, userId?: string): string {
  if (!accountIdentifier) return '';
  const clean = accountIdentifier.trim();
  if (isValidUUID(clean)) return clean;

  const allAccounts = getLocalBrokerAccounts();
  const found = allAccounts.find(
    a => a.id === clean || a.account_name?.trim().toLowerCase() === clean.toLowerCase()
  );
  if (found && isValidUUID(found.id)) {
    return found.id;
  }

  // Se não encontrar ou o id não for UUID, gera um novo UUID e registra a conta
  const newUuid = generateSecureUUID();
  const newAcc: BrokerAccount = {
    id: newUuid,
    user_id: userId || 'local_user',
    account_type: 'internal_demo',
    platform: 'nt8',
    account_name: clean,
    balance: 50000,
    initial_balance: 50000,
    currency: 'USD',
    is_master: false,
    is_active: true,
    dd_mode: 'intraday_trailing',
    max_drawdown_usd: 2500,
    daily_stop_loss_usd: 1000,
    high_watermark: 50000,
    eod_baseline_balance: 50000,
    enforce_dd_lockout: true,
    status: 'active',
    created_at: new Date().toISOString()
  };
  saveLocalBrokerAccount(newAcc);
  return newUuid;
}

export async function fetchCopyTradingConfigsSupabase(_providedAccounts?: BrokerAccount[]): Promise<CopyTradingConfig[]> {
  try {
    const local = getLocalCopyTradingConfigs();
    const user = await getAuthUser();

    const { data, error } = await withDbTimeout(
      supabase
        .from('painelvm_copy_trading_config')
        .select('*'),
      5000
    );

    if (error) {
      console.warn('[DB] Erro ao buscar copy trading no Supabase:', error.message);
      return local;
    }

    if (data !== null && Array.isArray(data)) {
      const localAccs = getLocalBrokerAccounts();
      const currentAccounts: BrokerAccount[] = (_providedAccounts && _providedAccounts.length > 0)
        ? _providedAccounts
        : localAccs;

      const currentAccIds = new Set(currentAccounts.map(a => a.id));
      const currentAccNames = new Set(currentAccounts.map(a => (a.account_name || '').trim().toLowerCase()));

      // Regras que pertencem às contas do usuário OU foram criadas pelo usuário logado
      const filteredConfigs = data.filter(c => {
        if (user?.id && c.user_id && c.user_id === user.id) return true;
        const m = (c.master_account_id || '').trim().toLowerCase();
        const s = (c.slave_account_id || '').trim().toLowerCase();
        return (
          currentAccIds.has(c.master_account_id) ||
          currentAccIds.has(c.slave_account_id) ||
          currentAccNames.has(m) ||
          currentAccNames.has(s)
        );
      });

      const isSamePair = (c1: CopyTradingConfig, c2: CopyTradingConfig) => {
        if (c1.id === c2.id) return true;
        const m1 = (c1.master_account_id || c1.master_account_name || '').trim().toLowerCase();
        const m2 = (c2.master_account_id || c2.master_account_name || '').trim().toLowerCase();
        const s1 = (c1.slave_account_id || c1.slave_account_name || '').trim().toLowerCase();
        const s2 = (c2.slave_account_id || c2.slave_account_name || '').trim().toLowerCase();
        const accM1 = currentAccounts.find(a => a.id.toLowerCase() === m1 || a.account_name?.toLowerCase() === m1)?.account_name?.toLowerCase() || m1;
        const accM2 = currentAccounts.find(a => a.id.toLowerCase() === m2 || a.account_name?.toLowerCase() === m2)?.account_name?.toLowerCase() || m2;
        const accS1 = currentAccounts.find(a => a.id.toLowerCase() === s1 || a.account_name?.toLowerCase() === s1)?.account_name?.toLowerCase() || s1;
        const accS2 = currentAccounts.find(a => a.id.toLowerCase() === s2 || a.account_name?.toLowerCase() === s2)?.account_name?.toLowerCase() || s2;
        return accM1.length > 0 && accM1 === accM2 && accS1.length > 0 && accS1 === accS2;
      };

      // Preserva os campos ricos salvos no localStorage e enriquece com nomes legíveis
      const mergedConfigs: CopyTradingConfig[] = filteredConfigs.map(dbRule => {
        const localMatch = local.find(l => isSamePair(l, dbRule));
        const mAcc = currentAccounts.find(a => a.id === dbRule.master_account_id || a.account_name?.trim().toLowerCase() === (dbRule.master_account_id || '').trim().toLowerCase());
        const sAcc = currentAccounts.find(a => a.id === dbRule.slave_account_id || a.account_name?.trim().toLowerCase() === (dbRule.slave_account_id || '').trim().toLowerCase());

        return {
          ...dbRule,
          master_account_name: mAcc?.account_name || localMatch?.master_account_name || dbRule.master_account_name || dbRule.master_account_id,
          slave_account_name: sAcc?.account_name || localMatch?.slave_account_name || dbRule.slave_account_name || dbRule.slave_account_id,
          allowed_symbols: dbRule.allowed_symbols !== undefined && dbRule.allowed_symbols !== null ? dbRule.allowed_symbols : (localMatch?.allowed_symbols || 'TODOS'),
          copy_atm_strategy: dbRule.copy_atm_strategy !== undefined && dbRule.copy_atm_strategy !== null ? Boolean(dbRule.copy_atm_strategy) : (localMatch?.copy_atm_strategy !== false),
          close_slaves_on_master_close: dbRule.close_slaves_on_master_close !== undefined && dbRule.close_slaves_on_master_close !== null ? Boolean(dbRule.close_slaves_on_master_close) : (localMatch?.close_slaves_on_master_close !== undefined ? localMatch.close_slaves_on_master_close : true),
          cancel_orphan_orders: dbRule.cancel_orphan_orders !== undefined && dbRule.cancel_orphan_orders !== null ? Boolean(dbRule.cancel_orphan_orders) : (localMatch?.cancel_orphan_orders === true)
        };
      });

      // Preserva também qualquer regra local recente ainda não sincronizada
      for (const loc of local) {
        if (!mergedConfigs.some(m => isSamePair(m, loc))) {
          mergedConfigs.push(loc);
        }
      }

      // Deduplicação estrita de pares Master -> Slave para garantir contagem exata
      const finalDeduplicated: CopyTradingConfig[] = [];
      for (const c of mergedConfigs) {
        const idx = finalDeduplicated.findIndex(existing => isSamePair(existing, c));
        if (idx >= 0) {
          finalDeduplicated[idx] = c;
        } else {
          finalDeduplicated.push(c);
        }
      }

      saveLocalCopyTradingConfigs(finalDeduplicated);
      return finalDeduplicated;
    }
    return local;
  } catch (err) {
    console.error('[DB] Exceção ao buscar configurações de copy trade:', err);
    return getLocalCopyTradingConfigs();
  }
}

// Helper interno: garante que uma conta local (Axion ou NINJA) existe no Supabase
// antes de qualquer operação que dependa de FK em painelvm_broker_accounts.
async function ensureAccountInSupabase(accountId: string, userId: string): Promise<boolean> {
  const localAccounts = getLocalBrokerAccounts();
  const acc = localAccounts.find(a => a.id === accountId || a.account_name === accountId);
  if (!acc) {
    try {
      let query = supabase.from('painelvm_broker_accounts').select('id');
      if (isValidUUID(accountId)) {
        query = query.or(`id.eq.${accountId},account_name.eq.${accountId}`);
      } else {
        query = query.eq('account_name', accountId);
      }
      const { data } = await query.maybeSingle();
      if (data) return true;
    } catch { }
    return false;
  }

  const storedSubscriptionId = typeof localStorage !== 'undefined' ? localStorage.getItem('vortex_subscription_id') : null;
  const subNumeric = storedSubscriptionId && !isNaN(Number(storedSubscriptionId)) ? Number(storedSubscriptionId) : null;

  const payload: any = {
    id: acc.id,
    user_id: userId,
    account_type: acc.account_type || 'internal_demo',
    account_name: acc.account_name,
    balance: acc.balance ?? 50000,
    initial_balance: acc.initial_balance ?? 50000,
    high_watermark: acc.high_watermark ?? 50000,
    eod_baseline_balance: acc.eod_baseline_balance ?? 50000,
    dd_mode: acc.dd_mode || 'intraday_trailing',
    max_drawdown_usd: acc.max_drawdown_usd ?? 2500,
    daily_stop_loss_usd: acc.daily_stop_loss_usd ?? 1000,
    daily_max_gain_usd: acc.daily_max_gain_usd ?? 2000,
    daily_max_entries: acc.daily_max_entries ?? 0,
    allow_multi_signals: acc.allow_multi_signals ?? true,
    is_master: acc.is_master ?? false,
    is_active: acc.is_active ?? true,
    status: acc.status || 'active',
    tradovate_account_id: subNumeric
  };

  try {
    const { error } = await supabase
      .from('painelvm_broker_accounts')
      .upsert([payload], { onConflict: 'id' });

    if (error) {
      console.warn(`[DB] Tentando safe payload para "${acc.account_name}":`, error.message);
      const safePayload = {
        id: acc.id,
        user_id: userId,
        account_type: 'internal_demo',
        account_name: acc.account_name,
        balance: acc.balance ?? 50000,
        initial_balance: acc.initial_balance ?? 50000,
        high_watermark: acc.high_watermark ?? 50000,
        eod_baseline_balance: acc.eod_baseline_balance ?? 50000,
        dd_mode: acc.dd_mode || 'intraday_trailing',
        max_drawdown_usd: acc.max_drawdown_usd ?? 2500,
        daily_stop_loss_usd: acc.daily_stop_loss_usd ?? 1000,
        status: 'active',
        tradovate_account_id: subNumeric
      };
      const res = await supabase
        .from('painelvm_broker_accounts')
        .upsert([safePayload], { onConflict: 'id' });

      if (res.error) {
        console.error(`[DB] Falha ao upsert conta "${acc.account_name}" no Supabase:`, res.error);
        return false;
      }
    }
    return true;
  } catch (e) {
    console.error(`[DB] Exceção ao garantir conta "${acc.account_name}" no Supabase:`, e);
    return false;
  }
}

export async function saveCopyTradingConfigSupabase(params: {
  id?: string;
  master_account_id: string;
  slave_account_id: string;
  lot_multiplier: number;
  allowed_symbols?: string;
  copy_manual_trades?: boolean;
  copy_algo_trades?: boolean;
  copy_atm_strategy?: boolean;
  close_slaves_on_master_close?: boolean;
  cancel_orphan_orders?: boolean;
  is_active: boolean;
  created_at?: string;
}): Promise<CopyTradingConfig> {
  const [saved] = await saveBatchCopyTradingConfigsSupabase([params]);
  return saved;
}

export async function saveBatchCopyTradingConfigsSupabase(
  configs: Array<{
    id?: string;
    master_account_id: string;
    slave_account_id: string;
    lot_multiplier: number;
    allowed_symbols?: string;
    copy_manual_trades?: boolean;
    copy_algo_trades?: boolean;
    copy_atm_strategy?: boolean;
    close_slaves_on_master_close?: boolean;
    cancel_orphan_orders?: boolean;
    is_active: boolean;
    created_at?: string;
  }>
): Promise<CopyTradingConfig[]> {
  const user = await getAuthUser();
  const allAccounts = getLocalBrokerAccounts();

  const fullConfigs: CopyTradingConfig[] = configs.map(params => {
    const masterAcc = allAccounts.find(a => a.id === params.master_account_id || a.account_name === params.master_account_id);
    const slaveAcc = allAccounts.find(a => a.id === params.slave_account_id || a.account_name === params.slave_account_id);

    const masterId = masterAcc?.id || (isValidUUID(params.master_account_id) ? params.master_account_id : resolveAccountUuid(params.master_account_id, user?.id));
    const slaveId = slaveAcc?.id || (isValidUUID(params.slave_account_id) ? params.slave_account_id : resolveAccountUuid(params.slave_account_id, user?.id));
    const ruleId = params.id ? params.id : generateSecureUUID();

    return {
      id: ruleId,
      master_account_id: masterId,
      slave_account_id: slaveId,
      master_account_name: masterAcc?.account_name || (params as any).master_account_name || params.master_account_id,
      slave_account_name: slaveAcc?.account_name || (params as any).slave_account_name || params.slave_account_id,
      lot_multiplier: Number(params.lot_multiplier) || 1.0,
      allowed_symbols: params.allowed_symbols || 'TODOS',
      copy_manual_trades: params.copy_manual_trades !== false,
      copy_algo_trades: params.copy_algo_trades !== false,
      copy_atm_strategy: params.copy_atm_strategy !== false,
      close_slaves_on_master_close: params.close_slaves_on_master_close !== false,
      cancel_orphan_orders: params.cancel_orphan_orders === true,
      is_active: params.is_active !== false,
      created_at: params.created_at || new Date().toISOString()
    };
  });

  // 1. Salva IMEDIATAMENTE no LocalStorage em lote único (< 1ms)
  const localConfigs = getLocalCopyTradingConfigs();
  const updatedList = [...localConfigs];

  const isSameAccount = (idA: string, idB: string) => {
    if (idA === idB) return true;
    const accA = allAccounts.find(a => a.id === idA || a.account_name === idA);
    const accB = allAccounts.find(a => a.id === idB || a.account_name === idB);
    if (accA && accB && accA.id === accB.id) return true;
    if (accA && (accA.account_name === idB || accA.id === idB)) return true;
    if (accB && (accB.account_name === idA || accB.id === idA)) return true;
    return false;
  };

  for (const fullConfig of fullConfigs) {
    const existingIdx = updatedList.findIndex(
      c => c.id === fullConfig.id || (isSameAccount(c.master_account_id, fullConfig.master_account_id) && isSameAccount(c.slave_account_id, fullConfig.slave_account_id))
    );
    if (existingIdx >= 0) {
      updatedList[existingIdx] = fullConfig;
    } else {
      updatedList.push(fullConfig);
    }
  }
  saveLocalCopyTradingConfigs(updatedList);

  // 2. Persistência no Supabase com sincronização síncrona/aguardada para evitar conflito de leitura obsoleto
  try {
    if (user?.id) {
      const distinctAccs = Array.from(new Set([
        ...fullConfigs.map(c => c.master_account_id),
        ...fullConfigs.map(c => c.slave_account_id)
      ])).filter(isValidUUID);

      await Promise.all(distinctAccs.map(accId => ensureAccountInSupabase(accId, user.id)));

      // Consulta regras existentes no Supabase para reutilizar o ID existente se houver conflito de par (master, slave)
      let existingDbRules: Array<{ id: string; master_account_id: string; slave_account_id: string }> = [];
      try {
        const { data: dbRules } = await withDbTimeout(
          supabase.from('painelvm_copy_trading_config').select('id, master_account_id, slave_account_id'),
          3500
        );
        if (dbRules && Array.isArray(dbRules)) {
          existingDbRules = dbRules;
        }
      } catch {}

      // Se já existe uma regra no Supabase para esse mesmo par Master->Slave, preserva o ID do banco
      for (const fc of fullConfigs) {
        const dbMatch = existingDbRules.find(r => 
          (r.master_account_id === fc.master_account_id && r.slave_account_id === fc.slave_account_id) ||
          r.id === fc.id
        );
        if (dbMatch) {
          fc.id = dbMatch.id;
        }
      }

      // Tentativa 1: Payload rico com user_id
      const richWithUser = fullConfigs.map(c => ({
        id: c.id,
        user_id: user.id,
        master_account_id: c.master_account_id,
        slave_account_id: c.slave_account_id,
        lot_multiplier: Number(c.lot_multiplier) || 1.0,
        allowed_symbols: c.allowed_symbols || 'TODOS',
        copy_manual_trades: c.copy_manual_trades !== false,
        copy_algo_trades: c.copy_algo_trades !== false,
        copy_atm_strategy: c.copy_atm_strategy !== false,
        close_slaves_on_master_close: c.close_slaves_on_master_close !== false,
        cancel_orphan_orders: c.cancel_orphan_orders === true,
        is_active: c.is_active !== false
      }));

      let { error: saveErr } = await withDbTimeout(
        supabase
          .from('painelvm_copy_trading_config')
          .upsert(richWithUser, { onConflict: 'id' }),
        5000
      );

      // Tentativa 2: Payload rico sem user_id (se coluna user_id não existir na tabela)
      if (saveErr) {
        console.warn('[DB] Tentativa 1 falhou, tentando Payload rico sem user_id:', saveErr.message);
        const richWithoutUser = richWithUser.map(({ user_id, ...rest }) => rest);
        const res2 = await withDbTimeout(
          supabase
            .from('painelvm_copy_trading_config')
            .upsert(richWithoutUser, { onConflict: 'id' }),
          5000
        );
        saveErr = res2.error;
      }

      // Tentativa 3: Payload básico com user_id
      if (saveErr) {
        console.warn('[DB] Tentativa 2 falhou, tentando Payload básico com user_id:', saveErr.message);
        const basicWithUser = fullConfigs.map(c => ({
          id: c.id,
          user_id: user.id,
          master_account_id: c.master_account_id,
          slave_account_id: c.slave_account_id,
          lot_multiplier: Number(c.lot_multiplier) || 1.0,
          copy_manual_trades: c.copy_manual_trades !== false,
          copy_algo_trades: c.copy_algo_trades !== false,
          is_active: c.is_active !== false
        }));
        const res3 = await withDbTimeout(
          supabase
            .from('painelvm_copy_trading_config')
            .upsert(basicWithUser, { onConflict: 'id' }),
          5000
        );
        saveErr = res3.error;
      }

      // Tentativa 4: Payload básico sem user_id
      if (saveErr) {
        console.warn('[DB] Tentativa 3 falhou, tentando Payload básico sem user_id:', saveErr.message);
        const basicWithoutUser = fullConfigs.map(c => ({
          id: c.id,
          master_account_id: c.master_account_id,
          slave_account_id: c.slave_account_id,
          lot_multiplier: Number(c.lot_multiplier) || 1.0,
          copy_manual_trades: c.copy_manual_trades !== false,
          copy_algo_trades: c.copy_algo_trades !== false,
          is_active: c.is_active !== false
        }));
        const res4 = await withDbTimeout(
          supabase
            .from('painelvm_copy_trading_config')
            .upsert(basicWithoutUser, { onConflict: 'id' }),
          5000
        );
        saveErr = res4.error;
      }

      if (saveErr) {
        console.error('[DB] ERRO CRÍTICO ao salvar regras de copy trading no Supabase:', saveErr);
      } else {
        console.log('[DB] ✅ Regras de Copy Trading salvas com sucesso no Supabase!');
      }
    }
  } catch (err) {
    console.warn('[DB] Erro ao sincronizar lote de copy trading no Supabase:', err);
  }

  // 3. Atualização forçada instantânea para o NinjaTrader 8
  await syncAllCopyRulesToNinjaTrader(true).catch(() => {});

  return updatedList;
}

export async function deleteCopyTradingConfigSupabase(id: string): Promise<boolean> {
  try {
    const localConfigs = getLocalCopyTradingConfigs();
    const target = localConfigs.find(c => c.id === id);
    const updatedList = localConfigs.filter(c => c.id !== id);
    saveLocalCopyTradingConfigs(updatedList);

    // Executa exclusão no Supabase aguardando conclusão para integridade de dados
    try {
      if (isValidUUID(id)) {
        await withDbTimeout(
          supabase
            .from('painelvm_copy_trading_config')
            .delete()
            .eq('id', id),
          4000
        );
      }
      if (target) {
        const allAccs = getLocalBrokerAccounts();
        const mAcc = allAccs.find(a => a.id === target.master_account_id || a.account_name === target.master_account_id);
        const sAcc = allAccs.find(a => a.id === target.slave_account_id || a.account_name === target.slave_account_id);
        const mIds = Array.from(new Set([target.master_account_id, mAcc?.id, mAcc?.account_name].filter(Boolean))) as string[];
        const sIds = Array.from(new Set([target.slave_account_id, sAcc?.id, sAcc?.account_name].filter(Boolean))) as string[];
        for (const m of mIds) {
          for (const s of sIds) {
            await withDbTimeout(
              supabase
                .from('painelvm_copy_trading_config')
                .delete()
                .match({ master_account_id: m, slave_account_id: s }),
              3000
            ).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn('[DB] Erro ao deletar copy trading no Supabase:', err);
    }

    await syncAllCopyRulesToNinjaTrader(true).catch(() => {});
    return true;
  } catch (err) {
    console.warn('[DB] Erro ao deletar copy trading:', err);
    await syncAllCopyRulesToNinjaTrader(true).catch(() => {});
    return true;
  }
}

export async function deleteBatchCopyTradingConfigsSupabase(ids: string[]): Promise<boolean> {
  try {
    const validIds = ids.filter(Boolean);
    if (validIds.length === 0) return true;

    const localConfigs = getLocalCopyTradingConfigs();
    const updatedList = localConfigs.filter(c => !validIds.includes(c.id));
    saveLocalCopyTradingConfigs(updatedList);

    // Executa exclusão em lote no Supabase
    try {
      const uuidList = validIds.filter(isValidUUID);
      if (uuidList.length > 0) {
        await withDbTimeout(
          supabase
            .from('painelvm_copy_trading_config')
            .delete()
            .in('id', uuidList),
          4000
        );
      }
    } catch (err) {
      console.warn('[DB] Erro ao deletar lote de copy trading no Supabase:', err);
    }

    await syncAllCopyRulesToNinjaTrader(true).catch(() => {});
    return true;
  } catch (err) {
    console.warn('[DB] Erro ao deletar lote de copy trading:', err);
    await syncAllCopyRulesToNinjaTrader(true).catch(() => {});
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 📡 COPY REMOTO: Funções de Inscrição e Seguir Contas / Estratégias Externas
// ─────────────────────────────────────────────────────────────────────────────

const REMOTE_COPY_STORAGE_KEY = 'vortex_remote_copy_subscriptions';

export function getLocalRemoteCopySubscriptions(): RemoteCopySubscription[] {
  try {
    const raw = localStorage.getItem(REMOTE_COPY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalRemoteCopySubscriptions(list: RemoteCopySubscription[]): void {
  try {
    localStorage.setItem(REMOTE_COPY_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export async function fetchRemoteCopySubscriptionsSupabase(): Promise<RemoteCopySubscription[]> {
  const localList = getLocalRemoteCopySubscriptions();
  try {
    const user = await getAuthUser();
    if (!user) return localList;

    const { data, error } = await supabase
      .from('painelvm_remote_copy_config')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      saveLocalRemoteCopySubscriptions(data);
      return data;
    }
    return localList;
  } catch (err) {
    console.warn('[DB] Usando cache local para Remote Copy configs:', err);
    return localList;
  }
}

export async function saveRemoteCopySubscriptionSupabase(params: {
  account_id: string;
  remote_source_id: string;
  label?: string;
  lot_multiplier: number;
  is_active: boolean;
  id?: string;
}): Promise<RemoteCopySubscription | null> {
  const localList = getLocalRemoteCopySubscriptions();
  const subId = params.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `rc_${Date.now()}`);
  
  const newSub: RemoteCopySubscription = {
    id: subId,
    account_id: params.account_id,
    remote_source_id: params.remote_source_id.trim(),
    label: params.label?.trim() || 'Inscrição Remota',
    lot_multiplier: Number(params.lot_multiplier) || 1,
    is_active: params.is_active !== undefined ? params.is_active : true,
    created_at: new Date().toISOString()
  };

  const existingIdx = localList.findIndex(s => s.id === newSub.id || (s.account_id === newSub.account_id && s.remote_source_id === newSub.remote_source_id));
  if (existingIdx >= 0) {
    localList[existingIdx] = { ...localList[existingIdx], ...newSub };
  } else {
    localList.unshift(newSub);
  }
  saveLocalRemoteCopySubscriptions(localList);

  try {
    const user = await getAuthUser();
    if (user) {
      await ensureAccountInSupabase(params.account_id, user.id);
      await supabase
        .from('painelvm_remote_copy_config')
        .upsert([{
          id: newSub.id,
          user_id: user.id,
          account_id: newSub.account_id,
          remote_source_id: newSub.remote_source_id,
          label: newSub.label,
          lot_multiplier: newSub.lot_multiplier,
          is_active: newSub.is_active
        }], { onConflict: 'id' });
    }
  } catch (err) {
    console.warn('[DB] Inscrição remota salva localmente (aviso Supabase):', err);
  }

  return newSub;
}

export async function deleteRemoteCopySubscriptionSupabase(id: string): Promise<boolean> {
  const localList = getLocalRemoteCopySubscriptions().filter(s => s.id !== id);
  saveLocalRemoteCopySubscriptions(localList);

  try {
    await supabase
      .from('painelvm_remote_copy_config')
      .delete()
      .eq('id', id);
  } catch {}

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🌐 NINJATRADER 8 CLOUD BRIDGE: Sincronização e Comandos Remotos (PC ⇄ Mobile)
// ─────────────────────────────────────────────────────────────────────────────

export interface NinjaLiveBridgeSnapshot {
  updatedAt: string;
  isOnline: boolean;
  latencyMs: number;
  accounts: any[];
  positions: any[];
  orders: any[];
  performance?: any[];
  metricsMap?: Record<string, NinjaAccountMetricsSnapshot>;
  copyMessages?: CopyTradingMessage[];
}

export interface NinjaRemoteCommand {
  id: string;
  type: 'CLOSE_POSITION' | 'CANCEL_ORDER' | 'CANCEL_ALL_ORDERS' | 'FLATTEN_ALL';
  account?: string;
  symbol?: string;
  orderId?: string;
  createdAt: string;
  executedAt?: string | null;
}

let cachedLiveBridgeSnapshot: NinjaLiveBridgeSnapshot | null = null;
let lastLiveBridgeFetchTime = 0;

/**
 * Salva o snapshot completo do NinjaTrader 8 na nuvem (executado pelo PC principal)
 */
export async function saveNinjaLiveBridgeSnapshotSupabase(snapshot: NinjaLiveBridgeSnapshot): Promise<boolean> {
  try {
    cachedLiveBridgeSnapshot = snapshot;
    const user = await getAuthUser();
    if (!user || !user.id) return false;

    const rowId = `nt8_live_bridge_${user.id}`;
    const payload: any = {
      id: rowId,
      user_id: user.id,
      account_id: 'nt8_bridge',
      symbol: 'LIVE_DATA',
      indicators: snapshot.positions || [],
      widgets: {
        isOnline: snapshot.isOnline,
        latencyMs: snapshot.latencyMs,
        accounts: snapshot.accounts || [],
        orders: snapshot.orders || [],
        performance: snapshot.performance || [],
        metricsMap: snapshot.metricsMap || {},
        copyMessages: (snapshot.copyMessages || []).slice(0, 50)
      },
      timeframe: snapshot.latencyMs || 1,
      updated_at: snapshot.updatedAt || new Date().toISOString()
    };

    await withDbTimeout(
      supabase
        .from('painelvm_account_chart_state')
        .upsert(payload, { onConflict: 'id' }) as any,
      4000
    );
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Resgata o snapshot mais recente do NinjaTrader 8 na nuvem (usado pelo Celular / Acesso Restrito)
 */
export async function fetchNinjaLiveBridgeSnapshotSupabase(force = false): Promise<NinjaLiveBridgeSnapshot | null> {
  const now = Date.now();
  if (!force && cachedLiveBridgeSnapshot && (now - lastLiveBridgeFetchTime < 1200)) {
    return cachedLiveBridgeSnapshot;
  }

  try {
    const user = await getAuthUser();
    if (!user || !user.id) return cachedLiveBridgeSnapshot;

    const rowId = `nt8_live_bridge_${user.id}`;
    const { data, error } = await withDbTimeout(
      supabase
        .from('painelvm_account_chart_state')
        .select('*')
        .eq('id', rowId)
        .maybeSingle() as any,
      3500
    );

    if (!error && data) {
      const positions = typeof data.indicators === 'string' ? JSON.parse(data.indicators) : (data.indicators || []);
      const widgets = typeof data.widgets === 'string' ? JSON.parse(data.widgets) : (data.widgets || {});
      const updatedAt = data.updated_at || new Date().toISOString();

      // Considera online se o snapshot foi atualizado nos últimos 45 segundos
      const ageMs = Math.abs(now - new Date(updatedAt).getTime());
      const isStillFresh = ageMs < 45000;

      const snapshot: NinjaLiveBridgeSnapshot = {
        updatedAt,
        isOnline: isStillFresh && widgets.isOnline !== false,
        latencyMs: data.timeframe || widgets.latencyMs || 50,
        accounts: Array.isArray(widgets.accounts) ? widgets.accounts : [],
        positions: Array.isArray(positions) ? positions : [],
        orders: Array.isArray(widgets.orders) ? widgets.orders : [],
        performance: Array.isArray(widgets.performance) ? widgets.performance : [],
        metricsMap: widgets.metricsMap || {},
        copyMessages: Array.isArray(widgets.copyMessages) ? widgets.copyMessages : []
      };

      cachedLiveBridgeSnapshot = snapshot;
      lastLiveBridgeFetchTime = now;
      return snapshot;
    }
  } catch (err) {}

  return cachedLiveBridgeSnapshot;
}

/**
 * Envia um comando remoto (ex: zerar posição, cancelar ordem, pânico) do Celular / Acesso Restrito para o PC Principal
 */
export async function sendNinjaRemoteCommandSupabase(cmd: Omit<NinjaRemoteCommand, 'id' | 'createdAt'>): Promise<{ success: boolean; commandId?: string; message?: string }> {
  try {
    const user = await getAuthUser();
    if (!user || !user.id) return { success: false, message: 'Usuário não autenticado' };

    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newCommand: NinjaRemoteCommand = {
      id: commandId,
      type: cmd.type,
      account: cmd.account,
      symbol: cmd.symbol,
      orderId: cmd.orderId,
      createdAt: new Date().toISOString(),
      executedAt: null
    };

    const rowId = `nt8_cmd_${user.id}`;
    
    // Busca comandos existentes para adicionar à fila
    const { data: existingRow } = await supabase
      .from('painelvm_account_chart_state')
      .select('*')
      .eq('id', rowId)
      .maybeSingle() as any;

    let existingCommands: NinjaRemoteCommand[] = [];
    if (existingRow && existingRow.widgets) {
      const rawCmds = typeof existingRow.widgets === 'string' ? JSON.parse(existingRow.widgets) : existingRow.widgets;
      if (Array.isArray(rawCmds?.commands)) {
        // Mantém apenas comandos recentes (últimos 3 minutos)
        const cutoff = Date.now() - 180000;
        existingCommands = rawCmds.commands.filter((c: NinjaRemoteCommand) => new Date(c.createdAt).getTime() > cutoff);
      }
    }

    existingCommands.push(newCommand);

    await supabase
      .from('painelvm_account_chart_state')
      .upsert({
        id: rowId,
        user_id: user.id,
        account_id: 'nt8_command_queue',
        symbol: 'COMMAND',
        widgets: { commands: existingCommands },
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    return { success: true, commandId, message: 'Comando remoto enviado com sucesso!' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Erro ao enviar comando remoto' };
  }
}

/**
 * Busca comandos remotos pendentes (executado pelo PC Principal com NT8)
 */
export async function fetchNinjaPendingRemoteCommandsSupabase(): Promise<NinjaRemoteCommand[]> {
  try {
    const user = await getAuthUser();
    if (!user || !user.id) return [];

    const rowId = `nt8_cmd_${user.id}`;
    const { data, error } = await supabase
      .from('painelvm_account_chart_state')
      .select('*')
      .eq('id', rowId)
      .maybeSingle() as any;

    if (!error && data && data.widgets) {
      const parsed = typeof data.widgets === 'string' ? JSON.parse(data.widgets) : data.widgets;
      if (Array.isArray(parsed?.commands)) {
        const cutoff = Date.now() - 60000; // Últimos 60s
        return parsed.commands.filter((c: NinjaRemoteCommand) => !c.executedAt && new Date(c.createdAt).getTime() > cutoff);
      }
    }
  } catch (err) {}
  return [];
}

/**
 * Marca um comando remoto como executado no Supabase
 */
export async function markNinjaRemoteCommandExecutedSupabase(commandId: string): Promise<boolean> {
  try {
    const user = await getAuthUser();
    if (!user || !user.id) return false;

    const rowId = `nt8_cmd_${user.id}`;
    const { data } = await supabase
      .from('painelvm_account_chart_state')
      .select('*')
      .eq('id', rowId)
      .maybeSingle() as any;

    if (data && data.widgets) {
      const parsed = typeof data.widgets === 'string' ? JSON.parse(data.widgets) : data.widgets;
      if (Array.isArray(parsed?.commands)) {
        const updated = parsed.commands.map((c: NinjaRemoteCommand) => 
          c.id === commandId ? { ...c, executedAt: new Date().toISOString() } : c
        );
        await supabase
          .from('painelvm_account_chart_state')
          .update({ widgets: { commands: updated }, updated_at: new Date().toISOString() })
          .eq('id', rowId);
        return true;
      }
    }
  } catch (err) {}
  return false;
}

export function getReportPnL(op: StrategyReport, panels?: any[]): number {
  if (op.status !== 'Gain' && op.status !== 'Stop' && op.status !== 'Cancelado') return 0;
  if (op.status === 'Cancelado' && (op.exit_price === null || op.exit_price === undefined)) return 0;

  // 1. Prioridade absoluta para PnL Real de Contas Sincronizadas
  if ((op as any).realized_pnl !== undefined && (op as any).realized_pnl !== null) {
    const rPnl = Number((op as any).realized_pnl);
    if (!isNaN(rPnl)) return rPnl;
  }
  if (op.description) {
    const matchPnl = op.description.match(/\[PNL:\s*([+-]?\d+(?:\.\d+)?)\]/i);
    if (matchPnl && matchPnl[1]) {
      const val = parseFloat(matchPnl[1]);
      if (!isNaN(val)) return val;
    }
  }

  // 2. Cálculo para Contas Demo Axion
  const entry = Number(op.entry_price || 0);
  const exit = op.exit_price !== null && op.exit_price !== undefined ? Number(op.exit_price) : 0;
  const tp = op.take_profit !== null && op.take_profit !== undefined ? Number(op.take_profit) : 0;
  const sl = op.stop_loss !== null && op.stop_loss !== undefined ? Number(op.stop_loss) : 0;

  let pts = 0;
  if (exit > 0 && entry > 0) {
    pts = op.side === 'COMPRA' ? exit - entry : entry - exit;
  } else if (op.status === 'Gain' && tp > 0 && entry > 0) {
    pts = op.side === 'COMPRA' ? tp - entry : entry - tp;
  } else if (op.status === 'Stop' && sl > 0 && entry > 0) {
    pts = op.side === 'COMPRA' ? sl - entry : entry - sl;
  }

  let pointVal = 1.0;
  if (panels && panels.length > 0) {
    let matchedPanel = panels.find(p => p.id === op.panel_id || (op.instance_id && p.instance_id === op.instance_id));
    if (!matchedPanel && op.symbol) {
      const cleanSym = op.symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
      matchedPanel = panels.find(p =>
        p.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanSym ||
        p.instance_id.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanSym ||
        (p.symbol && p.symbol.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanSym) ||
        isSameAsset(p.name, op.symbol) ||
        isSameAsset(p.symbol, op.symbol)
      );
    }
    if (!matchedPanel && op.description) {
      const match = op.description.match(/\[(.*?)\]/);
      if (match && match[1]) {
        const cleanDesc = match[1].toLowerCase().replace(/[^a-z0-9]/g, '');
        matchedPanel = panels.find(p =>
          p.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanDesc ||
          p.instance_id.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanDesc ||
          isSameAsset(p.name, match[1])
        );
      }
    }
    if (matchedPanel && matchedPanel.point_value !== undefined && matchedPanel.point_value !== null) {
      const pVal = Number(matchedPanel.point_value);
      if (!isNaN(pVal) && pVal > 0) {
        pointVal = pVal;
      }
    }
  }

  const contracts = op.contrato !== undefined && op.contrato !== null ? Number(op.contrato) : 1;
  return pts * contracts * pointVal;
}

export interface NinjaSnapshotInput {
  dailyPnL: number;
  balance: number;
  realizedPnL?: number;
  unrealizedPnL?: number;
  updatedAt?: string;
}

export function calculateAccountDrawdownMetrics(
  account: BrokerAccount,
  operations: StrategyReport[],
  panels?: any[],
  customNinjaSnapshot?: NinjaSnapshotInput,
  sessionStartTimeStr: string = '19:00:00'
): AccountDrawdownMetrics {
  const isNinjaAcc = isNinjaExecutionAccount(account);

  // Se for conta NinjaTrader, busca métricas do NinjaTrader (ao vivo ou do cache da última conexão local)
  let ninjaSnapshot = customNinjaSnapshot;
  if (isNinjaAcc && !ninjaSnapshot) {
    const cache = getNinjaAccountMetricsCache();
    const cleanName = (account.account_name || '').trim().toUpperCase();
    const cached = cache[cleanName] || cache[account.id];
    if (cached) {
      ninjaSnapshot = {
        dailyPnL: cached.dailyPnL,
        balance: cached.cashValue,
        realizedPnL: cached.realizedPnL,
        unrealizedPnL: cached.unrealizedPnL,
        updatedAt: cached.updatedAt
      };
    }
  }

  const accountOps = operations.filter(op => op.account_id === account.id);
  
  // Ordenar operações encerradas cronologicamente para reconstruir a curva de patrimônio
  const closedOps = accountOps
    .filter(op => op.status === 'Gain' || op.status === 'Stop' || (op.status === 'Cancelado' && op.exit_price !== null && op.exit_price !== undefined))
    .sort((a, b) => new Date(a.closed_at || a.created_at).getTime() - new Date(b.closed_at || b.created_at).getTime());

  const initialBal = account.initial_balance || 50000;
  let runningBal = initialBal;
  let peakHWM = Math.max(account.high_watermark || initialBal, initialBal);

  // Reconstruir o patrimônio acumulado para capturar a máxima de pico real (High-Watermark)
  for (const op of closedOps) {
    const pnl = getReportPnL(op, panels);
    runningBal += pnl;
    if (runningBal > peakHWM) {
      peakHWM = runningBal;
    }
  }

  let currentBalance = runningBal;

  // Calcular PnL flutuante das posições em aberto ("Em Andamento")
  let floatingPnL = 0;
  const openOps = accountOps.filter(op => op.status === 'Em Andamento');
  if (openOps.length > 0 && panels && panels.length > 0) {
    for (const op of openOps) {
      if (op.entry_price) {
        let matchedPanel = panels.find(p => p.id === op.panel_id || (op.instance_id && p.instance_id === op.instance_id));
        if (!matchedPanel && op.symbol) {
          const cleanSym = op.symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
          matchedPanel = panels.find(p =>
            p.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanSym ||
            p.instance_id.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanSym ||
            (p.symbol && p.symbol.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanSym) ||
            isSameAsset(p.name, op.symbol) ||
            isSameAsset(p.symbol, op.symbol)
          );
        }
        if (!matchedPanel && op.description) {
          const match = op.description.match(/\[(.*?)\]/);
          if (match && match[1]) {
            const cleanDesc = match[1].toLowerCase().replace(/[^a-z0-9]/g, '');
            matchedPanel = panels.find(p =>
              p.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanDesc ||
              p.instance_id.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanDesc ||
              isSameAsset(p.name, match[1])
            );
          }
        }
        if (matchedPanel && matchedPanel.marketData && matchedPanel.marketData.price) {
          const curPrice = Number(matchedPanel.marketData.price);
          const entry = Number(op.entry_price);
          const pts = op.side === 'COMPRA' ? curPrice - entry : entry - curPrice;
          const contracts = op.contrato !== undefined && op.contrato !== null ? Number(op.contrato) : 1;
          const pointVal = matchedPanel.point_value !== undefined && matchedPanel.point_value !== null ? Number(matchedPanel.point_value) : 1.0;
          floatingPnL += pts * contracts * pointVal;
        }
      }
    }
  }

  let currentEquity = currentBalance + floatingPnL;
  if (currentEquity > peakHWM) {
    peakHWM = currentEquity;
  }

  let highWatermark = peakHWM;

  // Calcular a baseline de início de sessão (Fuso SP, ciclo global configurado)
  const nowSP = getSaoPauloDate();
  const [startHStr, startMStr] = (sessionStartTimeStr || '19:00:00').split(':');
  const startH = parseInt(startHStr || '19', 10);
  const startM = parseInt(startMStr || '0', 10);
  const todayCycleStart = new Date(nowSP.getFullYear(), nowSP.getMonth(), nowSP.getDate(), startH, startM, 0);
  let currentCycleStart: Date;
  if (nowSP >= todayCycleStart) {
    currentCycleStart = todayCycleStart;
  } else {
    currentCycleStart = new Date(todayCycleStart.getTime() - 24 * 60 * 60 * 1000);
  }

  let sessionStartBal = initialBal;
  for (const op of closedOps) {
    const opDate = getSaoPauloDate(op.closed_at || op.created_at);
    if (opDate < currentCycleStart) {
      sessionStartBal += getReportPnL(op, panels);
    }
  }

  let eodBaseline = account.eod_baseline_balance || sessionStartBal;

  // Daily PnL e contagem de operações da sessão atual (fuso SP, ciclo global 19:00:00 BRT)
  const currentSessionOps = accountOps.filter(op => {
    const opDate = getSaoPauloDate(op.closed_at || op.created_at);
    return opDate >= currentCycleStart;
  });
  // Agrupa alvos irmãos de uma mesma estratégia ATM para não consumir múltiplos trades diários indevidamente
  const effectiveSessionEntries = currentSessionOps.filter((op, idx, arr) => {
    const isAtm = Boolean(
      op.is_atm ||
      (op.strategy_name && op.strategy_name.includes('Alvo')) ||
      (op.description && op.description.includes('ATM')) ||
      op.allow_multi
    );
    if (!isAtm) return true;
    const isSecondaryTarget = Boolean(op.strategy_name && !op.strategy_name.includes('Alvo 1') && op.strategy_name.includes('Alvo'));
    if (isSecondaryTarget) {
      const opTime = op.created_at ? new Date(op.created_at).getTime() : 0;
      const hasSibling = arr.some((other, oIdx) => {
        if (oIdx === idx) return false;
        const otherTime = other.created_at ? new Date(other.created_at).getTime() : 0;
        return Math.abs(opTime - otherTime) < 90000 && other.side === op.side && (other.symbol === op.symbol || other.panel_id === op.panel_id);
      });
      if (hasSibling) return false;
    }
    return true;
  });
  const dailyEntriesCount = effectiveSessionEntries.length;

  let dailyPnL = currentSessionOps
    .filter(op => op.status === 'Gain' || op.status === 'Stop' || (op.status === 'Cancelado' && op.exit_price !== null && op.exit_price !== undefined))
    .reduce((acc, op) => acc + getReportPnL(op, panels), 0) + floatingPnL;

  // ⭐️ PARA CONTAS NINJATRADER: O PnL Diário e Saldo vêm diretamente da sincronização com o NinjaTrader
  if (isNinjaAcc && ninjaSnapshot) {
    dailyPnL = Number(ninjaSnapshot.dailyPnL || 0);
    if (Number(ninjaSnapshot.balance) > 0) {
      currentBalance = Number(ninjaSnapshot.balance);
    }
    floatingPnL = Number(ninjaSnapshot.unrealizedPnL || 0);
    currentEquity = currentBalance + floatingPnL;
    highWatermark = Math.max(account.high_watermark || initialBal, currentBalance, currentEquity);
    eodBaseline = account.eod_baseline_balance || initialBal;
  } else if (isNinjaAcc && !ninjaSnapshot) {
    // Conta NinjaTrader sem snapshot registrado ainda: usa saldo configurado
    if (account.balance && account.balance > 0) {
      currentBalance = account.balance;
      currentEquity = currentBalance;
    }
  }

  // Intraday Trailing Drawdown (HWM): Diferença entre o maior patrimônio atingido e o patrimônio/equidade atual
  const intradayDrawdownUsd = Math.max(0, highWatermark - currentEquity);
  const intradayDrawdownPct = account.max_drawdown_usd > 0 ? (intradayDrawdownUsd / account.max_drawdown_usd) * 100 : 0;

  // EOD Drawdown: Projeção ao vivo da diferença entre o saldo de início de sessão e a equidade atual
  const eodDrawdownUsd = Math.max(0, eodBaseline - currentEquity);
  const eodDrawdownPct = account.max_drawdown_usd > 0 ? (eodDrawdownUsd / account.max_drawdown_usd) * 100 : 0;

  // Cálculo da Regra de Consistência (% do maior lucro em 1 único dia sobre a Meta)
  // Agrupa trades pelo Trade Date da Sessão (de acordo com a janela da sessão)
  const dailyPnLsByDate: Record<string, number> = {};
  accountOps.forEach(op => {
    if (op.closed_at || op.created_at) {
      const tradeDate = getTradingSessionDate(op.closed_at || op.created_at, sessionStartTimeStr);
      const dateKey = `${tradeDate.getFullYear()}-${String(tradeDate.getMonth() + 1).padStart(2, '0')}-${String(tradeDate.getDate()).padStart(2, '0')}`;
      const pnl = getReportPnL(op, panels);
      dailyPnLsByDate[dateKey] = (dailyPnLsByDate[dateKey] || 0) + pnl;
    }
  });

  if (isNinjaAcc && dailyPnL > 0) {
    const todayTradeDate = getTradingSessionDate(nowSP, sessionStartTimeStr);
    const todayKey = `${todayTradeDate.getFullYear()}-${String(todayTradeDate.getMonth() + 1).padStart(2, '0')}-${String(todayTradeDate.getDate()).padStart(2, '0')}`;
    dailyPnLsByDate[todayKey] = Math.max(dailyPnLsByDate[todayKey] || 0, dailyPnL);
  }

  const dayProfits = Object.values(dailyPnLsByDate).filter(p => p > 0);
  const maxSingleDayProfit = dayProfits.length > 0 ? Math.max(...dayProfits) : (dailyPnL > 0 ? dailyPnL : 0);

  const profitTarget = account.profit_target_usd || account.daily_max_gain_usd || 3000;
  
  // Lucro total acumulado da conta (patrimônio atual - saldo inicial)
  const currentTotalProfit = (currentBalance - initialBal) + floatingPnL;

  // A base para o cálculo de consistência é a Meta de Lucro, ou o Lucro Total Acumulado se este for maior
  const effectiveProfitBase = Math.max(profitTarget, currentTotalProfit);

  const consistencyPctConfig = account.consistency_pct !== undefined ? account.consistency_pct : 40;
  const maxAllowedSingleDayProfit = effectiveProfitBase * (consistencyPctConfig / 100);

  const consistencyPctCalculated = effectiveProfitBase > 0 ? (maxSingleDayProfit / effectiveProfitBase) * 100 : 0;
  const consistencyViolated = maxSingleDayProfit > maxAllowedSingleDayProfit;

  const activeDDUsd = account.dd_mode === 'eod' ? eodDrawdownUsd : intradayDrawdownUsd;

  const dailyStopViolated = dailyPnL < 0 && Math.abs(dailyPnL) >= account.daily_stop_loss_usd;
  const dailyGainTargetMet = account.daily_max_gain_usd ? (dailyPnL >= account.daily_max_gain_usd) : false;
  const dailyMaxEntriesExceeded = account.daily_max_entries ? (dailyEntriesCount >= account.daily_max_entries) : false;
  const maxDdViolated = activeDDUsd >= account.max_drawdown_usd;

  const isEliminationSimulated = !isNinjaAcc && account.simulate_elimination !== false;
  
  // Apenas violações de perdas (Stop Diário ou DD Máximo) eliminam/bloqueiam a conta. Superar a consistência não elimina a conta.
  const isLockedOut = !isNinjaAcc && (isEliminationSimulated || account.enforce_dd_lockout) && (dailyStopViolated || maxDdViolated || account.status === 'failed_lockout');

  return {
    currentBalance,
    highWatermark,
    eodBaseline,
    intradayDrawdownUsd,
    intradayDrawdownPct,
    eodDrawdownUsd,
    eodDrawdownPct,
    dailyPnL,
    dailyEntriesCount,
    dailyStopViolated,
    dailyGainTargetMet,
    dailyMaxEntriesExceeded,
    maxDdViolated,
    maxSingleDayProfit,
    maxAllowedSingleDayProfit,
    consistencyPctCalculated,
    consistencyViolated,
    effectiveProfitBase,
    isLockedOut,
    isNinjaSynced: Boolean(isNinjaAcc && ninjaSnapshot),
    ninjaLastSyncedAt: ninjaSnapshot?.updatedAt
  };
}

/**
 * Compara se dois símbolos referem-se ao mesmo ativo subjacente (ex: NQ vs MNQ, NQ 09-26 vs NQ, WIN vs WINV24, etc.)
 */
export function isSameAsset(sym1?: string | null, sym2?: string | null): boolean {
  if (!sym1 || !sym2) return false;
  const clean1 = sym1.split(' ')[0].trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const clean2 = sym2.split(' ')[0].trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean1 === clean2) return true;
  if (clean1.includes(clean2) || clean2.includes(clean1)) return true;

  const extractRoot = (s: string) => {
    if (s.includes('NQ') || s.includes('NASDAQ')) return 'NQ';
    if (s.includes('ES') || s.includes('SP500') || s.includes('SPX')) return 'ES';
    if (s.includes('YM') || s.includes('DOW')) return 'YM';
    if (s.includes('RTY') || s.includes('RUSSELL')) return 'RTY';
    if (s.includes('GC') || s.includes('GOLD') || s.includes('OURO')) return 'GC';
    if (s.includes('CL') || s.includes('OIL') || s.includes('PETR')) return 'CL';
    if (s.includes('WIN') || s.includes('IBOV')) return 'WIN';
    if (s.includes('WDO') || s.includes('DOL')) return 'WDO';
    if (s.includes('EUR') || s.includes('6E')) return 'EURUSD';
    return s;
  };

  const root1 = extractRoot(clean1);
  const root2 = extractRoot(clean2);
  return root1 === root2;
}

export interface AccountValidationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Validação rigorosa e centralizada de regras de gestão de risco, metas diárias,
 * bloqueio de posição única no mesmo ativo e controle de múltiplos sinais.
 */
export function validateAccountTradingRules(
  account: BrokerAccount | null | undefined,
  params: {
    panelId?: string | null;
    panelInstanceId?: string | null;
    symbol?: string | null;
    assetName?: string | null;
    side?: 'COMPRA' | 'VENDA' | string | null;
    isManualTrade?: boolean;
    isAtm?: boolean;
    reports?: StrategyReport[];
    panels?: any[];
    customSettings?: any;
  }
): AccountValidationResult {
  if (!account) {
    return { allowed: false, reason: 'Nenhuma conta operacional selecionada.' };
  }

  // 0. Bloqueio de Entrada via Painel para Conta Master NinjaTrader
  if (isNinjaMasterAccount(account)) {
    return {
      allowed: false,
      reason: `A conta "${account.account_name}" está configurada como MASTER NINJATRADER. Para evitar duplicidades e conflitos de execução, entradas manuais e de robôs via painel web estão bloqueadas nesta conta. Execute suas operações diretamente no NinjaTrader 8 (Chart Trader, DOM ou Boleta NT8) para que sejam replicadas automaticamente para as contas Slaves.`
    };
  }

  // 1. Status da Conta
  if (account.is_active === false) {
    return {
      allowed: false,
      reason: `A conta "${account.account_name}" está DESATIVADA. Ative-a na Gestão de Contas para liberar operações.`
    };
  }

  if (account.status === 'failed_lockout') {
    return {
      allowed: false,
      reason: `A conta "${account.account_name}" está BLOQUEADA por violação de limite de risco / eliminação.`
    };
  }

  // 2. Horário Operacional Permitido da Conta
  if ((params.isManualTrade && account.manual_trading_enabled !== false) || (account.manual_start_time && account.manual_end_time)) {
    const nowSP = getSaoPauloDate();
    const pad = (num: number) => String(num).padStart(2, '0');
    const currentTimeStr = `${pad(nowSP.getHours())}:${pad(nowSP.getMinutes())}:${pad(nowSP.getSeconds())}`;

    const startTime = account.manual_start_time || '00:00:00';
    const endTime = account.manual_end_time || '23:59:59';

    if (startTime !== '00:00:00' || endTime !== '23:59:59') {
      const inWindow = startTime <= endTime
        ? (currentTimeStr >= startTime && currentTimeStr <= endTime)
        : (currentTimeStr >= startTime || currentTimeStr <= endTime);

      if (!inWindow) {
        return {
          allowed: false,
          reason: `Fora da janela de horários operacionais da conta "${account.account_name}" (${startTime.substring(0, 5)} às ${endTime.substring(0, 5)}).`
        };
      }
    }
  }

  const reports = params.reports || getLocalStrategyReports();
  const panels = params.panels || [];

  // 3. Métricas Financeiras e Limites de Risco da Sessão
  const sessionStartTime = params.customSettings?.global_cycle_start || '20:00:00';
  const metrics = calculateAccountDrawdownMetrics(account, reports, panels, undefined, sessionStartTime);

  // 3.1 Stop Loss Diário da Conta (Perda Máxima Diária)
  const dailyStopLimit = Number(account.daily_stop_loss_usd || account.trader_daily_stop_loss_usd || 0);
  if (dailyStopLimit > 0 && metrics.dailyPnL < 0 && Math.abs(metrics.dailyPnL) >= dailyStopLimit) {
    return {
      allowed: false,
      reason: `Limite de perda diária (Stop Diário de US$ ${dailyStopLimit.toFixed(2)}) atingido na conta "${account.account_name}". P&L da sessão: -US$ ${Math.abs(metrics.dailyPnL).toFixed(2)}.`
    };
  }

  // 3.2 Meta de Lucro Diário da Conta (Take Profit Diário / Daily Max Gain)
  const dailyGainLimit = Number(account.daily_max_gain_usd || account.trader_daily_take_profit_usd || 0);
  if (dailyGainLimit > 0 && metrics.dailyPnL >= dailyGainLimit) {
    return {
      allowed: false,
      reason: `Meta de lucro diário (US$ ${dailyGainLimit.toFixed(2)}) atingida na conta "${account.account_name}". P&L da sessão: +US$ ${metrics.dailyPnL.toFixed(2)}. Operações pausadas para proteção de lucro.`
    };
  }

  // 3.3 Limite de Operações Diárias da Conta (Daily Max Entries / Trades)
  const maxEntriesLimit = Number(account.manual_max_daily_trades || account.daily_max_entries || 0);
  if (maxEntriesLimit > 0 && metrics.dailyEntriesCount >= maxEntriesLimit) {
    return {
      allowed: false,
      reason: `Limite diário de operações da conta (${maxEntriesLimit} trades) atingido para "${account.account_name}".`
    };
  }

  // 3.4 Drawdown Máximo da Conta
  if (account.max_drawdown_usd > 0 && metrics.maxDdViolated) {
    return {
      allowed: false,
      reason: `Limite de Drawdown Máximo violado para a conta "${account.account_name}".`
    };
  }

  // 4. Regra de Posição Única por Ativo e Controle de Múltiplos Sinais
  const openAccountOps = reports.filter(
    r => r.account_id === account.id && r.status === 'Em Andamento'
  );

  const targetSymbol = params.symbol || params.assetName || '';

  // 4.1 Regra de Posição Única no Mesmo Ativo (INVIOLÁVEL para ordens independentes)
  const sameAssetOps = openAccountOps.filter(r => {
    if (params.panelId && r.panel_id === params.panelId) return true;
    if (params.panelInstanceId && r.instance_id === params.panelInstanceId) return true;
    if (targetSymbol && r.symbol && isSameAsset(r.symbol, targetSymbol)) return true;
    if (targetSymbol && r.description && r.description.includes(`[${targetSymbol}]`)) return true;
    return false;
  });

  if (sameAssetOps.length > 0) {
    // 🎯 Se a ordem atual é parte de um disparo de Estratégia ATM com múltiplos alvos (Brackets):
    // Não bloqueia se todas as ordens abertas neste ativo forem alvos irmãos da mesma estratégia ATM na mesma direção disparadas recentemente (janela de 90s)
    const isCompanionAtmBatch = Boolean(params.isAtm) && sameAssetOps.every(r => {
      const isOpAtm = Boolean(
        r.is_atm ||
        (r.strategy_name && r.strategy_name.includes('Alvo')) ||
        (r.description && r.description.includes('ATM')) ||
        r.allow_multi
      );
      if (!isOpAtm) return false;
      if (params.side && r.side && r.side !== params.side) return false;
      const createdAtMs = r.created_at ? new Date(r.created_at).getTime() : 0;
      const ageMs = createdAtMs > 0 ? Math.abs(Date.now() - createdAtMs) : 0;
      return ageMs <= 90000;
    });

    if (!isCompanionAtmBatch) {
      const assetLabel = targetSymbol || params.assetName || 'deste ativo';
      return {
        allowed: false,
        reason: `A conta "${account.account_name}" já possui uma operação 'Em Andamento' no ativo ${assetLabel}. Não é permitido abrir novas posições no mesmo ativo.`
      };
    }
  }

  // 4.2 Regra de Múltiplos Sinais (allow_multi_signals)
  // Se allow_multi_signals for FALSE, a conta só pode ter 1 ativo operando simultaneamente.
  if (account.allow_multi_signals === false && openAccountOps.length > 0) {
    const diffAssetOps = openAccountOps.filter(r => {
      if (params.panelId && r.panel_id === params.panelId) return false;
      if (params.panelInstanceId && r.instance_id === params.panelInstanceId) return false;
      if (targetSymbol && r.symbol && isSameAsset(r.symbol, targetSymbol)) return false;
      if (targetSymbol && r.description && r.description.includes(`[${targetSymbol}]`)) return false;
      return true;
    });

    if (diffAssetOps.length > 0) {
      return {
        allowed: false,
        reason: `A conta "${account.account_name}" já possui uma operação 'Em Andamento' em outro ativo e Múltiplos Sinais em ativos diferentes está desativado.`
      };
    }

    // Se todas as ordens abertas forem no mesmo ativo, somente permite alvos irmãos de ATM
    if (!params.isAtm) {
      return {
        allowed: false,
        reason: `A conta "${account.account_name}" já possui uma operação 'Em Andamento' e Múltiplos Sinais está desativado.`
      };
    }
  }

  return { allowed: true };
}





export async function fetchBroadcastMessagesAdmin(): Promise<any[]> {
  try {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('broadcast_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export interface FetchProgressInfo {
  percent: number;
  message: string;
  totalRows: number;
  loadedRows: number;
  total?: number;
  current?: number;
  phase?: string;
}

export const DEFAULT_SYMBOL_MAPPING = 'MNQ=NQ, MES=ES, MYM=YM, M2K=RTY, MCL=CL, MGC=GC';
export const DEFAULT_MANUAL_START_TIME = '09:00';
export const DEFAULT_MANUAL_END_TIME = '17:30';

export function resolvePanelPointValue(panelOrSymbol: any, fallback: number = 20): number {
  if (!panelOrSymbol) return fallback;
  if (typeof panelOrSymbol === 'object') {
    if (panelOrSymbol.point_value && Number(panelOrSymbol.point_value) > 0) {
      return Number(panelOrSymbol.point_value);
    }
    const name = (panelOrSymbol.name || panelOrSymbol.symbol || panelOrSymbol.instance_id || '').toUpperCase();
    if (name.includes('MNQ') || name.includes('NQ')) return 2;
    if (name.includes('MES') || name.includes('ES') || name.includes('SP500')) return 5;
    if (name.includes('MYM') || name.includes('YM') || name.includes('DOW')) return 0.5;
    if (name.includes('M2K') || name.includes('RTY') || name.includes('RUSSEL')) return 10;
    if (name.includes('MCL') || name.includes('CL') || name.includes('OIL') || name.includes('PETROLEO')) return 100;
    if (name.includes('MGC') || name.includes('GC') || name.includes('GOLD')) return 10;
  }
  const s = String(panelOrSymbol).toUpperCase();
  if (s.includes('MNQ') || s.includes('NQ')) return 2;
  if (s.includes('MES') || s.includes('ES') || s.includes('SP500')) return 5;
  if (s.includes('MYM') || s.includes('YM') || s.includes('DOW')) return 0.5;
  if (s.includes('M2K') || s.includes('RTY') || s.includes('RUSSEL')) return 10;
  if (s.includes('MCL') || s.includes('CL') || s.includes('OIL') || s.includes('PETROLEO')) return 100;
  if (s.includes('MGC') || s.includes('GC') || s.includes('GOLD')) return 10;
  return fallback;
}

export async function sendBroadcastMessageAdmin(subject: string, content: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const user = await getAuthUser();
    const adminId = user?.id || null;

    const payload = {
      subject: subject.trim(),
      content: content.trim(),
      ...(adminId ? { admin_id: adminId } : {})
    };

    // Tenta primeiro via supabaseAdmin (service_role) para contornar bloqueio de RLS de inserção
    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('broadcast_messages')
      .insert(payload)
      .select();

    if (error) {
      // Fallback para supabase padrão caso ocorra algum imprevisto
      const fallback = await supabase
        .from('broadcast_messages')
        .insert(payload)
        .select();
      if (fallback.error) return { success: false, error: fallback.error.message };
      return { success: true, data: fallback.data };
    }
    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro inesperado' };
  }
}

export async function deleteBroadcastMessageAdmin(id: string): Promise<boolean> {
  try {
    const client = supabaseAdmin || supabase;
    const { error } = await client
      .from('broadcast_messages')
      .delete()
      .eq('id', id);
    if (error) {
      const fallback = await supabase
        .from('broadcast_messages')
        .delete()
        .eq('id', id);
      return !fallback.error;
    }
    return true;
  } catch {
    return false;
  }
}

export async function saveNinjaTunnelConfigSupabase(cfg: any): Promise<boolean> {
  try {
    const user = await getAuthUser();
    if (!user || !user.id) return false;
    const record = {
      id: `nt8_tunnel_cfg_${user.id}`,
      user_id: user.id,
      account_id: 'nt8_tunnel_config',
      symbol: 'TUNNEL_CONFIG',
      widgets: {
        pairing_token: cfg.pairing_token,
        connection_mode: cfg.connection_mode,
        gateway_url: cfg.gateway_url,
        updated_at: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    };
    const { error } = await withDbTimeout(
      supabase.from('painelvm_account_chart_state').upsert(record, { onConflict: 'id' }),
      4000
    );
    return !error;
  } catch {
    return false;
  }
}

export async function fetchAndSyncNinjaTunnelConfigSupabase(): Promise<any | null> {
  try {
    const user = await getAuthUser();
    if (!user || !user.id) return null;
    const targetId = `nt8_tunnel_cfg_${user.id}`;
    const { data, error } = await withDbTimeout(
      supabase.from('painelvm_account_chart_state').select('*').eq('id', targetId).maybeSingle(),
      3500
    );
    if (!error && data && data.widgets) {
      const w = typeof data.widgets === 'string' ? JSON.parse(data.widgets) : data.widgets;
      return {
        pairing_token: w.pairing_token ? String(w.pairing_token).trim() : '',
        connection_mode: w.connection_mode ? String(w.connection_mode).trim() : '',
        gateway_url: w.gateway_url ? String(w.gateway_url).trim() : ''
      };
    }
    return null;
  } catch {
    return null;
  }
}
