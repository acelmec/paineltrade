import re

def patch_telemetry(filepath):
    print(f"Patching telemetry in {filepath}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        c = f.read()

    # 1. Adicionar método UpdatePlaybookStatusTelemetry
    telemetry_method = """				private void UpdatePlaybookStatusTelemetry()
				{
					DateTime nowBrt = DateTime.UtcNow.AddHours(-3);
					var (nyOpen, asiaOpen) = GetPlaybookSessionTimes(nowBrt);
					TimeSpan ctNow = nowBrt.TimeOfDay;
					TimeSpan or15End = nyOpen + TimeSpan.FromMinutes(15);
					TimeSpan t15Horario = nyOpen - TimeSpan.FromMinutes(15);

					NasdaqForceSnapshot liveSnap = AxionNasdaqForceCache.LatestRealtime.IsValid 
						? AxionNasdaqForceCache.LatestRealtime 
						: AxionNasdaqForceCache.GetAtOrBefore(nowBrt, 15, true);

					string nomeAtivoPerfil = IsEsAsset() ? "S&P 500 (ES/MES)" : "NASDAQ (NQ/MNQ)";
					string faseStr = ctNow < nyOpen ? "PRÉ-ABERTURA" : (ctNow < or15End ? "FORMANDO OR15" : "OPERANDO OR15");

					// 1. Ásia
					string asiaStr;
					if (_pbForcaAsia >= 0)
					{
						string bias = _pbForcaAsia >= 52.0 ? "Compradora" : (_pbForcaAsia <= 48.0 ? "Vendedora" : "Neutra");
						asiaStr = $"{_pbForcaAsia:F1}% ({bias})";
					}
					else
					{
						asiaStr = "Consultando...";
					}

					// 2. Pré-Mercado T-15m
					string t15Str;
					if (_pbForcaT15m >= 0)
					{
						string bias = _pbForcaT15m >= 52.0 ? "Compradora" : (_pbForcaT15m <= 48.0 ? "Vendedora" : "Neutra");
						t15Str = $"{_pbForcaT15m:F1}% ({bias})";
					}
					else
					{
						t15Str = ctNow < t15Horario ? $"Aguardando {t15Horario:hh\\\\:mm} BRT" : "Capturando...";
					}

					// 3. Status T0
					string statusT0;
					if (_pbForcaAsia >= 52.0 && _pbForcaT15m >= 52.0)
						statusT0 = "🟢 ALINHADO COMPRA (Disparará em T0)";
					else if (_pbForcaAsia <= 48.0 && _pbForcaT15m <= 48.0 && _pbForcaAsia >= 0 && _pbForcaT15m >= 0)
						statusT0 = "🔴 ALINHADO VENDA (Disparará em T0)";
					else if (_pbForcaAsia >= 0 && _pbForcaT15m >= 0)
						statusT0 = "🟡 DIVERGENTE (Aguardará M5 / OR15)";
					else
						statusT0 = "⚪ Monitorando Sessões";

					_pStatus = $"[PLAYBOOK] {nomeAtivoPerfil} • {faseStr} (Abertura {nyOpen:hh\\\\:mm} BRT)\\n" +
					           $"• Força Sessão Ásia:       {asiaStr}\\n" +
					           $"• Força Pré-Mercado (T-15m): {t15Str}\\n" +
					           $"• Força Atual (Live):       {liveSnap.ForcaFinalCompra:F1}% (7 Techs: {liveSnap.ForcaTechMediaCompra:F1}%)\\n" +
					           $"• Status Abertura T0:        {statusT0}" +
					           (_pbOr15Consolidated ? $"\\n• OR15: Range {_pbOr15RangePts:F1} pts | 50%={_pbOr15Mid:F1} | 25%={_pbOr15Q25Pts:F1}" : "");

					_pStatusBrush = liveSnap.ForcaFinalCompra >= 52.0 ? Brushes.Lime : (liveSnap.ForcaFinalCompra <= 48.0 ? Brushes.Red : Brushes.Yellow);
				}

				private void DrawPlaybookOR15Levels()"""

    c = c.replace("				private void DrawPlaybookOR15Levels()", telemetry_method)

    # 2. Atualizar InitializePlaybookNasdaq para fazer polling contínuo e disparar atualização de status em tempo real
    old_init = re.compile(
        r'private void InitializePlaybookNasdaq\(\)\s*\{.+?private void StopPlaybookNasdaqPolling\(\)',
        re.DOTALL
    )

    new_init = """private void InitializePlaybookNasdaq()
				{
					// Dispara carregamento assíncrono em background (Zero travamento de thread)
					AxionNasdaqForceCache.EnsureLocalCsvLoadedAsync(DebugPrint);
					if (!_pbPollingActive)
					{
						_pbPollingActive = true;
						_pbPollTask = Task.Run(async () =>
						{
							while (_pbPollingActive && State != State.Terminated && State != State.Finalized)
							{
								try
								{
									// 1. Polling contínuo de tempo real diretamente da tabela nasdaq_force
									await AxionNasdaqForceCache.PollLatestFromSupabaseAsync(supabaseUrl, supabaseServiceKey, PB_InstanceId, DebugPrint);

									DateTime curBrt = DateTime.UtcNow.AddHours(-3);
									var (nyOpenNow, asiaOpenNow) = GetPlaybookSessionTimes(curBrt);

									// 2. Se a força da Ásia ainda não foi capturada, busca no Supabase
									if (_pbForcaAsia < 0)
									{
										DateTime asiaDt = GetPreviousTradingEvening(curBrt, asiaOpenNow);
										NasdaqForceSnapshot snapAsia = AxionNasdaqForceCache.RequestSpecificMinuteAsync(supabaseUrl, supabaseServiceKey, PB_InstanceId, asiaDt, 30, DebugPrint);
										if (snapAsia.IsValid)
										{
											_pbForcaAsia = snapAsia.ForcaFinalCompra;
											DebugPrint($"[PLAYBOOK NQ] 🌏 Força Ásia ({asiaDt:dd/MM HH:mm}) carregada em RAM: {_pbForcaAsia:F1}%");
										}
									}

									// 3. Se já passamos de T-15m e ainda não temos T-15m capturada
									TimeSpan t15Now = nyOpenNow - TimeSpan.FromMinutes(15);
									if (_pbForcaT15m < 0 && curBrt.TimeOfDay >= t15Now)
									{
										DateTime t15Dt = curBrt.Date + t15Now;
										NasdaqForceSnapshot snapT15 = AxionNasdaqForceCache.RequestSpecificMinuteAsync(supabaseUrl, supabaseServiceKey, PB_InstanceId, t15Dt, 15, DebugPrint);
										if (snapT15.IsValid)
										{
											_pbForcaT15m = snapT15.ForcaFinalCompra;
											DebugPrint($"[PLAYBOOK NQ] ⏰ Força Pré-Mercado T-15m ({t15Dt:dd/MM HH:mm}) carregada em RAM: {_pbForcaT15m:F1}%");
										}
									}

									// 4. Atualiza a telemetria do painel mesmo sem novos ticks
									UpdatePlaybookStatusTelemetry();
									ChartControl?.Dispatcher.InvokeAsync(() =>
									{
										try
										{
											if (_tbStatus != null)
											{
												_tbStatus.Text = _pStatus;
												_tbStatus.Foreground = _pStatusBrush;
											}
										}
										catch {}
									});

									await Task.Delay(3000);
								}
								catch
								{
									await Task.Delay(4000);
								}
							}
						});
					}
					DebugPrint("[PLAYBOOK NQ] ✅ Estratégia Playbook Nasdaq Force inicializada.");
				}

				private void StopPlaybookNasdaqPolling()"""

    if old_init.search(c):
        c = old_init.sub(new_init, c)
        print("  -> InitializePlaybookNasdaq successfully upgraded.")
    else:
        print("  -> WARNING: old_init not found!")

    # 3. Atualizar ProcessPlaybookNasdaq para chamar UpdatePlaybookStatusTelemetry()
    old_pstatus_assign = re.compile(
        r'// Atualiza painel de status com telemetria ao vivo do Playbook.+?_pStatusBrush\s*=\s*Brushes\.Lime;',
        re.DOTALL
    )
    new_pstatus_call = """// Atualiza painel de status com telemetria ao vivo do Playbook
					UpdatePlaybookStatusTelemetry();"""

    if old_pstatus_assign.search(c):
        c = old_pstatus_assign.sub(new_pstatus_call, c)
        print("  -> ProcessPlaybookNasdaq status update successfully replaced.")
    else:
        print("  -> WARNING: old_pstatus_assign not found!")

    # 4. Proteger UpdateUI() para não sobreescrever _pStatus no modo Playbook
    old_update_ui_start = "				    // ── Atualização de textos e cores ───────────────────────────"
    new_update_ui_start = """				    if (currentEstrategia == estrategiaMode.PlaybookNasdaq)
				    {
				        UpdatePlaybookStatusTelemetry();
				        _lastUIUpdate = DateTime.Now;
				        ChartControl?.Dispatcher.InvokeAsync(() =>
				        {
				            try
				            {
				                if (_tbStatus != null)
				                {
				                    _tbStatus.Text = _pStatus;
				                    _tbStatus.Foreground = _pStatusBrush;
				                }
				            }
				            catch {}
				        });
				        return;
				    }

				    // ── Atualização de textos e cores ───────────────────────────"""

    if old_update_ui_start in c:
        c = c.replace(old_update_ui_start, new_update_ui_start)
        print("  -> UpdateUI guard successfully installed.")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(c)
    print(f"  -> File {filepath} saved successfully!")

patch_telemetry('experts/VMPlaybookNasdaq.cs')
patch_telemetry('experts/VMBotF.cs')
