#region Using declarations
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using NinjaTrader.Cbi;
using NinjaTrader.Core.FloatingPoint;
using NinjaTrader.Data;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Tools;
using NinjaTrader.NinjaScript;
#endregion

namespace NinjaTrader.NinjaScript.AddOns
{
    // =========================================================================
    // 1. GESTÃO DE LICENCIAMENTO, SEGURANÇA E WOOCOMMERCE SUBSCRIPTIONS
    // Idêntico ao padrão de segurança do AxionGatewayAddOn
    // =========================================================================
    public static class AxionStreamerLicenseManager
    {
        // ── DADOS DA EMPRESA E REGISTRO ──
        public const string EmpresaRazaoSocial = "VM GESTAO & TECNOLOGIA LTDA";
        public const string EmpresaCnpj = "67.109.367/0001-19";
        public const string EmpresaDominio = "ffbinvest.amsolucoes.net.br";
        public const string SoftwareVersao = "Axion Data Streamer Enterprise v2.0";
        public const string CopyrightText = "Todos os direitos reservados © 2026 VM Gestão & Tecnologia Ltda";

        // ── WOOCOMMERCE & CONFIGURAÇÃO DA LOJA ──
        public const int CodProduto = 7375;
        public static readonly int[] CodigosProdutosValidos = new int[] { 7375, 9203, 9286 };
        private const string ConsumerKey = "ck_75f9d0f430cb40c64c902ed43ce2bceb08e5e649";
        private const string ConsumerSecret = "cs_a741c57b4368102a1daf3fbfc4598833ffb23e77";
        private const string LicenseCacheFileName = "axion_streamer_license.enc";
        private const string EncryptionKey = "VM_AXION_LICENSE_KEY_2026";

        // ── MODO DESENVOLVEDOR & MÁQUINAS AUTORIZADAS ──
        public const bool DEVELOPER_MODE = true;
        private static readonly HashSet<string> AllowedDevMachineIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "7C1ABAF8961E1F923C578D2D33AC90FD",
            "8DD8C350270D4E4A0D73F2FF03C63AB5",
            "744AA4E192501CCB064797532CE8CF62",
            "38E81B0FC6ED3C2536E7C164321724D9",
            "917D7FF64DDDB72D633D39D89A99653B"
        };

        // ── ESTADO EM TEMPO DE EXECUÇÃO ──
        public static bool IsValid { get; private set; } = false;
        public static string StatusMensagem { get; private set; } = "Verificando licença...";
        public static DateTime UltimaValidacao { get; private set; } = DateTime.MinValue;
        public static DateTime ValidadeCache { get; private set; } = DateTime.MinValue;
        public static Action OnLicenseStatusChanged { get; set; }

        public static string CurrentMachineId
        {
            get
            {
                try { return Cbi.License.MachineId ?? ""; }
                catch { return ""; }
            }
        }

        public static bool IsLicensed
        {
            get
            {
                if (DEVELOPER_MODE && (AllowedDevMachineIds.Contains(CurrentMachineId) || string.IsNullOrEmpty(CurrentMachineId)))
                    return true;
                return IsValid;
            }
        }

        public static void Inicializar()
        {
            try
            {
                // 1. Tentar ler cache local criptografado
                if (LerCacheLicenca())
                {
                    IsValid = true;
                    StatusMensagem = "Licença Ativa e Autorizada";
                    return;
                }

                // 2. Se máquina de desenvolvedor autorizada
                if (DEVELOPER_MODE && AllowedDevMachineIds.Contains(CurrentMachineId))
                {
                    IsValid = true;
                    StatusMensagem = "Licença Ativa (Desenvolvedor)";
                    return;
                }

                // 3. Se houver ID de assinatura salvo, validar online em segundo plano
                string idAssinatura = AxionStreamerConfig.IdAssinatura;
                if (!string.IsNullOrWhiteSpace(idAssinatura))
                {
                    Task.Run(() => ValidarOnline(idAssinatura));
                }
                else
                {
                    IsValid = false;
                    StatusMensagem = "Informe o ID da Assinatura na aba 'Sobre & Licença'.";
                }
            }
            catch (Exception ex)
            {
                StatusMensagem = $"Erro ao inicializar licença: {ex.Message}";
            }
        }

