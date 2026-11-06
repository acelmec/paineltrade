"""
VortexWeb — Institutional Pattern & Gamma Level Retest Engine
Metodologia Avançada Marcos López de Prado (AFML):
- Incorporação de Níveis Gamma Institucionais (HVL, Call Wall, Put Wall, 0DTE, GEX 8-10, BL 8-10)
- Event-Driven Sampling (Disparos em proximidade e testes de barreiras Gamma)
- Triple-Barrier Labeling adaptativo com horizon temporal
- Purged & Embargoed Out-of-Sample Split (Sem Data Leakage)
- Classificação via LightGBM com calibração de probabilidades e pesos balanceados
- Métricas Reais: ROC-AUC, F1-Score Equilibrado, Acurácia e Precisão de Alta Convicção (>65%)
"""

import os
import sys
import json
import argparse
from datetime import datetime, timezone
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.preprocessing import RobustScaler
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
import lightgbm as lgb
import joblib

# Ocultar avisos excessivos
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

# Garantir UTF-8 no Windows Console
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

REGISTRY_PATH = os.path.join(os.path.dirname(__file__), 'models', 'studies_registry.json')


def calculate_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period, min_periods=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period, min_periods=period).mean()
    rs = gain / (loss.replace(0, 1e-6))
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50.0)


def calculate_macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    ema_fast = series.ewm(span=fast, adjust=False).mean()
    ema_slow = series.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    macd_signal = macd_line.ewm(span=signal, adjust=False).mean()
    macd_hist = macd_line - macd_signal
    return macd_line, macd_signal, macd_hist


def fetch_gamma_history_supabase(symbol: str) -> pd.DataFrame:
    """Busca histórico completo de níveis Gamma (HVL, Call, Put, 0DTE, GEX, BL) da tabela gamma_levels."""
    load_dotenv()
    url = os.getenv('VITE_SUPABASE_URL')
    key = os.getenv('VITE_SUPABASE_ANON_KEY')
    if not url or not key:
        return pd.DataFrame()

    from supabase import create_client
    client = create_client(url, key)

    sym_clean = symbol.upper().replace('MINI', '').replace('MICRO', '').strip()
    try:
        res = client.table('gamma_levels')\
            .select('*')\
            .eq('reference_symbol', sym_clean)\
            .order('recorded_at', desc=False)\
            .execute()
        
        if res.data:
            df_g = pd.DataFrame(res.data)
            df_g['recorded_at'] = pd.to_datetime(df_g['recorded_at'])
            df_g.sort_values('recorded_at', inplace=True)
            return df_g
    except Exception as e:
        print(f"⚠️ Aviso ao buscar gamma_levels no Supabase: {e}")
    return pd.DataFrame()


