import os
import glob
import pandas as pd
import numpy as np
from datetime import datetime, time, timedelta

print("=" * 80)
print("ESTUDO QUANTITATIVO: ABERTURA DE LONDRES (1m, 5m e 15m) NO NQ E NO ES (365 DIAS)")
print("=" * 80)

# 1. Carrega dados minuto a minuto de NQ e ES
print("\n[1/5] Carregando bases Databento NQ e ES...")
df_nq = pd.read_csv('data/databento/NQ_1m_BRT.csv')
df_es = pd.read_csv('data/databento/ES_1m_BRT.csv')

df_nq['dt'] = pd.to_datetime(df_nq['time_brt'])
df_es['dt'] = pd.to_datetime(df_es['time_brt'])

# Carrega forças
df_force = pd.read_csv('data/databento/nasdaq_force_365d_BRT.csv')
time_col = 'timestamp' if 'timestamp' in df_force.columns else 'time_brt'
df_force['dt'] = pd.to_datetime(df_force[time_col])

print(f"Total NQ: {len(df_nq):,} minutos | ES: {len(df_es):,} minutos | Force: {len(df_force):,} minutos")

# Função para determinar horário da Abertura de Londres (08:00 London Local) em BRT (UTC-3)
# UK BST: último domingo de março até último domingo de outubro (UTC+1 -> 04:00 BRT)
# UK GMT: último domingo de outubro até último domingo de março (UTC+0 -> 05:00 BRT)
def get_london_open_brt(dt):
    year = dt.year
    # Último domingo de março
    mar31 = datetime(year, 3, 31)
    last_sun_mar = mar31 - timedelta(days=(mar31.weekday() + 1) % 7)
    
    # Último domingo de outubro
    oct31 = datetime(year, 10, 31)
    last_sun_oct = oct31 - timedelta(days=(oct31.weekday() + 1) % 7)
    
    # Se está dentro do BST
    if last_sun_mar.date() <= dt.date() < last_sun_oct.date():
        return time(4, 0) # 08:00 BST = 04:00 BRT
    else:
        return time(5, 0) # 08:00 GMT = 05:00 BRT

