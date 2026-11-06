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
    console.log("Checking RLS policies for gamma_levels...");
    
    // We can run an RPC or simple query if we have a postgres function, otherwise we query pg_policies using an RPC or we check if pg_policies is queryable.
    // Let's try querying pg_policies from postgres if possible, or check if we get errors.
    const { data, error } = await supabase.rpc('execute_sql', {
        sql_query: "SELECT schemaname, tablename, policyname, roles, cmd, qual FROM pg_policies WHERE tablename = 'gamma_levels'"
    });

    if (error) {
        // execute_sql might not exist, let's try direct postgres query if we can, or print error
        console.log("execute_sql RPC failed (normal if not defined):", error.message);
        
        // Let's try selecting from pg_policies if public access is allowed (usually not)
        const { data: pols, error: polErr } = await supabase
            .from('pg_policies')
            .select('*');
        console.log("Direct pg_policies query:", polErr ? polErr.message : pols);
        return;
    }

    console.log("Policies:", data);
}

run();
