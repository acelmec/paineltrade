using System;
using System.Windows;

namespace Axion.Installer;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        bool isUninstall = false;
        bool isSilent = false;

        foreach (var arg in e.Args)
        {
            if (arg.Equals("--uninstall", StringComparison.OrdinalIgnoreCase) ||
                arg.Equals("/uninstall", StringComparison.OrdinalIgnoreCase) ||
                arg.Equals("-uninstall", StringComparison.OrdinalIgnoreCase))
            {
                isUninstall = true;
            }

            if (arg.Equals("--silent", StringComparison.OrdinalIgnoreCase) ||
                arg.Equals("/silent", StringComparison.OrdinalIgnoreCase) ||
                arg.Equals("/s", StringComparison.OrdinalIgnoreCase) ||
                arg.Equals("-s", StringComparison.OrdinalIgnoreCase))
            {
                isSilent = true;
            }
        }

        if (isUninstall)
        {
            InstallerRegistry.ExecuteUninstall(isSilent);
            Shutdown();
            return;
        }
    }
}
