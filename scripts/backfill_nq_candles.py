"""Preenche painelvm_candles_1m (NQ, painel_principal_web) de 06/08 ate 16/09 20:48 (BRT)
com NQU6 (GLBX.MDP3) ajustado (diferenca aditiva ate NQZ6), somente onde nao ha registro.
Timestamp da tabela = horario de FECHAMENTO do candle (abertura Databento + 1 min).
Uso: python scripts/backfill_nq_candles.py [--apply]
"""
import sys, requests, pandas as pd
sys.path.insert(0, "scripts")
from supa_util import U, H, fetch_keyset

TZ = "America/Sao_Paulo"
APPLY = "--apply" in sys.argv
INST, SYM = "painel_principal_web", "NQ"
last = pd.Timestamp("2026-09-16 20:48", tz=TZ)
first = pd.Timestamp("2026-08-06 00:01", tz=TZ)

def load(sym):
    d = pd.read_csv(f"data/databento/_{sym}.csv")
    d["ts"] = pd.to_datetime(d.iloc[:, 0], utc=True).dt.tz_convert(TZ)
    return d.set_index("ts")[["open", "high", "low", "close", "volume"]]

u6, z6 = load("NQU6"), load("NQZ6")
# diferenca de ajuste: mediana (Z6 - U6) nos minutos em comum de 15/09 a 16/09 20:48
w = slice(pd.Timestamp("2026-09-15", tz=TZ), last)
j = z6.loc[w].join(u6.loc[w], lsuffix="_z", rsuffix="_u", how="inner")
diff = (j.close_z - j.close_u)
off = round(diff.median() * 4) / 4
print(f"minutos em comum={len(j)} diff mediana={diff.median():.2f} p10={diff.quantile(.1):.2f} p90={diff.quantile(.9):.2f} -> offset={off}")

new = u6[(u6.index >= first) & (u6.index <= last)].copy()
for c in ("open", "high", "low", "close"):
    new[c] = new[c] + off

# existentes na tabela (mesmo instance/symbol) no intervalo
rows = fetch_keyset("painelvm_candles_1m", {"select": "timestamp", "instance_id": f"eq.{INST}", "symbol": f"eq.{SYM}"},
                    "2026-08-05T00:00:00-03:00", until=last.isoformat(), verbose=False)
have = set(pd.to_datetime([r["timestamp"] for r in rows], utc=True))
print(f"ja existem na tabela no intervalo: {len(have)}")
new = new[~new.index.tz_convert("UTC").isin(have)]
print(f"a inserir: {len(new)}  de {new.index.min()} ate {new.index.max()}")
print(new.head(3)); print(new.tail(3))

if APPLY:
    recs = [{"instance_id": INST, "symbol": SYM, "timestamp": ts.isoformat(),
             "open": float(r.open), "high": float(r.high), "low": float(r.low), "close": float(r.close),
             "volume": int(r.volume)} for ts, r in new.iterrows()]
    ok = 0
    for i in range(0, len(recs), 1000):
        r = requests.post(f"{U}/rest/v1/painelvm_candles_1m", headers={**H, "Content-Type": "application/json", "Prefer": "return=minimal"},
                          json=recs[i:i + 1000], timeout=120)
        if r.status_code not in (200, 201, 204):
            print("ERRO", r.status_code, r.text[:300]); break
        ok += len(recs[i:i + 1000]); print("inseridos", ok, flush=True)
