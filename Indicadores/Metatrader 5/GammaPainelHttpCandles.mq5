//+------------------------------------------------------------------+
//|                                     GammaPainelHttpCandles.mq5   |
//|               VortexWeb — Coletor de Candles 1M & Tape Reading   |
//|               Compatível com MetaTrader 5 (MQL5)                |
//+------------------------------------------------------------------+
#property copyright   "VortexWeb"
#property link        "https://db.vemviraramesa.com.br"
#property version     "1.50"
#property description "Coleta e envia candles de 1min (painelvm_candles_1m) e metricas de Tape Reading / Fisica de Mercado (market_data) para o Supabase com correcao de WebRequest e lotes otimizados."

//--- Constantes de Modos
#define MODE_SUPABASE_ONLY 0
#define MODE_LOCAL_ONLY    1
#define MODE_BOTH          2

//+------------------------------------------------------------------+
//| INPUTS — CONFIGURAÇÕES GERAIS E SUPABASE                         |
//+------------------------------------------------------------------+
input group "=== 1. SUPABASE & INSTÂNCIA ==="
input string   InpSupabaseUrl          = "https://db.vemviraramesa.com.br"; // Supabase URL
input string   InpSupabaseApiKey       = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY"; // Supabase Service Role Key
input string   InpInstanceId           = "painel_principal";                // Instance ID (ex: painel_principal / nt8_main)
input string   InpReferenceSymbol      = "NQ";                              // Símbolo no Supabase (vazio = usa nome do gráfico)
input int      InpHoraAjuste           = -5;                                // Ajuste Fuso Horário em Horas (Broker -> Horário Local/Brasília)
input double   InpPriceOffset          = 0.0;                               // Fator de Correção de Preço (+/- pontos vs NinjaTrader)
input int      InpWebRequestTimeout    = 10000;                             // Timeout WebRequest (ms)

input group "=== 2. CANDLES 1 MINUTO ==="
input bool     InpEnableCandles        = true;                              // Habilitar Envio de Candles 1m
input int      InpDaysToLoad           = 30;                                // Dias de Histórico para Backfill Inicial
input int      InpCandleIntervalMs     = 500;                               // Intervalo Atualização Candle Formação (ms - recomendado: 500ms a 1000ms)

input group "=== 3. TAPE READING & BLOCK TRADES ==="
input bool     InpEnableMarketData     = true;                              // Habilitar Envio de Market Data / Tape Reading
input int      InpMarketDataIntervalMs = 1000;                              // Intervalo Envio Market Data (ms)
input int      InpLargeTradeThreshold  = 100;                               // Lote Grande Individual (Contratos Reais)
input bool     InpEnableBurstDetection = true;                              // Detectar Block Trades por Volume Rápido (CFD/Forex)
input int      InpBurstThreshold       = 25;                                // Limiar de Agressões/Volume em 2s para Block Trade
input bool     InpUseRealVolume        = true;                              // Usar Real Volume (se disponível na corretora)
input int      InpDataOutputMode       = MODE_SUPABASE_ONLY;                // Modo Saída: 0=Supabase, 1=Local, 2=Ambos
input string   InpLocalJsonPath        = "NinjaPanel_data.json";            // Nome do arquivo local em MQL5/Files

input group "=== 4. PAINEL VISUAL ==="
input bool     InpShowOnScreenPanel    = true;                              // Mostrar Dashboard no Gráfico

//+------------------------------------------------------------------+
//| ESTRUTURAS INTERNAS                                              |
//+------------------------------------------------------------------+
struct TradeInfo
{
   datetime time;
   double   price;
   long     volume;
   string   side;
};

//+------------------------------------------------------------------+
//| VARIÁVEIS GLOBAIS DE ESTADO E MONITORAMENTO                      |
//+------------------------------------------------------------------+
string   g_symbol               = "";
int      g_digits               = 2;
bool     g_isTimeframeValid     = true;
bool     g_historicalSent       = false;
datetime g_lastClosedCandleTime = 0;
datetime g_lastSentTime         = 0;
double   g_lastSentClose        = 0;
long     g_lastSentVol          = 0;

// Variáveis de Diagnóstico de Histórico
datetime g_histStartDate        = 0;
datetime g_histEndDate          = 0;
int      g_histDaysFound        = 0;
int      g_histTotalCandles     = 0;
string   g_histStatus           = "Pendente";

