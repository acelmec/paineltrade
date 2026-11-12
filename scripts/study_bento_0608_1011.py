"""Estudo estatistico completo (06/08/2026 a 10/11/2026) usando EXCLUSIVAMENTE os CSVs locais da Databento.
Não faz nenhuma consulta ao Supabase.
"""
import os, numpy as np, pandas as pd

TZ_BRT = "America/Sao_Paulo"
TZ_NY  = "America/New_York"
WIN_DIR = os.path.join("data", "databento", "janela_0608_1011")

# 1. Carregar NQ 1m e Forcas 1m da pasta janela_0608_1011
nq = pd.read_csv(os.path.join(WIN_DIR, "NQ_1m_BRT.csv"))
nq["ts"] = pd.to_datetime(nq["time_brt"], utc=True).dt.tz_convert(TZ_BRT)
nq = nq.set_index("ts").drop(columns=["time_brt"]).sort_index()

# Garantir que temos ate 10/11 23:59 se o arquivo base foi atualizado
nq_full = pd.read_csv(os.path.join("data", "databento", "NQ_1m_BRT.csv"))
nq_full["ts"] = pd.to_datetime(nq_full["time_brt"], utc=True).dt.tz_convert(TZ_BRT)
nq_full = nq_full.set_index("ts").drop(columns=["time_brt"]).sort_index()
nq = nq_full.loc["2026-08-06 00:00:00":"2026-11-10 23:59:00"].copy()

ff = pd.read_csv(os.path.join(WIN_DIR, "nasdaq_force_0608_1011_BRT.csv"))
ff["ts"] = pd.to_datetime(ff["timestamp"], utc=True).dt.tz_convert(TZ_BRT)
ff = ff.set_index("ts").drop(columns=["timestamp"]).sort_index()

df = nq.join(ff, how="inner")

# Converter indice para NY para ancorar sessoes com perfeicao (EDT antes de 01/11, EST a partir de 01/11)
ts_ny = df.index.tz_convert(TZ_NY)
df["ny_date"] = ts_ny.date
df["ny_hour"] = ts_ny.hour
df["ny_min"]  = ts_ny.minute
df["ny_hm"]   = ts_ny.hour * 60 + ts_ny.minute
df["brt_hour"] = df.index.hour
df["brt_hm"]   = df.index.hour * 60 + df.index.minute
df["is_post_nov1"] = df.index >= pd.Timestamp("2026-11-01 00:00:00", tz=TZ_BRT)

# Sessao Cash NY real: 09:30 as 16:00 ET (10:30-17:00 BRT antes de 01/11; 11:30-18:00 BRT a partir de 01/11)
df["cash_open_real"] = (ts_ny.dayofweek < 5) & (df["ny_hm"] >= 9*60 + 30) & (df["ny_hm"] < 16*60)

# Cesta Tech ponderada (mesmos pesos do EA: NVDA 35, MSFT 20, AAPL 15, AMZN 10, GOOGL 10, META 5, TSLA 5)
df["tech_compra"] = (
    df["nvidia_compra"] * 35 + df["microsoft_compra"] * 20 + df["apple_compra"] * 15 +
    df["amazon_compra"] * 10 + df["alphabet_compra"] * 10 + df["meta_compra"] * 5 + df["tesla_compra"] * 5
) / 100.0
df["vix_inv"] = 100.0 - df["vix_compra"]
df["usd_inv"] = 100.0 - df["usdindex_compra"]

# Forca final corrigida (usa pesos completos na sessao Cash NY real e off-hours fora dela)
f_on  = (df["nasdaq_compra"]*35 + df["vix_inv"]*20 + df["sp500_compra"]*15 + df["usd_inv"]*10 + df["tech_compra"]*20) / 100.0
f_off = (df["nasdaq_compra"]*60 + df["vix_inv"]*25 + df["sp500_compra"]*15) / 100.0
df["forca_final_real"] = np.floor(np.where(df["cash_open_real"], f_on, f_off) + 0.5)
df["forca_full_5ativos"] = np.floor(f_on + 0.5)

