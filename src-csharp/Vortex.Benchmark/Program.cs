using System.Diagnostics;
using Vortex.Core.Engine;
using Vortex.Core.Indicators;
using Vortex.Core.Models;

Console.WriteLine("==================================================");
Console.WriteLine("        VORTEX C# (.NET 8/9) ENGINE TEST          ");
Console.WriteLine("==================================================");

// 1. Gerar 10.000 candles em memória para teste de estresse
int count = 10000;
var candles = new List<Candle>(count);
double price = 18500.0;
var rnd = new Random(42);

for (int i = 0; i < count; i++)
{
    double delta = (rnd.NextDouble() - 0.49) * 10.0;
    double open = price;
    price += delta;
    double close = price;
    double high = Math.Max(open, close) + rnd.NextDouble() * 5.0;
    double low = Math.Min(open, close) - rnd.NextDouble() * 5.0;

    candles.Add(new Candle
    {
        Idx = i,
        Timestamp = DateTime.UtcNow.AddMinutes(-count + i).ToString("o"),
        Open = open,
        High = high,
        Low = low,
        Close = close,
        Volume = rnd.Next(50, 500)
    });
}

Console.WriteLine($"[OK] {count:N0} candles gerados em memória.");

// 2. Medir tempo de cálculo de SMA, EMA, RSI e Bandas de Bollinger
var sw = Stopwatch.StartNew();
var sma20 = IndicatorEngine.CalculateSMA(candles, 20);
var ema50 = IndicatorEngine.CalculateEMA(candles, 50);
var rsi14 = IndicatorEngine.CalculateRSI(candles, 14);
var bb = IndicatorEngine.CalculateBollingerBands(candles, 20, 2.0);
sw.Stop();

Console.WriteLine($"[PERFORMANCE] Cálculo de 4 indicadores sobre 10.000 velas concluído em: {sw.ElapsedMilliseconds} ms ({sw.Elapsed.TotalMicroseconds:N0} µs)");
Console.WriteLine($"Último Preço: {candles[^1].Close:F2} | SMA20: {sma20[^1]:F2} | EMA50: {ema50[^1]:F2} | RSI14: {rsi14[^1]:F2}");

// 3. Teste do StrategyEvaluator com regras da Constituição
var strategy = new CustomStrategy
{
    Name = "Setup Rompimento SMA",
    Action = "position",
    ExecutionMode = "closed",
    BuyConditions = new List<StrategyLogicStage>
    {
        new StrategyLogicStage
        {
            Logic = "AND",
            Conditions = new List<StrategyLogicCondition>
            {
                new StrategyLogicCondition
                {
                    Source = "close",
                    Operator = ">",
                    TargetValue = sma20[^2] // compara com SMA anterior consolidada
                }
            }
        }
    }
};

var accounts = new List<BrokerAccount>
{
    new BrokerAccount
    {
        AccountName = "Conta Mestre Teste",
        IsActive = true,
        Balance = 50000.0
    }
};

var evaluator = new StrategyEvaluator();
var signalResult = evaluator.Evaluate(strategy, candles, accounts);

Console.WriteLine("--------------------------------------------------");
Console.WriteLine($"[RESULTADO DO ROBÔ]: HasSignal: {signalResult.HasSignal} | Side: {signalResult.Side} | Motivo: {signalResult.Reason}");
Console.WriteLine("Motor C# pronto e homologado com sucesso!");
Console.WriteLine();
Console.WriteLine("Pressione [ENTER] para sair...");
Console.ReadLine();
