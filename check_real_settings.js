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
            if (cleanKey === 'VITE_SUPABASE_ANON_KEY' || cleanKey === 'SUPABASE_KEY' || cleanKey === 'SUPABASE_SERVICE_ROLE') {
                key = cleanVal;
            }
        }
    }
}

const supabase = createClient(url, key);

async function run() {
    console.log("=== CHECKING TABLE COLUMNS AND TYPES ===");
    // Querying information_schema via RPC or raw select if possible, or just trying to select all from a row
    const { data: rows, error: fetchErr } = await supabase
        .from('painelvm_settings')
        .select('*')
        .limit(1);

    if (fetchErr) {
        console.error("Fetch error:", fetchErr);
        return;
    }
    
    if (rows && rows.length > 0) {
        console.log("Current columns in painelvm_settings in Supabase:");
        console.log(Object.keys(rows[0]));
    } else {
        console.log("No rows in painelvm_settings!");
    }
}

run();
