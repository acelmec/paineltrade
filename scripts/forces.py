"""Replica do calculo de forcas do EA SenderSupabase_v2.mq4 a partir de candles M1.

Para cada ativo e cada M1: bid = close do M1; em cada timeframe (M1,M5,M15,M30,H1,H4) olha 6 barras
(shift 0 = barra em formacao ate esse minuto, 1..5 = barras fechadas anteriores) e compara 34 niveis
(pivots) com o bid. compra = 100 * (niveis abaixo do bid) / 210.
"""
import numpy as np, pandas as pd

TFS = [60, 300, 900, 1800, 3600, 14400]  # segundos
TZ = "America/Sao_Paulo"

def load_csv(path):
    d = pd.read_csv(path)
    d.index = pd.to_datetime(d.iloc[:, 0], utc=True).dt.tz_convert(TZ)
    return d[["open", "high", "low", "close"]].astype(float).sort_index()

def _levels_count(h, l, c, bid, digits):
    """h,l,c: arrays (6, N) com NaN onde a barra nao existe; bid: (N,). Retorna dn (N,), up (N,)."""
    valid = (h > 0) & (l > 0) & (c > 0)
    tp = np.where(valid, (h + l + c) / 3.0, np.nan)
    lv = []
    for s in range(5): lv.append(tp[s])
    for s in range(6): lv.append(2 * tp[s] - l[s])
    for s in range(6): lv.append(2 * tp[s] - h[s])
    for s in range(6): lv.append(tp[s] + (h[s] - l[s]))
    for s in range(6): lv.append(tp[s] - (h[s] - l[s]))
    for s in (0, 1, 2, 3, 5): lv.append(2 * tp[s] + (h[s] - 2 * l[s]))
    dn = np.zeros(len(bid)); up = np.zeros(len(bid))
    for v in lv:
        vr = np.round(v, digits)
        ok = ~np.isnan(vr)
        dn += ok & (vr < bid)
        up += ok & (vr > bid)
    return dn, up

def asset_compra(m1, digits=2, broker_utc_offset_h=2):
    """Retorna Series (indice = abertura do M1) com compra 0..100."""
    idx = m1.index
    ep = idx.tz_convert("UTC").as_unit("s").asi8 + broker_utc_offset_h * 3600
    H, L, C = m1["high"].to_numpy(), m1["low"].to_numpy(), m1["close"].to_numpy()
    bid = np.round(C, digits)
    n = len(m1)
    tot_dn = np.zeros(n)
    for tf in TFS:
        key = ep // tf
        df = pd.DataFrame({"k": key, "h": H, "l": L, "c": C})
        g = df.groupby("k", sort=True)
        cmax = g["h"].cummax().to_numpy(); cmin = g["l"].cummin().to_numpy()
        fin = g.agg(h=("h", "max"), l=("l", "min"), c=("c", "last"))
        gi = np.searchsorted(fin.index.to_numpy(), key)  # posicao do grupo
        fh, fl, fc = fin["h"].to_numpy(), fin["l"].to_numpy(), fin["c"].to_numpy()
        h = np.full((6, n), np.nan); l = h.copy(); c = h.copy()
        h[0], l[0], c[0] = cmax, cmin, C
        for s in range(1, 6):
            j = gi - s; ok = j >= 0; jj = np.where(ok, j, 0)
            h[s] = np.where(ok, fh[jj], np.nan); l[s] = np.where(ok, fl[jj], np.nan); c[s] = np.where(ok, fc[jj], np.nan)
        dn, up = _levels_count(h, l, c, bid, digits)
        tot_dn += dn
    comp = np.floor(100.0 * tot_dn / 210.0 + 0.5)
    return pd.Series(comp, index=idx)

TECH_W = {"nvidia": 35.0, "microsoft": 20.0, "apple": 15.0, "amazon": 10.0, "alphabet": 10.0, "meta": 5.0, "tesla": 5.0}
EA = dict(w_nas=35.0, w_vix=20.0, w_sp=15.0, w_usd=10.0, w_tech=20.0, off_nas=60.0, off_vix=25.0, off_sp=15.0, thr=90)

def forca_final(comp, driver_idx, broker_shift_h=5, ea=EA):
    """comp: dict nome -> Series compra (ja alinhada em driver_idx). Retorna DataFrame de saida."""
    nas = comp["nasdaq"]
    vix_c = 100 - comp["vix"]; sp_c = comp["sp500"]; usd_c = 100 - comp["usdindex"]
    sw = sum(TECH_W.values())
    tech = sum(comp[k] * w for k, w in TECH_W.items()) / sw
    bt = driver_idx + pd.Timedelta(hours=broker_shift_h)  # BRT -> hora do servidor da corretora
    opened = (bt.dayofweek != 5) & (bt.dayofweek != 6) & (bt.hour >= 9) & (bt.hour < 16)  # pandas: Sat=5, Sun=6
    opened = pd.Series(opened, index=driver_idx)
    tot = ea["off_nas"] + ea["off_vix"] + ea["off_sp"]
    wn, wv, ws = ea["off_nas"] / tot * 100, ea["off_vix"] / tot * 100, ea["off_sp"] / tot * 100
    f_off = (nas * wn + vix_c * wv + sp_c * ws) / 100.0
    f_on = (nas * ea["w_nas"] + vix_c * ea["w_vix"] + sp_c * ea["w_sp"] + usd_c * ea["w_usd"] + tech * ea["w_tech"]) / 100.0
    f = np.floor(np.where(opened, f_on, f_off) + 0.5)
    out = pd.DataFrame(index=driver_idx)
    for k in ["nasdaq", "sp500", "usdindex", "vix", "nvidia", "microsoft", "apple", "meta", "amazon", "alphabet", "tesla"]:
        out[f"{k}_compra"] = comp[k].astype(int); out[f"{k}_venda"] = (100 - comp[k]).astype(int)
    out["forca_final_compra"] = f.astype(int); out["forca_final_venda"] = (100 - f).astype(int)
    out["direcao"] = np.where(out.forca_final_compra >= ea["thr"], 1, np.where(out.forca_final_venda >= ea["thr"], -1, 0))
    out["nasdaq_aberto"] = opened.to_numpy()
    out["modo"] = np.where(opened, "normal", "off-hours")
    return out
