/**
 * VortexWeb — ML Pattern & Retest Service
 * Comunicação com o backend de Machine Learning (TensorFlow) e registro de estudos
 */

export interface PatternRanking {
  pattern: string;
  column: string;
  total_occurrences: number;
  wins: number;
  winrate: number;
}

export interface StudyMetrics {
  accuracy: number;
  auc: number;
  f1_score?: number;
  high_confidence_precision: number;
  baseline_winrate: number;
}

export interface TestConfigFlags {
  use_candle_patterns: boolean;
  use_levels: boolean;
  use_gamma_levels?: boolean;
  use_rsi: boolean;
  use_atr: boolean;
  use_macd: boolean;
  use_moving_averages: boolean;
  use_volume: boolean;
}

export interface StudyRecord {
  id?: string;
  symbol: string;
  model_name?: string;
  model_type?: 'tensorflow_patterns' | 'gamma_quant_study' | 'structural_pattern_study' | string;
  tp_points?: number;
  sl_points?: number;
  last_run: string;
  data_start: string;
  data_end: string;
  total_candles: number;
  analyzed_samples: number;
  test_samples: number;
  metrics: StudyMetrics;
  active_features_count: number;
  active_features: string[];
  test_config: TestConfigFlags;
  top_patterns: PatternRanking[];
  model_path?: string;
  status: 'success' | 'running' | 'error';
  error_message?: string;
}

export interface AssetRangeInfo {
  symbol: string;
  data_start: string;
  data_end: string;
  total_candles: number;
}

export interface MLScheduleConfig {
  enabled: boolean;
  time: string; // Ex: '18:15'
  assets: string[];
  last_executed_date?: string;
}

export interface MLRunStatus {
  is_running: boolean;
  current_symbol?: string | null;
  started_at?: string | null;
  last_error?: string | null;
}

const getApiBaseCandidates = (): string[] => {
  const candidates: string[] = [];
  // 1. Relativo (passa pelo proxy do Vite ou mesma origem do app)
  candidates.push('');
  // 2. HTTP direto em 127.0.0.1:8080 (evita bugs de resolução de DNS do localhost no Windows)
  candidates.push('http://127.0.0.1:8080');
  // 3. HTTP em localhost:8080
  candidates.push('http://localhost:8080');
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      candidates.push(`http://${window.location.hostname}:8080`);
    }
  }
  return candidates;
};

async function fetchMLApi(path: string, options?: RequestInit): Promise<Response> {
  const candidates = getApiBaseCandidates();
  let lastError: any = null;
  for (const base of candidates) {
    try {
      const url = base ? `${base}${path}` : path;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 600);
      try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        if (res.ok || res.status < 500) {
          return res;
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('Não foi possível conectar ao Hub ML');
}

import { supabase } from '../supabaseClient';

export interface SavedMLModelItem {
  id: string;
  symbol: string;
  model_name: string;
  model_type: string;
  last_run: string;
  accuracy: number;
  auc: number;
  high_confidence_precision: number;
  top_patterns: PatternRanking[];
  active_features_count: number;
}

export async function fetchStudiesRegistry(): Promise<Record<string, StudyRecord>> {
  const result: Record<string, StudyRecord> = {};

  // 1. Prioridade: Buscar registros no Supabase (painelvm_ml_studies)
  try {
    const { data, error } = await supabase
      .from('painelvm_ml_studies')
      .select('*')
      .order('last_run', { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      data.forEach((row: any) => {
        const sym = (row.symbol || '').toUpperCase();
        const record: StudyRecord = {
          id: row.id,
          symbol: sym,
          model_name: row.model_name || `Axion ${sym} Retest`,
          tp_points: Number(row.tp_points) || 25.0,
          sl_points: Number(row.sl_points) || 12.0,
          last_run: row.last_run || row.created_at,
          data_start: row.data_start || '',
          data_end: row.data_end || '',
          total_candles: Number(row.total_candles) || 0,
          analyzed_samples: Number(row.analyzed_samples) || 0,
          test_samples: Number(row.test_samples) || 0,
          metrics: row.metrics || { accuracy: 0, auc: 0, high_confidence_precision: 0, baseline_winrate: 0 },
          active_features_count: Number(row.active_features_count) || (row.active_features?.length || 0),
          active_features: row.active_features || [],
          test_config: row.test_config || {},
          top_patterns: row.top_patterns || [],
          model_path: row.model_path,
          status: row.status || 'success'
        };

        if (row.id) {
          result[row.id] = record;
        }
        if (sym && !result[sym]) {
          result[sym] = record;
        }
      });
      // Salvar em cache local para acesso síncrono e instantâneo pelos indicadores
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('vortex_ml_studies_cache', JSON.stringify(result));
          (window as any).__vortex_ml_studies_cache = result;
        } catch (e) {}
      }
    }
  } catch (err) {
    console.warn('[MLService] Falha ao consultar painelvm_ml_studies no Supabase:', err);
  }

  // 2. Fallback / Complemento via API local do WebSocket Hub (apenas se Supabase estiver vazio)
  if (Object.keys(result).length === 0) {
    try {
      const res = await fetchMLApi('/api/ml/studies', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.studies) {
          Object.keys(data.studies).forEach(sym => {
            if (!result[sym]) {
              result[sym] = data.studies[sym];
            }
          });
        }
      }
    } catch (err) {
      // Silencioso em caso de hub local inativo
    }
  }

  // 3. Fallback de emergência via LocalStorage
  if (Object.keys(result).length === 0 && typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('vortex_ml_studies_cache');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
  }

  return result;
}

