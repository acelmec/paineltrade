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
    console.log("=== TESTING ADMIN SETTINGS AND SAVING ===");
    
    // Get panels for admin
    const { data: panels, error: panelError } = await supabase
        .from('painelvm_panels')
        .select('*')
        .eq('subscription_id', 'admin');
        
    if (panelError) {
        console.error("Panel error:", panelError);
        return;
    }
    
    console.log("Admin panels:", panels);
    
    if (panels && panels.length > 0) {
        const { data: settings, error: settingsError } = await supabase
            .from('painelvm_settings')
            .select('*')
            .in('panel_id', panels.map(p => p.id));
            
        if (settingsError) {
            console.error("Settings error:", settingsError);
            return;
        }
        
        console.log("Settings rows:", settings);
        
        if (settings && settings.length > 0) {
            const firstSettings = settings[0];
            const testPayload = {
                instance_id_force: firstSettings.instance_id_force,
                gamma_symbol: firstSettings.gamma_symbol,
                source_market: firstSettings.source_market,
                instance_id_market: firstSettings.instance_id_market,
                source_screen: firstSettings.source_screen,
                instance_id_screen: firstSettings.instance_id_screen
            };
            
            console.log("Attempting to update settings ID:", firstSettings.id, "with payload:", testPayload);
            const { data, error: updateError } = await supabase
                .from('painelvm_settings')
                .update(testPayload)
                .eq('id', firstSettings.id)
                .select();
                
            if (updateError) {
                console.error("Update error detail:", updateError);
            } else {
                console.log("Update success! Returned data:", data);
            }
        }
    }
}

run();
