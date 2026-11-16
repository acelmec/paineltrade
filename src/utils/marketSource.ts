import { isStandardSupabasePanel } from '../services/db';
import { isStreamerWsConnected } from '../services/vortexStreamer';

export type MarketEcosystem = 'supabase' | 'nt8' | 'mt' | 'binance' | 'ctrader';

export interface MarketSourceInfo {
  ecosystem: MarketEcosystem;
  subType?: 'mt4' | 'mt5' | 'spot' | 'futures' | 'standard';
  isDemo?: boolean;
  broker?: string;
  badgeLabel: string;
  badgeDot: string;
  badgeStyle: string;
  badgeTitle: string;
  shouldShowPriceLineDefault: boolean;
}

/**
 * Formata as partes de um nome de ativo:
 * - Ativo: sempre em CAIXA ALTA (ex: "EURUSD", "BTCUSD", "NASDAQ")
 * - Corretora: formatação suave (sem caixa alta forçada) para estilização não-bold e mais clara
 * Ex: "EURUSD - ACTIVTRADES" -> { assetPart: "EURUSD", brokerPart: "ActivTrades" }
 * Ex: "BNBUSDT - BINANCE FUTUROS" -> { assetPart: "BNBUSDT", brokerPart: "Binance Futuros" }
 */
export function formatAssetNameParts(rawName: string): { assetPart: string; brokerPart: string | null } {
  if (!rawName) return { assetPart: 'ATIVO', brokerPart: null };
  const cleaned = rawName.replace(/\s*\([^)]*\)/g, '').trim();
  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    const assetPart = parts[0].trim().toUpperCase();
    let rawBroker = parts.slice(1).join(' - ').trim();

    // Dicionário de capitalização elegante para corretoras conhecidas
    const brokerLower = rawBroker.toLowerCase();
    let brokerPart = rawBroker;
    if (brokerLower === 'activtrades' || brokerLower === 'activtrade') {
      brokerPart = 'ActivTrades';
    } else if (brokerLower === 'pepperstone') {
      brokerPart = 'Pepperstone';
    } else if (brokerLower === 'binance spot') {
      brokerPart = 'Binance Spot';
    } else if (brokerLower === 'binance spot demo') {
      brokerPart = 'Binance Spot Demo';
    } else if (brokerLower.includes('binance') && brokerLower.includes('futur') && brokerLower.includes('demo')) {
      brokerPart = 'Binance Futuros Demo';
    } else if (brokerLower.includes('binance') && brokerLower.includes('futur')) {
      brokerPart = 'Binance Futuros';
    } else if (brokerLower === 'ic markets' || brokerLower === 'icmarkets') {
      brokerPart = 'IC Markets';
    } else if (rawBroker === rawBroker.toUpperCase() && rawBroker.length > 3) {
      brokerPart = rawBroker.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }

    return { assetPart, brokerPart };
  }
  return { assetPart: cleaned.toUpperCase(), brokerPart: null };
}

/**
 * Normaliza strings para comparação flexível e case-insensitive
 */
function cleanStr(val: any): string {
  return String(val || '').trim().toLowerCase();
}

/**
 * Extrai o nome da corretora de um símbolo ou nome de painel
 * Ex: "EURUSD - ActivTrades" -> "ActivTrades"
 * Ex: "ETHUSD - ActivTrades" -> "ActivTrades"
 * Ex: "BTCUSD - Pepperstone" -> "Pepperstone"
 * Ex: "SOLUSDT - Binance Spot" -> "Binance"
 */
export function extractBrokerFromAsset(panel: any): string | null {
  if (!panel) return null;
  const name = String(panel.name || panel.symbol || '').trim();
  if (name.includes(' - ')) {
    const parts = name.split(' - ');
    const lastPart = parts[parts.length - 1].trim();
    if (!/^(BINANCE|NT8|SUPABASE|AXION)/i.test(lastPart)) {
      return lastPart;
    }
  }
  if (panel.broker && typeof panel.broker === 'string' && panel.broker.trim().length > 0) {
    return panel.broker.trim();
  }
  return null;
}