export async function fetchAllStudiesForAsset(
  symbol: string,
  studyType?: 'gamma_quant_study' | 'tensorflow_patterns' | 'structural_pattern_study' | 'all'
): Promise<StudyRecord[]> {
  const symClean = symbol.toUpperCase().trim();
  try {
    let query = supabase
      .from('painelvm_ml_studies')
      .select('*')
      .ilike('symbol', `%${symClean}%`);

    if (studyType === 'gamma_quant_study') {
      query = query.or('model_type.eq.gamma_quant_study,model_name.ilike.%gamma%');
    } else if (studyType === 'structural_pattern_study') {
      query = query.or('model_type.eq.structural_pattern_study,model_name.ilike.%spring%,model_name.ilike.%sweep%,model_name.ilike.%wyckoff%');
    } else if (studyType === 'tensorflow_patterns') {
      query = query.not('model_type', 'in', '("gamma_quant_study","structural_pattern_study")').not('model_name', 'ilike', '%gamma%');
    }

    const { data, error } = await query.order('last_run', { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((row: any) => ({
        id: row.id,
        symbol: row.symbol,
        model_name: row.model_name || `Axion ${row.symbol} Retest`,
        model_type: row.model_type || (
          row.model_name?.toLowerCase().includes('gamma') ? 'gamma_quant_study' :
          (row.model_name?.toLowerCase().includes('spring') || row.model_name?.toLowerCase().includes('sweep') || row.model_name?.toLowerCase().includes('wyckoff')) ? 'structural_pattern_study' :
          'tensorflow_patterns'
        ),
        tp_points: Number(row.tp_points) || 25.0,
        sl_points: Number(row.sl_points) || 12.0,
        last_run: row.last_run || row.created_at,
        data_start: row.data_start || '',
        data_end: row.data_end || '',
        total_candles: Number(row.total_candles) || 0,
        analyzed_samples: Number(row.analyzed_samples) || 0,
        test_samples: Number(row.test_samples) || 0,
        metrics: row.metrics || { accuracy: 0, auc: 0, high_confidence_precision: 0, baseline_winrate: 0 },
        active_features_count: Number(row.active_features_count) || (row.active_features?.length || 0),
        active_features: row.active_features || [],
        test_config: row.test_config || {},
        top_patterns: row.top_patterns || [],
        model_path: row.model_path,
        status: row.status || 'success'
      }));
    }
  } catch (err) {
    console.warn('[MLService] Falha ao consultar lista de estudos no Supabase:', err);
  }
  return [];
}

export async function deleteStudyFromSupabase(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('painelvm_ml_studies')
      .delete()
      .eq('id', id);
    return !error;
  } catch (err) {
    console.error('[MLService] Erro ao deletar estudo:', err);
    return false;
  }
}

