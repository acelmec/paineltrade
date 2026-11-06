// =====================================================================
// VORTEX GATEWAY SERVICE — COMUNICAÇÃO HÍBRIDA NINJATRADER 8
// Suporte Dual: HTTP Local (:8001) e Túnel Relay Hub WebSocket
// =====================================================================

export interface NinjaAccountDto {
  name: string;
  displayName: string;
  connection: string;
  cashValue: number;
  buyingPower: number;
  realizedPnL: number;
  unrealizedPnL: number;
  isConnected: boolean;
}

export interface NinjaStatusDto {
  status: 'online' | 'offline';
  version?: string;
  latencyMs?: number;
  transport?: 'local' | 'cloud' | 'none';
  isLicensed?: boolean;
  licenseStatus?: string;
  machineId?: string;
  idAssinatura?: string;
}

export type NinjaConnectionMode = 'local' | 'cloud' | 'auto';

export const DEFAULT_NINJA_GATEWAY_URL = 'http://localhost:8001';

export function getNinjaGatewayUrl(): string {
  if (typeof localStorage !== 'undefined') {
    const mode = localStorage.getItem('vortex_ninja_connection_mode');
    if (mode === 'local') {
      return DEFAULT_NINJA_GATEWAY_URL;
    }
    const custom = localStorage.getItem('vortex_ninja_gateway_url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
  }
  return DEFAULT_NINJA_GATEWAY_URL;
}

let lastNinjaStatusTime = 0;
let lastPositionsAndOrdersTime = 0;

export function setNinjaGatewayUrl(url: string): void {
  if (typeof localStorage !== 'undefined') {
    const trimmed = (url || '').trim().replace(/\/+$/, '');
    if (!trimmed || trimmed === DEFAULT_NINJA_GATEWAY_URL) {
      localStorage.removeItem('vortex_ninja_gateway_url');
    } else {
      localStorage.setItem('vortex_ninja_gateway_url', trimmed);
    }
  }
  lastNinjaStatusTime = 0;
  lastPositionsAndOrdersTime = 0;
}

export function getNinjaPairingToken(): string {
  if (typeof localStorage !== 'undefined') {
    const custom = localStorage.getItem('vortex_ninja_pairing_token');
    if (custom && custom.trim()) {
      return custom.trim();
    }
  }
  return '';
}

export function setNinjaPairingToken(token: string): void {
  if (typeof localStorage !== 'undefined') {
    const trimmed = (token || '').trim();
    if (!trimmed) {
      localStorage.removeItem('vortex_ninja_pairing_token');
    } else {
      localStorage.setItem('vortex_ninja_pairing_token', trimmed);
    }
  }
  reconnectCloudChannel();
  lastNinjaStatusTime = 0;
  lastPositionsAndOrdersTime = 0;
}

export function getNinjaConnectionMode(): NinjaConnectionMode {
  if (typeof localStorage !== 'undefined') {
    const mode = localStorage.getItem('vortex_ninja_connection_mode');
    if (mode === 'local' || mode === 'cloud' || mode === 'auto') {
      return mode as NinjaConnectionMode;
    }
  }
  return 'local';
}

export function setNinjaConnectionMode(mode: NinjaConnectionMode): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('vortex_ninja_connection_mode', mode);
  }
  lastNinjaStatusTime = 0;
  lastPositionsAndOrdersTime = 0;
}

let activeTransport: 'local' | 'cloud' | 'none' = 'none';

export function getNinjaActiveTransport(): 'local' | 'cloud' | 'none' {
  return activeTransport;
}

const getGatewayUrl = () => getNinjaGatewayUrl();
const REQUEST_TIMEOUT_MS = 2500;

/**
 * Determina se uma conta deve ter suas ordens enviadas ao NinjaTrader local.
 * REGRA: apenas contas com platform 'nt8' ou 'mt5' ou send_localhost=true.
 * Contas INTERNAL_DEMO, axion, demo ou sem platform definido NUNCA vão ao NinjaTrader.
 */
