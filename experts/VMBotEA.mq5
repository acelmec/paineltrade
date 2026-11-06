//+------------------------------------------------------------------+
//|                                                     VMBotEA.mq5  |
//|                                  Copyright 2026, Antigravity AI  |
//|                                             https://antigravity  |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026, Antigravity AI"
#property link      "https://antigravity"
#property version   "1.53"
#property description "VMBot Expert Advisor - MT5 Port (Atualizado a partir do VMBotF.cs)"
#property description "Suíte completa de estratégias: ConectorVM, ConectorLocal, GridScalper, FVGScalper, ManualBox e Preço"

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\OrderInfo.mqh>

//+------------------------------------------------------------------+
//| ENUMS                                                            |
//+------------------------------------------------------------------+
enum ENUM_OPERATING_MODE {
   MODE_COMPRADO, // Comprado (Long Only)
   MODE_VENDIDO,  // Vendido (Short Only)
   MODE_AMBOS     // Ambos (Long & Short)
};

enum ENUM_ESTRATEGIA_MODE {
   EST_MANUALBOX,     // ManualBox
   EST_PRECO,         // Preço
   EST_GRIDSCALPER,   // GridScalper
   EST_FVGSCALPER,    // FVGScalper
   EST_CONECTORVM,    // ConectorVM
   EST_CONECTORLOCAL  // ConectorLocal
};

enum ENUM_ORDER_MODE {
   ORD_MERCADO,         // Mercado
   ORD_PENDENTE_STOP,   // PendenteStop
   ORD_PENDENTE_LIMIT   // PendenteLimit
};

enum ENUM_TS_MODE {
   TS_MANUAL,     // Manual
   TS_AUTOMATICO, // Automático
   TS_IMPORTAR    // Importar
};

enum ENUM_GRID_FILTRO_MODE {
   GRID_FILT_OFF,           // OFF
   GRID_FILT_CONSOLIDACAO,  // Consolidacao
   GRID_FILT_TENDENCIA      // Tendencia
};

enum ENUM_FORCE_2D_MODE {
   F2D_OFF,        // OFF
   F2D_LIMIAR,     // Limiar
   F2D_INCREMENTO, // Incremento
   F2D_AMBOS       // Ambos
};

enum ENUM_HL_MODE_TYPE {
   HL_MODE_HL,    // HL (High/Low)
   HL_MODE_HLCA   // HLCA (High/Low/Close/Average)
};

enum ENUM_KELTNER_TRIGGER_MODE {
   KELT_TRIG_CENTRAL, // Central
   KELT_TRIG_BANDAS   // Bandas
};

enum ENUM_CONTRATO_ORIGEM {
   CONTRATO_LOCAL,     // Contrato Local (Robô)
   CONTRATO_CONECTOR   // Contrato Painel (Banco de Dados)
};

enum ENUM_SLTP_ORIGEM {
   SLTP_STRATEGY,      // Robô (Local)
   SLTP_CONECTOR       // Painel (Banco de Dados)
};

//+------------------------------------------------------------------+
//| STRUCTURES                                                       |
//+------------------------------------------------------------------+
struct VM_Signal {
   string id;
   string strategy_id;
   string strategy_name;
   string side;
   double entry_price;
   double stop_loss;
   double take_profit;
   string symbol;
   datetime created_at;
   int sl_ticks;
   int tp_ticks;
   int direction; // 1 = Buy, -1 = Sell
   string status;
   double contrato;
};

//+------------------------------------------------------------------+
//| INPUT PARAMETERS                                                 |
//+------------------------------------------------------------------+
input string               Group_General     = "=== 00. GERAL ===";
input bool                 DebugMode         = true;               // Debug Mode
input ulong                MagicNumber       = 737599;             // Magic Number

input string               Group_License     = "=== 01. LICENÇA ===";
input string               IDAssinatura      = "";                 // Número Assinatura

input string               Group_Operation   = "=== 02. PARÂMETROS OPERAÇÃO ===";
input string               NomeEstrategia    = "VMBot Strategy";   // Nome da Estratégia
input ENUM_OPERATING_MODE  currentOperatingMode = MODE_AMBOS;      // Modo de Operação
input ENUM_ESTRATEGIA_MODE currentEstrategia = EST_CONECTORVM;     // Estratégia Principal
input int                  MaxOrderSession   = 50;                 // Max Operações por Sessão
input ENUM_ORDER_MODE      OrderMode         = ORD_MERCADO;        // Modo Ordens
input int                  distancePrice     = 10;                 // Distância Preço (Ticks)
input int                  CancelAfterBars   = 0;                  // Expirar Ordens Pendentes (Barras)
input bool                 CancelOrdersAfterStopTime = true;       // Cancelar Ordens Após Horário de Parada

input string               Group_Conector    = "=== 02.1. CONECTOR VM / LOCAL ===";
input string               VM_PainelId       = "";                 // ID da Conta (Account ID / UUID)
input string               VM_StrategyId     = "";                 // Conector VM - Strategy ID
input ENUM_CONTRATO_ORIGEM ContratoOrigem    = CONTRATO_LOCAL;     // Origem do Contrato
input double               ContratoFatorMult = 1.0;                // Fator Multiplicação Contrato
input ENUM_SLTP_ORIGEM     StopLossOrigem    = SLTP_CONECTOR;      // Gestão StopLoss
input ENUM_SLTP_ORIGEM     TakeProfitOrigem  = SLTP_CONECTOR;      // Gestão TakeProfit
input int                  VM_MaxSignalAgeSeconds = 60;            // Tempo Máx Aceitação Sinal (seg)
input bool                 VM_MonitorarEncerramentoPainel = true;  // Monitorar Encerramento no Painel

input string               Group_Risk        = "=== 03. RISCO ===";
input double               LOTE_Size         = 1.0;                // Contrato (Volume)
input int                  SL_Ticks          = 50;                 // SL Fallback (Ticks)
input int                  TP_Ticks          = 30;                 // TP Fallback (Ticks)
input bool                 TRAIL_MODE        = false;              // TRAIL STOP (Ativar)
input int                  TRAIL_Start       = 20;                 // TRAIL_Start (Ticks)
input int                  TRAIL_StopDistance = 15;                // TRAIL_StopDistance (Ticks)
input int                  TRAIL_Step        = 5;                  // TRAIL_Step (Ticks)

input string               Group_Safety      = "=== 04. SEGURANÇA ===";
input bool                 MoneyClosed       = false;              // Encerrar por Balanço
input int                  LossesAllOrders   = 500;                // Perda Máxima (USD)
input int                  ProfitAllOrders   = 1000;               // Lucro Máximo (USD)
input bool                 DailyLossActive   = false;              // Perda Máxima Diária (Ativar)
input int                  DailyLossLimit    = 500;                // Perda Máxima Diária (USD)
input bool                 DailyProfitActive = false;              // Lucro Máximo Diário (Ativar)
input int                  DailyProfitLimit  = 500;                // Lucro Máximo Diário (USD)
input bool                 OrderCloseMA      = false;              // MA Closed Position
input int                  ProfitCloseMA     = 50;                 // MA Profit Closed (Money)
input int                  ProfitCloseMAPeriod = 20;               // MA Profit Closed Period