        public static (bool Sucesso, string Mensagem) ValidarOnline(string idInput)
        {
            if (string.IsNullOrWhiteSpace(idInput))
            {
                IsValid = false;
                StatusMensagem = "ID da Assinatura / Pedido não informado.";
                OnLicenseStatusChanged?.Invoke();
                return (false, StatusMensagem);
            }

            string idLimpo = idInput.Trim();
            string machineId = CurrentMachineId;

            try
            {
                // 1. Tentativa via API de Subscriptions (Assinatura Recorrente)
                string subUrl = $"https://{EmpresaDominio}/wp-json/wc/v3/subscriptions/{idLimpo}?consumer_key={ConsumerKey}&consumer_secret={ConsumerSecret}";
                string json = null;

                try
                {
                    using (var client = new WebClient { Encoding = Encoding.UTF8 })
                    {
                        json = client.DownloadString(subUrl);
                    }
                }
                catch { }

                // Se não respondeu assinatura, tentar via API de Orders (Pedido Avulso / Licença Única)
                if (string.IsNullOrEmpty(json) || json.Contains("\"code\":\"rest_no_route\"") || json.Contains("\"code\":\"woocommerce_rest_cannot_view\""))
                {
                    try
                    {
                        string orderUrl = $"https://{EmpresaDominio}/wp-json/wc/v3/orders/{idLimpo}?consumer_key={ConsumerKey}&consumer_secret={ConsumerSecret}";
                        using (var client = new WebClient { Encoding = Encoding.UTF8 })
                        {
                            json = client.DownloadString(orderUrl);
                        }
                    }
                    catch { }
                }

                if (string.IsNullOrEmpty(json))
                {
                    IsValid = false;
                    StatusMensagem = "Não foi possível conectar ao servidor ou Assinatura inexistente.";
                    OnLicenseStatusChanged?.Invoke();
                    return (false, StatusMensagem);
                }

                // Verificar Status Ativo
                bool statusOk = json.IndexOf("\"status\":\"active\"", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                json.IndexOf("\"status\":\"on-hold\"", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                json.IndexOf("\"status\":\"completed\"", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                json.IndexOf("\"status\":\"processing\"", StringComparison.OrdinalIgnoreCase) >= 0;

                if (!statusOk)
                {
                    IsValid = false;
                    StatusMensagem = "Assinatura ou Pedido com status inativo/cancelado.";
                    OnLicenseStatusChanged?.Invoke();
                    return (false, StatusMensagem);
                }

                // Verificar Código do Produto (7375, 9203, 9286)
                int lineItemsIdx = json.IndexOf("\"line_items\":", StringComparison.OrdinalIgnoreCase);
                bool produtoOk = false;
                int produtoValidoEncontrado = CodProduto;
                if (lineItemsIdx >= 0)
                {
                    foreach (int cod in CodigosProdutosValidos)
                    {
                        if (json.IndexOf($"\"product_id\":{cod}", lineItemsIdx, StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            produtoOk = true;
                            produtoValidoEncontrado = cod;
                            break;
                        }
                    }
                }

                if (!produtoOk && !DEVELOPER_MODE)
                {
                    IsValid = false;
                    StatusMensagem = "Assinatura não corresponde a um produto Axion Streamer válido.";
                    OnLicenseStatusChanged?.Invoke();
                    return (false, StatusMensagem);
                }

                // Verificar Machine ID (meta_data com key: "id_nt" ou fallback)
                string idNtValue = ExtrairValueAposKey(json, "\"key\":\"id_nt\"");
                if (string.IsNullOrEmpty(idNtValue))
                {
                    idNtValue = ExtrairValueAposKey(json, "\"key\":\"id_machine\"") ?? ExtrairValueAposKey(json, "\"key\":\"machine_id\"");
                }

                if (string.IsNullOrEmpty(idNtValue))
                {
                    IsValid = false;
                    StatusMensagem = "Machine ID não encontrado no cadastro desta assinatura.";
                    OnLicenseStatusChanged?.Invoke();
                    return (false, StatusMensagem);
                }

                if (!idNtValue.Equals(machineId, StringComparison.OrdinalIgnoreCase))
                {
                    IsValid = false;
                    StatusMensagem = "Machine ID divergente. Assinatura vinculada a outro computador.";
                    OnLicenseStatusChanged?.Invoke();
                    return (false, StatusMensagem);
                }

                // Tudo Válido!
                IsValid = true;
                UltimaValidacao = DateTime.UtcNow;
                ValidadeCache = DateTime.UtcNow.AddHours(72);
                StatusMensagem = "Licença Ativa e Autorizada";
                SalvarCacheLicenca(idLimpo, produtoValidoEncontrado);

                AxionStreamerConfig.IdAssinatura = idLimpo;
                AxionStreamerConfig.Save();

                OnLicenseStatusChanged?.Invoke();
                return (true, "Assinatura validada e autorizada com sucesso!");
            }
            catch (Exception ex)
            {
                IsValid = false;
                StatusMensagem = $"Erro na validação da assinatura: {ex.Message}";
                OnLicenseStatusChanged?.Invoke();
                return (false, StatusMensagem);
            }
        }

        #region Criptografia e Cache Local (TTL 72 Horas)

        private static string SimpleEncrypt(string text, string key)
        {
            try
            {
                byte[] inp = Encoding.UTF8.GetBytes(text);
                byte[] kb = Encoding.UTF8.GetBytes(key);
                byte[] o = new byte[inp.Length];
                for (int i = 0; i < inp.Length; i++) o[i] = (byte)(inp[i] ^ kb[i % kb.Length]);
                return Convert.ToBase64String(o);
            }
            catch { return ""; }
        }

        private static string SimpleDecrypt(string cipherText, string key)
        {
            try
            {
                byte[] inp = Convert.FromBase64String(cipherText);
                byte[] kb = Encoding.UTF8.GetBytes(key);
                byte[] o = new byte[inp.Length];
                for (int i = 0; i < inp.Length; i++) o[i] = (byte)(inp[i] ^ kb[i % kb.Length]);
                return Encoding.UTF8.GetString(o);
            }
            catch { return ""; }
        }

        private static bool LerCacheLicenca()
        {
            try
            {
                string cachePath = Path.Combine(NinjaTrader.Core.Globals.UserDataDir, LicenseCacheFileName);
                if (!File.Exists(cachePath))
                {
                    // Fallback: se já ativou no AxionGateway, reutiliza o cache do gateway!
                    string gwCache = Path.Combine(NinjaTrader.Core.Globals.UserDataDir, "axion_gateway_license.enc");
                    if (File.Exists(gwCache)) cachePath = gwCache;
                    else return false;
                }

                string raw = File.ReadAllText(cachePath, Encoding.UTF8);
                string json = SimpleDecrypt(raw, EncryptionKey);
                if (string.IsNullOrWhiteSpace(json)) return false;

                string idM = ExtractJsonVal(json, "idMachine");
                string cod = ExtractJsonVal(json, "codProduto");
                string dat = ExtractJsonVal(json, "dataValidacao");

                if (string.IsNullOrEmpty(idM) || string.IsNullOrEmpty(cod) || string.IsNullOrEmpty(dat))
                    return false;

                // Valida se o produto em cache pertence à lista de produtos válidos
                bool codValido = false;
                if (int.TryParse(cod, out int c))
                {
                    foreach (int cp in CodigosProdutosValidos)
                    {
                        if (cp == c) { codValido = true; break; }
                    }
                }
                if (!codValido && !DEVELOPER_MODE)
                    return false;

                if (!DateTime.TryParse(dat, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal, out DateTime dv))
                {
                    if (!DateTime.TryParse(dat, out dv)) return false;
                }

                if (!idM.Equals(CurrentMachineId, StringComparison.OrdinalIgnoreCase))
                    return false;

                if ((DateTime.UtcNow - dv).TotalHours > 72)
                    return false;

                UltimaValidacao = dv;
                ValidadeCache = dv.AddHours(72);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static void SalvarCacheLicenca(string idAssinatura, int codProduto = CodProduto)
        {
            try
            {
                string cachePath = Path.Combine(NinjaTrader.Core.Globals.UserDataDir, LicenseCacheFileName);
                string dir = Path.GetDirectoryName(cachePath);
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

                string json = "{" +
                    $"\"idMachine\":\"{CurrentMachineId}\"," +
                    $"\"codProduto\":\"{codProduto}\"," +
                    $"\"idAssinatura\":\"{idAssinatura}\"," +
                    $"\"dataValidacao\":\"{DateTime.UtcNow:o}\"" +
                    "}";

                string enc = SimpleEncrypt(json, EncryptionKey);
                File.WriteAllText(cachePath, enc, Encoding.UTF8);
            }
            catch { }
        }

        private static string ExtractJsonVal(string json, string key)
        {
            var match = Regex.Match(json, $"\"{key}\"\\s*:\\s*\"([^\"]*)\"");
            return match.Success ? match.Groups[1].Value : null;
        }

        private static string ExtrairValueAposKey(string json, string keyPattern)
        {
            try
            {
                int pos = json.IndexOf(keyPattern, StringComparison.OrdinalIgnoreCase);
                if (pos < 0) return null;

                int metaBlockEnd = json.IndexOf('}', pos);
                if (metaBlockEnd < 0) metaBlockEnd = json.Length;

                string sub = json.Substring(pos, metaBlockEnd - pos);
                var match = Regex.Match(sub, "\"value\"\\s*:\\s*\"([^\"]*)\"", RegexOptions.IgnoreCase);
                if (match.Success) return match.Groups[1].Value.Trim();

                var matchNum = Regex.Match(sub, "\"value\"\\s*:\\s*([0-9A-Za-z_-]+)", RegexOptions.IgnoreCase);
                if (matchNum.Success) return matchNum.Groups[1].Value.Trim();
            }
            catch { }
            return null;
        }

        #endregion
    }

    // =========================================================================
    // 2. SERVIDOR HTTP SINGLETON DO AXION STREAMER ADD-ON (:8002)
    // =========================================================================
    public static class AxionAddOnStreamServer
    {
        private static HttpListener _httpListener;
        private static bool _isRunning = false;
        private static readonly object _serverLock = new object();
        private static int _currentPort = 8002;

        public class WsClient
        {
            public WebSocket Socket { get; set; }
            public SemaphoreSlim SendLock { get; } = new SemaphoreSlim(1, 1);
        }

        private static readonly ConcurrentDictionary<string, WsClient> _wsClients =
            new ConcurrentDictionary<string, WsClient>();

        private static readonly Dictionary<string, SymbolStreamData> _streams =
            new Dictionary<string, SymbolStreamData>(StringComparer.OrdinalIgnoreCase);

        public class CandleItem
        {
            public string timestamp;
            public double open;
            public double high;
            public double low;
            public double close;
            public long volume;
        }

        public class BlockTradeItem
        {
            public string time;
            public double price;
            public long volume;
            public string side; // "COMPRA" ou "VENDA"
        }

        public class SymbolStreamData
        {
            public string RootSymbol { get; set; } = "";
            public string FullInstrument { get; set; } = "";
            public string TargetPanel { get; set; } = "";
            public int TimeframeMinutes { get; set; } = 1;
            public List<CandleItem> Candles { get; set; } = new List<CandleItem>();
            public List<BlockTradeItem> BlockTrades { get; set; } = new List<BlockTradeItem>();
            public int TotalBlockTradesCaptured { get; set; } = 0;
            public double CurrentPrice { get; set; }
            public double CurrentOpen { get; set; }
            public double CurrentHigh { get; set; }
            public double CurrentLow { get; set; }
            public double CurrentClose { get; set; }
            public long CurrentVolume { get; set; }
            public string CurrentTimestamp { get; set; } = "";
            public DateTime LastUpdateUtc { get; set; } = DateTime.UtcNow;
            public readonly object DataLock = new object();

            private string _cachedCandlesJson = "[]";
            private bool _isCandlesDirty = true;

            public void MarkCandlesDirty()
            {
                _isCandlesDirty = true;
            }

            public string GetCandlesJson(int? count = null, string since = null, string from = null, string to = null)
            {
                lock (DataLock)
                {
                    bool isFullQuery = !count.HasValue && string.IsNullOrEmpty(since) && string.IsNullOrEmpty(from) && string.IsNullOrEmpty(to);
                    if (isFullQuery && !_isCandlesDirty && !string.IsNullOrEmpty(_cachedCandlesJson))
                    {
                        return _cachedCandlesJson;
                    }

                    IEnumerable<CandleItem> query = Candles;
                    if (!string.IsNullOrEmpty(since))
                    {
                        query = query.Where(c => string.Compare(c.timestamp, since, StringComparison.Ordinal) > 0);
                    }
                    if (!string.IsNullOrEmpty(from))
                    {
                        query = query.Where(c => string.Compare(c.timestamp, from, StringComparison.Ordinal) >= 0);
                    }
                    if (!string.IsNullOrEmpty(to))
                    {
                        query = query.Where(c => string.Compare(c.timestamp, to, StringComparison.Ordinal) <= 0);
                    }
                    if (count.HasValue && count.Value > 0)
                    {
                        var fullList = query as IList<CandleItem> ?? query.ToList();
                        int skipCount = Math.Max(0, fullList.Count - count.Value);
                        query = fullList.Skip(skipCount);
                    }

                    var list = query as IList<CandleItem> ?? query.ToList();
                    var sb = new StringBuilder(list.Count * 90);
                    sb.Append("[");
                    for (int i = 0; i < list.Count; i++)
                    {
                        var c = list[i];
                        if (i > 0) sb.Append(",");
                        sb.Append("{\"timestamp\":\"").Append(c.timestamp).Append("\",")
                          .Append("\"open\":").Append(c.open.ToString("F2", CultureInfo.InvariantCulture)).Append(",")
                          .Append("\"high\":").Append(c.high.ToString("F2", CultureInfo.InvariantCulture)).Append(",")
                          .Append("\"low\":").Append(c.low.ToString("F2", CultureInfo.InvariantCulture)).Append(",")
                          .Append("\"close\":").Append(c.close.ToString("F2", CultureInfo.InvariantCulture)).Append(",")
                          .Append("\"volume\":").Append(c.volume).Append("}");
                    }
                    sb.Append("]");

                    string result = sb.ToString();
                    if (isFullQuery)
                    {
                        _cachedCandlesJson = result;
                        _isCandlesDirty = false;
                    }
                    return result;
                }
            }

            public string GetBlockTradesJson()
            {
                lock (DataLock)
                {
                    var sb = new StringBuilder();
                    sb.Append("[");
                    for (int i = 0; i < BlockTrades.Count; i++)
                    {
                        var t = BlockTrades[i];
                        if (i > 0) sb.Append(",");
                        sb.Append("{\"time\":\"").Append(t.time).Append("\",")
                          .Append("\"price\":").Append(t.price.ToString("F2", CultureInfo.InvariantCulture)).Append(",")
                          .Append("\"volume\":").Append(t.volume).Append(",")
                          .Append("\"side\":\"").Append(t.side).Append("\"}");
                    }
                    sb.Append("]");
                    return sb.ToString();
                }
            }
        }

        public static bool IsRunning => _isRunning;
        public static int CurrentPort => _currentPort;

        public static void Register(string rootSymbol, string targetPanel, string fullInstrument, int tfMinutes, int port, SymbolStreamData data)
        {
            lock (_serverLock)
            {
                _streams[rootSymbol] = data;
                if (!string.IsNullOrEmpty(targetPanel))
                {
                    _streams[targetPanel] = data;
                }

                _currentPort = port;

                if (!_isRunning)
                {
                    StartServer(_currentPort);
                }
            }
        }

        public static void Unregister(string rootSymbol)
        {
            lock (_serverLock)
            {
                if (_streams.ContainsKey(rootSymbol))
                {
                    var data = _streams[rootSymbol];
                    if (data != null && !string.IsNullOrEmpty(data.TargetPanel) && _streams.ContainsKey(data.TargetPanel))
                    {
                        _streams.Remove(data.TargetPanel);
                    }
                    _streams.Remove(rootSymbol);
                }
            }
        }

        public static SymbolStreamData FindStream(string symbol, string panel)
        {
            lock (_serverLock)
            {
                if (!string.IsNullOrEmpty(panel))
                {
                    if (_streams.TryGetValue(panel, out var dataByPanel)) return dataByPanel;

                    foreach (var kvp in _streams)
                    {
                        if (string.Equals(kvp.Value.TargetPanel, panel, StringComparison.OrdinalIgnoreCase))
                            return kvp.Value;
                    }

                    foreach (var kvp in _streams)
                    {
                        if (panel.IndexOf(kvp.Value.TargetPanel, StringComparison.OrdinalIgnoreCase) >= 0 ||
                            kvp.Value.TargetPanel.IndexOf(panel, StringComparison.OrdinalIgnoreCase) >= 0)
                            return kvp.Value;
                    }
                }

                if (!string.IsNullOrEmpty(symbol))
                {
                    if (_streams.TryGetValue(symbol, out var dataBySym)) return dataBySym;

                    string mapped = GetEquivalentSymbol(symbol);
                    if (!string.IsNullOrEmpty(mapped) && _streams.TryGetValue(mapped, out var dataByMapped)) return dataByMapped;

                    foreach (var kvp in _streams)
                    {
                        if (string.Equals(kvp.Value.RootSymbol, symbol, StringComparison.OrdinalIgnoreCase))
                            return kvp.Value;
                        if (!string.IsNullOrEmpty(mapped) && string.Equals(kvp.Value.RootSymbol, mapped, StringComparison.OrdinalIgnoreCase))
                            return kvp.Value;
                        if (kvp.Value.RootSymbol.IndexOf(symbol, StringComparison.OrdinalIgnoreCase) >= 0 ||
                            symbol.IndexOf(kvp.Value.RootSymbol, StringComparison.OrdinalIgnoreCase) >= 0)
                            return kvp.Value;
                    }
                }

                return null;
            }
        }

        private static string GetEquivalentSymbol(string sym)
        {
            if (string.IsNullOrEmpty(sym)) return "";
            string s = sym.Trim().ToUpperInvariant();
            switch (s)
            {
                case "NQ": return "MNQ";
                case "MNQ": return "NQ";
                case "RTY": return "M2K";
                case "M2K": return "RTY";
                case "ES": return "MES";
                case "MES": return "ES";
                case "YM": return "MYM";
                case "MYM": return "YM";
                case "GC": return "MGC";
                case "MGC": return "GC";
                case "CL": return "MCL";
                case "MCL": return "CL";
                default: return "";
            }
        }

        public static void StartServer(int port)
        {
            lock (_serverLock)
            {
                if (_isRunning) return;

                _currentPort = port;

                try
                {
                    if (_httpListener != null)
                    {
                        _httpListener.Abort();
                        _httpListener = null;
                    }
                }
                catch { }

                bool bound = false;
                Exception lastEx = null;

                // 1. Tentativa padrão: localhost
                try
                {
                    _httpListener = new HttpListener();
                    _httpListener.Prefixes.Add($"http://localhost:{port}/");
                    _httpListener.Start();
                    bound = true;
                }
                catch (Exception ex)
                {
                    lastEx = ex;
                    try { _httpListener?.Abort(); } catch { }
                    _httpListener = null;
                }

                // 2. Tentativa 127.0.0.1 (se localhost der conflito com registro do Windows)
                if (!bound)
                {
                    try
                    {
                        _httpListener = new HttpListener();
                        _httpListener.Prefixes.Add($"http://127.0.0.1:{port}/");
                        _httpListener.Start();
                        bound = true;
                    }
                    catch (Exception ex)
                    {
                        lastEx = ex;
                        try { _httpListener?.Abort(); } catch { }
                        _httpListener = null;
                    }
                }

                if (bound && _httpListener != null)
                {
                    _isRunning = true;
                    _httpListener.BeginGetContext(OnHttpRequestReceived, null);
                    AxionStreamerAddOn.Log($"[AxionStreamer] 🟢 Servidor HTTP/WebSocket iniciado com sucesso na porta {port}.");
                }
                else
                {
                    // 3. Fallback inteligente: testa se a porta já está viva e respondendo (ex: re-compilação no NT8)
                    try
                    {
                        using (var wc = new System.Net.WebClient())
                        {
                            string resp = wc.DownloadString($"http://127.0.0.1:{port}/status");
                            if (resp.Contains("\"status\":\"online\""))
                            {
                                _isRunning = true;
                                AxionStreamerAddOn.Log($"[AxionStreamer] 🟢 Servidor HTTP já ativo e respondendo na porta {port}.");
                                return;
                            }
                        }
                    }
                    catch { }

                    AxionStreamerAddOn.Log($"[AxionStreamer] ❌ Erro ao iniciar servidor na porta {port}: {lastEx?.Message}");
                }
            }
        }

        public static void StopServer()
        {
            lock (_serverLock)
            {
                try
                {
                    _isRunning = false;
                    foreach (var kvp in _wsClients)
                    {
                        try { kvp.Value.Socket.Dispose(); } catch { }
                        try { kvp.Value.SendLock.Dispose(); } catch { }
                    }
                    _wsClients.Clear();

                    if (_httpListener != null && _httpListener.IsListening)
                    {
                        _httpListener.Stop();
                        _httpListener.Close();
                    }
                    AxionStreamerAddOn.Log("[AxionStreamer] Servidor HTTP/WebSocket finalizado.");
                }
                catch { }
                finally
                {
                    _httpListener = null;
                }
            }
        }

        private static async Task HandleWebSocketClientAsync(HttpListenerContext context)
        {
            string clientId = Guid.NewGuid().ToString("N");
            WsClient client = null;
            try
            {
                HttpListenerWebSocketContext wsContext = await context.AcceptWebSocketAsync(subProtocol: null);
                client = new WsClient { Socket = wsContext.WebSocket };
                _wsClients[clientId] = client;

                byte[] buffer = new byte[2048];
                while (client.Socket.State == WebSocketState.Open && _isRunning)
                {
                    var result = await client.Socket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                    if (result.MessageType == WebSocketMessageType.Close || result.Count == 0)
                    {
                        try
                        {
                            await client.Socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
                        }
                        catch { }
                        break;
                    }
                }
            }
            catch { }
            finally
            {
                if (client != null)
                {
                    _wsClients.TryRemove(clientId, out _);
                    try { client.Socket.Dispose(); } catch { }
                    try { client.SendLock.Dispose(); } catch { }
                }
            }
        }

        public static void BroadcastWebSocket(string json)
        {
            if (_wsClients.IsEmpty || string.IsNullOrEmpty(json)) return;

            byte[] bytes = Encoding.UTF8.GetBytes(json);
            var segment = new ArraySegment<byte>(bytes);

            foreach (var kvp in _wsClients)
            {
                var client = kvp.Value;
                if (client != null && client.Socket.State == WebSocketState.Open)
                {
                    Task.Run(async () =>
                    {
                        try
                        {
                            if (await client.SendLock.WaitAsync(50))
                            {
                                try
                                {
                                    if (client.Socket.State == WebSocketState.Open)
                                    {
                                        await client.Socket.SendAsync(segment, WebSocketMessageType.Text, true, CancellationToken.None);
                                    }
                                }
                                finally
                                {
                                    client.SendLock.Release();
                                }
                            }
                        }
                        catch { }
                    });
                }
            }
        }

        private static void OnHttpRequestReceived(IAsyncResult ar)
        {
            if (!_isRunning || _httpListener == null) return;

            try
            {
                HttpListenerContext context = _httpListener.EndGetContext(ar);
                _httpListener.BeginGetContext(OnHttpRequestReceived, null);

                if (context.Request.IsWebSocketRequest)
                {
                    Task.Run(async () => await HandleWebSocketClientAsync(context));
                    return;
                }

                HttpListenerRequest req = context.Request;
                HttpListenerResponse res = context.Response;

                res.Headers.Add("Access-Control-Allow-Origin", "*");
                res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                res.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey");

                if (req.HttpMethod == "OPTIONS")
                {
                    res.StatusCode = 200;
                    res.Close();
                    return;
                }

                string path = req.Url.AbsolutePath.ToLowerInvariant();

                // 1. Endpoint /status
                if (path == "/status" || path == "/ping")
                {
                    var sb = new StringBuilder();
                    sb.Append("{\"status\":\"online\",\"version\":\"2.0.0-addon\",\"service\":\"AxionStreamerAddOn\",");
                    sb.Append("\"license_status\":\"").Append(AxionStreamerLicenseManager.IsLicensed ? "active" : "inactive").Append("\",");
                    sb.Append("\"active_streams\":[");

                    lock (_serverLock)
                    {
                        int idx = 0;
                        var uniqueList = new List<SymbolStreamData>();
                        foreach (var kvp in _streams)
                        {
                            if (!uniqueList.Contains(kvp.Value))
                            {
                                uniqueList.Add(kvp.Value);
                            }
                        }

                        foreach (var s in uniqueList)
                        {
                            if (idx > 0) sb.Append(",");
                            sb.Append("{\"symbol\":\"").Append(s.RootSymbol).Append("\",")
                              .Append("\"panel\":\"").Append(s.TargetPanel).Append("\",")
                              .Append("\"instrument\":\"").Append(s.FullInstrument).Append("\",")
                              .Append("\"timeframe\":").Append(s.TimeframeMinutes).Append(",")
                              .Append("\"bars_count\":").Append(s.Candles.Count).Append(",")
                              .Append("\"block_trades_count\":").Append(s.BlockTrades.Count).Append(",")
                              .Append("\"last_price\":").Append(s.CurrentPrice.ToString("F2", CultureInfo.InvariantCulture)).Append(",")
                              .Append("\"updated_at\":\"").Append(s.LastUpdateUtc.ToString("o")).Append("\"}");
                            idx++;
                        }
                    }

                    sb.Append("]}");
                    SendJson(res, sb.ToString());
                    return;
                }

                string reqSymbol = req.QueryString["symbol"] ?? req.QueryString["ativo"] ?? "";
                string reqPanel = req.QueryString["panel"] ?? req.QueryString["painel"] ?? "";

                var stream = FindStream(reqSymbol, reqPanel);

                // 2. Endpoint /candles (Histórico de 1m com suporte a delta/corte)
                if (path == "/candles" || path == "/bars")
                {
                    if (stream == null)
                    {
                        SendJson(res, "{\"error\":\"Símbolo ou painel não encontrado ou não transmitindo.\",\"candles\":[]}", 404);
                        return;
                    }

                    int? countParam = null;
                    if (int.TryParse(req.QueryString["count"] ?? req.QueryString["limit"], out int parsedCount) && parsedCount > 0)
                    {
                        countParam = parsedCount;
                    }
                    string sinceParam = req.QueryString["since"];
                    string fromParam = req.QueryString["from"] ?? req.QueryString["start"];
                    string toParam = req.QueryString["to"] ?? req.QueryString["end"];

                    string candlesJson = stream.GetCandlesJson(countParam, sinceParam, fromParam, toParam);
                    string resp = $"{{\"symbol\":\"{stream.RootSymbol}\",\"panel\":\"{stream.TargetPanel}\",\"count\":{stream.Candles.Count},\"candles\":{candlesJson}}}";
                    SendJson(res, resp);
                    return;
                }

                // 3. Endpoint /market_data (Cotação em tempo real e agressões)
                if (path == "/market_data" || path == "/quote" || path == "/tick")
                {
                    if (stream == null)
                    {
                        SendJson(res, "{\"error\":\"Símbolo ou painel não encontrado.\",\"price\":0}", 404);
                        return;
                    }

                    string json;
                    lock (stream.DataLock)
                    {
                        string btJson = stream.GetBlockTradesJson();
                        json = $"{{\"symbol\":\"{stream.RootSymbol}\",\"panel\":\"{stream.TargetPanel}\"," +
                               $"\"price\":{stream.CurrentPrice.ToString("F2", CultureInfo.InvariantCulture)}," +
                               $"\"open\":{stream.CurrentOpen.ToString("F2", CultureInfo.InvariantCulture)}," +
                               $"\"high\":{stream.CurrentHigh.ToString("F2", CultureInfo.InvariantCulture)}," +
                               $"\"low\":{stream.CurrentLow.ToString("F2", CultureInfo.InvariantCulture)}," +
                               $"\"close\":{stream.CurrentClose.ToString("F2", CultureInfo.InvariantCulture)}," +
                               $"\"volume\":{stream.CurrentVolume}," +
                               $"\"timestamp\":\"{stream.CurrentTimestamp}\"," +
                               $"\"updated_at\":\"{stream.LastUpdateUtc:o}\"," +
                               $"\"block_trades\":{btJson}}}";
                    }
                    SendJson(res, json);
                    return;
                }

                SendJson(res, "{\"error\":\"Endpoint desconhecido. Use /status, /candles ou /market_data\"}", 404);
            }
            catch (Exception ex)
            {
                AxionStreamerAddOn.Log($"[AxionStreamer] Erro HTTP: {ex.Message}");
            }
        }

        private static void SendJson(HttpListenerResponse res, string json, int statusCode = 200)
        {
            try
            {
                byte[] buffer = Encoding.UTF8.GetBytes(json);
                res.StatusCode = statusCode;
                res.ContentType = "application/json; charset=utf-8";
                res.ContentLength64 = buffer.Length;
                using (Stream output = res.OutputStream)
                {
                    output.Write(buffer, 0, buffer.Length);
                }
            }
            catch { }
            finally
            {
                try { res.Close(); } catch { }
            }
        }
    }

    // =========================================================================
    // 3. MODELO DE CONFIGURAÇÃO E PERSISTÊNCIA JSON
    // =========================================================================
    public class StreamerSlotConfig
    {
        public int SlotIndex { get; set; }
        public string InstrumentFullName { get; set; } = "";
        public string TargetPanel { get; set; } = "Auto";
        public int DaysToLoad { get; set; } = 5;
        public int BlockTradeThreshold { get; set; } = 50;
        public bool AutoStart { get; set; } = false;
    }

    public static class AxionStreamerConfig
    {
        public static int ServerPort { get; set; } = 8002;
        public static bool AutoStartAllOnOpen { get; set; } = false;
        public static string IdAssinatura { get; set; } = "";
        public static List<StreamerSlotConfig> Slots { get; set; } = new List<StreamerSlotConfig>();

        private static string ConfigFilePath => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            @"NinjaTrader 8\bin\Custom\AxionStreamerConfig.json"
        );

        private static string GatewayConfigFilePath => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            @"NinjaTrader 8\bin\Custom\AxionGatewayConfig.json"
        );

        public static void InitializeDefaultSlots()
        {
            if (Slots == null || Slots.Count == 0)
            {
                Slots = new List<StreamerSlotConfig>();
                for (int i = 0; i < 6; i++)
                {
                    string defaultPanel = "Auto";
                    if (i == 0) defaultPanel = "NASDAQ";
                    else if (i == 1) defaultPanel = "RUSSEL";
                    else if (i == 2) defaultPanel = "SP500";
                    else if (i == 3) defaultPanel = "DOWJONES";
                    else if (i == 4) defaultPanel = "GOLD";
                    else if (i == 5) defaultPanel = "OIL";

                    Slots.Add(new StreamerSlotConfig
                    {
                        SlotIndex = i,
                        InstrumentFullName = "",
                        TargetPanel = defaultPanel,
                        DaysToLoad = 5,
                        BlockTradeThreshold = 50,
                        AutoStart = false
                    });
                }
            }
        }

        public static void Load()
        {
            try
            {
                InitializeDefaultSlots();

                // 1. Tentar importar ID de Assinatura pré-existente do AxionGateway se disponível
                if (string.IsNullOrEmpty(IdAssinatura) && File.Exists(GatewayConfigFilePath))
                {
                    try
                    {
                        string gwJson = File.ReadAllText(GatewayConfigFilePath, Encoding.UTF8);
                        var gwIdMatch = Regex.Match(gwJson, "\"IdAssinatura\"\\s*:\\s*\"([^\"]*)\"");
                        if (gwIdMatch.Success) IdAssinatura = gwIdMatch.Groups[1].Value;
                    }
                    catch { }
                }

                if (File.Exists(ConfigFilePath))
                {
                    string json = File.ReadAllText(ConfigFilePath, Encoding.UTF8);

                    var subMatch = Regex.Match(json, "\"IdAssinatura\"\\s*:\\s*\"([^\"]*)\"");
                    if (subMatch.Success && !string.IsNullOrWhiteSpace(subMatch.Groups[1].Value))
                    {
                        IdAssinatura = subMatch.Groups[1].Value;
                    }

                    var portMatch = Regex.Match(json, "\"ServerPort\"\\s*:\\s*(\\d+)");
                    if (portMatch.Success && int.TryParse(portMatch.Groups[1].Value, out int p))
                    {
                        ServerPort = p;
                    }

                    var autoMatch = Regex.Match(json, "\"AutoStartAllOnOpen\"\\s*:\\s*(true|false)", RegexOptions.IgnoreCase);
                    if (autoMatch.Success && bool.TryParse(autoMatch.Groups[1].Value, out bool b))
                    {
                        AutoStartAllOnOpen = b;
                    }

                    for (int i = 0; i < 6; i++)
                    {
                        var slotPattern = $"\"Slot_{i}\"\\s*:\\s*\\{{([^\\}}]+)\\}}";
                        var slotMatch = Regex.Match(json, slotPattern);
                        if (slotMatch.Success)
                        {
                            string sBlock = slotMatch.Groups[1].Value;
                            var slotCfg = Slots.FirstOrDefault(s => s.SlotIndex == i);
                            if (slotCfg == null)
                            {
                                slotCfg = new StreamerSlotConfig { SlotIndex = i };
                                Slots.Add(slotCfg);
                            }

                            var instM = Regex.Match(sBlock, "\"Instrument\"\\s*:\\s*\"([^\"]*)\"");
                            if (instM.Success) slotCfg.InstrumentFullName = instM.Groups[1].Value;

                            var panM = Regex.Match(sBlock, "\"TargetPanel\"\\s*:\\s*\"([^\"]*)\"");
                            if (panM.Success) slotCfg.TargetPanel = panM.Groups[1].Value;

                            var daysM = Regex.Match(sBlock, "\"DaysToLoad\"\\s*:\\s*(\\d+)");
                            if (daysM.Success && int.TryParse(daysM.Groups[1].Value, out int d)) slotCfg.DaysToLoad = d;

                            var btM = Regex.Match(sBlock, "\"BlockTradeThreshold\"\\s*:\\s*(\\d+)");
                            if (btM.Success && int.TryParse(btM.Groups[1].Value, out int bt)) slotCfg.BlockTradeThreshold = bt;

                            var asM = Regex.Match(sBlock, "\"AutoStart\"\\s*:\\s*(true|false)", RegexOptions.IgnoreCase);
                            if (asM.Success && bool.TryParse(asM.Groups[1].Value, out bool asB)) slotCfg.AutoStart = asB;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                AxionStreamerAddOn.Log($"[AxionStreamer] Erro ao carregar configurações: {ex.Message}");
            }
        }

        public static void Save()
        {
            try
            {
                string dir = Path.GetDirectoryName(ConfigFilePath);
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

                var sb = new StringBuilder();
                sb.AppendLine("{");
                sb.AppendLine($"  \"IdAssinatura\": \"{EscapeJson(IdAssinatura)}\",");
                sb.AppendLine($"  \"ServerPort\": {ServerPort},");
                sb.AppendLine($"  \"AutoStartAllOnOpen\": {(AutoStartAllOnOpen ? "true" : "false")},");

                for (int i = 0; i < Slots.Count; i++)
                {
                    var s = Slots[i];
                    sb.AppendLine($"  \"Slot_{s.SlotIndex}\": {{");
                    sb.AppendLine($"    \"Instrument\": \"{EscapeJson(s.InstrumentFullName)}\",");
                    sb.AppendLine($"    \"TargetPanel\": \"{EscapeJson(s.TargetPanel)}\",");
                    sb.AppendLine($"    \"DaysToLoad\": {s.DaysToLoad},");
                    sb.AppendLine($"    \"BlockTradeThreshold\": {s.BlockTradeThreshold},");
                    sb.AppendLine($"    \"AutoStart\": {(s.AutoStart ? "true" : "false")}");
                    sb.AppendLine($"  }}{(i < Slots.Count - 1 ? "," : "")}");
                }

                sb.AppendLine("}");
                File.WriteAllText(ConfigFilePath, sb.ToString(), Encoding.UTF8);
                AxionStreamerAddOn.Log("[AxionStreamer] 💾 Configurações salvas com sucesso!");
            }
            catch (Exception ex)
            {
                AxionStreamerAddOn.Log($"[AxionStreamer] ❌ Erro ao salvar configurações: {ex.Message}");
            }
        }

        private static string EscapeJson(string str) => (str ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
    }

    // =========================================================================
    // 4. MOTOR OPERACIONAL POR SESSÃO / SLOT (BARSREQUEST + REALTIME)
    // =========================================================================
    public enum SlotStatus
    {
        Stopped,
        Loading,
        Streaming,
        Error
    }

    public class StreamSlotWorker
    {
        public int SlotIndex { get; set; }
        public StreamerSlotConfig Config { get; set; }

        public SlotStatus Status { get; private set; } = SlotStatus.Stopped;
        public string StatusMessage { get; private set; } = "⚪ Parado";
        public string ErrorDetails { get; private set; } = "";

        public int CandlesCount => _streamData != null ? _streamData.Candles.Count : 0;
        public double CurrentPrice => _streamData != null ? _streamData.CurrentPrice : 0.0;
        public int BlockTradesCount => _streamData != null ? _streamData.BlockTrades.Count : 0;
        public int TotalBlockTradesCaptured => _streamData != null ? _streamData.TotalBlockTradesCaptured : 0;
        public DateTime LastUpdateUtc => _streamData != null ? _streamData.LastUpdateUtc : DateTime.MinValue;

        private Instrument _instrument;
        private BarsRequest _barsRequest;
        private AxionAddOnStreamServer.SymbolStreamData _streamData;
        private string _rootSymbol = "";
        private string _resolvedPanel = "";

        // Rastreamento estrito de agressão de mercado (Time & Sales)
        private double _lastAsk = 0;
        private double _lastBid = 0;
        private double _prevLastPrice = 0;
        private string _lastSide = "COMPRA";

        public event Action<StreamSlotWorker> StatusChanged;

        private static string FormatMarketTimestamp(DateTime value)
        {
            // O NinjaTrader já entrega o timestamp no timezone do mercado/configurado.
            // Não forçamos UTC aqui porque isso desloca a barra em 1 hora.
            if (value == DateTime.MinValue || value == DateTime.MaxValue)
            {
                return DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss.fff");
            }

            if (value.Kind == DateTimeKind.Utc)
            {
                return value.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
            }

            return value.ToString("yyyy-MM-ddTHH:mm:ss.fff");
        }

        public StreamSlotWorker(StreamerSlotConfig config)
        {
            Config = config;
            SlotIndex = config.SlotIndex;
        }

        public static string AutoDetectPanel(string sym)
        {
            if (string.IsNullOrEmpty(sym)) return "PAINEL";
            string s = sym.ToUpperInvariant();

            if (s.Contains("NQ") || s.Contains("NAS") || s.Contains("USTEC")) return "NASDAQ";
            if (s.Contains("RTY") || s.Contains("M2K") || s.Contains("RUSSEL")) return "RUSSEL";
            if (s.Contains("ES") || s.Contains("MES") || s.Contains("SP")) return "SP500";
            if (s.Contains("YM") || s.Contains("MYM") || s.Contains("DOW")) return "DOWJONES";
            if (s.Contains("GC") || s.Contains("MGC") || s.Contains("GOLD") || s.Contains("OURO")) return "GOLD";
            if (s.Contains("CL") || s.Contains("MCL") || s.Contains("OIL") || s.Contains("PETR")) return "OIL";
            if (s.Contains("WIN")) return "INDICE_B3";
            if (s.Contains("WDO")) return "DOLAR_B3";

            return s;
        }

        public void Start()
        {
            if (Status == SlotStatus.Streaming || Status == SlotStatus.Loading) return;

            // 🔒 VERIFICAÇÃO DE LICENÇA (WOOCOMMERCE & MÁQUINA)
            if (!AxionStreamerLicenseManager.IsLicensed)
            {
                Status = SlotStatus.Error;
                StatusMessage = "❌ Licença Não Autorizada";
                ErrorDetails = "Valide sua assinatura na aba 'Sobre & Licença' antes de iniciar as transmissões.";
                AxionStreamerAddOn.Log($"[Sessão {SlotIndex + 1}] ❌ Bloqueio de Segurança: Terminal não licenciado.");
                NotifyChange();
                return;
            }

            if (string.IsNullOrWhiteSpace(Config.InstrumentFullName))
            {
                Status = SlotStatus.Error;
                StatusMessage = "❌ Selecione um ativo";
                ErrorDetails = "Nenhum ativo configurado para esta sessão.";
                NotifyChange();
                return;
            }

            _instrument = Instrument.GetInstrument(Config.InstrumentFullName.Trim()) ??
                          Instrument.GetInstrument(Config.InstrumentFullName.Split(' ')[0]);

            if (_instrument == null)
            {
                Status = SlotStatus.Error;
                StatusMessage = "❌ Ativo não encontrado";
                ErrorDetails = $"O ativo '{Config.InstrumentFullName}' não foi localizado no NinjaTrader.";
                NotifyChange();
                return;
            }

            _rootSymbol = _instrument.MasterInstrument?.Name?.ToUpperInvariant() ??
                          _instrument.FullName.Split(' ')[0].ToUpperInvariant();

            _resolvedPanel = string.IsNullOrWhiteSpace(Config.TargetPanel) || Config.TargetPanel.Trim().Equals("Auto", StringComparison.OrdinalIgnoreCase)
                ? AutoDetectPanel(_rootSymbol)
                : Config.TargetPanel.Trim().ToUpperInvariant();

            Status = SlotStatus.Loading;
            StatusMessage = "🟡 Carregando histórico...";
            ErrorDetails = "";
            NotifyChange();

            _lastAsk = 0;
            _lastBid = 0;
            _prevLastPrice = 0;
            _lastSide = "COMPRA";

            int days = Math.Max(1, Config.DaysToLoad);

            _streamData = new AxionAddOnStreamServer.SymbolStreamData
            {
                RootSymbol = _rootSymbol,
                FullInstrument = _instrument.FullName,
                TargetPanel = _resolvedPanel,
                TimeframeMinutes = 1
            };

            try
            {
                DateTime toTime = DateTime.Now;
                DateTime fromTime = toTime.AddDays(-days);

                // Carrega o intervalo completo em dias com barras de 1 minuto mantendo o stream de tempo real ativo
                _barsRequest = new BarsRequest(_instrument, fromTime, toTime)
                {
                    BarsPeriod = new BarsPeriod { BarsPeriodType = BarsPeriodType.Minute, Value = 1 }
                };

                // Forçar sessão 24/7 (ETH / Extended Trading Hours) para que o NinjaTrader nunca descarte barras fora de RTH
                TradingHours ethHours = TradingHours.All.FirstOrDefault(t => t.Name == "Default 24/7")
                    ?? TradingHours.All.FirstOrDefault(t => t.Name == "Default 24/5")
                    ?? TradingHours.All.FirstOrDefault(t => t.Name.Contains("ETH"))
                    ?? _instrument.MasterInstrument?.TradingHours;

                if (ethHours != null)
                {
                    _barsRequest.TradingHours = ethHours;
                }

                _barsRequest.Update += OnBarsUpdate;

                _barsRequest.Request((bRequest, errorCode, errorMessage) =>
                {
                    if (errorCode != ErrorCode.NoError || bRequest == null || bRequest.Bars == null)
                    {
                        Status = SlotStatus.Error;
                        StatusMessage = "❌ Erro ao obter dados";
                        ErrorDetails = errorMessage ?? "Dados de barras vazios ou indisponíveis.";
                        AxionStreamerAddOn.Log($"[Sessão {SlotIndex + 1}] ❌ Erro BarsRequest ({_rootSymbol}): {ErrorDetails}");
                        NotifyChange();
                        return;
                    }

                    var bars = bRequest.Bars;
                    lock (_streamData.DataLock)
                    {
                        _streamData.Candles.Clear();

                        for (int i = 0; i < bars.Count; i++)
                        {
                            DateTime timeMarket = bars.GetTime(i);
                            _streamData.Candles.Add(new AxionAddOnStreamServer.CandleItem
                            {
                                timestamp = FormatMarketTimestamp(timeMarket),
                                open = bars.GetOpen(i),
                                high = bars.GetHigh(i),
                                low = bars.GetLow(i),
                                close = bars.GetClose(i),
                                volume = (long)bars.GetVolume(i)
                            });
                        }

                        if (bars.Count > 0)
                        {
                            int lastIdx = bars.Count - 1;
                            _streamData.CurrentPrice = bars.GetClose(lastIdx);
                            _streamData.CurrentOpen = bars.GetOpen(lastIdx);
                            _streamData.CurrentHigh = bars.GetHigh(lastIdx);
                            _streamData.CurrentLow = bars.GetLow(lastIdx);
                            _streamData.CurrentClose = bars.GetClose(lastIdx);
                            _streamData.CurrentVolume = (long)bars.GetVolume(lastIdx);
                            _streamData.CurrentTimestamp = FormatMarketTimestamp(bars.GetTime(lastIdx));
                            _streamData.LastUpdateUtc = DateTime.UtcNow;
                        }

                        _streamData.MarkCandlesDirty();
                    }

                    // Subscrição a eventos de MarketData em tempo real
                    try
                    {
                        _instrument.Dispatcher.InvokeAsync(() =>
                        {
                            try
                            {
                                _instrument.MarketData.Update -= OnMarketDataUpdate;
                                _instrument.MarketData.Update += OnMarketDataUpdate;
                            }
                            catch { }
                        });
                    }
                    catch { }

                    // Registro no Servidor HTTP Singleton (:8002)
                    AxionAddOnStreamServer.Register(
                        _rootSymbol,
                        _resolvedPanel,
                        _streamData.FullInstrument,
                        1,
                        AxionStreamerConfig.ServerPort,
                        _streamData
                    );

                    Status = SlotStatus.Streaming;
                    StatusMessage = $"🟢 Ao Vivo ({_streamData.Candles.Count:N0} velas)";
                    AxionStreamerAddOn.Log($"[Sessão {SlotIndex + 1}] 🚀 Stream ATIVO: {_rootSymbol} ➔ Painel {_resolvedPanel} ({_streamData.Candles.Count} velas de 1m)");
                    NotifyChange();
                });
            }
            catch (Exception ex)
            {
                Status = SlotStatus.Error;
                StatusMessage = "❌ Exceção na requisição";
                ErrorDetails = ex.Message;
                AxionStreamerAddOn.Log($"[Sessão {SlotIndex + 1}] ❌ Falha: {ex.Message}");
                NotifyChange();
            }
        }

        public void Stop()
        {
            if (Status == SlotStatus.Stopped) return;

            try
            {
                if (_barsRequest != null)
                {
                    _barsRequest.Update -= OnBarsUpdate;
                    _barsRequest = null;
                }
            }
            catch { }

            try
            {
                if (_instrument != null && _instrument.MarketData != null)
                {
                    _instrument.Dispatcher.InvokeAsync(() =>
                    {
                        try { _instrument.MarketData.Update -= OnMarketDataUpdate; } catch { }
                    });
                }
            }
            catch { }

            if (!string.IsNullOrEmpty(_rootSymbol))
            {
                AxionAddOnStreamServer.Unregister(_rootSymbol);
            }

            Status = SlotStatus.Stopped;
            StatusMessage = "⚪ Parado";
            ErrorDetails = "";
            AxionStreamerAddOn.Log($"[Sessão {SlotIndex + 1}] ⏹️ Sessão parada.");
            NotifyChange();
        }

        private void OnBarsUpdate(object sender, BarsUpdateEventArgs e)
        {
            if (_streamData == null || e.BarsSeries == null) return;

            lock (_streamData.DataLock)
            {
                for (int i = e.MinIndex; i <= e.MaxIndex; i++)
                {
                    if (i < 0 || i >= e.BarsSeries.Count) continue;

                    DateTime timeMarket = e.BarsSeries.GetTime(i);
                    string isoTime = FormatMarketTimestamp(timeMarket);
                    double open = e.BarsSeries.GetOpen(i);
                    double high = e.BarsSeries.GetHigh(i);
                    double low = e.BarsSeries.GetLow(i);
                    double close = e.BarsSeries.GetClose(i);
                    long volume = (long)e.BarsSeries.GetVolume(i);

                    if (_streamData.Candles.Count > 0)
                    {
                        var last = _streamData.Candles[_streamData.Candles.Count - 1];
                        if (last.timestamp == isoTime)
                        {
                            last.high = Math.Max(last.high, high);
                            last.low = Math.Min(last.low, low);
                            last.close = close;
                            last.volume = volume;
                        }
                        else
                        {
                            _streamData.Candles.Add(new AxionAddOnStreamServer.CandleItem
                            {
                                timestamp = isoTime,
                                open = open,
                                high = high,
                                low = low,
                                close = close,
                                volume = volume
                            });

                            if (_streamData.Candles.Count > 50000)
                            {
                                _streamData.Candles.RemoveAt(0);
                            }
                        }
                    }
                    else
                    {
                        _streamData.Candles.Add(new AxionAddOnStreamServer.CandleItem
                        {
                            timestamp = isoTime,
                            open = open,
                            high = high,
                            low = low,
                            close = close,
                            volume = volume
                        });
                    }

                    _streamData.CurrentPrice = close;
                    _streamData.CurrentOpen = open;
                    _streamData.CurrentHigh = high;
                    _streamData.CurrentLow = low;
                    _streamData.CurrentClose = close;
                    _streamData.CurrentVolume = volume;
                    _streamData.CurrentTimestamp = isoTime;
                    _streamData.LastUpdateUtc = DateTime.UtcNow;
                    _streamData.MarkCandlesDirty();

                    AxionAddOnStreamServer.BroadcastWebSocket(
                        $"{{\"type\":\"bar\",\"symbol\":\"{_streamData.RootSymbol}\",\"panel\":\"{_streamData.TargetPanel}\"," +
                        $"\"price\":{_streamData.CurrentPrice.ToString("F2", CultureInfo.InvariantCulture)}," +
                        $"\"open\":{_streamData.CurrentOpen.ToString("F2", CultureInfo.InvariantCulture)}," +
                        $"\"high\":{_streamData.CurrentHigh.ToString("F2", CultureInfo.InvariantCulture)}," +
                        $"\"low\":{_streamData.CurrentLow.ToString("F2", CultureInfo.InvariantCulture)}," +
                        $"\"close\":{_streamData.CurrentClose.ToString("F2", CultureInfo.InvariantCulture)}," +
                        $"\"volume\":{_streamData.CurrentVolume}," +
                        $"\"timestamp\":\"{_streamData.CurrentTimestamp}\",\"updated_at\":\"{_streamData.LastUpdateUtc:o}\"}}"
                    );
                }
            }

            NotifyChange();
        }

        private void OnMarketDataUpdate(object sender, MarketDataEventArgs e)
        {
            if (_streamData == null) return;

            // 1. Rastreamento contínuo das cotações de Bid e Ask do Book para determinação precisa de agressão (T&S)
            if (e.MarketDataType == MarketDataType.Ask)
            {
                if (e.Price > 0) _lastAsk = e.Price;
                return;
            }
            if (e.MarketDataType == MarketDataType.Bid)
            {
                if (e.Price > 0) _lastBid = e.Price;
                return;
            }

            if (e.MarketDataType == MarketDataType.Last)
            {
                _streamData.CurrentPrice = e.Price;
                _streamData.LastUpdateUtc = DateTime.UtcNow;

                // Atualizar barra de 1m corrente diretamente a partir dos ticks de mercado do NT8
                lock (_streamData.DataLock)
                {
                    DateTime nowMarket = DateTime.Now;
                    DateTime minuteMarket = new DateTime(nowMarket.Year, nowMarket.Month, nowMarket.Day, nowMarket.Hour, nowMarket.Minute, 0, DateTimeKind.Unspecified);
                    string isoMinute = FormatMarketTimestamp(minuteMarket);

                    if (_streamData.Candles.Count > 0)
                    {
                        var last = _streamData.Candles[_streamData.Candles.Count - 1];
                        if (last.timestamp == isoMinute)
                        {
                            last.high = Math.Max(last.high, e.Price);
                            last.low = Math.Min(last.low, e.Price);
                            last.close = e.Price;
                            last.volume += (long)e.Volume;
                        }
                        else if (string.Compare(last.timestamp, isoMinute) < 0)
                        {
                            _streamData.Candles.Add(new AxionAddOnStreamServer.CandleItem
                            {
                                timestamp = isoMinute,
                                open = e.Price,
                                high = e.Price,
                                low = e.Price,
                                close = e.Price,
                                volume = (long)e.Volume
                            });
                            if (_streamData.Candles.Count > 50000) _streamData.Candles.RemoveAt(0);
                        }
                    }
                    _streamData.MarkCandlesDirty();
                }

                AxionAddOnStreamServer.BroadcastWebSocket(
                    $"{{\"type\":\"market_data\",\"symbol\":\"{_streamData.RootSymbol}\",\"panel\":\"{_streamData.TargetPanel}\"," +
                    $"\"price\":{_streamData.CurrentPrice.ToString("F2", CultureInfo.InvariantCulture)}," +
                    $"\"volume\":{_streamData.CurrentVolume}," +
                    $"\"updated_at\":\"{_streamData.LastUpdateUtc:o}\"}}"
                );

                long vol = (long)e.Volume;
                if (vol >= Config.BlockTradeThreshold)
                {
                    // Determinação rigorosa da agressão idêntica ao Time & Sales (T&S) do NinjaTrader 8:
                    // 1. Preço no Ask ou acima -> COMPRA (Buyer Agression)
                    // 2. Preço no Bid ou abaixo -> VENDA (Seller Agression)
                    // 3. Dentro do spread -> Regra do Tick (Uptick = COMPRA, Downtick = VENDA)
                    string side = "COMPRA";
                    if (_lastAsk > 0 && e.Price >= _lastAsk)
                    {
                        side = "COMPRA";
                    }
                    else if (_lastBid > 0 && e.Price <= _lastBid)
                    {
                        side = "VENDA";
                    }
                    else if (_prevLastPrice > 0)
                    {
                        if (e.Price > _prevLastPrice) side = "COMPRA";
                        else if (e.Price < _prevLastPrice) side = "VENDA";
                        else side = _lastSide;
                    }

                    var trade = new AxionAddOnStreamServer.BlockTradeItem
                    {
                        time = DateTime.Now.ToString("HH:mm:ss"),
                        price = e.Price,
                        volume = vol,
                        side = side
                    };

                    lock (_streamData.DataLock)
                    {
                        bool isDuplicate = false;
                        if (_streamData.BlockTrades.Count > 0)
                        {
                            var prev = _streamData.BlockTrades[_streamData.BlockTrades.Count - 1];
                            if (prev.time == trade.time && Math.Abs(prev.price - trade.price) < 0.0001 && prev.volume == trade.volume && prev.side == trade.side)
                            {
                                isDuplicate = true;
                            }
                        }

                        if (!isDuplicate)
                        {
                            _streamData.BlockTrades.Add(trade);
                            _streamData.TotalBlockTradesCaptured++;
                            if (_streamData.BlockTrades.Count > 500)
                            {
                                _streamData.BlockTrades.RemoveAt(0);
                            }
                        }
                    }

                    AxionAddOnStreamServer.BroadcastWebSocket(
                        $"{{\"type\":\"block_trade\",\"symbol\":\"{_streamData.RootSymbol}\",\"panel\":\"{_streamData.TargetPanel}\"," +
                        $"\"time\":\"{trade.time}\",\"price\":{trade.price.ToString("F2", CultureInfo.InvariantCulture)}," +
                        $"\"volume\":{trade.volume},\"side\":\"{trade.side}\"}}"
                    );

                    NotifyChange();
                }

                if (e.Price > 0)
                {
                    _prevLastPrice = e.Price;
                }
            }
        }

        private void NotifyChange()
        {
            try
            {
                StatusChanged?.Invoke(this);
            }
            catch { }
        }
    }

    // =========================================================================
    // 4.1 MOTOR GLOBAL DO STREAMER (SINGLETON / BACKGROUND ENGINE)
    // =========================================================================
    public static class AxionStreamerEngine
    {
        private static readonly List<StreamSlotWorker> _workers = new List<StreamSlotWorker>();
        private static readonly object _lock = new object();
        private static bool _initialized = false;

        public static List<StreamSlotWorker> Workers
        {
            get
            {
                EnsureInitialized();
                return _workers;
            }
        }

        public static void EnsureInitialized()
        {
            lock (_lock)
            {
                if (_initialized) return;
                AxionStreamerConfig.Load();
                AxionStreamerLicenseManager.Inicializar();

                _workers.Clear();
                foreach (var slotCfg in AxionStreamerConfig.Slots)
                {
                    var worker = new StreamSlotWorker(slotCfg);
                    _workers.Add(worker);
                }
                _initialized = true;
            }
        }

        public static void StartAll()
        {
            EnsureInitialized();
            if (!AxionStreamerLicenseManager.IsLicensed)
            {
                AxionStreamerAddOn.Log("[AxionStreamer] Não foi possível iniciar transmissões automáticas: Terminal não licenciado.");
                return;
            }

            foreach (var w in _workers)
            {
                if (w.Status != SlotStatus.Streaming && w.Status != SlotStatus.Loading)
                {
                    if (!string.IsNullOrEmpty(w.Config.InstrumentFullName))
                    {
                        w.Start();
                    }
                }
            }
        }

        public static void StopAll()
        {
            EnsureInitialized();
            foreach (var w in _workers)
            {
                try
                {
                    w.Stop();
                }
                catch { }
            }
        }
    }

    // =========================================================================
    // 5. JANELA DE CONTROLE WPF / NTWINDOW COM ABAS (TRANSMISSOR & LICENÇA)
    // =========================================================================
    public class AxionStreamerWindow : NTWindow
    {
        private readonly List<StreamSlotWorker> _workers;
        private readonly List<SlotCardUi> _cardUis = new List<SlotCardUi>();
        private TextBox _txtLogs;
        private TextBlock _tbServerStatus;
        private TextBlock _tbLicenseHeaderBadge;
        private CheckBox _chkAutoStart;

        private class SlotCardUi
        {
            public StreamSlotWorker Worker;
            public InstrumentSelector InstSelector;
            public TextBox FallbackInstText;
            public ComboBox CmbPanel;
            public ComboBox CmbDays;
            public TextBox TxtBlockTrade;
            public Border StatusBadge;
            public TextBlock TbStatus;
            public TextBlock TbMetrics;
            public Button BtnToggle;
        }

        public AxionStreamerWindow()
        {
            Title = "📡 Axion Data Streamer — Multi-Asset Engine & Licenciamento";
            Width = 920;
            Height = 780;
            MinWidth = 820;
            MinHeight = 620;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            Background = new SolidColorBrush(Color.FromRgb(11, 14, 20));
            Foreground = Brushes.White;

            AxionStreamerEngine.EnsureInitialized();
            _workers = AxionStreamerEngine.Workers;

            foreach (var worker in _workers)
            {
                worker.StatusChanged += OnWorkerStatusChanged;
            }

            var tabControl = new TabControl
            {
                Background = new SolidColorBrush(Color.FromRgb(15, 23, 42)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                Foreground = Brushes.White,
                Margin = new Thickness(10)
            };

            // Aba 1: Transmissor Multi-Asset
            tabControl.Items.Add(new TabItem { Header = "📡 Transmissor (Multi-Asset)", Content = BuildStreamerTab() });

            // Aba 2: Sobre a Empresa & Licença WooCommerce
            tabControl.Items.Add(new TabItem { Header = "🏢 Sobre & Licença", Content = BuildAboutLicenseTab() });

            Content = tabControl;

            AxionStreamerAddOn.RegisterLogger(AppendLog);

            if (!AxionAddOnStreamServer.IsRunning)
            {
                AxionAddOnStreamServer.StartServer(AxionStreamerConfig.ServerPort);
            }
            UpdateServerStatusText();
            UpdateHeaderLicenseBadge();

            if (AxionStreamerConfig.AutoStartAllOnOpen && AxionStreamerLicenseManager.IsLicensed)
            {
                Dispatcher.InvokeAsync(StartAllStreams);
            }
        }

        private UIElement BuildStreamerTab()
        {
            var mainGrid = new Grid();
            mainGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // Header
            mainGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) }); // Slots
            mainGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(130) }); // Logs & Footer

            // 1. HEADER
            var headerBorder = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(15, 23, 42)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                BorderThickness = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(16, 12, 16, 12)
            };

            var headerStack = new StackPanel();

            var topRow = new Grid();
            topRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            topRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var titleStack = new StackPanel();
            var title = new TextBlock
            {
                Text = "📡 AXION DATA STREAMER v2.0",
                FontSize = 18,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(56, 189, 248))
            };
            var subtitle = new TextBlock
            {
                Text = "Alimente múltiplos painéis Vortex Web em segundo plano sem precisar abrir nenhum gráfico no NinjaTrader.",
                FontSize = 11,
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                Margin = new Thickness(0, 2, 0, 0)
            };
            titleStack.Children.Add(title);
            titleStack.Children.Add(subtitle);
            Grid.SetColumn(titleStack, 0);
            topRow.Children.Add(titleStack);

            var globalButtons = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };

            var btnStartAll = new Button
            {
                Content = "🚀 Iniciar Todos",
                Background = new SolidColorBrush(Color.FromRgb(5, 150, 105)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.SemiBold,
                Padding = new Thickness(12, 6, 12, 6),
                Margin = new Thickness(0, 0, 8, 0),
                Cursor = Cursors.Hand
            };
            btnStartAll.Click += (s, e) => StartAllStreams();

            var btnStopAll = new Button
            {
                Content = "⏹️ Parar Todos",
                Background = new SolidColorBrush(Color.FromRgb(220, 38, 38)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.SemiBold,
                Padding = new Thickness(12, 6, 12, 6),
                Margin = new Thickness(0, 0, 8, 0),
                Cursor = Cursors.Hand
            };
            btnStopAll.Click += (s, e) => StopAllStreams();

            var btnSave = new Button
            {
                Content = "💾 Salvar",
                Background = new SolidColorBrush(Color.FromRgb(37, 99, 235)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.SemiBold,
                Padding = new Thickness(12, 6, 12, 6),
                Cursor = Cursors.Hand
            };
            btnSave.Click += (s, e) => SaveAllSettings();

            globalButtons.Children.Add(btnStartAll);
            globalButtons.Children.Add(btnStopAll);
            globalButtons.Children.Add(btnSave);
            Grid.SetColumn(globalButtons, 1);
            topRow.Children.Add(globalButtons);

            headerStack.Children.Add(topRow);

            var statusRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 8, 0, 0) };
            _tbServerStatus = new TextBlock
            {
                Text = "🟢 Servidor HTTP: Online (Porta 8002)",
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(52, 211, 153)),
                Margin = new Thickness(0, 0, 16, 0),
                Cursor = Cursors.Hand,
                ToolTip = "Clique para verificar/iniciar o Servidor HTTP/WebSocket na porta 8002"
            };
            _tbServerStatus.MouseLeftButtonUp += (s, e) =>
            {
                AxionAddOnStreamServer.StartServer(AxionStreamerConfig.ServerPort);
                UpdateServerStatusText();
            };
            statusRow.Children.Add(_tbServerStatus);

            _tbLicenseHeaderBadge = new TextBlock
            {
                Text = "🔒 Licença: Verificando...",
                FontSize = 11,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(251, 191, 36)),
                Margin = new Thickness(0, 0, 16, 0)
            };
            statusRow.Children.Add(_tbLicenseHeaderBadge);

            _chkAutoStart = new CheckBox
            {
                Content = "Iniciar automaticamente ao abrir o NinjaTrader",
                Foreground = new SolidColorBrush(Color.FromRgb(203, 213, 225)),
                FontSize = 11,
                IsChecked = AxionStreamerConfig.AutoStartAllOnOpen,
                VerticalAlignment = VerticalAlignment.Center
            };
            _chkAutoStart.Checked += (s, e) => { AxionStreamerConfig.AutoStartAllOnOpen = true; AxionStreamerConfig.Save(); };
            _chkAutoStart.Unchecked += (s, e) => { AxionStreamerConfig.AutoStartAllOnOpen = false; AxionStreamerConfig.Save(); };
            statusRow.Children.Add(_chkAutoStart);

            headerStack.Children.Add(statusRow);
            headerBorder.Child = headerStack;
            Grid.SetRow(headerBorder, 0);
            mainGrid.Children.Add(headerBorder);

            // 2. CORPO COM OS 6 SLOTS
            var scrollViewer = new ScrollViewer
            {
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                Padding = new Thickness(16, 12, 16, 12)
            };

            var slotsPanel = new StackPanel();
            for (int i = 0; i < _workers.Count; i++)
            {
                slotsPanel.Children.Add(CreateSlotCard(_workers[i]));
            }
            scrollViewer.Content = slotsPanel;
            Grid.SetRow(scrollViewer, 1);
            mainGrid.Children.Add(scrollViewer);

            // 3. FOOTER & LOGS
            var footerBorder = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(15, 23, 42)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                BorderThickness = new Thickness(0, 1, 0, 0),
                Padding = new Thickness(16, 8, 16, 8)
            };

