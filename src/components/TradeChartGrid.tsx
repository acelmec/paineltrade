import React, { useRef, useState, useCallback } from 'react';
import type { ChartLayoutType, ChartSplitRatios } from '../types/chartLayout';
import { DEFAULT_SPLIT_RATIOS } from '../types/chartLayout';

interface TradeChartGridProps {
  layout: ChartLayoutType;
  ratios: ChartSplitRatios;
  onChangeRatios: (next: ChartSplitRatios) => void;
  maximizedSlotIndex: number | null;
  renderSlot: (slotIndex: number) => React.ReactNode;
  isBlackTheme?: boolean;
  isLightTheme?: boolean;
}

type DragTarget = 'vMain' | 'vCol1' | 'vCol2' | 'hMain' | 'hLeft' | 'hRight';

export const TradeChartGrid: React.FC<TradeChartGridProps> = ({
  layout,
  ratios,
  onChangeRatios,
  maximizedSlotIndex,
  renderSlot,
  isBlackTheme = true,
  isLightTheme = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leftColRef = useRef<HTMLDivElement | null>(null);
  const rightColRef = useRef<HTMLDivElement | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragTarget | null>(null);

  const clampRatio = (val: number, min = 0.15, max = 0.85) => Math.max(min, Math.min(max, val));

  const startDrag = useCallback(
    (target: DragTarget, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setActiveDrag(target);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        if (target === 'vMain') {
          const nextRatio = clampRatio((moveEvent.clientX - rect.left) / rect.width);
          onChangeRatios({ ...ratios, vMain: nextRatio });
        } else if (target === 'vCol1') {
          const rawCol1 = (moveEvent.clientX - rect.left) / rect.width;
          const maxCol1 = Math.max(0.15, 0.85 - ratios.vCol2);
          const nextCol1 = clampRatio(rawCol1, 0.15, maxCol1);
          onChangeRatios({ ...ratios, vCol1: nextCol1 });
        } else if (target === 'vCol2') {
          const rawEndCol2 = (moveEvent.clientX - rect.left) / rect.width;
          const nextCol2 = clampRatio(rawEndCol2 - ratios.vCol1, 0.15, 0.85 - ratios.vCol1);
          onChangeRatios({ ...ratios, vCol2: nextCol2 });
        } else if (target === 'hMain') {
          const nextRatio = clampRatio((moveEvent.clientY - rect.top) / rect.height);
          onChangeRatios({ ...ratios, hMain: nextRatio });
        } else if (target === 'hLeft') {
          const colRect = leftColRef.current?.getBoundingClientRect() || rect;
          const nextRatio = clampRatio((moveEvent.clientY - colRect.top) / colRect.height);
          onChangeRatios({ ...ratios, hLeft: nextRatio });
        } else if (target === 'hRight') {
          const colRect = rightColRef.current?.getBoundingClientRect() || rect;
          const nextRatio = clampRatio((moveEvent.clientY - colRect.top) / colRect.height);
          onChangeRatios({ ...ratios, hRight: nextRatio });
        }
      };

      const handleMouseUp = () => {
        setActiveDrag(null);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [ratios, onChangeRatios]
  );

  const resetRatio = useCallback(
    (target: DragTarget, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (target === 'vMain') onChangeRatios({ ...ratios, vMain: DEFAULT_SPLIT_RATIOS.vMain });
      else if (target === 'vCol1' || target === 'vCol2') {
        onChangeRatios({ ...ratios, vCol1: DEFAULT_SPLIT_RATIOS.vCol1, vCol2: DEFAULT_SPLIT_RATIOS.vCol2 });
      } else if (target === 'hMain') onChangeRatios({ ...ratios, hMain: DEFAULT_SPLIT_RATIOS.hMain });
      else if (target === 'hLeft') onChangeRatios({ ...ratios, hLeft: DEFAULT_SPLIT_RATIOS.hLeft });
      else if (target === 'hRight') onChangeRatios({ ...ratios, hRight: DEFAULT_SPLIT_RATIOS.hRight });
      setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
    },
    [ratios, onChangeRatios]
  );

  const splitterBaseClass = isBlackTheme
    ? 'bg-zinc-900 border-zinc-800 hover:bg-blue-500/80'
    : isLightTheme
    ? 'bg-slate-200 border-slate-300 hover:bg-blue-500/80'
    : 'bg-[#1a2233] border-slate-700 hover:bg-blue-500/80';

  const renderVSplitter = (target: DragTarget) => (
    <div
      onMouseDown={(e) => startDrag(target, e)}
      onDoubleClick={(e) => resetRatio(target, e)}
      title="Arraste para redimensionar os gráficos (Duplo clique para centralizar 50/50)"
      className={`w-1.5 h-full shrink-0 border-x cursor-col-resize flex items-center justify-center select-none transition-colors z-30 group ${splitterBaseClass} ${
        activeDrag === target ? '!bg-blue-500' : ''
      }`}
    >
      <div className="w-0.5 h-8 rounded-full bg-slate-500/70 group-hover:bg-white transition-colors" />
    </div>
  );

  const renderHSplitter = (target: DragTarget) => (
    <div
      onMouseDown={(e) => startDrag(target, e)}
      onDoubleClick={(e) => resetRatio(target, e)}
      title="Arraste para redimensionar os gráficos (Duplo clique para centralizar 50/50)"
      className={`h-1.5 w-full shrink-0 border-y cursor-row-resize flex items-center justify-center select-none transition-colors z-30 group ${splitterBaseClass} ${
        activeDrag === target ? '!bg-blue-500' : ''
      }`}
    >
      <div className="h-0.5 w-8 rounded-full bg-slate-500/70 group-hover:bg-white transition-colors" />
    </div>
  );

  const effectiveLayout: ChartLayoutType =
    maximizedSlotIndex !== null ? 'single' : layout;

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden flex">
      {/* Overlay transparente durante arraste para que o canvas dos gráficos não roube eventos do mouse */}
      {activeDrag && (
        <div
          className={`fixed inset-0 z-[99999] ${
            activeDrag.startsWith('v') ? 'cursor-col-resize' : 'cursor-row-resize'
          }`}
        />
      )}

      {effectiveLayout === 'single' && (
        <div className="w-full h-full overflow-hidden">
          {renderSlot(maximizedSlotIndex !== null ? maximizedSlotIndex : 0)}
        </div>
      )}

      {effectiveLayout === 'split-v' && (
        <div className="w-full h-full flex flex-row overflow-hidden">
          <div style={{ width: `${ratios.vMain * 100}%` }} className="h-full overflow-hidden shrink-0">
            {renderSlot(0)}
          </div>
          {renderVSplitter('vMain')}
          <div className="flex-1 h-full overflow-hidden min-w-0">
            {renderSlot(1)}
          </div>
        </div>
      )}

      {effectiveLayout === 'split-h' && (
        <div className="w-full h-full flex flex-col overflow-hidden">
          <div style={{ height: `${ratios.hMain * 100}%` }} className="w-full overflow-hidden shrink-0">
            {renderSlot(0)}
          </div>
          {renderHSplitter('hMain')}
          <div className="flex-1 w-full overflow-hidden min-h-0">
            {renderSlot(1)}
          </div>
        </div>
      )}

      {effectiveLayout === 'triple-mixed-left' && (
        <div className="w-full h-full flex flex-row overflow-hidden">
          <div style={{ width: `${ratios.vMain * 100}%` }} className="h-full overflow-hidden shrink-0">
            {renderSlot(0)}
          </div>
          {renderVSplitter('vMain')}
          <div ref={rightColRef} className="flex-1 h-full flex flex-col overflow-hidden min-w-0">
            <div style={{ height: `${ratios.hRight * 100}%` }} className="w-full overflow-hidden shrink-0">
              {renderSlot(1)}
            </div>
            {renderHSplitter('hRight')}
            <div className="flex-1 w-full overflow-hidden min-h-0">
              {renderSlot(2)}
            </div>
          </div>
        </div>
      )}

      {effectiveLayout === 'triple-mixed-right' && (
        <div className="w-full h-full flex flex-row overflow-hidden">
          <div ref={leftColRef} style={{ width: `${ratios.vMain * 100}%` }} className="h-full flex flex-col overflow-hidden shrink-0">
            <div style={{ height: `${ratios.hLeft * 100}%` }} className="w-full overflow-hidden shrink-0">
              {renderSlot(0)}
            </div>
            {renderHSplitter('hLeft')}
            <div className="flex-1 w-full overflow-hidden min-h-0">
              {renderSlot(1)}
            </div>
          </div>
          {renderVSplitter('vMain')}
          <div className="flex-1 h-full overflow-hidden min-w-0">
            {renderSlot(2)}
          </div>
        </div>
      )}

      {effectiveLayout === 'triple-cols' && (
        <div className="w-full h-full flex flex-row overflow-hidden">
          <div style={{ width: `${ratios.vCol1 * 100}%` }} className="h-full overflow-hidden shrink-0">
            {renderSlot(0)}
          </div>
          {renderVSplitter('vCol1')}
          <div style={{ width: `${ratios.vCol2 * 100}%` }} className="h-full overflow-hidden shrink-0">
            {renderSlot(1)}
          </div>
          {renderVSplitter('vCol2')}
          <div className="flex-1 h-full overflow-hidden min-w-0">
            {renderSlot(2)}
          </div>
        </div>
      )}

      {effectiveLayout === 'quad' && (
        <div className="w-full h-full flex flex-row overflow-hidden">
          <div ref={leftColRef} style={{ width: `${ratios.vMain * 100}%` }} className="h-full flex flex-col overflow-hidden shrink-0">
            <div style={{ height: `${ratios.hLeft * 100}%` }} className="w-full overflow-hidden shrink-0">
              {renderSlot(0)}
            </div>
            {renderHSplitter('hLeft')}
            <div className="flex-1 w-full overflow-hidden min-h-0">
              {renderSlot(2)}
            </div>
          </div>
          {renderVSplitter('vMain')}
          <div ref={rightColRef} className="flex-1 h-full flex flex-col overflow-hidden min-w-0">
            <div style={{ height: `${ratios.hRight * 100}%` }} className="w-full overflow-hidden shrink-0">
              {renderSlot(1)}
            </div>
            {renderHSplitter('hRight')}
            <div className="flex-1 w-full overflow-hidden min-h-0">
              {renderSlot(3)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

TradeChartGrid.displayName = 'TradeChartGrid';
