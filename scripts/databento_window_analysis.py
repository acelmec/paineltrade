"""Apara CSVs para 06/08/2026 -> 10/11/2026 (BRT) e analisa horarios de sessao.
Saida: data/databento/janela_0608_1011/*.csv  + relatorio no stdout.
"""
import os, glob
import pandas as pd

base = os.path.join(os.path.dirname(__file__), "..", "data", "databento")
out = os.path.join(base, "janela_0608_1011")
os.makedirs(out, exist_ok=True)
TZ = "America/Sao_Paulo"
start = pd.Timestamp("2026-08-06 00:00", tz=TZ)
end = pd.Timestamp("2026-11-10 23:59", tz=TZ)
cut = pd.Timestamp("2026-11-01 00:00", tz=TZ)

names = ["NQ", "ES", "DX", "AAPL", "GOOGL", "TSLA", "AMZN", "META", "MSFT", "NVDA",
         "VIXY", "VXX", "UVXY", "SVXY"]
futs = {"NQ", "ES", "DX"}

for n in names:
    df = pd.read_csv(os.path.join(base, f"{n}_1m_BRT.csv"))
    idx = pd.to_datetime(df["time_brt"], utc=True).dt.tz_convert(TZ)
    df = df.drop(columns="time_brt"); df.index = idx; df.index.name = "time_brt"
    df = df[(df.index >= start) & (df.index <= end)].sort_index()
    assert df.index.tz is not None and str(df.index[0].utcoffset()) == "-1 day, 21:00:00"  # -03:00 fixo
    df.to_csv(os.path.join(out, f"{n}_1m_BRT.csv"))
    print(f"\n== {n}: {len(df)} candles {df.index.min():%Y-%m-%d %H:%M} -> {df.index.max():%Y-%m-%d %H:%M} BRT")

    t = df.index.to_series()
    if n in futs:
        gap = t.diff() >= pd.Timedelta(minutes=30)
        sid = gap.cumsum()
        s = t.groupby(sid.values).agg(["min", "max"])
        s = s[s["max"] - s["min"] > pd.Timedelta(hours=4)]  # sessoes reais
        for label, sub in (("ANTES 01/11", s[s["min"] < cut]), ("DEPOIS 01/11", s[s["min"] >= cut])):
            if sub.empty: continue
            print(f"  {label}: abertura (hora BRT) {sub['min'].dt.strftime('%H:%M').value_counts().to_dict()}"
                  f" | fechamento {sub['max'].dt.strftime('%H:%M').value_counts().head(4).to_dict()}")
        print("  Sessoes ao redor da virada:")
        w = s[(s["min"] >= pd.Timestamp('2026-10-28', tz=TZ)) & (s["min"] <= pd.Timestamp('2026-11-04', tz=TZ))]
        for a, r in w.iterrows():
            print(f"    {r['min']:%a %d/%m %H:%M} -> {r['max']:%a %d/%m %H:%M}")
    else:
        g = t.groupby(t.dt.date).agg(["min", "max"])
        g.index = pd.to_datetime(g.index).tz_localize(TZ)
        for label, sub in (("ANTES 01/11", g[g.index < cut]), ("DEPOIS 01/11", g[g.index >= cut])):
            if sub.empty: continue
            print(f"  {label}: 1o candle do dia {sub['min'].dt.strftime('%H:%M').value_counts().head(3).to_dict()}"
                  f" | ultimo {sub['max'].dt.strftime('%H:%M').value_counts().head(3).to_dict()}")