/**
 * Resolve com precisão absoluta o ecossistema, corretora e propriedades visuais do ativo
 */
export function resolveAssetSource(panel: any, activeAccount?: any): MarketSourceInfo {
  const sym = String(panel?.symbol || panel?.name || '').toUpperCase().trim();
  const inst = String(panel?.instance_id || '').toLowerCase().trim();
  const fullStr = `${sym} ${inst}`.toUpperCase();
  const isStandardSupabase = isStandardSupabasePanel(panel);

  // 1. SUPABASE (Ativos canônicos padrão: NASDAQ, SP500, RUSSEL2000, DOWJONES, OIL, GOLD, etc.)
  // IMPORTANTE: Ativos padrão do Supabase Cloud NUNCA são rotulados como NT8 Local nem Binance!
  if (isStandardSupabase) {
    // Apenas se o painel estiver explicitamente em modo websocket local e com o streamer NT8 ativo
    const isExplicitNt8Transmission = (panel as any)?.settings?.transmission_mode === 'websocket' && isStreamerWsConnected();
    if (isExplicitNt8Transmission) {
      return {
        ecosystem: 'nt8',
        subType: 'standard',
        badgeLabel: 'NT8 Local',
        badgeDot: 'bg-emerald-400 animate-pulse',
        badgeStyle: 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300',
        badgeTitle: 'Transmissão em tempo real do NinjaTrader 8 Local (:8002)',
        shouldShowPriceLineDefault: true,
      };
    }

    return {
      ecosystem: 'supabase',
      subType: 'standard',
      badgeLabel: 'Supabase',
      badgeDot: 'bg-sky-400',
      badgeStyle: 'bg-sky-950/40 border-sky-500/30 text-sky-300',
      badgeTitle: 'Fonte de dados: Supabase Cloud',
      shouldShowPriceLineDefault: true,
    };
  }

  // 2. NINJATRADER 8
  const isExplicitNt8 = (panel as any)?.platform === 'ninjatrader' || sym.includes(' - NT8') || inst.startsWith('nt8_');
  if (isExplicitNt8) {
    return {
      ecosystem: 'nt8',
      badgeLabel: 'NT8 Local',
      badgeDot: 'bg-emerald-400 animate-pulse',
      badgeStyle: 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300',
      badgeTitle: 'Transmissão em tempo real do NinjaTrader 8 Local (:8002)',
      shouldShowPriceLineDefault: true,
    };
  }

  // 3. METATRADER (MT4 / MT5)
  const isMtPlatform = (panel as any)?.platform === 'mt4' || (panel as any)?.platform === 'mt5' || (panel as any)?.source === 'mt4' || inst.startsWith('mt4_') || inst.startsWith('mt5_');
  const hasBrokerSuffix = sym.includes(' - ') && !sym.includes('BINANCE') && !sym.includes('NT8');
  const isKnownForexBroker = sym.includes('ACTIVTRADES') || sym.includes('ACTIVETRADE') || sym.includes('PEPPERSTONE') || sym.includes('IC MARKETS') || sym.includes('XM') || sym.includes('FTMO');

  if (isMtPlatform || hasBrokerSuffix || isKnownForexBroker) {
    const isMt5 = (panel as any)?.platform === 'mt5' || inst.startsWith('mt5_') || sym.includes(' - MT5');
    const mtPrefix = isMt5 ? 'MT5' : 'MT4';
    let broker = extractBrokerFromAsset(panel);

    if (!broker) {
      if ((activeAccount as any)?.broker && !['MetaTrader 4', 'MetaTrader 5', 'MetaTrader Server'].includes((activeAccount as any)?.broker)) {
        broker = (activeAccount as any)?.broker;
      } else if (sym.includes('ACTIVTRADES') || sym.includes('ACTIVETRADE')) {
        broker = 'ActivTrades';
      } else if (sym.includes('PEPPERSTONE')) {
        broker = 'Pepperstone';
      } else {
        broker = 'ActivTrades';
      }
    }

    return {
      ecosystem: 'mt',
      subType: isMt5 ? 'mt5' : 'mt4',
      broker: broker || undefined,
      badgeLabel: `${mtPrefix} ${broker || 'ActivTrades'}`,
      badgeDot: 'bg-emerald-400 animate-pulse',
      badgeStyle: 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300',
      badgeTitle: `Conexão Remota ${mtPrefix} (${broker}) via Terminal / VPS`,
      shouldShowPriceLineDefault: true,
    };
  }

  // 4. CTRADER
  const isCtrader = (panel as any)?.platform === 'ctrader' || (activeAccount?.platform === 'ctrader' && (sym.includes('CTRADER') || inst.startsWith('ctrader_')));
  if (isCtrader) {
    const broker = extractBrokerFromAsset(panel) || (activeAccount?.broker && !['cTrader', 'Spotware'].includes(activeAccount.broker) ? activeAccount.broker : null);
    const label = broker ? `cTrader ${broker}` : 'cTrader';
    return {
      ecosystem: 'ctrader',
      broker: broker || undefined,
      badgeLabel: label,
      badgeDot: 'bg-purple-400',
      badgeStyle: 'bg-purple-950/40 border-purple-500/30 text-purple-300',
      badgeTitle: `Conexão cTrader Open API ${broker ? `(${broker})` : ''}`,
      shouldShowPriceLineDefault: true,
    };
  }

  // 5. BINANCE
  const isBinance = sym.includes('BINANCE') || /USDT|BUSD|USDC/i.test(sym) || (panel as any)?.platform === 'binance' || inst.endsWith('usdt');
  if (isBinance) {
    const isFutures = fullStr.includes('FUTUR') || fullStr.includes('PERP') || (
      activeAccount?.platform === 'binance' && (
        cleanStr(activeAccount?.account_name).includes('futuro') ||
        cleanStr(activeAccount?.connection_host).includes('future') ||
        cleanStr(activeAccount?.connection_host).includes('fapi')
      )
    );
    const isDemo = fullStr.includes('DEMO') || (
      activeAccount?.platform === 'binance' && (
        cleanStr(activeAccount?.account_name).includes('demo') ||
        cleanStr(activeAccount?.connection_host).includes('testnet')
      )
    );

    const bLabel = isFutures
      ? (isDemo ? 'Binance Futuros Demo' : 'Binance Futuros')
      : (isDemo ? 'Binance Spot Demo' : 'Binance Spot');

    return {
      ecosystem: 'binance',
      subType: isFutures ? 'futures' : 'spot',
      isDemo,
      badgeLabel: bLabel,
      badgeDot: 'bg-amber-400',
      badgeStyle: 'bg-amber-950/40 border-amber-500/30 text-amber-300',
      badgeTitle: `Cotações e Ordens em tempo real via ${bLabel}`,
      shouldShowPriceLineDefault: true,
    };
  }

  // Fallback seguro: Supabase
  return {
    ecosystem: 'supabase',
    subType: 'standard',
    badgeLabel: 'Supabase',
    badgeDot: 'bg-sky-400',
    badgeStyle: 'bg-sky-950/40 border-sky-500/30 text-sky-300',
    badgeTitle: 'Fonte de dados: Supabase Cloud',
    shouldShowPriceLineDefault: true,
  };
}