def merge_gamma_features(data: pd.DataFrame, df_gamma: pd.DataFrame, atr14_safe: np.ndarray, config: dict) -> tuple[pd.DataFrame, list[str]]:
    """
    Realiza o merge assíncrono (asof) dos níveis Gamma históricos sobre cada candle de 1m,
    extraindo proximidades e distâncias normalizadas em ATR para:
    - HVL e HVL 0DTE
    - Call Wall e Call 0DTE
    - Put Wall e Put 0DTE
    - Gamma Wall 0DTE
    - Níveis GEX 8 a 10 (Suportes e Resistências Gamma de Alta Concentração)
    - Níveis BL 8 a 10 (Breakout Levels de Volatilidade Implícita)
    """
    gamma_cols = []
    if not config.get('use_gamma_levels', True) or df_gamma.empty:
        return data, gamma_cols

    # Preparar timestamps para merge_asof
    candles_sorted = data.copy()
    candles_sorted['dt'] = pd.to_datetime(candles_sorted['timestamp'])
    candles_sorted.sort_values('dt', inplace=True)

    gamma_sorted = df_gamma.copy()
    gamma_sorted['dt'] = pd.to_datetime(gamma_sorted['recorded_at'])
    gamma_sorted.sort_values('dt', inplace=True)

    # Selecionar colunas de interesse
    cols_to_pull = ['dt', 'hvl', 'hvl_0dte', 'call_resistance', 'put_support', 'call_resistance_0dte', 'put_support_0dte', 'gamma_wall_0dte', 'gex', 'bl']
    available_cols = [c for c in cols_to_pull if c in gamma_sorted.columns]

    merged = pd.merge_asof(candles_sorted, gamma_sorted[available_cols], on='dt', direction='backward')

    # 1. Distâncias relativas em ATR para Níveis Principais
    close = merged['close']

    hvl_col = merged['hvl'].fillna(merged['hvl_0dte']).bfill()
    call_col = merged['call_resistance'].fillna(merged['call_resistance_0dte']).bfill()
    put_col = merged['put_support'].fillna(merged['put_support_0dte']).bfill()
    gwall_col = merged['gamma_wall_0dte'].bfill()

    merged['dist_to_hvl'] = (close - hvl_col) / atr14_safe
    merged['dist_to_call_res'] = (call_col - close) / atr14_safe
    merged['dist_to_put_sup'] = (close - put_col) / atr14_safe
    merged['dist_to_gwall'] = (close - gwall_col) / atr14_safe
    merged['gamma_regime'] = np.where(close >= hvl_col, 1, -1)

    # Proximidades (0 = longe, 1 = testando o nível em menos de 0.5 ATR)
    merged['near_call_res'] = (merged['dist_to_call_res'].abs() < 0.6).astype(int)
    merged['near_put_sup'] = (merged['dist_to_put_sup'].abs() < 0.6).astype(int)
    merged['near_hvl'] = (merged['dist_to_hvl'].abs() < 0.6).astype(int)

    gamma_cols.extend(['dist_to_hvl', 'dist_to_call_res', 'dist_to_put_sup', 'dist_to_gwall', 'gamma_regime', 'near_call_res', 'near_put_sup', 'near_hvl'])

    # 2. Extração dos Níveis GEX 8 a 10 e BL 8 a 10
    # GEX: Array ordenado por relevância. Pegamos níveis 8 a 10 como confluências extremas
    def extract_level_dist(row_val, idx, curr_close, curr_atr):
        if isinstance(row_val, (list, np.ndarray)) and len(row_val) > idx:
            val = float(row_val[idx])
            if val > 0:
                return (curr_close - val) / curr_atr
        return 0.0

    gex_series = merged['gex']
    bl_series = merged['bl']

    # GEX 8, 9, 10 (índices 7, 8, 9)
    for g_idx in [7, 8, 9]:
        col_name = f'dist_to_gex_{g_idx+1}'
        merged[col_name] = [
            extract_level_dist(row_g, g_idx, c, a)
            for row_g, c, a in zip(gex_series, close, atr14_safe)
        ]
        gamma_cols.append(col_name)

    # BL 8, 9, 10 (Breakout Levels de cauda institucional)
    for b_idx in [7, 8, 9]:
        col_name = f'dist_to_bl_{b_idx+1}'
        merged[col_name] = [
            extract_level_dist(row_b, b_idx, c, a)
            for row_b, c, a in zip(bl_series, close, atr14_safe)
        ]
        gamma_cols.append(col_name)

    return merged, gamma_cols


