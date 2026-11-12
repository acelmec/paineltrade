"""Estudo Completo de 365 Dias para o ES (S&P 500 Futuro - Databento CME GLBX.MDP3)
Casando as forcas de nasdaq_force_365d_BRT.csv com ES_1m_BRT.csv:
1. Estatisticas descritivas e correlacoes contemporaneas e preditivas do ES
2. Consistencia intradiaria ao longo dos pregoes
3. Comportamento nas zonas extremas de forca e divergencia
4. Estrategias na Abertura (T0 = 09:30:00 ET e T+5m = 09:35:00 ET)
5. Matriz Decisoria da OR15 no ES com gestao de 50% (OR_Mid) e 25% (50% da Metade)
"""
import os, sys, numpy as np, pandas as pd
sys.path.insert(0, "scripts")
from forces import load_csv

TZ_BRT = "America/Sao_Paulo"
TZ_NY  = "America/New_York"
BASE = os.path.join("data", "databento")

start_365 = pd.Timestamp("2025-11-11 00:00:00", tz=TZ_BRT)
end_365   = pd.Timestamp("2026-11-10 23:59:00", tz=TZ_BRT)

print("Carregando ES de 1 ano...", flush=True)
es_full = load_csv(os.path.join(BASE, "ES_1m_BRT.csv"))
force_df = pd.read_csv(os.path.join(BASE, "nasdaq_force_365d_BRT.csv"), parse_dates=["timestamp"], index_col="timestamp")
if force_df.index.tz is None:
    force_df.index = force_df.index.tz_localize(TZ_BRT)
else:
    force_df.index = force_df.index.tz_convert(TZ_BRT)

# Alinhamento pelo timestamp do ES na janela de 365 dias
es_sub = es_full.loc[(es_full.index >= start_365) & (es_full.index <= end_365)].copy()
df = es_sub.join(force_df, how="inner")
print(f"Total de minutos casados ES + Forca: {len(df):,} minutos ({df.index.min()} ate {df.index.max()})", flush=True)

df["ny_time"] = df.index.tz_convert(TZ_NY)
df["ny_date"] = df["ny_time"].dt.date
df["ny_hm"]   = df["ny_time"].dt.strftime("%H:%M")

# Indicadores de forca
df["forca_real"]   = df["forca_final_compra"]
df["sp500_compra"] = df["sp500_compra"]
df["nasdaq_compra"] = df["nasdaq_compra"]
df["vix_inv"]      = 100.0 - df["vix_compra"]
tech_cols = ["nvidia_compra", "microsoft_compra", "apple_compra", "meta_compra", "amazon_compra", "alphabet_compra", "tesla_compra"]
df["tech_compra"]  = df[tech_cols].mean(axis=1)

# Retornos em pontos do ES (1 pt = 4 ticks no ES)
df["ret_0"]   = df["close"] - df["open"]
df["range_0"] = df["high"]  - df["low"]
for h in [1, 2, 5, 15, 30, 60]:
    s_fut = df["close"].reindex(df.index + pd.Timedelta(minutes=h))
    s_fut.index = df.index
    df[f"ret_fwd_{h}m"] = s_fut - df["close"]

# Sessao Cash NY: 09:30 ate 16:00 ET
cash = df[(df["ny_hm"] >= "09:30") & (df["ny_hm"] <= "16:00")].copy()
pre  = df[(df["ny_hm"] >= "04:00") & (df["ny_hm"] < "09:30")].copy()
post = df[(df["ny_hm"] > "16:00") | (df["ny_hm"] < "04:00")].copy()

print("\n=====================================================================")
print(f"1. ESTATISTICAS DESCRITIVAS DO ES ({cash['ny_date'].nunique()} PREGOES CASH NY)")
print("=====================================================================")
print(f"Total de minutos Cash NY: {len(cash):,}")
print(f"Range medio da vela M1: 24h = {df['range_0'].mean():.2f} pts | Cash NY = {cash['range_0'].mean():.2f} pts | Fora = {post['range_0'].mean():.2f} pts")

