import React, { useState, useEffect } from 'react';
import {
  PRESET_ATM_STRATEGIES,
  type ATMStrategy,
  type ATMBracket
} from '../utils/atmRegistry';
import {
  fetchAtmStrategiesSupabase,
  saveAtmStrategySupabase,
  deleteAtmStrategySupabase
} from '../services/db';
import { useApp } from '../context/AppContext';

interface ATMStrategyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectATM: (atm: ATMStrategy) => void;
  currentATM: ATMStrategy | null;
  initialEditingATM?: ATMStrategy | null;
}

export const ATMStrategyModal: React.FC<ATMStrategyModalProps> = ({
  isOpen,
  onClose,
  onSelectATM,
  currentATM,
  initialEditingATM
}) => {
  const { user, fetchAtmStrategiesList } = useApp() as any;
  const [atmList, setAtmList] = useState<ATMStrategy[]>(PRESET_ATM_STRATEGIES);
  const [editingATM, setEditingATM] = useState<ATMStrategy | null>(null);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadAtmStrategies = async () => {
    const list = await fetchAtmStrategiesSupabase();
    setAtmList(list);
  };

  useEffect(() => {
    if (isOpen) {
      loadAtmStrategies();
      if (initialEditingATM) {
        setEditingATM(initialEditingATM);
      } else {
        setEditingATM(null);
      }
    }
  }, [isOpen, user?.id, initialEditingATM]);

  if (!isOpen) return null;

  const handleCreateNewATM = () => {
    const newStrategy: ATMStrategy = {
      id: `atm-${Date.now()}`,
      name: `Nova Estratégia ATM ${atmList.length + 1}`,
      brackets: [
        {
          id: `b-1`,
          quantity: 1,
          stopLossPts: 10,
          takeProfitPts: 20,
          autoBreakevenEnabled: true,
          autoBreakevenTriggerPts: 10,
          autoBreakevenOffsetPts: 1,
          trailingStopEnabled: false,
          trailingStopTriggerPts: 15,
          trailingStopStepPts: 5
        }
      ]
    };
    setEditingATM(newStrategy);
  };

  const handleAddBracket = () => {
    if (!editingATM) return;
    const newBracket: ATMBracket = {
      id: `b-${editingATM.brackets.length + 1}`,
      quantity: 1,
      stopLossPts: 15,
      takeProfitPts: (editingATM.brackets.length + 1) * 20,
      autoBreakevenEnabled: true,
      autoBreakevenTriggerPts: 15,
      autoBreakevenOffsetPts: 1,
      trailingStopEnabled: true,
      trailingStopTriggerPts: 20,
      trailingStopStepPts: 5
    };
    setEditingATM({
      ...editingATM,
      brackets: [...editingATM.brackets, newBracket]
    });
  };

  const handleRemoveBracket = (id: string) => {
    if (!editingATM || editingATM.brackets.length <= 1) return;
    setEditingATM({
      ...editingATM,
      brackets: editingATM.brackets.filter(b => b.id !== id)
    });
  };

  const handleSaveEditingATM = async () => {
    if (!editingATM || !editingATM.name.trim()) return;
    const existsIndex = atmList.findIndex(a => a.id === editingATM.id);
    let updatedList: ATMStrategy[] = [];

    if (existsIndex >= 0) {
      updatedList = atmList.map((a, i) => i === existsIndex ? editingATM : a);
    } else {
      updatedList = [editingATM, ...atmList];
    }

    setAtmList(updatedList);
    await saveAtmStrategySupabase(editingATM);
    await fetchAtmStrategiesList?.();
    onSelectATM(editingATM);
    setMsg({ text: `Estratégia ATM "${editingATM.name}" salva com sucesso!`, type: 'success' });
    setEditingATM(null);
  };

  const handleDeleteATM = async (id: string, name: string) => {
    if (!window.confirm(`Deseja excluir o modelo ATM "${name}"?`)) return;
    await deleteAtmStrategySupabase(id);
    await fetchAtmStrategiesList?.();
    const updated = atmList.filter(a => a.id !== id);
    setAtmList(updated);
    if (currentATM?.id === id) {
      const nextATM = updated[0] || PRESET_ATM_STRATEGIES[0];
      if (nextATM) {
        onSelectATM(nextATM);
      }
    }
    setMsg({ text: `Estratégia ATM "${name}" excluída com sucesso.`, type: 'success' });
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-[#0f172a] border border-slate-700/80 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col text-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎯</span>
            <div>
              <h3 className="text-lg font-bold text-white tracking-wide">Gerenciador de Estratégias ATM (NinjaTrader 8)</h3>
              <p className="text-xs text-slate-400">Configure alvos múltiplos, stop loss, take profit e ordens de breakeven por contrato</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 p-2 rounded-lg text-sm transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {msg && (
            <div className={`p-3 rounded-lg text-xs font-bold mb-4 border ${
              msg.type === 'success' ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' : 'bg-rose-950/60 border-rose-800 text-rose-300'
            }`}>
              {msg.text}
            </div>
          )}

          {editingATM ? (
            /* Editing ATM Strategy Form */
            <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <div className="flex-1 mr-4">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Nome do Modelo ATM</label>
                  <input
                    type="text"
                    value={editingATM.name}
                    onChange={(e) => setEditingATM({ ...editingATM, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-white font-bold outline-none focus:border-blue-500"
                  />
                </div>
                <div className="mr-4">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Unidade de Medida</label>
                  <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded p-1">
                    <button
                      type="button"
                      onClick={() => setEditingATM({ ...editingATM, unit: 'ticks' })}
                      className={`px-3 py-1 rounded text-xs font-bold transition ${
                        editingATM.unit === 'ticks' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🎯 Ticks (NT8)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingATM({ ...editingATM, unit: 'points' })}
                      className={`px-3 py-1 rounded text-xs font-bold transition ${
                        editingATM.unit !== 'ticks' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      📏 Pontos
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setEditingATM(null)}
                  className="bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded text-xs text-slate-300 transition"
                >
                  Voltar à Lista
                </button>
              </div>

              {/* Brackets List */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Alvos e Brackets de Negociação</h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-amber-500/30">
                      Unidade: {editingATM.unit === 'ticks' ? 'Ticks (NinjaTrader 8)' : 'Pontos'}
                    </span>
                  </div>
                  <button
                    onClick={handleAddBracket}
                    className="bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white px-3 py-1 rounded text-xs font-bold transition flex items-center gap-1"
                  >
                    ➕ Adicionar Novo Alvo (Bracket)
                  </button>
                </div>

                {editingATM.brackets.map((b, idx) => {
                  const isTicks = editingATM.unit === 'ticks';
                  const unitLabel = isTicks ? 'Ticks' : 'Pontos';
                  return (
                  <div key={b.id} className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="font-bold text-xs text-blue-400">
                        🎯 Alvo #{idx + 1} ({b.quantity} {b.quantity === 1 ? 'Contrato' : 'Contratos'})
                      </span>
                      {editingATM.brackets.length > 1 && (
                        <button
                          onClick={() => handleRemoveBracket(b.id)}
                          className="text-rose-400 hover:text-rose-300 text-xs font-bold"
                        >
                          ✕ Remover Alvo
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="text-slate-400 block mb-1">Lote (Contratos):</label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={b.quantity}
                          onChange={(e) => {
                            const val = Math.max(1, parseInt(e.target.value) || 1);
                            setEditingATM({
                              ...editingATM,
                              brackets: editingATM.brackets.map((item, i) => i === idx ? { ...item, quantity: val } : item)
                            });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Stop Loss ({unitLabel}):</label>
                        <input
                          type="number"
                          min={1}
                          value={b.stopLossPts}
                          onChange={(e) => {
                            const val = Math.max(1, parseFloat(e.target.value) || 1);
                            setEditingATM({
                              ...editingATM,
                              brackets: editingATM.brackets.map((item, i) => i === idx ? { ...item, stopLossPts: val } : item)
                            });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-rose-400 font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Take Profit ({unitLabel}):</label>
                        <input
                          type="number"
                          min={1}
                          value={b.takeProfitPts}
                          onChange={(e) => {
                            const val = Math.max(1, parseFloat(e.target.value) || 1);
                            setEditingATM({
                              ...editingATM,
                              brackets: editingATM.brackets.map((item, i) => i === idx ? { ...item, takeProfitPts: val } : item)
                            });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-emerald-400 font-mono font-bold"
                        />
                      </div>
                    </div>

                    {/* Auto-Breakeven Controls for this Bracket */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-900 text-xs">
                      <div className="space-y-1">
                        <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-300">
                          <input
                            type="checkbox"
                            checked={b.autoBreakevenEnabled}
                            onChange={(e) => {
                              const val = e.target.checked;
                              setEditingATM({
                                ...editingATM,
                                brackets: editingATM.brackets.map((item, i) => i === idx ? { ...item, autoBreakevenEnabled: val } : item)
                              });
                            }}
                            className="accent-blue-500 rounded"
                          />
                          Auto-Breakeven
                        </label>
                        {b.autoBreakevenEnabled && (
                          <div className="flex gap-2 pt-1">
                            <div className="flex-1">
                              <span className="text-[10px] text-slate-500">Gatilho ({unitLabel}):</span>
                              <input
                                type="number"
                                value={b.autoBreakevenTriggerPts}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setEditingATM({
                                    ...editingATM,
                                    brackets: editingATM.brackets.map((item, i) => i === idx ? { ...item, autoBreakevenTriggerPts: val } : item)
                                  });
                                }}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs"
                              />
                            </div>
                            <div className="flex-1">
                              <span className="text-[10px] text-slate-500">Offset ({unitLabel}):</span>
                              <input
                                type="number"
                                value={b.autoBreakevenOffsetPts}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setEditingATM({
                                    ...editingATM,
                                    brackets: editingATM.brackets.map((item, i) => i === idx ? { ...item, autoBreakevenOffsetPts: val } : item)
                                  });
                                }}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-300">
                          <input
                            type="checkbox"
                            checked={b.trailingStopEnabled}
                            onChange={(e) => {
                              const val = e.target.checked;
                              setEditingATM({
                                ...editingATM,
                                brackets: editingATM.brackets.map((item, i) => i === idx ? { ...item, trailingStopEnabled: val } : item)
                              });
                            }}
                            className="accent-purple-500 rounded"
                          />
                          Trailing Stop
                        </label>
                        {b.trailingStopEnabled && (
                          <div className="flex gap-2 pt-1">
                            <div className="flex-1">
                              <span className="text-[10px] text-slate-500">Início ({unitLabel}):</span>
                              <input
                                type="number"
                                value={b.trailingStopTriggerPts}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setEditingATM({
                                    ...editingATM,
                                    brackets: editingATM.brackets.map((item, i) => i === idx ? { ...item, trailingStopTriggerPts: val } : item)
                                  });
                                }}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs"
                              />
                            </div>
                            <div className="flex-1">
                              <span className="text-[10px] text-slate-500">Passo ({unitLabel}):</span>
                              <input
                                type="number"
                                value={b.trailingStopStepPts}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setEditingATM({
                                    ...editingATM,
                                    brackets: editingATM.brackets.map((item, i) => i === idx ? { ...item, trailingStopStepPts: val } : item)
                                  });
                                }}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  onClick={handleSaveEditingATM}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-lg transition"
                >
                  💾 Salvar Modelo ATM
                </button>
              </div>
            </div>
          ) : (
            /* ATM Strategies List */
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Modelos ATM Salvos</h4>
                <button
                  onClick={handleCreateNewATM}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                >
                  ➕ Criar Nova Estratégia ATM
                </button>
              </div>

              <div className="space-y-3">
                {atmList.map(atm => {
                  const totalContracts = atm.brackets.reduce((acc, b) => acc + b.quantity, 0);
                  const isSelected = currentATM?.id === atm.id;
                  return (
                    <div
                      key={atm.id}
                      className={`bg-slate-900/80 border p-4 rounded-xl flex items-center justify-between gap-4 transition ${
                        isSelected ? 'border-blue-500 bg-blue-950/20 shadow-lg' : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h5 className="font-bold text-slate-100 text-sm">{atm.name}</h5>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 border border-amber-500/30 font-bold">
                            {atm.unit === 'ticks' ? '🎯 Ticks (NT8)' : '📏 Pontos'}
                          </span>
                          {isSelected && <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded font-bold">EM USO</span>}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Lote Total: <strong className="text-white font-mono">{totalContracts} contratos</strong> • {atm.brackets.length} alvos/brackets configurados.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            onSelectATM(atm);
                            onClose();
                          }}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                        >
                          ⚡ Usar este Modelo
                        </button>
                        <button
                          onClick={() => setEditingATM(atm)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold px-3 py-1.5 rounded-lg transition"
                        >
                          ⚙️ Editar
                        </button>
                        <button
                          onClick={() => handleDeleteATM(atm.id, atm.name)}
                          className="bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 text-xs font-bold px-2.5 py-1.5 rounded-lg transition"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
