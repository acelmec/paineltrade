using System.IO;
using System.Windows;

namespace Vortex.Desktop;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        AppDomain.CurrentDomain.UnhandledException += (s, args) =>
        {
            var ex = args.ExceptionObject as Exception;
            File.WriteAllText("crash_log.txt", ex?.ToString() ?? "Unknown crash");
            MessageBox.Show($"Erro fatal na inicialização: {ex?.Message}\n\nDetalhes:\n{ex?.StackTrace}", "Vortex Crash", MessageBoxButton.OK, MessageBoxImage.Error);
        };

        DispatcherUnhandledException += (s, args) =>
        {
            File.WriteAllText("crash_log.txt", args.Exception.ToString());
            MessageBox.Show($"Erro de Dispatcher: {args.Exception.Message}\n\nDetalhes:\n{args.Exception.StackTrace}", "Vortex Error", MessageBoxButton.OK, MessageBoxImage.Error);
            args.Handled = true;
        };
    }
}
