"""Backtest aprofundado nos 68 pregoes da Databento (06/08/2026 a 10/11/2026):
1) Detalhamento das 3 estrategias com metricas completas (MFE, MAE, Stop/Take, In-Sample vs Out-of-Sample)
2) Entrada no 1o segundo da Abertura (T0 = 09:30:00 ET, preco open de T0)
3) Opening Range de 15 minutos (ORH_15 e ORL_15): Breakout vs Reversao (Fade) vs Pullback apos rompimento.
"""
import os, numpy as np, pandas as pd

TZ_BRT = "America/Sao_Paulo"
TZ_NY  = "America/New_York"
WIN_DIR = os.path.join("data", "databento", "janela_0608_1011")

nq_full = pd.read_csv(os.path.join("data", "databento", "NQ_1m_BRT.csv"))
nq_full["ts"] = pd.to_datetime(nq_full["time_brt"], utc=True).dt.tz_convert(TZ_BRT)
nq = nq_full.set_index("ts").drop(columns=["time_brt"]).sort_index().loc["2026-08-06 00:00:00":"2026-11-10 23:59:00"].copy()

ff = pd.read_csv(os.path.join(WIN_DIR, "nasdaq_force_0608_1011_BRT.csv"))
ff["ts"] = pd.to_datetime(ff["timestamp"], utc=True).dt.tz_convert(TZ_BRT)
ff = ff.set_index("ts").drop(columns=["timestamp"]).sort_index()

df = nq.join(ff, how="inner")
ts_ny = df.index.tz_convert(TZ_NY)
df["ny_date"] = ts_ny.date
df["ny_hour"] = ts_ny.hour
df["ny_min"]  = ts_ny.minute
df["ny_hm"]   = ts_ny.hour * 60 + ts_ny.minute
df["cash_open_real"] = (ts_ny.dayofweek < 5) & (df["ny_hm"] >= 9*60 + 30) & (df["ny_hm"] < 16*60)

df["tech_compra"] = (
    df["nvidia_compra"]*35 + df["microsoft_compra"]*20 + df["apple_compra"]*15 +
    df["amazon_compra"]*10 + df["alphabet_compra"]*10 + df["meta_compra"]*5 + df["tesla_compra"]*5
) / 100.0
df["vix_inv"] = 100.0 - df["vix_compra"]
df["usd_inv"] = 100.0 - df["usdindex_compra"]
f_on  = (df["nasdaq_compra"]*35 + df["vix_inv"]*20 + df["sp500_compra"]*15 + df["usd_inv"]*10 + df["tech_compra"]*20) / 100.0
f_off = (df["nasdaq_compra"]*60 + df["vix_inv"]*25 + df["sp500_compra"]*15) / 100.0
df["forca_real"] = np.floor(np.where(df["cash_open_real"], f_on, f_off) + 0.5)
df["forca_5ativos"] = np.floor(f_on + 0.5)
df["spread_tech_nq"] = df["tech_compra"] - df["nasdaq_compra"]
df["vol_ma20"] = df["volume"].rolling(20, min_periods=5).mean()
df["vol_ratio"] = df["volume"] / df["vol_ma20"]

def sim_bracket(bars, entry_price, direction, sl_pts, tp_pts):
    """Simula ordem bracket (SL e TP em pontos) vela a vela M1.
    direction: +1 (compra) ou -1 (venda). Retorna (pnl_pts, outcome, minutes_held).
    """
    for i, (ts, b) in enumerate(bars.iterrows(), start=1):
        if direction == 1:
            hit_sl = (b["low"] - entry_price) <= -sl_pts
            hit_tp = (b["high"] - entry_price) >= tp_pts
        else:
            hit_sl = (entry_price - b["high"]) <= -sl_pts
            hit_tp = (entry_price - b["low"]) >= tp_pts
        if hit_sl and hit_tp:
            # Conservador: se ambos na mesma barra M1, olha se a barra fechou a favor ou contra, ou assume SL
            return -sl_pts, "SL", i
        if hit_sl:
            return -sl_pts, "SL", i
        if hit_tp:
            return tp_pts, "TP", i
    # Saida por tempo no fechamento da ultima barra da janela
    last_c = bars.iloc[-1]["close"]
    pnl = (last_c - entry_price) * direction
    return pnl, "TIME", len(bars)

