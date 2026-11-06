import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { saveAccountStrategySupabase } from '../services/db';

interface CopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CopilotModal: React.FC<CopilotModalProps> = ({ isOpen, onClose }) => {
  const {
    aiEnabled,
    setAiEnabled,
    isAnalyzing,
    runManualAIAnalysis,
    accounts,
    activeAccount,
    switchAccount,
    activePanel,
    panels,
    prompts,
    settings,
    saveSettings,
    accountStrategies,
    setAccountStrategies,
    linkStrategyToAccount,
    unlinkStrategyFromAccount
  } = useApp() as any;

  const [selectedPromptId, setSelectedPromptId] = useState<string>(() => {
    return settings?.selected_prompt_id || (prompts && prompts[0]?.id) || '';
  });

  const [triggerMode, setTriggerMode] = useState<string>(() => {
    return settings?.ai_trigger_mode || 'barra';
  });

  const [sizingMode, setSizingMode] = useState<'lote' | 'risco'>(() => {
    return settings?.chart_manual_sizing_mode || 'lote';
  });

  const [riskUsd, setRiskUsd] = useState<number>(() => {
    return settings?.chart_manual_risk_usd || 250;
  });

  const [buttonPosition, setButtonPosition] = useState<'right' | 'left'>(() => {
    return settings?.copilot_button_position || (localStorage.getItem('vortex_copilot_btn_pos') as any) || 'right';
  });

  const [copilotTheme, setCopilotTheme] = useState<string>(() => {
    return settings?.copilot_theme || localStorage.getItem('vortex_copilot_theme') || 'ninja_black';
  });

  const [aiProvider, setAiProvider] = useState<'groq' | 'gemini' | 'openai'>(() => {
    return settings?.ai_provider || 'groq';
  });
  const [groqKey, setGroqKey] = useState<string>(() => settings?.groq_api_key || '');
  const [geminiKey, setGeminiKey] = useState<string>(() => settings?.gemini_api_key || '');
  const [openaiKey, setOpenaiKey] = useState<string>(() => settings?.openai_api_key || '');
  const [isKeysSaved, setIsKeysSaved] = useState<boolean>(false);

  const handleSaveApiKeys = async () => {
    if (saveSettings) {
      const ok = await saveSettings({
        ai_provider: aiProvider,
        groq_api_key: groqKey,
        gemini_api_key: geminiKey,
        openai_api_key: openaiKey
      });
      if (ok) {
        setIsKeysSaved(true);
        setTimeout(() => setIsKeysSaved(false), 2500);
      }
    }
  };

  if (!isOpen) return null;

  // Filtrar estratégias/prompts vinculados à conta atual (exclusivamente prompts de Copilot / Contexto, excluindo Geradores de Sinais que rodam em 2º plano na Gestão de Contas)
  const accountLinked = (accountStrategies || []).filter((s: any) => {
    if (s.account_id !== activeAccount?.id) return false;
    if (!s.prompt_id && s.manual_strategy_id) return false;
    if (s.prompt_id && s.prompt_id !== 'native-chart') {
      const pObj = (prompts || []).find((p: any) => p.id === s.prompt_id);
      if (pObj && pObj.prompt_type === 'signal_generator') return false;
    }
    return true;
  });

  const isCopilotActive = Boolean(aiEnabled);

  const handleToggleGlobalCopilot = async () => {
    const nextState = !isCopilotActive;
    if (setAiEnabled) setAiEnabled(nextState);

    // Se estiver ativando e a conta ativa não tiver nenhuma estratégia vinculada, vincular o item selecionado
    if (nextState && activeAccount) {
      const targetPromptId = selectedPromptId || 'native-chart';
      const alreadyLinked = accountLinked.some((s: any) => (s.prompt_id || 'native-chart') === targetPromptId);
      if (!alreadyLinked && linkStrategyToAccount) {
        await linkStrategyToAccount({
          account_id: activeAccount.id,
          prompt_id: targetPromptId === 'native-chart' ? null : targetPromptId,
          panel_id: activePanel?.id || null,
          contract_size_multiplier: 1.0,
          is_enabled: true
        });
      } else if (alreadyLinked && setAccountStrategies) {
        setAccountStrategies((prev: any[]) =>
          prev.map((r: any) =>
            r.account_id === activeAccount.id && (r.prompt_id || 'native-chart') === targetPromptId
              ? { ...r, is_enabled: true, panel_id: r.panel_id || activePanel?.id || null }
              : r
          )
        );
      }
    }
  };

