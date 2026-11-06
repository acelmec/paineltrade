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
        .select('*')
        .in('panel_id', ['41f423a9-e807-44c0-8378-9b3d92c8b783', '1ff52989-ab1e-459c-99d4-88d4a809ddd3']);
    
    settings.forEach(s => {
        console.log(`Panel ID: ${s.panel_id}`);
        console.log(`instance_id_market: ${s.instance_id_market}`);
        console.log(`instance_id_force: ${s.instance_id_force}`);
        console.log(`instance_id_screen: ${s.instance_id_screen}`);
    });
}

run();
