"""Calcula e atualiza as colunas de Forex (EURUSD, USDJPY, EURJPY) na tabela nasdaq_force
no Supabase, simulando o cálculo exato do indicador SenderSupabaseV2.mq4 com os candles
da Databento e o ajuste de horário (outubro 19h / novembro 20h BRT).

Uso: python scripts/backfill_fx_nasdaq_force.py [--apply]
"""
import os, sys, time, requests, numpy as np, pandas as pd
sys.path.insert(0, "scripts")
from supa_util import U, H

TZ = "America/Sao_Paulo"
APPLY = "--apply" in sys.argv
INST = "painel_principal_web"
BASE = os.path.join(os.path.dirname(__file__), "..", "data", "databento")

TFS = [60, 300, 900, 1800, 3600, 14400]  # M1, M5, M15, M30, H1, H4 em segundos

def load_csv(path):
    d = pd.read_csv(path)
    d.index = pd.to_datetime(d.iloc[:, 0], utc=True).dt.tz_convert(TZ)
    return d[["open", "high", "low", "close"]].astype(float).sort_index()

def _levels_count(h, l, c, bid, digits):
    valid = (h > 0) & (l > 0) & (c > 0)
    tp = np.where(valid, (h + l + c) / 3.0, np.nan)
    lv = []
    for s in range(5): lv.append(tp[s])
    for s in range(6): lv.append(2 * tp[s] - l[s])
    for s in range(6): lv.append(2 * tp[s] - h[s])
    for s in range(6): lv.append(tp[s] + (h[s] - l[s]))
    for s in range(6): lv.append(tp[s] - (h[s] - l[s]))
    for s in (0, 1, 2, 3, 5): lv.append(2 * tp[s] + (h[s] - 2 * l[s]))
    dn = np.zeros(len(bid)); up = np.zeros(len(bid))
    for v in lv:
        vr = np.round(v, digits)
        ok = ~np.isnan(vr)
        dn += ok & (vr < bid)
        up += ok & (vr > bid)
    return dn, up

def fx_asset_compra(m1, digits=5):
    """Calcula compra (0..100) com broker offset dinâmico (+3h no verão até 01/11, +2h no inverno)."""
    idx = m1.index
    # Transição de horário de verão europeu (01/11/2026):
    utc_idx = idx.tz_convert("UTC")
    dst_switch = pd.Timestamp("2026-11-01 02:00:00", tz="UTC")
    broker_offset_h = np.where(utc_idx < dst_switch, 3, 2)
    ep = utc_idx.as_unit("s").asi8 + broker_offset_h * 3600

    H, L, C = m1["high"].to_numpy(), m1["low"].to_numpy(), m1["close"].to_numpy()
    bid = np.round(C, digits)
    n = len(m1)
    tot_dn = np.zeros(n)
    for tf in TFS:
        key = ep // tf
        df = pd.DataFrame({"k": key, "h": H, "l": L, "c": C})
        g = df.groupby("k", sort=True)
        cmax = g["h"].cummax().to_numpy(); cmin = g["l"].cummin().to_numpy()
        fin = g.agg(h=("h", "max"), l=("l", "min"), c=("c", "last"))
        gi = np.searchsorted(fin.index.to_numpy(), key)
        fh, fl, fc = fin["h"].to_numpy(), fin["l"].to_numpy(), fin["c"].to_numpy()
        h = np.full((6, n), np.nan); l = h.copy(); c = h.copy()
        h[0], l[0], c[0] = cmax, cmin, C
        for s in range(1, 6):
            j = gi - s; ok = j >= 0; jj = np.where(ok, j, 0)
            h[s] = np.where(ok, fh[jj], np.nan); l[s] = np.where(ok, fl[jj], np.nan); c[s] = np.where(ok, fc[jj], np.nan)
        dn, up = _levels_count(h, l, c, bid, digits)
        tot_dn += dn
    comp = np.floor(100.0 * tot_dn / 210.0 + 0.5)
    return pd.Series(comp, index=idx)

print("1) Carregando CSVs de Forex (com dados desde 13/07 para aquecimento M1..H4)...", flush=True)
eurusd_df = load_csv(os.path.join(BASE, "EURUSD_1m_BRT.csv"))
usdjpy_df = load_csv(os.path.join(BASE, "USDJPY_1m_BRT.csv"))
eurjpy_df = load_csv(os.path.join(BASE, "EURJPY_1m_BRT.csv"))

print(f"   EURUSD: {len(eurusd_df)} candles ({eurusd_df.index.min()} a {eurusd_df.index.max()})", flush=True)
print(f"   USDJPY: {len(usdjpy_df)} candles ({usdjpy_df.index.min()} a {usdjpy_df.index.max()})", flush=True)
print(f"   EURJPY: {len(eurjpy_df)} candles ({eurjpy_df.index.min()} a {eurjpy_df.index.max()})", flush=True)

print("2) Calculando impulsos exatos dos 3 pares...", flush=True)
c_eurusd = fx_asset_compra(eurusd_df, digits=5)
print("   - EURUSD impulso calculado.", flush=True)
c_usdjpy = fx_asset_compra(usdjpy_df, digits=3)
print("   - USDJPY impulso calculado.", flush=True)
c_eurjpy = fx_asset_compra(eurjpy_df, digits=3)
print("   - EURJPY impulso calculado.", flush=True)

