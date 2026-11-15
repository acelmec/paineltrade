//+------------------------------------------------------------------+
//|                                             AxionGatewayEA.mq4   |
//|               Axion Web & Vortex Gateway — MQL4 Universal Conector|
//|               Copyright 2026, VM Gestão & Tecnologia Ltda        |
//|               https://db.vemviraramesa.com.br                    |
//+------------------------------------------------------------------+
#property copyright   "VM Gestão & Tecnologia Ltda"
#property link        "https://db.vemviraramesa.com.br"
#property version     "2.00"
#property description "Conector Universal e Data Streamer para Axion Web / Vortex."
#property description "Compatível com MetaTrader 4 (MQL4). Sincroniza ordens e candles."
#property strict

//--- Enums
enum ENUM_GATEWAY_TRANSPORT {
   TRANSPORT_LOCAL_HTTP, // Servidor Local HTTP / REST (:8003)
   TRANSPORT_CLOUD_RELAY // Túnel de Nuvem Relay Hub (Token de Pareamento)
};

//+------------------------------------------------------------------+
//| INPUTS                                                           |
//+------------------------------------------------------------------+
extern string                  Group_Conexao        = "=== 1. CONEXÃO AXION GATEWAY ===";
extern ENUM_GATEWAY_TRANSPORT  InpTransportMode     = TRANSPORT_CLOUD_RELAY;    // Modo de Transporte
extern string                  InpGatewayUrl        = "http://144.126.141.254"; // URL Gateway Local / VPS (Porta 80 Padrão)
extern string                  InpPairingToken      = "vps_mt4";                // Token de Pareamento de Nuvem
extern int                     InpPollIntervalMs    = 300;                      // Intervalo de Consulta de Ordens (ms)
extern int                     InpMagicNumber       = 888999;                   // Magic Number das Ordens

extern string                  Group_Streamer       = "=== 2. DATA STREAMER (CANDLES & TICKS) ===";
extern bool                    InpEnableStreamer    = true;                     // Habilitar Envio de Dados de Mercado
extern string                  InpTargetPanel       = "";                       // Painel de Destino (Vazio = mesmo do Símbolo)
extern int                     InpTickThrottleMs    = 100;                      // Throttle de Ticks (ms)

extern string                  Group_Risk           = "=== 3. GESTÃO DE RISCO & EXECUÇÃO ===";
extern double                  InpMaxLotAllowed     = 50.0;                     // Lote Máximo Permitido
extern int                     InpSlippagePoints    = 30;                       // Slippage Tolerada (Pontos)
extern bool                    InpAllowPanicClose   = true;                     // Permitir Zeragem em Pânico Remota

//+------------------------------------------------------------------+
//| VARIÁVEIS GLOBAIS                                                |
//+------------------------------------------------------------------+
datetime lastCandleMinute = 0;
ulong    lastTickTimeMs = 0;
string   lastExecutedCommandId = "";

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
//| EXPERT INITIALIZATION                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   EventSetMillisecondTimer(MathMax(100, InpPollIntervalMs));
   Print("🚀 [AxionGatewayEA MT4] Conector inicializado para ", _Symbol, " | Conta: ", AccountNumber());
   Print("📊 [AxionGatewayEA MT4] Saldo Real: ", DoubleToString(AccountBalance(), 2), " ", AccountCurrency(), " | Corretora: ", AccountCompany(), " (", IsDemo() ? "DEMO" : "REAL", ")");
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
   int maxCount = total > 50 ? 50 : total;
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
      if(count > 0) json += ",";
      json += StringFormat("{\"symbol\":\"%s\",\"bid\":%.5f,\"ask\":%.5f,\"price\":%.5f,\"updated_at\":\"%s\"}",
                           s, bid, ask, (bid + ask) * 0.5, nowIso);
      count++;
   }
   json += "]";
   return json;
}

