import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { getLocalPlatformConnections } from '../services/connectionsService';
import { isStandardSupabasePanel } from '../services/db';

export type PlatformTab = 'binance' | 'metatrader' | 'ctrader' | 'nt8';

export interface CatalogAssetItem {
  symbol: string;
  name: string;
  category: 'Cripto' | 'Forex' | 'Metais & Commodities' | 'Índices' | 'Futuros';
  platform: PlatformTab | 'all';
  tickSize: number;
  pointValue: number;
  defaultSl: number;
  defaultTp: number;
  recommended?: boolean;
}

// Catálogo Consolidado de Ativos por Plataforma
export const MASTER_PLATFORM_CATALOG: CatalogAssetItem[] = [
  // ==================== BINANCE (Cripto USDT) ====================
  { symbol: 'BTCUSDT', name: 'Bitcoin / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.10, pointValue: 1.0, defaultSl: 400, defaultTp: 800, recommended: true },
  { symbol: 'ETHUSDT', name: 'Ethereum / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.01, pointValue: 1.0, defaultSl: 30, defaultTp: 60, recommended: true },
  { symbol: 'SOLUSDT', name: 'Solana / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.01, pointValue: 1.0, defaultSl: 3.0, defaultTp: 6.0, recommended: true },
  { symbol: 'BNBUSDT', name: 'BNB / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.01, pointValue: 1.0, defaultSl: 5.0, defaultTp: 10.0, recommended: true },
  { symbol: 'XRPUSDT', name: 'Ripple / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.0001, pointValue: 1.0, defaultSl: 0.05, defaultTp: 0.10, recommended: true },
  { symbol: 'DOGEUSDT', name: 'Dogecoin / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.00001, pointValue: 1.0, defaultSl: 0.01, defaultTp: 0.02, recommended: true },
  { symbol: 'ADAUSDT', name: 'Cardano / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.0001, pointValue: 1.0, defaultSl: 0.04, defaultTp: 0.08 },
  { symbol: 'AVAXUSDT', name: 'Avalanche / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.01, pointValue: 1.0, defaultSl: 1.0, defaultTp: 2.0 },
  { symbol: 'LINKUSDT', name: 'Chainlink / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.001, pointValue: 1.0, defaultSl: 0.50, defaultTp: 1.0 },
  { symbol: 'NEARUSDT', name: 'Near Protocol / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.001, pointValue: 1.0, defaultSl: 0.30, defaultTp: 0.60 },
  { symbol: 'SUIUSDT', name: 'Sui / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.0001, pointValue: 1.0, defaultSl: 0.10, defaultTp: 0.20 },
  { symbol: 'PEPEUSDT', name: 'Pepe / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.00000001, pointValue: 1.0, defaultSl: 0.000001, defaultTp: 0.000002 },
  { symbol: 'DOTUSDT', name: 'Polkadot / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.001, pointValue: 1.0, defaultSl: 0.20, defaultTp: 0.40 },
  { symbol: 'LTCUSDT', name: 'Litecoin / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.01, pointValue: 1.0, defaultSl: 2.0, defaultTp: 4.0 },
  { symbol: 'SHIBUSDT', name: 'Shiba Inu / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.00000001, pointValue: 1.0, defaultSl: 0.000001, defaultTp: 0.000002 },
  { symbol: 'TRXUSDT', name: 'TRON / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.00001, pointValue: 1.0, defaultSl: 0.01, defaultTp: 0.02 },
  { symbol: 'UNIUSDT', name: 'Uniswap / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.001, pointValue: 1.0, defaultSl: 0.30, defaultTp: 0.60 },
  { symbol: 'APTUSDT', name: 'Aptos / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.001, pointValue: 1.0, defaultSl: 0.40, defaultTp: 0.80 },
  { symbol: 'INJUSDT', name: 'Injective / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.001, pointValue: 1.0, defaultSl: 0.80, defaultTp: 1.60 },
  { symbol: 'TIAUSDT', name: 'Celestia / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.001, pointValue: 1.0, defaultSl: 0.30, defaultTp: 0.60 },
  { symbol: 'RENDERUSDT', name: 'Render / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.001, pointValue: 1.0, defaultSl: 0.25, defaultTp: 0.50 },
  { symbol: 'TAOUSDT', name: 'Bittensor / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.01, pointValue: 1.0, defaultSl: 15.0, defaultTp: 30.0 },
  { symbol: 'WIFUSDT', name: 'dogwifhat / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.0001, pointValue: 1.0, defaultSl: 0.10, defaultTp: 0.20 },
  { symbol: 'BONKUSDT', name: 'Bonk / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.00000001, pointValue: 1.0, defaultSl: 0.000001, defaultTp: 0.000002 },
  { symbol: 'FLOKIUSDT', name: 'Floki / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.0000001, pointValue: 1.0, defaultSl: 0.000005, defaultTp: 0.00001 },
  { symbol: 'OPUSDT', name: 'Optimism / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.0001, pointValue: 1.0, defaultSl: 0.08, defaultTp: 0.16 },
  { symbol: 'ARBUSDT', name: 'Arbitrum / Tether USDT', category: 'Cripto', platform: 'binance', tickSize: 0.0001, pointValue: 1.0, defaultSl: 0.05, defaultTp: 0.10 },

  // ==================== METATRADER (MT4 / MT5) ====================
  // Forex Majors & Minors
  { symbol: 'EURUSD', name: 'Euro / US Dollar', category: 'Forex', platform: 'metatrader', tickSize: 0.00001, pointValue: 100000, defaultSl: 0.0020, defaultTp: 0.0040, recommended: true },
  { symbol: 'GBPUSD', name: 'British Pound / US Dollar', category: 'Forex', platform: 'metatrader', tickSize: 0.00001, pointValue: 100000, defaultSl: 0.0025, defaultTp: 0.0050, recommended: true },
  { symbol: 'USDJPY', name: 'US Dollar / Japanese Yen', category: 'Forex', platform: 'metatrader', tickSize: 0.001, pointValue: 1000, defaultSl: 0.30, defaultTp: 0.60, recommended: true },
  { symbol: 'AUDUSD', name: 'Australian Dollar / US Dollar', category: 'Forex', platform: 'metatrader', tickSize: 0.00001, pointValue: 100000, defaultSl: 0.0020, defaultTp: 0.0040 },
  { symbol: 'USDCAD', name: 'US Dollar / Canadian Dollar', category: 'Forex', platform: 'metatrader', tickSize: 0.00001, pointValue: 100000, defaultSl: 0.0020, defaultTp: 0.0040 },
  { symbol: 'USDCHF', name: 'US Dollar / Swiss Franc', category: 'Forex', platform: 'metatrader', tickSize: 0.00001, pointValue: 100000, defaultSl: 0.0020, defaultTp: 0.0040 },
  { symbol: 'NZDUSD', name: 'New Zealand Dollar / US Dollar', category: 'Forex', platform: 'metatrader', tickSize: 0.00001, pointValue: 100000, defaultSl: 0.0020, defaultTp: 0.0040 },
  { symbol: 'EURGBP', name: 'Euro / British Pound', category: 'Forex', platform: 'metatrader', tickSize: 0.00001, pointValue: 100000, defaultSl: 0.0020, defaultTp: 0.0040 },
  { symbol: 'EURJPY', name: 'Euro / Japanese Yen', category: 'Forex', platform: 'metatrader', tickSize: 0.001, pointValue: 1000, defaultSl: 0.35, defaultTp: 0.70 },
  { symbol: 'GBPJPY', name: 'British Pound / Japanese Yen', category: 'Forex', platform: 'metatrader', tickSize: 0.001, pointValue: 1000, defaultSl: 0.40, defaultTp: 0.80 },
  // Metais & Commodities MT
  { symbol: 'XAUUSD', name: 'Gold / US Dollar (Ouro)', category: 'Metais & Commodities', platform: 'metatrader', tickSize: 0.01, pointValue: 100, defaultSl: 5.0, defaultTp: 10.0, recommended: true },
  { symbol: 'XAGUSD', name: 'Silver / US Dollar (Prata)', category: 'Metais & Commodities', platform: 'metatrader', tickSize: 0.001, pointValue: 5000, defaultSl: 0.20, defaultTp: 0.40 },
  { symbol: 'USOIL', name: 'WTI Crude Oil', category: 'Metais & Commodities', platform: 'metatrader', tickSize: 0.01, pointValue: 1000, defaultSl: 0.80, defaultTp: 1.60 },
  { symbol: 'UKOIL', name: 'Brent Crude Oil', category: 'Metais & Commodities', platform: 'metatrader', tickSize: 0.01, pointValue: 1000, defaultSl: 0.80, defaultTp: 1.60 },
  // Índices Mundiais CFD MT
  { symbol: 'US30', name: 'Dow Jones CFD (Wall Street 30)', category: 'Índices', platform: 'metatrader', tickSize: 1.0, pointValue: 1.0, defaultSl: 80, defaultTp: 160, recommended: true },
  { symbol: 'US500', name: 'S&P 500 CFD (SPX500)', category: 'Índices', platform: 'metatrader', tickSize: 0.10, pointValue: 10, defaultSl: 15, defaultTp: 30, recommended: true },
  { symbol: 'USTEC', name: 'Nasdaq 100 CFD (NAS100)', category: 'Índices', platform: 'metatrader', tickSize: 0.25, pointValue: 20, defaultSl: 40, defaultTp: 80, recommended: true },
  { symbol: 'GER40', name: 'DAX 40 CFD (Germany 40)', category: 'Índices', platform: 'metatrader', tickSize: 0.50, pointValue: 25, defaultSl: 35, defaultTp: 70 },
  // Cripto CFD MT
  { symbol: 'BTCUSD', name: 'Bitcoin CFD (MT4/MT5)', category: 'Cripto', platform: 'metatrader', tickSize: 0.10, pointValue: 1.0, defaultSl: 400, defaultTp: 800 },
  { symbol: 'ETHUSD', name: 'Ethereum CFD (MT4/MT5)', category: 'Cripto', platform: 'metatrader', tickSize: 0.01, pointValue: 1.0, defaultSl: 30, defaultTp: 60 },

  // ==================== CTRADER ====================
  { symbol: 'EURUSD', name: 'Euro / US Dollar', category: 'Forex', platform: 'ctrader', tickSize: 0.00001, pointValue: 100000, defaultSl: 0.0020, defaultTp: 0.0040, recommended: true },
  { symbol: 'GBPUSD', name: 'British Pound / US Dollar', category: 'Forex', platform: 'ctrader', tickSize: 0.00001, pointValue: 100000, defaultSl: 0.0025, defaultTp: 0.0050, recommended: true },
  { symbol: 'USDJPY', name: 'US Dollar / Japanese Yen', category: 'Forex', platform: 'ctrader', tickSize: 0.001, pointValue: 1000, defaultSl: 0.30, defaultTp: 0.60, recommended: true },
  { symbol: 'XAUUSD', name: 'Gold / US Dollar', category: 'Metais & Commodities', platform: 'ctrader', tickSize: 0.01, pointValue: 100, defaultSl: 5.0, defaultTp: 10.0, recommended: true },
  { symbol: 'US30', name: 'US Wall Street 30 CFD', category: 'Índices', platform: 'ctrader', tickSize: 1.0, pointValue: 1.0, defaultSl: 80, defaultTp: 160 },
  { symbol: 'US500', name: 'US 500 CFD', category: 'Índices', platform: 'ctrader', tickSize: 0.10, pointValue: 10, defaultSl: 15, defaultTp: 30 },
  { symbol: 'USTEC', name: 'US Tech 100 CFD', category: 'Índices', platform: 'ctrader', tickSize: 0.25, pointValue: 20, defaultSl: 40, defaultTp: 80 },

  // ==================== NINJATRADER 8 ====================
  { symbol: 'NQ', name: 'E-mini Nasdaq-100 Futures', category: 'Futuros', platform: 'nt8', tickSize: 0.25, pointValue: 20, defaultSl: 30, defaultTp: 60, recommended: true },
  { symbol: 'MNQ', name: 'Micro E-mini Nasdaq-100', category: 'Futuros', platform: 'nt8', tickSize: 0.25, pointValue: 2, defaultSl: 30, defaultTp: 60, recommended: true },
  { symbol: 'ES', name: 'E-mini S&P 500 Futures', category: 'Futuros', platform: 'nt8', tickSize: 0.25, pointValue: 50, defaultSl: 12, defaultTp: 24, recommended: true },
  { symbol: 'MES', name: 'Micro E-mini S&P 500', category: 'Futuros', platform: 'nt8', tickSize: 0.25, pointValue: 5, defaultSl: 12, defaultTp: 24 },
  { symbol: 'YM', name: 'E-mini Dow Futures', category: 'Futuros', platform: 'nt8', tickSize: 1.0, pointValue: 5, defaultSl: 60, defaultTp: 120 },
  { symbol: 'MYM', name: 'Micro E-mini Dow Futures', category: 'Futuros', platform: 'nt8', tickSize: 1.0, pointValue: 0.5, defaultSl: 60, defaultTp: 120 },
  { symbol: 'GC', name: 'Gold Futures', category: 'Futuros', platform: 'nt8', tickSize: 0.10, pointValue: 100, defaultSl: 4.0, defaultTp: 8.0 },
  { symbol: 'MGC', name: 'Micro Gold Futures', category: 'Futuros', platform: 'nt8', tickSize: 0.10, pointValue: 10, defaultSl: 4.0, defaultTp: 8.0 },
  { symbol: 'CL', name: 'Crude Oil Futures', category: 'Futuros', platform: 'nt8', tickSize: 0.01, pointValue: 1000, defaultSl: 0.60, defaultTp: 1.20 },
  { symbol: 'WIN', name: 'Mini Índice Bovespa', category: 'Futuros', platform: 'nt8', tickSize: 5.0, pointValue: 0.2, defaultSl: 150, defaultTp: 300 },
  { symbol: 'WDO', name: 'Mini Dólar Futuro', category: 'Futuros', platform: 'nt8', tickSize: 0.5, pointValue: 10, defaultSl: 7.0, defaultTp: 14.0 },
];

interface ImportAssetsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportAssetsModal: React.FC<ImportAssetsModalProps> = ({ isOpen, onClose }) => {
  const { panels, createPanelAction, deletePanelAction, switchPanel, addLog, activeAccount, accounts } = useApp() as any;

  // Plataforma ativa (Aba do topo)
  const [activeTab, setActiveTab] = useState<PlatformTab>(() => {
    if (activeAccount?.platform === 'binance') return 'binance';
    if (activeAccount?.platform === 'mt4' || activeAccount?.platform === 'mt5') return 'metatrader';
    if (activeAccount?.platform === 'ctrader') return 'ctrader';
    if (activeAccount?.platform === 'nt8' || activeAccount?.platform === 'ninjatrader') return 'nt8';
    return 'binance';
  });

  // Busca inteligente
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(new Set());
  const [customSymbol, setCustomSymbol] = useState('');

  // Status de importação e exclusão
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Símbolos detectados via conector MT4/MT5
  const [detectedSymbols, setDetectedSymbols] = useState<string[]>([]);
  const [isSearchingBridge, setIsSearchingBridge] = useState(false);

  // Conexões locais da Central de Conexões
  const [localConnections, setLocalConnections] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      try {
        const conns = getLocalPlatformConnections();
        setLocalConnections(conns || []);
      } catch {
        setLocalConnections([]);
      }
    }
  }, [isOpen]);

  // Alinha a aba com a conta ativa ao abrir
  useEffect(() => {
    if (isOpen && activeAccount) {
      if (activeAccount.platform === 'binance') setActiveTab('binance');
      else if (activeAccount.platform === 'mt4' || activeAccount.platform === 'mt5') setActiveTab('metatrader');
      else if (activeAccount.platform === 'ctrader') setActiveTab('ctrader');
      else if (activeAccount.platform === 'nt8' || activeAccount.platform === 'ninjatrader') setActiveTab('nt8');
    }
  }, [isOpen, activeAccount]);

  // Reset de busca e seleção ao trocar de aba
  useEffect(() => {
    setSearchQuery('');
    setSelectedSymbols(new Set());
  }, [activeTab]);

  // Detecta símbolos ao vivo do MetaTrader se aba for 'metatrader'
  useEffect(() => {
    if (isOpen && activeTab === 'metatrader') {
      fetchLiveBrokerSymbols();
    }
  }, [isOpen, activeTab]);

  const fetchLiveBrokerSymbols = async () => {
    setIsSearchingBridge(true);
    try {
      const mtConns = (localConnections || []).filter(c => (c.platform === 'mt4' || c.platform === 'mt5') && c.is_active);
      const activeConn = mtConns.find(c => c.status === 'online') || mtConns[0];
      const host = (activeConn?.host_url || 'http://144.126.141.254').replace(/\/+$/, '');

      const res = await fetch(`${host}/symbols`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.detected_symbols) && data.detected_symbols.length > 0) {
          setDetectedSymbols(data.detected_symbols);
        }
      }
    } catch (_) {
      // Ignora erro se bridge offline
    } finally {
      setIsSearchingBridge(false);
    }
  };

  // ==================== CHECAGEM DE CONEXÕES ATIVAS ====================
  const isBinanceConnected = useMemo(() => {
    const hasAcc = (accounts || []).some((a: any) => a.platform === 'binance' && a.is_active);
    const hasConn = (localConnections || []).some((c: any) => c.platform === 'binance' && c.is_active);
    return hasAcc || hasConn;
  }, [accounts, localConnections]);

  const isMetaTraderConnected = useMemo(() => {
    const hasAcc = (accounts || []).some((a: any) => (a.platform === 'mt4' || a.platform === 'mt5') && a.is_active);
    const hasConn = (localConnections || []).some((c: any) => (c.platform === 'mt4' || c.platform === 'mt5') && c.is_active);
    return hasAcc || hasConn;
  }, [accounts, localConnections]);

  const isCTraderConnected = useMemo(() => {
    const hasAcc = (accounts || []).some((a: any) => a.platform === 'ctrader' && a.is_active);
    const hasConn = (localConnections || []).some((c: any) => c.platform === 'ctrader' && c.is_active);
    return hasAcc || hasConn;
  }, [accounts, localConnections]);

  const isNT8Connected = useMemo(() => {
    const hasAcc = (accounts || []).some((a: any) => (a.platform === 'nt8' || a.platform === 'ninjatrader') && a.is_active);
    const hasConn = (localConnections || []).some((c: any) => (c.platform === 'nt8' || c.platform === 'ninjatrader') && c.is_active);
    return hasAcc || hasConn;
  }, [accounts, localConnections]);

  const isCurrentTabConnected = useMemo(() => {
    if (activeTab === 'binance') return isBinanceConnected;
    if (activeTab === 'metatrader') return isMetaTraderConnected;
    if (activeTab === 'ctrader') return isCTraderConnected;
    if (activeTab === 'nt8') return isNT8Connected;
    return false;
  }, [activeTab, isBinanceConnected, isMetaTraderConnected, isCTraderConnected, isNT8Connected]);

  // Sufixo da Corretora / Conexão Dinâmico por Plataforma
  const [customSuffix, setCustomSuffix] = useState<string>('');

  const defaultSuffixForTab = useMemo(() => {
    if (activeTab === 'binance') {
      const bAcc = (accounts || []).find((a: any) => a.platform === 'binance' && a.is_active);
      if (bAcc?.account_name) return bAcc.account_name;
      const isFut = bAcc?.connection_host && (bAcc.connection_host.includes('future') || bAcc.connection_host.includes('fapi'));
      return isFut ? 'Binance Futuros' : 'Binance';
    }
    if (activeTab === 'metatrader') {
      const mtAcc = (accounts || []).find((a: any) => (a.platform === 'mt4' || a.platform === 'mt5') && a.is_active);
      if (mtAcc?.broker && !['MetaTrader 4', 'MetaTrader 5', 'MetaTrader Server'].includes(mtAcc.broker)) {
        return mtAcc.broker;
      }
      const accName = (mtAcc?.account_name || '').toUpperCase();
      if (accName.includes('ACTIVE') || accName.includes('ACTIVETRADE') || accName.includes('ACTIVTRADES')) return 'ActivTrades';
      if (accName.includes('PEPPER')) return 'Pepperstone';
      return 'ActivTrades';
    }
    if (activeTab === 'ctrader') return 'cTrader';
    if (activeTab === 'nt8') return 'NT8';
    return '';
  }, [activeTab, accounts]);

  const effectiveSuffix = customSuffix.trim() || defaultSuffixForTab;

  // Atualiza customSuffix ao trocar de aba
  useEffect(() => {
    setCustomSuffix(defaultSuffixForTab);
  }, [defaultSuffixForTab]);

  // ==================== ATIVOS SINCRONIZADOS DESTA PLATAFORMA ====================
  // Filtra rigorosamente os painéis que pertencem à plataforma atual (excluindo os protegidos do Supabase)
  const platformSyncedPanels = useMemo(() => {
    const list = (panels || []).filter((p: any) => !isStandardSupabasePanel(p));
    return list.filter((p: any) => {
      const pName = String(p.name || '').toUpperCase();
      const pInst = String(p.instance_id || '').toUpperCase();

      if (activeTab === 'binance') {
        return pName.includes('BINANCE') || pInst.endsWith('USDT') || pName.includes('USDT');
      }
      if (activeTab === 'metatrader') {
        // Se for Binance, cTrader ou NT8 específico, não é MetaTrader
        if (pName.includes('BINANCE') || pInst.endsWith('USDT') || pName.includes('CTRADER') || pName.includes('NT8')) return false;
        if (pName.includes('ACTIV') || pName.includes('PEPPER') || pName.includes('MT4') || pName.includes('MT5')) return true;
        // Pares típicos de Forex/CFDs importados
        const forexSymbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'XAUUSD', 'XAGUSD', 'USOIL', 'UKOIL', 'US30', 'US500', 'USTEC', 'GER40', 'BTCUSD', 'ETHUSD'];
        return forexSymbols.some(s => pName.startsWith(s) || pInst === s.toLowerCase());
      }
      if (activeTab === 'ctrader') {
        return pName.includes('CTRADER');
      }
      if (activeTab === 'nt8') {
        return pName.includes('NT8') || pName.includes('NINJA') || ['NQ', 'MNQ', 'ES', 'MES', 'YM', 'MYM', 'GC', 'MGC', 'CL', 'MCL', 'WIN', 'WDO', 'RTY', 'M2K'].includes(pInst);
      }
      return false;
    });
  }, [panels, activeTab]);

  // Verifica se o símbolo já está ativado no Axion para a plataforma atual
  const isSymbolAlreadyImported = (sym: string): boolean => {
    const upperSym = sym.toUpperCase().trim();
    return platformSyncedPanels.some((p: any) => {
      const pName = String(p.name || '').toUpperCase().trim();
      const pInst = String(p.instance_id || '').toUpperCase().trim();
      if (pInst === upperSym.toLowerCase() || pInst === upperSym) return true;
      if (pName === upperSym || pName.startsWith(`${upperSym} -`) || pName.startsWith(`${upperSym}/`) || pName.startsWith(`${upperSym} `)) return true;
      return false;
    });
  };

  // Catálogo de ativos disponíveis para esta plataforma
  const platformCatalog = useMemo(() => {
    const baseItems = MASTER_PLATFORM_CATALOG.filter(a => a.platform === activeTab || a.platform === 'all');
    
    // Mescla símbolos detectados do MetaTrader
    if (activeTab === 'metatrader' && detectedSymbols.length > 0) {
      const existingSyms = new Set(baseItems.map(b => b.symbol.toUpperCase()));
      detectedSymbols.forEach(ds => {
        const up = ds.toUpperCase().trim();
        if (!existingSyms.has(up)) {
          baseItems.push({
            symbol: up,
            name: `${up} (Detectado no Market Watch)`,
            category: up.startsWith('XAU') || up.startsWith('OIL') ? 'Metais & Commodities' : (up.includes('USD') || up.includes('EUR') || up.includes('JPY') ? 'Forex' : 'Índices'),
            platform: 'metatrader',
            tickSize: up.includes('JPY') ? 0.001 : (up.startsWith('XAU') ? 0.01 : 0.00001),
            pointValue: 100000,
            defaultSl: 30,
            defaultTp: 60,
            recommended: false
          });
          existingSyms.add(up);
        }
      });
    }

    return baseItems;
  }, [activeTab, detectedSymbols]);

  // Filtragem da busca inteligente (estilo AssetSearchSelect)
  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || q.length < 2) {
      // Exibe recomendados / principais quando não há busca digitada
      return platformCatalog.filter(a => a.recommended !== false);
    }
    return platformCatalog.filter(a => {
      const sym = a.symbol.toLowerCase();
      const name = a.name.toLowerCase();
      const cat = a.category.toLowerCase();
      return sym.includes(q) || name.includes(q) || cat.includes(q);
    });
  }, [platformCatalog, searchQuery]);

  // ==================== SELEÇÃO E AÇÕES ====================
  const handleToggleSymbol = (sym: string) => {
    setSelectedSymbols(prev => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    const next = new Set(selectedSymbols);
    filteredCatalog.forEach(item => {
      if (!isSymbolAlreadyImported(item.symbol)) {
        next.add(item.symbol);
      }
    });
    setSelectedSymbols(next);
  };

  const handleClearSelection = () => {
    setSelectedSymbols(new Set());
  };

  // Adicionar Par Personalizado (Binance USDT)
  const handleAddCustomSymbol = () => {
    const raw = customSymbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!raw) return;
    const finalSym = (!raw.endsWith('USDT') && !raw.endsWith('BUSD') && !raw.endsWith('USDC') && activeTab === 'binance')
      ? `${raw}USDT`
      : raw;

    if (!platformCatalog.some(a => a.symbol === finalSym)) {
      MASTER_PLATFORM_CATALOG.unshift({
        symbol: finalSym,
        name: `${finalSym} (Par Cripto)`,
        category: 'Cripto',
        platform: 'binance',
        tickSize: finalSym.startsWith('BTC') ? 0.10 : (finalSym.startsWith('ETH') ? 0.01 : 0.001),
        pointValue: 1.0,
        defaultSl: 50,
        defaultTp: 100,
        recommended: true
      });
    }

    setSelectedSymbols(prev => {
      const next = new Set(prev);
      next.add(finalSym);
      return next;
    });
    setCustomSymbol('');
  };

  // ==================== EXCLUSÃO DE ATIVOS ====================
  const handleDeletePanels = async (panelsToRemove: any[]) => {
    if (!deletePanelAction || panelsToRemove.length === 0) return;
    const allowed = panelsToRemove.filter(p => !isStandardSupabasePanel(p));
    if (allowed.length === 0) return;

    setDeletingIds(prev => {
      const next = new Set(prev);
      allowed.forEach(p => next.add(p.id));
      return next;
    });

    try {
      for (let i = 0; i < allowed.length; i++) {
        const p = allowed[i];
        const isLast = i === allowed.length - 1;
        await deletePanelAction(p.id, { protectStandardAxion: true, skipReload: !isLast });
      }
      if (addLog) {
        addLog('SISTEMA', `🗑️ ${allowed.length} ativo(s) excluído(s) da plataforma com sucesso.`, 'sistema');
      }
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        allowed.forEach(p => next.delete(p.id));
        return next;
      });
    }
  };

  const handleDeleteAllForPlatform = async () => {
    if (platformSyncedPanels.length === 0) return;
    if (!window.confirm(`Tem certeza que deseja excluir todos os ${platformSyncedPanels.length} ativos sincronizados da plataforma ${activeTab.toUpperCase()}?`)) {
      return;
    }
    setIsDeletingAll(true);
    try {
      await handleDeletePanels(platformSyncedPanels);
    } finally {
      setIsDeletingAll(false);
    }
  };

  // ==================== IMPORTAÇÃO ====================
  const handleImport = async () => {
    if (!createPanelAction) return;
    const toImport = Array.from(selectedSymbols).filter(s => !isSymbolAlreadyImported(s));
    if (toImport.length === 0) {
      alert('Nenhum ativo novo selecionado para inclusão.');
      return;
    }

    setIsImporting(true);
    let importedCount = 0;

    for (let i = 0; i < toImport.length; i++) {
      const sym = toImport[i];
      setImportProgress({ current: i + 1, total: toImport.length, name: sym });

      const preset = MASTER_PLATFORM_CATALOG.find(p => p.symbol.toUpperCase() === sym.toUpperCase());
      let tick = preset?.tickSize;
      let point = preset?.pointValue || 1.0;
      let sl = preset?.defaultSl || 40;
      let tp = preset?.defaultTp || 80;

      if (!tick) {
        if (sym.includes('JPY')) tick = 0.001;
        else if (sym.startsWith('XAU') || sym.startsWith('GOLD')) tick = 0.01;
        else if (sym.startsWith('BTC')) tick = 0.10;
        else if (sym.includes('USD') || sym.includes('EUR') || sym.includes('GBP')) tick = 0.00001;
        else tick = 0.01;
      }

      const instanceId = sym.toLowerCase();
      const finalName = effectiveSuffix.trim() ? `${sym} - ${effectiveSuffix.trim()}` : sym;
      const success = await createPanelAction(finalName, instanceId, point, tick, sl, tp);
      if (success) {
        importedCount++;
      }
    }

    setIsImporting(false);
    setImportProgress(null);

    if (addLog) {
      addLog('SISTEMA', `✅ ${importedCount} ativo(s) da ${activeTab.toUpperCase()} incluído(s) com sucesso!`, 'sucesso');
    }

    // Troca o gráfico para o primeiro ativo novo importado
    if (toImport.length > 0 && switchPanel) {
      const firstSym = toImport[0];
      const targetFullName = effectiveSuffix.trim() ? `${firstSym} - ${effectiveSuffix.trim()}` : firstSym;
      setTimeout(() => {
        const found = (panels || []).find((p: any) => 
          p.name?.toUpperCase() === targetFullName.toUpperCase() || 
          p.instance_id?.toLowerCase() === firstSym.toLowerCase()
        );
        if (found?.id) {
          switchPanel(found.id);
        }
      }, 500);
    }

    setTimeout(() => {
      onClose();
    }, 400);
  };

  const handleNavigateToConnections = () => {
    onClose();
    window.dispatchEvent(new CustomEvent('vortex_navigate', { detail: 'contas' }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#0b0f19] border border-slate-700/80 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-slate-200">
        
        {/* Header Superior */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⚡</span>
            <div>
              <h3 className="text-sm font-black tracking-wide text-white flex items-center gap-2">
                Gestão e Inclusão de Ativos por Plataforma
                {isSearchingBridge && activeTab === 'metatrader' && (
                  <span className="text-[10px] text-sky-400 font-normal animate-pulse">
                    (Detectando Market Watch...)
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400">
                Selecione a plataforma, gerencie os ativos sincronizados e pesquise novos pares para operar.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* ==================== ABAS DE PLATAFORMAS ==================== */}
        <div className="flex border-b border-slate-800 bg-slate-950/90 px-4 pt-2 gap-1.5 overflow-x-auto select-none">
          {/* Binance */}
          <button
            type="button"
            onClick={() => setActiveTab('binance')}
            className={`px-3 py-2 rounded-t-xl text-xs font-black transition flex items-center gap-2 cursor-pointer border-t border-x ${
              activeTab === 'binance'
                ? 'bg-[#0b0f19] border-slate-700 text-amber-300 border-b-2 border-b-amber-400 shadow-sm'
                : 'bg-slate-900/40 border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <span className="text-sm">🟡</span>
            <span>Binance</span>
            <span className={`w-2 h-2 rounded-full ${isBinanceConnected ? 'bg-emerald-400' : 'bg-slate-600'}`} title={isBinanceConnected ? 'Conexão Binance ativa' : 'Desconectado'} />
          </button>

          {/* MetaTrader */}
          <button
            type="button"
            onClick={() => setActiveTab('metatrader')}
            className={`px-3 py-2 rounded-t-xl text-xs font-black transition flex items-center gap-2 cursor-pointer border-t border-x ${
              activeTab === 'metatrader'
                ? 'bg-[#0b0f19] border-slate-700 text-emerald-300 border-b-2 border-b-emerald-400 shadow-sm'
                : 'bg-slate-900/40 border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <span className="text-sm">🟢</span>
            <span>MetaTrader (MT4/MT5)</span>
            <span className={`w-2 h-2 rounded-full ${isMetaTraderConnected ? 'bg-emerald-400' : 'bg-slate-600'}`} title={isMetaTraderConnected ? 'Conexão MetaTrader ativa' : 'Desconectado'} />
          </button>

          {/* cTrader */}
          <button
            type="button"
            onClick={() => setActiveTab('ctrader')}
            className={`px-3 py-2 rounded-t-xl text-xs font-black transition flex items-center gap-2 cursor-pointer border-t border-x ${
              activeTab === 'ctrader'
                ? 'bg-[#0b0f19] border-slate-700 text-purple-300 border-b-2 border-b-purple-400 shadow-sm'
                : 'bg-slate-900/40 border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <span className="text-sm">🟣</span>
            <span>cTrader</span>
            <span className={`w-2 h-2 rounded-full ${isCTraderConnected ? 'bg-emerald-400' : 'bg-slate-600'}`} title={isCTraderConnected ? 'Conexão cTrader ativa' : 'Desconectado'} />
          </button>

          {/* NinjaTrader 8 */}
          <button
            type="button"
            onClick={() => setActiveTab('nt8')}
            className={`px-3 py-2 rounded-t-xl text-xs font-black transition flex items-center gap-2 cursor-pointer border-t border-x ${
              activeTab === 'nt8'
                ? 'bg-[#0b0f19] border-slate-700 text-sky-300 border-b-2 border-b-sky-400 shadow-sm'
                : 'bg-slate-900/40 border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <span className="text-sm">🔵</span>
            <span>NinjaTrader 8</span>
            <span className={`w-2 h-2 rounded-full ${isNT8Connected ? 'bg-emerald-400' : 'bg-slate-600'}`} title={isNT8Connected ? 'Conexão NinjaTrader 8 ativa' : 'Desconectado'} />
          </button>
        </div>

        {/* ==================== CASO NÃO HAJA CONEXÃO ATIVA ==================== */}
        {!isCurrentTabConnected ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-950/40 my-auto">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center text-3xl mb-4 shadow-xl">
              {activeTab === 'binance' && '🟡'}
              {activeTab === 'metatrader' && '🟢'}
              {activeTab === 'ctrader' && '🟣'}
              {activeTab === 'nt8' && '🔵'}
            </div>
            
            <h4 className="text-base font-black text-white mb-2">
              Nenhuma Conexão {activeTab === 'binance' ? 'Binance' : activeTab === 'metatrader' ? 'MetaTrader' : activeTab === 'ctrader' ? 'cTrader' : 'NinjaTrader 8'} Ativa
            </h4>
            
            <p className="text-xs text-slate-400 max-w-md leading-relaxed mb-6">
              {activeTab === 'binance' && 'Para carregar cotações em tempo real e operar pares de cripto (BTCUSDT, ETHUSDT, etc.), cadastre sua API Key ou ative a Binance Testnet na Central de Conexões.'}
              {activeTab === 'metatrader' && 'Para importar pares de Forex, Índices e Commodities da sua corretora (ActivTrades, Pepperstone, etc.), conecte o conector MT4/MT5 na Central de Conexões.'}
              {activeTab === 'ctrader' && 'Para sincronizar ativos via FIX API ou Spotware Open API do cTrader, cadastre e ative sua conta na Central de Conexões.'}
              {activeTab === 'nt8' && 'Para sincronizar contratos futuros do NinjaTrader 8 (NQ, ES, WIN, WDO), conecte o Add-On do NinjaTrader na Central de Conexões.'}
            </p>

            <button
              type="button"
              onClick={handleNavigateToConnections}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-black text-xs transition shadow-lg shadow-blue-600/20 active:scale-95 cursor-pointer flex items-center gap-2"
            >
              <span>🔌</span>
              <span>Abrir Central de Conexões</span>
              <span>➔</span>
            </button>
          </div>
        ) : (
          /* ==================== CONTEÚDO PRINCIPAL QUANDO CONECTADO ==================== */
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {/* Sufixo da Corretora / Conta */}
            <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                <span className="text-[11px] font-bold text-slate-300 shrink-0 flex items-center gap-1.5">
                  <span>🏷️</span>
                  <span>Sufixo no Gráfico/Boleta:</span>
                </span>
                <input
                  type="text"
                  value={customSuffix}
                  onChange={(e) => setCustomSuffix(e.target.value)}
                  placeholder={defaultSuffixForTab}
                  className="bg-slate-900 border border-slate-700 focus:border-blue-500 rounded-lg px-2.5 py-1 text-xs text-sky-300 font-bold outline-none flex-1 max-w-xs shadow-inner"
                />
              </div>
              <div className="text-[10px] text-slate-400 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-800">
                Exemplo: <span className="font-black text-sky-300">
                  {activeTab === 'binance' ? 'SOLUSDT' : activeTab === 'metatrader' ? 'EURUSD' : activeTab === 'nt8' ? 'NQ' : 'EURUSD'}
                  {effectiveSuffix ? ` - ${effectiveSuffix}` : ''}
                </span>
              </div>
            </div>

            {/* SEÇÃO 1: ATIVOS SINCRONIZADOS NESTA PLATAFORMA */}
            <div className="rounded-xl border border-slate-800/90 bg-slate-950/80 p-3.5 space-y-2.5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                    <span>🔌</span>
                    <span>Ativos Sincronizados ({platformSyncedPanels.length})</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    (Ativados no Axion para {activeTab.toUpperCase()} — podem ser excluídos)
                  </span>
                </div>

                {platformSyncedPanels.length > 0 && (
                  <button
                    type="button"
                    disabled={isDeletingAll || isImporting}
                    onClick={handleDeleteAllForPlatform}
                    className="px-2.5 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-200 font-black text-[10px] transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <span>🗑️</span>
                    <span>{isDeletingAll ? 'Excluindo...' : `Excluir Todos de ${activeTab.toUpperCase()} (${platformSyncedPanels.length})`}</span>
                  </button>
                )}
              </div>

              {platformSyncedPanels.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {platformSyncedPanels.map((p: any) => {
                    const isDeletingThis = deletingIds.has(p.id);
                    return (
                      <div
                        key={p.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700/80 text-[11px] text-slate-200 shadow-sm"
                      >
                        <span className="font-bold text-sky-300 truncate max-w-[170px]" title={p.name}>
                          {p.name}
                        </span>
                        <button
                          type="button"
                          disabled={isDeletingThis || isDeletingAll || isImporting}
                          onClick={() => handleDeletePanels([p])}
                          title={`Excluir ativo sincronizado ${p.name}`}
                          className="ml-1 px-1.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-800 text-rose-300 hover:text-white border border-rose-700/50 text-[9px] font-black transition cursor-pointer disabled:opacity-50"
                        >
                          {isDeletingThis ? '...' : '🗑️'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 bg-slate-900/40 p-2.5 rounded-lg border border-dashed border-slate-800">
                  Nenhum ativo desta plataforma foi adicionado ainda. Faça uma busca abaixo para incluir novos pares.
                </div>
              )}
            </div>

            {/* SEÇÃO 2: INCLUIR NOVOS ATIVOS (BUSCA INTELIGENTE ESTILO ASSETSEARCHSELECT) */}
            <div className="rounded-xl border border-slate-800/90 bg-slate-950/80 p-3.5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
                    <span>➕</span>
                    <span>Incluir Novos Ativos ({activeTab.toUpperCase()})</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Busque por símbolo ou nome
                  </span>
                </div>
                {selectedSymbols.size > 0 && (
                  <span className="text-[11px] font-black text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/60">
                    {selectedSymbols.size} selecionado(s)
                  </span>
                )}
              </div>

              {/* Input de Busca Inteligente (estilo AssetSearchSelect) */}
              <div className="relative">
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 focus-within:border-blue-500 rounded-xl px-3 py-2 text-xs shadow-inner">
                  <span className="text-slate-400 text-sm">🔍</span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Digite no mínimo 2 letras (ex: BTC, SOL, EUR, GOLD, US30)..."
                    className="bg-transparent text-white font-bold outline-none flex-1 placeholder:text-slate-500 text-xs uppercase"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Adicionar Par Personalizado (Se Binance ou termo livre) */}
              {activeTab === 'binance' && (
                <div className="p-2 bg-slate-900/60 border border-slate-800 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <span className="text-[10px] font-bold text-amber-300 shrink-0">➕ Par USDT Custom:</span>
                    <input
                      type="text"
                      value={customSymbol}
                      onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomSymbol();
                        }
                      }}
                      placeholder="Ex: RENDERUSDT, KASUSDT"
                      className="bg-slate-950 border border-slate-700 focus:border-amber-400 rounded px-2 py-0.5 text-xs text-white uppercase outline-none flex-1 max-w-[180px]"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomSymbol}
                      disabled={!customSymbol.trim()}
                      className="px-2 py-0.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 rounded font-black text-[11px] transition cursor-pointer shadow"
                    >
                      Adicionar
                    </button>
                  </div>
                  <span className="text-[9px] text-slate-500 hidden sm:inline">
                    Adicione qualquer par USDT da Binance
                  </span>
                </div>
              )}

              {/* Lista Vertical de Resultados da Busca (Estilo Limpo) */}
              <div className="max-h-56 overflow-y-auto space-y-1 pr-1 border border-slate-800/80 rounded-xl p-1.5 bg-slate-900/40">
                {filteredCatalog.length > 0 ? (
                  filteredCatalog.map(item => {
                    const isAlreadyImported = isSymbolAlreadyImported(item.symbol);
                    const isChecked = selectedSymbols.has(item.symbol);

                    return (
                      <div
                        key={item.symbol}
                        onClick={() => !isAlreadyImported && handleToggleSymbol(item.symbol)}
                        className={`px-3 py-2 rounded-lg border flex items-center justify-between transition select-none ${
                          isAlreadyImported
                            ? 'bg-slate-900/40 border-slate-800 text-slate-400 opacity-70 cursor-default'
                            : isChecked
                            ? 'bg-blue-950/60 border-blue-500 text-blue-200 shadow-sm cursor-pointer'
                            : 'bg-slate-900/80 border-slate-800/80 text-slate-300 hover:bg-slate-800/90 hover:border-slate-700 cursor-pointer'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-xs text-white tracking-wider">
                              {item.symbol}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800/80 text-slate-400 border border-slate-700/60 font-medium">
                              {item.category}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            {item.name}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          {isAlreadyImported ? (
                            <span className="text-[9px] font-black text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60 flex items-center gap-1">
                              <span>✓</span>
                              <span>Ativado</span>
                            </span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="w-4 h-4 accent-blue-500 rounded pointer-events-none cursor-pointer"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-center text-xs text-slate-400">
                    Nenhum ativo encontrado para "{searchQuery}".
                    {activeTab === 'binance' && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCustomSymbol(searchQuery.toUpperCase());
                            handleAddCustomSymbol();
                          }}
                          className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold hover:bg-amber-500/30 transition cursor-pointer"
                        >
                          ➕ Adicionar "{searchQuery.toUpperCase()}{!searchQuery.toUpperCase().endsWith('USDT') ? 'USDT' : ''}" como Par Personalizado
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Botões Rápidos de Seleção */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] transition cursor-pointer border border-slate-700"
                  >
                    Marcar Todos os Resultados
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="px-2.5 py-1 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-400 font-bold text-[10px] transition cursor-pointer border border-slate-700/60"
                  >
                    Limpar Seleção
                  </button>
                </div>
                <div className="text-[10px] text-slate-400">
                  {filteredCatalog.length} ativo(s) no catálogo
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ==================== FOOTER ==================== */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            {importProgress ? (
              <span className="text-sky-400 font-bold animate-pulse">
                Sincronizando {importProgress.name} ({importProgress.current}/{importProgress.total})...
              </span>
            ) : (
              <span>Os ativos criados ficam disponíveis imediatamente no gráfico e na boleta.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            >
              Fechar
            </button>
            {isCurrentTabConnected && (
              <button
                type="button"
                onClick={handleImport}
                disabled={isImporting || selectedSymbols.size === 0}
                className={`px-4 py-1.5 text-xs font-black rounded-lg transition shadow-lg flex items-center gap-1.5 ${
                  isImporting || selectedSymbols.size === 0
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer active:scale-95'
                }`}
              >
                <span>⚡</span>
                <span>{isImporting ? 'Sincronizando...' : `Incluir (${selectedSymbols.size}) Ativos`}</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