cols_f = [
    ("forca_real",       "Forca Final (35% NQ, 15% ES, 35% Tech, 15% VIX)"),
    ("sp500_compra",     "S&P 500 Futuro (ES)"),
    ("nasdaq_compra",    "Nasdaq Futuro (NQ)"),
    ("tech_compra",      "Media 7 Techs"),
    ("vix_inv",          "VIX Invertido"),
    ("usdindex_compra",  "Dolar Index (DXY)"),
]
targets = ["ret_0", "ret_fwd_1m", "ret_fwd_2m", "ret_fwd_5m", "ret_fwd_15m", "ret_fwd_30m", "ret_fwd_60m"]
rows_corr = []
for c, label in cols_f:
    r = {"Ativo": label}
    for t in targets:
        r[t] = cash[c].corr(cash[t])
    rows_corr.append(r)
print("\n--- Correlacao Contemporanea e Preditiva com Retorno Futuro do ES (Cash NY) ---")
print(pd.DataFrame(rows_corr).set_index("Ativo").round(3).to_string())

# Consistencia diaria
daily_lvl = cash.groupby("ny_date").apply(
    lambda g: pd.Series({
        "corr_ff_ret0":    g["forca_real"].corr(g["ret_0"]),
        "corr_es_ret0":    g["sp500_compra"].corr(g["ret_0"]),
        "corr_ff_close":   g["forca_real"].corr(g["close"]),
        "corr_es_close":   g["sp500_compra"].corr(g["close"]),
        "corr_tech_close": g["tech_compra"].corr(g["close"]),
    })
)
print("\n--- Consistencia Intradiaria ao longo dos ~254 pregoes do ES ---")
for k in daily_lvl.columns:
    s = daily_lvl[k].dropna()
    print(f"{k:18s}: media={s.mean():+.3f} | mediana={s.median():+.3f} | % dias r>0 = {(s>0).mean()*100:.1f}% ({int((s>0).sum())}/{len(s)})")

# Zonas extremas de forca no ES
bins = [0, 40, 45, 50, 55, 60, 100]
labels_b = ["<40 (Venda Forte)", "40-45 (Venda)", "45-50 (Neutro Baixo)", "50-55 (Neutro Alto)", "55-60 (Compra)", ">=60 (Compra Forte)"]
cash["faixa"] = pd.cut(cash["forca_real"], bins=bins, labels=labels_b, right=False)
g = cash.groupby("faixa", observed=False).agg(
    minutos=("ret_0", "count"),
    ret_vela_0m=("ret_0", "mean"),
    fwd_1m=("ret_fwd_1m", "mean"),
    fwd_5m=("ret_fwd_5m", "mean"),
    fwd_15m=("ret_fwd_15m", "mean"),
    fwd_30m=("ret_fwd_30m", "mean"),
    fwd_60m=("ret_fwd_60m", "mean"),
)
print("\n--- Zonas de Forca Final vs Retornos em Pontos do ES ---")
print(g.round(2).to_string())

# ==============================================================================
# SIMULADORES DE BRACKET NO ES (Pontos do ES)
# ==============================================================================
def sim_pct_bracket(bars, entry_price, direction, sl_pts, tp_pts, be_trigger_pts=None):
    cur_sl = -sl_pts
    reached_be = False
    for i, (ts, b) in enumerate(bars.iterrows(), start=1):
        fav = (b["high"] - entry_price) if direction == 1 else (entry_price - b["low"])
        adv = (b["low"]  - entry_price) if direction == 1 else (entry_price - b["high"])
        if adv <= cur_sl:
            return cur_sl, ("BE" if reached_be and cur_sl == 0 else "SL"), i
        if fav >= tp_pts:
            return tp_pts, "TP", i
        if be_trigger_pts is not None and not reached_be and fav >= be_trigger_pts:
            cur_sl = 0.0; reached_be = True
    return (bars.iloc[-1]["close"] - entry_price) * direction, "TIME", len(bars)

