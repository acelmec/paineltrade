// ============================================================
//  GammaPainelHttpCandles v1.1 — Debug + Otimizado
//  Painel Original + Histórico de Candles 1min (OHLCV)
// ============================================================
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.Gui.Chart;
using NinjaTrader.NinjaScript;
using System.ComponentModel.DataAnnotations;

namespace NinjaTrader.NinjaScript.Indicators
{
    public class GammaPainelHttpCandles : Indicator
    {
        // Constantes internas para os modos
        private const int MODE_SUPABASE_ONLY = 0;
        private const int MODE_LOCAL_ONLY = 1;
        private const int MODE_BOTH = 2;

        // ================================================================
        //  CONFIGURAÇÕES DE SAÍDA (PAINEL ORIGINAL)
        // ================================================================
        private string outputPath = @"C:\NinjaPanel\data.json";
        private int jsonUpdateIntervalMs = 1000;
        private int largeTradeThreshold = 100;

        // ================================================================
        //  CONFIGURAÇÕES DE CANDLES (NOVO)
        // ================================================================
        private int candleUpdateIntervalMs = 250;
        private int daysToLoad = 3;
        private bool isTimeframeValid = true;
        
        // Controle de Backfill e Realtime
        private List<string> historicalCandlesJson = new List<string>();
        private List<string> realtimeClosedCandles = new List<string>();
        private bool historicalSent = false;

        // Safe variables para o candle atual em formação
        private double safeCurrentOpen = 0, safeCurrentHigh = 0, safeCurrentLow = 0, safeCurrentClose = 0;
        private long safeCurrentVol = 0;
        private DateTime safeCurrentTime = DateTime.MinValue;
		private DateTime lastSentTime = DateTime.MinValue; // ✅ NOVA VARIÁVEL

        // Variáveis para controle de otimização de envio
        private double lastSentClose = 0;
        private long lastSentVol = 0;

        // Supabase - CREDENCIAIS
        private readonly string supabaseUrl = "https://db.vemviraramesa.com.br";
        private readonly string supabaseApiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY";
        private string instanceId = "painel_principal";
        
        // Modos de saída
        private int dataOutputMode = MODE_LOCAL_ONLY;

        // ================================================================
        //  THREADS E CONTROLE
        // ================================================================
        private Thread writeThread;
        private Thread candleThread; // Nova thread exclusiva para os candles
        private volatile bool isRunning = false;
        private HttpClient httpClient;



        // ================================================================
        //  DADOS DE MERCADO (SAFE VARIABLES - PAINEL ORIGINAL)
        // ================================================================
        private double safePrice = 0;
        private long safeBuyVol = 0, safeSellVol = 0;
        private long safeBuyPrints = 0, safeSellPrints = 0;
        private double safePrintRate = 0;
        private double safeZScore = 0, safeAtrRatio = 0;
        private string safeEstado = "NORMAL";
        private string safeSymbol = "";
		private double safeDistSuporte = 0, safeDistResistencia = 0;

        private List<TradeInfo> recentTrades = new List<TradeInfo>();
        private int largeTradeCount = 0;
        private double lastLargeTradePrice = 0;
        private string lastLargeTradeSide = "";

        // ================================================================
        //  INDICADORES INTERNOS (FÍSICA - PAINEL ORIGINAL)
        // ================================================================
        private Series<double> rocSeries;
        private SMA smaRoc;
        private StdDev stdDevRoc;
        private ATR atrInd;
        private int periodoVelocidade = 5;
        private int periodoHistorico = 20;

        private DateTime lastPrintTime = DateTime.Now;
        private int printCountWindow = 0;

        // ================================================================
        //  PROPRIEDADES (UI)
        // ================================================================
        [NinjaScriptProperty]
        [Display(Name = "Large Trade Threshold", Order = 0, GroupName = "1. Geral")]
        public int LargeTradeThreshold
        {
            get { return largeTradeThreshold; }
            set { largeTradeThreshold = Math.Max(1, value); }
        }

        [NinjaScriptProperty]
        [Display(Name = "Update Interval (ms)", Order = 1, GroupName = "1. Geral")]
        public int JsonUpdateIntervalMs
        {
            get { return jsonUpdateIntervalMs; }
            set { jsonUpdateIntervalMs = Math.Max(100, Math.Min(60000, value)); }
        }

