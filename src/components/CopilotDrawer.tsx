import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';

export interface CopilotMessage {
  id: string;
  sender: 'copilot' | 'user' | 'system';
  timestamp: string;
  text: string;
  thought?: string;
  confidence?: string;
  signal?: 'COMPRA' | 'VENDA' | 'SAIR' | 'AGUARDANDO';
  action?: 'OPEN' | 'HOLD' | 'TRAIL_STOP' | 'BREAK_EVEN' | 'CLOSE';
  targetPrice?: string;
  stopPrice?: string;
  pnl?: string;
}

export type CopilotTheme = 'ninja_black' | 'ninja_slate' | 'contrast_light' | 'cyber_purple';

const COPILOT_THEMES: Record<CopilotTheme, {
  name: string;
  icon: string;
  containerBg: string;
  containerBorder: string;
  headerBg: string;
  headerBorder: string;
  titleColor: string;
  subtitleColor: string;
  chatAreaBg: string;
  copilotBubbleBg: string;
  copilotBubbleBorder: string;
  copilotTextColor: string;
  copilotMetaColor: string;
  userBubbleBg: string;
  userTextColor: string;
  systemBubbleBg: string;
  systemBubbleBorder: string;
  systemTextColor: string;
  quickChipsBg: string;
  quickChipsBorder: string;
  quickBtnBg: string;
  quickBtnBorder: string;
  quickBtnText: string;
  inputContainerBg: string;
  inputContainerBorder: string;
  inputBg: string;
  inputBorder: string;
  inputTextColor: string;
  inputPlaceholderColor: string;
  btnSendBg: string;
  badgeBg: string;
}> = {
  ninja_black: {
    name: 'Preto Total',
    icon: '⬛',
    containerBg: 'bg-[#000000] shadow-[0_12px_45px_rgba(0,0,0,0.95)]',
    containerBorder: 'border-zinc-800',
    headerBg: 'bg-[#09090b]',
    headerBorder: 'border-zinc-800',
    titleColor: 'text-white',
    subtitleColor: 'text-zinc-400',
    chatAreaBg: 'bg-[#000000]',
    copilotBubbleBg: 'bg-[#121215]',
    copilotBubbleBorder: 'border-zinc-800',
    copilotTextColor: 'text-zinc-100',
    copilotMetaColor: 'text-zinc-400',
    userBubbleBg: 'bg-blue-600',
    userTextColor: 'text-white',
    systemBubbleBg: 'bg-[#121215]',
    systemBubbleBorder: 'border-zinc-800',
    systemTextColor: 'text-zinc-400',
    quickChipsBg: 'bg-[#09090b]',
    quickChipsBorder: 'border-zinc-800',
    quickBtnBg: 'bg-[#18181b] hover:bg-zinc-700',
    quickBtnBorder: 'border-zinc-700',
    quickBtnText: 'text-zinc-200',
    inputContainerBg: 'bg-[#09090b]',
    inputContainerBorder: 'border-zinc-800',
    inputBg: 'bg-[#000000]',
    inputBorder: 'border-zinc-700 focus:border-blue-500',
    inputTextColor: 'text-white',
    inputPlaceholderColor: 'placeholder-zinc-500',
    btnSendBg: 'bg-blue-600 hover:bg-blue-500 text-white',
    badgeBg: 'bg-zinc-800 text-zinc-300 border-zinc-700'
  },
  ninja_slate: {
    name: 'Cinza Escuro',
    icon: '🔘',
    containerBg: 'bg-[#1a1f2c] shadow-[0_12px_45px_rgba(0,0,0,0.9)]',
    containerBorder: 'border-slate-700',
    headerBg: 'bg-[#222838]',
    headerBorder: 'border-slate-700',
    titleColor: 'text-slate-100',
    subtitleColor: 'text-slate-400',
    chatAreaBg: 'bg-[#000000]', // Chat preto com painel em cinza escuro
    copilotBubbleBg: 'bg-[#1e2433]',
    copilotBubbleBorder: 'border-slate-700',
    copilotTextColor: 'text-slate-100',
    copilotMetaColor: 'text-slate-400',
    userBubbleBg: 'bg-indigo-600',
    userTextColor: 'text-white',
    systemBubbleBg: 'bg-[#1e2433]',
    systemBubbleBorder: 'border-slate-700',
    systemTextColor: 'text-slate-400',
    quickChipsBg: 'bg-[#222838]',
    quickChipsBorder: 'border-slate-700',
    quickBtnBg: 'bg-[#2a3245] hover:bg-slate-700',
    quickBtnBorder: 'border-slate-600',
    quickBtnText: 'text-slate-200',
    inputContainerBg: 'bg-[#222838]',
    inputContainerBorder: 'border-slate-700',
    inputBg: 'bg-[#000000]',
    inputBorder: 'border-slate-600 focus:border-indigo-400',
    inputTextColor: 'text-white',
    inputPlaceholderColor: 'placeholder-slate-500',
    btnSendBg: 'bg-indigo-600 hover:bg-indigo-500 text-white',
    badgeBg: 'bg-slate-800 text-slate-300 border-slate-700'
  },
  cyber_purple: {
    name: 'Azul Noturno',
    icon: '🌌',
    containerBg: 'bg-[#070e20] shadow-[0_12px_45px_rgba(0,0,0,0.9)]',
    containerBorder: 'border-blue-900/60',
    headerBg: 'bg-[#0d1a38]',
    headerBorder: 'border-blue-900/60',
    titleColor: 'text-slate-100',
    subtitleColor: 'text-blue-300',
    chatAreaBg: 'bg-[#000000]', // Chat preto com painel em azul noturno
    copilotBubbleBg: 'bg-[#0a1329]',
    copilotBubbleBorder: 'border-blue-900/60',
    copilotTextColor: 'text-slate-100',
    copilotMetaColor: 'text-blue-300',
    userBubbleBg: 'bg-blue-600',
    userTextColor: 'text-white',
    systemBubbleBg: 'bg-[#0a1329]',
    systemBubbleBorder: 'border-blue-900/60',
    systemTextColor: 'text-blue-300',
    quickChipsBg: 'bg-[#0d1a38]',
    quickChipsBorder: 'border-blue-900/60',
    quickBtnBg: 'bg-[#102046] hover:bg-blue-900/60',
    quickBtnBorder: 'border-blue-800/60',
    quickBtnText: 'text-blue-200',
    inputContainerBg: 'bg-[#0d1a38]',
    inputContainerBorder: 'border-blue-900/60',
    inputBg: 'bg-[#000000]',
    inputBorder: 'border-blue-800 focus:border-blue-400',
    inputTextColor: 'text-white',
    inputPlaceholderColor: 'placeholder-blue-400/50',
    btnSendBg: 'bg-blue-600 hover:bg-blue-500 text-white',
    badgeBg: 'bg-blue-950 text-blue-200 border-blue-800'
  },
  contrast_light: {
    name: 'Cinza Grafite',
    icon: '⚪',
    containerBg: 'bg-[#ffffff] shadow-[0_12px_45px_rgba(0,0,0,0.4)]', // Painel com fundo branco
    containerBorder: 'border-slate-300',
    headerBg: 'bg-[#f1f5f9]',
    headerBorder: 'border-slate-300',
    titleColor: 'text-slate-900',
    subtitleColor: 'text-slate-600',
    chatAreaBg: 'bg-[#272d3b]', // Chat em cinza grafite
    copilotBubbleBg: 'bg-[#333b4e] shadow-sm',
    copilotBubbleBorder: 'border-slate-600',
    copilotTextColor: 'text-slate-100',
    copilotMetaColor: 'text-slate-300',
    userBubbleBg: 'bg-blue-600',
    userTextColor: 'text-white',
    systemBubbleBg: 'bg-[#333b4e]',
    systemBubbleBorder: 'border-slate-600',
    systemTextColor: 'text-slate-300',
    quickChipsBg: 'bg-[#f1f5f9]',
    quickChipsBorder: 'border-slate-300',
    quickBtnBg: 'bg-white hover:bg-slate-100 shadow-sm',
    quickBtnBorder: 'border-slate-300',
    quickBtnText: 'text-slate-800',
    inputContainerBg: 'bg-[#f1f5f9]',
    inputContainerBorder: 'border-slate-300',
    inputBg: 'bg-white',
    inputBorder: 'border-slate-400 focus:border-blue-600',
    inputTextColor: 'text-slate-900',
    inputPlaceholderColor: 'placeholder-slate-500',
    btnSendBg: 'bg-blue-600 hover:bg-blue-500 text-white',
    badgeBg: 'bg-slate-200 text-slate-800 border-slate-300'
  }
};

