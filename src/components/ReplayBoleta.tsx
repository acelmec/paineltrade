import React, { useState, useEffect } from 'react';
import type { ReplayOrder, ReplayAccountConfig } from '../utils/replayEngine';
import type { GammaLevels } from '../services/db';
import { fetchAtmStrategiesSupabase } from '../services/db';
import { PRESET_ATM_STRATEGIES, type ATMStrategy } from '../utils/atmRegistry';
import { ATMStrategyModal } from './ATMStrategyModal';
import { calculateRangeHlLevels } from '../utils/levelPriceResolver';

interface ReplayBoletaProps {
  selectedAsset: string;
  currentPrice: number;
  candles?: any[];
  activeOrder: ReplayOrder | null;
  orders: ReplayOrder[];
  account: ReplayAccountConfig;
  gammaLevels: GammaLevels | null;
  pointValue: number;
  onPlaceOrder: (order: {
    side: 'COMPRA' | 'VENDA';
    type: 'MARKET' | 'LIMIT' | 'STOP';
    price?: number;
    contracts: number;
    stopLossPts: number | null;
    takeProfitPts: number | null;
    stopLoss?: number | null;
    takeProfit?: number | null;
    brackets?: any[];
    atm?: {
      breakeven_pts?: number;
      breakeven_offset_pts?: number;
      trailing_trigger_pts?: number;
      trailing_dist_pts?: number;
      name?: string;
    };
  }) => void;
  onClosePosition: () => void;
  onReversePosition: () => void;
  onBreakevenPosition?: () => void;
  onOpenAccountModal?: () => void;
}

