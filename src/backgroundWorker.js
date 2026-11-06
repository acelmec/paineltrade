import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env manually to avoid extra dependencies
function loadEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const firstEqual = trimmed.indexOf('=');
          if (firstEqual !== -1) {
            const key = trimmed.substring(0, firstEqual).trim();
            const val = trimmed.substring(firstEqual + 1).trim();
            process.env[key] = val;
          }
        }
      });
    }
  } catch (err) {
    console.error('[WORKER ENV] Erro ao carregar variáveis de ambiente:', err);
  }
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[WORKER ERROR] Supabase URL ou Chave Anon/Service não configurada no .env!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const DEFAULT_GENERAL_PROMPT_TEMPLATE = `Você é o "Axion TradeStation", uma Inteligência Artificial especialista em análise macro de fluxo (Order Flow) e derivativos (Opções) instalada diretamente em uma mesa proprietária institucional de alta performance. Seu papel é atuar como o estrategista-chefe.

Você receberá um conjunto estruturado de métricas de mercado em tempo real. Sua tarefa é analisar a confluência desses dados para gerar um relatório analítico estruturado e, se houver clareza, formular um setup operacional claro e objetivo.

IMPORTANTE: Responda estritamente com um objeto JSON válido, sem tags markdown do tipo \`\`\`json ou qualquer texto explicativo fora do JSON. A estrutura do JSON DEVE ser exatamente a seguinte:
{
  "macro_sentiment": "Uma análise detalhada e profissional da dinâmica atual do mercado, combinando variação de preço, comportamento do Z-Score, ATR Ratio, acúmulo de Delta no fluxo e confluência institucional nos níveis de Gama.",
  "options_regime": "Descreva o regime de Opções (ex: Gamma Positivo / Short Gamma / Transição de Regime) e a volatilidade implícita indicada pelo ATR Ratio.",
  "active_walls": "Identifique quais os principais níveis de parede ou nós de volume (Call Wall, Put Wall, HVL) que estão segurando o preço no momento.",
  "magnetic_target": "Nível de preço com maior probabilidade de ser testado a seguir (ex: HVL ou confluência de suporte/resistência). Justifique brevemente.",
  "flow_pressure": "Indique a pressão dominante do fluxo institucional (ex: Forte Pressão Compradora / Absorção de Venda / Fluxo Neutro ou Indefinido).",
  "z_score": "Classifique o desvio estatístico do preço (ex: Preço Extremamente Esticado / Região de Valor Justo / Exaustão de Tendência).",
  "projection_scenario_a": "Cenário de Alta esperado caso o preço rompa ou respeite determinada região (especifique alvo e gatilho).",
  "projection_scenario_b": "Cenário de Baixa esperado caso o preço rompa ou respeite determinada região (especifique alvo e gatilho).",
  "setup_direction": "Instrução direcional para operação. DEVE ser estritamente uma destas opções: 'COMPRAR', 'VENDA' ou 'AGUARDAR'.",
  "setup_strategy": "Nome/Tipo do setup (ex: Reversão no Put Wall, Rompimento de Alta, Absorção de Exaustão). Se for AGUARDAR, coloque '--'.",
  "setup_trigger": "Preço de entrada exato ou condição de gatilho para ativar a ordem. Se for AGUARDAR, coloque '--'.",
  "setup_target_1": "Preço exato para a primeira realização parcial. Se for AGUARDAR, coloque '--'.",
  "setup_target_2": "Preço exato para o alvo final da operação. Se for AGUARDAR, coloque '--'.",
  "setup_stop": "Preço de Stop Loss exato e técnico de proteção. Se for AGUARDAR, coloque '--'.",
  "alerts": "Avisos importantes sobre volatilidade, notícias próximas ou exaustão de fluxo que exijam atenção."
}`;

