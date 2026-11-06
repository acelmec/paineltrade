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
    const { data: settings } = await supabase
        .from('painelvm_settings')
        .select('id, panel_id, telegram_enabled, telegram_bot_token, telegram_chat_id')
        .in('id', ['eabb9459-1633-41cd-95f6-1ea434cd78ff', '8947e665-c849-4c8b-bc3e-268f6298bfa9']);
    console.log(settings);
}

run();
