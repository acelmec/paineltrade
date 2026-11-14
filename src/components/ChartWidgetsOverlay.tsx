import React, { useState, useEffect } from 'react';
import {
  type WidgetConfig,
  MOMENTUM_ASSETS
} from '../utils/widgetRegistry';
import { useApp } from '../context/AppContext';
import { getStreamerBlockTrades, fetchStreamerBlockTrades } from '../services/vortexStreamer';
import type { BlockTrade } from '../services/db';
import {
  GrixCoreAnalyticsView,
  GrixAnchorsView,
  GrixFlowExposureView,
  GrixStockReplacementView,
  ProjecaoView
} from './GrixCards';
import { GammaQuantMapView } from './GammaQuantMapView';
import { WyckoffStructuralRadarView } from './WyckoffStructuralRadarView';
import { MarketMatrixWidget } from './MarketMatrixWidget';
import {
  subscribeMarketMatrix,
  getCachedMarketMatrixData,
  convertMarketMatrixToOptionsMarket,
  type MarketMatrixData
} from '../services/marketMatrixService';

interface ChartWidgetsOverlayProps {
  widgets: WidgetConfig[];
  onUpdateWidget: (updated: WidgetConfig) => void;
  onRemoveWidget: (id: string) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  overrideMarketData?: any | null;
  overrideForces?: any[] | null;
  overrideGammaLevels?: any | null;
  overrideAxionRadar?: any | null;
  isReplayMode?: boolean;
}

