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

async function testUpsert() {
    console.log("=== TESTING UPSERT ON nasdaq_force ===");
    
    // Fetch current row first
    const { data: current, error: fetchErr } = await supabase.from('nasdaq_force').select('*').eq('instance_id', 'painel_principal').maybeSingle();
    console.log("Current row:", current);

    if (fetchErr) {
        console.error("Fetch error:", fetchErr);
        return;
    }

    // Try sending a test update to updated_at
    const nowIso = new Date().toISOString();
    console.log("Attempting upsert with timestamp:", nowIso);

    const payload = {
        ...current,
        updated_at: nowIso
    };

    const { data: upsertData, error: upsertErr } = await supabase
        .from('nasdaq_force')
        .upsert(payload, { onConflict: 'instance_id' })
        .select();

    if (upsertErr) {
        console.error("UPSERT ERROR:", upsertErr);
    } else {
        console.log("UPSERT SUCCESSFUL! New data:", upsertData);
    }
}

testUpsert();
