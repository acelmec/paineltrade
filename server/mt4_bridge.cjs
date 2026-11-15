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
const accountsPositions = new Map(); // accountNumber -> Array<{ ticket, symbol, side, lots, entry_price, sl, tp, profit, open_time }>
const accountsTradesHistory = new Map(); // accountNumber -> Array<{ ticket, symbol, side, lots, entry_price, exit_price, profit, net_profit, open_time, close_time }>

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

  // 3. COMMANDS: MT4/MT5 consulta ordens para executar e sincroniza telemetria e posições de conta real
  if ((req.method === 'GET' || req.method === 'POST') && (pathname === '/commands' || pathname === '/mt4/commands')) {
    let body = '';
    const handleCommandsReq = () => {
      let bodyData = {};
      try { bodyData = JSON.parse(body || '{}'); } catch {}

      const accNum = String(bodyData.account || query.account || '').trim();
      if (accNum) {
        const rawSymbols = query.symbols || query.market_watch || '';
        const existing = accountsConnected.get(accNum) || {};
        const parsedSymbols = rawSymbols ? rawSymbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : (existing.symbols || []);

        accountsConnected.set(accNum, {
          ...existing,
          account_name: query.account_name || bodyData.account_name || existing.account_name || `MT4/MT5 #${accNum}`,
          lastSeen: new Date().toISOString(),
          symbol: query.symbol || existing.symbol || 'ACTIVE',
          symbols: parsedSymbols.length > 0 ? parsedSymbols : (existing.symbols || []),
          balance: query.balance ? Number(query.balance) : (bodyData.balance ? Number(bodyData.balance) : (existing.balance || 0)),
          equity: query.equity ? Number(query.equity) : (bodyData.equity ? Number(bodyData.equity) : (existing.equity || 0)),
          broker: query.broker || bodyData.broker || existing.broker || 'MetaTrader Server',
          currency: query.currency || bodyData.currency || existing.currency || 'USD',
          is_demo: query.demo !== undefined ? (String(query.demo) === '1' || String(query.demo) === 'true') : (existing.is_demo ?? true),
          leverage: query.leverage ? Number(query.leverage) : (existing.leverage || 100),
          platform: query.platform || existing.platform || 'mt4'
        });

        if (Array.isArray(bodyData.positions)) {
          accountsPositions.set(accNum, bodyData.positions);
        }
        if (Array.isArray(bodyData.history)) {
          accountsTradesHistory.set(accNum, bodyData.history);
        }

        const qSym = (query.symbol || bodyData.symbol || existing.symbol || '').toUpperCase();
        const qBid = Number(query.bid || bodyData.bid || 0);
        const qAsk = Number(query.ask || bodyData.ask || 0);
        if (qSym && (qBid > 0 || qAsk > 0)) {
          quotesCache.set(qSym, {
            symbol: qSym,
            price: qBid || qAsk,
            bid: qBid,
            ask: qAsk,
            volume: 1,
            updated_at: new Date().toISOString()
          });
        }
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
    };

    if (req.method === 'POST') {
      req.on('data', chunk => { body += chunk; });
      req.on('end', handleCommandsReq);
    } else {
      handleCommandsReq();
    }
    return;
  }

  // 3.01 GET ou POST /positions: Retorna ou salva posições ativas da conta
  if (pathname === '/positions' || pathname === '/mt4/positions') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const pData = JSON.parse(body || '{}');
          const accNum = String(pData.account || query.account || '').trim();
          if (accNum && Array.isArray(pData.positions)) {
            accountsPositions.set(accNum, pData.positions);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, count: (pData.positions || []).length }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    const accNum = String(query.account || '').trim().replace(/\D/g, '') || String(query.account || '').trim();
    let posList = [];
    if (accNum && accountsPositions.has(accNum)) {
      posList = accountsPositions.get(accNum);
    } else if (accountsPositions.size > 0) {
      posList = Array.from(accountsPositions.values())[0] || [];
    }
    res.end(JSON.stringify({
      success: true,
      account: accNum,
      positions: posList,
      total: posList.length
    }));
    return;
  }

  // 3.02 GET /trades ou /mt4/trades: Retorna histórico de ordens fechadas da conta
  if (req.method === 'GET' && (pathname === '/trades' || pathname === '/mt4/trades')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const accNum = String(query.account || '').trim().replace(/\D/g, '') || String(query.account || '').trim();
    let historyList = [];
    if (accNum && accountsTradesHistory.has(accNum)) {
      historyList = accountsTradesHistory.get(accNum);
    } else if (accountsTradesHistory.size > 0) {
      historyList = Array.from(accountsTradesHistory.values())[0] || [];
    }
    res.end(JSON.stringify({
      success: true,
      account: accNum,
      trades: historyList,
      total: historyList.length
    }));
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

  // 3.3 GET /market_candles: Retorna histórico de candles M1 para Forex, Metais e Índices
  if (req.method === 'GET' && (pathname === '/market_candles' || pathname === '/mt4/market_candles')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const rawSym = String(query.symbol || 'EURUSD').toUpperCase().split(/[-_(\s]/)[0].trim().replace(/[^A-Z0-9]/g, '');
    const limit = Math.min(2000, Math.max(50, Number(query.limit || 1000)));

    const yahooMap = {
      'EURUSD': 'EURUSD=X',
      'GBPUSD': 'GBPUSD=X',
      'USDJPY': 'JPY=X',
      'AUDUSD': 'AUDUSD=X',
      'USDCAD': 'CAD=X',
      'USDCHF': 'CHF=X',
      'NZDUSD': 'NZDUSD=X',
      'EURGBP': 'EURGBP=X',
      'EURJPY': 'EURJPY=X',
      'GBPJPY': 'GBPJPY=X',
      'XAUUSD': 'GC=F',
      'GOLD': 'GC=F',
      'XAGUSD': 'SI=F',
      'SILVER': 'SI=F',
      'USOIL': 'CL=F',
      'WTI': 'CL=F',
      'US30': '^DJI',
      'DJ30': '^DJI',
      'US500': '^GSPC',
      'SP500': '^GSPC',
      'USTEC': 'NQ=F',
      'NAS100': 'NQ=F',
      'GER40': '^GDAXI',
      'DAX40': '^GDAXI',
      'BTCUSD': 'BTC-USD',
      'ETHUSD': 'ETH-USD'
    };

    const targetTicker = yahooMap[rawSym] || `${rawSym}=X`;
    const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(targetTicker)}?interval=1m&range=2d`;

    fetch(yUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(5000)
    })
      .then(r => r.json())
      .then(d => {
        const result = d?.chart?.result?.[0];
        if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([]));
          return;
        }

        const timestamps = result.timestamp;
        const q = result.indicators.quote[0];
        const candles = [];

        for (let i = 0; i < timestamps.length; i++) {
          const cClose = q.close[i];
          if (cClose === null || cClose === undefined || isNaN(cClose) || cClose <= 0) continue;
          const cOpen = q.open[i] ?? cClose;
          const cHigh = q.high[i] ?? Math.max(cOpen, cClose);
          const cLow = q.low[i] ?? Math.min(cOpen, cClose);
          const cVol = q.volume?.[i] ?? 1;

          candles.push({
            timestamp: new Date(timestamps[i] * 1000).toISOString(),
            open: Number(cOpen),
            high: Number(cHigh),
            low: Number(cLow),
            close: Number(cClose),
            volume: Number(cVol)
          });
        }

        const sliced = candles.slice(-limit);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sliced));
      })
      .catch(err => {
        console.warn(`[MT4-BRIDGE] Erro ao buscar klines para ${rawSym}:`, err.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
      });
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
