#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Media;
using System.Xml.Serialization;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.Gui.Tools;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

namespace NinjaTrader.NinjaScript.Indicators
{
    // =========================================================================
    // SERVIDOR HTTP SINGLETON DO VORTEX DATA STREAMER (:8002)
    // Permite que múltiplos gráficos transmitam candles de 1m simultaneamente
    // sem conflito de portas e 100% isolado do Add-on de Copy Trading (:8001).
    // =========================================================================
    public static class VortexStreamerServer
    {
        private static HttpListener _httpListener;
        private static bool _isRunning = false;
        private static int _activeInstanceCount = 0;
        private static readonly object _serverLock = new object();
        private static int _currentPort = 8002;

        // Dicionário de dados por símbolo raiz (ex: "NQ", "RTY", "ES", "GC")
        private static readonly Dictionary<string, SymbolStreamData> _streams =
            new Dictionary<string, SymbolStreamData>(StringComparer.OrdinalIgnoreCase);

        public class CandleItem
        {
            public string timestamp;
            public double open;
            public double high;
            public double low;
            public double close;
            public long volume;
        }

        public class BlockTradeItem
        {
            public string time;
            public double price;
            public long volume;
            public string side; // "COMPRA" ou "VENDA"
        }

        public class SymbolStreamData
        {
            public string RootSymbol { get; set; }
            public string FullInstrument { get; set; }
            public string TargetPanel { get; set; }
            public int TimeframeMinutes { get; set; }
            public List<CandleItem> Candles { get; set; } = new List<CandleItem>();
            public List<BlockTradeItem> BlockTrades { get; set; } = new List<BlockTradeItem>();
            public double CurrentPrice { get; set; }
            public double CurrentOpen { get; set; }
            public double CurrentHigh { get; set; }
            public double CurrentLow { get; set; }
            public double CurrentClose { get; set; }
            public long CurrentVolume { get; set; }
            public string CurrentTimestamp { get; set; }
            public DateTime LastUpdateUtc { get; set; } = DateTime.UtcNow;
            public readonly object DataLock = new object();

            // Cache JSON pré-serializado para respostas instantâneas (< 0.1ms)
            private string _cachedCandlesJson = "[]";
            private bool _isCandlesDirty = true;

            public void MarkCandlesDirty()
            {
                _isCandlesDirty = true;
            }

            public string GetCandlesJson()
            {
                lock (DataLock)
                {
                    if (!_isCandlesDirty && !string.IsNullOrEmpty(_cachedCandlesJson))
                    {
                        return _cachedCandlesJson;
                    }

                    var sb = new StringBuilder(Candles.Count * 90);
                    sb.Append("[");
                    for (int i = 0; i < Candles.Count; i++)
                    {
                        var c = Candles[i];
                        if (i > 0) sb.Append(",");
                        sb.Append("{\"timestamp\":\"").Append(c.timestamp).Append("\",")
                          .Append("\"open\":").Append(c.open.ToString("F2", CultureInfo.InvariantCulture)).Append(",")
                          .Append("\"high\":").Append(c.high.ToString("F2", CultureInfo.InvariantCulture)).Append(",")
                          .Append("\"low\":").Append(c.low.ToString("F2", CultureInfo.InvariantCulture)).Append(",")
                          .Append("\"close\":").Append(c.close.ToString("F2", CultureInfo.InvariantCulture)).Append(",")
                          .Append("\"volume\":").Append(c.volume).Append("}");
                    }
                    sb.Append("]");
                    _cachedCandlesJson = sb.ToString();
                    _isCandlesDirty = false;
                    return _cachedCandlesJson;
                }
            }

            public string GetBlockTradesJson()
            {
                lock (DataLock)
                {
                    var sb = new StringBuilder();
                    sb.Append("[");
                    for (int i = 0; i < BlockTrades.Count; i++)
                    {
                        var t = BlockTrades[i];
                        if (i > 0) sb.Append(",");
                        sb.Append("{\"time\":\"").Append(t.time).Append("\",")
                          .Append("\"price\":").Append(t.price.ToString("F2", CultureInfo.InvariantCulture)).Append(",")
                          .Append("\"volume\":").Append(t.volume).Append(",")
                          .Append("\"side\":\"").Append(t.side).Append("\"}");
                    }
                    sb.Append("]");
                    return sb.ToString();
                }
            }
        }

