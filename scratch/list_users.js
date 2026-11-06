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
    console.log("=== LISTING SUPABASE AUTH USERS ===");
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Users count:", data?.users?.length);
        for (const u of data?.users || []) {
            console.log(`- Email: ${u.email}, Metadata:`, u.user_metadata);
        }
    }
}

run();
