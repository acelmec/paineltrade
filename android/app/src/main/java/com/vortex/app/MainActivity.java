package com.vortex.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final int INITIAL_PERMISSIONS_REQUEST_CODE = 101;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebSettings webSettings = this.bridge.getWebView().getSettings();
            webSettings.setJavaScriptEnabled(true);
            webSettings.setDomStorageEnabled(true);
            webSettings.setMediaPlaybackRequiresUserGesture(false);

            // Permite que WebRTC e microfone funcionem perfeitamente dentro da WebView
            this.bridge.getWebView().setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> {
                        request.grant(request.getResources());
                    });
                }
            });
        }

        requestInitialAppPermissions();
        startVortexBackgroundService();
        requestIgnoreBatteryOptimization();
    }

    /**
     * onResume: app voltou ao primeiro plano.
     * Restaura os timers JavaScript para que as rotinas da WebView
     * (setInterval, setTimeout) voltem a executar normalmente.
     */
    @Override
    public void onResume() {
        super.onResume();
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().resumeTimers();
        }
        // Garante que o service continua rodando ao retornar ao primeiro plano
        startVortexBackgroundService();
        // Revalida isenção de bateria (pode ter sido revogada pelo usuário ou pelo OEM)
        requestIgnoreBatteryOptimization();
    }

    /**
     * onPause: app saiu do primeiro plano (tela bloqueada, app minimizado, etc.)
     * Pausa os timers JavaScript para reduzir consumo de CPU enquanto a WebView
     * não está visível — o BackgroundService nativo assume o controle das rotinas.
     */
    @Override
    public void onPause() {
        super.onPause();
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().pauseTimers();
        }
    }

    /**
     * onStop: app completamente invisível.
     * Mantém os timers pausados — o BackgroundService nativo é responsável
     * por manter as rotinas de monitoramento ativas.
     */
    @Override
    public void onStop() {
        super.onStop();
        // Timers JS já pausados no onPause — apenas garantia adicional
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().pauseTimers();
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private void requestInitialAppPermissions() {
        List<String> permissionsNeeded = new ArrayList<>();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            permissionsNeeded.add(Manifest.permission.RECORD_AUDIO);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }

        if (!permissionsNeeded.isEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                permissionsNeeded.toArray(new String[0]),
                INITIAL_PERMISSIONS_REQUEST_CODE
            );
        }
    }

    private void startVortexBackgroundService() {
        try {
            Intent serviceIntent = new Intent(this, BackgroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /**
     * Solicita isenção de otimização de bateria.
     * Compatível com todos os fabricantes: abre o diálogo padrão do Android
     * (ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS), sem depender de telas
     * específicas de OEM (Samsung, Xiaomi, Motorola, etc.).
     */
    private void requestIgnoreBatteryOptimization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }
}
