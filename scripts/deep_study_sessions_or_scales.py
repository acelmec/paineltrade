"""
Estudo Quantitativo Aprofundado (365 Dias - Databento CME GLBX.MDP3):
1. Breakout Seco vs. Pullback por Faixas de Amplitude da OR15 (com e sem limite maximo de range)
2. Impacto das Sessoes Noturnas (Asia, Londres, Pre-Mercado) no T0, T5, T15 e T60
3. Comparativo de T5, T15 e T60 COM e SEM filtro de sessao (para preservar o que ja funciona)
4. Mapeamento por 3 Escalas de Forca: Tier 1 (52-59%), Tier 2 (60-69%) e Tier 3 (70-80%+)
5. Modelagem completa da OR60 / T60 (Initial Balance de 60 minutos) vs OR15
Executa para NQ (Nasdaq) e ES (S&P 500).
"""
import os, sys, numpy as np, pandas as pd

TZ_BRT = "America/Sao_Paulo"
TZ_NY  = "America/New_York"
BASE   = os.path.join("data", "databento")

def sim_bracket(bars, entry_price, direction, sl_pts, tp_pts, be_trigger_pts=None):
    cur_sl = -sl_pts
    reached_be = False
    for i, (ts, b) in enumerate(bars.iterrows(), start=1):
        if direction == 1:
            fav = b["high"] - entry_price
            adv = b["low"]  - entry_price
        else:
            fav = entry_price - b["low"]
            adv = entry_price - b["high"]

        if adv <= cur_sl:
            return cur_sl, ("BE" if reached_be and cur_sl == 0 else "SL"), i
        if fav >= tp_pts:
            return tp_pts, "TP", i
        if be_trigger_pts is not None and not reached_be and fav >= be_trigger_pts:
            cur_sl = 0.0
            reached_be = True

    if len(bars) > 0:
        last_c = bars.iloc[-1]["close"]
        pnl = (last_c - entry_price) * direction
        return pnl, "TIME", len(bars)
    return 0.0, "TIME", 0

