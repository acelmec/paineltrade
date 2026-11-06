export interface ATMBracket {
  id: string;
  quantity: number; // Quantidade de contratos para este alvo
  stopLossPts: number; // Stop Loss em pontos (ou ticks se strategy.unit === 'ticks')
  takeProfitPts: number; // Take Profit em pontos (ou ticks se strategy.unit === 'ticks')
  autoBreakevenEnabled: boolean;
  autoBreakevenTriggerPts: number; // Disparo em pontos/ticks para mover SL ao Breakeven
  autoBreakevenOffsetPts: number; // Offset do preço de entrada em pontos/ticks
  trailingStopEnabled: boolean;
  trailingStopTriggerPts: number; // Disparo do trailing em pontos/ticks
  trailingStopStepPts: number; // Passo do trailing em pontos/ticks
}

export interface ATMStrategy {
  id: string;
  name: string;
  unit?: 'ticks' | 'points'; // 'ticks' para NinjaTrader 8 ou 'points' (padrão)
  brackets: ATMBracket[];
  isDefault?: boolean;
  created_at?: string;
}

export const PRESET_ATM_STRATEGIES: ATMStrategy[] = [
  {
    id: 'atm-scalp-1',
    name: '🎯 ATM Scalp 1 Alvo (1 Contrato - SL 10pts / TP 20pts + Breakeven +10)',
    isDefault: true,
    brackets: [
      {
        id: 'b-1',
        quantity: 1,
        stopLossPts: 10,
        takeProfitPts: 20,
        autoBreakevenEnabled: true,
        autoBreakevenTriggerPts: 10,
        autoBreakevenOffsetPts: 1,
        trailingStopEnabled: false,
        trailingStopTriggerPts: 15,
        trailingStopStepPts: 5
      }
    ]
  },
  {
    id: 'atm-dual-target',
    name: '⚖️ ATM 2 Alvos Escalonados (2 Contratos - Alvo 1: 15pts | Alvo 2: 35pts)',
    brackets: [
      {
        id: 'b-1',
        quantity: 1,
        stopLossPts: 12,
        takeProfitPts: 15,
        autoBreakevenEnabled: true,
        autoBreakevenTriggerPts: 10,
        autoBreakevenOffsetPts: 1,
        trailingStopEnabled: false,
        trailingStopTriggerPts: 10,
        trailingStopStepPts: 5
      },
      {
        id: 'b-2',
        quantity: 1,
        stopLossPts: 12,
        takeProfitPts: 35,
        autoBreakevenEnabled: true,
        autoBreakevenTriggerPts: 15,
        autoBreakevenOffsetPts: 2,
        trailingStopEnabled: true,
        trailingStopTriggerPts: 20,
        trailingStopStepPts: 5
      }
    ]
  },
  {
    id: 'atm-runner-3',
    name: '🚀 ATM Trend Runner 3 Alvos (3 Contratos - 10 / 25 / 50 pts)',
    brackets: [
      {
        id: 'b-1',
        quantity: 1,
        stopLossPts: 15,
        takeProfitPts: 10,
        autoBreakevenEnabled: true,
        autoBreakevenTriggerPts: 8,
        autoBreakevenOffsetPts: 0,
        trailingStopEnabled: false,
        trailingStopTriggerPts: 10,
        trailingStopStepPts: 5
      },
      {
        id: 'b-2',
        quantity: 1,
        stopLossPts: 15,
        takeProfitPts: 25,
        autoBreakevenEnabled: true,
        autoBreakevenTriggerPts: 15,
        autoBreakevenOffsetPts: 1,
        trailingStopEnabled: true,
        trailingStopTriggerPts: 15,
        trailingStopStepPts: 5
      },
      {
        id: 'b-3',
        quantity: 1,
        stopLossPts: 15,
        takeProfitPts: 50,
        autoBreakevenEnabled: true,
        autoBreakevenTriggerPts: 20,
        autoBreakevenOffsetPts: 2,
        trailingStopEnabled: true,
        trailingStopTriggerPts: 25,
        trailingStopStepPts: 10
      }
    ]
  }
];

