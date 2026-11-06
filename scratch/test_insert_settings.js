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
    console.log("=== TESTING INSERT IN PAINELVM_SETTINGS ===");
    
    // We try to insert a row for a non-existent panel ID to test column names
    const testPayload = {
        panel_id: '00000000-0000-0000-0000-000000000000',
        ai_provider: 'groq',
        groq_model: 'qwen/qwen3.6-27b',
        intervalo: 30000,
        enviar_imagem_ia: true,
        gamma_symbol: 'NQ',
        instance_id_market: 'test',
        instance_id_force: 'test',
        instance_id_screen: 'test',
        source_market: 'supabase',
        source_screen: 'supabase',
        card_order_desktop: 'preco_sentimento,forca,mapa,ia_delta,grafico,blocktrades,mensagens',
        card_order_mobile: 'preco_sentimento,forca,mapa,ia_delta,grafico,blocktrades,mensagens',
        general_prompt_enabled: false,
        general_prompt_frequency: 15,
        general_prompt_start_time: '09:00',
        general_prompt_end_time: '18:00',
        general_prompt_template: 'test',
        general_prompt_telegram_send_image: true,
        general_prompt_telegram_enabled: true,
        log_show_sistema: true,
        log_show_alerta: true,
        log_show_ia: true,
        log_show_erro: true,
        log_show_noticia: true
    };
    
    const { data, error } = await supabase
        .from('painelvm_settings')
        .insert(testPayload)
        .select();
        
    console.log("INSERT RESULT ERROR:", error);
}

run();