def run_analysis_for_asset(symbol_name, csv_filename, tick_size, point_value, default_t0_tp, default_t0_sl, default_m5_tp, default_m5_sl):
    print(f"\n{'='*70}\nINICIANDO ESTUDO QUANTITATIVO: {symbol_name}\n{'='*70}", flush=True)
    
    # 1. Carrega dados
    candles = pd.read_csv(os.path.join(BASE, csv_filename), parse_dates=["time_brt"], index_col="time_brt")
    if candles.index.tz is None:
        candles.index = candles.index.tz_localize(TZ_BRT)
    else:
        candles.index = candles.index.tz_convert(TZ_BRT)
        
    force_df = pd.read_csv(os.path.join(BASE, "nasdaq_force_365d_BRT.csv"), parse_dates=["timestamp"], index_col="timestamp")
    if force_df.index.tz is None:
        force_df.index = force_df.index.tz_localize(TZ_BRT)
    else:
        force_df.index = force_df.index.tz_convert(TZ_BRT)

    start_365 = pd.Timestamp("2025-11-11 00:00:00", tz=TZ_BRT)
    end_365   = pd.Timestamp("2026-11-10 23:59:00", tz=TZ_BRT)
    c_sub = candles.loc[(candles.index >= start_365) & (candles.index <= end_365)].copy()
    
    df = c_sub.join(force_df, how="inner")
    print(f"[{symbol_name}] Minutos casados: {len(df):,}", flush=True)

    df["ny_time"] = df.index.tz_convert(TZ_NY)
    df["ny_date"] = df["ny_time"].dt.date
    df["ny_hm"]   = df["ny_time"].dt.strftime("%H:%M")
    
    tech_cols = ["nvidia_compra", "microsoft_compra", "apple_compra", "meta_compra", "amazon_compra", "alphabet_compra", "tesla_compra"]
    df["tech_compra"] = df[tech_cols].mean(axis=1)

    # Identificar dias e sessões
    days = sorted(df["ny_date"].unique())
    
    records = []
    
    for d in days:
        day_df = df[df["ny_date"] == d]
        
        # 1. Sessoes
        # Asia: dia anterior noite (20:00 a 02:00 BRT) ou 19:00-01:00 NY
        # Vamos pegar snapshot da abertura Asia (20:00 BRT / 19:00 BRT) e media da Asia
        # Londres: 04:00 às 09:00 BRT (03:00 às 08:00 NY)
        # Pre-Mercado T-15m: 09:15 ET (15 min antes da abertura)
        
        # Horario abertura NY
        ny_open_bars = day_df[day_df["ny_hm"] == "09:30"]
        if len(ny_open_bars) == 0:
            continue
        ny_open_ts = ny_open_bars.index[0]
        
        # T-15m bar
        t15_bars = day_df[day_df["ny_hm"] == "09:15"]
        f_t15 = t15_bars.iloc[0]["forca_final_compra"] if len(t15_bars) > 0 else 50.0
        
        # Londres (04:00 a 08:00 NY)
        ldn_bars = day_df[(day_df["ny_hm"] >= "04:00") & (day_df["ny_hm"] <= "08:00")]
        f_ldn = ldn_bars["forca_final_compra"].mean() if len(ldn_bars) > 0 else 50.0
        
        # Asia (anterior 19:00 a 01:00 NY)
        # Busca no df completo antes de ny_open_ts
        asia_window = df[(df.index >= ny_open_ts - pd.Timedelta(hours=15)) & (df.index <= ny_open_ts - pd.Timedelta(hours=8))]
        f_asia = asia_window["forca_final_compra"].mean() if len(asia_window) > 0 else 50.0
        
        # T0 bar (09:30)
        b_t0 = ny_open_bars.iloc[0]
        f_t0 = b_t0["forca_final_compra"]
        
        # T5 bar (09:35)
        m5_bars = day_df[day_df["ny_hm"] == "09:35"]
        f_m5 = m5_bars.iloc[0]["forca_final_compra"] if len(m5_bars) > 0 else 50.0
        tech_m5 = m5_bars.iloc[0]["tech_compra"] if len(m5_bars) > 0 else 50.0
        
        # OR15 (09:30 a 09:45 NY)
        or15_bars = day_df[(day_df["ny_hm"] >= "09:30") & (day_df["ny_hm"] <= "09:45")]
        if len(or15_bars) < 15:
            continue
        orh_15 = or15_bars["high"].max()
        orl_15 = or15_bars["low"].min()
        range_15 = orh_15 - orl_15
        mid_15 = (orh_15 + orl_15) / 2.0
        q25_15 = range_15 * 0.25
        
        # OR60 (09:30 a 10:30 NY - Initial Balance 60 min)
        or60_bars = day_df[(day_df["ny_hm"] >= "09:30") & (day_df["ny_hm"] <= "10:30")]
        if len(or60_bars) < 55:
            continue
        orh_60 = or60_bars["high"].max()
        orl_60 = or60_bars["low"].min()
        range_60 = orh_60 - orl_60
        mid_60 = (orh_60 + orl_60) / 2.0
        q25_60 = range_60 * 0.25
        
        # Restante do pregao
        rest_15 = day_df[day_df["ny_hm"] > "09:45"]
        rest_60 = day_df[day_df["ny_hm"] > "10:30"]
        
        records.append({
            "date": d,
            "ny_open_ts": ny_open_ts,
            "f_asia": f_asia,
            "f_ldn": f_ldn,
            "f_t15": f_t15,
            "f_t0": f_t0,
            "f_m5": f_m5,
            "tech_m5": tech_m5,
            "orh_15": orh_15, "orl_15": orl_15, "range_15": range_15, "mid_15": mid_15, "q25_15": q25_15,
            "orh_60": orh_60, "orl_60": orl_60, "range_60": range_60, "mid_60": mid_60, "q25_60": q25_60,
            "day_df": day_df,
            "rest_15": rest_15,
            "rest_60": rest_60
        })
        
    print(f"[{symbol_name}] Pregões válidos processados: {len(records)}", flush=True)

    # =========================================================================
    # PARTE 1: ESTUDO DE SESSÕES NO T0 (Ásia, Londres, T-15m)
    # =========================================================================
    print(f"\n--- PARTE 1: IMPACTO DAS SESSÕES NO T0 ({symbol_name}) ---")
    session_configs = [
        ("1. Ásia + T-15m (Atual Baseline)", lambda r: (1 if r["f_asia"] >= 52 and r["f_t15"] >= 52 else (-1 if r["f_asia"] <= 48 and r["f_t15"] <= 48 else 0))),
        ("2. Apenas Ásia", lambda r: (1 if r["f_asia"] >= 52 else (-1 if r["f_asia"] <= 48 else 0))),
        ("3. Apenas Londres", lambda r: (1 if r["f_ldn"] >= 52 else (-1 if r["f_ldn"] <= 48 else 0))),
        ("4. Londres + T-15m", lambda r: (1 if r["f_ldn"] >= 52 and r["f_t15"] >= 52 else (-1 if r["f_ldn"] <= 48 and r["f_t15"] <= 48 else 0))),
        ("5. Ásia + Londres (Consenso Noturno)", lambda r: (1 if r["f_asia"] >= 52 and r["f_ldn"] >= 52 else (-1 if r["f_asia"] <= 48 and r["f_ldn"] <= 48 else 0))),
        ("6. Ásia + Londres + T-15m (Consenso Triplo)", lambda r: (1 if r["f_asia"] >= 52 and r["f_ldn"] >= 52 and r["f_t15"] >= 52 else (-1 if r["f_asia"] <= 48 and r["f_ldn"] <= 48 and r["f_t15"] <= 48 else 0)))
    ]
    
    for label, sig_fn in session_configs:
        trades = []
        for r in records:
            sig = sig_fn(r)
            if sig != 0:
                post_open = r["day_df"][r["day_df"]["ny_hm"] >= "09:30"].head(60)
                if len(post_open) > 0:
                    entry = post_open.iloc[0]["open"]
                    pnl, outcome, _ = sim_bracket(post_open, entry, sig, default_t0_sl, default_t0_tp)
                    trades.append(pnl)
        if len(trades) > 0:
            win_r = np.mean([1 if t > 0 else 0 for t in trades]) * 100
            tot_p = np.sum(trades)
            avg_p = np.mean(trades)
            print(f"{label:45} | N={len(trades):3} | Win={win_r:5.1f}% | Avg={avg_p:+6.2f} pts | Total={tot_p:+8.1f} pts")

    # =========================================================================
    # PARTE 2: IMPACTO DE SESSÕES NO T5 (M5) — Comparar COM e SEM Sessões
    # =========================================================================
    print(f"\n--- PARTE 2: IMPACTO DE SESSÕES NO T5 (M5) ({symbol_name}) ---")
    # Base T5: Forca_M5 >= 55% e Tech_M5 >= 52%
    m5_configs = [
        ("1. T5 Baseline (SEM Sessão - Atual)", lambda r: (1 if r["f_m5"] >= 55 and r["tech_m5"] >= 52 else (-1 if r["f_m5"] <= 45 and r["tech_m5"] <= 48 else 0))),
        ("2. T5 + Ásia Alinhada", lambda r: (1 if r["f_m5"] >= 55 and r["tech_m5"] >= 52 and r["f_asia"] >= 52 else (-1 if r["f_m5"] <= 45 and r["tech_m5"] <= 48 and r["f_asia"] <= 48 else 0))),
        ("3. T5 + Londres Alinhada", lambda r: (1 if r["f_m5"] >= 55 and r["tech_m5"] >= 52 and r["f_ldn"] >= 52 else (-1 if r["f_m5"] <= 45 and r["tech_m5"] <= 48 and r["f_ldn"] <= 48 else 0))),
        ("4. T5 + Ásia e Londres Alinhadas", lambda r: (1 if r["f_m5"] >= 55 and r["tech_m5"] >= 52 and r["f_asia"] >= 52 and r["f_ldn"] >= 52 else (-1 if r["f_m5"] <= 45 and r["tech_m5"] <= 48 and r["f_asia"] <= 48 and r["f_ldn"] <= 48 else 0)))
    ]
    for label, sig_fn in m5_configs:
        trades = []
        for r in records:
            sig = sig_fn(r)
            if sig != 0:
                post_m5 = r["day_df"][r["day_df"]["ny_hm"] >= "09:35"].head(60)
                if len(post_m5) > 0:
                    entry = post_m5.iloc[0]["open"]
                    pnl, outcome, _ = sim_bracket(post_m5, entry, sig, default_m5_sl, default_m5_tp)
                    trades.append(pnl)
        if len(trades) > 0:
            win_r = np.mean([1 if t > 0 else 0 for t in trades]) * 100
            tot_p = np.sum(trades)
            avg_p = np.mean(trades)
            print(f"{label:45} | N={len(trades):3} | Win={win_r:5.1f}% | Avg={avg_p:+6.2f} pts | Total={tot_p:+8.1f} pts")

    # =========================================================================
    # PARTE 3: MAPA DE 3 ESCALAS DE FORÇA (Tier 1: 52-59% | Tier 2: 60-69% | Tier 3: 70-80%+)
    # =========================================================================
    print(f"\n--- PARTE 3: MAPA DAS 3 ESCALAS DE FORÇA NO T5 (M5) ({symbol_name}) ---")
    tiers = [
        ("Tier 1: Moderada (52% a 59%)", lambda r: (1 if 52 <= r["f_m5"] < 60 and r["tech_m5"] >= 50 else (-1 if 40 < r["f_m5"] <= 48 and r["tech_m5"] <= 50 else 0))),
        ("Tier 2: Forte    (60% a 69%)", lambda r: (1 if 60 <= r["f_m5"] < 70 and r["tech_m5"] >= 52 else (-1 if 30 < r["f_m5"] <= 40 and r["tech_m5"] <= 48 else 0))),
        ("Tier 3: Extrema  (70% a 85%+)", lambda r: (1 if r["f_m5"] >= 70 and r["tech_m5"] >= 55 else (-1 if r["f_m5"] <= 30 and r["tech_m5"] <= 45 else 0))),
        ("Visão Geral (Toda Força >= 55%)", lambda r: (1 if r["f_m5"] >= 55 and r["tech_m5"] >= 52 else (-1 if r["f_m5"] <= 45 and r["tech_m5"] <= 48 else 0)))
    ]
    for label, sig_fn in tiers:
        trades = []
        for r in records:
            sig = sig_fn(r)
            if sig != 0:
                post_m5 = r["day_df"][r["day_df"]["ny_hm"] >= "09:35"].head(60)
                if len(post_m5) > 0:
                    entry = post_m5.iloc[0]["open"]
                    pnl, outcome, _ = sim_bracket(post_m5, entry, sig, default_m5_sl, default_m5_tp)
                    trades.append(pnl)
        if len(trades) > 0:
            win_r = np.mean([1 if t > 0 else 0 for t in trades]) * 100
            tot_p = np.sum(trades)
            avg_p = np.mean(trades)
            print(f"{label:35} | N={len(trades):3} | Win={win_r:5.1f}% | Avg={avg_p:+6.2f} pts | Total={tot_p:+8.1f} pts")

    # =========================================================================
    # PARTE 4: BREAKOUT SECO VS PULLBACK NA OR15 POR AMPLITUDE E LIMITE MÁXIMO
    # =========================================================================
    print(f"\n--- PARTE 4: BREAKOUT SECO VS PULLBACK NA OR15 ({symbol_name}) ---")
    
    # Cortes de amplitude:
    # Para NQ: Pequeno (<120 pts), Médio (120-180 pts), Grande/Explosivo (>180 pts)
    # Para ES: Pequeno (<20 pts), Médio (20-30 pts), Grande/Explosivo (>30 pts)
    is_nq = ("NQ" in symbol_name)
    cut_small = 120.0 if is_nq else 20.0
    cut_large = 180.0 if is_nq else 30.0

    amp_buckets = [
        ("Todas as Amplitudes (Sem Limite Máximo)", lambda rng: True),
        (f"Amplitudes Normais/Controladas (<= {cut_large} pts)", lambda rng: rng <= cut_large),
        (f"Amplitudes Explosivas (> {cut_large} pts)", lambda rng: rng > cut_large),
        (f"Amplitudes Comprimidas (< {cut_small} pts)", lambda rng: rng < cut_small),
        (f"Amplitudes Médias ({cut_small} a {cut_large} pts)", lambda rng: cut_small <= rng <= cut_large)
    ]

    for b_label, b_filter in amp_buckets:
        print(f"\n>>> Faixa: {b_label}")
        trades_seco = []
        trades_pullback = []
        trades_fade = []

        for r in records:
            rng = r["range_15"]
            if not b_filter(rng):
                continue

            rest = r["rest_15"]
            if len(rest) == 0:
                continue

            orh = r["orh_15"]
            orl = r["orl_15"]
            mid = r["mid_15"]
            q25 = r["q25_15"]

            # 1. Detectar 1o toque ou 1o rompimento
            breakout_done = False
            fade_done = False

            for i, (ts, bar) in enumerate(rest.iterrows()):
                f_bar = bar["forca_final_compra"]
                c = bar["close"]
                h = bar["high"]
                l = bar["low"]

                # A) Teste de Breakout Alta
                if not breakout_done and c > orh and f_bar >= 55.0:
                    # Breakout Seco: entra a mercado no fechamento fora
                    post_b = rest.iloc[i+1:].head(60)
                    if len(post_b) > 0:
                        pnl_s, _, _ = sim_bracket(post_b, c, 1, q25, q25 * 2.0, be_trigger_pts=q25)
                        trades_seco.append(pnl_s)
                        
                        # Breakout com Pullback: aguarda recuo na linha do ORH (+/- 1 tick)
                        # Busca se alguma barra futura bateu na borda antes de stopar
                        pb_entered = False
                        for j, (ts_pb, b_pb) in enumerate(post_b.iterrows()):
                            if b_pb["low"] <= orh: # Fez pullback na borda
                                post_pb = post_b.iloc[j+1:]
                                if len(post_pb) > 0:
                                    pnl_pb, _, _ = sim_bracket(post_pb, orh, 1, q25, q25 * 2.0, be_trigger_pts=q25)
                                    trades_pullback.append(pnl_pb)
                                    pb_entered = True
                                break
                    breakout_done = True
                    break

                # B) Teste de Breakout Baixa
                elif not breakout_done and c < orl and f_bar <= 45.0:
                    post_b = rest.iloc[i+1:].head(60)
                    if len(post_b) > 0:
                        pnl_s, _, _ = sim_bracket(post_b, c, -1, q25, q25 * 2.0, be_trigger_pts=q25)
                        trades_seco.append(pnl_s)

                        for j, (ts_pb, b_pb) in enumerate(post_b.iterrows()):
                            if b_pb["high"] >= orl:
                                post_pb = post_b.iloc[j+1:]
                                if len(post_pb) > 0:
                                    pnl_pb, _, _ = sim_bracket(post_pb, orl, -1, q25, q25 * 2.0, be_trigger_pts=q25)
                                    trades_pullback.append(pnl_pb)
                                    break
                    breakout_done = True
                    break

                # C) Teste de Fade (Reversão): toca a borda mas fecha dentro e força < 55%
                if not fade_done and not breakout_done:
                    if h >= orh and c <= orh and f_bar < 55.0:
                        post_f = rest.iloc[i+1:].head(60)
                        if len(post_f) > 0:
                            pnl_f, _, _ = sim_bracket(post_f, c, -1, q25, mid - c if (mid - c) > 0 else q25, be_trigger_pts=q25)
                            trades_fade.append(pnl_f)
                            fade_done = True
                            break
                    elif l <= orl and c >= orl and f_bar > 45.0:
                        post_f = rest.iloc[i+1:].head(60)
                        if len(post_f) > 0:
                            pnl_f, _, _ = sim_bracket(post_f, c, 1, q25, c - mid if (c - mid) > 0 else q25, be_trigger_pts=q25)
                            trades_fade.append(pnl_f)
                            fade_done = True
                            break

        def print_res(name, arr):
            if len(arr) > 0:
                w = np.mean([1 if x > 0 else 0 for x in arr]) * 100
                tot = np.sum(arr)
                avg = np.mean(arr)
                print(f"  • {name:25} | N={len(arr):3} | Win={w:5.1f}% | Avg={avg:+6.2f} pts | Total={tot:+8.1f} pts")
            else:
                print(f"  • {name:25} | N=  0 | Sem eventos")

        print_res("1. Breakout Seco", trades_seco)
        print_res("2. Breakout c/ Pullback", trades_pullback)
        print_res("3. Reversão (Fade)", trades_fade)

    # =========================================================================
    # PARTE 5: ESTUDO COMPARATIVO OR15 VS OR60 (T60 - INITIAL BALANCE 60 MIN)
    # =========================================================================
    print(f"\n--- PARTE 5: ESTUDO COMPARATIVO OR15 VS OR60 (T60) ({symbol_name}) ---")
    
    # 1. Estatísticas descritivas das caixas
    ranges_15 = [r["range_15"] for r in records]
    ranges_60 = [r["range_60"] for r in records]
    print(f"Média Range OR15: {np.mean(ranges_15):.1f} pts | Mediana: {np.median(ranges_15):.1f} pts")
    print(f"Média Range OR60: {np.mean(ranges_60):.1f} pts | Mediana: {np.median(ranges_60):.1f} pts")

    # 2. Simulação de Breakout e Reversão no T60 (após 10:30 NY)
    trades_t60_breakout = []
    trades_t60_fade = []

    for r in records:
        rest = r["rest_60"]
        if len(rest) == 0:
            continue
        orh = r["orh_60"]
        orl = r["orl_60"]
        mid = r["mid_60"]
        q25 = r["q25_60"]

        bo_done = False
        fade_done = False

        for i, (ts, bar) in enumerate(rest.iterrows()):
            f_bar = bar["forca_final_compra"]
            c = bar["close"]
            h = bar["high"]
            l = bar["low"]

            # Breakout T60 Alta
            if not bo_done and c > orh and f_bar >= 55.0:
                post = rest.iloc[i+1:].head(90)
                if len(post) > 0:
                    pnl, _, _ = sim_bracket(post, c, 1, q25, q25 * 2.0, be_trigger_pts=q25)
                    trades_t60_breakout.append(pnl)
                bo_done = True
                break
            # Breakout T60 Baixa
            elif not bo_done and c < orl and f_bar <= 45.0:
                post = rest.iloc[i+1:].head(90)
                if len(post) > 0:
                    pnl, _, _ = sim_bracket(post, c, -1, q25, q25 * 2.0, be_trigger_pts=q25)
                    trades_t60_breakout.append(pnl)
                bo_done = True
                break

            # Fade T60 Alta
            if not fade_done and not bo_done:
                if h >= orh and c <= orh and f_bar < 55.0:
                    post = rest.iloc[i+1:].head(90)
                    if len(post) > 0:
                        pnl, _, _ = sim_bracket(post, c, -1, q25, q25, be_trigger_pts=q25*0.5)
                        trades_t60_fade.append(pnl)
                    fade_done = True
                    break
                elif l <= orl and c >= orl and f_bar > 45.0:
                    post = rest.iloc[i+1:].head(90)
                    if len(post) > 0:
                        pnl, _, _ = sim_bracket(post, c, 1, q25, q25, be_trigger_pts=q25*0.5)
                        trades_t60_fade.append(pnl)
                    fade_done = True
                    break

    def print_metric(name, arr):
        if len(arr) > 0:
            w = np.mean([1 if x > 0 else 0 for x in arr]) * 100
            tot = np.sum(arr)
            avg = np.mean(arr)
            print(f"{name:35} | N={len(arr):3} | Win={w:5.1f}% | Avg={avg:+6.2f} pts | Total={tot:+8.1f} pts")
    
    print_metric("T60 Breakout (+50% Expansão)", trades_t60_breakout)
    print_metric("T60 Fade (Retorno à Caixa)", trades_t60_fade)


if __name__ == "__main__":
    # NQ: NQ_1m_BRT.csv
    run_analysis_for_asset("NASDAQ (NQ)", "NQ_1m_BRT.csv", 0.25, 20.0, default_t0_tp=130.0, default_t0_sl=85.0, default_m5_tp=110.0, default_m5_sl=75.0)
    # ES: ES_1m_BRT.csv
    run_analysis_for_asset("S&P 500 (ES)", "ES_1m_BRT.csv", 0.25, 50.0, default_t0_tp=22.0, default_t0_sl=14.0, default_m5_tp=16.0, default_m5_sl=11.0)
