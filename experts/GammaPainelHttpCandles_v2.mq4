//+------------------------------------------------------------------+
//|                                  GammaPainelHttpCandles_v2.mq4   |
//|               VortexWeb — Coletor de Candles 1M & Market Data v2 |
//|               Compatível com MetaTrader 4 (MQL4 EA)              |
//|                                                                  |
//| NOTA: Deve ser instalado em MQL4/Experts (como EA) para ter      |
//| permissão de WebRequest HTTP. Habilite as URLs em:               |
//| Tools > Options > Expert Advisors > Allow WebRequest.            |
//| (Adicione https://db.vemviraramesa.com.br e http://127.0.0.1:8080)|
//+------------------------------------------------------------------+
#property copyright   "VortexWeb"
#property link        "https://db.vemviraramesa.com.br"
#property version     "2.00"
#property description "V2 OTIMIZADA: Envia Market Data (Tape Reading) e Candles M1 em tempo real. Salva automaticamente candles fechados no Supabase e suporta Streaming via WebSocket Hub Local."
#property strict

//--- Modos de Destino de Dados
#define DEST_SUPABASE_ONLY 0
#define DEST_LOCAL_HUB     1
#define DEST_DUAL_STREAM   2

//+------------------------------------------------------------------+
//| INPUTS — CONFIGURAÇÕES GERAIS E CONEXÃO                          |
//+------------------------------------------------------------------+
extern string   Group_1                 = "=== 1. DESTINO E CONEXAO ===";
extern int      InpDestinationMode      = DEST_SUPABASE_ONLY;                // 0=Supabase Direto (Padrao), 1=Hub Local WS, 2=Dual (Live no Hub + Fechamento no Supabase)
extern string   InpLocalHubUrl          = "http://127.0.0.1";                // URL do Relay WebSocket Hub Local (Porta 80 Padrao)
extern string   InpSupabaseUrl          = "https://db.vemviraramesa.com.br"; // Supabase URL
extern string   InpSupabaseApiKey       = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY"; // Supabase Key
extern string   InpInstanceId           = "painel_principal";                // Instance ID (ex: painel_principal / nt8_main)
extern string   InpReferenceSymbol      = "NQ";                              // Simbolo de Referencia (ex: NQ, ES, GC)
extern int      InpHoraAjuste           = -5;                                // Ajuste Fuso Horario em Horas (Corretora -> Horario Local)
extern double   InpPriceOffset          = 0.0;                               // Fator de Correcao de Preco (+/- pontos)
extern int      InpWebRequestTimeout    = 2500;                              // Timeout WebRequest (ms - otimizado para nao travar)

extern string   Group_2                 = "=== 2. CANDLES M1 & FECHAMENTO ===";
extern bool     InpEnableCandles        = true;                              // Habilitar Transmissao de Candles M1
extern bool     InpAutoSaveClosedToDb   = true;                              // Salvar Candle Fechado M1 Automaticamente no Supabase
extern int      InpDaysToLoad           = 15;                                // Dias de Historico para Backfill Inicial
extern int      InpLiveCandleIntervalMs = 250;                               // Intervalo Envio Candle Formacao (ms)

extern string   Group_3                 = "=== 3. MARKET DATA & ORDER FLOW ===";
extern bool     InpEnableMarketData     = true;                              // Habilitar Envio de Market Data / Tape Reading
extern int      InpMarketDataIntervalMs = 250;                               // Intervalo Envio Market Data (ms)
extern int      InpLargeTradeThreshold  = 100;                               // Limiar Trade Grande (Contratos)
extern bool     InpEnableBurstDetection = true;                              // Detectar Block Trades por Volume Rapido
extern int      InpBurstThreshold       = 25;                                // Limiar de Agressao em 2s para Block Trade
extern string   InpLocalJsonPath        = "NinjaPanel_data.json";            // Arquivo local em MQL4/Files

extern string   Group_4                 = "=== 4. DASHBOARD VISUAL ===";
extern bool     InpShowOnScreenPanel    = true;                              // Mostrar Dashboard no Grafico

extern string   Group_5                 = "=== 5. FOOTPRINT & CLUSTERS INTRA-CANDLE ===";
extern bool     InpEnableClusters       = true;                              // Habilitar Coleta de Footprint / Clusters M1
extern double   InpClusterTickSize      = 0.0;                               // Tick Size para Agrupamento (0.0 = Automatico da Corretora)
extern int      InpMaxClusterLevels     = 250;                               // Limite Maximo de Niveis de Preco por Candle
extern bool     InpSaveClustersToDb     = false;                             // Salvar Clusters no Supabase (Ativar APOS rodar ALTER TABLE)