        public static void Register(string rootSymbol, string targetPanel, string fullInstrument, int tfMinutes, int port, SymbolStreamData data)
        {
            lock (_serverLock)
            {
                // Registra tanto por símbolo raiz quanto por painel de destino
                _streams[rootSymbol] = data;
                if (!string.IsNullOrEmpty(targetPanel))
                {
                    _streams[targetPanel] = data;
                }

                _activeInstanceCount++;
                _currentPort = port;

                if (!_isRunning)
                {
                    StartServer(_currentPort);
                }
            }
        }

        public static void Unregister(string rootSymbol)
        {
            lock (_serverLock)
            {
                if (_streams.ContainsKey(rootSymbol))
                {
                    var data = _streams[rootSymbol];
                    if (data != null && !string.IsNullOrEmpty(data.TargetPanel) && _streams.ContainsKey(data.TargetPanel))
                    {
                        _streams.Remove(data.TargetPanel);
                    }
                    _streams.Remove(rootSymbol);
                }
                _activeInstanceCount--;

                if (_activeInstanceCount <= 0)
                {
                    StopServer();
                }
            }
        }

        public static SymbolStreamData FindStream(string symbol, string panel)
        {
            lock (_serverLock)
            {
                // 1. Prioridade Absoluta: Correspondência por nome do Painel (ex: "NASDAQ", "RUSSEL")
                if (!string.IsNullOrEmpty(panel))
                {
                    if (_streams.TryGetValue(panel, out var dataByPanel)) return dataByPanel;

                    foreach (var kvp in _streams)
                    {
                        if (string.Equals(kvp.Value.TargetPanel, panel, StringComparison.OrdinalIgnoreCase))
                            return kvp.Value;
                    }

                    foreach (var kvp in _streams)
                    {
                        if (panel.IndexOf(kvp.Value.TargetPanel, StringComparison.OrdinalIgnoreCase) >= 0 ||
                            kvp.Value.TargetPanel.IndexOf(panel, StringComparison.OrdinalIgnoreCase) >= 0)
                            return kvp.Value;
                    }
                }

                // 2. Correspondência por símbolo raiz (ex: "NQ", "MNQ", "M2K", "RTY")
                if (!string.IsNullOrEmpty(symbol))
                {
                    if (_streams.TryGetValue(symbol, out var dataBySym)) return dataBySym;

                    string mapped = GetEquivalentSymbol(symbol);
                    if (!string.IsNullOrEmpty(mapped) && _streams.TryGetValue(mapped, out var dataByMapped)) return dataByMapped;

                    foreach (var kvp in _streams)
                    {
                        if (string.Equals(kvp.Value.RootSymbol, symbol, StringComparison.OrdinalIgnoreCase))
                            return kvp.Value;
                        if (!string.IsNullOrEmpty(mapped) && string.Equals(kvp.Value.RootSymbol, mapped, StringComparison.OrdinalIgnoreCase))
                            return kvp.Value;
                        if (kvp.Value.RootSymbol.IndexOf(symbol, StringComparison.OrdinalIgnoreCase) >= 0 ||
                            symbol.IndexOf(kvp.Value.RootSymbol, StringComparison.OrdinalIgnoreCase) >= 0)
                            return kvp.Value;
                    }
                }

                return null;
            }
        }

        private static string GetEquivalentSymbol(string sym)
        {
            if (string.IsNullOrEmpty(sym)) return "";
            string s = sym.Trim().ToUpperInvariant();
            switch (s)
            {
                case "NQ": return "MNQ";
                case "MNQ": return "NQ";
                case "RTY": return "M2K";
                case "M2K": return "RTY";
                case "ES": return "MES";
                case "MES": return "ES";
                case "YM": return "MYM";
                case "MYM": return "YM";
                case "GC": return "MGC";
                case "MGC": return "GC";
                case "CL": return "MCL";
                case "MCL": return "CL";
                default: return "";
            }
        }

        public static SymbolStreamData GetStream(string key)
        {
            return FindStream(key, key);
        }