export function isNinjaExecutionAccount(acc: any): boolean {
  if (!acc) return false;
  // 1. Flag explícita de envio local
  if (acc.send_localhost === true) return true;

  const platform = (acc.platform || '').toLowerCase();
  if (platform === 'nt8' || platform === 'mt5') return true;

  // 2. Auto-detecção inteligente por padrão de nome de conta NinjaTrader
  const name = (acc.account_name || acc.name || '').trim().toUpperCase();
  if (
    name.startsWith('SIM') ||
    name.startsWith('PLAYBACK') ||
    name.startsWith('FFFUNDED') ||
    name.startsWith('FFF') ||
    name.startsWith('PAAPEX') ||
    name.startsWith('APEX') ||
    name.startsWith('LFE')
  ) {
    return true;
  }

  // 3. Contas estritamente axion virtuais sem flag local
  const blockedPlatforms = ['axion', 'demo', 'internal_demo'];
  const accountType = (acc.account_type || '').toLowerCase();
  if (blockedPlatforms.includes(platform)) return false;
  if (accountType === 'internal_demo') return false;
  if (name.includes('INTERNAL_DEMO')) return false;

  return Boolean(acc.send_localhost || platform === 'nt8' || platform === 'mt5');
}

/**
 * Determina se uma conta é uma CONTA MASTER NINJATRADER.
 */
export function isNinjaMasterAccount(acc: any): boolean {
  if (!acc) return false;
  if (!isNinjaExecutionAccount(acc)) return false;
  if (acc.is_master === true) return true;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('vortex_copy_trading_configs') : null;
    if (!raw) return false;
    const configs = JSON.parse(raw);
    if (!Array.isArray(configs)) return false;
    const accId = acc.id;
    const accName = (acc.account_name || acc.name || '').trim().toLowerCase();
    return configs.some((c: any) => 
      c.is_active !== false && (
        c.master_account_id === accId || 
        (c.master_account_id && c.master_account_id.trim().toLowerCase() === accName)
      )
    );
  } catch {
    return false;
  }
}


async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// ---------------------------------------------------------------------
// TÚNEL PONTO-A-PONTO NINJATRADER 8 (WEBSOCKET RELAY HUB)
// ---------------------------------------------------------------------
export const DEFAULT_NINJA_TUNNEL_URL = 'ws://144.126.141.254/ws';

export function getNinjaTunnelWsUrl(): string {
  if (typeof localStorage !== 'undefined') {
    const custom = localStorage.getItem('vortex_ninja_tunnel_ws_url');
    if (custom && custom.trim()) return custom.trim();
  }
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return `wss://${window.location.host}/ws`;
  }
  return DEFAULT_NINJA_TUNNEL_URL;
}

let tunnelWs: WebSocket | null = null;
let currentTunnelToken = '';
let tunnelConnected = false;
let isNt8OnlineInTunnel = false;

const pendingTunnelRequests = new Map<string, {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: any;
}>();

export function isNinjaTunnelConnected(): boolean {
  return tunnelConnected;
}

export function isNinjaTunnelNt8Online(): boolean {
  return isNt8OnlineInTunnel;
}

export function reconnectCloudChannel(): void {
  if (tunnelWs) {
    try {
      tunnelWs.close();
    } catch {}
    tunnelWs = null;
    currentTunnelToken = '';
    tunnelConnected = false;
    isNt8OnlineInTunnel = false;
  }
  const token = getNinjaPairingToken();
  if (token) {
    getOrCreateTunnelWebSocket(token);
  }
}

