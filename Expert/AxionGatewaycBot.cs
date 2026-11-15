using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using cAlgo.API;
using cAlgo.API.Internals;

namespace cAlgo.Robots
{
    // =========================================================================
    // AXION GATEWAY CBOT — CONECTOR UNIVERSAL CTRADER (C# .NET)
    // Sincronização em tempo real de Ordens, Posições, Saldo e Data Streamer 1m
    // Copyright 2026, VM Gestão & Tecnologia Ltda — https://db.vemviraramesa.com.br
    // =========================================================================
    [Robot(TimeZone = TimeZones.UTC, AccessRights = AccessRights.FullAccess)]
    public class AxionGatewaycBot : Robot
    {
        public enum TransportMode
        {
            LocalHttp,
            CloudRelayHub
        }

        [Parameter("Modo de Transporte", DefaultValue = TransportMode.LocalHttp, Group = "1. Conexão Axion")]
        public TransportMode Mode { get; set; }

        [Parameter("URL do Gateway Local / VPS", DefaultValue = "http://localhost:8004", Group = "1. Conexão Axion")]
        public string GatewayUrl { get; set; }

        [Parameter("Token de Pareamento de Nuvem", DefaultValue = "", Group = "1. Conexão Axion")]
        public string PairingToken { get; set; }

        [Parameter("Intervalo de Consulta de Ordens (ms)", DefaultValue = 250, MinValue = 50, MaxValue = 2000, Group = "1. Conexão Axion")]
        public int PollIntervalMs { get; set; }

        [Parameter("Habilitar Streamer de Mercado (1m)", DefaultValue = true, Group = "2. Data Streamer")]
        public bool EnableStreamer { get; set; }

        [Parameter("Throttle de Ticks (ms)", DefaultValue = 50, MinValue = 10, MaxValue = 500, Group = "2. Data Streamer")]
        public int TickThrottleMs { get; set; }

        [Parameter("Lote Máximo Permitido", DefaultValue = 50.0, MinValue = 0.01, Group = "3. Gestão de Risco")]
        public double MaxLotsAllowed { get; set; }

        [Parameter("Slippage Máxima (Pips)", DefaultValue = 3.0, MinValue = 0.5, Group = "3. Gestão de Risco")]
        public double MaxSlippagePips { get; set; }

        [Parameter("Permitir Zeragem em Pânico", DefaultValue = true, Group = "3. Gestão de Risco")]
        public bool AllowPanicClose { get; set; }

        private readonly HttpClient _httpClient = new HttpClient();
        private DateTime _lastCandleMinute = DateTime.MinValue;
        private DateTime _lastTickSentTime = DateTime.MinValue;
        private string _lastExecutedCommandId = string.Empty;
        private CancellationTokenSource _cts;

        protected override void OnStart()
        {
            _cts = new CancellationTokenSource();
            _httpClient.Timeout = TimeSpan.FromSeconds(3);

            Print($"[AxionGatewaycBot] 🚀 Iniciando Conector cTrader para conta {Account.Number} ({Account.BrokerName})");
            Print($"[AxionGatewaycBot] Símbolo ativo: {SymbolName} | Saldo: {Account.Balance} {Account.Currency}");

            // Inicia ciclo assíncrono de consulta e sincronização com o Axion
            Task.Run(() => PollingLoopAsync(_cts.Token));

            // Envio do snapshot inicial de status da conta
            _ = SendAccountSyncAsync();
        }

        protected override void OnStop()
        {
            _cts?.Cancel();
            _httpClient?.Dispose();
            Print("[AxionGatewaycBot] 🛑 Conector cTrader finalizado com sucesso.");
        }

        protected override void OnTick()
        {
            if (!EnableStreamer) return;

            DateTime now = DateTime.UtcNow;
            if ((now - _lastTickSentTime).TotalMilliseconds < TickThrottleMs) return;
            _lastTickSentTime = now;

            // Transmissão de cotação tick a tick para o Axion Web
            string tickPayload = string.Format(
                CultureInfo.InvariantCulture,
                "{{\"type\":\"streamer_tick\",\"symbol\":\"{0}\",\"price\":{1},\"bid\":{2},\"ask\":{3},\"timestamp\":\"{4:O}\"}}",
                EscapeJson(SymbolName),
                Symbol.Bid,
                Symbol.Bid,
                Symbol.Ask,
                now
            );

            _ = PostToGatewayAsync("/streamer/tick", tickPayload);
        }

        protected override void OnBar()
        {
            if (!EnableStreamer) return;

            var bars1m = MarketData.GetBars(TimeFrame.Minute);
            if (bars1m.Count < 2) return;

            var closedBar = bars1m.Last(1);
            DateTime barTime = closedBar.OpenTime;

            if (barTime <= _lastCandleMinute) return;
            _lastCandleMinute = barTime;

            // Transmissão de barra consolidada de 1m para o gráfico Axion
            string candlePayload = string.Format(
                CultureInfo.InvariantCulture,
                "{{\"type\":\"streamer_candle\",\"symbol\":\"{0}\",\"open\":{1},\"high\":{2},\"low\":{3},\"close\":{4},\"volume\":{5},\"timestamp\":\"{6:O}\",\"isBar\":true}}",
                EscapeJson(SymbolName),
                closedBar.Open,
                closedBar.High,
                closedBar.Low,
                closedBar.Close,
                closedBar.TickVolume,
                barTime
            );

            _ = PostToGatewayAsync("/streamer/candle", candlePayload);
            _ = SendAccountSyncAsync();
        }

