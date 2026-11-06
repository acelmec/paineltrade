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

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const adminUserId = 'a7d1b5b5-ce4f-497c-b8f7-19be8514d0d1'; // admin@vortex.com

  // Get active broker accounts for admin
  const { data: accounts } = await supabase
    .from('painelvm_broker_accounts')
    .select('id')
    .eq('user_id', adminUserId);

  const activeAccountIds = new Set(accounts?.map(a => a.id) || []);

  // Get reports for admin
  const { data: reports } = await supabase
    .from('painelvm_strategy_reports')
    .select('*')
    .eq('user_id', adminUserId);

  if (!reports || reports.length === 0) {
    console.log('Nenhum relatório encontrado para o admin.');
    return;
  }

  const orphanedIds = reports
    .filter(r => !r.account_id || !activeAccountIds.has(r.account_id))
    .map(r => r.id);

  console.log(`Encontrados ${orphanedIds.length} relatórios órfãos/da conta principal excluída do admin para deletar...`);

  if (orphanedIds.length > 0) {
    const { data: deleted, error } = await supabase
      .from('painelvm_strategy_reports')
      .delete()
      .in('id', orphanedIds)
      .select();

    if (error) {
      console.error('Erro ao deletar relatórios:', error);
    } else {
      console.log(`Sucesso! ${deleted?.length || 0} relatórios órfãos da conta principal excluída do admin foram removidos.`);
    }
  }
}

run();
