//+------------------------------------------------------------------+
//|                                             AxionGatewayEA.mq5   |
//|               Axion Web & Vortex Gateway — MQL5 Universal Conector|
//|               Copyright 2026, VM Gestão & Tecnologia Ltda        |
//|               https://db.vemviraramesa.com.br                    |
//+------------------------------------------------------------------+
#property copyright   "VM Gestão & Tecnologia Ltda"
#property link        "https://db.vemviraramesa.com.br"
#property version     "2.10"
#property description "Conector Universal, Copy Trading e Data Streamer para Axion Web / Vortex."
#property description "Sincroniza ordens, posições, saldo, histórico, cotações Market Watch e candles de 1m."
#property strict

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\OrderInfo.mqh>
#include <Trade\HistoryOrderInfo.mqh>

//--- Enums
enum ENUM_GATEWAY_TRANSPORT {
   TRANSPORT_LOCAL_HTTP, // Servidor Local HTTP / REST (:8003)
   TRANSPORT_CLOUD_RELAY // Túnel de Nuvem Relay Hub (Porta 80)
};

//+------------------------------------------------------------------+
//| INPUTS                                                           |
//+------------------------------------------------------------------+
input string                  Group_Conexao        = "=== 1. CONEXÃO AXION GATEWAY ===";
input ENUM_GATEWAY_TRANSPORT  InpTransportMode     = TRANSPORT_CLOUD_RELAY;    // Modo de Transporte
input string                  InpGatewayUrl        = "http://144.126.141.254"; // URL Gateway Local / VPS (Porta 80 Padrão)
input string                  InpPairingToken      = "vps_mt5";                // Token de Pareamento de Nuvem
input int                     InpPollIntervalMs    = 150;                      // Intervalo de Consulta de Ordens (ms)
input int                     InpMagicNumber       = 888999;                   // Magic Number das Ordens

input string                  Group_Streamer       = "=== 2. DATA STREAMER (CANDLES & TICKS) ===";
input bool                    InpEnableStreamer    = true;                     // Habilitar Envio de Dados de Mercado
input string                  InpTargetPanel       = "";                       // Painel de Destino (Vazio = mesmo do Símbolo)
input int                     InpTickThrottleMs    = 50;                       // Throttle de Ticks (ms)

input string                  Group_Risk           = "=== 3. GESTÃO DE RISCO & EXECUÇÃO ===";
input double                  InpMaxLotAllowed     = 50.0;                     // Lote Máximo Permitido
input int                     InpSlippagePoints    = 30;                       // Slippage Tolerada (Pontos)
input bool                    InpAllowPanicClose   = true;                     // Permitir Zeragem em Pânico Remota

//+------------------------------------------------------------------+
//| VARIÁVEIS GLOBAIS                                                |
//+------------------------------------------------------------------+
CTrade            trade;
CPositionInfo     posInfo;
datetime          lastCandleMinute = 0;
ulong             lastTickTimeMs = 0;
ulong             lastSyncSnapshotMs = 0;
int               mwRoundRobinIdx = 0;
string            lastExecutedCommandId = "";

//+------------------------------------------------------------------+
//| CONVERTER HORÁRIO DO SERVIDOR DA CORRETORA PARA UTC REAL         |
//+------------------------------------------------------------------+
datetime ServerTimeToUtc(datetime srvTime)
{
   datetime curSrv = TimeCurrent();
   datetime curGmt = TimeGMT();
   if(curSrv <= 0 || curGmt <= 0) return srvTime;
   long diffSec = (long)curSrv - (long)curGmt;
   long offsetRounded = (long)MathRound((double)diffSec / 900.0) * 900;
   return (datetime)((long)srvTime - offsetRounded);
}

