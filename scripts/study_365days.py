"""Calcula as forcas para 1 ANO COMPLETO (11/11/2025 a 10/11/2026, com aquecimento desde 02/11/2025)
usando 100% dados locais da Databento e executa toda a bateria de estudos (~252 pregoes / ~351.000 minutos):
- Correlacoes contemporaneas e preditivas (lag 0 a +60m)
- Zonas extremas e Divergencia 7 Techs vs NQ (In-Sample 70% vs Out-of-Sample 30%)
- Picos > 2.5 sigma
- Entrada no 1o segundo da abertura (T0 = 09:30:00 ET)
- Matriz decisoria da OR15 (Maxima e Minima dos primeiros 15m) com gestao de 50% (Metade = OR_Mid) e 25% (50% da Metade)
"""
import os, sys, numpy as np, pandas as pd
sys.path.insert(0, "scripts")
from forces import load_csv, asset_compra, forca_final

TZ_BRT = "America/Sao_Paulo"
TZ_NY  = "America/New_York"
BASE = os.path.join("data", "databento")

start_365 = pd.Timestamp("2025-11-11 00:00:00", tz=TZ_BRT)
end_365   = pd.Timestamp("2026-11-10 23:59:00", tz=TZ_BRT)

force_365_path = os.path.join(BASE, "nasdaq_force_365d_BRT.csv")

nq_full = load_csv(os.path.join(BASE, "NQ_1m_BRT.csv"))

if not os.path.exists(force_365_path):
    print("1) Calculando forcas de 1 ano inteiro (02/11/2025 -> 10/11/2026)...", flush=True)
    es_df   = load_csv(os.path.join(BASE, "ES_1m_BRT.csv"))
    dx_df   = load_csv(os.path.join(BASE, "DX_1m_BRT.csv"))
    uup_df  = load_csv(os.path.join(BASE, "UUP_1m_BRT.csv"))
    vxx_df  = load_csv(os.path.join(BASE, "VXX_1m_BRT.csv"))
    vixy_df = load_csv(os.path.join(BASE, "VIXY_1m_BRT.csv"))
    uvxy_df = load_csv(os.path.join(BASE, "UVXY_1m_BRT.csv"))

    raw_comp = {}
    raw_comp["nasdaq"] = asset_compra(nq_full, digits=2)
    raw_comp["sp500"]  = asset_compra(es_df, digits=2)
    # DXY: usa DX futuro onde disponivel e UUP (ETF Dolar Index) antes de 06/08/2026
    c_dx  = asset_compra(dx_df, digits=3)
    c_uup = asset_compra(uup_df, digits=2)
    raw_comp["usdindex"] = c_dx.combine_first(c_uup)

    c_vxx  = asset_compra(vxx_df, digits=2)
    c_vixy = asset_compra(vixy_df, digits=2)
    c_uvxy = asset_compra(uvxy_df, digits=2)
    raw_comp["vix"] = c_vxx.combine_first(c_vixy).combine_first(c_uvxy)

    for k, sym in [("nvidia","NVDA"),("microsoft","MSFT"),("apple","AAPL"),("meta","META"),("amazon","AMZN"),("alphabet","GOOGL"),("tesla","TSLA")]:
        raw_comp[k] = asset_compra(load_csv(os.path.join(BASE, f"{sym}_1m_BRT.csv")), digits=2)
        print(f"   - {k} ({sym}): {len(raw_comp[k])} min", flush=True)

    driver_idx = nq_full.loc[(nq_full.index >= start_365) & (nq_full.index <= end_365)].index
    aligned = {}
    for k, s in raw_comp.items():
        u_idx = s.index.union(driver_idx).sort_values()
        aligned[k] = s.reindex(u_idx).ffill().reindex(driver_idx).fillna(50.0)

    ff = forca_final(aligned, driver_idx, broker_shift_h=5)
    ff.index.name = "timestamp"
    ff.to_csv(force_365_path)
    print(f"   Salvo {force_365_path} ({len(ff):,} linhas)", flush=True)