# Retornos em pontos do NQ
df["ret_0"]  = df["close"] - df["open"]          # retorno da propria vela M1
df["range_0"] = df["high"] - df["low"]           # amplitude da vela M1
for h in [1, 2, 3, 5, 10, 15, 30, 60]:
    # Garante que close[t+h] seja exatamente h minutos a frente (evita pular fim de semana)
    s_fut = df["close"].reindex(df.index + pd.Timedelta(minutes=h))
    s_fut.index = df.index
    df[f"ret_fwd_{h}m"] = s_fut - df["close"]

# Deltas de forca (variacao em 1m, 5m, 15m)
for col in ["forca_final_compra", "forca_final_real", "nasdaq_compra", "sp500_compra", "vix_compra", "usdindex_compra", "tech_compra", "nvidia_compra"]:
    df[f"d1_{col}"]  = df[col].diff(1)
    df[f"d5_{col}"]  = df[col].diff(5)
    df[f"d15_{col}"] = df[col].diff(15)

print("=====================================================================")
print("1. VISAO GERAL DA BASE (100% DATABENTO: 06/08/2026 A 10/11/2026)")
print("=====================================================================")
n_days_cash = df.loc[df["cash_open_real"], "ny_date"].nunique()
print(f"Total de minutos casados (24h): {len(df):,}")
print(f"Minutos em Sessao Cash NY real (09:30-16:00 ET): {df['cash_open_real'].sum():,} ({n_days_cash} pregoes)")
print(f"Pregoes antes de 01/11 (Cash 10:30-17:00 BRT): {df.loc[df['cash_open_real'] & ~df['is_post_nov1'], 'ny_date'].nunique()}")
print(f"Pregoes apos  01/11 (Cash 11:30-18:00 BRT): {df.loc[df['cash_open_real'] &  df['is_post_nov1'], 'ny_date'].nunique()}")
print(f"Range medio M1 (24h): {df['range_0'].mean():.2f} pts | Cash NY: {df.loc[df['cash_open_real'], 'range_0'].mean():.2f} pts | Off-hours: {df.loc[~df['cash_open_real'], 'range_0'].mean():.2f} pts")

print("\n=====================================================================")
print("2. CORRELACOES NIVEL E DELTA DA FORCA vs RETORNO DO NQ (SESSAO CASH NY)")
print("=====================================================================")
cash = df[df["cash_open_real"]].copy()
cols_f = [
    ("forca_final_compra", "Forca Final (EA)"),
    ("forca_final_real",   "Forca Final (Cash Real)"),
    ("nasdaq_compra",      "NASDAQ (NQ)"),
    ("sp500_compra",       "S&P 500 (ES)"),
    ("vix_inv",            "VIX Invertido (100-VIX)"),
    ("usd_inv",            "DXY Invertido (100-DX)"),
    ("tech_compra",        "Cesta 7 Techs (Pond.)"),
    ("nvidia_compra",      "NVIDIA (35%)"),
    ("microsoft_compra",   "MICROSOFT (20%)"),
    ("apple_compra",       "APPLE (15%)"),
    ("amazon_compra",      "AMAZON (10%)"),
    ("alphabet_compra",    "ALPHABET (10%)"),
    ("meta_compra",        "META (5%)"),
    ("tesla_compra",       "TESLA (5%)"),
]
targets = ["ret_0", "ret_fwd_1m", "ret_fwd_2m", "ret_fwd_5m", "ret_fwd_15m", "ret_fwd_30m", "ret_fwd_60m"]
rows_corr = []
for c, label in cols_f:
    r = {"Ativo": label}
    for t in targets:
        r[t] = cash[c].corr(cash[t])
    rows_corr.append(r)
df_corr = pd.DataFrame(rows_corr).set_index("Ativo")
print(df_corr.round(4).to_string())

