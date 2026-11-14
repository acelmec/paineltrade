import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { DEFAULT_GENERAL_PROMPT_TEMPLATE } from '../services/ai';
import { speakText } from '../services/tts';
import { getStableManualStrategyId, getAccountManualStrategyId, generateAccountManualStrategyId, resolvePanelTickSize, resolvePanelPointValue } from '../services/db';
import { sanitizeTimeMask } from '../utils/date';
import { PatternMLSettings } from './PatternMLSettings';
interface SettingsProps {
  initialTab?: 'geral' | 'ia_voz' | 'recursos' | 'fontes' | 'telegram' | 'prompts' | 'noticias' | 'prompt_geral' | 'remodelagem_ml';
}

export const Settings: React.FC<SettingsProps> = ({ initialTab = 'geral' }) => {
  const { user, settings, allSettings, saveSettings, updateNews, testTelegramMessage, panels, createPanelAction, updatePanelAction, deletePanelAction, prompts, cancelAllOpenOperationsAction, accounts, activeAccount, switchAccount, refreshAccounts, panelMode, setPanelMode, userPermissions, changePassword, wsHubConnected } = useApp();
  const subscriptionId = localStorage.getItem('vortex_subscription_id');
  const [activeTab, setActiveTab] = useState<'geral' | 'ia_voz' | 'recursos' | 'fontes' | 'telegram' | 'prompts' | 'noticias' | 'paineis' | 'prompt_geral' | 'manuais' | 'remodelagem_ml'>(initialTab as any);

  const lastInitializedKeyRef = React.useRef<string>('');
  const lastInitializedGeralKeyRef = React.useRef<string>('');

  const isAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';

  // Password Change State
  const [newPasswordVal, setNewPasswordVal] = useState<string>('');
  const [confirmPasswordVal, setConfirmPasswordVal] = useState<string>('');
  const [passwordChangeMsg, setPasswordChangeMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState<boolean>(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!isAdmin && (activeTab === 'fontes' || activeTab === 'prompt_geral' || activeTab === 'paineis' || activeTab === 'remodelagem_ml')) {
      setActiveTab('geral');
    }
  }, [activeTab, isAdmin]);
  
  // Geral State
  const [aiProvider, setAiProvider] = useState<'groq' | 'gemini' | 'openai'>('groq');
  const [groqKey, setGroqKey] = useState<string>('');
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [openaiKey, setOpenaiKey] = useState<string>('');
  const [groqModel, setGroqModel] = useState<string>('');
  const [geminiModel, setGeminiModel] = useState<string>('');
  const [openaiModel, setOpenaiModel] = useState<string>('');
  const [intervalo, setIntervalo] = useState<number>(30000);
  const [marketUpdateInterval, setMarketUpdateInterval] = useState<number>(500);
  const [forceUpdateInterval, setForceUpdateInterval] = useState<number>(1500);
  const [candlesUpdateInterval, setCandlesUpdateInterval] = useState<number>(2000);
  const [screenshotUpdateInterval, setScreenshotUpdateInterval] = useState<number>(3000);
  const [generalPromptMasterEnabled, setGeneralPromptMasterEnabled] = useState<boolean>(false);
  const [enviarImagemIA, setEnviarImagemIA] = useState<boolean>(true);
  const [aiTriggerMode, setAiTriggerMode] = useState<'tempo' | 'barra' | 'noticia'>('tempo');
  const [manualPromptId, setManualPromptId] = useState<string>('');
  const [selectedPromptId, setSelectedPromptId] = useState<string>('');
  const [copilotButtonPosition, setCopilotButtonPosition] = useState<'right' | 'left'>(() => {
    return (localStorage.getItem('vortex_copilot_btn_pos') as any) || 'right';
  });

  // Síntese de Voz (Text-to-Speech / TTS) State
  const [enableTts, setEnableTts] = useState<boolean>(false);
  const [ttsProvider, setTtsProvider] = useState<'groq' | 'gemini' | 'openai' | 'browser'>('groq');
  const [ttsGroqApiKey, setTtsGroqApiKey] = useState<string>('');
  const [ttsGeminiApiKey, setTtsGeminiApiKey] = useState<string>('');
  const [ttsOpenaiApiKey, setTtsOpenaiApiKey] = useState<string>('');
  const [ttsGroqModel, setTtsGroqModel] = useState<string>('canopylabs/orpheus-v1-english');
  const [ttsGroqVoice, setTtsGroqVoice] = useState<string>('autumn');
  const [ttsGeminiModel, setTtsGeminiModel] = useState<string>('gemini-3.8-flash-lite-tts');
  const [ttsGeminiVoice, setTtsGeminiVoice] = useState<string>('Puck');
  const [ttsOpenaiModel, setTtsOpenaiModel] = useState<string>('gpt-4o-mini-tts');
  const [ttsOpenaiVoice, setTtsOpenaiVoice] = useState<string>('nova');
  const [ttsTriggerMode, setTtsTriggerMode] = useState<'critical_only' | 'all'>('critical_only');
  const [ttsCooldownSeconds, setTtsCooldownSeconds] = useState<number>(15);
  const [ttsVolume, setTtsVolume] = useState<number>(1.0);
  const [isTestingTts, setIsTestingTts] = useState<boolean>(false);

  // Admin Background Operations Worker State
  const [opsCheckIntervalMs, setOpsCheckIntervalMs] = useState<number>(2000);
  const [adminOpsTelegramEnabled, setAdminOpsTelegramEnabled] = useState<boolean>(false);
  const [adminOpsTelegramBotToken, setAdminOpsTelegramBotToken] = useState<string>('');
  const [adminOpsTelegramChatId, setAdminOpsTelegramChatId] = useState<string>('');

  // Recursos (Background Processes & Toggles) State
  const [resourceAlgorithmsEnabled, setResourceAlgorithmsEnabled] = useState<boolean>(true);
  const [resourceBgPanelsEnabled, setResourceBgPanelsEnabled] = useState<boolean>(true);
  const [resourceAudioKeepAliveEnabled, setResourceAudioKeepAliveEnabled] = useState<boolean>(true);
  const [resourceChartScreenshotsEnabled, setResourceChartScreenshotsEnabled] = useState<boolean>(true);
  const [resourceChartAlertsEnabled, setResourceChartAlertsEnabled] = useState<boolean>(true);
  const [resourceNewsEnabled, setResourceNewsEnabled] = useState<boolean>(true);
  const [resourceTelegramEnabled, setResourceTelegramEnabled] = useState<boolean>(true);
  const [resourceTtsEnabled, setResourceTtsEnabled] = useState<boolean>(true);
  const [resourceSoundBeepsEnabled, setResourceSoundBeepsEnabled] = useState<boolean>(true);

  // Fontes State
  const [instanceIdForce, setInstanceIdForce] = useState<string>('painel_principal');
  const [gammaSymbol, setGammaSymbol] = useState<string>('NQ');
  const [sourceMarket, setSourceMarket] = useState<string>('supabase');
  const [instanceIdMarket, setInstanceIdMarket] = useState<string>('nt8_main');
  const [sourceScreen, setSourceScreen] = useState<string>('supabase');
  const [instanceIdScreen, setInstanceIdScreen] = useState<string>('nt8_main');
  const [transmissionMode, setTransmissionMode] = useState<string>('polling');
  const [websocketHubUrl, setWebsocketHubUrl] = useState<string>('ws://127.0.0.1:8085/ws');

  // Telegram State
  const [telegramEnabled, setTelegramEnabled] = useState<boolean>(false);
  const [telegramBotToken, setTelegramBotToken] = useState<string>('');
  const [telegramChatId, setTelegramChatId] = useState<string>('');
  const [telegramSendImage, setTelegramSendImage] = useState<boolean>(true);
  const [telegramSendSignal, setTelegramSendSignal] = useState<boolean>(true);
  const [telegramOnlySignals, setTelegramOnlySignals] = useState<boolean>(false);

  // Prompts State
  // const [aiSystemPrompt, setAiSystemPrompt] = useState<string>('');

  // Noticias State
  const [newsAlertBefore, setNewsAlertBefore] = useState<number>(5);
  const [newsAlertAfter, setNewsAlertAfter] = useState<number>(15);
  const [newsCooldown, setNewsCooldown] = useState<number>(10);
  const [newsTelegram, setNewsTelegram] = useState<boolean>(true);
  const [newsSound, setNewsSound] = useState<boolean>(true);
  const [newsCountries, setNewsCountries] = useState<string[]>(['USD', 'EUR', 'GBP', 'JPY']);
  const [newsImpactHigh, setNewsImpactHigh] = useState<boolean>(true);
  const [newsImpactMedium, setNewsImpactMedium] = useState<boolean>(true);
  const [newsImpactLow, setNewsImpactLow] = useState<boolean>(false);
  const [newsChartMarkers, setNewsChartMarkers] = useState<boolean>(true);
  const [newsBackgroundEnabled, setNewsBackgroundEnabled] = useState<boolean>(false);

  // Prompt Geral State
  const [generalPromptEnabled, setGeneralPromptEnabled] = useState<boolean>(false);
  const [selectedPanelForPromptGeral, setSelectedPanelForPromptGeral] = useState<string>('');
  const [generalPromptFrequency, setGeneralPromptFrequency] = useState<number>(15);
  const [generalPromptStartTime, setGeneralPromptStartTime] = useState<string>('09:00');
  const [generalPromptEndTime, setGeneralPromptEndTime] = useState<string>('18:00');
  const [generalPromptTemplate, setGeneralPromptTemplate] = useState<string>('');
  const [generalPromptTelegramSendImage, setGeneralPromptTelegramSendImage] = useState<boolean>(true);
  const [generalPromptTelegramEnabled, setGeneralPromptTelegramEnabled] = useState<boolean>(true);
  const [generalPromptDays, setGeneralPromptDays] = useState<string>('all');

  // Filtros de Log do Sistema State
  const [logShowSistema, setLogShowSistema] = useState<boolean>(true);
  const [logShowAlerta, setLogShowAlerta] = useState<boolean>(true);
  const [logShowIa, setLogShowIa] = useState<boolean>(true);
  const [logShowErro, setLogShowErro] = useState<boolean>(true);
  const [logShowNoticia, setLogShowNoticia] = useState<boolean>(true);

  // Sinais Manuais State
  const [chartManualSlPoints, setChartManualSlPoints] = useState<number>(50);
  const [chartManualTpPoints, setChartManualTpPoints] = useState<number>(50);
  const [chartConfirmManualTrade, setChartConfirmManualTrade] = useState<boolean>(true);
  const [chartManualIaValidate, setChartManualIaValidate] = useState<boolean>(false);
  const [manualStrategyId, setManualStrategyId] = useState<string>('');
  const [chartManualSizingMode, setChartManualSizingMode] = useState<'lote' | 'risco'>('lote');
  const [chartManualRiskUsd, setChartManualRiskUsd] = useState<number>(250);
  const [chartHistoryDays, setChartHistoryDays] = useState<number>(7);
  const [chartColorTheme, setChartColorTheme] = useState<string>(() => {
    return settings?.chart_color_theme || localStorage.getItem('vortex_chart_theme') || 'ninja_carbon';
  });
  const [copilotTheme, setCopilotTheme] = useState<string>(() => {
    return settings?.copilot_theme || localStorage.getItem('vortex_copilot_theme') || 'ninja_black';
  });

  // Personalização Gráfica Avançada (Candles, Grade, Template Mode e Escalas)
  const [chartCandleUpColor, setChartCandleUpColor] = useState<string>(() => {
    return settings?.chart_candle_up_color || localStorage.getItem('vortex_chart_candle_up_color') || '#22c55e';
  });
  const [chartCandleDownColor, setChartCandleDownColor] = useState<string>(() => {
    return settings?.chart_candle_down_color || localStorage.getItem('vortex_chart_candle_down_color') || '#ef4444';
  });
  const [chartGridEnabled, setChartGridEnabled] = useState<boolean>(() => {
    const val = localStorage.getItem('vortex_chart_grid_enabled');
    if (val !== null) return val === 'true';
    return settings?.chart_grid_enabled !== false;
  });
  const [chartGridColor, setChartGridColor] = useState<string>(() => {
    return settings?.chart_grid_color || localStorage.getItem('vortex_chart_grid_color') || '#27272a';
  });
  const [chartTemplateMode, setChartTemplateMode] = useState<'global' | 'per_asset'>(() => {
    return (settings?.chart_template_mode as any) || (localStorage.getItem('vortex_chart_template_mode') as any) || 'global';
  });
  const [chartPriceLineVisible, setChartPriceLineVisible] = useState<boolean>(() => {
    const val = localStorage.getItem('vortex_chart_price_line_visible');
    if (val !== null) return val === 'true';
    return settings?.chart_price_line_visible !== false;
  });
  const [chartCandleBorderVisible, setChartCandleBorderVisible] = useState<boolean>(() => {
    const val = localStorage.getItem('vortex_chart_candle_border_visible');
    if (val !== null) return val === 'true';
    return settings?.chart_candle_border_visible !== false;
  });
  const [chartScaleFontSize, setChartScaleFontSize] = useState<number>(() => {
    const val = localStorage.getItem('vortex_chart_scale_font_size');
    if (val !== null) return Number(val);
    return settings?.chart_scale_font_size || 12;
  });

  // Operational limits & sessions state
  const [autoCancelOpenOpsEnabled, setAutoCancelOpenOpsEnabled] = useState<boolean>(true);
  const [autoCancelOpenOpsTime, setAutoCancelOpenOpsTime] = useState<string>('18:59:00');
  const [pauseAlertsOnStaleMarket, setPauseAlertsOnStaleMarket] = useState<boolean>(true);
  const [isCancellingAllOps, setIsCancellingAllOps] = useState<boolean>(false);

  // Global Market Session Cycle state (admin@vortex.com only)
  const [globalCycleStart, setGlobalCycleStart] = useState<string>('20:00:00');
  const [globalCycleEnd, setGlobalCycleEnd] = useState<string>('19:00:00');
  const [autoAdjustCancelTimeWithCycle, setAutoAdjustCancelTimeWithCycle] = useState<boolean>(true);
  const [isSavingCycle, setIsSavingCycle] = useState<boolean>(false);

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Painéis Manager State
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null);
  const [isAddingPanel, setIsAddingPanel] = useState<boolean>(false);
  const [panelNameInput, setPanelNameInput] = useState<string>('');
  const [panelInstanceInput, setPanelInstanceInput] = useState<string>('');
  const [panelPointValueInput, setPanelPointValueInput] = useState<string>('1.0');
  const [panelTickSizeInput, setPanelTickSizeInput] = useState<string>('0.25');
  const [panelDefaultSlInput, setPanelDefaultSlInput] = useState<string>('50');
  const [panelDefaultTpInput, setPanelDefaultTpInput] = useState<string>('50');
  const [isSavingPanel, setIsSavingPanel] = useState<boolean>(false);

  useEffect(() => {
    if (settings) {
      const currentPanelId = settings.panel_id || 'default';
      if (lastInitializedKeyRef.current === currentPanelId) {
        return;
      }
      lastInitializedKeyRef.current = currentPanelId;

      setChartColorTheme(settings.chart_color_theme || localStorage.getItem('vortex_chart_theme') || 'ninja_carbon');
      if (settings.chart_candle_up_color) setChartCandleUpColor(settings.chart_candle_up_color);
      if (settings.chart_candle_down_color) setChartCandleDownColor(settings.chart_candle_down_color);
      if (settings.chart_grid_enabled !== undefined) setChartGridEnabled(settings.chart_grid_enabled !== false);
      if (settings.chart_grid_color) setChartGridColor(settings.chart_grid_color);
      if (settings.chart_template_mode) setChartTemplateMode(settings.chart_template_mode);
      if (settings.chart_price_line_visible !== undefined) setChartPriceLineVisible(settings.chart_price_line_visible !== false);
      if (settings.chart_candle_border_visible !== undefined) setChartCandleBorderVisible(settings.chart_candle_border_visible !== false);
      if (settings.chart_scale_font_size) setChartScaleFontSize(Number(settings.chart_scale_font_size));
      setCopilotTheme(settings.copilot_theme || localStorage.getItem('vortex_copilot_theme') || 'ninja_black');
      setAiProvider(settings.ai_provider || 'groq');
      setGroqKey(settings.groq_api_key || '');
      setGeminiKey(settings.gemini_api_key || '');
      setOpenaiKey(settings.openai_api_key || '');
      setGroqModel(settings.groq_model && settings.groq_model !== 'qwen/qwen3.6-27b' ? settings.groq_model : 'qwen/qwen3.8-27b');
      setGeminiModel(settings.gemini_model || 'gemini-3.8-flash');
      setOpenaiModel(settings.openai_model || 'gpt-6-astra');
      setIntervalo(settings.intervalo || 30000);
      setMarketUpdateInterval(settings.market_update_interval !== undefined ? Number(settings.market_update_interval) : 500);
      setForceUpdateInterval(settings.force_update_interval !== undefined ? Number(settings.force_update_interval) : 1500);
      setCandlesUpdateInterval(settings.candles_update_interval !== undefined ? Number(settings.candles_update_interval) : 2000);
      setScreenshotUpdateInterval(settings.screenshot_update_interval !== undefined ? Number(settings.screenshot_update_interval) : 3000);
      setGeneralPromptMasterEnabled(settings.general_prompt_master_enabled === true);
      setEnviarImagemIA(settings.enviar_imagem_ia !== false);
      setAiTriggerMode((['tempo', 'barra', 'noticia'].includes(settings.ai_trigger_mode) ? settings.ai_trigger_mode : 'tempo') as any);
      setManualPromptId(settings.manual_prompt_id || '');
      setSelectedPromptId(settings.selected_prompt_id || '');
      if (settings.copilot_button_position) {
        setCopilotButtonPosition(settings.copilot_button_position);
      }

      setEnableTts(settings.enable_tts === true);
      setTtsProvider(settings.tts_provider || 'groq');
      setTtsGroqApiKey(settings.tts_groq_api_key || '');
      setTtsGeminiApiKey(settings.tts_gemini_api_key || '');
      setTtsOpenaiApiKey(settings.tts_openai_api_key || '');
      setTtsGroqModel(settings.tts_groq_model || 'canopylabs/orpheus-v1-english');
      setTtsGroqVoice(settings.tts_groq_voice || 'autumn');
      setTtsGeminiModel(settings.tts_gemini_model || 'gemini-3.8-flash-lite-tts');
      setTtsGeminiVoice(settings.tts_gemini_voice || 'Puck');
      setTtsOpenaiModel(settings.tts_openai_model || 'gpt-4o-mini-tts');
      setTtsOpenaiVoice(settings.tts_openai_voice || 'nova');
      setTtsTriggerMode(settings.tts_trigger_mode || 'critical_only');
      setTtsCooldownSeconds(settings.tts_cooldown_seconds !== undefined ? Number(settings.tts_cooldown_seconds) : 15);
      setTtsVolume(settings.tts_volume !== undefined ? Number(settings.tts_volume) : 1.0);

      setOpsCheckIntervalMs(settings.ops_check_interval_ms !== undefined ? Number(settings.ops_check_interval_ms) : 2000);
      setAdminOpsTelegramEnabled(settings.admin_ops_telegram_enabled === true);
      setAdminOpsTelegramBotToken(settings.admin_ops_telegram_bot_token || '');
      setAdminOpsTelegramChatId(settings.admin_ops_telegram_chat_id || '');

      setInstanceIdForce(settings.instance_id_force || 'painel_principal');
      setGammaSymbol(settings.gamma_symbol || 'NQ');
      setSourceMarket(settings.source_market || 'supabase');
      setInstanceIdMarket(settings.instance_id_market || 'nt8_main');
      setSourceScreen(settings.source_screen || 'supabase');
      setInstanceIdScreen(settings.instance_id_screen || 'nt8_main');
      setTransmissionMode(settings.transmission_mode || 'polling');
      setWebsocketHubUrl(settings.websocket_hub_url || 'ws://127.0.0.1:8080/ws');

      setTelegramEnabled(settings.telegram_enabled || false);
      setTelegramBotToken(settings.telegram_bot_token || '');
      setTelegramChatId(settings.telegram_chat_id || '');
      setTelegramSendImage(settings.telegram_send_image !== false);
      setTelegramSendSignal(settings.telegram_send_signal !== false);
      setTelegramOnlySignals(settings.telegram_only_signals || false);

      setNewsAlertBefore(settings.news_alert_before !== undefined ? Number(settings.news_alert_before) : 5);
      setNewsAlertAfter(settings.news_alert_after !== undefined ? Number(settings.news_alert_after) : 15);
      setNewsCooldown(settings.news_cooldown !== undefined ? Number(settings.news_cooldown) : 10);
      setNewsTelegram(settings.news_telegram !== false);
      setNewsSound(settings.news_sound !== false);
      setNewsCountries(settings.news_countries || ['USD', 'EUR', 'GBP', 'JPY']);
      setNewsImpactHigh(settings.news_impact_high !== false);
      setNewsImpactMedium(settings.news_impact_medium !== false);
      setNewsImpactLow(settings.news_impact_low || false);
      setNewsChartMarkers(settings.news_chart_markers !== false);
      setNewsBackgroundEnabled(settings.news_background_enabled === true);

      if (!selectedPanelForPromptGeral) {
        setGeneralPromptEnabled(settings.general_prompt_enabled || false);
        setGeneralPromptFrequency(settings.general_prompt_frequency || 15);
        setGeneralPromptStartTime(settings.general_prompt_start_time || '09:00');
        setGeneralPromptEndTime(settings.general_prompt_end_time || '18:00');
        setGeneralPromptTemplate(settings.general_prompt_template || DEFAULT_GENERAL_PROMPT_TEMPLATE);
        setGeneralPromptTelegramSendImage(settings.general_prompt_telegram_send_image !== false);
        setGeneralPromptTelegramEnabled(settings.general_prompt_telegram_enabled !== false);
        setGeneralPromptDays(settings.general_prompt_days || 'all');
      }

      setLogShowSistema(settings.log_show_sistema !== false);
      setLogShowAlerta(settings.log_show_alerta !== false);
      setLogShowIa(settings.log_show_ia !== false);
      setLogShowErro(settings.log_show_erro !== false);
      setLogShowNoticia(settings.log_show_noticia !== false);

      setChartManualSlPoints(settings.chart_manual_sl_points !== undefined ? Number(settings.chart_manual_sl_points) : 50);
      setChartManualTpPoints(settings.chart_manual_tp_points !== undefined ? Number(settings.chart_manual_tp_points) : 50);
      setChartConfirmManualTrade(settings.chart_confirm_manual_trade !== false);
      setChartManualIaValidate(settings.chart_manual_ia_validate === true);
      setManualStrategyId(getStableManualStrategyId(settings?.panel_id, settings?.manual_strategy_id));
      setChartManualSizingMode(settings.chart_manual_sizing_mode === 'risco' ? 'risco' : 'lote');
      setChartManualRiskUsd(settings.chart_manual_risk_usd !== undefined ? Number(settings.chart_manual_risk_usd) : 250);
      setChartHistoryDays(settings.chart_history_days !== undefined ? Number(settings.chart_history_days) : 7);



      setAutoCancelOpenOpsEnabled(settings.auto_cancel_open_ops_enabled === true);
      setAutoCancelOpenOpsTime(settings.auto_cancel_open_ops_time || '18:59:00');
      setPauseAlertsOnStaleMarket(settings.pause_alerts_on_stale_market !== false);
      setGlobalCycleStart(settings.global_cycle_start || '20:00:00');
      setGlobalCycleEnd(settings.global_cycle_end || '19:00:00');

      setResourceAlgorithmsEnabled(settings.resource_algorithms_enabled !== false);
      setResourceBgPanelsEnabled(settings.resource_bg_panels_enabled !== false);
      setResourceAudioKeepAliveEnabled(settings.resource_audio_keepalive_enabled !== false);
      setResourceChartScreenshotsEnabled(settings.resource_chart_screenshots_enabled !== false);
      setResourceChartAlertsEnabled(settings.resource_chart_alerts_enabled !== false);
      setResourceNewsEnabled(settings.resource_news_enabled !== false);
      setResourceTelegramEnabled(settings.resource_telegram_enabled !== false);
      setResourceTtsEnabled(settings.resource_tts_enabled !== false);
      setResourceSoundBeepsEnabled(settings.resource_sound_beeps_enabled !== false);
    }
  }, [settings?.panel_id]);

  const handleTimeMask = (value: string, setter: (val: string) => void, includeSeconds = true) => {
    setter(sanitizeTimeMask(value, includeSeconds));
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPasswordVal || newPasswordVal.length < 6) {
      setPasswordChangeMsg({ text: 'A nova senha deve conter pelo menos 6 caracteres.', type: 'error' });
      return;
    }
    if (newPasswordVal !== confirmPasswordVal) {
      setPasswordChangeMsg({ text: 'A confirmação de senha não coincide com a nova senha.', type: 'error' });
      return;
    }
    setIsChangingPassword(true);
    setPasswordChangeMsg(null);
    try {
      const res = await changePassword(newPasswordVal);
      if (res.success) {
        setPasswordChangeMsg({ text: 'Senha alterada com sucesso!', type: 'success' });
        setNewPasswordVal('');
        setConfirmPasswordVal('');
      } else {
        setPasswordChangeMsg({ text: res.message || 'Falha ao alterar senha.', type: 'error' });
      }
    } catch (err: any) {
      setPasswordChangeMsg({ text: `Erro: ${err.message || err}`, type: 'error' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSaveGeral = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      localStorage.setItem('vortex_chart_theme', chartColorTheme);
      localStorage.setItem('vortex_chart_candle_up_color', chartCandleUpColor);
      localStorage.setItem('vortex_chart_candle_down_color', chartCandleDownColor);
      localStorage.setItem('vortex_chart_grid_enabled', String(chartGridEnabled));
      localStorage.setItem('vortex_chart_grid_color', chartGridColor);
      localStorage.setItem('vortex_chart_template_mode', chartTemplateMode);
      localStorage.setItem('vortex_chart_price_line_visible', String(chartPriceLineVisible));
      localStorage.setItem('vortex_chart_candle_border_visible', String(chartCandleBorderVisible));
      localStorage.setItem('vortex_chart_scale_font_size', String(chartScaleFontSize));
      window.dispatchEvent(new CustomEvent('vortex_chart_custom_styles_changed', {
        detail: {
          candleUpColor: chartCandleUpColor,
          candleDownColor: chartCandleDownColor,
          gridEnabled: chartGridEnabled,
          gridColor: chartGridColor,
          templateMode: chartTemplateMode,
          priceLineVisible: chartPriceLineVisible,
          candleBorderVisible: chartCandleBorderVisible,
          scaleFontSize: chartScaleFontSize
        }
      }));
      window.dispatchEvent(new CustomEvent('vortex_chart_template_mode_changed', {
        detail: { templateMode: chartTemplateMode }
      }));
    } catch {}
    const success = await saveSettings({
      chart_color_theme: chartColorTheme,
      chart_candle_up_color: chartCandleUpColor,
      chart_candle_down_color: chartCandleDownColor,
      chart_grid_enabled: chartGridEnabled,
      chart_grid_color: chartGridColor,
      chart_template_mode: chartTemplateMode,
      chart_price_line_visible: chartPriceLineVisible,
      chart_candle_border_visible: chartCandleBorderVisible,
      chart_scale_font_size: Number(chartScaleFontSize),
      ai_provider: aiProvider,
      groq_api_key: groqKey,
      gemini_api_key: geminiKey,
      openai_api_key: openaiKey,
      groq_model: groqModel,
      gemini_model: geminiModel,
      openai_model: openaiModel,
      intervalo: Number(intervalo),
      market_update_interval: Number(marketUpdateInterval),
      force_update_interval: Number(forceUpdateInterval),
      candles_update_interval: Number(candlesUpdateInterval),
      screenshot_update_interval: Number(screenshotUpdateInterval),
      general_prompt_master_enabled: generalPromptMasterEnabled,
      enviar_imagem_ia: enviarImagemIA,
      ai_trigger_mode: aiTriggerMode,
      manual_prompt_id: manualPromptId || null,
      selected_prompt_id: selectedPromptId || null,
      copilot_button_position: copilotButtonPosition,
      enable_tts: enableTts,
      tts_provider: ttsProvider,
      tts_groq_api_key: ttsGroqApiKey,
      tts_gemini_api_key: ttsGeminiApiKey,
      tts_openai_api_key: ttsOpenaiApiKey,
      tts_groq_model: ttsGroqModel,
      tts_groq_voice: ttsGroqVoice,
      tts_gemini_model: ttsGeminiModel,
      tts_gemini_voice: ttsGeminiVoice,
      tts_openai_model: ttsOpenaiModel,
      tts_openai_voice: ttsOpenaiVoice,
      tts_trigger_mode: ttsTriggerMode,
      tts_cooldown_seconds: Number(ttsCooldownSeconds),
      tts_volume: Number(ttsVolume),
      ops_check_interval_ms: Number(opsCheckIntervalMs),
      admin_ops_telegram_enabled: adminOpsTelegramEnabled,
      admin_ops_telegram_bot_token: adminOpsTelegramBotToken,
      admin_ops_telegram_chat_id: adminOpsTelegramChatId,
      log_show_sistema: logShowSistema,
      log_show_alerta: logShowAlerta,
      log_show_ia: logShowIa,
      log_show_erro: logShowErro,
      log_show_noticia: logShowNoticia,
      global_cycle_start: globalCycleStart,
      global_cycle_end: globalCycleEnd
    }, 'all');
    if (success) {
      setMessage({ text: 'Configurações Gerais salvas com sucesso para todos os ativos!', type: 'success' });
    } else {
      setMessage({ text: 'Falha ao salvar configurações gerais.', type: 'error' });
    }
  };

  const handleSaveGlobalCycle = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingCycle(true);
    setMessage(null);

    const formatHHMMSS = (val: string, fallback: string) => {
      let clean = (val || '').trim();
      if (!clean) return fallback;
      const parts = clean.split(':');
      if (parts.length === 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`;
      if (parts.length === 3) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`;
      return fallback;
    };

    const finalStart = formatHHMMSS(globalCycleStart, '20:00:00');
    const finalEnd = formatHHMMSS(globalCycleEnd, '19:00:00');

    const updatePayload: Record<string, any> = {
      global_cycle_start: finalStart,
      global_cycle_end: finalEnd,
    };

    if (autoAdjustCancelTimeWithCycle) {
      const [eh, em] = finalEnd.split(':').map(Number);
      let totalMins = (eh * 60 + em) - 1;
      if (totalMins < 0) totalMins += 24 * 60;
      const newCancelH = String(Math.floor(totalMins / 60)).padStart(2, '0');
      const newCancelM = String(totalMins % 60).padStart(2, '0');
      const newCancelTime = `${newCancelH}:${newCancelM}:00`;
      updatePayload.auto_cancel_open_ops_time = newCancelTime;
      setAutoCancelOpenOpsTime(newCancelTime);
    }

    const success = await saveSettings(updatePayload, 'all');
    setIsSavingCycle(false);

    if (success) {
      setGlobalCycleStart(finalStart);
      setGlobalCycleEnd(finalEnd);
      setMessage({
        text: `Horários da Sessão Global atualizados com sucesso para todos os painéis! (Início: ${finalStart} | Fim: ${finalEnd})`,
        type: 'success'
      });
    } else {
      setMessage({ text: 'Falha ao salvar horários da sessão global.', type: 'error' });
    }
  };

  const handleSaveIaVoz = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      localStorage.setItem('vortex_copilot_theme', copilotTheme);
    } catch {}
    const success = await saveSettings({
      copilot_theme: copilotTheme,
      ai_provider: aiProvider,
      groq_api_key: groqKey,
      gemini_api_key: geminiKey,
      openai_api_key: openaiKey,
      groq_model: groqModel,
      gemini_model: geminiModel,
      openai_model: openaiModel,
      intervalo: Number(intervalo),
      enviar_imagem_ia: enviarImagemIA,
      ai_trigger_mode: aiTriggerMode,
      manual_prompt_id: manualPromptId || null,
      selected_prompt_id: selectedPromptId || null,
      copilot_button_position: copilotButtonPosition,
      enable_tts: enableTts,
      tts_provider: ttsProvider,
      tts_groq_api_key: ttsGroqApiKey,
      tts_gemini_api_key: ttsGeminiApiKey,
      tts_openai_api_key: ttsOpenaiApiKey,
      tts_groq_model: ttsGroqModel,
      tts_groq_voice: ttsGroqVoice,
      tts_gemini_model: ttsGeminiModel,
      tts_gemini_voice: ttsGeminiVoice,
      tts_openai_model: ttsOpenaiModel,
      tts_openai_voice: ttsOpenaiVoice,
      tts_trigger_mode: ttsTriggerMode,
      tts_cooldown_seconds: Number(ttsCooldownSeconds),
      tts_volume: Number(ttsVolume),
    }, 'all');
    if (success) {
      setMessage({ text: 'Configurações de IA & Voz salvas com sucesso para todos os ativos!', type: 'success' });
    } else {
      setMessage({ text: 'Falha ao salvar configurações de IA & Voz.', type: 'error' });
    }
  };

  const handleSaveRecursos = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const success = await saveSettings({
      market_update_interval: Number(marketUpdateInterval),
      force_update_interval: Number(forceUpdateInterval),
      candles_update_interval: Number(candlesUpdateInterval),
      screenshot_update_interval: Number(screenshotUpdateInterval),
      resource_algorithms_enabled: resourceAlgorithmsEnabled,
      resource_bg_panels_enabled: resourceBgPanelsEnabled,
      resource_audio_keepalive_enabled: resourceAudioKeepAliveEnabled,
      resource_chart_screenshots_enabled: resourceChartScreenshotsEnabled,
      resource_chart_alerts_enabled: resourceChartAlertsEnabled,
      resource_news_enabled: resourceNewsEnabled,
      resource_telegram_enabled: resourceTelegramEnabled,
      resource_tts_enabled: resourceTtsEnabled,
      resource_sound_beeps_enabled: resourceSoundBeepsEnabled
    }, 'all');
    if (success) {
      setMessage({ text: 'Configurações de Recursos e Desempenho salvas com sucesso para todos os ativos!', type: 'success' });
    } else {
      setMessage({ text: 'Falha ao salvar configurações de recursos.', type: 'error' });
    }
  };

  const handleCancelAllOpsNow = async () => {
    if (!window.confirm('Tem certeza que deseja cancelar TODAS as operações em andamento imediatamente?')) {
      return;
    }
    setIsCancellingAllOps(true);
    setMessage(null);
    const res = await cancelAllOpenOperationsAction();
    setIsCancellingAllOps(false);
    if (res.success) {
      setMessage({
        text: res.count > 0 
          ? `Sucesso: ${res.count} operação(ões) encerrada(s) e cancelada(s) com sucesso!` 
          : 'Nenhuma operação em andamento para cancelar no momento.',
        type: 'success'
      });
    } else {
      setMessage({ text: 'Erro ao cancelar operações em andamento.', type: 'error' });
    }
  };

  const handleSaveFontes = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const success = await saveSettings({
      transmission_mode: transmissionMode,
      websocket_hub_url: websocketHubUrl,
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
      telegram_send_signal: telegramSendSignal,
      telegram_only_signals: telegramOnlySignals
    }, 'all');
    if (success) {
      setMessage({ text: 'Configuração do Telegram salva com sucesso para todos os ativos!', type: 'success' });
    } else {
      setMessage({ text: 'Falha ao salvar configurações do Telegram.', type: 'error' });
    }
  };

  /*
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
  */

  const handleSaveNoticias = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const success = await saveSettings({
      news_alert_before: Number(newsAlertBefore),
      news_alert_after: Number(newsAlertAfter),
      news_cooldown: Number(newsCooldown),
      news_telegram: newsTelegram,
      news_sound: newsSound,
      news_countries: newsCountries,
      news_impact_high: newsImpactHigh,
      news_impact_medium: newsImpactMedium,
      news_impact_low: newsImpactLow,
      news_chart_markers: newsChartMarkers,
      news_background_enabled: newsBackgroundEnabled
    }, 'all');
    if (success) {
      setMessage({ text: 'Configurações de Notícias salvas com sucesso!', type: 'success' });
    } else {
      setMessage({ text: 'Falha ao salvar configurações de notícias.', type: 'error' });
    }
  };

  useEffect(() => {
    const currentKey = `${settings?.panel_id || 'default'}_${selectedPanelForPromptGeral || 'default'}`;
    
    if (selectedPanelForPromptGeral && allSettings && allSettings[selectedPanelForPromptGeral]) {
      if (lastInitializedGeralKeyRef.current === currentKey) {
        return;
      }
      lastInitializedGeralKeyRef.current = currentKey;
      const panelSetts = allSettings[selectedPanelForPromptGeral];
      setGeneralPromptMasterEnabled(panelSetts.general_prompt_master_enabled === true);
      setGeneralPromptEnabled(panelSetts.general_prompt_enabled || false);
      setGeneralPromptFrequency(panelSetts.general_prompt_frequency || 15);
      setGeneralPromptStartTime(panelSetts.general_prompt_start_time || '09:00');
      setGeneralPromptEndTime(panelSetts.general_prompt_end_time || '18:00');
      setGeneralPromptTemplate(panelSetts.general_prompt_template || DEFAULT_GENERAL_PROMPT_TEMPLATE);
      setGeneralPromptTelegramSendImage(panelSetts.general_prompt_telegram_send_image !== false);
      setGeneralPromptTelegramEnabled(panelSetts.general_prompt_telegram_enabled !== false);
      setGeneralPromptDays(panelSetts.general_prompt_days || 'all');
    } else if (!selectedPanelForPromptGeral && settings) {
      if (lastInitializedGeralKeyRef.current === currentKey) {
        return;
      }
      lastInitializedGeralKeyRef.current = currentKey;
      setGeneralPromptMasterEnabled(settings.general_prompt_master_enabled === true);
      setGeneralPromptEnabled(settings.general_prompt_enabled || false);
      setGeneralPromptFrequency(settings.general_prompt_frequency || 15);
      setGeneralPromptStartTime(settings.general_prompt_start_time || '09:00');
      setGeneralPromptEndTime(settings.general_prompt_end_time || '18:00');
      setGeneralPromptTemplate(settings.general_prompt_template || DEFAULT_GENERAL_PROMPT_TEMPLATE);
      setGeneralPromptTelegramSendImage(settings.general_prompt_telegram_send_image !== false);
      setGeneralPromptTelegramEnabled(settings.general_prompt_telegram_enabled !== false);
      setGeneralPromptDays(settings.general_prompt_days || 'all');
    }
  }, [selectedPanelForPromptGeral, allSettings, settings]);

  const handleSaveGeneralPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const targetPanelId = selectedPanelForPromptGeral ? selectedPanelForPromptGeral : 'all';

    const success = await saveSettings({
      general_prompt_master_enabled: generalPromptEnabled,
      general_prompt_enabled: generalPromptEnabled,
      general_prompt_frequency: Number(generalPromptFrequency),
      general_prompt_start_time: generalPromptStartTime,
      general_prompt_end_time: generalPromptEndTime,
      general_prompt_template: generalPromptTemplate,
      general_prompt_telegram_send_image: generalPromptTelegramSendImage,
      general_prompt_telegram_enabled: generalPromptTelegramEnabled,
      general_prompt_days: generalPromptDays,
      general_prompt_panel_id: selectedPanelForPromptGeral || null
    }, targetPanelId);

    if (success) {
      setMessage({
        text: targetPanelId === 'all'
          ? 'Configurações do Prompt Geral salvas com sucesso para TODOS os painéis!'
          : 'Configurações do Prompt Geral salvas com sucesso para o painel selecionado!',
        type: 'success'
      });
    } else {
      setMessage({ text: 'Falha ao salvar configurações do Prompt Geral.', type: 'error' });
    }
  };

  const handleSaveManuais = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const success = await saveSettings({
      chart_manual_sl_points: Number(chartManualSlPoints),
      chart_manual_tp_points: Number(chartManualTpPoints),
      chart_confirm_manual_trade: chartConfirmManualTrade,
      chart_manual_ia_validate: chartManualIaValidate,
      manual_strategy_id: manualStrategyId,
      chart_manual_sizing_mode: chartManualSizingMode,
      chart_manual_risk_usd: Number(chartManualRiskUsd),
      chart_history_days: Number(chartHistoryDays)
    }, 'all');
    if (success) {
      if (typeof window !== 'undefined' && settings?.panel_id) {
        try {
          localStorage.setItem(`vortex_manual_strat_id_${settings.panel_id}`, manualStrategyId);
        } catch (e) {}
      }
      setMessage({ text: 'Ajustes de Sinais Manuais salvos com sucesso para todos os ativos!', type: 'success' });
    } else {
      setMessage({ text: 'Falha ao salvar ajustes de sinais manuais.', type: 'error' });
    }
  };

  const toggleCountryFilter = (country: string) => {
    if (newsCountries.includes(country)) {
      setNewsCountries(prev => prev.filter(c => c !== country));
    } else {
      setNewsCountries(prev => [...prev, country]);
    }
  };
  return (
    <div className="glass p-6 rounded-lg max-w-4xl mx-auto my-4 border border-slate-700">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-6">
        <h2 className="text-2xl font-bold text-blue-400">⚙️ Configurações do Sistema</h2>
        {user && (
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/40 px-3 py-1.5 rounded border border-slate-700/60 w-fit self-end sm:self-auto">
            <span className="font-semibold text-slate-300">✉️ {user.email}</span>
            {subscriptionId && (
              <span className="pl-2 border-l border-slate-700 text-blue-400 font-mono">
                🔑 Assinatura: #{subscriptionId}
              </span>
            )}
          </div>
        )}
      </div>
      
      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-700 pb-2 overflow-x-auto scrollbar-hide">
        <button
          className={`alert-tab-btn ${activeTab === 'geral' ? 'active' : ''}`}
          onClick={() => { setActiveTab('geral'); setMessage(null); }}
        >
          ⚙️ Geral
        </button>
        <button
          className={`alert-tab-btn ${activeTab === 'ia_voz' ? 'active' : ''}`}
          onClick={() => { setActiveTab('ia_voz'); setMessage(null); }}
        >
          🧠 IA & Voz
        </button>
        <button
          className={`alert-tab-btn ${activeTab === 'recursos' ? 'active' : ''}`}
          onClick={() => { setActiveTab('recursos'); setMessage(null); }}
        >
          ⚡ Recursos
        </button>
        {isAdmin && (
          <button
            className={`alert-tab-btn ${activeTab === 'fontes' ? 'active' : ''}`}
            onClick={() => { setActiveTab('fontes'); setMessage(null); }}
          >
            📂 Fontes de Dados
          </button>
        )}
        <button
          className={`alert-tab-btn ${activeTab === 'telegram' ? 'active' : ''}`}
          onClick={() => { setActiveTab('telegram'); setMessage(null); }}
        >
          📱 Telegram
        </button>

        <button
          className={`alert-tab-btn ${activeTab === 'noticias' ? 'active' : ''}`}
          onClick={() => { setActiveTab('noticias'); setMessage(null); }}
        >
          📰 Notícias
        </button>
        {isAdmin && (
          <button
            className={`alert-tab-btn ${activeTab === 'prompt_geral' ? 'active' : ''}`}
            onClick={() => { setActiveTab('prompt_geral'); setMessage(null); }}
          >
            🧠 Prompt Geral
          </button>
        )}
        {isAdmin && (
          <button
            className={`alert-tab-btn ${activeTab === 'paineis' ? 'active' : ''}`}
            onClick={() => { setActiveTab('paineis'); setMessage(null); }}
          >
            📈 Painéis
          </button>
        )}
        <button
          className={`alert-tab-btn ${activeTab === 'manuais' ? 'active' : ''}`}
          onClick={() => { setActiveTab('manuais'); setMessage(null); }}
        >
          🎮 Sinais Manuais
        </button>
        {isAdmin && (
          <button
            className={`alert-tab-btn ${activeTab === 'remodelagem_ml' ? 'active' : ''}`}
            onClick={() => { setActiveTab('remodelagem_ml'); setMessage(null); }}
          >
            🤖 Remodelagem ML
          </button>
        )}
      </div>

      {message && (
        <div className={`p-3 rounded mb-4 text-xs font-bold border ${message.type === 'success' ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-red-500/50 bg-red-500/10 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* Geral Tab */}
      {activeTab === 'geral' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveGeral} className="space-y-6">
{/* Card Exclusivo do Administrador: Ciclo e Fuso Horário da Sessão Global */}
          {isAdmin && (
            <div className="bg-slate-800/80 p-5 rounded-xl border border-amber-500/50 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">🌐</span>
                  <div>
                    <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                      <span>Ciclo da Sessão de Mercado & Fuso Horário (CME / Globex)</span>
                      <span className="bg-amber-950 text-amber-300 text-[10px] px-2 py-0.5 rounded font-black border border-amber-800 tracking-wide uppercase">
                        ADMIN EXCLUSIVO
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      Configure o horário oficial de abertura e encerramento da sessão de futuros (Horário de Brasília - BRT).
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Vigência atual:</span>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-slate-900 border border-amber-500/40 text-amber-300">
                    {globalCycleStart.slice(0, 5)} → {globalCycleEnd.slice(0, 5)} BRT
                  </span>
                </div>
              </div>

              {/* Explicativo Didático do Horário de Verão */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-slate-200 leading-relaxed space-y-1">
                <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <span>ℹ️</span> Alterações do Horário de Verão Americano (Daylight Saving Time - DST):
                </div>
                <p className="text-[11px] text-slate-300">
                  Quando os Estados Unidos encerram o horário de verão (Inverno Americano), a sessão do mercado internacional avança 1 hora no horário de Brasília (abre às <strong>20:00 BRT</strong> e encerra às <strong>19:00 BRT</strong>). Quando o horário de verão americano retorna, a sessão abre às <strong>19:00 BRT</strong> e encerra às <strong>18:00 BRT</strong>.
                </p>
              </div>

              {/* Botões Rápidos / Presets */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Ajuste Rápido por Fuso Vigente
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setGlobalCycleStart('20:00:00');
                      setGlobalCycleEnd('19:00:00');
                    }}
                    className={`p-3 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                      globalCycleStart.startsWith('20:') && globalCycleEnd.startsWith('19:')
                        ? 'bg-amber-950/40 border-amber-500 text-white ring-2 ring-amber-500/50 shadow-md'
                        : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-amber-300 flex items-center gap-1.5">
                        <span>❄️</span> Horário de Inverno EUA (Padrão Atual / Sem DST)
                      </span>
                      {globalCycleStart.startsWith('20:') && globalCycleEnd.startsWith('19:') && (
                        <span className="text-[10px] text-amber-400 font-bold">✓ Selecionado</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Início: <strong>20:00:00 BRT</strong> (Dom) | Fim: <strong>19:00:00 BRT</strong> (Sex)
                    </p>
                    <div className="text-[10px] text-slate-500 mt-1">Pausa diária de manutenção: das 19:00 às 20:00 BRT.</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setGlobalCycleStart('19:00:00');
                      setGlobalCycleEnd('18:00:00');
                    }}
                    className={`p-3 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                      globalCycleStart.startsWith('19:') && globalCycleEnd.startsWith('18:')
                        ? 'bg-amber-950/40 border-amber-500 text-white ring-2 ring-amber-500/50 shadow-md'
                        : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-amber-300 flex items-center gap-1.5">
                        <span>☀️</span> Horário de Verão EUA (Com DST / Daylight Saving)
                      </span>
                      {globalCycleStart.startsWith('19:') && globalCycleEnd.startsWith('18:') && (
                        <span className="text-[10px] text-amber-400 font-bold">✓ Selecionado</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Início: <strong>19:00:00 BRT</strong> (Dom) | Fim: <strong>18:00:00 BRT</strong> (Sex)
                    </p>
                    <div className="text-[10px] text-slate-500 mt-1">Pausa diária de manutenção: das 18:00 às 19:00 BRT.</div>
                  </button>
                </div>
              </div>

              {/* Campos Customizados de Início e Fim */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-700/60">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                    Início da Sessão (Abertura Domingo / Reinício Diário)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={globalCycleStart}
                      onChange={(e) => handleTimeMask(e.target.value, setGlobalCycleStart)}
                      placeholder="20:00:00"
                      className="bg-slate-950 border border-slate-700 p-2.5 rounded text-xs w-full text-slate-100 font-mono font-bold text-center focus:outline-none focus:border-amber-500"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-500">BRT</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Ex: 20:00:00 (Inverno) ou 19:00:00 (Verão)</span>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                    Fim da Sessão (Encerramento Sexta / Pausa Diária)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={globalCycleEnd}
                      onChange={(e) => handleTimeMask(e.target.value, setGlobalCycleEnd)}
                      placeholder="19:00:00"
                      className="bg-slate-950 border border-slate-700 p-2.5 rounded text-xs w-full text-slate-100 font-mono font-bold text-center focus:outline-none focus:border-amber-500"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-500">BRT</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Ex: 19:00:00 (Inverno) ou 18:00:00 (Verão)</span>
                </div>
              </div>

              {/* Opção de sincronizar encerramento de operações abertas */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="autoAdjustCancelTimeWithCycle"
                  checked={autoAdjustCancelTimeWithCycle}
                  onChange={(e) => setAutoAdjustCancelTimeWithCycle(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-amber-600 focus:ring-amber-500 h-4 w-4"
                />
                <label htmlFor="autoAdjustCancelTimeWithCycle" className="text-xs text-slate-300 font-semibold cursor-pointer">
                  Ajustar automaticamente o encerramento de ordens para 1 minuto antes do fim da sessão (ex: {globalCycleEnd.slice(0, 2)}:59:00)
                </label>
              </div>

              {/* Botão de Salvar Ciclo */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveGlobalCycle}
                  disabled={isSavingCycle}
                  className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-black px-5 py-2.5 rounded-lg text-xs transition disabled:opacity-50 flex items-center gap-2 shadow-lg cursor-pointer"
                >
                  {isSavingCycle ? '⏳ Salvando Horários para Todos os Painéis...' : '💾 Salvar Horário da Sessão (Todos os Painéis)'}
                </button>
              </div>
            </div>
          )}

          {/* Card de Escolha de Modo do Painel (Modo 1 vs Modo 2) */}
          {(user?.email?.toLowerCase() === 'admin@vortex.com' || userPermissions?.allow_panel_mode_2 === true) && (
            <div className="bg-slate-800/60 p-4 rounded-lg border border-cyan-500/40 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-cyan-400 flex items-center gap-2">
                  <span>🖥️ Modo do Painel de Operações</span>
                  <span className="bg-cyan-950 text-cyan-300 text-[10px] px-2 py-0.5 rounded border border-cyan-800">
                    RECURSO AVANÇADO
                  </span>
                </h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Escolha o modo visual e de interação do seu painel de trading. O <strong>Modo 2 (Workstation Avançado)</strong> disponibiliza gráficos dinâmicos com múltiplos indicadores (TMA, Elliott, SMC Suite), boleta rápida e dock de ordens estilo NinjaTrader e MetaTrader 5.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setPanelMode('mode1')}
                  className={`p-3 rounded-lg border text-left transition flex flex-col justify-between ${
                    panelMode === 'mode1'
                      ? 'bg-blue-950/60 border-blue-500 text-white shadow-lg'
                      : 'bg-slate-900/60 border-slate-700/60 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm text-slate-100">Modo 1 (Standard)</span>
                      {panelMode === 'mode1' && <span className="text-xs text-blue-400 font-bold">✓ Ativo</span>}
                    </div>
                    <p className="text-xs text-slate-400">Dashboard tradicional com multi-cards, monitor de força e relatório resumido.</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPanelMode('mode2')}
                  className={`p-3 rounded-lg border text-left transition flex flex-col justify-between ${
                    panelMode === 'mode2'
                      ? 'bg-cyan-950/60 border-cyan-500 text-white shadow-lg'
                      : 'bg-slate-900/60 border-slate-700/60 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm text-cyan-300">Modo 2 (Trade Workstation)</span>
                      {panelMode === 'mode2' && <span className="text-xs text-cyan-400 font-bold">✓ Ativo</span>}
                    </div>
                    <p className="text-xs text-slate-400">Workstation profissional com motor de indicadores ilimitados, boleta rápida e dock de ordens.</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Card de Esquema de Cores do Gráfico & Workstation */}
          <div className="bg-slate-800/60 p-4 rounded-lg border border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>🎨 Esquema de Cores do Gráfico & Workstation</span>
                <span className="bg-slate-700 text-slate-300 text-[10px] px-2 py-0.5 rounded font-bold uppercase">
                  Personalização Visual
                </span>
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Personalize o fundo e o contraste do gráfico. A alteração é aplicada <strong>instantaneamente em tempo real</strong> sem necessidade de recarregar a página.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setChartColorTheme('black');
                  try {
                    localStorage.setItem('vortex_chart_theme', 'black');
                    window.dispatchEvent(new CustomEvent('vortex_chart_theme_changed', { detail: { theme: 'black' } }));
                  } catch {}
                }}
                className={`p-3 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                  chartColorTheme === 'black' || chartColorTheme === 'ninja_black'
                    ? 'bg-black border-blue-500 text-white shadow-lg ring-2 ring-blue-500'
                    : 'bg-black/60 border-zinc-800 text-slate-400 hover:border-zinc-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-zinc-100 flex items-center gap-1.5">
                      <span>⬛</span> Preto Total
                    </span>
                    {(chartColorTheme === 'black' || chartColorTheme === 'ninja_black') && <span className="text-[10px] text-blue-400 font-black">✓ Ativo</span>}
                  </div>
                  <p className="text-[11px] text-zinc-400">Gráficos e todas as demais áreas do painel em preto puro (#000000).</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChartColorTheme('slate');
                  try {
                    localStorage.setItem('vortex_chart_theme', 'slate');
                    window.dispatchEvent(new CustomEvent('vortex_chart_theme_changed', { detail: { theme: 'slate' } }));
                  } catch {}
                }}
                className={`p-3 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                  chartColorTheme === 'slate' || chartColorTheme === 'ninja_slate' || chartColorTheme === 'cinza_escuro'
                    ? 'bg-[#1a1f2c] border-cyan-500 text-white shadow-lg ring-2 ring-cyan-500'
                    : 'bg-[#1a1f2c]/60 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-slate-100 flex items-center gap-1.5">
                      <span>🔘</span> Cinza Escuro
                    </span>
                    {(chartColorTheme === 'slate' || chartColorTheme === 'ninja_slate' || chartColorTheme === 'cinza_escuro') && <span className="text-[10px] text-cyan-400 font-black">✓ Ativo</span>}
                  </div>
                  <p className="text-[11px] text-slate-400">Gráficos em preto e as demais áreas do painel em cinza escuro (#1a1f2c).</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChartColorTheme('midnight');
                  try {
                    localStorage.setItem('vortex_chart_theme', 'midnight');
                    window.dispatchEvent(new CustomEvent('vortex_chart_theme_changed', { detail: { theme: 'midnight' } }));
                  } catch {}
                }}
                className={`p-3 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                  chartColorTheme === 'midnight' || chartColorTheme === 'ninja_carbon' || chartColorTheme === 'ninja_midnight' || chartColorTheme === 'azul_noturno'
                    ? 'bg-[#070e20] border-purple-500 text-white shadow-lg ring-2 ring-purple-500'
                    : 'bg-[#070e20]/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-slate-100 flex items-center gap-1.5">
                      <span>🌌</span> Azul Noturno
                    </span>
                    {(chartColorTheme === 'midnight' || chartColorTheme === 'ninja_carbon' || chartColorTheme === 'ninja_midnight' || chartColorTheme === 'azul_noturno') && <span className="text-[10px] text-purple-400 font-black">✓ Ativo</span>}
                  </div>
                  <p className="text-[11px] text-slate-400">Gráficos em preto e as demais áreas do painel em azul noturno (#070e20).</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChartColorTheme('light');
                  try {
                    localStorage.setItem('vortex_chart_theme', 'light');
                    window.dispatchEvent(new CustomEvent('vortex_chart_theme_changed', { detail: { theme: 'light' } }));
                  } catch {}
                }}
                className={`p-3 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                  chartColorTheme === 'light' || chartColorTheme === 'ninja_light' || chartColorTheme === 'cinza_grafite'
                    ? 'bg-[#1a1f2c] border-emerald-500 text-white shadow-lg ring-2 ring-emerald-500'
                    : 'bg-[#1a1f2c]/60 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-slate-100 flex items-center gap-1.5">
                      <span>⚪</span> Cinza Grafite (Gráfico Branco)
                    </span>
                    {(chartColorTheme === 'light' || chartColorTheme === 'ninja_light' || chartColorTheme === 'cinza_grafite') && <span className="text-[10px] text-emerald-400 font-black">✓ Ativo</span>}
                  </div>
                  <p className="text-[11px] text-slate-400">Fundo branco onde tem os candles e painéis adicionais (MACD/RSI). O restante em Cinza Grafite (#1a1f2c).</p>
                </div>
              </button>
            </div>
          </div>

          {/* Card de Personalização Avançada do Gráfico de Candles (Cores, Grade, Template e Escalas) */}
          <div className="bg-slate-800/60 p-4 rounded-lg border border-slate-700 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>🕯️ Personalização do Gráfico de Candles</span>
                <span className="bg-blue-950 text-blue-300 text-[10px] px-2 py-0.5 rounded font-bold uppercase border border-blue-800">
                  Cores & Grade
                </span>
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Personalize as cores das barras de alta e baixa com paleta rápida, visibilidade e cor das linhas de grade, e o comportamento do template ao navegar entre diferentes ativos.
            </p>

            {/* A. Cores das Barras de Compra e Venda com Paleta */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/40 p-3.5 rounded-lg border border-slate-700/60">
              {/* Barra de Compra */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase">
                    <span>🟢</span> Barra de Compra (Alta)
                  </label>
                  <span className="text-[11px] font-mono font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                    {chartCandleUpColor}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={chartCandleUpColor}
                    onChange={(e) => setChartCandleUpColor(e.target.value)}
                    className="w-9 h-9 rounded cursor-pointer bg-transparent border-0"
                    title="Escolher cor personalizada"
                  />
                  <input
                    type="text"
                    value={chartCandleUpColor}
                    onChange={(e) => setChartCandleUpColor(e.target.value)}
                    className="bg-slate-950 border border-slate-700 px-2.5 py-1.5 rounded text-xs text-emerald-300 font-mono font-bold w-28 uppercase"
                  />
                </div>
                {/* Paleta Rápida de Compra */}
                <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                  <span className="text-[10px] text-slate-400 font-semibold mr-1">Paleta:</span>
                  {[
                    { label: 'Esmeralda', color: '#22c55e' },
                    { label: 'Verde Tradicional', color: '#16a34a' },
                    { label: 'Ciano', color: '#06b6d4' },
                    { label: 'Lima Neon', color: '#84cc16' },
                    { label: 'Azul Neon', color: '#38bdf8' },
                    { label: 'Branco', color: '#ffffff' }
                  ].map(p => (
                    <button
                      key={p.color}
                      type="button"
                      onClick={() => setChartCandleUpColor(p.color)}
                      style={{ backgroundColor: p.color }}
                      className={`w-5 h-5 rounded-full border transition transform hover:scale-110 ${chartCandleUpColor.toLowerCase() === p.color.toLowerCase() ? 'ring-2 ring-white border-black scale-110' : 'border-slate-600'}`}
                      title={p.label}
                    />
                  ))}
                </div>
              </div>

              {/* Barra de Venda */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-rose-400 flex items-center gap-1.5 uppercase">
                    <span>🔴</span> Barra de Venda (Baixa)
                  </label>
                  <span className="text-[11px] font-mono font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                    {chartCandleDownColor}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={chartCandleDownColor}
                    onChange={(e) => setChartCandleDownColor(e.target.value)}
                    className="w-9 h-9 rounded cursor-pointer bg-transparent border-0"
                    title="Escolher cor personalizada"
                  />
                  <input
                    type="text"
                    value={chartCandleDownColor}
                    onChange={(e) => setChartCandleDownColor(e.target.value)}
                    className="bg-slate-950 border border-slate-700 px-2.5 py-1.5 rounded text-xs text-rose-300 font-mono font-bold w-28 uppercase"
                  />
                </div>
                {/* Paleta Rápida de Venda */}
                <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                  <span className="text-[10px] text-slate-400 font-semibold mr-1">Paleta:</span>
                  {[
                    { label: 'Vermelho Coral', color: '#ef4444' },
                    { label: 'Vermelho Forte', color: '#dc2626' },
                    { label: 'Carmim Escuro', color: '#991b1b' },
                    { label: 'Laranja Fogo', color: '#f97316' },
                    { label: 'Rosa Neon', color: '#ec4899' },
                    { label: 'Roxo Púrpura', color: '#a855f7' }
                  ].map(p => (
                    <button
                      key={p.color}
                      type="button"
                      onClick={() => setChartCandleDownColor(p.color)}
                      style={{ backgroundColor: p.color }}
                      className={`w-5 h-5 rounded-full border transition transform hover:scale-110 ${chartCandleDownColor.toLowerCase() === p.color.toLowerCase() ? 'ring-2 ring-white border-black scale-110' : 'border-slate-600'}`}
                      title={p.label}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* B. Linhas de Grade do Gráfico (Grid) */}
            <div className="bg-slate-900/40 p-3.5 rounded-lg border border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <span>📐 Linhas de Grade do Gráfico</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Ative ou remova as linhas de grade verticais e horizontais que cruzam o gráfico de candles.
                  </p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={chartGridEnabled}
                    onChange={(e) => setChartGridEnabled(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              {chartGridEnabled && (
                <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-300 font-semibold">Cor da Grade:</span>
                    <input
                      type="color"
                      value={chartGridColor || '#27272a'}
                      onChange={(e) => setChartGridColor(e.target.value)}
                      className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={chartGridColor || '#27272a'}
                      onChange={(e) => setChartGridColor(e.target.value)}
                      className="bg-slate-950 border border-slate-700 px-2 py-1 rounded text-xs text-slate-200 font-mono w-24 uppercase"
                    />
                  </div>
                  {/* Presets sutis para a grade */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 font-semibold mr-1">Tons:</span>
                    {[
                      { label: 'Muito Discreto', color: '#18181b' },
                      { label: 'Discreto', color: '#27272a' },
                      { label: 'Cinza Médio', color: '#3f3f46' },
                      { label: 'Azulado Sutil', color: '#1e293b' },
                      { label: 'Azul Noite', color: '#152244' }
                    ].map(p => (
                      <button
                        key={p.color}
                        type="button"
                        onClick={() => setChartGridColor(p.color)}
                        style={{ backgroundColor: p.color }}
                        className={`w-4 h-4 rounded-full border border-slate-600 transition hover:scale-110 ${chartGridColor.toLowerCase() === p.color.toLowerCase() ? 'ring-2 ring-blue-400' : ''}`}
                        title={p.label}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* C. Comportamento do Template ao Trocar de Ativo (Item 2c) */}
            <div className="bg-slate-900/40 p-3.5 rounded-lg border border-slate-700/60 space-y-3">
              <div>
                <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <span>🔄 Comportamento do Template Gráfico ao Trocar de Ativo</span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  Defina se os indicadores e widgets configurados na tela permanecem fixos em todos os ativos ou se cada ativo mantém um template exclusivo.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setChartTemplateMode('global')}
                  className={`p-3 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${chartTemplateMode === 'global' ? 'bg-blue-950/60 border-blue-500 text-white shadow-lg ring-1 ring-blue-500' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-blue-300 flex items-center gap-1.5">
                        <span>🌐</span> Template Global Único (Intermitente)
                      </span>
                      {chartTemplateMode === 'global' && <span className="text-[10px] text-blue-400 font-black">✓ Ativo</span>}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      O template (indicadores, widgets e médias) permanece o mesmo independente da troca de ativo no seletor de mercado.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setChartTemplateMode('per_asset')}
                  className={`p-3 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${chartTemplateMode === 'per_asset' ? 'bg-cyan-950/60 border-cyan-500 text-white shadow-lg ring-1 ring-cyan-500' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-cyan-300 flex items-center gap-1.5">
                        <span>📌</span> Personalização Individual por Ativo
                      </span>
                      {chartTemplateMode === 'per_asset' && <span className="text-[10px] text-cyan-400 font-black">✓ Ativo</span>}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Cada ativo/painel memoriza e carrega seus próprios indicadores e configurações gráficas de forma independente.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* D. Outras Opções de Personalização Gráfica (Item 4) */}
            <div className="bg-slate-900/40 p-3.5 rounded-lg border border-slate-700/60 space-y-3">
              <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <span>⚙️ Ajustes Adicionais de Exibição Gráfica</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Linha do Preço Atual */}
                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded border border-slate-800">
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">Linha de Preço Atual</span>
                    <span className="text-[10px] text-slate-400">Linha horizontal no último preço</span>
                  </div>
                  <label className="toggle-switch scale-90">
                    <input
                      type="checkbox"
                      checked={chartPriceLineVisible}
                      onChange={(e) => setChartPriceLineVisible(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {/* Bordas dos Candles */}
                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded border border-slate-800">
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">Bordas dos Candles</span>
                    <span className="text-[10px] text-slate-400">Borda de contraste nos candles</span>
                  </div>
                  <label className="toggle-switch scale-90">
                    <input
                      type="checkbox"
                      checked={chartCandleBorderVisible}
                      onChange={(e) => setChartCandleBorderVisible(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {/* Tamanho da Fonte das Escalas */}
                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded border border-slate-800">
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">Fonte das Escalas</span>
                    <span className="text-[10px] text-slate-400">Tamanho texto eixos X/Y</span>
                  </div>
                  <select
                    value={chartScaleFontSize}
                    onChange={(e) => setChartScaleFontSize(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 p-1 rounded text-xs text-blue-400 font-bold outline-none"
                  >
                    <option value={10}>10 px</option>
                    <option value={11}>11 px</option>
                    <option value={12}>12 px</option>
                    <option value={13}>13 px</option>
                    <option value={14}>14 px</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 space-y-3">
              <h3 className="text-sm font-bold text-slate-300">⏱️ Intervalos de Atualização do Sistema</h3>
              <p className="text-[11px] text-slate-400">Configure a taxa de atualização dos dados em tela (em milissegundos):</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-900/30 p-3 rounded-lg border border-slate-700/50">
                <div>
                  <label className="text-[10px] text-blue-300 font-bold uppercase block mb-1">
                    Preço/Card (ms)
                  </label>
                  <input
                    type="number"
                    min={100}
                    max={60000}
                    value={marketUpdateInterval}
                    onChange={(e) => setMarketUpdateInterval(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                    placeholder="Padrão: 500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-purple-300 font-bold uppercase block mb-1">
                    Momentum/Força (ms)
                  </label>
                  <input
                    type="number"
                    min={100}
                    max={60000}
                    value={forceUpdateInterval}
                    onChange={(e) => setForceUpdateInterval(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono focus:outline-none focus:border-purple-500"
                    placeholder="Padrão: 1500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-green-300 font-bold uppercase block mb-1">
                    Candles/Gráfico (ms)
                  </label>
                  <input
                    type="number"
                    min={100}
                    max={60000}
                    value={candlesUpdateInterval}
                    onChange={(e) => setCandlesUpdateInterval(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono focus:outline-none focus:border-green-500"
                    placeholder="Padrão: 2000"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-yellow-300 font-bold uppercase block mb-1">
                    Captura Tela (ms)
                  </label>
                  <input
                    type="number"
                    min={100}
                    max={60000}
                    value={screenshotUpdateInterval}
                    onChange={(e) => setScreenshotUpdateInterval(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono focus:outline-none focus:border-yellow-500"
                    placeholder="Padrão: 3000"
                  />
                </div>
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-700/60">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">🧠 Habilitar Prompt Geral (Triangulação de IA)</h3>
                  <p className="text-[10px] text-slate-500">
                    Se desativado, o agendamento de Prompt Geral em background e sua aba correspondente serão completamente ocultados.
                  </p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={generalPromptMasterEnabled}
                    onChange={(e) => setGeneralPromptMasterEnabled(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              {/* Servidor Autônomo de Encerramento de Operações */}
              <div className="pt-2 border-t border-slate-700/60 space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2">
                    ⚡ Rotina de Servidor (Monitoramento Autônomo de Operações STOP/GAIN)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Define a frequência da rotina no servidor (`backgroundWorker.js`) que pesquisa ordens em ANDAMENTO e compara com `market_data` para encerrar no Stop ou Gain fora do navegador.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-purple-300 font-bold uppercase block mb-1">
                      Frequência da Rotina do Servidor (ms)
                    </label>
                    <input
                      type="number"
                      min={250}
                      max={60000}
                      step={250}
                      value={opsCheckIntervalMs}
                      onChange={(e) => setOpsCheckIntervalMs(Number(e.target.value))}
                      className="bg-slate-950 border border-slate-700 p-2 rounded text-xs w-full text-purple-300 font-mono focus:outline-none focus:border-purple-500"
                      placeholder="Ex: 2000 ms"
                    />
                    <span className="text-[10px] text-slate-500 block mt-1">
                      Intervalo atual: {opsCheckIntervalMs} ms ({ (opsCheckIntervalMs / 1000).toFixed(2) } seg)
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    <div>
                      <span className="text-xs font-bold text-slate-200 block">📱 Notificar Encerramentos no Telegram Admin</span>
                      <span className="text-[10px] text-slate-400">Enviar alerta exclusivo para o Telegram do Admin ao fechar ordens</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={adminOpsTelegramEnabled}
                        onChange={(e) => setAdminOpsTelegramEnabled(e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                {adminOpsTelegramEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 bg-slate-900/40 p-3 rounded-lg border border-purple-950/50">
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                        Token do Bot Telegram (Admin)
                      </label>
                      <input
                        type="text"
                        value={adminOpsTelegramBotToken}
                        onChange={(e) => setAdminOpsTelegramBotToken(e.target.value)}
                        className="bg-slate-950 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono focus:outline-none focus:border-purple-500"
                        placeholder="Caso vazio, usa o bot token padrão"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                        Chat ID do Telegram (Admin)
                      </label>
                      <input
                        type="text"
                        value={adminOpsTelegramChatId}
                        onChange={(e) => setAdminOpsTelegramChatId(e.target.value)}
                        className="bg-slate-950 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono focus:outline-none focus:border-purple-500"
                        placeholder="Chat ID do Admin"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 mb-2">📋 Filtros de Logs do Sistema</h3>
            <p className="text-[11px] text-slate-400">Selecione quais categorias de mensagens devem ser exibidas no painel de logs do sistema:</p>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="logShowSistema"
                  checked={logShowSistema}
                  onChange={(e) => setLogShowSistema(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <label htmlFor="logShowSistema" className="text-xs text-slate-300 font-semibold cursor-pointer">
                  ⚙️ Sistema
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="logShowAlerta"
                  checked={logShowAlerta}
                  onChange={(e) => setLogShowAlerta(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <label htmlFor="logShowAlerta" className="text-xs text-slate-300 font-semibold cursor-pointer">
                  ⚠️ Alertas
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="logShowIa"
                  checked={logShowIa}
                  onChange={(e) => setLogShowIa(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <label htmlFor="logShowIa" className="text-xs text-slate-300 font-semibold cursor-pointer">
                  🤖 IA
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="logShowErro"
                  checked={logShowErro}
                  onChange={(e) => setLogShowErro(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <label htmlFor="logShowErro" className="text-xs text-slate-300 font-semibold cursor-pointer">
                  ❌ Erros
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="logShowNoticia"
                  checked={logShowNoticia}
                  onChange={(e) => setLogShowNoticia(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <label htmlFor="logShowNoticia" className="text-xs text-slate-300 font-semibold cursor-pointer">
                  📰 Notícias
                </label>
              </div>
            </div>
          </div>

          <button type="submit" className="bg-green-600 hover:bg-green-700 px-4 py-2.5 rounded text-xs font-bold w-full transition">
            💾 Salvar Configurações Gerais
          </button>
        </form>

        {/* Card de Alteração de Senha de Acesso */}
        <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 space-y-4 mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
              <span>🔒 Segurança da Conta & Alteração de Senha</span>
              <span className="text-[10px] bg-slate-900 text-slate-400 px-2 py-0.5 rounded border border-slate-800">
                {user?.email}
              </span>
            </h3>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Altere a senha de acesso da sua conta. A nova senha passará a ser exigida em seus próximos logins junto com sua assinatura ativa do WordPress.
          </p>

          {passwordChangeMsg && (
            <div className={`p-3 rounded text-xs font-bold border ${
              passwordChangeMsg.type === 'success'
                ? 'border-green-500/50 bg-green-500/10 text-green-400'
                : 'border-red-500/50 bg-red-500/10 text-red-400'
            }`}>
              {passwordChangeMsg.type === 'success' ? '✅' : '⚠️'} {passwordChangeMsg.text}
            </div>
          )}

          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                  Nova Senha (mínimo 6 dígitos)
                </label>
                <input
                  type="password"
                  value={newPasswordVal}
                  onChange={(e) => setNewPasswordVal(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  required
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                  Confirmar Nova Senha
                </label>
                <input
                  type="password"
                  value={confirmPasswordVal}
                  onChange={(e) => setConfirmPasswordVal(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  required
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isChangingPassword || !newPasswordVal || !confirmPasswordVal}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded text-xs transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isChangingPassword ? 'Atualizando senha...' : '🔑 Atualizar Senha de Acesso'}
            </button>
          </form>
        </div>
        </div>
      )}

      {/* IA & Voz Tab */}
      {activeTab === 'ia_voz' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveIaVoz} className="space-y-6">
            {/* Header da Seção de IA & Voz */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-slate-700/60 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>🧠</span> Inteligência Artificial & Síntese de Voz
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure os provedores de IA (Groq, Gemini, GPT) para análise técnica e confluências, além da síntese de voz (TTS) para o Copilot.
                </p>
              </div>
            </div>

            {/* CARD 1: SELEÇÃO DO PROVEDOR E GERENCIAMENTO DAS 3 APIS */}
            <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <span>🤖</span> Provedor de IA para Análise Técnica & Copilot
                </h3>
                <span className="text-[10px] bg-purple-950 text-purple-300 px-2.5 py-0.5 rounded-full border border-purple-700 uppercase font-mono font-bold">
                  Ativo: {aiProvider}
                </span>
              </div>

              <div>
                <label className="text-xs text-slate-300 uppercase block mb-1 font-bold">
                  ⚡ Provedor Ativo para Análises & Copilot
                </label>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value as any)}
                  className="bg-slate-900 border border-purple-500/50 p-2.5 rounded-lg text-xs w-full text-purple-300 font-bold focus:outline-none focus:border-purple-400"
                >
                  <option value="groq">Groq (Llama / Qwen / DeepSeek - Ultrarrápido)</option>
                  <option value="gemini">Gemini (Google AI)</option>
                  <option value="openai">OpenAI (GPT-4o / GPT-5 / o1 / o3)</option>
                </select>
                <p className="text-[10.5px] text-slate-400 mt-1">
                  Você pode cadastrar e deixar salvas as chaves dos 3 provedores abaixo. O sistema utilizará o Provedor Ativo selecionado acima.
                </p>
              </div>

              {/* Grid com os 3 Provedores Salvos */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                {/* Provedor 1: Groq */}
                <div className={`p-3 rounded-lg border flex flex-col justify-between gap-2.5 ${
                  aiProvider === 'groq' 
                    ? 'bg-purple-950/30 border-purple-500/80 shadow-md shadow-purple-950/50 ring-1 ring-purple-500/40' 
                    : 'bg-slate-900/50 border-slate-700/60'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <span>⚡</span> Groq AI
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                      groqKey ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {groqKey ? '✓ Salva' : 'Vazia'}
                    </span>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Groq API Key</label>
                    <input
                      type="password"
                      value={groqKey}
                      onChange={(e) => setGroqKey(e.target.value)}
                      placeholder="gsk_..."
                      className="bg-slate-950 border border-slate-700 p-1.5 rounded text-xs w-full text-slate-200 font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Modelo Groq</label>
                    <select
                      value={groqModel}
                      onChange={(e) => setGroqModel(e.target.value)}
                      className="bg-slate-950 border border-slate-700 p-1.5 rounded text-xs w-full text-slate-200 focus:outline-none focus:border-purple-500"
                    >
                      <option value="qwen/qwen3.8-27b">Qwen 3.8 27B (Vision)</option>
                      <option value="openai/gpt-oss-120b">GPT OSS 120B (Texto)</option>
                      <option value="openai/gpt-oss-20b">GPT OSS 20B (Rápido)</option>
                    </select>
                  </div>
                </div>

                {/* Provedor 2: Gemini */}
                <div className={`p-3 rounded-lg border flex flex-col justify-between gap-2.5 ${
                  aiProvider === 'gemini' 
                    ? 'bg-blue-950/30 border-blue-500/80 shadow-md shadow-blue-950/50 ring-1 ring-blue-500/40' 
                    : 'bg-slate-900/50 border-slate-700/60'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <span>✨</span> Gemini AI
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                      geminiKey ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {geminiKey ? '✓ Salva' : 'Vazia'}
                    </span>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Gemini API Key</label>
                    <input
                      type="password"
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      placeholder="AIzaSy..."
                      className="bg-slate-950 border border-slate-700 p-1.5 rounded text-xs w-full text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Modelo Gemini</label>
                    <select
                      value={geminiModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      className="bg-slate-950 border border-slate-700 p-1.5 rounded text-xs w-full text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="gemini-3.8-flash">Gemini 3.8 Flash</option>
                      <option value="gemini-3.6-flash">Gemini 3.6 Flash</option>
                      <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite</option>
                      <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite</option>
                    </select>
                  </div>
                </div>

                {/* Provedor 3: OpenAI */}
                <div className={`p-3 rounded-lg border flex flex-col justify-between gap-2.5 ${
                  aiProvider === 'openai' 
                    ? 'bg-emerald-950/30 border-emerald-500/80 shadow-md shadow-emerald-950/50 ring-1 ring-emerald-500/40' 
                    : 'bg-slate-900/50 border-slate-700/60'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <span>🟢</span> OpenAI
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                      openaiKey ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {openaiKey ? '✓ Salva' : 'Vazia'}
                    </span>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">OpenAI API Key</label>
                    <input
                      type="password"
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      placeholder="sk-proj-..."
                      className="bg-slate-950 border border-slate-700 p-1.5 rounded text-xs w-full text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Modelo OpenAI</label>
                    <select
                      value={openaiModel}
                      onChange={(e) => setOpenaiModel(e.target.value)}
                      className="bg-slate-950 border border-slate-700 p-1.5 rounded text-xs w-full text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="gpt-6-astra">GPT 6 Astra (Recomendado)</option>
                      <option value="gpt-6.1-sol">GPT 6.1 Sol</option>
                      <option value="gpt-5.4">GPT 5.4</option>
                      <option value="gpt-5">GPT 5</option>
                      <option value="gpt-5-mini">GPT 5 Mini</option>
                      <option value="gpt-4o">GPT-4o (Vision)</option>
                      <option value="gpt-4o-mini">GPT-4o Mini</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-700/40 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-200 block">📸 Enviar Captura do Gráfico para IA (Vision)</span>
                  <span className="text-[10px] text-slate-400">Permite que a IA analise a imagem dos candles, suportes e resistências em tempo real</span>
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

            {/* CARD 2: PROMPT PARA ENTRADAS MANUAIS & POSIÇÃO DO CHAT */}
            <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-300 font-bold uppercase block mb-1">
                  Prompt para Entradas Manuais (Gráfico)
                </label>
                <p className="text-[11px] text-slate-400 mb-2">
                  Estratégia/Prompt utilizado para validar operações manuais abertas diretamente no gráfico ou boleta.
                </p>
                <select
                  value={manualPromptId}
                  onChange={(e) => setManualPromptId(e.target.value)}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  {isAdmin ? (
                    <option value="">-- Usar Prompt Ativo do Painel --</option>
                  ) : (
                    <option value="">-- Não Selecionado --</option>
                  )}
                  {prompts.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-bold uppercase block mb-1">
                  Posição do Botão Flutuante (Chat Copilot)
                </label>
                <p className="text-[11px] text-slate-400 mb-2">
                  Escolha o canto da tela onde o balão flutuante do Copilot IA ficará fixado.
                </p>
                <select
                  value={copilotButtonPosition}
                  onChange={(e) => {
                    const val = e.target.value as 'right' | 'left';
                    setCopilotButtonPosition(val);
                    try {
                      localStorage.setItem('vortex_copilot_btn_pos', val);
                      window.dispatchEvent(new CustomEvent('vortex_copilot_btn_pos_changed', { detail: { position: val } }));
                    } catch {}
                  }}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-cyan-300 font-bold focus:outline-none focus:border-blue-500"
                >
                  <option value="right">👉 Canto Inferior Direito (Padrão)</option>
                  <option value="left">👈 Canto Inferior Esquerdo</option>
                </select>
              </div>
            </div>

            {/* CARD: TEMA VISUAL DO COPILOT IA */}
            <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <span>🎨</span> Tema Visual do Chat Copilot IA
                </h3>
              </div>
              <p className="text-xs text-slate-300">
                Selecione o esquema de cores para a janela flutuante do Copilot. Todos os temas são 100% sólidos para evitar transparências que poluam o fundo do gráfico.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { key: 'ninja_black', icon: '⬛', name: 'Preto Total', desc: 'Preto 100% sólido e texto ultra nítido' },
                  { key: 'ninja_slate', icon: '🔘', name: 'Cinza Escuro', desc: 'Tom grafite escuro suave e elegante' },
                  { key: 'contrast_light', icon: '⚪', name: 'Cinza Grafite', desc: 'Fundo cinza médio sem preto pesado' },
                  { key: 'cyber_purple', icon: '🟣', name: 'Cyber Roxo', desc: 'Tema roxo escuro institucional' }
                ].map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setCopilotTheme(item.key);
                      try { localStorage.setItem('vortex_copilot_theme', item.key); } catch {}
                    }}
                    className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                      copilotTheme === item.key
                        ? 'bg-purple-950/70 border-purple-500 text-white shadow-md ring-1 ring-purple-500'
                        : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                        <span>{item.icon}</span> {item.name}
                      </span>
                      {copilotTheme === item.key && <span className="text-[10px] text-purple-400 font-bold">✓ Ativo</span>}
                    </div>
                    <p className="text-[10px] text-slate-400">{item.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* CARD 3: SÍNTESE DE VOZ / TEXT-TO-SPEECH (TTS) */}
            <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-700/60 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>🔊</span> Síntese de Voz do Copilot (Text-to-Speech / TTS)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Permite que o Copilot e as confluências institucionais falem em tempo real no seu fone/alto-falante.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isTestingTts}
                    onClick={async () => {
                      setIsTestingTts(true);
                      try {
                        await speakText('Axion TradeStation Copilot operacional. Mercado analisado com sucesso!', {
                          enabled: true,
                          provider: ttsProvider,
                          groqApiKey: ttsGroqApiKey || groqKey,
                          groqModel: ttsGroqModel,
                          groqVoice: ttsGroqVoice,
                          geminiApiKey: ttsGeminiApiKey || geminiKey,
                          geminiModel: ttsGeminiModel,
                          geminiVoice: ttsGeminiVoice,
                          openaiApiKey: ttsOpenaiApiKey || openaiKey,
                          openaiModel: ttsOpenaiModel,
                          openaiVoice: ttsOpenaiVoice,
                          triggerMode: 'all',
                          volume: Number(ttsVolume),
                          isCritical: true
                        });
                      } catch (e) {
                        console.error(e);
                      } finally {
                        setIsTestingTts(false);
                      }
                    }}
                    className="px-3 py-1.5 bg-purple-600/80 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
                    title="Clique para testar a voz configurada agora"
                  >
                    <span>{isTestingTts ? '⏳ Falando...' : '🔊 Testar Voz'}</span>
                  </button>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableTts}
                      onChange={(e) => setEnableTts(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    <span className="ml-2 text-xs font-bold text-slate-300">
                      {enableTts ? 'VOZ ATIVADA' : 'VOZ DESATIVADA'}
                    </span>
                  </label>
                </div>
              </div>

              {enableTts && (
                <div className="space-y-4 pt-1 animate-in fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs text-slate-400 uppercase block mb-1">Provedor de Voz (TTS / Txt para Voz)</label>
                      <select
                        value={ttsProvider}
                        onChange={(e) => setTtsProvider(e.target.value as any)}
                        className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200"
                      >
                        <option value="groq">Groq Audio Speech (Orpheus)</option>
                        <option value="gemini">Gemini Audio (Txt para Voz - gemini-3.8-flash-lite-tts)</option>
                        <option value="openai">OpenAI Audio Speech (gpt-4o-mini-tts / TTS-1)</option>
                        <option value="browser">Nativo do Navegador (Web Speech PT-BR - Grátis)</option>
                      </select>
                    </div>

                    {ttsProvider === 'groq' && (
                      <>
                        <div>
                          <label className="text-xs text-slate-400 uppercase block mb-1">Modelo Groq TTS</label>
                          <select
                            value={ttsGroqModel}
                            onChange={(e) => setTtsGroqModel(e.target.value)}
                            className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200"
                          >
                            <option value="canopylabs/orpheus-v1-english">CanopyLabs Orpheus v1 (Alta Qualidade)</option>
                            <option value="playai/play3-mini">PlayAI Play3 Mini (Rápido)</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs text-slate-400 uppercase block mb-1">Voz Groq</label>
                          <select
                            value={ttsGroqVoice}
                            onChange={(e) => setTtsGroqVoice(e.target.value)}
                            className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200"
                          >
                            <option value="autumn">Autumn (Feminina - Suave)</option>
                            <option value="daphne">Daphne (Feminina - Clara)</option>
                            <option value="orion">Orion (Masculina - Firme)</option>
                            <option value="atlas">Atlas (Masculina - Profunda)</option>
                            <option value="perseus">Perseus (Masculina - Dinâmica)</option>
                          </select>
                        </div>

                        <div className="col-span-1 md:col-span-3">
                          <label className="text-xs text-slate-400 uppercase block mb-1">
                            Groq API Key de Voz <span className="text-[10px] text-slate-500 font-normal">(Opcional: caso queira usar uma chave Groq diferente da análise técnica)</span>
                          </label>
                          <input
                            type="password"
                            value={ttsGroqApiKey}
                            onChange={(e) => setTtsGroqApiKey(e.target.value)}
                            placeholder={groqKey ? 'Usando a Groq API Key da Análise Técnica (ou informe uma chave específica)' : 'gsk_...'}
                            className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono focus:outline-none focus:border-purple-500"
                          />
                        </div>
                      </>
                    )}

                    {ttsProvider === 'gemini' && (
                      <>
                        <div>
                          <label className="text-xs text-slate-400 uppercase block mb-1">Modelo Gemini TTS (Txt para Voz)</label>
                          <select
                            value={ttsGeminiModel}
                            onChange={(e) => setTtsGeminiModel(e.target.value)}
                            className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200"
                          >
                            <option value="gemini-3.8-flash-lite-tts">gemini-3.8-flash-lite-tts (Texto para Áudio)</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs text-slate-400 uppercase block mb-1">Voz Gemini</label>
                          <select
                            value={ttsGeminiVoice}
                            onChange={(e) => setTtsGeminiVoice(e.target.value)}
                            className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200"
                          >
                            <option value="Puck">Puck (Masculina - Clara / Rápida)</option>
                            <option value="Charon">Charon (Masculina - Firme / Informativa)</option>
                            <option value="Kore">Kore (Feminina - Calma / Natural)</option>
                            <option value="Fenrir">Fenrir (Masculina - Enérgica)</option>
                            <option value="Aoede">Aoede (Feminina - Suave / Expressiva)</option>
                          </select>
                        </div>

                        <div className="col-span-1 md:col-span-3">
                          <label className="text-xs text-slate-400 uppercase block mb-1">
                            Gemini API Key de Voz <span className="text-[10px] text-slate-500 font-normal">(Permite usar a voz do Gemini mesmo que a análise técnica use Groq ou OpenAI)</span>
                          </label>
                          <input
                            type="password"
                            value={ttsGeminiApiKey}
                            onChange={(e) => setTtsGeminiApiKey(e.target.value)}
                            placeholder={geminiKey ? 'Usando a Gemini API Key da Análise Técnica (ou informe uma chave específica)' : 'AIzaSy...'}
                            className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </>
                    )}

                    {ttsProvider === 'openai' && (
                      <>
                        <div>
                          <label className="text-xs text-slate-400 uppercase block mb-1">Modelo OpenAI TTS</label>
                          <select
                            value={ttsOpenaiModel}
                            onChange={(e) => setTtsOpenaiModel(e.target.value)}
                            className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200"
                          >
                            <option value="gpt-4o-mini-tts">gpt-4o-mini-tts (Recomendado)</option>
                            <option value="tts-1">TTS-1 (Baixa Latência)</option>
                            <option value="tts-1-hd">TTS-1-HD (Alta Definição)</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs text-slate-400 uppercase block mb-1">Voz OpenAI</label>
                          <select
                            value={ttsOpenaiVoice}
                            onChange={(e) => setTtsOpenaiVoice(e.target.value)}
                            className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200"
                          >
                            <option value="nova">Nova (Feminina enérgica - Ótima em PT)</option>
                            <option value="alloy">Alloy (Neutra equilibrada)</option>
                            <option value="echo">Echo (Masculina suave)</option>
                            <option value="fable">Fable (Expressiva)</option>
                            <option value="onyx">Onyx (Masculina profunda)</option>
                            <option value="shimmer">Shimmer (Feminina clara)</option>
                          </select>
                        </div>

                        <div className="col-span-1 md:col-span-3">
                          <label className="text-xs text-slate-400 uppercase block mb-1">
                            OpenAI API Key de Voz <span className="text-[10px] text-slate-500 font-normal">(Permite usar a voz da OpenAI mesmo que a análise técnica use Groq ou Gemini)</span>
                          </label>
                          <input
                            type="password"
                            value={ttsOpenaiApiKey}
                            onChange={(e) => setTtsOpenaiApiKey(e.target.value)}
                            placeholder={openaiKey ? 'Usando a OpenAI API Key da Análise Técnica (ou informe uma chave específica)' : 'sk-proj-...'}
                            className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono focus:outline-none focus:border-purple-500"
                          />
                        </div>
                      </>
                    )}

                    {ttsProvider === 'browser' && (
                      <div className="col-span-2 flex items-center text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-800/40 p-2.5 rounded-lg">
                        <span>✓ Utiliza a voz nativa em Português do Brasil instalada no seu sistema operacional (Zero custo e resposta instantânea).</span>
                      </div>
                    )}
                  </div>

                  {/* Filtro de Esfriamento / Modo de Gatilho de Fala */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-700/40">
                    <div>
                      <label className="text-xs text-slate-400 uppercase block mb-1">
                        Filtro de Fala (Esfriamento Inteligente)
                      </label>
                      <select
                        value={ttsTriggerMode}
                        onChange={(e) => setTtsTriggerMode(e.target.value as any)}
                        className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-amber-300 font-bold cursor-pointer"
                      >
                        <option value="critical_only">🎯 Apenas Operações & Oportunidades (Recomendado)</option>
                        <option value="all">🗣️ Todas as Análises e Respostas do Chat</option>
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {ttsTriggerMode === 'critical_only'
                          ? 'Fala somente ao abrir posições, ajustar Break-Even/Trailing Stop ou encerrar operações.'
                          : 'Fala a cada ciclo e resposta recebida do Copilot.'}
                      </p>
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 uppercase block mb-1">
                        Intervalo Mínimo entre Falas (Cooldown)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="5"
                          max="120"
                          value={ttsCooldownSeconds}
                          onChange={(e) => setTtsCooldownSeconds(Number(e.target.value))}
                          className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono"
                        />
                        <span className="text-xs text-slate-400 font-bold">segundos</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 uppercase block mb-1">
                        Volume da Voz ({Math.round(ttsVolume * 100)}%)
                      </label>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={ttsVolume}
                        onChange={(e) => setTtsVolume(parseFloat(e.target.value))}
                        className="w-full mt-2 accent-purple-500 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button type="submit" className="bg-purple-600 hover:bg-purple-700 px-4 py-2.5 rounded text-xs font-bold w-full transition cursor-pointer shadow-lg">
              💾 Salvar Configurações de IA & Voz
            </button>
          </form>
        </div>
      )}

      {/* Recursos Tab */}
      {activeTab === 'recursos' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-slate-900/80 p-4 rounded-lg border border-cyan-900/40 bg-gradient-to-r from-slate-900 via-cyan-950/20 to-slate-900">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xl font-mono">
                ⚡
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  Gestão de Recursos & Processos em Segundo Plano
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ative ou desative módulos e loops autônomos para reduzir significativamente o consumo de CPU, memória e requisições de rede do navegador.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveRecursos} className="space-y-6">
            {/* Seção 0: Perfil de Desempenho & Frequência de Polling */}
            <div className="bg-slate-800/60 p-5 rounded-lg border border-slate-700 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                  🚀 Perfil de Desempenho & Taxa de Atualização (Frequência de Polling)
                </h4>
                <span className="text-[10px] text-slate-400 font-mono">Intervalo Atual: {marketUpdateInterval}ms ({marketUpdateInterval >= 1000 ? `${(marketUpdateInterval / 1000).toFixed(1)}s` : `${marketUpdateInterval}ms`})</span>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Selecione o perfil de atualização do mercado. Aumentar o intervalo reduz drasticamente o uso de CPU, memória e consumo de rede do navegador.
              </p>

              {/* Botões de Perfis Pré-Configurados */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setMarketUpdateInterval(250);
                    setForceUpdateInterval(1000);
                    setCandlesUpdateInterval(1500);
                  }}
                  className={`p-3 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between gap-1 ${
                    marketUpdateInterval <= 350
                      ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 shadow-md shadow-amber-500/10'
                      : 'bg-slate-900/60 border-slate-700/60 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">⚡ Turbo</span>
                    <span className="text-[9px] font-mono opacity-80">250ms</span>
                  </div>
                  <span className="text-[10px] text-slate-400 leading-tight">Scalping ultra-rápido (Alto consumo)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMarketUpdateInterval(500);
                    setForceUpdateInterval(1500);
                    setCandlesUpdateInterval(2000);
                  }}
                  className={`p-3 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between gap-1 ${
                    marketUpdateInterval > 350 && marketUpdateInterval <= 750
                      ? 'bg-blue-500/15 border-blue-500/60 text-blue-300 shadow-md shadow-blue-500/10'
                      : 'bg-slate-900/60 border-slate-700/60 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">⏱️ Rápido</span>
                    <span className="text-[9px] font-mono opacity-80">500ms</span>
                  </div>
                  <span className="text-[10px] text-slate-400 leading-tight">Fluidez intermediária</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMarketUpdateInterval(1000);
                    setForceUpdateInterval(2000);
                    setCandlesUpdateInterval(3000);
                  }}
                  className={`p-3 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between gap-1 ${
                    marketUpdateInterval > 750 && marketUpdateInterval <= 1500
                      ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-300 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500/30'
                      : 'bg-slate-900/60 border-slate-700/60 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">⚖️ Padrão (Recomendado)</span>
                    <span className="text-[9px] font-mono opacity-80">1.0s</span>
                  </div>
                  <span className="text-[10px] text-emerald-400/90 font-medium leading-tight">Equilibrado (Economiza 60% CPU)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMarketUpdateInterval(2500);
                    setForceUpdateInterval(3500);
                    setCandlesUpdateInterval(5000);
                  }}
                  className={`p-3 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between gap-1 ${
                    marketUpdateInterval > 1500
                      ? 'bg-teal-500/15 border-teal-500/60 text-teal-300 shadow-md shadow-teal-500/10 ring-1 ring-teal-500/30'
                      : 'bg-slate-900/60 border-slate-700/60 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">🌱 Econômico</span>
                    <span className="text-[9px] font-mono opacity-80">2.5s</span>
                  </div>
                  <span className="text-[10px] text-teal-400/90 font-medium leading-tight">Máxima economia (Economiza 85% CPU)</span>
                </button>
              </div>

              {/* Slider de Ajuste Fino */}
              <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-700/50 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-bold">Ajuste Fino da Frequência de Preço / Mercado:</span>
                  <span className="text-cyan-400 font-mono font-bold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60">
                    {marketUpdateInterval} ms {marketUpdateInterval >= 1000 ? `(${(marketUpdateInterval / 1000).toFixed(1)}s)` : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="5000"
                  step="50"
                  value={marketUpdateInterval}
                  onChange={(e) => setMarketUpdateInterval(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>100ms (Mais Rápido / Mais CPU)</span>
                  <span>1000ms (1s)</span>
                  <span>5000ms (5s / Mais Econômico)</span>
                </div>
              </div>
            </div>

            {/* Seção 1: Motores de Execução & IA */}
            <div className="bg-slate-800/60 p-5 rounded-lg border border-slate-700 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                  ⚡ 1. Motores de Execução & IA
                </h4>
                <span className="text-[10px] text-slate-400">Processamento de Lógica e Cálculos</span>
              </div>

              {/* Toggle: Algoritmos */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-700/50 hover:border-slate-600 transition-colors">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">🤖 Algoritmos Criados (Robôs & Indicadores)</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${resourceAlgorithmsEnabled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
                      {resourceAlgorithmsEnabled ? 'ATIVADO' : 'DESATIVADO'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Avalia as condições de entrada e saída de todos os algoritmos e robôs personalizados criados no construtor.
                    <br />
                    <span className="text-[10px] text-cyan-400/90 font-medium">
                      💡 Nota: Os indicadores matemáticos visuais no gráfico (Médias Móveis, VWAP, RSI, etc.) permanecem 100% ativos mesmo com este toggle desativado.
                    </span>
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={resourceAlgorithmsEnabled}
                    onChange={(e) => setResourceAlgorithmsEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>
            </div>

            {/* Seção 2: Dados de Mercado & Segundo Plano */}
            <div className="bg-slate-800/60 p-5 rounded-lg border border-slate-700 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                  🌐 2. Dados de Mercado & Segundo Plano
                </h4>
                <span className="text-[10px] text-slate-400">Comunicação e Abas em Background</span>
              </div>

              {/* Toggle: Painéis em Segundo Plano */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-700/50 hover:border-slate-600 transition-colors">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">🖥️ Processamento de Painéis em Segundo Plano (Inativos)</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${resourceBgPanelsEnabled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
                      {resourceBgPanelsEnabled ? 'TODOS OS PAINÉIS' : 'APENAS PAINEL DA TELA'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Mantém loops de atualização a cada 5s para os painéis que não estão na tela. Ao desativar, apenas o painel atualmente selecionado processa dados e consome CPU.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={resourceBgPanelsEnabled}
                    onChange={(e) => setResourceBgPanelsEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>

              {/* Toggle: Audio Keep-Alive */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-700/50 hover:border-slate-600 transition-colors">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">🔊 Blindagem de Aba em Segundo Plano (Audio Keep-Alive)</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${resourceAudioKeepAliveEnabled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
                      {resourceAudioKeepAliveEnabled ? 'BLINDAGEM ATIVA' : 'DESATIVADA'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Mantém um canal WebAudio inaudível ativo para impedir que navegadores Chromium (Chrome/Edge/Brave) congelem ou suspendam a aba quando ela for minimizada.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={resourceAudioKeepAliveEnabled}
                    onChange={(e) => setResourceAudioKeepAliveEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>

              {/* Toggle: Sincronização de Screenshots */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-700/50 hover:border-slate-600 transition-colors">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">📸 Sincronização de Screenshots do Gráfico</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${resourceChartScreenshotsEnabled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
                      {resourceChartScreenshotsEnabled ? 'SINCRONIZANDO' : 'PAUSADO'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Faz a busca periódica de imagens/prints do gráfico transmitidas pelo terminal desktop via banco de dados.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={resourceChartScreenshotsEnabled}
                    onChange={(e) => setResourceChartScreenshotsEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>
            </div>

            {/* Seção 3: Notificações, Notícias & Mídia */}
            <div className="bg-slate-800/60 p-5 rounded-lg border border-slate-700 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                  📢 3. Notificações, Notícias & Mídia
                </h4>
                <span className="text-[10px] text-slate-400">Feedback Visual, Sonoro e Integrações</span>
              </div>

              {/* Toggle: Alertas Visuais no Gráfico */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-700/50 hover:border-slate-600 transition-colors">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">📊 Alertas e Notificações Visuais no Gráfico</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${resourceChartAlertsEnabled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
                      {resourceChartAlertsEnabled ? 'POPUPS ATIVOS' : 'POPUPS OCULTOS'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Exibe popups e caixas de aviso flutuantes na tela quando um sinal de robô, nível ou notícia é acionado.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={resourceChartAlertsEnabled}
                    onChange={(e) => setResourceChartAlertsEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                </label>
              </div>

              {/* Toggle: Notícias Econômicas */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-700/50 hover:border-slate-600 transition-colors">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">📰 Notícias Econômicas & Calendário</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${resourceNewsEnabled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
                      {resourceNewsEnabled ? 'MONITORANDO' : 'DESATIVADO'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Mantém o polling de eventos econômicos e o loop de checagem a cada 5 segundos ativo no navegador.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={resourceNewsEnabled}
                    onChange={(e) => setResourceNewsEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                </label>
              </div>

              {/* Toggle: Telegram */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-700/50 hover:border-slate-600 transition-colors">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">📲 Notificações via Telegram</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${resourceTelegramEnabled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
                      {resourceTelegramEnabled ? 'ENVIO ATIVO' : 'SILENCIADO'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Transmite mensagens automáticas para bots e grupos do Telegram ao emitir sinais operacionais ou notícias.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={resourceTelegramEnabled}
                    onChange={(e) => setResourceTelegramEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                </label>
              </div>

              {/* Toggle: Síntese de Voz */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-700/50 hover:border-slate-600 transition-colors">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">🗣️ Síntese de Voz (Text-to-Speech / TTS)</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${resourceTtsEnabled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
                      {resourceTtsEnabled ? 'VOZ ATIVA' : 'DESATIVADA'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Permite a narração de voz falada de alertas críticos e respostas analíticas de IA.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={resourceTtsEnabled}
                    onChange={(e) => setResourceTtsEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                </label>
              </div>

              {/* Toggle: Alertas Sonoros (Beeps) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-700/50 hover:border-slate-600 transition-colors">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">🔔 Alertas Sonoros (Beeps)</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${resourceSoundBeepsEnabled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
                      {resourceSoundBeepsEnabled ? 'BIPES ATIVOS' : 'MUDO'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Emite bipes sonoros sintéticos pelo navegador ao disparar alertas operacionais ou notícias.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={resourceSoundBeepsEnabled}
                    onChange={(e) => setResourceSoundBeepsEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                </label>
              </div>
            </div>

            <button
              type="submit"
              className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold px-4 py-3 rounded text-xs w-full transition cursor-pointer shadow-lg flex items-center justify-center gap-2"
            >
              💾 Salvar Configurações de Recursos
            </button>
          </form>
        </div>
      )}

      {/* Fontes de Dados Tab */}
      {activeTab === 'fontes' && (
        <form onSubmit={handleSaveFontes} className="space-y-6">
          {/* Transmission Mode Switch (Posição A vs Posição B) */}
          <div className="bg-slate-800/60 p-4 rounded-lg border border-slate-700 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  ⚡ Modo de Transmissão de Dados (Chave Seletora)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Alterne entre o modelo clássico em nuvem e a conexão streaming ultra-rápida por WebSockets.
                </p>
              </div>
              <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${
                transmissionMode === 'websocket' 
                  ? (wsHubConnected ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border-amber-500/40')
                  : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  transmissionMode === 'websocket'
                    ? (wsHubConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400')
                    : 'bg-blue-400'
                }`}></span>
                {transmissionMode === 'websocket' ? (wsHubConnected ? 'Hub WS Conectado' : 'Hub WS Aguardando...') : 'Posição A (Supabase)'}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Posição A */}
              <div 
                onClick={() => setTransmissionMode('polling')}
                className={`p-3.5 rounded-lg border cursor-pointer transition flex flex-col justify-between ${
                  transmissionMode === 'polling' 
                    ? 'bg-blue-950/40 border-blue-500/80 ring-1 ring-blue-500/50' 
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <input 
                      type="radio" 
                      name="transmissionMode" 
                      checked={transmissionMode === 'polling'} 
                      onChange={() => setTransmissionMode('polling')}
                      className="accent-blue-500 cursor-pointer"
                    />
                    Posição A: Supabase Polling (Padrão)
                  </span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">Nuvem / REST</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Consulta periódica ao banco Supabase a cada intervalo configurado. Ideal para ambientes distribuídos e modo padrão.
                </p>
              </div>

              {/* Posição B */}
              <div 
                onClick={() => setTransmissionMode('websocket')}
                className={`p-3.5 rounded-lg border cursor-pointer transition flex flex-col justify-between ${
                  transmissionMode === 'websocket' 
                    ? 'bg-emerald-950/40 border-emerald-500/80 ring-1 ring-emerald-500/50' 
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                    <input 
                      type="radio" 
                      name="transmissionMode" 
                      checked={transmissionMode === 'websocket'} 
                      onChange={() => setTransmissionMode('websocket')}
                      className="accent-emerald-500 cursor-pointer"
                    />
                    Posição B: WebSocket Streaming (Hub Pro)
                  </span>
                  <span className="text-[10px] bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 px-2 py-0.5 rounded font-bold font-mono">0ms Latência</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Transmissão contínua por push via WebSocket Hub (&lt; 5ms). Sem requisições HTTP repetidas e sem travar em volatilidade.
                </p>
              </div>
            </div>

            {transmissionMode === 'websocket' && (
              <div className="pt-2 border-t border-slate-700/60">
                <label className="text-xs text-slate-300 font-semibold block mb-1">
                  URL do Servidor WebSocket Hub (Relay Local / VPS)
                </label>
                <input
                  type="text"
                  value={websocketHubUrl}
                  onChange={(e) => setWebsocketHubUrl(e.target.value)}
                  placeholder="ws://127.0.0.1:8080/ws ou wss://hub.seuservidor.com/ws"
                  className="bg-slate-950 border border-slate-700 p-2 rounded text-xs w-full font-mono text-emerald-400 focus:border-emerald-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Inicie o servidor relay na VPS executando: <code className="text-slate-300 bg-slate-900 px-1 py-0.5 rounded font-mono">npm run hub</code> ou <code className="text-slate-300 bg-slate-900 px-1 py-0.5 rounded font-mono">node server/websocket_hub.cjs</code>.
                </p>
              </div>
            )}
          </div>

          <div className="bg-blue-900/10 border border-blue-700/40 p-4 rounded-lg">
            <h3 className="text-sm font-bold text-blue-300 mb-2">🗄️ Credenciais e IDs</h3>
            <p className="text-[11px] text-slate-400 mb-3">IDs padrões criados no Supabase vinculados ao seu painel.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">Instance ID (Força & Níveis)</label>
                <input
                  type="text"
                  value={instanceIdForce}
                  onChange={(e) => setInstanceIdForce(e.target.value)}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full font-mono text-slate-200 focus:border-blue-500 focus:outline-none"
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
                className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full font-mono text-slate-200"
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
                  value="supabase"
                  checked={sourceScreen === 'supabase' || sourceScreen === 'local'}
                  onChange={() => setSourceScreen('supabase')}
                  className="accent-blue-500"
                />
                Captura NT8
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="radio"
                  name="sourceScreen"
                  value="candles"
                  checked={sourceScreen === 'candles'}
                  onChange={() => setSourceScreen('candles')}
                  className="accent-blue-500"
                />
                Dados de Mercado
              </label>
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase block mb-1">Instance ID (Screenshots / Candles)</label>
              <input
                type="text"
                value={instanceIdScreen}
                onChange={(e) => setInstanceIdScreen(e.target.value)}
                className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full font-mono text-slate-200"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    onChange={(e) => {
                      const val = e.target.checked;
                      setTelegramSendSignal(val);
                      if (val) setTelegramOnlySignals(false);
                    }}
                    disabled={!telegramEnabled}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="flex items-center justify-between bg-slate-900/20 p-2.5 rounded border border-slate-800">
                <div>
                  <div className="text-xs font-bold text-slate-200">🎯 Enviar somente sinais de COMPRA/VENDA</div>
                  <div className="text-[10px] text-slate-500">Desabilita o sinal completo da IA para enviar apenas sinais de COMPRA/VENDA</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={telegramOnlySignals}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setTelegramOnlySignals(val);
                      if (val) setTelegramSendSignal(false);
                    }}
                    disabled={!telegramEnabled}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={async () => {
                setMessage(null);
                const success = await testTelegramMessage();
                if (success) {
                  setMessage({ text: 'Mensagem de teste enviada com sucesso ao Telegram!', type: 'success' });
                } else {
                  setMessage({ text: 'Falha ao enviar mensagem de teste. Verifique se o Bot Token e Chat ID estão salvos e válidos.', type: 'error' });
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded text-xs font-bold transition flex items-center justify-center gap-1.5"
            >
              ⚡ Enviar Mensagem de Teste
            </button>
            
            <button type="submit" className="bg-green-600 hover:bg-green-700 px-4 py-2.5 rounded text-xs font-bold transition">
              💾 Salvar Configurações do Telegram
            </button>
          </div>
        </form>
      )}



      {/* Noticias Tab */}
      {activeTab === 'noticias' && (
        <form onSubmit={handleSaveNoticias} className="space-y-6">
          <div className="bg-green-900/20 border border-green-700/40 p-4 rounded-lg space-y-4">
            <h3 className="text-sm font-bold text-green-300 mb-1 flex items-center gap-1.5">
              <span>📰</span> Calendário Econômico — ForexFactory
            </h3>
            <p className="text-[11px] text-slate-400">
              Notícias econômicas carregadas do Supabase. Configure os filtros e alertas.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">🚨 Alertar ANTES da notícia (minutos)</label>
                <input
                  type="number"
                  value={newsAlertBefore}
                  onChange={(e) => setNewsAlertBefore(Number(e.target.value))}
                  min={1}
                  max={60}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono"
                />
                <div className="text-[10px] text-slate-500 mt-1">Dispara alerta X minutos antes do evento</div>
              </div>
              
              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">🚨 Alertar DEPOIS da notícia (minutos)</label>
                <input
                  type="number"
                  value={newsAlertAfter}
                  onChange={(e) => setNewsAlertAfter(Number(e.target.value))}
                  min={1}
                  max={120}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono"
                />
                <div className="text-[10px] text-slate-500 mt-1">Mantém alerta ativo por X minutos após o evento</div>
              </div>
            </div>
            
            <div>
              <label className="text-xs text-slate-400 uppercase block mb-1">💬 Cooldown entre alertas de notícias (minutos)</label>
              <input
                type="number"
                value={newsCooldown}
                onChange={(e) => setNewsCooldown(Number(e.target.value))}
                min={1}
                max={120}
                className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono"
              />
            </div>
            
            <div className="bg-slate-800/50 p-3 rounded border border-slate-700 space-y-2">
              <label className="text-xs text-slate-400 uppercase block font-semibold">🟢 Filtrar por país (Aplicado no painel)</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { code: 'USD', label: '🇺🇸 USD' },
                  { code: 'EUR', label: '🇪🇺 EUR' },
                  { code: 'GBP', label: '🇬🇧 GBP' },
                  { code: 'JPY', label: '🇯🇵 JPY' },
                  { code: 'CAD', label: '🇨🇦 CAD' },
                  { code: 'AUD', label: '🇦🇺 AUD' },
                  { code: 'CHF', label: '🇨🇭 CHF' },
                  { code: 'CNY', label: '🇨🇳 CNY' },
                  { code: 'NZD', label: '🇳🇿 NZD' },
                  { code: 'MXN', label: '🇲🇽 MXN' }
                ].map(c => (
                  <label key={c.code} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newsCountries.includes(c.code)}
                      onChange={() => toggleCountryFilter(c.code)}
                      className="accent-blue-500"
                    />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
            
            <div className="bg-slate-800/50 p-3 rounded border border-slate-700 space-y-2">
              <label className="text-xs text-slate-400 uppercase block font-semibold">💥 Filtrar por impacto</label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newsImpactHigh}
                    onChange={(e) => setNewsImpactHigh(e.target.checked)}
                    className="accent-blue-500"
                  />
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                    <strong>High</strong> (Alto impacto)
                  </span>
                </label>
                
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newsImpactMedium}
                    onChange={(e) => setNewsImpactMedium(e.target.checked)}
                    className="accent-blue-500"
                  />
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                    <strong>Medium</strong> (Médio)
                  </span>
                </label>
                
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newsImpactLow}
                    onChange={(e) => setNewsImpactLow(e.target.checked)}
                    className="accent-blue-500"
                  />
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                    <strong>Low</strong> (Baixo)
                  </span>
                </label>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isAdmin && (
                <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded border border-slate-700">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1">
                      <span>📱</span> Enviar alertas de notícias no Telegram
                    </div>
                    <div className="text-[10px] text-slate-400">Notifica quando notícia importante se aproximar</div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={newsTelegram}
                      onChange={(e) => setNewsTelegram(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              )}
              
              <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded border border-slate-700">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1">
                    <span>📊</span> Plotar marcadores de notícias no gráfico
                  </div>
                  <div className="text-[10px] text-slate-400">Exibe as linhas verticais e legendas no rodapé do CandleChart</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={newsChartMarkers}
                    onChange={(e) => setNewsChartMarkers(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded border border-slate-700">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1">
                    <span>🔊</span> Som de alerta para notícias
                  </div>
                  <div className="text-[10px] text-slate-400">Toca som quando notícia se aproximar</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={newsSound}
                    onChange={(e) => setNewsSound(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 space-y-4">
              <div className="flex items-center justify-between pb-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-200">📡 Executar Alertas de Notícias em Segundo Plano</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                    Se ativado, este painel continuará checando e disparando alertas de notícias (inclusive para o Telegram) mesmo quando estiver inativo em segundo plano.
                  </p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={newsBackgroundEnabled}
                    onChange={(e) => setNewsBackgroundEnabled(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={async () => {
                setMessage(null);
                try {
                  await updateNews();
                  setMessage({ text: 'Notícias econômicas atualizadas com sucesso!', type: 'success' });
                } catch (err) {
                  setMessage({ text: 'Erro ao buscar notícias.', type: 'error' });
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded text-xs transition flex items-center justify-center gap-1.5"
            >
              🔍 Buscar Notícias Agora
            </button>
            <button
              type="submit"
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded text-xs transition flex items-center justify-center gap-1.5"
            >
              💾 Salvar Configurações
            </button>
          </div>
        </form>
      )}

      {activeTab === 'prompt_geral' && (
        <form onSubmit={handleSaveGeneralPrompt} className="space-y-6">
          {/* Banner de Status Ativo / Desativado */}
          <div className={`p-4 rounded-lg border flex items-center justify-between transition-colors ${
            generalPromptEnabled 
              ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' 
              : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{generalPromptEnabled ? '🟢' : '🔴'}</span>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  {generalPromptEnabled ? 'Motor de Análise Omni-Engine ATIVADO' : 'Motor de Análise Omni-Engine DESATIVADO'}
                </h3>
                <p className="text-[11px] opacity-80">
                  {generalPromptEnabled 
                    ? 'A análise de Triangulação Geral de IA está rodando em segundo plano conforme a frequência configurada.' 
                    : 'Os disparos automáticos e agendamentos do Prompt Geral estão pausados.'}
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition">
              <input
                type="checkbox"
                checked={generalPromptEnabled}
                onChange={(e) => setGeneralPromptEnabled(e.target.checked)}
                className="w-4 h-4 accent-emerald-500 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-200">
                {generalPromptEnabled ? 'LIGADO' : 'DESLIGADO'}
              </span>
            </label>
          </div>

          <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-700/60 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-300">🧠 GRIXCORE OMNI-ENGINE (Triangulação de IA Geral)</h3>
                <p className="text-[10px] text-slate-400">Personalize o prompt e agendamento para o painel selecionado ou global.</p>
              </div>
              
              {/* Seletor de Painel para Prompt Geral Personalizado */}
              {panels && panels.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-400 font-mono">Painel Alvo:</label>
                  <select
                    value={selectedPanelForPromptGeral}
                    onChange={(e) => setSelectedPanelForPromptGeral(e.target.value)}
                    className="bg-slate-900 border border-slate-700 p-1.5 rounded text-xs text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">-- Todos os Painéis (Global) --</option>
                    {panels.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.instance_id})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Opções de Telegram e Imagem */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/40 p-3 rounded border border-slate-800">
              <label className="flex items-center gap-2 text-xs text-slate-300 font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="generalPromptTelegramEnabled"
                  checked={generalPromptTelegramEnabled}
                  onChange={(e) => setGeneralPromptTelegramEnabled(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <span>📱 Enviar notificações do Axion TradeStation para o Telegram</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-300 font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="generalPromptTelegramSendImage"
                  checked={generalPromptTelegramSendImage}
                  onChange={(e) => setGeneralPromptTelegramSendImage(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <span>📸 Anexar imagem do gráfico no Telegram (quando navegador estiver aberto)</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">Frequência de Análise</label>
                <select
                  value={generalPromptFrequency}
                  onChange={(e) => setGeneralPromptFrequency(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200"
                >
                  <option value={1}>1 Minuto</option>
                  <option value={5}>5 Minutos</option>
                  <option value={15}>15 Minutos</option>
                  <option value={30}>30 Minutos</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">Dias de Funcionamento</label>
                <select
                  value={generalPromptDays}
                  onChange={(e) => setGeneralPromptDays(e.target.value)}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200"
                >
                  <option value="all">Todos os dias</option>
                  <option value="mon_fri">Segunda a Sexta</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">Horário de Início (Local)</label>
                <input
                  type="text"
                  value={generalPromptStartTime}
                  onChange={(e) => handleTimeMask(e.target.value, setGeneralPromptStartTime, false)}
                  placeholder="Ex: 09:00"
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">Horário de Fim (Local)</label>
                <input
                  type="text"
                  value={generalPromptEndTime}
                  onChange={(e) => handleTimeMask(e.target.value, setGeneralPromptEndTime, false)}
                  placeholder="Ex: 18:00"
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs text-slate-400 uppercase block">Prompt Template do Motor Geral</label>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Deseja restaurar o prompt template padrão com as instruções de análise de gráfico e prevenção de entradas atrasadas?")) {
                      setGeneralPromptTemplate(DEFAULT_GENERAL_PROMPT_TEMPLATE);
                    }
                  }}
                  className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[10px] font-semibold transition"
                >
                  🔄 Restaurar Padrão
                </button>
              </div>
              <textarea
                value={generalPromptTemplate}
                onChange={(e) => setGeneralPromptTemplate(e.target.value)}
                placeholder="Insira o prompt do motor de análise geral institucional..."
                rows={15}
                className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono leading-relaxed resize-y"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={async () => {
                setMessage(null);
                const testMsg = `⚡ [TESTE AXION TRADESTATION - OMNI-ENGINE]\n` +
                  `----------------------------------------\n` +
                  `Conexão com o serviço de Telegram operando normalmente!\n` +
                  `Status: ${generalPromptEnabled ? '🟢 ATIVADO' : '🔴 DESATIVADO'}\n` +
                  `Frequência: ${generalPromptFrequency} minutos (${generalPromptDays === 'all' ? 'Todos os dias' : 'Segunda a Sexta'})\n` +
                  `Janela: ${generalPromptStartTime} às ${generalPromptEndTime}`;
                const success = await testTelegramMessage(testMsg);
                if (success) {
                  setMessage({ text: 'Notificação de teste do Prompt Geral enviada com sucesso ao Telegram!', type: 'success' });
                } else {
                  setMessage({ text: 'Falha ao enviar mensagem de teste. Verifique as credenciais do Telegram na aba Telegram.', type: 'error' });
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded text-xs transition flex items-center justify-center gap-1.5"
            >
              ⚡ Testar Envio do Telegram
            </button>

            <button type="submit" className="bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded text-xs transition flex items-center justify-center gap-1.5">
              💾 Salvar Configurações do Prompt Geral
            </button>
          </div>
        </form>
      )}

      {isAdmin && activeTab === 'paineis' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-slate-950 p-4 rounded-lg border border-slate-800">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-1.5">
                <span>📊</span> Cadastro de Painéis
              </h2>
              <p className="text-xs text-slate-400">Configure seus painéis ativos e os IDs de instâncias do Supabase.</p>
            </div>
            {!isAddingPanel && !editingPanelId && isAdmin && (
              <button
                onClick={() => {
                  setPanelNameInput('');
                  setPanelInstanceInput('');
                  setPanelPointValueInput('1.0');
                  setPanelTickSizeInput('0.25');
                  setPanelDefaultSlInput('50');
                  setPanelDefaultTpInput('50');
                  setIsAddingPanel(true);
                }}
                className="bg-blue-600 hover:bg-blue-750 text-white font-bold px-3 py-1.5 rounded text-xs transition active:scale-95"
              >
                ➕ Novo Painel
              </button>
            )}
          </div>

          {/* Form para adicionar ou editar painel */}
          {(isAddingPanel || editingPanelId) && isAdmin && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (isSavingPanel) return;
                setMessage(null);
                if (!panelNameInput.trim() || !panelInstanceInput.trim()) {
                  setMessage({ text: 'Por favor, preencha todos os campos.', type: 'error' });
                  return;
                }
                setIsSavingPanel(true);
                try {
                  const ptValue = Number(panelPointValueInput) || 1.0;
                  const tickSz = Number(panelTickSizeInput) || 0.25;
                  const defSl = Number(panelDefaultSlInput) || 50;
                  const defTp = Number(panelDefaultTpInput) || 50;
                  let success = false;
                  if (editingPanelId) {
                    success = await updatePanelAction(editingPanelId, panelNameInput, panelInstanceInput, ptValue, tickSz, defSl, defTp);
                  } else {
                    success = await createPanelAction(panelNameInput, panelInstanceInput, ptValue, tickSz, defSl, defTp);
                  }
                  if (success) {
                    setMessage({ text: editingPanelId ? 'Painel atualizado com sucesso!' : 'Novo painel cadastrado!', type: 'success' });
                    setIsAddingPanel(false);
                    setEditingPanelId(null);
                  } else {
                    setMessage({ text: 'Erro ao salvar painel.', type: 'error' });
                  }
                } finally {
                  setIsSavingPanel(false);
                }
              }}
              className="bg-slate-905 border border-slate-800 p-4 rounded-lg space-y-3"
            >
              <h3 className="text-xs uppercase font-bold text-slate-400">
                {editingPanelId ? '✏️ Editar Painel' : '➕ Novo Painel'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Nome do Ativo (Ex: NASDAQ)</label>
                  <input
                    type="text"
                    value={panelNameInput}
                    onChange={(e) => setPanelNameInput(e.target.value)}
                    placeholder="Ex: NASDAQ, GOLD, SP500"
                    className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-bold focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Instance ID (Ex: nasdaq, gold)</label>
                  <input
                    type="text"
                    value={panelInstanceInput}
                    onChange={(e) => setPanelInstanceInput(e.target.value)}
                    placeholder="Ex: nasdaq, gold, sp500"
                    className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Valor do Ponto (U$)</label>
                  <input
                    type="number"
                    step="any"
                    value={panelPointValueInput}
                    onChange={(e) => setPanelPointValueInput(e.target.value)}
                    placeholder="Ex: 20.00"
                    className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1" title="Tamanho mínimo de variação do preço (ex: 0.25 para NQ/ES, 0.10 para Ouro/Petróleo, 5.0 para WIN)">
                    Tamanho Tick (pts) ℹ️
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={panelTickSizeInput}
                    onChange={(e) => setPanelTickSizeInput(e.target.value)}
                    placeholder="Ex: 0.25"
                    className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1" title="Sugestão de Stop Loss padrão em pontos para boletas deste ativo">
                    Sugestão SL (pts) 🛡️
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={panelDefaultSlInput}
                    onChange={(e) => setPanelDefaultSlInput(e.target.value)}
                    placeholder="Ex: 50"
                    className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-rose-300 font-mono font-bold focus:outline-none focus:border-rose-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1" title="Sugestão de Take Profit padrão em pontos para boletas deste ativo">
                    Sugestão TP (pts) 🎯
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={panelDefaultTpInput}
                    onChange={(e) => setPanelDefaultTpInput(e.target.value)}
                    placeholder="Ex: 50"
                    className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-emerald-300 font-mono font-bold focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  disabled={isSavingPanel}
                  onClick={() => {
                    setIsAddingPanel(false);
                    setEditingPanelId(null);
                  }}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded text-xs font-bold transition disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingPanel}
                  className={`bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-xs font-bold transition flex items-center gap-1.5 ${isSavingPanel ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isSavingPanel ? (
                    <>
                      <span className="inline-block animate-spin">⏳</span> Salvando...
                    </>
                  ) : (
                    'Salvar Painel'
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Lista de painéis existentes */}
          <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden shadow-md">
            <div className="px-4 py-3 bg-slate-900/50 border-b border-slate-800">
              <span className="text-xs uppercase font-bold text-slate-400">Painéis Cadastrados ({panels.length})</span>
            </div>
            <div className="divide-y divide-slate-800/85 bg-slate-950">
              {panels.map((p) => {
                const resolvedTick = resolvePanelTickSize(p, settings);
                const resolvedPoint = resolvePanelPointValue(p, settings);
                const resolvedSl = (p as any).default_sl_points ?? (typeof window !== 'undefined' ? localStorage.getItem(`vortex_panel_default_sl_${p.id}`) : null) ?? 50;
                const resolvedTp = (p as any).default_tp_points ?? (typeof window !== 'undefined' ? localStorage.getItem(`vortex_panel_default_tp_${p.id}`) : null) ?? 50;
                return (
                  <div key={p.id} className="p-4 flex items-center justify-between hover:bg-slate-900/10 transition">
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <span>📈</span> {p.name}
                      </div>
                      <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5 flex-wrap">
                        <span>ID:</span> <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-blue-300 font-bold">{p.instance_id}</span>
                        <span className="text-slate-700">|</span>
                        <span>Ponto:</span> <span className="text-emerald-400 font-bold">U$ {resolvedPoint.toFixed(2)}</span>
                        <span className="text-slate-700">|</span>
                        <span>Tick:</span> <span className="text-amber-400 font-bold">{resolvedTick} pts</span>
                        <span className="text-slate-700">|</span>
                        <span>SL Sugerido:</span> <span className="text-rose-400 font-bold">{resolvedSl} pts</span>
                        <span className="text-slate-700">|</span>
                        <span>TP Sugerido:</span> <span className="text-emerald-400 font-bold">{resolvedTp} pts</span>
                        <span className="text-slate-700">|</span>
                        <span>Panel ID:</span> <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-purple-300 font-bold max-w-[120px] truncate" title={p.id}>{p.id}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(p.id);
                            alert('ID do Painel copiado!');
                          }}
                          className="text-[10.5px] hover:text-white transition cursor-pointer"
                          title="Copiar ID do Painel"
                        >
                          📋
                        </button>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingPanelId(p.id);
                            setPanelNameInput(p.name);
                            setPanelInstanceInput(p.instance_id);
                            setPanelPointValueInput(String(resolvedPoint));
                            setPanelTickSizeInput(String((p as any).tick_size ?? localStorage.getItem(`vortex_panel_tick_size_${p.id}`) ?? resolvedTick));
                            setPanelDefaultSlInput(String(resolvedSl));
                            setPanelDefaultTpInput(String(resolvedTp));
                            setIsAddingPanel(false);
                          }}
                          className="bg-blue-600/15 text-blue-400 border border-blue-600/30 hover:bg-blue-600 hover:text-white px-2.5 py-1 rounded text-xs transition"
                        >
                          Editar
                        </button>
                        {panels.length > 1 && (
                          <button
                            onClick={async () => {
                              if (window.confirm(`Tem certeza de que deseja deletar o painel "${p.name}"? Isso também excluirá permanentemente suas configurações.`)) {
                                setMessage(null);
                                const success = await deletePanelAction(p.id);
                                if (success) {
                                  setMessage({ text: `Painel "${p.name}" excluído.`, type: 'success' });
                                } else {
                                  setMessage({ text: 'Erro ao deletar painel.', type: 'error' });
                                }
                              }
                            }}
                            className="bg-red-600/15 text-red-400 border border-red-600/30 hover:bg-red-600 hover:text-white px-2.5 py-1 rounded text-xs transition"
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Sinais Manuais Tab */}
      {activeTab === 'manuais' && (
        <form onSubmit={handleSaveManuais} className="space-y-6">
          <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 space-y-4">
            <h3 className="text-sm font-bold text-slate-200">🎮 Ajustes dos Sinais Manuais</h3>
            <p className="text-[11px] text-slate-400">
              Na arquitetura multi-contas, as ordens manuais e os robôs conectados (NinjaTrader / C#) operam utilizando o <strong>ID da Conta de Negociação (Account ID)</strong>.
            </p>

            {/* Bloco IDs para Robô Conector NinjaTrader */}
            <div className="bg-slate-900/80 p-4 rounded-lg border border-blue-900/40 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-800 pb-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    💼 <span>Conta Selecionada</span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Selecione a conta para visualizar e copiar os IDs de conexão do NinjaTrader.
                  </p>
                </div>

                <select
                  value={activeAccount?.id || ''}
                  onChange={(e) => {
                    const acc = accounts.find(a => a.id === e.target.value);
                    if (acc && switchAccount) switchAccount(acc);
                  }}
                  className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded px-2.5 py-1.5 font-bold focus:outline-none cursor-pointer"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      💼 {acc.account_name} ({acc.account_type.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              {/* ID de Sinais Manuais (Somente Operações Manuais) */}
              {(() => {
                const manualStratId = getAccountManualStrategyId(activeAccount);
                return (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                        🎮 <span>ID de Sinais Manuais (Copia SOMENTE Operações Manuais)</span>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Cole este ID no parâmetro <code className="text-purple-300 bg-slate-950 px-1 py-0.5 rounded font-mono">VM_PainelId</code> do conector para copiar apenas ordens manuais desta conta.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="bg-slate-950 px-2.5 py-1 rounded border border-purple-800/60 text-purple-300 font-mono font-bold text-xs max-w-[200px] truncate shadow-inner" title={manualStratId}>
                        {manualStratId}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (manualStratId) {
                            navigator.clipboard.writeText(manualStratId);
                            alert(`ID de Sinais Manuais da conta "${activeAccount?.account_name}" copiado!\n\n(Copia SOMENTE ordens manuais no NinjaTrader)`);
                          }
                        }}
                        className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded text-xs border border-purple-400 transition flex items-center gap-1 cursor-pointer font-bold shrink-0 shadow"
                        title="Copiar ID de Sinais Manuais para o NinjaTrader"
                      >
                        🎮 Copiar ID Manual
                      </button>

                      {activeAccount && (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (window.confirm(`Deseja redefinir e gerar um NOVO ID de Sinais Manuais para a conta "${activeAccount.account_name}"?`)) {
                              const newId = await generateAccountManualStrategyId(activeAccount);
                              if (refreshAccounts) await refreshAccounts();
                              alert(`Novo ID de Sinais Manuais gerado com sucesso:\n${newId}`);
                            }
                          }}
                          className="bg-slate-900 hover:bg-slate-800 text-slate-300 px-2.5 py-1 rounded text-xs border border-slate-700 transition flex items-center gap-1 cursor-pointer font-bold shrink-0"
                          title="Gerar um novo ID exclusivo de sinais manuais para esta conta"
                        >
                          🔄 Gerar Novo ID
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/80 text-[10.5px] text-slate-300 space-y-1">
                <div className="font-bold text-amber-400 flex items-center gap-1">
                  💡 Como utilizar no NinjaTrader 8:
                </div>
                <div className="text-slate-400 leading-relaxed">
                  • <strong>ID de Sinais Manuais (🎮):</strong> Copia SOMENTE as operações MANUAIS iniciadas no gráfico ou boleta desta conta.<br />
                  • <strong>ID do Algoritmo:</strong> Copia SOMENTE as operações daquele robô/estratégia específico.<br />
                  Cole o ID escolhido no parâmetro <strong><code className="text-purple-300">VM_PainelId</code></strong> do seu robô C# no NinjaTrader.
                </div>
              </div>
            </div>

            {/* Gestão de Risco em Moeda USD */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-700/60 pt-4">
              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">Modo Padrão de Dimensionamento</label>
                <select
                  value={chartManualSizingMode}
                  onChange={(e) => setChartManualSizingMode(e.target.value as 'lote' | 'risco')}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-bold focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  <option value="lote">🔢 Lote Fixo (Qtd Contratos)</option>
                  <option value="risco">💵 Risco em Moeda ($ USD)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">Risco Padrão por Operação ($ USD)</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-xs text-slate-500 font-mono font-bold">$</span>
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    value={chartManualRiskUsd}
                    onChange={(e) => setChartManualRiskUsd(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 p-2 pl-6 rounded text-xs w-full text-slate-200 font-mono font-bold focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">Stop Loss Padrão (Pontos)</label>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={chartManualSlPoints}
                  onChange={(e) => setChartManualSlPoints(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase block mb-1">Take Profit Padrão (Pontos)</label>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={chartManualTpPoints}
                  onChange={(e) => setChartManualTpPoints(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 p-2 rounded text-xs w-full text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="border-t border-slate-700/60 pt-4 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-200">⚠️ Confirmar Autorização para Abertura de Posição</h4>
                <p className="text-[10px] text-slate-500">
                  Se ativado, exibe um diálogo de confirmação mostrando o preço de entrada, Stop Loss e Take Profit antes de efetivar a ordem.
                </p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={chartConfirmManualTrade}
                  onChange={(e) => setChartConfirmManualTrade(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="border-t border-slate-700/60 pt-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-200">🧠 Validar Entradas Manuais com Inteligência Artificial</h4>
                  <p className="text-[10px] text-slate-500">
                    Se ativado, ao clicar para abrir uma compra ou venda manual, a IA fará uma análise imediata e a operação só será executada se for aprovada pela direção correspondente.
                  </p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={chartManualIaValidate}
                    onChange={(e) => setChartManualIaValidate(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
              {chartManualIaValidate && (
                <div className="bg-blue-950/45 border border-blue-800/35 p-2 rounded text-[10px] text-blue-400 font-medium leading-relaxed">
                  ℹ️ <strong>Validação Inteligente Ativa:</strong> As operações de COMPRA ou VENDA manuais iniciadas no gráfico serão validadas pela inteligência artificial antes da execução. A ordem só prosseguirá se a análise técnica da IA confirmar a confluência.
                </div>
              )}
            </div>

            <div className="border-t border-slate-700/60 pt-4 space-y-2">
              <label className="text-xs text-slate-200 font-bold block mb-1">
                📅 Histórico de Velas do Gráfico (Dias de Análise - Painel 1 & Painel 2)
              </label>
              <p className="text-[10px] text-slate-400">
                Define a quantidade de dias de velas de 1 minuto que serão carregadas do banco de dados para a exibição nos gráficos do Painel 1 e Painel 2.
              </p>
              <select
                value={chartHistoryDays}
                onChange={(e) => setChartHistoryDays(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 p-2.5 rounded text-xs w-full text-slate-100 font-bold focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value={3}>3 Dias (~4.300 velas - Padrão Rápido)</option>
                <option value={7}>7 Dias (~10.000 velas - Recomendado)</option>
                <option value={15}>15 Dias (~21.600 velas - Histórico Extendido)</option>
                <option value={30}>30 Dias (~43.200 velas - Histórico Completo)</option>
              </select>
            </div>
          </div>

          <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 mb-1 flex items-center gap-2">
              🛑 Gestão de Encerramento e Cancelamento de Operações Abertas
            </h3>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Configure o encerramento automático de todas as operações em andamento ao atingir o horário de fechamento do mercado para evitar que permaneçam abertas após a sessão.
            </p>

            <div className="space-y-4 bg-slate-900/60 p-3.5 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-200">⏰ Ativar Encerramento Automático por Horário</h4>
                  <p className="text-[10px] text-slate-400">
                    Ao atingir o horário limite configurado, todas as ordens com status 'Em Andamento' serão canceladas automaticamente.
                  </p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={autoCancelOpenOpsEnabled}
                    onChange={(e) => setAutoCancelOpenOpsEnabled(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              {autoCancelOpenOpsEnabled && (
                <div className="pt-2 border-t border-slate-800">
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">
                    Horário Limite de Encerramento (Padrão: 17:59:00)
                  </label>
                  <input
                    type="text"
                    placeholder="17:59:00"
                    value={autoCancelOpenOpsTime}
                    onChange={(e) => handleTimeMask(e.target.value, setAutoCancelOpenOpsTime)}
                    className="bg-slate-950 border border-slate-700 p-2 rounded text-xs w-full max-w-[200px] text-slate-200 font-mono font-bold text-center"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-red-400">⚡ Ação Imediata (Cancelamento Manual)</h4>
                  <p className="text-[10px] text-slate-400">
                    Encerra e cancela imediatamente todas as posições abertas no momento em todos os painéis.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCancelAllOpsNow}
                  disabled={isCancellingAllOps}
                  className="bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold px-3.5 py-2 rounded transition flex items-center gap-1.5 shrink-0"
                >
                  {isCancellingAllOps ? '⏳ Cancelando...' : '🚨 Cancelar Todas Operações Abertas Agora'}
                </button>
              </div>
            </div>
          </div>

          {/* Pausa Automática de Alertas em Mercado Parado (15s) */}
          <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 mb-1 flex items-center gap-2">
              📡 Pausa Automática de Alertas em Mercado Parado (Sem Dados)
            </h3>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Identifica individualmente por painel quando o mercado parou de enviar cotações por mais de 15 segundos (ex: finais de semana na NASDAQ). Impede disparos repetitivos de popups por indicadores/velas estáticas do fechamento.
            </p>

            <div className="bg-slate-900/60 p-3.5 rounded-lg border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-200">⏸️ Pausar Popups e Alertas quando Mercado Parar de Receber Dados</h4>
                  <p className="text-[10px] text-slate-400">
                    Ativado por padrão (limite de 15 segundos sem sinal). Assim que novos dados retornarem ao painel, os alertas normalizam instantaneamente.
                  </p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={pauseAlertsOnStaleMarket}
                    onChange={(e) => setPauseAlertsOnStaleMarket(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              {pauseAlertsOnStaleMarket && (
                <div className="bg-blue-950/40 border border-blue-800/40 p-2.5 rounded text-[10px] text-blue-300 font-medium leading-relaxed">
                  ✅ <strong>Avaliação Per-Painel Ativa (15s):</strong> Painéis com feed estático (NASDAQ no fim de semana) paralisam popups. Painéis 24/7 (ETHUSD / Cripto) continuam com alertas 100% ativos se receberem cotações.
                </div>
              )}
            </div>
          </div>

          <button type="submit" className="bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded text-xs font-bold w-full transition">
            💾 Salvar Ajustes de Sinais Manuais
          </button>
        </form>
      )}

      {/* Remodelagem de Padrões (Machine Learning / TensorFlow) Tab (Exclusivo Admin) */}
      {isAdmin && activeTab === 'remodelagem_ml' && (
        <PatternMLSettings />
      )}
    </div>
  );
};
