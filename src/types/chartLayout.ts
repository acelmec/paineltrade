import type { IndicatorConfig } from '../utils/indicatorRegistry';

export type ChartLayoutType =
  | 'single'
  | 'split-v'
  | 'split-h'
  | 'triple-mixed-left'
  | 'triple-mixed-right'
  | 'triple-cols'
  | 'quad';

export interface ChartSplitRatios {
  /** Divisão vertical principal (largura da coluna esquerda: 0.15 a 0.85, padrão 0.5) */
  vMain: number;
  /** Divisão vertical para 3 colunas (largura da col 1 e col 2, padrão 0.333 / 0.333) */
  vCol1: number;
  vCol2: number;
  /** Divisão horizontal principal (altura da linha superior no split-h: 0.15 a 0.85, padrão 0.5) */
  hMain: number;
  /** Divisão horizontal na coluna esquerda (para quad ou triple-mixed-right: padrão 0.5) */
  hLeft: number;
  /** Divisão horizontal na coluna direita (para quad ou triple-mixed-left: padrão 0.5) */
  hRight: number;
}

export const DEFAULT_SPLIT_RATIOS: ChartSplitRatios = {
  vMain: 0.5,
  vCol1: 1 / 3,
  vCol2: 1 / 3,
  hMain: 0.5,
  hLeft: 0.5,
  hRight: 0.5,
};

export interface ChartSlotConfig {
  id: string; // 'slot_0', 'slot_1', 'slot_2', 'slot_3'
  panelId: string;
  timeframe: number;
  historyDays?: number;
  indicators: IndicatorConfig[];
  autoCenter: boolean;
  showTradeMarkers: boolean;
  showOrderLines?: boolean;
  showIndicatorsLegend: boolean;
  showRobots: boolean;
}

export interface WorkspaceTemplate {
  id: string;
  name: string;
  layout: ChartLayoutType;
  ratios: ChartSplitRatios;
  slots: ChartSlotConfig[];
  createdAt: number;
}

export const LAYOUT_OPTIONS: Array<{
  id: ChartLayoutType;
  label: string;
  description: string;
  slotsCount: number;
}> = [
  { id: 'single', label: '1 Gráfico', description: 'Visão única em tela cheia (100%)', slotsCount: 1 },
  { id: 'split-v', label: '2 Verticais', description: 'Dois gráficos lado a lado (50% | 50%)', slotsCount: 2 },
  { id: 'split-h', label: '2 Horizontais', description: 'Dois gráficos empilhados (50% / 50%)', slotsCount: 2 },
  { id: 'triple-mixed-left', label: '3 Misto (Esq)', description: '1 Grande à esquerda (50%) + 2 empilhados (25% + 25%)', slotsCount: 3 },
  { id: 'triple-mixed-right', label: '3 Misto (Dir)', description: '2 empilhados à esquerda (25% + 25%) + 1 Grande (50%)', slotsCount: 3 },
  { id: 'triple-cols', label: '3 Colunas', description: 'Três gráficos lado a lado (33% | 33% | 33%)', slotsCount: 3 },
  { id: 'quad', label: '4 Gráficos', description: 'Grade 2x2 com espaçamento igual (25% cada)', slotsCount: 4 },
];