//+------------------------------------------------------------------+
//| ESTRUTURAS E ESTADO                                              |
//+------------------------------------------------------------------+
struct TradeInfo
{
   datetime time;
   double   price;
   long     volume;
   string   side;
};

struct PriceCluster
{
   double price;
   long   bidVol;
   long   askVol;
};

string   g_symbol               = "";
int      g_digits               = 2;
bool     g_isTimeframeValid     = true;
bool     g_historicalSent       = false;
datetime g_lastBarTime          = 0;
datetime g_lastSentTime         = 0;
double   g_lastSentClose        = 0;
long     g_lastSentVol          = 0;

// Clusters Intra-Candle (Footprint)
PriceCluster g_barClusters[];
int          g_clusterTotalLevels     = 0;
double       g_clusterPocPrice        = 0;
long         g_clusterPocBid          = 0;
long         g_clusterPocAsk          = 0;
string       g_lastClosedClustersJson = "[]";

// Variaveis de Diagnostico
int      g_histTotalCandles     = 0;
string   g_histStatus           = "Pendente";
uint     g_lastCandleSendTick   = 0;
uint     g_lastMarketSendTick   = 0;
int      g_sendSuccessCount     = 0;
int      g_sendErrorCount       = 0;
string   g_lastErrorMsg         = "";
ulong    g_lastLatencyMs        = 0;

// Tape Reading
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

int       g_largeTradeCount     = 0;
double    g_lastLargeTradePrice = 0;
string    g_lastLargeTradeSide  = "";
TradeInfo g_recentTrades[];

uint     g_burstWindowStartMs   = 0;
long     g_burstBuyVol          = 0;
long     g_burstSellVol         = 0;
int      g_burstPrints          = 0;

datetime g_lastPrintWindowTime  = 0;
int      g_printCountWindow     = 0;
datetime g_sessionDate          = 0;
double   g_lastTickPrice        = 0;
double   g_lastBid              = 0;
double   g_lastAsk              = 0;
string   g_lastSide             = "COMPRA";
long     g_lastBarVolume        = 0;

//+------------------------------------------------------------------+
//| HELPERS                                                          |
//+------------------------------------------------------------------+
string F(double val, int decimals = 2)
{
   if(val != val) return "0.00";
   return DoubleToStr(val, decimals);
}

string FormatIsoTimestamp(datetime dt, int horaAjuste)
{
   datetime adjusted = dt + (horaAjuste * 3600);
   MqlDateTime mdt;
   TimeToStruct(adjusted, mdt);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02d-03:00",
                       mdt.year, mdt.mon, mdt.day,
                       mdt.hour, mdt.min, mdt.sec);
}

string FormatAdjustedTime(datetime dt, int horaAjuste)
{
   datetime adjusted = dt + (horaAjuste * 3600);
   MqlDateTime mdt;
   TimeToStruct(adjusted, mdt);
   return StringFormat("%02d:%02d:%02d", mdt.hour, mdt.min, mdt.sec);
}

//+------------------------------------------------------------------+
//| HTTP POST GENERICO OTIMIZADO                                     |
//+------------------------------------------------------------------+
bool HttpPost(const string targetUrl, const string jsonPayload, bool isSupabase, string &responseOut, string &errorOut)
{
   string headers = "Content-Type: application/json\r\n";
   if(isSupabase)
   {
      headers += "apikey: " + InpSupabaseApiKey + "\r\n" +
                 "Authorization: Bearer " + InpSupabaseApiKey + "\r\n" +
                 "Prefer: resolution=merge-duplicates,return=minimal\r\n";
   }

   char postData[];
   char resultData[];
   string resultHeaders;

   int len = StringToCharArray(jsonPayload, postData);
   if(len > 0) ArrayResize(postData, len - 1);

   uint tStart = GetTickCount();
   ResetLastError();
   int res = WebRequest("POST", targetUrl, headers, InpWebRequestTimeout, postData, resultData, resultHeaders);
   int err = GetLastError();
   g_lastLatencyMs = GetTickCount() - tStart;

   if(ArraySize(resultData) > 0)
      responseOut = CharArrayToString(resultData);
   else
      responseOut = "";

   if(res == 200 || res == 201 || res == 204)
   {
      g_sendSuccessCount++;
      return true;
   }
   else
   {
      g_sendErrorCount++;
      if(res == -1)
         errorOut = StringFormat("Err %d (URL permitida em Tools > Options?)", err);
      else
         errorOut = StringFormat("HTTP %d", res);
      g_lastErrorMsg = errorOut;
      return false;
   }
}

