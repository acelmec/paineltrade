//+------------------------------------------------------------------+
//|                                             AxionGatewayEA.mq4   |
//|               Axion Web & Vortex Gateway — MQL4 Universal Conector|
//|               Copyright 2026, VM Gestão & Tecnologia Ltda        |
//|               https://db.vemviraramesa.com.br                    |
//+------------------------------------------------------------------+
#property copyright   "VM Gestão & Tecnologia Ltda"
#property link        "https://db.vemviraramesa.com.br"
#property version     "2.10"
#property description "Conector Universal, Copy Trading e Data Streamer para Axion Web / Vortex."
#property description "Compatível com MetaTrader 4 (MQL4). Sincroniza ordens, posições, histórico e cotações."
#property strict

//--- Enums
enum ENUM_GATEWAY_TRANSPORT {
   TRANSPORT_LOCAL_HTTP, // Servidor Local HTTP / REST (:8003)
   TRANSPORT_CLOUD_RELAY // Túnel de Nuvem Relay Hub (Porta 80)
};

//+------------------------------------------------------------------+
//| INPUTS                                                           |
//+------------------------------------------------------------------+
extern string                  Group_Conexao        = "=== 1. CONEXÃO AXION GATEWAY ===";
extern ENUM_GATEWAY_TRANSPORT  InpTransportMode     = TRANSPORT_CLOUD_RELAY;    // Modo de Transporte
extern string                  InpGatewayUrl        = "http://144.126.141.254"; // URL Gateway Local / VPS (Porta 80 Padrão)
extern string                  InpPairingToken      = "vps_mt4";                // Token de Pareamento de Nuvem
extern int                     InpPollIntervalMs    = 150;                      // Intervalo de Consulta de Ordens (ms)
extern int                     InpMagicNumber       = 888999;                   // Magic Number das Ordens

extern string                  Group_Streamer       = "=== 2. DATA STREAMER (CANDLES & TICKS) ===";
extern bool                    InpEnableStreamer    = true;                     // Habilitar Envio de Dados de Mercado
extern string                  InpTargetPanel       = "";                       // Painel de Destino (Vazio = mesmo do Símbolo)
extern int                     InpTickThrottleMs    = 50;                       // Throttle de Ticks (ms)

extern string                  Group_Risk           = "=== 3. GESTÃO DE RISCO & EXECUÇÃO ===";
extern double                  InpMaxLotAllowed     = 50.0;                     // Lote Máximo Permitido
extern int                     InpSlippagePoints    = 30;                       // Slippage Tolerada (Pontos)
extern bool                    InpAllowPanicClose   = true;                     // Permitir Zeragem em Pânico Remota

//+------------------------------------------------------------------+
//| VARIÁVEIS GLOBAIS                                                |
//+------------------------------------------------------------------+
datetime lastCandleMinute = 0;
ulong    lastTickTimeMs = 0;
ulong    lastSyncSnapshotMs = 0;
int      mwRoundRobinIdx = 0;
string   lastExecutedCommandId = "";

//+------------------------------------------------------------------+
//| CONVERTER HORÁRIO DO SERVIDOR DA CORRETORA PARA UTC REAL         |
//+------------------------------------------------------------------+
datetime ServerTimeToUtc(datetime srvTime)
{
   datetime curSrv = TimeCurrent();
   datetime curGmt = TimeGMT();
   if(curSrv <= 0 || curGmt <= 0) return srvTime;
   long diffSec = (long)curSrv - (long)curGmt;
   // Arredonda o fuso da corretora para múltiplos de 15 minutos (900s) para eliminar jitter de segundos
   long offsetRounded = (long)MathRound((double)diffSec / 900.0) * 900;
   return (datetime)((long)srvTime - offsetRounded);
}

//+------------------------------------------------------------------+
//| FORMATAR DATA ISO 8601 (UTC)                                     |
//+------------------------------------------------------------------+
string FormatIsoTimestamp(datetime dt)
{
   MqlDateTime mdt;
   TimeToStruct(dt, mdt);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
                       mdt.year, mdt.mon, mdt.day,
                       mdt.hour, mdt.min, mdt.sec);
}

//+------------------------------------------------------------------+
//| HIGIENIZAR STRING PARA JSON                                      |
//+------------------------------------------------------------------+
string EscapeJsonString(string val)
{
   string out = val;
   StringReplace(out, "\\", "/");
   StringReplace(out, "\"", "'");
   StringReplace(out, "\r", "");
   StringReplace(out, "\n", " ");
   return out;
}

//+------------------------------------------------------------------+
//| JSON HELPER: EXTRAIR VALOR SIMPLES                               |
//+------------------------------------------------------------------+
string ExtractJsonValue(string json, string key)
{
   string search = "\"" + key + "\"";
   int pos = StringFind(json, search);
   if(pos < 0) return "";
   
   pos = StringFind(json, ":", pos);
   if(pos < 0) return "";
   pos++;
   
   while(pos < StringLen(json) && (StringGetCharacter(json, pos) == ' ' || StringGetCharacter(json, pos) == '\t'))
      pos++;
      
   if(pos >= StringLen(json)) return "";
   
   if(StringGetCharacter(json, pos) == '\"')
   {
      pos++;
      int endPos = StringFind(json, "\"", pos);
      if(endPos < 0) return "";
      return StringSubstr(json, pos, endPos - pos);
   }
   else
   {
      int endPos = pos;
      while(endPos < StringLen(json))
      {
         ushort c = StringGetCharacter(json, endPos);
         if(c == ',' || c == '}' || c == ']' || c == ' ' || c == '\r' || c == '\n') break;
         endPos++;
      }
      return StringSubstr(json, pos, endPos - pos);
   }
}

