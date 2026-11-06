#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Media;
using System.Windows;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.DrawingTools;
using SharpDX;
using SharpDX.Direct2D1;
using SharpDX.DirectWrite;
using DXBrush = SharpDX.Direct2D1.SolidColorBrush;
using DWFontWeight = SharpDX.DirectWrite.FontWeight;
using DWFontStyle = SharpDX.DirectWrite.FontStyle;
using DWTextAlignment = SharpDX.DirectWrite.TextAlignment;
using DWParagraphAlignment = SharpDX.DirectWrite.ParagraphAlignment;

#endregion

namespace NinjaTrader.NinjaScript.Indicators
{
    public class VMnqForce : Indicator
    {
        private System.Windows.Input.MouseButtonEventHandler _mouseHandler;
        public string SupabaseUrl = "https://db.vemviraramesa.com.br";
        public string ApiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY";
        public string InstanceId  = "painel_principal";
		
		// ================================================================
        // 🔒 VALIDAÇÃO REMOTA - VARIÁVEIS INTERNAS (NÃO CONFIGURÁVEIS)
        // ================================================================
        private const string LicenseCacheFileName = "VMnqTrend_license.enc";
        private string metodovalidar = "assinatura";
        private string allowedMachineId = "C6242D27B46096927C3CFAD7DCF281CF";
        private bool isValid = false;
        private string consumerKey = "ck_75f9d0f430cb40c64c902ed43ce2bceb08e5e649";
        private string consumerSecret = "cs_a741c57b4368102a1daf3fbfc4598833ffb23e77";
        private int CodProduto = 8506;
        private bool popupErroLicencaJaExibido = false;
        private string licenseCachePath;
        private DateTime? ultimaValidacaoCache = null;
		
		// ================================================================
        // DADOS RECEBIDOS DO SUPABASE
        // ================================================================
        private double _nasBuy, _nasSell;
        private double _spBuy,  _spSell;
        private double _usdBuy, _usdSell;
        private double _vixBuy, _vixSell;
        private double _nvdaBuy,  _nvdaSell;
        private double _msftBuy,  _msftSell;
        private double _aaplBuy,  _aaplSell;
        private double _metaBuy,  _metaSell;
        private double _amznBuy,  _amznSell;
        private double _googlBuy, _googlSell;
        private double _tslaBuy,  _tslaSell;
        private double _ffBuy,    _ffSell;
        private int    _ffDir;
        private bool   _nasOpen;
        private string _updatedAt = "---";
        private string _statusMsg = "Aguardando...";
        private bool   _hasData   = false;

        // ================================================================
        // CONTROLE DE POLLING EM BACKGROUND
        // ================================================================
        private Timer  _pollTimer;
        private bool   _fetching = false;
        private readonly object _lock = new object();

        // ================================================================
        // GAMMA LEVELS - FETCH DO SUPABASE
        // ================================================================
        private System.Net.Http.HttpClient _gammaHttpClient;
        private DateTime _lastGammaFetchTime = DateTime.MinValue;
        private readonly object _gammaRenderLock = new object();
        private List<GammaRenderLevel> _gammaRenderLevels = new List<GammaRenderLevel>();

        // ================================================================
        // TAPE & SALES - HISTORICO DE TRADES
        // ================================================================
        private class TradeInfo
        {
            public DateTime Time { get; set; }
            public double Price { get; set; }
            public long Volume { get; set; }
            public string Side { get; set; }
        }
        private List<TradeInfo> recentTrades = new List<TradeInfo>();
        private readonly object _tradeLock = new object();
        private DateTime _lastTradeAlertTime = DateTime.MinValue;

        // ================================================================
        // MARKET DYNAMICS - ACELERACAO COM Z-SCORE E ATR (NOVO)
        // ================================================================
        private string _marketState = "NEUTRO";
        private double _zScore = 0;
        private double _atrRatio = 0;
        private double _velocimetro = 50; // Gauge 0-100
		// ✅ NOVO - indicadores nativos NT8 (igual GammaPanelBridge)
		private Series<double> rocSeries;
		private SMA smaRoc;
		private StdDev stdDevRoc;
		private ATR atrInd;
		private int periodoVelocidade = 5;
		private int periodoHistorico = 20;
        
        private DateTime _lastAccelerationAlertTime = DateTime.MinValue;

        // Suavização exponencial (igual ao HTML)
        private double _zScoreSuavizado = 0;
        private double _atrSuavizado = 0;
        private readonly double _fatorSuavizacao = 0.3;

        // ================================================================
        // ANALYSES PANEL - NOVO
        // ================================================================
        private class AnalysisData
        {
            public string Direction { get; set; }
            public string EntryPoint { get; set; }
            public string StopLoss { get; set; }
            public string TakeProfit { get; set; }
            public string MarketAnalysis { get; set; }
            public string SetupStrategy { get; set; }
            public string Target1 { get; set; }
            public string Target2 { get; set; }
            public string CreatedAt { get; set; }
            public string ZScore { get; set; }
            public string FlowPressure { get; set; }
            public string OptionsRegime { get; set; }
        }
        
        private AnalysisData _currentAnalysis = null;
        private bool _showAnalysisPanel = false;
        private System.Net.Http.HttpClient _analysisHttpClient;
        private DateTime _lastAnalysisFetchTime = DateTime.MinValue;
        private const int ANALYSIS_UPDATE_INTERVAL_MIN = 5;
		
		// ================================================================
		// BOTÃO DE ALTERNÂNCIA DE PAINEL
		// ================================================================
		private RectangleF _toggleButtonRect;
		private const float TOGGLE_BTN_W = 110f;
		private const float TOGGLE_BTN_H = 28f;

        // ================================================================
        // THROTTLING DE RENDERIZACAO (CRITICO PARA PERFORMANCE)
        // ================================================================
        private DateTime _lastRenderTime = DateTime.MinValue;
        private const int RENDER_THROTTLE_MS = 200;
        private bool _needsRender = false;
        private readonly object _renderLock = new object();

        // ================================================================
        // DIRECTX RESOURCES
        // ================================================================
        private DXBrush _bBg, _bBorder, _bGold, _bOrange,
                        _bGreen, _bRed, _bGreenDim, _bRedDim,
                        _bGray, _bBarBg, _bFfBg, _bStatus,
                        _bTsBg, _bTsBorder, _bMdBg, _bMdBorder, _bAnalysisBg, _bAnalysisBorder;
        private TextFormat _tfSmall, _tfMed, _tfBold, _tfTitle, _tfTiny, _tfTinyRight, _tfHuge ;
        private bool _brushesReady;

        private const int PAD    = 8;
        private const int ROW_H  = 17;
        private const int BAR_H  = 4;
        private const int NAME_W = 82;
        private const int VAL_W  = 36;
        private const int GAP_H  = 5;
        private const int TS_ROW_H = 16;
        private const int TS_MAX_ROWS = 5;
        private const int MD_ROW_H = 18;

        private const int GAUGE_TRACK_H  = 10;
        private const int GAUGE_TICK_EXT = 5;
        private const int GAUGE_LABELS_H = 12;
        private const int GAUGE_GAP      = 4;

        private const int TS_COL_DIR  = 50;
        private const int TS_COL_VOL  = 28;
        private const int TS_COL_PRICE = 65;
        private const int TS_COL_TIME = 55;

        // ================================================================
        // PROPERTIES
        // ================================================================
		