//+------------------------------------------------------------------+
//| ESTRUTURA E GERENCIAMENTO DE CLUSTERS INTRA-CANDLE (FOOTPRINT)   |
//+------------------------------------------------------------------+
void AddClusterTick(double price, long vol, string side)
{
   if(price <= 0.0 || vol <= 0) return;

   int size = ArraySize(g_barClusters);
   int targetIdx = -1;

   for(int i = 0; i < size; i++)
   {
      if(MathAbs(g_barClusters[i].price - price) < (Point * 0.5))
      {
         targetIdx = i;
         break;
      }
   }

   if(targetIdx < 0)
   {
      if(size >= InpMaxClusterLevels) return; // Protecao de memoria
      targetIdx = size;
      ArrayResize(g_barClusters, size + 1);
      g_barClusters[targetIdx].price = price;
      g_barClusters[targetIdx].bidVol = 0;
      g_barClusters[targetIdx].askVol = 0;
      g_clusterTotalLevels = size + 1;
   }

   if(side == "COMPRA")
      g_barClusters[targetIdx].askVol += vol;
   else
      g_barClusters[targetIdx].bidVol += vol;

   long levelTot = g_barClusters[targetIdx].bidVol + g_barClusters[targetIdx].askVol;
   long currentPocTot = g_clusterPocBid + g_clusterPocAsk;
   if(levelTot > currentPocTot)
   {
      g_clusterPocPrice = price;
      g_clusterPocBid = g_barClusters[targetIdx].bidVol;
      g_clusterPocAsk = g_barClusters[targetIdx].askVol;
   }
}

string BuildClustersJson(PriceCluster &clusters[])
{
   int count = ArraySize(clusters);
   if(count <= 0) return "[]";

   // Ordenacao rapida por preco crescente (Bubble sort para arrays pequenos de 10-250 itens)
   for(int i = 0; i < count - 1; i++)
   {
      for(int j = 0; j < count - i - 1; j++)
      {
         if(clusters[j].price > clusters[j + 1].price)
         {
            PriceCluster temp = clusters[j];
            clusters[j] = clusters[j + 1];
            clusters[j + 1] = temp;
         }
      }
   }

   string json = "[";
   for(int k = 0; k < count; k++)
   {
      if(k > 0) json += ",";
      json += StringFormat("{\"p\":%s,\"b\":%d,\"a\":%d}",
                           F(clusters[k].price, g_digits),
                           clusters[k].bidVol,
                           clusters[k].askVol);
   }
   json += "]";
   return json;
}

string BuildClustersBarFullJson()
{
   datetime cTime = iTime(NULL, PERIOD_M1, 0);
   datetime endDt = cTime + 60;
   string ts = FormatIsoTimestamp(endDt, InpHoraAjuste);
   string currClusters = BuildClustersJson(g_barClusters);

   return StringFormat("{\"instance_id\":\"%s\",\"symbol\":\"%s\",\"timestamp\":\"%s\",\"levels\":%d,\"poc\":{\"price\":%s,\"bid\":%d,\"ask\":%d},\"clusters\":%s,\"closed_clusters\":%s}",
                       InpInstanceId,
                       g_symbol,
                       ts,
                       g_clusterTotalLevels,
                       F(g_clusterPocPrice, g_digits),
                       g_clusterPocBid,
                       g_clusterPocAsk,
                       currClusters,
                       g_lastClosedClustersJson);
}

