import React, { useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useIsMobile } from '../utils/platform';
import { CandleChart } from './CandleChart';
import { ChartWidgetsOverlay } from './ChartWidgetsOverlay';
import type { IndicatorConfig } from '../utils/indicatorRegistry';
import type { WidgetConfig } from '../utils/widgetRegistry';
import type { DrawingItem, DrawingToolType } from '../types/chartDrawings';
import type { ChartSlotConfig } from '../types/chartLayout';

function getShortIndicatorName(ind: IndicatorConfig): string {
  switch (ind.type) {
    case 'EMA': return `EMA ${ind.params.period || 9}`;
    case 'SMA': return `SMA ${ind.params.period || 20}`;
    case 'TMA': return `TMA ${ind.params.period || 20}`;
    case 'RSI': return `RSI ${ind.params.period || 14}`;
    case 'MACD': return `MACD (${ind.params.fastPeriod || 12},${ind.params.slowPeriod || 26})`;
    case 'Bollinger': return `BB (${ind.params.period || 20},${ind.params.stdDev || 2})`;
    case 'Supertrend': return `Supertrend (${ind.params.atrPeriod || 10})`;
    case 'ElliottWaves': return `Elliott Waves`;
    case 'SMC_OB': return `SMC Order Blocks`;
    case 'SMC_BOS_CHOCH': return `SMC BOS/CHoCH`;
    case 'SMC_Liquidity': return `SMC Liquidity`;
    case 'VWAP': return `VWAP`;
    case 'VOLUME_SPIKE_PIVOTS': return `Spike Pivots (${ind.params?.barsToCheck || 5}, ${ind.params?.volumeMultiple || 1.5}x)`;
    case 'GammaLevels':
    case 'GAMMA_LEVELS': return `Níveis Gamma`;
    default: return ind.name.split('(')[0].trim();
  }
}

interface TradeChartSlotProps {
  slot: ChartSlotConfig;
  isMultiChart: boolean;
  isFocused: boolean;
  isMaximized: boolean;
  onFocus: () => void;
  onToggleMaximize: () => void;
  onChangePanel: (panelId: string) => void;
  onChangeTimeframe: (tf: number) => void;
  onEditIndicator: (ind: IndicatorConfig) => void;
  onToggleIndicatorVisibility: (id: string) => void;
  onRemoveIndicator: (id: string) => void;
  setAutoCenter: (v: boolean) => void;
  setShowTradeMarkers: (v: boolean) => void;
  setShowIndicatorsLegend: (v: boolean) => void;
  setShowRobots: (v: boolean) => void;
  fitChartTrigger: number;
  resetViewTrigger: number;
  drawings: DrawingItem[];
  onUpdateDrawing: (updated: DrawingItem) => void;
  onFinishDrawing: (newDrawing: DrawingItem) => void;
  onDeleteDrawing: (id: string) => void;
  activeDrawingTool: DrawingToolType | null;
  selectedDrawingId: string | null;
  onSelectDrawing: (d: DrawingItem | null) => void;
  onOpenDrawingSettings: (d: DrawingItem) => void;
  activeWidgets: WidgetConfig[];
  onUpdateWidget: (updated: WidgetConfig) => void;
  onRemoveWidget: (id: string) => void;
  isLightTheme: boolean;
  isBlackTheme: boolean;
  isSlateTheme: boolean;
  isMidnightTheme: boolean;
  showWidgets?: boolean;
}

