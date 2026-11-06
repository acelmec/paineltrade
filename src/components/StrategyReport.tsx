import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import type { StrategyReport } from '../services/db';
import {
  updateAccountSupabase,
  isSameAsset,
  getLocalStrategyReports,
  saveLocalStrategyReports,
  sanitizeReportDbPayload
} from '../services/db';
import { supabase } from '../supabaseClient';
import { checkNinjaStatus, fetchNinjaAccountPerformance } from '../services/ninjaGateway';
import {
  getSaoPauloDate,
  getTradingSessionDate,
  formatSaoPauloDate,
  formatSaoPauloTime,
  formatReportExitTime
} from '../utils/date';

export const StrategyReportComponent: React.FC = () => {
  const {
    reports,
    isLoadingReports,
    activePanel,
    updateReportAction,
    fetchReportsList,
    panels,
    settings,
    accounts,
    user,
    ninjaGatewayOnline,
    addLog
  } = useApp();

  // Estados dos Filtros Globais no Topo
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [filterStrategy, setFilterStrategy] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSide, setFilterSide] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAsset, setFilterAsset] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Estados de Sincronização NinjaTrader
  const [isSyncingNinja, setIsSyncingNinja] = useState<boolean>(false);
  const isSyncingRef = useRef<boolean>(false);
  const [ninjaStatus, setNinjaStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [ninjaFeedback, setNinjaFeedback] = useState<string | null>(null);

  // Estados para Sincronização Inteligente e Filtro por Período
  const [showSyncPeriodBar, setShowSyncPeriodBar] = useState<boolean>(false);
  const [syncPeriodAccount, setSyncPeriodAccount] = useState<string>('all');
  const [syncPeriodStartDate, setSyncPeriodStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [syncPeriodEndDate, setSyncPeriodEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Checa status do NinjaTrader ao abrir a tela
  useEffect(() => {
    checkNinjaStatus().then(st => {
      setNinjaStatus(st.status === 'online' ? 'online' : 'offline');
    }).catch(() => setNinjaStatus('offline'));
  }, []);

  // Estado da Paginação
  const [currentPage, setCurrentPage] = useState<number>(1);

  // IDs das contas do usuário logado
  const userAccountIds = useMemo(() => new Set(accounts.map(a => a.id)), [accounts]);

  // Resetar página quando filtros mudarem
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filterAccount, filterStrategy, filterCategory, filterSide, filterStatus, filterAsset, startDate, endDate]);

  // Estado de Agrupamento do Gráfico Unificado
  const [chartGroupFilter, setChartGroupFilter] = useState<'monthly' | 'daily' | 'weekday' | 'hourly' | 'halfhourly'>('daily');

  // Estados da Visão de Desempenho (Histograma vs Calendário)
  const [performanceView, setPerformanceView] = useState<'histogram' | 'calendar'>('histogram');
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => getSaoPauloDate());

  // Helper para normalizar timestamps do NinjaTrader que vieram com 'Z' indevido
  const getCleanReportDate = (dateStr: string | null | undefined, isSync = false) => {
    if (!dateStr) return dateStr;
    if (isSync && typeof dateStr === 'string' && dateStr.endsWith('Z')) {
      return dateStr.slice(0, -1) + '-03:00';
    }
    return dateStr;
  };

  // Estados do Simulador
  const [simMultiplier, setSimMultiplier] = useState<number>(1.0);

  // Sincronizar multiplicador de pontos com o painel ativo
  React.useEffect(() => {
    if (activePanel) {
      setSimMultiplier(activePanel.point_value !== undefined && activePanel.point_value !== null ? Number(activePanel.point_value) : 1.0);
    }
  }, [activePanel]);

  // Lista de Estratégias Únicas presentes nos Relatórios pertencentes ao usuário
  const uniqueStrategies = useMemo(() => {
    const list = new Set<string>();
    reports.forEach(r => {
      const belongsToUser = userAccountIds.size > 0 
        ? (r.account_id ? userAccountIds.has(r.account_id) : (!r.user_id || r.user_id === user?.id))
        : (!r.user_id || r.user_id === user?.id);
      if (belongsToUser && r.strategy_name) {
        list.add(r.strategy_name);
      }
    });
    return Array.from(list);
  }, [reports, userAccountIds, user?.id]);

  // Lista unificada de ativos para o filtro: Painéis (Demo) e Ativos Reais (NinjaTrader)
  const uniqueAssets = useMemo(() => {
    const assetMap = new Map<string, { label: string; type: 'panel' | 'nt8' }>();

    // 1. Ativos dos Painéis (Demo Axion)
    panels.forEach(p => {
      assetMap.set(p.name, { label: `🎯 ${p.name}`, type: 'panel' });
    });

    // 2. Ativos reais presentes nas operações registradas (NinjaTrader / Sincronizados)
    reports.forEach(r => {
      let sym = r.symbol;
      if (!sym && r.description) {
        const match = r.description.match(/\[(.*?)\]/);
        if (match && match[1]) sym = match[1];
      }
      if (sym && sym.trim().length > 0) {
        const trimmed = sym.trim();
        const isPanel = panels.some(p => p.name.toLowerCase() === trimmed.toLowerCase());
        if (!isPanel && !assetMap.has(trimmed)) {
          assetMap.set(trimmed, { label: `🏦 ${trimmed}`, type: 'nt8' });
        }
      }
    });

    return Array.from(assetMap.entries()).map(([value, info]) => ({
      value,
      label: info.label,
      type: info.type
    }));
  }, [panels, reports]);

  // Função utilitária para calcular pontos de um trade concluído
  const calculatePoints = (r: StrategyReport): number => {
    if (r.status === 'Em Andamento' || r.exit_price === null || r.exit_price === undefined) return 0;
    const entry = Number(r.entry_price);
    const exit = Number(r.exit_price);
    if (r.side === 'COMPRA') {
      return exit - entry;
    } else {
      return entry - exit;
    }
  };

  // Função utilitária para identificar se o trade simula finalizado
  const isClosedReport = (r: StrategyReport): boolean => {
    if (r.status === 'Em Andamento') return false;
    if (r.status === 'Cancelado') {
      return r.exit_price !== null && r.exit_price !== undefined;
    }
    return true;
  };

  // Lista de Performance de Contas NinjaTrader
  const [ninjaAccountsPerf, setNinjaAccountsPerf] = useState<any[]>([]);

  // Obter o valor do ponto correspondente ao ativo da operação baseado estritamente no painel correspondente (Demo Axion)
  const getPointValueForReport = (r: StrategyReport): number => {
    // 1. Tentar encontrar o painel correspondente pelo ID ou instance_id
    let matchedPanel = panels.find(p => p.id === r.panel_id || (r.instance_id && p.instance_id === r.instance_id));

    // 2. Se não encontrou pelo ID, tentar pelo símbolo
    if (!matchedPanel && r.symbol) {
      const cleanSym = r.symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
      matchedPanel = panels.find(p =>
        p.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanSym ||
        p.instance_id.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanSym ||
        (p.symbol && p.symbol.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanSym) ||
        isSameAsset(p.name, r.symbol) ||
        isSameAsset(p.symbol, r.symbol)
      );
    }

    // 3. Tentar extrair o nome do painel entre colchetes na descrição, ex: [S&P500], [NQ], [Nasdaq], [Gold], [GC]
    if (!matchedPanel && r.description) {
      const match = r.description.match(/\[(.*?)\]/);
      if (match && match[1]) {
        const cleanDesc = match[1].toLowerCase().replace(/[^a-z0-9]/g, '');
        matchedPanel = panels.find(p =>
          p.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanDesc ||
          p.instance_id.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanDesc ||
          isSameAsset(p.name, match[1]) ||
          isSameAsset(p.symbol, match[1])
        );
      }
    }

    // Se encontramos o painel e ele possui point_value definido, usa ESTRITAMENTE o valor cadastrado no painel
    if (matchedPanel && matchedPanel.point_value !== undefined && matchedPanel.point_value !== null) {
      const pVal = Number(matchedPanel.point_value);
      if (!isNaN(pVal) && pVal > 0) {
        return pVal;
      }
    }

    // Fallback: se houver painel ativo com point_value
    if (activePanel && activePanel.point_value !== undefined && activePanel.point_value !== null) {
      const actVal = Number(activePanel.point_value);
      if (!isNaN(actVal) && actVal > 0) return actVal;
    }

    return simMultiplier || 1.0;
  };

  // Higieniza o PnL sincronizado do NinjaTrader caso tenha sofrido distorção de reconciliação cruzada entre dias (ex: zeragem pelo RealizedPnL $0.00 do dia seguinte)
  const sanitizeNinjaTradePnl = (
    symbol: string | null | undefined,
    description: string | null | undefined,
    pts: number,
    contracts: number,
    rawPnl: number
  ): { pnl: number; wasCorrupted: boolean } => {
    let rawSym = (symbol || '').trim().toUpperCase();
    if (!rawSym && description) {
      const m = description.match(/\[([A-Z0-9]+)/i);
      if (m && m[1]) rawSym = m[1].toUpperCase();
    }
    const baseSym = rawSym.split(/\s+/)[0].replace(/[0-9]/g, '') || rawSym;

    let ptVal = 0;
    let stdCommPerLot = 1.90;
    if (baseSym.startsWith('MNQ')) { ptVal = 2.0; stdCommPerLot = 1.90; }
    else if (baseSym.startsWith('NQ')) { ptVal = 20.0; stdCommPerLot = 4.00; }
    else if (baseSym.startsWith('MES')) { ptVal = 5.0; stdCommPerLot = 1.90; }
    else if (baseSym.startsWith('ES')) { ptVal = 50.0; stdCommPerLot = 4.00; }
    else if (baseSym.startsWith('MGC')) { ptVal = 10.0; stdCommPerLot = 2.40; }
    else if (baseSym.startsWith('GC')) { ptVal = 100.0; stdCommPerLot = 4.00; }
    else if (baseSym.startsWith('MYM')) { ptVal = 0.5; stdCommPerLot = 1.90; }
    else if (baseSym.startsWith('YM')) { ptVal = 5.0; stdCommPerLot = 4.00; }
    else if (baseSym.startsWith('MCL')) { ptVal = 100.0; stdCommPerLot = 2.40; }
    else if (baseSym.startsWith('CL')) { ptVal = 1000.0; stdCommPerLot = 4.00; }

    if (ptVal <= 0 || isNaN(pts) || isNaN(rawPnl)) {
      return { pnl: rawPnl, wasCorrupted: false };
    }

    const qty = Math.max(1, Number(contracts) || 1);
    const grossUsd = pts * qty * ptVal;
    const expectedNetUsd = Number((grossUsd - (stdCommPerLot * qty)).toFixed(2));
    const impliedCommTotal = grossUsd - rawPnl;

    // A comissão real de futuros por contrato round-turn varia entre $0 e ~$6.50.
    // Se a diferença implícita exceder $6.50 por contrato (ou for negativa), o PnL sofreu abatimento cruzado indevido.
    if (impliedCommTotal > qty * 6.5 || impliedCommTotal < -0.5) {
      return { pnl: expectedNetUsd, wasCorrupted: true };
    }

    return { pnl: rawPnl, wasCorrupted: false };
  };

  // Extrai o resultado consolidado (Pontos e USD) respeitando estritamente se a conta é sincronizada
  const getReportResult = (r: StrategyReport): {
    pts: number;
    usdVal: number;
    isGain: boolean;
    isStop: boolean;
    isSynchronized: boolean;
  } => {
    const acc = accounts.find(a => 
      a.id === r.account_id || 
      (r.account_name && a.account_name.trim().toLowerCase() === r.account_name.trim().toLowerCase())
    );
    const isSyncAcc = Boolean(
      acc?.platform === 'nt8' ||
      acc?.send_localhost === true ||
      r.strategy_name === 'Execução NT8' ||
      (r.description && (r.description.includes('NinjaTrader') || r.description.includes('[PNL:')))
    );

    // 1. Tenta extrair o resultado em USD vindo da sincronização (campo direto ou tag [PNL:...])
    let syncedPnl: number | null = null;
    if ((r as any).realized_pnl !== undefined && (r as any).realized_pnl !== null) {
      syncedPnl = Number((r as any).realized_pnl);
    } else if (r.description) {
      const matchPnl = r.description.match(/\[PNL:\s*([+-]?\d+(?:\.\d+)?)\]/i);
      if (matchPnl && matchPnl[1]) {
        const val = parseFloat(matchPnl[1]);
        if (!isNaN(val)) syncedPnl = val;
      }
    }

    // 2. Tenta extrair os pontos reais vindos da sincronização (campo direto ou tag [PTS:...])
    let syncedPts: number | null = null;
    if ((r as any).profit_points !== undefined && (r as any).profit_points !== null) {
      syncedPts = Number((r as any).profit_points);
    } else if (r.description) {
      const matchPts = r.description.match(/\[PTS:\s*([+-]?\d+(?:\.\d+)?)\]/i);
      if (matchPts && matchPts[1]) {
        const val = parseFloat(matchPts[1]);
        if (!isNaN(val)) syncedPts = val;
      }
    }

    const calculatedPts = calculatePoints(r);
    const finalPts = syncedPts !== null ? syncedPts : calculatedPts;
    const reportContracts = r.contrato !== undefined && r.contrato !== null ? Number(r.contrato) : 1;

    // SE HOUVER RESULTADO REALIZADO DE SINCRONIZAÇÃO (realized_pnl ou [PNL:...]):
    if (syncedPnl !== null) {
      const { pnl: cleanPnl } = sanitizeNinjaTradePnl(r.symbol, r.description, finalPts, reportContracts, syncedPnl);
      const isGain = cleanPnl > 0 || (cleanPnl === 0 && r.status === 'Gain');
      const isStop = cleanPnl < 0 || (cleanPnl === 0 && r.status === 'Stop');
      return {
        pts: finalPts,
        usdVal: cleanPnl,
        isGain,
        isStop,
        isSynchronized: true
      };
    }

    // DEMAIS CONTAS / CASOS SEM PNL GRAVADO (cálculo conforme o ativo do painel/símbolo):
    const mult = getPointValueForReport(r);
    const calculatedUsd = finalPts * reportContracts * mult;

    const isGain = r.status === 'Gain' || (r.status === 'Stop' && finalPts > 0) || calculatedUsd > 0;
    const isStop = (r.status === 'Stop' && finalPts <= 0) || calculatedUsd < 0;

    return {
      pts: finalPts,
      usdVal: calculatedUsd,
      isGain,
      isStop,
      isSynchronized: isSyncAcc
    };
  };

  // Filtrar os relatórios com base nos filtros globais com deduplicação defensiva
  const filteredReports = useMemo(() => {
    const seenExecutionKeys = new Set<string>();

    return reports.filter(r => {
      const belongsToUser = userAccountIds.size > 0 
        ? (r.account_id ? userAccountIds.has(r.account_id) : (!r.user_id || r.user_id === user?.id))
        : (!r.user_id || r.user_id === user?.id);

      if (!belongsToUser) return false;

      // Deduplicação defensiva para evitar exibir registros clonados (usando ID único ou chave temporal completa)
      const dedupKey = r.id || `${r.account_id || ''}_${r.created_at || ''}_${r.closed_at || ''}_${r.entry_price || ''}_${r.side || ''}_${r.symbol || ''}`;

      if (seenExecutionKeys.has(dedupKey)) {
        return false;
      }
      seenExecutionKeys.add(dedupKey);

      const matchAccount = filterAccount === 'all' || r.account_id === filterAccount;
      const matchStrategy = filterStrategy === 'all' || r.strategy_name === filterStrategy;
      const matchSide = filterSide === 'all' || r.side === filterSide;
      let matchStatus = filterStatus === 'all' || r.status === filterStatus;
      if (filterStatus === 'Gain') {
        const res = getReportResult(r);
        matchStatus = res.isGain;
      } else if (filterStatus === 'Stop') {
        const res = getReportResult(r);
        matchStatus = res.isStop;
      }
      
      let matchCategory = true;
      if (filterCategory !== 'all') {
        const isManual = r.strategy_name === 'Entrada Manual' || (r.strategy_id && r.strategy_id.startsWith('man-')) || (settings?.manual_strategy_id && r.strategy_id === settings.manual_strategy_id);
        const isRobot = (r.description || '').includes('[ALGORITMO]') || (r.description || '').includes('[ROBÔ]') || (r.strategy_name || '').toLowerCase().includes('robô') || (r.strategy_name || '').toLowerCase().includes('algoritmo');
        const isAi = !isManual && !isRobot;

        if (filterCategory === 'manual') matchCategory = isManual;
        else if (filterCategory === 'robot') matchCategory = isRobot;
        else if (filterCategory === 'ai') matchCategory = isAi;
      }

      let matchAsset = true;
      if (filterAsset !== 'all') {
        const cleanFilter = filterAsset.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanSymbol = (r.symbol || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanDesc = (r.description || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        // Suporta tanto o nome completo do ativo com vencimento quanto o radical (ex: 'NQ' bate com 'NQ 03-26')
        matchAsset = cleanSymbol.includes(cleanFilter) ||
          cleanFilter.includes(cleanSymbol) ||
          cleanDesc.includes(cleanFilter) || 
          isSameAsset(r.symbol, filterAsset) ||
          (cleanFilter === 'nq' && (cleanDesc.includes('nq') || cleanDesc.includes('nasdaq') || cleanSymbol.includes('nq'))) ||
          (cleanFilter === 'es' && (cleanDesc.includes('es') || cleanDesc.includes('sp500') || cleanDesc.includes('s&p500') || cleanSymbol.includes('es'))) ||
          (cleanFilter === 'mnq' && (cleanDesc.includes('mnq') || cleanSymbol.includes('mnq'))) ||
          (cleanFilter === 'mes' && (cleanDesc.includes('mes') || cleanSymbol.includes('mes'))) ||
          (cleanFilter === 'btcusd' && (cleanDesc.includes('btcusd') || cleanSymbol.includes('btcusd'))) ||
          (cleanFilter === 'cl' && (cleanDesc.includes('cl') || cleanDesc.includes('petroleo'))) ||
          (cleanFilter === 'gc' && (cleanDesc.includes('gc') || cleanDesc.includes('ouro')));
      }

      let matchDate = true;
      const systemSessionStart = settings?.global_cycle_start || '20:00:00';
      const cleanCreated = getCleanReportDate(r.created_at, Boolean(r.description?.includes('NinjaTrader') || r.strategy_name === 'Execução NT8'));
      const tradeDate = getTradingSessionDate(cleanCreated, systemSessionStart);
      if (startDate) {
        const [year, month, day] = startDate.split('-').map(Number);
        const start = new Date(year, month - 1, day, 0, 0, 0, 0);
        matchDate = matchDate && tradeDate >= start;
      }
      if (endDate) {
        const [year, month, day] = endDate.split('-').map(Number);
        const end = new Date(year, month - 1, day, 23, 59, 59, 999);
        matchDate = matchDate && tradeDate <= end;
      }
      
      return matchAccount && matchStrategy && matchCategory && matchSide && matchStatus && matchAsset && matchDate;
    });
  }, [reports, filterAccount, filterStrategy, filterCategory, filterSide, filterStatus, filterAsset, startDate, endDate, settings, userAccountIds, user?.id]);

  // Sincronizar Histórico e Execuções Reais do NinjaTrader 8
  interface SyncNinjaOptions {
    silent?: boolean;
    mode?: 'day' | 'history';
    accountName?: string;
    startDate?: string;
    endDate?: string;
    isIncrementalAutoSync?: boolean;
    forceHistory?: boolean;
  }

  const handleSyncNinjaTrader = async (
    options: boolean | SyncNinjaOptions = false,
    legacyForceHistory = false
  ) => {
    if (isSyncingRef.current) {
      return;
    }
    isSyncingRef.current = true;

    let silent = false;
    let mode: 'day' | 'history' = 'day';
    let accountName: string | undefined = undefined;
    let startDateParam: string | undefined = undefined;
    let endDateParam: string | undefined = undefined;
    let isIncrementalAutoSync = false;

    if (typeof options === 'boolean') {
      silent = options;
      mode = legacyForceHistory ? 'history' : 'day';
    } else if (typeof options === 'object' && options !== null) {
      silent = !!options.silent;
      mode = options.mode || (options.startDate || options.forceHistory ? 'history' : 'day');
      accountName = options.accountName;
      startDateParam = options.startDate;
      endDateParam = options.endDate;
      isIncrementalAutoSync = !!options.isIncrementalAutoSync;
    }

    if (!silent) {
      setIsSyncingNinja(true);
      setNinjaFeedback(null);
    }
    try {
      const status = await checkNinjaStatus();
      if (status.status !== 'online') {
        setNinjaStatus('offline');
        if (!silent) {
          setNinjaFeedback('⚠️ NinjaTrader offline ou Add-On não ativo na porta 8001.');
          if (addLog) addLog('NINJA', 'Tentativa de sincronizar falhou: NinjaTrader offline.', 'alerta');
        }
        return;
      }
      setNinjaStatus('online');

      // Auto-sincronização inteligente (Delta Sync):
      // Se já temos trades anteriores gravados de contas NT8,
      // busca apenas a partir da data do trade mais recente até hoje.
      let sinceParam: string | undefined = undefined;
      if (isIncrementalAutoSync) {
        let latestTime: Date | null = null;
        if (reports && reports.length > 0) {
          for (const r of reports) {
            const isNt8 = r.strategy_name === 'Execução NT8' || (r.description && r.description.includes('NinjaTrader'));
            if (isNt8) {
              const dt = r.closed_at ? new Date(r.closed_at) : (r.created_at ? new Date(r.created_at) : null);
              if (dt && !isNaN(dt.getTime())) {
                if (!latestTime || dt > latestTime) {
                  latestTime = dt;
                }
              }
            }
          }
        }
        if (latestTime) {
          mode = 'history';
          sinceParam = latestTime.toISOString();
        }
      }

      const perfData = await fetchNinjaAccountPerformance({
        accountName: (accountName && accountName !== 'all') ? accountName : undefined,
        mode,
        startDate: startDateParam,
        endDate: endDateParam,
        since: sinceParam
      });

      if (!perfData || perfData.length === 0) {
        if (!silent) setNinjaFeedback('ℹ️ Nenhuma conta com dados de performance retornada pelo NinjaTrader.');
        return;
      }

      setNinjaAccountsPerf(perfData);

      let importedTradesCount = 0;
      let updatedAccountsCount = 0;
      let reconciledReportsCount = 0;
      const insertedKeys = new Set<string>();
      const extraIdsToDelete: string[] = [];
      const recordsToUpsertMap = new Map<string, any>();
      const newReportsToInsert: any[] = [];
      const storedSubId = localStorage.getItem('vortex_subscription_id') || null;

      for (const ninjaAcc of perfData) {
        // Encontra a conta correspondente no VortexWeb
        const localAcc = accounts.find(a => 
          a.account_name.trim().toLowerCase() === ninjaAcc.name.trim().toLowerCase() ||
          a.account_name.trim().toLowerCase() === ninjaAcc.displayName?.trim().toLowerCase()
        );

        // Se a conta não existe no VortexWeb (foi excluída ou não cadastrada), IGNORAR
        if (!localAcc) {
          continue;
        }

        if (ninjaAcc.cashValue > 0) {
          try {
            await updateAccountSupabase(localAcc.id, {
              balance: ninjaAcc.cashValue,
              platform: 'nt8',
              send_localhost: true
            });
            updatedAccountsCount++;
          } catch { }
        }

        // Reconcilia e importa execuções da conta
        if (ninjaAcc.trades && ninjaAcc.trades.length > 0) {
          const matchedReportIdsInPass = new Set<string>();

          for (const tr of ninjaAcc.trades) {
            // Ignora trades em aberto no relatório histórico consolidado
            if (tr.isOpen) continue;

            const pts = tr.profitPoints !== 0 ? tr.profitPoints : (tr.exitPrice > 0 ? (tr.entryAction === 'BUY' ? tr.exitPrice - tr.entryPrice : tr.entryPrice - tr.exitPrice) : 0);
            const { pnl: cleanProfitCurrency } = sanitizeNinjaTradePnl(tr.symbol, undefined, pts, tr.quantity, tr.profitCurrency);
            const statusStr: 'Gain' | 'Stop' = cleanProfitCurrency > 0 ? 'Gain' : (cleanProfitCurrency < 0 ? 'Stop' : (pts >= 0 ? 'Gain' : 'Stop'));
            const oidTag = tr.orderId ? ` [OID:${tr.orderId}]` : '';
            const pnlTag = `[PNL:${cleanProfitCurrency.toFixed(2)}] [PTS:${pts.toFixed(2)}]${oidTag}`;
            const tradeKey = `${ninjaAcc.name.trim().toLowerCase()}_${tr.orderId || tr.tradeNumber}_${tr.entryTime}_${tr.exitTime}_${tr.symbol}_${tr.entryPrice}`;

            // Ajuste de fuso horário
            let cleanEntryTime = tr.entryTime || new Date().toISOString();
            if (cleanEntryTime.endsWith('Z')) {
              cleanEntryTime = cleanEntryTime.slice(0, -1) + '-03:00';
            }
            let cleanExitTime = tr.exitTime || new Date().toISOString();
            if (cleanExitTime.endsWith('Z')) {
              cleanExitTime = cleanExitTime.slice(0, -1) + '-03:00';
            }

            const tNinjaEntry = cleanEntryTime ? new Date(cleanEntryTime).getTime() : NaN;
            const tNinjaExit = cleanExitTime ? new Date(cleanExitTime).getTime() : NaN;

            // Localizar relatório(s) existente(s) no banco/memória para esta conta
            const accNameLower = ninjaAcc.name.trim().toLowerCase();
            const accDispLower = (ninjaAcc.displayName || '').trim().toLowerCase();
            const matchingReports = (reports || []).filter(r => {
              if (matchedReportIdsInPass.has(r.id)) return false;

              const rDesc = r.description || '';
              const rAccLower = (r.account_name || '').trim().toLowerCase();
              
              const matchAcc = r.account_id === localAcc.id ||
                rAccLower === accNameLower ||
                (accDispLower.length > 0 && rAccLower === accDispLower) ||
                rDesc.toLowerCase().includes(`| ${accNameLower}`) ||
                accounts.some(a => a.id === r.account_id && (a.account_name.trim().toLowerCase() === accNameLower || (accDispLower.length > 0 && a.account_name.trim().toLowerCase() === accDispLower)));
              if (!matchAcc) return false;

              // 1. Se tiver tag [OID:...] explícita em ambos, compara estritamente pelo OID único
              if (tr.orderId && tr.orderId.trim().length > 0) {
                if (rDesc.includes(`[OID:${tr.orderId}]`)) return true;
                if (rDesc.includes('[OID:')) return false;
                if (rDesc.includes(tr.orderId)) return true;
              }

              const isNt8Report = r.strategy_name === 'Execução NT8' || rDesc.includes('Execução NinjaTrader');
              const tRepEntry = r.created_at ? new Date(r.created_at).getTime() : NaN;
              const tRepExit = r.closed_at ? new Date(r.closed_at).getTime() : NaN;
              const pDiff = Math.abs(Number(r.entry_price) - tr.entryPrice);
              const isSideMatch = !r.side || (r.side === 'COMPRA' && tr.entryAction === 'BUY') || (r.side === 'VENDA' && tr.entryAction === 'SELL');

              if (isNt8Report) {
                // Para relatórios já oriundos do NT8 (sem tag OID antiga), exige igualdade estrita de horário de entrada/saída (margem 3s) e preço
                const isExactEntryTime = (!isNaN(tNinjaEntry) && !isNaN(tRepEntry)) && Math.abs(tRepEntry - tNinjaEntry) <= 3000;
                const isExactExitTime = (isNaN(tNinjaExit) || isNaN(tRepExit)) ? true : Math.abs(tRepExit - tNinjaExit) <= 3000;
                const isExactPrice = pDiff < 0.25;
                return isSameAsset(r.symbol, tr.symbol) && isExactEntryTime && isExactExitTime && isExactPrice && isSideMatch;
              }

              // 2. Para ordens originadas pelo Painel/Robô VortexWeb, janela de 90s para conciliar com a execução real do NT8
              const isTimeMatch = (!isNaN(tNinjaEntry) && !isNaN(tRepEntry)) && Math.abs(tRepEntry - tNinjaEntry) < 90 * 1000;
              const isPriceMatch = pDiff < 0.50;

              return isSameAsset(r.symbol, tr.symbol) && isTimeMatch && isPriceMatch && isSideMatch;
            });

            if (matchingReports.length > 0) {
              const existingReport = matchingReports[0];
              matchedReportIdsInPass.add(existingReport.id);

              // Se existirem duplicatas acumuladas desse mesmo trade, purgar as excedentes em lote
              if (matchingReports.length > 1) {
                const extra = matchingReports.slice(1).map(d => d.id).filter(Boolean);
                extraIdsToDelete.push(...extra);
              }

              // Reconcilia a operação com os dados reais apurados pelo NinjaTrader (PNL Líquido e Pontos)
              let updatedDesc = existingReport.description || `[${tr.symbol}] Execução NinjaTrader #${tr.tradeNumber} | ${ninjaAcc.name}`;
              if (updatedDesc.includes('[PNL:')) {
                updatedDesc = updatedDesc.replace(/\[PNL:\s*[^\]]+\]/i, `[PNL:${cleanProfitCurrency.toFixed(2)}]`);
              } else {
                updatedDesc = `${updatedDesc} [PNL:${cleanProfitCurrency.toFixed(2)}]`;
              }
              if (updatedDesc.includes('[PTS:')) {
                updatedDesc = updatedDesc.replace(/\[PTS:\s*[^\]]+\]/i, `[PTS:${pts.toFixed(2)}]`);
              } else {
                updatedDesc = `${updatedDesc} [PTS:${pts.toFixed(2)}]`;
              }
              if (tr.orderId && !updatedDesc.includes('[OID:')) {
                updatedDesc = `${updatedDesc} [OID:${tr.orderId}]`;
              }

              const exitP = tr.exitPrice > 0 ? tr.exitPrice : Number(existingReport.entry_price);

              const updatePayload: any = {
                id: existingReport.id,
                description: updatedDesc,
                status: statusStr,
                entry_price: tr.entryPrice,
                exit_price: exitP,
                symbol: tr.symbol || existingReport.symbol,
                created_at: cleanEntryTime,
                closed_at: cleanExitTime
              };

              const sanitizedUpdate = sanitizeReportDbPayload(updatePayload);
              recordsToUpsertMap.set(existingReport.id, sanitizedUpdate);

              // Atualiza o objeto existente em memória para refletir instantaneamente
              existingReport.description = updatedDesc;
              existingReport.status = statusStr;
              existingReport.entry_price = tr.entryPrice;
              existingReport.exit_price = exitP;
              existingReport.created_at = cleanEntryTime;
              existingReport.closed_at = cleanExitTime;
              (existingReport as any).realized_pnl = cleanProfitCurrency;
              (existingReport as any).profit_points = pts;
              reconciledReportsCount++;

              // Reconciliar Slaves vinculadas a esta Master
              const slaveReports = (reports || []).filter(sr => sr.master_operation_id === existingReport.id);
              for (const slaveRep of slaveReports) {
                const slaveMult = (Number(slaveRep.contrato || 1) / Number(existingReport.contrato || 1));
                const slavePnl = Number((cleanProfitCurrency * slaveMult).toFixed(2));
                let slaveDesc = slaveRep.description || '';
                if (slaveDesc.includes('[PNL:')) {
                  slaveDesc = slaveDesc.replace(/\[PNL:\s*[^\]]+\]/i, `[PNL:${slavePnl.toFixed(2)}]`);
                } else {
                  slaveDesc = `${slaveDesc} [PNL:${slavePnl.toFixed(2)}]`;
                }
                if (slaveDesc.includes('[PTS:')) {
                  slaveDesc = slaveDesc.replace(/\[PTS:\s*[^\]]+\]/i, `[PTS:${pts.toFixed(2)}]`);
                } else {
                  slaveDesc = `${slaveDesc} [PTS:${pts.toFixed(2)}]`;
                }
                const sanitizedSlave = sanitizeReportDbPayload({
                  id: slaveRep.id,
                  description: slaveDesc,
                  status: statusStr,
                  exit_price: exitP,
                  symbol: tr.symbol || slaveRep.symbol,
                  closed_at: cleanExitTime
                });
                recordsToUpsertMap.set(slaveRep.id, sanitizedSlave);
                slaveRep.description = slaveDesc;
                slaveRep.status = statusStr;
                slaveRep.exit_price = exitP;
                (slaveRep as any).realized_pnl = slavePnl;
                (slaveRep as any).profit_points = pts;
              }
            } else if (!insertedKeys.has(tradeKey)) {
              // Importa novo trade realizado no NinjaTrader
              insertedKeys.add(tradeKey);
              const repId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `nt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
              const closedPayload: any = {
                id: repId,
                account_id: localAcc.id,
                account_name: localAcc.account_name,
                strategy_name: 'Execução NT8',
                strategy_id: null,
                side: tr.entryAction === 'BUY' ? 'COMPRA' : 'VENDA',
                entry_price: tr.entryPrice,
                exit_price: tr.exitPrice > 0 ? tr.exitPrice : tr.entryPrice,
                contrato: tr.quantity,
                stop_loss: 0,
                take_profit: 0,
                status: statusStr,
                description: `[${tr.symbol}] Execução NinjaTrader #${tr.tradeNumber} | ${localAcc.account_name} ${pnlTag}`,
                symbol: tr.symbol,
                already_dispatched: true,
                realized_pnl: cleanProfitCurrency,
                profit_points: pts,
                created_at: cleanEntryTime,
                closed_at: cleanExitTime,
                user_id: user?.id,
                subscription_id: storedSubId
              };

              newReportsToInsert.push(closedPayload);
              const sanitizedNew = sanitizeReportDbPayload(closedPayload);
              recordsToUpsertMap.set(repId, sanitizedNew);
              importedTradesCount++;
            }
          }
        }
      }

      // 1. Purgar duplicatas em lote único
      if (extraIdsToDelete.length > 0) {
        const uniqueDeleteIds = Array.from(new Set(extraIdsToDelete));
        for (let i = 0; i < uniqueDeleteIds.length; i += 100) {
          const chunk = uniqueDeleteIds.slice(i, i + 100);
          try {
            await supabase.from('painelvm_strategy_reports').delete().in('id', chunk);
          } catch (e) {
            console.warn('[DESEMPENHO NT8] Falha ao deletar duplicatas em lote:', e);
          }
        }
      }

      // 2. Gravar todos os relatórios (reconciliados + novos) em lotes rápidos de 100
      const allUpserts = Array.from(recordsToUpsertMap.values());
      if (allUpserts.length > 0) {
        for (let i = 0; i < allUpserts.length; i += 100) {
          const chunk = allUpserts.slice(i, i + 100);
          try {
            const { error: batchErr } = await supabase.from('painelvm_strategy_reports').upsert(chunk);
            if (batchErr) {
              console.warn('[DESEMPENHO NT8] Upsert em lote rejeitado, tentando individualmente:', batchErr.message);
              for (const rep of chunk) {
                try { await supabase.from('painelvm_strategy_reports').upsert([rep]); } catch { }
              }
            }
          } catch (e) {
            console.warn('[DESEMPENHO NT8] Erro no lote de upsert:', e);
          }
        }
        const curLocals = getLocalStrategyReports();
        saveLocalStrategyReports([...newReportsToInsert, ...curLocals]);
      }

      // Recarrega relatórios imediatamente para refletir na interface sem delay
      if (fetchReportsList) {
        await fetchReportsList(true);
      }

      const msg = `✅ Sincronizado: ${perfData.length} conta(s), ${updatedAccountsCount} saldo(s), ${reconciledReportsCount} trade(s) reconciliado(s) e ${importedTradesCount} novo(s) importado(s)!`;
      if (!silent) {
        setNinjaFeedback(msg);
        if (addLog) addLog('📈 DESEMPENHO NT8', msg, 'sistema');
      }
    } catch (err: any) {
      if (!silent) {
        setNinjaFeedback(`❌ Erro: ${err.message || 'Falha ao sincronizar'}`);
        if (addLog) addLog('ERRO', `Erro na sincronização de performance NT8: ${err.message}`, 'erro');
      }
    } finally {
      isSyncingRef.current = false;
      if (!silent) {
        setIsSyncingNinja(false);
        setTimeout(() => setNinjaFeedback(null), 6000);
      }
    }
  };

  // Auto-reparo em background de relatórios NT8 existentes que sofreram abatimento cruzado de PnL (ex: zeragem pelo dia seguinte)
  const repairedCorruptedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!reports || reports.length === 0) return;
    const toRepair: any[] = [];

    for (const r of reports) {
      if (!r.id || repairedCorruptedIdsRef.current.has(r.id)) continue;
      if (!r.description || !r.description.includes('[PNL:')) continue;

      const matchPnl = r.description.match(/\[PNL:\s*([+-]?\d+(?:\.\d+)?)\]/i);
      if (!matchPnl || !matchPnl[1]) continue;
      const rawPnl = parseFloat(matchPnl[1]);
      if (isNaN(rawPnl)) continue;

      let pts = calculatePoints(r);
      const matchPts = r.description.match(/\[PTS:\s*([+-]?\d+(?:\.\d+)?)\]/i);
      if (matchPts && matchPts[1]) {
        const parsedPts = parseFloat(matchPts[1]);
        if (!isNaN(parsedPts)) pts = parsedPts;
      }

      const contracts = r.contrato !== undefined && r.contrato !== null ? Number(r.contrato) : 1;
      const { pnl: cleanPnl, wasCorrupted } = sanitizeNinjaTradePnl(r.symbol, r.description, pts, contracts, rawPnl);
      if (wasCorrupted) {
        repairedCorruptedIdsRef.current.add(r.id);
        const newStatus: 'Gain' | 'Stop' = cleanPnl > 0 ? 'Gain' : (cleanPnl < 0 ? 'Stop' : (pts >= 0 ? 'Gain' : 'Stop'));
        const newDesc = r.description.replace(/\[PNL:\s*[^\]]+\]/i, `[PNL:${cleanPnl.toFixed(2)}]`);
        r.description = newDesc;
        r.status = newStatus;
        (r as any).realized_pnl = cleanPnl;
        toRepair.push(sanitizeReportDbPayload({
          id: r.id,
          description: newDesc,
          status: newStatus
        }));
      }
    }

    if (toRepair.length > 0) {
      (async () => {
        for (const item of toRepair) {
          try {
            await supabase.from('painelvm_strategy_reports').update({
              description: item.description,
              status: item.status
            }).eq('id', item.id);
          } catch { }
        }
        if (fetchReportsList) {
          await fetchReportsList(true);
        }
      })();
    }
  }, [reports]);

  // Sincronização inteligente incremental ao carregar o componente (apenas do último trade registrado até agora)
  useEffect(() => {
    handleSyncNinjaTrader({ silent: true, isIncrementalAutoSync: true });
  }, []);

  // KPIs baseados nos relatórios filtrados usando resultado real da sincronização ou cálculo de ativo
  const stats = useMemo(() => {
    let gainsCount = 0;
    let stopsCount = 0;
    let inProgressCount = 0;
    let cancelledCount = 0;
    let grossProfitUSD = 0;
    let grossLossUSD = 0;
    let totalUSD = 0;

    filteredReports.forEach(r => {
      if (r.status === 'Em Andamento') {
        inProgressCount++;
      } else if (r.status === 'Cancelado') {
        if (r.exit_price !== null && r.exit_price !== undefined) {
          const res = getReportResult(r);
          totalUSD += res.usdVal;
          if (res.usdVal > 0 || (res.usdVal === 0 && res.isGain)) {
            gainsCount++;
            grossProfitUSD += res.usdVal;
          } else if (res.usdVal < 0 || (res.usdVal === 0 && res.isStop)) {
            stopsCount++;
            grossLossUSD += Math.abs(res.usdVal);
          } else {
            gainsCount++;
          }
        } else {
          cancelledCount++;
        }
      } else {
        const res = getReportResult(r);
        totalUSD += res.usdVal;
        if (res.usdVal > 0) {
          gainsCount++;
          grossProfitUSD += res.usdVal;
        } else if (res.usdVal < 0) {
          stopsCount++;
          grossLossUSD += Math.abs(res.usdVal);
        } else {
          if (res.isGain) {
            gainsCount++;
          } else {
            stopsCount++;
          }
        }
      }
    });

    const totalClosed = gainsCount + stopsCount;
    const winRate = totalClosed > 0 ? (gainsCount / totalClosed) * 100 : 0;
    const profitFactor = grossLossUSD > 0 ? (grossProfitUSD / grossLossUSD) : grossProfitUSD > 0 ? Infinity : 0;

    return {
      totalUSD,
      winRate,
      totalClosed,
      gainsCount,
      stopsCount,
      inProgressCount,
      cancelledCount,
      profitFactor,
      grossProfitUSD,
      grossLossUSD
    };
  }, [filteredReports, panels, simMultiplier, accounts]);



  const handleCloseReport = async (id: string) => {
    if (settings?.chart_confirm_manual_trade !== false) {
      if (!window.confirm('Deseja realmente encerrar esta operação manualmente?')) {
        return;
      }
    }
    await updateReportAction(id, 'Cancelado');
  };

  // --- Processamento de Dados Agrupados para Gráficos ---

  // 1. Mensal
  const performanceByMonth = useMemo(() => {
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const values = Array(12).fill(0);
    let hasData = false;
    const systemSessionStart = settings?.global_cycle_start || '20:00:00';

    filteredReports.forEach(r => {
      if (isClosedReport(r)) {
        const cleanCreated = getCleanReportDate(r.created_at, Boolean(r.description?.includes('NinjaTrader') || r.strategy_name === 'Execução NT8'));
        const monthIdx = getTradingSessionDate(cleanCreated, systemSessionStart).getMonth();
        const { usdVal } = getReportResult(r);
        values[monthIdx] += usdVal;
        hasData = true;
      }
    });

    return monthNames
      .map((name, i) => ({ label: name, val: values[i] }))
      .filter((item, i) => item.val !== 0 || i === getTradingSessionDate(new Date(), systemSessionStart).getMonth() || hasData === false);
  }, [filteredReports, panels, simMultiplier, accounts, settings]);

  // 2. Diário (Evolução por dia)
  const performanceByCalendarDay = useMemo(() => {
    const daysMap: { [key: string]: number } = {};
    const systemSessionStart = settings?.global_cycle_start || '20:00:00';

    filteredReports.forEach(r => {
      if (isClosedReport(r)) {
        const isNT = Boolean(r.description?.includes('NinjaTrader') || r.strategy_name === 'Execução NT8');
        const targetDate = r.closed_at || r.created_at;
        const cleanCreated = getCleanReportDate(targetDate, isNT);
        const tradeDate = getTradingSessionDate(cleanCreated, systemSessionStart);
        const dayStr = `${String(tradeDate.getDate()).padStart(2, '0')}/${String(tradeDate.getMonth() + 1).padStart(2, '0')}`;
        const { usdVal } = getReportResult(r);
        daysMap[dayStr] = (daysMap[dayStr] || 0) + usdVal;
      }
    });

    const sortedDays = Object.entries(daysMap).map(([label, val]) => ({ label, val }));
    sortedDays.sort((a, b) => {
      const [dayA, monthA] = a.label.split('/').map(Number);
      const [dayB, monthB] = b.label.split('/').map(Number);
      return monthA !== monthB ? monthA - monthB : dayA - dayB;
    });

    return sortedDays.slice(-12); // Pega os últimos 12 dias
  }, [filteredReports, panels, simMultiplier, accounts, settings]);

  // 3. Dias da Semana (Segunda a Domingo)
  const performanceByWeekday = useMemo(() => {
    const weekdayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    const values = Array(7).fill(0);
    const systemSessionStart = settings?.global_cycle_start || '20:00:00';

    filteredReports.forEach(r => {
      if (isClosedReport(r)) {
        const cleanCreated = getCleanReportDate(r.created_at, Boolean(r.description?.includes('NinjaTrader') || r.strategy_name === 'Execução NT8'));
        const rawDay = getTradingSessionDate(cleanCreated, systemSessionStart).getDay();
        const adjustedIdx = rawDay === 0 ? 6 : rawDay - 1; // Segunda é index 0, Domingo index 6
        const { usdVal } = getReportResult(r);
        values[adjustedIdx] += usdVal;
      }
    });

    return weekdayNames.map((name, i) => ({ label: name, val: values[i] }));
  }, [filteredReports, panels, simMultiplier, accounts, settings]);

  // 4. Por Hora (Melhores horários)
  const performanceByHourGrouped = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const values = Array(24).fill(0);
    let hasData = false;

    filteredReports.forEach(r => {
      if (isClosedReport(r)) {
        const hour = getSaoPauloDate(r.created_at).getHours();
        const { usdVal } = getReportResult(r);
        values[hour] += usdVal;
        hasData = true;
      }
    });

    return hours
      .map(h => ({ label: `${String(h).padStart(2, '0')}h`, val: values[h] }))
      .filter(item => item.val !== 0 || hasData === false)
      .slice(-12);
  }, [filteredReports, panels, simMultiplier, accounts]);

  // 5. Por Meia Hora (Melhores horários por meia hora)
  const performanceByHalfHourGrouped = useMemo(() => {
    const slots: { [key: string]: number } = {};

    filteredReports.forEach(r => {
      if (isClosedReport(r)) {
        const date = getSaoPauloDate(r.created_at);
        const hour = date.getHours();
        const min = date.getMinutes() >= 30 ? '30' : '00';
        const timeSlot = `${String(hour).padStart(2, '0')}:${min}`;
        const { usdVal } = getReportResult(r);
        slots[timeSlot] = (slots[timeSlot] || 0) + usdVal;
      }
    });

    const activeSlots = Object.entries(slots).map(([slot, val]) => ({
      label: slot,
      val
    }));

    activeSlots.sort((a, b) => a.label.localeCompare(b.label));
    return activeSlots.slice(0, 12);
  }, [filteredReports, panels, simMultiplier, accounts]);

  // Dados Ativos baseados no filtro selecionado
  const activeChartData = useMemo(() => {
    switch (chartGroupFilter) {
      case 'monthly':
        return performanceByMonth;
      case 'weekday':
        return performanceByWeekday;
      case 'hourly':
        return performanceByHourGrouped;
      case 'halfhourly':
        return performanceByHalfHourGrouped;
      case 'daily':
      default:
        return performanceByCalendarDay;
    }
  }, [chartGroupFilter, performanceByMonth, performanceByCalendarDay, performanceByWeekday, performanceByHourGrouped, performanceByHalfHourGrouped]);

  // Dados Consolidados para o Calendário de Performance (Trading Calendar)
  const calendarData = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth(); // 0 = Jan, 8 = Set...
    const systemSessionStart = settings?.global_cycle_start || '20:00:00';

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Domingo, 1 = Segunda...

    // Mapeamento diário de trades e PnL Líquido
    const dayMap = new Map<number, {
      pnl: number;
      tradesCount: number;
      gainsCount: number;
      stopsCount: number;
      reports: StrategyReport[];
    }>();

    for (let d = 1; d <= daysInMonth; d++) {
      dayMap.set(d, { pnl: 0, tradesCount: 0, gainsCount: 0, stopsCount: 0, reports: [] });
    }

    filteredReports.forEach(r => {
      if (!isClosedReport(r)) return;
      const isNT = Boolean(r.description?.includes('NinjaTrader') || r.strategy_name === 'Execução NT8');
      const targetDate = r.closed_at || r.created_at;
      const cleanCreated = getCleanReportDate(targetDate, isNT);
      const d = getTradingSessionDate(cleanCreated, systemSessionStart);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const dayNum = d.getDate();
        const entry = dayMap.get(dayNum);
        if (entry) {
          const res = getReportResult(r);
          entry.pnl += res.usdVal;
          entry.tradesCount++;
          if (res.isGain) entry.gainsCount++;
          if (res.isStop) entry.stopsCount++;
          entry.reports.push(r);
        }
      }
    });

    let monthNetPnl = 0;
    let winningDaysCount = 0;
    let losingDaysCount = 0;
    let totalTradesInMonth = 0;

    dayMap.forEach(val => {
      if (val.tradesCount > 0) {
        monthNetPnl += val.pnl;
        totalTradesInMonth += val.tradesCount;
        if (val.pnl > 0) winningDaysCount++;
        else if (val.pnl < 0) losingDaysCount++;
      }
    });

    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    return {
      year,
      month,
      monthName: monthNames[month],
      daysInMonth,
      firstDayOfWeek,
      dayMap,
      monthNetPnl,
      winningDaysCount,
      losingDaysCount,
      totalTradesInMonth
    };
  }, [calendarMonth, filteredReports, panels, simMultiplier, accounts, settings]);

  const handleSelectCalendarDay = (day: number) => {
    const y = calendarData.year;
    const m = String(calendarData.month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    if (startDate === dateStr && endDate === dateStr) {
      setStartDate('');
      setEndDate('');
    } else {
      setStartDate(dateStr);
      setEndDate(dateStr);
    }
  };

  // Renderizador Genérico do Gráfico SVG
  const renderSvgBarChart = (data: Array<{ label: string; val: number }>) => {
    if (data.length === 0) {
      return (
        <div className="h-full flex items-center justify-center text-slate-500 text-[10px] uppercase font-mono">
          Sem dados para exibir
        </div>
      );
    }

    const width = 600;
    const height = 180;
    const paddingLeft = 45;
    const paddingRight = 15;
    const paddingTop = 20;
    const paddingBottom = 25;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const values = data.map(d => d.val);
    const maxVal = Math.max(...values, 0);
    const minVal = Math.min(...values, 0);
    const absMax = Math.max(Math.abs(maxVal), Math.abs(minVal), 10);

    const getY = (val: number) => {
      const ratio = (val - (-absMax)) / (absMax * 2);
      return paddingTop + chartHeight - ratio * chartHeight;
    };

    const zeroY = getY(0);
    const barWidth = Math.max((chartWidth / data.length) * 0.5, 8);
    const spacing = chartWidth / data.length;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full text-slate-400 font-mono">
        <line
          x1={paddingLeft}
          y1={zeroY}
          x2={width - paddingRight}
          y2={zeroY}
          stroke="#475569"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
        <line
          x1={paddingLeft}
          y1={paddingTop}
          x2={paddingLeft}
          y2={height - paddingBottom}
          stroke="#334155"
          strokeWidth="1"
        />
        <text x={5} y={paddingTop + 4} fill="#64748b" className="text-[12px] font-bold">
          ${absMax.toFixed(0)}
        </text>
        <text x={5} y={zeroY + 3} fill="#475569" className="text-[11px]">
          $0
        </text>
        <text x={5} y={height - paddingBottom} fill="#64748b" className="text-[12px] font-bold">
          -${absMax.toFixed(0)}
        </text>

        {data.map((d, idx) => {
          const x = paddingLeft + idx * spacing + (spacing - barWidth) / 2;
          const y = getY(d.val);
          const barHeight = Math.abs(y - zeroY);
          const isPositive = d.val >= 0;
          const barY = isPositive ? y : zeroY;

          return (
            <g key={idx}>
              <rect
                x={x}
                y={barY}
                width={barWidth}
                height={Math.max(barHeight, 1)}
                fill={isPositive ? 'url(#green-gradient)' : 'url(#red-gradient)'}
                rx={2}
                className="transition-all duration-300 hover:opacity-80 cursor-pointer"
              />
              {d.val !== 0 && (
                <text
                  x={x + barWidth / 2}
                  y={isPositive ? y - 4 : y + 10}
                  textAnchor="middle"
                  fill={isPositive ? '#4ade80' : '#f87171'}
                  className="text-[11px] font-extrabold"
                >
                  ${d.val > 0 ? '+' : ''}{d.val.toFixed(0)}
                </text>
              )}
              <text
                x={x + barWidth / 2}
                y={height - 8}
                textAnchor="middle"
                fill="#64748b"
                className="text-[12px] font-semibold"
              >
                {d.label}
              </text>
            </g>
          );
        })}

        <defs>
          <linearGradient id="green-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#15803d" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="red-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b91c1c" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.9" />
          </linearGradient>
        </defs>
      </svg>
    );
  };

  // Paginação e Exportação de Relatórios
  const totalPages = Math.ceil(filteredReports.length / 25);
  const startIndex = (currentPage - 1) * 25;
  const paginatedReports = useMemo(() => {
    return filteredReports.slice(startIndex, startIndex + 25);
  }, [filteredReports, startIndex]);

  const displayStart = filteredReports.length > 0 ? startIndex + 1 : 0;
  const displayEnd = Math.min(startIndex + 25, filteredReports.length);

  const getPageNumbers = () => {
    const pages: number[] = [];
    const maxButtons = 5;
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start < maxButtons - 1) {
      start = Math.max(1, end - maxButtons + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  const handleExportCSV = () => {
    const headers = [
      'Data/Hora',
      'Estrategia',
      'Ativo/Descricao',
      'Operacao',
      'Contrato',
      'Preco Entrada',
      'Stop Loss',
      'Take Profit',
      'Preco Saida',
      'Status',
      'Resultado (Pontos)',
      'Resultado (USD)'
    ];

    const rows = filteredReports.map(r => {
      const { pts, usdVal, isGain, isStop } = getReportResult(r);
      const reportContracts = r.contrato !== undefined && r.contrato !== null ? Number(r.contrato) : 1;
      const dateStr = `${formatSaoPauloDate(r.created_at)} ${formatSaoPauloTime(r.created_at, true)}`;
      
      const ptsFormatted = r.status === 'Em Andamento' || (r.status === 'Cancelado' && r.exit_price === null) ? '' : pts.toFixed(1);
      const usdFormatted = r.status === 'Em Andamento' || (r.status === 'Cancelado' && r.exit_price === null) ? '' : usdVal.toFixed(2);
      const statusStr = isGain ? 'Gain' : (isStop ? 'Stop' : (r.status || ''));

      return [
        `"${dateStr}"`,
        `"${(r.strategy_name || '').replace(/"/g, '""')}"`,
        `"${(r.description || '').replace(/"/g, '""')}"`,
        `"${r.side || ''}"`,
        reportContracts,
        r.entry_price || '',
        r.stop_loss || '',
        r.take_profit || '',
        r.exit_price || '',
        `"${statusStr}"`,
        ptsFormatted,
        usdFormatted
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_sinais_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const avgTradeUSD = stats.totalClosed > 0 ? stats.totalUSD / stats.totalClosed : 0;

  const selectedAcc = useMemo(() => {
    if (filterAccount === 'all') return null;
    return accounts.find(a => a.id === filterAccount) || null;
  }, [filterAccount, accounts]);

  const selectedNinjaPerf = useMemo(() => {
    if (!selectedAcc) return null;
    const nameLower = selectedAcc.account_name.trim().toLowerCase();
    return ninjaAccountsPerf.find(p => 
      p.name.trim().toLowerCase() === nameLower ||
      (p.displayName && p.displayName.trim().toLowerCase() === nameLower)
    ) || null;
  }, [selectedAcc, ninjaAccountsPerf]);

  return (
    <div className="p-4 space-y-4 text-slate-200">
      
      {/* Cabeçalho com Sincronização NinjaTrader */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-950 p-4 rounded-lg border border-slate-800 shadow-md">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            📊 Análise de Desempenho
            {ninjaStatus === 'online' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold border border-emerald-500/30">
                🟢 NT8 Conectado
              </span>
            )}
          </h1>
          <p className="text-[10px] text-slate-400">
            Acompanhe o desempenho das suas estratégias e analise dados consolidados de sinais e contas NinjaTrader.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowSyncPeriodBar(!showSyncPeriodBar)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border shadow-sm ${
              showSyncPeriodBar 
                ? 'bg-slate-800 text-blue-300 border-blue-500/50 ring-1 ring-blue-500/30' 
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            <span>📅</span>
            <span>{showSyncPeriodBar ? 'Ocultar Filtro por Período' : 'Sincronizar por Período'}</span>
          </button>

          <button
            onClick={() => handleSyncNinjaTrader({ silent: false, mode: 'day' })}
            disabled={isSyncingNinja}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border shadow-sm ${
              isSyncingNinja 
                ? 'bg-blue-600/50 text-blue-200 border-blue-500/30 cursor-wait animate-pulse' 
                : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 hover:shadow-blue-500/20'
            }`}
          >
            {isSyncingNinja ? '⏳ Sincronizando...' : '⚡ Sincronizar Hoje'}
          </button>
        </div>
      </div>

      {/* Painel Avançado: Sincronização Personalizada por Conta e Período */}
      {showSyncPeriodBar && (
        <div className="bg-slate-900/95 border border-blue-500/30 rounded-xl p-4 shadow-xl space-y-3 animate-fade-in backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-base text-blue-400">📅</span>
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Sincronização Histórica NinjaTrader 8 por Período
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              Filtre por conta e intervalo de datas para importar e salvar permanentemente as operações.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">CONTA NT8:</label>
              <select
                value={syncPeriodAccount}
                onChange={(e) => setSyncPeriodAccount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              >
                <option value="all">🌐 Todas as Contas NT8 Sincronizadas</option>
                {accounts
                  .filter(acc => acc.platform === 'nt8' || acc.send_localhost === true)
                  .map(acc => (
                    <option key={acc.id} value={acc.account_name}>
                      {acc.account_name} (NT8)
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">DATA INICIAL:</label>
              <input
                type="date"
                value={syncPeriodStartDate}
                onChange={(e) => setSyncPeriodStartDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">DATA FINAL:</label>
              <input
                type="date"
                value={syncPeriodEndDate}
                onChange={(e) => setSyncPeriodEndDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (startDate && syncPeriodStartDate && startDate > syncPeriodStartDate) {
                    setStartDate(syncPeriodStartDate);
                  }
                  if (endDate && syncPeriodEndDate && endDate < syncPeriodEndDate) {
                    setEndDate(syncPeriodEndDate);
                  }
                  handleSyncNinjaTrader({
                    silent: false,
                    mode: 'history',
                    accountName: syncPeriodAccount,
                    startDate: syncPeriodStartDate,
                    endDate: syncPeriodEndDate
                  });
                }}
                disabled={isSyncingNinja}
                className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 border shadow-sm ${
                  isSyncingNinja
                    ? 'bg-emerald-600/50 text-emerald-200 border-emerald-500/30 cursor-wait animate-pulse'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 hover:shadow-emerald-500/20'
                }`}
              >
                {isSyncingNinja ? '⏳ Sincronizando...' : '🚀 Sincronizar Período'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-slate-400 border-t border-slate-800/60">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-slate-500 font-bold">ATALHOS:</span>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 7);
                  setSyncPeriodStartDate(d.toISOString().split('T')[0]);
                  setSyncPeriodEndDate(new Date().toISOString().split('T')[0]);
                }}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition border border-slate-700"
              >
                Últimos 7 dias
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 30);
                  setSyncPeriodStartDate(d.toISOString().split('T')[0]);
                  setSyncPeriodEndDate(new Date().toISOString().split('T')[0]);
                }}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition border border-slate-700"
              >
                Últimos 30 dias
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                  setSyncPeriodStartDate(firstDay.toISOString().split('T')[0]);
                  setSyncPeriodEndDate(now.toISOString().split('T')[0]);
                }}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition border border-slate-700"
              >
                Mês Atual
              </button>
            </div>
            <span className="text-[10px] text-slate-500 italic">
              ⚡ Sincronização inteligente: ao abrir o painel, novas operações são sincronizadas incrementalmente em menos de 1s.
            </span>
          </div>
        </div>
      )}

      {/* Feedback de Sincronização */}
      {ninjaFeedback && (
        <div className="p-3 rounded-lg bg-blue-950/40 border border-blue-800/60 text-xs text-blue-200 flex items-center justify-between animate-fade-in shadow-md">
          <span>{ninjaFeedback}</span>
          <button onClick={() => setNinjaFeedback(null)} className="text-blue-400 hover:text-white font-bold ml-2">✕</button>
        </div>
      )}

      {/* Banner de Sincronização da Conta NinjaTrader Selecionada */}
      {selectedNinjaPerf && (
        <div className="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-3.5 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🏦</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-white font-mono">{selectedNinjaPerf.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  ✓ Sincronizada ({selectedNinjaPerf.connection || 'NT8'})
                </span>
              </div>
              <span className="text-[10px] text-slate-400">
                Dados consolidados diretamente do motor de execução do NinjaTrader 8
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono w-full md:w-auto">
            <div className="bg-slate-950/80 px-3 py-1.5 rounded border border-slate-800">
              <span className="text-slate-500 text-[9px] block">SALDO / CASH:</span>
              <span className="font-bold text-white">${selectedNinjaPerf.cashValue?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="bg-slate-950/80 px-3 py-1.5 rounded border border-slate-800">
              <span className="text-slate-500 text-[9px] block">LUCRO REALIZADO:</span>
              <span className={`font-bold ${selectedNinjaPerf.realizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {selectedNinjaPerf.realizedPnL >= 0 ? '+' : ''}${selectedNinjaPerf.realizedPnL?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-slate-950/80 px-3 py-1.5 rounded border border-slate-800">
              <span className="text-slate-500 text-[9px] block">FLUTUANTE (OPEN):</span>
              <span className={`font-bold ${selectedNinjaPerf.unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {selectedNinjaPerf.unrealizedPnL >= 0 ? '+' : ''}${selectedNinjaPerf.unrealizedPnL?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-slate-950/80 px-3 py-1.5 rounded border border-slate-800">
              <span className="text-slate-500 text-[9px] block">TRADES NT8:</span>
              <span className="font-bold text-indigo-300">{selectedNinjaPerf.tradesCount || selectedNinjaPerf.trades?.length || 0}</span>
            </div>
          </div>
        </div>
      )}

      {/* Filtros no Topo do Relatório (Unificados e Globais) */}
      <div className="bg-slate-950/80 p-3.5 rounded-lg border border-slate-800 flex flex-wrap items-end gap-3.5 shadow-md">
        
        {/* Filtro Conta de Negociação */}
        <div className="flex flex-col gap-1">
          <span className="text-[8px] font-black text-slate-500 uppercase font-mono">Conta de Negociação</span>
          <select
            value={filterAccount}
            onChange={e => setFilterAccount(e.target.value)}
            className="bg-slate-900 border border-slate-750 p-1.5 rounded text-[10px] text-emerald-400 font-bold cursor-pointer focus:outline-none focus:border-blue-500/50"
          >
            <option value="all">🏦 Todas as Contas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>🏦 {a.account_name} ({a.platform ? a.platform.toUpperCase() : 'CONTA'})</option>
            ))}
          </select>
        </div>

        {/* Filtro Período */}
        <div className="flex flex-col gap-1">
          <span className="text-[8px] font-black text-slate-500 uppercase font-mono">Data Início</span>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="bg-slate-900 border border-slate-750 p-1.5 rounded text-[10px] text-slate-300 font-bold focus:outline-none focus:border-blue-500/50"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[8px] font-black text-slate-500 uppercase font-mono">Data Fim</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="bg-slate-900 border border-slate-750 p-1.5 rounded text-[10px] text-slate-300 font-bold focus:outline-none focus:border-blue-500/50"
          />
        </div>

        {/* Filtro Ativo */}
        <div className="flex flex-col gap-1">
          <span className="text-[8px] font-black text-slate-500 uppercase font-mono">Ativo</span>
          <select
            value={filterAsset}
            onChange={e => setFilterAsset(e.target.value)}
            className="bg-slate-900 border border-slate-750 p-1.5 rounded text-[10px] text-slate-300 font-bold cursor-pointer focus:outline-none focus:border-blue-500/50"
          >
            <option value="all">🔍 Todos os Ativos</option>
            <optgroup label="🎯 Ativos dos Painéis (Demo Axion)">
              {uniqueAssets.filter(a => a.type === 'panel').map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </optgroup>
            {uniqueAssets.some(a => a.type === 'nt8') && (
              <optgroup label="🏦 Ativos NinjaTrader (Reais)">
                {uniqueAssets.filter(a => a.type === 'nt8').map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {/* Filtro Origem da Ordem */}
        <div className="flex flex-col gap-1">
          <span className="text-[8px] font-black text-slate-500 uppercase font-mono">Origem</span>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="bg-slate-900 border border-slate-750 p-1.5 rounded text-[10px] text-slate-300 font-bold cursor-pointer focus:outline-none focus:border-blue-500/50"
          >
            <option value="all">🌐 Todas as Origens</option>
            <option value="manual">🎮 Sinais Manuais</option>
            <option value="ai">🧠 Prompt IA</option>
            <option value="robot">🤖 Algoritmo (Robô)</option>
          </select>
        </div>

        {/* Filtro Estratégia */}
        <div className="flex flex-col gap-1">
          <span className="text-[8px] font-black text-slate-500 uppercase font-mono">Estratégias</span>
          <select
            value={filterStrategy}
            onChange={e => setFilterStrategy(e.target.value)}
            className="bg-slate-900 border border-slate-750 p-1.5 rounded text-[10px] text-slate-300 font-bold cursor-pointer focus:outline-none focus:border-blue-500/50"
          >
            <option value="all">🔍 Todas as Estratégias</option>
            {uniqueStrategies.map((name, idx) => (
              <option key={idx} value={name}>{name}</option>
            ))}
          </select>
        </div>

        {/* Filtro Lado */}
        <div className="flex flex-col gap-1">
          <span className="text-[8px] font-black text-slate-500 uppercase font-mono">Lado</span>
          <select
            value={filterSide}
            onChange={e => setFilterSide(e.target.value)}
            className="bg-slate-900 border border-slate-750 p-1.5 rounded text-[10px] text-slate-300 font-bold cursor-pointer focus:outline-none focus:border-blue-500/50"
          >
            <option value="all">⚖️ Ambos os Lados</option>
            <option value="COMPRA">🟢 COMPRA</option>
            <option value="VENDA">🔴 VENDA</option>
          </select>
        </div>

        {/* Filtro Status */}
        <div className="flex flex-col gap-1">
          <span className="text-[8px] font-black text-slate-500 uppercase font-mono">Status</span>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-slate-900 border border-slate-750 p-1.5 rounded text-[10px] text-slate-300 font-bold cursor-pointer focus:outline-none focus:border-blue-500/50"
          >
            <option value="all">🚩 Todos os Status</option>
            <option value="Gain">🟢 Gain (Objetivo)</option>
            <option value="Stop">🔴 Stop Loss</option>
            <option value="Em Andamento">🟡 Em Andamento</option>
            <option value="Cancelado">⚪ Cancelado</option>
          </select>
        </div>

        {/* Botão Limpar Filtros */}
        <button
          type="button"
          onClick={() => {
            setFilterStrategy('all');
            setFilterSide('all');
            setFilterStatus('all');
            setFilterAsset('all');
            setStartDate('');
            setEndDate('');
          }}
          className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-[10px] text-slate-400 hover:text-white rounded border border-slate-700/60 transition font-bold font-sans h-[29px]"
        >
          Limpar Filtros
        </button>

      </div>

      {/* Grid de KPIs Superiores (Sem Pontos Líquidos, apenas 3 cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        
        {/* KPI 1: Win Rate */}
        <div className="glass p-3 rounded-lg border border-slate-800 flex flex-col justify-between min-h-[90px]">
          <span className="text-[9px] font-bold text-slate-400 uppercase">Taxa de Acerto</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className={`text-2xl font-black ${stats.winRate >= 50 ? 'text-green-400' : stats.winRate > 0 ? 'text-red-400' : 'text-slate-500'}`}>
              {stats.winRate.toFixed(1)}%
            </span>
            <span className="text-[9px] text-slate-500 font-mono">
              ({stats.gainsCount}G / {stats.totalClosed}T)
            </span>
          </div>
          <div className="text-[8px] text-slate-500 mt-1">
            Operações lucrativas divididas pelo total fechado.
          </div>
        </div>

        {/* KPI 2: PNL Líquido Realizado (USD) */}
        <div className="glass p-3 rounded-lg border border-slate-800 flex flex-col justify-between min-h-[90px]">
          <span className="text-[9px] font-bold text-slate-400 uppercase">PNL Líquido Realizado (USD)</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className={`text-2xl font-black ${stats.totalUSD >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.totalUSD >= 0 ? '+' : ''}${stats.totalUSD.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="text-[8px] text-slate-500 mt-1">
            Resultado financeiro líquido de todas as operações fechadas.
          </div>
        </div>

        {/* KPI 3: Status das Operações */}
        <div className="glass p-3 rounded-lg border border-slate-800 flex flex-col justify-between min-h-[90px]">
          <span className="text-[9px] font-bold text-slate-400 uppercase">Status das Operações</span>
          <div className="grid grid-cols-3 gap-1 text-center mt-2">
            <div className="bg-slate-900/40 p-1 rounded border border-slate-800">
              <div className="text-[7px] text-slate-500 uppercase font-bold">Ativa</div>
              <div className="text-[11px] font-bold text-yellow-400">{stats.inProgressCount}</div>
            </div>
            <div className="bg-slate-900/40 p-1 rounded border border-slate-800">
              <div className="text-[7px] text-slate-500 uppercase font-bold">PFactor</div>
              <div className="text-[11px] font-bold text-indigo-400">
                {stats.profitFactor === Infinity ? 'MAX' : stats.profitFactor.toFixed(2)}
              </div>
            </div>
            <div className="bg-slate-900/40 p-1 rounded border border-slate-800">
              <div className="text-[7px] text-slate-500 uppercase font-bold">Cancel.</div>
              <div className="text-[11px] font-bold text-slate-500">{stats.cancelledCount}</div>
            </div>
          </div>
          <div className="text-[8px] text-slate-500 mt-1 text-left">
            Lucro bruto dividido pelo prejuízo bruto.
          </div>
        </div>

      </div>

      {/* Seletor de Modo de Visualização: Histograma vs Calendário PnL */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">
            Visão de Análise:
          </span>
          <div className="flex items-center bg-slate-900 border border-slate-750 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setPerformanceView('histogram')}
              className={`px-3 py-1 rounded text-[10px] font-bold font-sans transition flex items-center gap-1.5 ${
                performanceView === 'histogram'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📊 Histograma
            </button>
            <button
              type="button"
              onClick={() => setPerformanceView('calendar')}
              className={`px-3 py-1 rounded text-[10px] font-bold font-sans transition flex items-center gap-1.5 ${
                performanceView === 'calendar'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📅 Calendário PnL
            </button>
          </div>
        </div>

        {startDate && endDate && startDate === endDate && (
          <div className="flex items-center gap-2 bg-blue-950/70 border border-blue-700/80 px-2.5 py-1 rounded text-[10px] text-blue-200 font-mono animate-fade-in">
            <span>Filtro ativo: Dia {startDate}</span>
            <button
              type="button"
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="text-blue-400 hover:text-white font-bold ml-1 cursor-pointer"
            >
              ✕ Limpar
            </button>
          </div>
        )}
      </div>

      {/* Visão 1: Histograma */}
      {performanceView === 'histogram' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

          {/* Gráfico 1: Unificado e Amplo (col-span-2) */}
          <div className="glass p-4 rounded-lg border border-slate-800 flex flex-col justify-between min-h-[220px] lg:col-span-2">
            <div className="flex justify-between items-center mb-3">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                  📈 Desempenho e Distribuição de Resultados
                </span>
                <span className="text-[8px] text-slate-500 mt-0.5">Saldo Líquido Acumulado em USD</span>
              </div>
              
              {/* Listbox Filtro de Agrupamento */}
              <select
                value={chartGroupFilter}
                onChange={e => setChartGroupFilter(e.target.value as any)}
                className="bg-slate-900 border border-slate-750 p-1.5 rounded text-[10px] text-slate-300 font-bold focus:outline-none focus:border-blue-500/50 cursor-pointer"
              >
                <option value="daily">📅 Diário</option>
                <option value="monthly">🗓️ Mensal</option>
                <option value="weekday">📆 Dias da Semana</option>
                <option value="hourly">⏱️ Por Hora</option>
                <option value="halfhourly">⏳ Por Meia Hora</option>
              </select>
            </div>
            
            <div className="h-[150px] w-full">
              {renderSvgBarChart(activeChartData)}
            </div>
          </div>

          {/* Card 2: Resumo Financeiro (col-span-1) */}
          <div className="glass p-4 rounded-lg border border-slate-800 flex flex-col justify-between min-h-[220px]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
                📊 Resumo Financeiro
              </span>
              <span className="text-[8px] text-green-400 font-bold font-mono">
                {stats.totalClosed} Operações
              </span>
            </div>
            
            <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800 font-mono text-[9px] space-y-1 my-auto">
              <div className="flex justify-between">
                <span className="text-slate-400">Ganhos Brutos:</span>
                <span className="text-green-400 font-bold">
                  +${stats.grossProfitUSD.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Perdas Brutas:</span>
                <span className="text-red-400 font-bold">
                  -${stats.grossLossUSD.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="border-t border-slate-800/80 my-1"></div>
              <div className="flex justify-between text-[10px] font-bold">
                <span>Resultado Líquido:</span>
                <span className={stats.totalUSD >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {stats.totalUSD >= 0 ? '+' : ''}${stats.totalUSD.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-[8px] text-slate-500">
                <span>Média por Trade:</span>
                <span className={avgTradeUSD >= 0 ? 'text-green-400/80' : 'text-red-400/80'}>
                  {avgTradeUSD >= 0 ? '+' : ''}${avgTradeUSD.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Visão 2: Trading Calendar (Conforme imagem) */}
      {performanceView === 'calendar' && (
        <div className="glass p-4 rounded-xl border border-slate-800 space-y-3 animate-fade-in shadow-xl">
          {/* Header do Calendário */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-wider uppercase text-white font-mono flex items-center gap-1.5">
                📅 TRADING CALENDAR
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/25 font-mono">
                PNL LÍQUIDO
              </span>
            </div>

            {/* Controles de Navegação de Mês */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-900 border border-slate-750 rounded-lg p-0.5 shadow-inner">
                <button
                  type="button"
                  onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                  className="px-2 py-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition font-mono font-bold cursor-pointer"
                  title="Mês Anterior"
                >
                  ◀
                </button>
                <span className="px-3 text-xs font-bold text-slate-200 capitalize font-mono">
                  {calendarData.monthName} de {calendarData.year}
                </span>
                <button
                  type="button"
                  onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                  className="px-2 py-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition font-mono font-bold cursor-pointer"
                  title="Próximo Mês"
                >
                  ▶
                </button>
              </div>

              <button
                type="button"
                onClick={() => setCalendarMonth(getSaoPauloDate())}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-[10px] text-slate-300 hover:text-white rounded border border-slate-750 transition font-bold cursor-pointer font-sans"
              >
                Mês Atual
              </button>
            </div>
          </div>

          {/* Resumo Consolidado do Mês Selecionado */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
            <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
              <span className="text-slate-500 text-[9px] block uppercase font-bold">PNL DO MÊS:</span>
              <span className={`font-black text-sm ${calendarData.monthNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {calendarData.monthNetPnl >= 0 ? '+' : ''}${calendarData.monthNetPnl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
              <span className="text-slate-500 text-[9px] block uppercase font-bold">DIAS POSITIVOS:</span>
              <span className="font-bold text-emerald-400 text-sm">{calendarData.winningDaysCount} dias</span>
            </div>
            <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
              <span className="text-slate-500 text-[9px] block uppercase font-bold">DIAS NEGATIVOS:</span>
              <span className="font-bold text-rose-400 text-sm">{calendarData.losingDaysCount} dias</span>
            </div>
            <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
              <span className="text-slate-500 text-[9px] block uppercase font-bold">TOTAL TRADES:</span>
              <span className="font-bold text-indigo-300 text-sm">{calendarData.totalTradesInMonth}</span>
            </div>
          </div>

          {/* Grid do Calendário */}
          <div className="grid grid-cols-7 gap-1.5 pt-1">
            {/* Cabeçalhos dos Dias da Semana */}
            {[
              { pt: 'DOM', en: 'SUN' },
              { pt: 'SEG', en: 'MON' },
              { pt: 'TER', en: 'TUE' },
              { pt: 'QUA', en: 'WED' },
              { pt: 'QUI', en: 'THU' },
              { pt: 'SEX', en: 'FRI' },
              { pt: 'SÁB', en: 'SAT' }
            ].map((col, idx) => (
              <div key={idx} className="text-center py-1 border-b border-slate-800/60">
                <span className="text-[10px] font-black text-slate-400 uppercase font-mono block">
                  {col.pt}
                </span>
                <span className="text-[7.5px] font-bold text-slate-600 uppercase font-mono block">
                  {col.en}
                </span>
              </div>
            ))}

            {/* Células Vazias antes do dia 1 */}
            {Array.from({ length: calendarData.firstDayOfWeek }).map((_, idx) => (
              <div key={`empty-${idx}`} className="min-h-[78px] rounded-lg bg-slate-950/20 border border-slate-900/30 opacity-20" />
            ))}

            {/* Células de cada dia do mês */}
            {Array.from({ length: calendarData.daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const data = calendarData.dayMap.get(day);
              const hasTrades = Boolean(data && data.tradesCount > 0);
              const pnl = data?.pnl || 0;
              const isPositive = pnl > 0;
              const isNegative = pnl < 0;
              const totalClosed = (data?.gainsCount || 0) + (data?.stopsCount || 0);
              const winRate = totalClosed > 0 ? ((data?.gainsCount || 0) / totalClosed) * 100 : 0;

              const y = calendarData.year;
              const m = String(calendarData.month + 1).padStart(2, '0');
              const d = String(day).padStart(2, '0');
              const dayDateStr = `${y}-${m}-${d}`;
              const isSelected = startDate === dayDateStr && endDate === dayDateStr;

              const today = getTradingSessionDate(new Date(), settings?.global_cycle_start || '20:00:00');
              const isToday = today.getFullYear() === y && today.getMonth() === calendarData.month && today.getDate() === day;

              return (
                <div
                  key={day}
                  onClick={() => hasTrades && handleSelectCalendarDay(day)}
                  className={`min-h-[82px] p-2 rounded-lg flex flex-col justify-between transition-all select-none ${
                    hasTrades ? 'cursor-pointer hover:scale-[1.02] shadow-sm' : 'opacity-85'
                  } ${
                    isSelected
                      ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-950'
                      : ''
                  } ${
                    hasTrades
                      ? isPositive
                        ? 'bg-emerald-950/35 border border-emerald-500/40 hover:bg-emerald-900/40'
                        : isNegative
                        ? 'bg-rose-950/35 border border-rose-500/40 hover:bg-rose-900/40'
                        : 'bg-slate-900/60 border border-slate-750/70 hover:bg-slate-850'
                      : 'bg-slate-950/40 border border-slate-800/40'
                  }`}
                  title={hasTrades ? `Clique para filtrar trades do dia ${day}/${calendarData.month + 1}` : undefined}
                >
                  {/* Topo: Número do Dia */}
                  <div className="flex justify-between items-start">
                    <span className={`text-[11px] font-black font-mono ${
                      isToday 
                        ? 'bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center -ml-0.5 -mt-0.5 shadow-sm' 
                        : hasTrades 
                        ? 'text-slate-200' 
                        : 'text-slate-500'
                    }`}>
                      {day}
                    </span>
                    {hasTrades && (
                      <span className="text-[8px] font-mono text-slate-400 font-bold bg-slate-900/80 px-1 py-0.2 rounded border border-slate-800">
                        {data?.tradesCount}T
                      </span>
                    )}
                  </div>

                  {/* Centro: PnL em Destaque */}
                  {hasTrades ? (
                    <div className="text-center my-auto py-1">
                      <div className={`text-xs sm:text-sm font-black font-mono tracking-tight ${
                        isPositive ? 'text-emerald-400' : isNegative ? 'text-rose-400' : 'text-slate-300'
                      }`}>
                        {isPositive ? '+' : ''}${pnl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className={`text-[8.5px] font-mono font-bold mt-0.5 ${
                        winRate >= 50 ? 'text-emerald-400/80' : 'text-rose-400/80'
                      }`}>
                        {winRate.toFixed(0)}%
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-[10px] text-slate-600 font-mono my-auto">
                      -
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Painel Tabela de Operações */}
      <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 shadow-md space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <span className="text-xs font-bold text-white uppercase font-mono block">
            📋 Registros de Sinais ({filteredReports.length})
          </span>
          {filteredReports.length > 0 && (
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-2.5 py-1 bg-blue-950/45 hover:bg-blue-600 text-blue-450 hover:text-white rounded border border-blue-500/30 transition text-[9px] font-bold font-mono uppercase flex items-center gap-1 cursor-pointer"
              title="Exportar registros filtrados para CSV"
            >
              📥 Exportar CSV
            </button>
          )}
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          {isLoadingReports ? (
            <div className="py-12 text-center text-slate-500 font-mono text-[10px] uppercase">
              Carregando relatório do Supabase...
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="py-12 text-center text-slate-500 font-mono text-[10px] uppercase">
              Nenhuma operação encontrada com os filtros selecionados.
            </div>
          ) : (
            <>
              <table className="w-full text-[10px] font-mono text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase font-bold font-mono">
                  <th className="py-2 px-3">Data/Hora</th>
                  <th className="py-2 px-3">Conta</th>
                  <th className="py-2 px-3">Ativo / Instrumento</th>
                  <th className="py-2 px-3">Estratégia</th>
                  <th className="py-2 px-3">Operação</th>
                  <th className="py-2 px-3 text-center">Contrato</th>
                  <th className="py-2 px-3 text-center">Entrada</th>
                  <th className="py-2 px-3 text-center">Metas (Stop / Alvo)</th>
                  <th className="py-2 px-3 text-center">Saída</th>
                  <th className="py-2 px-3 text-center">Status</th>
                  <th className="py-2 px-3 text-right">Resultado</th>
                  <th className="py-2 px-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60">
                {paginatedReports.map((r) => {
                  const { pts, usdVal, isGain, isStop, isSynchronized } = getReportResult(r);
                  const contractCount = r.contrato !== undefined && r.contrato !== null ? Number(r.contrato) : 1;
                  
                  const isPending = r.status === 'Em Andamento';
                  const isCancelled = r.status === 'Cancelado';

                  const isStopWithGain = isStop && pts > 0;
                  const isCancelledWithGain = isCancelled && pts > 0;
                  const isProfitable = isGain || isStopWithGain || isCancelledWithGain;

                  const acc = accounts.find(a => a.id === r.account_id);

                  // Badge de Operação
                  const sideBadge = r.side === 'COMPRA'
                    ? 'text-green-400 font-bold bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded'
                    : 'text-red-400 font-bold bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded';

                  // Badge de Status
                  const isSyncAndOffline = isPending && isSynchronized && (ninjaStatus === 'offline' || !ninjaGatewayOnline);
                  const statusText = isSyncAndOffline
                    ? 'Sincronização'
                    : isStopWithGain
                    ? 'Fechamento Parcial'
                    : isCancelledWithGain
                    ? 'Fechamento Parcial'
                    : r.status;
                  const statusBadge = isSyncAndOffline
                    ? 'text-amber-400 font-bold bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded animate-pulse'
                    : isProfitable
                    ? 'text-green-400 font-bold bg-green-500/15 border border-green-500/30 px-1.5 py-0.5 rounded'
                    : isStop
                    ? 'text-red-400 font-bold bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 rounded'
                    : isPending
                    ? 'text-yellow-400 font-bold bg-yellow-500/15 border border-yellow-500/30 px-1.5 py-0.5 rounded animate-pulse'
                    : 'text-slate-400 bg-slate-500/10 border border-slate-500/20 px-1.5 py-0.5 rounded';

                  return (
                    <tr key={r.id} className="hover:bg-slate-900/20 transition">
                      
                      {/* Data/Hora */}
                      <td className="py-2 px-3 text-slate-300">
                        {formatSaoPauloDate(getCleanReportDate(r.created_at, isSynchronized))}{' '}
                        {formatSaoPauloTime(getCleanReportDate(r.created_at, isSynchronized), true)}
                      </td>

                      {/* Conta */}
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                          🏦 {acc ? acc.account_name : (r.account_name || 'Demo Principal')}
                          {r.is_copy_trade && (
                            <span className="text-[8px] text-amber-300 bg-amber-950/60 px-1 rounded">COPY</span>
                          )}
                        </span>
                      </td>

                      {/* Ativo / Instrumento */}
                      <td className="py-2 px-3">
                        {(() => {
                          const isNt8 = Boolean(
                            acc?.platform === 'nt8' ||
                            acc?.send_localhost ||
                            r.strategy_name === 'Execução NT8' ||
                            (r.description && (r.description.includes('NinjaTrader') || r.description.includes('Direct'))) ||
                            isSynchronized
                          );

                          let rawSymbol = r.symbol || '';
                          if (!rawSymbol && r.description) {
                            const match = r.description.match(/\[(.*?)\]/);
                            if (match && match[1]) rawSymbol = match[1];
                          }

                          const matchedPanel = panels.find(p => 
                            p.name.toLowerCase() === rawSymbol.toLowerCase() || 
                            p.instance_id.toLowerCase() === rawSymbol.toLowerCase()
                          );

                          if (isNt8) {
                            return (
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1">
                                  <span className="font-bold text-blue-400 font-mono text-[10.5px]">
                                    {rawSymbol || 'NT8'}
                                  </span>
                                  <span className="text-[7.5px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
                                    NT8
                                  </span>
                                </div>
                                {matchedPanel && matchedPanel.name.toLowerCase() !== rawSymbol.toLowerCase() && (
                                  <span className="text-[7.5px] text-slate-500 font-mono truncate max-w-[100px]" title={`Painel correspondente: ${matchedPanel.name}`}>
                                    Painel: {matchedPanel.name}
                                  </span>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-purple-300 font-mono text-[10.5px]">
                                {matchedPanel?.name || rawSymbol || 'PAINEL'}
                              </span>
                              <span className="text-[7.5px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                                PAINEL
                              </span>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Nome Estratégia */}
                      <td className="py-2 px-3 text-white font-semibold">
                        <span className="block truncate max-w-[140px]" title={r.strategy_name}>
                          {r.strategy_name}
                        </span>
                        {r.strategy_id && (
                          <span
                            className="inline-block text-[7.5px] bg-slate-900 border border-purple-800/40 text-purple-300 font-mono px-1 py-0.2 rounded truncate max-w-[130px] cursor-pointer hover:border-purple-400 hover:text-purple-200 transition"
                            title={`ID da Estratégia: ${r.strategy_id} (Clique para copiar)`}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(r.strategy_id!);
                              alert(`ID da Estratégia "${r.strategy_id}" copiado!`);
                            }}
                          >
                            📋 {r.strategy_id}
                          </span>
                        )}
                        {r.description && (
                          <span className="block text-[8px] text-slate-500 truncate max-w-[140px]" title={r.description}>
                            {r.description}
                          </span>
                        )}
                      </td>

                      {/* Operação */}
                      <td className="py-2 px-3">
                        <span className={sideBadge}>{r.side}</span>
                      </td>

                      {/* Contrato */}
                      <td className="py-2 px-3 text-center text-slate-350 font-semibold font-mono">
                        {contractCount}
                      </td>

                      {/* Entrada */}
                      <td className="py-2 px-3 text-center">
                        <div className="text-slate-200 font-bold">{Number(r.entry_price).toFixed(2)}</div>
                        <div className="text-[8.5px] text-slate-400 font-mono">
                          🕒 {formatSaoPauloTime(getCleanReportDate(r.created_at, isSynchronized), true)}
                        </div>
                      </td>

                      {/* Metas */}
                      <td className="py-2 px-3 text-center font-mono">
                        <div className="flex justify-center items-center gap-1.5">
                          <span className="text-red-400 font-semibold" title="Stop Loss">
                            {r.stop_loss ? Number(r.stop_loss).toFixed(2) : '--'}
                          </span>
                          <span className="text-slate-600">/</span>
                          <span className="text-green-400 font-semibold" title="Take Profit">
                            {r.take_profit ? Number(r.take_profit).toFixed(2) : '--'}
                          </span>
                        </div>
                      </td>

                      {/* Saída */}
                      <td className="py-2 px-3 text-center">
                        <div className="text-slate-200 font-bold">{r.exit_price ? Number(r.exit_price).toFixed(2) : '--'}</div>
                        {r.closed_at && (
                          <div className="text-[8.5px] text-slate-400 font-mono">
                            🕒 {formatReportExitTime(getCleanReportDate(r.closed_at, isSynchronized), getCleanReportDate(r.created_at, isSynchronized), true)}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-2 px-3 text-center">
                        <span className={statusBadge}>{statusText}</span>
                      </td>

                      {/* Resultado */}
                      <td className={`py-2 px-3 text-right font-black ${isProfitable ? 'text-green-400' : isStop || (isCancelled && pts < 0) ? 'text-red-400' : 'text-slate-500'}`}>
                        {isPending || (isCancelled && r.exit_price === null) ? (
                          '--'
                        ) : (
                          <>
                            <div className="flex items-center justify-end gap-1">
                              {isSynchronized && (
                                <span className="text-[7.5px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono font-normal border border-blue-500/30" title="Resultado apurado diretamente na sincronização da corretora/NT8">
                                  NT8
                                </span>
                              )}
                              <span>{pts >= 0 ? '+' : ''}{pts.toFixed(1)} pts</span>
                            </div>
                            <div className="text-[8px] font-bold">
                              {usdVal >= 0 ? '+' : ''}${usdVal.toFixed(2)}
                            </div>
                          </>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="py-2 px-3 text-center">
                        <div className="flex justify-center gap-1.5">
                          {isPending && (
                            <button
                              type="button"
                              onClick={() => handleCloseReport(r.id)}
                              className="px-1.5 py-0.5 bg-yellow-950/40 hover:bg-yellow-900/60 text-yellow-400 font-semibold rounded border border-yellow-900/30 transition text-[9px] uppercase"
                            >
                              Encerrar
                            </button>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-900/60 text-[10px] font-mono mt-4">
                <span className="text-slate-400 text-center sm:text-left">
                  Mostrando <span className="font-bold text-white">{displayStart}</span> a <span className="font-bold text-white">{displayEnd}</span> de <span className="font-bold text-white">{filteredReports.length}</span> registros
                </span>
                <div className="flex items-center gap-1 flex-wrap justify-center sm:justify-end">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer font-bold"
                  >
                    Anterior
                  </button>
                  {getPageNumbers().map(page => {
                    const isSelected = page === currentPage;
                    const rangeStart = (page - 1) * 25 + 1;
                    const rangeEnd = Math.min(page * 25, filteredReports.length);
                    return (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`px-2.5 py-1 rounded border transition cursor-pointer font-bold ${
                          isSelected
                            ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                        title={`Página ${page} (${rangeStart} a ${rangeEnd})`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-450 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer font-bold"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        </div>

      </div>

    </div>
  );
};