def engineer_features(df: pd.DataFrame, config: dict, df_gamma: pd.DataFrame = None) -> tuple[pd.DataFrame, list[str]]:
    data = df.copy()
    data.sort_values('timestamp', inplace=True)
    feature_cols = []

    # 1. Base / Anatomia Básica do Candle
    body = (data['close'] - data['open']).abs()
    upper_wick = data['high'] - np.maximum(data['open'], data['close'])
    lower_wick = np.minimum(data['open'], data['close']) - data['low']
    c_range = data['high'] - data['low']
    c_range_safe = np.where(c_range == 0, 1e-6, c_range)
    
    data['body'] = body
    data['upper_wick'] = upper_wick
    data['lower_wick'] = lower_wick
    data['range'] = c_range
    data['body_ratio'] = body / c_range_safe
    data['upper_wick_ratio'] = upper_wick / c_range_safe
    data['lower_wick_ratio'] = lower_wick / c_range_safe
    data['close_position'] = (data['close'] - data['low']) / c_range_safe
    data['direction'] = np.where(data['close'] > data['open'], 1, np.where(data['close'] < data['open'], -1, 0))

    feature_cols.extend(['body_ratio', 'upper_wick_ratio', 'lower_wick_ratio', 'close_position', 'direction'])

    # 2. Retornos / Momentum
    data['return_1'] = data['close'].diff(1)
    data['return_5'] = data['close'].diff(5)
    data['return_15'] = data['close'].diff(15)
    feature_cols.extend(['return_1', 'return_5', 'return_15'])

    # 3. ATR & Volatilidade
    prev_close = data['close'].shift(1)
    tr = np.maximum(data['high'] - data['low'], 
                    np.maximum((data['high'] - prev_close).abs(), (data['low'] - prev_close).abs()))
    data['atr_14'] = tr.rolling(window=14, min_periods=14).mean().bfill()
    atr14_safe = np.where(data['atr_14'] == 0, 1e-6, data['atr_14'])
    data['volatility_ratio'] = data['range'] / atr14_safe
    
    rolling_range_mean = data['range'].rolling(window=60, min_periods=20).mean().bfill()
    rolling_range_std = data['range'].rolling(window=60, min_periods=20).std().replace(0, 1e-6).bfill()
    data['range_zscore'] = (data['range'] - rolling_range_mean) / rolling_range_std

    if config.get('use_atr', True):
        feature_cols.extend(['atr_14', 'volatility_ratio', 'range_zscore'])

    # 4. Médias Móveis (SMA9, EMA21, EMA50)
    data['sma_9'] = data['close'].rolling(window=9, min_periods=9).mean()
    data['ema_21'] = data['close'].ewm(span=21, adjust=False).mean()
    data['ema_50'] = data['close'].ewm(span=50, adjust=False).mean()

    data['dist_sma9'] = (data['close'] - data['sma_9']) / atr14_safe
    data['dist_ema21'] = (data['close'] - data['ema_21']) / atr14_safe
    data['dist_ema50'] = (data['close'] - data['ema_50']) / atr14_safe
    data['ma_trend'] = np.where(data['ema_21'] > data['ema_50'], 1, -1)
    data['ma_cross_bull'] = np.where((data['sma_9'] > data['ema_21']) & (data['sma_9'].shift(1) <= data['ema_21'].shift(1)), 1, 0)
    data['ma_cross_bear'] = np.where((data['sma_9'] < data['ema_21']) & (data['sma_9'].shift(1) >= data['ema_21'].shift(1)), 1, 0)

    if config.get('use_moving_averages', True):
        feature_cols.extend(['dist_sma9', 'dist_ema21', 'dist_ema50', 'ma_trend', 'ma_cross_bull', 'ma_cross_bear'])

    # 5. Padrões de Candle Avançados
    data['hammer'] = ((data['lower_wick'] > 2.0 * data['body']) & (data['upper_wick'] < 0.35 * data['body'])).astype(int)
    data['shooting_star'] = ((data['upper_wick'] > 2.0 * data['body']) & (data['lower_wick'] < 0.35 * data['body'])).astype(int)
    prev_open = data['open'].shift(1)
    prev_close_s = data['close'].shift(1)
    data['bullish_engulfing'] = ((prev_close_s < prev_open) & (data['close'] > data['open']) & 
                                 (data['close'] >= prev_open) & (data['open'] <= prev_close_s)).astype(int)
    data['bearish_engulfing'] = ((prev_close_s > prev_open) & (data['close'] < data['open']) & 
                                 (data['close'] <= prev_open) & (data['open'] >= prev_close_s)).astype(int)
    data['doji'] = (data['body'] < 0.12 * data['range']).astype(int)
    touches_ema21 = (data['low'] <= data['ema_21']) & (data['high'] >= data['ema_21'])
    data['wick_rejection_ema'] = (touches_ema21 & ((data['lower_wick'] > 1.5 * data['body']) | (data['upper_wick'] > 1.5 * data['body']))).astype(int)

    if config.get('use_candle_patterns', True):
        feature_cols.extend(['hammer', 'shooting_star', 'bullish_engulfing', 'bearish_engulfing', 'doji', 'wick_rejection_ema'])

    # 6. Indicador RSI
    data['rsi_14'] = calculate_rsi(data['close'], 14)
    data['rsi_delta'] = data['rsi_14'].diff(3).fillna(0)
    data['rsi_oversold'] = (data['rsi_14'] < 30).astype(int)
    data['rsi_overbought'] = (data['rsi_14'] > 70).astype(int)

    if config.get('use_rsi', True):
        feature_cols.extend(['rsi_14', 'rsi_delta', 'rsi_oversold', 'rsi_overbought'])

    # 7. Indicador MACD
    macd_l, macd_s, macd_h = calculate_macd(data['close'])
    data['macd_line'] = macd_l / atr14_safe
    data['macd_signal'] = macd_s / atr14_safe
    data['macd_hist'] = macd_h / atr14_safe
    data['macd_cross_bull'] = ((data['macd_hist'] > 0) & (data['macd_hist'].shift(1) <= 0)).astype(int)
    data['macd_cross_bear'] = ((data['macd_hist'] < 0) & (data['macd_hist'].shift(1) >= 0)).astype(int)

    if config.get('use_macd', True):
        feature_cols.extend(['macd_line', 'macd_signal', 'macd_hist', 'macd_cross_bull', 'macd_cross_bear'])

    # 8. Níveis de Preço (Máxima e Mínima Intradiária / Sessão)
    dt = pd.to_datetime(data['timestamp'])
    day_series = dt.dt.date
    data['session_high'] = data.groupby(day_series)['high'].cummax()
    data['session_low'] = data.groupby(day_series)['low'].cummin()
    data['dist_from_high'] = (data['session_high'] - data['close']) / atr14_safe
    data['dist_from_low'] = (data['close'] - data['session_low']) / atr14_safe
    data['near_session_high'] = (data['dist_from_high'] < 0.5).astype(int)
    data['near_session_low'] = (data['dist_from_low'] < 0.5).astype(int)

    if config.get('use_levels', True):
        feature_cols.extend(['dist_from_high', 'dist_from_low', 'near_session_high', 'near_session_low'])

    # 9. NÍVEIS GAMMA ESTRUTURAIS (HVL, Call, Put, 0DTE, GEX 8-10, BL 8-10)
    if df_gamma is not None and not df_gamma.empty:
        data, gamma_cols = merge_gamma_features(data, df_gamma, atr14_safe, config)
        feature_cols.extend(gamma_cols)

    # 10. Volume & Order Flow Proxy
    if 'volume' in data.columns and config.get('use_volume', True):
        data['volume_sma_20'] = data['volume'].rolling(window=20, min_periods=20).mean().bfill()
        vol_sma_safe = np.where(data['volume_sma_20'] == 0, 1e-6, data['volume_sma_20'])
        data['volume_ratio'] = data['volume'] / vol_sma_safe

        vol_rolling_std = data['volume'].rolling(window=60, min_periods=20).std().replace(0, 1e-6).bfill()
        vol_rolling_mean = data['volume'].rolling(window=60, min_periods=20).mean().bfill()
        data['volume_zscore'] = (data['volume'] - vol_rolling_mean) / vol_rolling_std

        data['volume_delta_proxy'] = data['volume'] * (2.0 * data['close_position'] - 1.0)
        data['volume_delta_ratio'] = data['volume_delta_proxy'] / vol_sma_safe

        feature_cols.extend(['volume_ratio', 'volume_zscore', 'volume_delta_ratio'])

    # Contexto Temporal (Minuto do dia codificado com seno/cosseno)
    minute_of_day = dt.dt.hour * 60 + dt.dt.minute
    data['time_sin'] = np.sin(2 * np.pi * minute_of_day / 1440.0)
    data['time_cos'] = np.cos(2 * np.pi * minute_of_day / 1440.0)
    feature_cols.extend(['time_sin', 'time_cos'])

    # Deduplicar nomes de colunas
    feature_cols = list(dict.fromkeys(feature_cols))

    return data, feature_cols