function getOrCreateTunnelWebSocket(token: string): WebSocket | null {
  const cleanToken = (token || '').trim();
  if (!cleanToken) return null;

  if (tunnelWs && currentTunnelToken === cleanToken && tunnelWs.readyState === WebSocket.OPEN) {
    return tunnelWs;
  }

  if (tunnelWs && (tunnelWs.readyState === WebSocket.CONNECTING || tunnelWs.readyState === WebSocket.OPEN)) {
    if (currentTunnelToken === cleanToken) return tunnelWs;
    try { tunnelWs.close(); } catch {}
  }

  currentTunnelToken = cleanToken;
  const wsUrl = getNinjaTunnelWsUrl();

  try {
    const ws = new WebSocket(wsUrl);
    tunnelWs = ws;

    ws.onopen = () => {
      tunnelConnected = true;
      console.log(`[NinjaGateway] 🔌 Túnel WebSocket conectado ao Hub (${wsUrl})`);
      try {
        ws.send(JSON.stringify({
          type: 'tunnel_register',
          role: 'web',
          token: cleanToken
        }));
      } catch {}
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'tunnel_ack' || data.type === 'tunnel_status') {
          isNt8OnlineInTunnel = data.status === 'online';
          console.log(`[NinjaGateway] 📡 Status do NT8 no túnel: ${data.status}`);
          return;
        }

        if (data.type === 'vortex_resp' && data.id) {
          const pending = pendingTunnelRequests.get(data.id);
          if (pending) {
            clearTimeout(pending.timer);
            pendingTunnelRequests.delete(data.id);
            if (data.error && data.response === null) {
              pending.reject(new Error(data.error));
            } else {
              pending.resolve(data.response);
            }
          }
        }
      } catch {}
    };

    ws.onclose = () => {
      tunnelConnected = false;
      isNt8OnlineInTunnel = false;
    };

    ws.onerror = () => {
      tunnelConnected = false;
    };

    return ws;
  } catch (err) {
    console.warn('[NinjaGateway] Falha ao abrir WebSocket do túnel:', err);
    return null;
  }
}

if (typeof window !== 'undefined') {
  const initialToken = getNinjaPairingToken();
  if (initialToken) {
    getOrCreateTunnelWebSocket(initialToken);
  }
}

export async function executeCloudRpc(action: string, payload?: any, timeoutMs = 4000): Promise<any> {
  const token = getNinjaPairingToken();
  if (!token) {
    throw new Error('Token de pareamento de nuvem não configurado');
  }

  const ws = getOrCreateTunnelWebSocket(token);
  if (!ws) {
    throw new Error('Falha ao inicializar conexão do túnel com o Hub');
  }

  if (ws.readyState === WebSocket.CONNECTING) {
    await new Promise<void>((res) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN || Date.now() - start > 1500) {
          clearInterval(interval);
          res();
        }
      }, 50);
    });
  }

  if (ws.readyState !== WebSocket.OPEN) {
    throw new Error('Túnel WebSocket desconectado do servidor Hub');
  }

  const reqId = 'req_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingTunnelRequests.delete(reqId);
      reject(new Error(`Timeout na resposta do NinjaTrader via Túnel (${timeoutMs}ms)`));
    }, timeoutMs);

    pendingTunnelRequests.set(reqId, { resolve, reject, timer });

    try {
      ws.send(JSON.stringify({
        type: 'vortex_cmd',
        token,
        id: reqId,
        action,
        payload: typeof payload === 'string' ? payload : (payload !== undefined ? JSON.stringify(payload) : '')
      }));
    } catch (err) {
      clearTimeout(timer);
      pendingTunnelRequests.delete(reqId);
      reject(err);
    }
  });
}

