namespace Vortex.Core.Models;

/// <summary>
/// Modelo de Conta de Corretora / Mesa Proprietária com Trava de Risco e Parâmetros Operacionais
/// </summary>
public record BrokerAccount
{
    public string Id { get; init; } = Guid.NewGuid().ToString();
    public string UserId { get; init; } = string.Empty;
    public string AccountType { get; init; } = "internal_demo";
    public string? Platform { get; init; } = "axion";
    public long? TradovateAccountId { get; init; }
    public string AccountName { get; init; } = string.Empty;
    public double Balance { get; init; } = 50000.0;
    public double InitialBalance { get; init; } = 50000.0;
    public string Currency { get; init; } = "USD";
    public bool IsMaster { get; init; } = false;
    public bool IsActive { get; init; } = true;
    public string DdMode { get; init; } = "intraday_trailing";
    public double MaxDrawdownUsd { get; init; } = 2500.0;
    public double DailyStopLossUsd { get; init; } = 1000.0;
    public double? DailyMaxGainUsd { get; init; }
    public int? DailyMaxEntries { get; init; }
    public bool AllowMultiSignals { get; init; } = false;
    public double? ProfitTargetUsd { get; init; }
    public double HighWatermark { get; init; } = 50000.0;
    public double EodBaselineBalance { get; init; } = 50000.0;
    public bool EnforceDdLockout { get; init; } = true;
    public string Status { get; init; } = "active";
}