//+------------------------------------------------------------------+
//| RESOLVER SÍMBOLO EQUIVALENTE NA CORRETORA                        |
//+------------------------------------------------------------------+
string ResolveBrokerSymbol(string reqSym)
{
   if(reqSym == "") return _Symbol;
   
   // 1. Tentativa exata
   if(SymbolSelect(reqSym, true) && MarketInfo(reqSym, MODE_ASK) > 0)
      return reqSym;
      
   string reqUpper = reqSym;
   StringToUpper(reqUpper);
   
   // 2. Busca no Market Watch ativo
   int totalMw = SymbolsTotal(true);
   for(int i = 0; i < totalMw; i++)
   {
      string s = SymbolName(i, true);
      string sUpper = s;
      StringToUpper(sUpper);
      if(sUpper == reqUpper || StringFind(sUpper, reqUpper) == 0 || StringFind(reqUpper, sUpper) == 0)
      {
         if(MarketInfo(s, MODE_ASK) > 0) return s;
      }
   }
   
   // 3. Busca na lista completa da corretora e ativa no Market Watch
   int totalAll = SymbolsTotal(false);
   for(int j = 0; j < totalAll; j++)
   {
      string s2 = SymbolName(j, false);
      string s2Upper = s2;
      StringToUpper(s2Upper);
      if(s2Upper == reqUpper || StringFind(s2Upper, reqUpper) == 0)
      {
         SymbolSelect(s2, true);
         if(MarketInfo(s2, MODE_ASK) > 0) return s2;
      }
   }
   
   return _Symbol;
}

//+------------------------------------------------------------------+
//| EXPERT INITIALIZATION                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   EventSetMillisecondTimer(MathMax(100, InpPollIntervalMs));
   Print("🚀 [AxionGatewayEA MT4 v2.10] Conector inicializado para ", _Symbol, " | Conta: ", AccountNumber());
   Print("📊 [AxionGatewayEA MT4] Saldo Real: ", DoubleToString(AccountBalance(), 2), " ", AccountCurrency(), " | Corretora: ", AccountCompany(), " (", IsDemo() ? "DEMO" : "REAL", ")");
   SyncAccountStateToGateway(true);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| EXPERT DEINITIALIZATION                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("🛑 [AxionGatewayEA MT4] Conector finalizado.");
}

//+------------------------------------------------------------------+
//| SERIALIZAR COTAÇÕES BID/ASK DE TODOS ATIVOS DO MARKET WATCH      |
//+------------------------------------------------------------------+
string GetMarketWatchQuotesJson()
{
   int total = SymbolsTotal(true);
   if(total <= 0) return "[]";
   int maxCount = total > 60 ? 60 : total;
   string json = "[";
   int count = 0;
   datetime nowUtc = TimeGMT();
   string nowIso = FormatIsoTimestamp(nowUtc);
   for(int i = 0; i < maxCount; i++)
   {
      string s = SymbolName(i, true);
      if(s == "") continue;
      double bid = MarketInfo(s, MODE_BID);
      double ask = MarketInfo(s, MODE_ASK);
      if(bid <= 0 || ask <= 0) continue;
      int digits = (int)MarketInfo(s, MODE_DIGITS);
      if(digits <= 0) digits = 2;
      if(count > 0) json += ",";
      json += StringFormat("{\"symbol\":\"%s\",\"bid\":%s,\"ask\":%s,\"price\":%s,\"updated_at\":\"%s\"}",
                           EscapeJsonString(s),
                           DoubleToString(bid, digits),
                           DoubleToString(ask, digits),
                           DoubleToString(bid, digits),
                           nowIso);
      count++;
   }
   json += "]";
   return json;
}

//+------------------------------------------------------------------+
//| TRANSMISSÃO ROTATIVA DE ATIVOS DO MARKET WATCH PARA /STREAMER    |
//+------------------------------------------------------------------+
void BroadcastNextMarketWatchQuotes(int batchSize = 4)
{
   if(!InpEnableStreamer) return;
   int total = SymbolsTotal(true);
   if(total <= 0) return;
   
   datetime nowUtc = TimeGMT();
   string nowIso = FormatIsoTimestamp(nowUtc);
   int sent = 0;
   int checked = 0;
   
   while(sent < batchSize && checked < total)
   {
      if(mwRoundRobinIdx >= total) mwRoundRobinIdx = 0;
      string s = SymbolName(mwRoundRobinIdx, true);
      mwRoundRobinIdx++;
      checked++;
      
      if(s == "" || s == _Symbol) continue;
      double bid = MarketInfo(s, MODE_BID);
      double ask = MarketInfo(s, MODE_ASK);
      if(bid <= 0 || ask <= 0) continue;
      int digits = (int)MarketInfo(s, MODE_DIGITS);
      if(digits <= 0) digits = 2;
      
      string jsonTick = StringFormat(
         "{\"type\":\"market_data\",\"symbol\":\"%s\",\"panel\":\"%s\",\"price\":%s,\"bid\":%s,\"ask\":%s,\"volume\":1,\"updated_at\":\"%s\"}",
         EscapeJsonString(s), EscapeJsonString(s),
         DoubleToString(bid, digits), DoubleToString(bid, digits), DoubleToString(ask, digits),
         nowIso
      );
      SendStreamerPayload(jsonTick);
      sent++;
   }
}