function enrichSettingsWithVirtualConfigs(settingsObj) {
  if (!settingsObj) return settingsObj;
  const disabledList = settingsObj.disabled_levels || [];

  let vortex_ai_enabled = settingsObj.vortex_ai_enabled === true;
  let general_prompt_days = settingsObj.general_prompt_days || 'all';
  let general_prompt_master_enabled = settingsObj.general_prompt_master_enabled === true;
  let alert_force_telegram = settingsObj.alert_force_telegram === true;
  let general_prompt_enabled = settingsObj.general_prompt_enabled === true;
  let general_prompt_frequency = settingsObj.general_prompt_frequency !== undefined ? Number(settingsObj.general_prompt_frequency) : 15;
  let general_prompt_start_time = settingsObj.general_prompt_start_time || '09:00';
  let general_prompt_end_time = settingsObj.general_prompt_end_time || '18:00';
  let general_prompt_template = settingsObj.general_prompt_template || '';
  let general_prompt_telegram_send_image = settingsObj.general_prompt_telegram_send_image !== false;
  let general_prompt_telegram_enabled = settingsObj.general_prompt_telegram_enabled !== false;
  let general_prompt_panel_id = settingsObj.general_prompt_panel_id || '';
  let news_background_enabled = settingsObj.news_background_enabled === true;
  let telegram_enabled = settingsObj.telegram_enabled === true;
  let telegram_bot_token = settingsObj.telegram_bot_token || '';
  let telegram_chat_id = settingsObj.telegram_chat_id || '';

  let news_alert_before = settingsObj.news_alert_before !== undefined ? Number(settingsObj.news_alert_before) : 5;
  let news_alert_after = settingsObj.news_alert_after !== undefined ? Number(settingsObj.news_alert_after) : 15;
  let news_cooldown = settingsObj.news_cooldown !== undefined ? Number(settingsObj.news_cooldown) : 10;
  let news_telegram = settingsObj.news_telegram !== false;
  let news_countries = settingsObj.news_countries || ['USD', 'EUR', 'GBP', 'JPY'];
  let news_impact_high = settingsObj.news_impact_high !== false;
  let news_impact_medium = settingsObj.news_impact_medium !== false;
  let news_impact_low = settingsObj.news_impact_low || false;

  let ops_check_interval_ms = settingsObj.ops_check_interval_ms !== undefined ? Number(settingsObj.ops_check_interval_ms) : 2000;
  let admin_ops_telegram_enabled = settingsObj.admin_ops_telegram_enabled === true;
  let admin_ops_telegram_bot_token = settingsObj.admin_ops_telegram_bot_token || '';
  let admin_ops_telegram_chat_id = settingsObj.admin_ops_telegram_chat_id || '';

  disabledList.forEach(item => {
    if (typeof item === 'string' && item.startsWith('cfg:')) {
      const parts = item.split(':');
      if (parts.length >= 3) {
        const key = parts[1];
        const val = parts.slice(2).join(':');
        if (key === 'vortex_ai_enabled') vortex_ai_enabled = val === 'true';
        else if (key === 'general_prompt_days') general_prompt_days = val;
        else if (key === 'general_prompt_master_enabled') general_prompt_master_enabled = val === 'true';
        else if (key === 'general_prompt_enabled') general_prompt_enabled = val === 'true';
        else if (key === 'general_prompt_frequency') general_prompt_frequency = Number(val) || 15;
        else if (key === 'general_prompt_start_time') general_prompt_start_time = val;
        else if (key === 'general_prompt_end_time') general_prompt_end_time = val;
        else if (key === 'general_prompt_template') general_prompt_template = val;
        else if (key === 'general_prompt_telegram_send_image') general_prompt_telegram_send_image = val === 'true';
        else if (key === 'general_prompt_telegram_enabled') general_prompt_telegram_enabled = val === 'true';
        else if (key === 'general_prompt_panel_id') general_prompt_panel_id = val;
        else if (key === 'news_background_enabled') news_background_enabled = val === 'true';
        else if (key === 'telegram_enabled') telegram_enabled = val === 'true';
        else if (key === 'telegram_bot_token') telegram_bot_token = val;
        else if (key === 'telegram_chat_id') telegram_chat_id = val;
        else if (key === 'news_alert_before') news_alert_before = Number(val) || 5;
        else if (key === 'news_alert_after') news_alert_after = Number(val) || 15;
        else if (key === 'news_cooldown') news_cooldown = Number(val) || 10;
        else if (key === 'news_telegram') news_telegram = val === 'true';
        else if (key === 'news_countries') {
          try { news_countries = JSON.parse(val); } catch(e) { news_countries = val.split(','); }
        }
        else if (key === 'news_impact_high') news_impact_high = val === 'true';
        else if (key === 'news_impact_medium') news_impact_medium = val === 'true';
        else if (key === 'news_impact_low') news_impact_low = val === 'true';
        else if (key === 'ops_check_interval_ms') ops_check_interval_ms = Number(val) || 2000;
        else if (key === 'admin_ops_telegram_enabled') admin_ops_telegram_enabled = val === 'true';
        else if (key === 'admin_ops_telegram_bot_token') admin_ops_telegram_bot_token = val;
        else if (key === 'admin_ops_telegram_chat_id') admin_ops_telegram_chat_id = val;
        else if (key === 'resource_algorithms_enabled') settingsObj.resource_algorithms_enabled = val !== 'false';
        else if (key === 'resource_news_enabled') settingsObj.resource_news_enabled = val !== 'false';
        else if (key === 'resource_telegram_enabled') settingsObj.resource_telegram_enabled = val !== 'false';
      }
    }
  });

  return {
    ...settingsObj,
    vortex_ai_enabled,
    general_prompt_days,
    general_prompt_master_enabled,
    general_prompt_enabled,
    general_prompt_frequency,
    general_prompt_start_time,
    general_prompt_end_time,
    general_prompt_template,
    general_prompt_telegram_send_image,
    general_prompt_telegram_enabled,
    general_prompt_panel_id,
    news_background_enabled,
    telegram_enabled,
    telegram_bot_token,
    telegram_chat_id,
    news_alert_before,
    news_alert_after,
    news_cooldown,
    news_telegram,
    news_countries,
    news_impact_high,
    news_impact_medium,
    news_impact_low,
    ops_check_interval_ms,
    admin_ops_telegram_enabled,
    admin_ops_telegram_bot_token,
    admin_ops_telegram_chat_id
  };
}

async function sendTelegramMessage(botToken, chatId, text) {
  if (!botToken || !chatId) return;
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    });
    if (!res.ok) {
      console.error('[Worker Telegram] Erro ao enviar mensagem:', await res.text());
    }
  } catch (err) {
    console.error('[Worker Telegram] Erro ao disparar requisição:', err);
  }
}

async function sendGeneralAnalysisTelegramNotification(res, setts, assetName = '') {
  try {
    const botToken = setts.telegram_bot_token;
    const chatId = setts.telegram_chat_id;
    if (!botToken || !chatId) return;

    let text = `🧠 <b>Axion TradeStation [${assetName}] - Análise Geral</b>\n\n`;
    text += `🎯 <b>Direção:</b> ${res.setup_direction}\n`;
    text += `📊 <b>Z-Score:</b> ${res.z_score}\n`;
    text += `⚡ <b>Estratégia:</b> ${res.setup_strategy}\n`;
    text += `🚪 <b>Gatilho:</b> ${res.setup_trigger}\n`;
    text += `🟢 <b>Alvo 1:</b> ${res.setup_target_1}\n`;
    text += `🟢 <b>Alvo 2:</b> ${res.setup_target_2}\n`;
    text += `🛑 <b>Stop:</b> ${res.setup_stop}\n\n`;
    text += `📝 <b>Sentimento Macro:</b> ${res.macro_sentiment}\n`;
    text += `📈 <b>Regime de Opções:</b> ${res.options_regime}\n`;
    text += `🧱 <b>Paredes Ativas:</b> ${res.active_walls}\n`;
    text += `🧲 <b>Alvo Magnético:</b> ${res.magnetic_target}\n`;
    text += `💧 <b>Pressão do Fluxo:</b> ${res.flow_pressure}\n`;
    text += `⚠️ <b>Alertas:</b> ${res.alerts}\n`;

    const urlText = `https://api.telegram.org/bot${botToken}/sendMessage`;
    await fetch(urlText, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML'
      })
    });
  } catch (err) {
    console.error('[Worker Telegram Geral] Erro ao notificar:', err);
  }
}

