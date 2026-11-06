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

async function testWebFetch() {
    console.log("=== SIMULATING WEB PANEL FETCH ===");
    const { data, error } = await supabase
        .from('nasdaq_force')
        .select('*')
        .eq('instance_id', 'painel_principal')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Data fetched by web panel:", JSON.stringify(data, null, 2));
    }
}

testWebFetch();