else:
    print("1) Carregando nasdaq_force_365d_BRT.csv ja calculado...", flush=True)
    ff = pd.read_csv(force_365_path)
    ff["ts"] = pd.to_datetime(ff["timestamp"], utc=True).dt.tz_convert(TZ_BRT)
    ff = ff.set_index("ts").drop(columns=["timestamp"]).sort_index()

nq = nq_full.loc[start_365:end_365].copy()
df = nq.join(ff, how="inner")

ts_ny = df.index.tz_convert(TZ_NY)
df["ny_date"] = ts_ny.date
df["ny_hour"] = ts_ny.hour
df["ny_min"]  = ts_ny.minute
df["ny_hm"]   = ts_ny.hour * 60 + ts_ny.minute
# Identificar regime de horario de verao nos EUA (EDT = UTC-4 -> Cash 10:30-17:00 BRT; EST = UTC-5 -> Cash 11:30-18:00 BRT)
df["is_est_winter"] = ts_ny.map(lambda x: x.utcoffset().total_seconds() == -5*3600)
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
df["spread_tech_nq"] = df["tech_compra"] - df["nasdaq_compra"]

df["ret_0"]   = df["close"] - df["open"]
df["range_0"] = df["high"]  - df["low"]
for h in [1, 2, 5, 15, 30, 60]:
    s_fut = df["close"].reindex(df.index + pd.Timedelta(minutes=h))
    s_fut.index = df.index
    df[f"ret_fwd_{h}m"] = s_fut - df["close"]

for col in ["forca_real", "nasdaq_compra", "sp500_compra", "vix_compra", "tech_compra"]:
    df[f"d1_{col}"] = df[col].diff(1)
    df[f"d5_{col}"] = df[col].diff(5)

cash = df[df["cash_open_real"]].copy()
n_days = cash["ny_date"].nunique()
n_est  = cash.loc[cash["is_est_winter"], "ny_date"].nunique()
n_edt  = cash.loc[~cash["is_est_winter"], "ny_date"].nunique()

print("\n=====================================================================")
print("1. VISAO GERAL DA BASE DE 365 DIAS (11/11/2025 A 10/11/2026)")
print("=====================================================================")
print(f"Total de minutos casados (24h): {len(df):,}")
print(f"Minutos em Sessao Cash NY (09:30-16:00 ET): {len(cash):,} ({n_days} pregoes)")
print(f"  - Pregoes no Horario de Inverno EUA (EST: Globex 20h->19h BRT | Cash 11:30->18:00 BRT): {n_est} pregoes")
print(f"  - Pregoes no Horario de Verao   EUA (EDT: Globex 19h->18h BRT | Cash 10:30->17:00 BRT): {n_edt} pregoes")
print(f"Range medio M1: 24h = {df['range_0'].mean():.2f} pts | Cash NY = {cash['range_0'].mean():.2f} pts | Off-hours = {df.loc[~df['cash_open_real'],'range_0'].mean():.2f} pts")

print("\n=====================================================================")
print("2. CORRELACOES NIVEL E DELTA vs RETORNO DO NQ (365 DIAS - SESSAO CASH NY)")
print("=====================================================================")
cols_f = [
    ("forca_real",       "Forca Final (Cash Real)"),
    ("nasdaq_compra",    "NASDAQ (NQ)"),
    ("sp500_compra",     "S&P 500 (ES)"),
    ("vix_inv",          "VIX Invertido (100-VIX)"),
    ("usd_inv",          "DXY Invertido (100-USD)"),
    ("tech_compra",      "Cesta 7 Techs (Pond.)"),
    ("nvidia_compra",    "NVIDIA (35%)"),
    ("microsoft_compra", "MICROSOFT (20%)"),
    ("apple_compra",     "APPLE (15%)"),
    ("amazon_compra",    "AMAZON (10%)"),
    ("alphabet_compra",  "ALPHABET (10%)"),
    ("meta_compra",      "META (5%)"),
    ("tesla_compra",     "TESLA (5%)"),
]
targets = ["ret_0", "ret_fwd_1m", "ret_fwd_2m", "ret_fwd_5m", "ret_fwd_15m", "ret_fwd_30m", "ret_fwd_60m"]
rows_corr = []
for c, label in cols_f:
    r = {"Ativo": label}
    for t in targets:
        r[t] = cash[c].corr(cash[t])
    rows_corr.append(r)