        private static void StartServer(int port)
        {
            try
            {
                _httpListener = new HttpListener();
                _httpListener.Prefixes.Add($"http://localhost:{port}/");
                _httpListener.Prefixes.Add($"http://127.0.0.1:{port}/");
                _httpListener.Start();
                _isRunning = true;
                _httpListener.BeginGetContext(OnHttpRequestReceived, null);
                NinjaTrader.Code.Output.Process($"[VortexDataStreamer] 🟢 Servidor HTTP iniciado com sucesso em http://localhost:{port}/", PrintTo.OutputTab1);
            }
            catch (Exception ex)
            {
                NinjaTrader.Code.Output.Process($"[VortexDataStreamer] ❌ Erro ao iniciar servidor na porta {port}: {ex.Message}", PrintTo.OutputTab1);
            }
        }

        private static void StopServer()
        {
            try
            {
                _isRunning = false;
                if (_httpListener != null && _httpListener.IsListening)
                {
                    _httpListener.Stop();
                    _httpListener.Close();
                }
                NinjaTrader.Code.Output.Process("[VortexDataStreamer] Servidor HTTP finalizado.", PrintTo.OutputTab1);
            }
            catch { }
            finally
            {
                _httpListener = null;
            }
        }

        private static void OnHttpRequestReceived(IAsyncResult ar)
        {
            if (!_isRunning || _httpListener == null) return;

            try
            {
                HttpListenerContext context = _httpListener.EndGetContext(ar);
                _httpListener.BeginGetContext(OnHttpRequestReceived, null);

                HttpListenerRequest req = context.Request;
                HttpListenerResponse res = context.Response;

                // CORS Headers habilitados para consumo pelo navegador
                res.Headers.Add("Access-Control-Allow-Origin", "*");
                res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                res.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey");

                if (req.HttpMethod == "OPTIONS")
                {
                    res.StatusCode = 200;
                    res.Close();
                    return;
                }

                string path = req.Url.AbsolutePath.ToLowerInvariant();

                // 1. Endpoint /status
                if (path == "/status" || path == "/ping")
                {
                    var sb = new StringBuilder();
                    sb.Append("{\"status\":\"online\",\"version\":\"1.1.0\",\"service\":\"VortexDataStreamer\",");
                    sb.Append("\"active_streams\":[");

                    lock (_serverLock)
                    {
                        int idx = 0;
                        var uniqueList = new List<SymbolStreamData>();
                        foreach (var kvp in _streams)
                        {
                            if (!uniqueList.Contains(kvp.Value))
                            {
                                uniqueList.Add(kvp.Value);
                            }
                        }

                        foreach (var s in uniqueList)
                        {
                            if (idx > 0) sb.Append(",");
                            sb.Append("{\"symbol\":\"").Append(s.RootSymbol).Append("\",")
                              .Append("\"panel\":\"").Append(s.TargetPanel).Append("\",")
                              .Append("\"instrument\":\"").Append(s.FullInstrument).Append("\",")
                              .Append("\"timeframe\":").Append(s.TimeframeMinutes).Append(",")
                              .Append("\"bars_count\":").Append(s.Candles.Count).Append(",")
                              .Append("\"block_trades_count\":").Append(s.BlockTrades.Count).Append(",")
                              .Append("\"last_price\":").Append(s.CurrentPrice.ToString("F2", CultureInfo.InvariantCulture)).Append(",")
                              .Append("\"updated_at\":\"").Append(s.LastUpdateUtc.ToString("o")).Append("\"}");
                            idx++;
                        }
                    }

                    sb.Append("]}");
                    SendJson(res, sb.ToString());
                    return;
                }

                // Extração dos parâmetros symbol ou panel
                string reqSymbol = req.QueryString["symbol"] ?? req.QueryString["ativo"] ?? "";
                string reqPanel = req.QueryString["panel"] ?? req.QueryString["painel"] ?? "";

                var stream = FindStream(reqSymbol, reqPanel);

                // 2. Endpoint /candles (Histórico de 1m)
                if (path == "/candles" || path == "/bars")
                {
                    if (stream == null)
                    {
                        SendJson(res, "{\"error\":\"Símbolo ou painel não encontrado ou não transmitindo.\",\"candles\":[]}", 404);
                        return;
                    }

                    string candlesJson = stream.GetCandlesJson();
                    string resp = $"{{\"symbol\":\"{stream.RootSymbol}\",\"panel\":\"{stream.TargetPanel}\",\"count\":{stream.Candles.Count},\"candles\":{candlesJson}}}";
                    SendJson(res, resp);
                    return;
                }

                // 3. Endpoint /market_data (Cotação em tempo real, candle atual e Block Trades)
                if (path == "/market_data" || path == "/quote" || path == "/tick")
                {
                    if (stream == null)
                    {
                        SendJson(res, "{\"error\":\"Símbolo ou painel não encontrado.\",\"price\":0}", 404);
                        return;
                    }

                    lock (stream.DataLock)
                    {
                        string btJson = stream.GetBlockTradesJson();
                        string json = $"{{\"symbol\":\"{stream.RootSymbol}\",\"panel\":\"{stream.TargetPanel}\"," +
                                      $"\"price\":{stream.CurrentPrice.ToString("F2", CultureInfo.InvariantCulture)}," +
                                      $"\"open\":{stream.CurrentOpen.ToString("F2", CultureInfo.InvariantCulture)}," +
                                      $"\"high\":{stream.CurrentHigh.ToString("F2", CultureInfo.InvariantCulture)}," +
                                      $"\"low\":{stream.CurrentLow.ToString("F2", CultureInfo.InvariantCulture)}," +
                                      $"\"close\":{stream.CurrentClose.ToString("F2", CultureInfo.InvariantCulture)}," +
                                      $"\"volume\":{stream.CurrentVolume}," +
                                      $"\"timestamp\":\"{stream.CurrentTimestamp}\"," +
                                      $"\"updated_at\":\"{stream.LastUpdateUtc:o}\"," +
                                      $"\"block_trades\":{btJson}}}";
                        SendJson(res, json);
                    }
                    return;
                }

                // 404 para endpoints desconhecidos
                SendJson(res, "{\"error\":\"Endpoint desconhecido. Use /status, /candles ou /market_data\"}", 404);
            }
            catch (Exception ex)
            {
                try
                {
                    NinjaTrader.Code.Output.Process($"[VortexDataStreamer] Erro HTTP: {ex.Message}", PrintTo.OutputTab1);
                }
                catch { }
            }
        }