export async function deleteAllStudiesFromSupabase(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('painelvm_ml_studies')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Deleta todos os registros

    clearLocalMLCache();
    return !error;
  } catch (err) {
    console.error('[MLService] Erro ao apagar todos os estudos:', err);
    return false;
  }
}

export function clearLocalMLCache(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('vortex_ml_studies_cache');
      delete (window as any).__vortex_ml_studies_cache;
    } catch (_) {}
  }
}

export async function saveStudyToSupabase(study: StudyRecord, modelName?: string, modelType?: string): Promise<boolean> {
  try {
    const mName = modelName || study.model_name || `Axion ${study.symbol.toUpperCase()} (+${study.tp_points || 25}/-${study.sl_points || 12})`;
    const mType = modelType || study.model_type || (mName.toLowerCase().includes('gamma') ? 'gamma_quant_study' : 'tensorflow_patterns');
    const payload = {
      symbol: study.symbol.toUpperCase(),
      model_name: mName,
      model_type: mType,
      tp_points: Number(study.tp_points || 25.0),
      sl_points: Number(study.sl_points || 12.0),
      last_run: study.last_run || new Date().toISOString(),
      data_start: study.data_start,
      data_end: study.data_end,
      total_candles: study.total_candles,
      analyzed_samples: study.analyzed_samples,
      test_samples: study.test_samples,
      metrics: study.metrics,
      active_features_count: study.active_features_count,
      active_features: study.active_features,
      test_config: study.test_config,
      top_patterns: study.top_patterns,
      model_path: study.model_path,
      is_active: true,
      status: study.status || 'success'
    };

    const { data: insertData, error } = await supabase
      .from('painelvm_ml_studies')
      .insert([payload])
      .select('id');

    if (error) {
      console.warn('[MLService] Erro ao salvar estudo no Supabase:', error.message);
      return false;
    }

    if (insertData && insertData.length > 0 && insertData[0]?.id) {
      study.id = insertData[0].id;
    }

    // Atualiza cache local
    if (typeof window !== 'undefined') {
      try {
        const cachedStr = localStorage.getItem('vortex_ml_studies_cache');
        const cached = cachedStr ? JSON.parse(cachedStr) : {};
        cached[study.symbol.toUpperCase()] = { ...study, model_name: mName };
        localStorage.setItem('vortex_ml_studies_cache', JSON.stringify(cached));
        (window as any).__vortex_ml_studies_cache = cached;
      } catch (e) {}
    }

    return true;
  } catch (err) {
    console.error('[MLService] Falha de conexão ao gravar estudo:', err);
    return false;
  }
}

export function getCachedMLStudies(): Record<string, StudyRecord> {
  if (typeof window !== 'undefined') {
    if ((window as any).__vortex_ml_studies_cache) {
      return (window as any).__vortex_ml_studies_cache;
    }
    try {
      const cached = localStorage.getItem('vortex_ml_studies_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        (window as any).__vortex_ml_studies_cache = parsed;
        return parsed;
      }
    } catch (e) {}
  }
  return {};
}


export function resolveAssetInstanceId(symbol: string): string {
  const s = (symbol || '').toUpperCase().trim();
  if (s === 'NQ' || s.includes('NASDAQ') || s.includes('MNQ')) return 'painel_principal_web';
  if (s === 'ES' || s.includes('SP500') || s.includes('MES')) return 'painel_sp500_web';
  if (s === 'GC' || s.includes('GOLD') || s.includes('MGC') || s.includes('XAU')) return 'painel_gold_web';
  if (s === 'YM' || s.includes('DOW') || s.includes('MYM') || s.includes('US30')) return 'painel_us30_web';
  if (s === 'CL' || s.includes('OIL') || s.includes('MCL') || s.includes('PETROLEO')) return 'painel_cl_web';
  return 'painel_principal_web';
}

