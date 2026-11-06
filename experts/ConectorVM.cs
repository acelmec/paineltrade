#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Xml.Serialization;
using NinjaTrader.Custom;
using NinjaTrader.Gui.NinjaScript;
using NinjaTrader.Cbi;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.Gui.Tools;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.Core.FloatingPoint;
using NinjaTrader.NinjaScript.Indicators;
using NinjaTrader.NinjaScript.DrawingTools;
using NinjaTrader.NinjaScript.StrategyGenerator;
using System.Windows.Controls;
using System.Net;
#endregion

namespace NinjaTrader.NinjaScript.Strategies
{
    public class ConectorVM : Strategy
    {
        // =====================================================================
        // 🔒 FLAG DE MODO
        // =====================================================================
        private const bool DEVELOPER_MODE = false;

        // =====================================================================
        // LICENÇA E IDENTIFICAÇÃO
        // =====================================================================
        private string metodovalidar = "assinatura";
        private string allowedMachineId = "7C1ABAF8961E1F923C578D2D33AC90FD";
        private bool isValid = false;
        private string status0, status1;
        private string consumerKey = "ck_75f9d0f430cb40c64c902ed43ce2bceb08e5e649";
        private string consumerSecret = "cs_a741c57b4368102a1daf3fbfc4598833ffb23e77";
        private int CodProduto = 7375;
        private bool popupErroLicencaJaExibido = false;

        private const string LicenseCacheFileName = "vmbot_license.enc";
        private string licenseCachePath;
        private DateTime? ultimaValidacaoCache = null;

        // =====================================================================
        // ORDENS E EXECUÇÃO
        // =====================================================================
        private int orderSellStopBar = -1;
        private int orderBuyStopBar  = -1;
        private Order sellStopOrder;
        private Order buyStopOrder;
        private Order sellOrder;
        private Order buyOrder;

        // ── TRAIL STOP – DataSeries 1s (Strategy Analyzer + Live) ──
        private int TrailSeries1s_Index = -1;
        private bool breakEvenTriggered = false;
        private double trailStopPrice = 0.0;
        private int trailStepCount = 0;

        // ── MA CLOSE ──
        private SMA _smaClosePosition;

        private int QuantOperacoes;
        private DateTime _dataHoje = DateTime.MinValue;
        private DateTime dailySessionDate = DateTime.MinValue;
        private bool dailyLimitReached = false;
        private bool robotTravado = false;
        private double realizadoConta = 0;
        private bool allowTrading = false;
        private int activationBar = -1;
        private bool hasReachedRealtime = false;
        private HashSet<long> realtimeOrderIds = new HashSet<long>();

        // ── CREDENCIAIS SUPABASE ──
        private string supabaseUrl = "https://db.vemviraramesa.com.br";
        private string supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY";
        private string referenceSymbol = "NQ";

        // ── ESTADO DO SINAL ──
        private VM_Signal _currentSignal = null;
        private VM_Signal _lastExecutedSignal = null;
        private double _lastSyncedSlPrice = 0.0;
        private double _lastSyncedTpPrice = 0.0;
        private DateTime _lastPositionClosedTime = DateTime.MinValue;
        private MarketPosition _previousMarketPosition = MarketPosition.Flat;
        private DateTime _lastPollTime = DateTime.MinValue;
        private readonly object _signalLock = new object();
        private bool _signalConsumed = false;
        private string _lastSignalId = "";
        private volatile bool _forceCloseSignal = false;
        private List<string> _executedSignalIds = new List<string>();

        // ── POLLING ──
        private Task _pollTask = null;
        private bool _isPolling = false;
        private const int VM_POLL_INTERVAL_MS = 250;

        // ── UI E PAINEL ──
        private Border    _mainBorder;
        private TextBlock _tbAccount;
        private TextBlock _tbClock;
        private TextBlock _tbParams;
        private TextBlock _tbPnL;
        private TextBlock _tbStatus;
        private System.Windows.Controls.Grid _cachedChartGrid;
        private int _uiTickCounter = 0;

        private string _pAccount = "", _pClock = "", _pParams = "", _pPnL = "", _pStatus = "";
        private Brush  _pPnLBrush    = Brushes.White;
        private Brush  _pStatusBrush = Brushes.Cyan;

        // ── ESTRUTURA DO SINAL ──
        private class VM_Signal
        {
            public string Id { get; set; }
            public string StrategyId { get; set; } 
            public string StrategyName { get; set; }
            public string Side { get; set; }
            public double EntryPrice { get; set; }
            public double StopLoss { get; set; }
            public double TakeProfit { get; set; }
            public string Symbol { get; set; }
            public DateTime CreatedAt { get; set; }
            public bool IsActive { get; set; }
            public int SlTicks { get; set; }
            public int TpTicks { get; set; }
            public int Direction { get; set; } // 1 = Buy, -1 = Sell
            public double Contrato { get; set; }
            public string Status { get; set; }
        }

        // =====================================================================
        // ENUMS
        // =====================================================================
        public enum OperatingMode { Comprado, Vendido, Ambos }
        public enum estrategiaMode { ConectorVM, ConectorLocal }
        public enum orderMode { Mercado, PendenteStop, PendenteLimit }
        public enum contratoOrigem { Robo, Painel }
        public enum sltpOrigem { Robo, Painel }

        // =====================================================================
        // INITIALIZATION (State.SetDefaults / State.Configure / State.DataLoaded)
        // =====================================================================
        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description                                 = @"ConectorVM - Robô Conector Dedicado NinjaTrader 8";
                Name                                        = "ConectorVM";
                Calculate                                   = Calculate.OnPriceChange;
                EntriesPerDirection                         = 1;
                EntryHandling                               = EntryHandling.AllEntries;
                IsExitOnSessionCloseStrategy                = false;
                ExitOnSessionCloseSeconds                   = 30;
                IsFillLimitOnTouch                          = false;
                MaximumBarsLookBack                         = MaximumBarsLookBack.TwoHundredFiftySix;
                OrderFillResolution                         = OrderFillResolution.Standard;
                Slippage                                    = 0;
                StartBehavior                               = StartBehavior.WaitUntilFlat;
                TimeInForce                                 = TimeInForce.Gtc;
                TraceOrders                                 = false;
                RealtimeErrorHandling                       = RealtimeErrorHandling.StopCancelClose;
                StopTargetHandling                          = StopTargetHandling.PerEntryExecution;
                BarsRequiredToTrade                         = 5;
                IncludeCommission                           = true;

                // 01. GERAL
                DebugMode                                   = true;

                // 02. LICENÇA
                IDAssinatura                                = "0000";

                // 03. PARÂMETROS OPERAÇÃO
                NomeEstrategia                              = "Conector Vortex";
                currentOperatingMode                        = OperatingMode.Ambos;
                currentEstrategia                           = estrategiaMode.ConectorVM;
                MaxOrderSession                             = 50;
                OrderMode                                   = orderMode.Mercado;
                distancePrice                               = 10;
                CancelAfterBars                             = 0;
                CancelOrdersAfterStopTime                   = true;

                // 04. CONECTOR (Gestão do Sinal)
                VM_PainelId                                 = "";
                VM_StrategyId                               = "";
                ContratoOrigem                              = contratoOrigem.Robo;
                ContratoFatorMult                           = 1.0;
                StopLossOrigem                              = sltpOrigem.Painel;
                TakeProfitOrigem                            = sltpOrigem.Painel;
                VM_MaxSignalAgeSeconds                      = 60;
                VM_MonitorarEncerramentoPainel              = true;

                // 05. RISCO
                LOTE_Size                                   = 1;
                SL_Ticks                                    = 50;
                TP_Ticks                                    = 30;
                TRAIL_MODE                                  = false;
                TRAIL_Start                                 = 20;
                TRAIL_StopDistance                          = 15;
                TRAIL_Step                                  = 5;