//+------------------------------------------------------------------+
//| FUNÇÃO AUXILIAR: FORMATAR DATA ISO 8601 (UTC)                   |
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
   if(SymbolSelect(reqSym, true) && SymbolInfoDouble(reqSym, SYMBOL_ASK) > 0)
      return reqSym;

   string reqUpper = reqSym;
   StringToUpper(reqUpper);

   int totalMw = SymbolsTotal(true);
   for(int i = 0; i < totalMw; i++)
   {
      string s = SymbolName(i, true);
      string sUpper = s;
      StringToUpper(sUpper);
      if(sUpper == reqUpper || StringFind(sUpper, reqUpper) == 0 || StringFind(reqUpper, sUpper) == 0)
      {
         if(SymbolInfoDouble(s, SYMBOL_ASK) > 0) return s;
      }
   }

   int totalAll = SymbolsTotal(false);
   for(int j = 0; j < totalAll; j++)
   {
      string s2 = SymbolName(j, false);
      string s2Upper = s2;
      StringToUpper(s2Upper);
      if(s2Upper == reqUpper || StringFind(s2Upper, reqUpper) == 0)
      {
         SymbolSelect(s2, true);
         if(SymbolInfoDouble(s2, SYMBOL_ASK) > 0) return s2;
      }
   }

   return _Symbol;
}

