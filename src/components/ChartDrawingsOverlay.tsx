import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { DrawingItem, DrawingPoint, DrawingToolType, TriggerExecutionType } from '../types/chartDrawings';
import { calculateFibonacciPrices, createNewDrawing } from '../utils/drawingEngine';
import { FIB_LEVELS } from '../types/chartDrawings';
import { useApp } from '../context/AppContext';
import { recordChartError } from '../utils/chartErrorLogger';
import { resolvePanelTickSize, roundToTick } from '../services/db';

interface ChartDrawingsOverlayProps {
  drawings: DrawingItem[];
  activeTool: DrawingToolType | null;
  onFinishDrawing: (newDrawing: DrawingItem) => void;
  onUpdateDrawing: (updated: DrawingItem) => void;
  onSelectDrawing: (drawing: DrawingItem | null) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  seriesRef: React.RefObject<any>;
  chartRef: React.RefObject<any>;
  currentSymbol?: string;
  tickSize?: number;
  currentAccountId?: string;
  selectedDrawingId: string | null;
  onOpenSettings: (drawing: DrawingItem) => void;
  onDeleteDrawing?: (id: string) => void;
  timeframe?: number;
  chartData?: any[];
  registerRedrawRef?: React.MutableRefObject<(() => void) | null>;
}

// Helper: Distância euclidiana de um ponto até um segmento de reta
function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

