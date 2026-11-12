import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { TradeBoleta } from './TradeBoleta';
import { TradeDock } from './TradeDock';
import { IndicatorsManagerModal } from './IndicatorsManagerModal';
import { WidgetsManagerModal } from './WidgetsManagerModal';
import { TradeChartGrid } from './TradeChartGrid';
import { TradeChartSlot } from './TradeChartSlot';
import { LayoutSelectorMenu } from './LayoutSelectorMenu';
import {
  DEFAULT_SPLIT_RATIOS,
  type ChartLayoutType,
  type ChartSlotConfig,
  type ChartSplitRatios,
  type WorkspaceTemplate
} from '../types/chartLayout';
import {
  INDICATOR_DEFINITIONS,
  type IndicatorConfig
} from '../utils/indicatorRegistry';
import {
  WIDGET_DEFINITIONS,
  DEFAULT_ACTIVE_WIDGETS,
  type WidgetConfig,
  type WidgetType
} from '../utils/widgetRegistry';
import type { DrawingItem, DrawingToolType } from '../types/chartDrawings';
import { DrawingSettingsModal } from './DrawingSettingsModal';
import { getAccountManualStrategyId, fetchChartDrawingsSupabase, saveChartDrawingsSupabase, fetchAccountChartStateSupabase, saveAccountChartStateSupabase } from '../services/db';
import { evaluateDrawingTrigger } from '../utils/drawingEngine';
import { calculateTradeManagement } from '../utils/levelPriceResolver';
import { useIsMobile } from '../utils/platform';