        [NinjaScriptProperty]
        [Display(Name = "Data Output Mode (0=Supabase, 1=Local, 2=Both)", Order = 2, GroupName = "2. Dados de Mercado")]
        [Range(0, 2)]
        public int DataOutputMode
        {
            get { return dataOutputMode; }
            set { dataOutputMode = Math.Max(0, Math.Min(2, value)); }
        }

        [NinjaScriptProperty]
        [Display(Name = "Local JSON Path", Order = 3, GroupName = "2. Dados de Mercado")]
        public string OutputPath
        {
            get { return outputPath; }
            set { outputPath = value; }
        }



        // --- NOVAS PROPRIEDADES PARA CANDLES ---
        [NinjaScriptProperty]
        [Display(Name = "Candle Update Interval (ms)", Order = 0, GroupName = "4. Candles 1min")]
        [Range(100, 1000)]
        public int CandleUpdateIntervalMs
        {
            get { return candleUpdateIntervalMs; }
            set { candleUpdateIntervalMs = Math.Max(100, Math.Min(1000, value)); }
        }

        [NinjaScriptProperty]
        [Display(Name = "Days to Load (History)", Order = 1, GroupName = "4. Candles 1min")]
        [Range(1, 365)]
        public int DaysToLoad
        {
            get { return daysToLoad; }
            set { daysToLoad = Math.Max(1, Math.Min(365, value)); }
        }

        [NinjaScriptProperty]
        [Display(Name = "Instance ID", Order = 2, GroupName = "4. Candles 1min")]
        public string InstanceId
        {
            get { return instanceId; }
            set { instanceId = value; }
        }

        // ================================================================
        //  STATE
        // ================================================================
        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = "GammaPainelHttpCandles v1.1 — Painel + Histórico 1min (Debug)";
                Name = "GammaPainelHttpCandles";
                Calculate = Calculate.OnEachTick;
                IsOverlay = true;
                DisplayInDataBox = false;
                IsChartOnly = false;

