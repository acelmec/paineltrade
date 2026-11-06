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
            if (cleanKey === 'VITE_SUPABASE_URL') url = cleanVal;
            if (cleanKey === 'VITE_SUPABASE_ANON_KEY') key = cleanVal;
        }
    }
}

const supabase = createClient(url, key);

async function checkDiego() {
    console.log('--- Buscando dados de diegomartinsinvestidor@gmail.com ---');
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const diego = users.find(u => u.email === 'diegomartinsinvestidor@gmail.com');
    
    if (!diego) {
        console.log('Diego não encontrado no auth!');
        return;
    }
    console.log('User ID Diego:', diego.id);

    const { data: panels } = await supabase
        .from('painelvm_panels')
        .select('*')
        .eq('user_id', diego.id);

    console.log('Painéis do Diego:', panels);

    if (panels && panels.length > 0) {
        const panelIds = panels.map(p => p.id);
        const { data: settings } = await supabase
            .from('painelvm_settings')
            .select('*')
            .in('panel_id', panelIds);

        console.log('Settings dos painéis do Diego:', settings);
    }

    console.log('\n--- Buscando amostras em painelvm_candles_1m ---');
    const { data: recentCandles } = await supabase
        .from('painelvm_candles_1m')
        .select('instance_id, timestamp, close')
        .order('timestamp', { ascending: false })
        .limit(20);
    
    console.log('Últimos candles em painelvm_candles_1m:', recentCandles);

    // Agrupar contagem por instance_id em painelvm_candles_1m
    const { data: allCandleInstances } = await supabase
        .from('painelvm_candles_1m')
        .select('instance_id')
        .limit(500);

    const instCounts = {};
    allCandleInstances?.forEach(c => {
        instCounts[c.instance_id] = (instCounts[c.instance_id] || 0) + 1;
    });
    console.log('Instâncias recentes encontradas em candles:', instCounts);
}

checkDiego();
