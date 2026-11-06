//  GammaSupabaseSender v2.0 — Algoritmo de Pontuação (Delta Score) para Gamma Bias
//  Envia níveis gamma + força de compra/venda para Supabase
//  Usa APENAS níveis gamma do gráfico: Call/Put, HVL, GammaWall, GEX 1-10, BL 1-10, Max/Min 1D
//  Se níveis não mudam: atualiza viés no último registro (PATCH)
//  Se níveis mudam: cria novo registro (INSERT)
//  BLOQUEIA inserção se os níveis gamma estiverem todos zerados
// ============================================================
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Net.Http;
using System.Linq;
using System.Windows;
using System.Windows.Media.Imaging;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.Gui.Chart;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.DrawingTools;
using NinjaTrader.NinjaScript.Indicators;
using System.ComponentModel.DataAnnotations;

namespace NinjaTrader.NinjaScript.Indicators
{
    public class GammaSupabaseSender : Indicator
    {
        // === PROPRIEDADES CONFIGURÁVEIS ===
        private int updateIntervalMinutes = 60;
        private string supabaseUrl = "https://db.vemviraramesa.com.br";
        private string supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY";
        private string referenceSymbol = "NQ";

        // === PROPRIEDADES PARA NOTÍCIAS ===
        private bool enableNewsSync = true;
        private int newsUpdateIntervalMinutes = 30;
        private string newsApiUrl = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

        // === PROPRIEDADES PARA GAMMA BIAS ===
        private bool enableGammaBias = true;
        private int biasUpdateIntervalSeconds = 15;



        [NinjaScriptProperty]
        [Display(Name="Intervalo de Atualização (minutos)", Description="Intervalo em minutos para verificar mudanças nos níveis gamma", Order=0, GroupName="Configurações")]
        public int UpdateIntervalMinutes 
        { 
            get { return updateIntervalMinutes; }
            set { updateIntervalMinutes = Math.Max(1, value); }
        }

        [NinjaScriptProperty]
        [Display(Name="Supabase URL", Description="URL pública do seu Supabase", Order=1, GroupName="Supabase")]
        public string SupabaseUrl 
        { 
            get { return supabaseUrl; }
            set { supabaseUrl = value; }
        }

        [NinjaScriptProperty]
        [Display(Name="Supabase Service Key", Description="Service Role Key do Supabase", Order=2, GroupName="Supabase")]
        public string SupabaseServiceKey 
        { 
            get { return supabaseServiceKey; }
            set { supabaseServiceKey = value; }
        }

        [NinjaScriptProperty]
        [Display(Name="Símbolo de Referência", Description="Ex: NQ, ES, WIN. Usado para identificar o ativo no banco", Order=3, GroupName="Configurações")]
        public string ReferenceSymbol 
        { 
            get { return referenceSymbol; }
            set { referenceSymbol = value; }
        }

        [NinjaScriptProperty]
        [Display(Name="Habilitar Sincronização de Notícias", Description="Busca e salva notícias econômicas no Supabase", Order=0, GroupName="Notícias Econômicas")]
        public bool EnableNewsSync 
        { 
            get { return enableNewsSync; }
            set { enableNewsSync = value; }
        }

        [NinjaScriptProperty]
        [Display(Name="Intervalo Notícias (minutos)", Description="Intervalo para buscar novas notícias da API", Order=1, GroupName="Notícias Econômicas")]
        public int NewsUpdateIntervalMinutes 
        { 
            get { return newsUpdateIntervalMinutes; }
            set { newsUpdateIntervalMinutes = Math.Max(5, value); }
        }

        [NinjaScriptProperty]
        [Display(Name="URL da API de Notícias", Description="Endpoint da API de notícias econômicas", Order=2, GroupName="Notícias Econômicas")]
        public string NewsApiUrl 
        { 
            get { return newsApiUrl; }
            set { newsApiUrl = value; }
        }

        [NinjaScriptProperty]
        [Display(Name="Habilitar Gamma Bias", Description="Calcula e envia força de compra/venda", Order=0, GroupName="Gamma Bias")]
        public bool EnableGammaBias 
        { 
            get { return enableGammaBias; }
            set { enableGammaBias = value; }
        }

        [NinjaScriptProperty]
        [Display(Name="Intervalo Bias (SEGUNDOS)", Description="Quantos SEGUNDOS entre cálculos de bias. Padrão: 15", Order=1, GroupName="Gamma Bias")]
        public int BiasUpdateIntervalSeconds 
        { 
            get { return biasUpdateIntervalSeconds; }
            set { biasUpdateIntervalSeconds = Math.Max(1, value); }
        }



        // === VARIÁVEIS INTERNAS ===
        private HttpClient httpClient;
        private DateTime lastCheckTime = DateTime.MinValue;
        private DateTime lastNewsCheckTime = DateTime.MinValue;
        private DateTime lastBiasCalcTime = DateTime.MinValue;
        private string lastSavedDate = "";
        private bool isRealtimeMode = false;
        private bool firstRealtimeBarProcessed = false;
        private GammaData lastSavedGammaData = new GammaData();
        private double lastSavedPrevDayHigh = 0, lastSavedPrevDayLow = 0, lastSavedPrevDayOpen = 0, lastSavedPrevDayClose = 0, lastSavedPrevDayAdjuste = 0;
        private GammaData currentGammaData = new GammaData();
        private double prevDayHigh = 0, prevDayLow = 0, prevDayOpen = 0, prevDayClose = 0, prevDayAdjuste = 0;
        private string safeSymbol = "";
        private GammaBias currentBias = new GammaBias();
        private int lastRecordId = -1;
        private bool hasLastRecordId = false;
        private HashSet<string> processedNewsIds = new HashSet<string>();

        private Dictionary<string, string> textNameToVariable = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { "Put Support", "PutSupport" },
            { "Call Resistance", "CallResistance" },
            { "Call Resistance 0DTE", "CallResistance0DTE" },
            { "Put Support 0DTE", "PutSupport0DTE" },
            { "HVL", "HVL" },
            { "HVL 0DTE", "HVL0DTE" },
            { "Gamma Wall 0DTE", "GammaWall0DTE" }
        };

        protected override void OnStateChange()
        {
            Print($">>> STATE CHANGE: {State}");

            if (State == State.SetDefaults)
            {
                Description = "GammaSupabaseSender v2.0 — Algoritmo de Pontuação (Delta Score)";
                Name = "GammaSupabaseSender";
                Calculate = Calculate.OnEachTick;
                IsOverlay = true;
                DisplayInDataBox = false;
                IsChartOnly = false;
                updateIntervalMinutes = 60;
                supabaseUrl = "https://db.vemviraramesa.com.br";
                supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY";
                referenceSymbol = "NQ";
                enableNewsSync = true;
                newsUpdateIntervalMinutes = 30;
                newsApiUrl = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
                enableGammaBias = true;
                biasUpdateIntervalSeconds = 15;
            }
            else if (State == State.Configure)
            {
                Print("[STATE] Configure: Adicionando série Diária...");
                AddDataSeries(Data.BarsPeriodType.Day, 1);
            }
            else if (State == State.DataLoaded)
            {
                safeSymbol = Instrument.FullName;

                Print("╔════════════════════════════════════════════════════════════╗");
                Print($"║ [STATE] DataLoaded: Indicador CARREGADO no ativo {safeSymbol}");
                Print($"║ [STATE] ReferenceSymbol: {referenceSymbol}");
                Print($"║ [STATE] URL Configurada: {supabaseUrl}");
                Print($"║ [STATE] Notícias: {(enableNewsSync ? "HABILITADAS" : "DESABILITADAS")}");
                Print($"║ [STATE] Gamma Bias: {(enableGammaBias ? "HABILITADO" : "DESABILITADO")}");
                Print($"║ [STATE] Bias Intervalo: {biasUpdateIntervalSeconds} SEGUNDOS");
                Print("╚════════════════════════════════════════════════════════════╝");

                httpClient = new HttpClient();
                httpClient.DefaultRequestHeaders.Add("apikey", supabaseServiceKey);
                httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {supabaseServiceKey}");
                httpClient.Timeout = TimeSpan.FromSeconds(30);
            }
            else if (State == State.Historical)
            {
                Print("[STATE] ⏳ Entrando em modo Histórico (NENHUMA requisição HTTP será feita)");
                isRealtimeMode = false;
            }
            else if (State == State.Realtime)
            {
                Print("[STATE] 🟢 Entrando em modo Tempo Real (requisições HTTP HABILITADAS)");
                isRealtimeMode = true;
                firstRealtimeBarProcessed = false;
                FetchLastRecordIdAsync();
            }
            else if (State == State.Terminated)
            {
                Print("[STATE] Indicador REMOVIDO/FINALIZADO.");
                httpClient?.Dispose();
            }
        }

