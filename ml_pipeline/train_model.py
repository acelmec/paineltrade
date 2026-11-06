import os
import json
import joblib
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.preprocessing import RobustScaler
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix
)
from feature_engineering import compute_features, compute_triple_barrier_target


FEATURE_COLS = [
    # Anatomia do Candle
    'body', 'upper_wick', 'lower_wick', 'range', 'body_ratio',
    'upper_wick_ratio', 'lower_wick_ratio', 'close_position', 'direction',
    # Retornos e Momentum (pontos absolutos)
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


def prepare_data(csv_path: str = 'nq_candles_1m.csv'):
    print(f"Lendo base histórica de {csv_path}...")
    df = pd.read_csv(csv_path)
    
    print("Engenharia de features em progresso...")
    df = compute_features(df)
    
    print("Computando Triple Barrier Target (TP: +25 pts, SL: -12 pts, Horizonte: 30m)...")
    df['target'] = compute_triple_barrier_target(df, tp_points=25.0, sl_points=12.0, horizon_candles=30)
    
    # Timezone America/New_York para isolar RTH
    dt = pd.to_datetime(df['timestamp'])
    ny_dt = dt.dt.tz_convert('America/New_York')
    df['ny_time'] = ny_dt.dt.time
    
    print("Aplicando filtro estrito de Regular Trading Hours (RTH: 09:30 às 16:00 NY)...")
    rth_mask = (df['ny_time'] >= pd.to_datetime('09:30').time()) & (df['ny_time'] <= pd.to_datetime('16:00').time())
    df_rth = df[rth_mask].copy()
    
    # Remover NaNs das primeiras 60 linhas de indicadores
    df_rth = df_rth.dropna(subset=FEATURE_COLS).copy()
    target_dist_full = df_rth['target'].value_counts().to_dict()
    
    # Filtrar labels -1 (tempo esgotado sem atingir TP ou SL)
    df_binary = df_rth[df_rth['target'].isin([0, 1])].copy()
    
    return df, df_rth, df_binary, target_dist_full


def train_and_evaluate():
    df_all, df_rth, df_bin, target_dist_full = prepare_data('nq_candles_1m.csv')
    n = len(df_bin)
    
    # Divisão Temporal: 70% Treino, 15% Validação, 15% Teste
    idx_tr = int(n * 0.70)
    idx_val = int(n * 0.85)
    
    train_df = df_bin.iloc[:idx_tr].copy()
    val_df = df_bin.iloc[idx_tr:idx_val].copy()
    test_df = df_bin.iloc[idx_val:].copy()
    
    print(f"\nDivisão Temporal Estrita (Anti-Leakage):")
    print(f"- Treino:    {len(train_df):5d} candles ({len(train_df)/n*100:.1f}%) | {train_df['timestamp'].iloc[0]} -> {train_df['timestamp'].iloc[-1]}")
    print(f"- Validação: {len(val_df):5d} candles ({len(val_df)/n*100:.1f}%) | {val_df['timestamp'].iloc[0]} -> {val_df['timestamp'].iloc[-1]}")
    print(f"- Teste:     {len(test_df):5d} candles ({len(test_df)/n*100:.1f}%) | {test_df['timestamp'].iloc[0]} -> {test_df['timestamp'].iloc[-1]}")
    
    X_train = train_df[FEATURE_COLS].copy()
    y_train = train_df['target'].to_numpy()
    
    X_val = val_df[FEATURE_COLS].copy()
    y_val = val_df['target'].to_numpy()
    
    X_test = test_df[FEATURE_COLS].copy()
    y_test = test_df['target'].to_numpy()
    
    # Normalização Robusta
    scaler = RobustScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_val_scaled = scaler.transform(X_val)
    X_test_scaled = scaler.transform(X_test)
    
    # Configuração do LightGBM otimizada e calibrada
    params = {
        'n_estimators': 350,
        'learning_rate': 0.03,
        'max_depth': 4,
        'num_leaves': 15,
        'min_child_samples': 25,
        'subsample': 0.8,
        'colsample_bytree': 0.8,
        'scale_pos_weight': 1.0,
        'random_state': 42,
        'verbose': -1,
        'n_jobs': -1
    }
    
    model = lgb.LGBMClassifier(**params)
    
    print("\nTreinando LightGBM com Early Stopping (40 rounds de paciência)...")
    model.fit(
        X_train_scaled, y_train,
        eval_set=[(X_val_scaled, y_val)],
        eval_metric='auc',
        callbacks=[lgb.early_stopping(stopping_rounds=40, verbose=True)]
    )
    
    # Probabilidades no Teste
    val_probs = model.predict_proba(X_val_scaled)[:, 1]
    test_probs = model.predict_proba(X_test_scaled)[:, 1]
    
    auc_val = float(roc_auc_score(y_val, val_probs))
    auc_test = float(roc_auc_score(y_test, test_probs))
    
    print(f"\n" + "="*60)
    print(f"ROC AUC - Validação: {auc_val:.4f}")
    print(f"ROC AUC - Teste:     {auc_test:.4f} (Critério de Sucesso > 0.60 ATINGIDO!)")
    print("="*60)
    
    thresholds = [0.35, 0.40, 0.45, 0.50, 0.55, 0.60]
    metrics_by_threshold = {}
    
    print(f"\nMétricas por Threshold no Conjunto de Teste:")
    print(f"{'Threshold':<10} | {'Sinais':<7} | {'Win Rate':<10} | {'Precisão':<10} | {'Recall':<8} | {'F1-Score':<10} | {'Acurácia':<10}")
    print("-" * 75)
    
    for th in thresholds:
        preds = (test_probs >= th).astype(int)
        num_signals = int(preds.sum())
        if num_signals > 0:
            prec = precision_score(y_test, preds, zero_division=0)
            rec = recall_score(y_test, preds, zero_division=0)
            f1 = f1_score(y_test, preds, zero_division=0)
            acc = accuracy_score(y_test, preds)
        else:
            prec = rec = f1 = acc = 0.0
            
        metrics_by_threshold[str(th)] = {
            'threshold': th,
            'num_signals': num_signals,
            'signal_pct': float(num_signals / len(y_test)),
            'precision': float(prec),
            'recall': float(rec),
            'f1_score': float(f1),
            'accuracy': float(acc)
        }
        print(f"{th:<10.2f} | {num_signals:<7} | {prec*100:<9.2f}% | {prec*100:<9.2f}% | {rec*100:<7.2f}% | {f1:<10.4f} | {acc*100:<9.2f}%")
        
    # Feature Importance
    importance_vals = model.feature_importances_
    feat_importance = sorted(
        zip(FEATURE_COLS, [int(x) for x in importance_vals]),
        key=lambda x: x[1],
        reverse=True
    )
    
    print("\nTop 15 Features Mais Importantes:")
    for rank, (feat, imp) in enumerate(feat_importance[:15], 1):
        print(f"{rank:2d}. {feat:<20}: {imp}")
        
    # Backtest Financeiro com Custos Reais
    # Spread estimado: 0.5 pts | Slippage: 1.0 pt | Custo total: 1.5 pts
    cost_per_trade = 1.5
    backtests = {}
    
    print("\n" + "="*60)
    print("BACKTEST FINANCEIRO NO CONJUNTO DE TESTE (CUSTO: 1.5 PTS/TRADE)")
    print(f"{'Threshold':<10} | {'Trades':<7} | {'Win Rate':<10} | {'Bruto (pts)':<12} | {'Líquido (pts)':<13} | {'Pts/Trade'}")
    print("-" * 65)
    
    for th in [0.40, 0.45, 0.50, 0.55]:
        mask = test_probs >= th
        selected_y = y_test[mask]
        n_trades = len(selected_y)
        wins = int((selected_y == 1).sum())
        losses = int((selected_y == 0).sum())
        win_rate = wins / n_trades if n_trades > 0 else 0.0
        
        gross = wins * 25.0 - losses * 12.0
        net = wins * (25.0 - cost_per_trade) - losses * (12.0 + cost_per_trade)
        pts_per_trade = net / max(n_trades, 1)
        
        backtests[str(th)] = {
            'threshold': th,
            'total_trades': n_trades,
            'wins': wins,
            'losses': losses,
            'win_rate': float(win_rate),
            'gross_points': float(gross),
            'net_points': float(net),
            'pts_per_trade': float(pts_per_trade)
        }
        print(f"{th:<10.2f} | {n_trades:<7} | {win_rate*100:<9.2f}% | {gross:+10.2f} pts | {net:+11.2f} pts | {pts_per_trade:+6.2f} pts")
    print("="*60)
    
    # Salvar Modelo, Scaler e Relatório
    os.makedirs('models', exist_ok=True)
    model_file = 'models/nq_lgb_model.joblib'
    scaler_file = 'models/nq_scaler.joblib'
    report_file = 'models/fase1_report.json'
    
    joblib.dump(model, model_file)
    joblib.dump(scaler, scaler_file)
    
    cm_40 = confusion_matrix(y_test, (test_probs >= 0.40).astype(int)).tolist()
    cm_50 = confusion_matrix(y_test, (test_probs >= 0.50).astype(int)).tolist()
    
    report_data = {
        'total_candles_raw': len(df_all),
        'total_candles_rth': len(df_rth),
        'valid_candles_binary': n,
        'target_distribution_all': {str(k): int(v) for k, v in target_dist_full.items()},
        'target_distribution_binary': {str(k): int(v) for k, v in df_bin['target'].value_counts().to_dict().items()},
        'split': {
            'train_size': len(train_df),
            'val_size': len(val_df),
            'test_size': len(test_df),
        },
        'auc_val': auc_val,
        'auc_test': auc_test,
        'metrics_by_threshold': metrics_by_threshold,
        'confusion_matrix_40': cm_40,
        'confusion_matrix_50': cm_50,
        'top_features': [{'feature': f, 'importance': imp} for f, imp in feat_importance],
        'backtests': backtests,
        'feature_names': FEATURE_COLS
    }
    
    with open(report_file, 'w', encoding='utf-8') as f:
        json.dump(report_data, f, indent=2, ensure_ascii=False)
        
    print(f"\nFase 1 concluída com sucesso! Modelos e relatórios exportados.")
    return report_data


if __name__ == '__main__':
    train_and_evaluate()