//+------------------------------------------------------------------+
//| TRANSMISSÃO DE DADOS DO ATIVO DO GRÁFICO (STREAMER)              |
//+------------------------------------------------------------------+
void BroadcastMarketData()
{
   if(!InpEnableStreamer) return;
   
   ulong nowMs = GetTickCount();
   if(nowMs - lastTickTimeMs < (ulong)InpTickThrottleMs) return;
   lastTickTimeMs = nowMs;

   string panel = InpTargetPanel != "" ? InpTargetPanel : _Symbol;
   datetime nowUtc = TimeGMT();

   // 1. Enviar Ticks de Preço (Last = Bid padronizado MT4 + Bid + Ask reais)
   string jsonTick = StringFormat(
      "{\"type\":\"market_data\",\"symbol\":\"%s\",\"panel\":\"%s\",\"price\":%s,\"bid\":%s,\"ask\":%s,\"volume\":%I64d,\"updated_at\":\"%s\"}",
      EscapeJsonString(_Symbol), EscapeJsonString(panel),
      DoubleToString(Bid, Digits), DoubleToString(Bid, Digits), DoubleToString(Ask, Digits),
      (long)Volume[0], FormatIsoTimestamp(nowUtc)
   );
   SendStreamerPayload(jsonTick);

   // 2. Verificar formação e fechamento de barras de 1 minuto (M1) — MT4 usa minuto de abertura (ex: 13:40:01 -> 13:40:00) e menor preço (Bid)
   datetime barTime = Time[0];
   if(barTime != lastCandleMinute)
   {
      lastCandleMinute = barTime;
      datetime barUtc = ServerTimeToUtc(Time[0]);
      string jsonBar = StringFormat(
         "{\"type\":\"bar\",\"symbol\":\"%s\",\"panel\":\"%s\",\"price\":%s,\"open\":%s,\"high\":%s,\"low\":%s,\"close\":%s,\"volume\":%I64d,\"timestamp\":\"%s\",\"updated_at\":\"%s\"}",
         EscapeJsonString(_Symbol), EscapeJsonString(panel),
         DoubleToString(Bid, Digits), DoubleToString(Open[0], Digits),
         DoubleToString(High[0], Digits), DoubleToString(Low[0], Digits),
         DoubleToString(Bid, Digits), (long)Volume[0],
         FormatIsoTimestamp(barUtc), FormatIsoTimestamp(nowUtc)
      );
      SendStreamerPayload(jsonBar);
   }
}

void OnTick()
{
   BroadcastMarketData();
}

//+------------------------------------------------------------------+
//| ON TIMER: POLLING DE ORDENS, SYNC COMPLETO & MARKET WATCH        |
//+------------------------------------------------------------------+
void OnTimer()
{
   // 1. Consulta imediata de comandos na fila do Axion (GET /commands)
   PollAndProcessCommands();

   // 2. Sincronização completa de Posições Abertas, Histórico Fechado, Saldo, Candles M1 e Market Watch (POST /market_data)
   ulong nowMs = GetTickCount();
   if(nowMs - lastSyncSnapshotMs >= 200)
   {
      lastSyncSnapshotMs = nowMs;
      SyncAccountStateToGateway(false);
      BroadcastNextMarketWatchQuotes(5);
   }
}

//+------------------------------------------------------------------+
//| ENVIO HTTP POST GENÉRICO COM FALLBACK LOCAL                      |
//+------------------------------------------------------------------+
int SendHttpPostJson(string endpointPath, string json, int timeoutMs = 300)
{
   if(InpGatewayUrl == "") return -1;
   string url = InpGatewayUrl + endpointPath;
   string headers = "Content-Type: application/json\r\n";
   char data[];
   StringToCharArray(json, data, 0, StringLen(json));
   char result[];
   string resultHeaders;
   ResetLastError();
   int res = WebRequest("POST", url, headers, timeoutMs, data, result, resultHeaders);
   if(res == -1 && StringFind(url, "144.126.141.254") >= 0)
   {
      string localUrl = url;
      StringReplace(localUrl, "144.126.141.254", "127.0.0.1:8003");
      res = WebRequest("POST", localUrl, headers, timeoutMs, data, result, resultHeaders);
   }
   return res;
}

//+------------------------------------------------------------------+
//| ENVIO DE STREAMER PAYLOAD                                        |
//+------------------------------------------------------------------+
void SendStreamerPayload(string json)
{
   SendHttpPostJson("/streamer", json, 150);
}

