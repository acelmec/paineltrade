package com.vortex.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * BootReceiver — Relança o BackgroundService automaticamente após:
 *   - Reboot padrão do dispositivo (BOOT_COMPLETED)      → todos os fabricantes
 *   - Boot rápido Samsung / Huawei (QUICKBOOT_POWERON)   → OEMs específicos
 *   - Atualização do próprio APK (MY_PACKAGE_REPLACED)   → pós-update automático
 *
 * Registrado no AndroidManifest.xml com a permissão RECEIVE_BOOT_COMPLETED.
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;

        if (action == null) return;

        boolean shouldStart = false;

        switch (action) {
            case Intent.ACTION_BOOT_COMPLETED:
                // Boot padrão Android — funciona em todos os fabricantes
                shouldStart = true;
                break;
            case "android.intent.action.QUICKBOOT_POWERON":
                // Boot rápido Samsung One UI / Huawei EMUI
                shouldStart = true;
                break;
            case Intent.ACTION_MY_PACKAGE_REPLACED:
                // APK atualizado — garante que o service volte após update
                shouldStart = true;
                break;
            default:
                break;
        }

        if (shouldStart) {
            startBackgroundService(context);
        }
    }

    private void startBackgroundService(Context context) {
        try {
            Intent serviceIntent = new Intent(context, BackgroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // Android 8+ exige startForegroundService para services em background
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
