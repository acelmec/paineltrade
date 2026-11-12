"""
Aplica a logica completa de execucao com parciais, gestao geometrica e seletor de vies noturno.
"""
import os, re, sys

def patch_strategy(filepath):
    print(f"Atualizando lógica operacional em {filepath}...", flush=True)
    with open(filepath, 'r', encoding='utf-8') as f:
        code = f.read()

    # 1. Modificar ExecutarOrdemPlaybookSimples para suportar Parcial ou adicionar ExecutarOrdemPlaybookParcial
    parcial_method = """				private void ExecutarOrdemPlaybookParcial(int direction, string signalName, int slTicks, int p1Ticks, int p2Ticks, DateTime maxExitTime)
				{
					int totalLots = Math.Max(1, LOTE_Size);
					breakEvenTriggered = false;
					trailStopPrice = 0.0;
					trailStepCount = 0;
					_pbActiveTradeMaxExitTime = maxExitTime;

					if (totalLots >= 2)
					{
						int lotsP1 = totalLots / 2;
						int lotsP2 = totalLots - lotsP1;

						SetStopLoss(signalName + "_P1", CalculationMode.Ticks, slTicks, false);
						SetProfitTarget(signalName + "_P1", CalculationMode.Ticks, p1Ticks, false);
						SetStopLoss(CalculationMode.Ticks, slTicks);

						SetStopLoss(signalName + "_P2", CalculationMode.Ticks, slTicks, false);
						SetProfitTarget(signalName + "_P2", CalculationMode.Ticks, p2Ticks, false);

						Order o1 = direction == 1 ? EnterLong(lotsP1, signalName + "_P1") : EnterShort(lotsP1, signalName + "_P1");
						Order o2 = direction == 1 ? EnterLong(lotsP2, signalName + "_P2") : EnterShort(lotsP2, signalName + "_P2");

						if (o1 != null) { AddOrderToList(o1); realtimeOrderIds.Add(o1.Id); }
						if (o2 != null) { AddOrderToList(o2); realtimeOrderIds.Add(o2.Id); }

						_pbOr15BreakevenArmed = true;
						_pbOr15BreakevenTriggered = false;
						_pbOr15BreakevenTriggerPrice = direction == 1 ? Close[0] + (p1Ticks * TickSize) : Close[0] - (p1Ticks * TickSize);
						_pbOr15Direction = direction;

						IncrementarQuantOperacoes();
						DebugPrint($"[PLAYBOOK {(IsEsAsset() ? "ES" : "NQ")}] 🎯 PARCIAL DISPARADA ({signalName}) | Qtd={totalLots} (P1:{lotsP1} / P2:{lotsP2}) | SL={slTicks}tk ({slTicks * TickSize:F2}pts) | P1={p1Ticks}tk ({p1Ticks * TickSize:F2}pts) | P2={p2Ticks}tk ({p2Ticks * TickSize:F2}pts) | Saída: {maxExitTime:HH:mm:ss}");
					}
					else
					{
						// Se 1 contrato apenas: usa alvo P1 como gatilho de breakeven e busca alvo final P2
						SetStopLoss(signalName, CalculationMode.Ticks, slTicks, false);
						SetProfitTarget(signalName, CalculationMode.Ticks, p2Ticks, false);
						SetStopLoss(CalculationMode.Ticks, slTicks);
						SetProfitTarget(CalculationMode.Ticks, p2Ticks);

						Order o = direction == 1 ? EnterLong(totalLots, signalName) : EnterShort(totalLots, signalName);
						if (o != null)
						{
							AddOrderToList(o);
							realtimeOrderIds.Add(o.Id);
							IncrementarQuantOperacoes();
							_pbOr15BreakevenArmed = true;
							_pbOr15BreakevenTriggered = false;
							_pbOr15BreakevenTriggerPrice = direction == 1 ? Close[0] + (p1Ticks * TickSize) : Close[0] - (p1Ticks * TickSize);
							_pbOr15Direction = direction;
							DebugPrint($"[PLAYBOOK {(IsEsAsset() ? "ES" : "NQ")}] 🎯 1 LOTE DISPARADO ({signalName}) | SL={slTicks}tk | Alvo={p2Ticks}tk | BE armado em {p1Ticks}tk | Saída: {maxExitTime:HH:mm:ss}");
						}
					}
				}
"""

    if "private void ExecutarOrdemPlaybookParcial" not in code:
        code = code.replace("private void ExecutarOrdemPlaybookSimples", parcial_method + "\n\t\t\t\tprivate void ExecutarOrdemPlaybookSimples")
        print("  -> ExecutarOrdemPlaybookParcial adicionada.", flush=True)

    # 2. Atualizar Bloco de Decisão do T0
    old_t0_block = re.compile(
        r'// ── CRONOLOGIA 1 — ENTRADA NO 1º SEGUNDO DA ABERTURA \(T0\).+?// =================================================================\s*// CRONOLOGIA 2',
        re.DOTALL
    )

    new_t0_block = """// ── CRONOLOGIA 1 — ENTRADA NO 1º SEGUNDO DA ABERTURA (T0) ──
					if (PB_OperarAberturaT0 && !_pbT0TriggeredToday && ctBar >= nyOpen && ctBar < (nyOpen + TimeSpan.FromMinutes(2)))
					{
						bool isEsT0 = IsEsAsset();

						// Avalia Viés Conforme Seletor
						bool useAsiaLondres = (PB_T0_ViesSessao == PlaybookT0ViesMode.Modo5_Asia_e_Londres) 
						                   || (PB_T0_ViesSessao == PlaybookT0ViesMode.Auto_Recomendado && !isEsT0); // NQ usa Ásia + Londres (+722 pts)

						double fRef1 = _pbForcaAsia;
						double fRef2 = useAsiaLondres ? (_pbForcaLondres >= 0 ? _pbForcaLondres : _pbForcaT15m) : _pbForcaT15m;

						int dirT0 = 0;
						if (fRef1 >= PB_T0_ForcaMinCompra && fRef2 >= PB_T0_ForcaMinCompra)
							dirT0 = 1;  // COMPRA T0
						else if (fRef1 <= PB_T0_ForcaMaxVenda && fRef2 <= PB_T0_ForcaMaxVenda && fRef1 >= 0 && fRef2 >= 0)
							dirT0 = -1; // VENDA T0

						bool dirPermitida = (dirT0 == 1 && (currentOperatingMode == OperatingMode.Comprado || currentOperatingMode == OperatingMode.Ambos))
						                 || (dirT0 == -1 && (currentOperatingMode == OperatingMode.Vendido || currentOperatingMode == OperatingMode.Ambos));

						if (dirT0 != 0 && dirPermitida)
						{
							int slTicksT0 = 0;
							int tpTicksT0 = 0;
							int p1TicksT0 = 0;
							int p2TicksT0 = 0;
							bool usarParcialT0 = false;
							int maxMinT0 = 60;

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
									slTicksT0 = PB_T0_CustomSlTicks;
									tpTicksT0 = PB_T0_CustomTpTicks;
									maxMinT0  = PB_T0_CustomMaxMinutos;
									break;

								default:
									usarParcialT0 = true;
									if (isEsT0) { slTicksT0 = 7 * 4; p1TicksT0 = 4 * 4; p2TicksT0 = 8 * 4; maxMinT0 = 30; }
									else        { slTicksT0 = 85 * 4; p1TicksT0 = 45 * 4; p2TicksT0 = 130 * 4; maxMinT0 = 60; }
									break;
							}

							DateTime exitTimeT0 = today + nyOpen + TimeSpan.FromMinutes(maxMinT0);
							if (usarParcialT0)
								ExecutarOrdemPlaybookParcial(dirT0, "PB_T0", slTicksT0, p1TicksT0, p2TicksT0, exitTimeT0);
							else
								ExecutarOrdemPlaybookSimples(dirT0, "PB_T0", slTicksT0, tpTicksT0, exitTimeT0);

							_pbT0TriggeredToday = true;
							DebugPrint($"[PLAYBOOK NQ] 🚀 [ETAPA 1 - T0] {(dirT0 == 1 ? "COMPRA" : "VENDA")} executada na abertura! " +
								$"Ref1={fRef1:F1}% | Ref2={fRef2:F1}% | Parcial={usarParcialT0} | SL={slTicksT0}tk");
							return;
						}
					}

					// =================================================================
					// CRONOLOGIA 2"""

    if old_t0_block.search(code):
        code = old_t0_block.sub(new_t0_block, code)
        print("  -> Bloco de decisão T0 atualizado com sucesso.", flush=True)

    # 3. Atualizar Bloco de Decisão do M5 (T+5m)
    old_m5_block = re.compile(
        r'// ── 2\. M5 CONFIRMAÇÃO \(T\+5m\).+?ExecutarOrdemPlaybookSimples\(dirM5, "PB_M5", slTicksM5, tpTicksM5, exitM5\);',
        re.DOTALL
    )

    new_m5_block = """// ── 2. M5 CONFIRMAÇÃO (T+5m) ──
								int slTicksM5 = 0;
								int tpTicksM5 = 0;
								int p1TicksM5 = 0;
								int p2TicksM5 = 0;
								bool usarParcialM5 = false;
								int maxMinM5 = PB_M5_DuracaoMaxMinutos;
								bool isEsM5 = IsEsAsset();

								switch (PB_M5_ModoGestao)
								{
									case PlaybookM5Mode.Auto_Recomendado_Parcial:
										usarParcialM5 = true;
										if (isEsM5) { slTicksM5 = 11 * 4; p1TicksM5 = 5 * 4; p2TicksM5 = 14 * 4; } // Win: 83.6%!
										else        { slTicksM5 = 60 * 4; p1TicksM5 = 30 * 4; p2TicksM5 = 75 * 4; } // Win: 81.1%!
										break;

									case PlaybookM5Mode.Auto_Scalp_Seco:
										usarParcialM5 = false;
										if (isEsM5) { slTicksM5 = 10 * 4; tpTicksM5 = 8 * 4; } // Win: 67.2%
										else        { slTicksM5 = 35 * 4; tpTicksM5 = 35 * 4; } // Win: 63.9%
										break;

									case PlaybookM5Mode.Auto_Alvo_Cheio:
										usarParcialM5 = false;
										if (isEsM5) { slTicksM5 = 14 * 4; tpTicksM5 = 20 * 4; }
										else        { slTicksM5 = 75 * 4; tpTicksM5 = 110 * 4; }
										break;

									case PlaybookM5Mode.Customizado_Pontos:
										usarParcialM5 = false;
										slTicksM5 = (int)Math.Round(PB_M5_SlPontos / TickSize);
										tpTicksM5 = (int)Math.Round(PB_M5_TpPontos / TickSize);
										break;

									case PlaybookM5Mode.Customizado_Ticks:
										usarParcialM5 = false;
										slTicksM5 = PB_M5_SlTicks;
										tpTicksM5 = PB_M5_TpTicks;
										break;

									default:
										usarParcialM5 = true;
										if (isEsM5) { slTicksM5 = 11 * 4; p1TicksM5 = 5 * 4; p2TicksM5 = 14 * 4; }
										else        { slTicksM5 = 60 * 4; p1TicksM5 = 30 * 4; p2TicksM5 = 75 * 4; }
										break;
								}

								DateTime exitM5 = today + m5Time + TimeSpan.FromMinutes(maxMinM5);
								if (usarParcialM5)
									ExecutarOrdemPlaybookParcial(dirM5, "PB_M5", slTicksM5, p1TicksM5, p2TicksM5, exitM5);
								else
									ExecutarOrdemPlaybookSimples(dirM5, "PB_M5", slTicksM5, tpTicksM5, exitM5);"""

    if old_m5_block.search(code):
        code = old_m5_block.sub(new_m5_block, code)
        print("  -> Bloco de decisão M5 atualizado com suporte a Parcial (Win 81-84%).", flush=True)

    # 4. Atualizar ExecutarOrdemOR15 para incluir níveis de 35% e Auto_Recomendado
    old_switch_or15 = re.compile(
        r'switch \(PB_OR15_ModoGestao\)\s*\{.+?default:\s*break;\s*\}',
        re.DOTALL
    )

    new_switch_or15 = """int ticks35 = Math.Min(maxCap50, Math.Max(minFloor25, (int)Math.Round((_pbOr15RangePts * 0.35) / TickSize))); // 35% da OR

					switch (PB_OR15_ModoGestao)
					{
						case PlaybookOR15GestaoMode.Auto_Recomendado:
							usarParcial   = true;
							if (baseSignal.Contains("Fade"))
							{
								// Fade no NQ e ES usa 35% e 50%
								slTicks       = isEsOR ? ticks25 : ticks35;
								ticks25       = ticks35; // P1 na retração de 35%
								tpSingleTicks = ticks50; // P2 no centro 50% (OR_Mid)
							}
							else
							{
								// Breakout usa expansão de +35% e +50%
								slTicks       = isEsOR ? ticks25 : ticks50;
								ticks25       = ticks35;
								tpSingleTicks = ticks50;
							}
							break;

						case PlaybookOR15GestaoMode.Parcial35_BE_Final50_Stop35:
							usarParcial   = true;
							slTicks       = ticks35;
							ticks25       = ticks35;
							tpSingleTicks = ticks50;
							break;

						case PlaybookOR15GestaoMode.Parcial35_BE_Final50_Stop25:
							usarParcial   = true;
							slTicks       = ticks25;
							ticks25       = ticks35;
							tpSingleTicks = ticks50;
							break;

						case PlaybookOR15GestaoMode.Parcial25_BE_Final50_Stop25:
							usarParcial   = true;
							slTicks       = ticks25;
							tpSingleTicks = ticks50;
							break;

						case PlaybookOR15GestaoMode.Parcial25_BE_Final50_Stop50:
							usarParcial   = true;
							slTicks       = ticks50;
							tpSingleTicks = ticks50;
							break;

						case PlaybookOR15GestaoMode.Alvo35_Stop35_1para1:
							usarParcial   = false;
							slTicks       = ticks35;
							tpSingleTicks = ticks35;
							break;

						case PlaybookOR15GestaoMode.Alvo35_Stop25:
							usarParcial   = false;
							slTicks       = ticks25;
							tpSingleTicks = ticks35;
							break;

						case PlaybookOR15GestaoMode.Alvo25_Stop25_1para1:
							usarParcial   = false;
							slTicks       = ticks25;
							tpSingleTicks = ticks25;
							break;

						case PlaybookOR15GestaoMode.Alvo50_Stop25_2para1:
							usarParcial   = false;
							slTicks       = ticks25;
							tpSingleTicks = ticks50;
							break;

						case PlaybookOR15GestaoMode.Alvo50_Stop50_1para1:
							usarParcial   = false;
							slTicks       = ticks50;
							tpSingleTicks = ticks50;
							break;
					}"""

    if "int ticks35" not in code and "switch (PB_OR15_ModoGestao)" in code:
        # Substitui a declaração ticks25 e o switch
        code = re.sub(
            r'int ticks25 = Math\.Min\(maxCap25, Math\.Max\(minFloor25, \(int\)Math\.Round\(_pbOr15Q25Pts / TickSize\)\)\);\s*int ticks50 = Math\.Min\(maxCap50, Math\.Max\(minFloor50, \(int\)Math\.Round\(\(_pbOr15RangePts \* 0\.50\) / TickSize\)\)\);\s*int slTicks = ticks25;\s*int tpSingleTicks = ticks50;\s*bool usarParcial = false;\s*switch \(PB_OR15_ModoGestao\)\s*\{.+?\}',
            r"""int ticks25 = Math.Min(maxCap25, Math.Max(minFloor25, (int)Math.Round(_pbOr15Q25Pts / TickSize)));
					int ticks50 = Math.Min(maxCap50, Math.Max(minFloor50, (int)Math.Round((_pbOr15RangePts * 0.50) / TickSize)));
					int slTicks = ticks25;
					int tpSingleTicks = ticks50;
					bool usarParcial = false;

					""" + new_switch_or15,
            code,
            flags=re.DOTALL
        )
        print("  -> Switch OR15 atualizado com nível de 35% e Auto_Recomendado.", flush=True)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(code)
    print(f"Salvo {filepath}.", flush=True)

patch_strategy("experts/VMPlaybookNasdaq.cs")
patch_strategy("experts/VMBotF.cs")

nt_path = r"C:\Users\Pichau\Documents\NinjaTrader 8\bin\Custom\Strategies\VMPlaybookNasdaq.cs"
if os.path.exists(nt_path):
    patch_strategy(nt_path)
