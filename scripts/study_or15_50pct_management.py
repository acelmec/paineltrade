"""Estudo completo de Gestao Dinamica na OR15 (Maxima e Minima dos primeiros 15 min)
utilizando:
- Metade da Maxima e Minima = 50% do Range (0.50 * OR_Range = distancia ate o OR_Mid)
- 50% da Metade da Maxima e Minima = 25% do Range (0.25 * OR_Range = quarto do range)

Testa:
A) Reversao (Fade) nas extremidades ORH / ORL voltando para dentro do range
B) Breakout nas extremidades ORH / ORL projetando para fora do range
C) Pullback de Reteste na linha ORH / ORL apos fechamento fora
D) Pullback Interno ate 25% (50% da metade) ou 50% (OR_Mid) a favor da forca dos primeiros 15m
"""
import os, numpy as np, pandas as pd
import sys; sys.path.insert(0, "scripts")
from study_opening_and_or15 import df, ddf, ordf

def sim_pct_bracket(bars, entry_price, direction, sl_pts, tp_pts, be_trigger_pts=None):
    """Simula bracket com SL e TP em pontos (calculados como % do OR_Range).
    Se be_trigger_pts for informado, ao atingir +be_trigger_pts move o SL para o breakeven (0).
    """
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

    last_c = bars.iloc[-1]["close"]
    pnl = (last_c - entry_price) * direction
    return pnl, "TIME", len(bars)

def sim_partial_25_50(bars, entry_price, direction, sl_pts, tp1_pts, tp2_pts):
    """Sai 50% da posicao em tp1_pts (25% do OR = 50% da metade), move SL para 0 (breakeven),
    e busca tp2_pts (50% do OR = OR_Mid) na outra metade!
    """
    half1_done = False
    pnl_half1 = 0.0
    cur_sl = -sl_pts
    for i, (ts, b) in enumerate(bars.iterrows(), start=1):
        if direction == 1:
            fav = b["high"] - entry_price
            adv = b["low"]  - entry_price
        else:
            fav = entry_price - b["low"]
            adv = entry_price - b["high"]

        if adv <= cur_sl:
            if not half1_done:
                return -sl_pts, "SL_FULL"
            else:
                return 0.5 * pnl_half1 + 0.5 * cur_sl, "TP1_THEN_BE"
        if not half1_done and fav >= tp1_pts:
            half1_done = True
            pnl_half1 = tp1_pts
            cur_sl = 0.0 # protege no zero!
        if half1_done and fav >= tp2_pts:
            return 0.5 * pnl_half1 + 0.5 * tp2_pts, "TP1_AND_TP2"

    last_c = bars.iloc[-1]["close"]
    rem_pnl = (last_c - entry_price) * direction
    if half1_done:
        return 0.5 * pnl_half1 + 0.5 * rem_pnl, "TP1_THEN_TIME"
    return rem_pnl, "TIME"

