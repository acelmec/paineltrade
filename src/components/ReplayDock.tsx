import React, { useState, useMemo } from 'react';
import type { ReplayOrder, ReplayAccountConfig } from '../utils/replayEngine';
import type { CustomStrategy, AIPrompt } from '../services/db';

interface ReplayDockProps {
  orders: ReplayOrder[];
  account: ReplayAccountConfig;
  currentPrice: number;
  pointValue: number;
  onCloseOrder: (orderId: string) => void;
  onCancelPendingOrder: (orderId: string) => void;
  onClearHistory: () => void;
  availableStrategies: CustomStrategy[];
  linkedStrategyIds: string[];
  onToggleStrategy?: (strategyId: string) => void;
  onSetAllStrategies?: (active: boolean) => void;
  availablePrompts?: AIPrompt[];
  linkedPromptIds?: string[];
  onTogglePrompt?: (promptId: string) => void;
  onSetAllPrompts?: (active: boolean) => void;
  onTriggerAISignal?: (prompt: AIPrompt, side: 'COMPRA' | 'VENDA') => void;
  replayLogs: Array<{ id: string; timestamp: string; type: string; message: string }>;
}

export const ReplayDock: React.FC<ReplayDockProps> = ({
  orders,
  account,
  currentPrice,
  pointValue,
  onCloseOrder,
  onCancelPendingOrder,
  onClearHistory,
  availableStrategies,
  linkedStrategyIds,
  onToggleStrategy,
  onSetAllStrategies,
  availablePrompts = [],
  linkedPromptIds = [],
  onTogglePrompt,
  onSetAllPrompts,
  onTriggerAISignal,
  replayLogs
}) => {
  const [activeTab, setActiveTab] = useState<'active_orders' | 'pending_orders' | 'history' | 'kpis' | 'robots' | 'logs'>('active_orders');

  // Separando ordens por status
  const activeOrders = useMemo(() => orders.filter(o => o.status === 'Em Andamento'), [orders]);
  const pendingOrders = useMemo(() => orders.filter(o => o.status === 'Pendente'), [orders]);
  const historyOrders = useMemo(() => orders.filter(o => o.status === 'Gain' || o.status === 'Loss' || o.status === 'Encerrado'), [orders]);

  // Estados de Simulação do Desempenho
  const [simLotMultiplier, setSimLotMultiplier] = useState<number>(1);
  const [selectedBarFilters, setSelectedBarFilters] = useState<string[]>([]);
  const [chartGroupFilter, setChartGroupFilter] = useState<'trade' | 'daily' | 'monthly' | 'weekday' | 'hourly' | 'halfhourly'>('trade');

  const toggleBarFilter = (label: string) => {
    setSelectedBarFilters(prev =>
      prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label]
    );
  };

  // Parser auxiliar de data do Replay
  const parseReplayOrderDate = (order: ReplayOrder): Date => {
    if (!order.entry_time) return new Date();
    const d = new Date(order.entry_time);
    if (!isNaN(d.getTime())) return d;

    const parts = order.entry_time.split('T');
    if (parts.length === 2) {
      const dateParts = parts[0].split('-').map(Number);
      const timeParts = parts[1].split(':').map(Number);
      if (dateParts.length === 3 && timeParts.length >= 2) {
        return new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], timeParts[2] || 0);
      }
    }
    return new Date();
  };

  // Filtragem de ordens reativa a MÚLTIPLAS seleções de barras no gráfico
  const filteredHistoryForSim = useMemo(() => {
    if (selectedBarFilters.length === 0) return historyOrders;

    return historyOrders.filter((o, idx) => {
      const d = parseReplayOrderDate(o);
      switch (chartGroupFilter) {
        case 'trade':
          return selectedBarFilters.includes(o.id) || selectedBarFilters.includes(`#${idx + 1}`);
        case 'daily': {
          const key = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
          return selectedBarFilters.includes(key);
        }
        case 'monthly': {
          const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
          return selectedBarFilters.includes(monthNames[d.getMonth()]);
        }
        case 'weekday': {
          const weekdayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
          const rawDay = d.getDay();
          const idxDay = rawDay === 0 ? 6 : rawDay - 1;
          return selectedBarFilters.includes(weekdayNames[idxDay]);
        }
        case 'hourly': {
          const hKey = `${String(d.getHours()).padStart(2, '0')}h`;
          return selectedBarFilters.includes(hKey);
        }
        case 'halfhourly': {
          const h = String(d.getHours()).padStart(2, '0');
          const min = d.getMinutes() >= 30 ? '30' : '00';
          return selectedBarFilters.includes(`${h}:${min}`);
        }
        default:
          return true;
      }
    });
  }, [historyOrders, selectedBarFilters, chartGroupFilter]);

  // Cálculos de KPIs / Desempenho Institucional (Estilo Relatório de Operações com Simulação)
  const kpis = useMemo(() => {
    const totalTrades = filteredHistoryForSim.length;
    const winningTrades = filteredHistoryForSim.filter(o => (o.profit_usd || 0) > 0);
    const losingTrades = filteredHistoryForSim.filter(o => (o.profit_usd || 0) < 0);
    const evenTrades = filteredHistoryForSim.filter(o => (o.profit_usd || 0) === 0);

    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
    const grossProfit = winningTrades.reduce((acc, o) => acc + (o.profit_usd || 0) * simLotMultiplier, 0);
    const grossLoss = Math.abs(losingTrades.reduce((acc, o) => acc + (o.profit_usd || 0) * simLotMultiplier, 0));
    const netProfit = grossProfit - grossLoss;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0;

    const avgTrade = totalTrades > 0 ? netProfit / totalTrades : 0;
    const avgWin = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 99.9 : 0;

    let maxWin = 0;
    winningTrades.forEach(o => {
      const p = (o.profit_usd || 0) * simLotMultiplier;
      if (p > maxWin) maxWin = p;
    });

    let maxLoss = 0;
    losingTrades.forEach(o => {
      const loss = Math.abs((o.profit_usd || 0) * simLotMultiplier);
      if (loss > maxLoss) maxLoss = loss;
    });

    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;
    let currentWins = 0;
    let currentLosses = 0;

    let peakBalance = account.initial_balance || 50000;
    let currentBal = account.initial_balance || 50000;
    let maxDD = 0;

    const tradeBars: Array<{ id: string; name: string; pnl: number; balance: number; side: string }> = [];

    filteredHistoryForSim.forEach((o, index) => {
      const profit = (o.profit_usd || 0) * simLotMultiplier;
      currentBal += profit;
      if (currentBal > peakBalance) peakBalance = currentBal;
      const dd = peakBalance - currentBal;
      if (dd > maxDD) maxDD = dd;

      if (profit > 0) {
        currentWins++;
        currentLosses = 0;
        if (currentWins > maxConsecutiveWins) maxConsecutiveWins = currentWins;
      } else if (profit < 0) {
        currentLosses++;
        currentWins = 0;
        if (currentLosses > maxConsecutiveLosses) maxConsecutiveLosses = currentLosses;
      }

      tradeBars.push({
        id: o.id,
        name: o.strategy_name || `#${index + 1}`,
        pnl: profit,
        balance: currentBal,
        side: o.side
      });
    });

    return {
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      evenTrades: evenTrades.length,
      winRate,
      grossProfit,
      grossLoss,
      netProfit,
      profitFactor,
      avgTrade,
      avgWin,
      avgLoss,
      payoffRatio,
      maxWin,
      maxLoss,
      maxConsecutiveWins,
      maxConsecutiveLosses,
      maxDD,
      tradeBars
    };
  }, [filteredHistoryForSim, account, simLotMultiplier]);

  // Dados agrupados dinamicamente para o gráfico de desempenho
  const groupedChartData = useMemo<Array<{ id: string; label: string; val: number; subLabel?: string }>>(() => {
    if (historyOrders.length === 0) return [];

    switch (chartGroupFilter) {
      case 'trade': {
        return historyOrders.map((o, idx) => ({
          id: o.id,
          label: `#${idx + 1}`,
          subLabel: o.strategy_name || 'Trade',
          val: (o.profit_usd || 0) * simLotMultiplier
        }));
      }

      case 'daily': {
        const daysMap: Record<string, number> = {};
        historyOrders.forEach(o => {
          const d = parseReplayOrderDate(o);
          const key = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
          daysMap[key] = (daysMap[key] || 0) + ((o.profit_usd || 0) * simLotMultiplier);
        });
        return Object.entries(daysMap).map(([label, val]) => ({
          id: label,
          label,
          val
        }));
      }

      case 'monthly': {
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const values = Array(12).fill(0);
        let hasData = false;
        historyOrders.forEach(o => {
          const d = parseReplayOrderDate(o);
          const m = d.getMonth();
          values[m] += ((o.profit_usd || 0) * simLotMultiplier);
          hasData = true;
        });
        return monthNames
          .map((name, i) => ({ id: name, label: name, val: values[i] }))
          .filter((item) => item.val !== 0 || hasData === false);
      }

      case 'weekday': {
        const weekdayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
        const values = Array(7).fill(0);
        historyOrders.forEach(o => {
          const d = parseReplayOrderDate(o);
          const rawDay = d.getDay();
          const idx = rawDay === 0 ? 6 : rawDay - 1;
          values[idx] += ((o.profit_usd || 0) * simLotMultiplier);
        });
        return weekdayNames.map((name, i) => ({ id: name, label: name, val: values[i] }));
      }

      case 'hourly': {
        const hourMap: Record<string, number> = {};
        historyOrders.forEach(o => {
          const d = parseReplayOrderDate(o);
          const hKey = `${String(d.getHours()).padStart(2, '0')}h`;
          hourMap[hKey] = (hourMap[hKey] || 0) + ((o.profit_usd || 0) * simLotMultiplier);
        });
        return Object.entries(hourMap)
          .map(([label, val]) => ({ id: label, label, val }))
          .sort((a, b) => a.label.localeCompare(b.label));
      }

      case 'halfhourly': {
        const slotMap: Record<string, number> = {};
        historyOrders.forEach(o => {
          const d = parseReplayOrderDate(o);
          const h = String(d.getHours()).padStart(2, '0');
          const min = d.getMinutes() >= 30 ? '30' : '00';
          const slotKey = `${h}:${min}`;
          slotMap[slotKey] = (slotMap[slotKey] || 0) + ((o.profit_usd || 0) * simLotMultiplier);
        });
        return Object.entries(slotMap)
          .map(([label, val]) => ({ id: label, label, val }))
          .sort((a, b) => a.label.localeCompare(b.label));
      }

      default:
        return [];
    }
  }, [historyOrders, chartGroupFilter, simLotMultiplier]);

  return (
    <div className="w-full h-full bg-[#090f1f] border-t border-slate-800 flex flex-col font-sans select-none overflow-hidden">
      {/* Dock Tabs Header */}
      <div className="flex items-center justify-between bg-slate-950 border-b border-slate-800 px-3 shrink-0">
        <div className="flex gap-1 overflow-x-auto custom-scrollbar">
          {[
            { id: 'active_orders', label: 'Ordens Ativas', icon: '⚡', count: activeOrders.length },
            { id: 'pending_orders', label: 'Ordens Pendentes', icon: '📝', count: pendingOrders.length },
            { id: 'history', label: 'Histórico de Trades', icon: '📜', count: historyOrders.length },
            { id: 'kpis', label: 'Desempenho & KPIs', icon: '📈' },
            { id: 'robots', label: 'Robôs & IA no Replay', icon: '🤖', count: linkedStrategyIds.length + linkedPromptIds.length },
            { id: 'logs', label: 'Logs de Execução', icon: '📋', count: replayLogs.length }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400 bg-slate-900/60'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className="bg-blue-900/80 text-blue-200 font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Botão de Limpar Histórico do Replay */}
        <button
          onClick={onClearHistory}
          className="px-2.5 py-1 text-[11px] font-bold bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 rounded-md transition flex items-center gap-1 cursor-pointer shrink-0"
          title="Limpar ordens encerradas e histórico de sinais do Replay"
        >
          <span>🧹</span>
          <span>Limpar Histórico</span>
        </button>
      </div>

      {/* Dock Content Body */}
      <div className="flex-1 overflow-y-auto p-3 font-sans">
        {/* TAB 1: ORDENS ATIVAS */}
        {activeTab === 'active_orders' && (
          <div className="space-y-2">
            {activeOrders.length === 0 ? (
              <div className="text-slate-500 text-xs italic text-center py-6">
                Nenhuma ordem ativa em andamento na Conta Replay.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                      <th className="py-1 px-2">ID</th>
                      <th className="py-1 px-2">Estratégia</th>
                      <th className="py-1 px-2">Lado</th>
                      <th className="py-1 px-2">Lote</th>
                      <th className="py-1 px-2">Entrada</th>
                      <th className="py-1 px-2">Atual</th>
                      <th className="py-1 px-2">Stop Loss</th>
                      <th className="py-1 px-2">Take Profit</th>
                      <th className="py-1 px-2">Resultado ($)</th>
                      <th className="py-1 px-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeOrders.map(o => {
                      const pts = o.side === 'COMPRA' ? currentPrice - o.entry_price : o.entry_price - currentPrice;
                      const profit = pts * o.contrato * pointValue;
                      return (
                        <tr key={o.id} className="border-b border-slate-850 hover:bg-slate-900/40">
                          <td className="py-1.5 px-2 text-slate-400 text-[10px]">{o.id.substring(0, 12)}</td>
                          <td className="py-1.5 px-2 text-slate-200 font-bold">{o.strategy_name}</td>
                          <td className="py-1.5 px-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${o.side === 'COMPRA' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}`}>
                              {o.side}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-slate-300">{o.contrato}</td>
                          <td className="py-1.5 px-2 text-slate-300">{o.entry_price.toFixed(2)}</td>
                          <td className="py-1.5 px-2 text-blue-400 font-bold">{currentPrice.toFixed(2)}</td>
                          <td className="py-1.5 px-2 text-rose-400">{o.stop_loss ? o.stop_loss.toFixed(2) : '-'}</td>
                          <td className="py-1.5 px-2 text-emerald-400">{o.take_profit ? o.take_profit.toFixed(2) : '-'}</td>
                          <td className={`py-1.5 px-2 font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {profit >= 0 ? '+' : ''}${profit.toFixed(2)} ({pts.toFixed(1)} pts)
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            <button
                              onClick={() => onCloseOrder(o.id)}
                              className="px-2 py-0.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[10px] font-bold rounded cursor-pointer transition"
                            >
                              Zerar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ORDENS PENDENTES */}
        {activeTab === 'pending_orders' && (
          <div className="space-y-2">
            {pendingOrders.length === 0 ? (
              <div className="text-slate-500 text-xs italic text-center py-6">
                Nenhuma ordem pendente aguardando execução.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                      <th className="py-1 px-2">ID</th>
                      <th className="py-1 px-2">Estratégia</th>
                      <th className="py-1 px-2">Lado</th>
                      <th className="py-1 px-2">Lote</th>
                      <th className="py-1 px-2">Preço Limite</th>
                      <th className="py-1 px-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingOrders.map(o => (
                      <tr key={o.id} className="border-b border-slate-850 hover:bg-slate-900/40">
                        <td className="py-1.5 px-2 text-slate-400 text-[10px]">{o.id.substring(0, 12)}</td>
                        <td className="py-1.5 px-2 text-slate-200 font-bold">{o.strategy_name}</td>
                        <td className="py-1.5 px-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${o.side === 'COMPRA' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}`}>
                            {o.side}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-slate-300">{o.contrato}</td>
                        <td className="py-1.5 px-2 text-amber-400 font-bold">{o.entry_price.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-right">
                          <button
                            onClick={() => onCancelPendingOrder(o.id)}
                            className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold rounded cursor-pointer transition"
                          >
                            Cancelar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: HISTÓRICO DE TRADES */}
        {activeTab === 'history' && (
          <div className="space-y-2">
            {historyOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                      <th className="py-1 px-2">Status</th>
                      <th className="py-1 px-2">Estratégia</th>
                      <th className="py-1 px-2">Lado</th>
                      <th className="py-1 px-2">Lote</th>
                      <th className="py-1 px-2">Entrada</th>
                      <th className="py-1 px-2">Saída</th>
                      <th className="py-1 px-2">Pontos</th>
                      <th className="py-1 px-2">Resultado ($)</th>
                      <th className="py-1 px-2 text-right">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyOrders.slice(-200).reverse().map(o => (
                      <tr key={o.id} className="border-b border-slate-850 hover:bg-slate-900/40">
                        <td className="py-1.5 px-2 font-bold">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                            o.status === 'Gain' ? 'bg-emerald-950 text-emerald-400' :
                            o.status === 'Loss' ? 'bg-rose-950 text-rose-400' : 'bg-slate-800 text-slate-300'
                          }`}>
                            {o.status}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-slate-200 font-bold">{o.strategy_name}</td>
                        <td className="py-1.5 px-2">
                          <span className={`px-1 py-0.5 rounded text-[10px] ${o.side === 'COMPRA' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {o.side}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-slate-300">{o.contrato}</td>
                        <td className="py-1.5 px-2 text-slate-300">{o.entry_price.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-slate-300">{o.exit_price ? o.exit_price.toFixed(2) : '-'}</td>
                        <td className={`py-1.5 px-2 font-bold ${(o.points || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {(o.points || 0) >= 0 ? '+' : ''}{(o.points || 0).toFixed(1)}
                        </td>
                        <td className={`py-1.5 px-2 font-bold ${(o.profit_usd || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {(o.profit_usd || 0) >= 0 ? '+' : ''}${(o.profit_usd || 0).toFixed(2)}
                        </td>
                        <td className="py-1.5 px-2 text-slate-400 text-right text-[10px]">{o.close_reason || 'MANUAL'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-slate-500 text-xs italic text-center py-6">
                Nenhum trade encerrado registrado no histórico.
              </div>
            )}
          </div>
        )}

        {/* TAB 4: DESEMPENHO & KPIS (INSTITUCIONAL COMPLETO) */}
        {activeTab === 'kpis' && (
          <div className="space-y-4 font-mono overflow-y-auto max-h-[380px] pr-1">
            {/* BARRA SUPERIOR DE SIMULAÇÃO DE RESULTADOS */}
            <div className="flex flex-wrap items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-blue-900/40 text-xs font-mono gap-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-blue-400 font-bold">
                  <span>🧮</span>
                  <span>SIMULADOR DE RESULTADOS</span>
                </div>
                
                {/* Seleção de Multiplicador de Lotes */}
                <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-sans">Multiplicador de Lote:</span>
                  {[1, 2, 3, 5, 10].map(mult => (
                    <button
                      key={mult}
                      type="button"
                      onClick={() => setSimLotMultiplier(mult)}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer transition ${
                        simLotMultiplier === mult
                          ? 'bg-blue-600 text-white font-black shadow-md shadow-blue-950'
                          : 'bg-slate-850 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {mult}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Badge de Filtro Ativo por Barra (Múltipla Seleção) */}
              {selectedBarFilters.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 bg-purple-950/80 border border-purple-700/80 text-purple-200 text-[11px] px-2.5 py-1 rounded-md font-bold animate-fade-in">
                  <span className="text-purple-300">🔍 Simulando ({selectedBarFilters.length}):</span>
                  {selectedBarFilters.map(filter => (
                    <span
                      key={filter}
                      onClick={() => toggleBarFilter(filter)}
                      className="bg-purple-900/90 hover:bg-purple-800 border border-purple-600/80 text-white text-[10px] px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition"
                      title={`Remover ${filter}`}
                    >
                      <span>{filter}</span>
                      <span className="text-purple-300 font-black">✕</span>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSelectedBarFilters([])}
                    className="text-purple-400 hover:text-white font-black cursor-pointer ml-1 underline text-[10px]"
                    title="Limpar todos os filtros da seleção"
                  >
                    Limpar Todos
                  </button>
                </div>
              ) : (
                <span className="text-[10px] text-slate-400 font-sans italic">
                  💡 Dica: Clique nas barras para selecionar múltiplos dias, horas ou trades e ver o resultado consolidado.
                </span>
              )}
            </div>

            {/* CARDS SUPERIORES DE KPI (ESTILO DASHBOARD DE OPERAÇÕES REAIS) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* CARD 1: TAXA DE ACERTO */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    TAXA DE ACERTO (WIN RATE)
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black text-emerald-400">
                      {kpis.winRate.toFixed(1)}%
                    </span>
                    <span className="text-xs font-semibold text-slate-400 font-sans">
                      ({kpis.winningTrades} / {kpis.totalTrades})
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-2 font-sans">
                  Operações lucrativas divididas pelo total fechado.
                </p>
              </div>

              {/* CARD 2: SALDO REAL / LUCRO LÍQUIDO */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    RESULTADO LÍQUIDO REPLAY (USD)
                  </span>
                  <div className="text-2xl font-black mt-1">
                    <span className={kpis.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {kpis.netProfit >= 0 ? '+' : ''}${kpis.netProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-2 font-sans">
                  Saldo Inicial: ${(account.initial_balance || 50000).toLocaleString('en-US')} | Atual: ${((account.initial_balance || 50000) + kpis.netProfit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>

              {/* CARD 3: STATUS DAS OPERAÇÕES / FATOR DE LUCRO */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    FATOR DE LUCRO & GESTÃO DE RISCO
                  </span>
                  <div className="grid grid-cols-3 gap-2 text-center bg-slate-900/60 p-2 rounded-lg border border-slate-850">
                    <div>
                      <span className="text-[9px] text-slate-400 block font-sans">PROFIT FACTOR</span>
                      <span className="text-sm font-black text-amber-400 block">
                        {kpis.profitFactor === Infinity ? '∞' : kpis.profitFactor.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block font-sans">PAYOFF</span>
                      <span className="text-sm font-black text-blue-400 block">
                        {kpis.payoffRatio === Infinity ? '∞' : kpis.payoffRatio.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block font-sans">MAX DD</span>
                      <span className="text-sm font-black text-rose-400 block">
                        -${kpis.maxDD.toFixed(0)}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-2 font-sans">
                  Lucro bruto dividido pelo prejuízo bruto total.
                </p>
              </div>
            </div>

            {/* SEÇÃO PRINCIPAL DE DESEMPENHO E DISTRIBUIÇÃO + RESUMO FINANCEIRO */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* COLUNA ESQUERDA (2/3): DESEMPENHO E DISTRIBUIÇÃO DE RESULTADOS (GRÁFICO VISUAL BARRA A BARRA) */}
              <div className="lg:col-span-2 bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-850">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">📈</span>
                      <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                        DESEMPENHO E DISTRIBUIÇÃO DE RESULTADOS
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-0.5 font-sans">
                      Visualização gráfica e agrupamento de PnL no Replay
                    </span>
                  </div>

                  {/* Listbox Filtro de Agrupamento */}
                  <select
                    value={chartGroupFilter}
                    onChange={e => {
                      setChartGroupFilter(e.target.value as any);
                      setSelectedBarFilters([]);
                    }}
                    className="bg-slate-900 border border-slate-750 px-2 py-1 rounded text-[10px] text-slate-200 font-bold focus:outline-none focus:border-blue-500/50 cursor-pointer shadow"
                  >
                    <option value="trade">⚡ Trade a Trade</option>
                    <option value="daily">📅 Diário (DD/MM)</option>
                    <option value="monthly">🗓️ Mensal</option>
                    <option value="weekday">📆 Dias da Semana</option>
                    <option value="hourly">⏱️ Por Hora (60m)</option>
                    <option value="halfhourly">⏳ Por Meia Hora (30m)</option>
                  </select>
                </div>

                {/* GRÁFICO VISUAL DE BARRAS DE PnL AGRUPADO */}
                {groupedChartData.length === 0 ? (
                  <div className="h-44 flex items-center justify-center text-slate-500 text-xs italic font-sans">
                    Nenhum trade finalizado para gerar o gráfico neste agrupamento.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="h-40 flex items-end gap-1.5 overflow-x-auto pb-2 custom-scrollbar bg-slate-900/40 p-3 rounded-lg border border-slate-850/80">
                      {(() => {
                        const maxAbsPnL = Math.max(...groupedChartData.map(b => Math.abs(b.val)), 50);
                        return groupedChartData.map((bar) => {
                          const isWin = bar.val >= 0;
                          const heightPct = Math.max(12, (Math.abs(bar.val) / maxAbsPnL) * 85);
                          const isSelected = selectedBarFilters.includes(bar.label);
                          return (
                            <div
                              key={bar.id}
                              onClick={() => toggleBarFilter(bar.label)}
                              className={`flex-1 min-w-[32px] max-w-[56px] flex flex-col items-center justify-end h-full group relative cursor-pointer transition-all ${
                                isSelected ? 'scale-105 z-10' : 'hover:scale-102 opacity-85 hover:opacity-100'
                              }`}
                            >
                              {/* Tooltip Hover */}
                              <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition bg-slate-900 text-slate-100 border border-slate-700 text-[9px] p-1.5 rounded z-20 whitespace-nowrap shadow-xl pointer-events-none">
                                <div className="font-bold">{bar.label} {bar.subLabel ? `(${bar.subLabel})` : ''}</div>
                                <div className={isWin ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                  {isWin ? '+' : ''}${bar.val.toFixed(2)}
                                </div>
                                <div className="text-[8px] text-blue-300">
                                  {isSelected ? '✓ Selecionado (Clique p/ remover)' : '+ Clique p/ adicionar à simulação'}
                                </div>
                              </div>

                              {/* Valor sobre a barra */}
                              <span className={`text-[8px] font-bold mb-1 ${isWin ? 'text-emerald-400' : 'text-rose-400'} ${isSelected ? 'text-[9px] underline font-black text-amber-300' : ''}`}>
                                {bar.val !== 0 ? `${isWin ? '+' : ''}$${Math.round(bar.val)}` : '$0'}
                              </span>

                              {/* Barra vertical */}
                              <div
                                style={{ height: `${heightPct}%` }}
                                className={`w-full rounded-t transition-all ${
                                  isSelected
                                    ? isWin
                                      ? 'bg-emerald-400 ring-2 ring-amber-400 shadow-lg shadow-emerald-500/60'
                                      : 'bg-rose-400 ring-2 ring-amber-400 shadow-lg shadow-rose-500/60'
                                    : isWin
                                      ? 'bg-gradient-to-t from-emerald-700 to-emerald-400 group-hover:from-emerald-600 group-hover:to-emerald-300'
                                      : 'bg-gradient-to-t from-rose-700 to-rose-400 group-hover:from-rose-600 group-hover:to-rose-300'
                                }`}
                              />

                              {/* Rótulo inferior */}
                              <span className={`text-[9px] font-bold mt-1 font-mono truncate max-w-full flex items-center gap-0.5 ${isSelected ? 'text-amber-400 font-black underline' : 'text-slate-400'}`}>
                                {isSelected && <span className="text-[8px] text-amber-300">✓</span>}
                                <span>{bar.label}</span>
                              </span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* COLUNA DIREITA (1/3): RESUMO FINANCEIRO COMPLETO */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-850">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">📊</span>
                      <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                        RESUMO FINANCEIRO
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-bold font-mono">
                      {kpis.totalTrades} Operações
                    </span>
                  </div>

                  <div className="space-y-2.5 text-xs font-mono">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-900">
                      <span className="text-slate-400 text-[11px] font-sans">Ganhos Brutos:</span>
                      <span className="font-bold text-emerald-400">
                        +${kpis.grossProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-900">
                      <span className="text-slate-400 text-[11px] font-sans">Perdas Brutas:</span>
                      <span className="font-bold text-rose-400">
                        -${kpis.grossLoss.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-850 pt-0.5 bg-slate-900/40 p-2 rounded">
                      <span className="text-white font-bold text-[11px] font-sans">Resultado Líquido:</span>
                      <span className={`font-black text-sm ${kpis.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {kpis.netProfit >= 0 ? '+' : ''}${kpis.netProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-400 text-[11px] font-sans">Média por Trade:</span>
                      <span className={`font-bold ${kpis.avgTrade >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {kpis.avgTrade >= 0 ? '+' : ''}${kpis.avgTrade.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px] font-sans">Maior Gain:</span>
                      <span className="font-bold text-emerald-400">+${kpis.maxWin.toFixed(2)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px] font-sans">Maior Loss:</span>
                      <span className="font-bold text-rose-400">-${kpis.maxLoss.toFixed(2)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px] font-sans">Sequência Máx. Wins:</span>
                      <span className="font-bold text-emerald-400">{kpis.maxConsecutiveWins} vitorias</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px] font-sans">Sequência Máx. Losses:</span>
                      <span className="font-bold text-rose-400">{kpis.maxConsecutiveLosses} derrotas</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: ROBÔS & IA NO REPLAY */}
        {activeTab === 'robots' && (
          <div className="space-y-6 overflow-y-auto max-h-[350px] pr-1 font-mono">
            {/* SEÇÃO 1: ALGORITMOS E ESTRATÉGIAS TÁTICAS */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🤖</span>
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                    Algoritmos Táticos ({linkedStrategyIds.length}/{availableStrategies.length} Ativos)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSetAllStrategies?.(true)}
                    className="px-2 py-0.5 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/60 text-emerald-400 text-[10px] font-bold rounded cursor-pointer transition"
                  >
                    ⚡ Ligar Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetAllStrategies?.(false)}
                    className="px-2 py-0.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 text-[10px] font-bold rounded cursor-pointer transition"
                  >
                    🔌 Desligar Todos
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mb-3">
                Clique nos cards para ligar/desligar a execução autônoma de cada algoritmo no Replay:
              </p>

              {availableStrategies.length === 0 ? (
                <div className="text-xs text-slate-500 italic p-3 bg-slate-950/50 rounded-lg border border-slate-850">
                  Nenhum algoritmo cadastrado.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {availableStrategies.map(strat => {
                    const isLinked = linkedStrategyIds.map(x => String(x)).includes(String(strat.id!));
                    return (
                      <div
                        key={strat.id}
                        onClick={() => onToggleStrategy?.(String(strat.id!))}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition select-none ${
                          isLinked
                            ? 'bg-slate-950 border-emerald-500/50 hover:border-emerald-400/80 shadow-lg shadow-emerald-950/20'
                            : 'bg-slate-950/60 border-slate-850/80 hover:border-slate-700 opacity-75'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-xs ${isLinked ? 'text-white' : 'text-slate-400'}`}>
                              {strat.name}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-sans">
                            {(strat as any).contracts || strat.risk_settings?.lots || 1} ct • SL: {strat.risk_settings?.stop_value || 20} pts • TP: {strat.risk_settings?.take_value || 40} pts
                          </div>
                        </div>

                        <div>
                          {isLinked ? (
                            <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded-md">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              LIGADO
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                              DESLIGADO
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SEÇÃO 2: PROMPTS IA GERADORES DE SINAL */}
            <div className="pt-2 border-t border-slate-850">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🧠</span>
                  <span className="text-xs font-bold text-purple-300 uppercase tracking-wide">
                    Prompts IA Geradores de Sinal ({linkedPromptIds.length}/{availablePrompts.length} Ativos)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSetAllPrompts?.(true)}
                    className="px-2 py-0.5 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-800/60 text-purple-300 text-[10px] font-bold rounded cursor-pointer transition"
                  >
                    ⚡ Ligar Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetAllPrompts?.(false)}
                    className="px-2 py-0.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 text-[10px] font-bold rounded cursor-pointer transition"
                  >
                    🔌 Desligar Todos
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mb-3">
                Ligue os prompts de IA para simulação ou use os botões rápidos de teste de acionamento:
              </p>

              {availablePrompts.length === 0 ? (
                <div className="text-xs text-slate-500 italic p-3 bg-slate-950/50 rounded-lg border border-slate-850">
                  Nenhum Prompt de IA cadastrado no sistema.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {availablePrompts.map(prompt => {
                    const isLinked = linkedPromptIds.map(x => String(x)).includes(String(prompt.id!));
                    const promptTitle = prompt.name || (prompt as any).title || 'Copilot IA';
                    const triggerStratName = prompt.trigger_strategy_id
                      ? availableStrategies.find(s => s.id === prompt.trigger_strategy_id)?.name
                      : null;

                    return (
                      <div
                        key={prompt.id}
                        className={`p-3 rounded-xl border flex flex-col gap-2 transition select-none ${
                          isLinked
                            ? 'bg-slate-950 border-purple-500/50 hover:border-purple-400/80 shadow-lg shadow-purple-950/20'
                            : 'bg-slate-950/60 border-slate-850/80 hover:border-slate-700 opacity-75'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <div className="font-bold text-purple-200 text-xs flex items-center gap-1.5">
                              <span>🧠</span>
                              <span>{promptTitle}</span>
                            </div>
                            {triggerStratName && (
                              <div className="text-[10px] text-slate-400">
                                🔗 Gatilho Robô: <span className="text-blue-400 font-semibold">{triggerStratName}</span>
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => onTogglePrompt?.(prompt.id!)}
                            className="cursor-pointer"
                          >
                            {isLinked ? (
                              <span className="flex items-center gap-1.5 text-[10px] font-bold text-purple-300 bg-purple-950/60 border border-purple-800/60 px-2 py-1 rounded-md">
                                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                                LIGADO
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 bg-slate-900 border border-slate-800 px-2 py-1 rounded-md">
                                <span className="w-2 h-2 rounded-full bg-slate-600" />
                                DESLIGADO
                              </span>
                            )}
                          </button>
                        </div>

                        {/* Botões de Simulação Rápida de Sinal IA */}
                        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-900">
                          <span className="text-[9px] text-slate-500 uppercase font-bold">Simular Sinal:</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onTriggerAISignal?.(prompt, 'COMPRA');
                            }}
                            className="px-2 py-0.5 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800/80 text-emerald-300 text-[10px] font-bold rounded cursor-pointer transition flex items-center gap-1"
                            title="Simular disparo de Sinal de COMPRA deste Prompt IA na barra atual"
                          >
                            <span>🟢</span>
                            <span>Compra</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onTriggerAISignal?.(prompt, 'VENDA');
                            }}
                            className="px-2 py-0.5 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/80 text-rose-300 text-[10px] font-bold rounded cursor-pointer transition flex items-center gap-1"
                            title="Simular disparo de Sinal de VENDA deste Prompt IA na barra atual"
                          >
                            <span>🔴</span>
                            <span>Venda</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 6: LOGS DE EXECUÇÃO */}
        {activeTab === 'logs' && (
          <div className="space-y-2 font-mono">
            {replayLogs.length > 0 && (
              <div className="flex justify-end pb-1 border-b border-slate-850">
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold rounded transition flex items-center gap-1 cursor-pointer"
                >
                  <span>🧹 Limpar Logs do Sistema</span>
                </button>
              </div>
            )}
            {replayLogs.length > 0 ? (
              replayLogs.slice(-50).reverse().map(log => (
                <div key={log.id} className="text-[11px] py-1 border-b border-slate-800/50 flex gap-2">
                  <span className="text-slate-500">{log.timestamp}</span>
                  <span className="text-amber-400 font-bold">[{log.type}]</span>
                  <span className="text-slate-200">{log.message}</span>
                </div>
              ))
            ) : (
              <div className="text-slate-500 italic text-xs">Nenhum log registrado ainda no Replay.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
