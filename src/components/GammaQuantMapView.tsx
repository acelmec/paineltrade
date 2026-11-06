import React, { useState, useEffect, useMemo } from 'react';
import { fetchAllStudiesForAsset, type StudyRecord } from '../services/mlService';
import { analyzeGammaTopography } from '../services/gammaQuantService';

interface GammaQuantMapViewProps {
  gammaLevels: any;
  marketData: any;
  selectedStudyId?: string;
  onSelectStudy?: (id: string) => void;
}

export const GammaQuantMapView: React.FC<GammaQuantMapViewProps> = ({
  gammaLevels,
  marketData,
  selectedStudyId,
  onSelectStudy
}) => {
  const [studies, setStudies] = useState<StudyRecord[]>([]);
  const [selectedStudy, setSelectedStudy] = useState<StudyRecord | null>(null);

  // Determinar símbolo atual do mercado
  const currentSymbol = (marketData?.symbol || 'NQ').toUpperCase().replace('MINI', '').replace('MICRO', '').trim();

  // Carregar EXCLUSIVAMENTE estudos de Padrões Gamma disponíveis para o símbolo
  useEffect(() => {
    let isMounted = true;
    fetchAllStudiesForAsset(currentSymbol, 'gamma_quant_study').then((list) => {
      if (!isMounted) return;
      const gammaOnly = list.filter(s => s.model_type === 'gamma_quant_study' || s.model_name?.toLowerCase().includes('gamma'));
      setStudies(gammaOnly);
      if (gammaOnly.length > 0) {
        if (selectedStudyId) {
          const found = gammaOnly.find(s => s.id === selectedStudyId);
          setSelectedStudy(found || gammaOnly[0]);
        } else {
          setSelectedStudy(gammaOnly[0]);
        }
      } else {
        setSelectedStudy(null);
      }
    });
    return () => { isMounted = false; };
  }, [currentSymbol, selectedStudyId]);

  // Helper de parse seguro para número
  const parseVal = (v: any): number => {
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    if (!v || v === '--') return 0;
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };

  const rawPrice = marketData?.price ?? marketData?.close ?? 0;
  const currentPrice = parseVal(rawPrice);

  // Mapeamento compatível tanto com o AppContext (levels.prev, put0, call0, hvl0) quanto com Supabase direto
  const hvl = parseVal(gammaLevels?.hvl0 || gammaLevels?.hvl || gammaLevels?.hvl_0dte);
  const adjust = parseVal(gammaLevels?.prev || gammaLevels?.prev_day_adjust || gammaLevels?.ajuste || gammaLevels?.d1_adjust);
  const put0dte = parseVal(gammaLevels?.put0 || gammaLevels?.put_support_0dte || gammaLevels?.put);
  const call0dte = parseVal(gammaLevels?.call0 || gammaLevels?.call_resistance_0dte || gammaLevels?.call);

  // Helper de formatação segura
  const formatNum = (val: any, decimals: number = 1): string => {
    const n = typeof val === 'number' ? val : parseFloat(String(val));
    return isNaN(n) || n === 0 ? '--' : n.toFixed(decimals);
  };

  // Distâncias relativas em pontos (Preço Atual - Nível)
  const distHvl = (currentPrice > 0 && hvl > 0) ? (currentPrice - hvl) : null;
  const distAdjust = (currentPrice > 0 && adjust > 0) ? (currentPrice - adjust) : null;
  const distPut0 = (currentPrice > 0 && put0dte > 0) ? (currentPrice - put0dte) : null;
  const distCall0 = (currentPrice > 0 && call0dte > 0) ? (currentPrice - call0dte) : null;

  // Sessão atual
  const now = new Date();
  const hour = now.getHours();
  const min = now.getMinutes();
  const timeDec = hour + min / 60;

  let sessionName = 'SESSÃO ASIÁTICA';
  let sessionBadge = '🌏 19:00 - 23:59';
  let sessionColor = 'text-amber-400 bg-amber-950/50 border-amber-800/50';

  if (timeDec >= 4.0 && timeDec < 8.5) {
    sessionName = 'SESSÃO EUROPEIA';
    sessionBadge = '🇪🇺 04:00 - 08:29';
    sessionColor = 'text-blue-400 bg-blue-950/50 border-blue-800/50';
  } else if (timeDec >= 8.5 && timeDec < 10.5) {
    sessionName = 'PRÉ-MERCADO EUA';
    sessionBadge = '🇺🇸 08:30 - 10:29';
    sessionColor = 'text-purple-400 bg-purple-950/50 border-purple-800/50';
  } else if (timeDec >= 10.5 && timeDec < 18.0) {
    sessionName = 'RTH / ABERTURA NY';
    sessionBadge = '⚡ 10:30 - 17:59';
    sessionColor = 'text-emerald-400 bg-emerald-950/50 border-emerald-800/50';
  }

  // Identificação do Arquétipo de Mercado em Tempo Real
  let archetypeTitle = 'Defesa de Concreto';
  let archetypeDesc = 'Market makers defendendo extremos institucionais.';
  let archeColor = 'text-cyan-400 border-cyan-500/40 bg-cyan-950/30';

  const spread0dte = Math.abs(call0dte - put0dte);
  const isVoid = gammaLevels?.void_gamma_above || gammaLevels?.void_gamma_below;

  if (isVoid || (put0dte > 0 && currentPrice < put0dte - 30)) {
    archetypeTitle = 'Vácuo de Gamma (Rompimento)';
    archetypeDesc = 'Preço rompendo paredes institucionais. Alta volatilidade.';
    archeColor = 'text-rose-400 border-rose-500/40 bg-rose-950/30';
  } else if (spread0dte > 0 && spread0dte < 140) {
    archetypeTitle = 'Gaiola Institucional (Mean Reversion)';
    archetypeDesc = 'Spreads estreitos. Oscilação consolidada próxima ao HVL.';
    archeColor = 'text-amber-400 border-amber-500/40 bg-amber-950/30';
  } else if (hvl > 0 && adjust > 0 && Math.abs(hvl - adjust) > 150) {
    archetypeTitle = 'Imã de HVL (Gravidade de Volume)';
    archetypeDesc = 'Alta atração de retorno ao centro de liquidez.';
    archeColor = 'text-purple-400 border-purple-500/40 bg-purple-950/30';
  }

  // Viés do Dia (Macro)
  const isAboveAdjust = adjust > 0 ? currentPrice > adjust : false;
  const isAboveHvl = hvl > 0 ? currentPrice > hvl : false;
  let dayBias = 'NEUTRO';
  if (adjust > 0 && hvl > 0) {
    dayBias = isAboveAdjust && isAboveHvl ? 'ALTA' : (!isAboveAdjust && !isAboveHvl ? 'BAIXA' : 'NEUTRO');
  } else if (hvl > 0) {
    dayBias = isAboveHvl ? 'ALTA' : 'BAIXA';
  }

  // Parâmetros de alvo do estudo selecionado (default: 25.0 TP / 25.0 SL)
  let suggestedStop = 25.0;
  let suggestedTarget = 25.0;
  if (selectedStudy) {
    if (selectedStudy.tp_points) suggestedTarget = selectedStudy.tp_points;
    if (selectedStudy.sl_points) suggestedStop = selectedStudy.sl_points;
  }

  // Diagnóstico Topográfico em Tempo Real: Mapeamento de Barreiras, Vácuos e Planos Inteligentes
  const topo = useMemo(() => {
    return analyzeGammaTopography(currentPrice, gammaLevels, suggestedTarget, suggestedStop);
  }, [currentPrice, gammaLevels, suggestedTarget, suggestedStop]);

  // Diagnóstico Tático Dual: Trade da Sessão (Fluxo/Atração) vs Setup Estrutural de Parede
  const touchTolerance = 20.0; // Tolerância de toque institucional (pontos)
  let momentBias = 'NEUTRO';

  // 1. Trade Tático da Sessão (Momentum / Atração / Scalp Inteligente)
  let sessionTrade = {
    badge: '⏳ AGUARDAR',
    badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
    targetInfo: `TP +${suggestedTarget} / SL -${suggestedStop} pts`,
    description: 'Aguardando aproximação dos níveis institucionais de Gamma.'
  };

  // 2. Setup Estrutural Institucional (Chegada nas Paredes 0DTE / Extremos)
  let structuralSetup = {
    badge: '🛡️ PAREDE INSTITUCIONAL',
    badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
    levelLabel: put0dte > 0 ? `Put 0DTE (${formatNum(put0dte, 1)})` : '--',
    description: 'Aguarde o teste dos limites para validar defesas ou rompimentos.'
  };

  if (currentPrice > 0 && put0dte > 0 && call0dte > 0) {
    // 1. Preço rompeu abaixo do Put 0DTE (em vácuo de queda)
    if (currentPrice < put0dte - touchTolerance) {
      const distDown = Math.abs(currentPrice - put0dte);
      momentBias = 'VÁCUO ABAIXO DO PISO (SOBREVENDA)';
      const plan = topo.buyPlan;
      
      sessionTrade = {
        badge: plan.badge,
        badgeColor: plan.badgeColor,
        targetInfo: `TP +${plan.suggestedTP} pts (${formatNum(plan.targetPrice, 1)}) | SL -${plan.suggestedSL} pts`,
        description: `Preço em vácuo (-${formatNum(distDown, 0)} pts do Put 0DTE). Atração de repique na sessão! ${plan.reason} [R:R ${plan.riskRewardRatio}:1]`
      };

      structuralSetup = {
        badge: '🛡️ VENDA NO RETESTE',
        badgeColor: 'bg-rose-950 text-rose-300 border-rose-800',
        levelLabel: `Put 0DTE (${formatNum(put0dte, 1)})`,
        description: `Aguardar o preço retestar ${formatNum(put0dte, 1)}. A parede rompida atuará como teto. Se demonstrar rejeição institucional/exaustão compradora, executar Venda com Stop curto acima de ${formatNum(put0dte + suggestedStop, 1)}.`
      };
    }
    // 2. Preço fazendo pullback/teste no Put 0DTE
    else if (Math.abs(currentPrice - put0dte) <= touchTolerance) {
      if (currentPrice <= put0dte + 3) {
        momentBias = 'RETESTE NO PUT 0DTE (PULLBACK)';
        const plan = topo.sellPlan;
        sessionTrade = {
          badge: plan.favorability === 'POOR' ? '⚠️ PULLBACK ARRISCADO' : '⚡ VENDA DE PULLBACK',
          badgeColor: plan.badgeColor,
          targetInfo: `TP +${plan.suggestedTP} pts | SL ${formatNum(put0dte + suggestedStop, 1)}`,
          description: `Reteste da parede rompida (Put 0DTE ${formatNum(put0dte, 1)}). ${plan.reason}`
        };
        structuralSetup = {
          badge: '🔄 REINSERÇÃO DE GAMMA',
          badgeColor: 'bg-cyan-950 text-cyan-300 border-cyan-800',
          levelLabel: `Put 0DTE (${formatNum(put0dte, 1)})`,
          description: `Se o fluxo comprador romper com firmeza acima de ${formatNum(put0dte + 8, 1)}, invalida a venda de pullback e confirma reinserção de volta à gaiola em direção ao HVL (${formatNum(hvl, 1)}).`
        };
      } else {
        momentBias = 'DEFESA DE SUPORTE (PISO 0DTE)';
        const plan = topo.buyPlan;
        sessionTrade = {
          badge: plan.favorability === 'POOR' ? '⚠️ SUPORTE COM RESISTÊNCIA' : '🛡️ COMPRA DE SUPORTE',
          badgeColor: plan.badgeColor,
          targetInfo: `TP +${plan.suggestedTP} pts | SL ${formatNum(put0dte - suggestedStop, 1)}`,
          description: `Toque de suporte no Put 0DTE (${formatNum(put0dte, 1)}). ${plan.reason}`
        };
        structuralSetup = {
          badge: '⚠️ ROMPIMENTO DE PISO',
          badgeColor: 'bg-amber-950 text-amber-300 border-amber-800',
          levelLabel: `Put 0DTE (${formatNum(put0dte, 1)})`,
          description: `Se o candle fechar abaixo de ${formatNum(put0dte - touchTolerance, 1)}, anular compras. Ativa gatilho de vácuo de baixa até níveis BL/GEX.`
        };
      }
    }
    // 3. Preço testando Call 0DTE (Teto institucional)
    else if (Math.abs(currentPrice - call0dte) <= touchTolerance) {
      momentBias = 'TESTE DE RESISTÊNCIA (CALL 0DTE)';
      const plan = topo.sellPlan;
      sessionTrade = {
        badge: plan.favorability === 'POOR' ? '⚠️ REJEIÇÃO ARRISCADA' : '🛡️ VENDA NO TETO',
        badgeColor: plan.badgeColor,
        targetInfo: `TP +${plan.suggestedTP} pts | SL ${formatNum(call0dte + suggestedStop, 1)}`,
        description: `Toque de resistência no Call 0DTE (${formatNum(call0dte, 1)}). ${plan.reason}`
      };
      structuralSetup = {
        badge: '🚀 ROMPIMENTO DE TETO',
        badgeColor: 'bg-emerald-950 text-emerald-300 border-emerald-800',
        levelLabel: `Call 0DTE (${formatNum(call0dte, 1)})`,
        description: `Se houver rompimento confirmado acima de ${formatNum(call0dte + touchTolerance, 1)} com agressão compradora, anular vendas. Desencadeia squeeze institucional.`
      };
    }
    // 4. Preço rompeu acima do Call 0DTE (Vácuo de alta)
    else if (currentPrice > call0dte + touchTolerance) {
      const distUp = currentPrice - call0dte;
      momentBias = 'VÁCUO ACIMA DO TETO (SOBRECOMPRA)';
      const plan = topo.sellPlan;
      
      sessionTrade = {
        badge: plan.badge,
        badgeColor: plan.badgeColor,
        targetInfo: `TP +${plan.suggestedTP} pts (${formatNum(plan.targetPrice, 1)}) | SL -${plan.suggestedSL} pts`,
        description: `Preço acelerado em vácuo (+${formatNum(distUp, 0)} pts do Call 0DTE). Venda tática de retração! ${plan.reason} [R:R ${plan.riskRewardRatio}:1]`
      };

      structuralSetup = {
        badge: '🛡️ COMPRA NO SUPORTE',
        badgeColor: 'bg-emerald-950 text-emerald-300 border-emerald-800',
        levelLabel: `Call 0DTE (${formatNum(call0dte, 1)})`,
        description: `Ao retrair até ${formatNum(call0dte, 1)}, o teto anterior vira suporte de continuidade. Se confirmar defesa institucional, entrar Comprado para a próxima perna de alta.`
      };
    }
    // 5. Preço navegando no miolo entre Put 0DTE e Call 0DTE
    else if (hvl > 0 && Math.abs(currentPrice - hvl) <= 15) {
      momentBias = 'CONSOLIDAÇÃO NO HVL (CENTRO)';
      sessionTrade = {
        badge: '🔄 EQUILÍBRIO NO HVL',
        badgeColor: 'bg-cyan-950 text-cyan-300 border-cyan-800',
        targetInfo: `TP +${suggestedTarget} / SL -${suggestedStop} pts`,
        description: `Preço no centro gravitacional (${formatNum(hvl, 1)}). Obstáculos imediatos: ${topo.nearestResistance ? `${topo.nearestResistance.name} (+${topo.clearAirUp} pts)` : '--'} e ${topo.nearestSupport ? `${topo.nearestSupport.name} (-${topo.clearAirDown} pts)` : '--'}.`
      };
      structuralSetup = {
        badge: '🎯 DEFINIÇÃO DE EXPANSÃO',
        badgeColor: 'bg-purple-950 text-purple-300 border-purple-800',
        levelLabel: `HVL (${formatNum(hvl, 1)})`,
        description: `Rompendo acima mira Call 0DTE (${formatNum(call0dte, 1)}). Perdendo o centro mira Put 0DTE (${formatNum(put0dte, 1)}). Aguarde teste dos extremos para posicionamento seguro.`
      };
    }
    // 6. Navegando entre Put 0DTE e HVL
    else if (currentPrice < hvl) {
      momentBias = 'ZONA INTERMEDIÁRIA (ABAIXO DO HVL)';
      const plan = topo.sellPlan;
      sessionTrade = {
        badge: plan.badge,
        badgeColor: plan.badgeColor,
        targetInfo: `TP +${plan.suggestedTP} pts | SL -${plan.suggestedSL} pts`,
        description: `Fluxo de baixa em direção ao Put 0DTE (${formatNum(put0dte, 1)}). ${plan.reason}`
      };
      structuralSetup = {
        badge: '🛡️ AGUARDAR TESTE DO PUT 0DTE',
        badgeColor: 'bg-emerald-950 text-emerald-300 border-emerald-800',
        levelLabel: `Put 0DTE (${formatNum(put0dte, 1)})`,
        description: `Aguarde a chegada em ${formatNum(put0dte, 1)} para buscar a Compra de defesa no piso institucional com a melhor relação risco/retorno.`
      };
    }
    // 7. Navegando entre HVL e Call 0DTE
    else {
      momentBias = 'ZONA INTERMEDIÁRIA (ACIMA DO HVL)';
      const plan = topo.buyPlan;
      sessionTrade = {
        badge: plan.badge,
        badgeColor: plan.badgeColor,
        targetInfo: `TP +${plan.suggestedTP} pts | SL -${plan.suggestedSL} pts`,
        description: `Fluxo de alta em direção ao Call 0DTE (${formatNum(call0dte, 1)}). ${plan.reason}`
      };
      structuralSetup = {
        badge: '🛡️ AGUARDAR TESTE DO CALL 0DTE',
        badgeColor: 'bg-rose-950 text-rose-300 border-rose-800',
        levelLabel: `Call 0DTE (${formatNum(call0dte, 1)})`,
        description: `Aguarde a chegada em ${formatNum(call0dte, 1)} para buscar a Venda de rejeição no teto institucional com excelente relação risco/retorno.`
      };
    }
  } else if (currentPrice > 0 && hvl > 0) {
    if (Math.abs(currentPrice - hvl) <= 20) {
      momentBias = 'TESTE DO HVL';
      sessionTrade = {
        badge: '🔄 TESTE DO HVL',
        badgeColor: 'bg-cyan-950 text-cyan-300 border-cyan-800',
        targetInfo: `Aguardar sinal`,
        description: `Preço em teste do centro de gravidade (${formatNum(hvl, 1)}). Aguarde confirmação de fluxo.`
      };
      structuralSetup = {
        badge: '⏳ AGUARDAR',
        badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
        levelLabel: `HVL (${formatNum(hvl, 1)})`,
        description: `Aguardando consolidação dos níveis de Gamma.`
      };
    } else {
      momentBias = currentPrice > hvl ? 'ALTA (ACIMA DO HVL)' : 'BAIXA (ABAIXO DO HVL)';
      sessionTrade = {
        badge: '⏳ EM DESLOCAMENTO',
        badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
        targetInfo: `Aguardar níveis`,
        description: `Aguarde aproximação dos níveis institucionais de Gamma.`
      };
      structuralSetup = {
        badge: '⏳ AGUARDAR',
        badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
        levelLabel: '--',
        description: `Aguardando dados de Gamma 0DTE.`
      };
    }
  }

  // Sincronizar dados do Widget em JSON para consumo em tempo real do Copilot IA
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = {
      widget_type: 'gamma_quant_map',
      symbol: currentSymbol,
      current_price: currentPrice,
      session_name: sessionName,
      archetype_title: archetypeTitle,
      macro_bias: dayBias,
      moment_bias: momentBias,
      levels_0dte: {
        put_0dte: put0dte,
        call_0dte: call0dte,
        hvl_0dte: hvl,
        adjust_d1: adjust,
        dist_put_0dte: distPut0,
        dist_call_0dte: distCall0
      },
      topography: {
        nearest_resistance: topo.nearestResistance,
        nearest_support: topo.nearestSupport,
        clear_air_up_points: topo.clearAirUp,
        clear_air_down_points: topo.clearAirDown,
        congestion_zone: topo.congestionZone,
        buy_plan: topo.buyPlan,
        sell_plan: topo.sellPlan
      },
      session_trade_tactical: sessionTrade,
      structural_wall_setup: structuralSetup,
      study_info: {
        name: selectedStudy?.model_name || 'Gamma Quant Map',
        accuracy: selectedStudy?.metrics?.accuracy || 70,
        target_points: suggestedTarget,
        stop_points: suggestedStop
      },
      updated_at: new Date().toISOString()
    };

    (window as any).__vortex_gamma_quant_map = payload;
    try {
      localStorage.setItem(`vortex_gamma_quant_map_${currentSymbol}`, JSON.stringify(payload));
      localStorage.setItem('vortex_gamma_quant_map_global', JSON.stringify(payload));
    } catch (_) {}
  }, [
    currentSymbol,
    currentPrice,
    sessionName,
    archetypeTitle,
    dayBias,
    momentBias,
    put0dte,
    call0dte,
    hvl,
    adjust,
    distPut0,
    distCall0,
    topo,
    sessionTrade,
    structuralSetup,
    selectedStudy,
    suggestedTarget,
    suggestedStop
  ]);

  return (
    <div className="w-full min-w-[290px] text-xs font-sans text-slate-200 space-y-2.5 p-1 select-none">
      {/* Seletor de Estudo Ativo */}
      <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-white/10">
        <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 shrink-0">
          <span>📚 Estudo:</span>
        </span>
        <select
          value={selectedStudy?.id || ''}
          onChange={(e) => {
            const chosen = studies.find(s => s.id === e.target.value);
            if (chosen) {
              setSelectedStudy(chosen);
              if (onSelectStudy) onSelectStudy(chosen.id!);
            }
          }}
          className="bg-slate-900 border border-slate-700 text-cyan-300 font-semibold text-[10px] rounded px-2 py-0.5 outline-none flex-1 max-w-[280px] truncate"
        >
          {studies.length === 0 ? (
            <option value="">Nenhum estudo salvo</option>
          ) : (
            studies.map((s) => (
              <option key={s.id || s.last_run} value={s.id}>
                {s.model_name || `Estudo ${s.symbol}`} ({s.metrics?.accuracy || 70}%)
              </option>
            ))
          )}
        </select>
      </div>

      {/* Sessão Vigente & Arquétipo */}
      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
        <div className={`p-2 rounded-lg border flex flex-col justify-between ${sessionColor}`}>
          <span className="font-extrabold uppercase tracking-wide text-[11px]">{sessionName}</span>
          <span className="font-mono text-[9px] opacity-80 mt-1">{sessionBadge}</span>
        </div>

        <div className={`p-2 rounded-lg border flex flex-col justify-between ${archeColor}`}>
          <span className="font-extrabold tracking-tight text-[11px] leading-tight">{archetypeTitle}</span>
          <span className="text-[9.5px] opacity-85 mt-1 leading-snug line-clamp-2">{archetypeDesc}</span>
        </div>
      </div>

      {/* Viés do Dia & Viés de Momento */}
      <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 font-medium">Viés do Dia (Macro):</span>
          <span className={`font-black font-mono px-1.5 py-0.5 rounded text-[10px] ${
            dayBias === 'ALTA' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
            dayBias === 'BAIXA' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
            'bg-slate-800 text-slate-300 border border-slate-700'
          }`}>
            {dayBias === 'ALTA' ? '🟢 ALTA' : dayBias === 'BAIXA' ? '🔴 BAIXA' : '⚪ NEUTRO'}
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 font-medium">Viés de Momento:</span>
          <span className="font-bold text-cyan-300 font-mono text-[10px]">
            {momentBias}
          </span>
        </div>
      </div>

      {/* Matriz de Níveis Institucionais & Distâncias */}
      <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-1.5 font-mono text-[10px]">
        <div className="text-[9px] text-slate-400 uppercase font-sans font-bold flex items-center justify-between pb-1 border-b border-slate-800">
          <span>📐 Níveis Gamma &amp; Distâncias</span>
          <span className="text-cyan-400 font-mono font-bold">Preço: {formatNum(currentPrice, 1)}</span>
        </div>

        <div className="space-y-1">
          {/* Call 0DTE */}
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-sans flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
              <span>Call 0DTE:</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-slate-200 font-bold">{call0dte > 0 ? formatNum(call0dte, 1) : '--'}</span>
              <span className={`w-14 text-right font-bold ${distCall0 !== null ? (distCall0 >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-500'}`}>
                {distCall0 !== null ? (distCall0 >= 0 ? `+${formatNum(distCall0, 1)}` : formatNum(distCall0, 1)) : '--'}
              </span>
            </div>
          </div>

          {/* HVL */}
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-sans flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
              <span>HVL (Centro):</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-slate-200 font-bold">{hvl > 0 ? formatNum(hvl, 1) : '--'}</span>
              <span className={`w-14 text-right font-bold ${distHvl !== null ? (distHvl >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-500'}`}>
                {distHvl !== null ? (distHvl >= 0 ? `+${formatNum(distHvl, 1)}` : formatNum(distHvl, 1)) : '--'}
              </span>
            </div>
          </div>

          {/* Ajuste D-1 */}
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-sans flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              <span>Ajuste D-1:</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-slate-200 font-bold">{adjust > 0 ? formatNum(adjust, 1) : '--'}</span>
              <span className={`w-14 text-right font-bold ${distAdjust !== null ? (distAdjust >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-500'}`}>
                {distAdjust !== null ? (distAdjust >= 0 ? `+${formatNum(distAdjust, 1)}` : formatNum(distAdjust, 1)) : '--'}
              </span>
            </div>
          </div>

          {/* Put 0DTE */}
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-sans flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>Put 0DTE:</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-slate-200 font-bold">{put0dte > 0 ? formatNum(put0dte, 1) : '--'}</span>
              <span className={`w-14 text-right font-bold ${distPut0 !== null ? (distPut0 >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-500'}`}>
                {distPut0 !== null ? (distPut0 >= 0 ? `+${formatNum(distPut0, 1)}` : formatNum(distPut0, 1)) : '--'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Topografia de Níveis & Espaço de Scalp */}
      <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 space-y-2 font-mono text-[10px]">
        <div className="text-[9px] text-slate-400 uppercase font-sans font-bold flex items-center justify-between pb-1 border-b border-slate-800">
          <span className="flex items-center gap-1.5">
            <span>🧭 Topografia &amp; Vácuo de Scalp:</span>
          </span>
          <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold border ${
            topo.congestionZone 
              ? 'bg-amber-950 text-amber-300 border-amber-800' 
              : 'bg-emerald-950 text-emerald-300 border-emerald-800'
          }`}>
            {topo.congestionZone ? '⚠️ CONGESTÃO / MURALHAS' : '🚀 AUTOESTRADA LIVRE'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {/* Próxima Resistência */}
          <div className="bg-black/40 p-2 rounded border border-white/5 space-y-1">
            <div className="text-slate-400 font-sans text-[9px] flex items-center justify-between">
              <span>⬆️ Próx. Resistência:</span>
              <span className={`font-bold ${topo.clearAirUp >= suggestedTarget ? 'text-emerald-400' : 'text-rose-400'}`}>
                +{topo.clearAirUp > 500 ? '50+' : topo.clearAirUp} pts
              </span>
            </div>
            <div className="text-slate-200 font-bold truncate text-[10px]">
              {topo.nearestResistance ? `${topo.nearestResistance.name} (${topo.nearestResistance.price.toFixed(1)})` : 'Vácuo Total'}
            </div>
            <div className="text-[8.5px] font-sans text-slate-400">
              {topo.clearAirUp < 12.0 ? '🚨 Tráfego denso (bloqueio)' : topo.clearAirUp >= suggestedTarget ? '✅ Pista livre p/ TP' : '⚠️ Espaço curto'}
            </div>
          </div>

          {/* Próximo Suporte */}
          <div className="bg-black/40 p-2 rounded border border-white/5 space-y-1">
            <div className="text-slate-400 font-sans text-[9px] flex items-center justify-between">
              <span>⬇️ Próx. Suporte:</span>
              <span className={`font-bold ${topo.clearAirDown >= suggestedTarget ? 'text-emerald-400' : 'text-rose-400'}`}>
                -{topo.clearAirDown > 500 ? '50+' : topo.clearAirDown} pts
              </span>
            </div>
            <div className="text-slate-200 font-bold truncate text-[10px]">
              {topo.nearestSupport ? `${topo.nearestSupport.name} (${topo.nearestSupport.price.toFixed(1)})` : 'Vácuo Total'}
            </div>
            <div className="text-[8.5px] font-sans text-slate-400">
              {topo.clearAirDown < 12.0 ? '🚨 Tráfego denso (repique)' : topo.clearAirDown >= suggestedTarget ? '✅ Pista livre p/ TP' : '⚠️ Espaço curto'}
            </div>
          </div>
        </div>
      </div>

      {/* Projeção Tática Dual: Trade da Sessão vs Setup de Parede */}
      <div className="space-y-2">
        {/* Bloco 1: Trade Tático da Sessão (Fluxo / Repique / Atração) */}
        <div className="p-2.5 rounded-lg bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 border border-cyan-800/60 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] flex-wrap gap-1">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-cyan-200">⚡ Trade Tático da Sessão:</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${sessionTrade.badgeColor}`}>
                {sessionTrade.badge}
              </span>
            </div>
            <span className="font-mono text-[9px] font-bold text-emerald-400">
              {sessionTrade.targetInfo}
            </span>
          </div>
          <div className="text-[10.5px] text-slate-100 font-medium leading-relaxed bg-black/40 p-2 rounded border border-white/5 break-words">
            {sessionTrade.description}
          </div>
        </div>

        {/* Bloco 2: Setup Estrutural de Parede (Aguardar Chegada / Próximo Ciclo) */}
        <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] flex-wrap gap-1">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-purple-300">🛡️ Setup de Parede (Chegada):</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${structuralSetup.badgeColor}`}>
                {structuralSetup.badge}
              </span>
            </div>
            <span className="font-mono text-[9px] font-bold text-amber-300">
              {structuralSetup.levelLabel}
            </span>
          </div>
          <div className="text-[10px] text-slate-300 font-medium leading-relaxed bg-black/30 p-2 rounded border border-white/5 break-words">
            {structuralSetup.description}
          </div>
        </div>

        {selectedStudy?.metrics?.accuracy && (
          <div className="text-[9px] text-slate-400 font-mono flex items-center justify-between px-1 pt-0.5">
            <span>Assertividade Base: <strong className="text-slate-200">{selectedStudy.metrics.accuracy}%</strong></span>
            <span>AUC: <strong className="text-cyan-300">{selectedStudy.metrics.auc || 0.75}</strong></span>
          </div>
        )}
      </div>
    </div>
  );
};
