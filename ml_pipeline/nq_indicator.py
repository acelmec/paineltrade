import os
import json
import joblib
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Union
from feature_engineering import compute_features

# Features requeridas pelo modelo em ordem exata
FEATURE_COLS = [
    # Anatomia do Candle
    'body', 'upper_wick', 'lower_wick', 'range', 'body_ratio',
    'upper_wick_ratio', 'lower_wick_ratio', 'close_position', 'direction',
    # Retornos e Momentum
    'return_1', 'return_5', 'return_15', 'return_30',
    # Volatilidade
    'atr_14', 'atr_5', 'volatility_ratio', 'range_zscore',
    # Contexto Relativo
    'dist_from_sma20', 'dist_from_sma60', 'zscore_20',
    'dist_from_high', 'dist_from_low',
    # Padrões de Candle
    'hammer', 'shooting_star', 'strong_candle', 'doji',
    # Contexto Temporal Cíclico
    'time_sin', 'time_cos',
    # Volume
    'volume_sma_20', 'volume_ratio'
]


class NQMovementPredictor:
    """
    Indicador de Monitoramento em Tempo Real para NQ (Nasdaq Futures).
    - Avalia os últimos N candles (mínimo 100).
    - Aplica o modelo LightGBM treinado com Triple Barrier (+25 pts / -12 pts).
    - Aplica filtros de qualidade institucionais (RTH, Volatilidade Mínima, Distância SMA60, Trades/Dia).
    """

    def __init__(
        self,
        model_path: str = 'models/nq_lgb_model.joblib',
        scaler_path: str = 'models/nq_scaler.joblib',
        threshold_compra: float = 0.40,
        threshold_venda: float = 0.25,
        min_atr_14: float = 8.0,
        max_dist_sma60: float = 80.0,
        max_trades_per_day: int = 5
    ):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        full_model_path = os.path.join(base_dir, model_path) if not os.path.isabs(model_path) else model_path
        full_scaler_path = os.path.join(base_dir, scaler_path) if not os.path.isabs(scaler_path) else scaler_path

        if not os.path.exists(full_model_path):
            raise FileNotFoundError(f"Arquivo de modelo não encontrado: {full_model_path}")
        if not os.path.exists(full_scaler_path):
            raise FileNotFoundError(f"Arquivo de scaler não encontrado: {full_scaler_path}")

        self.model = joblib.load(full_model_path)
        self.scaler = joblib.load(full_scaler_path)
        
        # Parâmetros e Filtros Operacionais
        self.threshold_compra = threshold_compra
        self.threshold_venda = threshold_venda
        self.min_atr_14 = min_atr_14
        self.max_dist_sma60 = max_dist_sma60
        self.max_trades_per_day = max_trades_per_day

        # Controle de estado intradiário
        self.daily_trade_counts: Dict[str, int] = {}
        self.last_signal_timestamp: str = ""

    def _is_rth(self, timestamp_str: str) -> bool:
        """Verifica se está no horário RTH (09:30 às 16:00 horário de Nova York)."""
        dt = pd.to_datetime(timestamp_str)
        # Se timezone não especificado, assume -03:00 (São Paulo / B3)
        if dt.tzinfo is None:
            dt = dt.tz_localize('-03:00')
        ny_dt = dt.tz_convert('America/New_York')
        ny_time = ny_dt.time()
        rth_start = pd.to_datetime('09:30').time()
        rth_end = pd.to_datetime('16:00').time()
        return rth_start <= ny_time <= rth_end

    def _get_trade_day(self, timestamp_str: str) -> str:
        """Retorna a data no timezone de Nova York para controle diário de trades."""
        dt = pd.to_datetime(timestamp_str)
        if dt.tzinfo is None:
            dt = dt.tz_localize('-03:00')
        ny_dt = dt.tz_convert('America/New_York')
        return ny_dt.strftime('%Y-%m-%d')

    def analyze_candles(self, candles: Union[List[Dict[str, Any]], pd.DataFrame]) -> Dict[str, Any]:
        """
        Recebe os últimos N candles (mínimo 100) no formato JSON/lista de dicts ou DataFrame.
        Retorna dicionário contendo probabilidade de alta, sinal, confiança e top features.
        """
        if isinstance(candles, list):
            if len(candles) < 70:
                raise ValueError(f"Mínimo de 70 candles necessários para calcular médias de 60 períodos. Recebido: {len(candles)}")
            df = pd.DataFrame(candles)
        elif isinstance(candles, pd.DataFrame):
            df = candles.copy()
        else:
            raise TypeError("Entrada deve ser list de dicionários ou pandas.DataFrame.")

        # Garantir colunas obrigatórias
        required_raw_cols = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
        for col in required_raw_cols:
            if col not in df.columns:
                raise ValueError(f"Coluna obrigatória ausente nos candles: {col}")

        # Ordenar cronologicamente
        df = df.sort_values('timestamp').reset_index(drop=True)

        # 1. Feature Engineering
        featured_df = compute_features(df)
        last_row = featured_df.iloc[-1]
        last_ts = str(last_row['timestamp'])
        current_day = self._get_trade_day(last_ts)

        # 2. Extração e Normalização das Features do último candle
        X_last = featured_df[FEATURE_COLS].iloc[-1:].copy()
        
        # Verificar se algum NaN residual ocorreu
        if X_last.isna().any().any():
            return {
                'probabilidade_alta': 0.0,
                'sinal': 'NEUTRO',
                'confianca': 0.0,
                'features_principais': [],
                'motivo_filtro': 'Histórico insuficiente para cálculo de todos os indicadores móveis'
            }

        X_scaled = self.scaler.transform(X_last)

        # 3. Inferência do Modelo
        prob_alta = float(self.model.predict_proba(X_scaled)[0, 1])
        prob_baixa = 1.0 - prob_alta

        # 4. Top 3 Features que mais contribuíram
        # Combina importância das features com o desvio padronizado relativo
        raw_deviations = np.abs(X_scaled[0])
        importances = self.model.feature_importances_
        feature_scores = raw_deviations * (importances + 1)
        top_indices = np.argsort(feature_scores)[::-1][:3]
        top_features = [
            {
                'feature': FEATURE_COLS[i],
                'valor': float(X_last.iloc[0][FEATURE_COLS[i]]),
                'score_impacto': float(feature_scores[i])
            }
            for i in top_indices
        ]

        # 5. Aplicação dos Filtros de Qualidade (OBRIGATÓRIO)
        filtros_violados = []

        # Filtro 1: Horário RTH (09:30 às 16:00 Nova York)
        is_rth_active = self._is_rth(last_ts)
        if not is_rth_active:
            filtros_violados.append('FORA_RTH (Operar somente 09:30 - 16:00 NY)')

        # Filtro 2: Volatilidade Mínima (ATR_14 > min_atr_14)
        atr_14_val = float(last_row['atr_14'])
        if atr_14_val < self.min_atr_14:
            filtros_violados.append(f'BAIXA_VOLATILIDADE (ATR_14: {atr_14_val:.2f} < {self.min_atr_14:.2f})')

        # Filtro 3: Distância de Médias (Não operar muito esticado da SMA60)
        dist_sma60_val = abs(float(last_row['dist_from_sma60']))
        if dist_sma60_val > self.max_dist_sma60:
            filtros_violados.append(f'PRECO_ESTICADO_SMA60 (Dist: {dist_sma60_val:.2f} > {self.max_dist_sma60:.2f})')

        # Filtro 4: Máximo de Trades Diários
        day_trades = self.daily_trade_counts.get(current_day, 0)
        if day_trades >= self.max_trades_per_day:
            filtros_violados.append(f'LIMITE_DIARIO_ATINGIDO ({day_trades}/{self.max_trades_per_day} trades)')

        # 6. Lógica de Sinalização e Confiança
        if prob_alta >= self.threshold_compra:
            sinal_proposto = 'COMPRA'
            confianca = float((prob_alta - self.threshold_compra) / (1.0 - self.threshold_compra))
        elif prob_alta <= self.threshold_venda:
            sinal_proposto = 'VENDA'
            confianca = float((self.threshold_venda - prob_alta) / self.threshold_venda)
        else:
            sinal_proposto = 'NEUTRO'
            confianca = 0.0

        # Aplica filtros se houver sinal ativo
        sinal_final = sinal_proposto
        filtro_status = "OK"

        if sinal_proposto in ['COMPRA', 'VENDA'] and len(filtros_violados) > 0:
            sinal_final = 'NEUTRO'
            filtro_status = f"BLOQUEADO: {', '.join(filtros_violados)}"
        elif sinal_final in ['COMPRA', 'VENDA']:
            # Registra trade do dia se for um novo candle
            if last_ts != self.last_signal_timestamp:
                self.daily_trade_counts[current_day] = day_trades + 1
                self.last_signal_timestamp = last_ts

        return {
            'probabilidade_alta': round(prob_alta, 4),
            'sinal': sinal_final,
            'confianca': round(confianca, 4),
            'features_principais': top_features,
            'preco_referencia': float(last_row['close']),
            'filtro_status': filtro_status,
            'metricas_filtro': {
                'rth': is_rth_active,
                'atr_14': round(atr_14_val, 2),
                'dist_sma60': round(dist_sma60_val, 2),
                'trades_hoje': self.daily_trade_counts.get(current_day, 0)
            }
        }