  const handleToggleRoute = async (route: any) => {
    const nextEnabled = !(route.is_enabled !== false);
    if (setAccountStrategies) {
      setAccountStrategies((prev: any[]) =>
        prev.map((r: any) => (r.id === route.id ? { ...r, is_enabled: nextEnabled } : r))
      );
    }
    await saveAccountStrategySupabase({
      id: route.id,
      account_id: route.account_id,
      prompt_id: route.prompt_id,
      manual_strategy_id: route.manual_strategy_id,
      panel_id: route.panel_id || activePanel?.id || null,
      contract_size_multiplier: route.contract_size_multiplier,
      is_enabled: nextEnabled
    });
  };

  const handleUnlinkRoute = async (route: any) => {
    if (unlinkStrategyFromAccount) {
      await unlinkStrategyFromAccount(route.id);
    }
  };

  const handleLinkCurrentPrompt = async () => {
    if (!activeAccount) return;
    const targetPromptId = selectedPromptId || 'native-chart';
    const exists = accountLinked.some((s: any) => (s.prompt_id || 'native-chart') === targetPromptId);
    if (exists) return;
    if (linkStrategyToAccount) {
      await linkStrategyToAccount({
        account_id: activeAccount.id,
        prompt_id: targetPromptId === 'native-chart' ? null : targetPromptId,
        panel_id: activePanel?.id || null,
        contract_size_multiplier: 1.0,
        is_enabled: true
      });
    }
    if (setAiEnabled && !aiEnabled) {
      setAiEnabled(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-[#0b101d] border border-purple-500/40 rounded-xl shadow-2xl max-w-xl w-full p-5 overflow-hidden flex flex-col gap-4 text-slate-100 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do Modal */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-purple-600/20 border border-purple-500/50 flex items-center justify-center text-xl shadow-inner">
              🤖
            </div>
            <div>
              <h2 className="font-extrabold text-base text-white tracking-wide flex items-center gap-2">
                COPILOT QUANTITATIVO IA
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    isCopilotActive
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {isCopilotActive ? '🟢 ATIVO' : '⚪ INATIVO'}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Execução e análise autônoma com confluência de Volume, Gamma e Macro.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 transition text-lg p-1.5 rounded-md hover:bg-slate-800 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Master Toggle Bar */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
          <div>
            <span className="font-bold text-sm text-slate-200 block">Modo Piloto Automático</span>
            <span className="text-xs text-slate-400">
              {isCopilotActive
                ? 'A IA está monitorando o mercado e operando as estratégias vinculadas.'
                : 'A IA está em pausa. Clique no botão ao lado para ativar o Copilot.'}
            </span>
          </div>
          <button
            onClick={handleToggleGlobalCopilot}
            className={`px-4 py-2 rounded-lg font-black text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer border ${
              isCopilotActive
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-emerald-900/40'
                : 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400 shadow-purple-900/40'
            }`}
          >
            {isCopilotActive ? '⏸️ Desativar' : '▶️ Ativar Copilot'}
          </button>
        </div>

        {/* Configurações Rápidas do Copilot */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Conta de Execução */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
              <span>🏦</span> Conta
            </label>
            <select
              value={activeAccount?.id || (accounts && accounts[0]?.id) || ''}
              onChange={(e) => {
                const acc = accounts.find((a: any) => a.id === e.target.value);
                if (acc && switchAccount) switchAccount(acc);
              }}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-emerald-400 font-bold focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              {accounts && accounts.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.account_name} ({a.platform ? a.platform.toUpperCase() : 'CONTA'})
                </option>
              ))}
            </select>
          </div>

          {/* 2. Modo de Disparo */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
              <span>⏱️</span> Gatilho
            </label>
            <select
              value={triggerMode}
              onChange={(e) => {
                const val = e.target.value;
                setTriggerMode(val);
                if (saveSettings) saveSettings({ ai_trigger_mode: val });
              }}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-purple-300 font-bold focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              <option value="barra">🕯️ Fechamento Barra</option>
              <option value="alerta">⚡ Alerta / Níveis</option>
              <option value="tempo">⏰ Tempo (60s)</option>
              <option value="manual">🖐️ Sob Demanda</option>
            </select>
          </div>

          {/* 3. Posição do Botão Flutuante */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
              <span>💬</span> Posição do Chat
            </label>
            <select
              value={buttonPosition}
              onChange={(e) => {
                const val = e.target.value as 'right' | 'left';
                setButtonPosition(val);
                try {
                  localStorage.setItem('vortex_copilot_btn_pos', val);
                  window.dispatchEvent(new CustomEvent('vortex_copilot_btn_pos_changed', { detail: { position: val } }));
                } catch {}
                if (saveSettings) saveSettings({ copilot_button_position: val });
              }}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-cyan-300 font-bold focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              <option value="right">👉 Direita (Padrão)</option>
              <option value="left">👈 Esquerda</option>
            </select>
          </div>

          {/* 4. Esquema Visual do Chat */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
              <span>🎨</span> Tema Visual
            </label>
            <select
              value={copilotTheme}
              onChange={(e) => {
                const val = e.target.value;
                setCopilotTheme(val);
                try {
                  localStorage.setItem('vortex_copilot_theme', val);
                } catch {}
                if (saveSettings) saveSettings({ copilot_theme: val });
              }}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-purple-300 font-bold focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              <option value="ninja_black">⬛ Preto Total</option>
              <option value="ninja_slate">🔘 Cinza Escuro</option>
              <option value="contrast_light">⚪ Cinza Grafite / Médio</option>
              <option value="cyber_purple">🟣 Cyber Roxo</option>
            </select>
          </div>
        </div>

        {/* 3. Provedor de IA & Chaves de API (Multi-Provider Salvo por Usuário) */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
              <span>🤖</span> Provedores de IA & Chaves de API (Salvas na Conta)
            </label>
            <div className="flex items-center gap-2">
              {isKeysSaved && (
                <span className="text-[10px] text-emerald-400 font-bold animate-pulse">
                  ✓ Chaves Salvas!
                </span>
              )}
              <button
                type="button"
                onClick={handleSaveApiKeys}
                className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-[10px] font-bold transition cursor-pointer"
                title="Salvar chaves de API dos 3 provedores"
              >
                💾 Salvar APIs
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setAiProvider('groq')}
              className={`p-2 rounded-lg border text-left transition flex flex-col justify-between ${
                aiProvider === 'groq'
                  ? 'bg-purple-950/60 border-purple-500 text-white shadow-md'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[11px]">⚡ Groq</span>
                <span className={`text-[8px] px-1 py-0.2 rounded font-mono ${groqKey ? 'text-emerald-400 bg-emerald-950/60' : 'text-slate-500'}`}>
                  {groqKey ? 'Salva' : 'Vazia'}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setAiProvider('gemini')}
              className={`p-2 rounded-lg border text-left transition flex flex-col justify-between ${
                aiProvider === 'gemini'
                  ? 'bg-blue-950/60 border-blue-500 text-white shadow-md'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[11px]">✨ Gemini</span>
                <span className={`text-[8px] px-1 py-0.2 rounded font-mono ${geminiKey ? 'text-emerald-400 bg-emerald-950/60' : 'text-slate-500'}`}>
                  {geminiKey ? 'Salva' : 'Vazia'}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setAiProvider('openai')}
              className={`p-2 rounded-lg border text-left transition flex flex-col justify-between ${
                aiProvider === 'openai'
                  ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-md'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[11px]">🟢 OpenAI</span>
                <span className={`text-[8px] px-1 py-0.2 rounded font-mono ${openaiKey ? 'text-emerald-400 bg-emerald-950/60' : 'text-slate-500'}`}>
                  {openaiKey ? 'Salva' : 'Vazia'}
                </span>
              </div>
            </button>
          </div>

          <div className="pt-1">
            {aiProvider === 'groq' && (
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Groq API Key (gsk_...)</label>
                <input
                  type="password"
                  value={groqKey}
                  onChange={(e) => setGroqKey(e.target.value)}
                  placeholder="gsk_..."
                  className="bg-slate-950 border border-slate-700 p-1.5 rounded text-xs w-full text-slate-200 font-mono focus:outline-none focus:border-purple-500"
                />
              </div>
            )}
            {aiProvider === 'gemini' && (
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Gemini API Key (AIzaSy...)</label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="bg-slate-950 border border-slate-700 p-1.5 rounded text-xs w-full text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
            {aiProvider === 'openai' && (
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">OpenAI API Key (sk-proj-...)</label>
                <input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="bg-slate-950 border border-slate-700 p-1.5 rounded text-xs w-full text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}
          </div>
        </div>

        {/* 4. Estratégia / Prompt do Copilot */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
              <span>🧠</span> Prompt / Estratégia de Inteligência Artificial
            </label>
            <button
              onClick={handleLinkCurrentPrompt}
              className="text-[10.5px] font-bold text-purple-400 hover:text-purple-300 underline cursor-pointer"
            >
              + Vincular à Conta Ativa
            </button>
          </div>
          <select
            value={selectedPromptId || ''}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedPromptId(val);
              if (saveSettings) saveSettings({ selected_prompt_id: val });
            }}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-purple-500 cursor-pointer"
          >
            <option value="">🎯 Contexto do Gráfico & Indicadores (Nativo Puro / Sem Prompt)</option>
            {prompts && prompts.filter((p: any) => p.prompt_type !== 'signal_generator').map((p: any) => (
              <option key={p.id} value={p.id}>
                🧠 {p.name} ({p.model_provider || 'Groq'} - {p.model_name || 'Llama 3.3'})
              </option>
            ))}
          </select>
          <span className="text-[10px] text-slate-400">
            {selectedPromptId ? 'O Copilot analisará os dados técnicos do gráfico e complementará com as regras do prompt selecionado.' : 'O Copilot analisará nativamente todos os indicadores ativos no gráfico, widgets e a tela visível, priorizando a gestão de posições abertas.'}
          </span>
        </div>

        {/* 4. Gestão de Contratos e Risco */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
            <span>🛡️</span> Dimensionamento de Lotes para o Copilot
          </label>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setSizingMode('lote');
                  if (saveSettings) saveSettings({ chart_manual_sizing_mode: 'lote' });
                }}
                className={`px-3 py-1 rounded-md font-bold transition ${
                  sizingMode === 'lote' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Lote Fixo
              </button>
              <button
                type="button"
                onClick={() => {
                  setSizingMode('risco');
                  if (saveSettings) saveSettings({ chart_manual_sizing_mode: 'risco' });
                }}
                className={`px-3 py-1 rounded-md font-bold transition ${
                  sizingMode === 'risco' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Risco ($)
              </button>
            </div>

            {sizingMode === 'risco' && (
              <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs">
                <span className="text-slate-400 font-bold">Máx Risco: $</span>
                <input
                  type="number"
                  value={riskUsd}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setRiskUsd(v);
                    if (saveSettings) saveSettings({ chart_manual_risk_usd: v });
                  }}
                  className="w-16 bg-transparent text-emerald-400 font-bold focus:outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* 5. Lista de Estratégias / Prompts IA Vinculados na Conta Selecionada */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <span>🧠</span> Estratégias IA na Conta: <strong className="text-emerald-400">{activeAccount?.account_name || 'Conta Atual'}</strong>
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {accountLinked.length} vinculada(s)
            </span>
          </div>

          {accountLinked.length === 0 ? (
            <div className="text-xs text-slate-500 py-3 text-center bg-slate-950/40 rounded-lg border border-slate-800">
              Nenhuma estratégia IA vinculada. Escolha acima o <strong className="text-purple-300">Contexto do Gráfico</strong> ou um <strong className="text-purple-300">Prompt</strong> e clique em "+ Vincular à Conta Ativa".
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
              {accountLinked.map((route: any) => {
                const prompt = prompts?.find((p: any) => p.id === route.prompt_id);
                const isNativeChart = !route.prompt_id || route.prompt_id === 'native-chart';
                const name = isNativeChart 
                  ? '🎯 Contexto do Gráfico & Indicadores (Nativo)'
                  : (prompt ? `🧠 ${prompt.name}` : '🧠 Estratégia de IA');
                const isEnabled = route.is_enabled !== false;
                const routePanelId = (prompt?.panel_id && prompt.panel_id !== 'all' ? prompt.panel_id : null) || route.panel_id || null;
                const routePanelObj = routePanelId ? (panels || []).find((p: any) => p.id === routePanelId || p.instance_id === routePanelId) : null;
                const routePanelLabel = routePanelObj ? routePanelObj.name : (routePanelId === 'all' ? 'Todos' : (activePanel?.name || 'Ativo'));

                return (
                  <div
                    key={route.id}
                    className={`px-3 py-2 rounded-lg border flex items-center justify-between gap-2 transition ${
                      isEnabled
                        ? 'bg-purple-950/40 border-purple-500/40 text-purple-200'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-1">
                      <span className={`w-2 h-2 shrink-0 rounded-full ${isEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                      <span className="text-xs font-bold truncate max-w-[180px]" title={name}>
                        {name}
                      </span>
                      <span className="px-1.5 py-0.5 text-[9px] font-black uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded shrink-0">
                        🎯 {routePanelLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleRoute(route)}
                        className={`px-2.5 py-1 rounded text-[10px] font-extrabold uppercase transition cursor-pointer border ${
                          isEnabled
                            ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400'
                        }`}
                        title={isEnabled ? 'Pausar esta estratégia IA' : 'Ativar esta estratégia IA'}
                      >
                        {isEnabled ? '⏸️ Pausar' : '▶️ Ativar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUnlinkRoute(route)}
                        className="px-2 py-1 bg-red-950/60 hover:bg-red-900/80 text-red-300 hover:text-white border border-red-800/60 rounded text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                        title="Desvincular estratégia desta conta"
                      >
                        🗑️ Desvincular
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={() => {
              if (runManualAIAnalysis) runManualAIAnalysis();
            }}
            disabled={isAnalyzing}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow"
          >
            <span>{isAnalyzing ? '⏳ Analisando...' : '⚡ Analisar com IA Agora'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