//+------------------------------------------------------------------+
//| EXPERT INITIALIZATION                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetDeviationInPoints(InpSlippagePoints);
   trade.SetTypeFillingBySymbol(_Symbol);

   EventSetMillisecondTimer(MathMax(50, InpPollIntervalMs));
   Print("🚀 [AxionGatewayEA MT5 v2.10] Conector inicializado para ", _Symbol, " | Conta: ", AccountInfoInteger(ACCOUNT_LOGIN));
   Print("📊 [AxionGatewayEA MT5] Saldo Real: ", DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2), " ", AccountInfoString(ACCOUNT_CURRENCY), " | Corretora: ", AccountInfoString(ACCOUNT_COMPANY));
   SyncAccountStateToGateway(true);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| EXPERT DEINITIALIZATION                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("🛑 [AxionGatewayEA MT5] Conector finalizado.");
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
      double bid = SymbolInfoDouble(s, SYMBOL_BID);
      double ask = SymbolInfoDouble(s, SYMBOL_ASK);
      if(bid <= 0 || ask <= 0) continue;
      int digits = (int)SymbolInfoInteger(s, SYMBOL_DIGITS);
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
      double bid = SymbolInfoDouble(s, SYMBOL_BID);
      double ask = SymbolInfoDouble(s, SYMBOL_ASK);
      if(bid <= 0 || ask <= 0) continue;
      int digits = (int)SymbolInfoInteger(s, SYMBOL_DIGITS);
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
//| TRANSMISSÃO DE DADOS (STREAMER)                                  |
//+------------------------------------------------------------------+
void BroadcastMarketData()
{
   if(!InpEnableStreamer) return;
   
   ulong nowMs = GetMicrosecondCount() / 1000;
   if(nowMs - lastTickTimeMs < (ulong)InpTickThrottleMs) return;
   lastTickTimeMs = nowMs;

   MqlTick lastTick;
   if(!SymbolInfoTick(_Symbol, lastTick)) return;

   string panel = InpTargetPanel != "" ? InpTargetPanel : _Symbol;
   datetime nowUtc = TimeGMT();

   // 1. Enviar Ticks de Preço / Market Data (referência MT5 de candle = menor preço / Bid)
   double refPrice = lastTick.bid > 0 ? lastTick.bid : lastTick.last;
   string jsonTick = StringFormat(
      "{\"type\":\"market_data\",\"symbol\":\"%s\",\"panel\":\"%s\",\"price\":%s,\"bid\":%s,\"ask\":%s,\"volume\":%I64u,\"updated_at\":\"%s\"}",
      EscapeJsonString(_Symbol), EscapeJsonString(panel),
      DoubleToString(refPrice, _Digits), DoubleToString(lastTick.bid, _Digits), DoubleToString(lastTick.ask, _Digits),
      lastTick.volume, FormatIsoTimestamp(nowUtc)
   );
   SendStreamerPayload(jsonTick);

   // 2. Verificar formação e fechamento de barras de 1 minuto (M1)
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, PERIOD_M1, 0, 2, rates) >= 1)
   {
      datetime barTime = rates[0].time;
      if(barTime != lastCandleMinute)
      {
         lastCandleMinute = barTime;
         datetime barUtc = ServerTimeToUtc(rates[0].time);
         string jsonBar = StringFormat(
            "{\"type\":\"bar\",\"symbol\":\"%s\",\"panel\":\"%s\",\"price\":%s,\"open\":%s,\"high\":%s,\"low\":%s,\"close\":%s,\"volume\":%I64u,\"timestamp\":\"%s\",\"updated_at\":\"%s\"}",
            EscapeJsonString(_Symbol), EscapeJsonString(panel),
            DoubleToString(rates[0].close, _Digits), DoubleToString(rates[0].open, _Digits),
            DoubleToString(rates[0].high, _Digits), DoubleToString(rates[0].low, _Digits),
            DoubleToString(rates[0].close, _Digits), rates[0].tick_volume,
            FormatIsoTimestamp(barUtc), FormatIsoTimestamp(nowUtc)
         );
         SendStreamerPayload(jsonBar);
      }
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
   PollAndProcessCommands();

   ulong nowMs = GetMicrosecondCount() / 1000;
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
   int total = PositionsTotal();
   string json = "[";
   int count = 0;
   for(int i = 0; i < total; i++)
   {
      string sym = PositionGetSymbol(i);
      if(sym != "")
      {
         ulong ticket = PositionGetInteger(POSITION_TICKET);
         long type = PositionGetInteger(POSITION_TYPE);
         string side = (type == POSITION_TYPE_BUY) ? "COMPRA" : "VENDA";
         double lots = PositionGetDouble(POSITION_VOLUME);
         double entry = PositionGetDouble(POSITION_PRICE_OPEN);
         double sl = PositionGetDouble(POSITION_SL);
         double tp = PositionGetDouble(POSITION_TP);
         double profit = PositionGetDouble(POSITION_PROFIT);
         double swap = PositionGetDouble(POSITION_SWAP);
         double netProfit = profit + swap;
         long magic = PositionGetInteger(POSITION_MAGIC);
         datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);
         int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
         if(digits <= 0) digits = 2;

         if(count > 0) json += ",";
         json += StringFormat(
            "{\"ticket\":%I64u,\"symbol\":\"%s\",\"side\":\"%s\",\"lots\":%.2f,\"entry_price\":%s,\"sl\":%s,\"tp\":%s,\"profit\":%.2f,\"net_profit\":%.2f,\"swap\":%.2f,\"magic\":%I64d,\"open_time\":\"%s\"}",
            ticket, EscapeJsonString(sym), side, lots,
            DoubleToString(entry, digits), DoubleToString(sl, digits), DoubleToString(tp, digits),
            netProfit, netProfit, swap, magic, FormatIsoTimestamp(openTime)
         );
         count++;
      }
   }
   json += "]";
   return json;
}

