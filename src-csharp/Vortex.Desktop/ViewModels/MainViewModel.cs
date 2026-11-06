using System.Collections.ObjectModel;
using Vortex.Core.Models;

namespace Vortex.Desktop.ViewModels;

public record NavMenuItem(string Id, string Label, string Sublabel, string Icon);

public class MainViewModel : ViewModelBase
{
    private string _currentPage = "dashboard";
    private bool _isSidebarCollapsed = false;
    private string _activeSymbol = "NQ 100 E-MINI";
    private double _currentPrice = 18542.50;
    private double _priceDelta = 12.75;
    private double _deltaPct = 58.4;
    private double _accountBalance = 50000.00;
    private string _gammaBias = "ALTA INSTITUCIONAL (CALLS)";
    private double _calculationLatencyMs = 0.04;
    private string _lastRobotSignal = "AGUARDANDO BARRA";

    public ObservableCollection<NavMenuItem> MenuItems { get; } = new()
    {
        new("dashboard", "Dashboard", "Painel principal", "📊"),
        new("relatorios", "Análise de Desempenho", "Resultado de sinais", "📈"),
        new("contas", "Gestão de Contas", "Contas e Copy Trade", "🏦"),
        new("algoritmos", "Robôs Axion", "Lógicas e Automação", "🤖"),
        new("replay", "Replay de Mercado", "Ninja Replay & Painel 2", "⏪"),
        new("simulador", "Simulador", "Backtest e Replay", "🎮"),
        new("configuracoes", "Configurações", "APIs e intervalos", "⚙️"),
        new("prompts", "Prompts IA", "Análise principal", "📝"),
        new("alertas", "Alertas", "Configurações de alarme", "🔔"),
        new("manual", "Manual", "Guia de uso e dicas", "📖")
    };

    public ObservableCollection<string> LiveLogs { get; } = new();

    public string CurrentPage
    {
        get => _currentPage;
        set => SetField(ref _currentPage, value);
    }

    public bool IsSidebarCollapsed
    {
        get => _isSidebarCollapsed;
        set => SetField(ref _isSidebarCollapsed, value);
    }

    public string ActiveSymbol
    {
        get => _activeSymbol;
        set => SetField(ref _activeSymbol, value);
    }

    public double CurrentPrice
    {
        get => _currentPrice;
        set => SetField(ref _currentPrice, value);
    }

    public double PriceDelta
    {
        get => _priceDelta;
        set => SetField(ref _priceDelta, value);
    }

    public double DeltaPct
    {
        get => _deltaPct;
        set => SetField(ref _deltaPct, value);
    }

    public double AccountBalance
    {
        get => _accountBalance;
        set => SetField(ref _accountBalance, value);
    }

    public string GammaBias
    {
        get => _gammaBias;
        set => SetField(ref _gammaBias, value);
    }

    public double CalculationLatencyMs
    {
        get => _calculationLatencyMs;
        set => SetField(ref _calculationLatencyMs, value);
    }

    public string LastRobotSignal
    {
        get => _lastRobotSignal;
        set => SetField(ref _lastRobotSignal, value);
    }

    public void AddLog(string message)
    {
        string timestamp = DateTime.Now.ToString("HH:mm:ss.fff");
        LiveLogs.Insert(0, $"[{timestamp}] {message}");
        if (LiveLogs.Count > 120) LiveLogs.RemoveAt(LiveLogs.Count - 1);
    }
}
