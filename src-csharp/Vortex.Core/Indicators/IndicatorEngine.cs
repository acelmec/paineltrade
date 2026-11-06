using Vortex.Core.Models;

namespace Vortex.Core.Indicators;

/// <summary>
/// Motor de cálculo ultrarrápido de Indicadores Técnicos em C# (.NET 8/9).
/// Utiliza alocação otimizada em memória para latência na faixa de microssegundos.
/// </summary>
public static class IndicatorEngine
{
    /// <summary>
    /// Média Móvel Simples (SMA)
    /// </summary>
    public static double[] CalculateSMA(IReadOnlyList<Candle> candles, int period, string source = "close")
    {
        if (candles == null || candles.Count == 0 || period <= 0) return Array.Empty<double>();

        int length = candles.Count;
        double[] result = new double[length];
        double currentSum = 0.0;

        for (int i = 0; i < length; i++)
        {
            double price = candles[i].GetPrice(source);
            currentSum += price;

            if (i >= period)
            {
                currentSum -= candles[i - period].GetPrice(source);
                result[i] = currentSum / period;
            }
            else if (i == period - 1)
            {
                result[i] = currentSum / period;
            }
            else
            {
                // Período de aquecimento (média acumulada parcial ou NaN)
                result[i] = currentSum / (i + 1);
            }
        }

        return result;
    }

    /// <summary>
    /// Média Móvel Exponencial (EMA)
    /// </summary>
    public static double[] CalculateEMA(IReadOnlyList<Candle> candles, int period, string source = "close")
    {
        if (candles == null || candles.Count == 0 || period <= 0) return Array.Empty<double>();

        int length = candles.Count;
        double[] result = new double[length];
        double k = 2.0 / (period + 1.0);

        double ema = candles[0].GetPrice(source);
        result[0] = ema;

        for (int i = 1; i < length; i++)
        {
            double price = candles[i].GetPrice(source);
            ema = (price * k) + (ema * (1.0 - k));
            result[i] = ema;
        }

        return result;
    }

    /// <summary>
    /// Índice de Força Relativa (RSI) com suavização de Wilder (Padrão TradingView)
    /// </summary>
    public static double[] CalculateRSI(IReadOnlyList<Candle> candles, int period = 14, string source = "close")
    {
        if (candles == null || candles.Count <= period) return Array.Empty<double>();

        int length = candles.Count;
        double[] result = new double[length];

        double sumGain = 0.0;
        double sumLoss = 0.0;

        for (int i = 1; i <= period; i++)
        {
            double diff = candles[i].GetPrice(source) - candles[i - 1].GetPrice(source);
            if (diff >= 0) sumGain += diff;
            else sumLoss -= diff;
        }

        double avgGain = sumGain / period;
        double avgLoss = sumLoss / period;

        result[period] = avgLoss == 0 ? 100.0 : 100.0 - (100.0 / (1.0 + (avgGain / avgLoss)));

        for (int i = period + 1; i < length; i++)
        {
            double diff = candles[i].GetPrice(source) - candles[i - 1].GetPrice(source);
            double gain = diff > 0 ? diff : 0.0;
            double loss = diff < 0 ? -diff : 0.0;

            avgGain = ((avgGain * (period - 1)) + gain) / period;
            avgLoss = ((avgLoss * (period - 1)) + loss) / period;

            result[i] = avgLoss == 0 ? 100.0 : 100.0 - (100.0 / (1.0 + (avgGain / avgLoss)));
        }

        return result;
    }

    /// <summary>
    /// Bandas de Bollinger (SMA + Desvio Padrão)
    /// </summary>
    public static (double[] Upper, double[] Middle, double[] Lower) CalculateBollingerBands(
        IReadOnlyList<Candle> candles, 
        int period = 20, 
        double stdDevMult = 2.0, 
        string source = "close")
    {
        if (candles == null || candles.Count == 0) 
            return (Array.Empty<double>(), Array.Empty<double>(), Array.Empty<double>());

        int length = candles.Count;
        double[] upper = new double[length];
        double[] middle = CalculateSMA(candles, period, source);
        double[] lower = new double[length];

        for (int i = 0; i < length; i++)
        {
            if (i < period - 1) continue;

            double mean = middle[i];
            double varianceSum = 0.0;

            for (int j = 0; j < period; j++)
            {
                double p = candles[i - j].GetPrice(source);
                varianceSum += Math.Pow(p - mean, 2);
            }

            double stdDev = Math.Sqrt(varianceSum / period);
            upper[i] = mean + (stdDev * stdDevMult);
            lower[i] = mean - (stdDev * stdDevMult);
        }

        return (upper, middle, lower);
    }
}
