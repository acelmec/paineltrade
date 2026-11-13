"""Baixa dados de trades (tick-a-tick) da Databento e converte no formato de importacao do NinjaTrader 8:
Formato: yyyyMMdd HHmmss ffffff;price;volume
Fuso Horario: America/Sao_Paulo (UTC-03:00 Brasilia)
Arquivos de saida: data/ninja_import/MNQ 12-26.txt e data/ninja_import/MES 12-26.txt

Uso: python scripts/download_ninja_ticks.py --api-key="db-..." [--days=120]
"""
import os, sys, time, gc, argparse, datetime as dt
import pandas as pd
import databento as db

TZ = "America/Sao_Paulo"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "ninja_import")
os.makedirs(OUT_DIR, exist_ok=True)

def parse_args():
    parser = argparse.ArgumentParser(description="Download tick data for NinjaTrader 8")
    parser.add_argument("--api-key", type=str, default=os.environ.get("DATABENTO_API_KEY", ""), help="Databento API Key")
    parser.add_argument("--days", type=int, default=120, help="Numero de dias historicos (padrao: 120)")
    parser.add_argument("--symbol", type=str, default="", help="Filtrar por simbolo (ex: MNQ)")
    parser.add_argument("--slice-days", type=float, default=3.5, help="Tamanho da fatia em dias")
    parser.add_argument("--estimate-only", action="store_true", help="Apenas estima custo e tamanho sem baixar")
    return parser.parse_args()

def get_last_timestamp_from_file(file_path):
    """Lê a última linha do arquivo TXT e retorna o timestamp correspondente em UTC."""
    if not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
        return None
    try:
        with open(file_path, "rb") as f:
            f.seek(max(0, os.path.getsize(file_path) - 2048))
            lines = f.read().decode("utf-8", errors="ignore").strip().splitlines()
            if not lines:
                return None
            last_line = lines[-1].strip()
            # Formato esperado: yyyyMMdd HHmmss ffffff;price;volume ou yyyyMMdd HHmmss;price;volume
            ts_part = last_line.split(";")[0].strip()
            # Converte para datetime no fuso de Brasília
            if " " in ts_part:
                parts = ts_part.split(" ")
                date_str = parts[0]
                time_str = parts[1]
                usec_str = parts[2] if len(parts) > 2 else "0"
                dt_str = f"{date_str} {time_str}.{usec_str.ljust(6, '0')}"
                dt_brt = pd.to_datetime(dt_str, format="%Y%m%d %H%M%S.%f").tz_localize(TZ)
                return dt_brt.tz_convert(dt.timezone.utc)
    except Exception as e:
        print(f"   [Aviso] Nao foi possivel determinar ultimo timestamp do arquivo: {e}", flush=True)
    return None

