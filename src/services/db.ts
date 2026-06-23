import { supabase } from '../supabaseClient';

export interface MarketData {
  symbol: string;
  price: string;
  zScore: number;
  atrRatio: number;
  estado: string;
  timestamp: string;
  sentiment: number;
  delta: number;
  deltaRatio: number;
  printsPerSecond: number;
  blockTrades: string[];
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
}

export interface EconomicNewsItem {
  id: string;
  event_time: string;
  event_date: string;
  country: string;
  impact: 'high' | 'medium' | 'low';
  event_name: string;
  forecast: string;
  previous: string;
}

// 1. Buscar Market Data do Supabase
export async function fetchMarketDataSupabase(instanceId: string): Promise<MarketData | null> {
  try {
    const { data, error } = await supabase
      .from('market_data')
      .select('*')
      .eq('instance_id', instanceId)
      .order('id', { ascending: false }) // ou order por timestamp
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error('[DB] Erro market_data:', error);
      return null;
    }

    // Adaptar o formato
    const recentTrades = data.recent_trades ? (typeof data.recent_trades === 'string' ? JSON.parse(data.recent_trades) : data.recent_trades) : [];
    const formattedTrades = Array.isArray(recentTrades) ? recentTrades.map((t: any) => {
      const side = t.side || 'TRADE';
      const price = t.price || '--';
      const vol = t.volume || '--';
      return `${side} @ ${price} (Vol: ${vol})`;
    }) : [];

    return {
      symbol: data.symbol || '--',
      price: data.price !== undefined ? String(data.price) : '--',
      zScore: Number(data.zscore || 0),
      atrRatio: Number(data.atr_ratio || 0),
      estado: data.estado || 'AGUARDANDO',
      timestamp: data.ts || '--:--:--',
      sentiment: Number(data.delta_pct !== undefined ? data.delta_pct : 50),
      delta: Number(data.delta || 0),
      deltaRatio: Number(data.ratio !== undefined ? data.ratio : 1.0),
      printsPerSecond: Number(data.print_rate || 0),
      blockTrades: formattedTrades
    };
  } catch (err) {
    console.error('[DB] Erro inesperado ao buscar market_data:', err);
    return null;
  }
}

// 2. Buscar Força Nasdaq (nasdaq_force)
export async function fetchForceSupabase(instanceId: string): Promise<NasdaqForce | null> {
  try {
    // Como a tabela pode se chamar nasdaq_force
    const { data, error } = await supabase
      .from('nasdaq_force')
      .select('*')
      .eq('instance_id', instanceId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error('[DB] Erro nasdaq_force:', error);
      return null;
    }

    // Se o formato da força vier como JSON ou colunas individuais, tratamos:
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
        if (buyVal !== undefined && sellVal !== undefined) {
          forces.push({
            symbol: m.display,
            buy: Number(buyVal),
            sell: Number(sellVal)
          });
        }
      });
    }

    return { forces };
  } catch (err) {
    console.error('[DB] Erro ao buscar força Nasdaq:', err);
    return null;
  }
}

// 3. Buscar Níveis de Gamma (gamma_levels)
export async function fetchGammaLevelsSupabase(symbol: string): Promise<GammaLevels | null> {
  try {
    const { data, error } = await supabase
      .from('gamma_levels')
      .select('*')
      .eq('reference_symbol', symbol)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error('[DB] Erro gamma_levels:', error);
      return null;
    }

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
      bl_count: data.bl ? String(data.bl).split(',').length : 0
    };
  } catch (err) {
    console.error('[DB] Erro ao buscar gamma_levels:', err);
    return null;
  }
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
      .order('event_date', { ascending: true })
      .order('event_time', { ascending: true });

    if (error) {
      console.error('[DB] Erro economic_news:', error);
      return [];
    }

    return (data || []).map(item => ({
      id: String(item.id),
      event_time: item.event_time || '00:00',
      event_date: item.event_date || today,
      country: item.country || 'US',
      impact: item.impact || 'low',
      event_name: item.event_name || '--',
      forecast: item.forecast || '',
      previous: item.previous || ''
    }));
  } catch (err) {
    console.error('[DB] Erro ao buscar notícias:', err);
    return [];
  }
}

// 6. Buscar Sinal Local (quando configurado no modo local)
export async function fetchLocalSinal(): Promise<MarketData | null> {
  try {
    // Busca do servidor local de API na porta 8001
    const response = await fetch('http://localhost:8001/sinal', { method: 'GET' });
    if (!response.ok) return null;
    const data = await response.json();

    return {
      symbol: data.symbol || '--',
      price: data.price !== undefined ? String(data.price) : '--',
      zScore: Number(data.zscore || 0),
      atrRatio: Number(data.atr_ratio || 0),
      estado: data.estado || 'AGUARDANDO',
      timestamp: data.timestamp || '--:--:--',
      sentiment: Number(data.sentiment || 0),
      delta: Number(data.delta_value || 0),
      deltaRatio: Number(data.delta_ratio || 1.0),
      printsPerSecond: Number(data.prints_per_second || 0),
      blockTrades: data.block_trades || []
    };
  } catch (err) {
    console.warn('[DB] Servidor local offline:', err);
    return null;
  }
}
