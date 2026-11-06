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
            if (cleanKey === 'VITE_SUPABASE_URL' || cleanKey === 'SUPABASE_URL') {
                url = cleanVal;
            }
            if (cleanKey === 'VITE_SUPABASE_ANON_KEY' || cleanKey === 'SUPABASE_KEY') {
                key = cleanVal;
            }
        }
    }
}

const supabase = createClient(url, key);

async function run() {
    console.log("=== INSPECTING ADMIN USER AND PANELS ===");
    
    // Log in as admin
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: 'admin@vortex.com',
        password: 'vortexadmin_vortex_ai_pass'
    });
    
    if (authError) {
        console.error("Auth error:", authError);
        return;
    }
    
    const adminUser = authData.user;
    console.log("Admin user ID:", adminUser.id);
    
    // Get panels owned by admin
    const { data: panels, error: panelErr } = await supabase
        .from('painelvm_panels')
        .select('*');
        
    if (panelErr) {
        console.error("Error fetching panels:", panelErr);
        return;
    }
    
    console.log(`\nAll panels in DB: ${panels.length}`);
    
    const adminOwnedPanels = panels.filter(p => p.user_id === adminUser.id);
    console.log(`\nPanels owned by admin user (${adminUser.id}):`);
    adminOwnedPanels.forEach(p => {
        console.log(`- Panel ID: ${p.id} | Name: ${p.name} | Instance: ${p.instance_id} | SubID: ${p.subscription_id}`);
    });
    
    const adminSubPanels = panels.filter(p => p.subscription_id === 'admin');
    console.log(`\nPanels with subscription_id = 'admin':`);
    adminSubPanels.forEach(p => {
        console.log(`- Panel ID: ${p.id} | Name: ${p.name} | Instance: ${p.instance_id} | Owner UserID: ${p.user_id}`);
    });
}

run();