export const CopilotDrawer: React.FC = () => {
  const {
    aiEnabled,
    setAiEnabled,
    activePanel,
    candles,
    reports,
    activeAccount,
    settings,
    saveSettings,
    updateReportAction,
    updateReportLevelsAction,
    runManualAIAnalysis,
    askCopilotChatMessage
  } = useApp() as any;

  const [isOpen, setIsOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('vortex_copilot_drawer_open') === 'true';
    } catch {
      return false;
    }
  });

  const [theme, setTheme] = useState<CopilotTheme>(() => {
    try {
      const saved = localStorage.getItem('vortex_copilot_theme') as CopilotTheme;
      if (saved && COPILOT_THEMES[saved]) return saved;
      if (settings?.copilot_theme && COPILOT_THEMES[settings.copilot_theme as CopilotTheme]) {
        return settings.copilot_theme as CopilotTheme;
      }
    } catch {}
    return 'ninja_black';
  });

  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState<boolean>(false);

  const handleSelectTheme = (newTheme: CopilotTheme) => {
    setTheme(newTheme);
    setIsThemeMenuOpen(false);
    try {
      localStorage.setItem('vortex_copilot_theme', newTheme);
      if (saveSettings) saveSettings({ copilot_theme: newTheme });
    } catch {}
  };

  const [messages, setMessages] = useState<CopilotMessage[]>(() => {
    try {
      const saved = localStorage.getItem('vortex_copilot_chat_history');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: 'msg_welcome',
        sender: 'copilot',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        text: 'Olá, Trader! Sou seu Copilot Quantitativo Institucional. Estou monitorando o mercado 360°, incluindo Volume Profile, Níveis Gamma de Opções 0DTE, Tape Reading e o S&P 500.',
        thought: 'Sistemas calibrados e prontos para operar com rigorosa gestão de risco.',
        confidence: '95%'
      }
    ];
  });

  const [inputValue, setInputValue] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const currentPrice = candles && candles.length > 0 ? candles[candles.length - 1].close : (activePanel?.price || 0);

  // Identificar operação ativa do ativo atual nesta conta
  const activeTrade = (reports || []).find((r: any) => 
    r.status === 'Em Andamento' && 
    (r.panel_id === activePanel?.id || r.instance_id === activePanel?.instance_id) &&
    (!activeAccount || r.account_id === activeAccount.id)
  );

  const tradeSide = activeTrade?.side || (activeTrade?.type?.toUpperCase().includes('COMPRA') ? 'COMPRA' : 'VENDA');
  const entryPrice = activeTrade ? Number(activeTrade.entry_price || 0) : 0;
  const currentDiffPoints = activeTrade && entryPrice > 0
    ? (tradeSide === 'COMPRA' ? (currentPrice - entryPrice) : (entryPrice - currentPrice))
    : 0;

  const currentPnlUsd = currentDiffPoints * (activeTrade?.contrato ? activeTrade.contrato * 20 : 20);

  // Persistir estado do Drawer
  const toggleDrawer = () => {
    const next = !isOpen;
    setIsOpen(next);
    try {
      localStorage.setItem('vortex_copilot_drawer_open', String(next));
    } catch {}
  };

  const currentThemeStyles = COPILOT_THEMES[theme] || COPILOT_THEMES.ninja_black;

  // Auto scroll para o final das mensagens
  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Salvar histórico de chat
  useEffect(() => {
    try {
      localStorage.setItem('vortex_copilot_chat_history', JSON.stringify(messages.slice(-30)));
    } catch {}
  }, [messages]);

  // Listener para capturar pensamentos e análises da IA do contexto
  useEffect(() => {
    const handleCopilotEvent = (e: any) => {
      const { signal, confianca, alvo, stop, resumo, copilotThought, tradeAction } = e.detail || {};
      if (!resumo && !copilotThought) return;

      const newMsg: CopilotMessage = {
        id: `msg_${Date.now()}`,
        sender: 'copilot',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        text: copilotThought || resumo,
        thought: resumo !== copilotThought ? resumo : undefined,
        confidence: confianca,
        signal: signal,
        action: tradeAction,
        targetPrice: alvo !== '--' ? alvo : undefined,
        stopPrice: stop !== '--' ? stop : undefined
      };

      setMessages(prev => [...prev.slice(-25), newMsg]);
    };

    window.addEventListener('vortex_copilot_thought', handleCopilotEvent);
    return () => window.removeEventListener('vortex_copilot_thought', handleCopilotEvent);
  }, []);

  // Enviar pergunta do trader para o Copilot
  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputValue;
    if (!textToSend.trim() || isSending) return;

    const userMsg: CopilotMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      text: textToSend
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsSending(true);

    try {
      let res = null;
      if (askCopilotChatMessage) {
        // Enviar pergunta com o histórico recente para manter a memória contextual
        res = await askCopilotChatMessage(textToSend, messages.slice(-8));
      } else if (runManualAIAnalysis) {
        res = await runManualAIAnalysis();
      }

      if (res) {
        const copilotReply: CopilotMessage = {
          id: `rep_${Date.now()}`,
          sender: 'copilot',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          text: res.text || res.copilotThought || res.resumo || 'Análise técnica finalizada.',
          confidence: res.confidence || res.confianca,
          signal: res.signal || res.sinal,
          action: res.action || res.tradeAction,
          targetPrice: (res.targetPrice || res.alvo) !== '--' ? (res.targetPrice || res.alvo) : undefined,
          stopPrice: (res.stopPrice || res.stop) !== '--' ? (res.stopPrice || res.stop) : undefined
        };
        setMessages(prev => [...prev, copilotReply]);
      }
    } catch (err: any) {
      const errMsg: CopilotMessage = {
        id: `err_${Date.now()}`,
        sender: 'system',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        text: `Erro ao comunicar com a IA: ${err.message || err}`
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsSending(false);
    }
  };

  // Ações Rápidas de Gestão do Trader
  const isTradeInProfit = activeTrade ? (currentDiffPoints > 0.25) : false;

  const handleProtectBreakEven = async () => {
    if (!activeTrade) return;
    if (!isTradeInProfit) {
      alert(`⚠️ O Break-Even só pode ser acionado quando a operação estiver no lucro.\n\nResultado atual: ${currentDiffPoints >= 0 ? '+' : ''}${currentDiffPoints.toFixed(1)} pts.`);
      return;
    }
    try {
      const entry = Number(activeTrade.entry_price || currentPrice);
      let newStop = entry;
      if (tradeSide === 'COMPRA') {
        newStop = (currentPrice >= entry + 1.5) ? (entry + 0.5) : entry;
        if (newStop >= currentPrice - 0.10) newStop = entry;
      } else {
        newStop = (currentPrice <= entry - 1.5) ? (entry - 0.5) : entry;
        if (newStop <= currentPrice + 0.10) newStop = entry;
      }

      if (updateReportLevelsAction) {
        await updateReportLevelsAction(activeTrade.id, newStop, activeTrade.take_profit ? Number(activeTrade.take_profit) : null);
      }

      alert(`🛡️ Operação Protegida!\nStop Loss movido para o preço de entrada: ${newStop.toFixed(2)} (Zero a Zero).`);
      setMessages(prev => [
        ...prev,
        {
          id: `act_${Date.now()}`,
          sender: 'system',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          text: `🛡️ Posição de ${tradeSide} protegida no Zero a Zero (${newStop.toFixed(2)}).`
        }
      ]);
    } catch (e) {
      console.error('[COPILOT] Erro ao proteger no breakeven:', e);
    }
  };

  const handleClosePositionMarket = async () => {
    if (!activeTrade) return;
    const confirm = window.confirm(`Deseja realmente encerrar a posição de ${tradeSide} a mercado agora?`);
    if (!confirm) return;

    const status = currentDiffPoints >= 0 ? 'Gain' : 'Stop';
    await updateReportAction(activeTrade.id, status, currentPrice);
    setMessages(prev => [
      ...prev,
      {
        id: `act_${Date.now()}`,
        sender: 'system',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        text: `🛑 Posição de ${tradeSide} encerrada a mercado pelo Trader ao preço de ${currentPrice.toFixed(2)} (${status} de ${currentDiffPoints >= 0 ? '+' : ''}${currentDiffPoints.toFixed(1)} pts).`
      }
    ]);
  };

  return (
    <>
      {/* Botão Flutuante quando a gaveta estiver fechada */}
      {!isOpen && (
        <button
          onClick={toggleDrawer}
          className="fixed bottom-4 right-4 z-40 bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-600 hover:from-purple-600 hover:to-indigo-500 text-white font-black text-xs px-3.5 py-2.5 rounded-full shadow-[0_0_20px_rgba(147,51,234,0.5)] border border-purple-400 flex items-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer"
          title="Abrir Chat & Live Feed do Copilot IA"
        >
          <span className="text-base animate-bounce">🤖</span>
          <span>COPILOT AO VIVO</span>
          <span className={`w-2.5 h-2.5 rounded-full ${aiEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
          {activeTrade && (
            <span className="bg-emerald-500/30 text-emerald-300 border border-emerald-400 px-1.5 py-0.5 rounded text-[10px] font-mono font-black">
              {currentDiffPoints >= 0 ? `+${currentDiffPoints.toFixed(1)}` : currentDiffPoints.toFixed(1)} pts
            </span>
          )}
        </button>
      )}

      {/* Gaveta Lateral Flutuante do Copilot (Drawer) */}
      {isOpen && (
        <div className={`fixed bottom-3 right-3 z-50 w-[380px] sm:w-[430px] h-[590px] max-h-[90vh] ${currentThemeStyles.containerBg} border ${currentThemeStyles.containerBorder} rounded-2xl flex flex-col overflow-hidden transition-all animate-in fade-in slide-in-from-bottom-5 duration-200 font-sans`}>
          
          {/* Header do Copilot */}
          <div className={`p-3 ${currentThemeStyles.headerBg} border-b ${currentThemeStyles.headerBorder} flex items-center justify-between shrink-0 relative`}>
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-base shadow-inner">
                  🤖
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-slate-950 ${aiEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className={`font-black text-xs ${currentThemeStyles.titleColor} tracking-wide`}>AXION COPILOT 360°</h3>
                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${currentThemeStyles.badgeBg}`}>
                    {activePanel?.name || 'NQ'}
                  </span>
                </div>
                <p className={`text-[10px] ${currentThemeStyles.subtitleColor} font-medium`}>
                  {aiEnabled ? '🟢 Piloto Automático Ativo' : '⚪ Modo Apenas Observação'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Botão de Troca de Tema */}
              <div className="relative">
                <button
                  onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                  className={`text-[11px] font-bold px-2 py-1 rounded-lg border transition cursor-pointer active:scale-95 flex items-center gap-1 ${
                    theme === 'contrast_light'
                      ? 'bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                  }`}
                  title="Escolher Tema Visual do Copilot (Ninja Black, Slate, Claro)"
                >
                  <span>{currentThemeStyles.icon}</span>
                  <span className="hidden sm:inline text-[10px]">Tema</span>
                </button>

                {/* Dropdown de Temas */}
                {isThemeMenuOpen && (
                  <div className="absolute right-0 top-8 z-50 w-52 bg-[#121215] border border-zinc-700 rounded-xl shadow-2xl p-1.5 flex flex-col gap-1 text-xs">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-2 py-1 border-b border-zinc-800">
                      Esquema de Cores IA
                    </div>
                    {(Object.keys(COPILOT_THEMES) as CopilotTheme[]).map((tKey) => {
                      const tObj = COPILOT_THEMES[tKey];
                      const isSelected = theme === tKey;
                      return (
                        <button
                          key={tKey}
                          onClick={() => handleSelectTheme(tKey)}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50 font-bold'
                              : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{tObj.icon}</span>
                            <span className="text-[11px]">{tObj.name}</span>
                          </div>
                          {isSelected && <span className="text-blue-400 text-xs">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                onClick={() => setAiEnabled(!aiEnabled)}
                className={`text-[10px] font-black px-2.5 py-1 rounded-lg border transition cursor-pointer active:scale-95 ${
                  aiEnabled
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
                title={aiEnabled ? 'Pausar Copilot Automático' : 'Ligar Copilot Automático'}
              >
                {aiEnabled ? '⏸️ ON' : '▶️ LIGAR'}
              </button>
              <button
                onClick={toggleDrawer}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm transition cursor-pointer ${
                  theme === 'contrast_light'
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Minimizar Copilot"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Card de Posição Ativa em Tempo Real (Live Trade Monitor) */}
          {activeTrade && (
            <div className={`mx-3 mt-2 p-2.5 rounded-xl border flex flex-col gap-2 shrink-0 transition-all ${
              currentDiffPoints >= 0
                ? 'bg-emerald-950/60 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                : 'bg-rose-950/60 border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                    tradeSide === 'COMPRA' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                  }`}>
                    {tradeSide} {activeTrade.contrato || 1}x
                  </span>
                  <span className="font-mono text-xs text-slate-200 font-bold">
                    @ {entryPrice.toFixed(2)}
                  </span>
                </div>
                <div className="text-right">
                  <div className={`font-mono font-black text-sm ${currentDiffPoints >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {currentDiffPoints >= 0 ? `+${currentDiffPoints.toFixed(1)}` : currentDiffPoints.toFixed(1)} pts
                  </div>
                  <div className="text-[10px] font-mono text-slate-300 font-bold">
                    ({currentPnlUsd >= 0 ? `+$${currentPnlUsd.toFixed(2)}` : `-$${Math.abs(currentPnlUsd).toFixed(2)}`})
                  </div>
                </div>
              </div>

              {/* Botões Rápidos de Intervenção do Trader */}
              <div className="flex items-center gap-1.5 pt-1 border-t border-slate-700/60">
                <button
                  onClick={handleProtectBreakEven}
                  disabled={!isTradeInProfit}
                  className={`flex-1 py-1 rounded text-[10px] font-bold transition flex items-center justify-center gap-1 ${
                    isTradeInProfit
                      ? 'bg-blue-600/60 hover:bg-blue-600 border border-blue-400/80 text-blue-100 cursor-pointer active:scale-95 shadow-sm'
                      : 'bg-slate-800/40 border border-slate-700/50 text-slate-500 cursor-not-allowed opacity-60'
                  }`}
                  title={
                    isTradeInProfit
                      ? 'Mover Stop para o preço de entrada (Zero a Zero)'
                      : 'Break-Even indisponível: disponível apenas quando a operação estiver no lucro'
                  }
                >
                  <span>🛡️ Proteger no 0</span>
                </button>
                <button
                  onClick={handleClosePositionMarket}
                  className="flex-1 py-1 bg-rose-600/40 hover:bg-rose-600/70 border border-rose-400/60 text-rose-100 rounded text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                  title="Encerrar posição imediatamente a mercado"
                >
                  <span>🛑 Fechar Mercado</span>
                </button>
              </div>
            </div>
          )}

          {/* Feed de Conversa e Pensamentos da IA (Chat Stream) */}
          <div className={`flex-1 p-3 overflow-y-auto space-y-3 flex flex-col ${currentThemeStyles.chatAreaBg}`}>
            {messages.map((m) => {
              const isCopilot = m.sender === 'copilot';
              const isUser = m.sender === 'user';

              return (
                <div
                  key={m.id}
                  className={`flex flex-col max-w-[88%] ${isUser ? 'self-end items-end' : 'self-start items-start'}`}
                >
                  <div className="flex items-center gap-1 mb-1 px-1">
                    <span className={`text-[10px] font-bold ${currentThemeStyles.copilotMetaColor}`}>
                      {isCopilot ? '🤖 Copilot IA' : isUser ? '👤 Você' : '⚙️ Sistema'}
                    </span>
                    <span className={`text-[9px] ${currentThemeStyles.copilotMetaColor} font-mono opacity-75`}>{m.timestamp}</span>
                    {m.confidence && (
                      <span className="text-[9px] font-black text-purple-400 bg-purple-950/80 border border-purple-500/40 px-1 rounded">
                        {m.confidence}
                      </span>
                    )}
                  </div>

                  <div className={`p-3 rounded-2xl text-xs leading-relaxed shadow-sm ${
                    isUser
                      ? `${currentThemeStyles.userBubbleBg} ${currentThemeStyles.userTextColor} rounded-tr-none shadow`
                      : isCopilot
                        ? `${currentThemeStyles.copilotBubbleBg} border ${currentThemeStyles.copilotBubbleBorder} ${currentThemeStyles.copilotTextColor} rounded-tl-none`
                        : `${currentThemeStyles.systemBubbleBg} border ${currentThemeStyles.systemBubbleBorder} ${currentThemeStyles.systemTextColor} text-[11px]`
                  }`}>
                    <p className="font-normal whitespace-pre-wrap">{m.text}</p>

                    {/* Destaque de Decisão / Alvo e Stop */}
                    {(m.signal && m.signal !== 'AGUARDANDO') && (
                      <div className="mt-2 pt-1.5 border-t border-slate-700/50 flex items-center justify-between gap-2 font-mono text-[11px]">
                        <span className={`font-black px-1.5 py-0.5 rounded ${
                          m.signal === 'COMPRA' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                        }`}>
                          🎯 {m.signal}
                        </span>
                        {m.targetPrice && <span className="text-emerald-500 font-bold">Alvo: {m.targetPrice}</span>}
                        {m.stopPrice && <span className="text-rose-500 font-bold">Stop: {m.stopPrice}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className={`self-start flex items-center gap-2 p-2.5 ${currentThemeStyles.copilotBubbleBg} border ${currentThemeStyles.copilotBubbleBorder} rounded-2xl text-xs text-purple-400`}>
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                <span>Copilot analisando confluências de mercado...</span>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Sugestões Rápidas de Perguntas com 1 Clique */}
          <div className={`px-3 py-1.5 ${currentThemeStyles.quickChipsBg} border-t ${currentThemeStyles.quickChipsBorder} flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 text-[10px]`}>
            <button
              onClick={() => handleSendMessage('Qual o panorama de confluência agora?')}
              className={`px-2.5 py-1 rounded-full ${currentThemeStyles.quickBtnBg} ${currentThemeStyles.quickBtnText} border ${currentThemeStyles.quickBtnBorder} whitespace-nowrap transition cursor-pointer`}
            >
              🔍 Panorama Atual
            </button>
            <button
              onClick={() => handleSendMessage('Onde estão os níveis Gamma e o VPOC?')}
              className={`px-2.5 py-1 rounded-full ${currentThemeStyles.quickBtnBg} ${currentThemeStyles.quickBtnText} border ${currentThemeStyles.quickBtnBorder} whitespace-nowrap transition cursor-pointer`}
            >
              🟣 Níveis Gamma / VPOC
            </button>
            <button
              onClick={() => handleSendMessage('Como estão as forças do S&P 500 e Ações M7?')}
              className={`px-2.5 py-1 rounded-full ${currentThemeStyles.quickBtnBg} ${currentThemeStyles.quickBtnText} border ${currentThemeStyles.quickBtnBorder} whitespace-nowrap transition cursor-pointer`}
            >
              📊 Forças Macro
            </button>
          </div>

          {/* Input de Mensagem do Trader */}
          <div className={`p-2.5 ${currentThemeStyles.inputContainerBg} border-t ${currentThemeStyles.inputContainerBorder} flex items-center gap-2 shrink-0`}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendMessage();
              }}
              placeholder="Converse com o Copilot ou pergunte algo..."
              className={`flex-1 ${currentThemeStyles.inputBg} border ${currentThemeStyles.inputBorder} rounded-xl px-3 py-2 text-xs ${currentThemeStyles.inputTextColor} ${currentThemeStyles.inputPlaceholderColor} focus:outline-none`}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputValue.trim() || isSending}
              className={`${currentThemeStyles.btnSendBg} disabled:opacity-40 font-bold text-xs p-2 rounded-xl transition cursor-pointer active:scale-95 shadow-md shrink-0`}
              title="Enviar mensagem para o Copilot"
            >
              ⚡
            </button>
          </div>

        </div>
      )}
    </>
  );
};
