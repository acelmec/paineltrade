"""Baixa substitutos do VIX (ETFs 120d + indice VIX desde 28/10) em BRT.
Uso: $env:DATABENTO_API_KEY="db-..."; python scripts/databento_vix_download.py
"""
import os, datetime as dt
import databento as db

out = os.path.join(os.path.dirname(__file__), "..", "data", "databento")
os.makedirs(out, exist_ok=True)
client = db.Historical(os.environ["DATABENTO_API_KEY"])
end = dt.datetime.now(dt.timezone.utc).replace(second=0, microsecond=0) - dt.timedelta(days=1)
start120 = end - dt.timedelta(days=120)
start_idx = dt.datetime(2026, 10, 28, tzinfo=dt.timezone.utc)

jobs = [(s, "EQUS.MINI", s, start120) for s in ["VIXY", "VXX", "UVXY", "SVXY"]]
jobs.append(("VIX_INDEX", "DBIX.CORE", "VIX", start_idx))

for name, ds, sym, start in jobs:
    try:
        df = client.timeseries.get_range(dataset=ds, symbols=[sym], schema="ohlcv-1m",
                                         start=start, end=end, stype_in="raw_symbol").to_df()
        df.index = df.index.tz_convert("America/Sao_Paulo")
        df.index.name = "time_brt"
        df = df[["open", "high", "low", "close", "volume"]]
        df.to_csv(os.path.join(out, f"{name}_1m_BRT.csv"))
        print(f"OK {name}: {len(df)} candles {df.index.min()} -> {df.index.max()}", flush=True)
    except Exception as e:
        print(f"ERRO {name}: {str(e)[:300]}", flush=True)
