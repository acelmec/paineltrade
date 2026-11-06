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
    console.log("=== TESTING DISABLED_LEVELS COLUMN UPDATE ===");
    
    // Log in
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: 'admin@vortex.com',
        password: 'vortexadmin_vortex_ai_pass'
    });
    
    if (authError) {
        console.error("Auth error:", authError);
        return;
    }
    
    console.log("Logged in as user ID:", authData.user.id);
    
    // Fetch settings for panel
    const { data: settings, error: fetchErr } = await supabase
        .from('painelvm_settings')
        .select('*')
        .eq('panel_id', '1ff52989-ab1e-459c-99d4-88d4a809ddd3')
        .maybeSingle();
        
    if (fetchErr || !settings) {
        console.error("Fetch settings error:", fetchErr || "Not found");
        return;
    }
    
    console.log("Settings ID:", settings.id);
    
    // Try to update disabled_levels
    const testLevels = [...(settings.disabled_levels || [])];
    // Add/modify test configuration
    const cleanLevels = testLevels.filter(l => !l.startsWith('cfg:selected_prompt_id:'));
    const newLevels = [...cleanLevels, 'cfg:selected_prompt_id:test-prompt-id-12345'];
    
    console.log("Updating disabled_levels to contain test-prompt-id-12345...");
    
    const { data: updatedData, error: updateErr } = await supabase
        .from('painelvm_settings')
        .update({ disabled_levels: newLevels })
        .eq('id', settings.id)
        .select();
        
    if (updateErr) {
        console.error("UPDATE FAILED! Error:", updateErr);
    } else {
        console.log("UPDATE SUCCESS! New disabled_levels:", updatedData[0].disabled_levels.filter(l => l.startsWith('cfg:selected_prompt_id:')));
    }
}

run();