def sim_partial_25_50(bars, entry_price, direction, sl_pts, tp1_pts, tp2_pts):
    half1_done = False; pnl_half1 = 0.0; cur_sl = -sl_pts
    for i, (ts, b) in enumerate(bars.iterrows(), start=1):
        fav = (b["high"] - entry_price) if direction == 1 else (entry_price - b["low"])
        adv = (b["low"]  - entry_price) if direction == 1 else (entry_price - b["high"])
        if adv <= cur_sl:
            return (-sl_pts, "SL_FULL") if not half1_done else (0.5*pnl_half1 + 0.5*cur_sl, "TP1_THEN_BE")
        if not half1_done and fav >= tp1_pts:
            half1_done = True; pnl_half1 = tp1_pts; cur_sl = 0.0
        if half1_done and fav >= tp2_pts:
            return 0.5*pnl_half1 + 0.5*tp2_pts, "TP1_AND_TP2"
    rem = (bars.iloc[-1]["close"] - entry_price) * direction
    return (0.5*pnl_half1 + 0.5*rem, "TP1_THEN_TIME") if half1_done else (rem, "TIME")

days_es = []
or_events_es = []

for d_ny, g_day in df.groupby("ny_date"):
    t_open = g_day[g_day["ny_hm"] == "09:30"]
    if t_open.empty:
        continue
    t0 = t_open.index[0]
    if (t0 - pd.Timedelta(minutes=120)) not in df.index or (t0 + pd.Timedelta(minutes=120)) not in df.index:
        continue

    t_m1 = t0 - pd.Timedelta(minutes=1)
    w_m15_m1   = df.loc[t0 - pd.Timedelta(minutes=15)  : t_m1]
    t_asia = t0 - pd.Timedelta(hours=15, minutes=30)
    f_asia = df.loc[t_asia:t_asia+pd.Timedelta(minutes=30), "forca_real"].mean() if t_asia in df.index else 50.0

    p0 = df.loc[t0, "open"]
    b_60m = df.loc[t0 : t0 + pd.Timedelta(minutes=60)]
    b_15m = df.loc[t0 : t0 + pd.Timedelta(minutes=14)]

    # OR15 nos primeiros 15 minutos (09:30 a 09:44)
    or_h = b_15m["high"].max()
    or_l = b_15m["low"].min()
    or_rng = or_h - or_l
    q50 = 0.50 * or_rng # Metade da amplitude = OR_Mid
    q25 = 0.25 * or_rng # 50% da metade = 1/4 da amplitude

    f_T15_1 = w_m15_m1["forca_real"].iloc[-1]
    f_T0    = df.loc[t0, "forca_real"]
    f_first5m = df.loc[t0 : t0 + pd.Timedelta(minutes=4), "forca_real"].iloc[-1]
    tech_first5m = df.loc[t0 : t0 + pd.Timedelta(minutes=4), "tech_compra"].iloc[-1]

    days_es.append({
        "date": d_ny,
        "t0": t0,
        "p0": p0,
        "or_h": or_h, "or_l": or_l, "or_rng": or_rng,
        "f_asia": f_asia, "f_T15_1": f_T15_1, "f_T0": f_T0,
        "f_first5m": f_first5m, "tech_first5m": tech_first5m,
        "ret_1m":  df.loc[t0, "close"] - p0,
        "ret_5m":  df.loc[t0 + pd.Timedelta(minutes=4),  "close"] - p0,
        "ret_15m": df.loc[t0 + pd.Timedelta(minutes=14), "close"] - p0,
        "ret_60m": df.loc[t0 + pd.Timedelta(minutes=59), "close"] - p0,
        "ret_5_60m": df.loc[t0 + pd.Timedelta(minutes=59), "close"] - df.loc[t0 + pd.Timedelta(minutes=4), "close"],
        "b_60m": b_60m,
    })

    # Analise dos toques e rompimentos da OR15 entre 09:45 e 11:30 ET
    b_post15 = df.loc[t0 + pd.Timedelta(minutes=15) : t0 + pd.Timedelta(minutes=120)]
    first_touched = False
    first_breakout = False
    for ts, b in b_post15.iterrows():
        touched_high = b["high"] >= or_h
        touched_low  = b["low"]  <= or_l
        if not (touched_high or touched_low):
            continue

        remaining = b_post15.loc[ts : t0 + pd.Timedelta(minutes=120)]
        if len(remaining) < 2:
            break

        is_first_touch = not first_touched
        first_touched = True

        for side, touched, entry_p, closed_out, f_fav in [
            ("HIGH", touched_high, or_h, b["close"] > or_h, df.loc[ts, "forca_real"]),
            ("LOW",  touched_low,  or_l, b["close"] < or_l, 100.0 - df.loc[ts, "forca_real"])
        ]:
            if not touched:
                continue

            is_first_brk = False
            if closed_out and not first_breakout:
                is_first_brk = True
                first_breakout = True

            # Reversao (Fade): se tocou na maxima vende, se tocou na minima compra
            fade_dir = -1 if side == "HIGH" else 1
            f_fade_25_25, _, _ = sim_pct_bracket(remaining, entry_p, fade_dir, q25, q25)
            f_fade_50_25, _, _ = sim_pct_bracket(remaining, entry_p, fade_dir, q25, q50)
            f_fade_50_50, _, _ = sim_pct_bracket(remaining, entry_p, fade_dir, q50, q50)
            f_fade_p_sl25, _   = sim_partial_25_50(remaining, entry_p, fade_dir, q25, q25, q50)
            f_fade_p_sl50, _   = sim_partial_25_50(remaining, entry_p, fade_dir, q50, q25, q50)

            # Breakout: se rompeu a maxima compra, se rompeu a minima vende
            brk_dir = 1 if side == "HIGH" else -1
            f_brk_25_25, _, _ = sim_pct_bracket(remaining, entry_p, brk_dir, q25, q25)
            f_brk_50_25, _, _ = sim_pct_bracket(remaining, entry_p, brk_dir, q25, q50)
            f_brk_50_50, _, _ = sim_pct_bracket(remaining, entry_p, brk_dir, q50, q50)
            f_brk_p_sl25, _   = sim_partial_25_50(remaining, entry_p, brk_dir, q25, q25, q50)
            f_brk_p_sl50, _   = sim_partial_25_50(remaining, entry_p, brk_dir, q50, q25, q50)

            or_events_es.append({
                "date": d_ny, "side": side, "is_first": is_first_touch, "is_first_brk": is_first_brk, "closed_out": closed_out,
                "or_rng": or_rng, "q25": q25, "q50": q50, "forca_fav": f_fav,
                "fade_25_25": f_fade_25_25, "fade_50_25": f_fade_50_25, "fade_50_50": f_fade_50_50,
                "fade_part_25_50_sl25": f_fade_p_sl25, "fade_part_25_50_sl50": f_fade_p_sl50,
                "brk_25_25": f_brk_25_25, "brk_50_25": f_brk_50_25, "brk_50_50": f_brk_50_50,
                "brk_part_25_50_sl25": f_brk_p_sl25, "brk_part_25_50_sl50": f_brk_p_sl50,
            })
            break # 1 evento por barra
        if first_touched and first_breakout:
            # Ja pegou o primeiro toque e o primeiro breakout do dia
            pass

