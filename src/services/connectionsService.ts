/**
 * Connections Service — Gerenciamento e Validação da Central de Conexões
 * Salva e sincroniza conexões no Supabase por Usuário e Inscrição (subscription_id).
 */

import { supabase } from '../supabaseClient';
import { getAuthUser } from './db';
import { fetchCTraderAccount } from './ctraderService';

export interface DetectedAccountDetail {
  id: string;
  account_number: string;
  name: string;
  balance: number;
  equity: number;
  broker: string;
  currency: string;
  platform: string;
}

export interface PlatformConnection {
  id: string;
  user_id?: string;
  subscription_id?: string;
  platform: 'nt8' | 'mt4' | 'mt5' | 'ctrader' | 'binance';
  connection_type: 'nt8_local' | 'nt8_tunnel' | 'mt4_vps' | 'mt5_vps' | 'ctrader_vps' | 'binance_api';
  name: string;
  host_url: string;
  pairing_token?: string;
  api_key?: string;
  api_secret?: string;
  is_active: boolean;
  status: 'online' | 'offline' | 'pending';
  last_ping_at?: string;
  detected_accounts?: string[];
  detected_accounts_detail?: DetectedAccountDetail[];
  latency_ms?: number;
  notes?: string;
}

export interface ConnectionPreset {
  type: PlatformConnection['connection_type'];
  platform: PlatformConnection['platform'];
  name: string;
  host_url: string;
  pairing_token?: string;
  icon: string;
  description: string;
}

export const CONNECTION_PRESETS: ConnectionPreset[] = [
  {
    type: 'nt8_local',
    platform: 'nt8',
    name: 'Conexão Local NT8 (:8001)',
    host_url: 'http://localhost:8001',
    icon: '🟧',
    description: 'Comunicação local direta com o Add-On do NinjaTrader 8 na porta 8001 do mesmo computador.'
  },
  {
    type: 'nt8_tunnel',
    platform: 'nt8',
    name: 'Conexão Túnel NT8 (Relay Nuvem)',
    host_url: 'ws://144.126.141.254/ws',
    pairing_token: 'vps_nt8',
    icon: '🟧',
    description: 'Túnel WebSocket Relay Hub na VPS via Token. Não precisa de IP do seu PC nem abertura de portas.'
  },
  {
    type: 'mt4_vps',
    platform: 'mt4',
    name: 'Conexão MT4 (VPS Nuvem - Porta 80)',
    host_url: 'http://144.126.141.254',
    pairing_token: 'vps_mt4',
    icon: '🟦',
    description: 'Gateway oficial na VPS na porta 80 padrão para o robô AxionGatewayEA.mq4 do MetaTrader 4.'
  },
  {
    type: 'mt5_vps',
    platform: 'mt5',
    name: 'Conexão MT5 (VPS Nuvem - Porta 80)',
    host_url: 'http://144.126.141.254',
    pairing_token: 'vps_mt5',
    icon: '🔷',
    description: 'Gateway oficial na VPS na porta 80 padrão para o robô AxionGatewayEA.mq5 do MetaTrader 5.'
  },
  {
    type: 'ctrader_vps',
    platform: 'ctrader',
    name: 'Conexão cTrader (Spotware Open API)',
    host_url: 'https://api.spotware.com',
    pairing_token: '',
    icon: '🟪',
    description: 'Integração 100% direta com a cTrader Cloud via Spotware Open API (sem necessidade de robô ou VPS).'
  },
  {
    type: 'binance_api',
    platform: 'binance',
    name: 'Conexão Binance Spot (API)',
    host_url: 'https://api.binance.com',
    icon: '🟡',
    description: 'Integração direta com a API Spot da Binance via API Key e Secret.'
  }
];

function getStoredSubscriptionId(): string {
  try {
    return typeof localStorage !== 'undefined'
      ? (localStorage.getItem('vortex_subscription_id') || 'default')
      : 'default';
  } catch {
    return 'default';
  }
}

