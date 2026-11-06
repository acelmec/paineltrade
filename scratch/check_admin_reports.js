import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://db.vemviraramesa.com.br';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6 IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
  const { data: usersData } = await supabase.auth.admin.listUsers();
  console.log('LISTA DE E-MAILS DO BANCO:');
  usersData?.users?.forEach(u => console.log(`- ID: ${u.id} | Email: "${u.email}"`));

  // Buscar todos os relatórios onde account_id não está nas contas ativas ou onde subscription_id = 'admin'
  const { data: reports } = await supabase.from('painelvm_strategy_reports').select('*');
  console.log('\nTOTAL DE RELATÓRIOS NO BANCO:', reports ? reports.length : 0);

  const { data: accounts } = await supabase.from('painelvm_broker_accounts').select('*');
  const activeAccountIds = new Set(accounts?.map(a => a.id) || []);

  const orphaned = reports?.filter(r => !r.account_id || !activeAccountIds.has(r.account_id));
  console.log('\nRELATÓRIOS SEM CONTA ATIVA ASSOCIADA (ÓRFÃOS):', orphaned ? orphaned.length : 0);
  orphaned?.forEach(r => console.log(`  * Report ID: ${r.id} | User ID: ${r.user_id} | Account ID: ${r.account_id} | Ativo: ${r.symbol || r.ativo} | Status: ${r.status}`));
}

inspect();
