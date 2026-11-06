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
      version: '3.3.0',
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      connected_clients: wss.clients.size,
      active_orders_monitored: activeOrders.length,
      orders_closed_by_server: totalOrdersClosedByServer,
      last_orders_sync_ago_sec: lastOrdersSyncTime > 0 ? Math.floor((Date.now() - lastOrdersSyncTime) / 1000) : null,
      messages_received: totalMessagesReceived,
      broadcasts_sent: totalBroadcastsSent,
      cached_instances: Array.from(marketDataCache.keys()),
      memory_rss_mb: (memory.rss / (1024 * 1024)).toFixed(2),
      memory_heap_mb: (memory.heapUsed / (1024 * 1024)).toFixed(2)
    }, null, 2));
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
