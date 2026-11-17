/**
 * VortexWeb — WebSocket Hub Relay & Background Order Execution Server v3.3
 * 
 * Microserviço ultra-leve e de altíssima performance para relay de dados do mercado
 * e monitoramento em tempo real de ordens/posições abertas ('Em Andamento')
 * exclusivamente para CONTAS DEMO AXION no Supabase (painelvm_strategy_reports),
 * mesmo com o navegador/painel fechado ou aberto.
 * 
 * Fontes de dados:
 * 1. HTTP POST em tempo real (/market_data, /candles) do NinjaTrader / MT4 / Streamer.
 * 2. Tabela de Candles 1m do Supabase (painelvm_candles_1m) e Cotações (market_data).
 * 
 * Regras:
 * - Apenas Contas Demo Axion (Simulador Interno da Plataforma).
 * - Avalia Stop Loss, Take Profit, Trailing Stop e Break-Even.
 * - Atualização estritamente idempotente no Supabase.
 * - Broadcast instantâneo via WebSocket para todos os clientes conectados.
 * 
 * Uso:
 *   node server/websocket_hub.cjs
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { WebSocketServer, WebSocket } = require('ws');
let createClient = null;
try {
  createClient = require('@supabase/supabase-js').createClient;
} catch (_) {
  // Executa normalmente sem crashar se @supabase/supabase-js não estiver instalado
}

const PORT = process.env.PORT || 8080;

// Configurações do Supabase
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://db.vemviraramesa.com.br';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY';

let supabase = null;
if (createClient) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log(`📡 [HUB-SUPABASE] Conectado ao banco: ${SUPABASE_URL}`);
  } catch (e) {
    console.error(`❌ [HUB-SUPABASE] Erro ao instanciar Supabase:`, e.message);
  }
} else {
  console.log(`📡 [HUB] Rodando em modo WebSocket Relay & Tunnel Ponto-a-Ponto (Standalone).`);
}

// Configurações do Engine de Machine Learning (TensorFlow)
const ML_REGISTRY_PATH = path.join(__dirname, '..', 'ml_pipeline', 'models', 'studies_registry.json');
const ML_SCHEDULE_PATH = path.join(__dirname, '..', 'ml_pipeline', 'models', 'ml_schedule.json');
const ML_SCRIPT_PATH = path.join(__dirname, '..', 'ml_pipeline', 'pattern_analyzer.py');

// Cache em memória para Conector Oficial MetaTrader 4 & MetaTrader 5 (Porta 80 / HTTP Padrão)
const mt4QuotesCache = new Map(); // symbol -> { price, bid, ask, spread, volume, updated_at }

// Constrói cotação SOMENTE com Bid e Ask autênticos enviados pelo EA.
// NUNCA fabrica Ask (=Bid) nem zera o Ask: leitura incompleta retorna null e o cache mantém
// o último par Bid/Ask real (portanto o último spread real).
function buildRealQuote(sym, item) {
  const bid = Number(item && item.bid || 0);
  const ask = Number(item && item.ask || 0);
  if (!sym || !(bid > 0) || !(ask > 0) || ask < bid) return null;
  return {
    symbol: sym,
    price: Number(item.price || bid),
    bid,
    ask,
    spread: Number((ask - bid).toFixed(6)),
    volume: Number(item.volume || 1),
    updated_at: item.updated_at || new Date().toISOString()
  };
}
const mt4AccountsConnected = new Map(); // accountNumber -> { lastSeen: Date, symbol: string }
const mt4PositionsCache = new Map(); // accountNumber -> Array<{ ticket, symbol, side, lots, entry_price, sl, tp, profit, open_time }>
const mt4TradesHistoryCache = new Map(); // accountNumber -> Array<{ ticket, symbol, side, lots, entry_price, exit_price, profit, net_profit, open_time, close_time }>
const mt4PendingCommands = new Map(); // accountId/number -> Array<{ id, action, symbol, direction, side, lots, stop_loss, take_profit, ticket }>

let mlRunState = {
  is_running: false,
  current_symbol: null,
  started_at: null,
  last_error: null
};

// Inicializa arquivo de agendamento padrão se não existir
if (!fs.existsSync(ML_SCHEDULE_PATH)) {
  try {
    fs.mkdirSync(path.dirname(ML_SCHEDULE_PATH), { recursive: true });
    fs.writeFileSync(ML_SCHEDULE_PATH, JSON.stringify({
      enabled: false,
      time: '18:15',
      assets: ['NQ', 'ES', 'GC'],
      last_executed_date: null
    }, null, 2), 'utf-8');
  } catch (e) {}
}

function triggerPythonAnalysis(symbol, config, epochs = 10, fetchDb = false, callback = null, customParams = {}) {
  if (mlRunState.is_running) {
    if (callback) callback(new Error('Outra análise já está em execução no momento.'));
    return false;
  }

  mlRunState = {
    is_running: true,
    current_symbol: symbol.toUpperCase(),
    started_at: new Date().toISOString(),
    last_error: null
  };

  const isGammaQuant = customParams && customParams.study_type === 'gamma_quant';
  const scriptToRun = isGammaQuant
    ? path.join(__dirname, '..', 'ml_pipeline', 'gamma_quant_analyzer.py')
    : ML_SCRIPT_PATH;

  const args = [
    scriptToRun,
    '--symbol', symbol.toUpperCase()
  ];

  if (!isGammaQuant) {
    args.push('--epochs', String(epochs || 10));
  }

  if (fetchDb) args.push('--fetch-db');
  if (customParams) {
    if (customParams.model_name) args.push('--name', String(customParams.model_name));
    if (customParams.tp_points) args.push('--tp', String(customParams.tp_points));
    if (customParams.sl_points) args.push('--sl', String(customParams.sl_points));
    if (customParams.start_date) args.push('--start-date', String(customParams.start_date));
    if (customParams.end_date) args.push('--end-date', String(customParams.end_date));
  }

  if (config) {
    if (config.use_candle_patterns === false) args.push('--no-candles');
    if (config.use_levels === false) args.push('--no-levels');
    if (config.use_gamma_levels === false) args.push('--no-gamma');
    if (config.use_rsi === false) args.push('--no-rsi');
    if (config.use_atr === false) args.push('--no-atr');
    if (config.use_macd === false) args.push('--no-macd');
    if (config.use_moving_averages === false) args.push('--no-ma');
    if (config.use_volume === false) args.push('--no-volume');
  }

  console.log(`🤖 [ML-ENGINE] Executando Python com TensorFlow: python ${args.join(' ')}`);
  const pyProcess = spawn('python', args, { cwd: path.join(__dirname, '..') });

  pyProcess.stdout.on('data', data => {
    const text = data.toString();
    if (text.includes('✅') || text.includes('Avaliação') || text.includes('Epoch')) {
      console.log(`[ML-LOG] ${text.trim().split('\n').pop()}`);
    }
  });

  pyProcess.stderr.on('data', data => {
    const errText = data.toString();
    if (!errText.includes('oneDNN') && !errText.includes('TF_ENABLE_ONEDNN_OPTS')) {
      console.warn(`[ML-STDERR] ${errText.trim()}`);
    }
  });

  pyProcess.on('close', code => {
    console.log(`🏁 [ML-ENGINE] Processo finalizado com código ${code}`);
    mlRunState.is_running = false;
    mlRunState.current_symbol = null;
    if (code !== 0) {
      mlRunState.last_error = `Processo Python falhou com código ${code}`;
    } else if (supabase) {
      try {
        if (fs.existsSync(ML_REGISTRY_PATH)) {
          const allStudies = JSON.parse(fs.readFileSync(ML_REGISTRY_PATH, 'utf-8'));
          const symRecord = allStudies[symbol.toUpperCase()];
          if (symRecord) {
            const mName = symRecord.model_name || customParams.model_name || `Axion ${symRecord.symbol} Retest (${symRecord.metrics?.accuracy || 0}% Acc)`;
            const tpVal = Number(symRecord.tp_points || customParams.tp_points || 25.0);
            const slVal = Number(symRecord.sl_points || customParams.sl_points || 12.0);

            const mType = isGammaQuant ? 'gamma_quant_study' : 'tensorflow_patterns';

            supabase.from('painelvm_ml_studies').insert([{
              symbol: symRecord.symbol,
              model_name: mName,
              model_type: mType,
              tp_points: tpVal,
              sl_points: slVal,
              last_run: symRecord.last_run || new Date().toISOString(),
              data_start: symRecord.data_start,
              data_end: symRecord.data_end,
              total_candles: symRecord.total_candles,
              analyzed_samples: symRecord.analyzed_samples,
              test_samples: symRecord.test_samples,
              metrics: symRecord.metrics,
              active_features_count: symRecord.active_features_count,
              active_features: symRecord.active_features,
              test_config: symRecord.test_config,
              top_patterns: symRecord.top_patterns,
              model_path: symRecord.model_path,
              is_active: true,
              status: 'success'
            }]).then(({ error }) => {
              if (error) console.warn('[ML-HUB] Aviso ao gravar estudo no Supabase:', error.message);
              else console.log(`💾 [ML-HUB] Modelagem '${mName}' de ${symbol} gravada com sucesso no Supabase (painelvm_ml_studies).`);
            });
          }
        }
      } catch (e) {
        console.warn('[ML-HUB] Erro ao sincronizar estudo com Supabase:', e.message);
      }
    }
    if (callback) callback(code === 0 ? null : new Error(`Falha no processo Python (código ${code})`));
  });

  return true;
}

// Scheduler Diário Automático (Verifica a cada 30 segundos)
setInterval(() => {
  try {
    if (!fs.existsSync(ML_SCHEDULE_PATH)) return;
    const sched = JSON.parse(fs.readFileSync(ML_SCHEDULE_PATH, 'utf-8'));
    if (!sched.enabled || !sched.time) return;

    const now = new Date();
    const spDateStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const spTimeStr = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

    if (spTimeStr === sched.time && sched.last_executed_date !== spDateStr && !mlRunState.is_running) {
      console.log(`⏰ [ML-SCHEDULER] Horário de gatilho ${sched.time} alcançado em São Paulo (${spDateStr}). Iniciando reteste automático...`);
      sched.last_executed_date = spDateStr;
      fs.writeFileSync(ML_SCHEDULE_PATH, JSON.stringify(sched, null, 2), 'utf-8');

      const assets = sched.assets && sched.assets.length > 0 ? sched.assets : ['NQ'];
      (async () => {
        for (const sym of assets) {
          console.log(`🚀 [ML-SCHEDULER] Executando remodelagem agendada para: ${sym}`);
          await new Promise(resolve => {
            triggerPythonAnalysis(sym, sched.config || {}, 10, true, () => resolve());
          });
        }
      })();
    }
  } catch (err) {
    console.warn('[ML-SCHEDULER] Erro no loop de agendamento:', err.message);
  }
}, 30000);

// Caches em memória por instance_id
const marketDataCache = new Map();
const forceDataCache = new Map();
const candlesCache = new Map();

// Cache de ordens em andamento de TODOS os usuários
let activeOrders = [];
let isSyncingOrders = false;
let lastOrdersSyncTime = 0;

// Mapa de contas cadastradas para validação de tipo (Demo Axion vs NinjaTrader/Externa)
let brokerAccountsMap = new Map();
let isSyncingAccounts = false;

// Métricas do Hub
let totalMessagesReceived = 0;
let totalBroadcastsSent = 0;
let totalOrdersClosedByServer = 0;
const startTime = Date.now();

// Helper para parse seguro de número
function parseNum(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const str = String(val).trim().replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

// Normalizador de símbolos para correspondência
function normalizeSymbol(sym) {
  if (!sym) return '';
  const s = String(sym).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.includes('NQ') || s.includes('MNQ') || s.includes('NAS') || s.includes('NASDAQ')) return 'NQ';
  if (s.includes('ES') || s.includes('MES') || s.includes('SP500') || s.includes('SPX')) return 'ES';
  if (s.includes('YM') || s.includes('MYM') || s.includes('DOW') || s.includes('US30')) return 'YM';
  if (s.includes('GC') || s.includes('MGC') || s.includes('GOLD') || s.includes('XAU')) return 'GC';
  if (s.includes('CL') || s.includes('MCL') || s.includes('OIL') || s.includes('WTI')) return 'CL';
  if (s.includes('RTY') || s.includes('M2K') || s.includes('RUSSEL')) return 'RTY';
  return s;
}

// =========================================================================
//  SINCRONIZAÇÃO DE CONTAS E ORDENS DO SUPABASE
// =========================================================================
async function syncBrokerAccountsFromDb() {
  if (!supabase || isSyncingAccounts) return;
  isSyncingAccounts = true;
  try {
    const { data, error } = await supabase
      .from('painelvm_broker_accounts')
      .select('id, user_id, account_type, platform, account_name, send_localhost');

    if (!error && Array.isArray(data)) {
      const map = new Map();
      for (const acc of data) {
        map.set(acc.id, acc);
      }
      brokerAccountsMap = map;
    }
  } catch (err) {
    console.warn(`[HUB-ACCOUNTS] Falha ao sincronizar contas:`, err.message);
  } finally {
    isSyncingAccounts = false;
  }
}

async function syncActiveOrdersFromDb() {
  if (!supabase || isSyncingOrders) return;
  isSyncingOrders = true;
  try {
    const { data, error } = await supabase
      .from('painelvm_strategy_reports')
      .select('*')
      .eq('status', 'Em Andamento');

    if (!error && Array.isArray(data)) {
      activeOrders = data;
      lastOrdersSyncTime = Date.now();
    }
  } catch (err) {
    console.warn(`[HUB-ORDERS] Falha ao sincronizar ordens:`, err.message);
  } finally {
    isSyncingOrders = false;
  }
}

// 🛡️ Guard Estrito: Determina se uma ordem pertence EXCLUSIVAMENTE a uma CONTA DEMO AXION
function isDemoAxionOrder(order) {
  // 1. Ordens originadas de execução NinjaTrader ou brokers externos NUNCA são monitoradas pelo Hub
  if (order.strategy_name && (order.strategy_name.includes('Execução NT8') || order.strategy_name.includes('NT8'))) {
    return false;
  }

  // 2. Se a ordem estiver vinculada a um account_id, verifica o cadastro da conta
  if (order.account_id) {
    const acc = brokerAccountsMap.get(order.account_id);
    if (acc) {
      if (acc.send_localhost === true) return false;

      const platform = (acc.platform || '').toLowerCase();
      if (platform === 'nt8' || platform === 'mt5' || platform === 'mt4') return false;

      const name = (acc.account_name || '').trim().toUpperCase();
      if (
        name.startsWith('SIM') ||
        name.startsWith('PLAYBACK') ||
        name.startsWith('FFFUNDED') ||
        name.startsWith('FFF') ||
        name.startsWith('PAAPEX') ||
        name.startsWith('APEX') ||
        name.startsWith('LFE')
      ) {
        return false;
      }

      if (acc.account_type === 'internal_demo' || platform === 'axion') return true;
    }
  }

  // 3. Ordens internas de simulação Axion
  return true;
}

// Sync inicial e loops periódicos
syncBrokerAccountsFromDb();
syncActiveOrdersFromDb();
setInterval(syncBrokerAccountsFromDb, 10000);
setInterval(syncActiveOrdersFromDb, 3000);

// =========================================================================
//  MOTOR DE AVALIAÇÃO DE ORDENS EM ANDAMENTO (STOP / TAKE / TRAILING)
// =========================================================================
async function evaluateSingleOrder(order, price, candleHigh, candleLow) {
  const entryPrice = parseNum(order.entry_price) || 0;
  if (!price || price <= 0 || !entryPrice || entryPrice <= 0) return false;

  // 🛡️ Trava de Segurança: se cotação de mercado divergir > 10% do preço de entrada, é outro ativo
  if (Math.abs(price - entryPrice) / entryPrice > 0.10) {
    return false;
  }

  const evalHigh = Math.max(candleHigh || price, price);
  const evalLow = Math.min(candleLow || price, price);

  const tpTol = 0.10;
  const slTol = 0.05;

  const alvoPrice = parseNum(order.take_profit);
  let effectiveStopLoss = parseNum(order.stop_loss);

  // 1. Auto-Breakeven e Trailing Stop (ATM)
  let beTrigger = 0;
  let beOffset = 0;
  let trailTrigger = 0;
  let trailStep = 0;

  if (order.description) {
    const beMatch = order.description.match(/BE:\s*(\d+(?:\.\d+)?)(?:\s*\+\s*(\d+(?:\.\d+)?))?/i);
    if (beMatch) {
      beTrigger = Number(beMatch[1]) || 0;
      beOffset = beMatch[2] !== undefined ? (Number(beMatch[2]) || 0) : 0;
    }
    const trailMatch = order.description.match(/TRAIL:\s*(\d+(?:\.\d+)?)\s*(?:\/|\s)\s*(\d+(?:\.\d+)?)/i);
    if (trailMatch) {
      trailTrigger = Number(trailMatch[1]) || 0;
      trailStep = Number(trailMatch[2]) || 0;
    }
  }

  if (entryPrice > 0 && (beTrigger > 0 || (trailTrigger > 0 && trailStep > 0))) {
    if (order.side === 'COMPRA') {
      const currentGainPts = price - entryPrice;
      const maxGainPts = Math.max(currentGainPts, evalHigh > 0 ? evalHigh - entryPrice : currentGainPts);
      let candidateStop = null;

      if (beTrigger > 0 && maxGainPts >= beTrigger) {
        candidateStop = entryPrice + beOffset;
      }
      if (trailTrigger > 0 && trailStep > 0 && maxGainPts >= trailTrigger) {
        const steps = Math.floor((maxGainPts - trailTrigger) / trailStep);
        const targetTrail = entryPrice + (trailTrigger - trailStep) + (steps * trailStep);
        candidateStop = candidateStop === null ? targetTrail : Math.max(candidateStop, targetTrail);
      }

      if (candidateStop !== null && (effectiveStopLoss === null || candidateStop > effectiveStopLoss)) {
        effectiveStopLoss = candidateStop;
        order.stop_loss = candidateStop;
        if (supabase) {
          supabase.from('painelvm_strategy_reports').update({ stop_loss: candidateStop }).eq('id', order.id).catch(() => {});
        }
      }
    } else if (order.side === 'VENDA') {
      const currentGainPts = entryPrice - price;
      const maxGainPts = Math.max(currentGainPts, evalLow > 0 ? entryPrice - evalLow : currentGainPts);
      let candidateStop = null;

      if (beTrigger > 0 && maxGainPts >= beTrigger) {
        candidateStop = entryPrice - beOffset;
      }
      if (trailTrigger > 0 && trailStep > 0 && maxGainPts >= trailTrigger) {
        const steps = Math.floor((maxGainPts - trailTrigger) / trailStep);
        const targetTrail = entryPrice - (trailTrigger - trailStep) + (steps * trailStep);
        candidateStop = candidateStop === null ? targetTrail : Math.min(candidateStop, targetTrail);
      }

      if (candidateStop !== null && (effectiveStopLoss === null || candidateStop < effectiveStopLoss)) {
        effectiveStopLoss = candidateStop;
        order.stop_loss = candidateStop;
        if (supabase) {
          supabase.from('painelvm_strategy_reports').update({ stop_loss: candidateStop }).eq('id', order.id).catch(() => {});
        }
      }
    }
  }

  // 2. Avaliação de Take Profit e Stop Loss
  let isResolved = false;
  let resolveReason = '';
  let exitExecutedPrice = price;

  if (order.side === 'COMPRA') {
    if (alvoPrice !== null && alvoPrice > 0 && (price >= (alvoPrice - tpTol) || evalHigh >= (alvoPrice - tpTol))) {
      isResolved = true;
      exitExecutedPrice = alvoPrice;
      resolveReason = `Alvo atingido no preço ${exitExecutedPrice.toFixed(2)} (Alvo: ${alvoPrice.toFixed(2)})`;
    } else if (effectiveStopLoss !== null && effectiveStopLoss > 0 && (price <= (effectiveStopLoss + slTol) || evalLow <= (effectiveStopLoss + slTol))) {
      isResolved = true;
      exitExecutedPrice = effectiveStopLoss;
      const isGain = entryPrice > 0 && effectiveStopLoss > entryPrice;
      const isBe = entryPrice > 0 && Math.abs(effectiveStopLoss - entryPrice) < 0.01;
      const stopTypeLabel = isGain ? 'Stop Gain' : (isBe ? 'Break-Even' : 'Stop Loss');
      resolveReason = `${stopTypeLabel} atingido no preço ${exitExecutedPrice.toFixed(2)} (Stop: ${effectiveStopLoss.toFixed(2)})`;
    }
  } else if (order.side === 'VENDA') {
    if (alvoPrice !== null && alvoPrice > 0 && (price <= (alvoPrice + tpTol) || evalLow <= (alvoPrice + tpTol))) {
      isResolved = true;
      exitExecutedPrice = alvoPrice;
      resolveReason = `Alvo atingido no preço ${exitExecutedPrice.toFixed(2)} (Alvo: ${alvoPrice.toFixed(2)})`;
    } else if (effectiveStopLoss !== null && effectiveStopLoss > 0 && (price >= (effectiveStopLoss - slTol) || evalHigh >= (effectiveStopLoss - slTol))) {
      isResolved = true;
      exitExecutedPrice = effectiveStopLoss;
      const isGain = entryPrice > 0 && effectiveStopLoss < entryPrice;
      const isBe = entryPrice > 0 && Math.abs(effectiveStopLoss - entryPrice) < 0.01;
      const stopTypeLabel = isGain ? 'Stop Gain' : (isBe ? 'Break-Even' : 'Stop Loss');
      resolveReason = `${stopTypeLabel} atingido no preço ${exitExecutedPrice.toFixed(2)} (Stop: ${effectiveStopLoss.toFixed(2)})`;
    }
  }

  if (isResolved) {
    const isProfit = order.side === 'COMPRA'
      ? (entryPrice > 0 && exitExecutedPrice > entryPrice)
      : (entryPrice > 0 && exitExecutedPrice < entryPrice);
    const status = (resolveReason.includes('Alvo') || resolveReason.includes('Gain') || isProfit) ? 'Gain' : 'Stop';
    const closedAt = new Date().toISOString();

    totalOrdersClosedByServer++;
    console.log(`🏁 [SERVER-MONITOR] ✅ Ordem Demo Axion Encerrada com Sucesso!`);
    console.log(`   ID: ${order.id} | Conta: ${order.account_name || order.account_id || 'Demo Axion'} | Estratégia: ${order.strategy_name} [${order.side}]`);
    console.log(`   Resultado: ${status} @ ${exitExecutedPrice} | Motivo: ${resolveReason}`);

    // Atualizar Supabase de forma estritamente idempotente
    if (supabase) {
      supabase
        .from('painelvm_strategy_reports')
        .update({
          status,
          exit_price: exitExecutedPrice,
          closed_at: closedAt
        })
        .eq('id', order.id)
        .eq('status', 'Em Andamento')
        .then(({ error }) => {
          if (error) console.error(`❌ [SERVER-MONITOR] Erro Supabase ao fechar ordem ${order.id}:`, error.message);
        })
        .catch(err => console.error(`❌ [SERVER-MONITOR] Exceção Supabase:`, err.message));
    }

    // Notificar todos os clientes via WebSocket
    broadcast({
      type: 'strategy_report_closed',
      data: {
        id: order.id,
        status,
        exit_price: exitExecutedPrice,
        closed_at: closedAt,
        strategy_name: order.strategy_name,
        side: order.side,
        reason: resolveReason
      }
    });

    return true;
  }

  return false;
}

// Avaliação rápida com dados de stream em memória
function evaluateOrdersWithStream(instanceId, rawPrice, candleObj) {
  if (activeOrders.length === 0) return;
  const price = parseNum(rawPrice);
  if (!price || price <= 0) return;

  const candleHigh = (candleObj && parseNum(candleObj.high)) ? (parseNum(candleObj.high) || price) : price;
  const candleLow = (candleObj && parseNum(candleObj.low)) ? (parseNum(candleObj.low) || price) : price;

  const remaining = [];
  for (const order of activeOrders) {
    if (!isDemoAxionOrder(order)) {
      remaining.push(order);
      continue;
    }

    // Match de instância / símbolo
    const orderSym = normalizeSymbol(order.symbol);
    const instSym = normalizeSymbol(instanceId);
    const isInstMatch = order.instance_id === instanceId || !order.instance_id || instanceId === 'painel_principal' || instanceId === 'painel_principal_web';
    const isSymMatch = !orderSym || !instSym || orderSym === instSym;

    if (isInstMatch || isSymMatch) {
      evaluateSingleOrder(order, price, candleHigh, candleLow).then(closed => {
        if (!closed) remaining.push(order);
      });
    } else {
      remaining.push(order);
    }
  }
}

// Loop periódico que consulta os candles de 1m no Supabase para garantir 100% de cobertura
setInterval(async () => {
  if (activeOrders.length === 0 || !supabase) return;

  try {
    // Buscar as últimas velas de cada painel gravadas no Supabase
    const { data: latestCandles, error } = await supabase
      .from('painelvm_candles_1m')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(30);

    if (error || !Array.isArray(latestCandles) || latestCandles.length === 0) return;

    for (const order of [...activeOrders]) {
      if (!isDemoAxionOrder(order)) continue;

      const orderNormSym = normalizeSymbol(order.symbol);
      const orderCreatedMs = new Date(order.created_at || Date.now()).getTime();

      // Encontrar candles correspondentes formados desde a criação da ordem
      const matching = latestCandles.filter(c => {
        const cSym = normalizeSymbol(c.symbol || c.instance_id);
        const cMs = new Date(c.timestamp).getTime();
        const symMatch = !orderNormSym || !cSym || orderNormSym === cSym || (c.instance_id && order.instance_id && c.instance_id === order.instance_id);
        return symMatch && (!isNaN(cMs) && cMs >= (orderCreatedMs - 60000));
      });

      if (matching.length > 0) {
        // Pega a vela mais recente para avaliar o preço atual
        const latest = matching[0];
        const lastClose = parseNum(latest.close) || 0;
        const latestHigh = parseNum(latest.high) || lastClose;
        const latestLow = parseNum(latest.low) || lastClose;

        if (lastClose > 0) {
          const wasClosed = await evaluateSingleOrder(order, lastClose, latestHigh, latestLow);
          if (wasClosed) {
            activeOrders = activeOrders.filter(o => o.id !== order.id);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[HUB-CANDLE-SCAN] Erro ao escanear candles do banco:', err.message);
  }
}, 2000);

// =========================================================================
//  CRIAÇÃO DO SERVIDOR HTTP
// =========================================================================
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname === '/health' || pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const memory = process.memoryUsage();
    res.end(JSON.stringify({
      status: 'online',
      service: 'Axion WebSocket Hub & MetaTrader Gateway',
      version: '3.4.0',
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      connected_clients: wss.clients.size,
      connected_accounts_count: mt4AccountsConnected.size,
      connected_accounts: Array.from(mt4AccountsConnected.entries()).map(([acc, info]) => ({ account: acc, ...info })),
      active_orders_monitored: activeOrders.length,
      orders_closed_by_server: totalOrdersClosedByServer,
      last_orders_sync_ago_sec: lastOrdersSyncTime > 0 ? Math.floor((Date.now() - lastOrdersSyncTime) / 1000) : null,
      messages_received: totalMessagesReceived,
      broadcasts_sent: totalBroadcastsSent,
      cached_instances: Array.from(marketDataCache.keys()),
      quotes: Object.fromEntries(mt4QuotesCache),
      memory_rss_mb: (memory.rss / (1024 * 1024)).toFixed(2),
      memory_heap_mb: (memory.heapUsed / (1024 * 1024)).toFixed(2)
    }, null, 2));
    return;
  }

// --- ROTAS DO CONECTOR METATRADER 4 / METATRADER 5 (PORTA 80 PADRÃO) ---
function cleanAccountNumber(acc) {
  if (!acc) return '';
  const str = String(acc).trim();
  // Limpa prefixos como MT4-, MT5-, #, etc.
  const digits = str.replace(/\D/g, '');
  // Contas reais MT4 e MT5 são obrigatoriamente numéricas com 4 a 12 dígitos
  if (digits.length >= 4 && digits.length <= 12) {
    return digits;
  }
  return '';
}

// Rotina contínua de limpeza de contas fantasmas e conexões inativas (sem heartbeat por >60s)
setInterval(() => {
  const now = Date.now();
  for (const [acc, info] of mt4AccountsConnected.entries()) {
    const isNumeric = /^\d{4,12}$/.test(String(acc));
    const ageMs = now - (info?.lastSeen ? new Date(info.lastSeen).getTime() : 0);
    if (!isNumeric || ageMs > 60000) {
      mt4AccountsConnected.delete(acc);
      mt4PositionsCache.delete(acc);
      mt4TradesHistoryCache.delete(acc);
    }
  }
}, 15000);

function getMt4Queue(accNum) {
  const clean = cleanAccountNumber(accNum);
  if (clean && mt4PendingCommands.has(clean) && mt4PendingCommands.get(clean).length > 0) {
    return mt4PendingCommands.get(clean);
  }
  if (accNum && mt4PendingCommands.has(accNum) && mt4PendingCommands.get(accNum).length > 0) {
    return mt4PendingCommands.get(accNum);
  }
  if (clean && mt4PendingCommands.has(`4${clean}`) && mt4PendingCommands.get(`4${clean}`).length > 0) {
    return mt4PendingCommands.get(`4${clean}`);
  }
  return mt4PendingCommands.get('all') || [];
}

// 1. GET ou POST /commands (MT4 faz polling de ordens, sincroniza saldo e posições abertas)
if ((req.method === 'GET' || req.method === 'POST') && pathname === '/commands') {
  let body = '';
  const handleCommandsHub = () => {
    let bodyData = {};
    try { bodyData = JSON.parse(body || '{}'); } catch {}

    const rawAcc = String(bodyData.account || url.searchParams.get('account') || '').trim();
    const accNum = cleanAccountNumber(rawAcc);
    if (accNum) {
      const balance = parseFloat(url.searchParams.get('balance') || bodyData.balance || '0');
      const equity = parseFloat(url.searchParams.get('equity') || bodyData.equity || '0');
      let broker = url.searchParams.get('broker') || bodyData.broker || 'MetaTrader 4';
      try { broker = decodeURIComponent(broker); } catch (_) {}
      const currency = url.searchParams.get('currency') || bodyData.currency || 'USD';
      const isDemo = url.searchParams.get('demo') === '1' || bodyData.demo === '1' || bodyData.demo === true;
      const leverage = parseInt(url.searchParams.get('leverage') || bodyData.leverage || '100', 10);

      const rawSymbols = url.searchParams.get('symbols') || url.searchParams.get('market_watch') || '';
      const existing = mt4AccountsConnected.get(accNum) || mt4AccountsConnected.get(rawAcc) || {};
      const parsedSymbols = rawSymbols ? rawSymbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : (existing.symbols || []);

      const accInfo = {
        account: accNum,
        account_name: `MT4 #${accNum}`,
        balance: balance > 0 ? balance : (existing.balance || 0),
        equity: equity > 0 ? equity : (existing.equity || 0),
        broker: broker || existing.broker || 'MetaTrader 4',
        currency: currency || existing.currency || 'USD',
        is_demo: isDemo,
        leverage: leverage || existing.leverage || 100,
        lastSeen: new Date().toISOString(),
        symbol: url.searchParams.get('symbol') || existing.symbol || 'ACTIVE',
        symbols: parsedSymbols.length > 0 ? parsedSymbols : (existing.symbols || [])
      };
      mt4AccountsConnected.set(accNum, accInfo);

      if (Array.isArray(bodyData.positions)) {
        mt4PositionsCache.set(accNum, bodyData.positions);
      }
      if (Array.isArray(bodyData.history)) {
        mt4TradesHistoryCache.set(accNum, bodyData.history);
      }

      // Suporte a lote de cotações enviado no body de /commands para todos os ativos do Market Watch
      if (Array.isArray(bodyData.quotes)) {
        for (const item of bodyData.quotes) {
          const sym = (item.symbol || '').toUpperCase();
          const qObj = buildRealQuote(sym, item);
          if (qObj) {
            mt4QuotesCache.set(sym, qObj);
            broadcast({
              type: 'market_data',
              instance_id: sym.toLowerCase(),
              symbol: sym,
              data: qObj,
              ts_relay: Date.now()
            });
          }
        }
      }

      const qSym = (url.searchParams.get('symbol') || bodyData.symbol || existing.symbol || '').toUpperCase();
      const qBid = Number(url.searchParams.get('bid') || bodyData.bid || 0);
      const qAsk = Number(url.searchParams.get('ask') || bodyData.ask || 0);
      const qReal = buildRealQuote(qSym, { bid: qBid, ask: qAsk, price: qBid, volume: 1, updated_at: new Date().toISOString() });
      if (qReal) {
        mt4QuotesCache.set(qSym, qReal);
      }
    }

    const queue = getMt4Queue(accNum);
    if (queue.length > 0) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(queue[0]));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({}));
  };

    if (req.method === 'POST') {
      req.on('data', chunk => { body += chunk; });
      req.on('end', handleCommandsHub);
    } else {
      handleCommandsHub();
    }
    return;
  }

  // 1.01 GET ou POST /positions: Retorna ou salva posições ativas da conta
  if (pathname === '/positions' || pathname === '/mt4/positions') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const pData = JSON.parse(body || '{}');
          const accNum = String(pData.account || url.searchParams.get('account') || '').trim();
          if (accNum && Array.isArray(pData.positions)) {
            mt4PositionsCache.set(accNum, pData.positions);
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
    const accNum = String(url.searchParams.get('account') || '').trim().replace(/\D/g, '') || String(url.searchParams.get('account') || '').trim();
    let posList = [];
    if (accNum && mt4PositionsCache.has(accNum)) {
      posList = mt4PositionsCache.get(accNum);
    } else if (mt4PositionsCache.size > 0) {
      posList = Array.from(mt4PositionsCache.values())[0] || [];
    }
    res.end(JSON.stringify({
      success: true,
      account: accNum,
      positions: posList,
      total: posList.length
    }));
    return;
  }

  // 1.02 GET /trades ou /mt4/trades: Retorna histórico de ordens fechadas da conta
  if (req.method === 'GET' && (pathname === '/trades' || pathname === '/mt4/trades')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const accNum = String(url.searchParams.get('account') || '').trim().replace(/\D/g, '') || String(url.searchParams.get('account') || '').trim();
    let historyList = [];
    if (accNum && mt4TradesHistoryCache.has(accNum)) {
      historyList = mt4TradesHistoryCache.get(accNum);
    } else if (mt4TradesHistoryCache.size > 0) {
      historyList = Array.from(mt4TradesHistoryCache.values())[0] || [];
    }
    res.end(JSON.stringify({
      success: true,
      account: accNum,
      trades: historyList,
      total: historyList.length
    }));
    return;
  }

  // 1.1 GET /accounts ou /mt4/accounts: Retorna lista de contas reais detectadas para sincronização
  if (req.method === 'GET' && (pathname === '/accounts' || pathname === '/mt4/accounts')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const accList = [];
    const now = Date.now();
    for (const [acc, info] of mt4AccountsConnected.entries()) {
      const isNumeric = /^\d{4,12}$/.test(String(acc));
      const ageMs = now - (info?.lastSeen ? new Date(info.lastSeen).getTime() : 0);
      if (!isNumeric || ageMs > 60000) {
        mt4AccountsConnected.delete(acc);
        continue;
      }
      accList.push({
        id: acc,
        account_number: acc,
        name: `MT4 #${acc}`,
        cashValue: info.balance || 0,
        balance: info.balance || 0,
        equity: info.equity || 0,
        buyingPower: info.equity || info.balance || 0,
        broker: info.broker || 'MetaTrader 4',
        currency: info.currency || 'USD',
        isDemo: info.is_demo !== false,
        isConnected: true,
        platform: 'mt4',
        symbols: info.symbols || [],
        positions: mt4PositionsCache.get(acc) || [],
        trades: mt4TradesHistoryCache.get(acc) || [],
        lastSeen: info.lastSeen
      });
    }
    res.end(JSON.stringify({ accounts: accList }));
    return;
  }

  // 1.1b POST /accounts/cleanup: Força a purga imediata de contas fantasmas e reseta o cache de contas
  if (req.method === 'POST' && (pathname === '/accounts/cleanup' || pathname === '/mt4/accounts/cleanup')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const purged = [];
    const now = Date.now();
    for (const [acc, info] of mt4AccountsConnected.entries()) {
      const isNumeric = /^\d{4,12}$/.test(String(acc));
      const ageMs = now - (info?.lastSeen ? new Date(info.lastSeen).getTime() : 0);
      if (!isNumeric || ageMs > 30000) {
        purged.push(acc);
        mt4AccountsConnected.delete(acc);
        mt4PositionsCache.delete(acc);
        mt4TradesHistoryCache.delete(acc);
      }
    }
    res.end(JSON.stringify({ success: true, purged, remaining: Array.from(mt4AccountsConnected.keys()) }));
    return;
  }

  // 1.2 GET /symbols ou /mt4/symbols: Retorna lista de símbolos detectados e símbolos padrão do broker
  if (req.method === 'GET' && (pathname === '/symbols' || pathname === '/mt4/symbols')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const allDetectedSymbols = new Set();
    for (const [, info] of mt4AccountsConnected.entries()) {
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
      detected_symbols: Array.from(allDetectedSymbols),
      standard_symbols: standardForexList,
      total_detected: allDetectedSymbols.size
    }));
    return;
  }

  // 2. POST /command_ack (MT4 confirma execução de comando)
  if (req.method === 'POST' && pathname === '/command_ack') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const cmdId = payload.id;
        const rawAcc = String(payload.account || '').trim();
        const accNum = cleanAccountNumber(rawAcc);
        const status = payload.status;
        const reason = payload.reason || '';

        console.log(`✅ [MT4-HUB] Ordem ${cmdId} confirmada pelo MT4 (${accNum}) status: ${status} ${reason ? `motivo: ${reason}` : ''}`);

        [accNum, rawAcc, `4${accNum}`, 'all'].forEach(k => {
          if (k && mt4PendingCommands.has(k)) {
            const list = mt4PendingCommands.get(k).filter(c => c.id !== cmdId);
            mt4PendingCommands.set(k, list);
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 3. POST /streamer (Recebe ticks e candles do MT4)
  if (req.method === 'POST' && pathname === '/streamer') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');

        // Suporte a lote de cotações de todos os ativos do Market Watch
        if (Array.isArray(data.quotes) || Array.isArray(data)) {
          const list = Array.isArray(data.quotes) ? data.quotes : data;
          for (const item of list) {
            const sym = (item.symbol || '').toUpperCase();
            const qObj = buildRealQuote(sym, item);
            if (qObj) {
              mt4QuotesCache.set(sym, qObj);
              broadcast({
                type: 'market_data',
                instance_id: sym.toLowerCase(),
                symbol: sym,
                data: qObj,
                ts_relay: Date.now()
              });
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, count: list.length }));
          return;
        }

        const sym = (data.symbol || '').toUpperCase();
        if (sym) {
          // Só atualiza o cache de cotação com Bid/Ask reais; tick sem Ask NÃO apaga o último par real
          const realTick = buildRealQuote(sym, data);
          if (realTick) mt4QuotesCache.set(sym, realTick);

          // Também repassa para o broadcast WebSocket do VortexWeb
          broadcast({
            type: data.type || 'market_data',
            instance_id: data.panel || sym.toLowerCase(),
            symbol: sym,
            data: data,
            ts_relay: Date.now()
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

  // 4. POST /order (VortexWeb envia ordem para o MT4)
  if (req.method === 'POST' && (pathname === '/order' || pathname === '/send_order')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const rawAcc = String(payload.account || payload.account_name || 'all').trim();
        const accNum = cleanAccountNumber(rawAcc);
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

        [accNum, rawAcc, 'all'].forEach(k => {
          if (k) {
            if (!mt4PendingCommands.has(k)) mt4PendingCommands.set(k, []);
            if (cmd.action === 'modify' || cmd.action === 'modify_order' || cmd.action === 'levels') {
              const filtered = mt4PendingCommands.get(k).filter(c => !(c.action === cmd.action && (c.ticket === cmd.ticket || c.symbol === cmd.symbol)));
              filtered.push(cmd);
              mt4PendingCommands.set(k, filtered);
            } else {
              mt4PendingCommands.get(k).push(cmd);
            }
          }
        });

        console.log(`🚀 [MT4-HUB] Ordem enfileirada para MT4 (${accNum} / ${rawAcc}):`, cmd);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, command_id: cmdId }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 5. GET /quotes (Cotações MT4)
  if (req.method === 'GET' && pathname === '/quotes') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Object.fromEntries(mt4QuotesCache)));
    return;
  }

  // 5.1 GET /market_candles: Retorna histórico de candles M1 para Forex, Metais e Índices
  if (req.method === 'GET' && pathname === '/market_candles') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const rawSym = String(url.searchParams.get('symbol') || 'EURUSD').toUpperCase().split(/[-_(\s]/)[0].trim().replace(/[^A-Z0-9]/g, '');
    const limit = Math.min(2000, Math.max(50, Number(url.searchParams.get('limit') || 1000)));

    // Para índices, ouro e petróleo alimentados em tempo real no Supabase (0 delay),
    // consulta diretamente painelvm_candles_1m em vez do Yahoo Finance (que tem 10 min de delay em futuros CME)
    const supabaseInstanceMap = {
      'USTEC': 'painel_principal_web',
      'USATEC': 'painel_principal_web',
      'NAS100': 'painel_principal_web',
      'US100': 'painel_principal_web',
      'NQ': 'painel_principal_web',
      'MNQ': 'painel_principal_web',
      'US500': 'painel_sp500_web',
      'USA500': 'painel_sp500_web',
      'SP500': 'painel_sp500_web',
      'SPX500': 'painel_sp500_web',
      'ES': 'painel_sp500_web',
      'MES': 'painel_sp500_web',
      'US30': 'painel_us30_web',
      'USAIND': 'painel_us30_web',
      'DJ30': 'painel_us30_web',
      'YM': 'painel_us30_web',
      'MYM': 'painel_us30_web',
      'US2000': 'painel_m2k_web',
      'USARUS': 'painel_m2k_web',
      'RTY': 'painel_m2k_web',
      'M2K': 'painel_m2k_web',
      'XAUUSD': 'painel_gold_web',
      'GOLD': 'painel_gold_web',
      'GC': 'painel_gold_web',
      'MGC': 'painel_gold_web',
      'USOIL': 'painel_cl_web',
      'WTI': 'painel_cl_web',
      'LCRUDE': 'painel_cl_web',
      'CL': 'painel_cl_web',
      'MCL': 'painel_cl_web'
    };

    const sbInst = supabaseInstanceMap[rawSym];
    if (sbInst && supabase) {
      supabase
        .from('painelvm_candles_1m')
        .select('timestamp, open, high, low, close, volume')
        .eq('instance_id', sbInst)
        .order('timestamp', { ascending: false })
        .limit(Math.min(1000, limit))
        .then(({ data, error }) => {
          if (!error && Array.isArray(data) && data.length > 0) {
            const mapped = data
              .map(c => {
                const tMs = new Date(c.timestamp).getTime();
                if (isNaN(tMs)) return null;
                return {
                  timestamp: new Date(tMs - 60000).toISOString(),
                  open: Number(c.open),
                  high: Number(c.high),
                  low: Number(c.low),
                  close: Number(c.close),
                  volume: Number(c.volume || 1)
                };
              })
              .filter(Boolean)
              .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(mapped));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([]));
          }
        })
        .catch(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([]));
        });
      return;
    }

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
      'US30': 'YM=F',
      'DJ30': 'YM=F',
      'USAIND': 'YM=F',
      'US500': 'ES=F',
      'SP500': 'ES=F',
      'USA500': 'ES=F',
      'USTEC': 'NQ=F',
      'NAS100': 'NQ=F',
      'USATEC': 'NQ=F',
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
        const candlesMap = new Map();

        for (let i = 0; i < timestamps.length; i++) {
          const cClose = q.close[i];
          if (cClose === null || cClose === undefined || isNaN(cClose) || cClose <= 0) continue;
          const cOpen = q.open[i] ?? cClose;
          const cHigh = q.high[i] ?? Math.max(cOpen, cClose);
          const cLow = q.low[i] ?? Math.min(cOpen, cClose);
          const cVol = q.volume?.[i] ?? 1;

          // Cravamento exato na virada do minuto (:00.000Z)
          const flooredSec = Math.floor(timestamps[i] / 60) * 60;
          const flooredIso = new Date(flooredSec * 1000).toISOString();

          const existing = candlesMap.get(flooredSec);
          if (!existing) {
            candlesMap.set(flooredSec, {
              timestamp: flooredIso,
              open: Number(cOpen),
              high: Number(cHigh),
              low: Number(cLow),
              close: Number(cClose),
              volume: Number(cVol)
            });
          } else {
            // Mescla snapshot intra-minuto recente do Yahoo no mesmo candle
            existing.high = Math.max(existing.high, Number(cHigh));
            existing.low = Math.min(existing.low, Number(cLow));
            existing.close = Number(cClose);
            existing.volume += Number(cVol);
          }
        }

        const candles = Array.from(candlesMap.values());
        const sliced = candles.slice(-limit);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sliced));
      })
      .catch(err => {
        console.warn(`[MARKET CANDLES] Erro ao buscar klines para ${rawSym}:`, err.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
      });
    return;
  }

  // 6. POST /ctrader_fix/test: Testa conexão e credenciais FIX com o cTrader / Pepperstone
  if (req.method === 'POST' && pathname === '/ctrader_fix/test') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const host = String(payload.host || 'demo.cfixapi.com:5212').trim();
        const [cleanHost, portStr] = host.split(':');
        const port = Number(portStr) || 5212;
        const senderCompId = String(payload.senderCompId || payload.account || '').trim();
        const password = String(payload.password || '').trim();

        if (!senderCompId || !password) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SenderCompID e Senha da conta são obrigatórios.' }));
          return;
        }

        const tls = require('tls');
        const socket = tls.connect(port, cleanHost, { rejectUnauthorized: false }, () => {
          // Constrói Logon FIX 4.4
          const nowStr = new Date().toISOString().replace(/\.\d+Z$/, '').replace(/[-:]/g, '').replace('T', '-');
          const fixBody = `35=A\x0149=${senderCompId}\x0156=cServer\x0134=1\x0152=${nowStr}\x0198=0\x01108=30\x01553=${senderCompId}\x01554=${password}\x01`;
          const rawNoCs = `8=FIX.4.4\x019=${fixBody.length}\x01${fixBody}`;
          let sum = 0;
          for (let i = 0; i < rawNoCs.length; i++) sum += rawNoCs.charCodeAt(i);
          const checksum = String(sum % 256).padStart(3, '0');
          socket.write(`${rawNoCs}10=${checksum}\x01`);
        });

        socket.setTimeout(4000);
        let responded = false;

        socket.on('data', data => {
          if (responded) return;
          responded = true;
          const str = data.toString();
          socket.destroy();

          const isLogonOk = str.includes('35=A');
          const isReject = str.includes('35=5') || str.includes('35=3');
          const reasonMatch = str.match(/58=([^]+)/);
          const reason = reasonMatch ? reasonMatch[1] : (isReject ? 'Credenciais FIX rejeitadas pelo cServer' : '');

          if (isLogonOk || !isReject) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              online: true,
              message: `Logon FIX Aceito pelo cServer (${cleanHost}:${port})`,
              account: senderCompId.split('.').pop() || senderCompId
            }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              online: false,
              error: reason || 'Falha de autenticação FIX na corretora'
            }));
          }
        });

        socket.on('timeout', () => {
          if (responded) return;
          responded = true;
          socket.destroy();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            online: false,
            error: `Timeout ao aguardar resposta do servidor FIX (${cleanHost}:${port})`
          }));
        });

        socket.on('error', err => {
          if (responded) return;
          responded = true;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            online: false,
            error: `Erro ao conectar no servidor FIX: ${err.message}`
          }));
        });

      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/orders/sync') {
    Promise.all([syncBrokerAccountsFromDb(), syncActiveOrdersFromDb()]).then(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, active_orders_count: activeOrders.length }));
    }).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  if (req.method === 'GET' && (pathname === '/sinal_local' || pathname === '/market_data')) {
    const instanceId = url.searchParams.get('instance_id') || 'painel_principal';
    const cached = marketDataCache.get(instanceId) || marketDataCache.get('default') || null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cached || { status: 'waiting_data' }));
    return;
  }

  // --- ROTAS DA API DE MACHINE LEARNING & REMODELAGEM DE PADRÕES ---
  if (req.method === 'GET' && pathname === '/api/ml/studies') {
    let data = {};
    if (fs.existsSync(ML_REGISTRY_PATH)) {
      try {
        data = JSON.parse(fs.readFileSync(ML_REGISTRY_PATH, 'utf-8'));
      } catch (e) {}
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, studies: data }));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/ml/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mlRunState));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/ml/schedule') {
    let sched = { enabled: false, time: '18:15', assets: ['NQ', 'ES', 'GC'] };
    if (fs.existsSync(ML_SCHEDULE_PATH)) {
      try {
        sched = JSON.parse(fs.readFileSync(ML_SCHEDULE_PATH, 'utf-8'));
      } catch (e) {}
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(sched));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/ml/asset_range') {
    const symbol = (url.searchParams.get('symbol') || 'NQ').toUpperCase();
    (async () => {
      try {
        let firstTs = null;
        let lastTs = null;
        let totalCandles = 0;

        if (supabase) {
          const resFirst = await supabase.from('painelvm_candles_1m')
            .select('timestamp')
            .ilike('symbol', `%${symbol}%`)
            .order('timestamp', { ascending: true })
            .limit(1);
          if (resFirst.data && resFirst.data.length > 0) {
            firstTs = resFirst.data[0].timestamp;
          }

          const resLast = await supabase.from('painelvm_candles_1m')
            .select('timestamp')
            .ilike('symbol', `%${symbol}%`)
            .order('timestamp', { ascending: false })
            .limit(1);
          if (resLast.data && resLast.data.length > 0) {
            lastTs = resLast.data[0].timestamp;
          }

          const resCount = await supabase.from('painelvm_candles_1m')
            .select('*', { count: 'exact', head: true })
            .ilike('symbol', `%${symbol}%`);
          totalCandles = resCount.count || 0;
        }

        // Fallback para cache de CSV local caso Supabase não responda
        if (!firstTs) {
          const csvFile = path.join(__dirname, '..', 'ml_pipeline', `${symbol.toLowerCase()}_candles_1m.csv`);
          if (fs.existsSync(csvFile)) {
            const lines = fs.readFileSync(csvFile, 'utf-8').trim().split('\n');
            if (lines.length > 1) {
              firstTs = lines[1].split(',')[0];
              lastTs = lines[lines.length - 1].split(',')[0];
              totalCandles = lines.length - 1;
            }
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          symbol,
          data_start: firstTs || 'Sem dados',
          data_end: lastTs || 'Sem dados',
          total_candles: totalCandles
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    })();
    return;
  }

  if (req.method === 'POST' && pathname === '/api/ml/schedule') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        fs.writeFileSync(ML_SCHEDULE_PATH, JSON.stringify(parsed, null, 2), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Agendamento salvo com sucesso' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/ml/run_study') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const symbol = parsed.symbol || 'NQ';
        const config = parsed.config || null;
        const epochs = parsed.epochs || 10;
        const fetchDb = parsed.fetch_db !== false;

        const customParams = {
          model_name: parsed.model_name || '',
          tp_points: parsed.tp_points,
          sl_points: parsed.sl_points
        };
        const started = triggerPythonAnalysis(symbol, config, epochs, fetchDb, null, customParams);
        if (started) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: `Remodelagem iniciada para ${symbol}` }));
        } else {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Já existe um teste em execução no momento' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        let parsed = null;
        if (body && body.trim().length > 0) {
          parsed = JSON.parse(body);
        }

        if (!parsed) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload JSON inválido ou vazio.' }));
          return;
        }

        const item = Array.isArray(parsed) ? parsed[0] : parsed;
        const instanceId = item.instance_id || 'painel_principal';

        totalMessagesReceived++;

        if (pathname === '/market_data' || pathname === '/sinal_local') {
          marketDataCache.set(instanceId, item);
          if (String(instanceId).startsWith('mt4_sync') && item.account) {
            const cleanAcc = cleanAccountNumber(item.account);
            if (cleanAcc) {
              marketDataCache.set(`mt4_sync_${cleanAcc}`, item);
              if (Array.isArray(item.positions)) mt4PositionsCache.set(cleanAcc, item.positions);
              if (Array.isArray(item.history)) mt4TradesCache.set(cleanAcc, item.history);
            }
            if (Array.isArray(item.quotes)) {
              for (const q of item.quotes) {
                const sym = String(q.symbol || '').toUpperCase();
                const bid = Number(q.bid || 0);
                const ask = Number(q.ask || bid);
                if (sym && bid > 0) {
                  mt4QuotesCache.set(sym, {
                    symbol: sym,
                    price: Number(q.price || bid),
                    bid,
                    ask,
                    volume: 1,
                    updated_at: q.updated_at || new Date().toISOString()
                  });
                }
              }
            }
          }
          broadcast({
            type: 'market_data',
            instance_id: instanceId,
            data: item,
            ts_relay: Date.now()
          });

          if (item.price && item.price !== '--') {
            const candle = candlesCache.get(instanceId) || null;
            evaluateOrdersWithStream(instanceId, item.price, candle);
          }
        } else if (pathname === '/nasdaq_force') {
          forceDataCache.set(instanceId, item);
          broadcast({
            type: 'nasdaq_force',
            instance_id: instanceId,
            data: item,
            ts_relay: Date.now()
          });
        } else if (pathname === '/painelvm_forces_1m' || pathname === '/forces_1m') {
          broadcast({
            type: 'painelvm_forces_1m',
            instance_id: instanceId,
            data: item,
            ts_relay: Date.now()
          });
        } else if (pathname === '/candles') {
          candlesCache.set(instanceId, item);
          broadcast({
            type: 'candle',
            instance_id: instanceId,
            data: item,
            ts_relay: Date.now()
          });

          const mData = marketDataCache.get(instanceId) || null;
          const currentP = (mData && mData.price) ? mData.price : item.close;
          evaluateOrdersWithStream(instanceId, currentP, item);
        } else {
          broadcast({
            type: 'generic',
            path: pathname,
            instance_id: instanceId,
            data: item,
            ts_relay: Date.now()
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, clients: wss.clients.size, monitored_orders: activeOrders.length }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('VortexWeb WebSocket Hub Relay & Demo Monitor v3.3');
});

const wss = new WebSocketServer({ server, path: '/ws' });

// =====================================================================
// TÚNEL PONTO-A-PONTO NINJATRADER 8 (ISOLAMENTO POR TOKEN)
// =====================================================================
const tunnelRooms = new Map();

function getOrCreateTunnelRoom(token) {
  if (!tunnelRooms.has(token)) {
    tunnelRooms.set(token, { nt8: null, webClients: new Set() });
  }
  return tunnelRooms.get(token);
}

function cleanUpTunnelSocket(ws) {
  if (ws._tunnelToken) {
    const room = tunnelRooms.get(ws._tunnelToken);
    if (room) {
      if (room.nt8 === ws) {
        room.nt8 = null;
        console.log(`[TUNNEL] 🔌 NinjaTrader desconectou do token: ${ws._tunnelToken}`);
        for (const webWs of room.webClients) {
          if (webWs.readyState === WebSocket.OPEN) {
            webWs.send(JSON.stringify({ type: 'tunnel_status', token: ws._tunnelToken, status: 'offline' }));
          }
        }
      }
      room.webClients.delete(ws);
      if (!room.nt8 && room.webClients.size === 0) {
        tunnelRooms.delete(ws._tunnelToken);
      }
    }
  }
}

function broadcast(msgObject) {
  const jsonStr = JSON.stringify(msgObject);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      // NinjaTrader no túnel não precisa nem deve receber feeds pesados de cotação de mercado
      if (client._tunnelRole === 'nt8') continue;
      client.send(jsonStr);
      totalBroadcastsSent++;
    }
  }
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  // Envia snapshots de mercado apenas para painéis web (após identificar que não é o NT8)
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN && ws._tunnelRole !== 'nt8') {
      for (const [instanceId, mData] of marketDataCache.entries()) {
        ws.send(JSON.stringify({ type: 'market_data', instance_id: instanceId, data: mData, is_snapshot: true }));
      }
      for (const [instanceId, fData] of forceDataCache.entries()) {
        ws.send(JSON.stringify({ type: 'nasdaq_force', instance_id: instanceId, data: fData, is_snapshot: true }));
      }
    }
  }, 100);

  ws.on('message', message => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      }
      if (data.type === 'sync_orders') {
        syncBrokerAccountsFromDb();
        syncActiveOrdersFromDb();
      }

      // -------------------------------------------------------------
      // REGISTRO NO TÚNEL PONTO-A-PONTO (NINJATRADER OU PAINEL WEB)
      // -------------------------------------------------------------
      if (data.type === 'tunnel_register' && data.token) {
        const cleanTok = String(data.token).trim();
        if (cleanTok.length < 6) {
          ws.send(JSON.stringify({ type: 'tunnel_ack', token: cleanTok, status: 'error', error: 'Token muito curto (minimo 6 caracteres)' }));
          return;
        }
        ws._tunnelToken = cleanTok;
        ws._tunnelRole = data.role || 'web';
        const room = getOrCreateTunnelRoom(cleanTok);

        if (ws._tunnelRole === 'nt8') {
          room.nt8 = ws;
          console.log(`[TUNNEL] 🟢 NinjaTrader 8 conectado com sucesso no token: ${cleanTok}`);
          ws.send(JSON.stringify({ type: 'tunnel_ack', token: cleanTok, role: 'nt8', status: 'online' }));
          for (const webWs of room.webClients) {
            if (webWs.readyState === WebSocket.OPEN) {
              webWs.send(JSON.stringify({ type: 'tunnel_status', token: cleanTok, status: 'online' }));
            }
          }
        } else {
          room.webClients.add(ws);
          const isNtOnline = Boolean(room.nt8 && room.nt8.readyState === WebSocket.OPEN);
          console.log(`[TUNNEL] 💻 Painel Web conectado no token: ${cleanTok} (NT8 online: ${isNtOnline ? 'SIM' : 'NÃO'})`);
          ws.send(JSON.stringify({
            type: 'tunnel_ack',
            token: cleanTok,
            role: 'web',
            status: isNtOnline ? 'online' : 'waiting'
          }));
        }
        return;
      }

      // -------------------------------------------------------------
      // COMANDO DA WEB PARA O NINJATRADER
      // -------------------------------------------------------------
      if (data.type === 'vortex_cmd' && data.token) {
        const cleanTok = String(data.token).trim();
        const room = tunnelRooms.get(cleanTok);
        if (room && room.nt8 && room.nt8.readyState === WebSocket.OPEN) {
          room.nt8.send(JSON.stringify(data));
        } else {
          ws.send(JSON.stringify({
            type: 'vortex_resp',
            id: data.id,
            token: cleanTok,
            action: data.action,
            response: null,
            error: 'NinjaTrader 8 offline para este token'
          }));
        }
        return;
      }

      // -------------------------------------------------------------
      // RESPOSTA DO NINJATRADER PARA A WEB
      // -------------------------------------------------------------
      if (data.type === 'vortex_resp' && data.token) {
        const cleanTok = String(data.token).trim();
        const room = tunnelRooms.get(cleanTok);
        if (room && room.webClients.size > 0) {
          const respStr = JSON.stringify(data);
          for (const webWs of room.webClients) {
            if (webWs.readyState === WebSocket.OPEN) {
              webWs.send(respStr);
            }
          }
        }
        return;
      }
    } catch (_) {}
  });

  ws.on('close', () => {
    cleanUpTunnelSocket(ws);
  });

  ws.on('error', () => {
    cleanUpTunnelSocket(ws);
  });
});

const heartbeatInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

server.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🚀 [VORTEX WEB-HUB] Relay & Background Demo Order Monitor v3.3 Iniciado!`);
  console.log(`📡 Porta HTTP/WS: http://localhost:${PORT}`);
  console.log(`🔌 Endpoint WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`🩺 Status / Health: http://localhost:${PORT}/health`);
  console.log('====================================================');
});