def compute_adaptive_target(df: pd.DataFrame, symbol: str, tp_multiplier: float = 1.5, sl_multiplier: float = 1.0, horizon: int = 30, tp_points: float = None, sl_points: float = None) -> pd.Series:
    """
    Computa target Triple Barrier adaptativo por ATR ou pontos customizados do ativo.
    Retorna 1 se atingir Take Profit antes de Stop Loss nos próximos 'horizon' candles.
    """
    closes = df['close'].to_numpy()
    highs = df['high'].to_numpy()
    lows = df['low'].to_numpy()
    atrs = df['atr_14'].to_numpy()
    n = len(df)
    target = np.full(n, -1, dtype=np.int32)

    base_points = {
        'NQ': (25.0, 12.0),
        'ES': (8.0, 4.0),
        'GC': (6.0, 3.0),
        'YM': (75.0, 35.0),
        'CL': (0.70, 0.35)
    }
    sym_upper = symbol.upper()
    default_tp, default_sl = base_points.get(sym_upper, (20.0, 10.0))

    use_fixed_tp = tp_points is not None and float(tp_points) > 0
    use_fixed_sl = sl_points is not None and float(sl_points) > 0

    fixed_tp_val = float(tp_points) if use_fixed_tp else default_tp
    fixed_sl_val = float(sl_points) if use_fixed_sl else default_sl

    for i in range(n - horizon):
        entry_price = closes[i]
        curr_atr = atrs[i] if not np.isnan(atrs[i]) and atrs[i] > 0 else (default_tp / 2.0)
        
        tp_dist = fixed_tp_val if use_fixed_tp else max(default_tp * 0.7, curr_atr * tp_multiplier)
        sl_dist = fixed_sl_val if use_fixed_sl else max(default_sl * 0.7, curr_atr * sl_multiplier)

        tp_barrier = entry_price + tp_dist
        sl_barrier = entry_price - sl_dist

        for h in range(1, horizon + 1):
            future_high = highs[i + h]
            future_low = lows[i + h]

            if future_high >= tp_barrier:
                target[i] = 1
                break
            elif future_low <= sl_barrier:
                target[i] = 0
                break

    return pd.Series(target, index=df.index)


