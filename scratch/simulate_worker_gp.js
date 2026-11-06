import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

let url = null;
let key = null;
if (fs.existsSync('.env')) {
    const env = fs.readFileSync('.env', 'utf-8');
    for (let line of env.split('\n')) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;
        if (line.includes('=')) {
            const [k, v] = line.split('=');
            const cleanKey = k.trim();
            const cleanVal = v.trim().replace(/^["']|["']$/g, '');
            if (cleanKey === 'VITE_SUPABASE_URL') {
                url = cleanVal;
            }
            if (cleanKey === 'VITE_SUPABASE_ANON_KEY') {
                key = cleanVal;
            }
        }
    }
}

const supabase = createClient(url, key);

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

async function run() {
  const { data: panels } = await supabase.from('painelvm_panels').select('*');
  const { data: rawSettings } = await supabase.from('painelvm_settings').select('*');
  if (!panels || !rawSettings) return;

  const settingsMap = {};
  rawSettings.forEach(s => {
    settingsMap[s.panel_id] = enrichSettingsWithVirtualConfigs(s);
  });

  console.log(`Evaluating ${panels.length} panels...`);
  for (const panel of panels) {
    const setts = settingsMap[panel.id];
    if (!setts) continue;
    if (!setts.general_prompt_master_enabled || !setts.general_prompt_enabled) continue;

    console.log(`\n--- ACTIVE PANEL DETECTED: ${panel.name} (${panel.instance_id}) ---`);
    console.log(`- Panel ID: ${panel.id}`);
    console.log(`- Settings ID: ${setts.id}`);
    console.log(`- general_prompt_panel_id: ${setts.general_prompt_panel_id}`);

    const { data: sessionData } = await supabase
      .from('painelvm_users_sessions')
      .select('allow_operations, email')
      .eq('user_id', panel.user_id)
      .maybeSingle();

    const isSystemAdmin = sessionData && sessionData.email && sessionData.email.toLowerCase() === 'admin@vortex.com';
    const canSendOps = isSystemAdmin || (sessionData && sessionData.allow_operations === true);

    console.log(`- canSendOps: ${canSendOps} (isSystemAdmin: ${isSystemAdmin}, allow_ops: ${sessionData?.allow_operations})`);

    // Check if general_prompt_panel_id matches (if set)
    if (setts.general_prompt_panel_id && setts.general_prompt_panel_id !== panel.id) {
      console.log(`- SKIPPED: general_prompt_panel_id (${setts.general_prompt_panel_id}) does not match this panel's id (${panel.id})`);
      continue;
    }

    const instanceMarket = setts.instance_id_market || 'nt8_main';
    console.log(`- instanceMarket: ${instanceMarket}`);
    const { data: rawMarket } = await supabase
      .from('market_data')
      .select('*')
      .eq('instance_id', instanceMarket)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!rawMarket) {
      console.log(`- ERROR: No market data for instance ${instanceMarket}`);
      continue;
    }
    console.log(`- Found market data: symbol=${rawMarket.symbol}, price=${rawMarket.price}`);
  }
}

run();
