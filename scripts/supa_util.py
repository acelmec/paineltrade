import os, sys, requests, pandas as pd
env = {}
for l in open(os.path.join(os.path.dirname(__file__), "..", ".env"), encoding="utf-8"):
    if "=" in l and not l.startswith("#"):
        k, v = l.strip().split("=", 1); env[k] = v.strip('"')
U = env["VITE_SUPABASE_URL"]; K = env["VITE_SUPABASE_ANON_KEY"]
H = {"apikey": K, "Authorization": "Bearer " + K}

def fetch_keyset(table, base_params, since, until=None, page=1000, verbose=True):
    """Paginacao por keyset (timestamp > ultimo), chunk <= 1000."""
    rows, cur = [], since
    while True:
        p = dict(base_params); p["order"] = "timestamp.asc"; p["limit"] = page
        conds = [("timestamp", f"gt.{cur}")]
        if until: conds.append(("timestamp", f"lte.{until}"))
        r = requests.get(f"{U}/rest/v1/{table}", headers=H, params=list(p.items()) + conds, timeout=60)
        r.raise_for_status()
        d = r.json(); rows += d
        if verbose: print(len(rows), d[-1]["timestamp"] if d else "-", flush=True)
        if len(d) < page: break
        cur = d[-1]["timestamp"]
    return rows

if __name__ == "__main__":
    rows = fetch_keyset("painelvm_candles_1m",
                        {"select": "timestamp,open,high,low,close,volume", "instance_id": "eq.painel_principal_web", "symbol": "eq.NQ"},
                        "2026-08-01T00:00:00-03:00")
    df = pd.DataFrame(rows); df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_convert("America/Sao_Paulo")
    df.to_csv(os.path.join(os.path.dirname(__file__), "..", "data", "databento", "_table_nq_candles.csv"), index=False)
    print("TOTAL", len(df), df.timestamp.min(), df.timestamp.max())
    print(df.groupby(df.timestamp.dt.date).size().to_string())