export const ReplayBoleta: React.FC<ReplayBoletaProps> = ({
  selectedAsset,
  currentPrice,
  candles = [],
  activeOrder,
  orders = [],
  account,
  gammaLevels,
  pointValue,
  onPlaceOrder,
  onClosePosition,
  onReversePosition,
  onBreakevenPosition,
  onOpenAccountModal
}) => {
  // Sizing Mode (LOTE vs FINANCEIRO)
  const [sizingMode, setSizingMode] = useState<'lote' | 'risco'>(() => {
    return (localStorage.getItem('vortex_replay_sizing_mode') as any) || 'lote';
  });
  const activeTab: 'trade' | 'risk' = sizingMode === 'risco' ? 'risk' : 'trade';
  const [contracts, setContracts] = useState<number>(() => {
    return Number(localStorage.getItem('vortex_replay_contracts')) || 1;
  });
  const [riskUsd, setRiskUsd] = useState<number>(() => {
    return Number(localStorage.getItem('vortex_replay_risk_usd')) || 250;
  });

  // Stop & Take Mode: PONTOS vs NÍVEL vs GRÁFICO vs COPILOT vs RANGE HL
  // Padrão obrigatório ao abrir o gráfico: sempre iniciar em 'pontos' (P)
  const [stopMode, setStopMode] = useState<'pontos' | 'nivel' | 'grafico' | 'copilot' | 'range'>(() => {
    try {
      localStorage.setItem('vortex_replay_stop_mode', 'pontos');
    } catch {}
    return 'pontos';
  });

  // Range HL Mode (R) State: Referência de Candles e Multiplicador de TP
  const [rangeCandleRef, setRangeCandleRef] = useState<number>(() => {
    const val = localStorage.getItem('vortex_replay_range_candle_ref');
    return val !== null ? Number(val) : 1;
  });
  const [rangeTpMultiplier, setRangeTpMultiplier] = useState<number>(() => {
    const val = localStorage.getItem('vortex_replay_range_tp_multiplier');
    return val !== null ? Number(val) : 1.0;
  });

  const updateRangeCandleRef = (val: number) => {
    const clamped = Math.max(0, val);
    setRangeCandleRef(clamped);
    localStorage.setItem('vortex_replay_range_candle_ref', String(clamped));
    window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
  };

  const updateRangeTpMultiplier = (val: number) => {
    const clamped = Math.max(0.1, Number(val.toFixed(2)));
    setRangeTpMultiplier(clamped);
    localStorage.setItem('vortex_replay_range_tp_multiplier', String(clamped));
    window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
  };

  const [rangeSide, setRangeSide] = useState<'COMPRA' | 'VENDA' | 'AMBOS'>(() => {
    const val = localStorage.getItem('vortex_replay_range_side');
    return (val === 'COMPRA' || val === 'VENDA' || val === 'AMBOS') ? val : 'COMPRA';
  });

  const updateRangeSide = (val: 'COMPRA' | 'VENDA' | 'AMBOS') => {
    setRangeSide(val);
    localStorage.setItem('vortex_replay_range_side', val);
    window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
  };
  const [slPoints, setSlPoints] = useState<number>(() => {
    return Number(localStorage.getItem('vortex_replay_sl_points')) || 36;
  });
  const [tpPoints, setTpPoints] = useState<number>(() => {
    return Number(localStorage.getItem('vortex_replay_tp_points')) || 40;
  });

  // Copilot Mode (C) State: SL e TP em Preço Direto + Gatilho
  const [copilotSlPrice, setCopilotSlPrice] = useState<number | null>(() => {
    const val = localStorage.getItem('vortex_copilot_sl_price');
    return val ? Number(val) : null;
  });
  const [copilotTpPrice, setCopilotTpPrice] = useState<number | null>(() => {
    const val = localStorage.getItem('vortex_copilot_tp_price');
    return val ? Number(val) : null;
  });
  const [copilotGatilho, setCopilotGatilho] = useState<string>(() => {
    return localStorage.getItem('vortex_copilot_gatilho') || '';
  });
  const [copilotLoadedFromAi, setCopilotLoadedFromAi] = useState<boolean>(false);

  useEffect(() => {
    if (copilotSlPrice !== null) localStorage.setItem('vortex_copilot_sl_price', String(copilotSlPrice));
    else localStorage.removeItem('vortex_copilot_sl_price');
  }, [copilotSlPrice]);

  useEffect(() => {
    if (copilotTpPrice !== null) localStorage.setItem('vortex_copilot_tp_price', String(copilotTpPrice));
    else localStorage.removeItem('vortex_copilot_tp_price');
  }, [copilotTpPrice]);

  useEffect(() => {
    if (copilotGatilho) localStorage.setItem('vortex_copilot_gatilho', copilotGatilho);
    else localStorage.removeItem('vortex_copilot_gatilho');
  }, [copilotGatilho]);

  useEffect(() => {
    const handleCopilotEvent = (e: any) => {
      const { alvo, stop, gatilho } = e.detail || {};
      if (!alvo && !stop && !gatilho) return;

      const parsePrice = (rawVal: any): number | null => {
        if (!rawVal || rawVal === '--') return null;
        const cleaned = String(rawVal).replace(/\$/g, '').replace(/,/g, '').trim();
        const m = cleaned.match(/\d+(?:\.\d+)?/);
        return m ? parseFloat(m[0]) : null;
      };

      if (stop && stop !== '--') {
        const parsedSl = parsePrice(stop);
        if (parsedSl && !isNaN(parsedSl) && parsedSl > 0) {
          setCopilotSlPrice(parsedSl);
          setCopilotLoadedFromAi(true);
        }
      }

      if (alvo && alvo !== '--') {
        const parsedTp = parsePrice(alvo);
        if (parsedTp && !isNaN(parsedTp) && parsedTp > 0) {
          setCopilotTpPrice(parsedTp);
          setCopilotLoadedFromAi(true);
        }
      }

      if (gatilho && gatilho !== '--') {
        setCopilotGatilho(gatilho);
      }
    };

    window.addEventListener('vortex_copilot_thought', handleCopilotEvent);
    return () => window.removeEventListener('vortex_copilot_thought', handleCopilotEvent);
  }, []);

  const [customSlPrice, setCustomSlPrice] = useState<number | null>(() => {
    const val = localStorage.getItem('vortex_replay_custom_sl_price');
    return val ? Number(val) : null;
  });
  const [customTpPrice, setCustomTpPrice] = useState<number | null>(() => {
    const val = localStorage.getItem('vortex_replay_custom_tp_price');
    return val ? Number(val) : null;
  });

  useEffect(() => {
    const handleCustomSlTpUpdate = (e: any) => {
      if (e?.detail) {
        setCustomSlPrice(e.detail.sl);
        setCustomTpPrice(e.detail.tp);
      }
      const savedMode = localStorage.getItem('vortex_replay_stop_mode');
      if (savedMode && (savedMode === 'pontos' || savedMode === 'nivel' || savedMode === 'grafico' || savedMode === 'copilot' || savedMode === 'range')) {
        setStopMode(savedMode as any);
      }
      const savedRef = localStorage.getItem('vortex_replay_range_candle_ref');
      if (savedRef !== null && !isNaN(Number(savedRef))) {
        setRangeCandleRef(Number(savedRef));
      }
      const savedMult = localStorage.getItem('vortex_replay_range_tp_multiplier');
      if (savedMult !== null && !isNaN(Number(savedMult))) {
        setRangeTpMultiplier(Number(savedMult));
      }
      const savedSide = localStorage.getItem('vortex_replay_range_side');
      if (savedSide === 'COMPRA' || savedSide === 'VENDA' || savedSide === 'AMBOS') {
        setRangeSide(savedSide);
      }
    };
    window.addEventListener('vortex_custom_sltp_updated', handleCustomSlTpUpdate);
    return () => window.removeEventListener('vortex_custom_sltp_updated', handleCustomSlTpUpdate);
  }, []);

  const handleClearCustomMarkers = () => {
    localStorage.removeItem('vortex_replay_custom_sl_price');
    localStorage.removeItem('vortex_replay_custom_tp_price');
    setCustomSlPrice(null);
    setCustomTpPrice(null);
    window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated', { detail: { sl: null, tp: null } }));
  };

  // ATM Strategy State & Modal
  const [isATMActive, setIsATMActive] = useState<boolean>(() => {
    return localStorage.getItem('vortex_replay_atm_active') === 'true';
  });
  const [activeATM, setActiveATM] = useState<ATMStrategy>(() => {
    const saved = localStorage.getItem('vortex_replay_active_atm');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return PRESET_ATM_STRATEGIES[0];
  });
  const [isATMModalOpen, setIsATMModalOpen] = useState<boolean>(false);
  const [atmList, setAtmList] = useState<ATMStrategy[]>(PRESET_ATM_STRATEGIES);

  useEffect(() => {
    let isMounted = true;
    fetchAtmStrategiesSupabase().then(list => {
      if (isMounted && list && list.length > 0) {
        setAtmList(list);
      }
    }).catch(() => {});
    return () => { isMounted = false; };
  }, [isATMModalOpen]);

  useEffect(() => {
    localStorage.setItem('vortex_replay_sizing_mode', sizingMode);
    localStorage.setItem('vortex_replay_contracts', String(contracts));
    localStorage.setItem('vortex_replay_risk_usd', String(riskUsd));
    localStorage.setItem('vortex_replay_stop_mode', stopMode);
    localStorage.setItem('vortex_replay_sl_points', String(slPoints));
    localStorage.setItem('vortex_replay_tp_points', String(tpPoints));
  }, [sizingMode, contracts, riskUsd, stopMode, slPoints, tpPoints]);

  useEffect(() => {
    localStorage.setItem('vortex_replay_active_atm', JSON.stringify(activeATM));
  }, [activeATM]);

  useEffect(() => {
    localStorage.setItem('vortex_replay_atm_active', String(isATMActive));
  }, [isATMActive]);

  // Função para resolver Níveis Estruturais (Gamma, Sessões 1 a 4) com Fallback Inteligente
  const resolveLevelPrice = (side: 'COMPRA' | 'VENDA', type: 'SL' | 'TP', entryRef: number): number => {
    const minSl = Math.max(1, slPoints || 50);
    const minTp = Math.max(1, tpPoints || 50);
    const fallbackPrice = type === 'SL'
      ? (side === 'COMPRA' ? entryRef - minSl : entryRef + minSl)
      : (side === 'COMPRA' ? entryRef + minTp : entryRef - minTp);

    if (!gammaLevels) return Number(fallbackPrice.toFixed(2));

    const allLevels: number[] = [];
    const addLvl = (val: any) => {
      if (val === undefined || val === null || val === '' || val === '--') return;
      if (Array.isArray(val)) {
        val.forEach(item => addLvl(item));
        return;
      }
      if (typeof val === 'string' && val.includes(',')) {
        val.split(',').forEach(item => addLvl(item));
        return;
      }
      const n = parseFloat(String(val));
      if (!isNaN(n) && n > 0 && !allLevels.includes(n)) {
        allLevels.push(Number(n.toFixed(2)));
      }
    };

    const g = gammaLevels as any;
    addLvl(g.hvl);
    addLvl(g.call);
    addLvl(g.call_resistance);
    addLvl(g.put);
    addLvl(g.put_support);
    addLvl(g.max1d);
    addLvl(g.max_1d);
    addLvl(g.min1d);
    addLvl(g.min_1d);
    addLvl(g.prev);
    addLvl(g.prev_day_adjust);
    addLvl(g.prevH);
    addLvl(g.prev_day_high);
    addLvl(g.prevL);
    addLvl(g.prev_day_low);
    addLvl(g.hvl0);
    addLvl(g.hvl_0dte);
    addLvl(g.call0);
    addLvl(g.call_resistance_0dte);
    addLvl(g.put0);
    addLvl(g.put_support_0dte);
    addLvl(g.gwall);
    addLvl(g.gamma_wall_0dte);
    addLvl(g.bl);
    addLvl(g.gex);

    addLvl(g.session1_high);
    addLvl(g.session1_low);
    addLvl(g.session2_high);
    addLvl(g.session2_low);
    addLvl(g.session3_high);
    addLvl(g.session3_low);
    addLvl(g.session4_high);
    addLvl(g.session4_low);

    if (allLevels.length === 0) {
      return Number(fallbackPrice.toFixed(2));
    }

    allLevels.sort((a, b) => a - b);

    if (type === 'SL') {
      if (side === 'COMPRA') {
        const valid = allLevels.filter(lvl => lvl < entryRef && (entryRef - lvl) >= minSl);
        if (valid.length > 0) return Number(Math.max(...valid).toFixed(2));
        const allBelow = allLevels.filter(lvl => lvl < entryRef);
        return allBelow.length > 0 ? Number(Math.min(...allBelow).toFixed(2)) : Number((entryRef - minSl).toFixed(2));
      } else {
        const valid = allLevels.filter(lvl => lvl > entryRef && (lvl - entryRef) >= minSl);
        if (valid.length > 0) return Number(Math.min(...valid).toFixed(2));
        const allAbove = allLevels.filter(lvl => lvl > entryRef);
        return allAbove.length > 0 ? Number(Math.max(...allAbove).toFixed(2)) : Number((entryRef + minSl).toFixed(2));
      }
    } else {
      // TP
      if (side === 'COMPRA') {
        const valid = allLevels.filter(lvl => lvl > entryRef && (lvl - entryRef) >= minTp);
        if (valid.length > 0) return Number(Math.max(...valid).toFixed(2));
        const allAbove = allLevels.filter(lvl => lvl > entryRef);
        return allAbove.length > 0 ? Number(Math.max(...allAbove).toFixed(2)) : Number((entryRef + minTp).toFixed(2));
      } else {
        const valid = allLevels.filter(lvl => lvl < entryRef && (entryRef - lvl) >= minTp);
        if (valid.length > 0) return Number(Math.max(...valid).toFixed(2));
        const allBelow = allLevels.filter(lvl => lvl < entryRef);
        return allBelow.length > 0 ? Number(Math.min(...allBelow).toFixed(2)) : Number((entryRef - minTp).toFixed(2));
      }
    }
  };

  const activeChartCandles = typeof window !== 'undefined' && Array.isArray((window as any).__vortex_active_chart_candles) && (window as any).__vortex_active_chart_candles.length > 0
    ? (window as any).__vortex_active_chart_candles
    : null;
  const effectiveCandles = activeChartCandles || (candles || []);

  const referencePrice = currentPrice;
  const resolvedSL = resolveLevelPrice('COMPRA', 'SL', referencePrice);

  const activeCandleRef = typeof window !== 'undefined' ? Number(localStorage.getItem('vortex_replay_range_candle_ref') ?? rangeCandleRef) : rangeCandleRef;
  const activeTpMult = typeof window !== 'undefined' ? Number(localStorage.getItem('vortex_replay_range_tp_multiplier') ?? rangeTpMultiplier) : rangeTpMultiplier;

  // Previsões de Range HL em tempo real
  const rangeBuyPreview = calculateRangeHlLevels('COMPRA', referencePrice, effectiveCandles, activeCandleRef, activeTpMult, 0.25);
  const rangeSellPreview = calculateRangeHlLevels('VENDA', referencePrice, effectiveCandles, activeCandleRef, activeTpMult, 0.25);

  let calculatedSlPts = slPoints > 0 ? slPoints : 20;

  if (isATMActive) {
    const firstB = activeATM.brackets?.[0];
    if (firstB && firstB.stopLossPts > 0) {
      calculatedSlPts = firstB.stopLossPts;
    }
  } else if (stopMode === 'grafico') {
    if (customSlPrice !== null && customSlPrice > 0 && referencePrice > 0) {
      calculatedSlPts = Math.abs(referencePrice - customSlPrice);
    } else {
      calculatedSlPts = slPoints > 0 ? slPoints : 20;
    }
  } else if (stopMode === 'copilot') {
    if (copilotSlPrice !== null && copilotSlPrice > 0 && referencePrice > 0) {
      calculatedSlPts = Math.abs(referencePrice - copilotSlPrice);
    } else {
      calculatedSlPts = slPoints > 0 ? slPoints : 20;
    }
  } else if (stopMode === 'range') {
    const effectiveRangePts = rangeSide === 'VENDA' ? rangeSellPreview.slPts : rangeBuyPreview.slPts;
    calculatedSlPts = effectiveRangePts > 0 ? effectiveRangePts : (slPoints > 0 ? slPoints : 20);
  } else if (stopMode === 'nivel') {
    if (referencePrice > 0 && resolvedSL > 0) {
      calculatedSlPts = Math.abs(referencePrice - resolvedSL);
    } else {
      calculatedSlPts = slPoints > 0 ? slPoints : 20;
    }
  } else {
    // Modo Pontos (P)
    calculatedSlPts = slPoints > 0 ? slPoints : 20;
  }

  calculatedSlPts = Math.max(1, calculatedSlPts);

  const calculatedRiskContracts = Math.max(1, Math.floor((riskUsd || 250) / ((calculatedSlPts || 50) * pointValue)));
  const totalATMContracts = activeATM.brackets?.reduce((acc, b) => acc + b.quantity, 0) || 1;

  const effectiveContracts = sizingMode === 'risco'
    ? calculatedRiskContracts
    : (isATMActive ? (totalATMContracts || contracts) : (contracts || 1));

  // PnL e Status da Posição
  const openOrders = orders.filter(o => o.status === 'Em Andamento');
  const isPositionOpen = openOrders.length > 0;
  const totalContractsOpen = openOrders.reduce((acc, o) => acc + (o.contrato || 1), 0);
  const firstOpenOrder = openOrders[0] || activeOrder;
  const posQty = isPositionOpen ? (firstOpenOrder?.side === 'COMPRA' ? totalContractsOpen : -totalContractsOpen) : 0;
  const isLong = posQty > 0;
  const isShort = posQty < 0;
  const pnlUSD = openOrders.reduce((acc, o) => {
    const pts = o.side === 'COMPRA' ? currentPrice - o.entry_price : o.entry_price - currentPrice;
    return acc + (pts * (o.contrato || 1) * pointValue);
  }, 0);

  const openOrdersCount = orders.filter(o => o.status === 'Em Andamento' || o.status === 'Pendente').length;
  const hasOpenPosition = Boolean(isPositionOpen || openOrdersCount > 0);

  const handleExecute = (side: 'COMPRA' | 'VENDA') => {
    if (hasOpenPosition) {
      alert('⚠️ Já existe uma operação em andamento na simulação de Replay. Zere ou aguarde o encerramento antes de abrir nova posição.');
      return;
    }

    let finalSlPts: number | null = slPoints;
    let finalTpPts: number | null = tpPoints;
    let directSlPrice: number | undefined = undefined;
    let directTpPrice: number | undefined = undefined;
    let atmData: any = undefined;
    let bracketsToSend: any[] | undefined = undefined;

    if (isATMActive && activeATM.brackets && activeATM.brackets.length > 0) {
      bracketsToSend = activeATM.brackets;
      const firstB = activeATM.brackets[0];
      finalSlPts = firstB.stopLossPts;
      finalTpPts = firstB.takeProfitPts;
      atmData = {
        name: activeATM.name,
        breakeven_pts: firstB.autoBreakevenEnabled ? firstB.autoBreakevenTriggerPts : undefined,
        breakeven_offset_pts: firstB.autoBreakevenEnabled ? (firstB.autoBreakevenOffsetPts ?? 0) : undefined,
        trailing_trigger_pts: firstB.trailingStopEnabled ? firstB.trailingStopTriggerPts : undefined,
        trailing_dist_pts: firstB.trailingStopEnabled ? firstB.trailingStopStepPts : undefined
      };
    } else if (stopMode === 'copilot' && (copilotSlPrice !== null || copilotTpPrice !== null)) {
      directSlPrice = copilotSlPrice || undefined;
      directTpPrice = copilotTpPrice || undefined;
      finalSlPts = copilotSlPrice ? Math.abs(currentPrice - copilotSlPrice) : slPoints;
      finalTpPts = copilotTpPrice ? Math.abs(copilotTpPrice - currentPrice) : tpPoints;
    } else if (stopMode === 'grafico') {
      if (customSlPrice !== null && customSlPrice > 0) {
        directSlPrice = customSlPrice;
        finalSlPts = Math.abs(currentPrice - customSlPrice);
      } else {
        finalSlPts = slPoints;
      }
      if (customTpPrice !== null && customTpPrice > 0) {
        directTpPrice = customTpPrice;
        finalTpPts = Math.abs(customTpPrice - currentPrice);
      } else {
        finalTpPts = tpPoints;
      }
    } else if (stopMode === 'range') {
      const activeCandleRef = typeof window !== 'undefined' ? Number(localStorage.getItem('vortex_replay_range_candle_ref') ?? rangeCandleRef) : rangeCandleRef;
      const activeTpMult = typeof window !== 'undefined' ? Number(localStorage.getItem('vortex_replay_range_tp_multiplier') ?? rangeTpMultiplier) : rangeTpMultiplier;
      const rangeRes = calculateRangeHlLevels(side, currentPrice, effectiveCandles, activeCandleRef, activeTpMult, 0.25);
      directSlPrice = rangeRes.slPrice;
      directTpPrice = rangeRes.tpPrice;
      finalSlPts = rangeRes.slPts;
      finalTpPts = rangeRes.tpPts;
    } else if (stopMode === 'nivel') {
      const targetSlPrice = resolveLevelPrice(side, 'SL', currentPrice);
      const targetTpPrice = resolveLevelPrice(side, 'TP', currentPrice);
      directSlPrice = targetSlPrice;
      directTpPrice = targetTpPrice;
      finalSlPts = Math.abs(currentPrice - targetSlPrice);
      finalTpPts = Math.abs(targetTpPrice - currentPrice);
    }

    onPlaceOrder({
      side,
      type: 'MARKET',
      contracts: effectiveContracts,
      stopLossPts: finalSlPts,
      takeProfitPts: finalTpPts,
      stopLoss: directSlPrice,
      takeProfit: directTpPrice,
      brackets: bracketsToSend,
      atm: atmData
    });

    if (stopMode === 'grafico') {
      handleClearCustomMarkers();
    }
  };

  return (
    <div className="w-full h-full max-h-full bg-[#111827] border-l border-slate-800 flex flex-col justify-between p-2 select-none overflow-y-auto font-sans text-slate-200 text-xs">
      <div className="space-y-1.5">
        {/* 1. TOPO: CONTA SELECIONADA */}
        <div className="bg-[#151e33] p-1.5 rounded-lg border border-slate-800 space-y-0.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
              CONTA [{selectedAsset}]
            </label>
            {onOpenAccountModal && (
              <button
                onClick={onOpenAccountModal}
                className="text-[10px] text-blue-400 hover:text-blue-300 font-bold cursor-pointer"
              >
                ⚙️ Ajustar
              </button>
            )}
          </div>
          <div className="w-full bg-[#0d1424] border border-slate-700 text-[10px] font-bold text-slate-100 py-1 px-2 rounded truncate flex items-center justify-between">
            <span>{account.account_name || 'Conta Replay'} (REPLAY_DEMO)</span>
            <span className="text-emerald-400 font-mono font-black">${(account.balance || 50000).toLocaleString('en-US')}</span>
          </div>
        </div>

        {/* 2. CARD RESUMO: POSIÇÃO ATUAL | CONTRATOS | STATUS */}
        <div className={`p-2 rounded-lg border transition font-mono ${
          isLong
            ? 'bg-emerald-950/60 border-emerald-700/80 shadow-sm'
            : isShort
            ? 'bg-rose-950/60 border-rose-700/80 shadow-sm'
            : 'bg-[#151e33] border-slate-800 shadow-sm'
        }`}>
          <div className="grid grid-cols-3 text-center divide-x divide-slate-800">
            {/* POSIÇÃO ATUAL */}
            <div className="px-1">
              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block mb-0.5">
                POSIÇÃO ATUAL
              </span>
              <span className={`text-sm font-black block leading-tight ${
                posQty !== 0
                  ? (pnlUSD >= 0 ? 'text-emerald-400' : 'text-rose-400')
                  : 'text-slate-300'
              }`}>
                {posQty !== 0 ? `${pnlUSD >= 0 ? '+' : ''}$${pnlUSD.toFixed(2)}` : '$ 0.00'}
              </span>
            </div>

            {/* CONTRATOS */}
            <div className="px-1">
              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block mb-0.5">
                CONTRATOS
              </span>
              <span className="text-sm font-black text-slate-100 block leading-tight">
                {Math.abs(posQty)}
              </span>
            </div>

            {/* STATUS */}
            <div className="px-1">
              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block mb-0.5">
                STATUS
              </span>
              <span className={`text-xs font-black uppercase block leading-tight ${
                isLong
                  ? 'text-emerald-300'
                  : isShort
                  ? 'text-rose-300'
                  : 'text-slate-400'
              }`}>
                {isLong ? 'COMPRADO' : isShort ? 'VENDIDO' : 'ZERADO'}
              </span>
            </div>
          </div>
        </div>

        {/* 3. TABS: LOTE | FINANCEIRO */}
        <div className="bg-[#151e33] p-0.5 rounded-lg border border-slate-800 flex gap-0.5 text-[9.5px] font-extrabold tracking-wider uppercase">
          <button
            type="button"
            onClick={() => {
              setSizingMode('lote');
              localStorage.setItem('vortex_replay_sizing_mode', 'lote');
            }}
            className={`flex-1 py-1 rounded transition text-center cursor-pointer ${
              activeTab === 'trade'
                ? 'bg-[#1e293b] text-blue-400 font-black border-b border-blue-500 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            LOTE
          </button>
          <button
            type="button"
            onClick={() => {
              setSizingMode('risco');
              localStorage.setItem('vortex_replay_sizing_mode', 'risco');
            }}
            className={`flex-1 py-1 rounded transition text-center cursor-pointer ${
              activeTab === 'risk'
                ? 'bg-[#1e293b] text-emerald-400 font-black border-b border-emerald-500 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            FINANCEIRO
          </button>
        </div>

        {/* 4. SIZING / CONTRATOS */}
        <div className="bg-[#151e33] p-1.5 rounded-lg border border-slate-800 space-y-1">
          {activeTab === 'trade' ? (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  CONTRATOS
                </label>
                <span className="text-[10px] font-mono font-bold text-slate-300">
                  {contracts} {contracts > 1 ? 'contratos' : 'contrato'}
                </span>
              </div>
              <div className="flex items-center bg-[#0d1424] border border-slate-700 rounded overflow-hidden h-6.5">
                <button
                  type="button"
                  onClick={() => setContracts(Math.max(1, contracts - 1))}
                  className="px-3 h-full bg-slate-800 hover:bg-slate-700 text-white font-black text-xs active:scale-95 transition cursor-pointer"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={contracts}
                  onChange={(e) => setContracts(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-transparent text-center font-mono font-black text-white text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={() => setContracts(contracts + 1)}
                  className="px-3 h-full bg-slate-800 hover:bg-slate-700 text-white font-black text-xs active:scale-95 transition cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  RISCO DESEJADO ($)
                </label>
                <span className="text-[9px] font-mono font-bold text-purple-300">
                  ~{calculatedRiskContracts}x ({calculatedSlPts.toFixed(1)} pts)
                </span>
              </div>
              <div className="flex items-center bg-[#0d1424] border border-slate-700 rounded px-2 h-6">
                <span className="text-emerald-400 font-black mr-1 text-xs">$</span>
                <input
                  type="number"
                  min={10}
                  step={10}
                  value={riskUsd}
                  onChange={(e) => setRiskUsd(Math.max(1, parseFloat(e.target.value) || 0))}
                  className="w-full bg-transparent font-mono font-black text-emerald-400 text-xs outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* 5. GESTÃO (SL & TP - PONTOS vs NÍVEL vs GRÁFICO vs COPILOT) */}
        <div className="bg-[#151e33] p-1.5 rounded-lg border border-slate-800 space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
              GESTÃO
            </span>
            <div className="flex bg-[#0d1424] p-0.5 rounded border border-slate-800 text-[9px] gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setStopMode('pontos');
                  localStorage.setItem('vortex_replay_stop_mode', 'pontos');
                  window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
                }}
                title="Modo Pontos (SL e TP fixos em pontos)"
                className={`px-2 py-0.5 rounded font-black transition cursor-pointer ${
                  stopMode === 'pontos' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                P
              </button>
              <button
                type="button"
                onClick={() => {
                  setStopMode('nivel');
                  localStorage.setItem('vortex_replay_stop_mode', 'nivel');
                  window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
                }}
                title="Modo Nível (SL e TP calculados por níveis técnicos e gamma)"
                className={`px-2 py-0.5 rounded font-black transition cursor-pointer ${
                  stopMode === 'nivel' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                N
              </button>
              <button
                type="button"
                onClick={() => {
                  setStopMode('grafico');
                  localStorage.setItem('vortex_replay_stop_mode', 'grafico');
                  window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
                }}
                title="Modo Gráfico (Marcação visual interativa no gráfico)"
                className={`px-2 py-0.5 rounded font-black transition cursor-pointer ${
                  stopMode === 'grafico' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                G
              </button>
              <button
                type="button"
                onClick={() => {
                  setStopMode('copilot');
                  localStorage.setItem('vortex_replay_stop_mode', 'copilot');
                  window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
                }}
                title="Modo Copilot IA (Preços de SL e TP automáticos da IA com edição direta de preço)"
                className={`px-2 py-0.5 rounded font-black transition cursor-pointer ${
                  stopMode === 'copilot' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                C
              </button>
              <button
                type="button"
                onClick={() => {
                  setStopMode('range');
                  localStorage.setItem('vortex_replay_stop_mode', 'range');
                  window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
                }}
                title="Modo Range HL (Stop Loss na Mínima/Máxima dos candles e Take Profit com Fator R:R)"
                className={`px-2 py-0.5 rounded font-black transition cursor-pointer ${
                  stopMode === 'range' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                R
              </button>
            </div>
          </div>

          {stopMode === 'copilot' ? (
            /* MODO COPILOT (C): EXIBE PREÇO DIRETO DE SL E TP + GATILHO RECOMENDADO DA IA */
            <div className="space-y-1.5 bg-[#0d1424] p-2 rounded border border-purple-500/40">
              <div className="flex items-center justify-between">
                <span className="text-[9.5px] font-extrabold text-purple-400 uppercase tracking-wider flex items-center gap-1">
                  🤖 COPILOT IA (PREÇO)
                </span>
                {copilotSlPrice || copilotTpPrice ? (
                  <span className="text-[8.5px] font-mono text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/60 px-1 py-0.2 rounded">
                    {copilotLoadedFromAi ? '✓ RECOMENDADO IA' : '✓ PERSONALIZADO'}
                  </span>
                ) : (
                  <span className="text-[8.5px] font-mono text-slate-400">DIGITE OU AGUARDE IA</span>
                )}
              </div>

              {/* Gatilho Recomendado da IA se houver */}
              {copilotGatilho && copilotGatilho !== '--' && (
                <div className="bg-amber-950/40 border border-amber-500/40 rounded p-1.5 text-[9px] text-amber-200 shadow-inner">
                  <div className="flex items-center gap-1 font-black text-amber-400 uppercase tracking-wider text-[8.5px]">
                    <span>⚡</span>
                    <span>GATILHO DE ENTRADA RECOMENDADO:</span>
                  </div>
                  <div className="font-mono text-amber-100 font-bold mt-0.5 leading-tight">
                    {copilotGatilho}
                  </div>
                </div>
              )}

              {/* SL e TP Preços Editáveis */}
              <div className="grid grid-cols-2 gap-1.5">
                {/* STOP LOSS PREÇO */}
                <div className="bg-rose-950/30 p-1.5 rounded border border-rose-600/50 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9.5px] font-extrabold text-rose-400 uppercase">
                      🛑 SL (PREÇO)
                    </span>
                    {copilotSlPrice !== null && currentPrice > 0 && (
                      <span className="text-[8.5px] font-mono text-rose-300 font-bold">
                        {Math.abs(currentPrice - copilotSlPrice).toFixed(1)} pts
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="any"
                    placeholder="Ex: 21520.25"
                    value={copilotSlPrice !== null && !isNaN(copilotSlPrice) ? copilotSlPrice : ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setCopilotSlPrice(!isNaN(val) ? val : null);
                      setCopilotLoadedFromAi(false);
                    }}
                    className="w-full bg-[#0a0f1d] border border-rose-800/80 rounded px-1.5 py-0.5 text-rose-300 font-mono font-black text-[10px] outline-none focus:border-rose-500 text-center"
                  />
                </div>

                {/* TAKE PROFIT PREÇO */}
                <div className="bg-emerald-950/30 p-1.5 rounded border border-emerald-600/50 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9.5px] font-extrabold text-emerald-400 uppercase">
                      🎯 TP (PREÇO)
                    </span>
                    {copilotTpPrice !== null && currentPrice > 0 && (
                      <span className="text-[8.5px] font-mono text-emerald-300 font-bold">
                        {Math.abs(copilotTpPrice - currentPrice).toFixed(1)} pts
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="any"
                    placeholder="Ex: 21620.50"
                    value={copilotTpPrice !== null && !isNaN(copilotTpPrice) ? copilotTpPrice : ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setCopilotTpPrice(!isNaN(val) ? val : null);
                      setCopilotLoadedFromAi(false);
                    }}
                    className="w-full bg-[#0a0f1d] border border-emerald-800/80 rounded px-1.5 py-0.5 text-emerald-300 font-mono font-black text-[10px] outline-none focus:border-emerald-500 text-center"
                  />
                </div>
              </div>
            </div>
          ) : stopMode === 'grafico' ? (
            <div className="space-y-1.5 bg-[#0d1424] p-2 rounded border border-amber-500/40">
              <div className="flex items-center justify-between">
                <span className="text-[9.5px] font-extrabold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                  🎯 MARCAÇÃO NO GRÁFICO
                </span>
                {customSlPrice && customTpPrice ? (
                  <span className="text-[9px] font-mono text-emerald-400 font-bold">✓ DEFINIDOS</span>
                ) : (
                  <span className="text-[9px] font-mono text-slate-400">PENDENTE</span>
                )}
              </div>

              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('vortex_start_marking_sltp'));
                  }}
                  className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-md shadow transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>🎯</span>
                  <span>{customSlPrice && customTpPrice ? 'REAJUSTAR MARCAÇÃO' : 'INICIAR MARCAÇÃO'}</span>
                </button>
                {customSlPrice && customTpPrice && (
                  <button
                    type="button"
                    onClick={handleClearCustomMarkers}
                    className="px-2 py-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold text-xs rounded-md shadow transition active:scale-95 cursor-pointer flex items-center justify-center gap-1 shrink-0"
                    title="Excluir marcações de SL e TP do gráfico"
                  >
                    <span>🗑️</span>
                    <span>Limpar</span>
                  </button>
                )}
              </div>

              {customSlPrice && customTpPrice && (
                <div className="grid grid-cols-2 gap-1 text-[9px] font-mono pt-1 border-t border-slate-800">
                  <div className="bg-rose-950/50 p-1 rounded border border-rose-900/60">
                    <span className="text-rose-400 font-bold block">🛑 SL FIXO:</span>
                    <span className="text-slate-100 font-black">{customSlPrice.toFixed(2)}</span>
                  </div>
                  <div className="bg-emerald-950/50 p-1 rounded border border-emerald-900/60">
                    <span className="text-emerald-400 font-bold block">🎯 TP FIXO:</span>
                    <span className="text-slate-100 font-black">{customTpPrice.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          ) : stopMode === 'range' ? (
            /* MODO RANGE HL (R): MÍNIMA / MÁXIMA DE CANDLES + FATOR TP */
            <div className="space-y-2 bg-[#0d1424] p-2 rounded-lg border border-emerald-500/40 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-[9.5px] font-extrabold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                  <span>📐</span> RANGE HL (MÍNIMA & MÁXIMA)
                </span>
                <span className="text-[8.5px] font-mono text-emerald-300 font-bold bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/60">
                  REF: {rangeCandleRef === 0 ? 'Só Atual' : `Atual + ${rangeCandleRef}`}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {/* CANDLE REFERÊNCIA */}
                <div className="space-y-0.5">
                  <div className="flex justify-between items-center text-[9px] text-slate-400 font-bold uppercase">
                    <span>Candles Ref</span>
                    <span className="text-[8px] text-slate-300 font-normal">
                      {rangeCandleRef === 0 ? 'Vela 0' : `${rangeCandleRef + 1} velas`}
                    </span>
                  </div>
                  <div className="flex items-center bg-[#151e33] border border-slate-700 rounded overflow-hidden h-6">
                    <button
                      type="button"
                      onClick={() => updateRangeCandleRef(Math.max(0, rangeCandleRef - 1))}
                      className="px-2 h-full bg-slate-800 hover:bg-slate-700 text-white font-black text-xs active:scale-95 transition cursor-pointer"
                      title="Diminuir período de velas"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={rangeCandleRef}
                      onChange={(e) => updateRangeCandleRef(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-transparent text-center font-mono font-black text-emerald-400 text-xs outline-none"
                      title="0 = Vela atual, 1 = Atual + 1 anterior, N = Histórico de candles"
                    />
                    <button
                      type="button"
                      onClick={() => updateRangeCandleRef(rangeCandleRef + 1)}
                      className="px-2 h-full bg-slate-800 hover:bg-slate-700 text-white font-black text-xs active:scale-95 transition cursor-pointer"
                      title="Aumentar período de velas"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* FATOR TP (R:R) */}
                <div className="space-y-0.5">
                  <div className="flex justify-between items-center text-[9px] text-slate-400 font-bold uppercase">
                    <span>Fator TP</span>
                    <span className="text-[8px] text-emerald-400 font-mono font-bold">
                      {rangeTpMultiplier.toFixed(2)}x
                    </span>
                  </div>
                  <div className="flex items-center bg-[#151e33] border border-slate-700 rounded overflow-hidden h-6">
                    <button
                      type="button"
                      onClick={() => updateRangeTpMultiplier(Math.max(0.1, Number((rangeTpMultiplier - 0.25).toFixed(2))))}
                      className="px-2 h-full bg-slate-800 hover:bg-slate-700 text-white font-black text-xs active:scale-95 transition cursor-pointer"
                      title="Diminuir multiplicador do Alvo"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0.1}
                      max={10}
                      step={0.25}
                      value={rangeTpMultiplier}
                      onChange={(e) => updateRangeTpMultiplier(Math.max(0.1, parseFloat(e.target.value) || 1.0))}
                      className="w-full bg-transparent text-center font-mono font-black text-emerald-400 text-xs outline-none"
                      title="Multiplicador do Take Profit sobre o Stop Loss (ex: 1.0 = 1:1, 1.5 = 1:1.5)"
                    />
                    <button
                      type="button"
                      onClick={() => updateRangeTpMultiplier(Number((rangeTpMultiplier + 0.25).toFixed(2)))}
                      className="px-2 h-full bg-slate-800 hover:bg-slate-700 text-white font-black text-xs active:scale-95 transition cursor-pointer"
                      title="Aumentar multiplicador do Alvo"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Seletor de Prévia no Gráfico */}
              <div className="flex items-center justify-between gap-1 bg-[#151e33] px-1.5 py-1 rounded border border-slate-800">
                <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <span>📊</span> Simular Gráfico:
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => updateRangeSide('COMPRA')}
                    className={`px-1.5 py-0.5 rounded text-[8.5px] font-black transition cursor-pointer ${
                      rangeSide === 'COMPRA' ? 'bg-emerald-600 text-white shadow ring-1 ring-emerald-400' : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Exibir linhas de Stop e Take de Compra no gráfico"
                  >
                    COMPRA
                  </button>
                  <button
                    type="button"
                    onClick={() => updateRangeSide('VENDA')}
                    className={`px-1.5 py-0.5 rounded text-[8.5px] font-black transition cursor-pointer ${
                      rangeSide === 'VENDA' ? 'bg-rose-600 text-white shadow ring-1 ring-rose-400' : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Exibir linhas de Stop e Take de Venda no gráfico"
                  >
                    VENDA
                  </button>
                  <button
                    type="button"
                    onClick={() => updateRangeSide('AMBOS')}
                    className={`px-1.5 py-0.5 rounded text-[8.5px] font-black transition cursor-pointer ${
                      rangeSide === 'AMBOS' ? 'bg-blue-600 text-white shadow ring-1 ring-blue-400' : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Exibir ambas as linhas de simulação no gráfico simultaneamente"
                  >
                    AMBOS
                  </button>
                </div>
              </div>

              {/* Badges de Prévia em Tempo Real */}
              <div className="grid grid-cols-2 gap-1 text-[8.5px] font-mono pt-1 border-t border-slate-800/80">
                <div 
                  onClick={() => updateRangeSide('COMPRA')}
                  className={`p-1 rounded border transition cursor-pointer ${
                    rangeSide === 'COMPRA' || rangeSide === 'AMBOS'
                      ? 'bg-emerald-950/70 border-emerald-500 ring-1 ring-emerald-500/50' 
                      : 'bg-emerald-950/30 border-emerald-900/60 hover:bg-emerald-950/50'
                  }`}
                  title="Clique para destacar simulação de Compra no gráfico"
                >
                  <div className="text-emerald-400 font-bold flex items-center justify-between">
                    <span>SL COMPRA:</span>
                    <span>-{rangeBuyPreview.slPts.toFixed(1)}pt</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-slate-100 font-black">{rangeBuyPreview.slPrice.toFixed(2)}</span>
                    <span className="text-emerald-400 text-[8px] font-bold">TP: +{rangeBuyPreview.tpPts.toFixed(1)}pt</span>
                  </div>
                </div>

                <div 
                  onClick={() => updateRangeSide('VENDA')}
                  className={`p-1 rounded border transition cursor-pointer ${
                    rangeSide === 'VENDA' || rangeSide === 'AMBOS'
                      ? 'bg-rose-950/70 border-rose-500 ring-1 ring-rose-500/50' 
                      : 'bg-rose-950/30 border-rose-900/60 hover:bg-rose-950/50'
                  }`}
                  title="Clique para destacar simulação de Venda no gráfico"
                >
                  <div className="text-rose-400 font-bold flex items-center justify-between">
                    <span>SL VENDA:</span>
                    <span>+{rangeSellPreview.slPts.toFixed(1)}pt</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-slate-100 font-black">{rangeSellPreview.slPrice.toFixed(2)}</span>
                    <span className="text-rose-400 text-[8px] font-bold">TP: -{rangeSellPreview.tpPts.toFixed(1)}pt</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* SL e TP Stepper Inputs */
            <div className="grid grid-cols-2 gap-1.5">
              {/* STOP LOSS */}
              <div className="bg-[#0d1424] p-1 rounded border border-rose-950/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold text-rose-400 block uppercase">
                    SL ({stopMode === 'pontos' ? 'PTS' : 'NÍVEL'})
                  </span>
                </div>
                <div className="flex items-center bg-[#151e33] border border-rose-900/60 rounded overflow-hidden h-5">
                  <button
                    type="button"
                    onClick={() => setSlPoints(Math.max(1, slPoints - 5))}
                    className="px-1.5 h-full bg-rose-900/40 hover:bg-rose-800 text-rose-300 font-bold active:scale-95 text-[10px] cursor-pointer"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={slPoints}
                    onChange={(e) => setSlPoints(Math.max(1, parseFloat(e.target.value) || 1))}
                    className="w-8 bg-transparent text-center font-mono font-bold text-rose-300 text-[10px] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setSlPoints(slPoints + 5)}
                    className="px-1.5 h-full bg-rose-900/40 hover:bg-rose-800 text-rose-300 font-bold active:scale-95 text-[10px] cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* TAKE PROFIT */}
              <div className="bg-[#0d1424] p-1 rounded border border-emerald-950/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold text-emerald-400 block uppercase">
                    TP ({stopMode === 'pontos' ? 'PTS' : 'NÍVEL'})
                  </span>
                </div>
                <div className="flex items-center bg-[#151e33] border border-emerald-900/60 rounded overflow-hidden h-5">
                  <button
                    type="button"
                    onClick={() => setTpPoints(Math.max(1, tpPoints - 5))}
                    className="px-1.5 h-full bg-emerald-900/40 hover:bg-emerald-800 text-emerald-300 font-bold active:scale-95 text-[10px] cursor-pointer"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={tpPoints}
                    onChange={(e) => setTpPoints(Math.max(1, parseFloat(e.target.value) || 1))}
                    className="w-8 bg-transparent text-center font-mono font-bold text-emerald-300 text-[10px] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setTpPoints(tpPoints + 5)}
                    className="px-1.5 h-full bg-emerald-900/40 hover:bg-emerald-800 text-emerald-300 font-bold active:scale-95 text-[10px] cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 6. ESTRATÉGIA ATM (ABAIXO DA GESTÃO) */}
        <div className={`p-1.5 rounded-lg border transition ${
          isATMActive ? 'bg-[#151e33] border-amber-500/50 shadow-sm' : 'bg-[#151e33]/60 border-slate-800 opacity-80'
        }`}>
          <div className="flex justify-between items-center mb-1">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isATMActive}
                onChange={(e) => setIsATMActive(e.target.checked)}
                className="w-3.5 h-3.5 accent-amber-500 cursor-pointer rounded"
              />
              <span className={`text-[10px] font-extrabold uppercase tracking-wider ${
                isATMActive ? 'text-amber-400' : 'text-slate-400'
              }`}>
                ATIVAR ESTRATÉGIA ATM
              </span>
            </label>
            {isATMActive && (
              <button
                onClick={() => setIsATMModalOpen(true)}
                title="Configurar Estratégia ATM"
                className="text-slate-400 hover:text-amber-400 transition text-[10px] cursor-pointer"
              >
                ⚙️
              </button>
            )}
          </div>

          {isATMActive && (
            <select
              value={activeATM.id}
              onChange={(e) => {
                const found = atmList.find(a => a.id === e.target.value) || PRESET_ATM_STRATEGIES.find(a => a.id === e.target.value);
                if (found) setActiveATM(found);
              }}
              className="w-full bg-[#0d1424] border border-amber-500/40 text-[10px] font-bold text-slate-100 py-1 px-1.5 rounded outline-none cursor-pointer truncate"
            >
              {atmList.map(atm => (
                <option key={atm.id} value={atm.id} className="bg-slate-900">
                  {atm.name.split('(')[0].replace(/[🎯⚖️🚀]/g, '').trim()}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 7. BOTÕES PRINCIPAIS: COMPRA & VENDA (Compactos, 50% da altura) */}
        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          {/* COMPRA */}
          <button
            type="button"
            onClick={() => handleExecute('COMPRA')}
            disabled={hasOpenPosition}
            title={hasOpenPosition ? "Operação em andamento no Replay" : "Executar ordem de Compra no Replay"}
            className={`font-black py-2.5 px-2 rounded-lg shadow transition flex items-center justify-center gap-1.5 border text-xs tracking-wider uppercase ${
              hasOpenPosition
                ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-50'
                : 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white cursor-pointer border-emerald-500/40'
            }`}
          >
            <span className="text-sm">{hasOpenPosition ? '🔒' : '⬆️'}</span>
            <span>COMPRA</span>
          </button>

          {/* VENDA */}
          <button
            type="button"
            onClick={() => handleExecute('VENDA')}
            disabled={hasOpenPosition}
            title={hasOpenPosition ? "Operação em andamento no Replay" : "Executar ordem de Venda no Replay"}
            className={`font-black py-2.5 px-2 rounded-lg shadow transition flex items-center justify-center gap-1.5 border text-xs tracking-wider uppercase ${
              hasOpenPosition
                ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-50'
                : 'bg-rose-600 hover:bg-rose-500 active:scale-95 text-white cursor-pointer border-rose-500/40'
            }`}
          >
            <span className="text-sm">{hasOpenPosition ? '🔒' : '⬇️'}</span>
            <span>VENDA</span>
          </button>
        </div>

        {/* 8. BOTÕES DE GESTÃO / EMERGÊNCIA */}
        <div className="space-y-1 pt-0.5">
          {/* FECHAR TUDO */}
          <button
            type="button"
            onClick={onClosePosition}
            disabled={!isPositionOpen}
            className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-40 active:scale-95 text-slate-950 font-black py-1.5 px-2 rounded-lg text-[10px] transition flex items-center justify-center gap-1 shadow uppercase tracking-wider cursor-pointer"
          >
            <span>FECHAR TUDO</span>
          </button>

          {/* INVERTER & BREAKEVEN */}
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={onReversePosition}
              disabled={!isPositionOpen}
              className="bg-[#1e293b] hover:bg-slate-700 disabled:opacity-40 active:scale-95 text-slate-200 font-bold py-1 px-1.5 rounded-lg text-[9px] transition flex items-center justify-center gap-1 border border-slate-700 shadow-sm cursor-pointer"
            >
              <span>INVERTER</span>
            </button>
            <button
              type="button"
              onClick={onBreakevenPosition || (() => {})}
              disabled={!isPositionOpen}
              className="bg-blue-900/60 hover:bg-blue-800 disabled:opacity-40 active:scale-95 text-blue-200 font-bold py-1 px-1.5 rounded-lg text-[9px] transition flex items-center justify-center gap-1 border border-blue-700/80 shadow-sm cursor-pointer"
            >
              <span>BREAKEVEN</span>
            </button>
          </div>

          {/* ORDENS ATIVAS (AGRUPADAS POR ATIVO COM PNL E ENCERRAMENTO) */}
          <div className="w-full bg-[#0d1424] text-slate-300 rounded border border-slate-800/80 font-mono overflow-hidden">
            <div className="font-extrabold py-1 px-2 text-[10px] text-center uppercase tracking-wider">
              ORDENS ATIVAS ({openOrdersCount})
            </div>
            {openOrdersCount > 0 && (
              <div className="border-t border-slate-800 divide-y divide-slate-800/70">
                <div className="flex items-center justify-between px-2 py-1 text-[9.5px] hover:bg-slate-800/40 transition">
                  <div className="flex items-center gap-1.5 min-w-0 truncate">
                    <span className="font-black text-slate-100 truncate">{(selectedAsset || 'ATIVO').toUpperCase()}</span>
                    <span className="text-slate-400 font-bold whitespace-nowrap">
                      {openOrdersCount} {openOrdersCount === 1 ? 'ordem' : 'ordens'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`font-black ${pnlUSD >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {pnlUSD >= 0 ? '+' : ''}${pnlUSD.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={onClosePosition}
                      title={`Encerrar todas as operações de ${selectedAsset}`}
                      className="w-4 h-4 rounded bg-rose-950/80 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-700/60 flex items-center justify-center text-[9px] font-black transition cursor-pointer active:scale-95"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Gestão de ATMs */}
      <ATMStrategyModal
        isOpen={isATMModalOpen}
        onClose={() => {
          setIsATMModalOpen(false);
          fetchAtmStrategiesSupabase().then(list => {
            if (list && list.length > 0) setAtmList(list);
          }).catch(() => {});
        }}
        onSelectATM={(atm) => {
          setActiveATM(atm);
          setIsATMActive(true);
        }}
        currentATM={activeATM}
      />
    </div>
  );
};
