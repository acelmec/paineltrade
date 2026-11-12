"""Baixa candles 1m (ohlcv-1m) da Databento e salva CSVs em BRT.
Uso: $env:DATABENTO_API_KEY="db-..."; python scripts/databento_download.py [dias=120]
Saida: data/databento/<ATIVO>_1m_BRT.csv
"""
import os, sys, datetime as dt
import databento as db

days = int(sys.argv[1]) if len(sys.argv) > 1 else 120
out = os.path.join(os.path.dirname(__file__), "..", "data", "databento")
os.makedirs(out, exist_ok=True)
client = db.Historical(os.environ["DATABENTO_API_KEY"])

end = dt.datetime.now(dt.timezone.utc).replace(second=0, microsecond=0) - dt.timedelta(days=1)
start = end - dt.timedelta(days=days)

# (nome, dataset, simbolo, stype_in)
jobs = [("NQ", "GLBX.MDP3", "NQ.c.0", "continuous"),
        ("ES", "GLBX.MDP3", "ES.c.0", "continuous"),
        ("DX", "IFUS.IMPACT", "DX.c.0", "continuous"),
        ("VX", "XCBF.PITCH", "VX.c.0", "continuous")]
jobs += [(s, "EQUS.MINI", s, "raw_symbol") for s in
         ["AAPL", "GOOGL", "TSLA", "AMZN", "META", "MSFT", "NVDA"]]

for name, ds, sym, stype in jobs:
    try:
        data = client.timeseries.get_range(dataset=ds, symbols=[sym], schema="ohlcv-1m",
                                           start=start, end=end, stype_in=stype)
        df = data.to_df()  # indice ts_event em UTC
        df.index = df.index.tz_convert("America/Sao_Paulo")
        df.index.name = "time_brt"
        df = df[["open", "high", "low", "close", "volume"]]
        path = os.path.join(out, f"{name}_1m_BRT.csv")
        df.to_csv(path)
        print(f"OK {name}: {len(df)} candles {df.index.min()} -> {df.index.max()}", flush=True)
    except Exception as e:
        print(f"ERRO {name}: {str(e)[:300]}", flush=True)