d_es = pd.DataFrame(days_es)
or_es = pd.DataFrame(or_events_es)

print("\n=====================================================================")
print(f"2. ESTUDO DAS ABERTURAS CASH NY NO ES EM 365 DIAS ({len(d_es)} PREGOES)")
print("=====================================================================")
trap_es = ((d_es["ret_1m"] * (d_es["ret_15m"] - d_es["ret_1m"])) < 0).mean() * 100
print(f"Range medio OR15 ES: {d_es['or_rng'].mean():.2f} pts (mediana {d_es['or_rng'].median():.2f} pts)")
print(f"Taxa de Armadilha do 1o minuto no ES: {trap_es:.1f}% dos pregoes")

# Estrategia 1 no ES (Asia + T-15m alinhadas >= 52 / <= 48)
cb1 = (d_es["f_asia"] >= 52) & (d_es["f_T15_1"] >= 52)
cs1 = (d_es["f_asia"] <= 48) & (d_es["f_T15_1"] <= 48)
sb1 = d_es[cb1].copy(); sb1["dir"] = 1
ss1 = d_es[cs1].copy(); ss1["dir"] = -1
sub1 = pd.concat([sb1, ss1]).sort_values("date")

r1 = sub1["ret_1m"] * sub1["dir"]
r5 = sub1["ret_5m"] * sub1["dir"]
r15 = sub1["ret_15m"] * sub1["dir"]
r60 = sub1["ret_60m"] * sub1["dir"]

