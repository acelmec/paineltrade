import re

def patch_file(filepath):
    print(f"Patching {filepath}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        c = f.read()

    # 1. Substituir a classe AxionNasdaqForceCache por uma versão 100% assíncrona e não-bloqueante
    old_cache_pattern = re.compile(
        r'public static class AxionNasdaqForceCache\s*\{.+?private static int ParseAndStoreJsonRows\(string json, bool updateLatest\)',
        re.DOTALL
    )

    new_cache_code = """public static class AxionNasdaqForceCache
				{
					private static readonly object _cacheLock = new object();
					private static readonly Dictionary<DateTime, NasdaqForceSnapshot> _byMinute = new Dictionary<DateTime, NasdaqForceSnapshot>();
					private static readonly HashSet<DateTime> _fetchedDays = new HashSet<DateTime>();
					private static volatile bool _localCsvLoaded = false;
					private static volatile bool _csvLoadingInProgress = false;
					public static NasdaqForceSnapshot LatestRealtime = new NasdaqForceSnapshot();
					public static DateTime LastRealtimeFetchUtc = DateTime.MinValue;

					public static void EnsureLocalCsvLoadedAsync(Action<string> debugPrint)
					{
						if (_localCsvLoaded || _csvLoadingInProgress) return;
						_csvLoadingInProgress = true;

						Task.Run(() =>
						{
							try
							{
								string[] candidatePaths = new string[]
								{
									@"C:\\Users\\Pichau\\Projetos React\\VortexWeb\\data\\databento\\nasdaq_force_365d_BRT.csv",
									@"C:\\Users\\Pichau\\Projetos React\\VortexWeb\\data\\databento\\janela_0608_1011\\nasdaq_force_0608_1011_BRT.csv",
									@"C:\\NinjaPanel\\nasdaq_force_365d_BRT.csv"
								};
								foreach (string path in candidatePaths)
								{
									if (!File.Exists(path)) continue;
									using (StreamReader sr = new StreamReader(path))
									{
										string headerLine = sr.ReadLine();
										if (string.IsNullOrEmpty(headerLine)) continue;
										string[] headers = headerLine.Split(',');
										int idxTs = Array.IndexOf(headers, "timestamp");
										int idxFF = Array.IndexOf(headers, "forca_final_compra");
										int idxNQ = Array.IndexOf(headers, "nasdaq_compra");
										int idxES = Array.IndexOf(headers, "sp500_compra");
										int idxVX = Array.IndexOf(headers, "vix_compra");
										int idxDX = Array.IndexOf(headers, "usdindex_compra");
										int idxNVDA = Array.IndexOf(headers, "nvidia_compra");
										int idxMSFT = Array.IndexOf(headers, "microsoft_compra");
										int idxAAPL = Array.IndexOf(headers, "apple_compra");
										int idxMETA = Array.IndexOf(headers, "meta_compra");
										int idxAMZN = Array.IndexOf(headers, "amazon_compra");
										int idxGOOG = Array.IndexOf(headers, "alphabet_compra");
										int idxTSLA = Array.IndexOf(headers, "tesla_compra");

										int loaded = 0;
										string line;
										while ((line = sr.ReadLine()) != null)
										{
											string[] cols = line.Split(',');
											if (cols.Length <= idxFF || idxTs < 0 || idxFF < 0) continue;
											if (!DateTimeOffset.TryParse(cols[idxTs], System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out DateTimeOffset dto))
												continue;
											DateTime keyMin = new DateTime(dto.Year, dto.Month, dto.Day, dto.Hour, dto.Minute, 0);
											double ff = ParseDoubleFast(cols, idxFF, 50.0);
											double nq = ParseDoubleFast(cols, idxNQ, 50.0);
											double es = ParseDoubleFast(cols, idxES, 50.0);
											double vx = ParseDoubleFast(cols, idxVX, 50.0);
											double dx = ParseDoubleFast(cols, idxDX, 50.0);
											double t1 = ParseDoubleFast(cols, idxNVDA, 50.0);
											double t2 = ParseDoubleFast(cols, idxMSFT, 50.0);
											double t3 = ParseDoubleFast(cols, idxAAPL, 50.0);
											double t4 = ParseDoubleFast(cols, idxMETA, 50.0);
											double t5 = ParseDoubleFast(cols, idxAMZN, 50.0);
											double t6 = ParseDoubleFast(cols, idxGOOG, 50.0);
											double t7 = ParseDoubleFast(cols, idxTSLA, 50.0);

											lock (_cacheLock)
											{
												_byMinute[keyMin] = new NasdaqForceSnapshot
												{
													TimestampBRT = keyMin,
													ForcaFinalCompra = ff,
													ForcaFinalVenda = 100.0 - ff,
													ForcaNQCompra = nq,
													ForcaSP500Compra = es,
													ForcaVixCompra = vx,
													ForcaDxyCompra = dx,
													ForcaTechMediaCompra = (t1 + t2 + t3 + t4 + t5 + t6 + t7) / 7.0,
													IsValid = true
												};
												_fetchedDays.Add(keyMin.Date);
											}
											loaded++;
										}
										debugPrint?.Invoke($"[PLAYBOOK] ✅ Cache histórico carregado em background ({loaded} minutos de {Path.GetFileName(path)}).");
										break;
									}
								}
							}
							catch (Exception ex)
							{
								debugPrint?.Invoke($"[PLAYBOOK] ⚠️ Aviso ao ler CSV em background: {ex.Message}");
							}
							finally
							{
								_localCsvLoaded = true;
								_csvLoadingInProgress = false;
							}
						});
					}

					private static double ParseDoubleFast(string[] cols, int idx, double fallback)
					{
						if (idx < 0 || idx >= cols.Length) return fallback;
						if (double.TryParse(cols[idx].Trim(), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double v))
							return v;
						return fallback;
					}

					public static NasdaqForceSnapshot RequestSpecificMinuteAsync(string url, string key, string instanceId, DateTime targetBrt, int lookbackMinutes, Action<string> debugPrint)
					{
						NasdaqForceSnapshot cached = GetAtOrBefore(targetBrt, lookbackMinutes, false);
						if (cached.IsValid) return cached;

						Task.Run(async () =>
						{
							try
							{
								string cleanInst = string.IsNullOrWhiteSpace(instanceId) ? "painel_principal_web" : instanceId.Trim();
								DateTime startBrt = targetBrt.AddMinutes(-Math.Max(lookbackMinutes, 15));
								DateTime endBrt   = targetBrt.AddMinutes(2);
								string sIso = startBrt.ToString("yyyy-MM-ddTHH:mm:ss") + "-03:00";
								string eIso = endBrt.ToString("yyyy-MM-ddTHH:mm:ss") + "-03:00";

								string queryUrl = $"{url.TrimEnd('/')}/rest/v1/nasdaq_force?" +
									$"instance_id=eq.{Uri.EscapeDataString(cleanInst)}&" +
									$"timestamp=gte.{Uri.EscapeDataString(sIso)}&" +
									$"timestamp=lte.{Uri.EscapeDataString(eIso)}&" +
									$"order=timestamp.desc&limit=10";

								HttpWebRequest req = (HttpWebRequest)WebRequest.Create(queryUrl);
								req.Method = "GET";
								req.Timeout = 3000;
								req.ReadWriteTimeout = 3000;
								req.Headers.Add("apikey", key);
								req.Headers.Add("Authorization", $"Bearer {key}");
								req.ContentType = "application/json";

								using (HttpWebResponse resp = (HttpWebResponse)await req.GetResponseAsync())
								using (StreamReader reader = new StreamReader(resp.GetResponseStream()))
								{
									string json = await reader.ReadToEndAsync();
									ParseAndStoreJsonRows(json, false);
								}
							}
							catch (Exception ex)
							{
								debugPrint?.Invoke($"[PLAYBOOK] ⚠️ Busca pontual background ({targetBrt:dd/MM HH:mm}): {ex.Message}");
							}
						});

						return cached;
					}

					public static void RequestDayFetchAsync(string url, string key, string instanceId, DateTime dateBrt, Action<string> debugPrint)
					{
						DateTime dKey = dateBrt.Date;
						lock (_cacheLock)
						{
							if (_fetchedDays.Contains(dKey)) return;
							_fetchedDays.Add(dKey);
						}

						Task.Run(async () =>
						{
							try
							{
								string cleanInst = string.IsNullOrWhiteSpace(instanceId) ? "painel_principal_web" : instanceId.Trim();
								DateTime startBrt = dKey.AddDays(-1).AddHours(18);
								DateTime endBrt   = dKey.AddHours(20);
								string sIso = startBrt.ToString("yyyy-MM-ddTHH:mm:ss") + "-03:00";
								string eIso = endBrt.ToString("yyyy-MM-ddTHH:mm:ss") + "-03:00";

								string queryUrl = $"{url.TrimEnd('/')}/rest/v1/nasdaq_force?" +
									$"instance_id=eq.{Uri.EscapeDataString(cleanInst)}&" +
									$"timestamp=gte.{Uri.EscapeDataString(sIso)}&" +
									$"timestamp=lte.{Uri.EscapeDataString(eIso)}&" +
									$"order=timestamp.asc&limit=1000";

								HttpWebRequest req = (HttpWebRequest)WebRequest.Create(queryUrl);
								req.Method = "GET";
								req.Timeout = 4000;
								req.ReadWriteTimeout = 4000;
								req.Headers.Add("apikey", key);
								req.Headers.Add("Authorization", $"Bearer {key}");
								req.ContentType = "application/json";

								using (HttpWebResponse resp = (HttpWebResponse)await req.GetResponseAsync())
								using (StreamReader reader = new StreamReader(resp.GetResponseStream()))
								{
									string json = await reader.ReadToEndAsync();
									int count = ParseAndStoreJsonRows(json, false);
									debugPrint?.Invoke($"[PLAYBOOK] 🌐 Supabase nasdaq_force ({dKey:dd/MM/yyyy}): {count} registros em background.");
								}
							}
							catch (Exception ex)
							{
								debugPrint?.Invoke($"[PLAYBOOK] ⚠️ Falha ao buscar dia {dKey:dd/MM/yyyy} em nasdaq_force: {ex.Message}");
							}
						});
					}

					public static async Task PollLatestFromSupabaseAsync(string url, string key, string instanceId, Action<string> debugPrint)
					{
						if ((DateTime.UtcNow - LastRealtimeFetchUtc).TotalSeconds < 4.0) return;
						LastRealtimeFetchUtc = DateTime.UtcNow;

						try
						{
							string cleanInst = string.IsNullOrWhiteSpace(instanceId) ? "painel_principal_web" : instanceId.Trim();
							string queryUrl = $"{url.TrimEnd('/')}/rest/v1/nasdaq_force?" +
								$"instance_id=eq.{Uri.EscapeDataString(cleanInst)}&" +
								$"order=timestamp.desc&limit=5";

							HttpWebRequest req = (HttpWebRequest)WebRequest.Create(queryUrl);
							req.Method = "GET";
							req.Timeout = 3000;
							req.ReadWriteTimeout = 3000;
							req.Headers.Add("apikey", key);
							req.Headers.Add("Authorization", $"Bearer {key}");
							req.ContentType = "application/json";

							using (HttpWebResponse resp = (HttpWebResponse)await req.GetResponseAsync())
							using (StreamReader reader = new StreamReader(resp.GetResponseStream()))
							{
								string json = await reader.ReadToEndAsync();
								ParseAndStoreJsonRows(json, true);
							}
						}
						catch (Exception ex)
						{
							debugPrint?.Invoke($"[PLAYBOOK POLL] ⚠️ {ex.Message}");
						}
					}

					private static int ParseAndStoreJsonRows(string json, bool updateLatest)"""

    if old_cache_pattern.search(c):
        c = old_cache_pattern.sub(lambda m: new_cache_code, c)
        print("  -> AxionNasdaqForceCache successfully patched to 100% async non-blocking.")
    else:
        print("  -> WARNING: old_cache_pattern not found!")

    # 2. Atualizar InitializePlaybookNasdaq
    old_init = """				private void InitializePlaybookNasdaq()
				{
					AxionNasdaqForceCache.EnsureLocalCsvLoaded(DebugPrint);"""

    new_init = """				private void InitializePlaybookNasdaq()
				{
					// Dispara carregamento assíncrono em background (Zero travamento de thread)
					AxionNasdaqForceCache.EnsureLocalCsvLoadedAsync(DebugPrint);"""

    c = c.replace(old_init, new_init)

    # 3. Remover chamadas síncronas de ProcessPlaybookNasdaq
    # Remover AxionNasdaqForceCache.EnsureLocalCsvLoaded(DebugPrint);
    c = c.replace("					AxionNasdaqForceCache.EnsureLocalCsvLoaded(DebugPrint);\n", "")
    c = c.replace("					AxionNasdaqForceCache.EnsureLocalCsvLoaded(DebugPrint);", "")

    # Substituir FetchDayFromSupabaseSync por RequestDayFetchAsync apenas se isLiveTrading
    old_fetch_day = """					// Garante que os registros do dia estão carregados do Supabase caso não estejam no CSV local
					AxionNasdaqForceCache.FetchDayFromSupabaseSync(supabaseUrl, supabaseServiceKey, PB_InstanceId, today, DebugPrint);"""

    new_fetch_day = """					// Sincroniza dia apenas se estiver em LiveTrading e em background (NUNCA bloqueia a thread do gráfico)
					if (isLiveTrading)
					{
						AxionNasdaqForceCache.RequestDayFetchAsync(supabaseUrl, supabaseServiceKey, PB_InstanceId, today, DebugPrint);
					}"""

    c = c.replace(old_fetch_day, new_fetch_day)

    # Substituir FetchSpecificMinuteFromSupabase por RequestSpecificMinuteAsync
    c = c.replace("AxionNasdaqForceCache.FetchSpecificMinuteFromSupabase(", "AxionNasdaqForceCache.RequestSpecificMinuteAsync(")

    # 4. Proteger IsEsAsset com try/catch
    old_is_es = """				private bool IsEsAsset()
				{
					if (PB_PerfilAtivo == PlaybookAtivoMode.Sp500_ES_MES) return true;
					if (PB_PerfilAtivo == PlaybookAtivoMode.Nasdaq_NQ_MNQ) return false;
					if (Instrument == null) return false;
					string sym = (Instrument.MasterInstrument != null ? Instrument.MasterInstrument.Name : Instrument.FullName).ToUpperInvariant();
					return sym.StartsWith("ES") || sym.StartsWith("MES") || sym.Contains("SP500") || sym.Contains("S&P");
				}"""

    new_is_es = """				private bool IsEsAsset()
				{
					try
					{
						if (PB_PerfilAtivo == PlaybookAtivoMode.Sp500_ES_MES) return true;
						if (PB_PerfilAtivo == PlaybookAtivoMode.Nasdaq_NQ_MNQ) return false;
						if (Instrument == null) return false;
						string sym = (Instrument.MasterInstrument != null ? Instrument.MasterInstrument.Name : (Instrument.FullName ?? "")).ToUpperInvariant();
						return sym.StartsWith("ES") || sym.StartsWith("MES") || sym.Contains("SP500") || sym.Contains("S&P");
					}
					catch { return false; }
				}"""

    c = c.replace(old_is_es, new_is_es)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(c)
    print(f"  -> File {filepath} successfully saved!")

patch_file('experts/VMPlaybookNasdaq.cs')
patch_file('experts/VMBotF.cs')