// ---------------------------------------------------------------------
// DESPACHANTE UNIFICADO (HTTP LOCAL OU TÚNEL NUVEM)
// ---------------------------------------------------------------------
export async function executeNinjaRpc<T>(
  action: string,
  payload?: any,
  timeoutMs = 2500
): Promise<{ data: T | null; transport: 'local' | 'cloud' | 'none'; error?: any }> {
  const mode = getNinjaConnectionMode();
  const token = getNinjaPairingToken();

  // 1. Modo Estritamente Nuvem
  if (mode === 'cloud') {
    if (!token) {
      activeTransport = 'none';
      return { data: null, transport: 'none', error: 'Token de pareamento ausente' };
    }
    try {
      const resp = await executeCloudRpc(action, payload, timeoutMs);
      activeTransport = 'cloud';
      const parsed = typeof resp === 'string'
        ? ((resp.startsWith('{') || resp.startsWith('[')) ? JSON.parse(resp) : resp)
        : resp;
      return { data: parsed as T, transport: 'cloud' };
    } catch (err) {
      activeTransport = 'none';
      return { data: null, transport: 'none', error: err };
    }
  }

  // Helper para anexar query string em rotas que leem QueryString no HTTP local (retrocompatibilidade total)
  const buildLocalUrl = (act: string, bodyPayload: any): string => {
    const endpoint = act.startsWith('/') ? act : `/${act}`;
    let baseUrl = `${getGatewayUrl()}${endpoint}`;
    if (bodyPayload && typeof bodyPayload === 'object' && !Array.isArray(bodyPayload) && endpoint.startsWith('/account_performance')) {
      const qs = new URLSearchParams();
      if (bodyPayload.account) qs.set('account', String(bodyPayload.account));
      if (bodyPayload.mode) qs.set('mode', String(bodyPayload.mode));
      if (bodyPayload.startDate) qs.set('startDate', String(bodyPayload.startDate));
      if (bodyPayload.endDate) qs.set('endDate', String(bodyPayload.endDate));
      if (bodyPayload.since) qs.set('since', String(bodyPayload.since));
      const qsStr = qs.toString();
      if (qsStr) baseUrl += (baseUrl.includes('?') ? '&' : '?') + qsStr;
    }
    return baseUrl;
  };

  // 2. Modo Estritamente Local (HTTP Direto localhost:8001)
  if (mode === 'local') {
    try {
      const url = buildLocalUrl(action, payload);
      const isPost = payload !== undefined;
      const res = await fetchWithTimeout(url, {
        method: isPost ? 'POST' : 'GET',
        headers: isPost ? { 'Content-Type': 'application/json' } : undefined,
        body: isPost ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : undefined
      }, timeoutMs);
      if (res.ok) {
        activeTransport = 'local';
        const data = await res.json();
        return { data: data as T, transport: 'local' };
      }
      activeTransport = 'none';
      return { data: null, transport: 'none', error: `HTTP ${res.status}` };
    } catch (err) {
      // Se localhost:8001 falhou (ex: usuário em outro PC/Notebook remoto) e há token de pareamento ativo, fallback imediato para o Túnel Nuvem!
      if (token) {
        try {
          const resp = await executeCloudRpc(action, payload, timeoutMs);
          activeTransport = 'cloud';
          const parsed = typeof resp === 'string'
            ? ((resp.startsWith('{') || resp.startsWith('[')) ? JSON.parse(resp) : resp)
            : resp;
          return { data: parsed as T, transport: 'cloud' };
        } catch (cloudErr) {
          activeTransport = 'none';
          return { data: null, transport: 'none', error: cloudErr };
        }
      }
      activeTransport = 'none';
      return { data: null, transport: 'none', error: err };
    }
  }

  // 3. Modo Auto (Híbrido: Local primeiro, fallback em Nuvem)
  try {
    const url = buildLocalUrl(action, payload);
    const isPost = payload !== undefined;
    const localTimeout = (timeoutMs > 3000 || activeTransport === 'local') ? timeoutMs : Math.min(timeoutMs, 1200);
    const res = await fetchWithTimeout(url, {
      method: isPost ? 'POST' : 'GET',
      headers: isPost ? { 'Content-Type': 'application/json' } : undefined,
      body: isPost ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : undefined
    }, localTimeout);

    if (res.ok) {
      activeTransport = 'local';
      const data = await res.json();
      return { data: data as T, transport: 'local' };
    }
  } catch {
    // Local falhou
  }

  // Fallback em nuvem
  if (token) {
    try {
      const resp = await executeCloudRpc(action, payload, timeoutMs);
      activeTransport = 'cloud';
      const parsed = typeof resp === 'string'
        ? ((resp.startsWith('{') || resp.startsWith('[')) ? JSON.parse(resp) : resp)
        : resp;
      return { data: parsed as T, transport: 'cloud' };
    } catch (cloudErr) {
      activeTransport = 'none';
      return { data: null, transport: 'none', error: cloudErr };
    }
  }

  activeTransport = 'none';
  return { data: null, transport: 'none', error: 'NinjaTrader inalcançável (Local e Nuvem)' };
}

