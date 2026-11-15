//+------------------------------------------------------------------+
//|                                             AxionGatewayEA.mq5   |
//|               Axion Web & Vortex Gateway — MQL5 Universal Conector|
//|               Copyright 2026, VM Gestão & Tecnologia Ltda        |
//|               https://db.vemviraramesa.com.br                    |
//+------------------------------------------------------------------+
#property copyright   "VM Gestão & Tecnologia Ltda"
#property link        "https://db.vemviraramesa.com.br"
#property version     "2.00"
#property description "Conector Universal e Data Streamer para Axion Web / Vortex."
#property description "Sincroniza ordens, posições, saldo, histórico e transmite candles de 1m."
#property strict

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\OrderInfo.mqh>
#include <Trade\HistoryOrderInfo.mqh>

//--- Enums
enum ENUM_GATEWAY_TRANSPORT {
   TRANSPORT_LOCAL_HTTP, // Servidor Local HTTP / REST (:8003)
   TRANSPORT_CLOUD_RELAY // Túnel de Nuvem Relay Hub (Token de Pareamento)
};

//+------------------------------------------------------------------+
//| INPUTS                                                           |
//+------------------------------------------------------------------+
input string                  Group_Conexao        = "=== 1. CONEXÃO AXION GATEWAY ===";
input ENUM_GATEWAY_TRANSPORT  InpTransportMode     = TRANSPORT_CLOUD_RELAY;    // Modo de Transporte
input string                  InpGatewayUrl        = "http://144.126.141.254"; // URL Gateway Local / VPS (Porta 80 Padrão)
input string                  InpPairingToken      = "vps_mt5";                // Token de Pareamento de Nuvem
input int                     InpPollIntervalMs    = 250;                      // Intervalo de Consulta de Ordens (ms)
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
string            lastExecutedCommandId = "";

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
   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetDeviationInPoints(InpSlippagePoints);
   trade.SetTypeFillingBySymbol(_Symbol);

   EventSetMillisecondTimer(MathMax(50, InpPollIntervalMs));
   Print("🚀 [AxionGatewayEA MT5] Conector inicializado para ", _Symbol, " | Conta: ", AccountInfoInteger(ACCOUNT_LOGIN));
   Print("📊 [AxionGatewayEA MT5] Saldo Real: ", DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2), " ", AccountInfoString(ACCOUNT_CURRENCY), " | Corretora: ", AccountInfoString(ACCOUNT_COMPANY));
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

   // 1. Enviar Ticks de Preço / Market Data
   string jsonTick = StringFormat(
      "{\"type\":\"market_data\",\"symbol\":\"%s\",\"panel\":\"%s\",\"price\":%.5f,\"bid\":%.5f,\"ask\":%.5f,\"volume\":%I64u,\"updated_at\":\"%s\"}",
      _Symbol, panel, lastTick.last > 0 ? lastTick.last : lastTick.bid, lastTick.bid, lastTick.ask, lastTick.volume, FormatIsoTimestamp(nowUtc)
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
         string jsonBar = StringFormat(
            "{\"type\":\"bar\",\"symbol\":\"%s\",\"panel\":\"%s\",\"price\":%.5f,\"open\":%.5f,\"high\":%.5f,\"low\":%.5f,\"close\":%.5f,\"volume\":%I64u,\"timestamp\":\"%s\",\"updated_at\":\"%s\"}",
            _Symbol, panel, rates[0].close, rates[0].open, rates[0].high, rates[0].low, rates[0].close, rates[0].tick_volume,
            FormatIsoTimestamp(rates[0].time), FormatIsoTimestamp(nowUtc)
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

   string brokerClean = AccountInfoString(ACCOUNT_COMPANY);
   StringReplace(brokerClean, " ", "%20");
   long accLogin = AccountInfoInteger(ACCOUNT_LOGIN);
   double accBal = AccountInfoDouble(ACCOUNT_BALANCE);
   double accEq = AccountInfoDouble(ACCOUNT_EQUITY);
   string accCurr = AccountInfoString(ACCOUNT_CURRENCY);
   long accLev = AccountInfoInteger(ACCOUNT_LEVERAGE);
   bool isDemo = (AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_DEMO);

   string url = InpGatewayUrl + "/commands?account=" + IntegerToString(accLogin) + 
                "&symbol=" + _Symbol +
                "&platform=mt5" +
                "&balance=" + DoubleToString(accBal, 2) +
                "&equity=" + DoubleToString(accEq, 2) +
                "&currency=" + accCurr +
                "&broker=" + brokerClean +
                "&demo=" + (isDemo ? "1" : "0") +
                "&leverage=" + IntegerToString(accLev);
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
      string sym = ExtractJsonValue(response, "symbol");
      if(sym == "") sym = _Symbol;
      string dirStr = ExtractJsonValue(response, "direction");
      int dir = (int)StringToInteger(dirStr); // 1 = BUY, -1 / 2 = SELL
      if(dir == 0)
      {
         string side = ExtractJsonValue(response, "side");
         StringToUpper(side);
         if(side == "BUY" || side == "COMPRA") dir = 1;
         else if(side == "SELL" || side == "VENDA") dir = 2;
      }

      double lot = StringToDouble(ExtractJsonValue(response, "lots"));
      if(lot <= 0) lot = StringToDouble(ExtractJsonValue(response, "contracts"));
      if(lot <= 0) lot = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
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
      ulong ticket = (ulong)StringToInteger(ExtractJsonValue(response, "ticket"));
      double newSL = StringToDouble(ExtractJsonValue(response, "stop_loss"));
      double newTP = StringToDouble(ExtractJsonValue(response, "take_profit"));
      ModifyPositionSLTP(ticket, newSL, newTP);
      lastExecutedCommandId = cmdId;
      ConfirmCommandExecuted(cmdId, "modified");
   }
   // 3. Fechamento de Posição / Panic Close
   else if(action == "close" || action == "flatten_all" || action == "panic_close")
   {
      ulong ticket = (ulong)StringToInteger(ExtractJsonValue(response, "ticket"));
      if(ticket > 0)
      {
         trade.PositionClose(ticket);
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
   double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
   double bid = SymbolInfoDouble(sym, SYMBOL_BID);
   double price = (direction == 1) ? ask : bid;
   ENUM_ORDER_TYPE orderType = (direction == 1) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;

   if(trade.PositionOpen(sym, orderType, lot, price, sl, tp, "Axion Web Order"))
   {
      Print("✅ [AxionGatewayEA] Ordem executada com sucesso! Ticket: ", trade.ResultOrder(), " | Lote: ", lot);
      return true;
   }
   Print("❌ [AxionGatewayEA] Falha ao executar ordem: ", trade.ResultRetcodeDescription());
   return false;
}

//+------------------------------------------------------------------+
//| MODIFICAÇÃO DE SL/TP                                             |
//+------------------------------------------------------------------+
bool ModifyPositionSLTP(ulong ticket, double sl, double tp)
{
   if(ticket <= 0) return false;
   if(trade.PositionModify(ticket, sl, tp))
   {
      Print("🔄 [AxionGatewayEA] SL/TP modificado no Ticket: ", ticket, " -> SL: ", sl, " | TP: ", tp);
      return true;
   }
   return false;
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
   Print("🚨 [AxionGatewayEA] Todas as posições abertas foram encerradas (Panic Close).");
}

//+------------------------------------------------------------------+
//| CONFIRMAR EXECUÇÃO DE COMANDO                                    |
//+------------------------------------------------------------------+
void ConfirmCommandExecuted(string cmdId, string status)
{
   if(cmdId == "") return;
   string url = InpGatewayUrl + "/command_ack";
   string payload = StringFormat("{\"id\":\"%s\",\"status\":\"%s\",\"account\":%I64u}", cmdId, status, AccountInfoInteger(ACCOUNT_LOGIN));
   char data[];
   StringToCharArray(payload, data, 0, StringLen(payload));
   char result[];
   string resultHeaders;
   ResetLastError();
   WebRequest("POST", url, "Content-Type: application/json\r\n", 300, data, result, resultHeaders);
}