                largeTradeThreshold = 100;
                outputPath = @"C:\NinjaPanel\data.json";
                jsonUpdateIntervalMs = 1000;
                dataOutputMode = MODE_LOCAL_ONLY;
                instanceId = "nt8_main";
                candleUpdateIntervalMs = 250;
                daysToLoad = 90;
            }
            else if (State == State.Configure)
            {
                // ✅ RIGOROSA VALIDAÇÃO DO TIMEFRAME (APENAS 1 MINUTO)
                if (BarsPeriod.BarsPeriodType == BarsPeriodType.Minute && BarsPeriod.Value == 1)
                {
                    isTimeframeValid = true;
                    Print("[CONFIG] ✅ Timeframe validado com sucesso: 1 Minuto. Transmissão de candles ATIVADA.");
                }
                else
                {
                    isTimeframeValid = false;
                    Print($"[CONFIG] ❌ BLOQUEIO CRÍTICO: O gráfico está em {BarsPeriod.Value} {BarsPeriod.BarsPeriodType}. O indicador EXIGE 1 Minuto. Envio de candles TOTALMENTE DESATIVADO.");
                }
            }
            else if (State == State.DataLoaded)
            {
                EnsureDirectories();
                safeSymbol = Instrument.FullName;
                Print($"[SYMBOL] Ativo: {safeSymbol}");
                Print($"[CONFIG] Timeframe Válido (1min): {isTimeframeValid}");

                rocSeries = new Series<double>(this);
                smaRoc = SMA(rocSeries, periodoHistorico);
                stdDevRoc = StdDev(rocSeries, periodoHistorico);
                atrInd = ATR(14);

                if (dataOutputMode != MODE_LOCAL_ONLY || isTimeframeValid)
                {
                    httpClient = new HttpClient();
                    httpClient.DefaultRequestHeaders.Add("apikey", supabaseApiKey);
                    httpClient.DefaultRequestHeaders.Add("Authorization", "Bearer " + supabaseApiKey);
                    httpClient.DefaultRequestHeaders.Add("Prefer", "resolution=merge-duplicates");
                    httpClient.Timeout = TimeSpan.FromSeconds(15);
                    Print("[HTTP] HttpClient configurado para Supabase");
                }

                StartWriteThread();
                if (isTimeframeValid) StartCandleThread();
                else Print("⚠️ [CANDLE-THREAD] Thread de candles NÃO iniciada pois o gráfico NÃO é de 1 minuto.");
                
                Print(">>> GammaPainelHttpCandles v1.1 INICIADO");
            }
            else if (State == State.Realtime)
            {
                // ✅ LOG DE DIAGNÓSTICO DO BACKFILL
                Print($"[STATE] 🟢 Entrou em Realtime! Candles históricos coletados na memória: {historicalCandlesJson.Count}");
				
				// ✅ NOVO LOG: Mostra quantos dias o gráfico efetivamente carregou
                if (CurrentBar > 0)
                {
                    DateTime firstBarTime = Time[CurrentBar - 1];
                    DateTime lastBarTime = Time[0];
                    Print($"[STATE] 📅 Intervalo de dados carregados no gráfico: {firstBarTime:yyyy-MM-dd} até {lastBarTime:yyyy-MM-dd}");
                }
                

            }
            else if (State == State.Terminated)
            {
                isRunning = false;
                if (httpClient != null) { httpClient.Dispose(); httpClient = null; }
            }
        }

        // ================================================================
        //  ONMARKETDATA (PAINEL ORIGINAL)
        // ================================================================
        protected override void OnMarketData(MarketDataEventArgs e)
        {
            if (e.MarketDataType == MarketDataType.Last)
            {
                long vol = (long)e.Volume;
                if (vol > 0)
                {
                    printCountWindow++;
                    if (e.Price >= e.Ask) { safeBuyVol += vol; safeBuyPrints++; }
                    else if (e.Price <= e.Bid) { safeSellVol += vol; safeSellPrints++; }
                    else { safeBuyVol += vol / 2; safeSellVol += vol / 2; }

                    if (vol >= largeTradeThreshold)
                    {
                        largeTradeCount++;
                        lastLargeTradePrice = e.Price;
                        lastLargeTradeSide = e.Price >= e.Ask ? "COMPRA" : "VENDA";
                        recentTrades.Add(new TradeInfo { Time = DateTime.Now, Price = e.Price, Volume = vol, Side = lastLargeTradeSide });
                        if (recentTrades.Count > 50) recentTrades.RemoveAt(0);
                    }
                    safePrintRate = CalculatePrintRate();
                }
            }
        }

        private double CalculatePrintRate()
        {
            var now = DateTime.Now;
            double elapsed = (now - lastPrintTime).TotalSeconds;
            if (elapsed >= 1.0)
            {
                safePrintRate = (double)printCountWindow / elapsed / 10;
                printCountWindow = 0;
                lastPrintTime = now;
            }
            return safePrintRate;
        }

        // ================================================================
        //  ONBARUPDATE (FÍSICA + CAPTURA DE CANDLES)
        // ================================================================
        protected override void OnBarUpdate()
        {
            if (BarsInProgress != 0) return;
            if (CurrentBar < 1) return;

            safePrice = Close[0];

            // --- RIGOROSA VALIDAÇÃO E PROTEÇÃO DE TIMEFRAME (APENAS 1 MINUTO) ---
            if (BarsPeriod.BarsPeriodType != BarsPeriodType.Minute || BarsPeriod.Value != 1)
            {
                isTimeframeValid = false;
                NinjaTrader.NinjaScript.DrawingTools.Draw.TextFixed(this, "TF_WARNING", "⚠️ ATENÇÃO: O GRÁFICO DEVE SER DE 1 MINUTO! TRANSMISSÃO DE CANDLES BLOQUEADA.", NinjaTrader.NinjaScript.DrawingTools.TextPosition.TopRight);
            }
            else
            {
                isTimeframeValid = true;
            }

            // --- LÓGICA DE CANDLES 1MIN ---
            if (isTimeframeValid)
            {
                // Atualiza variáveis seguras do candle em formação (para a Thread ler)
                safeCurrentOpen = Open[0];
                safeCurrentHigh = High[0];
                safeCurrentLow = Low[0];
                safeCurrentClose = Close[0];
                safeCurrentVol = (long)Volume[0]; 
                safeCurrentTime = Time[0]; 

                if (State == State.Historical)
                {
                    // Coleta histórico respeitando a quantidade de dias configurada em DaysToLoad
                    DateTime cutoffDate = DateTime.Today.AddDays(-daysToLoad);
                    if (Time[0] >= cutoffDate)
                    {
                        string json = BuildCandleJson(Time[0], Open[0], High[0], Low[0], Close[0], (long)Volume[0]);
                        lock (historicalCandlesJson) 
                        { 
                            historicalCandlesJson.Add(json); 
                            if (historicalCandlesJson.Count % 500 == 0)
                                Print($"[HISTORICO] 📊 Coletados {historicalCandlesJson.Count} candles históricos na memória...");
                        }
                    }
                }
                else if (State == State.Realtime)
                {
                    if (IsFirstTickOfBar && CurrentBar > 0)
                    {
                        string json = BuildCandleJson(Time[1], Open[1], High[1], Low[1], Close[1], (long)Volume[1]);
                        lock (realtimeClosedCandles) { realtimeClosedCandles.Add(json); }
                    }
                }
            }

            // --- LÓGICA DO PAINEL ORIGINAL (FÍSICA) ---
            if (Bars.IsFirstBarOfSession)
            {
                safeBuyVol = 0; safeSellVol = 0; safeBuyPrints = 0; safeSellPrints = 0;
                largeTradeCount = 0; recentTrades.Clear();
            }

            if (CurrentBar >= periodoHistorico)
            {
                double velocidadeBruta = Close[0] - Close[periodoVelocidade];
                rocSeries[0] = velocidadeBruta;
                safeZScore = stdDevRoc[0] > 0 ? (velocidadeBruta - smaRoc[0]) / stdDevRoc[0] : 0;
                safeAtrRatio = atrInd[0] > 0 ? (High[0] - Low[0]) / atrInd[0] : 0;

                if (Math.Abs(safeZScore) > 2.0 && safeAtrRatio > 1.5) safeEstado = safeZScore > 0 ? "EXPLOSAO_COMPRA" : "EXPLOSAO_VENDA";
                else if (Math.Abs(safeZScore) > 2.0 && safeAtrRatio < 1.0) safeEstado = safeZScore > 0 ? "EXAUSTAO_ALTA" : "EXAUSTAO_BAIXA";
                else if (Math.Abs(safeZScore) < 0.5) safeEstado = "COMPRESSAO";
                else safeEstado = "NORMAL";
            }
        }

		        private void SendHistoricalBatch()
        {
            historicalSent = true;
            List<string> batch;
            lock (historicalCandlesJson)
            {
                if (historicalCandlesJson.Count == 0) 
                {
                    Print("[CANDLE-THREAD] ⚠️ Lista histórica VAZIA. Ajuste o 'Data Series' do gráfico para carregar mais dias.");
                    return;
                }
                batch = new List<string>(historicalCandlesJson);
                historicalCandlesJson.Clear();
            }

            int batchSize = 500;
            int totalBatches = (int)Math.Ceiling((double)batch.Count / batchSize);
            Print($"[CANDLE-THREAD] 📚 Enviando {batch.Count} candles históricos em {totalBatches} lote(s) de até {batchSize}...");
            
            for (int i = 0; i < batch.Count; i += batchSize)
            {
                int count = Math.Min(batchSize, batch.Count - i);
                string payload = "[" + string.Join(",", batch.GetRange(i, count)) + "]";
                int currentBatchNum = (i / batchSize) + 1;
                
                Print($"[CANDLE-THREAD] 📤 Lote {currentBatchNum}/{totalBatches}: Enviando {count} candles...");
                
                try 
                {
                    SendCandlesToSupabase(payload);
                }
                catch (Exception ex) 
                {
                    Print($"[CANDLE-THREAD] ❌ Falha no lote {currentBatchNum}: {ex.Message}");
                }
                
                Thread.Sleep(50); // Pausa curta de 50ms entre lotes para alta performance
            }
            Print($"[CANDLE-THREAD] ✅ Rotina de histórico finalizada!");
        }
        
		// ================================================================
        //  THREAD DE CANDLES (ULTRA RÁPIDA + DIAGNÓSTICO DE TEMPO)
        // ================================================================
        private void StartCandleThread()
        {
            candleThread = new Thread(() =>
            {
                Print("[CANDLE-THREAD] 🟢 Thread Iniciada. Frequência: " + candleUpdateIntervalMs + "ms");
                int loopCount = 0;
                
                while (isRunning)
                {
                    try
                    {
                        if (!isTimeframeValid)
                        {
                            Thread.Sleep(candleUpdateIntervalMs);
                            continue;
                        }

                        loopCount++;
                        var sw = System.Diagnostics.Stopwatch.StartNew(); // ✅ Mede o tempo do loop
                        
                        // Log de batimento cardíaco a cada 40 loops (aprox 10 segundos)
                        if (loopCount % 40 == 0) 
                            Print($"[CANDLE-THREAD] 💓 Batimento cardíaco... Loop #{loopCount} | Histórico enviado: {historicalSent}");

                        // 1. Enviar Backfill Histórico (Apenas uma vez)
                        if (!historicalSent && State == State.Realtime)
                        {
                            Print("[CANDLE-THREAD] 🔄 Iniciando envio de backfill histórico...");
                            SendHistoricalBatch();
                        }

                        // 2. Enviar Candles Fechados em Realtime
                        List<string> closedBatch = null;
                        lock (realtimeClosedCandles)
                        {
                            if (realtimeClosedCandles.Count > 0)
                            {
                                closedBatch = new List<string>(realtimeClosedCandles);
                                realtimeClosedCandles.Clear();
                            }
                        }
                        
                        if (closedBatch != null)
                        {
                            string payload = "[" + string.Join(",", closedBatch) + "]";
                            // ✅ LOG: Mostra quando um candle fechado é enviado
                            Print($"[CANDLE-THREAD] 📦 Enviando {closedBatch.Count} candle(s) fechado(s)...");
                            SendCandlesToSupabase(payload);
                        }

                        // 3. Atualizar Candle em Formação
                        if (safeCurrentTime != DateTime.MinValue)
                        {
                            if (safeCurrentClose != lastSentClose || safeCurrentVol != lastSentVol || safeCurrentTime != lastSentTime)
                            {
                                string currentJson = BuildCandleJson(safeCurrentTime, safeCurrentOpen, safeCurrentHigh, safeCurrentLow, safeCurrentClose, safeCurrentVol);
                                SendCandlesToSupabase("[" + currentJson + "]");
                                
                                lastSentClose = safeCurrentClose;
                                lastSentVol = safeCurrentVol;
                                lastSentTime = safeCurrentTime;
                            }
                        }
                        
                        sw.Stop();
                        // ✅ LOG: Mostra o tempo que o loop demorou (sem contar o sleep)
                        if (loopCount % 10 == 0)
                            Print($"[CANDLE-THREAD] ⏱️ Loop #{loopCount} processado em {sw.ElapsedMilliseconds}ms");
                    }
                    catch (Exception ex)
                    {
                        Print($"[CANDLE-THREAD] ❌ Erro recuperável no loop: {ex.Message}");
                    }

                    Thread.Sleep(candleUpdateIntervalMs);
                }
                Print("[CANDLE-THREAD] 🔴 Encerrada.");
            }) { IsBackground = true };
            candleThread.Start();
        }

        private void SendCandlesToSupabase(string payload)
        {
            if (httpClient == null) return;
            
            try
            {
                var content = new StringContent(payload, Encoding.UTF8, "application/json");
                string url = $"{supabaseUrl.TrimEnd('/')}/rest/v1/painelvm_candles_1m";
                
                var request = new HttpRequestMessage(HttpMethod.Post, url);
                request.Content = content;
                request.Headers.Add("Prefer", "resolution=merge-duplicates");

                // ✅ TIMEOUT REDUZIDO: 5 segundos em vez de 15
                var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(5));
                var response = httpClient.SendAsync(request, cts.Token).GetAwaiter().GetResult();

                if (!response.IsSuccessStatusCode)
                {
                    string errorBody = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    Print($"[CANDLE-HTTP] ❌ Erro HTTP {(int)response.StatusCode}: {errorBody.Substring(0, Math.Min(200, errorBody.Length))}");
                }
            }
            catch (System.Threading.Tasks.TaskCanceledException)
            {
                // ✅ Timeout ocorreu - não trava a thread, apenas loga
                Print($"[CANDLE-HTTP] ⚠️ Timeout de 5s ao enviar para Supabase. Continuando...");
            }
            catch (Exception ex)
            {
                Print($"[CANDLE-HTTP] ❌ Exceção de rede: {ex.Message}");
            }
        }

        private string BuildCandleJson(DateTime time, double open, double high, double low, double close, long volume)
        {
            var sb = new StringBuilder();
            sb.Append("{");
            sb.Append("\"instance_id\":\"").Append(instanceId).Append("\",");
            sb.Append("\"symbol\":\"").Append(safeSymbol).Append("\",");
            // ✅ CORREÇÃO 3: Remove o 'Z' para o Supabase salvar o horário local exato
			sb.Append("\"timestamp\":\"").Append(time.ToString("yyyy-MM-ddTHH:mm:ss")).Append("\",");sb.Append("\"open\":").Append(F(open)).Append(",");
            sb.Append("\"high\":").Append(F(high)).Append(",");
            sb.Append("\"low\":").Append(F(low)).Append(",");
            sb.Append("\"close\":").Append(F(close)).Append(",");
            sb.Append("\"volume\":").Append(volume);
            sb.Append("}");
            return sb.ToString();
        }

        // ================================================================
        //  THREAD DE ESCRITA (JSON + SUPABASE - PAINEL ORIGINAL)
        // ================================================================
        private void StartWriteThread()
        {
            isRunning = true;
            writeThread = new Thread(() =>
            {
                while (isRunning)
                {
                    try
                    {
                        string json = BuildJsonFromSafeData();
                        if (dataOutputMode == MODE_LOCAL_ONLY || dataOutputMode == MODE_BOTH) WriteLocalJson(json);
                        if (dataOutputMode == MODE_SUPABASE_ONLY || dataOutputMode == MODE_BOTH) SendToSupabase(json);
                    }
                    catch { }
                    Thread.Sleep(jsonUpdateIntervalMs);
                }
            }) { IsBackground = true };
            writeThread.Start();
        }

        private void WriteLocalJson(string json)
        {
            try
            {
                string tempPath = outputPath + ".tmp";
                File.WriteAllText(tempPath, json, Encoding.UTF8);
                if (File.Exists(outputPath)) File.Delete(outputPath);
                File.Move(tempPath, outputPath);
            }
            catch { }
        }

        private void SendToSupabase(string json)
        {
            if (httpClient == null) return;
            try
            {
                string payload = "[" + json + "]";
                var content = new StringContent(payload, Encoding.UTF8, "application/json");
                string url = $"{supabaseUrl.TrimEnd('/')}/rest/v1/market_data?on_conflict=instance_id";
                var request = new HttpRequestMessage(HttpMethod.Post, url);
                request.Content = content;
                var task = httpClient.SendAsync(request);
                task.Wait();
            }
            catch { }
        }



        // ================================================================
        //  BUILD JSON (PAINEL ORIGINAL)
        // ================================================================
        private string BuildJsonFromSafeData()
        {
            long delta = safeBuyVol - safeSellVol;
            long totalVol = safeBuyVol + safeSellVol;
            double imbalancePct = totalVol > 0 ? ((double)delta / totalVol) * 100 : 0;
            double ratio = safeSellVol > 0 ? (double)safeBuyVol / safeSellVol : 1.0;
            string imbalanceDir = "NEUTRO";
            if (imbalancePct > 2) imbalanceDir = "COMPRADOR";
            else if (imbalancePct < -2) imbalanceDir = "VENDEDOR";
            else if (imbalancePct > 0.5) imbalanceDir = "LEVE_COMPRA";
            else if (imbalancePct < -0.5) imbalanceDir = "LEVE_VENDA";
            double deltaPct = totalVol > 0 ? (double)safeBuyVol / totalVol * 100 : 50.0;

            var sb = new StringBuilder();
            sb.Append("{");
            sb.Append("\"instance_id\":\"").Append(instanceId).Append("\",");
            sb.Append("\"symbol\":\"").Append(safeSymbol).Append("\",");
            sb.Append("\"ts\":\"").Append(DateTime.Now.ToString("HH:mm:ss")).Append("\",");
            sb.Append("\"price\":").Append(F(safePrice)).Append(",");
            sb.Append("\"buy_volume\":").Append(safeBuyVol).Append(",");
            sb.Append("\"sell_volume\":").Append(safeSellVol).Append(",");
            sb.Append("\"total_volume\":").Append(totalVol).Append(",");
            sb.Append("\"delta\":").Append(delta).Append(",");
            sb.Append("\"delta_pct\":").Append(F(deltaPct)).Append(",");
            sb.Append("\"ratio\":").Append(F(ratio)).Append(",");
            sb.Append("\"imbalance_pct\":").Append(F(imbalancePct)).Append(",");
            sb.Append("\"imbalance_dir\":\"").Append(imbalanceDir).Append("\",");
            sb.Append("\"print_rate\":").Append(F(safePrintRate)).Append(",");
            sb.Append("\"buy_prints\":").Append(safeBuyPrints).Append(",");
            sb.Append("\"sell_prints\":").Append(safeSellPrints).Append(",");
            sb.Append("\"large_trade_count\":").Append(largeTradeCount).Append(",");
            sb.Append("\"last_large_trade_price\":").Append(F(lastLargeTradePrice)).Append(",");
            sb.Append("\"last_large_trade_side\":\"").Append(lastLargeTradeSide).Append("\",");
            sb.Append("\"recent_trades\":[");
            for (int i = Math.Max(0, recentTrades.Count - 10); i < recentTrades.Count; i++)
            {
                if (i > Math.Max(0, recentTrades.Count - 10)) sb.Append(",");
                sb.Append("{\"time\":\"").Append(recentTrades[i].Time.ToString("HH:mm:ss")).Append("\",\"price\":").Append(F(recentTrades[i].Price)).Append(",\"volume\":").Append(recentTrades[i].Volume).Append(",\"side\":\"").Append(recentTrades[i].Side).Append("\"}");
            }
            sb.Append("],");
            sb.Append("\"zscore\":").Append(F(safeZScore)).Append(",");
            sb.Append("\"atr_ratio\":").Append(F(safeAtrRatio)).Append(",");
            sb.Append("\"estado\":\"").Append(safeEstado).Append("\",");
            sb.Append("\"dist_suporte\":").Append(F(safeDistSuporte)).Append(",");
            sb.Append("\"dist_resistencia\":").Append(F(safeDistResistencia));
            sb.Append("}");
            return sb.ToString();
        }

        // ================================================================
        //  HELPERS
        // ================================================================
        private static string F(double v)
        {
            return (double.IsNaN(v) || double.IsInfinity(v)) ? "0.00" : v.ToString("F2", System.Globalization.CultureInfo.InvariantCulture);
        }

        private void EnsureDirectories()
        {
            try
            {
                string dir1 = Path.GetDirectoryName(outputPath);
                if (!string.IsNullOrEmpty(dir1) && !Directory.Exists(dir1)) Directory.CreateDirectory(dir1);
            }
            catch { }
        }

        private class TradeInfo
        {
            public DateTime Time { get; set; }
            public double Price { get; set; }
            public long Volume { get; set; }
            public string Side { get; set; }
        }
    }
}

