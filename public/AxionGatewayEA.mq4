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
   WebRequest("POST", url, headers, 100, data, result, resultHeaders);
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
//| PROCESSAR COMANDOS DO AXION (ORDENS, SL/TP, FECHAMENTOS)          |
//+------------------------------------------------------------------+
void PollAndProcessCommands()
{
   if(InpGatewayUrl == "") return;
   
   string brokerClean = AccountCompany();
   StringReplace(brokerClean, " ", "%20");
   string url = InpGatewayUrl + "/commands?account=" + IntegerToString(AccountNumber()) + 
                "&symbol=" + _Symbol +
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

   char data[];
   char result[];
   string resultHeaders;
   ResetLastError();
   int res = WebRequest("GET", url, "Content-Type: application/json\r\n", 500, data, result, resultHeaders);
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

      ExecuteMarketOrder(sym, dir, lot, slPrice, tpPrice);
      lastExecutedCommandId = cmdId;
      ConfirmCommandExecuted(cmdId, "success");
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
bool ExecuteMarketOrder(const string sym, int direction, double lot, double sl, double tp)
{
   double ask = MarketInfo(sym, MODE_ASK);
   double bid = MarketInfo(sym, MODE_BID);
   double price = (direction == 1) ? ask : bid;
   int cmd = (direction == 1) ? OP_BUY : OP_SELL;
   color arrowColor = (direction == 1) ? clrBlue : clrRed;

   ResetLastError();
   int ticket = OrderSend(sym, cmd, lot, price, InpSlippagePoints, sl, tp, "Axion Web Order", InpMagicNumber, 0, arrowColor);
   if(ticket > 0)
   {
      Print("✅ [AxionGatewayEA MT4] Ordem executada com sucesso! Ticket: ", ticket, " | Lote: ", lot);
      return true;
   }
   Print("❌ [AxionGatewayEA MT4] Falha ao executar ordem: Erro #", GetLastError());
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
      ResetLastError();
      if(OrderModify(ticket, OrderOpenPrice(), sl, tp, 0, clrYellow))
      {
         Print("🔄 [AxionGatewayEA MT4] SL/TP modificado no Ticket: ", ticket, " -> SL: ", sl, " | TP: ", tp);
         return true;
      }
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
      double closePrice = (OrderType() == OP_BUY) ? MarketInfo(OrderSymbol(), MODE_BID) : MarketInfo(OrderSymbol(), MODE_ASK);
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
void ConfirmCommandExecuted(string cmdId, string status)
{
   if(cmdId == "") return;
   string url = InpGatewayUrl + "/command_ack";
   string payload = StringFormat("{\"id\":\"%s\",\"status\":\"%s\",\"account\":%d}", cmdId, status, AccountNumber());
   char data[];
   StringToCharArray(payload, data, 0, StringLen(payload));
   char result[];
   string resultHeaders;
   ResetLastError();
   WebRequest("POST", url, "Content-Type: application/json\r\n", 300, data, result, resultHeaders);
}