//+------------------------------------------------------------------+
//| TRANSMISSÃO DE DADOS (STREAMER)                                  |
//+------------------------------------------------------------------+
void BroadcastMarketData()
{
   if(!InpEnableStreamer) return;
   
   ulong nowMs = GetTickCount();
   if(nowMs - lastTickTimeMs < (ulong)InpTickThrottleMs) return;
   lastTickTimeMs = nowMs;

   string panel = InpTargetPanel != "" ? InpTargetPanel : _Symbol;
   datetime nowUtc = TimeGMT();

   // 1. Enviar Ticks de Preço
   string jsonTick = StringFormat(
      "{\"type\":\"market_data\",\"symbol\":\"%s\",\"panel\":\"%s\",\"price\":%.5f,\"bid\":%.5f,\"ask\":%.5f,\"volume\":%I64d,\"updated_at\":\"%s\"}",
      _Symbol, panel, Bid, Bid, Ask, (long)Volume[0], FormatIsoTimestamp(nowUtc)
   );
   SendStreamerPayload(jsonTick);

   // 2. Verificar formação e fechamento de barras de 1 minuto (M1)
   datetime barTime = Time[0];
   if(barTime != lastCandleMinute)
   {
      lastCandleMinute = barTime;
      string jsonBar = StringFormat(
         "{\"type\":\"bar\",\"symbol\":\"%s\",\"panel\":\"%s\",\"price\":%.5f,\"open\":%.5f,\"high\":%.5f,\"low\":%.5f,\"close\":%.5f,\"volume\":%I64d,\"timestamp\":\"%s\",\"updated_at\":\"%s\"}",
         _Symbol, panel, Close[0], Open[0], High[0], Low[0], Close[0], (long)Volume[0],
         FormatIsoTimestamp(Time[0]), FormatIsoTimestamp(nowUtc)
      );
      SendStreamerPayload(jsonBar);
   }

   // 3. Transmissão periódica das cotações de todos os ativos do Market Watch
   static ulong lastMwBroadcastMs = 0;
   if(nowMs - lastMwBroadcastMs >= 350)
   {
      lastMwBroadcastMs = nowMs;
      string mwQuotes = GetMarketWatchQuotesJson();
      if(mwQuotes != "[]" && mwQuotes != "")
      {
         string mwJson = StringFormat("{\"type\":\"quotes_batch\",\"quotes\":%s}", mwQuotes);
         SendStreamerPayload(mwJson);
      }
   }
}

void OnTick()
{
   BroadcastMarketData();
}

//+------------------------------------------------------------------+
//| ON TIMER: POLLING DE ORDENS & ATUALIZAÇÃO DE CONTA               |
//+------------------------------------------------------------------+
void OnTimer()
{
   PollAndProcessCommands();

   // Garante envio contínuo das cotações de todos os ativos do Market Watch mesmo se não houver ticks no gráfico atual
   static ulong lastTimerMwMs = 0;
   ulong nowMs = GetTickCount();
   if(nowMs - lastTimerMwMs >= 400)
   {
      lastTimerMwMs = nowMs;
      string mwQuotes = GetMarketWatchQuotesJson();
      if(mwQuotes != "[]" && mwQuotes != "")
      {
         string mwJson = StringFormat("{\"type\":\"quotes_batch\",\"quotes\":%s}", mwQuotes);
         SendStreamerPayload(mwJson);
      }
   }
}

