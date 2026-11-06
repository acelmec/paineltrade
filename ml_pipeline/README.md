# Vortex NQ Machine Learning Predictor

Sistema completo de Machine Learning para detecção estatística de movimentos de **+25 pontos (Take Profit)** com controle de risco de **-12 pontos (Stop Loss)** no ativo **NQ (Nasdaq 100 E-mini Futures)** em candles de **1 minuto**.

---

## 📁 Estrutura de Arquivos

```
ml_pipeline/
├── nq_candles_1m.csv           # Base histórica de candles sincronizada do Supabase
├── feature_engineering.py      # Feature engineering point-in-time e Triple Barrier Method
├── train_model.py              # Pipeline de treino (LightGBM, Time-Split, Avaliação, Backtest)
├── nq_indicator.py             # Classe do Indicador de monitoramento em tempo real
├── example_usage.py            # Demonstração de uso em tempo real e benchmark de latência
├── retrain.py                  # Script para retreinamento periódico com sincronização do Supabase
└── models/
    ├── nq_lgb_model.joblib     # Modelo treinado e calibrado
    ├── nq_scaler.joblib        # Scaler robusto ajustado (sem data leakage)
    └── fase1_report.json       # Relatório completo de métricas em formato JSON
```

---

## 🎯 Arquitetura e Metodologia

### 1. Dados de Entrada
- **Fonte:** Tabela `painelvm_candles_1m` (Supabase).
- **Ativo:** NQ (`instance_id`: `painel_principal_web` / `painel_nasdaq_web`).
- **Timeframe:** 1 minuto (OHLCV).
- **Timezone:** `-03:00` (São Paulo) com conversão interna para `America/New_York` para identificação de **RTH (09:30 às 16:00 NY)**.

### 2. Feature Engineering (30+ Features Anti-Leakage)
1. **Anatomia do Candle:** `body`, `upper_wick`, `lower_wick`, `range`, `body_ratio`, `upper_wick_ratio`, `lower_wick_ratio`, `close_position`, `direction`.
2. **Retornos e Momentum:** `return_1`, `return_5`, `return_15`, `return_30`.
3. **Volatilidade:** `atr_14`, `atr_5`, `volatility_ratio`, `range_zscore`.
4. **Contexto Relativo:** `dist_from_sma20`, `dist_from_sma60`, `zscore_20`, `dist_from_high`, `dist_from_low`.
5. **Padrões de Candle:** `hammer`, `shooting_star`, `strong_candle`, `doji`.
6. **Contexto Temporal Cíclico:** `time_sin`, `time_cos` (minuto do dia normalizado em $2\pi$).
7. **Volume:** `volume_sma_20`, `volume_ratio`.

*Nota de Engenharia Financeira:* Para evitar overfitting e viés não-estacionário, os níveis de preços nominais puros (`sma_20`, `session_high`, etc.) foram substituídos por suas versões relativas em distância pontual (`dist_from_sma20`, `dist_from_high`, `dist_from_low`), garantindo estacionariedade entre períodos.

### 3. Target: Triple Barrier Method
- **Take Profit (TP):** $+25.0$ pontos.
- **Stop Loss (SL):** $-12.0$ pontos.
- **Horizonte Temporal:** $30$ candles (30 minutos).
- **Label 1:** TP atingido antes do SL dentro da janela.
- **Label 0:** SL atingido antes do TP dentro da janela.
- **Label -1:** Nenhuma barreira tocada (tempo esgotado — descartado no treino binário).

### 4. Divisão Temporal Estrita (Anti-Leakage)
- **Treino:** Primeiros 70% cronológicos dos candles.
- **Validação:** 15% intermediários cronológicos (utilizados para Early Stopping).
- **Teste OOS (Out-Of-Sample):** 15% mais recentes cronológicos (utilizados estritamente para avaliação e backtest).

---

## 📈 Resultados da Fase 1 (Treinamento e Performance)

- **Total de Candles Históricos:** 24.583 candles (11/09/2026 a 07/10/2026).
- **ROC AUC no Conjunto de Teste (OOS):** **`0.6294`** *(Superou o critério de sucesso > 0.60!)*
- **Distribuição de Classes no RTH:**
  - Label 0 (SL primeiro): 68.24%
  - Label 1 (TP primeiro): 31.76%

### Métricas por Threshold no Conjunto de Teste:

| Threshold | Sinais Gerados | Win Rate | Precisão | Recall | F1-Score | Acurácia Geral |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **0.35** | 181 | 50.83% | 50.83% | 29.97% | 0.3770 | 70.31% |
| **0.40** *(Recomendado)* | 76 | **77.63%** | **77.63%** | 19.22% | 0.3081 | **74.12%** |
| **0.45** | 38 | **92.11%** | **92.11%** | 11.40% | 0.2029 | 73.14% |
| **0.50** | 36 | **91.67%** | **91.67%** | 10.75% | 0.1924 | 72.95% |
| **0.55** | 28 | **100.00%** | **100.00%** | 9.12% | 0.1672 | 72.75% |

### Backtest Financeiro com Custos Reais:
*Custos considerados: Spread (~0.5 pts) + Slippage (~1.0 pt) = **1.5 pontos por trade**.*

| Threshold | Trades | Win Rate | Pontos Brutos | Pontos Líquidos | Ganho Líquido / Trade |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **0.40** | 76 | 77.63% | +1.271,0 pts | **+1.157,00 pts** | **+15,22 pts** |
| **0.45** | 38 | 92.11% | +839,0 pts | **+782,00 pts** | **+20,58 pts** |
| **0.50** | 36 | 91.67% | +789,0 pts | **+735,00 pts** | **+20,42 pts** |
| **0.55** | 28 | 100.00% | +700,0 pts | **+658,00 pts** | **+23,50 pts** |