async function checkNewsAlertsWorker(newsCooldowns, newsAlerted) {
  const { data: panels } = await supabase.from('painelvm_panels').select('*');
  const { data: rawSettings } = await supabase.from('painelvm_settings').select('*');
  if (!panels || !rawSettings) return;

  const settingsMap = {};
  rawSettings.forEach(s => {
    settingsMap[s.panel_id] = enrichSettingsWithVirtualConfigs(s);
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const { data: newsEvents } = await supabase
    .from('economic_news')
    .select('*')
    .gte('event_date', todayStr);
  if (!newsEvents || newsEvents.length === 0) return;

  for (const panel of panels) {
    const setts = settingsMap[panel.id];
    if (!setts || !setts.news_background_enabled) continue;

    const { data: sessionData } = await supabase
      .from('painelvm_users_sessions')
      .select('allow_telegram_news, email')
      .eq('user_id', panel.user_id)
      .maybeSingle();

    const isSystemAdmin = sessionData && sessionData.email && sessionData.email.toLowerCase() === 'admin@vortex.com';
    const canSendNews = isSystemAdmin || (sessionData && sessionData.allow_telegram_news === true);

    if (!canSendNews) continue;

    const now = new Date();
    const alertBefore = setts.news_alert_before !== undefined ? Number(setts.news_alert_before) : 5;
    const alertAfter = setts.news_alert_after !== undefined ? Number(setts.news_alert_after) : 15;
    const cooldownMins = setts.news_cooldown !== undefined ? Number(setts.news_cooldown) : 10;
    const countries = setts.news_countries || ['USD', 'EUR', 'GBP', 'JPY'];

    const impHigh = setts.news_impact_high !== false;
    const impMedium = setts.news_impact_medium !== false;
    const impLow = setts.news_impact_low || false;

    const alertTelegram = setts.news_telegram !== false;

    newsEvents.forEach(event => {
      const eventTime = new Date(event.event_date || event.date);
      const diffMs = eventTime.getTime() - now.getTime();
      const diffMin = Math.round(diffMs / 60000);
      const eventKey = `${eventTime.getTime()}_${event.country}_${event.title || event.event_name}_${panel.id}`;

      if (!countries.includes(event.country) && event.country !== 'ALL') return;
      if (event.impact === 'high' && !impHigh) return;
      if (event.impact === 'medium' && !impMedium) return;
      if (event.impact === 'low' && !impLow) return;

      if (!newsAlerted.has(eventKey)) {
        newsAlerted.set(eventKey, { before: false, after: false });
      }
      const alertedState = newsAlerted.get(eventKey);

      if (diffMin > 0 && diffMin <= alertBefore) {
        const lastAlerted = newsCooldowns.get(eventKey + '_before') || 0;
        if (!alertedState.before && (Date.now() - lastAlerted >= cooldownMins * 60 * 1000)) {
          const msg = `${event.country} — ${event.title || event.event_name} em ${diffMin} min! (Impacto: ${event.impact.toUpperCase()})`;
          console.log(`[WORKER NEWS] Enviando alerta antes de notícia para painel ${panel.name}`);

          if (alertTelegram && setts.telegram_enabled) {
            sendTelegramMessage(
              setts.telegram_bot_token,
              setts.telegram_chat_id,
              `⏰ <b>NOTÍCIA EM BREVE</b>\n\n${msg}\n\nPaís: ${event.country}\nImpacto: ${event.impact.toUpperCase()}`
            );
          }

          newsCooldowns.set(eventKey + '_before', Date.now());
          alertedState.before = true;
        }
      }

      if (diffMin <= 0 && diffMin >= -alertAfter) {
        if (!alertedState.after) {
          const msg = `${event.country} — ${event.title || event.event_name} ACABOU DE SAIR! (Impacto: ${event.impact.toUpperCase()})`;
          console.log(`[WORKER NEWS] Enviando alerta pós notícia para painel ${panel.name}`);

          if (alertTelegram && setts.telegram_enabled) {
            sendTelegramMessage(
              setts.telegram_bot_token,
              setts.telegram_chat_id,
              `🔥 <b>NOTÍCIA LIBERADA</b>\n\n${msg}\n\nPaís: ${event.country}\nImpacto: ${event.impact.toUpperCase()}`
            );
          }

          alertedState.after = true;
        }
      }
    });
  }
}

async function callLLMAPI(provider, apiKey, model, prompt) {
  if (provider === 'groq') {
    const isReasoning = (model || '').toLowerCase().includes('qwen') || 
                        (model || '').toLowerCase().includes('deepseek') || 
                        (model || '').toLowerCase().includes('r1') || 
                        (model || '').toLowerCase().includes('gpt-oss') ||
                        (model || '').toLowerCase().includes('thinking');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Você é um analisador técnico que responde estritamente no formato JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        ...(!isReasoning ? { response_format: { type: 'json_object' } } : {})
      })
    });
    if (!response.ok) throw new Error(`Groq API Error (${response.status}): ${await response.text()}`);
    const res = await response.json();
    return res.choices[0]?.message?.content || '';
  } else if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });
    if (!response.ok) throw new Error(`OpenAI API Error (${response.status}): ${await response.text()}`);
    const res = await response.json();
    return res.choices[0]?.message?.content || '';
  } else if (provider === 'gemini') {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
    });
    if (!response.ok) throw new Error(`Gemini API Error (${response.status}): ${await response.text()}`);
    const res = await response.json();
    return res.candidates[0]?.content?.parts[0]?.text || '';
  } else {
    throw new Error(`Provedor desconhecido: ${provider}`);
  }
}

