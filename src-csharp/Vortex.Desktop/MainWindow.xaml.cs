using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows;
using System.Windows.Input;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace Vortex.Desktop;

public partial class MainWindow : Window
{
    private string _wwwrootDir = string.Empty;
    private const string VirtualHost = "axion.station";
    private WebView2? _webView;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += MainWindow_Loaded;
        KeyDown += MainWindow_KeyDown;
    }

    private void MainWindow_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.F12)
        {
            try
            {
                _webView?.CoreWebView2?.OpenDevToolsWindow();
            }
            catch { }
        }
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            // ── 1. Verificar e garantir Microsoft Edge WebView2 Runtime ──────────────
            if (!await EnsureWebView2RuntimeAsync())
            {
                Close();
                return;
            }

            // ── 2. User data folder isolada para a sessão ──────────────────
            string userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "AxionTradeStation_UserData"
            );
            Directory.CreateDirectory(userDataFolder);

            // ── 3. Localiza ou extrai automaticamente os arquivos web (wwwroot) ───────────
            _wwwrootDir = EnsureWwwRoot(userDataFolder);

            if (!Directory.Exists(_wwwrootDir) || !File.Exists(Path.Combine(_wwwrootDir, "index.html")))
            {
                MessageBox.Show(
                    $"Pasta de arquivos web não encontrada!\n\nDiretório verificado:\n{_wwwrootDir}\n\nO pacote embutido não pôde ser inicializado.",
                    "Axion TradeStation — Inicialização",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error
                );
                return;
            }

            // ── 4. Criar o controle WebView2 dinamicamente ────────────────────────────────
            _webView = new WebView2
            {
                HorizontalAlignment = HorizontalAlignment.Stretch,
                VerticalAlignment = VerticalAlignment.Stretch,
                DefaultBackgroundColor = System.Drawing.Color.FromArgb(11, 14, 20)
            };
            RootGrid.Children.Add(_webView);

            // ── 5. Inicializar WebView2 com opções de ambiente ──────────────
            var envOptions = new CoreWebView2EnvironmentOptions
            {
                // Permite requisições para o NinjaTrader local (localhost:8001), Supabase e auto-concessão de mídia/microfone
                AdditionalBrowserArguments = "--disable-web-security --allow-running-insecure-content --use-fake-ui-for-media-stream"
            };
            var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder, envOptions);
            await _webView.EnsureCoreWebView2Async(env);

            var cw2 = _webView.CoreWebView2;

            // Limpa cache de disco do WebView2 na inicialização para evitar bundle JS obsoleto
            try
            {
                await cw2.Profile.ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds.DiskCache);
            }
            catch { }

            cw2.Settings.IsStatusBarEnabled = false;
            cw2.Settings.AreDevToolsEnabled = true;
            cw2.Settings.IsWebMessageEnabled = true;
            cw2.Settings.AreDefaultContextMenusEnabled = true;

            // ── 6. Concessão Automática de Permissões (Microfone / Câmera / Notificações) ──
            cw2.PermissionRequested += (s, args) =>
            {
                if (args.PermissionKind == CoreWebView2PermissionKind.Microphone ||
                    args.PermissionKind == CoreWebView2PermissionKind.Camera ||
                    args.PermissionKind == CoreWebView2PermissionKind.Notifications)
                {
                    args.State = CoreWebView2PermissionState.Allow;
                    args.Handled = true;
                }
            };

            // ── 7. Mapeamento Virtual Host Oficial do WebView2 ──────────────
            // Mapeia https://axion.station/ diretamente para a pasta wwwroot.
            // Suporta nativamente ES Modules (type="module"), Web Workers, Cache e Supabase Auth.
            cw2.SetVirtualHostNameToFolderMapping(
                VirtualHost,
                _wwwrootDir,
                CoreWebView2HostResourceAccessKind.Allow
            );

            // ── 8. Diagnóstico de navegação ─────────────────────────────────
            cw2.NavigationCompleted += (s, args) =>
            {
                if (!args.IsSuccess)
                {
                    MessageBox.Show(
                        $"Aviso de carregamento da interface:\nStatus: {args.WebErrorStatus}\nCódigo HTTP: {args.HttpStatusCode}\n\nPressione F12 para abrir o console de diagnóstico.",
                        "Axion TradeStation — Carregamento",
                        MessageBoxButton.OK,
                        MessageBoxImage.Warning
                    );
                }
            };

            // ── 8. Navegar para a aplicação ─────────────────────────────────
            cw2.Navigate($"https://{VirtualHost}/index.html");
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Erro ao inicializar o motor de interface:\n{ex.Message}\n\nDetalhes:\n{ex.StackTrace}",
                "Axion TradeStation — Erro",
                MessageBoxButton.OK,
                MessageBoxImage.Error
            );
        }
    }

    private static bool IsWebView2Available()
    {
        try
        {
            string version = CoreWebView2Environment.GetAvailableBrowserVersionString();
            return !string.IsNullOrWhiteSpace(version);
        }
        catch
        {
            return false;
        }
    }

    private static async Task<bool> EnsureWebView2RuntimeAsync()
    {
        if (IsWebView2Available())
            return true;

        try
        {
            // Tentar download automático e instalação silenciosa do Microsoft Evergreen Bootstrapper
            string tempInstaller = Path.Combine(Path.GetTempPath(), "MicrosoftEdgeWebview2Setup.exe");
            using (var http = new System.Net.Http.HttpClient())
            {
                var bytes = await http.GetByteArrayAsync("https://go.microsoft.com/fwlink/p/?LinkId=2124703");
                await File.WriteAllBytesAsync(tempInstaller, bytes);
            }

            if (File.Exists(tempInstaller))
            {
                var psi = new ProcessStartInfo
                {
                    FileName = tempInstaller,
                    Arguments = "/silent /install",
                    UseShellExecute = true
                };
                var proc = Process.Start(psi);
                if (proc != null)
                {
                    await proc.WaitForExitAsync();
                    try { File.Delete(tempInstaller); } catch { }
                }

                if (IsWebView2Available())
                    return true;
            }
        }
        catch { }

        // Se a instalação silenciosa automática não obtiver sucesso, apresenta link direto
        var userResponse = MessageBox.Show(
            "O Axion TradeStation requer o componente oficial da Microsoft (Microsoft Edge WebView2 Runtime).\n\n" +
            "Deseja abrir a página oficial da Microsoft para instalá-lo agora?",
            "Axion TradeStation — Componente Windows Necessário",
            MessageBoxButton.YesNo,
            MessageBoxImage.Information
        );

        if (userResponse == MessageBoxResult.Yes)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "https://go.microsoft.com/fwlink/p/?LinkId=2124703",
                    UseShellExecute = true
                });
            }
            catch { }
        }

        return false;
    }

    private static string EnsureWwwRoot(string userDataFolder)
    {
        string targetWwwRoot = Path.Combine(userDataFolder, "wwwroot");

        // 1. Tentar extrair do recurso embutido (Single-File standalone autônomo)
        try
        {
            var assembly = Assembly.GetExecutingAssembly();
            using var zipStream = assembly.GetManifestResourceStream("Vortex.Desktop.wwwroot.zip");

            if (zipStream != null)
            {
                using var archive = new ZipArchive(zipStream, ZipArchiveMode.Read);
                var zipIndex = archive.GetEntry("index.html");

                bool needExtract = !Directory.Exists(targetWwwRoot) ||
                                   !File.Exists(Path.Combine(targetWwwRoot, "index.html"));

                if (!needExtract && zipIndex != null)
                {
                    try
                    {
                        var diskIndexInfo = new FileInfo(Path.Combine(targetWwwRoot, "index.html"));
                        if (diskIndexInfo.Length != zipIndex.Length)
                        {
                            needExtract = true;
                        }
                        else
                        {
                            using var s1 = zipIndex.Open();
                            using var s2 = File.OpenRead(diskIndexInfo.FullName);
                            using var sha = System.Security.Cryptography.SHA256.Create();
                            var h1 = Convert.ToHexString(sha.ComputeHash(s1));
                            var h2 = Convert.ToHexString(sha.ComputeHash(s2));
                            if (h1 != h2) needExtract = true;
                        }
                    }
                    catch
                    {
                        needExtract = true;
                    }
                }

                if (needExtract)
                {
                    Directory.CreateDirectory(targetWwwRoot);

                    foreach (var entry in archive.Entries)
                    {
                        if (string.IsNullOrEmpty(entry.Name)) continue; // Entrada de diretório
                        string destPath = Path.Combine(targetWwwRoot, entry.FullName);
                        string? dir = Path.GetDirectoryName(destPath);
                        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                        {
                            Directory.CreateDirectory(dir);
                        }
                        try
                        {
                            if (File.Exists(destPath)) File.SetAttributes(destPath, FileAttributes.Normal);
                            entry.ExtractToFile(destPath, overwrite: true);
                        }
                        catch { }
                    }
                }

                if (File.Exists(Path.Combine(targetWwwRoot, "index.html")))
                {
                    return targetWwwRoot;
                }
            }
        }
        catch { }

        // 2. Fallbacks de desenvolvimento (pasta local wwwroot ou dist do React)
        string baseDir = AppContext.BaseDirectory;
        string[] candidates =
        [
            Path.Combine(baseDir, "wwwroot"),
            Path.GetFullPath(Path.Combine(baseDir, @"..\..\..\..\..\dist")),
            Path.GetFullPath(Path.Combine(baseDir, @"..\..\..\..\dist")),
            Path.GetFullPath(Path.Combine(baseDir, @"..\..\..\dist")),
            Path.GetFullPath(Path.Combine(baseDir, @"..\..\dist")),
        ];

        foreach (string candidate in candidates)
        {
            if (Directory.Exists(candidate) && File.Exists(Path.Combine(candidate, "index.html")))
                return candidate;
        }

        return targetWwwRoot;
    }
}