        protected override void OnBarUpdate()
        {
            if (BarsInProgress != 0) return;
            if (CurrentBar < 1) return;

            UpdatePreviousDayOHLC();

            if (!isRealtimeMode) return;

            // === VERIFICAÇÃO DE GAMMA LEVELS ===
            bool shouldCheckLevels = false;

            if (!firstRealtimeBarProcessed)
            {
                Print("[CHECK] ═══════════════════════════════════════════════════════");
                Print("[CHECK] 🟢 PRIMEIRA BARRA EM TEMPO REAL - Forçando leitura inicial...");
                shouldCheckLevels = true;
                firstRealtimeBarProcessed = true;

                // Garante que os níveis sejam lidos antes do cálculo de viés
                currentGammaData = ReadGammaObjects();
                PrintCurrentGammaData();
            }
            else
            {
                TimeSpan elapsed = DateTime.Now - lastCheckTime;
                if (elapsed.TotalMinutes >= updateIntervalMinutes)
                {
                    Print("[CHECK] ═══════════════════════════════════════════════════════");
                    Print($"[CHECK] Intervalo atingido ({elapsed.TotalMinutes:F1} min desde última verificação)");
                    shouldCheckLevels = true;
                }
            }

            if (shouldCheckLevels)
            {
                lastCheckTime = DateTime.Now;
                Print($"[CHECK] Iniciando leitura de objetos às {DateTime.Now:HH:mm:ss}");

                currentGammaData = ReadGammaObjects();
                PrintCurrentGammaData();

                if (IsGammaDataEmpty(currentGammaData))
                {
                    Print("[CHECK] ⚠ AVISO: Níveis gamma lidos estão zerados ou vazios. Inserção BLOQUEADA para evitar registro inválido.");
                }
                else
                {
                    string changedFields = GetChangedFields();

                    if (!string.IsNullOrEmpty(changedFields))
                    {
                        Print($"[CHANGE] ⚠ MUDANÇA DETECTADA nos campos: {changedFields}");
                        Print("[SEND] Criando NOVO registro no Supabase...");

                        if (enableGammaBias)
                            CalculateGammaBias();

                        SendToSupabaseAsync(isNewRecord: true);
                    }
                    else
                    {
                        Print("[CHECK] ✓ Nenhum campo alterado - Nenhum envio de níveis necessário");

                        if (enableGammaBias && !hasLastRecordId)
                        {
                            Print("[BIAS] Primeiro registro do dia. Criando com viés atual.");
                            CalculateGammaBias();
                            SendToSupabaseAsync(isNewRecord: true);
                        }
                    }
                }

                Print("[CHECK] ═══════════════════════════════════════════════════════════════════");
            }

            // === CÁLCULO DE GAMMA BIAS (EM SEGUNDOS) ===
            if (enableGammaBias && !IsGammaDataEmpty(currentGammaData))
            {
                TimeSpan biasElapsed = DateTime.Now - lastBiasCalcTime;
                if (biasElapsed.TotalSeconds >= biasUpdateIntervalSeconds)
                {
                    lastBiasCalcTime = DateTime.Now;
                    CalculateGammaBias();

                    if (hasLastRecordId && lastRecordId > 0)
                    {
                        Print($"[BIAS] Níveis não mudaram. Atualizando viés no registro ID={lastRecordId}");
                        UpdateBiasOnLastRecordAsync();
                    }
                    else
                    {
                        Print("[BIAS] Sem registro anterior sincronizado. Tentando sincronizar ID...");
                        FetchLastRecordIdAsync();
                    }
                }
            }

            // === VERIFICAÇÃO DE NOTÍCIAS ===
            if (enableNewsSync)
            {
                bool shouldCheckNews = false;

                if (firstRealtimeBarProcessed && lastNewsCheckTime == DateTime.MinValue)
                {
                    Print("[NEWS] ═══════════════════════════════════════════════════════");
                    Print("[NEWS] 🟢 PRIMEIRA VERIFICAÇÃO DE NOTÍCIAS EM TEMPO REAL...");
                    shouldCheckNews = true;
                }
                else
                {
                    TimeSpan elapsedNews = DateTime.Now - lastNewsCheckTime;
                    if (elapsedNews.TotalMinutes >= newsUpdateIntervalMinutes)
                    {
                        Print("[NEWS] ═══════════════════════════════════════════════════════");
                        Print($"[NEWS] Intervalo atingido ({elapsedNews.TotalMinutes:F1} min)");
                        shouldCheckNews = true;
                    }
                }

                if (shouldCheckNews)
                {
                    lastNewsCheckTime = DateTime.Now;
                    Print("[NEWS] Buscando notícias da API...");
                    FetchAndSaveNewsAsync();
                }
            }
        }



        // ================================================================
        //  VALIDAÇÃO DE DADOS VAZIOS
        // ================================================================
        private bool IsGammaDataEmpty(GammaData data)
        {
            return data.HVL == 0 && 
                   data.HVL0DTE == 0 && 
                   data.PutSupport == 0 && 
                   data.CallResistance == 0 && 
                   data.PutSupport0DTE == 0 && 
                   data.CallResistance0DTE == 0 && 
                   data.GammaWall0DTE == 0 && 
                   data.Max1D == 0 && 
                   data.Min1D == 0 && 
                   data.BL.Count == 0 && 
                   data.GEX.Count == 0;
        }

        // ================================================================
        //  GAMMA BIAS — NOVO ALGORITMO DE PONTUAÇÃO (DELTA SCORE)
        //  Usa APENAS níveis gamma do gráfico
        // ================================================================