/**
 * Resolução Centralizada e Inteligente de Estratégia ATM para Algoritmos e Robôs.
 * Ordem de Prioridade Inviolável:
 * 1. Cadastro Central do Usuário (Supabase / AppContext / localStorage) por ID (caso não tenha sido deletado).
 * 2. Cadastro Central do Usuário por Nome (caso o ID tenha sido recriado ou mudado).
 * 3. Configuração de ATM embutida no próprio robô (strat.risk_settings.atm_strategy), garantindo que alvos personalizados nunca se percam.
 * 4. Fallback para presets fixos APENAS se o ID não estiver na lista de deletados do usuário.
 */
export function resolveAlgorithmAtm(
  strat: any,
  availableAtmList?: ATMStrategy[]
): ATMStrategy | null {
  if (!strat) return null;

  const embeddedAtm: ATMStrategy | undefined = strat.risk_settings?.atm_strategy;
  const targetAtmId: string | undefined = strat.atm_strategy_id || strat.risk_settings?.atm_strategy_id || embeddedAtm?.id;
  const targetAtmName: string | undefined = strat.risk_settings?.atm_strategy_name || embeddedAtm?.name;

  // Carregar lista dinâmica salva pelo usuário (localStorage + lista passada via parâmetro/contexto)
  let liveList: ATMStrategy[] = [];
  if (availableAtmList && availableAtmList.length > 0) {
    liveList = [...availableAtmList];
  }
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem('vortex_atm_strategies');
      if (saved) {
        const parsed: ATMStrategy[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const map = new Map<string, ATMStrategy>();
          liveList.forEach(a => { if (a && a.id) map.set(a.id, a); });
          parsed.forEach(a => { if (a && a.id) map.set(a.id, a); });
          liveList = Array.from(map.values());
        }
      }
    } catch {}
  }

  // Obter IDs deletados pelo usuário
  let deletedSet = new Set<string>();
  if (typeof localStorage !== 'undefined') {
    try {
      const delStr = localStorage.getItem('vortex_deleted_atm_ids');
      if (delStr) {
        const delIds: string[] = JSON.parse(delStr);
        if (Array.isArray(delIds)) deletedSet = new Set(delIds);
      }
    } catch {}
  }

  // 1. Buscar no cadastro do usuário por ID
  let foundInRegistry: ATMStrategy | null = null;
  if (targetAtmId && !deletedSet.has(targetAtmId)) {
    foundInRegistry = liveList.find(a => a.id === targetAtmId) || null;
  }

  // 1.1 Se não achou por ID, tentar casar por nome no cadastro do usuário
  if (!foundInRegistry && targetAtmName) {
    const cleanTargetName = targetAtmName.replace(/[🎯⚖️🚀]/g, '').trim().toLowerCase();
    foundInRegistry = liveList.find(a => {
      if (deletedSet.has(a.id)) return false;
      const cleanName = a.name.replace(/[🎯⚖️🚀]/g, '').trim().toLowerCase();
      return cleanName === cleanTargetName;
    }) || null;
  }

  // Se encontrou no cadastro do usuário com brackets válidos, utiliza ela
  if (foundInRegistry && foundInRegistry.brackets && foundInRegistry.brackets.length > 0) {
    return foundInRegistry;
  }

  // 2. Se o robô possui uma ATM completa embutida diretamente nele (strat.risk_settings.atm_strategy)
  if (embeddedAtm && embeddedAtm.brackets && embeddedAtm.brackets.length > 0) {
    return embeddedAtm;
  }

  // 3. Fallback para presets fixos de fábrica APENAS se o ID não foi excluído pelo usuário
  if (targetAtmId && !deletedSet.has(targetAtmId)) {
    const presetFound = PRESET_ATM_STRATEGIES.find(a => a.id === targetAtmId);
    if (presetFound) return presetFound;
  }

  return null;
}