// Variáveis seguras de Tape Reading / Order Flow
double   g_safePrice            = 0;
long     g_safeBuyVol           = 0;
long     g_safeSellVol          = 0;
long     g_safeBuyPrints        = 0;
long     g_safeSellPrints       = 0;
double   g_safePrintRate        = 0;
double   g_safeZScore           = 0;
double   g_safeAtrRatio         = 0;
string   g_safeEstado           = "NORMAL";
double   g_safeDistSuporte      = 0;
double   g_safeDistResistencia  = 0;

// Trades Grandes e Burst Detector
int       g_largeTradeCount     = 0;
double    g_lastLargeTradePrice = 0;
string    g_lastLargeTradeSide  = "";
TradeInfo g_recentTrades[];

// Janela deslizante de burst rápido (2 segundos)
uint     g_burstWindowStartMs   = 0;
long     g_burstBuyVol          = 0;
long     g_burstSellVol         = 0;
int      g_burstPrints          = 0;

// Taxa de Prints por segundo
datetime g_lastPrintWindowTime  = 0;
int      g_printCountWindow     = 0;
datetime g_sessionDate          = 0;

// Controle de envio por timer
uint     g_lastCandleSendTick   = 0;
uint     g_lastMarketSendTick   = 0;
int      g_atrHandle            = INVALID_HANDLE;

// Estatísticas de Diagnóstico
int      g_httpCandleSuccess    = 0;
int      g_httpCandleErrors     = 0;
int      g_httpMarketSuccess    = 0;
int      g_httpMarketErrors     = 0;
string   g_lastHttpError        = "";

//+------------------------------------------------------------------+
//| FUNÇÃO AUXILIAR: FORMATAÇÃO DE FLOATS (PONTO DECIMAL)           |
//+------------------------------------------------------------------+
string F(double val, int decimals = 2)
{
   if(MathIsValidNumber(val) == false || val != val) return "0.00";
   return DoubleToString(val, decimals);
}

//+------------------------------------------------------------------+
//| AJUSTE DE DATA / HORA DO CANDLE (FUSO HORÁRIO)                   |
//+------------------------------------------------------------------+
string FormatIsoTimestamp(datetime dt, int horaAjuste)
{
   datetime adjusted = dt + (horaAjuste * 3600);
   MqlDateTime mdt;
   TimeToStruct(adjusted, mdt);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02d",
                       mdt.year, mdt.mon, mdt.day,
                       mdt.hour, mdt.min, mdt.sec);
}

//+------------------------------------------------------------------+
//| FORMATAR DATA SIMPLES YYYY-MM-DD                                 |
//+------------------------------------------------------------------+
string FormatDateOnly(datetime dt)
{
   if(dt <= 0) return "---";
   MqlDateTime mdt;
   TimeToStruct(dt, mdt);
   return StringFormat("%04d-%02d-%02d", mdt.year, mdt.mon, mdt.day);
}

//+------------------------------------------------------------------+
//| REGISTRAR BLOCK TRADE                                            |
//+------------------------------------------------------------------+
void RegisterBlockTrade(double price, long volume, string side, datetime tradeTime)
{
   g_largeTradeCount++;
   g_lastLargeTradePrice = price;
   g_lastLargeTradeSide  = side;

   int curSize = ArraySize(g_recentTrades);
   ArrayResize(g_recentTrades, curSize + 1);
   g_recentTrades[curSize].time   = tradeTime;
   g_recentTrades[curSize].price  = price;
   g_recentTrades[curSize].volume = volume;
   g_recentTrades[curSize].side   = side;

   if(ArraySize(g_recentTrades) > 50)
   {
      ArrayRemove(g_recentTrades, 0, 1);
   }
}

//+------------------------------------------------------------------+
//| VERIFICADOR DE BURST DE VOLUME RÁPIDO                            |
//+------------------------------------------------------------------+
void CheckBurstBlockTrade(double currentPrice, datetime currentTime)
{
   uint nowMs = GetTickCount();
   if(nowMs - g_burstWindowStartMs >= 2000)
   {
      long totalBurst = g_burstBuyVol + g_burstSellVol;
      if(InpEnableBurstDetection && totalBurst >= InpBurstThreshold)
      {
         string burstSide = (g_burstBuyVol >= g_burstSellVol) ? "COMPRA" : "VENDA";
         RegisterBlockTrade(currentPrice, totalBurst, burstSide, currentTime);
      }
      
      g_burstWindowStartMs = nowMs;
      g_burstBuyVol = 0;
      g_burstSellVol = 0;
      g_burstPrints = 0;
   }
}

