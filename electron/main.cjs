const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { fork } = require('child_process');

// Flags de Alto Desempenho e Aceleração Gráfica por Hardware no Chromium
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-hardware-overlays', 'single-fullscreen,single-on-top,underlay');

let workerProcess = null;
let mainWindow = null;
let canClose = true; // No login começa liberado (permite fechar)

function startBackgroundWorker() {
  // Apenas inicia o worker separado se expressamente habilitado via variável de ambiente,
  // evitando duplicidade de requisições e processamento concorrente com a UI
  if (process.env.RUN_WORKER !== 'true') {
    return;
  }
  try {
    const workerPath = path.join(__dirname, '../src/backgroundWorker.js');
    workerProcess = fork(workerPath, [], {
      stdio: 'ignore',
      env: { ...process.env }
    });
    console.log('[ELECTRON] Background worker spawned with PID:', workerProcess.pid);
  } catch (err) {
    console.error('[ELECTRON] Failed to spawn background worker:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: 'VortexWeb Desktop',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.cjs')
    },
  });

  // Intercepta a tentativa de fechar a janela (bloqueia Alt+F4 e cliques se não puder fechar)
  mainWindow.on('close', (e) => {
    if (!canClose) {
      e.preventDefault();
      console.log('[ELECTRON] Fechamento bloqueado. O usuário deve deslogar pelo botão SAIR.');
    }
  });

  // Aplica o estado de closable na janela
  mainWindow.setClosable(canClose);

  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:8080';
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// IPC para atualizar o estado de permissão de fechamento da janela
ipcMain.on('set-closable', (event, closable) => {
  canClose = Boolean(closable);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setClosable(canClose);
  }
});

// IPC para fechar o aplicativo expressamente
ipcMain.on('close-app', () => {
  canClose = true;
  app.quit();
});

app.whenReady().then(() => {
  startBackgroundWorker();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  if (workerProcess) {
    try { workerProcess.kill(); } catch (e) {}
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