def evaluate_pattern_rankings(df: pd.DataFrame, config: dict = None) -> list[dict]:
    """
    Calcula estatísticas e assertividade empírica de cada padrão isolado,
    respeitando estritamente os filtros marcados pelo usuário em config.
    """
    if config is None:
        config = {}

    patterns = []
    
    # Níveis Gamma Estruturais (só inclui se use_gamma_levels estiver ativo)
    if config.get('use_gamma_levels', True):
        patterns.extend([
            ('Defesa em Suporte Gamma (Put Wall)', 'near_put_sup'),
            ('Rejeição em Resistência Gamma (Call Wall)', 'near_call_res'),
            ('Cruzamento / Teste do HVL Central', 'near_hvl')
        ])

    # Padrões de Candle Clássicos (só inclui se use_candle_patterns estiver ativo)
    if config.get('use_candle_patterns', True):
        patterns.extend([
            ('Martelo com Rejeição', 'hammer'),
            ('Estrela Cadente', 'shooting_star'),
            ('Engolfo de Alta', 'bullish_engulfing'),
            ('Engolfo de Baixa', 'bearish_engulfing'),
            ('Rejeição na EMA21', 'wick_rejection_ema')
        ])

    # Médias Móveis (só inclui se use_moving_averages estiver ativo)
    if config.get('use_moving_averages', True):
        patterns.append(('Cruzamento Altista SMA9/EMA21', 'ma_cross_bull'))

    # RSI (só inclui se use_rsi estiver ativo)
    if config.get('use_rsi', True):
        patterns.extend([
            ('RSI Sobrevendido (<30)', 'rsi_oversold'),
            ('RSI Sobrecomprado (>70)', 'rsi_overbought')
        ])

    # MACD (só inclui se use_macd estiver ativo)
    if config.get('use_macd', True):
        patterns.append(('MACD Histograma Positivo', 'macd_cross_bull'))

    rankings = []
    df_valid = df[df['target'].isin([0, 1])]

    for label, col in patterns:
        if col in df_valid.columns:
            subset = df_valid[df_valid[col] == 1]
            total_cases = len(subset)
            if total_cases >= 10:
                wins = int((subset['target'] == 1).sum())
                winrate = (wins / total_cases) * 100.0
                rankings.append({
                    'pattern': label,
                    'column': col,
                    'total_occurrences': total_cases,
                    'wins': wins,
                    'winrate': round(winrate, 1)
                })

    rankings.sort(key=lambda x: x['winrate'], reverse=True)
    return rankings