let cachedNinjaStatus: NinjaStatusDto = { status: 'offline', transport: 'none' };
let inFlightStatusPromise: Promise<NinjaStatusDto> | null = null;

/**
 * Verifica o status de saúde e a latência de comunicação com o NinjaTrader 8
 */
export async function checkNinjaStatus(force = false): Promise<NinjaStatusDto> {
  const now = Date.now();
  const cacheTtl = cachedNinjaStatus.status === 'offline' ? 3500 : 1000;
  if (!force && lastNinjaStatusTime > 0 && (now - lastNinjaStatusTime < cacheTtl)) {
    return cachedNinjaStatus;
  }
  if (inFlightStatusPromise) {
    return inFlightStatusPromise;
  }

  inFlightStatusPromise = (async () => {
    const start = performance.now();
    try {
      const { data, transport } = await executeNinjaRpc<any>('status', undefined, 1500);
      const latencyMs = Math.max(1, Math.round(performance.now() - start));
      const isOnline = data && (data.status === 'online' || data.isConnected === true);

      cachedNinjaStatus = {
        status: isOnline ? 'online' : 'offline',
        version: data?.version || '2.0.0',
        latencyMs,
        transport,
        isLicensed: data?.isLicensed,
        licenseStatus: data?.licenseStatus,
        machineId: data?.machineId,
        idAssinatura: data?.idAssinatura
      };
    } catch {
      cachedNinjaStatus = { status: 'offline', transport: 'none' };
    } finally {
      lastNinjaStatusTime = Date.now();
      inFlightStatusPromise = null;
    }
    return cachedNinjaStatus;
  })();

  return inFlightStatusPromise;
}

/**
 * Busca todas as contas ativas conectadas no NinjaTrader 8
 */
export async function fetchNinjaAccounts(): Promise<NinjaAccountDto[]> {
  try {
    const { data } = await executeNinjaRpc<{ accounts: NinjaAccountDto[] }>('accounts', undefined, 2500);
    return Array.isArray(data?.accounts) ? data.accounts : [];
  } catch (err) {
    console.warn('[NinjaGateway] Erro ao buscar contas do NinjaTrader:', err);
    return [];
  }
}

/**
 * Envia uma ordem / sinal de trade diretamente para o NinjaTrader
 */
export async function sendNinjaOrder(order: {
  action: 'BUY' | 'SELL' | 'compra' | 'venda';
  symbol: string;
  account_name?: string;
  lots?: number;
  contrato?: number;
  entry_price?: number;
  stop_loss?: number | null;
  take_profit?: number | null;
  order_type?: 'market' | 'limit' | 'stop';
}): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const entryP = Number(order.entry_price || 0);
    const slP = Number(order.stop_loss || 0);
    const tpP = Number(order.take_profit || 0);

    const stopPoints = (entryP > 0 && slP > 0) ? Math.abs(entryP - slP) : 0;
    const takePoints = (entryP > 0 && tpP > 0) ? Math.abs(tpP - entryP) : 0;

    const payload = {
      side: (order.action || 'BUY').toUpperCase(),
      symbol: order.symbol,
      account_name: order.account_name,
      quantity: order.contrato || order.lots || 1,
      entry_price: entryP,
      stop_loss: slP,
      take_profit: tpP,
      stop_loss_points: stopPoints,
      take_profit_points: takePoints,
      order_type: order.order_type || 'market'
    };

    const { data, error } = await executeNinjaRpc<{ success: boolean; message?: string; error?: string }>('sinal_local', payload, 3000);
    if (data) return data;
    return { success: false, error: String(error || 'Falha ao enviar ordem para o NinjaTrader') };
  } catch (err: any) {
    return { success: false, error: err.message || 'Falha de conexão com NinjaTrader' };
  }
}

