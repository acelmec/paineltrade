import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { checkNinjaStatus, fetchNinjaPositionsAndOrders } from '../services/ninjaGateway';
import { mirrorToLocalServer, isNinjaExecutionAccount, isSameAsset, resolvePanelPointValue } from '../services/db';
import { formatSaoPauloDate, formatSaoPauloTime, formatReportExitTime } from '../utils/date';

export const TradeDock: React.FC = () => {
  const {
    reports,
    setReports,
    deleteReportAction,
    deleteMultipleReportsAction,
    updateReportAction,
    accounts,
    activeAccount,
    panels,
    activePanel,
    accountStrategies,
    systemLogs,
    clearLogs,
    settings,
    allSettings,
    marketData,
    getPanelPrice
  } = useApp() as any;

  const [activeTab, setActiveTab] = useState<'active_orders' | 'pending_orders' | 'history' | 'robots' | 'logs'>('active_orders');
  const [historyAccountFilter, setHistoryAccountFilter] = useState<string>('ALL');

  const userAccountIds = React.useMemo(() => new Set((accounts || []).map((a: any) => a.id)), [accounts]);

  // Helper para obter o nome real do ATIVO (e não o nome do painel)
  const getSymbol = (r: any) => {
    // 1. Tentar encontrar o painel vinculado pelo panel_id ou instance_id
    let panel = panels?.find((p: any) => p.id === r.panel_id || p.instance_id === r.instance_id);
    
    // Fallback: Tentar extrair o nome do ativo dos colchetes na descrição "[S&P 500] ..."
    if (!panel && r.description) {
      const match = r.description.match(/\[(.*?)\]/);
      if (match && match[1]) {
        const pName = match[1].toLowerCase().replace(/[^a-z0-9]/g, '');
        panel = panels?.find((p: any) => p.name.toLowerCase().replace(/[^a-z0-9]/g, '') === pName);
      }
    }

    if (panel) {
      const panelSettings = allSettings?.[panel.id];
      if (panelSettings?.gamma_symbol) return panelSettings.gamma_symbol;
      if (panel.gamma_symbol) return panel.gamma_symbol;
      if (panel.symbol) return panel.symbol;

      const norm = (panel.name || panel.instance_id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (norm.includes('sp500') || norm.includes('sp') || norm.includes('es')) return 'ES';
      if (norm.includes('nasdaq') || norm.includes('nq')) return 'NQ';
      if (norm.includes('gold') || norm.includes('ouro') || norm.includes('gc')) return 'GC';
      if (norm.includes('oil') || norm.includes('petr') || norm.includes('cl')) return 'CL';
      if (norm.includes('dxy') || norm.includes('usdindex')) return 'DXY';
      if (panel.name) return panel.name;
    }

    // Se houver nome no colchete da descrição
    if (r.description) {
      const match = r.description.match(/\[(.*?)\]/);
      if (match && match[1]) {
        const norm = match[1].toLowerCase().replace(/[^a-z0-9]/g, '');
        if (norm.includes('sp500') || norm.includes('sp') || norm.includes('es')) return 'ES';
        if (norm.includes('nasdaq') || norm.includes('nq')) return 'NQ';
        if (norm.includes('gold') || norm.includes('ouro') || norm.includes('gc')) return 'GC';
        if (norm.includes('oil') || norm.includes('petr') || norm.includes('cl')) return 'CL';
        if (norm.includes('dxy') || norm.includes('usdindex')) return 'DXY';
        return match[1];
      }
    }

    if (r.symbol && r.symbol !== '--') return r.symbol;
    if (r.asset && r.asset !== '--') return r.asset;

    return activePanel?.gamma_symbol || activePanel?.symbol || activePanel?.name || 'NQ';
  };

  // Helper para formatar data (DD/MM/AA) no fuso de São Paulo
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    return formatSaoPauloDate(dateStr) || '-';
  };

  // Helper para formatar hora no fuso de São Paulo
  const formatTime = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    return formatSaoPauloTime(dateStr, true) || '-';
  };

  const [ninjaPositions, setNinjaPositions] = useState<any[]>([]);
  const [ninjaOnline, setNinjaOnline] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    const poll = async () => {
      try {
        const st = await checkNinjaStatus();
        if (!isMounted) return;
        const isOnline = st.status === 'online';
        setNinjaOnline(isOnline);
        if (isOnline) {
          const { positions } = await fetchNinjaPositionsAndOrders();
          if (isMounted) setNinjaPositions(positions || []);
        } else {
          if (isMounted) setNinjaPositions([]);
        }
      } catch {
        if (isMounted) {
          setNinjaOnline(false);
          setNinjaPositions([]);
        }
      }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // 1. Ordens Ativas (Em Andamento / No Mercado) - apenas contas do usuário
  // Contas demo exibem ordens simuladas por candle. Contas sincronizadas NT8 exibem posições reais do NT8 (se online) ou ordens em andamento como "Sincronização" (se offline/corte momentâneo).
  const activeOrders = useMemo(() => {
    const demoOrders = (reports || []).filter((r: any) => {
      if (r.status !== 'Em Andamento') return false;
      if (r.strategy_name === 'Execução NT8') return false;
      if (userAccountIds.size > 0 && r.account_id && !userAccountIds.has(r.account_id)) return false;

      const acc = accounts?.find((a: any) => a.id === r.account_id);
      if (isNinjaExecutionAccount(acc)) return false;
      return true;
    }).map((r: any) => {
      const entry = Number(r.entry_price || 0);
      const contracts = Number(r.contrato || r.quantity || 1);

      let matchedPanel = panels?.find((p: any) => p.id === r.panel_id || p.instance_id === r.instance_id);
      if (!matchedPanel && r.description) {
        const match = r.description.match(/\[(.*?)\]/);
        if (match && match[1]) {
          const cleanName = match[1].toLowerCase().replace(/[^a-z0-9]/g, '');
          matchedPanel = panels?.find((p: any) =>
            (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === cleanName ||
            (p.instance_id || '').toLowerCase().replace(/[^a-z0-9]/g, '') === cleanName
          );
        }
      }
      if (!matchedPanel && r.symbol) {
        const cleanSym = r.symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
        matchedPanel = panels?.find((p: any) =>
          (p.symbol || '').toLowerCase().replace(/[^a-z0-9]/g, '') === cleanSym ||
          (p.gamma_symbol || '').toLowerCase().replace(/[^a-z0-9]/g, '') === cleanSym ||
          (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanSym)
        );
      }
      if (!matchedPanel) {
        matchedPanel = activePanel;
      }

      let curPrice = 0;
      if (typeof getPanelPrice === 'function') {
        curPrice = getPanelPrice(r.panel_id, r.symbol);
      }
      if (!curPrice || curPrice <= 0) {
        curPrice = Number(marketData?.price || 0);
      }

      let unrealized_pnl: number | undefined = undefined;
      let unrealized_points: number | undefined = undefined;

      if (curPrice > 0 && entry > 0) {
        const pts = r.side === 'COMPRA' ? (curPrice - entry) : (entry - curPrice);
        const panelSettings = matchedPanel ? allSettings?.[matchedPanel.id] : settings;
        const pointVal = resolvePanelPointValue(matchedPanel, panelSettings || settings);
        unrealized_points = pts;
        unrealized_pnl = pts * contracts * pointVal;
      }

      return {
        ...r,
        current_price: curPrice > 0 ? curPrice : undefined,
        unrealized_points,
        unrealized_pnl
      };
    });

    // Posições reais vindas do NinjaTrader para as contas sincronizadas conectadas
    const realNinjaOrders = (ninjaPositions || []).map((pos: any) => {
      const acc = accounts?.find((a: any) => a.account_name?.trim().toLowerCase() === pos.account?.trim().toLowerCase());
      if (!acc) return null;
      return {
        id: `nt_pos_${pos.account}_${pos.symbol}`,
        is_ninja_real: true,
        account_name: pos.account,
        account_id: acc.id,
        symbol: pos.symbol,
        strategy_name: 'Execução NinjaTrader',
        side: pos.marketPosition === 'BUY' ? 'COMPRA' : 'VENDA',
        entry_price: pos.averagePrice,
        unrealized_pnl: pos.unrealizedPnL,
        contrato: pos.quantity,
        quantity: pos.quantity,
        status: 'Em Andamento',
        created_at: new Date().toISOString()
      };
    }).filter(Boolean);

    // Se o NinjaTrader estiver offline ou sem posições ao vivo reportadas,
    // preservar as ordens em andamento das contas sincronizadas registradas com status 'Sincronização'
    const syncPendingOrders = (reports || []).filter((r: any) => {
      if (r.status !== 'Em Andamento') return false;
      if (userAccountIds.size > 0 && r.account_id && !userAccountIds.has(r.account_id)) return false;

      const acc = accounts?.find((a: any) => a.id === r.account_id);
      if (!isNinjaExecutionAccount(acc)) return false;

      // Se já está sendo exibida via realNinjaOrders, não duplicar
      const isAlreadyInReal = realNinjaOrders.some(ro => ro && ro.account_id === r.account_id && isSameAsset(ro.symbol, r.symbol));
      return !isAlreadyInReal;
    }).map((r: any) => ({
      ...r,
      is_syncing: !ninjaOnline || realNinjaOrders.length === 0
    }));

    return [...demoOrders, ...realNinjaOrders, ...syncPendingOrders];
  }, [reports, ninjaPositions, accounts, userAccountIds, ninjaOnline, panels, activePanel, settings, allSettings, marketData, getPanelPrice]);

  // 2. Ordens Pendentes (Limit / Stop ainda não acionadas) - apenas contas do usuário
  const pendingOrders = (reports || []).filter((r: any) => {
    if ((r.status as any) !== 'Pendente') return false;
    if (userAccountIds.size > 0 && r.account_id) return userAccountIds.has(r.account_id);
    return true;
  });
  
  // 3. Histórico
  const finishedHistoryAll = (reports || []).filter((r: any) => {
    const isFinished = (r.status as any) === 'Encerrado' || r.status === 'Gain' || r.status === 'Stop' || (r.status as any) === 'Loss' || r.status === 'Cancelado';
    if (!isFinished) return false;
    if (userAccountIds.size > 0 && r.account_id) return userAccountIds.has(r.account_id);
    return true;
  });
  const finishedHistoryFiltered = finishedHistoryAll.filter((r: any) => {
    if (historyAccountFilter === 'ALL') return true;
    return r.account_id === historyAccountFilter;
  });

  // Action: Clear entire finished history
  const handleClearAllHistory = async () => {
    if (finishedHistoryFiltered.length === 0) return;
    if (!window.confirm(`Deseja excluir permanentemente ${finishedHistoryFiltered.length} registros do histórico?`)) return;
    try {
      const ids = finishedHistoryFiltered.map((r: any) => r.id);
      if (deleteMultipleReportsAction) {
        await deleteMultipleReportsAction(ids);
      } else if (deleteReportAction) {
        for (const id of ids) {
          await deleteReportAction(id);
        }
      }
    } catch (e) {
      console.error('Erro ao limpar histórico:', e);
    }
  };

  // Silenciar aviso do compilador para handleClearAllHistory se reservado para botão futuro
  if (false as boolean) { handleClearAllHistory(); }

  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    return settings?.chart_color_theme || localStorage.getItem('vortex_chart_theme') || 'black';
  });

  React.useEffect(() => {
    if (settings?.chart_color_theme) setCurrentTheme(settings.chart_color_theme);
    const handleThemeChange = (e: any) => {
      if (e.detail?.theme) setCurrentTheme(e.detail.theme);
    };
    window.addEventListener('vortex_chart_theme_changed', handleThemeChange);
    return () => window.removeEventListener('vortex_chart_theme_changed', handleThemeChange);
  }, [settings?.chart_color_theme]);

  const isBlackTheme = currentTheme === 'black' || currentTheme === 'ninja_black';
  const isSlateTheme = currentTheme === 'slate' || currentTheme === 'cinza_escuro' || currentTheme === 'ninja_slate';
  const isMidnightTheme = currentTheme === 'midnight' || currentTheme === 'azul_noturno' || currentTheme === 'ninja_carbon' || currentTheme === 'ninja_midnight';
  const isLightTheme = currentTheme === 'light' || currentTheme === 'cinza_grafite' || currentTheme === 'ninja_light';

  const dRootBg = isBlackTheme
    ? 'bg-[#000000] border-zinc-800 text-white'
    : isSlateTheme
    ? 'bg-[#1a1f2c] border-slate-700 text-slate-100'
    : isMidnightTheme
    ? 'bg-[#070e20] border-blue-900/60 text-slate-100'
    : 'bg-[#1a1f2c] border-slate-700 text-slate-100'; // Restante em Cinza Grafite

  const dTabsBg = isBlackTheme
    ? 'bg-[#09090b] border-zinc-800'
    : isSlateTheme
    ? 'bg-[#222838] border-slate-700'
    : isMidnightTheme
    ? 'bg-[#0d1a38] border-blue-900/60'
    : 'bg-[#222838] border-slate-700 text-slate-200';

  const dRowBorder = isBlackTheme ? 'border-zinc-900 hover:bg-zinc-900/40' : 'border-slate-800 hover:bg-slate-800/40';
  const dHeadText = 'text-slate-400';
  const dTableText = 'text-slate-100';
  const dTableSubText = 'text-slate-400';
  const dEmptyText = 'text-slate-400';

  // Action: Cancel or close an order
  const handleCancelOrder = async (orderItem: any) => {
    const name = orderItem.strategy_name || 'Operação';
    const accName = orderItem.account_name || 'Conta';
    if (settings?.chart_confirm_manual_trade !== false) {
      if (!window.confirm(`Deseja encerrar/zerar a operação "${name}" na conta "${accName}"?`)) return;
    }
    try {
      if (orderItem.is_ninja_real) {
        mirrorToLocalServer('/sinal_local/status', {
          account_name: orderItem.account_name,
          symbol: orderItem.symbol,
          status: 'Cancelado',
          action: 'flat'
        });

        // Localiza e encerra todos os relatórios 'Em Andamento' correspondentes para esta conta/ativo
        const matchingReports = (reports || []).filter((r: any) => 
          (r.account_name === orderItem.account_name || r.account_id === orderItem.account_id) &&
          isSameAsset(r.symbol, orderItem.symbol) &&
          r.status === 'Em Andamento'
        );

        if (matchingReports.length > 0) {
          const closedAt = new Date().toISOString();
          const closedIds = new Set(matchingReports.map((r: any) => r.id));
          if (setReports) {
            setReports((prev: any) => (prev || []).map((r: any) => 
              closedIds.has(r.id) ? { ...r, status: 'Cancelado', closed_at: closedAt } : r
            ));
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('vortex_reports_updated'));
          }
          for (const rep of matchingReports) {
            if (updateReportAction) {
              await updateReportAction(rep.id, 'Cancelado');
            }
          }
        }
      } else if (updateReportAction) {
        await updateReportAction(orderItem.id, 'Cancelado');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vortex_reports_updated'));
        }
      }
    } catch (e) {
      console.error('Erro ao cancelar ordem:', e);
    }
  };

  return (
    <div className={`w-full h-full ${dRootBg} border-t flex flex-col select-none overflow-hidden transition-colors duration-200`}>
      {/* Dock Header Tabs */}
      <div className={`flex items-center justify-between ${dTabsBg} border-b px-3 flex-shrink-0`}>
        <div className="flex gap-1 overflow-x-auto">
          {[
            { id: 'active_orders', label: 'Ordens Ativas', icon: '⚡', count: activeOrders.length },
            { id: 'pending_orders', label: 'Ordens Pendentes', icon: '📝', count: pendingOrders.length },
            { id: 'history', label: 'Histórico de Trades', icon: '📜', count: finishedHistoryFiltered.length },
            { id: 'logs', label: 'Mensagens do Sistema', icon: '💬', count: systemLogs?.length || 0 }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-500 font-bold bg-blue-500/10'
                  : (isLightTheme ? 'border-transparent text-slate-600 hover:text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-200')
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className="bg-blue-600 text-white font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className={`text-[10px] ${dHeadText} font-mono hidden md:block`}>
          MOTOR REALTIME DE EXECUÇÃO
        </div>
      </div>

      {/* Dock Content Panel */}
      <div className={`flex-1 p-3 overflow-y-auto font-mono text-xs ${isLightTheme ? 'text-slate-800' : 'text-slate-300'}`}>
        {/* TAB 1: ACTIVE ORDERS */}
        {activeTab === 'active_orders' && (
          <div className="h-full">
            {activeOrders.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={`border-b ${isLightTheme ? 'border-slate-300' : 'border-slate-800'} ${dHeadText} text-[11px]`}>
                    <th className="pb-2 font-semibold">DATA</th>
                    <th className="pb-2 font-semibold">CONTA</th>
                    <th className="pb-2 font-semibold">ATIVO</th>
                    <th className="pb-2 font-semibold">ESTRATÉGIA</th>
                    <th className="pb-2 font-semibold">OPERAÇÃO</th>
                    <th className="pb-2 font-semibold">HORA E</th>
                    <th className="pb-2 font-semibold">PREÇO E</th>
                    <th className="pb-2 font-semibold">HORA S</th>
                    <th className="pb-2 font-semibold">PREÇO S</th>
                    <th className="pb-2 font-semibold">RESULTADO</th>
                    <th className="pb-2 font-semibold text-right">AÇÃO</th>
                  </tr>
                </thead>
                <tbody>
                  {activeOrders.map((r: any) => {
                    const accName = accounts?.find((a: any) => a.id === r.account_id)?.account_name || activeAccount?.account_name || 'Conta Principal';
                    const assetSymbol = getSymbol(r);
                    const dataEntrada = formatDate(r.created_at || r.simulated_time);
                    const horaEntrada = formatTime(r.created_at || r.simulated_time);

                    return (
                      <tr key={r.id} className={`border-b ${dRowBorder} transition`}>
                        <td className={`py-2 ${dTableSubText} font-mono text-[11px]`}>{dataEntrada}</td>
                        <td className={`py-2 ${dTableText} font-bold`}>{accName}</td>
                        <td className={`py-2 ${dTableText} font-bold`}>{assetSymbol}</td>
                        <td className="py-2 font-bold text-blue-500">{r.strategy_name || 'Manual'}</td>
                        <td className="py-2">
                          <span className={`font-bold ${r.side === 'COMPRA' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {r.side}
                          </span>
                        </td>
                        <td className={`py-2 ${dTableSubText}`}>{horaEntrada}</td>
                        <td className={`py-2 font-bold ${dTableText}`}>{r.entry_price !== undefined && r.entry_price !== null ? Number(r.entry_price).toFixed(2) : '-'}</td>
                        <td className={`py-2 ${dHeadText}`}>-</td>
                        <td className={`py-2 ${dHeadText}`}>-</td>
                        <td className="py-2">
                          {r.is_syncing ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700 animate-pulse" title="Aguardando reconexão/sincronização com o NinjaTrader">
                              🔄 Sincronização
                            </span>
                          ) : r.unrealized_pnl !== undefined && !isNaN(Number(r.unrealized_pnl)) ? (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              Number(r.unrealized_pnl) >= 0
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
                            }`}>
                              {Number(r.unrealized_pnl) >= 0 ? '+' : ''}${Number(r.unrealized_pnl).toFixed(2)}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300 dark:border-blue-700">
                              Em Andamento
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => handleCancelOrder(r)}
                            className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold px-2 py-0.5 rounded transition cursor-pointer"
                            title="Encerrar esta operação ativa"
                          >
                            🛑 Zerar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className={`text-center py-6 ${dEmptyText} text-xs`}>
                Nenhuma ordem ativa ou posição aberta no momento.
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PENDING ORDERS (LIMIT / STOP NOT TRIGGERED) */}
        {activeTab === 'pending_orders' && (
          <div className="h-full">
            {pendingOrders.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={`border-b ${isLightTheme ? 'border-slate-300' : 'border-slate-800'} ${dHeadText} text-[11px]`}>
                    <th className="pb-2 font-semibold">DATA</th>
                    <th className="pb-2 font-semibold">CONTA</th>
                    <th className="pb-2 font-semibold">ATIVO</th>
                    <th className="pb-2 font-semibold">ESTRATÉGIA</th>
                    <th className="pb-2 font-semibold">OPERAÇÃO</th>
                    <th className="pb-2 font-semibold">HORA E</th>
                    <th className="pb-2 font-semibold">PREÇO E</th>
                    <th className="pb-2 font-semibold">HORA S</th>
                    <th className="pb-2 font-semibold">PREÇO S</th>
                    <th className="pb-2 font-semibold">RESULTADO</th>
                    <th className="pb-2 font-semibold text-right">AÇÃO</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingOrders.map((r: any) => {
                    const accName = accounts?.find((a: any) => a.id === r.account_id)?.account_name || activeAccount?.account_name || 'Conta Principal';
                    const assetSymbol = getSymbol(r);
                    const dataEntrada = formatDate(r.created_at || r.simulated_time);
                    const horaEntrada = formatTime(r.created_at || r.simulated_time);

                    return (
                      <tr key={r.id} className={`border-b ${dRowBorder} transition`}>
                        <td className={`py-2 ${dTableSubText} font-mono text-[11px]`}>{dataEntrada}</td>
                        <td className={`py-2 ${dTableText} font-bold`}>{accName}</td>
                        <td className={`py-2 ${dTableText} font-bold`}>{assetSymbol}</td>
                        <td className="py-2 font-bold text-amber-500">{r.strategy_name || 'Ordem Limite'}</td>
                        <td className="py-2">
                          <span className={`font-bold ${r.side === 'COMPRA' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {r.side}
                          </span>
                        </td>
                        <td className={`py-2 ${dTableSubText}`}>{horaEntrada}</td>
                        <td className={`py-2 font-bold text-amber-500`}>{r.entry_price !== undefined && r.entry_price !== null ? Number(r.entry_price).toFixed(2) : '-'}</td>
                        <td className={`py-2 ${dHeadText}`}>-</td>
                        <td className={`py-2 ${dHeadText}`}>-</td>
                        <td className="py-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                            Pendente
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => handleCancelOrder(r)}
                            className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold px-2 py-0.5 rounded transition cursor-pointer"
                            title="Cancelar esta ordem pendente"
                          >
                            ✕ Cancelar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className={`text-center py-6 ${dEmptyText} text-xs`}>
                Nenhuma ordem pendente (Limit / Stop) aguardando execução.
              </div>
            )}
          </div>
        )}

        {/* TAB 3: FILL HISTORY */}
        {activeTab === 'history' && (
          <div className="h-full space-y-2">
            {/* Filter and Clear History Header Bar */}
            <div className={`flex justify-between items-center ${isLightTheme ? 'bg-slate-100 border-slate-300' : 'bg-slate-950/60 border-slate-800/80'} p-2 rounded-lg border mb-2`}>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] ${dHeadText} font-bold`}>Filtrar por Conta:</span>
                <select
                  value={historyAccountFilter}
                  onChange={(e) => setHistoryAccountFilter(e.target.value)}
                  className={`${isLightTheme ? 'bg-white text-slate-900 border-slate-300' : 'bg-slate-900 text-white border-slate-700'} border rounded text-xs px-2 py-1 outline-none cursor-pointer`}
                >
                  <option value="ALL">🌐 Todas as Contas ({finishedHistoryAll.length})</option>
                  {accounts?.map((acc: any) => (
                    <option key={acc.id} value={acc.id}>
                      🏦 {acc.account_name} ({(acc as any).broker || acc.account_type})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {finishedHistoryFiltered.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={`border-b ${isLightTheme ? 'border-slate-300' : 'border-slate-800'} ${dHeadText} text-[11px]`}>
                    <th className="pb-2 font-semibold">DATA</th>
                    <th className="pb-2 font-semibold">CONTA</th>
                    <th className="pb-2 font-semibold">ATIVO</th>
                    <th className="pb-2 font-semibold">ESTRATÉGIA</th>
                    <th className="pb-2 font-semibold">OPERAÇÃO</th>
                    <th className="pb-2 font-semibold">HORA E</th>
                    <th className="pb-2 font-semibold">PREÇO E</th>
                    <th className="pb-2 font-semibold">HORA S</th>
                    <th className="pb-2 font-semibold">PREÇO S</th>
                    <th className="pb-2 font-semibold text-right">RESULTADO</th>
                  </tr>
                </thead>
                <tbody>
                  {finishedHistoryFiltered.map((r: any) => {
                    const accName = accounts?.find((a: any) => a.id === r.account_id)?.account_name || 'Conta Demo';
                    const assetSymbol = getSymbol(r);
                    const dataEntrada = formatDate(r.created_at || r.simulated_time);
                    const horaEntrada = formatTime(r.created_at || r.simulated_time);
                    const horaSaida = formatReportExitTime(r.closed_at || r.exit_time || r.updated_at, r.created_at || r.simulated_time, true);
                    
                    const entry = Number(r.entry_price || 0);
                    const exit = Number(r.exit_price || 0);
                    const pts = exit > 0 && entry > 0 ? (r.side === 'COMPRA' ? exit - entry : entry - exit) : 0;
                    const isGain = r.status === 'Gain' || (pts > 0 && r.status !== 'Cancelado');
                    const isCancelled = r.status === 'Cancelado' && !r.exit_price;

                    return (
                      <tr key={r.id} className={`border-b ${dRowBorder} transition`}>
                        <td className={`py-2 ${dTableSubText} font-mono text-[11px]`}>{dataEntrada}</td>
                        <td className={`py-2 ${dTableText} font-bold`}>{accName}</td>
                        <td className={`py-2 ${dTableText} font-bold`}>{assetSymbol}</td>
                        <td className={`py-2 font-bold ${dTableText}`}>{r.strategy_name || 'Manual'}</td>
                        <td className="py-2">
                          <span className={`font-bold ${r.side === 'COMPRA' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {r.side}
                          </span>
                        </td>
                        <td className={`py-2 ${dTableSubText}`}>{horaEntrada}</td>
                        <td className={`py-2 font-bold ${dTableText}`}>{r.entry_price !== undefined && r.entry_price !== null ? Number(r.entry_price).toFixed(2) : '-'}</td>
                        <td className={`py-2 ${dTableSubText}`}>{horaSaida}</td>
                        <td className={`py-2 font-bold ${dTableText}`}>{r.exit_price !== undefined && r.exit_price !== null ? Number(r.exit_price).toFixed(2) : '-'}</td>
                        <td className="py-2 text-right font-bold">
                          {isCancelled ? (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
                              Cancelado
                            </span>
                          ) : isGain ? (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                              Gain ({pts > 0 ? `+${pts.toFixed(1)}` : '0.0'} pts)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                              Loss ({pts !== 0 ? `${pts.toFixed(1)}` : '0.0'} pts)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className={`text-center py-6 ${dEmptyText} text-xs`}>
                Nenhum histórico de execuções encontrado para o filtro selecionado.
              </div>
            )}
          </div>
        )}

        {/* TAB 4: AI ROBOTS & PROMPTS */}
        {activeTab === 'robots' && (
          <div className="space-y-2">
            {accountStrategies && accountStrategies.length > 0 ? (
              accountStrategies.map((strat: any) => (
                <div key={strat.id} className="flex items-center justify-between p-2.5 bg-slate-900/80 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <div>
                      <h5 className="font-bold text-white text-xs">{strat.strategy_name || 'Robô de IA Vortex'}</h5>
                      <span className="text-[10px] text-slate-400">Status: Monitorando Sinais e Análises Automáticas</span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold">
                    ⚡ ATIVO
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-slate-500 text-xs font-mono">
                Nenhum Robô de IA ou Algoritmo ativo na conta selecionada.
              </div>
            )}
          </div>
        )}

        {/* TAB 5: SYSTEM LOGS & AUDIT */}
        {activeTab === 'logs' && (
          <div className="space-y-2 h-full flex flex-col">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800 flex-shrink-0">
              <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1.5">
                <span>💬</span> Eventos em Tempo Real e Mensagens do Sistema
              </span>
              {systemLogs && systemLogs.length > 0 && (
                <button
                  onClick={() => clearLogs && clearLogs()}
                  className="bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-red-800/60 text-slate-400 hover:text-red-400 text-[10px] font-bold px-2.5 py-1 rounded transition cursor-pointer flex items-center gap-1"
                >
                  🗑️ Limpar Mensagens
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {systemLogs && systemLogs.length > 0 ? (
                systemLogs.map((log: any, i: number) => {
                  let typeClass = 'text-blue-400';
                  let badgeBg = 'bg-blue-950/60 text-blue-300 border-blue-800/60';
                  const logType = String(log.type || '').toLowerCase();
                  const prefix = log.prefix || (log.type ? log.type.toUpperCase() : 'INFO');

                  if (logType === 'alerta' || prefix === 'ALERTA') {
                    typeClass = 'text-yellow-400';
                    badgeBg = 'bg-yellow-950/60 text-yellow-300 border-yellow-800/60';
                  } else if (logType === 'erro' || prefix === 'ERRO') {
                    typeClass = 'text-red-400 font-bold';
                    badgeBg = 'bg-red-950/60 text-red-300 border-red-800/60';
                  } else if (logType === 'ia' || prefix === 'IA') {
                    typeClass = 'text-cyan-400';
                    badgeBg = 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60';
                  } else if (logType === 'noticia' || prefix === 'NOTÍCIA' || prefix === 'NOTICIA') {
                    typeClass = 'text-emerald-400';
                    badgeBg = 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60';
                  }

                  return (
                    <div
                      key={i}
                      className="py-1.5 px-2 rounded bg-slate-900/40 border border-slate-850 hover:border-slate-700 transition leading-relaxed font-mono flex items-start gap-2"
                    >
                      <span className="text-slate-500 text-[10px] whitespace-nowrap pt-0.5">
                        [{log.time || '--:--:--'}]
                      </span>
                      <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded border whitespace-nowrap ${badgeBg}`}>
                        {prefix}
                      </span>
                      <span className={`flex-1 text-[11px] ${typeClass} leading-snug break-words`}>
                        {log.content || log.message}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-10 text-slate-500 text-xs font-mono">
                  Nenhum registro de log ou evento no momento.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
