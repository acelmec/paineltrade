import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  createDemoAccountSupabase,
  updateAccountSupabase,
  saveAccountStrategySupabase,
  saveRemoteCopySubscriptionSupabase,
  deleteRemoteCopySubscriptionSupabase,
  calculateAccountDrawdownMetrics,
  updateStrategyReportStatusSupabase,
  syncAllCopyRulesToNinjaTrader,
  getNinjaAccountMetricsCache,
  saveNinjaAccountMetricsCache,
  fetchNinjaLiveBridgeSnapshotSupabase,
  isSameAsset,
  type NinjaAccountMetricsSnapshot
} from '../services/db';
import type { BrokerAccount, AccountStrategy, AccountPlatform, RemoteCopySubscription } from '../services/db';
import { checkNinjaStatus, isNinjaExecutionAccount } from '../services/ninjaGateway';
import { NinjaSyncModal } from './NinjaSyncModal';
import { ConnectionsHub } from './ConnectionsHub';
import { getLocalPlatformConnections } from '../services/connectionsService';
import { sanitizeTimeMask } from '../utils/date';
import { isElectronApp } from '../utils/platform';

export const AccountsDashboard: React.FC = () => {
  const [dashboardMainTab, setDashboardMainTab] = useState<'contas' | 'conexoes'>('contas');
  const {
    user,
    accounts,
    setAccounts,
    refreshAccounts,
    deleteAccountAction,
    resetAccountAction,
    activeAccount,
    setActiveAccount,
    switchAccount,
    prompts,
    accountStrategies,
    setAccountStrategies,
    linkStrategyToAccount,
    unlinkStrategyFromAccount,
    remoteCopyConfigs,
    refreshRemoteCopyConfigs,
    reports,
    fetchReportsList,
    addLog,
    panels,
    activePanel,
    createPanelAction,
    customStrategies,
    publicStrategies,
    canAccessAlgorithmCreator,
    canAccessCopyTrading,
    maxDemoAccounts,
    maxSyncAccounts,
    planDetails,
    settings,
    isRestrictedSession
  } = useApp();

  const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
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
  
  const demoAccounts = accounts.filter(a => a.platform === 'axion' || a.id?.startsWith('acc_sim_') || a.account_type === 'internal_demo' || (!a.send_localhost && a.platform !== 'nt8'));
  const syncAccounts = accounts.filter(a => a.platform === 'nt8' || (a.send_localhost === true && !['mt4', 'mt5', 'ctrader', 'binance', 'axion'].includes(a.platform || '')));
  const displayAccounts = isCopyOnly ? syncAccounts : accounts;

  const demoAccountsCount = demoAccounts.length;
  const syncAccountsCount = syncAccounts.length;

  const canCreateMoreDemo = isSystemAdmin || demoAccountsCount < maxDemoAccounts;
  const canSyncMoreNT8 = isSystemAdmin || syncAccountsCount < maxSyncAccounts;
  const canCreateMore = !isCopyOnly && (canCreateMoreDemo || canSyncMoreNT8);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isNinjaSyncOpen, setIsNinjaSyncOpen] = useState(false);
  const [ninjaOnline, setNinjaOnline] = useState(false);
  const [isRemoteBridge, setIsRemoteBridge] = useState(false);
  const [ninjaLatency, setNinjaLatency] = useState<number | null>(null);
  const [ninjaTotalAccounts, setNinjaTotalAccounts] = useState<number>(0);
  const [ninjaMetricsMap, setNinjaMetricsMap] = useState<Record<string, NinjaAccountMetricsSnapshot>>(() => getNinjaAccountMetricsCache());
  const [bridgeOpenPositions, setBridgeOpenPositions] = useState<any[]>([]);
  const [editingAccount, setEditingAccount] = useState<BrokerAccount | null>(null);
  const [accountToDeactivateWithOps, setAccountToDeactivateWithOps] = useState<{
    account: BrokerAccount;
    ops: any[];
  } | null>(null);

  // Carregar contas e relatórios frescos ao abrir o painel de Gestão de Contas
  useEffect(() => {
    refreshAccounts(false);
    fetchReportsList(true);
  }, []);

  // Modo de Visualização: Cards ('grid') ou Lista ('list')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      return (localStorage.getItem('vortex_accounts_view_mode') as 'grid' | 'list') || 'grid';
    } catch {
      return 'grid';
    }
  });

  const handleToggleViewMode = () => {
    const nextMode = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(nextMode);
    try {
      localStorage.setItem('vortex_accounts_view_mode', nextMode);
    } catch {}
  };

  // Monitorar disponibilidade do NinjaTrader (Local :8001 ou Cloud Bridge via PC Principal)
  useEffect(() => {
    let isMounted = true;
    const checkStatus = async () => {
      try {
        const res = await checkNinjaStatus();
        const online = res.status === 'online';
        if (online) {
          if (isMounted) {
            setIsRemoteBridge(false);
            setNinjaOnline(true);
            setNinjaLatency(res.latencyMs !== undefined ? res.latencyMs : null);
          }
          // Buscar as contas e posições realmente conectadas no NinjaTrader
          try {
            const { fetchNinjaAccounts, fetchNinjaPositionsAndOrders } = await import('../services/ninjaGateway');
            const [njAccounts, posOrd] = await Promise.all([
              fetchNinjaAccounts(),
              fetchNinjaPositionsAndOrders()
            ]);
            if (isMounted) {
              setBridgeOpenPositions(posOrd?.positions || []);
              // Filtra apenas contas realmente conectadas (isConnected=true) no NinjaTrader
              const connectedOnly = njAccounts.filter((a: any) => a.isConnected === true || a.isConnected === undefined);
              setNinjaTotalAccounts(connectedOnly.length || njAccounts.length);

              // ⭐️ Sincronização e persistência das métricas do NinjaTrader (PnL Diário, Saldo, etc.)
              if (njAccounts && njAccounts.length > 0) {
                const currentCache = getNinjaAccountMetricsCache();
                const updatedCache = { ...currentCache };
                const nowIso = new Date().toISOString();

                for (const nj of njAccounts) {
                  const key = nj.name.trim().toUpperCase();
                  const daily = Number(nj.realizedPnL || 0) + Number(nj.unrealizedPnL || 0);
                  const snap: NinjaAccountMetricsSnapshot = {
                    accountName: nj.name,
                    cashValue: Number(nj.cashValue || 0),
                    realizedPnL: Number(nj.realizedPnL || 0),
                    unrealizedPnL: Number(nj.unrealizedPnL || 0),
                    dailyPnL: daily,
                    updatedAt: nowIso
                  };
                  updatedCache[key] = snap;
                  if (nj.displayName && nj.displayName.trim().toUpperCase() !== key) {
                    updatedCache[nj.displayName.trim().toUpperCase()] = snap;
                  }
                }
                saveNinjaAccountMetricsCache(updatedCache);
                setNinjaMetricsMap(updatedCache);
              }
            }
          } catch {
            if (isMounted) {
              setNinjaTotalAccounts(0);
              setBridgeOpenPositions([]);
            }
          }
        } else {
          // Consulta o snapshot ao vivo da nuvem (gerado pelo PC Desktop com NT8)
          const bridgeSnap = await fetchNinjaLiveBridgeSnapshotSupabase(true);
          if (bridgeSnap && bridgeSnap.isOnline && isMounted) {
            setIsRemoteBridge(true);
            setNinjaOnline(true);
            setNinjaLatency(bridgeSnap.latencyMs || 25);
            setNinjaTotalAccounts(bridgeSnap.accounts.length);
            setBridgeOpenPositions(bridgeSnap.positions || []);
            if (bridgeSnap.metricsMap) {
              setNinjaMetricsMap(bridgeSnap.metricsMap);
              saveNinjaAccountMetricsCache(bridgeSnap.metricsMap);
            }
          } else if (isMounted) {
            setIsRemoteBridge(false);
            setNinjaOnline(false);
            setNinjaLatency(null);
            setNinjaTotalAccounts(0);
            setBridgeOpenPositions([]);
          }
        }
      } catch {
        if (isMounted) {
          setIsRemoteBridge(false);
          setNinjaOnline(false);
          setNinjaLatency(null);
          setNinjaTotalAccounts(0);
          setBridgeOpenPositions([]);
        }
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);


  // States para Formulário de Criar/Editar Conta
  const [formName, setFormName] = useState('');
  const [formPlatform, setFormPlatform] = useState<AccountPlatform>('axion');
  const [formInitialBalance, setFormInitialBalance] = useState(50000);
  const [formDdMode, setFormDdMode] = useState<'intraday_trailing' | 'eod'>('intraday_trailing');
  const [formMaxDd, setFormMaxDd] = useState(2500);
  const [formDailyStop, setFormDailyStop] = useState(1000);
  const [formAllowMultiSignals, setFormAllowMultiSignals] = useState(true);
  const [formEnforceLockout, setFormEnforceLockout] = useState(true);
  const [formProfitTarget, setFormProfitTarget] = useState(3000);
  const [formConsistencyPct, setFormConsistencyPct] = useState(40);
  const [formSimulateElimination, setFormSimulateElimination] = useState(true);
  const [formSendLocalhost, setFormSendLocalhost] = useState(false);

  // Novos campos: Risco Operacional Pessoal & Operações Manuais
  const [formManualTradingEnabled, setFormManualTradingEnabled] = useState(true);
  const [formManualStartTime, setFormManualStartTime] = useState('00:00:00');
  const [formManualEndTime, setFormManualEndTime] = useState('23:59:59');
  const [formManualMaxLots, setFormManualMaxLots] = useState(10);
  const [formManualMaxDailyTrades, setFormManualMaxDailyTrades] = useState(0);
  const [formTraderDailyStopLossUsd, setFormTraderDailyStopLossUsd] = useState(0);
  const [formTraderDailyTakeProfitUsd, setFormTraderDailyTakeProfitUsd] = useState(0);
  const [formExecutionSymbol, setFormExecutionSymbol] = useState('');
  const [formSymbolMapping, setFormSymbolMapping] = useState('NQ->MNQ, ES->MES, YM->MYM');
  const [formMappingPreset, setFormMappingPreset] = useState<'none' | 'nq_mnq' | 'es_mes' | 'fixed' | 'custom'>('nq_mnq');
  const [formApiKey, setFormApiKey] = useState('');
  const [formApiSecret, setFormApiSecret] = useState('');
  const [formConnectionHost, setFormConnectionHost] = useState('');
  const [formPairingToken, setFormPairingToken] = useState('');
  const [modalTab, setModalTab] = useState<'mesa' | 'manual' | 'mapping'>('mesa');

  // States para Modal de Estratégias por Conta
  const [selectedAccountForStrats, setSelectedAccountForStrats] = useState<BrokerAccount | null>(null);
  const [selectedOptionToLink, setSelectedOptionToLink] = useState<string>('');


  // States para Modal de Copy Remoto (Seguir IDs Externos)
  const [selectedAccountForRemoteCopy, setSelectedAccountForRemoteCopy] = useState<BrokerAccount | null>(null);
  const [remoteSourceIdInput, setRemoteSourceIdInput] = useState('');
  const [remoteLabelInput, setRemoteLabelInput] = useState('');
  const [remoteMultiplierInput, setRemoteMultiplierInput] = useState(1.0);
  const [copiedIdMsg, setCopiedIdMsg] = useState(false);

  const handleOpenCreate = () => {
    if (isRestrictedSession) {
      alert('🔒 Modo Segundo Acesso Restrito: A criação de contas não é permitida neste acesso.');
      return;
    }
    setFormName(`Conta #${accounts.length + 1}`);
    setFormPlatform('axion');
    setFormInitialBalance(50000);
    setFormDdMode('intraday_trailing');
    setFormMaxDd(2500);
    setFormDailyStop(1000);
    setFormAllowMultiSignals(true);
    setFormEnforceLockout(true);
    setFormProfitTarget(3000);
    setFormConsistencyPct(40);
    setFormSimulateElimination(true);
    setFormSendLocalhost(false);
    setFormExecutionSymbol('');
    setFormSymbolMapping('NQ->MNQ, ES->MES, YM->MYM');
    setFormMappingPreset('nq_mnq');
    setFormApiKey('');
    setFormApiSecret('');
    setFormConnectionHost('');
    setFormPairingToken('');

    setFormManualTradingEnabled(true);
    setFormManualStartTime('00:00:00');
    setFormManualEndTime('23:59:59');
    setFormManualMaxLots(10);
    setFormManualMaxDailyTrades(0);
    setFormTraderDailyStopLossUsd(0);
    setFormTraderDailyTakeProfitUsd(0);

    setModalTab('mesa');
    setIsCreateModalOpen(true);
  };

  const handleOpenEdit = (acc: BrokerAccount) => {
    if (isRestrictedSession) {
      alert('🔒 Modo Segundo Acesso Restrito: A edição de regras de contas não é permitida neste acesso.');
      return;
    }
    const isNinja = acc.platform === 'nt8' || isNinjaExecutionAccount(acc) || Boolean(acc.send_localhost);
    const isMt = acc.platform === 'mt4' || acc.platform === 'mt5';
    let initBal = acc.initial_balance || 50000;
    if (isMt && initBal === 50000 && acc.balance && acc.balance > 0 && acc.balance < 25000) {
      initBal = acc.balance;
    }
    let host = acc.connection_host || '';
    let token = acc.pairing_token || '';
    if (isMt && (!host || !token)) {
      const mtConn = getLocalPlatformConnections().find(c => c.platform === acc.platform && c.is_active);
      if (mtConn) {
        if (!host) host = mtConn.host_url || 'http://144.126.141.254';
        if (!token) token = mtConn.pairing_token || 'vps_mt4';
      }
    }

    setEditingAccount(acc);
    setFormName(acc.account_name);
    setFormPlatform(acc.platform || 'axion');
    setFormInitialBalance(initBal);
    setFormDdMode(acc.dd_mode || 'intraday_trailing');
    setFormMaxDd(acc.max_drawdown_usd || 2500);
    setFormDailyStop(acc.daily_stop_loss_usd || 1000);
    setFormAllowMultiSignals(acc.allow_multi_signals ?? true);
    setFormEnforceLockout(acc.enforce_dd_lockout ?? true);
    setFormProfitTarget(acc.profit_target_usd || 3000);
    setFormConsistencyPct(acc.consistency_pct !== undefined ? acc.consistency_pct : 40);
    setFormSimulateElimination(isNinja ? false : acc.simulate_elimination !== false);
    setFormSendLocalhost(acc.send_localhost || false);
    setFormExecutionSymbol(acc.execution_symbol || '');
    setFormSymbolMapping(acc.symbol_mapping || '');
    setFormApiKey(acc.api_key || '');
    setFormApiSecret(acc.api_secret || '');
    setFormConnectionHost(host);
    setFormPairingToken(token);

    if (acc.symbol_mapping === 'NQ->MNQ, ES->MES, YM->MYM') {
      setFormMappingPreset('nq_mnq');
    } else if (acc.symbol_mapping === 'ES->MES') {
      setFormMappingPreset('es_mes');
    } else if (acc.execution_symbol && acc.execution_symbol.trim() !== '') {
      setFormMappingPreset('fixed');
    } else if (acc.symbol_mapping && acc.symbol_mapping.trim() !== '') {
      setFormMappingPreset('custom');
    } else {
      setFormMappingPreset('none');
    }

    setFormManualTradingEnabled(acc.manual_trading_enabled !== false);
    setFormManualStartTime(acc.manual_start_time || '00:00:00');
    setFormManualEndTime(acc.manual_end_time || '23:59:59');
    setFormManualMaxLots(acc.manual_max_lots !== undefined ? acc.manual_max_lots : 10);
    setFormManualMaxDailyTrades(acc.manual_max_daily_trades || 0);
    setFormTraderDailyStopLossUsd(acc.trader_daily_stop_loss_usd || 0);
    setFormTraderDailyTakeProfitUsd(acc.trader_daily_take_profit_usd || 0);

    setModalTab('mesa');
  };

  const handleSaveAccount = async () => {
    if (!formName.trim()) return;
    const accountNameTrimmed = formName.trim();

    const isNinja = formPlatform === 'nt8' || editingAccount?.platform === 'nt8' || formSendLocalhost || isNinjaExecutionAccount(editingAccount || { platform: formPlatform, account_name: accountNameTrimmed, send_localhost: formSendLocalhost });
    const finalSimulateElimination = isNinja ? false : formSimulateElimination;

    let autoSyncedSymbols: string[] = [];
    let effectiveInitialBalance = Number(formInitialBalance);
    if (formPlatform === 'binance' && formApiKey.trim() && formApiSecret.trim()) {
      try {
        const { fetchBinanceAccount } = await import('../services/binanceService');
        const isFutures = (formConnectionHost && (formConnectionHost.includes('future') || formConnectionHost.includes('fapi'))) || accountNameTrimmed.toLowerCase().includes('futuro');
        const bInfo = await fetchBinanceAccount(formApiKey.trim(), formApiSecret.trim(), Boolean(isFutures), formConnectionHost);
        if (bInfo && bInfo.totalBalanceUsd !== undefined) {
          const realB = bInfo.totalBalanceUsd;
          effectiveInitialBalance = realB;
          autoSyncedSymbols = bInfo.suggestedSymbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
          addLog('SISTEMA', `⚡ Binance: Saldo real detectado: US$ ${realB.toFixed(2)}. Ativos: ${autoSyncedSymbols.join(', ')}`, 'sistema');
        }
      } catch (bErr) {
        console.warn('[AccountsDashboard] Auto-sync Binance ao salvar:', bErr);
      }
    } else if (['mt4', 'mt5', 'ctrader'].includes(formPlatform)) {
      autoSyncedSymbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'US30'];
    }

    if (editingAccount) {
      const isMtAcc = editingAccount.platform === 'mt4' || editingAccount.platform === 'mt5' || formPlatform === 'mt4' || formPlatform === 'mt5';
      const balanceChanged = Number(editingAccount.initial_balance) !== effectiveInitialBalance;
      if (balanceChanged) {
        if (editingAccount.platform === 'nt8' || editingAccount.send_localhost) {
          alert('O saldo de contas sincronizadas com o NinjaTrader 8 não pode ser alterado manualmente. Utilize a sincronização do NinjaTrader para atualizar o saldo.');
          return;
        }
        if (isMtAcc) {
          // Contas MT4/MT5 sincronizam saldo real diretamente da corretora, sem reset destrutivo
        } else {
          const confirmReset = window.confirm(
            `⚠️ ATENÇÃO: Alterar o Saldo Inicial de US$ ${editingAccount.initial_balance.toLocaleString()} para US$ ${effectiveInitialBalance.toLocaleString()} irá RESETAR a conta e APAGAR TODO O HISTÓRICO DE OPERAÇÕES desta conta no banco de dados.\n\nDeseja prosseguir com o reset e salvar o novo saldo?`
          );
          if (!confirmReset) return;
        }
      }

      if (!isNinja && editingAccount.simulate_elimination && !formSimulateElimination) {
        alert("Uma conta criada com 'Simulação de Reprovação (Eliminação Definitiva)' não pode ter essa regra desativada a não ser que a conta seja resetada zerando o histórico de operações.");
        return;
      }

      const updatedFields: Partial<BrokerAccount> = {
        account_name: accountNameTrimmed,
        platform: formPlatform,
        initial_balance: effectiveInitialBalance,
        dd_mode: formDdMode,
        max_drawdown_usd: Number(formMaxDd),
        daily_stop_loss_usd: Number(formDailyStop),
        allow_multi_signals: formAllowMultiSignals,
        enforce_dd_lockout: formEnforceLockout,
        profit_target_usd: Number(formProfitTarget),
        consistency_pct: Number(formConsistencyPct),
        simulate_elimination: finalSimulateElimination,
        is_master: false,
        send_localhost: formSendLocalhost,
        manual_trading_enabled: formManualTradingEnabled,
        manual_start_time: formManualStartTime,
        manual_end_time: formManualEndTime,
        manual_max_lots: Number(formManualMaxLots),
        manual_max_daily_trades: Number(formManualMaxDailyTrades),
        trader_daily_stop_loss_usd: Number(formTraderDailyStopLossUsd),
        trader_daily_take_profit_usd: Number(formTraderDailyTakeProfitUsd),
        execution_symbol: formExecutionSymbol.trim(),
        symbol_mapping: formSymbolMapping.trim(),
        api_key: formApiKey.trim(),
        api_secret: formApiSecret.trim(),
        connection_host: formConnectionHost.trim(),
        pairing_token: formPairingToken.trim()
      };

      if (balanceChanged) {
        const newBal = (isMtAcc && editingAccount.balance && editingAccount.balance > 0) ? editingAccount.balance : effectiveInitialBalance;
        updatedFields.balance = newBal;
        updatedFields.high_watermark = newBal;
        updatedFields.eod_baseline_balance = newBal;
        updatedFields.status = 'active';
      }

      // Atualização otimista imediata no estado da UI (0ms)
      setAccounts(prev => prev.map(a => a.id === editingAccount.id ? { ...a, ...updatedFields } : a));
      if (activeAccount?.id === editingAccount.id) {
        setActiveAccount(prev => prev ? { ...prev, ...updatedFields } : null);
      }

      setEditingAccount(null);
      setIsCreateModalOpen(false);
      addLog('SISTEMA', `✅ Regras da conta "${accountNameTrimmed}" salvas com sucesso.`, 'sistema');

      await updateAccountSupabase(editingAccount.id, updatedFields);
      if (balanceChanged && !isMtAcc) {
        await resetAccountAction(editingAccount, effectiveInitialBalance);
      }
      await refreshAccounts();
      await syncAllCopyRulesToNinjaTrader().catch(() => {});
    } else {
      const isNT8Account = formSendLocalhost || formPlatform === 'nt8';
      if (!isSystemAdmin) {
        if (isNT8Account && !canAccessCopyTrading) {
          alert('🔒 Recurso Exclusivo do Copy NT8:\n\nA criação ou sincronização de contas com o NinjaTrader 8 requer o módulo ou assinatura Copy NT8.');
          return;
        }
        if (isNT8Account && !canSyncMoreNT8) {
          alert(`Limite máximo de ${maxSyncAccounts} contas sincronizadas com o NinjaTrader 8 atingido para o seu plano.`);
          return;
        }
        if (!isNT8Account && !canCreateMoreDemo) {
          alert(`Limite máximo de ${maxDemoAccounts} contas Demo atingido para o seu plano.`);
          return;
        }
      }

      const newParams = {
        account_name: accountNameTrimmed,
        platform: formPlatform,
        initial_balance: effectiveInitialBalance,
        dd_mode: formDdMode,
        max_drawdown_usd: Number(formMaxDd),
        daily_stop_loss_usd: Number(formDailyStop),
        allow_multi_signals: formAllowMultiSignals,
        enforce_dd_lockout: formEnforceLockout,
        profit_target_usd: Number(formProfitTarget),
        consistency_pct: Number(formConsistencyPct),
        simulate_elimination: formSimulateElimination,
        is_master: false,
        send_localhost: formSendLocalhost,
        manual_trading_enabled: formManualTradingEnabled,
        manual_start_time: formManualStartTime,
        manual_end_time: formManualEndTime,
        manual_max_lots: Number(formManualMaxLots),
        manual_max_daily_trades: Number(formManualMaxDailyTrades),
        trader_daily_stop_loss_usd: Number(formTraderDailyStopLossUsd),
        trader_daily_take_profit_usd: Number(formTraderDailyTakeProfitUsd),
        execution_symbol: formExecutionSymbol.trim(),
        symbol_mapping: formSymbolMapping.trim(),
        api_key: formApiKey.trim(),
        api_secret: formApiSecret.trim(),
        connection_host: formConnectionHost.trim(),
        pairing_token: formPairingToken.trim()
      };

      setIsCreateModalOpen(false);
      addLog('SISTEMA', `✅ Nova conta "${accountNameTrimmed}" criada com sucesso.`, 'sistema');

      const createdAcc = await createDemoAccountSupabase(newParams);
      if (createdAcc) {
        setAccounts(prev => {
          const cleanName = createdAcc.account_name.trim().toLowerCase();
          const exists = prev.some(a => a.id === createdAcc.id || a.account_name.trim().toLowerCase() === cleanName);
          return exists ? prev.map(a => (a.id === createdAcc.id || a.account_name.trim().toLowerCase() === cleanName) ? createdAcc : a) : [...prev, createdAcc];
        });
      }
      await refreshAccounts();
      await syncAllCopyRulesToNinjaTrader().catch(() => {});
    }

    if (autoSyncedSymbols.length > 0 && createPanelAction) {
      for (const sym of autoSyncedSymbols) {
        const exists = (panels || []).some((p: any) => 
          p.name?.toUpperCase() === sym || 
          p.instance_id?.toLowerCase() === sym.toLowerCase()
        );
        if (!exists) {
          let tick = 0.01;
          let point = 1.0;
          let sl = 40;
          let tp = 80;
          if (sym === 'EURUSD' || sym === 'GBPUSD') { tick = 0.00001; point = 100000; sl = 0.0020; tp = 0.0040; }
          else if (sym === 'USDJPY') { tick = 0.001; point = 1000; sl = 0.30; tp = 0.60; }
          else if (sym === 'XAUUSD') { tick = 0.01; point = 100; sl = 5.0; tp = 10.0; }
          else if (sym === 'US30') { tick = 1.0; point = 1.0; sl = 80; tp = 160; }
          else if (sym.startsWith('BTC')) { tick = 0.10; point = 1.0; sl = 400; tp = 800; }
          await createPanelAction(sym, sym.toLowerCase(), point, tick, sl, tp);
        }
      }
    }
  };

  const handleToggleAccountActive = async (acc: BrokerAccount) => {
    // Se a conta está ATIVA e o usuário deseja DESATIVAR (is_active: true -> false)
    if (acc.is_active) {
      const cleanAccName = (acc.account_name || '').trim().toUpperCase();
      const activeBridgeOps = bridgeOpenPositions.filter(p => p.account && p.account.trim().toUpperCase() === cleanAccName);
      if (activeBridgeOps.length > 0) {
        alert(`⚠️ A conta "${acc.account_name}" possui ${activeBridgeOps.length} posição(ões) aberta(s) no NinjaTrader. Zere as posições antes de pausar a conta.`);
        return;
      }

      const activeOps = reports.filter(r => r.status === 'Em Andamento' && r.account_id === acc.id);
      if (activeOps.length > 0) {
        setAccountToDeactivateWithOps({ account: acc, ops: activeOps });
        return;
      }
    }

    const nextActive = !acc.is_active;
    setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, is_active: nextActive } : a));
    await updateAccountSupabase(acc.id, { is_active: nextActive });
  };

  const handleCloseOpsAndDeactivateAccount = async () => {
    if (!accountToDeactivateWithOps) return;
    const { account, ops } = accountToDeactivateWithOps;

    const nowIso = new Date().toISOString();
    for (const op of ops) {
      await updateStrategyReportStatusSupabase(op.id, 'Cancelado', Number(op.entry_price), nowIso);
    }

    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, is_active: false } : a));
    await updateAccountSupabase(account.id, { is_active: false });
    setAccountToDeactivateWithOps(null);
    addLog('SISTEMA', `🚫 Posições da conta "${account.account_name}" foram encerradas e a conta foi DESATIVADA.`, 'alerta');
    await refreshAccounts();
    await fetchReportsList(true);
  };

  const handleResetBalance = async (acc: BrokerAccount) => {
    if (isRestrictedSession) {
      alert('🔒 Modo Segundo Acesso Restrito: O reset de saldo de contas não é permitido neste acesso.');
      return;
    }
    if (acc.platform === 'nt8' || acc.send_localhost) {
      alert(`A conta "${acc.account_name}" é sincronizada com o NinjaTrader 8. O saldo desta conta é gerenciado diretamente pela corretora/NinjaTrader e não pode ser resetado manualmente pelo painel.`);
      return;
    }
    if (window.confirm(`Tem certeza que deseja resetar a conta "${acc.account_name}"?\n\n• O saldo e limites serão restaurados para US$ ${Number(acc.initial_balance).toLocaleString('en-US')}.\n• Todo o histórico de operações desta conta será apagado permanentemente da Análise de Desempenho e da base de dados.`)) {
      await resetAccountAction(acc, Number(acc.initial_balance));
    }
  };

  const handleDeleteAccount = async (acc: BrokerAccount) => {
    if (isRestrictedSession) {
      alert('🔒 Modo Segundo Acesso Restrito: A exclusão de contas não é permitida neste acesso.');
      return;
    }
    if (window.confirm(`Excluir a conta "${acc.account_name}"?\n\n⚠️ Atenção: Esta ação é definitiva.\n• Todas as operações desta conta na Análise de Desempenho serão excluídas da base de dados.`)) {
      await deleteAccountAction(acc);
    }
  };

  const handleSyncBinanceBalance = async (acc: BrokerAccount) => {
    if (!acc.api_key || !acc.api_secret) {
      alert('Chaves de API da Binance ausentes nesta conta. Clique em "⚙️ Editar Regras" e preencha a API Key e Secret.');
      return;
    }
    addLog('SISTEMA', `🔄 Consultando saldo real na Binance para a conta "${acc.account_name}"...`, 'sistema');
    try {
      const { fetchBinanceAccount } = await import('../services/binanceService');
      const isFutures = (acc.connection_host && (acc.connection_host.includes('future') || acc.connection_host.includes('fapi'))) || acc.account_name.toLowerCase().includes('futuro');
      const info = await fetchBinanceAccount(acc.api_key, acc.api_secret, Boolean(isFutures), acc.connection_host);
      if (info && info.totalBalanceUsd !== undefined) {
        const realBal = info.totalBalanceUsd;
        await updateAccountSupabase(acc.id, {
          balance: realBal,
          initial_balance: realBal,
          high_watermark: realBal,
          eod_baseline_balance: realBal,
          status: 'active'
        });
        setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, balance: realBal, initial_balance: realBal } : a));
        if (activeAccount?.id === acc.id) {
          setActiveAccount(prev => prev ? { ...prev, balance: realBal, initial_balance: realBal } : null);
        }
        // Auto-provisionar painéis/ativos da Binance se não existirem
        const symbolsToCreate = info.suggestedSymbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
        if (createPanelAction) {
          for (const sym of symbolsToCreate) {
            const exists = (panels || []).some((p: any) => 
              p.name?.toUpperCase() === sym || 
              p.instance_id?.toLowerCase() === sym.toLowerCase()
            );
            if (!exists) {
              const tick = sym.startsWith('BTC') ? 0.10 : 0.01;
              await createPanelAction(sym, sym.toLowerCase(), 1.0, tick, 50, 100);
            }
          }
        }

        addLog('SISTEMA', `✅ Binance: Saldo sincronizado (US$ ${realBal.toFixed(2)}) e ativos listados (${symbolsToCreate.join(', ')}).`, 'sistema');
        const activosStr = info.balances.length > 0 ? info.balances.map(b => `${b.asset}: ${b.free}`).join(', ') : 'Nenhum ativo com saldo positivo';
        alert(`✅ Conexão com Binance Sincronizada com Sucesso!\n\n• Saldo Real: US$ ${realBal.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n• Ativos na Carteira: ${activosStr}\n• Ativos Prontos no Gráfico: ${symbolsToCreate.join(', ')}\n\nOs pares de negociação foram listados e já estão prontos no seletor de gráficos para transmissão ao vivo!`);
      } else {
        alert('⚠️ Não foi possível obter o saldo da Binance.\n\nVerifique:\n1. Se a API Key e Secret estão corretas;\n2. Se a permissão "Habilitar Leitura" está marcada na Binance;\n3. Se o seu IP atual de internet está cadastrado na lista de IPs confiáveis da Binance.');
      }
    } catch (err: any) {
      alert(`Erro ao conectar com a Binance: ${err.message}`);
    }
  };

  const handleToggleStrategyForAccount = async (opts: { promptId?: string; strategyId?: string }, currentRoute?: AccountStrategy) => {
    if (isRestrictedSession) {
      alert('🔒 Modo Segundo Acesso Restrito: A alteração de vínculos não é permitida neste acesso.');
      return;
    }
    if (!selectedAccountForStrats) return;
    if (isNinjaExecutionAccount(selectedAccountForStrats)) {
      alert(`🔒 Contas NinjaTrader operam exclusivamente via Copy Trading.\n\nPara executar robôs ou estratégias automatizadas, vincule-os a uma Conta Demo.`);
      return;
    }
    if (currentRoute) {
      addLog('SISTEMA', `🗑️ Robô/Indicador desvinculado da conta "${selectedAccountForStrats.account_name}".`, 'sistema');
      await unlinkStrategyFromAccount(currentRoute.id);
    } else {
      addLog('SISTEMA', `➕ Robô/Indicador vinculado à conta "${selectedAccountForStrats.account_name}".`, 'sistema');
      await linkStrategyToAccount({
        account_id: selectedAccountForStrats.id,
        prompt_id: opts.promptId || null,
        manual_strategy_id: opts.strategyId || null,
        contract_size_multiplier: 1.0,
        is_enabled: true
      });
    }
  };

  const handleChangeStrategyMultiplier = async (routeId: string, accountId: string, opts: { promptId?: string; strategyId?: string }, mult: number) => {
    setAccountStrategies(prev => prev.map(r => r.id === routeId ? { ...r, contract_size_multiplier: mult } : r));
    await saveAccountStrategySupabase({
      id: routeId,
      account_id: accountId,
      prompt_id: opts.promptId || null,
      manual_strategy_id: opts.strategyId || null,
      contract_size_multiplier: mult,
      is_enabled: true
    });
  };

  // 📡 Handlers de Copy Remoto
  const handleAddRemoteCopySubscription = async () => {
    if (!selectedAccountForRemoteCopy || !remoteSourceIdInput.trim()) return;
    const result = await saveRemoteCopySubscriptionSupabase({
      account_id: selectedAccountForRemoteCopy.id,
      remote_source_id: remoteSourceIdInput.trim(),
      label: remoteLabelInput.trim() || 'Master Remoto',
      lot_multiplier: Number(remoteMultiplierInput) || 1,
      is_active: true
    });
    if (result) {
      await refreshRemoteCopyConfigs();
      setRemoteSourceIdInput('');
      setRemoteLabelInput('');
      setRemoteMultiplierInput(1.0);
    }
  };

  const handleToggleRemoteCopySubscription = async (sub: RemoteCopySubscription) => {
    await saveRemoteCopySubscriptionSupabase({
      id: sub.id,
      account_id: sub.account_id,
      remote_source_id: sub.remote_source_id,
      label: sub.label,
      lot_multiplier: sub.lot_multiplier,
      is_active: !sub.is_active
    });
    await refreshRemoteCopyConfigs();
  };

  const handleDeleteRemoteCopySubscription = async (subId: string) => {
    await deleteRemoteCopySubscriptionSupabase(subId);
    await refreshRemoteCopyConfigs();
  };

  const getPlatformBadge = (platform?: AccountPlatform) => {
    switch (platform) {
      case 'mt4':
        return (
          <span className="px-1.5 py-0.5 text-[9px] font-black uppercase bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded shrink-0 flex items-center gap-1" title="Plataforma: MetaTrader 4">
            <span className="text-[10px]">🟦</span> MT4
          </span>
        );
      case 'mt5':
        return (
          <span className="px-1.5 py-0.5 text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded shrink-0 flex items-center gap-1" title="Plataforma: MetaTrader 5">
            <span className="text-[10px]">🟩</span> MT5
          </span>
        );
      case 'binance':
        return (
          <span className="px-1.5 py-0.5 text-[9px] font-black uppercase bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 rounded shrink-0 flex items-center gap-1" title="Plataforma: Binance Cripto Cloud API">
            <span className="text-[10px]">🟨</span> BINANCE
          </span>
        );
      case 'ctrader':
        return (
          <span className="px-1.5 py-0.5 text-[9px] font-black uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded shrink-0 flex items-center gap-1" title="Plataforma: cTrader Open API">
            <span className="text-[10px]">🌐</span> CTRADER
          </span>
        );
      case 'nt8':
        return (
          <span className="px-1.5 py-0.5 text-[9px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded shrink-0 flex items-center gap-1" title="Plataforma: NinjaTrader 8">
            <span className="text-[10px]">🟧</span> NT8
          </span>
        );
      case 'axion':
      default:
        return (
          <span className="px-1.5 py-0.5 text-[9px] font-black uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded shrink-0 flex items-center gap-1" title="Plataforma: Conta Nativa Axion">
            <span className="text-[10px]">⚡</span> AXION
          </span>
        );
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* 🔒 BANNER DE SEGUNDO ACESSO RESTRITO */}
      {isRestrictedSession && (
        <div className="bg-amber-950/80 border border-amber-600/60 rounded-xl p-3.5 flex items-center justify-between gap-3 text-amber-200 text-xs shadow-lg animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🔒</span>
            <div>
              <div className="text-xs font-black text-amber-100 flex items-center gap-2">
                <span>Segundo Acesso Restrito (Acesso de Leitura e Monitoramento)</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-600 text-white uppercase tracking-wider">
                  Configuração Travada
                </span>
              </div>
              <div className="text-[11px] text-amber-300/90 mt-0.5">
                Visualização de saldos, métricas e status de contas habilitada. Inclusão, sincronização, edição ou exclusão de contas estão desativadas neste perfil.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-xl shadow-lg backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏦</span>
            <h1 className="text-xl font-bold text-white tracking-wide">Gestão de Contas</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {isCopyOnly
              ? `Gerencie suas contas NinjaTrader 8 sincronizadas para operações de Copy Trading (limite de até ${isSystemAdmin ? 'ilimitadas' : `${maxSyncAccounts} contas NT8`}).`
              : `Gerencie suas contas (${isSystemAdmin ? 'ilimitadas para Administrador' : `até ${maxDemoAccounts} contas Demo e ${maxSyncAccounts} contas NT8`}) com suporte a Demo Axion e NinjaTrader 8.`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(() => {
            // Contas do painel marcadas para sincronizar com NinjaTrader
            const panelNinjaAccounts = accounts.filter(a => a.platform === 'nt8' || a.send_localhost === true);
            const syncedNinjaAccountsCount = panelNinjaAccounts.length;
            return (
              <button
                onClick={() => {
                  if (!canAccessCopyTrading) {
                    alert('🔒 Recurso Exclusivo do Copy NT8:\n\nA sincronização de contas com o NinjaTrader 8 está disponível para assinantes com o módulo Copy NT8 ativo.');
                    return;
                  }
                  setIsNinjaSyncOpen(true);
                }}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 border shadow-md active:scale-95 cursor-pointer ${
                  canAccessCopyTrading
                    ? 'bg-blue-950/80 hover:bg-blue-900/90 text-blue-300 border-blue-700/60 hover:shadow-blue-500/20'
                    : 'bg-slate-900/80 text-slate-500 border-slate-800'
                }`}
                title={
                  !canAccessCopyTrading
                    ? 'Requer módulo Copy NT8'
                    : ninjaOnline
                    ? `NinjaTrader 8 Conectado | Latência: ${ninjaLatency !== null ? `${ninjaLatency}ms` : '< 1ms'} | Contas: ${syncedNinjaAccountsCount} sincronizada${syncedNinjaAccountsCount !== 1 ? 's' : ''} no painel${ninjaTotalAccounts > 0 ? ` de ${ninjaTotalAccounts} no NinjaTrader` : ''}`
                    : 'NinjaTrader 8 Desconectado (abra o NinjaTrader e conecte sua corretora)'
                }
              >
                <span className="relative flex h-2 w-2">
                  {ninjaOnline && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isRemoteBridge ? 'bg-cyan-400' : 'bg-emerald-400'} opacity-75`}></span>}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${ninjaOnline ? (isRemoteBridge ? 'bg-cyan-400' : 'bg-emerald-400') : 'bg-slate-500'}`}></span>
                </span>
                <span className="flex items-center gap-1.5" translate="no">
                  <span>📥</span>
                  <span>{isRemoteBridge ? 'NinjaTrader Espelhado PC' : 'Sincronizar NinjaTrader'}</span>
                  {ninjaOnline && (
                    <span className="text-[11px] opacity-90">
                      ({syncedNinjaAccountsCount}{ninjaTotalAccounts > 0 ? `/${ninjaTotalAccounts}` : ''})
                    </span>
                  )}
                </span>
                {ninjaOnline && ninjaLatency !== null && (
                  <span className={`text-[9px] font-mono ${isRemoteBridge ? 'text-cyan-300 bg-cyan-900/80 border-cyan-700/40' : 'text-emerald-300 bg-emerald-900/80 border-emerald-700/40'} px-1.5 py-0.2 rounded border`}>
                    {ninjaLatency}ms
                  </span>
                )}
              </button>
            );
          })()}

          {/* Botão de Sincronização Binance */}
          {(() => {
            const binanceAcc = accounts.find(a => a.platform === 'binance');
            const binanceConns = getLocalPlatformConnections().filter(c => c.platform === 'binance' && c.is_active);
            const hasBinance = Boolean(binanceAcc || binanceConns.length > 0);

            if (!hasBinance) return null;

            return (
              <button
                type="button"
                onClick={() => {
                  if (binanceAcc) {
                    handleSyncBinanceBalance(binanceAcc);
                  } else {
                    setDashboardMainTab('conexoes');
                  }
                }}
                className="px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 border shadow-md active:scale-95 cursor-pointer bg-yellow-950/80 hover:bg-yellow-900/90 text-yellow-300 border-yellow-700/60 shadow-yellow-900/20"
                title="Sincronizar saldo real e ativos da Binance"
              >
                <span>🟡</span>
                <span>Sincronizar Binance</span>
                {binanceAcc && (
                  <span className="text-[11px] opacity-90 font-mono text-emerald-400 font-bold">
                    (US$ {Number(binanceAcc.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                  </span>
                )}
              </button>
            );
          })()}


          {/* Botão de Sincronização MetaTrader 4 / 5 */}
          {(() => {
            const mtConns = getLocalPlatformConnections().filter(c => (c.platform === 'mt4' || c.platform === 'mt5') && c.is_active);
            const hasMtOnline = mtConns.some(c => c.status === 'online');
            const mtDetectedCount = mtConns.reduce((sum, c) => sum + (c.detected_accounts_detail?.length || c.detected_accounts?.length || 0), 0);

            if (mtConns.length === 0 && !accounts.some(a => a.platform === 'mt4' || a.platform === 'mt5')) return null;

            return (
              <button
                type="button"
                onClick={() => setDashboardMainTab('conexoes')}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 border shadow-md active:scale-95 cursor-pointer ${
                  hasMtOnline
                    ? 'bg-sky-950/80 hover:bg-sky-900/90 text-sky-300 border-sky-700/60 shadow-sky-900/20'
                    : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 border-slate-800'
                }`}
                title="Sincronizar contas reais do MetaTrader 4 / 5"
              >
                <span className="relative flex h-2 w-2">
                  {hasMtOnline && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${hasMtOnline ? 'bg-sky-400' : 'bg-slate-500'}`}></span>
                </span>
                <span className="flex items-center gap-1.5" translate="no">
                  <span>🟦</span>
                  <span>Sincronizar MetaTrader</span>
                  {mtDetectedCount > 0 && (
                    <span className="text-[11px] opacity-90 font-mono text-emerald-400 font-bold">
                      ({mtDetectedCount} online)
                    </span>
                  )}
                </span>
              </button>
            );
          })()}

          {/* Botão de Alternância: Modo Cards vs Modo Lista */}
          <button
            type="button"
            onClick={handleToggleViewMode}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
              viewMode === 'list'
                ? 'bg-blue-600/20 text-blue-300 border-blue-500/50 hover:bg-blue-600/30 shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 hover:text-white'
            }`}
            title={viewMode === 'grid' ? 'Alternar para Modo Lista' : 'Alternar para Modo Cards'}
          >
            <span className="text-sm">{viewMode === 'grid' ? '📋' : '🎴'}</span>
            <span>{viewMode === 'grid' ? 'Modo Lista' : 'Modo Cards'}</span>
          </button>

          <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-2">
            {isCopyOnly ? (
              <span>Contas NT8 Sincronizadas: <span className="text-amber-400 font-bold">{syncAccountsCount}/{isSystemAdmin ? '∞' : maxSyncAccounts}</span></span>
            ) : (
              <>
                <span>Demo: <span className="text-blue-400 font-bold">{demoAccountsCount}/{isSystemAdmin ? '∞' : maxDemoAccounts}</span></span>
                <span className="text-slate-600">|</span>
                <span>NT8: <span className="text-amber-400 font-bold">{syncAccountsCount}/{isSystemAdmin ? '∞' : maxSyncAccounts}</span></span>
              </>
            )}
          </div>
          {!isCopyOnly && !isRestrictedSession && (
            <button
              onClick={handleOpenCreate}
              disabled={!canCreateMore}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                canCreateMore
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md hover:shadow-blue-500/20 active:scale-95 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
            >
              <span>+</span> Nova Conta
            </button>
          )}
        </div>
      </div>

      {/* Abas Superiores do Dashboard: Minhas Contas vs Central de Conexões */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setDashboardMainTab('contas')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            dashboardMainTab === 'contas'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <span>🏦</span> Minhas Contas ({accounts.length})
        </button>

        <button
          type="button"
          onClick={() => setDashboardMainTab('conexoes')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            dashboardMainTab === 'conexoes'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <span>🔌</span> Central de Conexões (VPS / NT8 / MT4 / MT5 / Binance)
        </button>
      </div>

      {dashboardMainTab === 'conexoes' ? (
        <ConnectionsHub
          accounts={accounts}
          onAccountsUpdated={async () => { await refreshAccounts(); }}
          onSelectConnection={async (conn, detectedAcc) => {
            setDashboardMainTab('contas');
            const targetDetail = detectedAcc || conn.detected_accounts_detail?.[0];
            const targetAccNum = targetDetail?.account_number || conn.detected_accounts?.[0];
            const realBal = (targetDetail && targetDetail.balance > 0) 
              ? targetDetail.balance 
              : (conn.detected_accounts_detail?.[0]?.balance || 0);

            // 1. Verifica se a conta já existe no painel
            const existing = accounts.find(a => 
              a.platform === conn.platform && 
              (targetAccNum ? (a.account_name.includes(targetAccNum) || (a as any).account_number === targetAccNum) : false)
            );

            if (existing) {
              // Corrige saldo inicial se estava com o bug de 50.000 da mesa demo
              const needsInitialFix = (existing.initial_balance === 50000 && realBal > 0 && realBal < 25000) ||
                (existing.initial_balance === 50000 && existing.balance && existing.balance > 0 && existing.balance < 25000);
              const fixedInitial = needsInitialFix ? (realBal > 0 ? realBal : existing.balance) : existing.initial_balance;

              if (needsInitialFix || (realBal > 0 && existing.balance !== realBal)) {
                await updateAccountSupabase(existing.id, {
                  balance: realBal > 0 ? realBal : existing.balance,
                  initial_balance: fixedInitial,
                  high_watermark: fixedInitial,
                  eod_baseline_balance: fixedInitial,
                  connection_host: conn.host_url || existing.connection_host,
                  pairing_token: conn.pairing_token || existing.pairing_token
                });
                await refreshAccounts();
              }

              handleOpenEdit({
                ...existing,
                initial_balance: fixedInitial,
                connection_host: conn.host_url || existing.connection_host,
                pairing_token: conn.pairing_token || existing.pairing_token
              });
              setModalTab('mesa');
              return;
            }

            // 2. Se NÃO existe e é MT4 ou MT5: Insere automaticamente no banco com saldo real bloqueado
            if (conn.platform === 'mt4' || conn.platform === 'mt5') {
              const effectiveBal = realBal > 0 ? realBal : 10000;
              const accName = targetDetail?.name || (targetAccNum ? `Conta ${conn.platform.toUpperCase()} #${targetAccNum}` : conn.name);
              
              const newAcc = await createDemoAccountSupabase({
                account_name: accName,
                platform: conn.platform,
                initial_balance: effectiveBal,
                dd_mode: 'intraday_trailing',
                max_drawdown_usd: Math.round(effectiveBal * 0.1) || 1000,
                daily_stop_loss_usd: Math.round(effectiveBal * 0.05) || 500,
                daily_max_gain_usd: Math.round(effectiveBal * 0.1) || 1000,
                daily_max_entries: 0,
                allow_multi_signals: true,
                enforce_dd_lockout: true,
                simulate_elimination: false,
                is_master: false,
                send_localhost: false,
                connection_host: conn.host_url,
                pairing_token: conn.pairing_token || '',
                manual_trading_enabled: true
              });

              await refreshAccounts();

              if (newAcc) {
                handleOpenEdit(newAcc);
                setModalTab('mesa');
              }
              return;
            }

            // 3. Fallback para Binance ou NinjaTrader 8
            handleOpenCreate();
            setFormPlatform(conn.platform as any);
            setFormConnectionHost(conn.host_url || '');
            setFormPairingToken(conn.pairing_token || '');
            if (conn.platform === 'binance') {
              setFormSendLocalhost(false);
              if (conn.api_key) setFormApiKey(conn.api_key);
              if (conn.api_secret) setFormApiSecret(conn.api_secret);
              if (realBal > 0) {
                setFormInitialBalance(realBal);
                setFormDailyStop(Math.round(realBal * 0.05) || 100);
                setFormMaxDd(Math.round(realBal * 0.1) || 200);
                setFormProfitTarget(Math.round(realBal * 0.1) || 200);
              }
            } else if (conn.platform === 'nt8') {
              setFormSendLocalhost(true);
            }
          }}
        />
      ) : (
        <>
          {/* Visualização de Contas: Modo Cards (Grid) ou Modo Lista */}
          {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayAccounts.map(acc => {
            const isNinjaAcc = isNinjaExecutionAccount(acc);
            const cleanAccName = (acc.account_name || '').trim().toUpperCase();
            const njSnapshot = isNinjaAcc ? (ninjaMetricsMap[cleanAccName] || ninjaMetricsMap[acc.id]) : undefined;

            const metrics = calculateAccountDrawdownMetrics(
              acc,
              reports,
              panels,
              njSnapshot ? {
                dailyPnL: njSnapshot.dailyPnL,
                balance: njSnapshot.cashValue,
                realizedPnL: njSnapshot.realizedPnL,
                unrealizedPnL: njSnapshot.unrealizedPnL,
                updatedAt: njSnapshot.updatedAt
              } : undefined,
              settings?.global_cycle_start || '20:00:00'
            );
            const isCurrentActive = activeAccount?.id === acc.id;
            const assignedStrats = accountStrategies.filter(s => s.account_id === acc.id);
            const openOps = reports.filter(op => op.account_id === acc.id && op.status === 'Em Andamento');
            const accBridgePositions = bridgeOpenPositions.filter(p => p.account && p.account.trim().toUpperCase() === cleanAccName);
            const totalActiveOpsCount = isNinjaAcc ? (accBridgePositions.length > 0 ? accBridgePositions.length : openOps.length) : openOps.length;

            return (
              <div
                key={acc.id}
                className={`bg-slate-900/80 border rounded-xl p-5 space-y-4 flex flex-col justify-between transition-all ${
                  isCurrentActive
                    ? 'border-blue-500 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/30'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Top Card */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xl shrink-0">💼</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-bold text-slate-100 text-sm truncate">{acc.account_name}</h3>
                          {getPlatformBadge(acc.platform)}
                          {acc.execution_symbol ? (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-800/60 rounded shrink-0" title={`Ativo fixo de execução: ${acc.execution_symbol}`}>
                              🎯 {acc.execution_symbol}
                            </span>
                          ) : acc.symbol_mapping ? (
                            acc.symbol_mapping === 'NQ->MNQ, ES->MES, YM->MYM' ? (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800/60 rounded shrink-0" title="Mapeamento: NQ->MNQ, ES->MES, YM->MYM (Automático)">
                                🎯 Auto (Cheio ➔ Micro)
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold bg-purple-950 text-purple-300 border border-purple-800/60 rounded shrink-0" title={`Mapeamento: ${acc.symbol_mapping}`}>
                                🎯 {acc.symbol_mapping.length > 15 ? `${acc.symbol_mapping.slice(0, 14)}...` : acc.symbol_mapping}
                              </span>
                            )
                          ) : null}
                        </div>
                        {/* ID da Conta */}
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mt-0.5 select-text" onClick={e => e.stopPropagation()}>
                          <span className="text-slate-400 text-[9px] font-bold">🔑 ID Conta:</span>
                          <span className="truncate max-w-[90px] text-slate-300 font-bold" title={acc.id}>{acc.id.slice(0, 8)}...</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(acc.id);
                              alert(`ID da conta "${acc.account_name}" copiado!`);
                            }}
                            className="text-[8.5px] text-blue-400 hover:text-blue-300 font-bold bg-blue-950/60 hover:bg-blue-900/60 px-1.5 py-0.5 rounded border border-blue-800/40 cursor-pointer shrink-0 transition"
                            title="Copiar ID da Conta (VM_PainelId)"
                          >
                            📋 Copiar ID Conta
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {metrics.isLockedOut && !(acc.platform === 'nt8' || isNinjaExecutionAccount(acc) || acc.send_localhost) && acc.simulate_elimination !== false ? (
                        <span className="px-2 py-1 text-[10px] font-black uppercase bg-red-500/20 text-red-300 border border-red-500/40 rounded shadow-sm inline-block">
                          🔴 REPROVADA
                        </span>
                      ) : acc.is_active ? (
                        <button
                          type="button"
                          onClick={() => handleToggleAccountActive(acc)}
                          className="px-2.5 py-1 text-[10px] font-black uppercase rounded shadow-sm flex items-center gap-1.5 transition border cursor-pointer bg-emerald-950/60 hover:bg-amber-950/60 text-emerald-300 hover:text-amber-300 border-emerald-800/60 hover:border-amber-800/60"
                          title="Conta ATIVA/OPERACIONAL. Clique para PAUSAR (⏸)"
                        >
                          <span className="text-[11px]">▶</span> ATIVA
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleAccountActive(acc)}
                          className="px-2.5 py-1 text-[10px] font-black uppercase rounded shadow-sm flex items-center gap-1.5 transition border cursor-pointer bg-slate-900 hover:bg-emerald-950/60 text-slate-400 hover:text-emerald-300 border-slate-700 hover:border-emerald-700"
                          title="Conta DESATIVADA/PAUSADA. Clique para ATIVAR (▶)"
                        >
                          <span className="text-[11px]">⏸</span> DESATIVADA
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Status de Sincronização do NinjaTrader */}
                  {isNinjaAcc && (
                    <div className="flex items-center justify-between text-[10px] px-2.5 py-1 bg-amber-500/10 rounded-lg border border-amber-500/20">
                      <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                        <span>🟧</span> NinjaTrader 8
                      </span>
                      {ninjaOnline ? (
                        isRemoteBridge ? (
                          <span className="text-cyan-300 font-bold flex items-center gap-1.5 text-[10px]" title="Espelhado ao vivo via Cloud Bridge do PC Desktop">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                            📱 Sincronizado (Via PC)
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-bold flex items-center gap-1.5 text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Sincronizado (Ao Vivo)
                          </span>
                        )
                      ) : metrics.ninjaLastSyncedAt ? (
                        <span className="text-amber-300/90 font-mono text-[9.5px]" title={`Dados locais do último sync: ${new Date(metrics.ninjaLastSyncedAt).toLocaleString('pt-BR')}. Serão atualizados na próxima conexão.`}>
                          ⏳ Offline (Sync: {new Date(metrics.ninjaLastSyncedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono text-[9.5px]">
                          ⚠️ Aguardando 1ª conexão local
                        </span>
                      )}
                    </div>
                  )}

                  {/* Status de Sincronização do MetaTrader 4 */}
                  {acc.platform === 'mt4' && (
                    <div className="flex items-center justify-between text-[10px] px-2.5 py-1 bg-sky-500/10 rounded-lg border border-sky-500/20">
                      <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                        <span>🟦</span> MetaTrader 4
                      </span>
                      <span className="text-sky-300 font-mono text-[9.5px]">
                        Conector EA (Porta 8003 / Hub)
                      </span>
                    </div>
                  )}

                  {/* Status de Sincronização do MetaTrader 5 */}
                  {acc.platform === 'mt5' && (
                    <div className="flex items-center justify-between text-[10px] px-2.5 py-1 bg-blue-500/10 rounded-lg border border-blue-500/20">
                      <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                        <span>🔷</span> MetaTrader 5
                      </span>
                      <span className="text-blue-300 font-mono text-[9.5px]">
                        Conector EA (Porta 8003 / Hub)
                      </span>
                    </div>
                  )}

                  {/* Status de Sincronização do cTrader */}
                  {acc.platform === 'ctrader' && (
                    <div className="flex items-center justify-between text-[10px] px-2.5 py-1 bg-teal-500/10 rounded-lg border border-teal-500/20">
                      <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                        <span>🟪</span> cTrader
                      </span>
                      <span className="text-teal-300 font-mono text-[9.5px]">
                        Conector cBot / Open API
                      </span>
                    </div>
                  )}

                  {/* Status de Sincronização da Binance */}
                  {acc.platform === 'binance' && (
                    <div className="flex items-center justify-between text-[10px] px-2.5 py-1 bg-amber-500/10 rounded-lg border border-amber-500/20">
                      <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                        <span>🟡</span> Binance Spot
                      </span>
                      <span className="text-amber-400 font-mono text-[9.5px]">
                        API REST Conectada
                      </span>
                    </div>
                  )}

                  {/* Saldo & PnL */}
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">Saldo Atual</div>
                      <div className="text-base font-bold text-white">
                        US$ {metrics.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-500 font-medium">PnL Diário</div>
                      <div className={`text-xs font-bold ${metrics.dailyPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {metrics.dailyPnL >= 0 ? '+' : ''}US$ {metrics.dailyPnL.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  {/* Métricas de Drawdown & Consistência */}
                  <div className="space-y-2 text-xs bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Modalidade DD:</span>
                      <span className="font-semibold text-slate-200">
                        {acc.dd_mode === 'eod' ? 'End-Of-Day (EOD)' : 'Intraday Trailing (HWM)'}
                      </span>
                    </div>

                    {/* Barra Intraday Trailing DD */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400">DD Intraday (High-Watermark)</span>
                        <span className="font-bold text-slate-300">
                          US$ {metrics.intradayDrawdownUsd.toFixed(2)} / US$ {acc.max_drawdown_usd} ({metrics.intradayDrawdownPct.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            metrics.intradayDrawdownPct > 80
                              ? 'bg-red-500'
                              : metrics.intradayDrawdownPct > 50
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, metrics.intradayDrawdownPct)}%` }}
                        />
                      </div>
                    </div>

                    {/* Barra EOD DD */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400">DD End-of-Day (EOD)</span>
                        <span className="font-bold text-slate-300">
                          US$ {metrics.eodDrawdownUsd.toFixed(2)} / US$ {acc.max_drawdown_usd} ({metrics.eodDrawdownPct.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            metrics.eodDrawdownPct > 80
                              ? 'bg-red-500'
                              : metrics.eodDrawdownPct > 50
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, metrics.eodDrawdownPct)}%` }}
                        />
                      </div>
                    </div>

                    {/* Barra Regra de Consistência (% do Maior Dia de Lucro) */}
                    <div className="space-y-1 pt-1 border-t border-slate-800/60">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400">
                          Consistência (Máx {acc.consistency_pct || 40}% {metrics.effectiveProfitBase > (acc.profit_target_usd || 3000) ? 'do Lucro Atual' : 'da Meta'} em 1 dia)
                        </span>
                        <span className={`font-bold ${metrics.consistencyViolated ? 'text-amber-400 font-extrabold' : 'text-slate-300'}`}>
                          Maior Dia: US$ {metrics.maxSingleDayProfit.toFixed(2)} / US$ {metrics.maxAllowedSingleDayProfit.toFixed(2)} ({metrics.consistencyPctCalculated.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            metrics.consistencyViolated
                              ? 'bg-amber-500 font-bold'
                              : metrics.consistencyPctCalculated > 30
                              ? 'bg-amber-500'
                              : 'bg-blue-500'
                          }`}
                          style={{ width: `${Math.min(100, (metrics.consistencyPctCalculated / (acc.consistency_pct || 40)) * 100)}%` }}
                        />
                      </div>
                      {metrics.consistencyViolated && (
                        <div className="text-[9px] font-bold text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40 text-center mt-0.5">
                          ⚠️ ATENÇÃO: MAIOR DIA EXCEDE {acc.consistency_pct || 40}% (Faça mais lucro total para enquadrar a regra)
                        </div>
                      )}
                    </div>

                    {/* Regras e Alertas */}
                    <div className="pt-1 grid grid-cols-2 gap-1.5 text-[10px] text-slate-400 bg-slate-950/40 p-2 rounded">
                      <div>Stop Diário: <span className="text-red-400 font-bold">US$ {acc.daily_stop_loss_usd}</span></div>
                      <div>Meta Lucro Total: <span className="text-emerald-400 font-bold">US$ {acc.profit_target_usd || 3000}</span></div>
                      <div>DD Máximo: <span className="text-amber-400 font-bold">US$ {acc.max_drawdown_usd}</span></div>
                      {acc.platform === 'binance' ? (
                        <div>Tipo: <span className="text-yellow-400 font-bold font-mono">Binance Spot</span></div>
                      ) : acc.platform === 'mt4' ? (
                        <div>Tipo: <span className="text-sky-400 font-bold font-mono">MetaTrader 4</span></div>
                      ) : acc.platform === 'mt5' ? (
                        <div>Tipo: <span className="text-blue-400 font-bold font-mono">MetaTrader 5</span></div>
                      ) : acc.platform === 'ctrader' ? (
                        <div>Tipo: <span className="text-teal-400 font-bold font-mono">cTrader</span></div>
                      ) : (acc.platform === 'nt8' || isNinjaExecutionAccount(acc)) ? (
                        <div>Tipo: <span className="text-amber-400 font-bold font-mono">NinjaTrader 8</span></div>
                      ) : (
                        <div>Eliminação Definitiva: <span className="text-slate-200 font-bold">{acc.simulate_elimination !== false ? 'SIM' : 'NÃO'}</span></div>
                      )}
                    </div>
                  </div>

                  {/* Resumo de Vínculos & Operações */}
                  <div className="flex items-center justify-between text-[11px] px-1 text-slate-400">
                    <span>Robôs Vinculados: <strong className="text-blue-400">{assignedStrats.length}</strong></span>
                    {totalActiveOpsCount > 0 && (
                      <span className="text-emerald-400 font-bold flex items-center gap-1.5" title={`${totalActiveOpsCount} operação(ões) ativa(s) na conta`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        {totalActiveOpsCount} pos. aberta{totalActiveOpsCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Botões de Ação do Card */}
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {!isCurrentActive ? (
                      <button
                        onClick={() => switchAccount(acc)}
                        className="flex-1 min-w-[140px] py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/40 rounded text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        👉 USAR NO GRÁFICO
                      </button>
                    ) : (
                      <div className="flex-1 min-w-[140px] py-1.5 bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 rounded text-xs font-bold text-center flex items-center justify-center gap-1">
                        ✔ EM USO NO GRÁFICO
                      </div>
                    )}

                    {canAccessAlgorithmCreator && !isRestrictedSession && (
                      <button
                        onClick={() => {
                          if (isNinjaExecutionAccount(acc)) {
                            alert(`🔒 Contas NinjaTrader operam exclusivamente via Copy Trading.\n\nPara executar robôs ou estratégias automatizadas, vincule-os a uma Conta Demo. As ordens da Demo serão replicadas automaticamente para suas contas do NinjaTrader 8.`);
                            return;
                          }
                          setSelectedAccountForStrats(acc);
                        }}
                        className={`py-1.5 px-3 rounded text-xs font-semibold transition border shrink-0 cursor-pointer ${
                          isNinjaExecutionAccount(acc)
                            ? 'bg-slate-900/60 text-slate-500 border-slate-800'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                        }`}
                        title={isNinjaExecutionAccount(acc) ? "Robôs operam via Conta Demo com Copy Trading" : "Vincular Robôs/Estratégias"}
                      >
                        🤖 Robôs
                      </button>
                    )}
                  </div>

                  {!isRestrictedSession && (
                    <div className="flex items-center justify-between text-xs pt-1">
                      <button
                        onClick={() => handleOpenEdit(acc)}
                        className="text-slate-400 hover:text-slate-200 transition cursor-pointer"
                      >
                        ⚙️ Editar Regras
                      </button>
                      {acc.platform === 'binance' && (
                        <button
                          onClick={() => handleSyncBinanceBalance(acc)}
                          className="text-yellow-400 hover:text-yellow-300 font-bold transition cursor-pointer flex items-center gap-1 bg-yellow-500/10 hover:bg-yellow-500/20 px-2 py-0.5 rounded border border-yellow-500/30"
                          title="Sincronizar saldo real e listar ativos da Binance automaticamente no Axion"
                        >
                          ⚡ Sincronizar Saldo & Ativos
                        </button>
                      )}
                      {!(acc.platform === 'nt8' || acc.send_localhost || acc.platform === 'binance') && (
                        <button
                          onClick={() => handleResetBalance(acc)}
                          className="text-amber-400 hover:text-amber-300 transition cursor-pointer"
                        >
                          🔄 Reset Saldo
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteAccount(acc)}
                        className="text-red-400 hover:text-red-300 transition cursor-pointer"
                      >
                        🗑️ Excluir
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Modo Lista de Contas */
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Nome da Conta</th>
                  <th className="py-3 px-3">Tipo</th>
                  <th className="py-3 px-3 text-right">Saldo Atual</th>
                  <th className="py-3 px-3 text-right">PnL Aberto</th>
                  <th className="py-3 px-3 text-right">PnL Realizado</th>
                  <th className="py-3 px-3 text-center">Total de Robôs</th>
                  <th className="py-3 px-4">Consistência</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {displayAccounts.map(acc => {
                  const isNinjaAcc = isNinjaExecutionAccount(acc);
                  const cleanAccName = (acc.account_name || '').trim().toUpperCase();
                  const njSnapshot = isNinjaAcc ? (ninjaMetricsMap[cleanAccName] || ninjaMetricsMap[acc.id]) : undefined;

                  const metrics = calculateAccountDrawdownMetrics(
                    acc,
                    reports,
                    panels,
                    njSnapshot ? {
                      dailyPnL: njSnapshot.dailyPnL,
                      balance: njSnapshot.cashValue,
                      realizedPnL: njSnapshot.realizedPnL,
                      unrealizedPnL: njSnapshot.unrealizedPnL,
                      updatedAt: njSnapshot.updatedAt
                    } : undefined,
                    settings?.global_cycle_start || '20:00:00'
                  );
                  const isCurrentActive = activeAccount?.id === acc.id;
                  const assignedStrats = accountStrategies.filter(s => s.account_id === acc.id);

                  // PnL Aberto (Floating / Unrealized PnL)
                  const openOps = reports.filter(op => op.account_id === acc.id && op.status === 'Em Andamento');
                  const accBridgePositions = bridgeOpenPositions.filter(p => p.account && p.account.trim().toUpperCase() === cleanAccName);
                  const totalActiveOpsCount = isNinjaAcc ? (accBridgePositions.length > 0 ? accBridgePositions.length : openOps.length) : openOps.length;

                  let floatingPnL = 0;
                  if (njSnapshot?.unrealizedPnL !== undefined && isNinjaAcc) {
                    floatingPnL = Number(njSnapshot.unrealizedPnL);
                  } else if (accBridgePositions.length > 0 && isNinjaAcc) {
                    floatingPnL = accBridgePositions.reduce((sum, p) => sum + (Number(p.unrealizedPnL) || 0), 0);
                  } else if (openOps.length > 0 && panels && panels.length > 0) {
                    for (const op of openOps) {
                      if (op.entry_price) {
                        let matchedPanel = panels.find(p => p.id === op.panel_id || (op.instance_id && p.instance_id === op.instance_id));
                        if (!matchedPanel && op.symbol) {
                          const cleanSym = op.symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
                          matchedPanel = panels.find(p =>
                            p.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanSym ||
                            p.instance_id.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanSym ||
                            (p.symbol && p.symbol.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanSym) ||
                            isSameAsset(p.name, op.symbol) ||
                            isSameAsset(p.symbol, op.symbol)
                          );
                        }
                        if (!matchedPanel && op.description) {
                          const match = op.description.match(/\[(.*?)\]/);
                          if (match && match[1]) {
                            const cleanDesc = match[1].toLowerCase().replace(/[^a-z0-9]/g, '');
                            matchedPanel = panels.find(p =>
                              p.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanDesc ||
                              p.instance_id.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanDesc ||
                              isSameAsset(p.name, match[1])
                            );
                          }
                        }
                        if (matchedPanel && matchedPanel.marketData && matchedPanel.marketData.price) {
                          const curPrice = Number(matchedPanel.marketData.price);
                          const entry = Number(op.entry_price);
                          const pts = op.side === 'COMPRA' ? curPrice - entry : entry - curPrice;
                          const contracts = op.contrato !== undefined && op.contrato !== null ? Number(op.contrato) : 1;
                          const pointVal = matchedPanel.point_value !== undefined && matchedPanel.point_value !== null ? Number(matchedPanel.point_value) : 1.0;
                          floatingPnL += pts * contracts * pointVal;
                        }
                      }
                    }
                  }

                  // PnL Realizado (Realized PnL)
                  let realizedPnL = 0;
                  if (njSnapshot?.realizedPnL !== undefined && isNinjaAcc) {
                    realizedPnL = Number(njSnapshot.realizedPnL);
                  } else {
                    realizedPnL = metrics.dailyPnL - floatingPnL;
                  }

                  // Tipo formatado da conta
                  const getAccountTypeLabel = () => {
                    if (acc.platform === 'nt8' || acc.send_localhost) return 'NinjaTrader 8 (Local)';
                    if (acc.platform === 'mt5') return 'MetaTrader 5';
                    if (acc.platform === 'mt4') return 'MetaTrader 4';
                    return 'Axion Simulado';
                  };

                  return (
                    <tr
                      key={acc.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isCurrentActive ? 'bg-blue-950/20' : ''
                      }`}
                    >
                      {/* 1. Nome da Conta */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base shrink-0">💼</span>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-100 text-sm">{acc.account_name}</span>
                              {getPlatformBadge(acc.platform)}
                              {acc.execution_symbol ? (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-800/60 rounded" title={`Ativo: ${acc.execution_symbol}`}>
                                  🎯 {acc.execution_symbol}
                                </span>
                              ) : acc.symbol_mapping ? (
                                acc.symbol_mapping === 'NQ->MNQ, ES->MES, YM->MYM' ? (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800/60 rounded" title="Mapeamento: NQ->MNQ, ES->MES, YM->MYM (Automático)">
                                    🎯 Auto (Cheio ➔ Micro)
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-purple-950 text-purple-300 border border-purple-800/60 rounded" title={`Mapeamento: ${acc.symbol_mapping}`}>
                                    🎯 {acc.symbol_mapping.length > 12 ? `${acc.symbol_mapping.slice(0, 10)}...` : acc.symbol_mapping}
                                  </span>
                                )
                              ) : null}
                              {isCurrentActive && (
                                <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/40 rounded">
                                  EM USO
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                              <span>ID: {acc.id.slice(0, 8)}...</span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(acc.id);
                                  alert(`ID da conta "${acc.account_name}" copiado!`);
                                }}
                                className="text-[9px] text-blue-400 hover:text-blue-300 font-bold bg-blue-950/60 hover:bg-blue-900/60 px-1 py-0.2 rounded border border-blue-800/40 cursor-pointer transition"
                                title="Copiar ID"
                              >
                                📋 Copiar
                              </button>
                              {/* Status Ativa/Pausada */}
                              {metrics.isLockedOut && !(acc.platform === 'nt8' || isNinjaExecutionAccount(acc) || acc.send_localhost) && acc.simulate_elimination !== false ? (
                                <span className="text-red-400 font-black">🔴 REPROVADA</span>
                              ) : acc.is_active ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleAccountActive(acc)}
                                  className="text-emerald-400 hover:text-amber-400 font-bold cursor-pointer"
                                  title="Clique para pausar"
                                >
                                  ▶ Ativa
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleToggleAccountActive(acc)}
                                  className="text-slate-500 hover:text-emerald-400 font-bold cursor-pointer"
                                  title="Clique para ativar"
                                >
                                  ⏸ Pausada
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Tipo */}
                      <td className="py-3.5 px-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-slate-300 text-xs">{getAccountTypeLabel()}</span>
                          <span className="text-[10px] text-slate-500">
                            {acc.dd_mode === 'eod' ? 'EOD Drawdown' : 'Intraday Trailing'}
                          </span>
                        </div>
                      </td>

                      {/* 3. Saldo Atual */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="font-mono font-bold text-white text-sm">
                          US$ {metrics.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Inicial: US$ {Number(acc.initial_balance || 50000).toLocaleString('en-US')}
                        </div>
                      </td>

                      {/* 4. PnL Aberto */}
                      <td className="py-3.5 px-3 text-right">
                        <div className={`font-mono font-bold text-xs ${
                          floatingPnL > 0 ? 'text-emerald-400' : floatingPnL < 0 ? 'text-red-400' : 'text-slate-400'
                        }`}>
                          {floatingPnL > 0 ? '+' : ''}US$ {floatingPnL.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                        {totalActiveOpsCount > 0 && (
                          <div className="text-[10px] text-emerald-400 font-mono font-bold flex items-center justify-end gap-1">
                            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></span>
                            {totalActiveOpsCount} pos. aberta{totalActiveOpsCount > 1 ? 's' : ''}
                          </div>
                        )}
                      </td>

                      {/* 5. PnL Realizado */}
                      <td className="py-3.5 px-3 text-right">
                        <div className={`font-mono font-bold text-xs ${
                          realizedPnL > 0 ? 'text-emerald-400' : realizedPnL < 0 ? 'text-red-400' : 'text-slate-400'
                        }`}>
                          {realizedPnL > 0 ? '+' : ''}US$ {realizedPnL.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Diário: {metrics.dailyPnL >= 0 ? '+' : ''}US$ {metrics.dailyPnL.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </td>

                      {/* 6. Total de Robôs */}
                      <td className="py-3.5 px-3 text-center">
                        {canAccessAlgorithmCreator ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (isNinjaExecutionAccount(acc)) {
                                alert(`🔒 Contas NinjaTrader operam exclusivamente via Copy Trading.\n\nPara executar robôs ou estratégias automatizadas, vincule-os a uma Conta Demo. As ordens da Demo serão replicadas automaticamente para suas contas do NinjaTrader 8.`);
                                return;
                              }
                              setSelectedAccountForStrats(acc);
                            }}
                            className={`px-2.5 py-1 rounded-lg border text-xs inline-flex items-center gap-1.5 transition cursor-pointer font-bold ${
                              isNinjaExecutionAccount(acc)
                                ? 'bg-slate-900/60 border-slate-800 text-slate-500'
                                : 'bg-blue-950/60 hover:bg-blue-900/60 border-blue-800/40 text-blue-300'
                            }`}
                            title={isNinjaExecutionAccount(acc) ? "Robôs operam via Conta Demo com Copy Trading" : "Gerenciar Robôs Vinculados"}
                          >
                            <span>🤖</span>
                            <span>{assignedStrats.length} robô{assignedStrats.length !== 1 ? 's' : ''}</span>
                          </button>
                        ) : (
                          <span className="text-slate-600 text-xs">-</span>
                        )}
                      </td>

                      {/* 7. Consistência */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1 min-w-[150px]">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-400 font-semibold">
                              {metrics.consistencyPctCalculated.toFixed(1)}% <span className="text-slate-500">/ {acc.consistency_pct || 40}%</span>
                            </span>
                            <span className={`font-mono font-bold ${metrics.consistencyViolated ? 'text-amber-400' : 'text-slate-300'}`}>
                              Maior: US$ {metrics.maxSingleDayProfit.toFixed(0)}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                metrics.consistencyViolated
                                  ? 'bg-amber-500 font-bold'
                                  : metrics.consistencyPctCalculated > 30
                                  ? 'bg-amber-500'
                                  : 'bg-blue-500'
                              }`}
                              style={{ width: `${Math.min(100, (metrics.consistencyPctCalculated / (acc.consistency_pct || 40)) * 100)}%` }}
                            />
                          </div>
                          {metrics.consistencyViolated && (
                            <div className="text-[8.5px] font-bold text-amber-400 bg-amber-950/60 px-1 py-0.2 rounded border border-amber-800/40 text-center">
                              ⚠️ Excede {acc.consistency_pct || 40}%
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 8. Ações */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {!isCurrentActive ? (
                            <button
                              onClick={() => switchAccount(acc)}
                              className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/40 rounded text-[11px] font-bold transition cursor-pointer"
                              title="Usar no Gráfico"
                            >
                              👉 Usar
                            </button>
                          ) : (
                            <span className="px-2.5 py-1 bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 rounded text-[11px] font-bold">
                              ✔ Em Uso
                            </span>
                          )}

                          {!isRestrictedSession && (
                            <>
                              <button
                                onClick={() => handleOpenEdit(acc)}
                                className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition cursor-pointer"
                                title="Editar Regras da Conta"
                              >
                                ⚙️
                              </button>

                              {acc.platform === 'binance' && (
                                <button
                                  type="button"
                                  onClick={() => handleSyncBinanceBalance(acc)}
                                  className="p-1 text-yellow-400 hover:text-yellow-300 rounded hover:bg-yellow-950/30 transition cursor-pointer"
                                  title="Sincronizar Saldo Real e Ativos da Binance"
                                >
                                  ⚡
                                </button>
                              )}

                              {!(acc.platform === 'nt8' || acc.send_localhost || acc.platform === 'binance') && (
                                <button
                                  type="button"
                                  onClick={() => handleResetBalance(acc)}
                                  className="p-1 text-amber-400 hover:text-amber-300 rounded hover:bg-amber-950/30 transition cursor-pointer"
                                  title="Resetar Saldo e Histórico de Operações"
                                >
                                  🔄
                                </button>
                              )}

                              <button
                                onClick={() => handleDeleteAccount(acc)}
                                className="p-1 text-red-400 hover:text-red-300 rounded hover:bg-red-950/30 transition cursor-pointer"
                                title="Excluir Conta"
                              >
                                🗑️
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      )}

      {/* Modal Criar / Editar Conta */}
      {(isCreateModalOpen || editingAccount) && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>{editingAccount ? '⚙️' : '✨'}</span>
                <span>{editingAccount ? 'Editar Regras da Conta' : 'Nova Conta'}</span>
              </h2>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setEditingAccount(null);
                }}
                className="text-slate-400 hover:text-white transition text-sm font-bold cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {/* Seletor Rápido de Conexão Validada (Hub de Conexões) */}
            {!editingAccount && (
              <div className="bg-slate-950/90 p-3 rounded-lg border border-emerald-900/40 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <span>🔌</span> Vincular a uma Conexão Validada (Hub VPS / MT4 / NT8):
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateModalOpen(false);
                      setDashboardMainTab('conexoes');
                    }}
                    className="text-[10px] text-emerald-400 hover:underline cursor-pointer"
                  >
                    Gerenciar Conexões ➔
                  </button>
                </div>
                <select
                  onChange={(e) => {
                    const connId = e.target.value;
                    if (!connId) return;
                    const conns = getLocalPlatformConnections();
                    const found = conns.find(c => c.id === connId);
                    if (found) {
                      setFormPlatform(found.platform as any);
                      if (found.platform === 'mt4' || found.platform === 'mt5') {
                        setFormSendLocalhost(true);
                        const accDetail = found.detected_accounts_detail?.[0];
                        if (accDetail) {
                          setFormName(accDetail.name || `MT4 #${accDetail.account_number}`);
                          if (accDetail.balance > 0) {
                            setFormInitialBalance(accDetail.balance);
                            setFormDailyStop(Math.round(accDetail.balance * 0.05) || 1000);
                            setFormMaxDd(Math.round(accDetail.balance * 0.1) || 2500);
                            setFormProfitTarget(Math.round(accDetail.balance * 0.1) || 2000);
                          }
                        } else if (found.detected_accounts && found.detected_accounts.length > 0) {
                          setFormName(`Conta MT4 #${found.detected_accounts[0]}`);
                        }
                      } else if (found.platform === 'nt8') {
                        setFormSendLocalhost(true);
                      }
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-emerald-500 font-mono cursor-pointer"
                >
                  <option value="">Selecione uma conexão para auto-preencher...</option>
                  {getLocalPlatformConnections().filter(c => c.is_active).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.platform === 'nt8' ? '🟧' : c.platform === 'mt4' ? '🟦' : c.platform === 'mt5' ? '🔷' : c.platform === 'binance' ? '🟡' : '🟪'} {c.name} ({c.status === 'online' ? '● Online' : '○ Offline'}) — {c.host_url}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Seletor Visual de Plataforma */}
            <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-slate-300 font-bold text-xs">
                  🌐 Plataforma de Execução <span className="text-blue-400 font-black">*</span>
                </label>
                {editingAccount && (
                  <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                    🔒 Bloqueado na Edição
                  </span>
                )}
              </div>

              {editingAccount ? (
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {getPlatformBadge(formPlatform)}
                    <div>
                      <div className="font-bold text-xs text-white">
                        {formPlatform === 'axion' && 'Conta Demo Axion'}
                        {formPlatform === 'nt8' && 'NinjaTrader 8'}
                        {formPlatform === 'mt4' && 'MetaTrader 4'}
                        {formPlatform === 'mt5' && 'MetaTrader 5'}
                        {formPlatform === 'binance' && 'Binance Cripto'}
                        {formPlatform === 'ctrader' && 'cTrader Open API'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {formPlatform === 'axion' ? 'Execução nativa no painel' : 'Sincronizada via Gateway / API'}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 text-right">
                    O tipo de plataforma não pode ser alterado após a criação.
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {/* Opção 1: Demo Axion */}
                    <button
                      type="button"
                      onClick={() => { setFormPlatform('axion'); setFormSendLocalhost(false); }}
                      className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                        formPlatform === 'axion'
                          ? 'bg-blue-600/20 border-blue-500 text-blue-300 ring-1 ring-blue-500/40 shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xl">⚡</span>
                        {formPlatform === 'axion' && <span className="text-xs text-blue-400 font-black">✓</span>}
                      </div>
                      <div className="mt-1.5">
                        <div className="font-bold text-xs text-white">Axion Demo</div>
                        <div className="text-[10px] text-slate-400">Simulado Nativo</div>
                      </div>
                    </button>

                    {/* Opção 2: NinjaTrader 8 */}
                    <button
                      type="button"
                      onClick={() => {
                        if (!canAccessCopyTrading) {
                          alert('🔒 Recurso Exclusivo do Copy NT8:\n\nA sincronização de contas com o NinjaTrader 8 está disponível para assinantes com o módulo Copy NT8 ativo.');
                          return;
                        }
                        setIsCreateModalOpen(false);
                        setIsNinjaSyncOpen(true);
                      }}
                      className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer group ${
                        formPlatform === 'nt8'
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 ring-1 ring-amber-500/40 shadow-sm'
                          : canAccessCopyTrading
                            ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20'
                            : 'border-slate-800 bg-slate-900/50 opacity-60'
                      }`}
                      title="Importar contas conectadas diretamente do NinjaTrader 8"
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xl">🟧</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">NT8</span>
                      </div>
                      <div className="mt-1.5">
                        <div className="font-bold text-xs text-amber-300 group-hover:text-amber-200">NinjaTrader 8</div>
                        <div className="text-[10px] text-amber-400/80">Addon / Túnel</div>
                      </div>
                    </button>

                    {/* Opção 3: MetaTrader 5 */}
                    <button
                      type="button"
                      onClick={() => { 
                        setFormPlatform('mt5'); 
                        setFormSendLocalhost(false); 
                        const mtConn = getLocalPlatformConnections().find(c => c.platform === 'mt5' && c.is_active);
                        if (mtConn) {
                          if (!formConnectionHost) setFormConnectionHost(mtConn.host_url || 'http://144.126.141.254');
                          if (!formPairingToken) setFormPairingToken(mtConn.pairing_token || 'vps_mt5');
                          const det = mtConn.detected_accounts_detail?.[0];
                          if (det && det.balance > 0) {
                            setFormInitialBalance(det.balance);
                            setFormDailyStop(Math.round(det.balance * 0.05) || 500);
                            setFormMaxDd(Math.round(det.balance * 0.1) || 1000);
                            setFormProfitTarget(Math.round(det.balance * 0.1) || 1000);
                            if (formName.startsWith('Conta #')) {
                              setFormName(det.name || `Conta MT5 #${det.account_number}`);
                            }
                          }
                        }
                      }}
                      className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                        formPlatform === 'mt5'
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/40 shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xl">🟩</span>
                        {formPlatform === 'mt5' && <span className="text-xs text-emerald-400 font-black">✓</span>}
                      </div>
                      <div className="mt-1.5">
                        <div className="font-bold text-xs text-white">MetaTrader 5</div>
                        <div className="text-[10px] text-slate-400">EA Conector MQL5</div>
                      </div>
                    </button>

                    {/* Opção 4: MetaTrader 4 */}
                    <button
                      type="button"
                      onClick={() => { 
                        setFormPlatform('mt4'); 
                        setFormSendLocalhost(false); 
                        const mtConn = getLocalPlatformConnections().find(c => c.platform === 'mt4' && c.is_active);
                        if (mtConn) {
                          if (!formConnectionHost) setFormConnectionHost(mtConn.host_url || 'http://144.126.141.254');
                          if (!formPairingToken) setFormPairingToken(mtConn.pairing_token || 'vps_mt4');
                          const det = mtConn.detected_accounts_detail?.[0];
                          if (det && det.balance > 0) {
                            setFormInitialBalance(det.balance);
                            setFormDailyStop(Math.round(det.balance * 0.05) || 500);
                            setFormMaxDd(Math.round(det.balance * 0.1) || 1000);
                            setFormProfitTarget(Math.round(det.balance * 0.1) || 1000);
                            if (formName.startsWith('Conta #')) {
                              setFormName(det.name || `Conta MT4 #${det.account_number}`);
                            }
                          }
                        }
                      }}
                      className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                        formPlatform === 'mt4'
                          ? 'bg-sky-600/20 border-sky-500 text-sky-300 ring-1 ring-sky-500/40 shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xl">🟦</span>
                        {formPlatform === 'mt4' && <span className="text-xs text-sky-400 font-black">✓</span>}
                      </div>
                      <div className="mt-1.5">
                        <div className="font-bold text-xs text-white">MetaTrader 4</div>
                        <div className="text-[10px] text-slate-400">EA Conector MQL4</div>
                      </div>
                    </button>

                    {/* Opção 5: Binance Cripto */}
                    <button
                      type="button"
                      onClick={() => { setFormPlatform('binance'); setFormSendLocalhost(false); }}
                      className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                        formPlatform === 'binance'
                          ? 'bg-yellow-600/20 border-yellow-500 text-yellow-300 ring-1 ring-yellow-500/40 shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xl">🟨</span>
                        {formPlatform === 'binance' && <span className="text-xs text-yellow-400 font-black">✓</span>}
                      </div>
                      <div className="mt-1.5">
                        <div className="font-bold text-xs text-white">Binance</div>
                        <div className="text-[10px] text-slate-400">API Cripto Cloud</div>
                      </div>
                    </button>

                    {/* Opção 6: cTrader */}
                    <button
                      type="button"
                      onClick={() => { setFormPlatform('ctrader'); setFormSendLocalhost(false); }}
                      className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                        formPlatform === 'ctrader'
                          ? 'bg-cyan-600/20 border-cyan-500 text-cyan-300 ring-1 ring-cyan-500/40 shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xl">🌐</span>
                        {formPlatform === 'ctrader' && <span className="text-xs text-cyan-400 font-black">✓</span>}
                      </div>
                      <div className="mt-1.5">
                        <div className="font-bold text-xs text-white">cTrader</div>
                        <div className="text-[10px] text-slate-400">Spotware Open API</div>
                      </div>
                    </button>
                  </div>

                  {/* Subcard de Ajuda / Conexão para MetaTrader */}
                  {(formPlatform === 'mt4' || formPlatform === 'mt5') && (
                    <div className="p-3 bg-slate-900/90 border border-emerald-900/40 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                          <span>{formPlatform === 'mt5' ? '🟩' : '🟦'}</span>
                          <span>Conector {formPlatform === 'mt5' ? 'MetaTrader 5' : 'MetaTrader 4'}</span>
                        </span>
                        <a
                          href={formPlatform === 'mt5' ? "/AxionGatewayEA.mq5" : "/AxionGatewayEA.mq4"}
                          download={formPlatform === 'mt5' ? "AxionGatewayEA.mq5" : "AxionGatewayEA.mq4"}
                          className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded text-[10px] font-bold transition flex items-center gap-1"
                        >
                          <span>⬇️</span> Baixar EA ({formPlatform.toUpperCase()})
                        </a>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Endereço IP / Host da VPS</label>
                          <input
                            type="text"
                            value={formConnectionHost}
                            onChange={(e) => setFormConnectionHost(e.target.value)}
                            placeholder="Ex: localhost ou 144.22.x.x"
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Token de Pareamento (Túnel)</label>
                          <input
                            type="text"
                            value={formPairingToken}
                            onChange={(e) => setFormPairingToken(e.target.value)}
                            placeholder="Ex: VTX-MT5-XYZ"
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
                          />
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        💡 Arraste o EA para o gráfico do MetaTrader. Ele transmitirá candles e executará ordens automaticamente.
                      </div>
                    </div>
                  )}

                  {/* Subcard de Ajuda / Conexão para Binance */}
                  {formPlatform === 'binance' && (
                    <div className="p-3 bg-slate-900/90 border border-yellow-900/40 rounded-lg space-y-2">
                      <span className="text-xs font-bold text-yellow-300 flex items-center gap-1.5">
                        <span>🟨</span> Credenciais Binance Cloud API
                      </span>
                      <div className="space-y-2 text-xs">
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Tipo de Ambiente / Servidor</label>
                          <select
                            value={formConnectionHost || 'https://testnet.binancefuture.com'}
                            onChange={(e) => setFormConnectionHost(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
                          >
                            <option value="https://testnet.binancefuture.com">🟡 Binance Futuros Testnet (Demo)</option>
                            <option value="https://testnet.binance.vision">🟡 Binance Spot Testnet (Demo)</option>
                            <option value="https://fapi.binance.com">🟡 Binance Futuros USDT-M (Real)</option>
                            <option value="https://api.binance.com">🟡 Binance Spot (Real)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">API Key</label>
                          <input
                            type="text"
                            value={formApiKey}
                            onChange={(e) => setFormApiKey(e.target.value)}
                            placeholder="Cole sua Binance API Key pública"
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">API Secret</label>
                          <input
                            type="password"
                            value={formApiSecret}
                            onChange={(e) => setFormApiSecret(e.target.value)}
                            placeholder="Cole sua Binance API Secret"
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
                          />
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        🔒 Conexão direta 100% em Nuvem sem precisar de robô aberto no PC.
                      </div>
                    </div>
                  )}

                  {/* Subcard de Ajuda / Conexão para cTrader */}
                  {formPlatform === 'ctrader' && (
                    <div className="p-3 bg-slate-900/90 border border-cyan-900/40 rounded-lg space-y-2">
                      <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                        <span>🌐</span> Credenciais cTrader Open API
                      </span>
                      <div className="space-y-2 text-xs">
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Access Token (Spotware)</label>
                          <input
                            type="text"
                            value={formApiKey}
                            onChange={(e) => setFormApiKey(e.target.value)}
                            placeholder="Access Token da Open API cTrader"
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Account ID cTrader</label>
                          <input
                            type="text"
                            value={formConnectionHost}
                            onChange={(e) => setFormConnectionHost(e.target.value)}
                            placeholder="Ex: 1234567"
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
                          />
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        🌐 Conexão nativa em nuvem via Spotware Open API.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Abas de Configuração da Conta */}
            <div className="flex border-b border-slate-800">
              <button
                type="button"
                onClick={() => setModalTab('mesa')}
                className={`flex-1 py-2 text-xs font-bold border-b-2 transition cursor-pointer ${
                  modalTab === 'mesa' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                🏆 1. Mesa / Desafio
              </button>
              <button
                type="button"
                onClick={() => setModalTab('manual')}
                className={`flex-1 py-2 text-xs font-bold border-b-2 transition cursor-pointer ${
                  modalTab === 'manual' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                🛡️ 2. Risco Operacional
              </button>
              <button
                type="button"
                onClick={() => setModalTab('mapping')}
                className={`flex-1 py-2 text-xs font-bold border-b-2 transition cursor-pointer ${
                  modalTab === 'mapping' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                🎯 3. Ativos & Mapeamento
              </button>
            </div>

            <div className="space-y-3 text-xs max-h-[60vh] overflow-y-auto pr-1">
              <div className="bg-slate-950/80 p-3 rounded-lg border border-blue-500/30 shadow-inner">
                <label className="block text-slate-300 font-bold mb-1">
                  🏷️ Nome Personalizado da Conta <span className="text-blue-400 font-black">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={formName}
                  onFocus={e => e.target.select()}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2.5 text-white font-bold text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition"
                  placeholder="Ex: Apex 50k, Topstep 150k, Mesa Demo #1..."
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Digite o nome desejado para identificar esta conta facilmente no painel e nos gráficos.
                </span>
              </div>

              {modalTab === 'mesa' ? (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-slate-400">Saldo Inicial (US$)</label>
                      {editingAccount && (editingAccount.platform === 'nt8' || editingAccount.send_localhost) ? (
                        <span className="text-[10px] text-amber-400 font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                          🔒 Gerenciado pelo NinjaTrader
                        </span>
                      ) : (formPlatform === 'mt4' || formPlatform === 'mt5' || editingAccount?.platform === 'mt4' || editingAccount?.platform === 'mt5') ? (
                        <span className="text-[10px] text-sky-400 font-semibold bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/30">
                          🔒 Sincronizado com a Corretora (MetaTrader)
                        </span>
                      ) : null}
                    </div>
                    <input
                      type="number"
                      value={formInitialBalance}
                      disabled={Boolean(
                        (editingAccount && (editingAccount.platform === 'nt8' || editingAccount.send_localhost)) ||
                        formPlatform === 'mt4' || formPlatform === 'mt5' || editingAccount?.platform === 'mt4' || editingAccount?.platform === 'mt5'
                      )}
                      onChange={e => setFormInitialBalance(Number(e.target.value))}
                      className={`w-full bg-slate-950 border border-slate-800 rounded p-2 text-white font-medium focus:outline-none focus:border-blue-500 ${
                        ((editingAccount && (editingAccount.platform === 'nt8' || editingAccount.send_localhost)) ||
                        formPlatform === 'mt4' || formPlatform === 'mt5' || editingAccount?.platform === 'mt4' || editingAccount?.platform === 'mt5') ? 'opacity-60 cursor-not-allowed' : ''
                      }`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Drawdown Diário da Mesa (US$)</label>
                      <input
                        type="number"
                        value={formDailyStop}
                        onChange={e => setFormDailyStop(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white font-medium focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Drawdown Máximo Total (US$)</label>
                      <input
                        type="number"
                        value={formMaxDd}
                        onChange={e => setFormMaxDd(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white font-medium focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Modalidade de Drawdown da Mesa</label>
                    <select
                      value={formDdMode}
                      onChange={e => setFormDdMode(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white font-medium focus:outline-none focus:border-blue-500"
                    >
                      <option value="intraday_trailing">Intraday Trailing (High-Watermark)</option>
                      <option value="eod">End-Of-Day (EOD)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Meta do Desafio (US$)</label>
                      <input
                        type="number"
                        value={formProfitTarget}
                        onChange={e => setFormProfitTarget(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white font-medium focus:outline-none focus:border-blue-500"
                        placeholder="Ex: 3000"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Regra de Consistência (%)</label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        max="100"
                        value={formConsistencyPct}
                        onChange={e => setFormConsistencyPct(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white font-medium focus:outline-none focus:border-blue-500"
                        placeholder="Ex: 40"
                      />
                    </div>
                  </div>

                  {!(formPlatform === 'nt8' || formSendLocalhost || editingAccount?.platform === 'nt8' || isNinjaExecutionAccount(editingAccount || { platform: formPlatform, account_name: formName, send_localhost: formSendLocalhost })) && (
                    <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded border border-red-900/40">
                      <div>
                        <div className="font-bold text-red-300">Simular Reprovação (Eliminação Definitiva)</div>
                        <div className="text-[10px] text-slate-400 leading-tight">
                          {editingAccount?.simulate_elimination
                            ? '🔒 Conta com eliminação ativa. Não pode ser desativada a não ser que resete a conta.'
                            : 'Se ativado, violar o DD ou a Consistência elimina permanentemente a conta (REPROVADA).'}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formSimulateElimination}
                        disabled={editingAccount?.simulate_elimination === true}
                        onChange={e => setFormSimulateElimination(e.target.checked)}
                        className="w-4 h-4 rounded text-red-600 focus:ring-0 cursor-pointer disabled:opacity-40"
                      />
                    </div>
                  )}

                  {isElectronApp() && (
                    <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded border border-emerald-900/40">
                      <div>
                        <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                          <span>🔌</span> Conector Local (MT4 / MT5 / NinjaTrader 8)
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Envia operações, níveis de SL/TP e encerramentos direto para a conexão local (MT4 porta 80, MT5 e NT8 / ConectorVM / VMBot).
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formSendLocalhost}
                        onChange={e => setFormSendLocalhost(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-500 focus:ring-0 cursor-pointer"
                      />
                    </div>
                  )}
                </>
              ) : modalTab === 'manual' ? (
                <>
                  <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded border border-blue-900/40">
                    <div>
                      <div className="font-bold text-blue-300">Permitir Operações Manuais (Boleta)</div>
                      <div className="text-[10px] text-slate-400">Ativa a execução de ordens manuais via Trade Boleta para esta conta.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formManualTradingEnabled}
                      onChange={e => setFormManualTradingEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Horário Início Manuais</label>
                      <input
                        type="text"
                        maxLength={8}
                        value={formManualStartTime}
                        onChange={e => setFormManualStartTime(sanitizeTimeMask(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white font-medium focus:outline-none focus:border-blue-500"
                        placeholder="00:00:00"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Horário Fim Manuais</label>
                      <input
                        type="text"
                        maxLength={8}
                        value={formManualEndTime}
                        onChange={e => setFormManualEndTime(sanitizeTimeMask(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white font-medium focus:outline-none focus:border-blue-500"
                        placeholder="23:59:59"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Lote Máx por Operação (Manual & Robôs)</label>
                      <input
                        type="number"
                        value={formManualMaxLots}
                        onChange={e => setFormManualMaxLots(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white font-medium focus:outline-none focus:border-blue-500"
                        placeholder="Ex: 10"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Limite Ordens Manuais/Dia</label>
                      <input
                        type="number"
                        value={formManualMaxDailyTrades}
                        onChange={e => setFormManualMaxDailyTrades(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white font-medium focus:outline-none focus:border-blue-500"
                        placeholder="0 = Sem Limite"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Stop Loss Pessoal Trader (US$)</label>
                      <input
                        type="number"
                        value={formTraderDailyStopLossUsd}
                        onChange={e => setFormTraderDailyStopLossUsd(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white font-medium focus:outline-none focus:border-blue-500"
                        placeholder="0 = Sem Limite"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Meta Lucro Pessoal Trader (US$)</label>
                      <input
                        type="number"
                        value={formTraderDailyTakeProfitUsd}
                        onChange={e => setFormTraderDailyTakeProfitUsd(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white font-medium focus:outline-none focus:border-blue-500"
                        placeholder="0 = Sem Limite"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded border border-slate-800">
                    <div>
                      <div className="font-semibold text-slate-200">Múltiplos Sinais (Ativos Diferentes)</div>
                      <div className="text-[10px] text-slate-500">Permite 1 posição por ativo simultaneamente.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formAllowMultiSignals}
                      onChange={e => setFormAllowMultiSignals(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3 bg-emerald-950/40 rounded-lg border border-emerald-500/30 space-y-1">
                    <div className="font-bold text-emerald-300 flex items-center gap-1.5 text-xs">
                      <span>🎯</span> Mapeamento de Ativos de Execução
                    </div>
                    <p className="text-[10.5px] text-slate-300 leading-relaxed">
                      Configure como os sinais gerados nos gráficos/painéis serão roteados para os ativos da sua corretora ou NinjaTrader nesta conta.
                    </p>
                  </div>

                  {/* Presets */}
                  <div className="space-y-2">
                    <label className="block text-slate-300 font-bold">Modo de Mapeamento</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFormMappingPreset('none');
                          setFormExecutionSymbol('');
                          setFormSymbolMapping('');
                        }}
                        className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                          formMappingPreset === 'none'
                            ? 'bg-blue-950/80 border-blue-500 text-blue-300 ring-1 ring-blue-500/40'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-bold text-xs">Padrão (Mesmo do Gráfico)</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Executa exatamente o ativo do painel (ex: NQ ➔ NQ)</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setFormMappingPreset('nq_mnq');
                          setFormExecutionSymbol('');
                          setFormSymbolMapping('NQ->MNQ, ES->MES, YM->MYM');
                        }}
                        className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                          formMappingPreset === 'nq_mnq'
                            ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/40'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-bold text-xs flex items-center gap-1">
                          <span>NQ ➔ MNQ (Cheio p/ Micro)</span>
                          <span className="text-[9px] px-1 bg-emerald-900 text-emerald-200 rounded font-bold">Auto</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Analisa no Cheio e executa no Micro (NQ➔MNQ, ES➔MES)</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setFormMappingPreset('fixed');
                          setFormSymbolMapping('');
                        }}
                        className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                          formMappingPreset === 'fixed'
                            ? 'bg-amber-950/80 border-amber-500 text-amber-300 ring-1 ring-amber-500/40'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-bold text-xs">Ativo Fixo de Execução</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Define um ticker específico fixo para todas as ordens desta conta</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setFormMappingPreset('custom');
                        }}
                        className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                          formMappingPreset === 'custom'
                            ? 'bg-purple-950/80 border-purple-500 text-purple-300 ring-1 ring-purple-500/40'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-bold text-xs">Mapeamento Customizado</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Digite regras personalizadas de conversão de/para</div>
                      </button>
                    </div>
                  </div>

                  {/* Campos Dinâmicos conforme Preset */}
                  {formMappingPreset === 'fixed' && (
                    <div className="p-3 bg-slate-950 rounded-lg border border-amber-500/40 space-y-2">
                      <label className="block text-slate-300 font-bold">
                        📌 Ticker Fixo de Execução
                      </label>
                      <input
                        type="text"
                        value={formExecutionSymbol}
                        onChange={e => setFormExecutionSymbol(e.target.value.toUpperCase())}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2.5 text-white font-bold text-sm focus:outline-none focus:border-amber-400"
                        placeholder="Ex: MNQ, MES, MNQ 03-25, BTCUSD..."
                      />
                      <span className="text-[10px] text-slate-400 block">
                        Qualquer ordem enviada nesta conta será direcionada para este ticker no NinjaTrader/Corretora.
                      </span>
                    </div>
                  )}

                  {(formMappingPreset === 'custom' || formMappingPreset === 'nq_mnq') && (
                    <div className="p-3 bg-slate-950 rounded-lg border border-purple-500/40 space-y-2">
                      <label className="block text-slate-300 font-bold">
                        ⚙️ Regras de Conversão (De ➔ Para)
                      </label>
                      <input
                        type="text"
                        value={formSymbolMapping}
                        onChange={e => setFormSymbolMapping(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2.5 text-white font-mono text-xs focus:outline-none focus:border-purple-400"
                        placeholder="Ex: NQ->MNQ, ES->MES, YM->MYM, WIN->WDO"
                      />
                      <span className="text-[10px] text-slate-400 block">
                        Separe as regras por vírgula. Exemplo: <code className="text-purple-300">NQ-&gt;MNQ, ES-&gt;MES</code>
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              {editingAccount && !(editingAccount.platform === 'nt8' || editingAccount.send_localhost) ? (
                <button
                  type="button"
                  onClick={() => {
                    const accToReset = editingAccount;
                    setIsCreateModalOpen(false);
                    setEditingAccount(null);
                    handleResetBalance(accToReset);
                  }}
                  className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  title="Resetar Saldo e Apagar Histórico de Operações desta Conta"
                >
                  🔄 Resetar Conta
                </button>
              ) : <div />}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setEditingAccount(null);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveAccount}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition"
                >
                  Salvar Conta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Vinculação de Robôs/Estratégias por Conta */}
      {selectedAccountForStrats && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl overflow-hidden p-4 sm:p-6 space-y-4 shadow-2xl my-3 sm:my-0">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>🤖 Robôs e Estratégias Vinculados</span>
                </h2>
                <p className="text-xs font-semibold text-blue-400">
                  Conta: {selectedAccountForStrats.account_name}
                </p>
              </div>
              <button
                onClick={() => setSelectedAccountForStrats(null)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {(() => {
              const activeSignalPrompts = prompts.filter(p => p.prompt_type === 'signal_generator');
              const linkedTriggerIds = new Set(activeSignalPrompts.map(p => p.trigger_strategy_id).filter(Boolean));

              // Algoritmos autônomos diretos (Alertas ou Abertura de Posição, que NÃO possuem um Prompt IA atrelado como gatilho)
              const allDirectStrategies = [
                ...(customStrategies || []),
                ...(publicStrategies || [])
              ];
              const uniqueDirectMap = new Map<string, any>();
              allDirectStrategies.forEach(s => {
                if (s && s.id && !uniqueDirectMap.has(s.id)) uniqueDirectMap.set(s.id, s);
              });
              const activeAlgos = Array.from(uniqueDirectMap.values()).filter(strat =>
                Boolean(strat.active) && !linkedTriggerIds.has(strat.id)
              );

              // Rotas (vínculos) existentes nesta conta
              const currentAccountRoutes = accountStrategies.filter(s => s.account_id === selectedAccountForStrats.id);

              // Opções disponíveis que ainda NÃO foram vinculadas
              const availableAlgoOptions = activeAlgos.filter(
                strat => !currentAccountRoutes.some(r => r.manual_strategy_id === strat.id)
              );
              const availablePromptOptions = activeSignalPrompts.filter(
                p => !currentAccountRoutes.some(r => r.prompt_id === p.id)
              );

              const handleAddSelectedOption = async () => {
                if (!selectedOptionToLink) return;
                if (selectedOptionToLink.startsWith('strat_')) {
                  const stratId = selectedOptionToLink.replace('strat_', '');
                  await handleToggleStrategyForAccount({ strategyId: stratId });
                } else if (selectedOptionToLink.startsWith('prompt_')) {
                  const promptId = selectedOptionToLink.replace('prompt_', '');
                  await handleToggleStrategyForAccount({ promptId: promptId });
                }
                setSelectedOptionToLink('');
              };

              return (
                <div className="space-y-4">
                  {/* 1. SEÇÃO DE ADICIONAR NOVO ROBÔ (SELETOR + BOTÃO INCLUIR) */}
                  <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 space-y-3">
                    <label className="text-xs font-bold text-slate-300 block">
                      ➕ Incluir Novo Robô ou Indicador Alerta na Conta
                    </label>

                    <div className="flex items-center gap-2">
                      <select
                        value={selectedOptionToLink}
                        onChange={(e) => setSelectedOptionToLink(e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-emerald-500 font-mono"
                      >
                        <option value="">Selecione um robô ou prompt para vincular...</option>
                        {availableAlgoOptions.length > 0 && (
                          <optgroup label="🤖 Robôs e Algoritmos Dinâmicos">
                            {availableAlgoOptions.map(strat => (
                              <option key={`opt_strat_${strat.id}`} value={`strat_${strat.id}`}>
                                {strat.name} ({strat.action === 'position' ? 'Estratégia' : 'Alerta'} • {strat.timeframe || 1}m)
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {availablePromptOptions.length > 0 && (
                          <optgroup label="🧠 Prompts de Sinais com IA">
                            {availablePromptOptions.map(p => (
                              <option key={`opt_prompt_${p.id}`} value={`prompt_${p.id}`}>
                                {p.name} (IA Sinais)
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>

                      <button
                        onClick={handleAddSelectedOption}
                        disabled={!selectedOptionToLink}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg transition shrink-0"
                      >
                        Incluir Robô
                      </button>
                    </div>
                  </div>

                  {/* 2. TABELA / LISTA DE ROBÔS VINCULADOS A ESTA CONTA */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-semibold">
                      <span>Robôs Vinculados a esta Conta ({currentAccountRoutes.length})</span>
                      <span className="text-[10px] text-slate-500">Pausar ou ativar execuções por robô individual</span>
                    </div>

                    <div className="space-y-2">
                      {currentAccountRoutes.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 bg-slate-950/40 rounded-lg border border-slate-800/80 space-y-1">
                          <div className="text-xl">🤖💤</div>
                          <p className="text-xs font-semibold text-slate-300">Nenhum robô vinculado a esta conta.</p>
                          <p className="text-[10px] text-slate-500">
                            Escolha uma opção no campo acima e clique em <strong>Incluir Robô</strong>.
                          </p>
                        </div>
                      ) : (
                        currentAccountRoutes.map(route => {
                          const isAlgo = !route.manual_strategy_id ? false : true;
                          const algoObj = isAlgo ? (customStrategies.find(s => s.id === route.manual_strategy_id) || publicStrategies.find(s => s.id === route.manual_strategy_id)) : null;
                          const promptObj = !isAlgo ? prompts.find(p => p.id === route.prompt_id) : null;

                          const itemTitle = algoObj?.name || promptObj?.name || 'Robô Vinculado';
                          const targetPanelId = algoObj?.panel_id || promptObj?.panel_id;
                          const targetPanelObj = panels.find(panel => panel.id === targetPanelId);
                          const panelBadgeName = targetPanelObj ? targetPanelObj.name : (activePanel?.name || 'Ativo');

                          return (
                            <div
                              key={`route_${route.id}`}
                              className={`flex items-center justify-between p-3 rounded-lg border transition ${
                                isAlgo ? 'bg-purple-950/50 border-purple-500/50' : 'bg-blue-950/50 border-blue-500/50'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-bold text-slate-100 truncate">{itemTitle}</span>
                                    {isAlgo ? (
                                      algoObj?.action === 'alert' ? (
                                        <span className="px-1.5 py-0.5 text-[8.5px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded shrink-0">
                                          🔔 INDICADOR
                                        </span>
                                      ) : (
                                        <span className="px-1.5 py-0.5 text-[8.5px] font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded shrink-0">
                                          📈 ESTRATÉGIA
                                        </span>
                                      )
                                    ) : (
                                      <span className="px-1.5 py-0.5 text-[8.5px] font-black uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded shrink-0">
                                        🧠 IA PROMPT
                                      </span>
                                    )}
                                    <span className="px-1.5 py-0.5 text-[8.5px] font-black uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded shrink-0">
                                      🎯 {panelBadgeName}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 shrink-0 ml-2">
                                <div className="flex items-center gap-1 text-xs">
                                  <span className="text-slate-400 text-[10px]">Lote:</span>
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0.1"
                                    value={route.contract_size_multiplier || 1.0}
                                    onChange={e =>
                                      handleChangeStrategyMultiplier(
                                        route.id,
                                        selectedAccountForStrats.id,
                                        isAlgo ? { strategyId: route.manual_strategy_id! } : { promptId: route.prompt_id! },
                                        Number(e.target.value)
                                      )
                                    }
                                    className="w-14 bg-slate-900 border border-slate-700 rounded p-1 text-center font-bold text-white text-xs"
                                  />
                                  <span className="text-slate-500 text-[10px]">x</span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleToggleStrategyForAccount(
                                      isAlgo ? { strategyId: route.manual_strategy_id! } : { promptId: route.prompt_id! },
                                      route
                                    )
                                  }
                                  className="p-1.5 px-2 bg-red-950/60 hover:bg-red-900/80 text-red-300 hover:text-white border border-red-800/60 rounded text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                                  title="Remover vínculo deste robô com a conta"
                                >
                                  🗑️ Desvincular
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end pt-3 border-t border-slate-800">
                    <button
                      onClick={() => setSelectedAccountForStrats(null)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition cursor-pointer"
                    >
                      Concluído
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal de Copy Remoto (Seguir Contas ou Robôs Externos) */}
      {selectedAccountForRemoteCopy && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 space-y-4 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto custom-scrollbar">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">📡</span>
                  <h2 className="text-lg font-bold text-white">
                    Copy Remoto: <span className="text-cyan-400">{selectedAccountForRemoteCopy.account_name}</span>
                  </h2>
                  {getPlatformBadge(selectedAccountForRemoteCopy.platform)}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Receba e replique automaticamente operações de contas Master ou Estratégias externas.
                </p>
              </div>
              <button
                onClick={() => setSelectedAccountForRemoteCopy(null)}
                className="text-slate-400 hover:text-white text-lg p-1 cursor-pointer transition"
              >
                ✕
              </button>
            </div>

            {/* Banner Informativo e ID da Conta Atual */}
            <div className="bg-cyan-950/30 border border-cyan-800/40 rounded-lg p-3 text-xs space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 font-mono text-cyan-200">
                  <span className="text-slate-400 font-bold">🔑 ID Desta Conta:</span>
                  <span className="font-bold select-all bg-slate-950 px-2 py-0.5 rounded border border-cyan-800/50 text-[11px]">
                    {selectedAccountForRemoteCopy.id}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedAccountForRemoteCopy.id);
                    setCopiedIdMsg(true);
                    setTimeout(() => setCopiedIdMsg(false), 2500);
                  }}
                  className="px-2.5 py-1 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-500/40 rounded text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
                >
                  {copiedIdMsg ? '✔ Copiado!' : '📋 Copiar ID da Conta'}
                </button>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                💡 <strong>Como funciona:</strong> Insira o <strong>ID da Conta Master</strong> ou <strong>ID da Estratégia</strong> fornecido por outro usuário. O Axion monitorará as ordens em nuvem e executará nesta conta ({selectedAccountForRemoteCopy.account_name}) com SL/TP calculados em pontos e respeito integral à gestão de risco da mesa.
              </p>
            </div>

            {/* Formulário: Adicionar Nova Inscrição Remota */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3 text-xs">
              <div className="font-bold text-slate-200 flex items-center gap-1.5">
                <span>➕</span> Adicionar Inscrição Remota
              </div>
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    ID Remoto da Conta Master ou Estratégia <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={remoteSourceIdInput}
                    onChange={e => setRemoteSourceIdInput(e.target.value)}
                    placeholder="Ex: 4a2b9c71-88f2-4e01-a1b2-c3d4e5f6a7b8"
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Apelido / Descrição (Opcional)
                    </label>
                    <input
                      type="text"
                      value={remoteLabelInput}
                      onChange={e => setRemoteLabelInput(e.target.value)}
                      placeholder="Ex: Sala Trader X / Robô Delta"
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white text-xs focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Multiplicador de Lote
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={remoteMultiplierInput}
                      onChange={e => setRemoteMultiplierInput(Number(e.target.value))}
                      placeholder="1.0"
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddRemoteCopySubscription}
                disabled={!remoteSourceIdInput.trim()}
                className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>➕</span> Inscrever Conta neste ID Remoto
              </button>
            </div>

            {/* Lista de Inscrições Remotas Ativas */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>Inscrições Configuradas nesta Conta:</span>
                <span className="text-slate-500 font-normal text-[11px]">
                  {remoteCopyConfigs.filter(c => c.account_id === selectedAccountForRemoteCopy.id).length} cadastrada(s)
                </span>
              </div>

              {remoteCopyConfigs.filter(c => c.account_id === selectedAccountForRemoteCopy.id).length === 0 ? (
                <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800/80 text-center text-slate-500 text-xs">
                  Nenhuma inscrição remota cadastrada para esta conta ainda.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                  {remoteCopyConfigs
                    .filter(c => c.account_id === selectedAccountForRemoteCopy.id)
                    .map(sub => (
                      <div
                        key={sub.id}
                        className={`flex items-center justify-between p-3 rounded-lg border transition ${
                          sub.is_active
                            ? 'bg-slate-950 border-cyan-800/50'
                            : 'bg-slate-950/50 border-slate-800 opacity-60'
                        }`}
                      >
                        <div className="space-y-1 min-w-0 flex-1 mr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-200 text-xs truncate">
                              {sub.label || 'Master Remoto'}
                            </span>
                            <span className="px-1.5 py-0.2 bg-cyan-950 text-cyan-300 border border-cyan-800/60 rounded text-[9px] font-mono shrink-0">
                              {sub.lot_multiplier}x Lotes
                            </span>
                            {sub.is_active ? (
                              <span className="px-1.5 py-0.2 bg-emerald-950 text-emerald-300 border border-emerald-800/60 rounded text-[9px] font-bold">
                                ATIVO
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded text-[9px] font-bold">
                                PAUSADO
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                            <span className="text-slate-500">Origem:</span>
                            <span className="truncate max-w-[220px] text-slate-300" title={sub.remote_source_id}>
                              {sub.remote_source_id}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleRemoteCopySubscription(sub)}
                            className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer border ${
                              sub.is_active
                                ? 'bg-amber-950/40 text-amber-300 border-amber-800/50 hover:bg-amber-900/50'
                                : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50 hover:bg-emerald-900/50'
                            }`}
                            title={sub.is_active ? 'Pausar recepção de cópia' : 'Ativar recepção de cópia'}
                          >
                            {sub.is_active ? '⏸ Pausar' : '▶ Ativar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRemoteCopySubscription(sub.id)}
                            className="p-1 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded transition cursor-pointer"
                            title="Remover Inscrição"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Rodapé */}
            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedAccountForRemoteCopy(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-bold transition cursor-pointer"
              >
                Concluído
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pop-up: Bloqueio de Desativação com Operações em Andamento */}
      {accountToDeactivateWithOps && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-500/50 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3 text-red-400">
              <div className="text-2xl">⚠️</div>
              <h3 className="text-base font-bold text-white">
                Operações em Andamento na Conta
              </h3>
            </div>

            <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-lg text-xs space-y-2">
              <p className="font-bold text-red-200">
                A conta "{accountToDeactivateWithOps.account.account_name}" possui {accountToDeactivateWithOps.ops.length} operação(ões) "Em Andamento"!
              </p>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Por gestão de risco, uma conta <strong>não pode ser desativada</strong> enquanto possuir posições abertas no mercado.
              </p>
            </div>

            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
              <span className="text-[11px] font-bold text-slate-400 block">Posições Abertas Encontradas:</span>
              {accountToDeactivateWithOps.ops.map(op => (
                <div key={op.id} className="flex justify-between items-center p-2.5 bg-slate-950 rounded border border-slate-800 text-[11px]">
                  <div>
                    <span className="font-bold text-slate-100">{op.strategy_name}</span>
                    <span className={`ml-1.5 font-black px-1.5 py-0.2 rounded text-[9px] ${
                      op.side === 'COMPRA' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                    }`}>
                      {op.side}
                    </span>
                  </div>
                  <span className="text-slate-400 font-mono">Preço: {op.entry_price}</span>
                </div>
              ))}
            </div>

            <p className="text-xs font-semibold text-amber-300 text-center pt-1">
              Deseja encerrar todas as posições abertas desta conta e desativá-la agora?
            </p>

            <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleCloseOpsAndDeactivateAccount}
                className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded transition flex items-center justify-center gap-1 cursor-pointer shadow-md"
              >
                🛑 SIM, ENCERRAR POSIÇÕES E DESATIVAR CONTA
              </button>

              <button
                type="button"
                onClick={() => setAccountToDeactivateWithOps(null)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded transition cursor-pointer"
              >
                CANCELAR (Manter Posições e Conta Ativa)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Sincronização do NinjaTrader 8 */}
      <NinjaSyncModal
        isOpen={isNinjaSyncOpen}
        onClose={() => setIsNinjaSyncOpen(false)}
        accounts={accounts}
        maxAccountsAllowed={isSystemAdmin ? 999 : maxSyncAccounts}
        canAccessCopyTrading={canAccessCopyTrading}
        onAccountsUpdated={refreshAccounts}
        addLog={addLog}
      />
    </div>
  );
};
