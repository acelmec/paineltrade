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
    const { data: settings } = await supabase.from('painelvm_settings').select('*');

    console.log("=== COMPACT ACTIVE GENERAL PROMPT SETTINGS ===");
    settings.forEach(s => {
        const hasMaster = s.disabled_levels?.find(item => item.startsWith('cfg:general_prompt_master_enabled:'));
        const hasEnabled = s.disabled_levels?.find(item => item.startsWith('cfg:general_prompt_enabled:'));
        
        const isMaster = (hasMaster && hasMaster.includes('true')) || s.general_prompt_master_enabled === true;
        const isEnabled = (hasEnabled && hasEnabled.includes('true')) || s.general_prompt_enabled === true;

        if (isMaster || isEnabled || s.general_prompt_enabled || s.general_prompt_master_enabled) {
            const panel = panels.find(p => p.id === s.panel_id);
            console.log({
                settings_id: s.id,
                panel_id: s.panel_id,
                panel_name: panel ? panel.name : 'UNKNOWN',
                panel_instance_id: panel ? panel.instance_id : 'UNKNOWN',
                isMaster,
                isEnabled,
                hasMaster,
                hasEnabled
            });
        }
    });
}

run();
