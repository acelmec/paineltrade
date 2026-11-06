const fs = require('fs');
const path = require('path');

let envPath = path.join(process.cwd(), '.env');
let env = {};
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      env[match[1]] = match[2] ? match[2].trim().replace(/^['"]|['"]$/g, '') : '';
    }
  });
}

const supabaseUrl = env.VITE_SUPABASE_URL || 'https://db.vemviraramesa.com.br';
const supabaseKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

async function checkNews() {
  console.log('=== 1. BUSCANDO SUPABASE economic_news ===');
  console.log('Supabase URL:', supabaseUrl);
  
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/economic_news?select=*&order=event_date.asc`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    if (res.ok) {
      const data = await res.json();
      console.log(`Total de registros no Supabase: ${data.length}`);
      
      const todayStr = new Date().toISOString().split('T')[0];
      console.log(`Data pesquisada (hoje): ${todayStr}`);
      
      const todayNews = data.filter(n => n.event_date && n.event_date.includes(todayStr));
      console.log(`Notícias registradas no Supabase para hoje (${todayStr}):`, todayNews.length);
      console.log(JSON.stringify(todayNews, null, 2));

      // Também listar últimos 20 registros gerais se não achar de hoje
      if (todayNews.length === 0) {
        console.log('\nÚltimos 10 registros na tabela economic_news:');
        console.log(JSON.stringify(data.slice(-10), null, 2));
      }
    } else {
      console.error('Erro na resposta Supabase:', res.status, res.statusText);
    }
  } catch (e) {
    console.error('Erro ao conectar no Supabase:', e.message);
  }

  console.log('\n=== 2. BUSCANDO FOREX FACTORY FEED DIRETO ===');
  try {
    const ffRes = await fetch('https://www.forexfactory.com/ff_calendar_thisweek.json', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });
    if (ffRes.ok) {
      const ffData = await ffRes.json();
      console.log(`Total de eventos na semana no ForexFactory: ${ffData.length}`);
      
      const usdEvents = ffData.filter(e => e.country === 'USD' || e.currency === 'USD');
      console.log(`Total de eventos USD nesta semana: ${usdEvents.length}`);
      
      // Filtrar eventos com "Speaks" ou "Speech" ou "Discurso" ou horário próximo de 14:00 (17:00 UTC)
      console.log('\nTodos os eventos em USD:');
      usdEvents.forEach(e => {
        const d = new Date(e.date || e.date_time || e.time);
        console.log(`- [${e.country || e.currency}] ${e.title} | Data/Hora: ${e.date || e.time} | Impacto: ${e.impact}`);
      });
    } else {
      console.log('ForexFactory HTTP Status:', ffRes.status, ffRes.statusText);
    }
  } catch (err) {
    console.error('Erro no fetch do ForexFactory:', err.message);
  }
}

checkNews();
