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
    console.log("=== LOGGING IN AS ADMIN@VORTEX.COM AND SAVING SETTINGS ===");
    
    // Log in
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: 'admin@vortex.com',
        password: 'vortexadmin_vortex_ai_pass'
    });
    
    if (authError) {
        console.error("Auth error:", authError);
        return;
    }
    
    const user = authData.user;
    console.log("Logged in as user ID:", user.id);
    
    // Fetch settings for panel
    const { data: settings, error: fetchErr } = await supabase
        .from('painelvm_settings')
        .select('*')
        .eq('panel_id', '1ff52989-ab1e-459c-99d4-88d4a809ddd3')
        .maybeSingle();
        
    if (fetchErr) {
        console.error("Fetch settings error:", fetchErr);
        return;
    }
    
    if (!settings) {
        console.error("Settings row not found!");
        return;
    }
    
    console.log("Found settings ID:", settings.id);
    
    // Try to update settings
    const payload = {
        instance_id_force: 'painel_principal',
        gamma_symbol: 'NQ',
        source_market: 'supabase',
        instance_id_market: 'painel_principal',
        source_screen: 'supabase',
        instance_id_screen: 'painel_principal'
    };
    
    const { data: updatedData, error: updateErr } = await supabase
        .from('painelvm_settings')
        .update(payload)
        .eq('id', settings.id)
        .select();
        
    if (updateErr) {
        console.error("UPDATE ERROR DETAIL:", updateErr);
    } else {
        console.log("UPDATE SUCCESS! Result:", updatedData);
    }
}

run();
