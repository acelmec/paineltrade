//+------------------------------------------------------------------+
//| FFB Multi-Asset Impulse Panel + Supabase Sender (EA UNIFICADO)   |
//| V9.0 - Tudo em um EA so: calcula os impulsos, desenha o painel  |
//| no grafico e envia direto pro Supabase via WebRequest. Sem      |
//| indicador separado, sem GlobalVariable - tudo no mesmo processo.|
//|                                                                    |
//| Por que so EA e nao indicador: indicadores no MT4 NAO PODEM     |
//| usar WebRequest() (erro 4060 sempre ocorre, mesmo com a URL na   |
//| whitelist). Por isso a logica toda foi unificada aqui em um EA.  |
//|                                                                    |
//| Como usar:                                                        |
//| 1) Coloque este arquivo em MQL4/Experts (NAO em Indicators).      |
//| 2) Remova do grafico o indicador antigo (FFB_Multi_Asset_Panel)  |
//|    e o EA antigo (FFB_Supabase_Sender_EA), se estiverem anexados.|
//| 3) Anexe este EA no grafico normalmente.                          |
//| 4) Configure Supabase_URL / Supabase_API_Key / Instance_ID.       |
//| 5) Adicione a URL do Supabase na whitelist em Tools > Options >  |
//|    Expert Advisors > Allow WebRequest for listed URL.             |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026, FFB Invest"
#property link      "ffbinvest.amsolucoes.net.br"
#property strict

// MARCADOR DE BUILD - se essa linha NAO aparecer no log de Init, o EA
// rodando no grafico e uma versao desatualizada (cache antigo do .ex4).
#define EA_BUILD_TAG "BUILD-2026-08-21-100MS-TIMER-v3"

//--- Inputs dos ativos
input string NASDAQ_Symbol    = "NAS100";
input string SP500_Symbol     = "SPX500";
input string USDIndex_Symbol  = "USDINDEX";
input string VIX_Symbol       = "VIX";
input string NVIDIA_Symbol    = "NVDA";
input string MICROSOFT_Symbol = "MSFT";
input string APPLE_Symbol     = "AAPL";
input string META_Symbol      = "META";
input string AMAZON_Symbol    = "AMZN";
input string ALPHABET_Symbol  = "GOOGL";
input string TESLA_Symbol     = "TSLA";
input string EURJPY_Symbol    = "EURJPY";
input string EURUSD_Symbol    = "EURUSD";
input string USDJPY_Symbol    = "USDJPY";

#define TOTAL_ASSETS 14

input int    Dynamic_Number   = 789789;
input bool   Show_Panel       = true;

//--- Posicao do painel
input int    Panel_Corner     = 0;
input int    Panel_X          = 10;
input int    Panel_Y          = 30;
input int    Panel_Width      = 850;
input int    Panel_Height     = 110;
input int    Cols             = 6;
input int    Box_SpacingX     = 138;
input int    Box_SpacingY     = 54;

//--- ALERTAS E FORCA FINAL
input bool   Enable_Alerts    = true;
input int    Alert_Threshold  = 90;
input bool   Alert_Sound      = true;
input string Alert_Sound_File = "alert.wav";
input bool   Alert_Popup      = true;
input bool   Alert_Email      = false;
input bool   Alert_Push       = false;

//--- PESOS FORCA FINAL (HORARIO NORMAL)
input double Weight_NAS100    = 35.0;
input double Weight_VIX       = 20.0;
input double Weight_SP500     = 15.0;
input double Weight_USDIndex  = 10.0;

//--- PESOS INDIVIDUAIS DAS 7 ACOES
#define TECH_PESO_NVDA    35.0
#define TECH_PESO_MSFT    20.0
#define TECH_PESO_AAPL    15.0
#define TECH_PESO_AMZN    10.0
#define TECH_PESO_GOOGL   10.0
#define TECH_PESO_META    5.0
#define TECH_PESO_TSLA    5.0

//--- OFF-HOURS (NASDAQ fechado)
input int    NAS_Open_Hour    = 9;
input int    NAS_Close_Hour   = 16;
input bool   OffHours_Adjust  = true;
input double OffHours_NAS_Min = 60.0;
input double OffHours_VIX     = 25.0;
input double OffHours_SP500   = 15.0;

//--- SUPABASE
input bool   Enviar_Para_Supabase  = true;    // Desative para usar so o painel, sem enviar nada
input string Supabase_URL          = "https://db.vemviraramesa.com.br";
input string Supabase_API_Key      = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY";
input string Instance_ID           = "painel_principal";
input int    Hora_Ajuste           = -5;      // Ajuste de fuso horario da corretora em horas (ex: -5)
input int    Send_Interval_MS      = 100;     // Intervalo minimo entre tentativas de envio em milissegundos (padrao: 100 ms)
input int    WebRequest_Timeout_MS = 10000;

struct AssetData {
   string json_name;
   string symbol;
   double compra;
   double venda;
   int    digits;
};

AssetData assets[TOTAL_ASSETS];
int       objPrefix;
string    bgObjName;

//--- Forca Final
double g_nas100_forca_compra = 0;
double g_nas100_forca_venda  = 0;
int    g_nas100_direcao      = 0;
bool   g_alert_sent_buy      = false;
bool   g_alert_sent_sell     = false;
datetime g_last_alert_time   = 0;

//--- Controle de envio ao Supabase
uint     g_last_send_time_ms = 0;  // timestamp em ms (GetTickCount) para controle sub-segundo
string   g_last_json         = ""; // ultimo "fingerprint" de dados enviado (evita reenvio identico)
datetime g_last_m1_bar_time   = 0;  // armazena o timestamp do inicio da barra M1 atual

//--- CONSTANTES VISUAIS
#define TITLE_Y_OFFSET    0
#define MINIBG_Y_OFFSET   14
#define TEXT_Y_OFFSET     16
#define BAR_Y_OFFSET      34
#define BAR_HEIGHT        6
#define MINIBG_HEIGHT     36
#define FF_BAR_HEIGHT     6
#define FF_TEXT_Y         13
#define FF_BAR_Y          28