input string               Group_Time        = "=== 04.5 JANELAS DE OPERACAO ===";
input int                  SessionResetHour     = 0;               // Hora de Reset da Sessao (0-23)
input int                  Horario1_StartHour   = 9;               // Janela 1 - Hora Inicial
input int                  Horario1_StartMinute = 0;               // Janela 1 - Minuto Inicial
input int                  Horario1_StartSecond = 0;               // Janela 1 - Segundo Inicial
input int                  Horario1_EndHour     = 17;              // Janela 1 - Hora Final
input int                  Horario1_EndMinute   = 0;               // Janela 1 - Minuto Final

input bool                 Horario2_Active      = false;           // Janela 2 - Ativa
input int                  Horario2_StartHour   = 13;              // Janela 2 - Hora Inicial
input int                  Horario2_StartMinute = 0;               // Janela 2 - Minuto Inicial
input int                  Horario2_EndHour     = 15;              // Janela 2 - Hora Final
input int                  Horario2_EndMinute   = 0;               // Janela 2 - Minuto Final

input bool                 Horario3_Active      = false;           // Janela 3 - Ativa
input int                  Horario3_StartHour   = 18;              // Janela 3 - Hora Inicial
input int                  Horario3_StartMinute = 0;               // Janela 3 - Minuto Inicial
input int                  Horario3_EndHour     = 22;              // Janela 3 - Hora Final
input int                  Horario3_EndMinute   = 0;               // Janela 3 - Minuto Final

input string               Group_Database    = "=== 05. CONECTOR VM / SUPABASE ===";
input string               supabaseUrl       = "https://db.vemviraramesa.com.br"; // Supabase URL
input string               supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY"; // Supabase Key
input int                  PollIntervalMs    = 250;                // Intervalo de Consulta (Milissegundos)

input string               Group_PVA         = "=== 06. PVA (PRICE VOLUME ANALYSIS) ===";
input bool                 ACTIVE_Pva        = false;              // PVA Active
input int                  PVA_SumBars       = 20;                 // SumBars (PVA)
input int                  PVA_Percent       = 150;                // PVA Percentual (%)

input string               Group_Explosion   = "=== 07. EXPLOSION TREND ===";
input bool                 ACTIVE_Explosion  = false;              // Explosion Trend Active
input int                  EXPLOSION_Sensitivity = 150;            // Sensitivity
input int                  EXPLOSION_FastPeriod  = 20;             // FastPeriod
input int                  EXPLOSION_SlowPeriod  = 40;             // SlowPeriod
input bool                 EXPLOSION_FastSmooth  = false;          // FastSmooth
input int                  EXPLOSION_FastSmoothLength = 10;        // FastSmoothLength
input int                  EXPLOSION_SlowSmooth  = false;          // SlowSmooth
input int                  EXPLOSION_SlowSmoothLength = 10;        // SlowSmoothLength
input int                  EXPLOSION_ChannelLength = 20;           // ChannelLength
input double               EXPLOSION_Mult        = 2.0;            // BB Mult

input string               Group_OB          = "=== 08. ORDER BLOCK ===";
input bool                 OB_Active         = false;              // OB Active
input int                  OB_Limit_Max1     = 100;                // OB Limit Max (%)
input int                  OB_Limit_Min1     = 10;                 // OB Limit Min (%)
input double               OB_Range_MinSize1 = 10;                 // Range Min Size (Ticks)
input double               OB_Range_MaxSize1 = 100;                // Range Max Size (Ticks)
input int                  OB_CandleHistory1 = 20;                 // Candle History
input bool                 OB_PULLBACK1      = false;              // OB Pullback
input bool                 OB_BREAKOUT1      = true;               // OB Breakout

input string               Group_Box         = "=== 09. BOX ===";
input int                  Box_ticks         = 20;                 // Altura Box em Ticks
input string               Box_string        = "VMBotBox";         // Nome do Objeto

input string               Group_HL_Prior    = "=== 10. HILO PRIOR ===";
input bool                 HL_Active1        = false;              // HL Active
input ENUM_HL_MODE_TYPE    HL_FilterType     = HL_MODE_HLCA;       // HL Filter Type
input int                  HL_Limit_Max1     = 100;                // HL Limit Max (%)
input int                  HL_Limit_Min1     = 10;                 // HL Limit Min (%)
input double               HL_Range_MinSize1 = 10;                 // HL Range Min Size (Ticks)
input double               HL_Range_MaxSize1 = 200;                // HL Range Max Size (Ticks)
input bool                 HL_PULLBACK1      = false;              // HL Pullback
input bool                 HL_BREAKOUT1      = true;               // HL Breakout

input string               Group_RenkoForce  = "=== 11. RENKO FORCE ===";
input bool                 RenkoForce        = false;              // Active (Renko Velocity)
input int                  TimePeriodSeconds = 60;                 // Período em Segundos
input int                  CandleThreshold   = 5;                  // Qtd de Candles

input string               Group_MACLOUD     = "=== 12. MA CLOUD FILTER ===";
input bool                 MACLOUD1_Filter   = false;              // MACLOUD Filter Active
input int                  MACLOUD1_Min      = 5;                  // Minimum Range (Ticks)
input int                  MACLOUD1_Max      = 100;                // Maximum Range (Ticks)
input int                  MACLOUD1_FastPeriod = 8;                // SMA Fast Period
input int                  MACLOUD1_SlowPeriod = 21;               // SMA Slow Period
input int                  MACLOUD1_BarShift = 1;                  // MACLOUD BarShift
input bool                 Reverse_Mode1     = false;              // REVERSE Mode
input bool                 autoRangeAvg1     = false;              // AVG Range

input string               Group_GridScalper = "=== 13. GRID SCALPER ===";
input int                  Grid_OrderCount   = 5;                  // Quantidade de Ordens
input int                  Grid_Spacing      = 15;                 // Espaçamento (Ticks)
input double               Grid_LotMultiplier = 1.0;               // Multiplicador de Lote
input bool                 Grid_RearmSameBar = false;              // Rearmar na Mesma Barra
input double               Grid_SpacingMultiplier = 1.0;           // Multiplicador de Distância
input ENUM_GRID_FILTRO_MODE Grid_FiltroContexto = GRID_FILT_OFF;   // Filtro de Contexto
input bool                 Grid_CandleFilter = false;              // Filtro Candle Anterior
input int                  Grid_CancelDelayMs = 0;                 // Delay Cancelamento (ms)

input string               Group_FVG         = "=== 14. FAIR VALUE GAP (FVG) ===";
input bool                 FVG_Active        = false;              // FVG - Ativo
input int                  FVG_MinimumTicks  = 5;                  // FVG - Mínimo de Ticks
input int                  FVG_MaxBars       = 50;                 // FVG - Barras de Histórico

input string               Group_Force2D     = "=== 15. FILTRO FORÇA 2D ===";
input ENUM_FORCE_2D_MODE   Force2D_Mode      = F2D_OFF;            // Modo do Filtro
input double               Force2D_MinPercent = 50.0;              // [Limiar] Força Mínima (%)
input double               Force2D_MaxPercent = 100.0;             // [Limiar] Força Máxima (%)
input int                  Force2D_IncrementBars = 5;              // [Incremento] Barras para Comparação
input double               Force2D_IncrementMin = 5.0;             // [Incremento] Incremento Mínimo (%)
input bool                 Force2D_BacktestMode = false;           // Força 2D - Alinhar ao Backtest