void WriteClustersJson(string clustersJson)
{
   ResetLastError();
   int fileHandle = FileOpen("NinjaPanel_clusters.json", FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(fileHandle != INVALID_HANDLE)
   {
      FileWriteString(fileHandle, clustersJson);
      FileClose(fileHandle);
   }
}

//+------------------------------------------------------------------+
//| CONSTRUTOR DE JSON PARA CANDLE UNICO                             |
//+------------------------------------------------------------------+
string BuildSingleCandleJson(datetime dt, double open, double high, double low, double close, long volume, string clustersJson = "")
{
   // Ajusta para o horário de fechamento do candle M1 (Padrão Vortex / NinjaTrader)
   datetime endDt = dt + 60;
   string ts = FormatIsoTimestamp(endDt, InpHoraAjuste);
   double adjOpen  = open  + InpPriceOffset;
   double adjHigh  = high  + InpPriceOffset;
   double adjLow   = low   + InpPriceOffset;
   double adjClose = close + InpPriceOffset;

   if(clustersJson != "" && clustersJson != "[]")
   {
      return StringFormat("{\"instance_id\":\"%s\",\"symbol\":\"%s\",\"timestamp\":\"%s\",\"open\":%s,\"high\":%s,\"low\":%s,\"close\":%s,\"volume\":%d,\"clusters\":%s}",
                          InpInstanceId,
                          g_symbol,
                          ts,
                          F(adjOpen, g_digits),
                          F(adjHigh, g_digits),
                          F(adjLow, g_digits),
                          F(adjClose, g_digits),
                          volume,
                          clustersJson);
   }

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
//| CONSTRUTOR DE JSON PARA MARKET DATA / TAPE READING               |
//+------------------------------------------------------------------+
string BuildMarketDataJson(bool includeClusters = false)
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

   if(includeClusters && InpEnableClusters)
   {
      string currClustersJson = BuildClustersJson(g_barClusters);
      if(StringSubstr(json, StringLen(json) - 1, 1) == "}")
      {
         json = StringSubstr(json, 0, StringLen(json) - 1);
         json += StringFormat(",\"clusters\":%s,\"closed_clusters\":%s,\"poc\":{\"price\":%s,\"bid\":%d,\"ask\":%d}}",
                              currClustersJson,
                              g_lastClosedClustersJson,
                              F(g_clusterPocPrice, g_digits),
                              g_clusterPocBid,
                              g_clusterPocAsk);
      }
   }

   return json;
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
      for(int i = 0; i < ArraySize(g_recentTrades) - 1; i++)
         g_recentTrades[i] = g_recentTrades[i + 1];
      ArrayResize(g_recentTrades, ArraySize(g_recentTrades) - 1);
   }
}

//+------------------------------------------------------------------+
//| VERIFICADOR DE BURST DE VOLUME RAPIDO (BLOCK TRADES)             |
//+------------------------------------------------------------------+
void CheckBurstBlockTrade(double currentPrice, datetime currentTime)
{
   uint nowMs = GetTickCount();
   if(nowMs - g_burstWindowStartMs >= 2000)
   {
      long totalBurst = g_burstBuyVol + g_burstSellVol;
      if(InpEnableBurstDetection && totalBurst >= InpBurstThreshold)
      {
         string burstSide = "COMPRA";
         if(g_burstBuyVol > g_burstSellVol)
            burstSide = "COMPRA";
         else if(g_burstSellVol > g_burstBuyVol)
            burstSide = "VENDA";
         else
            burstSide = g_lastSide;

         RegisterBlockTrade(currentPrice, totalBurst, burstSide, currentTime);
      }
      
      g_burstWindowStartMs = nowMs;
      g_burstBuyVol = 0;
      g_burstSellVol = 0;
      g_burstPrints = 0;
   }
}

