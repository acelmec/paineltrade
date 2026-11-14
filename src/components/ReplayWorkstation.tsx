import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { CandleChart } from './CandleChart';
import { ReplayControlCard } from './ReplayControlCard';
import { ReplayBoleta } from './ReplayBoleta';
import { ReplayDock } from './ReplayDock';
import { ReplayAccountModal } from './ReplayAccountModal';
import { IndicatorsManagerModal } from './IndicatorsManagerModal';
import { WidgetsManagerModal } from './WidgetsManagerModal';
import { ChartWidgetsOverlay } from './ChartWidgetsOverlay';
import { DrawingSettingsModal } from './DrawingSettingsModal';
import {
  INDICATOR_DEFINITIONS,
  type IndicatorConfig
} from '../utils/indicatorRegistry';
import {
  WIDGET_DEFINITIONS,
  type WidgetConfig,
  type WidgetType
} from '../utils/widgetRegistry';
import type { DrawingItem, DrawingToolType } from '../types/chartDrawings';
import { evaluateDrawingTrigger } from '../utils/drawingEngine';
import { calculateTradeManagement } from '../utils/levelPriceResolver';
import { resolveAlgorithmAtm, type ATMStrategy, type ATMBracket } from '../utils/atmRegistry';
import type { Candle, GammaLevels, FetchProgressInfo, MarketData, ReplayForceItem } from '../services/db';
import { getRawSystemTime } from '../utils/date';
import {
  fetchAvailableCandleDateBoundsSupabase,
  fetchCandlesByDateRangeSupabase,
  fetchGammaLevelsForRangeSupabase,
  fetchForcesForRangeSupabase,
  fetchNewsForRangeSupabase,
  parseGammaLevelRecord
} from '../services/db';
import {
  fetchStreamerHistoricalCandles,
  fetchStreamerAvailableBounds,
  getStreamerInfoForPanel
} from '../services/vortexStreamer';
import {
  type ReplayOrder,
  type ReplayAccountConfig,
  DEFAULT_REPLAY_ACCOUNT,
  aggregateReplayCandles,
  checkReplayOperationalLimits,
  evaluateReplayRobot,
  resetReplaySequenceStates,
  calculateIntraCandleSimulatedState,
  getReplayForcesAtTime,
  calculateReplayMarketData,
  calculateReplayAxionRadar
} from '../utils/replayEngine';

function subtractDaysFromISO(dateISO: string, days: number): string {
  try {
    if (typeof dateISO !== 'string') {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return d.toISOString().split('T')[0];
    }
    const cleanDate = dateISO.includes('T') ? dateISO.split('T')[0] : dateISO.trim();
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(Date.UTC(y, m, day, 12, 0, 0));
      d.setUTCDate(d.getUTCDate() - days);
      return d.toISOString().split('T')[0];
    }
    const d = new Date(dateISO);
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  } catch {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  }
}

function getShortIndicatorName(ind: IndicatorConfig): string {
  switch (ind.type) {
    case 'EMA': return `EMA ${ind.params?.period || 9}`;
    case 'SMA': return `SMA ${ind.params?.period || 20}`;
    case 'TMA': return `TMA ${ind.params?.period || 20}`;
    case 'RSI': return `RSI ${ind.params?.period || 14}`;
    case 'MACD': return `MACD (${ind.params?.fastPeriod || 12},${ind.params?.slowPeriod || 26})`;
    case 'Bollinger': return `BB (${ind.params?.period || 20},${ind.params?.stdDev || 2})`;
    case 'Supertrend': return `Supertrend (${ind.params?.atrPeriod || 10})`;
    case 'ElliottWaves': return `Elliott Waves`;
    case 'SMC_OB': return `SMC Order Blocks`;
    case 'SMC_BOS_CHOCH': return `SMC BOS/CHoCH`;
    case 'SMC_Liquidity': return `SMC Liquidity`;
    case 'VWAP': return `VWAP`;
    case 'VOLUME_SPIKE_PIVOTS': return `Spike Pivots (${ind.params?.barsToCheck || 5}, ${ind.params?.volumeMultiple || 1.5}x)`;
    case 'GammaLevels':
    case 'GAMMA_LEVELS': return `Níveis Gamma`;
    default: return ind.name ? ind.name.split('(')[0].trim() : ind.type;
  }
}

