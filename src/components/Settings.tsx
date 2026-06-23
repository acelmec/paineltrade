import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

interface SettingsProps {
  initialTab?: 'geral' | 'fontes' | 'telegram' | 'prompts' | 'alertas';
}

export const Settings: React.FC<SettingsProps> = ({ initialTab = 'geral' }) => {
  const { settings, saveSettings } = useApp();
  const [activeTab, setActiveTab] = useState<'geral' | 'fontes' | 'telegram' | 'prompts' | 'alertas'>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  
  // Geral State
  const [aiProvider, setAiProvider] = useState<'groq' | 'gemini' | 'openai'>('groq');
  const [groqKey, setGroqKey] = useState<string>('');
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [openaiKey, setOpenaiKey] = useState<string>('');
  const [groqModel, setGroqModel] = useState<string>('');
  const [geminiModel, setGeminiModel] = useState<string>('');
  const [openaiModel, setOpenaiModel] = useState<string>('');
  const [intervalo, setIntervalo] = useState<number>(30000);
  const [enviarImagemIA, setEnviarImagemIA] = useState<boolean>(true);

  // Fontes State
  const [instanceIdForce, setInstanceIdForce] = useState<string>('painel_principal');
  const [gammaSymbol, setGammaSymbol] = useState<string>('NQ');
  const [sourceMarket, setSourceMarket] = useState<string>('supabase');
  const [instanceIdMarket, setInstanceIdMarket] = useState<string>('nt8_main');
  const [sourceScreen, setSourceScreen] = useState<string>('supabase');
  const [instanceIdScreen, setInstanceIdScreen] = useState<string>('nt8_main');

  // Telegram State
  const [telegramEnabled, setTelegramEnabled] = useState<boolean>(false);
  const [telegramBotToken, setTelegramBotToken] = useState<string>('');
  const [telegramChatId, setTelegramChatId] = useState<string>('');
  const [telegramSendImage, setTelegramSendImage] = useState<boolean>(true);
  const [telegramSendSignal, setTelegramSendSignal] = useState<boolean>(true);

  // Prompts State
  const [aiSystemPrompt, setAiSystemPrompt] = useState<string>('');

  // Alertas State
  const [alertZscoreMin, setAlertZscoreMin] = useState<number>(-2.0);
  const [alertZscoreMax, setAlertZscoreMax] = useState<number>(2.0);
  const [alertDeltaMin, setAlertDeltaMin] = useState<number>(-10000);
  const [alertDeltaMax, setAlertDeltaMax] = useState<number>(10000);
  const [alertSoundEnabled, setAlertSoundEnabled] = useState<boolean>(true);
  const [alertPopupEnabled, setAlertPopupEnabled] = useState<boolean>(true);

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (settings) {
      setAiProvider(settings.ai_provider || 'groq');
      setGroqKey(settings.groq_api_key || '');
      setGeminiKey(settings.gemini_api_key || '');
      setOpenaiKey(settings.openai_api_key || '');
      setGroqModel(settings.groq_model || 'meta-llama/llama-4-scout-17b-16e-instruct');
      setGeminiModel(settings.gemini_model || 'gemini-1.5-flash');
      setOpenaiModel(settings.openai_model || 'gpt-4o-mini');
      setIntervalo(settings.intervalo || 30000);
      setEnviarImagemIA(settings.enviar_imagem_ia !== false);

      setInstanceIdForce(settings.instance_id_force || 'painel_principal');
      setGammaSymbol(settings.gamma_symbol || 'NQ');
      setSourceMarket(settings.source_market || 'supabase');
      setInstanceIdMarket(settings.instance_id_market || 'nt8_main');
      setSourceScreen(settings.source_screen || 'supabase');
      setInstanceIdScreen(settings.instance_id_screen || 'nt8_main');

      setTelegramEnabled(settings.telegram_enabled || false);
      setTelegramBotToken(settings.telegram_bot_token || '');
      setTelegramChatId(settings.telegram_chat_id || '');
      setTelegramSendImage(settings.telegram_send_image !== false);
      setTelegramSendSignal(settings.telegram_send_signal !== false);

      setAiSystemPrompt(settings.ai_system_prompt || '');
      setAlertZscoreMin(settings.alert_zscore_min !== undefined ? Number(settings.alert_zscore_min) : -2.0);
      setAlertZscoreMax(settings.alert_zscore_max !== undefined ? Number(settings.alert_zscore_max) : 2.0);
      setAlertDeltaMin(settings.alert_delta_min !== undefined ? Number(settings.alert_delta_min) : -10000);
      setAlertDeltaMax(settings.alert_delta_max !== undefined ? Number(settings.alert_delta_max) : 10000);
      setAlertSoundEnabled(settings.alert_sound_enabled !== false);
      setAlertPopupEnabled(settings.alert_popup_enabled !== false);
    }
  }, [settings]);

  const handleSaveGeral = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const success = await saveSettings({
      ai_provider: aiProvider,
      groq_api_key: groqKey,
      gemini_api_key: geminiKey,
      openai_api_key: openaiKey,
      groq_model: groqModel,
      gemini_model: geminiModel,
      openai_model: openaiModel,
      intervalo: Number(intervalo),
      enviar_imagem_ia: enviarImagemIA
    });
    if (success) {
      setMessage({ text: 'Configurações Gerais salvas com sucesso!', type: 'success' });
    } else {
      setMessage({ text: 'Falha ao salvar configurações gerais.', type: 'error' });
    }
  };

  const handleSaveFontes = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const success = await saveSettings({
      instance_id_force: instanceIdForce,
      gamma_symbol: gammaSymbol,
      source_market: sourceMarket,
      instance_id_market: instanceIdMarket,
      source_screen: sourceScreen,
      instance_id_screen: instanceIdScreen
    });
    if (success) {
      setMessage({ text: 'Fontes de Dados atualizadas com sucesso!', type: 'success' });
    } else {
      setMessage({ text: 'Falha ao salvar fontes de dados.', type: 'error' });
    }
  };

  const handleSaveTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const success = await saveSettings({
      telegram_enabled: telegramEnabled,
      telegram_bot_token: telegramBotToken,
      telegram_chat_id: telegramChatId,
      telegram_send_image: telegramSendImage,
      telegram_send_signal: telegramSendSignal
    });
    if (success) {
      setMessage({ text: 'Configuração do Telegram salva com sucesso!', type: 'success' });
    } else {
      setMessage({ text: 'Falha ao salvar configurações do Telegram.', type: 'error' });
    }
  };

  const handleSavePrompts = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const success = await saveSettings({
      ai_system_prompt: aiSystemPrompt
    });
    if (success) {
      setMessage({ text: 'Prompt da IA salvo com sucesso!', type: 'success' });
    } else {
      setMessage({ text: 'Falha ao salvar Prompt da IA.', type: 'error' });
    }
  };

  const handleSaveAlerts = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const success = await saveSettings({
      alert_zscore_min: Number(alertZscoreMin),
      alert_zscore_max: Number(alertZscoreMax),
      alert_delta_min: Number(alertDeltaMin),
      alert_delta_max: Number(alertDeltaMax),
      alert_sound_enabled: alertSoundEnabled,
      alert_popup_enabled: alertPopupEnabled
    });
    if (success) {
      setMessage({ text: 'Configurações de Alertas salvas com sucesso!', type: 'success' });
    } else {
      setMessage({ text: 'Falha ao salvar configurações de alertas.', type: 'error' });
    }
  };

  return (
    <div className="glass p-6 rounded-lg max-w-4xl mx-auto my-4 border border-slate-700">
      <h2 className="text-2xl font-bold mb-4 text-blue-400">⚙️ Configurações do Sistema</h2>
      
      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-700 pb-2 overflow-x-auto scrollbar-hide">
        <button
          className={`alert-tab-btn ${activeTab === 'geral' ? 'active' : ''}`}
          onClick={() => { setActiveTab('geral'); setMessage(null); }}
        >
          ⚙️ Geral
        </button>
        <button
          className={`alert-tab-btn ${activeTab === 'fontes' ? 'active' : ''}`}
          onClick={() => { setActiveTab('fontes'); setMessage(null); }}
        >
          📂 Fontes de Dados
        </button>
        <button
          className={`alert-tab-btn ${activeTab === 'telegram' ? 'active' : ''}`}
          onClick={() => { setActiveTab('telegram'); setMessage(null); }}
        >
          📱 Telegram
        </button>
        <button
          className={`alert-tab-btn ${activeTab === 'prompts' ? 'active' : ''}`}
          onClick={() => { setActiveTab('prompts'); setMessage(null); }}
        >
          🧠 Prompts IA
        </button>
        <button
          className={`alert-tab-btn ${activeTab === 'alertas' ? 'active' : ''}`}
          onClick={() => { setActiveTab('alertas'); setMessage(null); }}
        >
          🔔 Alertas
        </button>
      </div>

      {message && (
        <div className={`p-3 rounded mb-4 text-xs font-bold border ${message.type === 'success' ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-red-500/50 bg-red-500/10 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* Geral Tab */}
      {activeTab === 'geral' && (
        <form onSubmit={handleSaveGeral} className="space-y-6">
          <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 mb-2">🔑 Seleção do Provedor de Inteligência Artificial</h3>
            <div>
              <label className="text-xs text-slate-400 uppercase block mb-1">Provedor Ativo</label>
              <select
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200"
              >
                <option value="groq">Groq (Llama)</option>
                <option value="gemini">Gemini (Google)</option>
                <option value="openai">GPT (OpenAI)</option>
              </select>
            </div>

            {aiProvider === 'groq' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 uppercase block mb-1">Groq API Key</label>
                  <input
                    type="password"
                    value={groqKey}
                    onChange={(e) => setGroqKey(e.target.value)}
                    placeholder="gsk_..."
                    className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase block mb-1">Modelo Groq</label>
                  <select
                    value={groqModel}
                    onChange={(e) => setGroqModel(e.target.value)}
                    className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200"
                  >
                    <option value="meta-llama/llama-4-scout-17b-16e-instruct">Llama 4 Scout (Vision)</option>
                    <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
                    <option value="llama3-70b-8192">Llama 3 70B</option>
                  </select>
                </div>
              </div>
            )}

            {aiProvider === 'gemini' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 uppercase block mb-1">Gemini API Key</label>
                  <input
                    type="password"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase block mb-1">Modelo Gemini</label>
                  <select
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                    className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200"
                  >
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                  </select>
                </div>
              </div>
            )}

            {aiProvider === 'openai' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 uppercase block mb-1">OpenAI API Key</label>
                  <input
                    type="password"
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    placeholder="sk-proj-..."
                    className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase block mb-1">Modelo OpenAI</label>
                  <select
                    value={openaiModel}
                    onChange={(e) => setOpenaiModel(e.target.value)}
                    className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200"
                  >
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                    <option value="gpt-4o">GPT-4o</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 uppercase block mb-1">Intervalo de Ciclo de Análise</label>
              <select
                value={intervalo}
                onChange={(e) => setIntervalo(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200"
              >
                <option value={30000}>30 segundos</option>
                <option value={60000}>60 segundos</option>
                <option value={120000}>2 minutos</option>
              </select>
            </div>

            <div className="flex items-center justify-between bg-slate-900/40 p-3 rounded border border-slate-800">
              <div>
                <div className="text-xs font-bold text-slate-200">🖼️ Analisar Visão do Gráfico</div>
                <div className="text-[10px] text-slate-500">Envia a captura do gráfico do NT8 para a IA</div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={enviarImagemIA}
                  onChange={(e) => setEnviarImagemIA(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>

          <button type="submit" className="bg-green-600 hover:bg-green-700 px-4 py-2.5 rounded text-xs font-bold w-full transition">
            💾 Salvar Configurações Gerais
          </button>
        </form>
      )}

      {/* Fontes de Dados Tab */}
      {activeTab === 'fontes' && (
        <form onSubmit={handleSaveFontes} className="space-y-6">
          <div className="bg-blue-900/10 border border-blue-700/40 p-4 rounded-lg">
            <h3 className="text-sm font-bold text-blue-300 mb-2">🗄️ Credenciais e IDs</h3>
            <p className="text-[11px] text-slate-400 mb-3">IDs padrões criados no Supabase vinculados ao seu painel.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">Instance ID (Força & Níveis)</label>
                <input
                  type="text"
                  value={instanceIdForce}
                  onChange={(e) => setInstanceIdForce(e.target.value)}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full font-mono text-slate-200"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">Símbolo Gamma (NQ, ES, etc)</label>
                <input
                  type="text"
                  value={gammaSymbol}
                  onChange={(e) => setGammaSymbol(e.target.value)}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full font-mono text-slate-200"
                />
              </div>
            </div>
          </div>

          {/* Market Data Source */}
          <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 space-y-3">
            <h3 className="text-sm font-bold text-slate-200">📊 Fonte: Market Data</h3>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="radio"
                  name="sourceMarket"
                  value="local"
                  checked={sourceMarket === 'local'}
                  onChange={() => setSourceMarket('local')}
                  className="accent-blue-500"
                />
                Local (data.json / API 8001)
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="radio"
                  name="sourceMarket"
                  value="supabase"
                  checked={sourceMarket === 'supabase'}
                  onChange={() => setSourceMarket('supabase')}
                  className="accent-blue-500"
                />
                Supabase (Nuvem)
              </label>
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase block mb-1">Instance ID (Market Data)</label>
              <input
                type="text"
                value={instanceIdMarket}
                onChange={(e) => setInstanceIdMarket(e.target.value)}
                disabled={sourceMarket === 'local'}
                className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full font-mono text-slate-200 disabled:opacity-40"
              />
            </div>
          </div>

          {/* Screenshot Source */}
          <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 space-y-3">
            <h3 className="text-sm font-bold text-slate-200">📸 Fonte: Captura de Tela (Gráfico)</h3>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="radio"
                  name="sourceScreen"
                  value="local"
                  checked={sourceScreen === 'local'}
                  onChange={() => setSourceScreen('local')}
                  className="accent-blue-500"
                />
                Local (chart.png)
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="radio"
                  name="sourceScreen"
                  value="supabase"
                  checked={sourceScreen === 'supabase'}
                  onChange={() => setSourceScreen('supabase')}
                  className="accent-blue-500"
                />
                Supabase (Nuvem)
              </label>
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase block mb-1">Instance ID (Screenshots)</label>
              <input
                type="text"
                value={instanceIdScreen}
                onChange={(e) => setInstanceIdScreen(e.target.value)}
                disabled={sourceScreen === 'local'}
                className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full font-mono text-slate-200 disabled:opacity-40"
              />
            </div>
          </div>

          <button type="submit" className="bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded text-xs font-bold w-full transition">
            💾 Salvar Fontes de Dados
          </button>
        </form>
      )}

      {/* Telegram Tab */}
      {activeTab === 'telegram' && (
        <form onSubmit={handleSaveTelegram} className="space-y-6">
          <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700">
              <div>
                <h3 className="text-sm font-bold text-slate-200">📱 Habilitar Notificações do Telegram</h3>
                <p className="text-[10px] text-slate-500">Envia alertas automáticos gerados pela IA</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={telegramEnabled}
                  onChange={(e) => setTelegramEnabled(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">🤖 Bot Token (API Key)</label>
                <input
                  type="password"
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  placeholder="123456789:ABCdef..."
                  disabled={!telegramEnabled}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full font-mono text-slate-200 disabled:opacity-40"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">📍 Channel / Chat ID</label>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="-1001234567890"
                  disabled={!telegramEnabled}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full font-mono text-slate-200 disabled:opacity-40"
                />
              </div>
            </div>

            <div className="border-t border-slate-700 pt-3 space-y-3">
              <h4 className="text-xs font-bold text-slate-300">📨 Conteúdo das Mensagens:</h4>
              
              <div className="flex items-center justify-between bg-slate-900/20 p-2.5 rounded border border-slate-800">
                <div>
                  <div className="text-xs font-bold text-slate-200">📸 Incluir captura do gráfico nas mensagens</div>
                  <div className="text-[10px] text-slate-500">Anexa imagem do gráfico do NT8 aos sinais</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={telegramSendImage}
                    onChange={(e) => setTelegramSendImage(e.target.checked)}
                    disabled={!telegramEnabled}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="flex items-center justify-between bg-slate-900/20 p-2.5 rounded border border-slate-800">
                <div>
                  <div className="text-xs font-bold text-slate-200">📤 Enviar Sinais de Operação da IA</div>
                  <div className="text-[10px] text-slate-500">Notifica entradas de COMPRA/VENDA/SAIR da IA</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={telegramSendSignal}
                    onChange={(e) => setTelegramSendSignal(e.target.checked)}
                    disabled={!telegramEnabled}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>

          <button type="submit" className="bg-green-600 hover:bg-green-700 px-4 py-2.5 rounded text-xs font-bold w-full transition">
            💾 Salvar Configurações do Telegram
          </button>
        </form>
      )}

      {/* Prompts Tab */}
      {activeTab === 'prompts' && (
        <form onSubmit={handleSavePrompts} className="space-y-6">
          <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 space-y-4">
            <h3 className="text-sm font-bold text-slate-200">🧠 Personalizar Prompt do Sistema IA</h3>
            <p className="text-[10px] text-slate-500">
              Personalize as instruções enviadas para a IA. As variáveis de mercado, forças e níveis de gamma serão inseridas automaticamente no final do prompt.
            </p>
            <div>
              <label className="text-xs text-slate-400 uppercase block mb-1">System Prompt Template</label>
              <textarea
                value={aiSystemPrompt}
                onChange={(e) => setAiSystemPrompt(e.target.value)}
                rows={12}
                placeholder="Você é um analista de trading..."
                className="bg-slate-900 border border-slate-700 p-2.5 rounded text-xs w-full font-mono text-slate-200 leading-relaxed resize-y focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <button type="submit" className="bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded text-xs font-bold w-full transition">
            💾 Salvar Prompt do Sistema
          </button>
        </form>
      )}

      {/* Alertas Tab */}
      {activeTab === 'alertas' && (
        <form onSubmit={handleSaveAlerts} className="space-y-6">
          <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 space-y-4">
            <h3 className="text-sm font-bold text-slate-200">🔔 Configuração de Alertas do Painel</h3>
            <p className="text-[10px] text-slate-500">
              Configure os limites técnicos para disparo de alertas sonoros e pop-ups no painel.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">Z-Score Mínimo (Alerta)</label>
                <input
                  type="number"
                  step="0.1"
                  value={alertZscoreMin}
                  onChange={(e) => setAlertZscoreMin(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">Z-Score Máximo (Alerta)</label>
                <input
                  type="number"
                  step="0.1"
                  value={alertZscoreMax}
                  onChange={(e) => setAlertZscoreMax(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">Delta Mínimo (Alerta)</label>
                <input
                  type="number"
                  value={alertDeltaMin}
                  onChange={(e) => setAlertDeltaMin(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">Delta Máximo (Alerta)</label>
                <input
                  type="number"
                  value={alertDeltaMax}
                  onChange={(e) => setAlertDeltaMax(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono"
                />
              </div>
            </div>

            <div className="border-t border-slate-700 pt-3 space-y-3">
              <h4 className="text-xs font-bold text-slate-300">Opções de Notificação no Navegador:</h4>
              
              <div className="flex items-center justify-between bg-slate-900/20 p-2.5 rounded border border-slate-800">
                <div>
                  <div className="text-xs font-bold text-slate-200">🔊 Tocar alerta sonoro</div>
                  <div className="text-[10px] text-slate-500">Toca áudio ao atingir os limites ou receber sinal da IA</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={alertSoundEnabled}
                    onChange={(e) => setAlertSoundEnabled(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="flex items-center justify-between bg-slate-900/20 p-2.5 rounded border border-slate-800">
                <div>
                  <div className="text-xs font-bold text-slate-200">💬 Exibir pop-up na tela (Alerta)</div>
                  <div className="text-[10px] text-slate-500">Mostra balão flutuante na tela nos momentos críticos</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={alertPopupEnabled}
                    onChange={(e) => setAlertPopupEnabled(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>

          <button type="submit" className="bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded text-xs font-bold w-full transition">
            💾 Salvar Configurações de Alertas
          </button>
        </form>
      )}
    </div>
  );
};
