namespace Vortex.Core.Models;

/// <summary>
/// Modelo de Vela / Candle idêntico ao do VortexWeb (TypeScript)
/// </summary>
public record Candle
{
    public int? Idx { get; init; }
    public string? InstanceId { get; init; }
    public string? Symbol { get; init; }
    public required string Timestamp { get; init; }
    public double Open { get; init; }
    public double High { get; init; }
    public double Low { get; init; }
    public double Close { get; init; }
    public double? Volume { get; init; }

    /// <summary>
    /// Retorna o preço da vela baseado no tipo de fonte ('close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4')
    /// </summary>
    public double GetPrice(string source = "close") => source.ToLowerInvariant() switch
    {
        "open" => Open,
        "high" => High,
        "low" => Low,
        "hl2" => (High + Low) / 2.0,
        "hlc3" => (High + Low + Close) / 3.0,
        "ohlc4" => (Open + High + Low + Close) / 4.0,
        _ => Close
    };

    /// <summary>
    /// Retorna o timestamp em segundos UNIX (padrão Lightweight-Charts / Vortex)
    /// </summary>
    public long GetUnixSeconds()
    {
        if (DateTimeOffset.TryParse(Timestamp, out var dto))
        {
            return dto.ToUnixTimeSeconds();
        }
        return 0;
    }
}
