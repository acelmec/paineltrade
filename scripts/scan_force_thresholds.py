import os, sys, numpy as np, pandas as pd

TZ_BRT = 'America/Sao_Paulo'
TZ_NY  = 'America/New_York'
BASE   = os.path.join('data', 'databento')

print("Carregando CSVs...", flush=True)
candles_nq = pd.read_csv(os.path.join(BASE, 'NQ_1m_BRT.csv'), parse_dates=['time_brt'], index_col='time_brt')
candles_es = pd.read_csv(os.path.join(BASE, 'ES_1m_BRT.csv'), parse_dates=['time_brt'], index_col='time_brt')
force_df   = pd.read_csv(os.path.join(BASE, 'nasdaq_force_365d_BRT.csv'), parse_dates=['timestamp'], index_col='timestamp')

for c in [candles_nq, candles_es, force_df]:
    if c.index.tz is None: c.index = c.index.tz_localize(TZ_BRT)
    else: c.index = c.index.tz_convert(TZ_BRT)

start_365 = pd.Timestamp('2025-11-11 00:00:00', tz=TZ_BRT)
end_365   = pd.Timestamp('2026-11-10 23:59:00', tz=TZ_BRT)

def test_asset(name, c_df, tp, sl):
    df = c_df.loc[(c_df.index >= start_365) & (c_df.index <= end_365)].join(force_df, how='inner')
    df['ny_time'] = df.index.tz_convert(TZ_NY)
    df['ny_date'] = df['ny_time'].dt.date
    df['ny_hm']   = df['ny_time'].dt.strftime('%H:%M')
    tech_cols = ['nvidia_compra', 'microsoft_compra', 'apple_compra', 'meta_compra', 'amazon_compra', 'alphabet_compra', 'tesla_compra']
    df['tech_compra'] = df[tech_cols].mean(axis=1)

    # Pré-extrai dados dos dias (uma única vez)
    day_samples = []
    for d, day_df in df.groupby('ny_date'):
        m5 = day_df[day_df['ny_hm'] == '09:35']
        if len(m5) == 0: continue
        f_m5 = m5.iloc[0]['forca_final_compra']
        tech = m5.iloc[0]['tech_compra']
        post = day_df[day_df['ny_hm'] >= '09:35'].head(60)
        if len(post) == 0: continue
        entry = post.iloc[0]['open']
        highs = post['high'].values
        lows  = post['low'].values
        last_c = post.iloc[-1]['close']
        day_samples.append((f_m5, tech, entry, highs, lows, last_c))
        
    print(f"\n{'='*75}\nVARREDURA FINA DE FORÇA (52% A 70%) NO SETUP T5 (M5): {name}\n{'='*75}", flush=True)
    for f_th in range(52, 71):
        trades = []
        for f_m5, tech, entry, highs, lows, last_c in day_samples:
            sig = 0
            if f_m5 >= f_th and tech >= 50.0: sig = 1
            elif f_m5 <= (100 - f_th) and tech <= 50.0: sig = -1
            
            if sig != 0:
                cur_sl = -sl
                pnl = 0.0
                for h, l in zip(highs, lows):
                    fav = (h - entry) if sig == 1 else (entry - l)
                    adv = (l - entry) if sig == 1 else (entry - h)
                    if adv <= cur_sl: pnl = cur_sl; break
                    if fav >= tp: pnl = tp; break
                else:
                    pnl = (last_c - entry) * sig
                trades.append(pnl)
        if len(trades) > 0:
            w = np.mean([1 if t > 0 else 0 for t in trades]) * 100
            tot = np.sum(trades)
            avg = np.mean(trades)
            print(f"Força >= {f_th:2d}% | N={len(trades):3d} trades | Win={w:5.1f}% | Méd/Trade={avg:+6.2f} pts | Total={tot:+8.1f} pts", flush=True)

test_asset('NASDAQ (NQ)', candles_nq, 110.0, 75.0)
test_asset('S&P 500 (ES)', candles_es, 16.0, 11.0)
