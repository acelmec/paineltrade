/**
 * Axion MT4 Gateway & Streamer Bridge (Port 8003)
 * Conector local HTTP/REST entre o MetaTrader 4 / MetaTrader 5 e a interface VortexWeb.
 */

const http = require('http');
const url = require('url');

const PORT = process.env.MT4_PORT || 8003;

// Cache em memória de cotações recebidas dos EAs MT4/MT5
const quotesCache = new Map(); // symbol -> { price, bid, ask, volume, updated_at }
const accountsConnected = new Map(); // accountNumber -> { lastSeen: Date, symbol: string }

// Fila de comandos pendentes por conta
// accountId/number -> Array<{ id, action, symbol, direction, side, lots, stop_loss, take_profit, ticket }>
const pendingCommands = new Map();

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const server = http.createServer((req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // 1. HEALTH / STATUS
  if (req.method === 'GET' && (pathname === '/' || pathname === '/status' || pathname === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const accList = [];
    for (const [acc, info] of accountsConnected.entries()) {
      accList.push({ account: acc, ...info });
    }
    res.end(JSON.stringify({
      status: 'online',
      service: 'Axion MT4 Gateway Bridge',
      port: PORT,
      connected_accounts_count: accountsConnected.size,
      connected_accounts: accList,
      quotes: Object.fromEntries(quotesCache)
    }));
    return;
  }

  // 2. STREAMER: Recebe Ticks e Candles M1 do MT4
  if (req.method === 'POST' && pathname === '/streamer') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        if (!body) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Body vazio' }));
          return;
        }
        const data = JSON.parse(body);
        const sym = (data.symbol || '').toUpperCase();
        if (sym) {
          quotesCache.set(sym, {
            symbol: sym,
            price: Number(data.price || data.close || 0),
            bid: Number(data.bid || 0),
            ask: Number(data.ask || 0),
            volume: Number(data.volume || 0),
            updated_at: data.updated_at || new Date().toISOString()
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, symbol: sym }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 3. COMMANDS: MT4/MT5 consulta ordens para executar e sincroniza telemetria de conta real
  if (req.method === 'GET' && pathname === '/commands') {
    const accNum = String(query.account || '').trim();
    if (accNum) {
      const rawSymbols = query.symbols || query.market_watch || '';
      const parsedSymbols = rawSymbols ? rawSymbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : (existing.symbols || []);

      const existing = accountsConnected.get(accNum) || {};
      accountsConnected.set(accNum, {
        ...existing,
        account_name: query.account_name || existing.account_name || `MT4/MT5 #${accNum}`,
        lastSeen: new Date().toISOString(),
        symbol: query.symbol || existing.symbol || 'ACTIVE',
        symbols: parsedSymbols.length > 0 ? parsedSymbols : (existing.symbols || []),
        balance: query.balance ? Number(query.balance) : (existing.balance || 0),
        equity: query.equity ? Number(query.equity) : (existing.equity || 0),
        broker: query.broker || existing.broker || 'MetaTrader Server',
        currency: query.currency || existing.currency || 'USD',
        is_demo: query.demo !== undefined ? (String(query.demo) === '1' || String(query.demo) === 'true') : (existing.is_demo ?? true),
        leverage: query.leverage ? Number(query.leverage) : (existing.leverage || 100),
        platform: query.platform || existing.platform || 'mt4'
      });
    }

    // Busca próximo comando pendente para a conta ou comando global
    const queue = pendingCommands.get(accNum) || pendingCommands.get('all') || [];
    if (queue.length > 0) {
      const nextCmd = queue[0]; // Mantém na fila até que MT4 mande ack
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(nextCmd));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({})); // Sem comandos pendentes
    return;
  }

  // 3.1 GET /accounts ou /mt4/accounts: Retorna lista de contas reais detectadas para sincronização
  if (req.method === 'GET' && (pathname === '/accounts' || pathname === '/mt4/accounts')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const accList = [];
    for (const [acc, info] of accountsConnected.entries()) {
      accList.push({
        id: `mt_${acc}`,
        account_number: acc,
        name: info.account_name || `MT #${acc}`,
        balance: info.balance || 0,
        equity: info.equity || 0,
        broker: info.broker || 'MetaTrader Server',
        currency: info.currency || 'USD',
        is_demo: info.is_demo ?? true,
        leverage: info.leverage || 100,
        platform: info.platform || 'mt4',
        symbols: info.symbols || [],
        last_seen: info.lastSeen
      });
    }
    res.end(JSON.stringify({
      success: true,
      total: accList.length,
      accounts: accList
    }));
    return;
  }

  // 3.2 GET /symbols ou /mt4/symbols: Retorna símbolos detectados
  if (req.method === 'GET' && (pathname === '/symbols' || pathname === '/mt4/symbols')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const allDetectedSymbols = new Set();
    for (const [, info] of accountsConnected.entries()) {
      if (Array.isArray(info.symbols)) {
        info.symbols.forEach(s => allDetectedSymbols.add(s));
      }
      if (info.symbol && info.symbol !== 'ACTIVE') {
        allDetectedSymbols.add(info.symbol.toUpperCase());
      }
    }
    const standardForexList = [
      'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD',
      'EURGBP', 'EURJPY', 'GBPJPY', 'XAUUSD', 'XAGUSD', 'USOIL', 'US30', 'US500', 'USTEC', 'GER40', 'BTCUSD', 'ETHUSD'
    ];
    res.end(JSON.stringify({
      success: true,
      detected_symbols: Array.from(allDetectedSymbols),
      standard_symbols: standardForexList,
      total_detected: allDetectedSymbols.size
    }));
    return;
  }

  // 4. COMMAND ACK: MT4 confirma que executou o comando
  if (req.method === 'POST' && pathname === '/command_ack') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const cmdId = payload.id;
        const accNum = String(payload.account || '').trim();
        const status = payload.status;

        console.log(`✅ [MT4-BRIDGE] Ordem ${cmdId} confirmada pelo MT4 (${accNum}) com status: ${status}`);

        // Remove o comando da fila
        if (accNum && pendingCommands.has(accNum)) {
          const list = pendingCommands.get(accNum).filter(c => c.id !== cmdId);
          pendingCommands.set(accNum, list);
        }
        if (pendingCommands.has('all')) {
          const list = pendingCommands.get('all').filter(c => c.id !== cmdId);
          pendingCommands.set('all', list);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 5. POST ORDER: O painel Web despacha uma ordem para o MT4 executar
  if (req.method === 'POST' && (pathname === '/order' || pathname === '/send_order')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const accNum = String(payload.account || payload.account_name || 'all').trim();
        const cmdId = payload.id || `cmd_${Date.now()}`;

        const cmd = {
          id: cmdId,
          action: payload.action || 'order',
          symbol: payload.symbol || '',
          direction: payload.direction || (payload.side === 'COMPRA' || payload.side === 'BUY' ? 1 : 2),
          side: payload.side || (payload.direction === 1 ? 'BUY' : 'SELL'),
          lots: Number(payload.lots || payload.contracts || 0.01),
          stop_loss: Number(payload.stop_loss || 0),
          take_profit: Number(payload.take_profit || 0),
          ticket: Number(payload.ticket || 0)
        };

        if (!pendingCommands.has(accNum)) {
          pendingCommands.set(accNum, []);
        }
        pendingCommands.get(accNum).push(cmd);

        console.log(`🚀 [MT4-BRIDGE] Nova ordem enfileirada para conta ${accNum}:`, cmd);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, command_id: cmdId }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 6. GET QUOTES: O painel consulta as cotações ao vivo do MT4
  if (req.method === 'GET' && pathname === '/quotes') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Object.fromEntries(quotesCache)));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint não encontrado no Axion MT4 Bridge' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log(`🚀 [AXION MT4 GATEWAY BRIDGE] Ativo na porta ${PORT}`);
  console.log(`📡 URL Local: http://localhost:${PORT}`);
  console.log(`🩺 Health: http://localhost:${PORT}/status`);
  console.log('====================================================');
});