//+------------------------------------------------------------------+
//| OBTER SÍMBOLOS DO MARKET WATCH PARA SINCRONIZAÇÃO                |
//+------------------------------------------------------------------+
string GetMarketWatchSymbols()
{
   string list = "";
   int total = SymbolsTotal(true);
   int maxCount = total > 40 ? 40 : total;
   for(int i = 0; i < maxCount; i++)
   {
      string s = SymbolName(i, true);
      if(s != "")
      {
         if(list != "") list += ",";
         list += s;
      }
   }
   return list;
}

//+------------------------------------------------------------------+
//| SERIALIZAR POSIÇÕES ABERTAS (ORDENS ATIVAS) EM JSON              |
//+------------------------------------------------------------------+
string GetOpenPositionsJson()
{
   int total = OrdersTotal();
   string json = "[";
   int count = 0;
   for(int i = 0; i < total; i++)
   {
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
      {
         int type = OrderType();
         if(type == OP_BUY || type == OP_SELL)
         {
            if(count > 0) json += ",";
            string sym = OrderSymbol();
            int digits = (int)MarketInfo(sym, MODE_DIGITS);
            if(digits <= 0) digits = 2;
            string side = (type == OP_BUY) ? "COMPRA" : "VENDA";
            double netProfit = OrderProfit() + OrderCommission() + OrderSwap();
            json += StringFormat(
               "{\"ticket\":%d,\"symbol\":\"%s\",\"side\":\"%s\",\"lots\":%.2f,\"entry_price\":%s,\"sl\":%s,\"tp\":%s,\"profit\":%.2f,\"net_profit\":%.2f,\"commission\":%.2f,\"swap\":%.2f,\"magic\":%d,\"open_time\":\"%s\"}",
               OrderTicket(),
               EscapeJsonString(sym),
               side,
               OrderLots(),
               DoubleToString(OrderOpenPrice(), digits),
               DoubleToString(OrderStopLoss(), digits),
               DoubleToString(OrderTakeProfit(), digits),
                netProfit,
               netProfit,
               OrderCommission(),
               OrderSwap(),
               OrderMagicNumber(),
               FormatIsoTimestamp(OrderOpenTime())
            );
            count++;
         }
      }
   }
   json += "]";
   return json;
}

//+------------------------------------------------------------------+
//| SERIALIZAR HISTÓRICO DE ORDENS FECHADAS EM JSON                  |
//+------------------------------------------------------------------+
string GetClosedOrdersHistoryJson()
{
   int total = OrdersHistoryTotal();
   string json = "[";
   int count = 0;
   int start = total > 50 ? total - 50 : 0;
   for(int i = total - 1; i >= start; i--)
   {
      if(OrderSelect(i, SELECT_BY_POS, MODE_HISTORY))
      {
         int type = OrderType();
         if(type == OP_BUY || type == OP_SELL)
         {
            if(count > 0) json += ",";
            string sym = OrderSymbol();
            int digits = (int)MarketInfo(sym, MODE_DIGITS);
            if(digits <= 0) digits = 2;
            string side = (type == OP_BUY) ? "COMPRA" : "VENDA";
            double netPnl = OrderProfit() + OrderCommission() + OrderSwap();
            json += StringFormat(
               "{\"ticket\":%d,\"symbol\":\"%s\",\"side\":\"%s\",\"lots\":%.2f,\"entry_price\":%s,\"exit_price\":%s,\"sl\":%s,\"tp\":%s,\"profit\":%.2f,\"net_profit\":%.2f,\"commission\":%.2f,\"swap\":%.2f,\"magic\":%d,\"open_time\":\"%s\",\"close_time\":\"%s\"}",
               OrderTicket(),
               EscapeJsonString(sym),
               side,
               OrderLots(),
               DoubleToString(OrderOpenPrice(), digits),
               DoubleToString(OrderClosePrice(), digits),
               DoubleToString(OrderStopLoss(), digits),
               DoubleToString(OrderTakeProfit(), digits),
               OrderProfit(),
               netPnl,
               OrderCommission(),
               OrderSwap(),
               OrderMagicNumber(),
               FormatIsoTimestamp(OrderOpenTime()),
               FormatIsoTimestamp(OrderCloseTime())
            );
            count++;
         }
      }
   }
   json += "]";
   return json;
}

//+------------------------------------------------------------------+
//| SERIALIZAR ÚLTIMOS CANDLES M1 DO ATIVO (REFERÊNCIA BID / UTC)    |
//+------------------------------------------------------------------+
string GetRecentM1CandlesJson(int maxBars = 30)
{
   int avail = iBars(_Symbol, PERIOD_M1);
   int countBars = avail < maxBars ? avail : maxBars;
   if(countBars <= 0) return "[]";
   string json = "[";
   int written = 0;
   for(int i = countBars - 1; i >= 0; i--)
   {
      datetime tSrv = iTime(_Symbol, PERIOD_M1, i);
      if(tSrv <= 0) continue;
      datetime tUtc = ServerTimeToUtc(tSrv);
      double o = iOpen(_Symbol, PERIOD_M1, i);
      double h = iHigh(_Symbol, PERIOD_M1, i);
      double l = iLow(_Symbol, PERIOD_M1, i);
      double c = (i == 0 && Bid > 0) ? Bid : iClose(_Symbol, PERIOD_M1, i);
      if(i == 0 && Bid > 0)
      {
         if(Bid > h) h = Bid;
         if(Bid < l) l = Bid;
      }
      long v = (long)iVolume(_Symbol, PERIOD_M1, i);
      if(o <= 0 || c <= 0) continue;
      if(written > 0) json += ",";
      json += StringFormat(
         "{\"timestamp\":\"%s\",\"open\":%s,\"high\":%s,\"low\":%s,\"close\":%s,\"volume\":%I64d}",
         FormatIsoTimestamp(tUtc),
         DoubleToString(o, Digits),
         DoubleToString(h, Digits),
         DoubleToString(l, Digits),
         DoubleToString(c, Digits),
         v
      );
      written++;
   }
   json += "]";
   return json;
}

