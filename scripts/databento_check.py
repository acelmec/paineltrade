"""Verifica disponibilidade/custo de candles 1m (ohlcv-1m) na Databento.
Uso: $env:DATABENTO_API_KEY="db-..."; python scripts/databento_check.py [dias]
"""
import os, sys, datetime as dt
import databento as db

days = int(sys.argv[1]) if len(sys.argv) > 1 else 90
client = db.Historical(os.environ["DATABENTO_API_KEY"])

print("Datasets:", client.metadata.list_datasets())

end = dt.datetime.now(dt.timezone.utc).replace(second=0, microsecond=0) - dt.timedelta(days=1)
start = end - dt.timedelta(days=days)

# (dataset, symbols, stype_in)
groups = [
    ("GLBX.MDP3", ["NQ.c.0", "ES.c.0"], "continuous"),
    ("XNAS.ITCH", ["AAPL", "GOOGL", "TSLA", "AMZN", "META", "MSFT"], "raw_symbol"),
    ("GLBX.MDP3", ["VX.c.0"], "continuous"),  # VIX futures (CFE nao esta em GLBX; deve falhar)
]
for ds, syms, stype in groups:
    try:
        rng = client.metadata.get_dataset_range(dataset=ds)
        cost = client.metadata.get_cost(dataset=ds, symbols=syms, schema="ohlcv-1m",
                                        start=start, end=end, stype_in=stype)
        print(f"{ds} {syms}: range={rng['start']}..{rng['end']} custo_USD={cost}")
    except Exception as e:
        print(f"{ds} {syms}: ERRO {type(e).__name__}: {str(e)[:300]}")
