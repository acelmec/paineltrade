"""
Estudo Matematico Completo (365 Dias - Databento CME GLBX.MDP3):
1. OTIMIZACAO DE SL E TP PARA SCALPER (Entrada Unica vs. Com Parcial) para T0 e T5:
   - NQ e ES
   - Entrada Unica (varrendo grids de SL e TP)
   - Com Parcial (1a saida em X pts + Breakeven + 2a saida em Y pts)
2. GESTAO GEOMETRICA NA OR15 (25%, 35% e 50% do Range):
   - Reversao (Fade) na Borda:
     * Alvo 25%, 35%, 50% (OR_Mid)
     * Parcial 25% + Final 50%
     * Parcial 35% + Final 50%
   - Breakout na Expansao (Seco e com Pullback na Borda):
     * Expansao +25%, +35%, +50%
     * Parcial +25% + Final +50%
     * Parcial +35% + Final +50%
Simulacao barra a barra de preco com trailing stop / breakeven exatos.
"""
import os, sys, numpy as np, pandas as pd

TZ_BRT = 'America/Sao_Paulo'
TZ_NY  = 'America/New_York'
BASE   = os.path.join('data', 'databento')

def sim_trade_single(highs, lows, entry, direction, sl_pts, tp_pts, last_close):
    """Entrada unica (sem parcial)."""
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
    """
    Operacao com parcial (50% do lote em p1_tp_pts, restante em p2_tp_pts).
    Ao bater p1_tp_pts, move SL para Breakeven (0.0).
    Retorna PnL ponderado por contrato equivalente (1 lote base).
    """
    cur_sl = -sl_pts
    hit_p1 = False
    
    for h, l in zip(highs, lows):
        fav = (h - entry) if direction == 1 else (entry - l)
        adv = (l - entry) if direction == 1 else (entry - h)
        
        # Se ainda nao bateu P1
        if not hit_p1:
            if adv <= cur_sl:
                return -sl_pts, "SL"
            if fav >= p1_tp_pts:
                hit_p1 = True
                cur_sl = 0.0 # Move para Breakeven
                # Se na mesma barra bateu P2
                if fav >= p2_tp_pts:
                    return 0.5 * p1_tp_pts + 0.5 * p2_tp_pts, "TP_FULL"
        else:
            # Ja bateu P1, agora monitora P2 ou BE
            if adv <= cur_sl: # Bateu Breakeven no 2o lote
                return 0.5 * p1_tp_pts + 0.5 * 0.0, "BE"
            if fav >= p2_tp_pts:
                return 0.5 * p1_tp_pts + 0.5 * p2_tp_pts, "TP_FULL"
                
    # Se encerrou no tempo
    final_p = (last_close - entry) * direction
    if hit_p1:
        return 0.5 * p1_tp_pts + 0.5 * final_p, "TIME_P1"
    else:
        return final_p, "TIME"