/**
 * Atualiza os níveis de Stop Loss e Take Profit de ordens abertas no NinjaTrader
 */
export async function modifyNinjaOrders(params: {
  id?: string;
  order_id?: string;
  account_name?: string;
  symbol?: string;
  side?: string;
  entry_price?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  stop_loss_points?: number | null;
  take_profit_points?: number | null;
  is_breakeven?: boolean;
  offset_points?: number | null;
}): Promise<boolean> {
  try {
    const entryP = Number(params.entry_price || 0);
    const slP = Number(params.stop_loss || 0);
    const tpP = Number(params.take_profit || 0);
    const isBe = params.is_breakeven !== undefined 
      ? params.is_breakeven 
      : (entryP > 0 && slP > 0 && Math.abs(entryP - slP) <= 0.75);
    const stopPoints = Number(params.stop_loss_points) || ((entryP > 0 && slP > 0) ? Math.abs(entryP - slP) : 0);
    const takePoints = Number(params.take_profit_points) || ((entryP > 0 && tpP > 0) ? Math.abs(tpP - entryP) : 0);
    const offsetPoints = params.offset_points !== undefined ? Number(params.offset_points) : (isBe ? (slP - entryP) : 0);

    const payload = {
      ...params,
      entry_price: entryP,
      stop_loss: slP,
      take_profit: tpP,
      stop_loss_points: stopPoints,
      take_profit_points: takePoints,
      is_breakeven: isBe,
      offset_points: offsetPoints
    };

    const { data } = await executeNinjaRpc<any>('sinal_local/levels', payload, 2500);
    return data !== null && (data.success !== false);
  } catch {
    return false;
  }
}

/**
 * Zera posições de uma conta ou ativo no NinjaTrader
 */
export async function closeNinjaPosition(accountName?: string, symbol?: string): Promise<boolean> {
  try {
    const { data } = await executeNinjaRpc<any>('close_position', { account_name: accountName, symbol }, 2500);
    return data !== null && (data.success !== false);
  } catch {
    return false;
  }
}

export interface NinjaMasterEvent {
  eventId: string;
  eventType: 'ENTRY' | 'CLOSE' | 'LEVELS' | string;
  accountName: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'FLAT';
  quantity: number;
  price: number;
  stopLoss: number;
  takeProfit: number;
  stopLossPoints?: number;
  takeProfitPoints?: number;
  orderId: string;
  orderName: string;
  reportId?: string;
  timestamp: string;
}

/**
 * Consulta eventos de execução gerados diretamente no NinjaTrader (para Copy Reverso de Master ➔ Slaves)
 */
export async function fetchNinjaMasterEvents(): Promise<NinjaMasterEvent[]> {
  try {
    const { data } = await executeNinjaRpc<{ events: NinjaMasterEvent[] }>('master_events', undefined, 1500);
    return Array.isArray(data?.events) ? data.events : [];
  } catch {
    return [];
  }
}

export interface NinjaCopyRule {
  id?: string;
  masterAccount: string;
  slaveAccount: string;
  lotMultiplier: number;
  isActive: boolean;
  allowedSymbols?: string;
  executionSymbol?: string;
  symbolMapping?: string;
  maxDailyLoss?: number;
  dailyProfitTarget?: number;
  maxDailyTrades?: number;
  copyAtmStrategy?: boolean;
  closeSlavesOnMasterClose?: boolean;
  cancelOrphanOrders?: boolean;
}

