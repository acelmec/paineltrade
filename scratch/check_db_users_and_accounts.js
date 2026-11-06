import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://db.vemviraramesa.com.br';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
  const { data: panels } = await supabase.from('painelvm_panels').select('*');
  console.log('TOTAL PAINÉIS:', panels ? panels.length : 0);
  panels?.forEach(p => console.log('PANEL:', p.id, 'user_id:', p.user_id, 'instance_id:', p.instance_id, 'name:', p.name, 'sub:', p.subscription_id));

  const { data: accounts } = await supabase.from('painelvm_broker_accounts').select('*');
  console.log('\nTOTAL CONTAS DEMO:', accounts ? accounts.length : 0);
  accounts?.forEach(a => console.log('ACCOUNT:', a.id, 'user_id:', a.user_id, 'name:', a.account_name));

  const { data: usersData } = await supabase.auth.admin.listUsers();
  console.log('\nTOTAL USUÁRIOS AUTH:', usersData?.users?.length || 0);
}

inspect();