#region NinjaScript generated code. Neither change nor remove.

namespace NinjaTrader.NinjaScript.Indicators
{
	public partial class Indicator : NinjaTrader.Gui.NinjaScript.IndicatorRenderBase
	{
		private GammaPainelHttpCandles[] cacheGammaPainelHttpCandles;
		public GammaPainelHttpCandles GammaPainelHttpCandles(int largeTradeThreshold, int jsonUpdateIntervalMs, int dataOutputMode, string outputPath, int candleUpdateIntervalMs, int daysToLoad, string instanceId)
		{
			return GammaPainelHttpCandles(Input, largeTradeThreshold, jsonUpdateIntervalMs, dataOutputMode, outputPath, candleUpdateIntervalMs, daysToLoad, instanceId);
		}

		public GammaPainelHttpCandles GammaPainelHttpCandles(ISeries<double> input, int largeTradeThreshold, int jsonUpdateIntervalMs, int dataOutputMode, string outputPath, int candleUpdateIntervalMs, int daysToLoad, string instanceId)
		{
			if (cacheGammaPainelHttpCandles != null)
				for (int idx = 0; idx < cacheGammaPainelHttpCandles.Length; idx++)
					if (cacheGammaPainelHttpCandles[idx] != null && cacheGammaPainelHttpCandles[idx].LargeTradeThreshold == largeTradeThreshold && cacheGammaPainelHttpCandles[idx].JsonUpdateIntervalMs == jsonUpdateIntervalMs && cacheGammaPainelHttpCandles[idx].DataOutputMode == dataOutputMode && cacheGammaPainelHttpCandles[idx].OutputPath == outputPath && cacheGammaPainelHttpCandles[idx].CandleUpdateIntervalMs == candleUpdateIntervalMs && cacheGammaPainelHttpCandles[idx].DaysToLoad == daysToLoad && cacheGammaPainelHttpCandles[idx].InstanceId == instanceId && cacheGammaPainelHttpCandles[idx].EqualsInput(input))
						return cacheGammaPainelHttpCandles[idx];
			return CacheIndicator<GammaPainelHttpCandles>(new GammaPainelHttpCandles(){ LargeTradeThreshold = largeTradeThreshold, JsonUpdateIntervalMs = jsonUpdateIntervalMs, DataOutputMode = dataOutputMode, OutputPath = outputPath, CandleUpdateIntervalMs = candleUpdateIntervalMs, DaysToLoad = daysToLoad, InstanceId = instanceId }, input, ref cacheGammaPainelHttpCandles);
		}
	}
}