print("3) Obtendo grade de timestamps da tabela nasdaq_force para preenchimento...", flush=True)
# Janela alvo: desde 06/08/2026 00:00 até 12/11/2026 16:50 BRT (quando o streaming live assumiu)
start_win = pd.Timestamp("2026-08-06 00:00:00", tz=TZ)
end_win   = pd.Timestamp("2026-11-12 16:50:00", tz=TZ)

# 1. Carrega o índice base de NQ_1m_BRT (06/08 até 11/11 00:04)
nq_csv = os.path.join(BASE, "NQ_1m_BRT.csv")
nq_df = load_csv(nq_csv)
driver_idx_base = nq_df.loc[(nq_df.index >= start_win) & (nq_df.index <= end_win)].index

# 2. Puxa os timestamps adicionais da tabela nasdaq_force no Supabase de 11/11 até 12/11 16:50
print("   Buscando timestamps de 11/11 a 12/11 diretamente do Supabase...", flush=True)
from supa_util import fetch_keyset
tail_rows = fetch_keyset(
    "nasdaq_force",
    {"select": "timestamp", "instance_id": f"eq.{INST}"},
    "2026-11-11T00:04:00-03:00",
    until="2026-11-12T16:50:00-03:00",
    page=1000,
    verbose=False
)
tail_ts = [pd.to_datetime(r["timestamp"]) for r in tail_rows]
if tail_ts:
    tail_idx = pd.DatetimeIndex(tail_ts).tz_convert(TZ)
    driver_idx = driver_idx_base.union(tail_idx).sort_values()
else:
    driver_idx = driver_idx_base

print(f"   Total de minutos alvo: {len(driver_idx)} ({driver_idx.min()} a {driver_idx.max()})", flush=True)

print("4) Alinhando séries temporais com ffill...", flush=True)
def align(s):
    u = s.index.union(driver_idx).sort_values()
    return s.reindex(u).ffill().reindex(driver_idx).fillna(50.0)

eurusd_aligned = align(c_eurusd).astype(int)
usdjpy_aligned = align(c_usdjpy).astype(int)
eurjpy_aligned = align(c_eurjpy).astype(int)

df_fx = pd.DataFrame(index=driver_idx)
df_fx["eurusd_compra"] = eurusd_aligned
df_fx["eurusd_venda"]  = 100 - eurusd_aligned
df_fx["usdjpy_compra"] = usdjpy_aligned
df_fx["usdjpy_venda"]  = 100 - usdjpy_aligned
df_fx["eurjpy_compra"] = eurjpy_aligned
df_fx["eurjpy_venda"]  = 100 - eurjpy_aligned

out_csv = os.path.join(BASE, "fx_force_0608_1211_BRT.csv")
df_fx.to_csv(out_csv)
print(f"CSV de Forex gerado em {out_csv} ({len(df_fx)} linhas).", flush=True)
print("Amostra inicial:")
print(df_fx.head(3))
print("Amostra intermediária (outubro):")
print(df_fx.loc[df_fx.index >= "2026-10-15"].head(3))
print("Amostra recente (12/11):")
print(df_fx.tail(3))

if APPLY:
    print("\n5) Enviando atualização em lotes para o Supabase (merge-duplicates)...", flush=True)
    recs = []
    for ts, row in df_fx.iterrows():
        recs.append({
            "instance_id": INST,
            "timestamp": ts.isoformat(),
            "eurusd_compra": int(row["eurusd_compra"]),
            "eurusd_venda": int(row["eurusd_venda"]),
            "usdjpy_compra": int(row["usdjpy_compra"]),
            "usdjpy_venda": int(row["usdjpy_venda"]),
            "eurjpy_compra": int(row["eurjpy_compra"]),
            "eurjpy_venda": int(row["eurjpy_venda"]),
        })

    headers_post = {
        **H,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    url_post = f"{U}/rest/v1/nasdaq_force?on_conflict=instance_id,timestamp"
    batch_size = 1000
    total = len(recs)
    sent = 0
    t0 = time.time()
    for i in range(0, total, batch_size):
        chunk = recs[i:i + batch_size]
        for attempt in range(3):
            r = requests.post(url_post, headers=headers_post, json=chunk, timeout=60)
            if r.status_code in (200, 201, 204):
                break
            time.sleep(2)
        if r.status_code not in (200, 201, 204):
            print(f"ERRO no lote {i}: {r.status_code} {r.text[:300]}", flush=True)
            sys.exit(1)
        sent += len(chunk)
        if sent % 10000 == 0 or sent == total:
            elapsed = time.time() - t0
            print(f"   progresso: {sent}/{total} ({sent*100.0/total:.1f}%) em {elapsed:.1f}s", flush=True)

    print("6) CONCLUÍDO COM SUCESSO! A tabela nasdaq_force agora possui os dados completos de Forex.", flush=True)
else:
    print("\n[MODO SIMULAÇÃO] Execute com --apply para enviar ao Supabase.")