export const ChartWidgetsOverlay: React.FC<ChartWidgetsOverlayProps> = ({
  widgets,
  onUpdateWidget,
  onRemoveWidget,
  containerRef,
  overrideMarketData,
  overrideForces,
  overrideGammaLevels,
  overrideAxionRadar,
  isReplayMode = false
}) => {
  const appContext = useApp();
  const liveMarketData = appContext?.marketData;
  const activePanel = appContext?.activePanel;
  const settings = appContext?.settings;
  const liveForces = appContext?.forces;
  const forcesConfig = appContext?.forcesConfig;
  const toggleForceConfig = appContext?.toggleForceConfig;
  const liveGammaLevels = appContext?.gammaLevels;
  const optionsMarket = appContext?.optionsMarket;
  const windowMinutes = appContext?.windowMinutes;
  const setWindowMinutes = appContext?.setWindowMinutes;
  const windowBaseline = appContext?.windowBaseline;

  // Integração com feed em tempo real do NinjaFeed / Grix (MarketMatrixService)
  const [liveMatrixData, setLiveMatrixData] = useState<MarketMatrixData | null>(getCachedMarketMatrixData());

  useEffect(() => {
    const unsub = subscribeMarketMatrix((data) => {
      setLiveMatrixData(data);
    });
    return () => unsub();
  }, []);

  // Se houver feed da Grix ativo, converte para OptionsMarketData automaticamente (fallback para banco se ausente)
  const effectiveOptionsMarket = React.useMemo(() => {
    if (liveMatrixData) {
      return convertMarketMatrixToOptionsMarket(liveMatrixData);
    }
    return optionsMarket;
  }, [liveMatrixData, optionsMarket]);

  // Resolução dinâmica: se estiver em Replay, prioriza overrides dos dados históricos simulados
  const marketData = overrideMarketData !== undefined ? overrideMarketData : liveMarketData;
  const forces = overrideForces !== undefined ? overrideForces : liveForces;
  const gammaLevels = overrideGammaLevels !== undefined ? overrideGammaLevels : liveGammaLevels;

  // Block Trades em tempo real alimentados ativamente do NinjaTrader 8 local (:8002)
  const [nt8BlockTrades, setNt8BlockTrades] = useState<BlockTrade[]>([]);
  useEffect(() => {
    if (isReplayMode) return; // No modo Replay, não faz polling de trades em tempo real do NT8

    let isSubscribed = true;

    const pollLocalTrades = async () => {
      try {
        const trades = await fetchStreamerBlockTrades(activePanel, settings);
        if (isSubscribed && Array.isArray(trades) && trades.length > 0) {
          setNt8BlockTrades(trades);
        }
      } catch (_) {}
    };

    pollLocalTrades();
    const interval = setInterval(pollLocalTrades, 1500);

    const handleLocalTrade = (e: any) => {
      if (e.detail && isSubscribed) {
        setNt8BlockTrades(prev => {
          const k = `${e.detail.time}_${e.detail.price}_${e.detail.volume}_${e.detail.side}`;
          const exists = prev.some(t => `${t.time}_${t.price}_${t.volume}_${t.side}` === k);
          if (exists) return prev;
          return [...prev, e.detail].slice(-500);
        });
      }
    };
    window.addEventListener('vortex_local_block_trade', handleLocalTrade);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
      window.removeEventListener('vortex_local_block_trade', handleLocalTrade);
    };
  }, [activePanel, settings, isReplayMode]);

  // Active dragging state
  const [draggingWidgetId, setDraggingWidgetId] = useState<string | null>(null);
  const [activeSettingsWidgetId, setActiveSettingsWidgetId] = useState<string | null>(null);
  const [topWidgetId, setTopWidgetId] = useState<string | null>(null);

  // Estado em tempo real do Radar Axion ML (lido do window e localStorage)
  const [liveAxionRadar, setLiveAxionRadar] = useState<any>(() => {
    if (typeof window !== 'undefined' && (window as any).__vortex_axion_ml_radar) {
      return (window as any).__vortex_axion_ml_radar;
    }
    try {
      for (let k = 0; k < localStorage.length; k++) {
        const key = localStorage.key(k);
        if (key && key.startsWith('vortex_axion_ml_radar_')) {
          const raw = localStorage.getItem(key);
          if (raw) return JSON.parse(raw);
        }
      }
    } catch (_) {}
    return null;
  });

  useEffect(() => {
    if (isReplayMode) return; // No modo Replay, usa overrideAxionRadar gerado pelos candles históricos

    const updateRadar = () => {
      const fromWindow = typeof window !== 'undefined' ? (window as any).__vortex_axion_ml_radar : null;
      if (fromWindow) {
        setLiveAxionRadar(fromWindow);
        return;
      }
      try {
        for (let k = 0; k < localStorage.length; k++) {
          const key = localStorage.key(k);
          if (key && key.startsWith('vortex_axion_ml_radar_')) {
            const raw = localStorage.getItem(key);
            if (raw) {
              setLiveAxionRadar(JSON.parse(raw));
              return;
            }
          }
        }
      } catch (_) {}
    };

    const interval = setInterval(updateRadar, 300);
    return () => clearInterval(interval);
  }, [isReplayMode]);

  const effectiveAxionRadar = overrideAxionRadar !== undefined ? overrideAxionRadar : liveAxionRadar;

  // Handle Dragging with Window Event Listeners for smooth & 100% reliable tracking
  const handlePointerDown = (e: React.PointerEvent, widget: WidgetConfig) => {
    setTopWidgetId(widget.id);

    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('select') || target.closest('input')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const widgetX = widget.position.x;
    const widgetY = widget.position.y;

    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;

    const offsetX = mouseX - widgetX;
    const offsetY = mouseY - widgetY;

    setDraggingWidgetId(widget.id);

    const handlePointerMoveWindow = (moveEvent: PointerEvent) => {
      if (!containerRef.current) return;
      const cRect = containerRef.current.getBoundingClientRect();
      const currentMouseX = moveEvent.clientX - cRect.left;
      const currentMouseY = moveEvent.clientY - cRect.top;

      let newX = currentMouseX - offsetX;
      let newY = currentMouseY - offsetY;

      const maxX = Math.max(10, cRect.width - 160);
      const maxY = Math.max(10, cRect.height - 40);

      newX = Math.max(0, Math.min(maxX, newX));
      newY = Math.max(0, Math.min(maxY, newY));

      onUpdateWidget({
        ...widget,
        position: { x: Math.round(newX), y: Math.round(newY) }
      });
    };

    const handlePointerUpWindow = () => {
      setDraggingWidgetId(null);
      window.removeEventListener('pointermove', handlePointerMoveWindow);
      window.removeEventListener('pointerup', handlePointerUpWindow);
      window.removeEventListener('pointercancel', handlePointerUpWindow);
    };

    window.addEventListener('pointermove', handlePointerMoveWindow);
    window.addEventListener('pointerup', handlePointerUpWindow);
    window.addEventListener('pointercancel', handlePointerUpWindow);
  };

  // Handle Redimensionamento (Largura do Widget)
  const handleResizePointerDown = (e: React.PointerEvent, widget: WidgetConfig) => {
    e.preventDefault();
    e.stopPropagation();
    setTopWidgetId(widget.id);

    const startX = e.clientX;
    const initialWidth = widget.params?.width || (widget.type === 'gamma_quant_map' ? 360 : 320);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(300, Math.min(700, initialWidth + deltaX));
      onUpdateWidget({
        ...widget,
        params: {
          ...widget.params,
          width: Math.round(newWidth)
        }
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const getSentimentRotation = (val?: number) => {
    if (val === undefined || isNaN(val)) return -90;
    const value = Math.round(val);
    return (value / 100) * 180 - 90;
  };

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

  const getWindowTimeRemaining = () => {
    if (windowMinutes === Infinity || !windowBaseline) return '';
    const elapsedSeconds = Math.floor((Date.now() - windowBaseline.time) / 1000);
    const remainingSeconds = windowMinutes * 60 - elapsedSeconds;
    if (remainingSeconds <= 0) return ' • 0:00s';
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    return ` • ${mins}:${secs.toString().padStart(2, '0')}s`;
  };

  // Helper for short symbol
  const getShortSymbol = (symbol: string): string => {
    const item = MOMENTUM_ASSETS.find(a => a.symbol === symbol);
    return item ? item.shortName : symbol.substring(0, 5).toUpperCase();
  };

  return (
    <div
      className="absolute inset-0 pointer-events-none z-50 overflow-hidden select-none"
    >
      {widgets.filter(w => w.visible).map((widget) => {
        const isCollapsed = !!widget.collapsed;
        const isSettingsOpen = activeSettingsWidgetId === widget.id;
        const isTop = topWidgetId === widget.id || draggingWidgetId === widget.id;

        return (
          <div
            key={widget.id}
            onPointerDown={() => setTopWidgetId(widget.id)}
            style={{
              transform: `translate3d(${widget.position.x}px, ${widget.position.y}px, 0)`,
              zIndex: isTop ? 70 : 55,
              width: widget.params?.width ? `${widget.params.width}px` : (widget.type === 'gamma_quant_map' ? 360 : undefined)
            }}
            className={`absolute top-0 left-0 pointer-events-auto bg-[#0b1329] border border-slate-700 rounded-xl shadow-[0_12px_36px_rgba(0,0,0,0.95)] transition-shadow duration-150 ${
              draggingWidgetId === widget.id ? 'ring-2 ring-blue-500 shadow-blue-900/60 cursor-grabbing' : 'hover:border-slate-500'
            }`}
          >
            {/* Header Handle */}
            <div
              onPointerDown={(e) => handlePointerDown(e, widget)}
              className="flex items-center justify-between px-2.5 py-1.5 bg-[#0f172a] hover:bg-[#15213b] border-b border-slate-700/80 rounded-t-xl cursor-grab active:cursor-grabbing text-xs text-slate-200"
            >
              <div className="flex items-center gap-1.5 font-bold tracking-wide">
                <span className="text-slate-500 text-[11px]">⋮⋮</span>
                <span className="truncate max-w-[260px]">
                  {((widget.title || '').replace(/GRIX\s*/gi, '').replace(/\s*\(Cesta Geral\)/gi, '')).trim() || widget.title}
                </span>
              </div>

              <div className="flex items-center gap-1">
                {/* Settings Toggle */}
                {widget.type === 'block_trades' || widget.type === 'momentum_asset' || widget.type === 'speedometer' ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSettingsWidgetId(prev => prev === widget.id ? null : widget.id);
                    }}
                    className={`text-[10px] p-0.5 rounded transition ${isSettingsOpen ? 'text-blue-400 bg-blue-950/80' : 'text-slate-400 hover:text-slate-200'}`}
                    title="Configurações do Widget"
                  >
                    ⚙️
                  </button>
                ) : null}

                {/* Minimize / Expand Toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateWidget({ ...widget, collapsed: !widget.collapsed });
                  }}
                  className="text-slate-400 hover:text-slate-200 text-[10px] p-0.5"
                  title={isCollapsed ? 'Expandir' : 'Minimizar'}
                >
                  {isCollapsed ? '▲' : '—'}
                </button>

                {/* Close Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveWidget(widget.id);
                  }}
                  className="text-slate-400 hover:text-rose-400 text-xs p-0.5 leading-none transition"
                  title="Fechar Widget"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Quick Settings Sub-menu (if open) */}
            {isSettingsOpen && (
              <div className="p-2 bg-[#070c18] border-b border-slate-700 text-[10px] text-slate-300 space-y-1.5 animate-fadeIn">
                {widget.type === 'block_trades' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span>Fonte de Dados:</span>
                      <select
                        value={widget.params?.dataSource || 'auto'}
                        onChange={(e) => {
                          onUpdateWidget({
                            ...widget,
                            params: { ...widget.params, dataSource: e.target.value }
                          });
                        }}
                        className="bg-[#0f172a] border border-slate-700 text-white rounded px-1.5 py-0.5 outline-none font-bold text-[10px]"
                      >
                        <option value="auto">Automático</option>
                        <option value="nt8">NinjaTrader 8 (Local)</option>
                        <option value="supabase">Axion Flow</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span>Exibir no Widget:</span>
                      <select
                        value={widget.params?.limit || 5}
                        onChange={(e) => {
                          onUpdateWidget({
                            ...widget,
                            params: { ...widget.params, limit: Number(e.target.value) }
                          });
                        }}
                        className="bg-[#0f172a] border border-slate-700 text-white rounded px-1.5 py-0.5 outline-none font-bold text-[10px]"
                      >
                        <option value={3}>3 trades</option>
                        <option value={5}>5 trades</option>
                        <option value={8}>8 trades</option>
                        <option value={10}>10 trades</option>
                        <option value={15}>15 trades</option>
                        <option value={20}>20 trades</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1">
                        <span>Filtro Mínimo:</span>
                      </span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={5000}
                          step={5}
                          value={widget.params?.minContracts ?? 50}
                          onChange={(e) => {
                            const val = Math.max(1, parseInt(e.target.value) || 1);
                            onUpdateWidget({
                              ...widget,
                              params: { ...widget.params, minContracts: val }
                            });
                          }}
                          className="w-16 bg-[#0f172a] border border-slate-700 text-white text-center rounded px-1.5 py-0.5 outline-none font-bold font-mono focus:border-blue-500 text-[10px]"
                        />
                        <span className="text-slate-400 text-[9px] font-mono">ct</span>
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <span>Plotar nos Candles:</span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = widget.params?.showOnCandles === false ? true : false;
                          onUpdateWidget({
                            ...widget,
                            params: { ...widget.params, showOnCandles: nextVal }
                          });
                        }}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold transition flex items-center gap-1 ${
                          widget.params?.showOnCandles !== false
                            ? 'bg-blue-600/90 text-white shadow-sm ring-1 ring-blue-400/50'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {widget.params?.showOnCandles !== false ? 'LIGADO' : 'DESLIGADO'}
                      </button>
                    </div>

                    {widget.params?.showOnCandles !== false && (
                      <div className="space-y-1.5 bg-slate-900/50 p-1.5 rounded border border-slate-800">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[9px] text-slate-300">Tamanho da Fonte:</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const currentSize = widget.params?.candleFontSize || 11;
                                const newSize = Math.max(8, currentSize - 1);
                                onUpdateWidget({
                                  ...widget,
                                  params: { ...widget.params, candleFontSize: newSize }
                                });
                              }}
                              className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-white rounded flex items-center justify-center font-bold text-xs"
                              title="Diminuir fonte"
                            >
                              -
                            </button>
                            <span className="w-8 text-center font-mono font-bold text-white text-[10px]">
                              {widget.params?.candleFontSize || 11}px
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const currentSize = widget.params?.candleFontSize || 11;
                                const newSize = Math.min(24, currentSize + 1);
                                onUpdateWidget({
                                  ...widget,
                                  params: { ...widget.params, candleFontSize: newSize }
                                });
                              }}
                              className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-white rounded flex items-center justify-center font-bold text-xs"
                              title="Aumentar fonte"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[9px] text-slate-300">Espaçamento Máx/Mín:</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={2}
                              max={30}
                              value={widget.params?.pixelOffset ?? 8}
                              onChange={(e) => {
                                const val = Math.max(2, Math.min(30, parseInt(e.target.value) || 8));
                                onUpdateWidget({
                                  ...widget,
                                  params: { ...widget.params, pixelOffset: val }
                                });
                              }}
                              className="w-12 bg-[#0f172a] border border-slate-700 text-white text-center rounded px-1 py-0.5 outline-none font-bold font-mono focus:border-blue-500 text-[10px]"
                            />
                            <span className="text-slate-400 text-[9px] font-mono">px</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[8px] text-slate-400 pt-0.5">
                          <span className="text-emerald-400 font-bold">● Compra: Abaixo</span>
                          <span className="text-rose-400 font-bold">● Venda: Acima</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {widget.type === 'momentum_asset' && (
                  <div className="flex items-center justify-between gap-2">
                    <span>Ativo:</span>
                    <select
                      value={widget.params?.assetSymbol || 'NVIDIA'}
                      onChange={(e) => {
                        const newSym = e.target.value;
                        const assetObj = MOMENTUM_ASSETS.find(a => a.symbol === newSym);
                        onUpdateWidget({
                          ...widget,
                          title: `💪 Gauge ${assetObj?.shortName || newSym}`,
                          params: { ...widget.params, assetSymbol: newSym }
                        });
                      }}
                      className="bg-[#0f172a] border border-slate-700 text-white rounded px-1.5 py-0.5 outline-none font-bold"
                    >
                      {MOMENTUM_ASSETS.map(a => (
                        <option key={a.symbol} value={a.symbol}>
                          {a.shortName} ({a.fullName})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Widget Body Content */}
            {!isCollapsed && (
              <div className="p-2.5 overflow-hidden">
                {/* 1. SPEEDOMETER (Sentimento Macro & Micro) */}
                {widget.type === 'speedometer' && (
                  <div className="w-[210px] text-center">
                    {(() => {
                      const macroVal = marketData?.sentiment;
                      const mercadoVal = marketData?.marketSentiment !== undefined
                        ? marketData.marketSentiment
                        : (marketData?.originalSentiment !== undefined ? marketData.originalSentiment : marketData?.sentiment);

                      return (
                        <div className="grid grid-cols-2 gap-2 items-center justify-center">
                          {/* Macro Gauge */}
                          <div className="flex flex-col items-center">
                            <div className="text-[9px] font-extrabold text-purple-300 uppercase tracking-wider mb-0.5">Macro</div>
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
                                <div className="gauge-value-number-compact text-white font-mono text-[10px]">
                                  {macroVal !== undefined ? `${Math.round(macroVal)}%` : '0%'}
                                </div>
                              </div>
                            </div>
                            <div className="w-full flex justify-between px-2 mt-0.5 text-[8px] font-black">
                              <span className="text-rose-400">V</span>
                              <span className="text-emerald-400">C</span>
                            </div>
                          </div>

                          {/* Micro Gauge */}
                          <div className="flex flex-col items-center">
                            <div className="text-[9px] font-extrabold text-cyan-300 uppercase tracking-wider mb-0.5">Micro</div>
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
                                <div className="gauge-value-number-compact text-white font-mono text-[10px]">
                                  {mercadoVal !== undefined ? `${Math.round(mercadoVal)}%` : '0%'}
                                </div>
                              </div>
                            </div>
                            <div className="w-full flex justify-between px-2 mt-0.5 text-[8px] font-black">
                              <span className="text-rose-400">V</span>
                              <span className="text-emerald-400">C</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 2. BLOCK TRADES */}
                {widget.type === 'block_trades' && (
                  <div className="w-[240px] font-mono text-[10px] space-y-1">
                    {(() => {
                      const limit = widget.params?.limit || 5;
                      const minContracts = widget.params?.minContracts ?? 50;
                      const showOnCandles = widget.params?.showOnCandles !== false;
                      const dataSource: 'auto' | 'nt8' | 'supabase' = widget.params?.dataSource || 'auto';

                      const localTrades = nt8BlockTrades.length > 0 ? nt8BlockTrades : getStreamerBlockTrades(activePanel, settings);
                      const supabaseTrades = marketData?.blockTrades || [];

                      const hasLocal = localTrades.length > 0;
                      const effectiveSource = dataSource === 'nt8'
                        ? 'nt8'
                        : (dataSource === 'supabase' ? 'supabase' : (hasLocal ? 'nt8' : 'supabase'));

                      const rawTrades = effectiveSource === 'nt8' ? localTrades : supabaseTrades;
                      const displayTrades = [...rawTrades].reverse().slice(0, limit);

                      return (
                        <>
                          <div className="flex items-center justify-between px-1 text-[8px] text-slate-400 pb-1 border-b border-slate-800">
                            <div className="flex items-center gap-1.5">
                              <span>Filtro: <strong className="text-amber-400 font-bold">≥ {minContracts} ct</strong></span>
                              <span
                                className={`px-1 py-0.2 rounded text-[7.5px] font-bold border tracking-wider ${
                                  effectiveSource === 'nt8'
                                    ? 'bg-emerald-950/90 text-emerald-300 border-emerald-600/70 shadow-sm'
                                    : 'bg-blue-950/90 text-blue-300 border-blue-600/70 shadow-sm'
                                }`}
                                title={effectiveSource === 'nt8' ? 'Alimentado via NinjaTrader 8 Local (:8002)' : 'Alimentado via Axion Flow'}
                              >
                                {effectiveSource === 'nt8' ? 'NT8 Local' : 'Axion Flow'}
                              </span>
                            </div>
                            <span className={showOnCandles ? 'text-blue-400 font-bold' : 'text-slate-500'}>
                              {showOnCandles ? 'Candles ON' : 'Candles OFF'}
                            </span>
                          </div>

                          {displayTrades.length === 0 ? (
                            <div className="text-slate-500 text-center py-3 text-xs">
                              Sem ordens {effectiveSource === 'nt8' ? 'no NT8 local' : 'registradas'}...
                            </div>
                          ) : (
                            displayTrades.map((trade: any, idx: number) => {
                              const isCompra = trade.side === 'COMPRA';
                              const isQualified = Number(trade.volume) >= minContracts;
                              return (
                                <div
                                  key={idx}
                                  className={`px-2 py-1 rounded border border-l-2 text-[9px] flex justify-between items-center transition ${
                                    isCompra
                                      ? 'bg-[#092419] border-emerald-800 border-l-emerald-400 text-emerald-300'
                                      : 'bg-[#280c13] border-rose-800 border-l-rose-400 text-rose-300'
                                  } ${isQualified ? 'ring-1 ring-amber-400/40 shadow-sm' : 'opacity-70'}`}
                                >
                                  <span className="font-black flex items-center gap-1">
                                    {trade.side}
                                    {isQualified && <span className="text-[7px] text-amber-400 font-bold" title="Trade qualificado para os candles">★</span>}
                                  </span>
                                  <span className="font-semibold">{trade.volume} ct @ {trade.price}</span>
                                  <span className="text-slate-400 text-[8px]">{trade.time}</span>
                                </div>
                              );
                            })
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* 3. ACCELEROMETER */}
                {widget.type === 'accelerometer' && (
                  <div className="w-[200px] text-[10px] space-y-2">
                    <div>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-slate-400">Z-Score</span>
                        <span className="font-mono font-bold text-white">{marketData?.zScore?.toFixed(2) || '0.00'}</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 transition-all duration-300"
                          style={{ width: `${Math.max(0, Math.min(100, ((marketData?.zScore || 0) + 3) * 16.6))}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-slate-400">ATR Ratio</span>
                        <span className="font-mono font-bold text-white">{marketData?.atrRatio?.toFixed(2) || '0.00'}</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                          style={{ width: `${Math.max(0, Math.min(100, (marketData?.atrRatio || 0) * 33.3))}%` }}
                        />
                      </div>
                    </div>

                    <div className={`p-1 rounded text-center text-[10px] font-bold border uppercase ${(() => {
                      const est = (marketData?.estado || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]+/g, ' ').toUpperCase();
                      if (est.includes('EXPLOSAO') && (est.includes('COMPRA') || est.includes('BUY') || est.includes('ALTA'))) return 'bg-emerald-950/60 text-emerald-300 border-emerald-500/60 animate-pulse';
                      if (est.includes('EXPLOSAO') && (est.includes('VENDA') || est.includes('SELL') || est.includes('BAIXA'))) return 'bg-rose-950/60 text-rose-300 border-rose-500/60 animate-pulse';
                      if (est.includes('EXAUSTAO')) return 'bg-amber-950/60 text-amber-300 border-amber-600/60';
                      if (est.includes('COMPRESSAO')) return 'bg-yellow-950/60 text-yellow-300 border-yellow-600/60';
                      if (est === 'NORMAL') return 'bg-cyan-950/40 text-cyan-300 border-cyan-700/50';
                      if (est.includes('COMPRA') || est.includes('BUY')) return 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50';
                      if (est.includes('VENDA') || est.includes('SELL')) return 'bg-rose-900/40 text-rose-300 border-rose-700/50';
                      return 'bg-[#0e1d3a] text-blue-300 border-blue-800';
                    })()}`}>
                      {marketData?.estado || 'AGUARDANDO'}
                    </div>
                  </div>
                )}

                {/* 4. GAMMA BIAS & LEVELS */}
                {widget.type === 'gamma_bias' && (
                  <div className="w-[230px] text-[9px] space-y-1.5">
                    {(() => {
                      if (!gammaLevels) {
                        return <div className="text-slate-500 text-center py-2">Sem dados de Gamma...</div>;
                      }

                      const bias = gammaLevels.gamma_bias || '--';
                      const score = gammaLevels.bias_score || 0;
                      const strategy = gammaLevels.recommended_strategy || '--';
                      const buyStr = gammaLevels.buy_strength || 0;
                      const sellStr = gammaLevels.sell_strength || 0;
                      const totalStr = buyStr + sellStr || 100;
                      const buyPct = Math.round((buyStr / totalStr) * 100);
                      const sellPct = 100 - buyPct;

                      const isBull = bias.toUpperCase().includes('COMPRA') || bias.toUpperCase().includes('BULL') || bias.toUpperCase().includes('BUY') || score > 20;
                      const isBear = bias.toUpperCase().includes('VENDA') || bias.toUpperCase().includes('BEAR') || bias.toUpperCase().includes('SELL') || score < -20;

                      return (
                        <>
                          <div className="flex justify-between items-center gap-1">
                            <span className={`px-1.5 py-0.5 rounded border font-bold ${
                              isBull ? 'text-emerald-400 bg-[#092419] border-emerald-800' :
                              isBear ? 'text-rose-400 bg-[#280c13] border-rose-800' :
                              'text-slate-300 bg-[#162038] border-slate-700'
                            }`}>
                              Viés: {bias} ({score > 0 ? `+${score}` : score})
                            </span>
                            <span className="text-purple-300 font-bold bg-[#1e1336] border border-purple-800 px-1.5 py-0.5 rounded truncate max-w-[100px]" title={strategy}>
                              {strategy}
                            </span>
                          </div>

                          <div className="relative h-3 bg-slate-950 rounded overflow-hidden flex my-1">
                            <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${buyPct}%` }} />
                            <div className="h-full bg-rose-500 transition-all duration-300" style={{ width: `${sellPct}%` }} />
                            <span className="absolute left-1.5 top-0 h-full flex items-center text-[8px] text-white font-extrabold">{buyPct}%</span>
                            <span className="absolute right-1.5 top-0 h-full flex items-center text-[8px] text-white font-extrabold">{sellPct}%</span>
                          </div>

                          <div className="flex justify-between text-[8px] text-slate-400 font-mono">
                            <span className="text-emerald-400">Sup: {gammaLevels.nearest_support || '--'}</span>
                            <span className="text-rose-400">Res: {gammaLevels.nearest_resistance || '--'}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* 5. DELTA METER */}
                {widget.type === 'delta_meter' && (
                  <div className="w-[220px] text-[10px] space-y-2">
                    {(() => {
                      const deltaPct = getDeltaLeft();
                      const deltaVal = marketData?.delta || 0;
                      const deltaRatio = Number(marketData?.deltaRatio || 1);
                      const isPositive = deltaVal > 0;
                      const isNegative = deltaVal < 0;

                      return (
                        <>
                          {/* Gauge Semicircular com Agulha */}
                          <div className="flex flex-col items-center">
                            <div className="gauge-container-compact mx-auto">
                              <div className="gauge-bg-compact">
                                <div className="gauge-mask-compact"></div>
                              </div>
                              <div
                                className="gauge-needle-compact"
                                style={{ transform: `rotate(${getSentimentRotation(deltaPct)}deg)` }}
                              ></div>
                              <div className="gauge-center-compact"></div>
                              <div className="gauge-value-compact">
                                <div className={`gauge-value-number-compact text-[11px] font-mono font-black ${
                                  isPositive ? 'text-emerald-400' : isNegative ? 'text-rose-400' : 'text-slate-300'
                                }`}>
                                  {Math.round(deltaPct)}%
                                </div>
                              </div>
                            </div>
                            <div className="w-full flex justify-between px-3 -mt-0.5 text-[8px] font-black">
                              <span className="text-rose-400">VENDA</span>
                              <span className="text-slate-500 font-mono">DELTA</span>
                              <span className="text-emerald-400">COMPRA</span>
                            </div>
                          </div>

                          {/* Barra de Fluxo Gradiente com Marcador */}
                          <div className="px-1">
                            <div className="delta-gauge-bar h-2 rounded-full relative overflow-visible">
                              <div
                                className="delta-gauge-marker absolute -top-0.5 -bottom-0.5 w-1.5 bg-white shadow-lg rounded-sm transition-all duration-300"
                                style={{ left: `calc(${deltaPct}% - 3px)` }}
                              />
                            </div>
                          </div>

                          {/* Métricas Numéricas de Delta, Ratio e Prints */}
                          <div className="flex justify-between items-center text-[9px] font-mono px-1">
                            <span>
                              Δ: <strong className={`font-black ${isPositive ? 'text-emerald-400' : isNegative ? 'text-rose-400' : 'text-slate-300'}`}>
                                {isPositive ? `+${deltaVal}` : deltaVal}
                              </strong>
                            </span>
                            <span>
                              Ratio: <strong className={`font-black ${deltaRatio > 1.05 ? 'text-emerald-400' : deltaRatio < 0.95 ? 'text-rose-400' : 'text-slate-300'}`}>
                                {deltaRatio.toFixed(2)}
                              </strong>
                            </span>
                            <span>
                              P/s: <strong className="text-slate-300">{Number(marketData?.printsPerSecond || 0).toFixed(1)}</strong>
                            </span>
                          </div>

                          {/* Seletor de Janelas Temporais */}
                          <div className="flex gap-1 justify-center pt-1 border-t border-slate-800/80">
                            <button
                              onClick={() => setWindowMinutes && setWindowMinutes(Infinity)}
                              className={`text-[8px] px-1.5 py-0.5 rounded font-bold transition ${windowMinutes === Infinity ? 'bg-blue-600 text-white shadow' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                            >
                              Acum
                            </button>
                            <button
                              onClick={() => setWindowMinutes && setWindowMinutes(1)}
                              className={`text-[8px] px-1.5 py-0.5 rounded font-bold transition ${windowMinutes === 1 ? 'bg-blue-600 text-white shadow' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                            >
                              1m
                            </button>
                            <button
                              onClick={() => setWindowMinutes && setWindowMinutes(5)}
                              className={`text-[8px] px-1.5 py-0.5 rounded font-bold transition ${windowMinutes === 5 ? 'bg-blue-600 text-white shadow' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                            >
                              5m
                            </button>
                            <button
                              onClick={() => setWindowMinutes && setWindowMinutes(15)}
                              className={`text-[8px] px-1.5 py-0.5 rounded font-bold transition ${windowMinutes === 15 ? 'bg-blue-600 text-white shadow' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                            >
                              15m
                            </button>
                          </div>

                          <div className="text-[8px] text-center text-slate-400 font-mono">
                            {windowMinutes === Infinity ? 'Acumulado' : `${windowMinutes}m`}{getWindowTimeRemaining()}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* 6. INDIVIDUAL MOMENTUM ASSET GAUGE */}
                {widget.type === 'momentum_asset' && (
                  <div className="w-[190px] text-center text-[10px]">
                    {(() => {
                      const targetSymbol = widget.params?.assetSymbol || 'NVIDIA';
                      const assetObj = MOMENTUM_ASSETS.find(a => a.symbol === targetSymbol);
                      const shortName = assetObj?.shortName || targetSymbol;

                      let buyVal = 50;
                      let sellVal = 50;

                      if (targetSymbol === 'FORÇA FINAL') {
                        const activeForces = (forces || []).filter((f: any) => {
                          if (f.symbol === 'FORÇA FINAL') return false;
                          let cfgId = f.symbol === 'S&P 500' ? 'sp500_impulso' : f.symbol === 'USD Index' ? 'usdindex_impulso' : `${f.symbol.toLowerCase()}_impulso`;
                          const cfg = (forcesConfig || []).find((c: any) => c.id === cfgId);
                          return cfg ? cfg.ativo : true;
                        });
                        buyVal = activeForces.length > 0
                          ? Math.round(activeForces.reduce((acc: number, curr: any) => {
                              const isInverted = curr.symbol === 'VIX' || curr.symbol === 'USD Index';
                              return acc + (isInverted ? (100 - curr.buy) : curr.buy);
                            }, 0) / activeForces.length)
                          : 50;
                        sellVal = 100 - buyVal;
                      } else {
                        const found = (forces || []).find((f: any) => f.symbol.toLowerCase() === targetSymbol.toLowerCase() || f.symbol === targetSymbol);
                        if (found) {
                          buyVal = found.buy;
                          sellVal = found.sell;
                        }
                      }

                      const isBull = buyVal > 55;
                      const isBear = buyVal < 45;

                      return (
                        <div className="flex flex-col items-center">
                          <div className="flex items-center justify-between w-full mb-1">
                            <span className="font-mono font-black text-white text-xs">{shortName}</span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                              isBull ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                              isBear ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                              'bg-slate-800 text-slate-300'
                            }`}>
                              {isBull ? 'COMPRA' : isBear ? 'VENDA' : 'NEUTRO'}
                            </span>
                          </div>

                          <div className="gauge-container-compact mx-auto my-1">
                            <div className="gauge-bg-compact">
                              <div className="gauge-mask-compact"></div>
                            </div>
                            <div
                              className="gauge-needle-compact"
                              style={{ transform: `rotate(${getSentimentRotation(buyVal)}deg)` }}
                            ></div>
                            <div className="gauge-center-compact"></div>
                            <div className="gauge-value-compact">
                              <div className="gauge-value-number-compact text-white font-mono text-[10px]">
                                {buyVal}%
                              </div>
                            </div>
                          </div>

                          <div className="w-full flex justify-between px-2 text-[9px] font-mono font-bold">
                            <span className="text-emerald-400">{buyVal}% C</span>
                            <span className="text-rose-400">{sellVal}% V</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 7. MOMENTUM OVERVIEW (BASKET) */}
                {widget.type === 'momentum_overview' && (
                  <div className="w-[230px] text-[9px] font-mono space-y-1">
                    {(() => {
                      if (!forces || forces.length === 0) {
                        return <div className="text-slate-500 text-center py-2">Carregando cesta...</div>;
                      }

                      // Oculta os 3 pares individuais de moedas (EUR/JPY, EUR/USD, USD/JPY)
                      // O fluxo geral já é representado pelo IndexMoneyFlow (IMF)
                      // Ordena para que o IMF fique imediatamente acima da FORÇA FINAL
                      const filteredForces = forces
                        .filter((f: any) => {
                          const s = (f.symbol || '').toUpperCase();
                          return s !== 'EUR/JPY' && s !== 'EUR/USD' && s !== 'USD/JPY' && s !== 'EURJPY' && s !== 'EURUSD' && s !== 'USDJPY';
                        })
                        .sort((a: any, b: any) => {
                          const getOrder = (sym: string) => {
                            const s = (sym || '').toUpperCase();
                            if (s === 'IMF' || s === 'FLUXO DE CAPITAIS') return 98;
                            if (s === 'FORÇA FINAL' || s === 'FORCA') return 99;
                            return 1;
                          };
                          return getOrder(a.symbol) - getOrder(b.symbol);
                        });

                      return filteredForces.map((item: any) => {
                        let cfgId = '';
                        if (item.symbol === 'S&P 500') cfgId = 'sp500_impulso';
                        else if (item.symbol === 'USD Index') cfgId = 'usdindex_impulso';
                        else if (item.symbol === 'FORÇA FINAL') cfgId = 'forca_final';
                        else if (item.symbol === 'IMF' || item.symbol === 'FLUXO DE CAPITAIS') cfgId = 'imf_impulso';
                        else cfgId = `${item.symbol.toLowerCase()}_impulso`;

                        const cfg = (forcesConfig || []).find((f: any) => f.id === cfgId);
                        const isAtivo = cfgId === 'forca_final' ? true : (cfg ? cfg.ativo : false);
                        const buyVal = Math.round(Number(item.buy || 0));
                        const sellVal = Math.round(Number(item.sell || 0));

                        return (
                          <div
                            key={item.symbol}
                            onClick={() => {
                              if (cfgId !== 'forca_final' && toggleForceConfig) toggleForceConfig(cfgId);
                            }}
                            className={`flex items-center gap-1.5 py-0.5 px-1 rounded cursor-pointer transition hover:bg-slate-900 ${
                              isAtivo ? 'bg-slate-900/60' : 'opacity-35 grayscale'
                            }`}
                          >
                            <span className="font-bold text-slate-300 w-10 truncate">{getShortSymbol(item.symbol)}</span>
                            <span className="text-emerald-400 font-bold w-6 text-right">{buyVal}%</span>
                            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                              <div className="bg-emerald-500" style={{ width: `${buyVal}%` }} />
                              <div className="bg-rose-500" style={{ width: `${sellVal}%` }} />
                            </div>
                            <span className="text-rose-400 font-bold w-6 text-left">{sellVal}%</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}

                {/* 8. GRIX CORE ANALYTICS */}
                {widget.type === 'grix_analytics' && (
                  <div className="w-[230px]">
                    <GrixCoreAnalyticsView data={effectiveOptionsMarket} />
                  </div>
                )}

                {/* 9. GRIX ANCHORS */}
                {widget.type === 'grix_anchors' && (
                  <div className="w-[230px]">
                    <GrixAnchorsView data={effectiveOptionsMarket} />
                  </div>
                )}

                {/* 10. GRIX FLOW AND EXPOSURE */}
                {widget.type === 'grix_flow' && (
                  <div className="w-[230px]">
                    <GrixFlowExposureView data={effectiveOptionsMarket} />
                  </div>
                )}

                {/* 11. Stock Replacement (QQQ) */}
                {widget.type === 'grix_stock_replacement' && (
                  <div className="w-[230px]">
                    <GrixStockReplacementView data={effectiveOptionsMarket} />
                  </div>
                )}

                {/* 12. Projeções de Mercado */}
                {widget.type === 'projecao_mercado' && (
                  <div className="w-[260px] min-h-[180px]">
                    <ProjecaoView data={effectiveOptionsMarket} />
                  </div>
                )}

                {/* 13. Axion ML Radar Draggable Widget */}
                {widget.type === 'axion_ml_radar' && (
                  <div className="w-[284px] max-w-[284px] box-border overflow-hidden font-mono text-slate-300">
                    {(() => {
                      const radar = effectiveAxionRadar;
                      if (!radar) {
                        return (
                          <div className="py-4 text-center text-xs text-slate-500 font-sans">
                            <span className="animate-pulse">Sincronizando modelo Axion ML...</span>
                          </div>
                        );
                      }

                      const buyP = radar.probBuy ?? 30;
                      const sellP = radar.probSell ?? 30;
                      const totalP = Math.max(0.1, buyP + sellP);
                      const baseBuyPct = Math.round((buyP / totalP) * 100);
                      const dynamicBuyPct = Math.min(85, Math.max(15, baseBuyPct));
                      const dynamicSellPct = 100 - dynamicBuyPct;
                      const isNearEqual = Math.abs(dynamicBuyPct - 50) <= 3;

                      // Status central entre os percentuais de compra e venda
                      const centerStatus = isNearEqual
                        ? '⚖️ EQUILÍBRIO'
                        : radar.direction === 'COMPRA'
                          ? '🟢 COMPRA'
                          : radar.direction === 'VENDA'
                            ? '🔴 VENDA'
                            : '⚪ NEUTRO';

                      const centerStatusColor = isNearEqual
                        ? 'text-amber-400 font-bold'
                        : radar.direction === 'COMPRA'
                          ? 'text-emerald-400 font-black'
                          : radar.direction === 'VENDA'
                            ? 'text-rose-400 font-black'
                            : 'text-slate-400 font-semibold';

                      return (
                        <div className="space-y-2 py-0.5">
                          {/* Probabilidades de Compra vs Venda */}
                          <div className="flex items-center justify-between text-xs font-sans">
                            <span className="text-slate-400 font-medium">Prob. Compra / Venda:</span>
                            <div className="flex items-center gap-2 font-mono text-xs">
                              <span className={`font-bold transition-all ${
                                (radar.probBuy ?? 0) >= 38
                                  ? 'text-emerald-400 font-black'
                                  : (radar.direction === 'COMPRA' && (radar.probBuy ?? 0) >= 34)
                                    ? 'text-emerald-300 font-bold'
                                    : 'text-slate-400'
                              }`}>
                                🟢 {(radar.probBuy ?? radar.probability ?? 0).toFixed(1)}%
                              </span>
                              <span className="text-slate-600 font-light">|</span>
                              <span className={`font-bold transition-all ${
                                (radar.probSell ?? 0) >= 38
                                  ? 'text-rose-400 font-black'
                                  : (radar.direction === 'VENDA' && (radar.probSell ?? 0) >= 34)
                                    ? 'text-rose-300 font-bold'
                                    : 'text-slate-400'
                              }`}>
                                🔴 {(radar.probSell ?? 0).toFixed(1)}%
                              </span>
                            </div>
                          </div>

                          {/* Barra de Equilíbrio / Tug-of-War Balance */}
                          <div className="space-y-1">
                            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-white/10 relative flex">
                              <div
                                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-300"
                                style={{ width: `${dynamicBuyPct}%` }}
                              />
                              <div className="absolute left-1/2 top-0 bottom-0 w-[1.5px] bg-white/50 -translate-x-1/2 z-10" />
                              <div
                                className="h-full bg-gradient-to-r from-rose-400 to-rose-600 transition-all duration-300"
                                style={{ width: `${dynamicSellPct}%` }}
                              />
                            </div>
                            {/* Status colocado no centro entre percentual de compra e venda */}
                            <div className="flex items-center justify-between text-[10px] font-mono px-0.5">
                              <span className={dynamicBuyPct >= 54 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                                Compra {dynamicBuyPct}%
                              </span>
                              <span className={`text-[10px] uppercase font-bold tracking-wide ${centerStatusColor}`}>
                                {centerStatus}
                              </span>
                              <span className={dynamicSellPct >= 54 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                                Venda {dynamicSellPct}%
                              </span>
                            </div>
                          </div>

                          {/* Status do Padrão / Perspectiva Tática (FONTE MAIOR) */}
                          <div className="pt-1 border-t border-white/10 flex items-center justify-between">
                            <span className={`font-bold tracking-tight text-[11.5px] leading-snug ${
                              radar.isSignal
                                ? radar.direction === 'COMPRA' ? 'text-emerald-300 font-black' : 'text-rose-300 font-black'
                                : radar.isArming
                                  ? radar.direction === 'COMPRA' ? 'text-emerald-200 font-bold' : 'text-rose-200 font-bold'
                                  : radar.direction === 'NEUTRO'
                                    ? 'text-slate-300 font-medium'
                                    : 'text-slate-200 font-semibold'
                            }`}>
                              {radar.status || 'Aguardando gatilho...'}
                            </span>
                          </div>

                          {/* Confluência com Níveis Gamma */}
                          {radar.distToCallRes !== undefined && (
                            <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[11px] text-slate-300 font-mono">
                              <span title="Distância até a Resistência Gamma mais próxima (Call Wall)">
                                Res.: <strong className="text-rose-400 font-bold">+{radar.distToCallRes}</strong>
                              </span>
                              <span className="text-slate-600">•</span>
                              <span title="Distância até o Suporte Gamma mais próximo (Put Wall)">
                                Sup.: <strong className="text-emerald-400 font-bold">-{radar.distToPutSup}</strong>
                              </span>
                            </div>
                          )}

                          {/* Remodelagem Ativa & Padrão Técnico Confluente */}
                          {radar.activeModelName && (
                            <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[10px] text-cyan-400 font-mono">
                              <span className="truncate max-w-[165px]" title={`Modelo Ativo: ${radar.activeModelName}`}>
                                🧠 {radar.activeModelName}
                              </span>
                              {radar.confluentPattern ? (
                                <span className="text-amber-300 font-bold truncate max-w-[110px]" title={`Padrão Confluente: ${radar.confluentPattern}`}>
                                  ✨ {radar.confluentPattern}
                                </span>
                              ) : (
                                <span className="text-slate-500 text-[9px]">Ativo</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 14. GAMMA QUANT MAP */}
                {widget.type === 'gamma_quant_map' && (
                  <GammaQuantMapView
                    gammaLevels={gammaLevels}
                    marketData={marketData}
                    selectedStudyId={widget.params?.selectedStudyId}
                    onSelectStudy={(id) => {
                      onUpdateWidget({
                        ...widget,
                        params: { ...widget.params, selectedStudyId: id }
                      });
                    }}
                  />
                )}

                {/* 15. WYCKOFF STRUCTURAL RADAR */}
                {widget.type === 'wyckoff_structural_radar' && (
                  <WyckoffStructuralRadarView
                    gammaLevels={gammaLevels}
                    marketData={marketData}
                    selectedStudyId={widget.params?.selectedStudyId}
                    onSelectStudy={(id) => {
                      onUpdateWidget({
                        ...widget,
                        params: { ...widget.params, selectedStudyId: id }
                      });
                    }}
                  />
                )}

                {/* 16. MARKET MATRIX (GRIX PANEL) */}
                {widget.type === 'market_matrix' && (
                  <MarketMatrixWidget
                    opacity={widget.opacity}
                    params={widget.params}
                  />
                )}
              </div>
            )}

            {/* Handle Interativo de Redimensionamento no Canto Inferior Direito */}
            {!isCollapsed && (
              <div
                onPointerDown={(e) => handleResizePointerDown(e, widget)}
                className="absolute bottom-0.5 right-0.5 w-4 h-4 cursor-se-resize z-40 flex items-end justify-end p-0.5 text-slate-500 hover:text-cyan-400 active:text-cyan-300 transition-colors select-none"
                title="Arraste para redimensionar a largura do widget"
              >
                <svg className="w-2.5 h-2.5 opacity-60 hover:opacity-100" viewBox="0 0 6 6" fill="currentColor">
                  <circle cx="5" cy="5" r="0.75" />
                  <circle cx="5" cy="2.5" r="0.75" />
                  <circle cx="2.5" cy="5" r="0.75" />
                </svg>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

ChartWidgetsOverlay.displayName = 'ChartWidgetsOverlay';