def main():
    args = parse_args()
    api_key = args.api_key.strip()
    if not api_key:
        print("ERRO: Nenhuma API Key informada. Use --api-key='db-...' ou defina $env:DATABENTO_API_KEY.", flush=True)
        sys.exit(1)

    client = db.Historical(api_key)

    end = dt.datetime.now(dt.timezone.utc).replace(second=0, microsecond=0) - dt.timedelta(minutes=15)
    start = end - dt.timedelta(days=args.days)

    print(f"Janela de consulta total: {start.strftime('%Y-%m-%d %H:%M')} a {end.strftime('%Y-%m-%d %H:%M')} UTC ({args.days} dias)", flush=True)

    instruments = [
        {"name": "MNQ 12-26", "sym": "NQ.c.0", "ninja_name": "MNQ 12-26.txt", "digits": 2},
        {"name": "MES 12-26", "sym": "ES.c.0", "ninja_name": "MES 12-26.txt", "digits": 2},
    ]

    if args.symbol:
        instruments = [i for i in instruments if args.symbol.upper() in i["name"].upper() or args.symbol.upper() in i["sym"].upper()]
        if not instruments:
            print(f"ERRO: Nenhum instrumento encontrado para o filtro '{args.symbol}'", flush=True)
            sys.exit(1)

    if args.estimate_only:
        print("\n--- Estimativa de Custo e Tamanho (schema: trades) ---", flush=True)
        total_cost = 0.0
        for inst in instruments:
            try:
                sz = client.metadata.get_billable_size(
                    dataset="GLBX.MDP3",
                    symbols=[inst["sym"]],
                    schema="trades",
                    start=start,
                    end=end,
                    stype_in="continuous"
                )
                cost = client.metadata.get_cost(
                    dataset="GLBX.MDP3",
                    symbols=[inst["sym"]],
                    schema="trades",
                    start=start,
                    end=end,
                    stype_in="continuous"
                )
                total_cost += cost
                print(f"[{inst['name']}] Tamanho comprimido: {sz/(1024*1024):.1f} MB | Custo estimado: ${cost:.2f} USD", flush=True)
            except Exception as e:
                print(f"[{inst['name']}] Erro: {e}", flush=True)
        print(f"\nCusto Total Estimado: ${total_cost:.2f} USD", flush=True)
        return

    # Download em fatias com retries e pausa para sincronização de billing
    step = dt.timedelta(days=args.slice_days)
    for inst in instruments:
        print(f"\n=======================================================", flush=True)
        print(f"Iniciando download e formatacao de {inst['name']}...", flush=True)
        out_file = os.path.join(OUT_DIR, inst["ninja_name"])
        
        # Verifica se já há dados gravados para continuar de onde parou
        last_ts_utc = get_last_timestamp_from_file(out_file)
        if last_ts_utc and last_ts_utc > start:
            cur = last_ts_utc + dt.timedelta(microseconds=1)
            mode = "a"
            print(f"   [RESUME ATIVO] Arquivo existente detectado ({os.path.getsize(out_file)/(1024*1024):.1f} MB). Continuando a partir de {cur.strftime('%Y-%m-%d %H:%M:%S')} UTC...", flush=True)
        else:
            cur = start
            mode = "w"
            print(f"   Iniciando arquivo novo do zero em: {out_file}", flush=True)

        with open(out_file, mode, encoding="utf-8") as f_out:
            while cur < end:
                nxt = min(cur + step, end)
                print(f"   Fatia: {cur.strftime('%Y-%m-%d %H:%M')} a {nxt.strftime('%Y-%m-%d %H:%M')}...", end="", flush=True)
                success = False
                end_reached = False
                for attempt in range(1, 8):
                    try:
                        data = client.timeseries.get_range(
                            dataset="GLBX.MDP3",
                            symbols=[inst["sym"]],
                            schema="trades",
                            start=cur,
                            end=nxt,
                            stype_in="continuous"
                        )
                        df = data.to_df()
                        total_ticks = len(df)
                        if total_ticks > 0:
                            df.index = df.index.tz_convert(TZ)
                            ts_str = df.index.strftime("%Y%m%d %H%M%S %f")
                            price_str = df["price"].apply(lambda p: f"{p:.{inst['digits']}f}")
                            vol_str = df["size"].astype(int).astype(str)
                            
                            lines = ts_str + ";" + price_str + ";" + vol_str + "\n"
                            f_out.writelines(lines)
                            f_out.flush()
                            print(f" OK: {total_ticks:,} ticks", flush=True)
                        else:
                            print(" (sem trades)", flush=True)
                        del data, df
                        gc.collect()
                        success = True
                        # Pausa de 5 segundos para liquidação contínua do billing na Databento
                        time.sleep(5)
                        break
                    except Exception as ex:
                        err_str = str(ex)
                        if "422" in err_str and "unavailable_range" in err_str:
                            print(f" [Aviso: Dados D-0 ao vivo exigem subscrição em tempo real. Histórico finalizado com sucesso até {cur.strftime('%Y-%m-%d %H:%M')} UTC]", flush=True)
                            success = True
                            end_reached = True
                            break
                        
                        # Se for 402 temporário de billing lock, aguarda liberação
                        if "402" in err_str:
                            wait_sec = 15 + attempt * 10
                        else:
                            wait_sec = attempt * 8
                            
                        print(f" [tentativa {attempt} erro: {err_str[:90]} - aguardando {wait_sec}s]", end="", flush=True)
                        gc.collect()
                        time.sleep(wait_sec)
                
                if end_reached:
                    break

                if not success:
                    print(f"\n   [Falha definitiva na fatia {cur} a {nxt}. Interrompendo este ativo para preservação de dados.]", flush=True)
                    break
                cur = nxt

        sz_mb = os.path.getsize(out_file) / (1024 * 1024)
        print(f"Finalizado {inst['name']}! Salvo em: {out_file} ({sz_mb:.1f} MB)", flush=True)

    print("\nProcesso concluido! Arquivos prontos para importar no NinjaTrader 8.")

if __name__ == "__main__":
    main()