# Coletar todos os eventos de toque em ORH/ORL com a janela de 60 minutos seguinte
records = []
for _, r_day in ddf.iterrows():
    d_ny = r_day["date"]
    t0 = r_day["t0"]
    orh, orl, or_rng = r_day["orh"], r_day["orl"], r_day["or_rng"]
    b_post = r_day["b_post_or"] # 09:45 ET ate 12:30 ET

    hit_h = b_post[b_post["high"] >= orh]
    hit_l = b_post[b_post["low"]  <= orl]
    fh = hit_h.index[0] if not hit_h.empty else None
    fl = hit_l.index[0] if not hit_l.empty else None

    for side, ts_hit, lvl in [("ORH", fh, orh), ("ORL", fl, orl)]:
        if ts_hit is None:
            continue
        w60 = df.loc[ts_hit + pd.Timedelta(minutes=1) : ts_hit + pd.Timedelta(minutes=60)]
        if len(w60) < 15:
            continue
        row_hit = df.loc[ts_hit]
        dir_brk  = 1 if side == "ORH" else -1
        dir_fade = -dir_brk
        closed_out = (row_hit["close"] > lvl) if side == "ORH" else (row_hit["close"] < lvl)
        forca_fav = row_hit["forca_real"] if side == "ORH" else (100 - row_hit["forca_real"])
        tech_fav  = row_hit["tech_compra"] if side == "ORH" else (100 - row_hit["tech_compra"])
        spread_fav = row_hit["spread_tech_nq"] if side == "ORH" else -row_hit["spread_tech_nq"]
        is_first = (fl is None or ts_hit <= fl) if side == "ORH" else (fh is None or ts_hit <= fh)

        # Distancias baseadas na Maxima e Minima da OR15:
        # q25 = 50% da metade da Maxima e Minima = 25% do range total (0.25 * or_rng)
        # q50 = Metade da Maxima e Minima = 50% do range total (0.50 * or_rng = distancia ate OR_Mid)
        # q100 = 100% do range total
        q25 = 0.25 * or_rng
        q50 = 0.50 * or_rng

        rec = {
            "date": d_ny, "side": side, "or_rng": or_rng, "q25": q25, "q50": q50,
            "is_first": is_first, "closed_out": closed_out,
            "forca_fav": forca_fav, "tech_fav": tech_fav, "spread_fav": spread_fav,
        }

        # --- TESTES DE FADE (REVERSAO PARA DENTRO DA CAIXA) ---
        # F1: TP = 25% OR (50% da metade), SL = 25% OR (50% da metade) [1:1]
        rec["fade_25_25"], _, _ = sim_pct_bracket(w60, lvl, dir_fade, sl_pts=q25, tp_pts=q25)
        # F2: TP = 50% OR (OR_Mid), SL = 25% OR (50% da metade) [2:1]
        rec["fade_50_25"], _, _ = sim_pct_bracket(w60, lvl, dir_fade, sl_pts=q25, tp_pts=q50)
        # F3: TP = 50% OR (OR_Mid), SL = 25% OR c/ Breakeven em 25% OR
        rec["fade_50_25_be"], _, _ = sim_pct_bracket(w60, lvl, dir_fade, sl_pts=q25, tp_pts=q50, be_trigger_pts=q25)
        # F4: TP = 50% OR (OR_Mid), SL = 50% OR (Metade p/ Metade) [1:1]
        rec["fade_50_50"], _, _ = sim_pct_bracket(w60, lvl, dir_fade, sl_pts=q50, tp_pts=q50)
        # F5: Parcial 50% em 25% OR (50% da metade) + BE + Final em 50% OR (OR_Mid), SL = 25% OR
        rec["fade_part_25_50_sl25"], _ = sim_partial_25_50(w60, lvl, dir_fade, sl_pts=q25, tp1_pts=q25, tp2_pts=q50)
        # F6: Parcial 50% em 25% OR (50% da metade) + BE + Final em 50% OR (OR_Mid), SL = 50% OR
        rec["fade_part_25_50_sl50"], _ = sim_partial_25_50(w60, lvl, dir_fade, sl_pts=q50, tp1_pts=q25, tp2_pts=q50)

        # --- TESTES DE BREAKOUT (CONTINUIDADE PARA FORA DA CAIXA) ---
        # B1: TP = 25% OR (50% da metade), SL = 25% OR (50% da metade p/ dentro) [1:1]
        rec["brk_25_25"], _, _ = sim_pct_bracket(w60, lvl, dir_brk, sl_pts=q25, tp_pts=q25)
        # B2: TP = 50% OR (Metade projetada), SL = 25% OR (50% da metade p/ dentro) [2:1]
        rec["brk_50_25"], _, _ = sim_pct_bracket(w60, lvl, dir_brk, sl_pts=q25, tp_pts=q50)
        # B3: TP = 50% OR (Metade projetada), SL = 50% OR (OR_Mid) [1:1]
        rec["brk_50_50"], _, _ = sim_pct_bracket(w60, lvl, dir_brk, sl_pts=q50, tp_pts=q50)
        # B4: Parcial 50% em 25% OR + BE + Final em 50% OR, SL = 25% OR
        rec["brk_part_25_50_sl25"], _ = sim_partial_25_50(w60, lvl, dir_brk, sl_pts=q25, tp1_pts=q25, tp2_pts=q50)
        # B5: Parcial 50% em 25% OR + BE + Final em 50% OR, SL = 50% OR (OR_Mid)
        rec["brk_part_25_50_sl50"], _ = sim_partial_25_50(w60, lvl, dir_brk, sl_pts=q50, tp1_pts=q25, tp2_pts=q50)

        records.append(rec)