//+------------------------------------------------------------------+
//| SINCRONIZAR ESTADO COMPLETO DA CONTA COM O GATEWAY (/MARKET_DATA)|
//+------------------------------------------------------------------+
void SyncAccountStateToGateway(bool forceAccountSpecific = false)
{
   if(InpGatewayUrl == "") return;
   
   string posJson = GetOpenPositionsJson();
   string histJson = GetClosedOrdersHistoryJson();
   string quotesJson = GetMarketWatchQuotesJson();
   string candlesJson = GetRecentM1CandlesJson(30);
   string nowIso = FormatIsoTimestamp(TimeGMT());
   string brokerSafe = EscapeJsonString(AccountCompany());
   string accStr = IntegerToString(AccountNumber());
   
   // Publica no canal global de sincronização MT4 (mt4_sync_all) compatível com VPS /market_data e WebSocket
   string syncAllPayload = StringFormat(
      "{\"instance_id\":\"mt4_sync_all\",\"account\":\"%s\",\"platform\":\"mt4\",\"symbol\":\"%s\",\"bid\":%s,\"ask\":%s,\"price\":%s,\"balance\":%.2f,\"equity\":%.2f,\"currency\":\"%s\",\"broker\":\"%s\",\"positions\":%s,\"history\":%s,\"quotes\":%s,\"candles\":%s,\"updated_at\":\"%s\"}",
      accStr,
      EscapeJsonString(_Symbol),
      DoubleToString(Bid, Digits),
      DoubleToString(Ask, Digits),
      DoubleToString(Bid, Digits),
      AccountBalance(),
      AccountEquity(),
      EscapeJsonString(AccountCurrency()),
      brokerSafe,
      posJson,
      histJson,
      quotesJson,
      candlesJson,
      nowIso
   );
   SendHttpPostJson("/market_data", syncAllPayload, 350);

   // Publica também na chave específica da conta (mt4_sync_<account>)
   if(forceAccountSpecific)
   {
      string syncAccPayload = StringFormat(
         "{\"instance_id\":\"mt4_sync_%s\",\"account\":\"%s\",\"platform\":\"mt4\",\"symbol\":\"%s\",\"bid\":%s,\"ask\":%s,\"price\":%s,\"balance\":%.2f,\"equity\":%.2f,\"currency\":\"%s\",\"broker\":\"%s\",\"positions\":%s,\"history\":%s,\"quotes\":%s,\"candles\":%s,\"updated_at\":\"%s\"}",
         accStr,
         accStr,
         EscapeJsonString(_Symbol),
         DoubleToString(Bid, Digits),
         DoubleToString(Ask, Digits),
         DoubleToString(Bid, Digits),
         AccountBalance(),
         AccountEquity(),
         EscapeJsonString(AccountCurrency()),
         brokerSafe,
         posJson,
         histJson,
         quotesJson,
         candlesJson,
         nowIso
      );
      SendHttpPostJson("/market_data", syncAccPayload, 350);
   }
}