async function runGeneralAnalysis(data) {
  const { provider, apiKey, model, symbol, price, zScore, atrRatio, sentiment, delta, deltaRatio, prints, forces, blockTrades, news, levels, promptTemplate, gammaBias } = data;
  if (!apiKey) throw new Error('API Key ausente.');

  const marketContext = {
    symbol,
    price,
    indicators: { zScore, atrRatio, sentimentValue: sentiment, delta, deltaRatio, printsPerSecond: prints },
    forces: forces.map(f => `${f.symbol}: Compra ${f.buy}%, Venda ${f.sell}%`).join(' | '),
    blockTrades: blockTrades.slice(0, 10),
    relevantLevels: levels,
    gammaBias,
    newsCountdowns: news.slice(0, 5)
  };

  const finalPrompt = promptTemplate 
    ? `${promptTemplate}\n\nCONTEXTO DO MERCADO:\n${JSON.stringify(marketContext, null, 2)}`
    : `${DEFAULT_GENERAL_PROMPT_TEMPLATE}\n\nCONTEXTO DO MERCADO:\n${JSON.stringify(marketContext, null, 2)}`;

  try {
    const responseText = await callLLMAPI(provider, apiKey, model, finalPrompt);
    const jsonStart = responseText.indexOf('{');
    const jsonEnd = responseText.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('Resposta não contém JSON válido.');
    const result = JSON.parse(responseText.substring(jsonStart, jsonEnd + 1));

    return {
      success: true,
      macro_sentiment: result.macro_sentiment || '--',
      options_regime: result.options_regime || '--',
      active_walls: result.active_walls || '--',
      magnetic_target: result.magnetic_target || '--',
      flow_pressure: result.flow_pressure || '--',
      z_score: result.z_score || '--',
      projection_scenario_a: result.projection_scenario_a || '--',
      projection_scenario_b: result.projection_scenario_b || '--',
      setup_direction: result.setup_direction || 'AGUARDAR',
      setup_strategy: result.setup_strategy || '--',
      setup_trigger: result.setup_trigger || '--',
      setup_target_1: result.setup_target_1 || '--',
      setup_target_2: result.setup_target_2 || '--',
      setup_stop: result.setup_stop || '--',
      alerts: result.alerts || '--'
    };
  } catch (err) {
    console.error('[Worker LLM Error]', err);
    return { success: false, error: err.message };
  }
}