# Simula brackets adaptados a volatilidade do ES (1 pt ES = ~7 pts NQ)
# Ex: Scalp 5m ES [TP 7 / SL 7 pts] | Swing 60m ES [TP 22 / SL 14 pts]
sc_es = pd.Series([sim_pct_bracket(r["b_60m"].iloc[:5], r["p0"], r["dir"], 7.0, 7.0)[0] for _, r in sub1.iterrows()])
sw_es = pd.Series([sim_pct_bracket(r["b_60m"], r["p0"], r["dir"], 14.0, 22.0)[0] for _, r in sub1.iterrows()])

print(f"\n>>> Estrategia 1 ES (Asia + T-15m >=52 / <=48 -> T0) (n={len(sub1)} pregoes):")
print(f"  Retorno 1m:  media={r1.mean():+5.2f} pts | win={(r1>0).mean()*100:4.1f}%")
print(f"  Retorno 5m:  media={r5.mean():+5.2f} pts | win={(r5>0).mean()*100:4.1f}%")
print(f"  Retorno 15m: media={r15.mean():+5.2f} pts | win={(r15>0).mean()*100:4.1f}%")
print(f"  Retorno 60m: media={r60.mean():+5.2f} pts | win={(r60>0).mean()*100:4.1f}% | soma={r60.sum():+6.2f} pts")
print(f"  Scalp 5m [TP 7.0 / SL 7.0 pts]:   media={sc_es.mean():+5.2f} pts | win={(sc_es>0).mean()*100:4.1f}% | soma={sc_es.sum():+7.2f} pts")
print(f"  Swing 60m [TP 22.0 / SL 14.0 pts]: media={sw_es.mean():+5.2f} pts | win={(sw_es>0).mean()*100:4.1f}% | soma={sw_es.sum():+7.2f} pts")

# Estrategia 2B no ES (Confirmacao T+5m)
sb5 = d_es[(d_es["f_first5m"] >= 55) & (d_es["tech_first5m"] >= 52)]["ret_5_60m"]
ss5 = -d_es[(d_es["f_first5m"] <= 45) & (d_es["tech_first5m"] <= 48)]["ret_5_60m"]
c5 = pd.concat([sb5, ss5])
print(f"\n>>> Estrategia 2B ES (Confirmacao T+5m: Forca>=55 & Tech>=52 -> T+5m a T+60m): n={len(c5)} pregoes | media={c5.mean():+5.2f} pts | win={(c5>0).mean()*100:4.1f}% | soma={c5.sum():+7.2f} pts")