//+------------------------------------------------------------------+
int OnInit()
{
   objPrefix = Dynamic_Number;

   InitAsset(0, "nasdaq_impulso",   NASDAQ_Symbol);
   InitAsset(1, "sp500_impulso",    SP500_Symbol);
   InitAsset(2, "usdindex_impulso", USDIndex_Symbol);
   InitAsset(3, "vix_impulso",      VIX_Symbol);
   InitAsset(4, "nvidia_impulso",   NVIDIA_Symbol);
   InitAsset(5, "microsoft_impulso",MICROSOFT_Symbol);
   InitAsset(6, "apple_impulso",    APPLE_Symbol);
   InitAsset(7, "meta_impulso",     META_Symbol);
   InitAsset(8, "amazon_impulso",   AMAZON_Symbol);
   InitAsset(9, "alphabet_impulso", ALPHABET_Symbol);
   InitAsset(10,"tesla_impulso",    TESLA_Symbol);
   InitAsset(11,"eurjpy_impulso",   EURJPY_Symbol);
   InitAsset(12,"eurusd_impulso",   EURUSD_Symbol);
   InitAsset(13,"usdjpy_impulso",   USDJPY_Symbol);

   if(Show_Panel) CreatePanel();

   Comment("");

   Print("[EA INIT] ╔═══════════════════════════════════════════╗");
   Print("[EA INIT] ║  ", EA_BUILD_TAG);
   Print("[EA INIT] ╚═══════════════════════════════════════════╝");
   Print("[EA INIT] Painel + envio Supabase unificados em um EA so (sem GlobalVariable).");
   Print("[EA INIT] Instance_ID: ", Instance_ID, " | Hora_Ajuste: ", Hora_Ajuste, " | Send_Interval_MS: ", Send_Interval_MS, " ms | Enviar_Para_Supabase: ", Enviar_Para_Supabase);

   g_last_m1_bar_time = iTime(NASDAQ_Symbol, PERIOD_M1, 0);
   if(g_last_m1_bar_time == 0) g_last_m1_bar_time = iTime(NULL, PERIOD_M1, 0);

   int timerMs = Send_Interval_MS > 0 ? Send_Interval_MS : 100;
   if(timerMs < 10) timerMs = 10;

   bool timerOk = EventSetMillisecondTimer(timerMs);
   if(!timerOk)
   {
      Print("[EA INIT] AVISO: EventSetMillisecondTimer falhou (erro ", GetLastError(), "). Tentando EventSetTimer(1)...");
      EventSetTimer(1);
   }
   else
      Print("[EA INIT] Timer de alta precisao criado com sucesso (intervalo ", timerMs, " ms).");

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   if(Show_Panel) DeletePanel();
   Comment("");
}

//+------------------------------------------------------------------+
void OnTick()
{
   // Mantido vazio de proposito - todo o trabalho ocorre em OnTimer(),
   // pra nao depender de ticks do simbolo do grafico (calculamos varios
   // ativos diferentes, e precisamos continuar funcionando mesmo sem
   // tick novo no simbolo onde o EA esta anexado).
}

//+------------------------------------------------------------------+
void OnTimer()
{
   for(int i=0; i<TOTAL_ASSETS; i++)
   {
      CalcularImpulsoExato(assets[i]);
   }

   CalcularForcaFinalNAS100();

   if(Enable_Alerts) VerificarAlertas();

   if(Show_Panel) UpdatePanel();

   // --- VERIFICACAO DE FECHAMENTO DO CANDLE M1 ---
   datetime currentBarTime = iTime(NASDAQ_Symbol, PERIOD_M1, 0);
   if(currentBarTime == 0) currentBarTime = iTime(NULL, PERIOD_M1, 0);

   if(g_last_m1_bar_time == 0)
   {
      g_last_m1_bar_time = currentBarTime;
   }
   else if(currentBarTime > g_last_m1_bar_time && currentBarTime > 0)
   {
      datetime closedCandleTime = g_last_m1_bar_time;
      g_last_m1_bar_time = currentBarTime;

      if(Enviar_Para_Supabase)
      {
         EnviarCandleFechadoParaSupabase(closedCandleTime);
      }
   }

   // --- ENVIO DO CANDLE CORRENTE (EM TEMPO REAL) ---
   if(Enviar_Para_Supabase)
   {
      uint nowMs = GetTickCount();
      if(nowMs - g_last_send_time_ms >= (uint)Send_Interval_MS)
      {
         g_last_send_time_ms = nowMs;
         EnviarParaSupabase();
      }
   }
}

//+------------------------------------------------------------------+
void InitAsset(int idx, string jname, string sym)
{
   assets[idx].json_name = jname;
   assets[idx].symbol    = sym;
   assets[idx].compra    = 0;
   assets[idx].venda     = 0;
   assets[idx].digits    = 4;
   if(StringFind(sym, "JPY") != -1) assets[idx].digits = 2;
}

//+------------------------------------------------------------------+
void CalcularImpulsoExato(AssetData &asset)
{
   string sym = asset.symbol;
   if(StringLen(sym) == 0) return;

   double bid = NormalizeDouble(MarketInfo(sym, MODE_BID), asset.digits);
   if(bid == 0) { asset.compra = 0; asset.venda = 0; return; }

   int tfs[6] = {PERIOD_M1, PERIOD_M5, PERIOD_M15, PERIOD_M30, PERIOD_H1, PERIOD_H4};

   double total_dn = 0;
   double total_up = 0;
   double total_valid = 0;

   for(int t=0; t<6; t++)
   {
      int tf = tfs[t];

      double h[6], l[6], c[6], tp[6];
      ArrayInitialize(h, 0);
      ArrayInitialize(l, 0);
      ArrayInitialize(c, 0);
      ArrayInitialize(tp, 0);

      for(int shift=0; shift<6; shift++)
      {
         h[shift] = iHigh(sym, tf, shift);
         l[shift] = iLow(sym, tf, shift);
         c[shift] = iClose(sym, tf, shift);
         if(h[shift] > 0 && l[shift] > 0 && c[shift] > 0)
         {
            tp[shift] = (h[shift] + l[shift] + c[shift]) / 3.0;
         }
      }

      double d[35], u[35];
      ArrayInitialize(d, 0);
      ArrayInitialize(u, 0);

      if(tp[0] > 0) { double v = NormalizeDouble(tp[0], asset.digits); if(v > bid) { d[0] = 0; u[0] = 1; } else if(v < bid) { d[0] = 1; u[0] = 0; } }
      if(tp[1] > 0) { double v = NormalizeDouble(tp[1], asset.digits); if(v > bid) { d[1] = 0; u[1] = 1; } else if(v < bid) { d[1] = 1; u[1] = 0; } }
      if(tp[2] > 0) { double v = NormalizeDouble(tp[2], asset.digits); if(v > bid) { d[2] = 0; u[2] = 1; } else if(v < bid) { d[2] = 1; u[2] = 0; } }
      if(tp[3] > 0) { double v = NormalizeDouble(tp[3], asset.digits); if(v > bid) { d[3] = 0; u[3] = 1; } else if(v < bid) { d[3] = 1; u[3] = 0; } }
      if(tp[4] > 0) { double v = NormalizeDouble(tp[4], asset.digits); if(v > bid) { d[4] = 0; u[4] = 1; } else if(v < bid) { d[4] = 1; u[4] = 0; } }

      for(int shift=0; shift<6; shift++) { if(tp[shift] > 0) { double v = NormalizeDouble(2.0*tp[shift] - l[shift], asset.digits); if(v > bid) { d[5+shift] = 0; u[5+shift] = 1; } else if(v < bid) { d[5+shift] = 1; u[5+shift] = 0; } } }
      for(int shift=0; shift<6; shift++) { if(tp[shift] > 0) { double v = NormalizeDouble(2.0*tp[shift] - h[shift], asset.digits); if(v > bid) { d[11+shift] = 0; u[11+shift] = 1; } else if(v < bid) { d[11+shift] = 1; u[11+shift] = 0; } } }
      for(int shift=0; shift<6; shift++) { if(tp[shift] > 0) { double v = NormalizeDouble(tp[shift] + (h[shift] - l[shift]), asset.digits); if(v > bid) { d[17+shift] = 0; u[17+shift] = 1; } else if(v < bid) { d[17+shift] = 1; u[17+shift] = 0; } } }
      for(int shift=0; shift<6; shift++) { if(tp[shift] > 0) { double v = NormalizeDouble(tp[shift] - (h[shift] - l[shift]), asset.digits); if(v > bid) { d[23+shift] = 0; u[23+shift] = 1; } else if(v < bid) { d[23+shift] = 1; u[23+shift] = 0; } } }

      for(int shift=0; shift<6; shift++)
      {
         if(tp[shift] > 0)
         {
            int slot = 29 + shift;
            if(slot == 33) continue;
            if(slot > 33) slot = slot - 1;
            double v = NormalizeDouble(2.0*tp[shift] + (h[shift] - 2.0*l[shift]), asset.digits);
            if(v > bid) { d[slot] = 0; u[slot] = 1; } else if(v < bid) { d[slot] = 1; u[slot] = 0; }
         }
      }

      double sum_dn = 0, sum_up = 0;
      for(int k=0; k<35; k++) { sum_dn += d[k]; sum_up += u[k]; }

      total_dn += sum_dn;
      total_up += sum_up;
      total_valid += 35;
   }

   if(total_valid > 0)
   {
      asset.compra = NormalizeDouble(100.0 * total_dn / total_valid, 0);
      asset.venda  = 100.0 - asset.compra;
   }
   else
   {
      asset.compra = 0;
      asset.venda  = 0;
   }
}

