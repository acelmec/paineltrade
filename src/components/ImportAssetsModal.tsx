import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { getLocalPlatformConnections } from '../services/connectionsService';
import { isStandardSupabasePanel } from '../services/db';

export interface SuggestedAssetItem {
  symbol: string;
  name: string;
  category: 'Forex' | 'Metais & Energia' | 'Índices' | 'Cripto';
  tickSize: number;
  pointValue: number;
  defaultSl: number;
  defaultTp: number;
}

export const PRESET_MARKET_ASSETS: SuggestedAssetItem[] = [
  // Criptomoedas Principais (Binance Spot & Futuros USDT-M)
  { symbol: 'BTCUSDT', name: 'Bitcoin / Tether USDT', category: 'Cripto', tickSize: 0.10, pointValue: 1.0, defaultSl: 400, defaultTp: 800 },
  { symbol: 'ETHUSDT', name: 'Ethereum / Tether USDT', category: 'Cripto', tickSize: 0.01, pointValue: 1.0, defaultSl: 30, defaultTp: 60 },
  { symbol: 'SOLUSDT', name: 'Solana / Tether USDT', category: 'Cripto', tickSize: 0.01, pointValue: 1.0, defaultSl: 3.0, defaultTp: 6.0 },
  { symbol: 'BNBUSDT', name: 'BNB / Tether USDT', category: 'Cripto', tickSize: 0.01, pointValue: 1.0, defaultSl: 5.0, defaultTp: 10.0 },
  { symbol: 'XRPUSDT', name: 'Ripple / Tether USDT', category: 'Cripto', tickSize: 0.0001, pointValue: 1.0, defaultSl: 0.05, defaultTp: 0.10 },
  { symbol: 'DOGEUSDT', name: 'Dogecoin / Tether USDT', category: 'Cripto', tickSize: 0.00001, pointValue: 1.0, defaultSl: 0.01, defaultTp: 0.02 },
  { symbol: 'ADAUSDT', name: 'Cardano / Tether USDT', category: 'Cripto', tickSize: 0.0001, pointValue: 1.0, defaultSl: 0.04, defaultTp: 0.08 },
  { symbol: 'AVAXUSDT', name: 'Avalanche / Tether USDT', category: 'Cripto', tickSize: 0.01, pointValue: 1.0, defaultSl: 1.0, defaultTp: 2.0 },
  { symbol: 'LINKUSDT', name: 'Chainlink / Tether USDT', category: 'Cripto', tickSize: 0.001, pointValue: 1.0, defaultSl: 0.50, defaultTp: 1.0 },
  { symbol: 'NEARUSDT', name: 'Near Protocol / Tether USDT', category: 'Cripto', tickSize: 0.001, pointValue: 1.0, defaultSl: 0.30, defaultTp: 0.60 },
  { symbol: 'SUIUSDT', name: 'Sui / Tether USDT', category: 'Cripto', tickSize: 0.0001, pointValue: 1.0, defaultSl: 0.10, defaultTp: 0.20 },
  { symbol: 'PEPEUSDT', name: 'Pepe / Tether USDT', category: 'Cripto', tickSize: 0.00000001, pointValue: 1.0, defaultSl: 0.000001, defaultTp: 0.000002 },

  // Forex Majors
  { symbol: 'EURUSD', name: 'Euro / US Dollar', category: 'Forex', tickSize: 0.00001, pointValue: 100000, defaultSl: 0.0020, defaultTp: 0.0040 },
  { symbol: 'GBPUSD', name: 'British Pound / US Dollar', category: 'Forex', tickSize: 0.00001, pointValue: 100000, defaultSl: 0.0025, defaultTp: 0.0050 },
  { symbol: 'USDJPY', name: 'US Dollar / Japanese Yen', category: 'Forex', tickSize: 0.001, pointValue: 1000, defaultSl: 0.30, defaultTp: 0.60 },
  { symbol: 'AUDUSD', name: 'Australian Dollar / US Dollar', category: 'Forex', tickSize: 0.00001, pointValue: 100000, defaultSl: 0.0020, defaultTp: 0.0040 },
  { symbol: 'USDCAD', name: 'US Dollar / Canadian Dollar', category: 'Forex', tickSize: 0.00001, pointValue: 100000, defaultSl: 0.0020, defaultTp: 0.0040 },
  { symbol: 'USDCHF', name: 'US Dollar / Swiss Franc', category: 'Forex', tickSize: 0.00001, pointValue: 100000, defaultSl: 0.0020, defaultTp: 0.0040 },
  { symbol: 'NZDUSD', name: 'New Zealand Dollar / US Dollar', category: 'Forex', tickSize: 0.00001, pointValue: 100000, defaultSl: 0.0020, defaultTp: 0.0040 },
  { symbol: 'EURGBP', name: 'Euro / British Pound', category: 'Forex', tickSize: 0.00001, pointValue: 100000, defaultSl: 0.0020, defaultTp: 0.0040 },
  { symbol: 'EURJPY', name: 'Euro / Japanese Yen', category: 'Forex', tickSize: 0.001, pointValue: 1000, defaultSl: 0.35, defaultTp: 0.70 },
  { symbol: 'GBPJPY', name: 'British Pound / Japanese Yen', category: 'Forex', tickSize: 0.001, pointValue: 1000, defaultSl: 0.40, defaultTp: 0.80 },

  // Metais & Commodities
  { symbol: 'XAUUSD', name: 'Gold / US Dollar (Ouro)', category: 'Metais & Energia', tickSize: 0.01, pointValue: 100, defaultSl: 5.0, defaultTp: 10.0 },
  { symbol: 'XAGUSD', name: 'Silver / US Dollar (Prata)', category: 'Metais & Energia', tickSize: 0.001, pointValue: 5000, defaultSl: 0.20, defaultTp: 0.40 },
  { symbol: 'USOIL', name: 'WTI Crude Oil', category: 'Metais & Energia', tickSize: 0.01, pointValue: 1000, defaultSl: 0.80, defaultTp: 1.60 },

  // Índices Mundiais
  { symbol: 'US30', name: 'Dow Jones CFD', category: 'Índices', tickSize: 1.0, pointValue: 1.0, defaultSl: 80, defaultTp: 160 },
  { symbol: 'US500', name: 'S&P 500 CFD', category: 'Índices', tickSize: 0.10, pointValue: 10, defaultSl: 15, defaultTp: 30 },
  { symbol: 'USTEC', name: 'Nasdaq 100 CFD', category: 'Índices', tickSize: 0.25, pointValue: 20, defaultSl: 40, defaultTp: 80 },
  { symbol: 'GER40', name: 'DAX 40 CFD', category: 'Índices', tickSize: 0.50, pointValue: 25, defaultSl: 35, defaultTp: 70 }
];