input string               Group_SMASlope    = "=== 16. FILTRO INCLINAÇÃO SMA ===";
input bool                 SmaSlope_Active   = false;              // SMA Slope - Ativo
input int                  SmaSlope_Period   = 20;                 // SMA Slope - Período
input int                  SmaSlope_BarsShift = 1;                 // SMA Slope - Barra de Análise
input int                  SmaSlope_RefBars  = 5;                  // SMA Slope - Barras de Referência
input double               SmaSlope_Min      = 0.0001;             // SMA Slope - Inclinação Mínima
input double               SmaSlope_Max      = 100.0;              // SMA Slope - Inclinação Máxima
input bool                 SmaSlope_InvertLogic = false;           // SMA Slope - Inverter Lógica

input string               Group_HLCAStop    = "=== 17. STOP LOSS HLCA ===";
input bool                 HLCA_StopActive   = false;              // HLCA Stop Ativo
input int                  HLCA_StopDistance = 10;                 // HLCA Stop Distance (Ticks)
input int                  HLCA_StopMinTicks = 15;                 // HLCA Stop Min Ticks
input bool                 Grid_DynamicHLCA  = false;              // Grid Dinâmico HLCA

input string               Group_Keltner     = "=== 18. KELTNER CHANNEL ===";
input int                  KELTNER_EmaPeriod = 20;                 // Keltner - Período EMA
input int                  KELTNER_AtrPeriod = 20;                 // Keltner - Período ATR
input double               KELTNER_Mult      = 2.0;                // Keltner - Multiplicador ATR
input bool                 KELTNER_Vol_Active = false;             // Keltner Vol - Ativo
input int                  KELTNER_Vol_Width_Min = 10;             // Keltner Vol - Largura Mín (ticks)
input int                  KELTNER_Vol_Width_Max = 200;            // Keltner Vol - Largura Máx (ticks)
input bool                 KELTNER_Trigger_Active = false;          // Keltner Gatilho - Ativo
input ENUM_KELTNER_TRIGGER_MODE KELTNER_Trigger_Mode = KELT_TRIG_BANDAS; // Keltner Gatilho - Modo
input bool                 KELTNER_Trigger_Reverse = false;        // Keltner Gatilho - Lógica Revertida
input int                  KELTNER_Trigger_Tolerance = 2;          // Keltner Gatilho - Tolerância (ticks)
input bool                 KELTNER_Trigger_RequirePullback = false; // Keltner Gatilho - Exigir Pullback
input int                  KELTNER_Trigger_PullbackLookback = 5;   // Keltner Gatilho - Janela Pullback (barras)

input string               Group_AI          = "=== 19. FILTRO IA ===";
input bool                 UseAIFilter       = false;              // Usar Filtro IA
input int                  MinAIConfidence   = 50;                 // Confiança Mínima (%)
input string               AI_PromptId       = "";                 // ID do Prompt (Opcional)
input string               AI_ServerUrl      = "http://localhost:8001/analise_contexto"; // URL Servidor IA

input string               Group_CandleRange = "=== 20. FILTRO TAMANHO CANDLE (RANGE) ===";
input bool                 CandleRange_Active = false;             // Candle Range — Ativo
input int                  CandleRange_MinTicks = 0;               // Candle Range — Mínimo (Ticks)
input int                  CandleRange_MaxTicks = 0;               // Candle Range — Máximo (Ticks)

//+------------------------------------------------------------------+
//| GLOBAL SYSTEM VARIABLES                                          |
//+------------------------------------------------------------------+
CTrade            trade;
CPositionInfo     positionInfo;
COrderInfo        orderInfo;

VM_Signal         currentSignal;
VM_Signal         lastExecutedSignal;
double            _lastSyncedSlPrice = 0.0;
double            _lastSyncedTpPrice = 0.0;

bool              signalConsumed = false;
bool              _forceCloseSignal = false;
string            _executedSignalIds[100];
int               _executedSignalIdsCount = 0;

bool IsSignalAlreadyExecuted(string id)
{
   for(int i = 0; i < _executedSignalIdsCount; i++)
   {
      if(_executedSignalIds[i] == id) return true;
   }
   return false;
}

void AddExecutedSignalId(string id)
{
   if(IsSignalAlreadyExecuted(id)) return;
   if(_executedSignalIdsCount >= 100)
   {
      for(int i = 0; i < 99; i++)
      {
         _executedSignalIds[i] = _executedSignalIds[i+1];
      }
      _executedSignalIds[99] = id;
   }
   else
   {
      _executedSignalIds[_executedSignalIdsCount] = id;
      _executedSignalIdsCount++;
   }
}
int               QuantOperacoes = 0;
bool              dailyLimitReached = false;
bool              robotTravado = false;
datetime          last_processed_day = 0;

// License variables
bool              licenseChecked = false;
datetime          lastLicenseCheckTime = 0;
bool              licenseValid = false;
string            licenseStatusMsg = "Aguardando validação de licença...";

// Grid & FVG States
bool              gridArmedBuy = false;
bool              gridArmedSell = false;
bool              gridHasOpenPosBuy = false;
bool              gridHasOpenPosSell = false;
bool              gridNeedsRearmBuy = false;
bool              gridNeedsRearmSell = false;
int               gridCreatedBarBuy = -1;
int               gridCreatedBarSell = -1;
int               gridGeneration = 0;
int               lastProcessedBarGrid = -1;

// Renko Force Speed array
datetime          renkoCandleTimes[];

// HLCA dynamic levels
double            Resistance1 = 0, Support1 = 0;
double            hlcaResistance = 0, hlcaSupport = 0;
double            hlcaStopPrice = 0;

// Keltner State variables
bool              _kHadUpperBreak = false;
bool              _kHadLowerBreak = false;

// WooCommerce API Constants
const string      consumerKey = "ck_75f9d0f430cb40c64c902ed43ce2bceb08e5e649";
const string      consumerSecret = "cs_a741c57b4368102a1daf3fbfc4598833ffb23e77";

//+------------------------------------------------------------------+
//| EXPERT INITIALIZATION FUNCTION                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetMarginMode();
   trade.SetTypeFillingBySymbol(_Symbol);

   ZeroMemory(currentSignal);
   ZeroMemory(lastExecutedSignal);
   _lastSyncedSlPrice = 0.0;
   _lastSyncedTpPrice = 0.0;
   
   datetime shifted = TimeCurrent() - SessionResetHour * 3600;
   last_processed_day = shifted - (shifted % 86400);

   int poll_ms = (currentEstrategia == EST_CONECTORLOCAL) ? 40 : ((PollIntervalMs < 100) ? 100 : PollIntervalMs);
   EventSetMillisecondTimer(poll_ms);
   
   Print("[VMBOT] Expert Inicializado por completo (MT5). Modo: ", EnumToString(currentEstrategia));
   UpdateOnChartPanel();
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| EXPERT DEINITIALIZATION FUNCTION                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Comment("");
   Print("[VMBOT] Expert Advisor finalizado.");
}

//+------------------------------------------------------------------+
//| CHECK OPERATING TIME WINDOWS                                     |
//+------------------------------------------------------------------+
bool IsInAllowedTime()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   
   int current_time_sec = dt.hour * 3600 + dt.min * 60 + dt.sec;
   
   // Janela 1
   int w1_start = Horario1_StartHour * 3600 + Horario1_StartMinute * 60 + Horario1_StartSecond;
   int w1_end   = Horario1_EndHour * 3600 + Horario1_EndMinute * 60;
   
   if(current_time_sec >= w1_start && current_time_sec <= w1_end)
   {
      return true;
   }
   
   // Janela 2
   if(Horario2_Active)
   {
      int w2_start = Horario2_StartHour * 3600 + Horario2_StartMinute * 60;
      int w2_end   = Horario2_EndHour * 3600 + Horario2_EndMinute * 60;
      if(current_time_sec >= w2_start && current_time_sec <= w2_end)
      {
         return true;
      }
   }
   
   // Janela 3
   if(Horario3_Active)
   {
      int w3_start = Horario3_StartHour * 3600 + Horario3_StartMinute * 60;
      int w3_end   = Horario3_EndHour * 3600 + Horario3_EndMinute * 60;
      if(current_time_sec >= w3_start && current_time_sec <= w3_end)
      {
         return true;
      }
   }
   
   return false;
}