export const TradeWorkstation: React.FC = () => {
  const {
    candles,
    marketData,
    panels,
    activePanel,
    switchPanel,
    getPanelSnapshot,
    setPanelMode,
    settings,
    allSettings,
    saveSettings,
    gammaLevels,
    accounts,
    activeAccount,
    createReportAction,
    addLog,
    forces,
    reports,
    checkOperationalLimits,
    customSignals,
    refreshMarketData
  } = useApp() as any;

  const currentSymbol = activePanel?.name || 'NQ';
  const rawMarketPrice = (marketData && marketData.price && marketData.price !== '--')
    ? parseFloat(String(marketData.price).replace(/[^\d.-]/g, ''))
    : null;
  const currentPrice = (rawMarketPrice && !isNaN(rawMarketPrice) && rawMarketPrice > 0)
    ? rawMarketPrice
    : (candles && candles.length > 0 ? candles[candles.length - 1].close : 0);

  const pKey = activePanel?.id || currentSymbol || 'main_panel';
  const accKey = activeAccount?.id || 'default_account';

  const isMobile = useIsMobile();
  const [isMobileBoletaOpen, setIsMobileBoletaOpen] = useState<boolean>(false);
  const [mobileQty, setMobileQty] = useState<number>(1);

  // Timeframe persistido por Painel (Independente da Conta)
  const [timeframe, setTimeframe] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(`vortex_tf_${pKey}`) ||
                    localStorage.getItem('vortex_workstation_tf');
      return saved ? Number(saved) : 5;
    } catch {
      return 5;
    }
  });

  // Troca de Painel: Recarrega o timeframe específico daquele painel (Não recarrega por troca de conta)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`vortex_tf_${pKey}`) ||
                    localStorage.getItem('vortex_workstation_tf');
      if (saved) {
        setTimeframe(Number(saved));
      }
    } catch {}
  }, [pKey]);

  // Disparar varredura completa do histórico ao abrir o gráfico ou trocar de ativo
  useEffect(() => {
    if (refreshMarketData) {
      refreshMarketData();
    }
  }, [pKey]);

  const handleSetTimeframe = useCallback((newTf: number) => {
    setTimeframe(newTf);
    try {
      localStorage.setItem(`vortex_tf_${pKey}`, String(newTf));
      localStorage.setItem('vortex_workstation_tf', String(newTf));
    } catch {}
  }, [pKey]);

  const [isIndicatorsModalOpen, setIsIndicatorsModalOpen] = useState<boolean>(false);
  const [isWidgetsModalOpen, setIsWidgetsModalOpen] = useState<boolean>(false);
  const [editingIndicatorForModal, setEditingIndicatorForModal] = useState<IndicatorConfig | null>(null);
  const [fitChartTrigger, setFitChartTrigger] = useState<number>(0);
  const [resetViewTrigger, setResetViewTrigger] = useState<number>(0);
  const [autoCenter, setAutoCenter] = useState<boolean>(false);
  const [showTradeMarkers, setShowTradeMarkers] = useState<boolean>(true);
  const [showOrderLines, setShowOrderLines] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('vortex_ws_show_order_lines');
      return saved !== 'false';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try { localStorage.setItem('vortex_ws_show_order_lines', String(showOrderLines)); } catch {}
  }, [showOrderLines]);
  const [showRobots, setShowRobots] = useState<boolean>(false);
  const [dockHeight, setDockHeight] = useState<number>(180); // Height of bottom dock in pixels
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    return settings?.chart_color_theme || localStorage.getItem('vortex_chart_theme') || 'black';
  });

  useEffect(() => {
    if (settings?.chart_color_theme) {
      setCurrentTheme(settings.chart_color_theme);
    }
    const handleThemeChange = (e: any) => {
      if (e.detail?.theme) {
        setCurrentTheme(e.detail.theme);
      }
    };
    window.addEventListener('vortex_chart_theme_changed', handleThemeChange);
    return () => window.removeEventListener('vortex_chart_theme_changed', handleThemeChange);
  }, [settings?.chart_color_theme]);

  const [showBottomDock, setShowBottomDock] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(`vortex_workstation_show_dock_${pKey}`);
      return saved !== 'false';
    } catch {
      return true;
    }
  });

  const toggleBottomDock = useCallback(() => {
    setShowBottomDock(prev => {
      const next = !prev;
      try { localStorage.setItem(`vortex_workstation_show_dock_${pKey}`, String(next)); } catch {}
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
      return next;
    });
  }, [pKey]);

  const [isRightBoletaCollapsed, setIsRightBoletaCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(`vortex_workstation_hide_boleta_${pKey}`);
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const toggleRightBoleta = useCallback(() => {
    setIsRightBoletaCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(`vortex_workstation_hide_boleta_${pKey}`, String(next)); } catch {}
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
      return next;
    });
  }, [pKey]);

  // Boleta Flutuante Desancorada (Móvel para qualquer lugar da tela, estilo Chat Copilot)
  const [isBoletaFloating, setIsBoletaFloating] = useState<boolean>(() => {
    try {
      return localStorage.getItem('vortex_boleta_floating') === 'true';
    } catch {
      return false;
    }
  });

  const [boletaPos, setBoletaPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem('vortex_boleta_pos');
      if (saved) return JSON.parse(saved);
    } catch {}
    const defaultX = typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 330) : 800;
    const defaultY = typeof window !== 'undefined' ? 70 : 70;
    return { x: defaultX, y: defaultY };
  });

  const toggleBoletaFloating = useCallback(() => {
    setIsBoletaFloating(prev => {
      const next = !prev;
      try { localStorage.setItem('vortex_boleta_floating', String(next)); } catch {}
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
      return next;
    });
  }, []);

  const isDraggingBoletaRef = useRef(false);
  const boletaDragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0, mouseY: 0, startX: 0, startY: 0
  });

  const handleBoletaDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select')) {
      return;
    }
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    isDraggingBoletaRef.current = true;
    boletaDragStartRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      startX: boletaPos.x,
      startY: boletaPos.y
    };

    const handleMouseMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isDraggingBoletaRef.current) return;
      const curX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const curY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;
      const deltaX = curX - boletaDragStartRef.current.mouseX;
      const deltaY = curY - boletaDragStartRef.current.mouseY;

      const maxX = Math.max(10, window.innerWidth - 305);
      const maxY = Math.max(10, window.innerHeight - 200);

      const nextX = Math.max(10, Math.min(maxX, boletaDragStartRef.current.startX + deltaX));
      const nextY = Math.max(10, Math.min(maxY, boletaDragStartRef.current.startY + deltaY));

      setBoletaPos({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      isDraggingBoletaRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);

      setBoletaPos(current => {
        try { localStorage.setItem('vortex_boleta_pos', JSON.stringify(current)); } catch {}
        return current;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleMouseMove);
    window.addEventListener('touchend', handleMouseUp);
  }, [boletaPos]);

  const [showIndicatorsLegend, setShowIndicatorsLegend] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(`vortex_show_ind_legend_${pKey}`);
      return saved !== 'false';
    } catch {
      return true;
    }
  });

  const handleToggleIndicatorsLegend = useCallback((show: boolean) => {
    setShowIndicatorsLegend(show);
    try {
      localStorage.setItem(`vortex_show_ind_legend_${pKey}`, String(show));
    } catch {}
  }, [pKey]);

  // Global Keyboard Shortcuts (Ctrl/Cmd + R, C, I, S, H, F, B)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (isCtrlOrCmd) {
        switch (key) {
          case 'r':
            e.preventDefault();
            setResetViewTrigger(prev => prev + 1);
            break;
          case 'c':
            const selectedText = window.getSelection()?.toString();
            if (!selectedText) {
              e.preventDefault();
              setAutoCenter(prev => !prev);
            }
            break;
          case 'i':
            e.preventDefault();
            handleToggleIndicatorsLegend(!showIndicatorsLegend);
            break;
          case 's':
            e.preventDefault();
            setShowTradeMarkers(prev => !prev);
            break;
          case 'h':
            e.preventDefault();
            toggleBottomDock();
            break;
          case 'f':
            e.preventDefault();
            setFitChartTrigger(prev => prev + 1);
            break;
          case 'b':
            e.preventDefault();
            toggleRightBoleta();
            break;
          default:
            break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleIndicatorsLegend, showIndicatorsLegend, toggleBottomDock, toggleRightBoleta]);

  // Modo de Template: Global (Intermitente em todos os ativos) ou Personalização por Ativo
  const [templateMode, setTemplateMode] = useState<'global' | 'per_asset'>(() => {
    return (settings?.chart_template_mode as any) || (typeof localStorage !== 'undefined' ? localStorage.getItem('vortex_chart_template_mode') as any : 'global') || 'global';
  });

  useEffect(() => {
    if (settings?.chart_template_mode) {
      setTemplateMode(settings.chart_template_mode);
    }
    const handleTemplateModeChange = (e: any) => {
      if (e.detail?.templateMode) {
        setTemplateMode(e.detail.templateMode);
      }
    };
    window.addEventListener('vortex_chart_template_mode_changed', handleTemplateModeChange);
    return () => window.removeEventListener('vortex_chart_template_mode_changed', handleTemplateModeChange);
  }, [settings?.chart_template_mode]);

  const isGlobalTemplate = templateMode === 'global';

  // Template e Indicadores do Gráfico (Independente de Contas - Regra 1)
  const [activeIndicators, setActiveIndicators] = useState<IndicatorConfig[]>(() => {
    try {
      const isGlob = (settings?.chart_template_mode || (typeof localStorage !== 'undefined' ? localStorage.getItem('vortex_chart_template_mode') : 'global') || 'global') === 'global';
      const saved = isGlob
        ? (localStorage.getItem('vortex_global_active_indicators') || localStorage.getItem('vortex_workstation_indicators') || localStorage.getItem(`vortex_active_indicators_${pKey}`) || localStorage.getItem(`vortex_active_indicators_${currentSymbol}`))
        : (localStorage.getItem(`vortex_active_indicators_${pKey}`) || localStorage.getItem(`vortex_active_indicators_${currentSymbol}`) || localStorage.getItem('vortex_workstation_indicators'));
      if (saved) return JSON.parse(saved);
    } catch (e) {}

    // Check if there is a default template defined for Panel 2
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

  // =========================================================================
  // MULTI-GRÁFICOS: Layouts, Divisores Arrastáveis, Foco Ativo e Templates
  // =========================================================================
  const [chartLayout, setChartLayout] = useState<ChartLayoutType>(() => {
    try {
      const saved = localStorage.getItem('vortex_ws_layout') as ChartLayoutType;
      return saved || 'single';
    } catch {
      return 'single';
    }
  });

  const [splitRatios, setSplitRatios] = useState<ChartSplitRatios>(() => {
    try {
      const saved = localStorage.getItem('vortex_ws_ratios');
      if (saved) return { ...DEFAULT_SPLIT_RATIOS, ...JSON.parse(saved) };
    } catch {}
    return { ...DEFAULT_SPLIT_RATIOS };
  });

  const [focusedSlotIndex, setFocusedSlotIndex] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('vortex_ws_focused_slot');
      const num = saved !== null ? Number(saved) : 0;
      return !isNaN(num) && num >= 0 && num <= 3 ? num : 0;
    } catch {
      return 0;
    }
  });
  const [maximizedSlotIndex, setMaximizedSlotIndex] = useState<number | null>(null);
  const [isBoletaAssetLocked, setIsBoletaAssetLocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem('vortex_ws_boleta_locked') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try { localStorage.setItem('vortex_ws_focused_slot', String(focusedSlotIndex)); } catch {}
  }, [focusedSlotIndex]);

  useEffect(() => {
    try { localStorage.setItem('vortex_ws_boleta_locked', String(isBoletaAssetLocked)); } catch {}
  }, [isBoletaAssetLocked]);

  const [multiSlots, setMultiSlots] = useState<ChartSlotConfig[]>(() => {
    try {
      const saved = localStorage.getItem('vortex_ws_slots');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 4) return parsed;
      }
    } catch {}
    return [
      { id: 'slot_0', panelId: pKey, timeframe: 5, indicators: [], autoCenter: false, showTradeMarkers: true, showIndicatorsLegend: true, showRobots: false },
      { id: 'slot_1', panelId: pKey, timeframe: 15, indicators: [], autoCenter: false, showTradeMarkers: true, showIndicatorsLegend: true, showRobots: false },
      { id: 'slot_2', panelId: pKey, timeframe: 1, indicators: [], autoCenter: false, showTradeMarkers: true, showIndicatorsLegend: true, showRobots: false },
      { id: 'slot_3', panelId: pKey, timeframe: 60, indicators: [], autoCenter: false, showTradeMarkers: true, showIndicatorsLegend: true, showRobots: false },
    ];
  });

  // Garantir que slots secundários sem painel válido herdem o painel ativo na inicialização
  useEffect(() => {
    if (!activePanel?.id || !panels || panels.length === 0) return;
    setMultiSlots(prev => prev.map((s, idx) => {
      const exists = panels.some((p: any) => p.id === s.panelId);
      if (!exists || idx === 0) {
        return {
          ...s,
          panelId: idx === 0 ? activePanel.id : (exists ? s.panelId : activePanel.id),
          indicators: idx === 0 ? activeIndicators : (s.indicators.length === 0 ? JSON.parse(JSON.stringify(activeIndicators)) : s.indicators)
        };
      }
      return s;
    }));
  }, [activePanel?.id, panels?.length]);

  // Persistência automática dos slots e proporções
  useEffect(() => {
    try { localStorage.setItem('vortex_ws_slots', JSON.stringify(multiSlots)); } catch {}
  }, [multiSlots]);

  const handleSelectLayout = useCallback((nextLayout: ChartLayoutType) => {
    setChartLayout(nextLayout);
    setMaximizedSlotIndex(null);
    if (nextLayout === 'single') {
      setFocusedSlotIndex(0);
    } else if (nextLayout === 'split-v' || nextLayout === 'split-h') {
      setFocusedSlotIndex(prev => (prev > 1 ? 0 : prev));
    } else if (nextLayout.startsWith('triple')) {
      setFocusedSlotIndex(prev => (prev > 2 ? 0 : prev));
    }
    try { localStorage.setItem('vortex_ws_layout', nextLayout); } catch {}
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
  }, []);

  const handleChangeRatios = useCallback((next: ChartSplitRatios) => {
    setSplitRatios(next);
    try { localStorage.setItem('vortex_ws_ratios', JSON.stringify(next)); } catch {}
  }, []);

  const handleResetRatios = useCallback(() => {
    const def = { ...DEFAULT_SPLIT_RATIOS };
    setSplitRatios(def);
    try { localStorage.setItem('vortex_ws_ratios', JSON.stringify(def)); } catch {}
    setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
  }, []);

  const [workspaceTemplates, setWorkspaceTemplates] = useState<WorkspaceTemplate[]>(() => {
    try {
      const saved = localStorage.getItem('vortex_ws_templates');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const getEffectiveSlot = useCallback((idx: number): ChartSlotConfig => {
    if (idx === 0) {
      return {
        id: 'slot_0',
        panelId: activePanel?.id || pKey,
        timeframe,
        indicators: activeIndicators,
        autoCenter,
        showTradeMarkers,
        showOrderLines,
        showIndicatorsLegend,
        showRobots,
      };
    }
    const base = multiSlots[idx] || multiSlots[0];
    return {
      ...base,
      panelId: (panels || []).some((p: any) => p.id === base.panelId) ? base.panelId : (activePanel?.id || pKey),
    };
  }, [activePanel?.id, pKey, timeframe, activeIndicators, autoCenter, showTradeMarkers, showOrderLines, showIndicatorsLegend, showRobots, multiSlots, panels]);

  const effectiveFocusedIdx = chartLayout === 'single' ? 0 : focusedSlotIndex;
  const focusedSlot = useMemo(() => getEffectiveSlot(effectiveFocusedIdx), [getEffectiveSlot, effectiveFocusedIdx]);
  const focusedVisibleIndicators = useMemo(() => (focusedSlot.indicators || []).filter(i => i.visible), [focusedSlot.indicators]);
  const focusedPanel = useMemo(() => (panels || []).find((p: any) => p.id === focusedSlot.panelId) || activePanel, [panels, focusedSlot.panelId, activePanel]);

  const updateSlotByIndex = useCallback((idx: number, updater: (prev: ChartSlotConfig) => ChartSlotConfig) => {
    if (idx === 0) {
      const current0 = getEffectiveSlot(0);
      const next0 = updater(current0);
      if (next0.panelId !== current0.panelId && switchPanel) {
        switchPanel(next0.panelId);
      }
      if (next0.timeframe !== current0.timeframe) {
        handleSetTimeframe(next0.timeframe);
      }
      if (next0.indicators !== current0.indicators) {
        setActiveIndicators(next0.indicators);
      }
      if (next0.autoCenter !== current0.autoCenter) setAutoCenter(next0.autoCenter);
      if (next0.showTradeMarkers !== current0.showTradeMarkers) setShowTradeMarkers(next0.showTradeMarkers);
      if (next0.showOrderLines !== current0.showOrderLines) setShowOrderLines(next0.showOrderLines !== false);
      if (next0.showIndicatorsLegend !== current0.showIndicatorsLegend) {
        setShowIndicatorsLegend(next0.showIndicatorsLegend);
      }
      if (next0.showRobots !== current0.showRobots) setShowRobots(next0.showRobots);
      return;
    }
    setMultiSlots(prev => prev.map((s, i) => (i === idx ? updater(s) : s)));
  }, [getEffectiveSlot, switchPanel, handleSetTimeframe]);

  const handleSaveWorkspaceTemplate = useCallback((name: string) => {
    const snapshotSlots: ChartSlotConfig[] = [0, 1, 2, 3].map(i => JSON.parse(JSON.stringify(getEffectiveSlot(i))));
    const newTpl: WorkspaceTemplate = {
      id: `tpl_${Date.now()}`,
      name,
      layout: chartLayout,
      ratios: { ...splitRatios },
      slots: snapshotSlots,
      createdAt: Date.now(),
    };
    setWorkspaceTemplates(prev => {
      const next = [newTpl, ...prev];
      try { localStorage.setItem('vortex_ws_templates', JSON.stringify(next)); } catch {}
      return next;
    });
  }, [getEffectiveSlot, chartLayout, splitRatios]);

  const handleLoadWorkspaceTemplate = useCallback((tpl: WorkspaceTemplate) => {
    handleSelectLayout(tpl.layout);
    handleChangeRatios({ ...DEFAULT_SPLIT_RATIOS, ...tpl.ratios });
    if (tpl.slots && tpl.slots.length > 0) {
      const slot0 = tpl.slots[0];
      if (slot0.panelId && slot0.panelId !== activePanel?.id && switchPanel) {
        switchPanel(slot0.panelId);
      }
      if (slot0.timeframe) handleSetTimeframe(slot0.timeframe);
      if (slot0.indicators) setActiveIndicators(JSON.parse(JSON.stringify(slot0.indicators)));
      setAutoCenter(Boolean(slot0.autoCenter));
      setShowTradeMarkers(slot0.showTradeMarkers !== false);
      setShowRobots(Boolean(slot0.showRobots));
      setMultiSlots(prev => prev.map((s, idx) => (tpl.slots[idx] ? JSON.parse(JSON.stringify(tpl.slots[idx])) : s)));
    }
  }, [handleSelectLayout, handleChangeRatios, activePanel?.id, switchPanel, handleSetTimeframe]);

  const handleDeleteWorkspaceTemplate = useCallback((id: string) => {
    setWorkspaceTemplates(prev => {
      const next = prev.filter(t => t.id !== id);
      try { localStorage.setItem('vortex_ws_templates', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Active Widgets on Chart state initialized with default presets or localStorage
  const [activeWidgets, setActiveWidgets] = useState<WidgetConfig[]>(() => {
    try {
      const isGlob = (settings?.chart_template_mode || (typeof localStorage !== 'undefined' ? localStorage.getItem('vortex_chart_template_mode') : 'global') || 'global') === 'global';
      const saved = isGlob
        ? (localStorage.getItem('vortex_global_active_widgets') || localStorage.getItem('vortex_workstation_widgets') || localStorage.getItem(`vortex_active_widgets_${pKey}`) || localStorage.getItem(`vortex_active_widgets_${currentSymbol}`))
        : (localStorage.getItem(`vortex_active_widgets_${pKey}`) || localStorage.getItem(`vortex_active_widgets_${currentSymbol}`) || localStorage.getItem('vortex_workstation_widgets'));
      if (saved) return JSON.parse(saved);
    } catch (e) {}

    // Check if default template has widgets
    try {
      const defTemplateStr = localStorage.getItem('vortex_default_template_panel2');
      if (defTemplateStr) {
        const defTemplate = JSON.parse(defTemplateStr);
        if (defTemplate?.widgets && Array.isArray(defTemplate.widgets) && defTemplate.widgets.length > 0) {
          return defTemplate.widgets;
        }
      }
    } catch (e) {}

    return DEFAULT_ACTIVE_WIDGETS;
  });

  // Troca de Painel: Se modo for por ativo, recarrega o template daquele painel.
  // Se modo for global (intermitente), mantém o mesmo template! E NUNCA recarrega ao trocar de conta!
  useEffect(() => {
    if (isGlobalTemplate) {
      return;
    }

    try {
      const saved = localStorage.getItem(`vortex_active_indicators_${pKey}`) ||
                    localStorage.getItem(`vortex_active_indicators_${currentSymbol}`);
      if (saved) {
        setActiveIndicators(JSON.parse(saved));
      }
      const savedWids = localStorage.getItem(`vortex_active_widgets_${pKey}`) ||
                        localStorage.getItem(`vortex_active_widgets_${currentSymbol}`);
      if (savedWids) {
        setActiveWidgets(JSON.parse(savedWids));
      }
    } catch {}

    // Sincroniza do Supabase em background
    fetchAccountChartStateSupabase('global', pKey).then(remoteState => {
      if (remoteState) {
        if (remoteState.indicators && Array.isArray(remoteState.indicators) && remoteState.indicators.length > 0) {
          setActiveIndicators(remoteState.indicators);
        }
        if (remoteState.widgets && Array.isArray(remoteState.widgets) && remoteState.widgets.length > 0) {
          setActiveWidgets(remoteState.widgets);
        }
        if (remoteState.timeframe && typeof remoteState.timeframe === 'number') {
          setTimeframe(remoteState.timeframe);
        }
      }
    }).catch(() => {});
  }, [pKey, currentSymbol, isGlobalTemplate]);

  // Auto-salvar indicadores e widgets (localStorage + Supabase)
  useEffect(() => {
    if (activeIndicators) {
      try {
        localStorage.setItem(`vortex_active_indicators_${pKey}`, JSON.stringify(activeIndicators));
        localStorage.setItem(`vortex_active_indicators_${currentSymbol}`, JSON.stringify(activeIndicators));
        localStorage.setItem('vortex_global_active_indicators', JSON.stringify(activeIndicators));
        localStorage.setItem('vortex_workstation_indicators', JSON.stringify(activeIndicators));

        localStorage.setItem(`vortex_active_widgets_${pKey}`, JSON.stringify(activeWidgets));
        localStorage.setItem(`vortex_active_widgets_${currentSymbol}`, JSON.stringify(activeWidgets));
        localStorage.setItem('vortex_global_active_widgets', JSON.stringify(activeWidgets));
        localStorage.setItem('vortex_workstation_widgets', JSON.stringify(activeWidgets));
      } catch {}

      saveAccountChartStateSupabase('global', pKey, {
        indicators: activeIndicators,
        widgets: activeWidgets,
        timeframe: timeframe
      }).catch(() => {});
    }
  }, [activeIndicators, activeWidgets, timeframe, pKey, currentSymbol]);

  // Indicator Handlers (atuam no gráfico focado)
  const handleAddIndicator = (type: string, customConfig?: IndicatorConfig) => {
    if (customConfig) {
      updateSlotByIndex(effectiveFocusedIdx, s => ({ ...s, indicators: [...s.indicators, customConfig] }));
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

    updateSlotByIndex(effectiveFocusedIdx, s => ({ ...s, indicators: [...s.indicators, newInd] }));
  };

  const handleUpdateIndicator = (updated: IndicatorConfig) => {
    updateSlotByIndex(effectiveFocusedIdx, s => ({
      ...s,
      indicators: s.indicators.map(ind => ind.id === updated.id ? updated : ind)
    }));
  };

  const handleRemoveIndicator = (id: string) => {
    updateSlotByIndex(effectiveFocusedIdx, s => ({
      ...s,
      indicators: s.indicators.filter(ind => ind.id !== id)
    }));
  };

  const handleToggleVisibility = (id: string) => {
    updateSlotByIndex(effectiveFocusedIdx, s => ({
      ...s,
      indicators: s.indicators.map(ind => ind.id === id ? { ...ind, visible: !ind.visible } : ind)
    }));
  };

  const handleLoadTemplate = (indicators: IndicatorConfig[], widgets?: WidgetConfig[], tf?: number) => {
    const cloned = JSON.parse(JSON.stringify(indicators));
    if (effectiveFocusedIdx > 0) {
      updateSlotByIndex(effectiveFocusedIdx, s => ({
        ...s,
        indicators: cloned,
        timeframe: (tf && typeof tf === 'number') ? tf : s.timeframe
      }));
      return;
    }

    setActiveIndicators(cloned);
    try {
      localStorage.setItem(`vortex_active_indicators_${accKey}_${pKey}`, JSON.stringify(cloned));
      localStorage.setItem(`vortex_active_indicators_${currentSymbol}`, JSON.stringify(cloned));
      localStorage.setItem('vortex_workstation_indicators', JSON.stringify(cloned));
    } catch {}

    let nextWidgets = activeWidgets;
    if (widgets && Array.isArray(widgets)) {
      const clonedWidgets = JSON.parse(JSON.stringify(widgets));
      setActiveWidgets(clonedWidgets);
      nextWidgets = clonedWidgets;
      try {
        localStorage.setItem(`vortex_active_widgets_${accKey}_${pKey}`, JSON.stringify(clonedWidgets));
        localStorage.setItem(`vortex_active_widgets_${currentSymbol}`, JSON.stringify(clonedWidgets));
        localStorage.setItem('vortex_workstation_widgets', JSON.stringify(clonedWidgets));
      } catch {}
    }

    if (tf && typeof tf === 'number') {
      setTimeframe(tf);
    }

    saveAccountChartStateSupabase(accKey, pKey, {
      indicators: cloned,
      widgets: nextWidgets,
      timeframe: tf || timeframe
    }).catch(() => {});
  };

  const handleApplyDefaultTemplate = () => {
    try {
      const defTemplateStr = localStorage.getItem('vortex_default_template_panel2');
      if (!defTemplateStr) {
        setIsIndicatorsModalOpen(true);
        return;
      }
      const defTemplate = JSON.parse(defTemplateStr);
      if (defTemplate?.indicators) {
        handleLoadTemplate(defTemplate.indicators, defTemplate.widgets, defTemplate.timeframe);
        alert(`⭐ Template Padrão "${defTemplate.name}" aplicado ao gráfico com sucesso!`);
      }
    } catch (e) {
      console.warn('Erro ao carregar template padrão:', e);
    }
  };

  // Widget Handlers
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

  const handleUpdateWidget = (updated: WidgetConfig) => {
    setActiveWidgets(prev => prev.map(w => w.id === updated.id ? updated : w));
  };

  const handleRemoveWidget = (id: string) => {
    setActiveWidgets(prev => prev.filter(w => w.id !== id));
  };

  const handleToggleWidgetVisibility = (id: string) => {
    setActiveWidgets(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  };

  const handleResetWidgetPositions = () => {
    setActiveWidgets(prev => prev.map((w, idx) => {
      const def = WIDGET_DEFINITIONS[w.type];
      const defPos = def?.defaultPosition || { x: 20, y: 50 };
      return {
        ...w,
        position: {
          x: defPos.x + (idx % 4) * 25,
          y: defPos.y + Math.floor(idx / 4) * 30
        }
      };
    }));
  };

  const activeAccountId = activeAccount?.id || 'default';
  const getDrawingsKey = (accId: string, sym: string) => `vortex_chart_drawings_${accId}_${sym}`;

  // Drawing Tools State (Persistência vinculada à Conta Ativa e por Ativo)
  const [drawings, setDrawings] = useState<DrawingItem[]>(() => {
    try {
      const saved = localStorage.getItem(getDrawingsKey(activeAccountId, currentSymbol));
      if (saved) return JSON.parse(saved);
      const legacy = localStorage.getItem(`vortex_chart_drawings_${currentSymbol}`);
      return legacy ? JSON.parse(legacy) : [];
    } catch {
      return [];
    }
  });

  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingToolType | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [isDrawingsMenuOpen, setIsDrawingsMenuOpen] = useState<boolean>(false);
  const [isDrawingSettingsOpen, setIsDrawingSettingsOpen] = useState<boolean>(false);
  const [editingDrawing, setEditingDrawing] = useState<DrawingItem | null>(null);

  // Troca de Conta ou de Ativo: Recarrega os desenhos da conta ativa selecionada (Local + Supabase)
  useEffect(() => {
    let isMounted = true;
    const key = getDrawingsKey(activeAccountId, currentSymbol);
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        setDrawings(JSON.parse(saved));
      } else {
        const legacy = localStorage.getItem(`vortex_chart_drawings_${currentSymbol}`);
        if (legacy && activeAccountId === 'default') {
          setDrawings(JSON.parse(legacy));
        } else {
          setDrawings([]);
        }
      }
    } catch {}

    // Sincronizar com Supabase em background
    fetchChartDrawingsSupabase(activeAccountId, currentSymbol).then(remoteDrawings => {
      if (isMounted && remoteDrawings && remoteDrawings.length > 0) {
        setDrawings(remoteDrawings);
      }
    }).catch(() => {});

    return () => { isMounted = false; };
  }, [activeAccountId, currentSymbol]);

  // Auto-salvar desenhos no localStorage e Supabase vinculados à conta ativa e ao ativo
  useEffect(() => {
    if (drawings) {
      saveChartDrawingsSupabase(activeAccountId, currentSymbol, drawings).catch(() => {});
    }
  }, [drawings, activeAccountId, currentSymbol]);

  // Monitoramento e Execução em 2º Plano para TODAS as Contas com Desenhos Armados
  useEffect(() => {
    if (!candles || candles.length === 0 || !accounts || accounts.length === 0) return;
    const latestCandle = candles[candles.length - 1];
    const prevCandle = candles.length > 1 ? candles[candles.length - 2] : undefined;
    if (!latestCandle) return;

    const processAccountDrawings = async () => {
      for (const acc of accounts) {
        if (!acc.active && acc.status !== 'Ativa') continue;
        try {
          const key = getDrawingsKey(acc.id, currentSymbol);
          const saved = localStorage.getItem(key);
          if (!saved) continue;
          let accDrawings: DrawingItem[] = JSON.parse(saved);
          if (!accDrawings || accDrawings.length === 0) continue;

          let hasUpdates = false;
          const drawingsToDelete: string[] = [];

          for (const drawing of accDrawings) {
            if (!drawing.trigger || !drawing.trigger.enabled) continue;
            if (drawing.trigger.status !== 'armed' && drawing.trigger.status !== 'waiting_algo') continue;

            const evalRes = evaluateDrawingTrigger(drawing, latestCandle as any, prevCandle as any);
            if (!evalRes || !evalRes.triggered) continue;

            // CASO 1: Modalidade com Confirmação por Algoritmo (Robô)
            if (evalRes.executionType === 'algorithm') {
              // Fase A: Preço tocou na linha pela 1ª vez -> Entra em espera de sinal do robô
              if (drawing.trigger.status === 'armed') {
                drawing.trigger.status = 'waiting_algo';
                drawing.trigger.lastTriggeredAt = new Date().toISOString();
                hasUpdates = true;

                if (addLog) {
                  addLog(
                    'ROBÔ',
                    `⚡ Preço tocou o traçado [${evalRes.description}]. Aguardando sinal de confirmação do Robô: ${evalRes.targetAlgorithmName || 'Algoritmo'} [Conta: ${acc.account_name}]`,
                    'sistema'
                  );
                }
                continue;
              }

              // Fase B: Já em espera -> Verifica se o robô vinculado gerou sinal na direção correspondente
              if (drawing.trigger.status === 'waiting_algo') {
                const targetStratId = evalRes.targetAlgorithmId;
                const hasSignal = (customSignals || []).some((s: any) => 
                  s.strategyId === targetStratId && 
                  s.side === evalRes.side &&
                  (s.panelId === activePanel?.id || s.instanceId === activePanel?.instance_id || !s.panelId)
                );

                if (!hasSignal) {
                  // Robô ainda não confirmou, permanece aguardando
                  continue;
                }

                // Robô confirmou! Desarma o desenho e prossegue com a ordem
                drawing.trigger.status = 'triggered';
                drawing.trigger.lastTriggeredAt = new Date().toISOString();
                hasUpdates = true;
              }
            } else {
              // CASO 2: Simples Toque ou Viés do Painel
              // Validação de Confirmação do Painel (Viés) se exigida
              if (evalRes.requireConfirmation) {
                const isBullish = forces && forces.length > 0 && forces[0]?.buy > forces[0]?.sell;
                const isBearish = forces && forces.length > 0 && forces[0]?.sell > forces[0]?.buy;
                if (evalRes.side === 'COMPRA' && isBearish) {
                  console.log(`[DESENHO TRIGGER BG] Compra bloqueada na conta ${acc.account_name}: painel baixista.`);
                  continue;
                }
                if (evalRes.side === 'VENDA' && isBullish) {
                  console.log(`[DESENHO TRIGGER BG] Venda bloqueada na conta ${acc.account_name}: painel altista.`);
                  continue;
                }
              }

              // Desativação imediata (One-Shot Trigger - Sempre desarma ao tocar)
              drawing.trigger.status = 'triggered';
              drawing.trigger.lastTriggeredAt = new Date().toISOString();
              hasUpdates = true;
            }

            // 2. Validação de Gestão de Risco Global da Conta
            if (checkOperationalLimits) {
              const opCheck = await checkOperationalLimits(activePanel?.id, undefined, acc, false);
              if (!opCheck.allowed) {
                console.log(`[DESENHO TRIGGER BG] Bloqueado por gestão de risco na conta ${acc.account_name}: ${opCheck.reason}. Gatilho desarmado.`);
                if (addLog) {
                  addLog('ROBÔ', `⚠️ Gatilho ${evalRes.description} desarmado sem abrir ordem [Conta: ${acc.account_name}]: ${opCheck.reason}`, 'alerta');
                }
                continue;
              }
            }

            // 3. Regra de Posição Única por Ativo na Conta (Não abrir se já houver posição Em Andamento no mesmo ativo)
            const hasOpenPosInAsset = (reports || []).some((r: any) => 
              r.status === 'Em Andamento' &&
              String(r.account_id) === String(acc.id) &&
              (r.panel_id === activePanel?.id || (r.description && r.description.includes(currentSymbol)) || r.instance_id === activePanel?.instance_id)
            );

            if (hasOpenPosInAsset) {
              console.log(`[DESENHO TRIGGER BG] Bloqueado: Conta ${acc.account_name} já possui ordem em andamento no ativo ${currentSymbol}. Gatilho desarmado.`);
              if (addLog) {
                addLog('ROBÔ', `⚠️ Gatilho ${evalRes.description} desarmado [Conta: ${acc.account_name}]: Conta já possui posição aberta no ativo ${currentSymbol}.`, 'alerta');
              }
              continue;
            }

            // 4. Disparo da ordem para a respectiva conta (seja ela a ativa em tela ou em 2º plano)
            if (createReportAction) {
              try {
                const manualStratId = getAccountManualStrategyId(acc);
                const entryPrice = Number(evalRes.price || latestCandle.close);
                const targetPanelForAcc = (panels || []).find((p: any) => p.id === activePanel?.id || p.instance_id === activePanel?.instance_id) || activePanel;
                const panelSettings = targetPanelForAcc ? (allSettings?.[targetPanelForAcc.id] || settings) : settings;
                const pointVal = targetPanelForAcc?.point_value !== undefined && targetPanelForAcc?.point_value !== null ? Number(targetPanelForAcc.point_value) : 1.0;

                const mgmt = calculateTradeManagement({
                  side: evalRes.side,
                  entryPrice,
                  drawingTrigger: drawing.trigger,
                  panelSettings,
                  globalSettings: settings,
                  gammaLevels,
                  pointValue: pointVal
                });

                const fullDesc = evalRes.executionType === 'algorithm'
                  ? `${evalRes.description} + [${evalRes.targetAlgorithmName || 'Robô'}]`
                  : evalRes.description;

                let orderCreated = false;

                if (mgmt.isATMActive && mgmt.activeATM && mgmt.activeATM.brackets) {
                  // Execução via Estratégia ATM configurada na Boleta
                  for (let idx = 0; idx < mgmt.activeATM.brackets.length; idx++) {
                    const bracket = mgmt.activeATM.brackets[idx];
                    const bSlPts = bracket.stopLossPts;
                    const bTpPts = bracket.takeProfitPts;
                    const bSlPrice = evalRes.side === 'COMPRA' ? entryPrice - bSlPts : entryPrice + bSlPts;
                    const bTpPrice = evalRes.side === 'COMPRA' ? entryPrice + bTpPts : entryPrice - bTpPts;

                    const beStr = bracket.autoBreakevenEnabled ? ` | BE: ${bracket.autoBreakevenTriggerPts}+${bracket.autoBreakevenOffsetPts}` : '';
                    const trailStr = bracket.trailingStopEnabled ? ` | TRAIL: ${bracket.trailingStopTriggerPts}/${bracket.trailingStopStepPts}` : '';

                    const res = await createReportAction({
                      strategy_id: manualStratId,
                      strategy_name: mgmt.activeATM.brackets.length > 1 ? `${fullDesc} (Alvo ${idx + 1})` : fullDesc,
                      instance_id: activePanel?.instance_id || 'painel_principal',
                      side: evalRes.side,
                      entry_price: entryPrice,
                      stop_loss: Number(bSlPrice.toFixed(2)),
                      take_profit: Number(bTpPrice.toFixed(2)),
                      exit_price: null,
                      status: 'Em Andamento',
                      description: `[${currentSymbol}] ${fullDesc} - ${mgmt.activeATM.name} (${bracket.quantity}x - SL: ${bSlPts}pt / TP: ${bTpPts}pt${beStr}${trailStr}) [${acc.account_name}]`,
                      panel_id: activePanel?.id || null,
                      contrato: bracket.quantity,
                      account_id: acc.id,
                      is_atm: true,
                      allow_multi: true
                    } as any);
                    if (res) orderCreated = true;
                  }
                } else {
                  // Execução via Gestão Boleta (Pontos ou Nível / Lote Fixo ou Risco $)
                  const contracts = mgmt.contracts;
                  const slPrice = mgmt.slPrice;
                  const tpPrice = mgmt.tpPrice;

                  const res = await createReportAction({
                    strategy_id: manualStratId,
                    strategy_name: fullDesc,
                    instance_id: activePanel?.instance_id || 'painel_principal',
                    side: evalRes.side,
                    entry_price: entryPrice,
                    stop_loss: slPrice,
                    take_profit: tpPrice,
                    exit_price: null,
                    status: 'Em Andamento',
                    description: `${fullDesc} (${contracts}x @ ${entryPrice.toFixed(2)}) [${acc.account_name}]`,
                    panel_id: activePanel?.id || null,
                    contrato: contracts,
                    account_id: acc.id
                  });
                  if (res) orderCreated = true;
                }

                if (addLog) {
                  addLog(
                    'ROBÔ',
                    `⚡ Gatilho de Desenho Executado [Conta: ${acc.account_name}]: ${fullDesc} -> Ordem de ${evalRes.side} @ ${entryPrice.toFixed(2)}`,
                    'sistema'
                  );
                }

                // ✅ Marcar o desenho para exclusão após abertura de posição bem-sucedida
                if (orderCreated) {
                  drawingsToDelete.push(drawing.id);
                  hasUpdates = true;
                }
              } catch (err) {
                console.error(`[DESENHO TRIGGER BG] Erro ao enviar ordem para conta ${acc.account_name}:`, err);
              }
            }
          }

          // Aplicar exclusões dos desenhos que abriram posição com sucesso
          if (drawingsToDelete.length > 0) {
            accDrawings = accDrawings.filter(d => !drawingsToDelete.includes(d.id));
            hasUpdates = true;
          }

          if (hasUpdates) {
            localStorage.setItem(key, JSON.stringify(accDrawings));
            if (acc.id === activeAccountId) {
              setDrawings([...accDrawings]);
            }
          }
        } catch (err) {
          console.error('[DESENHO TRIGGER BG] Erro na avaliação de desenhos:', err);
        }
      }
    };
    processAccountDrawings();
  }, [candles, accounts, currentSymbol, activeAccountId, activePanel, forces, createReportAction, addLog]);

  const handleFinishDrawing = (newDrawing: DrawingItem) => {
    const drawingWithAccount: DrawingItem = {
      ...newDrawing,
      accountId: activeAccountId
    };
    setDrawings(prev => [...prev, drawingWithAccount]);
    setActiveDrawingTool(null);
    setSelectedDrawingId(drawingWithAccount.id);
  };

  const handleUpdateDrawing = (updated: DrawingItem) => {
    setDrawings(prev => prev.map(d => d.id === updated.id ? updated : d));
    if (editingDrawing && editingDrawing.id === updated.id) {
      setEditingDrawing(updated);
    }
  };

  const handleDeleteDrawing = (id: string) => {
    setDrawings(prev => prev.filter(d => d.id !== id));
    if (selectedDrawingId === id) setSelectedDrawingId(null);
    if (editingDrawing?.id === id) setEditingDrawing(null);
  };

  const handleClearAllDrawings = () => {
    if (window.confirm('Deseja realmente excluir todos os desenhos deste gráfico para a conta atual?')) {
      setDrawings([]);
      setSelectedDrawingId(null);
      setEditingDrawing(null);
    }
  };

  const handleOpenDrawingSettings = (drawing: DrawingItem) => {
    setEditingDrawing(drawing);
    setIsDrawingSettingsOpen(true);
  };

  // Drag Resizer for Dock Height
  const handleMouseDownSplitter = (e: React.MouseEvent) => {
    const startY = e.clientY;
    const startHeight = dockHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.max(30, Math.min(550, startHeight + deltaY));
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

  const isBlackTheme = currentTheme === 'black' || currentTheme === 'ninja_black';
  const isSlateTheme = currentTheme === 'slate' || currentTheme === 'cinza_escuro' || currentTheme === 'ninja_slate';
  const isMidnightTheme = currentTheme === 'midnight' || currentTheme === 'azul_noturno' || currentTheme === 'ninja_carbon' || currentTheme === 'ninja_midnight';
  const isLightTheme = currentTheme === 'light' || currentTheme === 'cinza_grafite' || currentTheme === 'ninja_light';

  const wsRootBg = isBlackTheme
    ? 'bg-[#000000]'
    : isSlateTheme
    ? 'bg-[#1a1f2c]'
    : isMidnightTheme
    ? 'bg-[#070e20]'
    : 'bg-[#1a1f2c] text-slate-100';

  const wsHeaderBg = isBlackTheme
    ? 'bg-[#09090b] border-zinc-800 text-white'
    : isSlateTheme
    ? 'bg-[#222838] border-slate-700 text-slate-100'
    : isMidnightTheme
    ? 'bg-[#0d1a38] border-blue-900/60 text-slate-100'
    : 'bg-[#222838] border-slate-700 text-slate-100';

  const wsInputBg = isBlackTheme
    ? 'bg-black border-zinc-800 text-white'
    : isSlateTheme || isLightTheme
    ? 'bg-[#2a3244] border-slate-600 text-slate-100'
    : isMidnightTheme
    ? 'bg-[#070e20] border-blue-900/60 text-slate-100'
    : 'bg-[#2a3244] border-slate-600 text-slate-100';

  const wsBtnBg = isBlackTheme
    ? 'bg-[#18181b] border-zinc-800 text-slate-300 hover:text-white'
    : isSlateTheme || isLightTheme
    ? 'bg-[#2a3244] border-slate-600 text-slate-200 hover:bg-[#38435b] hover:text-white'
    : isMidnightTheme
    ? 'bg-[#152244] border-blue-900/60 text-slate-300 hover:text-white'
    : 'bg-[#2a3244] border-slate-600 text-slate-200 hover:bg-[#38435b] hover:text-white';

  const boletaTargetPanel = isBoletaAssetLocked ? activePanel : (focusedPanel || activePanel);
  const boletaSnapshot = getPanelSnapshot ? getPanelSnapshot(boletaTargetPanel?.id || pKey) : null;
  const boletaSymbol = boletaTargetPanel?.name || currentSymbol;
  const boletaCandles = boletaSnapshot?.candles || candles || [];
  const rawBoletaPrice = boletaSnapshot?.marketData?.price && boletaSnapshot.marketData.price !== '--'
    ? parseFloat(String(boletaSnapshot.marketData.price).replace(/[^\d.-]/g, ''))
    : null;
  const boletaPrice = (rawBoletaPrice && !isNaN(rawBoletaPrice) && rawBoletaPrice > 0)
    ? rawBoletaPrice
    : (boletaCandles.length > 0 ? boletaCandles[boletaCandles.length - 1].close : currentPrice);

  const activePositionForSymbol = useMemo(() => {
    if (!reports || !Array.isArray(reports)) return null;
    return reports.find((r: any) =>
      r.status === 'Em Andamento' &&
      (r.ativo === boletaSymbol || r.ativo?.toLowerCase() === boletaSymbol?.toLowerCase())
    );
  }, [reports, boletaSymbol]);

  const pnlFormatted = useMemo(() => {
    if (!activePositionForSymbol) return '';
    const pnl = activePositionForSymbol.pnl_pontos;
    if (typeof pnl === 'number') {
      const sign = pnl >= 0 ? '+' : '';
      return `${sign}${pnl.toFixed(1)} pts`;
    }
    return '';
  }, [activePositionForSymbol]);

  return (
    <div className={`w-full ${isMobile ? 'h-[calc(100vh-70px)]' : 'h-[calc(100vh-20px)]'} ${wsRootBg} flex flex-col font-sans overflow-hidden transition-colors duration-200`}>
      {/* Mobile Top Compact Toolbar */}
      {isMobile ? (
        <div className={`${wsHeaderBg} border-b px-2 py-1 h-10 flex items-center justify-between select-none shrink-0 relative z-50`}>
          <div className="flex items-center gap-1.5">
            <div className={`flex items-center gap-1 ${wsInputBg} border px-2 py-0.5 rounded-lg`}>
              <span className="text-xs">📈</span>
              <select
                value={focusedSlot.panelId || ''}
                onChange={(e) => updateSlotByIndex(effectiveFocusedIdx, s => ({ ...s, panelId: e.target.value }))}
                className="bg-transparent text-xs font-black outline-none cursor-pointer text-blue-300 max-w-[105px] truncate"
              >
                {panels?.map((p: any) => {
                  const cleanName = p.name ? p.name.replace(/\s*\([^)]*\)/g, '').trim() : 'Painel';
                  return (
                    <option key={p.id} value={p.id} className="bg-[#181d28]">
                      {cleanName}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className={`flex items-center gap-0.5 ${wsInputBg} border px-1.5 py-0.5 rounded-lg`}>
              <span className="text-[10px] text-slate-400">⏱️</span>
              <select
                value={focusedSlot.timeframe}
                onChange={(e) => updateSlotByIndex(effectiveFocusedIdx, s => ({ ...s, timeframe: Number(e.target.value) }))}
                className="bg-transparent text-xs font-bold text-blue-400 outline-none cursor-pointer"
              >
                <option value={1} className="bg-[#181d28]">1m</option>
                <option value={2} className="bg-[#181d28]">2m</option>
                <option value={3} className="bg-[#181d28]">3m</option>
                <option value={5} className="bg-[#181d28]">5m</option>
                <option value={10} className="bg-[#181d28]">10m</option>
                <option value={15} className="bg-[#181d28]">15m</option>
                <option value={30} className="bg-[#181d28]">30m</option>
                <option value={60} className="bg-[#181d28]">1h</option>
                <option value={1440} className="bg-[#181d28]">1D</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFitChartTrigger(prev => prev + 1)}
              className="border border-amber-500/60 font-mono font-black text-xs text-amber-400 px-2 py-0.5 rounded-lg bg-amber-950/30 active:scale-95"
              title="Alinhar Gráfico e Escala (NinjaTrader 8 - Botão F)"
            >
              F
            </button>

            <button
              type="button"
              onClick={() => setIsIndicatorsModalOpen(true)}
              className="bg-blue-600/20 border border-blue-500/40 text-blue-300 px-2 py-0.5 rounded-lg text-xs font-bold active:scale-95 flex items-center gap-0.5"
              title="Gerenciar Indicadores"
            >
              <span>📊</span>
              <span className="text-[9px] bg-blue-900 px-1 rounded-full">{focusedVisibleIndicators.length}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsMobileBoletaOpen(true)}
              className="bg-emerald-600 border border-emerald-500 text-white px-2 py-0.5 rounded-lg text-xs font-bold active:scale-95 shadow"
              title="Abrir Boleta de Operações"
            >
              📋
            </button>

            <button
              type="button"
              onClick={() => setPanelMode && setPanelMode('mode1')}
              className={`${wsBtnBg} px-2 py-0.5 rounded-lg text-xs font-semibold border active:scale-95`}
              title="Voltar ao Painel 1"
            >
              ↩️
            </button>
          </div>
        </div>
      ) : (
      /* Top Workstation Header Toolbar - Single-Line Compact Modern Header */
      <div className={`${wsHeaderBg} border-b px-3 py-1.5 h-11 flex items-center justify-between gap-2.5 select-none shrink-0 relative z-50 transition-colors duration-200`}>
        {/* Left Section: Clean Asset Selector, Timeframe Dropdown & Indicators */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Asset Panel Selector (Atua no gráfico focado) */}
          <div className={`flex items-center gap-1.5 ${wsInputBg} border px-2.5 py-1 rounded-lg`} title={chartLayout !== 'single' ? `Ativo do Gráfico ${effectiveFocusedIdx + 1} (Focado)` : 'Ativo / Painel'}>
            <span className="text-sm">📈</span>
            <select
              value={focusedSlot.panelId || ''}
              onChange={(e) => updateSlotByIndex(effectiveFocusedIdx, s => ({ ...s, panelId: e.target.value }))}
              className="bg-transparent text-xs font-black outline-none cursor-pointer"
            >
              {panels?.map((p: any) => {
                const cleanName = p.name ? p.name.replace(/\s*\([^)]*\)/g, '').trim() : 'Painel';
                return (
                  <option key={p.id} value={p.id} className="bg-[#181d28]">
                    {cleanName}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Timeframe Dropdown Selector (Atua no gráfico focado) */}
          <div className={`flex items-center gap-1 ${wsInputBg} border px-2 py-1 rounded-lg`}>
            <span className="text-[11px] text-slate-400">⏱️</span>
            <select
              value={focusedSlot.timeframe}
              onChange={(e) => updateSlotByIndex(effectiveFocusedIdx, s => ({ ...s, timeframe: Number(e.target.value) }))}
              className="bg-transparent text-xs font-bold text-blue-400 outline-none cursor-pointer"
              title="Seletor de Timeframe do Gráfico Focado"
            >
              <option value={1} className="bg-[#181d28] text-slate-200">1m</option>
              <option value={2} className="bg-[#181d28] text-slate-200">2m</option>
              <option value={3} className="bg-[#181d28] text-slate-200">3m</option>
              <option value={5} className="bg-[#181d28] text-slate-200">5m</option>
              <option value={10} className="bg-[#181d28] text-slate-200">10m</option>
              <option value={15} className="bg-[#181d28] text-slate-200">15m</option>
              <option value={30} className="bg-[#181d28] text-slate-200">30m</option>
              <option value={60} className="bg-[#181d28] text-slate-200">1h</option>
              <option value={240} className="bg-[#181d28] text-slate-200">4h</option>
              <option value={1440} className="bg-[#181d28] text-slate-200">1D</option>
            </select>
          </div>

          {/* Indicators Modal Trigger */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsIndicatorsModalOpen(true)}
              className="bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer"
              title="Gerenciar Indicadores e Templates"
            >
              <span>📊</span>
              <span className="bg-blue-900 text-blue-200 px-1.5 py-0.2 rounded-full text-[10px]">
                {focusedVisibleIndicators.length}
              </span>
            </button>
            <button
              onClick={handleApplyDefaultTemplate}
              className="bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/40 text-amber-300 hover:text-amber-200 px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer active:scale-95 shadow"
              title="Carregar Template Padrão do Painel 2"
            >
              <span>⭐</span>
            </button>
          </div>

          {/* Widgets Modal Trigger */}
          <button
            onClick={() => setIsWidgetsModalOpen(true)}
            className="bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer shadow"
            title="Gerenciar Widgets e Cards Flutuantes do Gráfico"
          >
            <span>🧩</span>
            <span className="bg-purple-900 text-purple-200 px-1.5 py-0.2 rounded-full text-[10px]">
              {activeWidgets.filter(w => w.visible).length}
            </span>
          </button>

          {/* Drawings Tool Selector Button / Listbox */}
          <div className="relative">
            <button
              onClick={() => setIsDrawingsMenuOpen(!isDrawingsMenuOpen)}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer shadow ${
                activeDrawingTool
                  ? 'bg-amber-600 text-white border border-amber-400 animate-pulse'
                  : 'bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300'
              }`}
              title="Ferramentas de Desenho Técnico e Automação de Ordens ao Toque"
            >
              <span>✏️</span>
              {drawings.length > 0 && (
                <span className="bg-emerald-900 text-emerald-200 px-1.5 py-0.2 rounded-full text-[10px]">
                  {drawings.length}
                </span>
              )}
              <span className="text-[9px]">▼</span>
            </button>

            {isDrawingsMenuOpen && (
              <>
                {/* Backdrop invisível para fechar ao clicar fora */}
                <div 
                  className="fixed inset-0 z-[99990]" 
                  onClick={() => setIsDrawingsMenuOpen(false)} 
                />

                <div className="absolute top-full left-0 mt-1.5 w-60 bg-[#1e2430] border border-slate-700 rounded-xl shadow-2xl z-[99999] p-1.5 space-y-1 font-sans text-xs animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2 py-1 text-[10px] font-extrabold uppercase text-slate-400 tracking-wider flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1">
                    <span>Ferramentas de Desenho</span>
                    <button
                      onClick={() => setIsDrawingsMenuOpen(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>

                  <button
                    onClick={() => { setActiveDrawingTool('horizontal_line'); setIsDrawingsMenuOpen(false); }}
                    className="w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2.5 text-slate-200 font-bold text-left transition cursor-pointer"
                  >
                    <span className="text-base">➖</span>
                    <div>
                      <div className="text-xs">Linha Horizontal</div>
                      <div className="text-[9px] text-slate-400 font-normal">Preenche toda a extensão do gráfico</div>
                    </div>
                  </button>

                  <button
                    onClick={() => { setActiveDrawingTool('trend_line'); setIsDrawingsMenuOpen(false); }}
                    className="w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2.5 text-slate-200 font-bold text-left transition cursor-pointer"
                  >
                    <span className="text-base">📈</span>
                    <div>
                      <div className="text-xs">Linha de Tendência (LTA / LTB)</div>
                      <div className="text-[9px] text-slate-400 font-normal">Conecta dois pontos no gráfico</div>
                    </div>
                  </button>

                  <button
                    onClick={() => { setActiveDrawingTool('rectangle'); setIsDrawingsMenuOpen(false); }}
                    className="w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2.5 text-slate-200 font-bold text-left transition cursor-pointer"
                  >
                    <span className="text-base">🔲</span>
                    <div>
                      <div className="text-xs">Retângulo (Região)</div>
                      <div className="text-[9px] text-slate-400 font-normal">Zonas de suporte e resistência</div>
                    </div>
                  </button>

                  <button
                    onClick={() => { setActiveDrawingTool('fibonacci'); setIsDrawingsMenuOpen(false); }}
                    className="w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2.5 text-slate-200 font-bold text-left transition cursor-pointer"
                  >
                    <span className="text-base">📐</span>
                    <div>
                      <div className="text-xs">Retração de Fibonacci</div>
                      <div className="text-[9px] text-slate-400 font-normal">Níveis de 0% a 100% (61.8%)</div>
                    </div>
                  </button>

                  <button
                    onClick={() => { setActiveDrawingTool('channel'); setIsDrawingsMenuOpen(false); }}
                    className="w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2.5 text-slate-200 font-bold text-left transition cursor-pointer"
                  >
                    <span className="text-base">🛤️</span>
                    <div>
                      <div className="text-xs">Canal de Tendência</div>
                      <div className="text-[9px] text-slate-400 font-normal">Canais paralelos com offset e zonas</div>
                    </div>
                  </button>

                  <div className="pt-1 border-t border-slate-800">
                    <span className="px-2 text-[9px] font-black uppercase text-slate-400 tracking-wider">Anotações & Medições</span>
                  </div>

                  <button
                    onClick={() => { setActiveDrawingTool('text'); setIsDrawingsMenuOpen(false); }}
                    className="w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2.5 text-slate-200 font-bold text-left transition cursor-pointer"
                  >
                    <span className="text-base">💬</span>
                    <div>
                      <div className="text-xs">Elemento de Texto</div>
                      <div className="text-[9px] text-slate-400 font-normal">Inserir anotações e rótulos no gráfico</div>
                    </div>
                  </button>

                  <button
                    onClick={() => { setActiveDrawingTool('arrow'); setIsDrawingsMenuOpen(false); }}
                    className="w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2.5 text-slate-200 font-bold text-left transition cursor-pointer"
                  >
                    <span className="text-base">⚡</span>
                    <div>
                      <div className="text-xs">Zigue-Zague com Flecha</div>
                      <div className="text-[9px] text-slate-400 font-normal">Linhas contínuas com ponta de seta</div>
                    </div>
                  </button>

                  <button
                    onClick={() => { setActiveDrawingTool('ruler'); setIsDrawingsMenuOpen(false); }}
                    className="w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2.5 text-slate-200 font-bold text-left transition cursor-pointer"
                  >
                    <span className="text-base">📏</span>
                    <div>
                      <div className="text-xs">Régua de Medição</div>
                      <div className="text-[9px] text-slate-400 font-normal">Conta candles e variação em pontos</div>
                    </div>
                  </button>

                  {drawings.length > 0 && (
                    <div className="pt-1.5 border-t border-slate-800">
                      <button
                        onClick={() => { handleClearAllDrawings(); setIsDrawingsMenuOpen(false); }}
                        className="w-full px-2.5 py-1.5 rounded-lg hover:bg-rose-950/80 text-rose-400 font-bold text-left transition flex items-center gap-2 text-[11px] cursor-pointer"
                      >
                        <span>🗑️</span>
                        <span>Limpar Todos ({drawings.length})</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* History Lookback Selector */}
          <div className={`flex items-center gap-1.5 ${wsInputBg} border px-2 py-1 rounded-lg text-xs shrink-0`}>
            <span className="text-[11px] text-slate-400 font-semibold">📅</span>
            <select
              value={settings?.chart_history_days || 7}
              onChange={(e) => {
                const nextDays = Number(e.target.value);
                saveSettings({ chart_history_days: nextDays });
                if (refreshMarketData) {
                  refreshMarketData({ chart_history_days: nextDays });
                }
              }}
              className="bg-transparent text-xs font-bold text-blue-400 outline-none cursor-pointer"
              title="Histórico de velas carregadas do banco de dados / NinjaTrader local"
            >
              <option value={3} className="bg-[#181d28] text-slate-200">3 Dias</option>
              <option value={7} className="bg-[#181d28] text-slate-200">7 Dias</option>
              <option value={15} className="bg-[#181d28] text-slate-200">15 Dias</option>
              <option value={30} className="bg-[#181d28] text-slate-200">30 Dias</option>
            </select>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (refreshMarketData) refreshMarketData();
              }}
              className="p-0.5 hover:bg-slate-700/60 rounded text-slate-400 hover:text-cyan-300 transition active:scale-95"
              title="Sincronizar e preencher lacunas de velas (Gaps) com o histórico completo"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Right Section: Action Controls [IA, R, C, S, ROBÔS, F, BOLETA, Standard] */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Botão IA (Validação IA para ordens manuais) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const nextVal = !settings?.chart_manual_ia_validate;
              saveSettings({ chart_manual_ia_validate: nextVal });
              if (nextVal) {
                alert("🤖 Validação Inteligente Ativada!\nAs operações manuais abertas a partir de agora só serão executadas se a IA confirmar a confluência técnica no template ativo.");
              }
            }}
            className={`px-2 py-1 rounded-lg border font-bold transition active:scale-95 cursor-pointer flex items-center gap-0.5 text-xs shadow ${
              settings?.chart_manual_ia_validate
                ? 'border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700'
                : 'border-red-500 bg-red-600 text-white hover:bg-red-700'
            }`}
            title={settings?.chart_manual_ia_validate ? 'Validar entrada com IA (Ativo)' : 'Validar entrada com IA (Inativo)'}
          >
            IA
          </button>

          {/* Botão R (Reset Scale / Reenquadrar) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setResetViewTrigger(prev => prev + 1);
            }}
            className={`px-2 py-1 rounded-lg ${wsBtnBg} border transition active:scale-95 cursor-pointer font-bold text-xs shadow`}
            title="Reenquadrar o gráfico (Reset View) [Ctrl+R]"
          >
            R
          </button>

          {/* Botão C (Auto-Center no gráfico focado) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              updateSlotByIndex(effectiveFocusedIdx, s => ({ ...s, autoCenter: !s.autoCenter }));
            }}
            className={`px-2 py-1 rounded-lg border font-bold transition active:scale-95 cursor-pointer flex items-center gap-0.5 text-xs shadow ${
              focusedSlot.autoCenter
                ? 'border-yellow-500 bg-yellow-950/60 text-yellow-400 hover:bg-yellow-900/60'
                : `${wsBtnBg}`
            }`}
            title={focusedSlot.autoCenter ? 'Desativar Auto-Center [Ctrl+C]' : 'Centralizar preço atual no meio do gráfico (Auto-Center) [Ctrl+C]'}
          >
            C
          </button>

          {/* Botão I (Ocultar/Exibir Legenda de Indicadores no gráfico focado) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              updateSlotByIndex(effectiveFocusedIdx, s => ({ ...s, showIndicatorsLegend: !s.showIndicatorsLegend }));
            }}
            className={`px-2 py-1 rounded-lg border font-bold transition active:scale-95 cursor-pointer flex items-center gap-0.5 text-xs shadow ${
              focusedSlot.showIndicatorsLegend
                ? 'border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-700'
                : `${wsBtnBg}`
            }`}
            title={focusedSlot.showIndicatorsLegend ? 'Ocultar legenda de indicadores no gráfico [Ctrl+I]' : 'Mostrar legenda de indicadores no gráfico [Ctrl+I]'}
          >
            I
          </button>

          {/* Botão S (Show/Hide Trade Markers & Lines no gráfico focado) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              updateSlotByIndex(effectiveFocusedIdx, s => ({ ...s, showTradeMarkers: !s.showTradeMarkers }));
            }}
            className={`px-2 py-1 rounded-lg border font-bold transition active:scale-95 cursor-pointer flex items-center gap-0.5 text-xs shadow ${
              focusedSlot.showTradeMarkers
                ? 'border-blue-500 bg-blue-600 text-white hover:bg-blue-700'
                : 'border-red-500 bg-red-600 text-white hover:bg-red-700'
            }`}
            title={focusedSlot.showTradeMarkers ? 'Ocultar setas e legendas de posições [Ctrl+S]' : 'Mostrar setas e legendas de posições [Ctrl+S]'}
          >
            S
          </button>

          {/* Botão O (Show/Hide Order Price Lines no gráfico focado) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              updateSlotByIndex(effectiveFocusedIdx, s => ({ ...s, showOrderLines: s.showOrderLines === false ? true : false }));
            }}
            className={`px-2 py-1 rounded-lg border font-bold transition active:scale-95 cursor-pointer flex items-center gap-0.5 text-xs shadow ${
              focusedSlot.showOrderLines !== false
                ? 'border-blue-500 bg-blue-600 text-white hover:bg-blue-700'
                : 'border-red-500 bg-red-600 text-white hover:bg-red-700'
            }`}
            title={focusedSlot.showOrderLines !== false ? 'Ocultar linhas de ordens abertas neste gráfico' : 'Mostrar linhas de ordens abertas neste gráfico'}
          >
            O
          </button>

          {/* Botão H (Show/Hide Bottom Dock: Ordens Ativas, Pendentes e Histórico) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleBottomDock();
            }}
            className={`px-2 py-1 rounded-lg border font-bold transition active:scale-95 cursor-pointer flex items-center justify-center text-xs shadow ${
              showBottomDock
                ? 'border-cyan-500 bg-cyan-600 text-white hover:bg-cyan-700'
                : `${wsBtnBg}`
            }`}
            title={showBottomDock ? 'Ocultar Painel Inferior (Ordens e Histórico) [Ctrl+H]' : 'Mostrar Painel Inferior (Ordens e Histórico) [Ctrl+H]'}
          >
            H
          </button>

          {/* NinjaTrader Fit Button [F] */}
          <button
            onClick={() => setFitChartTrigger(prev => prev + 1)}
            className={`border border-amber-500/60 font-mono font-black text-xs text-amber-400 px-2 py-1 rounded-lg transition active:scale-95 shadow flex items-center justify-center cursor-pointer ${isBlackTheme ? 'bg-slate-900 hover:bg-slate-800' : 'bg-[#2a3244] hover:bg-[#38435b]'}`}
            title="Alinhar Gráfico e Escala (NinjaTrader 8 - Botão F) [Ctrl+F]"
          >
            F
          </button>

          {/* Botão Robôs (🤖) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              updateSlotByIndex(effectiveFocusedIdx, s => ({ ...s, showRobots: !s.showRobots }));
            }}
            className={`px-2 py-1 rounded-lg border font-bold transition active:scale-95 cursor-pointer flex items-center justify-center text-xs shadow ${
              focusedSlot.showRobots
                ? 'border-purple-500 bg-purple-600 text-white hover:bg-purple-700'
                : `${wsBtnBg}`
            }`}
            title={focusedSlot.showRobots ? 'Ocultar Painel de Robôs' : 'Mostrar Painel de Robôs'}
          >
            🤖
          </button>

          {/* Seletor de Layouts Multi-Gráfico e Templates */}
          <LayoutSelectorMenu
            currentLayout={chartLayout}
            onSelectLayout={handleSelectLayout}
            onResetRatios={handleResetRatios}
            templates={workspaceTemplates}
            onSaveTemplate={handleSaveWorkspaceTemplate}
            onLoadTemplate={handleLoadWorkspaceTemplate}
            onDeleteTemplate={handleDeleteWorkspaceTemplate}
            wsBtnBg={wsBtnBg}
          />

          {/* Cadeado da Boleta (Travar ativo na Boleta no modo Multi-Gráfico) */}
          {chartLayout !== 'single' && !isRightBoletaCollapsed && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsBoletaAssetLocked(prev => !prev);
              }}
              className={`px-2 py-1 rounded-lg border font-bold transition active:scale-95 cursor-pointer flex items-center justify-center text-xs shadow ${
                isBoletaAssetLocked
                  ? 'border-amber-500 bg-amber-600/30 text-amber-300 hover:bg-amber-600/50'
                  : wsBtnBg
              }`}
              title={
                isBoletaAssetLocked
                  ? `Boleta travada no ativo principal (${currentSymbol}). Clique para seguir o gráfico focado.`
                  : `Boleta seguindo o gráfico focado (${boletaSymbol}). Clique para travar no ativo principal.`
              }
            >
              {isBoletaAssetLocked ? '🔒' : '🔓'}
            </button>
          )}

          {/* Botão Boleta (📋) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleRightBoleta();
            }}
            className={`px-2 py-1 rounded-lg border font-bold transition active:scale-95 cursor-pointer flex items-center justify-center text-xs shadow ${
              !isRightBoletaCollapsed
                ? (isBoletaFloating ? 'border-cyan-500 bg-cyan-600/90 text-white hover:bg-cyan-700' : 'border-emerald-500 bg-emerald-600/90 text-white hover:bg-emerald-700')
                : `${wsBtnBg}`
            }`}
            title={
              !isRightBoletaCollapsed
                ? (isBoletaFloating ? 'Boleta Flutuante Ativa (Clique para ocultar) [Ctrl+B]' : 'Ocultar Boleta Lateral [Ctrl+B]')
                : 'Mostrar Boleta [Ctrl+B]'
            }
          >
            📋
          </button>

          {/* Switch back to Mode 1 (Standard) */}
          <button
            onClick={() => setPanelMode && setPanelMode('mode1')}
            className={`${wsBtnBg} px-2 py-1 rounded-lg text-xs font-semibold transition border flex items-center justify-center active:scale-95 cursor-pointer shrink-0`}
            title="Alternar para Modo 1 (Painel Standard)"
          >
            ↩️
          </button>
        </div>
      </div>
      )}

      {/* Main Area (Left Column: Chart + Drag Splitter + Dock | Right Column: Full Height Boleta) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Container */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Main Chart Area (Single ou Multi-Gráficos com Splitters Arrastáveis) */}
          <div ref={chartContainerRef} className={`flex-1 relative ${isLightTheme ? 'bg-[#ffffff]' : 'bg-[#000000]'} overflow-hidden transition-colors duration-200`}>
            <TradeChartGrid
              layout={isMobile ? 'single' : chartLayout}
              ratios={splitRatios}
              onChangeRatios={handleChangeRatios}
              maximizedSlotIndex={maximizedSlotIndex}
              isBlackTheme={isBlackTheme}
              isLightTheme={isLightTheme}
              renderSlot={(slotIdx) => {
                const slotCfg = getEffectiveSlot(slotIdx);
                const isSlotFocused = effectiveFocusedIdx === slotIdx;
                const isSlotMulti = chartLayout !== 'single';
                return (
                  <TradeChartSlot
                    key={slotCfg.id}
                    slot={slotCfg}
                    isMultiChart={isSlotMulti}
                    isFocused={isSlotFocused}
                    isMaximized={maximizedSlotIndex === slotIdx}
                    onFocus={() => setFocusedSlotIndex(slotIdx)}
                    onToggleMaximize={() =>
                      setMaximizedSlotIndex(prev => (prev === slotIdx ? null : slotIdx))
                    }
                    onChangePanel={(nextPanelId) =>
                      updateSlotByIndex(slotIdx, s => ({ ...s, panelId: nextPanelId }))
                    }
                    onChangeTimeframe={(nextTf) =>
                      updateSlotByIndex(slotIdx, s => ({ ...s, timeframe: nextTf }))
                    }
                    onEditIndicator={(ind) => {
                      setFocusedSlotIndex(slotIdx);
                      setEditingIndicatorForModal(ind);
                      setIsIndicatorsModalOpen(true);
                    }}
                    onToggleIndicatorVisibility={(indId) =>
                      updateSlotByIndex(slotIdx, s => ({
                        ...s,
                        indicators: s.indicators.map(i => i.id === indId ? { ...i, visible: !i.visible } : i)
                      }))
                    }
                    onRemoveIndicator={(indId) =>
                      updateSlotByIndex(slotIdx, s => ({
                        ...s,
                        indicators: s.indicators.filter(i => i.id !== indId)
                      }))
                    }
                    setAutoCenter={(val) =>
                      updateSlotByIndex(slotIdx, s => ({ ...s, autoCenter: val }))
                    }
                    setShowTradeMarkers={(val) =>
                      updateSlotByIndex(slotIdx, s => ({ ...s, showTradeMarkers: val }))
                    }
                    setShowIndicatorsLegend={(val) =>
                      updateSlotByIndex(slotIdx, s => ({ ...s, showIndicatorsLegend: val }))
                    }
                    setShowRobots={(val) =>
                      updateSlotByIndex(slotIdx, s => ({ ...s, showRobots: val }))
                    }
                    fitChartTrigger={fitChartTrigger}
                    resetViewTrigger={resetViewTrigger}
                    drawings={drawings}
                    onUpdateDrawing={handleUpdateDrawing}
                    onFinishDrawing={handleFinishDrawing}
                    onDeleteDrawing={handleDeleteDrawing}
                    activeDrawingTool={activeDrawingTool}
                    selectedDrawingId={selectedDrawingId}
                    onSelectDrawing={(d) => setSelectedDrawingId(d ? d.id : null)}
                    onOpenDrawingSettings={handleOpenDrawingSettings}
                    activeWidgets={activeWidgets}
                    onUpdateWidget={handleUpdateWidget}
                    onRemoveWidget={handleRemoveWidget}
                    isLightTheme={isLightTheme}
                    isBlackTheme={isBlackTheme}
                    isSlateTheme={isSlateTheme}
                    isMidnightTheme={isMidnightTheme}
                    showWidgets={isSlotFocused || !isSlotMulti}
                  />
                );
              }}
            />
          </div>

          {/* Drag Splitter Resizer (Linha Arrastável por Mouse) & Bottom Dock Panel (Apenas Desktop) */}
          {!isMobile && showBottomDock && (
            <>
              <div
                onMouseDown={handleMouseDownSplitter}
                className={`h-1.5 ${isBlackTheme ? 'bg-[#09090b] border-zinc-800' : isSlateTheme ? 'bg-[#222838] border-slate-700' : isMidnightTheme ? 'bg-[#0d1a38] border-blue-900/60' : 'bg-[#e2e8f0] border-slate-300'} hover:bg-blue-500/80 border-y cursor-row-resize flex items-center justify-center select-none transition group`}
                title="Clique e arraste verticalmente para ajustar a altura do dock"
              >
                <div className="w-12 h-1 rounded-full bg-slate-500 group-hover:bg-blue-300 transition" />
              </div>

              {/* Bottom Dock Panel with Adjustable Height */}
              <div style={{ height: `${dockHeight}px` }} className="flex-shrink-0 overflow-hidden">
                <TradeDock />
              </div>
            </>
          )}
        </div>

        {/* Right Column: Full Height Boleta Panel (Apenas Desktop quando ancorada) */}
        {!isMobile && !isRightBoletaCollapsed && !isBoletaFloating && (
          <div className="w-80 h-full flex-shrink-0 border-l border-slate-800 overflow-y-auto relative">
            <TradeBoleta
              selectedAsset={boletaSymbol}
              currentPrice={boletaPrice}
              candles={boletaCandles}
              isFloating={false}
              onToggleFloating={toggleBoletaFloating}
              onClose={toggleRightBoleta}
            />
          </div>
        )}
      </div>

      {/* Mobile Ergonomic Trading Dock (NinjaTrader / TradingView Mobile Style) */}
      {isMobile && (
        <div className="w-full bg-[#0c101d]/95 backdrop-blur-md border-t border-slate-800/90 px-2 py-1.5 flex items-center justify-between gap-1.5 shrink-0 z-40 select-none shadow-lg">
          {/* Seletor Rápido de Lote/Contratos */}
          <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-lg overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => setMobileQty(prev => Math.max(1, prev - 1))}
              className="px-2.5 py-1 text-slate-300 font-black text-sm active:bg-slate-800 hover:text-white"
            >
              -
            </button>
            <span className="px-1.5 font-mono font-black text-xs text-blue-300 min-w-[22px] text-center">
              {mobileQty}
            </span>
            <button
              type="button"
              onClick={() => setMobileQty(prev => prev + 1)}
              className="px-2.5 py-1 text-slate-300 font-black text-sm active:bg-slate-800 hover:text-white"
            >
              +
            </button>
          </div>

          {/* Botões de Ação Imediata Operacional */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setIsMobileBoletaOpen(true)}
              className="flex-1 py-1.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-black text-xs rounded-xl shadow-md active:scale-95 transition flex flex-col items-center justify-center leading-tight min-w-0"
            >
              <span className="truncate">COMPRA</span>
              <span className="text-[9px] font-mono opacity-80">{boletaPrice > 0 ? boletaPrice.toFixed(2) : 'MKT'}</span>
            </button>

            {activePositionForSymbol ? (
              <button
                type="button"
                onClick={() => setIsMobileBoletaOpen(true)}
                className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-[11px] rounded-xl shadow-md active:scale-95 transition flex flex-col items-center justify-center leading-tight shrink-0"
                title="Zerar Posição Aberta"
              >
                <span>ZERAR</span>
                <span className="text-[9px] font-mono">{pnlFormatted}</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setIsMobileBoletaOpen(true)}
              className="flex-1 py-1.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black text-xs rounded-xl shadow-md active:scale-95 transition flex flex-col items-center justify-center leading-tight min-w-0"
            >
              <span className="truncate">VENDA</span>
              <span className="text-[9px] font-mono opacity-80">{boletaPrice > 0 ? boletaPrice.toFixed(2) : 'MKT'}</span>
            </button>
          </div>

          {/* Botão Boleta / ATM Drawer */}
          <button
            type="button"
            onClick={() => setIsMobileBoletaOpen(true)}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-600/80 rounded-xl text-xs font-bold active:scale-95 transition flex flex-col items-center justify-center shrink-0"
            title="Abrir Boleta Completa (SL, TP, ATM)"
          >
            <span>📋</span>
            <span className="text-[8px] uppercase tracking-tighter">Opções</span>
          </button>
        </div>
      )}

      {/* Mobile Boleta Slide-Up Drawer */}
      {isMobile && isMobileBoletaOpen && (
        <div className="fixed inset-0 z-[9995] flex flex-col justify-end bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="absolute inset-0"
            onClick={() => setIsMobileBoletaOpen(false)}
          />
          <div className="relative w-full max-h-[86vh] bg-[#101422] border-t border-slate-700 rounded-t-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-250 z-10">
            {/* Grab Bar Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-1 rounded-full bg-slate-600" />
                <span className="text-xs font-black text-slate-200 uppercase tracking-wider">
                  📋 Boleta de Operações — {boletaSymbol}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileBoletaOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-sm font-bold active:scale-95 transition"
              >
                ✕
              </button>
            </div>

            {/* Boleta Body */}
            <div className="flex-1 overflow-y-auto p-1 custom-scrollbar">
              <TradeBoleta
                selectedAsset={boletaSymbol}
                currentPrice={boletaPrice}
                candles={boletaCandles}
                isFloating={false}
                onClose={() => setIsMobileBoletaOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Boleta Flutuante Desancorada (Móvel para qualquer lugar da tela conforme Regra 5 - Apenas Desktop) */}
      {!isMobile && !isRightBoletaCollapsed && isBoletaFloating && (
        <div
          style={{
            position: 'fixed',
            left: `${boletaPos.x}px`,
            top: `${boletaPos.y}px`,
            zIndex: 45,
            width: '305px',
            maxHeight: 'calc(100vh - 80px)'
          }}
          className="rounded-xl shadow-2xl border border-slate-700/80 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 backdrop-blur-md"
        >
          <TradeBoleta
            selectedAsset={boletaSymbol}
            currentPrice={boletaPrice}
            candles={boletaCandles}
            isFloating={true}
            onToggleFloating={toggleBoletaFloating}
            onClose={toggleRightBoleta}
            onDragStart={handleBoletaDragStart}
          />
        </div>
      )}

      {/* Indicators Manager Modal */}
      <IndicatorsManagerModal
        isOpen={isIndicatorsModalOpen}
        onClose={() => {
          setIsIndicatorsModalOpen(false);
          setEditingIndicatorForModal(null);
        }}
        initialEditingIndicator={editingIndicatorForModal}
        activeIndicators={focusedSlot.indicators}
        onAddIndicator={handleAddIndicator}
        onUpdateIndicator={handleUpdateIndicator}
        onRemoveIndicator={handleRemoveIndicator}
        onToggleVisibility={handleToggleVisibility}
        onLoadTemplate={handleLoadTemplate}
        activeWidgets={activeWidgets}
        currentTimeframe={focusedSlot.timeframe}
        onAddWidget={handleAddWidget}
        onRemoveWidget={handleRemoveWidget}
        onToggleWidgetVisibility={handleToggleWidgetVisibility}
        onResetWidgetPositions={handleResetWidgetPositions}
      />

      {/* Widgets Manager Modal */}
      <WidgetsManagerModal
        isOpen={isWidgetsModalOpen}
        onClose={() => setIsWidgetsModalOpen(false)}
        activeWidgets={activeWidgets}
        onAddWidget={handleAddWidget}
        onToggleVisibility={handleToggleWidgetVisibility}
        onRemoveWidget={handleRemoveWidget}
        onResetPositions={handleResetWidgetPositions}
      />

      {/* Modal de Configurações e Automação de Desenhos */}
      <DrawingSettingsModal
        isOpen={isDrawingSettingsOpen}
        onClose={() => setIsDrawingSettingsOpen(false)}
        drawing={editingDrawing}
        onUpdateDrawing={handleUpdateDrawing}
        onDeleteDrawing={handleDeleteDrawing}
      />
    </div>
  );
};

TradeWorkstation.displayName = 'TradeWorkstation';