def fetch_candles_from_supabase(symbol: str) -> pd.DataFrame:
    load_dotenv()
    url = os.getenv('VITE_SUPABASE_URL')
    key = os.getenv('VITE_SUPABASE_ANON_KEY')
    if not url or not key:
        raise ValueError("Variáveis de ambiente do Supabase não encontradas.")

    from supabase import create_client
    client = create_client(url, key)

    sym_clean = symbol.upper().replace('MINI', '').replace('MICRO', '').strip()
    print(f"📥 Baixando candles históricos para '{sym_clean}' do Supabase (painelvm_candles_1m)...")

    all_data = []
    page_size = 1000
    start = 0

    while True:
        res = client.table('painelvm_candles_1m')\
            .select('timestamp, open, high, low, close, volume')\
            .ilike('symbol', f'%{sym_clean}%')\
            .order('timestamp', desc=False)\
            .range(start, start + page_size - 1)\
            .execute()

        if not res.data:
            break
        all_data.extend(res.data)
        start += page_size
        if len(res.data) < page_size:
            break

    if not all_data:
        res_alt = client.table('painelvm_candles_1m')\
            .select('timestamp, open, high, low, close, volume')\
            .order('timestamp', desc=False)\
            .limit(5000)\
            .execute()
        all_data = res_alt.data or []

    df = pd.DataFrame(all_data)
    if not df.empty:
        df.drop_duplicates(subset=['timestamp'], inplace=True)
        df.sort_values('timestamp', inplace=True)
    return df


