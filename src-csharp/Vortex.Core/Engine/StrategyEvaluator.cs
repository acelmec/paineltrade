using Vortex.Core.Models;

namespace Vortex.Core.Engine;

/// <summary>
/// Motor de Avaliação de Sinais e Execução de Estratégias do Vortex.
/// Implementa estritamente a Constituição do Sistema (AGENTS.md / GEMINI.md):
/// 1. Separação de Modo Indicador (alert) vs Estratégia (position).
/// 2. Validação de Barra Fechada (targetCandle = length - 2) vs Realtime (length - 1).
/// 3. Vínculo Obrigatório com Contas Ativas.
/// 4. Operadores de Cruzamento (cross_above / cross_below) vs Nível (>, <, >=, <=).
/// </summary>
public class StrategyEvaluator
{
    public record SignalResult(
        bool HasSignal,
        string Side, // "BUY", "SELL" ou "NONE"
        string Reason,
        double Price,
        string Timestamp
    );

    /// <summary>
    /// Avalia uma estratégia sobre o conjunto de velas considerando o modo de execução.
    /// </summary>
    public SignalResult Evaluate(
        CustomStrategy strategy, 
        IReadOnlyList<Candle> candles, 
        IReadOnlyList<BrokerAccount> activeAccounts)
    {
        // 1. REGRA INVIOLÁVEL: Vínculo Obrigatório com Contas Ativas
        // Nenhum algoritmo roda no vácuo se não houver pelo menos uma conta ativa conectada.
        if (activeAccounts == null || activeAccounts.Count == 0 || !activeAccounts.Any(a => a.IsActive))
        {
            return new SignalResult(false, "NONE", "Sem contas ativas vinculadas", 0, string.Empty);
        }

        if (candles == null || candles.Count < 3)
        {
            return new SignalResult(false, "NONE", "Histórico insuficiente de candles", 0, string.Empty);
        }

        // 2. REGRA INVIOLÁVEL: Barra Fechada vs Barra Corrente
        // - 'closed': avalia estritamente sobre a vela anterior consolidada (length - 2)
        // - 'realtime': avalia sobre a vela em formação (length - 1)
        int targetIndex = strategy.ExecutionMode.ToLowerInvariant() == "realtime"
            ? candles.Count - 1
            : candles.Count - 2;

        var targetCandle = candles[targetIndex];
        var prevCandle = candles[targetIndex - 1];

        // 3. Avaliação de Condições de Compra
        bool buyTriggered = EvaluateStages(strategy.BuyConditions, candles, targetIndex);
        if (buyTriggered)
        {
            return new SignalResult(
                true, 
                "BUY", 
                $"Sinal de COMPRA disparado [{strategy.Action.ToUpperInvariant()}]", 
                targetCandle.Close, 
                targetCandle.Timestamp
            );
        }

        // 4. Avaliação de Condições de Venda
        bool sellTriggered = EvaluateStages(strategy.SellConditions, candles, targetIndex);
        if (sellTriggered)
        {
            return new SignalResult(
                true, 
                "SELL", 
                $"Sinal de VENDA disparado [{strategy.Action.ToUpperInvariant()}]", 
                targetCandle.Close, 
                targetCandle.Timestamp
            );
        }

        return new SignalResult(false, "NONE", "Sem sinal no candle avaliado", targetCandle.Close, targetCandle.Timestamp);
    }

    private bool EvaluateStages(List<StrategyLogicStage> stages, IReadOnlyList<Candle> candles, int targetIndex)
    {
        if (stages == null || stages.Count == 0) return false;

        foreach (var stage in stages)
        {
            if (stage.Conditions == null || stage.Conditions.Count == 0) continue;

            bool isAnd = stage.Logic.ToUpperInvariant() == "AND";
            bool stageSatisfied = isAnd;

            foreach (var cond in stage.Conditions)
            {
                bool condResult = EvaluateSingleCondition(cond, candles, targetIndex);

                if (isAnd)
                {
                    if (!condResult) { stageSatisfied = false; break; }
                }
                else // OR
                {
                    if (condResult) { stageSatisfied = true; break; }
                }
            }

            if (!stageSatisfied) return false;
        }

        return true;
    }

    private bool EvaluateSingleCondition(StrategyLogicCondition cond, IReadOnlyList<Candle> candles, int targetIndex)
    {
        // Exemplo de avaliação: Preço ou Indicador vs Alvo
        var curr = candles[targetIndex];
        var prev = candles[targetIndex - 1];

        double valA = curr.GetPrice(cond.Source.ToLowerInvariant());
        double valAPrev = prev.GetPrice(cond.Source.ToLowerInvariant());

        double valB = 0.0;
        double valBPrev = 0.0;

        if (cond.TargetValue != null && double.TryParse(cond.TargetValue.ToString(), out double parsedVal))
        {
            valB = parsedVal;
            valBPrev = parsedVal;
        }

        return cond.Operator switch
        {
            ">" => valA > valB,
            "<" => valA < valB,
            ">=" => valA >= valB,
            "<=" => valA <= valB,
            "==" => Math.Abs(valA - valB) < 0.0001,
            // Operadores de Cruzamento Estrito (Transição de Estado Única)
            "cross_above" => valAPrev <= valBPrev && valA > valB,
            "cross_below" => valAPrev >= valBPrev && valA < valB,
            _ => false
        };
    }
}
