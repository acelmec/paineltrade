using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Win32;

namespace Axion.Installer;

public partial class MainWindow : Window
{
    private enum InstallStep
    {
        Configuration,
        Installing,
        Completed
    }

    private InstallStep _currentStep = InstallStep.Configuration;
    private string _installedExePath = string.Empty;

    public MainWindow()
    {
        InitializeComponent();

        // Pasta padrão de instalação do usuário: %LocalAppData%\Programs\AxionTradeStation
        string defaultDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Programs",
            "AxionTradeStation"
        );
        TxtInstallPath.Text = defaultDir;

        string existingExe = Path.Combine(defaultDir, "AxionTradeStation.exe");
        if (File.Exists(existingExe))
        {
            TxtWelcomeTitle.Text = "Atualização do Axion TradeStation";
            TxtWelcomeDesc.Text = "Detectamos uma instalação existente do Axion TradeStation. Este assistente atualizará os binários e componentes essenciais preservando suas preferências.";
            BtnAction.Content = "Atualizar Agora";
        }
    }

    private void BtnBrowse_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFolderDialog
        {
            Title = "Selecione a pasta para instalação do Axion TradeStation",
            InitialDirectory = TxtInstallPath.Text
        };

        if (dialog.ShowDialog() == true && !string.IsNullOrWhiteSpace(dialog.FolderName))
        {
            TxtInstallPath.Text = Path.Combine(dialog.FolderName, "AxionTradeStation");
        }
    }

    private async void BtnAction_Click(object sender, RoutedEventArgs e)
    {
        if (_currentStep == InstallStep.Configuration)
        {
            string installPath = TxtInstallPath.Text.Trim();
            if (string.IsNullOrEmpty(installPath))
            {
                MessageBox.Show("Por favor, selecione uma pasta de destino válida.", "Aviso", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            bool createDesktop = ChkDesktopShortcut.IsChecked == true;
            bool createStartMenu = ChkStartMenuShortcut.IsChecked == true;

            // Transição para etapa de progresso
            _currentStep = InstallStep.Installing;
            ConfigPanel.Visibility = Visibility.Collapsed;
            ProgressPanel.Visibility = Visibility.Visible;
            BtnBrowse.IsEnabled = false;
            BtnCancel.IsEnabled = false;
            BtnAction.IsEnabled = false;
            BtnAction.Content = "Aguarde...";

            try
            {
                await PerformInstallationAsync(installPath, createDesktop, createStartMenu);

                _currentStep = InstallStep.Completed;
                ProgressPanel.Visibility = Visibility.Collapsed;
                FinishedPanel.Visibility = Visibility.Visible;

                BtnCancel.Visibility = Visibility.Collapsed;
                BtnAction.IsEnabled = true;
                BtnAction.Content = "Concluir";
                BtnAction.Background = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(22, 163, 74));
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Ocorreu um erro durante a instalação:\n{ex.Message}", "Erro na Instalação", MessageBoxButton.OK, MessageBoxImage.Error);
                _currentStep = InstallStep.Configuration;
                ProgressPanel.Visibility = Visibility.Collapsed;
                ConfigPanel.Visibility = Visibility.Visible;
                BtnBrowse.IsEnabled = true;
                BtnCancel.IsEnabled = true;
                BtnAction.IsEnabled = true;
                BtnAction.Content = "Tentar Novamente";
            }
        }
        else if (_currentStep == InstallStep.Completed)
        {
            if (ChkRunAtFinish.IsChecked == true && !string.IsNullOrEmpty(_installedExePath) && File.Exists(_installedExePath))
            {
                try
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = _installedExePath,
                        WorkingDirectory = Path.GetDirectoryName(_installedExePath),
                        UseShellExecute = true
                    });
                }
                catch { }
            }

            Close();
        }
    }

    private void BtnCancel_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    private async Task PerformInstallationAsync(string installPath, bool createDesktop, bool createStartMenu)
    {
        UpdateProgress(10, "Fechando instâncias anteriores do Axion TradeStation...", "Liberando processos em execução...");
        foreach (var p in Process.GetProcessesByName("AxionTradeStation"))
        {
            try { p.Kill(); await Task.Delay(300); } catch { }
        }

        UpdateProgress(20, "Criando diretório de instalação...", "Verificando permissões de escrita...");
        await Task.Delay(300);

        if (!Directory.Exists(installPath))
        {
            Directory.CreateDirectory(installPath);
        }

        UpdateProgress(35, "Extraindo pacote do Axion TradeStation...", "Copiando binários do motor .NET 8 e interface gráfica...");
        await Task.Delay(400);

        _installedExePath = Path.Combine(installPath, "AxionTradeStation.exe");

        // 1. Extrai o executável do recurso embutido (Payload\AxionTradeStation.exe)
        var assembly = Assembly.GetExecutingAssembly();
        using (var stream = assembly.GetManifestResourceStream("Axion.Installer.Payload.AxionTradeStation.exe"))
        {
            if (stream != null)
            {
                using var fs = new FileStream(_installedExePath, FileMode.Create, FileAccess.Write, FileShare.None);
                await stream.CopyToAsync(fs);
            }
            else
            {
                // Fallback caso executado em ambiente de desenvolvimento
                string localDevExe = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "AxionTradeStation.exe");
                if (File.Exists(localDevExe))
                {
                    File.Copy(localDevExe, _installedExePath, true);
                }
                else
                {
                    throw new FileNotFoundException("Pacote do AxionTradeStation.exe não encontrado dentro do instalador.");
                }
            }
        }

        // 2. Cria o desinstalador autônomo (copiando este executável para uninstall.exe)
        UpdateProgress(60, "Configurando desinstalador do sistema...", "Habilitando módulo de desinstalação nativa...");
        await Task.Delay(200);

        try
        {
            string currentInstaller = Environment.ProcessPath ?? Process.GetCurrentProcess().MainModule?.FileName ?? "";
            string uninstallerDest = Path.Combine(installPath, "uninstall.exe");
            if (!string.IsNullOrEmpty(currentInstaller) && File.Exists(currentInstaller))
            {
                File.Copy(currentInstaller, uninstallerDest, true);
            }
        }
        catch { }

        UpdateProgress(75, "Criando atalhos no Windows...", "Configurando inicializadores do sistema...");
        await Task.Delay(200);

        // 3. Criar atalhos solicitados
        if (createDesktop)
        {
            string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string desktopShortcut = Path.Combine(desktopPath, "Axion TradeStation.lnk");
            CreateShortcut(desktopShortcut, _installedExePath, "Axion TradeStation by VM Trader");
        }

        if (createStartMenu)
        {
            string startMenuDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Programs),
                "VM Trader"
            );
            Directory.CreateDirectory(startMenuDir);
            string startMenuShortcut = Path.Combine(startMenuDir, "Axion TradeStation.lnk");
            CreateShortcut(startMenuShortcut, _installedExePath, "Axion TradeStation by VM Trader");
        }

        // 4. Registra no Painel de Controle e Configurações do Windows (Aplicativos Instalados)
        UpdateProgress(90, "Registrando no Painel de Controle do Windows...", "Habilitando desinstalação e atualização nativa do Windows...");
        await Task.Delay(200);

        InstallerRegistry.RegisterInWindows(installPath, _installedExePath);

        UpdateProgress(100, "Operação concluída com sucesso!", "Todos os componentes e integrações do Windows foram configurados.");
        await Task.Delay(400);
    }

    private void UpdateProgress(int percentage, string status, string detail)
    {
        Dispatcher.Invoke(() =>
        {
            ProgressBarInst.Value = percentage;
            TxtProgressStatus.Text = status;
            TxtProgressDetail.Text = detail;
        });
    }

    private static void CreateShortcut(string shortcutPath, string targetPath, string description)
    {
        try
        {
            Type? shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType != null)
            {
                dynamic? shell = Activator.CreateInstance(shellType);
                if (shell != null)
                {
                    dynamic shortcut = shell.CreateShortcut(shortcutPath);
                    shortcut.TargetPath = targetPath;
                    shortcut.WorkingDirectory = Path.GetDirectoryName(targetPath);
                    shortcut.Description = description;
                    shortcut.IconLocation = $"{targetPath},0";
                    shortcut.Save();
                }
            }
        }
        catch { }
    }
}