//+------------------------------------------------------------------+
//| PROCESSAR COMANDOS DO AXION (ORDENS, SL/TP, FECHAMENTOS)          |
//+------------------------------------------------------------------+
void PollAndProcessCommands()
{
   if(InpGatewayUrl == "") return;
   
   string brokerClean = AccountCompany();
   StringReplace(brokerClean, " ", "%20");
   string url = InpGatewayUrl + "/commands?account=" + IntegerToString(AccountNumber()) + 
                "&symbol=" + _Symbol +
                "&bid=" + DoubleToString(Bid, Digits) +
                "&ask=" + DoubleToString(Ask, Digits) +
                "&price=" + DoubleToString(Bid, Digits) +
                "&balance=" + DoubleToString(AccountBalance(), 2) +
                "&equity=" + DoubleToString(AccountEquity(), 2) +
                "&currency=" + AccountCurrency() +
                "&broker=" + brokerClean +
                "&demo=" + (IsDemo() ? "1" : "0") +
                "&leverage=" + IntegerToString(AccountLeverage());
   if(InpPairingToken != "") url += "&token=" + InpPairingToken;

   static datetime lastSymbolsSend = 0;
   if(TimeCurrent() - lastSymbolsSend > 20)
   {
      lastSymbolsSend = TimeCurrent();
      string mw = GetMarketWatchSymbols();
      if(mw != "") url += "&symbols=" + mw;
   }

   // IMPORTANTE: Usa estritamente GET /commands para compatibilidade total com o Hub VPS e Bridge Local
   char emptyData[];
   ArrayResize(emptyData, 0);
   char result[];
   string resultHeaders;
   ResetLastError();
   int res = WebRequest("GET", url, "Content-Type: application/json\r\n", 400, emptyData, result, resultHeaders);
   if(res == -1 && StringFind(url, "144.126.141.254") >= 0)
   {
      string localUrl = url;
      StringReplace(localUrl, "144.126.141.254", "127.0.0.1:8003");
      res = WebRequest("GET", localUrl, "Content-Type: application/json\r\n", 400, emptyData, result, resultHeaders);
   }
   if(res == -1)
   {
      int err = GetLastError();
      if(err == 4060)
      {
         static datetime lastWarn4060 = 0;
         if(TimeCurrent() - lastWarn4060 > 15)
         {
            lastWarn4060 = TimeCurrent();
            Print("⚠️ [AxionGatewayEA MT4] WebRequest BLOQUEADO para '", InpGatewayUrl, "' (Erro 4060). Adicione '", InpGatewayUrl, "' em: Ferramentas -> Opções -> Experts!");
         }
      }
      return;
   }
   if(res != 200 || ArraySize(result) == 0) return;

   string response = CharArrayToString(result);
   if(response == "" || response == "{}" || response == "[]") return;

   string cmdId = ExtractJsonValue(response, "id");
   if(cmdId != "" && cmdId == lastExecutedCommandId) return;

   string action = ExtractJsonValue(response, "action");
   StringToLower(action);

   // 1. Abertura de Ordem a Mercado
   if(action == "order" || action == "sinal_local")
   {
      string rawSym = ExtractJsonValue(response, "symbol");
      string sym = ResolveBrokerSymbol(rawSym);
      string dirStr = ExtractJsonValue(response, "direction");
      int dir = (int)StringToInteger(dirStr); // 1 = BUY, 2 = SELL
      if(dir == 0)
      {
         string side = ExtractJsonValue(response, "side");
         StringToUpper(side);
         if(side == "BUY" || side == "COMPRA") dir = 1;
         else if(side == "SELL" || side == "VENDA") dir = 2;
      }

      double lot = StringToDouble(ExtractJsonValue(response, "lots"));
      if(lot <= 0) lot = StringToDouble(ExtractJsonValue(response, "contracts"));
      if(lot <= 0) lot = StringToDouble(ExtractJsonValue(response, "quantity"));
      if(lot <= 0) lot = MarketInfo(sym, MODE_MINLOT);

      double slPrice = StringToDouble(ExtractJsonValue(response, "stop_loss"));
      double tpPrice = StringToDouble(ExtractJsonValue(response, "take_profit"));
      double slPts = StringToDouble(ExtractJsonValue(response, "sl_points"));
      if(slPts <= 0) slPts = StringToDouble(ExtractJsonValue(response, "stop_loss_points"));
      double tpPts = StringToDouble(ExtractJsonValue(response, "tp_points"));
      if(tpPts <= 0) tpPts = StringToDouble(ExtractJsonValue(response, "take_profit_points"));

      int openedTicket = 0;
      bool ok = ExecuteMarketOrder(sym, dir, lot, slPrice, tpPrice, slPts, tpPts, openedTicket);
      lastExecutedCommandId = cmdId;
      if(ok)
      {
         ConfirmCommandExecuted(cmdId, "success", "", openedTicket);
         SyncAccountStateToGateway(true);
      }
      else
      {
         ConfirmCommandExecuted(cmdId, "rejected", "OrderSend falhou com erro #" + IntegerToString(GetLastError()), 0);
         SyncAccountStateToGateway(true);
      }
   }
   // 2. Modificação Dinâmica de SL/TP
   else if(action == "modify" || action == "modify_order" || action == "levels")
   {
      int ticket = (int)StringToInteger(ExtractJsonValue(response, "ticket"));
      string rawSym = ExtractJsonValue(response, "symbol");
      double newSL = StringToDouble(ExtractJsonValue(response, "stop_loss"));
      double newTP = StringToDouble(ExtractJsonValue(response, "take_profit"));
      ModifyPositionSLTP(ticket, rawSym, newSL, newTP);
      lastExecutedCommandId = cmdId;
      ConfirmCommandExecuted(cmdId, "modified", "", ticket);
      SyncAccountStateToGateway(true);
   }
   // 3. Fechamento de Posição / Zeragem por Ativo / Panic Close
   else if(action == "close" || action == "flat" || action == "flatten_all" || action == "panic_close")
   {
      int ticket = (int)StringToInteger(ExtractJsonValue(response, "ticket"));
      string rawSym = ExtractJsonValue(response, "symbol");
      if(ticket > 0)
      {
         CloseSingleTicket(ticket);
      }
      else if(rawSym != "" && action != "flatten_all" && action != "panic_close")
      {
         ClosePositionsBySymbol(rawSym);
      }
      else if(InpAllowPanicClose)
      {
         CloseAllPositions();
      }
      lastExecutedCommandId = cmdId;
      ConfirmCommandExecuted(cmdId, "closed", "", ticket);
      SyncAccountStateToGateway(true);
   }
}