def run_study():
    print("Carregando bases históricas de 365 dias...", flush=True)
    c_nq = pd.read_csv(os.path.join(BASE, 'NQ_1m_BRT.csv'), parse_dates=['time_brt'], index_col='time_brt')
    c_es = pd.read_csv(os.path.join(BASE, 'ES_1m_BRT.csv'), parse_dates=['time_brt'], index_col='time_brt')
    force_df = pd.read_csv(os.path.join(BASE, 'nasdaq_force_365d_BRT.csv'), parse_dates=['timestamp'], index_col='timestamp')

    for c in [c_nq, c_es, force_df]:
        if c.index.tz is None: c.index = c.index.tz_localize(TZ_BRT)
        else: c.index = c.index.tz_convert(TZ_BRT)

    start_365 = pd.Timestamp('2025-11-11 00:00:00', tz=TZ_BRT)
    end_365   = pd.Timestamp('2026-11-10 23:59:00', tz=TZ_BRT)

    for asset_name, c_df, scalper_grids, or15_cuts in [
        ("NASDAQ (NQ)", c_nq, 
         {
             "t0_single": [(25, 25), (35, 35), (45, 45), (50, 40), (45, 65), (60, 45), (65, 65), (85, 130)],
             "t0_partial": [(45, 25, 50), (45, 30, 60), (45, 35, 70), (50, 25, 60), (50, 35, 80), (60, 30, 75), (85, 45, 130)],
             "t5_single": [(35, 35), (45, 45), (55, 55), (60, 45), (60, 80), (75, 75), (75, 110), (85, 120)],
             "t5_partial": [(50, 30, 60), (60, 30, 75), (60, 40, 90), (75, 40, 100), (75, 45, 110), (75, 50, 120)]
         },
         {"cut_small": 120.0, "cut_large": 180.0}),
        
        ("S&P 500 (ES)", c_es,
         {
             "t0_single": [(5, 5), (6, 6), (7, 7), (8, 6), (8, 10), (10, 8), (10, 15), (14, 22)],
             "t0_partial": [(7, 4, 8), (7, 4, 10), (8, 5, 10), (8, 5, 12), (10, 5, 12), (14, 7, 22)],
             "t5_single": [(5, 5), (7, 7), (8, 8), (10, 8), (10, 12), (11, 11), (11, 16), (14, 20)],
             "t5_partial": [(8, 4, 10), (10, 5, 12), (11, 5, 14), (11, 6, 16), (11, 7, 18), (14, 7, 22)]
         },
         {"cut_small": 20.0, "cut_large": 30.0})
    ]:
        print(f"\n{'='*80}\nESTUDO DE OTIMIZACAO DE SL/TP E GESTAO 25%, 35%, 50%: {asset_name}\n{'='*80}", flush=True)
        df = c_df.loc[(c_df.index >= start_365) & (c_df.index <= end_365)].join(force_df, how='inner')
        df['ny_time'] = df.index.tz_convert(TZ_NY)
        df['ny_date'] = df['ny_time'].dt.date
        df['ny_hm']   = df['ny_time'].dt.strftime('%H:%M')
        tech_cols = ['nvidia_compra', 'microsoft_compra', 'apple_compra', 'meta_compra', 'amazon_compra', 'alphabet_compra', 'tesla_compra']
        df['tech_compra'] = df[tech_cols].mean(axis=1)

        # Pré-processa sessões e dados por dia
        days_data = []
        for d, day_df in df.groupby('ny_date'):
            # Abertura 09:30
            b_t0 = day_df[day_df['ny_hm'] == '09:30']
            if len(b_t0) == 0: continue
            ny_open_ts = b_t0.index[0]
            
            # Sessoes noturnas
            t15_b = day_df[day_df['ny_hm'] == '09:15']
            f_t15 = t15_b.iloc[0]['forca_final_compra'] if len(t15_b) > 0 else 50.0
            
            ldn_b = day_df[(day_df['ny_hm'] >= '04:00') & (day_df['ny_hm'] <= '08:00')]
            f_ldn = ldn_b['forca_final_compra'].mean() if len(ldn_b) > 0 else 50.0
            
            asia_b = df[(df.index >= ny_open_ts - pd.Timedelta(hours=15)) & (df.index <= ny_open_ts - pd.Timedelta(hours=8))]
            f_asia = asia_b['forca_final_compra'].mean() if len(asia_b) > 0 else 50.0
            
            # Barras T0 (09:30 ate 10:30)
            post_t0 = day_df[day_df['ny_hm'] >= '09:30'].head(60)
            entry_t0 = post_t0.iloc[0]['open']
            highs_t0 = post_t0['high'].values
            lows_t0  = post_t0['low'].values
            c_t0     = post_t0.iloc[-1]['close']
            
            # T5 (09:35)
            b_m5 = day_df[day_df['ny_hm'] == '09:35']
            f_m5 = b_m5.iloc[0]['forca_final_compra'] if len(b_m5) > 0 else 50.0
            tech_m5 = b_m5.iloc[0]['tech_compra'] if len(b_m5) > 0 else 50.0
            post_t5 = day_df[day_df['ny_hm'] >= '09:35'].head(60)
            entry_t5 = post_t5.iloc[0]['open'] if len(post_t5) > 0 else 0.0
            highs_t5 = post_t5['high'].values if len(post_t5) > 0 else []
            lows_t5  = post_t5['low'].values if len(post_t5) > 0 else []
            c_t5     = post_t5.iloc[-1]['close'] if len(post_t5) > 0 else 0.0
            
            # OR15
            or15_b = day_df[(day_df['ny_hm'] >= '09:30') & (day_df['ny_hm'] <= '09:45')]
            if len(or15_b) < 15: continue
            orh_15 = or15_b['high'].max()
            orl_15 = or15_b['low'].min()
            range_15 = orh_15 - orl_15
            mid_15 = (orh_15 + orl_15) / 2.0
            
            rest_15 = day_df[day_df['ny_hm'] > '09:45']
            
            days_data.append({
                "date": d,
                "f_asia": f_asia, "f_ldn": f_ldn, "f_t15": f_t15,
                "f_m5": f_m5, "tech_m5": tech_m5,
                "entry_t0": entry_t0, "highs_t0": highs_t0, "lows_t0": lows_t0, "c_t0": c_t0,
                "entry_t5": entry_t5, "highs_t5": highs_t5, "lows_t5": lows_t5, "c_t5": c_t5,
                "orh": orh_15, "orl": orl_15, "range": range_15, "mid": mid_15,
                "rest": rest_15
            })

        print(f"Total de dias analisados para {asset_name}: {len(days_data)}", flush=True)

        # -------------------------------------------------------------
        # 1. SCALPER T0: ENTRADA UNICA VS. COM PARCIAL
        # -------------------------------------------------------------
        print(f"\n--- 1. SCALPER T0: ENTRADA UNICA ({asset_name}) ---", flush=True)
        # Gatilho T0: NQ usa Asia+Ldn (Modo 5), ES usa Asia+T15 (Modo 1)
        is_nq = ("NQ" in asset_name)
        def get_sig_t0(d):
            if is_nq:
                return 1 if (d["f_asia"] >= 52 and d["f_ldn"] >= 52) else (-1 if (d["f_asia"] <= 48 and d["f_ldn"] <= 48) else 0)
            else:
                return 1 if (d["f_asia"] >= 52 and d["f_t15"] >= 52) else (-1 if (d["f_asia"] <= 48 and d["f_t15"] <= 48) else 0)

        for sl, tp in scalper_grids["t0_single"]:
            trades = []
            for d in days_data:
                sig = get_sig_t0(d)
                if sig != 0:
                    pnl, _ = sim_trade_single(d["highs_t0"], d["lows_t0"], d["entry_t0"], sig, sl, tp, d["c_t0"])
                    trades.append(pnl)
            w = np.mean([1 if t > 0 else 0 for t in trades]) * 100
            print(f"  SL {sl:2d} pts | TP {tp:3d} pts (Payoff {tp/sl:.2f}) | N={len(trades):3d} | Win={w:5.1f}% | Méd={np.mean(trades):+6.2f} pts | Total={np.sum(trades):+8.1f} pts", flush=True)

        print(f"\n--- 1.B. SCALPER T0: COM SAIDA PARCIAL (50% Parcial + BE + 50% Final) ({asset_name}) ---", flush=True)
        for sl, p1, p2 in scalper_grids["t0_partial"]:
            trades = []
            for d in days_data:
                sig = get_sig_t0(d)
                if sig != 0:
                    pnl, _ = sim_trade_partial(d["highs_t0"], d["lows_t0"], d["entry_t0"], sig, sl, p1, p2, d["c_t0"])
                    trades.append(pnl)
            w = np.mean([1 if t > 0 else 0 for t in trades]) * 100
            print(f"  SL {sl:2d} | P1 {p1:2d} | P2 {p2:3d} pts | N={len(trades):3d} | Win={w:5.1f}% | Méd={np.mean(trades):+6.2f} pts | Total={np.sum(trades):+8.1f} pts", flush=True)

        # -------------------------------------------------------------
        # 2. SCALPER T5 (M5): ENTRADA UNICA VS. COM PARCIAL
        # -------------------------------------------------------------
        print(f"\n--- 2. SCALPER T5 (M5): ENTRADA UNICA (Força >= 60%) ({asset_name}) ---", flush=True)
        def get_sig_t5(d):
            if d["f_m5"] >= 60.0 and d["tech_m5"] >= 50.0: return 1
            if d["f_m5"] <= 40.0 and d["tech_m5"] <= 50.0: return -1
            return 0

        for sl, tp in scalper_grids["t5_single"]:
            trades = []
            for d in days_data:
                sig = get_sig_t5(d)
                if sig != 0 and len(d["highs_t5"]) > 0:
                    pnl, _ = sim_trade_single(d["highs_t5"], d["lows_t5"], d["entry_t5"], sig, sl, tp, d["c_t5"])
                    trades.append(pnl)
            w = np.mean([1 if t > 0 else 0 for t in trades]) * 100
            print(f"  SL {sl:2d} pts | TP {tp:3d} pts (Payoff {tp/sl:.2f}) | N={len(trades):3d} | Win={w:5.1f}% | Méd={np.mean(trades):+6.2f} pts | Total={np.sum(trades):+8.1f} pts", flush=True)

        print(f"\n--- 2.B. SCALPER T5: COM SAIDA PARCIAL (50% Parcial + BE + 50% Final) ({asset_name}) ---", flush=True)
        for sl, p1, p2 in scalper_grids["t5_partial"]:
            trades = []
            for d in days_data:
                sig = get_sig_t5(d)
                if sig != 0 and len(d["highs_t5"]) > 0:
                    pnl, _ = sim_trade_partial(d["highs_t5"], d["lows_t5"], d["entry_t5"], sig, sl, p1, p2, d["c_t5"])
                    trades.append(pnl)
            w = np.mean([1 if t > 0 else 0 for t in trades]) * 100
            print(f"  SL {sl:2d} | P1 {p1:2d} | P2 {p2:3d} pts | N={len(trades):3d} | Win={w:5.1f}% | Méd={np.mean(trades):+6.2f} pts | Total={np.sum(trades):+8.1f} pts", flush=True)

        # -------------------------------------------------------------
        # 3. GESTAO GEOMETRICA NA OR15: 25%, 35% e 50% DO RANGE
        # -------------------------------------------------------------
        print(f"\n{'='*75}\n--- 3. GESTAO GEOMETRICA NA OR15 (25%, 35% e 50% do Range): {asset_name} ---\n{'='*75}", flush=True)

        # A) REVERSAO (FADE NA BORDA): Testa 25%, 35% e 50% (OR_Mid)
        print(f"\n>>> A) REVERSAO (FADE NA BORDA DA OR15):")
        # Cenários:
        # 1. Alvo 25% | Stop 25% (1:1)
        # 2. Alvo 35% | Stop 25% (1.4:1)
        # 3. Alvo 35% | Stop 35% (1:1)
        # 4. Alvo 50% (OR_Mid) | Stop 25% (2:1)
        # 5. Alvo 50% (OR_Mid) | Stop 50% (1:1)
        # 6. Parcial 25% + BE + Final 50% | Stop 25%
        # 7. Parcial 35% + BE + Final 50% | Stop 25%
        # 8. Parcial 25% + BE + Final 50% | Stop 35%
        fade_models = [
            ("Alvo Seco 25% | Stop 25%", False, 0.25, 0.25, 0.25),
            ("Alvo Seco 35% | Stop 25%", False, 0.25, 0.35, 0.35),
            ("Alvo Seco 35% | Stop 35%", False, 0.35, 0.35, 0.35),
            ("Alvo Seco 50% (OR_Mid) | Stop 25%", False, 0.25, 0.50, 0.50),
            ("Alvo Seco 50% (OR_Mid) | Stop 50%", False, 0.50, 0.50, 0.50),
            ("Parcial 25% + BE + Final 50% | Stop 25%", True, 0.25, 0.25, 0.50),
            ("Parcial 35% + BE + Final 50% | Stop 25%", True, 0.25, 0.35, 0.50),
            ("Parcial 25% + BE + Final 50% | Stop 35%", True, 0.35, 0.25, 0.50),
            ("Parcial 35% + BE + Final 50% | Stop 35%", True, 0.35, 0.35, 0.50)
        ]

        for label, is_part, sl_pct, p1_pct, p2_pct in fade_models:
            trades = []
            for d in days_data:
                rest = d["rest"]
                if len(rest) == 0: continue
                orh = d["orh"]
                orl = d["orl"]
                rng = d["range"]
                mid = d["mid"]

                # Detecta 1o toque com rejeicao (fecha dentro e forca < 55%)
                for i, (ts, bar) in enumerate(rest.iterrows()):
                    f_bar = bar["forca_final_compra"]
                    c = bar["close"]
                    h = bar["high"]
                    l = bar["low"]
                    
                    sig = 0
                    if h >= orh and c <= orh and f_bar < 55.0: sig = -1 # Vende na borda superior
                    elif l <= orl and c >= orl and f_bar > 45.0: sig = 1  # Compra na borda inferior
                    
                    if sig != 0:
                        post = rest.iloc[i+1:].head(60)
                        if len(post) > 0:
                            entry = c
                            sl_pts = rng * sl_pct
                            p1_pts = rng * p1_pct
                            p2_pts = rng * p2_pct
                            highs = post['high'].values
                            lows  = post['low'].values
                            last_c = post.iloc[-1]['close']
                            
                            if is_part:
                                pnl, _ = sim_trade_partial(highs, lows, entry, sig, sl_pts, p1_pts, p2_pts, last_c)
                            else:
                                pnl, _ = sim_trade_single(highs, lows, entry, sig, sl_pts, p1_pts, last_c)
                            trades.append(pnl)
                        break
            if len(trades) > 0:
                w = np.mean([1 if t > 0 else 0 for t in trades]) * 100
                print(f"  • {label:42} | N={len(trades):3d} | Win={w:5.1f}% | Méd={np.mean(trades):+6.2f} pts | Total={np.sum(trades):+8.1f} pts", flush=True)

        # B) BREAKOUT (ROMPIMENTO DA OR15): Testa 25%, 35% e 50% de Expansao
        print(f"\n>>> B) BREAKOUT (ROMPIMENTO NA EXPANSAO DA OR15 - Força >= 60%):")
        bo_models = [
            ("Expansao Seca +25% | Stop 25%", False, 0.25, 0.25, 0.25),
            ("Expansao Seca +35% | Stop 25%", False, 0.25, 0.35, 0.35),
            ("Expansao Seca +35% | Stop 35%", False, 0.35, 0.35, 0.35),
            ("Expansao Seca +50% | Stop 25%", False, 0.25, 0.50, 0.50),
            ("Expansao Seca +50% | Stop 50% (no OR_Mid)", False, 0.50, 0.50, 0.50),
            ("Parcial +25% + BE + Final +50% | Stop 25%", True, 0.25, 0.25, 0.50),
            ("Parcial +35% + BE + Final +50% | Stop 25%", True, 0.25, 0.35, 0.50),
            ("Parcial +25% + BE + Final +50% | Stop 50%", True, 0.50, 0.25, 0.50),
            ("Parcial +35% + BE + Final +50% | Stop 50%", True, 0.50, 0.35, 0.50)
        ]

        for label, is_part, sl_pct, p1_pct, p2_pct in bo_models:
            trades = []
            for d in days_data:
                rest = d["rest"]
                if len(rest) == 0: continue
                orh = d["orh"]
                orl = d["orl"]
                rng = d["range"]

                for i, (ts, bar) in enumerate(rest.iterrows()):
                    f_bar = bar["forca_final_compra"]
                    c = bar["close"]
                    
                    sig = 0
                    if c > orh and f_bar >= 60.0: sig = 1
                    elif c < orl and f_bar <= 40.0: sig = -1
                    
                    if sig != 0:
                        post = rest.iloc[i+1:].head(60)
                        if len(post) > 0:
                            entry = c
                            sl_pts = rng * sl_pct
                            p1_pts = rng * p1_pct
                            p2_pts = rng * p2_pct
                            highs = post['high'].values
                            lows  = post['low'].values
                            last_c = post.iloc[-1]['close']
                            
                            if is_part:
                                pnl, _ = sim_trade_partial(highs, lows, entry, sig, sl_pts, p1_pts, p2_pts, last_c)
                            else:
                                pnl, _ = sim_trade_single(highs, lows, entry, sig, sl_pts, p1_pts, last_c)
                            trades.append(pnl)
                        break
            if len(trades) > 0:
                w = np.mean([1 if t > 0 else 0 for t in trades]) * 100
                print(f"  • {label:42} | N={len(trades):3d} | Win={w:5.1f}% | Méd={np.mean(trades):+6.2f} pts | Total={np.sum(trades):+8.1f} pts", flush=True)

if __name__ == "__main__":
    run_study()
