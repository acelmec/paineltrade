"""
Estudo Matematico Comparativo: OR5 (Opening Range 5 Minutos) vs. OR15
Base Oficial Databento CME GLBX.MDP3 (365 Dias - 254 Pregoes):
1. NQ e ES
2. Medicao de Amplitude da OR5 (ORH_5, ORL_5, OR5_Range, OR5_Mid)
3. Estrategias na OR5 a partir de T+5m (10:35:01 / 11:35:01 BRT):
   A) Breakout da OR5:
      - Rompimento Seco (fechamento de 1m fora com Forca >= 55% ou <= 45%)
      - Rompimento com Pullback / Reteste na borda
      - Alvos: +25%, +35%, +50%, +100% da OR5
      - Gestao Parcial: P1 em 25% ou 35% + BE + P2 em 50% ou 100%
   B) Fade da OR5 (Reversao na Borda):
      - 1o Toque na borda c/ rejeicao (pavio) ou Forca contraria
      - Alvo: 50% (Centro / OR5_Mid)
      - Parcial 25% ou 35% + BE + Final 50%
4. Comparativo detalhado OR5 vs. OR15.
"""
import os, sys, numpy as np, pandas as pd

TZ_BRT = 'America/Sao_Paulo'
TZ_NY  = 'America/New_York'
BASE   = os.path.join('data', 'databento')

def sim_trade_single(highs, lows, entry, direction, sl_pts, tp_pts, last_close):
    cur_sl = -sl_pts
    for h, l in zip(highs, lows):
        fav = (h - entry) if direction == 1 else (entry - l)
        adv = (l - entry) if direction == 1 else (entry - h)
        if adv <= cur_sl:
            return -sl_pts, "SL"
        if fav >= tp_pts:
            return tp_pts, "TP"
    return (last_close - entry) * direction, "TIME"

def sim_trade_partial(highs, lows, entry, direction, sl_pts, p1_tp_pts, p2_tp_pts, last_close):
    cur_sl = -sl_pts
    hit_p1 = False
    
    for h, l in zip(highs, lows):
        fav = (h - entry) if direction == 1 else (entry - l)
        adv = (l - entry) if direction == 1 else (entry - h)
        
        if not hit_p1:
            if adv <= cur_sl:
                return -sl_pts, "SL"
            if fav >= p1_tp_pts:
                hit_p1 = True
                cur_sl = 0.0 # Breakeven
                if fav >= p2_tp_pts:
                    return 0.5 * p1_tp_pts + 0.5 * p2_tp_pts, "TP_FULL"
        else:
            if adv <= cur_sl:
                return 0.5 * p1_tp_pts + 0.5 * 0.0, "BE"
            if fav >= p2_tp_pts:
                return 0.5 * p1_tp_pts + 0.5 * p2_tp_pts, "TP_FULL"
                
    final_p = (last_close - entry) * direction
    if hit_p1:
        return 0.5 * p1_tp_pts + 0.5 * final_p, "TIME_P1"
    else:
        return final_p, "TIME"

