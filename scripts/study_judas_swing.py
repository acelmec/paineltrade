import pandas as pd
import numpy as np
from datetime import datetime, time, timedelta

df_nq = pd.read_csv('data/databento/NQ_1m_BRT.csv')
df_es = pd.read_csv('data/databento/ES_1m_BRT.csv')
for df in [df_nq, df_es]:
    df['dt'] = pd.to_datetime(df['time_brt'])
    df['date'] = df['dt'].dt.date
    df['time'] = df['dt'].dt.time

def get_london_open(dt):
    year = dt.year
    mar31 = datetime(year, 3, 31)
    last_sun_mar = mar31 - timedelta(days=(mar31.weekday() + 1) % 7)
    oct31 = datetime(year, 10, 31)
    last_sun_oct = oct31 - timedelta(days=(oct31.weekday() + 1) % 7)
    return time(4, 0) if last_sun_mar.date() <= dt.date() < last_sun_oct.date() else time(5, 0)

for name, df, pt_val, tick in [('NQ', df_nq, 20.0, 0.25), ('ES', df_es, 50.0, 0.25)]:
    days = sorted(df['date'].unique())
    judas_trades = []
    
    for d in days:
        dt_day = datetime.combine(d, time(0, 0))
        l_time = get_london_open(dt_day)
        day_data = df[df['date'] == d].sort_values('dt')
        
        # Ásia: 00:00 até l_time
        asia = day_data[(day_data['time'] >= time(0, 0)) & (day_data['time'] < l_time)]
        if len(asia) < 30: continue
        asia_high = asia['high'].max()
        asia_low = asia['low'].min()
        asia_range = asia_high - asia_low
        if asia_range <= 0: continue
        
        # Primeiras 2 horas de Londres: l_time até l_time + 120m
        l_end = (datetime.combine(d, l_time) + timedelta(minutes=120)).time()
        london = day_data[(day_data['time'] >= l_time) & (day_data['time'] <= l_end)]
        if len(london) < 30: continue
        
        # Detecta rompimento do extremo asiático
        # Caso 1: varre Asia High (Bearish Judas)
        swept_high = london[london['high'] > asia_high]
        if not swept_high.empty:
            first_sweep = swept_high.iloc[0]
            sweep_idx = swept_high.index[0]
            post_sweep = london.loc[sweep_idx:]
            
            # Aguarda a primeira vela fechar de baixa (rejeição) para entrar na venda
            reversal_candles = post_sweep[post_sweep['close'] < post_sweep['open']]
            if not reversal_candles.empty:
                rev_c = reversal_candles.iloc[0]
                entry_p = rev_c['close']
                tp_p = entry_p - (0.50 * asia_range)
                sl_p = post_sweep['high'].max() + (4 * tick) # Stop logo acima da máxima da varredura
                
                sub_future = post_sweep.loc[rev_c.name:]
                win = False
                pnl = -(sl_p - entry_p)
                for _, r in sub_future.iloc[1:].iterrows():
                    if r['low'] <= tp_p:
                        win = True
                        pnl = (entry_p - tp_p)
                        break
                    if r['high'] >= sl_p:
                        win = False
                        pnl = -(sl_p - entry_p)
                        break
                judas_trades.append({'type': 'Bearish_Judas', 'win': win, 'pnl': pnl, 'asia_range': asia_range})
            
        # Caso 2: varre Asia Low (Bullish Judas)
        swept_low = london[london['low'] < asia_low]
        if not swept_low.empty:
            first_sweep = swept_low.iloc[0]
            sweep_idx = swept_low.index[0]
            post_sweep = london.loc[sweep_idx:]
            
            reversal_candles = post_sweep[post_sweep['close'] > post_sweep['open']]
            if not reversal_candles.empty:
                rev_c = reversal_candles.iloc[0]
                entry_p = rev_c['close']
                tp_p = entry_p + (0.50 * asia_range)
                sl_p = post_sweep['low'].min() - (4 * tick)
                
                sub_future = post_sweep.loc[rev_c.name:]
                win = False
                pnl = -(entry_p - sl_p)
                for _, r in sub_future.iloc[1:].iterrows():
                    if r['high'] >= tp_p:
                        win = True
                        pnl = (tp_p - entry_p)
                        break
                    if r['low'] <= sl_p:
                        win = False
                        pnl = -(entry_p - sl_p)
                        break
                judas_trades.append({'type': 'Bullish_Judas', 'win': win, 'pnl': pnl, 'asia_range': asia_range})
            
    df_j = pd.DataFrame(judas_trades)
    print("=" * 60)
    print(f"=== {name} JUDAS SWING FADE COM CONFIRMAÇÃO DE REVERSÃO ===")
    print("=" * 60)
    print(f"Total de Ocorrências: {len(df_j)}")
    if not df_j.empty:
        wr = df_j['win'].mean() * 100
        pnl_m = df_j['pnl'].mean()
        pnl_tot = df_j['pnl'].sum()
        print(f"Win Rate: {wr:.1f}%")
        print(f"PnL Médio por Trade: {pnl_m:+.2f} pts")
        print(f"PnL Total Acumulado: {pnl_tot:+.2f} pts (${pnl_tot*pt_val:,.2f})")
