import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://db.vemviraramesa.com.br';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
  const { data: accounts } = await supabase.from('painelvm_broker_accounts').select('*').ilike('account_name', '%principal%');
  console.log('CONTAS ENCONTRADAS COM NOME "PRINCIPAL":', accounts ? accounts.length : 0);
  
  if (accounts) {
    for (const acc of accounts) {
      const { data: reports } = await supabase.from('painelvm_strategy_reports').select('id').eq('account_id', acc.id);
      const { data: routes } = await supabase.from('painelvm_account_strategies').select('id').eq('account_id', acc.id);
      console.log(`- Conta ID: ${acc.id} | Nome: "${acc.account_name}" | User ID: ${acc.user_id} | Operações: ${reports?.length || 0} | Robôs Vinculados: ${routes?.length || 0}`);
    }
  }
}

inspect();