//+------------------------------------------------------------------+
//| FUNÇÃO HTTP GENÉRICA VIA WEBREQUEST                              |
//+------------------------------------------------------------------+
bool HttpPostSupabase(const string endpoint, const string jsonPayload, string &responseOut, string &errorOut)
{
   string baseUrl = InpSupabaseUrl;
   StringTrimRight(baseUrl);
   StringTrimLeft(baseUrl);
   while(StringLen(baseUrl) > 0 && StringSubstr(baseUrl, StringLen(baseUrl) - 1, 1) == "/")
   {
      baseUrl = StringSubstr(baseUrl, 0, StringLen(baseUrl) - 1);
   }
   
   string url = baseUrl + endpoint;

   string headers = "Content-Type: application/json\r\n" +
                    "apikey: " + InpSupabaseApiKey + "\r\n" +
                    "Authorization: Bearer " + InpSupabaseApiKey + "\r\n" +
                    "Prefer: resolution=merge-duplicates,return=minimal\r\n";

   char postData[];
   char resultData[];
   string resultHeaders;

   int len = StringToCharArray(jsonPayload, postData);
   if(len > 0)
      ArrayResize(postData, len - 1);

   ResetLastError();
   int res = WebRequest("POST", url, headers, InpWebRequestTimeout, postData, resultData, resultHeaders);
   int err = GetLastError();

   if(ArraySize(resultData) > 0)
      responseOut = CharArrayToString(resultData);
   else
      responseOut = "";

   if(res == 200 || res == 201 || res == 204)
   {
      return true;
   }
   else
   {
      if(res == -1)
      {
         errorOut = StringFormat("Erro WebRequest %d (Verifique Tools > Options > Expert Advisors: %s)", err, baseUrl);
      }
      else
      {
         errorOut = StringFormat("HTTP %d: %s", res, StringSubstr(responseOut, 0, 100));
      }
      return false;
   }
}

//+------------------------------------------------------------------+
//| CONSTRUTOR DE JSON PARA CANDLE ÚNICO (COM FATOR DE CORREÇÃO)     |
//+------------------------------------------------------------------+
string BuildSingleCandleJson(datetime dt, double open, double high, double low, double close, long volume)
{
   string ts = FormatIsoTimestamp(dt, InpHoraAjuste);
   
   double adjOpen  = open  + InpPriceOffset;
   double adjHigh  = high  + InpPriceOffset;
   double adjLow   = low   + InpPriceOffset;
   double adjClose = close + InpPriceOffset;

   return StringFormat("{\"instance_id\":\"%s\",\"symbol\":\"%s\",\"timestamp\":\"%s\",\"open\":%s,\"high\":%s,\"low\":%s,\"close\":%s,\"volume\":%d}",
                       InpInstanceId,
                       g_symbol,
                       ts,
                       F(adjOpen, g_digits),
                       F(adjHigh, g_digits),
                       F(adjLow, g_digits),
                       F(adjClose, g_digits),
                       volume);
}

//+------------------------------------------------------------------+
//| AJUSTE DE APENAS HORA HH:MM:SS (FUSO HORÁRIO)                    |
//+------------------------------------------------------------------+
string FormatAdjustedTime(datetime dt, int horaAjuste)
{
   datetime adjusted = dt + (horaAjuste * 3600);
   MqlDateTime mdt;
   TimeToStruct(adjusted, mdt);
   return StringFormat("%02d:%02d:%02d", mdt.hour, mdt.min, mdt.sec);
}