        protected override void OnPositionOpened(PositionOpenedEventArgs args)
        {
            Print($"[AxionGatewaycBot] Posição aberta: {args.Position.Id} {args.Position.TradeType} {args.Position.VolumeInUnits} unidades");
            _ = SendAccountSyncAsync();
        }

        protected override void OnPositionClosed(PositionClosedEventArgs args)
        {
            Print($"[AxionGatewaycBot] Posição encerrada: {args.Position.Id} PnL: {args.Position.NetProfit}");
            _ = SendAccountSyncAsync();
        }

        // =========================================================================
        // LOOP DE POLLING E EXECUÇÃO DE ORDENS REMOTAS DO AXION
        // =========================================================================
        private async Task PollingLoopAsync(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    string pollUrl = $"{GatewayUrl.TrimEnd('/')}/api/orders/poll?account={Account.Number}";
                    if (!string.IsNullOrEmpty(PairingToken))
                    {
                        pollUrl += $"&token={Uri.EscapeDataString(PairingToken)}";
                    }

                    var response = await _httpClient.GetAsync(pollUrl, token);
                    if (response.IsSuccessStatusCode)
                    {
                        string json = await response.Content.ReadAsStringAsync();
                        if (!string.IsNullOrWhiteSpace(json) && json.Contains("\"action\""))
                        {
                            ExecuteRemoteCommand(json);
                        }
                    }
                }
                catch (TaskCanceledException)
                {
                    break;
                }
                catch
                {
                    // Silencia erros transitórios de rede na consulta
                }