//+------------------------------------------------------------------+
void CalcularForcaFinalNAS100()
{
   int idx_nas = -1, idx_vix = -1, idx_sp = -1, idx_usd = -1;
   int idx_tech[7] = {-1,-1,-1,-1,-1,-1,-1};

   for(int i=0; i<TOTAL_ASSETS; i++)
   {
      if(assets[i].symbol == NASDAQ_Symbol) idx_nas = i;
      if(assets[i].symbol == VIX_Symbol) idx_vix = i;
      if(assets[i].symbol == SP500_Symbol) idx_sp = i;
      if(assets[i].symbol == USDIndex_Symbol) idx_usd = i;
      if(assets[i].symbol == NVIDIA_Symbol) idx_tech[0] = i;
      if(assets[i].symbol == MICROSOFT_Symbol) idx_tech[1] = i;
      if(assets[i].symbol == APPLE_Symbol) idx_tech[2] = i;
      if(assets[i].symbol == AMAZON_Symbol) idx_tech[3] = i;
      if(assets[i].symbol == ALPHABET_Symbol) idx_tech[4] = i;
      if(assets[i].symbol == META_Symbol) idx_tech[5] = i;
      if(assets[i].symbol == TESLA_Symbol) idx_tech[6] = i;
   }

   if(idx_nas < 0) return;

   bool nasdaq_open = IsNasdaqOpen();
   double nas_compra = assets[idx_nas].compra;

   double vix_comp = 50.0;
   if(idx_vix >= 0) vix_comp = 100.0 - assets[idx_vix].compra;

   double sp_comp = 50.0;
   if(idx_sp >= 0) sp_comp = assets[idx_sp].compra;

   double usd_comp = 50.0;
   if(idx_usd >= 0) usd_comp = 100.0 - assets[idx_usd].compra;

   double tech_pesos[7];
   tech_pesos[0] = TECH_PESO_NVDA; tech_pesos[1] = TECH_PESO_MSFT; tech_pesos[2] = TECH_PESO_AAPL;
   tech_pesos[3] = TECH_PESO_AMZN; tech_pesos[4] = TECH_PESO_GOOGL; tech_pesos[5] = TECH_PESO_META; tech_pesos[6] = TECH_PESO_TSLA;

   double tech_soma_pesos = 0;
   double tech_soma_ponderada = 0;

   for(int t=0; t<7; t++)
   {
      if(idx_tech[t] >= 0)
      {
         tech_soma_pesos += tech_pesos[t];
         tech_soma_ponderada += assets[idx_tech[t]].compra * tech_pesos[t];
      }
   }
   double tech_comp = (tech_soma_pesos > 0) ? tech_soma_ponderada / tech_soma_pesos : 50.0;

   double w_nas, w_vix, w_sp, w_usd, w_tech;

   if(OffHours_Adjust && !nasdaq_open)
   {
      w_nas  = MathMax(OffHours_NAS_Min, 60.0);
      w_vix  = OffHours_VIX;
      w_sp   = OffHours_SP500;
      w_usd  = 0.0;
      w_tech = 0.0;

      double total = w_nas + w_vix + w_sp;
      if(total > 0) { w_nas = w_nas / total * 100.0; w_vix = w_vix / total * 100.0; w_sp = w_sp / total * 100.0; }
      else { w_nas = 60.0; w_vix = 25.0; w_sp = 15.0; }
   }
   else
   {
      w_nas  = Weight_NAS100; w_vix = Weight_VIX; w_sp = Weight_SP500; w_usd = Weight_USDIndex; w_tech = 20.0;
   }

   double forca_compra;
   if(OffHours_Adjust && !nasdaq_open)
      forca_compra = (nas_compra * w_nas + vix_comp * w_vix + sp_comp * w_sp) / 100.0;
   else
      forca_compra = (nas_compra * w_nas + vix_comp * w_vix + sp_comp * w_sp + usd_comp * w_usd + tech_comp * w_tech) / 100.0;

   g_nas100_forca_compra = NormalizeDouble(forca_compra, 0);
   g_nas100_forca_venda  = 100.0 - g_nas100_forca_compra;

   if(g_nas100_forca_compra >= Alert_Threshold) g_nas100_direcao = 1;
   else if(g_nas100_forca_venda >= Alert_Threshold) g_nas100_direcao = -1;
   else g_nas100_direcao = 0;
}

//+------------------------------------------------------------------+
bool IsNasdaqOpen()
{
   datetime now = TimeCurrent();
   MqlDateTime dt;
   TimeToStruct(now, dt);
   if(dt.day_of_week == 0 || dt.day_of_week == 6) return false;
   int hour = dt.hour;
   if(hour >= NAS_Open_Hour && hour < NAS_Close_Hour) return true;
   return false;
}

