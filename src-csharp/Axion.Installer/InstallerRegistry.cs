using System;
using System.Diagnostics;
using System.IO;
using System.Windows;
using Microsoft.Win32;

namespace Axion.Installer;

public static class InstallerRegistry
{
    public const string AppId = "AxionTradeStation";
    public const string AppName = "Axion TradeStation";
    public const string DefaultVersion = "1.0.0";
    public const string PublisherName = "VM Trader";
    public const string WebsiteUrl = "https://vmtrader.com.br";

    private const string UninstallRegistryKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\" + AppId;

    public static void RegisterInWindows(string installPath, string exePath, string version = DefaultVersion)
    {
        try
        {
            using var baseKey = Registry.CurrentUser.CreateSubKey(UninstallRegistryKeyPath);
            if (baseKey == null) return;

            string uninstallExePath = Path.Combine(installPath, "uninstall.exe");

            baseKey.SetValue("DisplayName", AppName, RegistryValueKind.String);
            baseKey.SetValue("DisplayVersion", version, RegistryValueKind.String);
            baseKey.SetValue("Publisher", PublisherName, RegistryValueKind.String);
            baseKey.SetValue("InstallLocation", installPath, RegistryValueKind.String);
            baseKey.SetValue("DisplayIcon", $"{exePath},0", RegistryValueKind.String);
            baseKey.SetValue("UninstallString", $"\"{uninstallExePath}\" --uninstall", RegistryValueKind.String);
            baseKey.SetValue("QuietUninstallString", $"\"{uninstallExePath}\" --uninstall --silent", RegistryValueKind.String);
            baseKey.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"), RegistryValueKind.String);
            baseKey.SetValue("URLInfoAbout", WebsiteUrl, RegistryValueKind.String);
            baseKey.SetValue("HelpLink", WebsiteUrl, RegistryValueKind.String);
            baseKey.SetValue("NoModify", 1, RegistryValueKind.DWord);
            baseKey.SetValue("NoRepair", 1, RegistryValueKind.DWord);

            // Calcula tamanho estimado em KB para exibição no painel
            try
            {
                long totalBytes = 0;
                if (Directory.Exists(installPath))
                {
                    foreach (var file in Directory.GetFiles(installPath, "*", SearchOption.AllDirectories))
                    {
                        totalBytes += new FileInfo(file).Length;
                    }
                }
                baseKey.SetValue("EstimatedSize", (int)(totalBytes / 1024), RegistryValueKind.DWord);
            }
            catch
            {
                baseKey.SetValue("EstimatedSize", 75000, RegistryValueKind.DWord);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Erro ao registrar no Windows Registry: {ex.Message}");
        }
    }

    public static void UnregisterFromWindows()
    {
        try
        {
            using var parentKey = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true);
            parentKey?.DeleteSubKeyTree(AppId, false);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Erro ao remover chave de desinstalação: {ex.Message}");
        }
    }

    public static void ExecuteUninstall(bool isSilent)
    {
        if (!isSilent)
        {
            var confirm = MessageBox.Show(
                $"Deseja realmente remover o {AppName} e todos os seus componentes do computador?",
                $"Desinstalar {AppName}",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);

            if (confirm != MessageBoxResult.Yes)
            {
                return;
            }
        }

        try
        {
            // 1. Encerra processos do AxionTradeStation se estiverem abertos
            foreach (var p in Process.GetProcessesByName("AxionTradeStation"))
            {
                try
                {
                    p.Kill();
                    p.WaitForExit(2000);
                }
                catch { }
            }

            // 2. Determina diretório de instalação a partir do executável atual ou do Registry
            string installPath = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            try
            {
                using var regKey = Registry.CurrentUser.OpenSubKey(UninstallRegistryKeyPath);
                string? regLocation = regKey?.GetValue("InstallLocation") as string;
                if (!string.IsNullOrWhiteSpace(regLocation) && Directory.Exists(regLocation))
                {
                    installPath = regLocation.TrimEnd('\\', '/');
                }
            }
            catch { }

            // 3. Remove atalho da Área de Trabalho
            string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string desktopShortcut = Path.Combine(desktopDir, $"{AppName}.lnk");
            if (File.Exists(desktopShortcut))
            {
                try { File.Delete(desktopShortcut); } catch { }
            }

            // 4. Remove atalhos e pasta do Menu Iniciar
            string startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), PublisherName);
            string startMenuShortcut = Path.Combine(startMenuDir, $"{AppName}.lnk");
            if (File.Exists(startMenuShortcut))
            {
                try { File.Delete(startMenuShortcut); } catch { }
            }
            if (Directory.Exists(startMenuDir))
            {
                try
                {
                    if (Directory.GetFiles(startMenuDir).Length == 0 && Directory.GetDirectories(startMenuDir).Length == 0)
                    {
                        Directory.Delete(startMenuDir);
                    }
                }
                catch { }
            }

            // 5. Remove o registro do Painel de Controle / Configurações do Windows
            UnregisterFromWindows();

            // 6. Remove os arquivos da pasta de instalação (exceto o próprio desinstalador em execução)
            string currentExe = Environment.ProcessPath ?? "";
            if (Directory.Exists(installPath))
            {
                foreach (var file in Directory.GetFiles(installPath))
                {
                    if (!string.Equals(file, currentExe, StringComparison.OrdinalIgnoreCase))
                    {
                        try { File.Delete(file); } catch { }
                    }
                }
                foreach (var dir in Directory.GetDirectories(installPath))
                {
                    try { Directory.Delete(dir, true); } catch { }
                }
            }

            // 7. Agenda a remoção definitiva do executável e da pasta de instalação via comando assíncrono em segundo plano
            string cleanupCmd = $"/C choice /C Y /N /D Y /T 2 > NUL & rmdir /s /q \"{installPath}\"";
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = cleanupCmd,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                });
            }
            catch { }

            if (!isSilent)
            {
                MessageBox.Show(
                    $"O {AppName} foi desinstalado com sucesso do seu computador.",
                    "Desinstalação Concluída",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);
            }
        }
        catch (Exception ex)
        {
            if (!isSilent)
            {
                MessageBox.Show(
                    $"Ocorreu um erro ao desinstalar:\n{ex.Message}",
                    "Erro na Desinstalação",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
            }
        }
    }
}