        private static void SendJson(HttpListenerResponse res, string json, int statusCode = 200)
        {
            try
            {
                byte[] buffer = Encoding.UTF8.GetBytes(json);
                res.StatusCode = statusCode;
                res.ContentType = "application/json; charset=utf-8";
                res.ContentLength64 = buffer.Length;
                using (Stream output = res.OutputStream)
                {
                    output.Write(buffer, 0, buffer.Length);
                }
            }
            catch { }
        }
    }

    // =========================================================================
    // INDICADOR NINJASCRIPT: VORTEX DATA STREAMER v1.1
    // Deve ser inserido em um gráfico de 1 minuto do NinjaTrader 8
    // =========================================================================
    public class VortexDataStreamer : Indicator
    {
        private VortexStreamerServer.SymbolStreamData _streamData;
        private string _rootSymbol = "";
        private string _resolvedPanel = "";
        private bool _isCompatible = true;
        private string _incompatibleReason = "";
        private int _lastProcessedBar = -1;
        private DateTime _lastUpdateUtc = DateTime.MinValue;
        private SessionIterator _sessionIterator;
        private DateTime _lastTradingDay = Core.Globals.MinDate;

        #region Parâmetros na UI do NinjaTrader
        [NinjaScriptProperty]
        [Display(Name = "1. Painel de Destino", Description = "'Auto' mapeia pelo ativo (NQ->NASDAQ, RTY->RUSSEL, etc.) ou informe o nome do painel.", Order = 1, GroupName = "Vortex Web")]
        public string TargetPanel { get; set; } = "Auto";

        [NinjaScriptProperty]
        [Display(Name = "2. Frequência de Atualização (ms)", Description = "Intervalo mínimo entre atualizações em tempo real (mínimo 50ms, padrão 100ms).", Order = 2, GroupName = "Vortex Web")]
        [Range(50, 2000)]
        public int UpdateFrequencyMs { get; set; } = 100;

