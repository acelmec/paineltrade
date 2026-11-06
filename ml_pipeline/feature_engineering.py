import numpy as np
import pandas as pd


def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes all specified technical and anatomical features for NQ 1m candles.
    Guarantees no future lookahead (strict point-in-time calculation).
    """
    data = df.copy()
    
    # 1. Anatomia do Candle
    body = (data['close'] - data['open']).abs()
    upper_wick = data['high'] - np.maximum(data['open'], data['close'])
    lower_wick = np.minimum(data['open'], data['close']) - data['low']
    c_range = data['high'] - data['low']
    # Evitar divisão por zero usando clip pequeno
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

    # 2. Retornos e Momentum (em pontos absolutos)
    data['return_1'] = data['close'].diff(1)
    data['return_5'] = data['close'].diff(5)
    data['return_15'] = data['close'].diff(15)
    data['return_30'] = data['close'].diff(30)

    # 3. Volatilidade (ATR & Z-Score)
    # True Range = max(high - low, abs(high - close_prev), abs(low - close_prev))
    prev_close = data['close'].shift(1)
    tr1 = data['high'] - data['low']
    tr2 = (data['high'] - prev_close).abs()
    tr3 = (data['low'] - prev_close).abs()
    tr = np.maximum(tr1, np.maximum(tr2, tr3))
    
    # ATR simples / rolling mean
    data['atr_14'] = tr.rolling(window=14, min_periods=14).mean()
    data['atr_5'] = tr.rolling(window=5, min_periods=5).mean()
    atr14_safe = np.where(data['atr_14'].isna() | (data['atr_14'] == 0), 1e-6, data['atr_14'])
    data['volatility_ratio'] = data['range'] / atr14_safe
    
    # range_zscore (usando rolling 60 para evitar lookahead bias global)
    rolling_range_mean = data['range'].rolling(window=60, min_periods=20).mean()
    rolling_range_std = data['range'].rolling(window=60, min_periods=20).std()
    rolling_range_std_safe = np.where(rolling_range_std == 0, 1e-6, rolling_range_std)
    data['range_zscore'] = (data['range'] - rolling_range_mean) / rolling_range_std_safe

    # 4. Contexto Relativo
    data['sma_20'] = data['close'].rolling(window=20, min_periods=20).mean()
    data['sma_60'] = data['close'].rolling(window=60, min_periods=60).mean()
    data['dist_from_sma20'] = data['close'] - data['sma_20']
    data['dist_from_sma60'] = data['close'] - data['sma_60']
    
    std_20 = data['close'].rolling(window=20, min_periods=20).std()
    std_20_safe = np.where((std_20.isna()) | (std_20 == 0), 1e-6, std_20)
    data['zscore_20'] = (data['close'] - data['sma_20']) / std_20_safe

    # Sessão diária (máxima e mínima acumulada do dia local)
    # Parse timestamp para extrair dia
    dt = pd.to_datetime(data['timestamp'])
    day_series = dt.dt.date
    data['session_high'] = data.groupby(day_series)['high'].cummax()
    data['session_low'] = data.groupby(day_series)['low'].cummin()
    data['dist_from_high'] = data['session_high'] - data['close']
    data['dist_from_low'] = data['close'] - data['session_low']

    # 5. Padrões de Candle (booleanos -> 1 ou 0)
    # hammer: lower_wick > 2*body AND upper_wick < 0.3*body
    # shooting_star: upper_wick > 2*body AND lower_wick < 0.3*body
    # strong_candle: body > 0.7 * atr_14
    # doji: body < 0.1 * range
    data['hammer'] = ((data['lower_wick'] > 2 * data['body']) & (data['upper_wick'] < 0.3 * data['body'])).astype(int)
    data['shooting_star'] = ((data['upper_wick'] > 2 * data['body']) & (data['lower_wick'] < 0.3 * data['body'])).astype(int)
    data['strong_candle'] = (data['body'] > 0.7 * data['atr_14']).astype(int)
    data['doji'] = (data['body'] < 0.1 * data['range']).astype(int)

    # 6. Contexto Temporal (codificação cíclica)
    # minuto_do_dia = hour * 60 + minute
    minute_of_day = dt.dt.hour * 60 + dt.dt.minute
    data['time_sin'] = np.sin(2 * np.pi * minute_of_day / 1440.0)
    data['time_cos'] = np.cos(2 * np.pi * minute_of_day / 1440.0)

    # 7. Volume
    data['volume_sma_20'] = data['volume'].rolling(window=20, min_periods=20).mean()
    vol_sma_safe = np.where((data['volume_sma_20'].isna()) | (data['volume_sma_20'] == 0), 1e-6, data['volume_sma_20'])
    data['volume_ratio'] = data['volume'] / vol_sma_safe

    return data


def compute_triple_barrier_buy_target(
    df: pd.DataFrame,
    tp_points: float = 25.0,
    sl_points: float = 12.0,
    horizon_candles: int = 30
) -> pd.Series:
    """
    Computes Triple Barrier Label for LONG / BUY:
    - 1: TP (+25) hit before SL (-12) within 30 candles
    - 0: SL (-12) hit before TP (+25) within 30 candles
    - -1: Neither barrier hit before horizon expires
    """
    n = len(df)
    labels = np.full(n, -1, dtype=int)
    
    closes = df['close'].to_numpy()
    highs = df['high'].to_numpy()
    lows = df['low'].to_numpy()
    
    for i in range(n):
        entry_price = closes[i]
        upper_barrier = entry_price + tp_points
        lower_barrier = entry_price - sl_points
        
        end_idx = min(i + 1 + horizon_candles, n)
        
        for k in range(i + 1, end_idx):
            h = highs[k]
            l = lows[k]
            hit_tp = h >= upper_barrier
            hit_sl = l <= lower_barrier
            
            if hit_tp and hit_sl:
                labels[i] = 0
                break
            elif hit_tp:
                labels[i] = 1
                break
            elif hit_sl:
                labels[i] = 0
                break
                
    return pd.Series(labels, index=df.index, name='target_buy')


def compute_triple_barrier_sell_target(
    df: pd.DataFrame,
    tp_points: float = 25.0,
    sl_points: float = 12.0,
    horizon_candles: int = 30
) -> pd.Series:
    """
    Computes Triple Barrier Label for SHORT / SELL:
    - 1: Price drops tp_points (-25) before rising sl_points (+12) within 30 candles
    - 0: Price rises sl_points (+12) before dropping tp_points (-25) within 30 candles
    - -1: Neither barrier hit before horizon expires
    """
    n = len(df)
    labels = np.full(n, -1, dtype=int)
    
    closes = df['close'].to_numpy()
    highs = df['high'].to_numpy()
    lows = df['low'].to_numpy()
    
    for i in range(n):
        entry_price = closes[i]
        tp_barrier = entry_price - tp_points   # Cai 25 pontos (Take Profit da Venda)
        sl_barrier = entry_price + sl_points   # Sobe 12 pontos (Stop Loss da Venda)
        
        end_idx = min(i + 1 + horizon_candles, n)
        
        for k in range(i + 1, end_idx):
            h = highs[k]
            l = lows[k]
            hit_tp = l <= tp_barrier
            hit_sl = h >= sl_barrier
            
            if hit_tp and hit_sl:
                labels[i] = 0
                break
            elif hit_tp:
                labels[i] = 1
                break
            elif hit_sl:
                labels[i] = 0
                break
                
    return pd.Series(labels, index=df.index, name='target_sell')