interface ImportAssetsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportAssetsModal: React.FC<ImportAssetsModalProps> = ({ isOpen, onClose }) => {
  const { panels, createPanelAction, deletePanelAction, switchPanel, addLog, activeAccount } = useApp() as any;
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(new Set());
  const [detectedSymbols, setDetectedSymbols] = useState<string[]>([]);
  const [isSearchingBridge, setIsSearchingBridge] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [customSymbol, setCustomSymbol] = useState('');

  const [brokerSuffix, setBrokerSuffix] = useState<string>(() => {
    if (activeAccount?.platform === 'binance') {
      const isFut = (activeAccount.connection_host && (activeAccount.connection_host.includes('future') || activeAccount.connection_host.includes('fapi'))) || (activeAccount.account_name || '').toLowerCase().includes('futuro');
      return isFut ? 'Binance Futuros' : 'Binance';
    }
    if (activeAccount?.broker && activeAccount.broker !== 'MetaTrader 4' && activeAccount.broker !== 'MetaTrader Server') {
      return activeAccount.broker;
    }
    const accName = (activeAccount?.account_name || '').toUpperCase();
    if (accName.includes('ACTIVE') || accName.includes('ACTIVETRADE') || accName.includes('ACTIVTRADES')) return 'ActivTrades';
    if (accName.includes('PEPPER')) return 'Pepperstone';
    if (activeAccount?.platform === 'mt4' || activeAccount?.platform === 'mt5') return 'ActivTrades';
    return '';
  });

