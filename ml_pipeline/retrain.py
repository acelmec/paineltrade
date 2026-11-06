"""
Script de Retreinamento Periódico do Modelo de Machine Learning para NQ.
Permite re-treinar o modelo com os dados mais recentes do Supabase ou de um arquivo CSV atualizado.

Uso:
  python retrain.py --fetch-supabase
  python retrain.py --csv nq_candles_1m.csv
"""

import os
import argparse
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client
from train_model import train_and_evaluate


def download_latest_candles(output_csv: str = 'nq_candles_1m.csv'):
    load_dotenv()
    url = os.getenv('VITE_SUPABASE_URL')
    key = os.getenv('VITE_SUPABASE_ANON_KEY')
    if not url or not key:
        raise ValueError("Variáveis de ambiente VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não encontradas.")
        
    client = create_client(url, key)
    print("Baixando dados mais recentes da tabela 'painelvm_candles_1m'...")
    all_data = []
    page_size = 1000
    start = 0
    
    while True:
        res = client.table('painelvm_candles_1m')\
            .select('timestamp, open, high, low, close, volume')\
            .or_('instance_id.eq.painel_nasdaq_web,and(instance_id.eq.painel_principal_web,symbol.eq.NQ)')\
            .order('timestamp', desc=False)\
            .range(start, start + page_size - 1)\
            .execute()
        if not res.data:
            break
        all_data.extend(res.data)
        start += page_size
        if len(res.data) < page_size:
            break

    df = pd.DataFrame(all_data)
    df.drop_duplicates(subset=['timestamp'], inplace=True)
    df.sort_values('timestamp', inplace=True)
    df.to_csv(output_csv, index=False)
    print(f"Base atualizada com {len(df)} candles e salva em {output_csv}")


def main():
    parser = argparse.ArgumentParser(description="Retreina o modelo de ML para NQ")
    parser.add_argument('--fetch-supabase', action='store_true', help="Baixa os dados mais recentes do Supabase antes do treino")
    parser.add_argument('--csv', type=str, default='nq_candles_1m.csv', help="Caminho do CSV de candles")
    args = parser.parse_args()

    if args.fetch_supabase:
        download_latest_candles(args.csv)

    print("\nIniciando pipeline de retreinamento...")
    report = train_and_evaluate()
    print("\nRetreinamento concluído com sucesso!")
    print(f"Novo ROC AUC no teste: {report['auc_test']:.4f}")


if __name__ == '__main__':
    main()