rdf = pd.DataFrame(records)
print(f"Total de eventos OR15 avaliados: {len(rdf)} (q25 medio = 50% da metade = {rdf['q25'].mean():.1f} pts | q50 medio = metade = {rdf['q50'].mean():.1f} pts)")

def show_table(sub, title):
    print(f"\n>>> {title} (n={len(sub)} eventos | q25 medio={sub['q25'].mean():.1f} pts | q50 medio={sub['q50'].mean():.1f} pts):")
    cols = [
        ("fade_25_25",          "REVERSAO (Fade) [TP=25% OR (50% da metade) | SL=25% OR] (1:1)"),
        ("fade_50_25",          "REVERSAO (Fade) [TP=50% OR (Centro OR_Mid) | SL=25% OR] (2:1)"),
        ("fade_50_25_be",       "REVERSAO (Fade) [TP=50% OR | SL=25% OR + Move p/ Zero em 25%]"),
        ("fade_part_25_50_sl25","REVERSAO (Fade) [Parcial 25% OR + BE + Final 50% OR | SL=25%]"),
        ("fade_50_50",          "REVERSAO (Fade) [TP=50% OR (Centro OR_Mid) | SL=50% OR] (1:1)"),
        ("fade_part_25_50_sl50","REVERSAO (Fade) [Parcial 25% OR + BE + Final 50% OR | SL=50%]"),
        ("brk_25_25",           "BREAKOUT        [TP=25% OR (50% da metade) | SL=25% OR] (1:1)"),
        ("brk_50_25",           "BREAKOUT        [TP=50% OR (Proj. Metade)  | SL=25% OR] (2:1)"),
        ("brk_part_25_50_sl25", "BREAKOUT        [Parcial 25% OR + BE + Final 50% OR | SL=25%]"),
        ("brk_50_50",           "BREAKOUT        [TP=50% OR (Proj. Metade)  | SL=50% OR (Mid)]"),
        ("brk_part_25_50_sl50", "BREAKOUT        [Parcial 25% OR + BE + Final 50% OR | SL=50%]"),
    ]
    for c, lbl in cols:
        s = sub[c]
        print(f"  {lbl:64s}: media={s.mean():+6.2f} pts | win={(s>0).mean()*100:5.1f}% | soma={s.sum():+7.1f} pts")

# 1. Todos os 1os toques do dia (n=68)
show_table(rdf[rdf["is_first"]], "1. PRIMEIRO TOQUE DO DIA NA ORH OU ORL (TODOS OS 68 PREGOES SEM FILTRO)")

# 2. 1o toque com Rejeicao / Sem Forca de Rompimento (Nao fechou fora OU Forca_Favor < 55)
show_table(rdf[rdf["is_first"] & ((~rdf["closed_out"]) | (rdf["forca_fav"] < 55))],
           "2. 1o TOQUE COM REJEICAO / EXAUSTAO (Nao fecha fora OU Forca_Favor < 55)")

# 3. Caixa Normal/Ampla (OR >= 120 pts) no 1o toque com Rejeicao
show_table(rdf[rdf["is_first"] & (rdf["or_rng"] >= 120) & ((~rdf["closed_out"]) | (rdf["forca_fav"] < 55))],
           "3. CAIXA >= 120 PTS + 1o TOQUE COM REJEICAO (SETUP REVERSAO INTERNA)")

# 4. Quando o BREAKOUT ganha? Caixa Comprimida (< 120 pts) + Fecha Fora, OU Forca_Favor >= 58 + Tech_Favor >= 55 + OR Explosivo
show_table(rdf[(rdf["or_rng"] < 120) & (rdf["closed_out"])],
           "4A. CAIXA COMPRIMIDA (< 120 PTS) + VELA FECHA FORA (SETUP BREAKOUT)")