print("\n--- Correlacao de DELTA Forca (d1 = 1m, d5 = 5m) vs Retorno (Sessao Cash NY) ---")
for dcol in ["d1_forca_final_real", "d1_nasdaq_compra", "d1_tech_compra", "d1_vix_compra", "d5_forca_final_real", "d5_tech_compra"]:
    vals = {t: cash[dcol].corr(cash[t]) for t in ["ret_0", "ret_fwd_1m", "ret_fwd_5m", "ret_fwd_15m"]}
    print(f"{dcol:22s}: " + " | ".join(f"{k}={v:+.4f}" for k, v in vals.items()))

print("\n--- Correlacao de NIVEL dentro de cada pregao (Forca vs Preco Fechamento NQ no dia) ---")
daily_lvl = cash.groupby("ny_date").apply(
    lambda g: pd.Series({
        "corr_nq_close": g["nasdaq_compra"].corr(g["close"]),
        "corr_ff_close": g["forca_final_real"].corr(g["close"]),
        "corr_tech_close": g["tech_compra"].corr(g["close"]),
        "corr_vix_inv_close": g["vix_inv"].corr(g["close"]),
        "corr_ff_ret0": g["forca_final_real"].corr(g["ret_0"]),
        "corr_ff_fwd15": g["forca_final_real"].corr(g["ret_fwd_15m"]),
        "corr_tech_fwd15": g["tech_compra"].corr(g["ret_fwd_15m"]),
    })
)
for k in daily_lvl.columns:
    s = daily_lvl[k].dropna()
    pct_pos = (s > 0).mean() * 100
    print(f"{k:20s}: media={s.mean():+.3f} | mediana={s.median():+.3f} | % dias > 0: {pct_pos:.1f}% ({int((s>0).sum())}/{len(s)} dias)")

print("\n=====================================================================")
print("3. ZONAS EXTREMAS DE FORCA (SESSAO CASH NY vs 24H)")
print("=====================================================================")
bins = [-1, 30, 40, 50, 60, 70, 101]
labels_b = ["< 30 (Venda Forte)", "30 a 40", "40 a 50", "50 a 60", "60 a 70", ">= 70 (Compra Forte)"]
for nome_sub, sub in [("SESSAO CASH NY (09:30-16:00 ET)", cash), ("24 HORAS (TODOS OS MINUTOS)", df)]:
    print(f"\n>>> {nome_sub} (usando Forca Final Cash Real):")
    sub = sub.copy()
    sub["faixa"] = pd.cut(sub["forca_final_real"], bins=bins, labels=labels_b, right=False)
    g = sub.groupby("faixa", observed=False).agg(
        minutos=("ret_0", "count"),
        ret_vela_0m=("ret_0", "mean"),
        fwd_1m=("ret_fwd_1m", "mean"),
        fwd_5m=("ret_fwd_5m", "mean"),
        fwd_15m=("ret_fwd_15m", "mean"),
        fwd_30m=("ret_fwd_30m", "mean"),
        fwd_60m=("ret_fwd_60m", "mean"),
        win_15m_compra=("ret_fwd_15m", lambda x: (x > 0).mean()*100),
    )
    print(g.round(2).to_string())

print("\n>>> Zonas por CESTA DAS 7 TECHS (tech_compra) na Sessao Cash NY:")
cash["faixa_tech"] = pd.cut(cash["tech_compra"], bins=bins, labels=labels_b, right=False)
gt = cash.groupby("faixa_tech", observed=False).agg(
    minutos=("ret_0", "count"),
    ret_vela_0m=("ret_0", "mean"),
    fwd_1m=("ret_fwd_1m", "mean"),
    fwd_5m=("ret_fwd_5m", "mean"),
    fwd_15m=("ret_fwd_15m", "mean"),
    fwd_30m=("ret_fwd_30m", "mean"),
    fwd_60m=("ret_fwd_60m", "mean"),
    win_15m_compra=("ret_fwd_15m", lambda x: (x > 0).mean()*100),
)
print(gt.round(2).to_string())

