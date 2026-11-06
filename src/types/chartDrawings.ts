export type DrawingToolType =
  | 'horizontal_line'
  | 'trend_line'
  | 'rectangle'
  | 'fibonacci'
  | 'channel'
  | 'text'
  | 'arrow'
  | 'ruler';

export interface DrawingPoint {
  time: number; // Unix timestamp in milliseconds or seconds
  price: number;
  logical?: number; // Índice lógico do candle (permite projeção ilimitada para a direita)
}

export type TriggerMode = 'reversal' | 'breakout';
export type TriggerStatus = 'armed' | 'waiting_algo' | 'triggered' | 'disabled';
export type TriggerExecutionType = 'simple' | 'panel_bias' | 'algorithm';

export interface DrawingTriggerConfig {
  enabled: boolean;
  mode: TriggerMode;
  targetFibLevel?: number; // ex: 0.618, 0.5, 0.382
  channelSide?: 'upper' | 'lower' | 'both';
  executionType?: TriggerExecutionType; // 'simple' (Simples Toque), 'panel_bias' (Viés do Painel), 'algorithm' (Algoritmo)
  requireConfirmation?: boolean; // Compatibilidade retroativa com viés do painel
  targetAlgorithmId?: string; // ID do algoritmo / robô selecionado para confirmação
  targetAlgorithmName?: string; // Nome do algoritmo para exibição visual
  status: TriggerStatus;
  contracts?: number;
  stopLossPts?: number;
  takeProfitPts?: number;
  lastTriggeredAt?: string;
}

export interface DrawingItem {
  id: string;
  type: DrawingToolType;
  points: DrawingPoint[]; // 1 ponto para horizontal, 2 para trend/retângulo/fib, 3 para canal
  color: string;
  lineWidth: number;
  lineStyle?: number; // 0 = solid, 1 = dotted, 2 = dashed
  fillColor?: string;
  fillOpacity?: number;
  label?: string;
  visible: boolean;
  locked?: boolean;
  trigger?: DrawingTriggerConfig;
  channelDistancePts?: number; // Offset de pontos para canal paralelo
  createdAt: number;
  symbol?: string;
  accountId?: string; // Vínculo obrigatório com a conta da corretora
  timeframe?: number; // Timeframe específico no qual o elemento foi desenhado (ex: 1, 2, 3, 5, etc.)
  textValue?: string; // Texto personalizado para elemento de anotação/texto
  textFontSize?: number; // Tamanho da fonte do texto (ex: 14)
}

export const FIB_LEVELS = [
  { level: 0.0, label: '0.0%', color: '#94a3b8' },
  { level: 0.236, label: '23.6%', color: '#38bdf8' },
  { level: 0.382, label: '38.2%', color: '#34d399' },
  { level: 0.5, label: '50.0%', color: '#fbbf24' },
  { level: 0.618, label: '61.8%', color: '#f97316' },
  { level: 0.786, label: '78.6%', color: '#f43f5e' },
  { level: 1.0, label: '100.0%', color: '#a855f7' },
  { level: 1.618, label: '161.8%', color: '#ec4899' },
];

export const DEFAULT_DRAWING_COLORS = [
  '#38bdf8', // Blue
  '#22c55e', // Green
  '#ef4444', // Red
  '#f59e0b', // Amber
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#ffffff', // White
  '#94a3b8', // Gray
];