        private void CalculateGammaBias()
        {
            try
            {
                if (CurrentBar < 1) return;
                double currentPrice = Close[0];
                if (currentPrice <= 0) return;

                double tickSize = 0.25;
                try
                {
                    if (TickSize > 0) tickSize = TickSize;
                    else if (Instrument != null && Instrument.MasterInstrument != null && Instrument.MasterInstrument.TickSize > 0)
                        tickSize = Instrument.MasterInstrument.TickSize;
                }
                catch { tickSize = 0.25; }

                // Escala de zona proporcional ao preço do ativo
                double pointScale = (currentPrice > 10000) ? 2.5 : ((currentPrice > 3000) ? 1.5 : 1.0);
                double baseZone = tickSize * pointScale;

                double deltaScore = 0.0;

                // ============================================================
                // 1. NÍVEIS DE EXTREMO (Call/Put/GammaWall) — Zoneamento absoluto
                // ============================================================
                if (currentGammaData.CallResistance0DTE > 0 && currentPrice >= currentGammaData.CallResistance0DTE)
                {
                    deltaScore += 2.0;
                    Print($"[BIAS] CALL_RESISTANCE_0DTE atingido ({currentGammaData.CallResistance0DTE:F2}): +2.0");
                }
                else if (currentGammaData.CallResistance > 0 && currentPrice >= currentGammaData.CallResistance)
                {
                    deltaScore += 1.5;
                    Print($"[BIAS] CALL_RESISTANCE atingido ({currentGammaData.CallResistance:F2}): +1.5");
                }

                if (currentGammaData.PutSupport0DTE > 0 && currentPrice <= currentGammaData.PutSupport0DTE)
                {
                    deltaScore -= 3.0;
                    Print($"[BIAS] PUT_SUPPORT_0DTE atingido ({currentGammaData.PutSupport0DTE:F2}): -3.0");
                }
                else if (currentGammaData.GammaWall0DTE > 0 && currentPrice <= currentGammaData.GammaWall0DTE)
                {
                    deltaScore -= 2.5;
                    Print($"[BIAS] GAMMA_WALL_0DTE atingido ({currentGammaData.GammaWall0DTE:F2}): -2.5");
                }
                else if (currentGammaData.PutSupport > 0 && currentPrice <= currentGammaData.PutSupport)
                {
                    deltaScore -= 2.0;
                    Print($"[BIAS] PUT_SUPPORT atingido ({currentGammaData.PutSupport:F2}): -2.0");
                }

                // ============================================================
                // 2. HVL 0DTE — Efeito Pinning / Magnet
                // ============================================================
                if (currentGammaData.HVL0DTE > 0)
                {
                    double distHVL0 = Math.Abs(currentPrice - currentGammaData.HVL0DTE);
                    if (distHVL0 < 25 * baseZone)
                    {
                        if (currentPrice > currentGammaData.HVL0DTE)
                        {
                            deltaScore += 1.5;
                            Print($"[BIAS] HVL_0DTE pinning acima ({currentGammaData.HVL0DTE:F2}, dist {distHVL0:F2}): +1.5");
                        }
                        else
                        {
                            deltaScore -= 1.5;
                            Print($"[BIAS] HVL_0DTE pinning abaixo ({currentGammaData.HVL0DTE:F2}, dist {distHVL0:F2}): -1.5");
                        }
                    }
                    else if (distHVL0 < 50 * baseZone)
                    {
                        if (currentPrice > currentGammaData.HVL0DTE)
                        {
                            deltaScore += 0.5;
                            Print($"[BIAS] HVL_0DTE influência acima ({currentGammaData.HVL0DTE:F2}): +0.5");
                        }
                        else
                        {
                            deltaScore -= 0.5;
                            Print($"[BIAS] HVL_0DTE influência abaixo ({currentGammaData.HVL0DTE:F2}): -0.5");
                        }
                    }
                }

                // ============================================================
                // 3. HVL — Efeito Pinning / Magnet histórico
                // ============================================================
                if (currentGammaData.HVL > 0)
                {
                    double distHVL = Math.Abs(currentPrice - currentGammaData.HVL);
                    if (distHVL < 20 * baseZone)
                    {
                        if (currentPrice > currentGammaData.HVL)
                        {
                            deltaScore += 1.0;
                            Print($"[BIAS] HVL pinning acima ({currentGammaData.HVL:F2}, dist {distHVL:F2}): +1.0");
                        }
                        else
                        {
                            deltaScore -= 1.0;
                            Print($"[BIAS] HVL pinning abaixo ({currentGammaData.HVL:F2}, dist {distHVL:F2}): -1.0");
                        }
                    }
                    else if (distHVL < 40 * baseZone)
                    {
                        if (currentPrice > currentGammaData.HVL)
                        {
                            deltaScore += 0.3;
                            Print($"[BIAS] HVL influência acima ({currentGammaData.HVL:F2}): +0.3");
                        }
                        else
                        {
                            deltaScore -= 0.3;
                            Print($"[BIAS] HVL influência abaixo ({currentGammaData.HVL:F2}): -0.3");
                        }
                    }
                }

                // ============================================================
                // 4. MAX_1D / MIN_1D — Resistência/Suporte do dia anterior + Rompimento
                // ============================================================
                if (currentGammaData.Max1D > 0)
                {
                    double distMax = currentGammaData.Max1D - currentPrice;
                    if (distMax > 0 && distMax < 20 * baseZone)
                    {
                        deltaScore -= 1.0;
                        Print($"[BIAS] MAX_1D resistência próxima ({currentGammaData.Max1D:F2}, dist {distMax:F2}): -1.0");
                    }
                    else if (currentPrice > currentGammaData.Max1D)
                    {
                        deltaScore += 1.5;
                        Print($"[BIAS] MAX_1D rompido ({currentGammaData.Max1D:F2}): +1.5");
                    }
                }

                if (currentGammaData.Min1D > 0)
                {
                    double distMin = currentPrice - currentGammaData.Min1D;
                    if (distMin > 0 && distMin < 20 * baseZone)
                    {
                        deltaScore += 1.0;
                        Print($"[BIAS] MIN_1D suporte próximo ({currentGammaData.Min1D:F2}, dist {distMin:F2}): +1.0");
                    }
                    else if (currentPrice < currentGammaData.Min1D)
                    {
                        deltaScore -= 2.0;
                        Print($"[BIAS] MIN_1D rompido ({currentGammaData.Min1D:F2}): -2.0");
                    }
                }

                // ============================================================
                // 5. AJUSTE_1D — Contexto histórico
                // ============================================================
                if (prevDayAdjuste > 0)
                {
                    if (currentPrice > prevDayAdjuste)
                    {
                        deltaScore += 1.0;
                        Print($"[BIAS] Preço ({currentPrice:F2}) > Ajuste_1d ({prevDayAdjuste:F2}): +1.0");
                    }
                    else
                    {
                        deltaScore -= 1.0;
                        Print($"[BIAS] Preço ({currentPrice:F2}) < Ajuste_1d ({prevDayAdjuste:F2}): -1.0");
                    }
                }

                // ============================================================
                // 6. GEX 1 a 10 — Gamma Positivo/Negativo + Efeito Ímã Ponderado
                // ============================================================
                if (currentGammaData.GEX != null && currentGammaData.GEX.Count > 0)
                {
                    var validGEX = currentGammaData.GEX.Where(g => g > 0).ToList();
                    if (validGEX.Count > 0)
                    {
                        var sortedGEX = validGEX.OrderBy(g => g).ToList();
                        double gexPeak = sortedGEX.Last();

                        // GAMMA POSITIVO: acima do pico de concentração
                        if (currentPrice > gexPeak)
                        {
                            double distAbove = currentPrice - gexPeak;
                            double score = Math.Min(2.5, distAbove / Math.Max(1.0, 35 * baseZone));
                            deltaScore += score;
                            Print($"[BIAS] GAMMA POSITIVO (acima pico GEX {gexPeak:F2}, dist {distAbove:F2}): +{score:F2}");
                        }
                        // GAMMA NEGATIVO: abaixo do pico de concentração
                        else if (currentPrice < gexPeak)
                        {
                            double distBelow = gexPeak - currentPrice;
                            double score = Math.Min(3.5, distBelow / Math.Max(1.0, 35 * baseZone));
                            deltaScore -= score;
                            Print($"[BIAS] GAMMA NEGATIVO (abaixo pico GEX {gexPeak:F2}, dist {distBelow:F2}): -{score:F2}");
                        }

                        // Efeito Ímã de cada GEX individual (ponderado por magnitude)
                        for (int i = 0; i < sortedGEX.Count; i++)
                        {
                            double gexLevel = sortedGEX[i];
                            double dist = Math.Abs(currentPrice - gexLevel);
                            double weight = 1.0 + ((double)i / Math.Max(1, sortedGEX.Count - 1)) * 2.5;

                            if (dist < 15 * baseZone)
                            {
                                if (gexLevel > currentPrice)
                                {
                                    deltaScore -= weight * 0.6;
                                    Print($"[BIAS] GEX[{i}] call wall próxima ({gexLevel:F2}, w={weight:F1}): -{weight*0.6:F2}");
                                }
                                else
                                {
                                    deltaScore += weight * 0.6;
                                    Print($"[BIAS] GEX[{i}] put wall próxima ({gexLevel:F2}, w={weight:F1}): +{weight*0.6:F2}");
                                }
                            }
                            else if (dist < 35 * baseZone)
                            {
                                if (gexLevel > currentPrice)
                                {
                                    deltaScore -= weight * 0.3;
                                    Print($"[BIAS] GEX[{i}] call wall moderada ({gexLevel:F2}, w={weight:F1}): -{weight*0.3:F2}");
                                }
                                else
                                {
                                    deltaScore += weight * 0.3;
                                    Print($"[BIAS] GEX[{i}] put wall moderada ({gexLevel:F2}, w={weight:F1}): +{weight*0.3:F2}");
                                }
                            }
                        }
                    }
                }

                // ============================================================
                // 7. BL 1 a 10 — Break Levels / Barreiras de Transposição
                // ============================================================
                if (currentGammaData.BL != null && currentGammaData.BL.Count > 0)
                {
                    var validBL = currentGammaData.BL.Where(b => b > 0).ToList();
                    if (validBL.Count > 0)
                    {
                        var sortedBL = validBL.OrderBy(b => b).ToList();
                        for (int i = 0; i < sortedBL.Count; i++)
                        {
                            double blLevel = sortedBL[i];
                            double dist = Math.Abs(currentPrice - blLevel);
                            double weight = 1.0 + ((double)i / Math.Max(1, sortedBL.Count - 1)) * 3.5;

                            if (dist < 10 * baseZone)
                            {
                                if (blLevel > currentPrice)
                                {
                                    deltaScore -= weight * 0.7;
                                    Print($"[BIAS] BL[{i}] resistência transposição ({blLevel:F2}, w={weight:F1}): -{weight*0.7:F2}");
                                }
                                else
                                {
                                    deltaScore += weight * 0.7;
                                    Print($"[BIAS] BL[{i}] suporte transposição ({blLevel:F2}, w={weight:F1}): +{weight*0.7:F2}");
                                }
                            }
                            else if (dist < 25 * baseZone)
                            {
                                if (blLevel > currentPrice)
                                {
                                    deltaScore -= weight * 0.35;
                                    Print($"[BIAS] BL[{i}] resistência moderada ({blLevel:F2}, w={weight:F1}): -{weight*0.35:F2}");
                                }
                                else
                                {
                                    deltaScore += weight * 0.35;
                                    Print($"[BIAS] BL[{i}] suporte moderado ({blLevel:F2}, w={weight:F1}): +{weight*0.35:F2}");
                                }
                            }
                        }
                    }
                }

                // ============================================================
                // 8. CONFLUÊNCIA
                // ============================================================
                currentBias.ConfluenceType = IdentifyConfluenceType();

                // ============================================================
                // NORMALIZAÇÃO (Escala 0-100)
                // ============================================================
                double clampedDelta = Math.Max(-10.0, Math.Min(10.0, deltaScore));
                double valorVelocimetro = 50.0 + (clampedDelta * 5.0);
                valorVelocimetro = Math.Max(0.0, Math.Min(100.0, valorVelocimetro));

                Print("[BIAS] ═══════════════════════════════════════");
                Print($"[BIAS] deltaScore bruto: {deltaScore:F2}");
                Print($"[BIAS] deltaScore limitado: {clampedDelta:F2}");
                Print($"[BIAS] Velocímetro: {valorVelocimetro:F2}");
                Print("[BIAS] ═══════════════════════════════════════");

                // ============================================================
                // MAPEAMENTO PARA CAMPOS EXISTENTES
                // ============================================================
                currentBias.BuyStrength = Math.Round(valorVelocimetro, 2);
                currentBias.SellStrength = Math.Round(100.0 - valorVelocimetro, 2);
                currentBias.BiasScore = Math.Round((valorVelocimetro - 50.0) * 2.0, 2);
                currentBias.Gamma_Bias = MapVelocimetroToBias(valorVelocimetro);
                currentBias.RecommendedStrategy = MapVelocimetroToStrategy(valorVelocimetro, currentBias.ConfluenceType);

                CalculateNearestLevels(currentPrice);

                var allLevels = BuildAllLevelsList();
                currentBias.VoidGammaAbove = CheckVoidGamma(currentPrice, true, allLevels);
                currentBias.VoidGammaBelow = CheckVoidGamma(currentPrice, false, allLevels);

                currentBias.BiasTimestamp = DateTime.Now;

                Print($"[BIAS] ✓ {currentBias.Gamma_Bias} | Score: {currentBias.BiasScore} | Buy: {currentBias.BuyStrength}% | Sell: {currentBias.SellStrength}% | Strategy: {currentBias.RecommendedStrategy}");
            }
            catch (Exception ex)
            {
                Print($"[BIAS] ✗ Erro: {ex.Message}");
                Print($"[BIAS] ✗ Stack: {ex.StackTrace}");
            }
        }

