import React, { useState } from 'react';
import type { ReplayAccountConfig } from '../utils/replayEngine';
import type { CustomStrategy, AIPrompt } from '../services/db';

interface ReplayAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: ReplayAccountConfig;
  onSaveAccount: (updated: ReplayAccountConfig) => void;
  availableStrategies: CustomStrategy[];
  availablePrompts?: AIPrompt[];
  linkedStrategyIds: string[];
  linkedPromptIds?: string[];
  onToggleLinkStrategy: (stratId: string) => void;
  onToggleLinkPrompt?: (promptId: string) => void;
  onResetBalance: (newBalance: number) => void;
  panels?: any[];
}

export const ReplayAccountModal: React.FC<ReplayAccountModalProps> = ({
  isOpen,
  onClose,
  account,
  onSaveAccount,
  availableStrategies,
  availablePrompts = [],
  linkedStrategyIds,
  linkedPromptIds = [],
  onToggleLinkStrategy,
  onToggleLinkPrompt,
  onResetBalance,
  panels = []
}) => {
  const [activeTab, setActiveTab] = useState<'risk' | 'strats'>('risk');
  const [accountName, setAccountName] = useState(account.account_name || 'Conta Replay');
  const [initialBalance, setInitialBalance] = useState(account.initial_balance || 50000);
  const [dailyStopLoss, setDailyStopLoss] = useState(account.daily_stop_loss_usd || 1000);
  const [dailyProfitTarget, setDailyProfitTarget] = useState(account.daily_max_gain_usd || 1500);
  const [dailyMaxEntries, setDailyMaxEntries] = useState(account.daily_max_entries !== undefined && account.daily_max_entries !== null ? account.daily_max_entries : 0);
  const [allowMultiSignals, setAllowMultiSignals] = useState(account.allow_multi_signals || false);
  const [maxDrawdown, setMaxDrawdown] = useState(account.max_drawdown_usd || 2500);

  const [selectedOptionToLink, setSelectedOptionToLink] = useState<string>('');

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveAccount({
      ...account,
      account_name: accountName,
      initial_balance: Number(initialBalance),
      daily_stop_loss_usd: Number(dailyStopLoss),
      daily_max_gain_usd: Number(dailyProfitTarget),
      daily_max_entries: Number(dailyMaxEntries),
      allow_multi_signals: allowMultiSignals,
      max_drawdown_usd: Number(maxDrawdown)
    });
    onClose();
  };

  const handleReset = () => {
    if (window.confirm(`Deseja redefinir o saldo da Conta Replay para $${Number(initialBalance).toLocaleString('en-US')} e restaurar a simulação?`)) {
      onResetBalance(Number(initialBalance));
    }
  };

  // Prompts e Algoritmos disponíveis para inclusão
  const unlinkedStrategies = availableStrategies.filter(s => s.id && !linkedStrategyIds.includes(s.id));
  const unlinkedPrompts = availablePrompts.filter(p => p.id && !linkedPromptIds.includes(p.id));

  const handleAddSelected = () => {
    if (!selectedOptionToLink) return;
    if (selectedOptionToLink.startsWith('strat_')) {
      const stratId = selectedOptionToLink.replace('strat_', '');
      onToggleLinkStrategy(stratId);
    } else if (selectedOptionToLink.startsWith('prompt_') && onToggleLinkPrompt) {
      const promptId = selectedOptionToLink.replace('prompt_', '');
      onToggleLinkPrompt(promptId);
    }
    setSelectedOptionToLink('');
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden text-slate-100 font-sans animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 border-b border-slate-800 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🏦</span>
            <div>
              <h2 className="text-base font-extrabold text-white">Configurações da Conta Replay</h2>
              <p className="text-[11px] text-slate-400">Gestão de Risco e Vínculo de Algoritmos/Prompts para Simulação</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition text-sm"
          >
            ✕
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-5 pt-2 gap-2">
          <button
            onClick={() => setActiveTab('risk')}
            className={`pb-2.5 px-3 text-xs font-bold transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'risk'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>⚙️ Risco & Saldo</span>
          </button>
          <button
            onClick={() => setActiveTab('strats')}
            className={`pb-2.5 px-3 text-xs font-bold transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'strats'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🤖 Robôs & Prompts IA</span>
            <span className="bg-purple-900 text-purple-200 px-1.5 py-0.2 rounded-full text-[10px]">
              {linkedStrategyIds.length + linkedPromptIds.length}
            </span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {activeTab === 'risk' && (
            <>
              {/* Status do Saldo Atual */}
              <div className="bg-emerald-950/30 border border-emerald-500/30 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Saldo Corrente Replay</div>
                  <div className="text-2xl font-black font-mono text-white mt-0.5">
                    ${(account.balance || 50000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <button
                  onClick={handleReset}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-2 rounded-lg transition active:scale-95 shadow flex items-center gap-1.5 cursor-pointer"
                  title="Restaurar Saldo Inicial"
                >
                  <span>🔄</span>
                  <span>Resetar Saldo</span>
                </button>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Nome da Conta</label>
                  <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Saldo Base Inicial ($ USD)</label>
                  <input
                    type="number"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-emerald-400 font-bold focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-rose-400 block mb-1">Stop Diário Máximo ($ USD)</label>
                  <input
                    type="number"
                    value={dailyStopLoss}
                    onChange={(e) => setDailyStopLoss(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-rose-400 font-bold focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-emerald-400 block mb-1">Meta Diária de Lucro ($ USD)</label>
                  <input
                    type="number"
                    value={dailyProfitTarget}
                    onChange={(e) => setDailyProfitTarget(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Limite Diário de Operações</label>
                  <input
                    type="number"
                    value={dailyMaxEntries}
                    onChange={(e) => setDailyMaxEntries(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white font-bold focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-amber-400 block mb-1">Drawdown Máximo ($ USD)</label>
                  <input
                    type="number"
                    value={maxDrawdown}
                    onChange={(e) => setMaxDrawdown(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-amber-400 font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Multi-signals Checkbox */}
              <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-200">Permitir Múltiplos Sinais Simultâneos</div>
                  <div className="text-[11px] text-slate-400">Permite abrir mais de uma posição ao mesmo tempo na Conta Replay.</div>
                </div>
                <input
                  type="checkbox"
                  checked={allowMultiSignals}
                  onChange={(e) => setAllowMultiSignals(e.target.checked)}
                  className="w-4 h-4 accent-blue-500 cursor-pointer"
                />
              </div>
            </>
          )}

          {activeTab === 'strats' && (
            <div className="space-y-4">
              {/* Seletor + Botão Incluir (Exatamente igual ao sistema de Contas Reais) */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5">
                <label className="text-xs font-bold text-slate-300 block">
                  ➕ Incluir Novo Robô, Indicador ou Prompt IA na Conta Replay
                </label>

                <div className="flex gap-2">
                  <select
                    value={selectedOptionToLink}
                    onChange={e => setSelectedOptionToLink(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 rounded-lg p-2 text-xs focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">-- Selecione um Robô, Alerta ou Prompt para Vincular --</option>

                    {unlinkedStrategies.length > 0 && (
                      <optgroup label="⚙️ Estratégias & Indicadores">
                        {unlinkedStrategies.map(strat => {
                          const targetPanelObj = panels.find((panel: any) => panel.id === strat.panel_id);
                          const panelBadgeName = targetPanelObj ? targetPanelObj.name : 'Ativo';
                          const isAlert = strat.action === 'alert';
                          return (
                            <option key={`opt_strat_${strat.id}`} value={`strat_${strat.id}`}>
                              {isAlert ? '🔔 INDICADOR' : '📈 ESTRATÉGIA'} | {strat.name} ({panelBadgeName})
                            </option>
                          );
                        })}
                      </optgroup>
                    )}

                    {unlinkedPrompts.length > 0 && (
                      <optgroup label="🧠 Prompts IA — Geradores de Sinais">
                        {unlinkedPrompts.map(p => {
                          const targetPanelObj = panels.find((panel: any) => panel.id === p.panel_id);
                          const panelBadgeName = targetPanelObj ? targetPanelObj.name : 'Ativo';
                          return (
                            <option key={`opt_prompt_${p.id}`} value={`prompt_${p.id}`}>
                              IA PROMPT | {p.name} ({panelBadgeName})
                            </option>
                          );
                        })}
                      </optgroup>
                    )}
                  </select>

                  <button
                    onClick={handleAddSelected}
                    disabled={!selectedOptionToLink}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-xs px-4 py-2 rounded-lg transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <span>➕</span>
                    <span>Incluir</span>
                  </button>
                </div>
              </div>

              {/* Lista dos Robôs e Prompts Vinculados */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Itens Vinculados nesta Conta Replay ({linkedStrategyIds.length + linkedPromptIds.length})
                </div>

                {linkedStrategyIds.length === 0 && linkedPromptIds.length === 0 && (
                  <div className="p-6 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                    Nenhum robô ou prompt vinculado. Utilize o seletor acima para adicionar.
                  </div>
                )}

                {/* Estratégias Vinculadas */}
                {linkedStrategyIds.map(stratId => {
                  const strat = availableStrategies.find(s => s.id === stratId);
                  if (!strat) return null;
                  const isAlert = strat.action === 'alert';
                  const targetPanelObj = panels.find((panel: any) => panel.id === strat.panel_id);

                  return (
                    <div
                      key={strat.id}
                      className="p-3 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl flex items-center justify-between transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          isAlert ? 'bg-amber-950 text-amber-400 border border-amber-500/40' : 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                        }`}>
                          {isAlert ? '🔔 INDICADOR' : '📈 ESTRATÉGIA'}
                        </span>
                        <div>
                          <div className="text-xs font-bold text-white">{strat.name}</div>
                          <div className="text-[10px] text-slate-400">
                            Painel: {targetPanelObj ? targetPanelObj.name : 'Ativo'} | Lotes: {strat.risk_settings?.lots || 1}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => strat.id && onToggleLinkStrategy(strat.id)}
                        className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-950/50 transition cursor-pointer"
                        title="Remover da Conta Replay"
                      >
                        🗑️
                      </button>
                    </div>
                  );
                })}

                {/* Prompts IA Vinculados */}
                {linkedPromptIds.map(promptId => {
                  const promptObj = availablePrompts.find(p => p.id === promptId);
                  if (!promptObj) return null;
                  const targetPanelObj = panels.find((panel: any) => panel.id === promptObj.panel_id);

                  return (
                    <div
                      key={promptObj.id}
                      className="p-3 bg-purple-950/20 border border-purple-800/40 hover:border-purple-600 rounded-xl flex items-center justify-between transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-950 text-purple-300 border border-purple-500/40">
                          🧠 IA PROMPT
                        </span>
                        <div>
                          <div className="text-xs font-bold text-white">{promptObj.name}</div>
                          <div className="text-[10px] text-purple-300/70">
                            Painel: {targetPanelObj ? targetPanelObj.name : 'Ativo'} | Tipo: {promptObj.prompt_type || 'signal_generator'}
                          </div>
                        </div>
                      </div>

                      {onToggleLinkPrompt && (
                        <button
                          onClick={() => onToggleLinkPrompt(promptObj.id)}
                          className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-950/50 transition cursor-pointer"
                          title="Remover da Conta Replay"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-900 border-t border-slate-800 px-5 py-3 flex items-center justify-between">
          <button
            onClick={handleReset}
            className="text-xs font-bold text-rose-400 hover:text-rose-300 transition cursor-pointer"
          >
            Restaurar Padrões de Fábrica
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-lg shadow-lg shadow-blue-900/30 transition active:scale-95 cursor-pointer"
            >
              Salvar Alterações
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
