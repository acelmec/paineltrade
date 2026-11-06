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
            const parts = line.split('=');
            const cleanKey = parts[0].trim();
            const cleanVal = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
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

async function inspectNasdaqForce() {
    console.log("=== 1. ALL ROWS IN nasdaq_force ===");
    const { data: allRows, error: errAll } = await supabase.from('nasdaq_force').select('*');
    if (errAll) console.error("Error fetching all rows:", errAll);
    else console.log(JSON.stringify(allRows, null, 2));

    console.log("\n=== 2. ROW COUNT ===");
    console.log("Total rows:", allRows ? allRows.length : 0);

    if (allRows && allRows.length > 0) {
        allRows.forEach(row => {
            console.log(`ID: ${row.id} | Instance: ${row.instance_id} | UpdatedAt: ${row.updated_at} | Modo: ${row.modo} | Direcao: ${row.direcao}`);
        });
    }

    // Try an update or insert test if needed, or check if we can write to it
    console.log("\n=== 3. CHECKING INSTANCE IDS IN APP / CONFIG ===");
}

inspectNasdaqForce();
