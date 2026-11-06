const supabaseUrl = 'https://db.vemviraramesa.com.br';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6 IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY';

async function main() {
  const headers = {
    'apikey': serviceRoleKey,
    'Authorization': `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json'
  };

  // 1. Get all users
  const usersRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, { headers });
  const usersJson = await usersRes.json();
  const users = usersJson.users || [];
  console.log('--- USUÁRIOS NO SUPABASE AUTH ---');
  users.forEach(u => console.log(`ID: ${u.id} | Email: ${u.email}`));

  const adminUser = users.find(u => u.email?.toLowerCase() === 'admin@vortex.com');
  console.log('\nADMIN ENCONTRADO:', adminUser ? adminUser.id : 'NÃO');

  // 2. Get active broker accounts for admin
  const accRes = await fetch(`${supabaseUrl}/rest/v1/painelvm_broker_accounts?select=*`, { headers });
  const accounts = await accRes.json();
  console.log('\n--- CONTAS DE NEGOCIAÇÃO DO BANCO ---');
  accounts.forEach(a => console.log(`Account ID: ${a.id} | User ID: ${a.user_id} | Name: ${a.account_name}`));

  // 3. Get strategy reports
  const repRes = await fetch(`${supabaseUrl}/rest/v1/painelvm_strategy_reports?select=*`, { headers });
  const reports = await repRes.json();
  console.log('\n--- TOTAL DE RELATÓRIOS (painelvm_strategy_reports) ---', reports.length);
  
  if (adminUser) {
    const adminReports = reports.filter(r => r.user_id === adminUser.id);
    console.log(`Relatórios pertencentes ao Admin (user_id: ${adminUser.id}): ${adminReports.length}`);

    const activeAdminAccIds = new Set(accounts.filter(a => a.user_id === adminUser.id).map(a => a.id));

    const orphaned = adminReports.filter(r => !r.account_id || !activeAdminAccIds.has(r.account_id));
    console.log(`Relatórios do Admin sem conta ativa / de conta já excluída: ${orphaned.length}`);
    orphaned.forEach(r => console.log(`- Report ID: ${r.id} | Account ID: ${r.account_id} | Ativo: ${r.symbol || r.ativo} | Status: ${r.status} | Timestamp: ${r.timestamp || r.created_at}`));
  }
}

main();
