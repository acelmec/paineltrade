import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { CandleChart } from './CandleChart';
import { IndicatorsManagerModal } from './IndicatorsManagerModal';
import {
  INDICATOR_DEFINITIONS,
  type IndicatorConfig
} from '../utils/indicatorRegistry';
import type { WidgetConfig } from '../utils/widgetRegistry';
import { fetchUserLayoutProfilesSupabase, saveUserLayoutProfileSupabase, deleteUserLayoutProfileSupabase, type UserLayoutProfile, fetchAccountChartStateSupabase, saveAccountChartStateSupabase } from '../services/db';
import {
  GrixCoreAnalyticsView,
  GrixAnchorsView,
  GrixFlowExposureView,
  GrixStockReplacementView,
  ProjecaoView
} from './GrixCards';

export const Dashboard: React.FC = () => {
  const {
    marketData,
    forces,
    gammaLevels,
    news,
    screenshot,
    candles,
    aiEnabled,
    isAnalyzing,
    aiResult,
    runManualAIAnalysis,
    systemLogs,
    clearLogs,
    forcesConfig,
    toggleForceConfig,
    windowMinutes,
    setWindowMinutes,
    windowBaseline,
    settings,
    reports,
    panels,
    switchPanel,
    saveSettings,
    updateReportAction,
    activePanel,
    isRestrictedSession,
    generalAnalyses,
    deleteGeneralAnalysisAction,
    user: _user,
    userPermissions,
    setIsCopilotModalOpen,
    setPanelMode,
    activeAccount,
    optionsMarket
  } = useApp()!

  const isSystemAdmin = _user?.email?.toLowerCase() === 'admin@vortex.com';
  const canUseMode2 = isSystemAdmin || userPermissions?.allow_panel_mode_2 === true;

  // Estados locais
  const [activeLogTab, setActiveLogTab] = useState<'mensagens' | 'noticias' | 'operacoes' | 'analises'>('noticias');
  const [newsFilter, setNewsFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [timeframe, setTimeframe] = useState<number>(1);

  // Estados e persistência de Indicadores Dinâmicos no Painel 1
  const currentSymbol = activePanel?.name || 'NQ';
  const pKey = activePanel?.id || currentSymbol || 'main_panel';
  const accKey = activeAccount?.id || 'default_account';

  const [isIndicatorsModalOpen, setIsIndicatorsModalOpen] = useState<boolean>(false);
  const [autoCenter, setAutoCenter] = useState<boolean>(false);
  const [showTradeMarkers, setShowTradeMarkers] = useState<boolean>(true);
  const [showRobots, setShowRobots] = useState<boolean>(false);
  const [fitChartTrigger, setFitChartTrigger] = useState<number>(0);
  const [resetViewTrigger, setResetViewTrigger] = useState<number>(0);

  const [activeIndicators, setActiveIndicators] = useState<IndicatorConfig[]>(() => {
    try {
      const saved = localStorage.getItem(`vortex_active_indicators_${accKey}_${pKey}`) ||
                    localStorage.getItem(`vortex_active_indicators_${currentSymbol}`) ||
                    localStorage.getItem('vortex_workstation_indicators');
      if (saved) return JSON.parse(saved);
    } catch (e) {}

    try {
      const defTemplateStr = localStorage.getItem('vortex_default_template_panel2');
      if (defTemplateStr) {
        const defTemplate = JSON.parse(defTemplateStr);
        if (defTemplate?.indicators && Array.isArray(defTemplate.indicators) && defTemplate.indicators.length > 0) {
          return defTemplate.indicators;
        }
      }
    } catch (e) {}

    return [
      {
        id: 'ema-9',
        type: 'EMA',
        name: 'Média Móvel Exponencial (EMA 9)',
        category: 'Tendência',
        visible: true,
        overlay: true,
        params: { period: 9, source: 'close' },
        style: { color: '#22c55e', lineWidth: 2, lineStyle: 'solid' }
      },
      {
        id: 'ema-21',
        type: 'EMA',
        name: 'Média Móvel Exponencial (EMA 21)',
        category: 'Tendência',
        visible: true,
        overlay: true,
        params: { period: 21, source: 'close' },
        style: { color: '#eab308', lineWidth: 2, lineStyle: 'solid' }
      },
      {
        id: 'vwap-main',
        type: 'VWAP',
        name: 'VWAP Diária',
        category: 'Volume',
        visible: true,
        overlay: true,
        params: { showDeviations: true },
        style: { color: '#e11d48', lineWidth: 2, lineStyle: 'solid' }
      }
    ];
  });

  const visibleIndicators = useMemo(() => activeIndicators.filter(i => i.visible), [activeIndicators]);

  // Troca de Painel / Conta: Recarrega os indicadores do painel ativo
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`vortex_active_indicators_${accKey}_${pKey}`) ||
                    localStorage.getItem(`vortex_active_indicators_${currentSymbol}`);
      if (saved) {
        setActiveIndicators(JSON.parse(saved));
      }
    } catch {}

    // Sincroniza do Supabase em background
    fetchAccountChartStateSupabase(accKey, pKey).then(remoteState => {
      if (remoteState && remoteState.indicators && Array.isArray(remoteState.indicators) && remoteState.indicators.length > 0) {
        setActiveIndicators(remoteState.indicators);
      }
    }).catch(() => {});
  }, [pKey, accKey, currentSymbol]);

  // Auto-salvar indicadores no perfil exclusivo do painel (localStorage + Supabase)
  useEffect(() => {
    if (activeIndicators) {
      try {
        localStorage.setItem(`vortex_active_indicators_${accKey}_${pKey}`, JSON.stringify(activeIndicators));
        localStorage.setItem(`vortex_active_indicators_${currentSymbol}`, JSON.stringify(activeIndicators));
      } catch {}
      saveAccountChartStateSupabase(accKey, pKey, {
        indicators: activeIndicators
      }).catch(() => {});
    }
  }, [activeIndicators, pKey, accKey, currentSymbol]);

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

  const handleToggleVisibility = (id: string) => {
    setActiveIndicators(prev => prev.map(ind => ind.id === id ? { ...ind, visible: !ind.visible } : ind));
  };

  const handleLoadTemplate = (indicators: IndicatorConfig[], _widgets?: WidgetConfig[], tf?: number) => {
    const cloned = JSON.parse(JSON.stringify(indicators));
    setActiveIndicators(cloned);
    try {
      localStorage.setItem(`vortex_active_indicators_${accKey}_${pKey}`, JSON.stringify(cloned));
      localStorage.setItem(`vortex_active_indicators_${currentSymbol}`, JSON.stringify(cloned));
      localStorage.setItem('vortex_workstation_indicators', JSON.stringify(cloned));
    } catch {}
    if (tf && typeof setTimeframe === 'function') {
      setTimeframe(tf);
    }
    saveAccountChartStateSupabase(accKey, pKey, {
      indicators: cloned,
      timeframe: tf
    }).catch(() => {});
  };

  // Localizar qualquer relatório "Em Andamento" do Supabase para o ativo ativo atual
  const activeReportForPanel = useMemo(() => {
    if (!activePanel || !reports) return null;
    return reports.find(r => r.status === 'Em Andamento' && r.description && (() => {
      const match = r.description.match(/\[(.*?)\]/);
      const panelName = match ? match[1] : '';
      const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normalize(panelName) === normalize(activePanel.name);
    })());
  }, [activePanel, reports]);

  const effectiveAiResult = useMemo(() => {
    if (activeReportForPanel) {
      return {
        success: true,
        sinal: activeReportForPanel.side as 'COMPRA' | 'VENDA',
        confianca: 'Ativa',
        alvo: activeReportForPanel.take_profit !== null ? String(activeReportForPanel.take_profit) : '--',
        stop: activeReportForPanel.stop_loss !== null ? String(activeReportForPanel.stop_loss) : '--',
        resumo: activeReportForPanel.description || 'Operação ativa.'
      };
    }
    return aiResult;
  }, [activeReportForPanel, aiResult]);

  const isSignalActive = !!(effectiveAiResult && (effectiveAiResult.sinal === 'COMPRA' || effectiveAiResult.sinal === 'VENDA'));

  // Drag and drop states & handlers
  const DEFAULT_ORDER = ['preco_sentimento', 'forca', 'mapa', 'ia_delta', 'grafico', 'blocktrades', 'mensagens', 'grix_analytics', 'grix_anchors', 'grix_flow', 'grix_stock_replacement', 'projecao_mercado'];
  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );
  const [cardOrder, setCardOrder] = useState<string[]>(DEFAULT_ORDER);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    if (settings) {
      const orderStr = isMobile ? settings.card_order_mobile : settings.card_order_desktop;
      if (orderStr) {
        const orderArr = orderStr.split(',');
        const validOrder = orderArr.filter((item: string) => DEFAULT_ORDER.includes(item));
        DEFAULT_ORDER.forEach((item: string) => {
          if (!validOrder.includes(item)) validOrder.push(item);
        });
        setCardOrder(validOrder);
      } else {
        setCardOrder(DEFAULT_ORDER);
      }
    }
  }, [settings, isMobile]);

  const saveCurrentOrder = (newOrder: string[]) => {
    const orderStr = newOrder.join(',');
    if (isMobile) {
      saveSettings({ card_order_mobile: orderStr });
    } else {
      saveSettings({ card_order_desktop: orderStr });
    }
  };

  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!draggedId || draggedId === id) return;
    if (dragOverTargetId !== id) {
      setDragOverTargetId(id);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverTargetId(null);
    if (!draggedId || draggedId === targetId) return;

    const draggedIdx = cardOrder.indexOf(draggedId);
    const targetIdx = cardOrder.indexOf(targetId);

    if (draggedIdx !== -1 && targetIdx !== -1) {
      const newOrder = [...cardOrder];
      newOrder[draggedIdx] = targetId;
      newOrder[targetIdx] = draggedId;
      setCardOrder(newOrder);
      saveCurrentOrder(newOrder);
    }
    setDraggedId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverTargetId(null);
    saveCurrentOrder(cardOrder);
  };

  const handleTouchStart = (_e: React.TouchEvent, id: string) => {
    setDraggedId(id);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!draggedId) return;

    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!element) return;

    const cardEl = element.closest('[data-card-id]');
    if (cardEl) {
      const targetId = cardEl.getAttribute('data-card-id');
      if (targetId && targetId !== draggedId) {
        const draggedIdx = cardOrder.indexOf(draggedId);
        const targetIdx = cardOrder.indexOf(targetId);

        if (draggedIdx !== -1 && targetIdx !== -1) {
          const newOrder = [...cardOrder];
          newOrder[draggedIdx] = targetId;
          newOrder[targetIdx] = draggedId;
          setCardOrder(newOrder);
        }
      }
    }
  };

  const handleTouchEnd = () => {
    setDraggedId(null);
    saveCurrentOrder(cardOrder);
  };

  const disabledLevels = settings?.disabled_levels || [];

  // Card Hide/Show and Dynamic Resizing States
  const CARD_LABELS: Record<string, string> = {
    preco_sentimento: '💲 Preço & Sentimento',
    forca: '⚡ Força de Mercado',
    mapa: '🗺️ Mapa de Níveis',
    ia_delta: '🤖 IA & Delta',
    grafico: '🕯️ Gráfico de Mercado',
    blocktrades: '🐋 Block Trades',
    mensagens: '📜 Mensagens do Sistema',
    grix_analytics: '📊 Core Analytics',
    grix_anchors: '🧭 Anchors — SPY & QQQ',
    grix_flow: '🌊 Flow & Exposure',
    grix_stock_replacement: '🔄 Stock Replacement (QQQ)',
    projecao_mercado: '🔭 Projeções de Mercado'
  };

  const [hiddenCards, setHiddenCards] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vortex_hidden_cards');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [showCardsMenu, setShowCardsMenu] = useState<boolean>(false);

  const toggleCardVisibility = (id: string) => {
    setHiddenCards(prev => {
      const next = prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id];
      localStorage.setItem('vortex_hidden_cards', JSON.stringify(next));
      return next;
    });
  };

  const showAllCards = () => {
    setHiddenCards([]);
    localStorage.setItem('vortex_hidden_cards', JSON.stringify([]));
  };

  const DEFAULT_COL_SPANS: Record<string, number> = {
    preco_sentimento: 4,
    forca: 4,
    mapa: 4,
    ia_delta: 4,
    grafico: 8,
    blocktrades: 8,
    mensagens: 4,
    grix_analytics: 4,
    grix_anchors: 4,
    grix_flow: 4,
    grix_stock_replacement: 4,
    projecao_mercado: 4
  };

  type ColumnKey = 'col1' | 'col2' | 'col3' | 'col4';

  // Assign cards to 4 Column Tracks (Grid 2x2, 3 Colunas ou 4 Colunas)
  const DEFAULT_CARD_COLUMNS: Record<string, ColumnKey> = {
    preco_sentimento: 'col1',
    forca: 'col1',
    ia_delta: 'col2',
    blocktrades: 'col2',
    grafico: 'col3',
    mapa: 'col3',
    mensagens: 'col1',
    grix_analytics: 'col4',
    grix_anchors: 'col4',
    grix_flow: 'col4',
    grix_stock_replacement: 'col4',
    projecao_mercado: 'col4'
  };

  const [cardColumns, setCardColumns] = useState<Record<string, ColumnKey>>(() => {
    try {
      const saved = localStorage.getItem('vortex_card_columns');
      if (saved) {
        const parsed = JSON.parse(saved);
        const migrated: Record<string, ColumnKey> = {};
        Object.keys(parsed).forEach(k => {
          if (parsed[k] === 'left') migrated[k] = 'col1';
          else if (parsed[k] === 'right') migrated[k] = 'col3';
          else migrated[k] = parsed[k] as ColumnKey;
        });
        return { ...DEFAULT_CARD_COLUMNS, ...migrated };
      }
      return DEFAULT_CARD_COLUMNS;
    } catch {
      return DEFAULT_CARD_COLUMNS;
    }
  });

  const setCardColumnTarget = (cardId: string, col: ColumnKey) => {
    setCardColumns(prev => {
      const updated: Record<string, ColumnKey> = { ...prev, [cardId]: col };
      localStorage.setItem('vortex_card_columns', JSON.stringify(updated));
      return updated;
    });
  };

  // Width spans for each of the 4 columns (must sum up to 12)
  const [colSpans, setColSpans] = useState<Record<ColumnKey, number>>(() => {
    try {
      const saved = localStorage.getItem('vortex_col_spans');
      return saved ? JSON.parse(saved) : { col1: 3, col2: 3, col3: 6, col4: 3 };
    } catch {
      return { col1: 3, col2: 3, col3: 6, col4: 3 };
    }
  });

  const [cardColSpans, setCardColSpans] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('vortex_card_col_spans');
      return saved ? { ...DEFAULT_COL_SPANS, ...JSON.parse(saved) } : DEFAULT_COL_SPANS;
    } catch {
      return DEFAULT_COL_SPANS;
    }
  });

  const [cardHeights, setCardHeights] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('vortex_card_heights');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [cardWidths, setCardWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('vortex_card_widths');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [viewportHeight, setViewportHeight] = useState<number>(
    typeof window !== 'undefined' ? window.innerHeight : 900
  );

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
      setViewportHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const availableHeight = useMemo(() => {
    return Math.max(450, viewportHeight - 115);
  }, [viewportHeight]);

  const startColResize = (e: React.MouseEvent, cardId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const colKey = cardColumns[cardId] || DEFAULT_CARD_COLUMNS[cardId] || 'col1';

    // Find active columns
    const activeCols = (['col1', 'col2', 'col3', 'col4'] as const).filter(col => {
      return cardOrder.some(id => {
        const assignedCol = cardColumns[id] || DEFAULT_CARD_COLUMNS[id] || 'col1';
        return assignedCol === col && !hiddenCards.includes(id);
      });
    });

    const colIdx = activeCols.indexOf(colKey);
    if (colIdx === -1 || colIdx === activeCols.length - 1) return; // Rightmost active column can't expand right

    const nextColKey = activeCols[colIdx + 1];
    const initialColSpan = colSpans[colKey] || 3;
    const initialNextColSpan = colSpans[nextColKey] || 3;

    const gridElement = document.getElementById('vortex-dashboard-grid');
    const oneColWidth = gridElement && gridElement.clientWidth > 0 ? (gridElement.clientWidth / 12) : 80;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const colDelta = Math.round(deltaX / oneColWidth);

      const maxAvailable = initialColSpan + initialNextColSpan - 1;
      const newColSpan = Math.max(1, Math.min(maxAvailable, initialColSpan + colDelta));
      const newNextColSpan = initialColSpan + initialNextColSpan - newColSpan;

      setColSpans(prev => {
        const updated = { ...prev, [colKey]: newColSpan, [nextColKey]: newNextColSpan };
        localStorage.setItem('vortex_col_spans', JSON.stringify(updated));
        return updated;
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const startColResizeLeft = (e: React.MouseEvent, cardId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const colKey = cardColumns[cardId] || DEFAULT_CARD_COLUMNS[cardId] || 'col1';

    // Find active columns
    const activeCols = (['col1', 'col2', 'col3', 'col4'] as const).filter(col => {
      return cardOrder.some(id => {
        const assignedCol = cardColumns[id] || DEFAULT_CARD_COLUMNS[id] || 'col1';
        return assignedCol === col && !hiddenCards.includes(id);
      });
    });

    const colIdx = activeCols.indexOf(colKey);
    if (colIdx <= 0) return; // Leftmost active column can't expand left

    const prevColKey = activeCols[colIdx - 1];
    const initialColSpan = colSpans[colKey] || 3;
    const initialPrevColSpan = colSpans[prevColKey] || 3;

    const gridElement = document.getElementById('vortex-dashboard-grid');
    const oneColWidth = gridElement && gridElement.clientWidth > 0 ? (gridElement.clientWidth / 12) : 80;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const colDelta = Math.round(deltaX / oneColWidth);

      const maxAvailable = initialColSpan + initialPrevColSpan - 1;
      const newColSpan = Math.max(1, Math.min(maxAvailable, initialColSpan - colDelta));
      const newPrevColSpan = initialColSpan + initialPrevColSpan - newColSpan;

      setColSpans(prev => {
        const updated = { ...prev, [colKey]: newColSpan, [prevColKey]: newPrevColSpan };
        localStorage.setItem('vortex_col_spans', JSON.stringify(updated));
        return updated;
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const startRowResize = (e: React.MouseEvent, cardId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const cardElement = document.querySelector(`[data-card-id="${cardId}"]`) as HTMLElement;
    const startHeight = cardElement ? cardElement.clientHeight : 350;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const newHeight = Math.max(120, Math.min(1200, Math.round(startHeight + deltaY)));
      setCardHeights(prev => {
        if (prev[cardId] === newHeight) return prev;
        const updated = { ...prev, [cardId]: newHeight };
        localStorage.setItem('vortex_card_heights', JSON.stringify(updated));
        return updated;
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const startRowResizeTop = (e: React.MouseEvent, cardId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const cardElement = document.querySelector(`[data-card-id="${cardId}"]`) as HTMLElement;
    const startHeight = cardElement ? cardElement.clientHeight : 350;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const newHeight = Math.max(120, Math.min(1200, Math.round(startHeight - deltaY)));
      setCardHeights(prev => {
        if (prev[cardId] === newHeight) return prev;
        const updated = { ...prev, [cardId]: newHeight };
        localStorage.setItem('vortex_card_heights', JSON.stringify(updated));
        return updated;
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const resetCardSizes = () => {
    setCardColSpans(DEFAULT_COL_SPANS);
    setCardHeights({});
    setCardWidths({});
    localStorage.removeItem('vortex_card_col_spans');
    localStorage.removeItem('vortex_card_heights');
    localStorage.removeItem('vortex_card_widths');
  };

  // Layout Profiles System
  interface LayoutProfile {
    id: string;
    name: string;
    cardOrder: string[];
    hiddenCards: string[];
    cardColumns?: Record<string, ColumnKey>;
    colSpans?: Record<ColumnKey, number>;
    cardColSpans: Record<string, number>;
    cardHeights: Record<string, number>;
    cardWidths: Record<string, number>;
  }

  const PRESET_PROFILES: LayoutProfile[] = [
    {
      id: 'desenho2_grid2x2',
      name: '🖼️ Grid 2x2 à Esquerda + Gráfico (Desenho 2)',
      cardOrder: ['preco_sentimento', 'forca', 'ia_delta', 'blocktrades', 'grafico', 'mapa', 'mensagens'],
      hiddenCards: [],
      cardColumns: {
        preco_sentimento: 'col1',
        forca: 'col1',
        ia_delta: 'col2',
        blocktrades: 'col2',
        grafico: 'col3',
        mapa: 'col3',
        mensagens: 'col1'
      },
      colSpans: { col1: 3, col2: 3, col3: 6, col4: 3 },
      cardColSpans: DEFAULT_COL_SPANS,
      cardHeights: {},
      cardWidths: {}
    },
    {
      id: 'desenho1_3colunas',
      name: '📐 3 Colunas: Esquerda + Gráfico Centro + Direita (Desenho 1)',
      cardOrder: ['forca', 'ia_delta', 'grafico', 'preco_sentimento', 'blocktrades', 'mapa', 'mensagens'],
      hiddenCards: [],
      cardColumns: {
        forca: 'col1',
        ia_delta: 'col1',
        grafico: 'col2',
        preco_sentimento: 'col3',
        blocktrades: 'col3',
        mapa: 'col3',
        mensagens: 'col1'
      },
      colSpans: { col1: 3, col2: 6, col3: 3, col4: 3 },
      cardColSpans: DEFAULT_COL_SPANS,
      cardHeights: {},
      cardWidths: {}
    },
    {
      id: 'foco_grafico',
      name: '🕯️ Foco no Gráfico (Coluna Esquerda + Gráfico Expandido)',
      cardOrder: ['preco_sentimento', 'blocktrades', 'grafico', 'ia_delta', 'forca', 'mapa', 'mensagens'],
      hiddenCards: [],
      cardColumns: {
        preco_sentimento: 'col1',
        forca: 'col1',
        ia_delta: 'col1',
        mensagens: 'col1',
        grafico: 'col2',
        blocktrades: 'col2',
        mapa: 'col2'
      },
      colSpans: { col1: 4, col2: 8, col3: 3, col4: 3 },
      cardColSpans: DEFAULT_COL_SPANS,
      cardHeights: {},
      cardWidths: {}
    }
  ];

  const [savedProfiles, setSavedProfiles] = useState<LayoutProfile[]>(() => {
    try {
      const saved = localStorage.getItem('vortex_card_profiles');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Carregar perfis do Supabase na inicialização (perfil de usuário persistido na nuvem)
  useEffect(() => {
    let isMounted = true;
    fetchUserLayoutProfilesSupabase().then((remoteProfiles: UserLayoutProfile[]) => {
      if (isMounted && remoteProfiles && remoteProfiles.length > 0) {
        const formatted: LayoutProfile[] = remoteProfiles.map(p => ({
          id: p.id,
          name: p.name,
          cardOrder: p.card_order || DEFAULT_ORDER,
          hiddenCards: p.hidden_cards || [],
          cardColumns: p.card_columns as Record<string, ColumnKey> | undefined,
          colSpans: p.card_col_spans as any, // We map colSpans to card_col_spans column in database
          cardColSpans: DEFAULT_COL_SPANS,
          cardHeights: p.card_heights || {},
          cardWidths: p.card_widths || {}
        }));
        setSavedProfiles(formatted);
        localStorage.setItem('vortex_card_profiles', JSON.stringify(formatted));
      }
    });
    return () => { isMounted = false; };
  }, []);

  const [newProfileName, setNewProfileName] = useState<string>('');

  const applyProfile = (profile: LayoutProfile) => {
    setCardOrder(profile.cardOrder);
    setHiddenCards(profile.hiddenCards);
    if (profile.cardColumns) {
      setCardColumns(profile.cardColumns);
      localStorage.setItem('vortex_card_columns', JSON.stringify(profile.cardColumns));
    }
    if (profile.colSpans) {
      setColSpans(profile.colSpans);
      localStorage.setItem('vortex_col_spans', JSON.stringify(profile.colSpans));
    }
    setCardColSpans(profile.cardColSpans || DEFAULT_COL_SPANS);
    setCardHeights(profile.cardHeights || {});
    setCardWidths(profile.cardWidths || {});
    localStorage.setItem('vortex_hidden_cards', JSON.stringify(profile.hiddenCards));
    localStorage.setItem('vortex_card_col_spans', JSON.stringify(profile.cardColSpans || DEFAULT_COL_SPANS));
    localStorage.setItem('vortex_card_heights', JSON.stringify(profile.cardHeights || {}));
    localStorage.setItem('vortex_card_widths', JSON.stringify(profile.cardWidths || {}));
    saveCurrentOrder(profile.cardOrder);
  };

  const handleSaveProfile = async () => {
    if (!newProfileName.trim()) return;
    const profileId = `custom_${Date.now()}`;
    const profile: LayoutProfile = {
      id: profileId,
      name: newProfileName.trim(),
      cardOrder,
      hiddenCards,
      cardColumns,
      colSpans,
      cardColSpans,
      cardHeights,
      cardWidths
    };
    const updated = [...savedProfiles, profile];
    setSavedProfiles(updated);
    localStorage.setItem('vortex_card_profiles', JSON.stringify(updated));
    setNewProfileName('');

    // Persistir perfil no Supabase para o usuário logado (usando card_col_spans para guardar colSpans)
    await saveUserLayoutProfileSupabase({
      id: profileId,
      name: profile.name,
      card_order: profile.cardOrder,
      hidden_cards: profile.hiddenCards,
      card_columns: profile.cardColumns,
      card_col_spans: profile.colSpans as any,
      card_heights: profile.cardHeights,
      card_widths: profile.cardWidths
    });
  };

  const handleDeleteProfile = async (profileId: string) => {
    const updated = savedProfiles.filter(p => p.id !== profileId);
    setSavedProfiles(updated);
    localStorage.setItem('vortex_card_profiles', JSON.stringify(updated));

    // Deletar perfil no Supabase
    await deleteUserLayoutProfileSupabase(profileId);
  };

  // Toggle nível no mapa
  const toggleLevelVisibility = (levelKey: string) => {
    let updated: string[];
    if (disabledLevels.includes(levelKey)) {
      updated = disabledLevels.filter((k: string) => k !== levelKey);
    } else {
      updated = [...disabledLevels, levelKey];
    }
    saveSettings({ disabled_levels: updated });
  };



  const getActiveLevels = () => {
    if (!gammaLevels) return [];
    const niveis: { label: string; class: string; price: number }[] = [];
    const pushNivel = (val: any, label: string, tipo: string) => {
      const num = Number(val);
      if (val && !isNaN(num) && num > 0 && !disabledLevels.includes(tipo)) {
        niveis.push({ label, class: tipo, price: num });
      }
    };

    pushNivel(gammaLevels.hvl, 'HVL', 'hvl');
    pushNivel(gammaLevels.call, 'Call', 'call');
    pushNivel(gammaLevels.put, 'Put', 'put');
    pushNivel(gammaLevels.max1d, 'Max', 'max1d');
    pushNivel(gammaLevels.min1d, 'Min', 'min1d');
    pushNivel(gammaLevels.prev, 'Ajuste', 'prev');
    pushNivel(gammaLevels.prevH, 'MxAnt', 'prevH');
    pushNivel(gammaLevels.prevL, 'MnAnt', 'prevL');
    pushNivel(gammaLevels.hvl0, 'HVL0', 'hvl0');
    pushNivel(gammaLevels.call0, 'Call0', 'call0');
    pushNivel(gammaLevels.put0, 'Put0', 'put0');
    pushNivel(gammaLevels.gwall, 'GWall', 'gwall');

    if (gammaLevels.bl && !disabledLevels.includes('bl_count')) {
      gammaLevels.bl.forEach((v, i) => {
        if (v > 0) niveis.push({ label: `BL${(i % 10) + 1}`, class: 'bl', price: v });
      });
    }
    if (gammaLevels.gex && !disabledLevels.includes('gex_count')) {
      gammaLevels.gex.forEach((v, i) => {
        if (v > 0) niveis.push({ label: `GEX${(i % 10) + 1}`, class: 'gex', price: v });
      });
    }
    return niveis;
  };

  // Cálculo do Mapa de Níveis
  const renderLevelsMap = () => {
    if (!marketData || !gammaLevels) {
      return <div className="text-slate-600 text-sm text-center py-6">Aguardando dados...</div>;
    }

    const currentPrice = Number(marketData.price);
    const niveis = getActiveLevels();
    const activePrices = [...niveis.map(n => n.price)];
    if (!isNaN(currentPrice) && currentPrice > 0) {
      activePrices.push(currentPrice);
    }

    if (niveis.length === 0 && activePrices.length === 0) {
      return <div className="text-slate-600 text-sm text-center py-6">Aguardando dados...</div>;
    }

    const rawMin = Math.min(...activePrices);
    const rawMax = Math.max(...activePrices);
    const rawRange = rawMax - rawMin || 20;
    const margem = rawRange * 0.10; // Margem de 10% do projeto base offline
    const tMin = rawMin - margem;
    const tMax = rawMax + margem;
    const range = tMax - tMin;

    const getPercent = (p: number) => {
      // Invertido: menor preço à esquerda, maior preço à direita
      return ((p - tMin) / range) * 100;
    };

    return (
      <div className="relative h-full w-full">
        {/* Linhas de Nível */}
        {niveis.map((n, idx) => {
          const pct = getPercent(n.price);
          return (
            <div
              key={idx}
              className={`nivel-linha ${n.class}`}
              style={{ left: `${pct.toFixed(2)}%` }}
            />
          );
        })}

        {/* Linha do Preço Atual */}
        {!isNaN(currentPrice) && currentPrice > 0 && (
          <>
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-blue-400 opacity-80 pointer-events-none"
              style={{ left: `${getPercent(currentPrice).toFixed(2)}%` }}
            />
            <div
              className="preco-marker"
              style={{ left: `${getPercent(currentPrice).toFixed(2)}%` }}
              title={`Preço Atual: ${currentPrice}`}
            />
          </>
        )}

        {/* Indicadores de Mínimo e Máximo do Range nas extremidades */}
        <div className="absolute bottom-0.5 left-1 text-[8px] text-slate-500 font-mono font-bold">
          {tMin.toFixed(2)}
        </div>
        <div className="absolute bottom-0.5 right-1 text-[8px] text-slate-500 font-mono font-bold text-right">
          {tMax.toFixed(2)}
        </div>
      </div>
    );
  };

  // Painel de Viés Gamma
  const renderGammaBias = () => {
    if (!marketData || !gammaLevels) {
      return <div className="text-slate-600 text-sm text-center py-6">Aguardando dados...</div>;
    }

    const bias = gammaLevels.gamma_bias || '--';
    const score = gammaLevels.bias_score || 0;
    const strategy = gammaLevels.recommended_strategy || '--';
    const confluence = gammaLevels.confluence_type || '--';
    
    const buyStr = gammaLevels.buy_strength || 0;
    const sellStr = gammaLevels.sell_strength || 0;
    const totalStr = buyStr + sellStr || 100;
    const buyPct = Math.round((buyStr / totalStr) * 100);
    const sellPct = 100 - buyPct;

    const currentPrice = marketData ? Number(marketData.price) : 0;
    const activeNiveis = getActiveLevels();

    const supports = activeNiveis.filter(n => n.price <= currentPrice);
    const nearestSupportObj = supports.length > 0 
      ? supports.reduce((prev, curr) => (curr.price > prev.price ? curr : prev))
      : null;

    const resistances = activeNiveis.filter(n => n.price >= currentPrice);
    const nearestResistanceObj = resistances.length > 0 
      ? resistances.reduce((prev, curr) => (curr.price < prev.price ? curr : prev))
      : null;

    const nearSup = nearestSupportObj ? nearestSupportObj.price : (gammaLevels.nearest_support || 0);
    const distSup = nearestSupportObj ? Math.abs(currentPrice - nearestSupportObj.price) : (gammaLevels.distance_to_support || 0);
    const nearSupLabel = nearestSupportObj ? nearestSupportObj.label : '';

    const nearRes = nearestResistanceObj ? nearestResistanceObj.price : (gammaLevels.nearest_resistance || 0);
    const distRes = nearestResistanceObj ? Math.abs(nearestResistanceObj.price - currentPrice) : (gammaLevels.distance_to_resistance || 0);
    const nearResLabel = nearestResistanceObj ? nearestResistanceObj.label : '';

    // Cores baseadas no viés
    let biasColor = 'text-slate-400 bg-slate-800/40 border-slate-700/50';
    if (bias.toUpperCase().includes('COMPRA') || bias.toUpperCase().includes('BULL') || bias.toUpperCase().includes('BUY') || score > 20) {
      biasColor = 'text-green-400 bg-green-950/40 border-green-800/30';
    } else if (bias.toUpperCase().includes('VENDA') || bias.toUpperCase().includes('BEAR') || bias.toUpperCase().includes('SELL') || score < -20) {
      biasColor = 'text-red-400 bg-red-950/40 border-red-800/30';
    }

    return (
      <div className="flex flex-col justify-start gap-1 w-full p-1 text-[9px] font-sans select-none">
        {/* Linha Superior: Viés & Estratégia */}
        <div className="flex justify-between items-center gap-2">
          <div className={`px-2 py-0.5 rounded border ${biasColor} font-bold flex items-center gap-1`}>
            <span>Viés: {bias}</span>
            <span className="text-[8px] opacity-80">({score > 0 ? `+${score}` : score})</span>
          </div>
          <div className="text-purple-400 font-bold bg-purple-950/40 border border-purple-800/30 px-2 py-0.5 rounded truncate max-w-[170px]" title={strategy}>
            💡 {strategy}
          </div>
        </div>

        {/* Linha do Meio: Barra Comparativa de Força */}
        <div className="relative h-3.5 bg-slate-950 rounded overflow-hidden flex my-0.5">
          <div 
            className="h-full bg-gradient-to-r from-green-600 to-green-500 transition-all duration-500"
            style={{ width: `${buyPct}%` }}
          />
          <div 
            className="h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-500"
            style={{ width: `${sellPct}%` }}
          />
          {/* Percentuais nos extremos para evitar clipping/ocultação */}
          <span className="absolute left-2 top-0 h-full flex items-center text-[10px] text-white font-extrabold pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {buyPct}%
          </span>
          <span className="absolute right-2 top-0 h-full flex items-center text-[10px] text-white font-extrabold pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {sellPct}%
          </span>
        </div>

        {/* Linha Inferior: Suporte / Resistência compactos */}
        <div className="flex justify-between items-center text-[8px] text-slate-400 font-mono">
          <span className="truncate max-w-[170px]" title={`Suporte: ${nearSup} (Dist: ${distSup}) ${nearSupLabel}`}>
            <span className="hidden md:inline">🟢 Sup: </span>
            <span className="text-green-500 font-bold">{nearSup}</span> ({distSup.toFixed(0)}){nearSupLabel && ` ${nearSupLabel}`}
          </span>
          <span className="text-[7px] text-slate-500 truncate max-w-[40px]" title={`Confluência: ${confluence}`}>
            {confluence}
          </span>
          <span className="truncate max-w-[170px]" title={`Resistência: ${nearRes} (Dist: ${distRes}) ${nearResLabel}`}>
            {nearResLabel && `${nearResLabel} `}
            <span className="hidden md:inline">🔴 Res: </span>
            <span className="text-red-500 font-bold">{nearRes}</span> ({distRes.toFixed(0)})
          </span>
        </div>
      </div>
    );
  };

  const getShortSymbol = (symbol: string): string => {
    switch (symbol) {
      case 'NASDAQ': return 'NDAQ';
      case 'S&P 500': return 'SP500';
      case 'USD Index': return 'DXY';
      case 'VIX': return 'VIX';
      case 'NVIDIA': return 'NVDA';
      case 'Microsoft': return 'MSOFT';
      case 'Apple': return 'AAPL';
      case 'Meta': return 'META';
      case 'Amazon': return 'AMZON';
      case 'Alphabet': return 'ALPHA';
      case 'Tesla': return 'TSLA';
      case 'FORÇA FINAL': return 'FORCA';
      default: return symbol.substring(0, 6).toUpperCase();
    }
  };

  const getWindowTimeRemaining = () => {
    if (windowMinutes === Infinity || !windowBaseline) return '';
    const elapsedSeconds = Math.floor((Date.now() - windowBaseline.time) / 1000);
    const remainingSeconds = windowMinutes * 60 - elapsedSeconds;
    if (remainingSeconds <= 0) return ' • 0:00s';
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    return ` • ${mins}:${secs.toString().padStart(2, '0')}s`;
  };

  const getSentimentRotation = (val?: number) => {
    if (val === undefined || isNaN(val)) return -90;
    const value = Math.round(val); // Apenas valor inteiro sem decimal
    return (value / 100) * 180 - 90;
  };

  // Filtrar Notícias do Dia Local e Ordenar (Mais Recentes no Topo)
  const filteredNews = news.filter(item => {
    const todayStr = new Date().toLocaleDateString('pt-BR');
    const itemDateStr = item.date.toLocaleDateString('pt-BR');
    if (itemDateStr !== todayStr) return false;

    // Filtros de país e impacto das configurações do usuário
    if (settings) {
      const countries = settings.news_countries || ['USD', 'EUR', 'GBP', 'JPY'];
      if (!countries.includes(item.country) && item.country !== 'ALL') return false;

      const impHigh = settings.news_impact_high !== false;
      const impMedium = settings.news_impact_medium !== false;
      const impLow = settings.news_impact_low || false;

      if (item.impact === 'high' && !impHigh) return false;
      if (item.impact === 'medium' && !impMedium) return false;
      if (item.impact === 'low' && !impLow) return false;
    }

    if (newsFilter === 'all') return true;
    return item.impact === newsFilter;
  }).sort((a, b) => a.date.getTime() - b.date.getTime());

  // Posicionamento do marcador Delta (0% a 100%)
  const getDeltaLeft = () => {
    if (!marketData) return 50;
    if (marketData.deltaPct !== undefined && !isNaN(marketData.deltaPct)) {
      return Math.max(0, Math.min(100, marketData.deltaPct));
    }
    if (marketData.delta_pct !== undefined && !isNaN(marketData.delta_pct)) {
      return Math.max(0, Math.min(100, marketData.delta_pct));
    }
    let buy = marketData.buyVolume || 0;
    let sell = marketData.sellVolume || 0;
    if (windowBaseline && windowMinutes < Infinity) {
      buy = Math.max(0, buy - windowBaseline.buy);
      sell = Math.max(0, sell - windowBaseline.sell);
    }
    const total = buy + sell;
    if (total > 0) {
      return Math.max(0, Math.min(100, (buy / total) * 100));
    }
    return 50;
  };

  // Cores do Sinal IA
  const getSignalColorClass = (sinal: string) => {
    switch (sinal) {
      case 'COMPRA': return 'text-green-500 font-black';
      case 'VENDA': return 'text-red-500 font-black';
      case 'SAIR': return 'text-orange-500 font-bold';
      default: return 'text-slate-500';
    }
  };

  const getSignalBorderClass = (sinal: string) => {
    switch (sinal) {
      case 'COMPRA': return 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.15)]';
      case 'VENDA': return 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)]';
      case 'SAIR': return 'border-orange-500/50';
      default: return 'border-slate-700';
    }
  };

  const renderNewsCountdown = (itemDate: Date) => {
    const now = new Date();
    const itemTime = new Date(itemDate);
    const diffMs = itemTime.getTime() - now.getTime();
    const diffMin = Math.round(diffMs / 60000);
    const timeStr = itemTime.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

    // Pega limites locais (default 5 e 15 como no projeto base)
    const alertBefore = 5;
    const alertAfter = 15;

    if (diffMs > 0) {
      if (diffMin <= alertBefore) {
        return <span className="news-countdown imminent">⏰ {diffMin}min</span>;
      } else if (diffMin <= 30) {
        const hours = Math.floor(diffMin / 60);
        const mins = diffMin % 60;
        const label = hours > 0 ? `${hours}h${mins}m` : `${mins}min`;
        return <span className="news-countdown soon">⏰ {label}</span>;
      } else {
        return <span className="news-countdown distant">{timeStr}</span>;
      }
      const afterMin = Math.abs(diffMin);
      if (afterMin <= alertAfter) {
        return <span className="news-countdown imminent animate-pulse">🔥 ATIVA</span>;
      } else {
        return <span className="news-countdown passed">✓ {timeStr}</span>;
      }
    }
  };

  const getColSpanClass = (colKey: ColumnKey) => {
    if (isMobile) return 'col-span-12';
    const span = colSpans[colKey] || 3;
    switch (span) {
      case 1: return 'col-span-12 lg:col-span-1';
      case 2: return 'col-span-12 lg:col-span-2';
      case 3: return 'col-span-12 lg:col-span-3';
      case 4: return 'col-span-12 lg:col-span-4';
      case 5: return 'col-span-12 lg:col-span-5';
      case 6: return 'col-span-12 lg:col-span-6';
      case 7: return 'col-span-12 lg:col-span-7';
      case 8: return 'col-span-12 lg:col-span-8';
      case 9: return 'col-span-12 lg:col-span-9';
      case 10: return 'col-span-12 lg:col-span-10';
      case 11: return 'col-span-12 lg:col-span-11';
      case 12: return 'col-span-12 lg:col-span-12';
      default: return 'col-span-12 lg:col-span-3';
    }
  };

  const renderCardComponent = (cardId: string) => {
    if (cardId === 'preco_sentimento') {
      if (hiddenCards.includes('preco_sentimento')) return null;
      return (
        <div
          key="preco_sentimento"
          data-card-id="preco_sentimento"
          onDragOver={(e) => handleDragOver(e, 'preco_sentimento')}
          onDrop={(e) => handleDrop(e, 'preco_sentimento')}
          onDragLeave={() => setDragOverTargetId(null)}
          style={{
            order: cardOrder.indexOf('preco_sentimento'),
            height: cardHeights['preco_sentimento'] ? `${cardHeights['preco_sentimento']}px` : undefined
          }}
          className={`w-full relative group grid grid-cols-2 lg:grid-cols-1 gap-1 transition-all duration-300 ${draggedId === 'preco_sentimento' ? 'opacity-40' : ''} ${dragOverTargetId === 'preco_sentimento' ? 'ring-2 ring-blue-500/80 rounded-lg scale-[1.01]' : ''}`}
        >
                {/* Esquerda: Preço + Acelerômetro */}
                <div className="space-y-1 col-span-1">
                  {/* Card Preço */}
                  <div className="glass rounded-lg border border-slate-800 flex flex-col overflow-hidden">
                    <div 
                      className="flex justify-between items-center px-2.5 py-1.5 select-none cursor-grab active:cursor-grabbing bg-slate-900/10 hover:bg-slate-850/40"
                      draggable
                      onDragStart={(e) => handleDragStart(e, 'preco_sentimento')}
                      onDragEnd={handleDragEnd}
                      onTouchStart={(e) => handleTouchStart(e, 'preco_sentimento')}
                      onTouchEnd={handleTouchEnd}
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500 text-[10px] cursor-grab">⋮⋮</span>
                        <div className="fluid-text-title font-bold text-blue-300 font-mono tracking-wider">
                          {marketData?.symbol || '--'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="text-[11px] md:text-[14px] text-white text-right font-mono font-bold leading-none">
                          {marketData?.timestamp || '--:--:--'}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleCardVisibility('preco_sentimento'); }}
                          className="text-slate-500 hover:text-red-400 text-xs px-1 rounded transition-colors cursor-pointer"
                          title="Ocultar este card"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="px-2.5 pb-2 pt-0.5 fluid-text-value font-mono font-bold text-white leading-tight pl-12 md:pl-2.5">
                      {(() => {
                        if (!marketData?.price) return '--';
                        const num = typeof marketData.price === 'number' ? marketData.price : parseFloat(String(marketData.price));
                        return isNaN(num) ? String(marketData.price) : num.toFixed(2);
                      })()}
                    </div>
                  </div>

                  {/* Card Acelerômetro */}
                  <div className="glass rounded-lg border border-slate-800 overflow-hidden flex flex-col">
                    <div 
                      className="text-[10px] font-bold text-yellow-400 uppercase px-2.5 py-1.5 select-none cursor-grab active:cursor-grabbing bg-slate-900/10 hover:bg-slate-850/40 flex items-center gap-1"
                      draggable
                      onDragStart={(e) => handleDragStart(e, 'preco_sentimento')}
                      onDragEnd={handleDragEnd}
                      onTouchStart={(e) => handleTouchStart(e, 'preco_sentimento')}
                      onTouchEnd={handleTouchEnd}
                    >
                      <span className="text-slate-500 text-[10px]">⋮⋮</span>
                      <span>⚡ Acelerômetro</span>
                    </div>
                    <div className="px-2.5 pb-2 pt-0.5">
                      <div className="mb-1">
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span className="text-slate-400">Z-Score</span>
                          <span className="font-mono font-bold">{marketData?.zScore?.toFixed(2) || '0.00'}</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
                            style={{
                              width: `${Math.max(0, Math.min(100, ((marketData?.zScore || 0) + 3) * 16.6))}%`,
                              transition: 'width 0.3s'
                            }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span className="text-slate-400">ATR Ratio</span>
                          <span className="font-mono font-bold">{marketData?.atrRatio?.toFixed(2) || '0.00'}</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                            style={{
                              width: `${Math.max(0, Math.min(100, (marketData?.atrRatio || 0) * 33.3))}%`,
                              transition: 'width 0.3s'
                            }}
                          ></div>
                        </div>
                      </div>
                      <div className={`mt-1.5 p-1 rounded text-center text-[10px] font-bold border uppercase ${(() => {
                        const est = (marketData?.estado || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]+/g, ' ').toUpperCase();
                        if (est.includes('EXPLOSAO') && (est.includes('COMPRA') || est.includes('BUY') || est.includes('ALTA'))) return 'bg-emerald-950/60 text-emerald-300 border-emerald-500/60 animate-pulse';
                        if (est.includes('EXPLOSAO') && (est.includes('VENDA') || est.includes('SELL') || est.includes('BAIXA'))) return 'bg-rose-950/60 text-rose-300 border-rose-500/60 animate-pulse';
                        if (est.includes('EXAUSTAO')) return 'bg-amber-950/60 text-amber-300 border-amber-600/60';
                        if (est.includes('COMPRESSAO')) return 'bg-yellow-950/60 text-yellow-300 border-yellow-600/60';
                        if (est === 'NORMAL') return 'bg-cyan-950/40 text-cyan-300 border-cyan-700/50';
                        if (est.includes('COMPRA') || est.includes('BUY')) return 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50';
                        if (est.includes('VENDA') || est.includes('SELL')) return 'bg-rose-900/40 text-rose-300 border-rose-700/50';
                        return 'bg-blue-900/30 text-blue-300 border-blue-800';
                      })()}`}>
                        {marketData?.estado || 'AGUARDANDO'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Direita: Sentimento */}
                <div className="col-span-1 h-full lg:h-auto">
                  {/* Card Sentimento */}
                  <div className="glass rounded-lg border border-slate-800 text-center h-full flex flex-col overflow-hidden">
                    <div 
                      className="text-[10px] font-bold text-purple-400 uppercase px-2 py-1 select-none cursor-grab active:cursor-grabbing bg-slate-900/10 hover:bg-slate-850/40 flex items-center justify-center gap-1"
                      draggable
                      onDragStart={(e) => handleDragStart(e, 'preco_sentimento')}
                      onDragEnd={handleDragEnd}
                      onTouchStart={(e) => handleTouchStart(e, 'preco_sentimento')}
                      onTouchEnd={handleTouchEnd}
                    >
                      <span className="text-slate-500 text-[10px]">⋮⋮</span>
                      <span>📊 SENTIMENTO</span>
                    </div>
                    <div className="px-1 pb-1.5 pt-0.5 flex flex-col justify-center flex-1">
                      {(() => {
                        const macroVal = marketData?.sentiment;
                        const mercadoVal = marketData?.marketSentiment !== undefined
                          ? marketData.marketSentiment
                          : (marketData?.originalSentiment !== undefined ? marketData.originalSentiment : marketData?.sentiment);

                        return (
                          <>
                            <div className="grid grid-cols-2 gap-1 items-center justify-center">
                              {/* Esquerda: Sentimento Macro (Com compensação) */}
                              <div className="flex flex-col items-center">
                                <div className="text-[8px] font-bold text-purple-300 uppercase tracking-wider mb-0.5">Macro</div>
                                <div className="gauge-container-compact mx-auto">
                                  <div className="gauge-bg-compact">
                                    <div className="gauge-mask-compact"></div>
                                  </div>
                                  <div
                                    className="gauge-needle-compact"
                                    style={{ transform: `rotate(${getSentimentRotation(macroVal)}deg)` }}
                                  ></div>
                                  <div className="gauge-center-compact"></div>
                                  <div className="gauge-value-compact">
                                    <div className="gauge-value-number-compact text-white font-mono">
                                      {macroVal !== undefined ? `${Math.round(macroVal)}%` : '0%'}
                                    </div>
                                  </div>
                                </div>
                                <div className="w-[100px] mx-auto flex justify-between px-0 mt-0.5 text-[9px] font-extrabold leading-none select-none">
                                  <span className="text-red-400">V</span>
                                  <span className="text-green-400">C</span>
                                </div>
                              </div>

                              {/* Direita: Sentimento Micro (Sem referências externas) */}
                              <div className="flex flex-col items-center">
                                <div className="text-[8px] font-bold text-cyan-300 uppercase tracking-wider mb-0.5">Micro</div>
                                <div className="gauge-container-compact mx-auto">
                                  <div className="gauge-bg-compact">
                                    <div className="gauge-mask-compact"></div>
                                  </div>
                                  <div
                                    className="gauge-needle-compact"
                                    style={{ transform: `rotate(${getSentimentRotation(mercadoVal)}deg)` }}
                                  ></div>
                                  <div className="gauge-center-compact"></div>
                                  <div className="gauge-value-compact">
                                    <div className="gauge-value-number-compact text-white font-mono">
                                      {mercadoVal !== undefined ? `${Math.round(mercadoVal)}%` : '0%'}
                                    </div>
                                  </div>
                                </div>
                                <div className="w-[100px] mx-auto flex justify-between px-0 mt-0.5 text-[9px] font-extrabold leading-none select-none">
                                  <span className="text-red-400">V</span>
                                  <span className="text-green-400">C</span>
                                </div>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Resize Handle - Right */}
                <div
                  onMouseDown={(e) => startColResize(e, 'preco_sentimento')}
                  className="absolute top-0 bottom-0 right-0 w-2.5 cursor-col-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Clique e arraste para alterar a largura (Direita)"
                >
                  <div className="w-[2px] h-8 bg-blue-400/80 rounded" />
                </div>
                {/* Resize Handle - Left */}
                <div
                  onMouseDown={(e) => startColResizeLeft(e, 'preco_sentimento')}
                  className="absolute top-0 bottom-0 left-0 w-2.5 cursor-col-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Clique e arraste para alterar a largura (Esquerda)"
                >
                  <div className="w-[2px] h-8 bg-blue-400/80 rounded" />
                </div>
                {/* Resize Handle - Bottom */}
                <div
                  onMouseDown={(e) => startRowResize(e, 'preco_sentimento')}
                  className="absolute left-0 right-0 bottom-0 h-2.5 cursor-row-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Clique e arraste para alterar a altura (Baixo)"
                >
                  <div className="h-[2px] w-8 bg-blue-400/80 rounded" />
                </div>
                {/* Resize Handle - Top */}
                <div
                  onMouseDown={(e) => startRowResizeTop(e, 'preco_sentimento')}
                  className="absolute left-0 right-0 top-0 h-2.5 cursor-row-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Clique e arraste para alterar a altura (Cima)"
                >
                  <div className="h-[2px] w-8 bg-blue-400/80 rounded" />
                </div>
              </div>
            );
          }

          if (cardId === 'forca') {
            if (hiddenCards.includes('forca')) return null;
            return (
              <div
                key="forca"
                data-card-id="forca"
                onDragOver={(e) => handleDragOver(e, 'forca')}
                onDrop={(e) => handleDrop(e, 'forca')}
                onDragLeave={() => setDragOverTargetId(null)}
                style={{
                  order: cardOrder.indexOf('forca'),
                  height: cardHeights['forca'] ? `${cardHeights['forca']}px` : undefined
                }}
                className={`w-full min-w-0 max-w-full relative group transition-all duration-300 ${draggedId === 'forca' ? 'opacity-40' : ''} ${dragOverTargetId === 'forca' ? 'ring-2 ring-blue-500/80 rounded-lg scale-[1.01]' : ''}`}
              >
                <div className="glass rounded-lg h-full border border-slate-800 flex flex-col overflow-hidden">
                  <div 
                    className="text-xs font-bold text-purple-400 uppercase px-3 py-2 select-none cursor-grab active:cursor-grabbing bg-slate-900/10 hover:bg-slate-850/40 flex justify-between items-center"
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'forca')}
                    onDragEnd={handleDragEnd}
                    onTouchStart={(e) => handleTouchStart(e, 'forca')}
                    onTouchEnd={handleTouchEnd}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 text-[11px] cursor-grab">⋮⋮</span>
                      <span>💪 Força Momentum</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCardVisibility('forca'); }}
                      className="text-slate-500 hover:text-red-400 text-xs px-1 rounded transition-colors cursor-pointer"
                      title="Ocultar este card"
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div className="px-3 pb-3 pt-1 grid grid-cols-2 lg:grid-cols-1 gap-x-2.5 gap-y-0 flex-1 overflow-hidden no-scrollbar pr-1">
                    {forces.length === 0 ? (
                      <div className="text-slate-500 text-xs py-4 text-center col-span-2">Buscando forces...</div>
                    ) : (() => {
                      const activeForces = forces.filter(f => {
                        if (f.symbol === 'FORÇA FINAL') return false;
                        let cfgId = '';
                        if (f.symbol === 'S&P 500') cfgId = 'sp500_impulso';
                        else if (f.symbol === 'USD Index') cfgId = 'usdindex_impulso';
                        else cfgId = `${f.symbol.toLowerCase()}_impulso`;
                        const cfg = forcesConfig.find(c => c.id === cfgId);
                        return cfg ? cfg.ativo : true;
                      });

                      const avgBuy = activeForces.length > 0 
                        ? Math.round(activeForces.reduce((acc, curr) => {
                            const isInverted = curr.symbol === 'VIX' || curr.symbol === 'USD Index';
                            const contribution = isInverted ? (100 - curr.buy) : curr.buy;
                            return acc + contribution;
                          }, 0) / activeForces.length)
                        : 50;
                      const avgSell = 100 - avgBuy;

                      return (
                        <>
                          <div className="space-y-0">
                            {forces.slice(0, 6).map((item) => {
                              let cfgId = '';
                              if (item.symbol === 'S&P 500' || item.symbol === 'S&P 500') cfgId = 'sp500_impulso';
                              else if (item.symbol === 'USD Index') cfgId = 'usdindex_impulso';
                              else if (item.symbol === 'FORÇA FINAL') cfgId = 'forca_final';
                              else cfgId = `${item.symbol.toLowerCase()}_impulso`;

                              const cfg = forcesConfig.find(f => f.id === cfgId);
                              const isAtivo = cfgId === 'forca_final' ? true : (cfg ? cfg.ativo : false);
                              const displayBuy = cfgId === 'forca_final' ? avgBuy : item.buy;
                              const displaySell = cfgId === 'forca_final' ? avgSell : item.sell;

                              return (
                                <div 
                                  key={item.symbol} 
                                  onClick={() => {
                                    if (cfgId !== 'forca_final') toggleForceConfig(cfgId);
                                  }}
                                  className={`flex items-center gap-1.5 py-0 border-b border-slate-800/10 last:border-b-0 text-[10px] cursor-pointer select-none transition hover:bg-slate-900/60 rounded px-1 ${isAtivo ? 'bg-green-950/20 border border-green-800/20' : 'opacity-35 grayscale'}`}
                                >
                                  <span className="font-bold text-slate-300 font-mono w-9 truncate" title={item.symbol}>{getShortSymbol(item.symbol)}</span>
                                  <span className="text-green-400 font-bold w-7 text-right font-mono">{displayBuy}%</span>
                                  <div className="flex-1 h-[9px] bg-slate-800 rounded-full overflow-hidden flex">
                                    <div className="bg-green-500" style={{ width: `${displayBuy}%` }}></div>
                                    <div className="bg-red-500" style={{ width: `${displaySell}%` }}></div>
                                  </div>
                                  <span className="text-red-400 font-bold w-7 text-left font-mono">{displaySell}%</span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="space-y-0">
                            {forces.slice(6, 12).map((item) => {
                              let cfgId = '';
                              if (item.symbol === 'S&P 500') cfgId = 'sp500_impulso';
                              else if (item.symbol === 'USD Index') cfgId = 'usdindex_impulso';
                              else if (item.symbol === 'FORÇA FINAL') cfgId = 'forca_final';
                              else cfgId = `${item.symbol.toLowerCase()}_impulso`;

                              const cfg = forcesConfig.find(f => f.id === cfgId);
                              const isAtivo = cfgId === 'forca_final' ? true : (cfg ? cfg.ativo : false);
                              const displayBuy = cfgId === 'forca_final' ? avgBuy : item.buy;
                              const displaySell = cfgId === 'forca_final' ? avgSell : item.sell;

                              return (
                                <div 
                                  key={item.symbol} 
                                  onClick={() => {
                                    if (cfgId !== 'forca_final') toggleForceConfig(cfgId);
                                  }}
                                  className={`flex items-center gap-1.5 py-0 border-b border-slate-800/10 last:border-b-0 text-[10px] cursor-pointer select-none transition hover:bg-slate-900/60 rounded px-1 ${isAtivo ? 'bg-green-950/20 border border-green-800/20' : 'opacity-35 grayscale'}`}
                                >
                                  <span className="font-bold text-slate-300 font-mono w-9 truncate" title={item.symbol}>{getShortSymbol(item.symbol)}</span>
                                  <span className="text-green-400 font-bold w-7 text-right font-mono">{displayBuy}%</span>
                                  <div className="flex-1 h-[9px] bg-slate-800 rounded-full overflow-hidden flex">
                                    <div className="bg-green-500" style={{ width: `${displayBuy}%` }}></div>
                                    <div className="bg-red-500" style={{ width: `${displaySell}%` }}></div>
                                  </div>
                                  <span className="text-red-400 font-bold w-7 text-left font-mono">{displaySell}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Resize Handles - 4 Directions */}
                  <div
                    onMouseDown={(e) => startColResize(e, 'forca')}
                    className="absolute top-0 bottom-0 right-0 w-2.5 cursor-col-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Clique e arraste para alterar a largura (Direita)"
                  >
                    <div className="w-[2px] h-8 bg-blue-400/80 rounded" />
                  </div>
                  <div
                    onMouseDown={(e) => startColResizeLeft(e, 'forca')}
                    className="absolute top-0 bottom-0 left-0 w-2.5 cursor-col-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Clique e arraste para alterar a largura (Esquerda)"
                  >
                    <div className="w-[2px] h-8 bg-blue-400/80 rounded" />
                  </div>
                  <div
                    onMouseDown={(e) => startRowResize(e, 'forca')}
                    className="absolute left-0 right-0 bottom-0 h-2.5 cursor-row-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Clique e arraste para alterar a altura (Baixo)"
                  >
                    <div className="h-[2px] w-8 bg-blue-400/80 rounded" />
                  </div>
                  <div
                    onMouseDown={(e) => startRowResizeTop(e, 'forca')}
                    className="absolute left-0 right-0 top-0 h-2.5 cursor-row-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Clique e arraste para alterar a altura (Cima)"
                  >
                    <div className="h-[2px] w-8 bg-blue-400/80 rounded" />
                  </div>
                </div>
              </div>
            );
          }
          if (cardId === 'mapa') {
            if (hiddenCards.includes('mapa')) return null;
            return (
              <div
                key="mapa"
                data-card-id="mapa"
                onDragOver={(e) => handleDragOver(e, 'mapa')}
                onDrop={(e) => handleDrop(e, 'mapa')}
                onDragLeave={() => setDragOverTargetId(null)}
                style={{
                  order: cardOrder.indexOf('mapa'),
                  height: cardHeights['mapa'] ? `${cardHeights['mapa']}px` : undefined
                }}
                className={`w-full min-w-0 max-w-full relative group space-y-1 transition-all duration-300 ${draggedId === 'mapa' ? 'opacity-40' : ''} ${dragOverTargetId === 'mapa' ? 'ring-2 ring-blue-500/80 rounded-lg scale-[1.01]' : ''}`}
              >
                <div className="glass rounded-lg border border-slate-800 flex flex-col h-full justify-start gap-1.5 overflow-hidden relative">
                  <div>
                    <div 
                      className="text-xs font-bold text-purple-400 uppercase px-3 py-2 select-none cursor-grab active:cursor-grabbing bg-slate-900/10 hover:bg-slate-850/40 flex justify-between items-center"
                      draggable
                      onDragStart={(e) => handleDragStart(e, 'mapa')}
                      onDragEnd={handleDragEnd}
                      onTouchStart={(e) => handleTouchStart(e, 'mapa')}
                      onTouchEnd={handleTouchEnd}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 text-[11px] cursor-grab">⋮⋮</span>
                        <span>🗺️ Mapa de Níveis & Viés</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleCardVisibility('mapa'); }}
                        className="text-slate-500 hover:text-red-400 text-xs px-1 rounded transition-colors cursor-pointer"
                        title="Ocultar este card"
                      >
                        ✕
                      </button>
                    </div>
                    
                    <div className="px-3 pt-1">
                      {/* Painel do Viés Gamma */}
                      <div className="mb-2">
                        {renderGammaBias()}
                      </div>

                      {/* Mapa de Níveis - Linhas Verticais */}
                      <div className="mapa-track h-8 relative rounded overflow-hidden border border-slate-800 bg-slate-900 mb-1 flex items-center justify-center">
                        {renderLevelsMap()}
                      </div>
                    </div>
                  </div>

                  {/* Grid dos Cards de Níveis toggles */}
                  <div className="space-y-1 px-3 pb-3 pt-1 text-[9px] select-none">
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { key: 'hvl', label: 'HVL', color: 'card-hvl' },
                        { key: 'call', label: 'Call', color: 'card-call' },
                        { key: 'put', label: 'Put', color: 'card-put' },
                        { key: 'max1d', label: '1D Max', color: 'card-max' }
                      ].map(cfg => (
                        <button
                          key={cfg.key}
                          onClick={() => toggleLevelVisibility(cfg.key)}
                          className={`card-nivel ${cfg.color} text-center py-1 rounded transition ${disabledLevels.includes(cfg.key) ? 'nivel-off opacity-30 grayscale' : ''} hover:scale-[1.02] active:scale-[0.98]`}
                        >
                          <div className="font-bold text-[8px] truncate">{cfg.label}</div>
                          <div className="font-mono text-white text-[8px] truncate">
                            {gammaLevels ? (gammaLevels as any)[cfg.key] !== undefined ? String((gammaLevels as any)[cfg.key]) : '--' : '--'}
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { key: 'min1d', label: '1D Min', color: 'card-min' },
                        { key: 'prev', label: 'Ajuste', color: 'card-ajuste' },
                        { key: 'prevH', label: 'Máx Ant', color: 'card-prevH' },
                        { key: 'prevL', label: 'Mín Ant', color: 'card-prevL' }
                      ].map(cfg => (
                        <button
                          key={cfg.key}
                          onClick={() => toggleLevelVisibility(cfg.key)}
                          className={`card-nivel ${cfg.color} text-center py-1 rounded transition ${disabledLevels.includes(cfg.key) ? 'nivel-off opacity-30 grayscale' : ''} hover:scale-[1.02] active:scale-[0.98]`}
                        >
                          <div className="font-bold text-[8px] truncate">{cfg.label}</div>
                          <div className="font-mono text-white text-[8px] truncate">
                            {gammaLevels ? (gammaLevels as any)[cfg.key] !== undefined ? String((gammaLevels as any)[cfg.key]) : '--' : '--'}
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { key: 'hvl0', label: 'HVL 0DTE', color: 'card-hvl0' },
                        { key: 'call0', label: 'Call 0DTE', color: 'card-call0' },
                        { key: 'put0', label: 'Put 0DTE', color: 'card-put0' },
                        { key: 'gwall', label: 'GWall 0DTE', color: 'card-gwall' }
                      ].map(cfg => (
                        <button
                          key={cfg.key}
                          onClick={() => toggleLevelVisibility(cfg.key)}
                          className={`card-nivel ${cfg.color} text-center py-1 rounded transition ${disabledLevels.includes(cfg.key) ? 'nivel-off opacity-30 grayscale' : ''} hover:scale-[1.02] active:scale-[0.98]`}
                        >
                          <div className="font-bold text-[8px] truncate">{cfg.label}</div>
                          <div className="font-mono text-white text-[8px] truncate">
                            {gammaLevels ? (gammaLevels as any)[cfg.key] !== undefined ? String((gammaLevels as any)[cfg.key]) : '--' : '--'}
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { key: 'gex_count', label: 'GEX Count', color: 'card-gex' },
                        { key: 'bl_count', label: 'BL Count', color: 'card-bl' }
                      ].map(cfg => (
                        <button
                          key={cfg.key}
                          onClick={() => toggleLevelVisibility(cfg.key)}
                          className={`card-nivel ${cfg.color} text-center py-1 rounded transition ${disabledLevels.includes(cfg.key) ? 'nivel-off opacity-30 grayscale' : ''} hover:scale-[1.02] active:scale-[0.98]`}
                        >
                          <div className="font-bold text-[8px] truncate">{cfg.label}</div>
                          <div className="font-mono text-white text-[8px] truncate">
                            {gammaLevels ? (gammaLevels as any)[cfg.key] !== undefined ? String((gammaLevels as any)[cfg.key]) : '--' : '--'}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Resize Handles - 4 Directions */}
                  <div
                    onMouseDown={(e) => startColResize(e, 'mapa')}
                    className="absolute top-0 bottom-0 right-0 w-2.5 cursor-col-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Clique e arraste para alterar a largura (Direita)"
                  >
                    <div className="w-[2px] h-8 bg-blue-400/80 rounded" />
                  </div>
                  <div
                    onMouseDown={(e) => startColResizeLeft(e, 'mapa')}
                    className="absolute top-0 bottom-0 left-0 w-2.5 cursor-col-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Clique e arraste para alterar a largura (Esquerda)"
                  >
                    <div className="w-[2px] h-8 bg-blue-400/80 rounded" />
                  </div>
                  <div
                    onMouseDown={(e) => startRowResize(e, 'mapa')}
                    className="absolute left-0 right-0 bottom-0 h-2.5 cursor-row-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Clique e arraste para alterar a altura (Baixo)"
                  >
                    <div className="h-[2px] w-8 bg-blue-400/80 rounded" />
                  </div>
                  <div
                    onMouseDown={(e) => startRowResizeTop(e, 'mapa')}
                    className="absolute left-0 right-0 top-0 h-2.5 cursor-row-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Clique e arraste para alterar a altura (Cima)"
                  >
                    <div className="h-[2px] w-8 bg-blue-400/80 rounded" />
                  </div>
                </div>
              </div>
            );
          }

          if (cardId === 'ia_delta') {
            if (hiddenCards.includes('ia_delta')) return null;
            const isAiConfigured = (() => {
              if (!settings) return false;
              const provider = settings.ai_provider;
              if (!provider) return false;
              
              if (provider === 'groq') {
                return !!settings.groq_api_key && !!settings.groq_model;
              }
              if (provider === 'gemini') {
                return !!settings.gemini_api_key && !!settings.gemini_model;
              }
              if (provider === 'openai') {
                return !!settings.openai_api_key && !!settings.openai_model;
              }
              return false;
            })();

            return (
              <div
                key="ia_delta"
                data-card-id="ia_delta"
                onDragOver={(e) => handleDragOver(e, 'ia_delta')}
                onDrop={(e) => handleDrop(e, 'ia_delta')}
                onDragLeave={() => setDragOverTargetId(null)}
                style={{
                  order: cardOrder.indexOf('ia_delta'),
                  height: cardHeights['ia_delta'] ? `${cardHeights['ia_delta']}px` : undefined
                }}
                className={`w-full min-w-0 max-w-full relative group flex flex-col gap-1.5 transition-all duration-300 ${draggedId === 'ia_delta' ? 'opacity-40' : ''} ${dragOverTargetId === 'ia_delta' ? 'ring-2 ring-blue-500/80 rounded-lg scale-[1.01]' : ''}`}
              >
                {/* Card Decisão IA */}
                <div className={`relative flex-1 glass rounded-lg border-2 ${isSignalActive ? getSignalBorderClass(effectiveAiResult.sinal) : !aiEnabled ? 'border-yellow-500/40' : (aiEnabled && !isAiConfigured) ? 'border-red-500/40' : effectiveAiResult ? getSignalBorderClass(effectiveAiResult.sinal) : 'border-slate-800'} flex flex-col justify-start gap-1 h-[96px] overflow-hidden`}>
                  {/* Overlay de IA Desativada */}
                  {!aiEnabled && !isSignalActive && (
                    <div className="absolute inset-0 bg-slate-950/85 border border-yellow-500/40 rounded-lg flex flex-col items-center justify-center z-20">
                      <span className="text-yellow-500 text-xl mb-0.5">⚠️</span>
                      <span className="text-yellow-500 font-black text-xs tracking-wider uppercase">IA DESATIVADA</span>
                      <span className="text-slate-400 text-[8px] mt-0.5 px-4 text-center">Ative o ciclo nas configurações ou no menu lateral</span>
                    </div>
                  )}

                  {/* Overlay de IA Não Configurada */}
                  {aiEnabled && !isAiConfigured && !isSignalActive && (
                    <div className="absolute inset-0 bg-slate-950/85 border border-red-500/40 rounded-lg flex flex-col items-center justify-center z-20">
                      <span className="text-red-500 text-xl mb-0.5">⚠️</span>
                      <span className="text-red-500 font-black text-xs tracking-wider uppercase">IA NÃO CONFIGURADA</span>
                      <span className="text-slate-400 text-[8px] mt-0.5 px-4 text-center">Configure sua API Key e selecione o modelo nas Configurações Gerais.</span>
                    </div>
                  )}

                  <div 
                    className="fluid-text-title text-slate-400 px-2.5 py-1.5 select-none cursor-grab active:cursor-grabbing bg-slate-900/10 hover:bg-slate-850/40 flex justify-between items-center"
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'ia_delta')}
                    onDragEnd={handleDragEnd}
                    onTouchStart={(e) => handleTouchStart(e, 'ia_delta')}
                    onTouchEnd={handleTouchEnd}
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500 text-[10px] cursor-grab">⋮⋮</span>
                      <span>Decisão Inteligência Artificial</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsCopilotModalOpen(true);
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase transition cursor-pointer border flex items-center gap-1 shadow-sm ${
                          aiEnabled
                            ? 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400 animate-pulse'
                            : 'bg-purple-950/60 hover:bg-purple-900 text-purple-300 border-purple-800'
                        }`}
                        title="Abrir Central do COPILOT IA"
                      >
                        <span>🤖 COPILOT</span>
                        <span className={`w-1.5 h-1.5 rounded-full ${aiEnabled ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleCardVisibility('ia_delta'); }}
                        className="text-slate-500 hover:text-red-400 text-xs px-1 rounded transition-colors cursor-pointer"
                        title="Ocultar este card"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="px-2.5 pb-2 pt-0.5 text-center flex-1 flex flex-col justify-center gap-0.5">
                    {(() => {
                      const sig = isSignalActive ? effectiveAiResult.sinal : effectiveAiResult?.sinal;
                      const isBuy = sig === 'COMPRA';
                      const isSell = sig === 'VENDA';
                      const glowClass = isBuy 
                        ? 'drop-shadow-[0_0_8px_rgba(34,197,94,0.7)]' 
                        : isSell 
                          ? 'drop-shadow-[0_0_8px_rgba(239,68,68,0.7)]' 
                          : '';

                      return (
                        <div className={`fluid-text-value font-black tracking-widest uppercase leading-none py-0.5 ${glowClass} ${isSignalActive ? getSignalColorClass(effectiveAiResult.sinal) : !aiEnabled ? 'text-slate-600' : (aiEnabled && !isAiConfigured) ? 'text-red-500/40' : isAnalyzing ? 'text-blue-400' : effectiveAiResult ? getSignalColorClass(effectiveAiResult.sinal) : 'text-slate-500'}`}>
                          {isSignalActive ? effectiveAiResult.sinal : !aiEnabled ? 'DESATIVADA' : (aiEnabled && !isAiConfigured) ? 'NÃO CONFIGURADA' : isAnalyzing ? 'PROCESSANDO...' : effectiveAiResult ? effectiveAiResult.sinal : 'AGUARDANDO'}
                        </div>
                      );
                    })()}

                    {!isSignalActive && (
                      <>
                        <div className="fluid-text-title text-slate-400">
                          Confiança: <span className="text-white font-bold">{effectiveAiResult?.confianca || '--'}</span>
                        </div>
                        {!isRestrictedSession ? (
                          <button
                            onClick={runManualAIAnalysis}
                            disabled={isAnalyzing || !aiEnabled || !isAiConfigured}
                            className="mt-1 px-2 py-0.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded fluid-text-title font-bold w-full transition"
                          >
                            {isAnalyzing ? 'Executando...' : '🔍 Analisar Agora'}
                          </button>
                        ) : (
                          <div className="mt-1.5 p-1 rounded text-center text-[9px] font-bold bg-slate-900/60 text-slate-500 border border-slate-800 uppercase">
                            🔒 Análise Manual Bloqueada
                          </div>
                        )}
                      </>
                    )}

                    {isSignalActive && (
                      <>
                        <div className="grid grid-cols-2 gap-1.5 mt-0.5">
                          <div className="bg-green-950/20 border border-green-500/30 px-2 py-0.5 rounded flex justify-center items-center gap-1 shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)]">
                            <span className="text-green-500 font-extrabold text-[15px]">🎯 ALVO:</span>
                            <span className="text-green-400 font-mono font-black text-[15px] leading-none drop-shadow-[0_0_4px_rgba(34,197,94,0.3)]">{effectiveAiResult?.alvo || '--'}</span>
                          </div>
                          <div className="bg-red-950/20 border border-red-500/30 px-2 py-0.5 rounded flex justify-center items-center gap-1 shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)]">
                            <span className="text-red-500 font-extrabold text-[15px]">🛑 STOP:</span>
                            <span className="text-red-400 font-mono font-black text-[15px] leading-none drop-shadow-[0_0_4px_rgba(239,68,68,0.3)]">{effectiveAiResult?.stop || '--'}</span>
                          </div>
                        </div>

                        {/* Operações Abertas (Todos os Ativos) */}
                        {reports.filter(r => r.status === 'Em Andamento').length > 0 && (
                          <div className="mt-1 pt-1 border-t border-slate-800/60 text-left flex items-center justify-between">
                            <span className="text-[8px] uppercase font-bold text-slate-500">💼 Ativas:</span>
                            <div className="flex gap-1">
                                {reports.filter(r => r.status === 'Em Andamento').slice(0, 2).map((r) => {
                                  const match = r.description?.match(/\[(.*?)\]/);
                                  const panelName = match ? match[1] : '';
                                  const isBuy = r.side === 'COMPRA';
                                  const cleanPanelName = panelName.toLowerCase().replace(/[^a-z0-9]/g, '');
                                  const badge = cleanPanelName === 'nasdaq' ? 'NQ' : cleanPanelName === 'sp500' ? 'ES' : cleanPanelName === 'gold' ? 'GC' : panelName || '⚡';
                                  return (
                                    <div 
                                      key={r.id}
                                      onClick={() => {
                                        if (panelName) {
                                          const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
                                          const target = panels.find(p => normalize(p.name) === normalize(panelName));
                                          if (target) switchPanel(target.id);
                                        }
                                      }}
                                      className={`px-1 py-0.2 rounded text-[8px] font-bold cursor-pointer transition hover:scale-105 ${
                                        isBuy ? 'bg-green-950/60 text-green-400 border border-green-900/30' : 'bg-red-950/60 text-red-400 border border-red-900/30'
                                      }`}
                                      title={`Ativo: ${panelName}`}
                                    >
                                      {badge} | {isBuy ? 'C' : 'V'}
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Delta Gauge */}
                <div className="glass rounded-lg border border-slate-800 flex flex-col justify-start gap-1 overflow-hidden">
                  <div 
                    className="delta-gauge-labels text-[9px] flex justify-between font-bold text-slate-400 px-3 pt-2.5 pb-1 select-none cursor-grab active:cursor-grabbing bg-slate-900/10"
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'ia_delta')}
                    onDragOver={(e) => handleDragOver(e, 'ia_delta')}
                    onDragEnd={handleDragEnd}
                    onTouchStart={(e) => handleTouchStart(e, 'ia_delta')}
                    onTouchEnd={handleTouchEnd}
                  >
                    <span>Medidor de Delta</span>
                  </div>

                  <div className="px-3 pb-3 pt-1">
                    <div className="delta-gauge-wrap !border-t-0 !pt-0 !mt-0">
                      <div className="delta-gauge-labels text-[9px] flex justify-between font-bold text-slate-400 mb-1">
                        <span className="text-red-400 font-bold">VENDA</span>
                        <span>DELTA</span>
                        <span className="text-green-400 font-bold">COMPRA</span>
                      </div>
                      <div className="delta-gauge-bar h-2.5 rounded-full relative overflow-visible shadow-inner">
                        <div
                          className="delta-gauge-marker absolute -top-0.5 -bottom-0.5 w-1.5 bg-white shadow-lg rounded-sm transition-all duration-350"
                          style={{ left: `calc(${getDeltaLeft()}% - 3px)` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-[9px] font-mono mt-2">
                        <span>
                          Δ: <strong className={Number(marketData?.delta || 0) > 0 ? 'text-emerald-400 font-black' : Number(marketData?.delta || 0) < 0 ? 'text-rose-400 font-black' : 'text-slate-300'}>
                            {Number(marketData?.delta || 0) > 0 ? `+${marketData?.delta}` : (marketData?.delta || 0)}
                          </strong>
                        </span>
                        <span>
                          Ratio: <strong className={Number(marketData?.deltaRatio || 1) > 1.05 ? 'text-emerald-400 font-black' : Number(marketData?.deltaRatio || 1) < 0.95 ? 'text-rose-400 font-black' : 'text-slate-300'}>
                            {Number(marketData?.deltaRatio || 1).toFixed(2)}
                          </strong>
                        </span>
                        <span>
                          P/s: <strong className="text-slate-300">{Number(marketData?.printsPerSecond || 0).toFixed(1)}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-1 mt-2.5 justify-center">
                      <button onClick={() => setWindowMinutes(Infinity)} className={`window-btn text-[9px] px-2 py-0.5 ${windowMinutes === Infinity ? 'active' : ''}`}>Acumulado</button>
                      <button onClick={() => setWindowMinutes(1)} className={`window-btn text-[9px] px-2 py-0.5 ${windowMinutes === 1 ? 'active' : ''}`}>1m</button>
                      <button onClick={() => setWindowMinutes(5)} className={`window-btn text-[9px] px-2 py-0.5 ${windowMinutes === 5 ? 'active' : ''}`}>5m</button>
                      <button onClick={() => setWindowMinutes(15)} className={`window-btn text-[9px] px-2 py-0.5 ${windowMinutes === 15 ? 'active' : ''}`}>15m</button>
                    </div>
                    <div className="text-[8px] text-center text-slate-500 mt-1">
                      Janela ativa: <span className="text-blue-400 font-bold">{windowMinutes === Infinity ? 'Acumulado' : `${windowMinutes}min`}{getWindowTimeRemaining()}</span>
                    </div>
                  </div>
                </div>

                {/* Resize Handles */}
                <div
                  onMouseDown={(e) => startColResize(e, 'ia_delta')}
                  className="absolute top-0 bottom-0 right-0 w-2.5 cursor-col-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Clique e arraste com o botão esquerdo para alterar a largura do card"
                >
                  <div className="w-[2px] h-8 bg-blue-400/80 rounded" />
                </div>
                <div
                  onMouseDown={(e) => startRowResize(e, 'ia_delta')}
                  className="absolute left-0 right-0 bottom-0 h-2.5 cursor-row-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Clique e arraste com o botão esquerdo para alterar a altura do card"
                >
                  <div className="h-[2px] w-8 bg-blue-400/80 rounded" />
                </div>
              </div>
            );
          }

          if (cardId === 'grafico') {
            if (hiddenCards.includes('grafico')) return null;
            const defaultGraficoHeight = Math.max(300, availableHeight - 15);
            return (
              <div
                key="grafico"
                data-card-id="grafico"
                onDragOver={(e) => handleDragOver(e, 'grafico')}
                onDrop={(e) => handleDrop(e, 'grafico')}
                onDragLeave={() => setDragOverTargetId(null)}
                style={{
                  order: cardOrder.indexOf('grafico'),
                  height: `${cardHeights['grafico'] || defaultGraficoHeight}px`
                }}
                className={`w-full min-w-0 max-w-full relative group transition-all duration-300 ${draggedId === 'grafico' ? 'opacity-40' : ''} ${dragOverTargetId === 'grafico' ? 'ring-2 ring-blue-500/80 rounded-lg scale-[1.01]' : ''}`}
              >
                <div
                  style={{ height: cardHeights['grafico'] ? `${cardHeights['grafico']}px` : undefined }}
                  className="glass rounded-lg border border-slate-800 flex flex-col h-full min-h-[250px] overflow-hidden"
                >
                  <div 
                    className="flex justify-between items-center px-2.5 py-1.5 select-none cursor-grab active:cursor-grabbing bg-[#0f131c] border-b border-slate-800/80"
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'grafico')}
                    onDragEnd={handleDragEnd}
                    onTouchStart={(e) => handleTouchStart(e, 'grafico')}
                    onTouchEnd={handleTouchEnd}
                  >
                    {/* Left Group: Asset List Box, Timeframe, Quick Action Pills (IA, R, C, S, F, 🖥️) */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Asset / Panel List Box Dropdown */}
                      <div className="flex items-center gap-0.5 bg-[#121622] hover:bg-[#181e2b] border border-slate-700/80 rounded px-1 py-0.5 text-[10px] font-black text-white tracking-wider uppercase transition-colors shrink-0 shadow-sm">
                        <span className="text-slate-500 text-[10px] cursor-grab">⋮⋮</span>
                        <select
                          value={activePanel?.id || ''}
                          onChange={(e) => {
                            e.stopPropagation();
                            if (e.target.value && switchPanel) {
                              switchPanel(e.target.value);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="bg-transparent text-white font-black text-[10px] uppercase focus:outline-none cursor-pointer appearance-none pr-3"
                          title="Selecionar Ativo / Painel"
                        >
                          {panels && panels.length > 0 ? (
                            panels.map((p: any) => {
                              const cleanName = p.name ? p.name.replace(/\s*\([^)]*\)/g, '').trim() : 'Painel';
                              return (
                                <option key={p.id} value={p.id} className="bg-slate-900 text-white font-bold">
                                  {cleanName.toUpperCase()}
                                </option>
                              );
                            })
                          ) : (
                            <option value={activePanel?.id || 'main'} className="bg-slate-900 text-white font-bold">
                              {(activePanel?.name || 'NQ').toUpperCase()}
                            </option>
                          )}
                        </select>
                        <span className="text-slate-400 text-[8px] pointer-events-none -ml-2.5">▼</span>
                      </div>

                      {/* Timeframe Badge */}
                      <div className="flex items-center bg-blue-600 text-white rounded px-1 py-0.5 text-[9px] font-extrabold shadow-sm shrink-0">
                        <select
                          value={timeframe}
                          onChange={(e) => {
                            e.stopPropagation();
                            setTimeframe(Number(e.target.value));
                          }}
                          className="bg-transparent text-white font-extrabold text-[9px] focus:outline-none cursor-pointer appearance-none text-center"
                          title="Timeframe do Gráfico"
                        >
                          <option value={1} className="bg-slate-900 text-slate-100">1M</option>
                          <option value={2} className="bg-slate-900 text-slate-100">2M</option>
                          <option value={3} className="bg-slate-900 text-slate-100">3M</option>
                          <option value={5} className="bg-slate-900 text-slate-100">5M</option>
                          <option value={10} className="bg-slate-900 text-slate-100">10M</option>
                          <option value={15} className="bg-slate-900 text-slate-100">15M</option>
                          <option value={30} className="bg-slate-900 text-slate-100">30M</option>
                          <option value={60} className="bg-slate-900 text-slate-100">1H</option>
                          <option value={240} className="bg-slate-900 text-slate-100">4H</option>
                          <option value={1440} className="bg-slate-900 text-slate-100">1D</option>
                        </select>
                      </div>

                      {/* Quick Action Pills */}
                      <div className="flex items-center gap-0.5 shrink-0">
                        {/* IA */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextVal = !settings?.chart_manual_ia_validate;
                            saveSettings({ chart_manual_ia_validate: nextVal });
                            if (nextVal) {
                              alert("🤖 Validação Inteligente Ativada!\nAs operações manuais abertas a partir de agora só serão executadas se a IA confirmar a confluência técnica no template ativo.");
                            }
                          }}
                          className={`px-1 py-0.5 rounded text-[8.5px] font-black transition active:scale-95 cursor-pointer border shadow-sm min-w-[16px] text-center ${
                            settings?.chart_manual_ia_validate
                              ? 'border-emerald-500 bg-emerald-600 text-white'
                              : 'border-red-500 bg-red-600 text-white'
                          }`}
                          title={settings?.chart_manual_ia_validate ? 'Validar entrada com IA (Ativo)' : 'Validar entrada com IA (Inativo)'}
                        >
                          IA
                        </button>

                        {/* R */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setResetViewTrigger(prev => prev + 1);
                          }}
                          className="px-1 py-0.5 rounded border border-slate-700 bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white transition active:scale-95 cursor-pointer font-black text-[8.5px] shadow-sm min-w-[16px] text-center"
                          title="Reenquadrar o gráfico (Reset View) [Ctrl+R]"
                        >
                          R
                        </button>

                        {/* C */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAutoCenter(prev => !prev);
                          }}
                          className={`px-1 py-0.5 rounded border font-black transition active:scale-95 cursor-pointer text-[8.5px] shadow-sm min-w-[16px] text-center ${
                            autoCenter
                              ? 'border-yellow-500 bg-yellow-950/60 text-yellow-400'
                              : 'border-slate-700 bg-slate-850 text-slate-300 hover:bg-slate-800 hover:text-white'
                          }`}
                          title={autoCenter ? 'Desativar Auto-Center [Ctrl+C]' : 'Centralizar preço atual no meio do gráfico (Auto-Center) [Ctrl+C]'}
                        >
                          C
                        </button>

                        {/* S */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowTradeMarkers(prev => !prev);
                          }}
                          className={`px-1 py-0.5 rounded border font-black transition active:scale-95 cursor-pointer text-[8.5px] shadow-sm min-w-[16px] text-center ${
                            showTradeMarkers
                              ? 'border-blue-500 bg-blue-600 text-white'
                              : 'border-red-500 bg-red-600 text-white'
                          }`}
                          title={showTradeMarkers ? 'Ocultar setas e legendas de posições [Ctrl+S]' : 'Mostrar setas e legendas de posições [Ctrl+S]'}
                        >
                          S
                        </button>

                        {/* F */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setFitChartTrigger(prev => prev + 1);
                          }}
                          className="border border-amber-500/60 bg-slate-900 hover:bg-slate-800 font-mono font-black text-[8.5px] text-amber-400 px-1 py-0.5 rounded transition active:scale-95 shadow-sm min-w-[16px] text-center flex items-center justify-center cursor-pointer"
                          title="Alinhar Gráfico e Escala (NinjaTrader 8 - Botão F) [Ctrl+F]"
                        >
                          F
                        </button>

                        {/* 🖥️ (Toggle Tela / Candles) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextMode = settings?.source_screen === 'candles' ? 'screenshot' : 'candles';
                            saveSettings({ source_screen: nextMode });
                          }}
                          className={`p-0.5 rounded border transition cursor-pointer text-[9px] shadow-sm ${
                            settings?.source_screen === 'candles'
                              ? 'border-slate-700 bg-slate-850 text-slate-300 hover:bg-slate-800 hover:text-white'
                              : 'border-blue-500 bg-blue-600 text-white'
                          }`}
                          title={settings?.source_screen === 'candles' ? 'Mudar para Captura de Tela' : 'Mudar para Gráfico de Candles'}
                        >
                          🖥️
                        </button>
                      </div>
                    </div>

                    {/* Right Group: Indicators pill + Zoom + Close */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Botão Indicadores */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setIsIndicatorsModalOpen(true); }}
                        className="bg-[#182236] hover:bg-blue-900/40 border border-blue-500/40 text-blue-300 px-1.5 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-0.5 transition-all cursor-pointer shadow-sm active:scale-95"
                        title="Gerenciar Indicadores Técnicos do Gráfico"
                      >
                        <span>📊 Ind.</span>
                        <span className="bg-blue-600 text-white px-1 py-0.2 rounded-full text-[8.5px] font-extrabold">
                          {visibleIndicators.length}
                        </span>
                      </button>

                      {/* Botão ZOOM */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setIsZoomed(true); }}
                        className="p-0.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 text-[10px] flex items-center justify-center transition-all cursor-pointer shadow-sm"
                        title="Abrir o gráfico em tela cheia (Zoom)"
                      >
                        🔍
                      </button>

                      {/* Botão Fechar Card */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleCardVisibility('grafico'); }}
                        className="text-slate-500 hover:text-red-400 text-[11px] p-0.5 rounded transition-colors cursor-pointer"
                        title="Ocultar este card"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="px-3 pb-3 pt-1 flex-1 flex flex-col">
                    <div className="bg-slate-900 rounded-lg overflow-hidden flex-1 flex flex-col border border-slate-800/80 relative">
                      {settings?.source_screen === 'candles' ? (
                        !isZoomed ? (
                          <CandleChart
                            candles={candles}
                            instanceId={settings?.instance_id_screen || activePanel?.instance_id}
                            timeframe={timeframe}
                            setTimeframe={setTimeframe}
                            activeIndicators={visibleIndicators}
                            gammaLevels={gammaLevels}
                            showIndicatorsLegend={false}
                            onOpenIndicatorsManager={() => setIsIndicatorsModalOpen(true)}
                            autoCenter={autoCenter}
                            setAutoCenter={setAutoCenter}
                            showTradeMarkers={showTradeMarkers}
                            setShowTradeMarkers={setShowTradeMarkers}
                            showRobots={showRobots}
                            setShowRobots={setShowRobots}
                            fitChartTrigger={fitChartTrigger}
                            resetViewTrigger={resetViewTrigger}
                            hideManualTradeBar={false}
                          />
                        ) : (
                          <div className="flex-1 flex items-center justify-center text-slate-700 text-xs font-mono select-none">
                            Gráfico aberto no modo Zoom
                          </div>
                        )
                      ) : screenshot ? (
                        <div className="flex-1 flex items-center justify-center">
                          <img
                            src={`data:image/png;base64,${screenshot}`}
                            alt="Gráfico de Mercado"
                            className="max-h-full max-w-full object-contain hover:scale-[1.02] transition"
                          />
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center">
                          <span className="text-slate-600 text-xs font-mono">Nenhuma captura disponível no Supabase</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Resize Handles - 4 Directions */}
                  <div
                    onMouseDown={(e) => startColResize(e, 'grafico')}
                    className="absolute top-0 bottom-0 right-0 w-2.5 cursor-col-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Clique e arraste para alterar a largura (Direita)"
                  >
                    <div className="w-[2px] h-8 bg-blue-400/80 rounded" />
                  </div>
                  <div
                    onMouseDown={(e) => startColResizeLeft(e, 'grafico')}
                    className="absolute top-0 bottom-0 left-0 w-2.5 cursor-col-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Clique e arraste para alterar a largura (Esquerda)"
                  >
                    <div className="w-[2px] h-8 bg-blue-400/80 rounded" />
                  </div>
                  <div
                    onMouseDown={(e) => startRowResize(e, 'grafico')}
                    className="absolute left-0 right-0 bottom-0 h-2.5 cursor-row-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Clique e arraste para alterar a altura (Baixo)"
                  >
                    <div className="h-[2px] w-8 bg-blue-400/80 rounded" />
                  </div>
                  <div
                    onMouseDown={(e) => startRowResizeTop(e, 'grafico')}
                    className="absolute left-0 right-0 top-0 h-2.5 cursor-row-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Clique e arraste para alterar a altura (Cima)"
                  >
                    <div className="h-[2px] w-8 bg-blue-400/80 rounded" />
                  </div>
                </div>
              </div>
            );
          }

          if (cardId === 'blocktrades') {
            if (hiddenCards.includes('blocktrades')) return null;
            return (
              <div
                key="blocktrades"
                data-card-id="blocktrades"
                onDragOver={(e) => handleDragOver(e, 'blocktrades')}
                onDrop={(e) => handleDrop(e, 'blocktrades')}
                onDragLeave={() => setDragOverTargetId(null)}
                style={{
                  order: cardOrder.indexOf('blocktrades'),
                  height: cardHeights['blocktrades'] ? `${cardHeights['blocktrades']}px` : undefined
                }}
                className={`w-full min-w-0 max-w-full relative group transition-all duration-300 ${draggedId === 'blocktrades' ? 'opacity-40' : ''} ${dragOverTargetId === 'blocktrades' ? 'ring-2 ring-blue-500/80 rounded-lg scale-[1.01]' : ''}`}
              >
                <div 
                  style={{ height: cardHeights['blocktrades'] ? `${cardHeights['blocktrades']}px` : undefined }}
                  className="glass rounded-lg border border-slate-800 h-full min-h-[250px] flex flex-col justify-between overflow-hidden relative"
                >
                  <div 
                    className="text-xs font-bold text-orange-400 uppercase px-3 py-2 select-none cursor-grab active:cursor-grabbing bg-slate-900/10 hover:bg-slate-850/40 flex justify-between items-center"
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'blocktrades')}
                    onDragEnd={handleDragEnd}
                    onTouchStart={(e) => handleTouchStart(e, 'blocktrades')}
                    onTouchEnd={handleTouchEnd}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 text-[11px] cursor-grab">⋮⋮</span>
                      <span>🐋 Block Trades</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCardVisibility('blocktrades'); }}
                      className="text-slate-500 hover:text-red-400 text-xs px-1 rounded transition-colors cursor-pointer"
                      title="Ocultar este card"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex-1 overflow-hidden no-scrollbar px-3 pb-3 pt-1 font-mono text-[10px] text-slate-400 space-y-1.5">
                    {!marketData?.blockTrades || marketData.blockTrades.length === 0 ? (
                      <div className="text-slate-500 text-center py-10">Sem ordens registradas...</div>
                    ) : (
                      [...marketData.blockTrades].reverse().map((trade, idx) => {
                        const isCompra = trade.side === 'COMPRA';
                        return (
                          <div 
                            key={idx} 
                            className={`p-1.5 rounded border border-l-2 text-[9px] flex justify-between items-center ${
                              isCompra 
                                ? 'bg-green-950/25 border-green-900/50 border-l-green-500 text-green-400' 
                                : 'bg-red-950/25 border-red-900/50 border-l-red-500 text-red-400'
                            }`}
                          >
                            <span className="font-bold">{trade.side}</span>
                            <span>{trade.volume} ct @ {trade.price}</span>
                            <span className="text-slate-500 text-[8px]">{trade.time}</span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Resize Handles - 4 Directions */}
                  <div
                    onMouseDown={(e) => startColResize(e, 'blocktrades')}
                    className="absolute top-0 bottom-0 right-0 w-2.5 cursor-col-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Clique e arraste para alterar a largura (Direita)"
                  >
                    <div className="w-[2px] h-8 bg-blue-400/80 rounded" />
                  </div>
                  <div
                    onMouseDown={(e) => startColResizeLeft(e, 'blocktrades')}
                    className="absolute top-0 bottom-0 left-0 w-2.5 cursor-col-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Clique e arraste para alterar a largura (Esquerda)"
                  >
                    <div className="w-[2px] h-8 bg-blue-400/80 rounded" />
                  </div>
                  <div
                    onMouseDown={(e) => startRowResize(e, 'blocktrades')}
                    className="absolute left-0 right-0 bottom-0 h-2.5 cursor-row-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Clique e arraste para alterar a altura (Baixo)"
                  >
                    <div className="h-[2px] w-8 bg-blue-400/80 rounded" />
                  </div>
                  <div
                    onMouseDown={(e) => startRowResizeTop(e, 'blocktrades')}
                    className="absolute left-0 right-0 top-0 h-2.5 cursor-row-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Clique e arraste para alterar a altura (Cima)"
                  >
                    <div className="h-[2px] w-8 bg-blue-400/80 rounded" />
                  </div>
                </div>
              </div>
            );
          }

          if (cardId === 'mensagens') {
            if (hiddenCards.includes('mensagens')) return null;
            return (
              <div
                key="mensagens"
                data-card-id="mensagens"
                onDragOver={(e) => handleDragOver(e, 'mensagens')}
                onDrop={(e) => handleDrop(e, 'mensagens')}
                onDragLeave={() => setDragOverTargetId(null)}
                style={{
                  order: cardOrder.indexOf('mensagens'),
                  height: cardHeights['mensagens'] ? `${cardHeights['mensagens']}px` : undefined
                }}
                className={`w-full min-w-0 max-w-full relative group transition-all duration-300 ${draggedId === 'mensagens' ? 'opacity-40' : ''} ${dragOverTargetId === 'mensagens' ? 'ring-2 ring-blue-500/80 rounded-lg scale-[1.01]' : ''}`}
              >
                <div 
                  style={{ height: cardHeights['mensagens'] ? `${cardHeights['mensagens']}px` : undefined }}
                  className="glass rounded-lg border border-slate-800 h-full min-h-[250px] flex flex-col overflow-hidden relative"
                >
                  <div 
                    className="flex justify-between items-center px-3 py-2 select-none cursor-grab active:cursor-grabbing bg-slate-900/10 hover:bg-slate-850/40"
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'mensagens')}
                    onDragEnd={handleDragEnd}
                    onTouchStart={(e) => handleTouchStart(e, 'mensagens')}
                    onTouchEnd={handleTouchEnd}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 text-[11px] cursor-grab">⋮⋮</span>
                      <span className="text-xs font-bold text-orange-400 uppercase">📜</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="flex gap-1.5">
                        <button
                          className={`log-tab-btn ${activeLogTab === 'noticias' ? 'active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); setActiveLogTab('noticias'); }}
                        >
                          NOTÍCIAS
                        </button>
                        <button
                          className={`log-tab-btn ${activeLogTab === 'mensagens' ? 'active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); setActiveLogTab('mensagens'); }}
                        >
                          SISTEMA
                        </button>
                        <button
                          className={`log-tab-btn ${activeLogTab === 'operacoes' ? 'active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); setActiveLogTab('operacoes'); }}
                        >
                          OPERAÇÕES {reports.filter(r => r.status === 'Em Andamento').length > 0 ? `(${reports.filter(r => r.status === 'Em Andamento').length})` : ''}
                        </button>
                        <button
                          className={`log-tab-btn ${activeLogTab === 'analises' ? 'active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); setActiveLogTab('analises'); }}
                        >
                          OMNI-ENGINE {generalAnalyses.length > 0 ? `(${generalAnalyses.length})` : ''}
                        </button>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleCardVisibility('mensagens'); }}
                        className="text-slate-500 hover:text-red-400 text-xs px-1 rounded transition-colors cursor-pointer ml-1"
                        title="Ocultar este card"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-hidden no-scrollbar px-3 pb-3 pt-1 text-[10px] text-slate-400">
                    {activeLogTab === 'operacoes' ? (
                      <div className="space-y-2 mt-1">
                        {reports.filter(r => r.status === 'Em Andamento').length === 0 ? (
                          <div className="text-slate-600 py-10 text-center font-mono">Nenhuma operação em andamento.</div>
                        ) : (
                          reports.filter(r => r.status === 'Em Andamento').map((r) => {
                            const match = r.description?.match(/\[(.*?)\]/);
                            const panelName = match ? match[1] : '';
                            const cleanDesc = r.description?.replace(/\[.*?\]/, '').trim();
                            const isBuy = r.side === 'COMPRA';
                            return (
                              <div key={r.id} className="p-2 rounded bg-slate-900/60 border border-slate-800 space-y-1 hover:border-slate-700/60 transition text-left">
                                <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] font-bold text-white font-mono bg-slate-800 px-1 py-0.5 rounded border border-slate-700">
                                      {panelName || 'Ativo'}
                                    </span>
                                    <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded ${isBuy ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                      {r.side}
                                    </span>
                                  </div>
                                  <span className="text-[9px] text-slate-500 font-mono font-bold">
                                    Preço: <span className="text-slate-300">{r.entry_price}</span>
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[9px] font-mono bg-slate-950/40 p-1 rounded border border-slate-900/50">
                                  <div className="text-slate-400">🎯 Alvo: <span className="text-green-400 font-bold">{r.take_profit || '--'}</span></div>
                                  <div className="text-slate-400">🛑 Stop: <span className="text-red-400 font-bold">{r.stop_loss || '--'}</span></div>
                                </div>
                                {cleanDesc && (
                                  <div className="text-[9px] text-slate-300 leading-relaxed bg-slate-900/30 p-1.5 rounded border border-slate-850 mt-1">
                                    <strong>Motivo:</strong> {cleanDesc}
                                  </div>
                                )}

                                <div className="flex justify-end mt-1.5 pt-1.5 border-t border-slate-850/50">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (settings?.chart_confirm_manual_trade === false || window.confirm(`Tem certeza de que deseja encerrar a operação de ${r.side} no ativo [${panelName || 'Ativo'}]?`)) {
                                        updateReportAction(r.id, 'Cancelado');
                                      }
                                    }}
                                    className="px-2 py-0.5 bg-yellow-950/50 hover:bg-yellow-900/60 text-yellow-400 font-bold rounded border border-yellow-900/30 transition text-[8px] uppercase cursor-pointer"
                                  >
                                    Encerrar Operação
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    ) : activeLogTab === 'analises' ? (
                      <div className="space-y-2 mt-1">
                        {generalAnalyses.length === 0 ? (
                          <div className="text-slate-600 py-10 text-center font-mono">Nenhuma análise Omni-Engine disponível.</div>
                        ) : (
                          generalAnalyses.map((a) => {
                            const isBuy = a.direction === 'COMPRAR' || a.direction === 'COMPRA';
                            const isSell = a.direction === 'VENDER' || a.direction === 'VENDA';
                            return (
                              <div key={a.id} className="p-2 rounded bg-slate-900/60 border border-slate-800 space-y-1 hover:border-slate-700/60 transition text-left font-mono">
                                <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] font-bold text-white bg-slate-850 px-1 py-0.5 rounded border border-slate-700">
                                      {a.instance_id.toUpperCase()}
                                    </span>
                                    <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded ${isBuy ? 'bg-green-500/10 text-green-400 border border-green-500/20' : isSell ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>
                                      {a.direction}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[8px] text-slate-500">
                                      {new Date(a.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (window.confirm('Deseja realmente excluir esta projeção?')) {
                                          deleteGeneralAnalysisAction(a.id);
                                        }
                                      }}
                                      className="text-slate-500 hover:text-red-400 transition font-sans text-[10px] cursor-pointer ml-1"
                                      title="Excluir projeção"
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                </div>
                                <div className="text-[9px] text-slate-300 bg-slate-950/40 p-1 rounded border border-slate-900/50 grid grid-cols-3 gap-1">
                                  <div>🚪 Gatilho: <span className="text-slate-200 font-bold">{a.entry_point || '--'}</span></div>
                                  <div>🎯 Alvo: <span className="text-green-400 font-bold">{a.take_profit || '--'}</span></div>
                                  <div>🛑 Stop: <span className="text-red-400 font-bold">{a.stop_loss || '--'}</span></div>
                                </div>
                                {a.market_analysis && (
                                  <div className="text-[8px] text-slate-400 leading-normal bg-slate-950/20 p-1 rounded border border-slate-900/30 mt-1 max-h-[60px] overflow-hidden no-scrollbar">
                                    <strong>Análise:</strong> {a.market_analysis}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    ) : activeLogTab === 'mensagens' ? (
                      <div className="space-y-2">
                        {/* Filtros rápidos de mensagens persistidos no banco */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-1.5 mb-1.5 border-b border-slate-800/80 text-[8px] font-mono select-none">
                          <span className="text-slate-500 font-bold">FILTRAR:</span>
                          
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings?.log_show_sistema !== false}
                              onChange={(e) => saveSettings({ log_show_sistema: e.target.checked })}
                              className="rounded bg-slate-955 border-slate-800 text-blue-500 focus:ring-blue-500 h-2.5 w-2.5"
                            />
                            <span className="text-blue-400/90 hover:text-blue-400">Sistema</span>
                          </label>

                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings?.log_show_alerta !== false}
                              onChange={(e) => saveSettings({ log_show_alerta: e.target.checked })}
                              className="rounded bg-slate-955 border-slate-800 text-yellow-500 focus:ring-yellow-500 h-2.5 w-2.5"
                            />
                            <span className="text-yellow-400 hover:text-yellow-400">Alertas</span>
                          </label>

                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings?.log_show_ia !== false}
                              onChange={(e) => saveSettings({ log_show_ia: e.target.checked })}
                              className="rounded bg-slate-955 border-slate-800 text-purple-500 focus:ring-purple-500 h-2.5 w-2.5"
                            />
                            <span className="text-purple-400/90 hover:text-purple-400">Sinais (IA)</span>
                          </label>

                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings?.log_show_erro !== false}
                              onChange={(e) => saveSettings({ log_show_erro: e.target.checked })}
                              className="rounded bg-slate-955 border-slate-800 text-red-500 focus:ring-red-500 h-2.5 w-2.5"
                            />
                            <span className="text-red-400/90 hover:text-red-400">Erros</span>
                          </label>

                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings?.log_show_noticia !== false}
                              onChange={(e) => saveSettings({ log_show_noticia: e.target.checked })}
                              className="rounded bg-slate-955 border-slate-800 text-emerald-500 focus:ring-emerald-500 h-2.5 w-2.5"
                            />
                            <span className="text-emerald-450 hover:text-emerald-450">Notícias</span>
                          </label>
                        </div>

                        <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                          {(() => {
                            const filteredLogs = systemLogs.filter(log => {
                              if (log.type === 'sistema' && settings?.log_show_sistema === false) return false;
                              if (log.type === 'alerta' && settings?.log_show_alerta === false) return false;
                              if (log.type === 'ia' && settings?.log_show_ia === false) return false;
                              if (log.type === 'erro' && settings?.log_show_erro === false) return false;
                              if (log.type === 'noticia' && settings?.log_show_noticia === false) return false;
                              return true;
                            }).slice(0, 10);

                            if (filteredLogs.length === 0) {
                              return <div className="text-slate-600 py-10 text-center">Nenhuma mensagem registrada com os filtros atuais.</div>;
                            }

                            return filteredLogs.map((log, idx) => {
                              let typeClass = 'text-slate-400';
                              if (log.type === 'alerta') typeClass = 'text-yellow-400 font-bold';
                              else if (log.type === 'erro') typeClass = 'text-red-400 font-bold animate-pulse';
                              else if (log.type === 'sistema') typeClass = 'text-blue-400';
                              
                              return (
                                <div key={idx} className="py-1 border-b border-slate-900/50 last:border-b-0 leading-relaxed font-mono">
                                  <span className="text-slate-500 text-[8px] mr-1">[{log.time}]</span>
                                  <span className={typeClass}>[{log.prefix}]</span> {log.content}
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[9px] text-slate-500 uppercase">Filtro de impacto:</span>
                          <div className="flex gap-1">
                            {['all', 'high', 'medium', 'low'].map((f) => (
                              <button
                                key={f}
                                onClick={(e) => { e.stopPropagation(); setNewsFilter(f as any); }}
                                className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                  newsFilter === f 
                                    ? 'bg-slate-700 text-white border border-slate-600' 
                                    : 'bg-slate-900 text-slate-400 border border-slate-800'
                                }`}
                              >
                                {f.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>

                        {filteredNews.length === 0 ? (
                          <div className="text-slate-600 py-10 text-center">Nenhuma notícia para o dia de hoje.</div>
                        ) : (
                          filteredNews.map((item) => {
                            let impactColor = 'bg-slate-700 text-slate-300';
                            if (item.impact === 'high') impactColor = 'bg-red-500/25 text-red-400 border border-red-900/50';
                            else if (item.impact === 'medium') impactColor = 'bg-yellow-500/25 text-yellow-400 border border-yellow-900/50';
                            else if (item.impact === 'low') impactColor = 'bg-green-500/25 text-green-400 border border-green-900/50';

                            return (
                              <div key={item.id} className="p-1.5 rounded border border-slate-850 bg-slate-900/20 flex gap-2 justify-between items-start leading-tight">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className={`px-1 py-0.2 rounded text-[7px] font-extrabold uppercase ${impactColor}`}>
                                      {item.impact}
                                    </span>
                                    <span className="font-bold text-slate-300 text-[8px]">{item.country}</span>
                                    <span className="text-slate-500 text-[7px]">{new Date(item.date).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  <div className="text-[9px] text-slate-300 font-semibold truncate" title={item.title.replace(/\\\//g, '/')}>
                                    {item.title.replace(/\\\//g, '/')}
                                  </div>
                                  {(item.forecast || item.previous) && (
                                    <div className="text-[8px] text-slate-400 mt-0.5 font-mono">
                                      Prev: <span className="text-slate-300 font-medium">{item.forecast || '--'}</span> | Ant: <span className="text-slate-300 font-medium">{item.previous || '--'}</span> {item.unit}
                                    </div>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  {renderNewsCountdown(item.date)}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                  {activeLogTab === 'mensagens' && systemLogs.length > 0 && (
                    <div className="px-3 py-1.5 bg-slate-950/40 border-t border-slate-900/60 flex justify-end">
                      <button
                        onClick={(e) => { e.stopPropagation(); clearLogs(); }}
                        className="text-[8px] font-bold text-slate-500 hover:text-red-400 uppercase tracking-wider transition-colors duration-150"
                      >
                        🗑️ Limpar Mensagens
                      </button>
                    </div>
                  )}
                  {activeLogTab === 'analises' && generalAnalyses.length > 0 && (
                    <div className="px-3 py-1.5 bg-slate-950/40 border-t border-slate-900/60 flex justify-end">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (window.confirm('Deseja realmente excluir TODAS as projeções?')) {
                            for (const a of generalAnalyses) {
                              await deleteGeneralAnalysisAction(a.id);
                            }
                          }
                        }}
                        className="text-[8px] font-bold text-slate-500 hover:text-red-400 uppercase tracking-wider transition-colors duration-150 cursor-pointer"
                      >
                        🗑️ Limpar Projeções
                      </button>
                    </div>
                  )}
                </div>

                {/* Resize Handles - 4 Directions */}
                <div
                  onMouseDown={(e) => startColResize(e, 'mensagens')}
                  className="absolute top-0 bottom-0 right-0 w-2.5 cursor-col-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Clique e arraste para alterar a largura (Direita)"
                >
                  <div className="w-[2px] h-8 bg-blue-400/80 rounded" />
                </div>
                <div
                  onMouseDown={(e) => startColResizeLeft(e, 'mensagens')}
                  className="absolute top-0 bottom-0 left-0 w-2.5 cursor-col-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Clique e arraste para alterar a largura (Esquerda)"
                >
                  <div className="w-[2px] h-8 bg-blue-400/80 rounded" />
                </div>
                <div
                  onMouseDown={(e) => startRowResize(e, 'mensagens')}
                  className="absolute left-0 right-0 bottom-0 h-2.5 cursor-row-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Clique e arraste para alterar a altura (Baixo)"
                >
                  <div className="h-[2px] w-8 bg-blue-400/80 rounded" />
                </div>
                <div
                  onMouseDown={(e) => startRowResizeTop(e, 'mensagens')}
                  className="absolute left-0 right-0 top-0 h-2.5 cursor-row-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Clique e arraste para alterar a altura (Cima)"
                >
                  <div className="h-[2px] w-8 bg-blue-400/80 rounded" />
                </div>
              </div>
            );
          }

          // GRIX CORE CARDS
          const grixCardConfigs = [
            { id: 'grix_analytics',      label: '📊 Core Analytics',         color: 'emerald', View: GrixCoreAnalyticsView },
            { id: 'grix_anchors',        label: '🧭 Anchors — SPY & QQQ',    color: 'emerald', View: GrixAnchorsView },
            { id: 'grix_flow',           label: '🌊 Flow & Exposure',        color: 'cyan',    View: GrixFlowExposureView },
            { id: 'grix_stock_replacement', label: '🔄 Stock Replacement (QQQ)', color: 'emerald', View: GrixStockReplacementView },
            { id: 'projecao_mercado',    label: '🔭 Projeções de Mercado',   color: 'violet',  View: ProjecaoView },
          ] as const;

          const grixMatch = grixCardConfigs.find(c => c.id === cardId);
          if (grixMatch) {
            if (hiddenCards.includes(cardId)) return null;
            const { id, label, View } = grixMatch;
            return (
              <div
                key={id}
                data-card-id={id}
                onDragOver={(e) => handleDragOver(e, id)}
                onDrop={(e) => handleDrop(e, id)}
                onDragLeave={() => setDragOverTargetId(null)}
                style={{
                  order: cardOrder.indexOf(id),
                  height: cardHeights[id] ? `${cardHeights[id]}px` : undefined
                }}
                className={`w-full min-w-0 max-w-full relative group transition-all duration-300 ${draggedId === id ? 'opacity-40' : ''} ${dragOverTargetId === id ? 'ring-2 ring-blue-500/80 rounded-lg scale-[1.01]' : ''}`}
              >
                <div className="glass rounded-lg h-full border border-slate-800 flex flex-col overflow-hidden">
                  <div
                    className="text-xs font-bold text-emerald-400 uppercase px-3 py-2 select-none cursor-grab active:cursor-grabbing bg-slate-900/10 hover:bg-slate-850/40 flex justify-between items-center"
                    draggable
                    onDragStart={(e) => handleDragStart(e, id)}
                    onDragEnd={handleDragEnd}
                    onTouchStart={(e) => handleTouchStart(e, id)}
                    onTouchEnd={handleTouchEnd}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 text-[11px] cursor-grab">⋮⋮</span>
                      <span>{label}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCardVisibility(id); }}
                      className="text-slate-500 hover:text-red-400 text-xs px-1 rounded transition-colors cursor-pointer"
                      title="Ocultar este card"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="px-3 pb-3 pt-1 flex-1 overflow-auto no-scrollbar">
                    <View data={optionsMarket} />
                  </div>
                </div>
                <div
                  onMouseDown={(e) => startRowResize(e, id)}
                  className="absolute left-0 right-0 bottom-0 h-2.5 cursor-row-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Clique e arraste para alterar a altura (Baixo)"
                >
                  <div className="h-[2px] w-8 bg-blue-400/80 rounded" />
                </div>
                <div
                  onMouseDown={(e) => startRowResizeTop(e, id)}
                  className="absolute left-0 right-0 top-0 h-2.5 cursor-row-resize hover:bg-blue-500/40 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Clique e arraste para alterar a altura (Cima)"
                >
                  <div className="h-[2px] w-8 bg-blue-400/80 rounded" />
                </div>
              </div>
            );
          }

          return null;
  };

  return (
    <div className="space-y-2">
      {/* Zoom Modal if opened */}
      {isZoomed && screenshot && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <img src={`data:image/png;base64,${screenshot}`} alt="Zoomed Chart" className="max-h-full max-w-full object-contain" />
          <button onClick={() => setIsZoomed(false)} className="absolute top-4 right-4 bg-slate-800 text-white font-bold px-3 py-1.5 rounded-full hover:bg-slate-700">Fechar</button>
        </div>
      )}

      {/* Barra de Controle de Layout dos Cards */}
      <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono select-none">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-bold uppercase text-[10px]">🖥️ PAINEL DE CARDS:</span>
          <span className="text-blue-400 font-bold text-[10px]">
            {DEFAULT_ORDER.length - hiddenCards.length}/{DEFAULT_ORDER.length} Visíveis
          </span>
          {hiddenCards.length > 0 && (
            <button
              onClick={showAllCards}
              className="text-[9px] text-amber-400 hover:underline font-bold ml-1 cursor-pointer"
            >
              (Exibir todos)
            </button>
          )}
        </div>

        <div className="relative flex items-center gap-2">
          {canUseMode2 && (
            <button
              onClick={() => setPanelMode && setPanelMode('mode2')}
              className="px-2.5 py-1 rounded bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 hover:text-white border border-indigo-700/60 text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow hover:shadow-indigo-500/20"
              title="Alternar para a TradeStation (Painel 2 com Gráfico Grande e Boleta Integrada)"
            >
              <span>📊 TRADESTATION</span>
            </button>
          )}

          <button
            onClick={() => setShowCardsMenu(!showCardsMenu)}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow"
          >
            <span>🎛️ GERENCIAR CARDS</span>
            <span className="text-[8px]">{showCardsMenu ? '▲' : '▼'}</span>
          </button>

          {/* Dropdown Popover com Perfis Salvos */}
          {showCardsMenu && (
            <div className="absolute right-0 top-8 z-50 w-80 p-3 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl space-y-3 backdrop-blur-md">
              <div className="flex justify-between items-center border-b border-slate-800 pb-1.5 text-[11px] font-bold text-slate-300">
                <span>🎛️ GERENCIAR CARDS & PERFIS</span>
                <button
                  onClick={() => setShowCardsMenu(false)}
                  className="text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Seção 1: Perfis Pré-Configurados */}
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">⭐ Perfis Prontos:</span>
                <div className="space-y-1">
                  {PRESET_PROFILES.map(prof => (
                    <button
                      key={prof.id}
                      onClick={() => applyProfile(prof)}
                      className="w-full text-left px-2 py-1.5 rounded bg-slate-900/80 hover:bg-blue-950/40 border border-slate-800 hover:border-blue-700/50 text-[10px] text-blue-300 font-bold transition flex justify-between items-center cursor-pointer"
                    >
                      <span className="truncate">{prof.name}</span>
                      <span className="text-[8px] bg-blue-900/60 px-1 py-0.5 rounded text-blue-200">Aplicar</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Seção 2: Perfis Salvos do Usuário */}
              <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">💾 Seus Perfis Customizados:</span>
                {savedProfiles.length === 0 ? (
                  <div className="text-[9px] text-slate-500 italic px-1">Nenhum perfil salvo ainda.</div>
                ) : (
                  <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                    {savedProfiles.map(prof => (
                      <div
                        key={prof.id}
                        className="flex items-center justify-between p-1 rounded bg-slate-900 border border-slate-800 text-[10px]"
                      >
                        <span className="font-bold text-slate-300 truncate max-w-[140px]">{prof.name}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => applyProfile(prof)}
                            className="px-1.5 py-0.5 bg-blue-900/60 hover:bg-blue-800 text-blue-200 rounded text-[8px] font-bold transition cursor-pointer"
                          >
                            Carregar
                          </button>
                          <button
                            onClick={() => handleDeleteProfile(prof.id)}
                            className="px-1.5 py-0.5 bg-red-950/60 hover:bg-red-900 text-red-300 rounded text-[8px] font-bold transition cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Salvar Novo Perfil */}
                <div className="flex gap-1 pt-1">
                  <input
                    type="text"
                    placeholder="Nome do novo perfil..."
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[9px] text-slate-200 font-mono font-bold focus:border-blue-500 outline-none"
                  />
                  <button
                    onClick={handleSaveProfile}
                    disabled={!newProfileName.trim()}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-[9px] font-bold transition cursor-pointer"
                  >
                    Salvar
                  </button>
                </div>
              </div>

              {/* Seção 3: Visibilidade Individual & Posição dos Cards */}
              <div className="pt-1.5 border-t border-slate-800 space-y-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">👁️ Exibição & Coluna do Card:</span>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {DEFAULT_ORDER.map((id) => {
                    const isVisible = !hiddenCards.includes(id);
                    const col = cardColumns[id] || DEFAULT_CARD_COLUMNS[id] || 'col1';
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between p-1 rounded hover:bg-slate-900 text-[10px] text-slate-300 font-bold gap-1"
                      >
                        <span className="truncate flex-1 text-[9.5px]">{CARD_LABELS[id] || id}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {(['col1', 'col2', 'col3', 'col4'] as const).map(c => {
                            const colNum = c.replace('col', '');
                            const isActive = col === c;
                            return (
                              <button
                                key={c}
                                onClick={() => setCardColumnTarget(id, c)}
                                className={`px-1.5 py-0.5 rounded text-[8px] font-bold transition cursor-pointer ${
                                  isActive
                                    ? 'bg-blue-600 text-white border border-blue-400'
                                    : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800'
                                }`}
                                title={`Mover para Coluna ${colNum}`}
                              >
                                C{colNum}
                              </button>
                            );
                          })}
                          <input
                            type="checkbox"
                            checked={isVisible}
                            onChange={() => toggleCardVisibility(id)}
                            className="accent-blue-500 rounded cursor-pointer ml-1"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-between gap-2">
                <button
                  onClick={showAllCards}
                  className="flex-1 px-2 py-1 bg-blue-950/50 hover:bg-blue-900/60 border border-blue-800/40 text-blue-300 rounded text-[9px] font-bold transition-all text-center cursor-pointer"
                >
                  Exibir Todos
                </button>
                <button
                  onClick={resetCardSizes}
                  className="flex-1 px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 rounded text-[9px] font-bold transition-all text-center cursor-pointer"
                >
                  Reset Tamanhos
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Multi-Column Grid Layout (Grid 2x2, 3 Colunas ou 4 Colunas) */}
      <div id="vortex-dashboard-grid" className={`grid grid-cols-12 gap-1.5 items-start max-w-full overflow-x-hidden ${isZoomed ? 'hidden' : ''}`} onTouchMove={handleTouchMove}>
        {(['col1', 'col2', 'col3', 'col4'] as const).map(colKey => {
          const cardsInCol = cardOrder.filter(id => {
            const assignedCol = cardColumns[id] || DEFAULT_CARD_COLUMNS[id] || 'col1';
            return assignedCol === colKey && !hiddenCards.includes(id);
          });

          if (cardsInCol.length === 0) return null;

          const spanClass = getColSpanClass(colKey);

          return (
            <div key={colKey} className={`${spanClass} flex flex-col gap-1.5 w-full min-w-0 transition-all duration-150`}>
              {cardsInCol.map(renderCardComponent)}
            </div>
          );
        })}
      </div>
      {isZoomed && (
        <div
          className="fixed inset-0 bg-black/95 z-[99999] flex flex-col justify-center items-center p-3 cursor-zoom-out"
          onClick={() => setIsZoomed(false)}
        >
          <div 
            className="w-[98vw] h-[95vh] max-w-[98vw] bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-hidden flex flex-col relative shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 w-full flex flex-col min-h-0">
              <CandleChart
                candles={candles}
                instanceId={settings?.instance_id_screen || activePanel?.instance_id}
                isZoomed={true}
                timeframe={timeframe}
                setTimeframe={setTimeframe}
                activeIndicators={visibleIndicators}
                gammaLevels={gammaLevels}
                showIndicatorsLegend={false}
                onOpenIndicatorsManager={() => setIsIndicatorsModalOpen(true)}
                autoCenter={autoCenter}
                setAutoCenter={setAutoCenter}
                showTradeMarkers={showTradeMarkers}
                setShowTradeMarkers={setShowTradeMarkers}
                showRobots={showRobots}
                setShowRobots={setShowRobots}
                fitChartTrigger={fitChartTrigger}
                resetViewTrigger={resetViewTrigger}
                hideManualTradeBar={false}
                onClose={() => setIsZoomed(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gerenciamento de Indicadores e Templates do Painel 1 */}
      <IndicatorsManagerModal
        isOpen={isIndicatorsModalOpen}
        onClose={() => setIsIndicatorsModalOpen(false)}
        activeIndicators={activeIndicators}
        onAddIndicator={handleAddIndicator}
        onUpdateIndicator={handleUpdateIndicator}
        onRemoveIndicator={handleRemoveIndicator}
        onToggleVisibility={handleToggleVisibility}
        onLoadTemplate={handleLoadTemplate}
        currentTimeframe={timeframe}
        hideWidgetsTab={true}
      />
    </div>
  );
};