                await Task.Delay(PollIntervalMs, token);
            }
        }

        // =========================================================================
        // PROCESSAMENTO DE COMANDOS DO AXION (BUY, SELL, PANIC_CLOSE, MODIFY_SL_TP)
        // =========================================================================
        private void ExecuteRemoteCommand(string json)
        {
            try
            {
                string commandId = ExtractJsonValue(json, "id");
                if (!string.IsNullOrEmpty(commandId) && commandId == _lastExecutedCommandId) return;

                string action = ExtractJsonValue(json, "action").ToUpperInvariant();
                string targetSymbol = ExtractJsonValue(json, "symbol");
                if (string.IsNullOrEmpty(targetSymbol)) targetSymbol = SymbolName;

                double lots = 0.01;
                string lotsStr = ExtractJsonValue(json, "lots");
                if (!string.IsNullOrEmpty(lotsStr)) double.TryParse(lotsStr, NumberStyles.Any, CultureInfo.InvariantCulture, out lots);
                lots = Math.Min(lots, MaxLotsAllowed);

                double slPoints = 0;
                string slStr = ExtractJsonValue(json, "sl_points");
                if (!string.IsNullOrEmpty(slStr)) double.TryParse(slStr, NumberStyles.Any, CultureInfo.InvariantCulture, out slPoints);

                double tpPoints = 0;
                string tpStr = ExtractJsonValue(json, "tp_points");
                if (!string.IsNullOrEmpty(tpStr)) double.TryParse(tpStr, NumberStyles.Any, CultureInfo.InvariantCulture, out tpPoints);

                _lastExecutedCommandId = commandId;

                BeginInvokeOnMainThread(() =>
                {
                    switch (action)
                    {
                        case "BUY":
                            ExecuteMarketOrderAction(TradeType.Buy, lots, slPoints, tpPoints, commandId);
                            break;

                        case "SELL":
                            ExecuteMarketOrderAction(TradeType.Sell, lots, slPoints, tpPoints, commandId);
                            break;

                        case "PANIC_CLOSE":
                        case "CLOSE_ALL":
                            if (AllowPanicClose)
                            {
                                CloseAllPositionsAction();
                            }
                            break;

                        case "MODIFY_SL_TP":
                            ModifySlTpAction(slPoints, tpPoints);
                            break;
                    }
                });
            }
            catch (Exception ex)
            {
                Print($"[AxionGatewaycBot] Erro ao executar comando remoto: {ex.Message}");
            }
        }

        private void ExecuteMarketOrderAction(TradeType tradeType, double lots, double slPoints, double tpPoints, string label)
        {
            var symbolObj = Symbols.GetSymbol(SymbolName);
            long volumeUnits = symbolObj.QuantityToVolumeInUnits(lots);

            double? slPips = slPoints > 0 ? (slPoints * symbolObj.TickSize) / symbolObj.PipSize : (double?)null;
            double? tpPips = tpPoints > 0 ? (tpPoints * symbolObj.TickSize) / symbolObj.PipSize : (double?)null;

            var result = ExecuteMarketOrder(tradeType, SymbolName, volumeUnits, label, slPips, tpPips);
            if (result.IsSuccessful)
            {
                Print($"[AxionGatewaycBot] ✅ Ordem {tradeType} executada com sucesso: {result.Position.Id} | Volume: {lots} lots");
                _ = SendAccountSyncAsync();
            }
            else
            {
                Print($"[AxionGatewaycBot] ❌ Falha na execução da ordem {tradeType}: {result.Error}");
            }
        }

        private void CloseAllPositionsAction()
        {
            var activePositions = Positions.FindAll(string.Empty, SymbolName);
            Print($"[AxionGatewaycBot] 🚨 Zeragem em pânico solicitada: fechando {activePositions.Length} posições...");
            foreach (var pos in activePositions)
            {
                ClosePosition(pos);
            }
            _ = SendAccountSyncAsync();
        }

        private void ModifySlTpAction(double slPoints, double tpPoints)
        {
            var symbolObj = Symbols.GetSymbol(SymbolName);
            var activePositions = Positions.FindAll(string.Empty, SymbolName);
            foreach (var pos in activePositions)
            {
                double? stopLossPrice = slPoints > 0 
                    ? (pos.TradeType == TradeType.Buy ? pos.EntryPrice - (slPoints * symbolObj.TickSize) : pos.EntryPrice + (slPoints * symbolObj.TickSize))
                    : (double?)null;

                double? takeProfitPrice = tpPoints > 0
                    ? (pos.TradeType == TradeType.Buy ? pos.EntryPrice + (tpPoints * symbolObj.TickSize) : pos.EntryPrice - (tpPoints * symbolObj.TickSize))
                    : (double?)null;

                ModifyPosition(pos, stopLossPrice, takeProfitPrice);
            }
            _ = SendAccountSyncAsync();
        }

        // =========================================================================
        // SINCRONIZAÇÃO DE SALDO E POSIÇÕES COM O AXION
        // =========================================================================
        private async Task SendAccountSyncAsync()
        {
            try
            {
                var openPositions = Positions.Select(p => string.Format(
                    CultureInfo.InvariantCulture,
                    "{{\"id\":{0},\"symbol\":\"{1}\",\"type\":\"{2}\",\"lots\":{3},\"entry\":{4},\"pnl\":{5},\"sl\":{6},\"tp\":{7}}}",
                    p.Id,
                    EscapeJson(p.SymbolName),
                    p.TradeType,
                    p.Quantity,
                    p.EntryPrice,
                    p.NetProfit,
                    p.StopLoss.HasValue ? p.StopLoss.Value.ToString(CultureInfo.InvariantCulture) : "null",
                    p.TakeProfit.HasValue ? p.TakeProfit.Value.ToString(CultureInfo.InvariantCulture) : "null"
                ));

                string payload = string.Format(
                    CultureInfo.InvariantCulture,
                    "{{\"platform\":\"ctrader\",\"account_name\":\"{0}\",\"broker\":\"{1}\",\"balance\":{2},\"equity\":{3},\"currency\":\"{4}\",\"leverage\":{5},\"positions\":[{6}],\"timestamp\":\"{7:O}\"}}",
                    EscapeJson(Account.Number.ToString()),
                    EscapeJson(Account.BrokerName),
                    Account.Balance,
                    Account.Equity,
                    Account.Currency,
                    Account.PreciseLeverage,
                    string.Join(",", openPositions),
                    DateTime.UtcNow
                );

                await PostToGatewayAsync("/api/account/sync", payload);
            }
            catch {}
        }

        private async Task PostToGatewayAsync(string path, string json)
        {
            try
            {
                string url = $"{GatewayUrl.TrimEnd('/')}{path}";
                using (var content = new StringContent(json, Encoding.UTF8, "application/json"))
                {
                    await _httpClient.PostAsync(url, content);
                }
            }
            catch {}
        }

        private static string EscapeJson(string s) => s?.Replace("\\", "\\\\")?.Replace("\"", "\\\"") ?? string.Empty;

        private static string ExtractJsonValue(string json, string key)
        {
            int keyIdx = json.IndexOf($"\"{key}\"", StringComparison.OrdinalIgnoreCase);
            if (keyIdx < 0) return string.Empty;
            int colonIdx = json.IndexOf(':', keyIdx);
            if (colonIdx < 0) return string.Empty;
            int valStart = colonIdx + 1;
            while (valStart < json.Length && (json[valStart] == ' ' || json[valStart] == '\t')) valStart++;
            if (valStart >= json.Length) return string.Empty;
            if (json[valStart] == '"')
            {
                int endQuote = json.IndexOf('"', valStart + 1);
                return endQuote > valStart ? json.Substring(valStart + 1, endQuote - valStart - 1) : string.Empty;
            }
            int valEnd = valStart;
            while (valEnd < json.Length && json[valEnd] != ',' && json[valEnd] != '}' && json[valEnd] != ']' && json[valEnd] != ' ' && json[valEnd] != '\r' && json[valEnd] != '\n') valEnd++;
            return json.Substring(valStart, valEnd - valStart);
        }
    }
}