        // ================================================================
        //  MÉTODOS AUXILIARES DO NOVO ALGORITMO
        // ================================================================

        private string MapVelocimetroToBias(double v)
        {
            if (v >= 90) return "STRONG_BUY";
            if (v >= 75) return "BUY";
            if (v >= 60) return "BUY";
            if (v >= 41) return "NEUTRAL";
            if (v >= 26) return "SELL";
            if (v >= 11) return "STRONG_SELL";
            return "STRONG_SELL";
        }

        private string MapVelocimetroToStrategy(double v, string confluence)
        {
            if (v >= 90) return "BOUNCE_SUORTE";
            if (v >= 75) return "BOUNCE_DO_MAGNET";
            if (v >= 60) return "BOUNCE_SUORTE";
            if (v >= 41) return confluence.Contains("C") ? "PIN_NO_CENTRO" : "AGUARDAR";
            if (v >= 26) return "FADE_RESISTENCIA";
            if (v >= 11) return "FADE_DA_PAREDE";
            return "FADE_DA_PAREDE";
        }

        private void CalculateNearestLevels(double currentPrice)
        {
            var allLevels = BuildAllLevelsList();
            double nearestRes = double.MaxValue, nearestSup = double.MaxValue;
            double nearestResPrice = 0, nearestSupPrice = 0;

            foreach (var level in allLevels)
            {
                double dist = Math.Abs(level.Price - currentPrice);
                if (level.Price > currentPrice && dist < nearestRes)
                {
                    nearestRes = dist;
                    nearestResPrice = level.Price;
                }
                else if (level.Price < currentPrice && dist < nearestSup)
                {
                    nearestSup = dist;
                    nearestSupPrice = level.Price;
                }
            }

            currentBias.NearestResistance = nearestResPrice > 0 ? nearestResPrice : currentGammaData.CallResistance0DTE;
            currentBias.NearestSupport = nearestSupPrice > 0 ? nearestSupPrice : currentGammaData.PutSupport0DTE;
            currentBias.DistanceToResistance = nearestRes < double.MaxValue ? Math.Round(nearestRes, 2) : 0;
            currentBias.DistanceToSupport = nearestSup < double.MaxValue ? Math.Round(nearestSup, 2) : 0;
        }

        private List<LevelInfo> BuildAllLevelsList()
        {
            var list = new List<LevelInfo>();

            if (currentGammaData.PutSupport0DTE > 0) list.Add(new LevelInfo { Price = currentGammaData.PutSupport0DTE, Type = "PS0DTE" });
            if (currentGammaData.CallResistance0DTE > 0) list.Add(new LevelInfo { Price = currentGammaData.CallResistance0DTE, Type = "CR0DTE" });
            if (currentGammaData.GammaWall0DTE > 0) list.Add(new LevelInfo { Price = currentGammaData.GammaWall0DTE, Type = "GW0DTE" });
            if (currentGammaData.HVL0DTE > 0) list.Add(new LevelInfo { Price = currentGammaData.HVL0DTE, Type = "HVL0DTE" });
            if (currentGammaData.HVL > 0) list.Add(new LevelInfo { Price = currentGammaData.HVL, Type = "HVL" });
            if (currentGammaData.PutSupport > 0) list.Add(new LevelInfo { Price = currentGammaData.PutSupport, Type = "PS" });
            if (currentGammaData.CallResistance > 0) list.Add(new LevelInfo { Price = currentGammaData.CallResistance, Type = "CR" });
            if (currentGammaData.Max1D > 0) list.Add(new LevelInfo { Price = currentGammaData.Max1D, Type = "MAX1D" });
            if (currentGammaData.Min1D > 0) list.Add(new LevelInfo { Price = currentGammaData.Min1D, Type = "MIN1D" });

            foreach (double bl in currentGammaData.BL) if (bl > 0) list.Add(new LevelInfo { Price = bl, Type = "BL" });
            foreach (double gex in currentGammaData.GEX) if (gex > 0) list.Add(new LevelInfo { Price = gex, Type = "GEX" });

            return list;
        }

        // ================================================================
        //  BUSCAR ÚLTIMO ID DO DIA NO SUPABASE
        // ================================================================

        private async void FetchLastRecordIdAsync()
        {
            try
            {
                if (httpClient == null) return;
                string today = GetCurrentTradeDate();
                string url = $"{supabaseUrl.TrimEnd('/')}/rest/v1/gamma_levels?select=id,trade_date&reference_symbol=eq.{referenceSymbol}&trade_date=eq.{today}&order=id.desc&limit=1";
                Print($"[SYNC] Buscando último ID de hoje ({today}) no Supabase: {url}");
                var response = await httpClient.GetAsync(url);
                if (response.IsSuccessStatusCode)
                {
                    string body = await response.Content.ReadAsStringAsync();
                    ExtractRecordId(body);
                    if (hasLastRecordId)
                    {
                        Print($"[SYNC] ✓ Último registro ID={lastRecordId} sincronizado do Supabase.");
                    }
                }
            }
            catch (Exception ex)
            {
                Print($"[SYNC] ⚠ Erro ao buscar último ID: {ex.Message}");
            }
        }

        // ================================================================
        //  ATUALIZAR VIÉS NO ÚLTIMO REGISTRO (PATCH)
        // ================================================================

