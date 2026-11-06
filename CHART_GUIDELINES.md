# VortexWeb — Diretrizes de Integridade do Motor Gráfico e Prevenção de Falhas

Este documento estabelece as **Diretrizes Obrigatórias de Desenvolvimento e Verificação** para qualquer manipulação de dados de mercado (Candles, Ticks, Feeds), Indicadores Técnicos e Renderização com o **TradingView Lightweight Charts** no VortexWeb.

---

## 1. Princípios Fundamentais do Motor Gráfico

1. **A Escala Vertical é Sagrada (Zero Tolerância a Spikes e Ticks Fantasmas):**
   - Um único tick ou candle corrompido (ex: `low: 0` ou `close: 1.0` quando o ativo vale 21.000) deforma toda a escala de preços do Lightweight Charts, achatando todas as velas normais no topo e quebrando o cálculo de médias móveis.
   - Todo fluxo de entrada de dados DEVE ser sanitizado antes de tocar o estado da aplicação ou a biblioteca gráfica.

2. **Sincronização Absoluta de Séries e Escala Temporal:**
   - Todas as séries anexadas ao gráfico (Linhas, Candlesticks, Histogramas) compartilham o mesmo eixo temporal (`timeScale`).
   - Se uma série contiver timestamps de outro *timeframe*, pontos desordenados ou ficar sem atualização quando desativada, a passagem do cursor do mouse disparará falhas internas irrecuperáveis (`Error: Value is null` em `SeriesBarColorer`).

3. **Nenhum Marcador ou Coordenada sem Escala Consolidada:**
   - Tentar posicionar marcadores de ordens (`setMarkers`) ou converter preços em pixels antes da primeira vela ser consolidada causa exceção de ponteiro nulo no motor gráfico.

---

## 2. Padrões Obrigatórios de Código

### A. Ingestão de Candles (Supabase, Streamer Local NT8 e Replay)
Todo array de candles retornado por funções de banco ou WebSocket DEVE passar obrigatoriamente pela higienização centralizada:

```typescript
import { cleanAndSanitizeCandles } from '../services/db';

// Correto:
const rawCandles = await fetchRawData();
return cleanAndSanitizeCandles(rawCandles);
```

**Regras aplicadas pelo `cleanAndSanitizeCandles`:**
- **Sanidade Numérica:** Rejeita `NaN`, `null`, `undefined`, valores `<= 0` e infinitos em Open, High, Low, Close e Timestamp.
- **Detecção de Aberrações / Mediana:** Rejeita candles com desvio > 35% em relação à mediana da série.
- **Supressão de Saltos Isolados:** Descarte de variações anômalas > 8% em 1 minuto que revertem imediatamente.
- **Trava de Pavios Excessivos (Anti-Wick):** Limita o alcance de máximas e mínimas aberrantes a margens coerentes com o corpo do candle (máx 80 pts / 1.5%).

---

### B. Séries de Linhas e Histogramas (SMA, EMA, RSI, MACD, Waddah, Time Heatmap)
Ao enviar dados para qualquer `LineSeries` ou `HistogramSeries`, os dados DEVEM ser tratados por `sanitizeLineSeriesData`:

```typescript
import { sanitizeLineSeriesData } from '../utils/indicatorRegistry';

// Correto:
const safeData = sanitizeLineSeriesData(rawIndicatorData);
```

**Regras aplicadas pelo `sanitizeLineSeriesData`:**
- Garante ordem temporal estritamente crescente (`time > lastTime`).
- Remove qualquer propriedade indesejada com valor `null` ou `undefined` que quebre o formatador de cores do Lightweight Charts.
- Constrói exclusivamente o contrato limpo `{ time: number, value: number, color?: string }`.

---

### C. Gestão de Estado de Indicadores no `CandleChart.tsx`
Toda série de indicador DEVE possuir ramificação de limpeza explícita quando desativada ou sem dados válidos:

```typescript
// PADRÃO OBRIGATÓRIO:
if (indicatorSeriesRef.current) {
  const safeData = (effectiveShowIndicator && rawData) 
    ? sanitizeLineSeriesData(rawData) 
    : [];

  if (safeData.length > 0) {
    if (isSameCandle) {
      try {
        const lastPoint = safeData[safeData.length - 1];
        if (lastPoint && typeof lastPoint.value === 'number' && !isNaN(lastPoint.value)) {
          indicatorSeriesRef.current.update(lastPoint);
        }
      } catch (_) {
        try { indicatorSeriesRef.current.setData(safeData as any); } catch (_) {}
      }
    } else {
      try { indicatorSeriesRef.current.setData(safeData as any); } catch (_) {}
    }
  } else {
    // ⚠️ MANDATÓRIO: Se desativado ou vazio, limpar explicitamente
    try { indicatorSeriesRef.current.setData([]); } catch (_) {}
  }
}
```

---

### D. Formação da Vela em Tempo Real (`applyRealtimePriceToCandles`)
Ao processar ticks de mercado na vela corrente:
- O novo preço nunca deve expandir a máxima ou mínima além do desvio tolerável do corpo (`bodyMin - maxAllowedDistance`).
- Ticks com salto abrupto (> 8% do fechamento anterior) em tempo real devem ser ignorados.

---

## 3. Checklist Obrigatório de Verificação Pré-Deploy

Antes de concluir qualquer alteração em arquivos de gráficos, feeds ou indicadores (`CandleChart.tsx`, `AppContext.tsx`, `db.ts`, `vortexStreamer.ts`, `indicatorRegistry.ts`), valide cada item deste checklist:

- [ ] **1. Ingestão:** Os candles carregados passam por `cleanAndSanitizeCandles`?
- [ ] **2. Indicadores:** As séries de linha e histograma passam por `sanitizeLineSeriesData`?
- [ ] **3. Desativação/Limpeza:** Cada série possui ramificação `else { series.setData([]); }` para não deixar pontos órfãos ao desmarcar o indicador?
- [ ] **4. Timeframes:** A troca de timeframe limpa buffers e recalcula os indicadores no tempo correto?
- [ ] **5. Marcadores e Linhas de Preço:** Há proteção contra execução com `chartData.length === 0` para evitar `Value is null` no `priceScale`?
- [ ] **6. Build sem Quebra:** O comando `npm run build` foi executado e concluiu com **código 0 e sem erros de TypeScript**?

---

## 4. Guia Rápido de Resolução de Erros Comuns

| Erro / Sintoma | Causa Comum | Solução Obrigatória |
| :--- | :--- | :--- |
| **Velas achatadas no topo da tela / Linha vermelha despencando até 0** | Vela com `low: 0` ou preço corrompido entrou no feed. | Passar os dados por `cleanAndSanitizeCandles` na origem (`fetchCandlesSupabase`, `fetchStreamerCandles`). |
| **`Error: Value is null` em `SeriesBarColorer.Line`** | Cursor do mouse passou sobre o gráfico com uma série de linha que não foi limpa com `setData([])` ou tem índices fora do tempo principal. | Adicionar `else { series.setData([]); }` em todas as séries no `CandleChart.tsx` e usar `sanitizeLineSeriesData`. |
| **`Error: Value is null` em `priceScale` / Marcadores** | `setMarkers` ou `createPriceLine` foi chamado com `chartData` vazio antes do primeiro candle carregar. | Inserir guard clause `if (!seriesData \|\| seriesData.length === 0) return;`. |
| **Médias móveis com queda vertical súbita** | Indicador calculado sobre série não sanitizada com tick falso de valor 0. | Garantir que `calculateIndicator` utilize `sanitizeCandleSeriesData`. |