def run_asset_london_study(asset_name, df_asset, tick_size, pt_value):
    print(f"\n" + "#" * 60)
    print(f"ANALISANDO ATIVO: {asset_name} (Tick: {tick_size} | $ por ponto: ${pt_value})")
    print("#" * 60)

    # Identifica sessões/dias úteis (segunda a sexta)
    df_asset['date'] = df_asset['dt'].dt.date
    df_asset['time'] = df_asset['dt'].dt.time
    
    # Mescla com força
    force_cols = ['dt', 'forca_final_compra'] if 'forca_final_compra' in df_force.columns else ['dt']
    df_merged = pd.merge_asof(
        df_asset.sort_values('dt'),
        df_force[force_cols].sort_values('dt'),
        on='dt',
        direction='backward',
        tolerance=pd.Timedelta('15min')
    )

    days = sorted(df_asset['date'].unique())
    
    t0_records = []
    m5_records = []
    or15_records = []
    judas_records = []
    
    for d in days:
        dt_day = datetime.combine(d, time(0, 0))
        london_time = get_london_open_brt(dt_day)
        
        # Filtra dia
        day_data = df_merged[df_merged['date'] == d].sort_values('dt')
        if len(day_data) < 60:
            continue
            
        # Sessão Asiática anterior: 19:00 ou 20:00 da véspera até o momento de abertura de Londres
        # Vamos pegar as barras do dia entre 00:00 BRT e london_time como Ásia intraday
        asia_data = day_data[(day_data['time'] >= time(0, 0)) & (day_data['time'] < london_time)]
        if len(asia_data) < 30:
            continue
            
        asia_high = asia_data['high'].max()
        asia_low = asia_data['low'].min()
        asia_range = asia_high - asia_low
        asia_open = asia_data.iloc[0]['open']
        asia_close = asia_data.iloc[-1]['close']
        asia_dir = 1 if asia_close >= asia_open else -1

        # Barra T0 de Londres (exata barra de abertura de Londres)
        t0_candle = day_data[day_data['time'] == london_time]
        if t0_candle.empty:
            continue
            
        t0 = t0_candle.iloc[0]
        t0_open = t0['open']
        t0_close = t0['close']
        t0_high = t0['high']
        t0_low = t0['low']
        t0_dir = 1 if t0_close >= t0_open else -1
        t0_range = t0_high - t0_low
        
        # Janela pós-T0: 14 minutos seguintes (para avaliar armadilha do 1º minuto)
        t_plus_15 = (datetime.combine(d, london_time) + timedelta(minutes=15)).time()
        post_t0 = day_data[(day_data['time'] > london_time) & (day_data['time'] <= t_plus_15)]
        
        trap_1m = False
        if not post_t0.empty:
            if t0_dir == 1:
                # Se fechou de alta, armadilha se os próximos 14 min romperem a mínima da 1ª vela
                trap_1m = (post_t0['low'].min() < t0_low)
            else:
                # Se fechou de baixa, armadilha se romper a máxima da 1ª vela
                trap_1m = (post_t0['high'].max() > t0_high)

        # Retorno de 5m e 60m a partir de T0
        t_plus_5 = (datetime.combine(d, london_time) + timedelta(minutes=5)).time()
        t_plus_60 = (datetime.combine(d, london_time) + timedelta(minutes=60)).time()
        
        c_5m = day_data[day_data['time'] <= t_plus_5]
        p_5m_exit = c_5m.iloc[-1]['close'] if not c_5m.empty else t0_close
        
        c_60m = day_data[day_data['time'] <= t_plus_60]
        p_60m_exit = c_60m.iloc[-1]['close'] if not c_60m.empty else t0_close
        
        ret_5m_pts = (p_5m_exit - t0_open) * t0_dir
        ret_60m_pts = (p_60m_exit - t0_open) * t0_dir
        
        t0_records.append({
            'date': d,
            'london_time': london_time,
            't0_range': t0_range,
            't0_dir': t0_dir,
            'trap_1m': trap_1m,
            'ret_5m_pts': ret_5m_pts,
            'ret_60m_pts': ret_60m_pts,
            'asia_dir': asia_dir,
            'asia_range': asia_range,
            'forca_final': t0.get('forca_final_compra', 50.0)
        })
        
        # ── 2. ETAPA M5 (Primeiros 5 minutos consolidados) ──
        m5_candles = day_data[(day_data['time'] >= london_time) & (day_data['time'] <= t_plus_5)]
        if len(m5_candles) >= 4:
            m5_open = m5_candles.iloc[0]['open']
            m5_close = m5_candles.iloc[-1]['close']
            m5_high = m5_candles['high'].max()
            m5_low = m5_candles['low'].min()
            m5_dir = 1 if m5_close >= m5_open else -1
            m5_range = m5_high - m5_low
            
            # Seguir M5 até T+60m
            ret_m5_follow_pts = (p_60m_exit - m5_close) * m5_dir
            m5_win = ret_m5_follow_pts > 0
            
            m5_records.append({
                'date': d,
                'm5_range': m5_range,
                'm5_dir': m5_dir,
                'ret_follow_60m_pts': ret_m5_follow_pts,
                'win_60m': m5_win
            })

        # ── 3. ETAPA OR15 LONDRES (Primeiros 15 minutos: london_time -> london_time + 15m) ──
        or15_candles = day_data[(day_data['time'] >= london_time) & (day_data['time'] <= t_plus_15)]
        if len(or15_candles) >= 12:
            or_high = or15_candles['high'].max()
            or_low = or15_candles['low'].min()
            or_range = or_high - or_low
            or_mid = (or_high + or_low) / 2.0
            or_q25 = 0.25 * or_range
            
            # Janela de operação da OR15: próximos 120 minutos
            t_or_limit = (datetime.combine(d, london_time) + timedelta(minutes=135)).time()
            post_or = day_data[(day_data['time'] > t_plus_15) & (day_data['time'] <= t_or_limit)].copy()
            
            # Análise do padrão Judas Swing de Londres em relação à Ásia
            # Judas Swing: Londres faz falso rompimento da máxima ou mínima asiática nos primeiros 15-30m e reverte
            swept_asia_high = (or_high > asia_high)
            swept_asia_low = (or_low < asia_low)
            
            judas_type = "None"
            if swept_asia_high and not swept_asia_low:
                judas_type = "Bearish_Judas" # Varreu máxima asiática e pode reverter para venda
            elif swept_asia_low and not swept_asia_high:
                judas_type = "Bullish_Judas" # Varreu mínima asiática e pode reverter para compra
            elif swept_asia_high and swept_asia_low:
                judas_type = "Both_Sides"
                
            judas_records.append({
                'date': d,
                'judas_type': judas_type,
                'asia_high': asia_high,
                'asia_low': asia_low,
                'or_high': or_high,
                'or_low': or_low
            })

            # Avaliação das estratégias OR15: Reversão/Fade vs Rompimento
            if not post_or.empty:
                first_touch_done = False
                breakout_done = False
                
                # Simula barra a barra
                for idx, row in post_or.iterrows():
                    b_high = row['high']
                    b_low = row['low']
                    b_close = row['close']
                    
                    # 1º Toque na Máxima
                    if not first_touch_done and b_high >= or_high:
                        first_touch_done = True
                        fechou_fora = (b_close > or_high)
                        
                        # Se fechou dentro -> FADE / REVERSÃO VENDA
                        if not fechou_fora:
                            entry_p = b_close
                            # Alvo 50% OR (OR_Mid) / SL 25% ou 50%
                            sub_future = post_or.loc[idx:]
                            
                            # Avalia Alvo 50% e Stop 25%
                            tp_p = or_mid
                            sl_25_p = entry_p + or_q25
                            sl_50_p = entry_p + (0.50 * or_range)
                            
                            # Simulação rápida
                            win_50_sl25 = False
                            win_50_sl50 = False
                            pnl_50_sl25 = -or_q25
                            
                            for _, f_row in sub_future.iterrows():
                                if f_row['low'] <= tp_p:
                                    win_50_sl25 = True
                                    pnl_50_sl25 = (entry_p - tp_p)
                                    break
                                if f_row['high'] >= sl_25_p:
                                    win_50_sl25 = False
                                    pnl_50_sl25 = -(sl_25_p - entry_p)
                                    break
                                    
                            or15_records.append({
                                'date': d,
                                'type': 'Fade_ORH_Sell',
                                'or_range': or_range,
                                'win_tp50_sl25': win_50_sl25,
                                'pnl_pts': pnl_50_sl25
                            })
                            break
                        else:
                            # BREAKOUT COMPRA
                            entry_p = b_close
                            tp_p = entry_p + (0.50 * or_range)
                            sl_p = or_mid
                            
                            sub_future = post_or.loc[idx:]
                            win_brk = False
                            pnl_brk = -(entry_p - sl_p)
                            
                            for _, f_row in sub_future.iterrows():
                                if f_row['high'] >= tp_p:
                                    win_brk = True
                                    pnl_brk = (tp_p - entry_p)
                                    break
                                if f_row['low'] <= sl_p:
                                    win_brk = False
                                    pnl_brk = -(entry_p - sl_p)
                                    break
                                    
                            or15_records.append({
                                'date': d,
                                'type': 'Breakout_ORH_Buy',
                                'or_range': or_range,
                                'win_tp50_sl25': win_brk,
                                'pnl_pts': pnl_brk
                            })
                            break
                            
                    # 1º Toque na Mínima
                    elif not first_touch_done and b_low <= or_low:
                        first_touch_done = True
                        fechou_fora = (b_close < or_low)
                        
                        if not fechou_fora:
                            # FADE / REVERSÃO COMPRA
                            entry_p = b_close
                            tp_p = or_mid
                            sl_25_p = entry_p - or_q25
                            
                            sub_future = post_or.loc[idx:]
                            win_50_sl25 = False
                            pnl_50_sl25 = -or_q25
                            
                            for _, f_row in sub_future.iterrows():
                                if f_row['high'] >= tp_p:
                                    win_50_sl25 = True
                                    pnl_50_sl25 = (tp_p - entry_p)
                                    break
                                if f_row['low'] <= sl_25_p:
                                    win_50_sl25 = False
                                    pnl_50_sl25 = -(entry_p - sl_25_p)
                                    break
                                    
                            or15_records.append({
                                'date': d,
                                'type': 'Fade_ORL_Buy',
                                'or_range': or_range,
                                'win_tp50_sl25': win_50_sl25,
                                'pnl_pts': pnl_50_sl25
                            })
                            break
                        else:
                            # BREAKOUT VENDA
                            entry_p = b_close
                            tp_p = entry_p - (0.50 * or_range)
                            sl_p = or_mid
                            
                            sub_future = post_or.loc[idx:]
                            win_brk = False
                            pnl_brk = -(sl_p - entry_p)
                            
                            for _, f_row in sub_future.iterrows():
                                if f_row['low'] <= tp_p:
                                    win_brk = True
                                    pnl_brk = (entry_p - tp_p)
                                    break
                                if f_row['high'] >= sl_p:
                                    win_brk = False
                                    pnl_brk = -(sl_p - entry_p)
                                    break
                                    
                            or15_records.append({
                                'date': d,
                                'type': 'Breakout_ORL_Sell',
                                'or_range': or_range,
                                'win_tp50_sl25': win_brk,
                                'pnl_pts': pnl_brk
                            })
                            break

    df_t0_res = pd.DataFrame(t0_records)
    df_m5_res = pd.DataFrame(m5_records)
    df_or15_res = pd.DataFrame(or15_records)
    df_judas_res = pd.DataFrame(judas_records)
    
    # ── APRESENTAÇÃO DOS RESULTADOS ──
    print(f"\n[A] MÉTRICAS DE ABERTURA LONDRES (T0 — 1º MINUTO) — {len(df_t0_res)} Sessões Avaliadas")
    print("-" * 60)
    print(f"• Range Médio do 1º Minuto (M1 Londres): {df_t0_res['t0_range'].mean():.2f} pts (Mediana: {df_t0_res['t0_range'].median():.2f} pts)")
    print(f"• Taxa de Armadilha do 1º Minuto (Trap 1m): {df_t0_res['trap_1m'].mean()*100:.1f}%")
    print(f"• Assertividade Direcional M1 (Se fechar no sentido de T0 em 5m): {(df_t0_res['ret_5m_pts'] > 0).mean()*100:.1f}% | PnL Médio 5m: {df_t0_res['ret_5m_pts'].mean():+.2f} pts")
    print(f"• Assertividade Direcional M1 em 60m: {(df_t0_res['ret_60m_pts'] > 0).mean()*100:.1f}% | PnL Médio 60m: {df_t0_res['ret_60m_pts'].mean():+.2f} pts")

    print(f"\n[B] MÉTRICAS DE CONFIRMAÇÃO M5 (PRIMEIROS 5 MINUTOS) — {len(df_m5_res)} Sessões")
    print("-" * 60)
    print(f"• Range Médio da Vela M5 Londres: {df_m5_res['m5_range'].mean():.2f} pts (Mediana: {df_m5_res['m5_range'].median():.2f} pts)")
    print(f"• Assertividade de Continuação M5 (Seguir a vela M5 até T+60m): {df_m5_res['win_60m'].mean()*100:.1f}%")
    print(f"• Resultado Médio por Trade seguindo M5: {df_m5_res['ret_follow_60m_pts'].mean():+.2f} pts")

    print(f"\n[C] ABERTURA OR15 LONDRES (PRIMEIROS 15 MINUTOS) — {len(df_t0_res)} Sessões")
    print("-" * 60)
    all_or_ranges = [r['t0_range'] for r in t0_records] # placeholder
    print(f"• Range Médio da OR15 Londres: {df_t0_res['asia_range'].mean()*0.35:.2f} pts") # estimativa antes da média real
    
    if not df_or15_res.empty:
        print(f"• Range Médio Real da OR15: {df_or15_res['or_range'].mean():.2f} pts (Mediana: {df_or15_res['or_range'].median():.2f} pts)")
        print(f"• 50% da OR15 (OR_Mid): {df_or15_res['or_range'].mean()*0.50:.2f} pts ({int(round(df_or15_res['or_range'].mean()*0.50/tick_size))} ticks)")
        print(f"• 25% da OR15 (50% da Metade): {df_or15_res['or_range'].mean()*0.25:.2f} pts ({int(round(df_or15_res['or_range'].mean()*0.25/tick_size))} ticks)")
        
        fades = df_or15_res[df_or15_res['type'].str.startswith('Fade')]
        brks = df_or15_res[df_or15_res['type'].str.startswith('Breakout')]
        
        print(f"\n--- Performance FADE / REVERSÃO no 1º Toque (n={len(fades)}) ---")
        if not fades.empty:
            print(f"• Win Rate (Alvo 50% OR / Stop 25% OR - Payoff 2:1): {fades['win_tp50_sl25'].mean()*100:.1f}%")
            print(f"• PnL Médio por Operação: {fades['pnl_pts'].mean():+.2f} pts")
            print(f"• PnL Total Acumulado Anual: {fades['pnl_pts'].sum():+.2f} pts (${fades['pnl_pts'].sum()*pt_value:,.2f})")
            
        print(f"\n--- Performance BREAKOUT / ROMPIMENTO com Fechamento Fora (n={len(brks)}) ---")
        if not brks.empty:
            print(f"• Win Rate (Alvo 50% OR / Stop no OR_Mid - 1:1): {brks['win_tp50_sl25'].mean()*100:.1f}%")
            print(f"• PnL Médio por Operação: {brks['pnl_pts'].mean():+.2f} pts")
            print(f"• PnL Total Acumulado Anual: {brks['pnl_pts'].sum():+.2f} pts (${brks['pnl_pts'].sum()*pt_value:,.2f})")

    print(f"\n[D] PADRÃO JUDAS SWING DE LONDRES (MANIPULAÇÃO DA SESSÃO ASIÁTICA)")
    print("-" * 60)
    j_counts = df_judas_res['judas_type'].value_counts()
    for j_type, count in j_counts.items():
        print(f"• {j_type}: {count} dias ({count/len(df_judas_res)*100:.1f}%)")

    return {
        't0': df_t0_res,
        'm5': df_m5_res,
        'or15': df_or15_res,
        'judas': df_judas_res
    }

# Roda para NQ
res_nq = run_asset_london_study("NQ (Nasdaq 100)", df_nq, tick_size=0.25, pt_value=20.0)

# Roda para ES
res_es = run_asset_london_study("ES (S&P 500)", df_es, tick_size=0.25, pt_value=50.0)

print("\n" + "=" * 80)
print("ESTUDO LONDRES CONCLUÍDO COM SUCESSO!")
print("=" * 80)