        private async void UpdateBiasOnLastRecordAsync()
        {
            try
            {
                if (!hasLastRecordId || lastRecordId <= 0)
                {
                    Print("[BIAS-UPDATE] ✗ Sem ID de registro válido.");
                    return;
                }

                string url = $"{supabaseUrl.TrimEnd('/')}/rest/v1/gamma_levels?id=eq.{lastRecordId}";
                string jsonPayload = BuildBiasUpdateJson();

                Print($"[BIAS-UPDATE] PATCH {url}");
                Print($"[BIAS-UPDATE] Payload: {jsonPayload}");

                var request = new HttpRequestMessage(new HttpMethod("PATCH"), url);
                request.Content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");
                request.Headers.Add("Prefer", "return=minimal");

                var response = await httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    Print($"[BIAS-UPDATE] ✓✓✓ VIÉS ATUALIZADO no registro ID={lastRecordId} às {DateTime.Now:HH:mm:ss}");
                }
                else
                {
                    string error = await response.Content.ReadAsStringAsync();
                    Print($"[BIAS-UPDATE] ✗✗✗ ERRO: {response.StatusCode} — {error}");
                }
            }
            catch (Exception ex)
            {
                Print($"[BIAS-UPDATE] ✗✗✗ EXCEÇÃO: {ex.Message}");
            }
        }

        private string BuildBiasUpdateJson()
        {
            var sb = new StringBuilder();
            sb.Append("{");
            sb.Append($"\"buy_strength\":{F(currentBias.BuyStrength)},");
            sb.Append($"\"sell_strength\":{F(currentBias.SellStrength)},");
            sb.Append($"\"gamma_bias\":\"{currentBias.Gamma_Bias}\",");
            sb.Append($"\"bias_score\":{F(currentBias.BiasScore)},");
            sb.Append($"\"nearest_resistance\":{F(currentBias.NearestResistance)},");
            sb.Append($"\"nearest_support\":{F(currentBias.NearestSupport)},");
            sb.Append($"\"distance_to_resistance\":{F(currentBias.DistanceToResistance)},");
            sb.Append($"\"distance_to_support\":{F(currentBias.DistanceToSupport)},");
            sb.Append($"\"confluence_type\":\"{currentBias.ConfluenceType}\",");
            sb.Append($"\"recommended_strategy\":\"{currentBias.RecommendedStrategy}\",");
            sb.Append($"\"void_gamma_above\":{currentBias.VoidGammaAbove.ToString().ToLower()},");
            sb.Append($"\"void_gamma_below\":{currentBias.VoidGammaBelow.ToString().ToLower()},");
            sb.Append($"\"bias_timestamp\":\"{currentBias.BiasTimestamp:yyyy-MM-ddTHH:mm:ss.fffzzz}\"");
            sb.Append("}");
            return sb.ToString();
        }

        // ================================================================
        //  NOTÍCIAS
        // ================================================================

        private async void FetchAndSaveNewsAsync()
        {
            try
            {
                Print($"[NEWS] GET {newsApiUrl}");
                var response = await httpClient.GetAsync(newsApiUrl);

                if (!response.IsSuccessStatusCode)
                {
                    Print($"[NEWS] ✗ Erro HTTP {(int)response.StatusCode}");
                    if ((int)response.StatusCode == 429)
                    {
                        lastNewsCheckTime = DateTime.Now.AddMinutes(30);
                    }
                    return;
                }

                string jsonContent = await response.Content.ReadAsStringAsync();
                var newsList = ParseNewsJson(jsonContent);
                var newNews = newsList.Where(n => !processedNewsIds.Contains(n.EventId)).ToList();

                if (newNews.Count > 0)
                {
                    await SaveNewsToSupabaseAsync(newNews);
                    foreach (var news in newNews) processedNewsIds.Add(news.EventId);
                }
            }
            catch (Exception ex)
            {
                Print($"[NEWS] ✗✗✗ EXCEÇÃO: {ex.Message}");
            }
        }

        private List<NewsItem> ParseNewsJson(string json)
        {
            var newsList = new List<NewsItem>();
            try
            {
                json = json.Trim();
                if (!json.StartsWith("[")) return newsList;
                json = json.Substring(1, json.Length - 2);
                int depth = 0, start = 0;
                for (int i = 0; i < json.Length; i++)
                {
                    if (json[i] == '{') depth++;
                    else if (json[i] == '}') depth--;
                    if (depth == 0 && json[i] == ',')
                    {
                        string obj = json.Substring(start, i - start).Trim();
                        if (obj.Length > 0) { var item = ParseNewsObject(obj); if (item != null) newsList.Add(item); }
                        start = i + 1;
                    }
                }
                string lastObj = json.Substring(start).Trim();
                if (lastObj.Length > 0) { var item = ParseNewsObject(lastObj); if (item != null) newsList.Add(item); }
            }
            catch { }
            return newsList;
        }

        private NewsItem ParseNewsObject(string obj)
        {
            try
            {
                string date = ExtractJsonValue(obj, "date");
                string country = ExtractJsonValue(obj, "country");
                string title = ExtractJsonValue(obj, "title");
                string impact = ExtractJsonValue(obj, "impact");
                string forecast = ExtractJsonValue(obj, "forecast");
                string previous = ExtractJsonValue(obj, "previous");
                string actual = ExtractJsonValue(obj, "actual");
                if (string.IsNullOrEmpty(date) || string.IsNullOrEmpty(country) || string.IsNullOrEmpty(title)) return null;
                DateTime eventDate; if (!DateTime.TryParse(date, out eventDate)) return null;
                string normalizedImpact = "low";
                if (!string.IsNullOrEmpty(impact))
                {
                    string il = impact.ToLower().Trim();
                    if (il == "high") normalizedImpact = "high";
                    else if (il == "medium") normalizedImpact = "medium";
                }
                return new NewsItem { 
                    EventId = GenerateEventId(eventDate, country, title), 
                    Country = country.Trim().ToUpper(), 
                    Title = title.Trim(), 
                    Impact = normalizedImpact, 
                    EventDate = eventDate,
                    Forecast = forecast?.Trim() ?? "",
                    Previous = previous?.Trim() ?? "",
                    Actual = actual?.Trim() ?? ""
                };
            }
            catch { return null; }
        }

        private string ExtractJsonValue(string json, string key)
        {
            string searchKey = $"\"{key}\"";
            int keyIndex = json.IndexOf(searchKey);
            if (keyIndex < 0) return null;
            int colonIndex = json.IndexOf(':', keyIndex + searchKey.Length);
            if (colonIndex < 0) return null;
            int valueStart = colonIndex + 1;
            while (valueStart < json.Length && json[valueStart] == ' ') valueStart++;
            if (valueStart >= json.Length) return null;
            if (json[valueStart] == '"')
            {
                int valueEnd = json.IndexOf('"', valueStart + 1);
                if (valueEnd < 0) return null;
                return json.Substring(valueStart + 1, valueEnd - valueStart - 1);
            }
            else
            {
                int valueEnd = valueStart;
                while (valueEnd < json.Length && json[valueEnd] != ',' && json[valueEnd] != '}') valueEnd++;
                string value = json.Substring(valueStart, valueEnd - valueStart).Trim();
                return value == "null" ? null : value;
            }
        }

        private string GenerateEventId(DateTime date, string country, string title)
        {
            string raw = $"{date:yyyyMMddHHmm}_{country}_{title}";
            using (var sha = System.Security.Cryptography.SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(raw));
                return BitConverter.ToString(hash).Replace("-", "").Substring(0, 32).ToLower();
            }
        }

        private async Task SaveNewsToSupabaseAsync(List<NewsItem> newsList)
        {
            try
            {
                string url = $"{supabaseUrl.TrimEnd('/')}/rest/v1/economic_news";
                var sb = new StringBuilder();
                sb.Append("[");
                for (int i = 0; i < newsList.Count; i++)
                {
                    if (i > 0) sb.Append(",");
                    var news = newsList[i];
                    sb.Append("{");
                    sb.Append($"\"event_id\":\"{news.EventId}\",");
                    sb.Append($"\"country\":\"{EscapeJson(news.Country)}\",");
                    sb.Append($"\"title\":\"{EscapeJson(news.Title)}\",");
                    sb.Append($"\"impact\":\"{news.Impact}\",");
                    sb.Append($"\"forecast\":\"{EscapeJson(news.Forecast)}\",");
                    sb.Append($"\"previous\":\"{EscapeJson(news.Previous)}\",");
                    sb.Append($"\"actual\":\"{EscapeJson(news.Actual)}\",");
                    sb.Append($"\"event_date\":\"{news.EventDate:yyyy-MM-ddTHH:mm:ss.fffzzz}\"");
                    sb.Append("}");
                }
                sb.Append("]");
                var request = new HttpRequestMessage(HttpMethod.Post, url);
                request.Content = new StringContent(sb.ToString(), Encoding.UTF8, "application/json");
                request.Headers.Add("Prefer", "return=minimal,resolution=merge-duplicates");
                var response = await httpClient.SendAsync(request);
                if (response.IsSuccessStatusCode) Print($"[NEWS] ✓✓✓ {newsList.Count} notícias salvas");
                else Print($"[NEWS] ✗ Erro: {response.StatusCode}");
            }
            catch (Exception ex) { Print($"[NEWS] ✗ {ex.Message}"); }
        }

        private string EscapeJson(string value)
        {
            if (string.IsNullOrEmpty(value)) return "";
            return value.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r");
        }

        // ================================================================
        //  GAMMA LEVELS
        // ================================================================

        private void PrintCurrentGammaData()
        {
            Print("[DATA] ─── DADOS DO DIA ANTERIOR ───");
            Print($"[DATA] PrevDayHigh: {prevDayHigh:F2}");
            Print($"[DATA] PrevDayLow: {prevDayLow:F2}");
            Print($"[DATA] PrevDayOpen: {prevDayOpen:F2}");
            Print($"[DATA] PrevDayClose: {prevDayClose:F2}");
            Print($"[DATA] PrevDayAdjuste: {prevDayAdjuste:F2}");
            Print("[DATA] ─── NÍVEIS GAMMA ───");
            Print($"[DATA] HVL: {currentGammaData.HVL:F2}");
            Print($"[DATA] HVL0DTE: {currentGammaData.HVL0DTE:F2}");
            Print($"[DATA] PutSupport: {currentGammaData.PutSupport:F2}");
            Print($"[DATA] CallResistance: {currentGammaData.CallResistance:F2}");
            Print($"[DATA] PutSupport0DTE: {currentGammaData.PutSupport0DTE:F2}");
            Print($"[DATA] CallResistance0DTE: {currentGammaData.CallResistance0DTE:F2}");
            Print($"[DATA] GammaWall0DTE: {currentGammaData.GammaWall0DTE:F2}");
            Print($"[DATA] Max1D: {currentGammaData.Max1D:F2}");
            Print($"[DATA] Min1D: {currentGammaData.Min1D:F2}");
            Print($"[DATA] BL Count: {currentGammaData.BL.Count}");
            if (currentGammaData.BL.Count > 0) Print($"[DATA] BL: {string.Join(", ", currentGammaData.BL.Select(v => v.ToString("F2")))}");
            Print($"[DATA] GEX Count: {currentGammaData.GEX.Count}");
            if (currentGammaData.GEX.Count > 0) Print($"[DATA] GEX: {string.Join(", ", currentGammaData.GEX.Select(v => v.ToString("F2")))}");
        }

        private string GetCurrentTradeDate()
        {
            try
            {
                if (BarsArray != null && BarsArray.Length > 1 && CurrentBars != null && CurrentBars.Length > 1 && CurrentBars[1] >= 0 && CurrentBars[1] < BarsArray[1].Count)
                {
                    return BarsArray[1].GetTime(CurrentBars[1]).ToString("yyyy-MM-dd");
                }
            }
            catch { }
            return DateTime.Now.ToString("yyyy-MM-dd");
        }

        private void UpdatePreviousDayOHLC()
        {
            try
            {
                bool found = false;

                // Método 1: Via série secundária Diária (BarsArray[1])
                if (BarsArray != null && BarsArray.Length > 1 && CurrentBars != null && CurrentBars.Length > 1 && CurrentBars[1] >= 0)
                {
                    int dailyCount = BarsArray[1].Count;
                    int currDailyIdx = CurrentBars[1];

                    if (currDailyIdx < dailyCount)
                    {
                        DateTime currentBarTime = Time[0];
                        DateTime currentDailyTime = BarsArray[1].GetTime(currDailyIdx);

                        // Determina o índice da barra diária anterior concluída
                        int prevDailyIdx;
                        if (currentDailyTime.Date == currentBarTime.Date)
                        {
                            prevDailyIdx = currDailyIdx - 1;
                        }
                        else if (currentBarTime.Date > currentDailyTime.Date)
                        {
                            // A barra diária em currDailyIdx ainda é do dia anterior
                            prevDailyIdx = currDailyIdx;
                        }
                        else
                        {
                            prevDailyIdx = currDailyIdx - 1;
                        }

                        if (prevDailyIdx >= 0 && prevDailyIdx < dailyCount)
                        {
                            double h = BarsArray[1].GetHigh(prevDailyIdx);
                            double l = BarsArray[1].GetLow(prevDailyIdx);
                            double o = BarsArray[1].GetOpen(prevDailyIdx);
                            double c = BarsArray[1].GetClose(prevDailyIdx);

                            if (h > 0 && l > 0)
                            {
                                prevDayHigh = h;
                                prevDayLow = l;
                                prevDayOpen = o;
                                prevDayClose = c;
                                prevDayAdjuste = Math.Round((h + l + o + c) / 4.0, 2);
                                found = true;
                            }
                        }
                    }
                }

                // Método 2: Fallback via Bars.GetDayBar(1)
                if (!found)
                {
                    try
                    {
                        var dayBar = Bars.GetDayBar(1);
                        if (dayBar != null && dayBar.High > 0 && dayBar.Low > 0)
                        {
                            prevDayHigh = dayBar.High;
                            prevDayLow = dayBar.Low;
                            prevDayOpen = dayBar.Open;
                            prevDayClose = dayBar.Close;
                            prevDayAdjuste = Math.Round((prevDayHigh + prevDayLow + prevDayOpen + prevDayClose) / 4.0, 2);
                            found = true;
                        }
                    }
                    catch { }
                }

                // Método 3: Fallback via Highs[1][1] se disponível
                if (!found && CurrentBars != null && CurrentBars.Length > 1 && CurrentBars[1] >= 1)
                {
                    try
                    {
                        double h = Highs[1][1];
                        double l = Lows[1][1];
                        double o = Opens[1][1];
                        double c = Closes[1][1];

                        if (h > 0 && l > 0)
                        {
                            prevDayHigh = h;
                            prevDayLow = l;
                            prevDayOpen = o;
                            prevDayClose = c;
                            prevDayAdjuste = Math.Round((h + l + o + c) / 4.0, 2);
                            found = true;
                        }
                    }
                    catch { }
                }
            }
            catch (Exception ex)
            {
                Print($"[PREV-DAY] ⚠ Erro ao calcular OHLC do dia anterior: {ex.Message}");
            }
        }

        private string GetChangedFields()
        {
            List<string> changed = new List<string>();
            string currentDate = GetCurrentTradeDate();
            if (!string.IsNullOrEmpty(lastSavedDate) && currentDate != lastSavedDate) changed.Add($"TradeDate ({lastSavedDate} -> {currentDate})");
            if (prevDayHigh != lastSavedPrevDayHigh) changed.Add($"PrevDayHigh");
            if (prevDayLow != lastSavedPrevDayLow) changed.Add($"PrevDayLow");
            if (prevDayOpen != lastSavedPrevDayOpen) changed.Add($"PrevDayOpen");
            if (prevDayClose != lastSavedPrevDayClose) changed.Add($"PrevDayClose");
            if (prevDayAdjuste != lastSavedPrevDayAdjuste) changed.Add($"PrevDayAdjuste");
            if (currentGammaData.HVL != lastSavedGammaData.HVL) changed.Add($"HVL");
            if (currentGammaData.HVL0DTE != lastSavedGammaData.HVL0DTE) changed.Add($"HVL0DTE");
            if (currentGammaData.PutSupport != lastSavedGammaData.PutSupport) changed.Add($"PutSupport");
            if (currentGammaData.CallResistance != lastSavedGammaData.CallResistance) changed.Add($"CallResistance");
            if (currentGammaData.PutSupport0DTE != lastSavedGammaData.PutSupport0DTE) changed.Add($"PutSupport0DTE");
            if (currentGammaData.CallResistance0DTE != lastSavedGammaData.CallResistance0DTE) changed.Add($"CallResistance0DTE");
            if (currentGammaData.GammaWall0DTE != lastSavedGammaData.GammaWall0DTE) changed.Add($"GammaWall0DTE");
            if (currentGammaData.Max1D != lastSavedGammaData.Max1D) changed.Add($"Max1D");
            if (currentGammaData.Min1D != lastSavedGammaData.Min1D) changed.Add($"Min1D");
            if (currentGammaData.BL.Count != lastSavedGammaData.BL.Count) changed.Add($"BL Count");
            else { for (int i = 0; i < currentGammaData.BL.Count; i++) if (currentGammaData.BL[i] != lastSavedGammaData.BL[i]) changed.Add($"BL[{i}]"); }
            if (currentGammaData.GEX.Count != lastSavedGammaData.GEX.Count) changed.Add($"GEX Count");
            else { for (int i = 0; i < currentGammaData.GEX.Count; i++) if (currentGammaData.GEX[i] != lastSavedGammaData.GEX[i]) changed.Add($"GEX[{i}]"); }
            return changed.Count > 0 ? string.Join(", ", changed) : null;
        }

        private void UpdateLastSavedState()
        {
            lastSavedPrevDayHigh = prevDayHigh; lastSavedPrevDayLow = prevDayLow;
            lastSavedPrevDayOpen = prevDayOpen; lastSavedPrevDayClose = prevDayClose; lastSavedPrevDayAdjuste = prevDayAdjuste;
            lastSavedGammaData.HVL = currentGammaData.HVL; lastSavedGammaData.HVL0DTE = currentGammaData.HVL0DTE;
            lastSavedGammaData.PutSupport = currentGammaData.PutSupport; lastSavedGammaData.CallResistance = currentGammaData.CallResistance;
            lastSavedGammaData.PutSupport0DTE = currentGammaData.PutSupport0DTE; lastSavedGammaData.CallResistance0DTE = currentGammaData.CallResistance0DTE;
            lastSavedGammaData.GammaWall0DTE = currentGammaData.GammaWall0DTE; lastSavedGammaData.Max1D = currentGammaData.Max1D; lastSavedGammaData.Min1D = currentGammaData.Min1D;
            lastSavedGammaData.BL = new List<double>(currentGammaData.BL); lastSavedGammaData.GEX = new List<double>(currentGammaData.GEX);
            lastSavedDate = GetCurrentTradeDate();
            Print($"[CACHE] Estado atualizado para trade_date: {lastSavedDate}");
        }

        private async void SendToSupabaseAsync(bool isNewRecord)
        {
            try
            {
                string url = $"{supabaseUrl.TrimEnd('/')}/rest/v1/gamma_levels";
                string jsonPayload = BuildSupabaseJson(isNewRecord);
                Print($"[HTTP] POST {url}");
                Print($"[HTTP] Payload: {jsonPayload}");
                var request = new HttpRequestMessage(HttpMethod.Post, url);
                request.Content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");
                request.Headers.Add("Prefer", "return=representation");
                var response = await httpClient.SendAsync(request);
                if (response.IsSuccessStatusCode)
                {
                    string responseBody = await response.Content.ReadAsStringAsync();
                    Print($"[SUPABASE] ✓✓✓ REGISTRO CRIADO: {responseBody}");
                    ExtractRecordId(responseBody);
                    UpdateLastSavedState();
                }
                else
                {
                    string error = await response.Content.ReadAsStringAsync();
                    Print($"[SUPABASE] ✗✗✗ ERRO: {response.StatusCode} — {error}");
                }
            }
            catch (Exception ex) { Print($"[SUPABASE] ✗✗✗ EXCEÇÃO: {ex.Message}"); }
        }

        private void ExtractRecordId(string responseBody)
        {
            try
            {
                responseBody = responseBody.Trim();
                if (responseBody.StartsWith("[") && responseBody.EndsWith("]")) responseBody = responseBody.Substring(1, responseBody.Length - 2);
                string idKey = "\"id\":";
                int idIndex = responseBody.IndexOf(idKey);
                if (idIndex >= 0)
                {
                    int start = idIndex + idKey.Length;
                    int end = responseBody.IndexOf(',', start);
                    if (end < 0) end = responseBody.IndexOf('}', start);
                    if (end > start)
                    {
                        string idStr = responseBody.Substring(start, end - start).Trim();
                        if (int.TryParse(idStr, out int id)) { lastRecordId = id; hasLastRecordId = true; Print($"[SUPABASE] ✓ ID capturado: {lastRecordId}"); }
                    }
                }
            }
            catch (Exception ex) { Print($"[SUPABASE] ⚠ Erro ao extrair ID: {ex.Message}"); }
        }

        private string BuildSupabaseJson(bool isNewRecord)
        {
            var sb = new StringBuilder();
            sb.Append("{");
            sb.Append($"\"symbol\":\"{safeSymbol}\",");
            sb.Append($"\"reference_symbol\":\"{referenceSymbol}\",");
            sb.Append($"\"trade_date\":\"{GetCurrentTradeDate()}\",");
            sb.Append($"\"prev_day_high\":{F(prevDayHigh)},");
            sb.Append($"\"prev_day_low\":{F(prevDayLow)},");
            sb.Append($"\"prev_day_open\":{F(prevDayOpen)},");
            sb.Append($"\"prev_day_close\":{F(prevDayClose)},");
            sb.Append($"\"prev_day_adjust\":{F(prevDayAdjuste)},");
            sb.Append($"\"hvl\":{F(currentGammaData.HVL)},");
            sb.Append($"\"hvl_0dte\":{F(currentGammaData.HVL0DTE)},");
            sb.Append($"\"put_support\":{F(currentGammaData.PutSupport)},");
            sb.Append($"\"call_resistance\":{F(currentGammaData.CallResistance)},");
            sb.Append($"\"put_support_0dte\":{F(currentGammaData.PutSupport0DTE)},");
            sb.Append($"\"call_resistance_0dte\":{F(currentGammaData.CallResistance0DTE)},");
            sb.Append($"\"gamma_wall_0dte\":{F(currentGammaData.GammaWall0DTE)},");
            sb.Append($"\"max_1d\":{F(currentGammaData.Max1D)},");
            sb.Append($"\"min_1d\":{F(currentGammaData.Min1D)},");
            sb.Append($"\"bl\":[{string.Join(",", currentGammaData.BL.Select(F))}],");
            sb.Append($"\"gex\":[{string.Join(",", currentGammaData.GEX.Select(F))}]");
            if (enableGammaBias)
            {
                sb.Append(",");
                sb.Append($"\"buy_strength\":{F(currentBias.BuyStrength)},");
                sb.Append($"\"sell_strength\":{F(currentBias.SellStrength)},");
                sb.Append($"\"gamma_bias\":\"{currentBias.Gamma_Bias}\",");
                sb.Append($"\"bias_score\":{F(currentBias.BiasScore)},");
                sb.Append($"\"nearest_resistance\":{F(currentBias.NearestResistance)},");
                sb.Append($"\"nearest_support\":{F(currentBias.NearestSupport)},");
                sb.Append($"\"distance_to_resistance\":{F(currentBias.DistanceToResistance)},");
                sb.Append($"\"distance_to_support\":{F(currentBias.DistanceToSupport)},");
                sb.Append($"\"confluence_type\":\"{currentBias.ConfluenceType}\",");
                sb.Append($"\"recommended_strategy\":\"{currentBias.RecommendedStrategy}\",");
                sb.Append($"\"void_gamma_above\":{currentBias.VoidGammaAbove.ToString().ToLower()},");
                sb.Append($"\"void_gamma_below\":{currentBias.VoidGammaBelow.ToString().ToLower()},");
                sb.Append($"\"bias_timestamp\":\"{currentBias.BiasTimestamp:yyyy-MM-ddTHH:mm:ss.fffzzz}\"");
            }
            sb.Append("}");
            return sb.ToString();
        }

        private GammaData ReadGammaObjects()
        {
            var data = new GammaData();
            try
            {
                Print($"[READ] Total de objetos no gráfico: {DrawObjects.Count}");

                foreach (DrawingTool dt in DrawObjects)
                {
                    if (dt == null) continue;

                    string tag = (dt.Tag ?? "").Trim();
                    string objectText = GetObjectText(dt).Trim();

                    // Se tanto a tag quanto o texto forem vazios, ignora
                    if (string.IsNullOrEmpty(tag) && string.IsNullOrEmpty(objectText)) continue;

                    double price = GetAnchorPrice(dt);
                    if (price <= 0) continue;

                    // Coleta todas as partes candidatas a nível (tag e texto)
                    var tokens = new List<string>();

                    if (!string.IsNullOrEmpty(objectText))
                    {
                        string[] textParts = objectText.Split(new[] { "&&", "&", "/", "+", ",", ";" }, StringSplitOptions.RemoveEmptyEntries);
                        foreach (string p in textParts)
                        {
                            string t = p.Trim();
                            if (!string.IsNullOrEmpty(t) && !tokens.Contains(t)) tokens.Add(t);
                        }
                    }

                    if (!string.IsNullOrEmpty(tag))
                    {
                        string[] tagParts = tag.Split(new[] { "&&", "&", "/", "+", ",", ";" }, StringSplitOptions.RemoveEmptyEntries);
                        foreach (string p in tagParts)
                        {
                            string t = p.Trim();
                            if (!string.IsNullOrEmpty(t) && !tokens.Contains(t)) tokens.Add(t);
                        }
                    }

                    foreach (string token in tokens)
                    {
                        ProcessTokenLevel(token, price, data);
                    }
                }
            }
            catch (Exception ex) { Print($"[READ] ✗ ERRO: {ex.Message}"); }
            return data;
        }

        private void ProcessTokenLevel(string token, double price, GammaData data)
        {
            if (string.IsNullOrEmpty(token) || price <= 0) return;

            string clean = token.Replace(" ", "").Replace("-", "").Replace("_", "").ToUpperInvariant();

            // 1. BL (Break Levels 1 a 10)
            if (clean.StartsWith("BL") && clean.Length >= 3)
            {
                if (!data.BL.Contains(price)) data.BL.Add(price);
                return;
            }

            // 2. GEX (1 a 10)
            if (clean.StartsWith("GEX") && clean.Length >= 4)
            {
                if (!data.GEX.Contains(price)) data.GEX.Add(price);
                return;
            }

            // 3. Max 1D / 1D Max
            if (clean.Contains("1DMAX") || clean.Contains("MAX1D") || clean.Contains("1DHIGH") || clean.Contains("HIGH1D"))
            {
                if (data.Max1D == 0) data.Max1D = price;
                return;
            }

            // 4. Min 1D / 1D Min
            if (clean.Contains("1DMIN") || clean.Contains("MIN1D") || clean.Contains("1DLOW") || clean.Contains("LOW1D"))
            {
                if (data.Min1D == 0) data.Min1D = price;
                return;
            }

            // 5. Gamma Wall (0DTE ou Geral)
            if (clean.Contains("GAMMAWALL") || clean.Contains("GW0DTE") || clean.Contains("0DTEGW") || clean == "GW")
            {
                if (data.GammaWall0DTE == 0) data.GammaWall0DTE = price;
                return;
            }

            // 6. Call Resistance 0DTE
            if (clean.Contains("CALLRESISTANCE0DTE") || clean.Contains("CALLRES0DTE") || clean.Contains("CR0DTE") || clean.Contains("0DTECR"))
            {
                if (data.CallResistance0DTE == 0) data.CallResistance0DTE = price;
                return;
            }

            // 7. Call Resistance
            if (clean.Contains("CALLRESISTANCE") || clean.Contains("CALLRES") || clean == "CR")
            {
                if (data.CallResistance == 0) data.CallResistance = price;
                return;
            }

            // 8. Put Support 0DTE
            if (clean.Contains("PUTSUPPORT0DTE") || clean.Contains("PUTSUP0DTE") || clean.Contains("PS0DTE") || clean.Contains("0DTEPS"))
            {
                if (data.PutSupport0DTE == 0) data.PutSupport0DTE = price;
                return;
            }

            // 9. Put Support
            if (clean.Contains("PUTSUPPORT") || clean.Contains("PUTSUP") || clean == "PS")
            {
                if (data.PutSupport == 0) data.PutSupport = price;
                return;
            }

            // 10. HVL 0DTE
            if (clean.Contains("HVL0DTE") || clean.Contains("HVLODTE") || clean.Contains("0DTEHVL"))
            {
                if (data.HVL0DTE == 0) data.HVL0DTE = price;
                return;
            }

            // 11. HVL
            if (clean.Contains("HVL"))
            {
                if (data.HVL == 0) data.HVL = price;
                return;
            }
        }

        private string GetObjectText(DrawingTool dt)
        {
            try
            {
                var textProp = dt.GetType().GetProperty("Text");
                if (textProp != null)
                {
                    string text = textProp.GetValue(dt) as string;
                    if (!string.IsNullOrEmpty(text)) return text;
                }

                var displayTextProp = dt.GetType().GetProperty("DisplayText");
                if (displayTextProp != null)
                {
                    string text = displayTextProp.GetValue(dt) as string;
                    if (!string.IsNullOrEmpty(text)) return text;
                }

                var nameProp = dt.GetType().GetProperty("Name");
                if (nameProp != null)
                {
                    string name = nameProp.GetValue(dt) as string;
                    if (!string.IsNullOrEmpty(name) && (name.Contains("&") || name.Contains("Call") || name.Contains("Put") || name.Contains("Gamma") || name.Contains("HVL") || name.Contains("BL") || name.Contains("GEX") || name.Contains("GW") || name.Contains("Max") || name.Contains("Min")))
                        return name;
                }

                var props = dt.GetType().GetProperties();
                foreach (var prop in props)
                {
                    if (prop.PropertyType == typeof(string) && prop.CanRead)
                    {
                        try
                        {
                            var value = prop.GetValue(dt) as string;
                            if (!string.IsNullOrEmpty(value) && (value.Contains("&") || value.Contains("Call") || value.Contains("Put") || value.Contains("Gamma") || value.Contains("HVL") || value.Contains("BL") || value.Contains("GEX") || value.Contains("GW") || value.Contains("Max") || value.Contains("Min")))
                                return value;
                        }
                        catch { }
                    }
                }
            }
            catch (Exception ex) { Print($"[TEXT] Erro: {ex.Message}"); }
            return "";
        }

        private double GetAnchorPrice(DrawingTool dt)
        {
            try
            {
                if (dt is HorizontalLine hl) return hl.StartAnchor.Price;
                if (dt is Line line) return line.StartAnchor.Price;
                if (dt is Ray ray) return ray.StartAnchor.Price;
                if (dt is Text txt && txt.Anchor != null) return txt.Anchor.Price;

                var anchorsProp = dt.GetType().GetProperty("Anchors");
                if (anchorsProp != null)
                {
                    var anchors = anchorsProp.GetValue(dt) as System.Collections.IEnumerable;
                    if (anchors != null)
                    {
                        foreach (var anchor in anchors)
                        {
                            var priceProp = anchor.GetType().GetProperty("Price");
                            if (priceProp != null)
                            {
                                double price = (double)priceProp.GetValue(anchor);
                                if (price > 0) return price;
                            }
                        }
                    }
                }

                var anchorProp = dt.GetType().GetProperty("Anchor");
                if (anchorProp != null)
                {
                    var anchor = anchorProp.GetValue(dt);
                    if (anchor != null)
                    {
                        var priceProp = anchor.GetType().GetProperty("Price");
                        if (priceProp != null)
                        {
                            double price = (double)priceProp.GetValue(anchor);
                            if (price > 0) return price;
                        }
                    }
                }

                var startAnchorProp = dt.GetType().GetProperty("StartAnchor");
                if (startAnchorProp != null)
                {
                    var anchor = startAnchorProp.GetValue(dt);
                    if (anchor != null)
                    {
                        var priceProp = anchor.GetType().GetProperty("Price");
                        if (priceProp != null)
                        {
                            double price = (double)priceProp.GetValue(anchor);
                            if (price > 0) return price;
                        }
                    }
                }
            }
            catch (Exception ex) { Print($"[ANCHOR] Erro: {ex.Message}"); }
            return 0;
        }

        // ================================================================
        //  CONFLUÊNCIA DE NÍVEIS
        // ================================================================

        private string IdentifyConfluenceType()
        {
            bool gwEqCr = Math.Abs(currentGammaData.GammaWall0DTE - currentGammaData.CallResistance0DTE) < 1;
            bool hvl0EqPs = Math.Abs(currentGammaData.HVL0DTE - currentGammaData.PutSupport0DTE) < 1;
            bool hvlEqHvl0 = Math.Abs(currentGammaData.HVL - currentGammaData.HVL0DTE) < 1;

            if (gwEqCr && hvlEqHvl0) return "A_C";
            if (gwEqCr) return "A";
            if (hvl0EqPs) return "B";
            if (hvlEqHvl0) return "C";
            return "NONE";
        }

        // ================================================================
        //  VOID GAMMA
        // ================================================================

        private bool CheckVoidGamma(double currentPrice, bool above, List<LevelInfo> allLevels)
        {
            double start = above ? currentPrice : currentPrice - 100;
            double end = above ? currentPrice + 100 : currentPrice;

            foreach (var level in allLevels)
                if (level.Price >= start && level.Price <= end) return false;
            return true;
        }

        private static string F(double v) { return (double.IsNaN(v) || double.IsInfinity(v)) ? "0.00" : v.ToString("F2", System.Globalization.CultureInfo.InvariantCulture); }

        private class GammaData
        {
            public double HVL = 0, HVL0DTE = 0, PutSupport = 0, CallResistance = 0;
            public double PutSupport0DTE = 0, CallResistance0DTE = 0, GammaWall0DTE = 0;
            public double Max1D = 0, Min1D = 0;
            public List<double> BL = new List<double>();
            public List<double> GEX = new List<double>();
        }

        private class GammaBias
        {
            public double BuyStrength = 50.0;
            public double SellStrength = 50.0;
            public string Gamma_Bias = "NEUTRAL";
            public double BiasScore = 0.0;
            public double NearestResistance = 0.0;
            public double NearestSupport = 0.0;
            public double DistanceToResistance = 0.0;
            public double DistanceToSupport = 0.0;
            public string ConfluenceType = "NONE";
            public string RecommendedStrategy = "AGUARDAR";
            public bool VoidGammaAbove = false;
            public bool VoidGammaBelow = false;
            public DateTime BiasTimestamp = DateTime.MinValue;
        }

        private class LevelInfo { public double Price; public string Type; }

        private class NewsItem
        {
            public string EventId { get; set; }
            public string Country { get; set; }
            public string Title { get; set; }
            public string Impact { get; set; }
            public DateTime EventDate { get; set; }
            public string Forecast { get; set; }
            public string Previous { get; set; }
            public string Actual { get; set; }
            public string Unit { get; set; }
        }
    }
}