export async function fetchAssetRange(symbol: string): Promise<AssetRangeInfo | null> {
  const symClean = symbol.toUpperCase().trim();
  const targetInstance = resolveAssetInstanceId(symClean);

  // 1. Consulta ultra-rápida indexada por instance_id (aproveita idx_painelvm_candles_1m_instance_timestamp)
  try {
    const [resFirst, resLast, resCount] = await Promise.all([
      supabase.from('painelvm_candles_1m')
        .select('timestamp')
        .eq('instance_id', targetInstance)
        .order('timestamp', { ascending: true })
        .limit(1),
      supabase.from('painelvm_candles_1m')
        .select('timestamp')
        .eq('instance_id', targetInstance)
        .order('timestamp', { ascending: false })
        .limit(1),
      supabase.from('painelvm_candles_1m')
        .select('*', { count: 'exact', head: true })
        .eq('instance_id', targetInstance)
    ]);

    if (resFirst.data && resFirst.data.length > 0 && resCount.count && resCount.count > 0) {
      return {
        symbol: symClean,
        data_start: resFirst.data[0].timestamp,
        data_end: resLast.data && resLast.data.length > 0 ? resLast.data[0].timestamp : 'N/A',
        total_candles: resCount.count
      };
    }
  } catch (err) {
    console.warn('[MLService] Falha ao consultar range por instance_id:', err);
  }

  // 2. Fallback buscando por symbol exato
  try {
    const [resFirst, resLast, resCount] = await Promise.all([
      supabase.from('painelvm_candles_1m')
        .select('timestamp')
        .eq('symbol', symClean)
        .order('timestamp', { ascending: true })
        .limit(1),
      supabase.from('painelvm_candles_1m')
        .select('timestamp')
        .eq('symbol', symClean)
        .order('timestamp', { ascending: false })
        .limit(1),
      supabase.from('painelvm_candles_1m')
        .select('*', { count: 'exact', head: true })
        .eq('symbol', symClean)
    ]);

    if (resFirst.data && resFirst.data.length > 0) {
      return {
        symbol: symClean,
        data_start: resFirst.data[0].timestamp,
        data_end: resLast.data && resLast.data.length > 0 ? resLast.data[0].timestamp : 'N/A',
        total_candles: resCount.count || 0
      };
    }
  } catch (err) {
    console.warn('[MLService] Falha ao consultar Supabase direto para range:', err);
  }

  // 3. Fallback via API do Hub
  try {
    const res = await fetchMLApi(`/api/ml/asset_range?symbol=${encodeURIComponent(symClean)}`, { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch {}

  return null;
}

export async function fetchMLSchedule(): Promise<MLScheduleConfig> {
  try {
    const res = await fetchMLApi('/api/ml/schedule', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return {
      enabled: false,
      time: '18:15',
      assets: ['NQ', 'ES', 'GC']
    };
  }
}

export async function saveMLSchedule(config: MLScheduleConfig): Promise<boolean> {
  try {
    const res = await fetchMLApi('/api/ml/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    return res.ok;
  } catch (err) {
    console.error('[MLService] Falha ao salvar agendamento:', err);
    return false;
  }
}

export async function fetchMLRunStatus(): Promise<MLRunStatus> {
  try {
    const res = await fetchMLApi('/api/ml/status', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { is_running: false };
  }
}

export async function triggerMLRetest(params: {
  symbol: string;
  epochs?: number;
  fetch_db?: boolean;
  config: TestConfigFlags;
  model_name?: string;
  tp_points?: number;
  sl_points?: number;
  study_type?: 'tensorflow_patterns' | 'gamma_quant';
  start_date?: string;
  end_date?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetchMLApi('/api/ml/run_study', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const data = await res.json();
    return {
      success: res.ok,
      message: data.message || (res.ok ? 'Remodelagem iniciada' : 'Erro ao iniciar')
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'O servidor local do Vortex (porta 8080) não está ativo no momento. Inicie no terminal com: "npm run hub" ou execute o script Python diretamente.'
    };
  }
}
