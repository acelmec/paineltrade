"""Calcula os percentuais de forca dos 11 ativos + forca final (replica fiel de SenderSupabase_v2.mq4)
na janela 06/08/2026 -> 10/11/2026 (BRT) e insere em nasdaq_force (instance_id = painel_principal_web)
com ignore-duplicates.

Uso: python scripts/backfill_nasdaq_force.py [--apply]
"""
import os, sys, time, requests, numpy as np, pandas as pd
sys.path.insert(0, "scripts")
from supa_util import U, H
from forces import load_csv, asset_compra, forca_final

TZ = "America/Sao_Paulo"
APPLY = "--apply" in sys.argv
INST = "painel_principal_web"
BASE = os.path.join("data", "databento")

start_win = pd.Timestamp("2026-08-06 00:00:00", tz=TZ)
end_win   = pd.Timestamp("2026-11-10 23:59:00", tz=TZ)

print("1) Carregando CSVs de 120 dias (com aquecimento desde 13/07 para M1..H4)...", flush=True)
nq_df = load_csv(os.path.join(BASE, "NQ_1m_BRT.csv"))
es_df = load_csv(os.path.join(BASE, "ES_1m_BRT.csv"))
dx_df = load_csv(os.path.join(BASE, "DX_1m_BRT.csv"))

# VIX EQUS.MINI: usa VXX (maior cobertura de pre/after-market no EQUS.MINI)
vxx_df  = load_csv(os.path.join(BASE, "VXX_1m_BRT.csv"))
vixy_df = load_csv(os.path.join(BASE, "VIXY_1m_BRT.csv"))
uvxy_df = load_csv(os.path.join(BASE, "UVXY_1m_BRT.csv"))

tech_files = {
    "nvidia": "NVDA",
    "microsoft": "MSFT",
    "apple": "AAPL",
    "meta": "META",
    "amazon": "AMZN",
    "alphabet": "GOOGL",
    "tesla": "TSLA",
}

print("2) Calculando impulso individual (M1, M5, M15, M30, H1, H4 - 35 slots x 6 TFs)...", flush=True)
raw_comp = {}
raw_comp["nasdaq"]   = asset_compra(nq_df, digits=2)
raw_comp["sp500"]    = asset_compra(es_df, digits=2)
raw_comp["usdindex"] = asset_compra(dx_df, digits=3)

# Para VIX EQUS.MINI, calculamos o impulso de VXX, VIXY e UVXY; usamos VXX com preenchimento de minutos onde VIXY/UVXY tiveram negocio
c_vxx  = asset_compra(vxx_df, digits=2)
c_vixy = asset_compra(vixy_df, digits=2)
c_uvxy = asset_compra(uvxy_df, digits=2)
raw_comp["vix"] = c_vxx.combine_first(c_vixy).combine_first(c_uvxy)

for k, sym in tech_files.items():
    df_t = load_csv(os.path.join(BASE, f"{sym}_1m_BRT.csv"))
    raw_comp[k] = asset_compra(df_t, digits=2)
    print(f"   - {k} ({sym}): {len(raw_comp[k])} minutos calculados", flush=True)

# Grade de minutos da janela 06/08 -> 10/11 baseada nos minutos do NQ (como no EA: iTime(NASDAQ_Symbol, PERIOD_M1, 0))
driver_idx = nq_df.loc[(nq_df.index >= start_win) & (nq_df.index <= end_win)].index
print(f"3) Alinhando nos {len(driver_idx)} minutos do NQ ({driver_idx.min()} -> {driver_idx.max()})...", flush=True)

aligned_comp = {}
for k, s in raw_comp.items():
    # Reindexa na uniao para fazer ffill do ultimo estado conhecido (como o MT4 mantem o ultimo bid/candle)
    u_idx = s.index.union(driver_idx).sort_values()
    aligned_comp[k] = s.reindex(u_idx).ffill().reindex(driver_idx).fillna(50.0)

