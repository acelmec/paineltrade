import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { signInUser, signUpUser, signOutUser, checkActiveSession } from '../services/auth';
import {
  fetchMarketDataSupabase,
  fetchForceSupabase,
  fetchGammaLevelsSupabase,
  fetchScreenshotSupabase,
  fetchNewsSupabase,
  fetchLocalSinal
} from '../services/db';
import type {
  MarketData,
  GammaLevels,
  EconomicNewsItem
} from '../services/db';
import { runMarketAnalysis } from '../services/ai';
import type { AIResponse } from '../services/ai';

function playAlertBeep(frequency = 440, duration = 150) {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.frequency.value = frequency;
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); // volume
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + (duration / 1000));
  } catch (e) {
    console.error('AudioContext fail', e);
  }
}

export interface SystemLog {
  id: string;
  time: string;
  prefix: string;
  content: string;
  type: 'sistema' | 'alerta' | 'ia' | 'erro' | 'noticia';
}

interface AppContextType {
  user: any;
  panel: any;
  settings: any;
  sessionId: string | null;
  isAuthenticated: boolean;
  isCheckingAuth: boolean;
  signIn: (email: string, password: string, subId?: string) => Promise<boolean>;
  signUp: (email: string, password: string, subId: string) => Promise<boolean>;
  logout: () => Promise<void>;
  
  // Dados do Mercado
  marketData: MarketData | null;
  forces: { symbol: string; buy: number; sell: number }[];
  gammaLevels: GammaLevels | null;
  news: EconomicNewsItem[];
  screenshot: string | null;
  
  // Inteligência Artificial
  aiEnabled: boolean;
  isAnalyzing: boolean;
  aiResult: AIResponse | null;
  setAiEnabled: (enabled: boolean) => void;
  runManualAIAnalysis: () => Promise<void>;
  
  // Logs do Sistema
  systemLogs: SystemLog[];
  addLog: (prefix: string, content: string, type: SystemLog['type']) => void;
  clearLogs: () => void;
  
  // Configurações
  saveSettings: (updatedFields: Partial<any>) => Promise<boolean>;
  refreshMarketData: () => Promise<void>;
  authError: string | null;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [panel, setPanel] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Dados do Mercado
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [forces, setForces] = useState<{ symbol: string; buy: number; sell: number }[]>([]);
  const [gammaLevels, setGammaLevels] = useState<GammaLevels | null>(null);
  const [news, setNews] = useState<EconomicNewsItem[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);

  // IA
  const [aiEnabled, setAiEnabledState] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [aiResult, setAiResult] = useState<AIResponse | null>(null);

