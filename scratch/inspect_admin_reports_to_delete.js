import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [k, v] = line.split('=');
  if (k && v) envVars[k.trim()] = v.trim();
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const supabaseAnonKey = envVars.VITE_SUPABASE_ANON_KEY;

console.log('URL:', supabaseUrl);
console.log('ANON KEY:', supabaseAnonKey?.slice(0, 20) + '...');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
  const { data: usersData, error: errUsers } = await supabase.auth.admin.listUsers();
  if (errUsers) console.error('Err users:', errUsers);

  const adminUser = usersData?.users?.find(u => u.email?.toLowerCase() === 'admin@vortex.com');
  console.log('ADMIN USER:', adminUser ? { id: adminUser.id, email: adminUser.email } : 'NÃO ENCONTRADO');

  if (adminUser) {
    const { data: accounts } = await supabase
      .from('painelvm_broker_accounts')
      .select('*')
      .eq('user_id', adminUser.id);

    console.log('\nCONTAS ATIVAS DO ADMIN:', accounts?.map(a => ({ id: a.id, name: a.account_name })));

    const activeAccountIds = new Set(accounts?.map(a => a.id) || []);

    const { data: reports, error: errRep } = await supabase
      .from('painelvm_strategy_reports')
      .select('*')
      .eq('user_id', adminUser.id);

    if (errRep) console.error('Err reports:', errRep);

    console.log(`\nTOTAL DE RELATÓRIOS DO ADMIN EM painelvm_strategy_reports: ${reports?.length || 0}`);

    if (reports && reports.length > 0) {
      const orphaned = reports.filter(r => !r.account_id || !activeAccountIds.has(r.account_id));
      console.log(`\nRELATÓRIOS DO ADMIN SEM CONTA ATIVA / CONTA PRINCIPAL EXCLUÍDA: ${orphaned.length}`);
      orphaned.forEach(r => {
        console.log(`- Report ID: ${r.id} | Account ID: ${r.account_id || 'NULL'} | Instance: ${r.instance_id} | Status: ${r.status} | Data: ${r.timestamp || r.created_at}`);
      });
    }
  }
}

inspect();
