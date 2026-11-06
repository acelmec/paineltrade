namespace Vortex.Core.Models;

/// <summary>
/// Condição individual de um estágio lógico do robô
/// </summary>
public record StrategyLogicCondition
{
    public string Id { get; init; } = string.Empty;
    public string Source { get; init; } = string.Empty;
    public string Operator { get; init; } = string.Empty;
    public string TargetType { get; init; } = "value";
    public object? TargetValue { get; init; }
    public string? TargetIndicator { get; init; }
    public Dictionary<string, object>? TargetParams { get; init; }
    public Dictionary<string, object>? SourceParams { get; init; }
    public string? SubSeries { get; init; }
    public string? SourceSubSeries { get; init; }
    public string? TargetSubSeries { get; init; }
}

/// <summary>
/// Estágio lógico com suporte a AND / OR e controle de candles de espera
/// </summary>
public record StrategyLogicStage
{
    public string Id { get; init; } = string.Empty;
    public int StageNumber { get; init; } = 1;
    public string Name { get; init; } = "Lógica 1";
    public List<StrategyLogicCondition> Conditions { get; init; } = new();
    public string Logic { get; init; } = "AND";
    public int MaxWaitCandles { get; init; } = 0;
}

/// <summary>
/// Configurações de Risco do Robô
/// </summary>
public record StrategyRiskSettings
{
    public double Lots { get; init; } = 1.0;
    public string SizingMode { get; init; } = "lote";
    public double? MaxRiskUsd { get; init; }
    public string StopValue { get; init; } = "20";
    public string StopType { get; init; } = "points";
    public string TakeValue { get; init; } = "40";
    public string TakeType { get; init; } = "points";
    public int MaxDailyTrades { get; init; } = 5;
    public string? TargetPanelId { get; init; }
}

/// <summary>
/// Sessão operacional com horários permitidos
/// </summary>
public record StrategySession
{
    public string Start { get; init; } = "09:00";
    public string End { get; init; } = "17:00";
    public bool Active { get; init; } = true;
}

/// <summary>
/// Estratégia / Algoritmo Completo do Vortex (Indicador ou Robô Operacional)
/// </summary>
public record CustomStrategy
{
    public string Id { get; init; } = Guid.NewGuid().ToString();
    public string? UserId { get; init; }
    public string? PanelId { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public List<StrategyLogicStage> BuyConditions { get; init; } = new();
    public List<StrategyLogicStage> SellConditions { get; init; } = new();
    public StrategyRiskSettings RiskSettings { get; init; } = new();
    public bool Active { get; init; } = true;
    public int Timeframe { get; init; } = 1;
    
    /// <summary>
    /// Modo de Ação:
    /// - "alert": Modo INDICADOR (sinais visuais/sonoros sem ordens na corretora)
    /// - "position": Modo ESTRATÉGIA (envia ordens com governança de risco estrita)
    /// </summary>
    public string Action { get; init; } = "position";
    
    /// <summary>
    /// Modo de Execução:
    /// - "closed": Barra Fechada (candle anterior consolidado length - 2)
    /// - "realtime": Barra Corrente (vela em formação)
    /// </summary>
    public string ExecutionMode { get; init; } = "closed";
    
    public List<StrategySession> Sessions { get; init; } = new();
    public int? MaxEntries { get; init; }
}