print(pd.DataFrame(rows_corr).set_index("Ativo").round(4).to_string())

daily_lvl = cash.groupby("ny_date").apply(
    lambda g: pd.Series({
        "corr_nq_close":   g["nasdaq_compra"].corr(g["close"]),
        "corr_ff_close":   g["forca_real"].corr(g["close"]),
        "corr_tech_close": g["tech_compra"].corr(g["close"]),
        "corr_ff_ret0":    g["forca_real"].corr(g["ret_0"]),
    })
)
print("\n--- Consistencia Intradiaria ao longo dos ~252 pregoes ---")
for k in daily_lvl.columns:
    s = daily_lvl[k].dropna()
    print(f"  {k:18s}: media={s.mean():+.3f} | mediana={s.median():+.3f} | % dias > 0: {(s>0).mean()*100:.1f}% ({int((s>0).sum())}/{len(s)} pregoes)")

print("\n=====================================================================")
print("3. ZONAS DE FORCA E DIVERGENCIA 7 TECHS vs NQ (365 DIAS)")
print("=====================================================================")
bins = [-1, 30, 40, 50, 60, 70, 101]
labels_b = ["< 30 (Venda Forte)", "30 a 40", "40 a 50", "50 a 60", "60 a 70", ">= 70 (Compra Forte)"]
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
print(g.round(2).to_string())

print("\n--- Divergencia Cesta 7 Techs - NQ (Sessao Cash NY, 365 dias) ---")
q_bins = [-100, -15, -5, 5, 15, 100]
q_lbls = ["Techs << NQ (<= -15)", "Techs < NQ (-15 a -5)", "Alinhados (-5 a +5)", "Techs > NQ (+5 a +15)", "Techs >> NQ (> +15)"]
cash["faixa_div"] = pd.cut(cash["spread_tech_nq"], bins=q_bins, labels=q_lbls)
gd = cash.groupby("faixa_div", observed=False).agg(
    minutos=("ret_0", "count"),
    ret_0m=("ret_0", "mean"),
    fwd_5m=("ret_fwd_5m", "mean"),
    fwd_15m=("ret_fwd_15m", "mean"),
    fwd_30m=("ret_fwd_30m", "mean"),
    fwd_60m=("ret_fwd_60m", "mean"),
    win_15m_up=("ret_fwd_15m", lambda x: (x > 0).mean()*100),
)
print(gd.round(2).to_string())

# Validacao In-Sample (70%) vs Out-of-Sample (30%) da Divergencia Tech-NQ nos 365 dias
u_dates = sorted(cash["ny_date"].unique())
sp_i = int(len(u_dates) * 0.70)
c_date = u_dates[sp_i]
for p_lbl, sc in [("IN-SAMPLE 70% (~176 pregoes)", cash[cash["ny_date"] < c_date]), ("OUT-OF-SAMPLE 30% (~76 pregoes)", cash[cash["ny_date"] >= c_date])]:
    b = sc[(sc["spread_tech_nq"] >= 15) & (sc["vix_compra"] <= 45)]["ret_fwd_15m"].dropna()
    s = -sc[(sc["spread_tech_nq"] <= -15) & (sc["vix_compra"] >= 55)]["ret_fwd_15m"].dropna()
    cb = pd.concat([b, s])
    print(f"  * Divergencia Tech-NQ c/ VIX [{p_lbl}]: n={len(cb)} min | media={cb.mean():+.2f} pts | win={(cb>0).mean()*100:.1f}%")