//+------------------------------------------------------------------+
//| EXECUÇÃO DE ORDEM A MERCADO                                      |
//+------------------------------------------------------------------+
bool ExecuteMarketOrder(const string sym, int direction, double lot, double sl, double tp, double slPts, double tpPts, int &outTicket)
{
   outTicket = 0;
   string orderSym = ResolveBrokerSymbol(sym);
   RefreshRates();

   int digits = (int)MarketInfo(orderSym, MODE_DIGITS);
   double point = MarketInfo(orderSym, MODE_POINT);
   double ask = MarketInfo(orderSym, MODE_ASK);
   double bid = MarketInfo(orderSym, MODE_BID);
   if(ask <= 0 || bid <= 0)
   {
      orderSym = _Symbol;
      digits = Digits;
      point = Point;
      ask = Ask;
      bid = Bid;
   }

   // Normalização do Lote conforme limites e step da corretora
   double minLot = MarketInfo(orderSym, MODE_MINLOT);
   double maxLot = MarketInfo(orderSym, MODE_MAXLOT);
   double lotStep = MarketInfo(orderSym, MODE_LOTSTEP);
   if(minLot <= 0) minLot = 0.01;
   if(maxLot <= 0) maxLot = InpMaxLotAllowed;
   double effectiveMax = MathMin(maxLot, InpMaxLotAllowed);
   double normLot = MathMax(minLot, MathMin(lot, effectiveMax));
   if(lotStep > 0)
   {
      normLot = MathFloor((normLot + 0.0000001) / lotStep) * lotStep;
      normLot = MathMax(minLot, normLot);
   }
   normLot = NormalizeDouble(normLot, 2);

   double price = (direction == 1) ? ask : bid;
   int cmd = (direction == 1) ? OP_BUY : OP_SELL;
   color arrowColor = (direction == 1) ? clrBlue : clrRed;

   // 1 ponto do Axion = 1.0 (unidade inteira à esquerda da casa decimal).
   // Se informado sl_points / tp_points do Axion, calcula a partir do preço real de execução no MT4!
   double finalSl = sl;
   double finalTp = tp;

   if(slPts > 0)
   {
      finalSl = (direction == 1) ? (price - slPts * 1.0) : (price + slPts * 1.0);
   }
   if(tpPts > 0)
   {
      finalTp = (direction == 1) ? (price + tpPts * 1.0) : (price - tpPts * 1.0);
   }

   // Garante distância mínima de StopLevel da corretora
   double stopLevelPoints = MarketInfo(orderSym, MODE_STOPLEVEL);
   double minStopDist = stopLevelPoints * point;
   if(minStopDist > 0)
   {
      if(finalSl > 0)
      {
         double curSlDist = MathAbs(price - finalSl);
         if(curSlDist < minStopDist)
         {
            finalSl = (direction == 1) ? (price - minStopDist) : (price + minStopDist);
         }
      }
      if(finalTp > 0)
      {
         double curTpDist = MathAbs(finalTp - price);
         if(curTpDist < minStopDist)
         {
            finalTp = (direction == 1) ? (price + minStopDist) : (price - minStopDist);
         }
      }
   }

   // Normalização obrigatória para os dígitos decimais do símbolo
   price = NormalizeDouble(price, digits);
   if(finalSl > 0) finalSl = NormalizeDouble(finalSl, digits);
   else finalSl = 0;
   if(finalTp > 0) finalTp = NormalizeDouble(finalTp, digits);
   else finalTp = 0;

   ResetLastError();
   int ticket = OrderSend(orderSym, cmd, normLot, price, InpSlippagePoints, finalSl, finalTp, "Axion Web Order", InpMagicNumber, 0, arrowColor);
   if(ticket > 0)
   {
      outTicket = ticket;
      Print("✅ [AxionGatewayEA MT4] Ordem executada com sucesso! Ticket: ", ticket, " | Lote: ", normLot, " | Ativo: ", orderSym, " | Preço: ", price, " | SL: ", finalSl, " | TP: ", finalTp);
      return true;
   }

   int err = GetLastError();
   Print("⚠️ [AxionGatewayEA MT4] Falha inicial ao executar ordem (#", err, "). Tentando execução a mercado com aplicação imediata de SL/TP...");

   // Contingência padrão para contas Market Execution (ECN/STP) que exigem abertura com SL=0/TP=0 seguida de OrderModify
   RefreshRates();
   price = (direction == 1) ? MarketInfo(orderSym, MODE_ASK) : MarketInfo(orderSym, MODE_BID);
   price = NormalizeDouble(price, digits);
   ticket = OrderSend(orderSym, cmd, normLot, price, InpSlippagePoints * 2, 0, 0, "Axion Web Order", InpMagicNumber, 0, arrowColor);
   if(ticket > 0)
   {
      outTicket = ticket;
      if(OrderSelect(ticket, SELECT_BY_TICKET))
      {
         double execPrice = OrderOpenPrice();
         if(slPts > 0) finalSl = NormalizeDouble((direction == 1) ? (execPrice - slPts * 1.0) : (execPrice + slPts * 1.0), digits);
         if(tpPts > 0) finalTp = NormalizeDouble((direction == 1) ? (execPrice + tpPts * 1.0) : (execPrice - tpPts * 1.0), digits);
      }
      Print("✅ [AxionGatewayEA MT4] Ordem aberta a mercado! Ticket: ", ticket, ". Aplicando SL=", finalSl, " e TP=", finalTp, "...");
      if(finalSl > 0 || finalTp > 0)
      {
         ModifyPositionSLTP(ticket, orderSym, finalSl, finalTp);
      }
      return true;
   }

   Print("❌ [AxionGatewayEA MT4] Falha definitiva ao executar ordem em ", orderSym, ": Erro #", GetLastError());
   return false;
}