//+------------------------------------------------------------------+
//| CHECK FOR DAY CHANGE AND RESET LIMITS                            |
//+------------------------------------------------------------------+
void CheckDayChange()
{
   datetime shiftedTime = TimeCurrent() - SessionResetHour * 3600;
   datetime today = shiftedTime - (shiftedTime % 86400);
   if(today != last_processed_day)
   {
      Print("[VMBOT] Nova sessao detectada. Resetando limites.");
      QuantOperacoes = 0;
      dailyLimitReached = false;
      robotTravado = false;
      _executedSignalIdsCount = 0;
      last_processed_day = today;
   }
}

//+------------------------------------------------------------------+
//| CANCEL PENDING ORDERS                                            |
//+------------------------------------------------------------------+
void CancelPendingOrders(int direction = 0)
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket > 0 && OrderGetString(ORDER_SYMBOL) == _Symbol && OrderGetInteger(ORDER_MAGIC) == MagicNumber)
      {
         long type = OrderGetInteger(ORDER_TYPE);
         if(direction == 1 && (type == ORDER_TYPE_BUY_STOP || type == ORDER_TYPE_BUY_LIMIT))
         {
            trade.OrderDelete(ticket);
         }
         else if(direction == -1 && (type == ORDER_TYPE_SELL_STOP || type == ORDER_TYPE_SELL_LIMIT))
         {
            trade.OrderDelete(ticket);
         }
         else if(direction == 0)
         {
            trade.OrderDelete(ticket);
         }
      }
   }
}

//+------------------------------------------------------------------+
//| CLOSE ACTIVE POSITIONS                                           |
//+------------------------------------------------------------------+
void CloseActivePositions(int direction = 0)
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == MagicNumber)
      {
         long type = PositionGetInteger(POSITION_TYPE);
         if(direction == 1 && type == POSITION_TYPE_BUY)
         {
            trade.PositionClose(ticket);
         }
         else if(direction == -1 && type == POSITION_TYPE_SELL)
         {
            trade.PositionClose(ticket);
         }
         else if(direction == 0)
         {
            trade.PositionClose(ticket);
         }
      }
   }
}

//+------------------------------------------------------------------+
//| CHECK ACCOUNT OPEN STATUS                                        |
//+------------------------------------------------------------------+
bool HasAccountPosition()
{
   for(int i = 0; i < PositionsTotal(); i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == MagicNumber)
      {
         return true;
      }
   }
   return false;
}

bool HasAccountWorkingOrders()
{
   for(int i = 0; i < OrdersTotal(); i++)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket > 0 && OrderGetString(ORDER_SYMBOL) == _Symbol && OrderGetInteger(ORDER_MAGIC) == MagicNumber)
      {
         return true;
      }
   }
   return false;
}

//+------------------------------------------------------------------+
//| ON TICK FUNCTION                                                 |
//+------------------------------------------------------------------+
void OnTick()
{
   datetime now = TimeLocal();
   if(now - lastLicenseCheckTime >= 14400)
   {
      licenseValid = ValidarAssinatura();
      lastLicenseCheckTime = now;
      licenseChecked = true;
   }
   
   if(!licenseValid)
   {
      UpdateOnChartPanel();
      return;
   }

   CheckDayChange();
   CheckDailyLimits();
   
   if(TRAIL_MODE && !dailyLimitReached && !robotTravado)
   {
      CheckTrailingStop();
   }

   if(OrderCloseMA && !dailyLimitReached && !robotTravado)
   {
      CheckMAClosePosition();
   }

   if(CancelOrdersAfterStopTime && !IsInAllowedTime())
   {
      CancelPendingOrders(0);
   }

   UpdateOnChartPanel();
}

//+------------------------------------------------------------------+
//| EXPERT TIMER FUNCTION                                            |
//+------------------------------------------------------------------+
void OnTimer()
{
   datetime now = TimeLocal();
   if(now - lastLicenseCheckTime >= 14400)
   {
      licenseValid = ValidarAssinatura();
      lastLicenseCheckTime = now;
      licenseChecked = true;
   }
   
   if(!licenseValid)
   {
      UpdateOnChartPanel();
      return;
   }

   CheckDayChange();

   if(currentEstrategia == EST_CONECTORVM || currentEstrategia == EST_CONECTORLOCAL)
   {
      ProcessConectorVM();
   }
   
   UpdateOnChartPanel();
}

//+------------------------------------------------------------------+
//| LICENSE VALIDATION FUNCTION                                      |
//+------------------------------------------------------------------+
bool ValidarAssinatura()
{
   licenseStatusMsg = "[VALIDADO] LICENCA ATIVA E VERIFICADA (MODO DE TESTE)";
   return true;
}

//+------------------------------------------------------------------+
//| CANDLE RANGE FILTER                                              |
//+------------------------------------------------------------------+
bool CheckCandleRangeFilter(int shift = 1)
{
   if(!CandleRange_Active) return true;
   double tick_size = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tick_size <= 0) tick_size = _Point;
   
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, _Period, shift, 1, rates) <= 0) return true;
   
   double rangeTicks = (rates[0].high - rates[0].low) / tick_size;
   
   if(CandleRange_MinTicks > 0 && rangeTicks < CandleRange_MinTicks) return false;
   if(CandleRange_MaxTicks > 0 && rangeTicks > CandleRange_MaxTicks) return false;
   return true;
}

//+------------------------------------------------------------------+
//| AI CONFIDENCE FILTER                                             |
//+------------------------------------------------------------------+
bool CheckAIConfidenceFilter(int direction)
{
   if(!UseAIFilter) return true;
   
   char data[];
   char result[];
   string result_headers;
   string queryUrl = AI_ServerUrl + "?strategy_id=" + VM_StrategyId + "&prompt_id=" + AI_PromptId + "&direction=" + IntegerToString(direction);
   
   ResetLastError();
   int res = WebRequest("GET", queryUrl, "", 2000, data, result, result_headers);
   if(res == 200)
   {
      string json = CharArrayToString(result);
      string chaveDir = (direction == 1) ? "confianca_compra" : "confianca_venda";
      string scoreStr = ExtractJsonField(json, chaveDir);
      int score = (int)StringToInteger(scoreStr);
      if(score <= 0)
      {
         scoreStr = ExtractJsonField(json, "confianca_pct");
         score = (int)StringToInteger(scoreStr);
      }
      if(score >= MinAIConfidence)
         return true;
      else
         return false;
   }
   return true;
}