export interface NinjaAccountRiskDto {
  account_name: string;
  daily_loss_limit: number;
  daily_profit_target: number;
  max_daily_trades?: number;
  max_lots?: number;
  trading_start_time?: string;
  trading_end_time?: string;
  allow_multi_signals?: boolean;
}

/**
 * Envia as regras de Copy Trading e as configurações de risco das contas para o NinjaTrader
 */
export async function syncNinjaCopyRules(rules: NinjaCopyRule[], accounts?: NinjaAccountRiskDto[]): Promise<boolean> {
  try {
    const { data } = await executeNinjaRpc<any>('copy_rules', { rules, accounts }, 2500);
    return data !== null && (data.success !== false);
  } catch {
    return false;
  }
}

/**
 * Sincroniza exclusivamente os parâmetros de risco de cada conta com o Add-On do NinjaTrader
 */
export async function syncNinjaAccountsRisk(accounts: NinjaAccountRiskDto[]): Promise<boolean> {
  try {
    const { data } = await executeNinjaRpc<any>('sync_accounts_risk', { accounts }, 2500);
    return data !== null && (data.success !== false);
  } catch {
    return false;
  }
}

/**
 * Consulta as regras de Copy Trading ativas no NinjaTrader
 */
export async function fetchNinjaCopyRules(): Promise<NinjaCopyRule[]> {
  try {
    const { data } = await executeNinjaRpc<{ rules: NinjaCopyRule[] }>('copy_rules', undefined, 1500);
    return Array.isArray(data?.rules) ? data.rules : [];
  } catch {
    return [];
  }
}

export interface NinjaTradeRecord {
  tradeNumber: number;
  orderId?: string;
  symbol: string;
  entryAction: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  profitCurrency: number;
  profitPoints: number;
  commission: number;
  entryTime: string;
  exitTime: string;
  isOpen?: boolean;
}

export interface NinjaAccountPerformance {
  name: string;
  displayName: string;
  connection: string;
  cashValue: number;
  realizedPnL: number;
  unrealizedPnL: number;
  grossPnL: number;
  buyingPower: number;
  tradesCount: number;
  trades: NinjaTradeRecord[];
}

export interface NinjaPerformanceFilter {
  accountName?: string;
  mode?: 'day' | 'history';
  startDate?: string;
  endDate?: string;
  since?: string;
}

/**
 * Resgata métricas de performance e histórico de trades de contas conectadas no NinjaTrader
 */
export async function fetchNinjaAccountPerformance(
  accountNameOrFilter?: string | NinjaPerformanceFilter,
  legacyMode: 'day' | 'history' = 'day'
): Promise<NinjaAccountPerformance[]> {
  try {
    let accountName: string | undefined;
    let mode: 'day' | 'history' = legacyMode;
    let startDate: string | undefined;
    let endDate: string | undefined;
    let since: string | undefined;

    if (typeof accountNameOrFilter === 'object' && accountNameOrFilter !== null) {
      accountName = accountNameOrFilter.accountName;
      mode = accountNameOrFilter.mode || 'day';
      startDate = accountNameOrFilter.startDate;
      endDate = accountNameOrFilter.endDate;
      since = accountNameOrFilter.since;
    } else {
      accountName = accountNameOrFilter;
      mode = legacyMode;
    }

    // Se o modo solicitado for 'day' sem filtro explícito, definimos startDate = ontem e enviamos mode = 'history'
    // para que o Add-On busque tanto SQLite quanto memória SEM forçar a reconciliação cruzada do PnL de ontem contra o RealizedPnL de hoje ($0.00)!
    let effectiveStartDate = startDate;
    if (mode === 'day' && !effectiveStartDate && !since) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      effectiveStartDate = yesterday.toISOString().split('T')[0];
    }

    const payload = {
      account: (accountName && accountName !== 'all') ? accountName : undefined,
      mode: 'history',
      startDate: effectiveStartDate,
      endDate,
      since
    };

    const timeoutMs = (mode === 'history' || startDate || since) ? 30000 : 10000;
    const { data } = await executeNinjaRpc<{ accounts: NinjaAccountPerformance[] }>('account_performance', payload, timeoutMs);
    return Array.isArray(data?.accounts) ? data.accounts : [];
  } catch {
    return [];
  }
}

