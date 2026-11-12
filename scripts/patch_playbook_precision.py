"""
Atualizacao precisa dos blocos T0 e M5 em VMPlaybookNasdaq.cs e VMBotF.cs:
1. Captura de Forca Londres no polling (05:00 BRT).
2. Telemetria do painel com linha de Londres.
3. Logica de T0 e M5 com seletores e Parcial automatica.
"""
import os, sys

def apply_patches(filepath):
    print(f"Atualizando {filepath}...", flush=True)
    with open(filepath, 'r', encoding='utf-8') as f:
        c = f.read()

    # 1. Adicionar busca de Londres no polling
    old_poll_t15 = """									// 3. Se já passamos de T-15m e ainda não temos T-15m capturada"""
    new_poll_ldn = """									// 2.5. Se a força de Londres ainda não foi capturada, busca no Supabase (05:00 BRT)
									if (_pbForcaLondres < 0)
									{
										DateTime ldnDt = curBrt.Date + TimeSpan.FromHours(5);
										NasdaqForceSnapshot snapLdn = AxionNasdaqForceCache.RequestSpecificMinuteAsync(supabaseUrl, supabaseServiceKey, PB_InstanceId, ldnDt, 60, DebugPrint);
										if (snapLdn.IsValid)
										{
											_pbForcaLondres = snapLdn.ForcaFinalCompra;
											DebugPrint($"[PLAYBOOK NQ] 🇬🇧 Força Londres ({ldnDt:dd/MM HH:mm}) carregada em RAM: {_pbForcaLondres:F1}%");
										}
									}

									// 3. Se já passamos de T-15m e ainda não temos T-15m capturada"""
    if "_pbForcaLondres < 0" not in c and old_poll_t15 in c:
        c = c.replace(old_poll_t15, new_poll_ldn)
        print("  -> Polling de Londres adicionado.", flush=True)

    # 2. Telemetria: adicionar Londres
    old_telemetry = """					_pPlaybookText = $"{nomeAtivoPerfil} • {faseStr} ({nyOpen:hh\\\\:mm} BRT)\\n" +
					                 $"• Sessão Ásia:        {asiaStr}\\n" +
					                 $"• Pré-Mercado (T-15m): {t15Str}\\n" + """
    new_telemetry = """					string ldnStr = _pbForcaLondres >= 0 
						? $"{_pbForcaLondres:F1}% ({(_pbForcaLondres >= 52.0 ? "Compradora" : (_pbForcaLondres <= 48.0 ? "Vendedora" : "Neutra"))})"
						: "Monitorando...";

					_pPlaybookText = $"{nomeAtivoPerfil} • {faseStr} ({nyOpen:hh\\\\:mm} BRT)\\n" +
					                 $"• Sessão Ásia:        {asiaStr}\\n" +
					                 $"• Sessão Londres:     {ldnStr}\\n" +
					                 $"• Pré-Mercado (T-15m): {t15Str}\\n" + """
    
    # Procura a substring no texto
    old_snippet = '					_pPlaybookText = $"{nomeAtivoPerfil} • {faseStr} ({nyOpen:hh\\\\:mm} BRT)\\n" +\n					                 $"• Sessão Ásia:        {asiaStr}\\n" +\n					                 $"• Pré-Mercado (T-15m): {t15Str}\\n" +'
    if old_snippet in c:
        c = c.replace(old_snippet, new_telemetry)
        print("  -> Telemetria de Londres adicionada ao painel.", flush=True)

    # 3. Substituir bloco T0
    target_t0_start = "					// CRONOLOGIA 1 — ENTRADA NO 1º SEGUNDO DA ABERTURA (T0 = nyOpen)"
    target_t0_end   = "					// CRONOLOGIA 2 — CONFIRMAÇÃO NO M5 (T+5m = nyOpen + 5 min)"
    
    idx_t0_s = c.find(target_t0_start)
    idx_t0_e = c.find(target_t0_end)

    if idx_t0_s != -1 and idx_t0_e != -1:
        new_t0_code = """					// CRONOLOGIA 1 — ENTRADA NO 1º SEGUNDO DA ABERTURA (T0 = nyOpen)
					// =================================================================
					bool naJanelaT0 = (ctRef >= nyOpen && ctRef <= nyOpen + TimeSpan.FromMinutes(2))
					               || (ctBar >= nyOpen && ctBar <= nyOpen + TimeSpan.FromMinutes(1));

					if (PB_OperarAberturaT0 && !_pbT0EvaluatedToday && naJanelaT0)
					{
						_pbT0EvaluatedToday = true;
						bool isEsT0 = IsEsAsset();

						// Viés Conforme Seletor Quantitativo
						bool useAsiaLondres = (PB_T0_ViesSessao == PlaybookT0ViesMode.Modo5_Asia_e_Londres) 
						                   || (PB_T0_ViesSessao == PlaybookT0ViesMode.Auto_Recomendado && !isEsT0); // NQ usa Ásia + Londres (+722 pts)

						double fRef1 = _pbForcaAsia;
						double fRef2 = useAsiaLondres ? (_pbForcaLondres >= 0 ? _pbForcaLondres : _pbForcaT15m) : _pbForcaT15m;

						if (fRef1 > 0 && fRef2 > 0)
						{
							int dirT0 = 0;
							if (fRef1 >= PB_T0_ForcaMinCompra && fRef2 >= PB_T0_ForcaMinCompra)
								dirT0 = 1;  // COMPRA T0
							else if (fRef1 <= PB_T0_ForcaMaxVenda && fRef2 <= PB_T0_ForcaMaxVenda)
								dirT0 = -1; // VENDA T0

							bool dirPermitida = (dirT0 == 1 && (currentOperatingMode == OperatingMode.Comprado || currentOperatingMode == OperatingMode.Ambos))
							                 || (dirT0 == -1 && (currentOperatingMode == OperatingMode.Vendido || currentOperatingMode == OperatingMode.Ambos));

							if (dirT0 != 0 && dirPermitida)
							{
								int slTicksT0 = SL_Ticks;
								int tpTicksT0 = TP_Ticks;
								int p1TicksT0 = 0;
								int p2TicksT0 = 0;
								bool usarParcialT0 = false;
								int maxMinT0  = 60;

								switch (PB_T0_ModoGestao)
								{
									case PlaybookT0Mode.Auto_Recomendado_Parcial:
									case PlaybookT0Mode.NQ_Scalp_Parcial_85x45x130pts:
									case PlaybookT0Mode.ES_Scalp_Parcial_7x4x8pts:
										usarParcialT0 = true;
										if (isEsT0) { slTicksT0 = 7 * 4; p1TicksT0 = 4 * 4; p2TicksT0 = 8 * 4; maxMinT0 = 30; }
										else        { slTicksT0 = 85 * 4; p1TicksT0 = 45 * 4; p2TicksT0 = 130 * 4; maxMinT0 = 60; }
										break;

									case PlaybookT0Mode.Auto_Scalp_Seco:
									case PlaybookT0Mode.NQ_Scalp_Seco_60x45pts:
									case PlaybookT0Mode.ES_Scalp_Seco_8x6pts:
										usarParcialT0 = false;
										if (isEsT0) { slTicksT0 = 8 * 4; tpTicksT0 = 6 * 4; maxMinT0 = 15; }
										else        { slTicksT0 = 60 * 4; tpTicksT0 = 45 * 4; maxMinT0 = 30; }
										break;

									case PlaybookT0Mode.Auto_Swing_Cheio:
									case PlaybookT0Mode.NQ_Swing60m_130x85pts:
									case PlaybookT0Mode.ES_Swing60m_22x14pts:
										usarParcialT0 = false;
										if (isEsT0) { slTicksT0 = 14 * 4; tpTicksT0 = 22 * 4; maxMinT0 = 60; }
										else        { slTicksT0 = 85 * 4; tpTicksT0 = 130 * 4; maxMinT0 = 60; }
										break;

									case PlaybookT0Mode.Customizado_Ticks:
										usarParcialT0 = false;
										tpTicksT0 = Math.Max(1, PB_T0_CustomTpTicks);
										slTicksT0 = Math.Max(1, PB_T0_CustomSlTicks);
										maxMinT0  = Math.Max(1, PB_T0_CustomMaxMinutos);
										break;

									case PlaybookT0Mode.RoboFixoTicks:
									default:
										usarParcialT0 = false;
										tpTicksT0 = TP_Ticks;
										slTicksT0 = SL_Ticks;
										maxMinT0  = 60;
										break;
								}

								DateTime exitTimeT0 = today + nyOpen + TimeSpan.FromMinutes(maxMinT0);
								if (usarParcialT0)
									ExecutarOrdemPlaybookParcial(dirT0, "PB_T0", slTicksT0, p1TicksT0, p2TicksT0, exitTimeT0);
								else
									ExecutarOrdemPlaybookSimples(dirT0, "PB_T0", slTicksT0, tpTicksT0, exitTimeT0);

								_pbT0TriggeredToday = true;
								DebugPrint($"[PLAYBOOK {(isEsT0 ? "ES" : "NQ")}] 🚀 [ETAPA 1 - T0] {(dirT0 == 1 ? "COMPRA" : "VENDA")} executada na abertura! " +
									$"Ref1={fRef1:F1}% | Ref2={fRef2:F1}% | Parcial={usarParcialT0} | SL={slTicksT0}tk");
								return;
							}
							else
							{
								DebugPrint($"[PLAYBOOK {(isEsT0 ? "ES" : "NQ")}] ⏸️ [ETAPA 1 - T0] Direção {dirT0} não permitida pelo modo operacional.");
							}
						}
						else
						{
							DebugPrint($"[PLAYBOOK {(isEsT0 ? "ES" : "NQ")}] ⏸️ [ETAPA 1 - T0] Forças de referência incompletas (Ref1={fRef1:F1}%, Ref2={fRef2:F1}%).");
						}
					}

					// =================================================================
"""
        c = c[:idx_t0_s] + new_t0_code + c[idx_t0_e:]
        print("  -> Bloco T0 cirurgicamente atualizado.", flush=True)

    # 4. Substituir bloco M5
    target_m5_start = "					// CRONOLOGIA 2 — CONFIRMAÇÃO NO M5 (T+5m = nyOpen + 5 min)"
    target_m5_end   = "					// CRONOLOGIA 3 & 4 — OPERAÇÃO NA OR15 (REVERSÃO/FADE & BREAKOUT)"

    idx_m5_s = c.find(target_m5_start)
    idx_m5_e = c.find(target_m5_end)

    if idx_m5_s != -1 and idx_m5_e != -1:
        new_m5_code = """					// CRONOLOGIA 2 — CONFIRMAÇÃO NO M5 (T+5m = nyOpen + 5 min)
					// =================================================================
					TimeSpan m5Time = nyOpen + TimeSpan.FromMinutes(5);
					bool naJanelaM5 = (ctBar >= m5Time && ctBar <= m5Time + TimeSpan.FromMinutes(2));

					if (PB_OperarConfirmacaoM5 && !_pbM5EvaluatedToday && naJanelaM5)
					{
						_pbM5EvaluatedToday = true;

						if (PB_M5_ApenasSeT0NaoEntrou && _pbT0TriggeredToday)
						{
							DebugPrint("[PLAYBOOK NQ] ℹ️ [ETAPA 2 - M5] Ignorada pois o T0 já operou hoje.");
						}
						else
						{
							NasdaqForceSnapshot snapM5 = AxionNasdaqForceCache.GetAtOrBefore(today + m5Time, 5, isLiveTrading);
							if (snapM5.IsValid)
							{
								int dirM5 = 0;
								if (snapM5.ForcaFinalCompra >= PB_M5_ForcaFinalCompra && snapM5.ForcaTechMediaCompra >= PB_M5_ForcaTechCompra)
									dirM5 = 1; // COMPRA M5
								else if (snapM5.ForcaFinalVenda <= PB_M5_ForcaFinalVenda && snapM5.ForcaTechMediaCompra <= PB_M5_ForcaTechVenda)
									dirM5 = -1; // VENDA M5

								bool dirPermitida = (dirM5 == 1 && (currentOperatingMode == OperatingMode.Comprado || currentOperatingMode == OperatingMode.Ambos))
								                 || (dirM5 == -1 && (currentOperatingMode == OperatingMode.Vendido || currentOperatingMode == OperatingMode.Ambos));

								if (dirM5 != 0 && dirPermitida)
								{
									int tpTicksM5 = 0;
									int slTicksM5 = 0;
									int p1TicksM5 = 0;
									int p2TicksM5 = 0;
									bool usarParcialM5 = false;
									bool isEsM5   = IsEsAsset();

									switch (PB_M5_ModoGestao)
									{
										case PlaybookM5Mode.Auto_Recomendado_Parcial:
											usarParcialM5 = true;
											if (isEsM5) { slTicksM5 = 11 * 4; p1TicksM5 = 5 * 4; p2TicksM5 = 14 * 4; } // 83.6% Win!
											else        { slTicksM5 = 60 * 4; p1TicksM5 = 30 * 4; p2TicksM5 = 75 * 4; } // 81.1% Win!
											break;

										case PlaybookM5Mode.Auto_Scalp_Seco:
											usarParcialM5 = false;
											if (isEsM5) { slTicksM5 = 10 * 4; tpTicksM5 = 8 * 4; } // 67.2% Win!
											else        { slTicksM5 = 35 * 4; tpTicksM5 = 35 * 4; } // 63.9% Win!
											break;

										case PlaybookM5Mode.Auto_Alvo_Cheio:
											usarParcialM5 = false;
											if (isEsM5) { slTicksM5 = 14 * 4; tpTicksM5 = 20 * 4; }
											else        { slTicksM5 = 75 * 4; tpTicksM5 = 110 * 4; }
											break;

										case PlaybookM5Mode.Customizado_Pontos:
											usarParcialM5 = false;
											double tpPts = PB_M5_TpPontos;
											double slPts = PB_M5_SlPontos;
											if (isEsM5 && (tpPts > 35.0 || slPts > 25.0)) { tpPts = 12.0; slPts = 10.0; }
											tpTicksM5 = tpPts > 0 ? (int)Math.Round(tpPts / TickSize) : 0;
											slTicksM5 = slPts > 0 ? (int)Math.Round(slPts / TickSize) : (isEsM5 ? 40 : SL_Ticks);
											break;

										case PlaybookM5Mode.Customizado_Ticks:
											usarParcialM5 = false;
											tpTicksM5 = PB_M5_TpTicks;
											slTicksM5 = PB_M5_SlTicks;
											break;

										default:
											usarParcialM5 = true;
											if (isEsM5) { slTicksM5 = 11 * 4; p1TicksM5 = 5 * 4; p2TicksM5 = 14 * 4; }
											else        { slTicksM5 = 60 * 4; p1TicksM5 = 30 * 4; p2TicksM5 = 75 * 4; }
											break;
									}

									DateTime exitM5 = today + m5Time + TimeSpan.FromMinutes(PB_M5_DuracaoMaxMinutos);
									if (usarParcialM5)
										ExecutarOrdemPlaybookParcial(dirM5, "PB_M5", slTicksM5, p1TicksM5, p2TicksM5, exitM5);
									else
										ExecutarOrdemPlaybookSimples(dirM5, "PB_M5", slTicksM5, tpTicksM5, exitM5);

									_pbM5TriggeredToday = true;
									DebugPrint($"[PLAYBOOK {(isEsM5 ? "ES" : "NQ")}] 🚀 [ETAPA 2 - M5] {(dirM5 == 1 ? "COMPRA" : "VENDA")} confirmada em T+5m! " +
										$"Força={snapM5.ForcaFinalCompra:F1}% | 7Techs={snapM5.ForcaTechMediaCompra:F1}% | Parcial={usarParcialM5}");
									return;
								}
								else
								{
									DebugPrint($"[PLAYBOOK NQ] ⏸️ [ETAPA 2 - M5] Sem confirmação em T+5m (Força={snapM5.ForcaFinalCompra:F1}%, Techs={snapM5.ForcaTechMediaCompra:F1}%).");
								}
							}
						}
					}

					// =================================================================
"""
        c = c[:idx_m5_s] + new_m5_code + c[idx_m5_e:]
        print("  -> Bloco M5 cirurgicamente atualizado.", flush=True)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(c)
    print(f"Sucesso: {filepath}", flush=True)

apply_patches("experts/VMPlaybookNasdaq.cs")
apply_patches("experts/VMBotF.cs")

nt_path = r"C:\Users\Pichau\Documents\NinjaTrader 8\bin\Custom\Strategies\VMPlaybookNasdaq.cs"
if os.path.exists(nt_path):
    apply_patches(nt_path)
