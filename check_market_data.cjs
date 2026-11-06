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
  console.log('Buscando última linha de market_data...');
  const { data, error } = await supabase
    .from('market_data')
    .select('*')
    .order('id', { ascending: false })
    .limit(1);

  if (error) {
    console.error('ERRO:', error.message);
  } else {
    console.log('SUCESSO! Linha recuperada:', JSON.stringify(data, null, 2));
  }
}

check();