#region NinjaScript generated code. Neither change nor remove.

namespace NinjaTrader.NinjaScript.Indicators
{
	public partial class Indicator : NinjaTrader.Gui.NinjaScript.IndicatorRenderBase
	{
		private GammaSupabaseSender[] cacheGammaSupabaseSender;
		public GammaSupabaseSender GammaSupabaseSender(int updateIntervalMinutes, string supabaseUrl, string supabaseServiceKey, string referenceSymbol, bool enableNewsSync, int newsUpdateIntervalMinutes, string newsApiUrl, bool enableGammaBias, int biasUpdateIntervalSeconds)
		{
			return GammaSupabaseSender(Input, updateIntervalMinutes, supabaseUrl, supabaseServiceKey, referenceSymbol, enableNewsSync, newsUpdateIntervalMinutes, newsApiUrl, enableGammaBias, biasUpdateIntervalSeconds);
		}

		public GammaSupabaseSender GammaSupabaseSender(ISeries<double> input, int updateIntervalMinutes, string supabaseUrl, string supabaseServiceKey, string referenceSymbol, bool enableNewsSync, int newsUpdateIntervalMinutes, string newsApiUrl, bool enableGammaBias, int biasUpdateIntervalSeconds)
		{
			if (cacheGammaSupabaseSender != null)
				for (int idx = 0; idx < cacheGammaSupabaseSender.Length; idx++)
					if (cacheGammaSupabaseSender[idx] != null && cacheGammaSupabaseSender[idx].UpdateIntervalMinutes == updateIntervalMinutes && cacheGammaSupabaseSender[idx].SupabaseUrl == supabaseUrl && cacheGammaSupabaseSender[idx].SupabaseServiceKey == supabaseServiceKey && cacheGammaSupabaseSender[idx].ReferenceSymbol == referenceSymbol && cacheGammaSupabaseSender[idx].EnableNewsSync == enableNewsSync && cacheGammaSupabaseSender[idx].NewsUpdateIntervalMinutes == newsUpdateIntervalMinutes && cacheGammaSupabaseSender[idx].NewsApiUrl == newsApiUrl && cacheGammaSupabaseSender[idx].EnableGammaBias == enableGammaBias && cacheGammaSupabaseSender[idx].BiasUpdateIntervalSeconds == biasUpdateIntervalSeconds && cacheGammaSupabaseSender[idx].EqualsInput(input))
						return cacheGammaSupabaseSender[idx];
			return CacheIndicator<GammaSupabaseSender>(new GammaSupabaseSender(){ UpdateIntervalMinutes = updateIntervalMinutes, SupabaseUrl = supabaseUrl, SupabaseServiceKey = supabaseServiceKey, ReferenceSymbol = referenceSymbol, EnableNewsSync = enableNewsSync, NewsUpdateIntervalMinutes = newsUpdateIntervalMinutes, NewsApiUrl = newsApiUrl, EnableGammaBias = enableGammaBias, BiasUpdateIntervalSeconds = biasUpdateIntervalSeconds }, input, ref cacheGammaSupabaseSender);
		}
	}
}