  // Atualiza brokerSuffix quando o modal abre ou a conta ativa muda
  useEffect(() => {
    if (activeAccount?.platform === 'binance') {
      const isFut = (activeAccount.connection_host && (activeAccount.connection_host.includes('future') || activeAccount.connection_host.includes('fapi'))) || (activeAccount.account_name || '').toLowerCase().includes('futuro');
      setBrokerSuffix(isFut ? 'Binance Futuros' : 'Binance');
    } else if (activeAccount?.broker && !['MetaTrader 4', 'MetaTrader Server', 'MetaTrader 5'].includes(activeAccount.broker)) {
      setBrokerSuffix(activeAccount.broker);
    } else {
      const accName = (activeAccount?.account_name || '').toUpperCase();
      if (accName.includes('ACTIVE') || accName.includes('ACTIVETRADE') || accName.includes('ACTIVTRADES')) setBrokerSuffix('ActivTrades');
      else if (accName.includes('PEPPER')) setBrokerSuffix('Pepperstone');
      else if (activeAccount?.platform === 'mt4' || activeAccount?.platform === 'mt5') setBrokerSuffix('ActivTrades');
    }
  }, [activeAccount, isOpen]);

  // Separação estrita:
  // 1) Ativos Padrão do Axion (incluídos pelo Admin e que usam Supabase) -> PROTEGIDOS (não podem ser excluídos)
  // 2) Ativos Sincronizados pelo Usuário (via conectores NT8 / MetaTrader / Cripto) -> PODEM ser excluídos
  const standardAxionPanels = (panels || []).filter((p: any) => isStandardSupabasePanel(p));
  const syncedConnectorPanels = (panels || []).filter((p: any) => !isStandardSupabasePanel(p));

  const getMatchingSyncedPanels = (sym: string): any[] => {
    const upper = sym.toUpperCase().trim();
    return syncedConnectorPanels.filter((p: any) => {
      const pName = String(p.name || '').toUpperCase().trim();
      const pBase = pName.split(' - ')[0].trim();
      const pSym = String(p.symbol || '').toUpperCase().trim();
      const pInst = String(p.instance_id || '').toUpperCase().trim();
      return pName === upper || pBase === upper || pSym === upper || pInst === upper;
    });
  };

  // Mapeia ativos sincronizados já existentes em panels para controle de "Já ativo"
  const existingSet = new Set(
    syncedConnectorPanels.map((p: any) => {
      const name = String(p.name || '').toUpperCase().trim();
      const baseName = name.split(' - ')[0].trim();
      const sym = String(p.symbol || '').toUpperCase().trim();
      const inst = String(p.instance_id || '').toUpperCase().trim();
      return [name, baseName, sym, inst];
    }).flat().filter(Boolean)
  );

  // Inicializa a seleção com os ativos que ainda NÃO existem quando o modal abre
  useEffect(() => {
    if (isOpen) {
      const toSelect = new Set<string>();
      if (activeAccount?.platform === 'binance') {
        PRESET_MARKET_ASSETS.filter(item => item.category === 'Cripto').forEach(item => {
          if (!existingSet.has(item.symbol.toUpperCase())) {
            toSelect.add(item.symbol);
          }
        });
      } else {
        PRESET_MARKET_ASSETS.forEach(item => {
          if (!existingSet.has(item.symbol.toUpperCase())) {
            toSelect.add(item.symbol);
          }
        });
      }
      setSelectedSymbols(toSelect);
      if (activeAccount?.platform !== 'binance') {
        fetchLiveBrokerSymbols();
      }
    }
  }, [isOpen, activeAccount]);

  const handleAddCustomSymbol = () => {
    const raw = customSymbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!raw) return;
    const finalSym = (!raw.endsWith('USDT') && !raw.endsWith('BUSD') && !raw.endsWith('USDC') && activeAccount?.platform === 'binance')
      ? `${raw}USDT`
      : raw;

    if (!PRESET_MARKET_ASSETS.some(a => a.symbol === finalSym)) {
      PRESET_MARKET_ASSETS.unshift({
        symbol: finalSym,
        name: `${finalSym} (Cripto Par)`,
        category: 'Cripto',
        tickSize: finalSym.startsWith('BTC') ? 0.10 : (finalSym.startsWith('ETH') ? 0.01 : 0.001),
        pointValue: 1.0,
        defaultSl: 50,
        defaultTp: 100
      });
    }