show_table(rdf[(rdf["or_rng"] > 180) & (rdf["forca_fav"] >= 52)],
           "4B. CAIXA EXPLOSIVA (> 180 PTS) + FORCA A FAVOR >= 52% (SETUP BREAKOUT)")

# 5. E o PULLBACK INTERNO antes de romper (aos 09:45 ET, esperar o preco recuar ate 25% do OR [50% da metade] ou 50% do OR [OR_Mid] para ir a favor da forca)?
print("\n=====================================================================")
print("5. PULLBACK INTERNO AOS 15 MIN (ENTRAR NA LINHA DE 25% OU 50% DO OR A FAVOR DA FORCA)")
print("=====================================================================")
pb_int = []
for _, r_day in ddf.iterrows():
    orh, orl, or_rng, or_mid = r_day["orh"], r_day["orl"], r_day["or_rng"], r_day["or_mid"]
    f15 = r_day["f_or15_end"]; tech15 = r_day["tech_or15_end"]
    b_post = r_day["b_post_or"].iloc[:60] # primeiros 60m apos OR15 (09:45 as 10:45 ET)
    if len(b_post) < 30: continue
    q25 = 0.25 * or_rng
    q50 = 0.50 * or_rng

    # Se aos 15m a Forca eh Compradora (>=54 e Tech>=52), queremos comprar no recuo ate (ORH - 25% OR) ou ate OR_Mid (ORH - 50% OR)
    if f15 >= 54 and tech15 >= 52:
        dir_t = 1
        lvl_25 = orh - q25 # recuo de 50% da metade a partir do topo
        lvl_50 = or_mid    # recuo ate a metade exata
    elif f15 <= 46 and tech15 <= 48:
        dir_t = -1
        lvl_25 = orl + q25
        lvl_50 = or_mid
    else:
        continue

    # Testar entrada limite em lvl_50 (OR_Mid) nos primeiros 30m apos OR15, com SL = q25 (50% da metade) e TP = q50 (volta ate ORH/ORL)
    w_search = b_post.iloc[:30]
    if dir_t == 1:
        hit_mid = w_search[(w_search["low"] <= lvl_50) & (w_search["high"] >= lvl_50)]
    else:
        hit_mid = w_search[(w_search["high"] >= lvl_50) & (w_search["low"] <= lvl_50)]
    if not hit_mid.empty:
        t_h = hit_mid.index[0]
        w_rem = df.loc[t_h + pd.Timedelta(minutes=1) : t_h + pd.Timedelta(minutes=60)]
        if len(w_rem) >= 10:
            p_25, _, _ = sim_pct_bracket(w_rem, lvl_50, dir_t, sl_pts=q25, tp_pts=q25)
            p_50, _, _ = sim_pct_bracket(w_rem, lvl_50, dir_t, sl_pts=q25, tp_pts=q50)
            p_part, _  = sim_partial_25_50(w_rem, lvl_50, dir_t, sl_pts=q25, tp1_pts=q25, tp2_pts=q50)
            pb_int.append({"date": r_day["date"], "dir": dir_t, "p_25": p_25, "p_50": p_50, "p_part": p_part})

pbi = pd.DataFrame(pb_int)
if not pbi.empty:
    print(f"Pullbacks ate o Centro da Caixa (OR_Mid = 50% da Max/Min) a favor da Forca dos 15m (n={len(pbi)} dias):")
    for k, desc in [
        ("p_25",   "Alvo 25% OR (50% da metade) | Stop 25% OR (50% da metade) [1:1]"),
        ("p_50",   "Alvo 50% OR (Retorno a ORH/ORL)| Stop 25% OR (50% da metade) [2:1]"),
        ("p_part", "Parcial em 25% OR + BE + Final na ORH/ORL (50% OR) | Stop 25% OR"),
    ]:
        s = pbi[k]
        print(f"  {desc:64s}: media={s.mean():+6.2f} pts | win={(s>0).mean()*100:5.1f}% | soma={s.sum():+7.1f} pts")
