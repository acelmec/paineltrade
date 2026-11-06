global.WebSocket = class {};
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
            if (cleanKey === 'VITE_SUPABASE_URL' || cleanKey === 'SUPABASE_URL') {
                url = cleanVal;
            }
            if (cleanKey === 'VITE_SUPABASE_ANON_KEY' || cleanKey === 'SUPABASE_KEY') {
                key = cleanVal;
            }
        }
    }
}

const supabase = createClient(url, key);

async function run() {
    console.log("=== INSPECTING DATABASE PANELS AND SETTINGS ===");
    
    // 1. Get all panels
    const { data: panels, error: panelErr } = await supabase
        .from('painelvm_panels')
        .select('*');
        
    if (panelErr) {
        console.error("Error fetching panels:", panelErr);
        return;
    }
    
    console.log(`Found ${panels.length} panels in database:`);
    panels.forEach(p => {
        console.log(`- Panel ID: ${p.id} | Name: ${p.name} | Instance: ${p.instance_id} | User ID: ${p.user_id} | Subscription ID: ${p.subscription_id}`);
    });

    // 2. Get all settings
    const { data: settings, error: settingsErr } = await supabase
        .from('painelvm_settings')
        .select('id, panel_id, disabled_levels');
        
    if (settingsErr) {
        console.error("Error fetching settings:", settingsErr);
        return;
    }
    
    console.log(`\nFound ${settings.length} settings records in database:`);
    settings.forEach(s => {
        const matchingPanel = panels.find(p => p.id === s.panel_id);
        const promptCfg = (s.disabled_levels || []).find(l => l.startsWith('cfg:selected_prompt_id:'));
        console.log(`- Settings ID: ${s.id} | Panel ID: ${s.panel_id} (${matchingPanel ? matchingPanel.name : 'ORPHANED!'}) | Prompt Config: ${promptCfg}`);
    });
}

run();