    setSelectedSymbols(prev => {
      const next = new Set(prev);
      next.add(finalSym);
      return next;
    });
    setCustomSymbol('');
  };

  const handleDeleteSyncedPanels = async (panelsToRemove: any[], symLabel?: string) => {
    if (!deletePanelAction || panelsToRemove.length === 0) return;
    // Filtra apenas ativos sincronizados via conectores (nunca ativos padrão Supabase)
    const allowed = panelsToRemove.filter(p => !isStandardSupabasePanel(p));
    if (allowed.length === 0) {
      if (addLog) {
        addLog('AVISO', '🔒 Ativos padrão do Axion (Supabase) são protegidos e não podem ser excluídos.', 'alerta');
      }
      return;
    }

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
      if (symLabel) {
        // Já marca o ativo recém-excluído para facilitar reimportação imediata com sufixo correto (ex: BTCUSD - ActivTrades)
        setSelectedSymbols(prev => {
          const next = new Set(prev);
          next.add(symLabel);
          return next;
        });
      }
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        allowed.forEach(p => next.delete(p.id));
        return next;
      });
    }
  };

  const handleDeleteAllSynced = async () => {
    if (!deletePanelAction || syncedConnectorPanels.length === 0) return;
    setIsDeletingAll(true);
    try {
      await handleDeleteSyncedPanels(syncedConnectorPanels);
      if (addLog) {
        addLog('SISTEMA', `🗑️ Todos os ${syncedConnectorPanels.length} ativos sincronizados pelos conectores foram removidos. Os ativos padrão do Axion (Supabase) foram preservados.`, 'sistema');
      }
    } finally {
      setIsDeletingAll(false);
    }
  };

  const fetchLiveBrokerSymbols = async () => {
    setIsSearchingBridge(true);
    try {
      const mtConns = getLocalPlatformConnections().filter(c => (c.platform === 'mt4' || c.platform === 'mt5') && c.is_active);
      const activeConn = mtConns.find(c => c.status === 'online') || mtConns[0];
      const host = (activeConn?.host_url || 'http://144.126.141.254').replace(/\/+$/, '');

      const res = await fetch(`${host}/symbols`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.detected_symbols) && data.detected_symbols.length > 0) {
          setDetectedSymbols(data.detected_symbols);
          // Adiciona os detectados à seleção se não existirem
          setSelectedSymbols(prev => {
            const next = new Set(prev);
            data.detected_symbols.forEach((s: string) => {
              if (!existingSet.has(s.toUpperCase())) {
                next.add(s.toUpperCase());
              }
            });
            return next;
          });
        }
      }

      // Tenta obter o nome real da corretora a partir do conector MT4
      const accRes = await fetch(`${host}/accounts`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
      if (accRes && accRes.ok) {
        const accData = await accRes.json();
        if (Array.isArray(accData.accounts) && accData.accounts.length > 0) {
          const firstB = accData.accounts[0].broker;
          if (firstB && !['MetaTrader 4', 'MetaTrader 5', 'MetaTrader Server'].includes(firstB)) {
            setBrokerSuffix(prev => prev ? prev : firstB);
          }
        }
      }
    } catch (_) {
      // Ignora erro se bridge offline ou sem conexão direta
    } finally {
      setIsSearchingBridge(false);
    }
  };

  if (!isOpen) return null;

  const handleToggleSymbol = (sym: string) => {
    setSelectedSymbols(prev => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
  };

  const handleSelectAll = (filterCat?: string) => {
    const next = new Set<string>();
    PRESET_MARKET_ASSETS.forEach(a => {
      if (!existingSet.has(a.symbol.toUpperCase())) {
        if (!filterCat || a.category === filterCat) {
          next.add(a.symbol);
        }
      }
    });
    detectedSymbols.forEach(s => {
      if (!existingSet.has(s.toUpperCase())) next.add(s);
    });
    setSelectedSymbols(next);
  };

  const handleDeselectAll = () => {
    setSelectedSymbols(new Set());
  };

  const handleImport = async () => {
    if (!createPanelAction) return;
    const toImport = Array.from(selectedSymbols).filter(s => !existingSet.has(s.toUpperCase()));
    if (toImport.length === 0) {
      alert('Nenhum ativo novo selecionado para importação.');
      return;
    }

    setIsImporting(true);
    let importedCount = 0;

    for (let i = 0; i < toImport.length; i++) {
      const sym = toImport[i];
      setImportProgress({ current: i + 1, total: toImport.length, name: sym });

      // Busca propriedades pré-definidas ou defaults adequados
      const preset = PRESET_MARKET_ASSETS.find(p => p.symbol.toUpperCase() === sym.toUpperCase());
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
      const finalName = brokerSuffix.trim() ? `${sym} - ${brokerSuffix.trim()}` : sym;
      const success = await createPanelAction(finalName, instanceId, point, tick, sl, tp);
      if (success) {
        importedCount++;
      }
    }

    setIsImporting(false);
    setImportProgress(null);
    if (addLog) {
      addLog('SISTEMA', `✅ ${importedCount} ativo(s) de Forex / Índices importado(s) com sucesso!`, 'sucesso');
    }

    // Se o usuário importou ativos, atualiza o gráfico para o primeiro ativo importado
    if (toImport.length > 0 && switchPanel) {
      const firstSym = toImport[0];
      const found = (panels || []).find((p: any) => p.name?.toUpperCase() === firstSym.toUpperCase());
      if (found?.id) {
        switchPanel(found.id);
      }
    }

    setTimeout(() => {
      onClose();
    }, 400);
  };

  const categories: Array<SuggestedAssetItem['category']> = ['Forex', 'Metais & Energia', 'Índices', 'Cripto'];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-slate-200">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⚡</span>
            <div>
              <h3 className="text-sm font-black tracking-wide text-white flex items-center gap-2">
                Importar Ativos da Corretora / MT4 / Forex
                {isSearchingBridge && (
                  <span className="text-[10px] text-sky-400 font-normal animate-pulse">
                    (Detectando Market Watch...)
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400">
                Selecione os pares de moedas, índices e metais para cadastrar no seu gráfico e na boleta.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {/* Sufixo da Corretora / Conexão (Ex: ActivTrades) */}
        <div className="px-5 py-2.5 bg-slate-900 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-[260px]">
            <span className="text-[11px] font-bold text-slate-300 shrink-0 flex items-center gap-1.5">
              <span>🏷️</span>
              <span>Sufixo da Corretora / Conta:</span>
            </span>
            <input
              type="text"
              value={brokerSuffix}
              onChange={(e) => setBrokerSuffix(e.target.value)}
              placeholder="Ex: ActivTrades, Pepperstone, MT4"
              className="bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-2.5 py-1 text-xs text-sky-300 font-bold outline-none flex-1 max-w-xs shadow-inner"
            />
          </div>
          <div className="text-[10px] text-slate-400 bg-slate-950/60 px-2 py-1 rounded border border-slate-800">
            Formato na boleta/gráfico: <span className="font-black text-sky-300">BTCUSD{brokerSuffix.trim() ? ` - ${brokerSuffix.trim()}` : ''}</span>
          </div>
        </div>

        {/* Banner Informativo se a Conta Ativa for Binance */}
        {activeAccount?.platform === 'binance' && (
          <div className="mx-5 my-2.5 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-xl shrink-0">🟡</span>
              <div>
                <div className="font-black text-amber-300">Conta Binance Conectada ({activeAccount.account_name})</div>
                <div className="text-[10px] text-slate-300">Selecione os pares de cripto (ex: BTCUSDT, ETHUSDT) para carregar o gráfico ao vivo e boleta.</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                handleSelectAll('Cripto');
                const isFut = (activeAccount.connection_host && (activeAccount.connection_host.includes('future') || activeAccount.connection_host.includes('fapi'))) || (activeAccount.account_name || '').toLowerCase().includes('futuro');
                setBrokerSuffix(isFut ? 'Binance Futuros' : 'Binance');
              }}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-xs shadow transition active:scale-95 shrink-0 cursor-pointer"
            >
              ⚡ Selecionar Pares Binance
            </button>
          </div>
        )}

        {/* Filtros e Ações Rápidas */}
        <div className="px-5 py-2.5 bg-slate-950/40 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-400 font-bold uppercase mr-1">Filtros:</span>
            <button
              type="button"
              onClick={() => handleSelectAll()}
              className="px-2 py-0.5 rounded bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-700/60 font-bold text-[10px]"
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => handleSelectAll('Cripto')}
              className="px-2 py-0.5 rounded bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-700/60 font-bold text-[10px]"
            >
              🟡 Cripto (Binance)
            </button>
            <button
              type="button"
              onClick={() => handleSelectAll('Forex')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold text-[10px]"
            >
              Apenas Forex
            </button>
            <button
              type="button"
              onClick={() => handleSelectAll('Índices')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold text-[10px]"
            >
              Apenas Índices
            </button>
            <button
              type="button"
              onClick={() => handleSelectAll('Metais & Energia')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold text-[10px]"
            >
              Metais (Ouro)
            </button>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="px-2 py-0.5 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-400 border border-slate-700/60 font-bold text-[10px]"
            >
              Limpar
            </button>
          </div>
          <div className="text-[11px] font-bold text-sky-400">
            {selectedSymbols.size} selecionado(s)
          </div>
        </div>

        {/* Adicionar Par Cripto Personalizado */}
        <div className="px-5 py-2 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-[11px] font-bold text-slate-300 shrink-0">➕ Par Personalizado:</span>
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
              placeholder="Ex: SOLUSDT, BNBUSDT, PEPEUSDT"
              className="bg-slate-950 border border-slate-700 focus:border-amber-400 rounded px-2.5 py-1 text-xs text-white uppercase outline-none flex-1 max-w-xs shadow-inner"
            />
            <button
              type="button"
              onClick={handleAddCustomSymbol}
              disabled={!customSymbol.trim()}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 rounded font-black text-xs transition cursor-pointer shadow"
            >
              Adicionar
            </button>
          </div>
          <span className="text-[10px] text-slate-400 hidden sm:inline">
            Adiciona qualquer par USDT ao catálogo.
          </span>
        </div>

        {/* Lista de Ativos Agrupados */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Painel de Gestão de Ativos Sincronizados vs Padrão Axion */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <span>🔌</span>
                  <span>Ativos Sincronizados pelos Conectores ({syncedConnectorPanels.length})</span>
                </span>
                <span className="text-[10px] text-slate-400">
                  (NT8 / MetaTrader — podem ser excluídos)
                </span>
              </div>
              {syncedConnectorPanels.length > 0 && (
                <button
                  type="button"
                  disabled={isDeletingAll || isImporting}
                  onClick={handleDeleteAllSynced}
                  className="px-2.5 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-200 font-black text-[10px] transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <span>🗑️</span>
                  <span>{isDeletingAll ? 'Excluindo...' : `Excluir Todos Sincronizados (${syncedConnectorPanels.length})`}</span>
                </button>
              )}
            </div>

            {syncedConnectorPanels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {syncedConnectorPanels.map((p: any) => {
                  const isDeletingThis = deletingIds.has(p.id);
                  return (
                    <div
                      key={p.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700/80 text-[11px] text-slate-200"
                    >
                      <span className="font-bold text-sky-300">{p.name}</span>
                      <button
                        type="button"
                        disabled={isDeletingThis || isDeletingAll || isImporting}
                        onClick={() => handleDeleteSyncedPanels([p], String(p.name || '').split(' - ')[0].trim())}
                        title={`Excluir ativo sincronizado ${p.name}`}
                        className="ml-1 px-1.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-800 text-rose-300 hover:text-white border border-rose-700/50 text-[9px] font-black transition cursor-pointer disabled:opacity-50"
                      >
                        {isDeletingThis ? '...' : '🗑️ Excluir'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 italic">
                Nenhum ativo de conector sincronizado no momento.
              </div>
            )}

            {standardAxionPanels.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 mr-1 flex items-center gap-1">
                  <span>🔒</span>
                  <span>Padrão Axion (Supabase — Protegidos):</span>
                </span>
                {standardAxionPanels.map((sp: any) => (
                  <span
                    key={sp.id}
                    className="px-2 py-0.5 rounded bg-slate-900/90 border border-slate-800 text-[10px] font-bold text-slate-400 flex items-center gap-1 select-none"
                    title="Ativo padrão do Axion alimentado via Supabase (protegido pelo Admin)"
                  >
                    <span>🔒</span>
                    <span>{sp.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {detectedSymbols.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Ativos Detectados no Market Watch do seu MT4 ({detectedSymbols.length})</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {detectedSymbols.map(sym => {
                  const matchedPanels = getMatchingSyncedPanels(sym);
                  const isAlreadyExists = matchedPanels.length > 0;
                  const isDeletingSym = matchedPanels.some(p => deletingIds.has(p.id));
                  const isChecked = selectedSymbols.has(sym);
                  const activeNames = matchedPanels.map(p => p.name).join(', ');
                  return (
                    <div
                      key={`det_${sym}`}
                      onClick={() => !isAlreadyExists && handleToggleSymbol(sym)}
                      className={`p-2 rounded-xl border flex items-center justify-between text-xs transition select-none ${
                        isAlreadyExists
                          ? 'bg-slate-900/60 border-slate-700/80 text-slate-300'
                          : isChecked
                          ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200 shadow-sm cursor-pointer'
                          : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:bg-slate-800 cursor-pointer'
                      }`}
                    >
                      <div className="min-w-0 pr-1">
                        <div className="font-black truncate">
                          {sym}{brokerSuffix.trim() ? ` - ${brokerSuffix.trim()}` : ''}
                        </div>
                        <div className="text-[9px] text-slate-400 truncate">
                          {isAlreadyExists ? `Ativo: ${activeNames}` : 'Corretora MT4'}
                        </div>
                      </div>
                      {isAlreadyExists ? (
                        <button
                          type="button"
                          disabled={isDeletingSym || isDeletingAll || isImporting}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSyncedPanels(matchedPanels, sym);
                          }}
                          title={`Excluir ${activeNames} (Sincronizado via conector)`}
                          className="px-2 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-800 border border-rose-700/60 text-rose-200 hover:text-white text-[9px] font-black shrink-0 transition cursor-pointer disabled:opacity-50"
                        >
                          {isDeletingSym ? '...' : '🗑️ Excluir'}
                        </button>
                      ) : (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-3.5 h-3.5 accent-emerald-500 rounded pointer-events-none shrink-0"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {categories.map(cat => {
            const items = PRESET_MARKET_ASSETS.filter(a => a.category === cat);
            return (
              <div key={cat} className="space-y-1.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>{cat}</span>
                  <span className="text-[9px] font-normal text-slate-500">{items.length} ativos</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {items.map(item => {
                    const matchedPanels = getMatchingSyncedPanels(item.symbol);
                    const isAlreadyExists = matchedPanels.length > 0;
                    const isDeletingSym = matchedPanels.some(p => deletingIds.has(p.id));
                    const isChecked = selectedSymbols.has(item.symbol);
                    const activeNames = matchedPanels.map(p => p.name).join(', ');
                    return (
                      <div
                        key={item.symbol}
                        onClick={() => !isAlreadyExists && handleToggleSymbol(item.symbol)}
                        className={`p-2 rounded-xl border flex items-center justify-between text-xs transition select-none ${
                          isAlreadyExists
                            ? 'bg-slate-900/60 border-slate-700/80 text-slate-300'
                            : isChecked
                            ? 'bg-blue-950/60 border-blue-500 text-blue-200 shadow-sm cursor-pointer'
                            : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:bg-slate-800 cursor-pointer'
                        }`}
                      >
                        <div className="min-w-0 pr-1">
                          <div className="font-black truncate">
                            {item.symbol}{brokerSuffix.trim() ? ` - ${brokerSuffix.trim()}` : ''}
                          </div>
                          <div className="text-[9px] text-slate-400 truncate">
                            {isAlreadyExists ? `Ativo: ${activeNames}` : item.name}
                          </div>
                        </div>
                        {isAlreadyExists ? (
                          <button
                            type="button"
                            disabled={isDeletingSym || isDeletingAll || isImporting}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSyncedPanels(matchedPanels, item.symbol);
                            }}
                            title={`Excluir ${activeNames} (Sincronizado via conector)`}
                            className="px-2 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-800 border border-rose-700/60 text-rose-200 hover:text-white text-[9px] font-black shrink-0 ml-1 transition cursor-pointer disabled:opacity-50"
                          >
                            {isDeletingSym ? '...' : '🗑️ Excluir'}
                          </button>
                        ) : (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="w-3.5 h-3.5 accent-blue-500 rounded pointer-events-none shrink-0 ml-1"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer com Botão de Importar */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            {importProgress ? (
              <span className="text-sky-400 font-bold animate-pulse">
                Importando {importProgress.name} ({importProgress.current}/{importProgress.total})...
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
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Cancelar
            </button>
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
              <span>{isImporting ? 'Importando...' : `Importar (${selectedSymbols.size}) Ativos`}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