//+------------------------------------------------------------------+
//| MODIFICAÇÃO DE SL/TP POR TICKET OU SÍMBOLO                       |
//+------------------------------------------------------------------+
bool ModifyPositionSLTP(int ticket, string rawSym, double sl, double tp)
{
   RefreshRates();
   if(ticket > 0)
   {
      if(OrderSelect(ticket, SELECT_BY_TICKET))
      {
         int digits = (int)MarketInfo(OrderSymbol(), MODE_DIGITS);
         double normSl = (sl > 0) ? NormalizeDouble(sl, digits) : OrderStopLoss();
         double normTp = (tp > 0) ? NormalizeDouble(tp, digits) : OrderTakeProfit();
         ResetLastError();
         if(OrderModify(ticket, OrderOpenPrice(), normSl, normTp, 0, clrYellow))
         {
            Print("🔄 [AxionGatewayEA MT4] SL/TP modificado no Ticket: ", ticket, " -> SL: ", normSl, " | TP: ", normTp);
            return true;
          }
         Print("⚠️ [AxionGatewayEA MT4] Falha ao modificar SL/TP no Ticket ", ticket, ": Erro #", GetLastError());
      }
      return false;
   }

   // Caso não tenha vindo ticket explícito, modifica todas as posições abertas do ativo correspondente
   string targetSym = ResolveBrokerSymbol(rawSym);
   bool modifiedAny = false;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
      {
         if((OrderType() == OP_BUY || OrderType() == OP_SELL) && (rawSym == "" || OrderSymbol() == targetSym || OrderSymbol() == rawSym))
         {
            int digits = (int)MarketInfo(OrderSymbol(), MODE_DIGITS);
            double normSl = (sl > 0) ? NormalizeDouble(sl, digits) : OrderStopLoss();
            double normTp = (tp > 0) ? NormalizeDouble(tp, digits) : OrderTakeProfit();
            if(OrderModify(OrderTicket(), OrderOpenPrice(), normSl, normTp, 0, clrYellow))
            {
               modifiedAny = true;
               Print("🔄 [AxionGatewayEA MT4] SL/TP modificado por Ativo (", OrderSymbol(), " #", OrderTicket(), ") -> SL: ", normSl, " | TP: ", normTp);
            }
         }
      }
   }
   return modifiedAny;
}

//+------------------------------------------------------------------+
//| FECHAMENTO DE UM TICKET INDIVIDUAL                               |
//+------------------------------------------------------------------+
bool CloseSingleTicket(int ticket)
{
   if(OrderSelect(ticket, SELECT_BY_TICKET))
   {
      if(OrderCloseTime() > 0) return true; // Já fechada
      RefreshRates();
      string sym = OrderSymbol();
      int digits = (int)MarketInfo(sym, MODE_DIGITS);
      double closePrice = (OrderType() == OP_BUY) ? MarketInfo(sym, MODE_BID) : MarketInfo(sym, MODE_ASK);
      closePrice = NormalizeDouble(closePrice, digits);
      bool closed = OrderClose(ticket, OrderLots(), closePrice, InpSlippagePoints * 2, clrWhite);
      if(closed)
      {
         Print("🛑 [AxionGatewayEA MT4] Posição encerrada com sucesso! Ticket: ", ticket);
      }
      return closed;
   }
   return false;
}

//+------------------------------------------------------------------+
//| FECHAMENTO DE POSIÇÕES POR SÍMBOLO                               |
//+------------------------------------------------------------------+
void ClosePositionsBySymbol(string rawSym)
{
   string targetSym = ResolveBrokerSymbol(rawSym);
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
      {
         if((OrderType() == OP_BUY || OrderType() == OP_SELL) && (OrderSymbol() == targetSym || OrderSymbol() == rawSym))
         {
            CloseSingleTicket(OrderTicket());
         }
      }
   }
}

//+------------------------------------------------------------------+
//| ZERAGEM COMPLETA (PANIC CLOSE)                                   |
//+------------------------------------------------------------------+
void CloseAllPositions()
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
      {
         if(OrderType() == OP_BUY || OrderType() == OP_SELL)
         {
            CloseSingleTicket(OrderTicket());
         }
      }
   }
   Print("🚨 [AxionGatewayEA MT4] Todas as posições abertas foram encerradas (Panic Close).");
}

//+------------------------------------------------------------------+
//| CONFIRMAR EXECUÇÃO DE COMANDO                                    |
//+------------------------------------------------------------------+
void ConfirmCommandExecuted(string cmdId, string status, string reason = "", int ticket = 0)
{
   if(cmdId == "") return;
   string payload = StringFormat(
      "{\"id\":\"%s\",\"status\":\"%s\",\"reason\":\"%s\",\"ticket\":%d,\"account\":%d}",
      cmdId, status, EscapeJsonString(reason), ticket, AccountNumber()
   );
   SendHttpPostJson("/command_ack", payload, 300);
}