export const TradeChartSlot: React.FC<TradeChartSlotProps> = ({
  slot,
  isMultiChart,
  isFocused,
  isMaximized,
  onFocus,
  onToggleMaximize,
  onChangePanel,
  onChangeTimeframe,
  onEditIndicator,
  onToggleIndicatorVisibility,
  onRemoveIndicator,
  setAutoCenter,
  setShowTradeMarkers,
  setShowIndicatorsLegend,
  setShowRobots,
  fitChartTrigger,
  resetViewTrigger,
  drawings,
  onUpdateDrawing,
  onFinishDrawing,
  onDeleteDrawing,
  activeDrawingTool,
  selectedDrawingId,
  onSelectDrawing,
  onOpenDrawingSettings,
  activeWidgets,
  onUpdateWidget,
  onRemoveWidget,
  isLightTheme,
  isBlackTheme,
  isSlateTheme,
  isMidnightTheme,
  showWidgets = true,
}) => {
  const { panels, activePanel, getPanelSnapshot, ensurePanelDataLoaded } = useApp() as any;
  const isMobile = useIsMobile();
  const slotContainerRef = useRef<HTMLDivElement | null>(null);

  const slotPanel = useMemo(() => {
    return (panels || []).find((p: any) => p.id === slot.panelId) || activePanel || null;
  }, [panels, slot.panelId, activePanel]);

  const effectivePanelId = slotPanel?.id || slot.panelId;

  useEffect(() => {
    if (effectivePanelId && ensurePanelDataLoaded) {
      ensurePanelDataLoaded(effectivePanelId);
    }
  }, [effectivePanelId, ensurePanelDataLoaded]);

  const snapshot = getPanelSnapshot
    ? getPanelSnapshot(effectivePanelId)
    : { candles: [], marketData: null, gammaLevels: null, isLoading: false, loadingProgress: null };

  const visibleIndicators = useMemo(
    () => (slot.indicators || []).filter(i => i.visible),
    [slot.indicators]
  );

  const rawPrice = snapshot.marketData?.price && snapshot.marketData.price !== '--'
    ? parseFloat(String(snapshot.marketData.price).replace(/[^\d.-]/g, ''))
    : null;
  const displayPrice = rawPrice && !isNaN(rawPrice) && rawPrice > 0
    ? rawPrice
    : (snapshot.candles && snapshot.candles.length > 0 ? snapshot.candles[snapshot.candles.length - 1].close : 0);

  const headerBg = isBlackTheme
    ? 'bg-[#09090b]/95 border-zinc-800/90 text-slate-200'
    : isSlateTheme
    ? 'bg-[#1a202e]/95 border-slate-700/80 text-slate-200'
    : isMidnightTheme
    ? 'bg-[#091229]/95 border-blue-900/60 text-slate-200'
    : 'bg-[#f1f5f9]/95 border-slate-300 text-slate-800';

  const selectBg = isBlackTheme
    ? 'bg-zinc-900 border-zinc-700 text-white'
    : isLightTheme
    ? 'bg-white border-slate-300 text-slate-900'
    : 'bg-[#2a3244] border-slate-600 text-slate-100';

  return (
    <div
      ref={slotContainerRef}
      onMouseDown={onFocus}
      className={`w-full h-full flex flex-col relative overflow-hidden transition-colors duration-150 ${
        isLightTheme ? 'bg-[#ffffff]' : 'bg-[#000000]'
      } ${
        isMultiChart
          ? isFocused
            ? 'ring-1 ring-inset ring-blue-500/90'
            : 'ring-1 ring-inset ring-slate-800/70'
          : ''
      }`}
    >
      {/* Mini-Header por Gráfico (Visível apenas no modo Multi-Gráfico) */}
      {isMultiChart && (
        <div
          className={`h-7 px-2 border-b flex items-center justify-between gap-2 shrink-0 select-none z-30 text-[11px] ${headerBg}`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Indicador de Foco */}
            <span
              className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                isFocused ? 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.9)]' : 'bg-slate-600'
              }`}
              title={isFocused ? 'Gráfico em Foco (Barra superior controla este gráfico)' : 'Clique para focar neste gráfico'}
            />

            {/* Seletor de Ativo do Slot */}
            <select
              value={effectivePanelId || ''}
              onChange={(e) => {
                e.stopPropagation();
                onChangePanel(e.target.value);
              }}
              onClick={(e) => e.stopPropagation()}
              className={`px-1.5 py-0.5 rounded border text-[11px] font-extrabold outline-none cursor-pointer max-w-[130px] truncate ${selectBg}`}
              title="Ativo / Painel deste gráfico"
            >
              {(panels || []).map((p: any) => {
                const cleanName = p.name ? p.name.replace(/\s*\([^)]*\)/g, '').trim() : 'Painel';
                return (
                  <option key={p.id} value={p.id} className="bg-[#181d28] text-slate-100">
                    {cleanName}
                  </option>
                );
              })}
            </select>

            {/* Seletor de Timeframe do Slot */}
            <select
              value={slot.timeframe}
              onChange={(e) => {
                e.stopPropagation();
                onChangeTimeframe(Number(e.target.value));
              }}
              onClick={(e) => e.stopPropagation()}
              className={`px-1.5 py-0.5 rounded border text-[11px] font-bold text-blue-400 outline-none cursor-pointer ${selectBg}`}
              title="Timeframe deste gráfico"
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

          <div className="flex items-center gap-2 shrink-0">
            {displayPrice > 0 && (
              <span className="font-mono text-[11px] font-bold text-emerald-400">
                {displayPrice.toFixed(2)}
              </span>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                onFocus();
                onToggleMaximize();
              }}
              className={`px-1.5 py-0.5 rounded border text-[10px] font-bold cursor-pointer transition ${
                isMaximized
                  ? 'bg-amber-600/30 border-amber-500/60 text-amber-300 hover:bg-amber-600/50'
                  : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
              title={isMaximized ? 'Restaurar grade multi-gráficos' : 'Maximizar este gráfico'}
            >
              {isMaximized ? '🗗' : '⛶'}
            </button>
          </div>
        </div>
      )}

      {/* Área do Gráfico */}
      <div className="flex-1 relative overflow-hidden">
        {/* Legenda de Indicadores */}
        {slot.showIndicatorsLegend && (
          <div className={`absolute ${isMobile ? 'top-12 left-2.5' : 'top-1.5 left-2'} z-20 flex flex-col gap-0.5 pointer-events-auto select-none`}>
            {slot.indicators.map((ind) => (
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
                    onClick={(e) => {
                      e.stopPropagation();
                      onFocus();
                      onEditIndicator(ind);
                    }}
                    className="text-slate-400 hover:text-blue-400 transition text-[9px] p-0 leading-none cursor-pointer"
                    title="Configurar Parâmetros"
                  >
                    ⚙️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleIndicatorVisibility(ind.id);
                    }}
                    className={`transition text-[9px] p-0 leading-none cursor-pointer ${
                      ind.visible ? 'text-slate-300 hover:text-white' : 'opacity-40 hover:opacity-100'
                    }`}
                    title={ind.visible ? 'Ocultar' : 'Exibir'}
                  >
                    {ind.visible ? '👁️' : '🙈'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveIndicator(ind.id);
                    }}
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

        {/* Widgets Flutuantes (exibidos no slot focado ou único) */}
        {showWidgets && (
          <ChartWidgetsOverlay
            widgets={activeWidgets}
            onUpdateWidget={onUpdateWidget}
            onRemoveWidget={onRemoveWidget}
            containerRef={slotContainerRef}
          />
        )}

        <CandleChart
          candles={snapshot.candles || []}
          panel={slotPanel}
          marketData={snapshot.marketData}
          isLoading={snapshot.isLoading}
          loadingProgress={snapshot.loadingProgress}
          timeframe={slot.timeframe}
          setTimeframe={onChangeTimeframe}
          activeIndicators={visibleIndicators}
          activeWidgets={activeWidgets}
          gammaLevels={snapshot.gammaLevels}
          instanceId={`${slotPanel?.instance_id || 'painel_principal'}_${slot.id}`}
          fitChartTrigger={fitChartTrigger}
          resetViewTrigger={resetViewTrigger}
          autoCenter={slot.autoCenter}
          setAutoCenter={setAutoCenter}
          showTradeMarkers={slot.showTradeMarkers}
          setShowTradeMarkers={setShowTradeMarkers}
          showOrderLines={slot.showOrderLines !== false}
          showIndicatorsLegend={slot.showIndicatorsLegend}
          setShowIndicatorsLegend={setShowIndicatorsLegend}
          showRobots={slot.showRobots}
          setShowRobots={setShowRobots}
          hideManualTradeBar={isMultiChart ? true : !isMobile}
          forceCandleView={true}
          drawings={drawings}
          onUpdateDrawing={onUpdateDrawing}
          onFinishDrawing={onFinishDrawing}
          onDeleteDrawing={onDeleteDrawing}
          activeDrawingTool={isFocused ? activeDrawingTool : null}
          selectedDrawingId={isFocused ? selectedDrawingId : null}
          onSelectDrawing={(d) => onSelectDrawing(d)}
          onOpenDrawingSettings={onOpenDrawingSettings}
        />
      </div>
    </div>
  );
};

TradeChartSlot.displayName = 'TradeChartSlot';
