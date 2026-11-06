import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import ws from 'ws';

let url = null;
let key = null;
if (fs.existsSync('.env')) {
    const env = fs.readFileSync('.env', 'utf-8');
    for (let line of env.split('\n')) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;
        if (line.includes('=')) {
            const [k, ...vParts] = line.split('=');
            const cleanKey = k.trim();
            const cleanVal = vParts.join('=').trim().replace(/^["']|["']$/g, '');
            if (cleanKey === 'VITE_SUPABASE_URL' || cleanKey === 'SUPABASE_URL') {
                url = cleanVal;
            }
            if (cleanKey === 'VITE_SUPABASE_ANON_KEY' || cleanKey === 'SUPABASE_KEY' || cleanKey === 'SUPABASE_SERVICE_ROLE') {
                key = cleanVal;
            }
        }
    }
}

console.log("Supabase URL:", url);
console.log("Supabase Key (anon):", key ? key.substring(0, 20) + "..." : "null");

const supabase = createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: ws }
});

async function run() {
    console.log("\n--- Contando registros por instance_id ---");
    const ids = ['painel_principal', 'painel_gold', 'nt8_main'];
    for (const id of ids) {
        const { count, error } = await supabase
            .from('painelvm_candles_1m')
            .select('*', { count: 'exact', head: true })
            .eq('instance_id', id);
        if (error) {
            console.error(`Erro ao contar para ${id}:`, error.message);
        } else {
            console.log(`Total de registros de ${id}:`, count);
        }
    }
}

run();
