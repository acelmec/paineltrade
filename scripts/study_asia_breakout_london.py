import pandas as pd
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
    brk_trades = []
    
    for d in days:
        dt_day = datetime.combine(d, time(0, 0))
        l_time = get_london_open(dt_day)
        day_data = df[df['date'] == d].sort_values('dt')
        asia = day_data[(day_data['time'] >= time(0, 0)) & (day_data['time'] < l_time)]
        if len(asia) < 30: continue
        asia_high = asia['high'].max()
        asia_low = asia['low'].min()
        asia_range = asia_high - asia_low
        if asia_range <= 0: continue
        
        l_end = (datetime.combine(d, l_time) + timedelta(minutes=180)).time()
        london = day_data[(day_data['time'] >= l_time) & (day_data['time'] <= l_end)]
        if len(london) < 30: continue
        
        # Rompe Asia High com vela fechando acima
        brk_high = london[london['close'] > asia_high]
        if not brk_high.empty:
            c = brk_high.iloc[0]
            entry_p = c['close']
            tp_p = entry_p + (0.50 * asia_range)
            sl_p = asia_high - (0.25 * asia_range)
            
            sub = london.loc[c.name:]
            win = False
            pnl = -(entry_p - sl_p)
            for _, r in sub.iloc[1:].iterrows():
                if r['high'] >= tp_p:
                    win = True
                    pnl = (tp_p - entry_p)
                    break
                if r['low'] <= sl_p:
                    win = False
                    pnl = -(entry_p - sl_p)
                    break
            brk_trades.append({'win': win, 'pnl': pnl})
            
        # Rompe Asia Low com vela fechando abaixo
        brk_low = london[london['close'] < asia_low]
        if not brk_low.empty:
            c = brk_low.iloc[0]
            entry_p = c['close']
            tp_p = entry_p - (0.50 * asia_range)
            sl_p = asia_low + (0.25 * asia_range)
            
            sub = london.loc[c.name:]
            win = False
            pnl = -(sl_p - entry_p)
            for _, r in sub.iloc[1:].iterrows():
                if r['low'] <= tp_p:
                    win = True
                    pnl = (entry_p - tp_p)
                    break
                if r['high'] >= sl_p:
                    win = False
                    pnl = -(sl_p - entry_p)
                    break
            brk_trades.append({'win': win, 'pnl': pnl})
            
    df_b = pd.DataFrame(brk_trades)
    print("=" * 60)
    print(f"=== {name} CONTINUATION BREAKOUT DA ÁSIA EM LONDRES ===")
    print("=" * 60)
    print(f"Total Trades: {len(df_b)}")
    if not df_b.empty:
        wr = df_b['win'].mean() * 100
        pnl_m = df_b['pnl'].mean()
        pnl_tot = df_b['pnl'].sum()
        print(f"Win Rate: {wr:.1f}%")
        print(f"PnL Médio: {pnl_m:+.2f} pts | Total: {pnl_tot:+.2f} pts (${pnl_tot*pt_val:,.2f})")