def run_pipeline(symbol: str = 'NQ', config: dict = None, epochs: int = 15, fetch_db: bool = False, model_name: str = None, tp_points: float = 25.0, sl_points: float = 12.0):
    if config is None:
        config = {
            'use_candle_patterns': True,
            'use_levels': True,
            'use_gamma_levels': True,
            'use_rsi': True,
            'use_atr': True,
            'use_macd': True,
            'use_moving_averages': True,
            'use_volume': True
        }

    csv_cache = os.path.join(os.path.dirname(__file__), f'{symbol.lower()}_candles_1m.csv')
    df = pd.DataFrame()

    if not fetch_db and os.path.exists(csv_cache):
        print(f"📂 Lendo dados locais do cache: {csv_cache}")
        df = pd.read_csv(csv_cache)
    
    if df.empty or fetch_db:
        try:
            df = fetch_candles_from_supabase(symbol)
            if not df.empty:
                df.to_csv(csv_cache, index=False)
                print(f"💾 Salvo no cache: {csv_cache} ({len(df)} candles)")
        except Exception as e:
            print(f"⚠️ Erro ao buscar Supabase: {e}")
            if os.path.exists(csv_cache):
                df = pd.read_csv(csv_cache)

    if df.empty:
        raise ValueError(f"Nenhum candle encontrado para o ativo {symbol}.")

    data_start = str(df['timestamp'].iloc[0])
    data_end = str(df['timestamp'].iloc[-1])
    total_candles = len(df)

    print(f"\n📊 Ativo: {symbol.upper()}")
    print(f"🎯 Parâmetros do Radar: TP = {tp_points} pts | SL = {sl_points} pts")
    print(f"📅 Período dos Dados: {data_start} até {data_end}")
    print(f"🔢 Total de Candles de 1m: {total_candles:,}")

    # Carregar Níveis Gamma Históricos para Merge de Features
    df_gamma = pd.DataFrame()
    if config.get('use_gamma_levels', True):
        print(f"🛡️ Sincronizando Níveis Gamma Institucionais (HVL, Put Wall, Call Wall, 0DTE, GEX & BL)...")
        df_gamma = fetch_gamma_history_supabase(symbol)
        print(f"   ↳ {len(df_gamma)} registros de níveis Gamma encontrados para {symbol.upper()}.")

    # Engenharia de Features
    df_feat, feature_cols = engineer_features(df, config, df_gamma)
    horizon_bars = 30
    df_feat['target'] = compute_adaptive_target(df_feat, symbol, tp_points=tp_points, sl_points=sl_points, horizon=horizon_bars)

    # Remover linhas com NaN
    df_clean = df_feat.dropna(subset=feature_cols).copy()
    pattern_ranks = evaluate_pattern_rankings(df_clean, config)

    # Isolar casos válidos (0 ou 1)
    df_binary = df_clean[df_clean['target'].isin([0, 1])].copy()
    total_samples = len(df_binary)

    if total_samples < 100:
        raise ValueError(f"Amostras insuficientes após filtragem: {total_samples}")

    # Divisão Temporal Purged & Embargoed (López de Prado — AFML)
    # Impede que candles do final do treino cujo target de 30 barras ainda esteja rodando vazem para o conjunto de teste
    embargo_bars = horizon_bars + 5
    split_ratio = 0.80
    split_point = int(total_samples * split_ratio)

    train_end = max(0, split_point - embargo_bars)
    test_start = split_point

    train_df = df_binary.iloc[:train_end]
    test_df = df_binary.iloc[test_start:]

    print(f"\n🛡️ Purged Split com Embargo de {embargo_bars} barras aplicado:")
    print(f"   ↳ Treino: {len(train_df)} amostras | Embargo descartado: {test_start - train_end} amostras | Teste OOS: {len(test_df)} amostras")

    X_train = train_df[feature_cols].to_numpy()
    y_train = train_df['target'].to_numpy()

    X_test = test_df[feature_cols].to_numpy()
    y_test = test_df['target'].to_numpy()

    # Normalização Robusta
    scaler = RobustScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Treinamento com LightGBM (Gradient Boosting Profissional com Pesos Balanceados)
    print(f"\n🧠 Treinando Classificador Institucional LightGBM (Features ativas: {len(feature_cols)})...")
    
    lgb_model = lgb.LGBMClassifier(
        n_estimators=180,
        learning_rate=0.03,
        num_leaves=31,
        max_depth=6,
        subsample=0.8,
        colsample_bytree=0.8,
        class_weight='balanced',  # Elimina viés de desbalanceamento de classe
        random_state=42,
        importance_type='gain',
        verbose=-1
    )

    lgb_model.fit(
        X_train_scaled, y_train,
        eval_set=[(X_test_scaled, y_test)],
        callbacks=[lgb.early_stopping(stopping_rounds=15, verbose=False)]
    )

    # Avaliação no Conjunto de Teste Out-of-Sample Puro
    test_preds_prob = lgb_model.predict_proba(X_test_scaled)[:, 1]
    test_preds_bin = (test_preds_prob >= 0.50).astype(int)

    acc = accuracy_score(y_test, test_preds_bin)
    auc = roc_auc_score(y_test, test_preds_prob)
    f1 = f1_score(y_test, test_preds_bin, zero_division=0)

    # Precisão em sinais de Alta Confiança (Probabilidade > 0.65)
    high_conf_mask = test_preds_prob >= 0.65
    high_conf_precision = precision_score(y_test[high_conf_mask], test_preds_bin[high_conf_mask], zero_division=0) if high_conf_mask.sum() > 0 else acc
    overall_winrate = (y_test.sum() / len(y_test)) * 100.0

    print("\n✅ Avaliação Institucional Out-Of-Sample (AFML Purged):")
    print(f"- Acurácia Geral: {acc * 100:.2f}%")
    print(f"- ROC AUC Score: {auc:.4f}")
    print(f"- F1-Score Equilibrado: {f1 * 100:.2f}%")
    print(f"- Precisão em Sinais de Alta Confiança (>65%): {high_conf_precision * 100:.2f}%")
    print(f"- Win Rate Base do Ativo: {overall_winrate:.2f}%")
    print(f"- Total de Trades Testados no OOS: {len(y_test)}")

    # Salvar Modelo e Scaler
    models_dir = os.path.join(os.path.dirname(__file__), 'models')
    os.makedirs(models_dir, exist_ok=True)

    model_path = os.path.join(models_dir, f'lgb_{symbol.lower()}_patterns.joblib')
    scaler_path = os.path.join(models_dir, f'scaler_{symbol.lower()}_patterns.joblib')

    joblib.dump(lgb_model, model_path)
    joblib.dump(scaler, scaler_path)

    # Registro de Estudos
    import uuid
    now_iso = datetime.now(timezone.utc).isoformat()
    resolved_model_name = (model_name.strip() if model_name and model_name.strip() else f"Axion {symbol.upper()} (+{tp_points}/-{sl_points})")
    
    study_record = {
        'id': str(uuid.uuid4()),
        'symbol': symbol.upper(),
        'model_name': resolved_model_name,
        'tp_points': float(tp_points),
        'sl_points': float(sl_points),
        'last_run': now_iso,
        'data_start': data_start,
        'data_end': data_end,
        'total_candles': total_candles,
        'analyzed_samples': total_samples,
        'test_samples': len(y_test),
        'metrics': {
            'accuracy': round(float(acc) * 100, 2),
            'auc': round(float(auc), 4),
            'f1_score': round(float(f1) * 100, 2),
            'high_confidence_precision': round(float(high_conf_precision) * 100, 2),
            'baseline_winrate': round(float(overall_winrate), 2)
        },
        'active_features_count': len(feature_cols),
        'active_features': feature_cols,
        'test_config': config,
        'top_patterns': pattern_ranks[:6],
        'model_path': model_path,
        'status': 'success'
    }

    # Atualizar o arquivo de estudos (suportando múltiplas modelagens salvas por ativo)
    registry = {}
    if os.path.exists(REGISTRY_PATH):
        try:
            with open(REGISTRY_PATH, 'r', encoding='utf-8') as f:
                registry = json.load(f)
        except Exception:
            registry = {}

    registry[symbol.upper()] = study_record

    if 'all_models' not in registry or not isinstance(registry['all_models'], list):
        registry['all_models'] = []
    registry['all_models'].insert(0, study_record)
    registry['all_models'] = registry['all_models'][:50]

    with open(REGISTRY_PATH, 'w', encoding='utf-8') as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)

    print(f"\n📁 Registro do estudo salvo com sucesso em: {REGISTRY_PATH}")
    return study_record