//+------------------------------------------------------------------+
//| CONSTRUTOR DE JSON PARA MARKET DATA / TAPE READING               |
//+------------------------------------------------------------------+
string BuildMarketDataJson()
{
   long delta = g_safeBuyVol - g_safeSellVol;
   long totalVol = g_safeBuyVol + g_safeSellVol;
   double imbalancePct = totalVol > 0 ? ((double)delta / totalVol) * 100.0 : 0;
   double ratio = g_safeSellVol > 0 ? (double)g_safeBuyVol / g_safeSellVol : 1.0;
   
   string imbalanceDir = "NEUTRO";
   if(imbalancePct > 2.0)       imbalanceDir = "COMPRADOR";
   else if(imbalancePct < -2.0) imbalanceDir = "VENDEDOR";
   else if(imbalancePct > 0.5)  imbalanceDir = "LEVE_COMPRA";
   else if(imbalancePct < -0.5) imbalanceDir = "LEVE_VENDA";

   double deltaPct = totalVol > 0 ? ((double)g_safeBuyVol / totalVol) * 100.0 : 50.0;

   string tsStr = FormatAdjustedTime(TimeCurrent(), InpHoraAjuste);

   // JSON Recent Trades com ajuste de fuso horário
   string tradesJson = "[";
   int tradeCount = ArraySize(g_recentTrades);
   int startIdx = MathMax(0, tradeCount - 10);
   int added = 0;
   for(int i = startIdx; i < tradeCount; i++)
   {
      if(added > 0) tradesJson += ",";
      
      string timeStr = FormatAdjustedTime(g_recentTrades[i].time, InpHoraAjuste);

      tradesJson += StringFormat("{\"time\":\"%s\",\"price\":%s,\"volume\":%d,\"side\":\"%s\"}",
                                 timeStr,
                                 F(g_recentTrades[i].price, g_digits),
                                 g_recentTrades[i].volume,
                                 g_recentTrades[i].side);
      added++;
   }
   tradesJson += "]";

   string json = StringFormat(
      "{\"instance_id\":\"%s\",\"symbol\":\"%s\",\"ts\":\"%s\",\"price\":%s," +
      "\"buy_volume\":%d,\"sell_volume\":%d,\"total_volume\":%d,\"delta\":%d,\"delta_pct\":%s," +
      "\"ratio\":%s,\"imbalance_pct\":%s,\"imbalance_dir\":\"%s\",\"print_rate\":%s," +
      "\"buy_prints\":%d,\"sell_prints\":%d,\"large_trade_count\":%d,\"last_large_trade_price\":%s," +
      "\"last_large_trade_side\":\"%s\",\"recent_trades\":%s,\"zscore\":%s,\"atr_ratio\":%s," +
      "\"estado\":\"%s\",\"dist_suporte\":%s,\"dist_resistencia\":%s}",
      InpInstanceId,
      g_symbol,
      tsStr,
      F(g_safePrice, g_digits),
      g_safeBuyVol,
      g_safeSellVol,
      totalVol,
      delta,
      F(deltaPct, 2),
      F(ratio, 2),
      F(imbalancePct, 2),
      imbalanceDir,
      F(g_safePrintRate, 2),
      g_safeBuyPrints,
      g_safeSellPrints,
      g_largeTradeCount,
      F(g_lastLargeTradePrice, g_digits),
      g_lastLargeTradeSide,
      tradesJson,
      F(g_safeZScore, 2),
      F(g_safeAtrRatio, 2),
      g_safeEstado,
      F(g_safeDistSuporte, 2),
      F(g_safeDistResistencia, 2)
   );

   return json;
}

