using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using Vortex.Core.Models;

namespace Vortex.Desktop.Services;

/// <summary>
/// Serviço Nativo de Conexão com o Supabase do Vortex (HTTP + JSON de Alta Performance em C#).
/// Lê as tabelas reais do banco: market_data, painelvm_candles_1m, nasdaq_force, gamma_levels e contas.
/// </summary>
public class SupabaseDataService
{
    private readonly HttpClient _http;
    private const string BaseUrl = "https://db.vemviraramesa.com.br/rest/v1";
    private const string ApiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY";

    public SupabaseDataService()
    {
        _http = new HttpClient();
        _http.DefaultRequestHeaders.Add("apikey", ApiKey);
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ApiKey);
    }

    /// <summary>
    /// Busca os últimos candles reais de 1 minuto da tabela oficial do Vortex
    /// </summary>
    public async Task<List<Candle>> FetchRealCandlesAsync(string instanceId = "nt8_main", int limit = 300)
    {
        try
        {
            // Tenta primeiro instance_id ou painel_principal
            string url = $"{BaseUrl}/painelvm_candles_1m?select=timestamp,open,high,low,close,volume&instance_id=eq.{instanceId}&order=timestamp.desc&limit={limit}";
            var response = await _http.GetAsync(url);

            if (!response.IsSuccessStatusCode)
            {
                // Fallback para painel_principal
                url = $"{BaseUrl}/painelvm_candles_1m?select=timestamp,open,high,low,close,volume&order=timestamp.desc&limit={limit}";
                response = await _http.GetAsync(url);
            }

            if (response.IsSuccessStatusCode)
            {
                string json = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);
                var list = new List<Candle>();

                foreach (var el in doc.RootElement.EnumerateArray())
                {
                    list.Add(new Candle
                    {
                        Timestamp = el.GetProperty("timestamp").GetString() ?? DateTime.UtcNow.ToString("o"),
                        Open = el.GetProperty("open").GetDouble(),
                        High = el.GetProperty("high").GetDouble(),
                        Low = el.GetProperty("low").GetDouble(),
                        Close = el.GetProperty("close").GetDouble(),
                        Volume = el.TryGetProperty("volume", out var v) ? v.GetDouble() : 100
                    });
                }

                // Inverter para ordem cronológica (passado -> presente)
                list.Reverse();
                return list;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Erro ao buscar candles reais: {ex.Message}");
        }

        return new List<Candle>();
    }

    /// <summary>
    /// Busca cotação, sentimento e delta reais da tabela market_data
    /// </summary>
    public async Task<(double Price, double Delta, double DeltaPct, string Symbol, string Estado)> FetchRealMarketDataAsync(string instanceId = "painel_principal")
    {
        try
        {
            string url = $"{BaseUrl}/market_data?select=*&order=id.desc&limit=1";
            var response = await _http.GetAsync(url);

            if (response.IsSuccessStatusCode)
            {
                string json = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.GetArrayLength() > 0)
                {
                    var el = doc.RootElement[0];
                    double price = 0.0;
                    if (el.TryGetProperty("price", out var pEl))
                    {
                        if (pEl.ValueKind == JsonValueKind.Number) price = pEl.GetDouble();
                        else if (double.TryParse(pEl.GetString(), out var pParsed)) price = pParsed;
                    }

                    double delta = el.TryGetProperty("delta", out var dEl) ? dEl.GetDouble() : 0.0;
                    double deltaPct = el.TryGetProperty("delta_pct", out var dpEl) ? dpEl.GetDouble() : 50.0;
                    string symbol = el.TryGetProperty("symbol", out var sEl) ? (sEl.GetString() ?? "NQ") : "NQ";
                    string estado = el.TryGetProperty("estado", out var eEl) ? (eEl.GetString() ?? "AGUARDANDO") : "AGUARDANDO";

                    return (price, delta, deltaPct, symbol, estado);
                }
            }
        }
        catch {}

        return (18540.0, 0.0, 50.0, "NQ", "AGUARDANDO");
    }

    /// <summary>
    /// Busca as contas reais cadastradas no Vortex
    /// </summary>
    public async Task<List<BrokerAccount>> FetchRealAccountsAsync()
    {
        try
        {
            string url = $"{BaseUrl}/painelvm_accounts?select=*&order=created_at.desc";
            var response = await _http.GetAsync(url);

            if (response.IsSuccessStatusCode)
            {
                string json = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);
                var accounts = new List<BrokerAccount>();

                foreach (var el in doc.RootElement.EnumerateArray())
                {
                    accounts.Add(new BrokerAccount
                    {
                        Id = el.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? Guid.NewGuid().ToString() : Guid.NewGuid().ToString(),
                        AccountName = el.TryGetProperty("account_name", out var anEl) ? anEl.GetString() ?? "Conta" : "Conta",
                        Balance = el.TryGetProperty("balance", out var bEl) ? bEl.GetDouble() : 50000.0,
                        InitialBalance = el.TryGetProperty("initial_balance", out var ibEl) ? ibEl.GetDouble() : 50000.0,
                        IsActive = el.TryGetProperty("is_active", out var iaEl) && iaEl.GetBoolean(),
                        IsMaster = el.TryGetProperty("is_master", out var imEl) && imEl.GetBoolean(),
                        DailyStopLossUsd = el.TryGetProperty("daily_stop_loss_usd", out var dslEl) ? dslEl.GetDouble() : 1000.0,
                        MaxDrawdownUsd = el.TryGetProperty("max_drawdown_usd", out var ddEl) ? ddEl.GetDouble() : 2500.0
                    });
                }

                if (accounts.Count > 0) return accounts;
            }
        }
        catch {}

        return new List<BrokerAccount>
        {
            new() { AccountName = "Conta Mestre Principal", Balance = 50000.0, IsActive = true }
        };
    }
}