		[NinjaScriptProperty]
		[Display(Name = "Número Assinatura", Description = "Assinatura contratada no portal do desenvolvedor", Order = 0, GroupName = "Licença")]
		public string IDAssinatura { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Modo Simples (so Forca Final)", Order = 1, GroupName = "Painel")]
        public bool SimpleMode { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Mostrar Barra de Forca", Order = 2, GroupName = "Painel")]
        public bool ShowBar { get; set; }

        [NinjaScriptProperty]
        [Range(0, 3)]
        [Display(Name = "Canto (0=TopLeft 1=TopRight 2=BotLeft 3=BotRight)", Order = 3, GroupName = "Painel")]
        public int PanelCorner { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Offset X", Order = 4, GroupName = "Painel")]
        public int OffsetX { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Offset Y", Order = 5, GroupName = "Painel")]
        public int OffsetY { get; set; }

        [NinjaScriptProperty]
        [Range(1, 60)]
        [Display(Name = "Intervalo de Atualizacao (seg)", Order = 4, GroupName = "Supabase")]
        public int PollIntervalSec { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Ativar Alerta Sonoro", Order = 1, GroupName = "Alertas")]
        public bool EnableAlert { get; set; }

        [NinjaScriptProperty]
        [Range(0, 100)]
        [Display(Name = "Forca Final >= (%) para Alertar", Order = 2, GroupName = "Alertas")]
        public double AlertThreshold { get; set; }

        [NinjaScriptProperty]
        [Range(5, 600)]
        [Display(Name = "Intervalo entre Alertas Repetidos (seg)", Order = 3, GroupName = "Alertas")]
        public int AlertRearmSec { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Mostrar Painel T&S", Order = 1, GroupName = "Tape & Sales")]
        public bool ShowTapeSales { get; set; }

        [NinjaScriptProperty]
        [Range(1, 10000)]
        [Display(Name = "Filtro Minimo de Contratos", Order = 2, GroupName = "Tape & Sales")]
        public int MinContractFilter { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Ativar Alerta Combinado (Forca + Volume)", Order = 3, GroupName = "Tape & Sales")]
        public bool EnableCombinedAlert { get; set; }

        [NinjaScriptProperty]
        [Range(5, 600)]
        [Display(Name = "Intervalo entre Alertas T&S (seg)", Order = 4, GroupName = "Tape & Sales")]
        public int TsAlertRearmSec { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Mostrar Painel Market Dynamics", Order = 1, GroupName = "Market Dynamics")]
        public bool ShowMarketDynamics { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Ativar Alerta de Aceleracao", Order = 2, GroupName = "Market Dynamics")]
        public bool EnableAccelerationAlert { get; set; }

        [NinjaScriptProperty]
        [Range(0.1, 5.0)]
        [Display(Name = "Threshold de Aceleracao (Z-Score)", Order = 3, GroupName = "Market Dynamics")]
        public double AccelerationThreshold { get; set; }

        [NinjaScriptProperty]
        [Range(5, 600)]
        [Display(Name = "Intervalo entre Alertas de Aceleracao (seg)", Order = 4, GroupName = "Market Dynamics")]
        public int AccelerationAlertRearmSec { get; set; }

        // ================================================================
        // GAMMA LEVELS - NÍVEIS DO SUPABASE
        // ================================================================
        [NinjaScriptProperty]
        [Display(Name = "Símbolo de Referência (NQ, ES, WIN...)", Order = 1, GroupName = "Gamma Levels")]
        public string GammaReferenceSymbol { get; set; }

        [NinjaScriptProperty]
        [Range(1, 120)]
        [Display(Name = "Intervalo de Atualização (min)", Order = 2, GroupName = "Gamma Levels")]
        public int GammaUpdateIntervalMinutes { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Mostrar Níveis Prev (High/Low/Open/Close/Adjust)", Order = 3, GroupName = "Gamma Levels")]
        public bool ShowGammaPrevLevels { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Mostrar Gamma Wall 0DTE", Order = 4, GroupName = "Gamma Levels")]
        public bool ShowGammaWall { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Mostrar HVL e HVL 0DTE", Order = 5, GroupName = "Gamma Levels")]
        public bool ShowGammaHVL { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Mostrar Put Support (e 0DTE)", Order = 6, GroupName = "Gamma Levels")]
        public bool ShowGammaPut { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Mostrar Call Resistance (e 0DTE)", Order = 7, GroupName = "Gamma Levels")]
        public bool ShowGammaCall { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Mostrar Max 1D e Min 1D", Order = 8, GroupName = "Gamma Levels")]
        public bool ShowGammaMinMax { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Mostrar Níveis GEX", Order = 9, GroupName = "Gamma Levels")]
        public bool ShowGammaGEX { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Mostrar Níveis BL", Order = 10, GroupName = "Gamma Levels")]
        public bool ShowGammaBL { get; set; }

        // ================================================================
        // STATE
        // ================================================================
        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description      = "FFB Impulse Panel - Leitura do Supabase (EA MT4)";
                Name             = "VM Nasdaq Trend";
                IsOverlay        = true;
                DrawOnPricePanel = true;
                Calculate        = Calculate.OnBarClose;  // CRITICO: evita recalcular a cada tick
                DisplayInDataBox = false;
                IsSuspendedWhileInactive = false;
				
                SimpleMode      = false;
                ShowBar         = true;
                PanelCorner     = 0;
                OffsetX         = 10;
                OffsetY         = 30;

                SupabaseUrl     = "https://db.vemviraramesa.com.br";
                ApiKey          = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY";
                InstanceId      = "painel_principal";
                PollIntervalSec = 2;

                EnableAlert     = true;
                AlertThreshold  = 70;
                AlertRearmSec   = 30;

                ShowTapeSales       = true;
                MinContractFilter   = 15;
                EnableCombinedAlert = true;
                TsAlertRearmSec     = 10;

                ShowMarketDynamics        = true;
                EnableAccelerationAlert   = true;
                AccelerationThreshold     = 0.3;
                AccelerationAlertRearmSec = 15;

                // Defaults Gamma Levels
                GammaReferenceSymbol       = "NQ";
                GammaUpdateIntervalMinutes = 30;
                ShowGammaPrevLevels        = true;
                ShowGammaWall              = true;
                ShowGammaHVL               = true;
                ShowGammaPut               = true;
                ShowGammaCall              = true;
                ShowGammaMinMax            = true;
                ShowGammaGEX               = true;
                ShowGammaBL                = true;
				
				IDAssinatura 			   = "0000";
            }
			
			else if (State == State.Configure)
			{
			    // ── VALIDAÇÃO DE LICENÇA ──────────────────────────────
			    if (metodovalidar == "assinatura")
			    {
			        if (LerCacheLicenca())
			        {
			            isValid = true;
			            Print("[LICENÇA] ✅ Cache válido.");
			        }
			        else
			        {
			            ValidarAssinatura();
			            if (isValid)
			            {
			                SalvarCacheLicenca();
			                Print("[LICENÇA] ✅ Validação remota OK.");
			            }
			        }
			    }
			    if (!isValid)
			    {
			        Print("[LICENÇA] ❌ Licença inválida. Indicador desativado.");
			    }
			}
			
			
            else if (State == State.DataLoaded)
			{
			    if (!isValid) return;
				
				// ✅ NOVO - Clique do mouse para botão de alternância
				_mouseHandler = new System.Windows.Input.MouseButtonEventHandler(OnChartMouseClick);
				if (ChartPanel != null)
				{
				    ChartPanel.Dispatcher.InvokeAsync(() =>
				    {
				        ChartPanel.AddHandler(
				            System.Windows.UIElement.MouseLeftButtonDownEvent,
				            _mouseHandler,
				            true); // handledEventsToo = true
				    });
				}
								
				// Timer de polling do Supabase (background, nao bloqueia UI)
			    _pollTimer = new Timer(FetchFromSupabase, null,
			        TimeSpan.Zero,
			        TimeSpan.FromSeconds(PollIntervalSec));
			
			    // HttpClient para Gamma Levels
			    _gammaHttpClient = new System.Net.Http.HttpClient();
			    _gammaHttpClient.DefaultRequestHeaders.Add("apikey", ApiKey);
			    _gammaHttpClient.DefaultRequestHeaders.Add("Authorization", "Bearer " + ApiKey);
			    _gammaHttpClient.Timeout = TimeSpan.FromSeconds(15);
			
			    // HttpClient para Analysis
			    _analysisHttpClient = new System.Net.Http.HttpClient();
			    _analysisHttpClient.DefaultRequestHeaders.Add("apikey", ApiKey);
			    _analysisHttpClient.DefaultRequestHeaders.Add("Authorization", "Bearer " + ApiKey);
			    _analysisHttpClient.Timeout = TimeSpan.FromSeconds(15);
			
			    Print("[GAMMA] >>> Iniciando busca de Gamma Levels");
			    FetchAndDrawGammaLevelsAsync();
			    
			    // Inicializar análise
			    FetchAnalysisAsync();
			    
			    // ✅ ADICIONAR - inicializar indicadores (igual GammaPanelBridge)
			    rocSeries = new Series<double>(this);
			    smaRoc = SMA(rocSeries, periodoHistorico);
			    stdDevRoc = StdDev(rocSeries, periodoHistorico);
			    atrInd = ATR(14);
			    
			}

            else if (State == State.Terminated)
			{
			    if (_pollTimer != null) { _pollTimer.Dispose(); _pollTimer = null; }
			    if (_gammaHttpClient != null) { _gammaHttpClient.Dispose(); _gammaHttpClient = null; }
			    if (_analysisHttpClient != null) { _analysisHttpClient.Dispose(); _analysisHttpClient = null; }
				
				// ✅ Remover handler de clique
				if (ChartPanel != null && _mouseHandler != null)
				{
				    ChartPanel.Dispatcher.InvokeAsync(() =>
				    {
				        ChartPanel.RemoveHandler(
				            System.Windows.UIElement.MouseLeftButtonDownEvent,
				            _mouseHandler);
				    });
				}
	
			    DisposeResources();
			}
        }
		
		// ================================================================
		// 🔒 MÉTODOS DE VALIDAÇÃO DE LICENÇA
		// ================================================================
		#region Validação de Licença
		
		private void ShowInvalidLicensePopup(string title, string message)
		{
		    if (popupErroLicencaJaExibido) return;
		    popupErroLicencaJaExibido = true;
		    if (ChartControl?.Dispatcher != null)
		    {
		        ChartControl.Dispatcher.InvokeAsync(() =>
		        {
		            MessageBox.Show(message, title, MessageBoxButton.OK, MessageBoxImage.Error);
		        });
		    }
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
		        if (string.IsNullOrWhiteSpace(IDAssinatura))
		        {
		            _statusMsg = "Número de Assinatura inválido!";
		            ShowInvalidLicensePopup("VMnqForce", _statusMsg);
		            isValid = false;
		            return;
		        }
		        string url = $"https://ffbinvest.amsolucoes.net.br/wp-json/wc/v3/subscriptions/{IDAssinatura}?consumer_key={consumerKey}&consumer_secret={consumerSecret}";
		        WebClient client = new WebClient();
		        string json = client.DownloadString(url);
		        string machineId = Cbi.License.MachineId;
		
		        if (string.IsNullOrEmpty(json))
		        {
		            _statusMsg = "Resposta da API inválida.";
		            ShowInvalidLicensePopup("ERRO VALIDAÇÃO", _statusMsg);
		            isValid = false;
		            return;
		        }
		
		        if (json.IndexOf("\"status\":\"active\"", StringComparison.OrdinalIgnoreCase) >= 0 ||
		            json.IndexOf("\"status\":\"on-hold\"", StringComparison.OrdinalIgnoreCase) >= 0)
		        {
		            if (!VerificarProductId(json))
		            {
		                _statusMsg = "Produto incorreto na assinatura!";
		                ShowInvalidLicensePopup("VALIDATION ERROR", _statusMsg);
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
		                            _statusMsg = "Assinatura Válida!";
		                            isValid = true;
		                            return;
		                        }
		                        else
		                        {
		                            _statusMsg = "ID Machine não pertence a esta assinatura!";
		                            ShowInvalidLicensePopup("VALIDATION ERROR", _statusMsg);
		                            isValid = false;
		                        }
		                    }
		                }
		            }
		        }
		        else
		        {
		            _statusMsg = "Assinatura inativa ou não encontrada!";
		            ShowInvalidLicensePopup("VALIDAÇÃO", _statusMsg);
		            isValid = false;
		        }
		    }
		    catch (WebException ex)
		    {
		        _statusMsg = "Erro de conexão: Assinatura inexistente ou API indisponível.";
		        ShowInvalidLicensePopup("VALIDAÇÃO", _statusMsg);
		        isValid = false;
		    }
		    catch (Exception ex)
		    {
		        _statusMsg = "Erro na validação: " + ex.Message;
		        ShowInvalidLicensePopup("VALIDAÇÃO", _statusMsg);
		        isValid = false;
		    }
		}
		
		private string SimpleEncrypt(string t)
		{
		    const string k = "VMnqForce_LICENSE_KEY_2025";
		    byte[] inp = Encoding.UTF8.GetBytes(t), kb = Encoding.UTF8.GetBytes(k), o = new byte[inp.Length];
		    for (int i = 0; i < inp.Length; i++) o[i] = (byte)(inp[i] ^ kb[i % kb.Length]);
		    return Convert.ToBase64String(o);
		}
		
		private string SimpleDecrypt(string t)
		{
		    try
		    {
		        const string k = "VMnqForce_LICENSE_KEY_2025";
		        byte[] inp = Convert.FromBase64String(t), kb = Encoding.UTF8.GetBytes(k), o = new byte[inp.Length];
		        for (int i = 0; i < inp.Length; i++) o[i] = (byte)(inp[i] ^ kb[i % kb.Length]);
		        return Encoding.UTF8.GetString(o);
		    }
		    catch { return ""; }
		}
		
		private string ExtractJsonValue1(string json, string key)
		{
		    int s = json.IndexOf($"\"{key}\":\"", StringComparison.OrdinalIgnoreCase);
		    if (s < 0) return null;
		    s += $"\"{key}\":\"".Length;
		    int e = json.IndexOf('"', s);
		    return e >= 0 ? json.Substring(s, e - s) : null;
		}
		
		private bool LerCacheLicenca()
		{
		    try
		    {
		        licenseCachePath = Path.Combine(NinjaTrader.Core.Globals.UserDataDir, LicenseCacheFileName);
		        if (!File.Exists(licenseCachePath))
		        {
		            Print($"[LICENSE CACHE] ❌ File not found: {licenseCachePath}");
		            return false;
		        }
		
		        string json = SimpleDecrypt(File.ReadAllText(licenseCachePath));
		        string idM  = ExtractJsonValue1(json, "idMachine");
		        string cod  = ExtractJsonValue1(json, "codProduto");
		        string met  = ExtractJsonValue1(json, "metodoValidar");
		        string ids  = ExtractJsonValue1(json, "idAssinatura");
		        string dat  = ExtractJsonValue1(json, "dataValidacao");
		
		        if (string.IsNullOrEmpty(idM) || string.IsNullOrEmpty(cod) ||
		            string.IsNullOrEmpty(met) || string.IsNullOrEmpty(ids) || string.IsNullOrEmpty(dat))
		        {
		            Print("[LICENSE CACHE] ❌ JSON corrompido ou incompleto");
		            return false;
		        }
		
		        if (!DateTime.TryParse(dat, out DateTime dv))
		        {
		            Print($"[LICENSE CACHE] ❌ Data inválida: '{dat}'");
		            return false;
		        }
		
		        if (idM != Cbi.License.MachineId)
		        {
		            Print("[LICENSE CACHE] ❌ Machine ID divergente");
		            return false;
		        }
		        if (ids != IDAssinatura)
		        {
		            Print("[LICENSE CACHE] ❌ ID Assinatura divergente");
		            return false;
		        }
		        if (met != metodovalidar)
		        {
		            Print("[LICENSE CACHE] ❌ Método de validação divergente");
		            return false;
		        }
		        if ((DateTime.UtcNow - dv).TotalHours > 24)
		        {
		            Print("[LICENSE CACHE] ❌ Cache expirado (>24h)");
		            return false;
		        }
		
		        ultimaValidacaoCache = dv;
		        Print($"[LICENSE CACHE] ✅ Válido — última validação: {dv:yyyy-MM-dd HH:mm:ss} UTC");
		        return true;
		    }
		    catch (Exception ex)
		    {
		        Print($"[LICENSE CACHE] ❌ Erro ao ler cache: {ex.Message}");
		        return false;
		    }
		}
		
		private void SalvarCacheLicenca()
		{
		    if (!isValid) return;
		    try
		    {
		        licenseCachePath = Path.Combine(NinjaTrader.Core.Globals.UserDataDir, LicenseCacheFileName);
		        string pasta = Path.GetDirectoryName(licenseCachePath);
		        if (!Directory.Exists(pasta)) Directory.CreateDirectory(pasta);
		
		        if (File.Exists(licenseCachePath))
		        {
		            var a = File.GetAttributes(licenseCachePath);
		            if ((a & FileAttributes.Hidden) != 0) File.SetAttributes(licenseCachePath, a & ~FileAttributes.Hidden);
		        }
		
		        string j = $@"{{""idMachine"":""{Cbi.License.MachineId}"",""codProduto"":""{CodProduto}"",""metodoValidar"":""{metodovalidar}"",""idAssinatura"":""{IDAssinatura}"",""dataValidacao"":""{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss}""}}";
		        File.WriteAllText(licenseCachePath, SimpleEncrypt(j));
		        File.SetAttributes(licenseCachePath, FileAttributes.Hidden);
		        ultimaValidacaoCache = DateTime.UtcNow;
		    }
		    catch (Exception ex)
		    {
		        Print($"[CACHE] Erro: {ex.Message}");
		    }
		}
		
		#endregion
		
		// ================================================================
		// CLIQUE DO MOUSE - DETECTA BOTÃO DE ALTERNÂNCIA
		// ================================================================
		private void OnChartMouseClick(object sender, System.Windows.Input.MouseButtonEventArgs e)
		{
		    if (e.ChangedButton != System.Windows.Input.MouseButton.Left)
		        return;
		
		    System.Windows.Point mousePos = e.GetPosition(ChartPanel);
		    float mouseX = (float)mousePos.X;
		    float mouseY = (float)mousePos.Y;
		
		    if (_toggleButtonRect.Contains(mouseX, mouseY))
		    {
		        _showAnalysisPanel = !_showAnalysisPanel;
		        Print($"[BOTAO] Painel alternado para: {(_showAnalysisPanel ? "ANALISE" : "FORCA")}");
		        if (_showAnalysisPanel)
		        {
		            FetchAnalysisAsync();
		        }
		
		        e.Handled = true;
		
		        if (ChartControl != null)
		            ChartControl.Dispatcher.InvokeAsync(() => ChartControl.InvalidateVisual());
		    }
		}

        // ================================================================
        // ONMARKETDATA - CAPTURA TRADES DO TAPE & SALES
        // ================================================================
        protected override void OnMarketData(MarketDataEventArgs e)
        {
            if (!ShowTapeSales) return;
            if (e.MarketDataType != MarketDataType.Last) return;

            long vol = (long)e.Volume;
            if (vol <= 0) return;

            // So processa trades acima do filtro para o painel T&S
            if (vol < MinContractFilter) return;

            string side = e.Price >= e.Ask ? "COMPRA" : "VENDA";
            bool isBuy = side == "COMPRA";

            var trade = new TradeInfo
            {
                Time = DateTime.Now,
                Price = e.Price,
                Volume = vol,
                Side = side
            };

            lock (_tradeLock)
            {
                recentTrades.Add(trade);
                if (recentTrades.Count > 50)
                    recentTrades.RemoveAt(0);
            }

            if (EnableCombinedAlert)
                CheckCombinedAlert(trade, isBuy, vol);

            // Sinaliza necessidade de render (throttle cuida da frequencia real)
            SignalRender();
        }

        // ================================================================
		// ONBARUPDATE - CÁLCULO IGUAL AO GAMMAPANELBRIDGE
		// ================================================================
		protected override void OnBarUpdate()
		{
		    if (BarsInProgress != 0) return;
		    if (CurrentBar < 1) return;
		
		    // Reset de sessao
		    if (Bars.IsFirstBarOfSession)
		    {
		        lock (_tradeLock)
		        {
		            recentTrades.Clear();
		        }
		        _zScoreSuavizado = 0;
		        _atrSuavizado = 0;
		    }
		
		    // ========================================
		    // CÁLCULO IGUAL AO GAMMAPANELBRIDGE v6.1
		    // ========================================
		    if (CurrentBar >= periodoHistorico)
		    {
		        // 1. VELOCIDADE BRUTA = diferença em PONTOS (não percentual!)
		        double velocidadeBruta = Close[0] - Close[periodoVelocidade];
		        rocSeries[0] = velocidadeBruta;
		
		        // 2. Z-SCORE usando SMA e StdDev nativos do NT8
		        _zScore = stdDevRoc[0] > 0 ? (velocidadeBruta - smaRoc[0]) / stdDevRoc[0] : 0;
		
		        // 3. ATR RATIO = Range da barra atual / ATR(14)
		        _atrRatio = atrInd[0] > 0 ? (High[0] - Low[0]) / atrInd[0] : 0;
		
		        // 4. SUAVIZAÇÃO EXPONENCIAL (0.3 igual HTML)
		        if (_zScoreSuavizado == 0 && _atrSuavizado == 0)
		        {
		            _zScoreSuavizado = _zScore;
		            _atrSuavizado = _atrRatio;
		        }
		        else
		        {
		            _zScoreSuavizado = (_zScore * _fatorSuavizacao) + (_zScoreSuavizado * (1 - _fatorSuavizacao));
		            _atrSuavizado = (_atrRatio * _fatorSuavizacao) + (_atrSuavizado * (1 - _fatorSuavizacao));
		        }
		
		        // 5. ESTADO DO MERCADO (mesmos thresholds do HTML)
		        if (Math.Abs(_zScoreSuavizado) > 2.0 && _atrSuavizado > 1.5)
		            _marketState = _zScoreSuavizado > 0 ? "EXPLOSAO_COMPRA" : "EXPLOSAO_VENDA";
		        else if (Math.Abs(_zScoreSuavizado) > 2.0 && _atrSuavizado < 1.0)
		            _marketState = _zScoreSuavizado > 0 ? "EXAUSTAO_ALTA" : "EXAUSTAO_BAIXA";
		        else if (Math.Abs(_zScoreSuavizado) < 0.5)
		            _marketState = "COMPRESSAO";
		        else
		            _marketState = "NORMAL";
		
		        // 6. VELOCÍMETRO 0-100 (igual HTML)
		        _velocimetro = 50 + (_zScoreSuavizado / 3.0) * 50;
		        _velocimetro = Math.Max(0, Math.Min(100, _velocimetro));
		
		        // 7. ALERTAS
		        if (EnableAccelerationAlert && Math.Abs(_zScoreSuavizado) >= AccelerationThreshold)
		            CheckAccelerationAlert();
		    }
		
		    // Verifica se deve atualizar Gamma Levels
		    if ((DateTime.Now - _lastGammaFetchTime).TotalMinutes >= GammaUpdateIntervalMinutes)
		    {
		        FetchAndDrawGammaLevelsAsync();
		    }
		    
		    // Verifica se deve atualizar Analysis
			if (_currentAnalysis == null || (DateTime.Now - _lastAnalysisFetchTime).TotalMinutes >= ANALYSIS_UPDATE_INTERVAL_MIN)
			{
			    Print($"[ANALYSIS] >>> Chamando FetchAnalysisAsync (currentAnalysis={(_currentAnalysis != null ? "OK" : "NULL")})");
			    FetchAnalysisAsync();
			}
		
		    SignalRender();
		}

        // ================================================================
        // ONMOUSEDOWN - DETECTAR DOUBLE CLICK PARA TOGGLE ANALYSIS PANEL
        // ================================================================
        
        private float CalculateTotalPanelHeight()
        {
            float panH = SimpleMode
                ? PAD + 18 + 4 + ROW_H + 14 + 12 + PAD
                : PAD + 18 + 4 + 11 * ROW_H + 6 + ROW_H + 14 + 12 + PAD;

            float mdPanH = 0;
            if (ShowMarketDynamics)
                mdPanH = GetMarketDynamicsPanelHeight();

            float tsPanH = 0;
            if (ShowTapeSales)
                tsPanH = PAD + 18 + 4 + TS_MAX_ROWS * TS_ROW_H + PAD;

            return panH + (ShowMarketDynamics ? mdPanH + 4 : 0) + (ShowTapeSales ? tsPanH + 4 : 0);
        }
		
		// ================================================================
        // THROTTLING DE RENDER (CRITICO PARA PERFORMANCE)
        // ================================================================
        private void SignalRender()
        {
            lock (_renderLock)
            {
                _needsRender = true;
            }

            // Verifica throttle antes de despachar
            if ((DateTime.Now - _lastRenderTime).TotalMilliseconds < RENDER_THROTTLE_MS)
                return;

            _lastRenderTime = DateTime.Now;

            if (ChartControl != null)
                ChartControl.Dispatcher.InvokeAsync(() => ChartControl.InvalidateVisual());
        }

        // ================================================================
        // FETCH EM BACKGROUND (SUPABASE)
        // ================================================================
        private void FetchFromSupabase(object state)
        {
            lock (_lock)
            {
                if (_fetching) return;
                _fetching = true;
            }

            try
            {
                string cleanUrl = SupabaseUrl.TrimEnd('/');
                string url = string.Format(
                    "{0}/rest/v1/nasdaq_force?instance_id=eq.{1}&select=*&order=id.desc&limit=1",
                    cleanUrl, Uri.EscapeDataString(InstanceId));

                using (var wc = new WebClient())
                {
                    wc.Headers[HttpRequestHeader.Accept]        = "application/json";
                    wc.Headers["apikey"]                        = ApiKey;
                    wc.Headers[HttpRequestHeader.Authorization] = "Bearer " + ApiKey;

                    string json = wc.DownloadString(url);
                    ParseJson(json);
                }
            }
            catch (Exception ex)
            {
                lock (_lock) { _statusMsg = "Erro: " + ex.Message.Substring(0, Math.Min(40, ex.Message.Length)); }
            }
            finally
            {
                lock (_lock) { _fetching = false; }
                SignalRender();
            }
        }

        // ================================================================
        // FETCH ANALYSIS FROM SUPABASE
        // ================================================================
        private async void FetchAnalysisAsync()
		{
		    Print("[ANALYSIS] >>> FetchAnalysisAsync INICIADO");
		    
		    try
		    {
		        string cleanUrl = SupabaseUrl.TrimEnd('/');
		        string json = "";

		        // 1. Tenta buscar primeiro pelo Símbolo de Referência (ex: NQ, ES, WIN)
		        if (!string.IsNullOrWhiteSpace(GammaReferenceSymbol))
		        {
		            string refUrl = string.Format(
		                "{0}/rest/v1/painelvm_general_analyses?instance_id=eq.{1}&select=*&order=created_at.desc&limit=1",
		                cleanUrl, Uri.EscapeDataString(GammaReferenceSymbol));
		            Print($"[ANALYSIS] Buscando por Símbolo de Referência: {refUrl}");
		            var refResp = await _analysisHttpClient.GetAsync(refUrl);
		            if (refResp.IsSuccessStatusCode)
		            {
		                json = await refResp.Content.ReadAsStringAsync();
		            }
		        }

		        // 2. Se não encontrou pelo símbolo de referência, tenta buscar por InstanceId
		        if ((string.IsNullOrWhiteSpace(json) || json == "[]") && !string.IsNullOrWhiteSpace(InstanceId))
		        {
		            string instanceUrl = string.Format(
		                "{0}/rest/v1/painelvm_general_analyses?instance_id=eq.{1}&select=*&order=created_at.desc&limit=1",
		                cleanUrl, Uri.EscapeDataString(InstanceId));
		            Print($"[ANALYSIS] Buscando por InstanceId ({InstanceId}): {instanceUrl}");
		            var instResp = await _analysisHttpClient.GetAsync(instanceUrl);
		            if (instResp.IsSuccessStatusCode)
		            {
		                json = await instResp.Content.ReadAsStringAsync();
		            }
		        }

		        // 3. Fallback: Se ainda não encontrou, pega a análise mais recente geral do Supabase
		        if (string.IsNullOrWhiteSpace(json) || json == "[]")
		        {
		            Print("[ANALYSIS] Tentando busca global da análise mais recente...");
		            string globalUrl = string.Format(
		                "{0}/rest/v1/painelvm_general_analyses?select=*&order=created_at.desc&limit=1",
		                cleanUrl);
		            var globalResp = await _analysisHttpClient.GetAsync(globalUrl);
		            if (globalResp.IsSuccessStatusCode)
		            {
		                json = await globalResp.Content.ReadAsStringAsync();
		            }
		        }

		        if (string.IsNullOrWhiteSpace(json) || json == "[]")
		        {
		            Print("[ANALYSIS] ✗ Nenhuma análise encontrada na tabela");
		            _currentAnalysis = null;
		            return;
		        }
		            
		        ParseAnalysisJson(json);
		        _lastAnalysisFetchTime = DateTime.Now;
		        
		        if (_currentAnalysis != null)
		            Print($"[ANALYSIS] ✓✓✓ SUCESSO: Direção={_currentAnalysis.Direction}, Estratégia={_currentAnalysis.SetupStrategy}");
		        else
		            Print("[ANALYSIS] ✗✗✗ FALHA: _currentAnalysis continua NULL após parse!");
		    }
		    catch (Exception ex)
		    {
		        Print($"[ANALYSIS] ✗✗✗ EXCEÇÃO: {ex.Message}");
		        Print($"[ANALYSIS] Stack: {ex.StackTrace}");
		    }
		    
		    Print("[ANALYSIS] <<< FetchAnalysisAsync FINALIZADO");
		}

        private void ParseAnalysisJson(string json)
		{
		    json = json.Trim();
		    if (json.Length < 3 || json == "[]")
		    {
		        _currentAnalysis = null;
		        Print("[ANALYSIS] JSON vazio ou nulo");
		        return;
		    }
		
		    // Remove brackets se for array
		    if (json[0] == '[') json = json.Substring(1);
		    if (json[json.Length - 1] == ']') json = json.Substring(0, json.Length - 1);
		
		    try
		    {
		        Print($"[ANALYSIS] JSON recebido ({json.Length} chars)");
		
		        // Extrai campos do NÍVEL SUPERIOR
		        string direction = GetString(json, "direction");
		        string entryPoint = GetString(json, "entry_point");
		        string stopLoss = GetString(json, "stop_loss");
		        string takeProfit = GetString(json, "take_profit");
		        string marketAnalysis = GetString(json, "market_analysis");
		        string createdAt = GetString(json, "created_at");
		
		        Print($"[ANALYSIS] Campos nível superior: direction={direction}, entry_point={entryPoint}");
		
		        // Extrai o objeto full_json (se existente)
		        string fullJson = GetJsonObject(json, "full_json");
		        
		        if (!string.IsNullOrEmpty(fullJson))
		        {
		            Print($"[ANALYSIS] full_json extraído ({fullJson.Length} chars)");
		
		            _currentAnalysis = new AnalysisData
		            {
		                Direction = direction,
		                CreatedAt = createdAt,
		                EntryPoint = GetString(fullJson, "setup_trigger"),
		                StopLoss = GetString(fullJson, "setup_stop"),
		                TakeProfit = GetString(fullJson, "setup_target_1") + " / " + GetString(fullJson, "setup_target_2"),
		                MarketAnalysis = GetString(fullJson, "macro_sentiment"),
		                SetupStrategy = GetString(fullJson, "setup_strategy"),
		                Target1 = GetString(fullJson, "setup_target_1"),
		                Target2 = GetString(fullJson, "setup_target_2"),
		                ZScore = GetString(fullJson, "z_score"),
		                FlowPressure = GetString(fullJson, "flow_pressure"),
		                OptionsRegime = GetString(fullJson, "options_regime")
		            };
		        }
		        else
		        {
		            Print("[ANALYSIS] full_json não presente, utilizando campos do nível superior");
		            _currentAnalysis = new AnalysisData
		            {
		                Direction = direction,
		                CreatedAt = createdAt,
		                EntryPoint = entryPoint,
		                StopLoss = stopLoss,
		                TakeProfit = takeProfit,
		                MarketAnalysis = marketAnalysis,
		                SetupStrategy = "Análise Geral"
		            };
		        }
		
		        // Se os campos do full_json estiverem vazios, usa os do nível superior como fallback
		        if (string.IsNullOrEmpty(_currentAnalysis.EntryPoint))
		            _currentAnalysis.EntryPoint = entryPoint;
		        if (string.IsNullOrEmpty(_currentAnalysis.StopLoss))
		            _currentAnalysis.StopLoss = stopLoss;
		        if (string.IsNullOrEmpty(_currentAnalysis.TakeProfit) || _currentAnalysis.TakeProfit == " / ")
		            _currentAnalysis.TakeProfit = takeProfit;
		        if (string.IsNullOrEmpty(_currentAnalysis.MarketAnalysis))
		            _currentAnalysis.MarketAnalysis = marketAnalysis;
		
		        // Formata data
		        if (!string.IsNullOrEmpty(_currentAnalysis.CreatedAt) && _currentAnalysis.CreatedAt.Length >= 19)
		            _currentAnalysis.CreatedAt = _currentAnalysis.CreatedAt.Substring(0, 19).Replace("T", " ");
		
		        Print($"[ANALYSIS] ✓✓✓ SUCESSO: Direção={_currentAnalysis.Direction}, Estratégia={_currentAnalysis.SetupStrategy}");
		    }
		    catch (Exception ex)
		    {
		        Print($"[ANALYSIS] Erro ao parsear JSON: {ex.Message}");
		        Print($"[ANALYSIS] Stack: {ex.StackTrace}");
		        _currentAnalysis = null;
		    }
		}
		
		// ================================================================
		// NOVO MÉTODO: Extrai um OBJETO JSON aninhado (não uma string)
		// ================================================================
		private static string GetJsonObject(string json, string key)
		{
		    string token = "\"" + key + "\":";
		    int i = json.IndexOf(token, StringComparison.Ordinal);
		    if (i < 0) return "";
		    i += token.Length;
		    
		    // Pula espaços em branco
		    while (i < json.Length && json[i] == ' ') i++;
		    
		    // Verifica se é um objeto (começa com {)
		    if (i >= json.Length || json[i] != '{') return "";
		    
		    // Encontra o fechamento do objeto (considerando objetos aninhados)
		    int braceCount = 0;
		    int j = i;
		    while (j < json.Length)
		    {
		        if (json[j] == '{')
		            braceCount++;
		        else if (json[j] == '}')
		        {
		            braceCount--;
		            if (braceCount == 0)
		            {
		                // Encontrou o fechamento
		                return json.Substring(i, j - i + 1);
		            }
		        }
		        j++;
		    }
		    
		    return "";
		}
		
		// Novo método para extrair strings JSON com aspas escapadas
		private static string GetEscapedString(string json, string key)
		{
		    string token = "\"" + key + "\":\"";
		    int i = json.IndexOf(token, StringComparison.Ordinal);
		    if (i < 0) return "";
		    i += token.Length;
		    
		    // Procura pelo fim da string, considerando aspas escapadas
		    int j = i;
		    while (j < json.Length)
		    {
		        if (json[j] == '"' && json[j - 1] != '\\')
		        {
		            // Encontrou aspa não escapada - fim da string
		            break;
		        }
		        j++;
		    }
		    
		    if (j >= json.Length) return "";
		    
		    string result = json.Substring(i, j - i);
		    
		    // Remove as aspas escapadas
		    result = result.Replace("\\\"", "\"");
		    result = result.Replace("\\\\", "\\");
		    
		    return result;
		}

        // ================================================================
        // PARSE JSON
        // ================================================================
        private void ParseJson(string json)
        {
            json = json.Trim();
            if (json.Length < 3 || json == "[]")
            {
                lock (_lock) { _statusMsg = "Sem dados (array vazio)"; }
                return;
            }

            if (json[0] == '[') json = json.Substring(1);
            if (json[json.Length - 1] == ']') json = json.Substring(0, json.Length - 1);

            double ffBuyLocal, ffSellLocal;
            int    ffDirLocal;

            lock (_lock)
            {
                _nasBuy   = GetDouble(json, "nasdaq_compra");
                _nasSell  = GetDouble(json, "nasdaq_venda");
                _spBuy    = GetDouble(json, "sp500_compra");
                _spSell   = GetDouble(json, "sp500_venda");
                _usdBuy   = GetDouble(json, "usdindex_compra");
                _usdSell  = GetDouble(json, "usdindex_venda");
                _vixBuy   = GetDouble(json, "vix_compra");
                _vixSell  = GetDouble(json, "vix_venda");
                _nvdaBuy  = GetDouble(json, "nvidia_compra");
                _nvdaSell = GetDouble(json, "nvidia_venda");
                _msftBuy  = GetDouble(json, "microsoft_compra");
                _msftSell = GetDouble(json, "microsoft_venda");
                _aaplBuy  = GetDouble(json, "apple_compra");
                _aaplSell = GetDouble(json, "apple_venda");
                _metaBuy  = GetDouble(json, "meta_compra");
                _metaSell = GetDouble(json, "meta_venda");
                _amznBuy  = GetDouble(json, "amazon_compra");
                _amznSell = GetDouble(json, "amazon_venda");
                _googlBuy = GetDouble(json, "alphabet_compra");
                _googlSell= GetDouble(json, "alphabet_venda");
                _tslaBuy  = GetDouble(json, "tesla_compra");
                _tslaSell = GetDouble(json, "tesla_venda");
                _ffBuy    = GetDouble(json, "forca_final_compra");
                _ffSell   = GetDouble(json, "forca_final_venda");
                _ffDir    = (int)GetDouble(json, "direcao");
                _nasOpen  = GetBool(json, "nasdaq_aberto");
                _updatedAt= GetString(json, "updated_at");

                if (_updatedAt.Length >= 19)
                    _updatedAt = _updatedAt.Substring(11, 8);

                _statusMsg = "OK " + _updatedAt;
                _hasData   = true;

                ffBuyLocal  = _ffBuy;
                ffSellLocal = _ffSell;
                ffDirLocal  = _ffDir;
            }

            CheckAlert(ffBuyLocal, ffSellLocal, ffDirLocal);
        }

        // ================================================================
        // ALERTAS
        // ================================================================
        private void CheckAlert(double ffBuy, double ffSell, int ffDir)
        {
            if (!EnableAlert) return;

            double maxForce = Math.Max(ffBuy, ffSell);
            if (maxForce < AlertThreshold) return;

            bool   isBuy = ffBuy >= ffSell;
            string dir   = isBuy ? "COMPRA" : "VENDA";
            string msg   = string.Format(
                "Forca Total {0}: {1:F0}% (limite {2:F0}%)",
                dir, maxForce, AlertThreshold);

            Alert(
                "VMnqForce_Threshold",
                Priority.High,
                msg,
                "Alert1.wav",
                AlertRearmSec,
                Brushes.Black,
                isBuy ? Brushes.LimeGreen : Brushes.Red);
        }

        private void CheckCombinedAlert(TradeInfo trade, bool isBuy, long vol)
        {
            if (!EnableCombinedAlert || !_hasData) return;
            if ((DateTime.Now - _lastTradeAlertTime).TotalSeconds < TsAlertRearmSec)
                return;

            double maxForce = Math.Max(_ffBuy, _ffSell);
            if (maxForce < AlertThreshold) return;

            bool forceIsBuy = _ffBuy >= _ffSell;
            bool tradeMatchesForce = (isBuy && forceIsBuy) || (!isBuy && !forceIsBuy);
            if (!tradeMatchesForce) return;

            _lastTradeAlertTime = DateTime.Now;

            string direction = isBuy ? "COMPRA" : "VENDA";
            string msg = string.Format(
                "ALERTA T&S: {0} {1} contratos @ {2:F2} | Forca {3:F0}%",
                direction, vol, trade.Price, maxForce);

            Alert(
                "VMnqForce_Combined",
                Priority.High,
                msg,
                "Alert2.wav",
                TsAlertRearmSec,
                Brushes.Black,
                isBuy ? Brushes.LimeGreen : Brushes.Red);
        }

        private void CheckAccelerationAlert()
        {
            if ((DateTime.Now - _lastAccelerationAlertTime).TotalSeconds < AccelerationAlertRearmSec)
                return;

            _lastAccelerationAlertTime = DateTime.Now;

            string direction = _zScoreSuavizado > 0 ? "COMPRA" : "VENDA";
            string msg = string.Format(
                "ALERTA ACELERACAO: {0} | Z-Score: {1:F2} | ATR: {2:F2} | Estado: {3}",
                direction, _zScoreSuavizado, _atrSuavizado, _marketState.Replace("_", " "));

            Alert(
                "VMnqForce_Acceleration",
                Priority.High,
                msg,
                "Alert3.wav",
                AccelerationAlertRearmSec,
                Brushes.Black,
                _zScoreSuavizado > 0 ? Brushes.LimeGreen : Brushes.Red);
        }

        // ================================================================
        // GAMMA LEVELS - FETCH DO SUPABASE
        // ================================================================
        private async void FetchAndDrawGammaLevelsAsync()
        {
            if (string.IsNullOrEmpty(GammaReferenceSymbol))
            {
                Print("[GAMMA] Erro: Símbolo de Referência não configurado");
                return;
            }

            try
            {
                Print($"[GAMMA] >>> Buscando níveis para {GammaReferenceSymbol}...");
                _lastGammaFetchTime = DateTime.Now;

                string cleanUrl = SupabaseUrl.TrimEnd('/');
                string url = string.Format(
                    "{0}/rest/v1/gamma_levels?reference_symbol=eq.{1}&order=id.desc&limit=1&select=*",
                    cleanUrl, System.Uri.EscapeDataString(GammaReferenceSymbol));

                var response = await _gammaHttpClient.GetAsync(url);

                if (response.IsSuccessStatusCode)
                {
                    string json = await response.Content.ReadAsStringAsync();
                    Print($"[GAMMA] Resposta recebida: {json.Length} caracteres");

                    if (!string.IsNullOrWhiteSpace(json) && json.Trim().StartsWith("[") && json.Trim().Length > 2)
                    {
                        Print("[GAMMA] ✓ JSON válido, processando...");
                        DrawLinesFromJson(json);
                    }
                    else
                    {
                        Print("[GAMMA] Aviso: Nenhum dado encontrado na tabela para hoje");
                        ClearGammaLines();
                    }
                }
                else
                {
                    Print($"[GAMMA] Erro HTTP {response.StatusCode}: {response.ReasonPhrase}");
                }
            }
            catch (Exception ex)
            {
                Print($"[GAMMA] Erro ao buscar: {ex.Message}");
            }
        }

        private void DrawLinesFromJson(string json)
        {
            ClearGammaLines();

            var priceGroups = new Dictionary<double, LevelGroup>();

            void RegisterLevel(string name, double? price, System.Windows.Media.Color color, bool isVisible)
            {
                if (!isVisible || price == null || price.Value == 0) return;
                double p = Math.Round(price.Value, 2);
                if (!priceGroups.ContainsKey(p)) priceGroups[p] = new LevelGroup { Color = color };
                if (!priceGroups[p].Names.Contains(name)) priceGroups[p].Names.Add(name);
            }

            if (ShowGammaPrevLevels)
            {
                RegisterLevel("Prev High",   GetGammaJsonValue(json, "prev_day_high"),   System.Windows.Media.Colors.Red,   true);
                RegisterLevel("Prev Low",    GetGammaJsonValue(json, "prev_day_low"),    System.Windows.Media.Colors.Lime,    true);
                RegisterLevel("Prev Open",   GetGammaJsonValue(json, "prev_day_open"),   System.Windows.Media.Colors.DodgerBlue,   true);
                RegisterLevel("Prev Close",  GetGammaJsonValue(json, "prev_day_close"),  System.Windows.Media.Colors.White,  true);
                RegisterLevel("Prev Adjust", GetGammaJsonValue(json, "prev_day_adjust"), System.Windows.Media.Colors.Orange, true);
            }

            RegisterLevel("Gamma Wall 0DTE",     GetGammaJsonValue(json, "gamma_wall_0dte"),     System.Windows.Media.Colors.Red, ShowGammaWall);
            RegisterLevel("HVL",                 GetGammaJsonValue(json, "hvl"),                 System.Windows.Media.Colors.Cyan,   ShowGammaHVL);
            RegisterLevel("HVL 0DTE",            GetGammaJsonValue(json, "hvl_0dte"),            System.Windows.Media.Colors.Cyan,   ShowGammaHVL);
            RegisterLevel("Put Support",         GetGammaJsonValue(json, "put_support"),         System.Windows.Media.Colors.LimeGreen,   ShowGammaPut);
            RegisterLevel("Put Support 0DTE",    GetGammaJsonValue(json, "put_support_0dte"),    System.Windows.Media.Colors.LimeGreen,   ShowGammaPut);
            RegisterLevel("Call Resistance",     GetGammaJsonValue(json, "call_resistance"),     System.Windows.Media.Colors.OrangeRed,  ShowGammaCall);
            RegisterLevel("Call Resistance 0DTE",GetGammaJsonValue(json, "call_resistance_0dte"),System.Windows.Media.Colors.OrangeRed,  ShowGammaCall);
            RegisterLevel("Max 1D",              GetGammaJsonValue(json, "max_1d"),              System.Windows.Media.Colors.Yellow,ShowGammaMinMax);
            RegisterLevel("Min 1D",              GetGammaJsonValue(json, "min_1d"),              System.Windows.Media.Colors.Yellow,ShowGammaMinMax);

            if (ShowGammaGEX)
            {
                var gexList = GetGammaJsonArray(json, "gex");
                for (int i = 0; i < gexList.Count; i++)
                    RegisterLevel($"GEX {i + 1}", gexList[i], System.Windows.Media.Colors.MediumSeaGreen, true);
            }

            if (ShowGammaBL)
            {
                var blList = GetGammaJsonArray(json, "bl");
                for (int i = 0; i < blList.Count; i++)
                    RegisterLevel($"BL {i + 1}", blList[i], System.Windows.Media.Colors.MediumPurple, true);
            }

            // Monta lista para OnRender (SEM DESENHAR LINHAS AQUI!)
            var newGammaLevels = new List<GammaRenderLevel>();

            foreach (var group in priceGroups)
            {
                double price     = group.Key;
                string labelText = string.Join(" && ", group.Value.Names);
                var    color     = group.Value.Color;

                newGammaLevels.Add(new GammaRenderLevel
                {
                    Price = price,
                    Label = labelText,
                    Color = color,
                    LineStyle = labelText.Contains("GEX") || labelText.Contains("BL") ? "Dashed" : "Solid",
                    LineThickness = labelText.Contains("GEX") || labelText.Contains("BL") ? 1 : 2
                });

                Print($"[GAMMA] Nível registrado: {labelText} @ {price}");
            }

            lock (_gammaRenderLock)
                _gammaRenderLevels = newGammaLevels;

            Print($"[GAMMA] ✓✓✓ Concluído! {newGammaLevels.Count} níveis para renderizar");

            // Força re-render
            if (ChartControl != null)
                ChartControl.InvalidateVisual();
        }

        private double? GetGammaJsonValue(string json, string key)
        {
            string searchKey = $"\"{key}\":";
            int startIndex = json.IndexOf(searchKey);
            if (startIndex == -1) return null;
            startIndex += searchKey.Length;
            int endIndex = json.IndexOf(',', startIndex);
            if (endIndex == -1) endIndex = json.IndexOf('}', startIndex);
            if (endIndex == -1) return null;
            string valueStr = json.Substring(startIndex, endIndex - startIndex).Trim();
            if (valueStr.Equals("null", StringComparison.OrdinalIgnoreCase)) return null;
            return double.TryParse(valueStr,
                System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture,
                out double r) ? r : (double?)null;
        }

        private List<double> GetGammaJsonArray(string json, string key)
        {
            var list = new List<double>();
            string searchKey = $"\"{key}\":[";
            int startIndex = json.IndexOf(searchKey);
            if (startIndex == -1) return list;
            startIndex += searchKey.Length;
            int endIndex = json.IndexOf(']', startIndex);
            if (endIndex == -1) return list;
            foreach (string item in json.Substring(startIndex, endIndex - startIndex).Split(','))
                if (double.TryParse(item.Trim(),
                    System.Globalization.NumberStyles.Any,
                    System.Globalization.CultureInfo.InvariantCulture,
                    out double v))
                    list.Add(v);
            return list;
        }

        private void ClearGammaLines()
        {
            lock (_gammaRenderLock)
                _gammaRenderLevels.Clear();

            Print("[GAMMA] Níveis anteriores limpos");
        }

        private class LevelGroup
        {
            public List<string> Names = new List<string>();
            public System.Windows.Media.Color Color;
        }

        private class GammaRenderLevel
        {
            public double Price;
            public string Label;
            public System.Windows.Media.Color Color;
            public string LineStyle = "Solid";
            public int LineThickness = 2;
        }

        // ─── Desenha as LINHAS dos níveis Gamma via SharpDX (ANTES dos painéis) ───
        private void DrawGammaLines(ChartControl chartControl, ChartScale chartScale)
        {
            List<GammaRenderLevel> levels;
            lock (_gammaRenderLock)
                levels = new List<GammaRenderLevel>(_gammaRenderLevels);

            if (levels.Count == 0) return;

            foreach (var level in levels)
            {
                float yPixel = (float)chartScale.GetYByValue(level.Price);

                // Ignora níveis fora da área visível
                if (yPixel < chartScale.GetYByValue(chartScale.MaxValue) ||
                    yPixel > chartScale.GetYByValue(chartScale.MinValue))
                    continue;

                // Converte cor WPF → SharpDX
                var dxColor = new SharpDX.Color4(
                    level.Color.R / 255f,
                    level.Color.G / 255f,
                    level.Color.B / 255f,
                    level.Color.A / 255f);

                using (var brush = new SharpDX.Direct2D1.SolidColorBrush(RenderTarget, dxColor))
                {
                    // Desenha a linha horizontal
                    float xStart = (float)chartControl.CanvasLeft;
                    float xEnd = (float)chartControl.CanvasRight;
                    
                    if (level.LineStyle == "Dashed")
                    {
                        // Linha pontilhada (simular com pequenos segmentos)
                        for (float x = xStart; x < xEnd; x += 8f)
                        {
                            RenderTarget.DrawLine(
                                new Vector2(x, yPixel),
                                new Vector2(Math.Min(x + 4f, xEnd), yPixel),
                                brush,
                                level.LineThickness);
                        }
                    }
                    else
                    {
                        // Linha sólida
                        RenderTarget.DrawLine(
                            new Vector2(xStart, yPixel),
                            new Vector2(xEnd, yPixel),
                            brush,
                            level.LineThickness);
                    }
                }
            }
        }

        // ─── Desenha os textos dos níveis Gamma via SharpDX ───
        private void DrawGammaLevelLabels(ChartControl chartControl, ChartScale chartScale)
        {
            List<GammaRenderLevel> levels;
            lock (_gammaRenderLock)
                levels = new List<GammaRenderLevel>(_gammaRenderLevels);

            if (levels.Count == 0) return;

            // Largura máxima do texto — o texto termina em CanvasRight - 4px
            float maxWidth  = 400f;
            float xText     = (float)chartControl.CanvasRight - maxWidth - 4f;
            float fontSize  = 9.5f;

            using (var textFormat = new SharpDX.DirectWrite.TextFormat(
                Core.Globals.DirectWriteFactory,
                "Arial",
                SharpDX.DirectWrite.FontWeight.Normal,
                SharpDX.DirectWrite.FontStyle.Normal,
                fontSize))
            {
                // Trailing = alinha o FIM do texto à borda direita do TextLayout
                textFormat.TextAlignment      = SharpDX.DirectWrite.TextAlignment.Trailing;
                textFormat.WordWrapping       = SharpDX.DirectWrite.WordWrapping.NoWrap;
                textFormat.ParagraphAlignment = SharpDX.DirectWrite.ParagraphAlignment.Center;

                foreach (var level in levels)
                {
                    float yPixel = (float)chartScale.GetYByValue(level.Price);

                    // Ignora níveis fora da área visível
                    if (yPixel < chartScale.GetYByValue(chartScale.MaxValue) ||
                        yPixel > chartScale.GetYByValue(chartScale.MinValue))
                        continue;

                    // Converte cor WPF → SharpDX
                    var dxColor = new SharpDX.Color4(
                        level.Color.R / 255f,
                        level.Color.G / 255f,
                        level.Color.B / 255f,
                        level.Color.A / 255f);

                    using (var brush = new SharpDX.Direct2D1.SolidColorBrush(RenderTarget, dxColor))
                    using (var layout = new SharpDX.DirectWrite.TextLayout(
                        Core.Globals.DirectWriteFactory,
                        level.Label,
                        textFormat,
                        maxWidth,
                        16f))
                    {
                        // Texto 2px acima da linha
                        RenderTarget.DrawTextLayout(
                            new SharpDX.Vector2(xText, yPixel - 14f),
                            layout,
                            brush,
                            SharpDX.Direct2D1.DrawTextOptions.None);
                    }
                }
            }
        }

        // --- Helpers de parse JSON ---
        private static double GetDouble(string json, string key)
        {
            string token = "\"" + key + "\":";
            int i = json.IndexOf(token, StringComparison.Ordinal);
            if (i < 0) return 0;
            i += token.Length;
            while (i < json.Length && (json[i] == ' ')) i++;
            int j = i;
            while (j < json.Length && (char.IsDigit(json[j]) || json[j] == '.' || json[j] == '-')) j++;
            double v;
            double.TryParse(json.Substring(i, j - i),
                System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out v);
            return v;
        }

        private static bool GetBool(string json, string key)
        {
            string token = "\"" + key + "\":";
            int i = json.IndexOf(token, StringComparison.Ordinal);
            if (i < 0) return false;
            i += token.Length;
            while (i < json.Length && json[i] == ' ') i++;
            return i + 4 <= json.Length && json.Substring(i, 4) == "true";
        }

        private static string GetString(string json, string key)
		{
		    string tokenStart = "\"" + key + "\"";
		    int i = json.IndexOf(tokenStart, StringComparison.Ordinal);
		    if (i < 0) return "";
		    i += tokenStart.Length;
		    
		    // Pula espaços e dois pontos (ex: "key" : "value" ou "key":"value")
		    while (i < json.Length && (json[i] == ' ' || json[i] == ':')) i++;
		    
		    if (i >= json.Length || json[i] != '"') return "";
		    i++; // pula a aspa de abertura
		    
		    int j = json.IndexOf('"', i);
		    if (j < 0) return "";
		    return json.Substring(i, j - i);
		}

        // ================================================================
        // RENDER
        // ================================================================
        protected override void OnRender(ChartControl chartControl, ChartScale chartScale)
		{
		    if (RenderTarget == null) return;
		    EnsureBrushes();
		
		    // Consome flag de render necessario
		    lock (_renderLock)
		    {
		        _needsRender = false;
		    }
		
		    // ✓✓✓ DESENHA GAMMA LINES PRIMEIRO (atrás dos painéis) ✓✓✓
		    DrawGammaLines(chartControl, chartScale);
		
		    float panW = SimpleMode ? 190f : 242f;
		    float barW = panW - 2*PAD - NAME_W - 2*VAL_W - 2*GAP_H;
		    if (barW < 10) barW = 10;
		
		    float rowH = ROW_H + (ShowBar ? 2 : 0);
		
		    float panH = SimpleMode
		        ? PAD + 18 + 4 + rowH + 14 + 12 + PAD
		        : PAD + 18 + 4 + 11 * rowH + 6 + rowH + 14 + 12 + PAD;
		
		    float mdPanH = 0;
		    if (ShowMarketDynamics)
		        mdPanH = GetMarketDynamicsPanelHeight();
		
		    float tsPanH = 0;
		    if (ShowTapeSales)
		        tsPanH = PAD + 18 + 4 + TS_MAX_ROWS * TS_ROW_H + PAD;
		
		    float totalH = panH + (ShowMarketDynamics ? mdPanH + 4 : 0) + (ShowTapeSales ? tsPanH + 4 : 0);
		
		    float cw = (float)ChartPanel.W;
		    float ch = (float)ChartPanel.H;
		    float px, py;
		    switch (PanelCorner)
		    {
		        case 1:  px = cw - panW - OffsetX; py = OffsetY;             break;
		        case 2:  px = OffsetX;              py = ch - totalH - OffsetY; break;
		        case 3:  px = cw - panW - OffsetX; py = ch - totalH - OffsetY; break;
		        default: px = OffsetX;              py = OffsetY;             break;
		    }

		    // Se mostrar painel de análise
			if (_showAnalysisPanel)
			{
			    float analysisPanH = GetAnalysisPanelHeight();
			    RenderTarget.FillRectangle(new RectangleF(px, py, panW, analysisPanH), _bAnalysisBg);
			    RenderTarget.DrawRectangle(new RectangleF(px, py, panW, analysisPanH), _bAnalysisBorder, 0.8f);
			    
			    if (_currentAnalysis != null)
			    {
			        DrawAnalysisPanel(px, py, panW);
			    }
			    else
			    {
			        // Mostra mensagem de carregando
			        string title = "📊 ANÁLISE";
			        RenderTarget.DrawText(title, _tfTitle,
			            new RectangleF(px + PAD, py + PAD / 2f, panW - 2 * PAD, 18), _bGold);
			        
			        RenderTarget.DrawText("Aguardando dados...", _tfMed,
			            new RectangleF(px + PAD, py + 60, panW - 2 * PAD, 30), _bGray);
			    }
			}

		    else
		    {
		        RenderTarget.FillRectangle(new RectangleF(px, py, panW, panH), _bBg);
		        RenderTarget.DrawRectangle(new RectangleF(px, py, panW, panH), _bBorder, 0.8f);
		
		        string title = "VM NASDAQ TREND";
		        RenderTarget.DrawText(title, _tfTitle,
		            new RectangleF(px + PAD, py + PAD / 2f, panW - 2 * PAD, 18), _bGold);
		
		        float y = py + PAD + 18 + 4;
		
		        if (!_hasData)
		        {
		            RenderTarget.DrawText(_statusMsg, _tfMed,
		                new RectangleF(px + PAD, y, panW - 2 * PAD, 30), _bGray);
		        }
		        else
		        {
		            if (!SimpleMode)
		            {
		                DrawRow(px, barW, ref y, "NAS100",    _nasBuy,   _nasSell,   false);
		                DrawRow(px, barW, ref y, "SP500",     _spBuy,    _spSell,    false);
		                DrawRow(px, barW, ref y, "USD INDEX", _usdBuy,   _usdSell,   false, true);
		                DrawRow(px, barW, ref y, "VIX",       _vixBuy,   _vixSell,   false, true);
		
		                RenderTarget.DrawLine(new Vector2(px + PAD, y), new Vector2(px + panW - PAD, y), _bBorder, 0.5f);
		                y += 4;
		
		                DrawRow(px, barW, ref y, "NVIDIA",    _nvdaBuy,  _nvdaSell,  false);
		                DrawRow(px, barW, ref y, "MICROSOFT", _msftBuy,  _msftSell,  false);
		                DrawRow(px, barW, ref y, "APPLE",     _aaplBuy,  _aaplSell,  false);
		                DrawRow(px, barW, ref y, "META",      _metaBuy,  _metaSell,  false);
		                DrawRow(px, barW, ref y, "AMAZON",    _amznBuy,  _amznSell,  false);
		                DrawRow(px, barW, ref y, "ALPHABET",  _googlBuy, _googlSell, false);
		                DrawRow(px, barW, ref y, "TESLA",     _tslaBuy,  _tslaSell,  false);
		
		                RenderTarget.DrawLine(new Vector2(px + PAD, y), new Vector2(px + panW - PAD, y), _bGold, 0.5f);
		                y += 3;
		            }
		
		            RenderTarget.FillRectangle(new RectangleF(px + 2, y - 1, panW - 4, rowH + 3), _bFfBg);
					DrawRow(px, barW, ref y, "TOTAL", _ffBuy, _ffSell, true); // ✅ Mudou de "FORCA TOTAL" para "TOTAL"
					
					// ✅ Removido o badge "OFF-HOURS" / "NASDAQ OPEN"
		
		            if (ShowMarketDynamics)
		            {
		                float mdY = py + panH + 4;
		                DrawMarketDynamicsPanel(px, mdY, panW);
		            }
		
		            if (ShowTapeSales)
		            {
		                float tsY = py + panH + (ShowMarketDynamics ? mdPanH + 4 : 0) + 4;
		                DrawTapeSalesPanel(px, tsY, panW);
		            }
		        }
		    }
		
		    // ✓✓✓ DESENHA GAMMA LABELS POR ÚLTIMO (sobre tudo) ✓✓✓
		    DrawGammaLevelLabels(chartControl, chartScale);
		
		    // ================================================================
		    // DESENHA O BOTÃO DE ALTERNÂNCIA (canto inferior direito)
		    // ================================================================
		    DrawToggleButton(cw, ch);
		}
		
			
		// ================================================================
		// BOTÃO DE ALTERNÂNCIA DE PAINEL (canto inferior direito)
		// ================================================================
		private void DrawToggleButton(float chartWidth, float chartHeight)
		{
		    // Posição: canto inferior direito, com 10px de margem
		    float btnX = chartWidth - TOGGLE_BTN_W - 12f;
		    float btnY = chartHeight - TOGGLE_BTN_H - 12f;
		
		    // Guarda o retângulo para detecção de clique
		    _toggleButtonRect = new RectangleF(btnX, btnY, TOGGLE_BTN_W, TOGGLE_BTN_H);
		
		    // Fundo do botão (gradiente sutil)
		    DXBrush bgBrush = _showAnalysisPanel ? _bGreenDim : _bOrange;
		    DXBrush borderBrush = _showAnalysisPanel ? _bGreen : _bGold;
		
		    RenderTarget.FillRectangle(_toggleButtonRect, bgBrush);
		    RenderTarget.DrawRectangle(_toggleButtonRect, borderBrush, 1.2f);
		
		    // Texto do botão
		    string btnText = _showAnalysisPanel ? "VER FORCA >>" : "VER ANALISE >>";
		    
		    using (var tfBtn = new SharpDX.DirectWrite.TextFormat(
		        Core.Globals.DirectWriteFactory,
		        "Arial",
		        SharpDX.DirectWrite.FontWeight.Bold,
		        SharpDX.DirectWrite.FontStyle.Normal,
		        10f))
		    {
		        tfBtn.TextAlignment = SharpDX.DirectWrite.TextAlignment.Center;
		        tfBtn.ParagraphAlignment = SharpDX.DirectWrite.ParagraphAlignment.Center;
		        tfBtn.WordWrapping = SharpDX.DirectWrite.WordWrapping.NoWrap;
		
		        RenderTarget.DrawText(
		            btnText,
		            tfBtn,
		            _toggleButtonRect,
		            _bBg,  // texto escuro sobre fundo claro
		            SharpDX.Direct2D1.DrawTextOptions.None);
		    }
		}

        // ================================================================
        // ANALYSIS PANEL
        // ================================================================
        private float GetAnalysisPanelHeight()
{
    float h = PAD + 18 + 4; // Topo + Título
    h += 30;                // Direção (fonte grande)
    h += (MD_ROW_H - 2) + (MD_ROW_H * 1.5f) + 4; // Estratégia
    h += (MD_ROW_H - 2) + (MD_ROW_H * 1.5f) + 4; // Entrada
    h += (MD_ROW_H - 2) + MD_ROW_H + 4;          // Stop
    h += (MD_ROW_H - 2) + (MD_ROW_H * 1.2f) + 4; // Alvos
    h += (MD_ROW_H - 2) + (MD_ROW_H * 3.5f) + 6; // ✅ Análise (aumentado)
    h += MD_ROW_H;          // Data/Hora
    h += PAD + 4;           // Fundo
    return h;
}

        private void DrawAnalysisPanel(float px, float py, float panW)
{
    if (_currentAnalysis == null) return;

    string title = "VM NASDAQ TREND";
    RenderTarget.DrawText(title, _tfTitle,
        new RectangleF(px + PAD, py + PAD / 2f, panW - 2 * PAD, 18), _bGold);

    float y = py + PAD + 18 + 4;

    // DIREÇÃO (Fonte Gigante)
    DXBrush dirColor = _currentAnalysis.Direction == "VENDER" ? _bRed : 
                       _currentAnalysis.Direction == "COMPRAR" ? _bGreen : _bOrange;
    
    RenderTarget.DrawText(_currentAnalysis.Direction, _tfHuge,
        new RectangleF(px + PAD, y, panW - 2 * PAD, 30), dirColor);
    y += 30;

    // ESTRATÉGIA
    RenderTarget.DrawText("ESTRATÉGIA:", _tfSmall,
        new RectangleF(px + PAD, y, panW - 2 * PAD, MD_ROW_H), _bOrange);
    y += MD_ROW_H - 2;
    RenderTarget.DrawText(_currentAnalysis.SetupStrategy, _tfSmall,
        new RectangleF(px + PAD, y, panW - 2 * PAD, MD_ROW_H * 1.5f), _bGray);
    y += MD_ROW_H * 1.5f + 4;

    // ENTRADA
    RenderTarget.DrawText("ENTRADA:", _tfSmall,
        new RectangleF(px + PAD, y, panW - 2 * PAD, MD_ROW_H), _bOrange);
    y += MD_ROW_H - 2;
    RenderTarget.DrawText(_currentAnalysis.EntryPoint, _tfSmall,
        new RectangleF(px + PAD, y, panW - 2 * PAD, MD_ROW_H * 1.5f), _bGray);
    y += MD_ROW_H * 1.5f + 4;

    // STOP
    RenderTarget.DrawText("STOP:", _tfSmall,
        new RectangleF(px + PAD, y, panW - 2 * PAD, MD_ROW_H), _bOrange);
    y += MD_ROW_H - 2;
    RenderTarget.DrawText(_currentAnalysis.StopLoss, _tfSmall,
        new RectangleF(px + PAD, y, panW - 2 * PAD, MD_ROW_H), _bRed);
    y += MD_ROW_H + 4;

    // ALVOS
    RenderTarget.DrawText("ALVOS:", _tfSmall,
        new RectangleF(px + PAD, y, panW - 2 * PAD, MD_ROW_H), _bOrange);
    y += MD_ROW_H - 2;
    RenderTarget.DrawText(_currentAnalysis.TakeProfit, _tfSmall,
        new RectangleF(px + PAD, y, panW - 2 * PAD, MD_ROW_H * 1.2f), _bGreen);
    y += MD_ROW_H * 1.2f + 4;

    // ✅ ANÁLISE - CAIXA AUMENTADA PARA 3.5 LINHAS (era 2.5)
    RenderTarget.DrawText("ANÁLISE:", _tfSmall,
        new RectangleF(px + PAD, y, panW - 2 * PAD, MD_ROW_H), _bOrange);
    y += MD_ROW_H - 2;
    RenderTarget.DrawText(_currentAnalysis.MarketAnalysis, _tfSmall,
        new RectangleF(px + PAD, y, panW - 2 * PAD, MD_ROW_H * 3.5f), _bGray); // ✅ AUMENTADO
    y += MD_ROW_H * 3.5f + 6; // ✅ Espaçamento maior antes da data

    // DATA E HORÁRIO
    string timeText = "🕐 Atualizado: " + _currentAnalysis.CreatedAt;
    RenderTarget.DrawText(timeText, _tfSmall,
        new RectangleF(px + PAD, y, panW - 2 * PAD, MD_ROW_H), _bGray);
}

        // ================================================================
        // MARKET DYNAMICS PANEL RENDER COM VELOCIMETRO
        // ================================================================
		// MARKET DYNAMICS PANEL RENDER COM VELOCIMETRO (CORRIGIDO)
		// ================================================================
		private float GetMarketDynamicsPanelHeight()
		{
		    return PAD + 18 + 4
		         + 60  // Altura do velocímetro
		         + GAUGE_GAP
		         + MD_ROW_H * 3  // Z-Score, ATR Ratio, Estado
		         + PAD + 4;  // ✅ ADICIONADO: padding extra para evitar corte
		}
		
		private void DrawMarketDynamicsPanel(float px, float py, float panW)
		{
		    float mdPanH = GetMarketDynamicsPanelHeight();
		
		    RenderTarget.FillRectangle(new RectangleF(px, py, panW, mdPanH), _bMdBg);
		    RenderTarget.DrawRectangle(new RectangleF(px, py, panW, mdPanH), _bMdBorder, 0.8f);
		
		    string title = "MARKET DYNAMICS";
		    RenderTarget.DrawText(title, _tfTitle,
		        new RectangleF(px + PAD, py + PAD / 2f, panW - 2 * PAD, 18), _bGold);
		
		    float y = py + PAD + 18 + 4;
		
		    // ========================================
		    // VELOCIMETRO (GAUGE 0-100)
		    // ========================================
		    float gaugeHeight = 60f;
		    float gaugeWidth = panW - 2 * PAD;
		    float gaugeX = px + PAD;
		    float gaugeY = y;
		
		    // Fundo do gauge (gradiente vermelho → amarelo → verde)
		    float segmentWidth = gaugeWidth / 3f;
		    
		    // Vermelho (0-33)
		    RenderTarget.FillRectangle(new RectangleF(gaugeX, gaugeY, segmentWidth, gaugeHeight), _bRedDim);
		    // Amarelo (34-66)
		    RenderTarget.FillRectangle(new RectangleF(gaugeX + segmentWidth, gaugeY, segmentWidth, gaugeHeight), _bOrange);
		    // Verde (67-100)
		    RenderTarget.FillRectangle(new RectangleF(gaugeX + segmentWidth * 2, gaugeY, segmentWidth, gaugeHeight), _bGreenDim);
		
		    // Marcador do velocímetro
			float markerPos = gaugeX + ((float)_velocimetro / 100f) * gaugeWidth;
			float markerHeight = gaugeHeight * 0.8f;
			float markerY = gaugeY + (gaugeHeight - markerHeight) / 2f;
		
		    // Sombra do marcador
		    RenderTarget.FillRectangle(new RectangleF(markerPos - 3, markerY - 2, 8, markerHeight + 4), _bGray);
		    // Marcador principal
		    RenderTarget.FillRectangle(new RectangleF(markerPos - 2, markerY, 6, markerHeight), 
		        _velocimetro < 40 ? _bRed : (_velocimetro < 60 ? _bOrange : _bGreen));
		
		    // Valor do velocímetro (centralizado)
		    string gaugeValue = _velocimetro.ToString("F0");
		    RenderTarget.DrawText(gaugeValue, _tfBold,
		        new RectangleF(gaugeX, gaugeY + gaugeHeight / 2f - 10, gaugeWidth, 20),
		        _velocimetro < 40 ? _bRed : (_velocimetro < 60 ? _bOrange : _bGreen));
		
		    // Labels
		    RenderTarget.DrawText("VENDA", _tfTiny,
		        new RectangleF(gaugeX, gaugeY + gaugeHeight + 2, gaugeWidth / 3f, 12), _bRedDim);
		    RenderTarget.DrawText("NEUTRO", _tfTiny,
		        new RectangleF(gaugeX + gaugeWidth / 3f, gaugeY + gaugeHeight + 2, gaugeWidth / 3f, 12), _bOrange);
		    RenderTarget.DrawText("COMPRA", _tfTiny,
		        new RectangleF(gaugeX + gaugeWidth * 2 / 3f, gaugeY + gaugeHeight + 2, gaugeWidth / 3f, 12), _bGreenDim);
		
		    y = gaugeY + gaugeHeight + 18;
		
		    // ========================================
		    // Z-SCORE (SEM BARRA - SOMENTE TEXTO E VALOR)
		    // ========================================
		    RenderTarget.DrawText("Z-SCORE", _tfSmall,
		        new RectangleF(px + PAD, y, 70, MD_ROW_H), _bOrange);
		
		    string zScoreText = _zScoreSuavizado.ToString("F2");
		    DXBrush zScoreColor = _zScoreSuavizado > 2 ? _bGreen : 
		                          _zScoreSuavizado < -2 ? _bRed : _bGray;
		    
		    RenderTarget.DrawText(zScoreText, _tfBold,
		        new RectangleF(px + 80, y, panW - 90, MD_ROW_H), zScoreColor);
		
		    y += MD_ROW_H + 2;
		
		    // ========================================
		    // ATR RATIO (SEM BARRA - SOMENTE TEXTO E VALOR)
		    // ========================================
		    RenderTarget.DrawText("ATR RATIO", _tfSmall,
		        new RectangleF(px + PAD, y, 70, MD_ROW_H), _bOrange);
		
		    string atrText = _atrSuavizado.ToString("F2");
		    DXBrush atrColor = _atrSuavizado > 1.5 ? _bGreen : 
		                       _atrSuavizado < 0.5 ? _bRed : _bGray;
		    
		    RenderTarget.DrawText(atrText, _tfBold,
		        new RectangleF(px + 80, y, panW - 90, MD_ROW_H), atrColor);
		
		    y += MD_ROW_H + 2;
		
		    // ========================================
		    // ESTADO DO MERCADO
		    // ========================================
		    RenderTarget.DrawText("ESTADO", _tfSmall,
		        new RectangleF(px + PAD, y, 70, MD_ROW_H), _bOrange);
		
		    DXBrush stateColor = _marketState.Contains("EXPLOSAO") ? (_marketState.Contains("COMPRA") ? _bGreen : _bRed)
		                       : _marketState.Contains("EXAUSTAO") ? (_marketState.Contains("ALTA") ? _bOrange : _bRedDim)
		                       : _marketState.Contains("COMPRESSAO") ? _bGray
		                       : _bOrange;
		
		    string estadoDisplay = _marketState.Replace("_", " ");
		    RenderTarget.DrawText(estadoDisplay, _tfBold,
		        new RectangleF(px + 80, y, panW - 90, MD_ROW_H), stateColor);
		}

        // ================================================================
        // TAPE & SALES PANEL RENDER
        // ================================================================
        private void DrawTapeSalesPanel(float px, float py, float panW)
        {
            float tsPanH = PAD + 18 + 4 + TS_MAX_ROWS * TS_ROW_H + PAD + 4; // ✅ +4 para padding

            RenderTarget.FillRectangle(new RectangleF(px, py, panW, tsPanH), _bTsBg);
            RenderTarget.DrawRectangle(new RectangleF(px, py, panW, tsPanH), _bTsBorder, 0.8f);

            string title = string.Format("TAPE & SALES (>={0}C)", MinContractFilter);
            RenderTarget.DrawText(title, _tfTitle,
                new RectangleF(px + PAD, py + PAD / 2f, panW - 2 * PAD, 18), _bGold);

            float y = py + PAD + 18 + 4;

            List<TradeInfo> trades;
            lock (_tradeLock)
            {
                int startIdx = Math.Max(0, recentTrades.Count - TS_MAX_ROWS);
                trades = new List<TradeInfo>();
                for (int i = recentTrades.Count - 1; i >= startIdx; i--)
                    trades.Add(recentTrades[i]);
            }

            if (trades.Count == 0)
            {
                RenderTarget.DrawText("Aguardando trades...", _tfSmall,
                    new RectangleF(px + PAD, y, panW - 2 * PAD, TS_ROW_H), _bGray);
                return;
            }

            float colX1 = px + PAD;
            float colX2 = colX1 + TS_COL_DIR;
            float colX3 = colX2 + TS_COL_VOL;
            float colX4 = colX3 + TS_COL_PRICE;

            for (int i = 0; i < trades.Count && i < TS_MAX_ROWS; i++)
            {
                var trade = trades[i];
                bool isBuy = trade.Side == "COMPRA";
                string dir = isBuy ? "Compra" : "Venda";
                string vol = trade.Volume.ToString();
                string price = trade.Price.ToString("F2");
                string time = trade.Time.ToString("HH:mm:ss");

                var color = isBuy ? _bGreen : _bRed;

                RenderTarget.DrawText(dir, _tfSmall,
                    new RectangleF(colX1, y, TS_COL_DIR, TS_ROW_H), color);

                RenderTarget.DrawText(vol, _tfSmall,
                    new RectangleF(colX2, y, TS_COL_VOL, TS_ROW_H), color);

                RenderTarget.DrawText(price, _tfSmall,
                    new RectangleF(colX3, y, TS_COL_PRICE, TS_ROW_H), color);

                RenderTarget.DrawText(time, _tfSmall,
                    new RectangleF(colX4, y, TS_COL_TIME, TS_ROW_H), color);

                y += TS_ROW_H;
            }
        }

        // ================================================================
        // DRAW ROW (painel principal)
        // ================================================================
        private void DrawRow(float px, float barW, ref float y,
                             string label, double buy, double sell, bool isFf, bool inverseColors = false)
        {
            bool bull  = buy >= sell;
            var  tfL   = isFf ? _tfBold  : _tfSmall;
            var  tfV   = isFf ? _tfBold  : _tfMed;
            var  bLbl  = isFf ? _bGold   : _bOrange;

            float xv = px + PAD + NAME_W;
            float bx = xv + VAL_W + GAP_H;
            float sellX = bx + barW + GAP_H;

            RenderTarget.DrawText(label, tfL,
                new RectangleF(px + PAD, y, NAME_W, ROW_H), bLbl);

            var leftColor  = inverseColors ? (bull ? _bRed      : _bRedDim)   : (bull ? _bGreen    : _bGreenDim);
            var rightColor = inverseColors ? (bull ? _bGreenDim : _bGreen)    : (bull ? _bRedDim   : _bRed);

            RenderTarget.DrawText(string.Format("{0:F0}%", buy), tfV,
                new RectangleF(xv, y, VAL_W, ROW_H), leftColor);

            RenderTarget.DrawText(string.Format("{0:F0}%", sell), tfV,
                new RectangleF(sellX, y, VAL_W, ROW_H), rightColor);

            if (ShowBar)
            {
                float by = y + (ROW_H - BAR_H) / 2f;
                RenderTarget.FillRectangle(new RectangleF(bx, by, barW, BAR_H), _bBarBg);
                float filled = (float)(barW * Math.Max(buy, sell) / 100.0);
                if (filled < 1) filled = 1;

                RenderTarget.FillRectangle(new RectangleF(bx, by, filled, BAR_H),
                    bull ? _bGreen : _bRed);
            }

            y += ROW_H + (ShowBar ? 2 : 0);
        }

        // ================================================================
        // BRUSHES / FONTS
        // ================================================================
        private void EnsureBrushes()
{
    if (_brushesReady) return;
    _brushesReady = true;

    var dw = Core.Globals.DirectWriteFactory;

    // CORES (BRUSHES) - Mantidas iguais
    _bBg             = new DXBrush(RenderTarget, new Color4(0.05f, 0.05f, 0.05f, 0.93f));
    _bBorder         = new DXBrush(RenderTarget, new Color4(0.22f, 0.22f, 0.22f, 1f));
    _bGold           = new DXBrush(RenderTarget, new Color4(0.85f, 0.65f, 0.10f, 1f));
    _bOrange         = new DXBrush(RenderTarget, new Color4(0.80f, 0.47f, 0.10f, 1f));
    _bGreen          = new DXBrush(RenderTarget, new Color4(0.00f, 0.80f, 0.27f, 1f));
    _bRed            = new DXBrush(RenderTarget, new Color4(0.80f, 0.13f, 0.13f, 1f));
    _bGreenDim       = new DXBrush(RenderTarget, new Color4(0.00f, 0.40f, 0.16f, 1f));
    _bRedDim         = new DXBrush(RenderTarget, new Color4(0.40f, 0.07f, 0.07f, 1f));
    _bGray           = new DXBrush(RenderTarget, new Color4(0.55f, 0.55f, 0.55f, 1f));
    _bBarBg          = new DXBrush(RenderTarget, new Color4(0.12f, 0.12f, 0.12f, 1f));
    _bFfBg           = new DXBrush(RenderTarget, new Color4(0.16f, 0.12f, 0.00f, 0.90f));
    _bStatus         = new DXBrush(RenderTarget, new Color4(0.40f, 0.40f, 0.40f, 1f));
    _bTsBg           = new DXBrush(RenderTarget, new Color4(0.05f, 0.05f, 0.05f, 0.93f));
    _bTsBorder       = new DXBrush(RenderTarget, new Color4(0.22f, 0.22f, 0.22f, 1f));
    _bMdBg           = new DXBrush(RenderTarget, new Color4(0.05f, 0.05f, 0.08f, 0.93f));
    _bMdBorder       = new DXBrush(RenderTarget, new Color4(0.22f, 0.22f, 0.30f, 1f));
    _bAnalysisBg     = new DXBrush(RenderTarget, new Color4(0.05f, 0.05f, 0.05f, 0.95f));
    _bAnalysisBorder = new DXBrush(RenderTarget, new Color4(0.30f, 0.30f, 0.30f, 1f));

    // FONTES (Apenas o tamanho aumentou em +2px, o resto é igual)
    _tfTiny      = new TextFormat(dw, "Arial", DWFontWeight.Normal, DWFontStyle.Normal, 10.5f);
	_tfSmall     = new TextFormat(dw, "Arial", DWFontWeight.Normal, DWFontStyle.Normal, 11.5f);
	_tfMed       = new TextFormat(dw, "Arial", DWFontWeight.Normal, DWFontStyle.Normal, 12.5f);
	_tfBold      = new TextFormat(dw, "Arial", DWFontWeight.Bold,   DWFontStyle.Normal, 12.5f);
	_tfTitle     = new TextFormat(dw, "Arial", DWFontWeight.Bold,   DWFontStyle.Normal, 13.0f);
	_tfTinyRight = new TextFormat(dw, "Arial", DWFontWeight.Normal, DWFontStyle.Normal, 10.5f);
	_tfHuge      = new TextFormat(dw, "Arial", DWFontWeight.Bold,   DWFontStyle.Normal, 24.0f); 

    // ALINHAMENTOS
	_tfMed.TextAlignment       = DWTextAlignment.Center;
	_tfBold.TextAlignment      = DWTextAlignment.Center;
	_tfTinyRight.TextAlignment = DWTextAlignment.Trailing;
}

        private void DisposeResources()
{
    IDisposable[] res = {
        _bBg, _bBorder, _bGold, _bOrange,
        _bGreen, _bRed, _bGreenDim, _bRedDim,
        _bGray, _bBarBg, _bFfBg, _bStatus,
        _bTsBg, _bTsBorder, _bMdBg, _bMdBorder, _bAnalysisBg, _bAnalysisBorder,
        _tfTiny, _tfSmall, _tfMed, _tfBold, _tfTitle, _tfTinyRight, _tfHuge // <-- Adicione aqui
    };
    foreach (var r in res) if (r != null) r.Dispose();
    _brushesReady = false;
}

        public override void OnRenderTargetChanged() => DisposeResources();

    }
}

#region NinjaScript generated code. Neither change nor remove.

namespace NinjaTrader.NinjaScript.Indicators
{
	public partial class Indicator : NinjaTrader.Gui.NinjaScript.IndicatorRenderBase
	{
		private VMnqForce[] cacheVMnqForce;
		public VMnqForce VMnqForce(string iDAssinatura, bool simpleMode, bool showBar, int panelCorner, int offsetX, int offsetY, int pollIntervalSec, bool enableAlert, double alertThreshold, int alertRearmSec, bool showTapeSales, int minContractFilter, bool enableCombinedAlert, int tsAlertRearmSec, bool showMarketDynamics, bool enableAccelerationAlert, double accelerationThreshold, int accelerationAlertRearmSec, string gammaReferenceSymbol, int gammaUpdateIntervalMinutes, bool showGammaPrevLevels, bool showGammaWall, bool showGammaHVL, bool showGammaPut, bool showGammaCall, bool showGammaMinMax, bool showGammaGEX, bool showGammaBL)
		{
			return VMnqForce(Input, iDAssinatura, simpleMode, showBar, panelCorner, offsetX, offsetY, pollIntervalSec, enableAlert, alertThreshold, alertRearmSec, showTapeSales, minContractFilter, enableCombinedAlert, tsAlertRearmSec, showMarketDynamics, enableAccelerationAlert, accelerationThreshold, accelerationAlertRearmSec, gammaReferenceSymbol, gammaUpdateIntervalMinutes, showGammaPrevLevels, showGammaWall, showGammaHVL, showGammaPut, showGammaCall, showGammaMinMax, showGammaGEX, showGammaBL);
		}

		public VMnqForce VMnqForce(ISeries<double> input, string iDAssinatura, bool simpleMode, bool showBar, int panelCorner, int offsetX, int offsetY, int pollIntervalSec, bool enableAlert, double alertThreshold, int alertRearmSec, bool showTapeSales, int minContractFilter, bool enableCombinedAlert, int tsAlertRearmSec, bool showMarketDynamics, bool enableAccelerationAlert, double accelerationThreshold, int accelerationAlertRearmSec, string gammaReferenceSymbol, int gammaUpdateIntervalMinutes, bool showGammaPrevLevels, bool showGammaWall, bool showGammaHVL, bool showGammaPut, bool showGammaCall, bool showGammaMinMax, bool showGammaGEX, bool showGammaBL)
		{
			if (cacheVMnqForce != null)
				for (int idx = 0; idx < cacheVMnqForce.Length; idx++)
					if (cacheVMnqForce[idx] != null && cacheVMnqForce[idx].IDAssinatura == iDAssinatura && cacheVMnqForce[idx].SimpleMode == simpleMode && cacheVMnqForce[idx].ShowBar == showBar && cacheVMnqForce[idx].PanelCorner == panelCorner && cacheVMnqForce[idx].OffsetX == offsetX && cacheVMnqForce[idx].OffsetY == offsetY && cacheVMnqForce[idx].PollIntervalSec == pollIntervalSec && cacheVMnqForce[idx].EnableAlert == enableAlert && cacheVMnqForce[idx].AlertThreshold == alertThreshold && cacheVMnqForce[idx].AlertRearmSec == alertRearmSec && cacheVMnqForce[idx].ShowTapeSales == showTapeSales && cacheVMnqForce[idx].MinContractFilter == minContractFilter && cacheVMnqForce[idx].EnableCombinedAlert == enableCombinedAlert && cacheVMnqForce[idx].TsAlertRearmSec == tsAlertRearmSec && cacheVMnqForce[idx].ShowMarketDynamics == showMarketDynamics && cacheVMnqForce[idx].EnableAccelerationAlert == enableAccelerationAlert && cacheVMnqForce[idx].AccelerationThreshold == accelerationThreshold && cacheVMnqForce[idx].AccelerationAlertRearmSec == accelerationAlertRearmSec && cacheVMnqForce[idx].GammaReferenceSymbol == gammaReferenceSymbol && cacheVMnqForce[idx].GammaUpdateIntervalMinutes == gammaUpdateIntervalMinutes && cacheVMnqForce[idx].ShowGammaPrevLevels == showGammaPrevLevels && cacheVMnqForce[idx].ShowGammaWall == showGammaWall && cacheVMnqForce[idx].ShowGammaHVL == showGammaHVL && cacheVMnqForce[idx].ShowGammaPut == showGammaPut && cacheVMnqForce[idx].ShowGammaCall == showGammaCall && cacheVMnqForce[idx].ShowGammaMinMax == showGammaMinMax && cacheVMnqForce[idx].ShowGammaGEX == showGammaGEX && cacheVMnqForce[idx].ShowGammaBL == showGammaBL && cacheVMnqForce[idx].EqualsInput(input))
						return cacheVMnqForce[idx];
			return CacheIndicator<VMnqForce>(new VMnqForce(){ IDAssinatura = iDAssinatura, SimpleMode = simpleMode, ShowBar = showBar, PanelCorner = panelCorner, OffsetX = offsetX, OffsetY = offsetY, PollIntervalSec = pollIntervalSec, EnableAlert = enableAlert, AlertThreshold = alertThreshold, AlertRearmSec = alertRearmSec, ShowTapeSales = showTapeSales, MinContractFilter = minContractFilter, EnableCombinedAlert = enableCombinedAlert, TsAlertRearmSec = tsAlertRearmSec, ShowMarketDynamics = showMarketDynamics, EnableAccelerationAlert = enableAccelerationAlert, AccelerationThreshold = accelerationThreshold, AccelerationAlertRearmSec = accelerationAlertRearmSec, GammaReferenceSymbol = gammaReferenceSymbol, GammaUpdateIntervalMinutes = gammaUpdateIntervalMinutes, ShowGammaPrevLevels = showGammaPrevLevels, ShowGammaWall = showGammaWall, ShowGammaHVL = showGammaHVL, ShowGammaPut = showGammaPut, ShowGammaCall = showGammaCall, ShowGammaMinMax = showGammaMinMax, ShowGammaGEX = showGammaGEX, ShowGammaBL = showGammaBL }, input, ref cacheVMnqForce);
		}
	}
}

namespace NinjaTrader.NinjaScript.MarketAnalyzerColumns
{
	public partial class MarketAnalyzerColumn : MarketAnalyzerColumnBase
	{
		public Indicators.VMnqForce VMnqForce(string iDAssinatura, bool simpleMode, bool showBar, int panelCorner, int offsetX, int offsetY, int pollIntervalSec, bool enableAlert, double alertThreshold, int alertRearmSec, bool showTapeSales, int minContractFilter, bool enableCombinedAlert, int tsAlertRearmSec, bool showMarketDynamics, bool enableAccelerationAlert, double accelerationThreshold, int accelerationAlertRearmSec, string gammaReferenceSymbol, int gammaUpdateIntervalMinutes, bool showGammaPrevLevels, bool showGammaWall, bool showGammaHVL, bool showGammaPut, bool showGammaCall, bool showGammaMinMax, bool showGammaGEX, bool showGammaBL)
		{
			return indicator.VMnqForce(Input, iDAssinatura, simpleMode, showBar, panelCorner, offsetX, offsetY, pollIntervalSec, enableAlert, alertThreshold, alertRearmSec, showTapeSales, minContractFilter, enableCombinedAlert, tsAlertRearmSec, showMarketDynamics, enableAccelerationAlert, accelerationThreshold, accelerationAlertRearmSec, gammaReferenceSymbol, gammaUpdateIntervalMinutes, showGammaPrevLevels, showGammaWall, showGammaHVL, showGammaPut, showGammaCall, showGammaMinMax, showGammaGEX, showGammaBL);
		}

		public Indicators.VMnqForce VMnqForce(ISeries<double> input , string iDAssinatura, bool simpleMode, bool showBar, int panelCorner, int offsetX, int offsetY, int pollIntervalSec, bool enableAlert, double alertThreshold, int alertRearmSec, bool showTapeSales, int minContractFilter, bool enableCombinedAlert, int tsAlertRearmSec, bool showMarketDynamics, bool enableAccelerationAlert, double accelerationThreshold, int accelerationAlertRearmSec, string gammaReferenceSymbol, int gammaUpdateIntervalMinutes, bool showGammaPrevLevels, bool showGammaWall, bool showGammaHVL, bool showGammaPut, bool showGammaCall, bool showGammaMinMax, bool showGammaGEX, bool showGammaBL)
		{
			return indicator.VMnqForce(input, iDAssinatura, simpleMode, showBar, panelCorner, offsetX, offsetY, pollIntervalSec, enableAlert, alertThreshold, alertRearmSec, showTapeSales, minContractFilter, enableCombinedAlert, tsAlertRearmSec, showMarketDynamics, enableAccelerationAlert, accelerationThreshold, accelerationAlertRearmSec, gammaReferenceSymbol, gammaUpdateIntervalMinutes, showGammaPrevLevels, showGammaWall, showGammaHVL, showGammaPut, showGammaCall, showGammaMinMax, showGammaGEX, showGammaBL);
		}
	}
}

namespace NinjaTrader.NinjaScript.Strategies
{
	public partial class Strategy : NinjaTrader.Gui.NinjaScript.StrategyRenderBase
	{
		public Indicators.VMnqForce VMnqForce(string iDAssinatura, bool simpleMode, bool showBar, int panelCorner, int offsetX, int offsetY, int pollIntervalSec, bool enableAlert, double alertThreshold, int alertRearmSec, bool showTapeSales, int minContractFilter, bool enableCombinedAlert, int tsAlertRearmSec, bool showMarketDynamics, bool enableAccelerationAlert, double accelerationThreshold, int accelerationAlertRearmSec, string gammaReferenceSymbol, int gammaUpdateIntervalMinutes, bool showGammaPrevLevels, bool showGammaWall, bool showGammaHVL, bool showGammaPut, bool showGammaCall, bool showGammaMinMax, bool showGammaGEX, bool showGammaBL)
		{
			return indicator.VMnqForce(Input, iDAssinatura, simpleMode, showBar, panelCorner, offsetX, offsetY, pollIntervalSec, enableAlert, alertThreshold, alertRearmSec, showTapeSales, minContractFilter, enableCombinedAlert, tsAlertRearmSec, showMarketDynamics, enableAccelerationAlert, accelerationThreshold, accelerationAlertRearmSec, gammaReferenceSymbol, gammaUpdateIntervalMinutes, showGammaPrevLevels, showGammaWall, showGammaHVL, showGammaPut, showGammaCall, showGammaMinMax, showGammaGEX, showGammaBL);
		}

		public Indicators.VMnqForce VMnqForce(ISeries<double> input , string iDAssinatura, bool simpleMode, bool showBar, int panelCorner, int offsetX, int offsetY, int pollIntervalSec, bool enableAlert, double alertThreshold, int alertRearmSec, bool showTapeSales, int minContractFilter, bool enableCombinedAlert, int tsAlertRearmSec, bool showMarketDynamics, bool enableAccelerationAlert, double accelerationThreshold, int accelerationAlertRearmSec, string gammaReferenceSymbol, int gammaUpdateIntervalMinutes, bool showGammaPrevLevels, bool showGammaWall, bool showGammaHVL, bool showGammaPut, bool showGammaCall, bool showGammaMinMax, bool showGammaGEX, bool showGammaBL)
		{
			return indicator.VMnqForce(input, iDAssinatura, simpleMode, showBar, panelCorner, offsetX, offsetY, pollIntervalSec, enableAlert, alertThreshold, alertRearmSec, showTapeSales, minContractFilter, enableCombinedAlert, tsAlertRearmSec, showMarketDynamics, enableAccelerationAlert, accelerationThreshold, accelerationAlertRearmSec, gammaReferenceSymbol, gammaUpdateIntervalMinutes, showGammaPrevLevels, showGammaWall, showGammaHVL, showGammaPut, showGammaCall, showGammaMinMax, showGammaGEX, showGammaBL);
		}
	}
}

#endregion