//+------------------------------------------------------------------+
//| GRAVAÇÃO DO JSON LOCAL                                           |
//+------------------------------------------------------------------+
void WriteLocalJson(string json)
{
   ResetLastError();
   int fileHandle = FileOpen(InpLocalJsonPath, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(fileHandle != INVALID_HANDLE)
   {
      FileWriteString(fileHandle, json);
      FileClose(fileHandle);
   }
}

//+------------------------------------------------------------------+
//| ENVIO DE BACKFILL HISTÓRICO DE CANDLES (LOTES DE 100 CANDLES)    |
//+------------------------------------------------------------------+
void SendHistoricalCandles()
{
   if(!g_isTimeframeValid) return;

   Print("[HISTORICO] 📊 Iniciando coleta de historico M1 (solicitados ", InpDaysToLoad, " dias)... Offset Preco: ", InpPriceOffset);
   g_histStatus = "Coletando dados...";

   datetime startTime = TimeCurrent() - (InpDaysToLoad * 86400);
   MqlRates rates[];
   ArraySetAsSeries(rates, false);

   int copied = CopyRates(_Symbol, PERIOD_M1, startTime, TimeCurrent(), rates);
   if(copied <= 0)
   {
      Print("[HISTORICO] ⚠️ Nenhum candle historico retornado pelo servidor.");
      g_histStatus = "Nenhum dado retornado";
      g_historicalSent = true;
      return;
   }

   g_histStartDate    = rates[0].time;
   g_histEndDate      = rates[copied - 1].time;
   g_histTotalCandles = copied;
   g_histDaysFound    = (int)MathMax(1, MathCeil((double)(g_histEndDate - g_histStartDate) / 86400.0));

   Print(StringFormat("[HISTORICO] 📅 Intervalo localizado: %s até %s (%d dias, %d candles M1)",
                      FormatDateOnly(g_histStartDate), FormatDateOnly(g_histEndDate), g_histDaysFound, copied));
   Print("[HISTORICO] Enviando em lotes otimizados de 100 candles para Supabase (resolution=merge-duplicates)...");

   int batchSize = 100;
   int totalBatches = (int)MathCeil((double)copied / batchSize);

   for(int b = 0; b < totalBatches; b++)
   {
      int start = b * batchSize;
      int count = MathMin(batchSize, copied - start);

      string batchJson = "[";
      for(int i = 0; i < count; i++)
      {
         int idx = start + i;
         if(i > 0) batchJson += ",";
         
         long vol = InpUseRealVolume && rates[idx].real_volume > 0 ? (long)rates[idx].real_volume : (long)rates[idx].tick_volume;
         batchJson += BuildSingleCandleJson(rates[idx].time, rates[idx].open, rates[idx].high, rates[idx].low, rates[idx].close, vol);
      }
      batchJson += "]";

      g_histStatus = StringFormat("Enviando %d/%d...", b + 1, totalBatches);
      if(InpShowOnScreenPanel) RenderDashboard();

      string resp, err;
      bool ok = HttpPostSupabase("/rest/v1/painelvm_candles_1m", batchJson, resp, err);
      if(ok)
      {
         g_httpCandleSuccess++;
         if((b + 1) % 10 == 0 || (b + 1) == totalBatches)
            Print(StringFormat("[HISTORICO] ✅ Progresso: %d/%d lotes enviados com sucesso (%d candles)", b + 1, totalBatches, count));
      }
      else
      {
         g_httpCandleErrors++;
         g_lastHttpError = err;
         Print(StringFormat("[HISTORICO] ❌ Erro no lote %d/%d: %s", b + 1, totalBatches, err));
      }
      Sleep(40);
   }

   g_historicalSent = true;
   g_histStatus = StringFormat("Concluido (%d lotes)", totalBatches);
   Print(StringFormat("[HISTORICO] ✅ Backfill finalizado: %d candles enviados (%d dias)", copied, g_histDaysFound));
}

//+------------------------------------------------------------------+
//| CÁLCULO DE FÍSICA / Z-SCORE E ESTADO DE MERCADO                  |
//+------------------------------------------------------------------+
void CalculatePhysics()
{
   int rocPeriod = 5;
   int histPeriod = 20;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, PERIOD_M1, 0, histPeriod + rocPeriod + 2, rates);
   if(copied < histPeriod + rocPeriod) return;

   double rocValues[];
   ArrayResize(rocValues, histPeriod);
   double sumRoc = 0;

   for(int i = 0; i < histPeriod; i++)
   {
      double roc = rates[i].close - rates[i + rocPeriod].close;
      rocValues[i] = roc;
      sumRoc += roc;
   }

   double currentRoc = rocValues[0];
   double meanRoc = sumRoc / histPeriod;

   double sumSq = 0;
   for(int i = 0; i < histPeriod; i++)
   {
      double diff = rocValues[i] - meanRoc;
      sumSq += (diff * diff);
   }
   double stdDev = MathSqrt(sumSq / histPeriod);

   g_safeZScore = (stdDev > 0) ? (currentRoc - meanRoc) / stdDev : 0.0;

   double atrBuf[];
   ArraySetAsSeries(atrBuf, true);
   if(g_atrHandle != INVALID_HANDLE && CopyBuffer(g_atrHandle, 0, 0, 1, atrBuf) > 0 && atrBuf[0] > 0)
   {
      double candleRange = rates[0].high - rates[0].low;
      g_safeAtrRatio = candleRange / atrBuf[0];
   }
   else
   {
      g_safeAtrRatio = 1.0;
   }

   if(MathAbs(g_safeZScore) > 2.0 && g_safeAtrRatio > 1.5)
      g_safeEstado = (g_safeZScore > 0) ? "EXPLOSAO_COMPRA" : "EXPLOSAO_VENDA";
   else if(MathAbs(g_safeZScore) > 2.0 && g_safeAtrRatio < 1.0)
      g_safeEstado = (g_safeZScore > 0) ? "EXAUSTAO_ALTA" : "EXAUSTAO_BAIXA";
   else if(MathAbs(g_safeZScore) < 0.5)
      g_safeEstado = "COMPRESSAO";
   else
      g_safeEstado = "NORMAL";
}