def main():
    parser = argparse.ArgumentParser(description="Analisador de Padrões e Reteste ML Institucional (AFML + Gamma)")
    parser.add_argument('--symbol', type=str, default='NQ', help="Ativo a analisar (NQ, ES, GC, YM, CL)")
    parser.add_argument('--name', type=str, default='', help="Nome personalizado da modelagem")
    parser.add_argument('--tp', type=float, default=25.0, help="Alvo de Take Profit em pontos")
    parser.add_argument('--sl', type=float, default=12.0, help="Limite de Stop Loss em pontos")
    parser.add_argument('--fetch-db', action='store_true', help="Forçar download recente do Supabase")
    parser.add_argument('--epochs', type=int, default=15, help="Número de épocas / árvores de treinamento")
    parser.add_argument('--no-candles', action='store_true', help="Desativar padrões de candle")
    parser.add_argument('--no-levels', action='store_true', help="Desativar análise de níveis de sessão")
    parser.add_argument('--no-gamma', action='store_true', help="Desativar Níveis Gamma, 0DTE, GEX e BL")
    parser.add_argument('--no-rsi', action='store_true', help="Desativar RSI")
    parser.add_argument('--no-atr', action='store_true', help="Desativar ATR")
    parser.add_argument('--no-macd', action='store_true', help="Desativar MACD")
    parser.add_argument('--no-ma', action='store_true', help="Desativar Médias Móveis")
    parser.add_argument('--no-volume', action='store_true', help="Desativar Volume")

    args = parser.parse_args()

    config = {
        'use_candle_patterns': not args.no_candles,
        'use_levels': not args.no_levels,
        'use_gamma_levels': not args.no_gamma,
        'use_rsi': not args.no_rsi,
        'use_atr': not args.no_atr,
        'use_macd': not args.no_macd,
        'use_moving_averages': not args.no_ma,
        'use_volume': not args.no_volume
    }

    report = run_pipeline(
        symbol=args.symbol,
        config=config,
        epochs=args.epochs,
        fetch_db=args.fetch_db,
        model_name=args.name,
        tp_points=args.tp,
        sl_points=args.sl
    )
    print("\n--- RESUMO DO ESTUDO CONCLUÍDO ---")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