//+------------------------------------------------------------------+
//| CALCULO DE FISICA / Z-SCORE E ESTADO DE MERCADO                  |
//+------------------------------------------------------------------+
void CalculatePhysics()
{
   int rocPeriod = 5;
   int histPeriod = 20;
   int totalBars = iBars(NULL, PERIOD_M1);
   if(totalBars < histPeriod + rocPeriod + 2) return;

   double rocValues[];
   ArrayResize(rocValues, histPeriod);
   double sumRoc = 0;

   for(int i = 0; i < histPeriod; i++)
   {
      double c0 = iClose(NULL, PERIOD_M1, i);
      double cRoc = iClose(NULL, PERIOD_M1, i + rocPeriod);
      double roc = c0 - cRoc;
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

   double atr = iATR(NULL, PERIOD_M1, 14, 0);
   if(atr > 0)
   {
      double candleRange = iHigh(NULL, PERIOD_M1, 0) - iLow(NULL, PERIOD_M1, 0);
      g_safeAtrRatio = candleRange / atr;
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
//| FORCAR CARREGAMENTO DE HISTORICO M1 NO TERMINAL MT4              |
//+------------------------------------------------------------------+
void ForceLoadM1History(datetime cutoffTime)
{
   int attempts = 0;
   int prevBars = 0;
   
   while(attempts < 10)
   {
      int curBars = iBars(NULL, PERIOD_M1);
      if(curBars <= 0) break;
      
      datetime oldestTime = iTime(NULL, PERIOD_M1, curBars - 1);
      if(oldestTime <= cutoffTime)
      {
         break;
      }
      
      if(curBars == prevBars)
      {
         break;
      }
      
      prevBars = curBars;
      datetime reqTime = iTime(NULL, PERIOD_M1, curBars + 2000);
      Sleep(100);
      attempts++;
   }
}

//+------------------------------------------------------------------+
//| ENVIO DE BACKFILL HISTORICO DE CANDLES (LOTES DE 100 CANDLES)    |
//+------------------------------------------------------------------+
void SendHistoricalCandles()
{
   if(Period() != PERIOD_M1) return;

   Print("[HISTORICO] 📊 Iniciando coleta de historico M1 (solicitados ", InpDaysToLoad, " dias)... Offset Preco: ", InpPriceOffset);
   g_histStatus = "Coletando dados...";

   datetime cutoffTime = TimeCurrent() - (InpDaysToLoad * 86400);
   ForceLoadM1History(cutoffTime);

   int totalBars = iBars(NULL, PERIOD_M1);
   if(totalBars <= 0)
   {
      Print("[HISTORICO] ⚠️ Nenhum candle historico encontrado no terminal.");
      g_histStatus = "Nenhum dado encontrado";
      g_historicalSent = true;
      return;
   }

   int count = 0;
   datetime firstCandleTime = 0;
   datetime lastCandleTime = 0;

   for(int i = 1; i < totalBars; i++)
   {
      datetime t = iTime(NULL, PERIOD_M1, i);
      if(t < cutoffTime) break;
      
      if(count == 0) lastCandleTime = t;
      firstCandleTime = t;
      count++;
   }

   if(count == 0)
   {
      Print("[HISTORICO] ⚠️ Nenhum candle dentro do periodo solicitado.");
      g_histStatus = "Nenhum candle no periodo";
      g_historicalSent = true;
      return;
   }

   g_histTotalCandles = count;
   int daysFound = (int)MathMax(1, MathCeil((double)(lastCandleTime - firstCandleTime) / 86400.0));

   Print(StringFormat("[HISTORICO] 📅 Intervalo localizado: %s até %s (%d dias, %d candles M1)",
                      TimeToStr(firstCandleTime, TIME_DATE), TimeToStr(lastCandleTime, TIME_DATE), daysFound, count));
   Print("[HISTORICO] Enviando em lotes otimizados de 100 candles para Supabase (resolution=merge-duplicates)...");

   string baseUrl = InpSupabaseUrl;
   StringTrimRight(baseUrl);
   while(StringLen(baseUrl) > 0 && StringSubstr(baseUrl, StringLen(baseUrl) - 1, 1) == "/")
      baseUrl = StringSubstr(baseUrl, 0, StringLen(baseUrl) - 1);
   string url = baseUrl + "/rest/v1/painelvm_candles_1m";

   int batchSize = 100;
   int totalBatches = (int)MathCeil((double)count / batchSize);

   for(int b = 0; b < totalBatches; b++)
   {
      int startOffset = count - (b * batchSize);
      int endOffset = MathMax(1, count - ((b + 1) * batchSize) + 1);

      string batchJson = "[";
      int items = 0;
      for(int shift = startOffset; shift >= endOffset; shift--)
      {
         if(items > 0) batchJson += ",";
         datetime bt = iTime(NULL, PERIOD_M1, shift);
         double bo = iOpen(NULL, PERIOD_M1, shift);
         double bh = iHigh(NULL, PERIOD_M1, shift);
         double bl = iLow(NULL, PERIOD_M1, shift);
         double bc = iClose(NULL, PERIOD_M1, shift);
         long bv = (long)iVolume(NULL, PERIOD_M1, shift);

         batchJson += BuildSingleCandleJson(bt, bo, bh, bl, bc, bv);
         items++;
      }
      batchJson += "]";

      g_histStatus = StringFormat("Enviando %d/%d...", b + 1, totalBatches);
      UpdateDashboard();

      string resp, err;
      bool ok = HttpPost(url, batchJson, true, resp, err);
      if(ok)
      {
         if((b + 1) % 10 == 0 || (b + 1) == totalBatches)
            Print(StringFormat("[HISTORICO] ✅ Progresso: %d/%d lotes enviados com sucesso (%d candles)", b + 1, totalBatches, count));
      }
      else
      {
         Print(StringFormat("[HISTORICO] ❌ Erro no lote %d/%d: %s", b + 1, totalBatches, err));
      }
      Sleep(40);
   }

   g_historicalSent = true;
   g_histStatus = StringFormat("Concluido (%d lotes)", totalBatches);
   Print(StringFormat("[HISTORICO] ✅ Backfill finalizado: %d candles enviados (%d dias)", count, daysFound));
}

//+------------------------------------------------------------------+
//| SALVAR CANDLE FECHADO NO SUPABASE                                |
//+------------------------------------------------------------------+
void SaveClosedCandleToSupabase(datetime barTime, double open, double high, double low, double close, long volume, string clustersJson = "")
{
   string singleJson = BuildSingleCandleJson(barTime, open, high, low, close, volume, clustersJson);
   string payload = "[" + singleJson + "]";
   
   string baseUrl = InpSupabaseUrl;
   StringTrimRight(baseUrl);
   while(StringLen(baseUrl) > 0 && StringSubstr(baseUrl, StringLen(baseUrl) - 1, 1) == "/")
      baseUrl = StringSubstr(baseUrl, 0, StringLen(baseUrl) - 1);

   string url = baseUrl + "/rest/v1/painelvm_candles_1m";
   string resp, err;
   bool ok = HttpPost(url, payload, true, resp, err);
   if(ok)
   {
      Print(StringFormat("[CANDLE M1 FECHADO] ✅ Candle %s salvo com sucesso no Supabase.", TimeToStr(barTime)));
   }
   else
   {
      Print(StringFormat("[CANDLE M1 FECHADO] ❌ Erro ao salvar candle fechado: %s", err));
   }
}

//+------------------------------------------------------------------+
//| ENVIO EM TEMPO REAL                                              |
//+------------------------------------------------------------------+
void SendRealtimeData()
{
   uint nowMs = GetTickCount();

   // 1. Enviar Market Data (Tape Reading)
   if(InpEnableMarketData && (nowMs - g_lastMarketSendTick >= (uint)InpMarketDataIntervalMs))
   {
      g_lastMarketSendTick = nowMs;
      CalculatePhysics();
      string mJsonSupabase = BuildMarketDataJson(false); // Rigorosamente sem campos extras para o Supabase
      string mJsonHub      = BuildMarketDataJson(true);  // Completo com clusters para Hub Local e arquivo

      // Gravação local em arquivo em MQL4/Files
      WriteLocalJson(mJsonHub);
      if(InpEnableClusters)
      {
         WriteClustersJson(BuildClustersBarFullJson());
      }

      // Se configurado para Hub Local ou Dual
      if(InpDestinationMode == DEST_LOCAL_HUB || InpDestinationMode == DEST_DUAL_STREAM)
      {
         string resp, err;
         HttpPost(InpLocalHubUrl + "/market_data", mJsonHub, false, resp, err);
      }
      
      // Se configurado para Supabase Direto
      if(InpDestinationMode == DEST_SUPABASE_ONLY)
      {
         string baseUrl = InpSupabaseUrl;
         StringTrimRight(baseUrl);
         while(StringLen(baseUrl) > 0 && StringSubstr(baseUrl, StringLen(baseUrl) - 1, 1) == "/")
            baseUrl = StringSubstr(baseUrl, 0, StringLen(baseUrl) - 1);
         string url = baseUrl + "/rest/v1/market_data";
         string resp, err;
         HttpPost(url, "[" + mJsonSupabase + "]", true, resp, err);
      }
   }

   // 2. Enviar Candle em Formação
   if(InpEnableCandles && (nowMs - g_lastCandleSendTick >= (uint)InpLiveCandleIntervalMs))
   {
      g_lastCandleSendTick = nowMs;
      datetime curTime = iTime(NULL, PERIOD_M1, 0);
      double curOpen   = iOpen(NULL, PERIOD_M1, 0);
      double curHigh   = iHigh(NULL, PERIOD_M1, 0);
      double curLow    = iLow(NULL, PERIOD_M1, 0);
      double curClose  = iClose(NULL, PERIOD_M1, 0);
      long   curVol    = (long)iVolume(NULL, PERIOD_M1, 0);

      string cJson = BuildSingleCandleJson(curTime, curOpen, curHigh, curLow, curClose, curVol);
      string resp, err;

      // Envia formação para o Hub Local (se ativo)
      if(InpDestinationMode == DEST_LOCAL_HUB || InpDestinationMode == DEST_DUAL_STREAM)
      {
         HttpPost(InpLocalHubUrl + "/candles", cJson, false, resp, err);
      }
   }
}

//+------------------------------------------------------------------+
//| GRAVACAO DO JSON LOCAL                                           |
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
//| ATUALIZAR DASHBOARD ON-SCREEN                                    |
//+------------------------------------------------------------------+
void UpdateDashboard()
{
   if(!InpShowOnScreenPanel) return;

   string modeStr = "Dual Stream (Hub + DB)";
   if(InpDestinationMode == DEST_SUPABASE_ONLY) modeStr = "Supabase Direto";
   if(InpDestinationMode == DEST_LOCAL_HUB)     modeStr = "Hub WebSocket Local";

   string txt = StringFormat(
      "=== VORTEXWEB SENDER v2.0 ===\n" +
      "Instancia: %s | Simbolo: %s\n" +
      "Modo: %s\n" +
      "Preco Atual: %s | Delta: %d\n" +
      "Backfill M1: %s (%d candles)\n" +
      "Envios OK: %d | Falhas: %d\n" +
      "Latencia: %d ms | Status: %s\n" +
      "=============================",
      InpInstanceId, g_symbol,
      modeStr,
      F(g_safePrice, g_digits), (g_safeBuyVol - g_safeSellVol),
      g_histStatus, g_histTotalCandles,
      g_sendSuccessCount, g_sendErrorCount,
      g_lastLatencyMs, (g_lastErrorMsg == "" ? "Conectado" : g_lastErrorMsg)
   );

   if(InpEnableClusters)
      txt += StringFormat("\nFootprint M1: %d niveis | POC: %s (ON)", g_clusterTotalLevels, F(g_clusterPocPrice, g_digits));
   else
      txt += "\nFootprint M1: DESATIVADO";

   Comment(txt);
}

//+------------------------------------------------------------------+
//| ON INIT                                                          |
//+------------------------------------------------------------------+
int OnInit()
{
   g_symbol = (InpReferenceSymbol != "") ? InpReferenceSymbol : Symbol();
   g_digits = (int)MarketInfo(Symbol(), MODE_DIGITS);
   if(g_digits <= 0) g_digits = 2;

   if(Period() != PERIOD_M1)
   {
      Print("[VORTEX] ⚠️ O gráfico atual não é M1. O envio de candles requer M1.");
   }

   g_burstWindowStartMs = GetTickCount();
   g_lastPrintWindowTime = TimeCurrent();
   g_sessionDate = TimeCurrent() / 86400;
   g_lastBid = Bid;
   g_lastAsk = Ask;
   g_lastTickPrice = (Bid + Ask) / 2.0 + InpPriceOffset;
   g_lastSide = "COMPRA";
   g_lastBarVolume = (long)iVolume(NULL, PERIOD_M1, 0);
   g_lastBarTime = iTime(NULL, PERIOD_M1, 0);

   ArrayResize(g_barClusters, 0);
   g_clusterTotalLevels = 0;
   g_clusterPocPrice = 0;
   g_clusterPocBid = 0;
   g_clusterPocAsk = 0;
   g_lastClosedClustersJson = "[]";

   if(InpDaysToLoad > 0 && !g_historicalSent)
   {
      SendHistoricalCandles();
   }

   EventSetMillisecondTimer(100);
   Print("[VORTEX v2] 🟢 GammaPainelHttpCandles_v2 inicializado com sucesso!");
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| ON DEINIT                                                        |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Comment("");
}

//+------------------------------------------------------------------+
//| ON TICK (PROCESSAMENTO DE ORDER FLOW E TAPE)                     |
//+------------------------------------------------------------------+
void OnTick()
{
   double bid = MarketInfo(Symbol(), MODE_BID);
   double ask = MarketInfo(Symbol(), MODE_ASK);
   double currentPrice = (bid > 0) ? bid : Bid;
   currentPrice += InpPriceOffset;
   datetime currentTime = TimeCurrent();

   if(currentPrice <= 0) currentPrice = Bid;
   g_safePrice = currentPrice;

   datetime currentDay = TimeCurrent() / 86400;
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

   // Calculo de Volume e Agressao
   long currentBarVolume = (long)iVolume(Symbol(), PERIOD_M1, 0);
   long volumeDiff = currentBarVolume - g_lastBarVolume;
   if(volumeDiff < 1) volumeDiff = 1;
   g_lastBarVolume = currentBarVolume;

   g_printCountWindow++;
   g_burstPrints++;

   string side = g_lastSide;
   if(g_lastBid > 0 && g_lastAsk > 0 && g_lastTickPrice > 0)
   {
      if(currentPrice > g_lastTickPrice)
      {
         side = "COMPRA";
         g_lastSide = "COMPRA";
      }
      else if(currentPrice < g_lastTickPrice)
      {
         side = "VENDA";
         g_lastSide = "VENDA";
      }
      else if(bid > g_lastBid)
      {
         side = "COMPRA";
         g_lastSide = "COMPRA";
      }
      else if(bid < g_lastBid)
      {
         side = "VENDA";
         g_lastSide = "VENDA";
      }
      else if(ask > g_lastAsk)
      {
         side = "COMPRA";
         g_lastSide = "COMPRA";
      }
      else if(ask < g_lastAsk)
      {
         side = "VENDA";
         g_lastSide = "VENDA";
      }
      else
      {
         side = g_lastSide;
      }

      if(side == "COMPRA")
      {
         g_safeBuyVol += volumeDiff;
         g_safeBuyPrints++;
         g_burstBuyVol += volumeDiff;
      }
      else
      {
         g_safeSellVol += volumeDiff;
         g_safeSellPrints++;
         g_burstSellVol += volumeDiff;
      }
   }
   else
   {
      if(side == "COMPRA")
      {
         g_safeBuyVol += volumeDiff;
         g_safeBuyPrints++;
         g_burstBuyVol += volumeDiff;
      }
      else
      {
         g_safeSellVol += volumeDiff;
         g_safeSellPrints++;
         g_burstSellVol += volumeDiff;
      }
   }

   g_lastTickPrice = currentPrice;
   g_lastBid = bid;
   g_lastAsk = ask;

   if(InpEnableClusters)
   {
      double tSize = InpClusterTickSize;
      if(tSize <= 0.0)
      {
         tSize = MarketInfo(Symbol(), MODE_TICKSIZE);
         if(tSize <= 0.0) tSize = Point;
      }
      double roundedClusterPrice = NormalizeDouble(MathRound(currentPrice / tSize) * tSize, g_digits);
      AddClusterTick(roundedClusterPrice, volumeDiff, side);
   }

   // Verificacao de Block Trade Individual
   if(volumeDiff >= InpLargeTradeThreshold)
   {
      RegisterBlockTrade(currentPrice, volumeDiff, side, currentTime);
   }

   // Verificacao de Burst de Volume Rapido (Block Trade acumulado)
   CheckBurstBlockTrade(currentPrice, currentTime);

   // Calculo de Prints por Segundo (P/S)
   datetime now = TimeCurrent();
   double elapsed = (double)(now - g_lastPrintWindowTime);
   if(elapsed >= 1.0)
   {
      g_safePrintRate = (double)g_printCountWindow / elapsed;
      g_printCountWindow = 0;
      g_lastPrintWindowTime = now;
   }

   // Verificacao de Mudança de Barra M1 (Candle Fechado)
   datetime curBarTime = iTime(NULL, PERIOD_M1, 0);
   if(g_lastBarTime != 0 && curBarTime != g_lastBarTime)
   {
      // A barra anterior fechou (índice 1)
      datetime closedTime  = iTime(NULL, PERIOD_M1, 1);
      double   closedOpen  = iOpen(NULL, PERIOD_M1, 1);
      double   closedHigh  = iHigh(NULL, PERIOD_M1, 1);
      double   closedLow   = iLow(NULL, PERIOD_M1, 1);
      double   closedClose = iClose(NULL, PERIOD_M1, 1);
      long     closedVol   = (long)iVolume(NULL, PERIOD_M1, 1);

      if(InpEnableClusters)
      {
         g_lastClosedClustersJson = BuildClustersJson(g_barClusters);
         ArrayResize(g_barClusters, 0);
         g_clusterTotalLevels = 0;
         g_clusterPocPrice = 0;
         g_clusterPocBid = 0;
         g_clusterPocAsk = 0;
      }

      if(InpAutoSaveClosedToDb)
      {
         string clustersToSend = (InpEnableClusters && InpSaveClustersToDb) ? g_lastClosedClustersJson : "";
         SaveClosedCandleToSupabase(closedTime, closedOpen, closedHigh, closedLow, closedClose, closedVol, clustersToSend);
      }

      g_lastBarTime = curBarTime;
   }
   else if(g_lastBarTime == 0)
   {
      g_lastBarTime = curBarTime;
   }

   SendRealtimeData();
   UpdateDashboard();
}

//+------------------------------------------------------------------+
//| ON TIMER (ENVIO CONTINUO SUB-SEGUNDO)                            |
//+------------------------------------------------------------------+
void OnTimer()
{
   SendRealtimeData();
   UpdateDashboard();
}