namespace NinjaTrader.NinjaScript.MarketAnalyzerColumns
{
	public partial class MarketAnalyzerColumn : MarketAnalyzerColumnBase
	{
		public Indicators.GammaPainelHttpCandles GammaPainelHttpCandles(int largeTradeThreshold, int jsonUpdateIntervalMs, int dataOutputMode, string outputPath, int candleUpdateIntervalMs, int daysToLoad, string instanceId)
		{
			return indicator.GammaPainelHttpCandles(Input, largeTradeThreshold, jsonUpdateIntervalMs, dataOutputMode, outputPath, candleUpdateIntervalMs, daysToLoad, instanceId);
		}

		public Indicators.GammaPainelHttpCandles GammaPainelHttpCandles(ISeries<double> input , int largeTradeThreshold, int jsonUpdateIntervalMs, int dataOutputMode, string outputPath, int candleUpdateIntervalMs, int daysToLoad, string instanceId)
		{
			return indicator.GammaPainelHttpCandles(input, largeTradeThreshold, jsonUpdateIntervalMs, dataOutputMode, outputPath, candleUpdateIntervalMs, daysToLoad, instanceId);
		}
	}
}

namespace NinjaTrader.NinjaScript.Strategies
{
	public partial class Strategy : NinjaTrader.Gui.NinjaScript.StrategyRenderBase
	{
		public Indicators.GammaPainelHttpCandles GammaPainelHttpCandles(int largeTradeThreshold, int jsonUpdateIntervalMs, int dataOutputMode, string outputPath, int candleUpdateIntervalMs, int daysToLoad, string instanceId)
		{
			return indicator.GammaPainelHttpCandles(Input, largeTradeThreshold, jsonUpdateIntervalMs, dataOutputMode, outputPath, candleUpdateIntervalMs, daysToLoad, instanceId);
		}

		public Indicators.GammaPainelHttpCandles GammaPainelHttpCandles(ISeries<double> input , int largeTradeThreshold, int jsonUpdateIntervalMs, int dataOutputMode, string outputPath, int candleUpdateIntervalMs, int daysToLoad, string instanceId)
		{
			return indicator.GammaPainelHttpCandles(input, largeTradeThreshold, jsonUpdateIntervalMs, dataOutputMode, outputPath, candleUpdateIntervalMs, daysToLoad, instanceId);
		}
	}
}

#endregion