namespace NinjaTrader.NinjaScript.MarketAnalyzerColumns
{
	public partial class MarketAnalyzerColumn : MarketAnalyzerColumnBase
	{
		public Indicators.GammaSupabaseSender GammaSupabaseSender(int updateIntervalMinutes, string supabaseUrl, string supabaseServiceKey, string referenceSymbol, bool enableNewsSync, int newsUpdateIntervalMinutes, string newsApiUrl, bool enableGammaBias, int biasUpdateIntervalSeconds)
		{
			return indicator.GammaSupabaseSender(Input, updateIntervalMinutes, supabaseUrl, supabaseServiceKey, referenceSymbol, enableNewsSync, newsUpdateIntervalMinutes, newsApiUrl, enableGammaBias, biasUpdateIntervalSeconds);
		}

		public Indicators.GammaSupabaseSender GammaSupabaseSender(ISeries<double> input , int updateIntervalMinutes, string supabaseUrl, string supabaseServiceKey, string referenceSymbol, bool enableNewsSync, int newsUpdateIntervalMinutes, string newsApiUrl, bool enableGammaBias, int biasUpdateIntervalSeconds)
		{
			return indicator.GammaSupabaseSender(input, updateIntervalMinutes, supabaseUrl, supabaseServiceKey, referenceSymbol, enableNewsSync, newsUpdateIntervalMinutes, newsApiUrl, enableGammaBias, biasUpdateIntervalSeconds);
		}
	}
}