        [NinjaScriptProperty]
        [Display(Name = "3. Filtro Mínimo Block Trade (Lotes)", Description = "Volume mínimo de um trade para ser considerado Block Trade / Agressão Institucional (ex: 50 ou 100).", Order = 3, GroupName = "Vortex Web")]
        [Range(1, 10000)]
        public int BlockTradeThreshold { get; set; } = 50;

        [NinjaScriptProperty]
        [Display(Name = "4. Porta HTTP Local", Description = "Porta local para transmissão de dados (padrão 8002).", Order = 4, GroupName = "Vortex Web")]
        [Range(1024, 65535)]
        public int ServerPort { get; set; } = 8002;

        [NinjaScriptProperty]
        [Display(Name = "5. Exibir HUD no Gráfico", Description = "Exibe no canto superior o status da transmissão ao vivo.", Order = 5, GroupName = "Vortex Web")]
        public bool ShowHud { get; set; } = true;
        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = "Transmissor de candles de 1m, cotações e Block Trades em tempo real para os painéis VortexWeb.";
                Name = "VortexDataStreamer";
                Calculate = Calculate.OnEachTick;
                IsOverlay = true;
                DisplayInDataBox = false;
                PaintPriceMarkers = false;
                IsSuspendedWhileInactive = false;
            }
            else if (State == State.Configure)
            {
                // Identifica o símbolo raiz (ex: NQ, MNQ, RTY, M2K, ES, GC, CL)
                if (Instrument != null && Instrument.MasterInstrument != null)
                {
                    _rootSymbol = Instrument.MasterInstrument.Name.ToUpperInvariant();
                }
                else
                {
                    _rootSymbol = "UNKNOWN";
                }

                // Resolve o painel de destino e valida a família de ativos
                ResolvePanelAndValidate();
            }
            else if (State == State.DataLoaded)
            {
                // Re-garante a identificação do símbolo mesmo se Instrument estava pendente em State.Configure
                if (Instrument != null && Instrument.MasterInstrument != null)
                {
                    _rootSymbol = Instrument.MasterInstrument.Name.ToUpperInvariant();
                }
                else if (Instrument != null && !string.IsNullOrEmpty(Instrument.FullName))
                {
                    _rootSymbol = Instrument.FullName.Split(' ')[0].ToUpperInvariant();
                }

                // Resolve o painel de destino e valida a família
                ResolvePanelAndValidate();

                if (!_isCompatible)
                {
                    UpdateHud();
                    Print($"[VortexDataStreamer] ❌ Ativo {_rootSymbol} incompatível com painel {TargetPanel}: {_incompatibleReason}");
                    return;
                }

                _streamData = new VortexStreamerServer.SymbolStreamData
                {
                    RootSymbol = _rootSymbol,
                    FullInstrument = Instrument != null ? Instrument.FullName : _rootSymbol,
                    TargetPanel = _resolvedPanel,
                    TimeframeMinutes = BarsPeriod.Value
                };

                // Carrega todo o histórico do Data Series em lote
                LoadHistoricalBars();

                // Registra no servidor HTTP singleton
                VortexStreamerServer.Register(_rootSymbol, _resolvedPanel, _streamData.FullInstrument, _streamData.TimeframeMinutes, ServerPort, _streamData);

                Print($"[VortexDataStreamer] 🚀 Inicializado com sucesso para {_rootSymbol} ({_streamData.Candles.Count} candles de 1m)");

                if (Bars != null)
                {
                    _sessionIterator = new SessionIterator(Bars);
                    _lastTradingDay = Core.Globals.MinDate;
                }

                // Desenha o HUD imediatamente para que o usuário veja a confirmação visual na hora!
                UpdateHud();
            }
            else if (State == State.Terminated)
            {
                if (!string.IsNullOrEmpty(_rootSymbol))
                {
                    VortexStreamerServer.Unregister(_rootSymbol);
                }

                if (ShowHud)
                {
                    try
                    {
                        Draw.TextFixed(this, "VortexHUD", string.Empty, TextPosition.TopRight);
                    }
                    catch { }
                }
            }
        }

        private void ResolvePanelAndValidate()
        {
            string cleanTarget = (TargetPanel ?? "Auto").Trim().ToUpperInvariant();

            // Se o usuário digitou o nome do painel manualmente (ex: "NASDAQ", "RUSSEL", etc.), respeita 100%!
            if (cleanTarget != "AUTO" && !string.IsNullOrEmpty(cleanTarget))
            {
                _resolvedPanel = cleanTarget;
                _isCompatible = true;
                return;
            }

            // Mapeamento automático pelo ativo (NQ, MNQ, NNQ, RTY, M2K, ES, MES, GC, CL, etc.)
            string sym = (_rootSymbol ?? "").ToUpperInvariant();
            if (sym.Contains("NQ") || sym.Contains("NAS") || sym.Contains("USTEC"))
            {
                _resolvedPanel = "NASDAQ";
            }
            else if (sym.Contains("RTY") || sym.Contains("M2K") || sym.Contains("RUSSEL"))
            {
                _resolvedPanel = "RUSSEL";
            }
            else if (sym.Contains("ES") || sym.Contains("MES") || sym.Contains("SP"))
            {
                _resolvedPanel = "SP500";
            }
            else if (sym.Contains("YM") || sym.Contains("MYM") || sym.Contains("DOW"))
            {
                _resolvedPanel = "DOWJONES";
            }
            else if (sym.Contains("GC") || sym.Contains("MGC") || sym.Contains("GOLD") || sym.Contains("OURO"))
            {
                _resolvedPanel = "GOLD";
            }
            else if (sym.Contains("CL") || sym.Contains("MCL") || sym.Contains("OIL") || sym.Contains("PETR"))
            {
                _resolvedPanel = "OIL";
            }
            else if (sym.Contains("WIN"))
            {
                _resolvedPanel = "INDICE_B3";
            }
            else if (sym.Contains("WDO"))
            {
                _resolvedPanel = "DOLAR_B3";
            }
            else
            {
                _resolvedPanel = !string.IsNullOrEmpty(sym) ? sym : "PAINEL";
            }

            _isCompatible = true;
        }

        private void LoadHistoricalBars()
        {
            if (_streamData == null || Bars == null) return;

            lock (_streamData.DataLock)
            {
                _streamData.Candles.Clear();

                for (int i = 0; i < Bars.Count; i++)
                {
                    DateTime timeUtc = Bars.GetTime(i).ToUniversalTime();
                    string isoTime = timeUtc.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

                    var candle = new VortexStreamerServer.CandleItem
                    {
                        timestamp = isoTime,
                        open = Bars.GetOpen(i),
                        high = Bars.GetHigh(i),
                        low = Bars.GetLow(i),
                        close = Bars.GetClose(i),
                        volume = (long)Bars.GetVolume(i)
                    };

                    _streamData.Candles.Add(candle);
                }

                _streamData.MarkCandlesDirty();
            }
        }

        // =========================================================================
        // ONMARKETDATA: Captura em tempo real de Block Trades / Agressão de Lotes
        // Funciona tanto em Tempo Real quanto no Replay de Mercado do NinjaTrader!
        // =========================================================================
        protected override void OnMarketData(MarketDataEventArgs e)
        {
            if (!_isCompatible || _streamData == null) return;

            if (e.MarketDataType == MarketDataType.Last)
            {
                long vol = (long)e.Volume;
                if (vol >= BlockTradeThreshold)
                {
                    string side = e.Price >= e.Ask ? "COMPRA" : (e.Price <= e.Bid ? "VENDA" : "COMPRA");

                    var trade = new VortexStreamerServer.BlockTradeItem
                    {
                        time = DateTime.Now.ToString("HH:mm:ss"),
                        price = e.Price,
                        volume = vol,
                        side = side
                    };

                    lock (_streamData.DataLock)
                    {
                        _streamData.BlockTrades.Add(trade);
                        if (_streamData.BlockTrades.Count > 50)
                        {
                            _streamData.BlockTrades.RemoveAt(0);
                        }
                    }
                }
            }
        }

        private void UpdateHud()
        {
            if (!ShowHud) return;

            if (!_isCompatible)
            {
                string errText = $"❌ ERRO VORTEX STREAMER:\n{_incompatibleReason}\nAjuste o painel nas propriedades do indicador (F6).";
                Draw.TextFixed(this, "VortexHUD", errText, TextPosition.TopRight,
                    System.Windows.Media.Brushes.OrangeRed,
                    new NinjaTrader.Gui.Tools.SimpleFont("Segoe UI", 10) { Bold = true },
                    System.Windows.Media.Brushes.Red,
                    System.Windows.Media.Brushes.Black,
                    90);
                return;
            }

            int count = _streamData != null ? _streamData.Candles.Count : (Bars != null ? Bars.Count : 0);
            int btCount = _streamData != null ? _streamData.BlockTrades.Count : 0;
            double price = (Close != null && CurrentBar >= 0) ? Close[0] : (_streamData != null ? _streamData.CurrentPrice : 0);

            string tfWarning = "";
            if (BarsPeriod.BarsPeriodType != BarsPeriodType.Minute || BarsPeriod.Value != 1)
            {
                tfWarning = $"\n⚠️ Gráfico em {BarsPeriod.Value}m (recomendado: 1m)";
            }

            string hudText = $"🟢 VORTEX STREAMER | {_rootSymbol} ➔ Painel {_resolvedPanel}\n" +
                             $"📊 {count:N0} velas de 1m | Freq: {UpdateFrequencyMs}ms\n" +
                             $"⚡ Preço: {price:F2} | Block Trades: {btCount} (≥{BlockTradeThreshold} ct){tfWarning}";

            Draw.TextFixed(this, "VortexHUD", hudText, TextPosition.TopRight,
                System.Windows.Media.Brushes.LimeGreen,
                new NinjaTrader.Gui.Tools.SimpleFont("Segoe UI", 10) { Bold = true },
                System.Windows.Media.Brushes.DimGray,
                System.Windows.Media.Brushes.Black,
                85);
        }

        protected override void OnBarUpdate()
        {
            if (!_isCompatible)
            {
                UpdateHud();
                return;
            }

            if (CurrentBar < 1 || _streamData == null) return;

            bool isNewBar = CurrentBar > _lastProcessedBar;
            DateTime nowUtc = DateTime.UtcNow;

            // Throttling de frequência para não sobrecarregar com excesso de ticks intradiários
            if (!isNewBar && (nowUtc - _lastUpdateUtc).TotalMilliseconds < UpdateFrequencyMs)
            {
                return;
            }

            _lastUpdateUtc = nowUtc;

            lock (_streamData.DataLock)
            {
                // 1. Quando uma barra fecha e inicia a nova: adiciona o candle fechado ao histórico
                if (isNewBar)
                {
                    // 🚩 DETECÇÃO DO PRIMEIRO CANDLE DA NOVA SESSÃO OFICIAL DE MERCADO
                    if (State == State.Realtime)
                    {
                        try
                        {
                            bool isFirstBar = Bars.IsFirstBarOfSession;
                            DateTime currentTradingDay = DateTime.MinValue;
                            if (_sessionIterator != null && Bars.BarsType.IsIntraday)
                            {
                                currentTradingDay = _sessionIterator.GetTradingDay(Time[0]);
                            }

                            if (isFirstBar || (currentTradingDay != DateTime.MinValue && _lastTradingDay != Core.Globals.MinDate && currentTradingDay != _lastTradingDay))
                            {
                                _lastTradingDay = currentTradingDay;
                                NinjaTrader.NinjaScript.AddOns.AxionGatewayAddOn.NotificarPrimeiroCandleSessao(Time[0], currentTradingDay, Instrument?.FullName ?? _rootSymbol);
                            }
                            else if (_lastTradingDay == Core.Globals.MinDate && currentTradingDay != DateTime.MinValue)
                            {
                                _lastTradingDay = currentTradingDay;
                            }
                        }
                        catch { }
                    }

                    if (_lastProcessedBar >= 0)
                    {
                        int closedBarIdx = CurrentBar - 1;
                        if (closedBarIdx >= 0)
                        {
                            DateTime closedTimeUtc = Time[1].ToUniversalTime();
                            var closedCandle = new VortexStreamerServer.CandleItem
                            {
                                timestamp = closedTimeUtc.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                                open = Open[1],
                                high = High[1],
                                low = Low[1],
                                close = Close[1],
                                volume = (long)Volume[1]
                            };

                            _streamData.Candles.Add(closedCandle);

                            // Mantém limite saudável de memória (ex: últimas 50.000 barras)
                            if (_streamData.Candles.Count > 50000)
                            {
                                _streamData.Candles.RemoveAt(0);
                            }

                            _streamData.MarkCandlesDirty();
                        }
                    }

                    _lastProcessedBar = CurrentBar;
                }

                // 2. Atualiza a barra corrente em formação e o preço atual
                _streamData.CurrentPrice = Close[0];
                _streamData.CurrentOpen = Open[0];
                _streamData.CurrentHigh = High[0];
                _streamData.CurrentLow = Low[0];
                _streamData.CurrentClose = Close[0];
                _streamData.CurrentVolume = (long)Volume[0];
                _streamData.CurrentTimestamp = Time[0].ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
                _streamData.LastUpdateUtc = DateTime.UtcNow;
            }

            // 3. Atualiza o HUD visual de alta visibilidade
            UpdateHud();
        }
    }
}

