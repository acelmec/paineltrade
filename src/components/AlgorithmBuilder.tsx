import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  type CustomStrategy,
  type StrategyLogicStage,
  type StrategyLogicCondition,
  normalizeStrategyStages
} from '../services/db';
import { sanitizeTimeMask } from '../utils/date';
import {
  ALGORITHM_INDICATORS,
  ALGORITHM_INDICATOR_CATEGORIES,
  CATEGORICAL_INDICATOR_IDS,
  getAlgorithmIndicatorDef,
  isConditionCategorical
} from '../utils/algorithmIndicators';
import {
  PRESET_ATM_STRATEGIES,
  resolveAlgorithmAtm,
  type ATMStrategy
} from '../utils/atmRegistry';
import { ATMStrategyModal } from './ATMStrategyModal';

export const AlgorithmBuilder: React.FC = () => {
  const {
    user,
    customStrategies,
    publicStrategies,
    fetchPublicStrategiesList,
    saveStrategyAction,
    deleteStrategyAction,
    toggleStrategyActiveAction,
    userPermissions,
    panels,
    atmStrategies,
    fetchAtmStrategiesList
  } = useApp();

  const [currentMainTab, setCurrentMainTab] = useState<'meus' | 'publicos'>('meus');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [activeTab, setActiveTab] = useState<'buy' | 'sell' | 'sessions' | 'action' | 'risk'>('buy');
  
  // Custom sharing & recommendation settings
  const [recommendedPanelId, setRecommendedPanelId] = useState<string | null>('all');
  const [isPublic, setIsPublic] = useState(false);

  // Timeframe, action, sessions
  const [timeframe, setTimeframe] = useState<number>(1);
  const [action, setAction] = useState<'position' | 'alert'>('alert');
  const [executionMode, setExecutionMode] = useState<'closed' | 'realtime'>('closed');

  const [session1Active, setSession1Active] = useState(false);
  const [session1Start, setSession1Start] = useState('09:00:00');
  const [session1End, setSession1End] = useState('18:00:00');

  const [session2Active, setSession2Active] = useState(false);
  const [session2Start, setSession2Start] = useState('14:00:00');
  const [session2End, setSession2End] = useState('18:00:00');

  // Search/Filter states
  const [searchEmail, setSearchEmail] = useState('');
  const [searchPanelId, setSearchPanelId] = useState('');
  
  // Sequential Logic Stages
  const [buyStages, setBuyStages] = useState<StrategyLogicStage[]>(() => [
    { id: 'buy_stage_1', stage_number: 1, name: 'Lógica 1', conditions: [], logic: 'AND', max_wait_candles: 0 }
  ]);
  const [sellStages, setSellStages] = useState<StrategyLogicStage[]>(() => [
    { id: 'sell_stage_1', stage_number: 1, name: 'Lógica 1', conditions: [], logic: 'AND', max_wait_candles: 0 }
  ]);
  
  // Risk settings
  const [lots, setLots] = useState(1);
  const [maxRiskUsd, setMaxRiskUsd] = useState(250);
  const [stopValue, setStopValue] = useState('20');
  const [takeValue, setTakeValue] = useState('40');
  const [maxDailyTrades, setMaxDailyTrades] = useState(5);

  // ATM Strategy State & Management (Sincronizado em tempo real com o Cadastro de ATMs)
  const currentAtmList = (atmStrategies && atmStrategies.length > 0) ? atmStrategies : PRESET_ATM_STRATEGIES;
  const [selectedATM, setSelectedATM] = useState<ATMStrategy | null>(currentAtmList[0] || null);
  const [selectedAtmIdToInclude, setSelectedAtmIdToInclude] = useState<string>(currentAtmList[0]?.id || '');
  const [isATMModalOpen, setIsATMModalOpen] = useState(false);

  useEffect(() => {
    if (atmStrategies && atmStrategies.length > 0) {
      if (selectedATM) {
        const found = atmStrategies.find(a => a.id === selectedATM.id);
        if (found && JSON.stringify(found) !== JSON.stringify(selectedATM)) {
          const isPresetDefault = PRESET_ATM_STRATEGIES.some(p => p.id === found.id && JSON.stringify(p.brackets) === JSON.stringify(found.brackets));
          const isSelectedCustom = !PRESET_ATM_STRATEGIES.some(p => p.id === selectedATM.id && JSON.stringify(p.brackets) === JSON.stringify(selectedATM.brackets));
          if (!isPresetDefault || !isSelectedCustom) {
            setSelectedATM(found);
          }
        }
      }
    }
  }, [atmStrategies]);

  const refreshAtmList = async () => {
    if (fetchAtmStrategiesList) {
      await fetchAtmStrategiesList();
    }
  };

  const handleRemoveAtmFromAlgorithm = () => {
    setSelectedATM(null);
    setSelectedAtmIdToInclude(currentAtmList[0]?.id || '');
  };

  const handleIncludeAtmToAlgorithm = () => {
    const targetId = selectedAtmIdToInclude || currentAtmList[0]?.id;
    const found = currentAtmList.find((a: ATMStrategy) => a.id === targetId) || PRESET_ATM_STRATEGIES.find((a: ATMStrategy) => a.id === targetId) || currentAtmList[0];
    if (found) {
      setSelectedATM(found);
    }
  };

  // Config popup modal state
  const [activeConfigTarget, setActiveConfigTarget] = useState<{
    type: 'buy' | 'sell';
    stageId: string;
    condId: string;
    isTarget: boolean;
  } | null>(null);

  const handleTimeMask = (value: string, setter: (val: string) => void) => {
    setter(sanitizeTimeMask(value, true));
  };

  const resetForm = () => {
    setEditingId(undefined);
    setName('');
    setDescription('');
    setBuyStages([
      { id: `buy_stage_${Date.now()}`, stage_number: 1, name: 'Lógica 1', conditions: [], logic: 'AND', max_wait_candles: 0 }
    ]);
    setSellStages([
      { id: `sell_stage_${Date.now()}`, stage_number: 1, name: 'Lógica 1', conditions: [], logic: 'AND', max_wait_candles: 0 }
    ]);
    setLots(1);
    setMaxRiskUsd(250);
    setStopValue('20');
    setTakeValue('40');
    setMaxDailyTrades(5);
    setRecommendedPanelId('all');
    setIsPublic(false);
    setTimeframe(1);
    setAction('alert');
    setExecutionMode('closed');
    setSession1Active(false);
    setSession1Start('09:00:00');
    setSession1End('18:00:00');
    setSession2Active(false);
    setSession2Start('14:00:00');
    setSession2End('18:00:00');
    setSelectedATM(currentAtmList[0] || PRESET_ATM_STRATEGIES[0]);
    setActiveConfigTarget(null);
    setIsEditing(false);
  };

  const handleCreateNew = () => {
    resetForm();
    setIsEditing(true);
    setActiveTab('buy');
  };

  const handleEdit = (strat: CustomStrategy) => {
    setEditingId(strat.id);
    setName(strat.name);
    setDescription(strat.description || '');

    const normalizedBuy = normalizeStrategyStages(strat.buy_stages || strat.buy_conditions, 'buy');
    const normalizedSell = normalizeStrategyStages(strat.sell_stages || strat.sell_conditions, 'sell');

    setBuyStages(normalizedBuy);
    setSellStages(normalizedSell);

    // Carregar Estratégia ATM associada ao robô com priorização inteligente
    const resolvedAtm = resolveAlgorithmAtm(strat, currentAtmList);
    if (resolvedAtm) {
      setSelectedATM(resolvedAtm);
      setSelectedAtmIdToInclude(resolvedAtm.id);
    } else if (strat.risk_settings?.use_atm !== false && (strat.risk_settings?.stop_value || strat.risk_settings?.take_value)) {
      const legacySl = Number(strat.risk_settings?.stop_value || 20);
      const legacyTp = Number(strat.risk_settings?.take_value || 40);
      const legacyLots = Number(strat.risk_settings?.lots || 1);
      setSelectedATM({
        id: `atm-legacy-${strat.id || Date.now()}`,
        name: `🎯 ATM Personalizada (${legacyLots}x - SL ${legacySl}pt / TP ${legacyTp}pt)`,
        brackets: [{
          id: 'b-1',
          quantity: legacyLots,
          stopLossPts: legacySl,
          takeProfitPts: legacyTp,
          autoBreakevenEnabled: false,
          autoBreakevenTriggerPts: 0,
          autoBreakevenOffsetPts: 0,
          trailingStopEnabled: false,
          trailingStopTriggerPts: 0,
          trailingStopStepPts: 0
        }]
      });
    } else {
      setSelectedATM(null);
    }

    setLots(strat.risk_settings?.lots || 1);
    setMaxRiskUsd(strat.risk_settings?.max_risk_usd !== undefined ? Number(strat.risk_settings.max_risk_usd) : 250);
    setStopValue(strat.risk_settings?.stop_value || '20');
    setTakeValue(strat.risk_settings?.take_value || '40');
    const dailyLimit = strat.risk_settings?.max_daily_trades || strat.max_entries || 5;
    setMaxDailyTrades(dailyLimit);
    setRecommendedPanelId(strat.panel_id || 'all');
    setIsPublic(strat.is_public || false);
    
    setTimeframe(strat.timeframe || 1);
    setAction(strat.action || 'alert');
    setExecutionMode(strat.execution_mode || 'closed');

    const ensureSeconds = (timeStr: string) => {
      if (!timeStr) return '00:00:00';
      const parts = timeStr.split(':');
      if (parts.length === 2) return `${timeStr}:00`;
      return timeStr;
    };

    const s1 = strat.sessions?.[0] || { start: '09:00:00', end: '18:00:00', active: false };
    const s2 = strat.sessions?.[1] || { start: '14:00:00', end: '18:00:00', active: false };
    setSession1Active(s1.active);
    setSession1Start(ensureSeconds(s1.start));
    setSession1End(ensureSeconds(s1.end));
    setSession2Active(s2.active);
    setSession2Start(ensureSeconds(s2.start));
    setSession2End(ensureSeconds(s2.end));

    const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
    const isProtected = !isSystemAdmin && (strat.is_admin_featured === true || strat.user_email === 'admin@vortex.com' || strat.is_copied === true);

    setIsEditing(true);
    setActiveTab(isProtected ? 'action' : 'buy');
  };

  // --- STAGE OPERATIONS ---
  const handleAddStage = (type: 'buy' | 'sell') => {
    const setter = type === 'buy' ? setBuyStages : setSellStages;
    setter(prev => {
      const nextNum = prev.length + 1;
      const newStage: StrategyLogicStage = {
        id: `${type}_stage_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        stage_number: nextNum,
        name: `Lógica ${nextNum}`,
        conditions: [{
          id: `${type}_cond_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          source: 'price',
          operator: 'gt',
          target_type: 'value',
          target_value: '0'
        }],
        logic: 'AND',
        max_wait_candles: 0
      };
      return [...prev, newStage];
    });
  };

  const handleRemoveStage = (type: 'buy' | 'sell', stageId: string) => {
    const setter = type === 'buy' ? setBuyStages : setSellStages;
    setter(prev => {
      if (prev.length <= 1) {
        return [{
          id: `${type}_stage_${Date.now()}`,
          stage_number: 1,
          name: 'Lógica 1',
          conditions: [],
          logic: 'AND',
          max_wait_candles: 0
        }];
      }
      const filtered = prev.filter(s => s.id !== stageId);
      return filtered.map((s, idx) => ({
        ...s,
        stage_number: idx + 1,
        name: s.name?.startsWith('Lógica ') ? `Lógica ${idx + 1}` : s.name
      }));
    });
  };

  const handleDuplicateStage = (type: 'buy' | 'sell', stageIndex: number) => {
    const setter = type === 'buy' ? setBuyStages : setSellStages;
    setter(prev => {
      const target = prev[stageIndex];
      if (!target) return prev;
      const dup: StrategyLogicStage = {
        id: `${type}_stage_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        stage_number: prev.length + 1,
        name: `${target.name || `Lógica ${stageIndex + 1}`} (Cópia)`,
        conditions: (target.conditions || []).map((c, i) => ({
          ...c,
          id: `${type}_cond_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`
        })),
        logic: target.logic || 'AND',
        max_wait_candles: target.max_wait_candles || 0
      };
      const next = [...prev];
      next.splice(stageIndex + 1, 0, dup);
      return next.map((s, idx) => ({
        ...s,
        stage_number: idx + 1
      }));
    });
  };

  const handleStageFieldChange = (type: 'buy' | 'sell', stageId: string, field: 'name' | 'logic' | 'max_wait_candles', value: any) => {
    const setter = type === 'buy' ? setBuyStages : setSellStages;
    setter(prev => prev.map(s => s.id === stageId ? { ...s, [field]: value } : s));
  };

  // --- CONDITION OPERATIONS INSIDE A STAGE ---
  const handleAddCondition = (type: 'buy' | 'sell', stageId: string) => {
    const setter = type === 'buy' ? setBuyStages : setSellStages;
    const newCond: StrategyLogicCondition = {
      id: `${type}_cond_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      source: 'price',
      operator: 'gt',
      target_type: 'value',
      target_value: '0'
    };
    setter(prev => prev.map(s => s.id === stageId ? { ...s, conditions: [...s.conditions, newCond] } : s));
  };

  const handleRemoveCondition = (type: 'buy' | 'sell', stageId: string, condId: string) => {
    const setter = type === 'buy' ? setBuyStages : setSellStages;
    setter(prev => prev.map(s => s.id === stageId ? { ...s, conditions: s.conditions.filter(c => c.id !== condId) } : s));
  };

  const handleConditionChange = (type: 'buy' | 'sell', stageId: string, condId: string, field: string, value: any) => {
    const setter = type === 'buy' ? setBuyStages : setSellStages;
    setter(prev => prev.map(s => {
      if (s.id !== stageId) return s;
      const updatedConds = s.conditions.map(c => {
        if (c.id !== condId) return c;
        const updated = { ...c, [field]: value };
        if (field === 'source') {
          if (CATEGORICAL_INDICATOR_IDS.includes(value)) {
            updated.target_type = 'value';
          }
          if (['pva', 'gamma_bias', 'pattern_pinbar', 'pattern_engolfo', 'pattern_180', 'pattern_star3', 'pattern_chute', 'fvg_tipo', 'emacd_trend', 'AXION_TREND', 'AXION_TREND_ARROWS', 'AXION_TREND_CANDLES', 'AXION_TREND_CONCILIATED', 'axion_trend_arrows', 'axion_trend_candles', 'axion_trend_conciliated'].includes(value)) {
            if (!['compra', 'venda', 'neutro'].includes(updated.target_value)) {
              updated.target_value = type === 'sell' ? 'venda' : 'compra';
              updated.operator = 'eq';
            }
          } else if (value === 'noticia_impacto') {
            if (!['alto', 'medio', 'baixo', 'nenhum'].includes(updated.target_value)) {
              updated.target_value = 'alto';
              updated.operator = 'eq';
            }
          } else if (value === 'noticia_pais') {
            if (!['USD', 'EUR', 'BRL', 'CNY', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'].includes(updated.target_value)) {
              updated.target_value = 'USD';
              updated.operator = 'eq';
            }
          } else if (value === 'estado') {
            const validStates = ['NORMAL', 'AGUARDANDO', 'COMPRA', 'VENDA', 'EXPLOSÃO COMPRA', 'EXPLOSAO COMPRA', 'EXPLOSÃO VENDA', 'EXPLOSAO VENDA', 'EXAUSTÃO COMPRA', 'EXAUSTAO COMPRA', 'EXAUSTAO DE COMPRA', 'EXAUSTAO_ALTA', 'EXAUSTÃO VENDA', 'EXAUSTAO VENDA', 'EXAUSTAO DE VENDA', 'EXAUSTAO_BAIXA', 'COMPRESSÃO', 'COMPRESSAO', 'SAIR', 'BUY', 'SELL', 'EXIT'];
            if (!validStates.includes(updated.target_value)) {
              updated.target_value = 'EXPLOSÃO COMPRA';
              updated.operator = 'eq';
            }
          } else if (['blocktrades_side', 'blockTrades_side'].includes(value)) {
            if (!['compra', 'venda', 'neutro'].includes(updated.target_value)) {
              updated.target_value = type === 'sell' ? 'venda' : 'compra';
              updated.operator = 'eq';
            }
          } else {
            if (['compra', 'venda', 'neutro', 'alto', 'medio', 'baixo', 'nenhum', 'USD', 'EUR', 'BRL', 'AGUARDANDO', 'COMPRA', 'VENDA', 'SAIR'].includes(updated.target_value)) {
              updated.target_value = '0';
            }
          }
        } else if (field === 'subSeries' || field === 'source_subSeries') {
          if (isConditionCategorical(updated)) {
            updated.target_type = 'value';
            if (!['eq', 'neq'].includes(updated.operator)) {
              updated.operator = 'eq';
            }
            if ((updated.source === 'AXION_TREND' || updated.source === 'axion_trend') && !['compra', 'venda', 'neutro'].includes(updated.target_value)) {
              updated.target_value = type === 'sell' ? 'venda' : 'compra';
            }
          } else if (['compra', 'venda', 'neutro'].includes(updated.target_value)) {
            updated.target_value = '0';
          }
        } else if (field === 'target_type') {
          if (value === 'indicator') {
            const isValidInd = ALGORITHM_INDICATORS.some(o => o.id === updated.target_value && !CATEGORICAL_INDICATOR_IDS.includes(o.id));
            if (!isValidInd) {
              updated.target_value = 'SMA';
            }
          } else if (value === 'value') {
            delete updated.target_indicator;
            delete updated.target_subSeries;
            delete updated.target_params;
            if (ALGORITHM_INDICATORS.some(o => o.id === updated.target_value)) {
              updated.target_value = '0';
            }
          }
        }
        return updated;
      });
      return { ...s, conditions: updatedConds };
    }));
  };

  const renderIndicatorSelect = (type: 'buy' | 'sell', stageId: string, cond: any, isTarget: boolean = false) => {
    const currentVal = isTarget ? (cond.target_indicator || cond.target_value || 'SMA') : (cond.source || 'price');

    return (
      <select
        value={currentVal}
        onChange={(e) => {
          const val = e.target.value;
          const def = getAlgorithmIndicatorDef(val);
          const defaultSub = def?.subSeries && def.subSeries.length > 0 ? def.subSeries[0].value : '';
          if (isTarget) {
            handleConditionChange(type, stageId, cond.id, 'target_indicator', val);
            handleConditionChange(type, stageId, cond.id, 'target_value', val);
            if (defaultSub) {
              handleConditionChange(type, stageId, cond.id, 'target_subSeries', defaultSub);
            }
          } else {
            handleConditionChange(type, stageId, cond.id, 'source', val);
            if (defaultSub) {
              handleConditionChange(type, stageId, cond.id, 'source_subSeries', defaultSub);
              handleConditionChange(type, stageId, cond.id, 'subSeries', defaultSub);
            }
          }
        }}
        className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none max-w-[220px] truncate cursor-pointer font-semibold"
      >
        {ALGORITHM_INDICATOR_CATEGORIES.map(cat => {
          const catInds = ALGORITHM_INDICATORS.filter(i => i.category === cat);
          if (catInds.length === 0) return null;
          return (
            <optgroup key={cat} label={`── ${cat.toUpperCase()} ──`}>
              {catInds.map(ind => (
                <option key={ind.id} value={ind.id}>{ind.name}</option>
              ))}
            </optgroup>
          );
        })}
      </select>
    );
  };

  const renderIndicatorParams = (type: 'buy' | 'sell', stageId: string, cond: any, isTarget: boolean = false) => {
    const indId = isTarget ? (cond.target_indicator || cond.target_value) : cond.source;
    const def = getAlgorithmIndicatorDef(indId);
    if (!def || (!def.paramDefs && (!def.subSeries || def.subSeries.length === 0))) return null;

    const currentParams = isTarget ? (cond.target_params || {}) : (cond.source_params || cond.params || {});
    const currentSubSeries = isTarget ? cond.target_subSeries : (cond.subSeries || cond.source_subSeries);

    const handleSubSeriesChange = (val: string) => {
      const fieldName = isTarget ? 'target_subSeries' : 'source_subSeries';
      handleConditionChange(type, stageId, cond.id, fieldName, val);
      if (!isTarget) {
        handleConditionChange(type, stageId, cond.id, 'subSeries', val);
      }
    };

    const paramSummary = def.paramDefs
      ? def.paramDefs.map(p => currentParams[p.key] !== undefined ? currentParams[p.key] : p.default).join(', ')
      : '';

    return (
      <div className="flex items-center gap-1 font-mono">
        {def.subSeries && def.subSeries.length > 0 && (
          <select
            value={currentSubSeries || def.subSeries[0].value}
            onChange={(e) => handleSubSeriesChange(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-sky-300 font-bold focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            {def.subSeries.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        )}

        {def.paramDefs && def.paramDefs.length > 0 && (
          def.paramDefs.length === 1 && def.paramDefs[0].type === 'select' ? (
            <select
              value={currentParams[def.paramDefs[0].key] !== undefined ? currentParams[def.paramDefs[0].key] : def.paramDefs[0].default}
              onChange={(e) => {
                const paramKey = def.paramDefs![0].key;
                const val = e.target.value;
                const fieldName = isTarget ? 'target_params' : 'source_params';
                const updatedParams = { ...currentParams, [paramKey]: val };
                handleConditionChange(type, stageId, cond.id, fieldName, updatedParams);
                if (!isTarget) {
                  handleConditionChange(type, stageId, cond.id, 'params', updatedParams);
                }
              }}
              className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-amber-300 font-bold focus:outline-none focus:border-amber-500 cursor-pointer max-w-[180px] truncate"
              title={def.paramDefs[0].label}
            >
              {def.paramDefs[0].options?.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => setActiveConfigTarget({ type, stageId, condId: cond.id, isTarget })}
              className="flex items-center gap-1.5 px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-blue-500/80 rounded text-[11px] text-slate-300 transition shadow-sm font-semibold group cursor-pointer"
              title={`Clique para configurar os parâmetros de ${def.name} (${paramSummary})`}
            >
              <span className="text-blue-400 group-hover:rotate-45 transition-transform duration-200">⚙️</span>
              <span className="text-[10px] text-slate-400 font-mono font-bold">({paramSummary})</span>
            </button>
          )
        )}
      </div>
    );
  };

  const renderConfigModal = () => {
    if (!activeConfigTarget) return null;

    const { type, stageId, condId, isTarget } = activeConfigTarget;
    const stages = type === 'buy' ? buyStages : sellStages;
    const stage = stages.find(s => s.id === stageId);
    const cond = stage?.conditions.find(c => c.id === condId);
    if (!cond) return null;

    const indId = isTarget ? (cond.target_indicator || cond.target_value) : cond.source;
    const def = getAlgorithmIndicatorDef(indId);
    if (!def || !def.paramDefs) return null;

    const currentParams = isTarget ? (cond.target_params || {}) : (cond.source_params || cond.params || {});

    const handleParamChange = (paramKey: string, val: any) => {
      const fieldName = isTarget ? 'target_params' : 'source_params';
      const updatedParams = { ...currentParams, [paramKey]: val };
      handleConditionChange(type, stageId, cond.id, fieldName, updatedParams);
      if (!isTarget) {
        handleConditionChange(type, stageId, cond.id, 'params', updatedParams);
      }
    };

    const handleResetDefaults = () => {
      const defaultParams: Record<string, any> = {};
      def.paramDefs?.forEach(p => {
        defaultParams[p.key] = p.default;
      });
      const fieldName = isTarget ? 'target_params' : 'source_params';
      handleConditionChange(type, stageId, cond.id, fieldName, defaultParams);
      if (!isTarget) {
        handleConditionChange(type, stageId, cond.id, 'params', defaultParams);
      }
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fadeIn">
        <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4 font-mono text-slate-100 border-t-2 border-t-blue-500">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚙️</span>
              <h3 className="text-sm font-bold text-slate-100">
                Configurar Parâmetros
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveConfigTarget(null)}
              className="text-slate-400 hover:text-slate-200 text-sm font-bold p-1 rounded cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Subtítulo / Nome do Indicador */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs">
            <span className="text-blue-400 font-bold">{def.name}</span>
            {def.description && (
              <p className="text-[11px] text-slate-400 mt-1 font-sans leading-relaxed">
                {def.description}
              </p>
            )}
          </div>

          {/* Form de Parâmetros */}
          <div className="space-y-3 py-1">
            {def.id === 'LEVELS_TIME_RANGE' && ((currentParams['sessionMode'] || 'custom') === 'all' || Boolean(currentParams['useFullSession'])) && (
              <div className="p-2.5 rounded-lg bg-blue-950/40 border border-blue-800/60 text-xs text-blue-300 flex items-start gap-2 font-sans">
                <span className="text-base shrink-0">🕒</span>
                <div>
                  <strong className="block text-blue-200 font-bold mb-0.5">Modo Toda a Sessão Ativo</strong>
                  <span className="text-slate-300 leading-relaxed text-[11px]">
                    O robô avaliará os níveis de Máxima, Mínima e 50% formados ao longo de todo o ciclo da sessão cadastrada no sistema (das 19:00 de um dia até as 18:00 do dia seguinte).
                  </span>
                </div>
              </div>
            )}
            {(def.id === 'VOLUME_LEVELS' || def.id === 'VOLUME_HVN_BLOCKS') && (currentParams['sessionMode'] === 'bars') && (
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300 flex items-start gap-2 font-sans">
                <span className="text-base shrink-0">📊</span>
                <div>
                  <strong className="block text-emerald-200 font-bold mb-0.5">Modo Últimas {currentParams['lookbackBars'] || 30} Velas (Timeframe Atual)</strong>
                  <span className="text-slate-300 leading-relaxed text-[11px]">
                    O robô calculará as zonas de volume e absorção nas últimas {currentParams['lookbackBars'] || 30} velas do timeframe configurado na estratégia.
                  </span>
                </div>
              </div>
            )}
            {def.paramDefs.filter(p => {
              const sMode = currentParams['sessionMode'] || (def.id === 'LEVELS_TIME_RANGE' ? 'custom' : 'all');
              const isAll = sMode === 'all' || Boolean(currentParams['useFullSession']);
              if (def.id === 'LEVELS_TIME_RANGE' && isAll) {
                if (p.key === 'startTime' || p.key === 'endTime' || p.key === 'sessionEnd') return false;
              }
              if (def.id === 'VOLUME_LEVELS' || def.id === 'VOLUME_HVN_BLOCKS') {
                if ((p.key === 'customStart' || p.key === 'customEnd') && sMode !== 'custom') return false;
                if (p.key === 'lookbackBars' && sMode !== 'bars') return false;
                if (p.key === 'lookbackDays' && sMode === 'bars') return false;
              }
              return true;
            }).map(p => {
              const val = currentParams[p.key] !== undefined ? currentParams[p.key] : p.default;
              return (
                <div key={p.key} className="flex items-center justify-between gap-3 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                  <label className="text-xs font-semibold text-slate-300">
                    {p.label}
                  </label>
                  {p.type === 'select' ? (
                    <select
                      value={val}
                      onChange={(e) => {
                        const newV = e.target.value;
                        handleParamChange(p.key, newV);
                        if (def.id === 'LEVELS_TIME_RANGE' && p.key === 'sessionMode') {
                          handleParamChange('useFullSession', newV === 'all');
                        }
                      }}
                      className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500 cursor-pointer font-bold"
                    >
                      {p.options?.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : p.type === 'boolean' ? (
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={Boolean(val)}
                        onChange={(e) => {
                          const newB = e.target.checked;
                          handleParamChange(p.key, newB);
                          if (def.id === 'LEVELS_TIME_RANGE' && p.key === 'useFullSession') {
                            handleParamChange('sessionMode', newB ? 'all' : 'custom');
                          }
                        }}
                        className="w-4 h-4 rounded bg-slate-900 border border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span className="text-xs text-slate-300 font-semibold">
                        {def.id === 'LEVELS_TIME_RANGE' && p.key === 'useFullSession'
                          ? (val ? 'Ativado (19h às 18h)' : 'Desativado')
                          : (val ? 'Exibir / Ativado' : 'Ocultar / Desativado')}
                      </span>
                    </label>
                  ) : p.type === 'string' ? (
                    <input
                      type="text"
                      value={val ?? p.default}
                      placeholder={p.default && String(p.default).includes(':') ? 'HH:MM' : 'HH:MM'}
                      maxLength={5}
                      onChange={(e) => {
                        const isTime = p.key.toLowerCase().includes('time') || 
                                       p.key.toLowerCase().includes('start') || 
                                       p.key.toLowerCase().includes('end') || 
                                       p.key.toLowerCase().includes('session') ||
                                       p.label.includes('HH:MM') ||
                                       (typeof p.default === 'string' && /^\d{2}:\d{2}/.test(p.default));
                        const formatted = isTime ? sanitizeTimeMask(e.target.value, false) : e.target.value;
                        handleParamChange(p.key, formatted);
                      }}
                      onBlur={() => {
                        const isTime = p.key.toLowerCase().includes('time') || 
                                       p.key.toLowerCase().includes('start') || 
                                       p.key.toLowerCase().includes('end') || 
                                       p.key.toLowerCase().includes('session') ||
                                       p.label.includes('HH:MM') ||
                                       (typeof p.default === 'string' && /^\d{2}:\d{2}/.test(p.default));
                        if (isTime) {
                          if (!val || val.length < 3) {
                            handleParamChange(p.key, p.default);
                          } else if (val.length < 5 && val.includes(':')) {
                            const [h, m] = val.split(':');
                            handleParamChange(p.key, `${h.padStart(2, '0')}:${(m || '').padEnd(2, '0')}`);
                          }
                        }
                      }}
                      className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 w-24 text-center font-mono focus:outline-none focus:border-blue-500 font-bold"
                    />
                  ) : (
                    <input
                      type="number"
                      value={val}
                      min={p.min}
                      max={p.max}
                      step={p.step || 1}
                      onChange={(e) => handleParamChange(p.key, Number(e.target.value))}
                      className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 w-24 text-right font-mono focus:outline-none focus:border-blue-500 font-bold"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800 gap-2">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              🔄 Padrão
            </button>
            <button
              type="button"
              onClick={() => setActiveConfigTarget(null)}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition shadow-md cursor-pointer"
            >
              ✓ OK / Confirmar
            </button>
          </div>

        </div>
      </div>
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Por favor, defina um nome para a estratégia.');
      return;
    }

    const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
    const editingStrat = editingId ? customStrategies.find(s => s.id === editingId) : null;
    const isProtectedStrategy = !isSystemAdmin && (
      editingStrat?.is_admin_featured === true ||
      editingStrat?.user_email === 'admin@vortex.com' ||
      editingStrat?.is_copied === true
    );
    const canShareStrategy = !isProtectedStrategy && (isSystemAdmin || userPermissions.allow_share_strategies === true);

    const hasBuyConditions = buyStages.some(st => st.conditions && st.conditions.length > 0);
    const hasSellConditions = sellStages.some(st => st.conditions && st.conditions.length > 0);

    if (!isProtectedStrategy && !hasBuyConditions && !hasSellConditions) {
      alert('A estratégia precisa ter pelo menos uma condição de compra ou de venda configurada.');
      return;
    }

    const effectivePanelId = recommendedPanelId || 'all';

    setIsSaving(true);
    try {
      const sanitizeCondition = (c: any, isSell: boolean = false) => {
        let cond = { ...c };
        const isCategorical = isConditionCategorical(cond);
        if (isCategorical) {
          cond.target_type = 'value';
        }
        if (cond.target_type === 'indicator') {
          const targetInd = cond.target_indicator || cond.target_value;
          const isValidInd = ALGORITHM_INDICATORS.some(o => o.id === targetInd && !CATEGORICAL_INDICATOR_IDS.includes(o.id));
          if (!isValidInd) {
            cond.target_value = 'SMA';
            cond.target_indicator = 'SMA';
          }
          const targetDef = getAlgorithmIndicatorDef(cond.target_indicator || cond.target_value);
          if (targetDef?.subSeries && targetDef.subSeries.length > 0 && !cond.target_subSeries) {
            cond.target_subSeries = targetDef.subSeries[0].value;
          }
        } else if (cond.target_type === 'value') {
          delete cond.target_indicator;
          delete cond.target_subSeries;
          delete cond.target_params;
        }

        const source = cond.source || cond.indicator || '';
        let subSeries = cond.subSeries || cond.source_subSeries || '';

        const srcDef = getAlgorithmIndicatorDef(source);
        if (srcDef?.subSeries && srcDef.subSeries.length > 0) {
          if (!subSeries) {
            subSeries = srcDef.subSeries[0].value;
          }
          if (!cond.source_subSeries) cond.source_subSeries = subSeries;
          if (!cond.subSeries) cond.subSeries = subSeries;
        }

        if (source === 'VOLUME_HVN_BLOCKS' || source === 'volume_hvn_blocks') {
          if (subSeries === 'inside_any') {
            if (!['sim', 'nao'].includes(cond.target_value)) {
              return { ...cond, target_type: 'value', target_value: 'sim', operator: 'eq' };
            }
            return { ...cond, target_type: 'value' };
          }
        }

        if (source === 'Supertrend' || source === 'supertrend') {
          if (subSeries === 'signal_buy' && !['compra', 'neutro'].includes(cond.target_value)) {
            return { ...cond, target_type: 'value', target_value: 'compra', operator: 'eq' };
          }
          if (subSeries === 'signal_sell' && !['venda', 'neutro'].includes(cond.target_value)) {
            return { ...cond, target_type: 'value', target_value: 'venda', operator: 'eq' };
          }
          if (subSeries === 'trend' && !['compra', 'venda'].includes(cond.target_value)) {
            return { ...cond, target_type: 'value', target_value: isSell ? 'venda' : 'compra', operator: 'eq' };
          }
        }

        if (source === 'MACD' || source === 'macd') {
          if (subSeries === 'divergence_bullish' && !['compra', 'neutro'].includes(cond.target_value)) {
            return { ...cond, target_type: 'value', target_value: 'compra', operator: 'eq' };
          }
          if (subSeries === 'divergence_bearish' && !['venda', 'neutro'].includes(cond.target_value)) {
            return { ...cond, target_type: 'value', target_value: 'venda', operator: 'eq' };
          }
          if ((subSeries === 'divergence_trend' || subSeries === 'divergence') && !['compra', 'venda', 'neutro'].includes(cond.target_value)) {
            return { ...cond, target_type: 'value', target_value: isSell ? 'venda' : 'compra', operator: 'eq' };
          }
        }

        if (source === 'SMC_BOS_CHOCH' || source === 'smc_bos_choch') {
          if (subSeries === 'bos_bullish' || subSeries === 'choch_bullish') {
            if (!['compra', 'neutro'].includes(cond.target_value)) {
              return { ...cond, target_type: 'value', target_value: 'compra', operator: 'eq' };
            }
          } else if (subSeries === 'bos_bearish' || subSeries === 'choch_bearish') {
            if (!['venda', 'neutro'].includes(cond.target_value)) {
              return { ...cond, target_type: 'value', target_value: 'venda', operator: 'eq' };
            }
          } else if (['signal', 'bos', 'choch'].includes(subSeries)) {
            if (!['compra', 'venda', 'neutro'].includes(cond.target_value)) {
              return { ...cond, target_type: 'value', target_value: isSell ? 'venda' : 'compra', operator: 'eq' };
            }
          }
        }

        if (source === 'SMC_RANGE_FILTER' || source === 'smc_range_filter') {
          if (subSeries === 'status') {
            if (!['aprovado', 'reprovado'].includes(cond.target_value)) {
              return { ...cond, target_type: 'value', target_value: 'aprovado', operator: 'eq' };
            }
          } else if (['breakout_buy', 'pullback_buy'].includes(subSeries)) {
            if (!['compra', 'neutro'].includes(cond.target_value)) {
              return { ...cond, target_type: 'value', target_value: 'compra', operator: 'eq' };
            }
          } else if (['breakout_sell', 'pullback_sell'].includes(subSeries)) {
            if (!['venda', 'neutro'].includes(cond.target_value)) {
              return { ...cond, target_type: 'value', target_value: 'venda', operator: 'eq' };
            }
          } else if (['zone_direction', 'breakout_status', 'pullback_status'].includes(subSeries)) {
            if (!['compra', 'venda', 'neutro'].includes(cond.target_value)) {
              return { ...cond, target_type: 'value', target_value: isSell ? 'venda' : 'compra', operator: 'eq' };
            }
          }
        }

        if (source === 'MA_CLOUD_FILTER' || source === 'ma_cloud_filter') {
          if (subSeries === 'status') {
            if (!['aprovado', 'reprovado'].includes(cond.target_value)) {
              return { ...cond, target_type: 'value', target_value: 'aprovado', operator: 'eq' };
            }
          } else if (subSeries === 'buy_valid') {
            if (!['compra', 'neutro'].includes(cond.target_value)) {
              return { ...cond, target_type: 'value', target_value: 'compra', operator: 'eq' };
            }
          } else if (subSeries === 'sell_valid') {
            if (!['venda', 'neutro'].includes(cond.target_value)) {
              return { ...cond, target_type: 'value', target_value: 'venda', operator: 'eq' };
            }
          } else if (subSeries === 'direction') {
            if (!['compra', 'venda', 'neutro'].includes(cond.target_value)) {
              return { ...cond, target_type: 'value', target_value: isSell ? 'venda' : 'compra', operator: 'eq' };
            }
          }
        }

        if (['pva', 'gamma_bias', 'pattern_pinbar', 'pattern_engolfo', 'pattern_180', 'pattern_star3', 'pattern_chute', 'fvg_tipo', 'blocktrades_side', 'blockTrades_side', 'emacd_trend'].includes(source) || (source === 'EMACD' && subSeries === 'trend')) {
          if (!['compra', 'venda', 'neutro'].includes(cond.target_value)) {
            return { ...cond, target_type: 'value', target_value: isSell ? 'venda' : 'compra', operator: 'eq' };
          }
          return { ...cond, target_type: 'value' };
        } else if (source === 'noticia_impacto') {
          if (!['alto', 'medio', 'baixo', 'nenhum'].includes(cond.target_value)) {
            return { ...cond, target_type: 'value', target_value: 'alto', operator: 'eq' };
          }
          return { ...cond, target_type: 'value' };
        } else if (source === 'noticia_pais') {
          if (!['USD', 'EUR', 'BRL', 'CNY', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'].includes(cond.target_value)) {
            return { ...cond, target_type: 'value', target_value: 'USD', operator: 'eq' };
          }
          return { ...cond, target_type: 'value' };
        } else if (source === 'estado') {
          const validStates = ['NORMAL', 'AGUARDANDO', 'COMPRA', 'VENDA', 'EXPLOSÃO COMPRA', 'EXPLOSAO COMPRA', 'EXPLOSÃO VENDA', 'EXPLOSAO VENDA', 'EXAUSTÃO COMPRA', 'EXAUSTAO COMPRA', 'EXAUSTAO DE COMPRA', 'EXAUSTAO_ALTA', 'EXAUSTÃO VENDA', 'EXAUSTAO VENDA', 'EXAUSTAO DE VENDA', 'EXAUSTAO_BAIXA', 'COMPRESSÃO', 'COMPRESSAO', 'SAIR', 'BUY', 'SELL', 'EXIT'];
          if (!validStates.includes(cond.target_value)) {
            return { ...cond, target_type: 'value', target_value: 'EXPLOSÃO COMPRA', operator: 'eq' };
          }
          return { ...cond, target_type: 'value' };
        }
        return cond;
      };

      const sanitizedBuyStages: StrategyLogicStage[] = buyStages.map((st, sIdx) => ({
        ...st,
        stage_number: sIdx + 1,
        name: st.name?.trim() || `Lógica ${sIdx + 1}`,
        logic: st.logic === 'OR' ? 'OR' : 'AND',
        max_wait_candles: typeof st.max_wait_candles === 'number' ? st.max_wait_candles : 0,
        conditions: (st.conditions || []).map(c => sanitizeCondition(c, false))
      }));

      const sanitizedSellStages: StrategyLogicStage[] = sellStages.map((st, sIdx) => ({
        ...st,
        stage_number: sIdx + 1,
        name: st.name?.trim() || `Lógica ${sIdx + 1}`,
        logic: st.logic === 'OR' ? 'OR' : 'AND',
        max_wait_candles: typeof st.max_wait_candles === 'number' ? st.max_wait_candles : 0,
        conditions: (st.conditions || []).map(c => sanitizeCondition(c, true))
      }));

      const finalBuyStages = isProtectedStrategy ? (editingStrat?.buy_stages || editingStrat?.buy_conditions || []) : sanitizedBuyStages;
      const finalSellStages = isProtectedStrategy ? (editingStrat?.sell_stages || editingStrat?.sell_conditions || []) : sanitizedSellStages;

      if (action === 'position' && !selectedATM) {
        alert('Por favor, inclua uma Estratégia ATM para o robô na aba "Gestão ATM & Risco" antes de salvar.');
        setActiveTab('risk');
        setIsSaving(false);
        return;
      }

      const totalAtmContracts = selectedATM ? (selectedATM.brackets || []).reduce((acc, b) => acc + (Number(b.quantity) || 1), 0) : (Number(lots) || 1);
      const firstBracket = selectedATM?.brackets?.[0] || { stopLossPts: Number(stopValue) || 20, takeProfitPts: Number(takeValue) || 40 };

      const payload: CustomStrategy = {
        id: editingId,
        panel_id: effectivePanelId,
        name,
        description,
        buy_conditions: finalBuyStages,
        sell_conditions: finalSellStages,
        buy_stages: finalBuyStages,
        sell_stages: finalSellStages,
        risk_settings: {
          lots: totalAtmContracts > 0 ? totalAtmContracts : (Number(lots) || 1),
          sizing_mode: 'lote',
          max_risk_usd: Number(maxRiskUsd) || 250,
          stop_value: String(firstBracket.stopLossPts || stopValue || 20),
          stop_type: 'points',
          take_value: String(firstBracket.takeProfitPts || takeValue || 40),
          take_type: 'points',
          max_daily_trades: maxDailyTrades,
          target_panel_id: effectivePanelId,
          use_atm: Boolean(selectedATM),
          atm_strategy_id: selectedATM?.id || undefined,
          atm_strategy_name: selectedATM?.name || '',
          atm_strategy: selectedATM || undefined
        },
        atm_strategy_id: selectedATM?.id || undefined,
        active: editingStrat ? editingStrat.active : false,
        is_public: canShareStrategy ? isPublic : (editingStrat?.is_public || false),
        is_admin_featured: editingStrat?.is_admin_featured || false,
        is_copied: editingStrat?.is_copied || isProtectedStrategy,
        timeframe,
        action,
        max_entries: maxDailyTrades,
        execution_mode: executionMode,
        sessions: [
          { start: session1Start, end: session1End, active: session1Active },
          { start: session2Start, end: session2End, active: session2Active }
        ]
      };

      const res = await saveStrategyAction(payload);
      if (res.success) {
        alert(`Algoritmo "${name}" salvo com sucesso!`);
        resetForm();
      } else {
        alert(res.error || 'Erro ao salvar algoritmo.');
      }
    } catch (err: any) {
      console.error('[AlgorithmBuilder] Erro no handleSave:', err);
      alert('Erro inesperado ao salvar algoritmo: ' + (err.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyPublicStrategy = async (strat: CustomStrategy) => {
    if (window.confirm(`Deseja copiar o setup "${strat.name}" para seus robôs?`)) {
      const copyPayload: CustomStrategy = {
        name: `${strat.name} (Cópia)`,
        panel_id: strat.panel_id,
        buy_conditions: strat.buy_conditions,
        sell_conditions: strat.sell_conditions,
        buy_stages: strat.buy_stages || strat.buy_conditions,
        sell_stages: strat.sell_stages || strat.sell_conditions,
        risk_settings: strat.risk_settings,
        active: false,
        is_public: false,
        timeframe: strat.timeframe,
        action: strat.action,
        max_entries: strat.max_entries,
        sessions: strat.sessions,
        is_admin_featured: strat.user_email === 'admin@vortex.com' || strat.is_admin_featured,
        is_copied: true,
        execution_mode: strat.execution_mode
      };
      const res = await saveStrategyAction(copyPayload);
      if (res.success) {
        alert('Setup copiado com sucesso! As regras lógicas proprietárias foram blindadas e você pode customizar livremente Timeframe, Ação, Horários e Alvos/Risco na aba "Meus Robôs".');
        setCurrentMainTab('meus');
      } else {
        alert(res.error || 'Erro ao copiar setup.');
      }
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Deseja realmente deletar a estratégia "${name}"?`)) {
      await deleteStrategyAction(id);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    await toggleStrategyActiveAction(id, !currentStatus);
  };

  const handleTogglePublic = async (strat: CustomStrategy) => {
    if (!strat.id) return;
    const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
    const isCopiedAdminStrategy = !isSystemAdmin && (strat.is_admin_featured === true || strat.user_email === 'admin@vortex.com');
    const canShare = !isCopiedAdminStrategy && (isSystemAdmin || userPermissions.allow_share_strategies === true);

    if (!canShare) {
      alert('Você não tem permissão para alterar a visibilidade pública desta estratégia.');
      return;
    }

    const updated: CustomStrategy = {
      ...strat,
      is_public: !strat.is_public
    };
    const res = await saveStrategyAction(updated);
    if (!res.success) {
      alert(res.error || 'Erro ao alterar visibilidade pública.');
    }
  };

  const renderTargetInput = (type: 'buy' | 'sell', stageId: string, cond: any) => {
    const subSeries = cond.subSeries || cond.source_subSeries || '';
    const source = cond.source || cond.indicator || '';

    // 1. Supertrend com subSeries direcional (trend, signal_buy, signal_sell)
    if (source === 'Supertrend' || source === 'supertrend') {
      if (subSeries === 'signal_buy') {
        const currentTargetVal = cond.target_value === 'neutro' ? 'neutro' : 'compra';
        return (
          <select
            value={currentTargetVal}
            onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-emerald-400 focus:outline-none w-36 font-bold cursor-pointer"
          >
            <option value="compra">🟢 COMPRA (Virada Verde)</option>
            <option value="neutro">⚪ Sem Sinal (Neutro)</option>
          </select>
        );
      }
      if (subSeries === 'signal_sell') {
        const currentTargetVal = cond.target_value === 'neutro' ? 'neutro' : 'venda';
        return (
          <select
            value={currentTargetVal}
            onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-red-400 focus:outline-none w-36 font-bold cursor-pointer"
          >
            <option value="venda">🔴 VENDA (Virada Vermelha)</option>
            <option value="neutro">⚪ Sem Sinal (Neutro)</option>
          </select>
        );
      }
      if (subSeries === 'trend') {
        const currentTargetVal = cond.target_value === 'venda' ? 'venda' : 'compra';
        return (
          <select
            value={currentTargetVal}
            onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none w-36 font-bold cursor-pointer"
          >
            <option value="compra">🟢 Tendência COMPRA</option>
            <option value="venda">🔴 Tendência VENDA</option>
          </select>
        );
      }
    }

    // 2. MACD com subSeries de Divergência
    if (source === 'MACD' || source === 'macd') {
      if (subSeries === 'divergence_bullish' || subSeries === 'divergencia_alta') {
        const currentTargetVal = cond.target_value === 'neutro' ? 'neutro' : 'compra';
        return (
          <select
            value={currentTargetVal}
            onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-emerald-400 focus:outline-none w-44 font-bold cursor-pointer"
          >
            <option value="compra">🟢 Divergência ALTA (Compra)</option>
            <option value="neutro">⚪ Sem Divergência (Neutro)</option>
          </select>
        );
      }
      if (subSeries === 'divergence_bearish' || subSeries === 'divergencia_baixa') {
        const currentTargetVal = cond.target_value === 'neutro' ? 'neutro' : 'venda';
        return (
          <select
            value={currentTargetVal}
            onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-red-400 focus:outline-none w-44 font-bold cursor-pointer"
          >
            <option value="venda">🔴 Divergência BAIXA (Venda)</option>
            <option value="neutro">⚪ Sem Divergência (Neutro)</option>
          </select>
        );
      }
      if (subSeries === 'divergence_trend' || subSeries === 'divergence' || subSeries === 'divergencia') {
        const currentTargetVal = ['compra', 'venda', 'neutro'].includes(cond.target_value) ? cond.target_value : (type === 'sell' ? 'venda' : 'compra');
        return (
          <select
            value={currentTargetVal}
            onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none w-44 font-bold cursor-pointer"
          >
            <option value="compra">🟢 Divergência ALTA (Compra)</option>
            <option value="venda">🔴 Divergência BAIXA (Venda)</option>
            <option value="neutro">⚪ Sem Divergência (Neutro)</option>
          </select>
        );
      }
    }

    // 2. SMC - Break of Structure & CHoCH (Sinais Direcionais)
    if (source === 'SMC_BOS_CHOCH' || source === 'smc_bos_choch') {
      if (['signal', 'bos', 'choch'].includes(subSeries)) {
        const currentTargetVal = ['compra', 'venda', 'neutro'].includes(cond.target_value) ? cond.target_value : (type === 'sell' ? 'venda' : 'compra');
        return (
          <select
            value={currentTargetVal}
            onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none w-44 font-bold cursor-pointer"
          >
            <option value="compra">🟢 COMPRA (Rompimento Alta)</option>
            <option value="venda">🔴 VENDA (Rompimento Baixa)</option>
            <option value="neutro">⚪ Sem Sinal (Neutro)</option>
          </select>
        );
      }
      if (subSeries === 'bos_bullish' || subSeries === 'choch_bullish') {
        const currentTargetVal = cond.target_value === 'neutro' ? 'neutro' : 'compra';
        const label = subSeries === 'bos_bullish' ? 'BOS ALTA' : 'CHoCH ALTA';
        return (
          <select
            value={currentTargetVal}
            onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-emerald-400 focus:outline-none w-44 font-bold cursor-pointer"
          >
            <option value="compra">🟢 {label} (Confirmado)</option>
            <option value="neutro">⚪ Sem Sinal (Neutro)</option>
          </select>
        );
      }
      if (subSeries === 'bos_bearish' || subSeries === 'choch_bearish') {
        const currentTargetVal = cond.target_value === 'neutro' ? 'neutro' : 'venda';
        const label = subSeries === 'bos_bearish' ? 'BOS BAIXA' : 'CHoCH BAIXA';
        return (
          <select
            value={currentTargetVal}
            onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-red-400 focus:outline-none w-44 font-bold cursor-pointer"
          >
            <option value="venda">🔴 {label} (Confirmado)</option>
            <option value="neutro">⚪ Sem Sinal (Neutro)</option>
          </select>
        );
      }
    }

    // 3. SMC - Filtro Estrutural de Range (Breakout / Pullback)
    if (source === 'SMC_RANGE_FILTER' || source === 'smc_range_filter') {
      if (subSeries === 'status') {
        const currentTargetVal = cond.target_value === 'reprovado' ? 'reprovado' : 'aprovado';
        return (
          <select
            value={currentTargetVal}
            onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] font-bold focus:outline-none w-40 cursor-pointer"
          >
            <option value="aprovado" className="text-emerald-400">✅ APROVADO (Dentro do Range)</option>
            <option value="reprovado" className="text-red-400">❌ REPROVADO (Fora dos Limites)</option>
          </select>
        );
      }
      if (['zone_direction', 'breakout_status', 'pullback_status'].includes(subSeries)) {
        const currentTargetVal = ['compra', 'venda', 'neutro'].includes(cond.target_value) ? cond.target_value : (type === 'sell' ? 'venda' : 'compra');
        return (
          <select
            value={currentTargetVal}
            onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none w-44 font-bold cursor-pointer"
          >
            <option value="compra">🟢 COMPRA (Suporte / Rompimento)</option>
            <option value="venda">🔴 VENDA (Resistência / Rompimento)</option>
            <option value="neutro">⚪ NEUTRO (Fora da Zona)</option>
          </select>
        );
      }
      if (['breakout_buy', 'pullback_buy'].includes(subSeries)) {
        const currentTargetVal = cond.target_value === 'neutro' ? 'neutro' : 'compra';
        const label = subSeries === 'breakout_buy' ? 'Breakout de ALTA' : 'Pullback no SUPORTE';
        return (
          <select
            value={currentTargetVal}
            onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-emerald-400 focus:outline-none w-44 font-bold cursor-pointer"
          >
            <option value="compra">🟢 {label} (Ativo)</option>
            <option value="neutro">⚪ Fora da Zona (Neutro)</option>
          </select>
        );
      }
      if (['breakout_sell', 'pullback_sell'].includes(subSeries)) {
        const currentTargetVal = cond.target_value === 'neutro' ? 'neutro' : 'venda';
        const label = subSeries === 'breakout_sell' ? 'Breakout de BAIXA' : 'Pullback na RESISTÊNCIA';
        return (
          <select
            value={currentTargetVal}
            onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-red-400 focus:outline-none w-44 font-bold cursor-pointer"
          >
            <option value="venda">🔴 {label} (Ativo)</option>
            <option value="neutro">⚪ Fora da Zona (Neutro)</option>
          </select>
        );
      }
    }

    // 4. MA Cloud Filter (Nuvem de Médias)
    if (source === 'MA_CLOUD_FILTER' || source === 'ma_cloud_filter') {
      if (subSeries === 'status') {
        const currentTargetVal = cond.target_value === 'reprovado' ? 'reprovado' : 'aprovado';
        return (
          <select
            value={currentTargetVal}
            onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] font-bold focus:outline-none w-40 cursor-pointer"
          >
            <option value="aprovado" className="text-emerald-400">✅ APROVADO (Nuvem Válida)</option>
            <option value="reprovado" className="text-red-400">❌ REPROVADO (Fora dos Limites)</option>
          </select>
        );
      }
      if (subSeries === 'direction') {
        const currentTargetVal = ['compra', 'venda', 'neutro'].includes(cond.target_value) ? cond.target_value : (type === 'sell' ? 'venda' : 'compra');
        return (
          <select
            value={currentTargetVal}
            onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none w-44 font-bold cursor-pointer"
          >
            <option value="compra">🟢 COMPRA (Nuvem Autorisada)</option>
            <option value="venda">🔴 VENDA (Nuvem Autorisada)</option>
            <option value="neutro">⚪ NEUTRO (Sem Confluência)</option>
          </select>
        );
      }
      if (subSeries === 'buy_valid') {
        const currentTargetVal = cond.target_value === 'neutro' ? 'neutro' : 'compra';
        return (
          <select
            value={currentTargetVal}
            onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-emerald-400 focus:outline-none w-44 font-bold cursor-pointer"
          >
            <option value="compra">🟢 COMPRA Válida</option>
            <option value="neutro">⚪ Neutro / Bloqueado</option>
          </select>
        );
      }
      if (subSeries === 'sell_valid') {
        const currentTargetVal = cond.target_value === 'neutro' ? 'neutro' : 'venda';
        return (
          <select
            value={currentTargetVal}
            onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-red-400 focus:outline-none w-44 font-bold cursor-pointer"
          >
            <option value="venda">🔴 VENDA Válida</option>
            <option value="neutro">⚪ Neutro / Bloqueado</option>
          </select>
        );
      }
    }

    // 5. Elliott Waves
    if (source === 'ElliottWaves' || source === 'elliottwaves') {
      if (subSeries.startsWith('wave_')) {
        const waveName = subSeries.replace('wave_', '').toUpperCase();
        const currentTargetVal = cond.target_value === 'neutro' ? 'neutro' : waveName;
        return (
          <select
            value={currentTargetVal}
            onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-purple-300 focus:outline-none w-36 font-bold cursor-pointer"
          >
            <option value={waveName}>✅ Onda {waveName} Confirmada</option>
            <option value="neutro">⚪ Outra Onda (Neutro)</option>
          </select>
        );
      }
      const validWaves = ['1', '2', '3', '4', '5', 'A', 'B', 'C'];
      const currentTargetVal = validWaves.includes(cond.target_value) ? cond.target_value : '1';
      return (
        <select
          value={currentTargetVal}
          onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-purple-300 focus:outline-none w-28 font-bold cursor-pointer"
        >
          {validWaves.map(w => (
            <option key={w} value={w}>Onda {w}</option>
          ))}
        </select>
      );
    }

    if ((source === 'VOLUME_HVN_BLOCKS' || source === 'volume_hvn_blocks') && subSeries === 'inside_any') {
      const currentTargetVal = cond.target_value === 'nao' ? 'nao' : 'sim';
      return (
        <select
          value={currentTargetVal}
          onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-sky-400 focus:outline-none w-44 font-bold cursor-pointer"
        >
          <option value="sim">🟢 Sim (Dentro de Bloco HVN)</option>
          <option value="nao">⚪ Não (Fora de Bloco HVN)</option>
        </select>
      );
    }

    // 4.5 Axion Trend (Setas, Candles Coloridos, Conciliação com Média de Bolinhas Acima/Abaixo de Zero)
    if (
      ['AXION_TREND_ARROWS', 'axion_trend_arrows', 'AXION_TREND_CANDLES', 'axion_trend_candles', 'AXION_TREND_CONCILIATED', 'axion_trend_conciliated'].includes(source) ||
      ((source === 'AXION_TREND' || source === 'axion_trend' || source === 'axiontrend') && ['signal_arrow', 'candle_trend', 'conciliated_trend', 'conciliated_signal', 'macdbb_zero_trend', 'macdbb_state', 'bullbear_signal', 'bullbear_trend', ''].includes(subSeries))
    ) {
      const currentTargetVal = ['compra', 'venda', 'neutro'].includes(cond.target_value) ? cond.target_value : (type === 'sell' ? 'venda' : 'compra');
      const isConciliated = source === 'AXION_TREND_CONCILIATED' || source === 'axion_trend_conciliated' || subSeries === 'conciliated_trend' || subSeries === 'conciliated_signal';
      const isCandles = source === 'AXION_TREND_CANDLES' || source === 'axion_trend_candles' || subSeries === 'candle_trend';
      const isArrows = source === 'AXION_TREND_ARROWS' || source === 'axion_trend_arrows' || subSeries === 'signal_arrow';

      return (
        <select
          value={currentTargetVal}
          onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none w-48 font-bold cursor-pointer"
        >
          <option value="compra">
            {isConciliated ? '🟢 COMPRA (Candle Verde + Média Verde > 0)' : isCandles ? '🟢 COMPRA (Candle Verde)' : isArrows ? '🟢 COMPRA (Seta Verde)' : '🟢 Compra'}
          </option>
          <option value="venda">
            {isConciliated ? '🔴 VENDA (Candle Vermelho + Média Vermelha < 0)' : isCandles ? '🔴 VENDA (Candle Vermelho)' : isArrows ? '🔴 VENDA (Seta Vermelha)' : '🔴 Venda'}
          </option>
          <option value="neutro">⚪ Neutro / Sem Sinal</option>
        </select>
      );
    }

    // 5. Indicadores categóricos de direção (PVA, Viés Gamma, Padrões, Block Trades, e-MACD trend)
    if (['pva', 'pattern_pinbar', 'pattern_engolfo', 'pattern_180', 'pattern_star3', 'pattern_chute', 'gamma_bias', 'fvg_tipo', 'blocktrades_side', 'blockTrades_side', 'emacd_trend'].includes(source) || (source === 'EMACD' && subSeries === 'trend')) {
      const currentTargetVal = ['compra', 'venda', 'neutro'].includes(cond.target_value) ? cond.target_value : (type === 'sell' ? 'venda' : 'compra');
      return (
        <select
          value={currentTargetVal}
          onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none w-28 font-bold cursor-pointer"
        >
          <option value="compra">🟢 Compra</option>
          <option value="venda">🔴 Venda</option>
          <option value="neutro">⚪ Neutro</option>
        </select>
      );
    }

    // 4. Notícias & Estado
    if (source === 'noticia_impacto') {
      const currentTargetVal = ['alto', 'medio', 'baixo', 'nenhum'].includes(cond.target_value) ? cond.target_value : 'alto';
      return (
        <select
          value={currentTargetVal}
          onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none w-32 font-bold text-amber-400 cursor-pointer"
        >
          <option value="alto">Alto Impacto</option>
          <option value="medio">Médio Impacto</option>
          <option value="baixo">Baixo Impacto</option>
          <option value="nenhum">Nenhuma Notícia</option>
        </select>
      );
    }

    if (source === 'noticia_pais') {
      const validCountries = ['USD', 'EUR', 'BRL', 'CNY', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'];
      const currentTargetVal = validCountries.includes(cond.target_value) ? cond.target_value : 'USD';
      return (
        <select
          value={currentTargetVal}
          onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none w-28 font-bold text-cyan-400 cursor-pointer"
        >
          {validCountries.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      );
    }

    if (source === 'estado') {
      const validStates = ['NORMAL', 'AGUARDANDO', 'COMPRA', 'VENDA', 'EXPLOSÃO COMPRA', 'EXPLOSAO COMPRA', 'EXPLOSÃO VENDA', 'EXPLOSAO VENDA', 'EXAUSTÃO COMPRA', 'EXAUSTAO COMPRA', 'EXAUSTAO DE COMPRA', 'EXAUSTAO_ALTA', 'EXAUSTÃO VENDA', 'EXAUSTAO VENDA', 'EXAUSTAO DE VENDA', 'EXAUSTAO_BAIXA', 'COMPRESSÃO', 'COMPRESSAO', 'SAIR', 'BUY', 'SELL', 'EXIT'];
      const currentTargetVal = validStates.includes(cond.target_value) ? cond.target_value : 'EXPLOSÃO COMPRA';
      return (
        <select
          value={currentTargetVal}
          onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none font-bold cursor-pointer"
        >
          <option value="NORMAL">Normal</option>
          <option value="AGUARDANDO">Aguardando</option>
          <option value="COMPRA">Compra</option>
          <option value="VENDA">Venda</option>
          <option value="EXPLOSÃO COMPRA">Explosão Compra</option>
          <option value="EXPLOSÃO VENDA">Explosão Venda</option>
          <option value="EXAUSTÃO COMPRA">Exaustão de Compra</option>
          <option value="EXAUSTÃO VENDA">Exaustão de Venda</option>
          <option value="COMPRESSÃO">Compressão</option>
          <option value="SAIR">Sair</option>
        </select>
      );
    }

    // 5. Comparação numérica com outro Indicador
    if (cond.target_type === 'indicator') {
      return (
        <div className="flex items-center gap-1.5 flex-wrap">
          {renderIndicatorSelect(type, stageId, cond, true)}
          {renderIndicatorParams(type, stageId, cond, true)}
        </div>
      );
    }

    // 6. Entrada numérica para Valor Fixo
    let dynamicPlaceholder = 'Ex: 50.0';
    if (['sentiment', 'market_sentiment', 'FORCA_MOMENTUM', 'momentum_forca'].includes(source)) dynamicPlaceholder = 'Ex: 60 (%)';
    else if (['rsi', 'RSI'].includes(source)) dynamicPlaceholder = 'Ex: 70 (0-100)';
    else if (['noticia_minutos'].includes(source)) dynamicPlaceholder = 'Ex: 0 (barra exata)';
    else if (['emacd_histogram', 'EMACD', 'MACD'].includes(source)) dynamicPlaceholder = 'Ex: 150.0';
    else if (['blockTrades_volume', 'buyVolume', 'sellVolume'].includes(source)) dynamicPlaceholder = 'Ex: 100 (vol)';
    else if (['candle_size', 'candle_body', 'distance_to_resistance', 'distance_to_support'].includes(source)) dynamicPlaceholder = 'Ex: 15.0 (pts)';
    else if (['price', 'SMA', 'EMA', 'candle_open', 'candle_high', 'candle_low', 'candle_close', 'nearest_resistance', 'nearest_support'].includes(source)) dynamicPlaceholder = 'Ex: 18500.0';

    return (
      <input
        type="text"
        value={cond.target_value}
        onChange={(e) => handleConditionChange(type, stageId, cond.id, 'target_value', e.target.value)}
        placeholder={dynamicPlaceholder}
        className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 w-28 focus:outline-none focus:border-blue-500 font-mono"
      />
    );
  };

  const handleReplicateBuyInverted = () => {
    const invertedStages: StrategyLogicStage[] = buyStages.map((st, sIdx) => {
      const invConds = st.conditions.map((cond, index) => {
        let sourceVal = cond.source;
        if (sourceVal === 'emacd_histogram_compra') sourceVal = 'emacd_histogram_venda';
        else if (sourceVal === 'emacd_histogram_venda') sourceVal = 'emacd_histogram_compra';
        else if (sourceVal === 'candle_high' || sourceVal === 'high' || sourceVal === 'maxima') sourceVal = 'candle_low';
        else if (sourceVal === 'candle_low' || sourceVal === 'low' || sourceVal === 'minima') sourceVal = 'candle_high';

        let subVal = cond.subSeries || cond.source_subSeries;
        if (subVal === 'bos_bullish') subVal = 'bos_bearish';
        else if (subVal === 'bos_bearish') subVal = 'bos_bullish';
        else if (subVal === 'choch_bullish') subVal = 'choch_bearish';
        else if (subVal === 'choch_bearish') subVal = 'choch_bullish';
        else if (subVal === 'breakout_buy') subVal = 'breakout_sell';
        else if (subVal === 'breakout_sell') subVal = 'breakout_buy';
        else if (subVal === 'pullback_buy') subVal = 'pullback_sell';
        else if (subVal === 'pullback_sell') subVal = 'pullback_buy';
        else if (subVal === 'buy_valid') subVal = 'sell_valid';
        else if (subVal === 'sell_valid') subVal = 'buy_valid';
        else if (subVal === 'upper') subVal = 'lower';
        else if (subVal === 'lower') subVal = 'upper';
        else if (subVal === 'signal_buy') subVal = 'signal_sell';
        else if (subVal === 'signal_sell') subVal = 'signal_buy';

        // Identifica grandezas escalares / magnitudes absolutas que não devem ter operador relacional invertido
        // (Ex: distância mínima entre médias, tamanho de candle, range de bloco, etc.)
        const isScalarMagnitude = (
          subVal === 'cloud_diff' ||
          subVal === 'diff' ||
          subVal === 'block_range' ||
          sourceVal === 'candle_size' ||
          sourceVal === 'candle_body' ||
          sourceVal === 'dist_sma8_sma20' ||
          sourceVal === 'dist_sma20_sma50' ||
          sourceVal.startsWith('dist_') ||
          sourceVal.includes('distance')
        );

        let op = cond.operator;
        if (!isScalarMagnitude) {
          if (cond.operator === 'gt') op = 'lt';
          else if (cond.operator === 'lt') op = 'gt';
          else if (cond.operator === 'gte') op = 'lte';
          else if (cond.operator === 'lte') op = 'gte';
          else if (cond.operator === 'cross_above') op = 'cross_below';
          else if (cond.operator === 'cross_below') op = 'cross_above';
        }

        let targetVal = cond.target_value;
        if (typeof targetVal === 'string') {
          if (targetVal.toLowerCase() === 'compra') {
            targetVal = targetVal === 'COMPRA' ? 'VENDA' : 'venda';
          } else if (targetVal.toLowerCase() === 'venda') {
            targetVal = targetVal === 'VENDA' ? 'COMPRA' : 'compra';
          } else if (targetVal === 'candle_high' || targetVal === 'high' || targetVal === 'maxima') {
            targetVal = 'candle_low';
          } else if (targetVal === 'candle_low' || targetVal === 'low' || targetVal === 'minima') {
            targetVal = 'candle_high';
          } else if (targetVal === 'EXPLOSÃO COMPRA' || targetVal === 'EXPLOSAO COMPRA') {
            targetVal = 'EXPLOSÃO VENDA';
          } else if (targetVal === 'EXPLOSÃO VENDA' || targetVal === 'EXPLOSAO VENDA') {
            targetVal = 'EXPLOSÃO COMPRA';
          } else if (targetVal === 'EXAUSTÃO COMPRA' || targetVal === 'EXAUSTAO COMPRA' || targetVal === 'EXAUSTAO_ALTA' || targetVal === 'EXAUSTAO DE COMPRA') {
            targetVal = 'EXAUSTÃO VENDA';
          } else if (targetVal === 'EXAUSTÃO VENDA' || targetVal === 'EXAUSTAO VENDA' || targetVal === 'EXAUSTAO_BAIXA' || targetVal === 'EXAUSTAO DE VENDA') {
            targetVal = 'EXAUSTÃO COMPRA';
          }
        }

        let targetSub = cond.target_subSeries;
        if (targetSub === 'lower') targetSub = 'upper';
        else if (targetSub === 'upper') targetSub = 'lower';
        else if (targetSub === 'signal_buy') targetSub = 'signal_sell';
        else if (targetSub === 'signal_sell') targetSub = 'signal_buy';
        else if (targetSub === 'bos_bullish') targetSub = 'bos_bearish';
        else if (targetSub === 'bos_bearish') targetSub = 'bos_bullish';
        else if (targetSub === 'choch_bullish') targetSub = 'choch_bearish';
        else if (targetSub === 'choch_bearish') targetSub = 'choch_bullish';
        else if (targetSub === 'breakout_buy') targetSub = 'breakout_sell';
        else if (targetSub === 'breakout_sell') targetSub = 'breakout_buy';
        else if (targetSub === 'pullback_buy') targetSub = 'pullback_sell';
        else if (targetSub === 'pullback_sell') targetSub = 'pullback_buy';
        else if (targetSub === 'buy_valid') targetSub = 'sell_valid';
        else if (targetSub === 'sell_valid') targetSub = 'buy_valid';

        return {
          ...cond,
          id: `sell_inv_${Date.now()}_${sIdx}_${index}_${Math.random().toString(36).substring(2, 7)}`,
          source: sourceVal,
          subSeries: subVal,
          source_subSeries: subVal,
          operator: op,
          target_value: targetVal,
          target_subSeries: targetSub
        };
      });

      return {
        id: `sell_stage_inv_${Date.now()}_${sIdx}`,
        stage_number: sIdx + 1,
        name: st.name?.toLowerCase().includes('compra') ? st.name.replace(/compra/gi, 'Venda') : `Lógica ${sIdx + 1}`,
        conditions: invConds,
        logic: st.logic || 'AND',
        max_wait_candles: st.max_wait_candles || 0
      };
    });

    setSellStages(invertedStages);
  };

  const renderStrategyDescription = (strat: CustomStrategy) => {
    const desc = strat.description?.trim();
    const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
    const isProtected = !isSystemAdmin && (
      strat.user_email === 'admin@vortex.com' ||
      strat.is_admin_featured === true ||
      strat.is_copied === true ||
      (strat.user_id && strat.user_id !== user?.id)
    );

    if (!desc && !isProtected) return null;

    return (
      <div className="mt-2 p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg text-xs font-sans text-slate-300 select-none">
        {desc ? (
          <div className="flex items-start gap-2">
            <span className="text-sm shrink-0 mt-0.5">💬</span>
            <div className="flex-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 font-mono block mb-0.5">Descrição da Estratégia</span>
              <p className="text-slate-200 leading-relaxed text-xs">{desc}</p>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-slate-500 italic">
            Nenhuma descrição fornecida para esta estratégia.
          </div>
        )}
        {isProtected && (
          <div className="text-purple-400 font-bold text-[10px] flex items-center gap-1 mt-1.5 pt-1.5 border-t border-slate-800/60 font-mono">
            <span>🔒</span>
            <span>Regras e parâmetros proprietários protegidos pelo autor.</span>
          </div>
        )}
      </div>
    );
  };

  const renderStageCard = (type: 'buy' | 'sell', stage: StrategyLogicStage, stageIndex: number, totalStages: number) => {
    const isBuy = type === 'buy';

    return (
      <div key={stage.id} className="space-y-2">
        {/* Card do Estágio */}
        <div className={`p-3 bg-slate-950 rounded-xl border ${isBuy ? 'border-emerald-900/40 hover:border-emerald-700/60' : 'border-red-900/40 hover:border-red-700/60'} transition shadow-md`}>
          
          {/* Cabeçalho do Estágio */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 mb-2.5 border-b border-slate-850">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${isBuy ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                {stageIndex === 0 ? '1️⃣ LÓGICA 1' : stageIndex === 1 ? '2️⃣ LÓGICA 2' : stageIndex === 2 ? '3️⃣ LÓGICA 3' : `🔢 LÓGICA ${stageIndex + 1}`}
              </span>

              <input
                type="text"
                value={stage.name || `Lógica ${stageIndex + 1}`}
                onChange={(e) => handleStageFieldChange(type, stage.id, 'name', e.target.value)}
                placeholder={`Ex: Lógica ${stageIndex + 1} (Rompimento)`}
                className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-100 font-bold focus:outline-none focus:border-blue-500 min-w-[200px]"
              />

              {stageIndex > 0 && (
                <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-300">
                  <span className="text-amber-400">⏱️ Validade:</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={stage.max_wait_candles || 0}
                    onChange={(e) => handleStageFieldChange(type, stage.id, 'max_wait_candles', Math.max(0, Number(e.target.value)))}
                    className="w-12 bg-slate-950 border border-slate-750 rounded px-1 text-center text-amber-300 font-bold font-mono focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400">
                    {stage.max_wait_candles && stage.max_wait_candles > 0 ? 'candles máx' : 'candles (0 = ilimitado)'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {stage.conditions.length > 1 && (
                <div className="flex items-center bg-slate-900 rounded p-0.5 border border-slate-800 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => handleStageFieldChange(type, stage.id, 'logic', 'AND')}
                    className={`px-2 py-0.5 rounded transition cursor-pointer ${stage.logic !== 'OR' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'}`}
                    title="Todas as regras desta etapa precisam ser verdadeiras"
                  >
                    E (AND)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStageFieldChange(type, stage.id, 'logic', 'OR')}
                    className={`px-2 py-0.5 rounded transition cursor-pointer ${stage.logic === 'OR' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'}`}
                    title="Qualquer uma das regras desta etapa sendo verdadeira é suficiente"
                  >
                    OU (OR)
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => handleDuplicateStage(type, stageIndex)}
                className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
                title="Duplicar esta etapa lógica"
              >
                📋 Duplicar
              </button>

              {totalStages > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveStage(type, stage.id)}
                  className="px-2 py-1 bg-red-950/20 hover:bg-red-900/40 border border-red-900/30 text-red-400 rounded text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
                  title="Excluir esta etapa lógica"
                >
                  🗑️ Excluir
                </button>
              )}
            </div>
          </div>

          {/* Lista de Condições desta Etapa */}
          <div className="space-y-2">
            {stage.conditions.length === 0 ? (
              <div className="p-3 text-center text-slate-500 border border-dashed border-slate-800/80 rounded-lg text-xs">
                Nenhuma regra adicionada nesta etapa. Clique abaixo para definir a primeira condição.
              </div>
            ) : (
              stage.conditions.map((cond, condIdx) => {
                const isCategorical = isConditionCategorical(cond);
                return (
                  <div key={cond.id} className="flex flex-wrap items-center gap-2 p-2 bg-slate-900/90 rounded-lg border border-slate-800/80 animate-fadeIn">
                    <span className="text-[10px] text-slate-500 font-bold w-5">#{condIdx + 1}</span>
                    
                    {/* Source Selector & Params */}
                    {renderIndicatorSelect(type, stage.id, cond, false)}
                    {renderIndicatorParams(type, stage.id, cond, false)}

                    {/* Operator Dropdown */}
                    <select
                      value={cond.operator}
                      onChange={(e) => handleConditionChange(type, stage.id, cond.id, 'operator', e.target.value)}
                      className={`bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] font-bold ${isBuy ? 'text-emerald-400' : 'text-red-400'} focus:outline-none w-24`}
                    >
                      {isCategorical ? (
                        <>
                          <option value="eq">= (Igual)</option>
                          <option value="neq">!= (Diferente)</option>
                        </>
                      ) : (
                        <>
                          <option value="gt">&gt; (Maior)</option>
                          <option value="lt">&lt; (Menor)</option>
                          <option value="gte">&gt;= (Maior Igual)</option>
                          <option value="lte">&lt;= (Menor Igual)</option>
                          <option value="eq">= (Igual)</option>
                          <option value="neq">!= (Diferente)</option>
                          <option value="cross_above">Cruz. Acima</option>
                          <option value="cross_below">Cruz. Abaixo</option>
                        </>
                      )}
                    </select>

                    {/* Target Type */}
                    {!isCategorical && (
                      <select
                        value={cond.target_type}
                        onChange={(e) => handleConditionChange(type, stage.id, cond.id, 'target_type', e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-400 focus:outline-none"
                      >
                        <option value="value">Valor Fixo</option>
                        <option value="indicator">Indicador</option>
                      </select>
                    )}

                    {/* Target value selector */}
                    {renderTargetInput(type, stage.id, cond)}

                    <button
                      type="button"
                      onClick={() => handleRemoveCondition(type, stage.id, cond.id)}
                      className="ml-auto p-1 bg-red-950/20 border border-red-900/30 rounded text-red-400 hover:text-red-300 transition cursor-pointer"
                      title="Remover regra"
                    >
                      ✕
                    </button>
                  </div>
                );
              })
            )}

            <button
              type="button"
              onClick={() => handleAddCondition(type, stage.id)}
              className={`w-full py-1.5 bg-slate-900/80 hover:bg-slate-900 border border-dashed ${isBuy ? 'border-emerald-800/40 hover:border-emerald-500 text-emerald-400' : 'border-red-800/40 hover:border-red-500 text-red-400'} text-[11px] font-bold rounded-lg transition cursor-pointer`}
            >
              ➕ Adicionar Regra na {stage.name || `Lógica ${stageIndex + 1}`}
            </button>
          </div>
        </div>

        {/* Conector Visual entre Etapas Sequenciais */}
        {stageIndex < totalStages - 1 && (
          <div className="flex items-center justify-center my-1 animate-fadeIn select-none">
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-950/90 border border-slate-800 rounded-full text-[10px] text-slate-400 font-mono shadow-sm">
              <span className={`text-xs ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>⬇️ ⚡</span>
              <span>Quando a <strong>{stage.name || `Lógica ${stageIndex + 1}`}</strong> for atendida, o robô avança para a próxima etapa</span>
              <span className="text-sky-400 font-bold">➔</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const userEmailNorm = user?.email?.toLowerCase().trim();
  const myStrategies = customStrategies.filter(s => 
    (user?.id && s.user_id === user.id) || 
    (s.user_email && userEmailNorm && s.user_email.toLowerCase().trim() === userEmailNorm) ||
    s.user_id === 'local_user' ||
    !s.user_id
  );
  const otherPublicStrategies = publicStrategies.filter(strat => {
    const isOwn = (user?.id && strat.user_id === user.id) || 
                  (user?.email && strat.user_email && strat.user_email.toLowerCase().trim() === userEmailNorm);
    return !isOwn;
  });
  const activeCount = myStrategies.filter(s => s.active && !s.is_admin_featured).length;
  const maxAllowed = userPermissions.max_strategies || 2;

  return (
    <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl max-w-6xl w-full mx-auto shadow-2xl backdrop-blur-md bg-opacity-70 text-slate-100">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 font-mono">
            🤖 Construtor de Algoritmos (Axion Engine)
          </h2>
          <p className="text-[11px] text-slate-400">
            Monte lógicas usando indicadores, dados de fluxo e níveis de proteção.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono">
          <div className="px-3 py-1 bg-slate-950 border border-slate-800 rounded-lg text-right select-none">
            <span className="text-[10px] text-slate-500 uppercase block font-bold">Limite de Uso</span>
            <span className={`text-[12px] font-bold ${activeCount >= maxAllowed ? 'text-red-400' : 'text-emerald-400'}`}>
              {activeCount} / {maxAllowed} estratégias ativas
            </span>
          </div>
          {!isEditing && (
            <button
              onClick={handleCreateNew}
              className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-lg text-xs font-bold shadow-lg transition cursor-pointer"
            >
              ➕ Criar Algoritmo
            </button>
          )}
        </div>
      </div>

      {!isEditing && (
        <div className="flex flex-wrap border-b border-slate-800 gap-1.5 mb-4 font-mono select-none">
          <button
            type="button"
            onClick={() => setCurrentMainTab('meus')}
            className={`px-3 py-1.5 border-b-2 font-bold text-xs transition-all cursor-pointer ${
              currentMainTab === 'meus'
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            👤 Meus Robôs ({myStrategies.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setCurrentMainTab('publicos');
              fetchPublicStrategiesList();
            }}
            className={`px-3 py-1.5 border-b-2 font-bold text-xs transition-all cursor-pointer ${
              currentMainTab === 'publicos'
                ? 'border-purple-500 text-purple-400 bg-purple-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🌐 Biblioteca Pública ({otherPublicStrategies.length})
          </button>
        </div>
      )}

      {!isEditing ? (
        currentMainTab === 'meus' ? (
          /* List of custom strategies */
          <div className="space-y-3 font-mono">
            {myStrategies.length === 0 ? (
              <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-slate-800/80 font-mono">
                <span className="text-3xl mb-2 block">🤖</span>
                <p className="text-sm font-bold text-slate-300">Nenhum algoritmo criado ainda.</p>
                <p className="text-xs text-slate-500 mt-1">
                  Clique em "➕ Criar Algoritmo" acima ou copie um modelo pronto na aba "🌐 Biblioteca Pública".
                </p>
              </div>
            ) : (
              myStrategies.map(strat => {
                const recommendedPanel = panels.find(p => p.id === strat.panel_id);
                const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
                const isProtected = !isSystemAdmin && (strat.is_admin_featured === true || strat.user_email === 'admin@vortex.com' || strat.is_copied === true);

                return (
                  <div
                    key={strat.id}
                    className="p-3.5 bg-slate-950/80 border border-slate-800/60 hover:border-blue-500/40 rounded-lg flex flex-col gap-2 transition group"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-200 text-xs">{strat.name}</span>
                          {strat.id && (
                            <span 
                              onClick={() => {
                                navigator.clipboard.writeText(strat.id || '');
                                alert('ID da estratégia copiado!');
                              }}
                              className="text-[9px] px-1.5 py-0.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 rounded cursor-pointer select-none"
                              title="Clique para copiar o ID da estratégia"
                            >
                              🆔 ID: {strat.id}
                            </span>
                          )}
                          {(() => {
                            const liveAtm = resolveAlgorithmAtm(strat, currentAtmList);
                            const atmName = liveAtm?.name || strat.risk_settings?.atm_strategy_name || strat.risk_settings?.atm_strategy?.name;
                            const totalCts = liveAtm ? (liveAtm.brackets || []).reduce((sum: number, b: any) => sum + (Number(b.quantity) || 1), 0) : (strat.risk_settings?.lots || 1);
                            if (atmName) {
                              return (
                                <span className="text-[9px] px-1.5 py-0.5 bg-amber-950/40 border border-amber-800/40 text-amber-300 rounded font-semibold flex items-center gap-1">
                                  🎯 ATM: {atmName.replace(/[🎯⚖️🚀]/g, '').trim()} ({totalCts} ct{liveAtm ? ` • ${liveAtm.brackets?.length || 1} alvos` : ''})
                                </span>
                              );
                            }
                            return (
                              <span className="text-[9px] px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-400">
                                {strat.risk_settings?.lots} ct • SL: {strat.risk_settings?.stop_value} pts • TP: {strat.risk_settings?.take_value} pts
                              </span>
                            );
                          })()}
                          {(!strat.panel_id || strat.panel_id === 'all') ? (
                            <span className="text-[9px] px-1.5 py-0.5 bg-emerald-950/40 border border-emerald-900/40 text-emerald-400 rounded font-semibold">
                              🌍 Recomendado: Todos os Ativos
                            </span>
                          ) : recommendedPanel ? (
                            <span className="text-[9px] px-1.5 py-0.5 bg-blue-950/40 border border-blue-900/40 text-blue-400 rounded">
                              🎯 Recomendado: {recommendedPanel.name}
                            </span>
                          ) : null}
                          {strat.is_public && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-purple-950/40 border border-purple-900/40 text-purple-400 rounded">
                              🌐 Público
                            </span>
                          )}
                          {isProtected && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-purple-950/40 border border-purple-800/40 text-purple-300 rounded font-semibold flex items-center gap-1">
                              🔒 Regras Protegidas
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        {/* Active Toggle Switch */}
                        <label className="relative inline-flex items-center cursor-pointer select-none" title="Exibir no painel do gráfico">
                          <input
                            type="checkbox"
                            checked={strat.active}
                            onChange={() => handleToggleActive(strat.id!, strat.active)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-blue-500 peer-checked:to-purple-500 peer-checked:after:bg-white"></div>
                          <span className="ml-2 text-[10px] font-bold text-slate-400 min-w-[70px]">
                            {strat.active ? 'No Painel' : 'Oculto'}
                          </span>
                        </label>

                        {!isProtected && (isSystemAdmin || userPermissions.allow_share_strategies === true) && (
                          <button
                            type="button"
                            onClick={() => handleTogglePublic(strat)}
                            className={`px-2 py-1 border rounded text-[10px] font-bold transition flex items-center gap-1 cursor-pointer ${
                              strat.is_public
                                ? 'bg-purple-950/40 border-purple-800 text-purple-300 hover:bg-purple-900/60'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                            title={strat.is_public ? 'Clique para tornar Privado' : 'Clique para tornar Público na biblioteca'}
                          >
                            {strat.is_public ? '🌐 Público' : '👤 Privado'}
                          </button>
                        )}

                        <button
                          onClick={() => handleEdit(strat)}
                          className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded text-[10px] font-bold transition cursor-pointer"
                        >
                          ✏️ Editar
                        </button>

                        <button
                          onClick={() => handleDelete(strat.id!, strat.name)}
                          className="px-2 py-1 bg-red-950/20 hover:bg-red-900/40 border border-red-900/30 text-red-400 hover:text-red-300 rounded text-[10px] font-bold transition cursor-pointer"
                        >
                          🗑️ Excluir
                        </button>
                      </div>
                    </div>
                    {renderStrategyDescription(strat)}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Public Library Tab */
          <div className="space-y-3 font-mono">
            {/* Filters Bar */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
                  🔍 Pesquisar por E-mail do Autor
                </label>
                <input
                  type="text"
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  placeholder="Ex: usuario@vortex.com"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500/50"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
                  🎯 Filtrar por Ativo Recomendado
                </label>
                <select
                  value={searchPanelId}
                  onChange={(e) => setSearchPanelId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500/50 cursor-pointer"
                >
                  <option value="">Todos os Ativos</option>
                  {panels.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* List of Shared Public Strategies from Other Users */}
            {otherPublicStrategies.filter(strat => {
              const matchesEmail = searchEmail ? strat.user_email?.toLowerCase().includes(searchEmail.toLowerCase()) : true;
              const matchesPanel = searchPanelId ? (!strat.panel_id || strat.panel_id === 'all' || strat.panel_id === searchPanelId) : true;
              return matchesEmail && matchesPanel;
            }).length === 0 ? (
              <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-lg">
                <p className="text-xs">Nenhum setup público de outros usuários encontrado com estes filtros.</p>
              </div>
            ) : (
              otherPublicStrategies
                .filter(strat => {
                  const matchesEmail = searchEmail ? strat.user_email?.toLowerCase().includes(searchEmail.toLowerCase()) : true;
                  const matchesPanel = searchPanelId ? (!strat.panel_id || strat.panel_id === 'all' || strat.panel_id === searchPanelId) : true;
                  return matchesEmail && matchesPanel;
                })
                .map((strat) => {
                  const recommendedPanel = panels.find(p => p.id === strat.panel_id);
                  const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
                  const isProtected = !isSystemAdmin && (strat.user_email === 'admin@vortex.com' || strat.is_admin_featured === true);
                  return (
                    <div
                      key={strat.id}
                      className="p-3.5 bg-slate-950/80 border border-slate-800/60 rounded-lg flex flex-col gap-2 transition hover:border-purple-500/30"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-200 text-xs">{strat.name}</span>
                            {strat.id && (
                              <span 
                                onClick={() => {
                                  navigator.clipboard.writeText(strat.id || '');
                                  alert('ID da estratégia copiado!');
                                }}
                                className="text-[9px] px-1.5 py-0.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 rounded cursor-pointer select-none"
                                title="Clique para copiar o ID da estratégia"
                              >
                                🆔 ID: {strat.id}
                              </span>
                            )}
                            {!isProtected && (() => {
                              const liveAtm = resolveAlgorithmAtm(strat, currentAtmList);
                              const atmName = liveAtm?.name || strat.risk_settings?.atm_strategy_name || strat.risk_settings?.atm_strategy?.name;
                              const totalCts = liveAtm ? (liveAtm.brackets || []).reduce((sum: number, b: any) => sum + (Number(b.quantity) || 1), 0) : (strat.risk_settings?.lots || 1);
                              if (atmName) {
                                return (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-amber-950/40 border border-amber-800/40 text-amber-300 rounded font-semibold flex items-center gap-1">
                                    🎯 ATM: {atmName.replace(/[🎯⚖️🚀]/g, '').trim()} ({totalCts} ct{liveAtm ? ` • ${liveAtm.brackets?.length || 1} alvos` : ''})
                                  </span>
                                );
                              }
                              return (
                                <span className="text-[9px] px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-400">
                                  {strat.risk_settings?.lots} ct • SL: {strat.risk_settings?.stop_value} pts
                                </span>
                              );
                            })()}
                            {(!strat.panel_id || strat.panel_id === 'all') ? (
                              <span className="text-[9px] px-1.5 py-0.5 bg-emerald-950/40 border border-emerald-900/40 text-emerald-400 rounded font-semibold">
                                🌍 Recomendado: Todos os Ativos
                              </span>
                            ) : recommendedPanel ? (
                              <span className="text-[9px] px-1.5 py-0.5 bg-blue-950/40 border border-blue-900/40 text-blue-400 rounded">
                                🎯 Recomendado: {recommendedPanel.name}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[9px] text-slate-500 mt-1 select-none">
                            👤 Compartilhado por: <span className="text-purple-400 font-bold">{strat.user_email || 'Usuário Axion'}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCopyPublicStrategy(strat)}
                          className="px-3 py-1.5 bg-purple-950/30 hover:bg-purple-900/50 border border-purple-800/60 text-purple-400 rounded text-[10px] font-bold transition flex items-center gap-1 cursor-pointer self-start md:self-auto mt-2 md:mt-0"
                        >
                          📥 Copiar Setup
                        </button>
                      </div>
                      {renderStrategyDescription(strat)}
                    </div>
                  );
                })
            )}
          </div>
        )
      ) : (
        /* Edit or create form */
        <form onSubmit={handleSave} noValidate className="space-y-4 font-mono">
          
          {/* Strategy Name */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
              Nome do Algoritmo
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: PVA Clímax + Média 8"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              maxLength={40}
              required
            />
          </div>

          {/* Strategy Description */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
              Descrição (Opcional - Visível para outros usuários se for pública)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva a estratégia, confluências ou recomendações..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono resize-none h-16"
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950/40 p-3 border border-slate-850 rounded-lg">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-300 mb-1">
                🎯 Ativo / Painel Recomendado
              </label>
              <select
                value={recommendedPanelId || 'all'}
                onChange={(e) => setRecommendedPanelId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 cursor-pointer font-semibold"
              >
                <option value="all">🌍 Todos os Ativos (Recomendado para Qualquer Ativo)</option>
                {panels.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {(() => {
              const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
              const editingStrat = editingId ? customStrategies.find(s => s.id === editingId) : null;
              const isCopiedAdminStrategy = !isSystemAdmin && (editingStrat?.is_admin_featured === true || editingStrat?.user_email === 'admin@vortex.com');
              const canShareStrategy = !isCopiedAdminStrategy && (isSystemAdmin || userPermissions.allow_share_strategies === true);
              if (!canShareStrategy) return null;
              return (
                <div className="flex items-center pt-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className="rounded border-slate-850 bg-slate-950 text-purple-600 focus:ring-purple-500 focus:ring-opacity-25 cursor-pointer"
                    />
                    <div>
                      <span className="text-[11px] font-bold text-slate-300 block">🌐 Compartilhar Setup (Público)</span>
                      <span className="text-[9px] text-slate-500">Exibir este algoritmo na Biblioteca Pública para outros usuários.</span>
                    </div>
                  </label>
                </div>
              );
            })()}
          </div>

          {(() => {
            const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
            const editingStrat = editingId ? customStrategies.find(s => s.id === editingId) : null;
            const isProtectedStrategy = !isSystemAdmin && (
              editingStrat?.is_admin_featured === true ||
              editingStrat?.user_email === 'admin@vortex.com' ||
              editingStrat?.is_copied === true
            );

            return (
              <>
                {/* Form Tabs */}
                <div className="flex flex-wrap border-b border-slate-800 gap-1 font-mono">
                  <button
                    type="button"
                    onClick={() => setActiveTab('buy')}
                    className={`px-3 py-1.5 border-b-2 font-bold text-xs transition-all ${
                      activeTab === 'buy'
                        ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isProtectedStrategy ? '🔒 Compra (Protegida)' : `🟢 Compra (${buyStages.length} ${buyStages.length === 1 ? 'Etapa' : 'Etapas'})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('sell')}
                    className={`px-3 py-1.5 border-b-2 font-bold text-xs transition-all ${
                      activeTab === 'sell'
                        ? 'border-red-500 text-red-400 bg-red-500/5'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isProtectedStrategy ? '🔒 Venda (Protegida)' : `🔴 Venda (${sellStages.length} ${sellStages.length === 1 ? 'Etapa' : 'Etapas'})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('action')}
                    className={`px-3 py-1.5 border-b-2 font-bold text-xs transition-all ${
                      activeTab === 'action'
                        ? 'border-sky-500 text-sky-400 bg-sky-500/5'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ⚙️ Ação & TF
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('risk')}
                    className={`px-3 py-1.5 border-b-2 font-bold text-xs transition-all ${
                      activeTab === 'risk'
                        ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🎯 Gestão ATM & Risco
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('sessions')}
                    className={`px-3 py-1.5 border-b-2 font-bold text-xs transition-all ${
                      activeTab === 'sessions'
                        ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🕒 Horários (Sessões)
                  </button>
                </div>

                {/* Tab content: Buy Stages */}
                {activeTab === 'buy' && (
                  isProtectedStrategy ? (
                    <div className="p-8 bg-slate-950/80 border border-purple-900/30 rounded-xl text-center space-y-3 my-2 shadow-inner animate-fadeIn font-mono">
                      <div className="text-3xl">🔒</div>
                      <h4 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
                        Regras Lógicas de Compra Protegidas
                      </h4>
                      <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed font-sans">
                        As condições de indicadores, confluências e gatilhos de entrada deste algoritmo público são proprietárias e blindadas pelo autor.
                      </p>
                      <div className="text-[11px] text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-800/40 px-3.5 py-2 rounded-lg inline-flex items-center gap-2 font-sans">
                        <span>💡</span>
                        <span>Você pode personalizar livremente as abas <strong>Ação & TF</strong>, <strong>Alvos & Risco</strong> e <strong>Horários (Sessões)</strong> acima!</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Pipeline Flow Header Info */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-emerald-950/20 border border-emerald-900/30 rounded-xl text-[11px]">
                        <div className="flex items-center gap-2 text-slate-300">
                          <span className="text-base">⚡</span>
                          <div>
                            <span className="font-bold text-emerald-400 block">Lógica Sequencial de Compra</span>
                            <span className="text-[10px] text-slate-400">
                              O algoritmo aguarda a <strong>Lógica 1</strong> ser satisfeita para então avançar para a <strong>Lógica 2</strong> e assim por diante até o gatilho final.
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddStage('buy')}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-md flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          ➕ Nova Etapa (Lógica {buyStages.length + 1})
                        </button>
                      </div>

                      {/* Render Each Sequential Stage */}
                      {buyStages.map((stage, sIdx) => renderStageCard('buy', stage, sIdx, buyStages.length))}

                      <button
                        type="button"
                        onClick={() => handleAddStage('buy')}
                        className="w-full py-2.5 bg-slate-950 border border-dashed border-emerald-800/40 hover:border-emerald-500 text-xs text-emerald-400 font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                      >
                        ➕ Adicionar Próxima Etapa Sequencial (Lógica {buyStages.length + 1})
                      </button>
                    </div>
                  )
                )}

                {/* Tab content: Sell Stages */}
                {activeTab === 'sell' && (
                  isProtectedStrategy ? (
                    <div className="p-8 bg-slate-950/80 border border-purple-900/30 rounded-xl text-center space-y-3 my-2 shadow-inner animate-fadeIn font-mono">
                      <div className="text-3xl">🔒</div>
                      <h4 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
                        Regras Lógicas de Venda Protegidas
                      </h4>
                      <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed font-sans">
                        As condições de indicadores, confluências e gatilhos de entrada deste algoritmo público são proprietárias e blindadas pelo autor.
                      </p>
                      <div className="text-[11px] text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-800/40 px-3.5 py-2 rounded-lg inline-flex items-center gap-2 font-sans">
                        <span>💡</span>
                        <span>Você pode personalizar livremente as abas <strong>Ação & TF</strong>, <strong>Alvos & Risco</strong> e <strong>Horários (Sessões)</strong> acima!</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Pipeline Flow Header Info */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-red-950/20 border border-red-900/30 rounded-xl text-[11px]">
                        <div className="flex items-center gap-2 text-slate-300">
                          <span className="text-base">⚡</span>
                          <div>
                            <span className="font-bold text-red-400 block">Lógica Sequencial de Venda</span>
                            <span className="text-[10px] text-slate-400">
                              O algoritmo aguarda a <strong>Lógica 1</strong> ser satisfeita para então avançar para a <strong>Lógica 2</strong> e assim por diante até o gatilho final.
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {buyStages.some(s => s.conditions.length > 0) && (
                            <button
                              type="button"
                              onClick={handleReplicateBuyInverted}
                              className="px-2.5 py-1.5 bg-purple-950/40 hover:bg-purple-900/50 border border-purple-800 text-[11px] text-purple-300 font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                              title="Copia todas as etapas e regras de compra invertendo os operadores e valores"
                            >
                              🔄 Inverter e Copiar Compra
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleAddStage('sell')}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition shadow-md flex items-center gap-1 cursor-pointer"
                          >
                            ➕ Nova Etapa (Lógica {sellStages.length + 1})
                          </button>
                        </div>
                      </div>

                      {/* Render Each Sequential Stage */}
                      {sellStages.map((stage, sIdx) => renderStageCard('sell', stage, sIdx, sellStages.length))}

                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddStage('sell')}
                          className="flex-1 py-2.5 bg-slate-950 border border-dashed border-red-800/40 hover:border-red-500 text-xs text-red-400 font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                        >
                          ➕ Adicionar Próxima Etapa Sequencial (Lógica {sellStages.length + 1})
                        </button>
                        {buyStages.some(s => s.conditions.length > 0) && (
                          <button
                            type="button"
                            onClick={handleReplicateBuyInverted}
                            className="py-2.5 px-4 bg-purple-950/40 hover:bg-purple-900/50 border border-purple-800 text-xs text-purple-300 font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                            title="Copia todas as etapas e regras de compra invertendo os operadores e valores"
                          >
                            🔄 Inverter e Copiar Compra
                          </button>
                        )}
                      </div>
                    </div>
                  )
                )}
              </>
            );
          })()}

          {/* Tab content: Sessions */}
          {activeTab === 'sessions' && (
            <div className="space-y-4 p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <h3 className="text-xs font-bold text-amber-400 font-mono mb-2">🕒 Configurar Janelas Operacionais (Até 2 Sessões)</h3>
              <p className="text-[10px] text-slate-500 mb-3 font-sans">Define as sessões em que o robô pode abrir operações. Estes horários são específicos da estratégia e rodam de forma independente do cronograma global.</p>
              
              {/* Session 1 */}
              <div className="p-3 bg-slate-900/50 border border-slate-850 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={session1Active}
                      onChange={(e) => setSession1Active(e.target.checked)}
                      className="rounded border-slate-800 bg-slate-950 text-amber-500 focus:ring-amber-500 focus:ring-opacity-25"
                    />
                    <span className="text-xs font-bold text-slate-300">Sessão Operacional 1</span>
                  </label>
                </div>
                {session1Active && (
                  <div className="grid grid-cols-2 gap-2 animate-fadeIn">
                    <div>
                      <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Horário de Início</label>
                      <input
                        type="text"
                        placeholder="HH:MM:SS"
                        value={session1Start}
                        onChange={(e) => handleTimeMask(e.target.value, setSession1Start)}
                        className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1 text-xs text-slate-200 text-center font-mono font-bold focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Horário de Fim</label>
                      <input
                        type="text"
                        placeholder="HH:MM:SS"
                        value={session1End}
                        onChange={(e) => handleTimeMask(e.target.value, setSession1End)}
                        className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1 text-xs text-slate-200 text-center font-mono font-bold focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Session 2 */}
              <div className="p-3 bg-slate-900/50 border border-slate-850 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={session2Active}
                      onChange={(e) => setSession2Active(e.target.checked)}
                      className="rounded border-slate-800 bg-slate-950 text-amber-500 focus:ring-amber-500 focus:ring-opacity-25"
                    />
                    <span className="text-xs font-bold text-slate-300">Sessão Operacional 2</span>
                  </label>
                </div>
                {session2Active && (
                  <div className="grid grid-cols-2 gap-2 animate-fadeIn">
                    <div>
                      <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Horário de Início</label>
                      <input
                        type="text"
                        placeholder="HH:MM:SS"
                        value={session2Start}
                        onChange={(e) => handleTimeMask(e.target.value, setSession2Start)}
                        className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1 text-xs text-slate-200 text-center font-mono font-bold focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Horário de Fim</label>
                      <input
                        type="text"
                        placeholder="HH:MM:SS"
                        value={session2End}
                        onChange={(e) => handleTimeMask(e.target.value, setSession2End)}
                        className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1 text-xs text-slate-200 text-center font-mono font-bold focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab content: Action & Timeframe */}
          {activeTab === 'action' && (
            <div className="space-y-4 p-3 bg-slate-950 border border-slate-800 rounded-lg grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                  ⚡ Modo de Ação do Robô
                </label>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="alert">🔔 Indicador</option>
                  <option value="position">📈 Estratégia</option>
                </select>
                <span className="text-[9px] text-slate-500 mt-1 block">
                  {action === 'alert' 
                    ? 'O algoritmo atuará como um Indicador no gráfico, gerando avisos visuais e notificações de compra/venda.'
                    : 'O algoritmo atuará como uma Estratégia, executando ordens automáticas de compra ou venda na conta.'}
                </span>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                  ⏱️ Timeframe para cálculo da Lógica
                </label>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value={1}>1 Minuto (Padrão)</option>
                  <option value={2}>2 Minutos</option>
                  <option value={3}>3 Minutos</option>
                  <option value={5}>5 Minutos</option>
                  <option value={10}>10 Minutos</option>
                  <option value={15}>15 Minutos</option>
                  <option value={30}>30 Minutos</option>
                  <option value={60}>1 Hora</option>
                </select>
                <span className="text-[9px] text-slate-500 mt-1 block">
                  Define em qual agrupamento temporal os indicadores (médias, RSI, etc) serão calculados.
                </span>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                  📊 Modo de Execução das Barras
                </label>
                <select
                  value={executionMode}
                  onChange={(e) => setExecutionMode(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="closed">🔒 Barra Fechada (Calcula no Fechamento - Padrão)</option>
                  <option value="realtime">⚡ Barra Corrente (Tempo Real)</option>
                </select>
                <span className="text-[9px] text-slate-500 mt-1 block">
                  <strong>Barra Fechada</strong> opera barra a barra, reduzindo acionamentos falsos e calculando apenas ao consolidar o candle.
                </span>
              </div>
            </div>
          )}

          {/* Tab content: Risk Settings & ATM Strategy */}
          {activeTab === 'risk' && (
            <div className="space-y-4 p-4 bg-slate-950 border border-slate-800 rounded-lg">
              {/* Header Informativo */}
              <div className="bg-gradient-to-r from-amber-950/30 via-slate-900/60 to-purple-950/30 p-3.5 rounded-lg border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🎯</span>
                    <h4 className="text-sm font-extrabold text-amber-400 uppercase tracking-wide">
                      Gestão de Contratos e Stop Loss (Estratégia ATM)
                    </h4>
                  </div>
                  <p className="text-xs text-slate-400">
                    O robô executará suas ordens utilizando os alvos múltiplos, stop loss, take profit, auto-breakeven e trailing stop configurados na Estratégia ATM selecionada.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsATMModalOpen(true)}
                  className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-sm"
                >
                  <span>⚙️</span>
                  <span>Gerenciar / Criar Nova ATM</span>
                </button>
              </div>

              {/* Seletor / Gestão da Estratégia ATM do Algoritmo */}
              {selectedATM ? (
                /* Estado 1: Algoritmo já possui uma ATM incluída */
                <div className="bg-slate-900/70 p-4 rounded-lg border border-emerald-500/30 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      <label className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                        Estratégia ATM Incluída no Algoritmo:
                      </label>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Total: <strong className="text-amber-400">{(selectedATM.brackets || []).reduce((acc, b) => acc + (Number(b.quantity) || 1), 0)} contrato(s)</strong> • <strong className="text-blue-400">{selectedATM.brackets?.length || 1} alvo(s)</strong>
                    </span>
                  </div>

                  <div className="flex flex-wrap sm:flex-nowrap gap-3 items-center justify-between bg-slate-950/80 p-3.5 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="text-xl">🎯</span>
                      <div className="min-w-0">
                        <h5 className="text-sm font-extrabold text-white truncate">{selectedATM.name}</h5>
                        <p className="text-xs text-slate-400">
                          {selectedATM.brackets?.length || 1} alvo(s) configurado(s) • {(selectedATM.brackets || []).reduce((acc, b) => acc + (Number(b.quantity) || 1), 0)} contrato(s) no total
                        </p>
                      </div>
                    </div>

                    {/* O botão [+] fica oculto aqui para NÃO permitir uma segunda ATM */}
                    {/* Botão de Excluir a ATM do Algoritmo para permitir selecionar outra */}
                    <button
                      type="button"
                      onClick={handleRemoveAtmFromAlgorithm}
                      title="Excluir esta ATM do algoritmo para poder selecionar ou incluir outra"
                      className="px-3.5 py-2 bg-rose-950/60 hover:bg-rose-900 text-rose-300 hover:text-white rounded-lg border border-rose-800/60 transition cursor-pointer flex items-center gap-1.5 text-xs font-bold whitespace-nowrap shadow-sm"
                    >
                      <span>🗑️</span>
                      <span>Excluir ATM do Algoritmo</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Estado 2: Nenhuma ATM incluída no algoritmo ainda */
                <div className="bg-slate-900/70 p-4 rounded-lg border border-amber-500/30 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span>Selecionar Estratégia ATM para o Algoritmo:</span>
                    </label>
                    <span className="text-[11px] text-amber-400/80">
                      ⚠️ Nenhuma ATM vinculada no momento
                    </span>
                  </div>

                  <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                    <select
                      value={selectedAtmIdToInclude}
                      onChange={(e) => setSelectedAtmIdToInclude(e.target.value)}
                      className="flex-1 min-w-[200px] bg-slate-950 border border-slate-700 text-white text-xs font-bold py-2.5 px-3 rounded-lg outline-none cursor-pointer focus:border-amber-400"
                    >
                      {currentAtmList.map((atm: ATMStrategy) => {
                        const totalCts = (atm.brackets || []).reduce((sum: number, b: any) => sum + (Number(b.quantity) || 1), 0);
                        return (
                          <option key={atm.id} value={atm.id} className="bg-slate-900 text-white font-medium py-1">
                            {atm.name} — ({totalCts} ct • {atm.brackets?.length || 1} alvos)
                          </option>
                        );
                      })}
                    </select>

                    <button
                      type="button"
                      onClick={handleIncludeAtmToAlgorithm}
                      title="Incluir esta Estratégia ATM no Algoritmo"
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-sm"
                    >
                      <span>➕</span>
                      <span>Incluir ATM no Algoritmo</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Detalhes dos Brackets / Alvos da ATM Selecionada (Fiel e Somente-Leitura) */}
              {selectedATM && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Alvos e Brackets da Estratégia ({selectedATM.name})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(selectedATM.brackets || []).map((b, idx) => (
                      <div
                        key={b.id || idx}
                        className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 space-y-2.5 transition"
                      >
                        <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                          <span className="text-xs font-extrabold text-amber-400 flex items-center gap-1">
                            🎯 Alvo #{idx + 1}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-950/60 border border-blue-800/40 text-blue-300 rounded font-mono">
                            {b.quantity} {b.quantity === 1 ? 'Contrato' : 'Contratos'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          <div className="bg-slate-950 p-2 rounded border border-rose-950/40">
                            <span className="block text-[9px] font-bold text-rose-400 uppercase">Stop Loss</span>
                            <span className="text-rose-300 font-extrabold text-sm">{b.stopLossPts} pts</span>
                          </div>
                          <div className="bg-slate-950 p-2 rounded border border-emerald-950/40">
                            <span className="block text-[9px] font-bold text-emerald-400 uppercase">Take Profit</span>
                            <span className="text-emerald-300 font-extrabold text-sm">{b.takeProfitPts} pts</span>
                          </div>
                        </div>

                        <div className="space-y-1 text-[10px]">
                          <div className={`p-1.5 rounded border flex items-center justify-between ${
                            b.autoBreakevenEnabled
                              ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                              : 'bg-slate-950 border-slate-800/60 text-slate-500'
                          }`}>
                            <span className="font-semibold">Auto-Breakeven:</span>
                            <span className="font-mono font-bold">
                              {b.autoBreakevenEnabled ? `+${b.autoBreakevenTriggerPts}pt (+${b.autoBreakevenOffsetPts}pt)` : 'Desativado'}
                            </span>
                          </div>

                          <div className={`p-1.5 rounded border flex items-center justify-between ${
                            b.trailingStopEnabled
                              ? 'bg-purple-950/30 border-purple-800/40 text-purple-300'
                              : 'bg-slate-950 border-slate-800/60 text-slate-500'
                          }`}>
                            <span className="font-semibold">Trailing Stop:</span>
                            <span className="font-mono font-bold">
                              {b.trailingStopEnabled ? `+${b.trailingStopTriggerPts}pt (passo ${b.trailingStopStepPts}pt)` : 'Desativado'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Limite Operacional Diário */}
              <div className="bg-slate-900/60 p-3.5 rounded-lg border border-slate-800">
                <label className="block text-xs uppercase font-bold text-slate-300 mb-1">
                  Máximo de Operações Diárias do Robô
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={maxDailyTrades}
                    onChange={(e) => setMaxDailyTrades(Math.max(1, Number(e.target.value)))}
                    min={1}
                    className="w-32 bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-xs text-slate-400">
                    Limite máximo de entradas por ciclo de pregão (19:00 BRT). Bloqueia novas ordens automaticamente ao atingir o limite.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={resetForm}
              disabled={isSaving}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-1.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-lg text-xs font-bold shadow-lg transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {isSaving ? '⏳ Salvando...' : '💾 Salvar Algoritmo'}
            </button>
          </div>

        </form>
      )}

      {/* Modal Popup de Configuração de Parâmetros de Indicadores */}
      {renderConfigModal()}

      {/* Gerenciador de Estratégias ATM (Padrão Boleta) */}
      <ATMStrategyModal
        isOpen={isATMModalOpen}
        onClose={() => {
          setIsATMModalOpen(false);
          refreshAtmList();
        }}
        onSelectATM={(atm) => {
          setSelectedATM(atm);
          setIsATMModalOpen(false);
          refreshAtmList();
        }}
        currentATM={selectedATM}
      />

    </div>
  );
};
