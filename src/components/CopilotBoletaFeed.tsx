import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';

export interface CopilotFeedMessage {
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
  gatilho?: string;
}

interface CopilotBoletaFeedProps {
  selectedAsset?: string;
  currentPrice?: number;
}

export const CopilotBoletaFeed: React.FC<CopilotBoletaFeedProps> = ({
  selectedAsset
}) => {
  const {
    aiEnabled,
    isAnalyzing,
    runManualAIAnalysis,
    askCopilotChatMessage,
    setIsCopilotModalOpen,
    settings,
    saveSettings
  } = useApp() as any;

  const [messages, setMessages] = useState<CopilotFeedMessage[]>(() => {
    try {
      const saved = localStorage.getItem('vortex_copilot_boleta_history');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: 'msg_init',
        sender: 'copilot',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        text: 'Copilot 360° pronto. Monitorando fluxo, gamma e confluências de mercado.',
        thought: 'Sistemas calibrados. Pronto para orientar ou executar ordens sob demanda.',
        confidence: '95%'
      }
    ];
  });

  const [inputValue, setInputValue] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  // Persistir mensagens
  useEffect(() => {
    try {
      localStorage.setItem('vortex_copilot_boleta_history', JSON.stringify(messages.slice(-30)));
    } catch {}
  }, [messages]);

  // Auto scroll suave para a última mensagem
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending, isAnalyzing]);

  // Listener para capturar pensamentos e análises geradas pelo ciclo do robô / IA
  useEffect(() => {
    const handleCopilotThought = (e: any) => {
      const { signal, confianca, alvo, stop, gatilho, resumo, copilotThought, tradeAction } = e.detail || {};
      if (!resumo && !copilotThought) return;

      const newMsg: CopilotFeedMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        sender: 'copilot',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        text: copilotThought || resumo,
        thought: resumo && resumo !== copilotThought ? resumo : undefined,
        confidence: confianca,
        signal: signal,
        action: tradeAction,
        targetPrice: alvo && alvo !== '--' ? alvo : undefined,
        stopPrice: stop && stop !== '--' ? stop : undefined,
        gatilho: gatilho && gatilho !== '--' ? gatilho : undefined
      };

      setMessages(prev => [...prev.slice(-25), newMsg]);
    };

    window.addEventListener('vortex_copilot_thought', handleCopilotThought);
    return () => window.removeEventListener('vortex_copilot_thought', handleCopilotThought);
  }, []);

  // Envio de mensagens / demandas para o Copilot
  const handleSendMessage = async (customPrompt?: string) => {
    const promptToSend = customPrompt || inputValue;
    if (!promptToSend.trim() || isSending) return;

    const userMsg: CopilotFeedMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      text: promptToSend
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customPrompt) setInputValue('');
    setIsSending(true);

    try {
      let res: any = null;
      if (askCopilotChatMessage) {
        res = await askCopilotChatMessage(promptToSend, messages.slice(-8));
      } else if (runManualAIAnalysis) {
        res = await runManualAIAnalysis();
      }

      if (res && res.success !== false) {
        const copilotReply: CopilotFeedMessage = {
          id: `cop_${Date.now()}`,
          sender: 'copilot',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          text: res.text || res.resposta || res.copilotThought || res.resumo || 'Análise de confluência concluída.',
          confidence: res.confidence || res.confianca,
          signal: res.signal || res.sinal,
          action: res.action || res.tradeAction,
          targetPrice: res.targetPrice || (res.alvo && res.alvo !== '--' ? res.alvo : undefined),
          stopPrice: res.stopPrice || (res.stop && res.stop !== '--' ? res.stop : undefined),
          gatilho: res.gatilho || (res.setup_trigger && res.setup_trigger !== '--' ? res.setup_trigger : undefined)
        };
        setMessages(prev => [...prev, copilotReply]);

        // Se a resposta contém sinal com stop/alvo/gatilho, notifica a Boleta no modo Copilot
        if (typeof window !== 'undefined' && (copilotReply.signal || copilotReply.stopPrice || copilotReply.targetPrice)) {
          window.dispatchEvent(new CustomEvent('vortex_copilot_thought', {
            detail: {
              signal: copilotReply.signal,
              confianca: copilotReply.confidence,
              alvo: copilotReply.targetPrice,
              stop: copilotReply.stopPrice,
              gatilho: copilotReply.gatilho,
              resumo: copilotReply.text,
              copilotThought: copilotReply.thought || copilotReply.text,
              tradeAction: copilotReply.action
            }
          }));
        }
      } else {
        const errMsg: CopilotFeedMessage = {
          id: `err_${Date.now()}`,
          sender: 'system',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          text: res?.text || 'Não foi possível obter resposta do Copilot. Verifique a API Key nas configurações.'
        };
        setMessages(prev => [...prev, errMsg]);
      }
    } catch (err: any) {
      const errMsg: CopilotFeedMessage = {
        id: `err_${Date.now()}`,
        sender: 'system',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        text: `Erro ao consultar Copilot: ${err?.message || 'Falha de conexão'}`
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsSending(false);
    }
  };

  const handleClearHistory = () => {
    const initial: CopilotFeedMessage[] = [
      {
        id: `init_${Date.now()}`,
        sender: 'copilot',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        text: 'Histórico limpo. Copilot pronto para novas demandas.',
        confidence: '95%'
      }
    ];
    setMessages(initial);
    try {
      localStorage.setItem('vortex_copilot_boleta_history', JSON.stringify(initial));
    } catch {}
  };

  const isBusy = isSending || isAnalyzing;

  return (
    <div className="w-full bg-[#0b1220] border border-slate-800 rounded-lg flex flex-col mt-1.5 overflow-hidden shadow-inner">
      {/* 1. Header do Copilot */}
      <div className="bg-[#0f172a] px-2 py-1.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs">🤖</span>
          <span className="text-[10px] font-black text-slate-100 uppercase tracking-wider truncate">
            COPILOT IA {selectedAsset ? `• ${selectedAsset}` : ''}
          </span>
          <span
            className={`px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase tracking-wide ${
              isBusy
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                : aiEnabled
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
            }`}
          >
            {isBusy ? '⚡ Analisando' : aiEnabled ? '🟢 Ativo' : '⚪ Sob Demanda'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsCopilotModalOpen && setIsCopilotModalOpen(true)}
            className="text-[9px] text-purple-400 hover:text-purple-300 p-0.5 rounded hover:bg-slate-800 transition"
            title="Abrir Configurações do Copilot"
          >
            ⚙️
          </button>
          <button
            type="button"
            onClick={() => {
              const currentTtsEnabled = settings?.enable_tts ?? true;
              const nextTtsEnabled = !currentTtsEnabled;
              if (saveSettings) {
                saveSettings({
                  enable_tts: nextTtsEnabled,
                  resource_tts_enabled: nextTtsEnabled
                });
              }
              if (!nextTtsEnabled && typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.cancel();
              }
            }}
            className="text-[9px] p-0.5 rounded hover:bg-slate-800 transition"
            title={
              (settings?.enable_tts ?? true)
                ? 'Áudio da IA Ativado (🔊). Clique para colocar em Mudo'
                : 'Áudio da IA no Mudo (🔇). Clique para reativar voz'
            }
          >
            {(settings?.enable_tts ?? true) ? '🔊' : '🔇'}
          </button>
          <button
            type="button"
            onClick={handleClearHistory}
            className="text-[9px] text-slate-400 hover:text-slate-200 p-0.5 rounded hover:bg-slate-800 transition"
            title="Limpar histórico do Copilot"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* 2. Chips Rápidos de Demanda */}
      <div className="px-1.5 py-1 bg-[#090e1a] border-b border-slate-800/80 flex items-center gap-1 overflow-x-auto no-scrollbar">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            if (runManualAIAnalysis) {
              runManualAIAnalysis();
            } else {
              handleSendMessage('Analisar mercado agora');
            }
          }}
          className="whitespace-nowrap bg-blue-950/80 hover:bg-blue-900/90 text-blue-300 border border-blue-700/60 rounded px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider transition active:scale-95 disabled:opacity-50 flex items-center gap-0.5 cursor-pointer"
        >
          <span>⚡</span>
          <span>Analisar Agora</span>
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleSendMessage('Qual o panorama macro 360°, níveis gamma e viés de confluência para este ativo?')}
          className="whitespace-nowrap bg-purple-950/80 hover:bg-purple-900/90 text-purple-300 border border-purple-700/60 rounded px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider transition active:scale-95 disabled:opacity-50 flex items-center gap-0.5 cursor-pointer"
        >
          <span>🔍</span>
          <span>Visão 360°</span>
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleSendMessage('Avalie minha posição e risco atual com base nas confluências de fluxo e volatilidade.')}
          className="whitespace-nowrap bg-emerald-950/80 hover:bg-emerald-900/90 text-emerald-300 border border-emerald-700/60 rounded px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider transition active:scale-95 disabled:opacity-50 flex items-center gap-0.5 cursor-pointer"
        >
          <span>🛡️</span>
          <span>Posição & Risco</span>
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleSendMessage('Quais são os principais pontos de suporte, resistência e alvos gamma para o ativo hoje?')}
          className="whitespace-nowrap bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider transition active:scale-95 disabled:opacity-50 flex items-center gap-0.5 cursor-pointer"
        >
          <span>🎯</span>
          <span>Níveis & Alvos</span>
        </button>
      </div>

      {/* 3. Feed de Mensagens & Pensamentos */}
      <div className="p-1.5 space-y-1.5 max-h-48 min-h-[120px] overflow-y-auto font-mono text-[10px] bg-[#070b14]/70">
        {messages.map((m) => {
          const isCopilot = m.sender === 'copilot';
          const isUser = m.sender === 'user';
          const isSystem = m.sender === 'system';

          return (
            <div
              key={m.id}
              className={`p-1.5 rounded border transition ${
                isUser
                  ? 'bg-blue-950/40 border-blue-800/60 text-blue-100 ml-3'
                  : isSystem
                  ? 'bg-amber-950/30 border-amber-800/50 text-amber-200'
                  : 'bg-[#0d1527] border-slate-800 text-slate-200 mr-1'
              }`}
            >
              {/* Header da Mensagem */}
              <div className="flex items-center justify-between text-[8.5px] text-slate-400 font-sans mb-1">
                <span className="font-bold flex items-center gap-1">
                  {isCopilot ? (
                    <span className="text-cyan-400">🤖 Copilot IA</span>
                  ) : isUser ? (
                    <span className="text-blue-300">👤 Você</span>
                  ) : (
                    <span className="text-amber-400">⚙️ Sistema</span>
                  )}
                </span>
                <span>{m.timestamp}</span>
              </div>

              {/* Badges de Sinal / Confiança / Ação */}
              {isCopilot && (m.signal || m.confidence || m.targetPrice || m.stopPrice) && (
                <div className="flex flex-wrap items-center gap-1 mb-1 font-sans text-[8.5px]">
                  {m.signal && (
                    <span
                      className={`px-1 py-0.2 rounded font-black uppercase ${
                        m.signal === 'COMPRA'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : m.signal === 'VENDA'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          : m.signal === 'SAIR'
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {m.signal}
                    </span>
                  )}
                  {m.confidence && (
                    <span className="bg-slate-800 text-cyan-300 px-1 py-0.2 rounded border border-slate-700 font-bold">
                      {m.confidence}
                    </span>
                  )}
                  {m.targetPrice && (
                    <span className="bg-emerald-950/60 text-emerald-300 px-1 py-0.2 rounded border border-emerald-800/60">
                      Alvo: {m.targetPrice}
                    </span>
                  )}
                  {m.stopPrice && (
                    <span className="bg-rose-950/60 text-rose-300 px-1 py-0.2 rounded border border-rose-800/60">
                      Stop: {m.stopPrice}
                    </span>
                  )}
                  {m.action && (
                    <span className="bg-blue-950/60 text-blue-300 px-1 py-0.2 rounded border border-blue-800/60 font-bold">
                      {m.action}
                    </span>
                  )}
                </div>
              )}

              {/* Gatilho de Entrada em Destaque */}
              {isCopilot && m.gatilho && m.gatilho !== '--' && (
                <div className="bg-amber-950/40 text-amber-300 px-1.5 py-0.5 rounded border border-amber-800/60 font-mono text-[8.5px] mb-1 flex items-center gap-1">
                  <span className="font-extrabold text-amber-400">⚡ GATILHO:</span>
                  <span className="truncate">{m.gatilho}</span>
                </div>
              )}

              {/* Texto da Mensagem */}
              <div className="leading-snug whitespace-pre-wrap font-sans text-[9.5px] text-slate-200">
                {m.text}
              </div>

              {/* Thought detalhado (se houver) */}
              {m.thought && (
                <div className="mt-1 pt-1 border-t border-slate-800/60 text-[8.5px] text-slate-400 italic">
                  💡 {m.thought}
                </div>
              )}
            </div>
          );
        })}

        {/* Indicador de Carregamento / IA Pensando */}
        {isBusy && (
          <div className="p-1.5 rounded bg-purple-950/30 border border-purple-800/50 text-purple-300 text-[9px] flex items-center gap-1.5 animate-pulse">
            <span className="text-xs">⚡</span>
            <span>Copilot analisando confluências e processando demanda...</span>
          </div>
        )}

        <div ref={feedEndRef} />
      </div>

      {/* 4. Campo de Entrada / Chat Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="bg-[#090e1a] p-1 border-t border-slate-800 flex items-center gap-1"
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Pergunte ao Copilot ou comande..."
          disabled={isBusy}
          className="flex-1 bg-[#050811] border border-slate-700/80 rounded px-2 py-1 text-[9.5px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isBusy || !inputValue.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 active:scale-95 text-white font-black px-2 py-1 rounded text-[10px] transition cursor-pointer flex items-center justify-center shadow"
          title="Enviar pergunta ao Copilot"
        >
          ➤
        </button>
      </form>
    </div>
  );
};
