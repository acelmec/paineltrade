import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  saveBatchCopyTradingConfigsSupabase,
  saveLocalCopyTradingConfigs,
  deleteCopyTradingConfigSupabase,
  deleteBatchCopyTradingConfigsSupabase,
  getLocalCopyTradingConfigs,
  getLocalCopyMessages,
  clearLocalCopyMessages,
  syncAllCopyRulesToNinjaTrader,
  generateSecureUUID,
  fetchNinjaLiveBridgeSnapshotSupabase,
  sendNinjaRemoteCommandSupabase,
  saveNinjaAccountMetricsCache,
  getNinjaAccountMetricsCache,
  isSameAsset
} from '../services/db';
import type { CopyTradingConfig, CopyTradingMessage } from '../services/db';
import {
  checkNinjaStatus,
  fetchNinjaAccounts,
  fetchNinjaPositionsAndOrders,
  fetchNinjaCopyRules,
  closeNinjaPosition,
  cancelNinjaOrder,
  cancelAllNinjaOrders,
  flattenAllNinjaAccounts,
  fetchNinjaAccountPerformance
} from '../services/ninjaGateway';
import type { NinjaAccountDto, NinjaPositionDto, NinjaWorkingOrderDto, NinjaAccountPerformance, NinjaStatusDto } from '../services/ninjaGateway';
import { NinjaSyncModal } from './NinjaSyncModal';

interface MasterGroup {
  masterAccountId: string;
  slaves: CopyTradingConfig[];
  activeSlavesCount: number;
  totalSlavesCount: number;
}

