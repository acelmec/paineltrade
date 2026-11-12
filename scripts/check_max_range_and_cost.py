"""Verifica o prazo maximo disponivel e o custo (em USD) para 1 ano, 2 anos e Maximo (desde 28/03/2023)
para todos os ativos da nossa linha de estudo (NQ, ES, DX/DXY, VIX EQUS.MINI e 7 Techs).
Tambem investiga o historico de DX (IFUS.IMPACT) antes de 06/08/2026.
"""
import os, datetime as dt, databento as db

client = db.Historical(os.environ["DATABENTO_API_KEY"])
end = dt.datetime(2026, 11, 11, 0, 0, tzinfo=dt.timezone.utc)

periods = [
    ("1 ANO (365 dias: 11/11/2025 a 10/11/2026)", end - dt.timedelta(days=365), end),
    ("2 ANOS (730 dias: 11/11/2024 a 10/11/2026)", end - dt.timedelta(days=730), end),
    ("MAXIMO EQUS.MINI (~3,6 anos: 28/03/2023 a 10/11/2026)", dt.datetime(2023, 3, 28, 0, 0, tzinfo=dt.timezone.utc), end),
]

groups = [
    ("Futuros CME (NQ.c.0, ES.c.0)", "GLBX.MDP3", ["NQ.c.0", "ES.c.0"], "continuous"),
    ("DXY Futuro Continuo (DX.c.0)", "IFUS.IMPACT", ["DX.c.0"], "continuous"),
    ("DXY Futuro Parent (DX.FUT)",   "IFUS.IMPACT", ["DX.FUT"], "parent"),
    ("7 Techs + VIX ETFs + UUP (EQUS.MINI)", "EQUS.MINI",
     ["AAPL", "GOOGL", "TSLA", "AMZN", "META", "MSFT", "NVDA", "VXX", "VIXY", "UVXY", "UUP"], "raw_symbol"),
]

print("=== 1. CUSTO E DISPONIBILIDADE POR PERIODO (ohlcv-1m) ===", flush=True)
for p_name, s, e in periods:
    print(f"\n>>> {p_name}:", flush=True)
    tot = 0.0
    for g_name, ds, syms, stype in groups:
        try:
            c = client.metadata.get_cost(dataset=ds, symbols=syms, schema="ohlcv-1m", start=s, end=e, stype_in=stype)
            print(f"  - {g_name:40s}: US$ {c:6.2f}", flush=True)
            if "Parent" not in g_name:
                tot += c
        except Exception as ex:
            print(f"  - {g_name:40s}: ERRO {str(ex)[:150]}", flush=True)
    print(f"  TOTAL ESTIMADO DO PACOTE: US$ {tot:6.2f}", flush=True)

print("\n=== 2. VERIFICANDO COBERTURA REAL DO DXY (IFUS.IMPACT) ANTES DE 06/08/2026 ===", flush=True)
# Testar por que DX.c.0 comecou em 06/08/2026 ou se ha dados em 2025/2026 via DX.c.0 ou DX.FUT
for test_label, s_t, e_t, sym, st in [
    ("DX.c.0 jan/2026 (5 dias)", dt.datetime(2026, 1, 12, tzinfo=dt.timezone.utc), dt.datetime(2026, 1, 17, tzinfo=dt.timezone.utc), ["DX.c.0"], "continuous"),
    ("DX.FUT jan/2026 (5 dias)", dt.datetime(2026, 1, 12, tzinfo=dt.timezone.utc), dt.datetime(2026, 1, 17, tzinfo=dt.timezone.utc), ["DX.FUT"], "parent"),
    ("DX.FUT nov/2025 (5 dias)", dt.datetime(2025, 11, 12, tzinfo=dt.timezone.utc), dt.datetime(2025, 11, 17, tzinfo=dt.timezone.utc), ["DX.FUT"], "parent"),
    ("DX.c.0 jun/2026 (5 dias)", dt.datetime(2026, 6, 1, tzinfo=dt.timezone.utc), dt.datetime(2026, 6, 6, tzinfo=dt.timezone.utc), ["DX.c.0"], "continuous"),
]:
    try:
        c = client.metadata.get_cost(dataset="IFUS.IMPACT", symbols=sym, schema="ohlcv-1m", start=s_t, end=e_t, stype_in=st)
        print(f"  {test_label:30s}: custo = US$ {c:.4f}", flush=True)
    except Exception as ex:
        print(f"  {test_label:30s}: ERRO {str(ex)[:120]}", flush=True)
