import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://db.vemviraramesa.com.br';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const userId = 'd33cbdd9-971b-46c8-8718-34860146d70e'; // acelmec@gmail.com
  console.log(`Excluindo todos os relatórios de operações em painelvm_strategy_reports para user_id: ${userId}...`);

  const { data, error } = await supabase
    .from('painelvm_strategy_reports')
    .delete()
    .eq('user_id', userId)
    .select();

  if (error) {
    console.error('Erro ao deletar relatórios:', error);
  } else {
    console.log(`Sucesso! ${data?.length || 0} relatórios foram excluídos para acelmec@gmail.com.`);
  }
}

run();