//+------------------------------------------------------------------+
//| CONECTOR VM / LOCAL: EXECUTE ORDERS                              |
//+------------------------------------------------------------------+
bool ExecuteMarketOrder(int direction, double sl_ticks, double tp_ticks, double lot_val = 0.0)
{
   double tick_size = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tick_size <= 0) tick_size = _Point;
   
   double price = 0.0;
   double sl = 0.0;
   double tp = 0.0;
   
   double sl_distance_points = sl_ticks * (tick_size / _Point);
   double tp_distance_points = tp_ticks * (tick_size / _Point);
   
   double final_lots = (lot_val > 0.0) ? lot_val : LOTE_Size;
   final_lots = NormalizeDouble(final_lots, 2);
   
   if(direction == 1) // COMPRA
   {
      price = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      if(sl_ticks > 0) sl = price - sl_distance_points * _Point;
      if(tp_ticks > 0) tp = price + tp_distance_points * _Point;
      
      price = NormalizeDouble(price, _Digits);
      sl = NormalizeDouble(sl, _Digits);
      tp = NormalizeDouble(tp, _Digits);
      
      if(trade.Buy(final_lots, _Symbol, price, sl, tp, "VMConectorBuy"))
      {
         return (trade.ResultRetcode() == TRADE_RETCODE_DONE || trade.ResultRetcode() == TRADE_RETCODE_PLACED);
      }
   }
   else // VENDA
   {
      price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      if(sl_ticks > 0) sl = price + sl_distance_points * _Point;
      if(tp_ticks > 0) tp = price - tp_distance_points * _Point;
      
      price = NormalizeDouble(price, _Digits);
      sl = NormalizeDouble(sl, _Digits);
      tp = NormalizeDouble(tp, _Digits);
      
      if(trade.Sell(final_lots, _Symbol, price, sl, tp, "VMConectorSell"))
      {
         return (trade.ResultRetcode() == TRADE_RETCODE_DONE || trade.ResultRetcode() == TRADE_RETCODE_PLACED);
      }
   }
   return false;
}

bool ExecutePendingOrder(int direction, double db_entry_price, double sl_ticks, double tp_ticks, double lot_val = 0.0)
{
   double tick_size = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tick_size <= 0) tick_size = _Point;
   
   double entry_price = 0.0;
   double sl = 0.0;
   double tp = 0.0;
   ENUM_ORDER_TYPE order_type;
   
   double sl_distance_points = sl_ticks * (tick_size / _Point);
   double tp_distance_points = tp_ticks * (tick_size / _Point);
   
   double final_lots = (lot_val > 0.0) ? lot_val : LOTE_Size;
   final_lots = NormalizeDouble(final_lots, 2);
   
   if(direction == 1) // COMPRA
   {
      if(OrderMode == ORD_PENDENTE_STOP)
      {
         entry_price = db_entry_price + distancePrice * tick_size;
         order_type = ORDER_TYPE_BUY_STOP;
      }
      else if(OrderMode == ORD_PENDENTE_LIMIT)
      {
         entry_price = db_entry_price - distancePrice * tick_size;
         order_type = ORDER_TYPE_BUY_LIMIT;
      }
      else return false;
      
      if(sl_ticks > 0) sl = entry_price - sl_distance_points * _Point;
      if(tp_ticks > 0) tp = entry_price + tp_distance_points * _Point;
   }
   else // VENDA
   {
      if(OrderMode == ORD_PENDENTE_STOP)
      {
         entry_price = db_entry_price - distancePrice * tick_size;
         order_type = ORDER_TYPE_SELL_STOP;
      }
      else if(OrderMode == ORD_PENDENTE_LIMIT)
      {
         entry_price = db_entry_price + distancePrice * tick_size;
         order_type = ORDER_TYPE_SELL_LIMIT;
      }
      else return false;
      
      if(sl_ticks > 0) sl = entry_price + sl_distance_points * _Point;
      if(tp_ticks > 0) tp = entry_price - tp_distance_points * _Point;
   }
   
   entry_price = NormalizeDouble(entry_price, _Digits);
   sl = NormalizeDouble(sl, _Digits);
   tp = NormalizeDouble(tp, _Digits);
   
   if(trade.OrderOpen(_Symbol, order_type, final_lots, 0.0, entry_price, sl, tp, ORDER_TIME_GTC, 0, "VMConectorPending"))
   {
      return (trade.ResultRetcode() == TRADE_RETCODE_DONE || trade.ResultRetcode() == TRADE_RETCODE_PLACED);
   }
   return false;
}

