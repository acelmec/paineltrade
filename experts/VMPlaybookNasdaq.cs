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
		    public class VMPlaybookNasdaq : Strategy
		    {
		        // =====================================================================
		        // 🔒 FLAG DE MODO (altere aqui para compilar versão Cliente)
		        // =====================================================================
		        private const bool DEVELOPER_MODE = true;  // ← true = Dev | false = Cliente
					 
				// =====================================================================
		        // VARIAVEIS GERAIS E LICENÇA
		        // =====================================================================
		        private string metodovalidar = "assinatura";
				private string allowedMachineId = "7C1ABAF8961E1F923C578D2D33AC90FD";
				//8DD8C350270D4E4A0D73F2FF03C63AB5 744AA4E192501CCB064797532CE8CF62 38E81B0FC6ED3C2536E7C164321724D9
		        private bool isValid = false;
				private bool modoDesenvolvedor = false;
		        private string status0, status1;
		        private string consumerKey = "ck_75f9d0f430cb40c64c902ed43ce2bceb08e5e649";
		        private string consumerSecret = "cs_a741c57b4368102a1daf3fbfc4598833ffb23e77";
		        private int CodProduto = 7375;
				private bool popupErroLicencaJaExibido = false;
		        
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
		        private int    trailStepCount = 0;
		
		        private const string LicenseCacheFileName = "vmbot_license.enc";
		        private string licenseCachePath;
		        private DateTime? ultimaValidacaoCache = null;
		        
		        private bool buyStopOrderSent;
		        private DateTime lastOrderTime;
		        private int BarMax;
		        private int POSITION_Total;
		        
		        private SMA SMA_Close;
		        private PriorDayOHLC PriorDayOHLC1;
		        private double lastEntryPrice = 0.0;
		        private Order lastBuyOrder;
		        private Order lastSellOrder;
				private SMA _smaSlope;
		        
		        private double Resistance1, Support1, Range1;
		        private double Resistance0, Support0, resistencia, suporte;
				private double hlcaHigh, hlcaLow, hlcaClose, hlcaAverage;
				private double hlcaResistance, hlcaSupport;
				private double hlcaStopPrice = 0;
				private double gridDynamicSpacing = 0;
				
				// ── SESSÃO HILO ──
				private double _sessaoHiloHigh = 0.0;
				private double _sessaoHiloLow = 0.0;
				private bool _sessaoHiloCalculada = false;
				private bool _sessaoHiloRangeValido = false;
				private double _sessaoHiloTempHigh = double.MinValue;
				private double _sessaoHiloTempLow = double.MaxValue;
		        
		        private SMA  SMA_CLOUD1, SMA_CLOUD2;
		        private ADX  _gridADX;
		        private ATR  _gridATR;
		        private EMA  _gridEMA;
		        
		        private int QuantOperacoes;
		        bool isOutOfTimeRange = false;
		        private DateTime lastSessionDate;
		        private Queue<DateTime> candleTimes;
				
				private DateTime _lastTSPanelUpdate = DateTime.MinValue;
				private const int TS_PANEL_INTERVAL_MS = 1000; // atualiza no máximo 1x por segundo
				private bool _tsPanelUpdatePending = false;
				private int _ultimoSlotExibido = -1;
				private System.Diagnostics.Stopwatch _swBar = new System.Diagnostics.Stopwatch();
				private long _barTimeMs = 0;
				private TextBlock _tbPerf;
				
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
				private int _signalConsumedBar = -1;
				private string _lastSignalId = "";
				private volatile bool _forceCloseSignal = false;
				private System.Collections.Generic.List<string> _executedSignalIds = new System.Collections.Generic.List<string>();
				
				// ── POLLING ──
				private Task _pollTask = null;
				private bool _isPolling = false;
				private const int VM_POLL_INTERVAL_MS = 250;
				
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
				    public int Direction { get; set; }
				    public double Contrato { get; set; }
				    public string Status { get; set; }
				}
				
				// =====================================================================
				// TIME SLOT PERFORMANCE — VARIÁVEIS PRIVADAS
				// =====================================================================
				private struct TimeSlotData
				{
				    public int    TradeCount;
				    public int    WinCount;
				    public int    LossCount;        // ✅ NOVO
				    public double TotalProfit;       // Lucro líquido
				    public double TotalGrossProfit;  // ✅ NOVO: Soma apenas dos ganhos
				    public double TotalGrossLoss;    // ✅ NOVO: Soma apenas das perdas (valor absoluto)
				    
				    public double WinRate     => TradeCount > 0 ? (double)WinCount / TradeCount * 100.0 : 0;
				    public double AvgProfit   => TradeCount > 0 ? TotalProfit / TradeCount : 0;
				    
				    // ✅ NOVO: Percentual de Resultado Líquido
				    // Ex: Lucro Bruto $332, Líquido -$129 → Resultado = -38.9%
				    public double NetProfitPercent => TotalGrossProfit > 0 
				        ? (TotalProfit / TotalGrossProfit) * 100.0 
				        : 0;
				}
	            
				// ── KELTNER CHANNEL ──
				private NinjaTrader.NinjaScript.Indicators.KeltnerChannel _keltner;
				private double _kUpper, _kMid, _kLower;
				private bool   _kHadUpperBreak, _kHadLowerBreak;
				
				
				// Chave = minutos desde meia-noite do início da faixa (0, 30, 60, ...)
				private Dictionary<int, TimeSlotData> _timeSlotStats = new Dictionary<int, TimeSlotData>();
				private bool   _timeSlotCalcDone   = false;
				private DateTime _timeSlotLastCalc = DateTime.MinValue;
				
				// Painel heatmap
				private Border    _tsBorder;
				private StackPanel _tsStack;
				private const int TS_SLOT_MINUTES = 30;   // tamanho da faixa (fixo)
		        
		        // ── META DIÁRIA ──
		        private bool   isLiveTrading      = false;
		        private bool   hasReachedRealtime = false;
				private DateTime robotActivationTime = DateTime.MinValue;
		        private DateTime _dataHoje = DateTime.MinValue; 
		        private DateTime dailySessionDate = DateTime.MinValue;
		        private bool dailyLimitReached  = false;
		        private HashSet<long> realtimeOrderIds = new HashSet<long>();
				private bool isStrategyAnalyzer = false;
		        
		        // ── CONTROLE DE TRADING (Não operar na barra de ativação) ──
		        private bool allowTrading = false;
		        private int activationBar = -1;
				private bool ignorePreExistingPositions = true;  // ✅ Nova variável
				private double realizadoConta = 0;
				private bool   robotTravado   = false;
				private DateTime ultimoReset  = DateTime.MinValue;
				
				
		        // =====================================================================
		        // GRID SCALPER – VARIÁVEIS PRIVADAS
		        // =====================================================================
		        private List<Order> gridOrdersBuy;
		        private List<Order> gridOrdersSell;
		        private Order       gridFirstOrderBuy;
		        private Order       gridFirstOrderSell;
		        private int         gridCreatedBarBuy  = -1;
		        private int         gridCreatedBarSell = -1;
		        private bool        gridArmedBuy;
		        private bool        gridArmedSell;
		        private bool        gridHasOpenPosBuy;
		        private bool        gridHasOpenPosSell;
		        private bool        gridNeedsRearmBuy;
		        private bool        gridNeedsRearmSell;
		        private int         gridGeneration;
		        private int         lastProcessedBarGrid = -1;
		        private int         _lastGridDirection = 0;
				private bool isCancellingOrders = false;
				private readonly object cancelLock = new object();
				private DateTime lastCancelTime = DateTime.MinValue;
				private Task gridOperationTaskBuy = null;
				private Task gridOperationTaskSell = null;
		
		        // =====================================================================
		        // WPF PAINÉIS — referências aos elementos visuais
		        // =====================================================================
		        private Border    _mainBorder;
		        private TextBlock _tbAccount;
		        private TextBlock _tbClock;
		        private TextBlock _tbParams;
		        private TextBlock _tbPnL;
		        private TextBlock _tbStatus;
		        
		        // Painel Força 2D
		        private Border    _f2dBorder;
		        private TextBlock _tbF2dBuy;
		        private TextBlock _tbF2dSell;
		        private TextBlock _tbF2dMode;
		        private TextBlock _tbF2dSignal;
				
				// ✅ CORREÇÃO: guarda referência ao grid no momento da criação
				private System.Windows.Controls.Grid _cachedChartGrid;
		        
		        // ── Conteúdo pendente ─────────────────────────────────────────────────
		        private string _pAccount = "", _pClock = "", _pParams = "", _pPnL = "", _pStatus = "", _pPlaybookText = "";
		        private Brush  _pPnLBrush      = Brushes.White;
		        private Brush  _pStatusBrush   = Brushes.Cyan;
		        private Brush  _pPlaybookBrush = Brushes.Lime;
		        private TextBlock _sepPlaybook;
		        private TextBlock _tbPlaybook;
		        private bool   _pF2dVisible    = false;
		        private string _pF2dBuy = "", _pF2dSell = "", _pF2dMode = "", _pF2dSignal = "";
		        private Brush  _pF2dBuyBrush = Brushes.Gray, _pF2dSellBrush = Brushes.Gray, _pF2dSignalBrush = Brushes.Gray;
		
		        // =====================================================================
		        // FORÇA 2D – VARIÁVEIS PRIVADAS
		        // =====================================================================
		        private int           _force2DSeriesStart = -1;
		        private Series<double> _force2DUpSeries;
				
				
				// =====================================================================
		        // FILTROS DE COMPRA E VENDA
		        // =====================================================================
				
				// ── FILTROS DE ENTRADA COMPRA — OTIMIZADOS (FAIL FAST) ────────────────
				private bool CheckEntryFiltersBuy()
				{
				    // ── Filtro de faixa horária lucrativa ──
				    // Automático: só em live (precisa do histórico real para calcular)
				    if (TS_Mode == tsMode.Automatico && isLiveTrading && !CheckTimeSlotFilter())
				    {
				        DebugPrint($"[TS] Entrada bloqueada — faixa atual fora do critério de desempenho (Automático)");
				        return false;
				    }
				    // Importar: arquivo já carregado, funciona em live E backtest (sem isLiveTrading)
				    if (TS_Mode == tsMode.Importar && _timeSlotCalcDone && !CheckTimeSlotFilter())
				    {
				        DebugPrint($"[TS] Entrada bloqueada — faixa atual fora do critério de desempenho (Importar)");
				        return false;
				    }
				 
				    // ✅ 1. Verificações ultra-baratas (variáveis em memória)
				    if (OrderMode != orderMode.Mercado && buyStopOrder != null)
				        return false;
				 
				    if (OrderMode == orderMode.Mercado && (sellOrder != null || buyOrder != null))
				        return false;
				 
				    // ✅ 2. Direção do candle (acesso direto a array)
				    if (currentEstrategia != estrategiaMode.Preço && currentEstrategia != estrategiaMode.SessaoHILO && Close[1] <= Open[1])
	    			return false;
				 
				    // ✅ 3. Filtro de estratégia específica (barato)
				    if (currentEstrategia == estrategiaMode.ManualBox)
				    {
				        if (Resistance0 <= 0 || !BlockBreakout(1, Resistance0))
				            return false;
				    }
				    else if (currentEstrategia == estrategiaMode.SessaoHILO)
				    {
				        if (!CheckSessaoHiloCondition(1))
				            return false;
				            
				        if (SessaoHILO_Gatilho == SessaoHiloGatilhoMode.Toque || SessaoHILO_Gatilho == SessaoHiloGatilhoMode.ToqueConfirmacaoCandle)
				            return true;
				    }
				 
				    // ✅ 4. Filtros médios (indicadores já calculados)
				    if (RenkoForce && !CheckForceMovement())
				        return false;
				 
				    if (MACLOUD1_Filter && !CheckMACLOUDFilter(1, 1, Reverse_Mode1, MACLOUD1_BarShift, MACLOUD1_Min, MACLOUD1_Max, autoRangeAvg1))
				        return false;
					
					if (SmaSlope_Active && !CheckSmaSlopeFilter(1))
					    return false;
				 
				    // ✅ 5. Filtros caros (loops e cálculos)
				    if (HL_Active1 && !HL_Prior(1))
				        return false;
				 
				    if (OB_Active && !OrderBlock1(1, 1))
				        return false;
				 
				    // ✅ 6. Filtros muito caros (multi-timeframe, volume)
				    if (ACTIVE_Explosion && !FiltroExplosionCompra())
				        return false;
				 
				    if (ACTIVE_Pva && !FiltroPVAClimax(1))
				        return false;
				 
				    if (Force2D_Mode != force2DMode.OFF && !CheckForce2DFilter(1))
				        return false;
					
					// 7. Keltner Channel
					if (KELTNER_Vol_Active && !CheckKeltnerVolatility())
					    return false;
					if (KELTNER_Trigger_Active && !CheckKeltnerTrigger(1))
					    return false;
					
					// ✅ 8. Filtro de Confiança da IA (Mais caro, por isso fica por último)
				    if (!CheckAIConfidenceFilter(1)) return false;

					// ✅ 9. Filtro Tamanho Candle (Range)
					if (!CheckCandleRangeFilter(1)) return false;

					// ✅ 10. Filtro Gamma Level (Sessão 24)
					if (Gamma_FiltroAtivo && !CheckFiltroGamma(1)) return false;
				 
				    // ✅ TODOS OS FILTROS PASSARAM
				    return true;
				}
				
				private bool CheckEntryFiltersSell()
				{
				    // Automático: só em live
				    if (TS_Mode == tsMode.Automatico && isLiveTrading && !CheckTimeSlotFilter())
				    {
				        DebugPrint($"[TS] Entrada bloqueada — faixa atual fora do critério de desempenho (Automático)");
				        return false;
				    }
				    // Importar: funciona em live E backtest
				    if (TS_Mode == tsMode.Importar && _timeSlotCalcDone && !CheckTimeSlotFilter())
				    {
				        DebugPrint($"[TS] Entrada bloqueada — faixa atual fora do critério de desempenho (Importar)");
				        return false;
				    }
				 
				    // 1. Ultra-baratos (variáveis em memória)
				    if (OrderMode != orderMode.Mercado && sellStopOrder != null) return false;
				    if (OrderMode == orderMode.Mercado && (sellOrder != null || buyOrder != null)) return false;
				 
				    // 2. Básicos (acesso direto a array)
				    if (currentEstrategia != estrategiaMode.Preço && currentEstrategia != estrategiaMode.SessaoHILO && Close[1] >= Open[1])
	    			return false;
				 
				    // 3. Estratégia específica
				    if (currentEstrategia == estrategiaMode.ManualBox)
				    {
				        if (Support0 <= 0 || !BlockBreakout(-1, Support0)) return false;
				    }
				    else if (currentEstrategia == estrategiaMode.SessaoHILO)
				    {
				        if (!CheckSessaoHiloCondition(-1))
				            return false;
				            
				        if (SessaoHILO_Gatilho == SessaoHiloGatilhoMode.Toque || SessaoHILO_Gatilho == SessaoHiloGatilhoMode.ToqueConfirmacaoCandle)
				            return true;
				    }
				 
				    // 4. Médios (indicadores já calculados)
				    if (RenkoForce && !CheckForceMovement()) return false;
				    if (MACLOUD1_Filter && !CheckMACLOUDFilter(1, -1, Reverse_Mode1, MACLOUD1_BarShift, MACLOUD1_Min, MACLOUD1_Max, autoRangeAvg1)) return false;
				 	if (SmaSlope_Active && !CheckSmaSlopeFilter(-1))
					    return false;
				    // 5. Caros (loops e cálculos)
				    if (HL_Active1 && !HL_Prior(-1)) return false;
				    if (OB_Active && !OrderBlock1(-1, 1)) return false;
				 
				    // 6. Muito caros (multi-timeframe, volume)
				    if (ACTIVE_Explosion && !FiltroExplosionVenda()) return false;
				    if (ACTIVE_Pva && !FiltroPVAClimax(-1)) return false;
				    if (Force2D_Mode != force2DMode.OFF && !CheckForce2DFilter(-1)) return false;
				 	
					// 7. Keltner Channel
					if (KELTNER_Vol_Active && !CheckKeltnerVolatility())
					    return false;
					if (KELTNER_Trigger_Active && !CheckKeltnerTrigger(-1))
					    return false;
					// ✅ 8. Filtro de Confiança da IA (Mais caro, por isso fica por último)
				    if (!CheckAIConfidenceFilter(-1)) return false;

					// ✅ 9. Filtro Tamanho Candle (Range)
					if (!CheckCandleRangeFilter(1)) return false;

					// ✅ 10. Filtro Gamma Level (Sessão 24)
					if (Gamma_FiltroAtivo && !CheckFiltroGamma(-1)) return false;
					
				    return true;
				}
					
		        // =====================================================================
		        // VALIDAÇÕES
		        // =====================================================================
		        #region Validações
		        
				private void ShowInvalidLicensePopup(string title, string message)
				{
				    if (popupErroLicencaJaExibido) return;
				    popupErroLicencaJaExibido = true;
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
				    // ✅ Reset da flag no início da validação
				    popupErroLicencaJaExibido = false;
				    
				    try
				    {
				        if (string.IsNullOrWhiteSpace(IDAssinatura))
				        {
				            status0 = "Número de Assinatura inválido!";
				            ShowInvalidLicensePopup("VMBOT", status0);
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
				                            // ✅ Só permite carregar preset se assinatura for válida
				                            return;
				                        }
				                        else
				                        {
				                            status0 = "ID Machine não pertence a esta assinatura!";
				                            ShowInvalidLicensePopup("VALIDATION ERROR", status0);
											SalvarMachineIdLocal(); 
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
		                if (IDAssinatura == "") { ShowPopup("ERRO VALIDAÇÃO", "Nenhum ID de pedido informado."); isValid = false; return; }
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
		                status1 = "Pedido válido."; SalvarMachineIdLocal();  isValid = true;
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
		            const string k = "VMBOT_LICENSE_KEY_2025";
		            byte[] inp = Encoding.UTF8.GetBytes(t), kb = Encoding.UTF8.GetBytes(k), o = new byte[inp.Length];
		            for (int i = 0; i < inp.Length; i++) o[i] = (byte)(inp[i] ^ kb[i % kb.Length]);
		            return Convert.ToBase64String(o);
		        }
		
		        private string SimpleDecrypt(string t)
		        {
		            try { const string k = "VMBOT_LICENSE_KEY_2025"; byte[] inp = Convert.FromBase64String(t), kb = Encoding.UTF8.GetBytes(k), o = new byte[inp.Length]; for (int i = 0; i < inp.Length; i++) o[i] = (byte)(inp[i] ^ kb[i % kb.Length]); return Encoding.UTF8.GetString(o); } catch { return ""; }
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
		                licenseCachePath = Path.Combine(NinjaTrader.Core.Globals.UserDataDir, LicenseCacheFileName);
		                if (!File.Exists(licenseCachePath)) { DebugPrint($"[LICENSE CACHE] ❌ File not found: {licenseCachePath}"); return false; }
		                string json = SimpleDecrypt(File.ReadAllText(licenseCachePath));
		                string idM  = ExtractJsonValue1(json, "idMachine");
		                string cod  = ExtractJsonValue1(json, "codProduto");
		                string met  = ExtractJsonValue1(json, "metodoValidar");
		                string ids  = ExtractJsonValue1(json, "idAssinatura");
		                string dat  = ExtractJsonValue1(json, "dataValidacao");
		                if (string.IsNullOrEmpty(idM) || string.IsNullOrEmpty(cod) ||
		                    string.IsNullOrEmpty(met) || string.IsNullOrEmpty(ids) || string.IsNullOrEmpty(dat))
		                { DebugPrint("[LICENSE CACHE] ❌ JSON corrompido ou incompleto"); return false; }
		                if (!DateTime.TryParse(dat, out DateTime dv)) { DebugPrint($"[LICENSE CACHE] ❌ Data inválida: '{dat}'"); return false; }
		                if (idM != Cbi.License.MachineId)   { DebugPrint("[LICENSE CACHE] ❌ Machine ID divergente"); return false; }
		                if (ids != IDAssinatura)             { DebugPrint("[LICENSE CACHE] ❌ ID Assinatura divergente"); return false; }
		                if (met != metodovalidar && met != "assinatura") { DebugPrint("[LICENSE CACHE] ❌ Método de validação divergente"); return false; }
		                if ((DateTime.UtcNow - dv).TotalHours > 24) { DebugPrint("[LICENSE CACHE] ❌ Cache expirado (>24h)"); return false; }
		                ultimaValidacaoCache = dv;
		                DebugPrint($"[LICENSE CACHE] ✅ Válido — última validação: {dv:yyyy-MM-dd HH:mm:ss} UTC");
		                return true;
		            }
		            catch (Exception ex) { DebugPrint($"[LICENSE CACHE] ❌ Erro ao ler cache: {ex.Message}"); return false; }
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
		            catch (Exception ex) { DebugPrint($"[CACHE] Erro: {ex.Message}"); }
		        }
		        #endregion
		
				#region Validacao de posicoes na conta
				// =====================================================================
				// ✅ FUNÇÃO 1: Verifica se há POSIÇÃO ABERTA na conta (qualquer origem)
				// =====================================================================
				private bool HasAccountPosition()
				{
				    try
				    {
				        if (Position != null && Position.MarketPosition != MarketPosition.Flat)
				        {
				            DebugPrint($"[HasAccountPosition] ✅ Posição ativa na estratégia: {Position.Quantity} contratos ({Position.MarketPosition})");
				            return true;
				        }

				        if (Account?.Positions != null)
				        {
				            foreach (NinjaTrader.Cbi.Position pos in Account.Positions)
				            {
				                if (pos != null &&
				                    pos.Instrument != null &&
				                    (pos.Instrument == Instrument ||
				                     pos.Instrument.FullName == Instrument.FullName ||
				                     (pos.Instrument.MasterInstrument != null && Instrument.MasterInstrument != null && string.Equals(pos.Instrument.MasterInstrument.Name, Instrument.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))) &&
				                    pos.Quantity != 0)
				                {
				                    DebugPrint($"[HasAccountPosition] ✅ Posição encontrada na conta: {pos.Quantity} contratos");
				                    return true;
				                }
				            }
				        }
				        return false;
				    }
				    catch (Exception ex)
				    {
				        DebugPrint($"[ERRO] HasAccountPosition: {ex.Message}");
				        return Position.MarketPosition != MarketPosition.Flat;
				    }
				}
				
				// =====================================================================
		// ✅ FUNÇÃO 2: Verifica se há ORDENS PENDENTES na conta (QUALQUER origem)
		// =====================================================================
		private bool HasAccountWorkingOrders()
		{
		    try
		    {
		        if (buyStopOrder != null && (buyStopOrder.OrderState == OrderState.Working || buyStopOrder.OrderState == OrderState.Submitted || buyStopOrder.OrderState == OrderState.Accepted))
		            return true;
		        if (sellStopOrder != null && (sellStopOrder.OrderState == OrderState.Working || sellStopOrder.OrderState == OrderState.Submitted || sellStopOrder.OrderState == OrderState.Accepted))
		            return true;
		        if (buyOrder != null && (buyOrder.OrderState == OrderState.Working || buyOrder.OrderState == OrderState.Submitted || buyOrder.OrderState == OrderState.Accepted))
		            return true;
		        if (sellOrder != null && (sellOrder.OrderState == OrderState.Working || sellOrder.OrderState == OrderState.Submitted || sellOrder.OrderState == OrderState.Accepted))
		            return true;

		        if (Account?.Orders != null)
		        {
		            foreach (Order order in Account.Orders.ToList())
		            {
		                if (order != null && 
		                    order.Instrument != null &&
		                    (order.Instrument == Instrument ||
		                     order.Instrument.FullName == Instrument.FullName ||
		                     (order.Instrument.MasterInstrument != null && Instrument.MasterInstrument != null && string.Equals(order.Instrument.MasterInstrument.Name, Instrument.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))) &&
		                    (order.OrderState == OrderState.Working || 
		                     order.OrderState == OrderState.Submitted ||
		                     order.OrderState == OrderState.Accepted))
		                {
		                    DebugPrint($"[HasAccountWorkingOrders] ✅ Ordem pendente: {order.Name} ({order.OrderState}) | ID: {order.Id} | Origem: {(order.Id.ToString().Contains("Strategy") ? "Estratégia" : "Manual/Outra")}");
		                    return true;
		                }
		            }
		        }
		        return false;
		    }
		    catch (Exception ex)
		    {
		        DebugPrint($"[ERRO] HasAccountWorkingOrders: {ex.Message}");
		        return false;
		    }
		}
				
				// =====================================================================
				// ✅ FUNÇÃO 3: Verifica POSIÇÃO OU ORDEM PENDENTE (combina as 2 acima)
				// =====================================================================
				private bool HasAccountPositionOrOrders()
				{
				    bool hasPos = HasAccountPosition();
				    bool hasOrders = HasAccountWorkingOrders();
				    
				    if (hasPos || hasOrders)
				    {
				        DebugPrint($"[HasAccountPositionOrOrders] ⚠ Conta ocupada | Posição: {hasPos} | Ordens: {hasOrders}");
				        return true;
				    }
				    
				    return false;
				}
				#endregion
				
				// Substituir todos os DebugPrint() por:
				private void DebugPrint(string msg)
				{
				    if (DebugMode) Print(msg);
				}
				
				
				// =====================================================================
				// CALCULA DESEMPENHO HISTÓRICO POR FAIXA DE 30 MINUTOS
				// Chamado em OnBarUpdate, uma vez por sessão.PresetActionEnum.Carregar
				// =====================================================================
				private void CalcTimeSlotPerformance()
				{
				    _timeSlotStats.Clear();
				    try
				    {
				        if (SystemPerformance?.AllTrades == null) return;
				        
				        foreach (var trade in SystemPerformance.AllTrades)
				        {
				            if (trade?.Entry == null || trade.Exit == null) continue;
				            
				            int entryMinutes = trade.Entry.Time.Hour * 60 + trade.Entry.Time.Minute;
				            int slotKey      = (entryMinutes / TS_SLOT_MINUTES) * TS_SLOT_MINUTES;
				            
				            if (!_timeSlotStats.ContainsKey(slotKey))
				                _timeSlotStats[slotKey] = new TimeSlotData();
				            
				            var s = _timeSlotStats[slotKey];
				            s.TradeCount++;
				            
				            double tradeProfit = trade.ProfitCurrency;
				            
				            if (tradeProfit > 0) 
				            { 
				                s.WinCount++; 
				                s.TotalGrossProfit += tradeProfit;
				            }
				            else 
				            { 
				                s.LossCount++;
				                s.TotalGrossLoss += Math.Abs(tradeProfit);
				            }
				            
				            s.TotalProfit += tradeProfit;
				            _timeSlotStats[slotKey] = s;
				        }
				        
				        _timeSlotCalcDone = true;
				        _timeSlotLastCalc = Time[0];
				        
				        DebugPrint($"[TS] Análise calculada: {_timeSlotStats.Count} faixas | {SystemPerformance.AllTrades.Count} trades");
				
				        if (TS_AutoExport && !string.IsNullOrWhiteSpace(TS_ExportFileName))
				            ExportarHorarios(TS_ExportFileName);
				
				        // ✅ FIX: força reset do slot exibido para garantir atualização do painel
				        _ultimoSlotExibido = -1;  // ← ADICIONAR ESTA LINHA
				    }
				    catch (Exception ex)
				    {
				        DebugPrint($"[TS] Erro CalcTimeSlotPerformance: {ex.Message}");
				    }
				}
				// =====================================================================
				// PASTA BASE DOS ARQUIVOS DE HORÁRIOS
				// =====================================================================
				private string GetHorariosDir()
				{
				    string dir = Path.Combine(NinjaTrader.Core.Globals.UserDataDir, "horarios");
				    if (!Directory.Exists(dir))
				    {
				        Directory.CreateDirectory(dir);
				        DebugPrint($"[HORÁRIOS] 📁 Pasta criada: {dir}");
				    }
				    return dir;
				}
				
				// =====================================================================
				// EXPORTAR — grava os slots aprovados em arquivo .txt
				// Chamado automaticamente após CalcTimeSlotPerformance se TS_AutoExport = true
				// Pode ser chamado manualmente com qualquer nome de arquivo
				// =====================================================================
				private void ExportarHorarios(string fileName)
				{
				    try
				    {
				        if (string.IsNullOrWhiteSpace(fileName))
				        {
				            DebugPrint("[HORÁRIOS] ⚠️ Nome de arquivo vazio — export cancelado.");
				            return;
				        }
				
				        string path = Path.Combine(GetHorariosDir(), fileName.Trim() + ".txt");
				        var sb = new StringBuilder();
				
				        sb.AppendLine("# Horários Lucrativos");
				        sb.AppendLine($"# Instrumento:   {Instrument.FullName}");
				        sb.AppendLine($"# Gerado:        {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
				        sb.AppendLine($"# Filtros:       WR>={TS_MinWinRate:F1}%  |  Trades>={TS_MinTrades}  |  Liq>={TS_MinNetProfitPercent:F1}%");
				        sb.AppendLine($"# Slot (min):    {TS_SLOT_MINUTES} minutos por faixa");
				        sb.AppendLine("# ──────────────────────────────────────────────────────────");
				        sb.AppendLine("# Formato de cada linha:");
				        sb.AppendLine("# SlotMinutos;WinRate;TradeCount;WinCount;LossCount;TotalProfit;TotalGrossProfit;TotalGrossLoss");
				        sb.AppendLine("# ──────────────────────────────────────────────────────────");
				
				        int exportados = 0;
				
				        // Exporta SOMENTE os slots aprovados nos 3 critérios
						var ic = System.Globalization.CultureInfo.InvariantCulture;
						foreach (var kv in _timeSlotStats
						    .Where(kv => kv.Value.TradeCount >= TS_MinTrades
						        && kv.Value.WinRate    >= TS_MinWinRate
						        && kv.Value.NetProfitPercent >= TS_MinNetProfitPercent)
						    .OrderBy(x => x.Key))
						{
						    var d = kv.Value;
						    sb.AppendLine(string.Join(";",
						        kv.Key,
						        d.WinRate.ToString("F4", ic),
						        d.TradeCount,
						        d.WinCount,
						        d.LossCount,
						        d.TotalProfit.ToString("F4", ic),
						        d.TotalGrossProfit.ToString("F4", ic),
						        d.TotalGrossLoss.ToString("F4", ic)
						    ));
						    exportados++;
						}
				
				        File.WriteAllText(path, sb.ToString(), Encoding.UTF8);
				        DebugPrint($"[HORÁRIOS] ✅ Exportados {exportados} slots → {path}");
				        Print($"[VM BOT] Horários salvos em: {path}");
				    }
				    catch (Exception ex)
				    {
				        DebugPrint($"[HORÁRIOS] ❌ Erro ao exportar: {ex.Message}");
				    }
				}
				
				// =====================================================================
				// IMPORTAR — carrega slots de arquivo .txt para _timeSlotStats
				// Substitui completamente o dicionário atual
				// =====================================================================
				private void ImportarHorarios(string fileName)
				{
				    try
				    {
				        if (string.IsNullOrWhiteSpace(fileName))
				        {
				            DebugPrint("[HORÁRIOS] ⚠️ Nome de arquivo vazio — import cancelado.");
				            return;
				        }
				
				        string path = Path.Combine(GetHorariosDir(), fileName.Trim() + ".txt");
				
				        if (!File.Exists(path))
				        {
				            DebugPrint($"[HORÁRIOS] ❌ Arquivo não encontrado: {path}");
				            Print($"[VM BOT] ⚠️ Arquivo de horários não encontrado: {path}");
				            return;
				        }
				
				        _timeSlotStats.Clear();
				        int lidos = 0, erros = 0;
				
				        foreach (string linha in File.ReadAllLines(path, Encoding.UTF8))
				        {
				            // Ignora comentários e linhas vazias
				            string l = linha.Trim();
				            if (string.IsNullOrEmpty(l) || l.StartsWith("#")) continue;
				
				            string[] p = l.Split(';');
				            if (p.Length < 8)
				            {
				                DebugPrint($"[HORÁRIOS] ⚠️ Linha ignorada (colunas insuficientes): {l}");
				                erros++;
				                continue;
				            }
				
				            try
				            {
				                int    slotKey         = int.Parse(p[0].Trim());
				                int    tradeCount      = int.Parse(p[2].Trim());
				                int    winCount        = int.Parse(p[3].Trim());
				                int    lossCount       = int.Parse(p[4].Trim());
				                double totalProfit     = double.Parse(p[5].Trim(), System.Globalization.CultureInfo.InvariantCulture);
				                double totalGrossProfit= double.Parse(p[6].Trim(), System.Globalization.CultureInfo.InvariantCulture);
				                double totalGrossLoss  = double.Parse(p[7].Trim(), System.Globalization.CultureInfo.InvariantCulture);
				
				                var slot = new TimeSlotData
				                {
				                    TradeCount       = tradeCount,
				                    WinCount         = winCount,
				                    LossCount        = lossCount,
				                    TotalProfit      = totalProfit,
				                    TotalGrossProfit = totalGrossProfit,
				                    TotalGrossLoss   = totalGrossLoss
				                };
				
				                _timeSlotStats[slotKey] = slot;
				                lidos++;
				
				                int h = slotKey / 60, m = slotKey % 60;
				                DebugPrint($"[HORÁRIOS] 📥 Slot {h:D2}:{m:D2} | " +
				                           $"WR={slot.WinRate:F1}% | Trades={tradeCount} | " +
				                           $"Líq=${totalProfit:F2} | Bruto=${totalGrossProfit:F2}");
				            }
				            catch (Exception ex)
				            {
				                DebugPrint($"[HORÁRIOS] ⚠️ Erro ao parsear linha '{l}': {ex.Message}");
				                erros++;
				            }
				        }
				
				        _timeSlotCalcDone = true;
				        _timeSlotLastCalc = DateTime.Now;
				
				        // ✅ LOGS ADICIONAIS PARA DEBUG
						DebugPrint($"[HORÁRIOS] ✅ Variáveis após import:");
						DebugPrint($"[HORÁRIOS]    _timeSlotCalcDone = {_timeSlotCalcDone}");
						DebugPrint($"[HORÁRIOS]    _timeSlotStats.Count = {_timeSlotStats.Count}");
						DebugPrint($"[HORÁRIOS]    TS_Mode = {TS_Mode}");
						DebugPrint($"[HORÁRIOS]    TS_ShowPanel = {TS_ShowPanel}");
						
						DebugPrint($"[HORÁRIOS] ✅ Import concluído: {lidos} slots carregados, {erros} erros | {path}");
						Print($"[VM BOT] Horários importados: {lidos} faixas de '{fileName}.txt'");
				    }
	
					catch (Exception ex)
					{
					    DebugPrint($"[HORÁRIOS] ❌ Erro crítico no import: {ex.Message}");
					    
					    // ✅ FALLBACK: define flag para não travar o painel
					    _timeSlotCalcDone = true;  // ← ADICIONAR ESTA LINHA
					    _timeSlotLastCalc = DateTime.Now;
					    
					    // Opcional: libera operação se TS_BlockIfNoData = false
					    if (!TS_BlockIfNoData)
					        DebugPrint("[HORÁRIOS] ⚠️ TS_BlockIfNoData=false → liberando operação mesmo sem dados");
					}
				}
		
				// =====================================================================
				// FILTRO: verifica se o horário atual está em faixa aprovada
				// Retorna true = pode operar | false = bloqueia entrada
				// ✅ CORREÇÃO: Usa OS MESMOS 3 FILTROS do painel e verifica slot EXATO
				// ✅ FUNCIONA PARA: Modo Automatico E Modo Importar
				// =====================================================================
				private bool CheckTimeSlotFilter()
				{
				    // ✅ CORREÇÃO 1: Respeitar TS_BlockIfNoData quando não calculou
				    if (!_timeSlotCalcDone)
				    {
				        if (TS_BlockIfNoData)
				        {
				            DebugPrint($"[TS] ⛔ BLOQUEADO: aguardando cálculo (TS_BlockIfNoData={TS_BlockIfNoData})");
				            return false;
				        }
				        DebugPrint($"[TS] ⚠️ _timeSlotCalcDone=FALSE — liberando (TS_BlockIfNoData=false)");
				        return true;
				    }
				    
				    // ✅ CORREÇÃO 2: Modo Importar com dicionário vazio = BLOQUEIA
				    if (TS_Mode == tsMode.Importar && _timeSlotStats.Count == 0)
				    {
				        DebugPrint($"[TS] ⛔ MODO IMPORTAR: dicionário vazio — BLOQUEADO");
				        return false;
				    }
				    
				    // ✅ OBTER HORÁRIO ATUAL (corretor ou barra)
				    DateTime agora = (isLiveTrading && currentBrokerTime != DateTime.MinValue)
				        ? currentBrokerTime : Times[0][0];
				    TimeSpan ct        = agora.TimeOfDay;
				    int currentMinutes = (int)ct.TotalMinutes;
				    int slotKey        = (currentMinutes / TS_SLOT_MINUTES) * TS_SLOT_MINUTES;
				    
				    // ✅ FILTRO CONSISTENTE: MESMOS 3 CRITÉRIOS DO PAINEL
				    var faixasAprovadas = _timeSlotStats
				        .Where(kv => kv.Value.TradeCount >= TS_MinTrades
				                  && kv.Value.WinRate    >= TS_MinWinRate
				                  && kv.Value.NetProfitPercent >= TS_MinNetProfitPercent)
				        .OrderBy(kv => kv.Key)
				        .ToList();
				    
				    // Se não houver nenhuma faixa aprovada, BLOQUEIA TUDO
				    if (faixasAprovadas.Count == 0)
				    {
				        DebugPrint($"[TS] ⛔ NENHUMA faixa aprovada nos 3 critérios — BLOQUEADO {ct}");
				        return false;
				    }
				    
				    // ✅ CORREÇÃO CRÍTICA: Verifica se o slot ATUAL está na lista exata de aprovados
				    if (!faixasAprovadas.Any(kv => kv.Key == slotKey))
				    {
				        DebugPrint($"[TS] ⛔ Slot {slotKey/60:D2}:{slotKey%60:D2} NÃO está na lista aprovada — BLOQUEADO");
				        string lista = string.Join(", ", faixasAprovadas.Select(x => $"{x.Key/60:D2}:{x.Key%60:D2}"));
				        DebugPrint($"[TS] 📋 Faixas Aprovadas: {lista}");
				        return false;  // ← AQUI É ONDE BLOQUEIA QUANDO FORA DO HORÁRIO!
				    }
				    
				    // Validação redundante de segurança
				    var data = _timeSlotStats[slotKey];
				    if (data.TradeCount <= TS_MinTrades || 
				        data.WinRate <= TS_MinWinRate || 
				        data.NetProfitPercent <= TS_MinNetProfitPercent)
				    {
				        return false;
				    }
				    
				    // ✅ APROVADO
				    DebugPrint($"[TS] ✅ {ct} Slot {slotKey/60:D2}:{slotKey%60:D2} | " +
				               $"WR={data.WinRate:F1}% | %Líq={data.NetProfitPercent:F1}% | APROVADO");
				    return true;
				}
	
				// =====================================================================
				// PAINEL HEATMAP — CRIAÇÃO E ATUALIZAÇÃO
				// =====================================================================
				
				private void CreateTimeSlotPanel(System.Windows.Controls.Grid g)
				{
				    _tsBorder = MakePanelBorder(TS_Panel_X, TS_Panel_Y);
				    _tsStack  = (StackPanel)_tsBorder.Child;
				
				    _tsStack.Children.Add(MakeTB("  ══ HORÁRIOS LUCRATIVOS ══", Brushes.White, 12));
				    _tsStack.Children.Add(MakeSep());
				    _tsStack.Children.Add(MakeTB("Calculando...", Brushes.Gray, 11));
				
				    g.Children.Add(_tsBorder);
				}
				
				
				// =====================================================================
				// PAINEL HEATMAP — CRIAÇÃO E ATUALIZAÇÃO
				// ✅ CORREÇÃO: Usa OS MESMOS 3 FILTROS do CheckTimeSlotFilter
				// =====================================================================
				private void UpdateTimeSlotPanel()
				{
				    if ((TS_Mode != tsMode.Automatico && TS_Mode != tsMode.Importar) || !TS_ShowPanel) return;
				    if (ChartControl == null) return;
				    
				    // Throttle — no máximo 1x por segundo
				    if ((DateTime.Now - _lastTSPanelUpdate).TotalMilliseconds < TS_PANEL_INTERVAL_MS) return;
				    _lastTSPanelUpdate = DateTime.Now;
				    
				    if (_tsPanelUpdatePending) return;
				    _tsPanelUpdatePending = true;
				    
				    DebugPrint($"[TS PANEL] Update iniciado | TS_Mode={TS_Mode} | _timeSlotCalcDone={_timeSlotCalcDone} | Slots={_timeSlotStats.Count}");
				    
				    ChartControl.Dispatcher.InvokeAsync(() =>
				    {
				        try
				        {
				            var g = GetChartSpecificGrid();
				            if (g == null) return;
				            if (_tsBorder == null) CreateTimeSlotPanel(g);
				            if (_tsBorder == null || _tsStack == null) return;
				            
				            // Ajuste de posição
				            double maxX = Math.Max(0, ChartControl.ActualWidth - _tsBorder.ActualWidth - 10);
				            double maxY = Math.Max(0, ChartControl.ActualHeight - _tsBorder.ActualHeight - 10);
				            _tsBorder.Margin = new Thickness(Math.Min(TS_Panel_X, maxX), Math.Min(TS_Panel_Y, maxY), 0, 0);
				            _tsBorder.Visibility = Visibility.Visible;
				            
				            _tsStack.Children.Clear();
				            _tsStack.Children.Add(MakeTB("  ══ HORÁRIOS LUCRATIVOS ══", Brushes.White, 12));
				            _tsStack.Children.Add(MakeSep());
				            
				            string modeLabel = TS_Mode == tsMode.Manual 
				                ? "MODO: Manual (sessão fixa)" 
				                : $"WR mín: {TS_MinWinRate:F0}%  |  %Líq mín: {TS_MinNetProfitPercent:F0}%";
				            _tsStack.Children.Add(MakeTB(modeLabel, Brushes.Khaki, 10));
				            _tsStack.Children.Add(MakeSep());
				            
				            // ✅ CORREÇÃO CRÍTICA: Modo Importar não depende de _timeSlotCalcDone
				            bool canDisplay = TS_Mode == tsMode.Importar 
				                ? _timeSlotStats.Count > 0  // Importar: basta ter dados carregados
				                : _timeSlotCalcDone;         // Automático: precisa ter calculado
				            
				            if (!canDisplay)
				            {
				                _tsStack.Children.Add(MakeTB("Calculando histórico...", Brushes.Gray, 11));
				                DebugPrint($"[TS PANEL] ⚠️ Aguardando dados | Importar: {_timeSlotStats.Count} slots | Auto: _timeSlotCalcDone={_timeSlotCalcDone}");
				                return;
				            }
				            
				            // Obter horário atual (usa horário local para casar com arquivo)
				            DateTime agora = (isLiveTrading && currentBrokerTime != DateTime.MinValue)
				                ? currentBrokerTime : Times[0][0];
				            int currentMinutes = (int)agora.TimeOfDay.TotalMinutes;
				            int currentSlot = (currentMinutes / TS_SLOT_MINUTES) * TS_SLOT_MINUTES;
				            
				            DebugPrint($"[TS PANEL] ⏰ Hora: {agora:HH:mm} | Slot atual: {currentSlot/60:D2}:{currentSlot%60:D2}");
				            
				            // ✅ FILTRO: Mesmos 3 critérios do CheckTimeSlotFilter
				            var aprovadas = _timeSlotStats
				                .Where(kv => kv.Value.TradeCount >= TS_MinTrades
				                          && kv.Value.WinRate >= TS_MinWinRate
				                          && kv.Value.NetProfitPercent >= TS_MinNetProfitPercent)
				                .OrderBy(kv => kv.Key)
				                .ToList();
				            
				            DebugPrint($"[TS PANEL] 📊 Aprovados: {aprovadas.Count} de {_timeSlotStats.Count} slots");
				            
				            if (aprovadas.Count == 0)
				            {
				                _tsStack.Children.Add(MakeTB("Nenhuma faixa aprovada", Brushes.OrangeRed, 11));
				                return;
				            }
				            
				            // Renderizar slots aprovados
				            double totalGeral = 0;
				            int tradesGeral = 0;
				            
				            foreach (var kv in aprovadas)
				            {
				                int slotKey = kv.Key;
				                var data = kv.Value;
				                int endMin = slotKey + TS_SLOT_MINUTES;
				                string hora = $"{slotKey/60:D2}:{slotKey%60:D2}–{endMin/60:D2}:{endMin%60:D2}";
				                bool isCurrent = slotKey == currentSlot;
				                string arrow = isCurrent ? " ◄" : "";
				                
				                string linha = $"{hora}  {data.WinRate:F0}%WR  {data.NetProfitPercent:F0}%Líq  {data.TradeCount}T{arrow}";
				                var tb = MakeTB(linha, Brushes.LimeGreen, 11);
				                if (isCurrent) tb.FontWeight = System.Windows.FontWeights.Bold;
				                
				                _tsStack.Children.Add(tb);
				                totalGeral += data.TotalProfit;
				                tradesGeral += data.TradeCount;
				            }
				            
				            _tsStack.Children.Add(MakeSep());
				            
				            // Totalizador
				            string sinal = totalGeral >= 0 ? "+" : "";
				            string medGeral = tradesGeral > 0 ? $"  Méd:{sinal}{totalGeral/tradesGeral:F0}$" : "";
				            var tbTotal = MakeTB($"Total: {sinal}{totalGeral:F0}$  {tradesGeral}T{medGeral}",
				                totalGeral >= 0 ? Brushes.LimeGreen : Brushes.OrangeRed, 11);
				            tbTotal.FontWeight = System.Windows.FontWeights.Bold;
				            _tsStack.Children.Add(tbTotal);
				            
				            DebugPrint($"[TS PANEL] ✅ Painel atualizado | {aprovadas.Count} faixas exibidas");
				        }
				        catch (Exception ex)
				        {
				            DebugPrint($"[TS Panel] Erro: {ex.Message}");
				        }
				        finally
				        {
				            _tsPanelUpdatePending = false;
				        }
				    }, System.Windows.Threading.DispatcherPriority.Background);
				}
				
				private void RemoveTimeSlotPanel()
				{
				    try
				    {
				        var g = GetChartSpecificGrid();
				        if (g != null && _tsBorder != null && g.Children.Contains(_tsBorder))
				            g.Children.Remove(_tsBorder);
				    }
				    catch { }
				    _tsBorder = null;
				    _tsStack  = null;
				}
				
				
				
		        #region Força Renko
		        private bool CheckForceMovement()
		        {
		            return candleTimes.Count >= CandleThreshold;
		        }
		
		        private void RemoveOldCandles()
		        {
		            while (candleTimes.Count > 0 && (Time[0] - candleTimes.Peek()).TotalSeconds > TimePeriodSeconds)
		                candleTimes.Dequeue();
		        }
		        #endregion
		
		        #region BlockBreakout (Filtro Global)
		        public bool BlockBreakout(int tipo, double price)
		        {
		            if (OrderMode != orderMode.Mercado) return true;
		            double p = Closes[0][0];
		            return (tipo == 1 && p >= price) || (tipo == -1 && p <= price);
		        }
		        #endregion
		
		        #region HiloPrior
				
				private bool HL_Prior(int type)
				{
				    if (!HL_BREAKOUT1 && !HL_PULLBACK1) return false;
				    
				    if (HL_FilterType == HL_ModeType.HL)
				    {
				        return HL_Prior_Legacy(type);
				    }
				    else
				    {
				        return HL_Prior_HLCA(type);
				    }
				}
				
				private bool HL_Prior_Legacy(int type)
				{
				    double lo = PriorDayOHLC1.PriorLow[0], hi = PriorDayOHLC1.PriorHigh[0];
				    double diff = hi - lo, max = diff * HL_Limit_Max1 / 100, min = diff * HL_Limit_Min1 / 100;
				    Resistance1 = hi; Support1 = lo;
				    double bid = GetCurrentBid();
				    
				    if (diff <= HL_Range_MinSize1 * TickSize || diff >= HL_Range_MaxSize1 * TickSize) return false;
				    
				    if (type == 1)
				    {
				        if (HL_BREAKOUT1 && bid > hi + min && bid < hi + max) return true;
				        if (HL_PULLBACK1 && bid < lo + max && bid > lo + min) return true;
				    }
				    else
				    {
				        if (HL_BREAKOUT1 && bid < lo - min && bid > lo - max) return true;
				        if (HL_PULLBACK1 && bid > hi - max && bid < hi - min) return true;
				    }
				    return false;
				}
				
				private bool HL_Prior_HLCA(int type)
				{
				    double lo = PriorDayOHLC1.PriorLow[0];
				    double hi = PriorDayOHLC1.PriorHigh[0];
				    double close = PriorDayOHLC1.PriorClose[0];
				    double open = PriorDayOHLC1.PriorOpen[0];
				    double average = (hi + lo + open + close) / 4.0;
				    
				    hlcaHigh = hi;
				    hlcaLow = lo;
				    hlcaClose = close;
				    hlcaAverage = average;
				    
				    // ── 1. Criar e ordenar os 4 níveis ──────────────────────────────
				    double[] levels = new double[] { hi, lo, close, average };
				    Array.Sort(levels);  // [0]=menor, [1], [2], [3]=maior
				    
				    double bid = GetCurrentBid();
				    
				    // ── 2. Identificar posição do preço em relação aos níveis ───────
				    int levelsAbove = 0;
				    int levelsBelow = 0;
				    
				    foreach (double level in levels)
				    {
				        if (level > bid) levelsAbove++;
				        if (level < bid) levelsBelow++;
				    }
				    
				    // ── 3. Calcular Range DINÂMICO baseado na posição do preço ──────
				    double diff = 0;
				    double dynamicResistance = 0;
				    double dynamicSupport = 0;
				    
				    // CASO 1: Preço ACIMA de todos os níveis (rompeu máxima)
				    if (levelsAbove == 0)
				    {
				        // Range = High - 2º nível mais alto
				        diff = levels[3] - levels[2];
				        dynamicResistance = levels[3];  // High
				        dynamicSupport = levels[2];     // 2º nível abaixo do High
				        DebugPrint($"[HLCA] 📈 ROMPEU MÁXIMA | Range={diff:F2} | Níveis usados: [{levels[2]:F2} - {levels[3]:F2}]");
				    }
				    // CASO 2: Preço ABAIXO de todos os níveis (rompeu mínima)
				    else if (levelsBelow == 0)
				    {
				        // Range = 2º nível mais baixo - Low
				        diff = levels[1] - levels[0];
				        dynamicResistance = levels[1];  // 2º nível acima do Low
				        dynamicSupport = levels[0];     // Low
				        DebugPrint($"[HLCA] 📉 ROMPEU MÍNIMA | Range={diff:F2} | Níveis usados: [{levels[0]:F2} - {levels[1]:F2}]");
				    }
				    // CASO 3: Preço ENTRE os níveis (cenário normal)
				    else
				    {
				        // Encontrar resistência mais próxima (primeiro nível acima do preço)
				        // Encontrar suporte mais próximo (primeiro nível abaixo do preço)
				        double nearestAbove = double.MaxValue;
				        double nearestBelow = double.MinValue;
				        
				        foreach (double level in levels)
				        {
				            if (level > bid && level < nearestAbove)
				                nearestAbove = level;
				            if (level < bid && level > nearestBelow)
				                nearestBelow = level;
				        }
				        
				        // Range = ResistênciaMaisPróxima - SuporteMaisPróximo
				        diff = nearestAbove - nearestBelow;
				        dynamicResistance = nearestAbove;
				        dynamicSupport = nearestBelow;
				        DebugPrint($"[HLCA] ➡️ ENTRE NÍVEIS | Range={diff:F2} | Suporte={nearestBelow:F2} | Resistência={nearestAbove:F2}");
				    }
				    
				    // ── 4. Validar Range dentro dos limites ─────────────────────────
				    if (diff <= HL_Range_MinSize1 * TickSize || diff >= HL_Range_MaxSize1 * TickSize)
				    {
				        DebugPrint($"[HLCA] ❌ Range {diff:F2} (ticks: {diff/TickSize:F0}) fora dos limites");
				        return false;
				    }
				    
				    // ── 5. Calcular distâncias de entrada ───────────────────────────
				    double maxDist = diff * HL_Limit_Max1 / 100;
				    double minDist = diff * HL_Limit_Min1 / 100;
				    
				    // Atualizar variáveis globais para Stop Loss e Grid Dinâmico
				    Resistance1 = dynamicResistance;
				    Support1 = dynamicSupport;
				    hlcaResistance = dynamicResistance;
				    hlcaSupport = dynamicSupport;
				    
				    DebugPrint($"[HLCA] Preço={bid:F2} | minDist={minDist:F2} | maxDist={maxDist:F2}");
				    
				    // ── 6. Validar condições de entrada ─────────────────────────────
				    bool result = false;
				    
				    if (type == 1)  // COMPRA
				    {
				        // Breakout de Compra: preço acima da resistência + zona de entrada
				        if (HL_BREAKOUT1 && dynamicResistance > 0)
				        {
				            bool breakoutBuy = bid > dynamicResistance + minDist && bid <= dynamicResistance + maxDist;
				            if (breakoutBuy)
				            {
				                DebugPrint($"[HLCA] ✅ COMPRA BREAKOUT: {bid:F2} rompeu {dynamicResistance:F2} + [{minDist:F2}-{maxDist:F2}]");
				                result = true;
				            }
				        }
				        
				        // Pullback de Compra: preço próximo ao suporte (acima dele)
				        if (HL_PULLBACK1 && !result && dynamicSupport > 0)
				        {
				            bool pullbackBuy = bid >= dynamicSupport + minDist && bid <= dynamicSupport + maxDist;
				            if (pullbackBuy)
				            {
				                DebugPrint($"[HLCA] ✅ COMPRA PULLBACK: {bid:F2} próximo ao suporte {dynamicSupport:F2} + [{minDist:F2}-{maxDist:F2}]");
				                result = true;
				            }
				        }
				    }
				    else  // VENDA
				    {
				        // Breakout de Venda: preço abaixo do suporte - zona de entrada
				        if (HL_BREAKOUT1 && dynamicSupport > 0)
				        {
				            bool breakoutSell = bid < dynamicSupport - minDist && bid >= dynamicSupport - maxDist;
				            if (breakoutSell)
				            {
				                DebugPrint($"[HLCA] ✅ VENDA BREAKOUT: {bid:F2} rompeu {dynamicSupport:F2} - [{minDist:F2}-{maxDist:F2}]");
				                result = true;
				            }
				        }
				        
				        // Pullback de Venda: preço próximo à resistência (abaixo dela)
				        if (HL_PULLBACK1 && !result && dynamicResistance > 0)
				        {
				            bool pullbackSell = bid >= dynamicResistance - maxDist && bid <= dynamicResistance - minDist;
				            if (pullbackSell)
				            {
				                DebugPrint($"[HLCA] ✅ VENDA PULLBACK: {bid:F2} próximo à resistência {dynamicResistance:F2} - [{minDist:F2}-{maxDist:F2}]");
				                result = true;
				            }
				        }
				    }
				    
				    if (!result)
				        DebugPrint($"[HLCA] ❌ Nenhuma condição atendida. Tipo={type} | DistSuporte={bid-dynamicSupport:F2} | DistResist={dynamicResistance-bid:F2}");
				    
				    return result;
				}
				
				private double FindNearestLevelAbove(double price, double[] levels)
				{
				    double nearest = double.MaxValue;
				    foreach (double level in levels)
				    {
				        if (level >= price && level < nearest)
				            nearest = level;
				    }
				    return nearest == double.MaxValue ? 0 : nearest;
				}
				
				private double FindNearestLevelBelow(double price, double[] levels)
				{
				    double nearest = double.MinValue;
				    foreach (double level in levels)
				    {
				        if (level <= price && level > nearest)
				            nearest = level;
				    }
				    return nearest == double.MinValue ? 0 : nearest;
				}
				#endregion
				
				private bool CheckSmaSlopeFilter(int direction)
				{
				    if (!SmaSlope_Active) return true;
				    if (_smaSlope == null) return true;
				
				    int shift  = SmaSlope_BarsShift;
				    int refB   = Math.Max(1, SmaSlope_RefBars);
				    if (CurrentBar < shift + refB + SmaSlope_Period) return false;
					double cur  = _smaSlope[shift];
				    double barref  = _smaSlope[shift + refB];
				    double slope = (cur - barref) / refB;
				
				    // Se InvertLogic ativo, inverte a lógica do tipo de ordem: Compra aceita slope negativo e Venda aceita slope positivo
				    int targetDir = SmaSlope_InvertLogic ? -direction : direction;
				
				    bool pass = false;
				    double absSlope = Math.Abs(slope);
				
				    if (targetDir == 1)
				    {
				        // Compra (ou Venda invertida): média deve estar inclinada de forma positiva
				        if (slope > 0)
				        {
				            pass = true;
				            if (SmaSlope_Min > 0 && slope < SmaSlope_Min) pass = false;
				            if (SmaSlope_Max > 0 && SmaSlope_Max >= SmaSlope_Min && slope > SmaSlope_Max) pass = false;
				        }
				    }
				    else if (targetDir == -1)
				    {
				        // Venda (ou Compra invertida): média deve estar inclinada de forma negativa
				        if (slope < 0)
				        {
				            pass = true;
				            if (SmaSlope_Min > 0 && absSlope < SmaSlope_Min) pass = false;
				            if (SmaSlope_Max > 0 && SmaSlope_Max >= SmaSlope_Min && absSlope > SmaSlope_Max) pass = false;
				        }
				    }
				
				    if (DebugMode)
				        DebugPrint($"[SMA SLOPE] Dir={direction} | Invert={SmaSlope_InvertLogic} | TargetDir={targetDir} | Slope={slope:F4} | Range=[{SmaSlope_Min},{SmaSlope_Max}] | Pass={pass}");
				
				    return pass;
				}
				
				private void DrawHLCALevels()
				{
				    if (HL_FilterType != HL_ModeType.HLCA || !HL_Active1) return;
				    
				    RemoveDrawObject("HLCA_High");
				    RemoveDrawObject("HLCA_Low");
				    RemoveDrawObject("HLCA_Close");
				    RemoveDrawObject("HLCA_Avg");
				    
				    Draw.Line(this, "HLCA_High", false, 0, hlcaHigh, -50, hlcaHigh, Brushes.Red, DashStyleHelper.Solid, 2);
				    Draw.Line(this, "HLCA_Low", false, 0, hlcaLow, -50, hlcaLow, Brushes.Green, DashStyleHelper.Solid, 2);
				    Draw.Line(this, "HLCA_Close", false, 0, hlcaClose, -50, hlcaClose, Brushes.Blue, DashStyleHelper.Dash, 1);
				    Draw.Line(this, "HLCA_Avg", false, 0, hlcaAverage, -50, hlcaAverage, Brushes.Orange, DashStyleHelper.Dot, 1);
				}
				
				#region Sessão HILO
				private void ProcessSessaoHILOCalculation()
				{
				    if (currentEstrategia != estrategiaMode.SessaoHILO) return;
				    if (BarsInProgress != 0 || CurrentBar < 1) return;

			// ⚡ SINCRONIZAÇÃO EM MEMÓRIA RAM DO GAMMA CACHE (1 consulta a cada 10 min, zero impacto no NT8)
			if (Gamma_FiltroAtivo || Stop_OrigemModo == ModoStopLossVMBot.GammaNivel)
			{
				AxionSharedContext.SincronizarGammaSeNecessario(supabaseUrl, supabaseServiceKey, referenceSymbol, DebugPrint);
			}

				    DateTime barTime = Time[0];
				    TimeSpan ct = barTime.TimeOfDay;
				    TimeSpan st = new TimeSpan(SessaoHILO_Start.Hour, SessaoHILO_Start.Minute, SessaoHILO_Start.Second);
				    TimeSpan sp = new TimeSpan(SessaoHILO_End.Hour, SessaoHILO_End.Minute, SessaoHILO_End.Second);

				    // Durante o horário da sessão de cálculo, acumula High e Low
				    if (ct >= st && ct <= sp)
				    {
				        if (High[0] > _sessaoHiloTempHigh) _sessaoHiloTempHigh = High[0];
				        if (Low[0] < _sessaoHiloTempLow) _sessaoHiloTempLow = Low[0];
				    }

				    // Se atingiu ou ultrapassou o horário final e ainda não consolidou
				    if (ct >= sp && !_sessaoHiloCalculada)
				    {
				        if (_sessaoHiloTempHigh > double.MinValue && _sessaoHiloTempLow < double.MaxValue)
				        {
				            _sessaoHiloHigh = _sessaoHiloTempHigh;
				            _sessaoHiloLow  = _sessaoHiloTempLow;
				            _sessaoHiloCalculada = true;

				            double rangeTicks = (_sessaoHiloHigh - _sessaoHiloLow) / TickSize;
				            bool minOk = (SessaoHILO_RangeMinTicks <= 0 || rangeTicks >= SessaoHILO_RangeMinTicks);
				            bool maxOk = (SessaoHILO_RangeMaxTicks <= 0 || rangeTicks <= SessaoHILO_RangeMaxTicks);
				            _sessaoHiloRangeValido = (minOk && maxOk);

				            DebugPrint($"[SESSÃO HILO] 📊 Cálculo consolidado! Máxima: {_sessaoHiloHigh} | Mínima: {_sessaoHiloLow} | Range: {rangeTicks:F0} ticks | Range Válido: {_sessaoHiloRangeValido}");

				            if (SessaoHILO_DrawLevels)
				            {
				                DrawSessaoHILONiveis();
				            }
				        }
				    }
				}

				private void DrawSessaoHILONiveis()
				{
				    if (!_sessaoHiloCalculada || _sessaoHiloHigh <= 0 || _sessaoHiloLow <= 0) return;
				    RemoveDrawObject("SessaoHILO_High");
				    RemoveDrawObject("SessaoHILO_Low");
				    Draw.Line(this, "SessaoHILO_High", false, 0, _sessaoHiloHigh, -30, _sessaoHiloHigh, Brushes.Crimson, DashStyleHelper.Solid, 2);
				    Draw.Line(this, "SessaoHILO_Low", false, 0, _sessaoHiloLow, -30, _sessaoHiloLow, Brushes.SeaGreen, DashStyleHelper.Solid, 2);
				}

				private bool CheckSessaoHiloCondition(int direction)
				{
				    if (!_sessaoHiloCalculada || !_sessaoHiloRangeValido)
				        return false;

				    TimeSpan ctNow = Time[0].TimeOfDay;
				    TimeSpan sp = new TimeSpan(SessaoHILO_End.Hour, SessaoHILO_End.Minute, SessaoHILO_End.Second);
				    if (ctNow < sp)
				        return false;

				    double tol = SessaoHILO_ToleranciaTicks * TickSize;

				    if (direction == 1) // COMPRA na MÍNIMA
				    {
				        bool testouMinima = (Low[0] <= _sessaoHiloLow + tol) || (Low[1] <= _sessaoHiloLow + tol);
				        if (!testouMinima) return false;

				        if (SessaoHILO_Gatilho == SessaoHiloGatilhoMode.Toque)
				            return true;
				        else if (SessaoHILO_Gatilho == SessaoHiloGatilhoMode.ToqueConfirmacaoCandle)
				            return (Close[1] > Open[1]) || (Close[0] > Open[0]);
				        else if (SessaoHILO_Gatilho == SessaoHiloGatilhoMode.FiltrosTecnicos)
				            return true;
				    }
				    else if (direction == -1) // VENDA na MÁXIMA
				    {
				        bool testouMaxima = (High[0] >= _sessaoHiloHigh - tol) || (High[1] >= _sessaoHiloHigh - tol);
				        if (!testouMaxima) return false;

				        if (SessaoHILO_Gatilho == SessaoHiloGatilhoMode.Toque)
				            return true;
				        else if (SessaoHILO_Gatilho == SessaoHiloGatilhoMode.ToqueConfirmacaoCandle)
				            return (Close[1] < Open[1]) || (Close[0] < Open[0]);
				        else if (SessaoHILO_Gatilho == SessaoHiloGatilhoMode.FiltrosTecnicos)
				            return true;
				    }

				    return false;
				}
				#endregion
			
				private double CalcHLCAStopLoss(int direction, double entryPrice)
				{
				    if (!HLCA_StopActive) return 0;
				    
				    double stopPrice = 0;
				    double hlcaLevel = 0;
				    
				    if (direction == 1)
				    {
				        hlcaLevel = hlcaSupport > 0 ? hlcaSupport : Support1;
				        if (hlcaLevel <= 0) return 0;
				        
				        stopPrice = hlcaLevel - (HLCA_StopDistance * TickSize);
				        
				        int stopTicks = (int)((entryPrice - stopPrice) / TickSize);
				        
				        if (stopTicks < HLCA_StopMinTicks)
				        {
				            stopPrice = entryPrice - (HLCA_StopMinTicks * TickSize);
				            DebugPrint($"[HLCA STOP] COMPRA: Ajustado para mínimo {HLCA_StopMinTicks} ticks");
				        }
				        
				        DebugPrint($"[HLCA STOP] COMPRA: Suporte={hlcaLevel:F2} | Stop={stopPrice:F2} | Ticks={stopTicks}");
				    }
				    else
				    {
				        hlcaLevel = hlcaResistance > 0 ? hlcaResistance : Resistance1;
				        if (hlcaLevel <= 0) return 0;
				        
				        stopPrice = hlcaLevel + (HLCA_StopDistance * TickSize);
				        
				        int stopTicks = (int)((stopPrice - entryPrice) / TickSize);
				        
				        if (stopTicks < HLCA_StopMinTicks)
				        {
				            stopPrice = entryPrice + (HLCA_StopMinTicks * TickSize);
				            DebugPrint($"[HLCA STOP] VENDA: Ajustado para mínimo {HLCA_StopMinTicks} ticks");
				        }
				        
				        DebugPrint($"[HLCA STOP] VENDA: Resistência={hlcaLevel:F2} | Stop={stopPrice:F2} | Ticks={stopTicks}");
				    }
				    
				    hlcaStopPrice = stopPrice;
				    return stopPrice;
				}
				
				private double CalcGridDynamicSpacing(int direction, double entryPrice)
				{
				    if (!Grid_DynamicHLCA) return Grid_Spacing * TickSize;
				    
				    double hlcaLevel = 0;
				    double distance = 0;
				    
				    if (direction == 1)
				    {
				        hlcaLevel = hlcaSupport > 0 ? hlcaSupport : Support1;
				        if (hlcaLevel <= 0) return Grid_Spacing * TickSize;
				        
				        distance = entryPrice - hlcaLevel;
				    }
				    else
				    {
				        hlcaLevel = hlcaResistance > 0 ? hlcaResistance : Resistance1;
				        if (hlcaLevel <= 0) return Grid_Spacing * TickSize;
				        
				        distance = hlcaLevel - entryPrice;
				    }
				    
				    if (distance <= 0) return Grid_Spacing * TickSize;
				    
				    double dynamicSpacing = distance / Grid_OrderCount;
				    int dynamicSpacingTicks = (int)(dynamicSpacing / TickSize);
				    
				    if (dynamicSpacingTicks < Grid_Spacing)
				    {
				        gridDynamicSpacing = Grid_Spacing * TickSize;
				        DebugPrint($"[GRID DINÂMICO] Espaçamento calculado ({dynamicSpacingTicks} ticks) < mínimo ({Grid_Spacing}). Usando mínimo.");
				    }
				    else
				    {
				        gridDynamicSpacing = dynamicSpacing;
				        DebugPrint($"[GRID DINÂMICO] Nível HLCA={hlcaLevel:F2} | Distância={distance:F2} | Ordens={Grid_OrderCount} | Espaçamento={dynamicSpacingTicks} ticks");
				    }
				    
				    return gridDynamicSpacing;
				}
				
				private void PlaceGrid(int direction)
				{
				    if (SendSignalsToIndicator)
				    {
				        double p = Close[0];
				        VmSignalBridge.SendSignal(Instrument.FullName, direction, p, Guid.NewGuid().ToString(), SL_Ticks, TP_Ticks);
				        Print($"[VMBOT BRIDGE] 🚀 Grid {(direction == 1 ? "COMPRA" : "VENDA")} simulado e sinal enviado para o indicador @ {p}");
				        IncrementarQuantOperacoes();
				        return;
				    }
				    gridGeneration++;
				    bool usingStop = (OrderMode == orderMode.PendenteStop);
				    double ask = GetCurrentAsk(), bid = GetCurrentBid();
				    string side = direction == 1 ? "BUY" : "SELL";
				    List<Order> gOrders = direction == 1 ? gridOrdersBuy : gridOrdersSell;
				    gOrders.Clear();
				    
				    if (direction == 1) gridFirstOrderBuy  = null;
				    else               gridFirstOrderSell = null;
				    
				    double currentSpacing = Grid_DynamicHLCA ? CalcGridDynamicSpacing(direction, direction == 1 ? bid : ask) : (Grid_Spacing * TickSize);
				    
				    DebugPrint($"[GRID] {side} | Espaçamento: {currentSpacing/TickSize:F0} ticks | Tipo: {(Grid_DynamicHLCA ? "Dinâmico" : "Fixo")}");
				    
				    int ordensColocadas = 0;
				    if (Grid_OrderCount <= 0) return;
					double[] _spacingOffset = new double[Grid_OrderCount];
				    
				    for (int k = 1; k < Grid_OrderCount; k++)
				        _spacingOffset[k] = _spacingOffset[k-1] + (currentSpacing/TickSize) * Math.Pow(Grid_SpacingMultiplier, k-1);
				    
				    for (int i = 0; i < Grid_OrderCount; i++)
				    {
				        int lots = (int)Math.Max(1, Math.Round(LOTE_Size * Math.Pow(Grid_LotMultiplier, i)));
				        string sig = $"G{(direction == 1 ? "B" : "S")}{gridGeneration}_{i}";
				        Order o = null;
				        
				        try
				        {
				            if (direction == 1)
				            {
				                if (usingStop)
				                {
				                    double price = Math.Round((ask + (distancePrice + _spacingOffset[i]) * TickSize) / TickSize) * TickSize;
				                    if (price <= ask) price = ask + TickSize;
				                    DebugPrint($"[GRID] {side} Stop n° {i}: price={price:F2}, ask={ask:F2}");
				                    o = EnterLongStopMarket(0, true, lots, price, sig);
				                }
				                else
				                {
				                    double price = Math.Round((bid - (distancePrice + _spacingOffset[i]) * TickSize) / TickSize) * TickSize;
				                    if (price >= bid) price = bid - TickSize;
				                    if (price <= 0) { DebugPrint($"[GRID] ⚠ {side} Limit n° {i} preço inválido ({price:F2}). Ignorado."); continue; }
				                    DebugPrint($"[GRID] {side} Limit n° {i}: price={price:F2}, bid={bid:F2}");
				                    o = EnterLongLimit(0, true, lots, price, sig);
				                }
				            }
				            else
				            {
				                if (usingStop)
				                {
				                    double price = Math.Round((bid - (distancePrice + _spacingOffset[i]) * TickSize) / TickSize) * TickSize;
				                    if (price <= bid) price = bid - TickSize;
				                    if (price <= 0) { DebugPrint($"[GRID] ⚠ {side} Stop n° {i} preço inválido ({price:F2}). Ignorado."); continue; }
				                    DebugPrint($"[GRID] {side} Stop n° {i}: price={price:F2}, bid={bid:F2}");
				                    o = EnterShortStopMarket(0, true, lots, price, sig);
				                }
				                else
				                {
				                    double price = Math.Round((ask + (distancePrice + _spacingOffset[i]) * TickSize) / TickSize) * TickSize;
				                    if (price <= ask) price = ask + TickSize;
				                    DebugPrint($"[GRID] {side} Limit n° {i}: price={price:F2}, ask={ask:F2}");
				                    o = EnterShortLimit(0, true, lots, price, sig);
				                }
				            }
				        }
				        catch (Exception ex)
				        {
				            DebugPrint($"[GRID] ⚠ Erro ao colocar ordem n° {i}: {ex.Message}");
				            continue;
				        }
				        
				        if (o != null)
				        {
				            gOrders.Add(o);
				            realtimeOrderIds.Add(o.Id);
				            ordensColocadas++;
				            
				            if (i == 0)
				            {
				                if (direction == 1) gridFirstOrderBuy  = o;
				                else               gridFirstOrderSell = o;
				            }
				        }
				    }
				    
				    if (ordensColocadas > 0)
				    {
				        if (direction == 1) { gridCreatedBarBuy = CurrentBar; gridArmedBuy = true; gridHasOpenPosBuy = false; gridNeedsRearmBuy = false; }
				        else               { gridCreatedBarSell = CurrentBar; gridArmedSell = true; gridHasOpenPosSell = false; gridNeedsRearmSell = false; }
				        
				        if (HLCA_StopActive)
				        {
				            double hlcaStop = CalcHLCAStopLoss(direction, direction == 1 ? GetCurrentBid() : GetCurrentAsk());
				            if (hlcaStop > 0)
				            {
				                try
				                {
				                    SetStopLossSafe("", CalculationMode.Price, hlcaStop, false);
				                    DebugPrint($"[GRID] Stop Loss HLCA aplicado: {hlcaStop:F2}");
				                }
				                catch (Exception ex)
				                {
				                    DebugPrint($"[GRID] Erro ao aplicar stop HLCA: {ex.Message}");
				                    if (SL_Ticks > 0) SetStopLoss("", CalculationMode.Ticks, SL_Ticks, false);
				                }
				            }
				            else if (SL_Ticks > 0)
				            {
				                SetStopLoss("", CalculationMode.Ticks, SL_Ticks, false);
				            }
				        }
				        else
				        {
				            if (SL_Ticks > 0) SetStopLoss("", CalculationMode.Ticks, SL_Ticks, false);
				        }
				        
				        if (TP_Ticks > 0) SetProfitTarget("", CalculationMode.Ticks, TP_Ticks, false);
				        DebugPrint($"[GRID] Gen {gridGeneration} | {side} | {ordensColocadas} ordens | Tipo: {OrderMode}");
				    }
				    else
				    {
				        DebugPrint($"[GRID] ⚠ Gen {gridGeneration} | {side} | NENHUMA ordem colocada. Grid Não armado.");
				    }
				}
				
				#region OrderBlock (Filtro Global) - CORRIGIDO E BLINDADO (COMPRA E VENDA)
				private bool OrderBlock1(int direction, int startBar)
				{
				    if (!OB_Active) return true;
				    if (!OB_BREAKOUT1 && !OB_PULLBACK1) return false;
				
				    // 1. Identificar a Máxima e Mínima do período configurado
				    double blockHigh = double.MinValue;
				    double blockLow = double.MaxValue;
				    int barsToAnalyze = Math.Min(OB_CandleHistory1, CurrentBar - 1);
				    
				    if (barsToAnalyze < 1) return false; 
				
				    for (int i = 1; i <= barsToAnalyze; i++)
				    {
				        if (High[i] > blockHigh) blockHigh = High[i];
				        if (Low[i] < blockLow) blockLow = Low[i];
				    }
				
				    double blockRange = blockHigh - blockLow;
				    double blockRangeTicks = blockRange / TickSize;
				
				    // 2. Validar se o tamanho do range está dentro dos limites (em ticks)
				    if (blockRange < OB_Range_MinSize1 * TickSize || blockRange > OB_Range_MaxSize1 * TickSize)
				    {
				        if (DebugMode)
				            DebugPrint($"[OrderBlock] ❌ Range do bloco ({blockRangeTicks:F0} ticks) está FORA dos limites ({OB_Range_MinSize1} a {OB_Range_MaxSize1} ticks).");
				        return false;
				    }
				
				    // 3. Definir o preço de avaliação do candle de rompimento (Close[0] é confiável no backtest e live)
				    double triggerClose = Close[0];
				    double triggerOpen = Open[0];
				    bool isBullishCandle = triggerClose > triggerOpen;
				    bool isBearishCandle = triggerClose < triggerOpen;
				
				    double minDistance = blockRange * (OB_Limit_Min1 / 100.0);
				    double maxDistance = blockRange * (OB_Limit_Max1 / 100.0);
				    
				    double minDistTicks = minDistance / TickSize;
				    double maxDistTicks = maxDistance / TickSize;
				    double triggerCloseTicks = triggerClose / TickSize;
				    double blockHighTicks = blockHigh / TickSize;
				    double blockLowTicks = blockLow / TickSize;
				
				    bool result = false;
				
				    // 4. Lógica de Gatilho
				    if (direction == 1) // COMPRA
				    {
				        if (OB_BREAKOUT1)
				        {
				            // ✅ EXIGE: Candle Comprador + Rompimento dentro da faixa percentual
				            bool breakoutBuy = isBullishCandle && 
				                               triggerClose >= (blockHigh + minDistance) && 
				                               triggerClose <= (blockHigh + maxDistance);
				
				            if (breakoutBuy)
				            {
				                if (DebugMode) 
				                    DebugPrint($"[OrderBlock] ✅ COMPRA BREAKOUT: Candle comprador confirmado. Fechamento ({triggerCloseTicks:F0}tk) >= Máxima ({blockHighTicks:F0}tk) + faixa de [{minDistTicks:F0} a {maxDistTicks:F0}]tk.");
				                result = true;
				            }
				            else if (DebugMode && isBullishCandle)
				            {
				                DebugPrint($"[OrderBlock] ⚠️ COMPRA: Candle é comprador, mas o fechamento ({triggerCloseTicks:F0}tk) está FORA da faixa de rompimento permitida [{blockHighTicks + minDistTicks:F0} a {blockHighTicks + maxDistTicks:F0}]tk.");
				            }
				            else if (DebugMode)
				            {
				                DebugPrint($"[OrderBlock] ⚠️ COMPRA: Candle NÃO é comprador (Abertura: {triggerOpen/TickSize:F0}tk, Fechamento: {triggerCloseTicks:F0}tk). Bloqueado.");
				            }
				        }
				
				        if (OB_PULLBACK1 && !result)
				        {
				            double maxPullbackDistance = blockRange * (OB_Limit_Max1 / 100.0);
				            bool pullbackBuy = triggerClose >= blockLow && triggerClose <= (blockLow + maxPullbackDistance);
				            if (pullbackBuy)
				            {
				                if (DebugMode) DebugPrint($"[OrderBlock] ✅ COMPRA PULLBACK: Preço recuou para a zona de suporte do bloco.");
				                result = true;
				            }
				        }
				    }
				    else if (direction == -1) // VENDA
				    {
				        if (OB_BREAKOUT1)
				        {
				            // ✅ EXIGE: Candle Vendedor + Rompimento dentro da faixa percentual
				            bool breakoutSell = isBearishCandle && 
				                                triggerClose <= (blockLow - minDistance) && 
				                                triggerClose >= (blockLow - maxDistance);
				
				            if (breakoutSell)
				            {
				                if (DebugMode) 
				                    DebugPrint($"[OrderBlock] ✅ VENDA BREAKOUT: Candle vendedor confirmado. Fechamento ({triggerCloseTicks:F0}tk) <= Mínima ({blockLowTicks:F0}tk) - faixa de [{minDistTicks:F0} a {maxDistTicks:F0}]tk.");
				                result = true;
				            }
				            else if (DebugMode && isBearishCandle)
				            {
				                DebugPrint($"[OrderBlock] ⚠️ VENDA: Candle é vendedor, mas o fechamento ({triggerCloseTicks:F0}tk) está FORA da faixa de rompimento permitida [{blockLowTicks - maxDistTicks:F0} a {blockLowTicks - minDistTicks:F0}]tk.");
				            }
				            else if (DebugMode)
				            {
				                DebugPrint($"[OrderBlock] ⚠️ VENDA: Candle NÃO é vendedor (Abertura: {triggerOpen/TickSize:F0}tk, Fechamento: {triggerCloseTicks:F0}tk). Bloqueado.");
				            }
				        }
				
				        if (OB_PULLBACK1 && !result)
				        {
				            double maxPullbackDistance = blockRange * (OB_Limit_Max1 / 100.0);
				            bool pullbackSell = triggerClose <= blockHigh && triggerClose >= (blockHigh - maxPullbackDistance);
				            if (pullbackSell)
				            {
				                if (DebugMode) DebugPrint($"[OrderBlock] ✅ VENDA PULLBACK: Preço recuou para a zona de resistência do bloco.");
				                result = true;
				            }
				        }
				    }
				
				    // 5. Desenho no gráfico (para conferência visual do bloco)
				    if (result || DebugMode)
				    {
				        RemoveDrawObject("OrderBlock");
				        Draw.Rectangle(this, "OrderBlock", false,
				            barsToAnalyze, blockLow, 1, blockHigh,
				            Brushes.Red, Brushes.Transparent, 1);
				        
				        Resistance1 = blockHigh;
				        Support1 = blockLow;
				    }
				
				    if (!result && DebugMode)
				    {
				        DebugPrint($"[OrderBlock] ⚠️ Nenhuma condição atendida. Direção: {direction} | Preço Atual: {triggerCloseTicks:F0}tk | Bloco: {blockLowTicks:F0}tk a {blockHighTicks:F0}tk (Range: {blockRangeTicks:F0}tk)");
				    }
				
				    return result;
				}
				#endregion
						
		        #region Botão ManualBox
		        private Button chartButton;
		        protected override void OnRender(ChartControl chartControl, ChartScale chartScale)
		        {
		            base.OnRender(chartControl, chartScale);
		            if (ChartControl == null || ChartControl.ChartPanels == null || ChartControl.ChartPanels.Count == 0) return;
		            var cw = Window.GetWindow(ChartControl) as Chart;
		            if (cw == null) return;
		            if (currentEstrategia == estrategiaMode.ManualBox)
		            { if (chartButton == null) CriarBotao(cw); }
		            else RemoveButton();
		            ApplyWpfPanels(cw);
		        }
		
		        private void CriarBotao(Chart cw)
		        {
		            if (chartButton != null) return;
		            chartButton = new Button { Content = "Manual Box", Width = 80, Height = 30, Margin = new Thickness(10, 210, 0, 0), Background = Brushes.Blue, Foreground = Brushes.White, BorderBrush = Brushes.Black, HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Top };
		            chartButton.Click += OnChartButtonClick;
		            cw.Dispatcher.Invoke(() => { var g = cw.Content as System.Windows.Controls.Grid; if (g != null && !g.Children.Contains(chartButton)) g.Children.Add(chartButton); });
		        }
		
		        private void RemoveButton()
		        {
		            if (chartButton == null) return;
		            var cw = Window.GetWindow(ChartControl) as Chart; if (cw == null) return;
		            cw.Dispatcher.Invoke(() => { var g = cw.Content as System.Windows.Controls.Grid; if (g != null && g.Children.Contains(chartButton)) g.Children.Remove(chartButton); });
		            chartButton.Click -= OnChartButtonClick; chartButton = null;
		        }
		
		        private void OnChartButtonClick(object sender, RoutedEventArgs e)
		        {
		            if (Position.MarketPosition != MarketPosition.Flat || buyStopOrder != null || sellStopOrder != null) { ShowPopup("Ação Não Permitida", "Posição aberta ou pendente ativa."); return; }
		            if (ChartControl == null || Bars == null) return;
		            try
		            {
		                DateTime tf = Bars.GetTime(Bars.Count - 1);
		                double pf = Bars.GetClose(Bars.Count - 1) - (Box_ticks * TickSize / 2);
		                var rect = Draw.Rectangle(this, Box_string, tf.AddMinutes(-60), pf + Box_ticks * TickSize, tf, pf, Brushes.LightBlue);
		                rect.IsLocked = false;
		            }
		            catch (Exception ex) { DebugPrint("Erro ao desenhar: " + ex.Message); }
		        }
		        #endregion
		
		        #region Retângulos / Box
		        private bool VerificarRetanguloComTag(string tag)
		        {
		            foreach (Rectangle r in DrawObjects.Where(o => o is Rectangle && o.Tag == tag))
		            {
		                Resistance0 = Math.Max(r.StartAnchor.Price, r.EndAnchor.Price);
		                Support0    = Math.Min(r.StartAnchor.Price, r.EndAnchor.Price);
		                if (QuantOperacoes == 1) RemoverRetanguloComTag(Box_string);
		                return true;
		            }
		            return false;
		        }
		
		        private bool RemoverRetanguloComTag(string tag)
		        {
		            var lista = DrawObjects.Where(o => o is Rectangle && o.Tag == tag).Cast<Rectangle>().ToList();
		            foreach (var r in lista) RemoveDrawObject(r.Tag);
		            return lista.Count > 0;
		        }
		        #endregion
		
		        #region Painéis — WPF nativo com coordenadas X/Y personalizáveis
				
				private static TextBlock MakeTB(string text, Brush fg, double size = 11)
				{
				    return new TextBlock
				    {
				        Text       = text,
				        Foreground = fg,
				        FontFamily = new System.Windows.Media.FontFamily("Courier New"),
				        FontSize   = size,
				        Margin     = new Thickness(0, 1, 0, 1)
				    };
				}
				
				private static TextBlock MakeSep()
				{
				    return new TextBlock
				    {
				        Text       = "──────────────────────",
				        Foreground = new SolidColorBrush(Color.FromArgb(70, 120, 120, 120)),
				        FontFamily = new System.Windows.Media.FontFamily("Courier New"),
				        FontSize   = 8,
				        Margin     = new Thickness(0, 3, 0, 3)
				    };
				}
				
				private static Border MakePanelBorder(int x, int y)
				{
				    var sp = new StackPanel { Orientation = Orientation.Vertical };
				    return new Border
				    {
				        Background          = new SolidColorBrush(Color.FromArgb(215, 8, 8, 8)),
				        BorderBrush         = new SolidColorBrush(Color.FromArgb(90, 80, 80, 80)),
				        BorderThickness     = new Thickness(1),
				        CornerRadius        = new CornerRadius(4),
				        Padding             = new Thickness(10, 7, 10, 7),
				        HorizontalAlignment = HorizontalAlignment.Left,
				        VerticalAlignment   = VerticalAlignment.Top,
				        Margin              = new Thickness(x, y, 0, 0),
				        MinWidth            = 275,
				        Child               = sp,
				        ClipToBounds        = true
				    };
				}
				
				private void CreateMainPanel(System.Windows.Controls.Grid g)
				{
				    _cachedChartGrid = g;
					_mainBorder = MakePanelBorder(Panel_Main_X, Panel_Main_Y);
				    var sp = (StackPanel)_mainBorder.Child;
				
				    sp.Children.Add(MakeTB("VM BOT V1.8", Brushes.Cyan, 14));
				    sp.Children.Add(MakeTB("vmtrader", new SolidColorBrush(Color.FromRgb(255, 215, 0)), 10));
				    sp.Children.Add(MakeSep());
				
				    _tbAccount = MakeTB("", new SolidColorBrush(Color.FromRgb(255, 210, 60)));
				    sp.Children.Add(_tbAccount);
				    sp.Children.Add(MakeSep());
				
				    _tbClock = MakeTB("", Brushes.White);
				    sp.Children.Add(_tbClock);
				    sp.Children.Add(MakeSep());
				
				    _tbParams = MakeTB("", Brushes.White);
				    sp.Children.Add(_tbParams);
				
				    _tbPerf = MakeTB("", Brushes.Gray, 9);
				    sp.Children.Add(_tbPerf);
				    sp.Children.Add(MakeSep());
				
				    _tbPnL = MakeTB("", Brushes.White);
				    sp.Children.Add(_tbPnL);
				    sp.Children.Add(MakeSep());
				
				    _tbStatus = MakeTB("", Brushes.Cyan);
				    sp.Children.Add(_tbStatus);

				    _sepPlaybook = MakeSep();
				    _sepPlaybook.Visibility = Visibility.Collapsed;
				    sp.Children.Add(_sepPlaybook);

				    _tbPlaybook = MakeTB("", Brushes.Lime, 11);
				    _tbPlaybook.Visibility = Visibility.Collapsed;
				    sp.Children.Add(_tbPlaybook);
				
				    g.Children.Add(_mainBorder);
				}
				
				private void CreateForce2DPanel(System.Windows.Controls.Grid g)
				{
				    _cachedChartGrid = g; 
					_f2dBorder = MakePanelBorder(Panel_F2D_X, Panel_F2D_Y);
				    var sp = (StackPanel)_f2dBorder.Child;
				
				    sp.Children.Add(MakeTB("  ══ FORÇA  2D ══", Brushes.White, 11));
				    sp.Children.Add(MakeSep());
				
				    _tbF2dBuy  = MakeTB("", Brushes.Gray);
				    sp.Children.Add(_tbF2dBuy);
				
				    _tbF2dSell = MakeTB("", Brushes.Gray);
				    sp.Children.Add(_tbF2dSell);
				    sp.Children.Add(MakeSep());
				
				    _tbF2dMode   = MakeTB("", Brushes.Khaki);
				    sp.Children.Add(_tbF2dMode);
				    sp.Children.Add(MakeSep());
				
				    _tbF2dSignal = MakeTB("", Brushes.Gray);
				    sp.Children.Add(_tbF2dSignal);
				
				    g.Children.Add(_f2dBorder);
				}
				
				private System.Windows.Controls.Grid GetChartSpecificGrid()
				{
				    try
				    {
				        if (ChartControl == null) return null;
				        
				        // ✅ Verifica se o ChartControl já está carregado visualmente
				        if (!ChartControl.IsLoaded) return null;
				        
				        DependencyObject obj = ChartControl;
				        for (int i = 0; i < 10; i++)
				        {
				            obj = VisualTreeHelper.GetParent(obj);
				            if (obj == null) return null;
				            if (obj is System.Windows.Controls.Grid g) return g;
				        }
				    }
				    catch (Exception ex) 
				    { 
				        // ✅ Nunca deixa a exceção propagar na inicialização
				        if (DebugMode) Print($"[ERRO] GetChartSpecificGrid: {ex.Message}"); 
				    }
				    return null;
				}
				
				private void ApplyWpfPanels(Chart cw)
				{
				    // ← MUDANÇA: usa grid específico do chart, não da janela
				    System.Windows.Controls.Grid g = GetChartSpecificGrid();
				    if (g == null) return;
				
				    if (_mainBorder == null) CreateMainPanel(g);
				
				    if (_mainBorder != null)
				    {
				        double maxX = Math.Max(0, ChartControl.ActualWidth - _mainBorder.ActualWidth - 10);
				        double maxY = Math.Max(0, ChartControl.ActualHeight - _mainBorder.ActualHeight - 10);
				        double safeX = Math.Min(Panel_Main_X, maxX);
				        double safeY = Math.Min(Panel_Main_Y, maxY);
				
				        _mainBorder.Visibility  = Panel_Main_Show ? Visibility.Visible : Visibility.Collapsed;
				        _mainBorder.Margin      = new Thickness(safeX, safeY, 0, 0);
				        _tbAccount.Text         = _pAccount;
				        _tbClock.Text           = _pClock;
				        _tbParams.Text          = _pParams;
				        _tbPnL.Text             = _pPnL;
				        _tbPnL.Foreground       = _pPnLBrush;
				        _tbStatus.Text          = _pStatus;
				        _tbStatus.Foreground    = _pStatusBrush;

				        if (_tbPlaybook != null && _sepPlaybook != null)
				        {
				            if (currentEstrategia == estrategiaMode.PlaybookNasdaq && !string.IsNullOrWhiteSpace(_pPlaybookText))
				            {
				                _sepPlaybook.Visibility = Visibility.Visible;
				                _tbPlaybook.Visibility  = Visibility.Visible;
				                _tbPlaybook.Text        = _pPlaybookText;
				                _tbPlaybook.Foreground  = _pPlaybookBrush;
				            }
				            else
				            {
				                _sepPlaybook.Visibility = Visibility.Collapsed;
				                _tbPlaybook.Visibility  = Visibility.Collapsed;
				            }
				        }
				    }
				
				    if (_f2dBorder == null && _pF2dVisible) CreateForce2DPanel(g);
				
				    if (_f2dBorder != null)
				    {
				        double maxX = Math.Max(0, ChartControl.ActualWidth - _f2dBorder.ActualWidth - 10);
				        double maxY = Math.Max(0, ChartControl.ActualHeight - _f2dBorder.ActualHeight - 10);
				        double safeX = Math.Min(Panel_F2D_X, maxX);
				        double safeY = Math.Min(Panel_F2D_Y, maxY);
				
				        _f2dBorder.Visibility = (_pF2dVisible && Panel_F2D_Show) ? Visibility.Visible : Visibility.Collapsed;
				
				        if (_pF2dVisible)
				        {
				            _f2dBorder.Margin       = new Thickness(safeX, safeY, 0, 0);
				            _tbF2dBuy.Text          = _pF2dBuy;
				            _tbF2dBuy.Foreground    = _pF2dBuyBrush;
				            _tbF2dSell.Text         = _pF2dSell;
				            _tbF2dSell.Foreground   = _pF2dSellBrush;
				            _tbF2dMode.Text         = _pF2dMode;
				            _tbF2dSignal.Text       = _pF2dSignal;
				            _tbF2dSignal.Foreground = _pF2dSignalBrush;
				        }
				    }
				}
				
				private void RemoveWpfPanels()
				{
				    try
				    {
				        // ✅ CORREÇÃO: usa grid cacheado + fallback para GetChartSpecificGrid
				        System.Windows.Controls.Grid g = _cachedChartGrid ?? GetChartSpecificGrid();
				
				        if (g != null)
				        {
				            if (_mainBorder != null && g.Children.Contains(_mainBorder))
				                g.Children.Remove(_mainBorder);
				
				            if (_f2dBorder != null && g.Children.Contains(_f2dBorder))
				                g.Children.Remove(_f2dBorder);
				        }
				    }
				    catch (Exception ex) { DebugPrint($"[ERRO] RemoveWpfPanels: {ex.Message}"); }
				
				    _mainBorder      = null;
				    _f2dBorder       = null;
				    _tbPlaybook      = null;
				    _sepPlaybook     = null;
				    _cachedChartGrid = null;
				}
				
				// =====================================================================
				// PNL DA CONTA INTEIRA (Nativo por Sessão do NinjaTrader)
				// =====================================================================
				private double GetAccountRealizedPnLSession()
				{
				    try
				    {
				        return Account.Get(AccountItem.RealizedProfitLoss, Currency.UsDollar);
				    }
				    catch (Exception ex)
				    {
				        DebugPrint($"[PnL Conta] Erro: {ex.Message}");
				        return 0.0;
				    }
				}
				
				private DateTime _lastUIUpdate = DateTime.MinValue;
				private const int UI_UPDATE_INTERVAL_MS = 250;
				private void UpdateInfoPanel()
				{
				    if ((DateTime.Now - _lastUIUpdate).TotalMilliseconds < UI_UPDATE_INTERVAL_MS) return;
				
				    // --- PNL DA ESTRATÉGIA (Apenas este robô) ---
				    double livePrice = _currentMarketPrice > 0 ? _currentMarketPrice : (CurrentBar >= 0 ? Close[0] : 0);
				    double _unrealStrategy = (Position.MarketPosition != MarketPosition.Flat)
				        ? Position.GetUnrealizedProfitLoss(PerformanceUnit.Currency, livePrice)
				        : 0;
				
				    // --- PNL DA CONTA INTEIRA ---
				    double _realizedAccount  = GetAccountRealizedPnLSession();
				    double _totalDia         = _realizedAccount;
				    bool   _bloqueado = dailyLimitReached;
				    double _saldoConta = 0;
				    try { _saldoConta = Account.Get(AccountItem.CashValue, Currency.UsDollar); }
				    catch { _saldoConta = 0; }
				
				    _pAccount =
				        $"CONTA: {Account.Name}\n" +
				        $"ESTRATEGIA: {NomeEstrategia}";
				        //$"MODO:        {currentOperatingMode}\n" +
				        //$"ORDENS:      {OrderMode}";
				
				    _pParams =
				        $"Contratos:   {LOTE_Size}\n" +
				        $"Total Ops:   {QuantOperacoes}/{MaxOrderSession}\n" +
				        $"Take Profit: {TP_Ticks} ticks\n" +
				        $"Stop Loss:   {SL_Ticks} ticks\n" +
				        $"Janela 1:    {TIME_Start:HH:mm} - {TIME_Stop:HH:mm}\n" +
				        (Janela2Ativa
				            ? $"Janela 2:    {TIME_Start2:HH:mm} - {TIME_Stop2:HH:mm}\n"
				            : "Janela 2:    Inativa\n") +
				        "Meta Lucro:  " + (DailyProfitActive ? DailyProfitLimit + " USD" : "Inativo") + "\n" +
				        "Meta Perda:  " + (DailyLossActive ? DailyLossLimit + " USD" : "Inativo");
				
				    if (_bloqueado)
				    {
				        _pPnL =
				            $"P&L Conta:   BLOQUEADO\n" +
				            $"P&L Aberto:  {_unrealStrategy:+0.00;-0.00;0.00} USD\n" +
				            $"Saldo Conta: {_saldoConta:0.00;-0.00} USD";
				        if (_totalDia >= 0)
				        {
				            _pPnLBrush    = Brushes.Lime;
				            _pStatus      = "Meta de Lucro Atingida";
				            _pStatusBrush = Brushes.Lime;
				        }
				        else
				        {
				            _pPnLBrush    = Brushes.Red;
				            _pStatus      = "Meta de Perda Atingida";
				            _pStatusBrush = Brushes.Red;
				        }
				    }
				    else
				    {
				        _pPnL =
				            $"P&L Conta:   {_totalDia:+0.00;-0.00;0.00} USD\n" +
				            $"P&L Aberto:  {_unrealStrategy:+0.00;-0.00;0.00} USD\n" +
				            $"Saldo Conta: {_saldoConta:0.00;-0.00} USD";
				        if (_totalDia > 0)       _pPnLBrush = Brushes.Lime;
				        else if (_totalDia < 0)  _pPnLBrush = Brushes.Red;
				        else                     _pPnLBrush = Brushes.White;
				
				        if (!isLiveTrading)
				        {
				            _pStatus      = hasReachedRealtime ? "Aguardando Tempo Real" : "Historico / Backtest";
				            _pStatusBrush = Brushes.Gray;
				        }
				        else
				        {
				            // ==========================================
				            // ✅ CORREÇÃO: Lógica de Status Aprimorada
				            // ==========================================
				            
				            // 1. Calcular janelas manuais
				            TimeSpan _ct = new TimeSpan(Times[0][0].Hour, Times[0][0].Minute, Times[0][0].Second);
				            TimeSpan _st = new TimeSpan(TIME_Start.Hour, TIME_Start.Minute, TIME_Start.Second)
				                + TimeSpan.FromSeconds(Second_Start);
				            TimeSpan _sp  = new TimeSpan(TIME_Stop.Hour,  TIME_Stop.Minute,  TIME_Stop.Second);
				            TimeSpan _st2 = new TimeSpan(TIME_Start2.Hour, TIME_Start2.Minute, TIME_Start2.Second);
				            TimeSpan _sp2 = new TimeSpan(TIME_Stop2.Hour,  TIME_Stop2.Minute,  TIME_Stop2.Second);
				            
				            bool _dentroJ1 = _ct >= _st && _ct < _sp;
				            bool _dentroJ2 = Janela2Ativa && _ct >= _st2 && _ct < _sp2;
				            bool _dentroHorarioManual = _dentroJ1 || _dentroJ2;
				
				            // 2. Verificar filtro de horário (Automático OU Importar)
							bool _filtroAutoOK = true;
							if (TS_Mode == tsMode.Automatico && isLiveTrading)
							{
							    _filtroAutoOK = CheckTimeSlotFilter();
							}
							else if (TS_Mode == tsMode.Importar && _timeSlotCalcDone)
							{
							    _filtroAutoOK = CheckTimeSlotFilter();  // ✅ Importar também verifica!
							}
				
				            
				            // 3. Definir status com prioridade correta
							if (!_dentroHorarioManual)
							{
							    _pStatus      = "Fora do Horario";
							    _pStatusBrush = Brushes.Orange;
							}
							// ✅ CORREÇÃO: Verificar BOTH Automatico E Importar
							else if ((TS_Mode == tsMode.Automatico || TS_Mode == tsMode.Importar) && !_filtroAutoOK)
							{
							    _pStatus      = "Fora do Horario";
							    _pStatusBrush = Brushes.OrangeRed;
							}
				            else if (QuantOperacoes >= MaxOrderSession)
				            {
				                _pStatus      = "Limite de Ordens";
				                _pStatusBrush = Brushes.Orange;
				            }
				            else if (!allowTrading)
				            {
				                _pStatus      = "Aguardando Ativação";
				                _pStatusBrush = Brushes.Yellow;
				            }
				            else if (currentEstrategia == estrategiaMode.SessaoHILO && !_sessaoHiloCalculada)
				            {
				                _pStatus      = "Calc Sessao HILO";
				                _pStatusBrush = Brushes.Yellow;
				            }
				            else if (currentEstrategia == estrategiaMode.SessaoHILO && !_sessaoHiloRangeValido)
				            {
				                _pStatus      = "Range HILO Fora";
				                _pStatusBrush = Brushes.Orange;
				            }
				            else
				            {
				                _pStatus      = "Em Operacao";
				                _pStatusBrush = Brushes.Cyan;
				            }
				        }
				    }
				
				    // Adicional FVG no status
				    if ((FVG_Active && currentEstrategia == estrategiaMode.GridScalper) || currentEstrategia == estrategiaMode.FVGScalper)
				    {
				        bool fvgBuy  = CheckFVGFilterQuiet(1);
				        bool fvgSell = CheckFVGFilterQuiet(-1);
				        string fvgTag;
				        if (fvgBuy && fvgSell) fvgTag = "  ↕";
				        else if (fvgBuy)       fvgTag = "  ↑";
				        else if (fvgSell)      fvgTag = "  ↓";
				        else                   fvgTag = " --";
				        _pStatus += fvgTag;
				    }
				
				    _lastUIUpdate = DateTime.Now;
				
				    // ✅ Atualização UI Thread
				    ChartControl?.Dispatcher.InvokeAsync(() =>
				    {
				        try
				        {
				            // ── Painel Principal ──────────────────────────────────────────
				            if (_tbAccount != null) _tbAccount.Text = _pAccount;
				            if (_tbClock   != null) _tbClock.Text   = _pClock;
				            if (_tbParams  != null) _tbParams.Text  = _pParams;
				            if (_tbPnL != null)
				            {
				                _tbPnL.Text       = _pPnL;
				                _tbPnL.Foreground = _pPnLBrush;
				            }
				            if (_tbStatus != null)
				            {
				                _tbStatus.Text       = _pStatus;
				                _tbStatus.Foreground = _pStatusBrush;
				            }
				
				            // ── Painel Força 2D ───────────────────────────────────────────
				            if (_pF2dVisible && _f2dBorder == null)
				            {
				                var g = GetChartSpecificGrid();
				                if (g != null) CreateForce2DPanel(g);
				            }
				            if (_f2dBorder != null)
				            {
				                _f2dBorder.Visibility = (_pF2dVisible && Panel_F2D_Show)
				                    ? Visibility.Visible
				                    : Visibility.Collapsed;
				                if (_pF2dVisible)
				                {
				                    if (_tbF2dBuy != null)
				                    {
				                        _tbF2dBuy.Text       = _pF2dBuy;
				                        _tbF2dBuy.Foreground = _pF2dBuyBrush;
				                    }
				                    if (_tbF2dSell != null)
				                    {
				                        _tbF2dSell.Text       = _pF2dSell;
				                        _tbF2dSell.Foreground = _pF2dSellBrush;
				                    }
				                    if (_tbF2dMode   != null) _tbF2dMode.Text   = _pF2dMode;
				                    if (_tbF2dSignal != null)
				                    {
				                        _tbF2dSignal.Text       = _pF2dSignal;
				                        _tbF2dSignal.Foreground = _pF2dSignalBrush;
				                    }
				                }
				            }
				        }
				        catch (Exception ex)
				        {
				            if (DebugMode) Print($"[UI SMART] Erro: {ex.Message}");
				        }
				    }, System.Windows.Threading.DispatcherPriority.Render);
				}
	
				private void UpdateInfoPanel0()
				{
				    _pClock = $"Horario Corretor: {Times[0][0]:HH:mm:ss}";
				}
				
				private void UpdateForce2DPanel()
				{
				    if (Force2D_Mode == force2DMode.OFF) { _pF2dVisible = false; return; }
				
				    _pF2dVisible = true;
				    // ← USA O CAMPO DIRETO
				    double upNow = _lastForce2DUp;
				    double dnNow = 100.0 - upNow;
				    bool buyPass = false, sellPass = false;
		
				    if (Force2D_Mode == force2DMode.Limiar)
				    {
				        buyPass  = upNow >= Force2D_MinPercent && upNow <= Force2D_MaxPercent;
				        sellPass = dnNow >= Force2D_MinPercent && dnNow <= Force2D_MaxPercent;
				    }
				    else if (Force2D_Mode == force2DMode.Ambos)
				    {
				        if (CurrentBars[0] >= Force2D_IncrementBars && _force2DUpSeries != null)
				        {
				            double upPast = _force2DUpSeries[Force2D_IncrementBars];
				            double dnPast = 100.0 - upPast;
				            bool buyLimiar = upNow >= Force2D_MinPercent && upNow <= Force2D_MaxPercent;
				            bool sellLimiar = dnNow >= Force2D_MinPercent && dnNow <= Force2D_MaxPercent;
				            bool buyIncr = (upNow - upPast) >= Force2D_IncrementMin;
				            bool sellIncr = (dnNow - dnPast) >= Force2D_IncrementMin;
				            buyPass = buyLimiar && buyIncr;
				            sellPass = sellLimiar && sellIncr;
				        }
				    }
				    else if (CurrentBars[0] >= Force2D_IncrementBars && _force2DUpSeries != null)
				    {
				        double upPast = _force2DUpSeries[Force2D_IncrementBars];
				        double dnPast = 100.0 - upPast;
				        buyPass  = (upNow - upPast) >= Force2D_IncrementMin;
				        sellPass = (dnNow - dnPast) >= Force2D_IncrementMin;
				    }
		
				    _pF2dBuy      = $"  BUY :  {upNow,5:F1}%" + (buyPass  ? "  [OK]" : "      ");
				    _pF2dBuyBrush  = buyPass  ? Brushes.LimeGreen : Brushes.Gray;
				    _pF2dSell      = $"  SELL:  {dnNow,5:F1}%" + (sellPass ? "  [OK]" : "      ");
				    _pF2dSellBrush = sellPass ? Brushes.Red : Brushes.Gray;
		
				    _pF2dMode = Force2D_Mode == force2DMode.Limiar
				        ? $"  Limiar [{Force2D_MinPercent:F0}–{Force2D_MaxPercent:F0}%]"
				        : (Force2D_Mode == force2DMode.Ambos
				            ? $"  Ambos [{Force2D_MinPercent:F0}–{Force2D_MaxPercent:F0}%] + [{Force2D_IncrementMin:F0}pp/{Force2D_IncrementBars}b]"
				            : $"  Incr. {Force2D_IncrementMin:F0}pp / {Force2D_IncrementBars}b");
				
				    if (buyPass && sellPass)
				    {
				        _pF2dSignal = "  BUY + SELL  OK";
				        _pF2dSignalBrush = Brushes.Yellow;
				    }
				    else if (buyPass)
				    {
				        _pF2dSignal = "  BUY  LIBERADO";
				        _pF2dSignalBrush = Brushes.LimeGreen;
				    }
				    else if (sellPass)
				    {
				        _pF2dSignal = "  SELL LIBERADO";
				        _pF2dSignalBrush = Brushes.Red;
				    }
				    else
				    {
				        _pF2dSignal = "  Aguardando...";
				        _pF2dSignalBrush = Brushes.Gray;
				    }
				}
				
				#endregion
				
				#region Keltner Channel — Volatilidade + Gatilho Pullback

				private void UpdateKeltnerState()
				{
				    if (_keltner == null) return;
				    if (CurrentBar < Math.Max(KELTNER_EmaPeriod, KELTNER_AtrPeriod) + KELTNER_Trigger_PullbackLookback + 5)
				        return;
				
				    // Valores instantâneos das bandas
				    _kUpper = _keltner.Upper[0];
				    _kMid   = _keltner.Midline[0];  // ✅ CORRETO: Midline (não Mid)
				    _kLower = _keltner.Lower[0];
				
				    // Reset histórico de rompimentos
				    _kHadUpperBreak = false;
				    _kHadLowerBreak = false;
				
				    // Busca rompimentos na janela de pullback (só no modo Bandas)
				    if (KELTNER_Trigger_Active && KELTNER_Trigger_Mode == KeltnerTriggerMode.Bandas)
				    {
				        double tol = KELTNER_Trigger_Tolerance * TickSize;
				        int lb = Math.Min(KELTNER_Trigger_PullbackLookback, CurrentBar);
				        for (int i = 1; i <= lb; i++)
				        {
				            if (Close[i] > _keltner.Upper[i] + tol) _kHadUpperBreak = true;
				            if (Close[i] < _keltner.Lower[i] - tol) _kHadLowerBreak = true;
				            if (_kHadUpperBreak && _kHadLowerBreak) break;
				        }
				    }
				}
				
				private bool CheckKeltnerVolatility()
				{
				    if (!KELTNER_Vol_Active || _keltner == null) return true;
				    if (CurrentBar < Math.Max(KELTNER_EmaPeriod, KELTNER_AtrPeriod) + 5) return true;
				
				    double widthTicks = (_keltner.Upper[0] - _keltner.Lower[0]) / TickSize;
				
				    if (widthTicks < KELTNER_Vol_Width_Min)
				    {
				        DebugPrint($"[KELT VOL] BLOQUEADO — largura={widthTicks:F0}tk < min={KELTNER_Vol_Width_Min}tk (volatilidade baixa)");
				        return false;
				    }
				
				    if (KELTNER_Vol_Width_Max > 0 && widthTicks > KELTNER_Vol_Width_Max)
				    {
				        DebugPrint($"[KELT VOL] BLOQUEADO — largura={widthTicks:F0}tk > max={KELTNER_Vol_Width_Max}tk (volatilidade excessiva)");
				        return false;
				    }
				
				    return true;
				}
				
				private bool CheckKeltnerTrigger(int direction)
				{
				    if (!KELTNER_Trigger_Active || _keltner == null) return true;
				    if (CurrentBar < Math.Max(KELTNER_EmaPeriod, KELTNER_AtrPeriod) + KELTNER_Trigger_PullbackLookback + 5)
				        return true;
				    
				    double upper = _keltner.Upper[0];
				    double mid   = _keltner.Midline[0];
				    double lower = _keltner.Lower[0];
				    double close = Close[0];
				    double tol   = KELTNER_Trigger_Tolerance * TickSize;
				    bool pass    = false;
				    
				    // ── MODO CENTRAL: Preço vs EMA central ──
				    if (KELTNER_Trigger_Mode == KeltnerTriggerMode.Central)
				    {
				        if (direction == 1)   pass = close > mid + tol;
				        else                  pass = close < mid - tol;
				    }
				    // ── MODO BANDAS ──
				    else
				    {
				        if (!KELTNER_Trigger_Reverse)
				        {
				            // Lógica NORMAL (continuação de tendência)
				            if (direction == 1)   // COMPRA: rompeu Upper para cima
				            {
				                bool breakout = close > upper + tol;
				                if (!breakout) { pass = false; }
				                else if (!KELTNER_Trigger_RequirePullback) { pass = true; }
				                else
				                {
				                    bool isPullback = close <= upper && close > mid;
				                    pass = _kHadUpperBreak && isPullback;
				                }
				            }
				            else // VENDA: rompeu Lower para baixo
				            {
				                bool breakout = close < lower - tol;
				                if (!breakout) { pass = false; }
				                else if (!KELTNER_Trigger_RequirePullback) { pass = true; }
				                else
				                {
				                    bool isPullback = close >= lower && close < mid;
				                    pass = _kHadLowerBreak && isPullback;
				                }
				            }
				        }
				        else
				        {
				            // ✅ Lógica REVERTIDA CORRETA (mean reversion/fakeout)
				            if (direction == 1)   // COMPRA: preço rompeu Lower (oversold) → compra esperando retorno
				            {
				                if (!KELTNER_Trigger_RequirePullback)
				                    pass = close < lower - tol;  // ✅ CORRETO: Compra quando rompe banda inferior
				                else
				                {
				                    // Rompeu Lower e voltou para dentro da banda
				                    bool isRecovery = close >= lower;
				                    pass = _kHadLowerBreak && isRecovery;
				                }
				            }
				            else // VENDA: preço rompeu Upper (overbought) → venda esperando retorno
				            {
				                if (!KELTNER_Trigger_RequirePullback)
				                    pass = close > upper + tol;  // ✅ CORRETO: Venda quando rompe banda superior
				                else
				                {
				                    // Rompeu Upper e voltou para dentro da banda
				                    bool isRecovery = close <= upper;
				                    pass = _kHadUpperBreak && isRecovery;
				                }
				            }
				        }
				    }
				    
				    if (!pass)
				        DebugPrint($"[KELT TRIG] BLOQUEADO dir={direction} | Mode={KELTNER_Trigger_Mode} Rev={KELTNER_Trigger_Reverse} | C={close:F2} U={upper:F2} M={mid:F2} L={lower:F2}");
				    
				    return pass;
				}
				#endregion
				
		        #region MA Cloud Filter
		        private double AutoRangeAVG(int startBar, int barCount, int fp, int sp)
		        {
		            double t = 0; for (int i = 0; i < barCount; i++) t += Math.Abs(SMA(Close, fp)[startBar + i] - SMA(Close, sp)[startBar + i]); return t / barCount;
		        }
		
		        private bool CheckMACLOUDFilter(int cloud, int dir, bool rev, int bs, double mn, double mx, bool autoAvg)
		        {
		            double e = SMA_CLOUD1[bs], s = SMA_CLOUD2[bs];
		            double diff = autoAvg ? AutoRangeAVG(0, bs, MACLOUD1_FastPeriod, MACLOUD1_SlowPeriod) : Math.Abs(e - s);
		            if (autoAvg) { e = SMA_CLOUD1[1]; s = SMA_CLOUD2[1]; }
		            if (!rev) { if (dir == 1) return e > s && diff > mn * TickSize && diff < mx * TickSize; if (dir == -1) return e < s && diff > mn * TickSize && diff < mx * TickSize; }
		            else       { if (dir == 1) return e < s && diff > mn * TickSize && diff < mx * TickSize; if (dir == -1) return e > s && diff > mn * TickSize && diff < mx * TickSize; }
		            return false;
		        }
		        #endregion
		
		        #region Filtros Explosion e PVA
		        private double CalcMacd(int bar)
		        {
		            double fMA = EXPLOSION_FastSmooth ? EMA(EMA(EXPLOSION_FastPeriod), EXPLOSION_FastSmoothLength)[bar] : EMA(EXPLOSION_FastPeriod)[bar];
		            double sMA = EXPLOSION_SlowSmooth ? EMA(EMA(EXPLOSION_SlowPeriod), EXPLOSION_SlowSmoothLength)[bar] : EMA(EXPLOSION_SlowPeriod)[bar];
		            return fMA - sMA;
		        }
		
		        private double CalcBBUpper(int src, int len, double mult) { return SMA(len)[src] + mult * StdDev(len)[src]; }
		        private double CalcBBLower(int src, int len, double mult) { return SMA(len)[src] - mult * StdDev(len)[src]; }
		
		        public bool FiltroExplosionCompra()
		        {
		            if (CurrentBar < Math.Max(EXPLOSION_ChannelLength, EXPLOSION_SlowPeriod) + 10) return false;
		            double t1 = (CalcMacd(0) - CalcMacd(1)) * EXPLOSION_Sensitivity, el = CalcBBUpper(0, EXPLOSION_ChannelLength, EXPLOSION_Mult) - CalcBBLower(0, EXPLOSION_ChannelLength, EXPLOSION_Mult);
		            return (t1 >= 0 ? t1 : 0) > el;
		        }
		
		        public bool FiltroExplosionVenda()
		        {
		            if (CurrentBar < Math.Max(EXPLOSION_ChannelLength, EXPLOSION_SlowPeriod) + 10) return false;
		            double t1 = (CalcMacd(0) - CalcMacd(1)) * EXPLOSION_Sensitivity, el = CalcBBUpper(0, EXPLOSION_ChannelLength, EXPLOSION_Mult) - CalcBBLower(0, EXPLOSION_ChannelLength, EXPLOSION_Mult);
		            return (t1 < 0 ? -t1 : 0) > el;
		        }
		
		        public bool FiltroPVAClimax(int dir)
		        {
		            if (CurrentBar < PVA_SumBars + 5) return false;
		            if (dir == 1 && Close[0] <= Open[0]) return false; if (dir == -1 && Close[0] >= Open[0]) return false;
		            double vrC = Volume[0] * (High[0] - Low[0]), avgV = 0, hVR = 0; int lb = Math.Min(PVA_SumBars, CurrentBar);
		            for (int i = 1; i <= lb; i++) { avgV += Volume[i]; double vr = Volume[i] * (High[i] - Low[i]); if (vr > hVR) hVR = vr; }
		            avgV /= PVA_SumBars; return vrC >= hVR || Volume[0] >= avgV * PVA_Percent / 100.0;
		        }
		        #endregion
		
		        // =====================================================================
				// FORÇA 2D – CÁLCULO E FILTRO (OTIMIZADO COM CACHE)
				// =====================================================================
				#region Força 2D – Cálculo de Pivots Multi-Timeframe
				
				// ✅ VARIÁVEIS DE CACHE ADICIONADAS (adicione no topo da classe, junto com as outras)
				private double _cachedForce2D = 50.0;
				private int _lastCalcBarH4 = -1;
				private int _lastCalcBarD1 = -1;
				private int _lastCalcBarM30 = -1;
				private int _lastCalcBarM5 = -1;
				
				// ✅ VERSÃO OTIMIZADA: Só recalcula quando uma nova barra fecha em algum timeframe
				private double CalcForce2D_UpPercent()
				{
				    if (_force2DSeriesStart < 0)
				    {
				        if (DebugMode) Print("[F2D] RETURN 50 — _force2DSeriesStart < 0");
				        return 50.0;
				    }
				
				    int h4Idx  = _force2DSeriesStart;
				    int d1Idx  = _force2DSeriesStart + 1;
				    int m30Idx = _force2DSeriesStart + 2;
				    int m5Idx  = _force2DSeriesStart + 3;
				
				    if (BarsArray.Length <= m5Idx)
				    {
				        if (DebugMode) Print($"[F2D] RETURN 50 — BarsArray.Length={BarsArray.Length} <= m5Idx={m5Idx}");
				        return 50.0;
				    }
				
				    // ✅ OTIMIZAÇÃO: Verifica se algum timeframe secundário teve nova barra
				    bool h4NewBar = CurrentBars[h4Idx] != _lastCalcBarH4;
				    bool d1NewBar = CurrentBars[d1Idx] != _lastCalcBarD1;
				    bool m30NewBar = CurrentBars[m30Idx] != _lastCalcBarM30;
				    bool m5NewBar = CurrentBars[m5Idx] != _lastCalcBarM5;
				
				    // Se nenhuma barra nova fechou em nenhum timeframe, retorna cache imediatamente
				    if (!h4NewBar && !d1NewBar && !m30NewBar && !m5NewBar)
				    {
				        return _cachedForce2D;
				    }
				
				    // Atualiza flags de cache
				    _lastCalcBarH4 = CurrentBars[h4Idx];
				    _lastCalcBarD1 = CurrentBars[d1Idx];
				    _lastCalcBarM30 = CurrentBars[m30Idx];
				    _lastCalcBarM5 = CurrentBars[m5Idx];
				
				    if (CurrentBars[h4Idx]  < 2 || CurrentBars[d1Idx]  < 2 ||
				        CurrentBars[m30Idx] < 2 || CurrentBars[m5Idx]  < 2)
				    {
				        if (DebugMode) Print("[F2D] RETURN 50 — CurrentBars insuficiente em alguma série");
				        return 50.0;
				    }
				
				    double price = (Force2D_BacktestMode || !isLiveTrading) ? Close[0] : (_currentMarketPrice > 0 ? _currentMarketPrice : Close[0]);
				    
				    double upCount = 0.0;
				    double dnCount = 0.0;
				
				    // ✅ OTIMIZAÇÃO: Usa variáveis locais para evitar lookups repetidos de array
				    int h4Count = Math.Min(24, CurrentBars[h4Idx]);
				    for (int i = 0; i < h4Count; i++)
				    {
				        double h = Highs[h4Idx][i], l = Lows[h4Idx][i], c = Closes[h4Idx][i];
				        if (h == 0 || l == 0 || c == 0) continue;
				        double piv = (h + l + c) * 0.3333333333333333;  // ← mais rápido que / 3.0
				        double sr1 = 2.0 * piv - h;
				        double sr2 = 2.0 * piv - l;
				        
				        if (piv < price) upCount++; else if (piv > price) dnCount++;
				        if (sr1 < price) upCount++; else if (sr1 > price) dnCount++;
				        if (sr2 < price) upCount++; else if (sr2 > price) dnCount++;
				    }
				
				    int d1Count = Math.Min(3, CurrentBars[d1Idx]);
				    for (int i = 0; i < d1Count; i++)
				    {
				        double h = Highs[d1Idx][i], l = Lows[d1Idx][i], c = Closes[d1Idx][i];
				        if (h == 0 || l == 0 || c == 0) continue;
				        double piv = (h + l + c) * 0.3333333333333333;
				        double sr1 = 2.0 * piv - h;
				        double sr2 = 2.0 * piv - l;
				        
				        if (piv < price) upCount++; else if (piv > price) dnCount++;
				        if (sr1 < price) upCount++; else if (sr1 > price) dnCount++;
				        if (sr2 < price) upCount++; else if (sr2 > price) dnCount++;
				    }
				
				    int m30Count = Math.Min(12, CurrentBars[m30Idx]);
				    for (int i = 0; i < m30Count; i++)
				    {
				        double h = Highs[m30Idx][i], l = Lows[m30Idx][i], c = Closes[m30Idx][i];
				        if (h == 0 || l == 0 || c == 0) continue;
				        double piv = (h + l + c) * 0.3333333333333333;
				        double sr1 = 2.0 * piv - h;
				        double sr2 = 2.0 * piv - l;
				        
				        if (piv < price) upCount++; else if (piv > price) dnCount++;
				        if (sr1 < price) upCount++; else if (sr1 > price) dnCount++;
				        if (sr2 < price) upCount++; else if (sr2 > price) dnCount++;
				    }
				
				    int m5Count = Math.Min(24, CurrentBars[m5Idx]);
				    for (int i = 0; i < m5Count; i++)
				    {
				        double h = Highs[m5Idx][i], l = Lows[m5Idx][i], c = Closes[m5Idx][i];
				        if (h == 0 || l == 0 || c == 0) continue;
				        double piv = (h + l + c) * 0.3333333333333333;
				        double sr1 = 2.0 * piv - h;
				        double sr2 = 2.0 * piv - l;
				        
				        if (piv < price) upCount++; else if (piv > price) dnCount++;
				        if (sr1 < price) upCount++; else if (sr1 > price) dnCount++;
				        if (sr2 < price) upCount++; else if (sr2 > price) dnCount++;
				    }
				
				    double total = upCount + dnCount;
				    _cachedForce2D = total > 0 ? (upCount / total) * 100.0 : 50.0;
				    
				    return _cachedForce2D;
				}
				
				// ✅ VERSÃO OTIMIZADA: Usa o campo _lastForce2DUp diretamente (já calculado no OnBarUpdate)
				private bool CheckForce2DFilter(int direction)
				{
				    if (Force2D_Mode == force2DMode.OFF) return true;
				    if (_force2DSeriesStart < 0 || _force2DUpSeries == null) return true;
				
				    // ✅ OTIMIZAÇÃO: Usa campo direto, evita acesso a Series[0] que é mais lento
				    double upNow    = _lastForce2DUp;
				    double dnNow    = 100.0 - upNow;
				    double forceNow = direction == 1 ? upNow : dnNow;
				    
				    if (Force2D_Mode == force2DMode.Limiar)
				    {
				        bool pass = forceNow >= Force2D_MinPercent && forceNow <= Force2D_MaxPercent;
				        if (DebugMode)
				            DebugPrint($"[FORÇA 2D | Limiar] dir={direction} up={upNow:F1}% dn={dnNow:F1}% forceDir={forceNow:F1}% faixa=[{Force2D_MinPercent:F0}%,{Force2D_MaxPercent:F0}%] pass={pass}");
				        return pass;
				    }
				    
				    if (CurrentBars[0] < Force2D_IncrementBars) return false;
				    double upPast    = _force2DUpSeries[Force2D_IncrementBars];
				    double forcePast = direction == 1 ? upPast : (100.0 - upPast);
				    double increment = forceNow - forcePast;
				    bool passInc = increment >= Force2D_IncrementMin;
				    
				    if (DebugMode)
				        DebugPrint($"[FORÇA 2D | Incremento] dir={direction} agora={forceNow:F1}% há {Force2D_IncrementBars} barras={forcePast:F1}% incremento={increment:F1}% (min={Force2D_IncrementMin:F0}%) pass={passInc}");
				    
				    if (Force2D_Mode == force2DMode.Ambos)
				    {
				        bool passLimiar = forceNow >= Force2D_MinPercent && forceNow <= Force2D_MaxPercent;
				        bool passAmbos = passLimiar && passInc;
				        if (DebugMode)
				            DebugPrint($"[FORÇA 2D | Ambos] dir={direction} limiar={passLimiar} incremento={passInc} pass={passAmbos}");
				        return passAmbos;
				    }
				    
				    return passInc;
				}
				#endregion
						
		        #region Utilitários
				
				// =====================================================================
				// ✅ WRAPPER SEGURO PARA SETSTOPLOSS - VALIDAÇÃO DINÂMICA POR ATIVO
				// =====================================================================
				private bool SetStopLossSafe(string fromSignal, CalculationMode mode, double value, bool fromEntry)
				{
				    try
				    {
				        // ✅ Validação 1: Modo Ticks é sempre seguro (usa TickSize do ativo)
				        if (mode == CalculationMode.Ticks)
				        {
				            if (value <= 0)
				            {
				                DebugPrint($"[STOP SAFE] ❌ Ticks inválidos: {value}");
				                return false;
				            }
				            
				            // ✅ Validação: Mínimo de ticks baseado no ativo
				            int minTicks = GetMinStopTicksForInstrument();
				            if (value < minTicks)
				            {
				                DebugPrint($"[STOP SAFE] ⚠️ Ticks abaixo do mínimo ({value} < {minTicks}). Ajustando...");
				                value = minTicks;
				            }
				            
				            SetStopLoss(fromSignal, mode, value, fromEntry);
				            DebugPrint($"[STOP SAFE] ✅ Stop em Ticks aplicado: {value} ticks");
				            return true;
				        }
				        
				        // ✅ Validação 2: Modo Price precisa de verificações rigorosas
				        if (mode == CalculationMode.Price)
				        {
				            if (value <= 0)
				            {
				                DebugPrint($"[STOP SAFE] ❌ Preço zero ou negativo: {value}");
				                return false;
				            }
				            
				            // ✅ Alinhar com TickSize do ativo (CRÍTICO)
				            double alignedPrice = Math.Round(value / TickSize) * TickSize;
				            
				            // Obter preço atual (com fallback para Close[0] em backtest/Strategy Analyzer histórico)
				            double currentPrice = Position.MarketPosition == MarketPosition.Long ? GetCurrentBid() : GetCurrentAsk();
				            if (currentPrice <= 0 && CurrentBar >= 0) currentPrice = Close[0];
				            
				            // ✅ Calcular distância mínima DINÂMICA baseada no ativo
				            double minDistance = GetMinStopDistanceForInstrument();
				            
				            if (Position.MarketPosition == MarketPosition.Long)
				            {
				                // Stop deve estar ABAIXO do preço atual
				                if (alignedPrice >= currentPrice - minDistance)
				                {
				                    DebugPrint($"[STOP SAFE] ⚠️ Stop Long muito próximo | Atual: {currentPrice:F4} | Stop: {alignedPrice:F4} | Mínimo: {minDistance:F4}");
				                    // ✅ AJUSTE AUTOMÁTICO: Coloca no nível aceitável mais próximo
				                    alignedPrice = currentPrice - minDistance;
				                    alignedPrice = Math.Round(alignedPrice / TickSize) * TickSize;
				                    DebugPrint($"[STOP SAFE] 🔧 Stop ajustado para: {alignedPrice:F4}");
				                }
				            }
				            else if (Position.MarketPosition == MarketPosition.Short)
				            {
				                // Stop deve estar ACIMA do preço atual
				                if (alignedPrice <= currentPrice + minDistance)
				                {
				                    DebugPrint($"[STOP SAFE] ⚠️ Stop Short muito próximo | Atual: {currentPrice:F4} | Stop: {alignedPrice:F4} | Mínimo: {minDistance:F4}");
				                    // ✅ AJUSTE AUTOMÁTICO
				                    alignedPrice = currentPrice + minDistance;
				                    alignedPrice = Math.Round(alignedPrice / TickSize) * TickSize;
				                    DebugPrint($"[STOP SAFE] 🔧 Stop ajustado para: {alignedPrice:F4}");
				                }
				            }
				            
				            SetStopLoss(fromSignal, CalculationMode.Price, alignedPrice, fromEntry);
				            DebugPrint($"[STOP SAFE] ✅ Stop aplicado: {alignedPrice:F4}");
				            return true;
				        }
				        
				        return false;
				    }
				    catch (Exception ex)
				    {
				        // ✅ CRÍTICO: NUNCA deixa o erro propagar (não desativa estratégia)
				        DebugPrint($"[STOP SAFE] ❌ ERRO CAPTURADO: {ex.Message}");
				        DebugPrint($"[STOP SAFE] ⚠️ Estratégia CONTINUA ATIVA - Posição pode estar desprotegida!");
				        
				        // ✅ TENTATIVA DE EMERGÊNCIA: Stop em Ticks (sempre funciona)
				        try
				        {
				            if (SL_Ticks > 0)
				            {
				                int minTicks = GetMinStopTicksForInstrument();
				                int safeTicks = Math.Max(SL_Ticks, minTicks);
				                SetStopLoss(fromSignal, CalculationMode.Ticks, safeTicks, fromEntry);
				                DebugPrint($"[STOP SAFE] 🛡️ FALLBACK: Stop em Ticks aplicado ({safeTicks} ticks)");
				                return true;
				            }
				        }
				        catch (Exception ex2)
				        {
				            DebugPrint($"[STOP SAFE] ❌ FALLBACK também falhou: {ex2.Message}");
				            DebugPrint($"[STOP SAFE] ⚠️ VERIFIQUE POSIÇÃO MANUALMENTE!");
				        }
				        
				        return false;
				    }
				}
				
				private bool SetProfitTargetSafe(string fromSignal, CalculationMode mode, double value, bool fromEntry)
				{
				    try
				    {
				        if (mode == CalculationMode.Price)
				        {
				            double alignedPrice = Math.Round(value / TickSize) * TickSize;
				            double currentPrice = Position.MarketPosition == MarketPosition.Long ? GetCurrentAsk() : GetCurrentBid();
				            double minDistance = GetMinStopDistanceForInstrument();

				            if (Position.MarketPosition == MarketPosition.Long)
				            {
				                if (alignedPrice <= currentPrice + minDistance)
				                {
				                    alignedPrice = currentPrice + minDistance;
				                    alignedPrice = Math.Round(alignedPrice / TickSize) * TickSize;
				                }
				            }
				            else if (Position.MarketPosition == MarketPosition.Short)
				            {
				                if (alignedPrice >= currentPrice - minDistance)
				                {
				                    alignedPrice = currentPrice - minDistance;
				                    alignedPrice = Math.Round(alignedPrice / TickSize) * TickSize;
				                }
				            }

				            SetProfitTarget(fromSignal, CalculationMode.Price, alignedPrice, fromEntry);
				            DebugPrint($"[TP SAFE] ✅ Target aplicado: {alignedPrice:F4}");
				            return true;
				        }
				        else
				        {
				            SetProfitTarget(fromSignal, mode, value, fromEntry);
				            return true;
				        }
				    }
				    catch (Exception ex)
				    {
				        DebugPrint($"[TP SAFE] ❌ Erro: {ex.Message}");
				        return false;
				    }
				}
				
				// =====================================================================
				// ✅ MÉTODO 1: Retorna mínimo de ticks baseado no ativo
				// =====================================================================
				private int GetMinStopTicksForInstrument()
				{
				    // ✅ Usa parâmetro configurável (padrão: 3 ticks)
				    int minTicks = 1;
				    
				    // ✅ Ajustes automáticos por tipo de ativo (opcional)
				    string instrumentName = Instrument.FullName.ToUpper();
				    
				    // Futuros de índice (ES, NQ, YM) - ticks valem mais, pode usar menos
				    if (instrumentName.Contains("ES") || instrumentName.Contains("NQ") || instrumentName.Contains("YM"))
				    {
				        minTicks = Math.Max(2, minTicks); // Mínimo 2 ticks
				        DebugPrint($"[STOP SAFE] 📊 Ativo Índice detectado | Min Ticks: {minTicks}");
				    }
				    // Forex - ticks valem menos, precisa de mais margem
				    else if (instrumentName.Contains("6E") || instrumentName.Contains("6B") || instrumentName.Contains("FX"))
				    {
				        minTicks = Math.Max(5, minTicks); // Mínimo 5 ticks
				        DebugPrint($"[STOP SAFE] 💱 Ativo Forex detectado | Min Ticks: {minTicks}");
				    }
				    // Commodities (CL, GC, SI)
				    else if (instrumentName.Contains("CL") || instrumentName.Contains("GC") || instrumentName.Contains("SI"))
				    {
				        minTicks = Math.Max(3, minTicks); // Mínimo 3 ticks
				        DebugPrint($"[STOP SAFE] 🛢️ Commodity detectada | Min Ticks: {minTicks}");
				    }
				    
				    return minTicks;
				}
				
				// =====================================================================
				// ✅ MÉTODO 2: Retorna distância mínima em preço baseado no ativo
				// =====================================================================
				private double GetMinStopDistanceForInstrument()
				{
				    // ✅ Calcula baseado no TickSize do ativo + parâmetro configurável
				    int minTicks = GetMinStopTicksForInstrument();
				    return minTicks * TickSize;
				}
				
				// =====================================================================
				// ✅ PNL DA ESTRATÉGIA - VERSÃO SIMPLIFICADA (Recomendada)
				// =====================================================================
				private double GetRobotRealizedPnLToday()
				{
				    try
				    {
				        if (SystemPerformance?.AllTrades == null) return 0;
				
				        double total = 0;
				        DateTime hoje = Time[0].Date;
				
				        foreach (var trade in SystemPerformance.AllTrades)
				        {
				            // ✅ Filtra apenas trades fechados HOJE nesta sessão
				            if (trade?.Exit != null && trade.Exit.Time.Date == hoje)
				                total += trade.ProfitCurrency; // Já é líquido no SystemPerformance
				        }
				
				        return total;
				    }
				    catch (Exception ex)
				    {
				        DebugPrint($"[PnL Estratégia] Erro: {ex.Message}");
				        return 0;
				    }
				}
		
		        private void IncrementarQuantOperacoes() { if (QuantOperacoes < MaxOrderSession) QuantOperacoes++; }
		
		        private int MinBarsRequired()
		        {
		            int maxSma = Math.Max(Math.Max(MACLOUD1_FastPeriod, MACLOUD1_SlowPeriod), ProfitCloseMAPeriod);
		            int calc = Math.Max(20, Math.Max(maxSma + MACLOUD1_BarShift + 2, Math.Max(EXPLOSION_SlowPeriod, Math.Max(OB_CandleHistory1 + 2, CandleThreshold)))) + 5;
		            return Math.Max(BarsRequiredToTrade, calc);
		        }
		
		        private void Reset1()
		        {
		            Resistance1 = 0; Support1 = 0; Range1 = 0; Resistance0 = 0; Support0 = 0;
		            resistencia = 0; suporte = 0;
		        }
		
		        private void ShowPopup(string title, string msg)
		        {
		            Dispatcher.InvokeAsync(() => MessageBox.Show(msg, title, MessageBoxButton.OK, MessageBoxImage.Information));
		        }
		
		        private List<Order> activeOrders = new List<Order>();
		        private void AddOrderToList(Order o)
		        {
		            if (!activeOrders.Contains(o)) activeOrders.Add(o);
		            if (o != null) realtimeOrderIds.Add(o.Id);
		        }
		
		        private void CancelPendingOrders()
		        {
		            foreach (Order o in activeOrders)
		            {
		                try
		                {
		                    if (o != null &&
		                        (!hasReachedRealtime || realtimeOrderIds.Contains(o.Id)) &&
		                        o.OrderState == OrderState.Working)
		                        CancelOrder(o);
		                }
		                catch (Exception ex)
		                {
		                    DebugPrint($"[ERRO] CancelPendingOrders: {ex.Message}");
		                }
		            }
		        }
		
		        private int barrasOrdemPendente = 0;
		        private void CancelarOrdensPendentesPorBarras()
		        {
		            for (int i = Orders.Count - 1; i >= 0; i--)
		            {
		                if (Orders[i].OrderState == OrderState.Working ||
		                    Orders[i].OrderState == OrderState.Submitted)
		                {
		                    barrasOrdemPendente++;
		                    if (barrasOrdemPendente > 3 &&
		                        (!hasReachedRealtime || realtimeOrderIds.Contains(Orders[i].Id)))
		                    {
		                        try { CancelOrder(Orders[i]); } catch (Exception ex) { DebugPrint($"[ERRO] CancelOrder[{i}]: {ex.Message}"); }
		                        barrasOrdemPendente = 0;
		                    }
		                }
		                else
		                {
		                    barrasOrdemPendente = 0;
		                }
		            }
		        }
		
		        private void CancelarOrdensPendentesNoFimHorario()
		        {
		            bool _foraJ1 = Time[0].TimeOfDay >= TIME_Stop.TimeOfDay;
		            bool _foraJ2 = !Janela2Ativa || Time[0].TimeOfDay >= TIME_Stop2.TimeOfDay;
		            if (_foraJ1 && _foraJ2)
		            {
		                for (int i = Orders.Count - 1; i >= 0; i--)
		                {
		                    if ((Orders[i].OrderState == OrderState.Working ||
		                        Orders[i].OrderState == OrderState.Submitted) &&
		                        (!hasReachedRealtime || realtimeOrderIds.Contains(Orders[i].Id)))
		                    {
		                        try { CancelOrder(Orders[i]); } catch (Exception ex) { DebugPrint($"[ERRO] CancelOrder[{i}]: {ex.Message}"); }
		                    }
		                }
		            }
		        }
		
		        private double CalcBacktestRealizedPnL(DateTime date)
				{
				    double total = 0;
				    try
				    {
				        if (SystemPerformance != null && SystemPerformance.AllTrades != null)
				        {
				            foreach (var trade in SystemPerformance.AllTrades)
				            {
				                if (trade != null && trade.Exit != null && trade.Exit.Time.Date == date.Date)
				                    total += trade.ProfitCurrency;
				            }
				        }
				    }
				    catch (Exception ex)
				    {
				        DebugPrint($"[PnL Backtest] Erro ao calcular: {ex.Message}");
				    }
				    return total;
				}
		        #endregion
		
		        // =====================================================================
		        // GRID SCALPER – MÉTODOS PRINCIPAIS
		        // =====================================================================
		        #region Grid: PlaceGrid1 (versão legada – mantida para compatibilidade)
		        private void PlaceGrid1(int direction)
		        {
		            if (SendSignalsToIndicator)
		            {
		                double p = Close[0];
		                VmSignalBridge.SendSignal(Instrument.FullName, direction, p, Guid.NewGuid().ToString(), SL_Ticks, TP_Ticks);
		                Print($"[VMBOT BRIDGE] 🚀 Grid {(direction == 1 ? "COMPRA" : "VENDA")} simulado e sinal enviado para o indicador @ {p}");
		                IncrementarQuantOperacoes();
		                return;
		            }
		            gridGeneration++;
		            bool usingStop = (OrderMode == orderMode.PendenteStop);
		            double ask = GetCurrentAsk(), bid = GetCurrentBid();
		            string side = direction == 1 ? "BUY" : "SELL";
		            List<Order> gOrders = direction == 1 ? gridOrdersBuy : gridOrdersSell;
		            gOrders.Clear();
		            if (direction == 1) gridFirstOrderBuy  = null;
		            else               gridFirstOrderSell = null;
		            int ordensColocadas = 0;
		            if (Grid_OrderCount <= 0) return;
					double[] _spacingOffset = new double[Grid_OrderCount];
		            for (int k = 1; k < Grid_OrderCount; k++)
		                _spacingOffset[k] = _spacingOffset[k-1] + Grid_Spacing * Math.Pow(Grid_SpacingMultiplier, k-1);
		            for (int i = 0; i < Grid_OrderCount; i++)
		            {
		                int lots = (int)Math.Max(1, Math.Round(LOTE_Size * Math.Pow(Grid_LotMultiplier, i)));
		                string sig = $"G{(direction == 1 ? "B" : "S")}{gridGeneration}_{i}";
		                Order o = null;
		                try
		                {
		                    if (direction == 1)
		                    {
		                        if (usingStop)
		                        {
		                            double price = Math.Round((ask + (distancePrice + _spacingOffset[i]) * TickSize) / TickSize) * TickSize;
		                            if (price <= ask) price = ask + TickSize;
		                            DebugPrint($"[GRID] {side} Stop nível {i}: price={price}, ask={ask}");
		                            o = EnterLongStopMarket(0, true, lots, price, sig);
									if (HLCA_StopActive)
									{
									    double hlcaStop = CalcHLCAStopLoss(1, GetCurrentBid());
									    if (hlcaStop > 0)
									    {
									        SetStopLossSafe("", CalculationMode.Price, hlcaStop, false);
									        DebugPrint($"[COMPRA] Stop Loss HLCA aplicado: {hlcaStop:F2}");
									    }
									}
		                        }
		                        else
		                        {
		                            double price = Math.Round((bid - (distancePrice + _spacingOffset[i]) * TickSize) / TickSize) * TickSize;
		                            if (price >= bid) price = bid - TickSize;
		                            if (price <= 0) { DebugPrint($"[GRID] ⚠ {side} Limit nível {i} preço inválido ({price}). Ignorado."); continue; }
		                            DebugPrint($"[GRID] {side} Limit nível {i}: price={price}, bid={bid}");
		                            o = EnterLongLimit(0, true, lots, price, sig);
									if (HLCA_StopActive)
									{
									    double hlcaStop = CalcHLCAStopLoss(1, GetCurrentBid());
									    if (hlcaStop > 0)
									    {
									        SetStopLossSafe("", CalculationMode.Price, hlcaStop, false);
									        DebugPrint($"[COMPRA] Stop Loss HLCA aplicado: {hlcaStop:F2}");
									    }
									}
		                        }
		                    }
		                    else
		                    {
		                        if (usingStop)
		                        {
		                            double price = Math.Round((bid - (distancePrice + _spacingOffset[i]) * TickSize) / TickSize) * TickSize;
		                            if (price >= bid) price = bid - TickSize;
		                            if (price <= 0) { DebugPrint($"[GRID] ⚠ {side} Stop nível {i} preço inválido ({price}). Ignorado."); continue; }
		                            DebugPrint($"[GRID] {side} Stop nível {i}: price={price}, bid={bid}");
		                            o = EnterShortStopMarket(0, true, lots, price, sig);
									if (HLCA_StopActive)
									{
									    double hlcaStop = CalcHLCAStopLoss(-1, GetCurrentBid());
									    if (hlcaStop > 0)
									    {
									        SetStopLossSafe("", CalculationMode.Price, hlcaStop, false);
									        DebugPrint($"[VENDA] Stop Loss HLCA aplicado: {hlcaStop:F2}");
									    }
									}
		                        }
		                        else
		                        {
		                            double price = Math.Round((ask + (distancePrice + _spacingOffset[i]) * TickSize) / TickSize) * TickSize;
		                            if (price <= ask) price = ask + TickSize;
		                            DebugPrint($"[GRID] {side} Limit nível {i}: price={price}, ask={ask}");
		                            o = EnterShortLimit(0, true, lots, price, sig);
									if (HLCA_StopActive)
									{
									    double hlcaStop = CalcHLCAStopLoss(-1, GetCurrentBid());
									    if (hlcaStop > 0)
									    {
									        SetStopLossSafe("", CalculationMode.Price, hlcaStop, false);
									        DebugPrint($"[VENDA] Stop Loss HLCA aplicado: {hlcaStop:F2}");
									    }
									}
		                        }
		                    }
		                }
		                catch (Exception ex)
		                {
		                    DebugPrint($"[GRID] ⚠ Erro ao colocar ordem nível {i}: {ex.Message}");
		                    continue;
		                }
		                if (o != null)
		                {
		                    gOrders.Add(o);
		                    realtimeOrderIds.Add(o.Id);
		                    ordensColocadas++;
		                    if (i == 0)
		                    {
		                        if (direction == 1) gridFirstOrderBuy  = o;
		                        else               gridFirstOrderSell = o;
		                    }
		                }
		            }
		            if (ordensColocadas > 0)
		            {
		                if (direction == 1) { gridCreatedBarBuy = CurrentBar; gridArmedBuy = true; gridHasOpenPosBuy = false; gridNeedsRearmBuy = false; }
		                else               { gridCreatedBarSell = CurrentBar; gridArmedSell = true; gridHasOpenPosSell = false; gridNeedsRearmSell = false; }
		                if (SL_Ticks > 0) SetStopLoss("", CalculationMode.Ticks, SL_Ticks, false);
		                if (TP_Ticks > 0) SetProfitTarget("", CalculationMode.Ticks, TP_Ticks, false);
		                DebugPrint($"[GRID] Gen {gridGeneration} | {side} | {ordensColocadas} ordens | Tipo: {OrderMode}");
		            }
		            else
		            {
		                DebugPrint($"[GRID] ⚠ Gen {gridGeneration} | {side} | NENHUMA ordem colocada. Grid NÃO armado.");
		            }
		        }
		        #endregion
		
		                #region Grid: Cancel / HasPending
		
		
		        private async Task CancelGridOrdersAsync(int direction)
				{
				                lock (cancelLock)
		            {
		                if (isCancellingOrders)
		                {
		                    DebugPrint($"[GRID] Cancelamento já em andamento para {(direction == 1 ? "BUY" : "SELL")}. Aguardando...");
		                    return;
		                }
		                isCancellingOrders = true;
		            }
		
		            try
		            {
		                List<Order> gOrders = direction == 1 ? gridOrdersBuy : gridOrdersSell;
		
		                if (gOrders == null)
		                {
		                    lock (cancelLock) { isCancellingOrders = false; }
		                    return;
		                }
		
		                int cancelledCount = 0;
		                foreach (var o in gOrders.ToList())
		                {
		                    try
		                    {
		                        if (o != null &&
		                            (!hasReachedRealtime || realtimeOrderIds.Contains(o.Id)) &&
		                            (o.OrderState == OrderState.Working ||
		                             o.OrderState == OrderState.Submitted ||
		                             o.OrderState == OrderState.Accepted))
		                        {
		                            CancelOrder(o);
		                            cancelledCount++;
		
		                            if (Grid_CancelDelayMs > 0 && cancelledCount < gOrders.Count)
		                                await Task.Delay(Grid_CancelDelayMs);
		                        }
		                    }
		                    catch (Exception ex)
		                    {
		                        DebugPrint($"[GRID] Erro cancel: {ex.Message}");
		                    }
		                }
		
		                gOrders.Clear();
		                if (direction == 1)
		                {
		                    gridArmedBuy = false;
		                    gridFirstOrderBuy = null;
		                    gridHasOpenPosBuy = false;
		                }
		                else
		                {
		                    gridArmedSell = false;
		                    gridFirstOrderSell = null;
		                    gridHasOpenPosSell = false;
		                }
		
		                lastCancelTime = DateTime.Now;
		                DebugPrint($"[GRID] Ordens {(direction == 1 ? "BUY" : "SELL")} canceladas ({cancelledCount} ordens). Delay aplicado: {Grid_CancelDelayMs}ms");
		            }
		            finally
		            {
		                lock (cancelLock) { isCancellingOrders = false; }
		            }
		        }
				
				private void VerificaMetas()
				{
				    if (robotTravado) return;
				
				    // Verifica meta de LUCRO (somente se ativa)
				    if (DailyProfitActive && realizadoConta >= DailyProfitLimit)
				    {
				        TravaRobo("Meta Lucro");
				        return;
				    }
				
				    // Verifica meta de PERDA (somente se ativa)
				    if (DailyLossActive && realizadoConta <= -DailyLossLimit)
				    {
				        TravaRobo("Meta Perda");
				        return;
				    }
				}
				
				private void TravaRobo(string motivo)
				{
				    robotTravado = true;		
				    if (Position.MarketPosition == MarketPosition.Long)
				        ExitLong("Travamento " + motivo);
				    else if (Position.MarketPosition == MarketPosition.Short)
				        ExitShort("Travamento " + motivo);
				}
		
		        private void CancelAllGridOrders() { CancelGridOrdersAsync(1); CancelGridOrdersAsync(-1); }
		
		        private bool HasPendingGridOrders(int direction)
		        {
		            var g = direction == 1 ? gridOrdersBuy : gridOrdersSell;
		            return g != null && g.Any(o => o != null && (o.OrderState == OrderState.Working || o.OrderState == OrderState.Submitted || o.OrderState == OrderState.Accepted));
		        }
		
		        private int CountPendingGridOrders(int direction)
		        {
		            var g = direction == 1 ? gridOrdersBuy : gridOrdersSell;
		            if (g == null) return 0;
		            return g.Count(o => o != null && (o.OrderState == OrderState.Working || o.OrderState == OrderState.Submitted || o.OrderState == OrderState.Accepted));
		        }
		        #endregion
		
		
		        // =====================================================================
		        // =====================================================================
		        // FVG (FAIR VALUE GAP) — FILTRO DE ENTRADA PARA O GRID SCALPER
		        // =====================================================================
		        // Replica a lógica do indicador nativo FVG do NinjaTrader (ExtendUntil=Filled).
		        //
		        // FORMAÇÃO:
		        //   FVG Alta  (Bullish): Low[i] > High[i+2]  →  zona = [High[i+2], Low[i]]
		        //   FVG Baixa (Bearish): High[i] < Low[i+2]  →  zona = [High[i], Low[i+2]]
		        //
		        // PREENCHIMENTO (igual ao indicador nativo):
		        //   Bullish: qualquer barra APÓS a formação com Low < Low[i] entrou na zona → gap preenchido
		        //   Bearish: qualquer barra APÓS a formação com High > High[i] entrou na zona → gap preenchido
		        //
		        // Parâmetros:
		        //   FVG_MinimumTicks = tamanho mínimo do gap em ticks  (≡ Minimum Ticks do nativo)
		        //   FVG_MaxBars      = janela de busca em barras       (≡ Max FVG do nativo)
		        // =====================================================================
		        #region Grid: CheckFVGFilter
		        /// <summary>
		        /// Versão silenciosa — sem Print. Usada exclusivamente pelo painel de status.
		        /// </summary>
		        private bool CheckFVGFilter(int direction)
				{
				    if (!FVG_Active) return true;
				    if (CurrentBar < 3) return false;
				
				    int lookback = Math.Min(FVG_MaxBars, CurrentBar - 3);
				
				    for (int i = 0; i <= lookback; i++)
				    {
				        if (i + 2 > CurrentBar) break;
				
				        double gapBottom, gapTop, gapTicks;
				
				        if (direction == 1)
				        {
				            gapBottom = High[i + 2];
				            gapTop    = Low[i];
				            gapTicks  = (gapTop - gapBottom) / TickSize;
				            if (gapTicks < FVG_MinimumTicks) continue;
				
				            bool filled = false;
				            for (int k = 0; k < i; k++)
				            {
				                if (Low[k] <= gapTop) { filled = true; break; }  // FIX: < → <=
				            }
				
				            if (!filled)
				            {
				                DebugPrint($"[FB] BUY  {i}b atrás | Zona {gapBottom:F2}–{gapTop:F2} | {gapTicks:F0} ticks | ABERTO");
				                return true;
				            }
				            else
				                DebugPrint($"[FB] BUY  {i}b atrás | Zona {gapBottom:F2}–{gapTop:F2} | PREENCHIDO");
				        }
				        else
				        {
				            gapBottom = High[i];
				            gapTop    = Low[i + 2];
				            gapTicks  = (gapTop - gapBottom) / TickSize;
				            if (gapTicks < FVG_MinimumTicks) continue;
				
				            bool filled = false;
				            for (int k = 0; k < i; k++)
				            {
				                if (High[k] >= gapBottom) { filled = true; break; }  // FIX: > → >=
				            }
				
				            if (!filled)
				            {
				                DebugPrint($"[FB] SELL  {i}b atrás | Zona {gapBottom:F2}–{gapTop:F2} | {gapTicks:F0} ticks | ABERTO");
				                return true;
				            }
				            else
				                DebugPrint($"[FB] SELL  {i}b atrás | Zona {gapBottom:F2}–{gapTop:F2} | PREENCHIDO");
				        }
				    }
				
				    DebugPrint($"[FB] Nenhum  {(direction == 1 ? "BUY" : "SELL")} aberto nas últimas {lookback} barras.");
				    return false;
				}
				
				private bool CheckFVGFilterQuiet(int direction)
				{
				    if (!FVG_Active) return false;
				    if (CurrentBar < 3) return false;
				    int lookback = Math.Min(FVG_MaxBars, CurrentBar - 3);
				    for (int i = 0; i <= lookback; i++)
				    {
				        if (i + 2 > CurrentBar) break;
				        if (direction == 1)
				        {
				            double gapBottom = High[i + 2];
				            double gapTop    = Low[i];
				            if ((gapTop - gapBottom) / TickSize < FVG_MinimumTicks) continue;
				            bool filled = false;
				            for (int k = 0; k < i; k++) { if (Low[k] <= gapTop) { filled = true; break; } }  // FIX: <=
				            if (!filled) return true;
				        }
				        else
				        {
				            double gapBottom = High[i];
				            double gapTop    = Low[i + 2];
				            if ((gapTop - gapBottom) / TickSize < FVG_MinimumTicks) continue;
				            bool filled = false;
				            for (int k = 0; k < i; k++) { if (High[k] >= gapBottom) { filled = true; break; } }  // FIX: >=
				            if (!filled) return true;
				        }
				    }
				    return false;
				}
		
		        #endregion
		
		
		
		
		
		        /// <summary>
		        /// Desenha retângulos no gráfico para cada FVG detectado — bullish (verde) e bearish (vermelho).
		        /// Limitado às últimas 50 barras para não poluir o gráfico.
		        /// Aberto = cor sólida | Preenchido = mesma cor com opacidade reduzida.
		        /// </summary>
		        private void DrawFVGZones()
		        {
		            if (!FVG_Active || !FVG_DrawZones) return;
		            if (CurrentBar < 3) return;
		
		            // Desenha apenas as últimas 50 barras (independente de FVG_MaxBars)
		            int drawLookback = Math.Min(50, CurrentBar - 3);
		
		            // Cores base — aberto = sólido total | preenchido = bem apagado
		            var colorBuyOpen   = new SolidColorBrush(Color.FromArgb(255, 0, 200, 80));  // verde sólido
		            var colorBuyFilled = new SolidColorBrush(Color.FromArgb(60,  0, 200, 80));  // verde apagado
		            var colorSellOpen  = new SolidColorBrush(Color.FromArgb(255, 210, 30, 30)); // vermelho sólido
		            var colorSellFilled= new SolidColorBrush(Color.FromArgb(60,  210, 30, 30)); // vermelho apagado
		
		            for (int i = 0; i <= drawLookback; i++)
		            {
		                if (i + 2 > CurrentBar) break;
		
		                // ── FVG bullish ──────────────────────────────────────────────
		                {
		                    double gapBottom = High[i + 2];
		                    double gapTop    = Low[i];
		                    if ((gapTop - gapBottom) / TickSize >= FVG_MinimumTicks)
		                    {
		                        bool filled = false;
		                        for (int k = 0; k < i; k++)
		                            if (Low[k] <= gapTop) { filled = true; break; }
		
		                        string tag = $"FB_BUY_{CurrentBar - i}";
		                        var col = filled ? colorBuyFilled : colorBuyOpen;
		
		                        Draw.Rectangle(this, tag, false,
		                            i + 2, gapTop,
		                            0,     gapBottom,
		                            col, col, 1);
		                    }
		                }
		
		                // ── FVG bearish ──────────────────────────────────────────────
		                {
		                    double gapBottom = High[i];
		                    double gapTop    = Low[i + 2];
		                    if ((gapTop - gapBottom) / TickSize >= FVG_MinimumTicks)
		                    {
		                        bool filled = false;
		                        for (int k = 0; k < i; k++)
		                            if (High[k] >= gapBottom) { filled = true; break; }
		
		                        string tag = $"FB_SELL_{CurrentBar - i}";
		                        var col = filled ? colorSellFilled : colorSellOpen;
		
		                        Draw.Rectangle(this, tag, false,
		                            i + 2, gapTop,
		                            0,     gapBottom,
		                            col, col, 1);
		                    }
		                }
		            }
		        }
		
		
		        // =====================================================================
		        // FVG SCALPER — MÉTODOS PRINCIPAIS
		        // =====================================================================
		        // Estratégia acionada quando o candle toca uma zona FVG aberta.
		        // Reutiliza toda a infraestrutura de Grid (gridArmed, gridOrders, etc.).
		        // Diferença-chave vs GridScalper:
		        //   · Gatilho = candle toca a zona FVG (não roda em toda barra)
		        //   · FVG preenchido → cancela ordens pendentes automaticamente
		        //   · Modo Mercado = entrada única; Stop/Limit = suporta grid
		        // =====================================================================
		
		        #region FVG Scalper: CheckFVGTouch / CheckFVGOpenForScalper
		
		        /// <summary>
		        /// Detecta se o candle ATUAL tocou uma zona FVG aberta na direção informada.
		        /// Busca FVGs formados a partir de i=1 (pelo menos 1 barra de idade).
		        /// Fill check usa apenas barras ENTRE a formação e a barra atual (não inclui atual).
		        /// </summary>
		        private bool CheckFVGTouch(int direction)
		        {
		            if (CurrentBar < 3) return false;
		            int lookback = Math.Min(FVG_MaxBars, CurrentBar - 3);
		            string side  = direction == 1 ? "BUY" : "SELL";
		
		            for (int i = 1; i <= lookback; i++)
		            {
		                if (i + 2 > CurrentBar) break;
		
		                if (direction == 1) // BUY — FVG bullish: zona [High[i+2], Low[i]]
		                {
		                    double gapBottom = High[i + 2];
		                    double gapTop    = Low[i];
		                    if ((gapTop - gapBottom) / TickSize < FVG_MinimumTicks) continue;
		
		                    // Verifica se barras ANTERIORES (entre formação e agora) já preencheram
		                    bool filled = false;
		                    for (int k = 1; k < i; k++)
		                        if (Low[k] < gapTop) { filled = true; break; }
		                    if (filled) continue;
		
		                    // Candle atual sobrepõe a zona (toca de cima)
		                    if (Low[0] <= gapTop && High[0] >= gapBottom)
		                    {
		                        DebugPrint($"[FB SCALPER] {side} TOQUE — gap {i}b | Zona [{gapBottom:F2},{gapTop:F2}] | Candle H={High[0]:F2} L={Low[0]:F2}");
		                        return true;
		                    }
		                }
		                else // SELL — FVG bearish: zona [High[i], Low[i+2]]
		                {
		                    double gapBottom = High[i];
		                    double gapTop    = Low[i + 2];
		                    if ((gapTop - gapBottom) / TickSize < FVG_MinimumTicks) continue;
		
		                    bool filled = false;
		                    for (int k = 1; k < i; k++)
		                        if (High[k] > gapBottom) { filled = true; break; }
		                    if (filled) continue;
		
		                    // Candle atual sobrepõe a zona (toca de baixo)
		                    if (High[0] >= gapBottom && Low[0] <= gapTop)
		                    {
		                        DebugPrint($"[FB SCALPER] {side} TOQUE — gap {i}b | Zona [{gapBottom:F2},{gapTop:F2}] | Candle H={High[0]:F2} L={Low[0]:F2}");
		                        return true;
		                    }
		                }
		            }
		            return false;
		        }
		
		        /// <summary>
		        /// Verifica se ainda existe pelo menos um FVG aberto (não preenchido) na direção.
		        /// Usado para decidir se ordens pendentes devem ser canceladas (FVG expirou).
		        /// Inclui o candle atual no fill check — se o FVG foi preenchido hoje, cancela.
		        /// </summary>
		        private bool CheckFVGOpenForScalper(int direction)
		        {
		            if (CurrentBar < 3) return false;
		            int lookback = Math.Min(FVG_MaxBars, CurrentBar - 3);
		            for (int i = 1; i <= lookback; i++)
		            {
		                if (i + 2 > CurrentBar) break;
		                if (direction == 1)
		                {
		                    double gapBottom = High[i + 2];
		                    double gapTop    = Low[i];
		                    if ((gapTop - gapBottom) / TickSize < FVG_MinimumTicks) continue;
		                    bool filled = false;
		                    for (int k = 0; k < i; k++)  // inclui barra atual
		                        if (Low[k] < gapTop) { filled = true; break; }
		                    if (!filled) return true;
		                }
		                else
		                {
		                    double gapBottom = High[i];
		                    double gapTop    = Low[i + 2];
		                    if ((gapTop - gapBottom) / TickSize < FVG_MinimumTicks) continue;
		                    bool filled = false;
		                    for (int k = 0; k < i; k++)
		                        if (High[k] > gapBottom) { filled = true; break; }
		                    if (!filled) return true;
		                }
		            }
		            return false;
		        }
		
		        #endregion
		
		        // ── Cancelamento síncrono (backtest/Strategy Analyzer) ─────────────
		        private void CancelGridOrdersSync(int direction)
		        {
		            List<Order> gOrders = direction == 1 ? gridOrdersBuy : gridOrdersSell;
		            if (gOrders == null) return;
		            foreach (var o in gOrders.ToList())
		            {
		                try
		                {
		                    if (o != null &&
		                        (!hasReachedRealtime || realtimeOrderIds.Contains(o.Id)) &&
		                        (o.OrderState == OrderState.Working ||
		                         o.OrderState == OrderState.Submitted ||
		                         o.OrderState == OrderState.Accepted))
		                        CancelOrder(o);
		                }
		                catch (Exception ex) { DebugPrint($"[FB SCALPER] Erro cancel sync: {ex.Message}"); }
		            }
		            gOrders.Clear();
		            if (direction == 1) { gridArmedBuy = false; gridFirstOrderBuy = null; gridHasOpenPosBuy = false; }
		            else               { gridArmedSell = false; gridFirstOrderSell = null; gridHasOpenPosSell = false; }
		            DebugPrint($"[FB SCALPER] Ordens {(direction == 1 ? "BUY" : "SELL")} canceladas sync.");
		        }
		
		        #region FVG Scalper: ProcessFVGScalperSideSync (backtest)
		
		        private void ProcessFVGScalperSideSync(int direction)
				{
				    bool armed      = direction == 1 ? gridArmedBuy      : gridArmedSell;
				    bool hasOpenPos = direction == 1 ? gridHasOpenPosBuy : gridHasOpenPosSell;
				    bool needsRearm = direction == 1 ? gridNeedsRearmBuy : gridNeedsRearmSell;
				    string side     = direction == 1 ? "BUY" : "SELL";
				
				    // ── FVG expirou/preenchido → cancela ordens pendentes ─────────────────
				    if (armed && !hasOpenPos && Position.MarketPosition == MarketPosition.Flat)
				    {
				        if (!CheckFVGOpenForScalper(direction))
				        {
				            DebugPrint($"[FB SCALPER] {side} FVG preenchido/expirado — cancelando ordens.");
				            CancelGridOrdersSync(direction);
				            armed = false;
				        }
				    }
				
				    // ── Estado inconsistente: armado sem ordens ───────────────────────────
				    if (armed && !HasPendingGridOrders(direction) && !hasOpenPos && Position.MarketPosition == MarketPosition.Flat)
				    {
				        if (direction == 1) { gridArmedBuy = false; gridOrdersBuy.Clear(); }
				        else               { gridArmedSell = false; gridOrdersSell.Clear(); }
				        armed = false;
				    }
				
				    // ── Rearmar (após TP/SL) ──────────────────────────────────────────────
				    if (needsRearm)
				    {
				        if (HasPendingGridOrders(direction)) CancelGridOrdersSync(direction);
				        if (direction == 1) gridNeedsRearmBuy = false;
				        else               gridNeedsRearmSell = false;
				        armed = false;
				        if (Grid_RearmSameBar) lastProcessedBarGrid = -1;
				    }
				
				    // ── Gatilho: FVG tocado ───────────────────────────────────────────────
				    if (!armed && QuantOperacoes < MaxOrderSession)
				    {
				        if (HasAccountPositionOrOrders())
				        {
				            return;
				        }
				
				        // BUG FIX: separar guards de Automático e Importar
				        if (TS_Mode == tsMode.Automatico && isLiveTrading && !CheckTimeSlotFilter())
				        {
				            
							DebugPrint($"[TS] FVG SYNC bloqueado — faixa fora do critério (Automático)");
				            return;
				        }
				        if (TS_Mode == tsMode.Importar && _timeSlotCalcDone && !CheckTimeSlotFilter())
				        {
				            DebugPrint($"[TS] FVG SYNC bloqueado — faixa fora do critério (Importar)");
				            return;
				        }
				
				        bool isAllowed = (direction == 1)
				            ? (currentOperatingMode == OperatingMode.Comprado || currentOperatingMode == OperatingMode.Ambos)
				            : (currentOperatingMode == OperatingMode.Vendido  || currentOperatingMode == OperatingMode.Ambos);
				        if (!isAllowed) return;
				
				        // Filtros opcionais (mesma cadeia do GridScalper)
				        bool filtersPass =
				            ((!ACTIVE_Explosion) || (direction == 1 ? FiltroExplosionCompra() : FiltroExplosionVenda()))
				            && (!RenkoForce || CheckForceMovement())
				            && ((!ACTIVE_Pva) || FiltroPVAClimax(direction))
				            && (!HL_Active1 || HL_Prior(direction))
				            && (!MACLOUD1_Filter || CheckMACLOUDFilter(1, direction, Reverse_Mode1, MACLOUD1_BarShift, MACLOUD1_Min, MACLOUD1_Max, autoRangeAvg1))
				            && CheckGridFiltroContexto(direction)
				            && CheckForce2DFilter(direction)
				            && (!OB_Active || OrderBlock1(direction, 1))
							&& (!KELTNER_Vol_Active     || CheckKeltnerVolatility())
							&& (!KELTNER_Trigger_Active || CheckKeltnerTrigger(direction))
							&& CheckCandleRangeFilter(1);
				
				        if (!filtersPass) return;
				
				        // ── GATILHO PRINCIPAL: candle toca FVG ──────────────────────────
				        if (!CheckFVGTouch(direction)) return;
				
				        DebugPrint($"[FB SCALPER] {side} GATILHO CONFIRMADO — colocando ordens ({OrderMode})");
				
				        if (OrderMode == orderMode.Mercado)
				        {
				            Order o = direction == 1
				                ? EnterLong(Convert.ToInt32(LOTE_Size), "BuyOrder")
				                : EnterShort(Convert.ToInt32(LOTE_Size), "SellOrder");
				            if (o != null) realtimeOrderIds.Add(o.Id);
				            if (HLCA_StopActive)
				            {
				                double hlcaStop = CalcHLCAStopLoss(direction, GetCurrentBid());
				                if (hlcaStop > 0) SetStopLossSafe("", CalculationMode.Price, hlcaStop, false);
				            }
				            if (SL_Ticks > 0) SetStopLoss("", CalculationMode.Ticks, SL_Ticks, false);
				            if (TP_Ticks > 0) SetProfitTarget("", CalculationMode.Ticks, TP_Ticks, false);
				            IncrementarQuantOperacoes();
				        }
				        else
				        {
				            PlaceGrid(direction);
				        }
				    }
				}
	
				
				
		        #endregion
		
		        #region FVG Scalper: ProcessFVGScalperSideAsync (live)
		
		        private async Task ProcessFVGScalperSideAsync(int direction)
				{
				    bool armed      = direction == 1 ? gridArmedBuy      : gridArmedSell;
				    bool hasOpenPos = direction == 1 ? gridHasOpenPosBuy : gridHasOpenPosSell;
				    bool needsRearm = direction == 1 ? gridNeedsRearmBuy : gridNeedsRearmSell;
				    string side     = direction == 1 ? "BUY" : "SELL";
				
				    // ── FVG expirou → cancela ─────────────────────────────────────────────
				    if (armed && !hasOpenPos && Position.MarketPosition == MarketPosition.Flat)
				    {
				        if (!CheckFVGOpenForScalper(direction))
				        {
				            DebugPrint($"[FB SCALPER] {side} FVG preenchido/expirado — cancelando ordens.");
				            await CancelGridOrdersAsync(direction);
				            armed = false;
				        }
				    }
				
				    // ── Estado inconsistente ──────────────────────────────────────────────
				    if (armed && !HasPendingGridOrders(direction) && !hasOpenPos && Position.MarketPosition == MarketPosition.Flat)
				    {
				        if (direction == 1) { gridArmedBuy = false; gridOrdersBuy.Clear(); }
				        else               { gridArmedSell = false; gridOrdersSell.Clear(); }
				        armed = false;
				    }
				
				    // ── Rearmar ───────────────────────────────────────────────────────────
				    if (needsRearm)
				    {
				        if (HasPendingGridOrders(direction)) await CancelGridOrdersAsync(direction);
				        if (direction == 1) gridNeedsRearmBuy = false;
				        else               gridNeedsRearmSell = false;
				        armed = false;
				        if (Grid_RearmSameBar) lastProcessedBarGrid = -1;
				    }
				
				    // ── Gatilho ───────────────────────────────────────────────────────────
				    if (!armed && QuantOperacoes < MaxOrderSession)
				    {
				        if (HasAccountPositionOrOrders())
				        {
				            return;
				        }
				
				        // BUG FIX: separar guards de Automático e Importar
				        if (TS_Mode == tsMode.Automatico && isLiveTrading && !CheckTimeSlotFilter())
				        {
				            DebugPrint($"[TS] FVG ASYNC bloqueado — faixa fora do critério (Automático)");
				            return;
				        }
				        if (TS_Mode == tsMode.Importar && _timeSlotCalcDone && !CheckTimeSlotFilter())
				        {
				            DebugPrint($"[TS] FVG ASYNC bloqueado — faixa fora do critério (Importar)");
				            return;
				        }
				
				        bool isAllowed = (direction == 1)
				            ? (currentOperatingMode == OperatingMode.Comprado || currentOperatingMode == OperatingMode.Ambos)
				            : (currentOperatingMode == OperatingMode.Vendido  || currentOperatingMode == OperatingMode.Ambos);
				        if (!isAllowed) return;
				        
if (SendSignalsToIndicator && VmSignalBridge.IsBusy(Instrument.FullName))
				        {
				            DebugPrint("[FVG] Entrada bloqueada: Indicador ocupado com operação simulada.");
				            return;
				        }
				
				        bool filtersPass =
				            ((!ACTIVE_Explosion) || (direction == 1 ? FiltroExplosionCompra() : FiltroExplosionVenda()))
				            && (!RenkoForce || CheckForceMovement())
				            && ((!ACTIVE_Pva) || FiltroPVAClimax(direction))
				            && (!HL_Active1 || HL_Prior(direction))
				            && (!MACLOUD1_Filter || CheckMACLOUDFilter(1, direction, Reverse_Mode1, MACLOUD1_BarShift, MACLOUD1_Min, MACLOUD1_Max, autoRangeAvg1))
				            && CheckGridFiltroContexto(direction)
				            && CheckForce2DFilter(direction)
				            && (!OB_Active || OrderBlock1(direction, 1))
							&& (!KELTNER_Vol_Active     || CheckKeltnerVolatility())
							&& (!KELTNER_Trigger_Active || CheckKeltnerTrigger(direction))
							&& CheckCandleRangeFilter(1);
					
						
				        if (!filtersPass) return;
				
				        if (!CheckFVGTouch(direction)) return;
				
				        DebugPrint($"[FB SCALPER] {side} GATILHO CONFIRMADO — colocando ordens ({OrderMode})");
				
				        if (SendSignalsToIndicator)
				        {
				            double p = Close[0];
					    VmSignalBridge.SendSignal(Instrument.FullName, direction, p, Guid.NewGuid().ToString(), SL_Ticks, TP_Ticks);
				        }

				        if (OrderMode == orderMode.Mercado)
				        {
				            Order o = direction == 1
				                ? EnterLong(Convert.ToInt32(LOTE_Size), "BuyOrder")
				                : EnterShort(Convert.ToInt32(LOTE_Size), "SellOrder");
				            if (o != null) realtimeOrderIds.Add(o.Id);
				            if (HLCA_StopActive)
				            {
				                double hlcaStop = CalcHLCAStopLoss(direction, GetCurrentBid());
				                if (hlcaStop > 0) SetStopLossSafe("", CalculationMode.Price, hlcaStop, false);
				            }
				            if (SL_Ticks > 0) SetStopLoss("", CalculationMode.Ticks, SL_Ticks, false);
				            if (TP_Ticks > 0) SetProfitTarget("", CalculationMode.Ticks, TP_Ticks, false);
				            IncrementarQuantOperacoes();
				        }
				        else
				        {
				            if (Grid_CancelDelayMs > 0 && lastCancelTime != DateTime.MinValue)
				            {
				                var elapsed = (DateTime.Now - lastCancelTime).TotalMilliseconds;
				                if (elapsed < Grid_CancelDelayMs)
				                    await Task.Delay((int)(Grid_CancelDelayMs - elapsed));
				            }
				            PlaceGrid(direction);
				        }
				    }
				}
	
				
		        #endregion
		
		        #region Grid: Filtro de Contexto
		        private bool CheckGridFiltroContexto(int direction)
		        {
		            if (Grid_FiltroContexto == gridFiltroMode.OFF) return true;
		            if (_gridADX == null || _gridATR == null || _gridEMA == null) return true;
		            double adx   = _gridADX[0];
		            double atr   = _gridATR[0];
		            double atrTk = atr / TickSize;
		            double emaSlope = (_gridEMA[0] - _gridEMA[3]) / TickSize;
		            if (Grid_FiltroContexto == gridFiltroMode.Tendencia)
		            {
		                bool adxOK   = adx > 22;
		                bool slopeOK = direction == 1 ? emaSlope > 3 : emaSlope < -3;
		                bool atrOK   = atrTk > 8;
		                DebugPrint($"[GRID FILTRO] Tendencia | ADX={adx:F1} slopeEMA={emaSlope:F1}tk ATR={atrTk:F1}tk | pass={adxOK && slopeOK && atrOK}");
		                return adxOK && slopeOK && atrOK;
		            }
		            else
		            {
		                double gridSpan = distancePrice + Grid_Spacing * Grid_OrderCount;
		                bool adxOK   = adx < 20;
		                bool rangeOK = atrTk < gridSpan;
		                DebugPrint($"[GRID FILTRO] Consolidacao | ADX={adx:F1} ATR={atrTk:F1}tk GridSpan={gridSpan}tk | pass={adxOK && rangeOK}");
		                return adxOK && rangeOK;
		            }
		        }
		        #endregion
		
		
		        #region Grid: ProcessGridSideAsync (backtest / replay / strategy analyzer)
				
				private async Task ProcessGridSideAsync(int direction)
				{
				    bool armed      = direction == 1 ? gridArmedBuy      : gridArmedSell;
				    bool hasOpenPos = direction == 1 ? gridHasOpenPosBuy : gridHasOpenPosSell;
				    bool needsRearm = direction == 1 ? gridNeedsRearmBuy : gridNeedsRearmSell;
				    string side     = direction == 1 ? "BUY" : "SELL";
				
				    // -- Bloco 1: estado inconsistente ------------------------------------
				    if (armed && !HasPendingGridOrders(direction) && !hasOpenPos && Position.MarketPosition == MarketPosition.Flat)
				    {
				        DebugPrint($"[GRID ASYNC] ⚠ {side} armado sem ordens ativas. Resetando.");
				        if (direction == 1) { gridArmedBuy = false; gridOrdersBuy.Clear(); }
				        else               { gridArmedSell = false; gridOrdersSell.Clear(); }
				        armed = false;
				    }
				
				    // -- Bloco 1.5: FVG — reposicionar a cada barra ou expirar ----------
				    if (FVG_Active && armed && !hasOpenPos && Position.MarketPosition == MarketPosition.Flat)
				    {
				        if (!CheckFVGFilter(direction))
				        {
				            DebugPrint($"[GRID+FVG] {side} FVG preenchido/expirado — cancelando e desarmando.");
				            await CancelGridOrdersAsync(direction);
				            return;
				        }
				
				        if (HasPendingGridOrders(direction))
				        {
				            DebugPrint($"[GRID+FVG] {side} FVG aberto — reposicionando ordens no preço atual.");
				            await CancelGridOrdersAsync(direction);
				            if (direction == 1) { gridArmedBuy = false; gridFirstOrderBuy = null; }
				            else               { gridArmedSell = false; gridFirstOrderSell = null; }
				            armed = false;
				        }
				    }
				
				    // -- Bloco 1.6: expiração universal por barras (CancelAfterBars) -----
				    if (CancelAfterBars > 0 && armed && !hasOpenPos && Position.MarketPosition == MarketPosition.Flat)
				    {
				        int createdBar = direction == 1 ? gridCreatedBarBuy : gridCreatedBarSell;
				        if (createdBar >= 0 && (CurrentBar - createdBar) >= CancelAfterBars)
				        {
				            DebugPrint($"[EXPIRA] {side} grid cancelado após {CancelAfterBars} barras.");
				            await CancelGridOrdersAsync(direction);
				            return;
				        }
				    }
				
				    // -- Bloco 2: ordens parciais -----------------------------------------
				    if (armed && Position.MarketPosition == MarketPosition.Flat)
				    {
				        int _pending = CountPendingGridOrders(direction);
				        if (hasOpenPos && _pending > 0 && _pending < Grid_OrderCount)
				        {
				            DebugPrint($"[GRID ASYNC] ⚠ {side}: {_pending}/{Grid_OrderCount} pendentes sem posição. Cancelando...");
				            CancelGridOrdersSync(direction);
				            if (direction == 1) { gridNeedsRearmBuy = true; gridHasOpenPosBuy = false; }
				            else               { gridNeedsRearmSell = true; gridHasOpenPosSell = false; }
				            IncrementarQuantOperacoes();
				            armed = false;
				        }
				        else if (hasOpenPos && _pending == Grid_OrderCount)
				        {
				            DebugPrint($"[GRID ASYNC] ⚠ Estado inconsistente {side}: resetando flag hasOpenPos.");
				            if (direction == 1) gridHasOpenPosBuy = false;
				            else               gridHasOpenPosSell = false;
				            hasOpenPos = false;
				        }
				    }
				
				    // -- Bloco 3: rearmar após TP/SL -------------------------------------
				    if (needsRearm)
				    {
				        if (HasPendingGridOrders(direction))
				            await CancelGridOrdersAsync(direction);
				        if (direction == 1) gridNeedsRearmBuy = false;
				        else               gridNeedsRearmSell = false;
				        armed = false;
				        if (Grid_RearmSameBar) lastProcessedBarGrid = -1;
				    }
				
				    // -- Bloco 4: gatilho de entrada -------------------------------------
				    if (!armed && QuantOperacoes < MaxOrderSession)
				    {
				        if (HasAccountPositionOrOrders())
				        {
				            DebugPrint($"[GRID ASYNC] ⚠ Conta já tem posição/ordem em {Instrument.FullName}. Bloqueando {side}.");
				            return;
				        }
				
				        // BUG FIX: separar guards de Automático e Importar
				        if (TS_Mode == tsMode.Automatico && isLiveTrading && !CheckTimeSlotFilter())
				        {
				            DebugPrint($"[TS] Grid ASYNC bloqueado — faixa fora do critério (Automático)");
				            return;
				        }
				        if (TS_Mode == tsMode.Importar && _timeSlotCalcDone && !CheckTimeSlotFilter())
				        {
				            DebugPrint($"[TS] Grid ASYNC bloqueado — faixa fora do critério (Importar)");
				            return;
				        }
				
				        bool isAllowed = (direction == 1)
				            ? (currentOperatingMode == OperatingMode.Comprado || currentOperatingMode == OperatingMode.Ambos)
				            : (currentOperatingMode == OperatingMode.Vendido  || currentOperatingMode == OperatingMode.Ambos);
				        if (!isAllowed) return;
				
				        if (FVG_Active && !CheckFVGFilter(direction))
				        {
				            DebugPrint($"[GRID+FVG] {side} bloqueado: sem FVG na direção atual.");
				            return;
				        }
				
				        if (Grid_CandleFilter)
				        {
				            if (direction == 1  && !(Close[1] > Open[1])) return;
				            if (direction == -1 && !(Close[1] < Open[1])) return;
				        }
				
				        bool pass =
				            ((!ACTIVE_Explosion) || (direction == 1 ? FiltroExplosionCompra() : FiltroExplosionVenda()))
				            && (!RenkoForce || CheckForceMovement())
				            && ((!ACTIVE_Pva) || FiltroPVAClimax(direction))
				            && (!HL_Active1 || HL_Prior(direction))
				            && (!MACLOUD1_Filter || CheckMACLOUDFilter(1, direction, Reverse_Mode1, MACLOUD1_BarShift, MACLOUD1_Min, MACLOUD1_Max, autoRangeAvg1))
				            && CheckGridFiltroContexto(direction)
				            && CheckForce2DFilter(direction)
				            && (!OB_Active || OrderBlock1(direction, 1))
				            && (!FVG_Active || CheckFVGFilter(direction))
							&& (!SmaSlope_Active || CheckSmaSlopeFilter(direction))
							&& (!KELTNER_Vol_Active     || CheckKeltnerVolatility())
							&& (!KELTNER_Trigger_Active || CheckKeltnerTrigger(direction))
							&& CheckCandleRangeFilter(1);
				
				
				        if (pass)
				        {
				            if (Grid_CancelDelayMs > 0 && lastCancelTime != DateTime.MinValue)
				            {
				                var elapsed = (DateTime.Now - lastCancelTime).TotalMilliseconds;
				                if (elapsed < Grid_CancelDelayMs)
				                    await Task.Delay((int)(Grid_CancelDelayMs - elapsed));
				            }
				            DebugPrint($"[GRID ASYNC] {side} GATILHO CONFIRMADO — colocando ordens ({OrderMode})");
				            PlaceGrid(direction);
				        }
				    }
				}
	
				
				#endregion
				
				#region Grid: ProcessGridSideSync (backtest / replay / strategy analyzer)
				
				private void ProcessGridSideSync(int direction)
				{
				    bool armed      = direction == 1 ? gridArmedBuy      : gridArmedSell;
				    bool hasOpenPos = direction == 1 ? gridHasOpenPosBuy : gridHasOpenPosSell;
				    bool needsRearm = direction == 1 ? gridNeedsRearmBuy : gridNeedsRearmSell;
				    string side     = direction == 1 ? "BUY" : "SELL";
				
				    // -- Bloco 1: estado inconsistente ------------------------------------
				    if (armed && !HasPendingGridOrders(direction) && !hasOpenPos && Position.MarketPosition == MarketPosition.Flat)
				    {
				        DebugPrint($"[GRID SYNC] ⚠ {side} armado sem ordens ativas. Resetando.");
				        if (direction == 1) { gridArmedBuy = false; gridOrdersBuy.Clear(); }
				        else               { gridArmedSell = false; gridOrdersSell.Clear(); }
				        armed = false;
				    }
				
				    // -- Bloco 1.5: FVG — reposicionar a cada barra ou expirar ----------
				    if (FVG_Active && armed && !hasOpenPos && Position.MarketPosition == MarketPosition.Flat)
				    {
				        if (!CheckFVGFilter(direction))
				        {
				            DebugPrint($"[GRID+FVG] {side} FVG preenchido/expirado — cancelando e desarmando.");
				            CancelGridOrdersSync(direction);
				            return;
				        }
				
				        if (HasPendingGridOrders(direction))
				        {
				            DebugPrint($"[GRID+FVG] {side} FVG aberto — reposicionando ordens no preço atual.");
				            CancelGridOrdersSync(direction);
				            if (direction == 1) { gridArmedBuy = false; gridFirstOrderBuy = null; }
				            else               { gridArmedSell = false; gridFirstOrderSell = null; }
				            armed = false;
				        }
				    }
				
				    // -- Bloco 1.6: expiração universal por barras (CancelAfterBars) -----
				    if (CancelAfterBars > 0 && armed && !hasOpenPos && Position.MarketPosition == MarketPosition.Flat)
				    {
				        int createdBar = direction == 1 ? gridCreatedBarBuy : gridCreatedBarSell;
				        if (createdBar >= 0 && (CurrentBar - createdBar) >= CancelAfterBars)
				        {
				            DebugPrint($"[EXPIRA] {side} grid cancelado após {CancelAfterBars} barras.");
				            CancelGridOrdersSync(direction);
				            return;
				        }
				    }
				
				    // -- Bloco 2: ordens parciais -----------------------------------------
				    if (armed && Position.MarketPosition == MarketPosition.Flat)
				    {
				        int _pending = CountPendingGridOrders(direction);
				        if (hasOpenPos && _pending > 0 && _pending < Grid_OrderCount)
				        {
				            DebugPrint($"[GRID SYNC] ⚠ {side}: {_pending}/{Grid_OrderCount} pendentes sem posição. Cancelando...");
				            CancelGridOrdersSync(direction);
				            if (direction == 1) { gridNeedsRearmBuy = true; gridHasOpenPosBuy = false; }
				            else               { gridNeedsRearmSell = true; gridHasOpenPosSell = false; }
				            IncrementarQuantOperacoes();
				            armed = false;
				        }
				        else if (hasOpenPos && _pending == Grid_OrderCount)
				        {
				            DebugPrint($"[GRID SYNC] ⚠ Estado inconsistente {side}: resetando flag hasOpenPos.");
				            if (direction == 1) gridHasOpenPosBuy = false;
				            else               gridHasOpenPosSell = false;
				            hasOpenPos = false;
				        }
				    }
				
				    // -- Bloco 3: rearmar após TP/SL -------------------------------------
				    if (needsRearm)
				    {
				        if (HasPendingGridOrders(direction))
				            CancelGridOrdersSync(direction);
				        if (direction == 1) gridNeedsRearmBuy = false;
				        else               gridNeedsRearmSell = false;
				        armed = false;
				        if (Grid_RearmSameBar) lastProcessedBarGrid = -1;
				    }
				
				    // -- Bloco 4: gatilho de entrada -------------------------------------
				    if (!armed && QuantOperacoes < MaxOrderSession)
				    {
				        if (HasAccountPositionOrOrders())
				        {
				            DebugPrint($"[GRID SYNC] ⚠ Conta já tem posição/ordem em {Instrument.FullName}. Bloqueando {side}.");
				            return;
				        }
				
				        // BUG FIX: separar guards de Automático e Importar
				        if (TS_Mode == tsMode.Automatico && isLiveTrading && !CheckTimeSlotFilter())
				        {
				            DebugPrint($"[TS] Grid SYNC bloqueado — faixa fora do critério (Automático)");
				            return;
				        }
				        if (TS_Mode == tsMode.Importar && _timeSlotCalcDone && !CheckTimeSlotFilter())
				        {
				            DebugPrint($"[TS] Grid SYNC bloqueado — faixa fora do critério (Importar)");
				            return;
				        }
				
				        bool isAllowed = (direction == 1)
				            ? (currentOperatingMode == OperatingMode.Comprado || currentOperatingMode == OperatingMode.Ambos)
				            : (currentOperatingMode == OperatingMode.Vendido  || currentOperatingMode == OperatingMode.Ambos);
				        if (!isAllowed) return;
				
				        if (FVG_Active && !CheckFVGFilter(direction))
				        {
				            DebugPrint($"[GRID+FVG] {side} bloqueado: sem FVG na direção atual.");
				            return;
				        }
				
				        if (Grid_CandleFilter)
				        {
				            if (direction == 1  && !(Close[1] > Open[1])) return;
				            if (direction == -1 && !(Close[1] < Open[1])) return;
				        }
				
				        bool pass =
				            ((!ACTIVE_Explosion) || (direction == 1 ? FiltroExplosionCompra() : FiltroExplosionVenda()))
				            && (!RenkoForce || CheckForceMovement())
				            && ((!ACTIVE_Pva) || FiltroPVAClimax(direction))
				            && (!HL_Active1 || HL_Prior(direction))
				            && (!MACLOUD1_Filter || CheckMACLOUDFilter(1, direction, Reverse_Mode1, MACLOUD1_BarShift, MACLOUD1_Min, MACLOUD1_Max, autoRangeAvg1))
				            && CheckGridFiltroContexto(direction)
				            && CheckForce2DFilter(direction)
				            && (!OB_Active || OrderBlock1(direction, 1))
				            && (!FVG_Active || CheckFVGFilter(direction))
							&& (!SmaSlope_Active || CheckSmaSlopeFilter(direction))
							&& (!KELTNER_Vol_Active     || CheckKeltnerVolatility())
							&& (!KELTNER_Trigger_Active || CheckKeltnerTrigger(direction))
							&& CheckCandleRangeFilter(1);
				
				        if (pass)
				        {
				            DebugPrint($"[GRID SYNC] {side} GATILHO CONFIRMADO — colocando ordens ({OrderMode})");
				            PlaceGrid(direction);
				        }
				    }
				}
	
				
				
				#endregion
		
		        #region OnOrderUpdate
		        protected override void OnOrderUpdate(Order order, double limitPrice, double stopPrice,
		            int quantity, int filled, double averageFillPrice,
		            OrderState orderState, DateTime time, ErrorCode error, string comment)
		        {
		            if (order == null) return;
					
					// ✅ Ignora ordens de antes da ativação
				    if (!realtimeOrderIds.Contains(order.Id) && orderState == OrderState.Working)
				    {
				        return;
				    }
		            
		            if (orderState == OrderState.Filled || orderState == OrderState.Cancelled || orderState == OrderState.Rejected)
		            {
		                realtimeOrderIds.Remove(order.Id);
		                DebugPrint($"[ORDER] Ordem {order.Id} removida de realtimeOrderIds (estado: {orderState})");
		            }
		            
		            if (isLiveTrading && orderState == OrderState.Working)
		                realtimeOrderIds.Add(order.Id);
		            if (currentEstrategia != estrategiaMode.GridScalper && currentEstrategia != estrategiaMode.FVGScalper) return;
		            if (gridOrdersBuy != null && gridOrdersBuy.Contains(order) && orderState == OrderState.Filled)
		            { gridHasOpenPosBuy = true; _lastGridDirection = 1; DebugPrint($"[GRID] BUY preenchida: {order.Name}"); }
		            if (gridOrdersSell != null && gridOrdersSell.Contains(order) && orderState == OrderState.Filled)
		            { gridHasOpenPosSell = true; _lastGridDirection = -1; DebugPrint($"[GRID] SELL preenchida: {order.Name}"); }
		            if (orderState == OrderState.Filled && order.Name != null &&
		                order.Name.IndexOf("Profit target", StringComparison.OrdinalIgnoreCase) >= 0)
		            {
		                bool isBuy = _lastGridDirection == 1
		                    || (_lastGridDirection == 0 && Position.MarketPosition == MarketPosition.Long);
		                if (isBuy)
		                {
		                    if (HasPendingGridOrders(1))  CancelGridOrdersAsync(1);
		                    gridNeedsRearmBuy  = true;
		                    gridHasOpenPosBuy  = false;
		                    IncrementarQuantOperacoes();
		                    DebugPrint("[GRID] TP BUY! Ops=" + QuantOperacoes + "/" + MaxOrderSession);
		                }
		                else
		                {
		                    if (HasPendingGridOrders(-1)) CancelGridOrdersAsync(-1);
		                    gridNeedsRearmSell = true;
		                    gridHasOpenPosSell = false;
		                    IncrementarQuantOperacoes();
		                    DebugPrint("[GRID] TP SELL! Ops=" + QuantOperacoes + "/" + MaxOrderSession);
		                }
		                _lastGridDirection = 0;
		            }
		            if (orderState == OrderState.Filled && order.Name != null &&
		                order.Name.IndexOf("Stop loss", StringComparison.OrdinalIgnoreCase) >= 0)
		            {
		                if (HasPendingGridOrders(1))  CancelGridOrdersAsync(1);
		                else { gridArmedBuy = false; gridHasOpenPosBuy = false; }
		                if (HasPendingGridOrders(-1)) CancelGridOrdersAsync(-1);
		                else { gridArmedSell = false; gridHasOpenPosSell = false; }
		                gridNeedsRearmBuy  = false;
		                gridNeedsRearmSell = false;
		                _lastGridDirection = 0;
		                IncrementarQuantOperacoes();
		                DebugPrint("[GRID] SL atingido. Ops=" + QuantOperacoes + "/" + MaxOrderSession);
		            }
		        }
		        #endregion
				
				// Atualiza UMA VEZ por execução de ordem
				protected override void OnExecutionUpdate(Execution execution, string executionId,
				    double price, int quantity, MarketPosition marketPosition,
				    string orderId, DateTime time)
				{
				    // ✅ RealizedProfitLoss já é líquido — não subtrair comissão novamente
				    realizadoConta = Account.Get(AccountItem.RealizedProfitLoss, Currency.UsDollar);
				    VerificaMetas();
				}
		
		        #region OnPositionUpdate
		        protected override void OnPositionUpdate(Position position,
		            double averagePrice, int quantity, MarketPosition marketPosition)
		        {
		            if (hasReachedRealtime && !isLiveTrading) return;
		            if (currentEstrategia != estrategiaMode.GridScalper && currentEstrategia != estrategiaMode.FVGScalper) return;
		            if (marketPosition == MarketPosition.Flat) return;
		            if (TP_Ticks <= 0) return;
		            double tpPrice = marketPosition == MarketPosition.Long
		                ? averagePrice + TP_Ticks * TickSize
		                : averagePrice - TP_Ticks * TickSize;
		            tpPrice = Math.Round(tpPrice / TickSize) * TickSize;
		            try
		            {
		                SetProfitTarget("", CalculationMode.Price, tpPrice);
		                DebugPrint($"[GRID] TP atualizado → média={averagePrice:F2} | TP={tpPrice:F2} | qty={quantity}");
		            }
		            catch (Exception ex)
		            {
		                DebugPrint($"[GRID] Erro ao atualizar TP: {ex.Message}");
		            }
		        }
		        #endregion
		
		        protected override void OnStateChange()
		        {
		            base.OnStateChange();
		            if (State == State.SetDefaults)
		            {
		                Description                             = "Scalping de abertura: Order Block, HiLo Prior, Manual Box e Grid Scalper";
		                Name                                    = "VM PLAYBOOK NASDAQ 1.0";
		                Calculate                               = Calculate.OnEachTick;
		                VM_MaxSignalAgeSeconds                  = 60;
		                VM_MonitorarEncerramentoPainel          = true;
		                EntriesPerDirection                     = 20;
		                EntryHandling                           = EntryHandling.AllEntries;
		                IsExitOnSessionCloseStrategy            = true;
		                ExitOnSessionCloseSeconds               = 30;
		                IsFillLimitOnTouch                      = false;
		                MaximumBarsLookBack                     = MaximumBarsLookBack.TwoHundredFiftySix;
		                OrderFillResolution                     = OrderFillResolution.Standard;
		                Slippage                                = 5;
		                TimeInForce                             = TimeInForce.Day;
		                TraceOrders                             = true;
						StartBehavior 							= StartBehavior.WaitUntilFlatSynchronizeAccount;
		                RealtimeErrorHandling                   = RealtimeErrorHandling.IgnoreAllErrors;
		                StopTargetHandling                      = StopTargetHandling.PerEntryExecution;
		                BarsRequiredToTrade                     = 100;
						Grid_CancelDelayMs = 5;
		                AddPlot(Brushes.Transparent, "Plot");
		                IsInstantiatedOnEachOptimizationIteration = true;
		                SL_Ticks = 180; TP_Ticks = 180; LOTE_Size = 2;
		                TIME_Start  = DateTime.Parse("10:30", System.Globalization.CultureInfo.InvariantCulture);
		                TIME_Stop   = DateTime.Parse("10:45", System.Globalization.CultureInfo.InvariantCulture);
		                Second_Start = 1; IDAssinatura = "0000";
		                Janela2Ativa = false;
		                TIME_Start2 = DateTime.Parse("14:00", System.Globalization.CultureInfo.InvariantCulture);
		                TIME_Stop2  = DateTime.Parse("15:00", System.Globalization.CultureInfo.InvariantCulture);
		                MaxOrderSession = 3; QuantOperacoes = 0; distancePrice = 10;
		                NomeEstrategia = "MNQ PLAYBOOK NQ";
						VM_PainelId = "";
						VM_StrategyId = "";
						AI_PromptId = "";
						UseAIFilter = false;
						MinAIConfidence = 80;
						ContratoOrigem = contratoOrigem.Robo;
						ContratoFatorMult = 1.0;
						StopLossOrigem = sltpOrigem.Painel;
						TakeProfitOrigem = sltpOrigem.Painel;
						SendSignalsToIndicator = false;
						RenkoForce = false;
						TimePeriodSeconds = 30;
						CandleThreshold = 4;
						ACTIVE_Pva  = false; PVA_SumBars = 10; PVA_Percent = 200;
						ACTIVE_Explosion  = false; EXPLOSION_Sensitivity = 150; EXPLOSION_FastPeriod = 10; EXPLOSION_SlowPeriod = 30; EXPLOSION_FastSmooth = true; EXPLOSION_FastSmoothLength = 9; EXPLOSION_SlowSmooth = true; EXPLOSION_SlowSmoothLength = 9; EXPLOSION_ChannelLength = 30; EXPLOSION_Mult = 2.0;
		                OB_Active = false;
		                OB_Limit_Max1 = 40; OB_Limit_Min1 = 0; OB_Range_MinSize1 = 200; OB_Range_MaxSize1 = 99999;
		                OB_CandleHistory1 = 25; OB_PULLBACK1 = false; OB_BREAKOUT1 = true; OB_Revert_Analysis1 = false;
		                MoneyClosed = false; LossesAllOrders = 300; ProfitAllOrders = 150;
		                DailyLossActive = false; DailyLossLimit = 300;
		                DailyProfitActive = false; DailyProfitLimit = 150;
		                OrderCloseMA = false; ProfitCloseMA = 50; ProfitCloseMAPeriod = 21;
		                currentOperatingMode = OperatingMode.Ambos;
		                currentEstrategia    = estrategiaMode.PlaybookNasdaq;
		                OrderMode            = orderMode.PendenteLimit;
		                CancelOrdersAfterStopTime = true; CancelAfterBars = 10;
		                sellOrder = null; buyOrder = null; sellStopOrder = null; buyStopOrder = null;
		                buyStopOrderSent = false;
		                TRAIL_MODE = false; trailStopPrice = 0.0; trailStepCount = 0;
		                TRAIL_Start = 50; TRAIL_StopDistance = 20; TRAIL_Step = 10;
		                Box_ticks = 200; Box_string = "BOXTF";
						HL_Active1 = false; HL_FilterType = HL_ModeType.HL; HL_Limit_Max1 = 100; HL_Limit_Min1 = 0; HL_Range_MinSize1 = 0;
						HL_Range_MaxSize1 = 99999;
						HL_PULLBACK1 = true;
						HL_BREAKOUT1 = false;
						SessaoHILO_Start          = DateTime.Parse("10:30", System.Globalization.CultureInfo.InvariantCulture);
						SessaoHILO_End            = DateTime.Parse("10:45", System.Globalization.CultureInfo.InvariantCulture);
						SessaoHILO_Gatilho        = SessaoHiloGatilhoMode.Toque;
						SessaoHILO_RangeMinTicks  = 10;
						SessaoHILO_RangeMaxTicks  = 200;
						SessaoHILO_ToleranciaTicks = 2;
						SessaoHILO_DrawLevels     = true;
						MACLOUD1_Filter = false; MACLOUD1_Max = 9999999; MACLOUD1_Min = 0;
		                MACLOUD1_FastPeriod = 9; MACLOUD1_SlowPeriod = 21;
		                Reverse_Mode1 = false; autoRangeAvg1 = false; MACLOUD1_BarShift = 1;
		                Grid_OrderCount        = 1;
		                Grid_Spacing           = 20;
		                Grid_SpacingMultiplier = 1.0;
		                Grid_LotMultiplier     = 1.0;
		                Grid_RearmSameBar      = false;
		                Grid_FiltroContexto    = gridFiltroMode.OFF;
		                Grid_CandleFilter      = false;
		                FVG_Active         = false;
		                FVG_MinimumTicks   = 4;
		                FVG_MaxBars        = 20;
		                FVG_DrawZones      = false;
		                Panel_Main_X = 5;  Panel_Main_Y = 5;
		                Panel_F2D_X  = 5;  Panel_F2D_Y  = 390;
		                Panel_Main_Show = true;
		                Panel_F2D_Show  = true;
		                Force2D_Mode           = force2DMode.OFF;
		                Force2D_MinPercent     = 70.0;
		                Force2D_MaxPercent     = 100.0;
		                Force2D_IncrementBars  = 10;
		                Force2D_IncrementMin   = 20.0;
						Force2D_BacktestMode   = false;
		                DebugMode = false;
												
						// ── KELTNER CHANNEL ──
						KELTNER_EmaPeriod                   = 20;
						KELTNER_AtrPeriod                   = 20;
						KELTNER_Mult                        = 2.0;
						KELTNER_Vol_Active                  = false;
						KELTNER_Vol_Width_Min               = 10;
						KELTNER_Vol_Width_Max               = 500;
						KELTNER_Trigger_Active              = false;
						KELTNER_Trigger_Mode                = KeltnerTriggerMode.Central;
						KELTNER_Trigger_Reverse             = false;
						KELTNER_Trigger_Tolerance           = 2;
						KELTNER_Trigger_RequirePullback     = false;
						KELTNER_Trigger_PullbackLookback    = 10;
						
										
						// Time Slot Performance
						TS_Mode                = tsMode.Manual;
						TS_MinWinRate          = 55.0;
						TS_MinTrades           = 5;
						TS_MinNetProfitPercent = 10.0;  // ✅ NOVO: padrão 10%
						TS_BlockIfNoData       = false;
						TS_ShowPanel           = true;
						TS_Panel_X             = 260;
						TS_Panel_Y             = 5;
						TS_ImportFileName  	   = "MNQSet004";
						TS_AutoExport          = false;
						TS_ExportFileName      = "MQNSet004";
						
						SmaSlope_Period 	   = 8;
						SmaSlope_RefBars 	   = 1;
						SmaSlope_Active 	   = false;
						SmaSlope_BarsShift     = 0;
						SmaSlope_Min 		   = 0 ;
						SmaSlope_Max 		   = 0 ;
						SmaSlope_InvertLogic   = false;
						UseAIFilter = false;       // Desativado por padrão para segurança
						MinAIConfidence = 70;      // Exige pelo menos "ALTA" (85) ou um valor customizado

						// ── 26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES) ──
						PB_PerfilAtivo               = PlaybookAtivoMode.AutoDetectar;
						PB_InstanceId                = "painel_principal_web";
						PB_AutoDST_EUA               = true;
						PB_HoraAberturaManual        = DateTime.Parse("11:30", System.Globalization.CultureInfo.InvariantCulture);
						PB_HoraAsiaManual            = DateTime.Parse("20:00", System.Globalization.CultureInfo.InvariantCulture);
						PB_DesenharNiveisOR15        = true;
						PB_OperarAberturaT0          = true;
						PB_T0_ModoGestao             = PlaybookT0Mode.Auto_ConformeAtivo;
						PB_T0_CustomTpTicks          = 28;
						PB_T0_CustomSlTicks          = 28;
						PB_T0_CustomMaxMinutos       = 60;
						PB_T0_ForcaMinCompra         = 52.0;
						PB_T0_ForcaMaxVenda          = 48.0;
						PB_OperarConfirmacaoM5       = true;
						PB_M5_ApenasSeT0NaoEntrou    = true;
						PB_M5_ModoGestao             = PlaybookM5Mode.Auto_ConformeAtivo;
						PB_M5_ForcaFinalCompra       = 55.0;
						PB_M5_ForcaTechCompra        = 52.0;
						PB_M5_ForcaFinalVenda        = 45.0;
						PB_M5_ForcaTechVenda         = 48.0;
						PB_M5_TpPontos               = 110.0;
						PB_M5_SlPontos               = 75.0;
						PB_M5_TpTicks                = 0;
						PB_M5_SlTicks                = 0;
						PB_M5_DuracaoMaxMinutos      = 55;
						PB_OperarOR15_Reversao       = true;
						PB_OperarOR15_Breakout       = true;
						PB_OR15_ModoGestao           = PlaybookOR15GestaoMode.Parcial25_BE_Final50_Stop25;
						PB_OR15_ForcaBreakoutMin     = 55.0;
						PB_OR15_ReversaoMinRangePts  = 0.0; // 0 = Auto conforme ativo (15 pts no ES / 60 pts no NQ)
						PB_OR15_CaixaComprimidaMaxPts = 0.0; // 0 = Auto conforme ativo (20 pts no ES / 120 pts no NQ)
						PB_OR15_CaixaExplosivaMinPts = 0.0; // 0 = Auto conforme ativo (30 pts no ES / 180 pts no NQ)
						PB_OR15_BreakoutQualquerCaixa = false;
						PB_OR15_JanelaMaxMinutos     = 120;
						
		                if (LOTE_Size <= 0)
		                {
		                    DebugPrint("[ERRO] LOTE_Size deve ser > 0");
		                    isValid = false;
		                }
		                
		                if (TRAIL_MODE && TRAIL_Start < TRAIL_StopDistance)
		                {
		                    DebugPrint("[ERRO] TRAIL_Start deve ser maior que TRAIL_StopDistance");
		                    isValid = false;
		                }
		                
		                if (TP_Ticks + SL_Ticks == 0 && !TRAIL_MODE)
		                {
		                    DebugPrint("[ERRO] TP_Ticks + SL_Ticks deve ser > 0 ou TRAIL_MODE deve estar ativo");
		                    isValid = false;
		                }
		            }
		            else if (State == State.Configure)
					{
					    allowTrading  = false;
					    activationBar = -1;
					
					    RemoveButton(); RemoverRetanguloComTag(Box_string); ClearOutputWindow();
					    candleTimes = new Queue<DateTime>();
					
					    
						
						bool ehGrid    = (currentEstrategia == estrategiaMode.GridScalper);
					    bool ehFVGGrid = (currentEstrategia == estrategiaMode.FVGScalper);
					    bool ehAmbos   = (currentOperatingMode == OperatingMode.Ambos);
					    bool pendente  = (OrderMode == orderMode.PendenteStop || OrderMode == orderMode.PendenteLimit);
					
					    if (ehGrid && OrderMode == orderMode.Mercado)
					    {
					        ShowPopup("CONFIGURAÇÃO NÃO PERMITIDA",
					            "A estratégia GridScalper requer ordens PENDENTES.\n" +
					            "Altere 'Modo Ordens' para 'PendenteStop' ou 'PendenteLimit'.");
					        isValid = false;
					    }
					    if (ehGrid || (ehFVGGrid && OrderMode != orderMode.Mercado))
					    {
					        EntriesPerDirection = Math.Max(Grid_OrderCount, 2);
					        DebugPrint($"[{(ehGrid ? "GRID" : "FVG SCALPER")}] EntriesPerDirection ajustado para {EntriesPerDirection}");
					    }
					
					    // ✅ TRAIL STOP NATIVO ON EACH TICK:
					    // O robô opera com Calculate = Calculate.OnEachTick. O TrailStop roda diretamente
					    // a cada tick de mercado no BarsInProgress == 0, eliminando a DataSeries de 1s
					    // que travava o carregamento histórico (milhões de barras) e impedia alteração de stop.
					    TrailSeries1s_Index = -1;
					
					    // Força 2D (igual ao original, mas os índices agora somam +1 se TRAIL_MODE ativo)
					    if (Force2D_Mode != force2DMode.OFF)
					    {
					        AddDataSeries(BarsPeriodType.Minute, 240);
					        AddDataSeries(BarsPeriodType.Day,    1);
					        AddDataSeries(BarsPeriodType.Minute, 30);
					        AddDataSeries(BarsPeriodType.Minute, 5);
							_force2DSeriesStart = BarsArray?.Length - 4 ?? -1; 
					        DebugPrint($"[FORÇA 2D] DataSeries carregadas — " +
					            $"H4={_force2DSeriesStart} D1={_force2DSeriesStart+1} " +
					            $"M30={_force2DSeriesStart+2} M5={_force2DSeriesStart+3}");
					    }
					    else
					    {
					        _force2DSeriesStart = -1;
					    }
						
						// No final do bloco State.Configure (após as DataSeries):
						if (TS_Mode == tsMode.Importar)
						{
						    // Carrega na inicialização — não precisa aguardar dados históricos
						    ImportarHorarios(TS_ImportFileName);
						    DebugPrint($"[HORÁRIOS] Modo Importar ativo → arquivo: {TS_ImportFileName}.txt");
						}
					}
		            else if (State == State.DataLoaded)
		            {
		                // ── Validação de licença (Modo Assinatura Fixado) ──────────────────────────
		                metodovalidar = "assinatura";
		                if (LerCacheLicenca()) { isValid = true; DebugPrint("[VM BOT LICENÇA] ✅ Cache válido."); }
		                else
		                {
		                    ValidarAssinatura();
		                    if (isValid) { SalvarCacheLicenca(); DebugPrint("[VM BOT LICENÇA] ✅ Validação remota OK."); }
		                }
						
						if (Instrument != null && Instrument.MasterInstrument != null)
						{
						    referenceSymbol = Instrument.MasterInstrument.Name.ToUpper();
						    DebugPrint($"[VM SÍMBOLO] 📊 Ativo do gráfico detectado automaticamente: {referenceSymbol}");
						}

						robotActivationTime = DateTime.MinValue;
						if (MACLOUD1_Filter) { SMA_CLOUD1 = SMA(Close, MACLOUD1_FastPeriod); SMA_CLOUD2 = SMA(Close, MACLOUD1_SlowPeriod); }
		                if (OrderCloseMA)    SMA_Close = SMA(Close, ProfitCloseMAPeriod);
						if (SmaSlope_Active)
						{
						    _smaSlope = SMA(Close, SmaSlope_Period);
						    DebugPrint("[SMA SLOPE] Indicador inicializado.");
						}
		                if (Grid_FiltroContexto != gridFiltroMode.OFF)
		                {
		                    _gridADX = ADX(9);
		                    _gridATR = ATR(14);
		                    _gridEMA = EMA(Close, 9);
		                }
		                
						if (KELTNER_Vol_Active || KELTNER_Trigger_Active)
						{
							_keltner = KeltnerChannel(Close, KELTNER_Mult, KELTNER_EmaPeriod);
							DebugPrint($"[KELTNER] Inicializado — EMA={KELTNER_EmaPeriod} ATR={KELTNER_AtrPeriod} Mult={KELTNER_Mult}");
						}
						
						if (HL_Active1)
						{
						    PriorDayOHLC1 = PriorDayOHLC(BarsArray[0]);
						    DebugPrint($"[HL/HLCA] Indicador PriorDayOHLC inicializado. Modo: {HL_FilterType}");
						}
		                lastSessionDate   = DateTime.MinValue;
		                dailySessionDate  = DateTime.MinValue;
		                dailyLimitReached = false;
		                candleTimes       = new Queue<DateTime>();
		                gridOrdersBuy  = new List<Order>(); gridOrdersSell = new List<Order>();
		                gridGeneration = 0;
		                gridArmedBuy   = false; gridArmedSell   = false;
		                gridHasOpenPosBuy = false; gridHasOpenPosSell = false;
		                gridNeedsRearmBuy = false; gridNeedsRearmSell = false;
		                gridFirstOrderBuy = null; gridFirstOrderSell = null;
		                gridCreatedBarBuy = -1; gridCreatedBarSell = -1;
		                lastProcessedBarGrid = -1; lastEntryPrice = 0;
		                realtimeOrderIds = new HashSet<long>();
		                _lastGridDirection = 0;
		                Reset1();
		                if (Force2D_Mode != force2DMode.OFF)
		                {
		                    _force2DUpSeries = new Series<double>(this, MaximumBarsLookBack.TwoHundredFiftySix);
		                    DebugPrint($"[FORÇA 2D] Série de histórico inicializada (modo: {Force2D_Mode}).");
		                }
		                else
		                {
		                    _force2DUpSeries = null;
		                }
						
						// ✅ FIX 1: Popula painel imediatamente (funciona mesmo sem ticks)
						PopulateInitialPanelContent();
						
						// Inicializa Conector VM ou Conector Local se for a estratégia selecionada
			            if (currentEstrategia == estrategiaMode.ConectorVM || currentEstrategia == estrategiaMode.ConectorLocal)
			            {
			                InitializeConectorVM();
			            }
			            if (currentEstrategia == estrategiaMode.PlaybookNasdaq)
			            {
			                InitializePlaybookNasdaq();
			            }
						
		            }
		            else if (State == State.Realtime)
					{
					    isLiveTrading = true;
					    hasReachedRealtime = true;
					    robotActivationTime = DateTime.MinValue;
					    
					    // ✅ Resetar variáveis de ativação
					    allowTrading = false;
					    activationBar = -1;
					    DebugPrint($"[REALTIME] 🟢 Estado Realtime iniciado | allowTrading=FALSE | activationBar=-1");
					    
					    // ✅ Reset do estado do Grid
					    gridArmedBuy      = false;
					    gridArmedSell     = false;
					    gridHasOpenPosBuy  = false;
					    gridHasOpenPosSell = false;
					    gridNeedsRearmBuy  = false;
					    gridNeedsRearmSell = false;
					    gridFirstOrderBuy  = null;
					    gridFirstOrderSell = null;
					    realtimeOrderIds   = new HashSet<long>();
					    lastProcessedBarGrid = -1;
					    DebugPrint("[REALTIME] Estado do Grid resetado.");
					    
					    // ✅ CORREÇÃO CRÍTICA: MODO IMPORTAR
					    if (TS_Mode == tsMode.Automatico)
					    {
					        _timeSlotCalcDone  = false;
					        _ultimoSlotExibido = -1;
					        _lastTSPanelUpdate = DateTime.MinValue;
					        DebugPrint("[REALTIME] 🔄 Calculando TimeSlot com histórico completo...");
					        CalcTimeSlotPerformance();
					        UpdateTimeSlotPanel();
					    }
					    else if (TS_Mode == tsMode.Importar)
					    {
					        // ✅ MODO IMPORTAR: Forçar recarga e atualização IMEDIATA
					        _timeSlotCalcDone  = false;  // ← ZERA primeiro
					        _ultimoSlotExibido = -1;
					        _lastTSPanelUpdate = DateTime.MinValue;
					        
					        DebugPrint($"[HORÁRIOS] 🔄 Importando arquivo: {TS_ImportFileName}.txt");
					        ImportarHorarios(TS_ImportFileName);  // ← Isso seta _timeSlotCalcDone = true
					        
					        // ✅ DEBUG: Verificar se importou corretamente
					        DebugPrint($"[HORÁRIOS] 📊 Após import: _timeSlotCalcDone={_timeSlotCalcDone} | Slots={_timeSlotStats.Count}");
					        
					        // ✅ Forçar atualização mesmo com throttle
					        if (_timeSlotCalcDone && _timeSlotStats.Count > 0)
					        {
					            DebugPrint($"[HORÁRIOS] ✅ Atualizando painel com {_timeSlotStats.Count} slots...");
					            UpdateTimeSlotPanel();
					        }
					        else
					        {
					            DebugPrint($"[HORÁRIOS] ⚠️ NENHUM slot carregado ou _timeSlotCalcDone=false");
					        }
					    }
						// ✅ FIX 1: Garante que painel exibe dados atualizados ao entrar em Realtime
						PopulateInitialPanelContent();
					}
					
					if (State == State.Terminated || State == State.Finalized)
					{
					    // Encerra polling do Conector VM e Playbook Nasdaq
				        StopVMPolling();
				        StopPlaybookNasdaqPolling();
						
						isLiveTrading = false;
					    CancelPendingOrders();
					    
					    try { if (sellStopOrder != null && (!hasReachedRealtime || realtimeOrderIds.Contains(sellStopOrder.Id))) { CancelOrder(sellStopOrder); sellStopOrder = null; } } catch { }
					    try { if (buyStopOrder  != null && (!hasReachedRealtime || realtimeOrderIds.Contains(buyStopOrder.Id)))  { CancelOrder(buyStopOrder);  buyStopOrder  = null; } } catch { }
					    try { CancelAllGridOrders(); } catch { }
					
					    // ✅ FIX 2: Remoção síncrona na thread UI para eliminar painéis residuais
						try
						{
						    // Captura referências antes de qualquer nullificação
						    var borderMain = _mainBorder;
						    var borderF2d  = _f2dBorder;
						    var borderTs   = _tsBorder;
						    var cachedGrid = _cachedChartGrid;
						    var btn        = chartButton;
						
						    Action removeAction = () =>
						    {
						        try
						        {
						            // 1. Remove via grid cacheado
						            if (cachedGrid != null)
						            {
						                if (borderMain != null && cachedGrid.Children.Contains(borderMain))
						                    cachedGrid.Children.Remove(borderMain);
						                if (borderF2d != null && cachedGrid.Children.Contains(borderF2d))
						                    cachedGrid.Children.Remove(borderF2d);
						                if (borderTs != null && cachedGrid.Children.Contains(borderTs))
						                    cachedGrid.Children.Remove(borderTs);
						            }
						
						            // 2. Fallback: grid atual caso cache seja diferente
						            var fallbackGrid = GetChartSpecificGrid();
						            if (fallbackGrid != null && fallbackGrid != cachedGrid)
						            {
						                if (borderMain != null && fallbackGrid.Children.Contains(borderMain))
						                    fallbackGrid.Children.Remove(borderMain);
						                if (borderF2d != null && fallbackGrid.Children.Contains(borderF2d))
						                    fallbackGrid.Children.Remove(borderF2d);
						                if (borderTs != null && fallbackGrid.Children.Contains(borderTs))
						                    fallbackGrid.Children.Remove(borderTs);
						            }
						
						            // 3. Botão Manual Box
						            if (btn != null)
						            {
						                var cw = Window.GetWindow(ChartControl) as Chart;
						                if (cw?.Content is System.Windows.Controls.Grid gBtn && gBtn.Children.Contains(btn))
						                    gBtn.Children.Remove(btn);
						                btn.Click -= OnChartButtonClick;
						            }
						        }
						        catch (Exception ex) { if (DebugMode) Print($"[ERRO] Cleanup UI thread: {ex.Message}"); }
						    };
						
						    // ✅ CRÍTICO: executa na thread UI de forma SÍNCRONA (Invoke, não InvokeAsync)
						    // Isso garante que os elementos são removidos ANTES de nullificar as referências
						    if (ChartControl?.Dispatcher != null)
						        ChartControl.Dispatcher.Invoke(removeAction);
						    else
						        removeAction();
						}
						catch (Exception ex) { DebugPrint($"[ERRO] Cleanup Paineis: {ex.Message}"); }
						finally
						{
						    // Nullifica APÓS remoção confirmada na UI thread
						    _mainBorder      = null;
						    _f2dBorder       = null;
						    _tsBorder        = null;
						    _tsStack         = null;
						    _cachedChartGrid = null;
						    chartButton      = null;
						    RemoveTimeSlotPanel();
						}
					}
		        }
				
				// =====================================================================
				// TRAIL STOP — Processamento via DataSeries de 1 segundo
				// Funciona no Strategy Analyzer, Backtest, Replay e Live Trading.
				// =====================================================================
				// =====================================================================
				// TRAIL STOP NATIVO — Processamento OnEachTick (SEM DataSeries de 1s)
				// Funciona instantaneamente no Strategy Analyzer, Backtest, Replay e Live Trading.
				// =====================================================================
				private void ProcessTrailStop()
				{
				    if (!TRAIL_MODE) return;

				    // ✅ 1. Sem posição aberta = reset de estado
				    if (Position.MarketPosition == MarketPosition.Flat)
				    {
				        if (breakEvenTriggered)
				        {
				            breakEvenTriggered = false; 
				            trailStopPrice = 0.0; 
				            trailStepCount = 0;
				            DebugPrint("[TRAIL] Reset defensivo — posição flat.");
				        }
				        return;
				    }
				    
				    if (CurrentBar < 0) return;
				
				    // ✅ 2. Preço atual confiável: Bid/Ask em tempo real, ou Close[0] em backtest/analyzer
				    double currentPrice = Position.MarketPosition == MarketPosition.Long ? GetCurrentBid() : GetCurrentAsk();
				    if (currentPrice <= 0 && CurrentBar >= 0) currentPrice = Close[0];
				    if (currentPrice <= 0) return;

				    double profitTicks = Position.GetUnrealizedProfitLoss(PerformanceUnit.Ticks, currentPrice);
				    
				    if (!breakEvenTriggered && profitTicks < TRAIL_Start)
				    {
				        return;  // ✅ Sai imediatamente se não atingiu o lucro de ativação
				    }
				
				    int minTicks = GetMinStopTicksForInstrument();
				    double newStop = 0.0;
				
				    // FASE 1: Ativação inicial do TrailStop (ao atingir TRAIL_Start)
				    if (!breakEvenTriggered && profitTicks >= TRAIL_Start)
				    {
				        if (Position.MarketPosition == MarketPosition.Long)
				        {
				            newStop = Math.Round((currentPrice - TRAIL_StopDistance * TickSize) / TickSize) * TickSize;
				            if (newStop < currentPrice && newStop > 0)
				            {
				                if (SetStopLossSafe("", CalculationMode.Price, newStop, false))
				                {
				                    breakEvenTriggered = true;
				                    trailStepCount = 0;
				                    trailStopPrice = newStop;
				                    DebugPrint($"[TRAIL] ✅ ATIVADO Long | Stop={newStop:F2} | Lucro={profitTicks:F1} ticks");
				                }
				                else
				                {
				                    int safeTicks = Math.Max(TRAIL_StopDistance, minTicks);
				                    if (SetStopLossSafe("", CalculationMode.Ticks, safeTicks, false))
				                    {
				                        breakEvenTriggered = true;
				                        trailStepCount = 0;
				                        trailStopPrice = currentPrice - safeTicks * TickSize;
				                        DebugPrint($"[TRAIL] ✅ ATIVADO Long (fallback ticks) | {safeTicks} ticks");
				                    }
				                }
				            }
				        }
				        else if (Position.MarketPosition == MarketPosition.Short)
				        {
				            newStop = Math.Round((currentPrice + TRAIL_StopDistance * TickSize) / TickSize) * TickSize;
				            if (newStop > currentPrice)
				            {
				                if (SetStopLossSafe("", CalculationMode.Price, newStop, false))
				                {
				                    breakEvenTriggered = true;
				                    trailStepCount = 0;
				                    trailStopPrice = newStop;
				                    DebugPrint($"[TRAIL] ✅ ATIVADO Short | Stop={newStop:F2} | Lucro={profitTicks:F1} ticks");
				                }
				                else
				                {
				                    int safeTicks = Math.Max(TRAIL_StopDistance, minTicks);
				                    if (SetStopLossSafe("", CalculationMode.Ticks, safeTicks, false))
				                    {
				                        breakEvenTriggered = true;
				                        trailStepCount = 0;
				                        trailStopPrice = currentPrice + safeTicks * TickSize;
				                        DebugPrint($"[TRAIL] ✅ ATIVADO Short (fallback ticks) | {safeTicks} ticks");
				                    }
				                }
				            }
				        }
				        return;
				    }
				
				    // FASE 2: Degraus subsequentes (TRAIL_Step)
				    if (!breakEvenTriggered || profitTicks < TRAIL_Start || TRAIL_Step <= 0) return;
				
				    int stepsEarned = (int)((profitTicks - TRAIL_Start) / TRAIL_Step);
				    if (stepsEarned <= trailStepCount) return;
				
				    int stepsDelta = stepsEarned - trailStepCount;
				    double stepValue = stepsDelta * (TRAIL_Step * TickSize);
				
				    if (Position.MarketPosition == MarketPosition.Long)
				    {
				        newStop = trailStopPrice + stepValue;
				        if (newStop >= currentPrice - TickSize) 
				            newStop = currentPrice - TickSize;

				        newStop = Math.Round(newStop / TickSize) * TickSize;

				        if (newStop > trailStopPrice)
				        {
				            if (SetStopLossSafe("", CalculationMode.Price, newStop, false))
				            {
				                DebugPrint($"[TRAIL] 📈 Step Long {trailStepCount} → {stepsEarned} | Stop={trailStopPrice:F2} → {newStop:F2}");
				                trailStepCount = stepsEarned;
				                trailStopPrice = newStop;
				            }
				        }
				    }
				    else if (Position.MarketPosition == MarketPosition.Short)
				    {
				        newStop = trailStopPrice - stepValue;
				        if (newStop <= currentPrice + TickSize) 
				            newStop = currentPrice + TickSize;

				        newStop = Math.Round(newStop / TickSize) * TickSize;

				        if (newStop < trailStopPrice)
				        {
				            if (SetStopLossSafe("", CalculationMode.Price, newStop, false))
				            {
				                DebugPrint($"[TRAIL] 📉 Step Short {trailStepCount} → {stepsEarned} | Stop={trailStopPrice:F2} → {newStop:F2}");
				                trailStepCount = stepsEarned;
				                trailStopPrice = newStop;
				            }
				        }
				    }
				}
				
				private void UpdateInfoPanelSmart(double currentPrice)
				{
				    // Throttle diferenciado: Live = rápido (150ms), Backtest = lento (1000ms)
				    int interval = isLiveTrading ? 150 : 1000;
				    if ((DateTime.Now - _lastUIUpdate).TotalMilliseconds < interval) return;
				    
				    // Atualiza variáveis de conteúdo
				    UpdateInfoPanel();
				    UpdateForce2DPanel();  // ✅ Calcula Força 2D
				    
				    // Atualiza UI thread com TODOS os painéis
				    ChartControl?.Dispatcher.InvokeAsync(() =>
				    {
				        try
				        {
				            // Painel Principal
				            if (_tbAccount != null) _tbAccount.Text = _pAccount;
				            if (_tbClock != null) _tbClock.Text = _pClock;
				            if (_tbParams != null) _tbParams.Text = _pParams;
				            if (_tbPnL != null)
				            {
				                _tbPnL.Text = _pPnL;
				                _tbPnL.Foreground = _pPnLBrush;
				            }
				            if (_tbStatus != null)
				            {
				                _tbStatus.Text = _pStatus;
				                _tbStatus.Foreground = _pStatusBrush;
				            }
							if (_tbPerf != null)
						    _tbPerf.Text = $"Barra: {_barTimeMs}ms";
				            
				            // ✅ Painel Força 2D (ADIÇÃO CRÍTICA)
				            if (_f2dBorder != null && _pF2dVisible)
				            {
				                if (_tbF2dBuy != null)
				                {
				                    _tbF2dBuy.Text = _pF2dBuy;
				                    _tbF2dBuy.Foreground = _pF2dBuyBrush;
				                }
				                if (_tbF2dSell != null)
				                {
				                    _tbF2dSell.Text = _pF2dSell;
				                    _tbF2dSell.Foreground = _pF2dSellBrush;
				                }
				                if (_tbF2dMode != null) _tbF2dMode.Text = _pF2dMode;
				                if (_tbF2dSignal != null)
				                {
				                    _tbF2dSignal.Text = _pF2dSignal;
				                    _tbF2dSignal.Foreground = _pF2dSignalBrush;
				                }
				            }
				        }
				        catch (Exception ex)
				        {
				            if (DebugMode) Print($"[UI SMART] Erro: {ex.Message}");
				        }
				    }, System.Windows.Threading.DispatcherPriority.Render);
				    
					// Atualiza painel do Conector VM
				    UpdateConectorVMPanel();
					
				    _lastUIUpdate = DateTime.Now;
				}
		
		        private DateTime currentBrokerTime;
				private int _uiTickCounter = 0;  // ← Contador separado para UI
				private double _currentMarketPrice = 0;
				private double _lastForce2DUp = 50.0;
				
				protected override void OnMarketData(MarketDataEventArgs e)
				{
				    _currentMarketPrice = e.Price;
				    _pClock = $"Horário Corretor: {e.Time:HH:mm:ss}";
					currentBrokerTime = e.Time;
				
				    // Força 2D — refresh tick a tick só em live/replay
				    //if (Force2D_Mode != force2DMode.OFF
				    //    && _force2DSeriesStart >= 0
				    //    && isLiveTrading
				    //    && BarsInProgress == 0)
				    //{
				    //    try   { _lastForce2DUp = CalcForce2D_UpPercent(); }
				    //    catch { }
				    //}
					
					// DEPOIS (substitua por esta):
					if (Force2D_Mode != force2DMode.OFF
					    && _force2DSeriesStart >= 0
					    && isLiveTrading
					    && !Force2D_BacktestMode  // ← NOVA CONDIÇÃO: ignora refresh tick se modo backtest ativo
					    && BarsInProgress == 0)
					{
					    try   { _lastForce2DUp = CalcForce2D_UpPercent(); }
					    catch { }
					}
					
				
				    // UI throttle
				    _uiTickCounter++;
				    if (_uiTickCounter % 10 == 0)
				    {
				        UpdateInfoPanelSmart(e.Price);
				        if (_tbClock != null && ChartControl != null)
				        {
				            ChartControl.Dispatcher.InvokeAsync(() =>
				            {
				                if (_tbClock != null) _tbClock.Text = _pClock;
				            }, System.Windows.Threading.DispatcherPriority.Render);
				        }
				    }
				
				    base.OnMarketData(e);
				}
		        
				protected override void OnBarUpdate()
				{
				    // ==========================================
				    // 1. VALIDAÇÕES INICIAIS (Ultra-rápidas)
				    // ==========================================
				    if (!isValid) return;
					
					// ==========================================
					// 1.1 FORÇAR FECHAMENTO POR CANCELAMENTO/ENCERRAMENTO (VM)
					// Executado IMEDIATAMENTE antes de qualquer outra validação
					// ==========================================
					if (_forceCloseSignal && (currentEstrategia == estrategiaMode.ConectorVM || currentEstrategia == estrategiaMode.ConectorLocal))
					{
					    _forceCloseSignal = false;
					    Print("[VM] 🚨 FECHAMENTO/CANCELAMENTO FORÇADO ACIONADO PELO PAINEL! Encerrando operação...");

					    try { if (buyStopOrder != null) { CancelOrder(buyStopOrder); buyStopOrder = null; } } catch {}
					    try { if (sellStopOrder != null) { CancelOrder(sellStopOrder); sellStopOrder = null; } } catch {}

					    if (Position.MarketPosition == MarketPosition.Long)
					    {
					        Print("[VM] 📉 Executando ExitLong para zerar posição de COMPRA...");
					        try { ExitLong("VM_Close", ""); } catch {}
					        try { ExitLong(Position.Quantity, "VM_Close", "BuyOrder"); } catch {}
					        try { ExitLong(Position.Quantity, "VM_Close", "BuyStopOrder"); } catch {}
					        try { ExitLong(Position.Quantity, "VM_Close", "BuyLimitOrder"); } catch {}
					    }
					    else if (Position.MarketPosition == MarketPosition.Short)
					    {
					        Print("[VM] 📈 Executando ExitShort para zerar posição de VENDA...");
					        try { ExitShort("VM_Close", ""); } catch {}
					        try { ExitShort(Position.Quantity, "VM_Close", "SellOrder"); } catch {}
					        try { ExitShort(Position.Quantity, "VM_Close", "SellStopOrder"); } catch {}
					        try { ExitShort(Position.Quantity, "VM_Close", "SellLimitOrder"); } catch {}
					    }
					    else
					    {
					        Print("[VM] ⚠️ Posição já está Flat.");
					    }

					    // ✅ _lastExecutedSignal NÃO é zerado aqui para manter a exibição do ID no gráfico até a corretora zerar a posição.
					    return;
					}
					
					// Protege contra acesso a BarsArray antes de estar pronto
				    if (BarsArray == null || BarsArray.Length == 0) return;
				    
				    
				    _swBar.Restart();
				    
				    if (BarsInProgress != 0) return;
				    if (CurrentBar < MinBarsRequired()) return;
				    
				    // ✅ TRAIL STOP NATIVO: Executado estritamente em BarsInProgress == 0 a cada tick de mercado
				    if (TRAIL_MODE && Position.MarketPosition != MarketPosition.Flat)
				    {
				        ProcessTrailStop();
				    }
				    
				    if (Force2D_Mode != force2DMode.OFF
				        && _force2DUpSeries != null
				        && _force2DSeriesStart >= 0)
				    {
				        try
				        {
				            double calc         = CalcForce2D_UpPercent();
				            _lastForce2DUp      = calc;
				            _force2DUpSeries[0] = calc;
				        }
				        catch (Exception ex)
				        {
				            if (DebugMode) Print($"[FORÇA 2D] Erro OnBarUpdate: {ex.Message}");
				            _lastForce2DUp      = 50.0;
				            _force2DUpSeries[0] = 50.0;
				        }
				    }
				    
				    if (Bars.IsFirstBarOfSession 
					    && (currentEstrategia == estrategiaMode.GridScalper 
					        || currentEstrategia == estrategiaMode.FVGScalper))
				    {
				        robotTravado      = false;
				        dailyLimitReached = false;
				        realizadoConta    = 0;
				        gridArmedBuy         = false;
				        gridArmedSell        = false;
				        gridHasOpenPosBuy    = false;
				        gridHasOpenPosSell   = false;
				        gridNeedsRearmBuy    = false;
				        gridNeedsRearmSell   = false;
				        lastProcessedBarGrid = -1;
				    }
				    
				    if (robotTravado) return;
					

					
				    // ==========================================
				    // 1.5. RESET NA PRIMEIRA BARRA DA SESSÃO
				    // ==========================================
				    if (Bars.IsFirstBarOfSession)
				    {
				        DebugPrint($"[SESSÃO] 🚩 Primeira barra da sessão detectada | {Time[0]:dd/MM/yyyy HH:mm}");
				        
				        robotTravado = false;
				        dailyLimitReached = false;
				        realizadoConta = 0;
				        
				        gridArmedBuy = false;
				        gridArmedSell = false;
				        gridHasOpenPosBuy = false;
				        gridHasOpenPosSell = false;
				        gridNeedsRearmBuy = false;
				        gridNeedsRearmSell = false;
				        lastProcessedBarGrid = -1;
				        
				        allowTrading = false;
				        activationBar = -1;
				        
				        DebugPrint($"[SESSÃO] ✅ Variáveis de ativação resetadas");
				    }
				    
				    // ==========================================
					// 2. RESET DIÁRIO
					// ==========================================
					_dataHoje = Time[0].Date;
					if (_dataHoje != dailySessionDate.Date)
					{
					    DebugPrint($"[DIÁRIO] Nova data {_dataHoje:dd/MM/yyyy} | Ops anteriores: {QuantOperacoes} | Resetando...");
					    QuantOperacoes = 0;
					    dailySessionDate = _dataHoje;
					    dailyLimitReached = false;
					    breakEvenTriggered = false;
					    trailStopPrice = 0.0;
					    trailStepCount = 0;
					    
					    _ultimoSlotExibido = -1;
					    
					    // ✅ CORREÇÃO CRÍTICA: NÃO zerar no modo Importar
					    if (TS_Mode != tsMode.Importar)
					        _timeSlotCalcDone = false;
					    
					    DebugPrint($"[TRAIL] ↺↺ Reset por nova sessão");
					    
					    if (hasReachedRealtime)
					    {
					        hasReachedRealtime = false;
					        realtimeOrderIds.Clear();
					        DebugPrint($"[REALTIME] Reset de hasReachedRealtime e realtimeOrderIds para nova sessão");
					    }
					    
					    _sessaoHiloHigh = 0.0;
					    _sessaoHiloLow = 0.0;
					    _sessaoHiloCalculada = false;
					    _sessaoHiloRangeValido = false;
					    _sessaoHiloTempHigh = double.MinValue;
					    _sessaoHiloTempLow = double.MaxValue;
					    RemoveDrawObject("SessaoHILO_High");
					    RemoveDrawObject("SessaoHILO_Low");
					    ResetPlaybookNasdaqDailyState(_dataHoje);
					    
					    if (TS_Mode == tsMode.Automatico)
					    {
					        _ultimoSlotExibido = -1;
					        if (!_timeSlotCalcDone)
					        {
					            CalcTimeSlotPerformance();
					            UpdateTimeSlotPanel();
					        }
					        else
					        {
					            UpdateTimeSlotPanel();
					        }
					    }
					    else if (TS_Mode == tsMode.Importar)
					    {
					        // ✅ MODO IMPORTAR: Recarrega o arquivo e mantém _timeSlotCalcDone = true
					        _ultimoSlotExibido = -1;
					        ImportarHorarios(TS_ImportFileName);  // ← RECARGA O ARQUIVO
					        UpdateTimeSlotPanel();                 // ← ATUALIZA O PAINEL
					        DebugPrint($"[HORÁRIOS] ✅ Modo Importar: arquivo recarregado para nova sessão");
					    }
					}
				    
				    // ==========================================
				    // 3. SINCRONIZAR ACTIVATION TIME (se mudou o dia)
				    // ==========================================
				    if (hasReachedRealtime)
				    {
				        if (robotActivationTime.Date != Time[0].Date)
				        {
				            robotActivationTime = Time[0];
				            DebugPrint($"[SISTEMA] Nova sessão. ActivationTime resetado: {robotActivationTime}");
				        }
				        else if (robotActivationTime == DateTime.MinValue)
				        {
				            robotActivationTime = Time[0];
				        }
				    }
				    
				    // Processa cálculo de máxima e mínima da Sessão HILO
				    ProcessSessaoHILOCalculation();
				    
				    // ==========================================
				    // 4. DESENHOS (HLCA e FVG)
				    // ==========================================
				    if (IsFirstTickOfBar)
    				{
						DrawHLCALevels();
						DrawFVGZones();
					}
					
					// Keltner Channel
					if (KELTNER_Vol_Active || KELTNER_Trigger_Active)
					{
					    UpdateKeltnerState();
					}
				    
				    // ==========================================
					// 5. CÁLCULO DE HORÁRIO (UMA VEZ SÓ - REUTILIZAR)
					// ==========================================
					TimeSpan ct;
					bool isPrecoOuBox = (currentEstrategia == estrategiaMode.Preço ||
					                     currentEstrategia == estrategiaMode.ManualBox ||
					                     currentEstrategia == estrategiaMode.SessaoHILO);
					bool isConectorVM = (currentEstrategia == estrategiaMode.ConectorVM ||
					                     currentEstrategia == estrategiaMode.ConectorLocal ||
					                     currentEstrategia == estrategiaMode.PlaybookNasdaq);
					
					if (isPrecoOuBox)
					{
					    DateTime _tempoRef = (currentBrokerTime != DateTime.MinValue)
					        ? currentBrokerTime : Times[0][0];
					    ct = new TimeSpan(_tempoRef.Hour, _tempoRef.Minute, _tempoRef.Second);
					}
					else
					{
					    ct = new TimeSpan(Times[0][0].Hour, Times[0][0].Minute, Times[0][0].Second);
					}
					
					TimeSpan st    = new TimeSpan(TIME_Start.Hour,  TIME_Start.Minute,  TIME_Start.Second);
					TimeSpan sp    = new TimeSpan(TIME_Stop.Hour,   TIME_Stop.Minute,   TIME_Stop.Second);
					TimeSpan stOff = st + TimeSpan.FromSeconds(Second_Start);
					TimeSpan st2   = new TimeSpan(TIME_Start2.Hour, TIME_Start2.Minute, TIME_Start2.Second);
					TimeSpan sp2   = new TimeSpan(TIME_Stop2.Hour,  TIME_Stop2.Minute,  TIME_Stop2.Second);
					
					bool dentroJ1 = (ct >= stOff) && (ct < sp);
					bool dentroJ2 = Janela2Ativa && (ct >= st2) && (ct < sp2);
					bool dentroHorarioManual = dentroJ1 || dentroJ2;
					
					bool dentroHorarioAutomatico = true;
					if (TS_Mode == tsMode.Automatico && isLiveTrading && _timeSlotCalcDone)
					    dentroHorarioAutomatico = CheckTimeSlotFilter();
					else if (TS_Mode == tsMode.Importar && _timeSlotCalcDone)
					    dentroHorarioAutomatico = CheckTimeSlotFilter();
					
					// ✅ CORREÇÃO: Declara primeiro, atribui depois com lógica condicional
					bool dentroHorario;
					if (TS_Mode == tsMode.Manual)
					{
					    // Modo Manual: respeita janelas fixas (TIME_Start/Stop)
					    dentroHorario = dentroHorarioManual;
					}
					else
					{
					    // Modo Automático ou Importar: usa APENAS o filtro de slots
					    // Ignora TIME_Stop para permitir operação após rollover da sessão
					    dentroHorario = dentroHorarioAutomatico;
					}
	
					// ← MODO AUTOMÁTICO: só em live
					if (TS_Mode == tsMode.Automatico && isLiveTrading && _timeSlotCalcDone)
					{
					    dentroHorarioAutomatico = CheckTimeSlotFilter();
					}
					// ← MODO IMPORTAR: funciona em live E backtest (sem isLiveTrading)
					else if (TS_Mode == tsMode.Importar && _timeSlotCalcDone)
					{
					    dentroHorarioAutomatico = CheckTimeSlotFilter();
					}
					    
					dentroHorario = dentroHorarioManual && dentroHorarioAutomatico;
					if (isConectorVM)
					{
					    dentroHorario = true;
					}
				    
				    // ==========================================
					// 6. CONTROLE DE ATIVAÇÃO
					// ==========================================
					if (!allowTrading)
					{
					    if (activationBar == -1)
					    {
					        activationBar = CurrentBar;
					        DebugPrint($"[VMBOT] Robô ativado na barra {CurrentBar}. Aguardando confirmação...");
					    }
					
					    // ✅ CONECTOR VM: Libera imediatamente, não depende de horário fixo
					    if (isConectorVM)
					    {
					        allowTrading = true;
					        DebugPrint($"[VMBOT] ✅ ConectorVM LIBERADO imediato | Barra: {CurrentBar}");
					        // ← SEM return: continua para a seção 11
					    }
					    // ✅ PREÇO/MANUALBOX: Libera imediato se dentro do horário
					    else if (isPrecoOuBox && dentroHorario)
					    {
					        allowTrading = true;
					        DebugPrint($"[VMBOT] ✅ Trading LIBERADO imediato | Estratégia: {currentEstrategia}");
					        // ← SEM return
					    }
					    // ✅ GRID/FVG: Espera 1 barra
					    else if (!isPrecoOuBox && CurrentBar > activationBar && dentroHorario)
					    {
					        allowTrading = true;
					        DebugPrint($"[VMBOT] ✅ Trading LIBERADO | Barra: {CurrentBar}");
					        return; // Grid/FVG: opera na próxima barra
					    }
					    else
					    {
					        if (CurrentBar > activationBar && !dentroHorario)
					        {
					            DebugPrint($"[VMBOT] ⏸️ Aguardando horário | Atual: {ct}");
					        }
					        return;
					    }
					}
				    
				    // ==========================================
				    // 7. RE-CHECK DE HORÁRIO (Fora do horário → cancelar tudo)
				    // ==========================================
				    if (!dentroHorario)
				    {
				        DebugPrint($"[VMBOT] ⏹️ Fora do horário | {ct} | Cancelando pendentes...");
				        allowTrading  = false;
				        activationBar = -1;
				        
				        // ← IMPORTAR: bloco inclui modo Importar
				        if ((TS_Mode == tsMode.Automatico || TS_Mode == tsMode.Importar) && isLiveTrading && !CheckTimeSlotFilter())
				        {
				            DebugPrint($"[VMBOT] ⏹️ Faixa horária NÃO APROVADA | {ct} | Cancelando pendentes...");
				            allowTrading  = false;
				            activationBar = -1;
				            
				            if (Position.MarketPosition == MarketPosition.Flat)
				            {
				                QuantOperacoes = 0;
				            }
				            
				            CancelAllGridOrders();
				            try { if (sellStopOrder != null) { CancelOrder(sellStopOrder); sellStopOrder = null; } } catch { }
				            try { if (buyStopOrder != null) { CancelOrder(buyStopOrder); buyStopOrder = null; } } catch { }
				            
				            return;
				        }
				        
				        if (Position.MarketPosition == MarketPosition.Flat)
				        {
				            QuantOperacoes = 0;
				            DebugPrint($"[VMBOT] Contador zerado (sem posição aberta)");
				        }
				        else
				        {
				            DebugPrint($"[VMBOT] ⚠️ Posição aberta mantida ({Position.MarketPosition}) - contador preservado");
				        }
				        
				        try { if (sellStopOrder != null && (sellStopOrder.OrderState == OrderState.Working || sellStopOrder.OrderState == OrderState.Submitted)) { CancelOrder(sellStopOrder); sellStopOrder = null; DebugPrint("[CANCEL] sellStopOrder cancelada"); } } catch (Exception ex) { DebugPrint($"[ERRO] Cancel sellStopOrder: {ex.Message}"); }
				        try { if (buyStopOrder  != null && (buyStopOrder.OrderState == OrderState.Working || buyStopOrder.OrderState == OrderState.Submitted)) { CancelOrder(buyStopOrder);  buyStopOrder  = null; DebugPrint("[CANCEL] buyStopOrder cancelada"); } } catch (Exception ex) { DebugPrint($"[ERRO] Cancel buyStopOrder: {ex.Message}"); }
				        
				        if (currentEstrategia == estrategiaMode.GridScalper || currentEstrategia == estrategiaMode.FVGScalper)
				        {
				            if (gridOrdersBuy != null && gridOrdersBuy.Count > 0)
				            {
				                foreach (var order in gridOrdersBuy.ToList())
				                {
				                    try
				                    {
				                        if (order != null && (order.OrderState == OrderState.Working || order.OrderState == OrderState.Submitted))
				                        {
				                            CancelOrder(order);
				                            realtimeOrderIds.Remove(order.Id);
				                            DebugPrint($"[CANCEL] Grid BUY ordem {order.Id} cancelada");
				                        }
				                    }
				                    catch (Exception ex) { DebugPrint($"[ERRO] Cancel grid BUY: {ex.Message}"); }
				                }
				                gridOrdersBuy.Clear();
				            }
				            gridArmedBuy = false;
				            gridFirstOrderBuy = null;
				            gridHasOpenPosBuy = false;
				            gridNeedsRearmBuy = false;
				            
				            if (gridOrdersSell != null && gridOrdersSell.Count > 0)
				            {
				                foreach (var order in gridOrdersSell.ToList())
				                {
				                    try
				                    {
				                        if (order != null && (order.OrderState == OrderState.Working || order.OrderState == OrderState.Submitted))
				                        {
				                            CancelOrder(order);
				                            realtimeOrderIds.Remove(order.Id);
				                            DebugPrint($"[CANCEL] Grid SELL ordem {order.Id} cancelada");
				                        }
				                    }
				                    catch (Exception ex) { DebugPrint($"[ERRO] Cancel grid SELL: {ex.Message}"); }
				                }
				                gridOrdersSell.Clear();
				            }
				            gridArmedSell = false;
				            gridFirstOrderSell = null;
				            gridHasOpenPosSell = false;
				            gridNeedsRearmSell = false;
				            
				            DebugPrint("[CANCEL] Grid/FVG totalmente desarmado");
				        }
				        
				        var ordersToRemove = new List<long>();
				        foreach (var orderId in realtimeOrderIds)
				        {
				            bool stillWorking = false;
				            foreach (var order in Account.Orders)
				            {
				                if (order.Id == orderId && (order.OrderState == OrderState.Working || order.OrderState == OrderState.Submitted))
				                {
				                    stillWorking = true;
				                    break;
				                }
				            }
				            if (!stillWorking)
				                ordersToRemove.Add(orderId);
				        }
				        foreach (var id in ordersToRemove)
				        {
				            realtimeOrderIds.Remove(id);
				            DebugPrint($"[CLEANUP] OrderId {id} removido de realtimeOrderIds");
				        }
				        
				        return;
				    }
				    
				    // ==========================================
				    // 8. GERENCIAMENTO DE ORDENS E INDICADORES
				    // ==========================================
				    try
				    {
				        if (RenkoForce) { candleTimes.Enqueue(Time[0]); RemoveOldCandles(); }
				        
				        bool _aposStop = Time[0].TimeOfDay > TIME_Stop.TimeOfDay && (!Janela2Ativa || Time[0].TimeOfDay > TIME_Stop2.TimeOfDay);
				        if (CancelOrdersAfterStopTime && _aposStop)
				        {
				            try { if (sellStopOrder != null && (!hasReachedRealtime || realtimeOrderIds.Contains(sellStopOrder.Id))) { CancelOrder(sellStopOrder); sellStopOrder = null; } } catch (Exception ex) { DebugPrint($"[ERRO] Cancel sellStopOrder: {ex.Message}"); }
				            try { if (buyStopOrder != null && (!hasReachedRealtime || realtimeOrderIds.Contains(buyStopOrder.Id))) { CancelOrder(buyStopOrder); buyStopOrder = null; } } catch (Exception ex) { DebugPrint($"[ERRO] Cancel buyStopOrder: {ex.Message}"); }
				            
				            if (currentEstrategia == estrategiaMode.GridScalper || currentEstrategia == estrategiaMode.FVGScalper)
				            {
				                if (HasPendingGridOrders(1)) { CancelGridOrdersAsync(1); gridNeedsRearmBuy = false; }
				                if (HasPendingGridOrders(-1)) { CancelGridOrdersAsync(-1); gridNeedsRearmSell = false; }
				            }
				        }
				        
				        if (sellStopOrder != null && (sellStopOrder.OrderState == OrderState.Cancelled || sellStopOrder.OrderState == OrderState.Filled)) { sellStopOrder = null; Reset1(); }
				        if (buyStopOrder != null && (buyStopOrder.OrderState == OrderState.Cancelled || buyStopOrder.OrderState == OrderState.Filled)) { buyStopOrder = null; Reset1(); }
				        
				        if (CancelAfterBars > 0)
				        {
				            if (sellStopOrder != null && (!hasReachedRealtime || realtimeOrderIds.Contains(sellStopOrder.Id)) && orderSellStopBar >= 0 && (CurrentBar - orderSellStopBar) >= CancelAfterBars)
				            {
				                try { CancelOrder(sellStopOrder); } catch (Exception ex) { DebugPrint($"[ERRO] Cancel sellStopOrder bars: {ex.Message}"); }
				                sellStopOrder = null; orderSellStopBar = -1; Reset1();
				                DebugPrint($"[EXPIRA] sellStopOrder cancelada após {CancelAfterBars} barras.");
				            }
				            if (buyStopOrder != null && (!hasReachedRealtime || realtimeOrderIds.Contains(buyStopOrder.Id)) && orderBuyStopBar >= 0 && (CurrentBar - orderBuyStopBar) >= CancelAfterBars)
				            {
				                try { CancelOrder(buyStopOrder); } catch (Exception ex) { DebugPrint($"[ERRO] Cancel buyStopOrder bars: {ex.Message}"); }
				                buyStopOrder = null; orderBuyStopBar = -1; Reset1();
				                DebugPrint($"[EXPIRA] buyStopOrder cancelada após {CancelAfterBars} barras.");
				            }
				        }
				        
				        if (currentEstrategia == estrategiaMode.ManualBox) VerificarRetanguloComTag(Box_string);
				        
				        int _slotAtual = ((int)Times[0][0].TimeOfDay.TotalMinutes / TS_SLOT_MINUTES) * TS_SLOT_MINUTES;
				        // ← IMPORTAR: painel atualiza para os dois modos
				        
						if (IsFirstTickOfBar)
    					{
							if ((TS_Mode == tsMode.Automatico || TS_Mode == tsMode.Importar) && _slotAtual != _ultimoSlotExibido)
					        {
					            _ultimoSlotExibido = _slotAtual;
					            UpdateTimeSlotPanel();
					        }
						}
				    }
				    catch (Exception ex)
				    {
				        DebugPrint($"[ERRO] Gerenciamento ordens: {ex.Message}");
				    }
				    
				    // ==========================================
				    // 9. VERIFICAÇÃO DE META DIÁRIA
				    // ==========================================
				    if (!dailyLimitReached)
				    {
				        double unrealized = (Position.MarketPosition != MarketPosition.Flat)
				            ? Position.GetUnrealizedProfitLoss(PerformanceUnit.Currency, Close[0])
				            : 0;
				        double totalDia = realizadoConta + unrealized;
				    
				        if (DailyLossActive && totalDia <= -Math.Abs(DailyLossLimit))
				        {
				            dailyLimitReached = true;
				            robotTravado = true;
				            if (Position.MarketPosition == MarketPosition.Long)  ExitLong("Daily Loss Limit", "");
				            else if (Position.MarketPosition == MarketPosition.Short) ExitShort("Daily Loss Limit", "");
				            DebugPrint($"[META DIÁRIA] ⛔ PERDA: {totalDia:0.00} | Bloqueado.");
				            return;
				        }
				    
				        if (DailyProfitActive && totalDia >= Math.Abs(DailyProfitLimit))
				        {
				            dailyLimitReached = true;
				            robotTravado = true;
				            if (Position.MarketPosition == MarketPosition.Long)  ExitLong("Daily Profit Limit", "");
				            else if (Position.MarketPosition == MarketPosition.Short) ExitShort("Daily Profit Limit", "");
				            DebugPrint($"[META DIÁRIA] ✅ LUCRO: {totalDia:0.00} | Bloqueado.");
				            return;
				        }
				    }
				    
				    if (dailyLimitReached) return;
				    if (dailyLimitReached) return;
				    
				    if (ct > sp && (!Janela2Ativa || ct > sp2)) QuantOperacoes = 0;
				    
				    // ==========================================
				    // 10. GERENCIAMENTO DE POSIÇÃO ABERTA
				    // ==========================================
				    if (Position.MarketPosition != MarketPosition.Flat)
				    {
				        if (MoneyClosed)
				        {
				            double pnl = Position.GetUnrealizedProfitLoss(PerformanceUnit.Currency, GetCurrentBid());
				            if (pnl > ProfitAllOrders || pnl < LossesAllOrders * (-1))
				            {
				                if (Position.MarketPosition == MarketPosition.Short)
				                {
				                    ExitShort(Position.Quantity, "", "");
				                    Reset1(); CancelAllGridOrders();
				                    breakEvenTriggered = false; trailStopPrice = 0.0; trailStepCount = 0;
				                    DebugPrint($"[TRAIL] 🔄 Reset por MoneyClosed");
				                }
				                if (Position.MarketPosition == MarketPosition.Long)
				                {
				                    ExitLong(Position.Quantity, "", "");
				                    Reset1(); CancelAllGridOrders();
				                    breakEvenTriggered = false; trailStopPrice = 0.0; trailStepCount = 0;
				                    DebugPrint($"[TRAIL] 🔄 Reset por MoneyClosed");
				                }
				            }
				        }
				        
				        if (OrderCloseMA && Position.MarketPosition != MarketPosition.Flat)
				        {
				            double pnl = Position.GetUnrealizedProfitLoss(PerformanceUnit.Currency, Close[0]);
				            
				            if (pnl > ProfitCloseMA) 
				            {
				                if (Position.MarketPosition == MarketPosition.Long && Close[0] < SMA_Close[0] && Close[1] > SMA_Close[1])
				                {
				                    ExitLong("Fechar Long MA", "");
				                    Reset1(); 
				                    CancelAllGridOrders();
				                    breakEvenTriggered = false; 
				                    trailStopPrice = 0.0; 
				                    trailStepCount = 0;
				                    DebugPrint($"[MA CLOSE] ✅ Posição Long fechada por cruzamento de MA. PnL: {pnl:C}");
				                }
				                else if (Position.MarketPosition == MarketPosition.Short && Close[0] > SMA_Close[0] && Close[1] < SMA_Close[1])
				                {
				                    ExitShort("Fechar Short MA", "");
				                    Reset1(); 
				                    CancelAllGridOrders();
				                    breakEvenTriggered = false; 
				                    trailStopPrice = 0.0; 
				                    trailStepCount = 0;
				                    DebugPrint($"[MA CLOSE] ✅ Posição Short fechada por cruzamento de MA. PnL: {pnl:C}");
				                }
				            }
				        }
				    }
				    else
				    {
				        buyOrder = null;
				        sellOrder = null;
				        if (breakEvenTriggered)
				        {
				            breakEvenTriggered = false;
				            trailStopPrice = 0.0;
				            trailStepCount = 0;
				            DebugPrint($"[TRAIL] 🔄 Reset - robô ficou flat");
				        }
				    }
				    
				    // ==========================================
				    // 11. EXECUÇÃO POR ESTRATÉGIA
				    // ==========================================
				    
				    if (currentEstrategia == estrategiaMode.GridScalper)
				    {
				        if (CurrentBar == lastProcessedBarGrid) return;
				        lastProcessedBarGrid = CurrentBar;
				        
				        if (currentOperatingMode == OperatingMode.Comprado || currentOperatingMode == OperatingMode.Ambos)
				        {
				            if (isLiveTrading)
				            {
				                if (gridOperationTaskBuy == null || gridOperationTaskBuy.IsCompleted)
				                {
				                    gridOperationTaskBuy = ProcessGridSideAsync(1);
				                    gridOperationTaskBuy.ContinueWith(t =>
				                    {
				                        if (t.Exception != null)
				                            DebugPrint($"[GRID ERRO] BUY: {t.Exception.InnerException?.Message ?? t.Exception.Message}");
				                    }, TaskScheduler.FromCurrentSynchronizationContext());
				                }
				            }
				            else { ProcessGridSideSync(1); }
				        }
				        
				        if (currentOperatingMode == OperatingMode.Vendido || currentOperatingMode == OperatingMode.Ambos)
				        {
				            if (isLiveTrading)
				            {
				                if (gridOperationTaskSell == null || gridOperationTaskSell.IsCompleted)
				                {
				                    gridOperationTaskSell = ProcessGridSideAsync(-1);
				                    gridOperationTaskSell.ContinueWith(t =>
				                    {
				                        if (t.Exception != null)
				                            DebugPrint($"[GRID ERRO] SELL: {t.Exception.InnerException?.Message ?? t.Exception.Message}");
				                    }, TaskScheduler.FromCurrentSynchronizationContext());
				                }
				            }
				            else { ProcessGridSideSync(-1); }
				        }
				    }
				    
					else if (currentEstrategia == estrategiaMode.ConectorVM || currentEstrategia == estrategiaMode.ConectorLocal)
					{
					    if (!_isPolling)
					    {
					        InitializeConectorVM();
					    }
					    
					    // ✅ Registra horário de fechamento para evitar re-executar o mesmo sinal antigo se fechar no Ninja
					    if (Position.MarketPosition == MarketPosition.Flat && _previousMarketPosition != MarketPosition.Flat)
					    {
					        _lastPositionClosedTime = DateTime.UtcNow;
					        _signalConsumed = false;
					        _signalConsumedBar = -1;
					        _lastExecutedSignal = null;
					        _currentSignal = null;
					        _lastSyncedSlPrice = 0.0;
					        _lastSyncedTpPrice = 0.0;
					        DebugPrint($"[VM] 🏁 Posição encerrada em {_lastPositionClosedTime:HH:mm:ss} UTC. Prontos para novos sinais.");
					    }
					    _previousMarketPosition = Position.MarketPosition;

					    ProcessConectorVM();
					}
				    
					else if (currentEstrategia == estrategiaMode.FVGScalper)
				    {
				        if (CurrentBar == lastProcessedBarGrid) return;
				        lastProcessedBarGrid = CurrentBar;
				        
				        if (currentOperatingMode == OperatingMode.Comprado || currentOperatingMode == OperatingMode.Ambos)
				        {
				            if (isLiveTrading)
				            {
				                if (gridOperationTaskBuy == null || gridOperationTaskBuy.IsCompleted)
				                {
				                    gridOperationTaskBuy = ProcessFVGScalperSideAsync(1);
				                    gridOperationTaskBuy.ContinueWith(t =>
				                    {
				                        if (t.Exception != null)
				                            DebugPrint($"[FB SCALPER ERRO] BUY: {t.Exception.InnerException?.Message ?? t.Exception.Message}");
				                    }, TaskScheduler.FromCurrentSynchronizationContext());
				                }
				            }
				            else { ProcessFVGScalperSideSync(1); }
				        }
				        
				        if (currentOperatingMode == OperatingMode.Vendido || currentOperatingMode == OperatingMode.Ambos)
				        {
				            if (isLiveTrading)
				            {
				                if (gridOperationTaskSell == null || gridOperationTaskSell.IsCompleted)
				                {
				                    gridOperationTaskSell = ProcessFVGScalperSideAsync(-1);
				                    gridOperationTaskSell.ContinueWith(t =>
				                    {
				                        if (t.Exception != null)
				                            DebugPrint($"[FB SCALPER ERRO] SELL: {t.Exception.InnerException?.Message ?? t.Exception.Message}");
				                    }, TaskScheduler.FromCurrentSynchronizationContext());
				                }
				            }
				            else { ProcessFVGScalperSideSync(-1); }
				        }
				    }
					else if (currentEstrategia == estrategiaMode.PlaybookNasdaq)
					{
					    ProcessPlaybookNasdaq();
					}
									
				    
				    else // Trata as estratégias: Preço e ManualBox
    {
        if (QuantOperacoes < MaxOrderSession && Position.MarketPosition == MarketPosition.Flat && !HasAccountPositionOrOrders() && !(SendSignalsToIndicator && VmSignalBridge.IsBusy(Instrument.FullName)))
        {
            // 1. AVALIAR FILTROS INDEPENDENTEMENTE (Sem 'return' que mata o método)
            bool podeComprar = (currentOperatingMode == OperatingMode.Comprado || currentOperatingMode == OperatingMode.Ambos) && CheckEntryFiltersBuy();
            bool podeVender  = (currentOperatingMode == OperatingMode.Vendido || currentOperatingMode == OperatingMode.Ambos) && CheckEntryFiltersSell();

            // 2. EXECUTAR COMPRA (se permitido)
            if (podeComprar)
            {
                if (SendSignalsToIndicator)
                {
                    double p = GetCurrentBid();
                    if (currentEstrategia == estrategiaMode.ManualBox)
                    {
                        VerificarRetanguloComTag(Box_string);
                        resistencia = Resistance0;
                        RemoverRetanguloComTag(Box_string);
                    }
                    else if (currentEstrategia == estrategiaMode.Preço)
                    {
                        resistencia = GetCurrentBid();
                    }
                    else if (currentEstrategia == estrategiaMode.SessaoHILO)
                    {
                        resistencia = _sessaoHiloHigh;
                        suporte = _sessaoHiloLow;
                    }
                    
                    if (OrderMode == orderMode.PendenteStop) p = resistencia + (distancePrice * TickSize);
                    else if (OrderMode == orderMode.PendenteLimit) p = resistencia - (distancePrice * TickSize);
                    else p = Close[0];

                    VmSignalBridge.SendSignal(Instrument.FullName, 1, p, Guid.NewGuid().ToString(), SL_Ticks, TP_Ticks);
                    Print($"[VMBOT BRIDGE] 🚀 Sinal de COMPRA (Preço/Box) enviado para o indicador @ {p}");
                    IncrementarQuantOperacoes();
                    Reset1();
                    return;
                }
                else
                {
                    breakEvenTriggered = false;
                    trailStopPrice = 0.0;
                    trailStepCount = 0;
                    DebugPrint($"[TRAIL] 🆕 Reset para nova operação de COMPRA");
                    if (currentEstrategia == estrategiaMode.ManualBox)
                    {
                        VerificarRetanguloComTag(Box_string);
                        resistencia = Resistance0;
                        suporte = Support0;
                        RemoverRetanguloComTag(Box_string);
                    }
                    else if (currentEstrategia == estrategiaMode.Preço)
                    {
                        resistencia = GetCurrentBid();
                        suporte = GetCurrentBid();
                    }
                    else if (currentEstrategia == estrategiaMode.SessaoHILO)
                    {
                        resistencia = _sessaoHiloHigh;
                        suporte = _sessaoHiloLow;
                    }
                    if (OrderMode == orderMode.PendenteStop && buyStopOrder == null)
                    {
                        double p = resistencia + (distancePrice * TickSize);
                        buyStopOrder = EnterLongStopMarket(0, true, Convert.ToInt32(LOTE_Size), p, "BuyStopOrder");
                        if (HLCA_StopActive)
                        {
                            double hlcaStop = CalcHLCAStopLoss(1, GetCurrentBid());
                            if (hlcaStop > 0) SetStopLossSafe("", CalculationMode.Price, hlcaStop, false);
                        }
                        orderBuyStopBar = CurrentBar;
                        IncrementarQuantOperacoes();
                        AddOrderToList(buyStopOrder);
                        if (currentOperatingMode == OperatingMode.Ambos) { buyStopOrderSent = true; lastOrderTime = Time[0]; }
                        Reset1();
                    }
                    if (OrderMode == orderMode.PendenteLimit && buyStopOrder == null)
                    {
                        double p = resistencia - (distancePrice * TickSize);
                        if (p < GetCurrentBid() && p > 0)
                        {
                            buyStopOrder = EnterLongLimit(0, true, Convert.ToInt32(LOTE_Size), p, "BuyLimitOrder");
                            if (HLCA_StopActive)
                            {
                                double hlcaStop = CalcHLCAStopLoss(1, GetCurrentBid());
                                if (hlcaStop > 0) SetStopLossSafe("", CalculationMode.Price, hlcaStop, false);
                            }
                            orderBuyStopBar = CurrentBar;
                            IncrementarQuantOperacoes();
                            AddOrderToList(buyStopOrder);
                            Reset1();
                        }
                    }
                    if (OrderMode == orderMode.Mercado && Position.MarketPosition == MarketPosition.Flat)
                    {
                        buyOrder = EnterLong(Convert.ToInt32(LOTE_Size), "BuyOrder");
                        if (HLCA_StopActive)
                        {
                            double hlcaStop = CalcHLCAStopLoss(1, GetCurrentBid());
                            if (hlcaStop > 0) SetStopLossSafe("", CalculationMode.Price, hlcaStop, false);
                        }
                        IncrementarQuantOperacoes();
                        Reset1();
                    }
                
                    AplicarStopETakeProfitOrdens(1, Close[0], "");

                    // ✅ CORREÇÃO MANDATÓRIA: Se enviou compra (Mercado, PendenteLimit ou PendenteStop), sai do método
                    // para nunca submeter ordem de venda no mesmo ciclo/tick!
                    return; 
                }
            }

            // 3. EXECUTAR VENDA (só chega aqui se a compra falhou nos filtros ou não entrou)
            if (podeVender)
            {
                if (SendSignalsToIndicator)
                {
                    double p = GetCurrentBid();
                    if (currentEstrategia == estrategiaMode.ManualBox)
                    {
                        VerificarRetanguloComTag(Box_string);
                        suporte = Support0;
                        RemoverRetanguloComTag(Box_string);
                    }
                    else if (currentEstrategia == estrategiaMode.Preço)
                    {
                        suporte = GetCurrentBid();
                    }
                    else if (currentEstrategia == estrategiaMode.SessaoHILO)
                    {
                        resistencia = _sessaoHiloHigh;
                        suporte = _sessaoHiloLow;
                    }
                    
                    if (OrderMode == orderMode.PendenteStop) p = suporte - (distancePrice * TickSize);
                    else if (OrderMode == orderMode.PendenteLimit) p = suporte + (distancePrice * TickSize);
                    else p = Close[0];

                    VmSignalBridge.SendSignal(Instrument.FullName, -1, p, Guid.NewGuid().ToString(), SL_Ticks, TP_Ticks);
                    Print($"[VMBOT BRIDGE] 🚀 Sinal de VENDA (Preço/Box) enviado para o indicador @ {p}");
                    IncrementarQuantOperacoes();
                    Reset1();
                    return;
                }
                else
                {
                    breakEvenTriggered = false;
                    trailStopPrice = 0.0;
                    trailStepCount = 0;
                    DebugPrint($"[TRAIL] 🆕 Reset para nova operação de VENDA");

                    if (currentEstrategia == estrategiaMode.ManualBox)
                    {
                        bool t = VerificarRetanguloComTag(Box_string);
                        suporte = Support0;
                        resistencia = Resistance0;
                        if (t) RemoverRetanguloComTag(Box_string);
                    }
                    else if (currentEstrategia == estrategiaMode.Preço)
                    {
                        suporte = GetCurrentBid();
                        resistencia = GetCurrentBid();
                    }
                    else if (currentEstrategia == estrategiaMode.SessaoHILO)
                    {
                        resistencia = _sessaoHiloHigh;
                        suporte = _sessaoHiloLow;
                    }

                    if (OrderMode == orderMode.PendenteStop && sellStopOrder == null)
                    {
                        double p = suporte - (distancePrice * TickSize);
                        sellStopOrder = EnterShortStopMarket(0, true, Convert.ToInt32(LOTE_Size), p, "SellStopOrder");
                        if (HLCA_StopActive)
                        {
                            double hlcaStop = CalcHLCAStopLoss(-1, GetCurrentBid());
                            if (hlcaStop > 0) SetStopLossSafe("", CalculationMode.Price, hlcaStop, false);
                        }
                        orderSellStopBar = CurrentBar;
                        IncrementarQuantOperacoes();
                        Reset1();
                        AddOrderToList(sellStopOrder);
                    }
                    if (OrderMode == orderMode.PendenteLimit && sellStopOrder == null)
                    {
                        double p = suporte + (distancePrice * TickSize);
                        if (p > GetCurrentAsk())
                        {
                            sellStopOrder = EnterShortLimit(0, true, Convert.ToInt32(LOTE_Size), p, "SellLimitOrder");
                            if (HLCA_StopActive)
                            {
                                double hlcaStop = CalcHLCAStopLoss(-1, GetCurrentBid());
                                if (hlcaStop > 0) SetStopLossSafe("", CalculationMode.Price, hlcaStop, false);
                            }
                            orderSellStopBar = CurrentBar;
                            IncrementarQuantOperacoes();
                            Reset1();
                            AddOrderToList(sellStopOrder);
                        }
                    }
                    if (OrderMode == orderMode.Mercado)
                    {
                        sellOrder = EnterShort(Convert.ToInt32(LOTE_Size), "SellOrder");
                        if (HLCA_StopActive)
                        {
                            double hlcaStop = CalcHLCAStopLoss(-1, GetCurrentBid());
                            if (hlcaStop > 0) SetStopLossSafe("", CalculationMode.Price, hlcaStop, false);
                        }
                        IncrementarQuantOperacoes();
                        Reset1();
                    }

                    AplicarStopETakeProfitOrdens(1, Close[0], "");
                    
                    // ✅ CORREÇÃO MANDATÓRIA: Sai do método após submeter venda
                    return;
                }
            }
        }
    }
				    
					    _swBar.Stop();
					    _barTimeMs = _swBar.ElapsedMilliseconds;
				}
				
				private void PopulateInitialPanelContent()
				{
				    _pAccount =
				        $"CONTA: {Account?.Name ?? "—"}\n" +
				        $"ESTRATEGIA: {NomeEstrategia}";
				
				    _pParams =
				        $"Contratos:   {LOTE_Size}\n" +
				        $"Total Ops:   {QuantOperacoes}/{MaxOrderSession}\n" +
				        $"Take Profit: {TP_Ticks} ticks\n" +
				        $"Stop Loss:   {SL_Ticks} ticks\n" +
				        $"Janela 1:    {TIME_Start:HH:mm} - {TIME_Stop:HH:mm}\n" +
				        (Janela2Ativa
				            ? $"Janela 2:    {TIME_Start2:HH:mm} - {TIME_Stop2:HH:mm}\n"
				            : "Janela 2:    Inativa\n") +
				        "Meta Lucro:  " + (DailyProfitActive ? DailyProfitLimit + " USD" : "Inativo") + "\n" +
				        "Meta Perda:  " + (DailyLossActive ? DailyLossLimit + " USD" : "Inativo");
				
				    _pClock       = "Aguardando dados do mercado...";
				    _pPnL         = "P&L Conta:   —\nP&L Aberto:  —\nSaldo Conta: —";
				    _pPnLBrush    = Brushes.White;
				    _pStatus      = isValid ? "Aguardando Mercado" : "Licença Inválida";
				    _pStatusBrush = isValid ? Brushes.Yellow : Brushes.Red;
				}
				
				// =====================================================================
				// FILTRO DE IA VIA HTTP (Leitura de Contexto Sob Demanda)
				// =====================================================================
				private bool CheckAIConfidenceFilter(int direction)
				{
				    if (!UseAIFilter) return true; // Se desativado, ignora e passa
				    string dirLabel = direction == 1 ? "COMPRA" : "VENDA";
				    DebugPrint($"[FILTRO IA LOCALHOST] ✅ INICIADO | {dirLabel} | Estratégia ID: '{VM_StrategyId}' | Prompt ID: '{AI_PromptId}'");
				                
				    try
				    {
				        string query = $"?strategy_id={Uri.EscapeDataString(VM_StrategyId ?? "")}&prompt_id={Uri.EscapeDataString(AI_PromptId ?? "")}&direction={direction}";
				        string localUrl = $"http://localhost:8001/analise_contexto{query}";

				        string json = "";
				        System.Net.HttpWebRequest request = (System.Net.HttpWebRequest)System.Net.WebRequest.Create(localUrl);
				        request.Method = "GET";
				        request.Timeout = 3500;
				        request.ReadWriteTimeout = 3500;

				        using (System.Net.HttpWebResponse response = (System.Net.HttpWebResponse)request.GetResponse())
				        using (System.IO.StreamReader reader = new System.IO.StreamReader(response.GetResponseStream()))
				        {
				            json = reader.ReadToEnd();
				        }

				        // Extrai a confiança direcional (confianca_compra ou confianca_venda), com fallback para confianca_pct
				        string chaveDirecao = direction == 1 ? "confianca_compra" : "confianca_venda";
				        int score = ExtrairValorInteiroJson(json, chaveDirecao);
				        if (score <= 0)
				        {
				            score = ExtrairValorInteiroJson(json, "confianca_pct");
				        }
				        
				        if (score >= MinAIConfidence)
				        {
				            DebugPrint($"[FILTRO IA LOCALHOST] ✅ APROVADO | {dirLabel} | Confiança: {score}% (>= Mínima {MinAIConfidence}%)");
				            return true;
				        }
				        else
				        {
				            DebugPrint($"[FILTRO IA LOCALHOST] ❌ BLOQUEADO | {dirLabel} | Confiança: {score}% (< Mínima {MinAIConfidence}%)");
				            return false;
				        }
				    }
				    catch (System.Exception ex)
				    {
				        // FALLBACK SEGURO: Se a IA local estiver offline ou não configurada no momento, liberação por segurança técnica
				        DebugPrint($"[FILTRO IA LOCALHOST] ⚠️ Falha na comunicação local (Fallback: LIBERADO). Erro: {ex.Message}");
				        return true; 
				    }
				}

				// Método auxiliar ultra-rápido para extrair NÚMEROS do JSON (sem bibliotecas pesadas)
				private int ExtrairValorInteiroJson(string json, string chave)
				{
				    string padrao = $"\"{chave}\":";
				    int idx = json.IndexOf(padrao, System.StringComparison.OrdinalIgnoreCase);
				    if (idx < 0) return 0; // Não achou, retorna 0 (bloqueia)
				
				    // Pula o padrão e espaços em branco
				    int start = idx + padrao.Length;
				    while (start < json.Length && char.IsWhiteSpace(json[start])) start++;
				
				    // Lê os dígitos
				    int end = start;
				    while (end < json.Length && char.IsDigit(json[end])) end++;
				
				    if (end > start)
				    {
				        string numeroStr = json.Substring(start, end - start);
				        if (int.TryParse(numeroStr, out int resultado))
				            return resultado;
				    }
				    return 0;
				}
				
				private string ExtrairValorJsonSimples(string json, string chave)
				{
				    string padrao = $"\"{chave}\":";
				    int idx = json.IndexOf(padrao, System.StringComparison.OrdinalIgnoreCase);
				    if (idx < 0) return "DESCONHECIDO";
				
				    int start = json.IndexOf("\"", idx + padrao.Length);
				    if (start < 0) return "DESCONHECIDO";
				    start++;
				
				    int end = json.IndexOf("\"", start);
				    if (end < 0) return "DESCONHECIDO";
				
				    return json.Substring(start, end - start).Trim();
				}
				
				private void SalvarMachineIdLocal()
				{
				    try
				    {
				        string pasta = @"C:\NinjaPanel";
				        if (!Directory.Exists(pasta))
				            Directory.CreateDirectory(pasta);
				        
				        string caminhoArquivo = Path.Combine(pasta, "machine_id.txt");
				        string machineId = Cbi.License.MachineId;
				        
				        File.WriteAllText(caminhoArquivo, machineId);
				        DebugPrint($"[MACHINE ID] ✅ Salvo em: {caminhoArquivo}");
				        DebugPrint($"[MACHINE ID] Valor: {machineId}");
				    }
				    catch (Exception ex)
				    {
				        DebugPrint($"[MACHINE ID] ❌ Erro ao salvar: {ex.Message}");
				    }
				}
				
				private void InitializeConectorVM()
				{
				    _currentSignal = null;
				    _lastExecutedSignal = null;
				    _signalConsumed = false;
				    _signalConsumedBar = -1;
				    _lastSignalId = "";
				    _forceCloseSignal = false;
				    _lastPositionClosedTime = DateTime.MinValue; // ✅ Reset ao reinicializar para evitar bloqueio de sinais
				    _isPolling = true;
				
				    DebugPrint("[VM CONECTOR] ✅ Inicializado — polling ativo");
				    DebugPrint($"[VM CONECTOR] URL: {supabaseUrl}");
				    DebugPrint($"[VM CONECTOR] Símbolo: {referenceSymbol}");
				
				    StartVMPolling();
				}
				
				private void StopVMPolling()
				{
				    _isPolling = false;
				    if (_pollTask != null && !_pollTask.IsCompleted)
				    {
				        try { _pollTask.Wait(1000); } catch { }
				    }
				    DebugPrint("[VM CONECTOR] ⏹️ Polling encerrado");
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
				                await PollSupabaseForSignals();
				                await Task.Delay(VM_POLL_INTERVAL_MS);
				            }
				            catch (Exception ex)
				            {
				                DebugPrint($"[VM CONECTOR] ❌ Erro no polling: {ex.Message}");
				                await Task.Delay(VM_POLL_INTERVAL_MS * 2);
				            }
				        }
				    });
				}
				
				private async Task PollSupabaseForSignals()
				{
					if ((DateTime.Now - _lastPollTime).TotalMilliseconds < VM_POLL_INTERVAL_MS) return;
					_lastPollTime = DateTime.Now;

					try
					{
						string cleanPainelId = string.IsNullOrWhiteSpace(VM_PainelId) ? "" : VM_PainelId.Trim();
						string cleanStrategyId = string.IsNullOrWhiteSpace(VM_StrategyId) ? "" : VM_StrategyId.Trim();

						string painelFilter = string.IsNullOrWhiteSpace(cleanPainelId) ? "" : $"or=(account_id.eq.{Uri.EscapeDataString(cleanPainelId)},panel_id.eq.{Uri.EscapeDataString(cleanPainelId)})&";
						string strategyFilter = string.IsNullOrWhiteSpace(cleanStrategyId) ? "" : $"strategy_id=eq.{Uri.EscapeDataString(cleanStrategyId)}&";

						// ✅ FASE 1: Se estiver FLAT no robô E na conta, busca NOVO SINAL "Em Andamento"
						if (Position.MarketPosition == MarketPosition.Flat && !HasAccountPosition())
						{
							string json = null;

							if (currentEstrategia == estrategiaMode.ConectorLocal)
							{
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
								// 1. Já executado nesta sessão?
								if (_executedSignalIds.Contains(signal.Id)) return;

								// 2. Sinal gerado ANTES ou DURANTE a operação anterior? (Evita re-executar sinal antigo se fechou no Ninja)
								if (_lastPositionClosedTime != DateTime.MinValue && signal.CreatedAt <= _lastPositionClosedTime)
								{
									return;
								}

								// 3. Critério de tempo / expiração (VM_MaxSignalAgeSeconds)
								TimeSpan signalAge = DateTime.UtcNow - signal.CreatedAt;
								int maxAgeSec = VM_MaxSignalAgeSeconds > 0 ? VM_MaxSignalAgeSeconds : 60;
								if (signalAge.TotalSeconds > maxAgeSec) return;

								_lastSignalId = signal.Id;
								_currentSignal = signal;
								_signalConsumed = false;
								Print($"[VM POLL] 🚨 NOVO SINAL CAPTURADO! {signal.Side.ToUpper()} | ID: {signal.Id} | Strat: {signal.StrategyId} | Entry:{signal.EntryPrice:F2}");
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
						// ✅ FASE 2: Se estiver EM POSIÇÃO ABERTA, monitora alteração de status (Cancelado/Encerrado) ou níveis de SL/TP
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
								Print($"[VM POLL] 🚨 ENCERRADO NO PAINEL! Status: '{currentStatus}' -> Forçando fechamento imediato.");
								_forceCloseSignal = true;

								// ⚡ FECHAMENTO IMEDIATO (0ms): Encerra no mesmo milissegundo sem esperar tick
								if (ChartControl != null && ChartControl.Dispatcher != null)
								{
									ChartControl.Dispatcher.InvokeAsync(() =>
									{
										try
										{
											_forceCloseSignal = false;
											try { if (buyStopOrder != null) { CancelOrder(buyStopOrder); buyStopOrder = null; } } catch {}
											try { if (sellStopOrder != null) { CancelOrder(sellStopOrder); sellStopOrder = null; } } catch {}
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
									}
								}

								if (TakeProfitOrigem == sltpOrigem.Painel && TryParseDoubleUniversal(tpStr, out double dbTakeProfit) && dbTakeProfit > 0)
								{
									if (Math.Abs(_lastSyncedTpPrice - dbTakeProfit) > 0.001)
									{
										_lastSyncedTpPrice = dbTakeProfit;
										SetProfitTargetSafe("", CalculationMode.Price, dbTakeProfit, false);
									}
								}
							}
						}
					}
					catch (Exception ex)
					{
						Print($"[VM POLL] ❌ Erro: {ex.Message}");
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

				    // Mapeamentos DE:PARA (Mini <-> Micro)
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
				        json = json.Trim().TrimStart('[').TrimEnd(']');
				        if (string.IsNullOrWhiteSpace(json)) return null;
				
				        VM_Signal signal = new VM_Signal();
				        signal.Id = ExtractJsonField(json, "id");
						signal.StrategyId = ExtractJsonField(json, "strategy_id"); 
				        signal.StrategyName = ExtractJsonField(json, "strategy_name");
				        signal.Side = ExtractJsonField(json, "side").ToLowerInvariant();
				        
				        string isMasterEvStr = ExtractJsonField(json, "is_master_event");
				        string sourceStr = ExtractJsonField(json, "source");
				        string desc = ExtractJsonField(json, "description");
				        string accName = ExtractJsonField(json, "account_name");

				        // 🔒 Proteção Absoluta contra Auto-Execução / Loop / Echo de operações locais do NinjaTrader
				        if (isMasterEvStr.IndexOf("true", StringComparison.OrdinalIgnoreCase) >= 0 ||
				            sourceStr.IndexOf("ninjatrader", StringComparison.OrdinalIgnoreCase) >= 0 ||
				            desc.IndexOf("NinjaTrader", StringComparison.OrdinalIgnoreCase) >= 0 ||
				            (Account != null && !string.IsNullOrEmpty(accName) && string.Equals(accName.Trim(), Account.Name.Trim(), StringComparison.OrdinalIgnoreCase)))
				        {
				            Print($"[VM POLL] ⛔ Sinal ignorado: Originado da própria conta Master ({accName}) ou execução direta do NinjaTrader (Anti-Loop).");
				            return null;
				        }
				        
				        string rawSymbol = ExtractJsonField(json, "symbol");
				        if (string.IsNullOrWhiteSpace(rawSymbol)) rawSymbol = ExtractJsonField(json, "ativo");
				        if (string.IsNullOrWhiteSpace(rawSymbol)) rawSymbol = ExtractJsonField(json, "gamma_symbol");
				        signal.Symbol = !string.IsNullOrWhiteSpace(rawSymbol) ? rawSymbol.Trim().ToUpper() : referenceSymbol;

				        if (!IsSymbolCompatible(signal.Symbol, referenceSymbol))
				        {
				            Print($"[VM POLL] ⛔ Sinal ignorado! Ativo da operação ({signal.Symbol}) não é compatível com o robô/gráfico ({referenceSymbol}).");
				            return null;
				        }
				
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

				        // ✅ SL/TP EM TICKS
				        double slDistance = Math.Abs(entryPrice - stopLoss);
				        double tpDistance = Math.Abs(takeProfit - entryPrice);
				        signal.SlTicks = (int)Math.Round(slDistance / TickSize);
				        signal.TpTicks = (int)Math.Round(tpDistance / TickSize);
				        
				        if (signal.SlTicks <= 0) signal.SlTicks = SL_Ticks > 0 ? SL_Ticks : 50;
				        if (signal.TpTicks <= 0) signal.TpTicks = TP_Ticks > 0 ? TP_Ticks : 30;

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
				
				        Print($"[VM PARSE] ✅ {signal.Side} | SL:{signal.SlTicks}tk | TP:{signal.TpTicks}tk");
				        return signal;
				    }
				    catch (Exception ex) { Print($"[VM PARSE] ❌ {ex.Message}"); return null; }
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
				
				private void ProcessConectorExecution()
				{
				    try
				    {
				        ProcessConectorVM();
				    }
				    catch (Exception ex)
				    {
				        DebugPrint($"[VM CONECTOR] ❌ Erro na execução imediata: {ex.Message}");
				    }
				}
				
				private void ProcessConectorVM()
				{
				    Print($"[VM] === ProcessConectorVM | Bar={CurrentBar} | allowTrading={allowTrading} ===");
				
				    VM_Signal signal = null;
				    lock (_signalLock) { signal = _currentSignal; }
				
				    if (signal == null) { Print("[VM] ❌ Sem sinal"); return; }
				    if (_signalConsumed) { Print("[VM] ❌ Já consumido"); return; }
				
				    // ✅ VALIDAÇÃO: Sinal expirou ou foi gerado durante a operação anterior?
				    TimeSpan signalAge = DateTime.UtcNow - signal.CreatedAt;
				    int maxAgeSec = VM_MaxSignalAgeSeconds > 0 ? VM_MaxSignalAgeSeconds : 60;
				    Print($"[VM] Idade do sinal: {signalAge.TotalSeconds:F1}s");
				    if (signalAge.TotalSeconds > maxAgeSec)
				    {
				        Print($"[VM] ❌ REJEITADO: Expirado ({signalAge.TotalSeconds:F0}s > {maxAgeSec}s)");
				        lock (_signalLock) { _currentSignal = null; }
				        return;
				    }

				
				    // ✅ VERIFICAÇÃO DIRETA: Garante entrada IMEDIATA no 1º tick se estiver Flat na estratégia
				    if (Position.MarketPosition != MarketPosition.Flat)
				    {
				        Print("[VM] ❌ Posição já aberta para esta estratégia");
				        return;
				    }
				    if (QuantOperacoes >= MaxOrderSession) { Print($"[VM] ❌ Limite ops"); return; }
				
				    // ✅ CONECTOR VM: NÃO verifica horário manual
				    bool isAllowed = (signal.Direction == 1)
				        ? (currentOperatingMode == OperatingMode.Comprado || currentOperatingMode == OperatingMode.Ambos)
				        : (currentOperatingMode == OperatingMode.Vendido || currentOperatingMode == OperatingMode.Ambos);
				    
				    if (!isAllowed) { Print($"[VM] ❌ Direção não permitida"); return; }
				    if (!CheckCandleRangeFilter(1)) { Print($"[VM] ❌ Tamanho de candle fora do range permitido"); return; }
				
				    Print("[VM] ✅ EXECUTANDO...");
				    bool executed = ExecuteVMSignal(signal);
				
				    if (executed)
				    {
				        _signalConsumed = true;
				        _signalConsumedBar = CurrentBar;
				        _lastExecutedSignal = signal;
				        if (!_executedSignalIds.Contains(signal.Id))
				        {
				            _executedSignalIds.Add(signal.Id);
				        }
				        Print("[VM] ✅✅ ORDEM ENVIADA!");
				    }
				}
				
				private bool ExecuteVMSignal(VM_Signal signal)
				{
				    try
				    {
				        Order entryOrder = null;
				        breakEvenTriggered = false;
				        trailStopPrice = 0.0;
				        trailStepCount = 0;
				
				        double finalLots = LOTE_Size;
				        if (ContratoOrigem == contratoOrigem.Painel)
				        {
				            if (signal.Contrato > 0)
				            {
				                finalLots = signal.Contrato * ContratoFatorMult;
				            }
				            else
				            {
				                Print("[VMBOT] Aviso: contrato nulo ou inválido no sinal. Usando LOTE_Size local.");
				            }
				        }
				        int finalQuantity = Convert.ToInt32(Math.Max(1, Math.Round(finalLots)));
				        
				        int finalSl = StopLossOrigem == sltpOrigem.Robo ? SL_Ticks : signal.SlTicks;
				        int finalTp = TakeProfitOrigem == sltpOrigem.Robo ? TP_Ticks : signal.TpTicks;
				
				        if (signal.Direction == 1)  // COMPRA
				        {
				            switch (OrderMode)
				            {
				                case orderMode.Mercado:
				                    entryOrder = EnterLong(finalQuantity, "BuyOrder");
				                    break;
				                case orderMode.PendenteStop:
				                    double buyStopPrice = Math.Round((signal.EntryPrice + distancePrice * TickSize) / TickSize) * TickSize;
				                    entryOrder = EnterLongStopMarket(0, true, finalQuantity, buyStopPrice, "BuyStopOrder");
				                    orderBuyStopBar = CurrentBar;
				                    buyStopOrder = entryOrder;
				                    break;
				                case orderMode.PendenteLimit:
				                    double buyLimitPrice = Math.Round((signal.EntryPrice - distancePrice * TickSize) / TickSize) * TickSize;
				                    if (buyLimitPrice > 0 && buyLimitPrice < GetCurrentBid())
				                    {
				                        entryOrder = EnterLongLimit(0, true, finalQuantity, buyLimitPrice, "BuyLimitOrder");
				                        orderBuyStopBar = CurrentBar;
				                        buyStopOrder = entryOrder;
				                    }
				                    break;
				            }
				
				            if (finalSl > 0) SetStopLoss("", CalculationMode.Ticks, finalSl, false);
				            if (finalTp > 0) SetProfitTarget("", CalculationMode.Ticks, finalTp, false);
				
				            if (HLCA_StopActive)
				            {
				                double hlcaStop = CalcHLCAStopLoss(1, GetCurrentBid());
				                if (hlcaStop > 0) SetStopLossSafe("", CalculationMode.Price, hlcaStop, false);
				            }
				        }
				        else  // VENDA
				        {
				            switch (OrderMode)
				            {
				                case orderMode.Mercado:
				                    entryOrder = EnterShort(finalQuantity, "SellOrder");
				                    break;
				                case orderMode.PendenteStop:
				                    double sellStopPrice = Math.Round((signal.EntryPrice - distancePrice * TickSize) / TickSize) * TickSize;
				                    entryOrder = EnterShortStopMarket(0, true, finalQuantity, sellStopPrice, "SellStopOrder");
				                    orderSellStopBar = CurrentBar;
				                    sellStopOrder = entryOrder;
				                    break;
				                case orderMode.PendenteLimit:
				                    double sellLimitPrice = Math.Round((signal.EntryPrice + distancePrice * TickSize) / TickSize) * TickSize;
				                    if (sellLimitPrice > GetCurrentAsk())
				                    {
				                        entryOrder = EnterShortLimit(0, true, finalQuantity, sellLimitPrice, "SellLimitOrder");
				                        orderSellStopBar = CurrentBar;
				                        sellStopOrder = entryOrder;
				                    }
				                    break;
				            }
				
				            if (finalSl > 0) SetStopLoss("", CalculationMode.Ticks, finalSl, false);
				            if (finalTp > 0) SetProfitTarget("", CalculationMode.Ticks, finalTp, false);
				
				            if (HLCA_StopActive)
				            {
				                double hlcaStop = CalcHLCAStopLoss(-1, GetCurrentBid());
				                if (hlcaStop > 0) SetStopLossSafe("", CalculationMode.Price, hlcaStop, false);
				            }
				        }

				        if (entryOrder != null)
				        {
				            _lastSyncedSlPrice = signal.StopLoss;
				            _lastSyncedTpPrice = signal.TakeProfit;
				            AddOrderToList(entryOrder);
				            realtimeOrderIds.Add(entryOrder.Id);
				            IncrementarQuantOperacoes();
				            return true;
				        }
				        return false;
				    }
				    catch (Exception ex)
				    {
				        DebugPrint($"[VM CONECTOR] ❌ Erro: {ex.Message}");
				        return false;
				    }
				}
				
				// =====================================================================
				// CONECTOR VM — PAINEL
				// =====================================================================
				
				private void UpdateConectorVMPanel()
				{
					VM_Signal signal = null;
					lock (_signalLock) { signal = _currentSignal; }
					if (currentEstrategia != estrategiaMode.ConectorVM && currentEstrategia != estrategiaMode.ConectorLocal) return;
				
					string statusConector;
				
					// ✅ Se está em operação ou com sinal consumido ativo
					if (Position.MarketPosition != MarketPosition.Flat || (_signalConsumed && _lastExecutedSignal != null))
					{
						string idCurto = (_lastExecutedSignal != null && _lastExecutedSignal.Id.Length > 8) 
							? _lastExecutedSignal.Id.Substring(0, 8) 
							: (_lastExecutedSignal != null ? _lastExecutedSignal.Id : "Ativo");
						
						string posStr = Position.MarketPosition == MarketPosition.Long ? "COMPRADO" : 
							(Position.MarketPosition == MarketPosition.Short ? "VENDIDO" : "ABRINDO");

						statusConector = $"[VM CONECTOR] 🚨 {posStr} | ID: {idCurto}\n" +
							$"Monitorando encerramento no painel...";
					}
					else if (signal != null && !_signalConsumed)
					{
						TimeSpan age = DateTime.UtcNow - signal.CreatedAt;
						int displaySl = StopLossOrigem == sltpOrigem.Robo ? SL_Ticks : signal.SlTicks;
						int displayTp = TakeProfitOrigem == sltpOrigem.Robo ? TP_Ticks : signal.TpTicks;
						statusConector = $"[VM CONECTOR] 🚨 {(signal.Direction == 1 ? "COMPRA" : "VENDA")} | " +
							$"{displaySl}SL/{displayTp}TP | Executando...";
					}
					else
					{
						string painelInfo = string.IsNullOrWhiteSpace(VM_PainelId) ? "Qualquer" : (VM_PainelId.Length > 12 ? VM_PainelId.Substring(0, 12) + "..." : VM_PainelId);
						string stratInfo = string.IsNullOrWhiteSpace(VM_StrategyId) ? "Qualquer" : (VM_StrategyId.Length > 12 ? VM_StrategyId.Substring(0, 12) + "..." : VM_StrategyId);
						
						statusConector = $"[VM CONECTOR] Aguardando sinal ({currentEstrategia})...\n" +
							$"Painel: {painelInfo} | Strat: {stratInfo}";
					}
				
					_pStatus = statusConector;
					_pStatusBrush = Brushes.Lime;
				}

				// =====================================================================
				// FILTRO TAMANHO CANDLE (RANGE)
				// =====================================================================
				private bool CheckCandleRangeFilter(int barShift = 1)
				{
				    if (!CandleRange_Active) return true;
				    if (CurrentBar < barShift) return false;

				    double candleRangeTicks = Math.Round((High[barShift] - Low[barShift]) / TickSize);

				    if (CandleRange_MinTicks > 0 && candleRangeTicks < CandleRange_MinTicks)
				    {
				        DebugPrint($"[FILTRO CANDLE RANGE] ❌ Rejeitado | Range: {candleRangeTicks:F0} ticks (< Mínimo: {CandleRange_MinTicks})");
				        return false;
				    }

				    if (CandleRange_MaxTicks > 0 && candleRangeTicks > CandleRange_MaxTicks)
				    {
				        DebugPrint($"[FILTRO CANDLE RANGE] ❌ Rejeitado | Range: {candleRangeTicks:F0} ticks (> Máximo: {CandleRange_MaxTicks})");
				        return false;
				    }

				    DebugPrint($"[FILTRO CANDLE RANGE] ✅ Aprovado | Range: {candleRangeTicks:F0} ticks (Mín: {CandleRange_MinTicks}, Máx: {CandleRange_MaxTicks})");
				    return true;
				}


				// =====================================================================
				// ── AXION SHARED CONTEXT (CACHE EM MEMÓRIA RAM COMPARTILHADO) ────────
				// =====================================================================
				public static class AxionSharedContext
				{
					private static readonly object _syncLock = new object();
					private static DateTime _lastFetchTime = DateTime.MinValue;
					public static List<double> NiveisMacro = new List<double>();
					public static List<double> Niveis0DTE = new List<double>();
					public static List<double> NiveisBL = new List<double>();
					public static List<double> NiveisGEX = new List<double>();
					public static double HVL = 0;
					public static double HVL0 = 0;
					public static double PutWall = 0;
					public static double CallWall = 0;
					public static string GammaBias = "NEUTRO";
					public static int BiasScore = 0;

					public static void SincronizarGammaSeNecessario(string url, string key, string symbol, Action<string> debugPrint)
					{
						if ((DateTime.UtcNow - _lastFetchTime).TotalMinutes < 10) return;

						lock (_syncLock)
						{
							if ((DateTime.UtcNow - _lastFetchTime).TotalMinutes < 10) return;
							_lastFetchTime = DateTime.UtcNow;

							Task.Run(async () =>
							{
								try
								{
									string cleanSymbol = string.IsNullOrWhiteSpace(symbol) ? "NQ" : symbol.Trim().ToUpper();
									string queryUrl = $"{url.TrimEnd('/')}/rest/v1/gamma_levels?reference_symbol=eq.{Uri.EscapeDataString(cleanSymbol)}&order=id.desc&limit=1";

									HttpWebRequest request = (HttpWebRequest)WebRequest.Create(queryUrl);
									request.Method = "GET";
									request.Timeout = 4000;
									request.Headers.Add("apikey", key);
									request.Headers.Add("Authorization", $"Bearer {key}");
									request.ContentType = "application/json";

									using (HttpWebResponse response = (HttpWebResponse)await request.GetResponseAsync())
									using (StreamReader reader = new StreamReader(response.GetResponseStream()))
									{
										string json = await reader.ReadToEndAsync();
										ParseGammaJson(json);
										debugPrint?.Invoke($"[AXION CACHE] ✅ Gamma Levels sincronizados em memória RAM para {cleanSymbol}");
									}
								}
								catch (Exception ex)
								{
									debugPrint?.Invoke($"[AXION CACHE] ⚠️ Falha ao sincronizar Gamma Levels: {ex.Message}");
								}
							});
						}
					}

					private static void ParseGammaJson(string json)
					{
						if (string.IsNullOrWhiteSpace(json)) return;
						json = json.Trim().TrimStart('[').TrimEnd(']');
						if (string.IsNullOrWhiteSpace(json)) return;

						lock (_syncLock)
						{
							NiveisMacro.Clear();
							Niveis0DTE.Clear();
							NiveisBL.Clear();
							NiveisGEX.Clear();

							double extrairNum(string chave)
							{
								string pat = "\"" + chave + "\":";
								int idx = json.IndexOf(pat, StringComparison.OrdinalIgnoreCase);
								if (idx < 0) return 0;
								int st = idx + pat.Length;
								while (st < json.Length && (char.IsWhiteSpace(json[st]) || json[st] == '"')) st++;
								int ed = st;
								while (ed < json.Length && (char.IsDigit(json[ed]) || json[ed] == '.' || json[ed] == '-')) ed++;
								if (ed > st && double.TryParse(json.Substring(st, ed - st), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double val))
									return val;
								return 0;
							}

							List<double> extrairLista(string chave)
							{
								List<double> list = new List<double>();
								string pat = "\"" + chave + "\":";
								int idx = json.IndexOf(pat, StringComparison.OrdinalIgnoreCase);
								if (idx < 0) return list;
								int st = idx + pat.Length;
								while (st < json.Length && (char.IsWhiteSpace(json[st]) || json[st] == '"')) st++;
								int ed = st;
								while (ed < json.Length && json[ed] != '"' && json[ed] != ',' && json[ed] != '}') ed++;
								if (ed > st)
								{
									string raw = json.Substring(st, ed - st);
									string[] parts = raw.Split(',');
									foreach (string p in parts)
									{
										if (double.TryParse(p.Trim(), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double d) && d > 0)
											list.Add(d);
									}
								}
								return list;
							}

							HVL = extrairNum("hvl");
							CallWall = extrairNum("call_resistance");
							PutWall = extrairNum("put_support");
							HVL0 = extrairNum("hvl_0dte");
							double c0 = extrairNum("call_resistance_0dte");
							double p0 = extrairNum("put_support_0dte");
							double gwall = extrairNum("gamma_wall_0dte");

							if (HVL > 0) NiveisMacro.Add(HVL);
							if (CallWall > 0) NiveisMacro.Add(CallWall);
							if (PutWall > 0) NiveisMacro.Add(PutWall);
							if (gwall > 0) NiveisMacro.Add(gwall);

							if (HVL0 > 0) Niveis0DTE.Add(HVL0);
							if (c0 > 0) Niveis0DTE.Add(c0);
							if (p0 > 0) Niveis0DTE.Add(p0);

							NiveisBL = extrairLista("bl");
							NiveisGEX = extrairLista("gex");
						}
					}
				}

				// =====================================================================
				// ── SESSÃO 24 & 25: LÓGICA FILTRO GAMMA E STOP/TP ESTRUTURAL ────────
				// =====================================================================
				private List<double> ObterNiveisGammaSelecionados()
				{
					List<double> list = new List<double>();
					lock (typeof(AxionSharedContext))
					{
						if (Gamma_GrupoMacro) list.AddRange(AxionSharedContext.NiveisMacro);
						if (Gamma_Grupo0DTE) list.AddRange(AxionSharedContext.Niveis0DTE);
						if (Gamma_GrupoBL_Fortes && AxionSharedContext.NiveisBL.Count > 0)
						{
							// Pega do 7 ao 10 (ou últimos 4 da lista de BL)
							int startIdx = Math.Max(0, AxionSharedContext.NiveisBL.Count - 4);
							for (int i = startIdx; i < AxionSharedContext.NiveisBL.Count; i++)
								list.Add(AxionSharedContext.NiveisBL[i]);
						}
						if (Gamma_GrupoGEX_Fortes && AxionSharedContext.NiveisGEX.Count > 0)
						{
							// Pega do 7 ao 10 (ou últimos 4 da lista de GEX)
							int startIdx = Math.Max(0, AxionSharedContext.NiveisGEX.Count - 4);
							for (int i = startIdx; i < AxionSharedContext.NiveisGEX.Count; i++)
								list.Add(AxionSharedContext.NiveisGEX[i]);
						}
					}
					list.Sort();
					return list;
				}

				private bool CheckFiltroGamma(int direction)
				{
					if (!Gamma_FiltroAtivo) return true;

					List<double> niveisAtivos = ObterNiveisGammaSelecionados();
					if (niveisAtivos == null || niveisAtivos.Count < 2) return true;

					double precoAtual = Close[0];
					double piso = double.MinValue;
					double teto = double.MaxValue;

					foreach (double nivel in niveisAtivos)
					{
						if (nivel <= precoAtual && nivel > piso) piso = nivel;
						if (nivel >= precoAtual && nivel < teto) teto = nivel;
					}

					if (piso == double.MinValue || teto == double.MaxValue) return true;

					double distanciaRangeTicks = (teto - piso) / TickSize;
					if (Gamma_RangeMinTicks > 0 && distanciaRangeTicks < Gamma_RangeMinTicks)
					{
						DebugPrint($"[FILTRO GAMMA] ❌ Bloqueado: Range ({distanciaRangeTicks:F0} ticks) < Mínimo ({Gamma_RangeMinTicks})");
						return false;
					}
					if (Gamma_RangeMaxTicks > 0 && distanciaRangeTicks > Gamma_RangeMaxTicks)
					{
						DebugPrint($"[FILTRO GAMMA] ❌ Bloqueado: Range ({distanciaRangeTicks:F0} ticks) > Máximo ({Gamma_RangeMaxTicks})");
						return false;
					}

					if (Gamma_DrawLevels)
					{
						Draw.Line(this, "Gamma_Piso", false, 0, piso, -20, piso, Brushes.SeaGreen, DashStyleHelper.Solid, 2);
						Draw.Line(this, "Gamma_Teto", false, 0, teto, -20, teto, Brushes.Crimson, DashStyleHelper.Solid, 2);
					}

					double posPct = ((precoAtual - piso) / (teto - piso)) * 100.0;

					if (direction == 1) // COMPRA
					{
						bool passouPullback = Gamma_OperarPullback && (posPct <= Gamma_PullbackCompraMaxPct);
						bool passouBreakout = Gamma_OperarBreakout && (Close[0] > teto);

						if (!passouPullback && !passouBreakout)
						{
							DebugPrint($"[FILTRO GAMMA] ❌ COMPRA Bloqueada: Pos={posPct:F1}% (Permitido: 0 a {Gamma_PullbackCompraMaxPct:F0}%)");
							return false;
						}
						DebugPrint($"[FILTRO GAMMA] ✅ COMPRA Aprovada | Pos={posPct:F1}% | Piso={piso:F2} | Teto={teto:F2}");
						return true;
					}
					else if (direction == -1) // VENDA
					{
						bool passouPullback = Gamma_OperarPullback && (posPct >= Gamma_PullbackVendaMinPct);
						bool passouBreakout = Gamma_OperarBreakout && (Close[0] < piso);

						if (!passouPullback && !passouBreakout)
						{
							DebugPrint($"[FILTRO GAMMA] ❌ VENDA Bloqueada: Pos={posPct:F1}% (Permitido: {Gamma_PullbackVendaMinPct:F0} a 100%)");
							return false;
						}
						DebugPrint($"[FILTRO GAMMA] ✅ VENDA Aprovada | Pos={posPct:F1}% | Piso={piso:F2} | Teto={teto:F2}");
						return true;
					}

					return false;
				}

				private double ObterVpocRecente(int lookbackBars = 20)
				{
					if (CurrentBar < lookbackBars) return 0;
					double minP = double.MaxValue;
					double maxP = double.MinValue;

					for (int i = 0; i < lookbackBars; i++)
					{
						if (Low[i] < minP) minP = Low[i];
						if (High[i] > maxP) maxP = High[i];
					}

					if (maxP <= minP || TickSize <= 0) return 0;
					int totalBins = (int)Math.Min(100, (maxP - minP) / TickSize + 1);
					long[] volumeProfile = new long[totalBins];

					for (int i = 0; i < lookbackBars; i++)
					{
						double barMid = (High[i] + Low[i]) / 2.0;
						int bin = (int)((barMid - minP) / TickSize);
						if (bin >= 0 && bin < totalBins)
							volumeProfile[bin] += (long)Volume[i];
					}

					long maxVol = -1;
					int maxBin = 0;
					for (int b = 0; b < totalBins; b++)
					{
						if (volumeProfile[b] > maxVol)
						{
							maxVol = volumeProfile[b];
							maxBin = b;
						}
					}

					return minP + (maxBin * TickSize);
				}

				// ── 25. GESTÃO ESTRUTURAL DE STOPLOSS & TAKEPROFIT (ENUM) ────────
				public enum ModoStopLossVMBot { FixoTicks, HLCA, GammaNivel, VPOC_Micro, ATR }

				private (int StopTicks, int TargetTicks) CalcularStopETakeProfitEstrutural(int direction, double entryPrice)
				{
					int stopCalculadoTicks = SL_Ticks;

					switch (Stop_OrigemModo)
					{
						case ModoStopLossVMBot.GammaNivel:
							List<double> niveis = ObterNiveisGammaSelecionados();
							double nivelRef = 0;
							if (direction == 1)
							{
								for (int i = niveis.Count - 1; i >= 0; i--)
								{
									if (niveis[i] <= entryPrice) { nivelRef = niveis[i]; break; }
								}
								if (nivelRef > 0)
								{
									double pStop = nivelRef - (Stop_FolgaNivelTicks * TickSize);
									stopCalculadoTicks = (int)Math.Round((entryPrice - pStop) / TickSize);
								}
							}
							else
							{
								for (int i = 0; i < niveis.Count; i++)
								{
									if (niveis[i] >= entryPrice) { nivelRef = niveis[i]; break; }
								}
								if (nivelRef > 0)
								{
									double pStop = nivelRef + (Stop_FolgaNivelTicks * TickSize);
									stopCalculadoTicks = (int)Math.Round((pStop - entryPrice) / TickSize);
								}
							}
							break;

						case ModoStopLossVMBot.VPOC_Micro:
							double vpoc = ObterVpocRecente(20);
							if (vpoc > 0)
							{
								double pStop = direction == 1 ? vpoc - (Stop_FolgaNivelTicks * TickSize) : vpoc + (Stop_FolgaNivelTicks * TickSize);
								stopCalculadoTicks = (int)Math.Round(Math.Abs(entryPrice - pStop) / TickSize);
							}
							break;

						case ModoStopLossVMBot.ATR:
							if (_gridATR == null || _gridATR.Period != Stop_ATR_Period)
								_gridATR = ATR(Stop_ATR_Period);
							double atrVal = _gridATR[0];
							if (atrVal > 0)
							{
								stopCalculadoTicks = (int)Math.Round((atrVal * Stop_ATR_Multiplier) / TickSize);
							}
							break;

						case ModoStopLossVMBot.HLCA:
							double hlcaStop = CalcHLCAStopLoss(direction, entryPrice);
							if (hlcaStop > 0)
								stopCalculadoTicks = (int)Math.Round(Math.Abs(entryPrice - hlcaStop) / TickSize);
							break;

						default:
							stopCalculadoTicks = SL_Ticks;
							break;
					}

					// 🛡️ REGRA INVIOLÁVEL: O Stop Estrutural nunca pode ser menor que o Stop Convencional (SL_Ticks)
					int stopFinalTicks = Math.Max(stopCalculadoTicks, SL_Ticks);

					// 🎯 TAKE PROFIT POR FATOR MULTIPLICADOR
					int tpFinalTicks = TP_Ticks;
					if (TP_UsarFatorMultiplicador && TP_FatorMultiplicador > 0)
					{
						tpFinalTicks = (int)Math.Round(stopFinalTicks * TP_FatorMultiplicador);
					}

					DebugPrint($"[RISK ENGINE V1.8] 📐 Modo: {Stop_OrigemModo} | SL Final: {stopFinalTicks}t (Piso SL: {SL_Ticks}t) | TP Final: {tpFinalTicks}t (Fator: {TP_FatorMultiplicador:F1}x)");
					return (stopFinalTicks, tpFinalTicks);
				}

				private void AplicarStopETakeProfitOrdens(int direction, double entryPrice, string signalName = "")
				{
					var (sl, tp) = CalcularStopETakeProfitEstrutural(direction, entryPrice);
					if (sl > 0) SetStopLoss(signalName, CalculationMode.Ticks, sl, false);
					if (tp > 0) SetProfitTarget(signalName, CalculationMode.Ticks, tp, false);
				}

				#region SESSÃO 26: PLAYBOOK NASDAQ FORCE (CRONOLOGIA QUADRO 4 - T0 / M5 / OR15)
				// =====================================================================
				// ── ESTRUTURA E CACHE DA TABELA NASDAQ_FORCE (SUPABASE + CSV LOCAL) ──
				// =====================================================================
				public struct NasdaqForceSnapshot
				{
					public DateTime TimestampBRT;
					public double ForcaFinalCompra;
					public double ForcaFinalVenda;
					public double ForcaNQCompra;
					public double ForcaSP500Compra;
					public double ForcaVixCompra;
					public double ForcaDxyCompra;
					public double ForcaTechMediaCompra; // Média das 7 Techs (NVDA, MSFT, AAPL, META, AMZN, GOOGL, TSLA)
					public bool IsValid;
				}

				public static class AxionNasdaqForceCache
				{
					private static readonly object _cacheLock = new object();
					private static readonly Dictionary<DateTime, NasdaqForceSnapshot> _byMinute = new Dictionary<DateTime, NasdaqForceSnapshot>();
					private static readonly HashSet<DateTime> _fetchedDays = new HashSet<DateTime>();
					private static volatile bool _localCsvLoaded = false;
					private static volatile bool _csvLoadingInProgress = false;
					public static NasdaqForceSnapshot LatestRealtime = new NasdaqForceSnapshot();
					public static DateTime LastRealtimeFetchUtc = DateTime.MinValue;

					public static void EnsureLocalCsvLoadedAsync(Action<string> debugPrint)
					{
						if (_localCsvLoaded || _csvLoadingInProgress) return;
						_csvLoadingInProgress = true;

						Task.Run(() =>
						{
							try
							{
								string[] candidatePaths = new string[]
								{
									@"C:\Users\Pichau\Projetos React\VortexWeb\data\databento\nasdaq_force_365d_BRT.csv",
									@"C:\Users\Pichau\Projetos React\VortexWeb\data\databento\janela_0608_1011\nasdaq_force_0608_1011_BRT.csv",
									@"C:\NinjaPanel\nasdaq_force_365d_BRT.csv"
								};
								foreach (string path in candidatePaths)
								{
									if (!File.Exists(path)) continue;
									using (StreamReader sr = new StreamReader(path))
									{
										string headerLine = sr.ReadLine();
										if (string.IsNullOrEmpty(headerLine)) continue;
										string[] headers = headerLine.Split(',');
										int idxTs = Array.IndexOf(headers, "timestamp");
										int idxFF = Array.IndexOf(headers, "forca_final_compra");
										int idxNQ = Array.IndexOf(headers, "nasdaq_compra");
										int idxES = Array.IndexOf(headers, "sp500_compra");
										int idxVX = Array.IndexOf(headers, "vix_compra");
										int idxDX = Array.IndexOf(headers, "usdindex_compra");
										int idxNVDA = Array.IndexOf(headers, "nvidia_compra");
										int idxMSFT = Array.IndexOf(headers, "microsoft_compra");
										int idxAAPL = Array.IndexOf(headers, "apple_compra");
										int idxMETA = Array.IndexOf(headers, "meta_compra");
										int idxAMZN = Array.IndexOf(headers, "amazon_compra");
										int idxGOOG = Array.IndexOf(headers, "alphabet_compra");
										int idxTSLA = Array.IndexOf(headers, "tesla_compra");

										int loaded = 0;
										string line;
										while ((line = sr.ReadLine()) != null)
										{
											string[] cols = line.Split(',');
											if (cols.Length <= idxFF || idxTs < 0 || idxFF < 0) continue;
											if (!DateTimeOffset.TryParse(cols[idxTs], System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out DateTimeOffset dto))
												continue;
											DateTime keyMin = new DateTime(dto.Year, dto.Month, dto.Day, dto.Hour, dto.Minute, 0);
											double ff = ParseDoubleFast(cols, idxFF, 50.0);
											double nq = ParseDoubleFast(cols, idxNQ, 50.0);
											double es = ParseDoubleFast(cols, idxES, 50.0);
											double vx = ParseDoubleFast(cols, idxVX, 50.0);
											double dx = ParseDoubleFast(cols, idxDX, 50.0);
											double t1 = ParseDoubleFast(cols, idxNVDA, 50.0);
											double t2 = ParseDoubleFast(cols, idxMSFT, 50.0);
											double t3 = ParseDoubleFast(cols, idxAAPL, 50.0);
											double t4 = ParseDoubleFast(cols, idxMETA, 50.0);
											double t5 = ParseDoubleFast(cols, idxAMZN, 50.0);
											double t6 = ParseDoubleFast(cols, idxGOOG, 50.0);
											double t7 = ParseDoubleFast(cols, idxTSLA, 50.0);

											lock (_cacheLock)
											{
												_byMinute[keyMin] = new NasdaqForceSnapshot
												{
													TimestampBRT = keyMin,
													ForcaFinalCompra = ff,
													ForcaFinalVenda = 100.0 - ff,
													ForcaNQCompra = nq,
													ForcaSP500Compra = es,
													ForcaVixCompra = vx,
													ForcaDxyCompra = dx,
													ForcaTechMediaCompra = (t1 + t2 + t3 + t4 + t5 + t6 + t7) / 7.0,
													IsValid = true
												};
												_fetchedDays.Add(keyMin.Date);
											}
											loaded++;
										}
										debugPrint?.Invoke($"[PLAYBOOK] ✅ Cache histórico carregado em background ({loaded} minutos de {Path.GetFileName(path)}).");
										break;
									}
								}
							}
							catch (Exception ex)
							{
								debugPrint?.Invoke($"[PLAYBOOK] ⚠️ Aviso ao ler CSV em background: {ex.Message}");
							}
							finally
							{
								_localCsvLoaded = true;
								_csvLoadingInProgress = false;
							}
						});
					}

					private static double ParseDoubleFast(string[] cols, int idx, double fallback)
					{
						if (idx < 0 || idx >= cols.Length) return fallback;
						if (double.TryParse(cols[idx].Trim(), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double v))
							return v;
						return fallback;
					}

					public static NasdaqForceSnapshot RequestSpecificMinuteAsync(string url, string key, string instanceId, DateTime targetBrt, int lookbackMinutes, Action<string> debugPrint)
					{
						NasdaqForceSnapshot cached = GetNearest(targetBrt, lookbackMinutes);
						if (cached.IsValid) return cached;

						Task.Run(async () =>
						{
							try
							{
								string cleanInst = string.IsNullOrWhiteSpace(instanceId) ? "painel_principal_web" : instanceId.Trim();
								DateTime startBrt = targetBrt.AddMinutes(-Math.Max(lookbackMinutes, 15));
								DateTime endBrt   = targetBrt.AddMinutes(2);
								string sIso = startBrt.ToString("yyyy-MM-ddTHH:mm:ss") + "-03:00";
								string eIso = endBrt.ToString("yyyy-MM-ddTHH:mm:ss") + "-03:00";

								string queryUrl = $"{url.TrimEnd('/')}/rest/v1/nasdaq_force?" +
									$"instance_id=eq.{Uri.EscapeDataString(cleanInst)}&" +
									$"timestamp=gte.{Uri.EscapeDataString(sIso)}&" +
									$"timestamp=lte.{Uri.EscapeDataString(eIso)}&" +
									$"order=timestamp.desc&limit=10";

								HttpWebRequest req = (HttpWebRequest)WebRequest.Create(queryUrl);
								req.Method = "GET";
								req.Timeout = 3000;
								req.ReadWriteTimeout = 3000;
								req.Headers.Add("apikey", key);
								req.Headers.Add("Authorization", $"Bearer {key}");
								req.ContentType = "application/json";

								using (HttpWebResponse resp = (HttpWebResponse)await req.GetResponseAsync())
								using (StreamReader reader = new StreamReader(resp.GetResponseStream()))
								{
									string json = await reader.ReadToEndAsync();
									ParseAndStoreJsonRows(json, false);
								}
							}
							catch (Exception ex)
							{
								debugPrint?.Invoke($"[PLAYBOOK] ⚠️ Busca pontual background ({targetBrt:dd/MM HH:mm}): {ex.Message}");
							}
						});

						return cached;
					}

					public static void RequestDayFetchAsync(string url, string key, string instanceId, DateTime dateBrt, Action<string> debugPrint)
					{
						DateTime dKey = dateBrt.Date;
						lock (_cacheLock)
						{
							if (_fetchedDays.Contains(dKey)) return;
							_fetchedDays.Add(dKey);
						}

						Task.Run(async () =>
						{
							try
							{
								string cleanInst = string.IsNullOrWhiteSpace(instanceId) ? "painel_principal_web" : instanceId.Trim();
								DateTime startBrt = dKey.AddDays(-1).AddHours(18);
								DateTime endBrt   = dKey.AddHours(20);
								string sIso = startBrt.ToString("yyyy-MM-ddTHH:mm:ss") + "-03:00";
								string eIso = endBrt.ToString("yyyy-MM-ddTHH:mm:ss") + "-03:00";

								string queryUrl = $"{url.TrimEnd('/')}/rest/v1/nasdaq_force?" +
									$"instance_id=eq.{Uri.EscapeDataString(cleanInst)}&" +
									$"timestamp=gte.{Uri.EscapeDataString(sIso)}&" +
									$"timestamp=lte.{Uri.EscapeDataString(eIso)}&" +
									$"order=timestamp.asc&limit=1000";

								HttpWebRequest req = (HttpWebRequest)WebRequest.Create(queryUrl);
								req.Method = "GET";
								req.Timeout = 4000;
								req.ReadWriteTimeout = 4000;
								req.Headers.Add("apikey", key);
								req.Headers.Add("Authorization", $"Bearer {key}");
								req.ContentType = "application/json";

								using (HttpWebResponse resp = (HttpWebResponse)await req.GetResponseAsync())
								using (StreamReader reader = new StreamReader(resp.GetResponseStream()))
								{
									string json = await reader.ReadToEndAsync();
									int count = ParseAndStoreJsonRows(json, false);
									debugPrint?.Invoke($"[PLAYBOOK] 🌐 Supabase nasdaq_force ({dKey:dd/MM/yyyy}): {count} registros em background.");
								}
							}
							catch (Exception ex)
							{
								debugPrint?.Invoke($"[PLAYBOOK] ⚠️ Falha ao buscar dia {dKey:dd/MM/yyyy} em nasdaq_force: {ex.Message}");
							}
						});
					}

					public static async Task PollLatestFromSupabaseAsync(string url, string key, string instanceId, Action<string> debugPrint)
					{
						if ((DateTime.UtcNow - LastRealtimeFetchUtc).TotalSeconds < 4.0) return;
						LastRealtimeFetchUtc = DateTime.UtcNow;

						try
						{
							string cleanInst = string.IsNullOrWhiteSpace(instanceId) ? "painel_principal_web" : instanceId.Trim();
							string queryUrl = $"{url.TrimEnd('/')}/rest/v1/nasdaq_force?" +
								$"instance_id=eq.{Uri.EscapeDataString(cleanInst)}&" +
								$"order=timestamp.desc&limit=5";

							HttpWebRequest req = (HttpWebRequest)WebRequest.Create(queryUrl);
							req.Method = "GET";
							req.Timeout = 3000;
							req.ReadWriteTimeout = 3000;
							req.Headers.Add("apikey", key);
							req.Headers.Add("Authorization", $"Bearer {key}");
							req.ContentType = "application/json";

							using (HttpWebResponse resp = (HttpWebResponse)await req.GetResponseAsync())
							using (StreamReader reader = new StreamReader(resp.GetResponseStream()))
							{
								string json = await reader.ReadToEndAsync();
								ParseAndStoreJsonRows(json, true);
							}
						}
						catch (Exception ex)
						{
							debugPrint?.Invoke($"[PLAYBOOK POLL] ⚠️ {ex.Message}");
						}
					}

					private static int ParseAndStoreJsonRows(string json, bool updateLatest)
					{
						if (string.IsNullOrWhiteSpace(json) || json == "[]") return 0;
						int count = 0;
						int pos = 0;
						bool firstObj = true;

						while (pos < json.Length)
						{
							int objStart = json.IndexOf('{', pos);
							if (objStart < 0) break;
							int objEnd = json.IndexOf('}', objStart);
							if (objEnd < 0) break;

							string obj = json.Substring(objStart, objEnd - objStart + 1);
							pos = objEnd + 1;

							string tsStr = ExtractJsonStr(obj, "timestamp");
							if (string.IsNullOrWhiteSpace(tsStr)) tsStr = ExtractJsonStr(obj, "updated_at");
							if (string.IsNullOrWhiteSpace(tsStr)) continue;

							if (!DateTimeOffset.TryParse(tsStr, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out DateTimeOffset dto))
								continue;

							// Converte para BRT (UTC-3)
							DateTimeOffset dtoBrt = dto.ToOffset(TimeSpan.FromHours(-3));
							DateTime keyMin = new DateTime(dtoBrt.Year, dtoBrt.Month, dtoBrt.Day, dtoBrt.Hour, dtoBrt.Minute, 0);

							double ff   = ExtractJsonDouble(obj, "forca_final_compra", 50.0);
							double nq   = ExtractJsonDouble(obj, "nasdaq_compra", 50.0);
							double es   = ExtractJsonDouble(obj, "sp500_compra", 50.0);
							double vx   = ExtractJsonDouble(obj, "vix_compra", 50.0);
							double dx   = ExtractJsonDouble(obj, "usdindex_compra", 50.0);
							double nvda = ExtractJsonDouble(obj, "nvidia_compra", 50.0);
							double msft = ExtractJsonDouble(obj, "microsoft_compra", 50.0);
							double aapl = ExtractJsonDouble(obj, "apple_compra", 50.0);
							double meta = ExtractJsonDouble(obj, "meta_compra", 50.0);
							double amzn = ExtractJsonDouble(obj, "amazon_compra", 50.0);
							double goog = ExtractJsonDouble(obj, "alphabet_compra", 50.0);
							double tsla = ExtractJsonDouble(obj, "tesla_compra", 50.0);

							NasdaqForceSnapshot snap = new NasdaqForceSnapshot
							{
								TimestampBRT = keyMin,
								ForcaFinalCompra = ff,
								ForcaFinalVenda = 100.0 - ff,
								ForcaNQCompra = nq,
								ForcaSP500Compra = es,
								ForcaVixCompra = vx,
								ForcaDxyCompra = dx,
								ForcaTechMediaCompra = (nvda + msft + aapl + meta + amzn + goog + tsla) / 7.0,
								IsValid = true
							};

							lock (_cacheLock)
							{
								_byMinute[keyMin] = snap;
								if (updateLatest && firstObj)
								{
									LatestRealtime = snap;
									firstObj = false;
								}
							}
							count++;
						}
						return count;
					}

					private static string ExtractJsonStr(string json, string key)
					{
						string pat = "\"" + key + "\":";
						int idx = json.IndexOf(pat, StringComparison.OrdinalIgnoreCase);
						if (idx < 0) return "";
						int st = idx + pat.Length;
						while (st < json.Length && (char.IsWhiteSpace(json[st]) || json[st] == '"')) st++;
						int ed = st;
						while (ed < json.Length && json[ed] != '"' && json[ed] != ',' && json[ed] != '}') ed++;
						return ed > st ? json.Substring(st, ed - st).Trim() : "";
					}

					private static double ExtractJsonDouble(string json, string key, double fallback)
					{
						string s = ExtractJsonStr(json, key);
						if (string.IsNullOrWhiteSpace(s)) return fallback;
						s = s.Replace(',', '.');
						if (double.TryParse(s, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double v))
							return v;
						return fallback;
					}

					public static NasdaqForceSnapshot GetNearest(DateTime timeBrt, int maxToleranceMinutes = 15)
					{
						DateTime baseMin = new DateTime(timeBrt.Year, timeBrt.Month, timeBrt.Day, timeBrt.Hour, timeBrt.Minute, 0);
						lock (_cacheLock)
						{
							if (_byMinute.TryGetValue(baseMin, out NasdaqForceSnapshot exact) && exact.IsValid)
								return exact;
							for (int m = 1; m <= maxToleranceMinutes; m++)
							{
								DateTime p1 = baseMin.AddMinutes(-m);
								if (_byMinute.TryGetValue(p1, out NasdaqForceSnapshot s1) && s1.IsValid) return s1;
								DateTime p2 = baseMin.AddMinutes(m);
								if (_byMinute.TryGetValue(p2, out NasdaqForceSnapshot s2) && s2.IsValid) return s2;
							}
						}
						return new NasdaqForceSnapshot { IsValid = false, ForcaFinalCompra = 50.0, ForcaFinalVenda = 50.0, ForcaTechMediaCompra = 50.0 };
					}

					public static NasdaqForceSnapshot GetAtOrBefore(DateTime timeBrt, int maxLookbackMinutes = 15, bool allowRealtimeFallback = false)
					{
						DateTime baseMin = new DateTime(timeBrt.Year, timeBrt.Month, timeBrt.Day, timeBrt.Hour, timeBrt.Minute, 0);
						lock (_cacheLock)
						{
							for (int m = 0; m <= maxLookbackMinutes; m++)
							{
								DateTime probe = baseMin.AddMinutes(-m);
								if (_byMinute.TryGetValue(probe, out NasdaqForceSnapshot snap) && snap.IsValid)
									return snap;
							}
							if (allowRealtimeFallback && LatestRealtime.IsValid)
								return LatestRealtime;
						}
						return new NasdaqForceSnapshot { IsValid = false, ForcaFinalCompra = 50.0, ForcaFinalVenda = 50.0, ForcaTechMediaCompra = 50.0 };
					}
				}

				// =====================================================================
				// ── VARIÁVEIS DE ESTADO DIÁRIO DO PLAYBOOK NASDAQ FORCE ────────────
				// =====================================================================
				private bool _pbPollingActive = false;
				private Task _pbPollTask = null;
				private DateTime _pbCurrentSessionDate = DateTime.MinValue;

				private double _pbForcaAsia = -1.0;
				private double _pbForcaT15m = -1.0;
				private bool   _pbT0EvaluatedToday = false;
				private bool   _pbT0TriggeredToday = false;
				private bool   _pbM5EvaluatedToday = false;
				private bool   _pbM5TriggeredToday = false;

				private double _pbOr15TempHigh = double.MinValue;
				private double _pbOr15TempLow  = double.MaxValue;
				private double _pbOr15High     = 0.0;
				private double _pbOr15Low      = 0.0;
				private double _pbOr15Mid      = 0.0;
				private double _pbOr15RangePts = 0.0;
				private double _pbOr15Q25Pts   = 0.0;
				private bool   _pbOr15Consolidated = false;
				private bool   _pbOr15FirstTouchUsed = false;
				private bool   _pbOr15BreakoutUsed   = false;
				private int    _pbLastProcessedOrBar = -1;

				// Controle de saída por tempo (T0 / M5) e Breakeven da Parcial OR15
				private DateTime _pbActiveTradeMaxExitTime = DateTime.MinValue;
				private bool     _pbOr15BreakevenArmed     = false;
				private bool     _pbOr15BreakevenTriggered = false;
				private double   _pbOr15BreakevenTriggerPrice = 0.0;
				private double   _pbOr15EntryPrice         = 0.0;
				private int      _pbOr15Direction          = 0;

				private void InitializePlaybookNasdaq()
				{
					// Dispara carregamento assíncrono em background (Zero travamento de thread)
					AxionNasdaqForceCache.EnsureLocalCsvLoadedAsync(DebugPrint);
					if (!_pbPollingActive)
					{
						_pbPollingActive = true;
						_pbPollTask = Task.Run(async () =>
						{
							while (_pbPollingActive && State != State.Terminated && State != State.Finalized)
							{
								try
								{
									// 1. Polling contínuo de tempo real diretamente da tabela nasdaq_force
									await AxionNasdaqForceCache.PollLatestFromSupabaseAsync(supabaseUrl, supabaseServiceKey, PB_InstanceId, DebugPrint);

									DateTime curBrt = DateTime.UtcNow.AddHours(-3);
									var (nyOpenNow, asiaOpenNow) = GetPlaybookSessionTimes(curBrt);

									// 2. Se a força da Ásia ainda não foi capturada, busca no Supabase
									if (_pbForcaAsia < 0)
									{
										DateTime asiaDt = GetPreviousTradingEvening(curBrt, asiaOpenNow);
										NasdaqForceSnapshot snapAsia = AxionNasdaqForceCache.RequestSpecificMinuteAsync(supabaseUrl, supabaseServiceKey, PB_InstanceId, asiaDt, 30, DebugPrint);
										if (snapAsia.IsValid)
										{
											_pbForcaAsia = snapAsia.ForcaFinalCompra;
											DebugPrint($"[PLAYBOOK NQ] 🌏 Força Ásia ({asiaDt:dd/MM HH:mm}) carregada em RAM: {_pbForcaAsia:F1}%");
										}
									}

									// 3. Se já passamos de T-15m e ainda não temos T-15m capturada
									TimeSpan t15Now = nyOpenNow - TimeSpan.FromMinutes(15);
									if (_pbForcaT15m < 0 && curBrt.TimeOfDay >= t15Now)
									{
										DateTime t15Dt = curBrt.Date + t15Now;
										NasdaqForceSnapshot snapT15 = AxionNasdaqForceCache.RequestSpecificMinuteAsync(supabaseUrl, supabaseServiceKey, PB_InstanceId, t15Dt, 15, DebugPrint);
										if (snapT15.IsValid)
										{
											_pbForcaT15m = snapT15.ForcaFinalCompra;
											DebugPrint($"[PLAYBOOK NQ] ⏰ Força Pré-Mercado T-15m ({t15Dt:dd/MM HH:mm}) carregada em RAM: {_pbForcaT15m:F1}%");
										}
									}

									// 4. Atualiza a telemetria do painel mesmo sem novos ticks
									UpdatePlaybookStatusTelemetry();
									ChartControl?.Dispatcher.InvokeAsync(() =>
									{
										try
										{
											if (_tbPlaybook != null && _sepPlaybook != null && currentEstrategia == estrategiaMode.PlaybookNasdaq && !string.IsNullOrWhiteSpace(_pPlaybookText))
											{
												_sepPlaybook.Visibility = Visibility.Visible;
												_tbPlaybook.Visibility  = Visibility.Visible;
												_tbPlaybook.Text        = _pPlaybookText;
												_tbPlaybook.Foreground  = _pPlaybookBrush;
											}
										}
										catch {}
									});

									await Task.Delay(3000);
								}
								catch
								{
									await Task.Delay(4000);
								}
							}
						});
					}
					DebugPrint("[PLAYBOOK NQ] ✅ Estratégia Playbook Nasdaq Force inicializada.");
				}

				private void StopPlaybookNasdaqPolling()
				{
					_pbPollingActive = false;
				}

				private void ResetPlaybookNasdaqDailyState(DateTime sessionDate)
				{
					_pbCurrentSessionDate = sessionDate.Date;
					_pbForcaAsia = -1.0;
					_pbForcaT15m = -1.0;
					_pbT0EvaluatedToday = false;
					_pbT0TriggeredToday = false;
					_pbM5EvaluatedToday = false;
					_pbM5TriggeredToday = false;

					_pbOr15TempHigh = double.MinValue;
					_pbOr15TempLow  = double.MaxValue;
					_pbOr15High     = 0.0;
					_pbOr15Low      = 0.0;
					_pbOr15Mid      = 0.0;
					_pbOr15RangePts = 0.0;
					_pbOr15Q25Pts   = 0.0;
					_pbOr15Consolidated = false;
					_pbOr15FirstTouchUsed = false;
					_pbOr15BreakoutUsed   = false;
					_pbLastProcessedOrBar = -1;

					_pbActiveTradeMaxExitTime = DateTime.MinValue;
					_pbOr15BreakevenArmed     = false;
					_pbOr15BreakevenTriggered = false;
					_pbOr15BreakevenTriggerPrice = 0.0;
					_pbOr15EntryPrice         = 0.0;
					_pbOr15Direction          = 0;

					RemoveDrawObject("PB_OR15_High");
					RemoveDrawObject("PB_OR15_Low");
					RemoveDrawObject("PB_OR15_Mid");
					RemoveDrawObject("PB_OR15_Q25_Top");
					RemoveDrawObject("PB_OR15_Q25_Bot");
				}

				// Detecta horário de verão dos EUA (EDT: 2º domingo de março até 1º domingo de novembro)
				private bool IsUsDaylightSavingTime(DateTime date)
				{
					int year = date.Year;
					DateTime march1 = new DateTime(year, 3, 1);
					int daysUntilFirstSundayMarch = ((int)DayOfWeek.Sunday - (int)march1.DayOfWeek + 7) % 7;
					DateTime secondSundayMarch = march1.AddDays(daysUntilFirstSundayMarch + 7);

					DateTime nov1 = new DateTime(year, 11, 1);
					int daysUntilFirstSundayNov = ((int)DayOfWeek.Sunday - (int)nov1.DayOfWeek + 7) % 7;
					DateTime firstSundayNov = nov1.AddDays(daysUntilFirstSundayNov);

					return date.Date >= secondSundayMarch.Date && date.Date < firstSundayNov.Date;
				}

				private (TimeSpan nyOpen, TimeSpan asiaOpen) GetPlaybookSessionTimes(DateTime date)
				{
					if (!PB_AutoDST_EUA)
					{
						return (
							new TimeSpan(PB_HoraAberturaManual.Hour, PB_HoraAberturaManual.Minute, 0),
							new TimeSpan(PB_HoraAsiaManual.Hour, PB_HoraAsiaManual.Minute, 0)
						);
					}

					bool isEdt = IsUsDaylightSavingTime(date);
					// Em EDT (Verão EUA): Cash NY abre às 10:30 BRT e Sessão Asiática/Globex às 19:00 BRT
					// Em EST (Inverno EUA): Cash NY abre às 11:30 BRT e Sessão Asiática/Globex às 20:00 BRT
					return isEdt
						? (new TimeSpan(10, 30, 0), new TimeSpan(19, 0, 0))
						: (new TimeSpan(11, 30, 0), new TimeSpan(20, 0, 0));
				}

				private DateTime GetPreviousTradingEvening(DateTime currentDay, TimeSpan asiaOpen)
				{
					DateTime prev = currentDay.Date.AddDays(-1);
					// Se hoje é segunda-feira, a abertura asiática ocorreu no domingo à noite (mesmo prev = domingo)
					return prev.Date + asiaOpen;
				}

				private void UpdatePlaybookStatusTelemetry()
				{
					DateTime nowBrt = DateTime.UtcNow.AddHours(-3);
					var (nyOpen, asiaOpen) = GetPlaybookSessionTimes(nowBrt);
					TimeSpan ctNow = nowBrt.TimeOfDay;
					TimeSpan or15End = nyOpen + TimeSpan.FromMinutes(15);
					TimeSpan t15Horario = nyOpen - TimeSpan.FromMinutes(15);

					NasdaqForceSnapshot liveSnap = AxionNasdaqForceCache.LatestRealtime.IsValid 
						? AxionNasdaqForceCache.LatestRealtime 
						: AxionNasdaqForceCache.GetAtOrBefore(nowBrt, 15, true);

					bool isEs = IsEsAsset();
					string nomeAtivoPerfil = isEs ? "S&P 500 (ES/MES)" : "NASDAQ (NQ/MNQ)";
					string nomeAtivoCurto  = isEs ? "ES" : "NQ";
					string faseStr = ctNow < nyOpen ? "PRÉ-ABERTURA" : (ctNow < or15End ? "FORMANDO OR15" : "OPERANDO OR15");

					// 1. Ásia
					string asiaStr;
					if (_pbForcaAsia >= 0)
					{
						string bias = _pbForcaAsia >= 52.0 ? "Compradora" : (_pbForcaAsia <= 48.0 ? "Vendedora" : "Neutra");
						asiaStr = $"{_pbForcaAsia:F1}% ({bias})";
					}
					else
					{
						asiaStr = "Consultando...";
					}

					// 2. Pré-Mercado T-15m
					string t15Str;
					if (_pbForcaT15m >= 0)
					{
						string bias = _pbForcaT15m >= 52.0 ? "Compradora" : (_pbForcaT15m <= 48.0 ? "Vendedora" : "Neutra");
						t15Str = $"{_pbForcaT15m:F1}% ({bias})";
					}
					else
					{
						t15Str = ctNow < t15Horario ? $"Aguardando {t15Horario:hh\\:mm} BRT" : "Capturando...";
					}

					// 3. Força Atual do Ativo (Individual) + Cesta Geral
					string forcaAtualStr;
					string forcaTechStr;
					if (liveSnap.IsValid)
					{
						double fAtivo = isEs ? liveSnap.ForcaSP500Compra : liveSnap.ForcaNQCompra;
						forcaAtualStr = $"{fAtivo:F1}% ({nomeAtivoCurto}) | Cesta: {liveSnap.ForcaFinalCompra:F1}%";
						forcaTechStr  = $"{liveSnap.ForcaTechMediaCompra:F1}% (Média 7 Techs)";
					}
					else
					{
						forcaAtualStr = "Sincronizando...";
						forcaTechStr  = "Sincronizando...";
					}

					// 4. Status T0
					string statusT0;
					if (_pbForcaAsia >= 52.0 && _pbForcaT15m >= 52.0)
						statusT0 = "🟢 ALINHADO COMPRA (T0 Pronto)";
					else if (_pbForcaAsia <= 48.0 && _pbForcaT15m <= 48.0 && _pbForcaAsia >= 0 && _pbForcaT15m >= 0)
						statusT0 = "🔴 ALINHADO VENDA (T0 Pronto)";
					else if (_pbForcaAsia >= 0 && _pbForcaT15m >= 0)
						statusT0 = "🟡 DIVERGENTE (Aguardará M5/OR15)";
					else
						statusT0 = "⚪ Monitorando Sessões";

					_pPlaybookText = $"{nomeAtivoPerfil} • {faseStr} ({nyOpen:hh\\:mm} BRT)\n" +
					                 $"• Sessão Ásia:        {asiaStr}\n" +
					                 $"• Pré-Mercado (T-15m): {t15Str}\n" +
					                 $"• Atual Ativo:        {forcaAtualStr}\n" +
					                 $"• Big Techs:          {forcaTechStr}\n" +
					                 $"• Gatilho T0:         {statusT0}" +
					                 (_pbOr15Consolidated ? $"\n• OR15: Range {_pbOr15RangePts:F1} pts | 50%={_pbOr15Mid:F1} | 25%={_pbOr15Q25Pts:F1}" : "");

					_pPlaybookBrush = (liveSnap.IsValid && liveSnap.ForcaFinalCompra >= 52.0) ? Brushes.Lime : ((liveSnap.IsValid && liveSnap.ForcaFinalCompra <= 48.0) ? Brushes.Red : Brushes.Yellow);
				}

				private void DrawPlaybookOR15Levels()
				{
					if (!PB_DesenharNiveisOR15 || !_pbOr15Consolidated || _pbOr15High <= 0 || _pbOr15Low <= 0) return;

					double q25Top = _pbOr15High - _pbOr15Q25Pts;
					double q25Bot = _pbOr15Low  + _pbOr15Q25Pts;

					Draw.Line(this, "PB_OR15_High",    false, 15, _pbOr15High, -40, _pbOr15High, Brushes.Crimson,        DashStyleHelper.Solid, 2);
					Draw.Line(this, "PB_OR15_Low",     false, 15, _pbOr15Low,  -40, _pbOr15Low,  Brushes.SeaGreen,       DashStyleHelper.Solid, 2);
					Draw.Line(this, "PB_OR15_Mid",     false, 15, _pbOr15Mid,  -40, _pbOr15Mid,  Brushes.Gold,           DashStyleHelper.Dash,  2);
					Draw.Line(this, "PB_OR15_Q25_Top", false, 15, q25Top,      -40, q25Top,      Brushes.DodgerBlue,     DashStyleHelper.Dot,   1);
					Draw.Line(this, "PB_OR15_Q25_Bot", false, 15, q25Bot,      -40, q25Bot,      Brushes.DodgerBlue,     DashStyleHelper.Dot,   1);
				}

				private bool IsEsAsset()
				{
					try
					{
						if (PB_PerfilAtivo == PlaybookAtivoMode.Sp500_ES_MES) return true;
						if (PB_PerfilAtivo == PlaybookAtivoMode.Nasdaq_NQ_MNQ) return false;
						if (Instrument == null) return false;
						string sym = (Instrument.MasterInstrument != null ? Instrument.MasterInstrument.Name : (Instrument.FullName ?? "")).ToUpperInvariant();
						if (sym.StartsWith("ES") || sym.StartsWith("MES") || sym.Contains("SP500") || sym.Contains("S&P") || sym.Contains("MICRO S&P"))
							return true;
						if (Instrument.MasterInstrument != null && (Math.Abs(Instrument.MasterInstrument.PointValue - 50.0) < 0.01 || Math.Abs(Instrument.MasterInstrument.PointValue - 5.0) < 0.01))
							return true;
						return false;
					}
					catch { return false; }
				}

				private double GetOr15ReversaoMinPts()
				{
					if (PB_OR15_ReversaoMinRangePts > 0) return PB_OR15_ReversaoMinRangePts;
					return IsEsAsset() ? 15.0 : 60.0;
				}

				private double GetOr15CaixaComprimidaMaxPts()
				{
					if (PB_OR15_CaixaComprimidaMaxPts > 0) return PB_OR15_CaixaComprimidaMaxPts;
					return IsEsAsset() ? 20.0 : 120.0;
				}

				private double GetOr15CaixaExplosivaMinPts()
				{
					if (PB_OR15_CaixaExplosivaMinPts > 0) return PB_OR15_CaixaExplosivaMinPts;
					return IsEsAsset() ? 30.0 : 180.0;
				}

				private void ProcessPlaybookNasdaq()
				{
					if (BarsInProgress != 0 || CurrentBar < 2) return;


					DateTime barTime = Time[0];
					DateTime refTime = (isLiveTrading && currentBrokerTime != DateTime.MinValue) ? currentBrokerTime : barTime;
					DateTime today   = barTime.Date;

					if (_pbCurrentSessionDate != today)
					{
						ResetPlaybookNasdaqDailyState(today);
					}

					// Sincroniza dia apenas se estiver em LiveTrading e em background (NUNCA bloqueia a thread do gráfico)
					if (isLiveTrading)
					{
						AxionNasdaqForceCache.RequestDayFetchAsync(supabaseUrl, supabaseServiceKey, PB_InstanceId, today, DebugPrint);
					}

					var (nyOpen, asiaOpen) = GetPlaybookSessionTimes(today);
					TimeSpan ctBar = barTime.TimeOfDay;
					TimeSpan ctRef = refTime.TimeOfDay;

					// ── 0. GERENCIAMENTO DE POSIÇÃO ABERTA (SAÍDA POR TEMPO E BREAKEVEN PARCIAL OR15) ──
					if (Position.MarketPosition != MarketPosition.Flat)
					{
						// Saída por tempo (T0 Scalp 5m / Swing 60m / M5 60m)
						if (_pbActiveTradeMaxExitTime != DateTime.MinValue && barTime >= _pbActiveTradeMaxExitTime)
						{
							DebugPrint($"[PLAYBOOK NQ] ⏱️ Tempo máximo da operação atingido ({barTime:HH:mm:ss}). Encerrando posição...");
							if (Position.MarketPosition == MarketPosition.Long)  ExitLong("PB_TimeExit", "");
							if (Position.MarketPosition == MarketPosition.Short) ExitShort("PB_TimeExit", "");
							_pbActiveTradeMaxExitTime = DateTime.MinValue;
							_pbOr15BreakevenArmed = false;
							return;
						}

						// Breakeven automático ao atingir 25% da OR (50% da Metade) na gestão Parcial/BE da OR15
						if (_pbOr15BreakevenArmed && !_pbOr15BreakevenTriggered)
						{
							double currP = Position.MarketPosition == MarketPosition.Long ? GetCurrentBid() : GetCurrentAsk();
							if (currP <= 0) currP = Close[0];

							bool hitQ25 = (_pbOr15Direction == 1 && (currP >= _pbOr15BreakevenTriggerPrice || High[0] >= _pbOr15BreakevenTriggerPrice))
							           || (_pbOr15Direction == -1 && (currP <= _pbOr15BreakevenTriggerPrice || Low[0] <= _pbOr15BreakevenTriggerPrice));

							if (hitQ25)
							{
								double bePrice = Math.Round(Position.AveragePrice / TickSize) * TickSize;
								SetStopLossSafe("PB_OR15_P2", CalculationMode.Price, bePrice, false);
								SetStopLossSafe("PB_OR15_Single", CalculationMode.Price, bePrice, false);
								_pbOr15BreakevenTriggered = true;
								DebugPrint($"[PLAYBOOK NQ] 🛡️ Alvo Parcial (25% OR) atingido! Stop movido para Breakeven @ {bePrice:F2}");
							}
						}
					}
					else
					{
						_pbActiveTradeMaxExitTime = DateTime.MinValue;
						_pbOr15BreakevenArmed     = false;
						_pbOr15BreakevenTriggered = false;
					}

					// ── 1. CAPTURA DE FORÇA ÁSIA E FORÇA PRÉ-OPEN (T-15m) ──
					if (_pbForcaAsia < 0)
					{
						DateTime asiaDt = GetPreviousTradingEvening(today, asiaOpen);
						NasdaqForceSnapshot snapAsia = AxionNasdaqForceCache.RequestSpecificMinuteAsync(supabaseUrl, supabaseServiceKey, PB_InstanceId, asiaDt, 30, DebugPrint);
						if (snapAsia.IsValid)
						{
							_pbForcaAsia = snapAsia.ForcaFinalCompra;
							DebugPrint($"[PLAYBOOK NQ] 🌏 Força Ásia ({asiaDt:dd/MM HH:mm}) carregada e armazenada em RAM: {_pbForcaAsia:F1}%");
						}
					}

					TimeSpan t15Span = nyOpen - TimeSpan.FromMinutes(15);
					if (_pbForcaT15m < 0 && ctBar >= t15Span)
					{
						DateTime t15Dt = today + t15Span;
						NasdaqForceSnapshot snapT15 = AxionNasdaqForceCache.RequestSpecificMinuteAsync(supabaseUrl, supabaseServiceKey, PB_InstanceId, t15Dt, 15, DebugPrint);
						if (!snapT15.IsValid && isLiveTrading)
							snapT15 = AxionNasdaqForceCache.GetAtOrBefore(t15Dt, 15, true);
						if (snapT15.IsValid)
						{
							_pbForcaT15m = snapT15.ForcaFinalCompra;
							DebugPrint($"[PLAYBOOK NQ] ⏰ Força Pré-Mercado T-15m ({t15Dt:dd/MM HH:mm}) carregada e armazenada em RAM: {_pbForcaT15m:F1}%");
						}
					}

					// ── 2. ACUMULAÇÃO DA CAIXA DOS PRIMEIROS 15 MINUTOS (OR15: nyOpen -> nyOpen + 15m) ──
					TimeSpan or15End = nyOpen + TimeSpan.FromMinutes(15);
					// Em velas de 1m do NinjaTrader (timestamp de fechamento), a 1ª vela de 1m da abertura fecha em nyOpen + 1m e a 15ª em nyOpen + 15m
					if (ctBar > nyOpen && ctBar <= or15End)
					{
						if (High[0] > _pbOr15TempHigh) _pbOr15TempHigh = High[0];
						if (Low[0]  < _pbOr15TempLow)  _pbOr15TempLow  = Low[0];
					}

					if (!_pbOr15Consolidated && ctBar >= or15End && _pbOr15TempHigh > double.MinValue && _pbOr15TempLow < double.MaxValue)
					{
						_pbOr15High     = _pbOr15TempHigh;
						_pbOr15Low      = _pbOr15TempLow;
						_pbOr15RangePts = _pbOr15High - _pbOr15Low;
						_pbOr15Mid      = (_pbOr15High + _pbOr15Low) / 2.0; // 50% da OR (OR_Mid)
						_pbOr15Q25Pts   = 0.25 * _pbOr15RangePts;           // 25% da OR (50% da Metade)
						_pbOr15Consolidated = true;

						DebugPrint($"[PLAYBOOK NQ] 📦 OR15 Consolidada ({nyOpen:hh\\:mm}-{or15End:hh\\:mm}) | " +
							$"ORH: {_pbOr15High:F2} | ORL: {_pbOr15Low:F2} | Range: {_pbOr15RangePts:F2} pts | " +
							$"50% (Mid): {_pbOr15Mid:F2} | 25% (50% da Metade): {_pbOr15Q25Pts:F2} pts");

						DrawPlaybookOR15Levels();
					}

					// Atualiza painel de status com telemetria ao vivo do Playbook
					UpdatePlaybookStatusTelemetry();

					// Se já atingiu limite de operações na sessão ou já está posicionado, não abre nova entrada
					if (QuantOperacoes >= MaxOrderSession || Position.MarketPosition != MarketPosition.Flat || HasAccountPositionOrOrders())
						return;

					// =================================================================
					// CRONOLOGIA 1 — ENTRADA NO 1º SEGUNDO DA ABERTURA (T0 = nyOpen)
					// =================================================================
					bool naJanelaT0 = (ctRef >= nyOpen && ctRef <= nyOpen + TimeSpan.FromMinutes(2))
					               || (ctBar >= nyOpen && ctBar <= nyOpen + TimeSpan.FromMinutes(1));

					if (PB_OperarAberturaT0 && !_pbT0EvaluatedToday && naJanelaT0)
					{
						_pbT0EvaluatedToday = true;

						if (_pbForcaAsia > 0 && _pbForcaT15m > 0)
						{
							int dirT0 = 0;
							if (_pbForcaAsia >= PB_T0_ForcaMinCompra && _pbForcaT15m >= PB_T0_ForcaMinCompra)
								dirT0 = 1; // COMPRA T0
							else if (_pbForcaAsia <= PB_T0_ForcaMaxVenda && _pbForcaT15m <= PB_T0_ForcaMaxVenda)
								dirT0 = -1; // VENDA T0

							bool dirPermitida = (dirT0 == 1 && (currentOperatingMode == OperatingMode.Comprado || currentOperatingMode == OperatingMode.Ambos))
							                 || (dirT0 == -1 && (currentOperatingMode == OperatingMode.Vendido || currentOperatingMode == OperatingMode.Ambos));

							if (dirT0 != 0 && dirPermitida)
							{
								int slTicksT0 = SL_Ticks;
								int tpTicksT0 = TP_Ticks;
								int maxMinT0  = 60;
								bool isEs     = IsEsAsset();

								switch (PB_T0_ModoGestao)
								{
									case PlaybookT0Mode.Auto_ConformeAtivo:
										if (isEs)
										{
											tpTicksT0 = (int)Math.Round(22.0 / TickSize); // 22 pts = 88 ticks
											slTicksT0 = (int)Math.Round(14.0 / TickSize); // 14 pts = 56 ticks
											maxMinT0  = 60;
										}
										else
										{
											tpTicksT0 = (int)Math.Round(130.0 / TickSize); // 130 pts = 520 ticks
											slTicksT0 = (int)Math.Round(85.0  / TickSize); // 85 pts  = 340 ticks
											maxMinT0  = 60;
										}
										break;

									case PlaybookT0Mode.Auto_Scalp5m:
										if (isEs)
										{
											tpTicksT0 = (int)Math.Round(7.0 / TickSize); // 7 pts = 28 ticks
											slTicksT0 = (int)Math.Round(7.0 / TickSize); // 7 pts = 28 ticks
											maxMinT0  = 5;
										}
										else
										{
											tpTicksT0 = (int)Math.Round(45.0 / TickSize); // 45 pts = 180 ticks
											slTicksT0 = (int)Math.Round(45.0 / TickSize); // 45 pts = 180 ticks
											maxMinT0  = 5;
										}
										break;

									case PlaybookT0Mode.NQ_Swing60m_130x85pts:
										tpTicksT0 = (int)Math.Round(130.0 / TickSize);
										slTicksT0 = (int)Math.Round(85.0  / TickSize);
										maxMinT0  = 60;
										break;

									case PlaybookT0Mode.NQ_Scalp5m_45x45pts:
										tpTicksT0 = (int)Math.Round(45.0 / TickSize);
										slTicksT0 = (int)Math.Round(45.0 / TickSize);
										maxMinT0  = 5;
										break;

									case PlaybookT0Mode.ES_Swing60m_22x14pts:
										tpTicksT0 = (int)Math.Round(22.0 / TickSize); // 88 ticks
										slTicksT0 = (int)Math.Round(14.0 / TickSize); // 56 ticks
										maxMinT0  = 60;
										break;

									case PlaybookT0Mode.ES_Scalp5m_7x7pts:
										tpTicksT0 = (int)Math.Round(7.0 / TickSize); // 28 ticks
										slTicksT0 = (int)Math.Round(7.0 / TickSize); // 28 ticks
										maxMinT0  = 5;
										break;

									case PlaybookT0Mode.Customizado_Ticks:
										tpTicksT0 = Math.Max(1, PB_T0_CustomTpTicks);
										slTicksT0 = Math.Max(1, PB_T0_CustomSlTicks);
										maxMinT0  = Math.Max(1, PB_T0_CustomMaxMinutos);
										break;

									case PlaybookT0Mode.RoboFixoTicks:
									default:
										tpTicksT0 = TP_Ticks;
										slTicksT0 = SL_Ticks;
										maxMinT0  = 60;
										break;
								}

								ExecutarOrdemPlaybookSimples(dirT0, "PB_T0", slTicksT0, tpTicksT0, today + nyOpen + TimeSpan.FromMinutes(maxMinT0));
								_pbT0TriggeredToday = true;
								DebugPrint($"[PLAYBOOK NQ] 🚀 [ETAPA 1 - T0] {(dirT0 == 1 ? "COMPRA" : "VENDA")} executada na abertura! " +
									$"Ásia={_pbForcaAsia:F1}% | T-15m={_pbForcaT15m:F1}% | TP={tpTicksT0}tk | SL={slTicksT0}tk");
								return;
							}
							else
							{
								DebugPrint($"[PLAYBOOK NQ] ⏸️ [ETAPA 1 - T0] Sem alinhamento Ásia ({_pbForcaAsia:F1}%) + T-15m ({_pbForcaT15m:F1}%). Aguardando M5/OR15.");
							}
						}
					}

					// =================================================================
					// CRONOLOGIA 2 — CONFIRMAÇÃO NO M5 (T+5m = nyOpen + 5 min)
					// =================================================================
					TimeSpan m5Time = nyOpen + TimeSpan.FromMinutes(5);
					bool naJanelaM5 = (ctBar >= m5Time && ctBar <= m5Time + TimeSpan.FromMinutes(2));

					if (PB_OperarConfirmacaoM5 && !_pbM5EvaluatedToday && naJanelaM5)
					{
						_pbM5EvaluatedToday = true;

						if (PB_M5_ApenasSeT0NaoEntrou && _pbT0TriggeredToday)
						{
							DebugPrint("[PLAYBOOK NQ] ℹ️ [ETAPA 2 - M5] Ignorada pois o T0 já operou hoje.");
						}
						else
						{
							NasdaqForceSnapshot snapM5 = AxionNasdaqForceCache.GetAtOrBefore(today + m5Time, 5, isLiveTrading);
							if (snapM5.IsValid)
							{
								int dirM5 = 0;
								if (snapM5.ForcaFinalCompra >= PB_M5_ForcaFinalCompra && snapM5.ForcaTechMediaCompra >= PB_M5_ForcaTechCompra)
									dirM5 = 1; // COMPRA M5
								else if (snapM5.ForcaFinalCompra <= PB_M5_ForcaFinalVenda && snapM5.ForcaTechMediaCompra <= PB_M5_ForcaTechVenda)
									dirM5 = -1; // VENDA M5

								bool dirPermitida = (dirM5 == 1 && (currentOperatingMode == OperatingMode.Comprado || currentOperatingMode == OperatingMode.Ambos))
								                 || (dirM5 == -1 && (currentOperatingMode == OperatingMode.Vendido || currentOperatingMode == OperatingMode.Ambos));

								if (dirM5 != 0 && dirPermitida)
								{
									int tpTicksM5 = 0;
									int slTicksM5 = 0;
									bool isEsM5   = IsEsAsset();

									if (PB_M5_ModoGestao == PlaybookM5Mode.Customizado_Ticks && PB_M5_TpTicks > 0 && PB_M5_SlTicks > 0)
									{
										tpTicksM5 = PB_M5_TpTicks;
										slTicksM5 = PB_M5_SlTicks;
									}
									else if (PB_M5_ModoGestao == PlaybookM5Mode.Customizado_Pontos)
									{
										double tpPts = PB_M5_TpPontos;
										double slPts = PB_M5_SlPontos;
										if (isEsM5 && (tpPts > 35.0 || slPts > 25.0))
										{
											tpPts = 12.0;
											slPts = 10.0;
											DebugPrint($"[PLAYBOOK ES] ⚠️ Ajuste defensivo: Pontos M5 ({PB_M5_TpPontos}/{PB_M5_SlPontos}) reduzidos para escala ES (12x10 pts).");
										}
										tpTicksM5 = tpPts > 0 ? (int)Math.Round(tpPts / TickSize) : 0;
										slTicksM5 = slPts > 0 ? (int)Math.Round(slPts / TickSize) : (isEsM5 ? 40 : SL_Ticks);
									}
									else // Auto_ConformeAtivo
									{
										if (isEsM5)
										{
											tpTicksM5 = (int)Math.Round(7.0 / TickSize); // 28 ticks (7.0 pts)
											slTicksM5 = (int)Math.Round(7.0 / TickSize); // 28 ticks (7.0 pts)
										}
										else
										{
											tpTicksM5 = (int)Math.Round(110.0 / TickSize); // 440 ticks (110 pts)
											slTicksM5 = (int)Math.Round(75.0  / TickSize); // 300 ticks (75 pts)
										}
									}
									DateTime exitM5 = today + m5Time + TimeSpan.FromMinutes(PB_M5_DuracaoMaxMinutos);

									ExecutarOrdemPlaybookSimples(dirM5, "PB_M5", slTicksM5, tpTicksM5, exitM5);
									_pbM5TriggeredToday = true;
									DebugPrint($"[PLAYBOOK NQ] 🚀 [ETAPA 2 - M5] {(dirM5 == 1 ? "COMPRA" : "VENDA")} confirmada em T+5m! " +
										$"Força={snapM5.ForcaFinalCompra:F1}% | 7Techs={snapM5.ForcaTechMediaCompra:F1}% | TP={tpTicksM5}tk | SL={slTicksM5}tk");
									return;
								}
								else
								{
									DebugPrint($"[PLAYBOOK NQ] ⏸️ [ETAPA 2 - M5] Sem confirmação em T+5m (Força={snapM5.ForcaFinalCompra:F1}%, Techs={snapM5.ForcaTechMediaCompra:F1}%).");
								}
							}
						}
					}

					// =================================================================
					// CRONOLOGIA 3 & 4 — OPERAÇÃO NA OR15 (REVERSÃO/FADE & BREAKOUT)
					// Com Gestão Dinâmica de 50% (OR_Mid) e 25% (50% da Metade)
					// =================================================================
					TimeSpan or15Limit = nyOpen + TimeSpan.FromMinutes(PB_OR15_JanelaMaxMinutos);
					if (!_pbOr15Consolidated || ctBar <= or15End || ctBar > or15Limit)
						return;

					// Avalia a cada barra fechada (ou 1x por barra) para precisão de fechamento dentro/fora da OR15
					if (CurrentBar == _pbLastProcessedOrBar) return;
					if (!IsFirstTickOfBar && isLiveTrading) return;
					_pbLastProcessedOrBar = CurrentBar;

					int barIdx = isLiveTrading ? 1 : 0; // Em live com IsFirstTickOfBar, avalia a barra [1] recém-fechada
					double barHigh  = High[barIdx];
					double barLow   = Low[barIdx];
					double barClose = Close[barIdx];
					DateTime evalTime = Time[barIdx];

					NasdaqForceSnapshot snapOr = AxionNasdaqForceCache.GetAtOrBefore(evalTime, 5, isLiveTrading);
					double fCompra = snapOr.IsValid ? snapOr.ForcaFinalCompra : 50.0;
					double fVenda  = 100.0 - fCompra;
					double tolPrice = 2 * TickSize;

					bool tocouHigh = barHigh >= (_pbOr15High - tolPrice);
					bool tocouLow  = barLow  <= (_pbOr15Low  + tolPrice);

					double revMinPts  = GetOr15ReversaoMinPts();
					double boxCompMax = GetOr15CaixaComprimidaMaxPts();
					double boxExplMin = GetOr15CaixaExplosivaMinPts();

					bool caixaComprimida = _pbOr15RangePts <= boxCompMax;
					bool caixaExplosiva  = _pbOr15RangePts >= boxExplMin;
					bool caixaElegivelBreakout = PB_OR15_BreakoutQualquerCaixa || caixaComprimida || caixaExplosiva;

					// ── TESTE DA MÁXIMA DOS 15 MINUTOS (ORH_15) ──
					if (tocouHigh)
					{
						bool fechouAcima = barClose > _pbOr15High;
						bool forcaForteCompra = fCompra >= PB_OR15_ForcaBreakoutMin;

						// CASO A: REVERSÃO / FADE NA MÁXIMA (1º Toque + Rejeitou/Fechou dentro OU Força Compra < 55%)
						if (PB_OperarOR15_Reversao && !_pbOr15FirstTouchUsed && (!fechouAcima || !forcaForteCompra) && _pbOr15RangePts >= revMinPts)
						{
							_pbOr15FirstTouchUsed = true;
							if (currentOperatingMode == OperatingMode.Vendido || currentOperatingMode == OperatingMode.Ambos)
							{
								ExecutarOrdemOR15(-1, "PB_OR15_FadeSell", _pbOr15High, today + or15Limit);
								DebugPrint($"[PLAYBOOK NQ] 🔄 [ETAPA 3 - OR15 REVERSÃO VENDA] Rejeição na ORH ({_pbOr15High:F2}) | " +
									$"Close={barClose:F2} | ForçaCompra={fCompra:F1}% | Range={_pbOr15RangePts:F1}pts");
								return;
							}
						}
						// CASO B: BREAKOUT DE COMPRA NA MÁXIMA (Fechou Fora + Força Compra >= 55% + Caixa Elegível)
						else if (PB_OperarOR15_Breakout && !_pbOr15BreakoutUsed && fechouAcima && forcaForteCompra && caixaElegivelBreakout)
						{
							_pbOr15FirstTouchUsed = true;
							_pbOr15BreakoutUsed   = true;
							if (currentOperatingMode == OperatingMode.Comprado || currentOperatingMode == OperatingMode.Ambos)
							{
								ExecutarOrdemOR15(1, "PB_OR15_BrkBuy", _pbOr15High, today + or15Limit);
								DebugPrint($"[PLAYBOOK NQ] 💥 [ETAPA 4 - OR15 BREAKOUT COMPRA] Rompimento da ORH ({_pbOr15High:F2}) | " +
									$"Close={barClose:F2} | ForçaCompra={fCompra:F1}% | Range={_pbOr15RangePts:F1}pts");
								return;
							}
						}
						else
						{
							_pbOr15FirstTouchUsed = true;
						}
					}

					// ── TESTE DA MÍNIMA DOS 15 MINUTOS (ORL_15) ──
					if (tocouLow)
					{
						bool fechouAbaixo = barClose < _pbOr15Low;
						bool forcaForteVenda = fVenda >= PB_OR15_ForcaBreakoutMin;

						// CASO A: REVERSÃO / FADE NA MÍNIMA (1º Toque + Rejeitou/Fechou dentro OU Força Venda < 55%)
						if (PB_OperarOR15_Reversao && !_pbOr15FirstTouchUsed && (!fechouAbaixo || !forcaForteVenda) && _pbOr15RangePts >= revMinPts)
						{
							_pbOr15FirstTouchUsed = true;
							if (currentOperatingMode == OperatingMode.Comprado || currentOperatingMode == OperatingMode.Ambos)
							{
								ExecutarOrdemOR15(1, "PB_OR15_FadeBuy", _pbOr15Low, today + or15Limit);
								DebugPrint($"[PLAYBOOK NQ] 🔄 [ETAPA 3 - OR15 REVERSÃO COMPRA] Rejeição na ORL ({_pbOr15Low:F2}) | " +
									$"Close={barClose:F2} | ForçaVenda={fVenda:F1}% | Range={_pbOr15RangePts:F1}pts");
								return;
							}
						}
						// CASO B: BREAKOUT DE VENDA NA MÍNIMA (Fechou Fora + Força Venda >= 55% + Caixa Elegível)
						else if (PB_OperarOR15_Breakout && !_pbOr15BreakoutUsed && fechouAbaixo && forcaForteVenda && caixaElegivelBreakout)
						{
							_pbOr15FirstTouchUsed = true;
							_pbOr15BreakoutUsed   = true;
							if (currentOperatingMode == OperatingMode.Vendido || currentOperatingMode == OperatingMode.Ambos)
							{
								ExecutarOrdemOR15(-1, "PB_OR15_BrkSell", _pbOr15Low, today + or15Limit);
								DebugPrint($"[PLAYBOOK NQ] 💥 [ETAPA 4 - OR15 BREAKOUT VENDA] Rompimento da ORL ({_pbOr15Low:F2}) | " +
									$"Close={barClose:F2} | ForçaVenda={fVenda:F1}% | Range={_pbOr15RangePts:F1}pts");
								return;
							}
						}
						else
						{
							_pbOr15FirstTouchUsed = true;
						}
					}
				}

				private void ExecutarOrdemPlaybookSimples(int direction, string signalName, int slTicks, int tpTicks, DateTime maxExitTime)
				{
					int qty = Math.Max(1, LOTE_Size);
					breakEvenTriggered = false;
					trailStopPrice = 0.0;
					trailStepCount = 0;

					// ✅ GARANTIA ABSOLUTA DE SL/TP: Aplica com signalName e global para a ordem
					if (slTicks > 0)
					{
						SetStopLoss(signalName, CalculationMode.Ticks, slTicks, false);
						SetStopLoss(CalculationMode.Ticks, slTicks);
					}
					if (tpTicks > 0)
					{
						SetProfitTarget(signalName, CalculationMode.Ticks, tpTicks, false);
						SetProfitTarget(CalculationMode.Ticks, tpTicks);
					}

					Order o = direction == 1
						? EnterLong(qty, signalName)
						: EnterShort(qty, signalName);

					if (o != null)
					{
						AddOrderToList(o);
						realtimeOrderIds.Add(o.Id);
						IncrementarQuantOperacoes();
						_pbActiveTradeMaxExitTime = maxExitTime;
						DebugPrint($"[PLAYBOOK {(IsEsAsset() ? "ES" : "NQ")}] 🎯 ORDEM DISPARADA ({signalName}) | Qtd={qty} | SL={slTicks}tk ({slTicks * TickSize:F2} pts) | TP={tpTicks}tk ({tpTicks * TickSize:F2} pts) | SaídaMax: {maxExitTime:HH:mm:ss}");
					}
				}

				// Executa operação na OR15 com a Matriz de Gestão de 50% (OR_Mid) e 25% (50% da Metade)
				private void ExecutarOrdemOR15(int direction, string baseSignal, double refBorderPrice, DateTime maxExitTime)
				{
					int totalLots = Math.Max(1, LOTE_Size);
					bool isEsOR   = IsEsAsset();
					int minFloor25 = isEsOR ? 4 : 10;
					int minFloor50 = isEsOR ? 8 : 20;
					int maxCap25   = isEsOR ? 40 : 200; // Trava máxima de segurança na OR15
					int maxCap50   = isEsOR ? 80 : 400;

					int ticks25 = Math.Min(maxCap25, Math.Max(minFloor25, (int)Math.Round(_pbOr15Q25Pts / TickSize)));          // 25% da OR (50% da Metade)
					int ticks50 = Math.Min(maxCap50, Math.Max(minFloor50, (int)Math.Round((_pbOr15RangePts * 0.50) / TickSize))); // 50% da OR (OR_Mid)

					int slTicks = ticks25;
					int tpSingleTicks = ticks50;
					bool usarParcial = false;

					switch (PB_OR15_ModoGestao)
					{
						case PlaybookOR15GestaoMode.Parcial25_BE_Final50_Stop25:
							usarParcial   = true;
							slTicks       = ticks25;
							tpSingleTicks = ticks50;
							break;
						case PlaybookOR15GestaoMode.Parcial25_BE_Final50_Stop50:
							usarParcial   = true;
							slTicks       = ticks50;
							tpSingleTicks = ticks50;
							break;
						case PlaybookOR15GestaoMode.Alvo25_Stop25_1para1:
							usarParcial   = false;
							slTicks       = ticks25;
							tpSingleTicks = ticks25;
							break;
						case PlaybookOR15GestaoMode.Alvo50_Stop25_2para1:
							usarParcial   = false;
							slTicks       = ticks25;
							tpSingleTicks = ticks50;
							break;
						case PlaybookOR15GestaoMode.Alvo50_Stop50_1para1:
							usarParcial   = false;
							slTicks       = ticks50;
							tpSingleTicks = ticks50;
							break;
					}

					breakEvenTriggered = false;
					trailStopPrice = 0.0;
					trailStepCount = 0;
					_pbActiveTradeMaxExitTime = maxExitTime;
					_pbOr15Direction  = direction;
					_pbOr15EntryPrice = Close[0];

					if (usarParcial && totalLots >= 2)
					{
						int lotsP1 = totalLots / 2;
						int lotsP2 = totalLots - lotsP1;

						SetStopLoss("PB_OR15_P1", CalculationMode.Ticks, slTicks, false);
						SetProfitTarget("PB_OR15_P1", CalculationMode.Ticks, ticks25, false);
						SetStopLoss(CalculationMode.Ticks, slTicks);

						SetStopLoss("PB_OR15_P2", CalculationMode.Ticks, slTicks, false);
						SetProfitTarget("PB_OR15_P2", CalculationMode.Ticks, ticks50, false);

						Order o1 = direction == 1 ? EnterLong(lotsP1, "PB_OR15_P1") : EnterShort(lotsP1, "PB_OR15_P1");
						Order o2 = direction == 1 ? EnterLong(lotsP2, "PB_OR15_P2") : EnterShort(lotsP2, "PB_OR15_P2");

						if (o1 != null) { AddOrderToList(o1); realtimeOrderIds.Add(o1.Id); }
						if (o2 != null) { AddOrderToList(o2); realtimeOrderIds.Add(o2.Id); }

						_pbOr15BreakevenArmed = true;
						_pbOr15BreakevenTriggered = false;
						_pbOr15BreakevenTriggerPrice = direction == 1
							? Close[0] + (ticks25 * TickSize)
							: Close[0] - (ticks25 * TickSize);

						IncrementarQuantOperacoes();
						DebugPrint($"[PLAYBOOK OR15 {(isEsOR ? "ES" : "NQ")}] 🎯 PARCIAL ARMADA | P1(Alvo 25%): {ticks25}tk ({ticks25 * TickSize:F2} pts) | P2(Alvo 50%): {ticks50}tk ({ticks50 * TickSize:F2} pts) | SL: {slTicks}tk ({slTicks * TickSize:F2} pts)");
					}
					else
					{
						SetStopLoss("PB_OR15_Single", CalculationMode.Ticks, slTicks, false);
						SetProfitTarget("PB_OR15_Single", CalculationMode.Ticks, tpSingleTicks, false);
						SetStopLoss(CalculationMode.Ticks, slTicks);
						SetProfitTarget(CalculationMode.Ticks, tpSingleTicks);

						Order o = direction == 1 ? EnterLong(totalLots, "PB_OR15_Single") : EnterShort(totalLots, "PB_OR15_Single");
						if (o != null)
						{
							AddOrderToList(o);
							realtimeOrderIds.Add(o.Id);
							IncrementarQuantOperacoes();
							DebugPrint($"[PLAYBOOK OR15 {(isEsOR ? "ES" : "NQ")}] 🎯 SINGLE ARMADA | TP: {tpSingleTicks}tk ({tpSingleTicks * TickSize:F2} pts) | SL: {slTicks}tk ({slTicks * TickSize:F2} pts)");
						}

						if (usarParcial)
						{
							// Se LOTE_Size == 1 mas modo Parcial+BE está ativo, move para BE ao atingir 25% da OR
							_pbOr15BreakevenArmed = true;
							_pbOr15BreakevenTriggered = false;
							_pbOr15BreakevenTriggerPrice = direction == 1
								? Close[0] + (ticks25 * TickSize)
								: Close[0] - (ticks25 * TickSize);
						}
					}
				}
				#endregion

		        #region Properties
				// ── 01. GERAL ────────────────────────────────────────
				[Browsable(true)]
				[NinjaScriptProperty]
				[Range(0, 5000)]
				[Display(Name="Painel Principal — X", Description="Posição horizontal em pixels do painel principal (0 = borda esquerda da janela)", Order=1, GroupName="01. GERAL")]
				public int Panel_Main_X { get; set; }
				
				[Browsable(true)]
				[NinjaScriptProperty]
				[Range(0, 5000)]
				[Display(Name="Painel Principal — Y", Description="Posição vertical em pixels do painel principal (0 = topo da janela)", Order=2, GroupName="01. GERAL")]
				public int Panel_Main_Y { get; set; }
				
				[NinjaScriptProperty]
				[Display(Name="Painel Principal — Visível", Description="Exibir ou ocultar o painel principal no gráfico", Order=3, GroupName="01. GERAL")]
				public bool Panel_Main_Show { get; set; }
				
				[Browsable(true)]
				[NinjaScriptProperty]
				[Range(0, 5000)]
				[Display(Name="Força 2D — X", Description="Posição horizontal em pixels do painel Força 2D", Order=4, GroupName="01. GERAL")]
				public int Panel_F2D_X { get; set; }
				
				[Browsable(true)]
				[NinjaScriptProperty]
				[Range(0, 5000)]
				[Display(Name="Força 2D — Y", Description="Posição vertical em pixels do painel Força 2D (padrão: abaixo do painel principal)", Order=5, GroupName="01. GERAL")]
				public int Panel_F2D_Y { get; set; }
				
				[NinjaScriptProperty]
				[Display(Name="Força 2D — Visível", Description="Exibir ou ocultar o painel Força 2D no gráfico (só aparece quando o filtro está ativo)", Order=6, GroupName="01. GERAL")]
				public bool Panel_F2D_Show { get; set; }
				
				[Browsable(true)]
				[NinjaScriptProperty]
				[Display(Name="Debug Mode", Order=7, GroupName="01. GERAL")]
				public bool DebugMode { get; set; }
				
				
				// ── 02. LICENÇA ────────────────────────────────────────────────────
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
				
				
				public enum gridFiltroMode { OFF, Consolidacao, Tendencia }
				public enum OperatingMode { Comprado, Vendido, Ambos }
				
				// ── 03. PARÂMETROS OPERAÇÃO ────────────────────────────────────────
				[NinjaScriptProperty]
				[Display(Name="Estratégia", Description="Nome da estratégia", Order=1, GroupName="03. PARÂMETROS OPERAÇÃO")]
				public string NomeEstrategia { get; set; }
				
				[Browsable(true)]
				[NinjaScriptProperty]
				[Display(Name="Modo de Operação", Description="Define se o robô opera Comprado, Vendido ou Ambos os sentidos", Order=2, GroupName="03. PARÂMETROS OPERAÇÃO")]
				public OperatingMode currentOperatingMode { get; set; }
				
				public enum estrategiaMode { ManualBox, Preço, GridScalper, FVGScalper, ConectorVM, ConectorLocal, SessaoHILO, PlaybookNasdaq }
				public enum SessaoHiloGatilhoMode { Toque, ToqueConfirmacaoCandle, FiltrosTecnicos }
				public enum PlaybookAtivoMode { AutoDetectar, Nasdaq_NQ_MNQ, Sp500_ES_MES, Customizado_Livre }
				public enum PlaybookT0Mode { Auto_ConformeAtivo, Auto_Scalp5m, NQ_Swing60m_130x85pts, NQ_Scalp5m_45x45pts, ES_Swing60m_22x14pts, ES_Scalp5m_7x7pts, Customizado_Ticks, RoboFixoTicks }
				public enum PlaybookM5Mode { Auto_ConformeAtivo, Customizado_Pontos, Customizado_Ticks }
				public enum PlaybookOR15GestaoMode { Parcial25_BE_Final50_Stop25, Parcial25_BE_Final50_Stop50, Alvo25_Stop25_1para1, Alvo50_Stop25_2para1, Alvo50_Stop50_1para1 }
				
				[Browsable(true)]
				[NinjaScriptProperty]
				[Display(Name="Estratégia", Description="Seleciona a estratégia de entrada utilizada pelo robô", Order=3, GroupName="03. PARÂMETROS OPERAÇÃO")]
				public estrategiaMode currentEstrategia { get; set; }
				
				[NinjaScriptProperty]
				[Range(1, int.MaxValue)]
				[Display(Name="Max Operações", Description="Máximo de Operações por Sessão de Horários", Order=4, GroupName="03. PARÂMETROS OPERAÇÃO")]
				public int MaxOrderSession { get; set; }
				
				public enum orderMode { Mercado, PendenteStop, PendenteLimit }
				
				[Browsable(true)]
				[NinjaScriptProperty]
				[Display(Name="Modo Ordens", Description="Mercado | PendenteStop = ordem stop pendente | PendenteLimit = ordem limit pendente", Order=5, GroupName="03. PARÂMETROS OPERAÇÃO")]
				public orderMode OrderMode { get; set; }
				
				[Browsable(true)]
				[NinjaScriptProperty]
				[Range(0, int.MaxValue)]
				[Display(Name="Distância Preço (Ticks)", Description="Distância em ticks do preço onde será posicionada a ordem pendente", Order=6, GroupName="03. PARÂMETROS OPERAÇÃO")]
				public int distancePrice { get; set; }
				
				[Browsable(true)]
				[NinjaScriptProperty]
				[Range(0, int.MaxValue)]
				[Display(Name="Expirar Ordens Pendentes (Barras)",
				Description="Cancela ordens pendentes após N barras sem execução. 0 = nunca expira. Válido para todas as estratégias.",
				Order=7, GroupName="03. PARÂMETROS OPERAÇÃO")]
				public int CancelAfterBars { get; set; }
				
				[NinjaScriptProperty]
				[Display(Name="Cancelar Ordens Após Horário de Parada", Description="Cancela ordens pendentes após o horário de parada do robô", Order=8, GroupName="03. PARÂMETROS OPERAÇÃO")]
				public bool CancelOrdersAfterStopTime { get; set; }
				
				[NinjaScriptProperty]
				[Display(Name="Enviar Sinais para o Indicador", Description="Se ativado, envia os sinais gerados para o indicador e respeita o estado ocupado da operação simulada", Order=9, GroupName="03. PARÂMETROS OPERAÇÃO")]
				public bool SendSignalsToIndicator { get; set; }
				
				// ── 04. RISCO ──────────────────────────────────────────────────────
				[NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="Contrato", Description="Quantidade de Contratos por operação", Order=1, GroupName="04. RISCO")]
				public int  LOTE_Size           { get; set; }
				[NinjaScriptProperty] [Range(0, int.MaxValue)] [Display(Name="SL (Ticks)", Description="Stop Loss em Ticks", Order=2, GroupName="04. RISCO")]
				public int  SL_Ticks            { get; set; }
				[NinjaScriptProperty] [Range(0, int.MaxValue)] [Display(Name="TP (Ticks)", Description="Take Profit em Ticks", Order=3, GroupName="04. RISCO")]
				public int  TP_Ticks            { get; set; }
				[NinjaScriptProperty] [Display(Name="TRAIL STOP", Description="Ativa o mecanismo de Trail Stop (Stop Gain dinâmico por degraus)", Order=4, GroupName="04. RISCO")]
				public bool TRAIL_MODE          { get; set; }
				[NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="TRAIL_Start (Ticks)", Description="Lucro mínimo em ticks para ativar o Trail Stop", Order=5, GroupName="04. RISCO")]
				public int  TRAIL_Start         { get; set; }
				[NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="TRAIL_StopDistance (Ticks)", Description="Distância em ticks do Stop Gain em relação ao preço (ex: 20 = stop 20 ticks abaixo)", Order=6, GroupName="04. RISCO")]
				public int  TRAIL_StopDistance  { get; set; }
				[NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="TRAIL_Step (Ticks)", Description="Movimento em ticks necessário para subir o stop em 1 degrau", Order=7, GroupName="04. RISCO")]
				public int  TRAIL_Step          { get; set; }
				
				// ── 05. SEGURANÇA ──────────────────────────────────────────────────
				[NinjaScriptProperty] [Display(Name="Encerrar por Balanço", Description="Ativa fechamento de todas as posições por Balanço Financeiro", Order=1, GroupName="05. SEGURANÇA")]
				public bool MoneyClosed         { get; set; }
				[NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="Perda Máxima", Description="Fecha todas as posições ao atingir o limite de perda em USD", Order=2, GroupName="05. SEGURANÇA")]
				public int  LossesAllOrders     { get; set; }
				[NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="Lucro Máximo", Description="Fecha todas as posições ao atingir o limite de lucro em USD", Order=3, GroupName="05. SEGURANÇA")]
				public int  ProfitAllOrders     { get; set; }
				[NinjaScriptProperty] [Display(Name="Perda Máxima Diária (Ativar)", Description="Ativa o limite de perda máxima por sessão diária. Reseta automaticamente a cada nova sessão.", Order=7, GroupName="05. SEGURANÇA")]
				public bool DailyLossActive { get; set; }
				[NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="Perda Máxima Diária (USD)", Description="Valor em USD de perda máxima permitida no dia. Ao atingir, fecha posições e bloqueia novas entradas até a próxima sessão.", Order=8, GroupName="05. SEGURANÇA")]
				public int DailyLossLimit { get; set; }
				[NinjaScriptProperty] [Display(Name="Lucro Máximo Diário (Ativar)", Description="Ativa o limite de lucro máximo por sessão diária. Reseta automaticamente a cada nova sessão.", Order=9, GroupName="05. SEGURANÇA")]
				public bool DailyProfitActive { get; set; }
				[NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="Lucro Máximo Diário (USD)", Description="Valor em USD de lucro máximo no dia. Ao atingir, fecha posições e bloqueia novas entradas até a próxima sessão.", Order=10, GroupName="05. SEGURANÇA")]
				public int DailyProfitLimit { get; set; }
				[NinjaScriptProperty] [Display(Name="MA Closed Position", Description="Ativa fechamento de lucro ao cruzar a Média Móvel", Order=4, GroupName="05. SEGURANÇA")]
				public bool OrderCloseMA        { get; set; }
				[NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="MA Profit Closed (Money)", Description="Lucro mínimo em dinheiro para acionar o fechamento por MA", Order=5, GroupName="05. SEGURANÇA")]
				public int  ProfitCloseMA       { get; set; }
				[NinjaScriptProperty] [Range(0, int.MaxValue)] [Display(Name="MA Profit Closed Period", Description="Período da SMA utilizada para o fechamento por MA", Order=6, GroupName="05. SEGURANÇA")]
				public int  ProfitCloseMAPeriod { get; set; }
				
				// ── 06. HORÁRIO DE OPERAÇÃO ────────────────────────────────────────
				public enum tsMode { Manual, Automatico, Importar }
				[NinjaScriptProperty]
				[Display(Name="Modo de Operação", Description="Manual = usa janelas fixas | Automático = filtra por win rate histórico", Order=0, GroupName="06. HORÁRIO DE OPERAÇÃO")]
				public tsMode TS_Mode { get; set; }
				
				[NinjaScriptProperty] [PropertyEditor("NinjaTrader.Gui.Tools.TimeEditorKey")] [Display(Name="Janela 1 - Início", Order=1, GroupName="06. HORÁRIO DE OPERAÇÃO")]
				public DateTime TIME_Start { get; set; }
				[NinjaScriptProperty] [Range(0, 59)] [Display(Name="Janela 1 - Segundos", Order=2, GroupName="06. HORÁRIO DE OPERAÇÃO")]
				public int Second_Start { get; set; }
				[NinjaScriptProperty] [PropertyEditor("NinjaTrader.Gui.Tools.TimeEditorKey")] [Display(Name="Janela 1 - Parada", Order=3, GroupName="06. HORÁRIO DE OPERAÇÃO")]
				public DateTime TIME_Stop { get; set; }
				[NinjaScriptProperty] [Display(Name="Janela 2 - Ativar", Order=4, GroupName="06. HORÁRIO DE OPERAÇÃO")]
				public bool Janela2Ativa { get; set; }
				[NinjaScriptProperty] [PropertyEditor("NinjaTrader.Gui.Tools.TimeEditorKey")] [Display(Name="Janela 2 - Início", Order=5, GroupName="06. HORÁRIO DE OPERAÇÃO")]
				public DateTime TIME_Start2 { get; set; }
				[NinjaScriptProperty] [PropertyEditor("NinjaTrader.Gui.Tools.TimeEditorKey")] [Display(Name="Janela 2 - Parada", Order=6, GroupName="06. HORÁRIO DE OPERAÇÃO")]
				public DateTime TIME_Stop2 { get; set; }
				[NinjaScriptProperty] [Display(Name="Importar — Nome do Arquivo", Order=7, GroupName="06. HORÁRIO DE OPERAÇÃO")]
				public string TS_ImportFileName { get; set; }
				[NinjaScriptProperty] [Range(1.0, 100.0)] [Display(Name="Filtro - Win Rate Mínimo (%)", Order=8, GroupName="06. HORÁRIO DE OPERAÇÃO")]
				public double TS_MinWinRate { get; set; }
				[NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="Filtro - Mínimo de Trades", Order=9, GroupName="06. HORÁRIO DE OPERAÇÃO")]
				public int TS_MinTrades { get; set; }
				[NinjaScriptProperty] [Range(0.0, 100.0)] [Display(Name="Filtro - % Resultado Líquido Mínimo", Order=10, GroupName="06. HORÁRIO DE OPERAÇÃO")]
				public double TS_MinNetProfitPercent { get; set; }
				[NinjaScriptProperty] [Display(Name="Filtro - Bloquear sem Dados", Order=11, GroupName="06. HORÁRIO DE OPERAÇÃO")]
				public bool TS_BlockIfNoData { get; set; }
				[NinjaScriptProperty] [Display(Name="Painel - Exibir Heatmap", Order=12, GroupName="06. HORÁRIO DE OPERAÇÃO")]
				public bool TS_ShowPanel { get; set; }
				[NinjaScriptProperty] [Range(0, 5000)] [Display(Name="Painel - Posição X", Order=13, GroupName="06. HORÁRIO DE OPERAÇÃO")]
				public int TS_Panel_X { get; set; }
				[NinjaScriptProperty] [Range(0, 5000)] [Display(Name="Painel - Posição Y", Order=14, GroupName="06. HORÁRIO DE OPERAÇÃO")]
				public int TS_Panel_Y { get; set; }
				
				[Browsable(true)]
				[NinjaScriptProperty]
				[Display(Name="Automático — Exportar ao Calcular", Order=15, GroupName="06. HORÁRIO DE OPERAÇÃO")]
				public bool TS_AutoExport { get; set; }
				
				[Browsable(true)]
				[NinjaScriptProperty]
				[Display(Name="Automático — Nome do Arquivo de Export", Order=16, GroupName="06. HORÁRIO DE OPERAÇÃO")]
				public string TS_ExportFileName { get; set; }
				
				// ── 07. FILTRO PVA ────────────────────────────────────────────────
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="PVA", Order=1, GroupName="07. FILTRO PVA")] public bool ACTIVE_Pva { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="SumBars (PVA)", Order=2, GroupName="07. FILTRO PVA")] public int PVA_SumBars { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(50, int.MaxValue)] [Display(Name="PVA Percentual", Order=3, GroupName="07. FILTRO PVA")] public int PVA_Percent { get; set; }
				
				// ── 08. TREND EXPLODE ─────────────────────────────────────────────
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="Explosion Trend", Order=1, GroupName="08. TREND EXPLODE")] public bool ACTIVE_Explosion { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="Sensitivity", Order=2, GroupName="08. TREND EXPLODE")] public int EXPLOSION_Sensitivity { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="FastPeriod", Order=3, GroupName="08. TREND EXPLODE")] public int EXPLOSION_FastPeriod { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="SlowPeriod", Order=4, GroupName="08. TREND EXPLODE")] public int EXPLOSION_SlowPeriod { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="FastSmooth", Order=5, GroupName="08. TREND EXPLODE")] public bool EXPLOSION_FastSmooth { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="FastSmoothLength", Order=6, GroupName="08. TREND EXPLODE")] public int EXPLOSION_FastSmoothLength { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="SlowSmooth", Order=7, GroupName="08. TREND EXPLODE")] public bool EXPLOSION_SlowSmooth { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="SlowSmoothLength", Order=8, GroupName="08. TREND EXPLODE")] public int EXPLOSION_SlowSmoothLength { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="ChannelLength", Order=9, GroupName="08. TREND EXPLODE")] public int EXPLOSION_ChannelLength { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(0.1, double.MaxValue)] [Display(Name="BB Mult", Order=10, GroupName="08. TREND EXPLODE")] public double EXPLOSION_Mult { get; set; }
				
				// ── 09. BLOCK BREAKOUT ─────────────────────────────────────────────
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="OB Active", Order=1, GroupName="09. BLOCK BREAKOUT")] public bool OB_Active { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(0, int.MaxValue)] [Display(Name="OB Limit Max (%)", Order=2, GroupName="09. BLOCK BREAKOUT")] public int OB_Limit_Max1 { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(0, int.MaxValue)] [Display(Name="OB Limit Min (%)", Order=3, GroupName="09. BLOCK BREAKOUT")] public int OB_Limit_Min1 { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(0, double.MaxValue)] [Display(Name="Range Min Size (Ticks)", Order=4, GroupName="09. BLOCK BREAKOUT")] public double OB_Range_MinSize1 { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(0, double.MaxValue)] [Display(Name="Range Max Size (Ticks)", Order=5, GroupName="09. BLOCK BREAKOUT")] public double OB_Range_MaxSize1 { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="Candle History", Order=6, GroupName="09. BLOCK BREAKOUT")] public int OB_CandleHistory1 { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="OB Pullback", Order=7, GroupName="09. BLOCK BREAKOUT")] public bool OB_PULLBACK1 { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="OB Breakout", Order=8, GroupName="09. BLOCK BREAKOUT")] public bool OB_BREAKOUT1 { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="OB Revert Analysis", Order=9, GroupName="09. BLOCK BREAKOUT")] public bool OB_Revert_Analysis1 { get; set; }
				
				// ── 10. BOX ────────────────────────────────────────────────────────
				[Browsable(true)] [NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="Altura Box em Ticks", Order=1, GroupName="10. BOX")] public int Box_ticks { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="Nome do Objeto", Order=2, GroupName="10. BOX")] public string Box_string { get; set; }
				
				// ── 11. HILO PRIOR PB/BK ───────────────────────────────────────────
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="HL Active", Order=1, GroupName="11. HILO PRIOR PB/BK")] public bool HL_Active1 { get; set; }
				public enum HL_ModeType { HL, HLCA }
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="HL Filter Type", Order=2, GroupName="11. HILO PRIOR PB/BK")] public HL_ModeType HL_FilterType { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(0, int.MaxValue)] [Display(Name="HL Limit Max(%)", Order=3, GroupName="11. HILO PRIOR PB/BK")] public int HL_Limit_Max1 { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(0, int.MaxValue)] [Display(Name="HL Limit Min(%)", Order=4, GroupName="11. HILO PRIOR PB/BK")] public int HL_Limit_Min1 { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(0, double.MaxValue)] [Display(Name="HL Range Min Size (Ticks)", Order=5, GroupName="11. HILO PRIOR PB/BK")] public double HL_Range_MinSize1 { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(0, double.MaxValue)] [Display(Name="HL Range Max Size (Ticks)", Order=6, GroupName="11. HILO PRIOR PB/BK")] public double HL_Range_MaxSize1 { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="HL Pullback", Order=7, GroupName="11. HILO PRIOR PB/BK")] public bool HL_PULLBACK1 { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="HL Breakout", Order=8, GroupName="11. HILO PRIOR PB/BK")] public bool HL_BREAKOUT1 { get; set; }
				
				// ── 12. RENKO FORCE ────────────────────────────────────────────────
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="Active", Order=1, GroupName="12. RENKO FORCE")] public bool RenkoForce { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="Período em Segundos", Order=2, GroupName="12. RENKO FORCE")] public int TimePeriodSeconds { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="Qtd de Candles", Order=3, GroupName="12. RENKO FORCE")] public int CandleThreshold { get; set; }
				
				// ── 13. MA CLOUD FILTER 1 ──────────────────────────────────────────
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="MACLOUD Filter", Order=1, GroupName="13. MA CLOUD FILTER 1")] public bool MACLOUD1_Filter { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(0, int.MaxValue)] [Display(Name="Minimum Range (Ticks)", Order=2, GroupName="13. MA CLOUD FILTER 1")] public int MACLOUD1_Min { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(0, int.MaxValue)] [Display(Name="Maximum Range (Ticks)", Order=3, GroupName="13. MA CLOUD FILTER 1")] public int MACLOUD1_Max { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(2, int.MaxValue)] [Display(Name="SMA Fast Period", Order=4, GroupName="13. MA CLOUD FILTER 1")] public int MACLOUD1_FastPeriod { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(2, int.MaxValue)] [Display(Name="SMA Slow Period", Order=5, GroupName="13. MA CLOUD FILTER 1")] public int MACLOUD1_SlowPeriod { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(0, int.MaxValue)] [Display(Name="MACLOUD BarShift", Order=6, GroupName="13. MA CLOUD FILTER 1")] public int MACLOUD1_BarShift { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="REVERSE Mode", Order=7, GroupName="13. MA CLOUD FILTER 1")] public bool Reverse_Mode1 { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="AVG Range", Order=8, GroupName="13. MA CLOUD FILTER 1")] public bool autoRangeAvg1 { get; set; }
				
				// ── 14. GRID SCALPER ───────────────────────────────────────────────
				[NinjaScriptProperty] [Range(1, 20)] [Display(Name="Quantidade de Ordens", Order=1, GroupName="14. GRID SCALPER")] public int Grid_OrderCount { get; set; }
				[NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="Espaçamento (Ticks)", Order=3, GroupName="14. GRID SCALPER")] public int Grid_Spacing { get; set; }
				[NinjaScriptProperty] [Range(0.5, 10.0)] [Display(Name="Multiplicador de Lote", Order=4, GroupName="14. GRID SCALPER")] public double Grid_LotMultiplier { get; set; }
				[NinjaScriptProperty] [Display(Name="Rearmar na Mesma Barra", Order=5, GroupName="14. GRID SCALPER")] public bool Grid_RearmSameBar { get; set; }
				[NinjaScriptProperty] [Range(0.5, 5.0)] [Display(Name="Multiplicador de Distancia", Order=6, GroupName="14. GRID SCALPER")] public double Grid_SpacingMultiplier { get; set; }
				[NinjaScriptProperty] [Display(Name="Filtro de Contexto", Order=7, GroupName="14. GRID SCALPER")] public gridFiltroMode Grid_FiltroContexto { get; set; }
				[NinjaScriptProperty] [Display(Name="Filtro Candle Anterior", Order=8, GroupName="14. GRID SCALPER")] public bool Grid_CandleFilter { get; set; }
				[NinjaScriptProperty] [Range(0, 5000)] [Display(Name="Delay Cancelamento (ms)", Order=9, GroupName="14. GRID SCALPER")] public int Grid_CancelDelayMs { get; set; }
				
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="FVG — Ativo", Order=11, GroupName="14. GRID SCALPER")] public bool FVG_Active { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="FVG — Mínimo de Ticks", Order=12, GroupName="14. GRID SCALPER")] public int FVG_MinimumTicks { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="FVG — Barras de Histórico", Order=13, GroupName="14. GRID SCALPER")] public int FVG_MaxBars { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="FVG — Desenhar Zonas", Order=14, GroupName="14. GRID SCALPER")] public bool FVG_DrawZones { get; set; }
				
				// ── 15. FILTRO FORÇA 2D ───────────────────────────────────────────
				public enum force2DMode { OFF, Limiar, Incremento, Ambos }
				[NinjaScriptProperty] [Display(Name="Modo do Filtro", Order=1, GroupName="15. FILTRO FORÇA 2D")] public force2DMode Force2D_Mode { get; set; }
				[NinjaScriptProperty] [Range(1.0, 100.0)] [Display(Name="[Limiar] Força Mínima (%)", Order=2, GroupName="15. FILTRO FORÇA 2D")] public double Force2D_MinPercent { get; set; }
				[NinjaScriptProperty] [Range(1.0, 100.0)] [Display(Name="[Limiar] Força Máxima (%)", Order=3, GroupName="15. FILTRO FORÇA 2D")] public double Force2D_MaxPercent { get; set; }
				[NinjaScriptProperty] [Range(1, 200)] [Display(Name="[Incremento] Barras para Comparação", Order=4, GroupName="15. FILTRO FORÇA 2D")] public int Force2D_IncrementBars { get; set; }
				[NinjaScriptProperty] [Range(1.0, 99.0)] [Display(Name="[Incremento] Incremento Mínimo (%)", Order=5, GroupName="15. FILTRO FORÇA 2D")] public double Force2D_IncrementMin { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="Força 2D - Alinhar ao Backtest", Order=6, GroupName="15. FILTRO FORÇA 2D")] public bool Force2D_BacktestMode { get; set; }
				
				// ── 16. FILTRO INCLINAÇÃO SMA ──────────────────────────────────────
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="SMA Slope — Ativo", Order=1, GroupName="16. FILTRO INCLINAÇÃO SMA")] public bool SmaSlope_Active { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="SMA Slope — Período", Order=2, GroupName="16. FILTRO INCLINAÇÃO SMA")] public int SmaSlope_Period { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(0, 100)] [Display(Name="SMA Slope — Barra de Análise", Order=3, GroupName="16. FILTRO INCLINAÇÃO SMA")] public int SmaSlope_BarsShift { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(1, int.MaxValue)] [Display(Name="SMA Slope — Barras de Referência", Order=4, GroupName="16. FILTRO INCLINAÇÃO SMA")] public int SmaSlope_RefBars { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="SMA Slope — Inclinação Mínima", Order=5, GroupName="16. FILTRO INCLINAÇÃO SMA")] public double SmaSlope_Min { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="SMA Slope — Inclinação Máxima", Order=6, GroupName="16. FILTRO INCLINAÇÃO SMA")] public double SmaSlope_Max { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="SMA Slope — Inverter Lógica", Order=7, GroupName="16. FILTRO INCLINAÇÃO SMA")] public bool SmaSlope_InvertLogic { get; set; }
				
				// ── 17. STOP LOSS HLCA ─────────────────────────────────────────────
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="HLCA Stop Ativo", Order=1, GroupName="17. STOP LOSS HLCA")] public bool HLCA_StopActive { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(0, int.MaxValue)] [Display(Name="HLCA Stop Distance (Ticks)", Order=2, GroupName="17. STOP LOSS HLCA")] public int HLCA_StopDistance { get; set; }
				[Browsable(true)] [NinjaScriptProperty] [Range(0, int.MaxValue)] [Display(Name="HLCA Stop Min Ticks", Order=3, GroupName="17. STOP LOSS HLCA")] public int HLCA_StopMinTicks { get; set; }
				
				// ── 18. GRID DINÂMICO HLCA ─────────────────────────────────────────
				[Browsable(true)] [NinjaScriptProperty] [Display(Name="Grid Dinâmico HLCA", Order=1, GroupName="18. GRID DINÂMICO HLCA")] public bool Grid_DynamicHLCA { get; set; }
				
				// ── 19. KELTNER CHANNEL ────────────────────────────────────────────
				public enum KeltnerTriggerMode { Central, Bandas }
				
				[Browsable(true)] [NinjaScriptProperty] [Range(2, 100)]
				[Display(Name="Keltner — Período EMA", Order=2, GroupName="19. KELTNER CHANNEL")]
				public int KELTNER_EmaPeriod { get; set; }
				
				[Browsable(true)] [NinjaScriptProperty] [Range(2, 100)]
				[Display(Name="Keltner — Período ATR", Order=3, GroupName="19. KELTNER CHANNEL")]
				public int KELTNER_AtrPeriod { get; set; }
				
				[Browsable(true)] [NinjaScriptProperty] [Range(1.0, 10.0)]
				[Display(Name="Keltner — Multiplicador ATR", Order=4, GroupName="19. KELTNER CHANNEL")]
				public double KELTNER_Mult { get; set; }
				
				[Browsable(true)] [NinjaScriptProperty]
				[Display(Name="Keltner Vol — Ativo", Order=6, GroupName="19. KELTNER CHANNEL")]
				public bool KELTNER_Vol_Active { get; set; }
				
				[Browsable(true)] [NinjaScriptProperty] [Range(0, 500)]
				[Display(Name="Keltner Vol — Largura Mín (ticks)", Order=7, GroupName="19. KELTNER CHANNEL")]
				public int KELTNER_Vol_Width_Min { get; set; }
				
				[Browsable(true)] [NinjaScriptProperty] [Range(0, 5000)]
				[Display(Name="Keltner Vol — Largura Máx (ticks)", Order=8, GroupName="19. KELTNER CHANNEL")]
				public int KELTNER_Vol_Width_Max { get; set; }
				
				[Browsable(true)] [NinjaScriptProperty]
				[Display(Name="Keltner Gatilho — Ativo", Order=9, GroupName="19. KELTNER CHANNEL")]
				public bool KELTNER_Trigger_Active { get; set; }
				
				[Browsable(true)] [NinjaScriptProperty]
				[Display(Name="Keltner Gatilho — Modo", Order=10, GroupName="19. KELTNER CHANNEL")]
				public KeltnerTriggerMode KELTNER_Trigger_Mode { get; set; }
				
				[Browsable(true)] [NinjaScriptProperty]
				[Display(Name="Keltner Gatilho — Lógica Revertida (só Bandas)", Order=11, GroupName="19. KELTNER CHANNEL")]
				public bool KELTNER_Trigger_Reverse { get; set; }
				
				[Browsable(true)] [NinjaScriptProperty] [Range(0, 50)]
				[Display(Name="Keltner Gatilho — Tolerância (ticks)", Order=12, GroupName="19. KELTNER CHANNEL")]
				public int KELTNER_Trigger_Tolerance { get; set; }
				
				[Browsable(true)] [NinjaScriptProperty]
				[Display(Name="Keltner Gatilho — Exigir Pullback (só Bandas)", Order=13, GroupName="19. KELTNER CHANNEL")]
				public bool KELTNER_Trigger_RequirePullback { get; set; }
				
				[Browsable(true)] [NinjaScriptProperty] [Range(3, 30)]
				[Display(Name="Keltner Gatilho — Janela Pullback (barras)", Order=14, GroupName="19. KELTNER CHANNEL")]
				public int KELTNER_Trigger_PullbackLookback { get; set; }
				
				// ── 20. FILTRO IA (Contexto) ─────────────────────────────────────
				[NinjaScriptProperty]
				[Display(Name="Usar Filtro IA", Description="Consulta o servidor Python para validar a confiança do sinal antes de operar", Order=1, GroupName="20. FILTRO IA (Contexto)")]
				public bool UseAIFilter { get; set; }
				
				[NinjaScriptProperty]
				[Range(0, 100)]
				[Display(Name="Confiança Mínima (%)", Description="Nível mínimo exigido. Mapeamento atual: ALTA=85, MEDIA=50, BAIXA=15", Order=2, GroupName="20. FILTRO IA (Contexto)")]
				public int MinAIConfidence { get; set; }

				private string ai_PromptId = "";
				[NinjaScriptProperty]
				[Display(Name="ID do Prompt (Opcional)", Description="ID do Prompt de Contexto exato do Painel. Se vazio, usa o prompt vinculado ao Strategy ID.", Order=3, GroupName="20. FILTRO IA (Contexto)")]
				public string AI_PromptId
				{
					get { return ai_PromptId ?? ""; }
					set { ai_PromptId = value ?? ""; }
				}

				private string ai_ServerUrl = "https://painel.vemviraramesa.com.br/api/analise_contexto";
				[Browsable(false)]
				[NinjaScriptProperty]
				public string AI_ServerUrl
				{
					get { return string.IsNullOrWhiteSpace(ai_ServerUrl) ? "https://painel.vemviraramesa.com.br/api/analise_contexto" : ai_ServerUrl; }
					set { ai_ServerUrl = value ?? ""; }
				}

				// ── 21. CONECTOR ──────────────────────────────────────────────────
				public enum contratoOrigem { Robo, Painel }
				public enum sltpOrigem { Robo, Painel }

				[NinjaScriptProperty]
				[Display(Name="ID da Conta (Account ID)", Description="ID da Conta de Negociação no Vortex para onde enviar ordens (UUID).", Order=1, GroupName="21. CONECTOR")]
				public string VM_PainelId { get; set; }

				[NinjaScriptProperty]
				[Display(Name="Conector VM - Strategy ID", Description="ID da estratégia para monitorar. Deixe vazio para pegar qualquer uma.", Order=2, GroupName="21. CONECTOR")]
				public string VM_StrategyId { get; set; }

				[NinjaScriptProperty]
				[Display(Name="Origem do Contrato", Description="Define se usa o contrato local do robô ou do Painel (banco de dados)", Order=3, GroupName="21. CONECTOR")]
				public contratoOrigem ContratoOrigem { get; set; }

				[NinjaScriptProperty]
				[Range(0.01, 100.0)]
				[Display(Name="Fator Multiplicação Contrato", Description="Fator multiplicado pelo contrato vindo do banco na opção Contrato Painel", Order=4, GroupName="21. CONECTOR")]
				public double ContratoFatorMult { get; set; }

				[NinjaScriptProperty]
				[Display(Name="Gestão StopLoss", Description="Origem do valor de StopLoss: Robô (local) ou Painel (banco de dados)", Order=5, GroupName="21. CONECTOR")]
				public sltpOrigem StopLossOrigem { get; set; }

				[NinjaScriptProperty]
				[Display(Name="Gestão TakeProfit", Description="Origem do valor de TakeProfit: Robô (local) ou Painel (banco de dados)", Order=6, GroupName="21. CONECTOR")]
				public sltpOrigem TakeProfitOrigem { get; set; }

				[NinjaScriptProperty]
				[Display(Name="Tempo Máx Aceitação Sinal (seg)", Description="Tempo limite em segundos para um sinal do banco ser aceito (ex: 60s). Evita sinais antigos.", Order=7, GroupName="21. CONECTOR")]
				public int VM_MaxSignalAgeSeconds { get; set; }

				[NinjaScriptProperty]
				[Display(Name="Monitorar Encerramento no Painel", Description="Se verdadeiro (padrão), encerra a operação no robô caso ela seja fechada/cancelada no Painel. Se falso, o encerramento é tratado apenas localmente no robô.", Order=8, GroupName="21. CONECTOR")]
				public bool VM_MonitorarEncerramentoPainel { get; set; }

				// ── 22. FILTRO TAMANHO CANDLE (RANGE) ──────────────────────────────
				[NinjaScriptProperty]
				[Display(Name="Candle Range — Ativo", Description="Se ativado, filtra a entrada considerando o tamanho (range High-Low) do candle em ticks.", Order=1, GroupName="22. FILTRO TAMANHO CANDLE (RANGE)")]
				public bool CandleRange_Active { get; set; }

				[NinjaScriptProperty]
				[Range(0, int.MaxValue)]
				[Display(Name="Candle Range — Mínimo (Ticks)", Description="Tamanho mínimo em ticks do candle para permitir a operação (0 = sem mínimo).", Order=2, GroupName="22. FILTRO TAMANHO CANDLE (RANGE)")]
				public int CandleRange_MinTicks { get; set; }

				[NinjaScriptProperty]
				[Range(0, int.MaxValue)]
				[Display(Name="Candle Range — Máximo (Ticks)", Description="Tamanho máximo em ticks do candle para permitir a operação (0 = sem máximo).", Order=3, GroupName="22. FILTRO TAMANHO CANDLE (RANGE)")]
				public int CandleRange_MaxTicks { get; set; }

				// ── 23. SESSÃO HILO ───────────────────────────────────────────────
				[NinjaScriptProperty]
				[PropertyEditor("NinjaTrader.Gui.Tools.TimeEditorKey")]
				[Display(Name="Sessão HILO - Início", Description="Horário inicial para cálculo das máximas e mínimas da sessão", Order=1, GroupName="23. SESSÃO HILO")]
				public DateTime SessaoHILO_Start { get; set; }

				[NinjaScriptProperty]
				[PropertyEditor("NinjaTrader.Gui.Tools.TimeEditorKey")]
				[Display(Name="Sessão HILO - Fim", Description="Horário final para consolidação do cálculo da sessão", Order=2, GroupName="23. SESSÃO HILO")]
				public DateTime SessaoHILO_End { get; set; }

				[NinjaScriptProperty]
				[Display(Name="Tipo de Gatilho", Description="Toque na máxima/mínima, Toque com confirmação de cor de candle ou Filtros Técnicos", Order=3, GroupName="23. SESSÃO HILO")]
				public SessaoHiloGatilhoMode SessaoHILO_Gatilho { get; set; }

				[NinjaScriptProperty]
				[Range(0, int.MaxValue)]
				[Display(Name="Range Mínimo (Ticks)", Description="Tamanho mínimo em ticks do range (High - Low) da sessão para permitir operação (0 = sem mínimo)", Order=4, GroupName="23. SESSÃO HILO")]
				public int SessaoHILO_RangeMinTicks { get; set; }

				[NinjaScriptProperty]
				[Range(0, int.MaxValue)]
				[Display(Name="Range Máximo (Ticks)", Description="Tamanho máximo em ticks do range (High - Low) da sessão para permitir operação (0 = sem máximo)", Order=5, GroupName="23. SESSÃO HILO")]
				public int SessaoHILO_RangeMaxTicks { get; set; }

				[NinjaScriptProperty]
				[Range(0, 50)]
				[Display(Name="Tolerância Toque (Ticks)", Description="Tolerância em ticks para validação do toque nos níveis da sessão", Order=6, GroupName="23. SESSÃO HILO")]
				public int SessaoHILO_ToleranciaTicks { get; set; }

				[NinjaScriptProperty]
				[Display(Name="Desenhar Níveis no Gráfico", Description="Traçar linhas de Máxima e Mínima da sessão no gráfico", Order=7, GroupName="23. SESSÃO HILO")]
				public bool SessaoHILO_DrawLevels { get; set; }

				
				

				
				

				// ── 24. FILTRO GAMMA LEVEL (Sessão Única Modular) ────────────────
				[NinjaScriptProperty]
				[Display(Name="Filtro Gamma — Ativo", Description="Se ativado, filtra qualquer entrada pelo posicionamento do preço no canal Gamma", Order=1, GroupName="24. FILTRO GAMMA LEVEL")]
				public bool Gamma_FiltroAtivo { get; set; }

				[NinjaScriptProperty]
				[Display(Name="Operar Pullback (Reteste/Extremos)", Description="Permite entradas na região de desconto/prêmio do canal", Order=2, GroupName="24. FILTRO GAMMA LEVEL")]
				public bool Gamma_OperarPullback { get; set; } = true;

				[NinjaScriptProperty]
				[Display(Name="Operar Breakout (Rompimento)", Description="Permite entradas quando o preço rompe o piso ou teto", Order=3, GroupName="24. FILTRO GAMMA LEVEL")]
				public bool Gamma_OperarBreakout { get; set; } = true;

				[NinjaScriptProperty]
				[Range(0.0, 50.0)]
				[Display(Name="Pullback Compra — Range Máximo (%)", Description="Percentual a partir do piso para compra (Ex: 50% = compra entre 0% e 50%)", Order=4, GroupName="24. FILTRO GAMMA LEVEL")]
				public double Gamma_PullbackCompraMaxPct { get; set; } = 50.0;

				[NinjaScriptProperty]
				[Range(50.0, 100.0)]
				[Display(Name="Pullback Venda — Range Mínimo (%)", Description="Percentual a partir do piso para venda (Ex: 50% = venda entre 50% e 100%)", Order=5, GroupName="24. FILTRO GAMMA LEVEL")]
				public double Gamma_PullbackVendaMinPct { get; set; } = 50.0;

				[NinjaScriptProperty]
				[Range(0, int.MaxValue)]
				[Display(Name="Range Mínimo entre Níveis (Ticks)", Description="Distância mínima em ticks entre o piso e o teto (0 = sem mínimo)", Order=6, GroupName="24. FILTRO GAMMA LEVEL")]
				public int Gamma_RangeMinTicks { get; set; } = 25;

				[NinjaScriptProperty]
				[Range(0, int.MaxValue)]
				[Display(Name="Range Máximo entre Níveis (Ticks)", Description="Distância máxima em ticks entre o piso e o teto (0 = sem máximo)", Order=7, GroupName="24. FILTRO GAMMA LEVEL")]
				public int Gamma_RangeMaxTicks { get; set; } = 300;

				[NinjaScriptProperty]
				[Display(Name="Região: Macro (PUT/CALL/HVL/GWall)", GroupName="24. FILTRO GAMMA LEVEL", Order=8)]
				public bool Gamma_GrupoMacro { get; set; } = true;

				[NinjaScriptProperty]
				[Display(Name="Região: 0DTE (HVL 0DTE/PUT 0DTE/CALL 0DTE)", GroupName="24. FILTRO GAMMA LEVEL", Order=9)]
				public bool Gamma_Grupo0DTE { get; set; } = true;

				[NinjaScriptProperty]
				[Display(Name="Região: BL Fortes (BL 7 a 10)", GroupName="24. FILTRO GAMMA LEVEL", Order=10)]
				public bool Gamma_GrupoBL_Fortes { get; set; } = true;

				[NinjaScriptProperty]
				[Display(Name="Região: GEX Fortes (GEX 7 a 10)", GroupName="24. FILTRO GAMMA LEVEL", Order=11)]
				public bool Gamma_GrupoGEX_Fortes { get; set; } = true;

				[NinjaScriptProperty]
				[Display(Name="Desenhar Níveis no Gráfico", GroupName="24. FILTRO GAMMA LEVEL", Order=12)]
				public bool Gamma_DrawLevels { get; set; } = true;

				// ── 25. GESTÃO ESTRUTURAL DE STOPLOSS & TAKEPROFIT ───────────────
				[NinjaScriptProperty]
				[Display(Name="Origem do Stop Loss", Description="FixoTicks, HLCA, GammaNivel, VPOC_Micro ou ATR", GroupName="25. STOP LOSS & TAKE PROFIT ESTRUTURAL", Order=1)]
				public ModoStopLossVMBot Stop_OrigemModo { get; set; } = ModoStopLossVMBot.FixoTicks;

				[NinjaScriptProperty]
				[Range(0, 50)]
				[Display(Name="Folga do Stop Atrás do Nível/VPOC (Ticks)", Description="Ticks de respiro além da barreira física de opções ou VPOC", GroupName="25. STOP LOSS & TAKE PROFIT ESTRUTURAL", Order=2)]
				public int Stop_FolgaNivelTicks { get; set; } = 4;

				[NinjaScriptProperty]
				[Range(1, 100)]
				[Display(Name="ATR — Período", Description="Período de cálculo do ATR para o Stop Loss", GroupName="25. STOP LOSS & TAKE PROFIT ESTRUTURAL", Order=3)]
				public int Stop_ATR_Period { get; set; } = 10;

				[NinjaScriptProperty]
				[Range(0.5, 10.0)]
				[Display(Name="ATR — Multiplicador", Description="Multiplicador do ATR (Ex: 3.0 x ATR)", GroupName="25. STOP LOSS & TAKE PROFIT ESTRUTURAL", Order=4)]
				public double Stop_ATR_Multiplier { get; set; } = 3.0;

				[NinjaScriptProperty]
				[Display(Name="TP por Fator Multiplicador", Description="Calcula o Take Profit multiplicando o Stop Loss real pelo fator", GroupName="25. STOP LOSS & TAKE PROFIT ESTRUTURAL", Order=5)]
				public bool TP_UsarFatorMultiplicador { get; set; } = true;

				[NinjaScriptProperty]
				[Range(0.5, 10.0)]
				[Display(Name="TP — Fator Multiplicador (Risco:Retorno)", Description="Ex: 1.5 = TP de 1.5x o Stop; 2.0 = TP de 2.0x o Stop", GroupName="25. STOP LOSS & TAKE PROFIT ESTRUTURAL", Order=6)]
				public double TP_FatorMultiplicador { get; set; } = 1.5;

				// ── 26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES) ──
				[NinjaScriptProperty]
				[Display(Name="01. Perfil do Ativo (NQ vs ES)", Description="AutoDetectar (detecta NQ/MNQ ou ES/MES pelo gráfico) | Nasdaq_NQ_MNQ | Sp500_ES_MES | Customizado_Livre", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=1)]
				public PlaybookAtivoMode PB_PerfilAtivo { get; set; } = PlaybookAtivoMode.AutoDetectar;

				[NinjaScriptProperty]
				[Display(Name="02. ID Instância / Painel Web", Description="Identificador da instância no Supabase para buscar força", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=2)]
				public string PB_InstanceId { get; set; } = "painel_principal_web";

				[NinjaScriptProperty]
				[Display(Name="03. Horário Abertura NY — Auto DST (EUA)", Description="Detecta automaticamente Horário de Verão EUA (EDT: 10:30 BRT / Ásia 19:00 BRT) e Inverno EUA (EST: 11:30 BRT / Ásia 20:00 BRT)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=3)]
				public bool PB_AutoDST_EUA { get; set; } = true;

				[NinjaScriptProperty]
				[PropertyEditor("NinjaTrader.Gui.Tools.TimeEditorKey")]
				[Display(Name="04. Horário Abertura NY (Manual)", Description="Usado apenas se Auto DST estiver desmarcada (Ex: 11:30 ou 10:30 BRT)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=4)]
				public DateTime PB_HoraAberturaManual { get; set; }

				[NinjaScriptProperty]
				[PropertyEditor("NinjaTrader.Gui.Tools.TimeEditorKey")]
				[Display(Name="05. Horário Abertura Ásia (Manual)", Description="Usado apenas se Auto DST estiver desmarcada (Ex: 20:00 ou 19:00 BRT)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=5)]
				public DateTime PB_HoraAsiaManual { get; set; }

				[NinjaScriptProperty]
				[Display(Name="06. Desenhar Níveis OR15 (Max, Min, 50% e 25%)", Description="Traça no gráfico as linhas de Máxima, Mínima, 50% (OR_Mid) e 25% (50% da Metade) dos primeiros 15 minutos", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=6)]
				public bool PB_DesenharNiveisOR15 { get; set; } = true;

				[NinjaScriptProperty]
				[Display(Name="07. [FLAG 1] Operar Abertura 1º Segundo (T0)", Description="Ativa a entrada no 1º segundo da abertura Cash NY quando Força Ásia e Força T-15m estão alinhadas", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=7)]
				public bool PB_OperarAberturaT0 { get; set; } = true;

				[NinjaScriptProperty]
				[Display(Name="08. [T0] Modo de Gestão (Swing / Scalp / Custom Ticks)", Description="Auto_ConformeAtivo (NQ 130x85pts / ES 22x14pts) | Auto_Scalp5m (NQ 45x45pts / ES 7x7pts) | NQ_Swing | NQ_Scalp | ES_Swing | ES_Scalp | Customizado_Ticks | RoboFixoTicks", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=8)]
				public PlaybookT0Mode PB_T0_ModoGestao { get; set; } = PlaybookT0Mode.Auto_ConformeAtivo;

				[NinjaScriptProperty]
				[Range(1, 20000)]
				[Display(Name="09. [T0 Custom] Take Profit (Ticks)", Description="Take profit em ticks para T0 quando selecionado Customizado_Ticks (Ex: 28 ticks no ES, 180 ticks no NQ)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=9)]
				public int PB_T0_CustomTpTicks { get; set; } = 28;

				[NinjaScriptProperty]
				[Range(1, 20000)]
				[Display(Name="10. [T0 Custom] Stop Loss (Ticks)", Description="Stop loss em ticks para T0 quando selecionado Customizado_Ticks (Ex: 28 ticks no ES, 180 ticks no NQ)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=10)]
				public int PB_T0_CustomSlTicks { get; set; } = 28;

				[NinjaScriptProperty]
				[Range(1, 360)]
				[Display(Name="11. [T0 Custom] Duração Máxima (Minutos)", Description="Tempo de saída por relógio em minutos quando Customizado_Ticks (Padrão: 5 min para scalp, 60 min para swing)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=11)]
				public int PB_T0_CustomMaxMinutos { get; set; } = 60;

				[NinjaScriptProperty]
				[Range(50.0, 95.0)]
				[Display(Name="12. [T0] Força Mínima Compra — Ásia e T-15m (%)", Description="Percentual mínimo em Ásia E em T-15m para validar Compra no 1º segundo (Padrão: 52%)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=12)]
				public double PB_T0_ForcaMinCompra { get; set; } = 52.0;

				[NinjaScriptProperty]
				[Range(5.0, 50.0)]
				[Display(Name="13. [T0] Força Máxima Venda — Ásia e T-15m (%)", Description="Percentual máximo em Ásia E em T-15m para validar Venda no 1º segundo (Padrão: 48%)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=13)]
				public double PB_T0_ForcaMaxVenda { get; set; } = 48.0;

				[NinjaScriptProperty]
				[Display(Name="14. [FLAG 2] Aguardar e Operar Confirmação M5 (T+5m)", Description="Ativa a operação após o fechamento dos primeiros 5 minutos (pós-armadilha do 1º minuto) validando Força Final + 7 Techs", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=14)]
				public bool PB_OperarConfirmacaoM5 { get; set; } = true;

				[NinjaScriptProperty]
				[Display(Name="15. [M5] Operar M5 Apenas se T0 Não Entrou", Description="Se verdadeiro (fluxograma Quadro 4), só avalia entrada em T+5m nos dias em que o T0 não disparou", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=15)]
				public bool PB_M5_ApenasSeT0NaoEntrou { get; set; } = true;

				[NinjaScriptProperty]
				[Display(Name="16. [M5] Modo de Gestão M5", Description="Auto_ConformeAtivo (NQ 110x75pts / ES 7x7pts) | Customizado_Pontos | Customizado_Ticks", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=16)]
				public PlaybookM5Mode PB_M5_ModoGestao { get; set; } = PlaybookM5Mode.Auto_ConformeAtivo;

				[NinjaScriptProperty]
				[Range(50.0, 95.0)]
				[Display(Name="17. [M5] Força Final Mínima Compra (%)", Description="Força Final mínima em T+5m para Compra (Padrão: 55%)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=17)]
				public double PB_M5_ForcaFinalCompra { get; set; } = 55.0;

				[NinjaScriptProperty]
				[Range(50.0, 95.0)]
				[Display(Name="18. [M5] Força 7 Techs Mínima Compra (%)", Description="Média mínima das 7 ações Tech em T+5m para Compra (Padrão: 52%)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=18)]
				public double PB_M5_ForcaTechCompra { get; set; } = 52.0;

				[NinjaScriptProperty]
				[Range(5.0, 50.0)]
				[Display(Name="19. [M5] Força Final Máxima Venda (%)", Description="Força Final máxima em T+5m para Venda (Padrão: 45%)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=19)]
				public double PB_M5_ForcaFinalVenda { get; set; } = 45.0;

				[NinjaScriptProperty]
				[Range(5.0, 50.0)]
				[Display(Name="20. [M5] Força 7 Techs Máxima Venda (%)", Description="Média máxima das 7 ações Tech em T+5m para Venda (Padrão: 48%)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=20)]
				public double PB_M5_ForcaTechVenda { get; set; } = 48.0;

				[NinjaScriptProperty]
				[Range(0.0, 2000.0)]
				[Display(Name="21. [M5 Custom] Take Profit (Pontos)", Description="Alvo em pontos na confirmação de 5 minutos quando Modo=Customizado_Pontos (Ex: 7 pts no ES, 110 pts no NQ)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=21)]
				public double PB_M5_TpPontos { get; set; } = 110.0;

				[NinjaScriptProperty]
				[Range(0.0, 2000.0)]
				[Display(Name="22. [M5 Custom] Stop Loss (Pontos)", Description="Stop Loss em pontos na confirmação de 5 minutos quando Modo=Customizado_Pontos (Ex: 7 pts no ES, 75 pts no NQ)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=22)]
				public double PB_M5_SlPontos { get; set; } = 75.0;

				[NinjaScriptProperty]
				[Range(0, 20000)]
				[Display(Name="23. [M5 Custom] Take Profit (Ticks)", Description="Alvo em ticks diretos para M5 quando Modo=Customizado_Ticks (Ex: 28 ticks no ES, 440 ticks no NQ)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=23)]
				public int PB_M5_TpTicks { get; set; } = 0;

				[NinjaScriptProperty]
				[Range(0, 20000)]
				[Display(Name="24. [M5 Custom] Stop Loss (Ticks)", Description="Stop Loss em ticks diretos para M5 quando Modo=Customizado_Ticks (Ex: 28 ticks no ES, 300 ticks no NQ)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=24)]
				public int PB_M5_SlTicks { get; set; } = 0;

				[NinjaScriptProperty]
				[Range(5, 360)]
				[Display(Name="25. [M5] Duração Máxima (Minutos)", Description="Tempo máximo em minutos para manter a operação do M5 aberta (55 min = encerra em T+60m)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=25)]
				public int PB_M5_DuracaoMaxMinutos { get; set; } = 55;

				[NinjaScriptProperty]
				[Display(Name="26. [FLAG 3] Operar OR15 — Reversão / Fade (15 min)", Description="Ativa operação contra a borda da OR15 no 1º toque com rejeição (pavio) ou exaustão de força (< 55%)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=26)]
				public bool PB_OperarOR15_Reversao { get; set; } = true;

				[NinjaScriptProperty]
				[Display(Name="27. [FLAG 4] Operar OR15 — Rompimento / Breakout (15 min)", Description="Ativa operação a favor do rompimento da OR15 quando a vela fecha fora com Força >= 55%", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=27)]
				public bool PB_OperarOR15_Breakout { get; set; } = true;

				[NinjaScriptProperty]
				[Display(Name="28. [OR15] Modelo de Gestão 50% (OR_Mid) e 25% (50% da Metade)", Description="Define a combinação de Alvo, Parcial, Breakeven e Stop baseada em 50% e 25% da amplitude dos primeiros 15 minutos", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=28)]
				public PlaybookOR15GestaoMode PB_OR15_ModoGestao { get; set; } = PlaybookOR15GestaoMode.Parcial25_BE_Final50_Stop25;

				[NinjaScriptProperty]
				[Range(50.0, 95.0)]
				[Display(Name="29. [OR15] Força Mínima para Validar Breakout (%)", Description="Força mínima a favor do rompimento (Padrão: 55%). Abaixo disso ou com fechamento dentro, aciona Reversão/Fade", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=29)]
				public double PB_OR15_ForcaBreakoutMin { get; set; } = 55.0;

				[NinjaScriptProperty]
				[Range(0.0, 500.0)]
				[Display(Name="30. [OR15 Reversão] Amplitude Mínima da Caixa (Pontos)", Description="Amplitude mínima da OR15 em pontos para permitir Reversão (0 = Auto: 15 pts no ES / 60 pts no NQ)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=30)]
				public double PB_OR15_ReversaoMinRangePts { get; set; } = 0.0;

				[NinjaScriptProperty]
				[Range(0.0, 500.0)]
				[Display(Name="31. [OR15 Breakout] Caixa Comprimida Máx (Pontos)", Description="Teto em pontos para validar Breakout Comprimido (0 = Auto: 20 pts no ES / 120 pts no NQ)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=31)]
				public double PB_OR15_CaixaComprimidaMaxPts { get; set; } = 0.0;

				[NinjaScriptProperty]
				[Range(0.0, 1000.0)]
				[Display(Name="32. [OR15 Breakout] Caixa Explosiva Mín (Pontos)", Description="Piso em pontos para validar Breakout Explosivo (0 = Auto: 30 pts no ES / 180 pts no NQ)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=32)]
				public double PB_OR15_CaixaExplosivaMinPts { get; set; } = 0.0;

				[NinjaScriptProperty]
				[Display(Name="33. [OR15 Breakout] Permitir em Qualquer Tamanho de Caixa", Description="Se marcado, opera Breakout mesmo em caixas intermediárias desde que feche fora com Força >= 55%", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=33)]
				public bool PB_OR15_BreakoutQualquerCaixa { get; set; } = false;

				[NinjaScriptProperty]
				[Range(30, 390)]
				[Display(Name="34. [OR15] Janela Máxima após Abertura (Minutos)", Description="Tempo máximo após a abertura NY para buscar entradas na OR15 (Padrão: 120 min)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=34)]
				public int PB_OR15_JanelaMaxMinutos { get; set; } = 120;

				#endregion
		    }
		}