print("\n=====================================================================")
print("4. DIVERGENCIA TECHS vs NQ (QUANDO AS 7 ACOES LIDERAM OU DIVERGEM DO INDICE)")
print("=====================================================================")
cash["spread_tech_nq"] = cash["tech_compra"] - cash["nasdaq_compra"]
q_bins = [-100, -15, -5, 5, 15, 100]
q_lbls = ["Techs << NQ (<= -15)", "Techs < NQ (-15 a -5)", "Alinhados (-5 a +5)", "Techs > NQ (+5 a +15)", "Techs >> NQ (> +15)"]
cash["faixa_div"] = pd.cut(cash["spread_tech_nq"], bins=q_bins, labels=q_lbls)
gd = cash.groupby("faixa_div", observed=False).agg(
    minutos=("ret_0", "count"),
    nq_forca_med=("nasdaq_compra", "mean"),
    tech_forca_med=("tech_compra", "mean"),
    ret_0m=("ret_0", "mean"),
    fwd_5m=("ret_fwd_5m", "mean"),
    fwd_15m=("ret_fwd_15m", "mean"),
    fwd_30m=("ret_fwd_30m", "mean"),
    win_15m_up=("ret_fwd_15m", lambda x: (x > 0).mean()*100),
)
print(gd.round(2).to_string())

print("\n=====================================================================")
print("5. PICOS DE VARIACAO FORA DO PADRAO (> 2.5 SIGMA EM 1 MINUTO)")
print("=====================================================================")
for col, name in [("d1_forca_final_real", "Forca Final Real"), ("d1_nasdaq_compra", "NASDAQ"), ("d1_tech_compra", "Cesta Techs"), ("d1_vix_compra", "VIX")]:
    sd_all  = df[col].std()
    sd_cash = cash[col].std()
    thr = 2.5 * sd_cash
    up_spk = cash[cash[col] >= thr]
    dn_spk = cash[cash[col] <= -thr]
    print(f"\n* {name}: sigma_24h={sd_all:.2f} | sigma_cash={sd_cash:.2f} | Limiar 2.5*sigma_cash = +/-{thr:.1f} pts")
    print(f"  Picos ALTA (>= +{thr:.1f}): n={len(up_spk):4d} | ret_0={up_spk['ret_0'].mean():+6.2f} | fwd_1m={up_spk['ret_fwd_1m'].mean():+5.2f} | fwd_5m={up_spk['ret_fwd_5m'].mean():+5.2f} | fwd_15m={up_spk['ret_fwd_15m'].mean():+5.2f} | fwd_30m={up_spk['ret_fwd_30m'].mean():+5.2f}")
    print(f"  Picos BAIXA (<= -{thr:.1f}): n={len(dn_spk):4d} | ret_0={dn_spk['ret_0'].mean():+6.2f} | fwd_1m={dn_spk['ret_fwd_1m'].mean():+5.2f} | fwd_5m={dn_spk['ret_fwd_5m'].mean():+5.2f} | fwd_15m={dn_spk['ret_fwd_15m'].mean():+5.2f} | fwd_30m={dn_spk['ret_fwd_30m'].mean():+5.2f}")