//+------------------------------------------------------------------+
void VerificarAlertas()
{
   if(TimeCurrent() - g_last_alert_time < 60) return;
   string msg = "";
   bool trigger = false;

   if(g_nas100_forca_compra < Alert_Threshold - 10) g_alert_sent_buy = false;
   if(g_nas100_forca_venda < Alert_Threshold - 10) g_alert_sent_sell = false;

   if(g_nas100_direcao == 1 && !g_alert_sent_buy)
   {
      msg = StringFormat("NAS100 FORCA COMPRA: %.0f%% | VIX: %.0f%% | SP500: %.0f%% | Tech: %.0f%%", 
             g_nas100_forca_compra, (assets[3].compra > 0 ? 100-assets[3].compra : 50), assets[1].compra,
             (assets[4].compra + assets[5].compra + assets[6].compra + assets[7].compra + assets[8].compra + assets[9].compra + assets[10].compra) / 7.0);
      g_alert_sent_buy = true; g_alert_sent_sell = false; trigger = true;
   }

   if(g_nas100_direcao == -1 && !g_alert_sent_sell)
   {
      msg = StringFormat("NAS100 FORCA VENDA: %.0f%% | VIX: %.0f%% | SP500: %.0f%% | Tech: %.0f%%", 
             g_nas100_forca_venda, (assets[3].compra > 0 ? 100-assets[3].compra : 50), assets[1].venda,
             (assets[4].venda + assets[5].venda + assets[6].venda + assets[7].venda + assets[8].venda + assets[9].venda + assets[10].venda) / 7.0);
      g_alert_sent_sell = true; g_alert_sent_buy = false; trigger = true;
   }

   if(trigger)
   {
      g_last_alert_time = TimeCurrent();
      if(Alert_Sound) PlaySound(Alert_Sound_File);
      if(Alert_Popup) Alert(msg);
      if(Alert_Email) SendMail("NAS100 Forca Final", msg);
      if(Alert_Push) SendNotification(msg);
      Print("ALERTA NAS100: ", msg);
   }
}

//+------------------------------------------------------------------+
//| Formata a data/hora no padrao ISO 8601 aplicando o Hora_Ajuste   |
//| (Ajusta automaticamente data, hora, minuto e segundo)             |
//+------------------------------------------------------------------+
string FormatAdjustedISO(datetime brokerTime)
{
   datetime adjustedTime = brokerTime + (Hora_Ajuste * 3600);
   string iso = TimeToStr(adjustedTime, TIME_DATE|TIME_SECONDS);
   StringReplace(iso, ".", "-");
   StringReplace(iso, " ", "T");
   return iso + "Z";
}

//+------------------------------------------------------------------+
//| Envia um novo registro historico ao fechar o candle M1          |
//| (POST sem on_conflict para criar um registro unico a cada 1 min) |
//+------------------------------------------------------------------+
void EnviarCandleFechadoParaSupabase(datetime closedTime)
{
   bool hasData = (assets[0].compra > 0 || assets[0].venda > 0);
   if(!hasData) return;

   string cleanUrl = Supabase_URL;
   while(StringLen(cleanUrl) > 0 && StringGetChar(cleanUrl, StringLen(cleanUrl)-1) == '/')
      cleanUrl = StringSubstr(cleanUrl, 0, StringLen(cleanUrl)-1);

   string url = cleanUrl + "/rest/v1/nasdaq_force?on_conflict=instance_id,timestamp";

   bool nasdaq_aberto = IsNasdaqOpen();

   string timeIso = FormatAdjustedISO(closedTime > 0 ? closedTime : TimeCurrent());
   string json = "{";
   json += "\"instance_id\":\"" + Instance_ID + "\",";
   json += "\"timestamp\":\"" + timeIso + "\",";
   json += "\"nasdaq_compra\":" + DoubleToString(assets[0].compra,0) + ",";
   json += "\"nasdaq_venda\":" + DoubleToString(assets[0].venda,0) + ",";
   json += "\"sp500_compra\":" + DoubleToString(assets[1].compra,0) + ",";
   json += "\"sp500_venda\":" + DoubleToString(assets[1].venda,0) + ",";
   json += "\"usdindex_compra\":" + DoubleToString(assets[2].compra,0) + ",";
   json += "\"usdindex_venda\":" + DoubleToString(assets[2].venda,0) + ",";
   json += "\"vix_compra\":" + DoubleToString(assets[3].compra,0) + ",";
   json += "\"vix_venda\":" + DoubleToString(assets[3].venda,0) + ",";
   json += "\"nvidia_compra\":" + DoubleToString(assets[4].compra,0) + ",";
   json += "\"nvidia_venda\":" + DoubleToString(assets[4].venda,0) + ",";
   json += "\"microsoft_compra\":" + DoubleToString(assets[5].compra,0) + ",";
   json += "\"microsoft_venda\":" + DoubleToString(assets[5].venda,0) + ",";
   json += "\"apple_compra\":" + DoubleToString(assets[6].compra,0) + ",";
   json += "\"apple_venda\":" + DoubleToString(assets[6].venda,0) + ",";
   json += "\"meta_compra\":" + DoubleToString(assets[7].compra,0) + ",";
   json += "\"meta_venda\":" + DoubleToString(assets[7].venda,0) + ",";
   json += "\"amazon_compra\":" + DoubleToString(assets[8].compra,0) + ",";
   json += "\"amazon_venda\":" + DoubleToString(assets[8].venda,0) + ",";
   json += "\"alphabet_compra\":" + DoubleToString(assets[9].compra,0) + ",";
   json += "\"alphabet_venda\":" + DoubleToString(assets[9].venda,0) + ",";
   json += "\"tesla_compra\":" + DoubleToString(assets[10].compra,0) + ",";
   json += "\"tesla_venda\":" + DoubleToString(assets[10].venda,0) + ",";
   json += "\"eurjpy_compra\":" + DoubleToString(assets[11].compra,0) + ",";
   json += "\"eurjpy_venda\":" + DoubleToString(assets[11].venda,0) + ",";
   json += "\"eurusd_compra\":" + DoubleToString(assets[12].compra,0) + ",";
   json += "\"eurusd_venda\":" + DoubleToString(assets[12].venda,0) + ",";
   json += "\"usdjpy_compra\":" + DoubleToString(assets[13].compra,0) + ",";
   json += "\"usdjpy_venda\":" + DoubleToString(assets[13].venda,0) + ",";
   json += "\"forca_final_compra\":" + DoubleToString(g_nas100_forca_compra,0) + ",";
   json += "\"forca_final_venda\":" + DoubleToString(g_nas100_forca_venda,0) + ",";
   json += "\"direcao\":" + IntegerToString(g_nas100_direcao) + ",";
   json += "\"nasdaq_aberto\":" + (nasdaq_aberto ? "true" : "false") + ",";
   json += "\"modo\":\"" + (nasdaq_aberto ? "normal" : "off-hours") + "\",";
   json += "\"updated_at\":\"" + FormatAdjustedISO(closedTime > 0 ? closedTime : TimeCurrent()) + "\"}";

   Print("[SUPABASE CANDLE CLOSE] =======================================");
   Print("[SUPABASE CANDLE CLOSE] Salvando registro do candle fechado M1: ", closedTime);
   Print("[SUPABASE CANDLE CLOSE] Payload: ", json);

   char post[];
   char result[];
   string result_headers;

   int len = StringToCharArray(json, post);
   if(len > 0)
      ArrayResize(post, len - 1);

   string headers =
      "Content-Type: application/json\r\n"
      "apikey: " + Supabase_API_Key + "\r\n"
      "Authorization: Bearer " + Supabase_API_Key + "\r\n"
      "Prefer: resolution=merge-duplicates\r\n";

   ResetLastError();

   int res = WebRequest(
      "POST",
      url,
      headers,
      WebRequest_Timeout_MS,
      post,
      result,
      result_headers
   );

   int err = GetLastError();

   string response = "";
   if(ArraySize(result) > 0)
      response = CharArrayToString(result);

   Print("[SUPABASE CANDLE CLOSE] HTTP Status: ", res);
   if(res == 200 || res == 201 || res == 204)
   {
      Print("[SUPABASE CANDLE CLOSE] SUCESSO HTTP=", res);
   }
   else
   {
      Print("[SUPABASE CANDLE CLOSE] FALHA HTTP=", res, " MT4 Error=", err, " Response=", response);
   }
   Print("[SUPABASE CANDLE CLOSE] =======================================");
}