async function checkGeneralPromptWorker(lastGeneralPromptExecution) {
  const { data: panels } = await supabase.from('painelvm_panels').select('*');
  const { data: rawSettings } = await supabase.from('painelvm_settings').select('*');
  if (!panels || !rawSettings) return;

  const settingsMap = {};
  const userTargetPanelMap = {};
  rawSettings.forEach(s => {
    const enriched = enrichSettingsWithVirtualConfigs(s);
    settingsMap[s.panel_id] = enriched;
    if (enriched.general_prompt_enabled && enriched.general_prompt_panel_id) {
      const p = panels.find(item => item.id === s.panel_id);
      if (p) {
        userTargetPanelMap[p.user_id] = enriched.general_prompt_panel_id;
      }
    }
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const { data: newsEvents } = await supabase
    .from('economic_news')
    .select('*')
    .gte('event_date', todayStr);
  const formattedNews = (newsEvents || []).map(n => {
    const d = new Date(n.event_date || n.date);
    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `[${timeStr}] ${n.country} - ${n.title || n.event_name} (Impacto: ${n.impact})`;
  });

  for (const panel of panels) {
    const setts = settingsMap[panel.id];
    if (!setts || (!setts.general_prompt_master_enabled && !setts.general_prompt_enabled)) continue;

    const targetPanelId = userTargetPanelMap[panel.user_id];
    if (targetPanelId && panel.id !== targetPanelId) {
      console.log(`[WORKER GENERAL PROMPT] Ignorando painel ${panel.name} (${panel.id}) pois o painel alvo configurado é ${targetPanelId}`);
      continue;
    }

    const { data: sessionData } = await supabase
      .from('painelvm_users_sessions')
      .select('allow_operations, email')
      .eq('user_id', panel.user_id)
      .maybeSingle();

    const isSystemAdmin = sessionData && sessionData.email && sessionData.email.toLowerCase() === 'admin@vortex.com';
    const canSendOps = isSystemAdmin || (sessionData && sessionData.allow_operations === true);

    if (!canSendOps) continue;

    const now = new Date();
    const gpDays = setts.general_prompt_days || 'all';
    if (gpDays === 'mon_fri') {
      const day = now.getDay();
      if (day === 0 || day === 6) continue;
    }

    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentMinutes = currentHour * 60 + currentMin;

    const [startH, startM] = (setts.general_prompt_start_time || '09:00').split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const [endH, endM] = (setts.general_prompt_end_time || '18:00').split(':').map(Number);
    const endMinutes = endH * 60 + endM;

    if (currentMinutes < startMinutes || currentMinutes > endMinutes) continue;

    const lastRun = lastGeneralPromptExecution.get(panel.id) || 0;
    const freqMinutes = setts.general_prompt_frequency || 15;
    const gpInterval = freqMinutes * 60 * 1000;
    const elapsed = Date.now() - lastRun;

    if (lastRun > 0 && elapsed < (gpInterval - 10000)) continue;

    console.log(`[WORKER GENERAL PROMPT] Executando análise para painel ${panel.name}`);

    const instanceMarket = setts.instance_id_market || 'nt8_main';
    const { data: rawMarket } = await supabase
      .from('market_data')
      .select('*')
      .eq('instance_id', instanceMarket)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!rawMarket) {
      console.warn(`[WORKER GENERAL PROMPT] Nenhum dado de mercado para o painel ${panel.name} (instância: ${instanceMarket})`);
      continue;
    }

    const recentTrades = rawMarket.recent_trades ? (typeof rawMarket.recent_trades === 'string' ? JSON.parse(rawMarket.recent_trades) : rawMarket.recent_trades) : [];
    const formattedTrades = Array.isArray(recentTrades) ? recentTrades.map(t => {
      const timeVal = t.time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `[${timeVal}] ${(t.side || 'COMPRA').toUpperCase()} | Vol: ${t.volume || 0} @ Price: ${t.price || 0}`;
    }) : [];

    const instanceForce = setts.instance_id_force || 'painel_principal';
    const { data: rawForce } = await supabase
      .from('nasdaq_force')
      .select('*')
      .eq('instance_id', instanceForce)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    let forces = [];
    if (rawForce && rawForce.force_data) {
      forces = typeof rawForce.force_data === 'string' ? JSON.parse(rawForce.force_data) : rawForce.force_data;
    }

    const lowerInstance = (panel.instance_id || '').toLowerCase();
    let gammaSymbol = 'NQ';
    if (lowerInstance.includes('sp') || lowerInstance.includes('es')) gammaSymbol = 'ES';
    if (lowerInstance.includes('gold') || lowerInstance.includes('ouro') || lowerInstance.includes('gc')) gammaSymbol = 'GC';

    const { data: rawGamma } = await supabase
      .from('gamma_levels')
      .select('*')
      .eq('reference_symbol', gammaSymbol)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    const levelsObj = {};
    let gammaBias = undefined;
    if (rawGamma) {
      levelsObj.hvl = rawGamma.hvl !== undefined ? String(rawGamma.hvl) : '--';
      levelsObj.call = rawGamma.call_resistance !== undefined ? String(rawGamma.call_resistance) : '--';
      levelsObj.put = rawGamma.put_support !== undefined ? String(rawGamma.put_support) : '--';
      levelsObj.max1d = rawGamma.max_1d !== undefined ? String(rawGamma.max_1d) : '--';
      levelsObj.min1d = rawGamma.min_1d !== undefined ? String(rawGamma.min_1d) : '--';

      gammaBias = {
        buyStrength: rawGamma.buy_strength !== undefined ? Number(rawGamma.buy_strength) : 0,
        sellStrength: rawGamma.sell_strength !== undefined ? Number(rawGamma.sell_strength) : 0,
        gammaBias: rawGamma.gamma_bias || 'NEUTRO',
        biasScore: rawGamma.bias_score !== undefined ? Number(rawGamma.bias_score) : 0,
        nearestResistance: rawGamma.nearest_resistance !== undefined ? Number(rawGamma.nearest_resistance) : 0,
        nearestSupport: rawGamma.nearest_support !== undefined ? Number(rawGamma.nearest_support) : 0,
        distanceToResistance: rawGamma.distance_to_resistance !== undefined ? Number(rawGamma.distance_to_resistance) : 0,
        distanceToSupport: rawGamma.distance_to_support !== undefined ? Number(rawGamma.distance_to_support) : 0,
        confluenceType: rawGamma.confluence_type || 'NENHUMA',
        recommendedStrategy: rawGamma.recommended_strategy || 'AGUARDAR',
        voidGammaAbove: rawGamma.void_gamma_above || 'NENHUM',
        voidGammaBelow: rawGamma.void_gamma_below || 'NENHUM',
        biasTimestamp: rawGamma.ts || '--:--:--'
      };
    }

    const apiKey = setts.ai_provider === 'groq' ? setts.groq_api_key :
                   setts.ai_provider === 'gemini' ? setts.gemini_api_key :
                   setts.openai_api_key;

    const model = setts.ai_provider === 'groq' ? setts.groq_model :
                  setts.ai_provider === 'gemini' ? setts.gemini_model :
                  setts.openai_model;

    const aiReqData = {
      provider: setts.ai_provider,
      apiKey: apiKey || '',
      model: model || '',
      symbol: rawMarket.symbol || '--',
      price: rawMarket.price !== undefined ? String(rawMarket.price) : '--',
      zScore: Number(rawMarket.zscore || 0),
      atrRatio: Number(rawMarket.atr_ratio || 0),
      sentiment: Number(rawMarket.delta_pct !== undefined ? rawMarket.delta_pct : 50),
      delta: Number(rawMarket.delta || 0),
      deltaRatio: Number(rawMarket.ratio !== undefined ? rawMarket.ratio : 1.0),
      prints: Number(rawMarket.print_rate || 0),
      forces: forces || [],
      blockTrades: formattedTrades,
      news: formattedNews,
      levels: levelsObj,
      promptTemplate: setts.general_prompt_template,
      gammaBias
    };

    lastGeneralPromptExecution.set(panel.id, Date.now());

    const res = await runGeneralAnalysis(aiReqData);

    if (res.success) {
      const { data: lastAnalyses } = await supabase
        .from('painelvm_general_analyses')
        .select('*')
        .eq('panel_id', panel.id)
        .order('id', { ascending: false })
        .limit(1);

      let shouldSave = true;
      const lastAnalysis = lastAnalyses && lastAnalyses[0];

      if (lastAnalysis) {
        const isSameDirection = lastAnalysis.direction === (res.setup_direction || 'AGUARDAR');
        const isSameTrigger = lastAnalysis.entry_point === (res.setup_trigger || '--');
        const isSameStop = lastAnalysis.stop_loss === (res.setup_stop || '--');
        const isSameTake = lastAnalysis.take_profit === `${res.setup_target_1 || '--'} / ${res.setup_target_2 || '--'}`;

        if (isSameDirection && isSameTrigger && isSameStop && isSameTake) {
          if (res.setup_direction === 'AGUARDAR') {
            shouldSave = false;
          } else {
            const lastTime = new Date(lastAnalysis.created_at || 0).getTime();
            if (Date.now() - lastTime < 60 * 60 * 1000) {
              shouldSave = false;
            }
          }
        }
      }

      if (shouldSave) {
        console.log(`[WORKER GENERAL PROMPT] Salvando nova análise no Supabase para ${panel.name}: ${res.setup_direction}`);

        const payload = {
          panel_id: panel.id,
          instance_id: panel.instance_id,
          direction: res.setup_direction || 'AGUARDAR',
          entry_point: res.setup_trigger || '--',
          stop_loss: res.setup_stop || '--',
          take_profit: `${res.setup_target_1 || '--'} / ${res.setup_target_2 || '--'}`,
          market_analysis: res.macro_sentiment || 'Sem análise macro estruturada.',
          full_json: res,
          user_id: panel.user_id
        };

        const { error: insertError } = await supabase
          .from('painelvm_general_analyses')
          .insert([payload]);

        if (insertError) {
          console.error('[WORKER GENERAL PROMPT] Erro ao inserir análise:', insertError);
        }

        if (setts.general_prompt_telegram_enabled !== false && setts.telegram_enabled && setts.telegram_bot_token && setts.telegram_chat_id) {
          await sendGeneralAnalysisTelegramNotification(res, setts, panel.name);
        }
      } else {
        console.log(`[WORKER GENERAL PROMPT] Análise para ${panel.name} não mudou. Ignorando.`);
      }
    } else {
      console.error('[WORKER GENERAL PROMPT] Erro na análise geral do painel:', res.error);
    }
  }
}

async function checkActiveOperationsWorker() {
  try {
    // 1. Buscar operações em andamento e pendentes
    const { data: activeReports, error: repError } = await supabase
      .from('painelvm_strategy_reports')
      .select('*')
      .in('status', ['Em Andamento', 'Pendente']);

    if (repError || !activeReports || activeReports.length === 0) {
      return 2000;
    }

    // 2. Buscar painéis e configurações
    const { data: panels } = await supabase.from('painelvm_panels').select('*');
    const { data: rawSettings } = await supabase.from('painelvm_settings').select('*');

    if (!panels || !rawSettings) return 2000;

    const settingsMap = {};
    rawSettings.forEach(s => {
      settingsMap[s.panel_id] = enrichSettingsWithVirtualConfigs(s);
    });

    // Identificar configurações do Admin para ops_check_interval_ms e admin Telegram
    const { data: adminSessions } = await supabase
      .from('painelvm_users_sessions')
      .select('user_id, email')
      .ilike('email', 'admin@vortex.com');

    let adminUserId = adminSessions && adminSessions.length > 0 ? adminSessions[0].user_id : null;
    let configuredIntervalMs = 2000;
    let adminSettings = null;

    if (adminUserId) {
      const adminPanel = panels.find(p => p.user_id === adminUserId);
      if (adminPanel && settingsMap[adminPanel.id]) {
        adminSettings = settingsMap[adminPanel.id];
        if (adminSettings.ops_check_interval_ms) {
          configuredIntervalMs = Math.max(250, Number(adminSettings.ops_check_interval_ms));
        }
      }
    }

    if (!adminSettings) {
      for (const pId in settingsMap) {
        const enriched = settingsMap[pId];
        if (enriched && enriched.ops_check_interval_ms) {
          configuredIntervalMs = Math.max(250, Number(enriched.ops_check_interval_ms));
          adminSettings = enriched;
          break;
        }
      }
    }

    // 🔒 Bloqueio de Mercado Fechado (Fim de semana / Sexta após fechamento / Domingo antes da abertura)
    const workerNow = new Date();
    const workerFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false
    });
    const workerParts = workerFormatter.formatToParts(workerNow);
    const wGetPart = (type) => Number(workerParts.find(p => p.type === type)?.value || 0);
    const wDayOfWeek = new Date(wGetPart('year'), wGetPart('month') - 1, wGetPart('day')).getDay();
    const wHH = String(wGetPart('hour') === 24 ? 0 : wGetPart('hour')).padStart(2, '0');
    const wMM = String(wGetPart('minute')).padStart(2, '0');
    const wSS = String(wGetPart('second')).padStart(2, '0');
    const wTimeStr = `${wHH}:${wMM}:${wSS}`;
    const wCycleEnd = (adminSettings && adminSettings.global_cycle_end) || '18:00:00';
    const wCycleStart = (adminSettings && adminSettings.global_cycle_start) || '19:00:00';

    const isWeekendClosed = wDayOfWeek === 6 || (wDayOfWeek === 0 && wTimeStr < wCycleStart) || (wDayOfWeek === 5 && wTimeStr >= wCycleEnd);
    if (isWeekendClosed) {
      // Mercado fechado: não processar ordens pendentes nem executar breakeven/trailing
      // Porém permitir que ordens "Em Andamento" continuem sendo monitoradas para SL/TP
      // se houver dados de mercado válidos (possível em after-hours de alguns ativos)
      return configuredIntervalMs * 3; // Reduzir frequência de polling durante mercado fechado
    }

    const marketDataCache = {};
    const candleCache = {};

    for (const report of activeReports) {
      const panel = panels.find(p => p.id === report.panel_id);
      const setts = report.panel_id ? settingsMap[report.panel_id] : null;
      const instanceMarket = (setts && setts.instance_id_market) ? setts.instance_id_market : (report.instance_id || 'nt8_main');

      if (!marketDataCache[instanceMarket]) {
        let { data: rawMarket } = await supabase
          .from('market_data')
          .select('*')
          .eq('instance_id', instanceMarket)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Fallback 1: Buscar por símbolo (ex: NQ, WIN, WDO, ES)
        if (!rawMarket && report.symbol) {
          const { data: symMarket } = await supabase
            .from('market_data')
            .select('*')
            .ilike('symbol', `%${report.symbol}%`)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();
          rawMarket = symMarket || null;
        }

        marketDataCache[instanceMarket] = rawMarket || null;

        let { data: rawCandles } = await supabase
          .from('painelvm_candles_1m')
          .select('*')
          .eq('instance_id', instanceMarket)
          .order('timestamp', { ascending: false })
          .limit(1);

        if ((!rawCandles || rawCandles.length === 0) && report.symbol) {
          const { data: symCandles } = await supabase
            .from('painelvm_candles_1m')
            .select('*')
            .ilike('symbol', `%${report.symbol}%`)
            .order('timestamp', { ascending: false })
            .limit(1);
          rawCandles = symCandles || null;
        }

        candleCache[instanceMarket] = (rawCandles && rawCandles.length > 0) ? rawCandles[0] : null;
      }

      const marketData = marketDataCache[instanceMarket];
      if (!marketData) continue;

      const dataAge = marketData.updated_at ? (Date.now() - new Date(marketData.updated_at).getTime()) : 999999;
      // Se os dados do Supabase forem mais antigos que 60 segundos, não utiliza para fechamento em background
      if (dataAge > 60000) continue;

      const currentPrice = Number(marketData.price || 0);
      if (currentPrice <= 0) continue;

      const entryPriceVal = Number(report.entry_price || 0);
      // Trava de segurança: Se a cotação de mercado tiver mais de 20% de discrepância do preço de entrada,
      // significa que pertence a outro ativo/painel (ex: NQ 21000 vs SP500 5900) e NUNCA deve encerrar a operação!
      if (entryPriceVal > 0 && Math.abs(currentPrice - entryPriceVal) / entryPriceVal > 0.20) {
        console.warn(`[WORKER] ⚠️ Ignorando verificação de trade ${report.id}: Preço de mercado (${currentPrice}) incompatível com entrada (${entryPriceVal}) [Ativo cruzado prevenido]`);
        continue;
      }

      const latestCandle = candleCache[instanceMarket];
      const latestHigh = latestCandle ? Number(latestCandle.high || latestCandle.close || 0) : 0;
      const latestLow = latestCandle ? Number(latestCandle.low || latestCandle.close || 0) : 0;

      const reportCreatedTime = report.created_at ? new Date(report.created_at).getTime() : 0;
      const candleTime = latestCandle?.timestamp ? new Date(latestCandle.timestamp).getTime() : 0;
      const isCandleValidForTrade = candleTime > 0 && reportCreatedTime > 0 ? candleTime >= reportCreatedTime : false;

      const validHigh = isCandleValidForTrade ? latestHigh : 0;
      const validLow = isCandleValidForTrade ? latestLow : 0;

      const alvoPrice = report.take_profit !== null && report.take_profit !== undefined ? Number(report.take_profit) : null;
      let stopPrice = report.stop_loss !== null && report.stop_loss !== undefined ? Number(report.stop_loss) : null;

      // A. Se for uma Ordem Pendente (Limit / Stop), verificar se o preço de mercado acionou
      if (report.status === 'Pendente') {
        const orderEntry = Number(report.entry_price || 0);
        if (orderEntry <= 0) continue;

        const isLimit = report.description && report.description.toUpperCase().includes('LIMITE');
        let shouldTrigger = false;

        if (report.side === 'COMPRA') {
          if (isLimit) {
            shouldTrigger = (currentPrice > 0 && currentPrice <= orderEntry) || (validLow > 0 && validLow <= orderEntry);
          } else {
            shouldTrigger = (currentPrice > 0 && currentPrice >= orderEntry) || (validHigh > 0 && validHigh >= orderEntry);
          }
        } else if (report.side === 'VENDA') {
          if (isLimit) {
            shouldTrigger = (currentPrice > 0 && currentPrice >= orderEntry) || (validHigh > 0 && validHigh >= orderEntry);
          } else {
            shouldTrigger = (currentPrice > 0 && currentPrice <= orderEntry) || (validLow > 0 && validLow <= orderEntry);
          }
        }

        if (shouldTrigger) {
          const { error: triggerErr } = await supabase
            .from('painelvm_strategy_reports')
            .update({
              status: 'Em Andamento',
              entry_price: currentPrice > 0 ? currentPrice : orderEntry
            })
            .eq('id', report.id)
            .eq('status', 'Pendente');

          if (!triggerErr) {
            console.log(`[WORKER] 🚀 Ordem Pendente ${report.id} (${report.side} @ ${orderEntry}) ACIONADA no preço ${currentPrice}!`);
            report.status = 'Em Andamento';
            report.entry_price = currentPrice > 0 ? currentPrice : orderEntry;
          }
        } else {
          continue;
        }
      }

      // 1. Processamento Dinâmico de Auto-Breakeven e Trailing Stop
      let beTrigger = 0;
      let beOffset = 0;
      let trailTrigger = 0;
      let trailStep = 0;

      if (report.description) {
        const beMatch = report.description.match(/BE:\s*(\d+(?:\.\d+)?)\s*(?:\+\s*(\d+(?:\.\d+)?))?/i);
        if (beMatch) {
          beTrigger = Number(beMatch[1]) || 0;
          beOffset = Number(beMatch[2]) || 0;
        }
        const trailMatch = report.description.match(/TRAIL:\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/i);
        if (trailMatch) {
          trailTrigger = Number(trailMatch[1]) || 0;
          trailStep = Number(trailMatch[2]) || 0;
        }
      }

      const entryPrice = Number(report.entry_price || 0);
      let updatedStopLoss = stopPrice;

      if (entryPrice > 0) {
        if (report.side === 'COMPRA') {
          const currentGainPts = currentPrice > 0 ? currentPrice - entryPrice : 0;
          const maxGainPts = validHigh > 0 ? validHigh - entryPrice : currentGainPts;
          let candidateStop = null;

          // Auto-Breakeven
          if (beTrigger > 0 && maxGainPts >= beTrigger) {
            candidateStop = Number((entryPrice + beOffset).toFixed(2));
          }

          // Trailing Stop
          if (trailTrigger > 0 && trailStep > 0 && maxGainPts >= trailTrigger) {
            const steps = Math.floor((maxGainPts - trailTrigger) / trailStep);
            const targetTrailStop = Number((entryPrice + (trailTrigger - trailStep) + (steps * trailStep)).toFixed(2));
            candidateStop = candidateStop === null ? targetTrailStop : Math.max(candidateStop, targetTrailStop);
          }

          if (candidateStop !== null && (stopPrice === null || candidateStop > stopPrice)) {
            updatedStopLoss = candidateStop;
            await supabase
              .from('painelvm_strategy_reports')
              .update({ stop_loss: updatedStopLoss })
              .eq('id', report.id)
              .eq('status', 'Em Andamento');
            stopPrice = updatedStopLoss;
            report.stop_loss = updatedStopLoss;
            console.log(`[WORKER] 🛡️ Auto-Breakeven/Trailing atualizado para ${report.id} (${report.side}): Novo SL ${updatedStopLoss}`);
          }
        } else if (report.side === 'VENDA') {
          const currentGainPts = currentPrice > 0 ? entryPrice - currentPrice : 0;
          const maxGainPts = validLow > 0 ? entryPrice - validLow : currentGainPts;
          let candidateStop = null;

          // Auto-Breakeven
          if (beTrigger > 0 && maxGainPts >= beTrigger) {
            candidateStop = Number((entryPrice - beOffset).toFixed(2));
          }

          // Trailing Stop
          if (trailTrigger > 0 && trailStep > 0 && maxGainPts >= trailTrigger) {
            const steps = Math.floor((maxGainPts - trailTrigger) / trailStep);
            const targetTrailStop = Number((entryPrice - (trailTrigger - trailStep) - (steps * trailStep)).toFixed(2));
            candidateStop = candidateStop === null ? targetTrailStop : Math.min(candidateStop, targetTrailStop);
          }

          if (candidateStop !== null && (stopPrice === null || candidateStop < stopPrice)) {
            updatedStopLoss = candidateStop;
            await supabase
              .from('painelvm_strategy_reports')
              .update({ stop_loss: updatedStopLoss })
              .eq('id', report.id)
              .eq('status', 'Em Andamento');
            stopPrice = updatedStopLoss;
            report.stop_loss = updatedStopLoss;
            console.log(`[WORKER] 🛡️ Auto-Breakeven/Trailing atualizado para ${report.id} (${report.side}): Novo SL ${updatedStopLoss}`);
          }
        }
      }
      // B. Se a Operação estiver Em Andamento, verificar se atingiu Alvo (Take Profit) ou Stop Loss
      let isResolved = false;
      let status = '';
      let exitExecutedPrice = currentPrice;
      let resolveReason = '';
      const orderEntry = Number(report.entry_price || 0);
      const tpTol = 0.10;
      const slTol = 0.05;

      const evalHigh = Math.max(validHigh > 0 ? validHigh : currentPrice, currentPrice);
      const evalLow = Math.min(validLow > 0 ? validLow : currentPrice, currentPrice);

      if (report.side === 'COMPRA') {
        // TAKE PROFIT (COMPRA)
        if (alvoPrice !== null && alvoPrice > 0 && (currentPrice >= (alvoPrice - tpTol) || evalHigh >= (alvoPrice - tpTol))) {
          isResolved = true;
          status = 'Gain';
          exitExecutedPrice = alvoPrice;
          resolveReason = `Alvo atingido no preço ${exitExecutedPrice.toFixed(2)} (Alvo: ${alvoPrice.toFixed(2)}) [Servidor]`;
        } 
        // STOP LOSS / STOP GAIN / BREAK-EVEN (COMPRA)
        else if (stopPrice !== null && stopPrice > 0 && (currentPrice <= (stopPrice + slTol) || evalLow <= (stopPrice + slTol))) {
          isResolved = true;
          exitExecutedPrice = stopPrice;
          const isGain = orderEntry > 0 && stopPrice > orderEntry;
          const isBe = orderEntry > 0 && Math.abs(stopPrice - orderEntry) < 0.01;
          status = isGain ? 'Gain' : 'Stop';
          const stopTypeLabel = isGain ? 'Stop Gain' : (isBe ? 'Break-Even' : 'Stop Loss');
          resolveReason = `${stopTypeLabel} atingido no preço ${exitExecutedPrice.toFixed(2)} (Stop: ${stopPrice.toFixed(2)}) [Servidor]`;
        }
      } else if (report.side === 'VENDA') {
        // TAKE PROFIT (VENDA)
        if (alvoPrice !== null && alvoPrice > 0 && (currentPrice <= (alvoPrice + tpTol) || evalLow <= (alvoPrice + tpTol))) {
          isResolved = true;
          status = 'Gain';
          exitExecutedPrice = alvoPrice;
          resolveReason = `Alvo atingido no preço ${exitExecutedPrice.toFixed(2)} (Alvo: ${alvoPrice.toFixed(2)}) [Servidor]`;
        } 
        // STOP LOSS / STOP GAIN / BREAK-EVEN (VENDA)
        else if (stopPrice !== null && stopPrice > 0 && (currentPrice >= (stopPrice - slTol) || evalHigh >= (stopPrice - slTol))) {
          isResolved = true;
          exitExecutedPrice = stopPrice;
          const isGain = orderEntry > 0 && stopPrice < orderEntry;
          const isBe = orderEntry > 0 && Math.abs(stopPrice - orderEntry) < 0.01;
          status = isGain ? 'Gain' : 'Stop';
          const stopTypeLabel = isGain ? 'Stop Gain' : (isBe ? 'Break-Even' : 'Stop Loss');
          resolveReason = `${stopTypeLabel} atingido no preço ${exitExecutedPrice.toFixed(2)} (Stop: ${stopPrice.toFixed(2)}) [Servidor]`;
        }
      }

      if (isResolved) {
        const closedAt = new Date().toISOString();

        // Atualização atômica para evitar concorrência com o frontend
        const { data: updatedData, error: updateErr } = await supabase
          .from('painelvm_strategy_reports')
          .update({
            status,
            exit_price: exitExecutedPrice,
            closed_at: closedAt
          })
          .eq('id', report.id)
          .eq('status', 'Em Andamento')
          .select();

        if (!updateErr && updatedData && updatedData.length > 0) {
          const panelName = panel ? panel.name : 'Painel Principal';
          console.log(`[WORKER OPERAÇÕES] ✅ Operação ${report.id} (${report.side} - ${report.strategy_name}) encerrada como ${status} no preço ${exitExecutedPrice} [${panelName}]`);

          // Notificação via Telegram APENAS para o Admin se ativado nas configurações do Admin
          if (adminSettings && adminSettings.admin_ops_telegram_enabled === true) {
            const botToken = adminSettings.admin_ops_telegram_bot_token || adminSettings.telegram_bot_token;
            const chatId = adminSettings.admin_ops_telegram_chat_id || adminSettings.telegram_chat_id;
            if (botToken && chatId) {
              const text = `🤖 *Axion TradeStation [ADMIN SERVER WORKER] - Fim de Operação*\n\n📊 *Painel:* ${panelName}\n🎯 *Estratégia:* ${report.strategy_name}\n🏁 *Operação:* ${report.side}\n📈 *Preço de Fechamento:* ${exitExecutedPrice}\n📝 *Motivo:* ${resolveReason}`;
              await sendTelegramMessage(botToken, chatId, text);
            }
          }
        }
      }
    }

    return configuredIntervalMs;
  } catch (err) {
    console.error('[WORKER OPERAÇÕES] Erro no ciclo de monitoramento de operações:', err);
    return 2000;
  }
}

