import React, { useState } from 'react';
import type { CustomStrategy, AIPrompt } from '../services/db';

interface ReplaySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableStrategies: CustomStrategy[];
  selectedStrategyIds: string[];
  onToggleStrategy: (id: string) => void;
  availablePrompts: AIPrompt[];
  selectedPromptIds: string[];
  onTogglePrompt: (id: string) => void;
  defaultStopLossPts: number;
  setDefaultStopLossPts: (pts: number) => void;
  defaultTakeProfitPts: number;
  setDefaultTakeProfitPts: (pts: number) => void;
  useTimeWindow: boolean;
  setUseTimeWindow: (enabled: boolean) => void;
  windowStart: string;
  setWindowStart: (s: string) => void;
  windowEnd: string;
  setWindowEnd: (s: string) => void;
}

export const ReplaySettingsModal: React.FC<ReplaySettingsModalProps> = ({
  isOpen,
  onClose,
  availableStrategies,
  selectedStrategyIds,
  onToggleStrategy,
  availablePrompts,
  selectedPromptIds,
  onTogglePrompt,
  defaultStopLossPts,
  setDefaultStopLossPts,
  defaultTakeProfitPts,
  setDefaultTakeProfitPts,
  useTimeWindow,
  setUseTimeWindow,
  windowStart,
  setWindowStart,
  windowEnd,
  setWindowEnd
}) => {
  const [activeTab, setActiveTab] = useState<'robots' | 'prompts' | 'rules'>('robots');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden text-slate-100 font-sans animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 border-b border-slate-800 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⚙️</span>
            <div>
              <h2 className="text-base font-extrabold text-white">Configurações da Simulação e Robôs</h2>
              <p className="text-[11px] text-slate-400">Ativação de Robôs Axion, Prompts IA e Regras de Execução</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition text-sm"
          >
            ✕
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-5 pt-2">
          {[
            { id: 'robots', label: '🤖 Robôs Axion', count: selectedStrategyIds.length },
            { id: 'prompts', label: '🧠 Prompts IA', count: selectedPromptIds.length },
            { id: 'rules', label: '📐 Regras & Horários' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400 bg-slate-900/50'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className="bg-blue-900 text-blue-200 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto custom-scrollbar">
          {/* TAB 1: ROBÔS AXION */}
          {activeTab === 'robots' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-400">
                Selecione quais robôs serão avaliados em tempo real a cada candle/micro-passo durante o Replay:
              </div>

              {availableStrategies.length === 0 ? (
                <div className="text-xs text-slate-500 italic bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
                  Nenhum robô cadastrado no sistema.
                </div>
              ) : (
                <div className="space-y-2">
                  {availableStrategies.map(strat => {
                    const isSelected = selectedStrategyIds.includes(strat.id!);
                    return (
                      <div
                        key={strat.id}
                        onClick={() => onToggleStrategy(strat.id!)}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                          isSelected
                            ? 'bg-blue-950/40 border-blue-500/60 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-4 h-4 accent-blue-600 rounded"
                          />
                          <div>
                            <div className="text-xs font-bold text-slate-100">{strat.name}</div>
                            <div className="text-[10px] text-slate-400">
                              Modo: {strat.execution_mode === 'realtime' ? 'Barra Corrente' : 'Barra Fechada'} | 
                              {strat.sessions && strat.sessions.length > 0 ? ` ${strat.sessions.length} sessões` : ' Sem restrição de horário'}
                            </div>
                          </div>
                        </div>

                        <span className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase ${
                          strat.action === 'alert'
                            ? 'bg-amber-950/60 text-amber-400 border border-amber-800/40'
                            : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                        }`}>
                          {strat.action === 'alert' ? 'Alerta / Indicador' : 'Executa Ordem'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PROMPTS IA */}
          {activeTab === 'prompts' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-400">
                Selecione quais Prompts IA atuarão como gatilhos ou confirmação técnica no Replay:
              </div>

              {availablePrompts.length === 0 ? (
                <div className="text-xs text-slate-500 italic bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
                  Nenhum Prompt IA configurado.
                </div>
              ) : (
                <div className="space-y-2">
                  {availablePrompts.map(prompt => {
                    const isSelected = selectedPromptIds.includes(prompt.id);
                    return (
                      <div
                        key={prompt.id}
                        onClick={() => onTogglePrompt(prompt.id)}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                          isSelected
                            ? 'bg-purple-950/40 border-purple-500/60 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-4 h-4 accent-purple-600 rounded"
                          />
                          <div>
                            <div className="text-xs font-bold text-slate-100">{prompt.name}</div>
                            <div className="text-[10px] text-slate-400 line-clamp-1">{prompt.description || prompt.trigger_entry}</div>
                          </div>
                        </div>

                        <span className="text-[10px] bg-purple-900/60 text-purple-200 border border-purple-700/50 px-2 py-0.5 rounded font-mono font-bold">
                          IA PROMPT
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: REGRAS & HORÁRIOS */}
          {activeTab === 'rules' && (
            <div className="space-y-4">
              {/* Default SL / TP Points */}
              <div className="grid grid-cols-2 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div>
                  <label className="text-xs font-bold text-rose-400 block mb-1">Stop Loss Padrão (Pontos)</label>
                  <input
                    type="number"
                    value={defaultStopLossPts}
                    onChange={(e) => setDefaultStopLossPts(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-rose-400 font-bold focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-emerald-400 block mb-1">Take Profit Padrão (Pontos)</label>
                  <input
                    type="number"
                    value={defaultTakeProfitPts}
                    onChange={(e) => setDefaultTakeProfitPts(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Time Window Filter */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-200">Janela de Horário da Simulação</div>
                    <div className="text-[10px] text-slate-400">Pula candles fora deste intervalo durante o replay</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={useTimeWindow}
                    onChange={(e) => setUseTimeWindow(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                  />
                </div>

                {useTimeWindow && (
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <span className="text-[11px] font-bold text-slate-400 block mb-1">Hora de Início</span>
                      <input
                        type="time"
                        value={windowStart}
                        onChange={(e) => setWindowStart(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs font-mono text-white"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-slate-400 block mb-1">Hora de Fim</span>
                      <input
                        type="time"
                        value={windowEnd}
                        onChange={(e) => setWindowEnd(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs font-mono text-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-900 border-t border-slate-800 px-5 py-3.5 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg transition active:scale-95 shadow"
          >
            Concluído
          </button>
        </div>
      </div>
    </div>
  );
};
