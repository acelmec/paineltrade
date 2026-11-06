import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://db.vemviraramesa.com.br';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.time('query_1000');
  const r1 = await supabase.from('painelvm_candles_1m').select('*').eq('instance_id', 'nt8_main').order('timestamp', { ascending: false }).limit(1000);
  console.timeEnd('query_1000');
  console.log('r1 count:', r1.data?.length, 'error:', r1.error);

  console.time('query_4500');
  const r2 = await supabase.from('painelvm_candles_1m').select('*').eq('instance_id', 'nt8_main').order('timestamp', { ascending: false }).limit(4500);
  console.timeEnd('query_4500');
  console.log('r2 count:', r2.data?.length, 'error:', r2.error);
}

test();