//+------------------------------------------------------------------+
//| Monta o JSON com os dados ja calculados (assets[] / g_nas100_*)  |
//| e envia direto pro Supabase via WebRequest. Sem GlobalVariable,  |
//| sem segundo arquivo - tudo no mesmo processo do EA.              |
//+------------------------------------------------------------------+
void EnviarParaSupabase()
{
   bool hasData = (assets[0].compra > 0 || assets[0].venda > 0);
   if(!hasData)
   {
      // Ainda sem cotacao valida do NAS100 (ex: recem anexado, terminal
      // ainda carregando historico). Espera o proximo ciclo.
      return;
   }

   string cleanUrl = Supabase_URL;
   while(StringLen(cleanUrl) > 0 && StringGetChar(cleanUrl, StringLen(cleanUrl)-1) == '/')
      cleanUrl = StringSubstr(cleanUrl, 0, StringLen(cleanUrl)-1);

   string url = cleanUrl + "/rest/v1/nasdaq_force?on_conflict=instance_id";

   bool nasdaq_aberto = IsNasdaqOpen();

   string json = "{";
   json += "\"instance_id\":\"" + Instance_ID + "\",";
   json += "\"nasdaq_compra\":" + DoubleToString(assets[0].compra,0) + ",";
   json += "\"nasdaq_venda\":" + DoubleToString(assets[0].venda,0) + ",";
   json += "\"sp500_compra\":" + DoubleToString(assets[1].compra,0) + ",";
   json += "\"sp500_venda\":" + DoubleToString(assets[1].venda,0) + ",";
   json += "\"usdindex_compra\":" + DoubleToString(assets[2].compra,0) + ",";
   json += "\"usdindex_venda\":" + DoubleToString(assets[2].venda,0) + ",";
   json += "\"vix_compra\":" + DoubleToString(assets[3].compra,0) + ",";
   json += "\"vix_venda\":" + DoubleToString(assets[3].venda,0) + ",";
   json += "\"nvidia_compra\":" + DoubleToString(assets[4].compra,0) + ",";
   json += "\"nvidia_venda\":" + DoubleToString(assets[4].venda,0) + ",";
   json += "\"microsoft_compra\":" + DoubleToString(assets[5].compra,0) + ",";
   json += "\"microsoft_venda\":" + DoubleToString(assets[5].venda,0) + ",";
   json += "\"apple_compra\":" + DoubleToString(assets[6].compra,0) + ",";
   json += "\"apple_venda\":" + DoubleToString(assets[6].venda,0) + ",";
   json += "\"meta_compra\":" + DoubleToString(assets[7].compra,0) + ",";
   json += "\"meta_venda\":" + DoubleToString(assets[7].venda,0) + ",";
   json += "\"amazon_compra\":" + DoubleToString(assets[8].compra,0) + ",";
   json += "\"amazon_venda\":" + DoubleToString(assets[8].venda,0) + ",";
   json += "\"alphabet_compra\":" + DoubleToString(assets[9].compra,0) + ",";
   json += "\"alphabet_venda\":" + DoubleToString(assets[9].venda,0) + ",";
   json += "\"tesla_compra\":" + DoubleToString(assets[10].compra,0) + ",";
   json += "\"tesla_venda\":" + DoubleToString(assets[10].venda,0) + ",";
   json += "\"eurjpy_compra\":" + DoubleToString(assets[11].compra,0) + ",";
   json += "\"eurjpy_venda\":" + DoubleToString(assets[11].venda,0) + ",";
   json += "\"eurusd_compra\":" + DoubleToString(assets[12].compra,0) + ",";
   json += "\"eurusd_venda\":" + DoubleToString(assets[12].venda,0) + ",";
   json += "\"usdjpy_compra\":" + DoubleToString(assets[13].compra,0) + ",";
   json += "\"usdjpy_venda\":" + DoubleToString(assets[13].venda,0) + ",";
   json += "\"forca_final_compra\":" + DoubleToString(g_nas100_forca_compra,0) + ",";
   json += "\"forca_final_venda\":" + DoubleToString(g_nas100_forca_venda,0) + ",";
   json += "\"direcao\":" + IntegerToString(g_nas100_direcao) + ",";
   json += "\"nasdaq_aberto\":" + (nasdaq_aberto ? "true" : "false") + ",";
   json += "\"modo\":\"" + (nasdaq_aberto ? "normal" : "off-hours") + "\"";
   // OBS: "json" aqui de proposito ainda NAO tem o "}" de fechamento.
   // Ele representa so os DADOS (sem updated_at), e serve de "impressao
   // digital" pra comparar com o ultimo envio - se o updated_at entrasse
   // nessa comparacao, ele mudaria todo segundo e o dedup nunca pegaria
   // payloads repetidos.

   if(json == g_last_json)
   {
      // Dados iguais ao ultimo envio - nao manda de novo.
      return;
   }
   g_last_json = json;

   // So agora, com dados realmente novos pra enviar, calculamos o
   // updated_at (formato ISO 8601 com ajuste Hora_Ajuste) e
   // fechamos o payload final que vai pro Supabase.
   string updatedAtIso = FormatAdjustedISO(TimeCurrent());

   string payload = json + ",\"updated_at\":\"" + updatedAtIso + "\"}";

   Print("[SUPABASE] =======================================");
   Print("[SUPABASE] URL: ", url);
   Print("[SUPABASE] Payload: ", payload);

   char post[];
   char result[];
   string result_headers;

   int len = StringToCharArray(payload, post);
   if(len > 0)
      ArrayResize(post, len - 1);

   string headers =
      "Content-Type: application/json\r\n"
      "apikey: " + Supabase_API_Key + "\r\n"
      "Authorization: Bearer " + Supabase_API_Key + "\r\n"
      "Prefer: resolution=merge-duplicates,return=minimal\r\n";

   ResetLastError();

   // Assinatura de 7 parametros: (method, url, headers, timeout, data[],
   // result[], result_headers). E a unica que de fato manda a string de
   // headers como header HTTP (a de 9 parametros usa cookie/referer).
   int res = WebRequest(
      "POST",
      url,
      headers,
      WebRequest_Timeout_MS,
      post,
      result,
      result_headers
   );

   int err = GetLastError();

   string response = "";
   if(ArraySize(result) > 0)
      response = CharArrayToString(result);

   Print("[SUPABASE] HTTP Status: ", res);
   Print("[SUPABASE] Response: ", response);

   if(res == 200 || res == 201 || res == 204)
   {
      Print("[SUPABASE] SUCESSO HTTP=", res);
      // GetLastError() pode retornar 4000 ("no error") mesmo em chamadas
      // bem-sucedidas do WebRequest no MT4 - so vale logar se for outro
      // codigo (erro real concorrente).
      if(err != 0 && err != 4000)
         Print("[SUPABASE] AVISO: MT4 Error=", err, " (ignorado pois HTTP=", res, ")");
   }
   else
   {
      Print("[SUPABASE] FALHA HTTP=", res);
      Print("[SUPABASE] MT4 ERROR=", err);
   }

   Print("[SUPABASE] =======================================");
}