/**
 * Filtra as contas operacionais para a boleta com base estrita no ativo em foco.
 * REGRA INVIOLÁVEL:
 * - Se o ativo possui conexão MetaTrader de uma corretora (ex: ActivTrades),
 *   SOMENTE as contas MetaTrader daquela corretora devem aparecer na boleta!
 * - Se o ativo for Binance, somente contas Binance do mercado correspondente.
 * - Se o ativo for cTrader, somente contas cTrader.
 * - Se o ativo for Supabase ou NT8, contas compatíveis com o ecossistema.
 */
export function filterAccountsForAsset(accounts: any[], panel: any): any[] {
  if (!accounts || accounts.length === 0) return [];
  if (!panel) return accounts;

  const source = resolveAssetSource(panel);

  // 1. Ecossistema METATRADER (MT4 / MT5)
  if (source.ecosystem === 'mt') {
    const brokerTarget = cleanStr(source.broker || '');

    // Filtra contas com plataforma mt4 ou mt5
    const mtAccounts = accounts.filter(acc => {
      const plat = cleanStr(acc.platform);
      return plat === 'mt4' || plat === 'mt5';
    });

    if (brokerTarget.length > 0) {
      // Busca contas que pertençam àquela corretora específica (ex: ActivTrades)
      const brokerMatched = mtAccounts.filter(acc => {
        const accBroker = cleanStr(acc.broker || '');
        const accName = cleanStr(acc.account_name || '');
        return accBroker.includes(brokerTarget) || accName.includes(brokerTarget);
      });

      if (brokerMatched.length > 0) {
        return brokerMatched;
      }
    }

    // Se nenhuma bateu por nome específico da corretora, retorna todas as contas MT
    if (mtAccounts.length > 0) {
      return mtAccounts;
    }
  }

  // 2. Ecossistema BINANCE
  if (source.ecosystem === 'binance') {
    const binanceAccounts = accounts.filter(acc => cleanStr(acc.platform) === 'binance');

    if (source.subType === 'futures') {
      const futuresMatched = binanceAccounts.filter(acc => {
        const accName = cleanStr(acc.account_name || '');
        const accHost = cleanStr(acc.connection_host || '');
        return accName.includes('futur') || accName.includes('fapi') || accHost.includes('fapi') || accHost.includes('future');
      });
      if (futuresMatched.length > 0) return futuresMatched;
    } else {
      const spotMatched = binanceAccounts.filter(acc => {
        const accName = cleanStr(acc.account_name || '');
        const accHost = cleanStr(acc.connection_host || '');
        return !accName.includes('futur') && !accHost.includes('fapi') && !accHost.includes('future');
      });
      if (spotMatched.length > 0) return spotMatched;
    }

    if (binanceAccounts.length > 0) return binanceAccounts;
  }

  // 3. Ecossistema CTRADER
  if (source.ecosystem === 'ctrader') {
    const ctraderAccounts = accounts.filter(acc => cleanStr(acc.platform) === 'ctrader');
    if (source.broker) {
      const brokerTarget = cleanStr(source.broker);
      const brokerMatched = ctraderAccounts.filter(acc => {
        const accBroker = cleanStr(acc.broker || '');
        const accName = cleanStr(acc.account_name || '');
        return accBroker.includes(brokerTarget) || accName.includes(brokerTarget);
      });
      if (brokerMatched.length > 0) return brokerMatched;
    }
    if (ctraderAccounts.length > 0) return ctraderAccounts;
  }

  // 4. Ecossistema SUPABASE & NT8
  if (source.ecosystem === 'supabase' || source.ecosystem === 'nt8') {
    // Retorna contas demo Axion ou contas operacionais
    const axionOrDemo = accounts.filter(acc => {
      const plat = cleanStr(acc.platform);
      return plat === 'axion' || acc.account_type === 'internal_demo';
    });
    if (axionOrDemo.length > 0) return axionOrDemo;
  }

  // Fallback: todas as contas que não sejam NT8 execução pura
  return accounts.filter(acc => cleanStr(acc.platform) !== 'nt8');
}

