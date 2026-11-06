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
    console.log("=== CREATING MISSING SETTINGS FOR ADMIN PANELS ===");
    
    const panelIds = ['1ff52989-ab1e-459c-99d4-88d4a809ddd3', '41f423a9-e807-44c0-8378-9b3d92c8b783'];
    
    for (const pid of panelIds) {
        console.log(`Checking/Inserting settings for panel ID ${pid}...`);
        const { data: existing, error: fetchError } = await supabase
            .from('painelvm_settings')
            .select('id')
            .eq('panel_id', pid)
            .maybeSingle();
            
        if (fetchError) {
            console.error("Fetch error:", fetchError);
            continue;
        }
        
        if (existing) {
            console.log(`Settings already exist with ID ${existing.id}`);
        } else {
            console.log("Settings row not found. Creating default...");
            const { data, error: insertError } = await supabase
                .from('painelvm_settings')
                .insert({
                    panel_id: pid,
                    ai_provider: 'groq',
                    groq_model: 'qwen/qwen3.6-27b',
                    intervalo: 30000,
                    enviar_imagem_ia: true,
                    gamma_symbol: pid === '1ff52989-ab1e-459c-99d4-88d4a809ddd3' ? 'NQ' : 'GC',
                    instance_id_market: pid === '1ff52989-ab1e-459c-99d4-88d4a809ddd3' ? 'painel_principal' : 'painel_gold',
                    instance_id_force: pid === '1ff52989-ab1e-459c-99d4-88d4a809ddd3' ? 'painel_principal' : 'painel_gold',
                    instance_id_screen: pid === '1ff52989-ab1e-459c-99d4-88d4a809ddd3' ? 'painel_principal' : 'painel_gold',
                    source_market: 'supabase',
                    source_screen: 'supabase'
                })
                .select();
                
            if (insertError) {
                console.error("Insert error detail:", insertError);
            } else {
                console.log("Insert success! Returned:", data);
            }
        }
    }
}

run();
