import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://db.vemviraramesa.com.br';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
  const accountId = 'c878da49-6487-4126-bf4e-819e52fa73ef';
  
  const { data, error, count } = await supabase
    .from('painelvm_strategy_reports')
    .delete({ count: 'exact' })
    .eq('account_id', accountId);

  console.log('RESULTADO DO DELETE:', { data, error, count });
}

inspect();