export const ChartDrawingsOverlay: React.FC<ChartDrawingsOverlayProps> = ({
  drawings,
  activeTool,
  onFinishDrawing,
  onUpdateDrawing,
  onSelectDrawing,
  containerRef,
  seriesRef,
  chartRef,
  currentSymbol,
  tickSize,
  currentAccountId,
  selectedDrawingId,
  onOpenSettings,
  onDeleteDrawing,
  timeframe,
  chartData,
  registerRedrawRef
}) => {
  const { customStrategies, addLog } = useApp() as any;
  const effectiveTickSize = (tickSize && tickSize > 0) ? tickSize : resolvePanelTickSize({ name: currentSymbol });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastClickRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const isHoveringRef = useRef<boolean>(false);

  // Listener para excluir o desenho selecionado ao pressionar a tecla DELETE ou BACKSPACE
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
        e.preventDefault();
        if (onDeleteDrawing) {
          onDeleteDrawing(selectedDrawingId);
        }
        onSelectDrawing(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDrawingId, onDeleteDrawing, onSelectDrawing]);

  // In-progress drawing state
  const [drawingPoints, setDrawingPoints] = useState<DrawingPoint[]>([]);
  const [hoverPoint, setHoverPoint] = useState<DrawingPoint | null>(null);

  // Dragging state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isHoveringDrawing, setIsHoveringDrawing] = useState<boolean>(false);
  const [dragTarget, setDragTarget] = useState<{
    drawingId: string;
    pointIndex: number | 'all' | 'channel_width';
    startMouseX: number;
    startMouseY: number;
    startPrice: number;
    initialPoints: DrawingPoint[];
    initialDistance?: number;
  } | null>(null);

  // Converter Preço e Ponto para Coordenadas X, Y em Pixels com equivalência perfeita entre timeframes
  const pointToPixels = useCallback((point: DrawingPoint): { x: number; y: number } | null => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!container) return null;

    const cHeight = container.clientHeight || 400;

    let y: number | null = null;
    if (series && series.priceToCoordinate) {
      y = series.priceToCoordinate(point.price);
    }

    if (y === null || isNaN(y)) {
      const pTop = series && series.coordinateToPrice ? series.coordinateToPrice(0) : null;
      const pBottom = series && series.coordinateToPrice ? series.coordinateToPrice(cHeight) : null;
      if (pTop !== null && pBottom !== null && pTop !== pBottom) {
        y = ((point.price - pTop) / (pBottom - pTop)) * cHeight;
      }
    }

    let x: number | null = null;
    if (chart) {
      const timeScale = chart.timeScale();
      if (timeScale) {
        const timeInSec = point.time > 10000000000 ? Math.floor(point.time / 1000) : point.time;
        
        // 1. Tentar conversão direta nativa pelo timestamp do Lightweight Charts
        x = timeScale.timeToCoordinate(timeInSec as any);

        // 2. Se não encontrou exato (mudança de timeframe, candles agregados ou projeção à direita):
        if ((x === null || isNaN(x)) && chartData && chartData.length > 0) {
          const n = chartData.length;
          const firstTime = Number(chartData[0].time);
          const lastTime = Number(chartData[n - 1].time);
          const barIntervalSec = Math.max(1, (timeframe || 1)) * 60;

          if (timeInSec >= lastTime) {
            // Projeção futura à direita do último candle
            const barsAhead = (timeInSec - lastTime) / barIntervalSec;
            const targetLogical = (n - 1) + barsAhead;
            if (timeScale.logicalToCoordinate) {
              x = timeScale.logicalToCoordinate(targetLogical);
            }
          } else if (timeInSec <= firstTime) {
            // Projeção passada à esquerda do primeiro candle
            const barsBefore = (timeInSec - firstTime) / barIntervalSec;
            const targetLogical = 0 + barsBefore;
            if (timeScale.logicalToCoordinate) {
              x = timeScale.logicalToCoordinate(targetLogical);
            }
          } else {
            // Interpolação binária exata dentro do histórico de candles
            let low = 0;
            let high = n - 1;
            while (low <= high) {
              const mid = Math.floor((low + high) / 2);
              const midTime = Number(chartData[mid].time);
              if (midTime === timeInSec) {
                low = mid;
                high = mid;
                break;
              } else if (midTime < timeInSec) {
                low = mid + 1;
              } else {
                high = mid - 1;
              }
            }

            const baseIdx = Math.max(0, Math.min(n - 2, high));
            const tA = Number(chartData[baseIdx].time);
            const tB = Number(chartData[baseIdx + 1].time);
            const ratio = tB > tA ? (timeInSec - tA) / (tB - tA) : 0;
            const targetLogical = baseIdx + ratio;

            if (timeScale.logicalToCoordinate) {
              x = timeScale.logicalToCoordinate(targetLogical);
            }
          }
        }
      }
    }

    if (x === null || isNaN(x)) {
      return null;
    }

    return { x, y: y ?? cHeight / 2 };
  }, [seriesRef, chartRef, containerRef, chartData, timeframe]);

  // Converter Pixels do Mouse para Preço e Timestamp Universal (independente de timeframe)
  const pixelsToCoords = useCallback((mouseX: number, mouseY: number): DrawingPoint | null => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    const cHeight = rect.height || 400;

    let price: number | null = null;
    if (series && series.coordinateToPrice) {
      price = series.coordinateToPrice(mouseY);
    }

    if (price === null || isNaN(price) || price <= 0) {
      const pTop = series && series.coordinateToPrice ? series.coordinateToPrice(0) : null;
      const pBottom = series && series.coordinateToPrice ? series.coordinateToPrice(cHeight) : null;
      if (pTop !== null && pBottom !== null && pTop !== pBottom) {
        price = pTop + (mouseY / cHeight) * (pBottom - pTop);
      }
    }

    let time = Date.now();

    if (chart) {
      const timeScale = chart.timeScale();
      if (timeScale) {
        if (chartData && chartData.length > 0 && timeScale.coordinateToLogical) {
          const logical = timeScale.coordinateToLogical(mouseX);
          if (logical !== null && !isNaN(logical)) {
            const n = chartData.length;
            const firstTime = Number(chartData[0].time);
            const lastTime = Number(chartData[n - 1].time);
            const barIntervalSec = Math.max(1, (timeframe || 1)) * 60;

            if (logical >= n - 1) {
              const barsAhead = logical - (n - 1);
              const timeInSec = lastTime + barsAhead * barIntervalSec;
              time = Math.round(timeInSec * 1000);
            } else if (logical <= 0) {
              const barsBefore = logical - 0;
              const timeInSec = firstTime + barsBefore * barIntervalSec;
              time = Math.round(timeInSec * 1000);
            } else {
              const baseIdx = Math.floor(logical);
              const frac = logical - baseIdx;
              const tA = Number(chartData[baseIdx].time);
              const tB = Number(chartData[Math.min(n - 1, baseIdx + 1)].time);
              const timeInSec = tA + frac * (tB - tA);
              time = Math.round(timeInSec * 1000);
            }
          }
        } else {
          const directTime = timeScale.coordinateToTime(mouseX);
          if (directTime) {
            time = typeof directTime === 'number' ? (directTime < 10000000000 ? directTime * 1000 : directTime) : new Date(directTime as any).getTime();
          }
        }
      }
    }

    if (!price || isNaN(price)) {
      price = 20000.0;
    }

    return {
      time,
      price: roundToTick(price, effectiveTickSize)
    };
  }, [seriesRef, chartRef, containerRef, chartData, timeframe, effectiveTickSize]);

  // Helper para verificar se um clique ou cursor está sobre algum desenho (do timeframe atual)
  const findDrawingAtCoords = useCallback((mouseX: number, mouseY: number): { drawing: DrawingItem; hitIndex: number | 'all' | 'channel_width' } | null => {
    const currentTf = timeframe || 1;
    for (const d of drawings) {
      if (!d.visible) continue;
      if ((d.timeframe || 1) !== currentTf) continue;

      if (d.type === 'horizontal_line' && d.points.length >= 1) {
        const pt = pointToPixels(d.points[0]);
        if (pt && Math.abs(mouseY - pt.y) <= 8) {
          return { drawing: d, hitIndex: 0 };
        }
      } else if (d.type === 'text' && d.points.length >= 1) {
        const pt = pointToPixels(d.points[0]);
        if (pt) {
          // Bounding box aproximado do texto
          const text = d.textValue || 'Texto';
          const fontSize = d.textFontSize || 13;
          const estimatedWidth = Math.max(40, text.length * (fontSize * 0.65));
          const estimatedHeight = fontSize + 10;
          if (
            mouseX >= pt.x - 8 &&
            mouseX <= pt.x + estimatedWidth + 8 &&
            mouseY >= pt.y - estimatedHeight &&
            mouseY <= pt.y + 8
          ) {
            return { drawing: d, hitIndex: 0 };
          }
        }
      } else if (d.type === 'arrow' && d.points.length >= 2) {
        const pts = d.points.map(p => pointToPixels(p)).filter(Boolean) as { x: number; y: number }[];
        // Checar clique em nós/âncoras
        for (let i = 0; i < pts.length; i++) {
          if (Math.hypot(mouseX - pts[i].x, mouseY - pts[i].y) <= 10) {
            return { drawing: d, hitIndex: i };
          }
        }
        // Checar segmentos de reta
        for (let i = 0; i < pts.length - 1; i++) {
          if (distanceToSegment(mouseX, mouseY, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= 8) {
            return { drawing: d, hitIndex: 'all' };
          }
        }
      } else if (d.type === 'ruler' && d.points.length >= 2) {
        const pt1 = pointToPixels(d.points[0]);
        const pt2 = pointToPixels(d.points[1]);
        if (pt1 && pt2) {
          if (Math.hypot(mouseX - pt1.x, mouseY - pt1.y) <= 10) return { drawing: d, hitIndex: 0 };
          if (Math.hypot(mouseX - pt2.x, mouseY - pt2.y) <= 10) return { drawing: d, hitIndex: 1 };
          const minX = Math.min(pt1.x, pt2.x);
          const maxX = Math.max(pt1.x, pt2.x);
          const minY = Math.min(pt1.y, pt2.y);
          const maxY = Math.max(pt1.y, pt2.y);
          if (mouseX >= minX - 6 && mouseX <= maxX + 6 && mouseY >= minY - 6 && mouseY <= maxY + 6) {
            return { drawing: d, hitIndex: 'all' };
          }
        }
      } else if (d.type === 'channel' && d.points.length >= 2) {
        const pt1 = pointToPixels(d.points[0]);
        const pt2 = pointToPixels(d.points[1]);
        if (pt1 && pt2) {
          const dist = d.channelDistancePts || 30;
          const upperPt1 = pointToPixels({ ...d.points[0], price: d.points[0].price + dist });
          const upperPt2 = pointToPixels({ ...d.points[1], price: d.points[1].price + dist });
          const lowerPt1 = pointToPixels({ ...d.points[0], price: d.points[0].price - dist });
          const lowerPt2 = pointToPixels({ ...d.points[1], price: d.points[1].price - dist });

          // Checar alça de ajuste de largura superior
          if (upperPt1 && upperPt2) {
            const midUpperX = (upperPt1.x + upperPt2.x) / 2;
            const midUpperY = (upperPt1.y + upperPt2.y) / 2;
            if (Math.hypot(mouseX - midUpperX, mouseY - midUpperY) <= 10) {
              return { drawing: d, hitIndex: 'channel_width' };
            }
          }

          // Checar âncoras da linha central
          if (Math.hypot(mouseX - pt1.x, mouseY - pt1.y) <= 10) return { drawing: d, hitIndex: 0 };
          if (Math.hypot(mouseX - pt2.x, mouseY - pt2.y) <= 10) return { drawing: d, hitIndex: 1 };

          // Checar se clicou na linha central
          if (distanceToSegment(mouseX, mouseY, pt1.x, pt1.y, pt2.x, pt2.y) <= 8) {
            return { drawing: d, hitIndex: 'all' };
          }
          // Checar se clicou na linha superior
          if (upperPt1 && upperPt2 && distanceToSegment(mouseX, mouseY, upperPt1.x, upperPt1.y, upperPt2.x, upperPt2.y) <= 8) {
            return { drawing: d, hitIndex: 'channel_width' };
          }
          // Checar se clicou na linha inferior
          if (lowerPt1 && lowerPt2 && distanceToSegment(mouseX, mouseY, lowerPt1.x, lowerPt1.y, lowerPt2.x, lowerPt2.y) <= 8) {
            return { drawing: d, hitIndex: 'channel_width' };
          }
        }
      } else if (d.points.length >= 2) {
        const pt1 = pointToPixels(d.points[0]);
        const pt2 = pointToPixels(d.points[1]);
        if (pt1 && pt2) {
          // Checar âncoras
          if (Math.hypot(mouseX - pt1.x, mouseY - pt1.y) <= 10) return { drawing: d, hitIndex: 0 };
          if (Math.hypot(mouseX - pt2.x, mouseY - pt2.y) <= 10) return { drawing: d, hitIndex: 1 };

          if (d.type === 'trend_line') {
            if (distanceToSegment(mouseX, mouseY, pt1.x, pt1.y, pt2.x, pt2.y) <= 8) {
              return { drawing: d, hitIndex: 'all' };
            }
          } else if (d.type === 'rectangle') {
            const minX = Math.min(pt1.x, pt2.x);
            const maxX = Math.max(pt1.x, pt2.x);
            const minY = Math.min(pt1.y, pt2.y);
            const maxY = Math.max(pt1.y, pt2.y);
            const nearLeft = Math.abs(mouseX - minX) <= 8 && mouseY >= minY - 6 && mouseY <= maxY + 6;
            const nearRight = Math.abs(mouseX - maxX) <= 8 && mouseY >= minY - 6 && mouseY <= maxY + 6;
            const nearTop = Math.abs(mouseY - minY) <= 8 && mouseX >= minX - 6 && mouseX <= maxX + 6;
            const nearBottom = Math.abs(mouseY - maxY) <= 8 && mouseX >= minX - 6 && mouseX <= maxX + 6;
            if (nearLeft || nearRight || nearTop || nearBottom) {
              return { drawing: d, hitIndex: 'all' };
            }
          } else if (d.type === 'fibonacci') {
            const startX = Math.min(pt1.x, pt2.x) - 10;
            const endX = Math.max(pt1.x, pt2.x, 800) + 10;
            const fibs = calculateFibonacciPrices(d.points[0], d.points[1]);
            for (const f of fibs) {
              const fPt = pointToPixels({ ...d.points[0], price: f.price });
              if (fPt && mouseX >= startX && mouseX <= endX && Math.abs(mouseY - fPt.y) <= 8) {
                return { drawing: d, hitIndex: 'all' };
              }
            }
          }
        }
      }
    }
    return null;
  }, [drawings, pointToPixels, timeframe]);

  // Listener de mouse no container do gráfico para ativar o cursor/hover suavemente
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (activeTool) return;
      // Se o botão do mouse estiver pressionado arrastando o gráfico (pan), não recalcular hit-test nem disparar setState
      if (e.buttons !== 0 && !isDragging) {
        if (isHoveringRef.current) {
          isHoveringRef.current = false;
          setIsHoveringDrawing(false);
        }
        return;
      }
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const hit = findDrawingAtCoords(mouseX, mouseY);
      const nextHover = Boolean(hit);
      if (nextHover !== isHoveringRef.current) {
        isHoveringRef.current = nextHover;
        setIsHoveringDrawing(nextHover);
      }
    };

    const handleGlobalMouseDown = (e: MouseEvent) => {
      if (activeTool) return;
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const hit = findDrawingAtCoords(mouseX, mouseY);
      if (!hit && selectedDrawingId) {
        onSelectDrawing(null);
      }
    };

    container.addEventListener('mousemove', handleGlobalMouseMove, { passive: true });
    container.addEventListener('mousedown', handleGlobalMouseDown, { capture: true });
    return () => {
      container.removeEventListener('mousemove', handleGlobalMouseMove);
      container.removeEventListener('mousedown', handleGlobalMouseDown, { capture: true });
    };
  }, [containerRef, findDrawingAtCoords, activeTool, selectedDrawingId, onSelectDrawing, isDragging]);

  // Redesenhar Canvas em cada frame
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 400;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    try {
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const currentTf = timeframe || 1;

      // 1. Renderizar apenas desenhos pertencentes ao Timeframe Atual
    drawings.forEach(d => {
      if (!d.visible) return;
      if ((d.timeframe || 1) !== currentTf) return;
      const isSelected = selectedDrawingId === d.id;

      ctx.strokeStyle = d.color;
      ctx.fillStyle = d.fillColor || d.color;
      ctx.lineWidth = isSelected ? d.lineWidth + 1.5 : d.lineWidth;
      ctx.setLineDash(d.lineStyle === 2 ? [6, 4] : d.lineStyle === 1 ? [2, 2] : []);

      // A. LINHA HORIZONTAL
      if (d.type === 'horizontal_line' && d.points.length >= 1) {
        const pt = pointToPixels(d.points[0]);
        if (pt) {
          ctx.beginPath();
          ctx.moveTo(0, pt.y);
          ctx.lineTo(width, pt.y);
          ctx.stroke();

          // Marcador de arrasto no centro se selecionado
          if (isSelected) {
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(width / 2, pt.y, 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }

          // Badge de preço e gatilho padrão (RV / RP / Robô) à direita
          const hasTrigger = d.trigger && d.trigger.enabled && (d.trigger.status === 'armed' || d.trigger.status === 'waiting_algo');
          const isWaitingAlgo = d.trigger?.status === 'waiting_algo';
          const triggerModeStr = d.trigger?.mode === 'breakout' ? 'RP' : 'RV';
          const algoSuffix = isWaitingAlgo ? ` ⏳ [${d.trigger?.targetAlgorithmName || 'Robô'}]` : (d.trigger?.executionType === 'algorithm' ? ` [${d.trigger?.targetAlgorithmName || 'Robô'}]` : '');
          const badgeText = `${hasTrigger ? `⚡ ${triggerModeStr}${algoSuffix} ` : ''}${d.points[0].price.toFixed(2)}`;
          
          ctx.font = 'bold 10px JetBrains Mono, monospace';
          const textWidth = ctx.measureText(badgeText).width;
          const badgeX = width - textWidth - 14;
          const badgeY = pt.y - 9;

          ctx.fillStyle = isWaitingAlgo
            ? '#78350f'
            : hasTrigger
            ? (d.trigger?.mode === 'breakout' ? '#1e3a8a' : '#581c87')
            : (isSelected ? '#0284c7' : '#0f172a');
          ctx.strokeStyle = isWaitingAlgo
            ? '#f59e0b'
            : hasTrigger
            ? (d.trigger?.mode === 'breakout' ? '#60a5fa' : '#c084fc')
            : d.color;
          ctx.lineWidth = 1;
          ctx.fillRect(badgeX, badgeY, textWidth + 10, 18);
          ctx.strokeRect(badgeX, badgeY, textWidth + 10, 18);

          ctx.fillStyle = '#ffffff';
          ctx.fillText(badgeText, badgeX + 5, badgeY + 13);
        }
      }

      // B. LINHA DE TENDÊNCIA
      if (d.type === 'trend_line' && d.points.length >= 2) {
        const pt1 = pointToPixels(d.points[0]);
        const pt2 = pointToPixels(d.points[1]);
        if (pt1 && pt2) {
          ctx.beginPath();
          ctx.moveTo(pt1.x, pt1.y);
          ctx.lineTo(pt2.x, pt2.y);
          ctx.stroke();

          // Badge indicador da operação no fim da linha
          const hasTrigger = d.trigger && d.trigger.enabled && (d.trigger.status === 'armed' || d.trigger.status === 'waiting_algo');
          const isWaitingAlgo = d.trigger?.status === 'waiting_algo';
          const triggerModeStr = d.trigger?.mode === 'breakout' ? 'RP' : 'RV';
          const algoSuffix = isWaitingAlgo ? ` ⏳ [${d.trigger?.targetAlgorithmName || 'Robô'}]` : (d.trigger?.executionType === 'algorithm' ? ` [${d.trigger?.targetAlgorithmName || 'Robô'}]` : '');

          if (hasTrigger) {
            ctx.font = 'bold 9px JetBrains Mono, monospace';
            ctx.fillStyle = isWaitingAlgo ? '#f59e0b' : (d.trigger?.mode === 'breakout' ? '#60a5fa' : '#c084fc');
            ctx.fillText(`⚡ ${triggerModeStr}${algoSuffix}`, pt2.x + 4, pt2.y);
          }

          if (isSelected) {
            [pt1, pt2].forEach(p => {
              ctx.fillStyle = '#ffffff';
              ctx.strokeStyle = '#0284c7';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            });
          }
        }
      }

      // C. ELEMENTO DE TEXTO
      if (d.type === 'text' && d.points.length >= 1) {
        const pt = pointToPixels(d.points[0]);
        if (pt) {
          const fontSize = d.textFontSize || 13;
          const text = d.textValue || 'Texto';
          ctx.font = `bold ${fontSize}px sans-serif`;
          const textMetrics = ctx.measureText(text);
          const textWidth = textMetrics.width;

          if (isSelected) {
            // Caixa de seleção e fundo suave
            ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
            ctx.fillRect(pt.x - 4, pt.y - fontSize - 4, textWidth + 8, fontSize + 8);
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(pt.x - 4, pt.y - fontSize - 4, textWidth + 8, fontSize + 8);
            ctx.setLineDash([]);

            // Âncora de controle
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(pt.x - 4, pt.y - fontSize / 2, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }

          ctx.fillStyle = d.color || '#ffffff';
          ctx.fillText(text, pt.x, pt.y);
        }
      }

      // D. ZIGUE-ZAGUE COM FLECHA (ARROW)
      if (d.type === 'arrow' && d.points.length >= 2) {
        const pixelPoints = d.points.map(p => pointToPixels(p)).filter(Boolean) as { x: number; y: number }[];
        if (pixelPoints.length >= 2) {
          ctx.setLineDash(d.lineStyle === 2 ? [6, 4] : d.lineStyle === 1 ? [2, 2] : []);
          ctx.beginPath();
          ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);
          for (let i = 1; i < pixelPoints.length; i++) {
            ctx.lineTo(pixelPoints[i].x, pixelPoints[i].y);
          }
          ctx.stroke();

          // Desenhar ponta de flecha no último segmento (alinhada exatamente ao vetor de direção do traço)
          let pPrev = pixelPoints[pixelPoints.length - 2];
          const pLast = pixelPoints[pixelPoints.length - 1];
          // Se o penúltimo ponto for excessivamente próximo do último, busca retroativamente o ponto anterior com distância válida
          let angle = Math.atan2(pLast.y - pPrev.y, pLast.x - pPrev.x);
          for (let k = pixelPoints.length - 2; k >= 0; k--) {
            const dist = Math.hypot(pLast.x - pixelPoints[k].x, pLast.y - pixelPoints[k].y);
            if (dist >= 3) {
              angle = Math.atan2(pLast.y - pixelPoints[k].y, pLast.x - pixelPoints[k].x);
              break;
            }
          }
          const arrowLength = 16;
          const arrowAngle = Math.PI / 6; // 30 graus

          // A ponta de flecha deve ser sempre preenchida de forma sólida sem traço pontilhado
          ctx.setLineDash([]);
          ctx.fillStyle = d.color;
          ctx.beginPath();
          ctx.moveTo(pLast.x, pLast.y);
          ctx.lineTo(
            pLast.x - arrowLength * Math.cos(angle - arrowAngle),
            pLast.y - arrowLength * Math.sin(angle - arrowAngle)
          );
          ctx.lineTo(
            pLast.x - (arrowLength * 0.7) * Math.cos(angle),
            pLast.y - (arrowLength * 0.7) * Math.sin(angle)
          );
          ctx.lineTo(
            pLast.x - arrowLength * Math.cos(angle + arrowAngle),
            pLast.y - arrowLength * Math.sin(angle + arrowAngle)
          );
          ctx.closePath();
          ctx.fill();

          if (isSelected) {
            pixelPoints.forEach(p => {
              ctx.fillStyle = '#ffffff';
              ctx.strokeStyle = '#0284c7';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            });
          }
        }
      }

      // E. RÉGUA DE MEDIÇÃO (RULER)
      if (d.type === 'ruler' && d.points.length >= 2) {
        const pt1 = pointToPixels(d.points[0]);
        const pt2 = pointToPixels(d.points[1]);
        if (pt1 && pt2) {
          const rx = Math.min(pt1.x, pt2.x);
          const ry = Math.min(pt1.y, pt2.y);
          const rw = Math.max(1, Math.abs(pt2.x - pt1.x));
          const rh = Math.max(1, Math.abs(pt2.y - pt1.y));

          // Área sombreada da régua
          ctx.fillStyle = d.color || '#38bdf8';
          ctx.globalAlpha = 0.12;
          ctx.fillRect(rx, ry, rw, rh);
          ctx.globalAlpha = 1.0;

          // Borda tracejada
          ctx.strokeStyle = d.color || '#38bdf8';
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(rx, ry, rw, rh);
          ctx.setLineDash([]);

          // Linha diagonal guia
          ctx.beginPath();
          ctx.moveTo(pt1.x, pt1.y);
          ctx.lineTo(pt2.x, pt2.y);
          ctx.stroke();

          // Cálculos da medição: Pontos e Candles
          const deltaPrice = d.points[1].price - d.points[0].price;
          const absDeltaPrice = Math.abs(deltaPrice);
          const barIntervalSec = Math.max(1, (timeframe || 1)) * 60;
          const barCount = Math.max(1, Math.round(Math.abs(d.points[1].time - d.points[0].time) / (barIntervalSec * 1000)));
          const signStr = deltaPrice >= 0 ? '+' : '-';
          const badgeText = `📏 ${signStr}${absDeltaPrice.toFixed(2)} pts | ${barCount} candles`;

          ctx.font = 'bold 10px JetBrains Mono, monospace';
          const textMetrics = ctx.measureText(badgeText);
          const badgeW = textMetrics.width + 16;
          const badgeH = 20;
          const centerX = (pt1.x + pt2.x) / 2;
          const centerY = (pt1.y + pt2.y) / 2;
          const bX = Math.max(10, Math.min(width - badgeW - 10, centerX - badgeW / 2));
          const bY = Math.max(10, Math.min(height - badgeH - 10, centerY - badgeH / 2));

          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = d.color || '#38bdf8';
          ctx.lineWidth = 1.5;
          ctx.fillRect(bX, bY, badgeW, badgeH);
          ctx.strokeRect(bX, bY, badgeW, badgeH);

          ctx.fillStyle = deltaPrice >= 0 ? '#4ade80' : '#f87171';
          ctx.fillText(badgeText, bX + 8, bY + 14);

          if (isSelected) {
            [pt1, pt2].forEach(p => {
              ctx.fillStyle = '#ffffff';
              ctx.strokeStyle = '#0284c7';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            });
          }
        }
      }

      // F. RETÂNGULO (REGIÃO / BOX)
      if (d.type === 'rectangle' && d.points.length >= 2) {
        const pt1 = pointToPixels(d.points[0]);
        const pt2 = pointToPixels(d.points[1]);
        if (pt1 && pt2) {
          const rx = Math.min(pt1.x, pt2.x);
          const ry = Math.min(pt1.y, pt2.y);
          const rw = Math.abs(pt2.x - pt1.x);
          const rh = Math.abs(pt2.y - pt1.y);

          ctx.globalAlpha = d.fillOpacity || 0.15;
          ctx.fillRect(rx, ry, rw, rh);
          ctx.globalAlpha = 1.0;

          ctx.beginPath();
          ctx.rect(rx, ry, rw, rh);
          ctx.stroke();

          // Preços nos cantos e Badge da Operação (Top e Bottom)
          const isArmed = d.trigger && d.trigger.enabled && (d.trigger.status === 'armed' || d.trigger.status === 'waiting_algo');
          const isWaitingAlgo = d.trigger?.status === 'waiting_algo';
          const triggerModeStr = d.trigger?.mode === 'breakout' ? 'RP' : 'RV';
          const algoSuffix = isWaitingAlgo ? ` ⏳ [${d.trigger?.targetAlgorithmName || 'Robô'}]` : (d.trigger?.executionType === 'algorithm' ? ` [${d.trigger?.targetAlgorithmName || 'Robô'}]` : '');
          const badgeText = isArmed ? ` [⚡ ${triggerModeStr}${algoSuffix}]` : '';

          ctx.font = 'bold 9px JetBrains Mono, monospace';
          ctx.fillStyle = isWaitingAlgo ? '#f59e0b' : d.color;
          const maxP = Math.max(d.points[0].price, d.points[1].price).toFixed(2);
          const minP = Math.min(d.points[0].price, d.points[1].price).toFixed(2);
          ctx.fillText(`${maxP}${badgeText}`, rx + 4, ry + 12);
          ctx.fillText(`${minP}${badgeText}`, rx + 4, ry + rh - 4);

          if (isSelected) {
            [pt1, pt2].forEach(p => {
              ctx.fillStyle = '#ffffff';
              ctx.strokeStyle = '#0284c7';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            });
          }
        }
      }

      // G. RETRAÇÃO DE FIBONACCI
      if (d.type === 'fibonacci' && d.points.length >= 2) {
        const fibs = calculateFibonacciPrices(d.points[0], d.points[1]);
        const pt1 = pointToPixels(d.points[0]);
        const pt2 = pointToPixels(d.points[1]);
        
        if (pt1 && pt2) {
          const startX = Math.min(pt1.x, pt2.x);
          const endX = Math.max(pt1.x, pt2.x, width);

          fibs.forEach(f => {
            const fPt = pointToPixels({ ...d.points[0], price: f.price });
            if (fPt) {
              const isTargetFib = d.trigger && d.trigger.enabled && Math.abs((d.trigger.targetFibLevel ?? 0.618) - f.level) < 0.001;
              const isWaitingAlgo = isTargetFib && d.trigger?.status === 'waiting_algo';
              const triggerModeStr = d.trigger?.mode === 'breakout' ? 'RP' : 'RV';
              const algoSuffix = isWaitingAlgo ? ` ⏳ [${d.trigger?.targetAlgorithmName || 'Robô'}]` : (d.trigger?.executionType === 'algorithm' ? ` [${d.trigger?.targetAlgorithmName || 'Robô'}]` : '');

              ctx.strokeStyle = isWaitingAlgo ? '#f59e0b' : (isTargetFib ? '#f97316' : f.color);
              ctx.lineWidth = isTargetFib ? 2.5 : 1;
              ctx.setLineDash(isTargetFib ? [] : [4, 4]);

              ctx.beginPath();
              ctx.moveTo(startX, fPt.y);
              ctx.lineTo(endX, fPt.y);
              ctx.stroke();

              ctx.font = `bold ${isTargetFib ? 10 : 9}px JetBrains Mono, monospace`;
              ctx.fillStyle = isWaitingAlgo ? '#fbbf24' : (isTargetFib ? '#fbbf24' : f.color);
              ctx.fillText(`${f.label} (${f.price.toFixed(2)})${isTargetFib ? ` ⚡ ${triggerModeStr}${algoSuffix} ALVO` : ''}`, startX + 6, fPt.y - 3);
            }
          });

          if (isSelected) {
            [pt1, pt2].forEach(p => {
              ctx.fillStyle = '#ffffff';
              ctx.strokeStyle = '#0284c7';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            });
          }
        }
      }

      // H. CANAL PARALELO
      if (d.type === 'channel' && d.points.length >= 2) {
        const pt1 = pointToPixels(d.points[0]);
        const pt2 = pointToPixels(d.points[1]);
        if (pt1 && pt2) {
          const dist = d.channelDistancePts || 30;
          const series = seriesRef.current;
          const upperY1 = series?.priceToCoordinate ? series.priceToCoordinate(d.points[0].price + dist) : (pt1.y - 20);
          const upperY2 = series?.priceToCoordinate ? series.priceToCoordinate(d.points[1].price + dist) : (pt2.y - 20);
          const lowerY1 = series?.priceToCoordinate ? series.priceToCoordinate(d.points[0].price - dist) : (pt1.y + 20);
          const lowerY2 = series?.priceToCoordinate ? series.priceToCoordinate(d.points[1].price - dist) : (pt2.y + 20);

          const upperPt1 = { x: pt1.x, y: upperY1 ?? (pt1.y - 20) };
          const upperPt2 = { x: pt2.x, y: upperY2 ?? (pt2.y - 20) };
          const lowerPt1 = { x: pt1.x, y: lowerY1 ?? (pt1.y + 20) };
          const lowerPt2 = { x: pt2.x, y: lowerY2 ?? (pt2.y + 20) };

          // 1. Linha Central Tracejada
          ctx.strokeStyle = d.color;
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = isSelected ? 2 : 1;
          ctx.beginPath();
          ctx.moveTo(pt1.x, pt1.y);
          ctx.lineTo(pt2.x, pt2.y);
          ctx.stroke();

          // 2. Preenchimento Translúcido do Canal
          if (upperPt1 && upperPt2 && lowerPt1 && lowerPt2) {
            ctx.fillStyle = d.color;
            ctx.globalAlpha = 0.08;
            ctx.beginPath();
            ctx.moveTo(upperPt1.x, upperPt1.y);
            ctx.lineTo(upperPt2.x, upperPt2.y);
            ctx.lineTo(lowerPt2.x, lowerPt2.y);
            ctx.lineTo(lowerPt1.x, lowerPt1.y);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1.0;
          }

          // 3. Linhas Superior e Inferior Sólidas
          ctx.setLineDash([]);
          ctx.lineWidth = isSelected ? d.lineWidth + 1 : d.lineWidth;
          if (upperPt1 && upperPt2) {
            ctx.beginPath();
            ctx.moveTo(upperPt1.x, upperPt1.y);
            ctx.lineTo(upperPt2.x, upperPt2.y);
            ctx.stroke();
          }
          if (lowerPt1 && lowerPt2) {
            ctx.beginPath();
            ctx.moveTo(lowerPt1.x, lowerPt1.y);
            ctx.lineTo(lowerPt2.x, lowerPt2.y);
            ctx.stroke();
          }

          // Badge RP / RV no Canal (Banda Superior e Banda Inferior)
          const hasTrigger = d.trigger && d.trigger.enabled && (d.trigger.status === 'armed' || d.trigger.status === 'waiting_algo');
          const isWaitingAlgo = d.trigger?.status === 'waiting_algo';
          const triggerModeStr = d.trigger?.mode === 'breakout' ? 'RP' : 'RV';
          const algoSuffix = isWaitingAlgo ? ` ⏳ [${d.trigger?.targetAlgorithmName || 'Robô'}]` : (d.trigger?.executionType === 'algorithm' ? ` [${d.trigger?.targetAlgorithmName || 'Robô'}]` : '');

          if (hasTrigger) {
            const badgeText = `⚡ ${triggerModeStr}${algoSuffix}`;
            ctx.font = 'bold 9px JetBrains Mono, monospace';
            const textWidth = ctx.measureText(badgeText).width;

            if (upperPt2) {
              const bX = upperPt2.x + 4;
              const bY = upperPt2.y - 7;
              ctx.fillStyle = isWaitingAlgo ? '#78350f' : (d.trigger?.mode === 'breakout' ? '#1e3a8a' : '#581c87');
              ctx.strokeStyle = isWaitingAlgo ? '#f59e0b' : (d.trigger?.mode === 'breakout' ? '#60a5fa' : '#c084fc');
              ctx.lineWidth = 1;
              ctx.fillRect(bX, bY, textWidth + 8, 14);
              ctx.strokeRect(bX, bY, textWidth + 8, 14);
              ctx.fillStyle = '#ffffff';
              ctx.fillText(badgeText, bX + 4, bY + 10);
            }

            if (lowerPt2) {
              const bX = lowerPt2.x + 4;
              const bY = lowerPt2.y - 7;
              ctx.fillStyle = isWaitingAlgo ? '#78350f' : (d.trigger?.mode === 'breakout' ? '#1e3a8a' : '#581c87');
              ctx.strokeStyle = isWaitingAlgo ? '#f59e0b' : (d.trigger?.mode === 'breakout' ? '#60a5fa' : '#c084fc');
              ctx.lineWidth = 1;
              ctx.fillRect(bX, bY, textWidth + 8, 14);
              ctx.strokeRect(bX, bY, textWidth + 8, 14);
              ctx.fillStyle = '#ffffff';
              ctx.fillText(badgeText, bX + 4, bY + 10);
            }
          }

          // 4. Âncoras de Controle se Selecionado
          if (isSelected) {
            [pt1, pt2].forEach(p => {
              ctx.fillStyle = '#ffffff';
              ctx.strokeStyle = '#0284c7';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            });

            // Alça de ajuste de largura no meio da linha superior
            if (upperPt1 && upperPt2) {
              const midUpperX = (upperPt1.x + upperPt2.x) / 2;
              const midUpperY = (upperPt1.y + upperPt2.y) / 2;
              ctx.fillStyle = '#f59e0b';
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(midUpperX, midUpperY, 6, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            }
          }
        }
      }
    });

    // 2. Renderizar prévia do desenho atual em criação
    if (activeTool && drawingPoints.length > 0 && hoverPoint) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);

      const pt1 = pointToPixels(drawingPoints[0]);
      const ptHover = pointToPixels(hoverPoint);

      if (pt1 && ptHover) {
        if (activeTool === 'trend_line') {
          ctx.beginPath();
          ctx.moveTo(pt1.x, pt1.y);
          ctx.lineTo(ptHover.x, ptHover.y);
          ctx.stroke();
        } else if (activeTool === 'arrow') {
          // Prévia de todos os pontos já clicados mais o ponto sob o mouse
          const allPreviewPts = [...drawingPoints.map(p => pointToPixels(p)).filter(Boolean) as { x: number; y: number }[], ptHover];
          if (allPreviewPts.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(allPreviewPts[0].x, allPreviewPts[0].y);
            for (let i = 1; i < allPreviewPts.length; i++) {
              ctx.lineTo(allPreviewPts[i].x, allPreviewPts[i].y);
            }
            ctx.stroke();

            // Flecha no ponto de hover
            const pPrev = allPreviewPts[allPreviewPts.length - 2];
            const pLast = allPreviewPts[allPreviewPts.length - 1];
            const angle = Math.atan2(pLast.y - pPrev.y, pLast.x - pPrev.x);
            const arrowLength = 14;
            const arrowAngle = Math.PI / 6;

            ctx.setLineDash([]);
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.moveTo(pLast.x, pLast.y);
            ctx.lineTo(
              pLast.x - arrowLength * Math.cos(angle - arrowAngle),
              pLast.y - arrowLength * Math.sin(angle - arrowAngle)
            );
            ctx.lineTo(
              pLast.x - (arrowLength * 0.7) * Math.cos(angle),
              pLast.y - (arrowLength * 0.7) * Math.sin(angle)
            );
            ctx.lineTo(
              pLast.x - arrowLength * Math.cos(angle + arrowAngle),
              pLast.y - arrowLength * Math.sin(angle + arrowAngle)
            );
            ctx.closePath();
            ctx.fill();
          }
        } else if (activeTool === 'ruler') {
          const rx = Math.min(pt1.x, ptHover.x);
          const ry = Math.min(pt1.y, ptHover.y);
          const rw = Math.max(1, Math.abs(ptHover.x - pt1.x));
          const rh = Math.max(1, Math.abs(ptHover.y - pt1.y));

          ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeRect(rx, ry, rw, rh);

          ctx.beginPath();
          ctx.moveTo(pt1.x, pt1.y);
          ctx.lineTo(ptHover.x, ptHover.y);
          ctx.stroke();

          const deltaPrice = hoverPoint.price - drawingPoints[0].price;
          const absDeltaPrice = Math.abs(deltaPrice);
          const barIntervalSec = Math.max(1, (timeframe || 1)) * 60;
          const barCount = Math.max(1, Math.round(Math.abs(hoverPoint.time - drawingPoints[0].time) / (barIntervalSec * 1000)));
          const signStr = deltaPrice >= 0 ? '+' : '-';
          const badgeText = `📏 ${signStr}${absDeltaPrice.toFixed(2)} pts | ${barCount} candles`;

          ctx.font = 'bold 10px JetBrains Mono, monospace';
          const textMetrics = ctx.measureText(badgeText);
          const badgeW = textMetrics.width + 16;
          const badgeH = 20;
          const centerX = (pt1.x + ptHover.x) / 2;
          const centerY = (pt1.y + ptHover.y) / 2;
          const bX = Math.max(10, Math.min(width - badgeW - 10, centerX - badgeW / 2));
          const bY = Math.max(10, Math.min(height - badgeH - 10, centerY - badgeH / 2));

          ctx.fillStyle = '#0f172a';
          ctx.fillRect(bX, bY, badgeW, badgeH);
          ctx.strokeRect(bX, bY, badgeW, badgeH);
          ctx.fillStyle = deltaPrice >= 0 ? '#4ade80' : '#f87171';
          ctx.fillText(badgeText, bX + 8, bY + 14);
        } else if (activeTool === 'channel') {
          ctx.beginPath();
          ctx.moveTo(pt1.x, pt1.y);
          ctx.lineTo(ptHover.x, ptHover.y);
          ctx.stroke();

          const dist = 30;
          const u1 = pointToPixels({ ...drawingPoints[0], price: drawingPoints[0].price + dist });
          const u2 = pointToPixels({ ...hoverPoint, price: hoverPoint.price + dist });
          const l1 = pointToPixels({ ...drawingPoints[0], price: drawingPoints[0].price - dist });
          const l2 = pointToPixels({ ...hoverPoint, price: hoverPoint.price - dist });

          ctx.setLineDash([2, 2]);
          ctx.strokeStyle = '#38bdf8';
          if (u1 && u2) {
            ctx.beginPath();
            ctx.moveTo(u1.x, u1.y);
            ctx.lineTo(u2.x, u2.y);
            ctx.stroke();
          }
          if (l1 && l2) {
            ctx.beginPath();
            ctx.moveTo(l1.x, l1.y);
            ctx.lineTo(l2.x, l2.y);
            ctx.stroke();
          }
        } else if (activeTool === 'rectangle') {
          const rx = Math.min(pt1.x, ptHover.x);
          const ry = Math.min(pt1.y, ptHover.y);
          const rw = Math.abs(ptHover.x - pt1.x);
          const rh = Math.abs(ptHover.y - pt1.y);
          ctx.strokeRect(rx, ry, rw, rh);
        } else if (activeTool === 'fibonacci') {
          const fibs = calculateFibonacciPrices(drawingPoints[0], hoverPoint);
          fibs.forEach(f => {
            const fPt = pointToPixels({ ...drawingPoints[0], price: f.price });
            if (fPt) {
              ctx.strokeStyle = f.color;
              ctx.beginPath();
              ctx.moveTo(Math.min(pt1.x, ptHover.x), fPt.y);
              ctx.lineTo(width, fPt.y);
              ctx.stroke();
            }
          });
        }
      }
    }
    } catch (err: any) {
      recordChartError({
        type: 'drawings',
        message: 'Erro na renderização do overlay de desenhos: ' + (err?.message || err),
        stack: err?.stack || '',
        panelId: currentSymbol || 'painel_chart'
      });
    } finally {
      try {
        ctx.restore();
      } catch (_) {}
    }
  }, [drawings, activeTool, drawingPoints, hoverPoint, selectedDrawingId, pointToPixels, containerRef, timeframe, currentSymbol]);

  // Sincronização síncrona frame-a-frame com o ciclo de pintura do Lightweight Charts (Pan/Zoom/PriceScale)
  useEffect(() => {
    if (registerRedrawRef) {
      registerRedrawRef.current = renderCanvas;
    }
    return () => {
      if (registerRedrawRef && registerRedrawRef.current === renderCanvas) {
        registerRedrawRef.current = null;
      }
    };
  }, [registerRedrawRef, renderCanvas]);

  // Fallback de assinatura direta no timeScale caso o primitive não dispare
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const ts = chart.timeScale?.();
    if (!ts || !ts.subscribeVisibleLogicalRangeChange) return;
    const onRangeChange = () => {
      renderCanvas();
    };
    ts.subscribeVisibleLogicalRangeChange(onRangeChange);
    return () => {
      try {
        ts.unsubscribeVisibleLogicalRangeChange(onRangeChange);
      } catch (_) {}
    };
  }, [chartRef, renderCanvas]);

  // Renderizar sob demanda quando houver mudanças reais de desenhos, ferramentas ou interação
  useEffect(() => {
    const animId = requestAnimationFrame(renderCanvas);
    return () => cancelAnimationFrame(animId);
  }, [renderCanvas]);

  // Interação do Usuário no Gráfico (Pointer Down / Click)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Apenas processa clique com botão esquerdo (botão direito conclui ou cancela no onContextMenu)
    if (e.button !== 0) return;

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const clickedPoint = pixelsToCoords(mouseX, mouseY);
    if (!clickedPoint) return;

    // Checar Duplo Clique (dentro de 400ms)
    const now = Date.now();
    const isDoubleClick = lastClickRef.current &&
      now - lastClickRef.current.time < 400 &&
      Math.hypot(mouseX - lastClickRef.current.x, mouseY - lastClickRef.current.y) < 20;

    lastClickRef.current = { time: now, x: mouseX, y: mouseY };

    // A. MODO CRIAÇÃO DE NOVO DESENHO
    if (activeTool) {
      const currentTf = timeframe || 1;
      if (activeTool === 'horizontal_line') {
        const newDrawing = createNewDrawing('horizontal_line', clickedPoint, currentSymbol, currentAccountId, currentTf);
        onFinishDrawing(newDrawing);
        setDrawingPoints([]);
        setHoverPoint(null);
        setIsDragging(true);
        setDragTarget({
          drawingId: newDrawing.id,
          pointIndex: 0,
          startMouseX: mouseX,
          startMouseY: mouseY,
          startPrice: clickedPoint.price,
          initialPoints: [clickedPoint]
        });
      } else if (activeTool === 'text') {
        // Elemento de texto: 1 clique já posiciona e abre para edição imediata
        const newDrawing = createNewDrawing('text', clickedPoint, currentSymbol, currentAccountId, currentTf);
        onFinishDrawing(newDrawing);
        setDrawingPoints([]);
        setHoverPoint(null);
        onSelectDrawing(newDrawing);
        onOpenSettings(newDrawing);
      } else if (activeTool === 'arrow') {
        // Zigue-Zague com Flecha:
        // Cada clique esquerdo adiciona o ponto e estende o traço.
        const nextPoints = [...drawingPoints, clickedPoint];
        setDrawingPoints(nextPoints);
      } else if (drawingPoints.length === 0) {
        setDrawingPoints([clickedPoint]);
      } else if (drawingPoints.length === 1) {
        const newDrawing = createNewDrawing(activeTool, drawingPoints[0], currentSymbol, currentAccountId, currentTf);
        newDrawing.points = [drawingPoints[0], clickedPoint];
        onFinishDrawing(newDrawing);
        setDrawingPoints([]);
        setHoverPoint(null);
        onSelectDrawing(newDrawing);
      }
      return;
    }

    // B. MODO SELEÇÃO E ARRASTO DE DESENHO EXISTENTE
    const hit = findDrawingAtCoords(mouseX, mouseY);
    if (hit) {
      onSelectDrawing(hit.drawing);

      // Se for duplo clique, abre as configurações completas do desenho
      if (isDoubleClick) {
        onOpenSettings(hit.drawing);
        return;
      }

      setIsDragging(true);
      setDragTarget({
        drawingId: hit.drawing.id,
        pointIndex: hit.hitIndex,
        startMouseX: mouseX,
        startMouseY: mouseY,
        startPrice: clickedPoint.price,
        initialPoints: [...hit.drawing.points],
        initialDistance: hit.drawing.channelDistancePts || 30
      });
    } else {
      // Clicou fora de qualquer desenho: desmarca e esconde os pontos/âncoras de extremidade
      if (selectedDrawingId) {
        onSelectDrawing(null);
      }
      setIsHoveringDrawing(false);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Prévia durante desenho
    if (activeTool && drawingPoints.length > 0) {
      const pt = pixelsToCoords(mouseX, mouseY);
      if (pt) setHoverPoint(pt);
      return;
    }

    // Arrasto em tempo real de desenho selecionado
    if (isDragging && dragTarget) {
      const currentPoint = pixelsToCoords(mouseX, mouseY);
      if (!currentPoint) return;

      const drawing = drawings.find(d => d.id === dragTarget.drawingId);
      if (!drawing) return;

      if (dragTarget.pointIndex === 'channel_width') {
        const centerPrice = (drawing.points[0].price + (drawing.points[1]?.price || drawing.points[0].price)) / 2;
        const newDist = Math.max(effectiveTickSize, roundToTick(Math.abs(currentPoint.price - centerPrice), effectiveTickSize));
        onUpdateDrawing({ ...drawing, channelDistancePts: newDist });
      } else if (typeof dragTarget.pointIndex === 'number') {
        const idx = dragTarget.pointIndex;
        if (idx >= 0 && idx < drawing.points.length) {
          const updatedPoints = [...drawing.points];
          updatedPoints[idx] = { ...currentPoint };
          onUpdateDrawing({ ...drawing, points: updatedPoints });
        }
      } else if (dragTarget.pointIndex === 'all') {
        const deltaPrice = currentPoint.price - dragTarget.startPrice;
        const deltaLogical = (currentPoint.logical !== undefined && dragTarget.initialPoints[0]?.logical !== undefined)
          ? (currentPoint.logical - dragTarget.initialPoints[0].logical)
          : 0;
        const deltaTime = currentPoint.time - (dragTarget.initialPoints[0]?.time || currentPoint.time);

        const updatedPoints = dragTarget.initialPoints.map(p => ({
          time: p.time + deltaTime,
          price: roundToTick(p.price + deltaPrice, effectiveTickSize),
          logical: p.logical !== undefined ? p.logical + deltaLogical : undefined
        }));
        onUpdateDrawing({ ...drawing, points: updatedPoints });
      }
      return;
    }

    if (!activeTool) {
      const hit = findDrawingAtCoords(mouseX, mouseY);
      setIsHoveringDrawing(Boolean(hit));
    }
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    setDragTarget(null);
  };

  // Clique com Botão Direito: Conclui o modo de edição do zigue-zague ou cancela ferramenta ativa
  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (activeTool === 'arrow') {
      const currentTf = timeframe || 1;
      if (drawingPoints.length >= 2) {
        // Conclui o traço de zigue-zague com todos os pontos já desenhados
        const newDrawing = createNewDrawing('arrow', drawingPoints[0], currentSymbol, currentAccountId, currentTf);
        newDrawing.points = [...drawingPoints];
        onFinishDrawing(newDrawing);
        setDrawingPoints([]);
        setHoverPoint(null);
        onSelectDrawing(null); // Conclui sem deixar âncoras ativas
      } else {
        // Se tinha menos de 2 pontos, apenas aborta/sai do modo de desenho
        setDrawingPoints([]);
        setHoverPoint(null);
        onSelectDrawing(null);
      }
    } else if (activeTool) {
      setDrawingPoints([]);
      setHoverPoint(null);
      onSelectDrawing(null);
    } else if (selectedDrawingId) {
      // Botão direito com desenho selecionado: deseleciona e fecha
      onSelectDrawing(null);
    }
  };

  const currentTf = timeframe || 1;
  const selectedDrawing = drawings.find(d => d.id === selectedDrawingId && (d.timeframe || 1) === currentTf);

  // Quick Action Toggles
  const handleToggleAutomation = () => {
    if (!selectedDrawing) return;
    const currentTrigger = selectedDrawing.trigger || {
      enabled: false,
      mode: 'reversal',
      targetFibLevel: 0.618,
      channelSide: 'both',
      requireConfirmation: false,
      status: 'disabled',
      contracts: 1,
      stopLossPts: 50,
      takeProfitPts: 50
    };

    const nextEnabled = !currentTrigger.enabled;
    onUpdateDrawing({
      ...selectedDrawing,
      trigger: {
        ...currentTrigger,
        enabled: nextEnabled,
        status: nextEnabled ? 'armed' : 'disabled'
      }
    });
  };

  const handleChangeMode = (mode: 'reversal' | 'breakout') => {
    if (!selectedDrawing || !selectedDrawing.trigger) return;
    onUpdateDrawing({
      ...selectedDrawing,
      trigger: {
        ...selectedDrawing.trigger,
        mode
      }
    });
  };

  const handleCycleExecutionType = () => {
    if (!selectedDrawing || !selectedDrawing.trigger) return;
    const currentType: TriggerExecutionType = selectedDrawing.trigger.executionType || 
      (selectedDrawing.trigger.targetAlgorithmId ? 'algorithm' : (selectedDrawing.trigger.requireConfirmation ? 'panel_bias' : 'simple'));

    let nextType: TriggerExecutionType = 'simple';
    let nextRequireConf = false;
    let nextAlgoId: string | undefined = undefined;
    let nextAlgoName: string | undefined = undefined;

    if (currentType === 'simple') {
      nextType = 'panel_bias';
      nextRequireConf = true;
    } else if (currentType === 'panel_bias') {
      nextType = 'algorithm';
      nextRequireConf = false;
      const firstAlgo = customStrategies && customStrategies.length > 0 ? customStrategies[0] : null;
      nextAlgoId = selectedDrawing.trigger.targetAlgorithmId || firstAlgo?.id;
      nextAlgoName = selectedDrawing.trigger.targetAlgorithmName || firstAlgo?.name || 'Algoritmo';
    } else {
      nextType = 'simple';
      nextRequireConf = false;
    }

    onUpdateDrawing({
      ...selectedDrawing,
      trigger: {
        ...selectedDrawing.trigger,
        executionType: nextType,
        requireConfirmation: nextRequireConf,
        targetAlgorithmId: nextAlgoId,
        targetAlgorithmName: nextAlgoName,
        status: selectedDrawing.trigger.enabled ? (nextType === 'algorithm' ? 'waiting_algo' : 'armed') : 'disabled'
      }
    });
  };

  const handleChangeFibLevel = (level: number) => {
    if (!selectedDrawing || !selectedDrawing.trigger) return;
    onUpdateDrawing({
      ...selectedDrawing,
      trigger: {
        ...selectedDrawing.trigger,
        targetFibLevel: level
      }
    });
  };

  const handleNudgeChannelWidth = (delta: number) => {
    if (!selectedDrawing || selectedDrawing.type !== 'channel') return;
    const currentDist = selectedDrawing.channelDistancePts || 30;
    const newDist = Math.max(5, currentDist + delta);
    onUpdateDrawing({
      ...selectedDrawing,
      channelDistancePts: newDist
    });
  };

  const shouldCapturePointer = Boolean(activeTool || isDragging || (isHoveringDrawing && !activeTool));

  const isVisualOnly = selectedDrawing?.type === 'text' || selectedDrawing?.type === 'arrow' || selectedDrawing?.type === 'ruler';

  const getToolDisplayName = (type: DrawingToolType) => {
    switch (type) {
      case 'text': return 'TEXTO';
      case 'arrow': return 'ZIGUE-ZAGUE COM FLECHA';
      case 'ruler': return 'RÉGUA DE MEDIÇÃO';
      case 'horizontal_line': return 'LINHA HORIZONTAL';
      case 'trend_line': return 'LINHA DE TENDÊNCIA';
      case 'rectangle': return 'REGIÃO / RETÂNGULO';
      case 'fibonacci': return 'FIBONACCI';
      case 'channel': return 'CANAL PARALELO';
      default: return String(type).toUpperCase();
    }
  };

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden ${selectedDrawing ? 'z-[999999]' : 'z-30'}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={handleContextMenu}
        className={`w-full h-full ${
          shouldCapturePointer
            ? (activeTool ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-auto cursor-pointer')
            : 'pointer-events-none'
        }`}
      />

      {/* Floating Action Bar para o desenho selecionado - PRIORIDADE MÁXIMA NA FRENTE DE TODOS ELEMENTOS */}
      {selectedDrawing && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 bg-[#0f172a]/95 border border-cyan-500/50 px-3 py-1.5 rounded-xl shadow-[0_10px_35px_rgba(0,0,0,0.85)] backdrop-blur-md flex items-center gap-2 text-xs z-[999999] pointer-events-auto animate-in fade-in slide-in-from-top-2 select-none"
        >
          {/* Nome do Desenho */}
          <span className="font-bold text-white flex items-center gap-1 text-[11px]">
            <span>✏️</span> {getToolDisplayName(selectedDrawing.type)}
          </span>

          <div className="h-4 w-[1px] bg-slate-700 mx-0.5" />

          {/* Atalho de texto rápido se for tipo texto */}
          {selectedDrawing.type === 'text' && (
            <div className="flex items-center gap-1.5 bg-[#151e33] border border-slate-700 rounded-lg px-2 py-0.5">
              <span className="text-slate-400 font-bold text-[10px]">TEXTO:</span>
              <input
                type="text"
                value={selectedDrawing.textValue || ''}
                onChange={(e) => {
                  onUpdateDrawing({ ...selectedDrawing, textValue: e.target.value });
                }}
                placeholder="Digite sua anotação..."
                className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-white font-medium text-xs w-32 outline-none focus:border-cyan-400"
              />
            </div>
          )}

          {/* Aviso se for elemento exclusivamente visual / medição */}
          {isVisualOnly ? (
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-cyan-300 border border-cyan-500/30">
                {selectedDrawing.type === 'ruler' ? '📏 MEDIÇÃO VISUAL' : '👁️ APENAS DESENHO'}
              </span>

              {/* Seletor rápido de estilo de linha para Zigue-Zague com Flecha */}
              {selectedDrawing.type === 'arrow' && (
                <div className="flex items-center gap-1 bg-[#151e33] border border-slate-700 rounded-lg p-0.5 text-[10px]">
                  <span className="text-slate-400 font-bold px-1">LINHA:</span>
                  {[
                    { id: 0, label: 'Sólida' },
                    { id: 2, label: 'Tracejada' },
                    { id: 1, label: 'Pontilhada' }
                  ].map(st => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => onUpdateDrawing({ ...selectedDrawing, lineStyle: st.id })}
                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold transition cursor-pointer ${
                        (selectedDrawing.lineStyle ?? 0) === st.id
                          ? 'bg-blue-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title={`Estilo de linha ${st.label}`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Ajuste de Largura Rápida de Canal */}
              {selectedDrawing.type === 'channel' && (
                <div className="flex items-center gap-1 bg-[#151e33] border border-slate-700 rounded-lg px-1.5 py-0.5 text-[10px]">
                  <span className="text-slate-400 font-bold">LARGURA:</span>
                  <button
                    type="button"
                    onClick={() => handleNudgeChannelWidth(-5)}
                    className="px-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-bold transition cursor-pointer"
                    title="Diminuir largura do canal (-5 pts)"
                  >
                    -5
                  </button>
                  <span className="font-mono text-amber-300 font-bold px-1">
                    {selectedDrawing.channelDistancePts || 30} pts
                  </span>
                  <button
                    type="button"
                    onClick={() => handleNudgeChannelWidth(5)}
                    className="px-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-bold transition cursor-pointer"
                    title="Aumentar largura do canal (+5 pts)"
                  >
                    +5
                  </button>
                </div>
              )}

              {/* 1. Modo: Apenas Desenho vs Operar */}
              <button
                onClick={handleToggleAutomation}
                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition flex items-center gap-1 cursor-pointer ${
                  selectedDrawing.trigger?.enabled
                    ? 'bg-blue-600 text-white border-blue-400 shadow-sm animate-pulse'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                }`}
                title="Clique para alternar entre apenas desenho visual ou operar no toque"
              >
                <span>{selectedDrawing.trigger?.enabled ? '⚡ OPERAR NO TOQUE' : '👁️ APENAS DESENHO'}</span>
              </button>

              {/* 2. Regras se a automação estiver ativa */}
              {selectedDrawing.trigger?.enabled && (
                <>
                  <div className="flex items-center gap-1 bg-[#151e33] border border-slate-700 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => handleChangeMode('reversal')}
                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-extrabold transition ${
                        selectedDrawing.trigger.mode === 'reversal'
                          ? 'bg-purple-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Reversão: Venda no topo / Compra no suporte"
                    >
                      🔄 REVERSÃO
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChangeMode('breakout')}
                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-extrabold transition ${
                        selectedDrawing.trigger.mode === 'breakout'
                          ? 'bg-blue-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Rompimento: Compra no rompimento de alta / Venda no rompimento de baixa"
                    >
                      🚀 ROMPIMENTO
                    </button>
                  </div>

                  {/* Fibonacci Nível Selector */}
                  {selectedDrawing.type === 'fibonacci' && (
                    <select
                  value={selectedDrawing.trigger.targetFibLevel ?? 0.618}
                  onChange={(e) => handleChangeFibLevel(parseFloat(e.target.value))}
                  className="bg-[#151e33] border border-slate-700 text-amber-300 font-mono font-bold text-[10px] py-0.5 px-1 rounded outline-none cursor-pointer"
                  title="Nível de Fibonacci para disparo da ordem"
                >
                  {FIB_LEVELS.map(f => (
                    <option key={f.level} value={f.level} className="bg-slate-900 text-slate-200">
                      Fib {f.label}
                    </option>
                  ))}
                </select>
              )}

              {/* Alternador das 3 formas de operação: Simples Toque | Viés do Painel | Algoritmo */}
              {(() => {
                const currentType: TriggerExecutionType = selectedDrawing.trigger.executionType || 
                  (selectedDrawing.trigger.targetAlgorithmId ? 'algorithm' : (selectedDrawing.trigger.requireConfirmation ? 'panel_bias' : 'simple'));

                return (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleCycleExecutionType}
                      className={`px-2 py-0.5 rounded text-[9.5px] font-extrabold border transition flex items-center gap-1 cursor-pointer active:scale-95 shadow ${
                        currentType === 'algorithm'
                          ? 'bg-amber-950/90 text-amber-200 border-amber-500 hover:bg-amber-900'
                          : currentType === 'panel_bias'
                          ? 'bg-purple-950/90 text-purple-200 border-purple-500 hover:bg-purple-900'
                          : 'bg-blue-950/90 text-blue-200 border-blue-500 hover:bg-blue-900'
                      }`}
                      title="Clique para alternar entre: 🎯 Simples Toque ➔ 🧭 Viés Painel ➔ 🤖 Algoritmo"
                    >
                      {currentType === 'algorithm' ? (
                        <span>🤖 ALGORITMO{selectedDrawing.trigger.targetAlgorithmName ? `: ${selectedDrawing.trigger.targetAlgorithmName}` : ''}</span>
                      ) : currentType === 'panel_bias' ? (
                        <span>🧭 VIÉS PAINEL</span>
                      ) : (
                        <span>🎯 SIMPLES TOQUE</span>
                      )}
                    </button>

                    {currentType === 'algorithm' && customStrategies && customStrategies.length > 0 && (
                      <select
                        value={selectedDrawing.trigger.targetAlgorithmId || ''}
                        onChange={(e) => {
                          const selId = e.target.value;
                          const algoObj = customStrategies.find((s: any) => s.id === selId);
                          onUpdateDrawing({
                            ...selectedDrawing,
                            trigger: {
                              ...selectedDrawing.trigger!,
                              targetAlgorithmId: selId,
                              targetAlgorithmName: algoObj?.name || 'Algoritmo'
                            }
                          });
                        }}
                        className="bg-[#0f172a] border border-amber-500/60 text-amber-300 font-bold text-[9.5px] py-0.5 px-1 rounded outline-none cursor-pointer max-w-[110px] truncate"
                        title="Escolha o algoritmo de confirmação"
                      >
                        {customStrategies.map((s: any) => (
                          <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                            {s.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })()}
                </>
              )}
            </>
          )}

          {/* Configurações Modal */}
          <button
            onClick={() => onOpenSettings(selectedDrawing)}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition cursor-pointer"
            title="Abrir Configurações do Desenho (Duplo clique no desenho também abre)"
          >
            ⚙️
          </button>

          {/* Botão Excluir Desenho */}
          <button
            onClick={() => {
              if (onDeleteDrawing && selectedDrawing) {
                onDeleteDrawing(selectedDrawing.id);
                onSelectDrawing(null);
              }
            }}
            className="p-1 text-slate-400 hover:text-red-400 rounded hover:bg-red-950/40 transition cursor-pointer"
            title="Excluir desenho selecionado (ou pressione a tecla DELETE)"
          >
            🗑️
          </button>

          {/* Botão OK / Concluir (Fecha a barra e libera o gráfico de candles) */}
          <button
            onClick={() => {
              if (
                selectedDrawing.trigger?.enabled &&
                selectedDrawing.trigger.executionType === 'algorithm' &&
                (!selectedDrawing.trigger.targetAlgorithmId || !customStrategies || customStrategies.length === 0)
              ) {
                if (addLog) {
                  addLog('ROBÔ', '⚠️ Nenhum Algoritmo selecionado para o traçado. Abrindo configurações para escolher o Robô...', 'alerta');
                }
                onOpenSettings(selectedDrawing);
                return;
              }
              onSelectDrawing(null);
            }}
            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-lg text-xs shadow-md transition active:scale-95 flex items-center gap-1 cursor-pointer ml-1"
            title="Concluir e liberar manipulação do gráfico"
          >
            <span>✓ OK</span>
          </button>
        </div>
      )}
    </div>
  );
};

ChartDrawingsOverlay.displayName = 'ChartDrawingsOverlay';
