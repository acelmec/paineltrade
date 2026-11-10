#region Using declarations
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.WebSockets;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Timers;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using NinjaTrader.Cbi;
using NinjaTrader.Core.FloatingPoint;
using NinjaTrader.Data;
using NinjaTrader.Gui;
using NinjaTrader.Gui.NinjaScript;
using NinjaTrader.Gui.Tools;
using NinjaTrader.NinjaScript;
#endregion

namespace NinjaTrader.NinjaScript.AddOns
{
    // =========================================================================
    // 1. ESTADO E CONFIGURAÇÕES DO TELEGRAM & MONITORAMENTO (PERSISTÊNCIA JSON)
    // =========================================================================
    public static class AxionGatewayState
    {
        public static string TelegramBotToken { get; set; } = "";
        public static string TelegramChatId { get; set; } = "";
        public static string TituloMensagens { get; set; } = "Axion TradeStation";
        public static bool EnviarMensagensAbertura { get; set; } = true;
        public static bool EnviarMensagensResultado { get; set; } = true;
        public static bool MonitorarOrdens { get; set; } = true;
        public static bool NotificarStatusConexao { get; set; } = true;

        // Relatórios periódicos por intervalo de tempo
        public static bool EnviarRelatorioPeriodico { get; set; } = true;
        public static int IntervaloRelatorioMinutos { get; set; } = 30; // 0 = Desativado, 15, 30, 45, 60, 120, 240
        public static string HorarioRelatorio1 { get; set; } = "09:00";
        public static string HorarioRelatorio2 { get; set; } = "18:00";

        // Gestão de Risco e Sessão
        public static bool HabilitarGestaoRiscoGlobal { get; set; } = false;
        public static double StopLossGlobalPercent { get; set; } = 5.0;
        public static double TakeProfitGlobalPercent { get; set; } = 10.0;
        public static string UltimaDataSessao { get; set; } = "";

        // Filtro de Contas: "Todas" ou "Especifica"
        public static string ModoMonitoramento { get; set; } = "Todas";
        public static List<string> ContasSelecionadasNomes { get; set; } = new List<string>();

        // Permissão de ordens pendentes em conta MASTER (ex: robôs ou ordens limitadas sem posição imediata)
        public static bool PermitirOrdensPendentesMaster { get; set; } = true;

        // Licenciamento WooCommerce
        public static string IdAssinatura { get; set; } = "";

        // Sincronização em Nuvem (Supabase Realtime Broadcast)
        public static bool HabilitarNuvemBroadcast { get; set; } = false;
        public static string NuvemPairingToken { get; set; } = "";
        public static string NuvemSupabaseUrl { get; set; } = "https://db.vemviraramesa.com.br";
        public static string NuvemSupabaseKey { get; set; } = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY";

        private static string ConfigFilePath => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            @"NinjaTrader 8\bin\Custom\AxionGatewayConfig.json"
        );

        public static void Load()
        {
            try
            {
                if (File.Exists(ConfigFilePath))
                {
                    string json = File.ReadAllText(ConfigFilePath, Encoding.UTF8);
                    TelegramBotToken = ExtractJsonString(json, "TelegramBotToken") ?? TelegramBotToken;
                    TelegramChatId = ExtractJsonString(json, "TelegramChatId") ?? TelegramChatId;
                    TituloMensagens = ExtractJsonString(json, "TituloMensagens") ?? TituloMensagens;
                    EnviarMensagensAbertura = ExtractJsonBool(json, "EnviarMensagensAbertura", EnviarMensagensAbertura);
                    EnviarMensagensResultado = ExtractJsonBool(json, "EnviarMensagensResultado", EnviarMensagensResultado);
                    MonitorarOrdens = ExtractJsonBool(json, "MonitorarOrdens", MonitorarOrdens);
                    NotificarStatusConexao = ExtractJsonBool(json, "NotificarStatusConexao", NotificarStatusConexao);
                    EnviarRelatorioPeriodico = ExtractJsonBool(json, "EnviarRelatorioPeriodico", EnviarRelatorioPeriodico);
                    IntervaloRelatorioMinutos = ExtractJsonInt(json, "IntervaloRelatorioMinutos", IntervaloRelatorioMinutos);
                    HorarioRelatorio1 = ExtractJsonString(json, "HorarioRelatorio1") ?? HorarioRelatorio1;
                    HorarioRelatorio2 = ExtractJsonString(json, "HorarioRelatorio2") ?? HorarioRelatorio2;
                    HabilitarGestaoRiscoGlobal = ExtractJsonBool(json, "HabilitarGestaoRiscoGlobal", HabilitarGestaoRiscoGlobal);
                    StopLossGlobalPercent = ExtractJsonDouble(json, "StopLossGlobalPercent", StopLossGlobalPercent);
                    TakeProfitGlobalPercent = ExtractJsonDouble(json, "TakeProfitGlobalPercent", TakeProfitGlobalPercent);
                    UltimaDataSessao = ExtractJsonString(json, "UltimaDataSessao") ?? UltimaDataSessao;
                    ModoMonitoramento = ExtractJsonString(json, "ModoMonitoramento") ?? ModoMonitoramento;
                    PermitirOrdensPendentesMaster = ExtractJsonBool(json, "PermitirOrdensPendentesMaster", PermitirOrdensPendentesMaster);
                    IdAssinatura = ExtractJsonString(json, "IdAssinatura") ?? IdAssinatura;

                    HabilitarNuvemBroadcast = ExtractJsonBool(json, "HabilitarNuvemBroadcast", HabilitarNuvemBroadcast);
                    NuvemPairingToken = ExtractJsonString(json, "NuvemPairingToken") ?? NuvemPairingToken;
                    NuvemSupabaseUrl = ExtractJsonString(json, "NuvemSupabaseUrl") ?? NuvemSupabaseUrl;
                    NuvemSupabaseKey = ExtractJsonString(json, "NuvemSupabaseKey") ?? NuvemSupabaseKey;

                    string accountsRaw = ExtractJsonString(json, "ContasSelecionadasNomes");
                    if (!string.IsNullOrEmpty(accountsRaw))
                    {
                        ContasSelecionadasNomes = accountsRaw.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries).Select(s => s.Trim()).ToList();
                    }
                }
            }
            catch { }
        }

        public static void Save()
        {
            try
            {
                string dir = Path.GetDirectoryName(ConfigFilePath);
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

                var sb = new StringBuilder();
                sb.AppendLine("{");
                sb.AppendLine($"  \"TelegramBotToken\": \"{EscapeJson(TelegramBotToken)}\",");
                sb.AppendLine($"  \"TelegramChatId\": \"{EscapeJson(TelegramChatId)}\",");
                sb.AppendLine($"  \"TituloMensagens\": \"{EscapeJson(TituloMensagens)}\",");
                sb.AppendLine($"  \"EnviarMensagensAbertura\": {(EnviarMensagensAbertura ? "true" : "false")},");
                sb.AppendLine($"  \"EnviarMensagensResultado\": {(EnviarMensagensResultado ? "true" : "false")},");
                sb.AppendLine($"  \"MonitorarOrdens\": {(MonitorarOrdens ? "true" : "false")},");
                sb.AppendLine($"  \"NotificarStatusConexao\": {(NotificarStatusConexao ? "true" : "false")},");
                sb.AppendLine($"  \"EnviarRelatorioPeriodico\": {(EnviarRelatorioPeriodico ? "true" : "false")},");
                sb.AppendLine($"  \"IntervaloRelatorioMinutos\": {IntervaloRelatorioMinutos},");
                sb.AppendLine($"  \"HorarioRelatorio1\": \"{EscapeJson(HorarioRelatorio1)}\",");
                sb.AppendLine($"  \"HorarioRelatorio2\": \"{EscapeJson(HorarioRelatorio2)}\",");
                sb.AppendLine($"  \"HabilitarGestaoRiscoGlobal\": {(HabilitarGestaoRiscoGlobal ? "true" : "false")},");
                sb.AppendLine($"  \"StopLossGlobalPercent\": {StopLossGlobalPercent.ToString(CultureInfo.InvariantCulture)},");
                sb.AppendLine($"  \"TakeProfitGlobalPercent\": {TakeProfitGlobalPercent.ToString(CultureInfo.InvariantCulture)},");
                sb.AppendLine($"  \"UltimaDataSessao\": \"{EscapeJson(UltimaDataSessao)}\",");
                sb.AppendLine($"  \"ModoMonitoramento\": \"{EscapeJson(ModoMonitoramento)}\",");
                sb.AppendLine($"  \"PermitirOrdensPendentesMaster\": {(PermitirOrdensPendentesMaster ? "true" : "false")},");
                sb.AppendLine($"  \"IdAssinatura\": \"{EscapeJson(IdAssinatura)}\",");
                sb.AppendLine($"  \"HabilitarNuvemBroadcast\": {(HabilitarNuvemBroadcast ? "true" : "false")},");
                sb.AppendLine($"  \"NuvemPairingToken\": \"{EscapeJson(NuvemPairingToken)}\",");
                sb.AppendLine($"  \"NuvemSupabaseUrl\": \"{EscapeJson(NuvemSupabaseUrl)}\",");
                sb.AppendLine($"  \"NuvemSupabaseKey\": \"{EscapeJson(NuvemSupabaseKey)}\",");
                sb.AppendLine($"  \"ContasSelecionadasNomes\": \"{string.Join(",", ContasSelecionadasNomes)}\"");
                sb.AppendLine("}");
                File.WriteAllText(ConfigFilePath, sb.ToString(), Encoding.UTF8);
            }
            catch { }
        }

        public static string EscapeJson(string str) => (str ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
        public static string ExtractJsonString(string json, string key)
        {
            var match = Regex.Match(json, $"\"{key}\"\\s*:\\s*\"([^\"]*)\"");
            return match.Success ? match.Groups[1].Value : null;
        }
        private static bool ExtractJsonBool(string json, string key, bool def)
        {
            var match = Regex.Match(json, $"\"{key}\"\\s*:\\s*(true|false)", RegexOptions.IgnoreCase);
            return match.Success ? bool.Parse(match.Groups[1].Value) : def;
        }
        private static int ExtractJsonInt(string json, string key, int def)
        {
            var match = Regex.Match(json, $"\"{key}\"\\s*:\\s*(\\d+)");
            return match.Success ? int.Parse(match.Groups[1].Value) : def;
        }
        private static double ExtractJsonDouble(string json, string key, double def)
        {
            var match = Regex.Match(json, $"\"{key}\"\\s*:\\s*([0-9.]+)");
            return match.Success ? double.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture) : def;
        }
    }

    // =========================================================================
    // 2. GESTÃO DE LICENCIAMENTO, SEGURANÇA E WOOCOMMERCE SUBSCRIPTIONS
    // =========================================================================
    public static class AxionLicenseManager
    {
        // ── DADOS DA EMPRESA E REGISTRO ──
        public const string EmpresaRazaoSocial = "VM GESTAO & TECNOLOGIA LTDA";
        public const string EmpresaCnpj = "67.109.367/0001-19";
        public const string EmpresaDominio = "ffbinvest.amsolucoes.net.br";
        public const string SoftwareVersao = "Axion Gateway Enterprise v2.4";
        public const string CopyrightText = "Todos os direitos reservados © 2026 VM Gestão & Tecnologia Ltda";

        // ── WOOCOMMERCE & CONFIGURAÇÃO DA LOJA ──
        public const int CodProduto = 7375;
        public static readonly int[] CodigosProdutosValidos = new int[] { 7375, 9203, 9286 };
        private const string ConsumerKey = "ck_75f9d0f430cb40c64c902ed43ce2bceb08e5e649";
        private const string ConsumerSecret = "cs_a741c57b4368102a1daf3fbfc4598833ffb23e77";
        private const string LicenseCacheFileName = "axion_gateway_license.enc";
        private const string EncryptionKey = "VM_AXION_LICENSE_KEY_2026";

        // ── MODO PRODUÇÃO E VALIDAÇÃO ESTRITA POR ASSINATURA ──
        public const bool DEVELOPER_MODE = false;

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
                // Validação estrita por assinatura e Machine ID vinculado no WordPress
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

                // 2. Se houver ID de assinatura salvo, validar online em segundo plano
                string idAssinatura = AxionGatewayState.IdAssinatura;
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
                    StatusMensagem = "Assinatura não corresponde a um produto Axion Gateway válido.";
                    OnLicenseStatusChanged?.Invoke();
                    return (false, StatusMensagem);
                }

                // Verificar Machine ID (meta_data com key: "id_nt")
                string idNtValue = ExtrairValueAposKey(json, "\"key\":\"id_nt\"");
                if (string.IsNullOrEmpty(idNtValue))
                {
                    // Fallback para key "id_machine" ou "machine_id" caso o checkout tenha salvado com outro nome
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

                AxionGatewayState.IdAssinatura = idLimpo;
                AxionGatewayState.Save();

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
                if (!File.Exists(cachePath)) return false;

                string raw = File.ReadAllText(cachePath, Encoding.UTF8);
                string json = SimpleDecrypt(raw, EncryptionKey);
                if (string.IsNullOrWhiteSpace(json)) return false;

                string idM = ExtractJsonVal(json, "idMachine");
                string cod = ExtractJsonVal(json, "codProduto");
                string ids = ExtractJsonVal(json, "idAssinatura");
                string dat = ExtractJsonVal(json, "dataValidacao");

                if (string.IsNullOrEmpty(idM) || string.IsNullOrEmpty(cod) || string.IsNullOrEmpty(dat))
                    return false;

                // Confere se o produto em cache pertence à lista de produtos válidos
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

                // Confere Machine ID
                if (!idM.Equals(CurrentMachineId, StringComparison.OrdinalIgnoreCase))
                    return false;

                // Confere Expiração do Cache (72 horas)
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

                if (File.Exists(cachePath))
                {
                    var attr = File.GetAttributes(cachePath);
                    if ((attr & FileAttributes.Hidden) != 0) File.SetAttributes(cachePath, attr & ~FileAttributes.Hidden);
                }

                string json = $"{{\"idMachine\":\"{CurrentMachineId}\",\"codProduto\":\"{codProduto}\",\"idAssinatura\":\"{idAssinatura}\",\"dataValidacao\":\"{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss}\"}}";
                string encrypted = SimpleEncrypt(json, EncryptionKey);
                File.WriteAllText(cachePath, encrypted, Encoding.UTF8);
                File.SetAttributes(cachePath, FileAttributes.Hidden);
            }
            catch { }
        }

        private static string ExtractJsonVal(string json, string key)
        {
            int s = json.IndexOf($"\"{key}\":\"", StringComparison.OrdinalIgnoreCase);
            if (s < 0) return null;
            s += $"\"{key}\":\"".Length;
            int e = json.IndexOf('"', s);
            return e >= 0 ? json.Substring(s, e - s) : null;
        }

        private static string ExtrairValueAposKey(string json, string keyPattern)
        {
            int ki = json.IndexOf(keyPattern, StringComparison.OrdinalIgnoreCase);
            if (ki < 0) return null;
            string vp = "\"value\":\"";
            int vs = json.IndexOf(vp, ki, StringComparison.OrdinalIgnoreCase);
            if (vs < 0) return null;
            vs += vp.Length;
            int ve = json.IndexOf('"', vs);
            return ve >= 0 ? json.Substring(vs, ve - vs) : null;
        }

        #endregion
    }

    // =========================================================================
    // 3. ESTADO DE RISCO E SALDOS POR CONTA
    // =========================================================================
    public class AccountRiskInfo
    {
        public Account Account { get; set; }
        public string AccountName { get; set; } = "";
        public double InitialCashValue { get; set; } = 0;
        public double InitialRealizedPnL { get; set; } = 0;
        public double InitialUnrealizedPnL { get; set; } = 0;
        public double StopLossPercent { get; set; } = 5.0; // % diário
        public double TakeProfitPercent { get; set; } = 10.0; // % diário
        public double DailyLossLimitUsd { get; set; } = 0; // Limite de Perda Diária em Moeda ($)
        public double DailyProfitTargetUsd { get; set; } = 0; // Meta de Lucro Diária em Moeda ($)
        public int MaxDailyTrades { get; set; } = 0; // Limite Máximo de Operações Diárias
        public int MaxLots { get; set; } = 0; // Tamanho Máximo de Lote (Contratos) Permitido na Conta
        public int DailyTradesCount { get; set; } = 0; // Quantidade de operações executadas no dia
        public string TradingStartTime { get; set; } = ""; // Horário início (HH:mm ou HH:mm:ss)
        public string TradingEndTime { get; set; } = ""; // Horário término (HH:mm ou HH:mm:ss)
        public bool AllowMultiSignals { get; set; } = true; // Permite operar múltiplos ativos simultâneos na mesma conta
        public bool IsSynchronized { get; set; } = false;
        public bool RiskManagementEnabled { get; set; } = false;
        public bool IsBlocked { get; set; } = false;
        public bool WasStopLossTriggered { get; set; } = false;
        public bool WasTakeProfitTriggered { get; set; } = false;

        public AccountRiskInfo(Account account)
        {
            Account = account;
            AccountName = account?.Name ?? "";
            StopLossPercent = AxionGatewayState.StopLossGlobalPercent > 0 ? AxionGatewayState.StopLossGlobalPercent : 5.0;
            TakeProfitPercent = AxionGatewayState.TakeProfitGlobalPercent > 0 ? AxionGatewayState.TakeProfitGlobalPercent : 10.0;
            RiskManagementEnabled = AxionGatewayState.HabilitarGestaoRiscoGlobal;
            ResetSessionValues();
        }

        public void ResetSessionValues()
        {
            if (Account != null)
            {
                try 
                { 
                    double c = Account.Get(AccountItem.CashValue, Currency.UsDollar); 
                    if (c > 0) InitialCashValue = c; 
                } 
                catch { }
                try { InitialRealizedPnL = Account.Get(AccountItem.RealizedProfitLoss, Currency.UsDollar); } catch { }
            }
            DailyTradesCount = 0;
            IsBlocked = false;
            WasStopLossTriggered = false;
            WasTakeProfitTriggered = false;
        }
    }

    // =========================================================================
    // 3. ADD-ON PRINCIPAL — AXION GATEWAY V2
    // =========================================================================
    public class AxionGatewayAddOn : AddOnBase
    {
        private HttpListener _httpListener;
        private bool _isRunning = false;
        private const int GatewayPort = 8001;
        private NTMenuItem _menuItem;
        private static AxionGatewayWindow _statusWindowInstance = null;
        private static AxionGatewayAddOn _instance = null;
        private static Action<string> _loggerAction = null;

        // Gerenciamento de Brackets e Sinais de Execução Local
        private class PendingBracket
        {
            public string OrderId;
            public string ReportId;
            public Account Account;
            public Instrument Instrument;
            public OrderAction EntryAction;
            public int Quantity;
            public double StopPoints;
            public double TakePoints;
            public double InitialSl;
            public double InitialTp;
            public string OcoId;
            public DateTime CreatedAt;
        }

        private class BracketDef
        {
            public string OcoId;
            public string ReportId;
            public int Quantity;
            public Order SlOrder;
            public Order TpOrder;
            public double RealFillPrice;
            public double StopPoints;
            public double TakePoints;
            public OrderAction EntryAction;
            public Instrument Instrument;
            public Account Account;
            public DateTime CreatedAt;
        }

        public class MasterExecutionEvent
        {
            public string EventId { get; set; } = Guid.NewGuid().ToString("N");
            public string EventType { get; set; } = "ENTRY"; // ENTRY, CLOSE
            public string AccountName { get; set; } = "";
            public string Symbol { get; set; } = "";
            public string Action { get; set; } = "BUY"; // BUY, SELL
            public int Quantity { get; set; } = 1;
            public double Price { get; set; } = 0;
            public double StopLoss { get; set; } = 0;
            public double TakeProfit { get; set; } = 0;
            public double StopLossPoints { get; set; } = 0;
            public double TakeProfitPoints { get; set; } = 0;
            public string OrderId { get; set; } = "";
            public string OrderName { get; set; } = "";
            public string ReportId { get; set; } = "";
            public string Timestamp { get; set; } = DateTime.UtcNow.ToString("o");
        }

        public class CopyTradingRule
        {
            public string Id { get; set; } = Guid.NewGuid().ToString("N");
            public string MasterAccountName { get; set; } = "";
            public string SlaveAccountName { get; set; } = "";
            public double LotMultiplier { get; set; } = 1.0;
            public bool IsActive { get; set; } = true;
            public string AllowedSymbols { get; set; } = "TODOS";
            public string ExecutionSymbol { get; set; } = "";
            public string SymbolMapping { get; set; } = "";
            public double MaxDailyLoss { get; set; } = 0;
            public int MaxDailyTrades { get; set; } = 0;
            public bool CopyAtmStrategy { get; set; } = true;
            public bool CloseSlavesOnMasterClose { get; set; } = true;
            public bool CancelOrphanOrders { get; set; } = false;
        }

        private static readonly ConcurrentQueue<MasterExecutionEvent> _masterEventsQueue = new ConcurrentQueue<MasterExecutionEvent>();
        private static readonly ConcurrentDictionary<string, DateTime> _processedExecOrderIds = new ConcurrentDictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
        private static readonly ConcurrentDictionary<string, DateTime> _processedTelegramExecIds = new ConcurrentDictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
        private static readonly ConcurrentDictionary<string, DateTime> _lastReconcileAdjustmentTime = new ConcurrentDictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
        private static readonly ConcurrentDictionary<string, DateTime> _lastBracketSubmissionTime = new ConcurrentDictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
        private static readonly ConcurrentDictionary<string, int> _copiedLotsPerMasterOrderAndSlave = new ConcurrentDictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        public static readonly ConcurrentDictionary<string, CopyTradingRule> _copyRules = new ConcurrentDictionary<string, CopyTradingRule>(StringComparer.OrdinalIgnoreCase);

        private static readonly ConcurrentDictionary<string, PendingBracket> _pendingBrackets = new ConcurrentDictionary<string, PendingBracket>();
        private static readonly ConcurrentDictionary<string, BracketDef> _activeBrackets = new ConcurrentDictionary<string, BracketDef>();
        private static readonly ConcurrentDictionary<string, string> _reportToOcoMap = new ConcurrentDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        private static readonly HashSet<Account> _subscribedAccounts = new HashSet<Account>();
        private static readonly Dictionary<string, AccountRiskInfo> _accountRiskStates = new Dictionary<string, AccountRiskInfo>(StringComparer.OrdinalIgnoreCase);
        private static readonly ConcurrentDictionary<string, DateTime> _inFlightClosingRequests = new ConcurrentDictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
        private static readonly ConcurrentDictionary<string, DateTime> _inFlightCancellingOrders = new ConcurrentDictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
        private static bool _cachedHasActiveConnection = false;
        private static readonly ConcurrentDictionary<string, string> _masterToSlaveOrderIdMap = new ConcurrentDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        // Rastreamento estrito de pares (Master, Slave, Instrumento) ativamente copiados.
        // Impede que ordens/posições abertas na Slave em outros ativos sejam encerradas pela Master.
        private static readonly ConcurrentDictionary<string, byte> _activeCopiedPositions = new ConcurrentDictionary<string, byte>(StringComparer.OrdinalIgnoreCase);

        // ── CAMUFLAGEM CHART TRADER: Rastreamento em memória de ordens geradas internamente ──
        // Permite evitar loops/ecos sem precisar marcar ordens com tags no broker
        private static readonly ConcurrentDictionary<string, byte> _internalGeneratedOrderIds = new ConcurrentDictionary<string, byte>(StringComparer.OrdinalIgnoreCase);
        private static readonly ConcurrentDictionary<string, byte> _copyGeneratedOrderIds = new ConcurrentDictionary<string, byte>(StringComparer.OrdinalIgnoreCase);
        private static readonly ConcurrentDictionary<string, (double sl, double tp)> _lastReportedMasterLevels = new ConcurrentDictionary<string, (double sl, double tp)>(StringComparer.OrdinalIgnoreCase);
        private static readonly ConcurrentDictionary<string, double> _lastKnownMasterOrderPrice = new ConcurrentDictionary<string, double>(StringComparer.OrdinalIgnoreCase);

        #region Camuflagem Total Stealth (Ofuscação de AddOn / NT-40993)

        private static readonly PropertyInfo _propNinjaScriptOrigin = typeof(Order).GetProperty("NinjaScriptOrigin", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
        private static readonly FieldInfo _fieldExecutingScriptName = typeof(NinjaTrader.NinjaScript.NinjaScript).GetField("ExecutingScriptName", BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public);

        /// <summary>
        /// Suprime o AsyncLocal ExecutingScriptName do NinjaTrader para que ResolveExecutingScriptName()
        /// retorne string vazia e não faça o stack walk que carimbaria o nome do AddOn (NT-40993).
        /// </summary>
        public static void SuppressExecutingScriptName()
        {
            try
            {
                var asyncLocal = _fieldExecutingScriptName?.GetValue(null) as AsyncLocal<string>;
                if (asyncLocal != null)
                {
                    asyncLocal.Value = string.Empty;
                }
            }
            catch { }
        }

        /// <summary>
        /// Higieniza o objeto Order para remover qualquer vestígio de NinjaScriptOrigin e Text,
        /// deixando o relatório do Tradovate/Broker 100% em branco (idêntico à boleta manual do ChartTrader).
        /// </summary>
        public static void SanitizeOrderStealth(Order ord)
        {
            if (ord == null) return;
            try
            {
                _propNinjaScriptOrigin?.SetValue(ord, string.Empty);
            }
            catch { }

            try
            {
                ord.Text = string.Empty;
            }
            catch { }
        }

        /// <summary>
        /// Criação segura e camuflada de ordens simulando Chart Trader (OrderEntry.Manual e sem carimbo de AddOn).
        /// </summary>
        private static Order CreateStealthOrder(
            Account targetAccount,
            Instrument targetInstrument,
            OrderAction orderAction,
            OrderType orderType,
            OrderEntry orderEntry,
            TimeInForce tif,
            int quantity,
            double limitPrice,
            double stopPrice,
            string ocoId,
            string orderName)
        {
            SuppressExecutingScriptName();
            Order ord = targetAccount.CreateOrder(
                targetInstrument,
                orderAction,
                orderType,
                OrderEntry.Manual, // Simula sempre ordem manual de tela
                tif,
                quantity,
                limitPrice,
                stopPrice,
                ocoId ?? string.Empty,
                orderName ?? string.Empty,
                DateTime.MaxValue,
                null
            );
            SanitizeOrderStealth(ord);
            return ord;
        }

        /// <summary>
        /// Submissão camuflada que neutraliza o NT-40993 e garante Text vazio no Tradovate.
        /// </summary>
        private static void StealthSubmit(Account targetAccount, params Order[] orders)
        {
            if (targetAccount == null || orders == null || orders.Length == 0) return;
            try
            {
                DateTime now = DateTime.UtcNow;
                SuppressExecutingScriptName();
                var validOrders = orders.Where(ord => {
                    if (ord == null) return false;
                    if (ord.OrderState == OrderState.CancelPending ||
                        ord.OrderState == OrderState.Cancelled ||
                        ord.OrderState == OrderState.Filled ||
                        ord.OrderState == OrderState.Rejected)
                        return false;

                    string ordId = ord.OrderId ?? ord.Id.ToString();
                    if (_inFlightCancellingOrders.TryGetValue(ordId, out DateTime lastCancelTime))
                    {
                        if ((now - lastCancelTime).TotalSeconds < 4.0)
                            return false; // Ordem em trânsito de cancelamento
                    }
                    return true;
                }).ToArray();

                if (validOrders.Length == 0) return;

                foreach (var ord in validOrders)
                {
                    SanitizeOrderStealth(ord);
                }
                targetAccount.Submit(validOrders);
            }
            finally
            {
                SuppressExecutingScriptName();
                foreach (var ord in orders)
                {
                    if (ord != null) SanitizeOrderStealth(ord);
                }
            }
        }

        /// <summary>
        /// Modificação segura de ordens que verifica se a ordem está em estado mutável antes de invocar Account.Change().
        /// Ignora ordens em CancelPending, Cancelled, Filled, Rejected ou já sob cancelamento para evitar erro modal no NinjaTrader.
        /// </summary>
        private static void SafeChangeOrders(Account targetAccount, params Order[] orders)
        {
            if (targetAccount == null || orders == null || orders.Length == 0) return;
            try
            {
                DateTime now = DateTime.UtcNow;
                var validOrders = orders.Where(ord => {
                    if (ord == null) return false;
                    if (ord.OrderState != OrderState.Working && ord.OrderState != OrderState.Accepted)
                        return false;
                    if (ord.OrderState == OrderState.CancelPending ||
                        ord.OrderState == OrderState.ChangePending ||
                        ord.OrderState == OrderState.Cancelled ||
                        ord.OrderState == OrderState.Filled ||
                        ord.OrderState == OrderState.Rejected)
                        return false;

                    string ordId = ord.OrderId ?? ord.Id.ToString();
                    if (_inFlightCancellingOrders.TryGetValue(ordId, out DateTime lastCancelTime))
                    {
                        if ((now - lastCancelTime).TotalSeconds < 4.0)
                            return false; // Não alterar ordens em trânsito de cancelamento
                    }
                    return true;
                }).Distinct().ToArray();

                if (validOrders.Length == 0) return;

                SuppressExecutingScriptName();
                foreach (var ord in validOrders)
                {
                    SanitizeOrderStealth(ord);
                }

                if (Application.Current?.Dispatcher != null && !Application.Current.Dispatcher.CheckAccess())
                {
                    Application.Current.Dispatcher.Invoke(() =>
                    {
                        try
                        {
                            targetAccount.Change(validOrders);
                        }
                        catch (Exception ex)
                        {
                            Log($"[AVISO SAFE CHANGE DISPATCHER]: {ex.Message}");
                        }
                    });
                }
                else
                {
                    targetAccount.Change(validOrders);
                }
            }
            catch (Exception ex)
            {
                Log($"[AVISO SAFE CHANGE]: Não foi possível alterar ordem em {targetAccount.Name}: {ex.Message}");
            }
            finally
            {
                SuppressExecutingScriptName();
            }
        }

        /// <summary>
        /// Cancelamento seguro de ordens com semáforo atômico anti-colisão e execução síncrona no Dispatcher UI.
        /// Ignora ordens já sob cancelamento, em CancelPending, Cancelled, Filled ou Rejected.
        /// </summary>
        private static void SafeCancelOrders(Account targetAccount, params Order[] orders)
        {
            if (targetAccount == null || orders == null || orders.Length == 0) return;
            try
            {
                DateTime now = DateTime.UtcNow;
                var validOrders = orders.Where(ord => {
                    if (ord == null) return false;
                    if (ord.OrderState == OrderState.CancelPending ||
                        ord.OrderState == OrderState.Cancelled ||
                        ord.OrderState == OrderState.Filled ||
                        ord.OrderState == OrderState.Rejected)
                        return false;

                    string ordId = ord.OrderId ?? ord.Id.ToString();
                    if (_inFlightCancellingOrders.TryGetValue(ordId, out DateTime lastCancelTime))
                    {
                        if ((now - lastCancelTime).TotalSeconds < 4.0)
                            return false; // Já despachado para cancelamento nos últimos 4s
                    }
                    return true;
                }).Distinct().ToArray();

                if (validOrders.Length == 0) return;

                // Registra imediatamente todos os IDs no semáforo para evitar concorrência
                foreach (var ord in validOrders)
                {
                    string ordId = ord.OrderId ?? ord.Id.ToString();
                    _inFlightCancellingOrders[ordId] = now;
                }

                if (Application.Current?.Dispatcher != null && !Application.Current.Dispatcher.CheckAccess())
                {
                    Application.Current.Dispatcher.Invoke(() =>
                    {
                        try
                        {
                            SuppressExecutingScriptName();
                            targetAccount.Cancel(validOrders);
                        }
                        catch (Exception ex)
                        {
                            Log($"[AVISO SAFE CANCEL DISPATCHER]: {ex.Message}");
                        }
                    });
                }
                else
                {
                    SuppressExecutingScriptName();
                    targetAccount.Cancel(validOrders);
                }
            }
            catch (Exception ex)
            {
                Log($"[AVISO SAFE CANCEL]: Não foi possível cancelar ordem em {targetAccount.Name}: {ex.Message}");
            }
            finally
            {
                SuppressExecutingScriptName();
            }
        }

        #endregion

        private static void RegisterInternalOrder(string orderId)
        {
            if (!string.IsNullOrEmpty(orderId))
            {
                _internalGeneratedOrderIds.TryAdd(orderId, 1);
            }
        }

        private static void RegisterCopyOrder(string orderId)
        {
            if (!string.IsNullOrEmpty(orderId))
            {
                _copyGeneratedOrderIds.TryAdd(orderId, 1);
            }
        }

        private static bool IsCopyOrder(Order ord)
        {
            if (ord == null) return false;
            if (!string.IsNullOrEmpty(ord.Name) && (
                ord.Name.StartsWith("Copy_", StringComparison.OrdinalIgnoreCase) ||
                ord.Name.StartsWith("Axion_", StringComparison.OrdinalIgnoreCase) ||
                ord.Name.Equals("Close", StringComparison.OrdinalIgnoreCase) ||
                ord.Name.Equals("Exit", StringComparison.OrdinalIgnoreCase) ||
                ord.Name.Equals("Zerar", StringComparison.OrdinalIgnoreCase) ||
                ord.Name.Equals("RiskClose", StringComparison.OrdinalIgnoreCase) ||
                ord.Name.Equals("RiskLotCap", StringComparison.OrdinalIgnoreCase))) return true;
            if (!string.IsNullOrEmpty(ord.OrderId) && _copyGeneratedOrderIds.ContainsKey(ord.OrderId)) return true;
            if (ord.Id != 0 && _copyGeneratedOrderIds.ContainsKey(ord.Id.ToString())) return true;
            return false;
        }

        private static bool IsInternalOrder(Order ord)
        {
            if (ord == null) return false;
            if (!string.IsNullOrEmpty(ord.Name) && (
                ord.Name.StartsWith("Axion_", StringComparison.OrdinalIgnoreCase) ||
                ord.Name.StartsWith("Copy_", StringComparison.OrdinalIgnoreCase)))
                return true;
            if (!string.IsNullOrEmpty(ord.OrderId) && _internalGeneratedOrderIds.ContainsKey(ord.OrderId))
                return true;
            if (ord.Id != 0 && _internalGeneratedOrderIds.ContainsKey(ord.Id.ToString()))
                return true;
            return false;
        }

        private static System.Timers.Timer _periodicReportTimer = null;
        private static System.Timers.Timer _autoReconcileTimer = null;
        private static DateTime _lastCleanupTime = DateTime.MinValue;
        private static DateTime _lastReportSentTime = DateTime.MinValue;
        private static string _lastReportSentHour = "";
        private const int CLEANUP_INTERVAL_SECONDS = 60;
        private const int EXECUTION_RETENTION_MINUTES = 15;

        // Controle atômico de zeragem em andamento (evita recriação de brackets ou reabertura acidental durante Zerar Tudo)
        private static readonly ConcurrentDictionary<string, DateTime> _flatteningAccountUntil = new ConcurrentDictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
        // Guardião de 5 segundos para ordens órfãs sem posição a mercado e posições a mercado sozinhas sem SL/TP
        private static readonly ConcurrentDictionary<string, DateTime> _orphanOrdersSince = new ConcurrentDictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
        private static readonly ConcurrentDictionary<string, DateTime> _unprotectedPositionSince = new ConcurrentDictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);

        public static string GetNormalizedInstrumentKey(string symbolOrInst)
        {
            if (string.IsNullOrWhiteSpace(symbolOrInst)) return "";
            string s = symbolOrInst.Trim().ToUpperInvariant();
            int spaceIdx = s.IndexOf(' ');
            if (spaceIdx > 0) return s.Substring(0, spaceIdx).Trim();
            return s;
        }

        public static string GetNormalizedInstrumentKey(Instrument inst)
        {
            if (inst == null) return "";
            if (inst.MasterInstrument != null && !string.IsNullOrWhiteSpace(inst.MasterInstrument.Name))
                return inst.MasterInstrument.Name.Trim().ToUpperInvariant();
            return GetNormalizedInstrumentKey(inst.FullName ?? "");
        }

        public static void MarkAccountFlattening(string accountName, double durationSeconds = 2.0, string instrumentName = null)
        {
            if (string.IsNullOrWhiteSpace(accountName)) return;
            // Se foi passado valor em milissegundos (ex: 5000), converte para segundos e limita a no máximo 2.5s
            if (durationSeconds > 10.0) durationSeconds = durationSeconds / 1000.0;
            if (durationSeconds > 2.5) durationSeconds = 2.5;
            if (durationSeconds < 0.5) durationSeconds = 0.5;

            DateTime until = DateTime.UtcNow.AddSeconds(durationSeconds);
            if (!string.IsNullOrWhiteSpace(instrumentName))
            {
                string key = $"{accountName.Trim()}_{GetNormalizedInstrumentKey(instrumentName)}";
                _flatteningAccountUntil[key] = until;
            }
            else
            {
                _flatteningAccountUntil[accountName.Trim()] = until;
            }
        }

        public static bool IsAccountCurrentlyFlattening(string accountName, string instrumentName = null)
        {
            if (string.IsNullOrWhiteSpace(accountName)) return false;
            DateTime now = DateTime.UtcNow;

            // 1. Verifica se a conta inteira está em zeragem geral / pânico
            if (_flatteningAccountUntil.TryGetValue(accountName.Trim(), out DateTime untilGlobal))
            {
                if (now < untilGlobal) return true;
                _flatteningAccountUntil.TryRemove(accountName.Trim(), out _);
            }

            // 2. Se um ativo específico foi informado, verifica se aquele ativo está em zeragem
            if (!string.IsNullOrWhiteSpace(instrumentName))
            {
                string key = $"{accountName.Trim()}_{GetNormalizedInstrumentKey(instrumentName)}";
                if (_flatteningAccountUntil.TryGetValue(key, out DateTime untilInst))
                {
                    if (now < untilInst) return true;
                    _flatteningAccountUntil.TryRemove(key, out _);
                }
            }

            return false;
        }

        public static bool IsMasterAccount(string accountName)
        {
            if (string.IsNullOrWhiteSpace(accountName)) return false;
            string clean = accountName.Trim();
            if (_copyRules == null || _copyRules.Count == 0)
            {
                try { LoadCopyRulesFromDisk(); } catch { }
            }
            if (_copyRules != null && _copyRules.Count > 0)
            {
                if (_copyRules.Values.Any(r => r != null && string.Equals(r.MasterAccountName?.Trim(), clean, StringComparison.OrdinalIgnoreCase)))
                    return true;
            }
            return false;
        }

        public static bool IsSlaveAccount(string accountName)
        {
            if (string.IsNullOrWhiteSpace(accountName)) return false;
            string clean = accountName.Trim();
            if (_copyRules == null || _copyRules.Count == 0)
            {
                try { LoadCopyRulesFromDisk(); } catch { }
            }
            if (_copyRules != null && _copyRules.Count > 0)
            {
                if (_copyRules.Values.Any(r => r != null && string.Equals(r.SlaveAccountName?.Trim(), clean, StringComparison.OrdinalIgnoreCase)))
                    return true;
            }
            return false;
        }

        public static bool IsProtectionOrExitOrder(Order order)
        {
            if (order == null) return false;
            if (!string.IsNullOrEmpty(order.Oco)) return true;
            if (IsCopyOrder(order) || IsInternalOrder(order)) return true;
            if (order.OrderType == OrderType.StopMarket || order.OrderType == OrderType.StopLimit) return true;
            return IsExitOrProtectionOrderName(order.Name);
        }

        public static bool IsExitOrProtectionOrderName(string orderName)
        {
            if (string.IsNullOrWhiteSpace(orderName)) return false;
            string n = orderName.Trim();

            // 1. Ordens expressamente identificadas como Stop Loss, Profit Target ou Saída / Fechamento
            if (n.Equals("Close", StringComparison.OrdinalIgnoreCase) ||
                n.Equals("Copy_Close", StringComparison.OrdinalIgnoreCase) ||
                n.Equals("RiskClose", StringComparison.OrdinalIgnoreCase) ||
                n.Equals("RiskLotCap", StringComparison.OrdinalIgnoreCase) ||
                n.Equals("NakedClose", StringComparison.OrdinalIgnoreCase) ||
                n.Equals("Exit", StringComparison.OrdinalIgnoreCase) ||
                n.Equals("Zerar", StringComparison.OrdinalIgnoreCase) ||
                n.StartsWith("Stop loss", StringComparison.OrdinalIgnoreCase) ||
                n.StartsWith("Profit target", StringComparison.OrdinalIgnoreCase) ||
                n.StartsWith("Axion_SL", StringComparison.OrdinalIgnoreCase) ||
                n.StartsWith("Axion_TP", StringComparison.OrdinalIgnoreCase) ||
                n.StartsWith("Axion_Close", StringComparison.OrdinalIgnoreCase) ||
                n.StartsWith("Axion_Risk", StringComparison.OrdinalIgnoreCase) ||
                n.StartsWith("Stop", StringComparison.OrdinalIgnoreCase) ||
                n.StartsWith("Target", StringComparison.OrdinalIgnoreCase) ||
                n.StartsWith("Profit", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            // 2. Nunca classificar ordens de entrada (compra/venda/robôs/limit/mit/stop de entrada) como saída
            if (n.StartsWith("Buy", StringComparison.OrdinalIgnoreCase) ||
                n.StartsWith("Sell", StringComparison.OrdinalIgnoreCase) ||
                n.IndexOf("Entry", StringComparison.OrdinalIgnoreCase) >= 0 ||
                n.IndexOf("MIT", StringComparison.OrdinalIgnoreCase) >= 0 ||
                n.IndexOf("MarketIfTouched", StringComparison.OrdinalIgnoreCase) >= 0 ||
                n.IndexOf("Robo", StringComparison.OrdinalIgnoreCase) >= 0 ||
                n.IndexOf("Robot", StringComparison.OrdinalIgnoreCase) >= 0 ||
                n.IndexOf("Signal", StringComparison.OrdinalIgnoreCase) >= 0 ||
                n.IndexOf("Sinal", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return false;
            }

            return false;
        }

        public static int ClampLotSizeForAccount(string accountName, int requestedQty)
        {
            return ClampLotSizeForAccount(accountName, requestedQty, out _, out _);
        }

        public static int ClampLotSizeForAccount(string accountName, int requestedQty, out bool wasClamped, out int maxAllowed)
        {
            wasClamped = false;
            maxAllowed = 0;
            int safeQty = Math.Max(1, requestedQty);
            if (string.IsNullOrWhiteSpace(accountName)) return safeQty;

            if (_accountRiskStates.TryGetValue(accountName.Trim(), out AccountRiskInfo rInfo) && rInfo != null && rInfo.MaxLots > 0)
            {
                maxAllowed = rInfo.MaxLots;
                if (safeQty > rInfo.MaxLots)
                {
                    wasClamped = true;
                    Log($"⚠️ [LIMITE DE LOTE]: Lote da conta {accountName} ajustado automaticamente de {safeQty}x para o limite máximo configurado de {rInfo.MaxLots}x.");
                    return rInfo.MaxLots;
                }
            }
            return safeQty;
        }

        public static void EnqueueRejectionEvent(string masterAccount, string slaveAccount, string symbol, string action, int qty, string reason)
        {
            EnqueueRejectionEvent(masterAccount, slaveAccount, symbol, action, qty, 0, reason);
        }

        public static void EnqueueRejectionEvent(string masterAccount, string slaveAccount, string symbol, string action, int qty, double price, string reason)
        {
            try
            {
                string key = $"REJ_{masterAccount}_{slaveAccount}_{symbol}_{reason}";
                DateTime now = DateTime.UtcNow;
                if (_lastRejectionLogTime.TryGetValue(key, out DateTime lastTime) && (now - lastTime).TotalSeconds < 5)
                {
                    return;
                }
                _lastRejectionLogTime[key] = now;

                _masterEventsQueue.Enqueue(new MasterExecutionEvent
                {
                    EventId = Guid.NewGuid().ToString("N"),
                    EventType = "REJECTED",
                    AccountName = masterAccount ?? "",
                    OrderId = slaveAccount ?? "",
                    Symbol = symbol ?? "",
                    Action = action ?? "BUY",
                    Quantity = Math.Max(1, qty),
                    Price = price,
                    OrderName = reason ?? "Operação rejeitada pelas regras operacionais.",
                    Timestamp = DateTime.UtcNow.ToString("o")
                });
            }
            catch { }
        }

        private static bool IsAccountReadyForTrading(Account acc)
        {
            if (acc == null) return false;
            if (string.Equals(acc.Name, "Backtest", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(acc.Name, "Playback101", StringComparison.OrdinalIgnoreCase))
                return false;
            if (acc.Connection != null && acc.Connection.Status == ConnectionStatus.Disconnected)
                return false;
            return true;
        }

        private static bool SafeSubmitCloseOrder(Account targetAccount, Instrument targetInstrument, OrderAction closeAction, int quantity, string tag = "Close")
        {
            if (targetAccount == null || targetInstrument == null || quantity <= 0) return false;
            try
            {
                string key = $"{targetAccount.Name}_{targetInstrument.FullName}";
                DateTime now = DateTime.UtcNow;

                if (_inFlightClosingRequests.TryGetValue(key, out DateTime lastCloseTime))
                {
                    if ((now - lastCloseTime).TotalMilliseconds < 1800)
                    {
                        // Cooldown de 1800ms para evitar envios duplicados em rajada durante Zerar Tudo / Copy Close
                        return false;
                    }
                }

                if (targetAccount.Orders != null)
                {
                    bool hasActiveExit = false;
                    lock (targetAccount.Orders)
                    {
                        hasActiveExit = targetAccount.Orders.Any(o => 
                            o != null && 
                            (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted || o.OrderState == OrderState.Submitted || o.OrderState == OrderState.TriggerPending) &&
                            o.OrderType == OrderType.Market &&
                            o.Instrument != null && 
                            string.Equals(o.Instrument.FullName, targetInstrument.FullName, StringComparison.OrdinalIgnoreCase) &&
                            (!string.IsNullOrEmpty(o.Name) && (o.Name == "Close" || o.Name == "Exit" || o.Name == "Zerar" || o.Name == "Copy_Close" || o.Name == "RiskClose" || o.Name == "NakedClose" || o.Name == "Axion_Close" || o.Name == "Axion_RiskClose")));
                    }

                    if (hasActiveExit)
                    {
                        return false;
                    }
                }

                _inFlightClosingRequests[key] = now;

                // CAMUFLAGEM CHART TRADER: Criação e submissão 100% stealth sem carimbo de AddOn
                Order closeOrder = CreateStealthOrder(targetAccount, targetInstrument, closeAction, OrderType.Market, OrderEntry.Manual, TimeInForce.Gtc, quantity, 0, 0, "", tag);
                RegisterInternalOrder(closeOrder.OrderId);
                RegisterCopyOrder(closeOrder.OrderId);
                StealthSubmit(targetAccount, closeOrder);
                return true;
            }
            catch (Exception ex)
            {
                Log($"[ERRO SUBMIT CLOSE]: {ex.Message}");
                return false;
            }
        }

        #region Persistência e Resiliência de Regras de Copy Trading

        private static string GetCopyRulesFilePath()
        {
            try
            {
                string dir = NinjaTrader.Core.Globals.UserDataDir;
                if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir))
                    return Path.Combine(dir, "vortex_copy_rules.json");
            }
            catch { }
            try
            {
                string myDocs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), @"NinjaTrader 8\vortex_copy_rules.json");
                string docsDir = Path.GetDirectoryName(myDocs);
                if (!Directory.Exists(docsDir)) Directory.CreateDirectory(docsDir);
                return myDocs;
            }
            catch { }
            return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "vortex_copy_rules.json");
        }

        private static string _lastSavedRulesJson = "";

        public static void SaveCopyRulesToDisk()
        {
            try
            {
                string path = GetCopyRulesFilePath();
                var rulesList = _copyRules.Values.ToList();
                var sb = new StringBuilder();
                sb.Append("{\"rules\":[");
                for (int i = 0; i < rulesList.Count; i++)
                {
                    if (i > 0) sb.Append(",");
                    var r = rulesList[i];
                    sb.Append("{");
                    sb.Append($"\"id\":\"{r.Id}\",");
                    sb.Append($"\"masterAccount\":\"{r.MasterAccountName}\",");
                    sb.Append($"\"slaveAccount\":\"{r.SlaveAccountName}\",");
                    sb.Append($"\"lotMultiplier\":{r.LotMultiplier.ToString("F2", CultureInfo.InvariantCulture)},");
                    sb.Append($"\"isActive\":{(r.IsActive ? "true" : "false")},");
                    sb.Append($"\"allowedSymbols\":\"{r.AllowedSymbols}\",");
                    sb.Append($"\"executionSymbol\":\"{r.ExecutionSymbol}\",");
                    sb.Append($"\"symbolMapping\":\"{r.SymbolMapping}\",");
                    sb.Append($"\"maxDailyLoss\":{r.MaxDailyLoss.ToString("F2", CultureInfo.InvariantCulture)},");
                    sb.Append($"\"maxDailyTrades\":{r.MaxDailyTrades},");
                    sb.Append($"\"copyAtmStrategy\":{(r.CopyAtmStrategy ? "true" : "false")},");
                    sb.Append($"\"closeSlavesOnMasterClose\":{(r.CloseSlavesOnMasterClose ? "true" : "false")},");
                    sb.Append($"\"cancelOrphanOrders\":{(r.CancelOrphanOrders ? "true" : "false")}");
                    sb.Append("}");
                }
                sb.Append("]}");
                string jsonStr = sb.ToString();

                // ⚡ Economia de I/O de disco e silenciamento de logs repetitivos: grava apenas se houve alteração real
                if (string.Equals(jsonStr, _lastSavedRulesJson, StringComparison.Ordinal))
                {
                    return;
                }
                _lastSavedRulesJson = jsonStr;

                File.WriteAllText(path, jsonStr, Encoding.UTF8);
                Log($"💾 [COPY RULES]: {_copyRules.Count} regras salvas em disco: {path}");
            }
            catch (Exception ex)
            {
                Log($"[ERRO AO SALVAR COPY RULES]: {ex.Message}");
            }
        }

        public static void LoadCopyRulesFromDisk()
        {
            try
            {
                string path = GetCopyRulesFilePath();
                if (!File.Exists(path)) return;
                string content = File.ReadAllText(path, Encoding.UTF8);
                if (string.IsNullOrWhiteSpace(content)) return;

                UpdateCopyRulesFromJson(content);
                Log($"⚡ [COPY RULES]: {_copyRules.Count} regras de Copy Trading carregadas da memória persistida no disco.");
            }
            catch (Exception ex)
            {
                Log($"[ERRO AO CARREGAR COPY RULES]: {ex.Message}");
            }
        }

        private static void UpdateCopyRulesFromJson(string json)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(json)) return;
                _copyRules.Clear();

                int rulesIdx = json.IndexOf("\"rules\":[", StringComparison.OrdinalIgnoreCase);
                if (rulesIdx < 0) rulesIdx = json.IndexOf("\"rules\": [", StringComparison.OrdinalIgnoreCase);
                if (rulesIdx >= 0)
                {
                    int startArr = json.IndexOf('[', rulesIdx);
                    int endArr = json.IndexOf(']', startArr);
                    if (startArr >= 0 && endArr > startArr)
                    {
                        string arrStr = json.Substring(startArr + 1, endArr - startArr - 1);
                        string[] itemStrs = arrStr.Split(new[] { "}," }, StringSplitOptions.RemoveEmptyEntries);
                        foreach (var itemStr in itemStrs)
                        {
                            string item = itemStr.Trim();
                            if (!item.EndsWith("}")) item += "}";
                            string id = ExtractJsonString(item, "id") ?? Guid.NewGuid().ToString("N");
                            string master = ExtractJsonString(item, "masterAccount") ?? ExtractJsonString(item, "master_account_name") ?? ExtractJsonString(item, "master_account_id") ?? "";
                            string slave = ExtractJsonString(item, "slaveAccount") ?? ExtractJsonString(item, "slave_account_name") ?? ExtractJsonString(item, "slave_account_id") ?? "";
                            double mult = ExtractJsonDouble(item, "lotMultiplier", 1.0);
                            if (mult <= 0) mult = ExtractJsonDouble(item, "lot_multiplier", 1.0);
                            bool active = ExtractJsonBool(item, "isActive", true);
                            if (item.Contains("\"is_active\"")) active = ExtractJsonBool(item, "is_active", true);
                            string allowedSym = ExtractJsonString(item, "allowedSymbols") ?? ExtractJsonString(item, "allowed_symbols") ?? "TODOS";
                            string execSym = ExtractJsonString(item, "executionSymbol") ?? ExtractJsonString(item, "execution_symbol") ?? "";
                            string mapSym = ExtractJsonString(item, "symbolMapping") ?? ExtractJsonString(item, "symbol_mapping") ?? "";
                            double maxLoss = ExtractJsonDouble(item, "maxDailyLoss", 0);
                            int maxTrades = ExtractJsonInt(item, "maxDailyTrades", 0);
                            bool copyAtm = ExtractJsonBool(item, "copyAtmStrategy", true);
                            if (item.Contains("\"copy_atm_strategy\"")) copyAtm = ExtractJsonBool(item, "copy_atm_strategy", true);
                            bool closeOnMasterClose = ExtractJsonBool(item, "closeSlavesOnMasterClose", true);
                            if (item.Contains("\"close_slaves_on_master_close\"")) closeOnMasterClose = ExtractJsonBool(item, "close_slaves_on_master_close", true);
                            bool cancelOrphan = ExtractJsonBool(item, "cancelOrphanOrders", false);
                            if (item.Contains("\"cancel_orphan_orders\"")) cancelOrphan = ExtractJsonBool(item, "cancel_orphan_orders", false);

                            if (!string.IsNullOrEmpty(master) && !string.IsNullOrEmpty(slave))
                            {
                                var rule = new CopyTradingRule
                                {
                                    Id = id,
                                    MasterAccountName = master,
                                    SlaveAccountName = slave,
                                    LotMultiplier = mult > 0 ? mult : 1.0,
                                    IsActive = active,
                                    AllowedSymbols = allowedSym,
                                    ExecutionSymbol = execSym,
                                    SymbolMapping = mapSym,
                                    MaxDailyLoss = maxLoss,
                                    MaxDailyTrades = maxTrades,
                                    CopyAtmStrategy = copyAtm,
                                    CloseSlavesOnMasterClose = closeOnMasterClose,
                                    CancelOrphanOrders = cancelOrphan
                                };
                                // Deduplicação estrita: substitui qualquer regra anterior com o mesmo par Master e Slave
                                var existingPair = _copyRules.Values.FirstOrDefault(r => 
                                    string.Equals(r.MasterAccountName?.Trim(), master.Trim(), StringComparison.OrdinalIgnoreCase) &&
                                    string.Equals(r.SlaveAccountName?.Trim(), slave.Trim(), StringComparison.OrdinalIgnoreCase));
                                if (existingPair != null && existingPair.Id != rule.Id)
                                {
                                    _copyRules.TryRemove(existingPair.Id, out _);
                                }
                                _copyRules[rule.Id] = rule;
                            }
                        }
                    }

                    // 💾 Persiste regras imediatamente no disco (vortex_copy_rules.json)
                    SaveCopyRulesToDisk();
                }

                if (json.Contains("\"accounts\":") || json.Contains("\"account_risks\":"))
                {
                    UpdateAccountRisksFromJson(json);
                    SaveAccountRisksToDisk();
                }

                if (json.Contains("\"permitir_ordens_pendentes_master\"") || json.Contains("\"permitirOrdensPendentesMaster\""))
                {
                    AxionGatewayState.PermitirOrdensPendentesMaster = ExtractJsonBool(json, "permitir_ordens_pendentes_master", ExtractJsonBool(json, "permitirOrdensPendentesMaster", AxionGatewayState.PermitirOrdensPendentesMaster));
                    AxionGatewayState.Save();
                }
            }
            catch (Exception ex)
            {
                Log($"[ERRO AO PROCESSAR JSON DE COPY RULES]: {ex.Message}");
            }
        }

        private static string GetRiskConfigFilePath() => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            @"NinjaTrader 8\bin\Custom\AxionGatewayRiskConfig.json"
        );

        private static readonly ConcurrentDictionary<string, DateTime> _lastRejectionLogTime = new ConcurrentDictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);

        private static void LogRejectionDebounced(string slaveAccName, string reason, string details = "")
        {
            string key = $"{slaveAccName}_{reason}";
            DateTime now = DateTime.UtcNow;
            if (_lastRejectionLogTime.TryGetValue(key, out DateTime lastTime))
            {
                if ((now - lastTime).TotalSeconds < 5)
                {
                    return; // Suprime repetição da mesma mensagem de rejeição nos últimos 5s
                }
            }
            _lastRejectionLogTime[key] = now;
            Log($"⚠️ [COPY BLOQUEADO]: Conta {slaveAccName} -> {reason} {details}".Trim());
        }

        private static bool CanAccountTrade(AccountRiskInfo sRisk, out string rejectReason)
        {
            rejectReason = "";
            if (sRisk == null) return true;

            if (sRisk.IsBlocked)
            {
                rejectReason = $"Conta {sRisk.AccountName} bloqueada por gerenciamento de risco diário.";
                return false;
            }

            // 1. Checagem dinâmica em tempo real de Meta de Loss ou Take Diário
            if (sRisk.Account != null && (sRisk.DailyLossLimitUsd > 0 || sRisk.DailyProfitTargetUsd > 0))
            {
                try
                {
                    double realized = 0, unrealized = 0, cash = 0;
                    try { realized = sRisk.Account.Get(AccountItem.RealizedProfitLoss, Currency.UsDollar); } catch { }
                    try { unrealized = sRisk.Account.Get(AccountItem.UnrealizedProfitLoss, Currency.UsDollar); } catch { }
                    try { cash = sRisk.Account.Get(AccountItem.CashValue, Currency.UsDollar); } catch { }

                    double sessionPnL = realized + unrealized;
                    if (Math.Abs(sessionPnL) < 0.01 && sRisk.InitialCashValue > 100 && cash > 100)
                    {
                        sessionPnL = cash - sRisk.InitialCashValue;
                    }

                    if (sRisk.DailyLossLimitUsd > 0 && sessionPnL <= -Math.Abs(sRisk.DailyLossLimitUsd))
                    {
                        sRisk.IsBlocked = true;
                        sRisk.WasStopLossTriggered = true;
                        rejectReason = $"Limite de perda diária atingido (-${Math.Abs(sessionPnL):F2} / Limite: -${Math.Abs(sRisk.DailyLossLimitUsd):F2}).";
                        return false;
                    }

                    if (sRisk.DailyProfitTargetUsd > 0 && sessionPnL >= Math.Abs(sRisk.DailyProfitTargetUsd))
                    {
                        sRisk.IsBlocked = true;
                        sRisk.WasTakeProfitTriggered = true;
                        rejectReason = $"Meta de ganho diário atingida (+${sessionPnL:F2} / Meta: +${Math.Abs(sRisk.DailyProfitTargetUsd):F2}).";
                        return false;
                    }
                }
                catch { }
            }

            // 2. Quantidade máxima de operações diárias
            if (sRisk.MaxDailyTrades > 0 && sRisk.DailyTradesCount >= sRisk.MaxDailyTrades)
            {
                rejectReason = $"Limite diário de operações atingido ({sRisk.DailyTradesCount}/{sRisk.MaxDailyTrades} trades).";
                return false;
            }

            // 3. Horário operacional permitido
            if (!string.IsNullOrWhiteSpace(sRisk.TradingStartTime) && !string.IsNullOrWhiteSpace(sRisk.TradingEndTime))
            {
                string sTime = sRisk.TradingStartTime.Trim();
                string eTime = sRisk.TradingEndTime.Trim();

                bool is24h = (sTime == "00:00" || sTime == "00:00:00") && (eTime == "23:59" || eTime == "23:59:59" || eTime == "00:00" || eTime == "00:00:00") || (sTime == eTime);

                if (!is24h)
                {
                    if (TimeSpan.TryParse(sTime, out TimeSpan startT) && TimeSpan.TryParse(eTime, out TimeSpan endT))
                    {
                        TimeSpan nowT = DateTime.Now.TimeOfDay;
                        bool inWindow = startT <= endT ? (nowT >= startT && nowT <= endT) : (nowT >= startT || nowT <= endT);
                        if (!inWindow)
                        {
                            string startDisp = sTime.Length >= 5 ? sTime.Substring(0, 5) : sTime;
                            string endDisp = eTime.Length >= 5 ? eTime.Substring(0, 5) : eTime;
                            rejectReason = $"Fora da janela de horários permitidos ({startDisp} às {endDisp}).";
                            return false;
                        }
                    }
                }
            }

            return true;
        }

        private static string _lastSavedAccountRisksJson = "";

        public static void SaveAccountRisksToDisk()
        {
            try
            {
                string path = GetRiskConfigFilePath();
                var sb = new StringBuilder();
                sb.Append("{\"accounts\":[");
                var list = _accountRiskStates.Values.ToList();
                for (int i = 0; i < list.Count; i++)
                {
                    if (i > 0) sb.Append(",");
                    var r = list[i];
                    sb.Append("{");
                    sb.Append($"\"account_name\":\"{r.AccountName}\",");
                    sb.Append($"\"daily_loss_limit\":{r.DailyLossLimitUsd.ToString("F2", CultureInfo.InvariantCulture)},");
                    sb.Append($"\"daily_profit_target\":{r.DailyProfitTargetUsd.ToString("F2", CultureInfo.InvariantCulture)},");
                    sb.Append($"\"max_daily_trades\":{r.MaxDailyTrades},");
                    sb.Append($"\"max_lots\":{r.MaxLots},");
                    sb.Append($"\"trading_start_time\":\"{r.TradingStartTime}\",");
                    sb.Append($"\"trading_end_time\":\"{r.TradingEndTime}\",");
                    sb.Append($"\"allow_multi_signals\":{(r.AllowMultiSignals ? "true" : "false")}");
                    sb.Append("}");
                }
                sb.Append("]}");
                string jsonStr = sb.ToString();

                if (string.Equals(jsonStr, _lastSavedAccountRisksJson, StringComparison.Ordinal))
                {
                    return; // Sem alterações
                }
                _lastSavedAccountRisksJson = jsonStr;

                File.WriteAllText(path, jsonStr, Encoding.UTF8);
            }
            catch { }
        }

        public static void LoadAccountRisksFromDisk()
        {
            try
            {
                string path = GetRiskConfigFilePath();
                if (!File.Exists(path)) return;
                string content = File.ReadAllText(path, Encoding.UTF8);
                UpdateAccountRisksFromJson(content);
            }
            catch { }
        }

        public static void UpdateAccountRisksFromJson(string json)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(json)) return;
                int accIdx = json.IndexOf("\"accounts\":[", StringComparison.OrdinalIgnoreCase);
                if (accIdx < 0) accIdx = json.IndexOf("\"accounts\": [", StringComparison.OrdinalIgnoreCase);
                if (accIdx < 0) accIdx = json.IndexOf("\"account_risks\":[", StringComparison.OrdinalIgnoreCase);
                if (accIdx < 0) accIdx = json.IndexOf("\"account_risks\": [", StringComparison.OrdinalIgnoreCase);

                if (accIdx >= 0)
                {
                    int startArr = json.IndexOf('[', accIdx);
                    int endArr = json.IndexOf(']', startArr);
                    if (startArr >= 0 && endArr >= startArr)
                    {
                        string arrStr = (endArr > startArr + 1) ? json.Substring(startArr + 1, endArr - startArr - 1) : "";
                        string[] itemStrs = !string.IsNullOrWhiteSpace(arrStr) ? arrStr.Split(new[] { "}," }, StringSplitOptions.RemoveEmptyEntries) : new string[0];
                        var incomingNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                        foreach (var itemStr in itemStrs)
                        {
                            string item = itemStr.Trim();
                            if (!item.EndsWith("}")) item += "}";
                            string name = ExtractJsonString(item, "account_name") ?? ExtractJsonString(item, "name") ?? "";
                            if (string.IsNullOrWhiteSpace(name)) continue;

                            incomingNames.Add(name);

                            double lossLimit = ExtractJsonDouble(item, "daily_loss_limit", 0);
                            if (lossLimit <= 0) lossLimit = ExtractJsonDouble(item, "trader_daily_stop_loss_usd", 0);
                            if (lossLimit <= 0) lossLimit = ExtractJsonDouble(item, "maxDailyLoss", 0);
                            double profitTarget = ExtractJsonDouble(item, "daily_profit_target", 0);
                            if (profitTarget <= 0) profitTarget = ExtractJsonDouble(item, "trader_daily_take_profit_usd", 0);
                            if (profitTarget <= 0) profitTarget = ExtractJsonDouble(item, "dailyProfitTarget", 0);

                            int maxTrades = ExtractJsonInt(item, "max_daily_trades", 0);
                            if (maxTrades <= 0) maxTrades = ExtractJsonInt(item, "maxDailyTrades", 0);
                            if (maxTrades <= 0) maxTrades = ExtractJsonInt(item, "manual_max_daily_trades", 0);

                            int maxLots = ExtractJsonInt(item, "max_lots", 0);
                            if (maxLots <= 0) maxLots = ExtractJsonInt(item, "manual_max_lots", 0);
                            if (maxLots <= 0) maxLots = ExtractJsonInt(item, "maxLots", 0);

                            string startTime = ExtractJsonString(item, "trading_start_time") ?? ExtractJsonString(item, "start_time") ?? ExtractJsonString(item, "manual_start_time") ?? "";
                            string endTime = ExtractJsonString(item, "trading_end_time") ?? ExtractJsonString(item, "end_time") ?? ExtractJsonString(item, "manual_end_time") ?? "";
                            bool allowMulti = ExtractJsonBool(item, "allow_multi_signals", true);
                            if (item.Contains("\"allow_multi\"")) allowMulti = ExtractJsonBool(item, "allow_multi", true);

                            if (_accountRiskStates.TryGetValue(name, out var rInfo))
                            {
                                rInfo.DailyLossLimitUsd = lossLimit;
                                rInfo.DailyProfitTargetUsd = profitTarget;
                                rInfo.MaxDailyTrades = maxTrades;
                                rInfo.MaxLots = maxLots;
                                rInfo.TradingStartTime = startTime;
                                rInfo.TradingEndTime = endTime;
                                rInfo.AllowMultiSignals = allowMulti;
                                rInfo.IsSynchronized = true;
                            }
                            else
                            {
                                Account acc = null;
                                lock (Account.All)
                                {
                                    acc = Account.All.FirstOrDefault(a => string.Equals(a.Name, name, StringComparison.OrdinalIgnoreCase));
                                }
                                var newInfo = new AccountRiskInfo(acc)
                                {
                                    AccountName = name,
                                    DailyLossLimitUsd = lossLimit,
                                    DailyProfitTargetUsd = profitTarget,
                                    MaxDailyTrades = maxTrades,
                                    MaxLots = maxLots,
                                    TradingStartTime = startTime,
                                    TradingEndTime = endTime,
                                    AllowMultiSignals = allowMulti,
                                    IsSynchronized = true
                                };
                                _accountRiskStates[name] = newInfo;
                            }
                        }

                        // Remove ou desmarca qualquer conta que NÃO esteja presente na sincronização do Painel Web
                        lock (_accountRiskStates)
                        {
                            foreach (var key in _accountRiskStates.Keys.ToList())
                            {
                                if (!incomingNames.Contains(key))
                                {
                                    _accountRiskStates.Remove(key);
                                }
                            }
                        }

                        SaveAccountRisksToDisk();
                        NotifyRiskConfigUpdated();
                    }
                }
            }
            catch { }
        }

        public static bool IsSymbolAllowed(Instrument inst, CopyTradingRule rule)
        {
            if (inst == null || rule == null) return false;
            string allowed = rule.AllowedSymbols;
            if (string.IsNullOrWhiteSpace(allowed) || 
                allowed.Trim().Equals("ALL", StringComparison.OrdinalIgnoreCase) || 
                allowed.Trim().Equals("*", StringComparison.OrdinalIgnoreCase) ||
                allowed.Trim().Equals("TODOS", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            string instName = inst.FullName ?? "";
            string masterName = inst.MasterInstrument?.Name ?? "";
            string[] allowedList = allowed.Split(new[] { ',', ';', ' ', '|' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var sym in allowedList)
            {
                string s = sym.Trim();
                if (string.IsNullOrEmpty(s)) continue;
                if (masterName.Equals(s, StringComparison.OrdinalIgnoreCase) ||
                    instName.StartsWith(s, StringComparison.OrdinalIgnoreCase) ||
                    instName.IndexOf(s, StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    return true;
                }
            }
            return false;
        }

        private static Instrument ResolveSlaveInstrument(Instrument masterInstrument, CopyTradingRule rule)
        {
            if (masterInstrument == null) return null;
            if (!string.IsNullOrEmpty(rule.ExecutionSymbol))
            {
                var fixedInst = Instrument.GetInstrument(rule.ExecutionSymbol.Trim()) ?? Instrument.GetInstrument(rule.ExecutionSymbol.Split(' ')[0]);
                if (fixedInst != null) return fixedInst;
            }

            if (!string.IsNullOrEmpty(rule.SymbolMapping))
            {
                string masterName = masterInstrument.FullName ?? masterInstrument.MasterInstrument?.Name ?? "";
                string cleanMaster = masterName.Split(' ')[0].ToUpperInvariant();
                string[] pairs = rule.SymbolMapping.Split(new[] { ',', ';', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var pair in pairs)
                {
                    string fromSym = "", toSym = "";
                    if (pair.Contains("->"))
                    {
                        var parts = pair.Split(new[] { "->" }, StringSplitOptions.None);
                        fromSym = parts[0].Trim().ToUpperInvariant();
                        toSym = parts.Length > 1 ? parts[1].Trim() : "";
                    }
                    else if (pair.Contains(":"))
                    {
                        var parts = pair.Split(':');
                        fromSym = parts[0].Trim().ToUpperInvariant();
                        toSym = parts.Length > 1 ? parts[1].Trim() : "";
                    }

                    if (cleanMaster.Equals(fromSym, StringComparison.OrdinalIgnoreCase) || masterName.StartsWith(fromSym, StringComparison.OrdinalIgnoreCase))
                    {
                        var mappedInst = Instrument.GetInstrument(toSym) ?? Instrument.GetInstrument(toSym.Split(' ')[0]);
                        if (mappedInst != null) return mappedInst;
                    }
                }
            }

            return masterInstrument;
        }

        #endregion

        public static AxionGatewayAddOn GetInstance() => _instance;

        public static void RegisterLogger(Action<string> logger) => _loggerAction = logger;
        public static void UnregisterLogger() => _loggerAction = null;

        public static void Log(string msg)
        {
            string formatted = $"[{DateTime.Now:HH:mm:ss}] {msg}";
            NinjaTrader.Code.Output.Process(formatted, PrintTo.OutputTab1);
            _loggerAction?.Invoke(formatted);
        }

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = "Axion Gateway V2 — Servidor Local de Alta Performance (< 1ms), Sincronização e Monitor Telegram";
                Name = "AxionGatewayAddOn";
                _instance = this;
            }
            else if (State == State.Active)
            {
                AxionGatewayState.Load();
                AxionLicenseManager.Inicializar();
                LoadCopyRulesFromDisk();
                LoadAccountRisksFromDisk();
                StartLocalGateway();
                VortexCloudTunnelClient.Start();
                TryAttachToOpenControlCenter();
                SubscribeToAllAccounts();
                StartPeriodicTimers();
                try { Connection.ConnectionStatusUpdate += OnConnectionStatusUpdate; } catch { }
                Log("⚡ Axion Gateway V2 ATIVADO com sucesso!");
                if (AxionLicenseManager.IsLicensed)
                    Log($"🔑 [LICENÇA]: {AxionLicenseManager.StatusMensagem}");
                else
                    Log($"⚠️ [LICENÇA]: {AxionLicenseManager.StatusMensagem}");
            }
            else if (State == State.Terminated)
            {
                try { Connection.ConnectionStatusUpdate -= OnConnectionStatusUpdate; } catch { }
                VortexCloudTunnelClient.Stop();
                StopLocalGateway();
                UnsubscribeFromAllAccounts();
                StopPeriodicTimers();
                _instance = null;
                Log("○ Axion Gateway V2 Encerrado.");
            }
        }

        #region Inscrição de Eventos de Contas e Brackets

        private void SubscribeToAllAccounts()
        {
            try
            {
                lock (Account.All)
                {
                    foreach (var acc in Account.All)
                    {
                        if (acc == null) continue;
                        EnsureAccountSubscribed(acc);
                    }
                }
            }
            catch { }
        }

        private void UnsubscribeFromAllAccounts()
        {
            try
            {
                lock (_subscribedAccounts)
                {
                    foreach (var acc in _subscribedAccounts)
                    {
                        if (acc == null) continue;
                        try { acc.ExecutionUpdate -= OnAccountExecutionUpdate; } catch { }
                        try { acc.PositionUpdate -= OnAccountPositionUpdate; } catch { }
                        try { acc.OrderUpdate -= OnAccountOrderUpdate; } catch { }
                    }
                    _subscribedAccounts.Clear();
                }
            }
            catch { }
        }

        private static void EnsureAccountSubscribed(Account acc)
        {
            if (acc == null) return;
            lock (_subscribedAccounts)
            {
                if (!_subscribedAccounts.Contains(acc))
                {
                    acc.ExecutionUpdate += OnAccountExecutionUpdate;
                    acc.PositionUpdate += OnAccountPositionUpdate;
                    acc.OrderUpdate += OnAccountOrderUpdate;
                    _subscribedAccounts.Add(acc);

                    if (!_accountRiskStates.ContainsKey(acc.Name))
                    {
                        _accountRiskStates[acc.Name] = new AccountRiskInfo(acc);
                    }
                }
            }
        }

        private void OnConnectionStatusUpdate(object sender, ConnectionStatusEventArgs e)
        {
            try
            {
                if (e == null) return;
                string connName = e.Connection?.Options?.Name ?? "NinjaTrader Conexão";
                var status = e.Status;
                var prevStatus = e.PreviousStatus;

                Log($"🔌 [MONITOR CONEXÃO] {connName}: Status = {status} (Anterior: {prevStatus})");

                // Se restabeleceu ou conectou, re-sincronizar todas as contas imediatamente
                if (status == ConnectionStatus.Connected)
                {
                    SubscribeToAllAccounts();
                }

                if (!AxionGatewayState.NotificarStatusConexao) return;

                if (status == ConnectionStatus.ConnectionLost)
                {
                    string msg = $"🚨 <b>ALERTA CRÍTICO: CONEXÃO PERDIDA NO NINJATRADER!</b> 🚨\n\n" +
                                 $"🔌 <b>Provedor/Conexão:</b> <code>{connName}</code>\n" +
                                 $"⚠️ <b>Status da Conexão:</b> <code>{status}</code>\n" +
                                 $"📊 <b>Status Anterior:</b> <code>{prevStatus}</code>\n" +
                                 $"⏰ <b>Horário:</b> <code>{DateTime.Now:HH:mm:ss}</code>\n\n" +
                                 $"⚠️ <b>Atenção:</b> A conexão com a corretora/mesa caiu. Os gráficos podem congelar/bloquear e novas ordens não serão enviadas! Verifique o NinjaTrader imediatamente.";

                    SendTelegramMessageAsync(msg);
                }
                else if (status == ConnectionStatus.Disconnected && prevStatus != ConnectionStatus.Connecting)
                {
                    string msg = $"⚠️ <b>AVISO: Conexão Desconectada no NinjaTrader</b>\n\n" +
                                 $"🔌 <b>Provedor/Conexão:</b> <code>{connName}</code>\n" +
                                 $"📊 <b>Status Anterior:</b> <code>{prevStatus}</code>\n" +
                                 $"⏰ <b>Horário:</b> <code>{DateTime.Now:HH:mm:ss}</code>";

                    SendTelegramMessageAsync(msg);
                }
                else if (status == ConnectionStatus.Connected)
                {
                    string msg = $"🟢 <b>Conexão Estabelecida com Sucesso!</b>\n\n" +
                                 $"🔌 <b>Provedor/Conexão:</b> <code>{connName}</code>\n" +
                                 $"⏰ <b>Horário:</b> <code>{DateTime.Now:HH:mm:ss}</code>\n" +
                                 $"✅ <i>NinjaTrader online e sincronizado com o painel Axion TradeStation.</i>";

                    SendTelegramMessageAsync(msg);
                }
            }
            catch (Exception ex)
            {
                Log($"Erro no monitor de conexão OnConnectionStatusUpdate: {ex.Message}");
            }
        }

        private static void OnAccountPositionUpdate(object sender, PositionEventArgs e)
        {
            try
            {
                var account = sender as Account ?? e.Position?.Account;
                if (account == null) return;

                // Execução totalmente Assíncrona para NUNCA travar a thread de eventos do NinjaTrader
                Task.Run(() =>
                {
                    try
                    {
                        Instrument inst = e.Position?.Instrument;
                        if (inst == null) return;

                        // 1. VERIFICAÇÃO RIGOROSA: A posição desta conta para este ativo está REALMENTE FLAT (zerada)?
                        Position accPos = null;
                        if (account.Positions != null)
                        {
                            lock (account.Positions)
                            {
                                accPos = account.Positions.FirstOrDefault(p => 
                                    p != null && (
                                        p.Instrument == inst || 
                                        (p.Instrument != null && (
                                            p.Instrument.FullName == inst.FullName || 
                                            (p.Instrument.MasterInstrument != null && inst.MasterInstrument != null && string.Equals(p.Instrument.MasterInstrument.Name, inst.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))
                                        ))
                                    )
                                );
                            }
                        }

                        bool isTrulyFlat = (accPos == null || accPos.MarketPosition == MarketPosition.Flat || accPos.Quantity == 0);

                        // 🧹 Se a conta ficou FLAT (seja Master, Slave ou Avulsa/Standalone), cancelar imediatamente qualquer ordem órfã (SL/TP)
                        if (isTrulyFlat)
                        {
                            CancelarOrdensPendentes(account, inst);
                        }

                        // 2. SÓ PROCESSAR ESPELHAMENTO se a conta for MASTER em alguma regra de copy ativa
                        var matchingCloseRules = _copyRules.Values.Where(r => r.IsActive && string.Equals(r.MasterAccountName, account.Name, StringComparison.OrdinalIgnoreCase)).ToList();
                        if (matchingCloseRules.Count == 0)
                        {
                            // Se a conta for uma Slave ou avulsa, apenas validar gestão de risco se for monitorada
                            if (IsAccountMonitored(account.Name))
                            {
                                VerificarGestaoDeRisco(account);
                            }
                            return;
                        }

                        bool isMasterTrulyFlat = isTrulyFlat;

                        // 🔒 TRAVA CRÍTICA: Se a Master AINDA POSSUI POSIÇÃO ABERTA (ex: 2 contratos, 4 contratos, aumento de posição, etc.),
                        // NUNCA disparar zeragem nas Slaves, NUNCA cancelar ordens de proteção das Slaves e NUNCA enfileirar evento CLOSE!
                        if (!isMasterTrulyFlat)
                        {
                            foreach (var rule in matchingCloseRules)
                            {
                                try
                                {
                                    Account slaveAcc = null;
                                    lock (Account.All)
                                    {
                                        slaveAcc = Account.All.FirstOrDefault(a => a != null && string.Equals(a.Name, rule.SlaveAccountName, StringComparison.OrdinalIgnoreCase));
                                    }
                                    if (slaveAcc != null && IsAccountReadyForTrading(slaveAcc))
                                    {
                                        Instrument slaveInst = ResolveSlaveInstrument(inst, rule) ?? inst;
                                        ReconcileSlaveBrackets(account, slaveAcc, inst, slaveInst, rule);
                                    }
                                }
                                catch { }
                            }

                            if (IsAccountMonitored(account.Name))
                            {
                                VerificarGestaoDeRisco(account);
                            }
                            return;
                        }

                        // A partir daqui, a Master está 100% CONFIRMADA COMO FLAT (ZERO CONTRATOS):
                        // A. Cancelar ordens órfãs de proteção (SL/TP) na conta Master (NUNCA ordens de entrada)
                        var orphanOrders = account.Orders.Where(o => 
                            o != null && o.Instrument != null && 
                            (o.Instrument == inst || o.Instrument.FullName == inst.FullName || (o.Instrument.MasterInstrument != null && inst.MasterInstrument != null && string.Equals(o.Instrument.MasterInstrument.Name, inst.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))) && 
                            (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted) &&
                            IsExitOrProtectionOrderName(o.Name)
                        ).ToList();

                        if (orphanOrders.Count > 0)
                        {
                            SafeCancelOrders(account, orphanOrders.ToArray());
                            Log($"[AUTO-CLEANUP 🧹]: Posição zerada na Master {account.Name}. {orphanOrders.Count} ordens de proteção (SL/TP) canceladas para {inst.FullName}.");
                        }

                        string masterSymKey = $"{account.Name}_{inst.FullName}";
                        _lastReportedMasterLevels.TryRemove(masterSymKey, out _);

                        double exitP = 0;
                        try
                        {
                            if (account.Executions != null)
                            {
                                lock (account.Executions)
                                {
                                    var lastExec = account.Executions.LastOrDefault(e => e != null && e.Instrument != null && 
                                        (e.Instrument == inst || e.Instrument.FullName == inst.FullName || (e.Instrument.MasterInstrument != null && inst.MasterInstrument != null && string.Equals(e.Instrument.MasterInstrument.Name, inst.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))));
                                    if (lastExec != null && lastExec.Price > 0)
                                    {
                                        exitP = lastExec.Price;
                                    }
                                }
                            }
                        }
                        catch { }

                        // B. Notificação de Zeragem para o Painel Web (Copy Reverso)
                        var closeEv = new MasterExecutionEvent
                        {
                            EventType = "CLOSE",
                            AccountName = account.Name,
                            Symbol = inst.FullName,
                            Action = "FLAT",
                            Quantity = 0,
                            Price = exitP,
                            Timestamp = DateTime.UtcNow.ToString("o")
                        };
                        _masterEventsQueue.Enqueue(closeEv);
                        Log($"📡 [MASTER CLOSE CONFIRMADO]: Posição zerada em {closeEv.Symbol} na Master {account.Name}. Encerrando Slaves correspondentes...");

                        // C. Fechamento Instantâneo C# (<0.1ms) para Todas as Contas Slaves Conectadas
                        foreach (var rule in matchingCloseRules)
                        {
                            try
                            {
                                if (string.Equals(rule.SlaveAccountName, account.Name, StringComparison.OrdinalIgnoreCase) ||
                                    string.Equals(rule.SlaveAccountName, rule.MasterAccountName, StringComparison.OrdinalIgnoreCase))
                                {
                                    continue;
                                }

                                Account slaveAcc = null;
                                lock (Account.All)
                                {
                                    slaveAcc = Account.All.FirstOrDefault(a => a != null && string.Equals(a.Name, rule.SlaveAccountName, StringComparison.OrdinalIgnoreCase));
                                }
                                if (slaveAcc != null && !string.Equals(slaveAcc.Name, account.Name, StringComparison.OrdinalIgnoreCase))
                                {
                                    if (!IsAccountReadyForTrading(slaveAcc)) continue;

                                    EnsureAccountSubscribed(slaveAcc);
                                    Instrument slaveInst = ResolveSlaveInstrument(inst, rule) ?? inst;

                                    // 🔒 CRÍTICO: Respeita rigorosamente a configuração da regra da Slave!
                                    // Se a regra estiver configurada com CloseSlavesOnMasterClose == false (Zerar c/ Master = NÃO),
                                    // a Slave NUNCA deve ser encerrada ao fechar a Master, e suas ordens de proteção (SL/TP) DEVEM ser preservadas!
                                    if (!rule.CloseSlavesOnMasterClose)
                                    {
                                        string normInstKey = GetNormalizedInstrumentKey(inst.FullName);
                                        _activeCopiedPositions.TryRemove($"{account.Name}_{rule.SlaveAccountName}_{normInstKey}", out _);
                                        Log($"ℹ️ [COPY CLOSE PRESERVADO]: Slave {rule.SlaveAccountName} configurada para NÃO zerar com a Master {account.Name} (CloseSlavesOnMasterClose = false). Posição e proteção mantidas.");
                                        continue;
                                    }

                                    var slavePos = slaveAcc.Positions.FirstOrDefault(sp => sp != null && sp.MarketPosition != MarketPosition.Flat && Math.Abs(sp.Quantity) > 0 && (
                                        slaveInst == null ||
                                        sp.Instrument == slaveInst || 
                                        (sp.Instrument != null && slaveInst != null && (
                                            sp.Instrument.FullName == slaveInst.FullName || 
                                            (sp.Instrument.MasterInstrument != null && slaveInst.MasterInstrument != null && string.Equals(sp.Instrument.MasterInstrument.Name, slaveInst.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))
                                        ))
                                    ));

                                    // 🔒 CRÍTICO: Se a Slave NÃO possui posição aberta neste ativo específico (slaveInst),
                                    // NUNCA encerrar posições de outros ativos na Slave!
                                    if (slavePos != null)
                                    {
                                        MarkAccountFlattening(slaveAcc.Name, 2.5, slaveInst?.FullName);
                                        CancelarOrdensPendentes(slaveAcc, slaveInst);

                                        OrderAction closeAction = slavePos.MarketPosition == MarketPosition.Long ? OrderAction.Sell : OrderAction.Buy;
                                        int closeQty = Math.Abs(slavePos.Quantity);
                                        if (SafeSubmitCloseOrder(slaveAcc, slavePos.Instrument ?? slaveInst, closeAction, closeQty, "Close"))
                                        {
                                            Log($"⚡⚡ [COPY C# CLOSE <0.1ms]: Posição zerada ({closeQty}x) na Slave {slaveAcc.Name} ({slavePos.Instrument?.FullName}) acompanhando Master {account.Name} FLAT em {inst.FullName}");
                                        }
                                        // Cleanup idempotente único com proteção de semáforo anti-CancelPending
                                        Task.Run(async () =>
                                        {
                                            try
                                            {
                                                await Task.Delay(400);
                                                CancelarOrdensPendentes(slaveAcc, slaveInst);
                                            }
                                            catch { }
                                        });
                                    }
                                    else
                                    {
                                        // Apenas cancela ordens pendentes/órfãs deste ativo específico na Slave, preservando outros ativos (ex: MNQ intacto)!
                                        CancelarOrdensPendentes(slaveAcc, slaveInst);
                                    }
                                }
                            }
                            catch (Exception closeEx)
                            {
                                Log($"[ERRO AO FECHAR SLAVE EM C#]: {closeEx.Message}");
                            }
                        }

                        if (IsAccountMonitored(account.Name))
                        {
                            VerificarGestaoDeRisco(account);
                        }
                    }
                    catch (Exception ex)
                    {
                        Log($"[ERRO POSITION UPDATE]: {ex.Message}");
                    }
                });
            }
            catch { }
        }

        private static void OnAccountOrderUpdate(object sender, OrderEventArgs e)
        {
            try
            {
                if (e?.Order == null || e.Order.Account == null || e.Order.Instrument == null) return;
                var masterAccount = e.Order.Account;
                var masterOrder = e.Order;

                // Verificação de Licença
                if (!AxionLicenseManager.IsLicensed)
                    return;

                // Não processar ordens a mercado aqui (são tratadas em tempo real em OnAccountExecutionUpdate)
                if (masterOrder.OrderType == OrderType.Market)
                    return;

                // Não reprocessar ordens criadas pelo próprio Add-on para contas SLAVE (evitar ecos/loops infinitos).
                // Se a conta for MASTER de regras ativas, permitimos processar alterações manuais feitas na Master!
                bool isMasterAccount = _copyRules.Values.Any(r => r.IsActive && string.Equals(r.MasterAccountName, masterAccount.Name, StringComparison.OrdinalIgnoreCase));
                if (IsInternalOrder(masterOrder) && !isMasterAccount)
                    return;

                // Execução Assíncrona para não travar a thread de ordens do NinjaTrader
                Task.Run(() =>
                {
                    try
                    {
                        bool isExitOrder = IsExitOrProtectionOrderName(masterOrder.Name);

                        // 🛡️ 1. VALIDAÇÃO DE GESTÃO DE RISCO PARA QUALQUER CONTA (Master, Slave ou Avulsa/Standalone)
                        if (_accountRiskStates.TryGetValue(masterAccount.Name, out AccountRiskInfo accRisk))
                        {
                            if (!CanAccountTrade(accRisk, out string rejReason))
                            {
                                // Se a conta violou as regras (horário, limite de perda, meta de ganho, máx trades), cancelar qualquer ordem pendente
                                if ((masterOrder.OrderState == OrderState.Working || masterOrder.OrderState == OrderState.Accepted) && !IsInternalOrder(masterOrder))
                                {
                                    if (!isExitOrder)
                                    {
                                        Application.Current?.Dispatcher?.Invoke(() =>
                                        {
                                            try
                                            {
                                                SafeCancelOrders(masterAccount, masterOrder);
                                                Log($"🚨 [RISCO CONTA BLOQUEADA]: Ordem {masterOrder.Id} ({masterOrder.OrderType} {masterOrder.Quantity}x) cancelada na conta {masterAccount.Name}. Motivo: {rejReason}");
                                            }
                                            catch { }
                                        });
                                        EnqueueRejectionEvent(masterAccount.Name, masterAccount.Name, masterOrder.Instrument?.FullName, masterOrder.OrderAction == OrderAction.Buy ? "BUY" : "SELL", masterOrder.Quantity, rejReason);
                                    }
                                }
                                return; // Não prosseguir se a conta estiver bloqueada pelo risco!
                            }

                            // 📏 1.1 Ajuste automático para tamanho máximo de lote (MaxLots) apenas em ordens pendentes de entrada (não altera SL/TP OCO)
                            if (!isExitOrder && string.IsNullOrEmpty(masterOrder.Oco) && accRisk.MaxLots > 0 && masterOrder.Quantity > accRisk.MaxLots && (masterOrder.OrderState == OrderState.Working || masterOrder.OrderState == OrderState.Accepted))
                            {
                                int clampedQty = ClampLotSizeForAccount(masterAccount.Name, masterOrder.Quantity, out bool wasClamped, out _);
                                if (wasClamped)
                                {
                                    Application.Current?.Dispatcher?.Invoke(() =>
                                    {
                                        try
                                        {
                                            masterOrder.QuantityChanged = clampedQty;
                                            SafeChangeOrders(masterAccount, masterOrder);
                                        }
                                        catch { }
                                    });
                                }
                            }
                        }

                        // 🎯 3. SÓ PROCESSAR ESPELHAMENTO se a conta for MASTER de alguma regra de copy ativa
                        var matchingRules = _copyRules.Values
                            .Where(r => r != null && r.IsActive && string.Equals(r.MasterAccountName, masterAccount.Name, StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(r.SlaveAccountName))
                            .GroupBy(r => r.SlaveAccountName.Trim().ToLowerInvariant())
                            .Select(g => g.First())
                            .ToList();
                        if (matchingRules.Count == 0) return;

                        // 🎯 1. Notificar VortexWeb sobre Stop Loss e Take Profit da Conta Master (ATM ou ordens manuais)
                        try
                        {
                            if (masterOrder.OrderState == OrderState.Working || masterOrder.OrderState == OrderState.Accepted)
                            {
                                double sl = 0;
                                double tp = 0;
                                if ((masterOrder.OrderType == OrderType.StopMarket || masterOrder.OrderType == OrderType.StopLimit) && masterOrder.StopPrice > 0)
                                {
                                    sl = masterOrder.StopPrice;
                                }
                                else if (masterOrder.OrderType == OrderType.Limit && masterOrder.LimitPrice > 0)
                                {
                                    tp = masterOrder.LimitPrice;
                                }

                                if (masterAccount.Orders != null)
                                {
                                    var otherOrders = masterAccount.Orders.Where(o => 
                                        o != null && 
                                        o.Instrument != null && 
                                        (o.Instrument == masterOrder.Instrument || 
                                         (masterOrder.Instrument != null && (o.Instrument.FullName == masterOrder.Instrument.FullName || 
                                          (o.Instrument.MasterInstrument != null && masterOrder.Instrument.MasterInstrument != null && string.Equals(o.Instrument.MasterInstrument.Name, masterOrder.Instrument.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))))) &&
                                        (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted)
                                    ).ToList();

                                    foreach (var ord in otherOrders)
                                    {
                                        if (sl == 0 && (ord.OrderType == OrderType.StopMarket || ord.OrderType == OrderType.StopLimit) && ord.StopPrice > 0)
                                        {
                                            sl = ord.StopPrice;
                                        }
                                        if (tp == 0 && ord.OrderType == OrderType.Limit && ord.LimitPrice > 0)
                                        {
                                            tp = ord.LimitPrice;
                                        }
                                    }
                                }

                                if ((sl > 0 && tp == 0) || (sl == 0 && tp > 0))
                                {
                                    // Aguarda 120ms para o mecanismo ATM do NinjaTrader registrar o par completo (SL + TP)
                                    System.Threading.Thread.Sleep(120);
                                    if (masterAccount.Orders != null)
                                    {
                                        lock (masterAccount.Orders)
                                        {
                                            var refOrders = masterAccount.Orders.Where(o => 
                                                o != null && o.Instrument != null && 
                                                (o.Instrument == masterOrder.Instrument || (masterOrder.Instrument != null && (o.Instrument.FullName == masterOrder.Instrument.FullName || (o.Instrument.MasterInstrument != null && masterOrder.Instrument.MasterInstrument != null && string.Equals(o.Instrument.MasterInstrument.Name, masterOrder.Instrument.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))))) &&
                                                (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted)
                                            ).ToList();

                                            foreach (var ord in refOrders)
                                            {
                                                if (sl == 0 && (ord.OrderType == OrderType.StopMarket || ord.OrderType == OrderType.StopLimit) && ord.StopPrice > 0) sl = ord.StopPrice;
                                                if (tp == 0 && ord.OrderType == OrderType.Limit && ord.LimitPrice > 0) tp = ord.LimitPrice;
                                            }
                                        }
                                    }
                                }

                                if (sl > 0 || tp > 0)
                                {
                                    string symKey = $"{masterAccount.Name}_{masterOrder.Instrument?.FullName ?? ""}";
                                    bool isChanged = true;
                                    if (_lastReportedMasterLevels.TryGetValue(symKey, out var lastLevels))
                                    {
                                        if (Math.Abs(lastLevels.sl - sl) < 0.0001 && Math.Abs(lastLevels.tp - tp) < 0.0001)
                                        {
                                            isChanged = false;
                                        }
                                    }

                                    if (isChanged)
                                    {
                                        _lastReportedMasterLevels[symKey] = (sl, tp);
                                        var levelsEv = new MasterExecutionEvent
                                        {
                                            EventType = "LEVELS",
                                            AccountName = masterAccount.Name,
                                            Symbol = masterOrder.Instrument?.FullName ?? "",
                                            Action = masterOrder.OrderAction == OrderAction.Buy ? "BUY" : "SELL",
                                            Quantity = masterOrder.Quantity,
                                            StopLoss = sl,
                                            TakeProfit = tp,
                                            OrderId = masterOrder.OrderId,
                                            OrderName = masterOrder.Name,
                                            Timestamp = DateTime.UtcNow.ToString("o")
                                        };
                                        _masterEventsQueue.Enqueue(levelsEv);
                                        Log($"🎯 [MASTER NÍVEIS CAPTURADOS]: {masterAccount.Name} ({masterOrder.Instrument?.FullName}) -> SL: {sl:F2} | TP: {tp:F2}");
                                    }
                                }
                            }
                        }
                        catch (Exception levEx)
                        {
                            Log($"[AVISO NÍVEIS MASTER]: {levEx.Message}");
                        }

                        bool isSl = masterOrder.OrderType == OrderType.StopMarket || masterOrder.OrderType == OrderType.StopLimit || (!string.IsNullOrEmpty(masterOrder.Name) && (masterOrder.Name.Contains("Stop") || masterOrder.Name.Contains("SL")));
                        bool isTp = masterOrder.OrderType == OrderType.Limit || (!string.IsNullOrEmpty(masterOrder.Name) && (masterOrder.Name.Contains("Target") || masterOrder.Name.Contains("TP")));
                        double masterCurrentPrice = (isSl ? masterOrder.StopPrice : (isTp ? masterOrder.LimitPrice : (masterOrder.StopPrice > 0 ? masterOrder.StopPrice : (masterOrder.LimitPrice > 0 ? masterOrder.LimitPrice : 0))));

                        double masterTick = (masterOrder.Instrument?.MasterInstrument != null && masterOrder.Instrument.MasterInstrument.TickSize > 0) ? masterOrder.Instrument.MasterInstrument.TickSize : 0.25;
                        bool isWorkingOrAccepted = masterOrder.OrderState == OrderState.Working || masterOrder.OrderState == OrderState.Accepted;

                        double masterPriceDelta = 0.0;
                        bool isMasterPriceChanged = false;
                        bool isNewMasterOrder = false;

                        if (isWorkingOrAccepted && (isSl || isTp || masterCurrentPrice > 0))
                        {
                            if (_lastKnownMasterOrderPrice.TryGetValue(masterOrder.OrderId, out double prevMasterPrice))
                            {
                                masterPriceDelta = masterCurrentPrice - prevMasterPrice;
                                if (Math.Abs(masterPriceDelta) >= (masterTick / 2.0))
                                {
                                    isMasterPriceChanged = true;
                                    _lastKnownMasterOrderPrice[masterOrder.OrderId] = masterCurrentPrice;
                                }
                            }
                            else
                            {
                                isNewMasterOrder = true;
                                _lastKnownMasterOrderPrice[masterOrder.OrderId] = masterCurrentPrice;
                            }
                        }

                        foreach (var rule in matchingRules)
                        {
                            try
                            {
                                if (string.Equals(rule.SlaveAccountName, masterAccount.Name, StringComparison.OrdinalIgnoreCase) ||
                                    string.Equals(rule.SlaveAccountName, rule.MasterAccountName, StringComparison.OrdinalIgnoreCase))
                                {
                                    continue;
                                }

                                Account slaveAcc = null;
                                lock (Account.All)
                                {
                                    slaveAcc = Account.All.FirstOrDefault(a => a != null && string.Equals(a.Name, rule.SlaveAccountName, StringComparison.OrdinalIgnoreCase));
                                }

                                if (slaveAcc == null || string.Equals(slaveAcc.Name, masterAccount.Name, StringComparison.OrdinalIgnoreCase) || !IsAccountReadyForTrading(slaveAcc)) continue;

                                EnsureAccountSubscribed(slaveAcc);

                                // Checar trava de risco e limites diários da slave
                                if (_accountRiskStates.TryGetValue(slaveAcc.Name, out AccountRiskInfo sRisk))
                                {
                                    if (!CanAccountTrade(sRisk, out string rejReason))
                                    {
                                        LogRejectionDebounced(slaveAcc.Name, rejReason);
                                        if (!isSl && !isTp && isWorkingOrAccepted)
                                        {
                                            EnqueueRejectionEvent(masterAccount.Name, slaveAcc.Name, masterOrder.Instrument?.FullName, masterOrder.OrderAction == OrderAction.Buy ? "BUY" : "SELL", masterOrder.Quantity, rejReason);
                                        }
                                        continue;
                                    }
                                }

                                Instrument slaveInst = ResolveSlaveInstrument(masterOrder.Instrument, rule) ?? masterOrder.Instrument;
                                if (slaveInst == null || !IsSymbolAllowed(slaveInst, rule)) continue;

                                string mapKey = $"{masterOrder.OrderId}_{slaveAcc.Name}";

                                if (isSl || isTp)
                                {
                                    // ⚡ AJUSTE EM TEMPO REAL DE ORDENS DE BRACKET (SL / TP):
                                    // Se a ordem está trabalhando e o preço mudou na Master (ex: trader arrastou a linha no gráfico),
                                    // altera DIRETAMENTE a ordem correspondente na Slave via Change(), exatamente como a Master faz!
                                    // NUNCA cancela e reabre ordens de alvos ou stops que não foram alterados!
                                    bool handledFastMove = false;

                                    if (isWorkingOrAccepted && isMasterPriceChanged)
                                    {
                                        Position slavePos = null;
                                        if (slaveAcc.Positions != null)
                                        {
                                            lock (slaveAcc.Positions)
                                            {
                                                slavePos = slaveAcc.Positions.FirstOrDefault(p => p != null && (
                                                    p.Instrument == slaveInst ||
                                                    (p.Instrument != null && (p.Instrument.FullName == slaveInst.FullName ||
                                                     (p.Instrument.MasterInstrument != null && slaveInst.MasterInstrument != null && string.Equals(p.Instrument.MasterInstrument.Name, slaveInst.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))))
                                                ));
                                            }
                                        }

                                        Position masterPos = null;
                                        if (masterAccount.Positions != null)
                                        {
                                            lock (masterAccount.Positions)
                                            {
                                                masterPos = masterAccount.Positions.FirstOrDefault(p => p != null && (
                                                    p.Instrument == masterOrder.Instrument ||
                                                    (p.Instrument != null && (p.Instrument.FullName == masterOrder.Instrument.FullName ||
                                                     (p.Instrument.MasterInstrument != null && masterOrder.Instrument.MasterInstrument != null && string.Equals(p.Instrument.MasterInstrument.Name, masterOrder.Instrument.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))))
                                                ));
                                            }
                                        }

                                        if (slavePos != null && slavePos.MarketPosition != MarketPosition.Flat && masterPos != null && masterPos.MarketPosition != MarketPosition.Flat)
                                        {
                                            double slaveTick = (slaveInst.MasterInstrument != null && slaveInst.MasterInstrument.TickSize > 0) ? slaveInst.MasterInstrument.TickSize : 0.25;

                                            if (isSl && masterOrder.StopPrice > 0)
                                            {
                                                double slOffset = masterOrder.StopPrice - masterPos.AveragePrice;
                                                double targetSlaveSl = Math.Round((slavePos.AveragePrice + slOffset) / slaveTick) * slaveTick;

                                                List<Order> slaveSlOrders = null;
                                                if (slaveAcc.Orders != null)
                                                {
                                                    lock (slaveAcc.Orders)
                                                    {
                                                        slaveSlOrders = slaveAcc.Orders.Where(o => o != null &&
                                                            (o.Instrument == slaveInst || (o.Instrument != null && o.Instrument.FullName == slaveInst.FullName)) &&
                                                            (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted) &&
                                                            (o.OrderType == OrderType.StopMarket || o.OrderType == OrderType.StopLimit)
                                                        ).ToList();
                                                    }
                                                }

                                                if (slaveSlOrders != null && slaveSlOrders.Count > 0)
                                                {
                                                    Application.Current?.Dispatcher?.Invoke(() =>
                                                    {
                                                        try
                                                        {
                                                            var toChange = new List<Order>();
                                                            foreach (var sSl in slaveSlOrders)
                                                            {
                                                                if (Math.Abs(sSl.StopPrice - targetSlaveSl) >= (slaveTick / 2.0))
                                                                {
                                                                    sSl.StopPriceChanged = targetSlaveSl;
                                                                    toChange.Add(sSl);
                                                                }
                                                            }
                                                            if (toChange.Count > 0)
                                                            {
                                                                SafeChangeOrders(slaveAcc, toChange.ToArray());
                                                                Log($"⚡⚡ [COPY SL FAST MOVE]: Stop ajustado para {targetSlaveSl:F2} na Slave {slaveAcc.Name} (Take Profits 100% preservados)");
                                                            }
                                                        }
                                                        catch (Exception ex)
                                                        {
                                                            Log($"[ERRO AO MOVER STOP SLAVE]: {ex.Message}");
                                                        }
                                                    });
                                                    handledFastMove = true;
                                                }
                                            }
                                            else if (isTp && masterOrder.LimitPrice > 0)
                                            {
                                                double tpOffset = masterOrder.LimitPrice - masterPos.AveragePrice;
                                                double targetSlaveTp = Math.Round((slavePos.AveragePrice + tpOffset) / slaveTick) * slaveTick;

                                                Order targetSlaveOrd = null;
                                                if (_masterToSlaveOrderIdMap.TryGetValue(mapKey, out string sOrdId) && slaveAcc.Orders != null)
                                                {
                                                    lock (slaveAcc.Orders)
                                                    {
                                                        targetSlaveOrd = slaveAcc.Orders.FirstOrDefault(o => o != null && (o.OrderId == sOrdId || o.Id.ToString() == sOrdId) && (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted));
                                                    }
                                                }

                                                if (targetSlaveOrd == null && slaveAcc.Orders != null && masterAccount.Orders != null)
                                                {
                                                    List<Order> mTargets = null;
                                                    List<Order> sTargets = null;
                                                    lock (masterAccount.Orders)
                                                    {
                                                        mTargets = masterAccount.Orders.Where(o => o != null && (o.Instrument == masterOrder.Instrument || (o.Instrument != null && o.Instrument.FullName == masterOrder.Instrument.FullName)) && (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted) && o.OrderType == OrderType.Limit).OrderBy(o => masterPos.MarketPosition == MarketPosition.Long ? o.LimitPrice : -o.LimitPrice).ToList();
                                                    }
                                                    lock (slaveAcc.Orders)
                                                    {
                                                        sTargets = slaveAcc.Orders.Where(o => o != null && (o.Instrument == slaveInst || (o.Instrument != null && o.Instrument.FullName == slaveInst.FullName)) && (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted) && o.OrderType == OrderType.Limit).OrderBy(o => slavePos.MarketPosition == MarketPosition.Long ? o.LimitPrice : -o.LimitPrice).ToList();
                                                    }

                                                    int idx = mTargets != null ? mTargets.IndexOf(masterOrder) : -1;
                                                    if (idx >= 0 && sTargets != null && idx < sTargets.Count)
                                                    {
                                                        targetSlaveOrd = sTargets[idx];
                                                    }
                                                }

                                                if (targetSlaveOrd != null)
                                                {
                                                    Application.Current?.Dispatcher?.Invoke(() =>
                                                    {
                                                        try
                                                        {
                                                            if (Math.Abs(targetSlaveOrd.LimitPrice - targetSlaveTp) >= (slaveTick / 2.0))
                                                            {
                                                                targetSlaveOrd.LimitPriceChanged = targetSlaveTp;
                                                                SafeChangeOrders(slaveAcc, targetSlaveOrd);
                                                                Log($"⚡⚡ [COPY TP FAST MOVE]: Target ajustado para {targetSlaveTp:F2} na Slave {slaveAcc.Name} (Stop Losses 100% preservados)");
                                                            }
                                                        }
                                                        catch (Exception ex)
                                                        {
                                                            Log($"[ERRO AO MOVER TARGET SLAVE]: {ex.Message}");
                                                        }
                                                    });
                                                    handledFastMove = true;
                                                }
                                            }
                                        }
                                    }

                                    if (!handledFastMove)
                                    {
                                        // 🎯 RECONCILIAÇÃO DETERMINÍSTICA ATÔMICA DE BRACKETS SL/TP NA SLAVE
                                        ReconcileSlaveBrackets(masterAccount, slaveAcc, masterOrder.Instrument, slaveInst, rule);
                                    }
                                }
                                else if (masterOrder.OrderState == OrderState.Cancelled || masterOrder.OrderState == OrderState.Rejected)
                                {
                                    _lastKnownMasterOrderPrice.TryRemove(masterOrder.OrderId, out _);
                                    if (isSl || isTp)
                                    {
                                        ReconcileSlaveBrackets(masterAccount, slaveAcc, masterOrder.Instrument, slaveInst, rule);
                                    }
                                    else if (_masterToSlaveOrderIdMap.TryRemove(mapKey, out string slaveOrdIdToCancel))
                                    {
                                        if (slaveAcc.Orders != null)
                                        {
                                            var slaveOrd = slaveAcc.Orders.FirstOrDefault(o => 
                                                (o.OrderId == slaveOrdIdToCancel || o.Id.ToString() == slaveOrdIdToCancel) &&
                                                (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted)
                                            );

                                            if (slaveOrd != null)
                                            {
                                                SafeCancelOrders(slaveAcc, slaveOrd);
                                                Log($"⚡⚡ [COPY PENDING CANCEL <0.1ms]: Ordem {slaveOrd.Id} cancelada na Slave {slaveAcc.Name} acompanhando cancelamento na Master {masterAccount.Name}");
                                            }
                                        }
                                    }
                                }
                                else if (masterOrder.OrderState == OrderState.Filled)
                                {
                                    _lastKnownMasterOrderPrice.TryRemove(masterOrder.OrderId, out _);
                                    _masterToSlaveOrderIdMap.TryRemove(mapKey, out _);
                                    if (isSl || isTp)
                                    {
                                        ReconcileSlaveBrackets(masterAccount, slaveAcc, masterOrder.Instrument, slaveInst, rule);
                                    }
                                }
                            }
                            catch (Exception ruleEx)
                            {
                                Log($"[ERRO COPY ORDER RULE]: {ruleEx.Message}");
                            }
                        }
                    }
                    catch (Exception orderEx)
                    {
                        Log($"[ERRO ORDER UPDATE]: {orderEx.Message}");
                    }
                });
            }
            catch { }
        }

        private static void OnAccountExecutionUpdate(object sender, ExecutionEventArgs e)
        {
            try
            {
                if (e.Execution == null || e.Execution.Order == null) return;
                Order execOrder = e.Execution.Order;
                Account account = sender as Account ?? execOrder.Account;

                // Verificação de Licença
                if (!AxionLicenseManager.IsLicensed)
                    return;

                // Execução totalmente Assíncrona para liberar a thread do NinjaTrader imediatamente
                Task.Run(() =>
                {
                    try
                    {
                        // 1. Preenchimento de entrada originada pelo Painel Vortex: Submeter Stop Loss e Take Profit calculados sobre o preço real executado
                        double masterPbSlPoints = 0;
                        double masterPbTpPoints = 0;
                        double masterPbInitialSl = 0;
                        double masterPbInitialTp = 0;

                        if (execOrder.OrderState == OrderState.Filled && (execOrder.Name == "Entry" || execOrder.Name == "Axion_Entry" || (IsInternalOrder(execOrder) && execOrder.Name != "Copy_Entry" && !IsExitOrProtectionOrderName(execOrder.Name))))
                        {
                            PendingBracket pb = null;
                            if (_pendingBrackets.TryRemove(execOrder.OrderId, out pb) || 
                                (pb = _pendingBrackets.Values.FirstOrDefault(p => p.Account == account && p.Instrument != null && execOrder.Instrument != null && (p.Instrument == execOrder.Instrument || p.Instrument.FullName == execOrder.Instrument.FullName || (p.Instrument.MasterInstrument != null && execOrder.Instrument.MasterInstrument != null && p.Instrument.MasterInstrument.Name == execOrder.Instrument.MasterInstrument.Name)) && Math.Abs((DateTime.Now - p.CreatedAt).TotalSeconds) < 60)) != null)
                            {
                                if (pb != null)
                                {
                                    _pendingBrackets.TryRemove(pb.OrderId, out _);
                                    masterPbSlPoints = pb.StopPoints;
                                    masterPbTpPoints = pb.TakePoints;
                                    masterPbInitialSl = pb.InitialSl;
                                    masterPbInitialTp = pb.InitialTp;

                                    double fillPrice = e.Execution.Price > 0 ? e.Execution.Price : execOrder.AverageFillPrice;
                                    if (fillPrice > 0 && !IsAccountCurrentlyFlattening(account?.Name))
                                    {
                                        double tick = (pb.Instrument?.MasterInstrument?.TickSize > 0) ? pb.Instrument.MasterInstrument.TickSize : 0.25;
                                        OrderAction exitAction = pb.EntryAction == OrderAction.Buy ? OrderAction.Sell : OrderAction.Buy;
                                        double exactSl = 0;
                                        double exactTp = 0;

                                        if (pb.StopPoints > 0)
                                        {
                                            exactSl = pb.EntryAction == OrderAction.Buy ? (fillPrice - pb.StopPoints) : (fillPrice + pb.StopPoints);
                                            exactSl = Math.Round(exactSl / tick) * tick;
                                        }
                                        else if (pb.InitialSl > 0)
                                        {
                                            exactSl = pb.InitialSl;
                                        }

                                        if (pb.TakePoints > 0)
                                        {
                                            exactTp = pb.EntryAction == OrderAction.Buy ? (fillPrice + pb.TakePoints) : (fillPrice - pb.TakePoints);
                                            exactTp = Math.Round(exactTp / tick) * tick;
                                        }
                                        else if (pb.InitialTp > 0)
                                        {
                                            exactTp = pb.InitialTp;
                                        }

                                        var ocoOrders = new List<Order>();
                                        Order slOrder = null;
                                        Order tpOrder = null;

                                        if (exactSl > 0)
                                        {
                                            slOrder = CreateStealthOrder(pb.Account, pb.Instrument, exitAction, OrderType.StopMarket, OrderEntry.Manual, TimeInForce.Gtc, pb.Quantity, 0, exactSl, pb.OcoId, "Stop");
                                            RegisterInternalOrder(slOrder.OrderId);
                                            ocoOrders.Add(slOrder);
                                        }

                                        if (exactTp > 0)
                                        {
                                            tpOrder = CreateStealthOrder(pb.Account, pb.Instrument, exitAction, OrderType.Limit, OrderEntry.Manual, TimeInForce.Gtc, pb.Quantity, exactTp, 0, pb.OcoId, "Target");
                                            RegisterInternalOrder(tpOrder.OrderId);
                                            ocoOrders.Add(tpOrder);
                                        }

                                        if (ocoOrders.Count > 0)
                                        {
                                            StealthSubmit(pb.Account, ocoOrders.ToArray());
                                            var bracket = new BracketDef
                                            {
                                                OcoId = pb.OcoId,
                                                ReportId = pb.ReportId,
                                                Quantity = pb.Quantity,
                                                SlOrder = slOrder,
                                                TpOrder = tpOrder,
                                                RealFillPrice = fillPrice,
                                                StopPoints = pb.StopPoints,
                                                TakePoints = pb.TakePoints,
                                                EntryAction = pb.EntryAction,
                                                Instrument = pb.Instrument,
                                                Account = pb.Account,
                                                CreatedAt = DateTime.Now
                                            };
                                            _activeBrackets[pb.OcoId] = bracket;
                                            if (!string.IsNullOrEmpty(pb.ReportId))
                                            {
                                                _reportToOcoMap[pb.ReportId] = pb.OcoId;
                                            }

                                            Log($"[OCO SUBMETIDO 🎯]: Entrada Real {fillPrice:F2} | SL: {exactSl:F2} ({pb.StopPoints:F2} pts) | TP: {exactTp:F2} ({pb.TakePoints:F2} pts) | OCO: {pb.OcoId.Substring(0, 8)}");
                                        }
                                    }
                                }
                            }
                        }

                        // 📊 RASTREAMENTO UNIVERSAL DE TRADES EXECUTADOS POR CONTA (Master, Slave e Avulsas)
                        if (execOrder.OrderState == OrderState.Filled && account != null && e.Execution != null)
                        {
                            bool isPotentialExit = IsExitOrProtectionOrderName(execOrder.Name)
                                || execOrder.OrderAction == OrderAction.BuyToCover
                                || (!string.IsNullOrEmpty(execOrder.Name) && (
                                    execOrder.Name.IndexOf("Close", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                    execOrder.Name.IndexOf("Flatten", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                    execOrder.Name.IndexOf("Zerar", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                    execOrder.Name.IndexOf("Exit", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                    execOrder.Name.IndexOf("Risk", StringComparison.OrdinalIgnoreCase) >= 0));

                            if (!isPotentialExit && !IsInternalOrder(execOrder) && (execOrder.Name == "Entry" || execOrder.Name == "Axion_Entry" || execOrder.Name == "Copy_Entry" || string.IsNullOrEmpty(execOrder.Name) || execOrder.Name == "Order"))
                            {
                                string tradeTrackKey = $"trade_{account.Name}_{execOrder.OrderId}";
                                if (_processedExecOrderIds.TryAdd(tradeTrackKey, DateTime.UtcNow))
                                {
                                    if (_accountRiskStates.TryGetValue(account.Name, out AccountRiskInfo universalRisk))
                                    {
                                        universalRisk.DailyTradesCount++;
                                        Log($"📊 [CONTA {account.Name}]: Trade diário contabilizado autonomamente ({universalRisk.DailyTradesCount} trades executados hoje).");
                                    }
                                }
                            }
                        }

                        // Se a execução foi na conta Slave
                        if (execOrder.OrderState == OrderState.Filled && account != null)
                        {
                            var matchingSlaveRules = _copyRules.Values.Where(r => r.IsActive && string.Equals(r.SlaveAccountName, account.Name, StringComparison.OrdinalIgnoreCase)).ToList();
                            if (matchingSlaveRules.Count > 0)
                            {
                                bool isSlaveExitOrder = IsExitOrProtectionOrderName(execOrder.Name)
                                    || execOrder.OrderAction == OrderAction.BuyToCover
                                    || (!string.IsNullOrEmpty(execOrder.Name) && (
                                        execOrder.Name.IndexOf("Close", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                        execOrder.Name.IndexOf("Flatten", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                        execOrder.Name.IndexOf("Zerar", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                        execOrder.Name.IndexOf("Exit", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                        execOrder.Name.IndexOf("Risk", StringComparison.OrdinalIgnoreCase) >= 0))
                                    || IsAccountCurrentlyFlattening(account.Name, execOrder.Instrument?.FullName);

                                Position slavePosAfter = null;
                                if (account.Positions != null)
                                {
                                    lock (account.Positions)
                                    {
                                        slavePosAfter = account.Positions.FirstOrDefault(p => p != null && (
                                            p.Instrument == execOrder.Instrument ||
                                            (p.Instrument != null && execOrder.Instrument != null && (
                                                p.Instrument.FullName == execOrder.Instrument.FullName ||
                                                (p.Instrument.MasterInstrument != null && execOrder.Instrument.MasterInstrument != null && string.Equals(p.Instrument.MasterInstrument.Name, execOrder.Instrument.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))
                                            ))
                                        ));
                                    }
                                }
                                bool isSlaveFlat = slavePosAfter == null || slavePosAfter.MarketPosition == MarketPosition.Flat || slavePosAfter.Quantity == 0;

                                if (isSlaveFlat)
                                {
                                    // 🛑 SAÍDA TOTAL/ZERAGEM NA SLAVE: Apenas se a posição ficou REALMENTE FLAT (zero contratos)!
                                    MarkAccountFlattening(account.Name, 2.5, execOrder.Instrument?.FullName);
                                    CancelarOrdensPendentes(account, execOrder.Instrument);
                                    if (execOrder.Instrument != null)
                                    {
                                        _unprotectedPositionSince.TryRemove($"{account.Name}_{execOrder.Instrument.FullName}", out _);
                                        string normInstKey = GetNormalizedInstrumentKey(execOrder.Instrument.FullName);
                                        foreach (var r in matchingSlaveRules)
                                        {
                                            _activeCopiedPositions.TryRemove($"{r.MasterAccountName}_{account.Name}_{normInstKey}", out _);
                                        }
                                    }
                                }
                                else if (!IsAccountCurrentlyFlattening(account.Name))
                                {
                                    // 🛡️ ENTRADA NA SLAVE: Reseta o Guardião 5s para que o timer de proteção inicie fresco deste fill
                                    if (execOrder.Instrument != null)
                                    {
                                        _unprotectedPositionSince.TryRemove($"{account.Name}_{execOrder.Instrument.FullName}", out _);
                                    }

                                    foreach (var rule in matchingSlaveRules)
                                    {
                                        Account masterAcc = null;
                                        lock (Account.All)
                                        {
                                            masterAcc = Account.All.FirstOrDefault(a => a != null && string.Equals(a.Name, rule.MasterAccountName, StringComparison.OrdinalIgnoreCase));
                                        }
                                        if (masterAcc != null)
                                        {
                                            Instrument masterInst = masterAcc.Positions?.FirstOrDefault(p => p != null && p.MarketPosition != MarketPosition.Flat)?.Instrument ?? execOrder.Instrument;
                                            ReconcileSlaveBrackets(masterAcc, account, masterInst, execOrder.Instrument, rule);
                                            Task.Run(async () =>
                                            {
                                                try
                                                {
                                                    await Task.Delay(220);
                                                    if (!IsAccountCurrentlyFlattening(account.Name))
                                                    {
                                                        ReconcileSlaveBrackets(masterAcc, account, masterInst, execOrder.Instrument, rule);
                                                    }
                                                }
                                                catch { }
                                            });
                                        }
                                    }
                                }
                            }
                        }

                        // 📡 2. Captura e Execução de Copy Trading (NinjaTrader Master ➔ Slaves e Vortex)
                        bool isMasterOfActiveRules = _copyRules.Values.Any(r => r.IsActive && string.Equals(r.MasterAccountName, account.Name, StringComparison.OrdinalIgnoreCase));
                        bool isCopyOrd = IsCopyOrder(execOrder);

                        if (execOrder.OrderState == OrderState.Filled && account != null && e.Execution != null && isMasterOfActiveRules && !isCopyOrd && !IsInternalOrder(execOrder))
                        {
                            // Aguarda 15ms para garantir que account.Positions reflita o estado PÓS-EXECUÇÃO (posAfter) no NinjaTrader
                            System.Threading.Thread.Sleep(15);

                            Position posAfter = null;
                            if (account.Positions != null)
                            {
                                lock (account.Positions)
                                {
                                    posAfter = account.Positions.FirstOrDefault(p => p != null && (
                                        p.Instrument == execOrder.Instrument || 
                                        (p.Instrument != null && execOrder.Instrument != null && (
                                            p.Instrument.FullName == execOrder.Instrument.FullName ||
                                            (p.Instrument.MasterInstrument != null && execOrder.Instrument.MasterInstrument != null && string.Equals(p.Instrument.MasterInstrument.Name, execOrder.Instrument.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))
                                        ))
                                    ));
                                }
                            }

                            bool isPosAfterFlat = posAfter == null || posAfter.MarketPosition == MarketPosition.Flat || posAfter.Quantity == 0;
                            bool isBuy = execOrder.OrderAction == OrderAction.Buy || execOrder.OrderAction == OrderAction.BuyToCover;
                            bool isSell = execOrder.OrderAction == OrderAction.Sell || execOrder.OrderAction == OrderAction.SellShort;

                            bool isEntry = false;
                            bool isExit = false;

                            // 🔒 IDENTIFICAÇÃO DETERMINÍSTICA DE ENTRADA vs SAÍDA BASEADA NA DIREÇÃO DA POSIÇÃO PÓS-EXECUÇÃO (posAfter)
                            if (isPosAfterFlat)
                            {
                                // Se após o fill a posição resultante está FLAT (0 contratos), a execução ZEROU a posição (100% SAÍDA)!
                                isEntry = false;
                                isExit = true;
                            }
                            else if ((posAfter.MarketPosition == MarketPosition.Long && isBuy) ||
                                     (posAfter.MarketPosition == MarketPosition.Short && isSell))
                            {
                                // Comprou e resultou em Long, ou Vendeu e resultou em Short -> 100% ABERTURA ou AUMENTO DE POSIÇÃO (ENTRADA)!
                                isEntry = true;
                                isExit = false;
                                _flatteningAccountUntil.TryRemove(account.Name, out _);
                            }
                            else if ((posAfter.MarketPosition == MarketPosition.Long && isSell) ||
                                     (posAfter.MarketPosition == MarketPosition.Short && isBuy))
                            {
                                // Execução em sentido oposto à posição resultante -> 100% SAÍDA PARCIAL (ou total em transição)!
                                isEntry = false;
                                isExit = true;
                            }
                            else if (IsExitOrProtectionOrderName(execOrder.Name) || IsAccountCurrentlyFlattening(account.Name))
                            {
                                isEntry = false;
                                isExit = true;
                            }

                            if (!isEntry)
                            {
                                string posDesc = isPosAfterFlat ? "Flat (0x)" : $"{posAfter.MarketPosition} ({Math.Abs(posAfter.Quantity)}x)";
                                Log($"ℹ️ [MASTER EXECUTION]: Execução em {account.Name} ({execOrder.OrderAction} {e.Execution.Quantity}x {e.Execution.Instrument?.FullName}) identificada como SAÍDA/REDUÇÃO (Posição pós-exec: {posDesc}). Processando saída para Slaves...");

                                string exitExecId = $"{execOrder.OrderId}_{e.Execution.ExecutionId}";
                                if (_processedExecOrderIds.TryAdd(exitExecId, DateTime.UtcNow))
                                {
                                    // 🔒 UMA SAÍDA SÓ É ZERAGEM TOTAL SE A POSIÇÃO PÓS-EXECUÇÃO FICOU REALMENTE FLAT (ZERO CONTRATOS)!
                                    // Saídas parciais (alvos 1, 2 de estratégias ATM) mantém os alvos e stops restantes 100% ativos!
                                    bool isFullFlattenExit = isPosAfterFlat;

                                    if (isFullFlattenExit)
                                    {
                                        MarkAccountFlattening(account.Name, 2.0, e.Execution.Instrument?.FullName);
                                        CancelarOrdensPendentes(account, e.Execution.Instrument);
                                    }

                                    var matchingCloseRules = _copyRules.Values
                                        .Where(r => r != null && r.IsActive && r.CloseSlavesOnMasterClose && string.Equals(r.MasterAccountName, account.Name, StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(r.SlaveAccountName))
                                        .GroupBy(r => r.SlaveAccountName.Trim().ToLowerInvariant())
                                        .Select(g => g.First())
                                        .ToList();
                                    foreach (var rule in matchingCloseRules)
                                    {
                                        try
                                        {
                                            if (string.Equals(rule.SlaveAccountName, account.Name, StringComparison.OrdinalIgnoreCase) ||
                                                string.Equals(rule.SlaveAccountName, rule.MasterAccountName, StringComparison.OrdinalIgnoreCase))
                                            {
                                                continue;
                                            }

                                            Account slaveAcc = null;
                                            lock (Account.All)
                                            {
                                                slaveAcc = Account.All.FirstOrDefault(a => a != null && string.Equals(a.Name, rule.SlaveAccountName, StringComparison.OrdinalIgnoreCase));
                                            }

                                            if (slaveAcc == null || !IsAccountReadyForTrading(slaveAcc)) continue;

                                            EnsureAccountSubscribed(slaveAcc);
                                            Instrument slaveInst = ResolveSlaveInstrument(e.Execution.Instrument, rule) ?? e.Execution.Instrument;

                                            var slavePos = slaveAcc.Positions.FirstOrDefault(sp => sp != null && sp.MarketPosition != MarketPosition.Flat && Math.Abs(sp.Quantity) > 0 && (
                                                slaveInst == null ||
                                                sp.Instrument == slaveInst || 
                                                (sp.Instrument != null && slaveInst != null && (
                                                    sp.Instrument.FullName == slaveInst.FullName ||
                                                    (sp.Instrument.MasterInstrument != null && slaveInst.MasterInstrument != null && string.Equals(sp.Instrument.MasterInstrument.Name, slaveInst.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))
                                                ))
                                            ));

                                            bool willBeFlat = isFullFlattenExit;

                                            // 🔒 CRÍTICO: Se a Slave NÃO possui posição neste ativo específico (slaveInst),
                                            // NUNCA encerrar posições de outros ativos na Slave!
                                            if (willBeFlat && slavePos != null)
                                            {
                                                MarkAccountFlattening(slaveAcc.Name, 2.0, slaveInst?.FullName);
                                                CancelarOrdensPendentes(slaveAcc, slaveInst);
                                                _activeCopiedPositions.TryRemove($"{account.Name}_{slaveAcc.Name}_{GetNormalizedInstrumentKey(slaveInst?.FullName ?? "")}", out _);
                                            }

                                            if (slavePos != null)
                                            {
                                                int currentSlaveQty = Math.Abs(slavePos.Quantity);
                                                int closeQty = currentSlaveQty;

                                                if (!willBeFlat && posAfter != null)
                                                {
                                                    int expectedSlaveRemaining = Math.Max(0, (int)Math.Round(Math.Abs(posAfter.Quantity) * rule.LotMultiplier));
                                                    expectedSlaveRemaining = ClampLotSizeForAccount(slaveAcc.Name, expectedSlaveRemaining, out _, out _);
                                                    closeQty = Math.Max(0, currentSlaveQty - expectedSlaveRemaining);
                                                }

                                                if (closeQty > 0)
                                                {
                                                    // 🧹 Limpeza preventiva de brackets parciais na Slave: cancela o alvo/stop equivalente aos contratos sendo encerrados
                                                    if (!willBeFlat && slaveAcc.Orders != null)
                                                    {
                                                        try
                                                        {
                                                            lock (slaveAcc.Orders)
                                                            {
                                                                var tpsToCancel = slaveAcc.Orders.Where(o => o != null &&
                                                                    (o.Instrument == (slavePos.Instrument ?? slaveInst) || (o.Instrument != null && (o.Instrument.FullName == (slavePos.Instrument ?? slaveInst).FullName))) &&
                                                                    (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted) &&
                                                                    o.OrderType == OrderType.Limit &&
                                                                    IsProtectionOrExitOrder(o)
                                                                ).OrderBy(o => slavePos.MarketPosition == MarketPosition.Long ? o.LimitPrice : -o.LimitPrice).Take(1).ToList();

                                                                if (tpsToCancel.Count > 0)
                                                                {
                                                                    SafeCancelOrders(slaveAcc, tpsToCancel.ToArray());
                                                                }
                                                            }
                                                        }
                                                        catch { }
                                                    }

                                                    OrderAction closeAction = slavePos.MarketPosition == MarketPosition.Long ? OrderAction.Sell : OrderAction.Buy;
                                                    if (SafeSubmitCloseOrder(slaveAcc, slavePos.Instrument ?? slaveInst, closeAction, closeQty, "Copy_Close"))
                                                    {
                                                        Log($"⚡⚡ [COPY C# CLOSE <0.1ms]: Ordem de saída {closeAction} {closeQty}x enviada para Slave {slaveAcc.Name} ({slavePos.Instrument?.FullName}) acompanhando saída na Master {account.Name}");
                                                    }
                                                }

                                                if (willBeFlat)
                                                {
                                                    Task.Run(async () =>
                                                    {
                                                        try
                                                        {
                                                            await Task.Delay(200);
                                                            CancelarOrdensPendentes(slaveAcc, slaveInst);
                                                            await Task.Delay(350);
                                                            CancelarOrdensPendentes(slaveAcc, slaveInst);
                                                        }
                                                        catch { }
                                                    });
                                                }
                                                else
                                                {
                                                    Task.Run(async () =>
                                                    {
                                                        try
                                                        {
                                                            await Task.Delay(200);
                                                            if (!IsAccountCurrentlyFlattening(slaveAcc.Name))
                                                            {
                                                                ReconcileSlaveBrackets(account, slaveAcc, e.Execution.Instrument, slaveInst, rule);
                                                            }
                                                        }
                                                        catch { }
                                                    });
                                                }
                                            }
                                        }
                                        catch (Exception closeEx)
                                        {
                                            Log($"[ERRO AO FECHAR SLAVE NO EXEC UPDATE]: {closeEx.Message}");
                                        }
                                    }

                                    string targetRepId = "";
                                    if (!string.IsNullOrEmpty(execOrder.Oco))
                                    {
                                        if (_activeBrackets.TryGetValue(execOrder.Oco, out var bDef) && !string.IsNullOrEmpty(bDef.ReportId))
                                        {
                                            targetRepId = bDef.ReportId;
                                        }
                                        else
                                        {
                                            var foundPair = _reportToOcoMap.FirstOrDefault(kvp => kvp.Value == execOrder.Oco);
                                            if (!string.IsNullOrEmpty(foundPair.Key)) targetRepId = foundPair.Key;
                                        }
                                        _activeBrackets.TryRemove(execOrder.Oco, out _);
                                    }

                                    var closeEv = new MasterExecutionEvent
                                    {
                                        EventType = "CLOSE",
                                        AccountName = account.Name,
                                        Symbol = e.Execution.Instrument?.FullName ?? "",
                                        Action = execOrder.OrderAction == OrderAction.Buy ? "BUY" : "SELL",
                                        Quantity = e.Execution.Quantity,
                                        Price = e.Execution.Price > 0 ? e.Execution.Price : execOrder.AverageFillPrice,
                                        OrderId = execOrder.OrderId ?? "",
                                        OrderName = execOrder.Name ?? "",
                                        ReportId = targetRepId,
                                        Timestamp = DateTime.UtcNow.ToString("o")
                                    };
                                    _masterEventsQueue.Enqueue(closeEv);
                                }

                                return;
                            }

                            string execId = $"{execOrder.OrderId}_{e.Execution.ExecutionId}";
                            if (_processedExecOrderIds.TryAdd(execId, DateTime.UtcNow))
                            {
                                string actStr = isBuy ? "BUY" : "SELL";
                                int effectiveMasterQty = e.Execution.Quantity;

                                // 🛡️ VALIDAÇÃO DE GESTÃO DE RISCO DA CONTA EMISSORA / MASTER (Horário, Quantidade de Trades, Meta de Loss/Take e Lote Máximo)
                                if (_accountRiskStates.TryGetValue(account.Name, out AccountRiskInfo rInfo))
                                {
                                    if (!CanAccountTrade(rInfo, out string rejReason))
                                    {
                                        // Posição de entrada violou a gestão de risco (horário permitido, limite de trades ou meta diária de loss/take)
                                        // 🛑 ZERAR IMEDIATAMENTE no NinjaTrader para cumprir as regras da conta!
                                        MarkAccountFlattening(account.Name, 2.0, e.Execution.Instrument?.FullName);
                                        OrderAction closeAction = isBuy ? OrderAction.Sell : OrderAction.Buy;
                                        int closeQty = posAfter != null && Math.Abs(posAfter.Quantity) > 0 ? Math.Abs(posAfter.Quantity) : e.Execution.Quantity;
                                        CancelarOrdensPendentes(account, e.Execution.Instrument);
                                        SafeSubmitCloseOrder(account, e.Execution.Instrument, closeAction, closeQty, "RiskClose");

                                        // 🧹 Varreduras atrasadas para capturar ordens ATM (Stop Loss / Profit Target) que o NinjaTrader cria 50-300ms após o fill da entrada
                                        Task.Run(async () =>
                                        {
                                            try
                                            {
                                                for (int d = 0; d < 5; d++)
                                                {
                                                    await Task.Delay(150);
                                                    CancelarOrdensPendentes(account, e.Execution.Instrument);
                                                }
                                            }
                                            catch { }
                                        });

                                        Log($"🚨 [RISCO CONTA BLOQUEADA]: Entrada de {execOrder.OrderAction} {closeQty}x {e.Execution.Instrument?.FullName} em {account.Name} violou a gestão de risco e foi ZERADA. Motivo: {rejReason}");
                                        EnqueueRejectionEvent(account.Name, account.Name, e.Execution.Instrument?.FullName ?? "", actStr, closeQty, rejReason);
                                        SendTelegramMessageAsync($"🚨 <b>RISCO — ENTRADA ZERADA AUTOMATICAMENTE</b>\n👤 Conta: <b>{account.Name}</b>\n🎯 Ativo: <b>{e.Execution.Instrument?.FullName}</b>\n🛑 Motivo: <b>{rejReason}</b>\n🔒 Posição zerada e ordens pendentes canceladas!");

                                        // Não registra trade e não propaga para Slaves!
                                        return;
                                    }

                                    // 📏 Clamping de Lote Máximo (MaxLots) na Conta Master / Emissora
                                    if (rInfo.MaxLots > 0)
                                    {
                                        int currentOpenLots = posAfter != null && Math.Abs(posAfter.Quantity) > 0 ? Math.Abs(posAfter.Quantity) : e.Execution.Quantity;
                                        if (currentOpenLots > rInfo.MaxLots)
                                        {
                                            effectiveMasterQty = rInfo.MaxLots;
                                        }
                                    }

                                    string masterTradeKey = $"trade_{account.Name}_{execOrder.OrderId}";
                                    if (_processedExecOrderIds.TryAdd(masterTradeKey, DateTime.UtcNow))
                                    {
                                        rInfo.DailyTradesCount++;
                                        Log($"📊 [CONTA {account.Name}]: Operação diária registrada ({rInfo.DailyTradesCount} trades executados hoje).");
                                    }
                                }

                                double fillP = e.Execution.Price > 0 ? e.Execution.Price : execOrder.AverageFillPrice;

                                double detectedSl = masterPbInitialSl;
                                double detectedTp = masterPbInitialTp;
                                double stopLossPoints = masterPbSlPoints;
                                double takeProfitPoints = masterPbTpPoints;

                                // 🔍 Detectar Stop Loss e Take Profit nas ordens ativas da conta Master (aguarda até ~1s caso o motor ATM esteja registrando as ordens)
                                for (int pollAttempt = 0; pollAttempt < 15; pollAttempt++)
                                {
                                    try
                                    {
                                        if (account.Orders != null)
                                        {
                                            List<Order> masterOrders = null;
                                            lock (account.Orders)
                                            {
                                                masterOrders = account.Orders.Where(o => 
                                                    o != null && 
                                                    o.Instrument != null && 
                                                    (o.Instrument == execOrder.Instrument || 
                                                     (execOrder.Instrument != null && (o.Instrument.FullName == execOrder.Instrument.FullName || 
                                                      (o.Instrument.MasterInstrument != null && execOrder.Instrument.MasterInstrument != null && string.Equals(o.Instrument.MasterInstrument.Name, execOrder.Instrument.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))))) &&
                                                    (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted || o.OrderState == OrderState.Submitted || o.OrderState == OrderState.TriggerPending || o.OrderState == OrderState.Initialized) &&
                                                    (isBuy ? (o.OrderAction == OrderAction.Sell || o.OrderAction == OrderAction.SellShort) : (o.OrderAction == OrderAction.Buy || o.OrderAction == OrderAction.BuyToCover))
                                                ).ToList();
                                            }

                                            if (masterOrders != null)
                                            {
                                                foreach (var ord in masterOrders)
                                                {
                                                    if ((ord.OrderType == OrderType.StopMarket || ord.OrderType == OrderType.StopLimit) && ord.StopPrice > 0)
                                                    {
                                                        detectedSl = ord.StopPrice;
                                                    }
                                                    else if (ord.OrderType == OrderType.Limit && ord.LimitPrice > 0)
                                                    {
                                                        detectedTp = ord.LimitPrice;
                                                    }
                                                }
                                            }
                                        }

                                        if (detectedSl <= 0 || detectedTp <= 0)
                                        {
                                            string symKey = $"{account.Name}_{execOrder.Instrument?.FullName ?? ""}";
                                            if (_lastReportedMasterLevels.TryGetValue(symKey, out var cachedLevels))
                                            {
                                                if (detectedSl <= 0 && cachedLevels.sl > 0) detectedSl = cachedLevels.sl;
                                                if (detectedTp <= 0 && cachedLevels.tp > 0) detectedTp = cachedLevels.tp;
                                            }
                                        }

                                        if (detectedSl <= 0 || detectedTp <= 0)
                                        {
                                            var activeB = _activeBrackets.Values.FirstOrDefault(b => b.Account == account && b.Instrument == execOrder.Instrument);
                                            if (activeB != null)
                                            {
                                                if (stopLossPoints <= 0 && activeB.StopPoints > 0) stopLossPoints = activeB.StopPoints;
                                                if (takeProfitPoints <= 0 && activeB.TakePoints > 0) takeProfitPoints = activeB.TakePoints;
                                                if (detectedSl <= 0 && activeB.SlOrder != null && activeB.SlOrder.StopPrice > 0) detectedSl = activeB.SlOrder.StopPrice;
                                                if (detectedTp <= 0 && activeB.TpOrder != null && activeB.TpOrder.LimitPrice > 0) detectedTp = activeB.TpOrder.LimitPrice;
                                            }
                                        }

                                        if (detectedSl > 0 && fillP > 0 && stopLossPoints <= 0) stopLossPoints = Math.Abs(fillP - detectedSl);
                                        if (detectedTp > 0 && fillP > 0 && takeProfitPoints <= 0) takeProfitPoints = Math.Abs(detectedTp - fillP);

                                        if (detectedSl > 0 && detectedTp > 0)
                                        {
                                            break; // Ambos Stop Loss e Take Profit confirmados!
                                        }
                                    }
                                    catch (Exception detEx)
                                    {
                                        if (pollAttempt == 0) Log($"[AVISO AO DETECTAR METAS NA MASTER]: {detEx.Message}");
                                    }

                                    if (pollAttempt < 14)
                                    {
                                        System.Threading.Thread.Sleep(70);
                                    }
                                }

                                // 🛑 REGRA OBRIGATÓRIA DE SEGURANÇA: Operações abertas na Master SEM Stop Loss e SEM Take Profit NÃO devem ser copiadas!
                                if (isMasterOfActiveRules && (detectedSl <= 0 || detectedTp <= 0))
                                {
                                    string missingDesc = (detectedSl <= 0 && detectedTp <= 0)
                                        ? "sem Stop Loss e sem Take Profit"
                                        : (detectedSl <= 0 ? "sem Stop Loss definido" : "sem Take Profit definido");
                                    string rejectMsg = $"Operação aberta na conta Master ({account.Name}) {missingDesc}. Cópia bloqueada por segurança.";

                                    var activeMasterRules = _copyRules.Values.Where(r => r.IsActive && string.Equals(r.MasterAccountName, account.Name, StringComparison.OrdinalIgnoreCase)).ToList();
                                    foreach (var rule in activeMasterRules)
                                    {
                                        int rejectedQty = Math.Max(1, (int)Math.Round(effectiveMasterQty * rule.LotMultiplier));
                                        LogRejectionDebounced(rule.SlaveAccountName, rejectMsg);
                                        EnqueueRejectionEvent(account.Name, rule.SlaveAccountName, e.Execution.Instrument?.FullName ?? "", actStr, rejectedQty, rejectMsg);
                                    }
                                    return;
                                }

                                // 📡 2. Notificação de Execução para Copy Reverso
                                var masterEv = new MasterExecutionEvent
                                {
                                    EventType = "ENTRY",
                                    AccountName = account.Name,
                                    Symbol = e.Execution.Instrument?.FullName ?? "",
                                    Action = actStr,
                                    Quantity = effectiveMasterQty,
                                    Price = fillP,
                                    StopLoss = detectedSl,
                                    TakeProfit = detectedTp,
                                    StopLossPoints = stopLossPoints,
                                    TakeProfitPoints = takeProfitPoints,
                                    OrderId = execOrder.OrderId,
                                    OrderName = execOrder.Name,
                                    Timestamp = DateTime.UtcNow.ToString("o")
                                };

                                _masterEventsQueue.Enqueue(masterEv);
                                Log($"📡 [MASTER EVENT CAPTURADO]: {actStr} {effectiveMasterQty}x {masterEv.Symbol} @ {fillP:F2} (SL: {detectedSl:F2} | TP: {detectedTp:F2}) na conta {account.Name} (Enfileirado para Copy Reverso)");

                                // ⚡⚡ 3. Cópia C# Instantânea em Memória para Todas as Contas Slaves Ativas (Suporta Market, Limit e Stop preenchidas com SL e TP)
                                string masterEntryExecKey = $"MASTER_EXEC_ENTRY_{account.Name}_{execOrder.OrderId}_{e.Execution.ExecutionId}";
                                if (!_processedExecOrderIds.TryAdd(masterEntryExecKey, DateTime.UtcNow))
                                {
                                    return;
                                }

                                var matchingEntryRules = _copyRules.Values
                                    .Where(r => r != null && r.IsActive && string.Equals(r.MasterAccountName, account.Name, StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(r.SlaveAccountName))
                                    .GroupBy(r => r.SlaveAccountName.Trim().ToLowerInvariant())
                                    .Select(g => g.First())
                                    .ToList();
                                foreach (var rule in matchingEntryRules)
                                {
                                    try
                                    {
                                        // 🔒 Proteção Absoluta contra Auto-Copy (Master copiando para si mesma)
                                        if (string.Equals(rule.SlaveAccountName, account.Name, StringComparison.OrdinalIgnoreCase) ||
                                            string.Equals(rule.SlaveAccountName, rule.MasterAccountName, StringComparison.OrdinalIgnoreCase))
                                        {
                                            continue;
                                        }

                                        Account slaveAcc = null;
                                        lock (Account.All)
                                        {
                                            slaveAcc = Account.All.FirstOrDefault(a => a != null && string.Equals(a.Name, rule.SlaveAccountName, StringComparison.OrdinalIgnoreCase));
                                        }

                                        if (slaveAcc == null || string.Equals(slaveAcc.Name, account.Name, StringComparison.OrdinalIgnoreCase))
                                        {
                                            continue;
                                        }

                                        string orderSlaveKey = $"{execOrder.OrderId}_{slaveAcc.Name.Trim().ToLowerInvariant()}";
                                        int alreadyCopiedForSlave = _copiedLotsPerMasterOrderAndSlave.TryGetValue(orderSlaveKey, out int ac) ? ac : 0;
                                        int masterFilledSoFar = execOrder.Filled > 0 ? execOrder.Filled : effectiveMasterQty;
                                        int masterDeltaToCopy = masterFilledSoFar - alreadyCopiedForSlave;

                                        if (masterDeltaToCopy <= 0)
                                        {
                                            continue; // Já copiado anteriormente por outro fill deste mesmo pedido
                                        }

                                        if (IsAccountReadyForTrading(slaveAcc))
                                        {
                                            EnsureAccountSubscribed(slaveAcc);

                                            // Checar filtro de ativos permitidos na conta slave
                                            if (!IsSymbolAllowed(execOrder.Instrument, rule))
                                            {
                                                Log($"⚠️ [COPY FILTRADO]: Ativo {execOrder.Instrument?.FullName} ignorado para Slave {slaveAcc.Name} (Filtro: {rule.AllowedSymbols})");
                                                continue;
                                            }

                                            int rawSlaveQty = Math.Max(1, (int)Math.Round(masterDeltaToCopy * rule.LotMultiplier));
                                            int slaveQty = ClampLotSizeForAccount(slaveAcc.Name, rawSlaveQty, out _, out _);
                                            _copiedLotsPerMasterOrderAndSlave[orderSlaveKey] = masterFilledSoFar;

                                            // Checar bloqueio de risco e limites diários da conta slave (Horário, Quantidade de Operações e Meta Diária de Loss/Take)
                                            if (_accountRiskStates.TryGetValue(slaveAcc.Name, out AccountRiskInfo sRisk))
                                            {
                                                if (!CanAccountTrade(sRisk, out string rejReason))
                                                {
                                                    LogRejectionDebounced(slaveAcc.Name, rejReason);
                                                    EnqueueRejectionEvent(account.Name, slaveAcc.Name, e.Execution.Instrument?.FullName ?? "", actStr, slaveQty, rejReason);
                                                    continue;
                                                }
                                            }

                                            Instrument slaveInst = ResolveSlaveInstrument(execOrder.Instrument, rule);
                                            if (slaveInst == null) slaveInst = execOrder.Instrument;

                                            TimeInForce entryTif = execOrder != null ? execOrder.TimeInForce : TimeInForce.Day;

                                            Order slaveEntryOrder = CreateStealthOrder(
                                                slaveAcc,
                                                slaveInst,
                                                isBuy ? OrderAction.Buy : OrderAction.Sell,
                                                OrderType.Market,
                                                OrderEntry.Manual,
                                                entryTif,
                                                slaveQty,
                                                0,
                                                0,
                                                "",
                                                "Copy_Entry"
                                            );

                                            RegisterInternalOrder(slaveEntryOrder.OrderId);
                                            RegisterCopyOrder(slaveEntryOrder.OrderId);

                                            string copyKey = $"{account.Name}_{slaveAcc.Name}_{GetNormalizedInstrumentKey(slaveInst.FullName)}";
                                            _activeCopiedPositions[copyKey] = 1;
                                            _lastReconcileAdjustmentTime[$"{slaveAcc.Name}_{slaveInst.FullName}"] = DateTime.UtcNow;
                                            StealthSubmit(slaveAcc, slaveEntryOrder);

                                            Log($"⚡⚡ [COPY C# INSTANTÂNEO <0.1ms]: {(isBuy ? OrderAction.Buy : OrderAction.Sell)} {slaveQty}x {slaveInst.FullName} na Slave {slaveAcc.Name} (Master: {account.Name} | Mult: {rule.LotMultiplier:F1}x | SL: {detectedSl:F2} | TP: {detectedTp:F2})");
                                        }
                                    }
                                    catch (Exception copyEx)
                                    {
                                        Log($"[ERRO COPY C# INSTANTÂNEO]: {copyEx.Message}");
                                    }
                                }
                            }
                        }

                        // 3. Notificações imediatas no Telegram quando ordem é preenchida
                        if (execOrder.OrderState == OrderState.Filled && account != null && IsAccountMonitored(account.Name))
                        {
                            if (AxionGatewayState.MonitorarOrdens)
                            {
                                Position posBeforeExec = null;
                                if (account.Positions != null)
                                {
                                    lock (account.Positions)
                                    {
                                        posBeforeExec = account.Positions.FirstOrDefault(p => p != null && (
                                            p.Instrument == execOrder.Instrument ||
                                            (p.Instrument != null && execOrder.Instrument != null && (
                                                p.Instrument.FullName == execOrder.Instrument.FullName ||
                                                (p.Instrument.MasterInstrument != null && execOrder.Instrument.MasterInstrument != null && string.Equals(p.Instrument.MasterInstrument.Name, execOrder.Instrument.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))
                                            ))
                                        ));
                                    }
                                }

                                bool isPosAfterFlat = posBeforeExec == null || posBeforeExec.MarketPosition == MarketPosition.Flat || posBeforeExec.Quantity == 0;
                                bool isBuyAction = execOrder.OrderAction == OrderAction.Buy || execOrder.OrderAction == OrderAction.BuyToCover;
                                bool isSellAction = execOrder.OrderAction == OrderAction.Sell || execOrder.OrderAction == OrderAction.SellShort;
                                bool isExplicitExitOrder = IsExitOrProtectionOrderName(execOrder.Name) ||
                                                           execOrder.OrderAction == OrderAction.BuyToCover ||
                                                           IsAccountCurrentlyFlattening(account.Name);

                                bool isRealEntry = false;
                                bool isRealExit = false;

                                if (isExplicitExitOrder || isPosAfterFlat)
                                {
                                    isRealExit = true;
                                }
                                else if (posBeforeExec.MarketPosition == MarketPosition.Long)
                                {
                                    if (isBuyAction) isRealEntry = true;
                                    else if (isSellAction) isRealExit = true;
                                }
                                else if (posBeforeExec.MarketPosition == MarketPosition.Short)
                                {
                                    if (isSellAction) isRealEntry = true;
                                    else if (isBuyAction) isRealExit = true;
                                }

                                string tgKey = $"TG_{account.Name}_{e.Execution.ExecutionId}";
                                if (_processedTelegramExecIds.TryAdd(tgKey, DateTime.UtcNow))
                                {
                                    if (isRealEntry && AxionGatewayState.EnviarMensagensAbertura)
                                    {
                                        string dir = isBuyAction ? "COMPRA (LONG) 🟢" : "VENDA (SHORT) 🔴";
                                        string msg = $"🚀 <b>{AxionGatewayState.TituloMensagens} - ORDEM DE ENTRADA</b>\n" +
                                                     $"👤 Conta: <b>{account.Name}</b>\n" +
                                                     $"🎯 Ativo: <b>{e.Execution.Instrument?.FullName}</b>\n" +
                                                     $"📊 Direção: <b>{dir}</b>\n" +
                                                     $"🔢 Contratos: <b>{e.Execution.Quantity}</b>\n" +
                                                     $"💲 Preço: <b>{e.Execution.Price:F2}</b>\n" +
                                                     $"⏰ Horário: <code>{DateTime.Now:HH:mm:ss}</code>";
                                        SendTelegramMessageAsync(msg);
                                    }
                                    else if (isRealExit && AxionGatewayState.EnviarMensagensResultado)
                                    {
                                        double entryPrice = (posBeforeExec != null && posBeforeExec.AveragePrice > 0) ? posBeforeExec.AveragePrice : e.Execution.Price;
                                        double exitPrice = e.Execution.Price;
                                        double points = 0;
                                        if (posBeforeExec != null && posBeforeExec.MarketPosition == MarketPosition.Long)
                                        {
                                            points = exitPrice - entryPrice;
                                        }
                                        else if (posBeforeExec != null && posBeforeExec.MarketPosition == MarketPosition.Short)
                                        {
                                            points = entryPrice - exitPrice;
                                        }

                                        double pointVal = (e.Execution.Instrument?.MasterInstrument?.PointValue > 0) ? e.Execution.Instrument.MasterInstrument.PointValue : 20.0;
                                        double tradePnl = points * pointVal * e.Execution.Quantity;

                                        string exitType;
                                        string emoji;
                                        if (execOrder.OrderType == OrderType.Limit || (!string.IsNullOrEmpty(execOrder.Name) && (execOrder.Name.Contains("Target") || execOrder.Name.Contains("TP"))))
                                        {
                                            exitType = points >= 0 ? "TAKE PROFIT (ALVO ATINGIDO)" : "FECHAMENTO LIMITADO";
                                            emoji = "🎯";
                                        }
                                        else if (execOrder.OrderType == OrderType.StopMarket || execOrder.OrderType == OrderType.StopLimit || (!string.IsNullOrEmpty(execOrder.Name) && (execOrder.Name.Contains("Stop") || execOrder.Name.Contains("SL"))))
                                        {
                                            exitType = points <= 0 ? "STOP LOSS (STOP ATINGIDO)" : "TRAILING STOP / STOP GAIN";
                                            emoji = points <= 0 ? "🛑" : "🟢";
                                        }
                                        else
                                        {
                                            exitType = points > 0 ? "FECHAMENTO MANUAL (GAIN)" : (points < 0 ? "FECHAMENTO MANUAL (LOSS)" : "FECHAMENTO MANUAL (0x0)");
                                            emoji = points > 0 ? "🟢" : (points < 0 ? "🔴" : "⚪");
                                        }

                                        double initialRealized = 0;
                                        try { initialRealized = account.Get(AccountItem.RealizedProfitLoss, Currency.UsDollar); } catch { }
                                        double realizedPnl = initialRealized;

                                        // O NinjaTrader 8 leva de 20ms a 200ms para recalcular e atualizar internamente o AccountItem.RealizedProfitLoss após o disparo do ExecutionUpdate.
                                        // Aguardamos com polling curto (até 500ms) para capturar o PnL Realizado exato e consolidado da conta.
                                        for (int waitIdx = 0; waitIdx < 10; waitIdx++)
                                        {
                                            Thread.Sleep(50);
                                            try
                                            {
                                                double currentRealized = account.Get(AccountItem.RealizedProfitLoss, Currency.UsDollar);
                                                if (Math.Abs(currentRealized - initialRealized) > 0.001)
                                                {
                                                    realizedPnl = currentRealized;
                                                    break;
                                                }
                                            }
                                            catch { }
                                        }

                                        // Se após o polling o NinjaTrader ainda não tiver atualizado o saldo realizado, somamos explicitamente o resultado do trade recém-fechado
                                        if (Math.Abs(realizedPnl - initialRealized) < 0.001 && Math.Abs(tradePnl) > 0.001)
                                        {
                                            realizedPnl = initialRealized + tradePnl;
                                        }

                                        string pnlTradeFormatted = (tradePnl >= 0 ? "+$" : "-$") + Math.Abs(tradePnl).ToString("N2", CultureInfo.InvariantCulture);
                                        string pnlRealizedFormatted = (realizedPnl >= 0 ? "+$" : "-$") + Math.Abs(realizedPnl).ToString("N2", CultureInfo.InvariantCulture);

                                        string msg = $"{emoji} <b>{AxionGatewayState.TituloMensagens} - RESULTADO DO TRADE</b>\n" +
                                                     $"👤 Conta: <b>{account.Name}</b>\n" +
                                                     $"🎯 Ativo: <b>{e.Execution.Instrument?.FullName}</b>\n" +
                                                     $"📋 Tipo: <b>{exitType}</b>\n" +
                                                     $"🔢 Lotes Encerrados: <b>{e.Execution.Quantity}</b>\n" +
                                                     $"💲 Entrada: <b>{entryPrice:F2}</b> ➔ Saída: <b>{exitPrice:F2}</b> ({(points >= 0 ? "+" : "")}{points:F2} pts)\n" +
                                                     $"💰 Resultado Trade: <b>{pnlTradeFormatted}</b>\n" +
                                                     $"💵 PnL Realizado do Dia: <b>{pnlRealizedFormatted}</b>\n" +
                                                     $"⏰ Horário: <code>{DateTime.Now:HH:mm:ss}</code>";
                                        SendTelegramMessageAsync(msg);
                                    }
                                }
                            }

                            // Validação de risco após execução
                            VerificarGestaoDeRisco(account);
                        }
                    }
                    catch (Exception updateEx)
                    {
                        Log($"[ERRO BACKGROUND EXECUTION UPDATE]: {updateEx.Message}");
                    }
                });
            }
            catch (Exception ex)
            {
                Log($"[ERRO EXECUTION UPDATE]: {ex.Message}");
            }
        }

        #endregion

        #region Gestão de Risco Automática

        private static void VerificarGestaoDeRisco(Account account)
        {
            if (account == null) return;

            if (_accountRiskStates.TryGetValue(account.Name, out AccountRiskInfo riskInfo))
            {
                if (!AxionGatewayState.HabilitarGestaoRiscoGlobal && !riskInfo.RiskManagementEnabled && riskInfo.DailyLossLimitUsd <= 0 && riskInfo.DailyProfitTargetUsd <= 0)
                {
                    return;
                }

                double saldoInicial = riskInfo.InitialCashValue;
                if (saldoInicial <= 100) return; // Precisa de saldo base válido e positivo

                double saldoAtual = 0;
                try { saldoAtual = account.Get(AccountItem.CashValue, Currency.UsDollar); } catch { }
                if (saldoAtual <= 0)
                {
                    try { saldoAtual = account.Get(AccountItem.BuyingPower, Currency.UsDollar); } catch { }
                }
                // Se o saldo atual não foi lido ou retornou <= 100, NUNCA calcular nem bloquear conta por falso-positivo!
                if (saldoAtual <= 100) return;

                double pnlCurrency = saldoAtual - saldoInicial;
                double pnlTotal = (pnlCurrency / saldoInicial) * 100.0;

                // Stop Loss Atingido (Moeda $ ou %)
                bool hitStopLoss = (riskInfo.DailyLossLimitUsd > 0 && pnlCurrency <= -Math.Abs(riskInfo.DailyLossLimitUsd)) ||
                                   (riskInfo.RiskManagementEnabled && riskInfo.StopLossPercent > 0 && pnlTotal <= -Math.Abs(riskInfo.StopLossPercent));

                if (hitStopLoss)
                {
                    if (!riskInfo.WasStopLossTriggered)
                    {
                        riskInfo.IsBlocked = true;
                        riskInfo.WasStopLossTriggered = true;
                        riskInfo.WasTakeProfitTriggered = false;

                        CancelarOrdensPendentes(account);
                        FecharTodasPosicoesDaConta(account);
                        Log($"🚨 [RISCO CRÍTICO] Stop Loss Atingido para conta {account.Name}! P&L: ${pnlCurrency:F2} ({pnlTotal:F2}%)");

                        string alertMsg = $"🚨 <b>ALERTA DE RISCO - STOP LOSS ATINGIDO</b>\n" +
                                          $"👤 Conta: <b>{account.Name}</b>\n" +
                                          $"📉 P&L Sessão: <b>${pnlCurrency:F2} ({(pnlTotal >= 0 ? "+" : "")}{pnlTotal:F2}%)</b>\n" +
                                          $"💰 Saldo Base: <b>${saldoInicial:F2}</b> | Atual: <b>${saldoAtual:F2}</b>\n" +
                                          $"🛑 Ordens CANCELADAS, posições ZERADAS e conta BLOQUEADA!";
                        SendTelegramMessageAsync(alertMsg);
                    }
                }
                // Take Profit Atingido (Moeda $ ou %)
                else
                {
                    bool hitTakeProfit = (riskInfo.DailyProfitTargetUsd > 0 && pnlCurrency >= Math.Abs(riskInfo.DailyProfitTargetUsd)) ||
                                         (riskInfo.RiskManagementEnabled && riskInfo.TakeProfitPercent > 0 && pnlTotal >= Math.Abs(riskInfo.TakeProfitPercent));

                    if (hitTakeProfit)
                    {
                        if (!riskInfo.WasTakeProfitTriggered)
                        {
                            riskInfo.IsBlocked = true;
                            riskInfo.WasTakeProfitTriggered = true;
                            riskInfo.WasStopLossTriggered = false;

                            CancelarOrdensPendentes(account);
                            FecharTodasPosicoesDaConta(account);
                            Log($"🏆 [META ATINGIDA] Take Profit Atingido para conta {account.Name}! P&L: +${pnlCurrency:F2} (+{pnlTotal:F2}%)");

                            string alertMsg = $"🏆 <b>META ATINGIDA - TAKE PROFIT</b>\n" +
                                              $"👤 Conta: <b>{account.Name}</b>\n" +
                                              $"📈 P&L Sessão: <b>+${pnlCurrency:F2} (+{pnlTotal:F2}%)</b>\n" +
                                              $"💰 Saldo Base: <b>${saldoInicial:F2}</b> | Atual: <b>${saldoAtual:F2}</b>\n" +
                                              $"🔒 Posições ZERADAS e conta BLOQUEADA para proteção de lucro!";
                            SendTelegramMessageAsync(alertMsg);
                        }
                    }
                }
            }
        }

        public static void FecharTodasPosicoesDaConta(Account account)
        {
            if (account == null) return;
            try
            {
                MarkAccountFlattening(account.Name, 5000);

                var pendingKeys = _pendingBrackets.Where(kvp => kvp.Value.Account == account).Select(kvp => kvp.Key).ToList();
                foreach (var k in pendingKeys) _pendingBrackets.TryRemove(k, out _);

                CancelarOrdensPendentes(account);

                var openPositions = account.Positions.Where(p => p.MarketPosition != MarketPosition.Flat && Math.Abs(p.Quantity) > 0).ToList();
                foreach (var pos in openPositions)
                {
                    if (pos.Instrument != null && pos.MarketPosition != MarketPosition.Flat && Math.Abs(pos.Quantity) > 0)
                    {
                        OrderAction closeAction = pos.MarketPosition == MarketPosition.Long ? OrderAction.Sell : OrderAction.Buy;
                        int closeQty = Math.Abs(pos.Quantity);
                        if (SafeSubmitCloseOrder(account, pos.Instrument, closeAction, closeQty, "Close"))
                        {
                            Log($"[RISCO - ZERAGEM]: Posição fechada para {pos.Instrument.FullName} ({pos.MarketPosition} {closeQty}x) na conta {account.Name}");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Log($"[ERRO FECHAR POSICOES RISCO]: {ex.Message}");
            }
        }

        public static void FecharPosicaoDoAtivo(Account account, Instrument instrument)
        {
            if (account == null || instrument == null) return;
            try
            {
                MarkAccountFlattening(account.Name, 2.5, instrument?.FullName);
                CancelarOrdensPendentes(account, instrument);

                Position posToClose = null;
                if (account.Positions != null)
                {
                    lock (account.Positions)
                    {
                        posToClose = account.Positions.FirstOrDefault(p => p != null && p.Instrument == instrument && p.MarketPosition != MarketPosition.Flat && Math.Abs(p.Quantity) > 0);
                    }
                }

                if (posToClose != null)
                {
                    OrderAction closeAction = posToClose.MarketPosition == MarketPosition.Long ? OrderAction.Sell : OrderAction.Buy;
                    int closeQty = Math.Abs(posToClose.Quantity);
                    if (SafeSubmitCloseOrder(account, instrument, closeAction, closeQty, "Close"))
                    {
                        Log($"[ZERAGEM ATIVO]: Ordem {closeAction} {closeQty}x a mercado enviada para fechar {instrument.FullName} ({posToClose.MarketPosition}) na conta {account.Name}");
                    }
                }

                Task.Run(async () =>
                {
                    foreach (int d in new[] { 200, 600, 1200 })
                    {
                        await Task.Delay(d);
                        try { CancelarOrdensPendentes(account, instrument); } catch { }
                    }
                });
            }
            catch (Exception ex)
            {
                Log($"[ERRO FECHAR POSICAO ATIVO {instrument?.FullName} CONTA {account?.Name}]: {ex.Message}");
            }
        }

        public static void CancelarOrdensPendentes(Account account, Instrument inst = null)
        {
            if (account == null) return;
            try
            {
                if (account.Orders == null) return;
                var toCancel = new List<Order>();
                lock (account.Orders)
                {
                    foreach (var order in account.Orders.ToList())
                    {
                        if (order == null) continue;

                        // 🔒 NUNCA cancelar ordens de fechamento a mercado ou ordens de execução em andamento!
                        if (order.OrderType == OrderType.Market) continue;
                        if (!string.IsNullOrEmpty(order.Name) && (
                            order.Name == "Close" || 
                            order.Name == "Exit" || 
                            order.Name == "Zerar" || 
                            order.Name == "Copy_Close" ||
                            order.Name == "RiskClose" ||
                            order.Name == "RiskLotCap"))
                        {
                            continue;
                        }

                        // Se um instrumento foi especificado, apenas cancelar ordens deste instrumento
                        if (inst != null && order.Instrument != null && 
                            !string.Equals(order.Instrument.FullName, inst.FullName, StringComparison.OrdinalIgnoreCase) &&
                            (order.Instrument.MasterInstrument == null || inst.MasterInstrument == null || !string.Equals(order.Instrument.MasterInstrument.Name, inst.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase)))
                        {
                            continue;
                        }

                        // 🛡️ PRESERVAÇÃO DE ORDENS PENDENTES DE ENTRADA:
                        // NUNCA cancelar ordens pendentes de entrada (Limit, Stop, MIT de robôs ou trader) que estão aguardando no livro.
                        // Apenas ordens expressamente de saída/proteção (SL/TP) são canceladas na limpeza de brackets pós-fechamento,
                        // exceto se a conta estiver em comando explícito de zeragem total / pânico (IsAccountCurrentlyFlattening).
                        if (!IsAccountCurrentlyFlattening(account.Name))
                        {
                            if (!IsProtectionOrExitOrder(order))
                            {
                                continue; // Preserva ordens pendentes de entrada no book!
                            }
                        }

                        if (order.OrderState == OrderState.Working || order.OrderState == OrderState.Accepted || order.OrderState == OrderState.Submitted || order.OrderState == OrderState.TriggerPending)
                        {
                            toCancel.Add(order);
                        }
                    }
                }

                if (toCancel.Count > 0)
                {
                    SafeCancelOrders(account, toCancel.ToArray());
                    foreach (var o in toCancel)
                    {
                        Log($"[AUTO-CLEANUP 🧹]: Ordem de proteção pendente {o.Id} ({o.OrderType} {o.Instrument?.FullName}) cancelada na conta {account.Name}.");
                    }
                }
            }
            catch (Exception ex)
            {
                Log($"[ERRO CANCELAR ORDENS]: {ex.Message}");
            }
        }

        public static void BloquearContaManualmente(string accountName)
        {
            if (string.IsNullOrEmpty(accountName)) return;
            var info = GetAccountRiskInfo(accountName);
            if (info != null)
            {
                info.IsBlocked = true;
                if (info.Account != null)
                {
                    CancelarOrdensPendentes(info.Account);
                    FecharTodasPosicoesDaConta(info.Account);
                }
                Log($"[MANUAL] Conta {accountName} BLOQUEADA manualmente.");
            }
        }

        public static void DesbloquearContaManualmente(string accountName)
        {
            if (string.IsNullOrEmpty(accountName)) return;
            var info = GetAccountRiskInfo(accountName);
            if (info != null)
            {
                info.IsBlocked = false;
                info.WasStopLossTriggered = false;
                info.WasTakeProfitTriggered = false;
                if (info.Account != null)
                {
                    try
                    {
                        double currentCash = info.Account.Get(AccountItem.CashValue, Currency.UsDollar);
                        if (currentCash > 0)
                        {
                            info.InitialCashValue = currentCash;
                        }
                    }
                    catch { }
                }
                Log($"[MANUAL] Conta {accountName} DESBLOQUEADA manualmente. Saldo base reajustado para ${info.InitialCashValue:F2}.");
            }
        }

        public static void ChecarTransicaoSessaoRisco()
        {
            try
            {
                DateTime td = ObterTradingDayAtual();
                if (td == DateTime.MinValue) return;

                string currentSessionKey = td.ToString("yyyy-MM-dd");
                if (string.IsNullOrEmpty(AxionGatewayState.UltimaDataSessao))
                {
                    AxionGatewayState.UltimaDataSessao = currentSessionKey;
                    AxionGatewayState.Save();
                    return;
                }

                if (!string.Equals(AxionGatewayState.UltimaDataSessao, currentSessionKey, StringComparison.OrdinalIgnoreCase))
                {
                    Log($"🚩 [TRANSIÇÃO DE SESSÃO CME]: Mudança de dia operacional detectada ({AxionGatewayState.UltimaDataSessao} -> {currentSessionKey})!");
                    AxionGatewayState.UltimaDataSessao = currentSessionKey;
                    AxionGatewayState.Save();
                    ResetarSessaoRisco(manual: false, motivo: $"Mudança de dia operacional CME ({currentSessionKey})");
                }
            }
            catch { }
        }

        public static void NotificarPrimeiroCandleSessao(DateTime candleTime, DateTime tradingDay, string source)
        {
            try
            {
                // Se tradingDay for válido, usa como chave da sessão diária oficial da bolsa; caso contrário usa a data do candle
                string sessionKey = (tradingDay != DateTime.MinValue && tradingDay != Core.Globals.MinDate)
                    ? tradingDay.ToString("yyyy-MM-dd")
                    : candleTime.ToString("yyyy-MM-dd");

                // Trava anti-duplicação se múltiplos ativos/gráficos chamarem ao mesmo tempo
                if (string.Equals(AxionGatewayState.UltimaDataSessao, sessionKey, StringComparison.OrdinalIgnoreCase))
                {
                    return;
                }

                Log($"🚩 [PRIMEIRO CANDLE DA SESSÃO]: Nova sessão diária ({sessionKey}) detectada via {source} no candle {candleTime:dd/MM/yyyy HH:mm:ss}!");
                AxionGatewayState.UltimaDataSessao = sessionKey;
                AxionGatewayState.Save();

                ResetarSessaoRisco(manual: false, motivo: $"Primeiro candle da nova sessão ({source} @ {candleTime:HH:mm} | TradingDay: {sessionKey})");
            }
            catch (Exception ex)
            {
                Log($"[ERRO NOTIFICAR SESSÃO]: {ex.Message}");
            }
        }

        public static DateTime ObterTradingDayAtual()
        {
            try
            {
                DateTime now = Cbi.Connection.PlaybackConnection != null ? Cbi.Connection.PlaybackConnection.Now : Core.Globals.Now;

                TradingHours th = null;
                var sampleInst = Instrument.GetInstrument("MNQ") ?? Instrument.GetInstrument("NQ") ?? Instrument.GetInstrument("ES") ?? Instrument.GetInstrument("MES");
                if (sampleInst != null && sampleInst.MasterInstrument != null)
                {
                    th = sampleInst.MasterInstrument.TradingHours;
                }

                if (th == null)
                {
                    th = TradingHours.All.FirstOrDefault(t => t.Name == "CME US Index Futures ETH") ??
                         TradingHours.All.FirstOrDefault(t => t.Name.Contains("CME US Index") || t.Name.Contains("CME Index")) ??
                         TradingHours.All.FirstOrDefault(t => t.Name == "Default 24/7" || t.Name == "Default 24/5");
                }

                if (th != null)
                {
                    var sessIt = new SessionIterator(th);
                    sessIt.GetNextSession(now, false);
                    return sessIt.ActualTradingDayExchange;
                }
            }
            catch { }

            // Fallback determinístico de horário CME (Chicago / Central Time):
            // Nova sessão diária CME inicia pontualmente às 17:00 Chicago Time (18:00 BRT no horário de verão americano, ou 19:00 BRT no horário padrão).
            try
            {
                TimeZoneInfo ctZone = null;
                try
                {
                    ctZone = TimeZoneInfo.FindSystemTimeZoneById("Central Standard Time");
                }
                catch
                {
                    try { ctZone = TimeZoneInfo.FindSystemTimeZoneById("America/Chicago"); } catch { }
                }

                DateTime ctNow = ctZone != null ? TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, ctZone) : DateTime.UtcNow.AddHours(-5);
                DateTime tradeDate = ctNow.Date;
                if (ctNow.TimeOfDay >= new TimeSpan(17, 0, 0))
                {
                    tradeDate = tradeDate.AddDays(1);
                }
                // Se cair em sábado, avança para segunda-feira
                if (tradeDate.DayOfWeek == DayOfWeek.Saturday) tradeDate = tradeDate.AddDays(2);
                else if (tradeDate.DayOfWeek == DayOfWeek.Sunday) tradeDate = tradeDate.AddDays(1);
                return tradeDate;
            }
            catch { }

            return DateTime.MinValue;
        }

        public static void ResetarSessaoRisco(bool manual = false, string motivo = "")
        {
            try
            {
                lock (_accountRiskStates)
                {
                    lock (Account.All)
                    {
                        foreach (var acc in Account.All)
                        {
                            if (acc == null) continue;
                            if (!_accountRiskStates.TryGetValue(acc.Name, out AccountRiskInfo info))
                            {
                                info = new AccountRiskInfo(acc);
                                _accountRiskStates[acc.Name] = info;
                            }
                            else
                            {
                                info.Account = acc;
                                info.ResetSessionValues();
                            }
                        }
                    }
                }

                if (manual)
                {
                    DateTime td = ObterTradingDayAtual();
                    if (td != DateTime.MinValue)
                    {
                        AxionGatewayState.UltimaDataSessao = td.ToString("yyyy-MM-dd");
                        AxionGatewayState.Save();
                    }
                }

                string trigger = manual ? "Manual via Painel" : (!string.IsNullOrEmpty(motivo) ? motivo : "Automático (Nova Sessão de Mercado)");
                Log($"🔄 [RESET SESSÃO] Gestão de risco reiniciada com sucesso! [{trigger}]");

                string msg = $"🔄 <b>RESET DE SESSÃO DIÁRIA — GESTÃO DE RISCO</b>\n\n" +
                             $"📅 <b>Data/Hora:</b> {DateTime.Now:dd/MM/yyyy HH:mm:ss}\n" +
                             $"⚙️ <b>Gatilho:</b> {trigger}\n" +
                             $"✅ Todas as contas foram desbloqueadas e os saldos base foram atualizados!";
                SendTelegramMessageAsync(msg);
            }
            catch (Exception ex)
            {
                Log($"[ERRO RESET SESSÃO]: {ex.Message}");
            }
        }

        public static AccountRiskInfo GetAccountRiskInfo(string accountName)
        {
            if (string.IsNullOrEmpty(accountName)) return null;
            lock (_accountRiskStates)
            {
                if (_accountRiskStates.TryGetValue(accountName, out AccountRiskInfo info)) return info;
                return null;
            }
        }

        public static AccountRiskInfo GetOrCreateAccountRiskInfo(Account acc)
        {
            if (acc == null) return null;
            lock (_accountRiskStates)
            {
                if (!_accountRiskStates.TryGetValue(acc.Name, out AccountRiskInfo info))
                {
                    info = new AccountRiskInfo(acc);
                    _accountRiskStates[acc.Name] = info;
                }
                return info;
            }
        }

        #endregion

        #region Relatórios Periódicos, Auto-Reconciliação e Telegram

        private void StartPeriodicTimers()
        {
            _periodicReportTimer = new System.Timers.Timer(15000); // Checa relatórios a cada 15 segundos
            _periodicReportTimer.Elapsed += (s, e) => ChecarDisparoRelatorios();
            _periodicReportTimer.Start();

            // 🔄 Motor de Auto-Reconciliação e Limpeza Automática Contínua a cada 500ms
            _autoReconcileTimer = new System.Timers.Timer(500);
            _autoReconcileTimer.Elapsed += (s, e) =>
            {
                try
                {
                    ChecarTransicaoSessaoRisco();
                    CleanupOldExecutions();
                    AutoReconcileCopyPositions();
                }
                catch { }
            };
            _autoReconcileTimer.Start();
        }

        private void StopPeriodicTimers()
        {
            try
            {
                _periodicReportTimer?.Stop();
                _periodicReportTimer?.Dispose();
                _autoReconcileTimer?.Stop();
                _autoReconcileTimer?.Dispose();
            }
            catch { }
        }

        #region Reconciliação Automática Contínua de Posições (Auto-Reconcile Delta Engine)

        private static void CleanupOldExecutions()
        {
            try
            {
                if ((DateTime.UtcNow - _lastCleanupTime).TotalSeconds < CLEANUP_INTERVAL_SECONDS)
                    return;

                _lastCleanupTime = DateTime.UtcNow;
                var cutoff = DateTime.UtcNow.AddMinutes(-EXECUTION_RETENTION_MINUTES);

                var keysToRemove = _processedExecOrderIds
                    .Where(kvp => kvp.Value < cutoff)
                    .Select(kvp => kvp.Key)
                    .ToList();

                foreach (var key in keysToRemove)
                {
                    _processedExecOrderIds.TryRemove(key, out _);
                }

                var tgKeysToRemove = _processedTelegramExecIds
                    .Where(kvp => kvp.Value < cutoff)
                    .Select(kvp => kvp.Key)
                    .ToList();

                foreach (var key in tgKeysToRemove)
                {
                    _processedTelegramExecIds.TryRemove(key, out _);
                }
            }
            catch { }
        }

        private static readonly ConcurrentDictionary<string, object> _slaveReconcileLocks = new ConcurrentDictionary<string, object>(StringComparer.OrdinalIgnoreCase);

        /// <summary>
        /// Motor Central de Reconciliação Atômica e Autocura de Brackets (Stop Loss & Take Profit)
        /// Garante sincronização determinística 100% entre Master e Slaves, com mesmo OCO ID e tolerância a atrasos de ATM.
        /// </summary>
        public static void ReconcileSlaveBrackets(Account masterAcc, Account slaveAcc, Instrument masterInst, Instrument slaveInst, CopyTradingRule rule)
        {
            if (masterAcc == null || slaveAcc == null || masterInst == null || slaveInst == null || rule == null || !rule.IsActive)
                return;

            if (!AxionLicenseManager.IsLicensed)
                return;

            if (string.Equals(slaveAcc.Name, masterAcc.Name, StringComparison.OrdinalIgnoreCase))
                return;

            if (!IsAccountReadyForTrading(slaveAcc))
                return;

            // Bloqueio de risco da Slave
            if (_accountRiskStates.TryGetValue(slaveAcc.Name, out AccountRiskInfo sRisk) && sRisk.IsBlocked)
                return;

            if (IsAccountCurrentlyFlattening(masterAcc.Name, masterInst.FullName) || IsAccountCurrentlyFlattening(slaveAcc.Name, slaveInst.FullName))
            {
                CancelarOrdensPendentes(slaveAcc, slaveInst);
                return;
            }

            string debounceKey = $"{masterAcc.Name}_{slaveAcc.Name}_{slaveInst.FullName}";
            DateTime now = DateTime.UtcNow;
            if (_lastReconcileAdjustmentTime.TryGetValue(debounceKey, out DateTime lastRecTime))
            {
                if ((now - lastRecTime).TotalMilliseconds < 50)
                {
                    return; // Suprime reconciliações redundantes em rajada no mesmo tick (< 50ms)
                }
            }
            _lastReconcileAdjustmentTime[debounceKey] = now;

            string lockKey = $"{slaveAcc.Name}_{slaveInst.FullName}";
            object syncLock = _slaveReconcileLocks.GetOrAdd(lockKey, _ => new object());

            lock (syncLock)
            {
                try
                {
                    // 1. Posições Atuais
                    Position masterPos = null;
                    if (masterAcc.Positions != null)
                    {
                        lock (masterAcc.Positions)
                        {
                            masterPos = masterAcc.Positions.FirstOrDefault(p => p != null && (
                                p.Instrument == masterInst ||
                                (p.Instrument != null && (p.Instrument.FullName == masterInst.FullName ||
                                 (p.Instrument.MasterInstrument != null && masterInst.MasterInstrument != null && string.Equals(p.Instrument.MasterInstrument.Name, masterInst.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))))
                            ));
                        }
                    }

                    Position slavePos = null;
                    if (slaveAcc.Positions != null)
                    {
                        lock (slaveAcc.Positions)
                        {
                            slavePos = slaveAcc.Positions.FirstOrDefault(p => p != null && (
                                p.Instrument == slaveInst ||
                                (p.Instrument != null && (p.Instrument.FullName == slaveInst.FullName ||
                                 (p.Instrument.MasterInstrument != null && slaveInst.MasterInstrument != null && string.Equals(p.Instrument.MasterInstrument.Name, slaveInst.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))))
                            ));
                        }
                    }

                    bool isMasterFlat = (masterPos == null || masterPos.MarketPosition == MarketPosition.Flat || masterPos.Quantity == 0);
                    bool isSlaveFlat = (slavePos == null || slavePos.MarketPosition == MarketPosition.Flat || slavePos.Quantity == 0);

                    string copyKey = $"{masterAcc.Name}_{slaveAcc.Name}_{GetNormalizedInstrumentKey(slaveInst.FullName)}";

                    // ── CENÁRIO 1: Master está FLAT ──────────────────────────────────
                    if (isMasterFlat)
                    {
                        if (!isSlaveFlat)
                        {
                            // 🔒 CRÍTICO: Só encerra a posição na Slave se ela foi comprovadamente
                            // copiada por esta Master! Se a posição é de outro robô/estratégia ou manual, NUNCA mexe!
                            if (rule.CloseSlavesOnMasterClose && _activeCopiedPositions.ContainsKey(copyKey))
                            {
                                _activeCopiedPositions.TryRemove(copyKey, out _);
                                OrderAction closeAct = slavePos.MarketPosition == MarketPosition.Long ? OrderAction.Sell : OrderAction.Buy;
                                int closeQty = Math.Abs(slavePos.Quantity);
                                CancelarOrdensPendentes(slaveAcc, slaveInst);
                                SafeSubmitCloseOrder(slaveAcc, slavePos.Instrument ?? slaveInst, closeAct, closeQty, "Copy_Close");
                                Log($"⚡⚡ [RECONCILE CLOSE]: Slave {slaveAcc.Name} encerrada ({slavePos.MarketPosition} {closeQty}x) pois Master {masterAcc.Name} está FLAT em {slaveInst.FullName}");
                            }
                            else if (!rule.CloseSlavesOnMasterClose)
                            {
                                // Master está flat, mas a Slave está configurada para continuar sua operação autonomamente com seu SL e TP
                                _activeCopiedPositions.TryRemove(copyKey, out _);
                            }
                        }
                        else
                        {
                            _activeCopiedPositions.TryRemove(copyKey, out _);
                        }
                        return;
                    }

                    // ── CENÁRIO 2: Master possui posição, mas Slave está FLAT ──────────
                    if (isSlaveFlat)
                    {
                        bool hasEntryInFlight = false;
                        if (slaveAcc.Orders != null)
                        {
                            lock (slaveAcc.Orders)
                            {
                                hasEntryInFlight = slaveAcc.Orders.Any(o => o != null && 
                                    (o.Instrument == slaveInst || (o.Instrument != null && o.Instrument.FullName == slaveInst.FullName)) &&
                                    (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted || o.OrderState == OrderState.Submitted || o.OrderState == OrderState.Initialized || o.OrderState == OrderState.TriggerPending) &&
                                    (o.OrderType == OrderType.Market || (!string.IsNullOrEmpty(o.Name) && o.Name.Contains("Entry"))));
                            }
                        }

                        // Verificar também se uma ordem de entrada ou ajuste recente foi disparado nos últimos 5 segundos
                        bool recentCopyEntry = false;
                        string entryKey = $"{slaveAcc.Name}_{slaveInst.FullName}";
                        if (_lastReconcileAdjustmentTime.TryGetValue(entryKey, out DateTime lastEntryTime))
                        {
                            if ((DateTime.UtcNow - lastEntryTime).TotalSeconds < 5.0)
                            {
                                recentCopyEntry = true;
                            }
                        }

                        if (!hasEntryInFlight && !recentCopyEntry)
                        {
                            CancelarOrdensPendentes(slaveAcc, slaveInst);
                        }
                        return;
                    }

                    // Se a Slave já possui uma ordem de saída/fechamento em andamento ou está em zeragem, nunca submete novos brackets
                    bool hasSlaveExitInFlight = false;
                    if (slaveAcc.Orders != null)
                    {
                        lock (slaveAcc.Orders)
                        {
                            hasSlaveExitInFlight = slaveAcc.Orders.Any(o => o != null &&
                                (o.Instrument == slaveInst || (o.Instrument != null && o.Instrument.FullName == slaveInst.FullName)) &&
                                (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted || o.OrderState == OrderState.Submitted || o.OrderState == OrderState.Initialized) &&
                                (o.OrderAction == OrderAction.BuyToCover || (!string.IsNullOrEmpty(o.Name) && (
                                    o.Name.IndexOf("Close", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                    o.Name.IndexOf("Zerar", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                    o.Name.IndexOf("Flatten", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                    o.Name.IndexOf("Exit", StringComparison.OrdinalIgnoreCase) >= 0))));
                        }
                    }

                    if (IsAccountCurrentlyFlattening(slaveAcc.Name, slaveInst.FullName))
                    {
                        CancelarOrdensPendentes(slaveAcc, slaveInst);
                        return;
                    }

                    if (hasSlaveExitInFlight)
                    {
                        // Aguarda a ordem de saída parcial em trânsito ser confirmada pela corretora, NUNCA cancela os brackets das outras posições!
                        return;
                    }

                    // ── CENÁRIO 3: Ambas possuem posições abertas ──────────────────────
                    // Proteção contra posição invertida
                    if (slavePos.MarketPosition != masterPos.MarketPosition)
                    {
                        OrderAction closeAct = slavePos.MarketPosition == MarketPosition.Long ? OrderAction.Sell : OrderAction.Buy;
                        int closeQty = Math.Abs(slavePos.Quantity);
                        CancelarOrdensPendentes(slaveAcc, slaveInst);
                        SafeSubmitCloseOrder(slaveAcc, slavePos.Instrument ?? slaveInst, closeAct, closeQty, "Copy_Close");
                        Log($"🚨 [RECONCILE INVERSE]: Posição invertida ({slavePos.MarketPosition} {closeQty}x) fechada na Slave {slaveAcc.Name} contra Master {masterAcc.Name} ({masterPos.MarketPosition})");
                        return;
                    }

                    // 🛡️ Cópia de estratégia ATM / brackets é 100% OBRIGATÓRIA e mandatória
                    // Reconciliação contínua de Stop Loss e Take Profit ativada para todas as Slaves

                    // Mesma direção (ambas Long ou ambas Short)
                    _activeCopiedPositions[copyKey] = 1;
                    bool isMasterLong = masterPos.MarketPosition == MarketPosition.Long;
                    bool isSlaveLong = slavePos.MarketPosition == MarketPosition.Long;
                    int slaveQty = Math.Abs(slavePos.Quantity);
                    OrderAction exitAction = isSlaveLong ? OrderAction.Sell : OrderAction.Buy;
                    double slaveTick = (slaveInst.MasterInstrument != null && slaveInst.MasterInstrument.TickSize > 0) ? slaveInst.MasterInstrument.TickSize : 0.25;

                    // Consulta ordens ativas da Master (compatível com Buy/BuyToCover e Sell/SellShort)
                    List<Order> masterSlOrders = new List<Order>();
                    List<Order> masterTpOrders = new List<Order>();

                    if (masterAcc.Orders != null)
                    {
                        lock (masterAcc.Orders)
                        {
                            var mOrders = masterAcc.Orders.Where(o => o != null &&
                                (o.Instrument == masterInst || (o.Instrument != null && (o.Instrument.FullName == masterInst.FullName ||
                                 (o.Instrument.MasterInstrument != null && masterInst.MasterInstrument != null && string.Equals(o.Instrument.MasterInstrument.Name, masterInst.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))))) &&
                                (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted) &&
                                (isMasterLong ? (o.OrderAction == OrderAction.Sell || o.OrderAction == OrderAction.SellShort) : (o.OrderAction == OrderAction.Buy || o.OrderAction == OrderAction.BuyToCover))
                            ).ToList();

                            masterSlOrders = mOrders.Where(o => (o.OrderType == OrderType.StopMarket || o.OrderType == OrderType.StopLimit) && o.StopPrice > 0)
                                .OrderBy(o => isMasterLong ? -o.StopPrice : o.StopPrice)
                                .ToList();

                            masterTpOrders = mOrders.Where(o => o.OrderType == OrderType.Limit && o.LimitPrice > 0)
                                .OrderBy(o => isMasterLong ? o.LimitPrice : -o.LimitPrice)
                                .ToList();
                        }
                    }

                    // Fallback para níveis recentes reportados da Master caso a consulta de ordens do NT8 oscile temporariamente
                    string masterSymKey = $"{masterAcc.Name}_{masterInst.FullName}";
                    double fallbackSl = 0;
                    double fallbackTp = 0;
                    if (_lastReportedMasterLevels.TryGetValue(masterSymKey, out var fallbackLevels))
                    {
                        if (masterSlOrders.Count == 0 && fallbackLevels.sl > 0) fallbackSl = fallbackLevels.sl;
                        if (masterTpOrders.Count == 0 && fallbackLevels.tp > 0) fallbackTp = fallbackLevels.tp;
                    }

                    // Consulta ordens ativas existentes na Slave (compatível com Buy/BuyToCover e Sell/SellShort)
                    List<Order> slaveSlOrders = new List<Order>();
                    List<Order> slaveTpOrders = new List<Order>();

                    if (slaveAcc.Orders != null)
                    {
                        lock (slaveAcc.Orders)
                        {
                            var sOrders = slaveAcc.Orders.Where(o => o != null &&
                                (o.Instrument == slaveInst || (o.Instrument != null && (o.Instrument.FullName == slaveInst.FullName ||
                                 (o.Instrument.MasterInstrument != null && slaveInst.MasterInstrument != null && string.Equals(o.Instrument.MasterInstrument.Name, slaveInst.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))))) &&
                                (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted || o.OrderState == OrderState.Submitted || o.OrderState == OrderState.Initialized || o.OrderState == OrderState.TriggerPending) &&
                                (isSlaveLong ? (o.OrderAction == OrderAction.Sell || o.OrderAction == OrderAction.SellShort) : (o.OrderAction == OrderAction.Buy || o.OrderAction == OrderAction.BuyToCover))
                            ).ToList();

                            slaveSlOrders = sOrders.Where(o => (o.OrderType == OrderType.StopMarket || o.OrderType == OrderType.StopLimit))
                                .OrderBy(o => isSlaveLong ? -o.StopPrice : o.StopPrice)
                                .ToList();

                            slaveTpOrders = sOrders.Where(o => o.OrderType == OrderType.Limit)
                                .OrderBy(o => isSlaveLong ? o.LimitPrice : -o.LimitPrice)
                                .ToList();
                        }
                    }

                    // 🔒 Proteção Tradovate/Rithmic: Se já existirem ordens em trânsito de submissão ou cancelamento, aguarda a corretora confirmar antes de reconciliar
                    bool hasSlaveOrdersInTransit = slaveSlOrders.Any(o => o.OrderState == OrderState.Submitted || o.OrderState == OrderState.Initialized || o.OrderState == OrderState.CancelPending || _inFlightCancellingOrders.ContainsKey(o.OrderId)) ||
                                                   slaveTpOrders.Any(o => o.OrderState == OrderState.Submitted || o.OrderState == OrderState.Initialized || o.OrderState == OrderState.CancelPending || _inFlightCancellingOrders.ContainsKey(o.OrderId));
                    if (hasSlaveOrdersInTransit)
                    {
                        return;
                    }

                    bool hasMasterTargets = masterTpOrders.Count > 0 || fallbackTp > 0;
                    bool hasMasterStops = masterSlOrders.Count > 0 || fallbackSl > 0;

                    // ── CASO 3A: Master possui AMBOS SL e TP (Suporte a ATM Multi-Target) ──────────
                    if (hasMasterTargets && hasMasterStops)
                    {
                        // Se a Slave possui mais alvos que a Master (porque a Master já atingiu e encerrou um ou mais alvos parciais, ex: Alvo 1),
                        // cancela APENAS os alvos concluídos na Slave e mantém os alvos restantes (TP2, TP3) e stops 100% intocados no book!
                        if (masterTpOrders.Count > 0 && slaveTpOrders.Count > masterTpOrders.Count)
                        {
                            int surplusTp = slaveTpOrders.Count - masterTpOrders.Count;
                            var completedTps = slaveTpOrders.Take(surplusTp).ToList();
                            var remainingTps = slaveTpOrders.Skip(surplusTp).ToList();

                            var toCancel = new List<Order>();
                            toCancel.AddRange(completedTps);

                            // Se a Slave tinha stops individuais por alvo, cancela também os stops dos alvos já concluídos
                            if (slaveSlOrders.Count > masterSlOrders.Count)
                            {
                                int surplusSl = slaveSlOrders.Count - masterSlOrders.Count;
                                toCancel.AddRange(slaveSlOrders.Take(surplusSl));
                                slaveSlOrders = slaveSlOrders.Skip(surplusSl).ToList();
                            }

                            if (toCancel.Count > 0)
                            {
                                Application.Current?.Dispatcher?.Invoke(() =>
                                {
                                    try
                                    {
                                        SafeCancelOrders(slaveAcc, toCancel.Distinct().ToArray());
                                        Log($"⚡⚡ [COPY RECONCILE PARTIAL]: {toCancel.Count} ordem(ns) de alvo(s) concluído(s) cancelada(s) na Slave {slaveAcc.Name}. Alvos restantes preservados no book.");
                                    }
                                    catch (Exception canEx)
                                    {
                                        Log($"[ERRO AO CANCELAR ALVOS CONCLUÍDOS SLAVE]: {canEx.Message}");
                                    }
                                });
                            }

                            slaveTpOrders = remainingTps;
                        }

                        // 1. VERIFICA SE JÁ EXISTEM ORDENS COMPATÍVEIS NA SLAVE:
                        // Se a Slave já possui exatamente a mesma quantidade de alvos e pelo menos 1 stop,
                        // NUNCA cancela as ordens! Modifica SOMENTE o que mudou via slaveAcc.Change().
                        // Se o trader moveu apenas o Stop na Master, apenas o Stop da Slave é alterado.
                        // O Take Profit permanece 100% intocado no book sem cancelar nem reabrir!
                        bool canModifyInPlace = masterTpOrders.Count > 0 && slaveTpOrders.Count == masterTpOrders.Count && slaveSlOrders.Count > 0;

                        if (canModifyInPlace)
                        {
                            var toChange = new List<Order>();

                            // Verifica e ajusta alvos (TPs)
                            for (int i = 0; i < masterTpOrders.Count; i++)
                            {
                                var mTp = masterTpOrders[i];
                                var sTp = slaveTpOrders[i];

                                double tpOffset = mTp.LimitPrice - masterPos.AveragePrice;
                                double expectedSlaveTp = Math.Round((slavePos.AveragePrice + tpOffset) / slaveTick) * slaveTick;
                                int expectedQty = masterTpOrders.Count == 1
                                    ? slaveQty
                                    : Math.Min(slaveQty, ClampLotSizeForAccount(slaveAcc.Name, Math.Max(1, (int)Math.Round(mTp.Quantity * rule.LotMultiplier))));

                                bool priceDiff = Math.Abs(sTp.LimitPrice - expectedSlaveTp) >= (slaveTick / 2.0);
                                bool qtyDiff = sTp.Quantity != expectedQty;

                                if (priceDiff || qtyDiff)
                                {
                                    if (priceDiff) sTp.LimitPriceChanged = expectedSlaveTp;
                                    if (qtyDiff) sTp.QuantityChanged = expectedQty;
                                    toChange.Add(sTp);
                                }
                                _masterToSlaveOrderIdMap[$"{mTp.OrderId}_{slaveAcc.Name}"] = sTp.OrderId;
                            }

                            // Verifica e ajusta Stops (SLs)
                            if (masterSlOrders.Count == 1 && slaveSlOrders.Count > 0)
                            {
                                // Master tem 1 Stop consolidado (ex: 2 contratos no mesmo preço)
                                var mSl = masterSlOrders[0];
                                double slOffset = mSl.StopPrice - masterPos.AveragePrice;
                                double expectedSlaveSl = Math.Round((slavePos.AveragePrice + slOffset) / slaveTick) * slaveTick;

                                foreach (var sSl in slaveSlOrders)
                                {
                                    bool priceDiff = Math.Abs(sSl.StopPrice - expectedSlaveSl) >= (slaveTick / 2.0);
                                    bool qtyDiff = slaveSlOrders.Count == 1 && sSl.Quantity != slaveQty;
                                    if (priceDiff || qtyDiff)
                                    {
                                        if (priceDiff) sSl.StopPriceChanged = expectedSlaveSl;
                                        if (qtyDiff) sSl.QuantityChanged = slaveQty;
                                        toChange.Add(sSl);
                                    }
                                }
                                _masterToSlaveOrderIdMap[$"{mSl.OrderId}_{slaveAcc.Name}"] = slaveSlOrders[0].OrderId;
                            }
                            else if (masterSlOrders.Count > 1)
                            {
                                for (int i = 0; i < Math.Min(masterSlOrders.Count, slaveSlOrders.Count); i++)
                                {
                                    var mSl = masterSlOrders[i];
                                    var sSl = slaveSlOrders[i];

                                    double slOffset = mSl.StopPrice - masterPos.AveragePrice;
                                    double expectedSlaveSl = Math.Round((slavePos.AveragePrice + slOffset) / slaveTick) * slaveTick;
                                    int expectedQty = Math.Min(slaveQty, ClampLotSizeForAccount(slaveAcc.Name, Math.Max(1, (int)Math.Round(mSl.Quantity * rule.LotMultiplier))));

                                    bool priceDiff = Math.Abs(sSl.StopPrice - expectedSlaveSl) >= (slaveTick / 2.0);
                                    bool qtyDiff = sSl.Quantity != expectedQty;

                                    if (priceDiff || qtyDiff)
                                    {
                                        if (priceDiff) sSl.StopPriceChanged = expectedSlaveSl;
                                        if (qtyDiff) sSl.QuantityChanged = expectedQty;
                                        toChange.Add(sSl);
                                    }
                                    _masterToSlaveOrderIdMap[$"{mSl.OrderId}_{slaveAcc.Name}"] = sSl.OrderId;
                                }
                            }

                            if (toChange.Count > 0)
                            {
                                Application.Current?.Dispatcher?.Invoke(() =>
                                {
                                    try
                                    {
                                        SafeChangeOrders(slaveAcc, toChange.ToArray());
                                        Log($"⚡⚡ [COPY RECONCILE MOVE]: {toChange.Count} bracket(s) ajustado(s) via Change na Slave {slaveAcc.Name} (Take Profits intocados)");
                                    }
                                    catch (Exception chEx)
                                    {
                                        Log($"[ERRO AO MODIFICAR BRACKETS SLAVE]: {chEx.Message}");
                                    }
                                });
                            }
                            return; // ✅ Brackets preservados e atualizados sem cancelamento!
                        }
                        else
                        {
                            int targetCount = Math.Min(masterTpOrders.Count > 0 ? masterTpOrders.Count : 1, slaveQty);

                            // 🔒 Cooldown de submissão de novos brackets: só aplica se a Slave já possui todos os alvos esperados
                            string bracketSubmitKey = $"{slaveAcc.Name}_{slaveInst.FullName}";
                            if (slaveTpOrders.Count >= targetCount && _lastBracketSubmissionTime.TryGetValue(bracketSubmitKey, out DateTime lastSubTime))
                            {
                                if ((DateTime.UtcNow - lastSubTime).TotalSeconds < 1.0)
                                {
                                    return; // Aguarda 1.0s para a corretora processar a submissão anterior
                                }
                            }
                            _lastBracketSubmissionTime[bracketSubmitKey] = DateTime.UtcNow;

                            // 2. A Slave NÃO possui a estrutura correta de alvos (primeira criação ou novos alvos parciais adicionados)
                            // Submissão incremental atômica: se alvos parciais já existem, preserva-os e anexa os novos sem cancelar o book!
                            Application.Current?.Dispatcher?.Invoke(() =>
                            {
                                try
                                {
                                    TimeInForce effectiveTif = masterTpOrders.Count > 0 
                                        ? masterTpOrders[0].TimeInForce 
                                        : (masterSlOrders.Count > 0 ? masterSlOrders[0].TimeInForce : TimeInForce.Day);

                                    double defaultMasterSlPrice = masterSlOrders.Count > 0 ? masterSlOrders[0].StopPrice : fallbackSl;
                                    var newOrders = new List<Order>();

                                    int startIndex = 0;
                                    if (slaveTpOrders.Count > 0 && slaveTpOrders.Count < targetCount)
                                    {
                                        // Preserva alvos existentes e anexa apenas os alvos 2, 3, 4 sem cancelamento nem choque de book
                                        startIndex = slaveTpOrders.Count;
                                    }
                                    else if (slaveTpOrders.Count == 0)
                                    {
                                        startIndex = 0;
                                    }
                                    else
                                    {
                                        // A Slave já possui alvos suficientes (ou excedentes) no book.
                                        // NUNCA limpa ordens de proteção em lote! Cancela apenas alvos que porventura excedam a meta.
                                        if (slaveTpOrders.Count > targetCount)
                                        {
                                            var excessTps = slaveTpOrders.Skip(targetCount).ToList();
                                            SafeCancelOrders(slaveAcc, excessTps.ToArray());
                                        }
                                        startIndex = targetCount; // Não cria novas ordens
                                    }

                                    // Contratos já alocados para alvos já ativos no book
                                    int alreadyAllocatedQty = 0;
                                    for (int k = 0; k < startIndex; k++)
                                    {
                                        if (k < slaveTpOrders.Count) alreadyAllocatedQty += slaveTpOrders[k].Quantity;
                                    }
                                    int remainingSlaveQty = Math.Max(0, slaveQty - alreadyAllocatedQty);

                                    for (int i = startIndex; i < targetCount; i++)
                                    {
                                        if (remainingSlaveQty <= 0) break;

                                        double targetSlaveTp = 0;
                                        int targetQty = 1;
                                        Order mTp = (i < masterTpOrders.Count) ? masterTpOrders[i] : null;

                                        if (mTp != null)
                                        {
                                            double tpOffset = mTp.LimitPrice - masterPos.AveragePrice;
                                            targetSlaveTp = Math.Round((slavePos.AveragePrice + tpOffset) / slaveTick) * slaveTick;

                                            if (i == targetCount - 1)
                                            {
                                                targetQty = Math.Max(1, remainingSlaveQty);
                                            }
                                            else
                                            {
                                                targetQty = Math.Max(1, (int)Math.Round(mTp.Quantity * rule.LotMultiplier));
                                                targetQty = Math.Min(targetQty, remainingSlaveQty);
                                            }
                                        }
                                        else if (fallbackTp > 0)
                                        {
                                            double tpOffset = fallbackTp - masterPos.AveragePrice;
                                            targetSlaveTp = Math.Round((slavePos.AveragePrice + tpOffset) / slaveTick) * slaveTick;
                                            targetQty = remainingSlaveQty;
                                        }

                                        remainingSlaveQty -= targetQty;

                                        double targetSlaveSl = 0;
                                        double mSlPrice = (i < masterSlOrders.Count) ? masterSlOrders[i].StopPrice : defaultMasterSlPrice;
                                        if (mSlPrice > 0)
                                        {
                                            double slOffset = mSlPrice - masterPos.AveragePrice;
                                            targetSlaveSl = Math.Round((slavePos.AveragePrice + slOffset) / slaveTick) * slaveTick;
                                        }

                                        if (targetSlaveTp > 0 && targetQty > 0)
                                        {
                                            string ocoId = $"OCO_{slaveAcc.Name}_{slaveInst.FullName}_{i}_{DateTime.UtcNow.Ticks}";

                                            Order newTp = CreateStealthOrder(slaveAcc, slaveInst, exitAction, OrderType.Limit, OrderEntry.Manual, effectiveTif, targetQty, targetSlaveTp, 0, ocoId, $"Axion_TP{i + 1}");
                                            RegisterInternalOrder(newTp.OrderId);
                                            RegisterCopyOrder(newTp.OrderId);
                                            newOrders.Add(newTp);
                                            if (mTp != null)
                                            {
                                                _masterToSlaveOrderIdMap[$"{mTp.OrderId}_{slaveAcc.Name}"] = newTp.OrderId;
                                            }

                                            if (targetSlaveSl > 0)
                                            {
                                                Order newSl = CreateStealthOrder(slaveAcc, slaveInst, exitAction, OrderType.StopMarket, OrderEntry.Manual, effectiveTif, targetQty, 0, targetSlaveSl, ocoId, $"Axion_SL{i + 1}");
                                                RegisterInternalOrder(newSl.OrderId);
                                                RegisterCopyOrder(newSl.OrderId);
                                                newOrders.Add(newSl);
                                                if (i < masterSlOrders.Count)
                                                {
                                                    _masterToSlaveOrderIdMap[$"{masterSlOrders[i].OrderId}_{slaveAcc.Name}"] = newSl.OrderId;
                                                }
                                            }
                                        }
                                    }

                                    if (newOrders.Count > 0)
                                    {
                                        StealthSubmit(slaveAcc, newOrders.ToArray());
                                        Log($"⚡⚡ [COPY RECONCILE MULTI-TARGET]: {newOrders.Count / 2} novo(s) par(es) OCO submetido(s) na Slave {slaveAcc.Name} (Alvos Totais: {targetCount}, Contratos: {slaveQty}x, TIF: {effectiveTif}, Master: {masterAcc.Name})");
                                    }
                                }
                                catch (Exception submitEx)
                                {
                                    Log($"[ERRO AO CRIAR PAR OCO NA SLAVE]: {submitEx.Message}");
                                }
                            });
                            return;
                        }
                    }
                    // ── CASO 3B: Master possui APENAS Stop Loss ───────────────────────
                    else if (hasMasterStops && !hasMasterTargets)
                    {
                        double targetSlaveSl = 0;
                        double mSlPrice = masterSlOrders.Count > 0 ? masterSlOrders[0].StopPrice : fallbackSl;
                        if (mSlPrice > 0)
                        {
                            double slOffset = mSlPrice - masterPos.AveragePrice;
                            targetSlaveSl = Math.Round((slavePos.AveragePrice + slOffset) / slaveTick) * slaveTick;
                        }

                        if (targetSlaveSl > 0)
                        {
                            Application.Current?.Dispatcher?.Invoke(() =>
                            {
                                try
                                {
                                    if (slaveTpOrders.Count > 0)
                                    {
                                        SafeCancelOrders(slaveAcc, slaveTpOrders.ToArray());
                                    }

                                    if (slaveSlOrders.Count > 0)
                                    {
                                        var toChange = new List<Order>();
                                        foreach (var sSl in slaveSlOrders)
                                        {
                                            if (Math.Abs(sSl.StopPrice - targetSlaveSl) >= (slaveTick / 2.0))
                                            {
                                                sSl.StopPriceChanged = targetSlaveSl;
                                                toChange.Add(sSl);
                                            }
                                        }
                                        if (toChange.Count > 0)
                                        {
                                            SafeChangeOrders(slaveAcc, toChange.ToArray());
                                            Log($"⚡⚡ [COPY RECONCILE SL MOVE]: Stop Loss ajustado para {targetSlaveSl:F2} na Slave {slaveAcc.Name}");
                                        }
                                    }
                                    else
                                    {
                                        TimeInForce slTif = masterSlOrders.Count > 0 ? masterSlOrders[0].TimeInForce : TimeInForce.Day;
                                        string ocoId = $"OCO_SL_{slaveAcc.Name}_{slaveInst.FullName}_{DateTime.UtcNow.Ticks}";
                                        Order newSl = CreateStealthOrder(slaveAcc, slaveInst, exitAction, OrderType.StopMarket, OrderEntry.Manual, slTif, slaveQty, 0, targetSlaveSl, ocoId, "Axion_SL");
                                        RegisterInternalOrder(newSl.OrderId);
                                        RegisterCopyOrder(newSl.OrderId);
                                        StealthSubmit(slaveAcc, newSl);
                                        Log($"⚡⚡ [COPY RECONCILE SL]: Stop Loss {targetSlaveSl:F2} submetido na Slave {slaveAcc.Name} (TIF: {slTif})");
                                    }
                                }
                                catch (Exception slEx)
                                {
                                    Log($"[ERRO AO RECONCILIAR SL NA SLAVE]: {slEx.Message}");
                                }
                            });
                        }
                    }
                    // ── CASO 3C: Master possui APENAS Take Profit ─────────────────────
                    else if (!hasMasterStops && hasMasterTargets)
                    {
                        Application.Current?.Dispatcher?.Invoke(() =>
                        {
                            try
                            {
                                if (slaveSlOrders.Count > 0)
                                {
                                    SafeCancelOrders(slaveAcc, slaveSlOrders.ToArray());
                                }

                                if (masterTpOrders.Count > 0 && slaveTpOrders.Count == masterTpOrders.Count)
                                {
                                    var toChange = new List<Order>();
                                    for (int i = 0; i < masterTpOrders.Count; i++)
                                    {
                                        var mTp = masterTpOrders[i];
                                        var sTp = slaveTpOrders[i];
                                        double tpOffset = mTp.LimitPrice - masterPos.AveragePrice;
                                        double expectedSlaveTp = Math.Round((slavePos.AveragePrice + tpOffset) / slaveTick) * slaveTick;
                                        int expectedQty = Math.Max(1, (int)Math.Round(mTp.Quantity * rule.LotMultiplier));

                                        bool priceDiff = Math.Abs(sTp.LimitPrice - expectedSlaveTp) >= (slaveTick / 2.0);
                                        bool qtyDiff = sTp.Quantity != expectedQty;
                                        if (priceDiff || qtyDiff)
                                        {
                                            if (priceDiff) sTp.LimitPriceChanged = expectedSlaveTp;
                                            if (qtyDiff) sTp.QuantityChanged = expectedQty;
                                            toChange.Add(sTp);
                                        }
                                    }
                                    if (toChange.Count > 0)
                                    {
                                        SafeChangeOrders(slaveAcc, toChange.ToArray());
                                        Log($"⚡⚡ [COPY RECONCILE TP MOVE]: Take Profit(s) ajustado(s) na Slave {slaveAcc.Name}");
                                    }
                                }
                                else
                                {
                                    if (slaveTpOrders.Count > 0)
                                    {
                                        SafeCancelOrders(slaveAcc, slaveTpOrders.ToArray());
                                    }
                                    var newOrders = new List<Order>();
                                    int remainingSlaveQty = slaveQty;
                                    int targetCount = Math.Min(masterTpOrders.Count > 0 ? masterTpOrders.Count : 1, slaveQty);
                                    TimeInForce tpTif = masterTpOrders.Count > 0 ? masterTpOrders[0].TimeInForce : TimeInForce.Day;

                                    for (int i = 0; i < targetCount; i++)
                                    {
                                        if (remainingSlaveQty <= 0) break;

                                        double targetSlaveTp = 0;
                                        int targetQty = 1;
                                        Order mTp = (i < masterTpOrders.Count) ? masterTpOrders[i] : null;
                                        if (mTp != null)
                                        {
                                            double tpOffset = mTp.LimitPrice - masterPos.AveragePrice;
                                            targetSlaveTp = Math.Round((slavePos.AveragePrice + tpOffset) / slaveTick) * slaveTick;
                                            if (i == targetCount - 1) targetQty = Math.Max(1, remainingSlaveQty);
                                            else
                                            {
                                                targetQty = Math.Max(1, (int)Math.Round(mTp.Quantity * rule.LotMultiplier));
                                                targetQty = Math.Min(targetQty, remainingSlaveQty);
                                            }
                                        }
                                        else if (fallbackTp > 0)
                                        {
                                            double tpOffset = fallbackTp - masterPos.AveragePrice;
                                            targetSlaveTp = Math.Round((slavePos.AveragePrice + tpOffset) / slaveTick) * slaveTick;
                                            targetQty = remainingSlaveQty;
                                        }

                                        remainingSlaveQty -= targetQty;

                                        if (targetSlaveTp > 0 && targetQty > 0)
                                        {
                                            string ocoId = $"OCO_TP_{slaveAcc.Name}_{slaveInst.FullName}_{i}_{DateTime.UtcNow.Ticks}";
                                            Order newTp = CreateStealthOrder(slaveAcc, slaveInst, exitAction, OrderType.Limit, OrderEntry.Manual, tpTif, targetQty, targetSlaveTp, 0, ocoId, $"Axion_TP{i + 1}");
                                            RegisterInternalOrder(newTp.OrderId);
                                            RegisterCopyOrder(newTp.OrderId);
                                            newOrders.Add(newTp);
                                        }
                                    }
                                    if (newOrders.Count > 0)
                                    {
                                        StealthSubmit(slaveAcc, newOrders.ToArray());
                                        Log($"⚡⚡ [COPY RECONCILE TP]: {targetCount} Take Profit(s) submetido(s) na Slave {slaveAcc.Name}");
                                    }
                                }
                            }
                            catch (Exception tpEx)
                            {
                                Log($"[ERRO AO RECONCILIAR TP NA SLAVE]: {tpEx.Message}");
                            }
                        });
                    }
                    // ── CASO 3D: Master NÃO possui metas ativas ───────────────────────
                    else
                    {
                        // 🔒 PRESERVAÇÃO DE GESTÃO E SEGURANÇA:
                        // Se a Slave já possui ordens de Stop Loss / Take Profit ativas protegendo sua posição aberta,
                        // NUNCA cancela sumariamente essas proteções para não deixar a conta Slave exposta a risco descontrolado!
                    }
                }
                catch (Exception ex)
                {
                    Log($"[ERRO RECONCILE SLAVE BRACKETS]: {ex.Message}");
                }
            }
        }

        /// <summary>
        /// Guardião de 5 segundos:
        /// 1. Se após encerramento ficarem ordens pendentes sem operação a mercado aberta por >= 5 segundos, cancela as ordens pendentes.
        /// 2. Se ficar somente uma operação a mercado aberta sozinha (sem Stop Loss e/ou sem Take Profit) por >= 5 segundos, encerra a operação a mercado.
        /// </summary>
        public static void VerificarPosicoesEOrdensOrfas5Segundos()
        {
            try
            {
                List<Account> allAccounts = null;
                lock (Account.All)
                {
                    allAccounts = Account.All.Where(a => a != null && IsAccountReadyForTrading(a)).ToList();
                }
                if (allAccounts == null || allAccounts.Count == 0) return;

                DateTime now = DateTime.UtcNow;

                foreach (var acc in allAccounts)
                {
                    try
                    {
                        // 🛡️ REGRA INVIOLÁVEL: O Guardião de 5 segundos monitora EXCLUSIVAMENTE posições A MERCADO abertas (MarketPosition != Flat).
                        // Ordens pendentes de qualquer natureza (Limit, Stop, MIT) aguardam livremente no livro e NUNCA devem ser encerradas ou canceladas por ausência de SL/TP.
                        var instruments = new HashSet<Instrument>();
                        if (acc.Positions != null)
                        {
                            lock (acc.Positions)
                            {
                                foreach (Position p in acc.Positions)
                                {
                                    if (p != null && p.Instrument != null && p.MarketPosition != MarketPosition.Flat && Math.Abs(p.Quantity) > 0)
                                    {
                                        instruments.Add(p.Instrument);
                                    }
                                }
                            }
                        }

                        if (instruments.Count == 0)
                        {
                            // Nenhuma posição a mercado aberta nesta conta: ordens pendentes no book aguardam livremente
                            continue;
                        }

                        // 🧹 Limpeza de chaves de proteção para posições que já foram zeradas
                        foreach (var key in _unprotectedPositionSince.Keys)
                        {
                            if (key.StartsWith(acc.Name + "_", StringComparison.OrdinalIgnoreCase))
                            {
                                bool stillOpen = false;
                                if (acc.Positions != null)
                                {
                                    lock (acc.Positions)
                                    {
                                        stillOpen = acc.Positions.Any(p => p != null && p.MarketPosition != MarketPosition.Flat && Math.Abs(p.Quantity) > 0 &&
                                            $"{acc.Name}_{p.Instrument?.FullName}".Equals(key, StringComparison.OrdinalIgnoreCase));
                                    }
                                }
                                if (!stillOpen)
                                {
                                    _unprotectedPositionSince.TryRemove(key, out _);
                                }
                            }
                        }

                        foreach (var inst in instruments)
                        {
                            if (inst == null) continue;
                            string stateKey = $"{acc.Name}_{inst.FullName}";

                            Position pos = null;
                            if (acc.Positions != null)
                            {
                                lock (acc.Positions)
                                {
                                    pos = acc.Positions.FirstOrDefault(p => p != null && (
                                        p.Instrument == inst ||
                                        (p.Instrument != null && string.Equals(p.Instrument.FullName, inst.FullName, StringComparison.OrdinalIgnoreCase))
                                    ));
                                }
                            }

                            bool isPosFlat = (pos == null || pos.MarketPosition == MarketPosition.Flat || Math.Abs(pos.Quantity) == 0);

                            List<Order> activeOrdersOnInst = new List<Order>();
                            if (acc.Orders != null)
                            {
                                lock (acc.Orders)
                                {
                                    activeOrdersOnInst = acc.Orders.Where(o => o != null &&
                                        (o.Instrument == inst || (o.Instrument != null && string.Equals(o.Instrument.FullName, inst.FullName, StringComparison.OrdinalIgnoreCase))) &&
                                        (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted || o.OrderState == OrderState.TriggerPending || o.OrderState == OrderState.Submitted || o.OrderState == OrderState.Initialized) &&
                                        o.OrderType != OrderType.Market &&
                                        !(!string.IsNullOrEmpty(o.Name) && (o.Name == "Close" || o.Name == "Exit" || o.Name == "Zerar" || o.Name == "Copy_Close" || o.Name == "RiskClose" || o.Name == "RiskLotCap"))
                                    ).ToList();
                                }
                            }

                            if (isPosFlat)
                            {
                                // 🛡️ CONTA FLAT: Ordens pendentes de entrada (Limit, Stop, MIT) aguardam livremente no livro sem cancelamento de 5s.
                                // Elas NÃO são replicadas para as Slaves enquanto pendentes (somente após entrarem a mercado via fill).
                                _unprotectedPositionSince.TryRemove(stateKey, out _);
                                _orphanOrdersSince.TryRemove(stateKey, out _);
                                continue;
                            }
                            else
                            {
                                _orphanOrdersSince.TryRemove(stateKey, out _);

                                if (IsAccountCurrentlyFlattening(acc.Name, inst.FullName))
                                {
                                    continue;
                                }

                                bool isLong = pos.MarketPosition == MarketPosition.Long;
                                var exitOrders = activeOrdersOnInst.Where(o =>
                                    isLong ? (o.OrderAction == OrderAction.Sell || o.OrderAction == OrderAction.SellShort)
                                           : (o.OrderAction == OrderAction.Buy || o.OrderAction == OrderAction.BuyToCover)
                                ).ToList();

                                bool hasSl = exitOrders.Any(o => (o.OrderType == OrderType.StopMarket || o.OrderType == OrderType.StopLimit) || o.StopPrice > 0 || (!string.IsNullOrEmpty(o.Name) && (o.Name.IndexOf("Stop", StringComparison.OrdinalIgnoreCase) >= 0 || o.Name.IndexOf("SL", StringComparison.OrdinalIgnoreCase) >= 0)));
                                bool hasTp = exitOrders.Any(o => o.OrderType == OrderType.Limit || o.LimitPrice > 0 || (!string.IsNullOrEmpty(o.Name) && (o.Name.IndexOf("Target", StringComparison.OrdinalIgnoreCase) >= 0 || o.Name.IndexOf("Profit", StringComparison.OrdinalIgnoreCase) >= 0 || o.Name.IndexOf("TP", StringComparison.OrdinalIgnoreCase) >= 0)));

                                // 🛡️ REGRA INSTITUCIONAL MANDATÓRIA: Toda posição requer Stop Loss E Take Profit
                                bool isFullyProtected = hasSl && hasTp;

                                if (!isFullyProtected)
                                {
                                    // Se o trade ou bracket acabou de ser enviado nos últimos 5 segundos, aguarda a corretora confirmar no book
                                    if (_lastReconcileAdjustmentTime.TryGetValue(stateKey, out DateTime lastEntry) && (now - lastEntry).TotalSeconds < 5.0)
                                    {
                                        continue;
                                    }
                                    if (_lastBracketSubmissionTime.TryGetValue(stateKey, out DateTime lastSub) && (now - lastSub).TotalSeconds < 5.0)
                                    {
                                        continue;
                                    }

                                    DateTime unprotSince = _unprotectedPositionSince.GetOrAdd(stateKey, _ => now);
                                    if ((now - unprotSince).TotalSeconds >= 5.0)
                                    {
                                        _unprotectedPositionSince.TryRemove(stateKey, out _);
                                        CancelarOrdensPendentes(acc, inst);
                                        OrderAction closeAct = isLong ? OrderAction.Sell : OrderAction.Buy;
                                        int closeQ = Math.Abs(pos.Quantity);
                                        if (SafeSubmitCloseOrder(acc, pos.Instrument ?? inst, closeAct, closeQ, "Close"))
                                        {
                                            string missingDesc = (!hasSl && !hasTp) ? "sem Stop Loss e sem Take Profit" : (!hasSl ? "sem Stop Loss" : "sem Take Profit");
                                            string reasonMsg = $"Posição a mercado ({pos.MarketPosition} {closeQ}x em {inst.FullName}) aberta desprotegida ({missingDesc}) encerrada após 5s por segurança pelo Guardião na conta {acc.Name}.";
                                            Log($"🛡️ [GUARDIÃO 5s - PROTEÇÃO OBRIGATÓRIA]: {reasonMsg}");
                                            EnqueueRejectionEvent(acc.Name, acc.Name, inst.FullName, isLong ? "BUY" : "SELL", closeQ, pos.AveragePrice, reasonMsg);
                                        }
                                    }
                                }
                                else
                                {
                                    _unprotectedPositionSince.TryRemove(stateKey, out _);
                                }
                            }
                        }
                    }
                    catch (Exception accGuardEx)
                    {
                        Log($"[ERRO GUARDIAO 5S CONTA {acc?.Name}]: {accGuardEx.Message}");
                    }
                }
            }
            catch (Exception ex)
            {
                Log($"[ERRO GUARDIAO 5S]: {ex.Message}");
            }
        }

        public static void AutoReconcileCopyPositions(string specificMaster = null)
        {
            try
            {
                if (string.IsNullOrEmpty(specificMaster))
                {
                    VerificarPosicoesEOrdensOrfas5Segundos();
                }

                var activeRules = _copyRules.Values.Where(r => r.IsActive).ToList();
                if (!string.IsNullOrEmpty(specificMaster))
                {
                    activeRules = activeRules.Where(r => string.Equals(r.MasterAccountName, specificMaster, StringComparison.OrdinalIgnoreCase)).ToList();
                }

                if (activeRules.Count == 0) return;

                foreach (var rule in activeRules)
                {
                    try
                    {
                        if (string.Equals(rule.SlaveAccountName, rule.MasterAccountName, StringComparison.OrdinalIgnoreCase))
                            continue;

                        Account masterAcc = null;
                        Account slaveAcc = null;
                        lock (Account.All)
                        {
                            masterAcc = Account.All.FirstOrDefault(a => a != null && string.Equals(a.Name, rule.MasterAccountName, StringComparison.OrdinalIgnoreCase));
                            slaveAcc = Account.All.FirstOrDefault(a => a != null && string.Equals(a.Name, rule.SlaveAccountName, StringComparison.OrdinalIgnoreCase));
                        }

                        if (masterAcc == null || slaveAcc == null || !IsAccountReadyForTrading(slaveAcc))
                            continue;

                        if (_accountRiskStates.TryGetValue(slaveAcc.Name, out AccountRiskInfo sRisk) && sRisk.IsBlocked)
                            continue;

                        EnsureAccountSubscribed(masterAcc);
                        EnsureAccountSubscribed(slaveAcc);

                        var instruments = new HashSet<Instrument>();
                        if (masterAcc.Positions != null)
                        {
                            lock (masterAcc.Positions)
                            {
                                foreach (Position p in masterAcc.Positions)
                                {
                                    if (p != null && p.Instrument != null && p.MarketPosition != MarketPosition.Flat && Math.Abs(p.Quantity) > 0)
                                        instruments.Add(p.Instrument);
                                }
                            }
                        }

                        // Inclui SOMENTE ativos que foram comprovadamente copiados desta Master para esta Slave
                        string pairPrefix = $"{masterAcc.Name}_{slaveAcc.Name}_";
                        foreach (var kvp in _activeCopiedPositions)
                        {
                            if (kvp.Key.StartsWith(pairPrefix, StringComparison.OrdinalIgnoreCase))
                            {
                                string normInst = kvp.Key.Substring(pairPrefix.Length);
                                if (slaveAcc.Positions != null)
                                {
                                    lock (slaveAcc.Positions)
                                    {
                                        var sp = slaveAcc.Positions.FirstOrDefault(p => p?.Instrument != null && string.Equals(GetNormalizedInstrumentKey(p.Instrument.FullName), normInst, StringComparison.OrdinalIgnoreCase));
                                        if (sp?.Instrument != null) instruments.Add(sp.Instrument);
                                    }
                                }
                            }
                        }

                        foreach (var inst in instruments)
                        {
                            if (!IsSymbolAllowed(inst, rule)) continue;

                            Instrument slaveInst = ResolveSlaveInstrument(inst, rule) ?? inst;
                            ReconcileSlaveBrackets(masterAcc, slaveAcc, inst, slaveInst, rule);
                        }
                    }
                    catch (Exception ruleEx)
                    {
                        Log($"[ERRO AUTO-RECONCILIAÇÃO REGRA]: {ruleEx.Message}");
                    }
                }
            }
            catch (Exception ex)
            {
                Log($"[ERRO GERAL AUTO-RECONCILIAÇÃO]: {ex.Message}");
            }
        }

        #endregion

        private static void ChecarDisparoRelatorios()
        {
            // Checar Reset de Sessão Automático baseado no TradingDay da Bolsa (NUNCA às 00:00 civil!)
            DateTime tradingDay = ObterTradingDayAtual();
            if (tradingDay != DateTime.MinValue)
            {
                string sessionKey = tradingDay.ToString("yyyy-MM-dd");
                if (!string.IsNullOrEmpty(AxionGatewayState.UltimaDataSessao) && AxionGatewayState.UltimaDataSessao != sessionKey)
                {
                    Log($"🔄 [NOVA SESSÃO DE MERCADO]: Transição de sessão detectada ({AxionGatewayState.UltimaDataSessao} -> {sessionKey}).");
                    AxionGatewayState.UltimaDataSessao = sessionKey;
                    AxionGatewayState.Save();
                    ResetarSessaoRisco(manual: false, motivo: $"Transição para TradingDay {sessionKey}");
                }
                else if (string.IsNullOrEmpty(AxionGatewayState.UltimaDataSessao))
                {
                    AxionGatewayState.UltimaDataSessao = sessionKey;
                    AxionGatewayState.Save();
                }
            }

            if (!AxionGatewayState.EnviarRelatorioPeriodico) return;

            DateTime agora = DateTime.Now;
            string horaAtual = agora.ToString("HH:mm");

            // 1. Checagem por Horários Fixos (ex: 09:00 e 18:00)
            if (horaAtual == AxionGatewayState.HorarioRelatorio1 || horaAtual == AxionGatewayState.HorarioRelatorio2)
            {
                if (_lastReportSentHour != horaAtual)
                {
                    _lastReportSentHour = horaAtual;
                    _lastReportSentTime = agora;
                    EnviarRelatorioGeralContas(motivo: $"Horário Agendado ({horaAtual})");
                    return;
                }
            }
            else
            {
                _lastReportSentHour = "";
            }

            // 2. Checagem por Intervalo de Tempo (15m, 30m, 1h, 2h, etc.)
            if (AxionGatewayState.IntervaloRelatorioMinutos > 0)
            {
                if (_lastReportSentTime == DateTime.MinValue)
                {
                    _lastReportSentTime = agora; // Inicializa referência
                }
                else
                {
                    double diffMinutes = (agora - _lastReportSentTime).TotalMinutes;
                    if (diffMinutes >= AxionGatewayState.IntervaloRelatorioMinutos)
                    {
                        _lastReportSentTime = agora;
                        EnviarRelatorioGeralContas(motivo: $"Intervalo de {AxionGatewayState.IntervaloRelatorioMinutos} min");
                    }
                }
            }
        }

        public static void EnviarRelatorioGeralContas(bool manual = false, string motivo = "")
        {
            try
            {
                var contas = GetContasMonitoradas();
                if (contas.Count == 0)
                {
                    Log("Nenhuma conta selecionada para relatório.");
                    return;
                }

                var sb = new StringBuilder();
                sb.AppendLine($"📊 <b>{AxionGatewayState.TituloMensagens} - RELATÓRIO DE CONTAS</b>");
                sb.AppendLine($"📅 <i>{DateTime.Now:dd/MM/yyyy HH:mm:ss}</i> {(string.IsNullOrEmpty(motivo) ? "" : $"[{motivo}]")}\n");

                bool hasAnyPosition = false;

                foreach (var acc in contas)
                {
                    if (acc == null) continue;
                    double cash = 0, realized = 0, unrealized = 0;
                    try { cash = acc.Get(AccountItem.CashValue, Currency.UsDollar); } catch { }
                    try { realized = acc.Get(AccountItem.RealizedProfitLoss, Currency.UsDollar); } catch { }
                    try { unrealized = acc.Get(AccountItem.UnrealizedProfitLoss, Currency.UsDollar); } catch { }
                    double totalPnL = realized + unrealized;

                    var openPositions = acc.Positions.Where(p => p.Quantity != 0).ToList();

                    sb.AppendLine($"<b>🏦 Conta: {acc.Name}</b>");
                    sb.AppendLine($"💰 Saldo: <b>${cash:F2}</b>");
                    sb.AppendLine($"📊 P&L Aberto: <b>{(unrealized >= 0 ? "+" : "")}${unrealized:F2}</b>");
                    sb.AppendLine($"📈 P&L Realizado: <b>{(realized >= 0 ? "+" : "")}${realized:F2}</b>");
                    sb.AppendLine($"🏆 P&L Total: <b>{(totalPnL >= 0 ? "+" : "")}${totalPnL:F2}</b>");

                    if (openPositions.Count > 0)
                    {
                        hasAnyPosition = true;
                        sb.AppendLine($"🎯 Posições Abertas:");
                        foreach (var pos in openPositions)
                        {
                            string dir = pos.Quantity > 0 ? "LONG 🟢" : "SHORT 🔴";
                            sb.AppendLine($" • {pos.Instrument?.FullName}: {Math.Abs(pos.Quantity)} ({dir}) @ {pos.AveragePrice:F2}");
                        }
                    }
                    else
                    {
                        sb.AppendLine($"🎯 Posições: <i>FLAT</i>");
                    }
                    sb.AppendLine();
                }

                SendTelegramMessageAsync(sb.ToString());
                Log($"Relatório de contas enviado com sucesso {(manual ? "[MANUAL]" : "[AUTO]")}.");
            }
            catch (Exception ex)
            {
                Log($"[ERRO RELATÓRIO]: {ex.Message}");
            }
        }

        public static List<Account> GetContasMonitoradas()
        {
            var list = new List<Account>();
            lock (Account.All)
            {
                if (AxionGatewayState.ModoMonitoramento == "Todas")
                {
                    list.AddRange(Account.All);
                }
                else
                {
                    foreach (var name in AxionGatewayState.ContasSelecionadasNomes)
                    {
                        var acc = Account.All.FirstOrDefault(a => string.Equals(a.Name, name, StringComparison.OrdinalIgnoreCase));
                        if (acc != null) list.Add(acc);
                    }
                }
            }
            return list;
        }

        private static bool IsAccountMonitored(string accountName)
        {
            if (string.IsNullOrEmpty(accountName)) return false;
            if (AxionGatewayState.ModoMonitoramento == "Todas") return true;
            return AxionGatewayState.ContasSelecionadasNomes.Any(n => string.Equals(n, accountName, StringComparison.OrdinalIgnoreCase));
        }

        private static DateTime _lastTelegram429Warning = DateTime.MinValue;

        public static async void SendTelegramMessageAsync(string htmlText)
        {
            try
            {
                string token = AxionGatewayState.TelegramBotToken?.Trim();
                string chatId = AxionGatewayState.TelegramChatId?.Trim();
                if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(chatId)) return;

                // Se tomou 429 recentemente do Telegram, aguarda 10 segundos antes de tentar novamente
                if ((DateTime.UtcNow - _lastTelegram429Warning).TotalSeconds < 10) return;

                string url = $"https://api.telegram.org/bot{token}/sendMessage";
                using (var client = new WebClient { Encoding = Encoding.UTF8 })
                {
                    var values = new System.Collections.Specialized.NameValueCollection
                    {
                        { "chat_id", chatId },
                        { "text", htmlText },
                        { "parse_mode", "HTML" }
                    };
                    await client.UploadValuesTaskAsync(url, "POST", values);
                }
            }
            catch (WebException webEx)
            {
                if (webEx.Message != null && webEx.Message.Contains("429"))
                {
                    _lastTelegram429Warning = DateTime.UtcNow;
                    Log("[TELEGRAM 429]: Limite de mensagens por segundo do Telegram atingido. Pausando notificações por 10s.");
                }
                else
                {
                    Log($"[ERRO TELEGRAM ENVIO]: {webEx.Message}");
                }
            }
            catch (Exception ex)
            {
                Log($"[ERRO TELEGRAM ENVIO]: {ex.Message}");
            }
        }

        public static void EnviarTelegramAsync(string htmlText) => SendTelegramMessageAsync(htmlText);

        #endregion

        #region Despachante Unificado de Ações Gateway (HTTP Local e Nuvem Broadcast)

        public static string DispatchGatewayAction(string action, string payloadJson = "")
        {
            try
            {
                string norm = (action ?? "").Trim().ToLowerInvariant();
                if (norm.StartsWith("/")) norm = norm.Substring(1);

                if (norm == "status" || norm == "ping")
                {
                    bool hasActiveConnection = false;
                    lock (Account.All)
                    {
                        foreach (Account acc in Account.All)
                        {
                            if (acc.Connection != null && acc.Connection.Status == ConnectionStatus.Connected)
                            {
                                hasActiveConnection = true;
                                break;
                            }
                        }
                    }
                    string statusStr = hasActiveConnection ? "online" : "disconnected";
                    return $"{{\"status\":\"{statusStr}\",\"isConnected\":{(hasActiveConnection ? "true" : "false")},\"isLicensed\":{(AxionLicenseManager.IsLicensed ? "true" : "false")},\"licenseStatus\":\"{AxionGatewayState.EscapeJson(AxionLicenseManager.StatusMensagem)}\",\"machineId\":\"{AxionGatewayState.EscapeJson(AxionLicenseManager.CurrentMachineId)}\",\"idAssinatura\":\"{AxionGatewayState.EscapeJson(AxionGatewayState.IdAssinatura)}\",\"version\":\"2.0.0\",\"gateway\":\"AxionGatewayV2\"}}";
                }

                if (norm == "accounts" || norm == "contas")
                {
                    return _instance != null ? _instance.GetConnectedAccountsJson() : "{\"accounts\":[]}";
                }

                if (norm == "positions" || norm == "posicoes" || norm == "orders" || norm == "ordens")
                {
                    return _instance != null ? _instance.GetOpenPositionsJson() : "{\"positions\":[]}";
                }

                if (norm == "sinal_local" || norm == "order" || norm == "ordem")
                {
                    if (!AxionLicenseManager.IsLicensed)
                    {
                        return $"{{\"success\":false,\"isLicenseBlocked\":true,\"error\":\"Licença Axion Gateway inativa ou Machine ID não vinculado. Verifique a aba 'Sobre & Licença' no NinjaTrader.\",\"machineId\":\"{AxionGatewayState.EscapeJson(AxionLicenseManager.CurrentMachineId)}\",\"licenseStatus\":\"{AxionGatewayState.EscapeJson(AxionLicenseManager.StatusMensagem)}\"}}";
                    }
                    return _instance != null ? _instance.ExecuteVortexOrder(payloadJson ?? "") : "{\"success\":false,\"error\":\"Gateway não inicializado\"}";
                }

                if (norm == "cancel_order" || norm == "cancel" || norm == "cancelar_ordem" || norm == "cancel_all_orders" || norm == "cancelar_todas")
                {
                    return _instance != null ? _instance.CancelVortexOrder(payloadJson ?? "") : "{\"success\":false,\"error\":\"Gateway não inicializado\"}";
                }

                if (norm == "flatten_all" || norm == "zerar_tudo" || norm == "panic_close")
                {
                    return FlattenAllAccounts();
                }

                if (norm == "reset_session" || norm == "resetar_sessao")
                {
                    ResetarSessaoRisco(manual: true, motivo: "Requisição Broadcast / API");
                    return "{\"success\":true,\"message\":\"Sessão de risco reiniciada com sucesso.\"}";
                }

                if (norm == "sinal_local/levels" || norm == "modify_order" || norm == "modificar")
                {
                    return _instance != null ? _instance.ModifyVortexOrderLevels(payloadJson ?? "") : "{\"success\":false,\"error\":\"Gateway não inicializado\"}";
                }

                if (norm == "sinal_local/status" || norm == "close_position" || norm == "zerar")
                {
                    return _instance != null ? _instance.FlattenVortexAccount(payloadJson ?? "") : "{\"success\":false,\"error\":\"Gateway não inicializado\"}";
                }

                if (norm == "telegram/report")
                {
                    EnviarRelatorioGeralContas(manual: true, motivo: "Disparo via Broadcast / API");
                    return "{\"success\":true,\"message\":\"Relatório enviado ao Telegram com sucesso.\"}";
                }

                if (norm == "copy_rules")
                {
                    if (!string.IsNullOrWhiteSpace(payloadJson) && payloadJson.Length > 5)
                    {
                        UpdateCopyRulesFromJson(payloadJson);
                        NotifyCopyRulesUpdated();
                        NotifyRiskConfigUpdated();
                        return $"{{\"success\":true,\"count\":{_copyRules.Count}}}";
                    }
                    else
                    {
                        var list = _copyRules.Values.ToList();
                        var sb = new StringBuilder();
                        sb.Append("{\"success\":true,\"rules\":[");
                        for (int i = 0; i < list.Count; i++)
                        {
                            if (i > 0) sb.Append(",");
                            var r = list[i];
                            sb.Append("{");
                            sb.Append($"\"id\":\"{r.Id}\",");
                            sb.Append($"\"masterAccount\":\"{r.MasterAccountName}\",");
                            sb.Append($"\"slaveAccount\":\"{r.SlaveAccountName}\",");
                            sb.Append($"\"lotMultiplier\":{r.LotMultiplier.ToString("F2", CultureInfo.InvariantCulture)},");
                            sb.Append($"\"isActive\":{(r.IsActive ? "true" : "false")},");
                            sb.Append($"\"allowedSymbols\":\"{r.AllowedSymbols}\",");
                            sb.Append($"\"executionSymbol\":\"{r.ExecutionSymbol}\",");
                            sb.Append($"\"symbolMapping\":\"{r.SymbolMapping}\",");
                            sb.Append($"\"maxDailyLoss\":{r.MaxDailyLoss.ToString("F2", CultureInfo.InvariantCulture)},");
                            sb.Append($"\"maxDailyTrades\":{r.MaxDailyTrades},");
                            sb.Append($"\"copyAtmStrategy\":{(r.CopyAtmStrategy ? "true" : "false")},");
                            sb.Append($"\"closeSlavesOnMasterClose\":{(r.CloseSlavesOnMasterClose ? "true" : "false")}");
                            sb.Append("}");
                        }
                        sb.Append("]}");
                        return sb.ToString();
                    }
                }

                if (norm == "sync_accounts_risk" || norm == "sync_risk")
                {
                    if (!string.IsNullOrWhiteSpace(payloadJson) && payloadJson.Length > 5)
                    {
                        UpdateAccountRisksFromJson(payloadJson);
                        SaveAccountRisksToDisk();
                        NotifyRiskConfigUpdated();
                        return $"{{\"success\":true,\"message\":\"Configurações de risco atualizadas\",\"count\":{_accountRiskStates.Count}}}";
                    }
                    else
                    {
                        var sb = new StringBuilder();
                        sb.Append("{\"accounts\":[");
                        var list = _accountRiskStates.Values.ToList();
                        for (int i = 0; i < list.Count; i++)
                        {
                            if (i > 0) sb.Append(",");
                            var r = list[i];
                            sb.Append("{");
                            sb.Append($"\"account_name\":\"{r.AccountName}\",");
                            sb.Append($"\"daily_loss_limit\":{r.DailyLossLimitUsd.ToString("F2", CultureInfo.InvariantCulture)},");
                            sb.Append($"\"daily_profit_target\":{r.DailyProfitTargetUsd.ToString("F2", CultureInfo.InvariantCulture)},");
                            sb.Append($"\"is_blocked\":{(r.IsBlocked ? "true" : "false")}");
                            sb.Append("}");
                        }
                        sb.Append("]}");
                        return sb.ToString();
                    }
                }

                if (norm == "master_events")
                {
                    var list = new List<MasterExecutionEvent>();
                    while (_masterEventsQueue.TryDequeue(out var ev) && list.Count < 50)
                    {
                        list.Add(ev);
                    }
                    var sb = new StringBuilder();
                    sb.Append("{\"events\":[");
                    for (int i = 0; i < list.Count; i++)
                    {
                        if (i > 0) sb.Append(",");
                        var ev = list[i];
                        sb.Append("{");
                        sb.Append($"\"eventId\":\"{ev.EventId}\",");
                        sb.Append($"\"eventType\":\"{ev.EventType}\",");
                        sb.Append($"\"accountName\":\"{ev.AccountName}\",");
                        sb.Append($"\"symbol\":\"{ev.Symbol}\",");
                        sb.Append($"\"action\":\"{ev.Action}\",");
                        sb.Append($"\"quantity\":{ev.Quantity},");
                        sb.Append($"\"price\":{ev.Price.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"stopLoss\":{ev.StopLoss.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"takeProfit\":{ev.TakeProfit.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"stopLossPoints\":{ev.StopLossPoints.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"takeProfitPoints\":{ev.TakeProfitPoints.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"orderId\":\"{ev.OrderId}\",");
                        sb.Append($"\"orderName\":\"{ev.OrderName}\",");
                        sb.Append($"\"reportId\":\"{ev.ReportId}\",");
                        sb.Append($"\"timestamp\":\"{ev.Timestamp}\"");
                        sb.Append("}");
                    }
                    sb.Append("]}");
                    return sb.ToString();
                }

                if (norm == "account_performance")
                {
                    string targetAcc = "";
                    string mode = "day";
                    string startDate = "";
                    string endDate = "";
                    string since = "";

                    if (!string.IsNullOrWhiteSpace(payloadJson))
                    {
                        targetAcc = AxionGatewayState.ExtractJsonString(payloadJson, "account") ?? AxionGatewayState.ExtractJsonString(payloadJson, "accountName") ?? "";
                        mode = AxionGatewayState.ExtractJsonString(payloadJson, "mode") ?? "day";
                        startDate = AxionGatewayState.ExtractJsonString(payloadJson, "startDate") ?? "";
                        endDate = AxionGatewayState.ExtractJsonString(payloadJson, "endDate") ?? "";
                        since = AxionGatewayState.ExtractJsonString(payloadJson, "since") ?? "";
                    }

                    return _instance != null ? _instance.GetAccountPerformanceJson(targetAcc, mode, startDate, endDate, since) : "{\"accounts\":[]}";
                }

                return $"{{\"error\":\"Ação desconhecida: {action}\"}}";
            }
            catch (Exception ex)
            {
                string safeErr = (ex.Message ?? "").Replace("\"", "'");
                return $"{{\"error\":\"Falha ao executar ação {action}: {safeErr}\"}}";
            }
        }

        #endregion

        #region Servidor Local HTTP (:8001 / IPC)

        private void StartLocalGateway()
        {
            if (_isRunning) return;
            try
            {
                bool bound = false;
                // Tentativa 1: Escuta em todas as interfaces (http://+:8001/) para suportar VPN / Tailscale / VPS
                try
                {
                    _httpListener = new HttpListener();
                    _httpListener.Prefixes.Add($"http://+:{GatewayPort}/");
                    _httpListener.Start();
                    bound = true;
                    Log($"Servidor Gateway iniciado em todas as interfaces (http://+:{GatewayPort}/)");
                }
                catch
                {
                    try { _httpListener?.Close(); } catch { }
                    _httpListener = null;
                }

                // Tentativa 2: Fallback local estrito em localhost e 127.0.0.1
                if (!bound)
                {
                    _httpListener = new HttpListener();
                    _httpListener.Prefixes.Add($"http://localhost:{GatewayPort}/");
                    _httpListener.Prefixes.Add($"http://127.0.0.1:{GatewayPort}/");
                    _httpListener.Start();
                    Log($"Servidor Local iniciado em http://localhost:{GatewayPort}/");
                }

                _isRunning = true;
                _httpListener.BeginGetContext(OnHttpRequestReceived, null);
            }
            catch (Exception ex)
            {
                Log($"Erro ao iniciar servidor local: {ex.Message}");
            }
        }

        private void StopLocalGateway()
        {
            _isRunning = false;
            try
            {
                if (_httpListener != null && _httpListener.IsListening)
                {
                    _httpListener.Stop();
                    _httpListener.Close();
                }
            }
            catch { }
            _httpListener = null;
        }

        private void OnHttpRequestReceived(IAsyncResult ar)
        {
            if (!_isRunning || _httpListener == null) return;

            try
            {
                HttpListenerContext context = _httpListener.EndGetContext(ar);
                _httpListener.BeginGetContext(OnHttpRequestReceived, null);

                HttpListenerRequest request = context.Request;
                HttpListenerResponse response = context.Response;

                // CORS Headers
                response.Headers.Add("Access-Control-Allow-Origin", "*");
                response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey");

                if (request.HttpMethod == "OPTIONS")
                {
                    response.StatusCode = 200;
                    response.Close();
                    return;
                }

                string path = request.Url.AbsolutePath.ToLowerInvariant();

                // Status & Conexão
                if (path == "/status" || path == "/ping")
                {
                    bool hasActiveConnection = false;
                    lock (Account.All)
                    {
                        foreach (Account acc in Account.All)
                        {
                            if (acc.Connection != null && acc.Connection.Status == ConnectionStatus.Connected)
                            {
                                hasActiveConnection = true;
                                break;
                            }
                        }
                    }
                    string statusStr = hasActiveConnection ? "online" : "disconnected";
                    string statusJson = $"{{\"status\":\"{statusStr}\",\"isConnected\":{(hasActiveConnection ? "true" : "false")},\"isLicensed\":{(AxionLicenseManager.IsLicensed ? "true" : "false")},\"licenseStatus\":\"{AxionGatewayState.EscapeJson(AxionLicenseManager.StatusMensagem)}\",\"machineId\":\"{AxionGatewayState.EscapeJson(AxionLicenseManager.CurrentMachineId)}\",\"idAssinatura\":\"{AxionGatewayState.EscapeJson(AxionGatewayState.IdAssinatura)}\",\"version\":\"2.0.0\",\"gateway\":\"AxionGatewayV2\"}}";
                    SendJsonResponse(response, statusJson);
                    return;
                }

                // Lista de Contas
                if (path == "/accounts" || path == "/contas")
                {
                    string accountsJson = GetConnectedAccountsJson();
                    SendJsonResponse(response, accountsJson);
                    return;
                }

                // Posições e Ordens
                if (path == "/positions" || path == "/posicoes" || path == "/orders" || path == "/ordens")
                {
                    string positionsJson = GetOpenPositionsJson();
                    SendJsonResponse(response, positionsJson);
                    return;
                }

                // Ordem / Sinal Local
                if (path == "/sinal_local" || path == "/order" || path == "/ordem")
                {
                    if (request.HttpMethod == "POST")
                    {
                        if (!AxionLicenseManager.IsLicensed)
                        {
                            SendJsonResponse(response, $"{{\"success\":false,\"isLicenseBlocked\":true,\"error\":\"Licença Axion Gateway inativa ou Machine ID não vinculado. Verifique a aba 'Sobre & Licença' no NinjaTrader.\",\"machineId\":\"{AxionGatewayState.EscapeJson(AxionLicenseManager.CurrentMachineId)}\",\"licenseStatus\":\"{AxionGatewayState.EscapeJson(AxionLicenseManager.StatusMensagem)}\"}}");
                            return;
                        }

                        using (var reader = new StreamReader(request.InputStream, request.ContentEncoding))
                        {
                            string body = reader.ReadToEnd();
                            string resultJson = ExecuteVortexOrder(body);
                            SendJsonResponse(response, resultJson);
                            return;
                        }
                    }
                }

                // Cancelar Ordem Específica ou Todas as Ordens
                if (path == "/cancel_order" || path == "/cancel" || path == "/cancelar_ordem" || path == "/cancel_all_orders" || path == "/cancelar_todas")
                {
                    if (request.HttpMethod == "POST")
                    {
                        using (var reader = new StreamReader(request.InputStream, request.ContentEncoding))
                        {
                            string body = reader.ReadToEnd();
                            string resultJson = CancelVortexOrder(body);
                            SendJsonResponse(response, resultJson);
                            return;
                        }
                    }
                }

                // Zerar Todas as Posições e Contas (Pânico Geral)
                if (path == "/flatten_all" || path == "/zerar_tudo" || path == "/panic_close")
                {
                    if (request.HttpMethod == "POST" || request.HttpMethod == "GET")
                    {
                        string resultJson = FlattenAllAccounts();
                        SendJsonResponse(response, resultJson);
                        return;
                    }
                }

                // Reset de Sessão Diária de Risco via API / Painel Web
                if (path == "/reset_session" || path == "/resetar_sessao")
                {
                    ResetarSessaoRisco(manual: true, motivo: "Requisição API / Painel Web");
                    SendJsonResponse(response, "{\"success\":true,\"message\":\"Sessão de risco reiniciada com sucesso.\"}");
                    return;
                }

                // Modificar Níveis SL / TP
                if (path == "/sinal_local/levels" || path == "/modify_order" || path == "/modificar")
                {
                    if (request.HttpMethod == "POST")
                    {
                        using (var reader = new StreamReader(request.InputStream, request.ContentEncoding))
                        {
                            string body = reader.ReadToEnd();
                            string resultJson = ModifyVortexOrderLevels(body);
                            SendJsonResponse(response, resultJson);
                            return;
                        }
                    }
                }

                // Zerar / Fechar Posições de Conta ou Ativo
                if (path == "/sinal_local/status" || path == "/close_position" || path == "/zerar")
                {
                    if (request.HttpMethod == "POST")
                    {
                        using (var reader = new StreamReader(request.InputStream, request.ContentEncoding))
                        {
                            string body = reader.ReadToEnd();
                            string resultJson = FlattenVortexAccount(body);
                            SendJsonResponse(response, resultJson);
                            return;
                        }
                    }
                }

                // Disparo de Relatório Telegram via API
                if (path == "/telegram/report")
                {
                    EnviarRelatorioGeralContas(manual: true, motivo: "Disparo via API");
                    SendJsonResponse(response, "{\"success\":true,\"message\":\"Relatório enviado ao Telegram com sucesso.\"}");
                    return;
                }

                // Configuração e Reconexão do Túnel em Nuvem via API Local
                if (path == "/tunnel_config")
                {
                    if (request.HttpMethod == "POST")
                    {
                        using (var reader = new StreamReader(request.InputStream, request.ContentEncoding))
                        {
                            string body = reader.ReadToEnd();
                            string newTok = AxionGatewayState.ExtractJsonString(body, "token") ?? AxionGatewayState.ExtractJsonString(body, "pairing_token");
                            if (!string.IsNullOrWhiteSpace(newTok))
                            {
                                AxionGatewayState.NuvemPairingToken = newTok.Trim();
                                AxionGatewayState.HabilitarNuvemBroadcast = true;
                                AxionGatewayState.Save();
                                VortexCloudTunnelClient.Start();
                            }
                            SendJsonResponse(response, $"{{\"success\":true,\"token\":\"{AxionGatewayState.EscapeJson(AxionGatewayState.NuvemPairingToken)}\",\"isConnected\":{(VortexCloudTunnelClient.IsConnected ? "true" : "false")}}}");
                            return;
                        }
                    }
                    else
                    {
                        SendJsonResponse(response, $"{{\"success\":true,\"token\":\"{AxionGatewayState.EscapeJson(AxionGatewayState.NuvemPairingToken)}\",\"enabled\":{(AxionGatewayState.HabilitarNuvemBroadcast ? "true" : "false")},\"isConnected\":{(VortexCloudTunnelClient.IsConnected ? "true" : "false")},\"statusMessage\":\"{AxionGatewayState.EscapeJson(VortexCloudTunnelClient.StatusMessage)}\"}}");
                        return;
                    }
                }

                // Eventos de Execução da Conta Master (para Copy Trading Reverso)
                if (path == "/master_events")
                {
                    var list = new List<MasterExecutionEvent>();
                    while (_masterEventsQueue.TryDequeue(out var ev) && list.Count < 50)
                    {
                        list.Add(ev);
                    }
                    var sb = new StringBuilder();
                    sb.Append("{\"events\":[");
                    for (int i = 0; i < list.Count; i++)
                    {
                        if (i > 0) sb.Append(",");
                        var ev = list[i];
                        sb.Append("{");
                        sb.Append($"\"eventId\":\"{ev.EventId}\",");
                        sb.Append($"\"eventType\":\"{ev.EventType}\",");
                        sb.Append($"\"accountName\":\"{ev.AccountName}\",");
                        sb.Append($"\"symbol\":\"{ev.Symbol}\",");
                        sb.Append($"\"action\":\"{ev.Action}\",");
                        sb.Append($"\"quantity\":{ev.Quantity},");
                        sb.Append($"\"price\":{ev.Price.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"stopLoss\":{ev.StopLoss.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"takeProfit\":{ev.TakeProfit.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"stopLossPoints\":{ev.StopLossPoints.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"takeProfitPoints\":{ev.TakeProfitPoints.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"orderId\":\"{ev.OrderId}\",");
                        sb.Append($"\"orderName\":\"{ev.OrderName}\",");
                        sb.Append($"\"reportId\":\"{ev.ReportId}\",");
                        sb.Append($"\"timestamp\":\"{ev.Timestamp}\"");
                        sb.Append("}");
                    }
                    sb.Append("]}");
                    SendJsonResponse(response, sb.ToString());
                    return;
                }

                // Sincronização e Consulta de Regras de Copy Trading Híbrido
                if (path == "/copy_rules")
                {
                    if (request.HttpMethod == "GET")
                    {
                        var list = _copyRules.Values.ToList();
                        var sb = new StringBuilder();
                        sb.Append("{\"success\":true,\"rules\":[");
                        for (int i = 0; i < list.Count; i++)
                        {
                            if (i > 0) sb.Append(",");
                            var r = list[i];
                            sb.Append("{");
                            sb.Append($"\"id\":\"{r.Id}\",");
                            sb.Append($"\"masterAccount\":\"{r.MasterAccountName}\",");
                            sb.Append($"\"slaveAccount\":\"{r.SlaveAccountName}\",");
                            sb.Append($"\"lotMultiplier\":{r.LotMultiplier.ToString("F2", CultureInfo.InvariantCulture)},");
                            sb.Append($"\"isActive\":{(r.IsActive ? "true" : "false")},");
                            sb.Append($"\"allowedSymbols\":\"{r.AllowedSymbols}\",");
                            sb.Append($"\"executionSymbol\":\"{r.ExecutionSymbol}\",");
                            sb.Append($"\"symbolMapping\":\"{r.SymbolMapping}\",");
                            sb.Append($"\"maxDailyLoss\":{r.MaxDailyLoss.ToString("F2", CultureInfo.InvariantCulture)},");
                            sb.Append($"\"maxDailyTrades\":{r.MaxDailyTrades},");
                            sb.Append($"\"copyAtmStrategy\":{(r.CopyAtmStrategy ? "true" : "false")},");
                            sb.Append($"\"closeSlavesOnMasterClose\":{(r.CloseSlavesOnMasterClose ? "true" : "false")}");
                            sb.Append("}");
                        }
                        sb.Append("]}");
                        SendJsonResponse(response, sb.ToString());
                        return;
                    }
                    else if (request.HttpMethod == "POST")
                    {
                        using (var reader = new StreamReader(request.InputStream, request.ContentEncoding))
                        {
                            string body = reader.ReadToEnd();
                            UpdateCopyRulesFromJson(body);
                            NotifyCopyRulesUpdated();
                            NotifyRiskConfigUpdated();
                            SendJsonResponse(response, $"{{\"success\":true,\"count\":{_copyRules.Count}}}");
                            return;
                        }
                    }
                }

                // Sincronização e Consulta de Gestão de Risco das Contas
                if (path == "/sync_accounts_risk" || path == "/sync_risk")
                {
                    if (request.HttpMethod == "POST")
                    {
                        using (var reader = new StreamReader(request.InputStream, request.ContentEncoding))
                        {
                            string body = reader.ReadToEnd();
                            UpdateAccountRisksFromJson(body);
                            SaveAccountRisksToDisk();
                            NotifyRiskConfigUpdated();
                            SendJsonResponse(response, $"{{\"success\":true,\"message\":\"Configurações de risco das contas atualizadas com sucesso.\",\"count\":{_accountRiskStates.Count}}}");
                            return;
                        }
                    }
                    else if (request.HttpMethod == "GET")
                    {
                        var sb = new StringBuilder();
                        sb.Append("{\"accounts\":[");
                        var list = _accountRiskStates.Values.ToList();
                        for (int i = 0; i < list.Count; i++)
                        {
                            if (i > 0) sb.Append(",");
                            var r = list[i];
                            sb.Append("{");
                            sb.Append($"\"account_name\":\"{r.AccountName}\",");
                            sb.Append($"\"daily_loss_limit\":{r.DailyLossLimitUsd.ToString("F2", CultureInfo.InvariantCulture)},");
                            sb.Append($"\"daily_profit_target\":{r.DailyProfitTargetUsd.ToString("F2", CultureInfo.InvariantCulture)},");
                            sb.Append($"\"is_blocked\":{(r.IsBlocked ? "true" : "false")}");
                            sb.Append("}");
                        }
                        sb.Append("]}");
                        SendJsonResponse(response, sb.ToString());
                        return;
                    }
                }

                // Relatório de Performance / Histórico de Trades das Contas Sincronizadas
                if (path == "/account_performance")
                {
                    string targetAccName = request.QueryString["account"] ?? request.QueryString["accountName"] ?? "";
                    string mode = request.QueryString["mode"] ?? "";
                    string startDateStr = request.QueryString["startDate"] ?? "";
                    string endDateStr = request.QueryString["endDate"] ?? "";
                    string sinceStr = request.QueryString["since"] ?? "";

                    if (request.HttpMethod == "POST" && request.HasEntityBody)
                    {
                        using (var reader = new System.IO.StreamReader(request.InputStream, request.ContentEncoding))
                        {
                            string body = reader.ReadToEnd();
                            if (!string.IsNullOrWhiteSpace(body))
                            {
                                string bAcc = AxionGatewayState.ExtractJsonString(body, "account") ?? AxionGatewayState.ExtractJsonString(body, "accountName");
                                string bMode = AxionGatewayState.ExtractJsonString(body, "mode");
                                string bStart = AxionGatewayState.ExtractJsonString(body, "startDate");
                                string bEnd = AxionGatewayState.ExtractJsonString(body, "endDate");
                                string bSince = AxionGatewayState.ExtractJsonString(body, "since");

                                if (!string.IsNullOrEmpty(bAcc)) targetAccName = bAcc;
                                if (!string.IsNullOrEmpty(bMode)) mode = bMode;
                                if (!string.IsNullOrEmpty(bStart)) startDateStr = bStart;
                                if (!string.IsNullOrEmpty(bEnd)) endDateStr = bEnd;
                                if (!string.IsNullOrEmpty(bSince)) sinceStr = bSince;
                            }
                        }
                    }

                    if (string.IsNullOrEmpty(mode))
                    {
                        mode = (!string.IsNullOrEmpty(startDateStr) || !string.IsNullOrEmpty(endDateStr) || !string.IsNullOrEmpty(sinceStr)) ? "history" : "day";
                    }

                    string resultJson = GetAccountPerformanceJson(targetAccName, mode, startDateStr, endDateStr, sinceStr);
                    SendJsonResponse(response, resultJson);
                    return;
                }

                response.StatusCode = 404;
                SendJsonResponse(response, "{\"error\":\"Rota não encontrada\"}");
            }
            catch (Exception ex)
            {
                Log($"[ERRO HTTP]: {ex.Message}");
            }
        }

        public static void NotifyCopyRulesUpdated()
        {
            try
            {
                if (_statusWindowInstance != null && _statusWindowInstance.Dispatcher != null)
                {
                    _statusWindowInstance.Dispatcher.BeginInvoke(new Action(() =>
                    {
                        try 
                        { 
                            _statusWindowInstance.RefreshCopyRulesCards(); 
                        } 
                        catch { }
                    }));
                }
            }
            catch { }
        }

        public static void NotifyRiskConfigUpdated()
        {
            try
            {
                if (_statusWindowInstance != null && _statusWindowInstance.Dispatcher != null)
                {
                    _statusWindowInstance.Dispatcher.BeginInvoke(new Action(() =>
                    {
                        try 
                        { 
                            _statusWindowInstance.RefreshRiskCards(); 
                        } 
                        catch { }
                    }));
                }
            }
            catch { }
        }

        private string GetAccountPerformanceJson(string targetAccName, string mode = "day", string startDateStr = "", string endDateStr = "", string sinceStr = "")
        {
            try
            {
                string cleanTargetAcc = (targetAccName ?? "").Trim();
                if (string.Equals(cleanTargetAcc, "all", StringComparison.OrdinalIgnoreCase) || string.Equals(cleanTargetAcc, "undefined", StringComparison.OrdinalIgnoreCase) || string.Equals(cleanTargetAcc, "null", StringComparison.OrdinalIgnoreCase))
                    cleanTargetAcc = "";

                if (string.Equals(startDateStr, "undefined", StringComparison.OrdinalIgnoreCase) || string.Equals(startDateStr, "null", StringComparison.OrdinalIgnoreCase))
                    startDateStr = "";
                if (string.Equals(endDateStr, "undefined", StringComparison.OrdinalIgnoreCase) || string.Equals(endDateStr, "null", StringComparison.OrdinalIgnoreCase))
                    endDateStr = "";
                if (string.Equals(sinceStr, "undefined", StringComparison.OrdinalIgnoreCase) || string.Equals(sinceStr, "null", StringComparison.OrdinalIgnoreCase))
                    sinceStr = "";

                bool isHistoryQuery = string.Equals(mode, "history", StringComparison.OrdinalIgnoreCase)
                    || !string.IsNullOrEmpty(startDateStr)
                    || !string.IsNullOrEmpty(endDateStr)
                    || !string.IsNullOrEmpty(sinceStr);

                var accountsToQuery = new List<Account>();
                lock (Account.All)
                {
                    if (!string.IsNullOrEmpty(cleanTargetAcc))
                    {
                        var acc = Account.All.FirstOrDefault(a =>
                            a != null && (
                                string.Equals(a.Name?.Trim(), cleanTargetAcc, StringComparison.OrdinalIgnoreCase) ||
                                string.Equals(a.DisplayName?.Trim(), cleanTargetAcc, StringComparison.OrdinalIgnoreCase)
                            ));
                        if (acc != null) accountsToQuery.Add(acc);
                    }
                    else
                    {
                        accountsToQuery.AddRange(Account.All.Where(a => a != null && a.Name != "Backtest" && a.Name != "Playback101"));
                    }
                }

                if (accountsToQuery.Count == 0)
                {
                    return "{\"success\":false,\"error\":\"Nenhuma conta encontrada no NinjaTrader.\"}";
                }

                DateTime filterStartLocal = DateTime.MinValue;
                DateTime filterEndLocal = DateTime.MaxValue;
                bool hasExplicitDateFilter = false;

                long minTicks;
                long maxTicks = DateTime.MaxValue.Ticks;

                if (!string.IsNullOrEmpty(startDateStr) && DateTime.TryParse(startDateStr, CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTime startDt))
                {
                    filterStartLocal = DateTime.SpecifyKind(startDt.Date, DateTimeKind.Local);
                    hasExplicitDateFilter = true;
                    // Buffer de 12h antes no SQLite para garantir pareamento de posições abertas antes da meia-noite
                    minTicks = filterStartLocal.ToUniversalTime().AddHours(-12).Ticks;
                }
                else if (!string.IsNullOrEmpty(sinceStr) && DateTime.TryParse(sinceStr, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal, out DateTime sinceDt))
                {
                    filterStartLocal = sinceDt.ToLocalTime().AddHours(-2);
                    minTicks = sinceDt.AddHours(-12).Ticks;
                }
                else if (isHistoryQuery)
                {
                    filterStartLocal = DateTime.Now.Date.AddDays(-60);
                    minTicks = filterStartLocal.ToUniversalTime().AddHours(-12).Ticks;
                }
                else
                {
                    filterStartLocal = DateTime.Now.Date.AddDays(-1);
                    minTicks = filterStartLocal.ToUniversalTime().AddHours(-6).Ticks;
                }

                if (!string.IsNullOrEmpty(endDateStr) && DateTime.TryParse(endDateStr, CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTime endDt))
                {
                    filterEndLocal = DateTime.SpecifyKind(endDt.Date.AddDays(1).AddTicks(-1), DateTimeKind.Local);
                    hasExplicitDateFilter = true;
                    maxTicks = filterEndLocal.ToUniversalTime().AddHours(6).Ticks;
                }

                Log($"[DESEMPENHO NT8]: Consultando {accountsToQuery.Count} conta(s) (modo={(isHistoryQuery ? "history" : mode)}, start='{startDateStr}', end='{endDateStr}', since='{sinceStr}') para o Vortex.");

                var sb = new StringBuilder();
                sb.Append("{\"success\":true,\"accounts\":[");
                for (int i = 0; i < accountsToQuery.Count; i++)
                {
                    if (i > 0) sb.Append(",");
                    var acc = accountsToQuery[i];
                    double cashValue = 0, realizedPnL = 0, unrealizedPnL = 0, buyingPower = 0, grossPnL = 0;
                    try { cashValue = acc.Get(AccountItem.CashValue, Currency.UsDollar); } catch { }
                    try { realizedPnL = acc.Get(AccountItem.RealizedProfitLoss, Currency.UsDollar); } catch { }
                    try { unrealizedPnL = acc.Get(AccountItem.UnrealizedProfitLoss, Currency.UsDollar); } catch { }
                    try { grossPnL = acc.Get(AccountItem.GrossRealizedProfitLoss, Currency.UsDollar); } catch { grossPnL = realizedPnL; }
                    try { buyingPower = acc.Get(AccountItem.BuyingPower, Currency.UsDollar); } catch { }

                    if (cashValue == 0 && buyingPower > 0) cashValue = buyingPower;
                    if (buyingPower == 0 && cashValue > 0) buyingPower = cashValue;

                    // Extrair histórico de execuções
                    List<NinjaExecRecord> execList = new List<NinjaExecRecord>();
                    try
                    {
                        var seenExecIds = new HashSet<string>();

                        // 1. Sempre busca no banco SQLite do NinjaTrader quando em modo histórico, período ou se a memória da sessão estiver vazia
                        if (isHistoryQuery || acc.Executions == null || acc.Executions.Count == 0)
                        {
                            try
                            {
                                string dbPath = System.IO.Path.Combine(NinjaTrader.Core.Globals.UserDataDir, "db", "NinjaTrader.sqlite");
                                if (System.IO.File.Exists(dbPath))
                                {
                                    System.Reflection.Assembly sqliteAsm = AppDomain.CurrentDomain.GetAssemblies()
                                        .FirstOrDefault(a => a.GetName().Name.Equals("System.Data.SQLite", StringComparison.OrdinalIgnoreCase));
                                    if (sqliteAsm == null)
                                    {
                                        string sqliteDllPath = System.IO.Path.Combine(NinjaTrader.Core.Globals.InstallDir, "bin", "System.Data.SQLite.dll");
                                        try { sqliteAsm = System.Reflection.Assembly.LoadFrom(sqliteDllPath); } catch { }
                                    }

                                    if (sqliteAsm != null)
                                    {
                                        Type connType = sqliteAsm.GetType("System.Data.SQLite.SQLiteConnection");
                                        if (connType != null)
                                        {
                                            object conn = Activator.CreateInstance(connType, $"Data Source={dbPath};Version=3;Read Only=True;");
                                            using (conn as IDisposable)
                                            {
                                                connType.GetMethod("Open", Type.EmptyTypes).Invoke(conn, null);
                                                int dbAccId = -1;
                                                object cmd = connType.GetMethod("CreateCommand", Type.EmptyTypes).Invoke(conn, null);
                                                using (cmd as IDisposable)
                                                {
                                                    var cmdType = cmd.GetType();
                                                    string safeAccName = (acc.Name ?? "").Trim().Replace("'", "''");
                                                    string safeDispName = (acc.DisplayName ?? "").Trim().Replace("'", "''");
                                                    cmdType.GetProperty("CommandText").SetValue(cmd,
                                                        $"SELECT Id FROM Accounts WHERE LOWER(TRIM(Name)) = LOWER('{safeAccName}') OR LOWER(TRIM(Name)) = LOWER('{safeDispName}') LIMIT 1;");
                                                    var sc = cmdType.GetMethod("ExecuteScalar", Type.EmptyTypes).Invoke(cmd, null);
                                                    if (sc != null && sc != DBNull.Value) dbAccId = Convert.ToInt32(sc);

                                                    if (dbAccId >= 0)
                                                    {
                                                        string sql = $@"
SELECT e.ExecutionId, e.OrderId, e.Name, e.IsEntry, e.IsExit, e.MarketPosition, e.Price, e.Quantity, e.Time, e.Commission, m.Name, m.PointValue, o.OrderAction
FROM Executions e
LEFT JOIN Orders o ON e.OrderId = o.OrderId
LEFT JOIN Instruments i ON e.Instrument = i.Id
LEFT JOIN MasterInstruments m ON i.MasterInstrument = m.Id
WHERE e.Account = {dbAccId} AND e.Time >= {minTicks} AND e.Time <= {maxTicks}
ORDER BY e.Time ASC;";
                                                        cmdType.GetProperty("CommandText").SetValue(cmd, sql);
                                                        object reader = cmdType.GetMethod("ExecuteReader", Type.EmptyTypes).Invoke(cmd, null);
                                                        using (reader as IDisposable)
                                                        {
                                                            var rType = reader.GetType();
                                                            var readMethod = rType.GetMethod("Read", Type.EmptyTypes);
                                                            var isDbNullMethod = rType.GetMethod("IsDBNull", new Type[] { typeof(int) });
                                                            var getValueMethod = rType.GetMethod("GetValue", new Type[] { typeof(int) });

                                                            while ((bool)readMethod.Invoke(reader, null))
                                                            {
                                                                bool isNull0 = (bool)isDbNullMethod.Invoke(reader, new object[] { 0 });
                                                                string exId = isNull0 ? "" : Convert.ToString(getValueMethod.Invoke(reader, new object[] { 0 }));
                                                                if (string.IsNullOrEmpty(exId) || seenExecIds.Add(exId))
                                                                {
                                                                    string ordId = (bool)isDbNullMethod.Invoke(reader, new object[] { 1 }) ? "" : Convert.ToString(getValueMethod.Invoke(reader, new object[] { 1 }));
                                                                    string exName = (bool)isDbNullMethod.Invoke(reader, new object[] { 2 }) ? "" : Convert.ToString(getValueMethod.Invoke(reader, new object[] { 2 }));
                                                                    int isEntry = (bool)isDbNullMethod.Invoke(reader, new object[] { 3 }) ? 0 : Convert.ToInt32(getValueMethod.Invoke(reader, new object[] { 3 }));
                                                                    int isExit = (bool)isDbNullMethod.Invoke(reader, new object[] { 4 }) ? 0 : Convert.ToInt32(getValueMethod.Invoke(reader, new object[] { 4 }));
                                                                    int mPos = (bool)isDbNullMethod.Invoke(reader, new object[] { 5 }) ? 0 : Convert.ToInt32(getValueMethod.Invoke(reader, new object[] { 5 }));
                                                                    double pr = (bool)isDbNullMethod.Invoke(reader, new object[] { 6 }) ? 0.0 : Convert.ToDouble(getValueMethod.Invoke(reader, new object[] { 6 }), CultureInfo.InvariantCulture);
                                                                    int q = (bool)isDbNullMethod.Invoke(reader, new object[] { 7 }) ? 0 : Convert.ToInt32(getValueMethod.Invoke(reader, new object[] { 7 }));
                                                                    long ticks = (bool)isDbNullMethod.Invoke(reader, new object[] { 8 }) ? 0L : Convert.ToInt64(getValueMethod.Invoke(reader, new object[] { 8 }));
                                                                    double comm = (bool)isDbNullMethod.Invoke(reader, new object[] { 9 }) ? 0.0 : Convert.ToDouble(getValueMethod.Invoke(reader, new object[] { 9 }), CultureInfo.InvariantCulture);
                                                                    string sym = (bool)isDbNullMethod.Invoke(reader, new object[] { 10 }) ? "MNQ" : Convert.ToString(getValueMethod.Invoke(reader, new object[] { 10 }));
                                                                    double ptVal = (bool)isDbNullMethod.Invoke(reader, new object[] { 11 }) ? 2.0 : Convert.ToDouble(getValueMethod.Invoke(reader, new object[] { 11 }), CultureInfo.InvariantCulture);
                                                                    int ordAction = (bool)isDbNullMethod.Invoke(reader, new object[] { 12 }) ? -1 : Convert.ToInt32(getValueMethod.Invoke(reader, new object[] { 12 }));

                                                                    DateTime dt = ticks > 0 ? new DateTime(ticks, DateTimeKind.Utc).ToLocalTime() : DateTime.Now;

                                                                    execList.Add(new NinjaExecRecord
                                                                    {
                                                                        ExecutionId = exId,
                                                                        OrderId = ordId,
                                                                        Name = exName,
                                                                        IsEntry = (isEntry == 1),
                                                                        IsExit = (isExit == 1),
                                                                        MarketPos = mPos,
                                                                        OrderAction = ordAction,
                                                                        Price = pr,
                                                                        Quantity = q,
                                                                        Time = dt,
                                                                        Commission = comm,
                                                                        Symbol = sym,
                                                                        PointValue = ptVal
                                                                    });
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            catch (Exception exSql)
                            {
                                Log($"[DESEMPENHO NT8] Aviso ao carregar histórico SQLite ({acc.Name}): {exSql.Message}");
                            }
                        }

                        // 2. Incorpora execuções da sessão em memória
                        if (acc.Executions != null)
                        {
                            lock (Account.All)
                            {
                                int totalExecs = acc.Executions.Count;
                                int startIdx = isHistoryQuery 
                                    ? 0 
                                    : Math.Max(0, totalExecs - 200);
                                for (int idx = startIdx; idx < totalExecs; idx++)
                                {
                                    var item = acc.Executions[idx];
                                    if (item != null)
                                    {
                                        if (item.Time.ToUniversalTime().Ticks < minTicks || item.Time.ToUniversalTime().Ticks > maxTicks)
                                            continue;

                                        string idKey = !string.IsNullOrEmpty(item.ExecutionId)
                                            ? item.ExecutionId
                                            : $"{item.Time.Ticks}_{item.Price}_{item.Quantity}_{item.Instrument?.FullName}";
                                        if (seenExecIds.Add(idKey))
                                        {
                                            double ptVal = 2.0;
                                            try { if (item.Instrument?.MasterInstrument != null) ptVal = item.Instrument.MasterInstrument.PointValue; } catch { }
                                            bool isEntry = (item.Order != null && (item.Order.OrderAction == OrderAction.Buy || item.Order.OrderAction == OrderAction.SellShort));
                                            bool isExit = (item.Order != null && (item.Order.OrderAction == OrderAction.Sell || item.Order.OrderAction == OrderAction.BuyToCover));
                                            int ordAction = item.Order != null ? (int)item.Order.OrderAction : -1;
                                            execList.Add(new NinjaExecRecord
                                            {
                                                ExecutionId = item.ExecutionId,
                                                OrderId = item.Order != null ? item.Order.Id.ToString() : "",
                                                Name = item.Name,
                                                IsEntry = isEntry,
                                                IsExit = isExit,
                                                MarketPos = (item.MarketPosition == MarketPosition.Long ? 0 : 1),
                                                OrderAction = ordAction,
                                                Price = item.Price,
                                                Quantity = item.Quantity,
                                                Time = item.Time,
                                                Commission = item.Commission,
                                                Symbol = item.Instrument?.MasterInstrument?.Name ?? item.Instrument?.FullName ?? "MNQ",
                                                PointValue = ptVal
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                    catch { }

                    var reconstructedTrades = BuildTradesFromExecutions(execList);

                    // Filtra os trades reconstruídos dentro da janela solicitada (já que buscamos buffer anterior de 12h no SQLite para parear lotes)
                    if (hasExplicitDateFilter || !string.IsNullOrEmpty(sinceStr))
                    {
                        reconstructedTrades = reconstructedTrades.Where(tr =>
                        {
                            if (tr.IsOpen) return !hasExplicitDateFilter;
                            DateTime exitDt = DateTime.TryParse(tr.ExitTime, out DateTime parsedExit) ? parsedExit : DateTime.MinValue;
                            DateTime entryDt = DateTime.TryParse(tr.EntryTime, out DateTime parsedEntry) ? parsedEntry : exitDt;
                            bool afterStart = (exitDt >= filterStartLocal) || (entryDt >= filterStartLocal);
                            bool beforeEnd = (entryDt <= filterEndLocal) && (exitDt <= filterEndLocal.AddHours(6));
                            return afterStart && beforeEnd;
                        }).ToList();

                        for (int idx = 0; idx < reconstructedTrades.Count; idx++)
                        {
                            reconstructedTrades[idx].TradeNumber = idx + 1;
                        }
                    }

                    // Reconciliação do PnL Líquido com o RealizedPnL apurado da conta no NinjaTrader
                    // IMPORTANTE: Só reconciliar trades encerrados estritamente na sessão de HOJE (DateTime.Now.Date),
                    // quando realizedPnL != 0 e a diferença por lote for apenas ajuste de taxa de corretagem (<= $6.00/lote).
                    // NUNCA reconciliar operações de dias anteriores (ex: 12/10) contra o RealizedPnL de hoje (ex: 13/10 = $0.00)!
                    if (!isHistoryQuery && Math.Abs(realizedPnL) > 0.001)
                    {
                        DateTime todayDate = DateTime.Now.Date;
                        var todayClosedTrades = reconstructedTrades.Where(t =>
                            !t.IsOpen &&
                            DateTime.TryParse(t.ExitTime, out DateTime exDt) &&
                            exDt.Date == todayDate
                        ).ToList();

                        int totalClosedQty = todayClosedTrades.Sum(t => t.Quantity);
                        if (totalClosedQty > 0)
                        {
                            double targetNetPnl = realizedPnL;
                            double sumTradesPnl = todayClosedTrades.Sum(t => t.ProfitCurrency);
                            double diffToReconcile = sumTradesPnl - targetNetPnl;
                            double diffPerLot = diffToReconcile / totalClosedQty;
                            if (Math.Abs(diffToReconcile) > 0.001 && Math.Abs(diffPerLot) <= 6.0)
                            {
                                foreach (var tr in todayClosedTrades)
                                {
                                    double tradeDeduction = diffPerLot * tr.Quantity;
                                    tr.Commission += tradeDeduction;
                                    tr.ProfitCurrency -= tradeDeduction;
                                }
                            }
                        }
                    }

                    sb.Append("{");
                    sb.Append($"\"name\":\"{acc.Name}\",");
                    sb.Append($"\"displayName\":\"{acc.DisplayName}\",");
                    sb.Append($"\"connection\":\"{acc.Connection?.Options?.Name ?? "NinjaTrader"}\",");
                    sb.Append($"\"cashValue\":{cashValue.ToString("F2", CultureInfo.InvariantCulture)},");
                    sb.Append($"\"realizedPnL\":{realizedPnL.ToString("F2", CultureInfo.InvariantCulture)},");
                    sb.Append($"\"unrealizedPnL\":{unrealizedPnL.ToString("F2", CultureInfo.InvariantCulture)},");
                    sb.Append($"\"grossPnL\":{grossPnL.ToString("F2", CultureInfo.InvariantCulture)},");
                    sb.Append($"\"buyingPower\":{buyingPower.ToString("F2", CultureInfo.InvariantCulture)},");
                    sb.Append($"\"tradesCount\":{reconstructedTrades.Count},");

                    sb.Append("\"trades\":[");
                    for (int t = 0; t < reconstructedTrades.Count; t++)
                    {
                        if (t > 0) sb.Append(",");
                        var tr = reconstructedTrades[t];
                        sb.Append("{");
                        sb.Append($"\"tradeNumber\":{tr.TradeNumber},");
                        sb.Append($"\"orderId\":\"{tr.OrderId}\",");
                        sb.Append($"\"symbol\":\"{tr.Symbol}\",");
                        sb.Append($"\"entryAction\":\"{tr.EntryAction}\",");
                        sb.Append($"\"quantity\":{tr.Quantity},");
                        sb.Append($"\"entryPrice\":{tr.EntryPrice.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"exitPrice\":{tr.ExitPrice.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"profitCurrency\":{tr.ProfitCurrency.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"profitPoints\":{tr.ProfitPoints.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"commission\":{tr.Commission.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"entryTime\":\"{tr.EntryTime}\",");
                        sb.Append($"\"exitTime\":\"{tr.ExitTime}\",");
                        sb.Append($"\"isOpen\":{(tr.IsOpen ? "true" : "false")}");
                        sb.Append("}");
                    }
                    sb.Append("]");
                    sb.Append("}");
                }
                sb.Append("]}");
                return sb.ToString();
            }
            catch (Exception ex)
            {
                return $"{{\"success\":false,\"error\":\"{ex.Message}\"}}";
            }
        }

        private class NinjaExecRecord
        {
            public string ExecutionId = "";
            public string OrderId = "";
            public string Name = "";
            public bool IsEntry;
            public bool IsExit;
            public int MarketPos;
            public int OrderAction = -1;
            public double Price;
            public int Quantity;
            public DateTime Time;
            public double Commission;
            public string Symbol = "MNQ";
            public double PointValue = 2.0;
        }

        private class NinjaReconstructedTrade
        {
            public int TradeNumber;
            public string OrderId = "";
            public string Symbol = "";
            public string EntryAction = "BUY";
            public int Quantity = 1;
            public double EntryPrice = 0;
            public double ExitPrice = 0;
            public double ProfitCurrency = 0;
            public double ProfitPoints = 0;
            public double Commission = 0;
            public string EntryTime = "";
            public string ExitTime = "";
            public bool IsOpen = false;
        }

        private static List<NinjaReconstructedTrade> BuildTradesFromExecutions(List<NinjaExecRecord> rawExecs)
        {
            var result = new List<NinjaReconstructedTrade>();
            if (rawExecs == null || rawExecs.Count == 0) return result;

            try
            {
                var byInstrument = rawExecs.OrderBy(e => e.Time).GroupBy(e => e.Symbol ?? "MNQ");
                int tradeNum = 1;

                foreach (var group in byInstrument)
                {
                    string symbol = group.Key;
                    var openLots = new List<(double Price, DateTime Time, int Qty, bool IsBuy, double CommPerLot, string OrderId, double PtValue)>();

                    foreach (var ex in group)
                    {
                        if (ex == null) continue;
                        // Determinação precisa de Compra vs Venda usando OrderAction da corretora / NT8:
                        // OrderAction.Buy (0) ou BuyToCover (1) -> COMPRA
                        // OrderAction.Sell (2) ou SellShort (3) -> VENDA
                        bool isBuy;
                        if (ex.OrderAction == 0 || ex.OrderAction == 1)
                        {
                            isBuy = true;
                        }
                        else if (ex.OrderAction == 2 || ex.OrderAction == 3)
                        {
                            isBuy = false;
                        }
                        else
                        {
                            // Fallback pelo MarketPosition do NinjaTrader (0 = Long/Buy side, 1 = Short/Sell side)
                            isBuy = (ex.MarketPos == 0);
                        }

                        int qtyToMatch = ex.Quantity;
                        double exPrice = ex.Price;
                        double commPerLot = qtyToMatch > 0 ? (ex.Commission / qtyToMatch) : 0;
                        if (commPerLot <= 0)
                        {
                            if (symbol == "MGC") commPerLot = 1.20; // CME Micro Gold (~$2.40 round-turn por contrato)
                            else if (symbol == "NQ" || symbol == "ES") commPerLot = 2.00; // CME E-mini (~$4.00 round-turn)
                            else commPerLot = 0.95; // Taxa padrão CME Micro (~$1.90 round-turn)
                        }
                        string ordId = !string.IsNullOrEmpty(ex.ExecutionId)
                            ? (!string.IsNullOrEmpty(ex.OrderId) ? $"{ex.OrderId}_{ex.ExecutionId}" : ex.ExecutionId)
                            : (ex.OrderId ?? "");
                        double ptValue = ex.PointValue > 0 ? ex.PointValue : 2.0;

                        while (qtyToMatch > 0 && openLots.Count > 0)
                        {
                            var firstLot = openLots[0];
                            if (firstLot.IsBuy == isBuy) break;

                            int matchedQty = Math.Min(qtyToMatch, firstLot.Qty);
                            double entryP = firstLot.Price;
                            double exitP = exPrice;
                            double pts = firstLot.IsBuy ? (exitP - entryP) : (entryP - exitP);
                            double grossPnl = pts * matchedQty * ptValue;
                            double totalComm = (firstLot.CommPerLot * matchedQty) + (commPerLot * matchedQty);
                            double netPnl = grossPnl - totalComm;

                            string uniqueTradeOrderId = (!string.IsNullOrEmpty(firstLot.OrderId) && !string.IsNullOrEmpty(ordId))
                                ? $"{firstLot.OrderId}__{ordId}"
                                : (!string.IsNullOrEmpty(ordId) ? ordId : firstLot.OrderId);

                            result.Add(new NinjaReconstructedTrade
                            {
                                TradeNumber = tradeNum++,
                                OrderId = uniqueTradeOrderId,
                                Symbol = symbol,
                                EntryAction = firstLot.IsBuy ? "BUY" : "SELL",
                                Quantity = matchedQty,
                                EntryPrice = entryP,
                                ExitPrice = exitP,
                                ProfitPoints = pts,
                                ProfitCurrency = netPnl,
                                Commission = totalComm,
                                EntryTime = firstLot.Time.ToString("yyyy-MM-ddTHH:mm:ss") + DateTimeOffset.Now.ToString("zzz"),
                                ExitTime = ex.Time.ToString("yyyy-MM-ddTHH:mm:ss") + DateTimeOffset.Now.ToString("zzz"),
                                IsOpen = false
                            });

                            qtyToMatch -= matchedQty;
                            if (matchedQty == firstLot.Qty)
                            {
                                openLots.RemoveAt(0);
                            }
                            else
                            {
                                openLots[0] = (firstLot.Price, firstLot.Time, firstLot.Qty - matchedQty, firstLot.IsBuy, firstLot.CommPerLot, firstLot.OrderId, firstLot.PtValue);
                            }
                        }

                        if (qtyToMatch > 0)
                        {
                            openLots.Add((exPrice, ex.Time, qtyToMatch, isBuy, commPerLot, ordId, ptValue));
                        }
                    }

                    foreach (var open in openLots)
                    {
                        result.Add(new NinjaReconstructedTrade
                        {
                            TradeNumber = tradeNum++,
                            OrderId = open.OrderId,
                            Symbol = symbol,
                            EntryAction = open.IsBuy ? "BUY" : "SELL",
                            Quantity = open.Qty,
                            EntryPrice = open.Price,
                            ExitPrice = open.Price,
                            ProfitPoints = 0,
                            ProfitCurrency = 0,
                            Commission = open.CommPerLot * open.Qty,
                            EntryTime = open.Time.ToString("yyyy-MM-ddTHH:mm:ss") + DateTimeOffset.Now.ToString("zzz"),
                            ExitTime = open.Time.ToString("yyyy-MM-ddTHH:mm:ss") + DateTimeOffset.Now.ToString("zzz"),
                            IsOpen = true
                        });
                    }
                }
            }
            catch { }

            return result.OrderByDescending(r => r.ExitTime).ToList();
        }

        private void SendJsonResponse(HttpListenerResponse response, string json)
        {
            try
            {
                byte[] buffer = Encoding.UTF8.GetBytes(json);
                response.ContentType = "application/json; charset=utf-8";
                response.ContentLength64 = buffer.Length;
                response.KeepAlive = true;
                response.OutputStream.Write(buffer, 0, buffer.Length);
                response.OutputStream.Flush();
                response.Close();
            }
            catch { }
        }

        private string GetConnectedAccountsJson()
        {
            try
            {
                var sb = new StringBuilder();
                sb.Append("{\"accounts\":[");
                bool first = true;

                lock (Account.All)
                {
                    foreach (Account acc in Account.All)
                    {
                        if (acc == null) continue;
                        if (!first) sb.Append(",");
                        first = false;

                        double cash = 0, buyingPower = 0, realized = 0, unrealized = 0;
                        try { cash = acc.Get(AccountItem.CashValue, Currency.UsDollar); } catch { }
                        try { buyingPower = acc.Get(AccountItem.BuyingPower, Currency.UsDollar); } catch { }
                        try { realized = acc.Get(AccountItem.RealizedProfitLoss, Currency.UsDollar); } catch { }
                        try { unrealized = acc.Get(AccountItem.UnrealizedProfitLoss, Currency.UsDollar); } catch { }

                        bool isConnected = (acc.Connection != null && acc.Connection.Status == ConnectionStatus.Connected);
                        string connName = acc.Connection != null ? acc.Connection.Options.Name : "Desconectado";

                        sb.Append("{");
                        sb.Append($"\"name\":\"{acc.Name}\",");
                        sb.Append($"\"displayName\":\"{acc.DisplayName}\",");
                        sb.Append($"\"connection\":\"{connName}\",");
                        sb.Append($"\"cashValue\":{cash.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"buyingPower\":{buyingPower.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"realizedPnL\":{realized.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"unrealizedPnL\":{unrealized.ToString("F2", CultureInfo.InvariantCulture)},");
                        sb.Append($"\"isConnected\":{(isConnected ? "true" : "false")}");
                        sb.Append("}");
                    }
                }
                sb.Append("]}");
                return sb.ToString();
            }
            catch (Exception ex)
            {
                return $"{{\"error\":\"{ex.Message}\"}}";
            }
        }

        private string GetOpenPositionsJson()
        {
            try
            {
                var sb = new StringBuilder();
                sb.Append("{\"positions\":[");
                bool firstPos = true;

                lock (Account.All)
                {
                    foreach (Account acc in Account.All)
                    {
                        if (acc == null) continue;
                        foreach (Position pos in acc.Positions)
                        {
                            if (pos == null || pos.Quantity == 0) continue;
                            if (!firstPos) sb.Append(",");
                            firstPos = false;

                            string side = pos.MarketPosition == MarketPosition.Long ? "BUY" : (pos.MarketPosition == MarketPosition.Short ? "SELL" : "FLAT");
                            double unPnL = 0;
                            try
                            {
                                unPnL = pos.GetUnrealizedProfitLoss(PerformanceUnit.Currency);
                            }
                            catch
                            {
                                try
                                {
                                    double curPrice = 0;
                                    if (pos.Instrument != null && pos.Instrument.MarketData != null && pos.Instrument.MarketData.Last != null && pos.Instrument.MarketData.Last.Price > 0)
                                    {
                                        curPrice = pos.Instrument.MarketData.Last.Price;
                                    }
                                    if (curPrice > 0)
                                    {
                                        unPnL = pos.GetUnrealizedProfitLoss(PerformanceUnit.Currency, curPrice);
                                    }
                                }
                                catch { }
                            }

                            if (unPnL == 0)
                            {
                                try
                                {
                                    double curPrice = 0;
                                    if (pos.Instrument != null && pos.Instrument.MarketData != null && pos.Instrument.MarketData.Last != null && pos.Instrument.MarketData.Last.Price > 0)
                                    {
                                        curPrice = pos.Instrument.MarketData.Last.Price;
                                    }

                                    if (curPrice > 0 && pos.AveragePrice > 0)
                                    {
                                        double pointVal = pos.Instrument?.MasterInstrument?.PointValue ?? 1.0;
                                        double diff = pos.Quantity > 0 ? (curPrice - pos.AveragePrice) : (pos.AveragePrice - curPrice);
                                        unPnL = diff * Math.Abs(pos.Quantity) * pointVal;
                                    }
                                    else if (acc.Positions != null && acc.Positions.Count(p => p != null && p.MarketPosition != MarketPosition.Flat && p.Quantity != 0) == 1)
                                    {
                                        unPnL = acc.Get(AccountItem.UnrealizedProfitLoss, Currency.UsDollar);
                                    }
                                }
                                catch { }
                            }

                            sb.Append("{");
                            sb.Append($"\"account\":\"{acc.Name}\",");
                            sb.Append($"\"symbol\":\"{pos.Instrument?.FullName}\",");
                            sb.Append($"\"marketPosition\":\"{side}\",");
                            sb.Append($"\"quantity\":{Math.Abs(pos.Quantity)},");
                            sb.Append($"\"averagePrice\":{pos.AveragePrice.ToString("F2", CultureInfo.InvariantCulture)},");
                            sb.Append($"\"unrealizedPnL\":{unPnL.ToString("F2", CultureInfo.InvariantCulture)}");
                            sb.Append("}");
                        }
                    }
                }
                sb.Append("],\"orders\":[");
                bool firstOrd = true;
                lock (Account.All)
                {
                    foreach (Account acc in Account.All)
                    {
                        if (acc == null || acc.Orders == null) continue;
                        foreach (Order ord in acc.Orders)
                        {
                            if (ord == null) continue;
                            if (ord.OrderState != OrderState.Working && ord.OrderState != OrderState.Accepted && ord.OrderState != OrderState.Submitted) continue;
                            if (!firstOrd) sb.Append(",");
                            firstOrd = false;

                            string action = (ord.OrderAction == OrderAction.Buy || ord.OrderAction == OrderAction.BuyToCover) ? "BUY" : "SELL";
                            string ordType = ord.OrderType.ToString();
                            double price = ord.LimitPrice > 0 ? ord.LimitPrice : (ord.StopPrice > 0 ? ord.StopPrice : 0);

                            sb.Append("{");
                            sb.Append($"\"orderId\":\"{ord.Id}\",");
                            sb.Append($"\"account\":\"{acc.Name}\",");
                            sb.Append($"\"symbol\":\"{ord.Instrument?.FullName ?? ""}\",");
                            sb.Append($"\"action\":\"{action}\",");
                            sb.Append($"\"orderType\":\"{ordType}\",");
                            sb.Append($"\"quantity\":{ord.Quantity},");
                            sb.Append($"\"filled\":{ord.Filled},");
                            sb.Append($"\"price\":{price.ToString("F2", CultureInfo.InvariantCulture)},");
                            sb.Append($"\"stopPrice\":{ord.StopPrice.ToString("F2", CultureInfo.InvariantCulture)},");
                            sb.Append($"\"limitPrice\":{ord.LimitPrice.ToString("F2", CultureInfo.InvariantCulture)},");
                            sb.Append($"\"orderState\":\"{ord.OrderState}\",");
                            sb.Append($"\"name\":\"{ord.Name ?? ""}\",");
                            sb.Append($"\"oco\":\"{ord.Oco ?? ""}\",");
                            sb.Append($"\"time\":\"{ord.Time:yyyy-MM-ddTHH:mm:ssZ}\"");
                            sb.Append("}");
                        }
                    }
                }
                sb.Append("]}");
                return sb.ToString();
            }
            catch (Exception ex)
            {
                return $"{{\"error\":\"{ex.Message}\"}}";
            }
        }

        private static Instrument FindNinjaInstrument(string symbolStr, Account targetAccount = null)
        {
            if (string.IsNullOrWhiteSpace(symbolStr)) return null;
            string raw = symbolStr.Trim();

            // 1. Busca direta exata
            Instrument inst = Instrument.GetInstrument(raw);
            if (inst != null) return inst;

            // 2. Normalizar aliases comuns (ex: NASDAQ -> NQ, RUSSEL -> RTY, etc.)
            string upper = raw.ToUpperInvariant();
            string root = upper.Split(' ')[0];
            if (root == "NASDAQ" || root == "NDX" || root == "US100" || root == "NAS100") root = "NQ";
            else if (root == "RUSSELL" || root == "RUSSEL" || root == "US2000") root = "RTY";
            else if (root == "SP500" || root == "S&P500" || root == "SPX" || root == "US500" || root == "SP") root = "ES";
            else if (root == "GOLD" || root == "OURO" || root == "XAUUSD") root = "GC";
            else if (root == "OIL" || root == "PETROLEO" || root == "PETR" || root == "USOIL" || root == "WTI") root = "CL";
            else if (root == "DOW" || root == "DOWJONES" || root == "US30" || root == "DJIA") root = "YM";

            // 3. Verificar se há regra de copy / mapeamento cadastrada para a conta (ex: NQ->MNQ DEC26)
            if (targetAccount != null && _copyRules != null)
            {
                foreach (var rule in _copyRules.Values)
                {
                    if (string.Equals(rule.SlaveAccountName, targetAccount.Name, StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(rule.MasterAccountName, targetAccount.Name, StringComparison.OrdinalIgnoreCase))
                    {
                        if (!string.IsNullOrEmpty(rule.ExecutionSymbol))
                        {
                            var execInst = Instrument.GetInstrument(rule.ExecutionSymbol.Trim()) ?? Instrument.GetInstrument(rule.ExecutionSymbol.Split(' ')[0]);
                            if (execInst != null) return execInst;
                        }

                        if (!string.IsNullOrEmpty(rule.SymbolMapping))
                        {
                            string[] pairs = rule.SymbolMapping.Split(new[] { ',', ';', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                            foreach (var pair in pairs)
                            {
                                string fromSym = "", toSym = "";
                                if (pair.Contains("->"))
                                {
                                    var parts = pair.Split(new[] { "->" }, StringSplitOptions.None);
                                    fromSym = parts[0].Trim().ToUpperInvariant();
                                    toSym = parts.Length > 1 ? parts[1].Trim() : "";
                                }
                                else if (pair.Contains(":"))
                                {
                                    var parts = pair.Split(':');
                                    fromSym = parts[0].Trim().ToUpperInvariant();
                                    toSym = parts.Length > 1 ? parts[1].Trim() : "";
                                }

                                if (root.Equals(fromSym, StringComparison.OrdinalIgnoreCase) || upper.StartsWith(fromSym, StringComparison.OrdinalIgnoreCase))
                                {
                                    var mappedInst = Instrument.GetInstrument(toSym) ?? Instrument.GetInstrument(toSym.Split(' ')[0]);
                                    if (mappedInst != null) return mappedInst;
                                }
                            }
                        }
                    }
                }
            }

            // 4. Se a conta já tiver uma posição aberta com esse ativo raiz, utiliza o mesmo instrumento
            if (targetAccount != null && targetAccount.Positions != null)
            {
                var existingPos = targetAccount.Positions.FirstOrDefault(p => p.MarketPosition != MarketPosition.Flat && p.Instrument != null && (
                    p.Instrument.FullName.ToUpperInvariant().StartsWith(root) ||
                    (p.Instrument.MasterInstrument != null && string.Equals(p.Instrument.MasterInstrument.Name, root, StringComparison.OrdinalIgnoreCase))
                ));
                if (existingPos?.Instrument != null) return existingPos.Instrument;
            }

            // 5. Tenta resolução de contratos futuros vigentes padrão (ex: DEC26 / 12-26 / MAR27)
            string[] candidateContractSuffixes = new[] { " DEC26", " 12-26", " MAR27", " 03-27" };
            string[] candidateRoots = root == "NQ" ? new[] { "MNQ", "NQ" } :
                                     root == "MNQ" ? new[] { "MNQ", "NQ" } :
                                     root == "ES" ? new[] { "MES", "ES" } :
                                     root == "MES" ? new[] { "MES", "ES" } :
                                     root == "RTY" ? new[] { "M2K", "RTY" } :
                                     root == "M2K" ? new[] { "M2K", "RTY" } :
                                     root == "GC" ? new[] { "MGC", "GC" } :
                                     root == "MGC" ? new[] { "MGC", "GC" } :
                                     root == "CL" ? new[] { "MCL", "CL" } :
                                     root == "MCL" ? new[] { "MCL", "CL" } :
                                     root == "YM" ? new[] { "MYM", "YM" } :
                                     root == "MYM" ? new[] { "MYM", "YM" } :
                                     new[] { root };

            foreach (var cRoot in candidateRoots)
            {
                foreach (var suffix in candidateContractSuffixes)
                {
                    inst = Instrument.GetInstrument(cRoot + suffix);
                    if (inst != null) return inst;
                }
                inst = Instrument.GetInstrument(cRoot);
                if (inst != null) return inst;
            }

            return null;
        }

        private string ExecuteVortexOrder(string body)
        {
            try
            {
                string symbolStr = ExtractJsonString(body, "symbol") ?? "NQ 09-26";
                string sideStr = (ExtractJsonString(body, "side") ?? ExtractJsonString(body, "action") ?? "BUY").ToUpper();
                string accountName = ExtractJsonString(body, "account_name") ?? ExtractJsonString(body, "account") ?? ExtractJsonString(body, "accountName") ?? "";
                int qty = ExtractJsonInt(body, "quantity", 0);
                if (qty <= 0) qty = ExtractJsonInt(body, "contrato", 0);
                if (qty <= 0) qty = ExtractJsonInt(body, "contracts", 0);
                if (qty <= 0) qty = ExtractJsonInt(body, "lots", 0);
                if (qty <= 0) qty = 1;

                double stopLoss = ExtractJsonDouble(body, "stop_loss", 0);
                double takeProfit = ExtractJsonDouble(body, "take_profit", 0);
                double stopLossPoints = ExtractJsonDouble(body, "stop_loss_points", 0);
                double takeProfitPoints = ExtractJsonDouble(body, "take_profit_points", 0);
                double price = ExtractJsonDouble(body, "price", 0);
                if (price <= 0) price = ExtractJsonDouble(body, "entry_price", 0);

                Account targetAccount = null;
                lock (Account.All)
                {
                    if (!string.IsNullOrEmpty(accountName))
                    {
                        targetAccount = Account.All.FirstOrDefault(a => string.Equals(a.Name, accountName, StringComparison.OrdinalIgnoreCase));
                    }
                    if (targetAccount == null)
                    {
                        targetAccount = Account.All.FirstOrDefault(a => a != null && IsAccountReadyForTrading(a)) ?? Account.All.FirstOrDefault();
                    }
                }

                if (targetAccount == null) return "{\"success\":false,\"error\":\"Nenhuma conta encontrada no NinjaTrader 8\"}";

                // Verificar Bloqueio de Risco, Horário Operacional, Limite de Trades e Meta Diária (Loss/Take)
                var rInfo = GetAccountRiskInfo(targetAccount.Name);
                if (rInfo != null)
                {
                    if (!CanAccountTrade(rInfo, out string rejReason))
                    {
                        LogRejectionDebounced(targetAccount.Name, rejReason);
                        EnqueueRejectionEvent(targetAccount.Name, targetAccount.Name, symbolStr, sideStr, qty, price, rejReason);
                        return $"{{\"success\":false,\"error\":\"{rejReason}\",\"isBlocked\":true}}";
                    }
                }

                // Tamanho de lote: se for maior que o limite máximo da conta, altera para o valor máximo permitido
                int clampedQty = ClampLotSizeForAccount(targetAccount.Name, qty);
                if (clampedQty != qty)
                {
                    Log($"⚠️ [GESTÃO DE LOTE - {targetAccount.Name}]: Lote solicitado ({qty}x) excede o máximo da conta. Ajustado automaticamente para {clampedQty}x.");
                    qty = clampedQty;
                }

                Instrument instrument = FindNinjaInstrument(symbolStr, targetAccount);
                if (instrument == null) return $"{{\"success\":false,\"error\":\"Ativo {symbolStr} não encontrado\"}}";

                EnsureAccountSubscribed(targetAccount);

                if (stopLossPoints <= 0 && stopLoss > 0 && price > 0)
                {
                    stopLossPoints = Math.Abs(price - stopLoss);
                }
                if (takeProfitPoints <= 0 && takeProfit > 0 && price > 0)
                {
                    takeProfitPoints = Math.Abs(takeProfit - price);
                }

                // Bloquear abertura de operação a mercado sem Stop Loss e Take Profit
                bool hasValidSl = stopLoss > 0 || stopLossPoints > 0;
                bool hasValidTp = takeProfit > 0 || takeProfitPoints > 0;
                if (!hasValidSl || !hasValidTp)
                {
                    string orderTypeStr = (ExtractJsonString(body, "order_type") ?? ExtractJsonString(body, "type") ?? "MARKET").ToUpperInvariant();
                    bool isPendingOrder = orderTypeStr.Contains("LIMIT") || orderTypeStr.Contains("STOP") || orderTypeStr.Contains("MIT");

                    if (!isPendingOrder)
                    {
                        string missingSlTpReason = $"Operação a mercado rejeitada na conta {targetAccount.Name} ({instrument.FullName}): Obrigatório definir Stop Loss e Take Profit para posições a mercado.";
                        LogRejectionDebounced(targetAccount.Name, missingSlTpReason);
                        EnqueueRejectionEvent(targetAccount.Name, targetAccount.Name, instrument.FullName, sideStr, qty, price, missingSlTpReason);
                        return $"{{\"success\":false,\"error\":\"{missingSlTpReason}\",\"missingSlTp\":true}}";
                    }
                }

                OrderAction action = sideStr == "BUY" || sideStr == "COMPRA" ? OrderAction.Buy : OrderAction.Sell;

                // 1. Validação de Posição Única no Mesmo Ativo / Suporte a Estratégias ATM
                bool isAtm = ExtractJsonBool(body, "is_atm", false);
                bool allowMulti = ExtractJsonBool(body, "allow_multi", false) || ExtractJsonBool(body, "allow_multi_signals", false);
                if (!allowMulti && rInfo != null)
                {
                    allowMulti = rInfo.AllowMultiSignals;
                }
                else if (!allowMulti && _accountRiskStates.TryGetValue(targetAccount.Name, out var targetRisk))
                {
                    allowMulti = targetRisk.AllowMultiSignals;
                }
                string desc = ExtractJsonString(body, "description") ?? "";
                string stratName = ExtractJsonString(body, "strategy_name") ?? "";
                bool isAtmTarget = isAtm || 
                                   desc.IndexOf("ATM", StringComparison.OrdinalIgnoreCase) >= 0 || 
                                   desc.IndexOf("Alvo", StringComparison.OrdinalIgnoreCase) >= 0 || 
                                   stratName.IndexOf("Alvo", StringComparison.OrdinalIgnoreCase) >= 0;

                string cleanSymbolRoot = symbolStr.Split(' ')[0].Trim().ToUpperInvariant();

                Position existingPos = targetAccount.Positions.FirstOrDefault(p => p.MarketPosition != MarketPosition.Flat && Math.Abs(p.Quantity) > 0 && (
                    p.Instrument == instrument || 
                    (p.Instrument != null && instrument != null && (
                        p.Instrument.FullName == instrument.FullName || 
                        (p.Instrument.MasterInstrument != null && instrument.MasterInstrument != null && string.Equals(p.Instrument.MasterInstrument.Name, instrument.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))
                    )) ||
                    (p.Instrument != null && !string.IsNullOrEmpty(cleanSymbolRoot) && (
                        p.Instrument.FullName.ToUpperInvariant().StartsWith(cleanSymbolRoot) || 
                        (p.Instrument.MasterInstrument != null && string.Equals(p.Instrument.MasterInstrument.Name, cleanSymbolRoot, StringComparison.OrdinalIgnoreCase))
                    ))
                ));

                if (existingPos != null && existingPos.MarketPosition != MarketPosition.Flat && Math.Abs(existingPos.Quantity) > 0)
                {
                    bool sameDirection = (action == OrderAction.Buy && existingPos.MarketPosition == MarketPosition.Long) ||
                                         (action == OrderAction.Sell && existingPos.MarketPosition == MarketPosition.Short);

                    // SOMENTE permite entradas adicionais se for um alvo da mesma estratégia ATM e na mesma direção!
                    // Múltiplos sinais NÃO autoriza mais de 1 posição no mesmo ativo.
                    if (isAtmTarget && sameDirection)
                    {
                        Log($"ℹ️ [ATM MULTI-ALVO]: Permitindo alvo adicional em {instrument.FullName} na conta {targetAccount.Name} (Posição existente: {existingPos.MarketPosition} {existingPos.Quantity}x + Novo alvo: {qty}x)");
                    }
                    else
                    {
                        string sideStrPos = existingPos.MarketPosition == MarketPosition.Long ? "COMPRA (LONG)" : "VENDA (SHORT)";
                        Log($"⚠️ [ORDEM BLOQUEADA]: Conta {targetAccount.Name} já possui posição aberta em {instrument.FullName} ({sideStrPos} {existingPos.Quantity}x). Posições simultâneas no mesmo ativo são proibidas.");
                        return $"{{\"success\":false,\"error\":\"Conta {targetAccount.Name} já possui posição aberta em {instrument.FullName} ({sideStrPos} {existingPos.Quantity}x). Posições simultâneas no mesmo ativo são proibidas.\",\"alreadyPositioned\":true}}";
                    }
                }
                else if (!allowMulti)
                {
                    // Se Múltiplos Sinais estiver desativado, não permite abrir se houver qualquer posição em OUTRO ativo
                    var otherOpenPos = targetAccount.Positions.FirstOrDefault(p => p.MarketPosition != MarketPosition.Flat && Math.Abs(p.Quantity) > 0);
                    if (otherOpenPos != null)
                    {
                        Log($"⚠️ [ORDEM BLOQUEADA]: Conta {targetAccount.Name} já possui posição aberta em {otherOpenPos.Instrument?.FullName} e Múltiplos Sinais em ativos diferentes está desativado.");
                        return $"{{\"success\":false,\"error\":\"Conta {targetAccount.Name} já possui posição aberta em outro ativo e Múltiplos Sinais está desativado.\",\"multiSignalsBlocked\":true}}";
                    }
                }

                string reportId = ExtractJsonString(body, "id") ?? ExtractJsonString(body, "order_id") ?? "";
                Order entryOrder = CreateStealthOrder(targetAccount, instrument, action, OrderType.Market, OrderEntry.Manual, TimeInForce.Gtc, qty, 0, 0, "", "Entry");
                RegisterInternalOrder(entryOrder.OrderId);

                string ocoId = Guid.NewGuid().ToString("N");
                if (!string.IsNullOrEmpty(reportId))
                {
                    _reportToOcoMap[reportId] = ocoId;
                }

                var pb = new PendingBracket
                {
                    OrderId = entryOrder.OrderId,
                    ReportId = reportId,
                    Account = targetAccount,
                    Instrument = instrument,
                    EntryAction = action,
                    Quantity = qty,
                    StopPoints = stopLossPoints,
                    TakePoints = takeProfitPoints,
                    InitialSl = stopLoss,
                    InitialTp = takeProfit,
                    OcoId = ocoId,
                    CreatedAt = DateTime.Now
                };

                _pendingBrackets[entryOrder.OrderId] = pb;

                // Submete APENAS a ordem a mercado de entrada via StealthSubmit.
                // O Stop Loss e Take Profit serão submetidos imediatamente no evento de Fill com o preço real executado no NinjaTrader!
                StealthSubmit(targetAccount, entryOrder);

                Log($"[ORDEM ABERTA]: {action} {qty}x {instrument.FullName} na conta {targetAccount.Name} (Aguardando Fill para envio do SL/TP OCO)");
                return $"{{\"success\":true,\"orderId\":\"{entryOrder.OrderId}\",\"account\":\"{targetAccount.Name}\",\"symbol\":\"{instrument.FullName}\",\"qty\":{qty}}}";
            }
            catch (Exception ex)
            {
                return $"{{\"success\":false,\"error\":\"{ex.Message}\"}}";
            }
        }

        private string ModifyVortexOrderLevels(string body)
        {
            try
            {
                string orderId = ExtractJsonString(body, "order_id") ?? ExtractJsonString(body, "id") ?? "";
                string accountName = ExtractJsonString(body, "account_name") ?? ExtractJsonString(body, "account") ?? "";
                string symbolStr = ExtractJsonString(body, "symbol") ?? "";
                string sideStr = (ExtractJsonString(body, "side") ?? "").ToUpper();
                double entryPrice = ExtractJsonDouble(body, "entry_price", 0);
                double inputSl = ExtractJsonDouble(body, "stop_loss", 0);
                double inputTp = ExtractJsonDouble(body, "take_profit", 0);
                double stopLossPoints = ExtractJsonDouble(body, "stop_loss_points", 0);
                double takeProfitPoints = ExtractJsonDouble(body, "take_profit_points", 0);
                bool isBreakeven = ExtractJsonBool(body, "is_breakeven", false);
                double offsetPoints = ExtractJsonDouble(body, "offset_points", 0);
                double currentMarketPrice = ExtractJsonDouble(body, "current_price", 0);
                int reqQty = ExtractJsonInt(body, "quantity", 0);
                if (reqQty <= 0) reqQty = ExtractJsonInt(body, "contrato", 1);

                // Auto-detectar breakeven se inputSl for praticamente igual ao preço de entrada enviado (<= 0.75 pts)
                if (!isBreakeven && entryPrice > 0 && inputSl > 0 && Math.Abs(entryPrice - inputSl) <= 0.75)
                {
                    isBreakeven = true;
                    if (offsetPoints == 0) offsetPoints = inputSl - entryPrice;
                }

                Account targetAccount = null;
                lock (Account.All)
                {
                    if (!string.IsNullOrEmpty(accountName))
                    {
                        targetAccount = Account.All.FirstOrDefault(a => string.Equals(a.Name, accountName, StringComparison.OrdinalIgnoreCase));
                    }
                    if (targetAccount == null)
                    {
                        targetAccount = Account.All.FirstOrDefault(a => a != null && IsAccountReadyForTrading(a)) ?? Account.All.FirstOrDefault();
                    }
                }

                if (targetAccount == null) return "{\"success\":false,\"error\":\"Conta não encontrada no NinjaTrader\"}";

                Instrument instrument = null;
                string cleanSymbolRoot = "";
                if (!string.IsNullOrEmpty(symbolStr))
                {
                    instrument = FindNinjaInstrument(symbolStr, targetAccount) ?? Instrument.GetInstrument(symbolStr) ?? Instrument.GetInstrument(symbolStr.Split(' ')[0]);
                    cleanSymbolRoot = symbolStr.Split(' ')[0].Trim().ToUpperInvariant();
                }

                // 2. Determina a posição ativa real no NinjaTrader para capturar o AveragePrice REAL da corretora
                Position pos = targetAccount.Positions.FirstOrDefault(p => p.MarketPosition != MarketPosition.Flat && Math.Abs(p.Quantity) > 0 && (
                    instrument == null || 
                    p.Instrument == instrument || 
                    (p.Instrument != null && instrument != null && (p.Instrument.FullName == instrument.FullName || (p.Instrument.MasterInstrument != null && instrument.MasterInstrument != null && string.Equals(p.Instrument.MasterInstrument.Name, instrument.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase)))) ||
                    (p.Instrument != null && !string.IsNullOrEmpty(cleanSymbolRoot) && (p.Instrument.FullName.ToUpperInvariant().StartsWith(cleanSymbolRoot) || (p.Instrument.MasterInstrument != null && string.Equals(p.Instrument.MasterInstrument.Name, cleanSymbolRoot, StringComparison.OrdinalIgnoreCase))))
                ));

                // Fallback de segurança: se houver apenas uma posição aberta na conta, utiliza ela
                if (pos == null && targetAccount.Positions != null)
                {
                    pos = targetAccount.Positions.FirstOrDefault(p => p.MarketPosition != MarketPosition.Flat && Math.Abs(p.Quantity) > 0);
                }

                // 🔒 TRAVA DE RASTREAMENTO: Se a posição não foi encontrada ou estiver Flat, rejeita sem cancelar ordens ativas
                if (pos == null || pos.MarketPosition == MarketPosition.Flat || Math.Abs(pos.Quantity) == 0)
                {
                    Log($"⚠️ [NÍVEIS REJEITADOS]: Nenhuma posição aberta encontrada em {symbolStr} na conta {targetAccount.Name}.");
                    return "{\"success\":false,\"error\":\"Posição não encontrada ou já encerrada no NinjaTrader.\",\"isFlat\":true}";
                }

                double baseEntryPrice = pos.AveragePrice;
                bool isLong = pos.MarketPosition == MarketPosition.Long;
                if (instrument == null) instrument = pos.Instrument;

                if (instrument == null)
                {
                    return "{\"success\":false,\"error\":\"Ativo da posição não identificado no NinjaTrader\"}";
                }

                double tick = (instrument.MasterInstrument != null && instrument.MasterInstrument.TickSize > 0)
                    ? instrument.MasterInstrument.TickSize
                    : 0.25;

                Log($"[MODIFY DEBUG]: isLong={isLong} | baseEntry={baseEntryPrice:F2} | inputSl={inputSl:F2} | inputTp={inputTp:F2} | slPts={stopLossPoints:F2} | tpPts={takeProfitPoints:F2} | isBE={isBreakeven} | currPrice={currentMarketPrice:F2}");

                // 3. Calcula o preço exato de Stop Loss e Take Profit para a conta
                double finalSlPrice = 0;
                double finalTpPrice = 0;

                if (isBreakeven)
                {
                    double off = Math.Abs(offsetPoints);
                    double rawBePrice = isLong ? (baseEntryPrice + off) : (baseEntryPrice - off);

                    // 🛡️ PROTEÇÃO INTELIGENTE DE BREAKEVEN:
                    // Para COMPRA (LONG): StopMarket DEVE estar ESTRITAMENTE ABAIXO do preço atual de mercado (mínimo 2 ticks)
                    // Para VENDA (SHORT): StopMarket DEVE estar ESTRITAMENTE ACIMA do preço atual de mercado (mínimo 2 ticks)
                    if (currentMarketPrice > 0)
                    {
                        if (isLong)
                        {
                            double maxSafeSl = currentMarketPrice - (tick * 2);
                            finalSlPrice = Math.Min(rawBePrice, maxSafeSl);
                        }
                        else
                        {
                            double minSafeSl = currentMarketPrice + (tick * 2);
                            finalSlPrice = Math.Max(rawBePrice, minSafeSl);
                        }
                    }
                    else
                    {
                        finalSlPrice = rawBePrice;
                    }
                }
                else
                {
                    // Cálculo do Stop Loss com suporte completo a Trailing Stop / Stop Gain (acima ou abaixo da entrada)
                    if (inputSl > 0)
                    {
                        if (entryPrice > 0 && baseEntryPrice > 0)
                        {
                            // Distância COM SINAL: preserva se o stop está acima ou abaixo do preço de entrada
                            double slOffset = inputSl - entryPrice;
                            finalSlPrice = baseEntryPrice + slOffset;
                        }
                        else
                        {
                            finalSlPrice = inputSl;
                        }
                    }
                    else if (stopLossPoints > 0 && baseEntryPrice > 0)
                    {
                        finalSlPrice = isLong ? (baseEntryPrice - Math.Abs(stopLossPoints)) : (baseEntryPrice + Math.Abs(stopLossPoints));
                    }

                    // Cálculo do Take Profit com suporte a alvo móvel
                    if (inputTp > 0)
                    {
                        if (entryPrice > 0 && baseEntryPrice > 0)
                        {
                            double tpOffset = inputTp - entryPrice;
                            finalTpPrice = baseEntryPrice + tpOffset;
                        }
                        else
                        {
                            finalTpPrice = inputTp;
                        }
                    }
                    else if (takeProfitPoints > 0 && baseEntryPrice > 0)
                    {
                        finalTpPrice = isLong ? (baseEntryPrice + Math.Abs(takeProfitPoints)) : (baseEntryPrice - Math.Abs(takeProfitPoints));
                    }
                }

                // Arredonda para o múltiplo exato do TickSize do ativo
                if (tick > 0)
                {
                    if (finalSlPrice > 0) finalSlPrice = Math.Round(finalSlPrice / tick) * tick;
                    if (finalTpPrice > 0) finalTpPrice = Math.Round(finalTpPrice / tick) * tick;
                }

                Log($"[MODIFY CALC]: finalSl={finalSlPrice:F2} | finalTp={finalTpPrice:F2}");

                OrderAction exitAction = isLong ? OrderAction.Sell : OrderAction.Buy;

                // Agrupa todas as ordens de SL/TP ativas por OCO ID para gerenciar individualmente cada alvo
                var workingOrdersByOco = new Dictionary<string, List<Order>>();
                if (targetAccount.Orders != null)
                {
                    foreach (var order in targetAccount.Orders)
                    {
                        if (order.Instrument == null) continue;
                        bool matchInst = instrument == null || 
                                         order.Instrument == instrument || 
                                         order.Instrument.FullName == instrument.FullName || 
                                         (order.Instrument.MasterInstrument != null && instrument.MasterInstrument != null && order.Instrument.MasterInstrument.Name == instrument.MasterInstrument.Name);
                        if (!matchInst) continue;

                        if (order.OrderState == OrderState.Working || order.OrderState == OrderState.Accepted)
                        {
                            bool isSl = order.OrderType == OrderType.StopMarket || order.OrderType == OrderType.StopLimit || (!string.IsNullOrEmpty(order.Name) && (order.Name.Contains("SL") || order.Name.Contains("Stop") || order.Name.Contains("Axion_SL")));
                            bool isTp = order.OrderType == OrderType.Limit || (!string.IsNullOrEmpty(order.Name) && (order.Name.Contains("TP") || order.Name.Contains("Target") || order.Name.Contains("Profit") || order.Name.Contains("Axion_TP")));
                            if (isSl || isTp)
                            {
                                string ocoKey = !string.IsNullOrEmpty(order.Oco) ? order.Oco : ("NO_OCO_" + order.OrderId);
                                if (!workingOrdersByOco.ContainsKey(ocoKey))
                                    workingOrdersByOco[ocoKey] = new List<Order>();
                                workingOrdersByOco[ocoKey].Add(order);
                            }
                        }
                    }
                }

                if (workingOrdersByOco.Count == 0)
                {
                    // 🎯 Se a conta possui posição aberta mas nenhuma ordem de SL/TP pendente, cria os níveis de proteção imediatamente
                    if (pos != null && pos.MarketPosition != MarketPosition.Flat && Math.Abs(pos.Quantity) > 0 && (finalSlPrice > 0 || finalTpPrice > 0))
                    {
                        string newOcoId = Guid.NewGuid().ToString("N");
                        int posQty = Math.Abs(pos.Quantity);
                        var createdOrders = new List<Order>();

                        if (finalSlPrice > 0)
                        {
                            Order sl = CreateStealthOrder(targetAccount, instrument, exitAction, OrderType.StopMarket, OrderEntry.Manual, TimeInForce.Gtc, posQty, 0, finalSlPrice, newOcoId, "Axion_SL");
                            RegisterInternalOrder(sl.OrderId);
                            RegisterCopyOrder(sl.OrderId);
                            createdOrders.Add(sl);
                        }

                        if (finalTpPrice > 0)
                        {
                            Order tp = CreateStealthOrder(targetAccount, instrument, exitAction, OrderType.Limit, OrderEntry.Manual, TimeInForce.Gtc, posQty, finalTpPrice, 0, newOcoId, "Axion_TP");
                            RegisterInternalOrder(tp.OrderId);
                            RegisterCopyOrder(tp.OrderId);
                            createdOrders.Add(tp);
                        }

                        if (createdOrders.Count > 0)
                        {
                            StealthSubmit(targetAccount, createdOrders.ToArray());
                            Log($"🎯 [NÍVEIS CRIADOS ⚡]: Níveis de proteção submetidos para {instrument.FullName} na conta {targetAccount.Name} (SL: {finalSlPrice:F2} | TP: {finalTpPrice:F2} | OCO: {newOcoId.Substring(0, 8)})");
                            return $"{{\"success\":true,\"message\":\"Níveis de SL/TP criados com sucesso.\",\"slPrice\":{finalSlPrice.ToString("F2", CultureInfo.InvariantCulture)},\"tpPrice\":{finalTpPrice.ToString("F2", CultureInfo.InvariantCulture)}}}";
                        }
                    }

                    Log($"⚠️ [NÍVEIS]: Nenhuma ordem de SL/TP ativa encontrada para {instrument.FullName} na conta {targetAccount.Name}.");
                    return "{\"success\":false,\"error\":\"Nenhuma ordem pendente encontrada para modificação de níveis\"}";
                }

                // Determina o grupo OCO específico desta operação / alvo
                string targetOcoId = null;

                // 1. Tentar por rastreamento direto do ID da operação
                if (!string.IsNullOrEmpty(orderId) && _reportToOcoMap.TryGetValue(orderId, out string trackedOco) && workingOrdersByOco.ContainsKey(trackedOco))
                {
                    targetOcoId = trackedOco;
                }

                // 2. Se houver apenas 1 grupo OCO, seleciona ele
                if (string.IsNullOrEmpty(targetOcoId) && workingOrdersByOco.Count == 1)
                {
                    targetOcoId = workingOrdersByOco.Keys.First();
                }

                // 3. Se houver múltiplos grupos (ATM 2+ alvos), seleciona o grupo mais próximo do SL/TP anterior ou por quantidade
                if (string.IsNullOrEmpty(targetOcoId) && workingOrdersByOco.Count > 1)
                {
                    double bestDiff = double.MaxValue;
                    foreach (var kvp in workingOrdersByOco)
                    {
                        var candOrders = kvp.Value;
                        var slOrd = candOrders.FirstOrDefault(o => o.OrderType == OrderType.StopMarket || o.OrderType == OrderType.StopLimit || (!string.IsNullOrEmpty(o.Name) && (o.Name.Contains("SL") || o.Name.Contains("Stop"))));
                        var tpOrd = candOrders.FirstOrDefault(o => o.OrderType == OrderType.Limit || (!string.IsNullOrEmpty(o.Name) && (o.Name.Contains("TP") || o.Name.Contains("Target") || o.Name.Contains("Profit"))));

                        double diff = 0;
                        int matches = 0;
                        if (inputSl > 0 && slOrd != null && slOrd.StopPrice > 0)
                        {
                            diff += Math.Abs(slOrd.StopPrice - inputSl);
                            matches++;
                        }
                        if (inputTp > 0 && tpOrd != null && tpOrd.LimitPrice > 0)
                        {
                            diff += Math.Abs(tpOrd.LimitPrice - inputTp);
                            matches++;
                        }
                        if (matches > 0 && diff < bestDiff)
                        {
                            bestDiff = diff;
                            targetOcoId = kvp.Key;
                        }
                    }

                    if (string.IsNullOrEmpty(targetOcoId))
                    {
                        targetOcoId = workingOrdersByOco.FirstOrDefault(kvp => kvp.Value.Any(o => o.Quantity == reqQty)).Key 
                                      ?? workingOrdersByOco.Keys.First();
                    }
                }

                var groupOrders = (!string.IsNullOrEmpty(targetOcoId) && workingOrdersByOco.TryGetValue(targetOcoId, out var grp))
                    ? grp
                    : workingOrdersByOco.First().Value;

                var existingSl = groupOrders.FirstOrDefault(o => o.OrderType == OrderType.StopMarket || o.OrderType == OrderType.StopLimit || (!string.IsNullOrEmpty(o.Name) && (o.Name.Contains("SL") || o.Name.Contains("Stop"))));
                var existingTp = groupOrders.FirstOrDefault(o => o.OrderType == OrderType.Limit || (!string.IsNullOrEmpty(o.Name) && (o.Name.Contains("TP") || o.Name.Contains("Target") || o.Name.Contains("Profit"))));

                // ── ACCOUNT.CHANGE() VIA UI DISPATCHER ──────────────────────────────
                // Account.Cancel() é ASSÍNCRONO no Cbi: as ordens antigas ainda ficam
                // em Working enquanto as novas são submetidas → ordens duplicadas/acumuladas.
                //
                // A solução correta no contexto de AddOn NT8 é chamar Account.Change()
                // DENTRO de Application.Current.Dispatcher.Invoke(), que força a execução
                // na thread UI do WPF onde o gerenciador de ordens do NT8 opera de forma
                // síncrona e atômica.
                // ─────────────────────────────────────────────────────────────────────

                // Fonte de verdade: quantidade REAL da posição aberta no NT8
                int bracketQty = Math.Max(1, pos.Quantity);

                // Preços efetivos: usa o novo calculado, senão preserva o preço atual da ordem
                double effectiveSlPrice = finalSlPrice > 0 ? finalSlPrice : (existingSl != null ? existingSl.StopPrice : 0);
                double effectiveTpPrice = finalTpPrice > 0 ? finalTpPrice : (existingTp != null ? existingTp.LimitPrice : 0);

                bool changeSuccess = false;
                string changeLog = "";

                try
                {
                    Application.Current.Dispatcher.Invoke(() =>
                    {
                        var ordersToChange = new List<Order>();

                        if (existingSl != null && effectiveSlPrice > 0)
                        {
                            bool slNeedsUpdate = Math.Abs(existingSl.StopPrice - effectiveSlPrice) >= (tick / 2.0);
                            if (slNeedsUpdate)
                            {
                                existingSl.StopPriceChanged = effectiveSlPrice;
                                ordersToChange.Add(existingSl);
                            }
                        }

                        if (existingTp != null && effectiveTpPrice > 0)
                        {
                            bool tpNeedsUpdate = Math.Abs(existingTp.LimitPrice - effectiveTpPrice) >= (tick / 2.0);
                            if (tpNeedsUpdate)
                            {
                                existingTp.LimitPriceChanged = effectiveTpPrice;
                                ordersToChange.Add(existingTp);
                            }
                        }

                        if (ordersToChange.Count > 0)
                        {
                            SafeChangeOrders(targetAccount, ordersToChange.ToArray());
                            changeSuccess = true;
                            string actionType = isBreakeven ? "BREAKEVEN 🛡️" : "NÍVEIS ATUALIZADOS 🎯";
                            changeLog = $"[{actionType}]: {instrument.FullName} na conta {targetAccount.Name} | Entrada: {baseEntryPrice:F2} | SL: {effectiveSlPrice:F2} | TP: {effectiveTpPrice:F2}";
                        }
                        else
                        {
                            // Níveis já estão 100% idênticos, não necessita chamar Change() nem gerar eventos no NT8
                            changeSuccess = true;
                            changeLog = $"[NÍVEIS INALTERADOS]: {instrument.FullName} na conta {targetAccount.Name} já possui SL: {effectiveSlPrice:F2} e TP: {effectiveTpPrice:F2}";
                        }
                    });
                }
                catch (Exception dispEx)
                {
                    Log($"[MODIFY DISPATCHER ERROR]: {dispEx.Message}");
                }

                if (changeSuccess)
                {
                    if (!string.IsNullOrEmpty(orderId) && _reportToOcoMap.ContainsKey(orderId))
                    {
                        // Mantém o rastreamento OCO existente (ordens não foram recriadas)
                    }
                    Log(changeLog);
                    return $"{{\"success\":true,\"message\":\"Níveis confirmados\",\"sl\":{effectiveSlPrice.ToString(CultureInfo.InvariantCulture)},\"tp\":{effectiveTpPrice.ToString(CultureInfo.InvariantCulture)}}}";
                }

                return "{\"success\":false,\"error\":\"Nenhuma ordem pendente encontrada para modificação de níveis\"}";

            }
            catch (Exception ex)
            {
                return $"{{\"success\":false,\"error\":\"{ex.Message}\"}}";
            }
        }

        private string FlattenVortexAccount(string body)
        {
            try
            {
                string accountName = ExtractJsonString(body, "account_name") ?? ExtractJsonString(body, "account") ?? "";
                string symbolStr = ExtractJsonString(body, "symbol") ?? "";
                string orderId = ExtractJsonString(body, "id") ?? ExtractJsonString(body, "order_id") ?? "";
                int reqQty = ExtractJsonInt(body, "quantity", 0);
                if (reqQty <= 0) reqQty = ExtractJsonInt(body, "contrato", 0);
                if (reqQty <= 0) reqQty = ExtractJsonInt(body, "contracts", 0);
                if (reqQty <= 0) reqQty = ExtractJsonInt(body, "lots", 0);

                Account targetAccount = null;
                lock (Account.All)
                {
                    if (!string.IsNullOrEmpty(accountName))
                    {
                        targetAccount = Account.All.FirstOrDefault(a => string.Equals(a.Name, accountName, StringComparison.OrdinalIgnoreCase));
                    }
                    if (targetAccount == null)
                    {
                        targetAccount = Account.All.FirstOrDefault(a => a != null && IsAccountReadyForTrading(a)) ?? Account.All.FirstOrDefault();
                    }
                }

                if (targetAccount == null) return "{\"success\":false,\"error\":\"Conta não encontrada no NinjaTrader\"}";

                Instrument instrument = null;
                string cleanSymbolRoot = "";
                if (!string.IsNullOrEmpty(symbolStr))
                {
                    instrument = FindNinjaInstrument(symbolStr, targetAccount) ?? Instrument.GetInstrument(symbolStr) ?? Instrument.GetInstrument(symbolStr.Split(' ')[0]);
                    cleanSymbolRoot = symbolStr.Split(' ')[0].Trim().ToUpperInvariant();
                }

                // 1. LIMPEZA DE PENDING BRACKETS (Evita que ordens de fechamento disparem novos SL/TP)
                var pendingKeysToRemove = _pendingBrackets.Where(kvp => 
                    kvp.Value.Account == targetAccount && 
                    (instrument == null || kvp.Value.Instrument == instrument || kvp.Value.Instrument?.FullName == instrument?.FullName || (!string.IsNullOrEmpty(cleanSymbolRoot) && kvp.Value.Instrument?.FullName?.ToUpperInvariant()?.StartsWith(cleanSymbolRoot) == true))
                ).Select(kvp => kvp.Key).ToList();
                foreach (var k in pendingKeysToRemove) _pendingBrackets.TryRemove(k, out _);

                string actionStr = (ExtractJsonString(body, "action") ?? "").ToLowerInvariant();
                bool isFlatAction = actionStr == "flat" || actionStr == "close_all" || actionStr == "flatten" || actionStr == "zerar";

                // 2. SUPORTE A FECHAMENTO INDIVIDUAL DE ALVO (ATM / Multi-Ordens) APENAS SE NÃO FOR COMANDO DE ZERAGEM GERAL
                if (!isFlatAction && !string.IsNullOrEmpty(orderId) && _reportToOcoMap.TryGetValue(orderId, out string targetOcoId))
                {
                    // Cancelar APENAS as ordens OCO vinculadas a este alvo específico
                    if (targetAccount.Orders != null)
                    {
                        var ocoOrders = targetAccount.Orders.Where(o => 
                            (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted) && 
                            o.Oco == targetOcoId
                        ).ToArray();

                        if (ocoOrders.Length > 0)
                        {
                            SafeCancelOrders(targetAccount, ocoOrders);
                            Log($"[FECHAMENTO ALVO 🎯]: {ocoOrders.Length} ordens OCO canceladas para o alvo {targetOcoId.Substring(0, Math.Min(8, targetOcoId.Length))}");
                        }
                    }

                    int closeTargetQty = reqQty > 0 ? reqQty : 1;
                    if (_activeBrackets.TryRemove(targetOcoId, out BracketDef bDef))
                    {
                        if (reqQty <= 0 && bDef.Quantity > 0) closeTargetQty = bDef.Quantity;
                    }
                    _reportToOcoMap.TryRemove(orderId, out _);

                    // Reduzir da posição no mercado a quantidade específica deste alvo
                    Position posAlvo = targetAccount.Positions.FirstOrDefault(p => p.MarketPosition != MarketPosition.Flat && Math.Abs(p.Quantity) > 0 && (
                        instrument == null || 
                        p.Instrument == instrument || 
                        (p.Instrument != null && instrument != null && (
                            p.Instrument.FullName == instrument.FullName || 
                            (p.Instrument.MasterInstrument != null && instrument.MasterInstrument != null && string.Equals(p.Instrument.MasterInstrument.Name, instrument.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))
                        )) ||
                        (p.Instrument != null && !string.IsNullOrEmpty(cleanSymbolRoot) && (
                            p.Instrument.FullName.ToUpperInvariant().StartsWith(cleanSymbolRoot) || 
                            (p.Instrument.MasterInstrument != null && string.Equals(p.Instrument.MasterInstrument.Name, cleanSymbolRoot, StringComparison.OrdinalIgnoreCase))
                        ))
                    ));

                    if (posAlvo != null && posAlvo.MarketPosition != MarketPosition.Flat && Math.Abs(posAlvo.Quantity) > 0)
                    {
                        OrderAction closeAction = posAlvo.MarketPosition == MarketPosition.Long ? OrderAction.Sell : OrderAction.Buy;
                        int effectiveCloseQty = Math.Min(closeTargetQty, Math.Abs(posAlvo.Quantity));

                        if (effectiveCloseQty > 0)
                        {
                            Order closeOrder = CreateStealthOrder(targetAccount, posAlvo.Instrument, closeAction, OrderType.Market, OrderEntry.Manual, TimeInForce.Gtc, effectiveCloseQty, 0, 0, "", "Close");
                            RegisterInternalOrder(closeOrder.OrderId);
                            StealthSubmit(targetAccount, closeOrder);
                            Log($"[FECHAMENTO ALVO]: Ordem a mercado {closeAction} {effectiveCloseQty}x enviada para reduzir {posAlvo.Instrument.FullName} na conta {targetAccount.Name}");
                        }
                    }

                    return $"{{\"success\":true,\"message\":\"Alvo individual encerrado com sucesso\",\"orderId\":\"{orderId}\"}}";
                }

                // 3. FECHAMENTO GERAL (ZERAGEM TOTAL DA CONTA / ATIVO)
                MarkAccountFlattening(targetAccount.Name, 5000);

                var slaveRules = _copyRules.Values.Where(r => r.IsActive && string.Equals(r.MasterAccountName, targetAccount.Name, StringComparison.OrdinalIgnoreCase)).ToList();
                var cascadedSlaveAccounts = new List<Account>();
                foreach (var rule in slaveRules)
                {
                    if (string.Equals(rule.SlaveAccountName, targetAccount.Name, StringComparison.OrdinalIgnoreCase)) continue;
                    MarkAccountFlattening(rule.SlaveAccountName, 5000);
                    Account slaveAcc = null;
                    lock (Account.All)
                    {
                        slaveAcc = Account.All.FirstOrDefault(a => a != null && string.Equals(a.Name, rule.SlaveAccountName, StringComparison.OrdinalIgnoreCase));
                    }
                    if (slaveAcc != null && IsAccountReadyForTrading(slaveAcc))
                    {
                        cascadedSlaveAccounts.Add(slaveAcc);
                    }
                }

                // Cancela todas as ordens pendentes
                CancelarOrdensPendentes(targetAccount);

                // Limpa apenas os mapas OCO desta conta específica (evita limpar dicionários globais de outras contas)
                var ocoKeysToRemove = _activeBrackets.Where(kvp => kvp.Value.Account == targetAccount).Select(kvp => kvp.Key).ToList();
                foreach (var k in ocoKeysToRemove) _activeBrackets.TryRemove(k, out _);
                var reportKeysToRemove = _reportToOcoMap.Where(kvp => ocoKeysToRemove.Contains(kvp.Value)).Select(kvp => kvp.Key).ToList();
                foreach (var k in reportKeysToRemove) _reportToOcoMap.TryRemove(k, out _);

                // Identifica todas as posições abertas não-flat
                var positionsToClose = targetAccount.Positions.Where(p => p.MarketPosition != MarketPosition.Flat && Math.Abs(p.Quantity) > 0 && (
                    string.IsNullOrEmpty(symbolStr) || 
                    instrument == null || 
                    p.Instrument == instrument || 
                    (p.Instrument != null && instrument != null && (
                        p.Instrument.FullName == instrument.FullName || 
                        (p.Instrument.MasterInstrument != null && instrument.MasterInstrument != null && string.Equals(p.Instrument.MasterInstrument.Name, instrument.MasterInstrument.Name, StringComparison.OrdinalIgnoreCase))
                    )) ||
                    (p.Instrument != null && !string.IsNullOrEmpty(cleanSymbolRoot) && (
                        p.Instrument.FullName.ToUpperInvariant().StartsWith(cleanSymbolRoot) || 
                        (p.Instrument.MasterInstrument != null && string.Equals(p.Instrument.MasterInstrument.Name, cleanSymbolRoot, StringComparison.OrdinalIgnoreCase))
                    ))
                )).ToList();

                // FALLBACK DE SEGURANÇA: Se não encontrou pelo filtro de símbolo mas a conta possui posições abertas não-flat
                if (positionsToClose.Count == 0 && targetAccount.Positions != null)
                {
                    positionsToClose = targetAccount.Positions.Where(p => p.MarketPosition != MarketPosition.Flat && Math.Abs(p.Quantity) > 0).ToList();
                }

                if (positionsToClose.Count > 0)
                {
                    foreach (var pos in positionsToClose)
                    {
                        if (pos.Instrument != null && pos.MarketPosition != MarketPosition.Flat && Math.Abs(pos.Quantity) > 0)
                        {
                            OrderAction closeAction = pos.MarketPosition == MarketPosition.Long ? OrderAction.Sell : OrderAction.Buy;
                            int closeQty = Math.Abs(pos.Quantity);

                            if (SafeSubmitCloseOrder(targetAccount, pos.Instrument, closeAction, closeQty, "Close"))
                            {
                                Log($"[ZERAGEM]: Ordem {closeAction} {closeQty}x a mercado enviada para fechar {pos.Instrument.FullName} ({pos.MarketPosition}) na conta {targetAccount.Name}");
                            }
                        }
                    }
                }
                else
                {
                    Log($"ℹ️ [ZERAGEM]: Conta {targetAccount.Name} já está FLAT (nenhuma posição aberta para fechar).");
                }

                // 4. CASCADE PARA SLAVES (Se a conta que foi zerada for Master em regras de Copy Trading ativas)
                foreach (var slaveAcc in cascadedSlaveAccounts)
                {
                    try
                    {
                        CancelarOrdensPendentes(slaveAcc);
                        FecharTodasPosicoesDaConta(slaveAcc);
                        Log($"⚡⚡ [CASCADE ZERAGEM SLAVE]: Posições da Slave {slaveAcc.Name} encerradas e ordens canceladas acompanhando Master {targetAccount.Name}");
                    }
                    catch (Exception slaveEx)
                    {
                        Log($"[ERRO CASCADE SLAVE]: {slaveEx.Message}");
                    }
                }

                // Varredura assíncrona pós-zeragem para garantir limpeza de qualquer SL/TP residual que estivesse em transição
                var accountsToSweep = new List<Account> { targetAccount };
                accountsToSweep.AddRange(cascadedSlaveAccounts);
                Task.Run(async () =>
                {
                    foreach (int delayMs in new[] { 180, 500, 1200 })
                    {
                        await Task.Delay(delayMs);
                        foreach (var acc in accountsToSweep)
                        {
                            try { CancelarOrdensPendentes(acc); } catch { }
                        }
                    }
                });

                return "{\"success\":true,\"message\":\"Posições zeradas e ordens canceladas com sucesso\"}";
            }
            catch (Exception ex)
            {
                Log($"[ERRO ZERAGEM]: {ex.Message}");
                return $"{{\"success\":false,\"error\":\"{ex.Message}\"}}";
            }
        }

        private string CancelVortexOrder(string body)
        {
            try
            {
                string orderId = ExtractJsonString(body, "order_id") ?? ExtractJsonString(body, "orderId") ?? ExtractJsonString(body, "id") ?? "";
                string accountName = ExtractJsonString(body, "account_name") ?? ExtractJsonString(body, "account") ?? "";

                int cancelledCount = 0;
                lock (Account.All)
                {
                    var accounts = Account.All.Where(a => string.IsNullOrEmpty(accountName) || string.Equals(a.Name, accountName, StringComparison.OrdinalIgnoreCase)).ToList();
                    foreach (var acc in accounts)
                    {
                        if (acc.Orders == null) continue;
                        var toCancel = acc.Orders.Where(o => 
                            (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted || o.OrderState == OrderState.Submitted) &&
                            (string.IsNullOrEmpty(orderId) || string.Equals(o.Id.ToString(), orderId, StringComparison.OrdinalIgnoreCase) || string.Equals(o.Oco, orderId, StringComparison.OrdinalIgnoreCase))
                        ).ToArray();

                        if (toCancel.Length > 0)
                        {
                            SafeCancelOrders(acc, toCancel);
                            cancelledCount += toCancel.Length;
                            Log($"[CANCEL ORDEM]: {toCancel.Length} ordens canceladas na conta {acc.Name}");
                        }
                    }
                }

                return $"{{\"success\":true,\"cancelled\":{cancelledCount}}}";
            }
            catch (Exception ex)
            {
                Log($"[ERRO CANCEL ORDEM]: {ex.Message}");
                return $"{{\"success\":false,\"error\":\"{ex.Message}\"}}";
            }
        }

        public static string FlattenAllAccounts()
        {
            try
            {
                int count = 0;
                List<Account> targetAccounts = null;
                lock (Account.All)
                {
                    targetAccounts = Account.All.Where(a => a != null && IsAccountReadyForTrading(a)).ToList();
                }

                if (targetAccounts != null)
                {
                    // 1. Marca TODAS as contas em modo de zeragem ANTES de disparar ordens para impedir qualquer eco/cópia cruzada
                    foreach (var acc in targetAccounts)
                    {
                        if (acc != null) MarkAccountFlattening(acc.Name, 5500);
                    }

                    _activeBrackets.Clear();
                    _reportToOcoMap.Clear();
                    _pendingBrackets.Clear();
                    _masterToSlaveOrderIdMap.Clear();
                    _lastReportedMasterLevels.Clear();

                    foreach (var acc in targetAccounts)
                    {
                        try
                        {
                            EnsureAccountSubscribed(acc);
                            CancelarOrdensPendentes(acc);
                            FecharTodasPosicoesDaConta(acc);
                            count++;
                        }
                        catch (Exception accEx)
                        {
                            Log($"[ERRO AO ZERAR CONTA {acc?.Name}]: {accEx.Message}");
                        }
                    }

                    var sweepAccounts = targetAccounts.ToList();
                    Task.Run(async () =>
                    {
                        foreach (int delayMs in new[] { 200, 600, 1400 })
                        {
                            await Task.Delay(delayMs);
                            foreach (var acc in sweepAccounts)
                            {
                                try { CancelarOrdensPendentes(acc); } catch { }
                            }
                        }
                    });
                }

                Log($"[PANIC FLATTEN ALL]: Zeradas todas as posições e canceladas todas as ordens de {count} contas.");
                return $"{{\"success\":true,\"message\":\"Todas as contas foram zeradas com sucesso\",\"accountsAffected\":{count}}}";
            }
            catch (Exception ex)
            {
                Log($"[ERRO FLATTEN ALL]: {ex.Message}");
                return $"{{\"success\":false,\"error\":\"{ex.Message}\"}}";
            }
        }

        private static string ExtractJsonString(string json, string key)
        {
            var match = Regex.Match(json, $"\"{key}\"\\s*:\\s*\"([^\"]*)\"");
            return match.Success ? match.Groups[1].Value : null;
        }
        private static bool ExtractJsonBool(string json, string key, bool def)
        {
            var match = Regex.Match(json, $"\"{key}\"\\s*:\\s*(true|false)", RegexOptions.IgnoreCase);
            return match.Success ? bool.Parse(match.Groups[1].Value) : def;
        }
        private static int ExtractJsonInt(string json, string key, int def)
        {
            var match = Regex.Match(json, $"\"{key}\"\\s*:\\s*(\\d+)");
            return match.Success ? int.Parse(match.Groups[1].Value) : def;
        }
        private static double ExtractJsonDouble(string json, string key, double def)
        {
            var match = Regex.Match(json, $"\"{key}\"\\s*:\\s*([0-9.]+)");
            return match.Success ? double.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture) : def;
        }

        #endregion

        #region Interface Visual Integrada (Menu Control Center & Atalho Ctrl+Shift+A)

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
                        MenuItem mi = item as MenuItem;
                        if (mi != null)
                        {
                            string headerStr = mi.Header?.ToString() ?? "";
                            if (headerStr.IndexOf("New", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                headerStr.IndexOf("Novo", StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                _menuItem = new NTMenuItem
                                {
                                    Header = "⚡ Axion Gateway V2 (Ctrl+Shift+A)",
                                    InputGestureText = "Ctrl+Shift+A",
                                    Foreground = Brushes.DeepSkyBlue
                                };
                                _menuItem.Click += (sender, e) => OpenStatusWindow();
                                mi.Items.Add(_menuItem);
                                break;
                            }
                        }
                    }
                }

                cc.PreviewKeyDown += (sender, e) =>
                {
                    if (Keyboard.Modifiers == (ModifierKeys.Control | ModifierKeys.Shift) && (e.Key == Key.A || e.Key == Key.V))
                    {
                        OpenStatusWindow();
                        e.Handled = true;
                    }
                };
            }
            catch { }
        }

        protected override void OnWindowCreated(Window window)
        {
            if (window is ControlCenter cc) AttachToControlCenter(cc);
        }

        public static void OpenStatusWindow()
        {
            try
            {
                if (_statusWindowInstance != null && _statusWindowInstance.IsLoaded)
                {
                    _statusWindowInstance.Activate();
                    return;
                }

                _statusWindowInstance = new AxionGatewayWindow();
                _statusWindowInstance.Closed += (s, e) => { _statusWindowInstance = null; };
                _statusWindowInstance.Show();
            }
            catch { }
        }

        #endregion
    }

    // =========================================================================
    // 3.5. TÚNEL DE SINCRONIZAÇÃO EM NUVEM (SUPABASE REALTIME BROADCAST)
    // =========================================================================
    public static class VortexCloudTunnelClient
    {
        private static ClientWebSocket _activeSocket = null;
        private static CancellationTokenSource _cts = null;
        private static int _sessionId = 0;
        private static readonly SemaphoreSlim _sendLock = new SemaphoreSlim(1, 1);

        public static bool IsConnected { get; private set; } = false;
        public static string StatusMessage { get; private set; } = "Desconectado";
        public static event Action OnStatusChanged;

        private static void UpdateStatus(int sessionId, bool connected, string message)
        {
            if (sessionId != Volatile.Read(ref _sessionId)) return;
            IsConnected = connected;
            StatusMessage = message;
            try
            {
                OnStatusChanged?.Invoke();
            }
            catch { }
        }

        public static void Start()
        {
            int newSession = Interlocked.Increment(ref _sessionId);
            CleanupOldSocket();

            if (!AxionGatewayState.HabilitarNuvemBroadcast)
            {
                UpdateStatus(newSession, false, "Nuvem Desativada");
                return;
            }

            string token = (AxionGatewayState.NuvemPairingToken ?? "").Trim();
            if (string.IsNullOrEmpty(token))
            {
                UpdateStatus(newSession, false, "Aguardando Token de Pareamento");
                return;
            }

            var cts = new CancellationTokenSource();
            _cts = cts;
            UpdateStatus(newSession, false, "Conectando ao Túnel...");
            Task.Run(() => ConnectionLoopAsync(newSession, cts.Token));
        }

        public static void Stop()
        {
            int newSession = Interlocked.Increment(ref _sessionId);
            CleanupOldSocket();
            UpdateStatus(newSession, false, AxionGatewayState.HabilitarNuvemBroadcast ? "Desconectado" : "Nuvem Desativada");
        }

        private static void CleanupOldSocket()
        {
            var oldCts = Interlocked.Exchange(ref _cts, null);
            var oldWs = Interlocked.Exchange(ref _activeSocket, null);
            try { oldCts?.Cancel(); } catch { }
            try { oldWs?.Abort(); } catch { }
            try { oldWs?.Dispose(); } catch { }
        }

        private static async Task ConnectionLoopAsync(int sessionId, CancellationToken token)
        {
            while (!token.IsCancellationRequested && sessionId == Volatile.Read(ref _sessionId))
            {
                ClientWebSocket ws = null;
                try
                {
                    string pairingToken = (AxionGatewayState.NuvemPairingToken ?? "").Trim();
                    if (string.IsNullOrEmpty(pairingToken))
                    {
                        UpdateStatus(sessionId, false, "Token de Pareamento Ausente");
                        await Task.Delay(3000, token).ConfigureAwait(false);
                        continue;
                    }

                    string rawUrl = (AxionGatewayState.NuvemSupabaseUrl ?? "ws://144.126.141.254/ws").Trim();
                    string wsUrl = rawUrl;
                    if (wsUrl.Contains("db.vemviraramesa.com.br") || string.IsNullOrEmpty(wsUrl))
                    {
                        wsUrl = "ws://144.126.141.254/ws";
                    }
                    else if (!wsUrl.StartsWith("ws://", StringComparison.OrdinalIgnoreCase) && !wsUrl.StartsWith("wss://", StringComparison.OrdinalIgnoreCase))
                    {
                        string wsScheme = wsUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ? "wss://" : "ws://";
                        string hostPort = Regex.Replace(wsUrl, @"^https?:\/\/", "", RegexOptions.IgnoreCase).TrimEnd('/');
                        wsUrl = hostPort.Contains("/ws") ? $"{wsScheme}{hostPort}" : $"{wsScheme}{hostPort}/ws";
                    }

                    UpdateStatus(sessionId, false, "Conectando ao Túnel...");
                    ws = new ClientWebSocket();
                    ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(15);
                    _activeSocket = ws;

                    using (var connectTimeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(10)))
                    using (var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(token, connectTimeoutCts.Token))
                    {
                        await ws.ConnectAsync(new Uri(wsUrl), linkedCts.Token).ConfigureAwait(false);
                    }

                    if (sessionId != Volatile.Read(ref _sessionId) || token.IsCancellationRequested)
                        break;

                    if (ws.State != WebSocketState.Open)
                    {
                        throw new Exception($"Estado de conexão inválido: {ws.State}");
                    }

                    // Registra o NinjaTrader 8 como o nó mestre deste Token no Hub
                    string regPayload = $"{{\"type\":\"tunnel_register\",\"role\":\"nt8\",\"token\":\"{pairingToken}\"}}";
                    await SendTextAsync(ws, regPayload, token).ConfigureAwait(false);

                    UpdateStatus(sessionId, true, $"Online (Canal: {pairingToken})");
                    AxionGatewayAddOn.Log($"🌐 [TÚNEL HUB]: Conectado ao Relay Hub! Token: {pairingToken}");

                    using (var connCts = CancellationTokenSource.CreateLinkedTokenSource(token))
                    {
                        CancellationToken connToken = connCts.Token;
                        ClientWebSocket currentWs = ws;

                        // Task de Heartbeat simples a cada 12s (cancelada imediatamente quando a conexão cai)
                        var heartbeatTask = Task.Run(async () =>
                        {
                            while (!connToken.IsCancellationRequested && currentWs != null && currentWs.State == WebSocketState.Open && sessionId == Volatile.Read(ref _sessionId))
                            {
                                try
                                {
                                    await Task.Delay(12000, connToken).ConfigureAwait(false);
                                    if (currentWs != null && currentWs.State == WebSocketState.Open && !connToken.IsCancellationRequested && sessionId == Volatile.Read(ref _sessionId))
                                    {
                                        string hb = $"{{\"type\":\"ping\",\"token\":\"{pairingToken}\"}}";
                                        await SendTextAsync(currentWs, hb, connToken).ConfigureAwait(false);
                                    }
                                }
                                catch { break; }
                            }
                        }, connToken);

                        // Loop de Recebimento de Mensagens
                        var buffer = new byte[16384];
                        var ms = new MemoryStream();

                        while (!connToken.IsCancellationRequested && ws.State == WebSocketState.Open && sessionId == Volatile.Read(ref _sessionId))
                        {
                            WebSocketReceiveResult result;
                            ms.SetLength(0);
                            do
                            {
                                result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), connToken).ConfigureAwait(false);
                                if (result.MessageType == WebSocketMessageType.Close)
                                {
                                    break;
                                }
                                ms.Write(buffer, 0, result.Count);
                            }
                            while (!result.EndOfMessage);

                            if (result.MessageType == WebSocketMessageType.Close)
                            {
                                break;
                            }

                            if (ms.Length > 0)
                            {
                                string rawJson = Encoding.UTF8.GetString(ms.ToArray());
                                _ = Task.Run(() => ProcessIncomingMessage(sessionId, currentWs, rawJson, pairingToken, connToken), connToken);
                            }
                        }

                        try { connCts.Cancel(); } catch { }
                    }
                }
                catch (OperationCanceledException)
                {
                    if (token.IsCancellationRequested || sessionId != Volatile.Read(ref _sessionId))
                        break;
                    UpdateStatus(sessionId, false, "Timeout ao conectar. Reconectando...");
                }
                catch (Exception ex)
                {
                    if (token.IsCancellationRequested || sessionId != Volatile.Read(ref _sessionId))
                        break;
                    UpdateStatus(sessionId, false, $"Reconectando ({ex.Message})...");
                    AxionGatewayAddOn.Log($"⚠️ [NUVEM TÚNEL]: Queda de conexão ({ex.Message}). Reconectando em 3s...");
                }
                finally
                {
                    try { ws?.Abort(); } catch { }
                    try { ws?.Dispose(); } catch { }
                    Interlocked.CompareExchange(ref _activeSocket, null, ws);
                }

                if (!token.IsCancellationRequested && sessionId == Volatile.Read(ref _sessionId))
                {
                    try { await Task.Delay(3000, token).ConfigureAwait(false); } catch { break; }
                }
            }

            UpdateStatus(sessionId, false, "Desconectado");
        }

        private static async Task SendTextAsync(ClientWebSocket ws, string text, CancellationToken token)
        {
            if (ws == null || ws.State != WebSocketState.Open || token.IsCancellationRequested) return;

            try
            {
                await _sendLock.WaitAsync(token).ConfigureAwait(false);
            }
            catch
            {
                return;
            }

            try
            {
                if (ws != null && ws.State == WebSocketState.Open && !token.IsCancellationRequested)
                {
                    byte[] bytes = Encoding.UTF8.GetBytes(text);
                    await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, token).ConfigureAwait(false);
                }
            }
            catch (Exception ex)
            {
                AxionGatewayAddOn.Log($"[TÚNEL WS SEND]: {ex.Message}");
            }
            finally
            {
                try { _sendLock.Release(); } catch { }
            }
        }

        private static async Task ProcessIncomingMessage(int sessionId, ClientWebSocket ws, string rawJson, string pairingToken, CancellationToken token)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(rawJson) || sessionId != Volatile.Read(ref _sessionId)) return;

                if (rawJson.Contains("\"tunnel_ack\"") || rawJson.Contains("\"tunnel_status\"") || rawJson.Contains("\"pong\""))
                {
                    UpdateStatus(sessionId, true, $"Online (Canal: {pairingToken})");
                    return;
                }

                if (!rawJson.Contains("\"vortex_cmd\""))
                    return;

                ExtractCommand(rawJson, out string requestId, out string action, out string innerPayload);
                if (string.IsNullOrEmpty(action)) return;

                // Executa a ação pelo despachante do Gateway
                string resultJson = AxionGatewayAddOn.DispatchGatewayAction(action, innerPayload);

                // Envia a resposta de volta ao canal de broadcast
                string safeResponse = (string.IsNullOrWhiteSpace(resultJson) || (!resultJson.TrimStart().StartsWith("{") && !resultJson.TrimStart().StartsWith("[")))
                    ? $"\"{EscapeJsonString(resultJson)}\""
                    : resultJson;

                string responseBroadcast = $"{{\"type\":\"vortex_resp\",\"token\":\"{pairingToken}\",\"id\":\"{requestId}\",\"action\":\"{action}\",\"response\":{safeResponse}}}";

                if (ws != null && ws.State == WebSocketState.Open && sessionId == Volatile.Read(ref _sessionId))
                {
                    await SendTextAsync(ws, responseBroadcast, token).ConfigureAwait(false);
                }
            }
            catch (Exception ex)
            {
                AxionGatewayAddOn.Log($"[ERRO PROCESSAMENTO TÚNEL]: {ex.Message}");
            }
        }

        private static void ExtractCommand(string json, out string id, out string action, out string payload)
        {
            id = Guid.NewGuid().ToString("N");
            action = "";
            payload = "";

            try
            {
                var matchId = Regex.Match(json, "\"id\"\\s*:\\s*\"([^\"]*)\"");
                if (matchId.Success) id = matchId.Groups[1].Value;

                var matchAct = Regex.Match(json, "\"action\"\\s*:\\s*\"([^\"]*)\"");
                if (matchAct.Success) action = matchAct.Groups[1].Value;

                int actIdx = json.IndexOf("\"action\"", StringComparison.OrdinalIgnoreCase);
                if (actIdx >= 0)
                {
                    int pIdx = json.IndexOf("\"payload\"", actIdx, StringComparison.OrdinalIgnoreCase);
                    if (pIdx >= 0)
                    {
                        int colon = json.IndexOf(':', pIdx);
                        if (colon >= 0)
                        {
                            int start = colon + 1;
                            while (start < json.Length && char.IsWhiteSpace(json[start])) start++;
                            if (start < json.Length)
                            {
                                if (json[start] == '"')
                                {
                                    int endQuote = start + 1;
                                    while (endQuote < json.Length)
                                    {
                                        if (json[endQuote] == '"' && json[endQuote - 1] != '\\') break;
                                        endQuote++;
                                    }
                                    if (endQuote < json.Length)
                                    {
                                        payload = json.Substring(start + 1, endQuote - start - 1)
                                            .Replace("\\\"", "\"").Replace("\\\\", "\\");
                                    }
                                }
                                else if (json[start] == '{' || json[start] == '[')
                                {
                                    char open = json[start];
                                    char close = open == '{' ? '}' : ']';
                                    int depth = 0;
                                    bool inStr = false;
                                    for (int i = start; i < json.Length; i++)
                                    {
                                        if (json[i] == '"' && (i == 0 || json[i - 1] != '\\'))
                                            inStr = !inStr;
                                        else if (!inStr)
                                        {
                                            if (json[i] == open) depth++;
                                            else if (json[i] == close)
                                            {
                                                depth--;
                                                if (depth == 0)
                                                {
                                                    payload = json.Substring(start, i - start + 1);
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            catch { }
        }

        private static string EscapeJsonString(string s) => (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
    }

    // =========================================================================
    // 4. JANELA VISUAL EM ABAS (WPF / NTWindow)
    // =========================================================================
    public class AxionGatewayWindow : NTWindow
    {
        private TextBox txtBotToken, txtChatId, txtTitulo, txtHorario1, txtHorario2;
        private ComboBox cmbIntervalo, cmbModoContas;
        private ListBox listContas;
        private CheckBox chkAbertura, chkResultado, chkMonitorarOrdens, chkNotificarConexao, chkRelatorioPeriodico;
        private TextBox txtLogs;
        private StackPanel _riskCardsPanel;
        private StackPanel _copyRulesPanel;
        private StackPanel _openPositionsPanel;
        private TextBlock _txtTotalPosicoesInfo;
        private TextBlock _txtTotalOpenPnL;
        private DispatcherTimer _positionsTimer;
        private CheckBox chkHabilitarNuvem;
        private TextBox txtNuvemToken;
        private TextBlock lblNuvemStatus;
        private Action _nuvemStatusHandler;

        public AxionGatewayWindow()
        {
            Title = "⚡ Axion Gateway V2 — Conector Local, Telegram & Gestão de Risco";
            Width = 680;
            Height = 720;
            MinWidth = 560;
            MinHeight = 520;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            Background = new SolidColorBrush(Color.FromRgb(11, 14, 20));
            Foreground = Brushes.White;

            var tabControl = new TabControl
            {
                Background = new SolidColorBrush(Color.FromRgb(15, 23, 42)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                Foreground = Brushes.White,
                Margin = new Thickness(10)
            };

            // Aba 1: Gateway & Conexão
            tabControl.Items.Add(new TabItem { Header = "⚡ Gateway", Content = CreateGatewayTab() });

            // Aba 2: Copy Trading NT8 ➔ NT8
            tabControl.Items.Add(new TabItem { Header = "🔄 Copy Trading", Content = CreateCopyTradingTab() });

            // Aba 3: Posições Abertas (Síntese Multi-Contas com PnL e Zeragem)
            tabControl.Items.Add(new TabItem { Header = "🎯 Posições Abertas", Content = CreatePosicoesTab() });

            // Aba 4: Gestão de Risco
            tabControl.Items.Add(new TabItem { Header = "🛡️ Gestão de Risco", Content = CreateRiscoTab() });

            // Aba 5: Telegram Bot
            tabControl.Items.Add(new TabItem { Header = "📱 Telegram", Content = CreateTelegramTab() });

            // Aba 6: Relatórios Periódicos
            tabControl.Items.Add(new TabItem { Header = "📊 Relatórios", Content = CreateRelatoriosTab() });

            // Aba 7: Logs & Auditoria
            tabControl.Items.Add(new TabItem { Header = "📜 Logs", Content = CreateLogsTab() });

            // Aba 8: Sobre a Empresa & Licença
            tabControl.Items.Add(new TabItem { Header = "🏢 Sobre & Licença", Content = CreateAboutLicenseTab() });

            tabControl.SelectionChanged += (s, e) =>
            {
                if (e.Source is TabControl)
                {
                    RefreshOpenPositionsCards();
                    RefreshCopyRulesCards();
                    RefreshRiskCards();
                }
            };

            Content = tabControl;

            Loaded += (s, e) =>
            {
                try
                {
                    RefreshOpenPositionsCards();
                    RefreshCopyRulesCards();
                    RefreshRiskCards();
                }
                catch { }
            };

            // Timer para atualização periódica (1s) das posições e PnL em tempo real
            _positionsTimer = new DispatcherTimer();
            _positionsTimer.Interval = TimeSpan.FromSeconds(1);
            _positionsTimer.Tick += (s, e) =>
            {
                try
                {
                    if (IsLoaded && IsVisible)
                    {
                        RefreshOpenPositionsCards();
                    }
                }
                catch { }
            };
            _positionsTimer.Start();

            AxionGatewayAddOn.RegisterLogger(msg =>
            {
                Dispatcher.InvokeAsync(() =>
                {
                    if (txtLogs != null)
                    {
                        txtLogs.AppendText(msg + Environment.NewLine);
                        txtLogs.ScrollToEnd();
                    }
                });
            });

            Closed += (s, e) =>
            {
                if (_positionsTimer != null)
                {
                    _positionsTimer.Stop();
                    _positionsTimer = null;
                }
                AxionGatewayAddOn.UnregisterLogger();
                if (_nuvemStatusHandler != null)
                {
                    VortexCloudTunnelClient.OnStatusChanged -= _nuvemStatusHandler;
                    _nuvemStatusHandler = null;
                }
            };
        }

        public void ExecutePanicCloseWithConfirmation()
        {
            var res = MessageBox.Show(
                "⚠️ ATENÇÃO: TEM CERTEZA QUE DESEJA EXECUTAR O FECHAMENTO TOTAL?\n\nTodas as posições abertas de TODAS as contas conectadas serão zeradas imediatamente a mercado e todas as ordens pendentes serão canceladas!",
                "Confirmação — Fechamento Total",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning
            );
            if (res == MessageBoxResult.Yes)
            {
                AxionGatewayAddOn.FlattenAllAccounts();
                RefreshRiskCards();
                RefreshCopyRulesCards();
                RefreshOpenPositionsCards();
                MessageBox.Show("Todas as contas foram zeradas e ordens canceladas com sucesso.", "Fechamento Concluído", MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }

        private UIElement CreateGatewayTab()
        {
            var scroll = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
            var stack = new StackPanel { Margin = new Thickness(15) };

            int totalContasConectadas = 0;
            try
            {
                lock (Account.All)
                {
                    totalContasConectadas = Account.All.Count(a => a != null && a.Connection != null && a.Connection.Status == ConnectionStatus.Connected);
                }
            }
            catch { }

            // 1. Banner Servidor Local
            var banner = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(16, 185, 129)),
                CornerRadius = new CornerRadius(6),
                Padding = new Thickness(12, 10, 12, 10),
                Margin = new Thickness(0, 0, 0, 12)
            };
            banner.Child = new TextBlock
            {
                Text = $"● SERVIDOR LOCAL ONLINE (:8001 ATIVO | {totalContasConectadas} Contas Conectadas)",
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                FontSize = 12
            };
            stack.Children.Add(banner);

            // 2. Lista de Contas
            var titleBlock = new TextBlock
            {
                Text = "Contas Conectadas no NinjaTrader 8:",
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 0, 0, 6),
                Foreground = new SolidColorBrush(Color.FromRgb(56, 189, 248))
            };
            stack.Children.Add(titleBlock);

            var list = new ListBox
            {
                Background = new SolidColorBrush(Color.FromRgb(19, 27, 46)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                Foreground = Brushes.White,
                FontFamily = new FontFamily("Consolas"),
                FontSize = 12,
                Height = 130,
                Margin = new Thickness(0, 0, 0, 10)
            };
            ScrollViewer.SetVerticalScrollBarVisibility(list, ScrollBarVisibility.Auto);
            ScrollViewer.SetHorizontalScrollBarVisibility(list, ScrollBarVisibility.Disabled);

            lock (Account.All)
            {
                int countAdded = 0;
                foreach (var acc in Account.All)
                {
                    if (acc == null) continue;
                    bool isConn = acc.Connection != null && acc.Connection.Status == ConnectionStatus.Connected;
                    if (!isConn) continue;

                    double cash = 0, realized = 0;
                    try { cash = acc.Get(AccountItem.CashValue, Currency.UsDollar); } catch { }
                    try { realized = acc.Get(AccountItem.RealizedProfitLoss, Currency.UsDollar); } catch { }
                    list.Items.Add($"🟢 {acc.Name.PadRight(18)} Saldo: ${cash:N2} | PnL: ${realized:N2}");
                    countAdded++;
                }

                if (countAdded == 0)
                {
                    list.Items.Add("⚠️ Nenhuma conta com conexão ativa no momento.");
                }
            }
            stack.Children.Add(list);

            // 3. Botão Teste Conexão Local
            var btnTest = new Button
            {
                Content = "⚡ Testar Conexão Local (:8001)",
                Background = new SolidColorBrush(Color.FromRgb(2, 132, 199)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.Bold,
                Padding = new Thickness(12, 8, 12, 8),
                Margin = new Thickness(0, 0, 0, 16),
                Cursor = Cursors.Hand
            };
            btnTest.Click += async (s, e) =>
            {
                try
                {
                    using (var wc = new WebClient())
                    {
                        string resp = await wc.DownloadStringTaskAsync("http://localhost:8001/status");
                        MessageBox.Show($"Conexão Local OK!\n\n{resp}", "Axion Gateway V2", MessageBoxButton.OK, MessageBoxImage.Information);
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Erro de Conexão: {ex.Message}", "Erro", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            };
            stack.Children.Add(btnTest);

            // 4. Card Sincronização em Nuvem (Supabase Broadcast / Tunnel)
            var cloudCard = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(15, 23, 42)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(56, 189, 248)),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(14),
                Margin = new Thickness(0, 0, 0, 10)
            };

            var cloudStack = new StackPanel();

            var cloudHeader = new TextBlock
            {
                Text = "🌐 Sincronização em Nuvem (Tunnel / Supabase Broadcast)",
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(56, 189, 248)),
                FontSize = 13,
                Margin = new Thickness(0, 0, 0, 4)
            };
            cloudStack.Children.Add(cloudHeader);

            var cloudDesc = new TextBlock
            {
                Text = "Permite sincronizar contas e enviar ordens do Painel VortexWeb na nuvem diretamente ao NinjaTrader sem precisar de Tailscale, VPN ou IP público. Utiliza canal reverso seguro.",
                TextWrapping = TextWrapping.Wrap,
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                FontSize = 11,
                Margin = new Thickness(0, 0, 0, 10)
            };
            cloudStack.Children.Add(cloudDesc);

            chkHabilitarNuvem = new CheckBox
            {
                Content = "Ativar Túnel Broadcast em Nuvem",
                IsChecked = AxionGatewayState.HabilitarNuvemBroadcast,
                Foreground = Brushes.White,
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 0, 0, 10)
            };
            cloudStack.Children.Add(chkHabilitarNuvem);

            var lblTokenTitle = new TextBlock
            {
                Text = "Token de Pareamento (Pairing Token):",
                FontWeight = FontWeights.SemiBold,
                Foreground = Brushes.White,
                FontSize = 11,
                Margin = new Thickness(0, 0, 0, 3)
            };
            cloudStack.Children.Add(lblTokenTitle);

            txtNuvemToken = new TextBox
            {
                Text = AxionGatewayState.NuvemPairingToken ?? "",
                Background = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                Foreground = Brushes.White,
                BorderBrush = new SolidColorBrush(Color.FromRgb(51, 65, 85)),
                Padding = new Thickness(8, 6, 8, 6),
                FontFamily = new FontFamily("Consolas"),
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 10)
            };
            cloudStack.Children.Add(txtNuvemToken);

            var statusPanel = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 12) };
            statusPanel.Children.Add(new TextBlock
            {
                Text = "Status do Túnel: ",
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                FontSize = 11
            });

            lblNuvemStatus = new TextBlock
            {
                Text = VortexCloudTunnelClient.StatusMessage,
                FontWeight = FontWeights.Bold,
                FontSize = 11,
                Foreground = VortexCloudTunnelClient.IsConnected ? Brushes.LimeGreen : new SolidColorBrush(Color.FromRgb(251, 191, 36))
            };
            statusPanel.Children.Add(lblNuvemStatus);
            cloudStack.Children.Add(statusPanel);

            var btnSalvarNuvem = new Button
            {
                Content = "💾 Salvar & Conectar Túnel em Nuvem",
                Background = new SolidColorBrush(Color.FromRgb(16, 185, 129)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.Bold,
                Padding = new Thickness(12, 8, 12, 8),
                Cursor = Cursors.Hand
            };
            btnSalvarNuvem.Click += (s, e) =>
            {
                try
                {
                    AxionGatewayState.HabilitarNuvemBroadcast = chkHabilitarNuvem.IsChecked == true;
                    AxionGatewayState.NuvemPairingToken = (txtNuvemToken.Text ?? "").Trim();
                    AxionGatewayState.Save();

                    if (AxionGatewayState.HabilitarNuvemBroadcast)
                    {
                        VortexCloudTunnelClient.Start();
                    }
                    else
                    {
                        VortexCloudTunnelClient.Stop();
                    }

                    lblNuvemStatus.Text = VortexCloudTunnelClient.StatusMessage;
                    lblNuvemStatus.Foreground = VortexCloudTunnelClient.IsConnected ? Brushes.LimeGreen : new SolidColorBrush(Color.FromRgb(251, 191, 36));

                    MessageBox.Show("Configurações do Túnel de Nuvem salvas com sucesso!", "Axion Gateway", MessageBoxButton.OK, MessageBoxImage.Information);

                    lblNuvemStatus.Text = VortexCloudTunnelClient.StatusMessage;
                    lblNuvemStatus.Foreground = VortexCloudTunnelClient.IsConnected ? Brushes.LimeGreen : new SolidColorBrush(Color.FromRgb(251, 191, 36));
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Erro ao salvar configurações: {ex.Message}", "Erro", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            };
            cloudStack.Children.Add(btnSalvarNuvem);

            cloudCard.Child = cloudStack;
            stack.Children.Add(cloudCard);

            // Ouvinte de mudança de status em tempo real para a UI
            _nuvemStatusHandler = () =>
            {
                Dispatcher.InvokeAsync(() =>
                {
                    if (lblNuvemStatus != null)
                    {
                        lblNuvemStatus.Text = VortexCloudTunnelClient.StatusMessage;
                        lblNuvemStatus.Foreground = VortexCloudTunnelClient.IsConnected ? Brushes.LimeGreen : new SolidColorBrush(Color.FromRgb(251, 191, 36));
                    }
                });
            };
            VortexCloudTunnelClient.OnStatusChanged += _nuvemStatusHandler;

            scroll.Content = stack;
            return scroll;
        }

        private UIElement CreateTelegramTab()
        {
            var scroll = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
            var panel = new StackPanel { Margin = new Thickness(15) };

            panel.Children.Add(new TextBlock { Text = "Bot Token do Telegram:", FontWeight = FontWeights.Bold, Margin = new Thickness(0, 5, 0, 2) });
            txtBotToken = new TextBox { Text = AxionGatewayState.TelegramBotToken, Margin = new Thickness(0, 0, 0, 10), Background = new SolidColorBrush(Color.FromRgb(19, 27, 46)), Foreground = Brushes.White, Padding = new Thickness(6) };
            panel.Children.Add(txtBotToken);

            panel.Children.Add(new TextBlock { Text = "Chat ID do Telegram:", FontWeight = FontWeights.Bold, Margin = new Thickness(0, 5, 0, 2) });
            txtChatId = new TextBox { Text = AxionGatewayState.TelegramChatId, Margin = new Thickness(0, 0, 0, 10), Background = new SolidColorBrush(Color.FromRgb(19, 27, 46)), Foreground = Brushes.White, Padding = new Thickness(6) };
            panel.Children.Add(txtChatId);

            panel.Children.Add(new TextBlock { Text = "Título das Mensagens:", FontWeight = FontWeights.Bold, Margin = new Thickness(0, 5, 0, 2) });
            txtTitulo = new TextBox { Text = AxionGatewayState.TituloMensagens, Margin = new Thickness(0, 0, 0, 15), Background = new SolidColorBrush(Color.FromRgb(19, 27, 46)), Foreground = Brushes.White, Padding = new Thickness(6) };
            panel.Children.Add(txtTitulo);

            panel.Children.Add(new TextBlock { Text = "Modo de Monitoramento de Contas:", FontWeight = FontWeights.Bold, Margin = new Thickness(0, 5, 0, 2) });
            cmbModoContas = new ComboBox { Margin = new Thickness(0, 0, 0, 10), Height = 28 };
            cmbModoContas.Items.Add("Monitorar Todas as Contas");
            cmbModoContas.Items.Add("Monitorar Contas Específicas");
            cmbModoContas.SelectedIndex = AxionGatewayState.ModoMonitoramento == "Todas" ? 0 : 1;
            cmbModoContas.SelectionChanged += (s, e) => { if (listContas != null) listContas.IsEnabled = cmbModoContas.SelectedIndex == 1; };
            panel.Children.Add(cmbModoContas);

            listContas = new ListBox
            {
                SelectionMode = SelectionMode.Multiple,
                Height = 110,
                Margin = new Thickness(0, 0, 0, 15),
                Background = new SolidColorBrush(Color.FromRgb(19, 27, 46)),
                Foreground = Brushes.White,
                BorderBrush = new SolidColorBrush(Color.FromRgb(51, 65, 85)),
                BorderThickness = new Thickness(1),
                IsEnabled = cmbModoContas.SelectedIndex == 1
            };
            ScrollViewer.SetVerticalScrollBarVisibility(listContas, ScrollBarVisibility.Visible);
            ScrollViewer.SetHorizontalScrollBarVisibility(listContas, ScrollBarVisibility.Disabled);

            lock (Account.All)
            {
                foreach (var acc in Account.All)
                {
                    if (acc == null) continue;
                    bool isConn = acc.Connection != null && acc.Connection.Status == ConnectionStatus.Connected;
                    if (!isConn) continue; // 🔒 Apenas contas com conexão ativa

                    listContas.Items.Add(acc.Name);
                    if (AxionGatewayState.ContasSelecionadasNomes.Contains(acc.Name)) listContas.SelectedItems.Add(acc.Name);
                }
            }
            panel.Children.Add(listContas);

            chkMonitorarOrdens = new CheckBox
            {
                Content = "Monitorar Ordens de Trade (Chave-Mestra de Execuções)",
                FontWeight = FontWeights.Bold,
                IsChecked = AxionGatewayState.MonitorarOrdens,
                Margin = new Thickness(0, 0, 0, 6),
                Foreground = Brushes.White
            };
            chkAbertura = new CheckBox
            {
                Content = "↳ Notificar Ordens de Entrada (Buy/Sell)",
                IsChecked = AxionGatewayState.EnviarMensagensAbertura,
                Margin = new Thickness(18, 0, 0, 6),
                Foreground = new SolidColorBrush(Color.FromRgb(203, 213, 225)),
                IsEnabled = AxionGatewayState.MonitorarOrdens
            };
            chkResultado = new CheckBox
            {
                Content = "↳ Notificar Resultados (Gain / Stop / Fechamento)",
                IsChecked = AxionGatewayState.EnviarMensagensResultado,
                Margin = new Thickness(18, 0, 0, 8),
                Foreground = new SolidColorBrush(Color.FromRgb(203, 213, 225)),
                IsEnabled = AxionGatewayState.MonitorarOrdens
            };
            chkMonitorarOrdens.Checked += (s, e) =>
            {
                chkAbertura.IsEnabled = true;
                chkResultado.IsEnabled = true;
            };
            chkMonitorarOrdens.Unchecked += (s, e) =>
            {
                chkAbertura.IsEnabled = false;
                chkResultado.IsEnabled = false;
            };

            chkNotificarConexao = new CheckBox
            {
                Content = "Notificar Quedas e Mudanças de Conexão (Alerta de Queda de Gráfico)",
                IsChecked = AxionGatewayState.NotificarStatusConexao,
                Margin = new Thickness(0, 4, 0, 15),
                Foreground = Brushes.White
            };

            panel.Children.Add(chkMonitorarOrdens);
            panel.Children.Add(chkAbertura);
            panel.Children.Add(chkResultado);
            panel.Children.Add(chkNotificarConexao);

            var btnRow = new Grid();
            btnRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            btnRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(10) });
            btnRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            var btnTest = new Button { Content = "📱 Testar Conexão Telegram", Background = new SolidColorBrush(Color.FromRgb(13, 148, 136)), Foreground = Brushes.White, FontWeight = FontWeights.Bold, Padding = new Thickness(8), Cursor = Cursors.Hand };
            btnTest.Click += async (s, e) =>
            {
                string token = txtBotToken.Text.Trim();
                string chatId = txtChatId.Text.Trim();
                if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(chatId))
                {
                    MessageBox.Show("Preencha o Bot Token e Chat ID.", "Aviso", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }
                try
                {
                    string url = $"https://api.telegram.org/bot{token}/sendMessage";
                    using (var client = new WebClient { Encoding = Encoding.UTF8 })
                    {
                        var values = new System.Collections.Specialized.NameValueCollection
                        {
                            { "chat_id", chatId },
                            { "text", "✅ <b>Axion Gateway V2</b>: Conexão com Telegram 100% OK!" },
                            { "parse_mode", "HTML" }
                        };
                        await client.UploadValuesTaskAsync(url, "POST", values);
                        MessageBox.Show("Mensagem de teste enviada com sucesso!", "Sucesso", MessageBoxButton.OK, MessageBoxImage.Information);
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Erro Telegram: {ex.Message}", "Erro", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            };
            Grid.SetColumn(btnTest, 0);
            btnRow.Children.Add(btnTest);

            var btnSalvar = new Button { Content = "💾 Salvar Configurações", Background = new SolidColorBrush(Color.FromRgb(37, 99, 235)), Foreground = Brushes.White, FontWeight = FontWeights.Bold, Padding = new Thickness(8), Cursor = Cursors.Hand };
            btnSalvar.Click += (s, e) =>
            {
                AxionGatewayState.TelegramBotToken = txtBotToken.Text.Trim();
                AxionGatewayState.TelegramChatId = txtChatId.Text.Trim();
                AxionGatewayState.TituloMensagens = txtTitulo.Text.Trim();
                AxionGatewayState.MonitorarOrdens = chkMonitorarOrdens.IsChecked == true;
                AxionGatewayState.EnviarMensagensAbertura = chkAbertura.IsChecked == true;
                AxionGatewayState.EnviarMensagensResultado = chkResultado.IsChecked == true;
                AxionGatewayState.NotificarStatusConexao = chkNotificarConexao.IsChecked == true;
                AxionGatewayState.ModoMonitoramento = cmbModoContas.SelectedIndex == 0 ? "Todas" : "Especifica";
                AxionGatewayState.ContasSelecionadasNomes.Clear();
                foreach (var item in listContas.SelectedItems) AxionGatewayState.ContasSelecionadasNomes.Add(item.ToString());
                AxionGatewayState.Save();
                MessageBox.Show("Configurações do Telegram salvas com sucesso!", "Sucesso", MessageBoxButton.OK, MessageBoxImage.Information);
            };
            Grid.SetColumn(btnSalvar, 2);
            btnRow.Children.Add(btnSalvar);

            panel.Children.Add(btnRow);
            scroll.Content = panel;
            return scroll;
        }

        private UIElement CreateRelatoriosTab()
        {
            var panel = new StackPanel { Margin = new Thickness(15) };

            chkRelatorioPeriodico = new CheckBox
            {
                Content = "Habilitar Envio de Relatórios Automáticos",
                IsChecked = AxionGatewayState.EnviarRelatorioPeriodico,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                Margin = new Thickness(0, 0, 0, 15)
            };
            panel.Children.Add(chkRelatorioPeriodico);

            panel.Children.Add(new TextBlock { Text = "Intervalo Temporal de Relatórios:", FontWeight = FontWeights.Bold, Margin = new Thickness(0, 5, 0, 2) });
            cmbIntervalo = new ComboBox { Margin = new Thickness(0, 0, 0, 15), Height = 28 };
            cmbIntervalo.Items.Add("Desativado (Apenas Horários Fixos)");
            cmbIntervalo.Items.Add("A cada 15 Minutos");
            cmbIntervalo.Items.Add("A cada 30 Minutos");
            cmbIntervalo.Items.Add("A cada 45 Minutos");
            cmbIntervalo.Items.Add("A cada 1 Hora (60 min)");
            cmbIntervalo.Items.Add("A cada 2 Horas (120 min)");
            cmbIntervalo.Items.Add("A cada 4 Horas (240 min)");

            int currentMin = AxionGatewayState.IntervaloRelatorioMinutos;
            if (currentMin == 15) cmbIntervalo.SelectedIndex = 1;
            else if (currentMin == 30) cmbIntervalo.SelectedIndex = 2;
            else if (currentMin == 45) cmbIntervalo.SelectedIndex = 3;
            else if (currentMin == 60) cmbIntervalo.SelectedIndex = 4;
            else if (currentMin == 120) cmbIntervalo.SelectedIndex = 5;
            else if (currentMin == 240) cmbIntervalo.SelectedIndex = 6;
            else cmbIntervalo.SelectedIndex = 0;

            panel.Children.Add(cmbIntervalo);

            panel.Children.Add(new TextBlock { Text = "Horários Fixos Diários (HH:MM):", FontWeight = FontWeights.Bold, Margin = new Thickness(0, 5, 0, 2) });
            var timeGrid = new Grid { Margin = new Thickness(0, 0, 0, 15) };
            timeGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            timeGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(10) });
            timeGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            txtHorario1 = new TextBox { Text = AxionGatewayState.HorarioRelatorio1, Background = new SolidColorBrush(Color.FromRgb(19, 27, 46)), Foreground = Brushes.White, Padding = new Thickness(6) };
            txtHorario2 = new TextBox { Text = AxionGatewayState.HorarioRelatorio2, Background = new SolidColorBrush(Color.FromRgb(19, 27, 46)), Foreground = Brushes.White, Padding = new Thickness(6) };
            Grid.SetColumn(txtHorario1, 0);
            Grid.SetColumn(txtHorario2, 2);
            timeGrid.Children.Add(txtHorario1);
            timeGrid.Children.Add(txtHorario2);
            panel.Children.Add(timeGrid);

            var btnEnviarAgora = new Button
            {
                Content = "🚀 Enviar Relatório de Contas Agora",
                Background = new SolidColorBrush(Color.FromRgb(16, 185, 129)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.Bold,
                Padding = new Thickness(10),
                Margin = new Thickness(0, 0, 0, 10),
                Cursor = Cursors.Hand
            };
            btnEnviarAgora.Click += (s, e) =>
            {
                AxionGatewayAddOn.EnviarRelatorioGeralContas(manual: true, motivo: "Disparo Manual");
                MessageBox.Show("Relatório de contas enviado ao Telegram!", "Sucesso", MessageBoxButton.OK, MessageBoxImage.Information);
            };
            panel.Children.Add(btnEnviarAgora);

            var btnSalvar = new Button
            {
                Content = "💾 Salvar Configurações de Relatório",
                Background = new SolidColorBrush(Color.FromRgb(37, 99, 235)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.Bold,
                Padding = new Thickness(8),
                Cursor = Cursors.Hand
            };
            btnSalvar.Click += (s, e) =>
            {
                AxionGatewayState.EnviarRelatorioPeriodico = chkRelatorioPeriodico.IsChecked == true;
                int[] map = { 0, 15, 30, 45, 60, 120, 240 };
                AxionGatewayState.IntervaloRelatorioMinutos = map[Math.Max(0, cmbIntervalo.SelectedIndex)];
                AxionGatewayState.HorarioRelatorio1 = txtHorario1.Text.Trim();
                AxionGatewayState.HorarioRelatorio2 = txtHorario2.Text.Trim();
                AxionGatewayState.Save();
                MessageBox.Show("Configurações de Relatório salvas!", "Sucesso", MessageBoxButton.OK, MessageBoxImage.Information);
            };
            panel.Children.Add(btnSalvar);

            return panel;
        }

        private UIElement CreateRiscoTab()
        {
            var grid = new Grid { Margin = new Thickness(15) };
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // 0: Top banner / buttons
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // 1: Title
            grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) }); // 2: Cards list

            var topPanel = new StackPanel { Margin = new Thickness(0, 0, 0, 10) };

            var banner = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(56, 189, 248)),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(6),
                Padding = new Thickness(12, 10, 12, 10),
                Margin = new Thickness(0, 0, 0, 10)
            };
            var bannerStack = new StackPanel();
            bannerStack.Children.Add(new TextBlock
            {
                Text = "🛡️ MONITOR DE GESTÃO DE RISCO E TRAVAS DE CONTAS",
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(56, 189, 248)),
                FontSize = 12
            });
            bannerStack.Children.Add(new TextBlock
            {
                Text = "ℹ️ Gestão Centralizada: Parâmetros de Stop Loss Diário, Metas de Lucro e regras operacionais são configurados e sincronizados exclusivamente pelo Painel Web Vortex.",
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                FontSize = 11,
                Margin = new Thickness(0, 4, 0, 0),
                TextWrapping = TextWrapping.Wrap
            });
            banner.Child = bannerStack;
            topPanel.Children.Add(banner);

            // Botão de Atualização Superior
            var actionGrid = new Grid { Margin = new Thickness(0, 0, 0, 5) };
            actionGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            actionGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(140) });

            var btnRefreshCards = new Button
            {
                Content = "🔃 Atualizar",
                Background = new SolidColorBrush(Color.FromRgb(37, 99, 235)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.Bold,
                Padding = new Thickness(8),
                Cursor = Cursors.Hand
            };
            btnRefreshCards.Click += (s, e) => RefreshRiskCards();
            Grid.SetColumn(btnRefreshCards, 1);
            actionGrid.Children.Add(btnRefreshCards);

            topPanel.Children.Add(actionGrid);

            Grid.SetRow(topPanel, 0);
            grid.Children.Add(topPanel);

            var listTitle = new TextBlock
            {
                Text = "Contas Ativas e Status de Monitoramento:",
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 5, 0, 8),
                Foreground = new SolidColorBrush(Color.FromRgb(56, 189, 248))
            };
            Grid.SetRow(listTitle, 1);
            grid.Children.Add(listTitle);

            var scroll = new ScrollViewer 
            { 
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                CanContentScroll = false
            };
            _riskCardsPanel = new StackPanel();
            scroll.Content = _riskCardsPanel;
            Grid.SetRow(scroll, 2);
            grid.Children.Add(scroll);

            RefreshRiskCards();

            return grid;
        }

        public void RefreshRiskCards()
        {
            if (_riskCardsPanel == null) return;
            _riskCardsPanel.Children.Clear();

            int renderedCount = 0;

            lock (Account.All)
            {
                foreach (var acc in Account.All)
                {
                    if (acc == null) continue;

                    // Ignorar contas do sistema de backtest e playback
                    if (string.Equals(acc.Name, "Backtest", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(acc.Name, "Playback101", StringComparison.OrdinalIgnoreCase))
                        continue;

                    // Filtrar RIGOROSAMENTE E EXCLUSIVAMENTE contas sincronizadas pelo Painel Web
                    AccountRiskInfo riskInfo = AxionGatewayAddOn.GetAccountRiskInfo(acc.Name);

                    if (riskInfo == null || !riskInfo.IsSynchronized)
                    {
                        continue;
                    }

                    renderedCount++;

                    double cashBase = riskInfo.InitialCashValue;
                    double cashActual = 0;
                    try { cashActual = acc.Get(AccountItem.CashValue, Currency.UsDollar); } catch { }
                    if (cashActual <= 0)
                    {
                        try { cashActual = acc.Get(AccountItem.BuyingPower, Currency.UsDollar); } catch { }
                    }
                    if (cashBase <= 0 && cashActual > 0)
                    {
                        riskInfo.InitialCashValue = cashActual;
                        cashBase = cashActual;
                    }
                    if (cashActual <= 0 && cashBase > 0)
                    {
                        cashActual = cashBase;
                    }

                    double pnl = (cashBase > 0 && cashActual > 0) ? ((cashActual - cashBase) / cashBase * 100.0) : 0;
                    bool isBlocked = riskInfo.IsBlocked;

                    var card = new Border
                    {
                        Background = new SolidColorBrush(Color.FromRgb(19, 27, 46)),
                        BorderBrush = isBlocked ? new SolidColorBrush(Color.FromRgb(225, 29, 72)) : new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                        BorderThickness = new Thickness(isBlocked ? 1.5 : 1),
                        CornerRadius = new CornerRadius(6),
                        Padding = new Thickness(10, 8, 10, 8),
                        Margin = new Thickness(0, 0, 0, 8)
                    };

                    var cardGrid = new Grid();
                    cardGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
                    cardGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

                    // Linha Superior: Status, Nome da Conta e Métricas
                    var rowTop = new Grid { Margin = new Thickness(0, 0, 0, 6) };
                    rowTop.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                    rowTop.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

                    var leftInfo = new StackPanel { Orientation = Orientation.Horizontal };
                    var txtStatus = new TextBlock
                    {
                        Text = isBlocked ? "🔴 BLOQUEADA" : "🟢 NORMAL",
                        FontWeight = FontWeights.Bold,
                        Foreground = isBlocked ? Brushes.Crimson : Brushes.LightGreen,
                        FontSize = 11,
                        VerticalAlignment = VerticalAlignment.Center,
                        Margin = new Thickness(0, 0, 8, 0)
                    };
                    leftInfo.Children.Add(txtStatus);

                    var txtName = new TextBlock
                    {
                        Text = acc.Name,
                        FontWeight = FontWeights.Bold,
                        Foreground = Brushes.White,
                        FontSize = 12,
                        VerticalAlignment = VerticalAlignment.Center
                    };
                    leftInfo.Children.Add(txtName);
                    Grid.SetColumn(leftInfo, 0);
                    rowTop.Children.Add(leftInfo);

                    var txtMetrics = new TextBlock
                    {
                        Text = $"Base: ${cashBase:N0} | Atual: ${cashActual:N0} | PnL: {(pnl >= 0 ? "+" : "")}{pnl:F2}%",
                        FontFamily = new FontFamily("Consolas"),
                        FontSize = 11,
                        Foreground = pnl >= 0 ? new SolidColorBrush(Color.FromRgb(52, 211, 153)) : new SolidColorBrush(Color.FromRgb(248, 113, 113)),
                        VerticalAlignment = VerticalAlignment.Center
                    };
                    Grid.SetColumn(txtMetrics, 1);
                    rowTop.Children.Add(txtMetrics);
                    Grid.SetRow(rowTop, 0);
                    cardGrid.Children.Add(rowTop);

                    // Linha Inferior: Parâmetros Read-Only em Moeda (SL Máx e TP Meta) + Botão de Ação de Bloqueio
                    var rowBottom = new Grid();
                    rowBottom.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                    rowBottom.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(120) });

                    string slText = riskInfo.DailyLossLimitUsd > 0 ? $"-${riskInfo.DailyLossLimitUsd:N0}" : (riskInfo.StopLossPercent > 0 ? $"-{riskInfo.StopLossPercent:F1}%" : "Sem Limite");
                    string tpText = riskInfo.DailyProfitTargetUsd > 0 ? $"+${riskInfo.DailyProfitTargetUsd:N0}" : (riskInfo.TakeProfitPercent > 0 ? $"+{riskInfo.TakeProfitPercent:F1}%" : "Sem Limite");

                    var leftParams = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
                    leftParams.Children.Add(new TextBlock
                    {
                        Text = $"SL Máx: {slText}  |  Meta TP: {tpText}",
                        FontFamily = new FontFamily("Consolas"),
                        FontSize = 11,
                        Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                        VerticalAlignment = VerticalAlignment.Center
                    });
                    Grid.SetColumn(leftParams, 0);
                    rowBottom.Children.Add(leftParams);

                    var targetAccountRef = acc;
                    var localRiskInfo = riskInfo;

                    var btnToggleBlock = new Button
                    {
                        Content = isBlocked ? "🔓 Desbloquear" : "🛑 Bloquear",
                        Background = isBlocked ? new SolidColorBrush(Color.FromRgb(16, 185, 129)) : new SolidColorBrush(Color.FromRgb(225, 29, 72)),
                        Foreground = Brushes.White,
                        FontWeight = FontWeights.Bold,
                        FontSize = 11,
                        Padding = new Thickness(6, 4, 6, 4),
                        Cursor = Cursors.Hand
                    };
                    btnToggleBlock.Click += (s, e) =>
                    {
                        if (localRiskInfo.IsBlocked)
                        {
                            AxionGatewayAddOn.DesbloquearContaManualmente(targetAccountRef.Name);
                        }
                        else
                        {
                            AxionGatewayAddOn.BloquearContaManualmente(targetAccountRef.Name);
                        }
                        RefreshRiskCards();
                    };
                    Grid.SetColumn(btnToggleBlock, 1);
                    rowBottom.Children.Add(btnToggleBlock);

                    Grid.SetRow(rowBottom, 1);
                    cardGrid.Children.Add(rowBottom);

                    card.Child = cardGrid;
                    _riskCardsPanel.Children.Add(card);
                }

                if (renderedCount == 0)
                {
                    var emptyNotice = new Border
                    {
                        Background = new SolidColorBrush(Color.FromRgb(19, 27, 46)),
                        BorderBrush = new SolidColorBrush(Color.FromRgb(51, 65, 85)),
                        BorderThickness = new Thickness(1),
                        CornerRadius = new CornerRadius(6),
                        Padding = new Thickness(20),
                        Margin = new Thickness(0, 10, 0, 0)
                    };
                    var emptyStack = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                    emptyStack.Children.Add(new TextBlock
                    {
                        Text = "📭 Nenhuma Conta Sincronizada",
                        FontWeight = FontWeights.Bold,
                        FontSize = 13,
                        Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                        HorizontalAlignment = HorizontalAlignment.Center
                    });
                    emptyStack.Children.Add(new TextBlock
                    {
                        Text = "Abra a Gestão de Contas no Painel Web Vortex para sincronizar os parâmetros de risco.",
                        FontSize = 11,
                        Foreground = new SolidColorBrush(Color.FromRgb(100, 116, 139)),
                        HorizontalAlignment = HorizontalAlignment.Center,
                        Margin = new Thickness(0, 6, 0, 0)
                    });
                    emptyNotice.Child = emptyStack;
                    _riskCardsPanel.Children.Add(emptyNotice);
                }
            }
        }

        private UIElement CreateCopyTradingTab()
        {
            var grid = new Grid { Margin = new Thickness(15) };
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // 0: Banner / Notice
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // 1: Title
            grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) }); // 2: Rules List
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // 3: Bottom Refresh Button

            var topPanel = new StackPanel { Margin = new Thickness(0, 0, 0, 10) };

            var banner = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(56, 189, 248)),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(6),
                Padding = new Thickness(12, 10, 12, 10),
                Margin = new Thickness(0, 0, 0, 8)
            };
            var bannerStack = new StackPanel();
            bannerStack.Children.Add(new TextBlock
            {
                Text = "⚡ MOTOR DE COPY TRADING NT8 ➔ NT8 (< 0.1ms In-Memory C#)",
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(56, 189, 248)),
                FontSize = 12
            });
            bannerStack.Children.Add(new TextBlock
            {
                Text = "ℹ️ Gestão Centralizada: Todas as regras de espelhamento, lotes e limites são configuradas e sincronizadas exclusivamente pelo Painel Web Vortex.",
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                FontSize = 11,
                Margin = new Thickness(0, 4, 0, 0),
                TextWrapping = TextWrapping.Wrap
            });
            banner.Child = bannerStack;
            topPanel.Children.Add(banner);

            Grid.SetRow(topPanel, 0);
            grid.Children.Add(topPanel);

            // Linha 1: Título da Lista
            var listHeader = new TextBlock
            {
                Text = "Regras Sincronizadas com o Painel Vortex:",
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 5, 0, 6),
                Foreground = new SolidColorBrush(Color.FromRgb(251, 191, 36))
            };
            Grid.SetRow(listHeader, 1);
            grid.Children.Add(listHeader);

            // Linha 2: Lista Rolável de Regras
            var scroll = new ScrollViewer 
            { 
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                CanContentScroll = false
            };
            _copyRulesPanel = new StackPanel();
            scroll.Content = _copyRulesPanel;
            Grid.SetRow(scroll, 2);
            grid.Children.Add(scroll);

            // Linha 3: Botão de Ação
            var btnReloadDisk = new Button
            {
                Content = "🔄 Recarregar Regras do Painel VortexWeb",
                Background = new SolidColorBrush(Color.FromRgb(37, 99, 235)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.Bold,
                Padding = new Thickness(10),
                Margin = new Thickness(0, 8, 0, 0),
                Cursor = Cursors.Hand
            };
            btnReloadDisk.Click += (s, e) =>
            {
                AxionGatewayAddOn.LoadCopyRulesFromDisk();
                RefreshCopyRulesCards();
            };
            Grid.SetRow(btnReloadDisk, 3);
            grid.Children.Add(btnReloadDisk);

            RefreshCopyRulesCards();

            return grid;
        }

        public void RefreshCopyRulesCards()
        {
            if (_copyRulesPanel == null) return;
            _copyRulesPanel.Children.Clear();

            var rulesList = AxionGatewayAddOn._copyRules.Values.ToList();
            if (rulesList.Count == 0)
            {
                var emptyCard = new Border
                {
                    Background = new SolidColorBrush(Color.FromRgb(15, 23, 42)),
                    BorderBrush = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                    BorderThickness = new Thickness(1),
                    CornerRadius = new CornerRadius(6),
                    Padding = new Thickness(15),
                    Margin = new Thickness(0, 0, 0, 6)
                };
                emptyCard.Child = new TextBlock
                {
                    Text = "Nenhuma regra de copy trading configurada no momento.\nConfigure os espelhamentos no Painel Web Vortex e clique em 'Sincronizar com NinjaTrader'.",
                    Foreground = Brushes.Gray,
                    TextAlignment = TextAlignment.Center,
                    FontSize = 11
                };
                _copyRulesPanel.Children.Add(emptyCard);
                return;
            }

            foreach (var r in rulesList)
            {
                var ruleRef = r;
                var card = new Border
                {
                    Background = ruleRef.IsActive ? new SolidColorBrush(Color.FromRgb(19, 27, 46)) : new SolidColorBrush(Color.FromRgb(15, 23, 42)),
                    BorderBrush = ruleRef.IsActive ? new SolidColorBrush(Color.FromRgb(30, 58, 90)) : new SolidColorBrush(Color.FromRgb(51, 65, 85)),
                    BorderThickness = new Thickness(1),
                    Opacity = ruleRef.IsActive ? 1.0 : 0.75,
                    CornerRadius = new CornerRadius(6),
                    Padding = new Thickness(12, 10, 12, 10),
                    Margin = new Thickness(0, 0, 0, 8)
                };

                var cardGrid = new Grid();
                cardGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                cardGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

                var infoStack = new StackPanel();
                var topRow = new StackPanel { Orientation = Orientation.Horizontal };
                topRow.Children.Add(new TextBlock
                {
                    Text = $"👑 {ruleRef.MasterAccountName} ➔ 🏢 {ruleRef.SlaveAccountName}",
                    FontWeight = FontWeights.Bold,
                    Foreground = Brushes.White,
                    FontSize = 12,
                    Margin = new Thickness(0, 0, 8, 0)
                });
                topRow.Children.Add(new TextBlock
                {
                    Text = $"{ruleRef.LotMultiplier:F1}x Lotes",
                    FontFamily = new FontFamily("Consolas"),
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(251, 191, 36)),
                    FontSize = 11,
                    Margin = new Thickness(0, 0, 8, 0)
                });
                infoStack.Children.Add(topRow);

                var bottomRow = new TextBlock
                {
                    Text = $"Ativos: {(string.IsNullOrEmpty(ruleRef.AllowedSymbols) ? "TODOS" : ruleRef.AllowedSymbols)} | ATM: OBRIGATÓRIO | Zerar com Master: {(ruleRef.CloseSlavesOnMasterClose ? "SIM" : "NÃO")}",
                    Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                    FontSize = 10,
                    Margin = new Thickness(0, 3, 0, 0)
                };
                infoStack.Children.Add(bottomRow);

                Grid.SetColumn(infoStack, 0);
                cardGrid.Children.Add(infoStack);

                var rightStack = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };

                // Badge de Status com cor e texto inequívocos
                var statusBadge = new Border
                {
                    Background = ruleRef.IsActive ? new SolidColorBrush(Color.FromArgb(30, 16, 185, 129)) : new SolidColorBrush(Color.FromArgb(30, 245, 158, 11)),
                    BorderBrush = ruleRef.IsActive ? new SolidColorBrush(Color.FromRgb(16, 185, 129)) : new SolidColorBrush(Color.FromRgb(245, 158, 11)),
                    BorderThickness = new Thickness(1),
                    CornerRadius = new CornerRadius(4),
                    Padding = new Thickness(8, 4, 8, 4),
                    Margin = new Thickness(0, 0, 10, 0),
                    VerticalAlignment = VerticalAlignment.Center
                };
                statusBadge.Child = new TextBlock
                {
                    Text = ruleRef.IsActive ? "🟢 ATIVA" : "⏸️ PAUSADA",
                    FontSize = 10,
                    FontWeight = FontWeights.Bold,
                    Foreground = ruleRef.IsActive ? new SolidColorBrush(Color.FromRgb(52, 211, 153)) : new SolidColorBrush(Color.FromRgb(251, 191, 36))
                };
                rightStack.Children.Add(statusBadge);

                // Botão de Ação único e explícito: se ativa, convida a Pausar; se pausada, convida a Ativar
                var btnToggleBlock = new Button
                {
                    Content = ruleRef.IsActive ? "⏸️ Pausar Regra" : "▶️ Ativar Cópia",
                    Background = ruleRef.IsActive ? new SolidColorBrush(Color.FromRgb(30, 41, 59)) : new SolidColorBrush(Color.FromRgb(5, 150, 105)),
                    BorderBrush = ruleRef.IsActive ? new SolidColorBrush(Color.FromRgb(71, 85, 105)) : new SolidColorBrush(Color.FromRgb(16, 185, 129)),
                    BorderThickness = new Thickness(1),
                    Foreground = ruleRef.IsActive ? new SolidColorBrush(Color.FromRgb(226, 232, 240)) : Brushes.White,
                    FontWeight = FontWeights.Bold,
                    FontSize = 11,
                    Padding = new Thickness(10, 5, 10, 5),
                    Cursor = Cursors.Hand,
                    VerticalAlignment = VerticalAlignment.Center
                };
                btnToggleBlock.Click += (s, e) =>
                {
                    ruleRef.IsActive = !ruleRef.IsActive;
                    AxionGatewayAddOn.SaveCopyRulesToDisk();
                    RefreshCopyRulesCards();
                };
                rightStack.Children.Add(btnToggleBlock);

                Grid.SetColumn(rightStack, 1);
                cardGrid.Children.Add(rightStack);

                card.Child = cardGrid;
                _copyRulesPanel.Children.Add(card);
            }
        }

        #region Aba de Posições Abertas (Síntese Multi-Contas Estilo Replikanto)

        private UIElement CreatePosicoesTab()
        {
            var grid = new Grid { Margin = new Thickness(12) };
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // 0: Resumo Global / Estatísticas
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // 1: Botões de Ação
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // 2: Cabeçalho das Colunas
            grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) }); // 3: Lista de Linhas Rolável

            // Linha 0: Card Superior de Resumo (Estilo Replikanto)
            var summaryBorder = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(15, 23, 42)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(51, 65, 85)),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(14, 12, 14, 12),
                Margin = new Thickness(0, 0, 0, 10)
            };

            var summaryGrid = new Grid();
            summaryGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            summaryGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var titleStack = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            var lblTitle = new TextBlock
            {
                Text = "🎯 SÍNTESE DE POSIÇÕES ABERTAS (TEMPO REAL)",
                FontWeight = FontWeights.ExtraBold,
                FontSize = 13,
                Foreground = new SolidColorBrush(Color.FromRgb(56, 189, 248)),
                Margin = new Thickness(0, 0, 0, 3)
            };
            titleStack.Children.Add(lblTitle);

            _txtTotalPosicoesInfo = new TextBlock
            {
                Text = "Carregando posições...",
                FontSize = 11,
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184))
            };
            titleStack.Children.Add(_txtTotalPosicoesInfo);
            Grid.SetColumn(titleStack, 0);
            summaryGrid.Children.Add(titleStack);

            var pnlStack = new StackPanel { HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center };
            var lblPnlTitle = new TextBlock
            {
                Text = "PNL ABERTO TOTAL:",
                FontWeight = FontWeights.Bold,
                FontSize = 10,
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                HorizontalAlignment = HorizontalAlignment.Right
            };
            pnlStack.Children.Add(lblPnlTitle);

            _txtTotalOpenPnL = new TextBlock
            {
                Text = "$0.00",
                FontWeight = FontWeights.ExtraBold,
                FontFamily = new FontFamily("Consolas"),
                FontSize = 16,
                Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Right
            };
            pnlStack.Children.Add(_txtTotalOpenPnL);
            Grid.SetColumn(pnlStack, 1);
            summaryGrid.Children.Add(pnlStack);

            summaryBorder.Child = summaryGrid;
            Grid.SetRow(summaryBorder, 0);
            grid.Children.Add(summaryBorder);

            // Linha 1: Botões de Ação (Atualizar + Fechamento Total Global)
            var actionGrid = new Grid { Margin = new Thickness(0, 0, 0, 8) };
            actionGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(140) });
            actionGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(8) });
            actionGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            var btnRefresh = new Button
            {
                Content = "🔄 Atualizar",
                Background = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.Bold,
                BorderBrush = new SolidColorBrush(Color.FromRgb(71, 85, 105)),
                Padding = new Thickness(8),
                Cursor = Cursors.Hand
            };
            btnRefresh.Click += (s, e) => RefreshOpenPositionsCards();
            Grid.SetColumn(btnRefresh, 0);
            actionGrid.Children.Add(btnRefresh);

            var btnPanicAll = new Button
            {
                Content = "🚨 FECHAMENTO TOTAL (ZERAR TODAS AS CONTAS)",
                Background = new SolidColorBrush(Color.FromRgb(225, 29, 72)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.ExtraBold,
                Padding = new Thickness(10),
                Cursor = Cursors.Hand
            };
            btnPanicAll.Click += (s, e) => ExecutePanicCloseWithConfirmation();
            Grid.SetColumn(btnPanicAll, 2);
            actionGrid.Children.Add(btnPanicAll);

            Grid.SetRow(actionGrid, 1);
            grid.Children.Add(actionGrid);

            // Linha 2: Cabeçalho das Colunas da Tabela
            var colHeaderGrid = new Grid { Margin = new Thickness(10, 4, 10, 6) };
            colHeaderGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(88) }); // 0: Master ou Slave
            colHeaderGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(110) }); // 1: Nome da Conta
            colHeaderGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(75) }); // 2: Venda ou Compra
            colHeaderGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }); // 3: Ativo
            colHeaderGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(100) }); // 4: PNL Aberto
            colHeaderGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(45) }); // 5: Botão ✕

            Action<string, int, TextAlignment> addHeaderCol = (title, col, align) =>
            {
                var txt = new TextBlock
                {
                    Text = title,
                    FontSize = 10,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(100, 116, 139)),
                    TextAlignment = align,
                    VerticalAlignment = VerticalAlignment.Center
                };
                Grid.SetColumn(txt, col);
                colHeaderGrid.Children.Add(txt);
            };

            addHeaderCol("TIPO", 0, TextAlignment.Left);
            addHeaderCol("CONTA", 1, TextAlignment.Left);
            addHeaderCol("DIREÇÃO", 2, TextAlignment.Left);
            addHeaderCol("ATIVO", 3, TextAlignment.Left);
            addHeaderCol("PNL ABERTO", 4, TextAlignment.Right);
            addHeaderCol("AÇÃO", 5, TextAlignment.Center);

            Grid.SetRow(colHeaderGrid, 2);
            grid.Children.Add(colHeaderGrid);

            // Linha 3: ScrollViewer com Lista Dinâmica de Linhas
            var scroll = new ScrollViewer
            {
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                CanContentScroll = false
            };

            _openPositionsPanel = new StackPanel();
            scroll.Content = _openPositionsPanel;
            Grid.SetRow(scroll, 3);
            grid.Children.Add(scroll);

            RefreshOpenPositionsCards();
            return grid;
        }

        public void RefreshOpenPositionsCards()
        {
            if (_openPositionsPanel == null) return;

            List<Account> connectedAccounts = null;
            lock (Account.All)
            {
                connectedAccounts = Account.All
                    .Where(a => a != null && a.Connection != null && a.Connection.Status == ConnectionStatus.Connected)
                    .ToList();
            }

            int totalContasComPosicao = 0;
            int totalContratos = 0;
            double totalUnrealized = 0;

            _openPositionsPanel.Children.Clear();

            if (connectedAccounts != null)
            {
                foreach (var acc in connectedAccounts)
                {
                    List<Position> openPositions = null;
                    if (acc.Positions != null)
                    {
                        lock (acc.Positions)
                        {
                            openPositions = acc.Positions
                                .Where(p => p != null && p.MarketPosition != MarketPosition.Flat && Math.Abs(p.Quantity) > 0)
                                .ToList();
                        }
                    }

                    if (openPositions == null || openPositions.Count == 0)
                        continue;

                    totalContasComPosicao++;

                    bool isMaster = AxionGatewayAddOn._copyRules.Values.Any(r => r != null && r.IsActive && string.Equals(r.MasterAccountName, acc.Name, StringComparison.OrdinalIgnoreCase));
                    bool isSlave = AxionGatewayAddOn._copyRules.Values.Any(r => r != null && r.IsActive && string.Equals(r.SlaveAccountName, acc.Name, StringComparison.OrdinalIgnoreCase));

                    string roleBadge = isMaster ? "👑 MASTER" : (isSlave ? "👥 SLAVE" : "👤 CONTA");
                    Color badgeColor = isMaster ? Color.FromRgb(251, 191, 36) : (isSlave ? Color.FromRgb(56, 189, 248) : Color.FromRgb(148, 163, 184));

                    foreach (var pos in openPositions)
                    {
                        int qty = Math.Abs(pos.Quantity);
                        totalContratos += qty;

                        bool isLong = pos.MarketPosition == MarketPosition.Long;
                        string sideStr = isLong ? "COMPRA" : "VENDA";
                        Color sideColor = isLong ? Color.FromRgb(34, 197, 94) : Color.FromRgb(239, 68, 68);

                        // PnL Não Realizado oficial da posição via API nativa NinjaTrader 8
                        double posUnrealized = 0;
                        try
                        {
                            posUnrealized = pos.GetUnrealizedProfitLoss(PerformanceUnit.Currency);
                        }
                        catch
                        {
                            try { posUnrealized = acc.Get(AccountItem.UnrealizedProfitLoss, Currency.UsDollar); } catch { }
                        }

                        totalUnrealized += posUnrealized;

                        // Linha Única por Operação / Ativo (Clean, Direto ao Ponto e Sem Poluição)
                        var rowBorder = new Border
                        {
                            Background = new SolidColorBrush(Color.FromRgb(19, 27, 46)),
                            BorderBrush = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                            BorderThickness = new Thickness(1),
                            CornerRadius = new CornerRadius(4),
                            Padding = new Thickness(8, 4, 8, 4),
                            Margin = new Thickness(0, 0, 0, 4)
                        };

                        var rowGrid = new Grid();
                        rowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(88) }); // 0: Master ou Slave
                        rowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(110) }); // 1: Nome da Conta
                        rowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(75) }); // 2: Venda ou Compra
                        rowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }); // 3: Ativo
                        rowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(100) }); // 4: PNL Não Realizado
                        rowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(45) }); // 5: Botão ✕

                        // 1. Master ou Slave
                        var badgeRole = new Border
                        {
                            Background = new SolidColorBrush(Color.FromArgb(40, badgeColor.R, badgeColor.G, badgeColor.B)),
                            BorderBrush = new SolidColorBrush(badgeColor),
                            BorderThickness = new Thickness(1),
                            CornerRadius = new CornerRadius(3),
                            Padding = new Thickness(5, 1, 5, 1),
                            HorizontalAlignment = HorizontalAlignment.Left,
                            VerticalAlignment = VerticalAlignment.Center
                        };
                        badgeRole.Child = new TextBlock
                        {
                            Text = roleBadge,
                            FontSize = 9,
                            FontWeight = FontWeights.Bold,
                            Foreground = new SolidColorBrush(badgeColor)
                        };
                        Grid.SetColumn(badgeRole, 0);
                        rowGrid.Children.Add(badgeRole);

                        // 2. Nome da Conta
                        var txtAccName = new TextBlock
                        {
                            Text = acc.Name,
                            FontWeight = FontWeights.Bold,
                            FontSize = 11,
                            Foreground = Brushes.White,
                            VerticalAlignment = VerticalAlignment.Center,
                            TextTrimming = TextTrimming.CharacterEllipsis
                        };
                        Grid.SetColumn(txtAccName, 1);
                        rowGrid.Children.Add(txtAccName);

                        // 3. Venda ou Compra
                        var badgeSide = new Border
                        {
                            Background = new SolidColorBrush(Color.FromArgb(40, sideColor.R, sideColor.G, sideColor.B)),
                            BorderBrush = new SolidColorBrush(sideColor),
                            BorderThickness = new Thickness(1),
                            CornerRadius = new CornerRadius(3),
                            Padding = new Thickness(6, 1, 6, 1),
                            HorizontalAlignment = HorizontalAlignment.Left,
                            VerticalAlignment = VerticalAlignment.Center
                        };
                        badgeSide.Child = new TextBlock
                        {
                            Text = sideStr,
                            FontSize = 9,
                            FontWeight = FontWeights.ExtraBold,
                            Foreground = new SolidColorBrush(sideColor)
                        };
                        Grid.SetColumn(badgeSide, 2);
                        rowGrid.Children.Add(badgeSide);

                        // 4. Ativo
                        var txtSymbol = new TextBlock
                        {
                            Text = $"{pos.Instrument?.FullName ?? "N/A"} • {qty}x",
                            FontWeight = FontWeights.SemiBold,
                            FontSize = 11,
                            Foreground = new SolidColorBrush(Color.FromRgb(226, 232, 240)),
                            VerticalAlignment = VerticalAlignment.Center,
                            TextTrimming = TextTrimming.CharacterEllipsis
                        };
                        Grid.SetColumn(txtSymbol, 3);
                        rowGrid.Children.Add(txtSymbol);

                        // 5. PNL Não Realizado (somente o valor em dólar)
                        var txtPnl = new TextBlock
                        {
                            Text = (posUnrealized >= 0 ? "+$" : "-$") + Math.Abs(posUnrealized).ToString("N2", CultureInfo.InvariantCulture),
                            FontFamily = new FontFamily("Consolas"),
                            FontSize = 12,
                            FontWeight = FontWeights.Bold,
                            Foreground = posUnrealized >= 0 ? new SolidColorBrush(Color.FromRgb(52, 211, 153)) : new SolidColorBrush(Color.FromRgb(248, 113, 113)),
                            HorizontalAlignment = HorizontalAlignment.Right,
                            VerticalAlignment = VerticalAlignment.Center,
                            Margin = new Thickness(0, 0, 6, 0)
                        };
                        Grid.SetColumn(txtPnl, 4);
                        rowGrid.Children.Add(txtPnl);

                        // 6. Botão com Ícone ✕ para encerrar APENAS este ativo
                        var targetAcc = acc;
                        var targetInst = pos.Instrument;
                        var targetSide = sideStr;
                        var targetQty = qty;

                        var btnCloseSingle = new Button
                        {
                            Content = "✕",
                            ToolTip = $"Encerrar posição de {targetInst?.FullName ?? "Ativo"} na conta {targetAcc.Name}",
                            Background = new SolidColorBrush(Color.FromRgb(220, 38, 38)),
                            Foreground = Brushes.White,
                            FontWeight = FontWeights.ExtraBold,
                            FontSize = 12,
                            Width = 28,
                            Height = 22,
                            Padding = new Thickness(0),
                            Cursor = Cursors.Hand,
                            HorizontalAlignment = HorizontalAlignment.Center,
                            VerticalAlignment = VerticalAlignment.Center
                        };
                        btnCloseSingle.Click += (s, e) =>
                        {
                            var confirm = MessageBox.Show(
                                $"Deseja realmente encerrar a posição de {targetInst?.FullName} ({targetQty}x {targetSide}) na conta {targetAcc.Name}?",
                                $"Encerrar Ativo — {targetAcc.Name}",
                                MessageBoxButton.YesNo,
                                MessageBoxImage.Warning
                            );
                            if (confirm == MessageBoxResult.Yes)
                            {
                                AxionGatewayAddOn.FecharPosicaoDoAtivo(targetAcc, targetInst);
                                RefreshOpenPositionsCards();
                            }
                        };
                        Grid.SetColumn(btnCloseSingle, 5);
                        rowGrid.Children.Add(btnCloseSingle);

                        rowBorder.Child = rowGrid;
                        _openPositionsPanel.Children.Add(rowBorder);
                    }
                }
            }

            if (totalContasComPosicao == 0)
            {
                var emptyCard = new Border
                {
                    Background = new SolidColorBrush(Color.FromRgb(15, 23, 42)),
                    BorderBrush = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                    BorderThickness = new Thickness(1),
                    CornerRadius = new CornerRadius(6),
                    Padding = new Thickness(20),
                    Margin = new Thickness(0, 10, 0, 0)
                };

                var emptyStack = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                emptyStack.Children.Add(new TextBlock
                {
                    Text = "✅ Nenhuma Posição Aberta",
                    FontSize = 13,
                    FontWeight = FontWeights.Bold,
                    Foreground = new SolidColorBrush(Color.FromRgb(52, 211, 153)),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Margin = new Thickness(0, 0, 0, 4)
                });
                emptyStack.Children.Add(new TextBlock
                {
                    Text = "Todas as contas conectadas estão 100% zeradas (Flat).",
                    FontSize = 11,
                    Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                    TextAlignment = TextAlignment.Center
                });
                emptyCard.Child = emptyStack;
                _openPositionsPanel.Children.Add(emptyCard);
            }

            if (_txtTotalPosicoesInfo != null)
            {
                _txtTotalPosicoesInfo.Text = $"{totalContasComPosicao} {(totalContasComPosicao == 1 ? "conta posicionada" : "contas posicionadas")}  •  {totalContratos} {(totalContratos == 1 ? "contrato aberto" : "contratos abertos")}";
            }
            if (_txtTotalOpenPnL != null)
            {
                _txtTotalOpenPnL.Text = (totalUnrealized >= 0 ? "+$" : "-$") + Math.Abs(totalUnrealized).ToString("N2", CultureInfo.InvariantCulture);
                _txtTotalOpenPnL.Foreground = totalUnrealized >= 0 ? new SolidColorBrush(Color.FromRgb(52, 211, 153)) : new SolidColorBrush(Color.FromRgb(248, 113, 113));
            }
        }

        #endregion

        private UIElement CreateLogsTab()
        {
            var grid = new Grid { Margin = new Thickness(10) };
            grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

            txtLogs = new TextBox
            {
                IsReadOnly = true,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                AcceptsReturn = true,
                FontFamily = new FontFamily("Consolas"),
                FontSize = 11,
                Background = new SolidColorBrush(Color.FromRgb(11, 14, 20)),
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                Margin = new Thickness(0, 0, 0, 10),
                Padding = new Thickness(8)
            };
            Grid.SetRow(txtLogs, 0);
            grid.Children.Add(txtLogs);

            var btnClear = new Button
            {
                Content = "🗑️ Limpar Logs",
                Background = new SolidColorBrush(Color.FromRgb(51, 65, 85)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.Bold,
                Padding = new Thickness(8),
                Cursor = Cursors.Hand
            };
            btnClear.Click += (s, e) => txtLogs.Clear();
            Grid.SetRow(btnClear, 1);
            grid.Children.Add(btnClear);

            return grid;
        }

        private UIElement CreateAboutLicenseTab()
        {
            var scroll = new ScrollViewer
            {
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled
            };

            var mainPanel = new StackPanel { Margin = new Thickness(15) };

            // ── 1. CARD DA EMPRESA E PROPRIEDADE INTELECTUAL ──
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

            var companyHeader = new TextBlock
            {
                Text = $"🏢 {AxionLicenseManager.EmpresaRazaoSocial}",
                FontSize = 14,
                FontWeight = FontWeights.ExtraBold,
                Foreground = new SolidColorBrush(Color.FromRgb(56, 189, 248)),
                Margin = new Thickness(0, 0, 0, 6)
            };
            companyStack.Children.Add(companyHeader);

            var companyDetails = new TextBlock
            {
                Text = $"📄 CNPJ: {AxionLicenseManager.EmpresaCnpj}\n" +
                       $"🌐 Plataforma & Loja Oficial: {AxionLicenseManager.EmpresaDominio}\n" +
                       $"⚡ Software: {AxionLicenseManager.SoftwareVersao}\n" +
                       $"🔒 {AxionLicenseManager.CopyrightText}",
                FontSize = 11,
                Foreground = new SolidColorBrush(Color.FromRgb(203, 213, 225)),
                LineHeight = 18
            };
            companyStack.Children.Add(companyDetails);

            var legalNote = new TextBlock
            {
                Text = "ℹ️ Este software é protegido pela Lei de Direitos Autorais e Propriedade Intelectual (Lei nº 9.609/98). " +
                       "O uso é estritamente pessoal e intransferível, condicionado à assinatura ativa vinculada ao Machine ID deste computador.",
                FontSize = 10,
                FontStyle = FontStyles.Italic,
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 8, 0, 0)
            };
            companyStack.Children.Add(legalNote);

            companyCard.Child = companyStack;
            mainPanel.Children.Add(companyCard);

            // ── 2. CARD DO MACHINE ID DO NINJATRADER ──
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

            var machineHeader = new TextBlock
            {
                Text = "💻 IDENTIFICAÇÃO DESTE COMPUTADOR (NINJATRADER 8)",
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(Color.FromRgb(251, 191, 36)),
                Margin = new Thickness(0, 0, 0, 4)
            };
            machineStack.Children.Add(machineHeader);

            var machineHelp = new TextBlock
            {
                Text = "Copie o Machine ID abaixo e informe no cadastro da sua assinatura na loja ou no suporte para liberação deste terminal:",
                FontSize = 11,
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 0, 0, 8)
            };
            machineStack.Children.Add(machineHelp);

            var machineGrid = new Grid();
            machineGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            machineGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(8) });
            machineGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var txtMachineId = new TextBox
            {
                Text = AxionLicenseManager.CurrentMachineId,
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
                    Clipboard.SetText(AxionLicenseManager.CurrentMachineId);
                    MessageBox.Show($"Machine ID copiado com sucesso para a Área de Transferência:\n\n{AxionLicenseManager.CurrentMachineId}\n\nCole no campo 'id_nt' ou nos detalhes do pedido na loja.", "Machine ID Copiado", MessageBoxButton.OK, MessageBoxImage.Information);
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

            // ── 3. CARD DE STATUS DA LICENÇA EM TEMPO REAL ──
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
                bool isOk = AxionLicenseManager.IsLicensed;
                if (isOk)
                {
                    statusCard.Background = new SolidColorBrush(Color.FromRgb(6, 78, 59));
                    statusCard.BorderBrush = new SolidColorBrush(Color.FromRgb(16, 185, 129));
                    statusCard.BorderThickness = new Thickness(1.5);
                    txtStatusTitle.Text = "🟢 LICENÇA ATIVA E AUTORIZADA";
                    txtStatusTitle.Foreground = new SolidColorBrush(Color.FromRgb(52, 211, 153));
                    txtStatusMsg.Text = "Licença validada e autorizada para este terminal.";
                    txtStatusMsg.Foreground = Brushes.White;
                    txtStatusDetails.Text = "Terminal sincronizado com o NinjaTrader 8 e pronto para operar.";
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
                    txtStatusDetails.Text = "O Copy Trading e o recebimento de ordens remotas estão temporariamente pausados.";
                }
            };

            updateStatusVisual();
            AxionLicenseManager.OnLicenseStatusChanged = () =>
            {
                Dispatcher.InvokeAsync(updateStatusVisual);
            };

            mainPanel.Children.Add(statusCard);

            // ── 4. CARD DE CONFIGURAÇÃO E ATIVAÇÃO DA ASSINATURA ──
            var configCard = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(15, 23, 42)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(15)
            };

            var configStack = new StackPanel();

            var configHeader = new TextBlock
            {
                Text = "🔑 VINCULAR ASSINATURA WOOCOMMERCE",
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                Margin = new Thickness(0, 0, 0, 6)
            };
            configStack.Children.Add(configHeader);

            var lblSub = new TextBlock
            {
                Text = "Número / ID da Assinatura ou Pedido:",
                FontSize = 11,
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                Margin = new Thickness(0, 0, 0, 4)
            };
            configStack.Children.Add(lblSub);

            var txtSubId = new TextBox
            {
                Text = AxionGatewayState.IdAssinatura,
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

                var resultado = await Task.Run(() => AxionLicenseManager.ValidarOnline(idDig));

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

            var btnSave = new Button
            {
                Content = "💾 Salvar ID",
                Background = new SolidColorBrush(Color.FromRgb(51, 65, 85)),
                Foreground = Brushes.White,
                FontWeight = FontWeights.Bold,
                Padding = new Thickness(10),
                Cursor = Cursors.Hand
            };
            btnSave.Click += (s, e) =>
            {
                AxionGatewayState.IdAssinatura = txtSubId.Text.Trim();
                AxionGatewayState.Save();
                MessageBox.Show("ID de Assinatura salvo nas configurações locais.", "Salvo", MessageBoxButton.OK, MessageBoxImage.Information);
            };
            Grid.SetColumn(btnSave, 2);
            btnGrid.Children.Add(btnSave);

            configStack.Children.Add(btnGrid);
            configCard.Child = configStack;
            mainPanel.Children.Add(configCard);

            scroll.Content = mainPanel;
            return scroll;
        }
    }
}
