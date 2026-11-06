import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://db.vemviraramesa.com.br';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6 IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

async function main() {
  const { data: usersData, error: errUsers } = await supabase.auth.admin.listUsers();
  if (errUsers) console.error('Err users:', errUsers);

  const users = usersData?.users || [];
  const adminUser = users.find(u => u.email?.toLowerCase() === 'admin@vortex.com');

  console.log('ADMIN USER ID:', adminUser ? adminUser.id : 'NÃO ENCONTRADO');

  const { data: accounts } = await supabase.from('painelvm_broker_accounts').select('*');
  console.log('CONTAS DE NEGOCIAÇÃO ENCONTRADAS:', accounts?.length || 0);

  const activeAdminAccIds = new Set(accounts?.filter(a => a.user_id === adminUser?.id).map(a => a.id) || []);
  console.log('IDs DE CONTAS ATIVAS DO ADMIN:', Array.from(activeAdminAccIds));

  const { data: reports, error: errRep } = await supabase.from('painelvm_strategy_reports').select('*');
  if (errRep) console.error('Err reports:', errRep);
  console.log('TOTAL DE RELATÓRIOS NO BANCO:', reports?.length || 0);

  if (adminUser && reports) {
    const adminReports = reports.filter(r => r.user_id === adminUser.id);
    console.log(`TOTAL DE RELATÓRIOS DO ADMIN: ${adminReports.length}`);

    const orphaned = adminReports.filter(r => !r.account_id || !activeAdminAccIds.has(r.account_id));
    console.log(`RELATÓRIOS DO ADMIN SEM CONTA ATIVA / ÓRFÃOS: ${orphaned.length}`);
    orphaned.forEach(r => console.log(`- Report ID: ${r.id} | Account ID: ${r.account_id} | Status: ${r.status} | Data: ${r.timestamp || r.created_at}`));
  }
}

main();