> Em 1 contrato futuro padrão NQ ($20/pt), +1.157 pontos equivalem a **+$23.140,00 USD** líquidos no período de teste.

### Top Features Mais Importantes:
1. `volume_sma_20`: Volume médio recente institucional
2. `dist_from_low`: Posição relativa em relação à mínima do dia
3. `time_cos` & `time_sin`: Ciclos intradiários de volatilidade
4. `dist_from_high`: Distância da máxima diária
5. `dist_from_sma60`: Afastamento em relação à média móvel longa
6. `atr_14` & `atr_5`: Regime de volatilidade recente

---

## ⚡ Confluência Institucional: Níveis GAMMA de Opções (NQ)

Para aprimorar a previsibilidade de direção e respeitar as barreiras de atração e repulsão do fluxo institucional de market makers (Delta & Gamma Hedging), o pipeline foi expandido integrando os dados da tabela `gamma_levels` (Supabase):

### Features Gamma Incorporadas (Total de 35 features):
1. **`dist_to_hvl`**: Distância pontual ao High Volatility Level (`close - hvl`). Região de pivô de volatilidade.
2. **`dist_to_call_res`**: Distância para a maior resistência de Call (`call_resistance - close`). Teto de liquidez institucional.
3. **`dist_to_put_sup`**: Distância para o maior suporte de Put (`close - put_support`). Piso de liquidez institucional.
4. **`gamma_regime`**: Regime binário (+1 se `close > hvl`, -1 se `close < hvl`).
5. **`headroom_tp25`**: Flag indicando se há espaço livre de pelo menos 25 pontos antes da próxima barreira Gamma.

### Impacto no Modelo:
- **ROC AUC OOS com Gamma:** Subiu de **`0.6294`** para **`0.6474`** (+1.8% de capacidade preditiva direta).
- **Importância:** `dist_to_hvl`, `dist_to_put_sup` e `dist_to_call_res` figuram no Top 10 de importância dos splits da árvore LightGBM.
- **Win Rate (@ Th 0.40):** **82.61%** no teste fora da amostra (superando os 77.63% anteriores).
- **HUD Gráfico:** Exibe em tempo real a distância pontual exata até a **Resistência Gamma** e o **Suporte Gamma**, além do regime e probabilidade.

---

## 🚀 Fase 2: Indicador de Monitoramento em Tempo Real

A classe `NQMovementPredictor` em `ml_pipeline/nq_indicator.py` foi construída para atender aos requisitos de alta performance:

### Requisitos Técnicos e Latência:
- **Latência de Processamento:** **< 35 ms** por candle (superando com folga a meta de < 1.000 ms).
- **Entrada:** Lista de dicionários JSON ou DataFrame contendo os últimos $\ge 100$ candles.
- **Saída:** Dicionário estruturado contendo:
  - `probabilidade_alta`: float (0 a 1)
  - `sinal`: `'COMPRA'` | `'VENDA'` | `'NEUTRO'`
  - `confianca`: float (0 a 1)
  - `features_principais`: Top 3 features com valores e scores de impacto
  - `filtro_status`: Detalhes de liberação ou bloqueio por risco

### Filtros de Qualidade Institucionais Integrados:
1. **Filtro de Horário (RTH):** Opera somente entre 09:30 e 16:00 horário de Nova York.
2. **Volatilidade Mínima:** Exige `ATR_14 >= 8.0` pontos para evitar armadilhas de baixa liquidez.
3. **Distância de Médias:** Bloqueia operações se o preço estiver esticado mais de `80.0` pontos da `SMA_60`.
4. **Limite Diário:** Limita a 3–5 sinais por sessão para governança de capital.

---

## 💻 Como Utilizar

### 1. Executando um Exemplo em Tempo Real
```bash
cd ml_pipeline
python example_usage.py
```

### 2. Integrando em Plataformas ou APIs
```python
from nq_indicator import NQMovementPredictor

predictor = NQMovementPredictor(
    threshold_compra=0.40,
    threshold_venda=0.25,
    min_atr_14=8.0,
    max_dist_sma60=80.0,
    max_trades_per_day=5
)

# Recebendo candles em tempo real (ex: WebSocket ou API Rest)
candles_json = [
    {"timestamp": "2026-10-06T15:00:00-03:00", "open": 31450.0, "high": 31455.5, "low": 31448.0, "close": 31453.0, "volume": 320},
    # ... últimos 100 candles
]

resultado = predictor.analyze_candles(candles_json)
print(resultado)
# Retorno:
# {
#   "probabilidade_alta": 0.4025,
#   "sinal": "COMPRA",
#   "confianca": 0.0041,
#   "features_principais": [...],
#   "filtro_status": "OK",
#   "metricas_filtro": {"rth": True, "atr_14": 12.5, "dist_sma60": 14.2, "trades_hoje": 1}
# }
```

### 3. Como Re-treinar o Modelo Periodicamente
Para sincronizar novos candles diretamente da base do Supabase e retreinar os artefatos:
```bash
python retrain.py --fetch-supabase
```
Ou com arquivo CSV existente:
```bash
python retrain.py --csv nq_candles_1m.csv
```
Recomenda-se executar o retreinamento semanalmente ou a cada 10.000 novos candles para manter o modelo adaptado às mudanças dinâmicas do mercado.