export interface NinjaPositionDto {
  account: string;
  symbol: string;
  marketPosition: 'BUY' | 'SELL';
  quantity: number;
  averagePrice: number;
  unrealizedPnL: number;
}

export interface NinjaWorkingOrderDto {
  orderId: string;
  account: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  orderType: string;
  quantity: number;
  filled: number;
  price: number;
  stopPrice: number;
  limitPrice: number;
  orderState: string;
  name: string;
  oco: string;
  time: string;
}

let cachedPositionsAndOrders: { positions: NinjaPositionDto[]; orders: NinjaWorkingOrderDto[] } = { positions: [], orders: [] };
let inFlightPositionsPromise: Promise<{ positions: NinjaPositionDto[]; orders: NinjaWorkingOrderDto[] }> | null = null;

/**
 * Busca todas as posições abertas a mercado e ordens pendentes/trabalhando no NinjaTrader
 */
export async function fetchNinjaPositionsAndOrders(force = false): Promise<{
  positions: NinjaPositionDto[];
  orders: NinjaWorkingOrderDto[];
}> {
  const now = Date.now();
  if (!force && now - lastPositionsAndOrdersTime < 600) {
    return cachedPositionsAndOrders;
  }
  if (inFlightPositionsPromise) {
    return inFlightPositionsPromise;
  }

  inFlightPositionsPromise = (async () => {
    try {
      const { data } = await executeNinjaRpc<{ positions: NinjaPositionDto[]; orders: NinjaWorkingOrderDto[] }>('positions', undefined, 2000);
      if (data) {
        cachedPositionsAndOrders = {
          positions: Array.isArray(data?.positions) ? data.positions : [],
          orders: Array.isArray(data?.orders) ? data.orders : []
        };
      }
    } catch {
      // Retorna o último cache conhecido sem falhar
    } finally {
      lastPositionsAndOrdersTime = Date.now();
      inFlightPositionsPromise = null;
    }
    return cachedPositionsAndOrders;
  })();

  return inFlightPositionsPromise;
}

/**
 * Cancela uma ordem de trabalho específica ou ordens de uma conta no NinjaTrader
 */
export async function cancelNinjaOrder(orderId?: string, accountName?: string): Promise<boolean> {
  try {
    const { data } = await executeNinjaRpc<any>('cancel_order', { order_id: orderId, account_name: accountName }, 2000);
    return data !== null && (data.success !== false);
  } catch {
    return false;
  }
}

/**
 * Cancela todas as ordens de trabalho de todas as contas no NinjaTrader
 */
export async function cancelAllNinjaOrders(accountName?: string): Promise<boolean> {
  try {
    const { data } = await executeNinjaRpc<any>('cancel_all_orders', { account_name: accountName }, 2000);
    return data !== null && (data.success !== false);
  } catch {
    return false;
  }
}

/**
 * Botão de Pânico Geral: Zera todas as posições em aberto e cancela todas as ordens em todas as contas conectadas
 */
export async function flattenAllNinjaAccounts(): Promise<{ success: boolean; message?: string }> {
  try {
    const { data, error } = await executeNinjaRpc<{ success: boolean; message?: string }>('flatten_all', {}, 3000);
    if (data) return data;
    return { success: false, message: String(error || 'Falha de conexão com NinjaTrader') };
  } catch (err: any) {
    return { success: false, message: err.message || 'Falha de conexão com NinjaTrader' };
  }
}