export const ReplayWorkstation: React.FC = () => {
  const {
    panels,
    activePanel,
    switchPanel,
    customStrategies,
    prompts,
    settings,
    fetchStrategiesList,
    fetchPromptsList,
    refreshAccountStrategies,
    atmStrategies,
    fetchAtmStrategiesList
  } = useApp() as any;

  // Recarregar listas do banco de dados ao abrir o Replay
  useEffect(() => {
    fetchStrategiesList?.().catch(() => {});
    fetchPromptsList?.().catch(() => {});
    refreshAccountStrategies?.().catch(() => {});
    fetchAtmStrategiesList?.().catch(() => {});
  }, []);

  const atmStrategiesRef = useRef<ATMStrategy[]>(atmStrategies || []);
  useEffect(() => {
    atmStrategiesRef.current = atmStrategies || [];
  }, [atmStrategies]);

  // Purga automática de IDs de robôs excluídos do sistema
  useEffect(() => {
    if (customStrategies && Array.isArray(customStrategies) && customStrategies.length > 0) {
      const validIds = customStrategies.map(s => String(s.id));
      setLinkedStrategyIds(prev => {
        const filtered = prev.filter(id => validIds.includes(String(id)));
        return filtered.length !== prev.length ? filtered : prev;
      });
    }
  }, [customStrategies]);

  // Purga automática de IDs de prompts excluídos do sistema
  useEffect(() => {
    if (prompts && Array.isArray(prompts) && prompts.length > 0) {
      const validIds = prompts.map(p => String(p.id));
      setLinkedPromptIds(prev => {
        const filtered = prev.filter(id => validIds.includes(String(id)));
        return filtered.length !== prev.length ? filtered : prev;
      });
    }
  }, [prompts]);

  const currentSymbol = activePanel?.name || 'NQ';
  const pointValue = activePanel?.point_value !== undefined && activePanel?.point_value !== null
    ? Number(activePanel.point_value)
    : 2.0;

  // 0. Fonte de Dados (Add-on Local NT8 vs Nuvem Supabase)
  const [dataSource, setDataSource] = useState<'local' | 'supabase'>(() => {
    return (localStorage.getItem('vortex_replay_data_source') as 'local' | 'supabase') || 'local';
  });
  const [isStreamerOnline, setIsStreamerOnline] = useState<boolean>(false);
  const [streamerBarsCount, setStreamerBarsCount] = useState<number>(0);
  const [isNinjaPlaybackActive, setIsNinjaPlaybackActive] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem('vortex_replay_data_source', dataSource);
  }, [dataSource]);

  // Monitor de status do Streamer Local NinjaTrader (:8002)
  useEffect(() => {
    let isMounted = true;
    const updateStreamerStatus = async () => {
      try {
        const info = await getStreamerInfoForPanel(activePanel, settings);
        if (isMounted) {
          setIsStreamerOnline(info.isLocal);
          setStreamerBarsCount(info.stream?.bars_count || 0);
          setIsNinjaPlaybackActive(info.isPlayback);
        }
      } catch {
        if (isMounted) {
          setIsStreamerOnline(false);
          setStreamerBarsCount(0);
          setIsNinjaPlaybackActive(false);
        }
      }
    };

    updateStreamerStatus();
    const interval = setInterval(updateStreamerStatus, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activePanel, settings]);

  // 1. Limites de Datas no Banco de Dados ou Streamer Local
  const [minAvailableDate, setMinAvailableDate] = useState<string>('');
  const [maxAvailableDate, setMaxAvailableDate] = useState<string>('');

  // 2. Estados de Data / Período
  const getTodayISO = () => new Date().toISOString().split('T')[0];
  const getDaysAgoISO = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  };

  const [startDate, setStartDate] = useState<string>(() => {
    return localStorage.getItem('vortex_replay_start_date') || getDaysAgoISO(1);
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return localStorage.getItem('vortex_replay_end_date') || getTodayISO();
  });

  useEffect(() => {
    localStorage.setItem('vortex_replay_start_date', startDate);
    localStorage.setItem('vortex_replay_end_date', endDate);
  }, [startDate, endDate]);

  // 3. Dados Históricos do Replay
  const [rawCandles, setRawCandles] = useState<Candle[]>([]);
  const rawCandlesRef = useRef<Candle[]>([]);
  const [startReplayIndex, setStartReplayIndex] = useState<number>(0);
  const startReplayIndexRef = useRef<number>(0);
  const [currentCandleIndex, setCurrentCandleIndex] = useState<number>(0);
  const currentCandleIndexRef = useRef<number>(0);

  useEffect(() => {
    currentCandleIndexRef.current = currentCandleIndex;
  }, [currentCandleIndex]);
  const [currentFormingCandle, setCurrentFormingCandle] = useState<Candle | null>(null);
  const currentSecondRef = useRef<number>(0);
  const secondAccumulatorRef = useRef<number>(0);

  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const currentPriceRef = useRef<number>(0);
  const [currentSimulatedTime, setCurrentSimulatedTime] = useState<string>('--/--/---- --:--:--');
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [loadingProgress, setLoadingProgress] = useState<FetchProgressInfo>({
    percent: 0,
    loadedRows: 0,
    totalRows: 0,
    message: 'Iniciando carregamento...'
  });
  const [gammaLevels, setGammaLevels] = useState<GammaLevels | null>(null);
  const allGammaLevelsRef = useRef<any[]>([]);
  const [newsList, setNewsList] = useState<any[]>([]);

  // Estados e refs de dados simulados para alimentar os Widgets flutuantes no Replay
  const allReplayForcesRef = useRef<ReplayForceItem[]>([]);
  const [replayForces, setReplayForces] = useState<any[] | null>(null);
  const [replayMarketData, setReplayMarketData] = useState<MarketData | null>(null);
  const [replayAxionRadar, setReplayAxionRadar] = useState<any | null>(null);

  // 4. Execução / Playback do Replay
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const isPlayingRef = useRef<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);
  const speedRef = useRef<number>(1);
  const replayTimerRef = useRef<any>(null);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // 5. Conta Replay & Risco
  const [replayAccount, setReplayAccount] = useState<ReplayAccountConfig>(() => {
    try {
      const saved = localStorage.getItem('vortex_replay_account');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_REPLAY_ACCOUNT;
  });
  const replayAccountRef = useRef<ReplayAccountConfig>(replayAccount);

  useEffect(() => {
    replayAccountRef.current = replayAccount;
    localStorage.setItem('vortex_replay_account', JSON.stringify(replayAccount));
  }, [replayAccount]);

  // 6. Robôs e Prompts Vinculados (Iniciam DESLIGADOS se não houver preferência salva)
  const [linkedStrategyIds, setLinkedStrategyIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vortex_replay_linked_strats');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.map(x => String(x));
      }
    } catch {}
    return [];
  });
  const linkedStrategyIdsRef = useRef<string[]>(linkedStrategyIds);

  useEffect(() => {
    const norm = linkedStrategyIds.map(x => String(x));
    linkedStrategyIdsRef.current = norm;
    localStorage.setItem('vortex_replay_linked_strats', JSON.stringify(norm));
  }, [linkedStrategyIds]);

  const [linkedPromptIds, setLinkedPromptIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vortex_replay_linked_prompts');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.map(x => String(x));
      }
    } catch {}
    return [];
  });
  const linkedPromptIdsRef = useRef<string[]>(linkedPromptIds);

  useEffect(() => {
    const norm = linkedPromptIds.map(x => String(x));
    linkedPromptIdsRef.current = norm;
    localStorage.setItem('vortex_replay_linked_prompts', JSON.stringify(norm));
  }, [linkedPromptIds]);

  const evaluatedRobotCandlesRef = useRef<Record<string, string>>({});
  const lastRealtimeEvalTimeRef = useRef<Record<string, number>>({});

  // Sinais de Alerta dos Indicadores do Replay (Plotagem de Marcadores de Alerta no Gráfico)
  const [customSignals, setCustomSignals] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('vortex_replay_custom_signals');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const saveReplayStateTimerRef = useRef<any>(null);

  // 7. Ordens e Histórico de Trades
  const [orders, setOrders] = useState<ReplayOrder[]>(() => {
    try {
      const saved = localStorage.getItem('vortex_replay_orders');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const ordersRef = useRef<ReplayOrder[]>(orders);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // Salvar estado do Replay no localStorage de forma throttled/assíncrona e segura contra QuotaExceeded
  useEffect(() => {
    if (saveReplayStateTimerRef.current) {
      clearTimeout(saveReplayStateTimerRef.current);
    }
    saveReplayStateTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem('vortex_replay_current_index', String(currentCandleIndexRef.current));
        // Limita o armazenamento às últimas 100 ordens e 100 sinais para não estourar a cota de 5MB do navegador
        if (ordersRef.current.length > 0) {
          localStorage.setItem('vortex_replay_orders', JSON.stringify(ordersRef.current.slice(-100)));
        }
        if (customSignals.length > 0) {
          localStorage.setItem('vortex_replay_custom_signals', JSON.stringify(customSignals.slice(-100)));
        }
      } catch (e) {
        console.warn('[ReplayWorkstation] Aviso de cota ao salvar estado no localStorage:', e);
      }
    }, 2500);

    return () => {
      if (saveReplayStateTimerRef.current) clearTimeout(saveReplayStateTimerRef.current);
    };
  }, [currentCandleIndex, orders.length, customSignals.length]);

  // 8. Logs de Execução
  const [replayLogs, setReplayLogs] = useState<Array<{ id: string; timestamp: string; type: string; message: string }>>([]);
  const currentSimulatedTimeRef = useRef<string>(currentSimulatedTime);
  useEffect(() => {
    currentSimulatedTimeRef.current = currentSimulatedTime;
  }, [currentSimulatedTime]);

  const addReplayLog = useCallback((type: string, message: string) => {
    setReplayLogs(prev => [
      ...prev.slice(-49),
      {
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: currentSimulatedTimeRef.current.split(' ')[1] || new Date().toLocaleTimeString(),
        type,
        message
      }
    ]);
  }, []);

  // Refs de Estado para manter advanceReplaySeconds ultra performático e estável
  const customStrategiesRef = useRef<any[]>(customStrategies);
  useEffect(() => { customStrategiesRef.current = customStrategies; }, [customStrategies]);

  const promptsRef = useRef<any[]>(prompts);
  useEffect(() => { promptsRef.current = prompts; }, [prompts]);

  const gammaLevelsRef = useRef<any>(gammaLevels);
  useEffect(() => { gammaLevelsRef.current = gammaLevels; }, [gammaLevels]);

  const pointValueRef = useRef<number>(pointValue);
  useEffect(() => { pointValueRef.current = pointValue; }, [pointValue]);

  const activePanelRef = useRef<any>(activePanel);
  useEffect(() => { activePanelRef.current = activePanel; }, [activePanel]);

  const settingsRef = useRef<any>(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // 9. Timeframe do Gráfico no Replay
  const [timeframe, setTimeframe] = useState<number>(1);

  // 10. Indicadores, Widgets, Desenhos e Modais
  // 10. Indicadores, Widgets, Desenhos e Modais
  const [activeIndicators, setActiveIndicators] = useState<IndicatorConfig[]>(() => {
    try {
      const saved = localStorage.getItem('vortex_replay_indicators');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  useEffect(() => {
    localStorage.setItem('vortex_replay_indicators', JSON.stringify(activeIndicators));
  }, [activeIndicators]);

  const visibleIndicators = useMemo(() => activeIndicators.filter(i => i.visible), [activeIndicators]);

  const [activeWidgets, setActiveWidgets] = useState<WidgetConfig[]>(() => {
    try {
      const saved = localStorage.getItem('vortex_replay_widgets');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  useEffect(() => {
    localStorage.setItem('vortex_replay_widgets', JSON.stringify(activeWidgets));
  }, [activeWidgets]);

  const [indicatorsModalTab, setIndicatorsModalTab] = useState<'catalog' | 'active' | 'templates' | 'widgets'>('catalog');

  const handleAddWidget = (type: WidgetType, customParams?: Record<string, any>, customTitle?: string) => {
    const def = WIDGET_DEFINITIONS[type];
    if (!def) return;

    const newWidget: WidgetConfig = {
      id: `widget-${type}-${Date.now()}`,
      type: type,
      title: customTitle || `${def.icon} ${def.name}`,
      visible: true,
      position: {
        x: def.defaultPosition.x + (activeWidgets.length % 5) * 20,
        y: def.defaultPosition.y + (activeWidgets.length % 5) * 20
      },
      collapsed: false,
      opacity: 0.94,
      params: customParams ? { ...def.defaultParams, ...customParams } : { ...def.defaultParams }
    };

    setActiveWidgets(prev => [...prev, newWidget]);
  };

  const handleRemoveWidget = (id: string) => {
    setActiveWidgets(prev => prev.filter(w => w.id !== id));
  };

  const handleToggleWidgetVisibility = (id: string) => {
    setActiveWidgets(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  };

  const handleResetWidgetPositions = () => {
    setActiveWidgets([]);
  };

  const [drawings, setDrawings] = useState<DrawingItem[]>([]);
  const drawingsRef = useRef<DrawingItem[]>(drawings);
  useEffect(() => {
    drawingsRef.current = drawings;
  }, [drawings]);

  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingToolType | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [editingDrawing, setEditingDrawing] = useState<DrawingItem | null>(null);
  const [isDrawingSettingsOpen, setIsDrawingSettingsOpen] = useState<boolean>(false);
  const [isDrawingsMenuOpen, setIsDrawingsMenuOpen] = useState<boolean>(false);

  // Modais de Controle
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [isIndicatorsModalOpen, setIsIndicatorsModalOpen] = useState<boolean>(false);
  const [isWidgetsModalOpen, setIsWidgetsModalOpen] = useState<boolean>(false);

  // Parâmetros de Regras Padrão
  const defaultStopLossPts = 50;
  const defaultTakeProfitPts = 50;

  // Visual Controls
  const [showBottomDock, setShowBottomDock] = useState<boolean>(true);
  const [isRightBoletaCollapsed, setIsRightBoletaCollapsed] = useState<boolean>(false);
  const [dockHeight, setDockHeight] = useState<number>(180);

  const handleMouseDownSplitter = (e: React.MouseEvent) => {
    const startY = e.clientY;
    const startHeight = dockHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.max(40, Math.min(650, startHeight + deltaY));
      setDockHeight(newHeight);
    };

    const handleMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };
  const [fitChartTrigger, setFitChartTrigger] = useState<number>(0);
  const [resetViewTrigger, setResetViewTrigger] = useState<number>(0);
  const [autoCenter, setAutoCenter] = useState<boolean>(false);
  const [showTradeMarkers, setShowTradeMarkers] = useState<boolean>(true);
  const [showIndicatorsLegend, setShowIndicatorsLegend] = useState<boolean>(true);
  const [showRobots, setShowRobots] = useState<boolean>(true);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  // Posição Ativa Atual formatada para o gráfico
  const activeOrder = useMemo(() => {
    return orders.find(o => o.status === 'Em Andamento') || null;
  }, [orders]);

  const activePositionFormatted = useMemo(() => {
    if (!activeOrder) return null;
    return {
      ...activeOrder,
      entryPrice: activeOrder.entry_price,
      stopLoss: activeOrder.stop_loss,
      takeProfit: activeOrder.take_profit,
      strategyName: activeOrder.strategy_name,
      simulatedTime: activeOrder.entry_time,
      contracts: activeOrder.contrato
    };
  }, [activeOrder]);

  const [replayAlertToast, setReplayAlertToast] = useState<{
    id: string;
    title: string;
    message: string;
    side: 'COMPRA' | 'VENDA';
    time: string;
  } | null>(null);

  // Auto-dismiss alert popup after 6 seconds
  useEffect(() => {
    if (replayAlertToast) {
      const timer = setTimeout(() => {
        setReplayAlertToast(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [replayAlertToast]);

  // Atualização em Tempo Real de Níveis de SL/TP ao Arrastar Linha no Gráfico
  const handleUpdateOrderLevels = useCallback((orderId: string, newSl: number | null, newTp: number | null) => {
    setOrders(prev => prev.map(o => {
      if (o.status === 'Em Andamento' || o.id === orderId) {
        return {
          ...o,
          stop_loss: newSl !== null ? newSl : o.stop_loss,
          take_profit: newTp !== null ? newTp : o.take_profit
        };
      }
      return o;
    }));
    addReplayLog('ORDEM', `Níveis ajustados no gráfico: SL=${newSl !== null ? newSl.toFixed(2) : '--'} | TP=${newTp !== null ? newTp.toFixed(2) : '--'}`);
  }, [addReplayLog]);

  const simulatedReportsFormatted = useMemo(() => {
    return orders.map(o => ({
      ...o,
      entryPrice: o.entry_price,
      stopLoss: o.stop_loss,
      takeProfit: o.take_profit,
      strategyName: o.strategy_name,
      simulatedTime: o.signal_time || o.entry_time,
      simulated_time: o.signal_time || o.entry_time,
      created_at: o.signal_time || o.entry_time,
      contracts: o.contrato
    }));
  }, [orders]);

  const loadedDateRangeRef = useRef<{ start: string; end: string; source?: string; panelId?: string } | null>(null);
  const loadRequestIdRef = useRef<number>(0);

  // Checar Limites de Datas no Banco de Dados ou Add-on Local ao iniciar, mudar painel ou mudar fonte de dados
  useEffect(() => {
    let isCancelled = false;
    const checkBounds = async () => {
      const targetInstance = activePanel?.instance_id || 'nasdaq';

      if (dataSource === 'local') {
        const localBounds = await fetchStreamerAvailableBounds(activePanel, settings);
        if (isCancelled) return;
        if (localBounds) {
          setMinAvailableDate(localBounds.minDate);
          setMaxAvailableDate(localBounds.maxDate);

          const savedStart = localStorage.getItem('vortex_replay_start_date');
          const savedEnd = localStorage.getItem('vortex_replay_end_date');

          const currentStart = (savedStart && savedStart >= localBounds.minDate && savedStart <= localBounds.maxDate) ? savedStart : (startDate && startDate >= localBounds.minDate && startDate <= localBounds.maxDate ? startDate : '');
          const currentEnd = (savedEnd && savedEnd >= localBounds.minDate && savedEnd <= localBounds.maxDate) ? savedEnd : (endDate && endDate >= localBounds.minDate && endDate <= localBounds.maxDate ? endDate : '');

          let validStart = currentStart;
          let validEnd = currentEnd;

          if (!validStart) {
            const defaultStart = subtractDaysFromISO(localBounds.maxDate, 5);
            validStart = defaultStart < localBounds.minDate ? localBounds.minDate : defaultStart;
            setStartDate(validStart);
          }
          if (!validEnd) {
            validEnd = localBounds.maxDate;
            setEndDate(validEnd);
          }
        }
        return;
      }

      // Nuvem (Supabase)
      const bounds = await fetchAvailableCandleDateBoundsSupabase(targetInstance, activePanel?.name, settings);
      if (isCancelled) return;
      if (bounds) {
        setMinAvailableDate(bounds.minDate);
        setMaxAvailableDate(bounds.maxDate);

        // Preserva a seleção do usuário se estiver dentro dos limites válidos do banco
        const savedStart = localStorage.getItem('vortex_replay_start_date');
        const savedEnd = localStorage.getItem('vortex_replay_end_date');

        const currentStart = (savedStart && savedStart >= bounds.minDate && savedStart <= bounds.maxDate) ? savedStart : (startDate && startDate >= bounds.minDate && startDate <= bounds.maxDate ? startDate : '');
        const currentEnd = (savedEnd && savedEnd >= bounds.minDate && savedEnd <= bounds.maxDate) ? savedEnd : (endDate && endDate >= bounds.minDate && endDate <= bounds.maxDate ? endDate : '');

        let validStart = currentStart;
        let validEnd = currentEnd;

        if (!validStart) {
          // Se não havia data inicial válida salva, define até 7 dias antes do maxDate (ou minDate do banco)
          const defaultStart = subtractDaysFromISO(bounds.maxDate, 7);
          validStart = defaultStart < bounds.minDate ? bounds.minDate : defaultStart;
          setStartDate(validStart);
        }
        if (!validEnd) {
          validEnd = bounds.maxDate;
          setEndDate(validEnd);
        }
      }
    };

    checkBounds();
    return () => {
      isCancelled = true;
    };
  }, [activePanel, dataSource, settings]);

  // Carregar Dados Históricos do Add-on Local ou Supabase (com Lookback prévio)
  const handleLoadData = useCallback(async (
    overrideStartDate?: any,
    overrideEndDate?: any,
    targetJumpTimeISO?: string,
    resetPosition = true
  ) => {
    // Saneia caso o clique do botão passe um SyntheticEvent
    let sDate = (typeof overrideStartDate === 'string' && overrideStartDate.trim() ? overrideStartDate.trim() : startDate);
    let eDate = (typeof overrideEndDate === 'string' && overrideEndDate.trim() ? overrideEndDate.trim() : endDate);
    if (!sDate || !eDate) return;

    const reqId = ++loadRequestIdRef.current;

    setIsLoadingData(true);
    setLoadingProgress({
      percent: 10,
      loadedRows: 0,
      totalRows: 0,
      message: 'Iniciando consulta de dados...'
    });
    setIsPlaying(false);
    const targetInstance = activePanel?.instance_id || 'nasdaq';
    
    // Lookback de 2 dias anteriores à data de início para dar contexto imediato ao gráfico
    const lookbackStartDate = subtractDaysFromISO(sDate, 2);
    const startISO = `${lookbackStartDate}T00:00:00Z`;
    const endISO = `${eDate}T23:59:59Z`;

    try {
      let fetchedCandles: Candle[] | null = null;
      let effectiveSource: 'local' | 'supabase' = dataSource;

      if (dataSource === 'local') {
        // No modo Add-on Local, consulta primeiro o pool ativo do NinjaTrader para auto-detectar o dia do Replay
        setLoadingProgress({
          percent: 30,
          loadedRows: 0,
          totalRows: 0,
          message: 'Consultando Add-on Local NT8 (:8002)...'
        });
        addReplayLog('SISTEMA', `🔍 Consultando Add-on Local NT8 (:8002) para ${activePanel?.name || 'NQ'}...`);
        
        const allStreamCandles = await fetchStreamerHistoricalCandles(activePanel, undefined, undefined, settings, true);
        if (reqId !== loadRequestIdRef.current) return;

        if (allStreamCandles && allStreamCandles.length > 0) {
          fetchedCandles = allStreamCandles;
          const detectedStart = allStreamCandles[0].timestamp.split('T')[0];
          const detectedEnd = allStreamCandles[allStreamCandles.length - 1].timestamp.split('T')[0];
          setStartDate(detectedStart);
          setEndDate(detectedEnd);
          sDate = detectedStart;
          eDate = detectedEnd;
          localStorage.setItem('vortex_replay_start_date', detectedStart);
          localStorage.setItem('vortex_replay_end_date', detectedEnd);
          addReplayLog('SISTEMA', `🎮 Sincronizado com o NinjaTrader 8: ${allStreamCandles.length} velas do pregão de ${detectedStart}.`);
        } else {
          // Se não encontrou no pool direto, tenta buscar por range
          fetchedCandles = await fetchStreamerHistoricalCandles(activePanel, startISO, endISO, settings, true);
          if (reqId !== loadRequestIdRef.current) return;
        }

        if (fetchedCandles && fetchedCandles.length > 0) {
          setLoadingProgress({
            percent: 100,
            loadedRows: fetchedCandles.length,
            totalRows: fetchedCandles.length,
            message: `Carregadas ${fetchedCandles.length} velas locais.`
          });
        } else {
          // Fallback automático transparente para Nuvem/Supabase quando o Add-on Local não está ativo ou não tem barras
          addReplayLog('SISTEMA', `⚠️ Add-on Local (:8002) sem velas para ${activePanel?.name || 'NQ'} — buscando automaticamente na Nuvem (Supabase)...`);
          effectiveSource = 'supabase';
        }
      }

      if (effectiveSource === 'supabase' || !fetchedCandles || fetchedCandles.length === 0) {
        addReplayLog('SISTEMA', `🔍 Consultando Nuvem/Supabase (${targetInstance}): Replay de ${sDate} até ${eDate} com 2 dias de histórico prévio (desde ${lookbackStartDate})...`);
        fetchedCandles = await fetchCandlesByDateRangeSupabase(
          targetInstance,
          startISO,
          endISO,
          (prog: any) => {
            if (reqId !== loadRequestIdRef.current) return;
            if (typeof prog === 'object' && prog !== null) {
              setLoadingProgress(prog);
            } else {
              const numPct = typeof prog === 'string' ? parseInt(prog.replace('%', ''), 10) : Number(prog || 0);
              setLoadingProgress(prev => ({
                percent: isNaN(numPct) ? 0 : numPct,
                loadedRows: prev?.loadedRows || 0,
                totalRows: prev?.totalRows || 0,
                message: prev?.message || 'Carregando dados...'
              }));
            }
          },
          activePanel?.name,
          settings
        );
        if (reqId !== loadRequestIdRef.current) return;

        if (!fetchedCandles || fetchedCandles.length === 0) {
          alert(`Nenhum candle encontrado no banco de dados para ${activePanel?.name || 'NQ'} entre ${sDate} e ${eDate}.\r\n\r\nIntervalo disponível no banco: ${minAvailableDate || 'N/A'} até ${maxAvailableDate || 'N/A'}.`);
          setIsLoadingData(false);
          return;
        }
      }

      fetchedCandles.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Localizar o primeiro candle pertencente à data de início do Replay (sDate) usando epoch ms (Regra 9.5)
      const startTargetMs = new Date(`${sDate}T00:00:00Z`).getTime();
      let startIdx = fetchedCandles.findIndex(c => {
        const t = new Date(c.timestamp).getTime();
        return !isNaN(t) && t >= startTargetMs;
      });
      if (startIdx < 0) startIdx = 0;

      setRawCandles(fetchedCandles);
      rawCandlesRef.current = fetchedCandles;
      setStartReplayIndex(startIdx);
      startReplayIndexRef.current = startIdx;
      loadedDateRangeRef.current = { start: sDate, end: eDate, source: dataSource, panelId: activePanel?.id };

      let finalIdx = startIdx;
      if (targetJumpTimeISO) {
        const targetMs = new Date(targetJumpTimeISO).getTime();
        let closestIdx = startIdx;
        let minDiff = Infinity;
        for (let i = 0; i < fetchedCandles.length; i++) {
          const cMs = new Date(fetchedCandles[i].timestamp).getTime();
          const diff = Math.abs(cMs - targetMs);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = i;
          }
        }
        finalIdx = Math.max(startIdx, Math.min(fetchedCandles.length - 1, closestIdx));
      } else if (effectiveSource === 'local') {
        // No modo Add-on Local, o replay se posiciona na barra mais recente que o NinjaTrader emitiu
        finalIdx = fetchedCandles.length - 1;
      } else if (!resetPosition) {
        const savedCandleIdx = localStorage.getItem('vortex_replay_current_index');
        const restoredCandleIdx = savedCandleIdx !== null ? Number(savedCandleIdx) : startIdx;
        finalIdx = Math.max(startIdx, Math.min(fetchedCandles.length - 1, restoredCandleIdx));
      }

      setCurrentCandleIndex(finalIdx);
      currentCandleIndexRef.current = finalIdx;
      currentSecondRef.current = 0;
      secondAccumulatorRef.current = 0;
      evaluatedRobotCandlesRef.current = {};
      resetReplaySequenceStates();

      const initialCandle = fetchedCandles[finalIdx] || fetchedCandles[startIdx] || fetchedCandles[0];
      const firstPrice = initialCandle.close;
      setCurrentPrice(firstPrice);
      currentPriceRef.current = firstPrice;

      const d = new Date(initialCandle.timestamp);
      setCurrentSimulatedTime(d.toLocaleString('pt-BR'));

      const lookbackCount = startIdx;
      const replayCount = fetchedCandles.length - startIdx;
      const sourceLabel = effectiveSource === 'local' ? 'Add-on Local NT8' : 'Nuvem/Supabase';
      addReplayLog('SISTEMA', `✅ ${fetchedCandles.length} candles carregados via ${sourceLabel} (${lookbackCount} velas prévias de histórico + ${replayCount} velas para o Replay).`);
      setFitChartTrigger(prev => prev + 1);
      setIsLoadingData(false);

      // Sincronização inicial imediata dos widgets com base nos candles carregados
      if (initialCandle) {
        const tMs = new Date(initialCandle.timestamp).getTime();
        syncReplayWidgetData(finalIdx, Number(initialCandle.close), tMs, 0);
      }

      // Carregar Níveis Gamma, Forças Históricas (1m) e Notícias em segundo plano
      fetchGammaLevelsForRangeSupabase(targetInstance, startISO, endISO).then(gammas => {
        if (reqId !== loadRequestIdRef.current) return;
        allGammaLevelsRef.current = gammas || [];
        if (gammas && gammas.length > 0) {
          setGammaLevels(parseGammaLevelRecord(gammas[0]));
        }
      }).catch(err => console.warn('Erro ao carregar níveis gamma no replay:', err));

      fetchForcesForRangeSupabase(targetInstance, startISO, endISO).then(forcesData => {
        if (reqId !== loadRequestIdRef.current) return;
        allReplayForcesRef.current = forcesData || [];
        if (forcesData && forcesData.length > 0) {
          addReplayLog('SISTEMA', `💪 ${forcesData.length} registros de Força Momentum (1m) carregados para sincronização nos Widgets.`);
        }
        if (initialCandle) {
          const tMs = new Date(initialCandle.timestamp).getTime();
          syncReplayWidgetData(finalIdx, Number(initialCandle.close), tMs, 0);
        }
      }).catch(err => console.warn('Erro ao carregar histórico de forças no replay:', err));

      fetchNewsForRangeSupabase(startISO, endISO).then(newsData => {
        if (reqId !== loadRequestIdRef.current) return;
        setNewsList(newsData || []);
      }).catch(err => console.warn('Erro ao carregar notícias no replay:', err));
    } catch (err) {
      console.error('Erro ao carregar dados de replay:', err);
      if (reqId === loadRequestIdRef.current) {
        alert('Erro ao buscar dados históricos do replay.');
      }
    } finally {
      if (reqId === loadRequestIdRef.current) {
        setIsLoadingData(false);
      }
    }
  }, [activePanel, dataSource, settings, startDate, endDate, minAvailableDate, maxAvailableDate, addReplayLog]);

  // Alterar Ativo com Confirmação e Reinicialização Segura do Replay
  const handleSwitchPanelAsset = useCallback((newPanelId: string) => {
    if (!newPanelId || newPanelId === activePanel?.id) return;
    const targetPanel = panels?.find((p: any) => p.id === newPanelId);
    const targetName = targetPanel?.name?.replace(/\s*\([^)]*\)/g, '').trim() || 'novo ativo';

    const isReplayActive = isPlaying || orders.length > 0 || currentCandleIndex > startReplayIndexRef.current;
    if (isReplayActive) {
      const confirmed = window.confirm(
        `⚠️ Atenção: O Replay de Mercado está em execução ou possui operações ativas.\r\n\r\nAo alterar o ativo para "${targetName}", o replay atual será reinicializado e os dados históricos do novo ativo serão carregados.\r\n\r\nDeseja confirmar e reiniciar o Replay?`
      );
      if (!confirmed) return;
    }

    setIsPlaying(false);
    setOrders([]);
    ordersRef.current = [];
    switchPanel(newPanelId);
  }, [activePanel, panels, isPlaying, orders, currentCandleIndex, switchPanel]);

  useEffect(() => {
    if (startDate && endDate) {
      const cur = loadedDateRangeRef.current;
      if (
        !cur ||
        cur.start !== startDate ||
        cur.end !== endDate ||
        cur.source !== dataSource ||
        cur.panelId !== activePanel?.id
      ) {
        handleLoadData(startDate, endDate, undefined, false);
      }
    }
  }, [startDate, endDate, dataSource, activePanel?.id, handleLoadData]);

  // Exibir histórico completo acumulado até o ponto do replay (suporta períodos amplos de até 15.000+ velas)
  const displayedCandles = useMemo(() => {
    if (rawCandles.length === 0) return [];
    // Janela ampla (até 15.000 velas de 1m = ~15 dias completos de pregão contínuo)
    const maxWindow = 15000;
    const startIndex = Math.max(0, currentCandleIndex - maxWindow);
    const completedSlice = rawCandles.slice(startIndex, currentCandleIndex);
    const currentRaw = rawCandles[currentCandleIndex];
    if (!currentRaw) return aggregateReplayCandles(completedSlice, timeframe);

    const liveCandle = currentFormingCandle || currentRaw;
    const combinedSlice = [...completedSlice, liveCandle];
    return aggregateReplayCandles(combinedSlice, timeframe);
  }, [rawCandles, currentCandleIndex, currentFormingCandle, timeframe]);

  // Sincroniza em tempo real os dados históricos para os Widgets flutuantes (Força, Acelerômetro, Sentimento, Delta, ML Radar)
  const syncReplayWidgetData = useCallback((idx: number, simPrice: number, simTimeMs: number, sec: number) => {
    const candlesList = rawCandlesRef.current;
    if (candlesList.length === 0 || idx < 0 || idx >= candlesList.length) return;

    const slice = candlesList.slice(0, idx + 1);
    const currentF = getReplayForcesAtTime(allReplayForcesRef.current, simTimeMs);
    setReplayForces(currentF);

    const sym = activePanelRef.current?.symbol || 'NQ';
    const simMarketData = calculateReplayMarketData(slice, simPrice, currentF, sym, sec);
    setReplayMarketData(simMarketData);

    const simRadar = calculateReplayAxionRadar(slice, simPrice, gammaLevelsRef.current);
    setReplayAxionRadar(simRadar);
  }, []);

  // Avançar Segundo a Segundo (1x = 1s de mercado a cada 1s real com oscilação fractal e ruído orgânico)
  const advanceReplaySeconds = useCallback((deltaSeconds: number) => {
    const candlesList = rawCandlesRef.current;
    if (candlesList.length === 0) return;

    let idx = currentCandleIndexRef.current;
    let sec = currentSecondRef.current + deltaSeconds;

    if (idx >= candlesList.length) {
      setIsPlaying(false);
      addReplayLog('SISTEMA', 'Fim dos dados históricos do período.');
      return;
    }

    // Se passou de 60s, avança as velas correspondentes
    let candleAdvance = 0;
    while (sec >= 60) {
      sec -= 60;
      candleAdvance++;
    }

    if (candleAdvance > 0) {
      idx = Math.min(candlesList.length - 1, idx + candleAdvance);
      setCurrentCandleIndex(idx);
      currentCandleIndexRef.current = idx;
    }

    currentSecondRef.current = sec;

    const currentCandle = candlesList[idx];
    if (!currentCandle) return;

    // Cálculo da oscilação fractal realista e formação da vela viva
    const { currentPrice: simulatedPrice, formingCandle } = calculateIntraCandleSimulatedState(
      currentCandle,
      sec,
      idx
    );

    const isFastSpeed = speedRef.current >= 50 || deltaSeconds >= 60;
    const finalFormingCandle = isFastSpeed ? { ...currentCandle } : formingCandle;

    const activePrice = isFastSpeed ? Number(currentCandle.close) : simulatedPrice;
    setCurrentPrice(activePrice);
    currentPriceRef.current = activePrice;
    setCurrentFormingCandle(finalFormingCandle);

    // Calcular Data/Hora exata com segundos
    const baseTimeMs = new Date(currentCandle.timestamp).getTime();
    const simulatedDate = new Date(baseTimeMs + sec * 1000);
    const formattedTime = simulatedDate.toLocaleString('pt-BR');
    setCurrentSimulatedTime(formattedTime);

    // Sincronizar dados históricos dos Widgets flutuantes (Força de Momentum, Z-Score, ATR Ratio, Sentimento, Delta, ML Radar)
    syncReplayWidgetData(idx, activePrice, simulatedDate.getTime(), sec);

    // 1. Checagem de Ordens Pendentes (Executar Limit / Stop ao toque)
    const currentOrders = [...ordersRef.current];
    let ordersModified = false;

    currentOrders.forEach(o => {
      if (o.status === 'Pendente') {
        const targetPrice = o.order_price || o.entry_price;
        let triggered = false;

        if (o.type === 'LIMIT') {
          if (o.side === 'COMPRA' && simulatedPrice <= targetPrice) triggered = true;
          if (o.side === 'VENDA' && simulatedPrice >= targetPrice) triggered = true;
        } else if (o.type === 'STOP') {
          if (o.side === 'COMPRA' && simulatedPrice >= targetPrice) triggered = true;
          if (o.side === 'VENDA' && simulatedPrice <= targetPrice) triggered = true;
        }

        if (triggered) {
          o.status = 'Em Andamento';
          o.entry_price = simulatedPrice;
          o.entry_time = simulatedDate.toISOString();
          ordersModified = true;
          addReplayLog('ORDEM', `⚡ Ordem Pendente Executada: ${o.side} @ ${simulatedPrice.toFixed(2)} (${o.strategy_name})`);
        }
      }
    });

    // 2. Checagem de Posições Ativas (Stop Loss, Take Profit, ATM)
    currentOrders.forEach(o => {
      if (o.status === 'Em Andamento') {
        const isLong = o.side === 'COMPRA';
        const currentPoints = isLong ? simulatedPrice - o.entry_price : o.entry_price - simulatedPrice;

        if (!o.highest_favorable_price || (isLong ? simulatedPrice > o.highest_favorable_price : simulatedPrice < o.highest_favorable_price)) {
          o.highest_favorable_price = simulatedPrice;
        }

        const maxFavorablePts = isLong
          ? (o.highest_favorable_price ? o.highest_favorable_price - o.entry_price : currentPoints)
          : (o.highest_favorable_price ? o.entry_price - o.highest_favorable_price : currentPoints);
        const pointsForTrail = Math.max(currentPoints, maxFavorablePts);

        // ATM Breakeven & Trailing Stop
        let candidateStop: number | null = null;
        
        // Auto-Breakeven
        if (o.atm_breakeven_trigger_pts && pointsForTrail >= o.atm_breakeven_trigger_pts) {
          const offset = o.atm_breakeven_offset_pts || 0;
          candidateStop = isLong ? o.entry_price + offset : o.entry_price - offset;
        }

        // Trailing Stop
        if (o.atm_trailing_trigger_pts && o.atm_trailing_dist_pts && pointsForTrail >= o.atm_trailing_trigger_pts) {
          const steps = Math.floor((pointsForTrail - o.atm_trailing_trigger_pts) / o.atm_trailing_dist_pts);
          const targetTrail = isLong
            ? o.entry_price + (o.atm_trailing_trigger_pts - o.atm_trailing_dist_pts) + (steps * o.atm_trailing_dist_pts)
            : o.entry_price - (o.atm_trailing_trigger_pts - o.atm_trailing_dist_pts) - (steps * o.atm_trailing_dist_pts);
          candidateStop = candidateStop === null ? targetTrail : (isLong ? Math.max(candidateStop, targetTrail) : Math.min(candidateStop, targetTrail));
        }

        if (candidateStop !== null) {
          const isBetter = isLong
            ? (o.stop_loss === null || candidateStop > o.stop_loss)
            : (o.stop_loss === null || candidateStop < o.stop_loss);
          if (isBetter) {
            o.stop_loss = candidateStop;
            o.breakeven_applied = true;
            ordersModified = true;
            addReplayLog('ATM', `🛡️ Proteção ATM [${o.strategy_name}]: Novo Stop Loss @ ${candidateStop.toFixed(2)}`);
          }
        }

        // Checar Take Profit
        if (o.take_profit) {
          const hitTP = isLong ? simulatedPrice >= o.take_profit : simulatedPrice <= o.take_profit;
          if (hitTP) {
            o.status = 'Gain';
            o.exit_price = o.take_profit;
            o.exit_time = simulatedDate.toISOString();
            o.points = isLong ? o.take_profit - o.entry_price : o.entry_price - o.take_profit;
            o.profit_usd = o.points * o.contrato * pointValue;
            o.close_reason = 'TP';
            ordersModified = true;

            const updatedAcc = { ...replayAccountRef.current, balance: (replayAccountRef.current.balance || 50000) + o.profit_usd };
            setReplayAccount(updatedAcc);
            replayAccountRef.current = updatedAcc;

            addReplayLog('ORDEM', `🎯 TAKE PROFIT Atingido: +$${o.profit_usd.toFixed(2)} (+${o.points.toFixed(2)} pts)`);
          }
        }

        // Checar Stop Loss
        if (o.stop_loss && o.status === 'Em Andamento') {
          const hitSL = isLong ? simulatedPrice <= o.stop_loss : simulatedPrice >= o.stop_loss;
          if (hitSL) {
            o.status = 'Loss';
            o.exit_price = o.stop_loss;
            o.exit_time = simulatedDate.toISOString();
            o.points = isLong ? o.stop_loss - o.entry_price : o.entry_price - o.stop_loss;
            o.profit_usd = o.points * o.contrato * pointValue;
            o.close_reason = 'SL';
            ordersModified = true;

            const updatedAcc = { ...replayAccountRef.current, balance: (replayAccountRef.current.balance || 50000) + o.profit_usd };
            setReplayAccount(updatedAcc);
            replayAccountRef.current = updatedAcc;

            addReplayLog('ORDEM', `🛑 STOP LOSS Acionado: -$${Math.abs(o.profit_usd).toFixed(2)} (${o.points.toFixed(2)} pts)`);
          }
        }
      }
    });

    // 3. Avaliação dos Robôs e Prompts Vinculados
    const linkedStratsNorm = linkedStrategyIdsRef.current.map(x => String(x));
    const linkedPromptsNorm = linkedPromptIdsRef.current.map(x => String(x));
    const activeStrats = (customStrategiesRef.current || []).filter((s: any) => s && s.id && linkedStratsNorm.includes(String(s.id)));
    const activePrompts = (promptsRef.current || []).filter((p: any) => p && p.id && linkedPromptsNorm.includes(String(p.id)));
    const sliceForRobots = candlesList.slice(Math.max(0, idx - 500), idx + 1);
    const consolidatedCandle = idx > 0 ? candlesList[idx - 1] : currentCandle;

    activeStrats.forEach((strat: any) => {
      const execMode = strat.execution_mode || 'closed';
      const stratTf = (strat as any).timeframe || 1;

      // Se o robô opera em timeframe agregado (ex: 3m, 5m), identifica o timestamp da vela consolidada desse timeframe
      let targetTimestamp = consolidatedCandle.timestamp;
      let closedCandleTimeStr = consolidatedCandle?.timestamp ? getRawSystemTime(consolidatedCandle.timestamp, true) : '';

      if (stratTf > 1) {
        const pool = aggregateReplayCandles(sliceForRobots, stratTf);
        const closedTfCandle = pool.length >= 2 ? pool[pool.length - 2] : null;
        if (closedTfCandle) {
          targetTimestamp = closedTfCandle.timestamp;
          closedCandleTimeStr = getRawSystemTime(closedTfCandle.timestamp, true);
        }
      }

      // 1. Controle Temporal: Barra Fechada (apenas 1 vez por candle consolidado) vs Barra Corrente (Realtime com cooldown)
      if (execMode === 'closed') {
        // Modo Barra Fechada avalia estritamente quando um candle fecha e a nova barra se inicia
        if (sec !== 0 && sec !== 59 && candleAdvance === 0) return;
        if (evaluatedRobotCandlesRef.current[strat.id] === targetTimestamp) return;
      } else {
        // Modo Barra Corrente (Realtime) avalia durante a formação com cooldown de 60s
        const lastEvalTime = lastRealtimeEvalTimeRef.current[strat.id] || 0;
        if (simulatedDate.getTime() - lastEvalTime < 60000) return;
      }

      const padFn = (n: number) => String(n).padStart(2, '0');
      const simTimeStr = `${padFn(simulatedDate.getHours())}:${padFn(simulatedDate.getMinutes())}:${padFn(simulatedDate.getSeconds())}`;
      if (!closedCandleTimeStr) closedCandleTimeStr = simTimeStr;

      const evalRes = evaluateReplayRobot(strat, sliceForRobots, gammaLevelsRef.current, pointValueRef.current, simTimeStr, closedCandleTimeStr);
      if (evalRes.side) {
        if (execMode === 'closed') {
          evaluatedRobotCandlesRef.current[strat.id] = targetTimestamp;
        } else {
          lastRealtimeEvalTimeRef.current[strat.id] = simulatedDate.getTime();
        }

        // Checar se há Prompts IA vinculados a este robô
        const linkedPromptsForRobot = activePrompts.filter((p: any) => p.trigger_strategy_id === strat.id);
        const hasLinkedPrompt = linkedPromptsForRobot.length > 0;

        if (hasLinkedPrompt) {
          linkedPromptsForRobot.forEach((p: any) => {
            addReplayLog('IA COPILOT', `🧠 Prompt "${p.title || p.name}" acionado pelo robô "${strat.name}" (${evalRes.side} @ ${simulatedPrice.toFixed(2)})`);
          });
        }

        // MODO INDICADOR (Ação: Alerta) -> Plota marcador visual no gráfico e emite popup toast
        if (strat.action === 'alert' && !hasLinkedPrompt) {
          const alertTime = (execMode === 'closed' && consolidatedCandle?.timestamp)
            ? (typeof consolidatedCandle.timestamp === 'number' ? new Date(consolidatedCandle.timestamp * 1000).toISOString() : consolidatedCandle.timestamp)
            : simulatedDate.toISOString();

          setCustomSignals(prev => [
            ...prev,
            {
              id: `alert-${Date.now()}-${Math.random()}`,
              strategyId: strat.id,
              strategyName: strat.name,
              side: evalRes.side,
              action: 'alert',
              time: alertTime,
              price: simulatedPrice
            }
          ]);

          addReplayLog('ROBÔ ALERTA', `🔔 ${strat.name}: Alerta de ${evalRes.side} @ ${simulatedPrice.toFixed(2)}`);
          setReplayAlertToast({
            id: `toast-${Date.now()}-${Math.random()}`,
            title: `🔔 [ALERTA] ${strat.name}`,
            message: `Sinal de ${evalRes.side} detectado em ${currentSymbol} @ ${simulatedPrice.toFixed(2)}`,
            side: evalRes.side,
            time: simulatedDate.toLocaleTimeString('pt-BR')
          });
        } else {
          // MODO ESTRATÉGIA (Ação: Posição) -> Execução rigorosa com gestão de risco
          const opCheck = checkReplayOperationalLimits(replayAccountRef.current, ordersRef.current, currentCandle.timestamp);
          if (!opCheck.allowed) {
            addReplayLog('ROBÔ RISCO', `⚠️ Ordem bloqueada por limite da Conta Replay: ${opCheck.reason}`);
            return;
          }

          // 1. Regra de Posição Única por Ativo (NUNCA permite mais de 1 ordem em andamento no mesmo ativo/painel)
          const hasOpenSameAsset = ordersRef.current.some(o => 
            o.status === 'Em Andamento' && 
            (o.symbol === currentSymbol || o.symbol === activePanel?.name || !o.symbol)
          );
          if (hasOpenSameAsset) {
            return;
          }

          // 2. Regra de Múltiplos Sinais Globais (se allow_multi_signals for false, bloqueia se houver qualquer posição aberta na conta)
          const hasAnyOpen = ordersRef.current.some(o => o.status === 'Em Andamento');
          if (hasAnyOpen && !replayAccountRef.current.allow_multi_signals) {
            return;
          }

          const orderStrategyName = hasLinkedPrompt 
            ? `IA ${linkedPromptsForRobot[0].title || (linkedPromptsForRobot[0] as any).name}`
            : `Robô ${strat.name}`;

          const signalTimeStr = (execMode === 'closed' && consolidatedCandle?.timestamp)
            ? (typeof consolidatedCandle.timestamp === 'number' ? new Date(consolidatedCandle.timestamp * 1000).toISOString() : consolidatedCandle.timestamp)
            : simulatedDate.toISOString();

          // Resolução da Estratégia ATM associada ao Robô
          const algoAtmObj: ATMStrategy | null = resolveAlgorithmAtm(strat, atmStrategiesRef.current);
          const isUsingAtm = Boolean(strat.risk_settings?.use_atm !== false && algoAtmObj && algoAtmObj.brackets && algoAtmObj.brackets.length > 0);
          const bracketsToExecute: ATMBracket[] = isUsingAtm && algoAtmObj ? algoAtmObj.brackets : [];
          const evaluatedSide: 'COMPRA' | 'VENDA' = evalRes.side as 'COMPRA' | 'VENDA';

          if (isUsingAtm && bracketsToExecute.length > 0 && algoAtmObj) {
            // Executar todos os brackets configurados na ATM
            bracketsToExecute.forEach((bracket, idx) => {
              const bracketLots = Math.max(1, Number(bracket.quantity) || 1);
              const actualSlPts = bracket.stopLossPts;
              const actualTpPts = bracket.takeProfitPts;
              const bSlPrice = evaluatedSide === 'COMPRA' ? simulatedPrice - actualSlPts : simulatedPrice + actualSlPts;
              const bTpPrice = evaluatedSide === 'COMPRA' ? simulatedPrice + actualTpPts : simulatedPrice - actualTpPts;

              const beStr = bracket.autoBreakevenEnabled ? ` | BE: ${bracket.autoBreakevenTriggerPts}+${bracket.autoBreakevenOffsetPts ?? 0}` : '';
              const trailStr = bracket.trailingStopEnabled ? ` | TRAIL: ${bracket.trailingStopTriggerPts}/${bracket.trailingStopStepPts}` : '';
              const stratOrderName = bracketsToExecute.length > 1 ? `${orderStrategyName} (Alvo ${idx + 1})` : orderStrategyName;

              const newOrder: ReplayOrder = {
                id: `replay-order-atm-${Date.now()}-${idx}-${Math.random()}`,
                account_id: replayAccountRef.current.id,
                strategy_id: strat.id,
                strategy_name: stratOrderName,
                side: evaluatedSide,
                type: 'MARKET',
                entry_price: simulatedPrice,
                stop_loss: bSlPrice,
                take_profit: bTpPrice,
                exit_price: null,
                status: 'Em Andamento',
                contrato: bracketLots,
                entry_time: simulatedDate.toISOString(),
                signal_time: signalTimeStr,
                description: `Robô ${strat.name} [ATM: ${algoAtmObj.name} - Alvo ${idx + 1}] (${bracketLots}x - SL: ${actualSlPts}pt / TP: ${actualTpPts}pt${beStr}${trailStr})`,
                instance_id: activePanel?.instance_id || 'nasdaq',
                symbol: currentSymbol || activePanel?.name || 'NQ',
                atm_breakeven_trigger_pts: bracket.autoBreakevenEnabled ? bracket.autoBreakevenTriggerPts : undefined,
                atm_breakeven_offset_pts: bracket.autoBreakevenEnabled ? (bracket.autoBreakevenOffsetPts ?? 0) : undefined,
                atm_trailing_trigger_pts: bracket.trailingStopEnabled ? bracket.trailingStopTriggerPts : undefined,
                atm_trailing_dist_pts: bracket.trailingStopEnabled ? bracket.trailingStopStepPts : undefined
              };

              currentOrders.push(newOrder);
            });

            ordersModified = true;
            addReplayLog('ROBÔ EXECUÇÃO', `🤖 Ordem Autônoma ATM: ${evalRes.side} (${bracketsToExecute.length} alvos) @ ${simulatedPrice.toFixed(2)} [${algoAtmObj.name}]`);
          } else {
            // Gestão de Risco do Robô Tradicional (Contratos, Stop e Take configurados)
            const lots = strat.risk_settings?.lots ? Number(strat.risk_settings.lots) : (strat.contracts || 1);
            const slPts = strat.risk_settings?.stop_value ? Number(strat.risk_settings.stop_value) : defaultStopLossPts;
            const tpPts = strat.risk_settings?.take_value ? Number(strat.risk_settings.take_value) : defaultTakeProfitPts;
            const slPrice = evalRes.side === 'COMPRA' ? simulatedPrice - slPts : simulatedPrice + slPts;
            const tpPrice = evalRes.side === 'COMPRA' ? simulatedPrice + tpPts : simulatedPrice - tpPts;

            const newOrder: ReplayOrder = {
              id: `replay-order-${Date.now()}-${Math.random()}`,
              account_id: replayAccountRef.current.id,
              strategy_id: strat.id,
              strategy_name: orderStrategyName,
              side: evalRes.side,
              type: 'MARKET',
              entry_price: simulatedPrice,
              stop_loss: slPrice,
              take_profit: tpPrice,
              exit_price: null,
              status: 'Em Andamento',
              contrato: lots,
              entry_time: simulatedDate.toISOString(),
              signal_time: signalTimeStr,
              description: hasLinkedPrompt
                ? `Prompt IA ${linkedPromptsForRobot[0].title || (linkedPromptsForRobot[0] as any).name} [Gatilho: ${strat.name}]`
                : `Robô ${strat.name} [Replay]`,
              instance_id: activePanel?.instance_id || 'nasdaq',
              symbol: currentSymbol || activePanel?.name || 'NQ'
            };

            currentOrders.push(newOrder);
            ordersModified = true;
            addReplayLog('ROBÔ EXECUÇÃO', `🤖 Ordem Autônoma: ${evalRes.side} ${newOrder.contrato}x @ ${simulatedPrice.toFixed(2)} (${orderStrategyName})`);
          }
        }
      }
    });

    // 4. Avaliação de Gatilhos de Desenhos Técnicos
    const curDrawings = [...drawingsRef.current];
    const drawingsToDelete: string[] = [];
    const prevCandle = idx > 0 ? candlesList[idx - 1] : currentCandle;

    curDrawings.forEach(d => {
      if (!d.trigger || !d.trigger.enabled || d.trigger.status !== 'armed') return;

      const evalRes = evaluateDrawingTrigger(d, finalFormingCandle as any, prevCandle as any);
      if (evalRes && evalRes.triggered) {
        const opCheck = checkReplayOperationalLimits(replayAccountRef.current, ordersRef.current, currentCandle.timestamp);
        if (!opCheck.allowed) {
          addReplayLog('DESENHO RISCO', `⚠️ Gatilho desarmado: ${opCheck.reason}`);
          drawingsToDelete.push(d.id);
          return;
        }

        const hasOpen = ordersRef.current.some(o => o.status === 'Em Andamento');
        if (hasOpen && !replayAccountRef.current.allow_multi_signals) {
          return;
        }

        // Marca a ferramenta de desenho para exclusão imediata após disparo
        drawingsToDelete.push(d.id);

        const entryPrice = simulatedPrice;
        const pointVal = activePanelRef.current?.point_value !== undefined && activePanelRef.current?.point_value !== null ? Number(activePanelRef.current.point_value) : 1.0;

        const mgmt = calculateTradeManagement({
          side: evalRes.side,
          entryPrice,
          panelSettings: settingsRef.current,
          globalSettings: settingsRef.current,
          gammaLevels: gammaLevelsRef.current,
          pointValue: pointVal,
          isReplay: true
        });

        if (mgmt.isATMActive && mgmt.activeATM && mgmt.activeATM.brackets) {
          for (let bIdx = 0; bIdx < mgmt.activeATM.brackets.length; bIdx++) {
            const bracket = mgmt.activeATM.brackets[bIdx];
            const bSlPts = bracket.stopLossPts;
            const bTpPts = bracket.takeProfitPts;
            const bSlPrice = evalRes.side === 'COMPRA' ? entryPrice - bSlPts : entryPrice + bSlPts;
            const bTpPrice = evalRes.side === 'COMPRA' ? entryPrice + bTpPts : entryPrice - bTpPts;

            const newOrder: ReplayOrder = {
              id: `drawing-order-${Date.now()}-${Math.random()}-${bIdx}`,
              account_id: replayAccountRef.current.id,
              strategy_name: mgmt.activeATM.brackets.length > 1 ? `${evalRes.description} (Alvo ${bIdx + 1})` : (evalRes.description || 'Gatilho de Desenho'),
              side: evalRes.side,
              type: 'MARKET',
              entry_price: entryPrice,
              stop_loss: Number(bSlPrice.toFixed(2)),
              take_profit: Number(bTpPrice.toFixed(2)),
              exit_price: null,
              status: 'Em Andamento',
              contrato: bracket.quantity,
              entry_time: simulatedDate.toISOString(),
              description: `Traçado [${evalRes.description}] - ${mgmt.activeATM.name} (${bracket.quantity}x - SL: ${bSlPts}pt / TP: ${bTpPts}pt)`,
              instance_id: activePanelRef.current?.instance_id || 'nasdaq',
              symbol: currentSymbol || activePanel?.name || 'NQ'
            };
            currentOrders.push(newOrder);
          }
        } else {
          const contracts = mgmt.contracts;
          const slPrice = mgmt.slPrice;
          const tpPrice = mgmt.tpPrice;

          const newOrder: ReplayOrder = {
            id: `drawing-order-${Date.now()}-${Math.random()}`,
            account_id: replayAccountRef.current.id,
            strategy_name: evalRes.description || 'Gatilho de Desenho',
            side: evalRes.side,
            type: 'MARKET',
            entry_price: entryPrice,
            stop_loss: slPrice,
            take_profit: tpPrice,
            exit_price: null,
            status: 'Em Andamento',
            contrato: contracts,
            entry_time: simulatedDate.toISOString(),
            description: `Traçado [${evalRes.description}] (${contracts}x @ ${entryPrice.toFixed(2)})`,
            instance_id: activePanelRef.current?.instance_id || 'nasdaq',
            symbol: currentSymbol || activePanel?.name || 'NQ'
          };
          currentOrders.push(newOrder);
        }

        ordersModified = true;
        addReplayLog('DESENHO EXECUÇÃO', `✏️ Gatilho do Traçado: ${evalRes.side} @ ${simulatedPrice.toFixed(2)} [${evalRes.description}]`);
      }
    });

    if (drawingsToDelete.length > 0) {
      const updatedDrawings = curDrawings.filter(d => !drawingsToDelete.includes(d.id));
      setDrawings(updatedDrawings);
      drawingsRef.current = updatedDrawings;
    }

    if (ordersModified) {
      setOrders(currentOrders);
      ordersRef.current = currentOrders;
    }
  }, [addReplayLog]);

  // Sincronização em tempo real quando operando via NinjaTrader Playback Connection
  useEffect(() => {
    if (dataSource !== 'local' || !isNinjaPlaybackActive) return;

    let isSubscribed = true;

    const handleStreamerTick = (e: any) => {
      if (!isSubscribed || !e.detail) return;
      const tick = e.detail;
      const sym = (tick.symbol || '').toUpperCase();
      const currentSym = (activePanelRef.current?.symbol || 'NQ').toUpperCase();
      if (sym && currentSym && !sym.includes(currentSym) && !currentSym.includes(sym)) return;

      const price = Number(tick.price || 0);
      if (price <= 0) return;

      setCurrentPrice(price);
      currentPriceRef.current = price;

      const rawTime = tick.timestamp || new Date().toISOString();
      const d = new Date(rawTime);
      if (!isNaN(d.getTime())) {
        setCurrentSimulatedTime(d.toLocaleString('pt-BR'));
      }

      // Atualiza a vela em formação viva
      setCurrentFormingCandle(prev => {
        if (!prev) {
          return {
            timestamp: rawTime,
            open: Number(tick.open || price),
            high: Math.max(Number(tick.high || price), price),
            low: Math.min(Number(tick.low || price), price),
            close: price,
            volume: Number(tick.volume || 1)
          };
        }
        return {
          ...prev,
          high: Math.max(prev.high, price),
          low: Math.min(prev.low, price),
          close: price,
          volume: Number(tick.volume || prev.volume || 1)
        };
      });

      // Se for uma barra fechada emitida pelo NinjaTrader
      if (tick.isBar && rawCandlesRef.current.length > 0) {
        const lastCandle = rawCandlesRef.current[rawCandlesRef.current.length - 1];
        if (!lastCandle || lastCandle.timestamp !== tick.timestamp) {
          const newBar: Candle = {
            timestamp: tick.timestamp,
            open: Number(tick.open || price),
            high: Number(tick.high || price),
            low: Number(tick.low || price),
            close: Number(tick.close || price),
            volume: Number(tick.volume || 0)
          };
          setRawCandles(prev => [...prev, newBar]);
          rawCandlesRef.current = [...rawCandlesRef.current, newBar];
          const newIdx = rawCandlesRef.current.length - 1;
          setCurrentCandleIndex(newIdx);
          currentCandleIndexRef.current = newIdx;
        }
      }

      const curIdx = currentCandleIndexRef.current;
      syncReplayWidgetData(curIdx, price, d.getTime(), isNaN(d.getSeconds()) ? 0 : d.getSeconds());
    };

    window.addEventListener('vortex_streamer_tick', handleStreamerTick);

    // Polling de sincronização de barras consolidadas a cada 1.2s
    const pollInterval = setInterval(async () => {
      try {
        const latestCandles = await fetchStreamerHistoricalCandles(activePanelRef.current, undefined, undefined, settingsRef.current, true);
        if (isSubscribed && latestCandles && latestCandles.length > 0) {
          const currentCount = rawCandlesRef.current.length;
          if (latestCandles.length !== currentCount) {
            setRawCandles(latestCandles);
            rawCandlesRef.current = latestCandles;
            const newIdx = latestCandles.length - 1;
            setCurrentCandleIndex(newIdx);
            currentCandleIndexRef.current = newIdx;
            const lastC = latestCandles[newIdx];
            setCurrentPrice(Number(lastC.close));
            currentPriceRef.current = Number(lastC.close);
            const dt = new Date(lastC.timestamp);
            setCurrentSimulatedTime(dt.toLocaleString('pt-BR'));
            syncReplayWidgetData(newIdx, Number(lastC.close), dt.getTime(), 0);
          }
        }
      } catch {}
    }, 1200);

    return () => {
      isSubscribed = false;
      window.removeEventListener('vortex_streamer_tick', handleStreamerTick);
      clearInterval(pollInterval);
    };
  }, [dataSource, isNinjaPlaybackActive, syncReplayWidgetData]);

  // Intervalo do Timer: Dispara a cada 100ms acumulando deltaSeconds = (speed * 0.1)
  useEffect(() => {
    // Se o Replay estiver no modo Add-on Local com Playback do NinjaTrader ativo,
    // o avanço temporal é 100% governado pelo próprio NinjaTrader!
    if (dataSource === 'local' && isNinjaPlaybackActive) {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }
      return;
    }

    if (isPlaying) {
      replayTimerRef.current = setInterval(() => {
        const currentSpd = speedRef.current;
        if (currentSpd >= 1000) {
          // Modo MAX: Avança 180 segundos (3 minutos) por tick de 100ms
          advanceReplaySeconds(180);
        } else {
          const delta = currentSpd * 0.1;
          secondAccumulatorRef.current += delta;
          if (secondAccumulatorRef.current >= 1) {
            const wholeSecs = Math.floor(secondAccumulatorRef.current);
            secondAccumulatorRef.current -= wholeSecs;
            advanceReplaySeconds(wholeSecs);
          }
        }
      }, 100);
    } else {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }
    }
    return () => {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
      }
    };
  }, [isPlaying, advanceReplaySeconds]);

  // Controle de Play/Pause
  const handleTogglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  // Total de velas ativas da simulação (descontando o lookback de 2 dias)
  const totalReplayCandles = useMemo(() => {
    return Math.max(1, rawCandles.length - startReplayIndex);
  }, [rawCandles.length, startReplayIndex]);

  // Progresso do Scrubber (0% no início do Replay, 100% no fim dos dados)
  const progressPercent = useMemo(() => {
    if (totalReplayCandles <= 1) return 0;
    const currentOffset = Math.max(0, currentCandleIndex - startReplayIndex);
    return Math.min(100, Math.max(0, (currentOffset / (totalReplayCandles - 1)) * 100));
  }, [currentCandleIndex, startReplayIndex, totalReplayCandles]);

  // Seek / Scrub no Slider de Progresso
  const handleSeek = useCallback((percent: number) => {
    if (rawCandles.length === 0) return;
    const startIdx = startReplayIndexRef.current;
    const availableReplayCount = rawCandles.length - startIdx;
    const targetIdx = startIdx + Math.floor((percent / 100) * (availableReplayCount - 1));
    const clampedIdx = Math.max(startIdx, Math.min(rawCandles.length - 1, targetIdx));

    setCurrentCandleIndex(clampedIdx);
    currentCandleIndexRef.current = clampedIdx;
    currentSecondRef.current = 0;
    secondAccumulatorRef.current = 0;
    evaluatedRobotCandlesRef.current = {};
    resetReplaySequenceStates();

    const candle = rawCandles[clampedIdx];
    if (candle) {
      setCurrentPrice(candle.close);
      currentPriceRef.current = candle.close;
      setCurrentSimulatedTime(new Date(candle.timestamp).toLocaleString('pt-BR'));
      const tMs = new Date(candle.timestamp).getTime();
      syncReplayWidgetData(clampedIdx, Number(candle.close), tMs, 0);
    }
    setFitChartTrigger(prev => prev + 1);
  }, [rawCandles, syncReplayWidgetData]);

  // Avançar Intervalo de Tempo (+X minutos)
  const handleJumpTime = useCallback((minutes: number) => {
    if (rawCandles.length === 0) return;
    const nextIdx = Math.min(rawCandles.length - 1, currentCandleIndex + minutes);
    setCurrentCandleIndex(nextIdx);
    currentCandleIndexRef.current = nextIdx;
    currentSecondRef.current = 0;
    secondAccumulatorRef.current = 0;

    const candle = rawCandles[nextIdx];
    if (candle) {
      setCurrentPrice(candle.close);
      currentPriceRef.current = candle.close;
      setCurrentSimulatedTime(new Date(candle.timestamp).toLocaleString('pt-BR'));
      const tMs = new Date(candle.timestamp).getTime();
      syncReplayWidgetData(nextIdx, Number(candle.close), tMs, 0);
    }
    setFitChartTrigger(prev => prev + 1);
  }, [rawCandles, currentCandleIndex, syncReplayWidgetData]);

  // Próximo Candle
  const handleNextCandle = useCallback(() => {
    handleJumpTime(1);
  }, [handleJumpTime]);

  // Avançar para Data e Hora Específica
  const handleJumpToDateTime = useCallback(async (targetDateTimeStr: string) => {
    const targetMs = new Date(targetDateTimeStr).getTime();
    if (isNaN(targetMs)) {
      alert('Data e hora selecionadas são inválidas.');
      return;
    }

    const targetDateISO = targetDateTimeStr.split('T')[0];

    // Se a data solicitada estiver fora do intervalo carregado [startDate, endDate], recarrega com o novo intervalo
    const isOutsideRange = !startDate || !endDate || targetDateISO < startDate || targetDateISO > endDate || rawCandles.length === 0;

    if (isOutsideRange) {
      let newStart = startDate;
      let newEnd = endDate;

      if (!newStart || targetDateISO < newStart) {
        newStart = targetDateISO;
      }
      if (!newEnd || targetDateISO > newEnd) {
        newEnd = targetDateISO;
      }

      setStartDate(newStart);
      setEndDate(newEnd);
      await handleLoadData(newStart, newEnd, targetDateTimeStr, false);
      return;
    }

    let closestIdx = 0;
    let minDiff = Infinity;

    for (let i = 0; i < rawCandles.length; i++) {
      const candleMs = new Date(rawCandles[i].timestamp).getTime();
      const diff = Math.abs(candleMs - targetMs);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
      if (candleMs > targetMs && i > 0) {
        break;
      }
    }

    const startIdx = startReplayIndexRef.current;
    const clampedIdx = Math.max(startIdx, Math.min(rawCandles.length - 1, closestIdx));

    setCurrentCandleIndex(clampedIdx);
    currentCandleIndexRef.current = clampedIdx;
    currentSecondRef.current = 0;
    secondAccumulatorRef.current = 0;
    evaluatedRobotCandlesRef.current = {};
    resetReplaySequenceStates();

    const candle = rawCandles[clampedIdx];
    if (candle) {
      setCurrentPrice(candle.close);
      currentPriceRef.current = candle.close;
      const formatted = new Date(candle.timestamp).toLocaleString('pt-BR');
      setCurrentSimulatedTime(formatted);
      addReplayLog('SISTEMA', `⏩ Replay avançado para o horário: ${formatted}`);
    }
    setFitChartTrigger(prev => prev + 1);
  }, [rawCandles, startDate, endDate, handleLoadData, addReplayLog]);

  // Replay sem Gráfico (Execução rápida em lote)
  const handleFastForwardNoChart = useCallback(() => {
    if (rawCandles.length === 0) return;
    setIsPlaying(false);
    addReplayLog('SISTEMA', '⚡ Iniciando Replay sem Gráfico (Execução em lote de alta performance)...');

    const total = rawCandles.length;
    let localIndex = currentCandleIndexRef.current;

    while (localIndex < total) {
      currentCandleIndexRef.current = localIndex;
      currentSecondRef.current = 59;
      advanceReplaySeconds(60);
      localIndex++;
    }

    setCurrentCandleIndex(total - 1);
    currentCandleIndexRef.current = total - 1;
    addReplayLog('SISTEMA', '✅ Replay sem gráfico concluído com sucesso.');
    setFitChartTrigger(prev => prev + 1);
  }, [rawCandles, advanceReplaySeconds, addReplayLog]);

  // Reiniciar Replay (Volta para a data de início do Replay, preservando os 2 dias de lookback)
  const handleResetReplay = useCallback(() => {
    if (!window.confirm('Deseja reiniciar a simulação do replay e restaurar o saldo da Conta Replay?')) return;
    setIsPlaying(false);
    localStorage.removeItem('vortex_replay_orders');
    localStorage.removeItem('vortex_replay_current_index');
    localStorage.removeItem('vortex_replay_custom_signals');
    const startIdx = startReplayIndexRef.current;
    setCurrentCandleIndex(startIdx);
    currentCandleIndexRef.current = startIdx;
    currentSecondRef.current = 0;
    secondAccumulatorRef.current = 0;
    evaluatedRobotCandlesRef.current = {};
    resetReplaySequenceStates();
    lastRealtimeEvalTimeRef.current = {};
    setOrders([]);
    ordersRef.current = [];
    setCustomSignals([]);

    const restoredAcc = {
      ...replayAccount,
      balance: replayAccount.initial_balance || 50000,
      status: 'active' as const
    };
    setReplayAccount(restoredAcc);
    replayAccountRef.current = restoredAcc;

    if (rawCandles.length > startIdx) {
      const candle = rawCandles[startIdx];
      setCurrentPrice(candle.close);
      currentPriceRef.current = candle.close;
      setCurrentSimulatedTime(new Date(candle.timestamp).toLocaleString('pt-BR'));
      const tMs = new Date(candle.timestamp).getTime();
      syncReplayWidgetData(startIdx, Number(candle.close), tMs, 0);
    }

    addReplayLog('SISTEMA', '🔄 Replay reiniciado para o início do período selecionado.');
    setFitChartTrigger(prev => prev + 1);
  }, [replayAccount, rawCandles, addReplayLog, syncReplayWidgetData]);

  // Ordem Manual enviada pela Boleta
  const handlePlaceManualOrder = useCallback((orderData: {
    side: 'COMPRA' | 'VENDA';
    type: 'MARKET' | 'LIMIT' | 'STOP';
    price?: number;
    contracts: number;
    stopLossPts: number | null;
    takeProfitPts: number | null;
    stopLoss?: number | null;
    takeProfit?: number | null;
    brackets?: any[];
    atm?: {
      breakeven_pts?: number;
      breakeven_offset_pts?: number;
      trailing_trigger_pts?: number;
      trailing_dist_pts?: number;
      name?: string;
    };
  }) => {
    const opCheck = checkReplayOperationalLimits(replayAccountRef.current, ordersRef.current, currentSimulatedTime);
    if (!opCheck.allowed) {
      alert(`⚠️ Ordem Bloqueada por Risco: ${opCheck.reason}`);
      return;
    }

    const entryP = orderData.price || currentPriceRef.current;
    const isLong = orderData.side === 'COMPRA';

    if (orderData.brackets && orderData.brackets.length > 0) {
      const newOrders: ReplayOrder[] = [];
      orderData.brackets.forEach((b: any, idx: number) => {
        const bLots = Math.max(1, Number(b.quantity) || 1);
        const bSlP = b.stopLossPts ? (isLong ? entryP - b.stopLossPts : entryP + b.stopLossPts) : null;
        const bTpP = b.takeProfitPts ? (isLong ? entryP + b.takeProfitPts : entryP - b.takeProfitPts) : null;

        const atmName = orderData.atm?.name || 'ATM';
        const targetDesc = orderData.brackets!.length > 1
          ? `Manual ${atmName} [Alvo ${idx + 1}] (${bLots}x @ ${entryP.toFixed(2)})`
          : `Manual ${atmName} (${bLots}x @ ${entryP.toFixed(2)})`;

        const ord: ReplayOrder = {
          id: `manual-atm-${Date.now()}-${idx}-${Math.random()}`,
          account_id: replayAccountRef.current.id,
          strategy_name: orderData.brackets!.length > 1 ? `Boleta Manual (Alvo ${idx + 1})` : 'Boleta Manual Replay',
          side: orderData.side,
          type: orderData.type,
          order_price: orderData.price,
          entry_price: entryP,
          stop_loss: bSlP,
          take_profit: bTpP,
          exit_price: null,
          status: orderData.type === 'MARKET' ? 'Em Andamento' : 'Pendente',
          contrato: bLots,
          entry_time: currentSimulatedTime,
          description: targetDesc,
          instance_id: activePanel?.instance_id || 'nasdaq',
          symbol: currentSymbol || activePanel?.name || 'NQ',
          atm_breakeven_trigger_pts: b.autoBreakevenEnabled ? b.autoBreakevenTriggerPts : undefined,
          atm_breakeven_offset_pts: b.autoBreakevenEnabled ? (b.autoBreakevenOffsetPts ?? 0) : undefined,
          atm_trailing_trigger_pts: b.trailingStopEnabled ? b.trailingStopTriggerPts : undefined,
          atm_trailing_dist_pts: b.trailingStopEnabled ? b.trailingStopStepPts : undefined
        };
        newOrders.push(ord);
      });

      setOrders(prev => [...prev, ...newOrders]);
      ordersRef.current = [...ordersRef.current, ...newOrders];
      addReplayLog('MANUAL', `⚡ Ordem Manual ATM enviada: ${orderData.side} (${orderData.brackets.length} alvos) @ ${entryP.toFixed(2)}`);
      return;
    }

    const slP = orderData.stopLoss !== undefined && orderData.stopLoss !== null
      ? orderData.stopLoss
      : (orderData.stopLossPts ? (isLong ? entryP - orderData.stopLossPts : entryP + orderData.stopLossPts) : null);
    const tpP = orderData.takeProfit !== undefined && orderData.takeProfit !== null
      ? orderData.takeProfit
      : (orderData.takeProfitPts ? (isLong ? entryP + orderData.takeProfitPts : entryP - orderData.takeProfitPts) : null);

    const newOrder: ReplayOrder = {
      id: `manual-${Date.now()}-${Math.random()}`,
      account_id: replayAccountRef.current.id,
      strategy_name: 'Boleta Manual Replay',
      side: orderData.side,
      type: orderData.type,
      order_price: orderData.price,
      entry_price: entryP,
      stop_loss: slP,
      take_profit: tpP,
      exit_price: null,
      status: orderData.type === 'MARKET' ? 'Em Andamento' : 'Pendente',
      contrato: orderData.contracts,
      entry_time: currentSimulatedTime,
      description: `Manual Replay (${orderData.contracts}x @ ${entryP.toFixed(2)})`,
      instance_id: activePanel?.instance_id || 'nasdaq',
      symbol: currentSymbol || activePanel?.name || 'NQ',
      atm_breakeven_trigger_pts: orderData.atm?.breakeven_pts,
      atm_breakeven_offset_pts: orderData.atm?.breakeven_offset_pts,
      atm_trailing_trigger_pts: orderData.atm?.trailing_trigger_pts,
      atm_trailing_dist_pts: orderData.atm?.trailing_dist_pts
    };

    setOrders(prev => [...prev, newOrder]);
    ordersRef.current = [...ordersRef.current, newOrder];

    addReplayLog('MANUAL', `⚡ Ordem Manual enviada: ${orderData.side} ${orderData.type} ${orderData.contracts}x @ ${entryP.toFixed(2)}`);
  }, [currentSimulatedTime, activePanel, currentSymbol, addReplayLog]);

  const handleTriggerAISignalInReplay = useCallback((prompt: any, side: 'COMPRA' | 'VENDA') => {
    const simPrice = currentPriceRef.current;
    if (!simPrice || simPrice <= 0) return;

    const opCheck = checkReplayOperationalLimits(replayAccountRef.current, ordersRef.current, currentSimulatedTime);
    if (!opCheck.allowed) {
      alert(`⚠️ Sinal IA Bloqueado por Risco da Conta Replay: ${opCheck.reason}`);
      addReplayLog('IA RISCO', `⚠️ Sinal IA Bloqueado: ${opCheck.reason}`);
      return;
    }

    const hasOpen = ordersRef.current.some(o => o.status === 'Em Andamento');
    if (hasOpen && !replayAccountRef.current.allow_multi_signals) {
      alert('⚠️ Sinal IA Bloqueado: A conta Replay já possui uma posição aberta.');
      addReplayLog('IA RISCO', `⚠️ Sinal IA Bloqueado: Posição aberta em andamento.`);
      return;
    }

    const slPts = prompt.stop_loss_value ? Number(prompt.stop_loss_value) : defaultStopLossPts;
    const tpPts = prompt.take_profit_value ? Number(prompt.take_profit_value) : defaultTakeProfitPts;
    const slPrice = side === 'COMPRA' ? simPrice - slPts : simPrice + slPts;
    const tpPrice = side === 'COMPRA' ? simPrice + tpPts : simPrice - tpPts;

    const promptTitle = prompt.name || prompt.title || 'Copilot IA';
    const newOrder: ReplayOrder = {
      id: `replay-ai-order-${Date.now()}-${Math.random()}`,
      account_id: replayAccountRef.current.id,
      strategy_id: prompt.id,
      strategy_name: `🧠 IA ${promptTitle}`,
      side: side,
      type: 'MARKET',
      entry_price: simPrice,
      stop_loss: slPrice,
      take_profit: tpPrice,
      exit_price: null,
      status: 'Em Andamento',
      contrato: 1,
      entry_time: currentSimulatedTime || new Date().toISOString(),
      description: `Acionamento de Sinal IA: ${promptTitle}`,
      instance_id: activePanel?.instance_id || 'nasdaq'
    };

    setOrders(prev => [...prev, newOrder]);
    ordersRef.current = [...ordersRef.current, newOrder];

    addReplayLog('IA SINAL', `🧠 Executado Sinal IA (${promptTitle}): ${side} 1x @ ${simPrice.toFixed(2)} [SL: ${slPts} pts | TP: ${tpPts} pts]`);
  }, [currentSimulatedTime, activePanel, addReplayLog, defaultStopLossPts, defaultTakeProfitPts]);

  // Zerar Posição Ativa
  const handleCloseActivePosition = useCallback(() => {
    const curOrders = [...ordersRef.current];
    let modified = false;

    curOrders.forEach(o => {
      if (o.status === 'Em Andamento') {
        const isLong = o.side === 'COMPRA';
        o.status = 'Encerrado';
        o.exit_price = currentPriceRef.current;
        o.exit_time = currentSimulatedTime;
        o.points = isLong ? currentPriceRef.current - o.entry_price : o.entry_price - currentPriceRef.current;
        o.profit_usd = o.points * o.contrato * pointValue;
        o.close_reason = 'MANUAL';
        modified = true;

        const updatedAcc = { ...replayAccountRef.current, balance: (replayAccountRef.current.balance || 50000) + o.profit_usd };
        setReplayAccount(updatedAcc);
        replayAccountRef.current = updatedAcc;

        addReplayLog('MANUAL', `🛑 Posição Encerrada Manualmente: ${o.profit_usd >= 0 ? '+' : ''}$${o.profit_usd.toFixed(2)}`);
      }
    });

    if (modified) {
      setOrders(curOrders);
      ordersRef.current = curOrders;
    }
  }, [currentSimulatedTime, pointValue, addReplayLog]);

  // Inverter Posição
  const handleReversePosition = useCallback(() => {
    const active = ordersRef.current.find(o => o.status === 'Em Andamento');
    if (!active) return;
    const revSide = active.side === 'COMPRA' ? 'VENDA' : 'COMPRA';
    const contracts = active.contrato;
    handleCloseActivePosition();
    handlePlaceManualOrder({
      side: revSide,
      type: 'MARKET',
      contracts: contracts,
      stopLossPts: defaultStopLossPts,
      takeProfitPts: defaultTakeProfitPts
    });
  }, [handleCloseActivePosition, handlePlaceManualOrder, defaultStopLossPts, defaultTakeProfitPts]);

  // Mover Stop Loss para Breakeven (Preço de Entrada + 0.5 pt offset)
  const handleBreakevenPosition = useCallback(() => {
    const active = ordersRef.current.find(o => o.status === 'Em Andamento');
    if (!active) return;
    const entry = active.entry_price;
    const newStop = active.side === 'COMPRA' ? entry + 0.5 : entry - 0.5;

    setOrders(prev => prev.map(o => o.status === 'Em Andamento' ? { ...o, stop_loss: newStop } : o));
    ordersRef.current = ordersRef.current.map(o => o.status === 'Em Andamento' ? { ...o, stop_loss: newStop } : o);
    addReplayLog('ORDEM', `🛡️ Breakeven acionado: Stop Loss ajustado para ${newStop.toFixed(2)} (+0.5 pt offset).`);
  }, [addReplayLog]);

  // Indicadores Handlers
  const handleAddIndicator = (type: string, customConfig?: IndicatorConfig) => {
    if (customConfig) {
      setActiveIndicators(prev => [...prev, customConfig]);
      return;
    }
    const def = INDICATOR_DEFINITIONS[type];
    if (!def) return;
    const defaultParams: Record<string, any> = {};
    def.paramDefs.forEach(p => { defaultParams[p.key] = p.default; });

    const newInd: IndicatorConfig = {
      id: `${type.toLowerCase()}-${Date.now()}`,
      type: def.type,
      name: def.name,
      category: def.category,
      visible: true,
      overlay: def.overlay,
      params: defaultParams,
      style: { ...def.defaultStyle }
    };
    setActiveIndicators(prev => [...prev, newInd]);
  };

  const handleUpdateIndicator = (updated: IndicatorConfig) => {
    setActiveIndicators(prev => prev.map(ind => ind.id === updated.id ? updated : ind));
  };

  const handleRemoveIndicator = (id: string) => {
    setActiveIndicators(prev => prev.filter(ind => ind.id !== id));
  };

  const handleToggleIndicatorVisibility = (id: string) => {
    setActiveIndicators(prev => prev.map(ind => ind.id === id ? { ...ind, visible: !ind.visible } : ind));
  };

  const handleLoadTemplate = (indicators: IndicatorConfig[], widgets?: WidgetConfig[], tf?: number) => {
    const cloned = JSON.parse(JSON.stringify(indicators || []));
    setActiveIndicators(cloned);
    try {
      localStorage.setItem('vortex_replay_indicators', JSON.stringify(cloned));
    } catch {}

    if (widgets && Array.isArray(widgets)) {
      const clonedWidgets = JSON.parse(JSON.stringify(widgets));
      setActiveWidgets(clonedWidgets);
      try {
        localStorage.setItem('vortex_replay_widgets', JSON.stringify(clonedWidgets));
      } catch {}
    } else {
      setActiveWidgets([]);
      try {
        localStorage.setItem('vortex_replay_widgets', JSON.stringify([]));
      } catch {}
    }

    if (tf && typeof tf === 'number') {
      setTimeframe(tf);
    }
  };

  return (
    <div className="w-full h-[calc(100vh-20px)] bg-[#070c18] flex flex-col text-slate-100 font-sans overflow-hidden">
      {/* Top Workstation Header Toolbar */}
      <div className="bg-[#0b1329] border-b border-slate-800 px-3 py-1.5 h-11 flex items-center justify-between gap-2.5 select-none shrink-0 relative z-40">
        {/* Left Section: Ativo, Timeframe, Indicadores, Widgets, Desenhos */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg">
            <span className="text-sm">⏪</span>
            <select
              value={activePanel?.id || ''}
              onChange={(e) => handleSwitchPanelAsset(e.target.value)}
              className="bg-transparent text-xs font-black text-white outline-none cursor-pointer"
            >
              {panels?.map((p: any) => (
                <option key={p.id} value={p.id} className="bg-slate-900">
                  {p.name?.replace(/\s*\([^)]*\)/g, '').trim()} [Replay]
                </option>
              ))}
            </select>
          </div>

          {/* Timeframe Selector */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 px-2 py-1 rounded-lg">
            <span className="text-[11px] text-slate-400">⏱️</span>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(Number(e.target.value))}
              className="bg-transparent text-xs font-bold text-blue-400 outline-none cursor-pointer"
            >
              <option value={1} className="bg-slate-900 text-slate-200">1m</option>
              <option value={2} className="bg-slate-900 text-slate-200">2m</option>
              <option value={3} className="bg-slate-900 text-slate-200">3m</option>
              <option value={5} className="bg-slate-900 text-slate-200">5m</option>
              <option value={10} className="bg-slate-900 text-slate-200">10m</option>
              <option value={15} className="bg-slate-900 text-slate-200">15m</option>
              <option value={30} className="bg-slate-900 text-slate-200">30m</option>
              <option value={60} className="bg-slate-900 text-slate-200">1h</option>
              <option value={240} className="bg-slate-900 text-slate-200">4h</option>
              <option value={1440} className="bg-slate-900 text-slate-200">1D</option>
            </select>
          </div>

          {/* Templates Button */}
          <button
            onClick={() => {
              setIndicatorsModalTab('templates');
              setIsIndicatorsModalOpen(true);
            }}
            className="bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow"
            title="Carregar ou aplicar templates prontos de indicadores e layout"
          >
            <span>📑 Templates</span>
          </button>

          {/* Indicators Button */}
          <button
            onClick={() => {
              setIndicatorsModalTab('catalog');
              setIsIndicatorsModalOpen(true);
            }}
            className="bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer shadow"
            title="Gerenciar indicadores do gráfico"
          >
            <span>📊</span>
            {visibleIndicators.length > 0 && (
              <span className="bg-blue-900 text-blue-200 px-1.5 py-0.2 rounded-full text-[10px]">
                {visibleIndicators.length}
              </span>
            )}
          </button>

          {/* Widgets Button */}
          <button
            onClick={() => setIsWidgetsModalOpen(true)}
            className="bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer shadow"
            title="Gerenciar widgets flutuantes"
          >
            <span>🧩</span>
            {activeWidgets.filter(w => w.visible).length > 0 && (
              <span className="bg-purple-900 text-purple-200 px-1.5 py-0.2 rounded-full text-[10px]">
                {activeWidgets.filter(w => w.visible).length}
              </span>
            )}
          </button>

          {/* Drawings Tool Button */}
          <div className="relative">
            <button
              onClick={() => setIsDrawingsMenuOpen(!isDrawingsMenuOpen)}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer shadow ${
                activeDrawingTool
                  ? 'bg-amber-600 text-white border border-amber-400'
                  : 'bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300'
              }`}
            >
              <span>✏️</span>
              {drawings.length > 0 && (
                <span className="bg-emerald-900 text-emerald-200 px-1.5 py-0.2 rounded-full text-[10px]">
                  {drawings.length}
                </span>
              )}
            </button>

            {isDrawingsMenuOpen && (
              <>
                <div className="fixed inset-0 z-[99990]" onClick={() => setIsDrawingsMenuOpen(false)} />
                <div className="absolute top-full left-0 mt-1.5 w-56 bg-[#0f172a] border border-slate-700 rounded-xl shadow-2xl z-[99999] p-1.5 space-y-1 font-sans text-xs">
                  <button
                    onClick={() => { setActiveDrawingTool('horizontal_line'); setIsDrawingsMenuOpen(false); }}
                    className="w-full px-2 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-slate-200 font-bold text-left transition cursor-pointer"
                  >
                    <span>➖ Linha Horizontal</span>
                  </button>
                  <button
                    onClick={() => { setActiveDrawingTool('trend_line'); setIsDrawingsMenuOpen(false); }}
                    className="w-full px-2 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-slate-200 font-bold text-left transition cursor-pointer"
                  >
                    <span>📈 Linha de Tendência</span>
                  </button>
                  <button
                    onClick={() => { setActiveDrawingTool('rectangle'); setIsDrawingsMenuOpen(false); }}
                    className="w-full px-2 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-slate-200 font-bold text-left transition cursor-pointer"
                  >
                    <span>🔲 Retângulo (Zona)</span>
                  </button>
                  <button
                    onClick={() => { setActiveDrawingTool('fibonacci'); setIsDrawingsMenuOpen(false); }}
                    className="w-full px-2 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-slate-200 font-bold text-left transition cursor-pointer"
                  >
                    <span>📐 Retração Fibonacci</span>
                  </button>
                  <button
                    onClick={() => { setActiveDrawingTool('channel'); setIsDrawingsMenuOpen(false); }}
                    className="w-full px-2 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-slate-200 font-bold text-left transition cursor-pointer"
                  >
                    <span>🛤️ Canal de Tendência</span>
                  </button>
                  <button
                    onClick={() => { setActiveDrawingTool('text'); setIsDrawingsMenuOpen(false); }}
                    className="w-full px-2 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-slate-200 font-bold text-left transition cursor-pointer"
                  >
                    <span>💬 Texto / Anotação</span>
                  </button>
                  <button
                    onClick={() => { setActiveDrawingTool('arrow'); setIsDrawingsMenuOpen(false); }}
                    className="w-full px-2 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-slate-200 font-bold text-left transition cursor-pointer"
                  >
                    <span>⚡ Zigue-Zague com Flecha</span>
                  </button>
                  <button
                    onClick={() => { setActiveDrawingTool('ruler'); setIsDrawingsMenuOpen(false); }}
                    className="w-full px-2 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-slate-200 font-bold text-left transition cursor-pointer"
                  >
                    <span>📏 Régua de Medição</span>
                  </button>
                  {drawings.length > 0 && (
                    <button
                      onClick={() => { setDrawings([]); setIsDrawingsMenuOpen(false); }}
                      className="w-full px-2 py-1.5 rounded-lg hover:bg-rose-950 text-rose-400 font-bold text-left transition border-t border-slate-800 pt-1"
                    >
                      <span>🗑️ Limpar Todos</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Replay Status Badge */}
          <div className="flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-1 rounded-lg text-xs font-black text-emerald-400">
            <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
            <span>{isPlaying ? 'REPLAY EM ANDAMENTO' : 'REPLAY PAUSADO'}</span>
          </div>
        </div>

        {/* Right Section: Actions [R, C, I, S, H, 🤖, F, 📋] */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setResetViewTrigger(prev => prev + 1)}
            className="px-2 py-1 rounded-lg border border-slate-700 bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs shadow transition active:scale-95 cursor-pointer"
            title="Reenquadrar Gráfico [R]"
          >
            R
          </button>

          <button
            onClick={() => setAutoCenter(prev => !prev)}
            className={`px-2 py-1 rounded-lg border font-bold text-xs shadow transition active:scale-95 cursor-pointer ${
              autoCenter ? 'border-yellow-500 bg-yellow-950/60 text-yellow-400' : 'border-slate-700 bg-slate-850 text-slate-300'
            }`}
            title="Auto-Center [C]"
          >
            C
          </button>

          <button
            onClick={() => setShowIndicatorsLegend(prev => !prev)}
            className={`px-2 py-1 rounded-lg border font-bold text-xs shadow transition active:scale-95 cursor-pointer ${
              showIndicatorsLegend ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-700 bg-slate-850 text-slate-300'
            }`}
            title="Legenda de Indicadores [I]"
          >
            I
          </button>

          <button
            onClick={() => setShowTradeMarkers(prev => !prev)}
            className={`px-2 py-1 rounded-lg border font-bold text-xs shadow transition active:scale-95 cursor-pointer ${
              showTradeMarkers ? 'border-blue-500 bg-blue-600 text-white' : 'border-red-500 bg-red-600 text-white'
            }`}
            title="Marcadores de Trades [S]"
          >
            S
          </button>

          <button
            onClick={() => setShowBottomDock(prev => !prev)}
            className={`px-2 py-1 rounded-lg border font-bold text-xs shadow transition active:scale-95 cursor-pointer ${
              showBottomDock ? 'border-cyan-500 bg-cyan-600 text-white' : 'border-slate-700 bg-slate-850 text-slate-400'
            }`}
            title="Painel Inferior Dock [H]"
          >
            H
          </button>

          <button
            onClick={() => setFitChartTrigger(prev => prev + 1)}
            className="bg-slate-900 hover:bg-slate-800 border border-amber-500/60 font-mono font-black text-xs text-amber-400 px-2 py-1 rounded-lg transition active:scale-95 shadow cursor-pointer"
            title="Alinhar Gráfico (Botão F - NinjaTrader)"
          >
            F
          </button>

          <button
            onClick={() => setShowRobots(prev => !prev)}
            className={`px-2 py-1 rounded-lg border font-bold text-xs shadow transition active:scale-95 cursor-pointer ${
              showRobots ? 'border-purple-500 bg-purple-600 text-white' : 'border-slate-700 bg-slate-850 text-slate-300'
            }`}
            title="Robôs no Replay"
          >
            🤖
          </button>

          <button
            onClick={() => setIsRightBoletaCollapsed(prev => !prev)}
            className={`px-2 py-1 rounded-lg border font-bold text-xs shadow transition active:scale-95 cursor-pointer ${
              !isRightBoletaCollapsed ? 'border-emerald-500 bg-emerald-600/90 text-white' : 'border-slate-700 bg-slate-850 text-slate-400'
            }`}
            title="Boleta Lateral"
          >
            📋
          </button>
        </div>
      </div>

      {/* Main Area: Gráfico com Card Flutuante + Boleta Lateral + Dock Inferior */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Main Chart Container */}
          <div ref={chartContainerRef} className="flex-1 relative bg-[#070c18] overflow-hidden">
            {/* Card Flutuante Arrastável de Replay (NinjaTrader Style Compacto) */}
            <ReplayControlCard
              currentSimulatedTime={currentSimulatedTime}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              minAvailableDate={minAvailableDate}
              maxAvailableDate={maxAvailableDate}
              isPlaying={isPlaying}
              onTogglePlay={handleTogglePlay}
              progressPercent={progressPercent}
              onSeek={handleSeek}
              speed={speed}
              onSetSpeed={setSpeed}
              onOpenAccountModal={() => setIsAccountModalOpen(true)}
              onJumpTime={handleJumpTime}
              onNextCandle={handleNextCandle}
              onFastForwardNoChart={handleFastForwardNoChart}
              onResetReplay={handleResetReplay}
              onJumpToDateTime={handleJumpToDateTime}
              isLoadingData={isLoadingData}
              onLoadData={() => handleLoadData(startDate, endDate, undefined, true)}
              totalCandlesCount={totalReplayCandles}
              dataSource={dataSource}
              onSetDataSource={setDataSource}
              isStreamerOnline={isStreamerOnline}
              streamerBarsCount={streamerBarsCount}
              isNinjaPlaybackActive={isNinjaPlaybackActive}
            />

            {/* TradingView Style On-Chart Indicator Legend (Top Left - Ultra Compact, Non-bold) */}
            {showIndicatorsLegend && (
              <div className="absolute top-1.5 left-2 z-30 flex flex-col gap-0.5 pointer-events-auto select-none">
                {activeIndicators.map((ind) => (
                  <div
                    key={ind.id}
                    className="bg-slate-950/70 backdrop-blur border border-slate-800/60 px-1.5 py-0.5 rounded text-[9px] leading-tight flex items-center gap-1 font-normal shadow-sm transition text-slate-300"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: ind.style?.color || '#22c55e',
                        opacity: ind.visible ? 1 : 0.6
                      }}
                    />
                    <span className="font-normal tracking-tight text-slate-300">
                      {getShortIndicatorName(ind)}
                    </span>
                    
                    <div className="flex items-center gap-0.5 ml-0.5 border-l border-slate-800/60 pl-1">
                      <button
                        onClick={() => setIsIndicatorsModalOpen(true)}
                        className="text-slate-400 hover:text-blue-400 transition text-[9px] p-0 leading-none cursor-pointer"
                        title="Configurar Parâmetros"
                      >
                        ⚙️
                      </button>
                      <button
                        onClick={() => handleToggleIndicatorVisibility(ind.id)}
                        className={`transition text-[9px] p-0 leading-none cursor-pointer ${
                          ind.visible ? 'text-slate-300 hover:text-white' : 'opacity-40 hover:opacity-100'
                        }`}
                        title={ind.visible ? 'Ocultar' : 'Exibir'}
                      >
                        {ind.visible ? '👁️' : '🙈'}
                      </button>
                      <button
                        onClick={() => handleRemoveIndicator(ind.id)}
                        className="text-slate-400 hover:text-rose-400 transition text-[9px] p-0 leading-none cursor-pointer"
                        title="Excluir Indicador"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Widgets Overlay */}
            <ChartWidgetsOverlay
              widgets={activeWidgets}
              onUpdateWidget={(w) => setActiveWidgets(prev => prev.map(item => item.id === w.id ? w : item))}
              onRemoveWidget={(id) => setActiveWidgets(prev => prev.filter(item => item.id !== id))}
              containerRef={chartContainerRef}
              overrideMarketData={replayMarketData}
              overrideForces={replayForces}
              overrideGammaLevels={gammaLevels}
              overrideAxionRadar={replayAxionRadar}
              isReplayMode={true}
            />

            {/* Gráfico de Candles (com histórico de 2 dias anteriores já visível) */}
            <CandleChart
              candles={displayedCandles}
              timeframe={timeframe}
              setTimeframe={setTimeframe}
              activeIndicators={visibleIndicators}
              activeWidgets={activeWidgets}
              gammaLevels={gammaLevels}
              marketData={replayMarketData}
              instanceId={activePanel?.instance_id || 'nasdaq'}
              fitChartTrigger={fitChartTrigger}
              resetViewTrigger={resetViewTrigger}
              autoCenter={autoCenter}
              setAutoCenter={setAutoCenter}
              showTradeMarkers={showTradeMarkers}
              setShowTradeMarkers={setShowTradeMarkers}
              showIndicatorsLegend={showIndicatorsLegend}
              setShowIndicatorsLegend={setShowIndicatorsLegend}
              showRobots={showRobots}
              setShowRobots={setShowRobots}
              hideManualTradeBar={true}
              forceCandleView={true}
              simulatedPrice={currentPrice}
              activePosition={activePositionFormatted}
              simulatedReports={simulatedReportsFormatted}
              customSignals={customSignals}
              newsList={newsList}
              isSimulator={true}
              onUpdateReportLevels={handleUpdateOrderLevels}
              drawings={drawings}
              onUpdateDrawing={(up) => {
                setDrawings(prev => {
                  const next = prev.map(d => d.id === up.id ? up : d);
                  drawingsRef.current = next;
                  return next;
                });
              }}
              onFinishDrawing={(newD) => {
                setDrawings(prev => {
                  const next = [...prev, newD];
                  drawingsRef.current = next;
                  return next;
                });
                setActiveDrawingTool(null);
              }}
              onDeleteDrawing={(id) => {
                setDrawings(prev => {
                  const next = prev.filter(d => d.id !== id);
                  drawingsRef.current = next;
                  return next;
                });
              }}
              activeDrawingTool={activeDrawingTool}
              selectedDrawingId={selectedDrawingId}
              onSelectDrawing={(d) => setSelectedDrawingId(d ? d.id : null)}
              onOpenDrawingSettings={(d) => { setEditingDrawing(d); setIsDrawingSettingsOpen(true); }}
            />

            {/* Loading Gauge Modal Overlay */}
            {isLoadingData && (
              <div className="absolute inset-0 z-[100] flex items-center justify-center bg-[#070c18] backdrop-blur-md select-none animate-in fade-in duration-200">
                <div className="bg-[#0b1220]/95 border border-cyan-500/30 shadow-[0_0_50px_rgba(6,182,212,0.25)] rounded-2xl p-7 flex flex-col items-center w-84 text-center relative overflow-hidden">
                  {/* Glowing background gradient accents */}
                  <div className="absolute -top-12 -right-12 w-36 h-36 bg-cyan-500/15 rounded-full blur-2xl pointer-events-none" />
                  <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-blue-500/15 rounded-full blur-2xl pointer-events-none" />

                  {/* Circular Radial Gauge */}
                  <div className="relative w-36 h-36 flex items-center justify-center mb-3">
                    <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 120 120">
                      <circle
                        cx="60"
                        cy="60"
                        r="50"
                        fill="none"
                        stroke="#1e293b"
                        strokeWidth="8"
                      />
                      <circle
                        cx="60"
                        cy="60"
                        r="50"
                        fill="none"
                        stroke="url(#replayProgressGrad)"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={314.16}
                        strokeDashoffset={314.16 - (314.16 * Math.min(100, Math.max(0, loadingProgress.percent))) / 100}
                        className="transition-all duration-300 ease-out"
                      />
                      <defs>
                        <linearGradient id="replayProgressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#06b6d4" />
                          <stop offset="100%" stopColor="#3b82f6" />
                        </linearGradient>
                      </defs>
                    </svg>

                    {/* Percentage in center */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-3xl font-black font-mono tracking-tight text-white drop-shadow-[0_2px_10px_rgba(6,182,212,0.6)]">
                        {Math.round(loadingProgress.percent)}%
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold mt-0.5">
                        CARREGANDO
                      </span>
                    </div>
                  </div>

                  {/* Title & Message */}
                  <h4 className="text-sm font-bold text-white tracking-wide mb-1">
                    Carregamento de Histórico
                  </h4>
                  <p className="text-xs text-slate-300 font-mono mb-3 line-clamp-2 px-2">
                    {loadingProgress.message || 'Buscando velas históricas...'}
                  </p>

                  {/* Velas counter / progress detail */}
                  {loadingProgress.totalRows > 0 ? (
                    <div className="flex items-center justify-between w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-2 text-[11px] font-mono text-slate-400">
                      <span>Velas Carregadas:</span>
                      <span className="text-cyan-400 font-bold">
                        {loadingProgress.loadedRows.toLocaleString()} / {loadingProgress.totalRows.toLocaleString()}
                      </span>
                    </div>
                  ) : loadingProgress.loadedRows > 0 ? (
                    <div className="flex items-center justify-between w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-2 text-[11px] font-mono text-slate-400">
                      <span>Velas Carregadas:</span>
                      <span className="text-cyan-400 font-bold">
                        {loadingProgress.loadedRows.toLocaleString()}
                      </span>
                    </div>
                  ) : (
                    <div className="w-full bg-slate-900/60 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(5, loadingProgress.percent))}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Dock com Barra de Redimensionamento */}
          {showBottomDock && (
            <>
              {/* Dock Resizer Bar (Arraste Vertical como no Painel 2) */}
              <div
                onMouseDown={handleMouseDownSplitter}
                className="h-1.5 bg-[#0b1329] hover:bg-blue-500/80 border-y border-slate-800 cursor-row-resize flex items-center justify-center select-none transition group shrink-0"
                title="Clique e arraste verticalmente para ajustar a altura do painel de ordens"
              >
                <div className="w-12 h-1 rounded-full bg-slate-700 group-hover:bg-blue-300 transition" />
              </div>

              <div style={{ height: `${dockHeight}px` }} className="flex-shrink-0 overflow-hidden">
                <ReplayDock
                  orders={orders}
                  account={replayAccount}
                  currentPrice={currentPrice}
                  pointValue={pointValue}
                  onCloseOrder={(id) => {
                    setOrders(prev => prev.map(o => o.id === id ? {
                      ...o,
                      status: 'Encerrado',
                      exit_price: currentPriceRef.current,
                      exit_time: currentSimulatedTime,
                      points: o.side === 'COMPRA' ? currentPriceRef.current - o.entry_price : o.entry_price - currentPriceRef.current,
                      profit_usd: (o.side === 'COMPRA' ? currentPriceRef.current - o.entry_price : o.entry_price - currentPriceRef.current) * o.contrato * pointValue,
                      close_reason: 'MANUAL'
                    } : o));
                  }}
                  onCancelPendingOrder={(id) => {
                    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'Cancelado' } : o));
                  }}
                  onClearHistory={() => {
                    setOrders(prev => prev.filter(o => o.status === 'Em Andamento' || o.status === 'Pendente'));
                    setCustomSignals([]);
                    setReplayLogs([]);
                    setReplayAlertToast(null);
                    try {
                      localStorage.removeItem('vortex_replay_orders');
                      localStorage.removeItem('vortex_replay_custom_signals');
                    } catch {}
                  }}
                  availableStrategies={customStrategies || []}
                  linkedStrategyIds={linkedStrategyIds}
                  onToggleStrategy={(id) => {
                    const strId = String(id);
                    setLinkedStrategyIds(prev =>
                      prev.map(x => String(x)).includes(strId)
                        ? prev.filter(x => String(x) !== strId)
                        : [...prev.map(x => String(x)), strId]
                    );
                  }}
                  onSetAllStrategies={(active) => {
                    setLinkedStrategyIds(active ? (customStrategies || []).map((s: any) => String(s.id)).filter(Boolean) : []);
                  }}
                  availablePrompts={prompts || []}
                  linkedPromptIds={linkedPromptIds}
                  onTogglePrompt={(id) => {
                    const prId = String(id);
                    setLinkedPromptIds(prev =>
                      prev.map(x => String(x)).includes(prId)
                        ? prev.filter(x => String(x) !== prId)
                        : [...prev.map(x => String(x)), prId]
                    );
                  }}
                  onSetAllPrompts={(active) => {
                    setLinkedPromptIds(active ? (prompts || []).map((p: any) => String(p.id)).filter(Boolean) : []);
                  }}
                  onTriggerAISignal={handleTriggerAISignalInReplay}
                  replayLogs={replayLogs}
                />
              </div>
            </>
          )}
        </div>

        {/* Right Column: Boleta Lateral */}
        {!isRightBoletaCollapsed && (
          <div className="w-80 h-full flex-shrink-0 border-l border-slate-800 overflow-y-auto relative">
            <ReplayBoleta
              selectedAsset={currentSymbol}
              candles={displayedCandles}
              currentPrice={currentPrice}
              activeOrder={activeOrder}
              orders={orders}
              account={replayAccount}
              gammaLevels={gammaLevels}
              pointValue={pointValue}
              onPlaceOrder={handlePlaceManualOrder}
              onClosePosition={handleCloseActivePosition}
              onReversePosition={handleReversePosition}
              onBreakevenPosition={handleBreakevenPosition}
              onOpenAccountModal={() => setIsAccountModalOpen(true)}
            />
          </div>
        )}
      </div>

      {/* Popup / Toast Flutuante de Alerta de Robô no Replay (Sem Telegram) */}
      {replayAlertToast && (
        <div className="fixed top-14 right-6 z-[9999] max-w-sm bg-slate-900 border border-purple-500/50 shadow-2xl shadow-purple-950/80 rounded-xl p-3.5 text-slate-100 font-sans animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔔</span>
              <div>
                <div className="text-xs font-black text-purple-300 uppercase tracking-wide">
                  {replayAlertToast.title}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {replayAlertToast.time} • Modo Replay
                </div>
              </div>
            </div>
            <button
              onClick={() => setReplayAlertToast(null)}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 text-xs transition cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="mt-2 text-xs font-semibold text-slate-200 bg-slate-950/70 p-2 rounded-lg border border-slate-800 flex items-center justify-between">
            <span>{replayAlertToast.message}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
              replayAlertToast.side === 'COMPRA'
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                : 'bg-rose-950 text-rose-400 border border-rose-500/40'
            }`}>
              {replayAlertToast.side}
            </span>
          </div>
        </div>
      )}

      {/* Modais */}
      <ReplayAccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        account={replayAccount}
        onSaveAccount={setReplayAccount}
        availableStrategies={customStrategies || []}
        availablePrompts={prompts || []}
        linkedStrategyIds={linkedStrategyIds}
        linkedPromptIds={linkedPromptIds}
        onToggleLinkStrategy={(stratId) => {
          const strId = String(stratId);
          setLinkedStrategyIds(prev => 
            prev.map(x => String(x)).includes(strId)
              ? prev.filter(id => String(id) !== strId)
              : [...prev.map(x => String(x)), strId]
          );
        }}
        onToggleLinkPrompt={(promptId) => {
          const prId = String(promptId);
          setLinkedPromptIds(prev => 
            prev.map(x => String(x)).includes(prId)
              ? prev.filter(id => String(id) !== prId)
              : [...prev.map(x => String(x)), prId]
          );
        }}
        onResetBalance={(newBal) => {
          setReplayAccount(prev => ({ ...prev, balance: newBal }));
          setOrders([]);
          addReplayLog('CONTA', `Saldo restaurado para $${newBal.toLocaleString('en-US')}`);
        }}
        panels={panels || []}
      />

      <IndicatorsManagerModal
        isOpen={isIndicatorsModalOpen}
        onClose={() => setIsIndicatorsModalOpen(false)}
        activeIndicators={activeIndicators}
        onAddIndicator={handleAddIndicator}
        onUpdateIndicator={handleUpdateIndicator}
        onRemoveIndicator={handleRemoveIndicator}
        onToggleVisibility={handleToggleIndicatorVisibility}
        onLoadTemplate={handleLoadTemplate}
        activeWidgets={activeWidgets}
        currentTimeframe={timeframe}
        onAddWidget={handleAddWidget}
        onRemoveWidget={handleRemoveWidget}
        onToggleWidgetVisibility={handleToggleWidgetVisibility}
        onResetWidgetPositions={handleResetWidgetPositions}
        initialTab={indicatorsModalTab}
      />

      <WidgetsManagerModal
        isOpen={isWidgetsModalOpen}
        onClose={() => setIsWidgetsModalOpen(false)}
        activeWidgets={activeWidgets}
        onAddWidget={handleAddWidget}
        onToggleVisibility={handleToggleWidgetVisibility}
        onRemoveWidget={handleRemoveWidget}
        onResetPositions={handleResetWidgetPositions}
      />

      <DrawingSettingsModal
        isOpen={isDrawingSettingsOpen}
        onClose={() => setIsDrawingSettingsOpen(false)}
        drawing={editingDrawing}
        onUpdateDrawing={(up) => setDrawings(prev => prev.map(d => d.id === up.id ? up : d))}
        onDeleteDrawing={(id) => setDrawings(prev => prev.filter(d => d.id !== id))}
      />
    </div>
  );
};