/**
 * Validação rigorosa de correspondência entre um tick recebido e um painel/gráfico.
 * IMPEDE CONTAMINAÇÃO CRUZADA entre Binance, MetaTrader, cTrader e Supabase/NT8.
 * NUNCA utiliza isSameAsset (que funde incorretamente BTCUSDT com BTCUSD).
 */
export function isTickMatchingPanel(detail: any, panel: any, activeAccount?: any): boolean {
  if (!detail || !panel) return false;

  const tickSym = String(detail.symbol || detail.panel || '').toUpperCase().trim();
  const tickSrc = String(detail.source || '').toLowerCase().trim();
  if (!tickSym) return false;

  const panelSource = resolveAssetSource(panel, activeAccount);
  const pName = String(panel.name || panel.id || '').toUpperCase().trim();
  const pSym = String(panel.symbol || '').toUpperCase().trim();
  const pInst = String(panel.instance_id || '').toUpperCase().trim();

  // 1. Ecossistema BINANCE
  if (panelSource.ecosystem === 'binance') {
    // Rejeita qualquer tick explicitamente vindo de MT4/MT5/cTrader/NT8/Supabase
    if (tickSrc && !['binance', 'crypto'].includes(tickSrc)) return false;

    const cleanSym = tickSym.replace(/[^A-Z0-9]/g, '');
    const cleanPSym = pSym.replace(/[^A-Z0-9]/g, '');
    const cleanPInst = pInst.replace(/[^A-Z0-9]/g, '');
    const cleanPName = pName.replace(/[^A-Z0-9]/g, '');

    // Match estrito: deve ser exatamente o mesmo par (ex: BTCUSDT bate com BTCUSDT, jamais com BTCUSD)
    if (cleanSym === cleanPSym || cleanSym === cleanPInst) return true;
    if (cleanPName.startsWith(cleanSym) || pName.startsWith(cleanSym)) return true;
    return false;
  }

  // 2. Ecossistema METATRADER (MT4 / MT5)
  if (panelSource.ecosystem === 'mt') {
    // Rejeita qualquer tick explicitamente vindo da Binance, cTrader, NT8 ou Supabase
    if (tickSrc && !['mt', 'mt4', 'mt5', 'metatrader'].includes(tickSrc)) return false;

    // Rejeita tickers com terminação USDT/BUSD/USDC (típicos de crypto spot/futuros Binance)
    if (tickSym.endsWith('USDT') || tickSym.endsWith('BUSD') || tickSym.endsWith('USDC')) return false;

    const basePName = pName.split('-')[0].trim();
    if (tickSym === pSym || tickSym === pInst) return true;
    if (tickSym === basePName) return true;
    if (pInst.toLowerCase() === tickSym.toLowerCase() || pInst.toLowerCase() === `mt4_${tickSym.toLowerCase()}`) return true;
    return false;
  }

  // 3. Ecossistema CTRADER
  if (panelSource.ecosystem === 'ctrader') {
    if (tickSrc && tickSrc !== 'ctrader') return false;
    const basePName = pName.split('-')[0].trim();
    return tickSym === pSym || tickSym === pInst || tickSym === basePName;
  }

  // 4. Ecossistema SUPABASE / NINJATRADER 8
  if (panelSource.ecosystem === 'supabase' || panelSource.ecosystem === 'nt8') {
    // Rejeita ticks de Binance ou MetaTrader
    if (tickSrc && ['binance', 'mt', 'mt4', 'mt5', 'ctrader'].includes(tickSrc)) return false;
    if (/USDT|BUSD|USDC/i.test(tickSym)) return false;
    if (/^(BTC|ETH|SOL|BNB|EURUSD|GBPUSD|AUDUSD|USDJPY)/i.test(tickSym)) return false;

    if (tickSym === pSym || tickSym === pInst || tickSym === pName) return true;

    // Ativos canônicos padrão: NQ -> NASDAQ, ES -> SP500, RTY -> RUSSEL2000, YM -> DOWJONES, CL -> OIL, GC -> GOLD
    const canonicalMap: Record<string, string[]> = {
      'NASDAQ': ['NQ', 'MNQ', 'NASDAQ'],
      'SP500': ['ES', 'MES', 'SP500', 'S&P500'],
      'RUSSEL2000': ['RTY', 'M2K', 'RUSSELL2000', 'RUSSEL2000', 'RUSSELL'],
      'DOWJONES': ['YM', 'MYM', 'DOWJONES', 'DOW'],
      'OIL': ['CL', 'MCL', 'OIL', 'PETROLEO'],
      'GOLD': ['GC', 'MGC', 'GOLD', 'OURO']
    };
    for (const [canon, aliases] of Object.entries(canonicalMap)) {
      if (pName.includes(canon) || pInst.includes(canon.toLowerCase())) {
        if (aliases.includes(tickSym)) return true;
      }
    }
    return false;
  }

  return false;
}

