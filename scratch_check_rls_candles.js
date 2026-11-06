import fs from 'fs';

let url = '';
let key = '';
if (fs.existsSync('.env')) {
  const env = fs.readFileSync('.env', 'utf-8');
  for (let line of env.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.includes('=')) {
      const [k, ...vParts] = line.split('=');
      const cleanKey = k.trim();
      const cleanVal = vParts.join('=').trim().replace(/^["']|["']$/g, '');
      if (cleanKey === 'VITE_SUPABASE_URL' || cleanKey === 'SUPABASE_URL') {
        url = cleanVal;
      }
      if (cleanKey === 'VITE_SUPABASE_ANON_KEY' || cleanKey === 'SUPABASE_KEY' || cleanKey === 'SUPABASE_SERVICE_ROLE') {
        key = cleanVal;
      }
    }
  }
}

if (!url || !key) {
  console.error("Could not find VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const sql = `
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'painelvm_candles_1m';
SELECT schemaname, tablename, policyname, roles, cmd, qual FROM pg_policies WHERE tablename = 'painelvm_candles_1m';
`;

async function execute() {
  const rpcUrl = `${url}/rest/v1/rpc/execute_sql`;
  console.log(`Executing SQL via RPC: ${rpcUrl}`);
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'params=single-object'
      },
      body: JSON.stringify({
        sql_query: sql
      })
    });

    const text = await response.text();
    console.log("SQL Output:", text);
  } catch (error) {
    console.error("Fetch error:", error);
  }
}

execute();
