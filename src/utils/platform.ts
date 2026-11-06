/**
 * Utilitário para verificar a plataforma de execução do aplicativo.
 * Retorna true APENAS quando o aplicativo está rodando como app de desktop (.exe Windows / Tauri V2 / Electron).
 */
export const isDesktopApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  // 1. Verifica se está rodando sob Tauri V2 ou Tauri V1
  if (
    Boolean((window as any).__TAURI_INTERNALS__) ||
    Boolean((window as any).__TAURI__) ||
    Boolean((window as any).__TAURI_METADATA__) ||
    Boolean((window as any).__TAURI_IPC__)
  ) {
    return true;
  }

  // 2. Verifica se window.isElectron foi injetado pelo preload do Electron
  if ((window as any).isElectron === true) {
    return true;
  }
  
  // 3. Verifica se o User Agent contém 'electron' ou 'tauri'
  const userAgent = (window.navigator?.userAgent || '').toLowerCase();
  if (userAgent.includes('electron') || userAgent.includes('tauri')) {
    return true;
  }
  
  // 4. Verifica se possui o processo electron em window
  if (Boolean((window as any).electron) || Boolean((window as any).ipcRenderer)) {
    return true;
  }

  return false;
};

// Mantém exportação isElectronApp como alias para compatibilidade com chamadas existentes
export const isElectronApp = isDesktopApp;

