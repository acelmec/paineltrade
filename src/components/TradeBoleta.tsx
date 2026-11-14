import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { PRESET_ATM_STRATEGIES, type ATMStrategy, type ATMBracket } from '../utils/atmRegistry';
import { ATMStrategyModal } from './ATMStrategyModal';
import { getAccountManualStrategyId, updateStrategyReportLevelsSupabase, updateStrategyReportStatusSupabase, isNinjaExecutionAccount, mirrorToLocalServer, resolveAccountExecutionSymbol, resolvePanelTickSize, resolvePanelPointValue, isSameAsset, roundToTick, fetchAtmStrategiesSupabase } from '../services/db';
import { resolveLevelPrice, calculateRangeHlLevels } from '../utils/levelPriceResolver';
import { checkNinjaStatus, fetchNinjaPositionsAndOrders } from '../services/ninjaGateway';
import { useIsMobile } from '../utils/platform';

interface TradeBoletaProps {
  selectedAsset: string;
  currentPrice: number;
  candles?: any[];
  targetPanel?: any;
  targetMarketData?: any;
  targetGammaLevels?: any;
  isFloating?: boolean;
  onToggleFloating?: () => void;
  onClose?: () => void;
  onDragStart?: (e: React.MouseEvent | React.TouchEvent) => void;
}