# Picos Sincronizados (NQ + SP500 + Techs + Volume Alto > 2x media)
vol_ma20 = df["volume"].rolling(20, min_periods=5).mean()
df["vol_ratio"] = df["volume"] / vol_ma20
cash_v = df[df["cash_open_real"]].copy()
sync_up = cash_v[(cash_v["d1_nasdaq_compra"] >= 12) & (cash_v["d1_sp500_compra"] >= 10) & (cash_v["d1_tech_compra"] >= 8) & (cash_v["vol_ratio"] >= 1.5)]
sync_dn = cash_v[(cash_v["d1_nasdaq_compra"] <= -12) & (cash_v["d1_sp500_compra"] <= -10) & (cash_v["d1_tech_compra"] <= -8) & (cash_v["vol_ratio"] >= 1.5)]
print(f"\n* PICOS SINCRONIZADOS (NQ + SP500 + 7 Techs + Volume >= 1.5x media):")
print(f"  Disparo Conjunto ALTA (n={len(sync_up)}): ret_0={sync_up['ret_0'].mean():+.2f} | fwd_1m={sync_up['ret_fwd_1m'].mean():+.2f} | fwd_5m={sync_up['ret_fwd_5m'].mean():+.2f} | fwd_15m={sync_up['ret_fwd_15m'].mean():+.2f} | fwd_30m={sync_up['ret_fwd_30m'].mean():+.2f}")
print(f"  Disparo Conjunto BAIXA (n={len(sync_dn)}): ret_0={sync_dn['ret_0'].mean():+.2f} | fwd_1m={sync_dn['ret_fwd_1m'].mean():+.2f} | fwd_5m={sync_dn['ret_fwd_5m'].mean():+.2f} | fwd_15m={sync_dn['ret_fwd_15m'].mean():+.2f} | fwd_30m={sync_dn['ret_fwd_30m'].mean():+.2f}")