function getLocalConnectionsKey(subId: string): string {
  return `vortex_platform_connections_${subId}`;
}

export function getLocalPlatformConnections(): PlatformConnection[] {
  try {
    const subId = getStoredSubscriptionId();
    const raw = localStorage.getItem(getLocalConnectionsKey(subId)) || localStorage.getItem('vortex_platform_connections');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [];
}

export function setLocalPlatformConnections(conns: PlatformConnection[]): void {
  try {
    const subId = getStoredSubscriptionId();
    localStorage.setItem(getLocalConnectionsKey(subId), JSON.stringify(conns));
  } catch (_) {}
}

/**
 * Busca as conexões salvas no Supabase para o usuário logado e inscrição atual
 */
export async function fetchPlatformConnectionsSupabase(): Promise<PlatformConnection[]> {
  const localList = getLocalPlatformConnections();
  try {
    const user = await getAuthUser();
    if (!user || !user.id) return localList;

    const subId = getStoredSubscriptionId();
    const recordId = `platform_conns_${user.id}_${subId}`;

    const { data, error } = await supabase
      .from('painelvm_account_chart_state')
      .select('*')
      .eq('id', recordId)
      .maybeSingle();

    if (!error && data && data.widgets) {
      const w = typeof data.widgets === 'string' ? JSON.parse(data.widgets) : data.widgets;
      if (Array.isArray(w.connections)) {
        setLocalPlatformConnections(w.connections);
        return w.connections;
      }
    }
  } catch (err) {
    console.warn('[CONNECTIONS] Falha ao carregar do Supabase, usando local:', err);
  }
  return localList;
}

/**
 * Salva as conexões no Supabase vinculadas ao user_id e subscription_id
 */
export async function savePlatformConnectionsSupabase(conns: PlatformConnection[]): Promise<boolean> {
  setLocalPlatformConnections(conns);

  try {
    const user = await getAuthUser();
    if (!user || !user.id) return true;

    const subId = getStoredSubscriptionId();
    const recordId = `platform_conns_${user.id}_${subId}`;

    const payload = {
      id: recordId,
      user_id: user.id,
      account_id: 'connections_hub',
      symbol: 'CONNECTIONS',
      widgets: {
        subscription_id: subId,
        connections: conns,
        updated_at: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('painelvm_account_chart_state')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error('[CONNECTIONS] Erro ao salvar no Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[CONNECTIONS] Exceção ao salvar conexões no Supabase:', err);
    return false;
  }
}

/**
 * Testa o ping e conectividade de uma conexão específica em tempo real
 */
export async function testConnectionPing(conn: PlatformConnection): Promise<{
  online: boolean;
  latencyMs: number;
  message: string;
  detectedAccounts?: string[];
  detectedAccountsDetail?: DetectedAccountDetail[];
}> {
  const start = Date.now();

  if (conn.platform === 'binance') {
    try {
      if (conn.api_key && conn.api_secret) {
        try {
          const { fetchBinanceAccount } = await import('./binanceService');
          const accInfo = await fetchBinanceAccount(conn.api_key, conn.api_secret, false);
          const latency = Date.now() - start;
          if (accInfo) {
            const bal = Number(accInfo.totalBalanceUsd || 0);
            return {
              online: true,
              latencyMs: latency,
              message: `Binance Spot Conectada ● Saldo Real: US$ ${bal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${latency}ms)`,
              detectedAccounts: ['Binance Spot'],
              detectedAccountsDetail: [{
                id: 'binance_spot',
                account_number: 'Binance Spot',
                name: 'Binance Spot',
                balance: bal,
                equity: bal,
                broker: 'Binance',
                currency: 'USDT',
                platform: 'binance'
              }]
            };
          }
        } catch (_) {}
      }

      const proxyUrl = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? '/binance-api/api/v3/ping'
        : `${conn.host_url}/api/v3/ping`;
      
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(3500) });
      const latency = Date.now() - start;
      if (res.ok) {
        return { online: true, latencyMs: latency, message: `Binance API acessível (${latency}ms)` };
      }
      return { online: false, latencyMs: latency, message: `Erro HTTP ${res.status}` };
    } catch (e: any) {
      return { online: false, latencyMs: 0, message: e.message || 'Falha ao acessar Binance' };
    }
  }

  // NinjaTrader 8
  if (conn.platform === 'nt8') {
    const isTunnel = conn.connection_type === 'nt8_tunnel' || 
      (conn.host_url && (conn.host_url.startsWith('ws') || conn.host_url.includes('144.126.141.254'))) ||
      Boolean(conn.pairing_token && !conn.host_url?.includes('localhost') && !conn.host_url?.includes('127.0.0.1'));

    if (isTunnel) {
      // Teste inteligente do Túnel WebSocket Relay Hub
      try {
        const rawWsUrl = conn.host_url?.startsWith('ws') ? conn.host_url : 'ws://144.126.141.254/ws';
        const wsUrl = (typeof window !== 'undefined' && window.location.protocol === 'https:' && rawWsUrl.includes(window.location.host))
          ? rawWsUrl.replace(/^ws:/, 'wss:')
          : rawWsUrl;
        const token = conn.pairing_token || 'vps_nt8';

        return await new Promise((resolve) => {
          let finished = false;
          let testWs: WebSocket | null = null;
          const timer = setTimeout(() => {
            if (!finished) {
              finished = true;
              try { testWs?.close(); } catch {}
              resolve({
                online: false,
                latencyMs: 0,
                message: 'Timeout ao conectar no Hub WebSocket da VPS'
              });
            }
          }, 3500);

          try {
            testWs = new WebSocket(wsUrl);
          } catch (err: any) {
            clearTimeout(timer);
            resolve({
              online: false,
              latencyMs: 0,
              message: `Falha ao abrir WebSocket: ${err.message}`
            });
            return;
          }

          testWs.onopen = () => {
            try {
              testWs?.send(JSON.stringify({
                type: 'tunnel_register',
                role: 'web',
                token: token
              }));
            } catch {}
          };

          testWs.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              if (data.type === 'tunnel_ack' || data.type === 'tunnel_status') {
                if (!finished) {
                  finished = true;
                  clearTimeout(timer);
                  const latency = Date.now() - start;
                  try { testWs?.close(); } catch {}

                  if (data.status === 'online') {
                    resolve({
                      online: true,
                      latencyMs: latency,
                      message: `Túnel Ativo ● NinjaTrader 8 Conectado (${latency}ms)`
                    });
                  } else {
                    resolve({
                      online: true,
                      latencyMs: latency,
                      message: `Hub Nuvem Online ● Aguardando NT8 com Token '${token}' no PC (${latency}ms)`
                    });
                  }
                }
              }
            } catch {}
          };

          testWs.onerror = () => {
            if (!finished) {
              finished = true;
              clearTimeout(timer);
              resolve({
                online: false,
                latencyMs: 0,
                message: 'Hub WebSocket da VPS Inacessível'
              });
            }
          };
        });
      } catch (e: any) {
        return { online: false, latencyMs: 0, message: `Erro Túnel: ${e.message}` };
      }
    }

    // Modo HTTP Local Direto (localhost:8001)
    try {
      const target = conn.host_url || 'http://localhost:8001';
      const res = await fetch(`${target}/status`, { signal: AbortSignal.timeout(2500) });
      const latency = Date.now() - start;
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        const accs = json.accounts ? Object.keys(json.accounts) : [];
        return { online: true, latencyMs: latency, message: `NinjaTrader 8 Local Online (${latency}ms)`, detectedAccounts: accs };
      }
      return { online: false, latencyMs: latency, message: `Status HTTP ${res.status}` };
    } catch (e: any) {
      return { online: false, latencyMs: 0, message: 'Offline (Porta 8001 fechada no PC local)' };
    }
  }

  // 2.5 cTrader Spotware Open API (Nuvem Direta)
  if (conn.platform === 'ctrader') {
    const accountId = (conn.api_key || conn.pairing_token || '').trim();
    const token = (conn.api_secret || '').trim();

    if (!token || !accountId) {
      return {
        online: false,
        latencyMs: 0,
        message: 'Preencha o Account ID e o Access Token da Spotware cTrader Open API'
      };
    }

    try {
      const cTraderInfo = await fetchCTraderAccount(token, accountId);
      const latency = Date.now() - start;
      if (cTraderInfo) {
        const detectedDetail: DetectedAccountDetail[] = [{
          id: `ctrader_${cTraderInfo.accountId}`,
          account_number: String(cTraderInfo.accountId),
          name: `cTrader #${cTraderInfo.accountId}`,
          balance: Number(cTraderInfo.balance || 0),
          equity: Number(cTraderInfo.equity || cTraderInfo.balance || 0),
          broker: cTraderInfo.brokerName || 'Spotware cTrader',
          currency: cTraderInfo.currency || 'USD',
          platform: 'ctrader'
        }];

        return {
          online: true,
          latencyMs: latency,
          message: `cTrader Open API Conectada • Conta #${cTraderInfo.accountId} • Saldo: ${cTraderInfo.currency} ${Number(cTraderInfo.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${latency}ms)`,
          detectedAccounts: [String(cTraderInfo.accountId)],
          detectedAccountsDetail: detectedDetail
        };
      }
      return { online: false, latencyMs: latency, message: 'cTrader API: Falha ao validar Token ou Account ID' };
    } catch (err: any) {
      return { online: false, latencyMs: 0, message: `Erro cTrader API: ${err.message}` };
    }
  }

  // MetaTrader 4 ou MetaTrader 5 (Gateway VPS)
  try {
    const target = (conn.host_url || 'http://144.126.141.254').replace(/\/+$/, '');
    const res = await fetch(`${target}/status`, { signal: AbortSignal.timeout(3500) });
    const latency = Date.now() - start;
    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      
      // Busca detalhes ricos de contas conectadas
      let accountsDetail: DetectedAccountDetail[] = [];
      try {
        const accRes = await fetch(`${target}/accounts`, { signal: AbortSignal.timeout(2000) });
        if (accRes.ok) {
          const accJson = await accRes.json().catch(() => ({}));
          if (Array.isArray(accJson.accounts)) {
            accountsDetail = accJson.accounts.map((a: any) => ({
              id: String(a.id || a.account_number || a.name),
              account_number: String(a.account_number || a.id || ''),
              name: a.name || `MT4 #${a.account_number || a.id}`,
              balance: Number(a.balance || a.cashValue || 0),
              equity: Number(a.equity || a.balance || 0),
              broker: a.broker || 'MetaTrader',
              currency: a.currency || 'USD',
              platform: conn.platform
            }));
          }
        }
      } catch (_) {}

      // Fallback para lista simples de IDs do status
      const detected = accountsDetail.length > 0 
        ? accountsDetail.map(a => a.account_number || a.name)
        : (json.connected_accounts ? json.connected_accounts.map((a: any) => String(a.account || a)) : []);

      const accountsMsg = accountsDetail.length > 0 
        ? ` (${accountsDetail.length} conta(s) detectada(s))`
        : (detected.length > 0 ? ` (${detected.length} conta(s) ativa(s))` : ' (Aguardando EA no MT4)');

      return {
        online: true,
        latencyMs: latency,
        message: `Gateway ${conn.platform.toUpperCase()} Ativo${accountsMsg} (${latency}ms)`,
        detectedAccounts: detected,
        detectedAccountsDetail: accountsDetail
      };
    }
    return { online: false, latencyMs: latency, message: `Gateway retornou HTTP ${res.status}` };
  } catch (e: any) {
    return {
      online: false,
      latencyMs: 0,
      message: `Offline ou inatingível em ${conn.host_url}`
    };
  }
}