#region NinjaScript generated code. Neither change nor remove.

namespace NinjaTrader.NinjaScript.Indicators
{
	public partial class Indicator : NinjaTrader.Gui.NinjaScript.IndicatorRenderBase
	{
		private VortexDataStreamer[] cacheVortexDataStreamer;
		public VortexDataStreamer VortexDataStreamer(string targetPanel, int updateFrequencyMs, int blockTradeThreshold, int serverPort, bool showHud)
		{
			return VortexDataStreamer(Input, targetPanel, updateFrequencyMs, blockTradeThreshold, serverPort, showHud);
		}

		public VortexDataStreamer VortexDataStreamer(ISeries<double> input, string targetPanel, int updateFrequencyMs, int blockTradeThreshold, int serverPort, bool showHud)
		{
			if (cacheVortexDataStreamer != null)
				for (int idx = 0; idx < cacheVortexDataStreamer.Length; idx++)
					if (cacheVortexDataStreamer[idx] != null && cacheVortexDataStreamer[idx].TargetPanel == targetPanel && cacheVortexDataStreamer[idx].UpdateFrequencyMs == updateFrequencyMs && cacheVortexDataStreamer[idx].BlockTradeThreshold == blockTradeThreshold && cacheVortexDataStreamer[idx].ServerPort == serverPort && cacheVortexDataStreamer[idx].ShowHud == showHud && cacheVortexDataStreamer[idx].EqualsInput(input))
						return cacheVortexDataStreamer[idx];
			return CacheIndicator<VortexDataStreamer>(new VortexDataStreamer(){ TargetPanel = targetPanel, UpdateFrequencyMs = updateFrequencyMs, BlockTradeThreshold = blockTradeThreshold, ServerPort = serverPort, ShowHud = showHud }, input, ref cacheVortexDataStreamer);
		}
	}
}

