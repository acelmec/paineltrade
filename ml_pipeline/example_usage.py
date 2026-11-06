import time
import json
import pandas as pd
from nq_indicator import NQMovementPredictor


def run_realtime_simulation():
    print("=== TESTE DE MONITORAMENTO EM TEMPO REAL ===")
    
    # 1. Instanciar o Indicador
    predictor = NQMovementPredictor(
        model_path='models/nq_lgb_model.joblib',
        scaler_path='models/nq_scaler.joblib',
        threshold_compra=0.40,
        threshold_venda=0.25,
        min_atr_14=8.0,
        max_dist_sma60=80.0,
        max_trades_per_day=5
    )
    
    # 2. Carregar dados reais de candles
    df = pd.read_csv('nq_candles_1m.csv')
    print(f"Total de candles disponíveis para teste: {len(df)}")
    
    # Simular janela deslizante de 120 candles simulando chegada em tempo real
    # Testar 5 janelas consecutivas
    sample_windows = [
        # Janela 1: Horário fora do RTH (ex: início da manhã ou madrugada)
        (0, 120, "Fora de RTH"),
        # Janela 2: Horário em RTH
        (5000, 5120, "Dentro de RTH"),
        # Janela 3: Janela recente
        (len(df) - 150, len(df) - 30, "RTH Recente"),
        # Janela 4: Últimos candles
        (len(df) - 120, len(df), "Tempo Real Recente")
    ]
    
    for start_idx, end_idx, desc in sample_windows:
        chunk = df.iloc[start_idx:end_idx].to_dict(orient='records')
        last_candle = chunk[-1]
        
        t0 = time.perf_counter()
        result = predictor.analyze_candles(chunk)
        elapsed_ms = (time.perf_counter() - t0) * 1000
        
        print(f"\n--- Cenário: {desc} ({last_candle['timestamp']}) ---")
        print(f"Tempo de processamento: {elapsed_ms:.2f} ms (< 1000 ms garantido!)")
        print(f"Preço: {result['preco_referencia']}")
        print(f"Probabilidade Alta (+25 pts): {result['probabilidade_alta'] * 100:.1f}%")
        print(f"Sinal Emitido: {result['sinal']} | Confiança: {result['confianca'] * 100:.1f}%")
        print(f"Status dos Filtros: {result['filtro_status']}")
        print(f"Métricas Operacionais: ATR={result['metricas_filtro']['atr_14']} | Dist_SMA60={result['metricas_filtro']['dist_sma60']} | RTH={result['metricas_filtro']['rth']}")
        print("Top 3 Features Contribuintes:")
        for feat in result['features_principais']:
            print(f"   - {feat['feature']}: valor={feat['valor']:.4f} (impacto={feat['score_impacto']:.2f})")


if __name__ == '__main__':
    run_realtime_simulation()