# ==============================================================================
# CONSTRUIR TABELA DIARIA DOS 68 PREGOES (T0 = 09:30:00 ET)
# ==============================================================================
days_data = []
or_breakout_events = []

for d_ny, g_day in df.groupby("ny_date"):
    if pd.Timestamp(d_ny).dayofweek >= 5:
        continue
    t_open = g_day[(g_day["ny_hour"] == 9) & (g_day["ny_min"] == 30)]
    if t_open.empty:
        continue
    t0 = t_open.index[0]
    if (t0 - pd.Timedelta(minutes=120)) not in df.index or (t0 + pd.Timedelta(minutes=120)) not in df.index:
        continue

    # Janelas ANTES de T0 (estritamente conhecidas ate T0 - 1 segundo, i.e., ate o fechamento da barra 09:29 ET)
    t_m1 = t0 - pd.Timedelta(minutes=1) # 09:29 ET (ultimo minuto fechado antes do sino!)
    w_m120_m60 = df.loc[t0 - pd.Timedelta(minutes=120) : t0 - pd.Timedelta(minutes=60)]
    w_m60_m15  = df.loc[t0 - pd.Timedelta(minutes=60)  : t0 - pd.Timedelta(minutes=15)]
    w_m15_m1   = df.loc[t0 - pd.Timedelta(minutes=15)  : t_m1]
    w_m5_m1    = df.loc[t0 - pd.Timedelta(minutes=5)   : t_m1]

    t_asia = t0 - pd.Timedelta(hours=15, minutes=30) # 18:00 ET (19h/20h BRT)
    t_lon  = t0 - pd.Timedelta(hours=6, minutes=30)  # 03:00 ET (04h/05h BRT)
    f_asia = df.loc[t_asia:t_asia+pd.Timedelta(minutes=30), "forca_real"].mean() if t_asia in df.index else 50.0
    f_lon  = df.loc[t_lon:t_lon+pd.Timedelta(minutes=30), "forca_real"].mean() if t_lon in df.index else 50.0

    # Preco de entrada no 1o segundo da abertura = OPEN da barra de 09:30 ET
    p0 = df.loc[t0, "open"]
    # Retorno pre-market da ultima hora (08:30 ET -> 09:30 ET)
    p_m60 = df.loc[t0 - pd.Timedelta(minutes=60), "open"]
    p_m15 = df.loc[t0 - pd.Timedelta(minutes=15), "open"]
    ret_pre_60m = p0 - p_m60
    ret_pre_15m = p0 - p_m15

    # Barras a partir de T0
    b_1m  = df.loc[t0 : t0]
    b_5m  = df.loc[t0 : t0 + pd.Timedelta(minutes=4)]
    b_15m = df.loc[t0 : t0 + pd.Timedelta(minutes=14)]
    b_30m = df.loc[t0 : t0 + pd.Timedelta(minutes=29)]
    b_60m = df.loc[t0 : t0 + pd.Timedelta(minutes=59)]

    # Excursoes maximas desde p0 nos primeiros 5m, 15m, 30m, 60m
    up_15m = b_15m["high"].max() - p0
    dn_15m = p0 - b_15m["low"].min()
    up_60m = b_60m["high"].max() - p0
    dn_60m = p0 - b_60m["low"].min()

    # Opening Range de 15 minutos (OR15: 09:30 a 09:44:59 ET)
    orh = b_15m["high"].max()
    orl = b_15m["low"].min()
    or_rng = orh - orl
    or_mid = (orh + orl) / 2.0
    or_close = b_15m.iloc[-1]["close"]
    or_pos = (or_close - orl) / or_rng if or_rng > 0 else 0.5 # 0 = fechou na minima, 1 = fechou na maxima

    # Janela pos-OR15 (09:45 ET ate 12:30 ET = 165 minutos apos OR15)
    b_post_or = df.loc[t0 + pd.Timedelta(minutes=15) : t0 + pd.Timedelta(minutes=180)]

    days_data.append({
        "date": d_ny,
        "t0": t0,
        "p0": p0,
        "f_asia": f_asia,
        "f_lon": f_lon,
        "f_T120_60": w_m120_m60["forca_real"].mean(),
        "f_T60_15":  w_m60_m15["forca_real"].mean(),
        "f_T15_1":   w_m15_m1["forca_real"].mean(),
        "f_T5_1":    w_m5_m1["forca_real"].mean(),
        "f_m1":      df.loc[t_m1, "forca_real"],
        "f5_m1":     df.loc[t_m1, "forca_5ativos"],
        "nq_m1":     df.loc[t_m1, "nasdaq_compra"],
        "sp_m1":     df.loc[t_m1, "sp500_compra"],
        "vix_m1":    df.loc[t_m1, "vix_compra"],
        "usd_m1":    df.loc[t_m1, "usdindex_compra"],
        "tech_m1":   df.loc[t_m1, "tech_compra"],
        "tech_T15_1": w_m15_m1["tech_compra"].mean(),
        "vix_T15_1":  w_m15_m1["vix_compra"].mean(),
        "delta_pre":  w_m15_m1["forca_real"].mean() - w_m120_m60["forca_real"].mean(),
        "delta_last15": df.loc[t_m1, "forca_real"] - df.loc[t0 - pd.Timedelta(minutes=15), "forca_real"],
        "ret_pre_60m": ret_pre_60m,
        "ret_pre_15m": ret_pre_15m,
        "ret_1m":  b_1m.iloc[-1]["close"] - p0,
        "ret_5m":  b_5m.iloc[-1]["close"] - p0,
        "ret_15m": b_15m.iloc[-1]["close"] - p0,
        "ret_30m": b_30m.iloc[-1]["close"] - p0,
        "ret_60m": b_60m.iloc[-1]["close"] - p0,
        "up_15m": up_15m, "dn_15m": dn_15m,
        "up_60m": up_60m, "dn_60m": dn_60m,
        "orh": orh, "orl": orl, "or_rng": or_rng, "or_mid": or_mid, "or_pos": or_pos,
        "f_or15_end": b_15m.iloc[-1]["forca_real"],
        "tech_or15_end": b_15m.iloc[-1]["tech_compra"],
        "vix_or15_end": b_15m.iloc[-1]["vix_compra"],
        "b_60m": b_60m,
        "b_post_or": b_post_or,
    })

    # Analisar o 1o teste/rompimento de ORH e ORL apos 09:45 ET (T+15m)
    # Procuramos a primeira barra M1 em b_post_or que toca/rompe ORH (high >= orh) ou ORL (low <= orl)
    hit_h = b_post_or[b_post_or["high"] >= orh]
    hit_l = b_post_or[b_post_or["low"]  <= orl]
    first_h_ts = hit_h.index[0] if not hit_h.empty else None
    first_l_ts = hit_l.index[0] if not hit_l.empty else None

    for side, ts_hit, level in [("ORH", first_h_ts, orh), ("ORL", first_l_ts, orl)]:
        if ts_hit is None:
            continue
        # Janela de 30 e 60 minutos APOS o toque no nivel ORH/ORL
        after_bars = df.loc[ts_hit + pd.Timedelta(minutes=1) : ts_hit + pd.Timedelta(minutes=60)]
        if len(after_bars) < 15:
            continue
        row_hit = df.loc[ts_hit]
        row_prev = df.loc[ts_hit - pd.Timedelta(minutes=1)] if (ts_hit - pd.Timedelta(minutes=1)) in df.index else row_hit
        dir_brk = 1 if side == "ORH" else -1

        # Excursao a favor do rompimento (continuidade) vs contra (reversao/fade) nos 15m e 30m seguintes
        w15 = after_bars.iloc[:15]
        w30 = after_bars.iloc[:30]
        if side == "ORH":
            mfe_brk_15 = w15["high"].max() - level
            mae_brk_15 = level - w15["low"].min()
            ret_brk_5  = after_bars.iloc[min(4, len(after_bars)-1)]["close"] - level
            ret_brk_15 = w15.iloc[-1]["close"] - level
            ret_brk_30 = w30.iloc[-1]["close"] - level
            # Fechou a barra do rompimento acima da ORH (corpo fora) ou deixou pavio (rejeicao imediata)?
            closed_outside = row_hit["close"] > level
        else:
            mfe_brk_15 = level - w15["low"].min()
            mae_brk_15 = w15["high"].max() - level
            ret_brk_5  = level - after_bars.iloc[min(4, len(after_bars)-1)]["close"]
            ret_brk_15 = level - w15.iloc[-1]["close"]
            ret_brk_30 = level - w30.iloc[-1]["close"]
            closed_outside = row_hit["close"] < level

        # Simular Bracket de Breakout (+50 TP / -35 SL) e de Fade/Reversao (+50 TP / -35 SL)
        pnl_brk, out_brk, _   = sim_bracket(w30, level, dir_brk, sl_pts=40, tp_pts=60)
        pnl_fade, out_fade, _ = sim_bracket(w30, level, -dir_brk, sl_pts=40, tp_pts=60)

        # Verificar se houve Pullback apos rompimento confirmado (fechou fora, recuou ate perto do nivel nos primeiros 10m sem perder o meio do OR, e continuou)
        or_breakout_events.append({
            "date": d_ny,
            "side": side,
            "mins_after_or": int((ts_hit - (t0 + pd.Timedelta(minutes=15))).total_seconds() // 60),
            "is_first_side": (first_l_ts is None or ts_hit <= first_l_ts) if side == "ORH" else (first_h_ts is None or ts_hit <= first_h_ts),
            "or_rng": or_rng,
            "closed_outside": closed_outside,
            "forca_hit": row_hit["forca_real"],
            "forca_prev": row_prev["forca_real"],
            "tech_hit": row_hit["tech_compra"],
            "nq_hit": row_hit["nasdaq_compra"],
            "sp_hit": row_hit["sp500_compra"],
            "vix_hit": row_hit["vix_compra"],
            "usd_hit": row_hit["usdindex_compra"],
            "spread_tech_nq": row_hit["spread_tech_nq"],
            "vol_ratio": row_hit["vol_ratio"],
            "mfe_brk_15": mfe_brk_15,
            "mae_brk_15": mae_brk_15,
            "ret_brk_5": ret_brk_5,
            "ret_brk_15": ret_brk_15,
            "ret_brk_30": ret_brk_30,
            "pnl_brk_60_40": pnl_brk,
            "pnl_fade_60_40": pnl_fade,
        })

ddf = pd.DataFrame(days_data)
ordf = pd.DataFrame(or_breakout_events)

print("=====================================================================")
print("PARTE 2: VALIDACAO DE ENTRADA NO 1o SEGUNDO DA ABERTURA (T0 = 09:30:00 ET)")
print("=====================================================================")
# Toda decisao usa EXCLUSIVAMENTE dados ate T-1m (09:29:00 ET) e entra em p0 = OPEN de 09:30:00 ET
def test_t0_rule(name, cond_buy, cond_sell):
    sub_b = ddf[cond_buy].copy(); sub_b["dir"] = 1
    sub_s = ddf[cond_sell].copy(); sub_s["dir"] = -1
    sub = pd.concat([sub_b, sub_s]).sort_values("date")
    if sub.empty:
        print(f"{name}: 0 trades")
        return
    r1  = sub["ret_1m"]  * sub["dir"]
    r5  = sub["ret_5m"]  * sub["dir"]
    r15 = sub["ret_15m"] * sub["dir"]
    r30 = sub["ret_30m"] * sub["dir"]
    r60 = sub["ret_60m"] * sub["dir"]
    mfe15 = np.where(sub["dir"] == 1, sub["up_15m"], sub["dn_15m"])
    mae15 = np.where(sub["dir"] == 1, sub["dn_15m"], sub["up_15m"])
    mfe60 = np.where(sub["dir"] == 1, sub["up_60m"], sub["dn_60m"])
    mae60 = np.where(sub["dir"] == 1, sub["dn_60m"], sub["up_60m"])

    # Simular Bracket (SL 50 / TP 80 e SL 60 / TP 100 em 60m)
    b1 = [sim_bracket(r["b_60m"], r["p0"], r["dir"], 50, 80)[0] for _, r in sub.iterrows()]
    b2 = [sim_bracket(r["b_60m"], r["p0"], r["dir"], 60, 100)[0] for _, r in sub.iterrows()]
    b1 = pd.Series(b1); b2 = pd.Series(b2)

    # In-sample (primeiros 47 pregoes) vs Out-of-sample (ultimos 21 pregoes)
    cut_d = ddf["date"].iloc[47]
    is_r60  = r60[sub["date"] < cut_d]
    oos_r60 = r60[sub["date"] >= cut_d]

    print(f"\n>>> {name} (n={len(sub)} dias | C:{len(sub_b)} V:{len(sub_s)}):")
    print(f"  Retornos por tempo: 1m={r1.mean():+5.1f} ({(r1>0).mean()*100:4.1f}%) | 5m={r5.mean():+5.1f} ({(r5>0).mean()*100:4.1f}%) | 15m={r15.mean():+5.1f} ({(r15>0).mean()*100:4.1f}%) | 30m={r30.mean():+5.1f} ({(r30>0).mean()*100:4.1f}%) | 60m={r60.mean():+6.1f} ({(r60>0).mean()*100:4.1f}%)")
    print(f"  Excursao 15m: MFE medio={mfe15.mean():5.1f} pts (med {np.median(mfe15):5.1f}) | MAE medio (calor)={mae15.mean():5.1f} pts (med {np.median(mae15):5.1f})")
    print(f"  Excursao 60m: MFE medio={mfe60.mean():5.1f} pts (med {np.median(mfe60):5.1f}) | MAE medio (calor)={mae60.mean():5.1f} pts (med {np.median(mae60):5.1f})")
    print(f"  Bracket 60m : [TP 80 / SL 50] media={b1.mean():+5.1f} pts (win {(b1>0).mean()*100:4.1f}%) | [TP 100 / SL 60] media={b2.mean():+5.1f} pts (win {(b2>0).mean()*100:4.1f}%)")
    print(f"  Consistencia: In-Sample (n={len(is_r60)}): {is_r60.mean():+5.1f} pts ({(is_r60>0).mean()*100:4.1f}% win) | Out-of-Sample (n={len(oos_r60)}): {oos_r60.mean():+5.1f} pts ({(oos_r60>0).mean()*100:4.1f}% win)")

# Testar diferentes setups de T0 (1o segundo da abertura)
test_t0_rule(
    "Setup T0-A: Alinhamento Asia + Pre-Open T-15m (f_asia>=52 & f_T15_1>=52 vs <=48)",
    (ddf["f_asia"] >= 52) & (ddf["f_T15_1"] >= 52),
    (ddf["f_asia"] <= 48) & (ddf["f_T15_1"] <= 48),
)
test_t0_rule(
    "Setup T0-B: Aceleracao Pre-Abertura (delta_pre = f_T15_1 - f_T120_60 >= +5 vs <= -5)",
    ddf["delta_pre"] >= 5,
    ddf["delta_pre"] <= -5,
)
test_t0_rule(
    "Setup T0-C: Combo Forte T0 (Delta_Pre >= +4 & f_T15_1 >= 50 & VIX_T15 <= 50 vs inverso)",
    (ddf["delta_pre"] >= 4) & (ddf["f_T15_1"] >= 50) & (ddf["vix_T15_1"] <= 50),
    (ddf["delta_pre"] <= -4) & (ddf["f_T15_1"] <= 50) & (ddf["vix_T15_1"] >= 50),
)
test_t0_rule(
    "Setup T0-D: Exaustao Pre-Market nos primeiros 5m (Preco subiu >40 pts na ultima hora mas Forca T-1m < 50 -> Vende T0 p/ 5m)",
    (ddf["ret_pre_60m"] <= -40) & (ddf["f_m1"] >= 48),
    (ddf["ret_pre_60m"] >= 40) & (ddf["f_m1"] <= 52),
)

print("\n=====================================================================")
print("PARTE 3: ANALISE DE PULLBACK vs BREAKOUT NAS MAXIMAS/MINIMAS DOS PRIMEIROS 15 MIN (OR15)")
print("=====================================================================")
print(f"Total de toques/rompimentos da ORH_15 e ORL_15 analisados nos 68 pregoes: {len(ordf)} eventos ({len(ordf[ordf['side']=='ORH'])} na Maxima ORH, {len(ordf[ordf['side']=='ORL'])} na Minima ORL)")
# Quantos dias rompem apenas 1 lado vs ambos os lados (whipsaw)?
both_hit = ordf.groupby("date")["side"].nunique()
print(f"Dias que tocaram apenas 1 extremidade ate 12:30 ET: {(both_hit == 1).sum()} dias | Dias que tocaram AMBAS (Maxima e Minima): {(both_hit == 2).sum()} dias ({(both_hit == 2).mean()*100:.1f}%)")

# Condicao de Forca alinhada a favor do Rompimento no instante do toque:
# Para ORH (compra): forca_hit >= 60 e tech_hit >= 55 e vix_hit <= 45
# Para ORL (venda) : forca_hit <= 40 e tech_hit <= 45 e vix_hit >= 55
ordf["forca_favor"] = np.where(ordf["side"] == "ORH", ordf["forca_hit"], 100 - ordf["forca_hit"])
ordf["tech_favor"]  = np.where(ordf["side"] == "ORH", ordf["tech_hit"],  100 - ordf["tech_hit"])
ordf["vix_favor"]   = np.where(ordf["side"] == "ORH", 100 - ordf["vix_hit"], ordf["vix_hit"])
ordf["spread_favor"] = np.where(ordf["side"] == "ORH", ordf["spread_tech_nq"], -ordf["spread_tech_nq"])

print("\n--- 3.1 Resultado Geral: Operar TODOS os toques em ORH/ORL sem filtro ---")
for s_lbl, sub_or in [("TODOS OS TOQUES (ORH + ORL)", ordf), ("APENAS 1o TOQUE DO DIA", ordf[ordf["is_first_side"]])]:
    print(f"* {s_lbl} (n={len(sub_or)}):")
    print(f"  Retorno médio a favor do rompimento: 5m={sub_or['ret_brk_5'].mean():+5.2f} | 15m={sub_or['ret_brk_15'].mean():+5.2f} (win {(sub_or['ret_brk_15']>0).mean()*100:.1f}%) | 30m={sub_or['ret_brk_30'].mean():+5.2f} (win {(sub_or['ret_brk_30']>0).mean()*100:.1f}%)")
    print(f"  MFE 15m (avanco medio alem da OR)={sub_or['mfe_brk_15'].mean():.1f} pts | MAE 15m (retorno p/ dentro da OR)={sub_or['mae_brk_15'].mean():.1f} pts")
    print(f"  Bracket [TP 60 / SL 40]: BREAKOUT media={sub_or['pnl_brk_60_40'].mean():+5.2f} pts (win {(sub_or['pnl_brk_60_40']>0).mean()*100:.1f}%) | FADE (Reversao) media={sub_or['pnl_fade_60_40'].mean():+5.2f} pts (win {(sub_or['pnl_fade_60_40']>0).mean()*100:.1f}%)")

print("\n--- 3.2 Como separar BREAKOUT VERDADEIRO de FALSO ROMPIMENTO (REVERSAO/PULLBACK INTERNO) ---")
# Cenario 1: Forca Favoravel Forte + Fechou Fora da OR + Techs confirmando
brk_strong = ordf[(ordf["closed_outside"]) & (ordf["forca_favor"] >= 58) & (ordf["tech_favor"] >= 52) & (ordf["or_rng"] <= 180)]
# Cenario 2: Exaustao / Divergencia Contra o Rompimento (Toque na ORH/ORL mas Techs divergem contra ou Forca fraca < 52 ou Range OR15 ja esticado > 160 pts)
fade_div   = ordf[(~ordf["closed_outside"]) | (ordf["spread_favor"] <= -8) | (ordf["forca_favor"] < 50)]
fade_strict = ordf[(~ordf["closed_outside"]) & ((ordf["spread_favor"] <= -5) | (ordf["forca_favor"] <= 52))]

for lbl, sub_c in [
    ("CENARIO A - BREAKOUT CONFIRMADO (Fecha fora + Forca_Favor>=58 + Tech_Favor>=52 + OR<=180pts)", brk_strong),
    ("CENARIO B - FALSO ROMPIMENTO / REJEICAO (Nao fecha fora E [Tech diverge <=-5 OU Forca<=52])", fade_strict),
    ("CENARIO C - OR15 JA ESTICADO (> 180 pts de range nos primeiros 15m)", ordf[ordf["or_rng"] > 180]),
    ("CENARIO D - OR15 ESTREITO (< 120 pts de range nos primeiros 15m) + Fecha Fora", ordf[(ordf["or_rng"] < 120) & (ordf["closed_outside"])]),
]:
    if len(sub_c) == 0: continue
    print(f"\n* {lbl} (n={len(sub_c)}):")
    print(f"  Retorno no sentido do Rompimento: 5m={sub_c['ret_brk_5'].mean():+5.2f} | 15m={sub_c['ret_brk_15'].mean():+5.2f} (win Brk {(sub_c['ret_brk_15']>0).mean()*100:.1f}%) | 30m={sub_c['ret_brk_30'].mean():+5.2f}")
    print(f"  Bracket [TP 60 / SL 40]: BREAKOUT={sub_c['pnl_brk_60_40'].mean():+5.2f} pts (win {(sub_c['pnl_brk_60_40']>0).mean()*100:.1f}%) | FADE (Contra)={sub_c['pnl_fade_60_40'].mean():+5.2f} pts (win {(sub_c['pnl_fade_60_40']>0).mean()*100:.1f}%)")

# 3.3 Analise especifica: Entrar no ROMPIMENTO DIRETO vs Esperar PULLBACK ao nivel ORH/ORL apos fechar fora!
print("\n--- 3.3 BREAKOUT DIRETO vs ESPERAR PULLBACK AO NIVEL (ORH/ORL) APOS ROMPIMENTO ---")
pb_results = []
for _, r_day in ddf.iterrows():
    b_post = r_day["b_post_or"]
    orh, orl = r_day["orh"], r_day["orl"]
    for side, lvl, d_sign in [("ORH", orh, 1), ("ORL", orl, -1)]:
        # Achar 1a barra que FECHA fora do nivel com Forca a favor >= 55
        if side == "ORH":
            cond_brk = (b_post["close"] > lvl) & (b_post["forca_real"] >= 55)
        else:
            cond_brk = (b_post["close"] < lvl) & (b_post["forca_real"] <= 45)
        if not cond_brk.any():
            continue
        t_brk = b_post[cond_brk].index[0]
        p_brk_close = b_post.loc[t_brk, "close"]
        # Janela de 30m apos t_brk
        w_after = df.loc[t_brk + pd.Timedelta(minutes=1) : t_brk + pd.Timedelta(minutes=45)]
        if len(w_after) < 15:
            continue
        pnl_direct, _, _ = sim_bracket(w_after, p_brk_close, d_sign, sl_pts=45, tp_pts=65)
        # Verifica se nos 15m seguintes ao rompimento o preco faz pullback ate o nivel (lvl +/- 5 pts) mantendo forca >= 50 (ou <= 50)
        w_pb_search = w_after.iloc[:15]
        if side == "ORH":
            cond_pb = (w_pb_search["low"] <= lvl + 5.0) & (w_pb_search["close"] >= lvl - 10.0) & (w_pb_search["forca_real"] >= 50)
        else:
            cond_pb = (w_pb_search["high"] >= lvl - 5.0) & (w_pb_search["close"] <= lvl + 10.0) & (w_pb_search["forca_real"] <= 50)
        has_pb = cond_pb.any()
        pnl_pb = np.nan
        if has_pb:
            t_pb = w_pb_search[cond_pb].index[0]
            w_after_pb = df.loc[t_pb + pd.Timedelta(minutes=1) : t_pb + pd.Timedelta(minutes=45)]
            if len(w_after_pb) >= 5:
                pnl_pb, _, _ = sim_bracket(w_after_pb, lvl, d_sign, sl_pts=45, tp_pts=65)
        pb_results.append({"side": side, "pnl_direct": pnl_direct, "has_pb": has_pb, "pnl_pb": pnl_pb})

pb_df = pd.DataFrame(pb_results)
print(f"Rompimentos confirmados (fechou fora c/ Forca>=55/<=45): n={len(pb_df)}")
print(f"  - Entrar DIRETO no fechamento da barra que rompeu [TP 65 / SL 45]: media={pb_df['pnl_direct'].mean():+5.2f} pts | win={(pb_df['pnl_direct']>0).mean()*100:.1f}%")
pb_only = pb_df[pb_df["has_pb"]].dropna(subset=["pnl_pb"])
print(f"  - Ocorreram Pullbacks de reteste ao nivel ORH/ORL mantendo forca (>=50/<=50) em {len(pb_only)}/{len(pb_df)} casos ({len(pb_only)/len(pb_df)*100:.1f}%):")
print(f"  - Entrar no PULLBACK de reteste ao nivel ORH/ORL [TP 65 / SL 45]: media={pb_only['pnl_pb'].mean():+5.2f} pts | win={(pb_only['pnl_pb']>0).mean()*100:.1f}%")

print("\n=====================================================================")
print("PARTE 4: CALIBRACAO FINA DE ALVOS/STOPS (T0 E MATRIZ DECISORIA OR15)")
print("=====================================================================")
sub_a_b = ddf[(ddf["f_asia"] >= 52) & (ddf["f_T15_1"] >= 52)].copy(); sub_a_b["dir"] = 1
sub_a_s = ddf[(ddf["f_asia"] <= 48) & (ddf["f_T15_1"] <= 48)].copy(); sub_a_s["dir"] = -1
sub_a = pd.concat([sub_a_b, sub_a_s]).sort_values("date")

for horizon_m, sl, tp, desc in [
    (5,  35, 35, "Scalp Rapido 5m  [TP 35 / SL 35]"),
    (5,  45, 45, "Scalp Rapido 5m  [TP 45 / SL 45]"),
    (15, 65, 80, "Tatico 15m       [TP 80 / SL 65]"),
    (60, 85, 130,"Tendencia 60m    [TP 130 / SL 85]"),
    (60, 95, 150,"Tendencia 60m    [TP 150 / SL 95]"),
]:
    res = [sim_bracket(r["b_60m"].iloc[:horizon_m], r["p0"], r["dir"], sl, tp)[0] for _, r in sub_a.iterrows()]
    s = pd.Series(res)
    print(f"  {desc}: media={s.mean():+6.1f} pts | win={(s>0).mean()*100:5.1f}% | soma={s.sum():+7.1f} pts")

sub_a2 = sub_a[((sub_a["dir"]==1) & (sub_a["delta_pre"]>=0)) | ((sub_a["dir"]==-1) & (sub_a["delta_pre"]<=0))]
r1 = sub_a2["ret_1m"]*sub_a2["dir"]; r5 = sub_a2["ret_5m"]*sub_a2["dir"]; r60 = sub_a2["ret_60m"]*sub_a2["dir"]
print(f"  Filtro T0-A + Delta_Pre a favor (n={len(sub_a2)} dias): 1m={r1.mean():+5.1f} ({(r1>0).mean()*100:.1f}% win) | 5m={r5.mean():+5.1f} ({(r5>0).mean()*100:.1f}% win) | 60m={r60.mean():+6.1f} ({(r60>0).mean()*100:.1f}% win)")

print("\n--- MATRIZ DECISORIA OR15 (MAXIMA/MINIMA DOS PRIMEIROS 15 MIN) ---")
for name, cond in [
    ("1. OR15 Comprimido (<120 pts) + Vela Fecha Fora -> OPERAR BREAKOUT", (ordf["or_rng"] < 120) & (ordf["closed_outside"])),
    ("2. OR15 Normal (120-180 pts) + 1o Toque -> OPERAR REVERSAO INTERNA (PULLBACK P/ MEIO DO RANGE)", (ordf["or_rng"] >= 120) & (ordf["or_rng"] <= 180) & (ordf["is_first_side"])),
    ("3. OR15 Normal (120-180 pts) + Rejeicao (Pavio/Forca<55) -> OPERAR REVERSAO (FADE)", (ordf["or_rng"] >= 120) & (ordf["or_rng"] <= 180) & ((~ordf["closed_outside"]) | (ordf["forca_favor"] < 55))),
    ("4. OR15 Explosivo (>180 pts) + Forca_Favor >= 52 -> OPERAR BREAKOUT / CONTINUIDADE", (ordf["or_rng"] > 180) & (ordf["forca_favor"] >= 52)),
]:
    sub = ordf[cond]
    b_m = sub["pnl_brk_60_40"].mean(); b_w = (sub["pnl_brk_60_40"] > 0).mean()*100
    f_m = sub["pnl_fade_60_40"].mean(); f_w = (sub["pnl_fade_60_40"] > 0).mean()*100
    print(f"* {name} (n={len(sub)}):")
    print(f"   Breakout [TP 60 / SL 40]: media={b_m:+6.2f} pts (win {b_w:4.1f}%) | Reversao/Fade [TP 60 / SL 40]: media={f_m:+6.2f} pts (win {f_w:4.1f}%)")