                OrderCloseMA                                = false;
                ProfitCloseMA                               = 50;
                ProfitCloseMAPeriod                         = 20;

                // 06. SEGURANÇA
                MoneyClosed                                 = false;
                LossesAllOrders                             = 500;
                ProfitAllOrders                             = 1000;
                DailyLossActive                             = false;
                DailyLossLimit                              = 500;
                DailyProfitActive                           = false;
                DailyProfitLimit                            = 1000;

                // 07. HORÁRIO DE OPERAÇÃO
                TIME_Start                                  = DateTime.Parse("09:00", System.Globalization.CultureInfo.InvariantCulture);
                Second_Start                                = 0;
                TIME_Stop                                   = DateTime.Parse("17:00", System.Globalization.CultureInfo.InvariantCulture);
                Janela2Ativa                                = false;
                TIME_Start2                                 = DateTime.Parse("13:00", System.Globalization.CultureInfo.InvariantCulture);
                TIME_Stop2                                  = DateTime.Parse("15:00", System.Globalization.CultureInfo.InvariantCulture);
            }
            else if (State == State.Configure)
            {
                if (TRAIL_MODE)
                {
                    AddDataSeries(BarsPeriodType.Second, 1);
                    TrailSeries1s_Index = 1;
                }
            }
            else if (State == State.DataLoaded)
            {
                referenceSymbol = Instrument.MasterInstrument.Name;

                if (OrderCloseMA && ProfitCloseMAPeriod > 0)
                {
                    _smaClosePosition = SMA(ProfitCloseMAPeriod);
                }

                if (DEVELOPER_MODE)
                {
                    isValid = true;
                    status1 = "Modo Desenvolvedor Ativo";
                }
                else
                {
                    ValidarLicenca();
                }

                InitializeConectorVM();
            }
            else if (State == State.Historical)
            {
                if (ChartControl != null)
                {
                    ChartControl.Dispatcher.InvokeAsync(() =>
                    {
                        CreateWpfPanel();
                    });
                }
            }
            else if (State == State.Realtime)
            {
                hasReachedRealtime = true;
                allowTrading = true;
                activationBar = CurrentBar;
            }
            else if (State == State.Terminated)
            {
                StopVMPolling();
                RemoveWpfPanel();
            }
        }

        // =====================================================================
        // VALIDAÇÃO DE LICENÇA COM CACHE
        // =====================================================================
        #region Licenca
        private void ValidarLicenca()
        {
            if (LerCacheLicenca())
            {
                isValid = true;
                status1 = "Licença Válida (Cache)";
                return;
            }

            try
            {
                if (string.IsNullOrWhiteSpace(IDAssinatura) || IDAssinatura.Trim() == "0000")
                {
                    status0 = "Assinatura não configurada!";
                    isValid = false;
                    return;
                }

                string url = $"https://ffbinvest.amsolucoes.net.br/wp-json/wc/v3/subscriptions/{IDAssinatura}?consumer_key={consumerKey}&consumer_secret={consumerSecret}";
                using (WebClient client = new WebClient())
                {
                    string json = client.DownloadString(url);
                    string machineId = Cbi.License.MachineId;

                    if (!string.IsNullOrEmpty(json) && (json.Contains("\"status\":\"active\"") || json.Contains("\"status\":\"on-hold\"")))
                    {
                        if (json.Contains($"\"product_id\":{CodProduto}"))
                        {
                            string idNtPattern = "\"key\":\"id_nt\"";
                            int idNtKeyIndex = json.IndexOf(idNtPattern, StringComparison.OrdinalIgnoreCase);
                            if (idNtKeyIndex >= 0)
                            {
                                string vp = "\"value\":\"";
                                int vs = json.IndexOf(vp, idNtKeyIndex, StringComparison.OrdinalIgnoreCase);
                                if (vs >= 0)
                                {
                                    vs += vp.Length;
                                    int ve = json.IndexOf("\"", vs);
                                    if (ve >= 0)
                                    {
                                        string idNtValue = json.Substring(vs, ve - vs);
                                        if (idNtValue.Equals(machineId, StringComparison.OrdinalIgnoreCase))
                                        {
                                            status1 = "Assinatura Válida!";
                                            isValid = true;
                                            SalvarCacheLicenca();
                                            return;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                status0 = "Assinatura inválida ou ID Machine não confere!";
                isValid = false;
            }
            catch (Exception ex)
            {
                status0 = "Erro ao validar licença: " + ex.Message;
                isValid = false;
            }
        }

        private string SimpleEncrypt(string t)
        {
            const string k = "VMBOT_LICENSE_KEY_2025";
            byte[] inp = Encoding.UTF8.GetBytes(t), kb = Encoding.UTF8.GetBytes(k), o = new byte[inp.Length];
            for (int i = 0; i < inp.Length; i++) o[i] = (byte)(inp[i] ^ kb[i % kb.Length]);
            return Convert.ToBase64String(o);
        }

        private string SimpleDecrypt(string t)
        {
            try { const string k = "VMBOT_LICENSE_KEY_2025"; byte[] inp = Convert.FromBase64String(t), kb = Encoding.UTF8.GetBytes(k), o = new byte[inp.Length]; for (int i = 0; i < inp.Length; i++) o[i] = (byte)(inp[i] ^ kb[i % kb.Length]); return Encoding.UTF8.GetString(o); } catch { return ""; }
        }

        private bool LerCacheLicenca()
        {
            try
            {
                licenseCachePath = Path.Combine(NinjaTrader.Core.Globals.UserDataDir, LicenseCacheFileName);
                if (!File.Exists(licenseCachePath)) return false;
                string json = SimpleDecrypt(File.ReadAllText(licenseCachePath));
                string idM  = ExtractJsonField(json, "idMachine");
                string ids  = ExtractJsonField(json, "idAssinatura");
                string dat  = ExtractJsonField(json, "dataValidacao");
                if (string.IsNullOrEmpty(idM) || string.IsNullOrEmpty(ids) || string.IsNullOrEmpty(dat)) return false;
                if (!DateTime.TryParse(dat, out DateTime dv)) return false;
                if (idM != Cbi.License.MachineId) return false;
                if (ids != IDAssinatura) return false;
                if ((DateTime.UtcNow - dv).TotalHours > 24) return false;
                ultimaValidacaoCache = dv;
                return true;
            }
            catch { return false; }
        }

        private void SalvarCacheLicenca()
        {
            try
            {
                licenseCachePath = Path.Combine(NinjaTrader.Core.Globals.UserDataDir, LicenseCacheFileName);
                string json = $"{{\"idMachine\":\"{Cbi.License.MachineId}\",\"idAssinatura\":\"{IDAssinatura}\",\"dataValidacao\":\"{DateTime.UtcNow:o}\"}}";
                File.WriteAllText(licenseCachePath, SimpleEncrypt(json));
            }
            catch { }
        }
        #endregion

        // =====================================================================
        // ON BAR UPDATE & MARKET DATA
        // =====================================================================
        protected override void OnMarketData(MarketDataEventArgs e)
        {
            if (e.MarketDataType != MarketDataType.Last) return;

            // Fechamento forçado vindo do painel
            if (_forceCloseSignal && Position.MarketPosition != MarketPosition.Flat)
            {
                ExecuteForceClose();
            }

            // Monitor de TrailStop
            if (TRAIL_MODE && Position.MarketPosition != MarketPosition.Flat)
            {
                ProcessTrailStopMarket(e.Price);
            }

            // Monitor de Fechamento por MA
            if (OrderCloseMA && Position.MarketPosition != MarketPosition.Flat)
            {
                ProcessMAClosePosition(e.Price);
            }

            // Monitor de Limites de Saldo / Metas
            CheckSafetyLimits();

            // UI throttle
            _uiTickCounter++;
            if (_uiTickCounter % 10 == 0)
            {
                UpdateInfoPanel(e.Price);
            }

            base.OnMarketData(e);
        }

        protected override void OnBarUpdate()
        {
            if (!isValid) return;

            if (_forceCloseSignal && Position.MarketPosition != MarketPosition.Flat)
            {
                ExecuteForceClose();
                return;
            }

            if (BarsInProgress != 0) return;
            if (CurrentBar < BarsRequiredToTrade) return;

            // Reset diário de sessão
            _dataHoje = Time[0].Date;
            if (_dataHoje != dailySessionDate.Date)
            {
                QuantOperacoes = 0;
                dailySessionDate = _dataHoje;
                dailyLimitReached = false;
                robotTravado = false;
                realizadoConta = 0;
                breakEvenTriggered = false;
                trailStopPrice = 0.0;
                trailStepCount = 0;
                _executedSignalIds.Clear();
            }

            // Horário de operação
            TimeSpan ct = new TimeSpan(Times[0][0].Hour, Times[0][0].Minute, Times[0][0].Second);
            TimeSpan st = new TimeSpan(TIME_Start.Hour, TIME_Start.Minute, TIME_Start.Second) + TimeSpan.FromSeconds(Second_Start);
            TimeSpan sp = new TimeSpan(TIME_Stop.Hour, TIME_Stop.Minute, TIME_Stop.Second);
            TimeSpan st2 = new TimeSpan(TIME_Start2.Hour, TIME_Start2.Minute, TIME_Start2.Second);
            TimeSpan sp2 = new TimeSpan(TIME_Stop2.Hour, TIME_Stop2.Minute, TIME_Stop2.Second);

            bool dentroJ1 = (ct >= st && ct < sp);
            bool dentroJ2 = (Janela2Ativa && ct >= st2 && ct < sp2);
            bool dentroHorario = dentroJ1 || dentroJ2;

            if (!dentroHorario)
            {
                if (CancelOrdersAfterStopTime)
                {
                    CancelPendingOrders();
                }
                return;
            }

            // Expiração de ordens pendentes por barras
            if (CancelAfterBars > 0)
            {
                if (buyStopOrder != null && orderBuyStopBar > 0 && (CurrentBar - orderBuyStopBar >= CancelAfterBars))
                {
                    try { CancelOrder(buyStopOrder); buyStopOrder = null; } catch { }
                }
                if (sellStopOrder != null && orderSellStopBar > 0 && (CurrentBar - orderSellStopBar >= CancelAfterBars))
                {
                    try { CancelOrder(sellStopOrder); sellStopOrder = null; } catch { }
                }
            }

            // Execução de Sinais Capturados
            ProcessConectorExecution();
        }

        // =====================================================================
        // CONECTOR: POLLING & SIGNAL PARSE
        // =====================================================================
        private void InitializeConectorVM()
        {
            _currentSignal = null;
            _lastExecutedSignal = null;
            _signalConsumed = false;
            _lastSignalId = "";
            _forceCloseSignal = false;
            _lastPositionClosedTime = DateTime.MinValue;
            _isPolling = true;

            StartVMPolling();
        }

        private void StopVMPolling()
        {
            _isPolling = false;
            if (_pollTask != null && !_pollTask.IsCompleted)
            {
                try { _pollTask.Wait(1000); } catch { }
            }
        }

        private void StartVMPolling()
        {
            if (_pollTask != null && !_pollTask.IsCompleted) return;

            _pollTask = Task.Run(async () =>
            {
                while (_isPolling && State != State.Terminated && State != State.Finalized)
                {
                    try
                    {
                        await PollForSignals();
                        int delayMs = (currentEstrategia == estrategiaMode.ConectorLocal) ? 40 : VM_POLL_INTERVAL_MS;
                        await Task.Delay(delayMs);
                    }
                    catch (Exception ex)
                    {
                        if (DebugMode) Print($"[CONECTOR VM] Erro no polling: {ex.Message}");
                        int delayMs = (currentEstrategia == estrategiaMode.ConectorLocal) ? 100 : (VM_POLL_INTERVAL_MS * 2);
                        await Task.Delay(delayMs);
                    }
                }
            });
        }

        private async Task PollForSignals()
        {
            int minInterval = (currentEstrategia == estrategiaMode.ConectorLocal) ? 30 : VM_POLL_INTERVAL_MS;
            if ((DateTime.Now - _lastPollTime).TotalMilliseconds < minInterval) return;
            _lastPollTime = DateTime.Now;

            try
            {
                string cleanPainelId = string.IsNullOrWhiteSpace(VM_PainelId) ? "" : VM_PainelId.Trim();
                string cleanStrategyId = string.IsNullOrWhiteSpace(VM_StrategyId) ? "" : VM_StrategyId.Trim();

                string painelFilter = string.IsNullOrWhiteSpace(cleanPainelId) ? "" : $"or=(account_id.eq.{Uri.EscapeDataString(cleanPainelId)},panel_id.eq.{Uri.EscapeDataString(cleanPainelId)})&";
                string strategyFilter = string.IsNullOrWhiteSpace(cleanStrategyId) ? "" : $"strategy_id=eq.{Uri.EscapeDataString(cleanStrategyId)}&";

                // FASE 1: Se estiver FLAT, busca NOVO SINAL "Em Andamento"
                if (Position.MarketPosition == MarketPosition.Flat)
                {
                    string json = null;

                    if (currentEstrategia == estrategiaMode.ConectorLocal)
                    {
                        // Tenta porta 8001 primeiro e porta 80 como fallback
                        int[] ports = new int[] { 8001, 80 };
                        foreach (int port in ports)
                        {
                            try
                            {
                                string localUrl = (port == 80)
                                    ? $"http://localhost/sinal_local?account_id={Uri.EscapeDataString(cleanPainelId)}&strategy_id={Uri.EscapeDataString(cleanStrategyId)}&status=Em%20Andamento"
                                    : $"http://localhost:{port}/sinal_local?account_id={Uri.EscapeDataString(cleanPainelId)}&strategy_id={Uri.EscapeDataString(cleanStrategyId)}&status=Em%20Andamento";
                                
                                HttpWebRequest reqLocal = (HttpWebRequest)WebRequest.Create(localUrl);
                                reqLocal.Method = "GET";
                                reqLocal.Timeout = 200;
                                reqLocal.ReadWriteTimeout = 200;
                                using (HttpWebResponse respLocal = (HttpWebResponse)await reqLocal.GetResponseAsync())
                                using (StreamReader readerLocal = new StreamReader(respLocal.GetResponseStream()))
                                {
                                    json = await readerLocal.ReadToEndAsync();
                                }
                                if (!string.IsNullOrWhiteSpace(json) && json != "[]" && json != "{\"signals\":[],\"total\":0}")
                                {
                                    break;
                                }
                            }
                            catch { }
                        }
                    }

                    if (string.IsNullOrWhiteSpace(json) || json == "[]" || json == "{\"signals\":[],\"total\":0}")
                    {
                        string queryUrl = $"{supabaseUrl}/rest/v1/painelvm_strategy_reports?" +
                            $"{painelFilter}" +
                            $"{strategyFilter}" +
                            $"status=eq.Em%20Andamento&" +
                            $"order=created_at.desc&" +
                            $"limit=1";

                        HttpWebRequest request = (HttpWebRequest)WebRequest.Create(queryUrl);
                        request.Method = "GET";
                        request.Timeout = 3000;
                        request.ReadWriteTimeout = 3000;
                        request.Headers.Add("apikey", supabaseServiceKey);
                        request.Headers.Add("Authorization", $"Bearer {supabaseServiceKey}");
                        request.ContentType = "application/json";

                        using (HttpWebResponse response = (HttpWebResponse)await request.GetResponseAsync())
                        using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                        {
                            json = await reader.ReadToEndAsync();
                        }
                    }

                    if (string.IsNullOrWhiteSpace(json) || json == "[]" || json == "{\"signals\":[],\"total\":0}") return;

                    VM_Signal signal = ParseVMSignalFromJson(json);
                    if (signal == null) return;

                    lock (_signalLock)
                    {
                        if (_executedSignalIds.Contains(signal.Id)) return;
                        if (_lastPositionClosedTime != DateTime.MinValue && signal.CreatedAt <= _lastPositionClosedTime) return;

                        TimeSpan signalAge = DateTime.UtcNow - signal.CreatedAt;
                        int maxAgeSec = VM_MaxSignalAgeSeconds > 0 ? VM_MaxSignalAgeSeconds : 60;
                        if (signalAge.TotalSeconds > maxAgeSec) return;

                        _lastSignalId = signal.Id;
                        _currentSignal = signal;
                        _signalConsumed = false;
                        if (DebugMode) Print($"[CONECTOR VM] 🚨 NOVO SINAL! {signal.Side.ToUpper()} | ID: {signal.Id} | Entry: {signal.EntryPrice:F2} | SL: {signal.SlTicks} | TP: {signal.TpTicks}");
                    }

                    // ⚡ EXECUÇÃO IMEDIATA (0ms): Não espera o próximo tick do mercado chegar na tela
                    if (ChartControl != null && ChartControl.Dispatcher != null)
                    {
                        ChartControl.Dispatcher.InvokeAsync(() =>
                        {
                            try { ProcessConectorExecution(); } catch { }
                        });
                    }
                }
                // FASE 2: Se estiver EM POSIÇÃO, monitora encerramento ou ajuste dinâmico de SL/TP
                else
                {
                    if (_lastExecutedSignal == null) return;

                    string json = null;
                    if (currentEstrategia == estrategiaMode.ConectorLocal)
                    {
                        int[] ports = new int[] { 8001, 80 };
                        foreach (int port in ports)
                        {
                            try
                            {
                                string localUrl = (port == 80)
                                    ? $"http://localhost/sinal_local?id={Uri.EscapeDataString(_lastExecutedSignal.Id)}"
                                    : $"http://localhost:{port}/sinal_local?id={Uri.EscapeDataString(_lastExecutedSignal.Id)}";
                                
                                HttpWebRequest reqLocal = (HttpWebRequest)WebRequest.Create(localUrl);
                                reqLocal.Method = "GET";
                                reqLocal.Timeout = 200;
                                reqLocal.ReadWriteTimeout = 200;
                                using (HttpWebResponse respLocal = (HttpWebResponse)await reqLocal.GetResponseAsync())
                                using (StreamReader readerLocal = new StreamReader(respLocal.GetResponseStream()))
                                {
                                    json = await readerLocal.ReadToEndAsync();
                                }
                                if (!string.IsNullOrWhiteSpace(json) && json != "[]")
                                {
                                    break;
                                }
                            }
                            catch { }
                        }
                    }

                    if (string.IsNullOrWhiteSpace(json) || json == "[]")
                    {
                        string queryUrl = $"{supabaseUrl}/rest/v1/painelvm_strategy_reports?" +
                            $"id=eq.{_lastExecutedSignal.Id}&" +
                            $"select=id,status,stop_loss,take_profit";

                        HttpWebRequest request = (HttpWebRequest)WebRequest.Create(queryUrl);
                        request.Method = "GET";
                        request.Timeout = 3000;
                        request.ReadWriteTimeout = 3000;
                        request.Headers.Add("apikey", supabaseServiceKey);
                        request.Headers.Add("Authorization", $"Bearer {supabaseServiceKey}");
                        request.ContentType = "application/json";

                        using (HttpWebResponse response = (HttpWebResponse)await request.GetResponseAsync())
                        using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                        {
                            json = await reader.ReadToEndAsync();
                        }
                    }

                    if (string.IsNullOrWhiteSpace(json) || json == "[]") return;

                    string currentStatus = ExtractJsonField(json, "status");
                    if (VM_MonitorarEncerramentoPainel && !string.IsNullOrEmpty(currentStatus) &&
                        (currentStatus.ToLower().Contains("cancel") ||
                         currentStatus.ToLower().Contains("gain") ||
                         currentStatus.ToLower().Contains("stop") ||
                         currentStatus.ToLower().Contains("encerr") ||
                         currentStatus.ToLower().Contains("fech")))
                    {
                        if (DebugMode) Print($"[CONECTOR VM] 🚨 SINAL ENCERRADO NO PAINEL! Status: '{currentStatus}' -> Acionando fechamento forçado.");
                        _forceCloseSignal = true;

                        // ⚡ FECHAMENTO IMEDIATO (0ms): Encerra no mesmo milissegundo sem esperar tick
                        if (ChartControl != null && ChartControl.Dispatcher != null)
                        {
                            ChartControl.Dispatcher.InvokeAsync(() =>
                            {
                                try
                                {
                                    _forceCloseSignal = false;
                                    CancelPendingOrders();
                                    if (Position.MarketPosition == MarketPosition.Long)
                                    {
                                        ExitLong("VM_Close", "");
                                        ExitLong(Position.Quantity, "VM_Close", "BuyOrder");
                                        ExitLong(Position.Quantity, "VM_Close", "BuyStopOrder");
                                    }
                                    else if (Position.MarketPosition == MarketPosition.Short)
                                    {
                                        ExitShort("VM_Close", "");
                                        ExitShort(Position.Quantity, "VM_Close", "SellOrder");
                                        ExitShort(Position.Quantity, "VM_Close", "SellStopOrder");
                                    }
                                }
                                catch { }
                            });
                        }
                    }
                    else
                    {
                        string slStr = ExtractJsonField(json, "stop_loss");
                        string tpStr = ExtractJsonField(json, "take_profit");

                        if (StopLossOrigem == sltpOrigem.Painel && TryParseDoubleUniversal(slStr, out double dbStopLoss) && dbStopLoss > 0)
                        {
                            if (Math.Abs(_lastSyncedSlPrice - dbStopLoss) > 0.001)
                            {
                                _lastSyncedSlPrice = dbStopLoss;
                                SetStopLossSafe("", CalculationMode.Price, dbStopLoss, false);
                                if (DebugMode) Print($"[CONECTOR VM] 🔄 SL sincronizado dinamicamente com painel: {dbStopLoss:F2}");
                            }
                        }

                        if (TakeProfitOrigem == sltpOrigem.Painel && TryParseDoubleUniversal(tpStr, out double dbTakeProfit) && dbTakeProfit > 0)
                        {
                            if (Math.Abs(_lastSyncedTpPrice - dbTakeProfit) > 0.001)
                            {
                                _lastSyncedTpPrice = dbTakeProfit;
                                SetProfitTargetSafe("", CalculationMode.Price, dbTakeProfit, false);
                                if (DebugMode) Print($"[CONECTOR VM] 🔄 TP sincronizado dinamicamente com painel: {dbTakeProfit:F2}");
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                if (DebugMode) Print($"[CONECTOR VM] Erro polling: {ex.Message}");
            }
        }

        private VM_Signal ParseVMSignalFromJson(string json)
        {
            try
            {
                json = json.Trim();
                if (json.StartsWith("{\"signals\":"))
                {
                    int startArr = json.IndexOf('[');
                    int endArr = json.LastIndexOf(']');
                    if (startArr >= 0 && endArr > startArr)
                    {
                        json = json.Substring(startArr, endArr - startArr + 1);
                    }
                }
                json = json.Trim().TrimStart('[').TrimEnd(']');
                if (string.IsNullOrWhiteSpace(json)) return null;

                VM_Signal signal = new VM_Signal();
                signal.Id = ExtractJsonField(json, "id");
                signal.StrategyId = ExtractJsonField(json, "strategy_id");
                signal.StrategyName = ExtractJsonField(json, "strategy_name");
                signal.Side = ExtractJsonField(json, "side").ToLowerInvariant();

                string rawSymbol = ExtractJsonField(json, "symbol");
                if (string.IsNullOrWhiteSpace(rawSymbol)) rawSymbol = ExtractJsonField(json, "ativo");
                signal.Symbol = !string.IsNullOrWhiteSpace(rawSymbol) ? rawSymbol.Trim().ToUpper() : referenceSymbol;

                string entryStr = ExtractJsonField(json, "entry_price");
                string slStr = ExtractJsonField(json, "stop_loss");
                string tpStr = ExtractJsonField(json, "take_profit");
                string createdStr = ExtractJsonField(json, "created_at");
                string contratoStr = ExtractJsonField(json, "contrato");
                string statusStr = ExtractJsonField(json, "status");
                signal.Status = statusStr;

                if (!TryParseDoubleUniversal(entryStr, out double entryPrice)) return null;
                if (!TryParseDoubleUniversal(slStr, out double stopLoss)) return null;
                if (!TryParseDoubleUniversal(tpStr, out double takeProfit)) return null;

                signal.EntryPrice = entryPrice;
                signal.StopLoss = stopLoss;
                signal.TakeProfit = takeProfit;

                TryParseDoubleUniversal(contratoStr, out double contratoVal);
                signal.Contrato = contratoVal;

                double slDistance = Math.Abs(entryPrice - stopLoss);
                double tpDistance = Math.Abs(takeProfit - entryPrice);
                signal.SlTicks = (int)Math.Round(slDistance / TickSize);
                signal.TpTicks = (int)Math.Round(tpDistance / TickSize);

                if (signal.SlTicks <= 0) signal.SlTicks = SL_Ticks > 0 ? SL_Ticks : 50;
                if (signal.TpTicks <= 0) signal.TpTicks = TP_Ticks > 0 ? TP_Ticks : 30;

                signal.Direction = (signal.Side.Contains("buy") || signal.Side.Contains("long") || signal.Side.Contains("compra")) ? 1 : -1;

                if (DateTimeOffset.TryParse(createdStr, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out DateTimeOffset dto))
                    signal.CreatedAt = dto.UtcDateTime;
                else
                    signal.CreatedAt = DateTime.UtcNow;

                return signal;
            }
            catch (Exception ex)
            {
                if (DebugMode) Print($"[CONECTOR VM] Erro parse JSON: {ex.Message}");
                return null;
            }
        }

        private void ProcessConectorExecution()
        {
            VM_Signal signal = null;
            lock (_signalLock) { signal = _currentSignal; }

            if (signal == null || _signalConsumed) return;
            if (Position.MarketPosition != MarketPosition.Flat) return;
            if (QuantOperacoes >= MaxOrderSession) return;
            if (robotTravado || dailyLimitReached) return;

            // Filtro de Direção
            bool allowedDirection = (signal.Direction == 1 && (currentOperatingMode == OperatingMode.Comprado || currentOperatingMode == OperatingMode.Ambos)) ||
                                    (signal.Direction == -1 && (currentOperatingMode == OperatingMode.Vendido || currentOperatingMode == OperatingMode.Ambos));

            if (!allowedDirection)
            {
                if (DebugMode) Print($"[CONECTOR VM] ⛔ Sinal rejeitado: direção não permitida no modo de operação ({currentOperatingMode}).");
                _signalConsumed = true;
                return;
            }

            // Cálculo do Lote
            int finalLots = LOTE_Size;
            if (ContratoOrigem == contratoOrigem.Painel && signal.Contrato > 0)
            {
                finalLots = Math.Max(1, (int)Math.Round(signal.Contrato * ContratoFatorMult));
            }

            // Cálculo de SL e TP
            int finalSlTicks = (StopLossOrigem == sltpOrigem.Robo) ? SL_Ticks : signal.SlTicks;
            int finalTpTicks = (TakeProfitOrigem == sltpOrigem.Robo) ? TP_Ticks : signal.TpTicks;

            if (finalSlTicks <= 0) finalSlTicks = 50;
            if (finalTpTicks <= 0) finalTpTicks = 30;

            if (DebugMode) Print($"[CONECTOR VM] 🚀 EXECUTANDO SINAL: {signal.Id} | Dir: {(signal.Direction == 1 ? "COMPRA" : "VENDA")} | Lots: {finalLots} | SL: {finalSlTicks}tk | TP: {finalTpTicks}tk");

            if (signal.Direction == 1) // COMPRA
            {
                if (OrderMode == orderMode.Mercado)
                {
                    buyOrder = EnterLong(finalLots, "BuyOrder");
                }
                else if (OrderMode == orderMode.PendenteStop)
                {
                    double stopPrice = signal.EntryPrice + distancePrice * TickSize;
                    buyStopOrder = EnterLongStopMarket(0, true, finalLots, stopPrice, "BuyStopOrder");
                    orderBuyStopBar = CurrentBar;
                }
                else if (OrderMode == orderMode.PendenteLimit)
                {
                    double limitPrice = signal.EntryPrice - distancePrice * TickSize;
                    buyStopOrder = EnterLongLimit(0, true, finalLots, limitPrice, "BuyLimitOrder");
                    orderBuyStopBar = CurrentBar;
                }

                SetStopLossSafe("", CalculationMode.Ticks, finalSlTicks, false);
                SetProfitTargetSafe("", CalculationMode.Ticks, finalTpTicks, false);
            }
            else // VENDA
            {
                if (OrderMode == orderMode.Mercado)
                {
                    sellOrder = EnterShort(finalLots, "SellOrder");
                }
                else if (OrderMode == orderMode.PendenteStop)
                {
                    double stopPrice = signal.EntryPrice - distancePrice * TickSize;
                    sellStopOrder = EnterShortStopMarket(0, true, finalLots, stopPrice, "SellStopOrder");
                    orderSellStopBar = CurrentBar;
                }
                else if (OrderMode == orderMode.PendenteLimit)
                {
                    double limitPrice = signal.EntryPrice + distancePrice * TickSize;
                    sellStopOrder = EnterShortLimit(0, true, finalLots, limitPrice, "SellLimitOrder");
                    orderSellStopBar = CurrentBar;
                }

                SetStopLossSafe("", CalculationMode.Ticks, finalSlTicks, false);
                SetProfitTargetSafe("", CalculationMode.Ticks, finalTpTicks, false);
            }

            _signalConsumed = true;
            _lastExecutedSignal = signal;
            _executedSignalIds.Add(signal.Id);
            QuantOperacoes++;
        }

        private void ExecuteForceClose()
        {
            _forceCloseSignal = false;
            if (DebugMode) Print("[CONECTOR VM] 🚨 Executando zeragem imediata da posição.");

            CancelPendingOrders();

            if (Position.MarketPosition == MarketPosition.Long)
            {
                try { ExitLong("ForceCloseLong", ""); } catch { }
            }
            else if (Position.MarketPosition == MarketPosition.Short)
            {
                try { ExitShort("ForceCloseShort", ""); } catch { }
            }
        }

        private void CancelPendingOrders()
        {
            try { if (buyStopOrder != null) { CancelOrder(buyStopOrder); buyStopOrder = null; } } catch { }
            try { if (sellStopOrder != null) { CancelOrder(sellStopOrder); sellStopOrder = null; } } catch { }
        }

        // =====================================================================
        // TRAIL STOP (TICKS) & MA CLOSE
        // =====================================================================
        private void ProcessTrailStopMarket(double currentPrice)
        {
            if (Position.MarketPosition == MarketPosition.Flat) return;

            double entryPrice = Position.AveragePrice;
            if (Position.MarketPosition == MarketPosition.Long)
            {
                double gainTicks = (currentPrice - entryPrice) / TickSize;
                if (gainTicks >= TRAIL_Start)
                {
                    if (!breakEvenTriggered)
                    {
                        breakEvenTriggered = true;
                        trailStopPrice = entryPrice + (TRAIL_Start - TRAIL_StopDistance) * TickSize;
                        trailStepCount = 0;
                        SetStopLossSafe("", CalculationMode.Price, trailStopPrice, false);
                    }
                    else
                    {
                        double excessTicks = gainTicks - TRAIL_Start;
                        int newSteps = (int)(excessTicks / TRAIL_Step);
                        if (newSteps > trailStepCount)
                        {
                            trailStepCount = newSteps;
                            double newStop = entryPrice + (TRAIL_Start - TRAIL_StopDistance + trailStepCount * TRAIL_Step) * TickSize;
                            if (newStop > trailStopPrice)
                            {
                                trailStopPrice = newStop;
                                SetStopLossSafe("", CalculationMode.Price, trailStopPrice, false);
                            }
                        }
                    }
                }
            }
            else if (Position.MarketPosition == MarketPosition.Short)
            {
                double gainTicks = (entryPrice - currentPrice) / TickSize;
                if (gainTicks >= TRAIL_Start)
                {
                    if (!breakEvenTriggered)
                    {
                        breakEvenTriggered = true;
                        trailStopPrice = entryPrice - (TRAIL_Start - TRAIL_StopDistance) * TickSize;
                        trailStepCount = 0;
                        SetStopLossSafe("", CalculationMode.Price, trailStopPrice, false);
                    }
                    else
                    {
                        double excessTicks = gainTicks - TRAIL_Start;
                        int newSteps = (int)(excessTicks / TRAIL_Step);
                        if (newSteps > trailStepCount)
                        {
                            trailStepCount = newSteps;
                            double newStop = entryPrice - (TRAIL_Start - TRAIL_StopDistance + trailStepCount * TRAIL_Step) * TickSize;
                            if (newStop < trailStopPrice)
                            {
                                trailStopPrice = newStop;
                                SetStopLossSafe("", CalculationMode.Price, trailStopPrice, false);
                            }
                        }
                    }
                }
            }
        }

        private void ProcessMAClosePosition(double currentPrice)
        {
            if (_smaClosePosition == null || CurrentBar < ProfitCloseMAPeriod) return;
            double smaVal = _smaClosePosition[0];
            double openProfit = Position.GetUnrealizedProfitLoss(PerformanceUnit.Currency, currentPrice);

            if (openProfit >= ProfitCloseMA)
            {
                if (Position.MarketPosition == MarketPosition.Long && currentPrice < smaVal)
                {
                    if (DebugMode) Print($"[MA CLOSE] 📉 Cruzou SMA ({smaVal:F2}) para baixo com lucro de ${openProfit:F2} -> Saindo.");
                    ExitLong("MACloseLong", "");
                }
                else if (Position.MarketPosition == MarketPosition.Short && currentPrice > smaVal)
                {
                    if (DebugMode) Print($"[MA CLOSE] 📈 Cruzou SMA ({smaVal:F2}) para cima com lucro de ${openProfit:F2} -> Saindo.");
                    ExitShort("MACloseShort", "");
                }
            }
        }

        private void CheckSafetyLimits()
        {
            if (Account == null) return;
            double realizedToday = GetDailyRealizedPnL();

            if (DailyLossActive && realizedToday <= -Math.Abs(DailyLossLimit))
            {
                if (!dailyLimitReached)
                {
                    dailyLimitReached = true;
                    robotTravado = true;
                    if (DebugMode) Print($"[SEGURANÇA] 🛑 Meta de Perda Diária atingida (${realizedToday:F2} <= -${DailyLossLimit}). Travando robô.");
                    ExecuteForceClose();
                }
            }

            if (DailyProfitActive && realizedToday >= Math.Abs(DailyProfitLimit))
            {
                if (!dailyLimitReached)
                {
                    dailyLimitReached = true;
                    robotTravado = true;
                    if (DebugMode) Print($"[SEGURANÇA] 🎯 Meta de Lucro Diário atingida (${realizedToday:F2} >= ${DailyProfitLimit}). Travando robô.");
                    ExecuteForceClose();
                }
            }
        }

        private double GetDailyRealizedPnL()
        {
            try
            {
                double pnl = 0.0;
                // NinjaTrader 8: Account não possui propriedade Trades.
                // SystemPerformance.AllTrades é a coleção correta de trades realizados,
                // disponível tanto em backtest quanto em live trading.
                var allTrades = SystemPerformance.AllTrades;
                if (allTrades == null) return 0;
                DateTime today = Time[0].Date;
                for (int i = 0; i < allTrades.Count; i++)
                {
                    var trade = allTrades[i];
                    if (trade.Exit.Time.Date == today)
                        pnl += trade.ProfitCurrency;
                }
                return pnl;
            }
            catch { return 0; }
        }

        protected override void OnPositionUpdate(Position position, double averagePrice, int quantity, MarketPosition marketPosition)
        {
            if (_previousMarketPosition != MarketPosition.Flat && marketPosition == MarketPosition.Flat)
            {
                _lastPositionClosedTime = DateTime.UtcNow;
                breakEvenTriggered = false;
                trailStopPrice = 0.0;
                trailStepCount = 0;
                buyOrder = null;
                sellOrder = null;
                _lastSyncedSlPrice = 0;
                _lastSyncedTpPrice = 0;
            }
            _previousMarketPosition = marketPosition;
            base.OnPositionUpdate(position, averagePrice, quantity, marketPosition);
        }

        // =====================================================================
        // HELPERS E UTILS
        // =====================================================================
        private void SetStopLossSafe(string fromEntrySignal, CalculationMode mode, double value, bool isSimulatedStop)
        {
            try { SetStopLoss(fromEntrySignal, mode, value, isSimulatedStop); } catch { }
        }

        private void SetProfitTargetSafe(string fromEntrySignal, CalculationMode mode, double value, bool isSimulatedTarget)
        {
            try { SetProfitTarget(fromEntrySignal, mode, value, isSimulatedTarget); } catch { }
        }

        private bool TryParseDoubleUniversal(string valStr, out double result)
        {
            result = 0.0;
            if (string.IsNullOrWhiteSpace(valStr)) return false;
            valStr = valStr.Trim().Replace(',', '.');
            return double.TryParse(valStr, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out result);
        }

        private string ExtractJsonField(string json, string fieldName)
        {
            string pattern = $"\"{fieldName}\":";
            int idx = json.IndexOf(pattern, StringComparison.OrdinalIgnoreCase);
            if (idx < 0) return "";

            int start = idx + pattern.Length;
            while (start < json.Length && char.IsWhiteSpace(json[start])) start++;

            if (start < json.Length && json[start] == '"')
            {
                start++;
                int end = json.IndexOf('"', start);
                if (end < 0) return "";
                return json.Substring(start, end - start);
            }

            int endNum = start;
            while (endNum < json.Length && (char.IsDigit(json[endNum]) || json[endNum] == '.' ||
                   json[endNum] == '-' || json[endNum] == 't' || json[endNum] == 'r' ||
                   json[endNum] == 'u' || json[endNum] == 'f' || json[endNum] == 'a' ||
                   json[endNum] == 'l' || json[endNum] == 's'))
                endNum++;

            return json.Substring(start, endNum - start).Trim();
        }

        // =====================================================================
        // INTERFACE GRÁFICA (WPF PANEL)
        // =====================================================================
        #region UI WPF Panel
        private void CreateWpfPanel()
        {
            try
            {
                if (ChartControl == null) return;
                var chartWindow = Window.GetWindow(ChartControl.Parent);
                if (chartWindow == null) return;

                _cachedChartGrid = ChartControl.Parent as System.Windows.Controls.Grid;
                if (_cachedChartGrid == null) return;

                _mainBorder = new Border
                {
                    Background = new SolidColorBrush(Color.FromArgb(210, 18, 22, 28)),
                    BorderBrush = new SolidColorBrush(Color.FromArgb(255, 41, 98, 255)),
                    BorderThickness = new Thickness(1.5),
                    CornerRadius = new CornerRadius(6),
                    Padding = new Thickness(10),
                    Margin = new Thickness(15, 40, 0, 0),
                    HorizontalAlignment = HorizontalAlignment.Left,
                    VerticalAlignment = VerticalAlignment.Top,
                    Width = 240
                };

                StackPanel stack = new StackPanel { Orientation = Orientation.Vertical };

                TextBlock title = new TextBlock
                {
                    Text = "⚡ CONECTOR VM",
                    FontWeight = FontWeights.Bold,
                    FontSize = 13,
                    Foreground = new SolidColorBrush(Color.FromArgb(255, 41, 98, 255)),
                    Margin = new Thickness(0, 0, 0, 6)
                };

                _tbAccount = new TextBlock { FontSize = 11, Foreground = Brushes.White, Margin = new Thickness(0, 0, 0, 4) };
                _tbParams = new TextBlock { FontSize = 10.5, Foreground = Brushes.LightGray, Margin = new Thickness(0, 0, 0, 4) };
                _tbPnL = new TextBlock { FontSize = 11, FontWeight = FontWeights.SemiBold, Foreground = Brushes.White, Margin = new Thickness(0, 0, 0, 4) };
                _tbStatus = new TextBlock { FontSize = 11, FontWeight = FontWeights.Bold, Foreground = Brushes.Cyan, Margin = new Thickness(0, 0, 0, 2) };

                stack.Children.Add(title);
                stack.Children.Add(_tbAccount);
                stack.Children.Add(_tbParams);
                stack.Children.Add(_tbPnL);
                stack.Children.Add(_tbStatus);

                _mainBorder.Child = stack;
                _cachedChartGrid.Children.Add(_mainBorder);
            }
            catch { }
        }

        private void UpdateInfoPanel(double currentPrice)
        {
            if (_mainBorder == null || ChartControl == null) return;

            string accName = Account?.Name ?? "—";
            string pnlStr = "P&L Hoje: $" + GetDailyRealizedPnL().ToString("F2");
            string statusStr = robotTravado ? "STATUS: TRAVADO POR META" : (isValid ? "STATUS: OPERANDO" : "STATUS: LICENÇA INVÁLIDA");
            Brush statusBrush = robotTravado ? Brushes.Orange : (isValid ? Brushes.LimeGreen : Brushes.Red);

            string paramsStr = $"Estratégia: {NomeEstrategia}\n" +
                               $"Modo: {currentEstrategia}\n" +
                               $"Ops: {QuantOperacoes}/{MaxOrderSession}\n" +
                               $"Contratos: {LOTE_Size} | SL/TP: {SL_Ticks}/{TP_Ticks}tk\n" +
                               $"Último Sinal: {(_lastExecutedSignal != null ? _lastExecutedSignal.Id : "Nenhum")}";

            ChartControl.Dispatcher.InvokeAsync(() =>
            {
                if (_tbAccount != null) _tbAccount.Text = $"Conta: {accName}";
                if (_tbParams != null) _tbParams.Text = paramsStr;
                if (_tbPnL != null) _tbPnL.Text = pnlStr;
                if (_tbStatus != null)
                {
                    _tbStatus.Text = statusStr;
                    _tbStatus.Foreground = statusBrush;
                }
            }, System.Windows.Threading.DispatcherPriority.Render);
        }

        private void RemoveWpfPanel()
        {
            try
            {
                if (_cachedChartGrid != null && _mainBorder != null)
                {
                    ChartControl?.Dispatcher.InvokeAsync(() =>
                    {
                        _cachedChartGrid.Children.Remove(_mainBorder);
                        _mainBorder = null;
                    });
                }
            }
            catch { }
        }
        #endregion

        // =====================================================================
        // PROPRIEDADES DO NINJASCRIPT
        // =====================================================================
        #region Properties

        // ── 01. GERAL ────────────────────────────────────────────────────────
        [NinjaScriptProperty]
        [Display(Name="Debug Mode", Description="Habilita logs detalhados na janela Output", Order=1, GroupName="01. GERAL")]
        public bool DebugMode { get; set; }

        // ── 02. LICENÇA ──────────────────────────────────────────────────────
        private string idAssinatura = "0000";
        [NinjaScriptProperty]
        [Display(Name="Número Assinatura", Description="Assinatura contratada no portal do desenvolvedor", Order=1, GroupName="02. LICENÇA")]
        public string IDAssinatura
        {
            get { return idAssinatura ?? "0000"; }
            set
            {
                idAssinatura = value ?? "0000";
                if (!string.IsNullOrWhiteSpace(idAssinatura) && idAssinatura.Trim() != "0000")
                {
                    metodovalidar = "assinatura";
                }
            }
        }

        // ── 03. PARÂMETROS OPERAÇÃO ──────────────────────────────────────────
        [NinjaScriptProperty]
        [Display(Name="Nome da Estratégia", Description="Identificador visual da estratégia", Order=1, GroupName="03. PARÂMETROS OPERAÇÃO")]
        public string NomeEstrategia { get; set; }

        [NinjaScriptProperty]
        [Display(Name="Modo de Operação", Description="Define se opera Comprado, Vendido ou Ambos", Order=2, GroupName="03. PARÂMETROS OPERAÇÃO")]
        public OperatingMode currentOperatingMode { get; set; }

        [NinjaScriptProperty]
        [Display(Name="Modo Conector", Description="ConectorVM (Banco Supabase) ou ConectorLocal (Servidor Local)", Order=3, GroupName="03. PARÂMETROS OPERAÇÃO")]
        public estrategiaMode currentEstrategia { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name="Max Operações", Description="Máximo de operações permitidas por sessão", Order=4, GroupName="03. PARÂMETROS OPERAÇÃO")]
        public int MaxOrderSession { get; set; }

        [NinjaScriptProperty]
        [Display(Name="Modo Ordens", Description="Mercado | PendenteStop | PendenteLimit", Order=5, GroupName="03. PARÂMETROS OPERAÇÃO")]
        public orderMode OrderMode { get; set; }

        [NinjaScriptProperty]
        [Range(0, int.MaxValue)]
        [Display(Name="Distância Preço (Ticks)", Description="Distância em ticks do preço para posicionar ordens pendentes", Order=6, GroupName="03. PARÂMETROS OPERAÇÃO")]
        public int distancePrice { get; set; }

        [NinjaScriptProperty]
        [Range(0, int.MaxValue)]
        [Display(Name="Expirar Ordens Pendentes (Barras)", Description="Cancela ordens pendentes após N barras sem execução (0 = nunca)", Order=7, GroupName="03. PARÂMETROS OPERAÇÃO")]
        public int CancelAfterBars { get; set; }

        [NinjaScriptProperty]
        [Display(Name="Cancelar Ordens Após Fim da Sessão", Description="Cancela pendentes ao atingir o horário de parada", Order=8, GroupName="03. PARÂMETROS OPERAÇÃO")]
        public bool CancelOrdersAfterStopTime { get; set; }

        // ── 04. CONECTOR (Gestão do Sinal) ──────────────────────────────────
        [NinjaScriptProperty]
        [Display(Name="ID da Conta (Account ID)", Description="ID da Conta de Negociação no Vortex para onde enviar ordens (UUID)", Order=1, GroupName="04. CONECTOR")]
        public string VM_PainelId { get; set; }

        [NinjaScriptProperty]
        [Display(Name="Conector VM - Strategy ID", Description="ID da estratégia para monitorar. Deixe vazio para pegar qualquer uma.", Order=2, GroupName="04. CONECTOR")]
        public string VM_StrategyId { get; set; }

        [NinjaScriptProperty]
        [Display(Name="Origem do Contrato", Description="Define se usa o contrato local do robô ou do Painel", Order=3, GroupName="04. CONECTOR")]
        public contratoOrigem ContratoOrigem { get; set; }

        [NinjaScriptProperty]
        [Range(0.01, 100.0)]
        [Display(Name="Fator Multiplicação Contrato", Description="Multiplicador aplicado ao lote vindo do banco", Order=4, GroupName="04. CONECTOR")]
        public double ContratoFatorMult { get; set; }

        [NinjaScriptProperty]
        [Display(Name="Gestão StopLoss", Description="Origem do StopLoss: Robô (local) ou Painel (banco de dados)", Order=5, GroupName="04. CONECTOR")]
        public sltpOrigem StopLossOrigem { get; set; }

        [NinjaScriptProperty]
        [Display(Name="Gestão TakeProfit", Description="Origem do TakeProfit: Robô (local) ou Painel (banco de dados)", Order=6, GroupName="04. CONECTOR")]
        public sltpOrigem TakeProfitOrigem { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name="Tempo Máx Aceitação Sinal (seg)", Description="Tempo limite em segundos para aceitar sinal do banco", Order=7, GroupName="04. CONECTOR")]
        public int VM_MaxSignalAgeSeconds { get; set; }

        [NinjaScriptProperty]
        [Display(Name="Monitorar Encerramento no Painel", Description="Encerra no robô caso seja cancelada/fechada no Painel", Order=8, GroupName="04. CONECTOR")]
        public bool VM_MonitorarEncerramentoPainel { get; set; }

        // ── 05. RISCO ────────────────────────────────────────────────────────
        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name="Contrato", Description="Quantidade de contratos por operação", Order=1, GroupName="05. RISCO")]
        public int LOTE_Size { get; set; }

        [NinjaScriptProperty]
        [Range(0, int.MaxValue)]
        [Display(Name="SL (Ticks)", Description="Stop Loss em Ticks", Order=2, GroupName="05. RISCO")]
        public int SL_Ticks { get; set; }

        [NinjaScriptProperty]
        [Range(0, int.MaxValue)]
        [Display(Name="TP (Ticks)", Description="Take Profit em Ticks", Order=3, GroupName="05. RISCO")]
        public int TP_Ticks { get; set; }

        [NinjaScriptProperty]
        [Display(Name="TRAIL STOP", Description="Ativa Stop Gain dinâmico por degraus", Order=4, GroupName="05. RISCO")]
        public bool TRAIL_MODE { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name="TRAIL_Start (Ticks)", Description="Lucro mínimo em ticks para ativar o Trail Stop", Order=5, GroupName="05. RISCO")]
        public int TRAIL_Start { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name="TRAIL_StopDistance (Ticks)", Description="Distância em ticks do Stop Gain em relação ao preço", Order=6, GroupName="05. RISCO")]
        public int TRAIL_StopDistance { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name="TRAIL_Step (Ticks)", Description="Movimento em ticks para subir o stop em 1 degrau", Order=7, GroupName="05. RISCO")]
        public int TRAIL_Step { get; set; }

        [NinjaScriptProperty]
        [Display(Name="MA Closed Position", Description="Ativa fechamento de posição ao cruzar Média Móvel", Order=8, GroupName="05. RISCO")]
        public bool OrderCloseMA { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name="MA Profit Closed (Money)", Description="Lucro mínimo em USD para acionar fechamento por MA", Order=9, GroupName="05. RISCO")]
        public int ProfitCloseMA { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name="MA Profit Closed Period", Description="Período da SMA para fechamento", Order=10, GroupName="05. RISCO")]
        public int ProfitCloseMAPeriod { get; set; }

        // ── 06. SEGURANÇA ────────────────────────────────────────────────────
        [NinjaScriptProperty]
        [Display(Name="Encerrar por Balanço", Description="Ativa fechamento por balanço financeiro", Order=1, GroupName="06. SEGURANÇA")]
        public bool MoneyClosed { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name="Perda Máxima", Description="Fecha posições ao atingir perda em USD", Order=2, GroupName="06. SEGURANÇA")]
        public int LossesAllOrders { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name="Lucro Máximo", Description="Fecha posições ao atingir lucro em USD", Order=3, GroupName="06. SEGURANÇA")]
        public int ProfitAllOrders { get; set; }

        [NinjaScriptProperty]
        [Display(Name="Perda Máxima Diária (Ativar)", Description="Ativa stop loss diário", Order=4, GroupName="06. SEGURANÇA")]
        public bool DailyLossActive { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name="Perda Máxima Diária (USD)", Description="Valor em USD da perda máxima diária permitida", Order=5, GroupName="06. SEGURANÇA")]
        public int DailyLossLimit { get; set; }

        [NinjaScriptProperty]
        [Display(Name="Lucro Máximo Diário (Ativar)", Description="Ativa meta diária de lucro", Order=6, GroupName="06. SEGURANÇA")]
        public bool DailyProfitActive { get; set; }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name="Lucro Máximo Diário (USD)", Description="Valor em USD da meta diária de lucro", Order=7, GroupName="06. SEGURANÇA")]
        public int DailyProfitLimit { get; set; }

        // ── 07. HORÁRIO DE OPERAÇÃO ──────────────────────────────────────────
        [NinjaScriptProperty]
        [PropertyEditor("NinjaTrader.Gui.Tools.TimeEditorKey")]
        [Display(Name="Janela 1 - Início", Order=1, GroupName="07. HORÁRIO DE OPERAÇÃO")]
        public DateTime TIME_Start { get; set; }

        [NinjaScriptProperty]
        [Range(0, 59)]
        [Display(Name="Janela 1 - Segundos", Order=2, GroupName="07. HORÁRIO DE OPERAÇÃO")]
        public int Second_Start { get; set; }

        [NinjaScriptProperty]
        [PropertyEditor("NinjaTrader.Gui.Tools.TimeEditorKey")]
        [Display(Name="Janela 1 - Parada", Order=3, GroupName="07. HORÁRIO DE OPERAÇÃO")]
        public DateTime TIME_Stop { get; set; }

        [NinjaScriptProperty]
        [Display(Name="Janela 2 - Ativar", Order=4, GroupName="07. HORÁRIO DE OPERAÇÃO")]
        public bool Janela2Ativa { get; set; }

        [NinjaScriptProperty]
        [PropertyEditor("NinjaTrader.Gui.Tools.TimeEditorKey")]
        [Display(Name="Janela 2 - Início", Order=5, GroupName="07. HORÁRIO DE OPERAÇÃO")]
        public DateTime TIME_Start2 { get; set; }

        [NinjaScriptProperty]
        [PropertyEditor("NinjaTrader.Gui.Tools.TimeEditorKey")]
        [Display(Name="Janela 2 - Parada", Order=6, GroupName="07. HORÁRIO DE OPERAÇÃO")]
        public DateTime TIME_Stop2 { get; set; }

        #endregion
    }
}
