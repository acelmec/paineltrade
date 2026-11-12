"""Baixa candles 1m de Forex (6E, 6J, RY) da Databento em fatias mensais e salva CSVs em BRT.
Período: 13/07/2026 até hoje (12/11/2026).
"""
import os, sys, time, datetime as dt
import pandas as pd
import databento as db

API_KEY = os.environ.get("DATABENTO_API_KEY", "db-YCERiTd8scsjgd8CQxY9NqnhAJswM")
client = db.Historical(API_KEY)

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "databento")
os.makedirs(OUT_DIR, exist_ok=True)
TZ = "America/Sao_Paulo"

# Datas de fatiamento
# Pega até 14:00 UTC de 12/11/2026 (11:00 BRT de hoje)
target_end = dt.datetime(2026, 11, 12, 14, 0, tzinfo=dt.timezone.utc)
start_overall = dt.datetime(2026, 7, 13, 0, 0, tzinfo=dt.timezone.utc)

def fetch_symbol_chunks(sym, name):
    print(f"\n--- Iniciando download de {name} ({sym}) ---", flush=True)
    csv_path = os.path.join(OUT_DIR, f"{name}_1m_BRT.csv")
    existing_df = pd.DataFrame()
    if os.path.exists(csv_path):
        try:
            existing_df = pd.read_csv(csv_path, index_col=0, parse_dates=True)
            print(f"Arquivo existente encontrado com {len(existing_df)} linhas.", flush=True)
        except Exception:
            existing_df = pd.DataFrame()

    # Cria fatias de 20 dias
    step = dt.timedelta(days=20)
    cur = start_overall
    dfs = []
    if not existing_df.empty:
        dfs.append(existing_df)
        cur = max(cur, existing_df.index.max().tz_convert(dt.timezone.utc) + dt.timedelta(minutes=1))

    while cur < target_end:
        nxt = min(cur + step, target_end)
        print(f"[{name}] Solicitando fatia: {cur.strftime('%Y-%m-%d %H:%M')} até {nxt.strftime('%Y-%m-%d %H:%M')}...", flush=True)
        success = False
        for attempt in range(1, 4):
            try:
                data = client.timeseries.get_range(
                    dataset="GLBX.MDP3",
                    symbols=[sym],
                    schema="ohlcv-1m",
                    start=cur,
                    end=nxt,
                    stype_in="continuous"
                )
                df = data.to_df()
                if not df.empty:
                    df.index = df.index.tz_convert(TZ)
                    df.index.name = "time_brt"
                    df = df[["open", "high", "low", "close", "volume"]]
                    dfs.append(df)
                    print(f"   -> OK: {len(df)} candles recebidos.", flush=True)
                else:
                    print(f"   -> Vazio para o período.", flush=True)
                success = True
                break
            except Exception as e:
                print(f"   [Tentativa {attempt}] Erro: {str(e)[:200]}", flush=True)
                time.sleep(3)
        if not success:
            print(f"Falha ao baixar fatia {cur} a {nxt} após 3 tentativas.", flush=True)
        cur = nxt

    if dfs:
        comb = pd.concat(dfs)
        comb = comb[~comb.index.duplicated(keep="last")].sort_index()
        comb.to_csv(csv_path)
        print(f"Salvo {csv_path}: {len(comb)} candles ({comb.index.min()} a {comb.index.max()})", flush=True)
        return comb
    return pd.DataFrame()

print(f"Iniciando download em fatias seguras: {start_overall} a {target_end}", flush=True)

# 1. 6E (EURUSD)
df_6e = fetch_symbol_chunks("6E.c.0", "EURUSD")

# 2. 6J (JPY)
df_6j = fetch_symbol_chunks("6J.c.0", "6J_RAW")
if not df_6j.empty:
    print("\nDerivando USDJPY a partir de 6J_RAW...", flush=True)
    usdjpy_df = pd.DataFrame(index=df_6j.index)
    usdjpy_df["open"] = (1.0 / df_6j["open"]).round(3)
    usdjpy_df["high"] = (1.0 / df_6j["low"]).round(3)
    usdjpy_df["low"] = (1.0 / df_6j["high"]).round(3)
    usdjpy_df["close"] = (1.0 / df_6j["close"]).round(3)
    usdjpy_df["volume"] = df_6j["volume"]
    usdjpy_path = os.path.join(OUT_DIR, "USDJPY_1m_BRT.csv")
    usdjpy_df.to_csv(usdjpy_path)
    print(f"Salvo USDJPY_1m_BRT.csv: {len(usdjpy_df)} candles ({usdjpy_df.index.min()} a {usdjpy_df.index.max()})", flush=True)

# 3. RY (EURJPY)
df_ry = fetch_symbol_chunks("RY.c.0", "RY_RAW")

# Sintetizar/enriquecer EURJPY com 6E e USDJPY
print("\nGerando EURJPY enriquecido com cross rate...", flush=True)
eurusd_csv = os.path.join(OUT_DIR, "EURUSD_1m_BRT.csv")
usdjpy_csv = os.path.join(OUT_DIR, "USDJPY_1m_BRT.csv")
if os.path.exists(eurusd_csv) and os.path.exists(usdjpy_csv):
    d_eu = pd.read_csv(eurusd_csv, index_col=0, parse_dates=True)
    d_uj = pd.read_csv(usdjpy_csv, index_col=0, parse_dates=True)
    base_idx = d_eu.index.union(d_uj.index)
    if not df_ry.empty:
        base_idx = base_idx.union(df_ry.index)
    base_idx = base_idx.sort_values()

    c_eu = d_eu["close"].reindex(base_idx).ffill()
    c_uj = d_uj["close"].reindex(base_idx).ffill()
    cross_close = (c_eu * c_uj).round(3)

    eurjpy_df = pd.DataFrame(index=base_idx)
    if not df_ry.empty:
        eurjpy_df["close"] = df_ry["close"].reindex(base_idx).fillna(cross_close).ffill().bfill()
        eurjpy_df["open"] = df_ry["open"].reindex(base_idx).fillna(eurjpy_df["close"])
        eurjpy_df["high"] = df_ry["high"].reindex(base_idx).fillna(eurjpy_df["close"])
        eurjpy_df["low"] = df_ry["low"].reindex(base_idx).fillna(eurjpy_df["close"])
        eurjpy_df["volume"] = df_ry["volume"].reindex(base_idx).fillna(0)
    else:
        eurjpy_df["close"] = cross_close.ffill().bfill()
        eurjpy_df["open"] = eurjpy_df["close"]
        eurjpy_df["high"] = eurjpy_df["close"]
        eurjpy_df["low"] = eurjpy_df["close"]
        eurjpy_df["volume"] = 0

    eurjpy_df["high"] = eurjpy_df[["open", "high", "low", "close"]].max(axis=1)
    eurjpy_df["low"] = eurjpy_df[["open", "high", "low", "close"]].min(axis=1)
    eurjpy_path = os.path.join(OUT_DIR, "EURJPY_1m_BRT.csv")
    eurjpy_df.to_csv(eurjpy_path)
    print(f"Salvo EURJPY_1m_BRT.csv: {len(eurjpy_df)} candles ({eurjpy_df.index.min()} a {eurjpy_df.index.max()})", flush=True)

print("\nTODOS OS CSVS DE FOREX BAIXADOS E PROCESSADOS COM SUCESSO!", flush=True)