def run_or5_study():
    print("="*80)
    print("ESTUDO QUANTITATIVO: OR5 (OPENING RANGE 5 MINUTOS) — 365 DIAS (DATABENTO)")
    print("="*80, flush=True)

    c_nq = pd.read_csv(os.path.join(BASE, 'NQ_1m_BRT.csv'), parse_dates=['time_brt'], index_col='time_brt')
    c_es = pd.read_csv(os.path.join(BASE, 'ES_1m_BRT.csv'), parse_dates=['time_brt'], index_col='time_brt')
    force_df = pd.read_csv(os.path.join(BASE, 'nasdaq_force_365d_BRT.csv'), parse_dates=['timestamp'], index_col='timestamp')

    for c in [c_nq, c_es, force_df]:
        if c.index.tz is None: c.index = c.index.tz_localize(TZ_BRT)
        else: c.index = c.index.tz_convert(TZ_BRT)

    start_365 = pd.Timestamp('2025-11-11 00:00:00', tz=TZ_BRT)
    end_365   = pd.Timestamp('2026-11-10 23:59:00', tz=TZ_BRT)

    for asset_name, c_df in [("NASDAQ (NQ)", c_nq), ("S&P 500 (ES)", c_es)]:
        print(f"\n{'='*75}\nPROCESSANDO ATIVO: {asset_name}\n{'='*75}", flush=True)
        df = c_df.loc[(c_df.index >= start_365) & (c_df.index <= end_365)].join(force_df, how='inner')
        df['ny_time'] = df.index.tz_convert(TZ_NY)
        df['ny_date'] = df['ny_time'].dt.date
        df['ny_hm']   = df['ny_time'].dt.strftime('%H:%M')

        days = sorted(df['ny_date'].unique())
        print(f"Total de pregoes para analise: {len(days)}", flush=True)

        or5_ranges = []
        or15_ranges = []

        # Listas para coletar trades da OR5
        brk_seco_50_trades = []
        brk_seco_p25_p50_trades = []
        brk_seco_p35_p50_trades = []
        brk_seco_100_trades = []
        
        brk_pull_50_trades = []
        brk_pull_p25_p50_trades = []
        brk_pull_p35_p50_trades = []
        brk_pull_100_trades = []

        fade_mid_trades = []
        fade_p25_p50_trades = []
        fade_p35_p50_trades = []
        fade_q25_trades = []
        fade_q35_trades = []

        for d in days:
            sub = df[df['ny_date'] == d]
            if len(sub) < 30: continue

            # Velas dos primeiros 5 minutos: 09:30 a 09:34 (fecham em 09:31, 09:32, 09:33, 09:34, 09:35)
            # No NY time: ny_hm '09:30', '09:31', '09:32', '09:33', '09:34' (ou se timestamp de fechamento '09:31' a '09:35')
            # Vamos pegar os primeiros 5 minutos apos a abertura
            m_open = sub[sub['ny_hm'] >= '09:30']
            if len(m_open) < 20: continue
            
            # OR5: primeiros 5 minutos (indices 0 a 4)
            or5_slice = m_open.iloc[0:5]
            or5_h = or5_slice['high'].max()
            or5_l = or5_slice['low'].min()
            or5_r = or5_h - or5_l
            if or5_r <= 0: continue
            or5_mid = (or5_h + or5_l) / 2.0
            or5_q25 = 0.25 * or5_r
            or5_q35 = 0.35 * or5_r
            or5_ranges.append(or5_r)

            # OR15 para comparacao (indices 0 a 14)
            if len(m_open) >= 15:
                or15_slice = m_open.iloc[0:15]
                or15_ranges.append(or15_slice['high'].max() - or15_slice['low'].min())

            # Janela operacional da OR5: das 09:35 ate 11:30 NY (ou ate 120 min)
            post_or5 = m_open.iloc[5:120]
            if len(post_or5) < 10: continue

            # -------------------------------------------------------------
            # SIMULACAO 1: BREAKOUT DA OR5
            # -------------------------------------------------------------
            # Procura primeiro fechamento fora da OR5 com Forca a favor
            brk_found = False
            for idx_bar in range(len(post_or5)):
                bar = post_or5.iloc[idx_bar]
                f_compra = bar.get('forca_final_compra', 50.0)
                f_venda  = bar.get('forca_final_venda', 50.0)

                # Rompimento de Alta
                if bar['close'] > or5_h and f_compra >= 55.0:
                    brk_dir = 1
                    entry_seco = bar['close']
                    rem = post_or5.iloc[idx_bar+1:]
                    if len(rem) < 3: break
                    h_rem = rem['high'].values
                    l_rem = rem['low'].values
                    last_c = rem['close'].values[-1]

                    # Breakout Seco:
                    # SL padrao no centro da OR5 (50% da OR5) ou 50% do range abaixo da entrada
                    sl_pts = or5_r * 0.50
                    tp_50  = or5_r * 0.50
                    tp_100 = or5_r * 1.00
                    p1_25  = or5_r * 0.25
                    p1_35  = or5_r * 0.35

                    pnl_s50,  _ = sim_trade_single(h_rem, l_rem, entry_seco, brk_dir, sl_pts, tp_50, last_c)
                    pnl_s100, _ = sim_trade_single(h_rem, l_rem, entry_seco, brk_dir, sl_pts, tp_100, last_c)
                    pnl_p25,  _ = sim_trade_partial(h_rem, l_rem, entry_seco, brk_dir, sl_pts, p1_25, tp_50, last_c)
                    pnl_p35,  _ = sim_trade_partial(h_rem, l_rem, entry_seco, brk_dir, sl_pts, p1_35, tp_50, last_c)

                    brk_seco_50_trades.append(pnl_s50)
                    brk_seco_100_trades.append(pnl_s100)
                    brk_seco_p25_p50_trades.append(pnl_p25)
                    brk_seco_p35_p50_trades.append(pnl_p35)

                    # Breakout com Pullback / Reteste:
                    # Espera preco tocar de volta na borda or5_h
                    for idx_pull in range(idx_bar+1, min(idx_bar+15, len(post_or5))):
                        bar_pull = post_or5.iloc[idx_pull]
                        if bar_pull['low'] <= or5_h and bar_pull['close'] >= or5_h:
                            # Reteste confirmado! Entrada na borda
                            entry_pull = or5_h
                            rem_pull = post_or5.iloc[idx_pull+1:]
                            if len(rem_pull) >= 3:
                                hp = rem_pull['high'].values
                                lp = rem_pull['low'].values
                                lcp = rem_pull['close'].values[-1]
                                pnl_pull_50,  _ = sim_trade_single(hp, lp, entry_pull, brk_dir, sl_pts, tp_50, lcp)
                                pnl_pull_100, _ = sim_trade_single(hp, lp, entry_pull, brk_dir, sl_pts, tp_100, lcp)
                                pnl_pull_p25, _ = sim_trade_partial(hp, lp, entry_pull, brk_dir, sl_pts, p1_25, tp_50, lcp)
                                pnl_pull_p35, _ = sim_trade_partial(hp, lp, entry_pull, brk_dir, sl_pts, p1_35, tp_50, lcp)
                                brk_pull_50_trades.append(pnl_pull_50)
                                brk_pull_100_trades.append(pnl_pull_100)
                                brk_pull_p25_p50_trades.append(pnl_pull_p25)
                                brk_pull_p35_p50_trades.append(pnl_pull_p35)
                            break
                    brk_found = True
                    break

                # Rompimento de Baixa
                elif bar['close'] < or5_l and f_venda <= 45.0:
                    brk_dir = -1
                    entry_seco = bar['close']
                    rem = post_or5.iloc[idx_bar+1:]
                    if len(rem) < 3: break
                    h_rem = rem['high'].values
                    l_rem = rem['low'].values
                    last_c = rem['close'].values[-1]

                    sl_pts = or5_r * 0.50
                    tp_50  = or5_r * 0.50
                    tp_100 = or5_r * 1.00
                    p1_25  = or5_r * 0.25
                    p1_35  = or5_r * 0.35

                    pnl_s50,  _ = sim_trade_single(h_rem, l_rem, entry_seco, brk_dir, sl_pts, tp_50, last_c)
                    pnl_s100, _ = sim_trade_single(h_rem, l_rem, entry_seco, brk_dir, sl_pts, tp_100, last_c)
                    pnl_p25,  _ = sim_trade_partial(h_rem, l_rem, entry_seco, brk_dir, sl_pts, p1_25, tp_50, last_c)
                    pnl_p35,  _ = sim_trade_partial(h_rem, l_rem, entry_seco, brk_dir, sl_pts, p1_35, tp_50, last_c)

                    brk_seco_50_trades.append(pnl_s50)
                    brk_seco_100_trades.append(pnl_s100)
                    brk_seco_p25_p50_trades.append(pnl_p25)
                    brk_seco_p35_p50_trades.append(pnl_p35)

                    for idx_pull in range(idx_bar+1, min(idx_bar+15, len(post_or5))):
                        bar_pull = post_or5.iloc[idx_pull]
                        if bar_pull['high'] >= or5_l and bar_pull['close'] <= or5_l:
                            entry_pull = or5_l
                            rem_pull = post_or5.iloc[idx_pull+1:]
                            if len(rem_pull) >= 3:
                                hp = rem_pull['high'].values
                                lp = rem_pull['low'].values
                                lcp = rem_pull['close'].values[-1]
                                pnl_pull_50,  _ = sim_trade_single(hp, lp, entry_pull, brk_dir, sl_pts, tp_50, lcp)
                                pnl_pull_100, _ = sim_trade_single(hp, lp, entry_pull, brk_dir, sl_pts, tp_100, lcp)
                                pnl_pull_p25, _ = sim_trade_partial(hp, lp, entry_pull, brk_dir, sl_pts, p1_25, tp_50, lcp)
                                pnl_pull_p35, _ = sim_trade_partial(hp, lp, entry_pull, brk_dir, sl_pts, p1_35, tp_50, lcp)
                                brk_pull_50_trades.append(pnl_pull_50)
                                brk_pull_100_trades.append(pnl_pull_100)
                                brk_pull_p25_p50_trades.append(pnl_pull_p25)
                                brk_pull_p35_p50_trades.append(pnl_pull_p35)
                            break
                    brk_found = True
                    break

            # -------------------------------------------------------------
            # SIMULACAO 2: FADE (REVERSAO NA BORDA DA OR5)
            # -------------------------------------------------------------
            # Procura 1o toque na borda com rejeicao (fechamento de volta para dentro)
            for idx_bar in range(len(post_or5)):
                bar = post_or5.iloc[idx_bar]
                f_compra = bar.get('forca_final_compra', 50.0)

                # Teste na Maxima (Venda Fade)
                if bar['high'] >= or5_h and bar['close'] <= or5_h and f_compra < 55.0:
                    dir_fade = -1
                    entry_fade = bar['close']
                    rem = post_or5.iloc[idx_bar+1:]
                    if len(rem) < 3: break
                    h_rem = rem['high'].values
                    l_rem = rem['low'].values
                    last_c = rem['close'].values[-1]

                    sl_pts = or5_r * 0.35 # Stop 35% fora da borda
                    tp_mid = (entry_fade - or5_mid) if dir_fade == -1 else (or5_mid - entry_fade)
                    if tp_mid <= 0: tp_mid = or5_r * 0.50
                    tp_q25 = or5_r * 0.25
                    tp_q35 = or5_r * 0.35

                    p_mid, _ = sim_trade_single(h_rem, l_rem, entry_fade, dir_fade, sl_pts, tp_mid, last_c)
                    p_q25, _ = sim_trade_single(h_rem, l_rem, entry_fade, dir_fade, sl_pts, tp_q25, last_c)
                    p_q35, _ = sim_trade_single(h_rem, l_rem, entry_fade, dir_fade, sl_pts, tp_q35, last_c)
                    p_p25, _ = sim_trade_partial(h_rem, l_rem, entry_fade, dir_fade, sl_pts, tp_q25, tp_mid, last_c)
                    p_p35, _ = sim_trade_partial(h_rem, l_rem, entry_fade, dir_fade, sl_pts, tp_q35, tp_mid, last_c)

                    fade_mid_trades.append(p_mid)
                    fade_q25_trades.append(p_q25)
                    fade_q35_trades.append(p_q35)
                    fade_p25_p50_trades.append(p_p25)
                    fade_p35_p50_trades.append(p_p35)
                    break

                # Teste na Minima (Compra Fade)
                elif bar['low'] <= or5_l and bar['close'] >= or5_l and f_compra > 45.0:
                    dir_fade = 1
                    entry_fade = bar['close']
                    rem = post_or5.iloc[idx_bar+1:]
                    if len(rem) < 3: break
                    h_rem = rem['high'].values
                    l_rem = rem['low'].values
                    last_c = rem['close'].values[-1]

                    sl_pts = or5_r * 0.35
                    tp_mid = (or5_mid - entry_fade) if dir_fade == 1 else (entry_fade - or5_mid)
                    if tp_mid <= 0: tp_mid = or5_r * 0.50
                    tp_q25 = or5_r * 0.25
                    tp_q35 = or5_r * 0.35

                    p_mid, _ = sim_trade_single(h_rem, l_rem, entry_fade, dir_fade, sl_pts, tp_mid, last_c)
                    p_q25, _ = sim_trade_single(h_rem, l_rem, entry_fade, dir_fade, sl_pts, tp_q25, last_c)
                    p_q35, _ = sim_trade_single(h_rem, l_rem, entry_fade, dir_fade, sl_pts, tp_q35, last_c)
                    p_p25, _ = sim_trade_partial(h_rem, l_rem, entry_fade, dir_fade, sl_pts, tp_q25, tp_mid, last_c)
                    p_p35, _ = sim_trade_partial(h_rem, l_rem, entry_fade, dir_fade, sl_pts, tp_q35, tp_mid, last_c)

                    fade_mid_trades.append(p_mid)
                    fade_q25_trades.append(p_q25)
                    fade_q35_trades.append(p_q35)
                    fade_p25_p50_trades.append(p_p25)
                    fade_p35_p50_trades.append(p_p35)
                    break

        # EXIBICAO DOS RESULTADOS
        def stats(arr):
            if not arr: return "0 trades", "0.0%", "0.0", "0.0"
            n = len(arr)
            w = sum(1 for x in arr if x > 0)
            wr = (w / n) * 100
            s = sum(arr)
            avg = s / n
            return f"{n} trades", f"{wr:.1f}%", f"{avg:+.2f} pts", f"{s:+.1f} pts"

        print(f"\n--- ANATOMIA COMPARATIVA: AMPLITUDE OR5 vs. OR15 ({asset_name}) ---")
        print(f"Amplitude Media OR5  (5 min):  {np.mean(or5_ranges):.1f} pts (Mediana: {np.median(or5_ranges):.1f} pts)")
        print(f"Amplitude Media OR15 (15 min): {np.mean(or15_ranges):.1f} pts (Mediana: {np.median(or15_ranges):.1f} pts)")
        print(f"Razao OR5 / OR15: {np.mean(or5_ranges)/np.mean(or15_ranges)*100:.1f}% da amplitude total dos 15m")

        print(f"\n--- MATRIZ DE BREAKOUT DA OR5 ({asset_name}) ---")
        print(f"{'Configuracao Breakout OR5':<42} | {'Trades':<10} | {'Win Rate':<10} | {'Media/Tr':<12} | {'Saldo Anual'}")
        print("-"*85)
        for label, arr in [
            ("Breakout Seco (+50% Expansao)", brk_seco_50_trades),
            ("Breakout Seco (+100% Expansao)", brk_seco_100_trades),
            ("Breakout Seco (Parcial 25% / Final 50%)", brk_seco_p25_p50_trades),
            ("Breakout Seco (Parcial 35% / Final 50%)", brk_seco_p35_p50_trades),
            ("Breakout Pullback (+50% Expansao)", brk_pull_50_trades),
            ("Breakout Pullback (+100% Expansao)", brk_pull_100_trades),
            ("Breakout Pullback (Parcial 25% / Final 50%)", brk_pull_p25_p50_trades),
            ("Breakout Pullback (Parcial 35% / Final 50%)", brk_pull_p35_p50_trades),
        ]:
            nt, wr, av, sd = stats(arr)
            print(f"{label:<42} | {nt:<10} | {wr:<10} | {av:<12} | {sd}")

        print(f"\n--- MATRIZ DE FADE (REVERSAO NA BORDA) DA OR5 ({asset_name}) ---")
        print(f"{'Configuracao Fade OR5':<42} | {'Trades':<10} | {'Win Rate':<10} | {'Media/Tr':<12} | {'Saldo Anual'}")
        print("-"*85)
        for label, arr in [
            ("Fade Alvo Centro (50% OR5_Mid)", fade_mid_trades),
            ("Fade Alvo Rapido (25% OR5)", fade_q25_trades),
            ("Fade Alvo Otimizado (35% OR5)", fade_q35_trades),
            ("Fade Parcial 25% + Final 50% (OR5_Mid)", fade_p25_p50_trades),
            ("Fade Parcial 35% + Final 50% (OR5_Mid)", fade_p35_p50_trades),
        ]:
            nt, wr, av, sd = stats(arr)
            print(f"{label:<42} | {nt:<10} | {wr:<10} | {av:<12} | {sd}")

if __name__ == '__main__':
    run_or5_study()