//+------------------------------------------------------------------+
//| RENDERIZADOR DO DASHBOARD NO GRÁFICO MT5                         |
//+------------------------------------------------------------------+
void RenderDashboard()
{
   if(!InpShowOnScreenPanel) return;

   if(!g_isTimeframeValid)
   {
      string blockText = "╔════════════════════════════════════════════════════════════╗\n";
      blockText += "║  ⚠️ BLOQUEIO CRÍTICO: O GRÁFICO DEVE SER DE 1 MINUTO (M1)! ║\n";
      blockText += "╠════════════════════════════════════════════════════════════╣\n";
      blockText += StringFormat("║  Timeframe Atual: %-40d ║\n", (int)_Period);
      blockText += "║  Transmissão de candles e Tape Reading BLOQUEADA.          ║\n";
      blockText += "║  Mude o gráfico para M1 para liberar o envio.              ║\n";
      blockText += "╚════════════════════════════════════════════════════════════╝";
      Comment(blockText);
      return;
   }

   long delta = g_safeBuyVol - g_safeSellVol;
   long totalVol = g_safeBuyVol + g_safeSellVol;
   double deltaPct = totalVol > 0 ? ((double)g_safeBuyVol / totalVol) * 100.0 : 50.0;

   string text = "╔════════════════════════════════════════════════════════════╗\n";
   text += "║  VORTEX WEB — TAPE READING & CANDLES M1 (MT5)            ║\n";
   text += "╠════════════════════════════════════════════════════════════╣\n";
   text += StringFormat("║  Ativo: %-12s | Instancia: %-15s | Supabase: %-4s ║\n", g_symbol, InpInstanceId, (InpDataOutputMode != MODE_LOCAL_ONLY ? "ATIVO" : "OFF"));
   text += StringFormat("║  Preço (c/ Offset): %-10s | Fator Correção: %-+7.2f  ║\n", F(g_safePrice, g_digits), InpPriceOffset);
   text += StringFormat("║  Estado Física: %-16s | Z-Score: %-6.2f          ║\n", g_safeEstado, g_safeZScore);
   text += StringFormat("║  Delta: %-12d (%-5.1f%% Compra) | Ratio: %-6.2f    ║\n", delta, deltaPct, (g_safeSellVol > 0 ? (double)g_safeBuyVol/g_safeSellVol : 1.0));
   text += StringFormat("║  Vol Compra: %-10d | Vol Venda: %-10d         ║\n", g_safeBuyVol, g_safeSellVol);
   text += StringFormat("║  Prints Compra: %-7d | Prints Venda: %-7d           ║\n", g_safeBuyPrints, g_safeSellPrints);
   text += StringFormat("║  Prints/Seg: %-9.2f | Block Trades: %-16d║\n", g_safePrintRate, g_largeTradeCount);
   text += "╠════════════════════════════════════════════════════════════╣\n";
   text += StringFormat("║  Hist. Configurado: %d dias | Hist. Localizado: %d dias   ║\n", InpDaysToLoad, g_histDaysFound);
   text += StringFormat("║  Candles no Backfill: %-6d | Status: %-21s ║\n", g_histTotalCandles, g_histStatus);
   text += StringFormat("║  Período Enviado: %s até %s           ║\n", FormatDateOnly(g_histStartDate), FormatDateOnly(g_histEndDate));
   text += "╠════════════════════════════════════════════════════════════╣\n";
   text += StringFormat("║  Candles HTTP: %d OK / %d Erros | Market HTTP: %d OK / %d Erros ║\n", g_httpCandleSuccess, g_httpCandleErrors, g_httpMarketSuccess, g_httpMarketErrors);
   if(g_lastHttpError != "")
      text += StringFormat("║  Último Erro: %-44s ║\n", StringSubstr(g_lastHttpError, 0, 44));
   text += "╚════════════════════════════════════════════════════════════╝";

   Comment(text);
}

