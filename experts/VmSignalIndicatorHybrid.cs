#region Using declarations
using System;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Xml.Serialization;
using System.Windows;
using System.Windows.Media;
using System.Net;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Linq;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Tools;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

namespace NinjaTrader.NinjaScript
{
    // =====================================================================
    // PONTE ESTÁTICA PARA COMUNICAÇÃO ENTRE EXPERT E INDICADOR
    // =====================================================================
    public static class VmSignalBridge
    {
        private static readonly System.Collections.Generic.Dictionary<string, bool> _busyState = new System.Collections.Generic.Dictionary<string, bool>();
        
        public static event Action<string, int, double, string, int, int> OnSignalReceived;
        
        public static void SendSignal(string symbol, int direction, double entryPrice, string signalId, int slTicks, int tpTicks)
        {
            if (OnSignalReceived != null)
            {
                OnSignalReceived(symbol, direction, entryPrice, signalId, slTicks, tpTicks);
            }
        }
        
        public static bool IsBusy(string symbol)
        {
            lock (_busyState)
            {
                bool busy;
                if (_busyState.TryGetValue(symbol, out busy))
                {
                    return busy;
                }
                return false;
            }
        }
        
        public static void SetBusy(string symbol, bool busy)
        {
            lock (_busyState)
            {
                _busyState[symbol] = busy;
            }
        }
    }
}

namespace NinjaTrader.NinjaScript.Indicators
{
    public enum ModoConectorIA { Localhost, NuvemWeb }

    public class ModoConectorConverter : TypeConverter
    {
        public override bool GetStandardValuesSupported(ITypeDescriptorContext context) { return true; }
        public override bool GetStandardValuesExclusive(ITypeDescriptorContext context) { return true; }
        public override StandardValuesCollection GetStandardValues(ITypeDescriptorContext context)
        {
            return new StandardValuesCollection(new ModoConectorIA[] { ModoConectorIA.Localhost, ModoConectorIA.NuvemWeb });
        }
    }

    public class SignalSourceConverter : TypeConverter
    {
        public override bool GetStandardValuesSupported(ITypeDescriptorContext context) { return true; }
        public override bool GetStandardValuesExclusive(ITypeDescriptorContext context) { return true; }
        public override StandardValuesCollection GetStandardValues(ITypeDescriptorContext context)
        {
            return new StandardValuesCollection(new string[] { "Painel", "Robo", "Desligado" });
        }
    }

    public class VmSignalIndicatorHybrid : Indicator
    {

        // =====================================================================
        // CLASSES AUXILIARES
        // =====================================================================
        public class VM_Signal
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
            public int SlTicks { get; set; }
            public int TpTicks { get; set; }
            public int Direction { get; set; } // 1 = Buy, -1 = Sell
            public string Status { get; set; }
        }

        // =====================================================================
        // VARIÁVEIS DE CONTROLE
        // =====================================================================
        private bool _buySignalActive = false;
        private bool _sellSignalActive = false;
        private int _buySignalBar = -1;
        private int _sellSignalBar = -1;

        // Controle do Polling (Supabase)
        private Task _pollTask = null;
        private bool _isPolling = false;
        private DateTime _lastPollTime = DateTime.MinValue;
        private readonly object _signalLock = new object();
        private VM_Signal _currentSignal = null;
        private string referenceSymbol = "NQ";
        private int VM_PollIntervalMs = 250;
        private DateTime _indicatorStartTime = DateTime.MinValue;
        
        // Rastreamento de sinais executados/desenhados
        private System.Collections.Generic.List<string> _executedSignalIds = new System.Collections.Generic.List<string>();

        // Sinais pendentes para processar no thread NinjaScript principal
        private bool _pendingBuy = false;
        private bool _pendingSell = false;
        private string _pendingSignalId = "";
        private double _pendingEntryPrice = 0.0;
        private int _pendingSlTicks = 0;
        private int _pendingTpTicks = 0;
        private int _pendingSignalDirection = 0;

        // Dados ativos para plotagem no candle exato
        private double _activeBuyPrice = 0.0;
        private double _activeSellPrice = 0.0;
        private string _activeBuySignalId = "";
        private string _activeSellSignalId = "";
        private bool _connectedLogPrinted = false;
        private DateTime _signalTriggerTime = DateTime.MinValue;



        // =====================================================================
        // VALIDAÇÃO DE LICENÇA REMOTA
        // =====================================================================
        private string metodovalidar = "assinatura";
        private string allowedMachineId = "7C1ABAF8961E1F923C578D2D33AC90FD";
        private bool isValid = false;
        private string status0, status1;
        private string consumerKey = "ck_75f9d0f430cb40c64c902ed43ce2bceb08e5e649";
        private string consumerSecret = "cs_a741c57b4368102a1daf3fbfc4598833ffb23e77";
        private int CodProduto = 7375;
        private bool popupErroLicencaJaExibido = false;

        // Configurações do Supabase (Privadas)
        private string SupabaseUrl = "https://db.vemviraramesa.com.br";
        private string SupabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY";

        private const string LicenseCacheFileName = "VmSignal_license.enc";
        private string licenseCachePath;
        private DateTime? ultimaValidacaoCache = null;

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = "Indicador de Sinal Híbrido para VM BOT - Recebe do banco de dados ou do Expert";
                Name = "VmSignalIndicatorHybrid";
                Calculate = Calculate.OnEachTick;
                IsOverlay = true;
                DisplayInDataBox = false;
                PaintPriceMarkers = false;
                
                // Configuração da Licença
                IDAssinatura = "0000";

                // Configuração da Origem do Sinal
                SignalSource = "Painel";

                // Parâmetros do Supabase
                VM_PainelId = "";
                VM_StrategyId = "";
                VM_PollIntervalMs = 250;
                VM_BlockedAccounts = "";
                VM_ClearPlotIntervalMs = 2000;
                VM_MaxSignalAgeSeconds = 60;