df_out = forca_final(aligned_comp, driver_idx, broker_shift_h=5)
df_out.index.name = "timestamp"

out_csv = os.path.join(BASE, "janela_0608_1011", "nasdaq_force_0608_1011_BRT.csv")
df_out.to_csv(out_csv)
print(f"4) CSV salvo em {out_csv} ({len(df_out)} linhas).", flush=True)
print("Resumo de modos:", df_out["modo"].value_counts().to_dict(), flush=True)
print("Resumo de direcao:", df_out["direcao"].value_counts().to_dict(), flush=True)
print("Amostra inicial (06/08):")
print(df_out[["nasdaq_compra", "sp500_compra", "usdindex_compra", "vix_compra", "forca_final_compra", "modo"]].head(3))
print("Amostra final (10/11):")
print(df_out[["nasdaq_compra", "sp500_compra", "usdindex_compra", "vix_compra", "forca_final_compra", "modo"]].tail(3))

if APPLY:
    print("5) Enviando para Supabase (nasdaq_force, ignore-duplicates)...", flush=True)
    # Verifica a linha mais recente de hoje para preserva-la como maior ID ao final
    r_latest = requests.get(f"{U}/rest/v1/nasdaq_force", headers=H,
                            params={"select": "*", "instance_id": f"eq.{INST}", "order": "id.desc", "limit": "1"}, timeout=30)
    latest_row = r_latest.json()[0] if (r_latest.status_code == 200 and r_latest.json()) else None

    cols = list(df_out.columns)
    recs = []
    for ts, row in df_out.iterrows():
        ts_iso = ts.isoformat()
        upd_iso = (ts + pd.Timedelta(minutes=1)).isoformat()
        d = {"instance_id": INST, "timestamp": ts_iso, "updated_at": upd_iso}
        for c in cols:
            v = row[c]
            if isinstance(v, (np.integer, int)): d[c] = int(v)
            elif isinstance(v, (np.bool_, bool)): d[c] = bool(v)
            else: d[c] = str(v)
        recs.append(d)

    headers_post = {
        **H,
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates,return=minimal",
    }
    url_post = f"{U}/rest/v1/nasdaq_force?on_conflict=instance_id,timestamp"
    batch_size = 1000
    total = len(recs)
    sent = 0
    for i in range(0, total, batch_size):
        chunk = recs[i:i + batch_size]
        for attempt in range(3):
            r = requests.post(url_post, headers=headers_post, json=chunk, timeout=120)
            if r.status_code in (200, 201, 204):
                break
            time.sleep(2)
        if r.status_code not in (200, 201, 204):
            print(f"ERRO no lote {i}: {r.status_code} {r.text[:300]}", flush=True)
            sys.exit(1)
        sent += len(chunk)
        if sent % 10000 == 0 or sent == total:
            print(f"   progresso: {sent}/{total}", flush=True)

    # Garante que o registro mais recente (11/11) continue com o maior id
    if latest_row and latest_row.get("timestamp", "") > "2026-11-11":
        r_chk = requests.get(f"{U}/rest/v1/nasdaq_force", headers=H,
                             params={"select": "id,timestamp", "instance_id": f"eq.{INST}", "order": "id.desc", "limit": "1"}, timeout=30)
        top_now = r_chk.json()[0] if (r_chk.status_code == 200 and r_chk.json()) else None
        if top_now and top_now["timestamp"] < "2026-11-11":
            # Remove id e re-upserta o ultimo registro de 11/11 com novo id no topo
            old_id = latest_row.pop("id", None)
            requests.delete(f"{U}/rest/v1/nasdaq_force?id=eq.{old_id}", headers=H, timeout=30)
            requests.post(f"{U}/rest/v1/nasdaq_force?on_conflict=instance_id,timestamp",
                          headers={**H, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"},
                          json=[latest_row], timeout=30)
            print("   registro ao vivo de 11/11 preservado no topo de IDs.", flush=True)
    print("CONCLUIDO COM SUCESSO!", flush=True)