//+------------------------------------------------------------------+
//| EXPERT INITIALIZATION FUNCTION                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   g_symbol = (InpReferenceSymbol != "") ? InpReferenceSymbol : _Symbol;
   g_digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);

   if(_Period != PERIOD_M1)
   {
      g_isTimeframeValid = false;
      Print(StringFormat("❌ [CONFIG] BLOQUEIO CRÍTICO: O gráfico está em %d minutos. O robô EXIGE 1 Minuto (M1). Transmissão TOTALMENTE BLOQUEADA.", (int)_Period));
   }
   else
   {
      g_isTimeframeValid = true;
      Print("✅ [CONFIG] Timeframe validado com sucesso: 1 Minuto (M1).");
   }

   Print("╔════════════════════════════════════════════════════════════╗");
   Print("║ [INIT] GammaPainelHttpCandles MT5 v1.50 INICIADO           ║");
   Print("║ Ativo Gráfico:     ", _Symbol, " | Ativo Enviado: ", g_symbol);
   Print("║ Instância ID:      ", InpInstanceId);
   Print("║ Supabase URL:      ", InpSupabaseUrl);
   Print("║ Fuso Ajuste:       ", InpHoraAjuste, "h");
   Print("║ Fator de Correção: ", InpPriceOffset, " pts");
   Print("║ Dias Solicitados:  ", InpDaysToLoad, " dias");
   Print("╚════════════════════════════════════════════════════════════╝");

   g_burstWindowStartMs = GetTickCount();
   g_atrHandle = iATR(_Symbol, PERIOD_M1, 14);
   g_lastPrintWindowTime = TimeCurrent();
   g_sessionDate = TimeCurrent() / 86400;
   g_lastClosedCandleTime = iTime(_Symbol, PERIOD_M1, 0);

   EventSetMillisecondTimer(50);

   if(g_isTimeframeValid && InpEnableCandles && InpDataOutputMode != MODE_LOCAL_ONLY)
   {
      SendHistoricalCandles();
   }

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| EXPERT DEINITIALIZATION FUNCTION                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   if(g_atrHandle != INVALID_HANDLE) IndicatorRelease(g_atrHandle);
   Comment("");
   Print("[DEINIT] GammaPainelHttpCandles MT5 finalizado.");
}

//+------------------------------------------------------------------+
//| EXPERT TICK FUNCTION (TAPE READING TICK-A-TICK)                  |
//+------------------------------------------------------------------+
void OnTick()
{
   if(!g_isTimeframeValid) return;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick)) return;

   double adjustedPrice = tick.last + InpPriceOffset;
   g_safePrice = adjustedPrice;

   datetime currentDay = tick.time / 86400;
   if(currentDay != g_sessionDate)
   {
      g_sessionDate = currentDay;
      g_safeBuyVol = 0;
      g_safeSellVol = 0;
      g_safeBuyPrints = 0;
      g_safeSellPrints = 0;
      g_largeTradeCount = 0;
      ArrayResize(g_recentTrades, 0);
   }

   long vol = (InpUseRealVolume && tick.volume_real > 0) ? (long)tick.volume_real : (long)tick.volume;
   if(vol <= 0) vol = 1;

   g_printCountWindow++;
   g_burstPrints++;

   string side = "COMPRA";
   if((tick.flags & TICK_FLAG_BUY) != 0)
   {
      g_safeBuyVol += vol;
      g_safeBuyPrints++;
      g_burstBuyVol += vol;
      side = "COMPRA";
   }
   else if((tick.flags & TICK_FLAG_SELL) != 0)
   {
      g_safeSellVol += vol;
      g_safeSellPrints++;
      g_burstSellVol += vol;
      side = "VENDA";
   }
   else
   {
       if(tick.ask > 0 && tick.last >= tick.ask)
       {
          g_safeBuyVol += vol;
          g_safeBuyPrints++;
          g_burstBuyVol += vol;
          side = "COMPRA";
       }
       else if(tick.bid > 0 && tick.last <= tick.bid)
       {
          g_safeSellVol += vol;
          g_safeSellPrints++;
          g_burstSellVol += vol;
          side = "VENDA";
       }
       else
       {
          side = (tick.last >= (tick.ask + tick.bid)/2.0) ? "COMPRA" : "VENDA";
          if(side == "COMPRA")
          {
             g_safeBuyVol += vol;
             g_safeBuyPrints++;
             g_burstBuyVol += vol;
          }
          else
          {
             g_safeSellVol += vol;
             g_safeSellPrints++;
             g_burstSellVol += vol;
          }
       }
   }

   if(vol >= InpLargeTradeThreshold)
   {
      RegisterBlockTrade(adjustedPrice, vol, side, TimeCurrent());
   }

   CheckBurstBlockTrade(adjustedPrice, TimeCurrent());

   datetime now = TimeCurrent();
   double elapsed = (double)(now - g_lastPrintWindowTime);
   if(elapsed >= 1.0)
   {
      g_safePrintRate = (double)g_printCountWindow / elapsed;
      g_printCountWindow = 0;
      g_lastPrintWindowTime = now;
   }
}