export const TradeBoleta: React.FC<TradeBoletaProps> = ({
  selectedAsset,
  currentPrice,
  candles: candlesProp,
  targetPanel,
  targetMarketData,
  targetGammaLevels,
  isFloating = false,
  onToggleFloating,
  onClose,
  onDragStart
}) => {
  const {
    candles,
    activePosition,
    marketData,
    createReportAction,
    updateReportAction,
    activeAccount,
    accounts,
    switchAccount,
    panels,
    activePanel,
    settings,
    allSettings,
    saveSettings,
    reports,
    runManualAIAnalysis,
    gammaLevels,
    setReports,
    updateReportLevelsAction,
    checkOperationalLimits,
    getPanelPrice
  } = useApp() as any;

  const isMobile = useIsMobile();

  const effectivePanel = targetPanel || (panels || []).find((p: any) => p.name === selectedAsset || p.symbol === selectedAsset) || activePanel;
  const effectiveSettings = (effectivePanel?.id && allSettings?.[effectivePanel.id]) ? allSettings[effectivePanel.id] : settings;
  const effectiveMarketData = targetMarketData || marketData;
  const effectiveGammaLevels = targetGammaLevels || gammaLevels;

  const activeChartCandles = typeof window !== 'undefined' && Array.isArray((window as any).__vortex_active_chart_candles) && (window as any).__vortex_active_chart_candles.length > 0
    ? (window as any).__vortex_active_chart_candles
    : null;
  const effectiveCandles = (candlesProp && candlesProp.length > 0) ? candlesProp : (activeChartCandles || candles || []);

  const rawMarketPrice = (effectiveMarketData && effectiveMarketData.price && effectiveMarketData.price !== '--')
    ? parseFloat(String(effectiveMarketData.price).replace(/[^\d.-]/g, ''))
    : null;
  const livePrice = (currentPrice && !isNaN(currentPrice) && currentPrice > 0)
    ? currentPrice
    : ((rawMarketPrice && !isNaN(rawMarketPrice) && rawMarketPrice > 0) ? rawMarketPrice : 0);

  const tickSize = resolvePanelTickSize(effectivePanel, effectiveSettings);

  // Tabs: LOTE vs FINANCEIRO (derivado diretamente de sizingMode para evitar dessincronia)

  const [ninjaStatus, setNinjaStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const isNinjaAccount = isNinjaExecutionAccount(activeAccount);
  const [activeNinjaPosition, setActiveNinjaPosition] = useState<any | null>(null);
  const [ninjaPositions, setNinjaPositions] = useState<any[]>([]);

  // Total de contas do painel sincronizadas com o NinjaTrader
  const panelNinjaAccounts = (accounts || []).filter((a: any) => isNinjaExecutionAccount(a));
  const syncedNinjaAccountsCount = panelNinjaAccounts.length;

  // A Boleta opera EXCLUSIVAMENTE com Contas Demo Axion
  const boletaAccounts = (accounts || []).filter((acc: any) =>
    acc.platform !== 'nt8' && !acc.send_localhost && !isNinjaExecutionAccount(acc)
  );

  // Garante que a boleta selecione sempre uma Conta Demo válida
  useEffect(() => {
    if (boletaAccounts.length > 0) {
      const isCurrentValid = boletaAccounts.some((a: any) => a.id === activeAccount?.id);
      if (!isCurrentValid && switchAccount) {
        switchAccount(boletaAccounts[0]);
      }
    }
  }, [activeAccount?.id, boletaAccounts.length]);

  useEffect(() => {
    let isMounted = true;
    let offlineStreak = 0;
    const checkNinja = async () => {
      try {
        const res = await checkNinjaStatus();
        if (!isMounted) return;
        setNinjaStatus(res.status);
        if (res.status === 'online') {
          offlineStreak = 0;
          try {
            const posData = await fetchNinjaPositionsAndOrders();
            if (isMounted) {
              const accPositions = (posData.positions || []).filter((p: any) =>
                p.account?.trim().toLowerCase() === activeAccount?.account_name?.trim().toLowerCase()
              );
              setNinjaPositions(accPositions);

              const currentAsset = effectivePanel?.name || selectedAsset || 'NQ';
              const myPos = accPositions.find((p: any) =>
                isSameAsset(p.symbol, currentAsset) &&
                (p.marketPosition === 'BUY' || p.marketPosition === 'SELL') &&
                Number(p.quantity) > 0
              );
              setActiveNinjaPosition(myPos || null);
            }
          } catch {
            offlineStreak += 1;
            if (isMounted && offlineStreak >= 3) {
              setNinjaPositions([]);
              setActiveNinjaPosition(null);
            }
          }
        } else {
          offlineStreak += 1;
          if (offlineStreak >= 3) {
            setNinjaPositions([]);
            setActiveNinjaPosition(null);
          }
        }
      } catch {
        offlineStreak += 1;
        if (isMounted) {
          setNinjaStatus('offline');
          if (offlineStreak >= 3) {
            setNinjaPositions([]);
            setActiveNinjaPosition(null);
          }
        }
      }
    };

    if (isNinjaAccount) {
      checkNinja();
      const timer = setInterval(checkNinja, 2000);
      return () => {
        isMounted = false;
        clearInterval(timer);
      };
    } else {
      setNinjaPositions([]);
      setActiveNinjaPosition(null);
    }
  }, [isNinjaAccount, activeAccount?.id, activeAccount?.account_name, effectivePanel?.name, selectedAsset]);

  const [, setReportsUpdateTick] = useState<number>(0);
  useEffect(() => {
    const handleReportsUpdated = () => {
      setReportsUpdateTick(t => t + 1);
      setIsSubmitting(false);
    };
    window.addEventListener('vortex_reports_updated', handleReportsUpdated);
    return () => window.removeEventListener('vortex_reports_updated', handleReportsUpdated);
  }, []);

  // Libera imediatamente qualquer lock de submissão ao trocar de ativo ou painel
  useEffect(() => {
    setIsSubmitting(false);
  }, [effectivePanel?.id, selectedAsset]);

  // Sizing Mode State (LOTE vs FINANCEIRO)
  const [sizingMode, setSizingMode] = useState<'lote' | 'risco'>(() => {
    try {
      const saved = localStorage.getItem('vortex_sizing_mode');
      if (saved === 'lote' || saved === 'risco') return saved;
    } catch {}
    return settings?.chart_manual_sizing_mode === 'risco' ? 'risco' : 'lote';
  });
  const activeTab: 'trade' | 'risk' = sizingMode === 'risco' ? 'risk' : 'trade';
  const lastLocalSizingModeChangeRef = useRef<number>(0);
  const lastLocalStopModeChangeRef = useRef<number>(0);

  const [contracts, setContracts] = useState<number>(
    settings?.chart_manual_contracts !== undefined ? Number(settings.chart_manual_contracts) : 2
  );
  const [riskUsd, setRiskUsd] = useState<number>(
    settings?.chart_manual_risk_usd !== undefined ? Number(settings.chart_manual_risk_usd) : 250
  );

  // Stop Mode State (PONTOS vs NÍVEL vs GRÁFICO vs COPILOT vs RANGE HL)
  // Padrão obrigatório ao abrir o gráfico: sempre iniciar em 'pontos' (P)
  const [stopMode, setStopMode] = useState<'pontos' | 'nivel' | 'grafico' | 'copilot' | 'range'>(() => {
    try {
      localStorage.setItem('vortex_stop_mode', 'pontos');
    } catch {}
    return 'pontos';
  });

  // Range HL Mode (R) State: Referência de Candles e Multiplicador de TP
  const [rangeCandleRef, setRangeCandleRef] = useState<number>(() => {
    const saved = localStorage.getItem('vortex_range_candle_ref');
    return saved !== null ? Number(saved) : (settings?.chart_manual_range_candle_ref !== undefined ? Number(settings.chart_manual_range_candle_ref) : 1);
  });
  const [rangeTpMultiplier, setRangeTpMultiplier] = useState<number>(() => {
    const saved = localStorage.getItem('vortex_range_tp_multiplier');
    return saved !== null ? Number(saved) : (settings?.chart_manual_range_tp_multiplier !== undefined ? Number(settings.chart_manual_range_tp_multiplier) : 1.0);
  });

  const updateRangeCandleRef = (val: number) => {
    const clamped = Math.max(0, val);
    setRangeCandleRef(clamped);
    localStorage.setItem('vortex_range_candle_ref', String(clamped));
    if (saveSettings) saveSettings({ chart_manual_range_candle_ref: clamped });
    window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
  };

  const updateRangeTpMultiplier = (val: number) => {
    const clamped = Math.max(0.1, Number(val.toFixed(2)));
    setRangeTpMultiplier(clamped);
    localStorage.setItem('vortex_range_tp_multiplier', String(clamped));
    if (saveSettings) saveSettings({ chart_manual_range_tp_multiplier: clamped });
    window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
  };

  const [rangeSide, setRangeSide] = useState<'COMPRA' | 'VENDA' | 'AMBOS'>(() => {
    const saved = localStorage.getItem('vortex_range_side');
    return (saved === 'COMPRA' || saved === 'VENDA' || saved === 'AMBOS') ? saved : 'COMPRA';
  });

  const updateRangeSide = (val: 'COMPRA' | 'VENDA' | 'AMBOS') => {
    setRangeSide(val);
    localStorage.setItem('vortex_range_side', val);
    window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
  };

  const [nivelSide, setNivelSide] = useState<'COMPRA' | 'VENDA' | 'AMBOS'>(() => {
    const saved = localStorage.getItem('vortex_nivel_side');
    return (saved === 'COMPRA' || saved === 'VENDA' || saved === 'AMBOS') ? saved : 'AMBOS';
  });

  const updateNivelSide = (val: 'COMPRA' | 'VENDA' | 'AMBOS') => {
    setNivelSide(val);
    localStorage.setItem('vortex_nivel_side', val);
    window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
  };

  useEffect(() => {
    localStorage.setItem('vortex_stop_mode', stopMode);
  }, [stopMode]);

  useEffect(() => {
    localStorage.setItem('vortex_sizing_mode', sizingMode);
  }, [sizingMode]);

  useEffect(() => {
    if (Date.now() - lastLocalSizingModeChangeRef.current < 8000) return;
    if (settings?.chart_manual_sizing_mode && settings.chart_manual_sizing_mode !== sizingMode) {
      setSizingMode(settings.chart_manual_sizing_mode === 'risco' ? 'risco' : 'lote');
    }
  }, [settings?.chart_manual_sizing_mode]);
  const [slPoints, setSlPoints] = useState<number>(
    effectiveSettings?.chart_manual_sl_points !== undefined
      ? Number(effectiveSettings.chart_manual_sl_points)
      : (effectivePanel?.default_sl_points !== undefined ? Number(effectivePanel.default_sl_points) : 50)
  );
  const [tpPoints, setTpPoints] = useState<number>(
    effectiveSettings?.chart_manual_tp_points !== undefined
      ? Number(effectiveSettings.chart_manual_tp_points)
      : (effectivePanel?.default_tp_points !== undefined ? Number(effectivePanel.default_tp_points) : 50)
  );

  useEffect(() => {
    if (effectiveSettings?.chart_manual_sl_points !== undefined) {
      setSlPoints(Number(effectiveSettings.chart_manual_sl_points));
    } else if (effectivePanel?.default_sl_points !== undefined) {
      setSlPoints(Number(effectivePanel.default_sl_points));
    }
    if (effectiveSettings?.chart_manual_tp_points !== undefined) {
      setTpPoints(Number(effectiveSettings.chart_manual_tp_points));
    } else if (effectivePanel?.default_tp_points !== undefined) {
      setTpPoints(Number(effectivePanel.default_tp_points));
    }
  }, [effectivePanel?.id, effectiveSettings?.chart_manual_sl_points, effectiveSettings?.chart_manual_tp_points]);

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

  // Listener para capturar pensamentos e recomendações da IA do Copilot
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
          setCopilotSlPrice(roundToTick(parsedSl, tickSize));
          setCopilotLoadedFromAi(true);
        }
      }

      if (alvo && alvo !== '--') {
        const parsedTp = parsePrice(alvo);
        if (parsedTp && !isNaN(parsedTp) && parsedTp > 0) {
          setCopilotTpPrice(roundToTick(parsedTp, tickSize));
          setCopilotLoadedFromAi(true);
        }
      }

      if (gatilho && gatilho !== '--') {
        setCopilotGatilho(gatilho);
      }
    };

    window.addEventListener('vortex_copilot_thought', handleCopilotEvent);
    return () => window.removeEventListener('vortex_copilot_thought', handleCopilotEvent);
  }, [tickSize]);

  const [customSlPrice, setCustomSlPrice] = useState<number | null>(() => {
    const val = localStorage.getItem('vortex_custom_sl_price');
    return val ? Number(val) : null;
  });
  const [customTpPrice, setCustomTpPrice] = useState<number | null>(() => {
    const val = localStorage.getItem('vortex_custom_tp_price');
    return val ? Number(val) : null;
  });

  useEffect(() => {
    const handleCustomSlTpUpdate = (e: any) => {
      if (e?.detail) {
        setCustomSlPrice(e.detail.sl);
        setCustomTpPrice(e.detail.tp);
      }
      const savedMode = localStorage.getItem('vortex_stop_mode');
      if (savedMode && (savedMode === 'pontos' || savedMode === 'nivel' || savedMode === 'grafico' || savedMode === 'copilot' || savedMode === 'range')) {
        setStopMode(savedMode as any);
      }
      const savedRef = localStorage.getItem('vortex_range_candle_ref');
      if (savedRef !== null && !isNaN(Number(savedRef))) {
        setRangeCandleRef(Number(savedRef));
      }
      const savedMult = localStorage.getItem('vortex_range_tp_multiplier');
      if (savedMult !== null && !isNaN(Number(savedMult))) {
        setRangeTpMultiplier(Number(savedMult));
      }
      const savedSide = localStorage.getItem('vortex_range_side');
      if (savedSide === 'COMPRA' || savedSide === 'VENDA' || savedSide === 'AMBOS') {
        setRangeSide(savedSide);
      }
    };
    window.addEventListener('vortex_custom_sltp_updated', handleCustomSlTpUpdate);
    return () => window.removeEventListener('vortex_custom_sltp_updated', handleCustomSlTpUpdate);
  }, []);

  const handleClearCustomMarkers = () => {
    localStorage.removeItem('vortex_custom_sl_price');
    localStorage.removeItem('vortex_custom_tp_price');
    localStorage.removeItem('vortex_custom_sltp_panel_id');
    setCustomSlPrice(null);
    setCustomTpPrice(null);
    window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated', { detail: { sl: null, tp: null } }));
  };

  const updateContractsSetting = (val: number) => {
    setContracts(val);
    try { localStorage.setItem('vortex_manual_contracts', String(val)); } catch {}
    if (saveSettings) saveSettings({ chart_manual_contracts: val });
    window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
  };

  const updateRiskUsdSetting = (val: number) => {
    setRiskUsd(val);
    try { localStorage.setItem('vortex_manual_risk_usd', String(val)); } catch {}
    if (saveSettings) saveSettings({ chart_manual_risk_usd: val });
    window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
  };

  const updateSlPointsSetting = (val: number) => {
    setSlPoints(val);
    if (saveSettings) saveSettings({ chart_manual_sl_points: val }, effectivePanel?.id);
  };

  const updateTpPointsSetting = (val: number) => {
    setTpPoints(val);
    if (saveSettings) saveSettings({ chart_manual_tp_points: val }, effectivePanel?.id);
  };

  // ATM Strategy State & Activation Toggle
  const [isATMActive, setIsATMActive] = useState<boolean>(() => {
    return localStorage.getItem('vortex_atm_active') === 'true';
  });
  const [activeATM, setActiveATM] = useState<ATMStrategy>(() => {
    const saved = localStorage.getItem('vortex_active_atm');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return PRESET_ATM_STRATEGIES[0];
  });
  const [atmList, setAtmList] = useState<ATMStrategy[]>(PRESET_ATM_STRATEGIES);
  const [isATMModalOpen, setIsATMModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Modo Compacto / Simplificado quando flutuante (Alternado por duplo clique no cabeçalho)
  const [isCompact, setIsCompact] = useState<boolean>(() => {
    try {
      return localStorage.getItem('vortex_boleta_compact') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCompact = () => {
    setIsCompact(prev => {
      const next = !prev;
      try {
        localStorage.setItem('vortex_boleta_compact', String(next));
      } catch {}
      return next;
    });
  };

  const refreshAtmList = async () => {
    try {
      const list = await fetchAtmStrategiesSupabase();
      if (list && list.length > 0) {
        setAtmList(list);
      }
    } catch {}
  };

  useEffect(() => {
    refreshAtmList();
  }, []);

  useEffect(() => {
    localStorage.setItem('vortex_active_atm', JSON.stringify(activeATM));
  }, [activeATM]);

  useEffect(() => {
    localStorage.setItem('vortex_atm_active', String(isATMActive));
  }, [isATMActive]);

  // Point Value configured in the active panel (e.g. 2.00 USD/pt for NASDAQ / MNQ)
  const pointValue = effectivePanel?.point_value !== undefined && effectivePanel?.point_value !== null
    ? Number(effectivePanel.point_value)
    : 2.0;

  // Effective SL points calculation based on active Gestão System (ATM, Gráfico, Copilot, Range HL, Nível, Pontos)
  const referencePrice = livePrice;

  const activeCandleRef = typeof window !== 'undefined' ? Number(localStorage.getItem('vortex_range_candle_ref') ?? rangeCandleRef) : rangeCandleRef;
  const activeTpMult = typeof window !== 'undefined' ? Number(localStorage.getItem('vortex_range_tp_multiplier') ?? rangeTpMultiplier) : rangeTpMultiplier;

  // Previsões de Range HL em tempo real
  const rangeBuyPreview = calculateRangeHlLevels('COMPRA', referencePrice, effectiveCandles, activeCandleRef, activeTpMult, tickSize);
  const rangeSellPreview = calculateRangeHlLevels('VENDA', referencePrice, effectiveCandles, activeCandleRef, activeTpMult, tickSize);

  // Previsões de Nível Técnico / Gamma em tempo real
  const nivelBuySl = roundToTick(resolveLevelPrice('COMPRA', 'SL', referencePrice, effectiveGammaLevels, slPoints, tpPoints), tickSize);
  const nivelBuyTp = roundToTick(resolveLevelPrice('COMPRA', 'TP', referencePrice, effectiveGammaLevels, slPoints, tpPoints), tickSize);
  const nivelBuySlPts = Math.abs(referencePrice - nivelBuySl);
  const nivelBuyTpPts = Math.abs(nivelBuyTp - referencePrice);

  const nivelSellSl = roundToTick(resolveLevelPrice('VENDA', 'SL', referencePrice, effectiveGammaLevels, slPoints, tpPoints), tickSize);
  const nivelSellTp = roundToTick(resolveLevelPrice('VENDA', 'TP', referencePrice, effectiveGammaLevels, slPoints, tpPoints), tickSize);
  const nivelSellSlPts = Math.abs(nivelSellSl - referencePrice);
  const nivelSellTpPts = Math.abs(referencePrice - nivelSellTp);

  let calculatedSlPts = slPoints > 0 ? slPoints : 20;

  if (isATMActive) {
    const firstBracket = activeATM?.brackets?.[0];
    if (firstBracket && firstBracket.stopLossPts > 0) {
      const isTicks = activeATM?.unit === 'ticks';
      calculatedSlPts = isTicks ? (firstBracket.stopLossPts * tickSize) : firstBracket.stopLossPts;
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
    const effectiveNivelPts = nivelSide === 'VENDA' ? nivelSellSlPts : nivelBuySlPts;
    calculatedSlPts = effectiveNivelPts > 0 ? effectiveNivelPts : (slPoints > 0 ? slPoints : 20);
  } else {
    // Modo Pontos (P)
    calculatedSlPts = slPoints > 0 ? slPoints : 20;
  }

  // Garante valor positivo mínimo (ao menos tickSize ou 1 ponto) para evitar divisão por zero
  calculatedSlPts = Math.max(tickSize > 0 ? tickSize : 1, calculatedSlPts);

  // Calculate effective contract sizing
  const calculatedRiskContracts = Math.max(1, Math.floor((riskUsd || 250) / ((calculatedSlPts || 50) * pointValue)));
  const totalATMContracts = (activeATM?.brackets || []).reduce((acc, b) => acc + (Number(b.quantity) || 1), 0);
  
  // Regra Inviolável:
  // a) ATM ATIVA: contratos e metas seguem rigorosamente a configuração dos brackets da ATM
  // b) ATM DESLIGADA: contratos seguem o seletor da boleta (ou sizing por risco em $)
  const effectiveContracts = sizingMode === 'risco'
    ? calculatedRiskContracts
    : (isATMActive ? (totalATMContracts > 0 ? totalATMContracts : 1) : Math.max(1, Number(contracts) || 1));

  const resolveReportMatchedPanel = (r: any) => {
    if (!r) return null;
    let matched = (panels || []).find((p: any) =>
      (r.panel_id && p.id === r.panel_id) ||
      (r.instance_id && p.instance_id === r.instance_id)
    );
    if (!matched && r.description) {
      const match = r.description.match(/\[(.*?)\]/);
      if (match && match[1]) {
        const cleanName = match[1].toLowerCase().replace(/[^a-z0-9]/g, '');
        matched = (panels || []).find((p: any) =>
          (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === cleanName ||
          (p.instance_id || '').toLowerCase().replace(/[^a-z0-9]/g, '') === cleanName
        );
      }
    }
    if (!matched && r.symbol) {
      const cleanSym = String(r.symbol).toLowerCase().replace(/[^a-z0-9]/g, '');
      matched = (panels || []).find((p: any) =>
        (p.symbol || '').toLowerCase().replace(/[^a-z0-9]/g, '') === cleanSym ||
        (p.gamma_symbol || '').toLowerCase().replace(/[^a-z0-9]/g, '') === cleanSym ||
        (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanSym) ||
        isSameAsset(p.symbol || p.name, r.symbol)
      );
    }
    return matched || null;
  };

  const resolveReportAssetLabel = (r: any): string => {
    const matchedPanel = resolveReportMatchedPanel(r);
    if (matchedPanel?.name) return String(matchedPanel.name).toUpperCase();
    if (r?.description) {
      const match = r.description.match(/\[(.*?)\]/);
      if (match && match[1]) return String(match[1]).toUpperCase();
    }
    if (r?.symbol && r.symbol !== '--') {
      const s = String(r.symbol).toUpperCase();
      if (s.includes('NQ') || s.includes('NAS')) return 'NASDAQ';
      if (s.includes('GC') || s.includes('GOLD') || s.includes('OURO')) return 'GOLD';
      if (s.includes('ES') || s.includes('SP')) return 'S&P 500';
      if (s.includes('CL') || s.includes('OIL')) return 'OIL';
      return s;
    }
    return String(effectivePanel?.name || selectedAsset || 'ATIVO').toUpperCase();
  };

  const isReportForThisAsset = (r: any) => {
    if (!r) return false;
    const targetSymbol = effectivePanel?.name || selectedAsset || 'NQ';
    const targetPanelId = effectivePanel?.id || null;

    // 1. O símbolo tem prioridade absoluta: se o relatório possui ativo definido e não bate com targetSymbol, descarta imediatamente
    if (r.symbol && !isSameAsset(r.symbol, targetSymbol)) return false;

    // 2. Se a descrição possui tag [SÍMBOLO] e não bate, descarta
    if (r.description) {
      const match = r.description.match(/\[(.*?)\]/);
      if (match && match[1] && !isSameAsset(match[1], targetSymbol)) return false;
    }

    // 3. Casamento exato por ID do painel
    if (targetPanelId && r.panel_id === targetPanelId) return true;

    // 4. Casamento por tag de descrição
    if (r.description && r.description.includes(`[${targetSymbol}]`)) return true;

    // 5. Casamento pelo símbolo normalizado
    if (r.symbol && isSameAsset(r.symbol, targetSymbol)) return true;

    // 6. Fallback exclusivamente se o relatório não tiver símbolo registrado
    if (!r.symbol && !effectivePanel && (!r.panel_id || r.instance_id === 'painel_principal')) return true;

    return false;
  };

  const resolveReportLivePrice = (r: any): number => {
    if (isReportForThisAsset(r) && livePrice > 0) return livePrice;
    const matchedPanel = resolveReportMatchedPanel(r);
    if (typeof getPanelPrice === 'function') {
      const pPrice = getPanelPrice(r?.panel_id || matchedPanel?.id, r?.symbol || matchedPanel?.symbol || matchedPanel?.name);
      if (pPrice && !isNaN(pPrice) && pPrice > 0) return Number(pPrice);
    }
    if (isReportForThisAsset(r) && currentPrice > 0) return currentPrice;
    return Number(r?.entry_price || 0);
  };

  const resolveReportMetrics = (r: any) => {
    const entry = Number(r?.entry_price || 0);
    const qty = Math.max(1, Number(r?.contrato || r?.quantity || 1));
    const curPrice = resolveReportLivePrice(r);
    const matchedPanel = resolveReportMatchedPanel(r) || (isReportForThisAsset(r) ? effectivePanel : null);
    const panelSettings = matchedPanel ? allSettings?.[matchedPanel.id] : effectiveSettings;
    const ptVal = matchedPanel
      ? resolvePanelPointValue(matchedPanel, panelSettings || effectiveSettings)
      : pointValue;
    const pts = (curPrice > 0 && entry > 0 && r?.status === 'Em Andamento')
      ? (r.side === 'COMPRA' ? (curPrice - entry) : (entry - curPrice))
      : 0;
    const pnl = pts * qty * ptVal;
    return { entry, qty, curPrice, ptVal, pts, pnl };
  };

  // Find active live reports for current account and current panel/asset
  const activeReportsList = (reports || []).filter((r: any) =>
    (r.status === 'Em Andamento' || (r.status as any) === 'Pendente') &&
    r.strategy_name !== 'Execução NT8' &&
    (!activeAccount || !r.account_id || r.account_id === activeAccount.id) &&
    isReportForThisAsset(r)
  );

  // All active live reports for the selected account across ALL assets (including multi-bracket ATM & other panels)
  const allAccountActiveReports = (reports || []).filter((r: any) =>
    (r.status === 'Em Andamento' || (r.status as any) === 'Pendente') &&
    r.strategy_name !== 'Execução NT8' &&
    (!activeAccount || !r.account_id || r.account_id === activeAccount.id)
  );

  const inProgressAccountReports = allAccountActiveReports.filter((r: any) => r.status === 'Em Andamento');

  const activeReport = activeReportsList[0] || null;

  // Sum contracts, points, and PnL across ALL open positions of the account (ATM brackets + all assets)
  const totalOpenContracts = inProgressAccountReports.reduce(
    (sum: number, r: any) => sum + Math.max(1, Number(r.contrato || r.quantity || 1)),
    0
  );
  const netOpenContracts = inProgressAccountReports.reduce(
    (sum: number, r: any) => {
      const q = Math.max(1, Number(r.contrato || r.quantity || 1));
      return sum + (r.side === 'COMPRA' ? q : -q);
    },
    0
  );

  // Position calculation (Supports real NinjaTrader position, simulator activePosition, or all live account reports)
  const posQty = isNinjaAccount && activeNinjaPosition
    ? (activeNinjaPosition.marketPosition === 'BUY' ? activeNinjaPosition.quantity : -activeNinjaPosition.quantity)
    : (activePosition?.quantity !== undefined && activePosition?.quantity !== 0
        ? activePosition.quantity
        : (totalOpenContracts > 0
            ? (netOpenContracts !== 0 ? netOpenContracts : (inProgressAccountReports[0]?.side === 'COMPRA' ? totalOpenContracts : -totalOpenContracts))
            : 0));

  const totalDisplayContracts = isNinjaAccount && activeNinjaPosition
    ? Math.abs(Number(activeNinjaPosition.quantity || 0))
    : (activePosition?.quantity !== undefined && activePosition?.quantity !== 0
        ? Math.abs(Number(activePosition.quantity))
        : totalOpenContracts);

  const avgPrice = isNinjaAccount && activeNinjaPosition
    ? Number(activeNinjaPosition.averagePrice || 0)
    : (activePosition?.avgPrice !== undefined && activePosition?.avgPrice !== 0
        ? activePosition.avgPrice
        : (activeReport ? Number(activeReport.entry_price || 0) : 0));

  const isLong = posQty > 0;
  const isShort = posQty < 0;

  // Lock manual entry on the current asset if this asset already has an open position (or if account blocks multi-signals across assets)
  const currentAsset = effectivePanel?.name || selectedAsset || 'NQ';
  const allowMulti = activeAccount?.allow_multi_signals !== false;

  const hasAssetNinjaPosition = Boolean(
    isNinjaAccount && activeNinjaPosition &&
    (activeNinjaPosition.marketPosition === 'BUY' || activeNinjaPosition.marketPosition === 'SELL') &&
    Number(activeNinjaPosition.quantity) > 0
  );

  const hasAssetSimPosition = Boolean(
    activePosition?.quantity !== undefined &&
    activePosition.quantity !== 0 &&
    (!activePosition.symbol || isSameAsset(activePosition.symbol, currentAsset))
  );

  const hasAssetReportPosition = activeReportsList.length > 0;

  const hasThisAssetPosition = Boolean(hasAssetNinjaPosition || hasAssetReportPosition || hasAssetSimPosition);

  const hasAnyNinjaPosition = Boolean(
    isNinjaAccount && ninjaPositions.some((p: any) =>
      (p.marketPosition === 'BUY' || p.marketPosition === 'SELL') && Number(p.quantity) > 0
    )
  );
  const hasAnyReportPosition = allAccountActiveReports.length > 0;
  const hasAnySimPosition = Boolean(activePosition?.quantity !== undefined && activePosition.quantity !== 0);
  const hasAnyAccountPosition = Boolean(hasAnyNinjaPosition || hasAnyReportPosition || hasAnySimPosition);

  // Se allow_multi_signals === false, qualquer operação aberta na conta bloqueia novas ordens em todos os ativos.
  // Se allow_multi_signals !== false (padrão), o bloqueio ocorre APENAS para o ativo com operação aberta!
  // Ao trocar para outro ativo sem operação, os botões COMPRA e VENDA ficam imediatamente habilitados.
  const hasOpenPosition = !allowMulti ? hasAnyAccountPosition : hasThisAssetPosition;

  // 🛡️ Guard de liveness da Boleta: se não houver operações abertas, isSubmitting NUNCA pode ficar travado em true
  useEffect(() => {
    if (!hasOpenPosition && isSubmitting) {
      const timer = setTimeout(() => setIsSubmitting(false), 200);
      return () => clearTimeout(timer);
    }
  }, [hasOpenPosition, isSubmitting]);

  const accountTotalMetrics = inProgressAccountReports.reduce(
    (acc: { pnl: number; pts: number }, r: any) => {
      const m = resolveReportMetrics(r);
      acc.pnl += m.pnl;
      acc.pts += m.pts;
      return acc;
    },
    { pnl: 0, pts: 0 }
  );

  const diffPts = inProgressAccountReports.length > 0
    ? accountTotalMetrics.pts
    : (isLong ? livePrice - avgPrice : isShort ? avgPrice - livePrice : 0);

  const pnlUSD = isNinjaAccount && activeNinjaPosition && activeNinjaPosition.unrealizedPnL !== undefined
    ? Number(activeNinjaPosition.unrealizedPnL)
    : (inProgressAccountReports.length > 0
        ? accountTotalMetrics.pnl
        : (diffPts * Math.abs(posQty) * pointValue));

  // Group active orders by asset for the ORDENS ATIVAS card
  const activeOrdersByAsset = React.useMemo(() => {
    const groups = new Map<string, { asset: string; count: number; contracts: number; pnl: number; reports: any[] }>();
    allAccountActiveReports.forEach((r: any) => {
      const asset = resolveReportAssetLabel(r);
      const m = resolveReportMetrics(r);
      const existing = groups.get(asset) || { asset, count: 0, contracts: 0, pnl: 0, reports: [] };
      existing.count += 1;
      existing.contracts += m.qty;
      existing.pnl += m.pnl;
      existing.reports.push(r);
      groups.set(asset, existing);
    });
    return Array.from(groups.values());
  }, [allAccountActiveReports, livePrice, currentPrice, panels, effectivePanel, effectiveSettings, allSettings]);

  // Execute Market Order (+ ATM or Manual Gestão)
  const handleExecuteOrder = async (side: 'COMPRA' | 'VENDA', isReverse = false) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    // Watchdog de segurança: garante liberação do botão após no máximo 2.5s mesmo em falhas assíncronas
    const submitWatchdog = setTimeout(() => {
      setIsSubmitting(false);
    }, 2500);

    try {
      if (hasOpenPosition && !isReverse) {
        alert(`⚠️ Já existe uma operação em andamento para este ativo na conta selecionada.\n\nPara abrir uma nova posição, zere ou encerre a operação atual antes.`);
        return;
      }

      if (activeAccount && isNinjaAccount) {
        alert(`🔒 Operação Bloqueada no Painel:\n\nA conta "${activeAccount.account_name}" é uma conta sincronizada do NinjaTrader 8.\n\nPara operar na plataforma Web e replicar ordens aos seus NinjaTraders, utilize uma Conta Demo.\n\nContas NT8 operam exclusivamente via Copy Trading ou diretamente no NinjaTrader 8.`);
        return;
      }

      if (activeAccount && !isReverse) {
        if (activeAccount.manual_trading_enabled === false) {
          alert(`⚠️ Operações manuais desativadas para a conta '${activeAccount.account_name}'.`);
          return;
        }

        // 🛡️ Validação Completa de Risco da Conta (Stop Diário, Meta de Lucro, Max Drawdown, Max Trades, Posição no Mesmo Ativo e Múltiplos Sinais)
        if (checkOperationalLimits) {
          const opCheck = await checkOperationalLimits(effectivePanel?.id, undefined, activeAccount, true, isATMActive);
          if (!opCheck.allowed) {
            alert(`⚠️ Operação manual bloqueada pela Gestão de Risco:\n\n${opCheck.reason}`);
            return;
          }
        }

        const maxLots = activeAccount.manual_max_lots !== undefined ? activeAccount.manual_max_lots : 10;
        if (effectiveContracts > maxLots) {
          alert(`⚠️ Lote solicitado (${effectiveContracts}x) excede o lote máximo permitido para operações manuais nesta conta (${maxLots}x).`);
          return;
        }
      }

      const tickSize = resolvePanelTickSize(effectivePanel, effectiveSettings);
      const effectiveEntry = roundToTick(livePrice, tickSize);
      const initialStatus = 'Em Andamento';

      // Confirmation dialog if enabled
      if (settings?.chart_confirm_manual_trade !== false) {
        let slPrice = 0;
        let tpPrice = 0;
        let slPtsUsed = 0;
        let tpPtsUsed = 0;

        if (isATMActive) {
          const isTicks = activeATM.unit === 'ticks';
          const firstBracket = activeATM.brackets?.[0] || { stopLossPts: slPoints, takeProfitPts: tpPoints };
          slPtsUsed = isTicks ? (firstBracket.stopLossPts * tickSize) : firstBracket.stopLossPts;
          tpPtsUsed = isTicks ? (firstBracket.takeProfitPts * tickSize) : firstBracket.takeProfitPts;
          slPrice = roundToTick(side === 'COMPRA' ? effectiveEntry - slPtsUsed : effectiveEntry + slPtsUsed, tickSize);
          tpPrice = roundToTick(side === 'COMPRA' ? effectiveEntry + tpPtsUsed : effectiveEntry - tpPtsUsed, tickSize);
        } else if (stopMode === 'copilot' && (copilotSlPrice !== null || copilotTpPrice !== null)) {
          if (copilotSlPrice !== null && copilotSlPrice > 0) {
            slPrice = roundToTick(copilotSlPrice, tickSize);
          } else {
            const fallbackSlPts = slPoints > 0 ? slPoints : 20;
            slPrice = roundToTick(side === 'COMPRA' ? effectiveEntry - fallbackSlPts : effectiveEntry + fallbackSlPts, tickSize);
          }
          if (copilotTpPrice !== null && copilotTpPrice > 0) {
            tpPrice = roundToTick(copilotTpPrice, tickSize);
          } else {
            const fallbackTpPts = tpPoints > 0 ? tpPoints : 40;
            tpPrice = roundToTick(side === 'COMPRA' ? effectiveEntry + fallbackTpPts : effectiveEntry - fallbackTpPts, tickSize);
          }
          slPtsUsed = Math.abs(effectiveEntry - slPrice);
          tpPtsUsed = Math.abs(tpPrice - effectiveEntry);
        } else if (stopMode === 'grafico') {
          if (customSlPrice !== null && customSlPrice > 0) {
            slPrice = roundToTick(customSlPrice, tickSize);
          } else {
            const fallbackSlPts = slPoints > 0 ? slPoints : 20;
            slPrice = roundToTick(side === 'COMPRA' ? effectiveEntry - fallbackSlPts : effectiveEntry + fallbackSlPts, tickSize);
          }
          if (customTpPrice !== null && customTpPrice > 0) {
            tpPrice = roundToTick(customTpPrice, tickSize);
          } else {
            const fallbackTpPts = tpPoints > 0 ? tpPoints : 40;
            tpPrice = roundToTick(side === 'COMPRA' ? effectiveEntry + fallbackTpPts : effectiveEntry - fallbackTpPts, tickSize);
          }
          slPtsUsed = Math.abs(effectiveEntry - slPrice);
          tpPtsUsed = Math.abs(tpPrice - effectiveEntry);
        } else if (stopMode === 'range') {
          const activeCandleRef = typeof window !== 'undefined' ? Number(localStorage.getItem('vortex_range_candle_ref') ?? rangeCandleRef) : rangeCandleRef;
          const activeTpMult = typeof window !== 'undefined' ? Number(localStorage.getItem('vortex_range_tp_multiplier') ?? rangeTpMultiplier) : rangeTpMultiplier;
          const rangeRes = calculateRangeHlLevels(side, effectiveEntry, effectiveCandles, activeCandleRef, activeTpMult, tickSize);
          slPrice = rangeRes.slPrice;
          tpPrice = rangeRes.tpPrice;
          slPtsUsed = rangeRes.slPts;
          tpPtsUsed = rangeRes.tpPts;
        } else if (stopMode === 'pontos') {
          slPtsUsed = slPoints;
          tpPtsUsed = tpPoints;
          slPrice = roundToTick(side === 'COMPRA' ? effectiveEntry - slPoints : effectiveEntry + slPoints, tickSize);
          tpPrice = roundToTick(side === 'COMPRA' ? effectiveEntry + tpPoints : effectiveEntry - tpPoints, tickSize);
        } else {
          slPrice = roundToTick(resolveLevelPrice(side, 'SL', effectiveEntry, gammaLevels, slPoints, tpPoints), tickSize);
          tpPrice = roundToTick(resolveLevelPrice(side, 'TP', effectiveEntry, gammaLevels, slPoints, tpPoints), tickSize);
          slPtsUsed = Math.abs(effectiveEntry - slPrice);
          tpPtsUsed = Math.abs(tpPrice - effectiveEntry);
        }

        const riskEstimatedUsd = slPtsUsed * effectiveContracts * pointValue;
        const profitEstimatedUsd = tpPtsUsed * effectiveContracts * pointValue;

        const confirmMsg = `Confirmar Ordem A Mercado:\n` +
          `----------------------------------------\n` +
          `Direção: ${side}\n` +
          `Ativo: ${selectedAsset}\n` +
          `Preço Entrada: ${effectiveEntry.toFixed(2)}\n` +
          `Contratos: ${effectiveContracts}x\n` +
          `Gestão: ${isATMActive ? `ATM (${activeATM.name}${activeATM.unit === 'ticks' ? ' - Ticks' : ' - Pts'})` : `Manual (${stopMode === 'pontos' ? `${slPoints}pt SL / ${tpPoints}pt TP` : stopMode === 'grafico' ? `Gráfico Marcado` : stopMode === 'copilot' ? `Copilot IA` : stopMode === 'range' ? `Range HL (Ref: ${rangeCandleRef === 0 ? 'Só Atual' : `Atual+${rangeCandleRef}`} / TP: ${rangeTpMultiplier}x)` : `Níveis Estruturais`})`}\n` +
          `----------------------------------------\n` +
          `🛑 Stop Loss: ${slPrice.toFixed(2)} (${slPtsUsed.toFixed(2)} pts) ➔ Risco: -$${riskEstimatedUsd.toFixed(2)}\n` +
          `🎯 Take Profit: ${tpPrice.toFixed(2)} (${tpPtsUsed.toFixed(2)} pts) ➔ Alvo: +$${profitEstimatedUsd.toFixed(2)}`;
        if (!window.confirm(confirmMsg)) {
          return;
        }
      }

      // AI Validation if enabled
      if (settings?.chart_manual_ia_validate) {
        try {
          const aiRes = await runManualAIAnalysis();
          if (!aiRes || !aiRes.success || aiRes.sinal !== side) {
            const reason = aiRes?.resumo || 'A IA não identificou confluência técnica para o sinal solicitado.';
            const detectedSignal = aiRes?.sinal || 'AGUARDANDO';
            alert(`❌ Operação Cancelada (IA Não Validou):\n` +
              `----------------------------------------\n` +
              `Direção Solicitada: ${side}\n` +
              `Sinal Detectado pela IA: ${detectedSignal}\n` +
              `Motivo: ${reason}`);
            return;
          }
        } catch (error: any) {
          console.error('[IA VALIDATE] Erro ao validar:', error);
          alert(`❌ Erro ao validar operação com a IA: ${error.message || error}`);
          return;
        }
      }

      const manualStratId = getAccountManualStrategyId(activeAccount);

      if (isATMActive) {
        // ATM Strategy with Brackets
        const bracketsToUse: ATMBracket[] = activeATM.brackets && activeATM.brackets.length > 0
          ? activeATM.brackets
          : [{
              id: 'b-1',
              quantity: effectiveContracts,
              stopLossPts: slPoints,
              takeProfitPts: tpPoints,
              autoBreakevenEnabled: false,
              autoBreakevenTriggerPts: 0,
              autoBreakevenOffsetPts: 0,
              trailingStopEnabled: false,
              trailingStopTriggerPts: 0,
              trailingStopStepPts: 0
            }];

        const isTicks = activeATM.unit === 'ticks';

        for (let idx = 0; idx < bracketsToUse.length; idx++) {
          const bracket = bracketsToUse[idx];
          const actualSlPts = isTicks ? roundToTick(bracket.stopLossPts * tickSize, tickSize) : bracket.stopLossPts;
          const actualTpPts = isTicks ? roundToTick(bracket.takeProfitPts * tickSize, tickSize) : bracket.takeProfitPts;
          const actualBeTrigger = isTicks ? roundToTick((bracket.autoBreakevenTriggerPts || 0) * tickSize, tickSize) : (bracket.autoBreakevenTriggerPts || 0);
          const actualBeOffset = isTicks ? roundToTick((bracket.autoBreakevenOffsetPts || 0) * tickSize, tickSize) : (bracket.autoBreakevenOffsetPts || 0);
          const actualTrailTrigger = isTicks ? roundToTick((bracket.trailingStopTriggerPts || 0) * tickSize, tickSize) : (bracket.trailingStopTriggerPts || 0);
          const actualTrailStep = isTicks ? roundToTick((bracket.trailingStopStepPts || 0) * tickSize, tickSize) : (bracket.trailingStopStepPts || 0);

          const slPrice = roundToTick(side === 'COMPRA' ? effectiveEntry - actualSlPts : effectiveEntry + actualSlPts, tickSize);
          const tpPrice = roundToTick(side === 'COMPRA' ? effectiveEntry + actualTpPts : effectiveEntry - actualTpPts, tickSize);

          const beStr = bracket.autoBreakevenEnabled ? ` | BE: ${actualBeTrigger}+${actualBeOffset}` : '';
          const trailStr = bracket.trailingStopEnabled ? ` | TRAIL: ${actualTrailTrigger}/${actualTrailStep}` : '';
          const unitStr = isTicks ? ` (${bracket.stopLossPts}t SL / ${bracket.takeProfitPts}t TP)` : '';

          await createReportAction({
            strategy_id: manualStratId,
            strategy_name: bracketsToUse.length > 1 ? `Entrada A Mercado ${side} (Alvo ${idx + 1})` : `Entrada A Mercado ${side}`,
            instance_id: effectivePanel?.instance_id || 'painel_principal',
            side,
            entry_price: effectiveEntry,
            stop_loss: slPrice,
            take_profit: tpPrice,
            exit_price: null,
            status: initialStatus,
            description: `[${selectedAsset}] ${activeATM.name} (${bracket.quantity}x - SL: ${actualSlPts}pt / TP: ${actualTpPts}pt${unitStr}${beStr}${trailStr})`,
            panel_id: effectivePanel?.id || null,
            contrato: bracket.quantity,
            quantity: bracket.quantity,
            account_id: activeAccount?.id || null,
            symbol: resolveAccountExecutionSymbol(activeAccount, selectedAsset || effectivePanel?.symbol || 'NQ'),
            is_atm: true,
            allow_multi: true
          } as any);
        }
      } else {
        // Manual Gestão (Copilot, Gráfico, Pontos ou Nível Estrutural)
        let slPrice = 0;
        let tpPrice = 0;

        if (stopMode === 'copilot' && (copilotSlPrice !== null || copilotTpPrice !== null)) {
          if (copilotSlPrice !== null && copilotSlPrice > 0) {
            slPrice = roundToTick(copilotSlPrice, tickSize);
          } else {
            const fallbackSlPts = slPoints > 0 ? slPoints : 20;
            slPrice = roundToTick(side === 'COMPRA' ? effectiveEntry - fallbackSlPts : effectiveEntry + fallbackSlPts, tickSize);
          }

          if (copilotTpPrice !== null && copilotTpPrice > 0) {
            tpPrice = roundToTick(copilotTpPrice, tickSize);
          } else {
            const fallbackTpPts = tpPoints > 0 ? tpPoints : 40;
            tpPrice = roundToTick(side === 'COMPRA' ? effectiveEntry + fallbackTpPts : effectiveEntry - fallbackTpPts, tickSize);
          }
        } else if (stopMode === 'grafico') {
          if (customSlPrice !== null && customSlPrice > 0) {
            slPrice = roundToTick(customSlPrice, tickSize);
          } else {
            const fallbackSlPts = slPoints > 0 ? slPoints : 20;
            slPrice = roundToTick(side === 'COMPRA' ? effectiveEntry - fallbackSlPts : effectiveEntry + fallbackSlPts, tickSize);
          }

          if (customTpPrice !== null && customTpPrice > 0) {
            tpPrice = roundToTick(customTpPrice, tickSize);
          } else {
            const fallbackTpPts = tpPoints > 0 ? tpPoints : 40;
            tpPrice = roundToTick(side === 'COMPRA' ? effectiveEntry + fallbackTpPts : effectiveEntry - fallbackTpPts, tickSize);
          }
        } else if (stopMode === 'range') {
          const activeCandleRef = typeof window !== 'undefined' ? Number(localStorage.getItem('vortex_range_candle_ref') ?? rangeCandleRef) : rangeCandleRef;
          const activeTpMult = typeof window !== 'undefined' ? Number(localStorage.getItem('vortex_range_tp_multiplier') ?? rangeTpMultiplier) : rangeTpMultiplier;
          const rangeRes = calculateRangeHlLevels(side, effectiveEntry, effectiveCandles, activeCandleRef, activeTpMult, tickSize);
          slPrice = rangeRes.slPrice;
          tpPrice = rangeRes.tpPrice;
        } else if (stopMode === 'pontos') {
          const ptsSl = slPoints > 0 ? slPoints : 20;
          const ptsTp = tpPoints > 0 ? tpPoints : 40;
          slPrice = roundToTick(side === 'COMPRA' ? effectiveEntry - ptsSl : effectiveEntry + ptsSl, tickSize);
          tpPrice = roundToTick(side === 'COMPRA' ? effectiveEntry + ptsTp : effectiveEntry - ptsTp, tickSize);
        } else {
          slPrice = roundToTick(resolveLevelPrice(side, 'SL', effectiveEntry, effectiveGammaLevels, slPoints, tpPoints), tickSize);
          tpPrice = roundToTick(resolveLevelPrice(side, 'TP', effectiveEntry, effectiveGammaLevels, slPoints, tpPoints), tickSize);
        }

        // Fallback de segurança: Garante que SL e TP NUNCA sejam zero ou inválidos
        if (!slPrice || isNaN(slPrice) || slPrice <= 0) {
          const fallbackSlPts = slPoints > 0 ? slPoints : 20;
          slPrice = roundToTick(side === 'COMPRA' ? effectiveEntry - fallbackSlPts : effectiveEntry + fallbackSlPts, tickSize);
        }
        if (!tpPrice || isNaN(tpPrice) || tpPrice <= 0) {
          const fallbackTpPts = tpPoints > 0 ? tpPoints : 40;
          tpPrice = roundToTick(side === 'COMPRA' ? effectiveEntry + fallbackTpPts : effectiveEntry - fallbackTpPts, tickSize);
        }

        const slPtsUsed = Math.abs(effectiveEntry - slPrice);
        const tpPtsUsed = Math.abs(tpPrice - effectiveEntry);
        const stratTitle = stopMode === 'copilot' ? `Entrada Copilot IA ${side}` : stopMode === 'range' ? `Entrada Range HL ${side}` : `Entrada A Mercado ${side}`;
        const gatilhoSuffix = (stopMode === 'copilot' && copilotGatilho && copilotGatilho !== '--') ? ` | Gatilho: ${copilotGatilho}` : '';
        const rangeSuffix = stopMode === 'range' ? ` | Range HL: Ref ${rangeCandleRef === 0 ? 'Atual' : `+${rangeCandleRef}`} / TP ${rangeTpMultiplier}x` : '';

        await createReportAction({
          strategy_id: manualStratId,
          strategy_name: stratTitle,
          instance_id: effectivePanel?.instance_id || 'painel_principal',
          side,
          entry_price: effectiveEntry,
          stop_loss: slPrice,
          take_profit: tpPrice,
          exit_price: null,
          status: initialStatus,
          description: `[${selectedAsset}] Ordem ${stopMode === 'copilot' ? 'COPILOT IA' : stopMode === 'range' ? 'RANGE HL' : 'MERCADO'} ${side} @ ${effectiveEntry.toFixed(2)} (SL: ${slPrice.toFixed(2)} [${slPtsUsed.toFixed(1)}pt] / TP: ${tpPrice.toFixed(2)} [${tpPtsUsed.toFixed(1)}pt]${gatilhoSuffix}${rangeSuffix})`,
          panel_id: effectivePanel?.id || null,
          contrato: effectiveContracts,
          quantity: effectiveContracts,
          account_id: activeAccount?.id || null,
          symbol: resolveAccountExecutionSymbol(activeAccount, selectedAsset || effectivePanel?.symbol || 'NQ')
        } as any);

        if (stopMode === 'grafico') {
          handleClearCustomMarkers();
        }
      }
    } catch (err) {
      console.error('[BOLETA] Erro ao executar ordem:', err);
    } finally {
      clearTimeout(submitWatchdog);
      setIsSubmitting(false);
    }
  };

  // Close position and move pending reports to Histórico de Trades
  const handleFlatOrder = async () => {
    setIsSubmitting(false);
    try {
      const openReports = (reports || []).filter((r: any) =>
        (r.status === 'Em Andamento' || r.status === 'Pendente') &&
        (!activeAccount || !r.account_id || r.account_id === activeAccount.id) &&
        isReportForThisAsset(r)
      );

      const isNinjaAcc = isNinjaExecutionAccount(activeAccount);
      if (openReports.length === 0 && !isNinjaAcc && !activeNinjaPosition) {
        alert('Nenhuma operação em andamento para zerar.');
        return;
      }

      if (settings?.chart_confirm_manual_trade !== false) {
        if (!window.confirm(`Deseja zerar a posição e encerrar todas as operações de ${selectedAsset}?`)) return;
      }

      // Se for conta NinjaTrader, despacha encerramento imediato no NinjaTrader local
      if (isNinjaAcc && activeAccount?.account_name) {
        mirrorToLocalServer('/sinal_local/status', {
          account_name: activeAccount.account_name,
          symbol: resolveAccountExecutionSymbol(activeAccount, selectedAsset),
          status: 'Cancelado',
          action: 'flat'
        });
        setActiveNinjaPosition(null);
      }

      // 1. Zera imediatamente no estado local (0ms delay)
      const closedAt = new Date().toISOString();
      const openIds = new Set(openReports.map((r: any) => r.id));
      if (setReports) {
        setReports((prev: any) => (prev || []).map((r: any) => 
          openIds.has(r.id) ? { ...r, status: 'Cancelado', exit_price: currentPrice, closed_at: closedAt } : r
        ));
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vortex_reports_updated'));
      }

      // 2. Executa encerramento individual via updateReportAction (propaga para todas as Slaves NT8 idêntico ao TradeDock)
      for (const r of openReports) {
        if (updateReportAction) {
          await updateReportAction(r.id, 'Cancelado', currentPrice);
        } else {
          await updateStrategyReportStatusSupabase(r.id, 'Cancelado', currentPrice, closedAt, false);
        }
      }
    } catch (err) {
      console.error('[BOLETA] Erro ao zerar e mover relatórios:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Encerrar todas as operações de um ativo específico a partir do card ORDENS ATIVAS
  const handleCloseAssetOrders = async (assetLabel: string, targetReports: any[]) => {
    setIsSubmitting(false);
    try {
      if (!targetReports || targetReports.length === 0) return;
      if (settings?.chart_confirm_manual_trade !== false) {
        if (!window.confirm(`Deseja encerrar todas as ${targetReports.length} operação(ões) de ${assetLabel}?`)) return;
      }

      const closedAt = new Date().toISOString();
      const exitPriceById = new Map<string, number>();
      targetReports.forEach((r: any) => {
        exitPriceById.set(r.id, resolveReportLivePrice(r));
      });

      if (setReports) {
        setReports((prev: any) => (prev || []).map((r: any) =>
          exitPriceById.has(r.id)
            ? { ...r, status: 'Cancelado', exit_price: exitPriceById.get(r.id), closed_at: closedAt }
            : r
        ));
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vortex_reports_updated'));
      }

      for (const r of targetReports) {
        const exitPrice = exitPriceById.get(r.id) || resolveReportLivePrice(r);
        if (updateReportAction) {
          await updateReportAction(r.id, 'Cancelado', exitPrice);
        } else {
          await updateStrategyReportStatusSupabase(r.id, 'Cancelado', exitPrice, closedAt, false);
        }
      }
    } catch (err) {
      console.error(`[BOLETA] Erro ao encerrar ordens de ${assetLabel}:`, err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reverse active position
  const handleReverseOrder = async () => {
    try {
      const openReports = (reports || []).filter((r: any) =>
        (r.status === 'Em Andamento' || r.status === 'Pendente') &&
        (!activeAccount || !r.account_id || r.account_id === activeAccount.id) &&
        isReportForThisAsset(r)
      );

      if (activeAccount && isNinjaAccount) {
        alert(`🔒 Operação Bloqueada no Painel:\n\nA conta "${activeAccount.account_name}" é sincronizada com o NinjaTrader 8.\n\nPara operar na plataforma Web e replicar ordens aos seus NinjaTraders, utilize uma Conta Demo.`);
        return;
      }

      if (openReports.length === 0) {
        alert('Nenhuma operação em andamento para inverter.');
        return;
      }

      const currentSide = openReports[0].side;
      const reverseSide: 'COMPRA' | 'VENDA' = currentSide === 'COMPRA' ? 'VENDA' : 'COMPRA';

      if (settings?.chart_confirm_manual_trade !== false) {
        if (!window.confirm(`Deseja realmente inverter a posição atual de ${currentSide} para ${reverseSide}?`)) {
          return;
        }
      }

      // 1. Zera imediatamente as operações anteriores
      const closedAt = new Date().toISOString();
      const openIds = new Set(openReports.map((r: any) => r.id));
      if (setReports) {
        setReports((prev: any) => (prev || []).map((r: any) => 
          openIds.has(r.id) ? { ...r, status: 'Cancelado', exit_price: currentPrice, closed_at: closedAt } : r
        ));
      }

      for (const r of openReports) {
        if (updateReportAction) {
          await updateReportAction(r.id, 'Cancelado', currentPrice);
        } else {
          await updateStrategyReportStatusSupabase(r.id, 'Cancelado', currentPrice, closedAt, false);
        }
      }

      // 2. Executa a ordem reversa
      await handleExecuteOrder(reverseSide, true);
    } catch (err) {
      console.error('[BOLETA] Erro ao inverter posição:', err);
    }
  };

  const openReportsForBoleta = (reports || []).filter((r: any) =>
    (r.status === 'Em Andamento' || (r.status as string) === 'Pendente') &&
    (!activeAccount || !r.account_id || r.account_id === activeAccount.id) &&
    isReportForThisAsset(r)
  );

  const profitableOpenReports = openReportsForBoleta.filter((r: any) => {
    const entry = Number(r.entry_price || 0);
    if (entry <= 0 || currentPrice <= 0) return false;
    if (r.side === 'COMPRA') return currentPrice > (entry + 0.25);
    if (r.side === 'VENDA') return currentPrice < (entry - 0.25);
    return false;
  });

  const isBreakevenActive = profitableOpenReports.length > 0;

  // Move Stop Loss to Entry Price / Breakeven
  const handleBreakevenAction = async () => {
    try {
      if (isNinjaAccount && activeAccount?.account_name) {
        mirrorToLocalServer('/sinal_local/levels', {
          account_name: activeAccount.account_name,
          symbol: resolveAccountExecutionSymbol(activeAccount, selectedAsset),
          is_breakeven: true,
          entry_price: avgPrice,
          current_price: currentPrice
        });
      }

      if (openReportsForBoleta.length === 0) {
        if (!isNinjaAccount) {
          alert('Nenhuma operação em andamento para ajustar Breakeven.');
        }
        return;
      }

      const updates = openReportsForBoleta.map((r: any) => {
        const entry = Number(r.entry_price || 0);
        if (entry <= 0) return null;
        let newStop = entry;
        if (r.side === 'COMPRA') {
          // Se tiver mais de 1.5 pt de lucro, pode dar offset de +0.5 pt
          newStop = (currentPrice >= entry + 1.5) ? (entry + 0.5) : entry;
          // Trava estrita: Stop NUNCA pode ser igual ou maior que o preço atual (margem de segurança de pelo menos 0.25 pt)
          if (currentPrice > 0 && newStop >= currentPrice - 0.25) {
            newStop = Math.min(entry, currentPrice - 0.25);
          }
        } else if (r.side === 'VENDA') {
          // Se tiver mais de 1.5 pt de lucro, pode dar offset de -0.5 pt
          newStop = (currentPrice <= entry - 1.5 && currentPrice > 0) ? (entry - 0.5) : entry;
          // Trava estrita: Stop NUNCA pode ser igual ou menor que o preço atual (margem de segurança de pelo menos 0.25 pt)
          if (currentPrice > 0 && newStop <= currentPrice + 0.25) {
            newStop = Math.max(entry, currentPrice + 0.25);
          }
        }
        return {
          id: r.id,
          stopLoss: roundToTick(newStop, tickSize),
          takeProfit: r.take_profit ? Number(r.take_profit) : null
        };
      }).filter(Boolean);

      if (updates.length === 0) return;

      const updatesMap = new Map(updates.map((u: any) => [u.id, u.stopLoss]));

      // 1. Atualização Otimista Imediata (0ms no gráfico)
      if (setReports) {
        setReports((prev: any) => (prev || []).map((r: any) =>
          updatesMap.has(r.id) ? { ...r, stop_loss: updatesMap.get(r.id) } : r
        ));
      }

      // 2. Disparo Paralelo via Context (Conector Local + Supabase) com Preço Atual de Mercado
      await Promise.all(
        updates.map((u: any) =>
          updateReportLevelsAction
            ? updateReportLevelsAction(u.id, u.stopLoss, u.takeProfit, currentPrice)
            : updateStrategyReportLevelsSupabase(u.id, u.stopLoss, u.takeProfit, currentPrice)
        )
      );
    } catch (err) {
      console.error('[BOLETA] Erro ao mover breakeven:', err);
    }
  };

  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    return settings?.chart_color_theme || localStorage.getItem('vortex_chart_theme') || 'black';
  });

  useEffect(() => {
    if (settings?.chart_color_theme) setCurrentTheme(settings.chart_color_theme);
    const handleThemeChange = (e: any) => {
      if (e.detail?.theme) setCurrentTheme(e.detail.theme);
    };
    window.addEventListener('vortex_chart_theme_changed', handleThemeChange);
    return () => window.removeEventListener('vortex_chart_theme_changed', handleThemeChange);
  }, [settings?.chart_color_theme]);

  const isBlackTheme = currentTheme === 'black' || currentTheme === 'ninja_black';
  const isSlateTheme = currentTheme === 'slate' || currentTheme === 'cinza_escuro' || currentTheme === 'cinza_grafite' || currentTheme === 'ninja_slate' || currentTheme === 'light' || currentTheme === 'ninja_light';
  const isMidnightTheme = currentTheme === 'midnight' || currentTheme === 'azul_noturno' || currentTheme === 'ninja_carbon' || currentTheme === 'ninja_midnight';
  const isLightTheme = false; // A boleta mantém superfície Cinza Grafite escura (#1a1f2c / #222838) mesmo quando o gráfico é claro/branco

  const bRootBg = isBlackTheme
    ? 'bg-[#000000] border-zinc-800 text-white'
    : isSlateTheme
    ? 'bg-[#1a1f2c] border-slate-700 text-slate-100'
    : isMidnightTheme
    ? 'bg-[#070e20] border-blue-900/60 text-slate-100'
    : 'bg-[#1a1f2c] border-slate-700 text-slate-100'; // Restante em Cinza Grafite

  const bCardBg = isBlackTheme
    ? 'bg-[#09090b] border-zinc-800'
    : isSlateTheme
    ? 'bg-[#222838] border-slate-700'
    : isMidnightTheme
    ? 'bg-[#0d1a38] border-blue-900/60'
    : 'bg-[#222838] border-slate-700 shadow-sm';

  const bInnerInputBg = isBlackTheme
    ? 'bg-[#000000] border-zinc-800 text-white'
    : isSlateTheme
    ? 'bg-[#1a1f2c] border-slate-700 text-slate-100'
    : isMidnightTheme
    ? 'bg-[#070e20] border-blue-900/60 text-slate-100'
    : 'bg-[#181d28] border-slate-700 text-slate-100';

  const bLabelColor = 'text-slate-400 font-extrabold';

  return (
    <div className={`w-full h-full max-h-full ${bRootBg} ${isFloating ? 'rounded-xl shadow-2xl' : 'border-l'} flex flex-col justify-between p-2 select-none overflow-y-auto font-sans text-xs transition-colors duration-200`}>
      <div className="space-y-1.5">
        {/* Header com Drag Handle, Duplo Clique e Botões de Ação */}
        <div
          onMouseDown={isFloating ? onDragStart : undefined}
          onTouchStart={isFloating ? onDragStart : undefined}
          onDoubleClick={() => {
            if (isFloating) toggleCompact();
          }}
          className={`${bCardBg} px-2.5 py-1.5 rounded-lg border flex items-center justify-between select-none ${
            isFloating ? 'cursor-move active:cursor-grabbing bg-slate-900 shadow-md' : ''
          }`}
          title={
            isFloating
              ? (isCompact
                  ? 'Duplo clique para expandir | Arraste para mover'
                  : 'Duplo clique para simplificar | Arraste para mover')
              : undefined
          }
        >
          <div className="flex items-center gap-1.5">
            {isFloating && (
              <span className="text-slate-500 text-[11px] font-mono select-none" title="Arraste para mover">
                ⋮⋮
              </span>
            )}
            <span className="text-xs font-black tracking-wider uppercase text-slate-100">
              {selectedAsset || 'TRADE'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Botão de Alternar Modo Compacto / Detalhado (disponível quando flutuante) */}
            {isFloating && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCompact();
                }}
                className={`p-1 rounded transition cursor-pointer active:scale-95 flex items-center justify-center text-[10px] font-bold ${
                  isCompact
                    ? 'bg-blue-950/80 text-blue-300 border border-blue-600/60 shadow-sm'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
                title={
                  isCompact
                    ? 'Expandir detalhes [Ou duplo clique no topo]'
                    : 'Modo simplificado [Ou duplo clique no topo]'
                }
              >
                {isCompact ? '⊞' : '⊟'}
              </button>
            )}
            {/* Botão de Destacar / Ancorar (como no Chat Copilot) */}
            {onToggleFloating && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFloating();
                }}
                className={`p-1 rounded transition cursor-pointer active:scale-95 flex items-center justify-center text-[10px] ${
                  isFloating
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/60 shadow-sm'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
                title={isFloating ? 'Ancorar na barra lateral direita' : 'Destacar janela para mover livremente na tela'}
              >
                {isFloating ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                )}
              </button>
            )}

            {/* Botão Fechar / Ocultar */}
            {onClose && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="p-1 rounded hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 transition cursor-pointer active:scale-95 flex items-center justify-center text-[11px] font-bold"
                title="Fechar"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* 1. TOPO: LISTA DE CONTAS (LARGURA TOTAL) - Ocultado no modo simplificado/compacto */}
        {(!isFloating || !isCompact) && (
        <div className={`${bCardBg} p-1.5 rounded-lg border space-y-1`}>
          <div className="flex items-center justify-between">
            <label className={`text-[10px] ${bLabelColor} uppercase tracking-wider block`}>CONTA DEMO AXION</label>
            {syncedNinjaAccountsCount > 0 && (
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1.5 bg-blue-950/80 text-blue-300 border border-blue-700/50 shadow-sm"
                title={`Copy Trading: Ordens executadas nesta conta Demo serão replicadas para ${syncedNinjaAccountsCount} conta(s) sincronizada(s) do NinjaTrader 8.`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span>Copy NT8 ({syncedNinjaAccountsCount})</span>
              </span>
            )}
          </div>
          {boletaAccounts.length === 0 ? (
            <div className="p-2 text-center text-[10px] text-amber-300 bg-amber-950/40 border border-amber-600/40 rounded">
              Nenhuma Conta Demo disponível. Cadastre uma Conta Demo em 'Gestão de Contas'.
            </div>
          ) : (
            <select
              value={activeAccount?.id || ''}
              onChange={(e) => {
                const acc = boletaAccounts.find((a: any) => a.id === e.target.value);
                if (acc && switchAccount) switchAccount(acc);
              }}
              className={`w-full ${bInnerInputBg} border text-[10px] font-bold py-1 px-2 rounded outline-none cursor-pointer truncate`}
            >
              {boletaAccounts.map((acc: any) => {
                const platformLabel = acc.account_type === 'internal_demo' ? 'DEMO AXION' : 'DEMO';
                return (
                  <option key={acc.id} value={acc.id} className={isLightTheme ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
                    {acc.account_name} ({platformLabel})
                  </option>
                );
              })}
            </select>
          )}
        </div>
        )}

        {/* 2. CARD DE POSIÇÃO ATUAL | CONTRATOS | STATUS (DESTAQUE NO TOPO) - Ocultado no modo simplificado/compacto */}
        {(!isFloating || !isCompact) && (() => {
          const ninjaOffline = isNinjaAccount && ninjaStatus !== 'online';
          const hasAnyAccountPosition = totalDisplayContracts > 0 || posQty !== 0;
          const displayPnl   = ninjaOffline ? null : (hasAnyAccountPosition ? pnlUSD : null);
          const displayPts   = ninjaOffline ? null : (hasAnyAccountPosition ? diffPts : null);
          const displayQty   = ninjaOffline ? '--' : String(totalDisplayContracts || 0);
          const displayStatus = ninjaOffline
            ? 'DESCONECTADO'
            : (isLong ? 'COMPRADO' : isShort ? 'VENDIDO' : 'ZERADO');

          return (
            <div className={`p-2 rounded-lg border transition font-mono ${
              ninjaOffline
                ? `${bCardBg} border-slate-600/60 opacity-60`
                : isLong
                ? 'bg-emerald-950/60 border-emerald-700/80 shadow-sm'
                : isShort
                ? 'bg-rose-950/60 border-rose-700/80 shadow-sm'
                : `${bCardBg} shadow-sm`
            }`}>
              <div className="grid grid-cols-3 text-center divide-x divide-slate-700/40">
                {/* POSIÇÃO ATUAL */}
                <div className="px-1">
                  <span className={`text-[10px] ${bLabelColor} uppercase tracking-wider block mb-0.5`}>
                    POSIÇÃO ATUAL
                  </span>
                  <span className={`text-sm font-black block leading-tight ${
                    ninjaOffline
                      ? (isLightTheme ? 'text-slate-500' : 'text-slate-500')
                      : displayPnl !== null
                      ? (displayPnl >= 0 ? 'text-emerald-500' : 'text-rose-500')
                      : (isLightTheme ? 'text-slate-700' : 'text-slate-300')
                  }`}>
                    {ninjaOffline ? '--' : (displayPnl !== null ? `${displayPnl >= 0 ? '+' : ''}$${displayPnl.toFixed(2)}` : '$ 0.00')}
                  </span>
                  {!isMobile && (
                    <span className={`text-[9px] ${isLightTheme ? 'text-slate-500' : 'text-slate-400'} font-bold block font-mono`}>
                      {ninjaOffline ? '-- pts' : (displayPts !== null ? `${displayPts >= 0 ? '+' : ''}${displayPts.toFixed(2)} pts` : '0.00 pts')}
                    </span>
                  )}
                </div>

                {/* CONTRATOS */}
                <div className="px-1">
                  <span className={`text-[10px] ${bLabelColor} uppercase tracking-wider block mb-0.5`}>
                    CONTRATOS
                  </span>
                  <span className={`text-sm font-black ${isLightTheme ? 'text-slate-900' : 'text-slate-100'} block leading-tight`}>
                    {displayQty}
                  </span>
                </div>

                {/* STATUS */}
                <div className="px-1">
                  <span className={`text-[10px] ${bLabelColor} uppercase tracking-wider block mb-0.5`}>
                    STATUS
                  </span>
                  <span className={`text-xs font-black uppercase block leading-tight ${
                    ninjaOffline
                      ? 'text-slate-500'
                      : isLong
                      ? 'text-emerald-500'
                      : isShort
                      ? 'text-rose-500'
                      : (isLightTheme ? 'text-slate-600' : 'text-slate-400')
                  }`}>
                    {displayStatus}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 3. TABS: LOTE | FINANCEIRO */}
        <div className={`${bCardBg} p-0.5 rounded-lg border flex gap-0.5 text-[9.5px] font-extrabold tracking-wider uppercase`}>
          <button
            type="button"
            onClick={() => {
              lastLocalSizingModeChangeRef.current = Date.now();
              setSizingMode('lote');
              localStorage.setItem('vortex_sizing_mode', 'lote');
              localStorage.setItem('vortex_manual_sizing_mode', 'lote');
              if (saveSettings) saveSettings({ chart_manual_sizing_mode: 'lote' });
              window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
            }}
            className={`flex-1 py-1 rounded transition text-center cursor-pointer ${
              activeTab === 'trade'
                ? (isLightTheme ? 'bg-white text-blue-600 font-black shadow-sm border border-slate-300' : 'bg-[#1e293b] text-blue-400 font-black border-b border-blue-500 shadow-sm')
                : (isLightTheme ? 'text-slate-600 hover:text-slate-900' : 'text-white/90 hover:text-white')
            }`}
          >
            LOTE
          </button>
          <button
            type="button"
            onClick={() => {
              lastLocalSizingModeChangeRef.current = Date.now();
              setSizingMode('risco');
              localStorage.setItem('vortex_sizing_mode', 'risco');
              localStorage.setItem('vortex_manual_sizing_mode', 'risco');
              if (saveSettings) saveSettings({ chart_manual_sizing_mode: 'risco' });
              window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
            }}
            className={`flex-1 py-1 rounded transition text-center cursor-pointer ${
              activeTab === 'risk'
                ? (isLightTheme ? 'bg-white text-emerald-600 font-black shadow-sm border border-slate-300' : 'bg-[#1e293b] text-emerald-400 font-black border-b border-emerald-500 shadow-sm')
                : (isLightTheme ? 'text-slate-600 hover:text-slate-900' : 'text-white/90 hover:text-white')
            }`}
          >
            FINANCEIRO
          </button>
        </div>

        {/* 3. SIZING / RISK INPUT CARD */}
        <div className={`${bCardBg} p-1.5 rounded-lg border space-y-1`}>
          {activeTab === 'trade' ? (
            <div className="space-y-0.5">
              {/* CONTRATOS STEPPER */}
              <div className="flex items-center justify-between">
                <label className={`text-[10px] ${bLabelColor} uppercase tracking-wider block`}>
                  CONTRATOS
                </label>
                <span className={`text-[10px] font-mono font-bold ${isLightTheme ? 'text-slate-700' : 'text-white'}`}>
                  {contracts} {contracts > 1 ? 'contratos' : 'contrato'}
                </span>
              </div>
              <div className={`flex items-center ${bInnerInputBg} border rounded overflow-hidden h-6.5`}>
                <button
                  type="button"
                  onClick={() => updateContractsSetting(Math.max(1, contracts - 1))}
                  className={`px-3 h-full ${isLightTheme ? 'bg-slate-200 hover:bg-slate-300 text-slate-800' : 'bg-slate-800 hover:bg-slate-700 text-white'} font-black text-xs active:scale-95 transition cursor-pointer`}
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={contracts}
                  onChange={(e) => updateContractsSetting(Math.max(1, parseInt(e.target.value) || 1))}
                  className={`w-full bg-transparent text-center font-mono font-black ${isLightTheme ? 'text-slate-900' : 'text-white'} text-xs outline-none`}
                />
                <button
                  type="button"
                  onClick={() => updateContractsSetting(contracts + 1)}
                  className={`px-3 h-full ${isLightTheme ? 'bg-slate-200 hover:bg-slate-300 text-slate-800' : 'bg-slate-800 hover:bg-slate-700 text-white'} font-black text-xs active:scale-95 transition cursor-pointer`}
                >
                  +
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className={`text-[10px] ${bLabelColor} uppercase tracking-wider`}>
                  RISCO DESEJADO ($)
                </label>
                <span className="text-[9px] font-mono font-bold text-purple-600 dark:text-purple-300">
                  ~{calculatedRiskContracts}x ({calculatedSlPts.toFixed(1)} pts)
                </span>
              </div>
              <div className={`flex items-center ${bInnerInputBg} border rounded px-2 h-6`}>
                <span className="text-emerald-600 font-black mr-1 text-xs">$</span>
                <input
                  type="number"
                  min={10}
                  step={10}
                  value={riskUsd}
                  onChange={(e) => updateRiskUsdSetting(Math.max(1, parseFloat(e.target.value) || 0))}
                  className="w-full bg-transparent font-mono font-black text-emerald-600 text-xs outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* 4. GESTÃO (SL & TP - MODOS P, N, G, C) */}
        <div className={`${bCardBg} p-1.5 rounded-lg border space-y-1.5`}>
          <div className="flex justify-between items-center">
            <span className={`text-[10px] ${bLabelColor} uppercase tracking-widest`}>
              GESTÃO
            </span>
            <div className={`flex ${bInnerInputBg} p-0.5 rounded border text-[9px] gap-0.5`}>
              <button
                type="button"
                onClick={() => {
                  lastLocalStopModeChangeRef.current = Date.now();
                  setStopMode('pontos');
                  localStorage.setItem('vortex_stop_mode', 'pontos');
                  if (saveSettings) saveSettings({ chart_manual_trade_mode: 'pontos' });
                  window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
                }}
                title="Modo Pontos (SL e TP fixos em pontos)"
                className={`px-2 py-0.5 rounded font-black transition cursor-pointer ${
                  stopMode === 'pontos' ? 'bg-blue-600 text-white shadow' : (isLightTheme ? 'text-slate-600 hover:text-slate-900' : 'text-white/90 hover:text-white')
                }`}
              >
                P
              </button>
              <button
                type="button"
                onClick={() => {
                  lastLocalStopModeChangeRef.current = Date.now();
                  setStopMode('nivel');
                  localStorage.setItem('vortex_stop_mode', 'nivel');
                  if (saveSettings) saveSettings({ chart_manual_trade_mode: 'nivel' });
                  window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
                }}
                title="Modo Nível (SL e TP calculados por níveis técnicos e gamma)"
                className={`px-2 py-0.5 rounded font-black transition cursor-pointer ${
                  stopMode === 'nivel' ? 'bg-blue-600 text-white shadow' : (isLightTheme ? 'text-slate-600 hover:text-slate-900' : 'text-white/90 hover:text-white')
                }`}
              >
                N
              </button>
              <button
                type="button"
                onClick={() => {
                  lastLocalStopModeChangeRef.current = Date.now();
                  setStopMode('grafico');
                  localStorage.setItem('vortex_stop_mode', 'grafico');
                  if (saveSettings) saveSettings({ chart_manual_trade_mode: 'grafico' });
                  window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
                }}
                title="Modo Gráfico (Marcação visual interativa no gráfico)"
                className={`px-2 py-0.5 rounded font-black transition cursor-pointer ${
                  stopMode === 'grafico' ? 'bg-amber-600 text-white shadow' : (isLightTheme ? 'text-slate-600 hover:text-slate-900' : 'text-white/90 hover:text-white')
                }`}
              >
                G
              </button>
              <button
                type="button"
                onClick={() => {
                  lastLocalStopModeChangeRef.current = Date.now();
                  setStopMode('copilot');
                  localStorage.setItem('vortex_stop_mode', 'copilot');
                  if (saveSettings) saveSettings({ chart_manual_trade_mode: 'copilot' });
                  window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
                }}
                title="Modo Copilot IA (Preços de SL e TP automáticos da IA com edição direta de preço)"
                className={`px-2 py-0.5 rounded font-black transition cursor-pointer ${
                  stopMode === 'copilot' ? 'bg-purple-600 text-white shadow' : (isLightTheme ? 'text-slate-600 hover:text-slate-900' : 'text-white/90 hover:text-white')
                }`}
              >
                C
              </button>
              <button
                type="button"
                onClick={() => {
                  lastLocalStopModeChangeRef.current = Date.now();
                  setStopMode('range');
                  localStorage.setItem('vortex_stop_mode', 'range');
                  if (saveSettings) saveSettings({ chart_manual_trade_mode: 'range' });
                  window.dispatchEvent(new CustomEvent('vortex_custom_sltp_updated'));
                }}
                title="Modo Range HL (Stop Loss na Mínima/Máxima dos candles e Take Profit com Fator R:R)"
                className={`px-2 py-0.5 rounded font-black transition cursor-pointer ${
                  stopMode === 'range' ? 'bg-emerald-600 text-white shadow' : (isLightTheme ? 'text-slate-600 hover:text-slate-900' : 'text-white/90 hover:text-white')
                }`}
              >
                R
              </button>
            </div>
          </div>

          {stopMode === 'copilot' ? (
            /* MODO COPILOT (C): EXIBE PREÇO DIRETO DE SL E TP + GATILHO RECOMENDADO DA IA */
            <div className={`space-y-1.5 ${bInnerInputBg} p-2 rounded border border-purple-500/40`}>
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
                    step={tickSize}
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
                    step={tickSize}
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

              {/* Botão de sincronizar com a operação aberta se houver */}
              {openReportsForBoleta.length > 0 && (copilotSlPrice || copilotTpPrice) && (
                <button
                  type="button"
                  onClick={async () => {
                    const updates = openReportsForBoleta.map((r: any) => ({
                      id: r.id,
                      stopLoss: copilotSlPrice ? roundToTick(copilotSlPrice, tickSize) : (r.stop_loss ? Number(r.stop_loss) : null),
                      takeProfit: copilotTpPrice ? roundToTick(copilotTpPrice, tickSize) : (r.take_profit ? Number(r.take_profit) : null)
                    }));
                    const updatesMap = new Map<string, any>(updates.map((u: any) => [u.id, u]));
                    if (setReports) {
                      setReports((prev: any) => (prev || []).map((r: any) => {
                        const up = updatesMap.get(r.id);
                        return up ? { ...r, stop_loss: up.stopLoss, take_profit: up.takeProfit } : r;
                      }));
                    }
                    await Promise.all(
                      updates.map((u: any) =>
                        updateReportLevelsAction
                          ? updateReportLevelsAction(u.id, u.stopLoss, u.takeProfit, currentPrice)
                          : updateStrategyReportLevelsSupabase(u.id, u.stopLoss, u.takeProfit, currentPrice)
                      )
                    );
                  }}
                  className="w-full py-1 bg-purple-700 hover:bg-purple-600 text-white font-black text-[9px] rounded shadow transition active:scale-95 cursor-pointer flex items-center justify-center gap-1 uppercase tracking-wider"
                >
                  <span>🛡️</span>
                  <span>Aplicar SL/TP na Posição Ativa</span>
                </button>
              )}
            </div>
          ) : stopMode === 'grafico' ? (
            <div className={`space-y-1.5 ${bInnerInputBg} p-2 rounded border border-amber-500/40`}>
              <div className="flex items-center justify-between">
                <span className="text-[9.5px] font-extrabold text-amber-500 uppercase tracking-wider flex items-center gap-1">
                  🎯 MARCAÇÃO NO GRÁFICO
                </span>
                {customSlPrice && customTpPrice ? (
                  <span className="text-[9px] font-mono text-emerald-600 font-bold">✓ DEFINIDOS</span>
                ) : (
                  <span className="text-[9px] font-mono text-slate-500">PENDENTE</span>
                )}
              </div>

              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('vortex_start_marking_sltp', {
                      detail: { panelId: activePanel?.id || null }
                    }));
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
                <div className="grid grid-cols-2 gap-1 text-[9px] font-mono pt-1 border-t border-slate-700/40">
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
            <div className={`space-y-2 ${bInnerInputBg} p-2 rounded-lg border border-emerald-500/40 shadow-inner`}>
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
                  <div className="flex items-center bg-slate-900/90 border border-slate-700 rounded overflow-hidden h-6">
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
                  <div className="flex items-center bg-slate-900/90 border border-slate-700 rounded overflow-hidden h-6">
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
              <div className="flex items-center justify-between gap-1 bg-slate-900/70 px-1.5 py-1 rounded border border-slate-800">
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
            /* SL e TP Inputs (Modo Pontos ou Modo Nível) */
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                {/* STOP LOSS */}
                <div className={`${bInnerInputBg} p-1 rounded border border-rose-500/40 flex items-center justify-between`}>
                  <div>
                    <span className="text-[10px] font-extrabold text-rose-500 block uppercase">
                      SL ({stopMode === 'pontos' ? 'PTS' : 'NÍVEL'})
                    </span>
                  </div>
                  <div className="flex items-center bg-rose-950/30 border border-rose-700/50 rounded overflow-hidden h-5">
                    <button
                      type="button"
                      onClick={() => updateSlPointsSetting(Math.max(1, slPoints - 5))}
                      className="px-1.5 h-full bg-rose-600 hover:bg-rose-700 text-white font-bold active:scale-95 text-[10px] cursor-pointer"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={slPoints}
                      onChange={(e) => updateSlPointsSetting(Math.max(1, parseFloat(e.target.value) || 1))}
                      className="w-8 bg-transparent text-center font-mono font-bold text-rose-600 dark:text-rose-300 text-[10px] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updateSlPointsSetting(slPoints + 5)}
                      className="px-1.5 h-full bg-rose-600 hover:bg-rose-700 text-white font-bold active:scale-95 text-[10px] cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* TAKE PROFIT */}
                <div className={`${bInnerInputBg} p-1 rounded border border-emerald-500/40 flex items-center justify-between`}>
                  <div>
                    <span className="text-[10px] font-extrabold text-emerald-500 block uppercase">
                      TP ({stopMode === 'pontos' ? 'PTS' : 'NÍVEL'})
                    </span>
                  </div>
                  <div className="flex items-center bg-emerald-950/30 border border-emerald-700/50 rounded overflow-hidden h-5">
                    <button
                      type="button"
                      onClick={() => updateTpPointsSetting(Math.max(1, tpPoints - 5))}
                      className="px-1.5 h-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold active:scale-95 text-[10px] cursor-pointer"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={tpPoints}
                      onChange={(e) => updateTpPointsSetting(Math.max(1, parseFloat(e.target.value) || 1))}
                      className="w-8 bg-transparent text-center font-mono font-bold text-emerald-600 dark:text-emerald-300 text-[10px] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updateTpPointsSetting(tpPoints + 5)}
                      className="px-1.5 h-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold active:scale-95 text-[10px] cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {stopMode === 'nivel' && (
                <div className="space-y-1 pt-0.5 border-t border-slate-800">
                  {/* Seletor de Prévia no Gráfico */}
                  <div className="flex items-center justify-between gap-1 bg-slate-900/70 px-1.5 py-1 rounded border border-slate-800">
                    <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <span>📊</span> Simular Nível:
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => updateNivelSide('COMPRA')}
                        className={`px-1.5 py-0.5 rounded text-[8.5px] font-black transition cursor-pointer ${
                          nivelSide === 'COMPRA' ? 'bg-emerald-600 text-white shadow ring-1 ring-emerald-400' : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="Exibir projeção de Stop e Take de Nível para Compra no gráfico"
                      >
                        COMPRA
                      </button>
                      <button
                        type="button"
                        onClick={() => updateNivelSide('VENDA')}
                        className={`px-1.5 py-0.5 rounded text-[8.5px] font-black transition cursor-pointer ${
                          nivelSide === 'VENDA' ? 'bg-rose-600 text-white shadow ring-1 ring-rose-400' : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="Exibir projeção de Stop e Take de Nível para Venda no gráfico"
                      >
                        VENDA
                      </button>
                      <button
                        type="button"
                        onClick={() => updateNivelSide('AMBOS')}
                        className={`px-1.5 py-0.5 rounded text-[8.5px] font-black transition cursor-pointer ${
                          nivelSide === 'AMBOS' ? 'bg-blue-600 text-white shadow ring-1 ring-blue-400' : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="Exibir ambas as projeções de Nível no gráfico simultaneamente"
                      >
                        AMBOS
                      </button>
                    </div>
                  </div>

                  {/* Badges de Prévia em Tempo Real */}
                  <div className="grid grid-cols-2 gap-1 text-[8.5px] font-mono pt-0.5">
                    <div 
                      onClick={() => updateNivelSide('COMPRA')}
                      className={`p-1 rounded border transition cursor-pointer ${
                        nivelSide === 'COMPRA' || nivelSide === 'AMBOS'
                          ? 'bg-emerald-950/70 border-emerald-500 ring-1 ring-emerald-500/50' 
                          : 'bg-emerald-950/30 border-emerald-900/60 hover:bg-emerald-950/50'
                      }`}
                      title="Clique para destacar simulação de Compra no gráfico"
                    >
                      <div className="text-emerald-400 font-bold flex items-center justify-between">
                        <span>SL COMPRA:</span>
                        <span>-{nivelBuySlPts.toFixed(1)}pt</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-slate-100 font-black">{nivelBuySl.toFixed(2)}</span>
                        <span className="text-emerald-400 text-[8px] font-bold">TP: +{nivelBuyTpPts.toFixed(1)}pt</span>
                      </div>
                    </div>

                    <div 
                      onClick={() => updateNivelSide('VENDA')}
                      className={`p-1 rounded border transition cursor-pointer ${
                        nivelSide === 'VENDA' || nivelSide === 'AMBOS'
                          ? 'bg-rose-950/70 border-rose-500 ring-1 ring-rose-500/50' 
                          : 'bg-rose-950/30 border-rose-900/60 hover:bg-rose-950/50'
                      }`}
                      title="Clique para destacar simulação de Venda no gráfico"
                    >
                      <div className="text-rose-400 font-bold flex items-center justify-between">
                        <span>SL VENDA:</span>
                        <span>+{nivelSellSlPts.toFixed(1)}pt</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-slate-100 font-black">{nivelSellSl.toFixed(2)}</span>
                        <span className="text-rose-400 text-[8px] font-bold">TP: -{nivelSellTpPts.toFixed(1)}pt</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 5. ESTRATÉGIA ATM */}
        <div className={`p-1.5 rounded-lg border transition ${
          isATMActive ? `${bCardBg} border-amber-500/60 shadow-sm` : `${bCardBg} opacity-80`
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
                isATMActive ? 'text-amber-500' : (isLightTheme ? 'text-slate-600' : 'text-slate-400')
              }`}>
                ATIVAR ESTRATÉGIA ATM
              </span>
            </label>
            {isATMActive && (
              <button
                onClick={() => setIsATMModalOpen(true)}
                title="Configurar Estratégia ATM"
                className="text-slate-400 hover:text-amber-400 transition text-[10px]"
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
              className={`w-full ${bInnerInputBg} border border-amber-500/40 text-[10px] font-bold py-1 px-1.5 rounded outline-none cursor-pointer truncate`}
            >
              {atmList.map(atm => (
                <option key={atm.id} value={atm.id} className={isLightTheme ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
                  {atm.name.split('(')[0].replace(/[🎯⚖️🚀]/g, '').trim()}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 6. PRIMARY EXECUTION BUTTONS (COMPRA & VENDA) */}
        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          {/* COMPRA */}
          <button
            type="button"
            onClick={() => handleExecuteOrder('COMPRA')}
            disabled={isSubmitting || isNinjaAccount || hasOpenPosition}
            title={
              isNinjaAccount
                ? "Conta NinjaTrader sincronizada: Selecione uma Conta Demo para operar na boleta"
                : hasOpenPosition
                ? "Operação em andamento: Zere a posição atual para abrir nova ordem"
                : isSubmitting
                ? "Enviando ordem a mercado..."
                : "Executar ordem de Compra a Mercado"
            }
            className={`font-black py-2.5 px-2 rounded-lg shadow transition flex items-center justify-center gap-1.5 border text-xs tracking-wider uppercase ${
              isNinjaAccount || hasOpenPosition
                ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-50'
                : isSubmitting
                ? 'bg-emerald-700 text-emerald-200 border-emerald-600 cursor-wait opacity-75 animate-pulse'
                : 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white cursor-pointer border-emerald-500/40'
            }`}
          >
            <span>{isSubmitting ? 'ENVIANDO...' : 'COMPRA'}</span>
          </button>

          {/* VENDA */}
          <button
            type="button"
            onClick={() => handleExecuteOrder('VENDA')}
            disabled={isSubmitting || isNinjaAccount || hasOpenPosition}
            title={
              isNinjaAccount
                ? "Conta NinjaTrader sincronizada: Selecione uma Conta Demo para operar na boleta"
                : hasOpenPosition
                ? "Operação em andamento: Zere a posição atual para abrir nova ordem"
                : isSubmitting
                ? "Enviando ordem a mercado..."
                : "Executar ordem de Venda a Mercado"
            }
            className={`font-black py-2.5 px-2 rounded-lg shadow transition flex items-center justify-center gap-1.5 border text-xs tracking-wider uppercase ${
              isNinjaAccount || hasOpenPosition
                ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-50'
                : isSubmitting
                ? 'bg-rose-700 text-rose-200 border-rose-600 cursor-wait opacity-75 animate-pulse'
                : 'bg-rose-600 hover:bg-rose-500 active:scale-95 text-white cursor-pointer border-rose-500/40'
            }`}
          >
            <span>{isSubmitting ? 'ENVIANDO...' : 'VENDA'}</span>
          </button>
        </div>

        {/* 7. PANIC & EMERGENCY ACTIONS */}
        <div className="space-y-1 pt-0.5">
          {/* FECHAR TUDO */}
          <button
            type="button"
            onClick={handleFlatOrder}
            className="w-full bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black py-1.5 px-2 rounded-lg text-[10px] transition flex items-center justify-center gap-1 shadow uppercase tracking-wider cursor-pointer"
          >
            <span>FECHAR TUDO</span>
          </button>

          {/* Elementos ocultados no modo flutuante conforme regra 5 */}
          {!isFloating && (
            <>
          {/* INVERTER & BREAKEVEN ROW */}
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={handleReverseOrder}
              disabled={isNinjaAccount}
              title={isNinjaAccount ? "Conta NinjaTrader sincronizada: Selecione uma Conta Demo para operar na boleta" : "Inverter posição atual"}
              className={`${
                isNinjaAccount
                  ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-50'
                  : isLightTheme
                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300 active:scale-95 cursor-pointer'
                  : 'bg-[#1e293b] hover:bg-slate-700 text-slate-200 border-slate-700 active:scale-95 cursor-pointer'
              } font-bold py-1 px-1.5 rounded-lg text-[9px] transition flex items-center justify-center gap-1 border shadow-sm`}
            >
              <span>INVERTER</span>
            </button>
            <button
              type="button"
              onClick={handleBreakevenAction}
              disabled={!isBreakevenActive}
              className={`${
                isBreakevenActive
                  ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer active:scale-95 shadow-blue-500/30 ring-1 ring-blue-400/50'
                  : 'bg-slate-700/40 text-slate-500 cursor-not-allowed border border-slate-700/50 opacity-60'
              } font-bold py-1 px-1.5 rounded-lg text-[9px] transition flex items-center justify-center gap-1 shadow-sm`}
              title={
                isBreakevenActive
                  ? 'Mover Stop Loss para o preço de entrada (Proteger no Zero a Zero)'
                  : 'Break-Even indisponível: a operação precisa estar com lucro positivo para ser protegida'
              }
            >
              <span>BREAKEVEN</span>
            </button>
          </div>

          {/* ORDENS ATIVAS (AGRUPADAS POR ATIVO COM PNL E ENCERRAMENTO POR ATIVO) */}
          <div className={`w-full ${bInnerInputBg} rounded border font-mono overflow-hidden`}>
            <div className="font-extrabold py-1 px-2 text-[10px] text-center uppercase tracking-wider">
              ORDENS ATIVAS ({allAccountActiveReports.length})
            </div>
            {activeOrdersByAsset.length > 0 && (
              <div className="border-t border-slate-700/60 divide-y divide-slate-800/70 max-h-28 overflow-y-auto">
                {activeOrdersByAsset.map((grp) => (
                  <div
                    key={grp.asset}
                    className="flex items-center justify-between px-2 py-1 text-[9.5px] hover:bg-slate-800/40 transition"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 truncate">
                      <span className="font-black text-slate-100 truncate">{grp.asset}</span>
                      <span className="text-slate-400 font-bold whitespace-nowrap">
                        {grp.count} {grp.count === 1 ? 'ordem' : 'ordens'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`font-black ${grp.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {grp.pnl >= 0 ? '+' : ''}${grp.pnl.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCloseAssetOrders(grp.asset, grp.reports)}
                        title={`Encerrar todas as operações de ${grp.asset}`}
                        className="w-4 h-4 rounded bg-rose-950/80 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-700/60 flex items-center justify-center text-[9px] font-black transition cursor-pointer active:scale-95"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
            </>
          )}
        </div>
      </div>

      {/* ATM Manager Modal */}
      <ATMStrategyModal
        isOpen={isATMModalOpen}
        onClose={() => {
          setIsATMModalOpen(false);
          refreshAtmList();
        }}
        onSelectATM={(atm) => {
          setActiveATM(atm);
          refreshAtmList();
        }}
        currentATM={activeATM}
      />
    </div>
  );
};
