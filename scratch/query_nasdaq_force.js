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

async function run() {
    console.log("=== QUERYING nasdaq_force TABLE ===");
    const { data, error } = await supabase.from('nasdaq_force').select('*');
    if (error) {
        console.error("Error querying nasdaq_force:", error);
    } else {
        console.log("Total rows fetched:", data ? data.length : 0);
        console.log("Rows:", JSON.stringify(data, null, 2));
    }
}

run();
