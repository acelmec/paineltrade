const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Buscando as últimas linhas de market_data para cada painel...');
  const { data, error } = await supabase
    .from('market_data')
    .select('id, instance_id, symbol, ts, updated_at')
    .order('id', { ascending: false })
    .limit(10);

  if (error) {
    console.error('ERRO:', error.message);
  } else {
    console.log('SUCESSO! Linhas recuperadas:');
    console.log(JSON.stringify(data, null, 2));
  }
}

check();