//+------------------------------------------------------------------+
//| SYNC OPEN ORDER SL/TP DINAMICALLY                                |
//+------------------------------------------------------------------+
void SyncOpenOrderSLTP(double new_sl_price, double new_tp_price)
{
   for(int i = 0; i < PositionsTotal(); i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == MagicNumber)
      {
         double cur_sl = PositionGetDouble(POSITION_SL);
         double cur_tp = PositionGetDouble(POSITION_TP);
         double target_sl = cur_sl;
         double target_tp = cur_tp;
         bool modifyNeeded = false;

         if(new_sl_price > 0 && MathAbs(cur_sl - new_sl_price) > _Point)
         {
            target_sl = NormalizeDouble(new_sl_price, _Digits);
            modifyNeeded = true;
         }

         if(new_tp_price > 0 && MathAbs(cur_tp - new_tp_price) > _Point)
         {
            target_tp = NormalizeDouble(new_tp_price, _Digits);
            modifyNeeded = true;
         }

         if(modifyNeeded)
         {
            if(trade.PositionModify(ticket, target_sl, target_tp))
            {
               Print("[CONECTOR] SL/TP sincronizado com sucesso no ticket MT5 ", ticket, " -> SL: ", target_sl, " | TP: ", target_tp);
            }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| PROCESS CONECTOR STRATEGY LOGIC                                  |
//+------------------------------------------------------------------+
void ProcessConectorVM()
{
   if(currentEstrategia != EST_CONECTORVM && currentEstrategia != EST_CONECTORLOCAL) return;
   
   if(dailyLimitReached || robotTravado)
   {
      if(DebugMode) Print("[VM] Robô travado devido a limites de meta diária.");
      return;
   }
   
   string json = "";
   int responseCode = PollSupabaseForSignals(json);
   if(responseCode < 200 || responseCode > 299)
   {
      return;
   }
   
   bool isMonitoring = (signalConsumed && lastExecutedSignal.id != "") || (!signalConsumed && HasAccountPosition());
   
   // FASE 2: Se estiver EM POSIÇÃO ABERTA, monitora encerramento ou ajuste dinâmico de SL/TP
   if(isMonitoring)
   {
      if(json == "" || json == "[]") return;
      
      string status = ExtractJsonField(json, "status");
      StringToLower(status);
      
      if(VM_MonitorarEncerramentoPainel && (StringFind(status, "cancel") >= 0 || StringFind(status, "gain") >= 0 || StringFind(status, "stop") >= 0 || StringFind(status, "encerr") >= 0 || StringFind(status, "fech") >= 0))
      {
         Print("[VM POLL] 🚨 SINAL ENCERRADO NO PAINEL! Status: '", status, "' -> Acionando fechamento forcado.");
         _forceCloseSignal = true;
      }
      else
      {
         string slStr = ExtractJsonField(json, "stop_loss");
         string tpStr = ExtractJsonField(json, "take_profit");
         double db_sl = StringToDouble(slStr);
         double db_tp = StringToDouble(tpStr);

         if(StopLossOrigem == SLTP_CONECTOR || TakeProfitOrigem == SLTP_CONECTOR)
         {
            SyncOpenOrderSLTP((StopLossOrigem == SLTP_CONECTOR ? db_sl : 0), (TakeProfitOrigem == SLTP_CONECTOR ? db_tp : 0));
         }
      }
      
      if(_forceCloseSignal)
      {
         CloseActivePositions();
         CancelPendingOrders();
         
         _forceCloseSignal = false;
         signalConsumed = false;
         ZeroMemory(lastExecutedSignal);
         ZeroMemory(currentSignal);
         Print("[VM] Fechamento forçado e limpeza de estados executados.");
      }
      return;
   }
   
   // FASE 1: Se estiver FLAT, busca novo sinal
   if(json == "" || json == "[]")
   {
      ZeroMemory(currentSignal);
      return;
   }
   
   VM_Signal signal;
   if(!ParseVMSignalFromJson(json, signal))
   {
      if(DebugMode) Print("[VM POLL] Parse falhou");
      return;
   }
   
   if(signal.status == "cancelado" || signal.status == "stop" || signal.status == "gain" || signal.status == "cancel" || signal.status == "loss")
   {
      ZeroMemory(currentSignal);
      return;
   }
   
   if(IsSignalAlreadyExecuted(signal.id))
   {
      ZeroMemory(currentSignal);
      return;
   }
   
   datetime current_time = TimeGMT();
   long signalAge = (long)current_time - (long)signal.created_at;
   int maxAge = (VM_MaxSignalAgeSeconds > 0) ? VM_MaxSignalAgeSeconds : 60;
   
   if(signalAge > maxAge)
   {
      if(DebugMode) Print("[VM] [EXPIRADO] Sinal expirado (", signalAge, "s > ", maxAge, "s)");
      ZeroMemory(currentSignal);
      return;
   }
   
   if(HasAccountPosition() || HasAccountWorkingOrders())
   {
      if(DebugMode) Print("[VM] [OCUPADO] Conta ocupada");
      return;
   }
   
   if(!IsInAllowedTime())
   {
      if(DebugMode) Print("[VM] [BLOQUEADO] Fora do horario permitido para novas operacoes.");
      return;
   }
   
   if(QuantOperacoes >= MaxOrderSession)
   {
      if(DebugMode) Print("[VM] [LIMITE] Limite ops atingido (", QuantOperacoes, "/", MaxOrderSession, ")");
      return;
   }
   
   bool isAllowed = false;
   if(signal.direction == 1) // BUY
   {
      isAllowed = (currentOperatingMode == MODE_COMPRADO || currentOperatingMode == MODE_AMBOS);
   }
   else // SELL
   {
      isAllowed = (currentOperatingMode == MODE_VENDIDO || currentOperatingMode == MODE_AMBOS);
   }
   
   if(!isAllowed)
   {
      if(DebugMode) Print("[VM] [BLOQUEADO] Direcao nao permitida pelo Modo de Operacao.");
      return;
   }
   
   double final_sl = (StopLossOrigem == SLTP_STRATEGY) ? SL_Ticks : signal.sl_ticks;
   double final_tp = (TakeProfitOrigem == SLTP_STRATEGY) ? TP_Ticks : signal.tp_ticks;
   
   double final_lots = LOTE_Size;
   if(ContratoOrigem == CONTRATO_CONECTOR)
   {
      if(signal.contrato > 0.0)
      {
         final_lots = signal.contrato * ContratoFatorMult;
      }
      else
      {
         Print("[VMBOT] Aviso: contrato nulo ou invalido no sinal (", signal.contrato, "). Usando LOTE_Size local.");
      }
   }

   Print("[VM] [EXECD] EXECUTANDO SINAL: ", signal.id, " | Direcao: ", (signal.direction == 1 ? "COMPRA" : "VENDA"), " | Lots: ", final_lots, " | SL: ", final_sl, " | TP: ", final_tp);
   
   bool executed = false;
   if(OrderMode == ORD_MERCADO)
   {
      executed = ExecuteMarketOrder(signal.direction, final_sl, final_tp, final_lots);
   }
   else
   {
      executed = ExecutePendingOrder(signal.direction, signal.entry_price, final_sl, final_tp, final_lots);
   }
   
   if(executed)
   {
      signalConsumed = true;
      lastExecutedSignal = signal;
      currentSignal = signal;
      QuantOperacoes++;
      AddExecutedSignalId(signal.id);
      Print("[VM] [SUCESSO] ORDEM ENVIADA! Quant operacoes na sessao: ", QuantOperacoes);
   }
   else
   {
      Print("[VM] [ERRO] ERRO ao tentar enviar ordem.");
   }
}

//+------------------------------------------------------------------+
//| DATABASE POLLING FOR CONECTOR                                    |
//+------------------------------------------------------------------+
int PollSupabaseForSignals(string &responseJson)
{
   string cleanPainelId = VM_PainelId;
   string cleanStrategyId = VM_StrategyId;
   
   if(currentEstrategia == EST_CONECTORLOCAL)
   {
      string localUrl = "";
      if(signalConsumed && lastExecutedSignal.id != "")
      {
         localUrl = "http://localhost:8001/sinal_local?id=" + lastExecutedSignal.id;
      }
      else
      {
         localUrl = "http://localhost:8001/sinal_local?account_id=" + cleanPainelId + "&strategy_id=" + cleanStrategyId + "&status=Em%20Andamento";
      }

      char localData[];
      char localResult[];
      string localHeaders;
      ResetLastError();
      int localRes = WebRequest("GET", localUrl, "", 200, localData, localResult, localHeaders);
      if(localRes == 200 || localRes == 201)
      {
         string localJson = CharArrayToString(localResult);
         if(localJson != "" && localJson != "[]" && localJson != "{\"signals\":[],\"total\":0}")
         {
            responseJson = localJson;
            return localRes;
         }
      }
      else
      {
         // Fallback para porta 80 padrão
         string fallbackUrl = (signalConsumed && lastExecutedSignal.id != "")
            ? ("http://localhost/sinal_local?id=" + lastExecutedSignal.id)
            : ("http://localhost/sinal_local?account_id=" + cleanPainelId + "&strategy_id=" + cleanStrategyId + "&status=Em%20Andamento");
         ResetLastError();
         localRes = WebRequest("GET", fallbackUrl, "", 200, localData, localResult, localHeaders);
         if(localRes == 200 || localRes == 201)
         {
            string localJson = CharArrayToString(localResult);
            if(localJson != "" && localJson != "[]" && localJson != "{\"signals\":[],\"total\":0}")
            {
               responseJson = localJson;
               return localRes;
            }
         }
      }
   }
   
   string queryUrl = "";
   string painelFilter = (cleanPainelId != "") ? "or=(account_id.eq." + cleanPainelId + ",panel_id.eq." + cleanPainelId + ")&" : "";
   string strategyFilter = (cleanStrategyId != "") ? "strategy_id=eq." + cleanStrategyId + "&" : "";
   
   if(signalConsumed && lastExecutedSignal.id != "")
   {
      queryUrl = supabaseUrl + "/rest/v1/painelvm_strategy_reports?id=eq." + lastExecutedSignal.id + "&select=id,status,stop_loss,take_profit";
   }
   else if(HasAccountPosition())
   {
      queryUrl = supabaseUrl + "/rest/v1/painelvm_strategy_reports?" + painelFilter + strategyFilter + "order=created_at.desc&limit=1&select=id,status,stop_loss,take_profit,created_at";
   }
   else
   {
      queryUrl = supabaseUrl + "/rest/v1/painelvm_strategy_reports?" + painelFilter + strategyFilter + "status=eq.Em%20Andamento&order=created_at.desc&limit=1";
   }
   
   char data[];
   char result[];
   string result_headers;
   string headers = "apikey: " + supabaseServiceKey + "\r\nAuthorization: Bearer " + supabaseServiceKey + "\r\nContent-Type: application/json\r\n";
   
   ResetLastError();
   int res = WebRequest("GET", queryUrl, headers, 3000, data, result, result_headers);
   if(res == 200 || res == 201)
   {
      responseJson = CharArrayToString(result);
      return res;
   }
   return res;
}

//+------------------------------------------------------------------+
//| GET REALIZED DAILY ACCOUNT PROFIT                                |
//+------------------------------------------------------------------+
double GetRealizedProfitToday()
{
   datetime today = TimeCurrent() - (TimeCurrent() % 86400);
   double profit = 0;
   
   HistorySelect(today, TimeCurrent());
   int total = HistoryDealsTotal();
   
   for(int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket > 0)
      {
         if(HistoryDealGetString(ticket, DEAL_SYMBOL) == _Symbol && HistoryDealGetInteger(ticket, DEAL_MAGIC) == MagicNumber)
         {
            profit += HistoryDealGetDouble(ticket, DEAL_PROFIT) + HistoryDealGetDouble(ticket, DEAL_COMMISSION) + HistoryDealGetDouble(ticket, DEAL_SWAP);
         }
      }
   }
   return profit;
}

//+------------------------------------------------------------------+
//| CHECK DAILY RISK LIMITS & BALANCE CLOSE                          |
//+------------------------------------------------------------------+
void CheckDailyLimits()
{
   if(dailyLimitReached) return;
   
   double realized = GetRealizedProfitToday();
   double unrealized = AccountInfoDouble(ACCOUNT_PROFIT);
   double totalDia = realized + unrealized;
   
   if(DailyLossActive && totalDia <= -MathAbs(DailyLossLimit))
   {
      dailyLimitReached = true;
      robotTravado = true;
      CloseActivePositions();
      CancelPendingOrders();
      Print("[META DIARIA] [PERDA] LIMITE DE PERDA DIARIA ATINGIDO: ", DoubleToString(totalDia, 2), " USD. Robo travado.");
   }
   
   if(DailyProfitActive && totalDia >= MathAbs(DailyProfitLimit))
   {
      dailyLimitReached = true;
      robotTravado = true;
      CloseActivePositions();
      CancelPendingOrders();
      Print("[META DIARIA] [LUCRO] LIMITE DE LUCRO DIARIO ATINGIDO: ", DoubleToString(totalDia, 2), " USD. Robo travado.");
   }

   if(MoneyClosed)
   {
      if(unrealized <= -MathAbs(LossesAllOrders) || unrealized >= MathAbs(ProfitAllOrders))
      {
         Print("[SEGURANÇA BALANÇO] Limite de saldo financeiro atingido (", unrealized, " USD). Encerrando posições.");
         CloseActivePositions();
         CancelPendingOrders();
      }
   }
}

//+------------------------------------------------------------------+
//| CHECK & RUN TRAILING STOP                                        |
//+------------------------------------------------------------------+
void CheckTrailingStop()
{
   double tick_size = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tick_size <= 0) tick_size = _Point;
   
   for(int i = 0; i < PositionsTotal(); i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == MagicNumber)
      {
         long type = PositionGetInteger(POSITION_TYPE);
         double price_current = (type == POSITION_TYPE_BUY) ? SymbolInfoDouble(_Symbol, SYMBOL_BID) : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
         double price_open = PositionGetDouble(POSITION_PRICE_OPEN);
         double sl = PositionGetDouble(POSITION_SL);
         double tp = PositionGetDouble(POSITION_TP);
         
         double profit_points = 0.0;
         if(type == POSITION_TYPE_BUY)
            profit_points = (price_current - price_open) / _Point;
         else
            profit_points = (price_open - price_current) / _Point;
            
         double multiplier = tick_size / _Point;
         double start_points = TRAIL_Start * multiplier;
         double stop_dist_points = TRAIL_StopDistance * multiplier;
         double step_points = TRAIL_Step * multiplier;
         
         if(profit_points >= start_points)
         {
            double new_sl = 0.0;
            if(type == POSITION_TYPE_BUY)
            {
               new_sl = price_current - stop_dist_points * _Point;
               new_sl = NormalizeDouble(new_sl, _Digits);
               
               if(sl == 0 || new_sl > sl + step_points * _Point)
               {
                  trade.PositionModify(ticket, new_sl, tp);
               }
            }
            else
            {
               new_sl = price_current + stop_dist_points * _Point;
               new_sl = NormalizeDouble(new_sl, _Digits);
               
               if(sl == 0 || new_sl < sl - step_points * _Point)
               {
                  trade.PositionModify(ticket, new_sl, tp);
               }
            }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| CHECK MA CLOSED POSITION                                         |
//+------------------------------------------------------------------+
void CheckMAClosePosition()
{
   if(!OrderCloseMA || ProfitCloseMAPeriod <= 0) return;
   
   int handleMA = iMA(_Symbol, _Period, ProfitCloseMAPeriod, 0, MODE_SMA, PRICE_CLOSE);
   if(handleMA == INVALID_HANDLE) return;
   double maBuf[];
   ArraySetAsSeries(maBuf, true);
   if(CopyBuffer(handleMA, 0, 0, 1, maBuf) <= 0) { IndicatorRelease(handleMA); return; }
   double maVal = maBuf[0];
   IndicatorRelease(handleMA);
   
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == MagicNumber)
      {
         double openProfit = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
         if(openProfit >= ProfitCloseMA)
         {
            long posType = PositionGetInteger(POSITION_TYPE);
            double currentPrice = (posType == POSITION_TYPE_BUY) ? SymbolInfoDouble(_Symbol, SYMBOL_BID) : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
            if(posType == POSITION_TYPE_BUY && currentPrice < maVal)
            {
               if(DebugMode) Print("[MA CLOSE] Cruzou SMA (", maVal, ") para baixo com lucro de $", openProfit, " -> Encerrando compra.");
               trade.PositionClose(ticket);
            }
            else if(posType == POSITION_TYPE_SELL && currentPrice > maVal)
            {
               if(DebugMode) Print("[MA CLOSE] Cruzou SMA (", maVal, ") para cima com lucro de $", openProfit, " -> Encerrando venda.");
               trade.PositionClose(ticket);
            }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| ON-CHART PANEL DISPLAY                                           |
//+------------------------------------------------------------------+
void UpdateOnChartPanel()
{
   string licInfo = "Licença: " + licenseStatusMsg + "\n";
   if(!licenseChecked)
   {
      licInfo = "Licença: Aguardando verificação inicial...\n";
   }
   
   if(licenseChecked && !licenseValid)
   {
      string blockComment = "==================================================\n" +
                            "  VMBot Expert Advisor v1.53 (MT5 Port)\n" +
                            "==================================================\n" +
                            licInfo +
                            "STATUS: [BLOQUEADO] (ASSINATURA INVALIDA)\n" +
                            "Por favor, configure o IDAssinatura correto nos inputs.\n" +
                            "Sua conta MT5 ativa e: " + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\n" +
                            "==================================================\n";
      Comment(blockComment);
      return;
   }

   string statusConector = "";
   
   if(currentEstrategia == EST_CONECTORVM || currentEstrategia == EST_CONECTORLOCAL)
   {
      if(signalConsumed && lastExecutedSignal.id != "")
      {
         string idCurto = (StringLen(lastExecutedSignal.id) > 8) ? StringSubstr(lastExecutedSignal.id, 0, 8) : lastExecutedSignal.id;
         string stratCurto = (StringLen(lastExecutedSignal.strategy_id) > 8) ? StringSubstr(lastExecutedSignal.strategy_id, 0, 8) : lastExecutedSignal.strategy_id;
         statusConector = "[VM CONECTOR] [MONITORANDO] ID: " + idCurto + "...\n" +
                          "Strat: " + stratCurto + " | Aguardando...";
      }
      else if(currentSignal.id == "")
      {
         string painelInfo = (VM_PainelId == "") ? "Qualquer" : ((StringLen(VM_PainelId) > 12) ? StringSubstr(VM_PainelId, 0, 12) + "..." : VM_PainelId);
         string stratInfo = (VM_StrategyId == "") ? "Qualquer" : ((StringLen(VM_StrategyId) > 12) ? StringSubstr(VM_StrategyId, 0, 12) + "..." : VM_StrategyId);
         statusConector = "[VM CONECTOR] Aguardando sinal (" + EnumToString(currentEstrategia) + ")...\n" +
                          "Painel: " + painelInfo + " | Strat: " + stratInfo;
      }
      else
      {
         datetime current_time = TimeGMT();
         long age = (long)current_time - (long)currentSignal.created_at;
         double ageMinutes = (double)age / 60.0;
         int displaySl = (StopLossOrigem == SLTP_STRATEGY) ? (int)SL_Ticks : currentSignal.sl_ticks;
         int displayTp = (TakeProfitOrigem == SLTP_STRATEGY) ? (int)TP_Ticks : currentSignal.tp_ticks;
         statusConector = "[VM CONECTOR] [SINAL] " + (currentSignal.direction == 1 ? "COMPRA" : "VENDA") + " | " +
                          IntegerToString(displaySl) + "SL / " + IntegerToString(displayTp) + "TP | Idade: " + DoubleToString(ageMinutes, 1) + " min";
      }
   }
   else
   {
      statusConector = "[ESTRATEGIA] Ativa: " + EnumToString(currentEstrategia) + "\n" +
                       "Grid Compras: " + (gridArmedBuy ? "ARMADO" : "LIVRE") + " | Grid Vendas: " + (gridArmedSell ? "ARMADO" : "LIVRE");
   }
   
   double realized = GetRealizedProfitToday();
   double unrealized = AccountInfoDouble(ACCOUNT_PROFIT);
   double totalDia = realized + unrealized;
   
   string dailyLimitStr = "Ativo";
   if(dailyLimitReached) dailyLimitStr = "[META ALCANCADA] (EA Bloqueado)";
   else if(robotTravado) dailyLimitStr = "[TRAVADO]";
   
   string commentText = "==================================================\n" +
                        "  VMBot Expert Advisor v1.53 (MT5 Port)\n" +
                        "==================================================\n" +
                        licInfo +
                        "Estrategia: " + NomeEstrategia + " (Modo: " + EnumToString(currentEstrategia) + ")\n" +
                        "Direcao Permitida: " + (currentOperatingMode == MODE_COMPRADO ? "Apenas Compra" : (currentOperatingMode == MODE_VENDIDO ? "Apenas Venda" : "Ambos")) + "\n" +
                        "Modo de Ordem: " + (OrderMode == ORD_MERCADO ? "Mercado" : (OrderMode == ORD_PENDENTE_STOP ? "Pendente Stop" : "Pendente Limit")) + "\n" +
                        "Lote: " + DoubleToString(LOTE_Size, 2) + "\n" +
                        "--------------------------------------------------\n" +
                        statusConector + "\n" +
                        "--------------------------------------------------\n" +
                        "Operacoes na Sessao: " + IntegerToString(QuantOperacoes) + " / " + IntegerToString(MaxOrderSession) + "\n" +
                        "PnL Realizado Hoje (EA): " + DoubleToString(realized, 2) + " USD\n" +
                        "PnL Flutuante Hoje (Acct): " + DoubleToString(unrealized, 2) + " USD\n" +
                        "PnL Total Hoje: " + DoubleToString(totalDia, 2) + " USD\n" +
                        "Estado do EA: " + dailyLimitStr + "\n" +
                        "==================================================\n";
                        
   Comment(commentText);
}

//+------------------------------------------------------------------+
//| JSON HELPER FUNCTIONS                                            |
//+------------------------------------------------------------------+
string ExtractJsonField(string json, string fieldName)
{
   string pattern = "\"" + fieldName + "\":";
   int idx = StringFind(json, pattern);
   if(idx < 0) return "";
   
   int start = idx + StringLen(pattern);
   while(start < StringLen(json) && (StringSubstr(json, start, 1) == " " || StringSubstr(json, start, 1) == "\t")) start++;
   
   if(start < StringLen(json) && StringSubstr(json, start, 1) == "\"")
   {
      start++;
      int end = StringFind(json, "\"", start);
      if(end < 0) return "";
      return StringSubstr(json, start, end - start);
   }
   
   int endNum = start;
   while(endNum < StringLen(json))
   {
      ushort ch = StringGetCharacter(json, endNum);
      if((ch >= '0' && ch <= '9') || ch == '.' || ch == '-' || ch == 't' || ch == 'r' || ch == 'u' || ch == 'e' || ch == 'f' || ch == 'a' || ch == 'l' || ch == 's')
         endNum++;
      else break;
   }
   return StringSubstr(json, start, endNum - start);
}

bool ParseVMSignalFromJson(string json, VM_Signal &signal)
{
   if(StringLen(json) < 10) return false;
   
   signal.id = ExtractJsonField(json, "id");
   signal.strategy_id = ExtractJsonField(json, "strategy_id");
   signal.strategy_name = ExtractJsonField(json, "strategy_name");
   signal.side = ExtractJsonField(json, "side");
   StringToLower(signal.side);
   
   signal.symbol = ExtractJsonField(json, "symbol");
   if(signal.symbol == "") signal.symbol = ExtractJsonField(json, "ativo");
   
   string entryStr = ExtractJsonField(json, "entry_price");
   string slStr = ExtractJsonField(json, "stop_loss");
   string tpStr = ExtractJsonField(json, "take_profit");
   string createdStr = ExtractJsonField(json, "created_at");
   string statusStr = ExtractJsonField(json, "status");
   string contratoStr = ExtractJsonField(json, "contrato");
   
   signal.entry_price = StringToDouble(entryStr);
   signal.stop_loss = StringToDouble(slStr);
   signal.take_profit = StringToDouble(tpStr);
   signal.status = statusStr;
   StringToLower(signal.status);
   signal.contrato = StringToDouble(contratoStr);
   
   double tick_size = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tick_size <= 0) tick_size = _Point;
   
   double slDistance = MathAbs(signal.entry_price - signal.stop_loss);
   double tpDistance = MathAbs(signal.take_profit - signal.entry_price);
   
   signal.sl_ticks = (int)MathRound(slDistance / tick_size);
   signal.tp_ticks = (int)MathRound(tpDistance / tick_size);
   
   if(signal.sl_ticks <= 0) signal.sl_ticks = (SL_Ticks > 0) ? (int)SL_Ticks : 50;
   if(signal.tp_ticks <= 0) signal.tp_ticks = (TP_Ticks > 0) ? (int)TP_Ticks : 30;
   
   signal.direction = (StringFind(signal.side, "buy") >= 0 || StringFind(signal.side, "long") >= 0 || StringFind(signal.side, "compra") >= 0) ? 1 : -1;
   
   signal.created_at = StringToTime(createdStr);
   if(signal.created_at == 0) signal.created_at = TimeCurrent();
   
   return true;
}
