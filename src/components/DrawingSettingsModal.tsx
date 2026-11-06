import React, { useState } from 'react';
import type { DrawingItem, TriggerExecutionType } from '../types/chartDrawings';
import { DEFAULT_DRAWING_COLORS, FIB_LEVELS } from '../types/chartDrawings';
import { useApp } from '../context/AppContext';

interface DrawingSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  drawing: DrawingItem | null;
  onUpdateDrawing: (updated: DrawingItem) => void;
  onDeleteDrawing: (id: string) => void;
}

export const DrawingSettingsModal: React.FC<DrawingSettingsModalProps> = ({
  isOpen,
  onClose,
  drawing,
  onUpdateDrawing,
  onDeleteDrawing
}) => {
  const { customStrategies } = useApp() as any;
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen || !drawing) return null;

  const rawTrigger = drawing.trigger || {
    enabled: false,
    mode: 'reversal',
    targetFibLevel: 0.618,
    channelSide: 'both',
    requireConfirmation: false,
    status: 'disabled',
    contracts: 1,
    stopLossPts: 50,
    takeProfitPts: 50
  };

  const execType: TriggerExecutionType = rawTrigger.executionType || 
    (rawTrigger.targetAlgorithmId ? 'algorithm' : (rawTrigger.requireConfirmation ? 'panel_bias' : 'simple'));

  const trigger = {
    ...rawTrigger,
    executionType: execType
  };

  const getToolTitle = () => {
    switch (drawing.type) {
      case 'horizontal_line': return 'Linha Horizontal';
      case 'trend_line': return 'Linha de Tendência';
      case 'rectangle': return 'Retângulo (Região)';
      case 'fibonacci': return 'Retração de Fibonacci';
      case 'channel': return 'Canal de Tendência';
      case 'text': return 'Elemento de Texto';
      case 'arrow': return 'Zigue-Zague com Flecha';
      case 'ruler': return 'Régua de Medição';
      default: return 'Desenho';
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 z-[999999] flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#0f172a] border border-slate-700 rounded-xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-150 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#1e293b] px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">✏️</span>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">Configurações do Desenho</h3>
              <p className="text-[10px] text-slate-400 font-mono">{getToolTitle()} • ID: {drawing.id.slice(-6)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 text-xs text-slate-300 max-h-[75vh] overflow-y-auto">
          {/* 1. Estilo Visual */}
          <div className="bg-[#151e33] p-3 rounded-lg border border-slate-800 space-y-2.5">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
              🎨 Estilo Visual
            </label>
            
            {/* Cor */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-300">Cor da Linha:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {DEFAULT_DRAWING_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onUpdateDrawing({ ...drawing, color: c, fillColor: c })}
                    style={{ backgroundColor: c }}
                    className={`w-5 h-5 rounded-full border transition ${
                      drawing.color === c ? 'ring-2 ring-white scale-110 border-white' : 'border-transparent hover:scale-105'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Espessura */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-300">Espessura:</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4].map(w => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => onUpdateDrawing({ ...drawing, lineWidth: w })}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-bold border transition ${
                      drawing.lineWidth === w
                        ? 'bg-blue-600 text-white border-blue-400'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {w}px
                  </button>
                ))}
              </div>
            </div>

            {/* Estilo do Traço (Sólido, Pontilhado, Tracejado) */}
            {drawing.type !== 'text' && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-300">Estilo da Linha:</span>
                <div className="flex gap-1">
                  {[
                    { id: 0, label: 'Sólida', icon: '—' },
                    { id: 1, label: 'Pontilhada', icon: '•••' },
                    { id: 2, label: 'Tracejada', icon: '- - -' }
                  ].map(st => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => onUpdateDrawing({ ...drawing, lineStyle: st.id })}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold border transition ${
                        (drawing.lineStyle ?? 0) === st.id
                          ? 'bg-blue-600 text-white border-blue-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                      title={st.label}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Customização específica para elemento de Texto */}
            {drawing.type === 'text' && (
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div>
                  <span className="text-slate-300 block mb-1">Conteúdo do Texto:</span>
                  <input
                    type="text"
                    value={drawing.textValue || ''}
                    placeholder="Digite o texto do rótulo..."
                    onChange={(e) => onUpdateDrawing({ ...drawing, textValue: e.target.value })}
                    className="w-full bg-[#0d1424] border border-slate-700 rounded px-2.5 py-1.5 font-sans text-xs text-slate-100 outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-300">Tamanho da Fonte:</span>
                  <div className="flex gap-1">
                    {[11, 13, 16, 20].map(sz => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => onUpdateDrawing({ ...drawing, textFontSize: sz })}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold border transition ${
                          (drawing.textFontSize || 13) === sz
                            ? 'bg-blue-600 text-white border-blue-400'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        {sz}px
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Offset Canal (se for canal) */}
            {drawing.type === 'channel' && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
                <span className="text-slate-300">Largura do Canal (pts):</span>
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={drawing.channelDistancePts || 30}
                  onChange={(e) => onUpdateDrawing({ ...drawing, channelDistancePts: Math.max(1, parseFloat(e.target.value) || 10) })}
                  className="w-20 bg-[#0d1424] border border-slate-700 rounded px-2 py-0.5 text-right font-mono font-bold text-slate-100 outline-none"
                />
              </div>
            )}
          </div>

          {/* 2. Automação de Ordens (Gatilho de Reversão / Rompimento) - Oculto para Texto, Flecha e Régua */}
          {(drawing.type === 'text' || drawing.type === 'arrow' || drawing.type === 'ruler') ? (
            <div className="p-2.5 rounded-lg bg-[#151e33]/50 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
              <span>ℹ️</span>
              <span>Este elemento é exclusivo para desenho visual / medição e não dispara ordens de automação.</span>
            </div>
          ) : (
          <div className={`p-3 rounded-lg border transition ${
            trigger.enabled
              ? 'bg-[#151e33] border-blue-500/60 shadow-lg shadow-blue-950/40'
              : 'bg-[#151e33]/60 border-slate-800'
          }`}>
            <div className="flex items-center justify-between mb-2.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={trigger.enabled}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    onUpdateDrawing({
                      ...drawing,
                      trigger: {
                        ...trigger,
                        enabled,
                        status: enabled ? 'armed' : 'disabled'
                      }
                    });
                  }}
                  className="w-4 h-4 accent-blue-500 cursor-pointer rounded"
                />
                <span className="text-[11px] font-extrabold uppercase text-white tracking-wider">
                  ⚡ Automação ao Tocar Preço
                </span>
              </label>

              {trigger.enabled && (
                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                  trigger.status === 'armed'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700 animate-pulse'
                    : trigger.status === 'waiting_algo'
                    ? 'bg-amber-950 text-amber-300 border border-amber-500 animate-pulse'
                    : trigger.status === 'triggered'
                    ? 'bg-blue-950 text-blue-300 border border-blue-700'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {trigger.status === 'armed'
                    ? '🟢 ARMADO'
                    : trigger.status === 'waiting_algo'
                    ? '⏳ AGUARDANDO ROBÔ'
                    : trigger.status === 'triggered'
                    ? '⚡ DISPARADO'
                    : '⚪ INATIVO'}
                </span>
              )}
            </div>

            {trigger.enabled && (
              <div className="space-y-3 pt-2 border-t border-slate-800">
                {/* Modo de Execução: Reversão vs Rompimento */}
                <div className="space-y-1">
                  <span className="text-slate-400 text-[10px] font-bold block">AÇÃO AO TOCAR A LINHA / REGIÃO:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdateDrawing({
                        ...drawing,
                        trigger: { ...trigger, mode: 'reversal' }
                      })}
                      className={`p-2 rounded-lg border text-left transition flex flex-col gap-0.5 ${
                        trigger.mode === 'reversal'
                          ? 'bg-purple-950/80 border-purple-500 text-purple-200'
                          : 'bg-[#0d1424] border-slate-700 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <span className="font-extrabold text-xs">🔄 REVERSÃO</span>
                      <span className="text-[9px] text-slate-400">
                        Bate na resistência e Vende; bate no suporte e Compra.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onUpdateDrawing({
                        ...drawing,
                        trigger: { ...trigger, mode: 'breakout' }
                      })}
                      className={`p-2 rounded-lg border text-left transition flex flex-col gap-0.5 ${
                        trigger.mode === 'breakout'
                          ? 'bg-blue-950/80 border-blue-500 text-blue-200'
                          : 'bg-[#0d1424] border-slate-700 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <span className="font-extrabold text-xs">🚀 ROMPIMENTO</span>
                      <span className="text-[9px] text-slate-400">
                        Cruza para cima e Compra; cruza para baixo e Vende.
                      </span>
                    </button>
                  </div>
                </div>

                {/* Seleção do Nível em Fibonacci */}
                {drawing.type === 'fibonacci' && (
                  <div className="space-y-1">
                    <span className="text-slate-400 text-[10px] font-bold block">NÍVEL DE FIBONACCI ALVO:</span>
                    <select
                      value={trigger.targetFibLevel ?? 0.618}
                      onChange={(e) => onUpdateDrawing({
                        ...drawing,
                        trigger: { ...trigger, targetFibLevel: parseFloat(e.target.value) }
                      })}
                      className="w-full bg-[#0d1424] border border-slate-700 text-slate-100 font-mono font-bold text-xs py-1.5 px-2 rounded outline-none cursor-pointer"
                    >
                      {FIB_LEVELS.map(f => (
                        <option key={f.level} value={f.level} className="bg-slate-900">
                          {f.label} ({f.level * 100}%)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 3 Formas de Operação no Toque: Simples Toque | Viés do Painel | Algoritmo */}
                <div className="space-y-1.5 bg-[#0d1424] p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-300 font-bold block text-xs">
                    🎯 Condição de Execução no Toque:
                  </span>
                  
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onUpdateDrawing({
                        ...drawing,
                        trigger: {
                          ...trigger,
                          executionType: 'simple',
                          requireConfirmation: false,
                          targetAlgorithmId: undefined,
                          targetAlgorithmName: undefined
                        }
                      })}
                      className={`p-2 rounded border text-center transition flex flex-col items-center justify-center gap-1 ${
                        trigger.executionType === 'simple'
                          ? 'bg-blue-600/30 border-blue-500 text-white font-bold'
                          : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-sm">🎯</span>
                      <span className="text-[10px] leading-tight">Simples Toque</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onUpdateDrawing({
                        ...drawing,
                        trigger: {
                          ...trigger,
                          executionType: 'panel_bias',
                          requireConfirmation: true,
                          targetAlgorithmId: undefined,
                          targetAlgorithmName: undefined
                        }
                      })}
                      className={`p-2 rounded border text-center transition flex flex-col items-center justify-center gap-1 ${
                        trigger.executionType === 'panel_bias'
                          ? 'bg-purple-600/30 border-purple-500 text-purple-200 font-bold'
                          : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-sm">🧭</span>
                      <span className="text-[10px] leading-tight">Viés do Painel</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const firstAlgo = customStrategies && customStrategies.length > 0 ? customStrategies[0] : null;
                        onUpdateDrawing({
                          ...drawing,
                          trigger: {
                            ...trigger,
                            executionType: 'algorithm',
                            requireConfirmation: false,
                            targetAlgorithmId: trigger.targetAlgorithmId || firstAlgo?.id,
                            targetAlgorithmName: trigger.targetAlgorithmName || firstAlgo?.name || 'Algoritmo'
                          }
                        });
                      }}
                      className={`p-2 rounded border text-center transition flex flex-col items-center justify-center gap-1 ${
                        trigger.executionType === 'algorithm'
                          ? 'bg-amber-600/30 border-amber-500 text-amber-200 font-bold'
                          : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-sm">🤖</span>
                      <span className="text-[10px] leading-tight">Algoritmo / Robô</span>
                    </button>
                  </div>

                  {/* Seletor de Algoritmo quando executionType === 'algorithm' */}
                  {trigger.executionType === 'algorithm' && (
                    <div className="pt-2 mt-1 border-t border-slate-800 space-y-1 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-amber-300">
                          🤖 Selecionar Algoritmo de Confirmação:
                        </span>
                      </div>
                      
                      {customStrategies && customStrategies.length > 0 ? (
                        <select
                          value={trigger.targetAlgorithmId || ''}
                          onChange={(e) => {
                            const selectedId = e.target.value;
                            const algoObj = customStrategies.find((s: any) => s.id === selectedId);
                            onUpdateDrawing({
                              ...drawing,
                              trigger: {
                                ...trigger,
                                targetAlgorithmId: selectedId,
                                targetAlgorithmName: algoObj?.name || 'Algoritmo'
                              }
                            });
                          }}
                          className="w-full bg-[#050b14] border border-amber-500/50 text-amber-200 font-medium text-xs py-1.5 px-2 rounded outline-none cursor-pointer focus:border-amber-400"
                        >
                          {customStrategies.map((strat: any) => (
                            <option key={strat.id} value={strat.id} className="bg-slate-900 text-white">
                              {strat.name} {strat.action === 'alert' ? '(Indicador)' : '(Estratégia)'}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="p-2 rounded bg-amber-950/40 border border-amber-800/60 text-[10px] text-amber-300">
                          Nenhum robô cadastrado no Algorithm Builder. Crie um robô para vincular aqui.
                        </div>
                      )}
                      <span className="text-[9px] text-slate-400 block italic leading-tight">
                        Ao tocar a linha, o sistema armará este robô e só abrirá a ordem quando ele der a confirmação técnica.
                      </span>
                    </div>
                  )}

                  {trigger.executionType === 'panel_bias' && (
                    <span className="text-[9px] text-slate-400 block italic leading-tight pt-1">
                      Verifica a confluência de forças altista/baixista do painel no momento do toque antes de enviar a ordem.
                    </span>
                  )}
                  {trigger.executionType === 'simple' && (
                    <span className="text-[9px] text-slate-400 block italic leading-tight pt-1">
                      Dispara a ordem imediatamente na conta vinculada assim que o preço tocar ou romper a marcação.
                    </span>
                  )}
                </div>

                {/* Re-armar gatilho se já disparado ou em espera */}
                {(trigger.status === 'triggered' || trigger.status === 'waiting_algo') && (
                  <button
                    type="button"
                    onClick={() => onUpdateDrawing({
                      ...drawing,
                      trigger: { ...trigger, status: 'armed' }
                    })}
                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition active:scale-95 flex items-center justify-center gap-1.5 shadow cursor-pointer"
                  >
                    <span>🔄 Re-armar Gatilho Automático</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        </div>

        {/* Mensagem de Validação se houver */}
        {validationError && (
          <div className="mx-4 mb-2 p-2 rounded-lg bg-rose-950/80 border border-rose-600/80 text-rose-200 text-xs font-bold flex items-center gap-2 animate-bounce">
            <span>⚠️</span>
            <span>{validationError}</span>
          </div>
        )}

        {/* Footer */}
        <div className="bg-[#1e293b] px-4 py-3 border-t border-slate-700 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              onDeleteDrawing(drawing.id);
              onClose();
            }}
            className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/80 font-bold rounded-lg transition text-xs flex items-center gap-1 cursor-pointer"
          >
            🗑️ Excluir Desenho
          </button>

          <button
            type="button"
            onClick={() => {
              if (
                trigger.enabled &&
                trigger.executionType === 'algorithm' &&
                (!trigger.targetAlgorithmId || !customStrategies || customStrategies.length === 0)
              ) {
                setValidationError('Selecione um Robô/Algoritmo cadastrado para confirmar a operação!');
                return;
              }
              setValidationError(null);
              onClose();
            }}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition text-xs cursor-pointer shadow active:scale-95"
          >
            ✓ OK
          </button>
        </div>
      </div>
    </div>
  );
};