  // Logs
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);

  // Ref de controle dos loops
  const marketLoopRef = useRef<any>(null);
  const aiLoopRef = useRef<any>(null);
  const sessionCheckRef = useRef<any>(null);
  const lastAlertTimeRef = useRef<number>(0);

  const addLog = (prefix: string, content: string, type: SystemLog['type']) => {
    const newLog: SystemLog = {
      id: Math.random().toString(36).substring(2) + Date.now().toString(36),
      time: new Date().toLocaleTimeString(),
      prefix,
      content,
      type
    };
    setSystemLogs(prev => [newLog, ...prev].slice(0, 100)); // Limite de 100 logs
  };

  const clearLogs = () => setSystemLogs([]);

  // 1. Carregar usuário e configurações ao iniciar
  useEffect(() => {
    async function loadSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
          const storedSessionId = localStorage.getItem('vortex_session_id');
          if (storedSessionId) {
            // Verificar se ainda é a sessão ativa no banco
            const active = await checkActiveSession(session.user.id, storedSessionId);
            if (active) {
              setUser(session.user);
              setSessionId(storedSessionId);
              setIsAuthenticated(true);
              addLog('SISTEMA', `Sessão restabelecida para ${session.user.email}`, 'sistema');
              await loadUserSettings(session.user.id);
            } else {
              localStorage.removeItem('vortex_session_id');
              await supabase.auth.signOut();
              addLog('ALERTA', 'Sessão anterior invalidada (Login realizado em outro local).', 'alerta');
            }
          }
        }
      } catch (err) {
        console.error('[CONTEXT] Erro ao carregar sessão:', err);
      } finally {
        setIsCheckingAuth(false);
      }
    }

    loadSession();

    // Listener de Auth do Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, _session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setPanel(null);
        setSettings(null);
        setSessionId(null);
        setIsAuthenticated(false);
        setMarketData(null);
        setForces([]);
        setGammaLevels(null);
        setScreenshot(null);
        setAiEnabledState(false);
        setAiResult(null);
        addLog('SISTEMA', 'Usuário desconectado.', 'sistema');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 2. Carregar painel e configurações
  async function loadUserSettings(userId: string) {
    try {
      // Buscar painel
      let { data: panelData, error: panelError } = await supabase
        .from('painelvm_panels')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (panelError) throw panelError;

      // Se não existir, criar um padrão
      if (!panelData) {
        const { data: newPanel, error: createError } = await supabase
          .from('painelvm_panels')
          .insert({ user_id: userId, instance_id: 'painel_principal', name: 'Painel Principal' })
          .select()
          .single();

        if (createError) throw createError;
        panelData = newPanel;
      }

      setPanel(panelData);

      // Buscar configurações vinculadas
      let { data: settingsData, error: settingsError } = await supabase
        .from('painelvm_settings')
        .select('*')
        .eq('panel_id', panelData.id)
        .maybeSingle();

      if (settingsError) throw settingsError;

      // Se não existir, criar padrão
      if (!settingsData) {
        const { data: newSettings, error: createSetError } = await supabase
          .from('painelvm_settings')
          .insert({
            panel_id: panelData.id,
            ai_provider: 'groq',
            groq_model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            intervalo: 30000,
            enviar_imagem_ia: true,
            gamma_symbol: 'NQ',
            instance_id_market: 'nt8_main',
            instance_id_force: 'painel_principal',
            instance_id_screen: 'nt8_main',
            source_market: 'supabase',
            source_screen: 'supabase'
          })
          .select()
          .single();

        if (createSetError) throw createSetError;
        settingsData = newSettings;
      }

      setSettings(settingsData);
      addLog('SISTEMA', `Configurações do painel '${panelData.instance_id}' carregadas.`, 'sistema');
    } catch (err: any) {
      console.error('[CONTEXT] Erro ao carregar configurações do usuário:', err);
      addLog('ERRO', `Erro ao carregar configurações: ${err.message}`, 'erro');
    }
  }

  // 3. Funções de Autenticação
  const signIn = async (email: string, password: string, subId?: string): Promise<boolean> => {
    setAuthError(null);
    const res = await signInUser(email, password, subId);
    if (res.success && res.user && res.sessionId) {
      setUser(res.user);
      setSessionId(res.sessionId);
      setIsAuthenticated(true);
      addLog('SISTEMA', `Login efetuado com sucesso por ${res.user.email}`, 'sistema');
      await loadUserSettings(res.user.id);
      return true;
    } else {
      setAuthError(res.message);
      addLog('ERRO', `Falha no login: ${res.message}`, 'erro');
      return false;
    }
  };

  const signUp = async (email: string, password: string, subId: string): Promise<boolean> => {
    setAuthError(null);
    const res = await signUpUser(email, password, subId);
    if (res.success && res.user && res.sessionId) {
      setUser(res.user);
      setSessionId(res.sessionId);
      setIsAuthenticated(true);
      localStorage.setItem('vortex_session_id', res.sessionId);
      addLog('SISTEMA', `Conta criada e ativada com sucesso: ${res.user.email}`, 'sistema');
      await loadUserSettings(res.user.id);
      return true;
    } else {
      setAuthError(res.message);
      addLog('ERRO', `Falha no cadastro: ${res.message}`, 'erro');
      return false;
    }
  };

  const logout = async () => {
    await signOutUser();
    setUser(null);
    setSessionId(null);
    setIsAuthenticated(false);
  };

  // 4. Salvar Configurações
  const saveSettings = async (updatedFields: Partial<any>): Promise<boolean> => {
    if (!settings || !panel) return false;

    try {
      const newSettings = { ...settings, ...updatedFields };
      
      const { error } = await supabase
        .from('painelvm_settings')
        .update(updatedFields)
        .eq('id', settings.id);

      if (error) throw error;

      setSettings(newSettings);
      addLog('SISTEMA', 'Configurações atualizadas com sucesso.', 'sistema');
      return true;
    } catch (err: any) {
      console.error('[CONTEXT] Erro ao salvar configurações:', err);
      addLog('ERRO', `Erro ao salvar configurações: ${err.message}`, 'erro');
      return false;
    }
  };

  // 5. Loops de Atualização de Dados (Preço, Níveis, Força)
  const refreshMarketData = async () => {
    if (!settings) return;

    try {
      const mode = settings.source_market;
      const instanceMarket = settings.instance_id_market;
      const instanceForce = settings.instance_id_force;
      const gammaSymbol = settings.gamma_symbol;
      const instanceScreen = settings.instance_id_screen;

      // a. Buscar Market Data (Local ou Supabase)
      let mData: MarketData | null = null;
      if (mode === 'local') {
        mData = await fetchLocalSinal();
      } else {
        mData = await fetchMarketDataSupabase(instanceMarket);
      }

      if (mData) {
        setMarketData(mData);
      }

      // b. Buscar Força (Sempre Supabase)
      const forceData = await fetchForceSupabase(instanceForce);
      if (forceData) {
        setForces(forceData.forces);
      }

      // c. Buscar Níveis Gamma (Sempre Supabase)
      const levels = await fetchGammaLevelsSupabase(gammaSymbol);
      if (levels) {
        setGammaLevels(levels);
      }

      // d. Buscar Captura de Tela (Gráfico)
      const screenshotData = await fetchScreenshotSupabase(instanceScreen);
      if (screenshotData) {
        setScreenshot(screenshotData);
      }

      // e. Verificação de Limites de Alerta
      if (mData) {
        const zScore = Number(mData.zScore);
        const delta = Number(mData.delta);
        
        const zMin = settings.alert_zscore_min !== undefined ? Number(settings.alert_zscore_min) : -2.0;
        const zMax = settings.alert_zscore_max !== undefined ? Number(settings.alert_zscore_max) : 2.0;
        const dMin = settings.alert_delta_min !== undefined ? Number(settings.alert_delta_min) : -10000;
        const dMax = settings.alert_delta_max !== undefined ? Number(settings.alert_delta_max) : 10000;

        let triggered = false;
        let motive = '';

        if (zScore < zMin || zScore > zMax) {
          triggered = true;
          motive = `Z-Score atingiu limite crítico: ${zScore.toFixed(2)}`;
        } else if (delta < dMin || delta > dMax) {
          triggered = true;
          motive = `Delta atingiu limite crítico: ${delta}`;
        }

        if (triggered) {
          const now = Date.now();
          if (now - lastAlertTimeRef.current > 30000) { // Cooldown de 30s
            addLog('ALERTA', motive, 'alerta');
            if (settings.alert_sound_enabled) {
              playAlertBeep(587.33, 250); // Beep D5
            }
            lastAlertTimeRef.current = now;
          }
        }
      }
    } catch (err) {
      console.error('[CONTEXT] Erro ao atualizar dados de mercado:', err);
    }
  };

  // Inicializar Notícias uma vez e atualizar periodicamente
  const updateNews = async () => {
    const list = await fetchNewsSupabase();
    setNews(list);
  };

  useEffect(() => {
    if (isAuthenticated) {
      updateNews();
      const newsInterval = setInterval(updateNews, 300000); // 5 minutos
      return () => clearInterval(newsInterval);
    }
  }, [isAuthenticated]);

  // Loop de Market Data
  useEffect(() => {
    if (isAuthenticated && settings) {
      refreshMarketData();
      
      // Rodar a cada 5 segundos para atualizações visuais rápidas
      marketLoopRef.current = setInterval(refreshMarketData, 5000);
      
      return () => {
        if (marketLoopRef.current) clearInterval(marketLoopRef.current);
      };
    }
  }, [isAuthenticated, settings]);

  // 6. Controle de Acesso Único (Verificar a cada 10 segundos)
  useEffect(() => {
    if (isAuthenticated && user && sessionId) {
      sessionCheckRef.current = setInterval(async () => {
        const active = await checkActiveSession(user.id, sessionId);
        if (!active) {
          addLog('ALERTA', 'Conta detectada em outro login. Desconectando...', 'alerta');
          alert('Sua conta foi acessada em outro dispositivo. Esta sessão foi encerrada.');
          logout();
        }
      }, 10000);

      return () => {
        if (sessionCheckRef.current) clearInterval(sessionCheckRef.current);
      };
    }
  }, [isAuthenticated, user, sessionId]);

  // 7. Lógica do Ciclo da Inteligência Artificial
  const runManualAIAnalysis = async () => {
    if (!settings || !marketData) {
      addLog('IA', 'Erro: Dados do mercado ou configurações ausentes para análise.', 'erro');
      return;
    }

    setIsAnalyzing(true);
    addLog('IA', `Iniciando análise com provedor: ${settings.ai_provider.toUpperCase()}...`, 'ia');

    const apiKey = 
      settings.ai_provider === 'groq' ? settings.groq_api_key :
      settings.ai_provider === 'gemini' ? settings.gemini_api_key :
      settings.openai_api_key;

    const model = 
      settings.ai_provider === 'groq' ? settings.groq_model :
      settings.ai_provider === 'gemini' ? settings.gemini_model :
      settings.openai_model;

    const levelsObj: { [key: string]: string } = {};
    if (gammaLevels) {
      Object.entries(gammaLevels).forEach(([key, val]) => {
        if (typeof val === 'string' && val !== '--') {
          levelsObj[key] = val;
        }
      });
    }

    const aiReqData = {
      provider: settings.ai_provider,
      apiKey: apiKey || '',
      model: model || '',
      symbol: marketData.symbol,
      price: marketData.price,
      zScore: marketData.zScore,
      atrRatio: marketData.atrRatio,
      sentiment: marketData.sentiment,
      delta: marketData.delta,
      deltaRatio: marketData.deltaRatio,
      prints: marketData.printsPerSecond,
      forces,
      blockTrades: marketData.blockTrades,
      news: news.map(n => `[${n.event_time}] ${n.country} - ${n.event_name} (Impacto: ${n.impact})`),
      levels: levelsObj,
      screenshotBase64: settings.enviar_imagem_ia ? (screenshot || undefined) : undefined,
      promptTemplate: settings.ai_system_prompt || undefined
    };

    const res = await runMarketAnalysis(aiReqData);
    setAiResult(res);
    setIsAnalyzing(false);

    if (res.success) {
      addLog('IA', `Decisão: ${res.sinal} (Confiança: ${res.confianca})`, 'ia');
      
      // Tocar alerta sonoro se a IA der sinal diferente de AGUARDANDO
      if (res.sinal !== 'AGUARDANDO' && settings.alert_sound_enabled) {
        playAlertBeep(880, 300); // Beep A5 (agudo para sinal da IA)
      }

      if (res.alerta && res.alerta !== '--') {
        addLog('ALERTA', `Alerta IA: ${res.alerta}`, 'alerta');
      }
      
      // Lógica de Notificação do Telegram
      if (settings.telegram_enabled && settings.telegram_bot_token && settings.telegram_chat_id) {
        sendTelegramNotification(res, settings);
      }
    } else {
      addLog('ERRO', `Análise falhou: ${res.resumo}`, 'erro');
    }
  };

  // Enviar Sinal ao Telegram
  const sendTelegramNotification = async (res: AIResponse, setts: any) => {
    try {
      const botToken = setts.telegram_bot_token;
      const chatId = setts.telegram_chat_id;
      
      // Decidir se envia o sinal baseado na configuração
      if (!setts.telegram_send_signal && (res.sinal === 'COMPRA' || res.sinal === 'VENDA' || res.sinal === 'SAIR')) {
        return;
      }

      let text = `🤖 *Vortex AI - Alerta de Operação*\n\n`;
      text += `🎯 *Sinal:* ${res.sinal}\n`;
      text += `📊 *Confiança:* ${res.confianca}\n`;
      text += `🟢 *Alvo:* ${res.alvo}\n`;
      text += `🛑 *Stop:* ${res.stop}\n\n`;
      text += `📝 *Resumo:* ${res.resumo}\n`;
      if (res.gatilho && res.gatilho !== '--') text += `⚡ *Gatilho:* ${res.gatilho}\n`;
      if (res.alerta && res.alerta !== '--') text += `⚠️ *Alerta:* ${res.alerta}\n`;

      // Enviar mensagem simples
      const urlText = `https://api.telegram.org/bot${botToken}/sendMessage`;
      await fetch(urlText, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown'
        })
      });

      // Se configurado para enviar a imagem do gráfico junto
      if (setts.telegram_send_image && screenshot) {
        const urlPhoto = `https://api.telegram.org/bot${botToken}/sendPhoto`;
        // Para enviar base64 no Telegram via API direta de forma fácil, convertemos o base64 para Blob ou enviamos o arquivo.
        // No client-side React, criamos um FormData contendo o blob.
        const byteCharacters = atob(screenshot);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/png' });

        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('photo', blob, 'chart.png');
        formData.append('caption', `Gráfico do mercado analisado pela IA.`);

        await fetch(urlPhoto, {
          method: 'POST',
          body: formData
        });
      }
    } catch (err) {
      console.error('[TELEGRAM] Erro ao notificar:', err);
    }
  };

  // Loop de Execução Automática da IA
  const setAiEnabled = (enabled: boolean) => {
    setAiEnabledState(enabled);
    if (enabled) {
      addLog('IA', 'Modo Automático de IA Ativado.', 'ia');
    } else {
      addLog('IA', 'Modo Automático de IA Desativado.', 'ia');
    }
  };

  useEffect(() => {
    if (isAuthenticated && aiEnabled && settings) {
      // Rodar imediatamente
      runManualAIAnalysis();

      // Configurar loop
      const intervalMs = settings.intervalo || 30000;
      aiLoopRef.current = setInterval(runManualAIAnalysis, intervalMs);

      return () => {
        if (aiLoopRef.current) clearInterval(aiLoopRef.current);
      };
    }
  }, [isAuthenticated, aiEnabled, settings, marketData?.timestamp]); // Rodar quando o preço atualizar no ciclo da IA

  return (
    <AppContext.Provider value={{
      user,
      panel,
      settings,
      sessionId,
      isAuthenticated,
      isCheckingAuth,
      signIn,
      signUp,
      logout,
      marketData,
      forces,
      gammaLevels,
      news,
      screenshot,
      aiEnabled,
      isAnalyzing,
      aiResult,
      setAiEnabled,
      runManualAIAnalysis,
      systemLogs,
      addLog,
      clearLogs,
      saveSettings,
      refreshMarketData,
      authError
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp deve ser usado dentro de um AppProvider');
  }
  return context;
};