print("\n=====================================================================")
print(f"3. OPCAO 3 NO ES EM 365 DIAS: MATRIZ OR15 COM GESTAO 50% (OR_Mid) E 25% (50% DA METADE)")
print("=====================================================================")
def print_or_summary_es(sub, title):
    print(f"\n>>> {title} (n={len(sub)} | q25 medio={sub['q25'].mean():.2f} pts | q50 medio={sub['q50'].mean():.2f} pts):")
    for c, lbl in [
        ("fade_25_25",          "REVERSAO (Fade) [TP=25% OR (50% da metade) | SL=25% OR] (1:1)"),
        ("fade_50_25",          "REVERSAO (Fade) [TP=50% OR (Centro OR_Mid) | SL=25% OR] (2:1)"),
        ("fade_part_25_50_sl25","REVERSAO (Fade) [Parcial 25% OR + BE + Final 50% OR | SL=25%]"),
        ("fade_50_50",          "REVERSAO (Fade) [TP=50% OR (Centro OR_Mid) | SL=50% OR] (1:1)"),
        ("fade_part_25_50_sl50","REVERSAO (Fade) [Parcial 25% OR + BE + Final 50% OR | SL=50%]"),
        ("brk_25_25",           "BREAKOUT        [TP=25% OR (50% da metade) | SL=25% OR] (1:1)"),
        ("brk_50_25",           "BREAKOUT        [TP=50% OR (Proj. Metade)  | SL=25% OR] (2:1)"),
        ("brk_part_25_50_sl25", "BREAKOUT        [Parcial 25% OR + BE + Final 50% OR | SL=25%]"),
        ("brk_50_50",           "BREAKOUT        [TP=50% OR (Proj. Metade)  | SL=50% OR (Mid)]"),
        ("brk_part_25_50_sl50", "BREAKOUT        [Parcial 25% OR + BE + Final 50% OR | SL=50%]"),
    ]:
        s = sub[c]
        print(f"  {lbl:64s}: media={s.mean():+6.2f} pts | win={(s>0).mean()*100:5.1f}% | soma={s.sum():+8.2f} pts")

print_or_summary_es(or_es[or_es["is_first"]], "1. TODOS OS 1os TOQUES DO DIA NA ORH/ORL DO ES (SEM FILTRO)")
print_or_summary_es(or_es[or_es["is_first"] & ((~or_es["closed_out"]) | (or_es["forca_fav"] < 55))],
                    "2. 1o TOQUE COM REJEICAO / EXAUSTAO (Nao fecha fora OU Forca_Favor < 55)")

# No ES, caixa normal/ampla e range >= 20 pts (equivalente a ~130 pts no NQ)
print_or_summary_es(or_es[or_es["is_first"] & (or_es["or_rng"] >= 20.0) & ((~or_es["closed_out"]) | (or_es["forca_fav"] < 55))],
                    "3. CAIXA >= 20 PTS + 1o TOQUE COM REJEICAO (SETUP REVERSAO INTERNA ES)")

# Caixa comprimida no ES e < 20 pts (equivalente a < 120 pts NQ) - 1o breakout do dia
print_or_summary_es(or_es[(or_es["or_rng"] < 20.0) & (or_es["is_first_brk"]) & (or_es["forca_fav"] >= 55)],
                    "4A. CAIXA COMPRIMIDA (< 20 PTS) + 1o BREAKOUT DO DIA + FORCA >= 55% (SETUP BREAKOUT ES)")

# Caixa explosiva no ES e > 30 pts (equivalente a > 180 pts NQ) - 1o breakout do dia
print_or_summary_es(or_es[(or_es["or_rng"] > 30.0) & (or_es["is_first_brk"]) & (or_es["forca_fav"] >= 55)],
                    "4B. CAIXA EXPLOSIVA (> 30 PTS) + 1o BREAKOUT DO DIA + FORCA >= 55% (SETUP BREAKOUT ES)")