namespace NinjaTrader.NinjaScript.MarketAnalyzerColumns
{
	public partial class MarketAnalyzerColumn : MarketAnalyzerColumnBase
	{
		public Indicators.VortexDataStreamer VortexDataStreamer(string targetPanel, int updateFrequencyMs, int blockTradeThreshold, int serverPort, bool showHud)
		{
			return indicator.VortexDataStreamer(Input, targetPanel, updateFrequencyMs, blockTradeThreshold, serverPort, showHud);
		}

		public Indicators.VortexDataStreamer VortexDataStreamer(ISeries<double> input , string targetPanel, int updateFrequencyMs, int blockTradeThreshold, int serverPort, bool showHud)
		{
			return indicator.VortexDataStreamer(input, targetPanel, updateFrequencyMs, blockTradeThreshold, serverPort, showHud);
		}
	}
}

namespace NinjaTrader.NinjaScript.Strategies
{
	public partial class Strategy : NinjaTrader.Gui.NinjaScript.StrategyRenderBase
	{
		public Indicators.VortexDataStreamer VortexDataStreamer(string targetPanel, int updateFrequencyMs, int blockTradeThreshold, int serverPort, bool showHud)
		{
			return indicator.VortexDataStreamer(Input, targetPanel, updateFrequencyMs, blockTradeThreshold, serverPort, showHud);
		}

		public Indicators.VortexDataStreamer VortexDataStreamer(ISeries<double> input , string targetPanel, int updateFrequencyMs, int blockTradeThreshold, int serverPort, bool showHud)
		{
			return indicator.VortexDataStreamer(input, targetPanel, updateFrequencyMs, blockTradeThreshold, serverPort, showHud);
		}
	}
}

#endregion