//+------------------------------------------------------------------+
//| EXPERT TIMER FUNCTION (ENVIO ASSÍNCRONO HTTP & CONTROLE)         |
//+------------------------------------------------------------------+
void OnTimer()
{
   uint nowTick = GetTickCount();

   if(_Period != PERIOD_M1)
   {
      g_isTimeframeValid = false;
      RenderDashboard();
      return;
   }
   else
   {
      g_isTimeframeValid = true;
   }

   // 1. ATUALIZAÇÃO E ENVIO DE CANDLES 1 MINUTO
   if(InpEnableCandles)
   {
      datetime currentBarTime = iTime(_Symbol, PERIOD_M1, 0);

      // A. Detecção de Candle Fechado
      if(currentBarTime > g_lastClosedCandleTime && g_lastClosedCandleTime > 0)
      {
         MqlRates closedRates[];
         ArraySetAsSeries(closedRates, true);
         if(CopyRates(_Symbol, PERIOD_M1, 1, 1, closedRates) > 0)
         {
            long vol = (InpUseRealVolume && closedRates[0].real_volume > 0) ? (long)closedRates[0].real_volume : (long)closedRates[0].tick_volume;
            string closedJson = "[" + BuildSingleCandleJson(closedRates[0].time, closedRates[0].open, closedRates[0].high, closedRates[0].low, closedRates[0].close, vol) + "]";
            
            if(InpDataOutputMode != MODE_LOCAL_ONLY)
            {
               string resp, err;
               if(HttpPostSupabase("/rest/v1/painelvm_candles_1m", closedJson, resp, err))
                  g_httpCandleSuccess++;
               else
               {
                  g_httpCandleErrors++;
                  g_lastHttpError = err;
               }
            }
         }
         g_lastClosedCandleTime = currentBarTime;
      }

      // B. Atualização do Candle Corrente em Formação
      if(nowTick - g_lastCandleSendTick >= (uint)InpCandleIntervalMs)
      {
         g_lastCandleSendTick = nowTick;

         MqlRates currentRates[];
         ArraySetAsSeries(currentRates, true);
         if(CopyRates(_Symbol, PERIOD_M1, 0, 1, currentRates) > 0)
         {
            long currentVol = (InpUseRealVolume && currentRates[0].real_volume > 0) ? (long)currentRates[0].real_volume : (long)currentRates[0].tick_volume;
            
            double adjCurrClose = currentRates[0].close + InpPriceOffset;
            if(adjCurrClose != g_lastSentClose || currentVol != g_lastSentVol || currentRates[0].time != g_lastSentTime)
            {
               string currJson = "[" + BuildSingleCandleJson(currentRates[0].time, currentRates[0].open, currentRates[0].high, currentRates[0].low, currentRates[0].close, currentVol) + "]";
               
               if(InpDataOutputMode != MODE_LOCAL_ONLY)
               {
                  string resp, err;
                  if(HttpPostSupabase("/rest/v1/painelvm_candles_1m", currJson, resp, err))
                     g_httpCandleSuccess++;
                  else
                  {
                     g_httpCandleErrors++;
                     g_lastHttpError = err;
                  }
               }

               g_lastSentClose = adjCurrClose;
               g_lastSentVol = currentVol;
               g_lastSentTime = currentRates[0].time;
            }
         }
      }
   }

   // 2. ATUALIZAÇÃO E ENVIO DE MARKET DATA / TAPE READING
   if(InpEnableMarketData)
   {
      if(nowTick - g_lastMarketSendTick >= (uint)InpMarketDataIntervalMs)
      {
         g_lastMarketSendTick = nowTick;

         CalculatePhysics();
         string marketJson = BuildMarketDataJson();

         if(InpDataOutputMode == MODE_LOCAL_ONLY || InpDataOutputMode == MODE_BOTH)
         {
            WriteLocalJson(marketJson);
         }

         if(InpDataOutputMode == MODE_SUPABASE_ONLY || InpDataOutputMode == MODE_BOTH)
         {
            string payload = "[" + marketJson + "]";
            string resp, err;
            if(HttpPostSupabase("/rest/v1/market_data?on_conflict=instance_id", payload, resp, err))
               g_httpMarketSuccess++;
            else
            {
               g_httpMarketErrors++;
               g_lastHttpError = err;
            }
         }
      }
   }

   // 3. ATUALIZAÇÃO DO DASHBOARD VISUAL
   RenderDashboard();
}
//+------------------------------------------------------------------+
