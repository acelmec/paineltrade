import { createClient } from '@supabase/supabase-js';

const url = 'https://db.vemviraramesa.com.br';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY';

// Test 1: Service Role Key (bypasses RLS)
const supabaseAdmin = createClient(url, serviceKey);

// Test 2: Client with custom headers / anon / authenticated role
const supabaseAnon = createClient(url, serviceKey, {
    auth: { persistSession: false }
});

async function runTest() {
    console.log("=== TEST 1: Service Role (Admin) ===");
    const { data: adminData, error: adminErr } = await supabaseAdmin.from('nasdaq_force').select('*');
    console.log("Admin result count:", adminData ? adminData.length : 0, "Error:", adminErr);

    console.log("\n=== TEST 2: Querying table structure / RLS policies ===");
    // Let's check RPC or SQL / postgres policies if available
    const { data: rlsData, error: rlsErr } = await supabaseAdmin.rpc('get_policies', {}).catch(() => ({ data: null }));
}

runTest();