//+------------------------------------------------------------------+
//| SERIALIZAR HISTÓRICO DE NEGÓCIOS FECHADOS EM JSON               |
//+------------------------------------------------------------------+
string GetClosedOrdersHistoryJson()
{
   if(!HistorySelect(0, TimeCurrent())) return "[]";
   int total = HistoryDealsTotal();
   string json = "[";
   int count = 0;
   int start = total > 50 ? total - 50 : 0;
   for(int i = total - 1; i >= start; i--)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket > 0)
      {
         long entryType = HistoryDealGetInteger(ticket, DEAL_ENTRY);
         if(entryType == DEAL_ENTRY_OUT || entryType == DEAL_ENTRY_OUT_BY)
         {
            long type = HistoryDealGetInteger(ticket, DEAL_TYPE);
            // No MT5, um DEAL_ENTRY_OUT de fechamento de COMPRA é um DEAL_TYPE_SELL; invertemos para reportar o lado original da operação
            string side = (type == DEAL_TYPE_SELL) ? "COMPRA" : "VENDA";
            string sym = HistoryDealGetString(ticket, DEAL_SYMBOL);
            int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
            if(digits <= 0) digits = 2;
            double lots = HistoryDealGetDouble(ticket, DEAL_VOLUME);
            double exitPrice = HistoryDealGetDouble(ticket, DEAL_PRICE);
            double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT);
            double comm = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
            double swap = HistoryDealGetDouble(ticket, DEAL_SWAP);
            double netPnl = profit + comm + swap;
            datetime closeTime = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);

            if(count > 0) json += ",";
            json += StringFormat(
               "{\"ticket\":%I64u,\"symbol\":\"%s\",\"side\":\"%s\",\"lots\":%.2f,\"entry_price\":%s,\"exit_price\":%s,\"profit\":%.2f,\"net_profit\":%.2f,\"commission\":%.2f,\"swap\":%.2f,\"close_time\":\"%s\"}",
               ticket, EscapeJsonString(sym), side, lots,
               DoubleToString(exitPrice, digits), DoubleToString(exitPrice, digits),
               profit, netPnl, comm, swap, FormatIsoTimestamp(closeTime)
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
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, PERIOD_M1, 0, maxBars, rates);
   if(copied <= 0) return "[]";
   double curBid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   string json = "[";
   int written = 0;
   for(int i = copied - 1; i >= 0; i--)
   {
      datetime tUtc = ServerTimeToUtc(rates[i].time);
      double o = rates[i].open;
      double h = rates[i].high;
      double l = rates[i].low;
      double c = (i == 0 && curBid > 0) ? curBid : rates[i].close;
      if(i == 0 && curBid > 0)
      {
         if(curBid > h) h = curBid;
         if(curBid < l) l = curBid;
      }
      if(o <= 0 || c <= 0) continue;
      if(written > 0) json += ",";
      json += StringFormat(
         "{\"timestamp\":\"%s\",\"open\":%s,\"high\":%s,\"low\":%s,\"close\":%s,\"volume\":%I64u}",
         FormatIsoTimestamp(tUtc),
         DoubleToString(o, _Digits),
         DoubleToString(h, _Digits),
         DoubleToString(l, _Digits),
         DoubleToString(c, _Digits),
         rates[i].tick_volume
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

   long accLogin = AccountInfoInteger(ACCOUNT_LOGIN);
   double accBal = AccountInfoDouble(ACCOUNT_BALANCE);
   double accEq = AccountInfoDouble(ACCOUNT_EQUITY);
   string accCurr = EscapeJsonString(AccountInfoString(ACCOUNT_CURRENCY));
   string brokerSafe = EscapeJsonString(AccountInfoString(ACCOUNT_COMPANY));
   string accStr = IntegerToString(accLogin);

   double curBid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double curAsk = SymbolInfoDouble(_Symbol, SYMBOL_ASK);

   string posJson = GetOpenPositionsJson();
   string histJson = GetClosedOrdersHistoryJson();
   string quotesJson = GetMarketWatchQuotesJson();
   string candlesJson = GetRecentM1CandlesJson(30);
   string nowIso = FormatIsoTimestamp(TimeGMT());

   string syncAllPayload = StringFormat(
      "{\"instance_id\":\"mt4_sync_all\",\"account\":\"%s\",\"platform\":\"mt5\",\"symbol\":\"%s\",\"bid\":%s,\"ask\":%s,\"price\":%s,\"balance\":%.2f,\"equity\":%.2f,\"currency\":\"%s\",\"broker\":\"%s\",\"positions\":%s,\"history\":%s,\"quotes\":%s,\"candles\":%s,\"updated_at\":\"%s\"}",
      accStr, EscapeJsonString(_Symbol),
      DoubleToString(curBid, _Digits), DoubleToString(curAsk, _Digits), DoubleToString(curBid, _Digits),
      accBal, accEq, accCurr, brokerSafe, posJson, histJson, quotesJson, candlesJson, nowIso
   );
   SendHttpPostJson("/market_data", syncAllPayload, 350);

   if(forceAccountSpecific)
   {
      string syncAccPayload = StringFormat(
         "{\"instance_id\":\"mt4_sync_%s\",\"account\":\"%s\",\"platform\":\"mt5\",\"symbol\":\"%s\",\"bid\":%s,\"ask\":%s,\"price\":%s,\"balance\":%.2f,\"equity\":%.2f,\"currency\":\"%s\",\"broker\":\"%s\",\"positions\":%s,\"history\":%s,\"quotes\":%s,\"candles\":%s,\"updated_at\":\"%s\"}",
         accStr, accStr, EscapeJsonString(_Symbol),
         DoubleToString(curBid, _Digits), DoubleToString(curAsk, _Digits), DoubleToString(curBid, _Digits),
         accBal, accEq, accCurr, brokerSafe, posJson, histJson, quotesJson, candlesJson, nowIso
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

   string brokerClean = AccountInfoString(ACCOUNT_COMPANY);
   StringReplace(brokerClean, " ", "%20");
   long accLogin = AccountInfoInteger(ACCOUNT_LOGIN);
   double accBal = AccountInfoDouble(ACCOUNT_BALANCE);
   double accEq = AccountInfoDouble(ACCOUNT_EQUITY);
   string accCurr = AccountInfoString(ACCOUNT_CURRENCY);
   long accLev = AccountInfoInteger(ACCOUNT_LEVERAGE);
   bool isDemo = (AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_DEMO);

   double curBid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double curAsk = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(curBid <= 0) curBid = accBal;
   if(curAsk <= 0) curAsk = curBid;

   string url = InpGatewayUrl + "/commands?account=" + IntegerToString(accLogin) + 
                "&symbol=" + _Symbol +
                "&bid=" + DoubleToString(curBid, _Digits) +
                "&ask=" + DoubleToString(curAsk, _Digits) +
                "&price=" + DoubleToString(curBid, _Digits) +
                "&platform=mt5" +
                "&balance=" + DoubleToString(accBal, 2) +
                "&equity=" + DoubleToString(accEq, 2) +
                "&currency=" + accCurr +
                "&broker=" + brokerClean +
                "&demo=" + (isDemo ? "1" : "0") +
                "&leverage=" + IntegerToString(accLev);
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
            Print("⚠️ [AxionGatewayEA MT5] WebRequest BLOQUEADO para '", InpGatewayUrl, "' (Erro 4060). Adicione '", InpGatewayUrl, "' em: Ferramentas -> Opções -> Experts!");
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
      if(lot <= 0) lot = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);

      double slPrice = StringToDouble(ExtractJsonValue(response, "stop_loss"));
      double tpPrice = StringToDouble(ExtractJsonValue(response, "take_profit"));
      double slPts = StringToDouble(ExtractJsonValue(response, "sl_points"));
      if(slPts <= 0) slPts = StringToDouble(ExtractJsonValue(response, "stop_loss_points"));
      double tpPts = StringToDouble(ExtractJsonValue(response, "tp_points"));
      if(tpPts <= 0) tpPts = StringToDouble(ExtractJsonValue(response, "take_profit_points"));

      ulong openedTicket = 0;
      bool ok = ExecuteMarketOrder(sym, dir, lot, slPrice, tpPrice, slPts, tpPts, openedTicket);
      lastExecutedCommandId = cmdId;
      if(ok)
      {
         ConfirmCommandExecuted(cmdId, "success", "", openedTicket);
         SyncAccountStateToGateway(true);
      }
      else
      {
         ConfirmCommandExecuted(cmdId, "rejected", trade.ResultRetcodeDescription(), 0);
         SyncAccountStateToGateway(true);
      }
   }
   // 2. Modificação Dinâmica de SL/TP
   else if(action == "modify" || action == "modify_order" || action == "levels")
   {
      ulong ticket = (ulong)StringToInteger(ExtractJsonValue(response, "ticket"));
      string rawSym = ExtractJsonValue(response, "symbol");
      double newSL = StringToDouble(ExtractJsonValue(response, "stop_loss"));
      double newTP = StringToDouble(ExtractJsonValue(response, "take_profit"));
      ModifyPositionSLTP(ticket, rawSym, newSL, newTP);
      lastExecutedCommandId = cmdId;
      ConfirmCommandExecuted(cmdId, "modified", "", ticket);
      SyncAccountStateToGateway(true);
   }
   // 3. Fechamento de Posição / Panic Close
   else if(action == "close" || action == "flat" || action == "flatten_all" || action == "panic_close")
   {
      ulong ticket = (ulong)StringToInteger(ExtractJsonValue(response, "ticket"));
      string rawSym = ExtractJsonValue(response, "symbol");
      if(ticket > 0)
      {
         trade.PositionClose(ticket);
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
bool ExecuteMarketOrder(const string sym, int direction, double lot, double sl, double tp, double slPts, double tpPts, ulong &outTicket)
{
   outTicket = 0;
   string orderSym = ResolveBrokerSymbol(sym);

   int digits = (int)SymbolInfoInteger(orderSym, SYMBOL_DIGITS);
   double point = SymbolInfoDouble(orderSym, SYMBOL_POINT);
   double ask = SymbolInfoDouble(orderSym, SYMBOL_ASK);
   double bid = SymbolInfoDouble(orderSym, SYMBOL_BID);
   if(ask <= 0 || bid <= 0)
   {
      orderSym = _Symbol;
      digits = _Digits;
      point = _Point;
      ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   }

   double minLot = SymbolInfoDouble(orderSym, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(orderSym, SYMBOL_VOLUME_MAX);
   double lotStep = SymbolInfoDouble(orderSym, SYMBOL_VOLUME_STEP);
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
   ENUM_ORDER_TYPE orderType = (direction == 1) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;

   // 1 ponto do Axion = 1.0 (unidade inteira à esquerda da casa decimal)
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

   long stopLevelPoints = SymbolInfoInteger(orderSym, SYMBOL_TRADE_STOPS_LEVEL);
   double minStopDist = stopLevelPoints * point;
   if(minStopDist > 0)
   {
      if(finalSl > 0 && MathAbs(price - finalSl) < minStopDist)
         finalSl = (direction == 1) ? (price - minStopDist) : (price + minStopDist);
      if(finalTp > 0 && MathAbs(finalTp - price) < minStopDist)
         finalTp = (direction == 1) ? (price + minStopDist) : (price - minStopDist);
   }

   price = NormalizeDouble(price, digits);
   if(finalSl > 0) finalSl = NormalizeDouble(finalSl, digits);
   else finalSl = 0;
   if(finalTp > 0) finalTp = NormalizeDouble(finalTp, digits);
   else finalTp = 0;

   trade.SetTypeFillingBySymbol(orderSym);
   if(trade.PositionOpen(orderSym, orderType, normLot, price, finalSl, finalTp, "Axion Web Order"))
   {
      outTicket = trade.ResultOrder();
      Print("✅ [AxionGatewayEA MT5] Ordem executada com sucesso! Ticket: ", outTicket, " | Lote: ", normLot, " | Ativo: ", orderSym, " | SL: ", finalSl, " | TP: ", finalTp);
      return true;
   }

   Print("⚠️ [AxionGatewayEA MT5] Falha inicial (", trade.ResultRetcodeDescription(), "). Tentando execução a mercado seguida de modify...");

   price = (direction == 1) ? SymbolInfoDouble(orderSym, SYMBOL_ASK) : SymbolInfoDouble(orderSym, SYMBOL_BID);
   price = NormalizeDouble(price, digits);
   if(trade.PositionOpen(orderSym, orderType, normLot, price, 0, 0, "Axion Web Order"))
   {
      outTicket = trade.ResultOrder();
      Print("✅ [AxionGatewayEA MT5] Ordem aberta a mercado! Ticket: ", outTicket, ". Aplicando SL e TP...");
      if(finalSl > 0 || finalTp > 0)
      {
         ModifyPositionSLTP(outTicket, orderSym, finalSl, finalTp);
      }
      return true;
   }

   Print("❌ [AxionGatewayEA MT5] Falha ao executar ordem: ", trade.ResultRetcodeDescription());
   return false;
}

//+------------------------------------------------------------------+
//| MODIFICAÇÃO DE SL/TP POR TICKET OU SÍMBOLO                       |
//+------------------------------------------------------------------+
bool ModifyPositionSLTP(ulong ticket, string rawSym, double sl, double tp)
{
   if(ticket > 0 && PositionSelectByTicket(ticket))
   {
      string sym = PositionGetString(POSITION_SYMBOL);
      int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      double normSl = (sl > 0) ? NormalizeDouble(sl, digits) : PositionGetDouble(POSITION_SL);
      double normTp = (tp > 0) ? NormalizeDouble(tp, digits) : PositionGetDouble(POSITION_TP);
      if(trade.PositionModify(ticket, normSl, normTp))
      {
         Print("🔄 [AxionGatewayEA MT5] SL/TP modificado no Ticket: ", ticket, " -> SL: ", normSl, " | TP: ", normTp);
         return true;
      }
   }

   string targetSym = ResolveBrokerSymbol(rawSym);
   bool modifiedAny = false;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      string sym = PositionGetSymbol(i);
      if(sym != "" && (rawSym == "" || sym == targetSym || sym == rawSym))
      {
         ulong posTicket = PositionGetInteger(POSITION_TICKET);
         int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
         double normSl = (sl > 0) ? NormalizeDouble(sl, digits) : PositionGetDouble(POSITION_SL);
         double normTp = (tp > 0) ? NormalizeDouble(tp, digits) : PositionGetDouble(POSITION_TP);
         if(trade.PositionModify(posTicket, normSl, normTp))
         {
            modifiedAny = true;
         }
      }
   }
   return modifiedAny;
}

//+------------------------------------------------------------------+
//| FECHAMENTO DE POSIÇÕES POR SÍMBOLO                               |
//+------------------------------------------------------------------+
void ClosePositionsBySymbol(string rawSym)
{
   string targetSym = ResolveBrokerSymbol(rawSym);
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      string sym = PositionGetSymbol(i);
      if(sym != "" && (sym == targetSym || sym == rawSym))
      {
         ulong ticket = PositionGetInteger(POSITION_TICKET);
         if(ticket > 0) trade.PositionClose(ticket);
      }
   }
}

//+------------------------------------------------------------------+
//| ZERAGEM COMPLETA (PANIC CLOSE)                                   |
//+------------------------------------------------------------------+
void CloseAllPositions()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
      {
         trade.PositionClose(ticket);
      }
   }
   Print("🚨 [AxionGatewayEA MT5] Todas as posições abertas foram encerradas (Panic Close).");
}

//+------------------------------------------------------------------+
//| CONFIRMAR EXECUÇÃO DE COMANDO                                    |
//+------------------------------------------------------------------+
void ConfirmCommandExecuted(string cmdId, string status, string reason = "", ulong ticket = 0)
{
   if(cmdId == "") return;
   string payload = StringFormat(
      "{\"id\":\"%s\",\"status\":\"%s\",\"reason\":\"%s\",\"ticket\":%I64u,\"account\":%I64d}",
      cmdId, status, EscapeJsonString(reason), ticket, AccountInfoInteger(ACCOUNT_LOGIN)
   );
   SendHttpPostJson("/command_ack", payload, 300);
}
