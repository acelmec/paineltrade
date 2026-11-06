const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const ws = require('ws');

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  realtime: { transport: ws }
});

async function check() {
  console.log('--- PAINELVM_PANELS ---');
  const { data: panels, error: panelErr } = await supabase
    .from('painelvm_panels')
    .select('id, name, instance_id, symbol');
  if (panelErr) console.error(panelErr);
  else console.log(panels);

  console.log('\n--- DISTINCT INSTANCE_ID IN CANDLES ---');
  const { data: instances, error: instErr } = await supabase
    .from('painelvm_candles_1m')
    .select('instance_id');
  
  if (instErr) {
    console.error(instErr);
    return;
  }
  
  const uniqueIds = [...new Set(instances.map(x => x.instance_id))];
  console.log('Unique instance_ids:', uniqueIds);

  for (const instId of uniqueIds) {
    const { data: firstCandle } = await supabase
      .from('painelvm_candles_1m')
      .select('timestamp')
      .eq('instance_id', instId)
      .order('timestamp', { ascending: true })
      .limit(1);
      
    const { data: lastCandle } = await supabase
      .from('painelvm_candles_1m')
      .select('timestamp')
      .eq('instance_id', instId)
      .order('timestamp', { ascending: false })
      .limit(1);

    const { count } = await supabase
      .from('painelvm_candles_1m')
      .select('*', { count: 'exact', head: true })
      .eq('instance_id', instId);

    console.log(`\nInstance: "${instId}"`);
    console.log(`  Count: ${count}`);
    console.log(`  First candle timestamp: ${firstCandle?.[0]?.timestamp}`);
    console.log(`  Last candle timestamp: ${lastCandle?.[0]?.timestamp}`);
  }
}

check();
