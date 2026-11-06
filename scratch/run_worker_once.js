import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const DEFAULT_GENERAL_PROMPT_TEMPLATE = `Você é o "VM Mentor" ...`;

async function callLLMAPI(provider, apiKey, model, prompt) {
  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
    });
    if (!response.ok) throw new Error(`Gemini API Error (${response.status}): ${await response.text()}`);
    const res = await response.json();
    return res.candidates[0]?.content?.parts[0]?.text || '';
  }
  throw new Error(`Unsupported provider ${provider}`);
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
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('Resposta não contém JSON válido: ' + responseText);
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

function enrichSettingsWithVirtualConfigs(settingsObj) {
  if (!settingsObj) return settingsObj;
  const disabledList = settingsObj.disabled_levels || [];

  let general_prompt_days = settingsObj.general_prompt_days || 'all';
  let general_prompt_master_enabled = settingsObj.general_prompt_master_enabled === true;
  let general_prompt_enabled = settingsObj.general_prompt_enabled === true;
  let general_prompt_frequency = settingsObj.general_prompt_frequency !== undefined ? Number(settingsObj.general_prompt_frequency) : 15;
  let general_prompt_start_time = settingsObj.general_prompt_start_time || '09:00';
  let general_prompt_end_time = settingsObj.general_prompt_end_time || '18:00';
  let general_prompt_template = settingsObj.general_prompt_template || '';
  let general_prompt_telegram_send_image = settingsObj.general_prompt_telegram_send_image !== false;
  let general_prompt_telegram_enabled = settingsObj.general_prompt_telegram_enabled !== false;
  let general_prompt_panel_id = settingsObj.general_prompt_panel_id || '';

  disabledList.forEach(item => {
    if (typeof item === 'string' && item.startsWith('cfg:')) {
      const parts = item.split(':');
      if (parts.length >= 3) {
        const key = parts[1];
        const val = parts.slice(2).join(':');
        if (key === 'general_prompt_days') general_prompt_days = val;
        else if (key === 'general_prompt_master_enabled') general_prompt_master_enabled = val === 'true';
        else if (key === 'general_prompt_enabled') general_prompt_enabled = val === 'true';
        else if (key === 'general_prompt_frequency') general_prompt_frequency = Number(val) || 15;
        else if (key === 'general_prompt_start_time') general_prompt_start_time = val;
        else if (key === 'general_prompt_end_time') general_prompt_end_time = val;
        else if (key === 'general_prompt_template') general_prompt_template = val;
        else if (key === 'general_prompt_telegram_send_image') general_prompt_telegram_send_image = val === 'true';
        else if (key === 'general_prompt_telegram_enabled') general_prompt_telegram_enabled = val === 'true';
        else if (key === 'general_prompt_panel_id') general_prompt_panel_id = val;
      }
    }
  });

  return {
    ...settingsObj,
    general_prompt_days,
    general_prompt_master_enabled,
    general_prompt_enabled,
    general_prompt_frequency,
    general_prompt_start_time,
    general_prompt_end_time,
    general_prompt_template,
    general_prompt_telegram_send_image,
    general_prompt_telegram_enabled,
    general_prompt_panel_id
  };
}

async function checkGeneralPromptWorker() {
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
  const formattedNews = (newsEvents || []).map(n => {
    const d = new Date(n.event_date || n.date);
    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `[${timeStr}] ${n.country} - ${n.title || n.event_name} (Impacto: ${n.impact})`;
  });

  for (const panel of panels) {
    const setts = settingsMap[panel.id];
    if (!setts || !setts.general_prompt_master_enabled || !setts.general_prompt_enabled) continue;

    console.log(`Checking panel: ${panel.name} (${panel.instance_id})...`);

    const { data: sessionData } = await supabase
      .from('painelvm_users_sessions')
      .select('allow_operations, email')
      .eq('user_id', panel.user_id)
      .maybeSingle();

    const isSystemAdmin = sessionData && sessionData.email && sessionData.email.toLowerCase() === 'admin@vortex.com';
    const canSendOps = isSystemAdmin || (sessionData && sessionData.allow_operations === true);

    if (!canSendOps) {
      console.log(`- Skipping because canSendOps is false.`);
      continue;
    }

    // Check if general_prompt_panel_id is configured and if it doesn't match this panel
    if (setts.general_prompt_panel_id && setts.general_prompt_panel_id !== panel.id) {
      console.log(`- Skipping because general_prompt_panel_id (${setts.general_prompt_panel_id}) does not match panel id (${panel.id})`);
      continue;
    }

    console.log(`- Executing analysis for painel ${panel.name}`);

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

    console.log(`- Requesting LLM analysis using provider=${setts.ai_provider}, model=${model}...`);
    const res = await runGeneralAnalysis(aiReqData);
    console.log(`- Result: success=${res.success}, direction=${res.setup_direction}`);
    if (!res.success) {
        console.error(`- Error details:`, res.error);
    }
  }
}

checkGeneralPromptWorker();
