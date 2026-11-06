package com.vortex.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;

/**
 * BackgroundService — Mantém as rotinas do VortexWeb em execução contínua.
 *
 * Compatível com Android 8+ e todos os fabricantes (Samsung, Xiaomi, Motorola,
 * LG, Google Pixel, etc.). Sobrevive a:
 *   - Remoção do app da lista de recentes (via onTaskRemoved + stopWithTask=false)
 *   - Doze Mode / App Standby (via PARTIAL_WAKE_LOCK com timeout renovado)
 *   - Reboot do dispositivo (via BootReceiver)
 *   - Gestão de energia agressiva de OEMs (via Foreground Service com notificação válida)
 */
public class BackgroundService extends Service {

    private static final String CHANNEL_ID    = "VortexBackgroundChannel";
    private static final int    NOTIFICATION_ID = 1001;

    // WakeLock renova a cada 9 minutos para evitar que o sistema o considere
    // "esquecido" (timeout de 10 min é o limite seguro na maioria dos OEMs)
    private static final long WAKELOCK_TIMEOUT_MS = 9 * 60 * 1000L;

    private PowerManager.WakeLock wakeLock;
    private Handler wakeLockRenewalHandler;
    private final Runnable wakeLockRenewer = new Runnable() {
        @Override
        public void run() {
            renewWakeLock();
            // Agenda a próxima renovação
            wakeLockRenewalHandler.postDelayed(this, WAKELOCK_TIMEOUT_MS);
        }
    };

    // -------------------------------------------------------------------------
    // Ciclo de vida do Service
    // -------------------------------------------------------------------------

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        wakeLockRenewalHandler = new Handler(Looper.getMainLooper());
        acquireWakeLock();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForegroundWithNotification();

        // Inicia o ciclo de renovação do WakeLock
        wakeLockRenewalHandler.removeCallbacks(wakeLockRenewer);
        wakeLockRenewalHandler.postDelayed(wakeLockRenewer, WAKELOCK_TIMEOUT_MS);

        // START_STICKY: o sistema relança o service automaticamente se for morto
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        // Para o ciclo de renovação
        if (wakeLockRenewalHandler != null) {
            wakeLockRenewalHandler.removeCallbacks(wakeLockRenewer);
        }

        // Libera o WakeLock com segurança
        releaseWakeLock();

        super.onDestroy();
    }

    /**
     * onTaskRemoved é chamado quando o usuário remove o app da lista de recentes.
     * Agenda o relançamento do serviço via Intent explícito para garantir
     * continuidade em TODOS os fabricantes.
     */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);

        // Relança o service após 1 segundo via PendingIntent alarme
        Intent restartIntent = new Intent(getApplicationContext(), BackgroundService.class);
        restartIntent.setPackage(getPackageName());

        PendingIntent restartPendingIntent = PendingIntent.getService(
            getApplicationContext(),
            1,
            restartIntent,
            PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
        );

        android.app.AlarmManager alarmManager =
            (android.app.AlarmManager) getSystemService(ALARM_SERVICE);

        if (alarmManager != null) {
            alarmManager.set(
                android.app.AlarmManager.ELAPSED_REALTIME,
                android.os.SystemClock.elapsedRealtime() + 1000L,
                restartPendingIntent
            );
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private void startForegroundWithNotification() {
        // Intent para abrir o app ao tocar na notificação
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("VortexWeb em Segundo Plano")
            .setContentText("Monitorando mercado, robôs e operações ativas...")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            // PRIORITY_MAX garante visibilidade mesmo em OEMs agressivos
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC |
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                );
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            // Fallback sem tipo específico (Android < 10)
            try {
                startForeground(NOTIFICATION_ID, notification);
            } catch (Exception ex) {
                ex.printStackTrace();
            }
        }
    }

    private void acquireWakeLock() {
        try {
            PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "VortexWeb::BackgroundWakeLock"
                );
                // Timeout explícito evita detecção como "WakeLock esquecido"
                wakeLock.acquire(WAKELOCK_TIMEOUT_MS);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void renewWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
            PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "VortexWeb::BackgroundWakeLock"
                );
                wakeLock.acquire(WAKELOCK_TIMEOUT_MS);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
                wakeLock = null;
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                CHANNEL_ID,
                "VortexWeb Monitoramento",
                // IMPORTANCE_HIGH é consistente com PRIORITY_MAX e obrigatório
                // para foreground services sobreviverem em OEMs com Doze Mode agressivo
                NotificationManager.IMPORTANCE_HIGH
            );
            serviceChannel.setDescription("Mantém monitoramento de mercado e robôs ativos");
            serviceChannel.setShowBadge(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(serviceChannel);
            }
        }
    }
}