//+------------------------------------------------------------------+
void CreatePanel()
{
   int corner = Panel_Corner;
   if(corner < 0 || corner > 3) corner = 0;

   int rows = (TOTAL_ASSETS + 1 + Cols - 1) / Cols;
   int realHeight = 20 + rows * Box_SpacingY + 10;

   bgObjName = StringFormat("FFB_%d_BG", objPrefix);
   ObjectCreate(bgObjName, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSet(bgObjName, OBJPROP_CORNER, corner);
   ObjectSet(bgObjName, OBJPROP_XDISTANCE, Panel_X - 5);
   ObjectSet(bgObjName, OBJPROP_YDISTANCE, Panel_Y - 5);
   ObjectSet(bgObjName, OBJPROP_XSIZE, Panel_Width);
   ObjectSet(bgObjName, OBJPROP_YSIZE, realHeight);
   ObjectSet(bgObjName, OBJPROP_BGCOLOR, C'10,10,10');
   ObjectSet(bgObjName, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSet(bgObjName, OBJPROP_COLOR, C'30,30,30');
   ObjectSet(bgObjName, OBJPROP_BACK, FALSE);
   ObjectSet(bgObjName, OBJPROP_SELECTABLE, FALSE);

   string titleObj = StringFormat("FFB_%d_TitleMain", objPrefix);
   ObjectCreate(titleObj, OBJ_LABEL, 0, 0, 0);
   ObjectSet(titleObj, OBJPROP_CORNER, corner);
   ObjectSet(titleObj, OBJPROP_XDISTANCE, Panel_X + 10);
   ObjectSet(titleObj, OBJPROP_YDISTANCE, Panel_Y + 2);
   ObjectSet(titleObj, OBJPROP_COLOR, Gold);
   ObjectSetText(titleObj, "IMPULSE TREND PANEL", 11, "Arial Bold", Gold);

   for(int i=0; i<TOTAL_ASSETS; i++)
   {
      int col = i % Cols;
      int row = i / Cols;
      int cx  = Panel_X + col * Box_SpacingX;
      int cy  = Panel_Y + 20 + row * Box_SpacingY;
      CreateAssetBox(i, cx, cy, corner);
   }

   int ff_col = TOTAL_ASSETS % Cols;
   int ff_row = TOTAL_ASSETS / Cols;
   int ff_x = Panel_X + ff_col * Box_SpacingX;
   int ff_y = Panel_Y + 20 + ff_row * Box_SpacingY;
   CreateForcaFinalBox(ff_x, ff_y, corner);
}

//+------------------------------------------------------------------+
void CreateAssetBox(int i, int cx, int cy, int corner)
{
   string objName = StringFormat("FFB_%d_Title_%d", objPrefix, i);
   ObjectCreate(objName, OBJ_LABEL, 0, 0, 0);
   ObjectSet(objName, OBJPROP_CORNER, corner);
   ObjectSet(objName, OBJPROP_XDISTANCE, cx);
   ObjectSet(objName, OBJPROP_YDISTANCE, cy + TITLE_Y_OFFSET);
   ObjectSet(objName, OBJPROP_COLOR, DarkOrange);
   ObjectSetText(objName, StringUpper(assets[i].symbol), 9, "Arial Bold", DarkOrange);

   objName = StringFormat("FFB_%d_MiniBG_%d", objPrefix, i);
   ObjectCreate(objName, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSet(objName, OBJPROP_CORNER, corner);
   ObjectSet(objName, OBJPROP_XDISTANCE, cx - 2);
   ObjectSet(objName, OBJPROP_YDISTANCE, cy + MINIBG_Y_OFFSET);
   ObjectSet(objName, OBJPROP_XSIZE, Box_SpacingX - 10);
   ObjectSet(objName, OBJPROP_YSIZE, MINIBG_HEIGHT);
   ObjectSet(objName, OBJPROP_BGCOLOR, C'20,20,20');
   ObjectSet(objName, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSet(objName, OBJPROP_COLOR, C'50,50,50');
   ObjectSet(objName, OBJPROP_BACK, FALSE);

   objName = StringFormat("FFB_%d_LblUp_%d", objPrefix, i);
   ObjectCreate(objName, OBJ_LABEL, 0, 0, 0);
   ObjectSet(objName, OBJPROP_CORNER, corner);
   ObjectSet(objName, OBJPROP_XDISTANCE, cx + 4);
   ObjectSet(objName, OBJPROP_YDISTANCE, cy + TEXT_Y_OFFSET);
   ObjectSet(objName, OBJPROP_COLOR, Lime);
   ObjectSetText(objName, "UP:", 8, "Arial", Lime);

   objName = StringFormat("FFB_%d_Up_%d", objPrefix, i);
   ObjectCreate(objName, OBJ_LABEL, 0, 0, 0);
   ObjectSet(objName, OBJPROP_CORNER, corner);
   ObjectSet(objName, OBJPROP_XDISTANCE, cx + 28);
   ObjectSet(objName, OBJPROP_YDISTANCE, cy + TEXT_Y_OFFSET);
   ObjectSet(objName, OBJPROP_COLOR, Lime);
   ObjectSetText(objName, "0%", 9, "Arial Bold", Lime);

   objName = StringFormat("FFB_%d_LblDn_%d", objPrefix, i);
   ObjectCreate(objName, OBJ_LABEL, 0, 0, 0);
   ObjectSet(objName, OBJPROP_CORNER, corner);
   ObjectSet(objName, OBJPROP_XDISTANCE, cx + 62);
   ObjectSet(objName, OBJPROP_YDISTANCE, cy + TEXT_Y_OFFSET);
   ObjectSet(objName, OBJPROP_COLOR, Red);
   ObjectSetText(objName, "DN:", 8, "Arial", Red);

   objName = StringFormat("FFB_%d_Dn_%d", objPrefix, i);
   ObjectCreate(objName, OBJ_LABEL, 0, 0, 0);
   ObjectSet(objName, OBJPROP_CORNER, corner);
   ObjectSet(objName, OBJPROP_XDISTANCE, cx + 86);
   ObjectSet(objName, OBJPROP_YDISTANCE, cy + TEXT_Y_OFFSET);
   ObjectSet(objName, OBJPROP_COLOR, Red);
   ObjectSetText(objName, "0%", 9, "Arial Bold", Red);

   objName = StringFormat("FFB_%d_BarBg_%d", objPrefix, i);
   ObjectCreate(objName, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSet(objName, OBJPROP_CORNER, corner);
   ObjectSet(objName, OBJPROP_XDISTANCE, cx + 4);
   ObjectSet(objName, OBJPROP_YDISTANCE, cy + BAR_Y_OFFSET);
   ObjectSet(objName, OBJPROP_XSIZE, Box_SpacingX - 16);
   ObjectSet(objName, OBJPROP_YSIZE, BAR_HEIGHT);
   ObjectSet(objName, OBJPROP_BGCOLOR, C'30,30,30');
   ObjectSet(objName, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSet(objName, OBJPROP_BACK, FALSE);

   objName = StringFormat("FFB_%d_Bar_%d", objPrefix, i);
   ObjectCreate(objName, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSet(objName, OBJPROP_CORNER, corner);
   ObjectSet(objName, OBJPROP_XDISTANCE, cx + 4);
   ObjectSet(objName, OBJPROP_YDISTANCE, cy + BAR_Y_OFFSET);
   ObjectSet(objName, OBJPROP_XSIZE, 1);
   ObjectSet(objName, OBJPROP_YSIZE, BAR_HEIGHT);
   ObjectSet(objName, OBJPROP_BGCOLOR, DarkOrange);
   ObjectSet(objName, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSet(objName, OBJPROP_BACK, FALSE);
}

//+------------------------------------------------------------------+
void CreateForcaFinalBox(int cx, int cy, int corner)
{
   string objName = StringFormat("FFB_%d_FF_BG", objPrefix);
   ObjectCreate(objName, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSet(objName, OBJPROP_CORNER, corner);
   ObjectSet(objName, OBJPROP_XDISTANCE, cx - 3);
   ObjectSet(objName, OBJPROP_YDISTANCE, cy - 2);
   ObjectSet(objName, OBJPROP_XSIZE, Box_SpacingX - 4);
   ObjectSet(objName, OBJPROP_YSIZE, 34);
   ObjectSet(objName, OBJPROP_BGCOLOR, C'40,30,0');
   ObjectSet(objName, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSet(objName, OBJPROP_COLOR, Gold);
   ObjectSet(objName, OBJPROP_BACK, FALSE);

   objName = StringFormat("FFB_%d_FF_Title", objPrefix);
   ObjectCreate(objName, OBJ_LABEL, 0, 0, 0);
   ObjectSet(objName, OBJPROP_CORNER, corner);
   ObjectSet(objName, OBJPROP_XDISTANCE, cx + 4);
   ObjectSet(objName, OBJPROP_YDISTANCE, cy);
   ObjectSet(objName, OBJPROP_COLOR, Gold);
   ObjectSetText(objName, "NAS100 FORCA", 9, "Arial Bold", Gold);

   objName = StringFormat("FFB_%d_FF_Up", objPrefix);
   ObjectCreate(objName, OBJ_LABEL, 0, 0, 0);
   ObjectSet(objName, OBJPROP_CORNER, corner);
   ObjectSet(objName, OBJPROP_XDISTANCE, cx + 4);
   ObjectSet(objName, OBJPROP_YDISTANCE, cy + FF_TEXT_Y);
   ObjectSet(objName, OBJPROP_COLOR, Lime);
   ObjectSetText(objName, "C: 0%", 10, "Arial Bold", Lime);

   objName = StringFormat("FFB_%d_FF_Dn", objPrefix);
   ObjectCreate(objName, OBJ_LABEL, 0, 0, 0);
   ObjectSet(objName, OBJPROP_CORNER, corner);
   ObjectSet(objName, OBJPROP_XDISTANCE, cx + 58);
   ObjectSet(objName, OBJPROP_YDISTANCE, cy + FF_TEXT_Y);
   ObjectSet(objName, OBJPROP_COLOR, Red);
   ObjectSetText(objName, "V: 0%", 10, "Arial Bold", Red);

   objName = StringFormat("FFB_%d_FF_Sig", objPrefix);
   ObjectCreate(objName, OBJ_LABEL, 0, 0, 0);
   ObjectSet(objName, OBJPROP_CORNER, corner);
   ObjectSet(objName, OBJPROP_XDISTANCE, cx + 98);
   ObjectSet(objName, OBJPROP_YDISTANCE, cy + FF_TEXT_Y - 1);
   ObjectSet(objName, OBJPROP_COLOR, Silver);
   ObjectSetText(objName, "◆", 12, "Wingdings", Silver);

   objName = StringFormat("FFB_%d_FF_BarBg", objPrefix);
   ObjectCreate(objName, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSet(objName, OBJPROP_CORNER, corner);
   ObjectSet(objName, OBJPROP_XDISTANCE, cx + 4);
   ObjectSet(objName, OBJPROP_YDISTANCE, cy + FF_BAR_Y);
   ObjectSet(objName, OBJPROP_XSIZE, Box_SpacingX - 14);
   ObjectSet(objName, OBJPROP_YSIZE, FF_BAR_HEIGHT);
   ObjectSet(objName, OBJPROP_BGCOLOR, C'30,30,30');
   ObjectSet(objName, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSet(objName, OBJPROP_BACK, FALSE);

   objName = StringFormat("FFB_%d_FF_Bar", objPrefix);
   ObjectCreate(objName, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSet(objName, OBJPROP_CORNER, corner);
   ObjectSet(objName, OBJPROP_XDISTANCE, cx + 4);
   ObjectSet(objName, OBJPROP_YDISTANCE, cy + FF_BAR_Y);
   ObjectSet(objName, OBJPROP_XSIZE, 1);
   ObjectSet(objName, OBJPROP_YSIZE, FF_BAR_HEIGHT);
   ObjectSet(objName, OBJPROP_BGCOLOR, DarkOrange);
   ObjectSet(objName, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSet(objName, OBJPROP_BACK, FALSE);

   objName = StringFormat("FFB_%d_FF_Hours", objPrefix);
   ObjectCreate(objName, OBJ_LABEL, 0, 0, 0);
   ObjectSet(objName, OBJPROP_CORNER, corner);
   ObjectSet(objName, OBJPROP_XDISTANCE, cx + 4);
   ObjectSet(objName, OBJPROP_YDISTANCE, cy + FF_BAR_Y + FF_BAR_HEIGHT + 2);
   ObjectSet(objName, OBJPROP_COLOR, Gray);
   ObjectSetText(objName, "OFF-HOURS", 7, "Arial", Gray);
}

//+------------------------------------------------------------------+
void UpdatePanel()
{
   for(int i=0; i<TOTAL_ASSETS; i++)
   {
      string objName;
      color cUp = assets[i].compra > assets[i].venda ? Lime : C'0,120,0';
      color cDn = assets[i].venda > assets[i].compra ? Red  : C'120,0,0';

      objName = StringFormat("FFB_%d_Up_%d", objPrefix, i);
      if(ObjectFind(objName) >= 0) ObjectSetText(objName, DoubleToString(assets[i].compra,0) + "%", 9, "Arial Bold", cUp);

      objName = StringFormat("FFB_%d_Dn_%d", objPrefix, i);
      if(ObjectFind(objName) >= 0) ObjectSetText(objName, DoubleToString(assets[i].venda,0) + "%", 9, "Arial Bold", cDn);

      objName = StringFormat("FFB_%d_Bar_%d", objPrefix, i);
      if(ObjectFind(objName) >= 0)
      {
         int maxW = Box_SpacingX - 16;
         int w = (int)(maxW * MathMax(assets[i].compra, assets[i].venda) / 100.0);
         if(w < 1) w = 1; if(w > maxW) w = maxW;
         ObjectSet(objName, OBJPROP_XSIZE, w);
         ObjectSet(objName, OBJPROP_BGCOLOR, assets[i].compra > assets[i].venda ? Lime : Red);
      }
   }
   UpdateForcaFinalPanel();
}

//+------------------------------------------------------------------+
void UpdateForcaFinalPanel()
{
   string objName;
   color cUp = g_nas100_forca_compra > g_nas100_forca_venda ? Lime : C'0,120,0';
   color cDn = g_nas100_forca_venda > g_nas100_forca_compra ? Red  : C'120,0,0';

   objName = StringFormat("FFB_%d_FF_Up", objPrefix);
   if(ObjectFind(objName) >= 0) ObjectSetText(objName, "C:" + DoubleToString(g_nas100_forca_compra,0) + "%", 10, "Arial Bold", cUp);

   objName = StringFormat("FFB_%d_FF_Dn", objPrefix);
   if(ObjectFind(objName) >= 0) ObjectSetText(objName, "V:" + DoubleToString(g_nas100_forca_venda,0) + "%", 10, "Arial Bold", cDn);

   objName = StringFormat("FFB_%d_FF_Sig", objPrefix);
   if(ObjectFind(objName) >= 0)
   {
      color sigColor = Silver; string sigText = "◆";
      if(g_nas100_direcao == 1) { sigColor = Lime; sigText = "▲"; }
      if(g_nas100_direcao == -1) { sigColor = Red; sigText = "▼"; }
      ObjectSet(objName, OBJPROP_COLOR, sigColor);
      ObjectSetText(objName, sigText, 12, "Wingdings", sigColor);
   }

   objName = StringFormat("FFB_%d_FF_Bar", objPrefix);
   if(ObjectFind(objName) >= 0)
   {
      int maxW = Box_SpacingX - 14;
      int w = (int)(maxW * MathMax(g_nas100_forca_compra, g_nas100_forca_venda) / 100.0);
      if(w < 1) w = 1; if(w > maxW) w = maxW;
      ObjectSet(objName, OBJPROP_XSIZE, w);
      ObjectSet(objName, OBJPROP_BGCOLOR, g_nas100_forca_compra > g_nas100_forca_venda ? Lime : Red);
   }

   objName = StringFormat("FFB_%d_FF_Hours", objPrefix);
   if(ObjectFind(objName) >= 0)
   {
      bool open = IsNasdaqOpen();
      ObjectSet(objName, OBJPROP_COLOR, open ? C'0,150,0' : C'150,0,0');
      ObjectSetText(objName, open ? "NASDAQ OPEN" : "OFF-HOURS", 7, "Arial", open ? C'0,150,0' : C'150,0,0');
   }
}

//+------------------------------------------------------------------+
void DeletePanel()
{
   ObjectDelete(bgObjName);
   ObjectDelete(StringFormat("FFB_%d_TitleMain", objPrefix));
   for(int i=0; i<TOTAL_ASSETS; i++)
   {
      ObjectDelete(StringFormat("FFB_%d_Title_%d", objPrefix, i));
      ObjectDelete(StringFormat("FFB_%d_MiniBG_%d", objPrefix, i));
      ObjectDelete(StringFormat("FFB_%d_LblUp_%d", objPrefix, i));
      ObjectDelete(StringFormat("FFB_%d_Up_%d", objPrefix, i));
      ObjectDelete(StringFormat("FFB_%d_LblDn_%d", objPrefix, i));
      ObjectDelete(StringFormat("FFB_%d_Dn_%d", objPrefix, i));
      ObjectDelete(StringFormat("FFB_%d_BarBg_%d", objPrefix, i));
      ObjectDelete(StringFormat("FFB_%d_Bar_%d", objPrefix, i));
   }
   ObjectDelete(StringFormat("FFB_%d_FF_BG", objPrefix));
   ObjectDelete(StringFormat("FFB_%d_FF_Title", objPrefix));
   ObjectDelete(StringFormat("FFB_%d_FF_Up", objPrefix));
   ObjectDelete(StringFormat("FFB_%d_FF_Dn", objPrefix));
   ObjectDelete(StringFormat("FFB_%d_FF_Sig", objPrefix));
   ObjectDelete(StringFormat("FFB_%d_FF_BarBg", objPrefix));
   ObjectDelete(StringFormat("FFB_%d_FF_Bar", objPrefix));
   ObjectDelete(StringFormat("FFB_%d_FF_Hours", objPrefix));
}

//+------------------------------------------------------------------+
string StringUpper(string s)
{
   string r = "";
   for(int i=0; i<StringLen(s); i++)
   {
      ushort c = StringGetChar(s, i);
      if(c >= 97 && c <= 122) c -= 32;
      r += ShortToString(c);
   }
   return r;
}
//+------------------------------------------------------------------+