namespace NinjaTrader.NinjaScript.Strategies
{
	public partial class Strategy : NinjaTrader.Gui.NinjaScript.StrategyRenderBase
	{
		public Indicators.GammaSupabaseSender GammaSupabaseSender(int updateIntervalMinutes, string supabaseUrl, string supabaseServiceKey, string referenceSymbol, bool enableNewsSync, int newsUpdateIntervalMinutes, string newsApiUrl, bool enableGammaBias, int biasUpdateIntervalSeconds)
		{
			return indicator.GammaSupabaseSender(Input, updateIntervalMinutes, supabaseUrl, supabaseServiceKey, referenceSymbol, enableNewsSync, newsUpdateIntervalMinutes, newsApiUrl, enableGammaBias, biasUpdateIntervalSeconds);
		}

		public Indicators.GammaSupabaseSender GammaSupabaseSender(ISeries<double> input , int updateIntervalMinutes, string supabaseUrl, string supabaseServiceKey, string referenceSymbol, bool enableNewsSync, int newsUpdateIntervalMinutes, string newsApiUrl, bool enableGammaBias, int biasUpdateIntervalSeconds)
		{
			return indicator.GammaSupabaseSender(input, updateIntervalMinutes, supabaseUrl, supabaseServiceKey, referenceSymbol, enableNewsSync, newsUpdateIntervalMinutes, newsApiUrl, enableGammaBias, biasUpdateIntervalSeconds);
		}
	}
}

#endregion