# ==============================================================================
# 4. ESTUDO DOS ~252 PREGOES NA ABERTURA (T0) E MATRIZ OR15 (50% E 25%)
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

days_365 = []
or_events_365 = []

for d_ny, g_day in df.groupby("ny_date"):
    if pd.Timestamp(d_ny).dayofweek >= 5:
        continue
    t_open = g_day[(g_day["ny_hour"] == 9) & (g_day["ny_min"] == 30)]
    if t_open.empty:
        continue
    t0 = t_open.index[0]
    if (t0 - pd.Timedelta(minutes=120)) not in df.index or (t0 + pd.Timedelta(minutes=120)) not in df.index:
        continue

    t_m1 = t0 - pd.Timedelta(minutes=1)
    w_m120_m60 = df.loc[t0 - pd.Timedelta(minutes=120) : t0 - pd.Timedelta(minutes=60)]
    w_m15_m1   = df.loc[t0 - pd.Timedelta(minutes=15)  : t_m1]
    t_asia = t0 - pd.Timedelta(hours=15, minutes=30)
    f_asia = df.loc[t_asia:t_asia+pd.Timedelta(minutes=30), "forca_real"].mean() if t_asia in df.index else 50.0

    p0 = df.loc[t0, "open"]
    b_1m  = df.loc[t0 : t0]
    b_5m  = df.loc[t0 : t0 + pd.Timedelta(minutes=4)]
    b_15m = df.loc[t0 : t0 + pd.Timedelta(minutes=14)]
    b_30m = df.loc[t0 : t0 + pd.Timedelta(minutes=29)]
    b_60m = df.loc[t0 : t0 + pd.Timedelta(minutes=59)]
    w_0_p5 = b_5m

    orh = b_15m["high"].max(); orl = b_15m["low"].min(); or_rng = orh - orl
    b_post_or = df.loc[t0 + pd.Timedelta(minutes=15) : t0 + pd.Timedelta(minutes=180)]

    days_365.append({
        "date": d_ny, "t0": t0, "p0": p0,
        "f_asia": f_asia,
        "f_T120_60": w_m120_m60["forca_real"].mean(),
        "f_T15_1": w_m15_m1["forca_real"].mean(),
        "vix_T15_1": w_m15_m1["vix_compra"].mean(),
        "delta_pre": w_m15_m1["forca_real"].mean() - w_m120_m60["forca_real"].mean(),
        "f_first5m": w_0_p5["forca_real"].mean(),
        "tech_first5m": w_0_p5["tech_compra"].mean(),
        "ret_1m":  b_1m.iloc[-1]["close"] - p0,
        "ret_5m":  b_5m.iloc[-1]["close"] - p0,
        "ret_15m": b_15m.iloc[-1]["close"] - p0,
        "ret_30m": b_30m.iloc[-1]["close"] - p0,
        "ret_60m": b_60m.iloc[-1]["close"] - p0,
        "ret_5_60m": b_60m.iloc[-1]["close"] - b_5m.iloc[-1]["close"],
        "up_15m": b_15m["high"].max() - p0, "dn_15m": p0 - b_15m["low"].min(),
        "up_60m": b_60m["high"].max() - p0, "dn_60m": p0 - b_60m["low"].min(),
        "orh": orh, "orl": orl, "or_rng": or_rng,
        "b_60m": b_60m,
    })

    hit_h = b_post_or[b_post_or["high"] >= orh]
    hit_l = b_post_or[b_post_or["low"]  <= orl]
    fh = hit_h.index[0] if not hit_h.empty else None
    fl = hit_l.index[0] if not hit_l.empty else None

    for side, ts_hit, lvl in [("ORH", fh, orh), ("ORL", fl, orl)]:
        if ts_hit is None:
            continue
        w60 = df.loc[ts_hit + pd.Timedelta(minutes=1) : ts_hit + pd.Timedelta(minutes=60)]
        if len(w60) < 15:
            continue
        row_hit = df.loc[ts_hit]
        dir_brk = 1 if side == "ORH" else -1
        dir_fade = -dir_brk
        closed_out = (row_hit["close"] > lvl) if side == "ORH" else (row_hit["close"] < lvl)
        forca_fav = row_hit["forca_real"] if side == "ORH" else (100 - row_hit["forca_real"])
        tech_fav  = row_hit["tech_compra"] if side == "ORH" else (100 - row_hit["tech_compra"])
        is_first  = (fl is None or ts_hit <= fl) if side == "ORH" else (fh is None or ts_hit <= fh)
        q25 = 0.25 * or_rng; q50 = 0.50 * or_rng

        rec = {
            "date": d_ny, "side": side, "or_rng": or_rng, "q25": q25, "q50": q50,
            "is_first": is_first, "closed_out": closed_out, "forca_fav": forca_fav, "tech_fav": tech_fav,
        }
        rec["fade_25_25"], _, _ = sim_pct_bracket(w60, lvl, dir_fade, q25, q25)
        rec["fade_50_25"], _, _ = sim_pct_bracket(w60, lvl, dir_fade, q25, q50)
        rec["fade_50_50"], _, _ = sim_pct_bracket(w60, lvl, dir_fade, q50, q50)
        rec["fade_part_25_50_sl25"], _ = sim_partial_25_50(w60, lvl, dir_fade, q25, q25, q50)
        rec["fade_part_25_50_sl50"], _ = sim_partial_25_50(w60, lvl, dir_fade, q50, q25, q50)

        rec["brk_25_25"], _, _ = sim_pct_bracket(w60, lvl, dir_brk, q25, q25)
        rec["brk_50_25"], _, _ = sim_pct_bracket(w60, lvl, dir_brk, q25, q50)
        rec["brk_50_50"], _, _ = sim_pct_bracket(w60, lvl, dir_brk, q50, q50)
        rec["brk_part_25_50_sl25"], _ = sim_partial_25_50(w60, lvl, dir_brk, q25, q25, q50)
        rec["brk_part_25_50_sl50"], _ = sim_partial_25_50(w60, lvl, dir_brk, q50, q25, q50)
        or_events_365.append(rec)