async function startWorker() {
  console.log('[WORKER] Iniciando background worker autônomo do painel...');
  
  const newsCooldowns = new Map();
  const newsAlerted = new Map();
  const lastGeneralPromptExecution = new Map();

  // Rotina Dinâmica de Verificação de Operações no Servidor (Frequência configurada em ms pelo Admin)
  const runOpsCheckCycle = async () => {
    let nextIntervalMs = 2000;
    try {
      nextIntervalMs = await checkActiveOperationsWorker();
    } catch (err) {
      console.error('[WORKER ERROR] Erro no ciclo de operações:', err);
    } finally {
      setTimeout(runOpsCheckCycle, Math.max(250, nextIntervalMs));
    }
  };
  runOpsCheckCycle();

  // News Alerts Interval (a cada 10 segundos)
  setInterval(async () => {
    try {
      await checkNewsAlertsWorker(newsCooldowns, newsAlerted);
    } catch (err) {
      console.error('[WORKER ERROR] Erro no ciclo de notícias:', err);
    }
  }, 10000);

  // General Prompt Interval (a cada 15 segundos)
  setInterval(async () => {
    try {
      await checkGeneralPromptWorker(lastGeneralPromptExecution);
    } catch (err) {
      console.error('[WORKER ERROR] Erro no ciclo do prompt geral:', err);
    }
  }, 15000);

  // Execução inicial após 3 segundos
  setTimeout(async () => {
    try {
      await checkNewsAlertsWorker(newsCooldowns, newsAlerted);
      await checkGeneralPromptWorker(lastGeneralPromptExecution);
    } catch (err) {
      console.error('[WORKER ERROR] Erro na execução inicial do worker:', err);
    }
  }, 3000);
}

startWorker();
