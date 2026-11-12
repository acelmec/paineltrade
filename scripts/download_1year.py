"""Baixa o complemento de 1 ano (desde 01/11/2025 ate 10/11/2026 23:59 BRT) na Databento,
unindo com os CSVs ja baixados em data/databento/ para economizar creditos e tempo.
"""
import os, sys, datetime as dt, pandas as pd, databento as db

TZ = "America/Sao_Paulo"
BASE = os.path.join("data", "databento")
os.makedirs(BASE, exist_ok=True)
client = db.Historical(os.environ["DATABENTO_API_KEY"])

s_hist = dt.datetime(2025, 11, 1, 0, 0, tzinfo=dt.timezone.utc)
e_gap  = dt.datetime(2026, 7, 13, 18, 0, tzinfo=dt.timezone.utc)
s_tail = dt.datetime(2026, 11, 10, 16, 50, tzinfo=dt.timezone.utc)
e_tail = dt.datetime(2026, 11, 11, 3, 5, tzinfo=dt.timezone.utc)

def load_existing(name):
    p = os.path.join(BASE, f"{name}_1m_BRT.csv")
    if not os.path.exists(p):
        return pd.DataFrame()
    d = pd.read_csv(p)
    d.index = pd.to_datetime(d.iloc[:, 0], utc=True).dt.tz_convert(TZ)
    return d[["open", "high", "low", "close", "volume"]].sort_index()

def save_merged(name, parts):
    valid = [p for p in parts if p is not None and not p.empty]
    if not valid:
        return
    comb = pd.concat(valid)
    comb = comb[~comb.index.duplicated(keep="last")].sort_index()
    comb.index.name = "time_brt"
    p = os.path.join(BASE, f"{name}_1m_BRT.csv")
    comb.to_csv(p)
    print(f"OK {name:6s}: {len(comb):7d} candles | {comb.index.min()} -> {comb.index.max()}", flush=True)

def fetch_chunk(ds, sym, stype, s, e):
    df = client.timeseries.get_range(dataset=ds, symbols=[sym], schema="ohlcv-1m", start=s, end=e, stype_in=stype).to_df()
    if df.empty:
        return pd.DataFrame()
    df.index = df.index.tz_convert(TZ)
    return df[["open", "high", "low", "close", "volume"]]

# 1. NQ e ES (ja tem ate 11/11 00:04 BRT, so falta 01/11/2025 -> 13/07/2026)
for name, sym in [("NQ", "NQ.c.0"), ("ES", "ES.c.0")]:
    try:
        old = load_existing(name)
        print(f"Baixando {name} (01/11/2025 -> 13/07/2026)...", flush=True)
        pre = fetch_chunk("GLBX.MDP3", sym, "continuous", s_hist, e_gap)
        save_merged(name, [pre, old])
    except Exception as ex:
        print(f"ERRO {name}: {str(ex)[:250]}", flush=True)

# 2. 7 Techs + VIX ETFs no EQUS.MINI (01/11/2025 -> 13/07/2026 + complemento final de 10/11)
equs_syms = ["NVDA", "MSFT", "AAPL", "META", "AMZN", "GOOGL", "TSLA", "VXX", "VIXY", "UVXY"]
for sym in equs_syms:
    try:
        old = load_existing(sym)
        print(f"Baixando {sym} (01/11/2025 -> 13/07/2026 + tail 10/11)...", flush=True)
        pre  = fetch_chunk("EQUS.MINI", sym, "raw_symbol", s_hist, e_gap)
        tail = fetch_chunk("EQUS.MINI", sym, "raw_symbol", s_tail, e_tail)
        save_merged(sym, [pre, old, tail])
    except Exception as ex:
        print(f"ERRO {sym}: {str(ex)[:250]}", flush=True)

# 3. UUP (ETF Dolar Index no EQUS.MINI para cobrir 100% do ano)
try:
    print("Baixando UUP (ETF DXY em EQUS.MINI, 01/11/2025 -> 10/11/2026)...", flush=True)
    uup = fetch_chunk("EQUS.MINI", "UUP", "raw_symbol", s_hist, e_tail)
    save_merged("UUP", [uup])
except Exception as ex:
    print(f"ERRO UUP: {str(ex)[:250]}", flush=True)

# 4. DX.c.0 no IFUS.IMPACT (01/11/2025 -> 07/08/2026)
try:
    old_dx = load_existing("DX")
    print("Baixando DX.c.0 (IFUS.IMPACT, 01/11/2025 -> 07/08/2026)...", flush=True)
    pre_dx = fetch_chunk("IFUS.IMPACT", "DX.c.0", "continuous", s_hist, dt.datetime(2026, 8, 7, 3, 0, tzinfo=dt.timezone.utc))
    save_merged("DX", [pre_dx, old_dx])
except Exception as ex:
    print(f"ERRO DX: {str(ex)[:250]}", flush=True)
