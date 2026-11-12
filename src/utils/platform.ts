import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

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

/**
 * Retorna true se estiver rodando como aplicativo nativo Android (Capacitor APK).
 */
export const isAndroidNative = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
};

/**
 * Verifica se o dispositivo do usuário é um dispositivo móvel (smartphone/tablet).
 */
export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isAndroidNative()) return true;
  const userAgent = (window.navigator?.userAgent || '').toLowerCase();
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
};

/**
 * Retorna true se a interface deve operar no modo Mobile adaptativo.
 * NUNCA ativa no app Desktop (.exe Windows / Electron / Tauri) para preservar 100% da experiência de trabalho.
 */
export const isMobileView = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isDesktopApp()) return false;
  if (isAndroidNative()) return true;
  return window.innerWidth < 768;
};

/**
 * Hook reativo para detecção de modo Mobile/Android em componentes React.
 */
export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState<boolean>(() => isMobileView());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setIsMobile(isMobileView());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
};