//+------------------------------------------------------------------+
//| ENVIO DE STREAMER PAYLOAD                                        |
//+------------------------------------------------------------------+
void SendStreamerPayload(string json)
{
   if(InpGatewayUrl == "") return;
   string url = InpGatewayUrl + "/streamer";
   string headers = "Content-Type: application/json\r\n";
   char data[];
   StringToCharArray(json, data, 0, StringLen(json));
   char result[];
   string resultHeaders;
   ResetLastError();
   int res = WebRequest("POST", url, headers, 150, data, result, resultHeaders);
   if(res == -1 && StringFind(url, "144.126.141.254") >= 0)
   {
      string localUrl = url;
      StringReplace(localUrl, "144.126.141.254", "127.0.0.1");
      WebRequest("POST", localUrl, headers, 150, data, result, resultHeaders);
   }
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
            string side = (type == OP_BUY) ? "COMPRA" : "VENDA";
            json += StringFormat(
               "{\"ticket\":%d,\"symbol\":\"%s\",\"side\":\"%s\",\"lots\":%.2f,\"entry_price\":%.5f,\"sl\":%.5f,\"tp\":%.5f,\"profit\":%.2f,\"magic\":%d,\"open_time\":\"%s\"}",
               OrderTicket(), OrderSymbol(), side, OrderLots(), OrderOpenPrice(), OrderStopLoss(), OrderTakeProfit(), OrderProfit(), OrderMagicNumber(), FormatIsoTimestamp(OrderOpenTime())
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
   int start = total > 30 ? total - 30 : 0;
   for(int i = total - 1; i >= start; i--)
   {
      if(OrderSelect(i, SELECT_BY_POS, MODE_HISTORY))
      {
         int type = OrderType();
         if(type == OP_BUY || type == OP_SELL)
         {
            if(count > 0) json += ",";
            string side = (type == OP_BUY) ? "COMPRA" : "VENDA";
            double netPnl = OrderProfit() + OrderCommission() + OrderSwap();
            json += StringFormat(
               "{\"ticket\":%d,\"symbol\":\"%s\",\"side\":\"%s\",\"lots\":%.2f,\"entry_price\":%.5f,\"exit_price\":%.5f,\"sl\":%.5f,\"tp\":%.5f,\"profit\":%.2f,\"net_profit\":%.2f,\"commission\":%.2f,\"swap\":%.2f,\"magic\":%d,\"open_time\":\"%s\",\"close_time\":\"%s\"}",
               OrderTicket(), OrderSymbol(), side, OrderLots(), OrderOpenPrice(), OrderClosePrice(), OrderStopLoss(), OrderTakeProfit(), OrderProfit(), netPnl, OrderCommission(), OrderSwap(), OrderMagicNumber(), FormatIsoTimestamp(OrderOpenTime()), FormatIsoTimestamp(OrderCloseTime())
            );
            count++;
         }
      }
   }
   json += "]";
   return json;
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
   if(TimeCurrent() - lastSymbolsSend > 30)
   {
      lastSymbolsSend = TimeCurrent();
      string mw = GetMarketWatchSymbols();
      if(mw != "") url += "&symbols=" + mw;
   }

   string posJson = GetOpenPositionsJson();
   string histJson = GetClosedOrdersHistoryJson();
   string quotesJson = GetMarketWatchQuotesJson();
   string reqBody = StringFormat(
      "{\"account\":\"%d\",\"symbol\":\"%s\",\"bid\":%.5f,\"ask\":%.5f,\"price\":%.5f,\"balance\":%.2f,\"equity\":%.2f,\"broker\":\"%s\",\"positions\":%s,\"history\":%s,\"quotes\":%s}",
      AccountNumber(), _Symbol, Bid, Ask, Bid, AccountBalance(), AccountEquity(), AccountCompany(), posJson, histJson, quotesJson
   );
   char data[];
   StringToCharArray(reqBody, data, 0, StringLen(reqBody));
   char result[];
   string resultHeaders;
   ResetLastError();
   int res = WebRequest("POST", url, "Content-Type: application/json\r\n", 500, data, result, resultHeaders);
   if(res == -1)
   {
      ArrayResize(data, 0);
      res = WebRequest("GET", url, "Content-Type: application/json\r\n", 500, data, result, resultHeaders);
   }
   if(res == -1 && StringFind(url, "144.126.141.254") >= 0)
   {
      string localUrl = url;
      StringReplace(localUrl, "144.126.141.254", "127.0.0.1");
      StringToCharArray(reqBody, data, 0, StringLen(reqBody));
      res = WebRequest("POST", localUrl, "Content-Type: application/json\r\n", 500, data, result, resultHeaders);
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
      string sym = ExtractJsonValue(response, "symbol");
      if(sym == "") sym = _Symbol;
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
      if(lot <= 0) lot = MarketInfo(sym, MODE_MINLOT);
      lot = MathMin(lot, InpMaxLotAllowed);

      double slPrice = StringToDouble(ExtractJsonValue(response, "stop_loss"));
      double tpPrice = StringToDouble(ExtractJsonValue(response, "take_profit"));
      double slPts = StringToDouble(ExtractJsonValue(response, "sl_points"));
      double tpPts = StringToDouble(ExtractJsonValue(response, "tp_points"));

      bool ok = ExecuteMarketOrder(sym, dir, lot, slPrice, tpPrice, slPts, tpPts);
      lastExecutedCommandId = cmdId;
      if(ok)
      {
         ConfirmCommandExecuted(cmdId, "success");
      }
      else
      {
         ConfirmCommandExecuted(cmdId, "rejected", "OrderSend falhou com erro #" + IntegerToString(GetLastError()));
      }
   }
   // 2. Modificação Dinâmica de SL/TP
   else if(action == "modify" || action == "modify_order")
   {
      int ticket = (int)StringToInteger(ExtractJsonValue(response, "ticket"));
      double newSL = StringToDouble(ExtractJsonValue(response, "stop_loss"));
      double newTP = StringToDouble(ExtractJsonValue(response, "take_profit"));
      ModifyPositionSLTP(ticket, newSL, newTP);
      lastExecutedCommandId = cmdId;
      ConfirmCommandExecuted(cmdId, "modified");
   }
   // 3. Fechamento de Posição / Panic Close
   else if(action == "close" || action == "flatten_all" || action == "panic_close")
   {
      int ticket = (int)StringToInteger(ExtractJsonValue(response, "ticket"));
      if(ticket > 0)
      {
         CloseSingleTicket(ticket);
      }
      else if(InpAllowPanicClose)
      {
         CloseAllPositions();
      }
      lastExecutedCommandId = cmdId;
      ConfirmCommandExecuted(cmdId, "closed");
   }
}

//+------------------------------------------------------------------+
//| EXECUÇÃO DE ORDEM A MERCADO                                      |
//+------------------------------------------------------------------+
bool ExecuteMarketOrder(const string sym, int direction, double lot, double sl, double tp, double slPts = 0, double tpPts = 0)
{
   string orderSym = sym;
   if(orderSym == "" || MarketInfo(orderSym, MODE_ASK) == 0)
   {
      orderSym = _Symbol;
   }

   int digits = (int)MarketInfo(orderSym, MODE_DIGITS);
   double point = MarketInfo(orderSym, MODE_POINT);
   double ask = MarketInfo(orderSym, MODE_ASK);
   double bid = MarketInfo(orderSym, MODE_BID);
   double price = (direction == 1) ? ask : bid;
   int cmd = (direction == 1) ? OP_BUY : OP_SELL;
   color arrowColor = (direction == 1) ? clrBlue : clrRed;

   // 1 ponto do Axion = 1.0 (unidade inteira à esquerda da casa decimal).
   // Se informado sl_points / tp_points do Axion, calcula a partir do preço de mercado de execução no MT4!
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
   if(finalTp > 0) finalTp = NormalizeDouble(finalTp, digits);

   ResetLastError();
   int ticket = OrderSend(orderSym, cmd, lot, price, InpSlippagePoints, finalSl, finalTp, "Axion Web Order", InpMagicNumber, 0, arrowColor);
   if(ticket > 0)
   {
      Print("✅ [AxionGatewayEA MT4] Ordem executada com sucesso! Ticket: ", ticket, " | Lote: ", lot, " | Ativo: ", orderSym, " | Preço: ", price, " | SL: ", finalSl, " | TP: ", finalTp);
      return true;
   }

   int err = GetLastError();
   Print("⚠️ [AxionGatewayEA MT4] Falha inicial ao executar ordem (#", err, "). Tentando contingência sem SL/TP...");

   // Contingência caso a corretora rejeite ordem a mercado com SL/TP acoplados
   price = (direction == 1) ? MarketInfo(orderSym, MODE_ASK) : MarketInfo(orderSym, MODE_BID);
   price = NormalizeDouble(price, digits);
   ticket = OrderSend(orderSym, cmd, lot, price, InpSlippagePoints * 2, 0, 0, "Axion Web Order", InpMagicNumber, 0, arrowColor);
   if(ticket > 0)
   {
      Print("✅ [AxionGatewayEA MT4] Ordem aberta a mercado sem SL/TP! Ticket: ", ticket, ". Ajustando SL e TP via modify...");
      if(finalSl > 0 || finalTp > 0)
      {
         Sleep(250);
         ModifyPositionSLTP(ticket, finalSl, finalTp);
      }
      return true;
   }

   Print("❌ [AxionGatewayEA MT4] Falha definitiva ao executar ordem: Erro #", GetLastError());
   return false;
}

//+------------------------------------------------------------------+
//| MODIFICAÇÃO DE SL/TP                                             |
//+------------------------------------------------------------------+
bool ModifyPositionSLTP(int ticket, double sl, double tp)
{
   if(ticket <= 0) return false;
   if(OrderSelect(ticket, SELECT_BY_TICKET))
   {
      int digits = (int)MarketInfo(OrderSymbol(), MODE_DIGITS);
      double normSl = (sl > 0) ? NormalizeDouble(sl, digits) : 0;
      double normTp = (tp > 0) ? NormalizeDouble(tp, digits) : 0;
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

//+------------------------------------------------------------------+
//| FECHAMENTO DE UM TICKET INDIVIDUAL                               |
//+------------------------------------------------------------------+
bool CloseSingleTicket(int ticket)
{
   if(OrderSelect(ticket, SELECT_BY_TICKET))
   {
      int digits = (int)MarketInfo(OrderSymbol(), MODE_DIGITS);
      double closePrice = (OrderType() == OP_BUY) ? MarketInfo(OrderSymbol(), MODE_BID) : MarketInfo(OrderSymbol(), MODE_ASK);
      closePrice = NormalizeDouble(closePrice, digits);
      return OrderClose(ticket, OrderLots(), closePrice, InpSlippagePoints, clrWhite);
   }
   return false;
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
void ConfirmCommandExecuted(string cmdId, string status, string reason = "")
{
   if(cmdId == "") return;
   string url = InpGatewayUrl + "/command_ack";
   string payload = StringFormat("{\"id\":\"%s\",\"status\":\"%s\",\"reason\":\"%s\",\"account\":%d}", cmdId, status, reason, AccountNumber());
   char data[];
   StringToCharArray(payload, data, 0, StringLen(payload));
   char result[];
   string resultHeaders;
   ResetLastError();
   int res = WebRequest("POST", url, "Content-Type: application/json\r\n", 300, data, result, resultHeaders);
   if(res == -1 && StringFind(url, "144.126.141.254") >= 0)
   {
      string localUrl = url;
      StringReplace(localUrl, "144.126.141.254", "127.0.0.1");
      WebRequest("POST", localUrl, "Content-Type: application/json\r\n", 300, data, result, resultHeaders);
   }
}