                // Buffers de sinal (Plotados como Triângulos de Compra e Venda no valor do preço)
                AddPlot(new Stroke(Brushes.Lime, 3), PlotStyle.TriangleUp, "Buy Signal");
                AddPlot(new Stroke(Brushes.Red, 3), PlotStyle.TriangleDown, "Sell Signal");
            }
            else if (State == State.DataLoaded)
            {
                if (Instrument != null && Instrument.MasterInstrument != null)
                {
                    referenceSymbol = Instrument.MasterInstrument.Name.ToUpper();
                    Print($"[VM SIGNAL HYBRID] 📊 Ativo do gráfico detectado automaticamente: {referenceSymbol}");
                }

                _indicatorStartTime = DateTime.UtcNow;
                _connectedLogPrinted = false;
                VmSignalBridge.SetBusy(Instrument.FullName, false);

                // --- VALIDAÇÃO DE LICENÇA REMOTA (Modo Assinatura Fixado) ---
                isValid = false;
                metodovalidar = "assinatura";
                if (LerCacheLicenca())
                {
                    isValid = true;
                    Print("[LICENÇA VMSIGNAL] ✅ Cache válido.");
                }
                else
                {
                    ValidarAssinatura();
                    if (isValid)
                    {
                        SalvarCacheLicenca();
                        Print("[LICENÇA VMSIGNAL] ✅ Validação remota OK.");
                    }
                }

                if (!isValid)
                {
                    ShowInvalidLicensePopup("ERRO VALIDAÇÃO DE LICENÇA", "Assinatura inválida, zerada ou expirada. Informe um número de licença válido nas propriedades do indicador.");
                    Print("[VM SIGNAL HYBRID] ❌ LICENÇA INVÁLIDA OU EXPIRADA. Indicador bloqueado.");
                    return;
                }
                
                Print($"[VM SIGNAL HYBRID] 🌐 Carregando configurações...");
                Print($"[VM SIGNAL HYBRID] Origem do Sinal: {SignalSource}");
                if (SignalSource == "Painel" || SignalSource == "Banco_de_Dados")
                {
                    Print($"[VM SIGNAL HYBRID] URL: {SupabaseUrl}");
                    Print($"[VM SIGNAL HYBRID] Painel ID: {VM_PainelId}");
                    Print($"[VM SIGNAL HYBRID] Estratégia ID: {VM_StrategyId}");
                }
            }
            else if (State == State.Realtime)
            {
                _buySignalActive = false;
                _sellSignalActive = false;
                _executedSignalIds.Clear();
                VmSignalBridge.SetBusy(Instrument.FullName, false);

                if (!isValid)
                {
                    Print("[VM SIGNAL HYBRID] ❌ Licença Inválida - Operação desativada.");
                    return;
                }

                if (SignalSource == "Painel" || SignalSource == "Banco_de_Dados")
                {
                    StartPolling();
                }
                else if (SignalSource == "Robo")
                {
                    VmSignalBridge.OnSignalReceived += OnBridgeSignalReceived;
                    Print("[VM SIGNAL HYBRID] 🔌 Escutando ponte de sinais com o Expert...");
                }
            }
            else if (State == State.Terminated)
            {
                if (SignalSource == "Painel" || SignalSource == "Banco_de_Dados")
                {
                    StopPolling();
                }
                else if (SignalSource == "Robo")
                {
                    VmSignalBridge.OnSignalReceived -= OnBridgeSignalReceived;
                }
                VmSignalBridge.SetBusy(Instrument.FullName, false);
            }
        }

        private void OnBridgeSignalReceived(string symbol, int direction, double price, string signalId, int slTicks, int tpTicks)
        {
            if (!isValid) return;
            if (State != State.Realtime) return;
            if (SignalSource != "Robo") return;
            if (!Instrument.FullName.Equals(symbol, System.StringComparison.OrdinalIgnoreCase)) return;

            lock (_signalLock)
            {
                if (_executedSignalIds.Contains(signalId)) return;
                
                _pendingSignalId = signalId;
                _pendingEntryPrice = price;
                _pendingSlTicks = slTicks;
                _pendingTpTicks = tpTicks;
                _pendingSignalDirection = direction;
                
                if (direction == 1)
                {
                    _pendingBuy = true;
                }
                else if (direction == -1)
                {
                    _pendingSell = true;
                }
            }
        }

        protected override void OnBarUpdate()
        {
            if (!isValid) return;

            // Define o plot padrão como NaN (Not-a-Number)
            BuySignal[0] = double.NaN;
            SellSignal[0] = double.NaN;

            // Limpa o plot após passar o intervalo
            if (_buySignalActive && (DateTime.UtcNow - _signalTriggerTime).TotalMilliseconds >= VM_ClearPlotIntervalMs)
            {
                _buySignalActive = false;
                Print($"[VM SIGNAL HYBRID] 🔄 Plot de Compra limpo automaticamente.");
            }
            if (_sellSignalActive && (DateTime.UtcNow - _signalTriggerTime).TotalMilliseconds >= VM_ClearPlotIntervalMs)
            {
                _sellSignalActive = false;
                Print($"[VM SIGNAL HYBRID] 🔄 Plot de Venda limpo automaticamente.");
            }

            // Reset na nova barra
            if (IsFirstTickOfBar && CurrentBar > 0)
            {
                if (_buySignalActive)
                {
                    BuySignal[1] = double.NaN;
                    _buySignalActive = false;
                }
                if (_sellSignalActive)
                {
                    SellSignal[1] = double.NaN;
                    _sellSignalActive = false;
                }
            }

            // Processa sinal pendente
            bool triggerBuy = false;
            bool triggerSell = false;
            string sigId = "";
            double sigPrice = 0.0;
            int sigSl = 0;
            int sigTp = 0;
            int sigDir = 0;

            lock (_signalLock)
            {
                if (_pendingBuy || _pendingSell)
                {
                    sigId = _pendingSignalId;
                    sigPrice = _pendingEntryPrice;
                    sigSl = _pendingSlTicks;
                    sigTp = _pendingTpTicks;
                    sigDir = _pendingSignalDirection;
                    triggerBuy = _pendingBuy;
                    triggerSell = _pendingSell;

                    _pendingBuy = false;
                    _pendingSell = false;
                }
            }

            if (triggerBuy || triggerSell)
            {
                if (AreBlockedAccountsBusy())
                {
                    Print($"[VM SIGNAL HYBRID] ❌ Sinal {sigId} bloqueado: Contas configuradas estão ocupadas.");
                }
                else
                {
                    if (sigDir == 1)
                    {
                        _buySignalActive = true;
                        _buySignalBar = CurrentBar;
                        _activeBuyPrice = sigPrice;
                        _activeBuySignalId = sigId;
                        _signalTriggerTime = DateTime.UtcNow;
                        
                        Draw.ArrowUp(this, "BuyArrow_" + _activeBuySignalId, true, 0, Low[0] - TickSize * 5, Brushes.Lime);
                        Print($"[VM SIGNAL HYBRID] ✅ COMPRA REGISTRADA | ID: {_activeBuySignalId} | Entrada: {_activeBuyPrice}");
                    }
                    else if (sigDir == -1)
                    {
                        _sellSignalActive = true;
                        _sellSignalBar = CurrentBar;
                        _activeSellPrice = sigPrice;
                        _activeSellSignalId = sigId;
                        _signalTriggerTime = DateTime.UtcNow;

                        Draw.ArrowDown(this, "SellArrow_" + _activeSellSignalId, true, 0, High[0] + TickSize * 5, Brushes.Red);
                        Print($"[VM SIGNAL HYBRID] ✅ VENDA REGISTRADA | ID: {_activeSellSignalId} | Entrada: {_activeSellPrice}");
                    }
                    
                    _executedSignalIds.Add(sigId);
                }
            }

            // Plota os buffers
            if (_buySignalActive && _buySignalBar == CurrentBar)
            {
                BuySignal[0] = _activeBuyPrice;
            }
            if (_sellSignalActive && _sellSignalBar == CurrentBar)
            {
                SellSignal[0] = _activeSellPrice;
            }
        }

        private bool AreBlockedAccountsBusy()
        {
            if (string.IsNullOrWhiteSpace(VM_BlockedAccounts))
                return false;

            try
            {
                string[] accountsToCheck = VM_BlockedAccounts.Split(new char[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (string accName in accountsToCheck)
                {
                    string trimmedName = accName.Trim();
                    NinjaTrader.Cbi.Account acc = NinjaTrader.Cbi.Account.All.FirstOrDefault(a => a.Name.Equals(trimmedName, StringComparison.OrdinalIgnoreCase));
                    Print($"[VM SIGNAL HYBRID] Validando conta bloqueada '{trimmedName}' (Encontrada: {acc != null})");
                    if (acc != null)
                    {
                        Print($"[VM SIGNAL HYBRID] Conta {acc.Name} tem {acc.Positions.Count} posições e {acc.Orders.Count} ordens no total.");
                        foreach (NinjaTrader.Cbi.Position pos in acc.Positions)
                        {
                            if (pos != null && pos.Instrument != null)
                            {
                                Print($"[VM SIGNAL HYBRID]   -> Posição: {pos.Instrument.FullName} | Qtd: {pos.Quantity}");
                                if (pos.Instrument.FullName.Equals(Instrument.FullName, StringComparison.OrdinalIgnoreCase) && pos.Quantity != 0)
                                {
                                    Print($"[VM SIGNAL HYBRID] ❌ Bloqueado por posição ativa na conta {acc.Name}: {pos.Quantity} contratos em {pos.Instrument.FullName}");
                                    return true;
                                }
                            }
                        }
                        foreach (NinjaTrader.Cbi.Order order in acc.Orders)
                        {
                            if (order != null && order.Instrument != null)
                            {
                                Print($"[VM SIGNAL HYBRID]   -> Ordem: {order.Name} | Estado: {order.OrderState} | Instrumento: {order.Instrument.FullName}");
                                if (order.Instrument.FullName.Equals(Instrument.FullName, StringComparison.OrdinalIgnoreCase) && 
                                    (order.OrderState == NinjaTrader.Cbi.OrderState.Working || 
                                     order.OrderState == NinjaTrader.Cbi.OrderState.Submitted ||
                                     order.OrderState == NinjaTrader.Cbi.OrderState.Accepted))
                                {
                                    Print($"[VM SIGNAL HYBRID] ❌ Bloqueado por ordem ativa na conta {acc.Name}: {order.Name} Estado: {order.OrderState} ID: {order.Id}");
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Print($"[VM SIGNAL HYBRID] Erro ao validar contas: {ex.Message}");
            }
            return false;
        }

        // =====================================================================
        // LÓGICA DE POLLING (SUPABASE)
        // =====================================================================
        private void StartPolling()
        {
            if (_isPolling) return;
            _isPolling = true;
            _pollTask = Task.Run(async () =>
            {
                while (_isPolling)
                {
                    try
                    {
                        await PollSupabaseForSignals();
                        await Task.Delay(VM_PollIntervalMs);
                    }
                    catch (Exception ex)
                    {
                        Print($"[VM SIGNAL HYBRID] ❌ Erro no polling: {ex.Message}");
                        await Task.Delay(VM_PollIntervalMs * 2);
                    }
                }
            });
        }

        private void StopPolling()
        {
            _isPolling = false;
        }

        private async Task PollSupabaseForSignals()
        {
            if (!isValid) return;
            if ((DateTime.Now - _lastPollTime).TotalMilliseconds < VM_PollIntervalMs) return;
            _lastPollTime = DateTime.Now;

            try
            {
                string cleanPainelId = string.IsNullOrWhiteSpace(VM_PainelId) ? "" : new string(VM_PainelId.Where(c => char.IsLetterOrDigit(c) || c == '-' || c == '_').ToArray());
                string cleanStrategyId = string.IsNullOrWhiteSpace(VM_StrategyId) ? "" : new string(VM_StrategyId.Where(c => char.IsLetterOrDigit(c) || c == '-' || c == '_').ToArray());

                string json = null;

                // 1. Tentar busca via Localhost caso o modo seja Localhost
                if (ModoConector == ModoConectorIA.Localhost)
                {
                    try
                    {
                        string localUrl = $"http://localhost:8001/sinal_local?account_id={Uri.EscapeDataString(cleanPainelId)}&strategy_id={Uri.EscapeDataString(cleanStrategyId)}";
                        HttpWebRequest reqLocal = (HttpWebRequest)WebRequest.Create(localUrl);
                        reqLocal.Method = "GET";
                        reqLocal.Timeout = 1500;
                        using (HttpWebResponse respLocal = (HttpWebResponse)await reqLocal.GetResponseAsync())
                        using (StreamReader readerLocal = new StreamReader(respLocal.GetResponseStream()))
                        {
                            json = await readerLocal.ReadToEndAsync();
                        }
                    }
                    catch
                    {
                        // Fallback para NuvemWeb se falhar a conexão local
                    }
                }

                // 2. Se não veio do Localhost ou se o modo é NuvemWeb, consultar Supabase
                if (string.IsNullOrWhiteSpace(json) || json == "[]" || json == "{\"signals\":[],\"total\":0}")
                {
                    string painelFilter = string.IsNullOrWhiteSpace(cleanPainelId) ? "" : $"or=(account_id.eq.{Uri.EscapeDataString(cleanPainelId)},panel_id.eq.{Uri.EscapeDataString(cleanPainelId)})&";
                    string strategyFilter = string.IsNullOrWhiteSpace(cleanStrategyId) ? "" : $"strategy_id=eq.{Uri.EscapeDataString(cleanStrategyId)}&";
                    
                    string queryUrl = $"{SupabaseUrl}/rest/v1/painelvm_strategy_reports?" +
                                      $"{painelFilter}" +
                                      $"{strategyFilter}" +
                                      $"status=eq.Em%20Andamento&" +
                                      $"order=created_at.desc&" +
                                      $"limit=1";

                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create(queryUrl);
                    request.Method = "GET";
                    request.Timeout = 3000;
                    request.ReadWriteTimeout = 3000;
                    request.Headers.Add("apikey", SupabaseServiceKey);
                    request.Headers.Add("Authorization", $"Bearer {SupabaseServiceKey}");
                    request.ContentType = "application/json";

                    using (HttpWebResponse response = (HttpWebResponse)await request.GetResponseAsync())
                    using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                    {
                        json = await reader.ReadToEndAsync();
                    }
                }

                if (string.IsNullOrWhiteSpace(json) || json == "[]" || json == "{\"signals\":[],\"total\":0}") return;

                    VM_Signal signal = ParseVMSignalFromJson(json);
                    if (signal == null)
                    {
                        Print($"[VM SIGNAL HYBRID] ⚠️ Recebeu JSON mas falhou no ParseVMSignalFromJson. JSON: {json}");
                        return;
                    }

                    TimeSpan signalAge = DateTime.UtcNow - signal.CreatedAt;
                    int maxAgeSec = VM_MaxSignalAgeSeconds > 0 ? VM_MaxSignalAgeSeconds : 60;
                    if (signalAge.TotalSeconds > maxAgeSec)
                    {
                        Print($"[VM SIGNAL HYBRID] ⚠️ Sinal {signal.Id} desconsiderado: Expirado ({signalAge.TotalSeconds:F1}s > {maxAgeSec}s).");
                        return;
                    }

                    if (_indicatorStartTime != DateTime.MinValue && signal.CreatedAt < _indicatorStartTime.AddSeconds(-maxAgeSec))
                    {
                        Print($"[VM SIGNAL HYBRID] ⚠️ Sinal {signal.Id} desconsiderado: Criado em {signal.CreatedAt:HH:mm:ss} UTC antes da ativação do indicador.");
                        return;
                    }

                    lock (_signalLock)
                    {
                        if (_executedSignalIds.Contains(signal.Id)) return;
                        
                        _pendingSignalId = signal.Id;
                        _pendingEntryPrice = signal.EntryPrice;
                        _pendingSlTicks = signal.SlTicks;
                        _pendingTpTicks = signal.TpTicks;
                        _pendingSignalDirection = signal.Direction;

                        if (signal.Direction == 1)
                        {
                            _pendingBuy = true;
                        }
                        else if (signal.Direction == -1)
                        {
                            _pendingSell = true;
                        }
                        Print($"[VM SIGNAL HYBRID] 🚨 SINAL CAPTURADO COM SUCESSO! Dir: {(signal.Direction == 1 ? "COMPRA" : "VENDA")} | ID: {signal.Id} | Entrada: {signal.EntryPrice:F2} | Strat: {signal.StrategyId}");
                    }
            }
            catch (Exception ex)
            {
                Print($"[VM SIGNAL HYBRID] ❌ Erro ao buscar sinal: {ex.Message}");
            }
        }

        private bool TryParseDoubleUniversal(string valStr, out double result)
        {
            result = 0.0;
            if (string.IsNullOrWhiteSpace(valStr)) return false;
            valStr = valStr.Trim().Replace(',', '.');
            return double.TryParse(valStr, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out result);
        }

        private string ExtractRootSymbol(string rawSymbol)
        {
            if (string.IsNullOrWhiteSpace(rawSymbol)) return "";
            string s = rawSymbol.Trim().ToUpper();

            int spaceIdx = s.IndexOfAny(new char[] { ' ', '_', '-' });
            if (spaceIdx > 0)
            {
                s = s.Substring(0, spaceIdx);
            }

            if (s.Length >= 3 && char.IsDigit(s[s.Length - 1]))
            {
                int digitCount = 1;
                if (s.Length >= 4 && char.IsDigit(s[s.Length - 2]))
                {
                    digitCount = 2;
                }

                int monthPos = s.Length - 1 - digitCount;
                if (monthPos >= 1)
                {
                    char monthChar = s[monthPos];
                    string monthCodes = "FGHJKMNQUVXZ";
                    if (monthCodes.Contains(monthChar.ToString()))
                    {
                        s = s.Substring(0, monthPos);
                    }
                }
            }

            return s;
        }

        private bool IsSymbolCompatible(string signalSym, string chartSym)
        {
            if (string.IsNullOrWhiteSpace(signalSym) || string.IsNullOrWhiteSpace(chartSym)) return true;

            string rSignal = ExtractRootSymbol(signalSym);
            string rChart  = ExtractRootSymbol(chartSym);

            if (rSignal == rChart) return true;

            if ((rSignal == "NQ" || rSignal == "MNQ") && (rChart == "NQ" || rChart == "MNQ")) return true;
            if ((rSignal == "GC" || rSignal == "MGC") && (rChart == "GC" || rChart == "MGC")) return true;
            if ((rSignal == "ES" || rSignal == "MES") && (rChart == "ES" || rChart == "MES")) return true;
            if ((rSignal == "YM" || rSignal == "MYM") && (rChart == "YM" || rChart == "MYM")) return true;
            if ((rSignal == "RTY" || rSignal == "M2K") && (rChart == "RTY" || rChart == "M2K")) return true;
            if ((rSignal == "CL" || rSignal == "MCL") && (rChart == "CL" || rChart == "MCL")) return true;
            if ((rSignal == "SI" || rSignal == "SIL") && (rChart == "SI" || rChart == "SIL")) return true;
            if ((rSignal == "HG" || rSignal == "MHG") && (rChart == "HG" || rChart == "MHG")) return true;

            if (rSignal.Contains(rChart) || rChart.Contains(rSignal)) return true;

            return false;
        }

        private VM_Signal ParseVMSignalFromJson(string json)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(json)) return null;
                VM_Signal signal = new VM_Signal();
                signal.Id = ExtractJsonField(json, "id");
                signal.StrategyId = ExtractJsonField(json, "strategy_id"); 
                signal.StrategyName = ExtractJsonField(json, "strategy_name");
                signal.Side = ExtractJsonField(json, "side").ToLowerInvariant();
                
                string rawSymbol = ExtractJsonField(json, "symbol");
                if (string.IsNullOrWhiteSpace(rawSymbol)) rawSymbol = ExtractJsonField(json, "ativo");
                if (string.IsNullOrWhiteSpace(rawSymbol)) rawSymbol = ExtractJsonField(json, "gamma_symbol");
                signal.Symbol = !string.IsNullOrWhiteSpace(rawSymbol) ? rawSymbol.Trim().ToUpper() : referenceSymbol;

                if (!IsSymbolCompatible(signal.Symbol, referenceSymbol))
                {
                    Print($"[VM SIGNAL HYBRID] ⛔ Sinal ignorado! Ativo da operação ({signal.Symbol}) não é compatível com o gráfico ({referenceSymbol}).");
                    return null;
                }

                string entryStr = ExtractJsonField(json, "entry_price");
                string slStr = ExtractJsonField(json, "stop_loss");
                string tpStr = ExtractJsonField(json, "take_profit");
                string createdStr = ExtractJsonField(json, "created_at");
                signal.Status = ExtractJsonField(json, "status");

                if (!TryParseDoubleUniversal(entryStr, out double entryPrice))
                {
                    Print($"[VM SIGNAL HYBRID] ❌ Erro ao converter entry_price: '{entryStr}'");
                    return null;
                }
                if (!TryParseDoubleUniversal(slStr, out double stopLoss))
                {
                    Print($"[VM SIGNAL HYBRID] ❌ Erro ao converter stop_loss: '{slStr}'");
                    return null;
                }
                if (!TryParseDoubleUniversal(tpStr, out double takeProfit))
                {
                    Print($"[VM SIGNAL HYBRID] ❌ Erro ao converter take_profit: '{tpStr}'");
                    return null;
                }

                signal.EntryPrice = entryPrice;
                signal.StopLoss = stopLoss;
                signal.TakeProfit = takeProfit;

                double slDistance = Math.Abs(entryPrice - stopLoss);
                double tpDistance = Math.Abs(takeProfit - entryPrice);
                signal.SlTicks = (int)Math.Round(slDistance / TickSize);
                signal.TpTicks = (int)Math.Round(tpDistance / TickSize);

                signal.Direction = signal.Side.Contains("buy") || signal.Side.Contains("long") || signal.Side.Contains("compra") ? 1 : -1;

                if (DateTimeOffset.TryParse(createdStr, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out DateTimeOffset dto))
                {
                    signal.CreatedAt = dto.UtcDateTime;
                }
                else if (DateTime.TryParse(createdStr, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AdjustToUniversal, out DateTime dtParsed))
                {
                    signal.CreatedAt = dtParsed.ToUniversalTime();
                }
                else
                {
                    signal.CreatedAt = DateTime.UtcNow;
                }

                return signal;
            }
            catch (Exception ex)
            {
                Print($"[VM SIGNAL HYBRID] ❌ Exceção em ParseVMSignalFromJson: {ex.Message}");
                return null;
            }
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
        // PROPRIEDADES DE CONFIGURAÇÃO E LICENÇA
        // =====================================================================
        private string idAssinatura = "0000";
        [NinjaScriptProperty]
        [Display(Name="Número Assinatura", Description="Assinatura contratada no portal do desenvolvedor", Order=1, GroupName="01. LICENÇA")]
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

        private ModoConectorIA modoConector = ModoConectorIA.Localhost;
        [NinjaScriptProperty]
        [TypeConverter(typeof(ModoConectorConverter))]
        [Display(Name="Modo Conector Sinais", Description="Define se o Indicador busca sinais via porta Localhost ou Nuvem Supabase", Order=0, GroupName="02. VM CONFIG")]
        public ModoConectorIA ModoConector
        {
            get { return modoConector; }
            set { modoConector = value; }
        }

        [NinjaScriptProperty]
        [TypeConverter(typeof(SignalSourceConverter))]
        [Display(Name="Origem do Sinal", Description="Define se o indicador pega sinais do Banco de Dados/Localhost ou do Robô (Expert)", Order=1, GroupName="02. VM CONFIG")]
        public string SignalSource { get; set; }

        [NinjaScriptProperty]
        [Display(Name="ID da Conta (Account ID)", Description="ID da Conta de Negociação no Vortex para onde enviar ordens (UUID)", Order=2, GroupName="03. VM SUPABASE")]
        public string VM_PainelId { get; set; }

        [NinjaScriptProperty]
        [Display(Name="Estratégia ID (UUID)", Description="ID da estratégia no banco de dados", Order=3, GroupName="03. VM SUPABASE")]
        public string VM_StrategyId { get; set; }

        [Display(Name="Contas para Bloqueio", Description="Lista de contas separadas por vírgula. Se alguma tiver posição/ordem aberta no símbolo, o sinal é bloqueado (Ex: Sim101, Apex1)", Order=5, GroupName="03. VM SUPABASE")]
        public string VM_BlockedAccounts { get; set; }

        [Display(Name="Tempo de Plot Ativo (ms)", Description="Tempo em milissegundos que o sinal fica no gráfico para disparar o alerta antes de ser limpo (Ex: 2000 = 2 segundos)", Order=6, GroupName="03. VM SUPABASE")]
        public int VM_ClearPlotIntervalMs { get; set; }

        [NinjaScriptProperty]
        [Display(Name="Tempo Máx Aceitação Sinal (seg)", Description="Tempo limite em segundos para um sinal do banco ser aceito (ex: 60s). Evita sinais antigos.", Order=7, GroupName="03. VM SUPABASE")]
        public int VM_MaxSignalAgeSeconds { get; set; }

        // =====================================================================
        // MÉTODOS DE VALIDAÇÃO DE LICENÇA REMOTA
        // =====================================================================
        #region Validações de Licença
        private void ShowInvalidLicensePopup(string title, string message)
        {
            if (popupErroLicencaJaExibido) return;
            popupErroLicencaJaExibido = true;
            Dispatcher.InvokeAsync(() =>
            {
                MessageBox.Show(message, title, MessageBoxButton.OK, MessageBoxImage.Error);
            });
        }

        private void ShowPopup(string title, string message)
        {
            Dispatcher.InvokeAsync(() =>
            {
                MessageBox.Show(message, title, MessageBoxButton.OK, MessageBoxImage.Error);
            });
        }

        private bool VerificarProductId(string json)
        {
            int idx = json.IndexOf("\"line_items\":", StringComparison.OrdinalIgnoreCase);
            if (idx < 0) return false;
            return json.IndexOf($"\"product_id\":{CodProduto}", idx, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private void ValidarAssinatura()
        {
            popupErroLicencaJaExibido = false;
            
            try
            {
                if (string.IsNullOrWhiteSpace(IDAssinatura) || IDAssinatura.Trim() == "0000")
                {
                    status0 = "Número de Assinatura não informado ou inválido! Por favor insira sua licença nas propriedades do indicador.";
                    ShowInvalidLicensePopup("ERRO VALIDAÇÃO DE LICENÇA", status0);
                    isValid = false;
                    return;
                }

                string url = $"https://ffbinvest.amsolucoes.net.br/wp-json/wc/v3/subscriptions/{IDAssinatura}?consumer_key={consumerKey}&consumer_secret={consumerSecret}";
                WebClient client = new WebClient();
                string json = client.DownloadString(url);
                string machineId = Cbi.License.MachineId;

                if (string.IsNullOrEmpty(json))
                {
                    status0 = "Resposta da API inválida.";
                    ShowInvalidLicensePopup("ERRO VALIDAÇÃO", status0);
                    isValid = false;
                    return;
                }

                if (json.IndexOf("\"status\":\"active\"", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    json.IndexOf("\"status\":\"on-hold\"", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    if (!VerificarProductId(json))
                    {
                        status0 = "Produto incorreto na assinatura!";
                        ShowInvalidLicensePopup("VALIDATION ERROR", status0);
                        isValid = false;
                        return;
                    }

                    string idNtPattern = "\"key\":\"id_nt\"";
                    int idNtKeyIndex = json.IndexOf(idNtPattern, StringComparison.OrdinalIgnoreCase);
                    if (idNtKeyIndex >= 0)
                    {
                        string valuePattern = "\"value\":\"";
                        int valueStartIndex = json.IndexOf(valuePattern, idNtKeyIndex, StringComparison.OrdinalIgnoreCase);
                        if (valueStartIndex >= 0)
                        {
                            valueStartIndex += valuePattern.Length;
                            int valueEndIndex = json.IndexOf("\"", valueStartIndex);
                            if (valueEndIndex >= 0)
                            {
                                string idNtValue = json.Substring(valueStartIndex, valueEndIndex - valueStartIndex);
                                if (idNtValue.Equals(machineId, StringComparison.OrdinalIgnoreCase))
                                {
                                    status1 = "Assinatura Válida!";
                                    isValid = true;
                                    return;
                                }
                                else
                                {
                                    status0 = "ID Machine não pertence a esta assinatura!";
                                    ShowInvalidLicensePopup("VALIDATION ERROR", status0);
                                    isValid = false;
                                }
                            }
                        }
                    }
                }
                else
                {
                    status0 = "Assinatura inativa ou não encontrada!";
                    ShowInvalidLicensePopup("VALIDAÇÃO", status0);
                    isValid = false;
                }
            }
            catch (WebException ex)
            {
                status0 = "Erro de conexão: Assinatura inexistente ou API indisponível.";
                ShowInvalidLicensePopup("VALIDAÇÃO", status0);
                isValid = false;
            }
            catch (Exception ex)
            {
                status0 = "Erro na validação: " + ex.Message;
                ShowInvalidLicensePopup("VALIDAÇÃO", status0);
                isValid = false;
            }
        }

        private void ValidarPedido()
        {
            try
            {
                if (string.IsNullOrWhiteSpace(IDAssinatura) || IDAssinatura.Trim() == "0000") { ShowPopup("ERRO VALIDAÇÃO DE LICENÇA", "Nenhum ID de assinatura/pedido válido informado."); isValid = false; return; }
                string url = $"https://ffbinvest.amsolucoes.net.br/wp-json/wc/v3/orders/{IDAssinatura}?consumer_key={consumerKey}&consumer_secret={consumerSecret}";
                string json = new WebClient().DownloadString(url);
                if (string.IsNullOrEmpty(json)) { ShowPopup("ERRO VALIDAÇÃO", "Resposta da API inválida."); isValid = false; return; }
                if (!VerificarProductId(json)) { ShowPopup("ERRO VALIDAÇÃO", "Produto não encontrado no pedido."); isValid = false; return; }
                if (json.IndexOf("\"status\":\"completed\"", StringComparison.OrdinalIgnoreCase) < 0 &&
                    json.IndexOf("\"status\":\"processing\"", StringComparison.OrdinalIgnoreCase) < 0 &&
                    json.IndexOf("\"status\":\"on-hold\"", StringComparison.OrdinalIgnoreCase) < 0)
                { ShowPopup("ERRO VALIDAÇÃO", "Pedido não está ativo."); isValid = false; return; }
                string idNtVal = ExtrairValueAposKey(json, "\"key\":\"id_nt\"");
                if (idNtVal == null) { ShowPopup("ERRO VALIDAÇÃO", "ID Machine não encontrado no pedido."); isValid = false; return; }
                if (!idNtVal.Equals(Cbi.License.MachineId, StringComparison.OrdinalIgnoreCase))
                { ShowPopup("ERRO VALIDAÇÃO", "ID Machine não corresponde ao pedido."); isValid = false; return; }
                status1 = "Pedido válido."; isValid = true;
            }
            catch (Exception ex) { ShowPopup("ERRO VALIDAÇÃO", "Erro: " + ex.Message); isValid = false; }
        }

        private string ExtrairValueAposKey(string json, string keyPattern)
        {
            int ki = json.IndexOf(keyPattern, StringComparison.OrdinalIgnoreCase);
            if (ki < 0) return null;
            string vp = "\"value\":\"";
            int vs = json.IndexOf(vp, ki, StringComparison.OrdinalIgnoreCase);
            if (vs < 0) return null;
            vs += vp.Length;
            int ve = json.IndexOf('"', vs);
            return ve >= 0 ? json.Substring(vs, ve - vs) : null;
        }

        private bool ValidateMachineId() { return Cbi.License.MachineId == allowedMachineId; }
        #endregion

        #region Cache de Licença
        private string SimpleEncrypt(string t)
        {
            const string k = "VMSIGNAL_LICENSE_KEY_2025";
            byte[] inp = Encoding.UTF8.GetBytes(t), kb = Encoding.UTF8.GetBytes(k), o = new byte[inp.Length];
            for (int i = 0; i < inp.Length; i++) o[i] = (byte)(inp[i] ^ kb[i % kb.Length]);
            return Convert.ToBase64String(o);
        }

        private string SimpleDecrypt(string t)
        {
            try { const string k = "VMSIGNAL_LICENSE_KEY_2025"; byte[] inp = Convert.FromBase64String(t), kb = Encoding.UTF8.GetBytes(k), o = new byte[inp.Length]; for (int i = 0; i < inp.Length; i++) o[i] = (byte)(inp[i] ^ kb[i % kb.Length]); return Encoding.UTF8.GetString(o); } catch { return ""; }
        }

        private string ExtractJsonValue1(string json, string key)
        {
            int s = json.IndexOf($"\"{key}\":\"", StringComparison.OrdinalIgnoreCase); if (s < 0) return null;
            s += $"\"{key}\":\"".Length; int e = json.IndexOf('"', s); return e >= 0 ? json.Substring(s, e - s) : null;
        }

        private bool LerCacheLicenca()
        {
            try
            {
                if (string.IsNullOrWhiteSpace(IDAssinatura) || IDAssinatura.Trim() == "0000")
                {
                    Print("[LICENSE CACHE] ❌ ID Assinatura zerado ou não preenchido.");
                    return false;
                }

                licenseCachePath = Path.Combine(NinjaTrader.Core.Globals.UserDataDir, LicenseCacheFileName);
                if (!File.Exists(licenseCachePath)) { Print($"[LICENSE CACHE] ❌ Arquivo não encontrado: {licenseCachePath}"); return false; }
                string json = SimpleDecrypt(File.ReadAllText(licenseCachePath));
                string idM  = ExtractJsonValue1(json, "idMachine");
                string cod  = ExtractJsonValue1(json, "codProduto");
                string met  = ExtractJsonValue1(json, "metodoValidar");
                string ids  = ExtractJsonValue1(json, "idAssinatura");
                string dat  = ExtractJsonValue1(json, "dataValidacao");
                if (string.IsNullOrEmpty(idM) || string.IsNullOrEmpty(cod) ||
                    string.IsNullOrEmpty(met) || string.IsNullOrEmpty(ids) || string.IsNullOrEmpty(dat))
                { Print("[LICENSE CACHE] ❌ JSON corrompido ou incompleto"); return false; }
                if (!DateTime.TryParse(dat, out DateTime dv)) { Print($"[LICENSE CACHE] ❌ Data inválida: '{dat}'"); return false; }
                if (idM != Cbi.License.MachineId)   { Print("[LICENSE CACHE] ❌ Machine ID divergente"); return false; }
                if (ids != IDAssinatura)             { Print("[LICENSE CACHE] ❌ ID Assinatura divergente"); return false; }
                if (met != metodovalidar && met != "assinatura") { Print("[LICENSE CACHE] ❌ Método de validação divergente"); return false; }
                if ((DateTime.UtcNow - dv).TotalHours > 24) { Print("[LICENSE CACHE] ❌ Cache expirado (>24h)"); return false; }
                ultimaValidacaoCache = dv;
                Print($"[LICENSE CACHE] ✅ Válido — última validação: {dv:yyyy-MM-dd HH:mm:ss} UTC");
                return true;
            }
            catch (Exception ex) { Print($"[LICENSE CACHE] ❌ Erro ao ler cache: {ex.Message}"); return false; }
        }

        private void SalvarCacheLicenca()
        {
            if (!isValid) return;
            try
            {
                licenseCachePath = Path.Combine(NinjaTrader.Core.Globals.UserDataDir, LicenseCacheFileName);
                string pasta = Path.GetDirectoryName(licenseCachePath);
                if (!Directory.Exists(pasta)) Directory.CreateDirectory(pasta);
                if (File.Exists(licenseCachePath)) { var a = File.GetAttributes(licenseCachePath); if ((a & FileAttributes.Hidden) != 0) File.SetAttributes(licenseCachePath, a & ~FileAttributes.Hidden); }
                string j = $@"{{""idMachine"":""{Cbi.License.MachineId}"",""codProduto"":""{CodProduto}"",""metodoValidar"":""{metodovalidar}"",""idAssinatura"":""{IDAssinatura}"",""dataValidacao"":""{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss}""}}";
                File.WriteAllText(licenseCachePath, SimpleEncrypt(j));
                File.SetAttributes(licenseCachePath, FileAttributes.Hidden);
                ultimaValidacaoCache = DateTime.UtcNow;
            }
            catch (Exception ex) { Print($"[CACHE] Erro ao salvar cache: {ex.Message}"); }
        }
        #endregion

        // =====================================================================
        // PLOTS
        // =====================================================================
        [Browsable(false)]
        [XmlIgnore]
        public Series<double> BuySignal
        {
            get { return Values[0]; }
        }

        [Browsable(false)]
        [XmlIgnore]
        public Series<double> SellSignal
        {
            get { return Values[1]; }
        }
    }
}



#region NinjaScript generated code. Neither change nor remove.

namespace NinjaTrader.NinjaScript.Indicators
{
	public partial class Indicator : NinjaTrader.Gui.NinjaScript.IndicatorRenderBase
	{
		private VmSignalIndicatorHybrid[] cacheVmSignalIndicatorHybrid;
		public VmSignalIndicatorHybrid VmSignalIndicatorHybrid(string iDAssinatura, string signalSource, string vM_PainelId, string vM_StrategyId)
		{
			return VmSignalIndicatorHybrid(Input, iDAssinatura, signalSource, vM_PainelId, vM_StrategyId);
		}

		public VmSignalIndicatorHybrid VmSignalIndicatorHybrid(ISeries<double> input, string iDAssinatura, string signalSource, string vM_PainelId, string vM_StrategyId)
		{
			if (cacheVmSignalIndicatorHybrid != null)
				for (int idx = 0; idx < cacheVmSignalIndicatorHybrid.Length; idx++)
					if (cacheVmSignalIndicatorHybrid[idx] != null && cacheVmSignalIndicatorHybrid[idx].IDAssinatura == iDAssinatura && cacheVmSignalIndicatorHybrid[idx].SignalSource == signalSource && cacheVmSignalIndicatorHybrid[idx].VM_PainelId == vM_PainelId && cacheVmSignalIndicatorHybrid[idx].VM_StrategyId == vM_StrategyId && cacheVmSignalIndicatorHybrid[idx].EqualsInput(input))
						return cacheVmSignalIndicatorHybrid[idx];
			return CacheIndicator<VmSignalIndicatorHybrid>(new VmSignalIndicatorHybrid(){ IDAssinatura = iDAssinatura, SignalSource = signalSource, VM_PainelId = vM_PainelId, VM_StrategyId = vM_StrategyId }, input, ref cacheVmSignalIndicatorHybrid);
		}
	}
}

namespace NinjaTrader.NinjaScript.MarketAnalyzerColumns
{
	public partial class MarketAnalyzerColumn : MarketAnalyzerColumnBase
	{
		public Indicators.VmSignalIndicatorHybrid VmSignalIndicatorHybrid(string iDAssinatura, string signalSource, string vM_PainelId, string vM_StrategyId)
		{
			return indicator.VmSignalIndicatorHybrid(Input, iDAssinatura, signalSource, vM_PainelId, vM_StrategyId);
		}

		public Indicators.VmSignalIndicatorHybrid VmSignalIndicatorHybrid(ISeries<double> input , string iDAssinatura, string signalSource, string vM_PainelId, string vM_StrategyId)
		{
			return indicator.VmSignalIndicatorHybrid(input, iDAssinatura, signalSource, vM_PainelId, vM_StrategyId);
		}
	}
}

namespace NinjaTrader.NinjaScript.Strategies
{
	public partial class Strategy : NinjaTrader.Gui.NinjaScript.StrategyRenderBase
	{
		public Indicators.VmSignalIndicatorHybrid VmSignalIndicatorHybrid(string iDAssinatura, string signalSource, string vM_PainelId, string vM_StrategyId)
		{
			return indicator.VmSignalIndicatorHybrid(Input, iDAssinatura, signalSource, vM_PainelId, vM_StrategyId);
		}

		public Indicators.VmSignalIndicatorHybrid VmSignalIndicatorHybrid(ISeries<double> input , string iDAssinatura, string signalSource, string vM_PainelId, string vM_StrategyId)
		{
			return indicator.VmSignalIndicatorHybrid(input, iDAssinatura, signalSource, vM_PainelId, vM_StrategyId);
		}
	}
}

#endregion