export const CopyTradingDashboard: React.FC = () => {
  const {
    user,
    userPermissions,
    planDetails,
    canAccessCopyTrading,
    accounts,
    refreshAccounts,
    copyConfigs,
    setCopyConfigs,
    refreshCopyConfigs,
    addLog,
    isRestrictedSession
  } = useApp();

  const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
  const maxAccountsAllowed = isSystemAdmin ? 999 : (planDetails?.maxSyncAccounts || userPermissions?.max_accounts || 10);

  const [activeTab, setActiveTab] = useState<'rules' | 'positions' | 'performance' | 'messages' | 'guide'>(() => {
    return isRestrictedSession ? 'positions' : 'rules';
  });
  const [isNinjaSyncOpen, setIsNinjaSyncOpen] = useState(false);
  const [ninjaOnline, setNinjaOnline] = useState(false);
  const [ninjaLatency, setNinjaLatency] = useState<number | null>(null);
  const [ninjaStatusInfo, setNinjaStatusInfo] = useState<NinjaStatusDto | null>(null);
  const [activeRejectionAlert, setActiveRejectionAlert] = useState<{
    message: string;
    slaveAccount: string;
    isLicenseBlocked?: boolean;
  } | null>(null);
  const [isRemoteBridge, setIsRemoteBridge] = useState(false);
  const [bridgeLastSyncedTime, setBridgeLastSyncedTime] = useState<string | null>(null);
  const [ninjaAccounts, setNinjaAccounts] = useState<NinjaAccountDto[]>([]);
  const [openPositions, setOpenPositions] = useState<NinjaPositionDto[]>([]);
  const [workingOrders, setWorkingOrders] = useState<NinjaWorkingOrderDto[]>([]);
  const [accountsPerformance, setAccountsPerformance] = useState<NinjaAccountPerformance[]>([]);
  const [isPerformanceLoading, setIsPerformanceLoading] = useState(false);
  const [perfFilterQuery, setPerfFilterQuery] = useState('');
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [isPanicModalOpen, setIsPanicModalOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isOpenPositionsExpanded, setIsOpenPositionsExpanded] = useState(true);
  const [isWorkingOrdersExpanded, setIsWorkingOrdersExpanded] = useState(true);

  // Mensagens e Auditoria de Copy Trading
  const [copyMessages, setCopyMessages] = useState<CopyTradingMessage[]>(() => getLocalCopyMessages());
  const [msgFilterType, setMsgFilterType] = useState<'ALL' | 'REJEITADO' | 'COPIADO' | 'ALERTA'>('ALL');
  const [msgSearchTerm, setMsgSearchTerm] = useState('');

  // Form State para Nova/Editar Regra de Copy
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [formMasterAccount, setFormMasterAccount] = useState('');
  const [formSelectedSlaves, setFormSelectedSlaves] = useState<string[]>([]);
  const [formMultiplier, setFormMultiplier] = useState(1.0);
  const [formAllowedSymbols, setFormAllowedSymbols] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formCloseSlavesOnMasterClose, setFormCloseSlavesOnMasterClose] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const lastNinjaRulesPollTime = useRef<number>(0);

  // Sincronização em tempo real com a tabela do Supabase ao abrir o painel e periodicamente (Multi-PC / Conexão Restrita)
  useEffect(() => {
    let isMounted = true;
    const syncFromCloud = async () => {
      if (!isMounted || isRuleModalOpen) return;
      try {
        const loadedAccs = await refreshAccounts(false);
        await refreshCopyConfigs(loadedAccs);
      } catch (_) {}
    };
    syncFromCloud();
    const cloudInterval = setInterval(syncFromCloud, 6000);
    return () => {
      isMounted = false;
      clearInterval(cloudInterval);
    };
  }, [isRuleModalOpen]);

  const isCopyOnly = useMemo(() => {
    if (planDetails?.isCopyTraderOnly) return true;
    try {
      const stored = localStorage.getItem('vortex_plan_details');
      if (stored) {
        const p = JSON.parse(stored);
        if (p?.isCopyTraderOnly || p?.productId === 9286 || p?.product_id === 9286) return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, [planDetails]);

  // Contas do NinjaTrader 8 estritamente sincronizadas/cadastradas nesta assinatura
  const ntAccounts = useMemo(() => accounts.filter(a => a.platform === 'nt8' || a.send_localhost), [accounts]);
  const hasSyncedAccounts = ntAccounts.length > 0 || (!isCopyOnly && accounts.length > 0);

  // Set com os nomes das contas NT8 sincronizadas (em lowercase) para filtragens ultra-rápidas
  const syncedNt8NamesSet = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach(a => {
      const name = (a.account_name || (a as any).name || a.id || '').trim().toLowerCase();
      if (name) set.add(name);
    });
    copyConfigs.forEach(c => {
      const mName = (c.master_account_name || c.master_account_id || '').trim().toLowerCase();
      const sName = (c.slave_account_name || c.slave_account_id || '').trim().toLowerCase();
      if (mName) set.add(mName);
      if (sName) set.add(sName);
    });
    ninjaAccounts.forEach(a => {
      const name = (a.name || a.displayName || '').trim().toLowerCase();
      if (name) set.add(name);
    });
    return set;
  }, [accounts, copyConfigs, ninjaAccounts]);

  // Contas Demo Axion (internas - bloqueadas em planos Copy Only)
  const demoAxionAccounts = useMemo(() => {
    if (isCopyOnly) return [];
    return accounts.filter(a => a.platform !== 'nt8' && !a.send_localhost);
  }, [accounts, isCopyOnly]);

  // Lista de contas Master permitidas: Contas Demo Axion (se não for Copy Only) E Contas NT8 Sincronizadas
  const availableMasterAccountNames = useMemo(() => {
    const list = isCopyOnly ? ntAccounts : accounts;
    return Array.from(new Set(list.map(a => a.account_name || a.id))).filter(Boolean);
  }, [accounts, ntAccounts, isCopyOnly]);

  // Helper para exibir nome amigável da conta em vez de UUID cru
  const getAccountDisplayName = useCallback((accId: string, fallbackName?: string) => {
    if (!accId && !fallbackName) return '';
    const target = (accId || fallbackName || '').trim();
    const acc = accounts.find(
      a =>
        a.id === target ||
        (a.account_name && a.account_name.trim().toLowerCase() === target.toLowerCase()) ||
        (fallbackName && a.account_name && a.account_name.trim().toLowerCase() === fallbackName.trim().toLowerCase())
    );
    return acc?.account_name || fallbackName || accId;
  }, [accounts]);

  // Lista de Slaves disponíveis: ESTRITAMENTE contas NT8 sincronizadas, excluindo a Master selecionada
  const availableSlaveOptions = useMemo(() => {
    const masterNameLower = (formMasterAccount || '').trim().toLowerCase();
    return ntAccounts
      .map(a => a.account_name || a.id)
      .filter(name => Boolean(name) && name.trim().toLowerCase() !== masterNameLower);
  }, [ntAccounts, formMasterAccount]);

  // Agrupar regras de copy por Conta Master (unificando por ID canônico/nome para suportar Multi-PC)
  const masterGroups = useMemo<MasterGroup[]>(() => {
    const map = new Map<string, { masterAccountId: string; slaves: CopyTradingConfig[] }>();
    for (const config of copyConfigs) {
      const displayMaster = getAccountDisplayName(config.master_account_id, config.master_account_name);
      const groupKey = (displayMaster || config.master_account_id || '').trim().toLowerCase();
      if (!groupKey) continue;
      const existing = map.get(groupKey);
      if (existing) {
        existing.slaves.push(config);
      } else {
        map.set(groupKey, {
          masterAccountId: config.master_account_id,
          slaves: [config]
        });
      }
    }

    const groups: MasterGroup[] = [];
    map.forEach(({ masterAccountId, slaves }) => {
      groups.push({
        masterAccountId,
        slaves,
        activeSlavesCount: slaves.filter(s => s.is_active !== false).length,
        totalSlavesCount: slaves.length
      });
    });
    return groups;
  }, [copyConfigs, getAccountDisplayName]);

  // Checagem periódica do NinjaTrader (Local ou via Cloud Bridge do PC Principal)
  const checkStatus = useCallback(async () => {
    const applyBridgeSnapshot = (bridgeSnap: any) => {
      setIsRemoteBridge(true);
      setNinjaOnline(true);
      setNinjaLatency(bridgeSnap.latencyMs || 25);
      const bridgeAccs = bridgeSnap.accounts || [];
      const syncedBridgeAccs = bridgeAccs.filter((a: any) =>
        syncedNt8NamesSet.size === 0 || syncedNt8NamesSet.has((a.name || '').trim().toLowerCase())
      );
      setNinjaAccounts(syncedBridgeAccs.length > 0 ? syncedBridgeAccs : bridgeAccs);

      const rawPositions = bridgeSnap.positions || [];
      const filteredBridgePositions = rawPositions.filter((p: any) =>
        !p.account || syncedNt8NamesSet.size === 0 || syncedNt8NamesSet.has(p.account.trim().toLowerCase())
      );
      setOpenPositions(filteredBridgePositions.length > 0 ? filteredBridgePositions : rawPositions);

      const rawOrders = bridgeSnap.orders || [];
      const filteredBridgeOrders = rawOrders.filter((o: any) =>
        !o.account || syncedNt8NamesSet.size === 0 || syncedNt8NamesSet.has(o.account.trim().toLowerCase())
      );
      setWorkingOrders(filteredBridgeOrders.length > 0 ? filteredBridgeOrders : rawOrders);
      if (bridgeSnap.updatedAt) {
        setBridgeLastSyncedTime(new Date(bridgeSnap.updatedAt).toLocaleTimeString('pt-BR'));
      }
      if (bridgeSnap.performance && bridgeSnap.performance.length > 0) {
        setAccountsPerformance(bridgeSnap.performance.filter((ap: any) =>
          syncedNt8NamesSet.size === 0 ||
          (ap.name && syncedNt8NamesSet.has(ap.name.trim().toLowerCase())) ||
          (ap.displayName && syncedNt8NamesSet.has(ap.displayName.trim().toLowerCase()))
        ));
      }
      if (bridgeSnap.metricsMap) {
        saveNinjaAccountMetricsCache(bridgeSnap.metricsMap);
      }
      if (bridgeSnap.copyMessages && bridgeSnap.copyMessages.length > 0) {
        setCopyMessages(bridgeSnap.copyMessages);
      }
    };

    try {
      // 📱 Sessão restrita (celular / acesso remoto): a fonte da verdade é o snapshot ao vivo publicado
      // pelo PC principal (~1.2s). Consultar o NT8 direto via túnel pode devolver cache velho (timeouts
      // silenciosos), congelando o PnL flutuante após a primeira carga.
      if (isRestrictedSession) {
        const snap = await fetchNinjaLiveBridgeSnapshotSupabase(true);
        if (snap && snap.isOnline) {
          applyBridgeSnapshot(snap);
          return;
        }
      }

      const res = await checkNinjaStatus();
      setNinjaStatusInfo(res);
      const online = res.status === 'online';

      if (online) {
        setIsRemoteBridge(false);
        setNinjaOnline(true);
        setNinjaLatency(res.latencyMs !== undefined ? res.latencyMs : null);

        const [accs, posData] = await Promise.all([
          fetchNinjaAccounts(),
          fetchNinjaPositionsAndOrders()
        ]);

        // Filtro de contas NinjaTrader conectadas (exclui Playback/Backtest)
        const validAccs = accs.filter((a: any) => a && a.name !== 'Backtest' && a.name !== 'Playback101' && (a.isConnected === true || a.isConnected === undefined));
        const syncedAccs = validAccs.filter((a: any) => {
          if (syncedNt8NamesSet.size === 0) return true;
          const aName = (a.name || '').trim().toLowerCase();
          const aDisp = (a.displayName || '').trim().toLowerCase();
          return syncedNt8NamesSet.has(aName) || syncedNt8NamesSet.has(aDisp);
        });
        setNinjaAccounts(syncedAccs.length > 0 ? syncedAccs : validAccs);

        // Apenas posições de mercado pertencentes a contas conectadas (fallback para todas as posições caso o filtro seja restritivo)
        const allPositions = posData.positions || [];
        const filteredPositions = allPositions.filter((p: any) => {
          if (!p.account) return false;
          const accLower = p.account.trim().toLowerCase();
          return syncedNt8NamesSet.size === 0 || syncedNt8NamesSet.has(accLower);
        });
        setOpenPositions(filteredPositions.length > 0 ? filteredPositions : allPositions);

        // Apenas ordens trabalhando de contas conectadas (fallback para todas as ordens)
        const allOrders = posData.orders || [];
        const filteredOrders = allOrders.filter((o: any) => {
          if (!o.account) return false;
          const accLower = o.account.trim().toLowerCase();
          return syncedNt8NamesSet.size === 0 || syncedNt8NamesSet.has(accLower);
        });
        setWorkingOrders(filteredOrders.length > 0 ? filteredOrders : allOrders);

        // 🔄 SINCRONIZAÇÃO BIDIRECIONAL COM NINJATRADER 8:
        // A cada ~3.5 segundos, consulta as regras do NT8 para refletir qualquer toggle de Ativar/Pausar feito diretamente no Add-on!
        const now = Date.now();
        if (now - lastNinjaRulesPollTime.current > 3500) {
          lastNinjaRulesPollTime.current = now;
          fetchNinjaCopyRules().then(nt8Rules => {
            if (Array.isArray(nt8Rules) && nt8Rules.length > 0) {
              const currentLocals = getLocalCopyTradingConfigs();
              let hasAnyChange = false;
              const merged = currentLocals.map(loc => {
                const locMaster = getAccountDisplayName(loc.master_account_id, loc.master_account_name).trim().toLowerCase();
                const locSlave = getAccountDisplayName(loc.slave_account_id, loc.slave_account_name).trim().toLowerCase();
                const ntRule = nt8Rules.find(nr => nr.id === loc.id || (
                  (nr.masterAccount || '').trim().toLowerCase() === locMaster &&
                  (nr.slaveAccount || '').trim().toLowerCase() === locSlave
                ));
                if (ntRule && ntRule.isActive !== undefined && (loc.is_active !== false) !== ntRule.isActive) {
                  hasAnyChange = true;
                  return { ...loc, is_active: ntRule.isActive };
                }
                return loc;
              });

              if (hasAnyChange) {
                setCopyConfigs(merged);
                saveLocalCopyTradingConfigs(merged);
                saveBatchCopyTradingConfigsSupabase(merged).catch(() => {});
              }
            }
          }).catch(() => {});
        }
      } else {
        // Não está rodando NT8 localmente (cenário: celular, segundo acesso ou outro computador)
        // Resgata o snapshot ao vivo espelhado da Cloud Bridge do PC Principal
        const bridgeSnap = await fetchNinjaLiveBridgeSnapshotSupabase(true);
        if (bridgeSnap && bridgeSnap.isOnline) {
          applyBridgeSnapshot(bridgeSnap);
        } else {
          setIsRemoteBridge(false);
          setNinjaOnline(false);
          setNinjaLatency(null);
          setNinjaAccounts(prev => prev.length > 0 ? [] : prev);
          setOpenPositions(prev => prev.length > 0 ? [] : prev);
          setWorkingOrders(prev => prev.length > 0 ? [] : prev);
          // Preservar cache de performance para evitar tela em branco por oscilações temporárias
        }
      }
    } catch {
      setNinjaOnline(false);
      setNinjaLatency(null);
    }
  }, [syncedNt8NamesSet, isRestrictedSession]);

  useEffect(() => {
    refreshAccounts(false);
  }, [refreshAccounts]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  // Carrega o relatório detalhado de performance e histórico de trades do NinjaTrader
  const loadPerformanceReport = useCallback(async (showLoading = true) => {
    if (!ninjaOnline) return;
    if (showLoading) setIsPerformanceLoading(true);
    try {
      const perf = await fetchNinjaAccountPerformance();
      if (perf && Array.isArray(perf) && perf.length > 0) {
        const validPerf = perf.filter((ap: any) => ap && ap.name !== 'Backtest' && ap.name !== 'Playback101');
        if (validPerf.length > 0) {
          setAccountsPerformance(validPerf);
        }
      }
    } catch (err) {
      console.warn('[CopyTrading] Falha ao consultar performance:', err);
    } finally {
      if (showLoading) setIsPerformanceLoading(false);
    }
  }, [ninjaOnline]);

  // Carregar performance detalhada ao entrar na aba 'performance' e atualizar suavemente a cada 25s
  useEffect(() => {
    if (activeTab === 'performance' && ninjaOnline) {
      loadPerformanceReport(accountsPerformance.length === 0);
      const perfInterval = setInterval(() => {
        loadPerformanceReport(false);
      }, 25000);
      return () => clearInterval(perfInterval);
    }
  }, [activeTab, ninjaOnline, loadPerformanceReport, accountsPerformance.length]);

  // Ouvir novos eventos e mensagens de copy trading em tempo real
  useEffect(() => {
    const handleNewMessage = (e: any) => {
      if (e.detail) {
        setCopyMessages(prev => [e.detail, ...prev.filter(m => m.id !== e.detail.id)].slice(0, 100));
      }
    };
    const handleRejection = (e: any) => {
      if (e.detail) {
        setActiveRejectionAlert({
          message: e.detail.message,
          slaveAccount: e.detail.slaveAccount,
          isLicenseBlocked: e.detail.isLicenseBlocked
        });
      }
    };
    const handleCleared = () => {
      setCopyMessages([]);
    };
    window.addEventListener('vortex_copy_message_logged', handleNewMessage);
    window.addEventListener('vortex_copy_order_rejected', handleRejection);
    window.addEventListener('vortex_copy_messages_cleared', handleCleared);
    return () => {
      window.removeEventListener('vortex_copy_message_logged', handleNewMessage);
      window.removeEventListener('vortex_copy_order_rejected', handleRejection);
      window.removeEventListener('vortex_copy_messages_cleared', handleCleared);
    };
  }, []);

  // Unificação inteligente dos dados de performance de todas as contas (online NT8, cadastradas e cache)
  const unifiedPerformanceAccounts = useMemo(() => {
    const accMap = new Map<string, NinjaAccountPerformance & { isOnline?: boolean; updatedAt?: string; dailyPnL?: number }>();
    const cachedMetrics = getNinjaAccountMetricsCache();
    const toKey = (s?: string) => (s || '').trim().toLowerCase();

    // 1. Contas conectadas detectadas pelo NinjaTrader (Local ou via Cloud Bridge)
    ninjaAccounts.forEach(nj => {
      if (!nj || !nj.name || nj.name === 'Backtest' || nj.name === 'Playback101') return;
      const key = toKey(nj.name);
      const upperKey = nj.name.trim().toUpperCase();
      const cacheItem = cachedMetrics[upperKey] || (nj.displayName ? cachedMetrics[nj.displayName.trim().toUpperCase()] : undefined);

      const cashVal = Number(cacheItem?.cashValue ?? nj.cashValue ?? 0);
      const rPnL = Number(cacheItem?.realizedPnL ?? nj.realizedPnL ?? 0);
      const uPnL = Number(cacheItem?.unrealizedPnL ?? nj.unrealizedPnL ?? 0);
      const bPower = Number(nj.buyingPower ?? cashVal);
      const dPnL = Number(cacheItem?.dailyPnL ?? (rPnL + uPnL));

      accMap.set(key, {
        name: nj.name,
        displayName: nj.displayName || nj.name,
        connection: nj.connection || 'NT8',
        cashValue: cashVal,
        buyingPower: bPower,
        realizedPnL: rPnL,
        unrealizedPnL: uPnL,
        grossPnL: rPnL,
        tradesCount: 0,
        trades: [],
        isOnline: nj.isConnected !== false,
        dailyPnL: dPnL,
        updatedAt: cacheItem?.updatedAt
      });
    });

    // 2. Contas cadastradas no AppContext (NT8 / sincronizadas)
    ntAccounts.forEach(acc => {
      const rawName = (acc.account_name || acc.id || '').trim();
      if (!rawName) return;
      const key = toKey(rawName);
      const upperKey = rawName.toUpperCase();
      const cacheItem = cachedMetrics[upperKey];

      if (!accMap.has(key)) {
        const cashVal = Number(cacheItem?.cashValue ?? (acc as any).current_balance ?? acc.initial_balance ?? 0);
        const rPnL = Number(cacheItem?.realizedPnL ?? 0);
        const uPnL = Number(cacheItem?.unrealizedPnL ?? 0);
        const dPnL = Number(cacheItem?.dailyPnL ?? (rPnL + uPnL));

        accMap.set(key, {
          name: rawName,
          displayName: rawName,
          connection: 'NT8 Sincronizada',
          cashValue: cashVal,
          buyingPower: cashVal,
          realizedPnL: rPnL,
          unrealizedPnL: uPnL,
          grossPnL: rPnL,
          tradesCount: 0,
          trades: [],
          isOnline: ninjaOnline,
          dailyPnL: dPnL,
          updatedAt: cacheItem?.updatedAt
        });
      }
    });

    // 3. Mescla com os dados ricos de accountsPerformance (histórico detalhado de trades)
    accountsPerformance.forEach(perf => {
      if (!perf || !perf.name || perf.name === 'Backtest' || perf.name === 'Playback101') return;
      const key = toKey(perf.name);
      const existing = accMap.get(key);

      const cashVal = (perf.cashValue !== undefined && perf.cashValue !== 0) ? Number(perf.cashValue) : (existing?.cashValue ?? 0);
      const bPower = (perf.buyingPower !== undefined && perf.buyingPower !== 0) ? Number(perf.buyingPower) : (existing?.buyingPower ?? cashVal);
      const rPnL = perf.realizedPnL !== undefined ? Number(perf.realizedPnL) : (existing?.realizedPnL ?? 0);
      const uPnL = perf.unrealizedPnL !== undefined ? Number(perf.unrealizedPnL) : (existing?.unrealizedPnL ?? 0);
      const tTrades = (perf.trades && perf.trades.length > 0) ? perf.trades : (existing?.trades ?? []);
      const tCount = perf.tradesCount ?? tTrades.length ?? (existing?.tradesCount ?? 0);

      accMap.set(key, {
        name: perf.name,
        displayName: perf.displayName || existing?.displayName || perf.name,
        connection: perf.connection || existing?.connection || 'NT8',
        cashValue: cashVal,
        buyingPower: bPower,
        realizedPnL: rPnL,
        unrealizedPnL: uPnL,
        grossPnL: perf.grossPnL !== undefined ? Number(perf.grossPnL) : (existing?.grossPnL ?? rPnL),
        tradesCount: tCount,
        trades: tTrades,
        isOnline: existing?.isOnline ?? true,
        dailyPnL: rPnL + uPnL,
        updatedAt: existing?.updatedAt
      });
    });

    return Array.from(accMap.values());
  }, [ninjaAccounts, ntAccounts, accountsPerformance, ninjaOnline]);

  // Contas filtradas para exibição no painel de performance
  const displayedAccounts = useMemo(() => {
    if (unifiedPerformanceAccounts.length === 0) return [];

    let list = unifiedPerformanceAccounts;
    if (perfFilterQuery.trim()) {
      const q = perfFilterQuery.trim().toLowerCase();
      list = list.filter(a => a.name.toLowerCase().includes(q) || a.displayName.toLowerCase().includes(q));
    }

    const matched = list.filter(acc =>
      syncedNt8NamesSet.size === 0 ||
      (acc.name && syncedNt8NamesSet.has(acc.name.trim().toLowerCase())) ||
      (acc.displayName && syncedNt8NamesSet.has(acc.displayName.trim().toLowerCase()))
    );

    return matched.length > 0 ? matched : list;
  }, [unifiedPerformanceAccounts, syncedNt8NamesSet, perfFilterQuery]);

  // Pânico: Zerar Todas as Posições e Cancelar Todas as Ordens (Local ou Remoto com Fallback em Nuvem)
  const handlePanicFlattenAll = async () => {
    setIsActionLoading(true);
    try {
      if (isRemoteBridge) {
        await sendNinjaRemoteCommandSupabase({ type: 'FLATTEN_ALL' });
        addLog('🛑 PÂNICO', 'Comando de zeragem geral enviado ao PC principal via Cloud Bridge.', 'alerta');
        setOpenPositions([]);
        setWorkingOrders([]);
        alert('Comando de ZERAGEM GERAL enviado ao PC Principal com sucesso!');
      } else {
        try {
          const res = await flattenAllNinjaAccounts();
          if (res.success) {
            addLog('🛑 PÂNICO', 'Todas as posições e ordens zeradas no NinjaTrader.', 'alerta');
            await checkStatus();
          } else {
            throw new Error(res.message || 'Falha ao executar zeragem direta no NinjaTrader');
          }
        } catch (directErr: any) {
          // Fallback resiliente: se chamada direta falhar (ex: túnel instável), despacha via fila remota no Supabase
          await sendNinjaRemoteCommandSupabase({ type: 'FLATTEN_ALL' });
          addLog('🛑 PÂNICO', `Comando de zeragem geral despachado via Cloud Bridge de contingência: ${directErr?.message || directErr}`, 'alerta');
          setOpenPositions([]);
          setWorkingOrders([]);
          alert('Comando de ZERAGEM GERAL enviado via contingência em nuvem ao PC Principal com sucesso!');
        }
      }
    } catch (err: any) {
      await sendNinjaRemoteCommandSupabase({ type: 'FLATTEN_ALL' }).catch(() => {});
      addLog('❌ PÂNICO', `Falha ao zerar contas: ${err.message}`, 'erro');
      alert(`Comando de contingência enviado ao PC Principal: ${err.message}`);
    } finally {
      setIsActionLoading(false);
      setIsPanicModalOpen(false);
    }
  };

  // Zerar Posição Individual (Local ou Remoto com Fallback)
  const handleCloseIndividualPosition = async (account: string, symbol: string) => {
    if (!confirm(`Deseja realmente ZERAR a posição de ${symbol || 'todas'} na conta ${account}?`)) return;
    try {
      if (isRemoteBridge) {
        await sendNinjaRemoteCommandSupabase({ type: 'CLOSE_POSITION', account, symbol });
        addLog('🛑 ZERAGEM', `Comando para zerar ${symbol || 'todas'} (${account}) enviado ao PC principal via Cloud Bridge.`, 'sistema');
        setOpenPositions(prev => prev.filter(p => !(p.account === account && (!symbol || isSameAsset(p.symbol, symbol)))));
      } else {
        try {
          await closeNinjaPosition(account, symbol);
          addLog('🛑 ZERAGEM', `Posição ${symbol} (${account}) enviada para zerar.`, 'sistema');
        } catch (directErr) {
          await sendNinjaRemoteCommandSupabase({ type: 'CLOSE_POSITION', account, symbol });
          addLog('🛑 ZERAGEM', `Comando para zerar ${symbol} (${account}) despachado via contingência em nuvem.`, 'sistema');
        }
        setOpenPositions(prev => prev.filter(p => !(p.account === account && (!symbol || isSameAsset(p.symbol, symbol)))));
        setTimeout(checkStatus, 600);
      }
    } catch (err: any) {
      alert(`Erro ao zerar: ${err.message}`);
    }
  };

  // Cancelar Ordem Individual (Local ou Remoto com Fallback)
  const handleCancelOrder = async (orderId: string, account: string) => {
    try {
      if (isRemoteBridge) {
        await sendNinjaRemoteCommandSupabase({ type: 'CANCEL_ORDER', orderId, account });
        addLog('❌ CANCELAMENTO', `Comando de cancelamento da ordem ${orderId} enviado ao PC principal via Cloud Bridge.`, 'sistema');
        setWorkingOrders(prev => prev.filter(o => o.orderId !== orderId));
      } else {
        try {
          const okCancel = await cancelNinjaOrder(orderId, account);
          if (!okCancel) throw new Error('Cancelamento direto não confirmado');
          addLog('❌ CANCELAMENTO', `Ordem ${orderId} cancelada na conta ${account}.`, 'sistema');
        } catch (directErr) {
          await sendNinjaRemoteCommandSupabase({ type: 'CANCEL_ORDER', orderId, account });
          addLog('❌ CANCELAMENTO', `Comando de cancelamento da ordem ${orderId} despachado via contingência em nuvem.`, 'sistema');
        }
        setWorkingOrders(prev => prev.filter(o => o.orderId !== orderId));
        setTimeout(checkStatus, 600);
      }
    } catch (err: any) {
      alert(`Erro ao cancelar: ${err.message}`);
    }
  };

  // Cancelar Todas as Ordens (Local ou Remoto com Fallback)
  const handleCancelAllOrders = async () => {
    if (!confirm('Deseja realmente CANCELAR TODAS as ordens pendentes em todas as contas?')) return;
    try {
      if (isRemoteBridge) {
        await sendNinjaRemoteCommandSupabase({ type: 'CANCEL_ALL_ORDERS' });
        addLog('❌ CANCELAMENTO', 'Comando para cancelar todas as ordens enviado ao PC principal via Cloud Bridge.', 'sistema');
        setWorkingOrders([]);
      } else {
        try {
          await cancelAllNinjaOrders();
          addLog('❌ CANCELAMENTO', 'Todas as ordens pendentes foram canceladas.', 'sistema');
        } catch (directErr) {
          await sendNinjaRemoteCommandSupabase({ type: 'CANCEL_ALL_ORDERS' });
          addLog('❌ CANCELAMENTO', 'Comando para cancelar todas as ordens despachado via contingência em nuvem.', 'sistema');
        }
        setWorkingOrders([]);
        setTimeout(checkStatus, 600);
      }
    } catch (err: any) {
      alert(`Erro ao cancelar ordens: ${err.message}`);
    }
  };

  // Abrir Modal para Nova Regra (Multi-Slave)
  const handleOpenNewRuleModal = (preselectedMaster?: string) => {
    if (isRestrictedSession) {
      alert('🔒 Modo Segundo Acesso Restrito: A criação de regras de espelhamento não é permitida neste acesso.');
      return;
    }
    setEditingRuleId(null);
    const initialMaster = preselectedMaster || availableMasterAccountNames[0] || '';
    setFormMasterAccount(initialMaster);
    
    // Slaves disponíveis (estritamente contas NT8 sincronizadas, excluindo a Master)
    const availableSlaves = ntAccounts
      .map(a => a.account_name || a.id)
      .filter((n): n is string => Boolean(n) && n.trim().toLowerCase() !== initialMaster.trim().toLowerCase());
    setFormSelectedSlaves(availableSlaves.length > 0 ? [availableSlaves[0]] : []);
    setFormMultiplier(1.0);
    setFormAllowedSymbols('');
    setFormIsActive(true);
    setFormCloseSlavesOnMasterClose(true);
    setIsRuleModalOpen(true);
  };

  // Abrir Modal para Editar Regra Individual
  const handleOpenEditRuleModal = (rule: CopyTradingConfig) => {
    if (isRestrictedSession) {
      alert('🔒 Modo Segundo Acesso Restrito: A edição de regras de espelhamento não é permitida neste acesso.');
      return;
    }
    setEditingRuleId(rule.id || null);
    const masterName = getAccountDisplayName(rule.master_account_id, rule.master_account_name) || rule.master_account_id;
    const slaveName = getAccountDisplayName(rule.slave_account_id, rule.slave_account_name) || rule.slave_account_id;
    setFormMasterAccount(masterName);
    setFormSelectedSlaves([slaveName]);
    setFormMultiplier(rule.lot_multiplier || 1.0);
    setFormAllowedSymbols(rule.allowed_symbols || '');
    setFormIsActive(rule.is_active !== false);
    setFormCloseSlavesOnMasterClose(rule.close_slaves_on_master_close !== false);
    setIsRuleModalOpen(true);
  };

  // Salvar Regras (Única ou Múltiplas Slaves em Lote Instantâneo + Persistência no Supabase)
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRestrictedSession) {
      alert('🔒 Modo Segundo Acesso Restrito: A criação ou alteração de regras de espelhamento não é permitida.');
      return;
    }
    if (!formMasterAccount) {
      alert('Selecione a Conta Master!');
      return;
    }
    const validSlaves = formSelectedSlaves.filter(
      slaveId => slaveId.trim().toLowerCase() !== formMasterAccount.trim().toLowerCase()
    );
    if (validSlaves.length === 0) {
      alert('Selecione pelo menos uma Conta Slave diferente da Conta Master!');
      return;
    }

    try {
      const configsToSave: CopyTradingConfig[] = validSlaves.map(slaveId => {
        const masterAcc = accounts.find(a => 
          a.id === formMasterAccount || 
          (a.account_name && a.account_name.trim().toLowerCase() === formMasterAccount.trim().toLowerCase())
        );
        const slaveAcc = accounts.find(a => 
          a.id === slaveId || 
          (a.account_name && a.account_name.trim().toLowerCase() === slaveId.trim().toLowerCase())
        );

        return {
          id: editingRuleId && formSelectedSlaves.length === 1 ? editingRuleId : generateSecureUUID(),
          master_account_id: masterAcc?.id || formMasterAccount.trim(),
          slave_account_id: slaveAcc?.id || slaveId.trim(),
          master_account_name: masterAcc?.account_name || formMasterAccount.trim(),
          slave_account_name: slaveAcc?.account_name || slaveId.trim(),
          lot_multiplier: Number(formMultiplier) || 1.0,
          allowed_symbols: formAllowedSymbols.trim() || undefined,
          copy_manual_trades: true,
          copy_algo_trades: true,
          copy_atm_strategy: true,
          close_slaves_on_master_close: formCloseSlavesOnMasterClose,
          is_active: formIsActive,
          created_at: new Date().toISOString()
        };
      });

      // Salva no Supabase e sincroniza metadados na nuvem
      const updatedList = await saveBatchCopyTradingConfigsSupabase(configsToSave);
      setCopyConfigs(updatedList);
      if (ninjaOnline) {
        await syncAllCopyRulesToNinjaTrader(true);
      }
      setIsRuleModalOpen(false);
      addLog('⚡ COPYTRADE', `Regras Master ${formMasterAccount} para ${configsToSave.length} Slaves salvas com sucesso!`, 'sistema');
      setSyncFeedback(`✅ Espelhamento configurado para ${configsToSave.length} contas Slaves!`);
      setTimeout(() => setSyncFeedback(null), 4000);
    } catch (err: any) {
      alert(`Erro ao salvar regras: ${err.message}`);
    }
  };

  // Alternar Status Ativo/Pausado de uma Regra
  const handleToggleRuleStatus = async (rule: CopyTradingConfig) => {
    if (isRestrictedSession) {
      alert('🔒 Modo Segundo Acesso Restrito: A alteração de status de regras não é permitida neste acesso.');
      return;
    }
    if (!ninjaOnline) {
      alert('⚠️ O NinjaTrader precisa estar conectado e sincronizado para ativar ou pausar o espelhamento.');
      return;
    }
    try {
      const updated: CopyTradingConfig = {
        ...rule,
        is_active: !rule.is_active
      };
      const updatedList = await saveBatchCopyTradingConfigsSupabase([updated]);
      setCopyConfigs(updatedList);
      if (ninjaOnline) {
        await syncAllCopyRulesToNinjaTrader(true);
      }
    } catch (err: any) {
      alert(`Erro ao atualizar status: ${err.message}`);
    }
  };

  // Alternar Status de TODAS as Slaves de uma Master
  const handleToggleAllSlavesForMaster = async (masterId: string, activate: boolean) => {
    if (isRestrictedSession) {
      alert('🔒 Modo Segundo Acesso Restrito: A alteração de status de regras não é permitida neste acesso.');
      return;
    }
    if (!ninjaOnline) {
      alert('⚠️ O NinjaTrader precisa estar conectado e sincronizado para ativar ou pausar o espelhamento.');
      return;
    }
    try {
      const targetGroupName = getAccountDisplayName(masterId).trim().toLowerCase();
      const targetSlaves = copyConfigs
        .filter(c => {
          const cMasterName = getAccountDisplayName(c.master_account_id, c.master_account_name).trim().toLowerCase();
          return c.master_account_id === masterId || (targetGroupName && cMasterName === targetGroupName);
        })
        .map(c => ({ ...c, is_active: activate }));

      const updatedList = await saveBatchCopyTradingConfigsSupabase(targetSlaves);
      setCopyConfigs(updatedList);
      if (ninjaOnline) {
        await syncAllCopyRulesToNinjaTrader(true);
      }
      addLog('⚡ COPYTRADE', `${activate ? 'Ativadas' : 'Pausadas'} todas as Slaves da Master ${getAccountDisplayName(masterId)}.`, 'sistema');
    } catch (err: any) {
      alert(`Erro ao alternar status do grupo: ${err.message}`);
    }
  };

  // Excluir Regra Individual
  const handleDeleteRule = async (ruleId: string) => {
    if (isRestrictedSession) {
      alert('🔒 Modo Segundo Acesso Restrito: A exclusão de regras de espelhamento não é permitida neste acesso.');
      return;
    }
    if (!confirm('Deseja realmente remover esta conta Slave do espelhamento?')) return;
    try {
      await deleteCopyTradingConfigSupabase(ruleId);
      setCopyConfigs(getLocalCopyTradingConfigs());
      await refreshCopyConfigs(accounts);
      if (ninjaOnline) {
        syncAllCopyRulesToNinjaTrader(true);
      }
      addLog('⚡ COPYTRADE', 'Regra de espelhamento removida.', 'sistema');
    } catch (err: any) {
      alert(`Erro ao excluir regra: ${err.message}`);
    }
  };

  // Excluir Grupo Completo da Master (Em Lote Instantâneo + Exclusão na Tabela do Supabase)
  const handleDeleteMasterGroup = async (masterId: string) => {
    if (isRestrictedSession) {
      alert('🔒 Modo Segundo Acesso Restrito: A exclusão de regras de espelhamento não é permitida neste acesso.');
      return;
    }
    const masterDisplay = getAccountDisplayName(masterId);
    if (!confirm(`Deseja realmente excluir todas as regras de espelhamento da Conta Master ${masterDisplay}?`)) return;
    try {
      const targetGroupName = masterDisplay.trim().toLowerCase();
      const targetSlaves = copyConfigs.filter(c => {
        const cMasterName = getAccountDisplayName(c.master_account_id, c.master_account_name).trim().toLowerCase();
        return c.master_account_id === masterId || (targetGroupName && cMasterName === targetGroupName);
      });
      const ruleIds = targetSlaves.map(s => s.id).filter(Boolean) as string[];
      await deleteBatchCopyTradingConfigsSupabase(ruleIds);
      setCopyConfigs(getLocalCopyTradingConfigs());
      await refreshCopyConfigs(accounts);
      if (ninjaOnline) {
        syncAllCopyRulesToNinjaTrader(true);
      }
      addLog('⚡ COPYTRADE', `Grupo Master ${masterDisplay} e suas Slaves foram removidos.`, 'sistema');
    } catch (err: any) {
      alert(`Erro ao excluir grupo: ${err.message}`);
    }
  };

  // Alternar seleção de Slave no Modal
  const handleToggleSlaveSelection = (slaveName: string) => {
    if (formSelectedSlaves.includes(slaveName)) {
      setFormSelectedSlaves(formSelectedSlaves.filter(s => s !== slaveName));
    } else {
      setFormSelectedSlaves([...formSelectedSlaves, slaveName]);
    }
  };

  // Selecionar/Desmarcar Todas as Slaves
  const handleToggleSelectAllSlaves = () => {
    if (formSelectedSlaves.length === availableSlaveOptions.length) {
      setFormSelectedSlaves([]);
    } else {
      setFormSelectedSlaves([...availableSlaveOptions]);
    }
  };

  const todayStr = new Date().toLocaleDateString('pt-BR');
  const canUseCopyTrading = isSystemAdmin || canAccessCopyTrading || planDetails?.hasCopyNT8 === true || userPermissions?.allow_copy_trading === true;

  if (!canUseCopyTrading) {
    return (
      <div className="p-8 max-w-xl mx-auto my-12 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-4 shadow-xl">
        <span className="text-4xl block">🔒</span>
        <h2 className="text-lg font-bold text-white">Módulo Copy Trading NT8 Bloqueado</h2>
        <p className="text-sm text-slate-400">
          O acesso à ferramenta de Copy Trading NinjaTrader está desativado para o seu usuário.
          Solicite ao administrador a liberação deste recurso na Gestão de Usuários.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-2rem)] flex flex-col gap-5 max-w-[1700px] mx-auto text-slate-100 p-2 md:p-4">
      {/* HEADER / STATUS HERO */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-blue-950/80 border border-slate-800/80 rounded-xl p-5 shadow-2xl backdrop-blur-md flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl p-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl">⚡</span>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                CopyTrade NT8
              </h1>
            </div>
          </div>
        </div>

        {/* STATUS BADGES & AÇÕES PRINCIPAIS */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-start lg:justify-end">
          {/* Status Ninja */}
          {ninjaOnline ? (
            isRemoteBridge ? (
              <div 
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold bg-cyan-950/40 border-cyan-500/50 text-cyan-300 shadow-sm"
                title={`Espelhado ao vivo do computador principal com NinjaTrader 8 | Latência: ${ninjaLatency ?? 25}ms | Último sync: ${bridgeLastSyncedTime || 'agora'}`}
              >
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>📱 NT8 Espelhado PC ({ninjaLatency ?? 25}ms)</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold bg-emerald-950/40 border-emerald-500/50 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>NT8 Conectado Local ({ninjaLatency ?? 0}ms)</span>
              </div>
            )
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold bg-rose-950/40 border-rose-500/50 text-rose-400">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span>NT8 Desconectado</span>
            </div>
          )}

          {/* Licença / Sessão */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-blue-950/40 border-blue-500/40 text-blue-300 text-xs font-bold">
            <span>🛡️ Licença Ativa</span>
            <span className="text-[10px] text-blue-400/80 font-mono">({todayStr})</span>
          </div>

          {/* Contas Sincronizadas Detectadas */}
          <div 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-slate-850 border-slate-700 text-slate-300 text-xs font-bold"
            title="Contas do NinjaTrader 8 sincronizadas e ativas no painel"
          >
            <span>🏦 {ninjaAccounts.length} Sincronizada(s)</span>
          </div>

          {/* Botão Sincronizar Contas NT8 */}
          <button
            onClick={() => setIsNinjaSyncOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-xs font-bold transition shadow-sm cursor-pointer"
            title="Descobrir e importar contas conectadas no NinjaTrader ou configurar Modo de Conexão (Túnel / Local)"
          >
            <span>🔄 Sincronizar Contas</span>
          </button>

          {/* Status Auto-Sync NT8 (Regras Sincronizadas Automaticamente) */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition shadow-sm ${
              ninjaOnline 
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' 
                : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}
            title={ninjaOnline ? "Sincronização Automática em Tempo Real: qualquer alteração de regras é enviada instantaneamente ao NinjaTrader 8" : "NinjaTrader Offline ou porta 8001 fechada"}
          >
            <span className={ninjaOnline ? "text-emerald-400" : ""}>⚡</span>
            <span>{ninjaOnline ? "Auto-Sync NT8 Ativo" : "NT8 Offline"}</span>
          </div>

          {/* BOTÃO DE PÂNICO GERAL (DISPONÍVEL A QUALQUER MOMENTO) */}
          {(() => {
            const hasActiveOps = openPositions.length > 0 || workingOrders.length > 0;
            return (
              <button
                onClick={() => setIsPanicModalOpen(true)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                  hasActiveOps
                    ? 'bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 border border-red-500 text-white shadow-lg active:scale-95 animate-pulse'
                    : 'bg-rose-950/70 hover:bg-rose-900 border border-rose-600/70 text-rose-200 shadow-sm'
                }`}
                title="Zerar imediatamente todas as posições e cancelar ordens no NinjaTrader (PC Local ou Remoto)"
              >
                <span>🛑 PÂNICO: ZERAR TUDO</span>
                {hasActiveOps && (
                  <span className="ml-1 px-1.5 py-0.2 bg-white text-red-700 rounded-full text-[10px] font-mono">
                    {openPositions.length + workingOrders.length}
                  </span>
                )}
              </button>
            );
          })()}
        </div>
      </div>

      {/* 🔒 BANNER DE SEGUNDO ACESSO RESTRITO */}
      {isRestrictedSession && (
        <div className="p-3.5 rounded-xl bg-amber-950/80 border border-amber-600/60 shadow-lg flex items-center justify-between gap-3 text-amber-200 text-xs animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">📱</span>
            <div>
              <div className="text-xs font-black text-amber-100 flex items-center gap-2">
                <span>Segundo Acesso Remoto (Monitoramento e Gestão de Risco Ativos)</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-600 text-white uppercase tracking-wider">
                  Controle Operacional Liberado
                </span>
              </div>
              <div className="text-[11px] text-amber-300/90 mt-0.5">
                Visualização ao vivo de todas as posições, <strong>Botão de Pânico (Zerar Tudo)</strong>, <strong>Cancelamento de Ordens</strong> e <strong>Zeragem Individual de Posições</strong> 100% operacionais via Túnel e Cloud Bridge.
              </div>
            </div>
          </div>
        </div>
      )}

      {syncFeedback && (
        <div className="p-3.5 rounded-xl bg-blue-950/70 border border-blue-500/50 text-xs text-blue-200 font-bold flex items-center justify-between">
          <span>{syncFeedback}</span>
          <button onClick={() => setSyncFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* ⚠️ ALERTA FIXO: LICENÇA INATIVA NO NINJATRADER 8 */}
      {ninjaOnline && ninjaStatusInfo?.isLicensed === false && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-rose-950/90 to-red-950/90 border border-rose-500/60 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-rose-200 animate-fadeIn">
          <div className="flex items-start md:items-center gap-3">
            <span className="text-3xl p-2 bg-rose-500/20 rounded-lg border border-rose-500/30">🛑</span>
            <div>
              <div className="text-sm font-black text-white flex items-center gap-2">
                <span>Licença Axion Gateway Inativa no NinjaTrader 8</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-600 text-white uppercase tracking-wider animate-pulse">
                  Envio Bloqueado
                </span>
              </div>
              <div className="text-xs text-rose-300 mt-1">
                {ninjaStatusInfo?.licenseStatus || 'O Machine ID desta máquina não está vinculado à assinatura WooCommerce ativa.'}
              </div>
              {ninjaStatusInfo?.machineId && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="text-[11px] text-slate-400 font-semibold">Machine ID desta máquina:</span>
                  <code className="text-xs font-mono font-bold text-amber-300 bg-slate-900/90 px-2 py-0.5 rounded border border-slate-700 select-all">
                    {ninjaStatusInfo.machineId}
                  </code>
                  <button
                    onClick={() => {
                      if (ninjaStatusInfo.machineId) {
                        navigator.clipboard.writeText(ninjaStatusInfo.machineId);
                        alert('Machine ID copiado com sucesso!');
                      }
                    }}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 transition cursor-pointer"
                  >
                    Copiar ID
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="text-left md:text-right text-xs text-rose-300/90 bg-rose-900/30 p-2.5 rounded-lg border border-rose-500/20 max-w-sm">
            Para ativar, vincule este <strong>Machine ID</strong> no campo <code>id_nt</code> da assinatura ativa no WordPress e compile o Add-On.
          </div>
        </div>
      )}

      {/* ⚠️ ALERTA FIXO: ÚLTIMA ORDEM REJEITADA */}
      {activeRejectionAlert && (
        <div className="p-3.5 rounded-xl bg-rose-950/90 border border-rose-500/60 shadow-lg flex items-center justify-between gap-3 text-rose-200 animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⚠️</span>
            <div>
              <div className="text-xs font-black text-rose-200">
                {activeRejectionAlert.message}
              </div>
              <div className="text-[11px] text-rose-400 mt-0.5">
                Conta Afetada: <span className="font-bold text-white">{activeRejectionAlert.slaveAccount}</span>. A ordem não foi aberta no NinjaTrader.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('messages')}
              className="text-xs font-bold px-3 py-1 rounded bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/40 transition cursor-pointer"
            >
              Ver Mensagens ➔
            </button>
            <button
              onClick={() => setActiveRejectionAlert(null)}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 cursor-pointer"
              title="Dispensar aviso"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* GUIA DE ONBOARDING / 3 PASSOS RÁPIDOS (Exibido apenas se não houver contas sincronizadas ou se o usuário solicitar) */}
      {(!hasSyncedAccounts || showTutorial) && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg transition-all animate-fadeIn">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <span>🚀</span> Passos Rápidos de Inicialização do CopyTrade
            </h2>
            {hasSyncedAccounts && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowTutorial(false)}
                  className="text-xs text-slate-500 hover:text-slate-300 font-bold ml-2"
                >
                  ✕ Fechar Guia
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-black text-emerald-400 mb-1">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px]">1</span>
                  Instalar no NinjaTrader 8
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  No NT8: <i>Tools ➔ Import ➔ NinjaScript Add-On</i> ou copie para <code>Documents\NinjaTrader 8\bin\Custom\AddOns</code>.
                </p>
              </div>
              <div className="mt-2 text-center text-[10px] text-slate-500 font-mono py-1">
                Porta: localhost:8001
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-black text-amber-400 mb-1">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px]">2</span>
                  Sincronizar Contas
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Conecte suas contas no NT8 e clique em "Sincronizar Contas" para trazê-las ao painel.
                </p>
              </div>
              <button
                onClick={() => setIsNinjaSyncOpen(true)}
                className="mt-2 text-center text-[11px] font-bold py-1 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/40 text-amber-300 rounded transition"
              >
                Detectar Contas NT8
              </button>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-black text-purple-400 mb-1">
                  <span className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px]">3</span>
                  Configurar Espelhamento
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Defina Master ➔ Slaves, multiplicadores (0.5x, 1x) e filtre os ativos permitidos.
                </p>
              </div>
              {!isRestrictedSession && (
                <button
                  onClick={() => handleOpenNewRuleModal()}
                  className="mt-2 text-center text-[11px] font-bold py-1 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/40 text-purple-300 rounded transition"
                >
                  + Nova Regra
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* NAVEGAÇÃO DE ABAS */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('rules')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition ${
            activeTab === 'rules'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
          }`}
        >
          <span>👑</span> Regras de Espelhamento ({masterGroups.length} Masters / {copyConfigs.length} Slaves)
        </button>

        <button
          onClick={() => setActiveTab('positions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition ${
            activeTab === 'positions'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
          }`}
        >
          <span>📊</span> Posições & Ordens ({openPositions.length} pos / {workingOrders.length} ord)
        </button>

        <button
          onClick={() => setActiveTab('performance')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition ${
            activeTab === 'performance'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
          }`}
        >
          <span>📈</span> Performance das Contas
        </button>

        <button
          onClick={() => setActiveTab('messages')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition relative ${
            activeTab === 'messages'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
          }`}
        >
          <span>💬</span> Mensagens & Alertas ({copyMessages.length})
          {copyMessages.some(m => m.type === 'REJEITADO') && (
            <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black animate-pulse">
              {copyMessages.filter(m => m.type === 'REJEITADO').length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('guide')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition ${
            activeTab === 'guide'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
          }`}
        >
          <span>📖</span> Guia & Proteções
        </button>
      </div>

      {/* CONTEÚDO DAS ABAS */}
      <div className="flex-1">
        {/* ABA 1: REGRAS DE ESPELHAMENTO AGRUPADAS POR MASTER */}
        {activeTab === 'rules' && (
          <div className="flex flex-col gap-5">
            <div className="flex justify-between items-center bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>👑</span> Gestão de Espelhamento Master ➔ Slaves
                </h3>
              </div>
              {!isRestrictedSession && (
                <button
                  onClick={() => handleOpenNewRuleModal()}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white transition flex items-center gap-2 shadow-md cursor-pointer"
                >
                  <span>+</span> Criar Regra de Espelhamento
                </button>
              )}
            </div>

            {masterGroups.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/40 border border-dashed border-slate-800 rounded-xl">
                <span className="text-4xl">⚡</span>
                <h4 className="text-sm font-bold text-slate-300 mt-2">Nenhum espelhamento configurado</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  {isRestrictedSession 
                    ? 'Nenhuma regra de espelhamento ativa no momento.' 
                    : 'Escolha uma Conta Master e vincule uma ou várias Contas Slaves para habilitar a replicação autônoma.'}
                </p>
                {!isRestrictedSession && (
                  <button
                    onClick={() => handleOpenNewRuleModal()}
                    className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white rounded-lg transition cursor-pointer"
                  >
                    Criar Primeiro Espelhamento
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3 max-h-[calc(100vh-270px)] overflow-y-auto pr-1">
                {masterGroups.map(group => (
                  <div
                    key={group.masterAccountId}
                    className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl"
                  >
                    {/* BARRA DE CABEÇALHO DA CONTA MASTER */}
                    <div className="bg-gradient-to-r from-slate-850 via-slate-900 to-blue-950/40 p-2.5 border-b border-slate-800 flex flex-wrap justify-between items-center gap-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl p-1 bg-amber-500/10 border border-amber-500/30 rounded-lg">👑</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Conta Master:</span>
                            <span className="text-sm font-black text-amber-400 font-mono tracking-wide">{getAccountDisplayName(group.masterAccountId, group.slaves[0]?.master_account_name)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                            <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-bold">
                              {group.totalSlavesCount} {group.totalSlavesCount === 1 ? 'Slave Vinculada' : 'Slaves Vinculadas'}
                            </span>
                            <span className="text-slate-500">•</span>
                            <span className="text-emerald-400 font-bold">
                              {group.activeSlavesCount} Ativas
                            </span>
                            {group.totalSlavesCount > group.activeSlavesCount && (
                              <span className="text-slate-500">
                                ({group.totalSlavesCount - group.activeSlavesCount} Pausadas)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* AÇÕES EM LOTE DO GRUPO MASTER */}
                      {!isRestrictedSession && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenNewRuleModal(group.masterAccountId)}
                            className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/40 text-blue-300 rounded text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                            title="Vincular mais contas Slaves a esta Master"
                          >
                            <span>+</span> Adicionar Slaves
                          </button>
                          <button
                            onClick={() => handleToggleAllSlavesForMaster(group.masterAccountId, true)}
                            disabled={!ninjaOnline}
                            className={`px-2 py-1 border rounded text-[11px] font-bold transition ${
                              !ninjaOnline
                                ? 'bg-slate-800/40 border-slate-700/40 text-slate-500 cursor-not-allowed opacity-50'
                                : 'bg-emerald-600/20 hover:bg-emerald-600/40 border-emerald-500/40 text-emerald-300 cursor-pointer'
                            }`}
                            title={!ninjaOnline ? "Requer NinjaTrader conectado para ativar o espelhamento" : "Ativar todas as contas Slaves desta Master"}
                          >
                            ▶️ Ativar Todas
                          </button>
                          <button
                            onClick={() => handleToggleAllSlavesForMaster(group.masterAccountId, false)}
                            disabled={!ninjaOnline}
                            className={`px-2 py-1 border rounded text-[11px] font-bold transition ${
                              !ninjaOnline
                                ? 'bg-slate-800/40 border-slate-700/40 text-slate-500 cursor-not-allowed opacity-50'
                                : 'bg-amber-600/20 hover:bg-amber-600/40 border-amber-500/40 text-amber-300 cursor-pointer'
                            }`}
                            title={!ninjaOnline ? "Requer NinjaTrader conectado para pausar o espelhamento" : "Pausar todas as contas Slaves desta Master"}
                          >
                            ⏸️ Pausar Todas
                          </button>
                          <button
                            onClick={() => handleDeleteMasterGroup(group.masterAccountId)}
                            className="px-2 py-1 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-400 rounded text-[11px] font-bold transition cursor-pointer"
                            title="Excluir todas as regras desta Master"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </div>

                    {/* TABELA COMPACTA DE SLAVES DA MASTER */}
                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[10px]">
                          <tr>
                            <th className="px-2.5 py-1.5 font-semibold">Conta Slave</th>
                            <th className="px-2.5 py-1.5 font-semibold">Multiplicador</th>
                            <th className="px-2.5 py-1.5 font-semibold">Filtro de Ativos</th>
                            <th className="px-2.5 py-1.5 font-semibold">Status</th>
                            <th className="px-2.5 py-1.5 font-semibold text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {group.slaves.map(slaveRule => (
                            <tr
                              key={slaveRule.id || `${slaveRule.master_account_id}_${slaveRule.slave_account_id}`}
                              className={`hover:bg-slate-850/50 transition-colors ${
                                slaveRule.is_active === false ? 'opacity-50 bg-slate-950/40' : ''
                              }`}
                            >
                              {/* Nome da Slave */}
                              <td className="px-2.5 py-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs">👥</span>
                                  <span className="font-bold text-white font-mono text-xs">{getAccountDisplayName(slaveRule.slave_account_id, slaveRule.slave_account_name)}</span>
                                </div>
                              </td>

                              {/* Multiplicador */}
                              <td className="px-2.5 py-1.5">
                                <span className="px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700 font-bold text-white font-mono text-[10px]">
                                  {slaveRule.lot_multiplier || 1.0}x
                                </span>
                              </td>

                              {/* Ativos Permitidos & Modos */}
                              <td className="px-2.5 py-1.5 text-slate-300 text-[11px]">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span>{slaveRule.allowed_symbols || 'TODOS'}</span>
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1" title="Proteção ATM Obrigatória: Stop Loss e Take Profit replicados compulsoriamente">
                                      <span>🛡️</span> ATM Obrigatório
                                    </span>
                                  {slaveRule.close_slaves_on_master_close !== false && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold" title="Fecha posições na Slave automaticamente ao fechar Master">
                                      ⚡ Zerar c/ Master
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Toggle Ativo / Pausado */}
                              <td className="px-2.5 py-1.5">
                                {isRestrictedSession ? (
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-sans ${
                                    slaveRule.is_active !== false
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                                  }`}>
                                    {slaveRule.is_active !== false ? '🟢 ATIVA' : '⏸️ PAUSADA'}
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleToggleRuleStatus(slaveRule)}
                                    disabled={!ninjaOnline}
                                    title={!ninjaOnline ? "Requer NinjaTrader conectado para alternar status" : undefined}
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition font-sans ${
                                      !ninjaOnline
                                        ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500 border border-slate-700'
                                        : slaveRule.is_active !== false
                                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 cursor-pointer'
                                          : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 cursor-pointer'
                                    }`}
                                  >
                                    {slaveRule.is_active !== false ? '🟢 ATIVA' : '⏸️ PAUSADA'}
                                  </button>
                                )}
                              </td>

                              {/* Ações */}
                              <td className="px-2.5 py-1.5 text-right font-sans">
                                {isRestrictedSession ? (
                                  <span className="text-[10px] text-slate-500 font-semibold px-2 py-0.5">Leitura</span>
                                ) : (
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      onClick={() => handleOpenEditRuleModal(slaveRule)}
                                      className="px-2 py-0.5 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition cursor-pointer"
                                    >
                                      ✏️ Editar
                                    </button>
                                    <button
                                      onClick={() => slaveRule.id && handleDeleteRule(slaveRule.id)}
                                      className="px-2 py-0.5 text-[10px] font-bold bg-rose-950/50 hover:bg-rose-900/80 text-rose-400 rounded border border-rose-800/50 transition cursor-pointer"
                                      title="Remover esta Slave"
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA 2: POSIÇÕES & ORDENS ABERTAS */}
        {activeTab === 'positions' && (
          <div className="flex flex-col gap-3.5">
            {/* Header da Aba com Ações Rápidas */}
            <div className="flex flex-wrap justify-between items-center gap-2.5 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>📊</span> Posições em Aberto e Ordens Trabalhando
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={checkStatus}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white rounded-lg border border-slate-700 transition"
                >
                  🔄 Atualizar
                </button>
                <button
                  onClick={handleCancelAllOrders}
                  disabled={workingOrders.length === 0}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition ${
                    workingOrders.length > 0
                      ? 'bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border-amber-500/40 cursor-pointer'
                      : 'bg-slate-800/40 border-slate-700/50 text-slate-500 opacity-40 cursor-not-allowed'
                  }`}
                  title={workingOrders.length > 0 ? "Cancelar todas as ordens pendentes no NinjaTrader" : "Nenhuma ordem pendente para cancelar"}
                >
                  ❌ Cancelar Todas as Ordens
                </button>
                <button
                  onClick={() => setIsPanicModalOpen(true)}
                  className={`px-2.5 py-1 text-xs font-black rounded-lg transition cursor-pointer ${
                    openPositions.length > 0
                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-md active:scale-95'
                      : 'bg-rose-950/60 hover:bg-rose-900 border border-rose-600/70 text-rose-300'
                  }`}
                  title="Zerar todas as posições em aberto no NinjaTrader"
                >
                  🛑 Zerar Todas as Posições
                </button>
              </div>
            </div>

            {/* SEÇÃO 1: POSIÇÕES DE MERCADO */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg transition-all">
              <div 
                onClick={() => setIsOpenPositionsExpanded(prev => !prev)}
                className="p-2.5 bg-slate-850 hover:bg-slate-800/80 border-b border-slate-800 flex justify-between items-center cursor-pointer select-none transition group"
                title="Clique para recolher ou expandir a lista de posições"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] text-slate-400 group-hover:text-cyan-400 transition-transform duration-200 inline-block ${isOpenPositionsExpanded ? 'rotate-90' : 'rotate-0'}`}>
                    ▶
                  </span>
                  <span className="text-xs font-bold text-slate-300 group-hover:text-white uppercase tracking-wider flex items-center gap-1.5">
                    📈 Posições a Mercado <span className="text-cyan-400 font-mono">({openPositions.length})</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">
                    Resultado Não-Realizado: {' '}
                    <span className={`font-mono font-bold ${
                      openPositions.reduce((acc, p) => acc + (p.unrealizedPnL || 0), 0) >= 0 
                        ? 'text-emerald-400' 
                        : 'text-rose-400'
                    }`}>
                      ${openPositions.reduce((acc, p) => acc + (p.unrealizedPnL || 0), 0).toFixed(2)}
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-300 transition bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60">
                    {isOpenPositionsExpanded ? 'Recolher ▲' : 'Mostrar ▼'}
                  </span>
                </div>
              </div>

              {isOpenPositionsExpanded && (
                openPositions.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-xs">
                    Nenhuma posição de mercado aberta no momento. Todas as contas estão Flat.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 text-[10px]">
                        <tr>
                          <th className="px-2.5 py-1 font-semibold">Conta</th>
                          <th className="px-2.5 py-1 font-semibold">Ativo</th>
                          <th className="px-2.5 py-1 font-semibold">Posição</th>
                          <th className="px-2.5 py-1 font-semibold">Qtd</th>
                          <th className="px-2.5 py-1 font-semibold">Preço Médio</th>
                          <th className="px-2.5 py-1 font-semibold">PnL Flutuante</th>
                          <th className="px-2.5 py-1 font-semibold text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40 font-mono text-[11px]">
                        {openPositions.map((pos, idx) => (
                          <tr key={`${pos.account}_${pos.symbol}_${idx}`} className="hover:bg-slate-850/60 transition-colors">
                            <td className="px-2.5 py-1 font-bold text-white">{pos.account}</td>
                            <td className="px-2.5 py-1 text-slate-300">{pos.symbol}</td>
                            <td className="px-2.5 py-1">
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                pos.marketPosition === 'BUY'
                                   ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                   : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                              }`}>
                                {pos.marketPosition}
                              </span>
                            </td>
                            <td className="px-2.5 py-1 text-white font-bold">{pos.quantity}</td>
                            <td className="px-2.5 py-1 text-slate-300">{pos.averagePrice?.toFixed(2)}</td>
                            <td className={`px-2.5 py-1 font-black ${pos.unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              ${pos.unrealizedPnL?.toFixed(2)}
                            </td>
                            <td className="px-2.5 py-1 text-right">
                              <button
                                onClick={() => handleCloseIndividualPosition(pos.account, pos.symbol)}
                                className="px-2 py-0.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 rounded text-[9px] font-bold transition font-sans cursor-pointer"
                              >
                                🛑 Zerar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

            {/* SEÇÃO 2: ORDENS PENDENTES / TRABALHANDO */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg transition-all">
              <div 
                onClick={() => setIsWorkingOrdersExpanded(prev => !prev)}
                className="p-2.5 bg-slate-850 hover:bg-slate-800/80 border-b border-slate-800 flex justify-between items-center cursor-pointer select-none transition group"
                title="Clique para recolher ou expandir a lista de ordens"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] text-slate-400 group-hover:text-cyan-400 transition-transform duration-200 inline-block ${isWorkingOrdersExpanded ? 'rotate-90' : 'rotate-0'}`}>
                    ▶
                  </span>
                  <span className="text-xs font-bold text-slate-300 group-hover:text-white uppercase tracking-wider flex items-center gap-1.5">
                    ⏳ Ordens Trabalhando / Pendentes <span className="text-cyan-400 font-mono">({workingOrders.length})</span>
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 group-hover:text-slate-300 transition bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60">
                  {isWorkingOrdersExpanded ? 'Recolher ▲' : 'Mostrar ▼'}
                </span>
              </div>

              {isWorkingOrdersExpanded && (
                workingOrders.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-xs">
                    Nenhuma ordem pendente ou trabalhando no NinjaTrader.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 text-[10px]">
                        <tr>
                          <th className="px-2.5 py-1 font-semibold">Conta</th>
                          <th className="px-2.5 py-1 font-semibold">Ativo</th>
                          <th className="px-2.5 py-1 font-semibold">Tipo / Lado</th>
                          <th className="px-2.5 py-1 font-semibold">Qtd</th>
                          <th className="px-2.5 py-1 font-semibold">Preço / Nível</th>
                          <th className="px-2.5 py-1 font-semibold">Status</th>
                          <th className="px-2.5 py-1 font-semibold">Nome / OCO</th>
                          <th className="px-2.5 py-1 font-semibold text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40 font-mono text-[11px]">
                        {workingOrders.map((ord) => (
                          <tr key={ord.orderId} className="hover:bg-slate-850/60 transition-colors">
                            <td className="px-2.5 py-1 font-bold text-white">{ord.account}</td>
                            <td className="px-2.5 py-1 text-slate-300">{ord.symbol}</td>
                            <td className="px-2.5 py-1">
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold mr-1.5 ${
                                ord.action === 'BUY'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-rose-500/20 text-rose-400'
                              }`}>
                                {ord.action}
                              </span>
                              <span className="text-slate-400 text-[10px]">{ord.orderType}</span>
                            </td>
                            <td className="px-2.5 py-1 text-white font-bold">{ord.quantity}</td>
                            <td className="px-2.5 py-1 text-amber-300 font-bold">
                              {ord.price > 0 ? ord.price.toFixed(2) : ord.stopPrice > 0 ? ord.stopPrice.toFixed(2) : ord.limitPrice.toFixed(2)}
                            </td>
                            <td className="px-2.5 py-1">
                              <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 text-[9px] font-bold">
                                {ord.orderState}
                              </span>
                            </td>
                            <td className="px-2.5 py-1 text-slate-400 text-[10px]">
                              {ord.name || ord.oco || '-'}
                            </td>
                            <td className="px-2.5 py-1 text-right">
                              <button
                                onClick={() => handleCancelOrder(ord.orderId, ord.account)}
                                className="px-2 py-0.5 bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/40 rounded text-[9px] font-bold transition font-sans cursor-pointer"
                              >
                                ❌ Cancelar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* ABA 3: PERFORMANCE DAS CONTAS */}
        {activeTab === 'performance' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xl">📈</span>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Performance das Contas Sincronizadas
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-mono font-bold border border-blue-500/30">
                      {displayedAccounts.length} conta{displayedAccounts.length !== 1 ? 's' : ''}
                    </span>
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Monitoramento em tempo real de saldo, margem e lucros das contas conectadas ao NinjaTrader 8.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  value={perfFilterQuery}
                  onChange={(e) => setPerfFilterQuery(e.target.value)}
                  placeholder="Filtrar por conta..."
                  className="px-2.5 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-full sm:w-44 font-mono"
                />

                <button
                  disabled={isPerformanceLoading}
                  onClick={() => loadPerformanceReport(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                    isPerformanceLoading
                      ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700'
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md border border-blue-500/40'
                  }`}
                >
                  <span className={isPerformanceLoading ? 'animate-spin' : ''}>🔄</span>
                  {isPerformanceLoading ? 'Atualizando...' : 'Atualizar'}
                </button>
              </div>
            </div>

            {/* KPI SUMMARY CARDS */}
            {displayedAccounts.length > 0 && (() => {
              const totalCash = displayedAccounts.reduce((sum, a) => sum + (Number(a.cashValue) || 0), 0);
              const totalRealized = displayedAccounts.reduce((sum, a) => sum + (Number(a.realizedPnL) || 0), 0);
              const totalUnrealized = displayedAccounts.reduce((sum, a) => sum + (Number(a.unrealizedPnL) || 0), 0);
              const totalDaily = totalRealized + totalUnrealized;

              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-400 uppercase font-mono font-bold">Contas Monitoradas</span>
                    <span className="text-lg font-black text-white font-mono mt-1">{displayedAccounts.length}</span>
                  </div>
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-400 uppercase font-mono font-bold">Saldo Consolidado</span>
                    <span className="text-lg font-black text-slate-100 font-mono mt-1">
                      ${totalCash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-400 uppercase font-mono font-bold">Lucro Realizado (Hoje)</span>
                    <span className={`text-lg font-black font-mono mt-1 ${totalRealized >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {totalRealized >= 0 ? '+' : ''}${totalRealized.toFixed(2)}
                    </span>
                  </div>
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-400 uppercase font-mono font-bold">Resultado Diário Total</span>
                    <span className={`text-lg font-black font-mono mt-1 ${totalDaily >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {totalDaily >= 0 ? '+' : ''}${totalDaily.toFixed(2)}
                      {totalUnrealized !== 0 && (
                        <span className="text-[10px] ml-1.5 font-normal opacity-80">
                          (Flut: ${totalUnrealized.toFixed(2)})
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Sincronização de Performance de Contas */}
            {displayedAccounts.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/40 border border-slate-800 rounded-xl text-slate-400 text-xs flex flex-col items-center justify-center gap-3">
                {isPerformanceLoading ? (
                  <>
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-slate-300 font-medium">Buscando contas e métricas do NinjaTrader 8...</span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl">📡</span>
                    <p className="max-w-md text-slate-300">
                      Nenhuma conta conectada no NinjaTrader 8 detectada no momento.
                    </p>
                    <p className="text-[11px] text-slate-500 max-w-lg">
                      Certifique-se de que o NinjaTrader 8 está aberto com o Add-On Axion Gateway ativo na porta 8001 e que as contas estão conectadas à corretora.
                    </p>
                    <button
                      onClick={() => loadPerformanceReport(true)}
                      className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs transition flex items-center gap-2"
                    >
                      <span>🔄</span> Tentar Conectar Novamente
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* CARDS DE PERFORMANCE DAS CONTAS */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayedAccounts.map((acc) => {
                    const dailyPnL = (acc.realizedPnL || 0) + (acc.unrealizedPnL || 0);
                    return (
                      <div key={acc.name} className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col justify-between hover:border-slate-700 transition">
                        <div>
                          <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-sm font-black text-white font-mono truncate" title={acc.name}>{acc.name}</span>
                              {acc.displayName && acc.displayName !== acc.name && (
                                <span className="text-[10px] text-slate-400 font-sans truncate">({acc.displayName})</span>
                              )}
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold border shrink-0 ${
                              acc.isOnline !== false
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>
                              {acc.isOnline !== false ? `✓ ${acc.connection || 'NT8'}` : '⏸️ Offline (Cache)'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                            <div className="bg-slate-950/80 p-2 rounded">
                              <span className="text-slate-500 text-[10px] block">SALDO / CASH:</span>
                              <span className="font-bold text-white">${acc.cashValue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="bg-slate-950/80 p-2 rounded">
                              <span className="text-slate-500 text-[10px] block">BUYING POWER:</span>
                              <span className="font-bold text-slate-300">${acc.buyingPower?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="bg-slate-950/80 p-2 rounded">
                              <span className="text-slate-500 text-[10px] block">LUCRO REALIZADO:</span>
                              <span className={`font-black ${acc.realizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {acc.realizedPnL >= 0 ? '+' : ''}${acc.realizedPnL?.toFixed(2)}
                              </span>
                            </div>
                            <div className="bg-slate-950/80 p-2 rounded">
                              <span className="text-slate-500 text-[10px] block">FLUTUANTE (OPEN):</span>
                              <span className={`font-black ${acc.unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {acc.unrealizedPnL >= 0 ? '+' : ''}${acc.unrealizedPnL?.toFixed(2)}
                              </span>
                            </div>
                          </div>

                          {/* Destaque do PnL Diário Total */}
                          <div className={`mt-2 p-2 rounded flex justify-between items-center text-xs font-mono border ${
                            dailyPnL >= 0
                              ? 'bg-emerald-950/40 border-emerald-800/40 text-emerald-300'
                              : 'bg-rose-950/40 border-rose-800/40 text-rose-300'
                          }`}>
                            <span className="text-[10px] font-bold uppercase tracking-wider">Resultado Diário:</span>
                            <span className="font-black text-sm">
                              {dailyPnL >= 0 ? '+' : ''}${dailyPnL.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex justify-between items-center">
                          <span>Trades Concluídos: <strong className="text-white">{acc.tradesCount || (acc.trades ? acc.trades.length : 0)}</strong></span>
                          <button
                            onClick={() => {
                              if (confirm(`Deseja realmente zerar a posição e cancelar ordens da conta "${acc.name}"?`)) {
                                handleCloseIndividualPosition(acc.name, '');
                              }
                            }}
                            className="text-rose-400 hover:text-rose-300 font-bold text-[10px] hover:underline"
                          >
                            Zerar Posição ➔
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Tabela Unificada de Trades Fechados do NinjaTrader */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      📜 Histórico de Trades Executados nas Contas Sincronizadas
                    </h4>
                    {isPerformanceLoading && (
                      <span className="text-[11px] text-blue-400 flex items-center gap-1.5 animate-pulse font-mono">
                        <span className="animate-spin">🔄</span> Atualizando trades...
                      </span>
                    )}
                  </div>

                  {displayedAccounts.every(a => !a.trades || a.trades.length === 0) ? (
                    <div className="p-6 text-center text-xs text-slate-500 bg-slate-950/40 rounded-lg border border-slate-800/50">
                      Nenhum histórico de trade individual carregado para as contas hoje. Clique em "Atualizar" para consultar o banco histórico do NinjaTrader.
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-950/80 text-[10px] text-slate-400 uppercase sticky top-0">
                          <tr>
                            <th className="p-2">Conta</th>
                            <th className="p-2">Ativo</th>
                            <th className="p-2">Lado</th>
                            <th className="p-2">Qtd</th>
                            <th className="p-2">Entrada</th>
                            <th className="p-2">Saída</th>
                            <th className="p-2">Pontos</th>
                            <th className="p-2">Resultado (USD)</th>
                            <th className="p-2">Horário Saída</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {displayedAccounts.flatMap(a => (a.trades || []).map(t => ({ ...t, accountName: a.name }))).map((t, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/40 transition">
                              <td className="p-2 font-bold text-white">{t.accountName}</td>
                              <td className="p-2 text-blue-400 font-bold">{t.symbol}</td>
                              <td className="p-2">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  t.entryAction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                                }`}>
                                  {t.entryAction}
                                </span>
                              </td>
                              <td className="p-2 text-slate-300">{t.quantity}x</td>
                              <td className="p-2 text-slate-300">{t.entryPrice?.toFixed(2)}</td>
                              <td className="p-2 text-slate-300">{t.exitPrice > 0 ? t.exitPrice.toFixed(2) : '--'}</td>
                              <td className={`p-2 font-bold ${t.profitPoints > 0 ? 'text-emerald-400' : t.profitPoints < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                {t.profitPoints > 0 ? '+' : ''}{t.profitPoints?.toFixed(2)} pts
                              </td>
                              <td className={`p-2 font-black ${t.profitCurrency > 0 ? 'text-emerald-400' : t.profitCurrency < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                ${t.profitCurrency?.toFixed(2)}
                              </td>
                              <td className="p-2 text-[10px] text-slate-500">
                                {t.exitTime ? new Date(t.exitTime).toLocaleTimeString('pt-BR') : '--'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ABA 4: MENSAGENS, ALERTAS & AUDITORIA DE CÓPIAS */}
        {activeTab === 'messages' && (
          <div className="flex flex-col gap-4">
            {/* STATS HERO */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total de Mensagens</span>
                  <span className="text-xl font-black text-white font-mono">{copyMessages.length}</span>
                </div>
                <span className="text-2xl p-2 bg-blue-500/10 rounded-lg text-blue-400">💬</span>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Cópias Executadas</span>
                  <span className="text-xl font-black text-emerald-400 font-mono">
                    {copyMessages.filter(m => m.type === 'COPIADO').length}
                  </span>
                </div>
                <span className="text-2xl p-2 bg-emerald-500/10 rounded-lg text-emerald-400">⚡</span>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Bloqueadas / Rejeitadas</span>
                  <span className="text-xl font-black text-rose-400 font-mono">
                    {copyMessages.filter(m => m.type === 'REJEITADO').length}
                  </span>
                </div>
                <span className="text-2xl p-2 bg-rose-500/10 rounded-lg text-rose-400">🚨</span>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Alertas de Risco</span>
                  <span className="text-xl font-black text-amber-400 font-mono">
                    {copyMessages.filter(m => m.type === 'ALERTA').length}
                  </span>
                </div>
                <span className="text-2xl p-2 bg-amber-500/10 rounded-lg text-amber-400">⚠️</span>
              </div>
            </div>

            {/* FILTROS & AÇÕES */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-wrap justify-between items-center gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {(['ALL', 'REJEITADO', 'COPIADO', 'ALERTA'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setMsgFilterType(type)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                      msgFilterType === type
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>{type === 'ALL' ? '📋 Todos' : type === 'REJEITADO' ? '🚨 Rejeitados' : type === 'COPIADO' ? '⚡ Copiados' : '⚠️ Alertas'}</span>
                    <span className="text-[10px] font-mono opacity-70">
                      ({type === 'ALL' ? copyMessages.length : copyMessages.filter(m => m.type === type).length})
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Buscar conta ou ativo..."
                  value={msgSearchTerm}
                  onChange={(e) => setMsgSearchTerm(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-48"
                />
                <button
                  onClick={() => {
                    if (confirm('Deseja realmente limpar todo o histórico de mensagens de copy trading?')) {
                      clearLocalCopyMessages();
                      setCopyMessages([]);
                    }
                  }}
                  disabled={copyMessages.length === 0}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg border border-slate-700 text-xs font-bold transition disabled:opacity-40"
                  title="Limpar mensagens"
                >
                  🗑️ Limpar
                </button>
              </div>
            </div>

            {/* LISTA DE MENSAGENS */}
            {(() => {
              const filtered = copyMessages.filter(m => {
                if (msgFilterType !== 'ALL' && m.type !== msgFilterType) return false;
                if (msgSearchTerm) {
                  const s = msgSearchTerm.toLowerCase();
                  return (
                    m.masterAccount?.toLowerCase().includes(s) ||
                    m.slaveAccount?.toLowerCase().includes(s) ||
                    m.symbol?.toLowerCase().includes(s) ||
                    m.reason?.toLowerCase().includes(s) ||
                    m.message?.toLowerCase().includes(s)
                  );
                }
                return true;
              });

              if (filtered.length === 0) {
                return (
                  <div className="p-10 text-center bg-slate-900/40 border border-dashed border-slate-800 rounded-xl text-slate-400">
                    <span className="text-3xl block mb-2">📭</span>
                    <p className="text-xs font-bold text-slate-300">Nenhuma mensagem registrada</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Eventos de cópia, bloqueios de gestão de risco e rejeições aparecerão aqui em tempo real.
                    </p>
                  </div>
                );
              }

              return (
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                  <div className="divide-y divide-slate-800/70">
                    {filtered.map(msg => {
                      const isRejected = msg.type === 'REJEITADO';
                      const isCopied = msg.type === 'COPIADO';

                      return (
                        <div
                          key={msg.id}
                          className={`px-3 py-1.5 flex flex-col md:flex-row md:items-center justify-between gap-2 transition ${
                            isRejected
                              ? 'bg-rose-950/20 hover:bg-rose-950/30'
                              : isCopied
                              ? 'hover:bg-slate-850/50'
                              : 'bg-amber-950/20 hover:bg-amber-950/30'
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider shrink-0 ${
                              isRejected
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : isCopied
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            }`}>
                              {msg.type}
                            </span>

                            <span className="text-xs font-bold text-white flex items-center gap-1 shrink-0 font-mono">
                              <span>👑 {msg.masterAccount}</span>
                              <span className="text-slate-500">➔</span>
                              <span className="text-cyan-400">👤 {msg.slaveAccount}</span>
                            </span>

                            {msg.symbol && (
                              <span className="px-1.5 py-0.2 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[10px] font-mono font-bold shrink-0">
                                {msg.symbol} {msg.quantity ? `(${msg.quantity}x)` : ''}
                              </span>
                            )}

                            {(msg.reason || msg.message) && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border truncate max-w-xl ${
                                isRejected
                                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                                  : isCopied
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                                  : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                              }`} title={msg.reason || msg.message}>
                                {msg.reason || msg.message}
                              </span>
                            )}
                          </div>

                          <div className="text-right flex items-center justify-end gap-2 text-[10px] text-slate-500 font-mono shrink-0">
                            <span>{new Date(msg.timestamp).toLocaleTimeString('pt-BR')}</span>
                            <span className="text-slate-600">{new Date(msg.timestamp).toLocaleDateString('pt-BR')}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ABA 5: GUIA & PROTEÇÕES */}
        {activeTab === 'guide' && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col gap-6">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>🛡️</span> Arquitetura de Proteção e Anti-Divergência
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Entenda como o VortexWeb e o Add-On do NinjaTrader garantem a integridade operacional de suas contas.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-300">
              <div className="bg-slate-950/70 p-4 rounded-lg border border-slate-800">
                <h4 className="font-bold text-amber-400 text-sm mb-1.5 flex items-center gap-1.5">
                  <span>🔒</span> Proteção Anti-Reabertura (Anti-Looping)
                </h4>
                <p>
                  Se uma conta Slave tiver sua posição encerrada manualmente, por Stop Loss individual ou por trava de perda máxima diária, o motor do Add-On registra a chave única da ordem Master. A Slave <strong>NUNCA reabrirá</strong> a operação enquanto a Master permanecer no mesmo trade.
                </p>
              </div>

              <div className="bg-slate-950/70 p-4 rounded-lg border border-slate-800">
                <h4 className="font-bold text-cyan-400 text-sm mb-1.5 flex items-center gap-1.5">
                  <span>⚡</span> Multiplicador Fracionário (0.5x, 1.5x)
                </h4>
                <p>
                  Com o multiplicador fracionário, um trade de 2 contratos na conta Master é automaticamente convertido para 1 contrato na conta Slave (2 × 0.5 = 1). O motor sempre arredonda de forma segura com um mínimo de 1 contrato.
                </p>
              </div>

              <div className="bg-slate-950/70 p-4 rounded-lg border border-slate-800">
                <h4 className="font-bold text-emerald-400 text-sm mb-1.5 flex items-center gap-1.5">
                  <span>🎯</span> Filtragem de Ativos Permitidos
                </h4>
                <p>
                  Defina quais ativos a conta Slave tem permissão para replicar (ex: <code>NQ,MNQ</code>). Se a conta Master operar um ativo não autorizado (como <code>CL</code> ou <code>ES</code>), a ordem da Slave é bloqueada instantaneamente.
                </p>
              </div>

              <div className="bg-slate-950/70 p-4 rounded-lg border border-slate-800">
                <h4 className="font-bold text-rose-400 text-sm mb-1.5 flex items-center gap-1.5">
                  <span>🛑</span> Trava de Perda Diária Centralizada
                </h4>
                <p>
                  Ao atingir o valor de Stop Diário ($) configurado no painel, a conta Slave é travada para novas entradas no dia e suas posições em aberto são zeradas de forma autônoma.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: CRIAR / EDITAR REGRAS DE COPY (MULTI-SLAVE) */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>⚡</span> {editingRuleId ? 'Editar Regra de Copy' : 'Configurar Espelhamento (Master ➔ Slaves)'}
              </h3>
              <button onClick={() => setIsRuleModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveRule} className="flex flex-col gap-4 text-xs">
              {/* Master Account */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-300 font-bold">Conta Master (Líder / Origem dos Sinais):</label>
                  {editingRuleId && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.2 rounded font-semibold flex items-center gap-1">
                      <span>🔒</span> Bloqueada na edição
                    </span>
                  )}
                </div>
                {availableMasterAccountNames.length > 0 ? (
                  <select
                    value={formMasterAccount}
                    disabled={Boolean(editingRuleId)}
                    onChange={(e) => {
                      const newMaster = e.target.value;
                      setFormMasterAccount(newMaster);
                      // Remove a nova Master da lista de Slaves selecionadas se estiver presente
                      setFormSelectedSlaves(prev => prev.filter(s => s !== newMaster));
                    }}
                    required
                    className={`w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono ${
                      editingRuleId ? 'opacity-60 cursor-not-allowed bg-slate-900 border-slate-800' : ''
                    }`}
                  >
                    <option value="">
                      {isCopyOnly ? "Selecione a Conta Master (NT8)..." : "Selecione a Conta Master (Demo Axion ou NT8)..."}
                    </option>
                    {!isCopyOnly && demoAxionAccounts.length > 0 && (
                      <optgroup label="Contas Demo Axion (Líder Manual ou Robô)">
                        {demoAxionAccounts.map(a => {
                          const name = a.account_name || a.id;
                          return <option key={a.id} value={name}>🎯 {name} (Demo)</option>;
                        })}
                      </optgroup>
                    )}
                    {ntAccounts.length > 0 && (
                      <optgroup label="Contas NinjaTrader 8 Sincronizadas">
                        {ntAccounts.map(a => {
                          const name = a.account_name || a.id;
                          return <option key={a.id} value={name}>🏦 {name} (NT8)</option>;
                        })}
                      </optgroup>
                    )}
                  </select>
                ) : (
                  <div className="p-2.5 bg-amber-950/40 border border-amber-600/40 rounded-lg text-amber-300 text-xs">
                    {isCopyOnly
                      ? "Nenhuma conta NinjaTrader 8 sincronizada para atuar como Master. Sincronize contas NT8 na tela de 'Gestão de Contas'."
                      : "Nenhuma conta cadastrada ou sincronizada para atuar como Master. Crie uma Conta Demo ou sincronize contas NT8 na tela de 'Gestão de Contas'."}
                  </div>
                )}
              </div>

              {/* Slave Accounts (Multi-seleção com exclusão automática da Master) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-300 font-bold">
                    Contas Slaves ({formSelectedSlaves.length} selecionadas):
                  </label>
                  {availableSlaveOptions.length > 1 && !editingRuleId && (
                    <button
                      type="button"
                      onClick={handleToggleSelectAllSlaves}
                      className="text-[11px] text-blue-400 hover:text-blue-300 font-bold underline"
                    >
                      {formSelectedSlaves.length === availableSlaveOptions.length ? 'Desmarcar Todas' : 'Selecionar Todas as Outras'}
                    </button>
                  )}
                  {editingRuleId && (
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.2 rounded font-semibold flex items-center gap-1">
                      <span>🔒</span> Slave Fixa
                    </span>
                  )}
                </div>

                {availableSlaveOptions.length === 0 && !editingRuleId ? (
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg text-slate-400 text-xs text-center">
                    Nenhuma conta NinjaTrader 8 sincronizada disponível para ser Slave. Acesse 'Sincronizar Contas' para importar suas contas do NinjaTrader.
                  </div>
                ) : editingRuleId ? (
                  /* Modo Edição Individual */
                  <div>
                    <select
                      value={formSelectedSlaves[0] || ''}
                      disabled={true}
                      required
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono opacity-60 cursor-not-allowed bg-slate-900"
                    >
                      <option value={formSelectedSlaves[0] || ''}>{formSelectedSlaves[0] || 'Slave selecionada'}</option>
                    </select>
                    <span className="text-[10px] text-slate-500 mt-1 block">A conta Slave desta regra é mantida fixa durante a alteração dos parâmetros.</span>
                  </div>
                ) : (
                  /* Modo Criação Multi-Slaves com Checkboxes */
                  <div className="max-h-40 overflow-y-auto bg-slate-950 border border-slate-700 rounded-lg p-2.5 flex flex-col gap-1.5 divide-y divide-slate-800/40">
                    {availableSlaveOptions.map(name => (
                      <label
                        key={name}
                        className="flex items-center gap-2.5 cursor-pointer hover:bg-slate-900/80 p-1.5 rounded transition"
                      >
                        <input
                          type="checkbox"
                          checked={formSelectedSlaves.includes(name)}
                          onChange={() => handleToggleSlaveSelection(name)}
                          className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700"
                        />
                        <span className="font-mono text-white text-xs">{name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Multiplicador e Ativos */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Multiplicador de Lotes:</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="10.0"
                    value={formMultiplier}
                    onChange={(e) => setFormMultiplier(parseFloat(e.target.value) || 1.0)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono"
                  />
                  <span className="text-[10px] text-slate-500">Ex: 0.5 (metade), 1.0, 2.0</span>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Filtro de Ativos:</label>
                  <input
                    type="text"
                    value={formAllowedSymbols}
                    onChange={(e) => setFormAllowedSymbols(e.target.value)}
                    placeholder="Ex: NQ, MNQ (Vazio = Todos)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono uppercase"
                  />
                  <span className="text-[10px] text-slate-500">Separar por vírgula</span>
                </div>
              </div>

              {/* Gestão de Estratégia ATM e Zeragem */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col gap-2.5">
                <div className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <span>🛡️</span> Gestão Avançada de Proteção e Fechamento
                </div>

                <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-2.5 flex items-center gap-2.5">
                  <span className="text-emerald-400 text-lg">🛡️</span>
                  <div className="text-[11px] leading-tight">
                    <span className="text-emerald-300 font-bold block">Proteção ATM Obrigatória (SL & TP Mandatórios)</span>
                    <span className="text-slate-300">
                      Toda posição requer Stop Loss e Take Profit. A estratégia ATM é replicada compulsoriamente nas Slaves para máxima proteção institucional do capital.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="closeSlavesOnMasterClose"
                    checked={formCloseSlavesOnMasterClose}
                    onChange={(e) => setFormCloseSlavesOnMasterClose(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-blue-600 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <label htmlFor="closeSlavesOnMasterClose" className="text-white font-bold cursor-pointer block">
                      Fechar posições nas Slaves automaticamente se a Master fechar
                    </label>
                    <span className="text-[10px] text-slate-400 block leading-tight">
                      Garante que nenhuma conta Slave permaneça exposta após a Master encerrar sua operação ou zerar.
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Ativo */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="ruleActive"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 bg-slate-950 border-slate-700"
                />
                <label htmlFor="ruleActive" className="text-slate-300 font-bold cursor-pointer">
                  Regras Ativas para Execução Imediata
                </label>
              </div>

              {/* Botões */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRuleModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg"
                >
                  {editingRuleId ? 'Salvar Alterações' : `Salvar Espelhamento (${formSelectedSlaves.length} Slaves)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PÂNICO GERAL */}
      {isPanicModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-red-600 rounded-2xl w-full max-w-md p-6 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full bg-red-600/20 border border-red-500 flex items-center justify-center text-3xl mx-auto mb-4 animate-bounce">
              🛑
            </div>
            <h3 className="text-xl font-black text-white">CONFIRMAR ZERAGEM TOTAL?</h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              Esta ação enviará ordens a mercado para <strong>FECHAR TODAS AS POSIÇÕES</strong> e <strong>CANCELAR TODAS AS ORDENS PENDENTES</strong> em todas as contas conectadas no NinjaTrader.
            </p>

            <div className="flex justify-center gap-3 mt-6">
              <button
                onClick={() => setIsPanicModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
              >
                Cancelar (Voltar)
              </button>
              <button
                onClick={handlePanicFlattenAll}
                disabled={isActionLoading}
                className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs shadow-xl transition active:scale-95"
              >
                {isActionLoading ? 'Zerando...' : 'SIM, ZERAR TUDO AGORA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SINCRONIZAÇÃO DE CONTAS NT8 */}
      <NinjaSyncModal
        isOpen={isNinjaSyncOpen}
        onClose={() => {
          setIsNinjaSyncOpen(false);
          refreshAccounts();
          checkStatus();
        }}
        accounts={accounts}
        maxAccountsAllowed={maxAccountsAllowed}
        onAccountsUpdated={async () => {
          await refreshAccounts();
          await checkStatus();
        }}
        addLog={addLog}
      />
    </div>
  );
};
