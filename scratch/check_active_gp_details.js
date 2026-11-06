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

async function run() {
    const { data: panels } = await supabase.from('painelvm_panels').select('*');
    const { data: rawSettings } = await supabase.from('painelvm_settings').select('*');

    function enrichSettingsWithVirtualConfigs(settingsObj) {
      if (!settingsObj) return settingsObj;
      const disabledList = settingsObj.disabled_levels || [];
      let general_prompt_master_enabled = settingsObj.general_prompt_master_enabled === true;
      let general_prompt_enabled = settingsObj.general_prompt_enabled === true;
      disabledList.forEach(item => {
        if (typeof item === 'string' && item.startsWith('cfg:')) {
          const parts = item.split(':');
          if (parts.length >= 3) {
            const key = parts[1];
            const val = parts.slice(2).join(':');
            if (key === 'general_prompt_master_enabled') general_prompt_master_enabled = val === 'true';
            else if (key === 'general_prompt_enabled') general_prompt_enabled = val === 'true';
          }
        }
      });
      return { ...settingsObj, general_prompt_master_enabled, general_prompt_enabled };
    }

    const settingsMap = {};
    rawSettings.forEach(s => {
      settingsMap[s.panel_id] = enrichSettingsWithVirtualConfigs(s);
    });

    console.log("=== EVALUATING ACTIVE GENERAL PROMPT PANELS ===");
    for (const panel of panels) {
      const setts = settingsMap[panel.id];
      if (!setts || !setts.general_prompt_master_enabled || !setts.general_prompt_enabled) continue;

      const { data: sessionData } = await supabase
        .from('painelvm_users_sessions')
        .select('allow_operations, email')
        .eq('user_id', panel.user_id)
        .maybeSingle();

      const isSystemAdmin = sessionData && sessionData.email && sessionData.email.toLowerCase() === 'admin@vortex.com';
      const canSendOps = isSystemAdmin || (sessionData && sessionData.allow_operations === true);

      console.log(`Panel name: ${panel.name}`);
      console.log(`- ID: ${panel.id}`);
      console.log(`- Instance ID: ${panel.instance_id}`);
      console.log(`- User ID: ${panel.user_id}`);
      console.log(`- Session email: ${sessionData ? sessionData.email : 'N/A'}`);
      console.log(`- allow_operations: ${sessionData ? sessionData.allow_operations : 'N/A'}`);
      console.log(`- canSendOps: ${canSendOps}`);
      console.log(`- gp_master_enabled: ${setts.general_prompt_master_enabled}, gp_enabled: ${setts.general_prompt_enabled}`);
    }
}

run();