            var footerGrid = new Grid();
            footerGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            footerGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

            var footerTop = new Grid();
            footerTop.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            footerTop.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var logLabel = new TextBlock
            {
                Text = "📜 Registro de Atividades & Auditoria",
                FontSize = 11,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184))
            };
            Grid.SetColumn(logLabel, 0);
            footerTop.Children.Add(logLabel);

            var btnTestUrl = new Button
            {
                Content = "🌐 Testar no Navegador (http://localhost:8002/status)",
                Background = Brushes.Transparent,
                Foreground = new SolidColorBrush(Color.FromRgb(56, 189, 248)),
                BorderThickness = new Thickness(0),
                Cursor = Cursors.Hand,
                FontSize = 11
            };
            btnTestUrl.Click += (s, e) =>
            {
                try
                {
                    Process.Start(new ProcessStartInfo($"http://localhost:{AxionStreamerConfig.ServerPort}/status") { UseShellExecute = true });
                }
                catch { }
            };
            Grid.SetColumn(btnTestUrl, 1);
            footerTop.Children.Add(btnTestUrl);

            Grid.SetRow(footerTop, 0);
            footerGrid.Children.Add(footerTop);

            _txtLogs = new TextBox
            {
                IsReadOnly = true,
                Background = new SolidColorBrush(Color.FromRgb(2, 6, 23)),
                Foreground = new SolidColorBrush(Color.FromRgb(226, 232, 240)),
                FontFamily = new FontFamily("Consolas"),
                FontSize = 11,
                BorderBrush = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                Margin = new Thickness(0, 4, 0, 0),
                TextWrapping = TextWrapping.Wrap
            };
            Grid.SetRow(_txtLogs, 1);
            footerGrid.Children.Add(_txtLogs);

            footerBorder.Child = footerGrid;
            Grid.SetRow(footerBorder, 2);
            mainGrid.Children.Add(footerBorder);

            return mainGrid;
        }

        private Border CreateSlotCard(StreamSlotWorker worker)
        {
            var cardUi = new SlotCardUi { Worker = worker };

            var card = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(19, 27, 46)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(6),
                Padding = new Thickness(12),
                Margin = new Thickness(0, 0, 0, 10)
            };

            var stack = new StackPanel();

            var headerRow = new Grid();
            headerRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            headerRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            headerRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var titlePanel = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
            var sessionName = new TextBlock
            {
                Text = $"SESSÃO #{worker.SlotIndex + 1}",
                FontSize = 13,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(56, 189, 248)),
                Margin = new Thickness(0, 0, 10, 0)
            };
            titlePanel.Children.Add(sessionName);

            cardUi.StatusBadge = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(8, 2, 8, 2)
            };
            cardUi.TbStatus = new TextBlock
            {
                Text = worker.StatusMessage,
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184))
            };
            cardUi.StatusBadge.Child = cardUi.TbStatus;
            titlePanel.Children.Add(cardUi.StatusBadge);

            Grid.SetColumn(titlePanel, 0);
            headerRow.Children.Add(titlePanel);

            cardUi.TbMetrics = new TextBlock
            {
                Text = "📊 0 velas | ⚡ Preço: -- | 🕒 Atualizado: --",
                FontSize = 11,
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(16, 0, 0, 0)
            };
            Grid.SetColumn(cardUi.TbMetrics, 1);
            headerRow.Children.Add(cardUi.TbMetrics);

            cardUi.BtnToggle = new Button
            {
                Content = "▶ Iniciar",
                Background = new SolidColorBrush(Color.FromRgb(5, 150, 105)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.Bold,
                Padding = new Thickness(14, 4, 14, 4),
                Cursor = Cursors.Hand
            };
            cardUi.BtnToggle.Click += (s, e) => ToggleSlot(cardUi);
            Grid.SetColumn(cardUi.BtnToggle, 2);
            headerRow.Children.Add(cardUi.BtnToggle);

            stack.Children.Add(headerRow);

            var configRow = new WrapPanel { Margin = new Thickness(0, 10, 0, 0), VerticalAlignment = VerticalAlignment.Center };

            configRow.Children.Add(new TextBlock
            {
                Text = "Ativo:",
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                Foreground = Brushes.White,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 6, 0)
            });

            try
            {
                cardUi.InstSelector = new InstrumentSelector
                {
                    Height = 26,
                    MinWidth = 180,
                    Margin = new Thickness(0, 0, 14, 0)
                };

                if (!string.IsNullOrEmpty(worker.Config.InstrumentFullName))
                {
                    var savedInst = Instrument.GetInstrument(worker.Config.InstrumentFullName);
                    if (savedInst != null) cardUi.InstSelector.Instrument = savedInst;
                }

                cardUi.InstSelector.InstrumentChanged += (sender, e) =>
                {
                    if (cardUi.InstSelector.Instrument != null)
                    {
                        worker.Config.InstrumentFullName = cardUi.InstSelector.Instrument.FullName;
                        string root = cardUi.InstSelector.Instrument.MasterInstrument?.Name ?? worker.Config.InstrumentFullName;

                        if (string.IsNullOrEmpty(worker.Config.TargetPanel) || worker.Config.TargetPanel == "Auto")
                        {
                            string suggested = StreamSlotWorker.AutoDetectPanel(root);
                            cardUi.CmbPanel.Text = suggested;
                            worker.Config.TargetPanel = suggested;
                        }
                    }
                };

                configRow.Children.Add(cardUi.InstSelector);
            }
            catch
            {
                cardUi.FallbackInstText = new TextBox
                {
                    Text = worker.Config.InstrumentFullName,
                    Height = 26,
                    Width = 160,
                    Background = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                    Foreground = Brushes.White,
                    Margin = new Thickness(0, 0, 14, 0)
                };
                cardUi.FallbackInstText.TextChanged += (s, e) =>
                {
                    worker.Config.InstrumentFullName = cardUi.FallbackInstText.Text.Trim();
                };
                configRow.Children.Add(cardUi.FallbackInstText);
            }

            configRow.Children.Add(new TextBlock
            {
                Text = "Painel Vortex:",
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                Foreground = Brushes.White,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 6, 0)
            });

            cardUi.CmbPanel = new ComboBox
            {
                IsEditable = true,
                Height = 26,
                Width = 120,
                Margin = new Thickness(0, 0, 14, 0),
                Background = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.SemiBold,
                VerticalContentAlignment = VerticalAlignment.Center
            };
            var panels = new[] { "Auto", "NASDAQ", "RUSSEL", "SP500", "DOWJONES", "GOLD", "OIL", "INDICE_B3", "DOLAR_B3" };
            foreach (var p in panels) cardUi.CmbPanel.Items.Add(p);
            cardUi.CmbPanel.Text = !string.IsNullOrEmpty(worker.Config.TargetPanel) ? worker.Config.TargetPanel : "Auto";
            cardUi.CmbPanel.LostFocus += (s, e) => { worker.Config.TargetPanel = cardUi.CmbPanel.Text.Trim(); };
            configRow.Children.Add(cardUi.CmbPanel);

            configRow.Children.Add(new TextBlock
            {
                Text = "Histórico:",
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                Foreground = Brushes.White,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 6, 0)
            });

            cardUi.CmbDays = new ComboBox
            {
                IsEditable = true,
                Height = 26,
                Width = 90,
                Margin = new Thickness(0, 0, 14, 0),
                Background = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.SemiBold,
                VerticalContentAlignment = VerticalAlignment.Center,
                HorizontalContentAlignment = HorizontalAlignment.Center
            };
            var daysOptions = new[] { 1, 2, 3, 5, 7, 10, 15, 30, 60 };
            foreach (var d in daysOptions) cardUi.CmbDays.Items.Add($"{d} dias");
            int selectedDays = worker.Config.DaysToLoad > 0 ? worker.Config.DaysToLoad : 5;
            string selectedStr = $"{selectedDays} dias";
            cardUi.CmbDays.SelectedItem = selectedStr;
            cardUi.CmbDays.Text = selectedStr;

            cardUi.CmbDays.SelectionChanged += (s, e) =>
            {
                if (cardUi.CmbDays.SelectedItem != null)
                {
                    string txt = cardUi.CmbDays.SelectedItem.ToString();
                    var match = Regex.Match(txt, "(\\d+)");
                    if (match.Success && int.TryParse(match.Groups[1].Value, out int dVal))
                    {
                        worker.Config.DaysToLoad = dVal;
                        cardUi.CmbDays.Text = $"{dVal} dias";
                    }
                }
            };

            cardUi.CmbDays.LostFocus += (s, e) =>
            {
                string txt = cardUi.CmbDays.Text;
                var match = Regex.Match(txt ?? "", "(\\d+)");
                if (match.Success && int.TryParse(match.Groups[1].Value, out int dVal))
                {
                    worker.Config.DaysToLoad = dVal;
                    cardUi.CmbDays.Text = $"{dVal} dias";
                }
            };
            configRow.Children.Add(cardUi.CmbDays);

            configRow.Children.Add(new TextBlock
            {
                Text = "Block Trade (≥):",
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                Foreground = Brushes.White,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 6, 0)
            });

            cardUi.TxtBlockTrade = new TextBox
            {
                Text = worker.Config.BlockTradeThreshold.ToString(),
                Height = 26,
                Width = 55,
                Margin = new Thickness(0, 0, 14, 0),
                Background = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                Foreground = Brushes.White,
                VerticalContentAlignment = VerticalAlignment.Center,
                HorizontalContentAlignment = HorizontalAlignment.Center
            };
            cardUi.TxtBlockTrade.TextChanged += (s, e) =>
            {
                if (int.TryParse(cardUi.TxtBlockTrade.Text, out int btVal) && btVal > 0)
                {
                    worker.Config.BlockTradeThreshold = btVal;
                }
            };
            configRow.Children.Add(cardUi.TxtBlockTrade);

            stack.Children.Add(configRow);
            card.Child = stack;

            _cardUis.Add(cardUi);
            OnWorkerStatusChanged(worker);
            return card;
        }

        private UIElement BuildAboutLicenseTab()
        {
            var scroll = new ScrollViewer
            {
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled
            };

            var mainPanel = new StackPanel { Margin = new Thickness(15) };

            // 1. CARD DA EMPRESA E PROPRIEDADE INTELECTUAL
            var companyCard = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(19, 27, 46)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(56, 189, 248)),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(15),
                Margin = new Thickness(0, 0, 0, 12)
            };

            var companyStack = new StackPanel();
            companyStack.Children.Add(new TextBlock
            {
                Text = $"🏢 {AxionStreamerLicenseManager.EmpresaRazaoSocial}",
                FontSize = 14,
                FontWeight = FontWeights.ExtraBold,
                Foreground = new SolidColorBrush(Color.FromRgb(56, 189, 248)),
                Margin = new Thickness(0, 0, 0, 6)
            });

            companyStack.Children.Add(new TextBlock
            {
                Text = $"📄 CNPJ: {AxionStreamerLicenseManager.EmpresaCnpj}\n" +
                       $"🌐 Plataforma & Loja Oficial: {AxionStreamerLicenseManager.EmpresaDominio}\n" +
                       $"⚡ Software: {AxionStreamerLicenseManager.SoftwareVersao}\n" +
                       $"🔒 {AxionStreamerLicenseManager.CopyrightText}",
                FontSize = 11,
                Foreground = new SolidColorBrush(Color.FromRgb(203, 213, 225)),
                LineHeight = 18
            });

            companyStack.Children.Add(new TextBlock
            {
                Text = "ℹ️ Este software é protegido pela Lei de Direitos Autorais e Propriedade Intelectual (Lei nº 9.609/98). " +
                       "O uso é estritamente pessoal e intransferível, condicionado à assinatura ativa vinculada ao Machine ID deste computador.",
                FontSize = 10,
                FontStyle = FontStyles.Italic,
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 8, 0, 0)
            });

            companyCard.Child = companyStack;
            mainPanel.Children.Add(companyCard);

            // 2. CARD DO MACHINE ID DO NINJATRADER 8
            var machineCard = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(15, 23, 42)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(15),
                Margin = new Thickness(0, 0, 0, 12)
            };

            var machineStack = new StackPanel();
            machineStack.Children.Add(new TextBlock
            {
                Text = "💻 IDENTIFICAÇÃO DESTE COMPUTADOR (NINJATRADER 8)",
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(251, 191, 36)),
                Margin = new Thickness(0, 0, 0, 4)
            });

            machineStack.Children.Add(new TextBlock
            {
                Text = "Copie o Machine ID abaixo e informe no cadastro da sua assinatura na loja ou no suporte para liberação deste terminal:",
                FontSize = 11,
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 0, 0, 8)
            });

            var machineGrid = new Grid();
            machineGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            machineGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(8) });
            machineGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var txtMachineId = new TextBox
            {
                Text = AxionStreamerLicenseManager.CurrentMachineId,
                IsReadOnly = true,
                FontFamily = new FontFamily("Consolas"),
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Background = new SolidColorBrush(Color.FromRgb(11, 14, 20)),
                Foreground = new SolidColorBrush(Color.FromRgb(251, 191, 36)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(51, 65, 85)),
                Padding = new Thickness(8, 6, 8, 6)
            };
            Grid.SetColumn(txtMachineId, 0);
            machineGrid.Children.Add(txtMachineId);

            var btnCopyMachine = new Button
            {
                Content = "📋 Copiar Machine ID",
                Background = new SolidColorBrush(Color.FromRgb(37, 99, 235)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.Bold,
                Padding = new Thickness(12, 6, 12, 6),
                Cursor = Cursors.Hand
            };
            btnCopyMachine.Click += (s, e) =>
            {
                try
                {
                    Clipboard.SetText(AxionStreamerLicenseManager.CurrentMachineId);
                    MessageBox.Show($"Machine ID copiado com sucesso para a Área de Transferência:\n\n{AxionStreamerLicenseManager.CurrentMachineId}\n\nCole no campo 'id_nt' ou nos detalhes do pedido na loja.", "Machine ID Copiado", MessageBoxButton.OK, MessageBoxImage.Information);
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Erro ao copiar: {ex.Message}", "Erro", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            };
            Grid.SetColumn(btnCopyMachine, 2);
            machineGrid.Children.Add(btnCopyMachine);

            machineStack.Children.Add(machineGrid);
            machineCard.Child = machineStack;
            mainPanel.Children.Add(machineCard);

            // 3. CARD DE STATUS DA LICENÇA EM TEMPO REAL
            var statusCard = new Border
            {
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(15),
                Margin = new Thickness(0, 0, 0, 12)
            };

            var statusStack = new StackPanel();
            var txtStatusTitle = new TextBlock
            {
                FontSize = 13,
                FontWeight = FontWeights.ExtraBold,
                Margin = new Thickness(0, 0, 0, 4)
            };
            statusStack.Children.Add(txtStatusTitle);

            var txtStatusMsg = new TextBlock
            {
                FontSize = 11,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 0, 0, 4)
            };
            statusStack.Children.Add(txtStatusMsg);

            var txtStatusDetails = new TextBlock
            {
                FontSize = 10,
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184))
            };
            statusStack.Children.Add(txtStatusDetails);

            statusCard.Child = statusStack;

            Action updateStatusVisual = () =>
            {
                bool isOk = AxionStreamerLicenseManager.IsLicensed;
                if (isOk)
                {
                    statusCard.Background = new SolidColorBrush(Color.FromRgb(6, 78, 59));
                    statusCard.BorderBrush = new SolidColorBrush(Color.FromRgb(16, 185, 129));
                    statusCard.BorderThickness = new Thickness(1.5);
                    txtStatusTitle.Text = "🟢 LICENÇA ATIVA E AUTORIZADA";
                    txtStatusTitle.Foreground = new SolidColorBrush(Color.FromRgb(52, 211, 153));
                    txtStatusMsg.Text = "Licença validada e autorizada para este terminal.";
                    txtStatusMsg.Foreground = Brushes.White;
                    txtStatusDetails.Text = "Terminal sincronizado com o NinjaTrader 8 e liberado para streaming.";
                }
                else
                {
                    statusCard.Background = new SolidColorBrush(Color.FromRgb(76, 5, 25));
                    statusCard.BorderBrush = new SolidColorBrush(Color.FromRgb(244, 63, 94));
                    statusCard.BorderThickness = new Thickness(1.5);
                    txtStatusTitle.Text = "🔴 LICENÇA NÃO AUTORIZADA";
                    txtStatusTitle.Foreground = new SolidColorBrush(Color.FromRgb(251, 113, 133));
                    txtStatusMsg.Text = "Terminal não liberado. Informe seu ID de Assinatura abaixo para ativar.";
                    txtStatusMsg.Foreground = new SolidColorBrush(Color.FromRgb(254, 205, 211));
                    txtStatusDetails.Text = "A transmissão de candles e market data está pausada até a ativação.";
                }

                UpdateHeaderLicenseBadge();
            };

            updateStatusVisual();
            AxionStreamerLicenseManager.OnLicenseStatusChanged = () =>
            {
                Dispatcher.InvokeAsync(updateStatusVisual);
            };

            mainPanel.Children.Add(statusCard);

            // 4. CARD DE CONFIGURAÇÃO E ATIVAÇÃO DA ASSINATURA WOOCOMMERCE
            var configCard = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(15, 23, 42)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(15)
            };

            var configStack = new StackPanel();
            configStack.Children.Add(new TextBlock
            {
                Text = "🔑 VINCULAR ASSINATURA WOOCOMMERCE",
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                Margin = new Thickness(0, 0, 0, 6)
            });

            configStack.Children.Add(new TextBlock
            {
                Text = "Número / ID da Assinatura ou Pedido:",
                FontSize = 11,
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                Margin = new Thickness(0, 0, 0, 4)
            });

            var txtSubId = new TextBox
            {
                Text = AxionStreamerConfig.IdAssinatura,
                FontFamily = new FontFamily("Consolas"),
                FontSize = 13,
                FontWeight = FontWeights.Bold,
                Background = new SolidColorBrush(Color.FromRgb(11, 14, 20)),
                Foreground = Brushes.White,
                BorderBrush = new SolidColorBrush(Color.FromRgb(51, 65, 85)),
                Padding = new Thickness(8, 6, 8, 6),
                Margin = new Thickness(0, 0, 0, 12)
            };
            configStack.Children.Add(txtSubId);

            var btnGrid = new Grid();
            btnGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            btnGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(8) });
            btnGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(120) });

            var btnValidate = new Button
            {
                Content = "🔄 Validar Licença Online",
                Background = new SolidColorBrush(Color.FromRgb(16, 185, 129)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.Bold,
                Padding = new Thickness(10),
                Cursor = Cursors.Hand
            };
            btnValidate.Click += async (s, e) =>
            {
                string idDig = txtSubId.Text.Trim();
                if (string.IsNullOrEmpty(idDig))
                {
                    MessageBox.Show("Por favor, informe o número da sua Assinatura ou Pedido.", "Aviso", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }

                btnValidate.IsEnabled = false;
                btnValidate.Content = "⏳ Validando...";

                var resultado = await Task.Run(() => AxionStreamerLicenseManager.ValidarOnline(idDig));

                btnValidate.IsEnabled = true;
                btnValidate.Content = "🔄 Validar Licença Online";
                updateStatusVisual();

                if (resultado.Sucesso)
                {
                    MessageBox.Show(resultado.Mensagem, "Licença Autorizada", MessageBoxButton.OK, MessageBoxImage.Information);
                }
                else
                {
                    MessageBox.Show(resultado.Mensagem, "Aviso de Validação", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            };
            Grid.SetColumn(btnValidate, 0);
            btnGrid.Children.Add(btnValidate);

            var btnSaveId = new Button
            {
                Content = "💾 Salvar ID",
                Background = new SolidColorBrush(Color.FromRgb(51, 65, 85)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.Bold,
                Padding = new Thickness(10),
                Cursor = Cursors.Hand
            };
            btnSaveId.Click += (s, e) =>
            {
                AxionStreamerConfig.IdAssinatura = txtSubId.Text.Trim();
                AxionStreamerConfig.Save();
                MessageBox.Show("ID da Assinatura salvo com sucesso!", "Salvo", MessageBoxButton.OK, MessageBoxImage.Information);
            };
            Grid.SetColumn(btnSaveId, 2);
            btnGrid.Children.Add(btnSaveId);

            configStack.Children.Add(btnGrid);
            configCard.Child = configStack;
            mainPanel.Children.Add(configCard);

            scroll.Content = mainPanel;
            return scroll;
        }

        private void ToggleSlot(SlotCardUi cardUi)
        {
            if (cardUi.InstSelector != null && cardUi.InstSelector.Instrument != null)
            {
                cardUi.Worker.Config.InstrumentFullName = cardUi.InstSelector.Instrument.FullName;
            }
            else if (cardUi.FallbackInstText != null)
            {
                cardUi.Worker.Config.InstrumentFullName = cardUi.FallbackInstText.Text.Trim();
            }

            cardUi.Worker.Config.TargetPanel = cardUi.CmbPanel.Text.Trim();

            if (cardUi.Worker.Status == SlotStatus.Streaming || cardUi.Worker.Status == SlotStatus.Loading)
            {
                cardUi.Worker.Stop();
            }
            else
            {
                cardUi.Worker.Start();
            }
        }

        private void StartAllStreams()
        {
            if (!AxionStreamerLicenseManager.IsLicensed)
            {
                MessageBox.Show("Terminal não licenciado. Informe seu ID de Assinatura na aba 'Sobre & Licença' antes de iniciar os streams.", "Licença Necessária", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            SaveAllSettings();
            foreach (var cardUi in _cardUis)
            {
                if (cardUi.Worker.Status != SlotStatus.Streaming && cardUi.Worker.Status != SlotStatus.Loading)
                {
                    if (!string.IsNullOrEmpty(cardUi.Worker.Config.InstrumentFullName))
                    {
                        cardUi.Worker.Start();
                    }
                }
            }
        }

        private void StopAllStreams()
        {
            foreach (var cardUi in _cardUis)
            {
                cardUi.Worker.Stop();
            }
        }

        private void SaveAllSettings()
        {
            foreach (var cardUi in _cardUis)
            {
                if (cardUi.InstSelector != null && cardUi.InstSelector.Instrument != null)
                {
                    cardUi.Worker.Config.InstrumentFullName = cardUi.InstSelector.Instrument.FullName;
                }
                else if (cardUi.FallbackInstText != null)
                {
                    cardUi.Worker.Config.InstrumentFullName = cardUi.FallbackInstText.Text.Trim();
                }

                cardUi.Worker.Config.TargetPanel = cardUi.CmbPanel.Text.Trim();
            }

            AxionStreamerConfig.Save();
        }

        private void OnWorkerStatusChanged(StreamSlotWorker worker)
        {
            Dispatcher.InvokeAsync(() =>
            {
                var cardUi = _cardUis.FirstOrDefault(c => c.Worker == worker);
                if (cardUi == null) return;

                cardUi.TbStatus.Text = worker.StatusMessage;

                switch (worker.Status)
                {
                    case SlotStatus.Streaming:
                        cardUi.StatusBadge.Background = new SolidColorBrush(Color.FromRgb(6, 78, 59));
                        cardUi.TbStatus.Foreground = new SolidColorBrush(Color.FromRgb(52, 211, 153));
                        cardUi.BtnToggle.Content = "⏹ Parar";
                        cardUi.BtnToggle.Background = new SolidColorBrush(Color.FromRgb(220, 38, 38));
                        break;
                    case SlotStatus.Loading:
                        cardUi.StatusBadge.Background = new SolidColorBrush(Color.FromRgb(120, 53, 15));
                        cardUi.TbStatus.Foreground = new SolidColorBrush(Color.FromRgb(251, 191, 36));
                        cardUi.BtnToggle.Content = "⏹ Parar";
                        cardUi.BtnToggle.Background = new SolidColorBrush(Color.FromRgb(220, 38, 38));
                        break;
                    case SlotStatus.Error:
                        cardUi.StatusBadge.Background = new SolidColorBrush(Color.FromRgb(127, 29, 29));
                        cardUi.TbStatus.Foreground = new SolidColorBrush(Color.FromRgb(248, 113, 113));
                        cardUi.BtnToggle.Content = "▶ Iniciar";
                        cardUi.BtnToggle.Background = new SolidColorBrush(Color.FromRgb(5, 150, 105));
                        break;
                    default:
                        cardUi.StatusBadge.Background = new SolidColorBrush(Color.FromRgb(30, 41, 59));
                        cardUi.TbStatus.Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184));
                        cardUi.BtnToggle.Content = "▶ Iniciar";
                        cardUi.BtnToggle.Background = new SolidColorBrush(Color.FromRgb(5, 150, 105));
                        break;
                }

                string priceStr = worker.CurrentPrice > 0 ? worker.CurrentPrice.ToString("N2") : "--";
                string updateStr = worker.LastUpdateUtc != DateTime.MinValue ? worker.LastUpdateUtc.ToLocalTime().ToString("HH:mm:ss") : "--";
                cardUi.TbMetrics.Text = $"📊 {worker.CandlesCount:N0} velas | ⚡ Preço: {priceStr} | 💥 {worker.TotalBlockTradesCaptured} Block Trades | 🕒 {updateStr}";

                UpdateServerStatusText();
            });
        }

        private void UpdateHeaderLicenseBadge()
        {
            if (_tbLicenseHeaderBadge == null) return;

            if (AxionStreamerLicenseManager.IsLicensed)
            {
                _tbLicenseHeaderBadge.Text = "🟢 Licença: Ativa";
                _tbLicenseHeaderBadge.Foreground = new SolidColorBrush(Color.FromRgb(52, 211, 153));
            }
            else
            {
                _tbLicenseHeaderBadge.Text = "🔴 Licença: Não Autorizada";
                _tbLicenseHeaderBadge.Foreground = new SolidColorBrush(Color.FromRgb(248, 113, 113));
            }
        }

        private void UpdateServerStatusText()
        {
            if (_tbServerStatus == null) return;

            int activeCount = _workers.Count(w => w.Status == SlotStatus.Streaming);
            if (AxionAddOnStreamServer.IsRunning)
            {
                _tbServerStatus.Text = $"🟢 Servidor HTTP: Online (Porta {AxionStreamerConfig.ServerPort}) | {activeCount} de 6 sessões ativas transmitindo";
                _tbServerStatus.Foreground = new SolidColorBrush(Color.FromRgb(52, 211, 153));
            }
            else
            {
                _tbServerStatus.Text = $"🔴 Servidor HTTP: Offline na porta {AxionStreamerConfig.ServerPort}";
                _tbServerStatus.Foreground = new SolidColorBrush(Color.FromRgb(248, 113, 113));
            }
        }

        private void AppendLog(string message)
        {
            Dispatcher.InvokeAsync(() =>
            {
                if (_txtLogs != null)
                {
                    string time = DateTime.Now.ToString("HH:mm:ss");
                    _txtLogs.AppendText($"[{time}] {message}{Environment.NewLine}");
                    _txtLogs.ScrollToEnd();
                }
            });
        }

        protected override void OnClosed(EventArgs e)
        {
            base.OnClosed(e);
            if (_workers != null)
            {
                foreach (var worker in _workers)
                {
                    worker.StatusChanged -= OnWorkerStatusChanged;
                }
            }
            AxionStreamerAddOn.UnregisterLogger();
        }
    }

    // =========================================================================
    // 6. PONTO DE ENTRADA DO ADD-ON (INTEGRAÇÃO COM CONTROL CENTER DO NT8)
    // =========================================================================
    public class AxionStreamerAddOn : AddOnBase
    {
        private NTMenuItem _menuItem;
        private static AxionStreamerWindow _windowInstance;
        private static readonly object _windowLock = new object();
        private static long _lastShortcutTick = 0;
        private static Action<string> _loggerAction;

        public static void RegisterLogger(Action<string> logger)
        {
            _loggerAction = logger;
        }

        public static void UnregisterLogger()
        {
            _loggerAction = null;
        }

        public static void Log(string message)
        {
            try
            {
                NinjaTrader.Code.Output.Process(message, PrintTo.OutputTab1);
            }
            catch { }

            try
            {
                _loggerAction?.Invoke(message);
            }
            catch { }
        }

        static AxionStreamerAddOn()
        {
            try
            {
                // Registra o atalho global Ctrl+Shift+D em qualquer janela do NinjaTrader (Gráficos, DOM, Control Center)
                EventManager.RegisterClassHandler(typeof(Window), UIElement.PreviewKeyDownEvent, new KeyEventHandler((sender, e) =>
                {
                    if (Keyboard.Modifiers == (ModifierKeys.Control | ModifierKeys.Shift) && e.Key == Key.D)
                    {
                        e.Handled = true;
                        OpenWindow();
                    }
                }), false);
            }
            catch { }
        }

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = "Axion Data Streamer — Transmissor Multi-Asset de Cotações em Tempo Real e Histórico";
                Name = "AxionStreamerAddOn";
            }
            else if (State == State.Active)
            {
                try
                {
                    AxionStreamerConfig.Load();
                    AxionStreamerLicenseManager.Inicializar();

                    // Inicia o servidor HTTP na porta configurada (default 8002)
                    if (!AxionAddOnStreamServer.IsRunning)
                    {
                        AxionAddOnStreamServer.StartServer(AxionStreamerConfig.ServerPort);
                    }

                    // Se AutoStartAllOnOpen estiver ativo e licenciado, inicia as transmissões configuradas
                    if (AxionStreamerConfig.AutoStartAllOnOpen && AxionStreamerLicenseManager.IsLicensed)
                    {
                        AxionStreamerEngine.StartAll();
                    }

                    TryAttachToOpenControlCenter();
                    Log("📡 Axion Data Streamer AddOn ATIVADO com sucesso!");
                }
                catch (Exception ex)
                {
                    Log($"[AxionStreamer] Erro ao ativar: {ex.Message}");
                }
            }
            else if (State == State.Terminated)
            {
                try
                {
                    AxionStreamerEngine.StopAll();
                    AxionAddOnStreamServer.StopServer();
                }
                catch { }
            }
        }

        protected override void OnWindowCreated(Window window)
        {
            if (window is ControlCenter cc)
            {
                AttachToControlCenter(cc);
            }
        }

        private void TryAttachToOpenControlCenter()
        {
            try
            {
                if (Application.Current != null)
                {
                    Application.Current.Dispatcher.InvokeAsync(() =>
                    {
                        foreach (Window w in Application.Current.Windows)
                        {
                            if (w is ControlCenter cc)
                            {
                                AttachToControlCenter(cc);
                                break;
                            }
                        }
                    });
                }
            }
            catch { }
        }

        private void AttachToControlCenter(ControlCenter cc)
        {
            if (cc == null || _menuItem != null) return;

            try
            {
                Menu menu = cc.FindFirst("ControlCenterMenu") as Menu;
                if (menu != null)
                {
                    foreach (object item in menu.Items)
                    {
                        if (item is MenuItem mi)
                        {
                            string headerStr = mi.Header?.ToString() ?? "";
                            if (headerStr.IndexOf("New", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                headerStr.IndexOf("Novo", StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                _menuItem = new NTMenuItem
                                {
                                    Header = "📡 Axion Data Streamer (Ctrl+Shift+D)",
                                    InputGestureText = "Ctrl+Shift+D",
                                    Foreground = new SolidColorBrush(Color.FromRgb(56, 189, 248))
                                };
                                _menuItem.Click += (sender, e) => OpenWindow();
                                mi.Items.Add(_menuItem);
                                break;
                            }
                        }
                    }
                }

                cc.PreviewKeyDown += (sender, e) =>
                {
                    if (Keyboard.Modifiers == (ModifierKeys.Control | ModifierKeys.Shift) && e.Key == Key.D)
                    {
                        e.Handled = true;
                        OpenWindow();
                    }
                };
            }
            catch { }
        }

        public static void OpenWindow()
        {
            try
            {
                if (Application.Current != null && !Application.Current.Dispatcher.CheckAccess())
                {
                    Application.Current.Dispatcher.InvokeAsync(OpenWindow);
                    return;
                }

                lock (_windowLock)
                {
                    long now = Environment.TickCount;
                    if (now - _lastShortcutTick < 500)
                    {
                        return;
                    }
                    _lastShortcutTick = now;

                    if (_windowInstance != null && _windowInstance.IsLoaded)
                    {
                        if (_windowInstance.WindowState == WindowState.Minimized)
                        {
                            _windowInstance.WindowState = WindowState.Normal;
                        }
                        _windowInstance.Show();
                        _windowInstance.Activate();
                        _windowInstance.Focus();
                        return;
                    }

                    _windowInstance = new AxionStreamerWindow();
                    _windowInstance.Closed += (s, e) =>
                    {
                        lock (_windowLock)
                        {
                            _windowInstance = null;
                        }
                    };
                    _windowInstance.Show();
                    _windowInstance.Activate();
                    _windowInstance.Focus();
                }
            }
            catch (Exception ex)
            {
                Log($"[AxionStreamer] Erro ao abrir janela: {ex.Message}");
            }
        }

        protected override void OnWindowDestroyed(Window window)
        {
            if (window is ControlCenter)
            {
                AxionStreamerEngine.StopAll();
                AxionAddOnStreamServer.StopServer();
            }
        }
    }
}