d365 = pd.DataFrame(days_365)
or365 = pd.DataFrame(or_events_365)

print("\n=====================================================================")
print(f"4. ESTUDO DAS ABERTURAS CASH NY EM 365 DIAS ({len(d365)} PREGOES)")
print("=====================================================================")
trap_365 = ((d365["ret_1m"] * (d365["ret_15m"] - d365["ret_1m"])) < 0).mean() * 100
print(f"Range medio OR15 (primeiros 15m): {d365['or_rng'].mean():.1f} pts (mediana {d365['or_rng'].median():.1f} pts)")
print(f"Taxa de Armadilha do 1o minuto (reverte nos 14m seguintes): {trap_365:.1f}% dos pregoes")

for name, cb, cs in [
    ("Estrategia 1 (Asia + T-15m >=52 / <=48 -> T0)", (d365["f_asia"]>=52)&(d365["f_T15_1"]>=52), (d365["f_asia"]<=48)&(d365["f_T15_1"]<=48)),
    ("Estrategia 2A (Combo Delta_Pre >=+4 & F>=50 & VIX<=50 -> T0)", (d365["delta_pre"]>=4)&(d365["f_T15_1"]>=50)&(d365["vix_T15_1"]<=50), (d365["delta_pre"]<=-4)&(d365["f_T15_1"]<=50)&(d365["vix_T15_1"]>=50)),
]:
    sb = d365[cb].copy(); sb["dir"] = 1
    ss = d365[cs].copy(); ss["dir"] = -1
    sub = pd.concat([sb, ss]).sort_values("date")
    r1 = sub["ret_1m"]*sub["dir"]; r5 = sub["ret_5m"]*sub["dir"]; r15 = sub["ret_15m"]*sub["dir"]; r60 = sub["ret_60m"]*sub["dir"]
    sc45 = pd.Series([sim_pct_bracket(r["b_60m"].iloc[:5], r["p0"], r["dir"], 45, 45)[0] for _, r in sub.iterrows()])
    sw60 = pd.Series([sim_pct_bracket(r["b_60m"], r["p0"], r["dir"], 85, 130)[0] for _, r in sub.iterrows()])
    print(f"\n>>> {name} (n={len(sub)} pregoes):")
    print(f"  Retornos por tempo: 1m={r1.mean():+5.1f} ({(r1>0).mean()*100:4.1f}%) | 5m={r5.mean():+5.1f} ({(r5>0).mean()*100:4.1f}%) | 15m={r15.mean():+5.1f} ({(r15>0).mean()*100:4.1f}%) | 60m={r60.mean():+5.1f} ({(r60>0).mean()*100:4.1f}%)")
    print(f"  Scalp 5m [TP 45 / SL 45]: media={sc45.mean():+5.1f} pts (win {(sc45>0).mean()*100:4.1f}% | soma={sc45.sum():+7.1f} pts)")
    print(f"  Swing 60m [TP 130 / SL 85]: media={sw60.mean():+5.1f} pts (win {(sw60>0).mean()*100:4.1f}% | soma={sw60.sum():+7.1f} pts)")