# Concentracao horaria dos picos na sessao Cash (em horario ET para alinhar pre e pos 01/11)
cash_v["et_bucket"] = (cash_v["ny_hm"] // 30) * 30
spk_any = cash_v[cash_v["d1_forca_final_real"].abs() >= 2.5 * cash_v["d1_forca_final_real"].std()]
print("\n* Concentracao de picos de Forca Final (>2.5 sigma) por janela de 30 min (Horario NY / BRT antes 01/11 / BRT pos 01/11):")
for hm, cnt in spk_any.groupby("et_bucket").size().items():
    h_et, m_et = divmod(int(hm), 60)
    rng_m = cash_v.loc[cash_v["et_bucket"] == hm, "range_0"].mean()
    print(f"  {h_et:02d}:{m_et:02d} ET ({h_et+1:02d}:{m_et:02d} BRT pre-01/11 | {h_et+2:02d}:{m_et:02d} BRT pos-01/11): {cnt:3d} picos | range medio M1 = {rng_m:.2f} pts")

print("\n=====================================================================")
print("6. ESTUDO DE EVENTOS DIARIOS (~68 PREGOES): ABERTURA CASH NY, LONDRES, ASIA E MACRO")
print("=====================================================================")
# Analise por dia na Abertura do Cash NY (09:30 ET)
open_events = []
for d_ny, g_day in df.groupby("ny_date"):
    if pd.Timestamp(d_ny).dayofweek >= 5:
        continue
    # Encontrar o timestamp exato de 09:30 ET nesse dia
    t_open_candidates = g_day[(g_day["ny_hour"] == 9) & (g_day["ny_min"] == 30)]
    if t_open_candidates.empty:
        continue
    t0 = t_open_candidates.index[0]
    if (t0 - pd.Timedelta(minutes=120)) not in df.index or (t0 + pd.Timedelta(minutes=60)) not in df.index:
        continue
    w_m120_m60 = df.loc[t0 - pd.Timedelta(minutes=120) : t0 - pd.Timedelta(minutes=60)]
    w_m60_m15  = df.loc[t0 - pd.Timedelta(minutes=60)  : t0 - pd.Timedelta(minutes=15)]
    w_m15_0    = df.loc[t0 - pd.Timedelta(minutes=15)  : t0 - pd.Timedelta(minutes=1)]
    w_0_p5     = df.loc[t0 : t0 + pd.Timedelta(minutes=4)]
    w_0_p15    = df.loc[t0 : t0 + pd.Timedelta(minutes=14)]
    w_p5_p30   = df.loc[t0 + pd.Timedelta(minutes=5) : t0 + pd.Timedelta(minutes=30)]
    w_p5_p60   = df.loc[t0 + pd.Timedelta(minutes=5) : t0 + pd.Timedelta(minutes=60)]

    p0   = df.loc[t0, "open"]
    p_1m = df.loc[t0, "close"]
    p_5m = df.loc[t0 + pd.Timedelta(minutes=4), "close"]
    p_15m = df.loc[t0 + pd.Timedelta(minutes=14), "close"]
    p_30m = df.loc[t0 + pd.Timedelta(minutes=29), "close"]
    p_60m = df.loc[t0 + pd.Timedelta(minutes=59), "close"]

    # Asia / Globex open daquela sessao (18:00 ET do dia anterior ou 19:00/20:00 BRT)
    t_asia = t0 - pd.Timedelta(hours=15, minutes=30) # 18:00 ET
    t_lon  = t0 - pd.Timedelta(hours=6, minutes=30)  # 03:00 ET (04:00/05:00 BRT)
    t_mac  = t0 - pd.Timedelta(hours=1)              # 08:30 ET (09:30/10:30 BRT)

    f_asia = df.loc[t_asia:t_asia+pd.Timedelta(minutes=30), "forca_final_real"].mean() if t_asia in df.index else np.nan
    f_lon  = df.loc[t_lon:t_lon+pd.Timedelta(minutes=30), "forca_final_real"].mean() if t_lon in df.index else np.nan
    f_mac  = df.loc[t_mac:t_mac+pd.Timedelta(minutes=15), "forca_final_real"].mean() if t_mac in df.index else np.nan

    open_events.append({
        "date": d_ny,
        "post_nov1": t0 >= pd.Timestamp("2026-11-01", tz=TZ_BRT),
        "f_asia": f_asia,
        "f_lon": f_lon,
        "f_macro_830": f_mac,
        "f_T120_60": w_m120_m60["forca_final_real"].mean(),
        "f_T60_15":  w_m60_m15["forca_final_real"].mean(),
        "f_T15_0":   w_m15_0["forca_final_real"].mean(),
        "f_at_T0":   df.loc[t0, "forca_final_real"],
        "f_first5m": w_0_p5["forca_final_real"].mean(),
        "tech_first5m": w_0_p5["tech_compra"].mean(),
        "vix_first5m":  w_0_p5["vix_compra"].mean(),
        "delta_pre": w_m15_0["forca_final_real"].mean() - w_m120_m60["forca_final_real"].mean(),
        "delta_open5m": df.loc[t0 + pd.Timedelta(minutes=4), "forca_final_real"] - df.loc[t0 - pd.Timedelta(minutes=1), "forca_final_real"],
        "ret_first1m": p_1m - p0,
        "ret_0_5m":   p_5m - p0,
        "ret_0_15m":  p_15m - p0,
        "ret_0_30m":  p_30m - p0,
        "ret_0_60m":  p_60m - p0,
        "ret_5_30m":  p_30m - p_5m,
        "ret_5_60m":  p_60m - p_5m,
        "range_15m":  w_0_p15["high"].max() - w_0_p15["low"].min(),
        "vol_15m":    w_0_p15["volume"].sum(),
    })

ev = pd.DataFrame(open_events)
print(f"Total de Aberturas Cash NY completas analisadas: {len(ev)} pregoes")
print(f"Range medio nos primeiros 15 min da abertura: {ev['range_15m'].mean():.1f} pts (mediana {ev['range_15m'].median():.1f} pts, max {ev['range_15m'].max():.1f} pts)")
print(f"Volume medio nos primeiros 15 min: {ev['vol_15m'].mean():,.0f} contratos")

print("\n--- Correlacao das Forcas Pre-Abertura e Primeiros 5m com os Retornos da Abertura ---")
pred_cols = ["f_asia", "f_lon", "f_macro_830", "f_T120_60", "f_T60_15", "f_T15_0", "delta_pre", "f_first5m", "tech_first5m", "vix_first5m", "delta_open5m"]
ret_cols  = ["ret_0_5m", "ret_0_15m", "ret_0_30m", "ret_0_60m", "ret_5_30m", "ret_5_60m"]
print(ev[pred_cols + ret_cols].corr().loc[pred_cols, ret_cols].round(3).to_string())

# Armadilha do 1o minuto (09:30 ET) vs Continuidade apos 5 minutos (09:35 ET)
trap_rate = ((ev["ret_first1m"] * (ev["ret_0_15m"] - ev["ret_first1m"])) < 0).mean() * 100
cont_5_15 = ((ev["ret_0_5m"] * (ev["ret_0_15m"] - ev["ret_0_5m"])) > 0).mean() * 100
print(f"\n* Taxa de Reversao (Armadilha) do 1o minuto (T0 -> T+1m reverte em T+1m -> T+15m): {trap_rate:.1f}% dos dias!")
print(f"* Taxa de Continuidade apos os primeiros 5m (T0..T+5m continua em T+5m..T+15m): {cont_5_15:.1f}% dos dias")

# Regras Operacionais na Abertura e Intraday: In-Sample (primeiros 48 dias) vs Out-of-Sample (ultimos 20 dias)
print("\n=====================================================================")
print("7. VALIDACAO IN-SAMPLE (70%) vs OUT-OF-SAMPLE (30%) DE GATILHOS OPERACIONAIS")
print("=====================================================================")
unique_dates = sorted(cash["ny_date"].unique())
split_idx = int(len(unique_dates) * 0.70)
cut_date = unique_dates[split_idx]
print(f"Corte temporal: In-Sample = {unique_dates[0]} a {unique_dates[split_idx-1]} ({split_idx} dias) | Out-of-Sample = {cut_date} a {unique_dates[-1]} ({len(unique_dates)-split_idx} dias)")

def eval_signal(sub_df, cond_buy, cond_sell, horizon="ret_fwd_15m", label=""):
    b = sub_df[cond_buy][horizon].dropna()
    s = -sub_df[cond_sell][horizon].dropna()
    all_trades = pd.concat([b, s])
    if len(all_trades) == 0:
        return f"{label}: 0 sinais"
    win = (all_trades > 0).mean() * 100
    return f"{label:45s} | n={len(all_trades):5d} (C:{len(b)} V:{len(s)}) | media={all_trades.mean():+6.2f} pts | win={win:5.1f}%"

for period_name, sub_c in [("IN-SAMPLE (70%)", cash[cash["ny_date"] < cut_date]), ("OUT-OF-SAMPLE (30%)", cash[cash["ny_date"] >= cut_date])]:
    print(f"\n>>> {period_name} (Horizonte: 15 minutos na Sessao Cash NY):")
    # Regra 1: Momentum puro Forca >= 70 / <= 30
    print(eval_signal(sub_c, sub_c["forca_final_real"] >= 70, sub_c["forca_final_real"] <= 30, "ret_fwd_15m", "1. Momentum: Forca >= 70 (C) / <= 30 (V)"))
    # Regra 2: Reversao de Exaustao extrema Forca >= 75 / <= 25
    print(eval_signal(sub_c, sub_c["forca_final_real"] <= 25, sub_c["forca_final_real"] >= 75, "ret_fwd_15m", "2. Reversao Exaustao: Forca <= 25 (C) / >= 75 (V)"))
    # Regra 3: Divergencia Techs liderando NQ (Techs - NQ >= +15 p/ Compra, <= -15 p/ Venda)
    print(eval_signal(sub_c, sub_c["spread_tech_nq"] >= 15, sub_c["spread_tech_nq"] <= -15, "ret_fwd_15m", "3. Lideranca Techs: (Tech - NQ) >= +15 (C) / <= -15 (V)"))
    # Regra 4: Disparo de Impulso (d5_forca_final_real >= +18 com Techs confirmando > 55)
    print(eval_signal(sub_c,
                      (sub_c["d5_forca_final_real"] >= 18) & (sub_c["tech_compra"] >= 55) & (sub_c["forca_final_real"] < 72),
                      (sub_c["d5_forca_final_real"] <= -18) & (sub_c["tech_compra"] <= 45) & (sub_c["forca_final_real"] > 28),
                      "ret_fwd_15m", "4. Impulso 5m (+18 pts) antes da exaustao (<72)"))
