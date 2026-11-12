import os
import re

def update_code(content, is_standalone=False):
    # 1. Update Enums
    old_enums = """public enum PlaybookT0Mode { Swing60m_130x85pts, Scalp5m_45x45pts, RoboFixoTicks }
\t\t\t\tpublic enum PlaybookOR15GestaoMode { Parcial25_BE_Final50_Stop25, Parcial25_BE_Final50_Stop50, Alvo25_Stop25_1para1, Alvo50_Stop25_2para1, Alvo50_Stop50_1para1 }"""

    new_enums = """public enum PlaybookAtivoMode { AutoDetectar, Nasdaq_NQ_MNQ, Sp500_ES_MES, Customizado_Livre }
\t\t\t\tpublic enum PlaybookT0Mode { Auto_ConformeAtivo, Auto_Scalp5m, NQ_Swing60m_130x85pts, NQ_Scalp5m_45x45pts, ES_Swing60m_22x14pts, ES_Scalp5m_7x7pts, Customizado_Ticks, RoboFixoTicks }
\t\t\t\tpublic enum PlaybookM5Mode { Auto_ConformeAtivo, Customizado_Pontos, Customizado_Ticks }
\t\t\t\tpublic enum PlaybookOR15GestaoMode { Parcial25_BE_Final50_Stop25, Parcial25_BE_Final50_Stop50, Alvo25_Stop25_1para1, Alvo50_Stop25_2para1, Alvo50_Stop50_1para1 }"""

    if old_enums in content:
        content = content.replace(old_enums, new_enums)
    else:
        # Regex fallback for tabs/spaces
        content = re.sub(
            r'public enum PlaybookT0Mode\s*\{[^}]+\}\s*public enum PlaybookOR15GestaoMode\s*\{[^}]+\}',
            new_enums,
            content
        )

    # 2. Update SetDefaults
    old_defaults = """						// ── 26. PLAYBOOK NASDAQ FORCE (CRONOLOGIA QUADRO 4) ──
						PB_InstanceId                = "painel_principal_web";
						PB_AutoDST_EUA               = true;
						PB_HoraAberturaManual        = DateTime.Parse("11:30", System.Globalization.CultureInfo.InvariantCulture);
						PB_HoraAsiaManual            = DateTime.Parse("20:00", System.Globalization.CultureInfo.InvariantCulture);
						PB_DesenharNiveisOR15        = true;
						PB_OperarAberturaT0          = true;
						PB_T0_ModoGestao             = PlaybookT0Mode.Swing60m_130x85pts;
						PB_T0_ForcaMinCompra         = 52.0;
						PB_T0_ForcaMaxVenda          = 48.0;
						PB_OperarConfirmacaoM5       = true;
						PB_M5_ApenasSeT0NaoEntrou    = true;
						PB_M5_ForcaFinalCompra       = 55.0;
						PB_M5_ForcaTechCompra        = 52.0;
						PB_M5_ForcaFinalVenda        = 45.0;
						PB_M5_ForcaTechVenda         = 48.0;
						PB_M5_TpPontos               = 110.0;
						PB_M5_SlPontos               = 75.0;
						PB_M5_DuracaoMaxMinutos      = 55;
						PB_OperarOR15_Reversao       = true;
						PB_OperarOR15_Breakout       = true;
						PB_OR15_ModoGestao           = PlaybookOR15GestaoMode.Parcial25_BE_Final50_Stop25;
						PB_OR15_ForcaBreakoutMin     = 55.0;
						PB_OR15_ReversaoMinRangePts  = 60.0;
						PB_OR15_CaixaComprimidaMaxPts = 120.0;
						PB_OR15_CaixaExplosivaMinPts = 180.0;
						PB_OR15_BreakoutQualquerCaixa = false;
						PB_OR15_JanelaMaxMinutos     = 120;"""

    new_defaults = """						// ── 26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES) ──
						PB_PerfilAtivo               = PlaybookAtivoMode.AutoDetectar;
						PB_InstanceId                = "painel_principal_web";
						PB_AutoDST_EUA               = true;
						PB_HoraAberturaManual        = DateTime.Parse("11:30", System.Globalization.CultureInfo.InvariantCulture);
						PB_HoraAsiaManual            = DateTime.Parse("20:00", System.Globalization.CultureInfo.InvariantCulture);
						PB_DesenharNiveisOR15        = true;
						PB_OperarAberturaT0          = true;
						PB_T0_ModoGestao             = PlaybookT0Mode.Auto_ConformeAtivo;
						PB_T0_CustomTpTicks          = 28;
						PB_T0_CustomSlTicks          = 28;
						PB_T0_CustomMaxMinutos       = 60;
						PB_T0_ForcaMinCompra         = 52.0;
						PB_T0_ForcaMaxVenda          = 48.0;
						PB_OperarConfirmacaoM5       = true;
						PB_M5_ApenasSeT0NaoEntrou    = true;
						PB_M5_ModoGestao             = PlaybookM5Mode.Auto_ConformeAtivo;
						PB_M5_ForcaFinalCompra       = 55.0;
						PB_M5_ForcaTechCompra        = 52.0;
						PB_M5_ForcaFinalVenda        = 45.0;
						PB_M5_ForcaTechVenda         = 48.0;
						PB_M5_TpPontos               = 110.0;
						PB_M5_SlPontos               = 75.0;
						PB_M5_TpTicks                = 0;
						PB_M5_SlTicks                = 0;
						PB_M5_DuracaoMaxMinutos      = 55;
						PB_OperarOR15_Reversao       = true;
						PB_OperarOR15_Breakout       = true;
						PB_OR15_ModoGestao           = PlaybookOR15GestaoMode.Parcial25_BE_Final50_Stop25;
						PB_OR15_ForcaBreakoutMin     = 55.0;
						PB_OR15_ReversaoMinRangePts  = 0.0; // 0 = Auto conforme ativo (15 pts no ES / 60 pts no NQ)
						PB_OR15_CaixaComprimidaMaxPts = 0.0; // 0 = Auto conforme ativo (20 pts no ES / 120 pts no NQ)
						PB_OR15_CaixaExplosivaMinPts = 0.0; // 0 = Auto conforme ativo (30 pts no ES / 180 pts no NQ)
						PB_OR15_BreakoutQualquerCaixa = false;
						PB_OR15_JanelaMaxMinutos     = 120;"""

    if old_defaults in content:
        content = content.replace(old_defaults, new_defaults)
    else:
        print("Warning: old_defaults not found exactly, trying regex")
        content = re.sub(
            r'// ── 26\. PLAYBOOK NASDAQ FORCE.+?PB_OR15_JanelaMaxMinutos\s*=\s*120;',
            new_defaults,
            content,
            flags=re.DOTALL
        )

    # 3. Add helper methods before ProcessPlaybookNasdaq
    helper_methods = """				private bool IsEsAsset()
				{
					if (PB_PerfilAtivo == PlaybookAtivoMode.Sp500_ES_MES) return true;
					if (PB_PerfilAtivo == PlaybookAtivoMode.Nasdaq_NQ_MNQ) return false;
					if (Instrument == null) return false;
					string sym = (Instrument.MasterInstrument != null ? Instrument.MasterInstrument.Name : Instrument.FullName).ToUpperInvariant();
					return sym.StartsWith("ES") || sym.StartsWith("MES") || sym.Contains("SP500") || sym.Contains("S&P");
				}

				private double GetOr15ReversaoMinPts()
				{
					if (PB_OR15_ReversaoMinRangePts > 0) return PB_OR15_ReversaoMinRangePts;
					return IsEsAsset() ? 15.0 : 60.0;
				}

				private double GetOr15CaixaComprimidaMaxPts()
				{
					if (PB_OR15_CaixaComprimidaMaxPts > 0) return PB_OR15_CaixaComprimidaMaxPts;
					return IsEsAsset() ? 20.0 : 120.0;
				}

				private double GetOr15CaixaExplosivaMinPts()
				{
					if (PB_OR15_CaixaExplosivaMinPts > 0) return PB_OR15_CaixaExplosivaMinPts;
					return IsEsAsset() ? 30.0 : 180.0;
				}

				private void ProcessPlaybookNasdaq()"""

    content = content.replace("				private void ProcessPlaybookNasdaq()", helper_methods)

    # 4. Update T0 execution logic
    old_t0_exec = """								int slTicksT0 = SL_Ticks;
								int tpTicksT0 = TP_Ticks;
								int maxMinT0  = 60;

								if (PB_T0_ModoGestao == PlaybookT0Mode.Swing60m_130x85pts)
								{
									tpTicksT0 = (int)Math.Round(130.0 / TickSize); // 130 pts = 520 ticks
									slTicksT0 = (int)Math.Round(85.0  / TickSize); // 85 pts  = 340 ticks
									maxMinT0  = 60;
								}
								else if (PB_T0_ModoGestao == PlaybookT0Mode.Scalp5m_45x45pts)
								{
									tpTicksT0 = (int)Math.Round(45.0 / TickSize); // 45 pts = 180 ticks
									slTicksT0 = (int)Math.Round(45.0 / TickSize); // 45 pts = 180 ticks
									maxMinT0  = 5;
								}"""

    new_t0_exec = """								int slTicksT0 = SL_Ticks;
								int tpTicksT0 = TP_Ticks;
								int maxMinT0  = 60;
								bool isEs     = IsEsAsset();

								switch (PB_T0_ModoGestao)
								{
									case PlaybookT0Mode.Auto_ConformeAtivo:
										if (isEs)
										{
											tpTicksT0 = (int)Math.Round(22.0 / TickSize); // 22 pts = 88 ticks
											slTicksT0 = (int)Math.Round(14.0 / TickSize); // 14 pts = 56 ticks
											maxMinT0  = 60;
										}
										else
										{
											tpTicksT0 = (int)Math.Round(130.0 / TickSize); // 130 pts = 520 ticks
											slTicksT0 = (int)Math.Round(85.0  / TickSize); // 85 pts  = 340 ticks
											maxMinT0  = 60;
										}
										break;

									case PlaybookT0Mode.Auto_Scalp5m:
										if (isEs)
										{
											tpTicksT0 = (int)Math.Round(7.0 / TickSize); // 7 pts = 28 ticks
											slTicksT0 = (int)Math.Round(7.0 / TickSize); // 7 pts = 28 ticks
											maxMinT0  = 5;
										}
										else
										{
											tpTicksT0 = (int)Math.Round(45.0 / TickSize); // 45 pts = 180 ticks
											slTicksT0 = (int)Math.Round(45.0 / TickSize); // 45 pts = 180 ticks
											maxMinT0  = 5;
										}
										break;

									case PlaybookT0Mode.NQ_Swing60m_130x85pts:
										tpTicksT0 = (int)Math.Round(130.0 / TickSize);
										slTicksT0 = (int)Math.Round(85.0  / TickSize);
										maxMinT0  = 60;
										break;

									case PlaybookT0Mode.NQ_Scalp5m_45x45pts:
										tpTicksT0 = (int)Math.Round(45.0 / TickSize);
										slTicksT0 = (int)Math.Round(45.0 / TickSize);
										maxMinT0  = 5;
										break;

									case PlaybookT0Mode.ES_Swing60m_22x14pts:
										tpTicksT0 = (int)Math.Round(22.0 / TickSize); // 88 ticks
										slTicksT0 = (int)Math.Round(14.0 / TickSize); // 56 ticks
										maxMinT0  = 60;
										break;

									case PlaybookT0Mode.ES_Scalp5m_7x7pts:
										tpTicksT0 = (int)Math.Round(7.0 / TickSize); // 28 ticks
										slTicksT0 = (int)Math.Round(7.0 / TickSize); // 28 ticks
										maxMinT0  = 5;
										break;

									case PlaybookT0Mode.Customizado_Ticks:
										tpTicksT0 = Math.Max(1, PB_T0_CustomTpTicks);
										slTicksT0 = Math.Max(1, PB_T0_CustomSlTicks);
										maxMinT0  = Math.Max(1, PB_T0_CustomMaxMinutos);
										break;

									case PlaybookT0Mode.RoboFixoTicks:
									default:
										tpTicksT0 = TP_Ticks;
										slTicksT0 = SL_Ticks;
										maxMinT0  = 60;
										break;
								}"""

    content = content.replace(old_t0_exec, new_t0_exec)

    # 5. Update M5 execution logic
    old_m5_exec = """								if (dirM5 != 0 && dirPermitida)
								{
									int tpTicksM5 = PB_M5_TpPontos > 0 ? (int)Math.Round(PB_M5_TpPontos / TickSize) : 0;
									int slTicksM5 = PB_M5_SlPontos > 0 ? (int)Math.Round(PB_M5_SlPontos / TickSize) : SL_Ticks;
									DateTime exitM5 = today + m5Time + TimeSpan.FromMinutes(PB_M5_DuracaoMaxMinutos);"""

    new_m5_exec = """								if (dirM5 != 0 && dirPermitida)
								{
									int tpTicksM5 = 0;
									int slTicksM5 = 0;
									bool isEsM5   = IsEsAsset();

									if (PB_M5_ModoGestao == PlaybookM5Mode.Customizado_Ticks && PB_M5_TpTicks > 0 && PB_M5_SlTicks > 0)
									{
										tpTicksM5 = PB_M5_TpTicks;
										slTicksM5 = PB_M5_SlTicks;
									}
									else if (PB_M5_ModoGestao == PlaybookM5Mode.Customizado_Pontos)
									{
										tpTicksM5 = PB_M5_TpPontos > 0 ? (int)Math.Round(PB_M5_TpPontos / TickSize) : 0;
										slTicksM5 = PB_M5_SlPontos > 0 ? (int)Math.Round(PB_M5_SlPontos / TickSize) : SL_Ticks;
									}
									else // Auto_ConformeAtivo
									{
										if (isEsM5)
										{
											tpTicksM5 = (int)Math.Round(7.0 / TickSize); // 28 ticks (7.0 pts)
											slTicksM5 = (int)Math.Round(7.0 / TickSize); // 28 ticks (7.0 pts)
										}
										else
										{
											tpTicksM5 = (int)Math.Round(110.0 / TickSize); // 440 ticks (110 pts)
											slTicksM5 = (int)Math.Round(75.0  / TickSize); // 300 ticks (75 pts)
										}
									}
									DateTime exitM5 = today + m5Time + TimeSpan.FromMinutes(PB_M5_DuracaoMaxMinutos);"""

    content = content.replace(old_m5_exec, new_m5_exec)

    # 6. Update OR15 evaluations
    old_or15_checks = """					bool caixaComprimida = _pbOr15RangePts <= PB_OR15_CaixaComprimidaMaxPts;
					bool caixaExplosiva  = _pbOr15RangePts >= PB_OR15_CaixaExplosivaMinPts;
					bool caixaElegivelBreakout = PB_OR15_BreakoutQualquerCaixa || caixaComprimida || caixaExplosiva;"""

    new_or15_checks = """					double revMinPts  = GetOr15ReversaoMinPts();
					double boxCompMax = GetOr15CaixaComprimidaMaxPts();
					double boxExplMin = GetOr15CaixaExplosivaMinPts();

					bool caixaComprimida = _pbOr15RangePts <= boxCompMax;
					bool caixaExplosiva  = _pbOr15RangePts >= boxExplMin;
					bool caixaElegivelBreakout = PB_OR15_BreakoutQualquerCaixa || caixaComprimida || caixaExplosiva;"""

    content = content.replace(old_or15_checks, new_or15_checks)

    # Reversal checks
    content = content.replace(
        "&& _pbOr15RangePts >= PB_OR15_ReversaoMinRangePts)",
        "&& _pbOr15RangePts >= revMinPts)"
    )

    # 7. Update ExecutarOrdemOR15 ticks floor
    old_floor = """					int totalLots = Math.Max(1, LOTE_Size);
					int ticks25 = Math.Max(10, (int)Math.Round(_pbOr15Q25Pts / TickSize));          // 25% da OR (50% da Metade)
					int ticks50 = Math.Max(20, (int)Math.Round((_pbOr15RangePts * 0.50) / TickSize)); // 50% da OR (OR_Mid)"""

    new_floor = """					int totalLots = Math.Max(1, LOTE_Size);
					bool isEsOR   = IsEsAsset();
					int minFloor25 = isEsOR ? 4 : 10;
					int minFloor50 = isEsOR ? 8 : 20;

					int ticks25 = Math.Max(minFloor25, (int)Math.Round(_pbOr15Q25Pts / TickSize));          // 25% da OR (50% da Metade)
					int ticks50 = Math.Max(minFloor50, (int)Math.Round((_pbOr15RangePts * 0.50) / TickSize)); // 50% da OR (OR_Mid)"""

    content = content.replace(old_floor, new_floor)

    # 8. Replace Group 26 Properties
    # Find start of group 26 properties
    group26_pattern = re.compile(
        r'// ── 26\. PLAYBOOK NASDAQ FORCE.+?public int PB_OR15_JanelaMaxMinutos \{ get; set; \} = 120;',
        re.DOTALL
    )

    new_group26_props = """// ── 26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES) ──
				[NinjaScriptProperty]
				[Display(Name="01. Perfil do Ativo (NQ vs ES)", Description="AutoDetectar (detecta NQ/MNQ ou ES/MES pelo gráfico) | Nasdaq_NQ_MNQ | Sp500_ES_MES | Customizado_Livre", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=1)]
				public PlaybookAtivoMode PB_PerfilAtivo { get; set; } = PlaybookAtivoMode.AutoDetectar;

				[NinjaScriptProperty]
				[Display(Name="02. ID Instância / Painel Web", Description="Identificador da instância no Supabase para buscar força", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=2)]
				public string PB_InstanceId { get; set; } = "painel_principal_web";

				[NinjaScriptProperty]
				[Display(Name="03. Horário Abertura NY — Auto DST (EUA)", Description="Detecta automaticamente Horário de Verão EUA (EDT: 10:30 BRT / Ásia 19:00 BRT) e Inverno EUA (EST: 11:30 BRT / Ásia 20:00 BRT)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=3)]
				public bool PB_AutoDST_EUA { get; set; } = true;

				[NinjaScriptProperty]
				[PropertyEditor("NinjaTrader.Gui.Tools.TimeEditorKey")]
				[Display(Name="04. Horário Abertura NY (Manual)", Description="Usado apenas se Auto DST estiver desmarcada (Ex: 11:30 ou 10:30 BRT)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=4)]
				public DateTime PB_HoraAberturaManual { get; set; }

				[NinjaScriptProperty]
				[PropertyEditor("NinjaTrader.Gui.Tools.TimeEditorKey")]
				[Display(Name="05. Horário Abertura Ásia (Manual)", Description="Usado apenas se Auto DST estiver desmarcada (Ex: 20:00 ou 19:00 BRT)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=5)]
				public DateTime PB_HoraAsiaManual { get; set; }

				[NinjaScriptProperty]
				[Display(Name="06. Desenhar Níveis OR15 (Max, Min, 50% e 25%)", Description="Traça no gráfico as linhas de Máxima, Mínima, 50% (OR_Mid) e 25% (50% da Metade) dos primeiros 15 minutos", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=6)]
				public bool PB_DesenharNiveisOR15 { get; set; } = true;

				[NinjaScriptProperty]
				[Display(Name="07. [FLAG 1] Operar Abertura 1º Segundo (T0)", Description="Ativa a entrada no 1º segundo da abertura Cash NY quando Força Ásia e Força T-15m estão alinhadas", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=7)]
				public bool PB_OperarAberturaT0 { get; set; } = true;

				[NinjaScriptProperty]
				[Display(Name="08. [T0] Modo de Gestão (Swing / Scalp / Custom Ticks)", Description="Auto_ConformeAtivo (NQ 130x85pts / ES 22x14pts) | Auto_Scalp5m (NQ 45x45pts / ES 7x7pts) | NQ_Swing | NQ_Scalp | ES_Swing | ES_Scalp | Customizado_Ticks | RoboFixoTicks", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=8)]
				public PlaybookT0Mode PB_T0_ModoGestao { get; set; } = PlaybookT0Mode.Auto_ConformeAtivo;

				[NinjaScriptProperty]
				[Range(1, 20000)]
				[Display(Name="09. [T0 Custom] Take Profit (Ticks)", Description="Take profit em ticks para T0 quando selecionado Customizado_Ticks (Ex: 28 ticks no ES, 180 ticks no NQ)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=9)]
				public int PB_T0_CustomTpTicks { get; set; } = 28;

				[NinjaScriptProperty]
				[Range(1, 20000)]
				[Display(Name="10. [T0 Custom] Stop Loss (Ticks)", Description="Stop loss em ticks para T0 quando selecionado Customizado_Ticks (Ex: 28 ticks no ES, 180 ticks no NQ)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=10)]
				public int PB_T0_CustomSlTicks { get; set; } = 28;

				[NinjaScriptProperty]
				[Range(1, 360)]
				[Display(Name="11. [T0 Custom] Duração Máxima (Minutos)", Description="Tempo de saída por relógio em minutos quando Customizado_Ticks (Padrão: 5 min para scalp, 60 min para swing)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=11)]
				public int PB_T0_CustomMaxMinutos { get; set; } = 60;

				[NinjaScriptProperty]
				[Range(50.0, 95.0)]
				[Display(Name="12. [T0] Força Mínima Compra — Ásia e T-15m (%)", Description="Percentual mínimo em Ásia E em T-15m para validar Compra no 1º segundo (Padrão: 52%)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=12)]
				public double PB_T0_ForcaMinCompra { get; set; } = 52.0;

				[NinjaScriptProperty]
				[Range(5.0, 50.0)]
				[Display(Name="13. [T0] Força Máxima Venda — Ásia e T-15m (%)", Description="Percentual máximo em Ásia E em T-15m para validar Venda no 1º segundo (Padrão: 48%)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=13)]
				public double PB_T0_ForcaMaxVenda { get; set; } = 48.0;

				[NinjaScriptProperty]
				[Display(Name="14. [FLAG 2] Aguardar e Operar Confirmação M5 (T+5m)", Description="Ativa a operação após o fechamento dos primeiros 5 minutos (pós-armadilha do 1º minuto) validando Força Final + 7 Techs", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=14)]
				public bool PB_OperarConfirmacaoM5 { get; set; } = true;

				[NinjaScriptProperty]
				[Display(Name="15. [M5] Operar M5 Apenas se T0 Não Entrou", Description="Se verdadeiro (fluxograma Quadro 4), só avalia entrada em T+5m nos dias em que o T0 não disparou", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=15)]
				public bool PB_M5_ApenasSeT0NaoEntrou { get; set; } = true;

				[NinjaScriptProperty]
				[Display(Name="16. [M5] Modo de Gestão M5", Description="Auto_ConformeAtivo (NQ 110x75pts / ES 7x7pts) | Customizado_Pontos | Customizado_Ticks", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=16)]
				public PlaybookM5Mode PB_M5_ModoGestao { get; set; } = PlaybookM5Mode.Auto_ConformeAtivo;

				[NinjaScriptProperty]
				[Range(50.0, 95.0)]
				[Display(Name="17. [M5] Força Final Mínima Compra (%)", Description="Força Final mínima em T+5m para Compra (Padrão: 55%)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=17)]
				public double PB_M5_ForcaFinalCompra { get; set; } = 55.0;

				[NinjaScriptProperty]
				[Range(50.0, 95.0)]
				[Display(Name="18. [M5] Força 7 Techs Mínima Compra (%)", Description="Média mínima das 7 ações Tech em T+5m para Compra (Padrão: 52%)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=18)]
				public double PB_M5_ForcaTechCompra { get; set; } = 52.0;

				[NinjaScriptProperty]
				[Range(5.0, 50.0)]
				[Display(Name="19. [M5] Força Final Máxima Venda (%)", Description="Força Final máxima em T+5m para Venda (Padrão: 45%)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=19)]
				public double PB_M5_ForcaFinalVenda { get; set; } = 45.0;

				[NinjaScriptProperty]
				[Range(5.0, 50.0)]
				[Display(Name="20. [M5] Força 7 Techs Máxima Venda (%)", Description="Média máxima das 7 ações Tech em T+5m para Venda (Padrão: 48%)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=20)]
				public double PB_M5_ForcaTechVenda { get; set; } = 48.0;

				[NinjaScriptProperty]
				[Range(0.0, 2000.0)]
				[Display(Name="21. [M5 Custom] Take Profit (Pontos)", Description="Alvo em pontos na confirmação de 5 minutos quando Modo=Customizado_Pontos (Ex: 7 pts no ES, 110 pts no NQ)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=21)]
				public double PB_M5_TpPontos { get; set; } = 110.0;

				[NinjaScriptProperty]
				[Range(0.0, 2000.0)]
				[Display(Name="22. [M5 Custom] Stop Loss (Pontos)", Description="Stop Loss em pontos na confirmação de 5 minutos quando Modo=Customizado_Pontos (Ex: 7 pts no ES, 75 pts no NQ)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=22)]
				public double PB_M5_SlPontos { get; set; } = 75.0;

				[NinjaScriptProperty]
				[Range(0, 20000)]
				[Display(Name="23. [M5 Custom] Take Profit (Ticks)", Description="Alvo em ticks diretos para M5 quando Modo=Customizado_Ticks (Ex: 28 ticks no ES, 440 ticks no NQ)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=23)]
				public int PB_M5_TpTicks { get; set; } = 0;

				[NinjaScriptProperty]
				[Range(0, 20000)]
				[Display(Name="24. [M5 Custom] Stop Loss (Ticks)", Description="Stop Loss em ticks diretos para M5 quando Modo=Customizado_Ticks (Ex: 28 ticks no ES, 300 ticks no NQ)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=24)]
				public int PB_M5_SlTicks { get; set; } = 0;

				[NinjaScriptProperty]
				[Range(5, 360)]
				[Display(Name="25. [M5] Duração Máxima (Minutos)", Description="Tempo máximo em minutos para manter a operação do M5 aberta (55 min = encerra em T+60m)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=25)]
				public int PB_M5_DuracaoMaxMinutos { get; set; } = 55;

				[NinjaScriptProperty]
				[Display(Name="26. [FLAG 3] Operar OR15 — Reversão / Fade (15 min)", Description="Ativa operação contra a borda da OR15 no 1º toque com rejeição (pavio) ou exaustão de força (< 55%)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=26)]
				public bool PB_OperarOR15_Reversao { get; set; } = true;

				[NinjaScriptProperty]
				[Display(Name="27. [FLAG 4] Operar OR15 — Rompimento / Breakout (15 min)", Description="Ativa operação a favor do rompimento da OR15 quando a vela fecha fora com Força >= 55%", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=27)]
				public bool PB_OperarOR15_Breakout { get; set; } = true;

				[NinjaScriptProperty]
				[Display(Name="28. [OR15] Modelo de Gestão 50% (OR_Mid) e 25% (50% da Metade)", Description="Define a combinação de Alvo, Parcial, Breakeven e Stop baseada em 50% e 25% da amplitude dos primeiros 15 minutos", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=28)]
				public PlaybookOR15GestaoMode PB_OR15_ModoGestao { get; set; } = PlaybookOR15GestaoMode.Parcial25_BE_Final50_Stop25;

				[NinjaScriptProperty]
				[Range(50.0, 95.0)]
				[Display(Name="29. [OR15] Força Mínima para Validar Breakout (%)", Description="Força mínima a favor do rompimento (Padrão: 55%). Abaixo disso ou com fechamento dentro, aciona Reversão/Fade", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=29)]
				public double PB_OR15_ForcaBreakoutMin { get; set; } = 55.0;

				[NinjaScriptProperty]
				[Range(0.0, 500.0)]
				[Display(Name="30. [OR15 Reversão] Amplitude Mínima da Caixa (Pontos)", Description="Amplitude mínima da OR15 em pontos para permitir Reversão (0 = Auto: 15 pts no ES / 60 pts no NQ)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=30)]
				public double PB_OR15_ReversaoMinRangePts { get; set; } = 0.0;

				[NinjaScriptProperty]
				[Range(0.0, 500.0)]
				[Display(Name="31. [OR15 Breakout] Caixa Comprimida Máx (Pontos)", Description="Teto em pontos para validar Breakout Comprimido (0 = Auto: 20 pts no ES / 120 pts no NQ)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=31)]
				public double PB_OR15_CaixaComprimidaMaxPts { get; set; } = 0.0;

				[NinjaScriptProperty]
				[Range(0.0, 1000.0)]
				[Display(Name="32. [OR15 Breakout] Caixa Explosiva Mín (Pontos)", Description="Piso em pontos para validar Breakout Explosivo (0 = Auto: 30 pts no ES / 180 pts no NQ)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=32)]
				public double PB_OR15_CaixaExplosivaMinPts { get; set; } = 0.0;

				[NinjaScriptProperty]
				[Display(Name="33. [OR15 Breakout] Permitir em Qualquer Tamanho de Caixa", Description="Se marcado, opera Breakout mesmo em caixas intermediárias desde que feche fora com Força >= 55%", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=33)]
				public bool PB_OR15_BreakoutQualquerCaixa { get; set; } = false;

				[NinjaScriptProperty]
				[Range(30, 390)]
				[Display(Name="34. [OR15] Janela Máxima após Abertura (Minutos)", Description="Tempo máximo após a abertura NY para buscar entradas na OR15 (Padrão: 120 min)", GroupName="26. PLAYBOOK MULTI-ATIVO (NQ / MNQ / ES / MES)", Order=34)]
				public int PB_OR15_JanelaMaxMinutos { get; set; } = 120;"""

    if group26_pattern.search(content):
        content = group26_pattern.sub(new_group26_props, content)
    else:
        print("Warning: group26_pattern did not match!")

    return content

for filepath in ['experts/VMPlaybookNasdaq.cs', 'experts/VMBotF.cs']:
    print(f"Updating {filepath}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        orig = f.read()
    
    updated = update_code(orig)
    if updated == orig:
        print(f"Error: No changes made to {filepath}!")
    else:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(updated)
        print(f"Success updating {filepath}! Length: {len(orig)} -> {len(updated)}")