# Estrategia 2B (Confirmacao T+5m)
sb5 = d365[(d365["f_first5m"]>=55)&(d365["tech_first5m"]>=52)]["ret_5_60m"]
ss5 = -d365[(d365["f_first5m"]<=45)&(d365["tech_first5m"]<=48)]["ret_5_60m"]
c5 = pd.concat([sb5, ss5])
print(f"\n>>> Estrategia 2B (Confirmacao T+5m: Forca>=55 & Tech>=52 -> T+5m a T+60m): n={len(c5)} pregoes | media={c5.mean():+5.1f} pts | win={(c5>0).mean()*100:4.1f}%")

print("\n=====================================================================")
print(f"5. OPCAO 3 EM 365 DIAS: MATRIZ OR15 COM GESTAO 50% (OR_Mid) E 25% (50% DA METADE) ({len(or365)} EVENTOS)")
print("=====================================================================")
def print_or_summary(sub, title):
    print(f"\n>>> {title} (n={len(sub)} | q25 medio={sub['q25'].mean():.1f} pts | q50 medio={sub['q50'].mean():.1f} pts):")
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
        print(f"  {lbl:64s}: media={s.mean():+6.2f} pts | win={(s>0).mean()*100:5.1f}% | soma={s.sum():+8.1f} pts")

print_or_summary(or365[or365["is_first"]], "1. TODOS OS 1os TOQUES DO DIA NA ORH/ORL (SEM FILTRO)")
print_or_summary(or365[or365["is_first"] & ((~or365["closed_out"]) | (or365["forca_fav"] < 55))],
                 "2. 1o TOQUE COM REJEICAO / EXAUSTAO (Nao fecha fora OU Forca_Favor < 55)")
print_or_summary(or365[or365["is_first"] & (or365["or_rng"] >= 120) & ((~or365["closed_out"]) | (or365["forca_fav"] < 55))],
                 "3. CAIXA >= 120 PTS + 1o TOQUE COM REJEICAO (SETUP REVERSAO INTERNA)")
print_or_summary(or365[(or365["or_rng"] < 120) & (or365["closed_out"]) & (or365["forca_fav"] >= 55)],
                 "4A. CAIXA COMPRIMIDA (< 120 PTS) + FECHA FORA + FORCA >= 55% (SETUP BREAKOUT)")
print_or_summary(or365[(or365["or_rng"] > 180) & (or365["forca_fav"] >= 55) & (or365["closed_out"])],
                 "4B. CAIXA EXPLOSIVA (> 180 PTS) + FECHA FORA + FORCA >= 55% (SETUP BREAKOUT)")
