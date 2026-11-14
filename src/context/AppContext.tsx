import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { signInUser, signUpUser, signOutUser, checkActiveSessionAndHeartbeat, resetOrSetUserPassword, updateCurrentUserPassword } from '../services/auth';
import type { SubscriptionPlanDetails } from '../services/wooCommerce';
import {
  fetchMarketDataSupabase,
  fetchForceSupabase,
  fetchGammaLevelsSupabase,
  fetchScreenshotSupabase,
  fetchNewsSupabase,
  getNewsStatusForTimestamp,
  fetchLocalSinal,
  fetchPromptsSupabase,
  savePromptSupabase,
  deletePromptSupabase,
  fetchStrategyReportsSupabase,
  getLocalStrategyReports,
  insertStrategyReportSupabase,
  triggerCopyTradingForMaster,
  updateStrategyReportStatusSupabase,
  updateStrategyReportLevelsSupabase,
  deleteStrategyReportSupabase,
  insertGeneralAnalysisSupabase,
  fetchGeneralAnalysesSupabase,
  deleteGeneralAnalysisSupabase,
  fetchCandlesSupabase,
  detectInternalCandleGap,
  fetchCustomStrategies,
  fetchPublicCustomStrategies,
  saveCustomStrategy,
  deleteCustomStrategy,
  toggleCustomStrategyActive,
  getStableManualStrategyId,
  getAccountManualStrategyId,
  fetchAccountsSupabase,
  createDemoAccountSupabase,
  resetDemoAccountSupabase,
  deleteAccountSupabase,
  fetchAccountStrategiesSupabase,
  saveAccountStrategySupabase,
  deleteAccountStrategySupabase,
  generateSecureUUID,
  withDbTimeout,
  fetchCopyTradingConfigsSupabase,
  fetchRemoteCopySubscriptionsSupabase,
  mirrorToLocalServer,
  resolveAccountExecutionSymbol,
  resolvePanelTickSize,
  roundToTick,
  fetchAtmStrategiesSupabase,
  getLocalBrokerAccounts,
  normalizeStrategyStages,
  fetchOptionsMarketSupabase,
  isNinjaExecutionAccount,
  isNinjaMasterAccount,
  saveLocalStrategyReports,
  validateAccountTradingRules,
  getLocalCopyTradingConfigs,
  syncAllCopyRulesToNinjaTrader,
  isSameAsset,
  saveNinjaLiveBridgeSnapshotSupabase,
  fetchNinjaPendingRemoteCommandsSupabase,
  markNinjaRemoteCommandExecutedSupabase,
  getNinjaAccountMetricsCache,
  getLocalCopyMessages,
  logCopyTradingMessage,
  fetchAndSyncNinjaTunnelConfigSupabase,
  cleanAndSanitizeCandles
} from '../services/db';
import { LEGACY_INDICATOR_MAP } from '../utils/algorithmIndicators';
import type {
  MarketData,
  BlockTrade,
  GammaLevels,
  OptionsMarketData,
  EconomicNewsItem,
  AIPrompt,
  StrategyReport,
  AIGeneralAnalysisRecord,
  Candle,
  BrokerAccount,
  AccountStrategy,
  CopyTradingConfig,
  RemoteCopySubscription,
  CustomStrategy
} from '../services/db';
import { runMarketAnalysis, runGeneralAnalysis, askCopilotChat, DEFAULT_GENERAL_PROMPT_TEMPLATE } from '../services/ai';
import type { AIResponse, AIGeneralAnalysisResponse } from '../services/ai';
import { speakText } from '../services/tts';
import { generateCandleChartScreenshot } from '../utils/chartScreenshot';
import { getSaoPauloDate, formatSaoPauloTime, isTimeInSessions, isMarketSessionPaused, isMarketClosed, getTradingSessionKey, syncServerClock, getSyncedNowMs, parseInputToDate } from '../utils/date';
import { calculateVolumeProfileAnalysis, calculateIndicator, calculateMACDDivergences, calculateVolumeSpikePivotsAnalysis, calculateAxionTrend, type IndicatorConfig } from '../utils/indicatorRegistry';
import { computeDynamicSupportResistance } from '../utils/replayEngine';
import { LocalNotifications } from '@capacitor/local-notifications';
import {
  checkNinjaStatus,
  fetchNinjaMasterEvents,
  fetchNinjaPositionsAndOrders,
  fetchNinjaAccounts,
  closeNinjaPosition,
  cancelNinjaOrder,
  cancelAllNinjaOrders,
  flattenAllNinjaAccounts,
  reconnectCloudChannel
} from '../services/ninjaGateway';
import { fetchStreamerMarketData, isStreamerWsConnected } from '../services/vortexStreamer';
import { PRESET_ATM_STRATEGIES, resolveAlgorithmAtm, type ATMStrategy, type ATMBracket } from '../utils/atmRegistry';

function extractPriceActionFromCandles(candles: Candle[]) {
  if (!candles || candles.length === 0) return undefined;
  const recent = candles.slice(-4);
  if (recent.length === 0) return undefined;

  const current = recent[recent.length - 1];
  const prev1 = recent[recent.length - 2] || current;
  const prev2 = recent[recent.length - 3] || prev1;
  const prev3 = recent[recent.length - 4] || prev2;

  const getWicksAndBody = (c: Candle) => {
    const body = Math.abs(c.close - c.open);
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const dir = c.close > c.open ? 'ALTA' : c.close < c.open ? 'BAIXA' : 'DOJI';
    return { body: Number(body.toFixed(2)), upperWick: Number(upperWick.toFixed(2)), lowerWick: Number(lowerWick.toFixed(2)), dir };
  };

  const c0 = getWicksAndBody(current);
  const c1 = getWicksAndBody(prev1);
  const c2 = getWicksAndBody(prev2);
  const c3 = getWicksAndBody(prev3);

  const last10 = candles.slice(-10);
  const avgVol = last10.reduce((acc, cur) => acc + (cur.volume || 0), 0) / (last10.length || 1);
  const volRatio = avgVol > 0 ? Number(((current.volume || 0) / avgVol).toFixed(2)) : 1.0;

  return {
    currentCandle: {
      direction: c0.dir as any,
      bodyPts: c0.body,
      upperWickPts: c0.upperWick,
      lowerWickPts: c0.lowerWick,
      volumeRatio: volRatio
    },
    recentCandles: [
      { index: -3, direction: c3.dir as any, bodyPts: c3.body, upperWickPts: c3.upperWick, lowerWickPts: c3.lowerWick },
      { index: -2, direction: c2.dir as any, bodyPts: c2.body, upperWickPts: c2.upperWick, lowerWickPts: c2.lowerWick },
      { index: -1, direction: c1.dir as any, bodyPts: c1.body, upperWickPts: c1.upperWick, lowerWickPts: c1.lowerWick }
    ]
  };
}

export function formatGammaLevelsObject(finalLevels: any): { [key: string]: string } {
  const levelsObj: { [key: string]: string } = {};
  if (!finalLevels) return levelsObj;

  Object.entries(finalLevels).forEach(([key, val]) => {
    if (typeof val === 'string' && val !== '--') {
      levelsObj[key] = val;
    } else if (typeof val === 'number') {
      levelsObj[key] = String(val);
    }
  });

  // Mapear Níveis GEX (1..10)
  if (Array.isArray(finalLevels.gex) && finalLevels.gex.length > 0) {
    finalLevels.gex.forEach((price: number, idx: number) => {
      levelsObj[`gex_${idx + 1}`] = String(price);
    });
    levelsObj['gex_niveis_completos'] = finalLevels.gex.map((p: number, i: number) => `GEX${i + 1}=${p}`).join(', ');
  }

  // Mapear Níveis BL (1..10)
  if (Array.isArray(finalLevels.bl) && finalLevels.bl.length > 0) {
    finalLevels.bl.forEach((price: number, idx: number) => {
      levelsObj[`bl_${idx + 1}`] = String(price);
    });
    levelsObj['bl_niveis_completos'] = finalLevels.bl.map((p: number, i: number) => `BL${i + 1}=${p}`).join(', ');
  }

  return levelsObj;
}

function extractActiveIndicatorsFromStorage(
  panel: { id?: string; instance_id?: string; name?: string; symbol?: string } | string,
  candles: Candle[],
  gammaLevels?: GammaLevels | null,
  accountId?: string
) {
  if (!candles || candles.length < 5) return undefined;
  try {
    const pId = typeof panel === 'string' ? panel : (panel.id || panel.instance_id || panel.name || '');
    const pName = typeof panel === 'string' ? panel : (panel.name || panel.symbol || '');
    const pSym = typeof panel === 'string' ? panel : (panel.symbol || panel.name || '');
    const accKey = accountId || '';

    let raw: string | null = null;
    
    // 1. Tentar chaves exatas salvas por conta e painel
    if (accKey && pId) raw = localStorage.getItem(`vortex_active_indicators_${accKey}_${pId}`);
    if (!raw && accKey && pSym) raw = localStorage.getItem(`vortex_active_indicators_${accKey}_${pSym}`);
    if (!raw && pId) raw = localStorage.getItem(`vortex_active_indicators_${pId}`);
    if (!raw && pSym) raw = localStorage.getItem(`vortex_active_indicators_${pSym}`);
    if (!raw && pName) raw = localStorage.getItem(`vortex_active_indicators_${pName}`);

    // 2. Tentar busca dinâmica por chaves do painel
    if (!raw) {
      for (let k = 0; k < localStorage.length; k++) {
        const key = localStorage.key(k);
        if (key && key.startsWith('vortex_active_indicators_')) {
          if ((pId && key.includes(pId)) || (pSym && key.includes(pSym)) || (pName && key.includes(pName))) {
            raw = localStorage.getItem(key);
            if (raw) break;
          }
        }
      }
    }

    if (!raw) raw = localStorage.getItem('vortex_workstation_indicators');
    if (!raw) return undefined;

    const indicators: IndicatorConfig[] = JSON.parse(raw);
    if (!Array.isArray(indicators) || indicators.length === 0) return undefined;

    const currentPrice = candles[candles.length - 1]?.close || 0;
    const summaries: Array<{ name: string; type: string; valueSummary: string; interpretation?: string }> = [];

    for (const ind of indicators) {
      if (ind.visible === false) continue;

      // A. Indicadores de Níveis Gamma / Diários / Opções / Liquidez / Ajuste
      if (
        ind.type === 'LEVELS_DAILY' || 
        ind.type === 'LEVELS_GAMMA' || 
        ind.type === 'LEVELS_OPTIONS' || 
        ind.type === 'LEVELS_LIQUIDITY' || 
        ind.type === 'GammaLevels' || 
        ind.type === 'GAMMA_LEVELS'
      ) {
        const gL = gammaLevels;
        const parts: string[] = [];
        const interpParts: string[] = [];

        if (ind.type === 'LEVELS_DAILY' || ind.type === 'GammaLevels' || ind.type === 'GAMMA_LEVELS') {
          if (gL?.prev && gL.prev !== '--') {
            const prevNum = parseFloat(gL.prev);
            const pos = currentPrice >= prevNum ? 'acima (comprador)' : 'abaixo (vendedor)';
            parts.push(`Preço de Ajuste (prev): ${gL.prev}`);
            interpParts.push(`Preço de Ajuste / Fechamento Anterior em ${gL.prev} (o preço atual está ${pos} do ajuste)`);
          }
          if (gL?.max1d && gL.max1d !== '--') {
            parts.push(`Máxima Projetada (Max): ${gL.max1d}`);
            interpParts.push(`Máxima Projetada 1D em ${gL.max1d}`);
          }
          if (gL?.min1d && gL.min1d !== '--') {
            parts.push(`Mínima Projetada (Min): ${gL.min1d}`);
            interpParts.push(`Mínima Projetada 1D em ${gL.min1d}`);
          }
          if (gL?.prevH && gL.prevH !== '--') {
            parts.push(`Máx Anterior (MxAnt): ${gL.prevH}`);
          }
          if (gL?.prevL && gL.prevL !== '--') {
            parts.push(`Mín Anterior (MnAnt): ${gL.prevL}`);
          }
        }

        if (ind.type === 'LEVELS_GAMMA' || ind.type === 'GammaLevels' || ind.type === 'GAMMA_LEVELS') {
          if (gL?.hvl && gL.hvl !== '--') {
            const hvlNum = parseFloat(gL.hvl);
            const pos = currentPrice >= hvlNum ? 'acima (viés comprador)' : 'abaixo (viés vendedor)';
            parts.push(`HVL (Pivot Gamma): ${gL.hvl}`);
            interpParts.push(`Pivot Gamma Principal (HVL) em ${gL.hvl} (preço atual está ${pos})`);
          }
          if (gL?.gwall && gL.gwall !== '--') {
            parts.push(`GWall (Gamma Wall): ${gL.gwall}`);
            interpParts.push(`Gamma Wall em ${gL.gwall} (forte barreira de resistência/suporte institucional)`);
          }
          if (gL?.hvl0 && gL.hvl0 !== '--') {
            parts.push(`HVL0 (Intradiário 0DTE): ${gL.hvl0}`);
          }
        }

        if (ind.type === 'LEVELS_OPTIONS' || ind.type === 'GammaLevels' || ind.type === 'GAMMA_LEVELS') {
          if (gL?.call && gL.call !== '--') {
            parts.push(`Call Resistance: ${gL.call}`);
            interpParts.push(`Call Resistance 0DTE em ${gL.call} (teto de opções)`);
          }
          if (gL?.put && gL.put !== '--') {
            parts.push(`Put Support: ${gL.put}`);
            interpParts.push(`Put Support 0DTE em ${gL.put} (piso de opções)`);
          }
          if (gL?.call0 && gL.call0 !== '--') parts.push(`Call0: ${gL.call0}`);
          if (gL?.put0 && gL.put0 !== '--') parts.push(`Put0: ${gL.put0}`);
        }

        if (ind.type === 'LEVELS_LIQUIDITY' || ind.type === 'GammaLevels' || ind.type === 'GAMMA_LEVELS') {
          if (gL?.bl && gL.bl.length > 0) {
            const blList = gL.bl.map((val: number, i: number) => `BL${i + 1}=${val}`);
            parts.push(`Níveis BL (1..${gL.bl.length}): ${blList.join(', ')}`);
          }
          if (gL?.gex && gL.gex.length > 0) {
            const gexList = gL.gex.map((val: number, i: number) => `GEX${i + 1}=${val}`);
            parts.push(`Níveis GEX (1..${gL.gex.length}): ${gexList.join(', ')}`);
          }
        }

        if (parts.length > 0) {
          summaries.push({
            name: ind.name || 'Níveis Gamma & Referências Diárias',
            type: ind.type,
            valueSummary: parts.join(' | '),
            interpretation: interpParts.join('. ') + '.'
          });
        }
        continue;
      }

      const calc = calculateIndicator(ind, candles, {
        systemSessionStart: '19:00:00',
        systemSessionEnd: '18:00:00'
      });
      if (!calc) continue;

      if (calc.series && calc.series.length > 0) {
        if (ind.type === 'LEVELS_TIME_RANGE') {
          // Extrair os últimos valores válidos de Máxima, Mínima e Médio 50%
          const lastHighSeries = calc.series.filter(s => s.name.startsWith('Máx')).pop();
          const lastLowSeries = calc.series.filter(s => s.name.startsWith('Mín')).pop();
          const lastMidSeries = calc.series.filter(s => s.name.startsWith('Médio')).pop();

          const maxVal = lastHighSeries?.data[lastHighSeries.data.length - 1]?.value;
          const minVal = lastLowSeries?.data[lastLowSeries.data.length - 1]?.value;
          const midVal = lastMidSeries?.data[lastMidSeries.data.length - 1]?.value;

          if (maxVal !== undefined && minVal !== undefined) {
            let positionRel = 'DENTRO_DO_RANGE';
            if (currentPrice > maxVal) positionRel = 'ROMPENDO_MAXIMA_ALTA';
            else if (currentPrice < minVal) positionRel = 'ROMPENDO_MINIMA_BAIXA';

            summaries.push({
              name: ind.name,
              type: ind.type,
              valueSummary: `Máx: ${maxVal.toFixed(2)} | Médio 50%: ${midVal !== undefined ? midVal.toFixed(2) : '--'} | Mín: ${minVal.toFixed(2)} (${positionRel})`,
              interpretation: `Faixa de Horário: Máxima em ${maxVal.toFixed(2)}, Mínima em ${minVal.toFixed(2)} e Ponto Médio em ${midVal?.toFixed(2) || '--'}. O preço atual (${currentPrice.toFixed(2)}) está ${positionRel === 'ROMPENDO_MAXIMA_ALTA' ? 'acima da máxima (pressão compradora / breakout)' : positionRel === 'ROMPENDO_MINIMA_BAIXA' ? 'abaixo da mínima (pressão vendedora / breakdown)' : 'trabalhando dentro da faixa de consolidação'}.`
            });
          }
        } else if (ind.type === 'MACD') {
          const lastMacd = calc.series.find(s => s.name.startsWith('MACD'))?.data.slice(-1)[0]?.value ?? 0;
          const lastSignal = calc.series.find(s => s.name.startsWith('Sinal'))?.data.slice(-1)[0]?.value ?? 0;
          const lastHist = calc.series.find(s => s.name.startsWith('Histograma'))?.data.slice(-1)[0]?.value ?? 0;
          const divergences = calc.customData?.divergences || [];
          const lastDiv = divergences[divergences.length - 1];

          const histStatus = lastHist > 0 ? (lastHist > (calc.series.find(s => s.name.startsWith('Histograma'))?.data.slice(-2)[0]?.value ?? 0) ? 'Expansão Compradora (Forte)' : 'Perda de Força Compradora') : (lastHist < (calc.series.find(s => s.name.startsWith('Histograma'))?.data.slice(-2)[0]?.value ?? 0) ? 'Expansão Vendedora (Forte)' : 'Perda de Força Vendedora');
          const divInfo = lastDiv ? ` | Divergência Recente: ${lastDiv.type === 'BULLISH' ? 'Alta (Bullish)' : 'Baixa (Bearish)'}` : '';

          summaries.push({
            name: ind.name,
            type: ind.type,
            valueSummary: `Hist: ${lastHist.toFixed(2)} (${histStatus}) | MACD: ${lastMacd.toFixed(2)} | Sinal: ${lastSignal.toFixed(2)}${divInfo}`,
            interpretation: `MACD: Histograma em ${lastHist.toFixed(2)} (${histStatus}), Linha MACD (${lastMacd.toFixed(2)}) ${lastMacd >= lastSignal ? 'acima' : 'abaixo'} do Sinal (${lastSignal.toFixed(2)}).${lastDiv ? ` Atenção para divergência de ${lastDiv.type === 'BULLISH' ? 'Alta' : 'Baixa'} detectada no gráfico.` : ''}`
          });
        } else if (ind.type === 'EMACD' || ind.type === 'MACD_EXPLOSION') {
          const lastHist = calc.series.find(s => s.name.includes('Histograma'))?.data.slice(-1)[0]?.value ?? 0;
          const lastExp = calc.series.find(s => s.name.includes('Explosão'))?.data.slice(-1)[0]?.value ?? 0;
          const lastDead = calc.series.find(s => s.name.includes('Dead Zone'))?.data.slice(-1)[0]?.value ?? 20;
          const trendList = calc.customData?.trend || [];
          const currentTrend = trendList[trendList.length - 1] || 'neutro';

          const isExplosion = Math.abs(lastHist) > lastExp && Math.abs(lastHist) > lastDead;

          summaries.push({
            name: ind.name,
            type: ind.type,
            valueSummary: `Hist: ${lastHist.toFixed(1)} | Linha Explosão: ${lastExp.toFixed(1)} | Tendência: ${currentTrend.toUpperCase()}${isExplosion ? ' (⚡ EXPLOSÃO ATIVA)' : ' (Zona Neutra/Acúmulo)'}`,
            interpretation: `e-MACD / MACD Explosion: Tendência institucional ${currentTrend.toUpperCase()}. ${isExplosion ? 'O histograma SUPEROU a linha de explosão, indicando forte impulso direcional!' : 'Dentro da zona de consolidação/sem explosão no momento.'}`
          });
        } else if (calc.series.length > 1) {
          // Indicador multi-linhas (ex: Bandas de Bollinger, Canais, etc.)
          const parts: string[] = [];
          calc.series.forEach(s => {
            const val = s.data[s.data.length - 1]?.value;
            if (val !== undefined && !isNaN(val)) {
              parts.push(`${s.name}: ${val.toFixed(2)}`);
            }
          });
          if (parts.length > 0) {
            summaries.push({
              name: ind.name,
              type: ind.type,
              valueSummary: parts.join(' | '),
              interpretation: `${ind.name} com níveis atuais: ${parts.join(', ')}.`
            });
          }
        } else {
          // Indicador de linha única (ex: EMA, SMA, VWAP, RSI)
          const primarySeries = calc.series[0];
          const lastVal = primarySeries.data[primarySeries.data.length - 1]?.value;
          if (lastVal !== undefined && !isNaN(lastVal)) {
            const relation = currentPrice >= lastVal ? 'PRECO_ACIMA' : 'PRECO_ABAIXO';
            let rsiContext = '';
            if (ind.type === 'RSI') {
              rsiContext = lastVal >= 70 ? ' (Sobrecomprado)' : lastVal <= 30 ? ' (Sobrevendido)' : ' (Neutro)';
            }
            summaries.push({
              name: ind.name,
              type: ind.type,
              valueSummary: `${lastVal.toFixed(2)}${rsiContext} (${relation})`,
              interpretation: `${ind.name} está em ${lastVal.toFixed(2)}${rsiContext}. Preço atual está ${currentPrice >= lastVal ? 'acima (suporte)' : 'abaixo (resistência)'}.`
            });
          }
        }
      } else if (calc.customData || (calc.markers && calc.markers.length > 0)) {
        if (ind.type === 'FVG') {
          const unmitigated = calc.customData?.unmitigatedGaps || [];
          const upGaps = unmitigated.filter((g: any) => g.isUp).slice(-2);
          const downGaps = unmitigated.filter((g: any) => !g.isUp).slice(-2);
          const fvgParts: string[] = [];
          if (upGaps.length > 0) fvgParts.push(`Alta: ${upGaps.map((g: any) => `[${g.bottom.toFixed(2)} - ${g.top.toFixed(2)}]`).join(', ')}`);
          if (downGaps.length > 0) fvgParts.push(`Baixa: ${downGaps.map((g: any) => `[${g.bottom.toFixed(2)} - ${g.top.toFixed(2)}]`).join(', ')}`);

          summaries.push({
            name: ind.name || 'Fair Value Gaps (FVG)',
            type: ind.type,
            valueSummary: fvgParts.length > 0 ? fvgParts.join(' | ') : 'Nenhum gap virgem no momento.',
            interpretation: `Fair Value Gaps (FVG): Zonas de ineficiência de preço ativas. ${fvgParts.length > 0 ? fvgParts.join(' | ') : 'Preço trabalhando em regiões equilibradas.'}`
          });
        } else if (ind.type === 'ElliottWaves') {
          const waveMarkers = calc.markers || [];
          const lastWaves = waveMarkers.slice(-5).map((m: any) => `Onda ${m.text}`).join(' -> ');
          summaries.push({
            name: ind.name || 'Ondas de Elliott Automáticas',
            type: ind.type,
            valueSummary: lastWaves || 'Mapeando ciclo de ondas...',
            interpretation: `Ondas de Elliott: Sequência recente identificada: ${lastWaves || 'formação inicial'}.`
          });
        } else if (ind.type === 'SMC_OB') {
          const obs = calc.customData?.orderBlocks || [];
          const bullishObs = obs.filter((o: any) => o.type === 'bullish').slice(-2);
          const bearishObs = obs.filter((o: any) => o.type === 'bearish').slice(-2);
          const obSummary = `Bullish OBs: ${bullishObs.map((b: any) => `[${Number(b.bottom).toFixed(2)} - ${Number(b.top).toFixed(2)}]`).join(', ') || 'Nenhum'} | Bearish OBs: ${bearishObs.map((b: any) => `[${Number(b.bottom).toFixed(2)} - ${Number(b.top).toFixed(2)}]`).join(', ') || 'Nenhum'}`;
          summaries.push({
            name: ind.name,
            type: ind.type,
            valueSummary: obSummary,
            interpretation: `Smart Money Concepts (SMC): Order Blocks de Demanda (Compra) em ${bullishObs.map((b: any) => `${Number(b.bottom).toFixed(2)}-${Number(b.top).toFixed(2)}`).join(', ') || 'nenhum'} e Oferta (Venda) em ${bearishObs.map((b: any) => `${Number(b.bottom).toFixed(2)}-${Number(b.top).toFixed(2)}`).join(', ') || 'nenhum'}.`
          });
        } else if (ind.type === 'SMC_Liquidity') {
          const pools = calc.customData?.liquidityPools || [];
          const eqh = pools.filter((p: any) => p.text.includes('EQH')).length;
          const eql = pools.filter((p: any) => p.text.includes('EQL')).length;
          summaries.push({
            name: ind.name,
            type: ind.type,
            valueSummary: `Piscinas de Liquidez: ${eqh} Equal Highs (Topos Duplos/EQH) | ${eql} Equal Lows (Fundos Duplos/EQL)`,
            interpretation: `SMC Liquidity Pools: Concentração de ordens de stop e liquidez institucional em ${eqh} regiões de topo (EQH) e ${eql} regiões de fundo (EQL).`
          });
        } else if (ind.type === 'SMC_BOS_CHOCH') {
          const markers = calc.markers || [];
          const lastStructure = markers.slice(-3).map((m: any) => m.text).join(' | ');
          summaries.push({
            name: ind.name,
            type: ind.type,
            valueSummary: `Estrutura de Mercado Recente: ${lastStructure || 'Consolidação'}`,
            interpretation: `SMC Estrutura: ${lastStructure ? `Últimos rompimentos estruturais: ${lastStructure}.` : 'Sem quebra recente de pivô.'}`
          });
        } else if (ind.type === 'VOLUME_HVN_BLOCKS' && calc.customData?.volumeProfile?.hvnBlocks) {
          const blocks = calc.customData.volumeProfile.hvnBlocks;
          const blocksSummary = blocks.map((b: any) => `#${b.rank} Centro: ${Number(b.priceCenter).toFixed(2)} [${Number(b.priceBottom).toFixed(2)} - ${Number(b.priceTop).toFixed(2)}] Vol: ${Number(b.volume).toFixed(0)}`).join(' | ');
          const nearBlock = blocks.find((b: any) => currentPrice >= b.priceBottom && currentPrice <= b.priceTop);

          summaries.push({
            name: ind.name || 'Blocos de Absorção & HVN',
            type: ind.type,
            valueSummary: blocksSummary || 'Nenhum bloco detectado.',
            interpretation: `Blocos de Absorção / HVN: ${blocks.length} blocos institucionais ativos. ${nearBlock ? `O preço atual (${currentPrice.toFixed(2)}) está DENTRO do Bloco #${nearBlock.rank} (${nearBlock.priceBottom.toFixed(2)} - ${nearBlock.priceTop.toFixed(2)}), indicando forte zona de absorção/defesa de lote.` : `Bloco mais próximo em ${blocks[0]?.priceCenter ? Number(blocks[0].priceCenter).toFixed(2) : '--'}.`}`
          });
        } else if (ind.type === 'VOLUME_LEVELS' && calc.customData?.volumeProfile?.levels) {
          const lv = calc.customData.volumeProfile.levels;
          const naked = lv.nakedPocs || [];
          const nakedStr = naked.length > 0 ? naked.map((p: any) => `${Number(p.price).toFixed(2)} (${p.dateStr || ''})`).join(', ') : 'Nenhuma';
          
          let pos = 'DENTRO_DA_VALUE_AREA';
          if (currentPrice > lv.vah) pos = 'ACIMA_DO_VAH (Região de Excesso Comprador)';
          else if (currentPrice < lv.val) pos = 'ABAIXO_DO_VAL (Região de Desconto Vendedor)';

          summaries.push({
            name: ind.name || 'Níveis de Volume Institucional',
            type: ind.type,
            valueSummary: `VPOC: ${Number(lv.poc).toFixed(2)} | VAH: ${Number(lv.vah).toFixed(2)} | VAL: ${Number(lv.val).toFixed(2)} | Naked POCs: ${nakedStr}`,
            interpretation: `Níveis de Volume Institucional: VPOC (Ponto de Maior Volume) em ${Number(lv.poc).toFixed(2)}, VAH em ${Number(lv.vah).toFixed(2)}, VAL em ${Number(lv.val).toFixed(2)}. Posição Atual: ${pos}. Naked POCs virgens pendentes de teste: ${nakedStr}.`
          });
        } else if (ind.type === 'VOLUME_HEATMAP' && calc.customData?.volumeProfile?.bins) {
          const bins = calc.customData.volumeProfile.bins;
          const hotBins = bins.filter((b: any) => (b.intensity || 0) >= 0.6).slice(0, 4);
          const heatStr = hotBins.map((b: any) => `[${Number(b.priceBottom).toFixed(2)} - ${Number(b.priceTop).toFixed(2)}] (Intensidade: ${Math.round((b.intensity || 0) * 100)}%)`).join(' | ');

          summaries.push({
            name: ind.name || 'Zonas de Calor de Volume',
            type: ind.type,
            valueSummary: heatStr || 'Zonas de calor homogêneas.',
            interpretation: `Zonas de Calor de Volume: Principais nós térmicos de alta densidade de contratos nas faixas: ${heatStr || 'sem picos concentrados'}.`
          });
        } else if (ind.type === 'VOLUME_SPIKE_PIVOTS') {
          const barsToCheck = ind.params?.barsToCheck || 5;
          const volumeAveragePeriod = ind.params?.volumeAveragePeriod || 20;
          const volumeMultiple = ind.params?.volumeMultiple || 1.5;

          const analysis = calculateVolumeSpikePivotsAnalysis(candles, {
            barsToCheck,
            volumeAveragePeriod,
            volumeMultiple,
            currentPrice
          });

          const buyLines = analysis.activeBuyLevels.map(b => `${b.level.toFixed(2)} (${b.barsAgo} barras atrás, dist: ${Math.abs(currentPrice - b.level).toFixed(1)} pts)`).join(', ');
          const sellLines = analysis.activeSellLevels.map(s => `${s.level.toFixed(2)} (${s.barsAgo} barras atrás, dist: ${Math.abs(s.level - currentPrice).toFixed(1)} pts)`).join(', ');

          const summary = `Níveis de Compra Ativos (${analysis.activeBuyCount}): ${buyLines || 'Nenhum'} | Níveis de Venda Ativos (${analysis.activeSellCount}): ${sellLines || 'Nenhum'}`;

          let interp = `Volume Spike Pivots: Detectados ${analysis.activeBuyCount} nível(is) de compra (suporte) e ${analysis.activeSellCount} nível(is) de venda (resistência) formados com volume anômalo e ainda não rompidos. `;
          if (analysis.nearestBuyLevel > 0) {
            interp += `Suporte de compra mais próximo em ${analysis.nearestBuyLevel.toFixed(2)} (${analysis.distanceToNearestBuy.toFixed(1)} pts abaixo). `;
          }
          if (analysis.nearestSellLevel > 0) {
            interp += `Resistência de venda mais próxima em ${analysis.nearestSellLevel.toFixed(2)} (${analysis.distanceToNearestSell.toFixed(1)} pts acima). `;
          }
          if (analysis.touchBuy === 'sim') {
            interp += `⚠️ ATENÇÃO: Preço atual está TESTANDO/TOCANDO nível de compra de Spike de Volume! `;
          }
          if (analysis.touchSell === 'sim') {
            interp += `⚠️ ATENÇÃO: Preço atual está TESTANDO/TOCANDO nível de venda de Spike de Volume! `;
          }
          if (analysis.activeBuyLevels.length > 1) {
            interp += `Níveis de compra mais antigos virgens não testados: ${analysis.activeBuyLevels.slice(1).map(b => `${b.level.toFixed(2)} (${b.barsAgo}b atrás)`).join(', ')}. `;
          }
          if (analysis.activeSellLevels.length > 1) {
            interp += `Níveis de venda mais antigos virgens não testados: ${analysis.activeSellLevels.slice(1).map(s => `${s.level.toFixed(2)} (${s.barsAgo}b atrás)`).join(', ')}. `;
          }

          summaries.push({
            name: ind.name || 'Volume Spike Pivots',
            type: ind.type,
            valueSummary: summary,
            interpretation: interp.trim()
          });
        } else if (ind.type === 'AXION_ML_PREDICTOR' && calc.customData?.radar) {
          const r = calc.customData.radar;
          const dir = r.direction || 'NEUTRO';
          const probB = r.probBuy !== undefined ? `${r.probBuy}%` : `${r.probability || 0}%`;
          const probS = r.probSell !== undefined ? `${r.probSell}%` : '--';
          const tact = r.tacticalPerspective ? `Perspectiva Tática: ${r.tacticalPerspective}` : '';
          const status = r.status ? `Status: ${r.status}` : '';
          const atr = r.atr14 ? `ATR(14): ${r.atr14}` : '';
          const smaDist = r.distSma60 !== undefined ? `ΔSMA60: ${r.distSma60} pts` : '';
          const tp = r.dynamicTp ? `Alvo TP Dinâmico: ±${r.dynamicTp} pts` : '';
          const sl = r.dynamicSl ? `Stop Dinâmico: ±${r.dynamicSl} pts` : '';

          const parts = [`Direção: ${dir} (${r.strengthLabel || 'NEUTRO'})`, `Prob Compra: ${probB} | Prob Venda: ${probS}`, tact, status, atr, smaDist, tp, sl].filter(Boolean).join(' | ');

          summaries.push({
            name: ind.name || 'Axion ML Radar Preditivo',
            type: ind.type,
            valueSummary: parts,
            interpretation: `Radar de Machine Learning: Viés ${dir} com probabilidades Compra ${probB} vs Venda ${probS}. ${tact ? `Cenário tático: ${tact}.` : ''} ${tp ? `Projeção calculada por volatilidade ATR: ${tp} / ${sl}.` : ''}`
          });
        } else if (calc.customData?.volumeProfile) {
          const vp = calc.customData.volumeProfile;
          summaries.push({
            name: ind.name,
            type: ind.type,
            valueSummary: `VPOC: ${vp.levels?.poc ? Number(vp.levels.poc).toFixed(2) : '--'} | VAH: ${vp.levels?.vah ? Number(vp.levels.vah).toFixed(2) : '--'} | VAL: ${vp.levels?.val ? Number(vp.levels.val).toFixed(2) : '--'}`
          });
        } else {
          summaries.push({
            name: ind.name,
            type: ind.type,
            valueSummary: 'Ativo e visível no gráfico.'
          });
        }
      }
    }

    return summaries.length > 0 ? summaries : undefined;
  } catch (e) {
    console.warn('[extractActiveIndicatorsFromStorage Error]', e);
    return undefined;
  }
}

function extractActiveWidgetsFromStorage(
  panel: { id?: string; instance_id?: string; name?: string; symbol?: string } | string,
  marketData?: any,
  forces?: any[],
  gammaLevels?: GammaLevels | null,
  optionsMarket?: any,
  accountId?: string
): Array<{ id: string; type: string; title: string; summary: string; dataJSON?: any }> | undefined {
  try {
    const pId = typeof panel === 'string' ? panel : (panel.id || panel.instance_id || panel.name || '');
    const pName = typeof panel === 'string' ? panel : (panel.name || panel.symbol || '');
    const pSym = typeof panel === 'string' ? panel : (panel.symbol || panel.name || '');
    const accKey = accountId || '';

    let raw: string | null = null;
    if (accKey && pId) raw = localStorage.getItem(`vortex_active_widgets_${accKey}_${pId}`);
    if (!raw && accKey && pSym) raw = localStorage.getItem(`vortex_active_widgets_${accKey}_${pSym}`);
    if (!raw && pId) raw = localStorage.getItem(`vortex_active_widgets_${pId}`);
    if (!raw && pSym) raw = localStorage.getItem(`vortex_active_widgets_${pSym}`);
    if (!raw && pName) raw = localStorage.getItem(`vortex_active_widgets_${pName}`);

    if (!raw) {
      for (let k = 0; k < localStorage.length; k++) {
        const key = localStorage.key(k);
        if (key && key.startsWith('vortex_active_widgets_')) {
          if ((pId && key.includes(pId)) || (pSym && key.includes(pSym)) || (pName && key.includes(pName))) {
            raw = localStorage.getItem(key);
            if (raw) break;
          }
        }
      }
    }

    if (!raw) raw = localStorage.getItem('vortex_workstation_widgets');
    if (!raw) return undefined;

    const widgets: any[] = JSON.parse(raw);
    if (!Array.isArray(widgets) || widgets.length === 0) return undefined;

    const summaries: Array<{ id: string; type: string; title: string; summary: string; dataJSON?: any }> = [];

    for (const w of widgets) {
      if (w.visible === false) continue;

      let summary = '';
      let widgetJSON: any = null;
      switch (w.type) {
        case 'speedometer': {
          const macro = marketData?.macroSentiment !== undefined ? marketData.macroSentiment : marketData?.sentiment ?? 50;
          const micro = marketData?.marketSentiment !== undefined
            ? marketData.marketSentiment
            : (marketData?.microSentiment !== undefined ? marketData.microSentiment : marketData?.sentiment ?? 50);
          summary = `Sentimento Macro = ${Math.round(macro)}% (${macro >= 60 ? 'Comprador' : macro <= 40 ? 'Vendedor' : 'Neutro'}) | Sentimento Micro = ${Math.round(micro)}% (${micro >= 60 ? 'Comprador' : micro <= 40 ? 'Vendedor' : 'Neutro'})`;
          break;
        }
        case 'accelerometer': {
          const z = Number(marketData?.zScore || 0).toFixed(2);
          const atr = Number(marketData?.atrRatio || 1).toFixed(2);
          const estado = marketData?.estado || 'NORMAL';
          summary = `Status = ${estado} | Z-Score = ${z}σ (${Math.abs(Number(z)) >= 2 ? 'Extremo estatístico / Exaustão' : 'Normal'}) | ATR Ratio = ${atr}x (${Number(atr) >= 1.3 ? 'Expansão de Volatilidade' : 'Compressão/Acúmulo'})`;
          break;
        }
        case 'gamma_bias': {
          const bias = gammaLevels?.gamma_bias || 'NEUTRO';
          const confl = gammaLevels?.confluence_type || 'NENHUMA';
          const sup = gammaLevels?.nearest_support || '--';
          const res = gammaLevels?.nearest_resistance || '--';
          summary = `Viés Gamma = ${bias} | Confluência = ${confl} | Suporte Próximo = ${sup} | Resistência Próxima = ${res}`;
          break;
        }
        case 'delta_meter': {
          const d = marketData?.delta || 0;
          const dr = Number(marketData?.deltaRatio || 1).toFixed(2);
          const p = marketData?.printsPerSecond || 0;
          summary = `Delta Acumulado = ${d} contratos | Delta Ratio = ${dr}x (${Number(dr) > 1 ? 'Agressão Compradora' : 'Agressão Vendedora'}) | Velocidade = ${p} prints/s`;
          break;
        }
        case 'block_trades': {
          const limit = w.params?.limit || 5;
          const rawTrades = marketData?.blockTrades || [];
          const displayTrades = [...rawTrades].reverse().slice(0, limit);
          const tradesList = displayTrades.length > 0
            ? displayTrades.map((t: any) => `[${t.time || t.timestamp || '--'}] ${t.side || 'COMPRA'} ${t.volume || t.contracts || 0} cts @ ${Number(t.price || 0).toFixed(2)}`).join(' | ')
            : 'Sem ordens registradas recentemente';
          summary = `Últimos ${limit} Block Trades Institucionais: ${tradesList}`;
          break;
        }
        case 'momentum_asset': {
          const sym = w.params?.assetSymbol || 'NVIDIA';
          const symLower = sym.toLowerCase();
          const f = forces?.find(item => {
            const iLower = item.symbol.toLowerCase();
            return iLower.includes(symLower) || symLower.includes(iLower) ||
              (symLower === 'aapl' && iLower.includes('apple')) ||
              (symLower === 'apple' && iLower.includes('aapl')) ||
              (symLower === 'tsla' && iLower.includes('tesla')) ||
              (symLower === 'tesla' && iLower.includes('tsla')) ||
              (symLower === 'googl' && (iLower.includes('alphabet') || iLower.includes('google'))) ||
              (symLower === 'alphabet' && iLower.includes('googl')) ||
              (symLower === 'amzn' && iLower.includes('amazon')) ||
              (symLower === 'amazon' && iLower.includes('amzn')) ||
              (symLower === 'meta' && iLower.includes('meta')) ||
              (symLower === 'msft' && iLower.includes('microsoft')) ||
              (symLower === 'microsoft' && iLower.includes('msft')) ||
              (symLower === 'nvda' && iLower.includes('nvidia')) ||
              (symLower === 'nvidia' && iLower.includes('nvda'));
          });
          summary = `Força Momentum (${sym}): Compra ${f?.buy ?? '--'}% | Venda ${f?.sell ?? '--'}%`;
          break;
        }
        case 'momentum_overview': {
          const allForces = (forces || []).map(f => `${f.symbol}: Compra ${f.buy}% / Venda ${f.sell}%`).join(' | ');
          summary = `Cesta de Força Momentum: ${allForces || 'Monitoramento em tempo real ativo'}`;
          break;
        }
        case 'grix_analytics': {
          const a = optionsMarket?.analytics || {};
          summary = `Analytics QQQ = ${Number(a.analytics_qqq_pct ?? 18.7).toFixed(1)}% | Estrutura QQQ = ${Number(a.market_structure_qqq_pct ?? 53.8).toFixed(1)}% | Estrutura SPY = ${Number(a.market_structure_spy_pct ?? 22.6).toFixed(1)}% | Status IA: ${a.ai_status || 'ACTIVE'}`;
          break;
        }
        case 'grix_anchors': {
          const an = optionsMarket?.anchors || {};
          summary = `SPY = ${Number(an.spy_pct ?? 49.0).toFixed(1)}% (${an.spy_signal || 'SELL'}) | QQQ = ${Number(an.qqq_pct ?? 33.0).toFixed(1)}% (${an.qqq_signal || 'BUY'})`;
          break;
        }
        case 'grix_flow': {
          const f = optionsMarket?.flow_and_exposure || {};
          summary = `Rho Index = ${Number(f.rho_index_pct ?? -17.6).toFixed(1)}% | Tail Risk = ${Number(f.tail_risk_pct ?? 100.0).toFixed(1)}% | Net Gamma = ${Number(f.net_gamma_pct ?? 22.4).toFixed(1)}%`;
          break;
        }
        case 'grix_stock_replacement': {
          const s = optionsMarket?.stock_replacement || {};
          summary = `Stock Replacement (${s.symbol || 'QQQ'}): CALL = ${Number(s.call_pct ?? 100.0).toFixed(1)}% (${s.call_signal || 'BUY'}) | PUT = ${Number(s.put_pct ?? 100.0).toFixed(1)}% (${s.put_signal || 'SELL'})`;
          break;
        }
        case 'projecao_mercado': {
          summary = `Projeções e Cenários de Abertura / Pregão com Alvos Gamma e Volume`;
          break;
        }
        case 'axion_ml_radar': {
          let radarData: any = null;
          if (typeof window !== 'undefined' && (window as any).__vortex_axion_ml_radar) {
            radarData = (window as any).__vortex_axion_ml_radar;
          }
          if (!radarData) {
            try {
              if (pId) {
                const rawR = localStorage.getItem(`vortex_axion_ml_radar_${pId}`);
                if (rawR) radarData = JSON.parse(rawR);
              }
              if (!radarData) {
                for (let k = 0; k < localStorage.length; k++) {
                  const key = localStorage.key(k);
                  if (key && key.startsWith('vortex_axion_ml_radar_')) {
                    const r = localStorage.getItem(key);
                    if (r) { radarData = JSON.parse(r); break; }
                  }
                }
              }
            } catch (_) {}
          }

          if (radarData) {
            const dir = radarData.direction || 'NEUTRO';
            const str = radarData.strengthLabel || 'NEUTRO';
            const probB = radarData.probBuy !== undefined ? `${radarData.probBuy}%` : `${radarData.probability || 0}%`;
            const probS = radarData.probSell !== undefined ? `${radarData.probSell}%` : '--';
            const tact = radarData.tacticalPerspective ? `Perspectiva Tática: ${radarData.tacticalPerspective}` : '';
            const status = radarData.status ? `Status: ${radarData.status}` : '';
            const atr = radarData.atr14 ? `ATR(14): ${radarData.atr14}` : '';
            const smaDist = radarData.distSma60 !== undefined ? `ΔSMA60: ${radarData.distSma60} pts` : '';
            const tp = radarData.dynamicTp ? `Alvo TP Dinâmico: ±${radarData.dynamicTp} pts` : '';
            const sl = radarData.dynamicSl ? `Stop Dinâmico: ±${radarData.dynamicSl} pts` : '';
            const gRes = radarData.distToCallRes !== undefined ? `Res. Gamma: +${radarData.distToCallRes} pts` : '';
            const gSup = radarData.distToPutSup !== undefined ? `Sup. Gamma: -${radarData.distToPutSup} pts` : '';

            const details = [
              `Direção: ${dir} (${str})`,
              `Prob Compra: ${probB} | Prob Venda: ${probS}`,
              tact,
              status,
              atr,
              smaDist,
              tp,
              sl,
              gRes,
              gSup
            ].filter(Boolean).join(' | ');

            summary = `Radar ML Axion: ${details}`;
          } else {
            summary = `Radar ML Axion ativo no gráfico: monitorando confluência preditiva, momentum e níveis Gamma em tempo real.`;
          }
          break;
        }
        case 'gamma_quant_map': {
          let gMapData: any = null;
          if (typeof window !== 'undefined' && (window as any).__vortex_gamma_quant_map) {
            gMapData = (window as any).__vortex_gamma_quant_map;
          }
          if (!gMapData) {
            try {
              if (pSym) {
                const rawG = localStorage.getItem(`vortex_gamma_quant_map_${pSym}`);
                if (rawG) gMapData = JSON.parse(rawG);
              }
              if (!gMapData) {
                const rawG = localStorage.getItem('vortex_gamma_quant_map_global');
                if (rawG) gMapData = JSON.parse(rawG);
              }
            } catch (_) {}
          }

          if (gMapData) {
            widgetJSON = gMapData;
            const topo = gMapData.topography || {};
            const buy = topo.buy_plan || {};
            const sell = topo.sell_plan || {};
            const res = topo.nearest_resistance ? `${topo.nearest_resistance.name} (${Number(topo.nearest_resistance.price).toFixed(1)}) +${topo.clear_air_up_points} pts` : 'Vácuo Total';
            const sup = topo.nearest_support ? `${topo.nearest_support.name} (${Number(topo.nearest_support.price).toFixed(1)}) -${topo.clear_air_down_points} pts` : 'Vácuo Total';
            const statusRegiao = topo.congestion_zone ? 'MURALHAS / TRÁFEGO DENSO' : 'AUTOESTRADA LIVRE';

            const sessTrade = gMapData.session_trade_tactical || {};
            const wallSetup = gMapData.structural_wall_setup || {};

            summary = `Mapa Gamma Quant & Topografia: Preço = ${gMapData.current_price} | Viés Macro = ${gMapData.macro_bias} | Momento = ${gMapData.moment_bias} | Próx. Resistência: ${res} | Próx. Suporte: ${sup} | Topografia: ${statusRegiao} | Trade Tático da Sessão: ${sessTrade.badge || '--'} (${sessTrade.targetInfo || '--'}) -> ${sessTrade.description || '--'} | Setup Estrutural de Parede: ${wallSetup.badge || '--'} (${wallSetup.levelLabel || '--'}) -> ${wallSetup.description || '--'} | Plano Scalp Compra: ${buy.badge || '--'} (TP +${buy.suggestedTP || 25}, SL -${buy.suggestedSL || 25}, R:R ${buy.riskRewardRatio || 1}:1, Alvo: ${buy.targetPrice || '--'}) - ${buy.reason || '--'} | Plano Scalp Venda: ${sell.badge || '--'} (TP +${sell.suggestedTP || 25}, SL -${sell.suggestedSL || 25}, R:R ${sell.riskRewardRatio || 1}:1, Alvo: ${sell.targetPrice || '--'}) - ${sell.reason || '--'} | Estudo Base: ${gMapData.study_info?.name || 'Gamma Quant'} (${gMapData.study_info?.accuracy || 70}%)`;
          } else {
            summary = `Mapa Gamma Quant ativo no gráfico: monitorando topografia de níveis, vácuo de mercado e planos inteligentes de TP/SL em tempo real.`;
          }
          break;
        }
        default:
          summary = `Widget ativo no gráfico: ${w.title || w.type}`;
      }

      summaries.push({
        id: w.id,
        type: w.type,
        title: w.title || w.type,
        summary,
        dataJSON: widgetJSON
      });
    }

    return summaries.length > 0 ? summaries : undefined;
  } catch (e) {
    console.warn('[extractActiveWidgetsFromStorage Error]', e);
    return undefined;
  }
}

function extractLastClosedTradeReview(reportsList: StrategyReport[], panelId: string, instanceId: string, accountId?: string | null) {
  if (!reportsList || reportsList.length === 0) return undefined;
  const closed = reportsList.filter(r => 
    (r.status === 'Gain' || r.status === 'Stop') &&
    (r.panel_id === panelId || r.instance_id === instanceId) &&
    (!accountId || r.account_id === accountId)
  );
  if (closed.length === 0) return undefined;

  const sorted = [...closed].sort((a, b) => new Date(b.closed_at || b.created_at).getTime() - new Date(a.closed_at || a.created_at).getTime());
  const last = sorted[0];

  const entry = Number(last.entry_price || 0);
  const exit = Number(last.exit_price || entry);
  const pts = last.side === 'COMPRA' ? (exit - entry) : (entry - exit);
  const closedTime = new Date(last.closed_at || last.created_at).getTime();
  const minutesAgo = Math.max(1, Math.round((Date.now() - closedTime) / 60000));

  return {
    status: last.status as 'Gain' | 'Stop',
    side: last.side,
    entryPrice: entry,
    exitPrice: exit,
    pointsResult: Number(pts.toFixed(2)),
    closedMinutesAgo: minutesAgo
  };
}

function aggregateCandles(candles: Candle[], timeframeMinutes: number): Candle[] {
  if (timeframeMinutes <= 1 || candles.length === 0) return candles;

  const buckets: { [key: number]: Candle[] } = {};

  candles.forEach(c => {
    const timeMs = new Date(c.timestamp).getTime();
    if (isNaN(timeMs)) return;
    const bucketTime = Math.floor(timeMs / (timeframeMinutes * 60 * 1000)) * (timeframeMinutes * 60 * 1000);
    if (!buckets[bucketTime]) {
      buckets[bucketTime] = [];
    }
    buckets[bucketTime].push(c);
  });

  const sortedKeys = Object.keys(buckets).map(Number).sort((a, b) => a - b);

  return sortedKeys.map(bucketTime => {
    const group = buckets[bucketTime];
    group.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const open = group[0].open;
    const close = group[group.length - 1].close;
    const high = Math.max(...group.map(g => g.high));
    const low = Math.min(...group.map(g => g.low));
    const volume = group.reduce((acc, g) => acc + (g.volume || 0), 0);

    return {
      timestamp: new Date(bucketTime).toISOString(),
      open,
      high,
      low,
      close,
      volume
    };
  });
}

function calculateSMA(data: { close: number }[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(0);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += Number(data[i - j]?.close || 0);
      }
      result.push(sum / period);
    }
  }
  return result;
}

function calculateEMA(data: { close: number }[], period: number): number[] {
  const ema: number[] = [];
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < Math.min(period, data.length); i++) {
    sum += data[i].close;
  }
  let prevEma = sum / Math.min(period, data.length);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      ema.push(0);
    } else if (i === period - 1) {
      ema.push(prevEma);
    } else {
      const val = data[i].close * k + prevEma * (1 - k);
      ema.push(val);
      prevEma = val;
    }
  }
  return ema;
}

function calculateRSI(data: { close: number }[], period = 14): number[] {
  const rsi: number[] = [];
  if (data.length <= period) return new Array(data.length).fill(50);
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const diff = data[i].close - data[i - 1].close;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      rsi.push(50);
    } else if (i === period) {
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    } else {
      const diff = data[i].close - data[i - 1].close;
      avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    }
  }
  return rsi;
}

function calculateMACD(data: { close: number }[]): { macd: number[]; signal: number[]; histogram: number[] } {
  const ema12 = calculateEMA(data, 12);
  const ema26 = calculateEMA(data, 26);
  const macd: number[] = [];
  for (let i = 0; i < data.length; i++) {
    macd.push(ema12[i] - ema26[i]);
  }
  
  const macdData = macd.map(val => ({ close: val }));
  const signal = calculateEMA(macdData, 9);
  const histogram: number[] = [];
  for (let i = 0; i < data.length; i++) {
    histogram.push(macd[i] - signal[i]);
  }
  
  return { macd, signal, histogram };
}

function calculateEMACD(data: { close: number }[]): {
  histogram: number[];
  histogram_compra: number[];
  histogram_venda: number[];
  histogram_abs: number[];
  explosion: number[];
  deadZone: number[];
  trend: ('compra' | 'venda' | 'neutro')[];
} {
  if (data.length < 30) {
    return {
      histogram: data.map(() => 0),
      histogram_compra: data.map(() => 0),
      histogram_venda: data.map(() => 0),
      histogram_abs: data.map(() => 0),
      explosion: data.map(() => 0),
      deadZone: data.map(() => 20),
      trend: data.map(() => 'neutro' as const)
    };
  }

  const sensitivity = 150;
  const channelLength = 20;
  const mult = 2.0;

  const ema12 = calculateEMA(data, 12);
  const ema26 = calculateEMA(data, 26);
  const macdValues: number[] = [];
  for (let i = 0; i < data.length; i++) {
    macdValues.push(ema12[i] - ema26[i]);
  }

  const explosionLine: number[] = [];
  let firstValidExplosionVal = 0;
  if (data.length >= channelLength) {
    const slice = data.slice(0, channelLength);
    const mean = slice.reduce((sum, item) => sum + item.close, 0) / channelLength;
    const variance = slice.reduce((sum, item) => sum + Math.pow(item.close - mean, 2), 0) / channelLength;
    firstValidExplosionVal = 2 * mult * Math.sqrt(variance);
  }

  for (let i = 0; i < data.length; i++) {
    if (i < channelLength - 1) {
      explosionLine.push(firstValidExplosionVal);
    } else {
      const slice = data.slice(i - channelLength + 1, i + 1);
      const mean = slice.reduce((sum, item) => sum + item.close, 0) / channelLength;
      const variance = slice.reduce((sum, item) => sum + Math.pow(item.close - mean, 2), 0) / channelLength;
      const stdDev = Math.sqrt(variance);
      explosionLine.push(2 * mult * stdDev);
    }
  }

  const histogram: number[] = [];
  const histogram_compra: number[] = [];
  const histogram_venda: number[] = [];
  const histogram_abs: number[] = [];
  const deadZone: number[] = [];
  const trend: ('compra' | 'venda' | 'neutro')[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < 1) {
      histogram.push(0);
      histogram_compra.push(0);
      histogram_venda.push(0);
      histogram_abs.push(0);
      deadZone.push(20);
      trend.push('neutro');
      continue;
    }

    const currentMacd = macdValues[i] || 0;
    const prevMacd = macdValues[i - 1] || 0;
    const t1 = (currentMacd - prevMacd) * sensitivity;

    histogram.push(t1);
    histogram_compra.push(t1 >= 0 ? t1 : 0);
    histogram_venda.push(t1 < 0 ? Math.abs(t1) : 0);
    histogram_abs.push(Math.abs(t1));

    const dz = 20;
    deadZone.push(dz);

    if (t1 > 0) {
      trend.push('compra');
    } else if (t1 < 0) {
      trend.push('venda');
    } else {
      trend.push('neutro');
    }
  }

  return { histogram, histogram_compra, histogram_venda, histogram_abs, explosion: explosionLine, deadZone, trend };
}

// Background Timer Worker: Mantém execução em tempo real mesmo com aba minimizada / segundo plano
export function createWorkerInterval(callback: () => void, intervalMs: number): { stop: () => void } {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    const id = setInterval(callback, intervalMs);
    return { stop: () => clearInterval(id) };
  }
  try {
    const blob = new Blob([
      `let interval = ${intervalMs};
       let timer = setInterval(function() { self.postMessage('tick'); }, interval);
       self.onmessage = function(e) {
         if (e.data === 'stop' && timer) {
           clearInterval(timer);
           timer = null;
         }
       };`
    ], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);
    worker.onmessage = () => {
      callback();
    };
    return {
      stop: () => {
        try {
          worker.postMessage('stop');
          worker.terminate();
          URL.revokeObjectURL(workerUrl);
        } catch (_) {}
      }
    };
  } catch (err) {
    const id = setInterval(callback, intervalMs);
    return { stop: () => clearInterval(id) };
  }
}

export function clearWorkerTimer(timer: any) {
  if (!timer) return;
  if (typeof timer.stop === 'function') {
    timer.stop();
  } else {
    clearInterval(timer);
  }
}

let audioKeepAliveCtx: any = null;
export function enableBackgroundAudioKeepAlive() {
  if (audioKeepAliveCtx || typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.000001; // Quase inaudível, evita suspensão de timers pelo Chrome/Edge
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    audioKeepAliveCtx = ctx;
  } catch (_) {}
}

export function disableBackgroundAudioKeepAlive() {
  if (audioKeepAliveCtx) {
    try {
      audioKeepAliveCtx.close();
    } catch (_) {}
    audioKeepAliveCtx = null;
  }
}

export interface FVGData {
  id: string;
  isUp: boolean;
  top: number;
  bottom: number;
  midpoint: number;
  startIndex: number;
  endIndex: number;
  barsAgoPrice: number;
  currentBarPrice: number;
  size: number;
  activeTop: number;
  activeBottom: number;
  isFilled: boolean;
}

export function calculateFVGs(
  candles: any[],
  minimumTicks: number = 1,
  tickSize: number = 1.0,
  extendUntil: number = 1,
  barsToExtend: number = 10,
  enforceSameDirection: boolean = false
): FVGData[] {
  const gaps: FVGData[] = [];
  if (candles.length < 3) return [];

  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i];
    const c1 = candles[i - 1];
    const c2 = candles[i - 2];

    const c0Low = Number(c0.low ?? c0.close);
    const c0High = Number(c0.high ?? c0.close);
    const c2Low = Number(c2.low ?? c2.close);
    const c2High = Number(c2.high ?? c2.close);

    const upGap = c0Low - c2High;
    const dnGap = c2Low - c0High;

    let isUp = false;
    let isDown = false;

    if (upGap >= minimumTicks * tickSize) {
      isUp = true;
      if (enforceSameDirection) {
        if (!(c0.close > c0.open && c1.close > c1.open && c2.close > c2.open)) {
          isUp = false;
        }
      }
    } else if (dnGap >= minimumTicks * tickSize) {
      isDown = true;
      if (enforceSameDirection) {
        if (!(c0.close < c0.open && c1.close < c1.open && c2.close < c2.open)) {
          isDown = false;
        }
      }
    }

    if (isUp) {
      gaps.push({
        id: `fvg_${i - 1}_up`,
        isUp: true,
        top: c0Low,
        bottom: c2High,
        midpoint: (c0Low + c2High) / 2,
        startIndex: i - 1,
        endIndex: -1,
        barsAgoPrice: c2High,
        currentBarPrice: c0Low,
        size: c0Low - c2High,
        activeTop: c0Low,
        activeBottom: c2High,
        isFilled: false
      });
    } else if (isDown) {
      gaps.push({
        id: `fvg_${i - 1}_down`,
        isUp: false,
        top: c2Low,
        bottom: c0High,
        midpoint: (c2Low + c0High) / 2,
        startIndex: i - 1,
        endIndex: -1,
        barsAgoPrice: c2Low,
        currentBarPrice: c0High,
        size: c2Low - c0High,
        activeTop: c2Low,
        activeBottom: c0High,
        isFilled: false
      });
    }
  }

  for (const gap of gaps) {
    let filledIndex = -1;
    const startCheck = gap.startIndex + 2;

    for (let j = startCheck; j < candles.length; j++) {
      const c = candles[j];
      const cLow = Number(c.low ?? c.close);
      const cHigh = Number(c.high ?? c.close);

      if (gap.isUp) {
        if (cLow < gap.activeTop) {
          gap.activeTop = Math.max(cLow, gap.bottom);
        }
        if (gap.activeTop <= gap.bottom) {
          gap.isFilled = true;
          filledIndex = j;
          break;
        }
      } else {
        if (cHigh > gap.activeBottom) {
          gap.activeBottom = Math.min(cHigh, gap.top);
        }
        if (gap.activeBottom >= gap.top) {
          gap.isFilled = true;
          filledIndex = j;
          break;
        }
      }
    }

    if (extendUntil === 3) {
      gap.endIndex = Math.min(gap.startIndex + barsToExtend, candles.length - 1);
      if (filledIndex !== -1 && filledIndex < gap.endIndex) {
        gap.endIndex = filledIndex;
      }
    } else {
      gap.endIndex = filledIndex !== -1 ? filledIndex : candles.length - 1;
    }
  }

  return gaps;
}

function playAlertBeep(frequency = 440, duration = 150) {
  try {
    if (typeof window !== 'undefined') {
      const beepsSetting = localStorage.getItem('vortex_resource_sound_beeps_enabled');
      if (beepsSetting === 'false') return;
    }
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.frequency.value = frequency;
    gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime); // volume slightly higher for mobile audibility

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + (duration / 1000));
  } catch (e) {
    console.error('AudioContext fail', e);
  }
}

export interface SystemLog {
  id: string;
  time: string;
  prefix: string;
  content: string;
  type: 'sistema' | 'alerta' | 'ia' | 'erro' | 'noticia';
}

interface AppContextType {
  user: any;
  panel: any;
  settings: any;
  sessionId: string | null;
  isAuthenticated: boolean;
  isCheckingAuth: boolean;
  isRestrictedSession: boolean;
  planDetails: SubscriptionPlanDetails | null;
  canAccessAlgorithmCreator: boolean;
  canAccessCopilotAI: boolean;
  canAccessCopyTrading: boolean;
  canAccessReplay: boolean;
  maxDemoAccounts: number;
  maxSyncAccounts: number;
  userPermissions: {
    allow_telegram_news: boolean;
    allow_alerts: boolean;
    allow_operations: boolean;
    allow_share_strategies: boolean;
    allow_simulator: boolean;
    allow_panel_mode_2?: boolean;
    allow_copy_trading?: boolean;
    max_strategies: number;
    max_accounts?: number;
  };
  panelMode: 'mode1' | 'mode2';
  setPanelMode: (mode: 'mode1' | 'mode2') => void;
  signIn: (email: string, password: string, subId?: string, forcedMode?: 'admin' | 'restricted') => Promise<{ 
    success: boolean; 
    needsChoice?: boolean; 
    message?: string;
    isPendingPayment?: boolean;
    subscriptionStatus?: string;
    pendingPayment?: any;
    nextPaymentDate?: string | null;
  }>;
  signUp: (email: string, password: string, subId: string) => Promise<boolean>;
  resetOrSetPassword: (email: string, subId: string, newPass: string) => Promise<{ success: boolean; message: string }>;
  changePassword: (newPass: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;

  // Painéis Múltiplos
  panels: any[];
  activePanel: any | null;
  switchPanel: (panelId: string) => void;
  getPanelSnapshot: (panelId: string) => {
    candles: Candle[];
    marketData: MarketData | null;
    gammaLevels: GammaLevels | null;
    isLoading: boolean;
    loadingProgress: any;
  };
  ensurePanelDataLoaded: (panelId: string) => void;
  ensurePanelHistoryDays: (panelId: string, requiredDays: number) => void;
  setVisibleMultiPanelIds: (ids: string[]) => void;
  panelCacheVersion: number;

  // Gestão de Contas Demonstrativas e Copy Trade Globais
  accounts: BrokerAccount[];
  setAccounts: React.Dispatch<React.SetStateAction<BrokerAccount[]>>;
  activeAccount: BrokerAccount | null;
  setActiveAccount: React.Dispatch<React.SetStateAction<BrokerAccount | null>>;
  switchAccount: (account: BrokerAccount) => void;
  refreshAccounts: (syncNinja?: boolean) => Promise<BrokerAccount[]>;
  deleteAccountAction: (acc: BrokerAccount) => Promise<boolean>;
  resetAccountAction: (acc: BrokerAccount, newBalance?: number) => Promise<boolean>;
  accountStrategies: AccountStrategy[];
  setAccountStrategies: React.Dispatch<React.SetStateAction<AccountStrategy[]>>;
  linkStrategyToAccount: (opts: { account_id: string; prompt_id?: string | null; manual_strategy_id?: string | null; contract_size_multiplier?: number; is_enabled?: boolean }) => Promise<void>;
  unlinkStrategyFromAccount: (routeId: string) => Promise<void>;
  refreshAccountStrategies: () => Promise<void>;
  copyConfigs: CopyTradingConfig[];
  setCopyConfigs: React.Dispatch<React.SetStateAction<CopyTradingConfig[]>>;
  refreshCopyConfigs: (providedAccounts?: BrokerAccount[]) => Promise<CopyTradingConfig[]>;
  remoteCopyConfigs: RemoteCopySubscription[];
  refreshRemoteCopyConfigs: () => Promise<void>;

  // Dados do Mercado
  marketData: MarketData | null;
  forces: { symbol: string; buy: number; sell: number }[];
  gammaLevels: GammaLevels | null;
  news: EconomicNewsItem[];
  screenshot: string | null;
  candles: Candle[];
  isCandlesLoading: boolean;
  candlesLoadingProgress: {
    isLoading: boolean;
    percent: number;
    loaded: number;
    total: number;
    days: number;
    isExplicitDaysChange?: boolean;
  };
  wsHubConnected: boolean;
  ninjaGatewayOnline: boolean;
  getPanelPrice: (panelId?: string, symbol?: string) => number;

  // Inteligência Artificial
  aiEnabled: boolean;
  isAnalyzing: boolean;
  aiResult: AIResponse | null;
  setAiEnabled: (enabled: boolean) => void;
  runManualAIAnalysis: () => Promise<any>;
  askCopilotChatMessage: (question: string, chatHistory?: any[]) => Promise<any>;
  executeVoiceTradeCommand: (intent: any) => Promise<{ success: boolean; message: string }>;
  isCopilotModalOpen: boolean;
  setIsCopilotModalOpen: (open: boolean) => void;

  // Logs do Sistema
  systemLogs: SystemLog[];
  addLog: (prefix: string, content: string, type: SystemLog['type']) => void;
  clearLogs: () => void;

  // Configuração das forças Impulso
  forcesConfig: Array<{ id: string; nome: string; ativo: boolean }>;
  toggleForceConfig: (id: string) => void;

  // Janelas temporais do delta
  windowMinutes: number;
  setWindowMinutes: (min: number) => void;
  windowBaseline: { buy: number; sell: number; time: number } | null;
  setWindowBaseline: (baseline: { buy: number; sell: number; time: number } | null) => void;

  // Configurações
  saveSettings: (updatedFields: Partial<any>, targetPanelId?: string | 'all' | string[]) => Promise<boolean>;
  allSettings: Record<string, any>;
  refreshMarketData: (overrideSettings?: any, targetPanelIds?: string[], perPanelDays?: Record<string, number>) => Promise<void>;
  authError: string | null;

  // Alertas ativos
  activeAlert: { title: string; message: string; detail: string; tipo: string; panelId?: string; panelName?: string } | null;
  setActiveAlert: (alert: { title: string; message: string; detail: string; tipo: string; panelId?: string; panelName?: string } | null) => void;
  disarmAlert: () => void;
  updateNews: () => Promise<void>;
  testTelegramMessage: (customText?: string) => Promise<boolean>;

  // Configurações locais de exibição de indicadores do gráfico de candles
  showSma9: boolean;
  setShowSma9: (val: boolean) => void;
  showEma21: boolean;
  setShowEma21: (val: boolean) => void;
  showEma50: boolean;
  setShowEma50: (val: boolean) => void;
  showRsi: boolean;
  setShowRsi: (val: boolean) => void;
  showMacd: boolean;
  setShowMacd: (val: boolean) => void;
  showPva: boolean;
  setShowPva: (val: boolean) => void;
  showEMacd: boolean;
  setShowEMacd: (val: boolean) => void;
  showFvg: boolean;
  setShowFvg: (val: boolean) => void;

  // Prompts / Estratégias
  prompts: AIPrompt[];
  isLoadingPrompts: boolean;
  fetchPromptsList: () => Promise<void>;
  savePromptAction: (prompt: Partial<AIPrompt>) => Promise<{ success: boolean; error?: string }>;
  deletePromptAction: (id: string) => Promise<boolean>;

  // Algoritmos Dinâmicos (Cenário A)
  customStrategies: CustomStrategy[];
  publicStrategies: CustomStrategy[];
  isLoadingStrategies: boolean;
  fetchStrategiesList: () => Promise<void>;
  fetchPublicStrategiesList: () => Promise<void>;
  saveStrategyAction: (strategy: CustomStrategy) => Promise<{ success: boolean; error?: string }>;
  deleteStrategyAction: (id: string) => Promise<boolean>;
  toggleStrategyActiveAction: (id: string, active: boolean) => Promise<boolean>;

  // Estratégias ATM (Cadastro Centralizado)
  atmStrategies: ATMStrategy[];
  fetchAtmStrategiesList: () => Promise<void>;
  pausedStrategyIds: string[];
  toggleStrategyPause: (id: string) => void;
  customSignals: any[];
  clearCustomSignals: () => void;

  // Gerenciamento de Painéis
  createPanelAction: (name: string, instanceId: string, pointValue?: number, tickSize?: number, defaultSlPoints?: number, defaultTpPoints?: number) => Promise<boolean>;
  updatePanelAction: (panelId: string, name: string, instanceId: string, pointValue?: number, tickSize?: number, defaultSlPoints?: number, defaultTpPoints?: number) => Promise<boolean>;
  deletePanelAction: (panelId: string) => Promise<boolean>;

  // Relatórios de Sinais
  reports: StrategyReport[];
  isLoadingReports: boolean;
  fetchReportsList: (silent?: boolean) => Promise<void>;
  createReportAction: (report: Omit<StrategyReport, 'id' | 'created_at' | 'closed_at' | 'user_id'>) => Promise<StrategyReport | null>;
  updateReportAction: (id: string, status: 'Gain' | 'Stop' | 'Cancelado', exitPrice?: number) => Promise<boolean>;
  updateReportLevelsAction: (id: string, stopLoss: number | null, takeProfit: number | null, currentPrice?: number | null, skipNinjaSync?: boolean) => Promise<boolean>;
  deleteReportAction: (id: string) => Promise<boolean>;
  deleteMultipleReportsAction: (ids: string[]) => Promise<boolean>;
  checkOperationalLimits: (panelId: string, customSettings?: any, targetAcc?: BrokerAccount | null, isManualTrade?: boolean, isAtm?: boolean, side?: 'COMPRA' | 'VENDA' | string) => Promise<{ allowed: boolean; reason?: string }>;
  cancelAllOpenOperationsAction: (targetPanelId?: string, targetAccountId?: string, exitPrice?: number) => Promise<{ success: boolean; count: number }>;
  isMarketDataStaleForPanel: (panelId: string, timeoutSec?: number) => boolean;

  // Análises Gerais / Omni-Engine
  generalAnalyses: AIGeneralAnalysisRecord[];
  isLoadingGeneralAnalyses: boolean;
  fetchGeneralAnalysesList: () => Promise<void>;
  deleteGeneralAnalysisAction: (id: string) => Promise<boolean>;
  executeGeneralPromptCycleForPanel?: (targetPanel?: any, targetSettings?: any) => Promise<any>;

  // GRIX Options Market
  optionsMarket: OptionsMarketData | null;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_FORCES_CONFIG = [
  { id: 'nasdaq_impulso', nome: 'Nasdaq', ativo: true },
  { id: 'sp500_impulso', nome: 'S&P 500', ativo: true },
  { id: 'imf_impulso', nome: 'IndexMoneyFlow', ativo: true },
  { id: 'vix_impulso', nome: 'VIX', ativo: true },
  { id: 'usdindex_impulso', nome: 'USDIndex', ativo: true },
  { id: 'nvidia_impulso', nome: 'NVIDIA', ativo: true },
  { id: 'microsoft_impulso', nome: 'Microsoft', ativo: true },
  { id: 'apple_impulso', nome: 'Apple', ativo: true },
  { id: 'meta_impulso', nome: 'Meta', ativo: true },
  { id: 'amazon_impulso', nome: 'Amazon', ativo: true },
  { id: 'alphabet_impulso', nome: 'Alphabet', ativo: true },
  { id: 'tesla_impulso', nome: 'Tesla', ativo: true }
];

const migrateAndValidateForcesConfig = (parsedArray: any[]): any[] => {
  if (!Array.isArray(parsedArray)) return DEFAULT_FORCES_CONFIG;
  const migrated = parsedArray.map(item => {
    if (item && item.id === 'sp505_impulso') {
      return { ...item, id: 'sp500_impulso' };
    }
    if (item && (item.id === 'fluxo_impulso' || item.id === 'fluxo de capitais_impulso')) {
      return { ...item, id: 'imf_impulso', nome: 'IndexMoneyFlow' };
    }
    return item;
  });
  return DEFAULT_FORCES_CONFIG.map(defaultItem => {
    const existing = migrated.find(item => item && item.id === defaultItem.id);
    return {
      ...defaultItem,
      ativo: existing ? existing.ativo : defaultItem.ativo
    };
  });
};

// Helper to enrich a settings object with virtual configs serialized inside disabled_levels
const enrichSettingsWithVirtualConfigs = (settingsObj: any) => {
  if (!settingsObj) return settingsObj;
  const disabledList: string[] = settingsObj.disabled_levels || [];

  // Default values (fallback to database columns if they exist on the object)
  let vortex_ai_enabled = settingsObj.vortex_ai_enabled === true;
  let general_prompt_days = settingsObj.general_prompt_days || 'all';
  let chart_show_sma9 = settingsObj.chart_show_sma9 !== false;
  let chart_show_ema21 = settingsObj.chart_show_ema21 !== false;
  let chart_show_ema50 = settingsObj.chart_show_ema50 === true;
  let chart_show_rsi = settingsObj.chart_show_rsi === true;
  let chart_show_macd = settingsObj.chart_show_macd === true;
  let log_show_sistema = settingsObj.log_show_sistema !== false;
  let log_show_alerta = settingsObj.log_show_alerta !== false;
  let log_show_ia = settingsObj.log_show_ia !== false;
  let log_show_erro = settingsObj.log_show_erro !== false;
  let log_show_noticia = settingsObj.log_show_noticia !== false;
  let market_update_interval = settingsObj.market_update_interval !== undefined ? Number(settingsObj.market_update_interval) : 500;
  let force_update_interval = settingsObj.force_update_interval !== undefined ? Number(settingsObj.force_update_interval) : 1500;
  let candles_update_interval = settingsObj.candles_update_interval !== undefined ? Number(settingsObj.candles_update_interval) : 2000;
  let screenshot_update_interval = settingsObj.screenshot_update_interval !== undefined ? Number(settingsObj.screenshot_update_interval) : 3000;
  let general_prompt_master_enabled = settingsObj.general_prompt_master_enabled === true;
  let chart_candle_bar_count = settingsObj.chart_candle_bar_count !== undefined ? Number(settingsObj.chart_candle_bar_count) : 60;
  let chart_history_days = settingsObj.chart_history_days !== undefined ? Math.max(3, Number(settingsObj.chart_history_days) || 3) : 7;
  let slot_history_days = settingsObj.slot_history_days || '';
  
  // New configs
  let chart_manual_trade_mode = settingsObj.chart_manual_trade_mode || 'nivel';
  let chart_manual_sizing_mode = settingsObj.chart_manual_sizing_mode || 'lote';
  let chart_manual_risk_usd = settingsObj.chart_manual_risk_usd !== undefined ? Number(settingsObj.chart_manual_risk_usd) : 250;
  let chart_manual_sl_points = settingsObj.chart_manual_sl_points !== undefined ? Number(settingsObj.chart_manual_sl_points) : 50;
  let chart_manual_tp_points = settingsObj.chart_manual_tp_points !== undefined ? Number(settingsObj.chart_manual_tp_points) : 50;
  let chart_manual_contracts = settingsObj.chart_manual_contracts !== undefined ? Number(settingsObj.chart_manual_contracts) : 1;
  let chart_show_levels = settingsObj.chart_show_levels !== false;
  let chart_confirm_manual_trade = settingsObj.chart_confirm_manual_trade !== false;
  let chart_manual_ia_validate = settingsObj.chart_manual_ia_validate === true;
  let chart_show_pva = settingsObj.chart_show_pva !== false;
  let chart_show_emacd = settingsObj.chart_show_emacd === true;
  let chart_show_fvg = settingsObj.chart_show_fvg !== false;

  // Added virtual configs
  let alert_force_ativo = settingsObj.alert_force_ativo === true;
  let alert_force_buy_min = settingsObj.alert_force_buy_min !== undefined ? Number(settingsObj.alert_force_buy_min) : -2.0;
  let alert_force_sell_max = settingsObj.alert_force_sell_max !== undefined ? Number(settingsObj.alert_force_sell_max) : 2.0;
  let alert_force_cooldown = settingsObj.alert_force_cooldown !== undefined ? Number(settingsObj.alert_force_cooldown) : 10;
  let alert_force_telegram = settingsObj.alert_force_telegram === true;
  let alert_force_vies_shift = settingsObj.alert_force_vies_shift === true;

  let alert_pva_ativo = settingsObj.alert_pva_ativo === true;
  let alert_pva_cooldown = settingsObj.alert_pva_cooldown !== undefined ? Number(settingsObj.alert_pva_cooldown) : 5;
  let alert_pva_telegram = settingsObj.alert_pva_telegram === true;

  let alert_mode = settingsObj.alert_mode || 'individual';
  let alert_sent_ativo = settingsObj.alert_sent_ativo === true;
  let alert_sent_max = settingsObj.alert_sent_max !== undefined ? Number(settingsObj.alert_sent_max) : 75;
  let alert_sent_min = settingsObj.alert_sent_min !== undefined ? Number(settingsObj.alert_sent_min) : 25;
  let alert_sent_cooldown = settingsObj.alert_sent_cooldown !== undefined ? Number(settingsObj.alert_sent_cooldown) : 5;
  let alert_sent_telegram = settingsObj.alert_sent_telegram === true;

  let alert_sent_micro_ativo = settingsObj.alert_sent_micro_ativo === true;
  let alert_sent_micro_max = settingsObj.alert_sent_micro_max !== undefined ? Number(settingsObj.alert_sent_micro_max) : 75;
  let alert_sent_micro_min = settingsObj.alert_sent_micro_min !== undefined ? Number(settingsObj.alert_sent_micro_min) : 25;
  let alert_sent_micro_cooldown = settingsObj.alert_sent_micro_cooldown !== undefined ? Number(settingsObj.alert_sent_micro_cooldown) : 5;
  let alert_sent_micro_telegram = settingsObj.alert_sent_micro_telegram === true;

  let alert_bt_ativo = settingsObj.alert_bt_ativo === true;
  let alert_bt_vol = settingsObj.alert_bt_vol !== undefined ? Number(settingsObj.alert_bt_vol) : 50;
  let alert_bt_cooldown = settingsObj.alert_bt_cooldown !== undefined ? Number(settingsObj.alert_bt_cooldown) : 5;
  let alert_bt_telegram = settingsObj.alert_bt_telegram === true;

  let alert_delta_ativo = settingsObj.alert_delta_ativo === true;
  let alert_delta_sell = settingsObj.alert_delta_sell !== undefined ? Number(settingsObj.alert_delta_sell) : 0.5;
  let alert_delta_buy = settingsObj.alert_delta_buy !== undefined ? Number(settingsObj.alert_delta_buy) : 1.5;
  let alert_delta_vol_min = settingsObj.alert_delta_vol_min !== undefined ? Number(settingsObj.alert_delta_vol_min) : 50;
  let alert_delta_cooldown = settingsObj.alert_delta_cooldown !== undefined ? Number(settingsObj.alert_delta_cooldown) : 5;
  let alert_delta_telegram = settingsObj.alert_delta_telegram === true;

  let alert_acel_ativo = settingsObj.alert_acel_ativo === true;
  let alert_acel_explosao = settingsObj.alert_acel_explosao === true;
  let alert_acel_exaustao = settingsObj.alert_acel_exaustao === true;
  let alert_acel_compressao = settingsObj.alert_acel_compressao === true;
  let alert_acel_cooldown = settingsObj.alert_acel_cooldown !== undefined ? Number(settingsObj.alert_acel_cooldown) : 5;
  let alert_acel_telegram = settingsObj.alert_acel_telegram === true;

  let alert_nivel_ativo = settingsObj.alert_nivel_ativo === true;
  let alert_nivel_dist = settingsObj.alert_nivel_dist !== undefined ? Number(settingsObj.alert_nivel_dist) : 25;
  let alert_nivel_cooldown = settingsObj.alert_nivel_cooldown !== undefined ? Number(settingsObj.alert_nivel_cooldown) : 10;
  let alert_nivel_telegram = settingsObj.alert_nivel_telegram === true;
  let alert_nivel_niveis: string[] = settingsObj.alert_nivel_niveis || [];

  let general_prompt_enabled = settingsObj.general_prompt_enabled === true;
  let general_prompt_frequency = settingsObj.general_prompt_frequency !== undefined ? Number(settingsObj.general_prompt_frequency) : 15;
  let general_prompt_start_time = settingsObj.general_prompt_start_time || '09:00';
  let general_prompt_end_time = settingsObj.general_prompt_end_time || '18:00';
  let general_prompt_template = settingsObj.general_prompt_template || DEFAULT_GENERAL_PROMPT_TEMPLATE;
  let general_prompt_telegram_send_image = settingsObj.general_prompt_telegram_send_image !== false;
  let general_prompt_telegram_enabled = settingsObj.general_prompt_telegram_enabled !== false;
  let general_prompt_panel_id = settingsObj.general_prompt_panel_id || '';
  let news_background_enabled = settingsObj.news_background_enabled === true;
  let news_chart_markers = settingsObj.news_chart_markers !== false;
  let manual_prompt_id = settingsObj.manual_prompt_id || '';
  let selected_prompt_id = settingsObj.selected_prompt_id || '';
  let manual_strategy_id = getStableManualStrategyId(settingsObj.panel_id, settingsObj.manual_strategy_id);

  let ops_check_interval_ms = settingsObj.ops_check_interval_ms !== undefined ? Number(settingsObj.ops_check_interval_ms) : 2000;
  let admin_ops_telegram_enabled = settingsObj.admin_ops_telegram_enabled === true;
  let admin_ops_telegram_bot_token = settingsObj.admin_ops_telegram_bot_token || '';
  let admin_ops_telegram_chat_id = settingsObj.admin_ops_telegram_chat_id || '';
  let multi_strategy_mode = settingsObj.multi_strategy_mode === true;
  const pIdForStorage = settingsObj.panel_id || 'default';
  let transmission_mode = settingsObj.transmission_mode || (typeof window !== 'undefined' ? localStorage.getItem(`vortex_transmission_mode_${pIdForStorage}`) : null) || 'polling';
  let websocket_hub_url = settingsObj.websocket_hub_url || (typeof window !== 'undefined' ? localStorage.getItem(`vortex_ws_hub_url_${pIdForStorage}`) : null) || 'ws://127.0.0.1:8085/ws';

  let enable_tts = settingsObj.enable_tts === true;
  let tts_provider = settingsObj.tts_provider || 'groq';
  let tts_groq_api_key = settingsObj.tts_groq_api_key || '';
  let tts_gemini_api_key = settingsObj.tts_gemini_api_key || '';
  let tts_openai_api_key = settingsObj.tts_openai_api_key || '';
  let tts_groq_model = settingsObj.tts_groq_model || 'canopylabs/orpheus-v1-english';
  let tts_groq_voice = settingsObj.tts_groq_voice || 'autumn';
  let tts_gemini_model = settingsObj.tts_gemini_model || 'gemini-3.8-flash-lite-tts';
  let tts_gemini_voice = settingsObj.tts_gemini_voice || 'Puck';
  let tts_openai_model = settingsObj.tts_openai_model || 'gpt-4o-mini-tts';
  let tts_openai_voice = settingsObj.tts_openai_voice || 'nova';
  let tts_trigger_mode = settingsObj.tts_trigger_mode || 'critical_only';
  let tts_cooldown_seconds = settingsObj.tts_cooldown_seconds !== undefined ? Number(settingsObj.tts_cooldown_seconds) : 15;
  let tts_volume = settingsObj.tts_volume !== undefined ? Number(settingsObj.tts_volume) : 1.0;
  let tts_browser_voice_name = settingsObj.tts_browser_voice_name || '';

  let resource_algorithms_enabled = settingsObj.resource_algorithms_enabled !== false;
  let resource_bg_panels_enabled = settingsObj.resource_bg_panels_enabled !== false;
  let resource_audio_keepalive_enabled = settingsObj.resource_audio_keepalive_enabled !== false;
  let resource_chart_screenshots_enabled = settingsObj.resource_chart_screenshots_enabled !== false;
  let resource_chart_alerts_enabled = settingsObj.resource_chart_alerts_enabled !== false;
  let resource_news_enabled = settingsObj.resource_news_enabled !== false;
  let resource_telegram_enabled = settingsObj.resource_telegram_enabled !== false;
  let resource_tts_enabled = settingsObj.resource_tts_enabled !== false;
  let resource_sound_beeps_enabled = settingsObj.resource_sound_beeps_enabled !== false;

  disabledList.forEach(item => {
    if (typeof item === 'string' && item.startsWith('cfg:')) {
      const parts = item.split(':');
      if (parts.length >= 3) {
        const key = parts[1];
        const val = parts.slice(2).join(':');
        if (key === 'vortex_ai_enabled') vortex_ai_enabled = val === 'true';
        else if (key === 'general_prompt_days') general_prompt_days = val;
        else if (key === 'general_prompt_panel_id') general_prompt_panel_id = val;
        else if (key === 'manual_prompt_id') manual_prompt_id = val;
        else if (key === 'chart_show_sma9') chart_show_sma9 = val === 'true';
        else if (key === 'chart_show_ema21') chart_show_ema21 = val === 'true';
        else if (key === 'chart_show_ema50') chart_show_ema50 = val === 'true';
        else if (key === 'chart_show_rsi') chart_show_rsi = val === 'true';
        else if (key === 'chart_show_macd') chart_show_macd = val === 'true';
        else if (key === 'chart_show_pva') chart_show_pva = val === 'true';
        else if (key === 'chart_show_emacd') chart_show_emacd = val === 'true';
        else if (key === 'chart_show_fvg') chart_show_fvg = val === 'true';
        else if (key === 'log_show_sistema') log_show_sistema = val === 'true';
        else if (key === 'log_show_alerta') log_show_alerta = val === 'true';
        else if (key === 'log_show_ia') log_show_ia = val === 'true';
        else if (key === 'log_show_erro') log_show_erro = val === 'true';
        else if (key === 'log_show_noticia') log_show_noticia = val === 'true';
        else if (key === 'market_update_interval') market_update_interval = Number(val) || 500;
        else if (key === 'force_update_interval') force_update_interval = Number(val) || 1500;
        else if (key === 'candles_update_interval') candles_update_interval = Number(val) || 2000;
        else if (key === 'screenshot_update_interval') screenshot_update_interval = Number(val) || 3000;
        else if (key === 'general_prompt_master_enabled') general_prompt_master_enabled = val === 'true';
        else if (key === 'chart_candle_bar_count') chart_candle_bar_count = Number(val) || 60;
        else if (key === 'chart_history_days') chart_history_days = Math.max(3, Number(val) || 7);
        else if (key === 'slot_history_days') slot_history_days = val || '';
        else if (key === 'chart_manual_trade_mode') chart_manual_trade_mode = val;
        else if (key === 'chart_manual_sizing_mode') chart_manual_sizing_mode = val;
        else if (key === 'chart_manual_risk_usd') chart_manual_risk_usd = Number(val) || 250;
        else if (key === 'chart_manual_sl_points') chart_manual_sl_points = Number(val) || 50;
        else if (key === 'chart_manual_tp_points') chart_manual_tp_points = Number(val) || 50;
        else if (key === 'chart_manual_contracts') chart_manual_contracts = Number(val) || 1;
        else if (key === 'chart_show_levels') chart_show_levels = val === 'true';
        else if (key === 'chart_confirm_manual_trade') chart_confirm_manual_trade = val !== 'false';
        else if (key === 'chart_manual_ia_validate') chart_manual_ia_validate = val === 'true';
        // Virtual configs adicionadas
        else if (key === 'alert_force_ativo') alert_force_ativo = val === 'true';
        else if (key === 'alert_force_buy_min') alert_force_buy_min = Number(val) || -2.0;
        else if (key === 'alert_force_sell_max') alert_force_sell_max = Number(val) || 2.0;
        else if (key === 'alert_force_cooldown') alert_force_cooldown = Number(val) || 10;
        else if (key === 'alert_force_telegram') alert_force_telegram = val === 'true';
        else if (key === 'alert_force_vies_shift') alert_force_vies_shift = val === 'true';
        else if (key === 'alert_pva_ativo') alert_pva_ativo = val === 'true';
        else if (key === 'alert_pva_cooldown') alert_pva_cooldown = Number(val) || 5;
        else if (key === 'alert_pva_telegram') alert_pva_telegram = val === 'true';
        else if (key === 'alert_mode') alert_mode = val;
        else if (key === 'alert_sent_ativo') alert_sent_ativo = val === 'true';
        else if (key === 'alert_sent_max') alert_sent_max = Number(val) || 75;
        else if (key === 'alert_sent_min') alert_sent_min = Number(val) || 25;
        else if (key === 'alert_sent_cooldown') alert_sent_cooldown = Number(val) || 5;
        else if (key === 'alert_sent_telegram') alert_sent_telegram = val === 'true';
        else if (key === 'alert_sent_micro_ativo') alert_sent_micro_ativo = val === 'true';
        else if (key === 'alert_sent_micro_max') alert_sent_micro_max = Number(val) || 75;
        else if (key === 'alert_sent_micro_min') alert_sent_micro_min = Number(val) || 25;
        else if (key === 'alert_sent_micro_cooldown') alert_sent_micro_cooldown = Number(val) || 5;
        else if (key === 'alert_sent_micro_telegram') alert_sent_micro_telegram = val === 'true';
        else if (key === 'alert_bt_ativo') alert_bt_ativo = val === 'true';
        else if (key === 'alert_bt_vol') alert_bt_vol = Number(val) || 50;
        else if (key === 'alert_bt_cooldown') alert_bt_cooldown = Number(val) || 5;
        else if (key === 'alert_bt_telegram') alert_bt_telegram = val === 'true';
        else if (key === 'alert_delta_ativo') alert_delta_ativo = val === 'true';
        else if (key === 'alert_delta_sell') alert_delta_sell = Number(val) || 0.5;
        else if (key === 'alert_delta_buy') alert_delta_buy = Number(val) || 1.5;
        else if (key === 'alert_delta_vol_min') alert_delta_vol_min = Number(val) || 50;
        else if (key === 'alert_delta_cooldown') alert_delta_cooldown = Number(val) || 5;
        else if (key === 'alert_delta_telegram') alert_delta_telegram = val === 'true';
        else if (key === 'alert_acel_ativo') alert_acel_ativo = val === 'true';
        else if (key === 'alert_acel_explosao') alert_acel_explosao = val === 'true';
        else if (key === 'alert_acel_exaustao') alert_acel_exaustao = val === 'true';
        else if (key === 'alert_acel_compressao') alert_acel_compressao = val === 'true';
        else if (key === 'alert_acel_cooldown') alert_acel_cooldown = Number(val) || 5;
        else if (key === 'alert_acel_telegram') alert_acel_telegram = val === 'true';
        else if (key === 'alert_nivel_ativo') alert_nivel_ativo = val === 'true';
        else if (key === 'alert_nivel_dist') alert_nivel_dist = Number(val) || 25;
        else if (key === 'alert_nivel_cooldown') alert_nivel_cooldown = Number(val) || 10;
        else if (key === 'alert_nivel_telegram') alert_nivel_telegram = val === 'true';
        else if (key === 'alert_nivel_niveis') alert_nivel_niveis = val ? val.split(',') : [];
        else if (key === 'general_prompt_enabled') general_prompt_enabled = val === 'true';
        else if (key === 'general_prompt_frequency') general_prompt_frequency = Number(val) || 15;
        else if (key === 'general_prompt_start_time') general_prompt_start_time = val;
        else if (key === 'general_prompt_end_time') general_prompt_end_time = val;
        else if (key === 'general_prompt_template') general_prompt_template = val;
        else if (key === 'general_prompt_telegram_send_image') general_prompt_telegram_send_image = val === 'true';
        else if (key === 'general_prompt_telegram_enabled') general_prompt_telegram_enabled = val === 'true';
        else if (key === 'news_background_enabled') news_background_enabled = val === 'true';
        else if (key === 'news_chart_markers') news_chart_markers = val !== 'false';
        else if (key === 'selected_prompt_id') selected_prompt_id = val;
        else if (key === 'manual_strategy_id') manual_strategy_id = val;
        else if (key === 'ops_check_interval_ms') ops_check_interval_ms = Number(val) || 2000;
        else if (key === 'admin_ops_telegram_enabled') admin_ops_telegram_enabled = val === 'true';
        else if (key === 'admin_ops_telegram_bot_token') admin_ops_telegram_bot_token = val;
        else if (key === 'admin_ops_telegram_chat_id') admin_ops_telegram_chat_id = val;
        else if (key === 'multi_strategy_mode') multi_strategy_mode = val === 'true';
        else if (key === 'transmission_mode') transmission_mode = val;
        else if (key === 'websocket_hub_url') websocket_hub_url = val;
        else if (key === 'enable_tts') enable_tts = val === 'true';
        else if (key === 'tts_provider') tts_provider = val;
        else if (key === 'tts_groq_api_key') tts_groq_api_key = val;
        else if (key === 'tts_gemini_api_key') tts_gemini_api_key = val;
        else if (key === 'tts_openai_api_key') tts_openai_api_key = val;
        else if (key === 'tts_groq_model') tts_groq_model = val;
        else if (key === 'tts_groq_voice') tts_groq_voice = val;
        else if (key === 'tts_gemini_model') tts_gemini_model = val;
        else if (key === 'tts_gemini_voice') tts_gemini_voice = val;
        else if (key === 'tts_openai_model') tts_openai_model = val;
        else if (key === 'tts_openai_voice') tts_openai_voice = val;
        else if (key === 'tts_trigger_mode') tts_trigger_mode = val;
        else if (key === 'tts_cooldown_seconds') tts_cooldown_seconds = Number(val) || 15;
        else if (key === 'tts_volume') tts_volume = Number(val) || 1.0;
        else if (key === 'tts_browser_voice_name') tts_browser_voice_name = val;
        else if (key === 'resource_algorithms_enabled') resource_algorithms_enabled = val !== 'false';
        else if (key === 'resource_bg_panels_enabled') resource_bg_panels_enabled = val !== 'false';
        else if (key === 'resource_audio_keepalive_enabled') resource_audio_keepalive_enabled = val !== 'false';
        else if (key === 'resource_chart_screenshots_enabled') resource_chart_screenshots_enabled = val !== 'false';
        else if (key === 'resource_chart_alerts_enabled') resource_chart_alerts_enabled = val !== 'false';
        else if (key === 'resource_news_enabled') resource_news_enabled = val !== 'false';
        else if (key === 'resource_telegram_enabled') resource_telegram_enabled = val !== 'false';
        else if (key === 'resource_tts_enabled') resource_tts_enabled = val !== 'false';
        else if (key === 'resource_sound_beeps_enabled') resource_sound_beeps_enabled = val !== 'false';
      }
    }
  });

  const contracts = settingsObj.contracts !== undefined ? Number(settingsObj.contracts) : undefined;
  const daily_max_loss_usd = settingsObj.daily_max_loss_usd !== undefined ? Number(settingsObj.daily_max_loss_usd) : 0;
  const daily_max_gain_usd = settingsObj.daily_max_gain_usd !== undefined ? Number(settingsObj.daily_max_gain_usd) : 0;
  const daily_max_entries = settingsObj.daily_max_entries !== undefined ? Number(settingsObj.daily_max_entries) : 0;
  const session_max_entries = settingsObj.session_max_entries !== undefined ? Number(settingsObj.session_max_entries) : 0;

  const session1_active = settingsObj.session1_active === true;
  const session1_start = settingsObj.session1_start || '09:00:00';
  const session1_end = settingsObj.session1_end || '12:00:00';

  const session2_active = settingsObj.session2_active === true;
  const session2_start = settingsObj.session2_start || '13:00:00';
  const session2_end = settingsObj.session2_end || '17:00:00';

  const session3_active = settingsObj.session3_active === true;
  const session3_start = settingsObj.session3_start || '18:00:00';
  const session3_end = settingsObj.session3_end || '22:00:00';

  const session4_active = settingsObj.session4_active === true;
  const session4_start = settingsObj.session4_start || '23:00:00';
  const session4_end = settingsObj.session4_end || '02:00:00';

  const global_cycle_start = settingsObj.global_cycle_start || '19:00:00';
  const global_cycle_end = settingsObj.global_cycle_end || '18:00:00';

  const auto_cancel_open_ops_enabled = settingsObj.auto_cancel_open_ops_enabled === true;
  const auto_cancel_open_ops_time = settingsObj.auto_cancel_open_ops_time || '17:59:00';
  const pause_alerts_on_stale_market = settingsObj.pause_alerts_on_stale_market !== false;
  const stale_market_timeout_sec = settingsObj.stale_market_timeout_sec !== undefined ? Number(settingsObj.stale_market_timeout_sec) : 15;

  return {
    ...settingsObj,
    vortex_ai_enabled,
    general_prompt_days,
    chart_show_sma9,
    chart_show_ema21,
    chart_show_ema50,
    chart_show_rsi,
    chart_show_macd,
    chart_show_pva,
    chart_show_emacd,
    chart_show_fvg,
    log_show_sistema,
    log_show_alerta,
    log_show_ia,
    log_show_erro,
    log_show_noticia,
    market_update_interval,
    force_update_interval,
    candles_update_interval,
    screenshot_update_interval,
    general_prompt_master_enabled,
    chart_candle_bar_count,
    chart_history_days,
    slot_history_days,
    chart_manual_trade_mode,
    chart_manual_sizing_mode,
    chart_manual_risk_usd,
    chart_manual_sl_points,
    chart_manual_tp_points,
    chart_manual_contracts,
    chart_show_levels,
    chart_confirm_manual_trade,
    chart_manual_ia_validate,
    alert_force_ativo,
    alert_force_buy_min,
    alert_force_sell_max,
    alert_force_cooldown,
    alert_force_telegram,
    alert_force_vies_shift,
    alert_pva_ativo,
    alert_pva_cooldown,
    alert_pva_telegram,
    alert_mode,
    alert_sent_ativo,
    alert_sent_max,
    alert_sent_min,
    alert_sent_cooldown,
    alert_sent_telegram,
    alert_sent_micro_ativo,
    alert_sent_micro_max,
    alert_sent_micro_min,
    alert_sent_micro_cooldown,
    alert_sent_micro_telegram,
    alert_bt_ativo,
    alert_bt_vol,
    alert_bt_cooldown,
    alert_bt_telegram,
    alert_delta_ativo,
    alert_delta_sell,
    alert_delta_buy,
    alert_delta_vol_min,
    alert_delta_cooldown,
    alert_delta_telegram,
    alert_acel_ativo,
    alert_acel_explosao,
    alert_acel_exaustao,
    alert_acel_compressao,
    alert_acel_cooldown,
    alert_acel_telegram,
    alert_nivel_ativo,
    alert_nivel_dist,
    alert_nivel_cooldown,
    alert_nivel_telegram,
    alert_nivel_niveis,
    general_prompt_enabled,
    general_prompt_frequency,
    general_prompt_start_time,
    general_prompt_end_time,
    general_prompt_template,
    general_prompt_telegram_send_image,
    general_prompt_telegram_enabled,
    general_prompt_panel_id,
    news_background_enabled,
    news_chart_markers,
    manual_prompt_id,
    selected_prompt_id,
    manual_strategy_id,
    ops_check_interval_ms,
    admin_ops_telegram_enabled,
    admin_ops_telegram_bot_token,
    admin_ops_telegram_chat_id,
    multi_strategy_mode,
    contracts,
    daily_max_loss_usd,
    daily_max_gain_usd,
    daily_max_entries,
    session_max_entries,
    session1_active,
    session1_start,
    session1_end,
    session2_active,
    session2_start,
    session2_end,
    session3_active,
    session3_start,
    session3_end,
    session4_active,
    session4_start,
    session4_end,
    global_cycle_start,
    global_cycle_end,
    auto_cancel_open_ops_enabled,
    auto_cancel_open_ops_time,
    pause_alerts_on_stale_market,
    stale_market_timeout_sec,
    transmission_mode,
    websocket_hub_url,
    enable_tts,
    tts_provider,
    tts_groq_api_key,
    tts_gemini_api_key,
    tts_openai_api_key,
    tts_groq_model,
    tts_groq_voice,
    tts_gemini_model,
    tts_gemini_voice,
    tts_openai_model,
    tts_openai_voice,
    tts_trigger_mode,
    tts_cooldown_seconds,
    tts_volume,
    tts_browser_voice_name,
    resource_algorithms_enabled,
    resource_bg_panels_enabled,
    resource_audio_keepalive_enabled,
    resource_chart_screenshots_enabled,
    resource_chart_alerts_enabled,
    resource_news_enabled,
    resource_telegram_enabled,
    resource_tts_enabled,
    resource_sound_beeps_enabled
  };
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [panel, setPanel] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isRestrictedSession, setIsRestrictedSession] = useState<boolean>(false);
  const [userPermissions, setUserPermissions] = useState<{
    allow_telegram_news: boolean;
    allow_alerts: boolean;
    allow_operations: boolean;
    allow_share_strategies: boolean;
    allow_simulator: boolean;
    allow_panel_mode_2?: boolean;
    allow_copy_trading?: boolean;
    max_strategies: number;
    max_accounts?: number;
  }>(() => {
    try {
      const cached = localStorage.getItem('vortex_user_permissions');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {}
    return {
      allow_telegram_news: true,
      allow_alerts: true,
      allow_operations: true,
      allow_share_strategies: false,
      allow_simulator: false,
      allow_panel_mode_2: true,
      allow_copy_trading: true,
      max_strategies: 2,
      max_accounts: 5
    };
  });

  const [planDetails, setPlanDetails] = useState<SubscriptionPlanDetails | null>(() => {
    try {
      const cached = localStorage.getItem('vortex_plan_details');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {}
    return null;
  });

  const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';

  const canAccessAlgorithmCreator = isSystemAdmin || (
    planDetails ? (!planDetails.isCopyTraderOnly && planDetails.hasAlgorithmCreator) : true
  );

  const canAccessCopilotAI = isSystemAdmin || (
    planDetails ? (!planDetails.isCopyTraderOnly && planDetails.hasCopilotAI) : true
  );

  const canAccessCopyTrading = isSystemAdmin || (
    planDetails ? planDetails.hasCopyNT8 : (userPermissions?.allow_copy_trading ?? true)
  );

  const canAccessReplay = isSystemAdmin || (
    planDetails ? (!planDetails.isCopyTraderOnly && planDetails.hasAlgorithmCreator) : (userPermissions?.allow_simulator ?? true)
  );

  const maxDemoAccounts = isSystemAdmin ? 999 : (
    planDetails ? planDetails.maxDemoAccounts : (userPermissions?.max_accounts || 10)
  );

  const maxSyncAccounts = isSystemAdmin ? 999 : (
    planDetails ? planDetails.maxSyncAccounts : (userPermissions?.max_accounts || 10)
  );

  useEffect(() => {
    try {
      if (userPermissions) {
        localStorage.setItem('vortex_user_permissions', JSON.stringify(userPermissions));
      }
    } catch {}
  }, [userPermissions]);
  const [globalMarketInterval, setGlobalMarketInterval] = useState<number>(250);

  // Múltiplos Painéis
  const [panels, setPanels] = useState<any[]>([]);
  const [activePanel, setActivePanel] = useState<any | null>(null);
  const [allSettings, setAllSettings] = useState<Record<string, any>>({});

  // Contas Demonstrativas Globais e Copy Trade
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const accountsRef = useRef<BrokerAccount[]>([]);
  accountsRef.current = accounts;
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  const [activeAccount, setActiveAccount] = useState<BrokerAccount | null>(null);
  const activeAccountRef = useRef<BrokerAccount | null>(null);
  activeAccountRef.current = activeAccount;
  useEffect(() => {
    activeAccountRef.current = activeAccount;
  }, [activeAccount]);

  const [accountStrategies, setAccountStrategies] = useState<AccountStrategy[]>([]);
  const accountStrategiesRef = useRef<AccountStrategy[]>([]);
  accountStrategiesRef.current = accountStrategies;
  useEffect(() => {
    accountStrategiesRef.current = accountStrategies;
  }, [accountStrategies]);
  const [copyConfigs, setCopyConfigs] = useState<CopyTradingConfig[]>(() => getLocalCopyTradingConfigs());

  const refreshAccounts = async (syncNinja = true): Promise<BrokerAccount[]> => {
    try {
      const accs = await fetchAccountsSupabase();
      let finalAccs = accs;
      setAccounts(accs);
      const rawPlan = typeof localStorage !== 'undefined' ? localStorage.getItem('vortex_plan_details') : null;
      const parsedPlan = rawPlan ? JSON.parse(rawPlan) : null;
      const isCopyOnly = planDetails?.isCopyTraderOnly === true || parsedPlan?.isCopyTraderOnly === true || parsedPlan?.productId === 9286;

      if (isCopyOnly) {
        finalAccs = accs.filter(a => a.platform === 'nt8' || a.send_localhost === true || isNinjaExecutionAccount(a));
        setAccounts(finalAccs);
      }

      if (finalAccs.length === 0 && user && !isCopyOnly) {
        // Auto-Onboarding: cria 1ª conta demonstrativa (apenas para produtos com robôs/simulador, NUNCA para produto exclusivo de Copy 9286)
        const newAcc = await createDemoAccountSupabase({
          account_name: 'Conta Demonstrativa Principal',
          initial_balance: 50000,
          dd_mode: 'intraday_trailing',
          max_drawdown_usd: 2500,
          daily_stop_loss_usd: 1000,
          enforce_dd_lockout: true,
          is_master: false,
          manual_trading_enabled: true,
          manual_start_time: '00:00:00',
          manual_end_time: '23:59:59',
          symbol_mapping: 'NQ->MNQ, ES->MES, YM->MYM'
        });
        if (newAcc) {
          finalAccs = [newAcc];
          setAccounts([newAcc]);
          activeAccountRef.current = newAcc;
          setActiveAccount(newAcc);
        }
      } else if (accs.length > 0) {
        const storedId = localStorage.getItem('vortex_active_account_id');
        const found = accs.find(a => a.id === storedId) || accs[0];
        activeAccountRef.current = found;
        setActiveAccount(found);
      } else {
        activeAccountRef.current = null;
        setActiveAccount(null);
      }
      if (syncNinja) {
        syncAllCopyRulesToNinjaTrader().catch(() => {});
      }
      return finalAccs;
    } catch (err) {
      console.error('[ACCOUNTS] Erro ao atualizar contas:', err);
      return [];
    }
  };

  const getCompatibleCopilotRoutesForAccountAndPanel = (
    targetAcc: BrokerAccount | null | undefined,
    targetPanel: any
  ): AccountStrategy[] => {
    if (!targetAcc || targetAcc.is_active === false || !targetPanel) return [];
    const currentRoutes = (accountStrategiesRef.current && accountStrategiesRef.current.length > 0)
      ? accountStrategiesRef.current
      : (accountStrategies || []);
    const currentPrompts = (promptsRef.current && promptsRef.current.length > 0)
      ? promptsRef.current
      : (prompts || []);
    const allStrats = [
      ...(customStrategiesRef.current || customStrategies || []),
      ...(publicStrategiesRef.current || publicStrategies || [])
    ];

    const matchesPanelId = (pId: string | null | undefined): boolean => {
      if (!pId || pId === 'all') return true;
      if (pId === targetPanel.id || pId === targetPanel.instance_id) return true;
      const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const pNorm = norm(pId);
      const tName = norm(targetPanel.name);
      const tInst = norm(targetPanel.instance_id);
      if (pNorm && (pNorm === tName || pNorm === tInst)) return true;
      return false;
    };

    return currentRoutes.filter((r: AccountStrategy) => {
      if (r.account_id !== targetAcc.id) return false;
      if (r.is_enabled === false) return false;
      // Somente rotas de Prompt IA / Copilot (ignora vínculos diretos exclusivos de robô manual)
      if (!r.prompt_id && r.manual_strategy_id) return false;

      if (r.prompt_id && r.prompt_id !== 'native-chart') {
        const pObj = currentPrompts.find(p => p.id === r.prompt_id);
        if (!pObj) return false;
        // Prompts Geradores de Sinais (prompt_type === 'signal_generator') operam em 2º plano na Gestão de Contas e não fazem parte do Copilot do gráfico
        if (pObj.prompt_type === 'signal_generator') return false;
        if (pObj.panel_id && pObj.panel_id !== 'all') {
          return matchesPanelId(pObj.panel_id);
        }
        if (pObj.trigger_strategy_id) {
          const trigAlgo = allStrats.find(s => s.id === pObj.trigger_strategy_id);
          const trigPanelId = (trigAlgo?.panel_id && trigAlgo.panel_id !== 'all')
            ? trigAlgo.panel_id
            : (trigAlgo?.risk_settings?.target_panel_id || null);
          if (trigPanelId && trigPanelId !== 'all') {
            return matchesPanelId(trigPanelId);
          }
        }
        if (r.panel_id && r.panel_id !== 'all') {
          return matchesPanelId(r.panel_id);
        }
        return true;
      }

      if (r.panel_id && r.panel_id !== 'all') {
        return matchesPanelId(r.panel_id);
      }
      return true;
    });
  };

  const syncCopilotForAccountAndPanel = (
    targetAcc: BrokerAccount | null | undefined,
    targetPanel: any,
    logTransition: boolean = true
  ) => {
    if (!targetPanel) return;
    const compatibleRoutes = getCompatibleCopilotRoutesForAccountAndPanel(targetAcc, targetPanel);
    const shouldEnable = compatibleRoutes.length > 0;
    const matchedPromptIds = compatibleRoutes
      .map(r => r.prompt_id)
      .filter((id): id is string => Boolean(id && id !== 'native-chart'));
    const nextSelectedPromptId = matchedPromptIds.length > 0 ? matchedPromptIds.join(',') : '';

    const wasEnabled = aiEnabledRef.current;
    aiEnabledRef.current = shouldEnable;
    setAiEnabledState(shouldEnable);

    const panelId = targetPanel.id;
    const currentPanelSettings = allSettings[panelId] || settings;
    if (currentPanelSettings) {
      const updatedFields: Partial<any> = { vortex_ai_enabled: shouldEnable };
      if (shouldEnable) {
        updatedFields.selected_prompt_id = nextSelectedPromptId;
      }
      saveSettings(updatedFields, panelId);
    }

    if (logTransition) {
      const accLabel = targetAcc?.account_name || 'Sem Conta';
      if (shouldEnable) {
        const promptNames = compatibleRoutes.map(r => {
          if (!r.prompt_id || r.prompt_id === 'native-chart') return 'Contexto do Gráfico (Nativo)';
          const p = (promptsRef.current || prompts || []).find(item => item.id === r.prompt_id);
          return p ? p.name : r.prompt_id;
        }).join(', ');
        addLog('IA', `🟢 [${targetPanel.name}] Copilot IA ativado automaticamente para a Conta '${accLabel}' (Prompt: '${promptNames}').`, 'ia');
      } else if (wasEnabled) {
        addLog('IA', `⚪ [${targetPanel.name}] Copilot IA desativado ao alternar Ativo/Conta (Conta '${accLabel}' não possui prompt compatível ativo para este ativo).`, 'ia');
      }
    }
  };

  const switchAccount = (acc: BrokerAccount) => {
    activeAccountRef.current = acc;
    setActiveAccount(acc);
    localStorage.setItem('vortex_active_account_id', acc.id);
    syncCopilotForAccountAndPanel(acc, activePanelRef.current || activePanel, true);
  };

  const deleteAccountAction = async (acc: BrokerAccount): Promise<boolean> => {
    if (isRestrictedSession) {
      alert('🔒 Modo Segundo Acesso Restrito: A exclusão de contas não é permitida neste acesso.');
      return false;
    }
    try {
      const accName = acc.account_name?.trim().toLowerCase() || '';

      // 1. Otimista imediato no estado de Contas (remove pelo ID e por qualquer duplicata residual)
      setAccounts((prev: BrokerAccount[]) => prev.filter(a => 
        a.id !== acc.id && (!accName || a.account_name?.trim().toLowerCase() !== accName)
      ));
      if (activeAccount?.id === acc.id || (accName && activeAccount?.account_name?.trim().toLowerCase() === accName)) {
        const remaining = accounts.filter(a => 
          a.id !== acc.id && (!accName || a.account_name?.trim().toLowerCase() !== accName)
        );
        const nextActive = remaining.length > 0 ? remaining[0] : null;
        activeAccountRef.current = nextActive;
        setActiveAccount(nextActive);
        if (nextActive) {
          localStorage.setItem('vortex_active_account_id', nextActive.id);
        } else {
          localStorage.removeItem('vortex_active_account_id');
        }
      }

      // 2. Otimista imediato nos Relatórios de Sinais (Análise de Desempenho)
      reportsRef.current = reportsRef.current.filter(r => {
        const matchId = r.account_id === acc.id;
        const matchName = accName !== '' && (
          (r.account_name && r.account_name.trim().toLowerCase() === accName) ||
          (r.description && r.description.toLowerCase().includes(accName))
        );
        return !matchId && !matchName;
      });
      setReports([...reportsRef.current]);
      saveLocalStrategyReports(reportsRef.current);

      // 3. Otimista imediato nas Regras de Copy Trading
      // Se era Master, remove toda a regra. Se era Slave, remove a slave da regra.
      setCopyConfigs(prev => prev.filter(c => {
        const isMaster = c.master_account_id === acc.id || (accName !== '' && c.master_account_id.toLowerCase() === accName);
        const isSlave = c.slave_account_id === acc.id || (accName !== '' && c.slave_account_id.toLowerCase() === accName);
        return !isMaster && !isSlave;
      }));

      // 4. Executa a exclusão em cascata completa no banco e localStorage
      const success = await deleteAccountSupabase(acc.id, acc.account_name);

      // 5. Atualiza todos os dados do servidor de forma sequencial
      const loadedAccs = await refreshAccounts(false);
      await fetchReportsList(true);
      await refreshCopyConfigs(loadedAccs);

      // 6. Sincroniza imediatamente com o NinjaTrader Add-On (limpa regras e remove conta da gestão de risco)
      await syncAllCopyRulesToNinjaTrader(true).catch(() => {});

      addLog('SISTEMA', `🗑️ Conta "${acc.account_name}", relatórios de operações e regras de Copy Trading foram excluídos com sucesso.`, 'sistema');
      return success;
    } catch (err: any) {
      console.error('[CONTEXT] Erro ao deletar conta:', err);
      return false;
    }
  };

  const resetAccountAction = async (acc: BrokerAccount, newBalance?: number): Promise<boolean> => {
    if (isRestrictedSession) {
      alert('🔒 Modo Segundo Acesso Restrito: O reset de saldo de contas não é permitido neste acesso.');
      return false;
    }
    if (acc.platform === 'nt8' || acc.send_localhost) {
      alert(`A conta "${acc.account_name}" é sincronizada com o NinjaTrader 8. O saldo desta conta é gerenciado diretamente pela corretora/NinjaTrader e não pode ser resetado manualmente pelo painel.`);
      return false;
    }

    try {
      const resetBal = newBalance !== undefined ? Number(newBalance) : Number(acc.initial_balance || 25000);
      const accName = acc.account_name?.trim().toLowerCase() || '';

      // 1. Atualização otimista imediata no estado de Contas
      setAccounts((prev: BrokerAccount[]) => prev.map(a => a.id === acc.id ? {
        ...a,
        initial_balance: newBalance !== undefined ? resetBal : a.initial_balance,
        balance: resetBal,
        high_watermark: resetBal,
        eod_baseline_balance: resetBal,
        status: 'active'
      } : a));

      if (activeAccount?.id === acc.id || (accName && activeAccount?.account_name?.trim().toLowerCase() === accName)) {
        setActiveAccount(prev => prev ? {
          ...prev,
          initial_balance: newBalance !== undefined ? resetBal : prev.initial_balance,
          balance: resetBal,
          high_watermark: resetBal,
          eod_baseline_balance: resetBal,
          status: 'active'
        } : null);
        if (activeAccountRef.current) {
          activeAccountRef.current = {
            ...activeAccountRef.current,
            initial_balance: newBalance !== undefined ? resetBal : activeAccountRef.current.initial_balance,
            balance: resetBal,
            high_watermark: resetBal,
            eod_baseline_balance: resetBal,
            status: 'active'
          };
        }
      }

      // 2. Otimista imediato nos Relatórios de Sinais (remove todo o histórico de operações desta conta)
      const removedReportIds: string[] = [];
      reportsRef.current = reportsRef.current.filter(r => {
        const matchId = r.account_id === acc.id;
        const matchName = accName !== '' && (
          (r.account_name && r.account_name.trim().toLowerCase() === accName) ||
          (r.description && r.description.toLowerCase().includes(accName))
        );
        if (matchId || matchName) {
          removedReportIds.push(r.id);
          return false;
        }
        return true;
      });
      setReports([...reportsRef.current]);
      saveLocalStrategyReports(reportsRef.current);

      // 3. Limpar referências de ordens ativas nos painéis gráficos (se houver ordem em andamento desta conta)
      removedReportIds.forEach(id => {
        let foundPanelId: string | null = null;
        activeReportIdsRef.current.forEach((idSet, key) => {
          if (idSet.has(id)) {
            foundPanelId = key;
          }
        });
        if (foundPanelId) {
          const panelSet = activeReportIdsRef.current.get(foundPanelId);
          if (panelSet) {
            panelSet.delete(id);
            if (panelSet.size === 0) {
              activeReportIdsRef.current.delete(foundPanelId);
              const cache = panelDataCache.current[foundPanelId];
              if (cache) {
                cache.aiResult = null;
                if (cache.aiResults) {
                  cache.aiResults = {};
                }
              }
              if (activePanelRef.current?.id === foundPanelId) {
                setAiResult(null);
              }
            }
          }
        }
      });

      // 4. Executar reset no Supabase e banco local (atualiza saldo/status e deleta strategy reports da conta)
      await resetDemoAccountSupabase(acc.id, resetBal, acc.account_name);

      // 5. Recarrega dados atualizados do servidor de forma limpa
      await refreshAccounts(false);
      await fetchReportsList(true);

      addLog('SISTEMA', `🔄 Conta "${acc.account_name}" resetada para US$ ${resetBal.toLocaleString()} e histórico de operações apagado com sucesso.`, 'sistema');
      return true;
    } catch (err: any) {
      console.error('[CONTEXT] Erro ao resetar conta:', err);
      addLog('ERRO', `Erro ao resetar conta "${acc.account_name}": ${err.message || err}`, 'erro');
      return false;
    }
  };

  const linkStrategyToAccount = async (opts: {
    account_id: string;
    prompt_id?: string | null;
    manual_strategy_id?: string | null;
    panel_id?: string | null;
    contract_size_multiplier?: number;
    is_enabled?: boolean;
  }) => {
    const newRoute: AccountStrategy = {
      id: generateSecureUUID(),
      account_id: opts.account_id,
      prompt_id: opts.prompt_id || null,
      manual_strategy_id: opts.manual_strategy_id || null,
      panel_id: opts.panel_id !== undefined ? opts.panel_id : (activePanelRef.current?.id || activePanel?.id || null),
      contract_size_multiplier: opts.contract_size_multiplier !== undefined ? Number(opts.contract_size_multiplier) : 1.0,
      is_enabled: opts.is_enabled !== undefined ? opts.is_enabled : true,
      created_at: new Date().toISOString()
    };

    // Atualização otimista imediata no estado (0ms de delay)
    setAccountStrategies((prev: AccountStrategy[]) => {
      const filtered = prev.filter(
        r =>
          !(
            r.account_id === newRoute.account_id &&
            r.manual_strategy_id === newRoute.manual_strategy_id &&
            r.prompt_id === newRoute.prompt_id
          )
      );
      const nextList = [...filtered, newRoute];
      accountStrategiesRef.current = nextList;
      return nextList;
    });

    // Salva local e sincroniza no Supabase em background
    await saveAccountStrategySupabase(newRoute);
  };

  const unlinkStrategyFromAccount = async (routeId: string) => {
    // Atualização otimista imediata no estado (0ms de delay)
    setAccountStrategies((prev: AccountStrategy[]) => prev.filter(r => r.id !== routeId));
    // Remove local e sincroniza no Supabase em background
    await deleteAccountStrategySupabase(routeId);
  };

  const refreshAccountStrategies = async () => {
    try {
      const strats = await fetchAccountStrategiesSupabase();
      setAccountStrategies(strats);
    } catch (err) {
      console.error('[ACCOUNTS] Erro ao atualizar rotas de estratégias:', err);
    }
  };

  const refreshCopyConfigs = async (providedAccounts?: BrokerAccount[]): Promise<CopyTradingConfig[]> => {
    try {
      const configs = await fetchCopyTradingConfigsSupabase(providedAccounts);
      setCopyConfigs(configs || []);
      return configs || [];
    } catch (err) {
      console.error('[ACCOUNTS] Erro ao atualizar copy configs:', err);
      const local = getLocalCopyTradingConfigs();
      setCopyConfigs(local);
      return local;
    }
  };

  const [remoteCopyConfigs, setRemoteCopyConfigs] = useState<RemoteCopySubscription[]>([]);
  const remoteCopyConfigsRef = useRef<RemoteCopySubscription[]>([]);
  remoteCopyConfigsRef.current = remoteCopyConfigs;

  const refreshRemoteCopyConfigs = async () => {
    try {
      const configs = await fetchRemoteCopySubscriptionsSupabase();
      setRemoteCopyConfigs(configs);
    } catch (err) {
      console.error('[ACCOUNTS] Erro ao atualizar remote copy configs:', err);
    }
  };

  useEffect(() => {
    if (user) {
      (async () => {
        // 1. Carrega primeiro as contas do banco para que o filtro de regras reconheça todas as contas da assinatura
        const loadedAccs = await refreshAccounts(false);
        // 2. Carrega as regras de espelhamento passando as contas carregadas (sem depender de localStorage)
        await refreshCopyConfigs(loadedAccs);
        // 3. Carrega rotas de estratégias e assinaturas remotas
        await Promise.all([
          refreshAccountStrategies(),
          refreshRemoteCopyConfigs()
        ]);
        // 4. Sincroniza credenciais de túnel (PC / Mobile) e reconecta o canal ponto-a-ponto silenciosamente
        try {
          const cfg = await fetchAndSyncNinjaTunnelConfigSupabase();
          if (cfg?.pairing_token || cfg?.connection_mode === 'cloud') {
            reconnectCloudChannel();
          }
        } catch (err) {
          console.warn('[NINJA_TUNNEL] Falha ao sincronizar config de túnel no login:', err);
        }
        // 5. Agora que contas, regras e túnel estão devidamente carregados do banco, sincroniza com o Add-On do NinjaTrader
        await syncAllCopyRulesToNinjaTrader().catch(() => {});
      })();
    }
  }, [user]);

  const panelDataCache = useRef<Record<string, {
    marketData: MarketData | null;
    forces: any[];
    gammaLevels: GammaLevels | null;
    optionsMarket?: OptionsMarketData | null;
    screenshot: string | null;
    candles?: Candle[];
    lastGammaFetch: number;
    lastGammaSymbol: string;
    lastOptionsMarketFetch?: number;
    aiResult?: any;
    aiResults?: Record<string, any>;
    lastScreenshotFetch?: number;
    lastCandlesFetch?: number;
    lastForceFetch?: number;
    lastMarketUpdateAt?: number;
    isFetchingForce?: boolean;
    isFetchingGamma?: boolean;
    isFetchingOptionsMarket?: boolean;
    isFetchingCandles?: boolean;
    isFetchingScreenshot?: boolean;
  }>>({});

  const [panelCacheVersion, setPanelCacheVersion] = useState<number>(0);
  const [visibleMultiPanelIds, setVisibleMultiPanelIdsState] = useState<string[]>([]);
  const visibleMultiPanelIdsRef = useRef<string[]>([]);
  const setVisibleMultiPanelIds = useCallback((ids: string[]) => {
    const normalized = Array.from(new Set(ids.filter(Boolean))).sort();
    visibleMultiPanelIdsRef.current = normalized;
    setVisibleMultiPanelIdsState(prev => {
      if (prev.length === normalized.length && prev.every((v, i) => v === normalized[i])) {
        return prev;
      }
      return normalized;
    });
  }, []);
  const lastPanelCacheBumpRef = useRef<number>(0);
  const pendingPanelCacheTimerRef = useRef<any>(null);
  const bumpPanelCacheVersion = useCallback(() => {
    const now = Date.now();
    if (now - lastPanelCacheBumpRef.current >= 200) {
      lastPanelCacheBumpRef.current = now;
      setPanelCacheVersion(v => (v + 1) % 1000000);
    } else if (!pendingPanelCacheTimerRef.current) {
      pendingPanelCacheTimerRef.current = setTimeout(() => {
        pendingPanelCacheTimerRef.current = null;
        lastPanelCacheBumpRef.current = Date.now();
        setPanelCacheVersion(v => (v + 1) % 1000000);
      }, 200);
    }
  }, []);

  const lastAutoCancelTriggeredRef = useRef<string>('');

  // Mapa de timers para os loops concorrentes de cada painel
  const runningLoops = useRef<Map<string, { marketTimer: any; aiTimer: any; generalPromptTimer: any; opsTimer: any }>>(new Map());
  const realtimeSubscriptions = useRef<Record<string, any>>({});
  const lastRealtimeTickRef = useRef<number>(Date.now());
  const runningMarketCycles = useRef<Set<string>>(new Set());
  // Map<panelId, Set<reportId>> — suporta múltiplas ordens ativas no mesmo painel (uma por conta)
  const activeReportIdsRef = useRef<Map<string, Set<string>>>(new Map());
  const panelAnalyzingRef = useRef<Map<string, boolean>>(new Map());
  const initialLoadedPanelsRef = useRef<Set<string>>(new Set());

  // Dados do Mercado
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [forces, setForces] = useState<{ symbol: string; buy: number; sell: number }[]>([]);
  const [gammaLevels, setGammaLevels] = useState<GammaLevels | null>(null);
  const [optionsMarket, setOptionsMarket] = useState<OptionsMarketData | null>(null);
  const [news, setNews] = useState<EconomicNewsItem[]>([]);
  const newsRef = useRef<EconomicNewsItem[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [isCandlesLoading, setIsCandlesLoading] = useState<boolean>(false);
  const [candlesLoadingProgress, setCandlesLoadingProgress] = useState<{
    isLoading: boolean;
    percent: number;
    loaded: number;
    total: number;
    days: number;
    isExplicitDaysChange?: boolean;
  }>({
    isLoading: true,
    percent: 15,
    loaded: 0,
    total: 4320,
    days: 3,
    isExplicitDaysChange: true
  });
  const [wakeTrigger, setWakeTrigger] = useState<number>(0);
  const [wsHubConnected, setWsHubConnected] = useState<boolean>(false);
  const [ninjaGatewayOnline, setNinjaGatewayOnline] = useState<boolean>(true); // inicia true para não suprimir plots antes da 1ª checagem
  const wsHubSocketRef = useRef<WebSocket | null>(null);

  // Configurações locais de exibição de indicadores do gráfico de candles
  const [showSma9, setShowSma9State] = useState<boolean>(true);
  const [showEma21, setShowEma21State] = useState<boolean>(true);
  const [showEma50, setShowEma50State] = useState<boolean>(false);
  const [showRsi, setShowRsiState] = useState<boolean>(false);
  const [showMacd, setShowMacdState] = useState<boolean>(false);
  const [showPva, setShowPvaState] = useState<boolean>(true);
  const [showEMacd, setShowEMacdState] = useState<boolean>(false);
  const [showFvg, setShowFvgState] = useState<boolean>(true);

  const setShowSma9 = (val: boolean) => {
    setShowSma9State(val);
    saveSettings({ chart_show_sma9: val });
  };
  const setShowEma21 = (val: boolean) => {
    setShowEma21State(val);
    saveSettings({ chart_show_ema21: val });
  };
  const setShowEma50 = (val: boolean) => {
    setShowEma50State(val);
    saveSettings({ chart_show_ema50: val });
  };
  const setShowRsi = (val: boolean) => {
    setShowRsiState(val);
    saveSettings({ chart_show_rsi: val });
  };
  const setShowMacd = (val: boolean) => {
    setShowMacdState(val);
    saveSettings({ chart_show_macd: val });
  };
  const setShowPva = (val: boolean) => {
    setShowPvaState(val);
    saveSettings({ chart_show_pva: val });
  };
  const setShowEMacd = (val: boolean) => {
    setShowEMacdState(val);
    saveSettings({ chart_show_emacd: val });
  };
  const setShowFvg = (val: boolean) => {
    setShowFvgState(val);
    saveSettings({ chart_show_fvg: val });
  };

  const syncStateFromSettings = (settingsObj: any) => {
    if (!settingsObj) return;
    const enabledVal = settingsObj.vortex_ai_enabled === true;
    aiEnabledRef.current = enabledVal;
    setAiEnabledState(enabledVal);
    setShowSma9State(settingsObj.chart_show_sma9 !== false);
    setShowEma21State(settingsObj.chart_show_ema21 !== false);
    setShowEma50State(settingsObj.chart_show_ema50 === true);
    setShowRsiState(settingsObj.chart_show_rsi === true);
    setShowMacdState(settingsObj.chart_show_macd === true);
    setShowPvaState(settingsObj.chart_show_pva !== false);
    setShowEMacdState(settingsObj.chart_show_emacd === true);
    setShowFvgState(settingsObj.chart_show_fvg !== false);
  };

  // IA
  const [aiEnabled, setAiEnabledState] = useState<boolean>(false);
  const aiEnabledRef = useRef<boolean>(false);
  aiEnabledRef.current = aiEnabled;
  useEffect(() => {
    aiEnabledRef.current = aiEnabled;
  }, [aiEnabled]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isCopilotModalOpen, setIsCopilotModalOpen] = useState<boolean>(false);
  const [aiResult, setAiResultState] = useState<AIResponse | null>(null);
  const aiResultRef = useRef<AIResponse | null>(null);
  const setAiResult = (res: AIResponse | null) => {
    aiResultRef.current = res;
    setAiResultState(res);
  };
  const isAnalyzingRef = useRef<boolean>(false);
  // const runManualAIAnalysisRef = useRef<any>(null);

  // Prompts / Estratégias
  const [prompts, setPrompts] = useState<AIPrompt[]>([]);
  const promptsRef = useRef<AIPrompt[]>([]);
  promptsRef.current = prompts;
  useEffect(() => {
    promptsRef.current = prompts;
  }, [prompts]);

  const [isLoadingPrompts, setIsLoadingPrompts] = useState<boolean>(false);

  // Algoritmos Dinâmicos (Cenário A)
  const [customStrategies, setCustomStrategies] = useState<CustomStrategy[]>([]);
  const [publicStrategies, setPublicStrategies] = useState<CustomStrategy[]>([]);
  const [isLoadingStrategies, setIsLoadingStrategies] = useState<boolean>(false);
  const [customSignals, setCustomSignals] = useState<any[]>([]);
  const clearCustomSignals = () => setCustomSignals([]);

  const [pausedStrategyIds, setPausedStrategyIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('vortex_paused_strategies');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const pausedStrategyIdsRef = useRef<string[]>([]);
  useEffect(() => {
    pausedStrategyIdsRef.current = pausedStrategyIds;
  }, [pausedStrategyIds]);

  // Estratégias ATM (Cadastro Centralizado)
  const [atmStrategies, setAtmStrategies] = useState<ATMStrategy[]>(PRESET_ATM_STRATEGIES);
  const atmStrategiesRef = useRef<ATMStrategy[]>(PRESET_ATM_STRATEGIES);
  useEffect(() => {
    atmStrategiesRef.current = atmStrategies;
  }, [atmStrategies]);

  const fetchAtmStrategiesList = async () => {
    try {
      const list = await fetchAtmStrategiesSupabase();
      if (list && list.length > 0) {
        setAtmStrategies(list);
        atmStrategiesRef.current = list;
      }
    } catch (e) {
      console.error('[AppContext] Erro ao carregar cadastro de estratégias ATM:', e);
    }
  };

  const toggleStrategyPause = (id: string) => {
    setPausedStrategyIds(prev => {
      const updated = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      pausedStrategyIdsRef.current = updated;
      localStorage.setItem('vortex_paused_strategies', JSON.stringify(updated));
      return updated;
    });
  };

  // Relatórios de Sinais
  const [reports, setReports] = useState<StrategyReport[]>(() => getLocalStrategyReports());
  const reportsRef = useRef<StrategyReport[]>([]);
  const pendingSignalInsertsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    reportsRef.current = reports;
  }, [reports]);
  const [isLoadingReports, setIsLoadingReports] = useState<boolean>(false);

  // Análises Gerais / Omni-Engine
  const [generalAnalyses, setGeneralAnalyses] = useState<AIGeneralAnalysisRecord[]>([]);
  const [isLoadingGeneralAnalyses, setIsLoadingGeneralAnalyses] = useState<boolean>(false);
  const generalPromptAnalyzingRef = useRef<Map<string, boolean>>(new Map());
  const lastGeneralPromptExecution = useRef<Map<string, number>>(new Map());

  // Controle de Janelas do Delta (Contadores do Delta)
  const [windowMinutes, setWindowMinutes] = useState<number>(Infinity);
  // Baselines de Volume (Compra/Venda Acumulados salvos no baseline)
  const [windowBaseline, setWindowBaseline] = useState<{ buy: number; sell: number; time: number } | null>(null);

  // Configuração das Forças Impulso (Ativo/Inativo clicáveis)
  const [forcesConfig, setForcesConfig] = useState<Array<{ id: string; nome: string; ativo: boolean }>>(DEFAULT_FORCES_CONFIG);

  // Logs
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);

  // Ref de controle dos loops e sincronização de dados (evitar stale closures)
  // const marketLoopRef = useRef<any>(null);
  // const aiLoopRef = useRef<any>(null);
  const sessionCheckRef = useRef<any>(null);
  const windowTimerRef = useRef<any>(null);

  const alertCooldownsRef = useRef<{ [key: string]: number }>({});
  const nivelCooldownsRef = useRef<{ [key: string]: number }>({});
  const lastGammaBiasRef = useRef<Record<string, string>>({});
  const lastEvaluatedClosedCandleRef = useRef<{ [key: string]: string }>({});
  const lastEvaluatedAiClosedCandleRef = useRef<{ [key: string]: string }>({});
  const lastAiExecutionTimeRef = useRef<{ [key: string]: number }>({});
  const strategySequenceStateRef = useRef<{
    [key: string]: {
      currentStageIndex: number;
      lastCompletedCandleTime?: string;
      candlesSinceStageCompletion: number;
      lastCheckedCandleTime?: string;
    };
  }>({});

  const activePanelRef = useRef<any>(null);
  const allPanelsRef = useRef<any[]>([]);
  allPanelsRef.current = panels;
  const allSettingsRef = useRef<Record<string, any>>({});
  const adminSettingsRef = useRef<Record<string, any>>({});
  const appStartupTimestampRef = useRef<number>(Date.now());
  const panelActivationTimestampRef = useRef<Record<string, number>>({});

  useEffect(() => {
    activePanelRef.current = activePanel;
    if (activePanel?.id) {
      panelActivationTimestampRef.current[activePanel.id] = Date.now();
    }
  }, [activePanel]);

  useEffect(() => {
    if (settings) {
      const activeSymbols = settings.forces_active_symbols;
      if (Array.isArray(activeSymbols)) {
        const cleanActiveSymbols = activeSymbols.map(s => s === 'sp505_impulso' ? 'sp500_impulso' : s);
        const next = DEFAULT_FORCES_CONFIG.map(f => ({
          ...f,
          ativo: cleanActiveSymbols.includes(f.id)
        }));
        setForcesConfig(next);
        forcesConfigRef.current = next;
      } else {
        const saved = localStorage.getItem(`vortex_forces_config_${activePanel?.id}`);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            const validated = migrateAndValidateForcesConfig(parsed);
            setForcesConfig(validated);
            forcesConfigRef.current = validated;
          } catch (e) {
            setForcesConfig(DEFAULT_FORCES_CONFIG);
            forcesConfigRef.current = DEFAULT_FORCES_CONFIG;
          }
        } else {
          setForcesConfig(DEFAULT_FORCES_CONFIG);
          forcesConfigRef.current = DEFAULT_FORCES_CONFIG;
        }
      }
    } else if (activePanel) {
      const saved = localStorage.getItem(`vortex_forces_config_${activePanel.id}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const validated = migrateAndValidateForcesConfig(parsed);
          setForcesConfig(validated);
          forcesConfigRef.current = validated;
        } catch (e) {
          console.error('Error parsing forces config', e);
          setForcesConfig(DEFAULT_FORCES_CONFIG);
          forcesConfigRef.current = DEFAULT_FORCES_CONFIG;
        }
      } else {
        setForcesConfig(DEFAULT_FORCES_CONFIG);
        forcesConfigRef.current = DEFAULT_FORCES_CONFIG;
      }
    }
  }, [settings, activePanel]);

  useEffect(() => {
    allSettingsRef.current = allSettings;
  }, [allSettings]);
  const logicAlertCooldownRef = useRef<number>(0);
  const newsCooldownsRef = useRef<{ [key: string]: number }>({});
  const newsAlertedRef = useRef<{ [key: string]: { before: boolean; after: boolean } }>({});

  const [activeAlert, setActiveAlert] = useState<{ title: string; message: string; detail: string; tipo: string; panelId?: string; panelName?: string } | null>(null);

  const disarmAlert = () => {
    if (!activeAlert) return;
    const { tipo, strategyId } = activeAlert as any;
    const now = Date.now();
    if (strategyId || (tipo && tipo.startsWith('strat_'))) {
      const key = strategyId ? `strat_${strategyId}` : tipo;
      alertCooldownsRef.current[key] = now;
      addLog('SISTEMA', '🔓 Alerta de Robô/Estratégia desarmado.', 'sistema');
    } else if (tipo === 'nivel') {
      nivelCooldownsRef.current['all'] = now;
      addLog('SISTEMA', '🔓 Alerta de Níveis desarmado.', 'sistema');
    } else if (tipo === 'logica') {
      logicAlertCooldownRef.current = now;
      addLog('SISTEMA', '🔓 Alerta Lógico desarmado.', 'sistema');
    } else {
      alertCooldownsRef.current[tipo] = now;
      const nomes: { [key: string]: string } = { sentimento: 'Sentimento', blocktrades: 'Block Trade', delta: 'Delta', acelerometro: 'Acelerômetro', noticia: 'Notícia', assinatura: 'Assinatura' };
      addLog('SISTEMA', `🔓 Alerta de ${nomes[tipo] || tipo} desarmado.`, 'sistema');
    }
    setActiveAlert(null);
  };

  useEffect(() => {
    if (activeAlert) {
      LocalNotifications.checkPermissions().then(perm => {
        if (perm.display !== 'granted') {
          LocalNotifications.requestPermissions();
        }
        LocalNotifications.schedule({
          notifications: [
            {
              title: `🚨 ${activeAlert.title}`,
              body: `${activeAlert.message}${activeAlert.detail ? ' - ' + activeAlert.detail : ''}`,
              id: Math.floor((Date.now() + Math.random() * 1000) % 1000000),
              schedule: { at: new Date(Date.now() + 50) }
            }
          ]
        }).catch(err => console.warn('LocalNotification fail', err));
      }).catch(err => console.warn('LocalNotification perm fail', err));

      const timer = setTimeout(() => {
        setActiveAlert(null);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [activeAlert]);

  // const lastGammaSymbolRef = useRef<string>('');
  // const lastGammaFetchTimeRef = useRef<number>(0);

  const marketDataRef = useRef<MarketData | null>(null);
  // const blockTradesHistoryRef = useRef<BlockTrade[]>([]);
  const forcesRef = useRef<{ symbol: string; buy: number; sell: number }[]>([]);
  const forcesConfigRef = useRef(forcesConfig);
  const windowMinutesRef = useRef(windowMinutes);
  const windowBaselineRef = useRef(windowBaseline);
  const customStrategiesRef = useRef<CustomStrategy[]>([]);
  const rpcMarketIntervalFailedRef = useRef<boolean>(false);
  const publicStrategiesRef = useRef<CustomStrategy[]>([]);
  useEffect(() => {
    customStrategiesRef.current = customStrategies;
  }, [customStrategies]);

  useEffect(() => {
    publicStrategiesRef.current = publicStrategies;
  }, [publicStrategies]);

  useEffect(() => {
    marketDataRef.current = marketData;
  }, [marketData]);

  useEffect(() => {
    forcesRef.current = forces;
  }, [forces]);

  useEffect(() => {
    forcesConfigRef.current = forcesConfig;
  }, [forcesConfig]);

  useEffect(() => {
    windowMinutesRef.current = windowMinutes;
  }, [windowMinutes]);

  useEffect(() => {
    windowBaselineRef.current = windowBaseline;
  }, [windowBaseline]);

  // Helper para recalcular Sentimento e Delta instantaneamente no client
  const recalculateSentimentAndDelta = (
    baseMarketData: MarketData,
    currentForces: { symbol: string; buy: number; sell: number }[],
    currentForcesConfig: Array<{ id: string; nome: string; ativo: boolean }>,
    currentWindowMinutes: number,
    currentWindowBaseline: { buy: number; sell: number; time: number } | null
  ): MarketData => {
    const pesos = { nasdaq: 0.35, sp500: 0.15, vix: 0.10, fxFlow: 0.10, acoes: 0.20, zscore: 0.10 };
    const pesosAcoes: { [key: string]: number } = { nvidia: 0.25, tesla: 0.15, meta: 0.15, apple: 0.15, amazon: 0.10, alphabet: 0.10, microsoft: 0.10 };

    let sentimentoBruto = 0;
    let totalPesosAtivos = 0;

    const getCompraForca = (symbolName: string): number | null => {
      const item = currentForces.find(f => f.symbol.toLowerCase() === symbolName.toLowerCase());
      return item ? item.buy : null;
    };

    const checkAndAdd = (cfgId: string, forceSymbol: string, pesoValue: number, invert = false) => {
      const cfg = currentForcesConfig.find(f => f.id === cfgId);
      const buyVal = getCompraForca(forceSymbol);
      if (cfg?.ativo && buyVal !== null) {
        sentimentoBruto += (invert ? (100 - buyVal) : buyVal) * pesoValue;
        totalPesosAtivos += pesoValue;
      }
    };

    checkAndAdd('nasdaq_impulso', 'NASDAQ', pesos.nasdaq);
    checkAndAdd('sp500_impulso', 'S&P 500', pesos.sp500);
    checkAndAdd('vix_impulso', 'VIX', pesos.vix, true);

    // Cesta Sintética de Fluxo de Capitais (IndexMoneyFlow - IMF) com ativação/desativação dinâmica
    const fxFlowBuy = getCompraForca('IMF') ?? getCompraForca('FLUXO DE CAPITAIS');
    const cfgImf = currentForcesConfig.find(f => f.id === 'imf_impulso');
    if (fxFlowBuy !== null) {
      if (cfgImf ? cfgImf.ativo : true) {
        sentimentoBruto += fxFlowBuy * pesos.fxFlow;
        totalPesosAtivos += pesos.fxFlow;
      }
    } else {
      checkAndAdd('usdindex_impulso', 'USD Index', pesos.fxFlow, true);
    }

    for (const [key, weight] of Object.entries(pesosAcoes)) {
      const cfgId = `${key}_impulso`;
      const buyVal = getCompraForca(key);
      const cfg = currentForcesConfig.find(f => f.id === cfgId);
      if (cfg?.ativo && buyVal !== null) {
        sentimentoBruto += buyVal * weight * pesos.acoes;
        totalPesosAtivos += weight * pesos.acoes;
      }
    }

    const z = 50 + (baseMarketData.zScore / 3) * 50;
    sentimentoBruto += Math.max(0, Math.min(100, z)) * pesos.zscore;
    totalPesosAtivos += pesos.zscore;

    const finalSentiment = totalPesosAtivos > 0
      ? Math.round(Math.max(0, Math.min(100, sentimentoBruto / totalPesosAtivos)))
      : (baseMarketData.originalSentiment !== undefined ? baseMarketData.originalSentiment : baseMarketData.sentiment);

    // Sentimento MERCADO: mesmo cálculo como se todas as forças (NASDAQ, SP500, VIX, USDINDEX, Ações) estivessem desligadas
    const finalMarketSentiment = Math.round(Math.max(0, Math.min(100, z)));

    // Lógica Delta / Acumulação
    let displayBuy = baseMarketData.buyVolume;
    let displaySell = baseMarketData.sellVolume;

    if (currentWindowBaseline && currentWindowMinutes < Infinity) {
      displayBuy = Math.max(0, baseMarketData.buyVolume - currentWindowBaseline.buy);
      displaySell = Math.max(0, baseMarketData.sellVolume - currentWindowBaseline.sell);
    }

    const finalDelta = displayBuy - displaySell;
    const finalTotalVol = displayBuy + displaySell;
    const finalDeltaPct = finalTotalVol > 0 
      ? Math.round((displayBuy / finalTotalVol) * 100) 
      : 50;
    const finalRatio = displaySell > 0 
      ? (displayBuy / displaySell) 
      : (displayBuy > 0 ? Math.min(99.99, displayBuy) : 1.0);

    return {
      ...baseMarketData,
      sentiment: finalSentiment,
      marketSentiment: finalMarketSentiment,
      delta: finalDelta,
      deltaRatio: finalRatio,
      deltaPct: finalDeltaPct,
      delta_pct: finalDeltaPct
    };
  };

  // Trata alteração e temporizadores de janelas Delta
  const changeWindowMinutes = (minutes: number) => {
    if (windowTimerRef.current) {
      clearTimeout(windowTimerRef.current);
      windowTimerRef.current = null;
    }

    if (minutes === Infinity) {
      setWindowMinutes(Infinity);
      setWindowBaseline(null);
      addLog('SISTEMA', 'Janela de Delta alterada para Acumulado.', 'sistema');

      if (marketDataRef.current) {
        const recalculated = recalculateSentimentAndDelta(
          marketDataRef.current,
          forcesRef.current,
          forcesConfigRef.current,
          Infinity,
          null
        );
        setMarketData(recalculated);
      }
    } else {
      setWindowMinutes(minutes);
      const currentBuy = marketDataRef.current ? marketDataRef.current.buyVolume : 0;
      const currentSell = marketDataRef.current ? marketDataRef.current.sellVolume : 0;
      const newBaseline = { buy: currentBuy, sell: currentSell, time: Date.now() };
      setWindowBaseline(newBaseline);
      addLog('SISTEMA', `Janela de Delta alterada para ${minutes}m.`, 'sistema');

      if (marketDataRef.current) {
        const recalculated = recalculateSentimentAndDelta(
          marketDataRef.current,
          forcesRef.current,
          forcesConfigRef.current,
          minutes,
          newBaseline
        );
        setMarketData(recalculated);
      }

      const setupTimer = (mins: number) => {
        windowTimerRef.current = setTimeout(() => {
          const latestBuy = marketDataRef.current ? marketDataRef.current.buyVolume : 0;
          const latestSell = marketDataRef.current ? marketDataRef.current.sellVolume : 0;
          const resettedBaseline = { buy: latestBuy, sell: latestSell, time: Date.now() };
          setWindowBaseline(resettedBaseline);
          addLog('SISTEMA', `Janela de Delta de ${mins}m resetada.`, 'sistema');

          if (marketDataRef.current) {
            const recalculated = recalculateSentimentAndDelta(
              marketDataRef.current,
              forcesRef.current,
              forcesConfigRef.current,
              mins,
              resettedBaseline
            );
            setMarketData(recalculated);
          }
          setupTimer(mins);
        }, mins * 60 * 1000);
      };

      setupTimer(minutes);
    }
  };

  const addLog = (prefix: string, content: string, type: SystemLog['type']) => {
    const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
    if (type === 'sistema' && !isSystemAdmin) {
      return;
    }
    const newLog: SystemLog = {
      id: Math.random().toString(36).substring(2) + Date.now().toString(36),
      time: new Date().toLocaleTimeString(),
      prefix,
      content,
      type
    };
    setSystemLogs(prev => [newLog, ...prev].slice(0, 25)); // Limite de 25 logs para evitar acúmulo de memória
  };

  const clearLogs = () => setSystemLogs([]);

  // 1. Carregar usuário e configurações ao iniciar
  useEffect(() => {
    async function loadSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
          const isSystemAdmin = session.user.email?.toLowerCase() === 'admin@vortex.com';
          if (isSystemAdmin) {
            localStorage.setItem('vortex_subscription_id', 'admin');
          }
          const storedSessionId = localStorage.getItem('vortex_session_id');
          const storedSubscriptionId = isSystemAdmin ? 'admin' : localStorage.getItem('vortex_subscription_id');
          const storedIsRestricted = localStorage.getItem('vortex_is_restricted') === 'true';
          if (storedSessionId) {
            // Verificar se ainda é a sessão ativa no banco
            const activeData = await checkActiveSessionAndHeartbeat(session.user.id, storedSessionId, storedSubscriptionId, storedIsRestricted, session.user.email);
            if (activeData.active) {
              setUser(session.user);
              setSessionId(storedSessionId);
              setIsRestrictedSession(activeData.role === 'restricted');
              setIsAuthenticated(true);
              addLog('SISTEMA', `Sessão ${activeData.role === 'restricted' ? 'RESTRITA' : 'ADMIN'} restabelecida para ${session.user.email}`, 'sistema');
              await loadUserSettings(session.user.id, storedSubscriptionId);
            } else {
              localStorage.removeItem('vortex_session_id');
              localStorage.removeItem('vortex_subscription_id');
              localStorage.removeItem('vortex_is_restricted');
              await supabase.auth.signOut();
              if (activeData.blocked) {
                alert('Acesso negado: Seu IP foi bloqueado pelo administrador.');
                addLog('ALERTA', 'Acesso negado: Seu IP foi bloqueado pelo administrador.', 'alerta');
              } else {
                addLog('ALERTA', 'Sessão anterior invalidada (Login realizado em outro local).', 'alerta');
              }
            }
          } else {
            // Se tem token no Supabase Auth mas não tem vortex_session_id no localStorage, efetua signOut no Supabase Auth
            await supabase.auth.signOut();
          }
        }
      } catch (err) {
        console.error('[CONTEXT] Erro ao carregar sessão:', err);
      } finally {
        setIsCheckingAuth(false);
      }
    }

    loadSession();

    // Listener de Auth do Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, _session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setPanel(null);
        setSettings(null);
        setSessionId(null);
        setIsAuthenticated(false);
        setMarketData(null);
        setForces([]);
        setGammaLevels(null);
        setOptionsMarket(null);
        setScreenshot(null);
        setAiEnabledState(false);
        setAiResult(null);
        setPrompts([]);
        setAccounts([]);
        setActiveAccount(null);
        setAccountStrategies([]);
        setCopyConfigs([]);
        setReports([]);
        reportsRef.current = [];
        addLog('SISTEMA', 'Usuário desconectado.', 'sistema');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const getAdminSetForPanel = (targetPanel: any) => {
    if (!targetPanel) return null;
    const nameKey = targetPanel.name?.toLowerCase();
    const instanceKey = targetPanel.instance_id?.toLowerCase();
    if (nameKey && adminSettingsRef.current[nameKey]) {
      return adminSettingsRef.current[nameKey];
    }
    if (instanceKey && adminSettingsRef.current[instanceKey]) {
      return adminSettingsRef.current[instanceKey];
    }
    for (const k of Object.keys(adminSettingsRef.current)) {
      if (nameKey && (nameKey.includes(k) || k.includes(nameKey))) {
        return adminSettingsRef.current[k];
      }
      if (instanceKey && (instanceKey.includes(k) || k.includes(instanceKey))) {
        return adminSettingsRef.current[k];
      }
    }
    return null;
  };

  const refreshAdminSettings = async () => {
    const sessionUser = user || (await supabase.auth.getSession()).data.session?.user;
    const isSystemAdmin = sessionUser?.email?.toLowerCase() === 'admin@vortex.com';
    if (isSystemAdmin) {
      adminSettingsRef.current = {};
      return false;
    }
    try {
      const { data: adminPanels } = await supabase
        .from('painelvm_panels')
        .select('id, name, instance_id')
        .eq('subscription_id', 'admin');
      
      if (adminPanels && adminPanels.length > 0) {
        const adminPanelIds = adminPanels.map(ap => ap.id);
        const { data: adminSettingsData } = await supabase
          .from('painelvm_settings')
          .select('*')
          .in('panel_id', adminPanelIds);
        
        if (adminSettingsData) {
          const mapped: Record<string, any> = {};
          adminPanels.forEach(ap => {
            const s = adminSettingsData.find(sett => sett.panel_id === ap.id);
            if (s) {
              const enriched = enrichSettingsWithVirtualConfigs(s);
              if (ap.name) mapped[ap.name.toLowerCase()] = enriched;
              if (ap.instance_id) mapped[ap.instance_id.toLowerCase()] = enriched;
            }
          });

          // Comparar se houve qualquer alteração relevante
          let hasChanged = false;
          const oldKeys = Object.keys(adminSettingsRef.current);
          const newKeys = Object.keys(mapped);
          if (oldKeys.length !== newKeys.length) {
            hasChanged = true;
          } else {
            for (const key of newKeys) {
              const oldVal = adminSettingsRef.current[key];
              const newVal = mapped[key];
              if (!oldVal || 
                  oldVal.candles_update_interval !== newVal.candles_update_interval ||
                  oldVal.market_update_interval !== newVal.market_update_interval ||
                  oldVal.force_update_interval !== newVal.force_update_interval ||
                  oldVal.screenshot_update_interval !== newVal.screenshot_update_interval ||
                  oldVal.instance_id_screen !== newVal.instance_id_screen ||
                  oldVal.instance_id_market !== newVal.instance_id_market ||
                  oldVal.instance_id_force !== newVal.instance_id_force
              ) {
                hasChanged = true;
                break;
              }
            }
          }

          adminSettingsRef.current = mapped;
          return hasChanged;
        }
      }
    } catch (err) {
      console.warn('[CONTEXT] Erro ao atualizar configurações do admin:', err);
    }
    return false;
  };

  // 2. Carregar painel e configurações
  async function loadUserSettings(userId: string, subscriptionId: string | null, options?: { skipAuxiliary?: boolean }) {
    try {
      const sessionUser = user || (await supabase.auth.getSession()).data.session?.user;
      const userEmail = sessionUser?.email || '';
      const isSystemAdmin = userEmail.toLowerCase() === 'admin@vortex.com';
      const actualSubId = isSystemAdmin ? 'admin' : subscriptionId;

      // Buscar permissões da sessão do usuário
      let sessionQuery = supabase
        .from('painelvm_users_sessions')
        .select('allow_telegram_news, allow_alerts, allow_operations, allow_share_strategies, allow_simulator, allow_panel_mode_2, allow_copy_trading, max_strategies, max_accounts');

      if (actualSubId) {
        sessionQuery = sessionQuery.eq('subscription_id', actualSubId);
      } else {
        sessionQuery = sessionQuery.eq('user_id', userId);
      }
      let { data: sessionData } = await sessionQuery.maybeSingle();

      const rawPlan = localStorage.getItem('vortex_plan_details');
      const currentPlanDetails: SubscriptionPlanDetails | null = rawPlan ? JSON.parse(rawPlan) : planDetails;
      if (currentPlanDetails) {
        setPlanDetails(currentPlanDetails);
      }

      if (isSystemAdmin) {
        setUserPermissions({
          allow_telegram_news: true,
          allow_alerts: true,
          allow_operations: true,
          allow_share_strategies: true,
          allow_simulator: true,
          allow_panel_mode_2: true,
          allow_copy_trading: true,
          max_strategies: 999,
          max_accounts: 999
        });
      } else if (currentPlanDetails?.isCopyTraderOnly) {
        setUserPermissions({
          allow_telegram_news: false,
          allow_alerts: false,
          allow_operations: false,
          allow_share_strategies: false,
          allow_simulator: false,
          allow_panel_mode_2: false,
          allow_copy_trading: true,
          max_strategies: 0,
          max_accounts: currentPlanDetails.hasExtraCapacity ? 20 : 10
        });
      } else if (currentPlanDetails?.isModularProduct) {
        setUserPermissions({
          allow_telegram_news: sessionData?.allow_telegram_news !== false,
          allow_alerts: true,
          allow_operations: currentPlanDetails.hasAlgorithmCreator,
          allow_share_strategies: currentPlanDetails.hasAlgorithmCreator,
          allow_simulator: currentPlanDetails.hasAlgorithmCreator,
          allow_panel_mode_2: sessionData?.allow_panel_mode_2 !== false,
          allow_copy_trading: currentPlanDetails.hasCopyNT8,
          max_strategies: currentPlanDetails.hasAlgorithmCreator ? (sessionData?.max_strategies ?? 5) : 0,
          max_accounts: currentPlanDetails.hasExtraCapacity ? 20 : 10
        });
      } else {
        if (sessionData) {
          setUserPermissions({
            allow_telegram_news: sessionData.allow_telegram_news !== false,
            allow_alerts: sessionData.allow_alerts !== false,
            allow_operations: sessionData.allow_operations !== false,
            allow_share_strategies: sessionData.allow_share_strategies === true,
            allow_simulator: sessionData.allow_simulator === true,
            allow_panel_mode_2: sessionData.allow_panel_mode_2 !== false,
            allow_copy_trading: sessionData.allow_copy_trading !== false,
            max_strategies: sessionData.max_strategies ?? 2,
            max_accounts: sessionData.max_accounts ?? 5
          });
        } else {
          setUserPermissions({
            allow_telegram_news: true,
            allow_alerts: true,
            allow_operations: true,
            allow_share_strategies: false,
            allow_simulator: false,
            allow_panel_mode_2: true,
            allow_copy_trading: true,
            max_strategies: 2,
            max_accounts: 5
          });
        }

        // Fetch global market interval from admin settings safely
        if (!rpcMarketIntervalFailedRef.current) {
          try {
            const { data: globalIntervalData, error: rpcError } = await supabase.rpc('get_admin_market_interval');
            if (rpcError) {
              if (rpcError.message?.includes('schema cache') || (rpcError as any).status === 404 || rpcError.code === 'PGRST202') {
                rpcMarketIntervalFailedRef.current = true;
              }
            } else if (globalIntervalData !== undefined && globalIntervalData !== null) {
              setGlobalMarketInterval(Number(globalIntervalData));
            }
          } catch (err) {
            console.warn('[CONTEXT] Erro ao buscar intervalo global de mercado do admin:', err);
          }
        }
      }

      // Buscar painel
      let query = supabase
        .from('painelvm_panels')
        .select('*');

      if (actualSubId && actualSubId !== 'admin') {
        query = query.eq('subscription_id', actualSubId);
      } else if (actualSubId === 'admin') {
        query = query.eq('subscription_id', 'admin');
      } else {
        query = query.eq('user_id', userId);
      }

      let { data: panelsData, error: panelsError } = await withDbTimeout(query, 5000);
      if (panelsError) throw panelsError;

      // Se não for admin e não tiver nenhum painel para esta assinatura, criar painel padrão
      if (!isSystemAdmin && (!panelsData || panelsData.length === 0)) {
        const defaultInstanceId = 'painel_principal';
        const defaultName = 'Painel Principal';
        const { data: newPanel } = await supabase
          .from('painelvm_panels')
          .insert({
            user_id: userId,
            subscription_id: actualSubId || 'default',
            instance_id: defaultInstanceId,
            name: defaultName,
            point_value: 2.0
          })
          .select()
          .maybeSingle();

        if (newPanel) {
          await supabase.from('painelvm_settings').insert({
            panel_id: newPanel.id,
            instance_id_market: defaultInstanceId,
            instance_id_force: defaultInstanceId,
            instance_id_screen: defaultInstanceId,
            gamma_symbol: 'NQ',
            source_market: 'supabase',
            source_screen: 'supabase'
          });
          panelsData = [newPanel];
        }
      }

      // Se for Admin e não tiver nenhum painel, criar os painéis de template padrão
      if (isSystemAdmin && (!panelsData || panelsData.length === 0)) {
        const defaultPanels = [
          { user_id: userId, subscription_id: 'admin', instance_id: 'nasdaq', name: 'NASDAQ', point_value: 1.0 },
          { user_id: userId, subscription_id: 'admin', instance_id: 'sp500', name: 'S&P 500', point_value: 1.0 },
          { user_id: userId, subscription_id: 'admin', instance_id: 'gold', name: 'GOLD', point_value: 1.0 }
        ];

        const { data: createdPanels, error: createError } = await supabase
          .from('painelvm_panels')
          .insert(defaultPanels)
          .select();

        if (createError) throw createError;
        panelsData = createdPanels;

        // Criar as configurações padrão para cada um deles
        const defaultSettings = (createdPanels || []).map(p => {
          let gammaSymbol = 'NQ';
          if (p.instance_id === 'sp500') gammaSymbol = 'ES';
          if (p.instance_id === 'gold') gammaSymbol = 'GC';

          return {
            panel_id: p.id,
            ai_provider: 'groq',
            groq_model: 'qwen/qwen3.8-27b',
            intervalo: 30000,
            enviar_imagem_ia: true,
            gamma_symbol: gammaSymbol,
            instance_id_market: p.instance_id,
            instance_id_force: p.instance_id,
            instance_id_screen: p.instance_id,
            source_market: 'supabase',
            source_screen: 'supabase',
            card_order_desktop: 'preco_sentimento,forca,mapa,ia_delta,grafico,blocktrades,mensagens',
            card_order_mobile: 'preco_sentimento,forca,mapa,ia_delta,grafico,blocktrades,mensagens',
            disabled_levels: [
              'cfg:vortex_ai_enabled:false',
              'cfg:general_prompt_days:all',
              'cfg:chart_show_sma9:true',
              'cfg:chart_show_ema21:true',
              'cfg:chart_show_ema50:false',
              'cfg:chart_show_rsi:false',
              'cfg:chart_show_macd:false',
              'cfg:chart_show_pva:true',
              'cfg:chart_show_emacd:false',
              'cfg:log_show_sistema:true',
              'cfg:log_show_alerta:true',
              'cfg:log_show_ia:true',
              'cfg:log_show_erro:true',
              'cfg:log_show_noticia:true',
              'cfg:market_update_interval:500',
              'cfg:general_prompt_master_enabled:false',
              'cfg:chart_candle_bar_count:60',
              'cfg:chart_manual_trade_mode:nivel',
              'cfg:chart_manual_sl_points:50',
              'cfg:chart_manual_tp_points:50',
              'cfg:chart_show_levels:true',
              'cfg:chart_confirm_manual_trade:true',
              'cfg:chart_manual_ia_validate:false',
              'cfg:alert_force_ativo:false',
              'cfg:alert_force_buy_min:-2.0',
              'cfg:alert_force_sell_max:2.0',
              'cfg:alert_force_cooldown:10',
              'cfg:alert_force_telegram:false',
              'cfg:alert_force_vies_shift:false',
              'cfg:alert_pva_ativo:false',
              'cfg:alert_pva_cooldown:5',
              'cfg:alert_pva_telegram:false',
              'cfg:general_prompt_enabled:false',
              'cfg:general_prompt_frequency:15',
              'cfg:general_prompt_start_time:09:00',
              'cfg:general_prompt_end_time:18:00',
              `cfg:general_prompt_template:${DEFAULT_GENERAL_PROMPT_TEMPLATE}`,
              'cfg:general_prompt_telegram_send_image:true',
              'cfg:general_prompt_telegram_enabled:true',
              'cfg:news_background_enabled:false'
            ]
          };
        });

        const { error: createSetError } = await supabase
          .from('painelvm_settings')
          .insert(defaultSettings);

        if (createSetError) throw createSetError;
      }

      // Se NÃO for Admin, sincronizar os painéis do usuário com os painéis cadastrados pelo Admin
      if (!isSystemAdmin) {
        // Buscar painéis cadastrados pelo Admin
        const { data: adminPanels, error: adminPanelsErr } = await supabase
          .from('painelvm_panels')
          .select('*')
          .eq('subscription_id', 'admin');

        if (!adminPanelsErr && adminPanels && adminPanels.length > 0) {
          let updatedPanelsList = [...(panelsData || [])];
          let didCreateAny = false;
          let didDeleteAny = false;
          let didUpdateAny = false;

          for (const adminPanel of adminPanels) {
            // A numeracao/instance do painel replica o ID do admin diretamente
            const expectedInstanceId = adminPanel.instance_id;
            
            // Buscar configurações do painel do admin
            const { data: adminSettings } = await supabase
              .from('painelvm_settings')
              .select('*')
              .eq('panel_id', adminPanel.id)
              .maybeSingle();

            // Verificar se o usuário já tem esse painel clonado
            const existingPanelIndex = updatedPanelsList.findIndex(p => p.instance_id === expectedInstanceId);
            
            if (existingPanelIndex === -1) {
              const { data: newPanel, error: createErr } = await supabase
                .from('painelvm_panels')
                .insert({
                  user_id: userId,
                  subscription_id: actualSubId,
                  instance_id: expectedInstanceId,
                  name: adminPanel.name,
                  point_value: adminPanel.point_value
                })
                .select()
                .single();

              if (!createErr && newPanel) {
                didCreateAny = true;
                updatedPanelsList.push(newPanel);

                const enrichedAdmin = adminSettings ? enrichSettingsWithVirtualConfigs(adminSettings) : null;

                const newSettingsPayload = {
                  panel_id: newPanel.id,
                  ai_provider: 'groq',
                  groq_model: 'qwen/qwen3.8-27b',
                  intervalo: adminSettings?.intervalo || 30000,
                  enviar_imagem_ia: true,
                  ai_trigger_mode: 'tempo',
                  gamma_symbol: adminSettings?.gamma_symbol || 'NQ',
                  instance_id_market: adminSettings?.instance_id_market || expectedInstanceId,
                  instance_id_force: adminSettings?.instance_id_force || expectedInstanceId,
                  instance_id_screen: adminSettings?.instance_id_screen || expectedInstanceId,
                  source_market: adminSettings?.source_market || 'supabase',
                  source_screen: adminSettings?.source_screen || 'supabase',
                  transmission_mode: enrichedAdmin?.transmission_mode || 'supabase',
                  websocket_hub_url: enrichedAdmin?.websocket_hub_url || 'ws://127.0.0.1:8080/ws',
                  card_order_desktop: adminSettings?.card_order_desktop || 'preco_sentimento,forca,mapa,ia_delta,grafico,blocktrades,mensagens',
                  card_order_mobile: adminSettings?.card_order_mobile || 'preco_sentimento,forca,mapa,ia_delta,grafico,blocktrades,mensagens',
                  telegram_enabled: false,
                  telegram_bot_token: '',
                  telegram_chat_id: '',
                  telegram_send_image: true,
                  telegram_send_signal: true,
                  telegram_only_signals: false,
                  news_alert_before: 10,
                  news_alert_after: 10,
                  news_cooldown: 30,
                  news_telegram: false,
                  news_sound: false,
                  news_countries: ['USD', 'EUR', 'GBP', 'JPY'],
                  news_impact_high: true,
                  news_impact_medium: false,
                  news_impact_low: false,
                  disabled_levels: [
                    'cfg:vortex_ai_enabled:false',
                    'cfg:general_prompt_days:all',
                    'cfg:chart_show_sma9:true',
                    'cfg:chart_show_ema21:true',
                    'cfg:chart_show_ema50:false',
                    'cfg:chart_show_rsi:false',
                    'cfg:chart_show_macd:false',
                    'cfg:chart_show_pva:true',
                    'cfg:chart_show_emacd:false',
                    'cfg:log_show_sistema:true',
                    'cfg:log_show_alerta:true',
                    'cfg:log_show_ia:true',
                    'cfg:log_show_erro:true',
                    'cfg:log_show_noticia:true',
                    'cfg:market_update_interval:500',
                    'cfg:general_prompt_master_enabled:false',
                    'cfg:chart_candle_bar_count:60',
                    'cfg:chart_manual_trade_mode:nivel',
                    `cfg:chart_manual_sl_points:${newPanel?.default_sl_points || (typeof window !== 'undefined' ? localStorage.getItem(`vortex_panel_default_sl_${newPanel.id}`) : null) || 50}`,
                    `cfg:chart_manual_tp_points:${newPanel?.default_tp_points || (typeof window !== 'undefined' ? localStorage.getItem(`vortex_panel_default_tp_${newPanel.id}`) : null) || 50}`,
                    'cfg:chart_show_levels:true',
                    'cfg:chart_confirm_manual_trade:true',
                    'cfg:chart_manual_ia_validate:false',
                    'cfg:alert_force_ativo:false',
                    'cfg:alert_force_buy_min:-2.0',
                    'cfg:alert_force_sell_max:2.0',
                    'cfg:alert_force_cooldown:10',
                    'cfg:alert_force_telegram:false',
                    'cfg:alert_force_vies_shift:false',
                    'cfg:alert_pva_ativo:false',
                    'cfg:alert_pva_cooldown:5',
                    'cfg:alert_pva_telegram:false',
                    'cfg:alert_sent_ativo:false',
                    'cfg:alert_sent_micro_ativo:false',
                    'cfg:alert_bt_ativo:false',
                    'cfg:alert_delta_ativo:false',
                    'cfg:alert_acel_ativo:false',
                    'cfg:alert_acel_explosao:false',
                    'cfg:alert_acel_exaustao:false',
                    'cfg:alert_acel_compressao:false',
                    'cfg:alert_nivel_ativo:false',
                    'cfg:general_prompt_enabled:false',
                    'cfg:general_prompt_frequency:15',
                    'cfg:general_prompt_start_time:09:00',
                    'cfg:general_prompt_end_time:18:00',
                    `cfg:general_prompt_template:${DEFAULT_GENERAL_PROMPT_TEMPLATE}`,
                    'cfg:general_prompt_telegram_send_image:true',
                    'cfg:general_prompt_telegram_enabled:true',
                    'cfg:news_background_enabled:false',
                    'cfg:selected_prompt_id:'
                  ]
                };

                // Remover colunas que não existem no banco de dados para evitar erros de insert
                const cleanPayload = { ...newSettingsPayload } as any;
                const keysToDelete = [
                  'vortex_ai_enabled',
                  'general_prompt_days',
                  'chart_show_sma9',
                  'chart_show_ema21',
                  'chart_show_ema50',
                  'chart_show_rsi',
                  'chart_show_macd',
                  'chart_show_emacd',
                  'log_show_sistema',
                  'log_show_alerta',
                  'log_show_ia',
                  'log_show_erro',
                  'log_show_noticia',
                  'market_update_interval',
                  'general_prompt_master_enabled',
                  'chart_candle_bar_count',
                  'chart_manual_trade_mode',
                  'chart_manual_sl_points',
                  'chart_manual_tp_points',
                  'chart_show_levels',
                  'chart_confirm_manual_trade',
                  'chart_manual_ia_validate',
                  'alert_force_ativo',
                  'alert_force_buy_min',
                  'alert_force_sell_max',
                  'alert_force_cooldown',
                  'alert_force_telegram',
                  'alert_force_vies_shift',
                  'general_prompt_enabled',
                  'general_prompt_frequency',
                  'general_prompt_start_time',
                  'general_prompt_end_time',
                  'general_prompt_template',
                  'general_prompt_telegram_send_image',
                  'general_prompt_telegram_enabled',
                  'selected_prompt_id'
                ];
                keysToDelete.forEach(k => delete cleanPayload[k]);

                await supabase.from('painelvm_settings').insert([cleanPayload]);
              }
            } else {
              // Painel já existe. Sincronizar propriedades do admin
              const existingPanel = updatedPanelsList[existingPanelIndex];

              if (existingPanel.name !== adminPanel.name || Number(existingPanel.point_value) !== Number(adminPanel.point_value)) {
                existingPanel.name = adminPanel.name;
                existingPanel.point_value = adminPanel.point_value;
                didUpdateAny = true;
                
                await supabase
                  .from('painelvm_panels')
                  .update({ name: adminPanel.name, point_value: adminPanel.point_value })
                  .eq('id', existingPanel.id);
              }

              // Sincronizar fontes de dados, símbolos e modo de transmissão das configurações do admin
              if (adminSettings) {
                const { data: userSettings } = await supabase
                  .from('painelvm_settings')
                  .select('*')
                  .eq('panel_id', existingPanel.id)
                  .maybeSingle();

                if (userSettings) {
                  const enrichedAdmin = enrichSettingsWithVirtualConfigs(adminSettings);
                  const enrichedUser = enrichSettingsWithVirtualConfigs(userSettings);

                  const needsSettingsSync =
                    userSettings.source_market !== adminSettings.source_market ||
                    userSettings.source_screen !== adminSettings.source_screen ||
                    userSettings.gamma_symbol !== adminSettings.gamma_symbol ||
                    userSettings.instance_id_market !== adminSettings.instance_id_market ||
                    userSettings.instance_id_force !== adminSettings.instance_id_force ||
                    userSettings.instance_id_screen !== adminSettings.instance_id_screen ||
                    enrichedUser.transmission_mode !== enrichedAdmin.transmission_mode ||
                    enrichedUser.websocket_hub_url !== enrichedAdmin.websocket_hub_url;

                  if (needsSettingsSync) {
                    didUpdateAny = true;

                    // Atualizar virtual configs em disabled_levels se necessário
                    let newDisabledLevels = [...(userSettings.disabled_levels || [])];
                    if (enrichedAdmin.transmission_mode) {
                      newDisabledLevels = newDisabledLevels.filter(x => !x.startsWith('cfg:transmission_mode:'));
                      newDisabledLevels.push(`cfg:transmission_mode:${enrichedAdmin.transmission_mode}`);
                    }
                    if (enrichedAdmin.websocket_hub_url) {
                      newDisabledLevels = newDisabledLevels.filter(x => !x.startsWith('cfg:websocket_hub_url:'));
                      newDisabledLevels.push(`cfg:websocket_hub_url:${enrichedAdmin.websocket_hub_url}`);
                    }

                    await supabase
                      .from('painelvm_settings')
                      .update({
                        source_market: adminSettings.source_market,
                        source_screen: adminSettings.source_screen,
                        gamma_symbol: adminSettings.gamma_symbol,
                        instance_id_market: adminSettings.instance_id_market || expectedInstanceId,
                        instance_id_force: adminSettings.instance_id_force || expectedInstanceId,
                        instance_id_screen: adminSettings.instance_id_screen || expectedInstanceId,
                        disabled_levels: newDisabledLevels
                      })
                      .eq('id', userSettings.id);
                  }
                }
              }
            }
          }

          // Excluir painéis que o admin removeu
          const adminExpectedInstances = new Set(adminPanels.map(ap => ap.instance_id));
          const panelsToDelete = updatedPanelsList.filter(p => {
            // Apenas remove painéis que o admin não possui mais
            return !adminExpectedInstances.has(p.instance_id);
          });

          if (panelsToDelete.length > 0) {
            didDeleteAny = true;
            for (const pDel of panelsToDelete) {
              await supabase.from('painelvm_panels').delete().eq('id', pDel.id);
              updatedPanelsList = updatedPanelsList.filter(p => p.id !== pDel.id);
            }
          }

          if (didCreateAny || didDeleteAny || didUpdateAny) {
            panelsData = updatedPanelsList;
          }
        }
      }

      // Buscar configurações de todos os painéis carregados
      const panelIds = (panelsData || []).map((p: any) => p.id);
      const { data: allSettingsData, error: settingsError } = await supabase
        .from('painelvm_settings')
        .select('*')
        .in('panel_id', panelIds);

      if (settingsError) throw settingsError;

      // Montar mapa das configurações indexados por panel_id
      const settingsMap: Record<string, any> = {};
      (allSettingsData || []).forEach(s => {
        settingsMap[s.panel_id] = enrichSettingsWithVirtualConfigs(s);
      });

      // Garantir que todos os painéis tenham uma configuração correspondente
      for (const p of (panelsData || [])) {
        if (!settingsMap[p.id]) {
          let gammaSymbol = 'NQ';
          if (p.instance_id === 'sp500') gammaSymbol = 'ES';
          if (p.instance_id === 'gold') gammaSymbol = 'GC';

          const { data: newSettings, error: createSingleSetError } = await supabase
            .from('painelvm_settings')
            .insert({
              panel_id: p.id,
              ai_provider: 'groq',
              groq_model: 'qwen/qwen3.8-27b',
              intervalo: 30000,
              enviar_imagem_ia: true,
              gamma_symbol: gammaSymbol,
              instance_id_market: p.instance_id,
              instance_id_force: p.instance_id,
              instance_id_screen: p.instance_id,
              source_market: 'supabase',
              source_screen: 'supabase',
              card_order_desktop: 'preco_sentimento,forca,mapa,ia_delta,grafico,blocktrades,mensagens',
              card_order_mobile: 'preco_sentimento,forca,mapa,ia_delta,grafico,blocktrades,mensagens',
              disabled_levels: [
                'cfg:vortex_ai_enabled:false',
                'cfg:general_prompt_days:all',
                'cfg:chart_show_sma9:true',
                'cfg:chart_show_ema21:true',
                'cfg:chart_show_ema50:false',
                'cfg:chart_show_rsi:false',
                'cfg:chart_show_macd:false',
                'cfg:chart_show_pva:true',
                'cfg:chart_show_emacd:false',
                'cfg:log_show_sistema:true',
                'cfg:log_show_alerta:true',
                'cfg:log_show_ia:true',
                'cfg:log_show_erro:true',
                'cfg:log_show_noticia:true',
                'cfg:market_update_interval:500',
                'cfg:general_prompt_master_enabled:false',
                'cfg:chart_candle_bar_count:60',
                'cfg:chart_manual_trade_mode:nivel',
                'cfg:chart_manual_sl_points:50',
                'cfg:chart_manual_tp_points:50',
                'cfg:chart_show_levels:true',
                'cfg:chart_confirm_manual_trade:true',
                'cfg:chart_manual_ia_validate:false',
                'cfg:alert_force_ativo:false',
                'cfg:alert_force_buy_min:-2.0',
                'cfg:alert_force_sell_max:2.0',
                'cfg:alert_force_cooldown:10',
                'cfg:alert_force_telegram:false',
                'cfg:alert_force_vies_shift:false',
                'cfg:alert_pva_ativo:false',
                'cfg:alert_pva_cooldown:5',
                'cfg:alert_pva_telegram:false',
                'cfg:general_prompt_enabled:false',
                'cfg:general_prompt_frequency:15',
                'cfg:general_prompt_start_time:09:00',
                'cfg:general_prompt_end_time:18:00',
                `cfg:general_prompt_template:${DEFAULT_GENERAL_PROMPT_TEMPLATE}`,
                'cfg:general_prompt_telegram_send_image:true',
                'cfg:general_prompt_telegram_enabled:true',
                'cfg:news_background_enabled:false',
                'cfg:selected_prompt_id:'
              ]
            })
            .select()
            .single();

          if (!createSingleSetError && newSettings) {
            settingsMap[p.id] = enrichSettingsWithVirtualConfigs(newSettings);
          }
        }
      }

      // Se não for Admin, buscar e mapear as configurações do Admin para referência universal de candles
      await refreshAdminSettings();

      if (!isSystemAdmin) {
        Object.keys(settingsMap).forEach(panelId => {
          const userPanel = (panelsData || []).find((p: any) => p.id === panelId);
          const adminSet = getAdminSetForPanel(userPanel);
          if (adminSet) {
            settingsMap[panelId] = {
              ...settingsMap[panelId],
              transmission_mode: adminSet.transmission_mode || 'websocket',
              websocket_hub_url: adminSet.websocket_hub_url || 'ws://127.0.0.1:8080/ws',
              instance_id_market: adminSet.instance_id_market || userPanel?.instance_id || 'painel_principal_web',
              instance_id_force: adminSet.instance_id_force || 'painel_principal_web',
              instance_id_screen: adminSet.instance_id_screen || userPanel?.instance_id || 'painel_principal_web',
              source_market: adminSet.source_market || 'supabase',
              source_screen: adminSet.source_screen || 'supabase',
              gamma_symbol: adminSet.gamma_symbol || 'NQ'
            };
          }
        });
      }

      const enrichedPanels = (panelsData || []).map((p: any) => {
        const localPt = typeof window !== 'undefined' ? localStorage.getItem(`vortex_panel_point_value_${p.id}`) : null;
        const localTick = typeof window !== 'undefined' ? localStorage.getItem(`vortex_panel_tick_size_${p.id}`) : null;
        const localSl = typeof window !== 'undefined' ? localStorage.getItem(`vortex_panel_default_sl_${p.id}`) : null;
        const localTp = typeof window !== 'undefined' ? localStorage.getItem(`vortex_panel_default_tp_${p.id}`) : null;
        const resolvedPt = (p.point_value !== undefined && p.point_value !== null && Number(p.point_value) > 0)
          ? Number(p.point_value)
          : (localPt && Number(localPt) > 0 ? Number(localPt) : Number(p.point_value || 1.0));
        return {
          ...p,
          point_value: resolvedPt,
          tick_size: (p.tick_size !== undefined && p.tick_size !== null && Number(p.tick_size) > 0)
            ? Number(p.tick_size)
            : (localTick && Number(localTick) > 0 ? Number(localTick) : undefined),
          default_sl_points: (p.default_sl_points !== undefined && p.default_sl_points !== null && Number(p.default_sl_points) > 0)
            ? Number(p.default_sl_points)
            : (localSl && Number(localSl) > 0 ? Number(localSl) : undefined),
          default_tp_points: (p.default_tp_points !== undefined && p.default_tp_points !== null && Number(p.default_tp_points) > 0)
            ? Number(p.default_tp_points)
            : (localTp && Number(localTp) > 0 ? Number(localTp) : undefined)
        };
      });

      setPanels(enrichedPanels);
      setAllSettings(settingsMap);

      // Definir o painel ativo (resgatar do localStorage ou escolher o primeiro por padrão)
      const lastActiveId = localStorage.getItem('vortex_active_panel_id');
      let active = (enrichedPanels || []).find((p: any) => p.id === lastActiveId || p.instance_id === lastActiveId || p.name === lastActiveId);
      if (!active) {
        active = (enrichedPanels || []).find((p: any) => p.instance_id === 'nasdaq') || (enrichedPanels || [])[0];
      }

      setPanel(active);
      setActivePanel(active);
      if (active) {
        const enriched = settingsMap[active.id];
        setSettings(enriched);
        localStorage.setItem('vortex_active_panel_id', active.id);
        syncStateFromSettings(enriched);
      }

      if (isSystemAdmin) {
        addLog('SISTEMA', `Múltiplos painéis carregados (${(enrichedPanels || []).length} ativos).`, 'sistema');
      }

      // Carregar prompts/estratégias em paralelo (apenas em carregamento completo, pulando em atualizações rápidas de painel)
      if (!options?.skipAuxiliary) {
        await Promise.allSettled([
          fetchPromptsList(),
          fetchStrategiesList(),
          fetchReportsList(),
          fetchGeneralAnalysesList()
        ]);
      }
    } catch (err: any) {
      console.error('[CONTEXT] Erro ao carregar configurações do usuário:', err);
      addLog('ERRO', `Erro ao carregar configurações: ${err.message}`, 'erro');
    }
  }

  const switchPanel = (panelIdOrObj: string | any) => {
    const rawId = typeof panelIdOrObj === 'string' ? panelIdOrObj : (panelIdOrObj?.id || panelIdOrObj?.instance_id || '');
    const targetPanel = panels.find(p => p.id === rawId || p.instance_id === rawId || p.name === rawId);
    if (!targetPanel) return;
    const panelId = targetPanel.id;

    activePanelRef.current = targetPanel;
    setActivePanel(targetPanel);
    setPanel(targetPanel);

    const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
    const targetSettings = allSettings[panelId] || settings;
    if (targetSettings) {
      setSettings(targetSettings);
      syncStateFromSettings(targetSettings);
    }

    // Regra 2c: Sincronizar automaticamente o Copilot ao trocar o Ativo no gráfico
    syncCopilotForAccountAndPanel(activeAccountRef.current || activeAccount, targetPanel, true);

    localStorage.setItem('vortex_active_panel_id', panelId);
    if (isSystemAdmin) {
      addLog('SISTEMA', `Painel ativo alterado para '${targetPanel.name}'.`, 'sistema');
    }

    // Inicializar ou resgatar cache do painel
    let cache = panelDataCache.current[panelId];
    if (!cache) {
      cache = {
        marketData: null,
        forces: [],
        gammaLevels: null,
        optionsMarket: null,
        screenshot: null,
        candles: [],
        lastGammaFetch: 0,
        lastGammaSymbol: '',
        lastOptionsMarketFetch: 0,
        lastScreenshotFetch: 0,
        lastCandlesFetch: 0,
        lastForceFetch: 0
      };
      panelDataCache.current[panelId] = cache;
    }

    // Carregar dados cached imediatamente para transição visual ágil
    setMarketData(cache.marketData);
    setForces(cache.forces);
    setGammaLevels(cache.gammaLevels);
    setOptionsMarket(cache.optionsMarket || null);
    setScreenshot(cache.screenshot);
    const targetDays = Math.max(3, Number(targetSettings?.chart_history_days) || 3);
    const loadedDays = Number((cache as any).loadedHistoryDays || 0);
    const hasCachedCandles = Boolean(cache.candles && cache.candles.length >= 10);
    const isPanelReady = hasCachedCandles && (initialLoadedPanelsRef.current.has(panelId) || loadedDays >= targetDays);
    if (isPanelReady) {
      setCandles(cache.candles || []);
      setIsCandlesLoading(false);
    } else {
      setCandles([]);
      setCandlesLoadingProgress({
        isLoading: true,
        percent: 15,
        loaded: 0,
        total: Math.min(50000, targetDays * 1440),
        days: targetDays,
        isExplicitDaysChange: true
      });
      setIsCandlesLoading(true);
    }
    setAiResult(cache.aiResult || null);

    // Só busca histórico no servidor se o painel ainda não tiver o histórico solicitado em cache
    if (!isPanelReady) {
      cache.lastCandlesFetch = 0;
      cache.lastGammaFetch = 0;
      cache.lastOptionsMarketFetch = 0;
      cache.lastScreenshotFetch = 0;
      cache.lastForceFetch = 0;

      if (targetPanel && targetSettings) {
        executeMarketCycleForPanel(targetPanel, targetSettings);
      }
    }
  };

  // 3. Funções de Autenticação
  const signIn = async (email: string, password: string, subId?: string, forcedMode?: 'admin' | 'restricted'): Promise<{ 
    success: boolean; 
    needsChoice?: boolean; 
    message?: string;
    isPendingPayment?: boolean;
    subscriptionStatus?: string;
    pendingPayment?: any;
    nextPaymentDate?: string | null;
  }> => {
    setAuthError(null);
    const res = await signInUser(email, password, subId, forcedMode);
    if (res.success && res.user && res.sessionId) {
      setUser(res.user);
      setSessionId(res.sessionId);
      if (res.planDetails) {
        setPlanDetails(res.planDetails);
      }

      const isRestrictedLocal = localStorage.getItem('vortex_is_restricted') === 'true';
      setIsRestrictedSession(isRestrictedLocal);

      setIsAuthenticated(true);

      const isSystemAdmin = res.user.email?.toLowerCase() === 'admin@vortex.com';
      if (isSystemAdmin) {
        localStorage.setItem('vortex_subscription_id', 'admin');
      }

      addLog('SISTEMA', `Login efetuado no modo ${isRestrictedLocal ? 'RESTRITO' : 'COMPLETO'} por ${res.user.email}`, 'sistema');
      const actualSubId = isSystemAdmin ? 'admin' : (subId || null);
      await loadUserSettings(res.user.id, actualSubId);
      return { 
        success: true,
        nextPaymentDate: res.nextPaymentDate
      };
    } else {
      if ((res as any).needsChoice) {
        return { success: false, needsChoice: true, message: res.message };
      }
      setAuthError(res.message);
      addLog('ERRO', `Falha no login: ${res.message}`, 'erro');
      return { 
        success: false, 
        message: res.message,
        isPendingPayment: res.isPendingPayment,
        subscriptionStatus: res.subscriptionStatus,
        pendingPayment: res.pendingPayment,
        nextPaymentDate: res.nextPaymentDate
      };
    }
  };

  const signUp = async (email: string, password: string, subId: string): Promise<boolean> => {
    setAuthError(null);
    const res = await signUpUser(email, password, subId);
    if (res.success && res.user && res.sessionId) {
      setUser(res.user);
      setSessionId(res.sessionId);
      setIsAuthenticated(true);
      localStorage.setItem('vortex_session_id', res.sessionId);
      localStorage.setItem('vortex_subscription_id', subId);
      addLog('SISTEMA', `Conta criada e ativada com sucesso: ${res.user.email}`, 'sistema');
      await loadUserSettings(res.user.id, subId);
      return true;
    } else {
      setAuthError(res.message);
      addLog('ERRO', `Falha no cadastro: ${res.message}`, 'erro');
      return false;
    }
  };

  const resetOrSetPassword = async (email: string, subId: string, newPass: string): Promise<{ success: boolean; message: string }> => {
    setAuthError(null);
    const res = await resetOrSetUserPassword(email, subId, newPass);
    if (res.success) {
      addLog('SISTEMA', `Senha configurada com sucesso para ${email}`, 'sistema');
    } else {
      addLog('ERRO', `Falha ao configurar senha: ${res.message}`, 'erro');
    }
    return res;
  };

  const changePassword = async (newPass: string): Promise<{ success: boolean; message: string }> => {
    const res = await updateCurrentUserPassword(newPass);
    if (res.success) {
      addLog('SISTEMA', `Senha alterada com sucesso`, 'sistema');
    } else {
      addLog('ERRO', `Falha ao alterar senha: ${res.message}`, 'erro');
    }
    return res;
  };

  const logout = async () => {
    try {
      if ((window as any).electronAPI?.setClosable) {
        (window as any).electronAPI.setClosable(true);
      }
    } catch (e) {
      console.warn('[ELECTRON] Erro ao liberar botão fechar no logout:', e);
    }
    await signOutUser();
    setUser(null);
    setSessionId(null);
    setPlanDetails(null);
    setIsRestrictedSession(false);
    setIsAuthenticated(false);
  };

  const lastLocalSettingsSaveAtRef = useRef<number>(0);

  // 4. Salvar Configurações
  const saveSettings = async (updatedFields: Partial<any>, targetPanelId?: string | 'all' | string[]): Promise<boolean> => {
    if (isRestrictedSession) return false;
    if (!settings || !panel) return false;
    lastLocalSettingsSaveAtRef.current = Date.now();

    const targetPanelIds: string[] = [];
    if (targetPanelId === 'all') {
      targetPanelIds.push(...(panels || []).map(p => p.id));
    } else if (Array.isArray(targetPanelId)) {
      targetPanelIds.push(...Array.from(new Set(targetPanelId.filter(Boolean))));
    } else if (targetPanelId) {
      targetPanelIds.push(targetPanelId);
    } else {
      targetPanelIds.push(panel.id);
    }

    let overallSuccess = true;

    for (const pId of targetPanelIds) {
      const currentPanelSettings = allSettings[pId] || (pId === panel.id ? settings : null);
      if (!currentPanelSettings) continue;

      const mergedSettings = { ...currentPanelSettings, ...updatedFields };

      const cleanDisabledLevels = (mergedSettings.disabled_levels || []).filter(
        (item: string) => typeof item === 'string' && !item.startsWith('cfg:')
      );

      const configItems = [
        `cfg:vortex_ai_enabled:${mergedSettings.vortex_ai_enabled || false}`,
        `cfg:general_prompt_days:${mergedSettings.general_prompt_days || 'all'}`,
        `cfg:chart_show_sma9:${mergedSettings.chart_show_sma9 !== false}`,
        `cfg:chart_show_ema21:${mergedSettings.chart_show_ema21 !== false}`,
        `cfg:chart_show_ema50:${mergedSettings.chart_show_ema50 || false}`,
        `cfg:chart_show_rsi:${mergedSettings.chart_show_rsi || false}`,
        `cfg:chart_show_macd:${mergedSettings.chart_show_macd || false}`,
        `cfg:chart_show_pva:${mergedSettings.chart_show_pva !== false}`,
        `cfg:chart_show_emacd:${mergedSettings.chart_show_emacd || false}`,
        `cfg:log_show_sistema:${mergedSettings.log_show_sistema !== false}`,
        `cfg:log_show_alerta:${mergedSettings.log_show_alerta !== false}`,
        `cfg:log_show_ia:${mergedSettings.log_show_ia !== false}`,
        `cfg:log_show_erro:${mergedSettings.log_show_erro !== false}`,
        `cfg:log_show_noticia:${mergedSettings.log_show_noticia !== false}`,
        `cfg:market_update_interval:${mergedSettings.market_update_interval !== undefined ? mergedSettings.market_update_interval : 500}`,
        `cfg:force_update_interval:${mergedSettings.force_update_interval !== undefined ? mergedSettings.force_update_interval : 1500}`,
        `cfg:candles_update_interval:${mergedSettings.candles_update_interval !== undefined ? mergedSettings.candles_update_interval : 2000}`,
        `cfg:screenshot_update_interval:${mergedSettings.screenshot_update_interval !== undefined ? mergedSettings.screenshot_update_interval : 3000}`,
        `cfg:general_prompt_master_enabled:${mergedSettings.general_prompt_master_enabled || false}`,
        `cfg:chart_candle_bar_count:${mergedSettings.chart_candle_bar_count !== undefined ? mergedSettings.chart_candle_bar_count : 60}`,
        `cfg:chart_history_days:${mergedSettings.chart_history_days !== undefined ? mergedSettings.chart_history_days : 7}`,
        `cfg:slot_history_days:${mergedSettings.slot_history_days || ''}`,
        `cfg:chart_manual_trade_mode:${mergedSettings.chart_manual_trade_mode || 'nivel'}`,
        `cfg:chart_manual_sizing_mode:${mergedSettings.chart_manual_sizing_mode || 'lote'}`,
        `cfg:chart_manual_risk_usd:${mergedSettings.chart_manual_risk_usd !== undefined ? mergedSettings.chart_manual_risk_usd : 250}`,
        `cfg:chart_manual_sl_points:${mergedSettings.chart_manual_sl_points !== undefined ? mergedSettings.chart_manual_sl_points : 50}`,
        `cfg:chart_manual_tp_points:${mergedSettings.chart_manual_tp_points !== undefined ? mergedSettings.chart_manual_tp_points : 50}`,
        `cfg:chart_manual_contracts:${mergedSettings.chart_manual_contracts !== undefined ? mergedSettings.chart_manual_contracts : 1}`,
        `cfg:chart_show_levels:${mergedSettings.chart_show_levels !== false}`,
        `cfg:chart_confirm_manual_trade:${mergedSettings.chart_confirm_manual_trade !== false}`,
        `cfg:chart_manual_ia_validate:${mergedSettings.chart_manual_ia_validate || false}`,
        `cfg:alert_force_ativo:${mergedSettings.alert_force_ativo || false}`,
        `cfg:alert_force_buy_min:${mergedSettings.alert_force_buy_min !== undefined ? mergedSettings.alert_force_buy_min : -2.0}`,
        `cfg:alert_force_sell_max:${mergedSettings.alert_force_sell_max !== undefined ? mergedSettings.alert_force_sell_max : 2.0}`,
        `cfg:alert_force_cooldown:${mergedSettings.alert_force_cooldown !== undefined ? mergedSettings.alert_force_cooldown : 10}`,
        `cfg:alert_force_telegram:${mergedSettings.alert_force_telegram || false}`,
        `cfg:alert_force_vies_shift:${mergedSettings.alert_force_vies_shift || false}`,
        `cfg:alert_pva_ativo:${mergedSettings.alert_pva_ativo || false}`,
        `cfg:alert_pva_cooldown:${mergedSettings.alert_pva_cooldown !== undefined ? mergedSettings.alert_pva_cooldown : 5}`,
        `cfg:alert_pva_telegram:${mergedSettings.alert_pva_telegram || false}`,
        `cfg:alert_mode:${mergedSettings.alert_mode || 'individual'}`,
        `cfg:alert_sent_ativo:${mergedSettings.alert_sent_ativo || false}`,
        `cfg:alert_sent_max:${mergedSettings.alert_sent_max !== undefined ? mergedSettings.alert_sent_max : 75}`,
        `cfg:alert_sent_min:${mergedSettings.alert_sent_min !== undefined ? mergedSettings.alert_sent_min : 25}`,
        `cfg:alert_sent_cooldown:${mergedSettings.alert_sent_cooldown !== undefined ? mergedSettings.alert_sent_cooldown : 5}`,
        `cfg:alert_sent_telegram:${mergedSettings.alert_sent_telegram || false}`,
        `cfg:alert_sent_micro_ativo:${mergedSettings.alert_sent_micro_ativo || false}`,
        `cfg:alert_sent_micro_max:${mergedSettings.alert_sent_micro_max !== undefined ? mergedSettings.alert_sent_micro_max : 75}`,
        `cfg:alert_sent_micro_min:${mergedSettings.alert_sent_micro_min !== undefined ? mergedSettings.alert_sent_micro_min : 25}`,
        `cfg:alert_sent_micro_cooldown:${mergedSettings.alert_sent_micro_cooldown !== undefined ? mergedSettings.alert_sent_micro_cooldown : 5}`,
        `cfg:alert_sent_micro_telegram:${mergedSettings.alert_sent_micro_telegram || false}`,
        `cfg:alert_bt_ativo:${mergedSettings.alert_bt_ativo || false}`,
        `cfg:alert_bt_vol:${mergedSettings.alert_bt_vol !== undefined ? mergedSettings.alert_bt_vol : 50}`,
        `cfg:alert_bt_cooldown:${mergedSettings.alert_bt_cooldown !== undefined ? mergedSettings.alert_bt_cooldown : 5}`,
        `cfg:alert_bt_telegram:${mergedSettings.alert_bt_telegram || false}`,
        `cfg:alert_delta_ativo:${mergedSettings.alert_delta_ativo || false}`,
        `cfg:alert_delta_sell:${mergedSettings.alert_delta_sell !== undefined ? mergedSettings.alert_delta_sell : 0.5}`,
        `cfg:alert_delta_buy:${mergedSettings.alert_delta_buy !== undefined ? mergedSettings.alert_delta_buy : 1.5}`,
        `cfg:alert_delta_vol_min:${mergedSettings.alert_delta_vol_min !== undefined ? mergedSettings.alert_delta_vol_min : 50}`,
        `cfg:alert_delta_cooldown:${mergedSettings.alert_delta_cooldown !== undefined ? mergedSettings.alert_delta_cooldown : 5}`,
        `cfg:alert_delta_telegram:${mergedSettings.alert_delta_telegram || false}`,
        `cfg:alert_acel_ativo:${mergedSettings.alert_acel_ativo || false}`,
        `cfg:alert_acel_explosao:${mergedSettings.alert_acel_explosao || false}`,
        `cfg:alert_acel_exaustao:${mergedSettings.alert_acel_exaustao || false}`,
        `cfg:alert_acel_compressao:${mergedSettings.alert_acel_compressao || false}`,
        `cfg:alert_acel_cooldown:${mergedSettings.alert_acel_cooldown !== undefined ? mergedSettings.alert_acel_cooldown : 5}`,
        `cfg:alert_acel_telegram:${mergedSettings.alert_acel_telegram || false}`,
        `cfg:alert_nivel_ativo:${mergedSettings.alert_nivel_ativo || false}`,
        `cfg:alert_nivel_dist:${mergedSettings.alert_nivel_dist !== undefined ? mergedSettings.alert_nivel_dist : 25}`,
        `cfg:alert_nivel_cooldown:${mergedSettings.alert_nivel_cooldown !== undefined ? mergedSettings.alert_nivel_cooldown : 10}`,
        `cfg:alert_nivel_telegram:${mergedSettings.alert_nivel_telegram || false}`,
        `cfg:alert_nivel_niveis:${Array.isArray(mergedSettings.alert_nivel_niveis) ? mergedSettings.alert_nivel_niveis.join(',') : ''}`,
        `cfg:general_prompt_enabled:${mergedSettings.general_prompt_enabled || false}`,
        `cfg:general_prompt_frequency:${mergedSettings.general_prompt_frequency !== undefined ? mergedSettings.general_prompt_frequency : 15}`,
        `cfg:general_prompt_start_time:${mergedSettings.general_prompt_start_time || '09:00'}`,
        `cfg:general_prompt_end_time:${mergedSettings.general_prompt_end_time || '18:00'}`,
        `cfg:general_prompt_template:${mergedSettings.general_prompt_template || ''}`,
        `cfg:general_prompt_telegram_send_image:${mergedSettings.general_prompt_telegram_send_image !== false}`,
        `cfg:general_prompt_telegram_enabled:${mergedSettings.general_prompt_telegram_enabled !== false}`,
        `cfg:general_prompt_panel_id:${mergedSettings.general_prompt_panel_id || ''}`,
        `cfg:news_background_enabled:${mergedSettings.news_background_enabled || false}`,
        `cfg:news_chart_markers:${mergedSettings.news_chart_markers !== false}`,
        `cfg:manual_prompt_id:${mergedSettings.manual_prompt_id || ''}`,
        `cfg:selected_prompt_id:${mergedSettings.selected_prompt_id || ''}`,
        `cfg:chart_show_fvg:${mergedSettings.chart_show_fvg !== false}`,
        `cfg:ops_check_interval_ms:${mergedSettings.ops_check_interval_ms !== undefined ? mergedSettings.ops_check_interval_ms : 2000}`,
        `cfg:admin_ops_telegram_enabled:${mergedSettings.admin_ops_telegram_enabled || false}`,
        `cfg:admin_ops_telegram_bot_token:${mergedSettings.admin_ops_telegram_bot_token || ''}`,
        `cfg:admin_ops_telegram_chat_id:${mergedSettings.admin_ops_telegram_chat_id || ''}`,
        `cfg:multi_strategy_mode:${mergedSettings.multi_strategy_mode === true}`,
        `cfg:transmission_mode:${mergedSettings.transmission_mode || 'polling'}`,
        `cfg:websocket_hub_url:${mergedSettings.websocket_hub_url || 'ws://127.0.0.1:8080/ws'}`,
        `cfg:enable_tts:${mergedSettings.enable_tts === true}`,
        `cfg:tts_provider:${mergedSettings.tts_provider || 'groq'}`,
        `cfg:tts_groq_api_key:${mergedSettings.tts_groq_api_key || ''}`,
        `cfg:tts_gemini_api_key:${mergedSettings.tts_gemini_api_key || ''}`,
        `cfg:tts_openai_api_key:${mergedSettings.tts_openai_api_key || ''}`,
        `cfg:tts_groq_model:${mergedSettings.tts_groq_model || 'canopylabs/orpheus-v1-english'}`,
        `cfg:tts_groq_voice:${mergedSettings.tts_groq_voice || 'autumn'}`,
        `cfg:tts_gemini_model:${mergedSettings.tts_gemini_model || 'gemini-3.8-flash-lite-tts'}`,
        `cfg:tts_gemini_voice:${mergedSettings.tts_gemini_voice || 'Puck'}`,
        `cfg:tts_openai_model:${mergedSettings.tts_openai_model || 'gpt-4o-mini-tts'}`,
        `cfg:tts_openai_voice:${mergedSettings.tts_openai_voice || 'nova'}`,
        `cfg:tts_trigger_mode:${mergedSettings.tts_trigger_mode || 'critical_only'}`,
        `cfg:tts_cooldown_seconds:${mergedSettings.tts_cooldown_seconds !== undefined ? mergedSettings.tts_cooldown_seconds : 15}`,
        `cfg:tts_volume:${mergedSettings.tts_volume !== undefined ? mergedSettings.tts_volume : 1.0}`,
        `cfg:tts_browser_voice_name:${mergedSettings.tts_browser_voice_name || ''}`,
        `cfg:resource_algorithms_enabled:${mergedSettings.resource_algorithms_enabled !== false}`,
        `cfg:resource_bg_panels_enabled:${mergedSettings.resource_bg_panels_enabled !== false}`,
        `cfg:resource_audio_keepalive_enabled:${mergedSettings.resource_audio_keepalive_enabled !== false}`,
        `cfg:resource_chart_screenshots_enabled:${mergedSettings.resource_chart_screenshots_enabled !== false}`,
        `cfg:resource_chart_alerts_enabled:${mergedSettings.resource_chart_alerts_enabled !== false}`,
        `cfg:resource_news_enabled:${mergedSettings.resource_news_enabled !== false}`,
        `cfg:resource_telegram_enabled:${mergedSettings.resource_telegram_enabled !== false}`,
        `cfg:resource_tts_enabled:${mergedSettings.resource_tts_enabled !== false}`,
        `cfg:resource_sound_beeps_enabled:${mergedSettings.resource_sound_beeps_enabled !== false}`,
      ];

      const newDisabledLevels = [...cleanDisabledLevels, ...configItems];
      mergedSettings.disabled_levels = newDisabledLevels;

      const enrichedSettings = enrichSettingsWithVirtualConfigs(mergedSettings);

      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem(`vortex_settings_${pId}`, JSON.stringify(enrichedSettings));
          localStorage.setItem('vortex_resource_sound_beeps_enabled', String(enrichedSettings.resource_sound_beeps_enabled !== false));
          if (enrichedSettings.transmission_mode) {
            localStorage.setItem(`vortex_transmission_mode_${pId}`, enrichedSettings.transmission_mode);
          }
          if (enrichedSettings.websocket_hub_url) {
            localStorage.setItem(`vortex_ws_hub_url_${pId}`, enrichedSettings.websocket_hub_url);
          }
        }
      } catch (e) {}

      if (pId === panel.id) {
        setSettings(enrichedSettings);
        syncStateFromSettings(enrichedSettings);
      }

      setAllSettings(prev => ({
        ...prev,
        [pId]: enrichedSettings
      }));

      const virtualKeys = [
        'vortex_ai_enabled', 'general_prompt_days', 'general_prompt_panel_id', 'manual_prompt_id', 'selected_prompt_id',
        'chart_show_sma9', 'chart_show_ema21', 'chart_show_ema50', 'chart_show_rsi',
        'chart_show_macd', 'chart_show_pva', 'chart_show_emacd', 'chart_show_fvg',
        'log_show_sistema', 'log_show_alerta', 'log_show_ia', 'log_show_erro',
        'log_show_noticia', 'market_update_interval', 'force_update_interval',
        'candles_update_interval', 'screenshot_update_interval', 'general_prompt_master_enabled',
        'chart_candle_bar_count', 'chart_history_days', 'slot_history_days', 'chart_manual_trade_mode', 'chart_manual_sl_points',
        'chart_manual_tp_points', 'chart_show_levels', 'chart_confirm_manual_trade',
        'chart_manual_ia_validate', 'alert_force_ativo', 'alert_force_buy_min',
        'alert_force_sell_max', 'alert_force_cooldown', 'alert_force_telegram',
        'alert_force_vies_shift', 'alert_pva_ativo', 'alert_pva_cooldown',
        'alert_pva_telegram', 'general_prompt_enabled', 'general_prompt_frequency',
        'general_prompt_start_time', 'general_prompt_end_time', 'general_prompt_template',
        'general_prompt_telegram_send_image', 'general_prompt_telegram_enabled', 'news_background_enabled',
        'alert_mode', 'alert_sent_ativo', 'alert_sent_max', 'alert_sent_min', 'alert_sent_cooldown', 'alert_sent_telegram',
        'alert_sent_micro_ativo', 'alert_sent_micro_max', 'alert_sent_micro_min', 'alert_sent_micro_cooldown', 'alert_sent_micro_telegram',
        'alert_bt_ativo', 'alert_bt_vol', 'alert_bt_cooldown', 'alert_bt_telegram',
        'alert_delta_ativo', 'alert_delta_sell', 'alert_delta_buy', 'alert_delta_vol_min', 'alert_delta_cooldown', 'alert_delta_telegram',
        'alert_acel_ativo', 'alert_acel_explosao', 'alert_acel_exaustao', 'alert_acel_compressao', 'alert_acel_cooldown', 'alert_acel_telegram',
        'alert_nivel_ativo', 'alert_nivel_dist', 'alert_nivel_cooldown', 'alert_nivel_telegram', 'alert_nivel_niveis',
        'multi_strategy_mode', 'transmission_mode', 'websocket_hub_url',
        'enable_tts', 'tts_provider', 'tts_groq_api_key', 'tts_gemini_api_key', 'tts_openai_api_key',
        'tts_groq_model', 'tts_groq_voice', 'tts_gemini_model', 'tts_gemini_voice', 'tts_openai_model', 'tts_openai_voice',
        'tts_trigger_mode', 'tts_cooldown_seconds', 'tts_volume', 'tts_browser_voice_name'
      ];

      const DB_COLUMNS = [
        'id', 'panel_id', 'ai_provider', 'groq_api_key', 'gemini_api_key', 'openai_api_key',
        'groq_model', 'gemini_model', 'openai_model', 'intervalo', 'enviar_imagem_ia',
        'ai_trigger_mode', 'telegram_enabled', 'telegram_bot_token', 'telegram_chat_id',
        'telegram_send_image', 'telegram_send_signal', 'gamma_symbol', 'instance_id_market',
        'instance_id_force', 'instance_id_screen', 'source_market', 'source_screen',
        'ai_system_prompt', 'alert_zscore_min', 'alert_zscore_max', 'alert_delta_min',
        'alert_delta_max', 'alert_sound_enabled', 'alert_popup_enabled', 'telegram_only_signals',
        'news_alert_before', 'news_alert_after', 'news_cooldown', 'news_telegram', 'news_sound',
        'news_countries', 'news_impact_high', 'news_impact_medium', 'news_impact_low',
        'disabled_levels', 'forces_active_symbols', 'updated_at', 'contracts', 'manual_strategy_id',
        'chart_manual_sizing_mode', 'chart_manual_risk_usd',
        'daily_max_loss_usd', 'daily_max_gain_usd', 'daily_max_entries', 'session_max_entries',
        'session1_active', 'session1_start', 'session1_end', 'session2_active', 'session2_start',
        'session2_end', 'session3_active', 'session3_start', 'session3_end', 'session4_active',
        'session4_start', 'session4_end', 'global_cycle_start', 'global_cycle_end',
        'auto_cancel_open_ops_enabled', 'auto_cancel_open_ops_time', 'pause_alerts_on_stale_market', 'stale_market_timeout_sec',
        'card_order_desktop', 'card_order_mobile'
      ];

      const payload: Record<string, any> = {};
      let hasRealDbField = false;
      Object.keys(updatedFields).forEach(key => {
        if (!virtualKeys.includes(key) && DB_COLUMNS.includes(key)) {
          payload[key] = updatedFields[key];
          hasRealDbField = true;
        }
      });

      // Só anexa disabled_levels se ele foi explicitamente modificado
      const prevDisabledStr = JSON.stringify(currentPanelSettings.disabled_levels || []);
      const newDisabledStr = JSON.stringify(newDisabledLevels || []);
      if (prevDisabledStr !== newDisabledStr) {
        payload.disabled_levels = newDisabledLevels;
        hasRealDbField = true;
      }

      // Se nenhuma coluna física real da tabela foi alterada, salva no estado local sem disparar update desnecessário no banco
      if (hasRealDbField && currentPanelSettings?.id) {
        try {
          const { error } = await withDbTimeout(
            supabase
              .from('painelvm_settings')
              .update(payload)
              .eq('id', currentPanelSettings.id),
            12000
          );

          if (error) {
            console.error(`[CONTEXT] Erro ao salvar configurações no Supabase para ${pId}:`, error);
            addLog('ERRO', `Falha ao salvar config no banco: ${error.message || JSON.stringify(error)}`, 'erro');
            overallSuccess = false;
          }
        } catch (err: any) {
          console.error(`[CONTEXT] Exceção ao salvar configurações para o painel ${pId}:`, err);
          addLog('ERRO', `Exceção ao salvar config: ${err?.message || err}`, 'erro');
          overallSuccess = false;
        }
      }
    }

    if (overallSuccess) {
      if (updatedFields.chart_history_days !== undefined) {
        const nextDays = Math.max(3, Number(updatedFields.chart_history_days) || 3);
        const nextTotal = Math.min(50000, nextDays * 1440);
        targetPanelIds.forEach(pId => {
          initialLoadedPanelsRef.current.delete(pId);
          const c = panelDataCache.current[pId];
          if (c) {
            c.lastCandlesFetch = 0;
            c.isFetchingCandles = false;
            c.candles = [];
          }
        });
        if (panel?.id && targetPanelIds.includes(panel.id)) {
          setCandles([]);
          setCandlesLoadingProgress({
            isLoading: true,
            percent: 15,
            loaded: 0,
            total: nextTotal,
            days: nextDays,
            isExplicitDaysChange: true
          });
          setIsCandlesLoading(true);
        }
        bumpPanelCacheVersion();
        refreshMarketData({ chart_history_days: nextDays }, targetPanelIds);
      }
      setWakeTrigger(prev => prev + 1);

      const isMajorChange = 
        updatedFields.ai_provider !== undefined ||
        updatedFields.telegram_bot_token !== undefined ||
        updatedFields.transmission_mode !== undefined ||
        updatedFields.websocket_hub_url !== undefined ||
        updatedFields.intervalo !== undefined;

      if (isMajorChange) {
        addLog('SISTEMA', 'Configurações do painel atualizadas com sucesso.', 'sistema');
      }
    }
    return overallSuccess;
  };

  const getFreshScreenshotForPanel = async (targetPanelParam?: any, targetSettingsParam?: any): Promise<string | null> => {
    const panelForScreen = targetPanelParam || activePanel;
    if (!panelForScreen) return null;
    const targetSettings = targetSettingsParam || allSettings[panelForScreen.id] || settings;
    if (!targetSettings) return null;

    try {
      if (targetSettings.source_screen === 'candles') {
        const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
        const adminSet = !isSystemAdmin ? getAdminSetForPanel(panelForScreen) : null;
        const candleInstanceId = targetSettings.instance_id_screen
          || panelForScreen.instance_id
          || (adminSet ? adminSet.instance_id_screen : null)
          || 'nt8_main';
        const cache = panelDataCache.current[panelForScreen.id] || {};
        const candlesData = (cache.candles && cache.candles.length > 0)
          ? cache.candles
          : await fetchCandlesSupabase(panelForScreen.id, candleInstanceId);
        if (candlesData && candlesData.length > 0) {
          const chartB64 = await generateCandleChartScreenshot({
            candles: candlesData,
            gammaLevels: cache.gammaLevels || null,
            disabledLevels: targetSettings.disabled_levels || [],
            showSma9: targetSettings.chart_show_sma9 !== false,
            showEma21: targetSettings.chart_show_ema21 !== false,
            showEma50: targetSettings.chart_show_ema50 !== false,
            showRsi: targetSettings.chart_show_rsi || false,
            showMacd: targetSettings.chart_show_macd || false,
            candleBarCount: targetSettings.chart_candle_bar_count
          });
          if (chartB64) {
            const cleanB64 = chartB64.replace(/^data:image\/png;base64,/, '');
            if (cache) cache.screenshot = cleanB64;
            setScreenshot(cleanB64);
            return cleanB64;
          }
        }
      } else {
        const screenshotData = await fetchScreenshotSupabase(panelForScreen.id);
        if (screenshotData) {
          const cache = panelDataCache.current[panelForScreen.id];
          if (cache) cache.screenshot = screenshotData;
          setScreenshot(screenshotData);
          return screenshotData;
        }
      }
    } catch (err) {
      console.error('[SCREENSHOT] Erro ao obter captura atualizada:', err);
    }
    return null;
  };

  const enviarTelegramAlert = async (titulo: string, mensagem: string, detalhes: string, targetSettings = settings, customScreenshot?: string | null, targetPanelParam?: any) => {
    if (!targetSettings) return;
    if (targetSettings.resource_telegram_enabled === false) return;
    try {
      const isNews = titulo.includes('NOTÍCIA');
      const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
      if (!isSystemAdmin) {
        if (isNews && !userPermissions.allow_telegram_news) {
          console.warn('[TELEGRAM] Envio de notícias bloqueado por falta de permissão.');
          return;
        }
        if (!isNews && !userPermissions.allow_alerts) {
          console.warn('[TELEGRAM] Envio de alerta do sistema bloqueado por falta de permissão.');
          return;
        }
      }

      const botToken = targetSettings.telegram_bot_token;
      const chatId = targetSettings.telegram_chat_id;
      if (!botToken || !chatId) return;

      let text = `🚨 *AXION TRADESTATION - ${titulo}*\n\n`;
      text += `📢 *Mensagem:* ${mensagem}\n\n`;
      text += `🔍 *Detalhes da Operação:* \n\`\`\`\n${detalhes}\n\`\`\``;

      const urlText = `https://api.telegram.org/bot${botToken}/sendMessage`;
      await fetch(urlText, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'Markdown'
        })
      });

      // Se configurado para enviar imagem e houver captura do gráfico disponível ou sob demanda
      if (targetSettings.telegram_send_image !== false) {
        const panelForScreen = targetPanelParam || activePanel;
        let finalScreenshot = customScreenshot;

        // Se não foi fornecida imagem customizada explicitamente, busca/gera captura atualizada do momento
        if (!finalScreenshot) {
          finalScreenshot = (await getFreshScreenshotForPanel(panelForScreen, targetSettings)) || undefined;
        }

        if (finalScreenshot) {
          try {
            const urlPhoto = `https://api.telegram.org/bot${botToken}/sendPhoto`;
            const byteCharacters = atob(finalScreenshot);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/png' });

            const formData = new FormData();
            formData.append('chat_id', chatId);
            formData.append('photo', blob, 'chart.png');
            formData.append('caption', `📊 Captura de Gráfico: ${titulo}`);

            await fetch(urlPhoto, {
              method: 'POST',
              body: formData
            });
          } catch (imgErr) {
            console.error('[TELEGRAM] Erro ao enviar foto do gráfico:', imgErr);
          }
        }
      }
    } catch (err) {
      console.error('[TELEGRAM] Erro ao enviar alerta:', err);
    }
  };

  const parseNumericValue = (val: string | number | undefined | null, referencePrice?: number): number | null => {
    if (val === undefined || val === null || val === '' || val === '--') return null;
    if (typeof val === 'number') {
      return isNaN(val) ? null : val;
    }
    let clean = String(val).replace(/[^\d.,-]/g, '');
    if (!clean) return null;

    if (clean.includes(',') && clean.includes('.')) {
      if (clean.indexOf('.') < clean.indexOf(',')) {
        clean = clean.replace(/\./g, '').replace(/,/g, '.');
      } else {
        clean = clean.replace(/,/g, '');
      }
    } else if (clean.includes(',')) {
      const parts = clean.split(',');
      if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && referencePrice && referencePrice > 1000) {
        clean = parts[0] + parts[1];
      } else {
        clean = clean.replace(/,/g, '.');
      }
    } else if (clean.includes('.')) {
      const parts = clean.split('.');
      if (parts.length === 2 && parts[1].length === 3) {
        const asFloat = parseFloat(clean);
        const asThousands = parseFloat(parts[0] + parts[1]);
        if (referencePrice && referencePrice > 1000) {
          if (Math.abs(asThousands - referencePrice) < Math.abs(asFloat - referencePrice)) {
            clean = parts[0] + parts[1];
          }
        } else if (asFloat < 100 && asThousands > 1000) {
          clean = parts[0] + parts[1];
        }
      }
    }
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? null : parsed;
  };

  const applyRealtimePriceToCandles = (
    existingCandles: Candle[],
    price: number,
    tickTimeStrOrMs?: string | number | null
  ): { updatedCandles: Candle[]; hasChanged: boolean; isNewBar: boolean } => {
    if (!price || isNaN(price) || price <= 0 || !existingCandles || existingCandles.length === 0) {
      return { updatedCandles: existingCandles || [], hasChanged: false, isNewBar: false };
    }

    let candles = existingCandles;

    // Se ainda não temos histórico consistente carregado do banco (pelo menos 15 velas) ou se estamos em carga inicial, não alteramos
    if (candles.length < 15 || isCandlesLoading) {
      return { updatedCandles: candles, hasChanged: false, isNewBar: false };
    }

    // 1. Determina o horário de referência do tick com base no parâmetro fornecido ou no relógio sincronizado.
    // NUNCA utilizar lastCandleMs como fallback quando tickTimeStrOrMs for indefinido,
    // pois isso geraria criação descontrolada de candles futuros em cascata.
    let tickMs = getSyncedNowMs();
    if (typeof tickTimeStrOrMs === 'number' && tickTimeStrOrMs > 0) {
      tickMs = tickTimeStrOrMs;
      syncServerClock(tickMs);
    } else if (typeof tickTimeStrOrMs === 'string' && tickTimeStrOrMs) {
      const parsed = parseInputToDate(tickTimeStrOrMs);
      if (parsed && !isNaN(parsed.getTime()) && parsed.getTime() > 0) {
        tickMs = parsed.getTime();
        syncServerClock(tickMs);
      }
    }

    // 2. Minuto corrente do tick (início da barra de 1m)
    const tickBucketMs = Math.floor(tickMs / 60000) * 60000;

    // 3. Informações da última vela consolidada / em formação no array
    const lastIdx = candles.length - 1;
    const lastCandle = candles[lastIdx];
    const lastCandleDate = parseInputToDate(lastCandle.timestamp);
    const lastCandleMs = lastCandleDate ? lastCandleDate.getTime() : NaN;
    if (!isNaN(lastCandleMs) && lastCandleMs > 0) {
      syncServerClock(lastCandleMs);
    }

    const lastCandleBucketMs = !isNaN(lastCandleMs) ? Math.floor(lastCandleMs / 60000) * 60000 : tickBucketMs;

    // Cotação defasada (tick de um minuto anterior à última vela): NÃO altera e JAMAIS apaga velas reais do histórico.
    // (A antiga "autocura" removia velas legítimas quando o horário do tick atrasava em relação ao feed de candles,
    // causando o sumiço de 5-6 velas recentes.)
    if (lastCandleBucketMs > tickBucketMs) {
      return { updatedCandles: candles, hasChanged: false, isNewBar: false };
    }

    const curLastIdx = candles.length - 1;
    const curLastCandle = candles[curLastIdx];
    const curLastDate = parseInputToDate(curLastCandle.timestamp);
    const curLastMs = curLastDate ? curLastDate.getTime() : NaN;
    const curLastBucketMs = !isNaN(curLastMs) ? Math.floor(curLastMs / 60000) * 60000 : tickBucketMs;

    // Se o tick pertence ao passado (minuto anterior à última vela da tela), não altera o candle corrente
    if (tickBucketMs < curLastBucketMs) {
      return { updatedCandles: candles, hasChanged: candles.length !== existingCandles.length, isNewBar: false };
    }

    // Se houver um GAP de dados (> 3 minutos) entre a última vela carregada e o novo tick,
    // NÃO criar vela sintética isolada (aguarda o fetch do histórico completo do banco para preencher a lacuna)
    if (tickBucketMs - curLastBucketMs > 3 * 60000) {
      return { updatedCandles: candles, hasChanged: candles.length !== existingCandles.length, isNewBar: false };
    }

    const curOpen = Number(curLastCandle.open) || price;
    const curClose = Number(curLastCandle.close) || price;
    const refPrice = curClose > 0 ? curClose : curOpen;

    // Proteção de sanidade relativa: rejeita saltos aberrantes (> 3.5% do fechamento anterior)
    if (refPrice > 0 && Math.abs(price - refPrice) / refPrice > 0.035) {
      return { updatedCandles: candles, hasChanged: candles.length !== existingCandles.length, isNewBar: false };
    }

    const shouldCreateNewBar = tickBucketMs > curLastBucketMs;

    if (import.meta.env.DEV) {
      console.debug('[VORTEX_CANDLE_DEBUG]', {
        curLastTimestamp: curLastCandle?.timestamp,
        curLastBucket: new Date(curLastBucketMs).toISOString(),
        tickTimeStrOrMs,
        tickBucket: new Date(tickBucketMs).toISOString(),
        price,
        shouldCreateNewBar,
        candlesLength: candles.length
      });
    }

    // Caso 1: O tick pertence a um NOVO minuto subsequente (exatamente o próximo minuto)
    if (shouldCreateNewBar) {
      const newCandle: Candle = {
        timestamp: new Date(tickBucketMs).toISOString(),
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0
      };
      const updated = [...candles, newCandle];
      return { updatedCandles: updated, hasChanged: true, isNewBar: true };
    }

    // Caso 2: O tick pertence ao candle corrente em formação (mesmo minuto)
    const bodyMin = Math.min(curOpen, price);
    const bodyMax = Math.max(curOpen, price);

    const curHigh = Number(curLastCandle.high);
    const curLow = Number(curLastCandle.low);
    const validHigh = (!isNaN(curHigh) && curHigh > 0) ? curHigh : price;
    const validLow = (!isNaN(curLow) && curLow > 0) ? curLow : price;

    // Preserva a máxima e mínima reais negociadas no candle corrente sem cortes artificiais
    const newLow = Math.min(validLow, price, bodyMin);
    const newHigh = Math.max(validHigh, price, bodyMax);

    const hasChanged = curLastCandle.close !== price || Number(curLastCandle.high) !== newHigh || Number(curLastCandle.low) !== newLow;
    if (!hasChanged && candles.length === existingCandles.length) {
      return { updatedCandles: candles, hasChanged: false, isNewBar: false };
    }

    // Atualiza in-place na memória do cache (0ms, zero alocação para velocidade máxima)
    candles[curLastIdx] = {
      ...curLastCandle,
      close: price,
      high: newHigh,
      low: newLow
    };

    return { updatedCandles: candles, hasChanged: true, isNewBar: false };
  };

  // 5. Loops de Atualização de Dados (Preço, Níveis, Força)
  const runMarketLogicForPanel = async (
    targetPanel: any,
    targetSettings: any,
    cache: any,
    mData: MarketData | null,
    finalForces: any[],
    levels: GammaLevels | null
  ) => {
    const checkIsActive = () => activePanelRef.current?.id === targetPanel.id;

    if (mData) {
      if (mData.blockTrades) {
        let currentHistory: any[] = (cache as any).blockTradesHistory || [];

        mData.blockTrades.forEach((t) => {
          const exists = currentHistory.some((h) =>
            Math.abs(h.price - t.price) < 0.01 &&
            h.volume === t.volume &&
            h.side === t.side
          );
          if (!exists) {
            currentHistory.push({
              time: t.time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              price: t.price,
              volume: t.volume,
              side: t.side
            });
          }
        });

        const newHistory = currentHistory.slice(-10);
        (cache as any).blockTradesHistory = newHistory;
        mData.blockTrades = newHistory;
      }

      const finalData = recalculateSentimentAndDelta(
        mData,
        finalForces,
        forcesConfigRef.current,
        windowMinutesRef.current,
        windowBaselineRef.current
      );

      const prevMarketData = cache.marketData;
      const isMarketDataChanged = !prevMarketData ||
        prevMarketData.price !== finalData.price ||
        prevMarketData.buyVolume !== finalData.buyVolume ||
        prevMarketData.sellVolume !== finalData.sellVolume ||
        prevMarketData.sentiment !== finalData.sentiment ||
        prevMarketData.marketSentiment !== finalData.marketSentiment ||
        prevMarketData.deltaRatio !== finalData.deltaRatio ||
        prevMarketData.delta !== finalData.delta ||
        prevMarketData.updated_at !== finalData.updated_at ||
        prevMarketData.timestamp !== finalData.timestamp ||
        (finalData.blockTrades && finalData.blockTrades.length !== (prevMarketData.blockTrades?.length || 0));

      if (prevMarketData && isMarketDataChanged) {
        cache.lastMarketUpdateAt = Date.now();
      } else if (!cache.lastMarketUpdateAt) {
        cache.lastMarketUpdateAt = Date.now();
      }

      cache.marketData = finalData;
      cache.forces = finalForces;
      panelDataCache.current[targetPanel.id] = cache;

      if (checkIsActive() && isMarketDataChanged) {
        setMarketData(finalData);
      } else if (!checkIsActive() && isMarketDataChanged) {
        bumpPanelCacheVersion();
      }

      // Se for sessão restrita, não executa verificação de alertas ou lógica de trading ativa
      if (isRestrictedSession) {
        return;
      }

      // 1. Verificação de Período de Inicialização / Estabilização (Grace Period de 3s no startup / 2s na troca de painel)
      const nowMs = Date.now();
      const isStartupGrace = (nowMs - appStartupTimestampRef.current) < 3000;
      const lastPanelActivated = panelActivationTimestampRef.current[targetPanel.id] || 0;
      const isPanelSwitchGrace = (nowMs - lastPanelActivated) < 2000;

      // 2. Verificação de Mercado Parado (Sem novos dados) por painel individual
      const pauseStale = targetSettings.pause_alerts_on_stale_market !== false;
      const timeoutSec = Number(targetSettings.stale_market_timeout_sec) || 15;
      const isStale = pauseStale && isMarketDataStaleForPanel(targetPanel.id, timeoutSec);

      // e. Verificação de Limites de Alerta / Encerramento de Operações para múltiplos relatórios ativos
      // Usa reportsRef.current para SEMPRE ler os níveis de Stop e Alvo mais recentes (evita stale closure de Web Worker)
      const currentReportsSource = (reportsRef.current && reportsRef.current.length > 0) ? reportsRef.current : reports;
      
      const isTargetDefault = !targetPanel.id || targetPanel.id === 'default' || targetPanel.id === 'main_panel' || targetPanel.id === 'painel_principal';
      const isTargetMainInstance = !targetPanel.instance_id || targetPanel.instance_id === 'painel_principal' || targetPanel.instance_id === 'main_panel' || targetPanel.instance_id === 'nt8_main';

      const activeReportsForPanel = currentReportsSource.filter(r => {
        if (r.status !== 'Em Andamento') return false;

        // 🔒 Contas NinjaTrader Reais/Locais possuem ordens de Stop e Alvo (OCO Brackets) nativas no book da corretora.
        // O loop simulado do painel web NUNCA deve encerrar artificialmente uma ordem do NinjaTrader!
        // As saídas do NT8 são consolidadas em tempo real pelos eventos oficiais do Gateway (OnAccountExecutionUpdate / OnAccountOrderUpdate).
        const reportAcc = (accounts || []).find(a => a.id === r.account_id) || (accountsRef.current || []).find(a => a.id === r.account_id);
        if (reportAcc && isNinjaExecutionAccount(reportAcc)) {
          return false;
        }
        
        // 1. Validação de Painel / Instância / Global
        const isReportDefault = !r.panel_id || r.panel_id === 'default' || r.panel_id === 'main_panel' || r.panel_id === 'painel_principal';
        const isReportMainInstance = !r.instance_id || r.instance_id === 'painel_principal' || r.instance_id === 'main_panel' || r.instance_id === 'nt8_main';

        const panelMatches = 
          r.panel_id === targetPanel.id || 
          (r.instance_id && targetPanel.instance_id && r.instance_id === targetPanel.instance_id) ||
          (isReportDefault && isTargetDefault) ||
          (isReportMainInstance && isTargetMainInstance) ||
          (!r.panel_id && !r.instance_id) ||
          (!r.panel_id && isTargetMainInstance) ||
          (!targetPanel.instance_id && isReportDefault);
        
        if (!panelMatches) return false;

        // 2. Validação estrita de Símbolo do Ativo (Evita conflito entre ativos comprovadamente diferentes, ex: NQ vs ES ou WIN vs WDO)
        const panelSym = targetPanel.gamma_symbol || targetPanel.symbol;
        if (r.symbol && panelSym) {
          const rSymNorm = r.symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
          const tSymNorm = panelSym.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (rSymNorm && tSymNorm && !tSymNorm.includes(rSymNorm) && !rSymNorm.includes(tSymNorm)) {
            return false;
          }
        }

        return true;
      });

      // Obter candles recentes do painel para validação de faixa de preço real
      const panelCandles = cache.candles || targetPanel.candles || candles || [];
      const latestCandle = panelCandles.length > 0 ? panelCandles[panelCandles.length - 1] : null;
      // Trava Absoluta de Segurança: Para avaliar SL/TP, o preço DEVE vir de uma cotação numérica positiva confirmada em tempo real (finalData.price).
      // Se o painel não responder com preço, estiver com '--', nulo ou desatualizado, NUNCA encerrar a posição!
      const rawCurrentPrice = (finalData && finalData.price && finalData.price !== '--') ? parseNumericValue(finalData.price) : null;
      const canEvaluateTradeExit = !isStartupGrace && !isPanelSwitchGrace && !isStale && rawCurrentPrice !== null && !isNaN(rawCurrentPrice) && rawCurrentPrice > 0;
      const currentPrice = canEvaluateTradeExit ? (rawCurrentPrice as number) : 0;

      if (canEvaluateTradeExit && activeReportsForPanel.length > 0 && currentPrice > 0) {
        for (const activeReport of activeReportsForPanel) {
          const entryPrice = Number(activeReport.entry_price || 0);
          // Trava de segurança 1: Se a cotação de mercado tiver mais de 10% de discrepância do preço de entrada,
          // significa que pertence a outro ativo/painel e nunca deve encerrar a operação por engano!
          if (entryPrice > 0 && Math.abs(currentPrice - entryPrice) / entryPrice > 0.10) {
            continue;
          }

          // Trava de segurança 2: Se houver vela consolidada recente, o preço ao vivo não pode divergir mais de 80 pontos num único tick fantasma
          if (latestCandle && latestCandle.close > 0) {
            const lastClose = Number(latestCandle.close);
            if (Math.abs(currentPrice - lastClose) > 80) {
              continue;
            }
          }

          const alvoPrice = activeReport.take_profit !== null && activeReport.take_profit !== undefined ? Number(activeReport.take_profit) : null;
          const stopPrice = activeReport.stop_loss !== null && activeReport.stop_loss !== undefined ? Number(activeReport.stop_loss) : null;

          // Tolerância de micro-tick/arredondamento (0.10 pt) para absorver frações de float entre tick do ativo e preço do alvo (Take Profit)
          const tpTol = 0.10;

          const nowMs = getSyncedNowMs();
          const tradeCreatedMs = new Date(activeReport.created_at || (activeReport as any).entry_time || nowMs).getTime();
          const rawTradeAgeMs = nowMs - tradeCreatedMs;
          const localTradeAgeMs = Date.now() - tradeCreatedMs;
          const tradeAgeMs = (rawTradeAgeMs < -5000 || localTradeAgeMs < -5000)
            ? 3000
            : Math.max(rawTradeAgeMs, localTradeAgeMs);

          // 🛡️ Grace Period de entrada (1.5s): Evita corrida de estado e encerramento no mesmo milissegundo em que a ordem é inserida
          if (tradeAgeMs < 1500) {
            continue;
          }

          // 0. Processamento Dinâmico de Auto-Breakeven e Trailing Stop (ATM)
          // 🛡️ Apenas processa se a operação já tiver pelo menos 2.5s de vida para garantir estabilização de preço
          let beTrigger = 0;
          let beOffset = 0;
          let trailTrigger = 0;
          let trailStep = 0;

          if (activeReport.description && tradeAgeMs >= 2500) {
            const beMatch = activeReport.description.match(/BE:\s*(\d+(?:\.\d+)?)(?:\s*\+\s*(\d+(?:\.\d+)?))?/i);
            if (beMatch) {
              beTrigger = Number(beMatch[1]) || 0;
              beOffset = beMatch[2] !== undefined ? (Number(beMatch[2]) || 0) : 0;
            }
            const trailMatch = activeReport.description.match(/TRAIL:\s*(\d+(?:\.\d+)?)\s*(?:\/|\s)\s*(\d+(?:\.\d+)?)/i);
            if (trailMatch) {
              trailTrigger = Number(trailMatch[1]) || 0;
              trailStep = Number(trailMatch[2]) || 0;
            }
          }

          let effectiveStopLoss = stopPrice;

          if (entryPrice > 0 && tradeAgeMs >= 2500 && (beTrigger > 0 || (trailTrigger > 0 && trailStep > 0))) {
            const tickSize = resolvePanelTickSize(targetPanel, targetSettings);

            if (activeReport.side === 'COMPRA') {
              const currentGainPts = currentPrice - entryPrice;
              const maxGainPts = Math.max(0, currentGainPts);
              let candidateStop: number | null = null;

              // Auto-Breakeven (requer que o ganho real tenha atingido o gatilho)
              if (beTrigger > 0 && maxGainPts >= beTrigger) {
                candidateStop = roundToTick(entryPrice + beOffset, tickSize);
              }

              // Trailing Stop
              if (trailTrigger > 0 && trailStep > 0 && maxGainPts >= trailTrigger) {
                const steps = Math.floor((maxGainPts - trailTrigger) / trailStep);
                const targetTrail = roundToTick(entryPrice + (trailTrigger - trailStep) + (steps * trailStep), tickSize);
                candidateStop = candidateStop === null ? targetTrail : Math.max(candidateStop, targetTrail);
              }

              if (candidateStop !== null && (effectiveStopLoss === null || candidateStop > effectiveStopLoss)) {
                effectiveStopLoss = candidateStop;
                activeReport.stop_loss = candidateStop;
                addLog('OPERAÇÃO', `🛡️ [ATM ${targetPanel.name}] Stop Loss ajustado para ${candidateStop.toFixed(2)} (${activeReport.side} @ ${entryPrice.toFixed(2)}) | Auto-Breakeven / Trailing Stop ativado!`, 'sistema');
                updateReportLevelsAction(activeReport.id, candidateStop, alvoPrice, currentPrice).catch(err =>
                  console.error('[ATM] Erro ao atualizar níveis no Supabase:', err)
                );
              }
            } else if (activeReport.side === 'VENDA') {
              const currentGainPts = entryPrice - currentPrice;
              const maxGainPts = Math.max(0, currentGainPts);
              let candidateStop: number | null = null;

              // Auto-Breakeven (requer que o ganho real tenha atingido o gatilho)
              if (beTrigger > 0 && maxGainPts >= beTrigger) {
                candidateStop = roundToTick(entryPrice - beOffset, tickSize);
              }

              // Trailing Stop
              if (trailTrigger > 0 && trailStep > 0 && maxGainPts >= trailTrigger) {
                const steps = Math.floor((maxGainPts - trailTrigger) / trailStep);
                const targetTrail = roundToTick(entryPrice - (trailTrigger - trailStep) - (steps * trailStep), tickSize);
                candidateStop = candidateStop === null ? targetTrail : Math.min(candidateStop, targetTrail);
              }

              if (candidateStop !== null && (effectiveStopLoss === null || candidateStop < effectiveStopLoss)) {
                effectiveStopLoss = candidateStop;
                activeReport.stop_loss = candidateStop;
                addLog('OPERAÇÃO', `🛡️ [ATM ${targetPanel.name}] Stop Loss ajustado para ${candidateStop.toFixed(2)} (${activeReport.side} @ ${entryPrice.toFixed(2)}) | Auto-Breakeven / Trailing Stop ativado!`, 'sistema');
                updateReportLevelsAction(activeReport.id, candidateStop, alvoPrice, currentPrice).catch(err =>
                  console.error('[ATM] Erro ao atualizar níveis no Supabase:', err)
                );
              }
            }
          }

          let isResolved = false;
          let resolveReason = '';
          let exitExecutedPrice = currentPrice;

          if (activeReport.side === 'COMPRA') {
            // TAKE PROFIT (COMPRA) - cotação atual ao vivo atinge ou supera o alvo
            if (alvoPrice !== null && alvoPrice > 0 && currentPrice >= (alvoPrice - tpTol)) {
              isResolved = true;
              exitExecutedPrice = alvoPrice;
              resolveReason = `Alvo atingido no preço ${exitExecutedPrice.toFixed(2)} (Alvo: ${alvoPrice.toFixed(2)})`;
            } 
            // STOP LOSS / STOP GAIN / BREAK-EVEN (COMPRA) - cotação atual ao vivo atinge ou cruza o stop para baixo
            else if (effectiveStopLoss !== null && effectiveStopLoss > 0 && currentPrice <= effectiveStopLoss) {
              isResolved = true;
              exitExecutedPrice = effectiveStopLoss;
              const isGain = entryPrice > 0 && effectiveStopLoss > entryPrice;
              const isBe = entryPrice > 0 && Math.abs(effectiveStopLoss - entryPrice) < 0.01;
              const stopTypeLabel = isGain ? 'Stop Gain' : (isBe ? 'Break-Even' : 'Stop Loss');
              resolveReason = `${stopTypeLabel} atingido no preço ${exitExecutedPrice.toFixed(2)} (Stop: ${effectiveStopLoss.toFixed(2)})`;
            }
          } else if (activeReport.side === 'VENDA') {
            // TAKE PROFIT (VENDA) - cotação atual ao vivo atinge ou supera o alvo para baixo
            if (alvoPrice !== null && alvoPrice > 0 && currentPrice <= (alvoPrice + tpTol)) {
              isResolved = true;
              exitExecutedPrice = alvoPrice;
              resolveReason = `Alvo atingido no preço ${exitExecutedPrice.toFixed(2)} (Alvo: ${alvoPrice.toFixed(2)})`;
            } 
            // STOP LOSS / STOP GAIN / BREAK-EVEN (VENDA) - cotação atual ao vivo atinge ou cruza o stop para cima
            else if (effectiveStopLoss !== null && effectiveStopLoss > 0 && currentPrice >= effectiveStopLoss) {
              isResolved = true;
              exitExecutedPrice = effectiveStopLoss;
              const isGain = entryPrice > 0 && effectiveStopLoss < entryPrice;
              const isBe = entryPrice > 0 && Math.abs(effectiveStopLoss - entryPrice) < 0.01;
              const stopTypeLabel = isGain ? 'Stop Gain' : (isBe ? 'Break-Even' : 'Stop Loss');
              resolveReason = `${stopTypeLabel} atingido no preço ${exitExecutedPrice.toFixed(2)} (Stop: ${effectiveStopLoss.toFixed(2)})`;
            }
          }

        if (isResolved) {
          addLog('IA', `[${targetPanel.name}] Operação de ${activeReport.side} (${activeReport.strategy_name}) finalizada: ${resolveReason}.`, 'sistema');

          // Limpar imediatamente o estado no cache local para este prompt
          const pId = activeReport.strategy_id || 'default';
          if (cache.aiResults) {
            delete cache.aiResults[pId];
          }
          if ((cache as any).aiResult && (cache as any).aiResult.sinal === activeReport.side) {
            (cache as any).aiResult = null;
            if (checkIsActive()) {
              setAiResult(null);
            }
          }

          if (checkIsActive() && targetSettings.alert_sound_enabled) {
            playAlertBeep(440, 500);
          }

          const isProfit = activeReport.side === 'COMPRA'
            ? (entryPrice > 0 && exitExecutedPrice > entryPrice)
            : (entryPrice > 0 && exitExecutedPrice < entryPrice);
          const status = (resolveReason.includes('Alvo') || resolveReason.includes('Gain') || isProfit) ? 'Gain' : 'Stop';

          // Disparar Notificação Local no Android para acender a tela informando o encerramento
          try {
            LocalNotifications.schedule({
              notifications: [
                {
                  title: `🏁 Operação Encerrada - ${status} (${targetPanel.name})`,
                  body: `${activeReport.strategy_name} [${activeReport.side}]: ${resolveReason}`,
                  id: Math.floor((Date.now() + Math.random() * 1000) % 1000000),
                  schedule: { at: new Date(Date.now() + 50) }
                }
              ]
            }).catch(err => console.warn('[LOCAL_NOTIF] Falha ao notificar encerramento:', err));
          } catch (e) {
            console.warn('[LOCAL_NOTIF] Erro:', e);
          }

          if (targetSettings.telegram_enabled && targetSettings.telegram_bot_token && targetSettings.telegram_chat_id && targetSettings.telegram_send_signal) {
            const botToken = targetSettings.telegram_bot_token;
            const chatId = targetSettings.telegram_chat_id;
            const text = `🤖 *Axion TradeStation [${targetPanel.name}] - Fim de Operação (${activeReport.strategy_name})*\n\n🏁 *Operação:* ${activeReport.side}\n📈 *Preço de Fechamento:* ${exitExecutedPrice}\n📝 *Motivo:* ${resolveReason}`;
            const urlText = `https://api.telegram.org/bot${botToken}/sendMessage`;
            fetch(urlText, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'Markdown'
              })
            }).catch(err => console.error('[TELEGRAM] Erro ao enviar encerramento:', err));
          }

          const closedAt = new Date().toISOString();


          // Atualiza reportsRef.current e setReports IMEDIATAMENTE (0ms) para refletir encerramento em toda a UI sem recarregar tela
          reportsRef.current = (reportsRef.current || []).map(r =>
            r.id === activeReport.id ? { ...r, status, exit_price: exitExecutedPrice, closed_at: closedAt } : r
          );
          setReports((prev: any) => (prev || []).map((r: any) =>
            r.id === activeReport.id ? { ...r, status, exit_price: exitExecutedPrice, closed_at: closedAt } : r
          ));
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('vortex_reports_updated'));
          }

          // Nunca forçar flat geral no NinjaTrader em saídas normais de operações individuais
          updateStrategyReportStatusSupabase(activeReport.id, status, exitExecutedPrice, closedAt, false, false)
            .then(success => {
              if (success) {
                fetchReportsList();
              }
            })
            .catch(err => console.error('[CONTEXT] Erro ao fechar relatório:', err));

          // Remove apenas o ID deste relatório específico do Set do painel
          const panelSet = activeReportIdsRef.current.get(targetPanel.id);
          if (panelSet) {
            panelSet.delete(activeReport.id);
            if (panelSet.size === 0) {
              activeReportIdsRef.current.delete(targetPanel.id);
            }
          }
        }
      }
    }

      if (isStale) {
        // Pausar avaliação e disparos de alertas/popups para este painel sem cotação recente
        return;
      }

      const alertOpMode = targetSettings.alert_mode || 'individual';

      // 1. Sentimento
      let sentimentMet = false;
      let sentimentMsg = '';
      let sentimentDir: 'compra' | 'venda' | null = null;
      if (targetSettings.alert_sent_ativo) {
        const sentVal = finalData.sentiment;
        const sentMax = Number(targetSettings.alert_sent_max ?? 75);
        const sentMin = Number(targetSettings.alert_sent_min ?? 25);
        if (sentVal >= sentMax) {
          sentimentMet = true;
          sentimentMsg = `Sentimento MACRO COMPRADOR crítico: ${sentVal.toFixed(0)}% (Limite: ${sentMax}%)`;
          sentimentDir = 'compra';
        } else if (sentVal <= sentMin) {
          sentimentMet = true;
          sentimentMsg = `Sentimento MACRO VENDEDOR crítico: ${sentVal.toFixed(0)}% (Limite: ${sentMin}%)`;
          sentimentDir = 'venda';
        }
      }

      // 1b. Sentimento Micro
      let sentimentMicroMet = false;
      let sentimentMicroMsg = '';
      let sentimentMicroDir: 'compra' | 'venda' | null = null;
      if (targetSettings.alert_sent_micro_ativo) {
        const microVal = finalData.marketSentiment !== undefined ? finalData.marketSentiment : finalData.sentiment;
        const sentMicroMax = Number(targetSettings.alert_sent_micro_max ?? 75);
        const sentMicroMin = Number(targetSettings.alert_sent_micro_min ?? 25);
        if (microVal >= sentMicroMax) {
          sentimentMicroMet = true;
          sentimentMicroMsg = `Sentimento MICRO COMPRADOR crítico: ${microVal.toFixed(0)}% (Limite: ${sentMicroMax}%)`;
          sentimentMicroDir = 'compra';
        } else if (microVal <= sentMicroMin) {
          sentimentMicroMet = true;
          sentimentMicroMsg = `Sentimento MICRO VENDEDOR crítico: ${microVal.toFixed(0)}% (Limite: ${sentMicroMin}%)`;
          sentimentMicroDir = 'venda';
        }
      }

      // 2. Block Trades
      let blockTradeMet = false;
      let blockTradeMsg = '';
      let highestVolumeTrade: any = null;
      let blockTradeDir: 'compra' | 'venda' | null = null;
      if (targetSettings.alert_bt_ativo && finalData.blockTrades && finalData.blockTrades.length > 0) {
        const minVol = Number(targetSettings.alert_bt_vol ?? 50);
        const lastTrade = finalData.blockTrades[finalData.blockTrades.length - 1];
        if (lastTrade && lastTrade.volume >= minVol) {
          blockTradeMet = true;
          highestVolumeTrade = lastTrade;
          blockTradeMsg = `Block Trade relevante: ${lastTrade.side} de ${lastTrade.volume} ct @ ${lastTrade.price.toFixed(2)}`;
          const sideUpper = lastTrade.side.toUpperCase();
          if (sideUpper.includes('COMPRA') || sideUpper.includes('BUY')) {
            blockTradeDir = 'compra';
          } else if (sideUpper.includes('VENDA') || sideUpper.includes('SELL')) {
            blockTradeDir = 'venda';
          }
        }
      }

      // 3. Delta / Ratio
      let deltaMet = false;
      let deltaMsg = '';
      let deltaDir: 'compra' | 'venda' | null = null;
      if (targetSettings.alert_delta_ativo) {
        const ratio = finalData.deltaRatio;
        const dBuy = Number(targetSettings.alert_delta_buy ?? 1.5);
        const dSell = Number(targetSettings.alert_delta_sell ?? 0.5);
        const minVol = Number(targetSettings.alert_delta_vol_min ?? 50);

        if (finalData.buyVolume + finalData.sellVolume >= minVol) {
          if (ratio >= dBuy) {
            deltaMet = true;
            deltaMsg = `Delta Ratio de COMPRA crítico: ${ratio.toFixed(2)} (Limite: ${dBuy})`;
            deltaDir = 'compra';
          } else if (ratio <= dSell) {
            deltaMet = true;
            deltaMsg = `Delta Ratio de VENDA crítico: ${ratio.toFixed(2)} (Limite: ${dSell})`;
            deltaDir = 'venda';
          }
        }
      }

      // 4. Acelerômetro
      let accelMet = false;
      let accelMsg = '';
      let accelDir: 'compra' | 'venda' | null = null;
      if (targetSettings.alert_acel_ativo) {
        const est = (finalData.estado || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]+/g, ' ').toUpperCase().trim();
        if (est === 'COMPRA' || est === 'BUY') {
          accelMet = true;
          accelMsg = `Acelerômetro sinalizou: COMPRA`;
          accelDir = 'compra';
        } else if (est === 'VENDA' || est === 'SELL') {
          accelMet = true;
          accelMsg = `Acelerômetro sinalizou: VENDA`;
          accelDir = 'venda';
        } else if (est === 'SAIR' || est === 'EXIT') {
          accelMet = true;
          accelMsg = `Acelerômetro sinalizou: SAIR`;
          accelDir = null;
        } else if (targetSettings.alert_acel_explosao && est.includes('EXPLOSAO')) {
          accelMet = true;
          accelMsg = `Acelerômetro sinalizou Explosão: ${finalData.estado}`;
          if (est.includes('COMPRA') || est.includes('BUY') || est.includes('ALTA')) {
            accelDir = 'compra';
          } else if (est.includes('VENDA') || est.includes('SELL') || est.includes('BAIXA')) {
            accelDir = 'venda';
          }
        } else if (targetSettings.alert_acel_exaustao && est.includes('EXAUSTAO')) {
          accelMet = true;
          accelMsg = `Acelerômetro sinalizou Exaustão: ${finalData.estado}`;
          if (est.includes('ALTA') || est.includes('HIGH') || est.includes('COMPRA')) {
            accelDir = 'venda';
          } else if (est.includes('BAIXA') || est.includes('LOW') || est.includes('VENDA')) {
            accelDir = 'compra';
          }
        } else if (targetSettings.alert_acel_compressao && est.includes('COMPRESSAO')) {
          accelMet = true;
          accelMsg = `Acelerômetro sinalizou Compressão: ${finalData.estado}`;
          accelDir = null;
        }
      }

      // 5. Níveis Gamma
      let nivelMet = false;
      let nivelMsg = '';
      if (targetSettings.alert_nivel_ativo && levels) {
        const currentPrice = parseNumericValue(finalData.price) || 0;
        const offsetPct = Number(targetSettings.alert_nivel_offset ?? 0.05) / 100;
        const triggerDist = currentPrice * offsetPct;

        const levelMappings = [
          { label: 'HVL', val: parseNumericValue(levels.hvl) },
          { label: 'CALL Resistance', val: parseNumericValue(levels.call) },
          { label: 'PUT Support', val: parseNumericValue(levels.put) },
          { label: 'MAX 1D', val: parseNumericValue(levels.max1d) },
          { label: 'MIN 1D', val: parseNumericValue(levels.min1d) },
          { label: 'HVL 0DTE', val: parseNumericValue(levels.hvl0) },
          { label: 'CALL 0DTE', val: parseNumericValue(levels.call0) },
          { label: 'PUT 0DTE', val: parseNumericValue(levels.put0) },
          { label: 'Gamma Wall 0DTE', val: parseNumericValue(levels.gwall) }
        ];

        for (const lvl of levelMappings) {
          if (lvl.val !== null && Math.abs(currentPrice - lvl.val) <= triggerDist) {
            nivelMet = true;
            nivelMsg = `Preço próximo ao nível Gamma ${lvl.label}: ${lvl.val.toFixed(2)} (Distância: ${Math.abs(currentPrice - lvl.val).toFixed(2)})`;
            break;
          }
        }
      }

      // 6. Força Momentum & Viés Gamma
      let forceMet = false;
      let forceMsg = '';
      let forceDir: 'compra' | 'venda' | null = null;
      let viesMet = false;
      let viesMsg = '';
      let viesDir: 'compra' | 'venda' | null = null;

      let avgBuyForce = 50;
      const activeForces = finalForces.filter(f => {
        const cfg = forcesConfigRef.current.find(c => c.id === f.symbol || c.nome === f.symbol);
        return cfg ? cfg.ativo : true;
      });
      if (activeForces.length > 0) {
        const sumBuy = activeForces.reduce((acc, f) => acc + (Number(f.buy) || 0), 0);
        avgBuyForce = sumBuy / activeForces.length;
      }

      if (targetSettings.alert_force_ativo) {
        const buyMin = Number(targetSettings.alert_force_buy_min ?? 75);
        const sellMax = Number(targetSettings.alert_force_sell_max ?? 25);
        if (avgBuyForce >= buyMin) {
          forceMet = true;
          forceMsg = `Força Momentum COMPRADORA extrema: ${avgBuyForce.toFixed(1)}% (Limite: >= ${buyMin}%)`;
          forceDir = 'compra';
        } else if (avgBuyForce <= sellMax) {
          forceMet = true;
          forceMsg = `Força Momentum VENDEDORA extrema: ${avgBuyForce.toFixed(1)}% (Limite: <= ${sellMax}%)`;
          forceDir = 'venda';
        }
      }

      const currentVies = levels?.gamma_bias || '--';
      if (currentVies !== '--') {
        const viesUpper = currentVies.toUpperCase();
        if (viesUpper.includes('COMPRA') || viesUpper.includes('BULL') || viesUpper.includes('CALL')) {
          viesDir = 'compra';
        } else if (viesUpper.includes('VENDA') || viesUpper.includes('BEAR') || viesUpper.includes('PUT')) {
          viesDir = 'venda';
        }
      }

      if (targetSettings.alert_force_vies_shift && currentVies !== '--') {
        const prevVies = lastGammaBiasRef.current[targetPanel.id] || '';
        if (prevVies && prevVies !== currentVies) {
          viesMet = true;
          viesMsg = `Viés Gamma alterado de "${prevVies}" para "${currentVies}"`;
        }
        lastGammaBiasRef.current[targetPanel.id] = currentVies;
      } else if (currentVies !== '--') {
        if (!lastGammaBiasRef.current[targetPanel.id]) {
          lastGammaBiasRef.current[targetPanel.id] = currentVies;
        }
      }

      let forceViesDir: 'compra' | 'venda' | null = null;
      if (forceMet && viesMet) {
        if (forceDir === viesDir) {
          forceViesDir = forceDir;
        }
      } else if (forceMet) {
        forceViesDir = forceDir;
      } else if (viesMet) {
        forceViesDir = viesDir;
      }

      // 7. PVA Climax check
      let pvaMet = false;
      let pvaMsg = '';
      let pvaDir: 'compra' | 'venda' | null = null;

      if (targetSettings.alert_pva_ativo && cache.candles && cache.candles.length >= 11) {
        const prev10 = cache.candles.slice(-11, -1);
        const sumVol = prev10.reduce((acc: number, c: any) => acc + (Number(c.volume) || 0), 0);
        const avgVol = sumVol / 10;

        let highestVolumeRange = 0;
        for (const c of prev10) {
          const vol = Number(c.volume) || 0;
          const h = Number(c.high) || 0;
          const l = Number(c.low) || 0;
          const range = vol * (h - l);
          if (range > highestVolumeRange) {
            highestVolumeRange = range;
          }
        }

        const currentCandle = cache.candles[cache.candles.length - 1];
        const currentVol = Number(currentCandle.volume) || 0;
        const currentHigh = Number(currentCandle.high) || 0;
        const currentLow = Number(currentCandle.low) || 0;
        const currentClose = Number(currentCandle.close) || 0;
        const currentOpen = Number(currentCandle.open) || 0;
        const currentVolumeRange = currentVol * (currentHigh - currentLow);

        const isClimax = currentVol > 0 && avgVol > 0 && ((highestVolumeRange > 0 && currentVolumeRange >= highestVolumeRange) || (currentVol >= avgVol * 2.0));

        if (isClimax) {
          if (currentClose > currentOpen) {
            pvaMet = true;
            pvaDir = 'compra';
          } else if (currentClose < currentOpen) {
            pvaMet = true;
            pvaDir = 'venda';
          } else {
            pvaMet = false;
            pvaDir = null;
          }

          if (pvaMet && pvaDir) {
            pvaMsg = `PVA Clímax detectado no candle de ${pvaDir === 'compra' ? 'ALTA' : 'BAIXA'}! Volume: ${currentVol} (Média das 10 velas anteriores: ${avgVol.toFixed(0)}) | Spread Vol: ${currentVolumeRange.toFixed(0)} (Máx anterior: ${highestVolumeRange.toFixed(0)})`;
          }
        }
      }

      const triggerAlertAction = (motiveText: string, detailsText: string, alertType: string, telegramOption = false) => {
        addLog('ALERTA', `[${targetPanel.name}] ${motiveText}`, 'alerta');

        if (targetSettings.alert_sound_enabled !== false) {
          playAlertBeep(587.33, 250);
        }

        if (targetSettings.resource_chart_alerts_enabled !== false) {
          setActiveAlert({
            title: `[${targetPanel.name}] ${alertType.toUpperCase()}`,
            message: motiveText,
            detail: detailsText,
            tipo: alertType,
            panelId: targetPanel.id,
            panelName: targetPanel.name
          });
        }

        if (telegramOption && targetSettings.telegram_enabled) {
          enviarTelegramAlert(alertType.toUpperCase(), `[${targetPanel.name}] ${motiveText}`, detailsText, targetSettings, undefined, targetPanel);
        }
      };

      if (userPermissions.allow_alerts) {
        if (alertOpMode === 'logica') {
          const conditions = [
            { id: 'sentimento', active: targetSettings.alert_sent_ativo, met: sentimentMet, msg: sentimentMsg, dir: sentimentDir },
            { id: 'sentimento_micro', active: targetSettings.alert_sent_micro_ativo, met: sentimentMicroMet, msg: sentimentMicroMsg, dir: sentimentMicroDir },
            { id: 'blocktrades', active: targetSettings.alert_bt_ativo, met: blockTradeMet, msg: blockTradeMsg, dir: blockTradeDir },
            { id: 'delta', active: targetSettings.alert_delta_ativo, met: deltaMet, msg: deltaMsg, dir: deltaDir },
            { id: 'acelerometro', active: targetSettings.alert_acel_ativo, met: accelMet, msg: accelMsg, dir: accelDir },
            { id: 'nivel', active: targetSettings.alert_nivel_ativo, met: nivelMet, msg: nivelMsg, dir: null },
            { id: 'forca_vies', active: targetSettings.alert_force_ativo || targetSettings.alert_force_vies_shift, met: forceMet || viesMet, msg: forceMsg || viesMsg, dir: forceViesDir },
            { id: 'pva', active: targetSettings.alert_pva_ativo, met: pvaMet, msg: pvaMsg, dir: pvaDir }
          ];

          const activeConds = conditions.filter(c => c.active);
          const metConds = activeConds.filter(c => c.met);

          const directions = metConds
            .map(c => c.dir)
            .filter((d): d is 'compra' | 'venda' => d !== null);

          const allCompra = directions.length === 0 || directions.every(d => d === 'compra');
          const allVenda = directions.length === 0 || directions.every(d => d === 'venda');
          const directionConsistent = allCompra || allVenda;

          if (activeConds.length > 0 && metConds.length === activeConds.length && directionConsistent) {
            const maxCooldown = Math.max(...activeConds.map(c => {
              if (c.id === 'sentimento') return Number(targetSettings.alert_sent_cooldown ?? 5);
              if (c.id === 'sentimento_micro') return Number(targetSettings.alert_sent_micro_cooldown ?? 5);
              if (c.id === 'blocktrades') return Number(targetSettings.alert_bt_cooldown ?? 5);
              if (c.id === 'delta') return Number(targetSettings.alert_delta_cooldown ?? 5);
              if (c.id === 'acelerometro') return Number(targetSettings.alert_acel_cooldown ?? 5);
              if (c.id === 'nivel') return Number(targetSettings.alert_nivel_cooldown ?? 10);
              if (c.id === 'forca_vies') return Number(targetSettings.alert_force_cooldown ?? 5);
              if (c.id === 'pva') return Number(targetSettings.alert_pva_cooldown ?? 5);
              return 5;
            }));

            const lastLogicTime = logicAlertCooldownRef.current || 0;
            if (nowMs - lastLogicTime >= maxCooldown * 60 * 1000) {
              const dirLabel = directions.length === 0 ? 'NEUTRO' : (allCompra ? 'COMPRA' : 'VENDA');
              const comboMsg = `ALERTA COMBINADO (LÓGICA — ${dirLabel}): ${metConds.map(c => c.id.toUpperCase()).join(' + ')}`;
              const comboDetails = `Direção: ${dirLabel}\n` + metConds.map(c => c.msg).join('\n');
              const sendTelegram = activeConds.some(c => {
                if (c.id === 'sentimento') return targetSettings.alert_sent_telegram;
                if (c.id === 'sentimento_micro') return targetSettings.alert_sent_micro_telegram;
                if (c.id === 'blocktrades') return targetSettings.alert_bt_telegram;
                if (c.id === 'delta') return targetSettings.alert_delta_telegram;
                if (c.id === 'acelerometro') return targetSettings.alert_acel_telegram;
                if (c.id === 'nivel') return targetSettings.alert_nivel_telegram;
                if (c.id === 'forca_vies') return targetSettings.alert_force_telegram;
                if (c.id === 'pva') return targetSettings.alert_pva_telegram;
                return false;
              });

              triggerAlertAction(comboMsg, comboDetails, 'logica', sendTelegram);
              logicAlertCooldownRef.current = nowMs;
            }
          }
        } else {
          // Modo Individual
          let anyTriggered = false;

          if (sentimentMet) {
            const lastSentTime = alertCooldownsRef.current[`sentiment_${targetPanel.id}`] || 0;
            const cooldownMs = (Number(targetSettings.alert_sent_cooldown ?? 5)) * 60 * 1000;
            if (nowMs - lastSentTime >= cooldownMs) {
              triggerAlertAction(sentimentMsg, `Sentimento MACRO: ${finalData.sentiment.toFixed(1)}%`, 'sentimento', targetSettings.alert_sent_telegram);
              alertCooldownsRef.current[`sentiment_${targetPanel.id}`] = nowMs;
              anyTriggered = true;
            }
          }

          if (sentimentMicroMet) {
            const lastSentMicroTime = alertCooldownsRef.current[`sentiment_micro_${targetPanel.id}`] || 0;
            const cooldownMs = (Number(targetSettings.alert_sent_micro_cooldown ?? 5)) * 60 * 1000;
            if (nowMs - lastSentMicroTime >= cooldownMs) {
              const microVal = finalData.marketSentiment !== undefined ? finalData.marketSentiment : finalData.sentiment;
              triggerAlertAction(sentimentMicroMsg, `Sentimento MICRO: ${microVal.toFixed(1)}%`, 'sentimento_micro', targetSettings.alert_sent_micro_telegram);
              alertCooldownsRef.current[`sentiment_micro_${targetPanel.id}`] = nowMs;
              anyTriggered = true;
            }
          }

          if (blockTradeMet && highestVolumeTrade) {
            const lastBTTime = alertCooldownsRef.current[`blocktrades_${targetPanel.id}`] || 0;
            const cooldownMs = (Number(targetSettings.alert_bt_cooldown ?? 5)) * 60 * 1000;
            if (nowMs - lastBTTime >= cooldownMs) {
              triggerAlertAction(blockTradeMsg, `Volume: ${highestVolumeTrade.volume} ct\nPreço: ${highestVolumeTrade.price.toFixed(2)}\nLado: ${highestVolumeTrade.side}`, 'blocktrades', targetSettings.alert_bt_telegram);
              alertCooldownsRef.current[`blocktrades_${targetPanel.id}`] = nowMs;
              anyTriggered = true;
            }
          }

          if (deltaMet) {
            const lastDeltaTime = alertCooldownsRef.current[`delta_${targetPanel.id}`] || 0;
            const cooldownMs = (Number(targetSettings.alert_delta_cooldown ?? 5)) * 60 * 1000;
            if (nowMs - lastDeltaTime >= cooldownMs) {
              triggerAlertAction(deltaMsg, `Delta Ratio: ${finalData.deltaRatio.toFixed(2)}\nVolume Total: ${finalData.buyVolume + finalData.sellVolume}`, 'delta', targetSettings.alert_delta_telegram);
              alertCooldownsRef.current[`delta_${targetPanel.id}`] = nowMs;
              anyTriggered = true;
            }
          }

          if (accelMet) {
            const lastAcelTime = alertCooldownsRef.current[`acelerometro_${targetPanel.id}`] || 0;
            const cooldownMs = (Number(targetSettings.alert_acel_cooldown ?? 5)) * 60 * 1000;
            if (nowMs - lastAcelTime >= cooldownMs) {
              triggerAlertAction(accelMsg, `Estado Acelerômetro: ${finalData.estado}`, 'acelerometro', targetSettings.alert_acel_telegram);
              alertCooldownsRef.current[`acelerometro_${targetPanel.id}`] = nowMs;
              anyTriggered = true;
            }
          }

          if (nivelMet) {
            const lastNivelTime = alertCooldownsRef.current[`nivel_${targetPanel.id}`] || 0;
            const cooldownMs = (Number(targetSettings.alert_nivel_cooldown ?? 10)) * 60 * 1000;
            if (nowMs - lastNivelTime >= cooldownMs) {
              triggerAlertAction(nivelMsg, `Preço: ${finalData.price}`, 'nivel', targetSettings.alert_nivel_telegram);
              alertCooldownsRef.current[`nivel_${targetPanel.id}`] = nowMs;
              anyTriggered = true;
            }
          }

          if (forceMet) {
            const lastForceTime = alertCooldownsRef.current[`force_${targetPanel.id}`] || 0;
            const cooldownMs = (Number(targetSettings.alert_force_cooldown ?? 5)) * 60 * 1000;
            if (nowMs - lastForceTime >= cooldownMs) {
              triggerAlertAction(forceMsg, `Média Força de Compra: ${avgBuyForce.toFixed(1)}%`, 'force', targetSettings.alert_force_telegram);
              alertCooldownsRef.current[`force_${targetPanel.id}`] = nowMs;
              anyTriggered = true;
            }
          }

          if (viesMet) {
            const lastViesTime = alertCooldownsRef.current[`vies_${targetPanel.id}`] || 0;
            const cooldownMs = (Number(targetSettings.alert_force_cooldown ?? 5)) * 60 * 1000;
            if (nowMs - lastViesTime >= cooldownMs) {
              triggerAlertAction(viesMsg, `Viés Gamma Atual: ${currentVies}`, 'vies', targetSettings.alert_force_telegram);
              alertCooldownsRef.current[`vies_${targetPanel.id}`] = nowMs;
              anyTriggered = true;
            }
          }

          if (pvaMet) {
            const lastPvaTime = alertCooldownsRef.current[`pva_${targetPanel.id}`] || 0;
            const cooldownMs = (Number(targetSettings.alert_pva_cooldown ?? 5)) * 60 * 1000;
            if (nowMs - lastPvaTime >= cooldownMs) {
              triggerAlertAction(pvaMsg, `Alerta PVA Clímax`, 'pva', targetSettings.alert_pva_telegram);
              alertCooldownsRef.current[`pva_${targetPanel.id}`] = nowMs;
              anyTriggered = true;
            }
          }

          if (anyTriggered && aiEnabled && targetSettings.ai_trigger_mode === 'alerta') {
            executeAiCycleForPanel(targetPanel, targetSettings);
          }
        }
      }

      // ==========================================
      // AVALIAÇÃO DE ALGORITMOS DINÂMICOS (CENÁRIO A)
      // ==========================================
      const cycleEndStr = targetSettings?.global_cycle_end || settings?.global_cycle_end || '18:00:00';
      const cycleStartStr = targetSettings?.global_cycle_start || settings?.global_cycle_start || '19:00:00';
      const nowSPForPause = getSaoPauloDate();
      const padFn = (num: number) => String(num).padStart(2, '0');
      const timeStrForPause = `${padFn(nowSPForPause.getHours())}:${padFn(nowSPForPause.getMinutes())}:${padFn(nowSPForPause.getSeconds())}`;

      if (isMarketSessionPaused(timeStrForPause, cycleEndStr, cycleStartStr)) {
        return;
      }

      if (targetSettings.resource_algorithms_enabled !== false) {
        // Pool unificado de estratégias (customizadas + públicas / modelos)
        const baseStrategies = [
          ...(customStrategiesRef.current || []),
          ...(publicStrategiesRef.current || [])
        ];
        const uniqueStrategiesMap = new Map<string, CustomStrategy>();
        baseStrategies.forEach(s => {
          if (s && s.id) uniqueStrategiesMap.set(String(s.id), s);
        });
        const allKnownStrategies = Array.from(uniqueStrategiesMap.values());

        // Função de verificação se uma estratégia pertence a este painel/ativo
        const matchesPanel = (strat: CustomStrategy): boolean => {
          const stratTargetPanelId = (strat.panel_id && strat.panel_id !== 'all') 
            ? strat.panel_id 
            : (strat.risk_settings?.target_panel_id || null);
          if (!stratTargetPanelId || stratTargetPanelId === 'all') return true;

          // Confronto direto de ID e instance_id
          if (stratTargetPanelId === targetPanel.id || stratTargetPanelId === targetPanel.instance_id) return true;

          // Confronto por nome ou símbolo (ex: 'NASDAQ', 'NQ', 'MNQ', 'WIN', 'WDO')
          const targetName = (targetPanel.name || '').toLowerCase();
          const targetSymbol = (targetPanel.symbol || '').toLowerCase();
          const targetGammaSymbol = (targetPanel.gamma_symbol || '').toLowerCase();
          const stratTargetNorm = stratTargetPanelId.toLowerCase();

          if (targetName === stratTargetNorm || targetSymbol === stratTargetNorm || targetGammaSymbol === stratTargetNorm) return true;

          const stratPanel = panels.find(p => p.id === stratTargetPanelId || p.instance_id === stratTargetPanelId || p.name?.toLowerCase() === stratTargetNorm);
          if (stratPanel) {
            return stratPanel.id === targetPanel.id || stratPanel.instance_id === targetPanel.instance_id;
          }

          return false;
        };

        const currentAccountStrategies = (accountStrategiesRef.current && accountStrategiesRef.current.length > 0) ? accountStrategiesRef.current : (accountStrategies || []);
        const currentAccounts = (accountsRef.current && accountsRef.current.length > 0) ? accountsRef.current : (accounts || []);
        const currentPrompts = (promptsRef.current && promptsRef.current.length > 0) ? promptsRef.current : (prompts || []);
        const currentPausedIds = pausedStrategyIdsRef.current || pausedStrategyIds || [];

        // MAPEAR ALGORITMOS ATIVOS:
        // Conforme a regra de Account Binding (AGENTS.md / GEMINI.md):
        // Um algoritmo é executado se:
        // 1. Não está explicitamente pausado pelo usuário em currentPausedIds
        // 2. Pertence ao painel atual (ou 'all')
        // 3. E possui VÍNCULO ATIVO:
        //    a) Vinculação direta em Conta ATIVA na Gestão de Contas (com rota habilitada is_enabled !== false), OU
        //    b) Vinculação via Prompt IA que possua conta ativa vinculada (com rota habilitada), OU
        //    c) Vinculação via Prompt IA ativo no PILOT do painel com IA ativa, OU
        //    d) Acionador da IA do painel (ai_trigger_mode === 'strategy' e ai_trigger_strategy_id === strat.id), OU
        //    e) Marcado como active === true no construtor de estratégias e associado a uma conta ativa.
        const activeStrats = allKnownStrategies.filter(strat => {
          if (!strat || !strat.id) return false;
          if (currentPausedIds.includes(strat.id)) return false;
          if (!matchesPanel(strat)) return false;

          const isActiveOnPanel = strat.active !== false && (strat as any).is_active !== false && (strat as any).is_enabled !== false;

          // 1. Vinculação direta como Robô em Contas Ativas (EXCLUSIVO para algoritmos Ativos / No Painel)
          // Roda em 1º e 2º plano para TODAS as contas ativas vinculadas, independente do gráfico/conta selecionados na tela!
          if (isActiveOnPanel) {
            const linkedRoutesForAlgo = currentAccountStrategies.filter(
              (s: AccountStrategy) => s.manual_strategy_id === strat.id && s.is_enabled !== false
            );
            const hasDirectLinkedAccounts = currentAccounts.some((acc: BrokerAccount) =>
              acc.is_active !== false && linkedRoutesForAlgo.some((r: AccountStrategy) => r.account_id === acc.id)
            );
            if (hasDirectLinkedAccounts) return true;
          }

          // 2. Vinculação via Prompts IA (Permite algoritmos Ativos e Ocultos como gatilho!)
          const linkedPromptsForAlgo = currentPrompts.filter(p => {
            if (!p.trigger_strategy_id) return false;
            if (p.trigger_strategy_id === strat.id) return true;
            const linkedStrat = allKnownStrategies.find(s => s.id === p.trigger_strategy_id);
            return linkedStrat ? linkedStrat.name.trim().toLowerCase() === strat.name.trim().toLowerCase() : false;
          });

          if (linkedPromptsForAlgo.length > 0) {
            // 2a. Prompts Geradores de Sinais (prompt_type === 'signal_generator') vinculados na Gestão de Contas:
            // Rodam 100% em 2º plano para QUALQUER conta ativa vinculada e habilitada, independente do ativo/conta no gráfico e independente do Copilot!
            const hasSignalGeneratorActiveAccount = linkedPromptsForAlgo.some(p =>
              p.prompt_type === 'signal_generator' &&
              currentAccountStrategies.some((s: AccountStrategy) =>
                s.prompt_id === p.id &&
                s.is_enabled !== false &&
                currentAccounts.some(a => a.id === s.account_id && a.is_active !== false)
              )
            );
            if (hasSignalGeneratorActiveAccount) return true;
          }

          // 3. Gatilho de Copilot do Gráfico (ai_trigger_strategy_id ou Prompt de Contexto do Copilot):
          // Só executa se o Ciclo Geral do Copilot estiver ATIVO e o painel/conta corresponderem ao gráfico ativo
          const isCopilotActiveHere = Boolean(aiEnabledRef.current && activePanelRef.current?.id === targetPanel.id);
          if (isCopilotActiveHere) {
            if (targetSettings.ai_trigger_mode === 'strategy' && targetSettings.ai_trigger_strategy_id === strat.id) {
              return true;
            }

            if (linkedPromptsForAlgo.length > 0) {
              const currentChartAcc = activeAccountRef.current;
              const hasLinkedActiveChartAcc = Boolean(
                currentChartAcc &&
                currentChartAcc.is_active !== false &&
                linkedPromptsForAlgo.some(p =>
                  p.prompt_type !== 'signal_generator' &&
                  currentAccountStrategies.some((s: AccountStrategy) =>
                    s.account_id === currentChartAcc.id && s.prompt_id === p.id && s.is_enabled !== false
                  )
                )
              );
              if (hasLinkedActiveChartAcc) return true;
            }
          }

          return false;
        });

        const isTargetActivePanel = targetPanel.id === activePanelRef.current?.id;
        const effectiveCandles = (cache.candles && cache.candles.length >= 10) 
          ? cache.candles 
          : ((targetPanel.candles && targetPanel.candles.length >= 10)
              ? targetPanel.candles
              : (isTargetActivePanel && candles && candles.length >= 10 ? candles : []));

        if (effectiveCandles.length >= 10 && (!cache.candles || cache.candles.length < 10)) {
          cache.candles = effectiveCandles;
        }

        if (activeStrats.length > 0 && effectiveCandles.length >= 10) {
          const currentPrice = parseNumericValue(finalData.price) || 0;

          // Classificador de custo computacional por indicador/fonte (Nível 1 = O(1) instantâneo -> Nível 4 = estrutural/complexo)
          const getSingleKeyComplexity = (rawKey: string, subSeries?: string): number => {
            if (!rawKey) return 1;
            let k = String(rawKey).trim();
            let sub = String(subSeries || '').toLowerCase().trim();
            if (LEGACY_INDICATOR_MAP[k]) {
              const leg = LEGACY_INDICATOR_MAP[k];
              k = leg.indicatorId;
              if (leg.subSeries && !sub) sub = String(leg.subSeries).toLowerCase().trim();
            }
            const norm = k.toLowerCase();

            // Nível 1: Leitura direta O(1) de preço, candle atual/anterior, padrões de candle, fluxo em memória e níveis Gamma estáticos
            if (
              ['price', 'preco', 'close', 'fechamento', 'candle_open', 'candle_high', 'candle_low', 'candle_close', 'candle_size', 'candle_body',
               'pattern_pinbar', 'pattern_engolfo', 'pattern_180', 'pattern_star3', 'pattern_chute',
               'sentiment', 'market_sentiment', 'sentiment_macro', 'sentiment_micro', 'delta', 'deltaratio', 'atrratio', 'printspersecond',
               'buyvolume', 'sellvolume', 'estado', 'blocktrades_volume', 'blocktrades_side', 'gamma_bias', 'buy_strength', 'sell_strength',
               'levels_gamma', 'levels_options', 'levels_daily', 'levels_liquidity', 'gammalevels', 'levels_session_percent',
               'forca_momentum', 'elliottwaves', 'elliott_waves'].includes(norm) ||
              norm.startsWith('gamma_') ||
              norm.startsWith('momentum_forca')
            ) {
              return 1;
            }

            // Nível 2: Cálculos rápidos de janela curta / médias simples / notícias / suporte e resistência
            if (
              ['pva', 'noticia_impacto', 'noticia_minutos', 'noticia_pais',
               'nearest_resistance', 'nearest_support', 'distance_to_resistance', 'distance_to_support',
               'sma', 'sma8', 'sma20', 'sma50', 'ema', 'zscore', 'vwap', 'levels_time_range', 'smc_ob',
               'smc_range_filter', 'order_block_range', 'smc_ob_range', 'ma_cloud_filter', 'macloud_filter', 'ma_cloud', 'macloud',
               'dist_sma8_sma20', 'dist_sma20_sma50', 'dist_price_sma8', 'dist_price_sma20', 'dist_price_sma50'].includes(norm) ||
              norm.startsWith('sma_') || norm.startsWith('ema_')
            ) {
              return 2;
            }

            // Nível 4: Cálculos pesados (Divergências, SMC BOS/CHoCH, Volume Spike Pivots, Volume Profile / HVN)
            if (
              (norm === 'macd' && (sub.includes('divergence') || sub.includes('divergencia'))) ||
              norm === 'smc_bos_choch' ||
              ['volume_spike_pivots', 'spike_pivots', 'volume_spike', 'spike',
               'nearest_buy_level', 'nearest_sell_level', 'recent_buy_level', 'recent_sell_level',
               'dist_buy_level', 'dist_sell_level', 'active_buy_count', 'active_sell_count', 'spike_status', 'touch_buy', 'touch_sell',
               'volume_levels', 'volume_hvn_blocks', 'hvn_blocks', 'hvn', 'vpoc', 'vah', 'val_level', 'naked_pocs', 'naked_poc1', 'naked_poc2', 'naked_poc3'].includes(norm) ||
              norm.startsWith('spike_') || norm.startsWith('hvn')
            ) {
              return 4;
            }

            // Nível 3: Indicadores técnicos multi-séries intermediários (RSI, MACD padrão, EMACD, Bollinger, TMA, Supertrend, FVG)
            return 3;
          };

          const getConditionComplexityScore = (cond: any): number => {
            if (!cond) return 1;
            const srcKey = cond.source || cond.indicator || '';
            const srcSub = cond.source_subSeries || cond.subSeries || '';
            let score = getSingleKeyComplexity(srcKey, srcSub);

            const isTargetInd = cond.target_type === 'indicator' || Boolean(cond.target_indicator);
            if (isTargetInd) {
              const tgtKey = cond.target_indicator || cond.target_value || cond.target || '';
              const tgtSub = cond.target_subSeries || '';
              score += getSingleKeyComplexity(tgtKey, tgtSub);
            }

            const opRaw = String(cond.operator || cond.comparator || cond.op || '').toLowerCase();
            if (opRaw.includes('cross') || opRaw.includes('cruz')) {
              score += 0.5; // Cruzamento avalia barra atual + anterior
            }
            return score;
          };

          const getStrategyComplexityScore = (s: CustomStrategy): number => {
            const bStages = normalizeStrategyStages(s.buy_stages || s.buy_conditions, 'buy');
            const sStages = normalizeStrategyStages(s.sell_stages || s.sell_conditions, 'sell');
            let total = 0;
            for (const st of [...bStages, ...sStages]) {
              for (const c of (st.conditions || [])) {
                total += getConditionComplexityScore(c);
              }
            }
            return total;
          };

          // Ordenar algoritmos ativos por prioridade:
          // 1º) Barra Fechada primeiro (verificação instantânea O(1) quando a barra está em formação)
          // 2º) Menor complexidade computacional primeiro (alivia a CPU executando cálculos rápidos antes dos complexos)
          const prioritizedStrats = activeStrats.length > 1
            ? [...activeStrats].sort((a, b) => {
                const aClosed = a.execution_mode !== 'realtime' ? 0 : 1;
                const bClosed = b.execution_mode !== 'realtime' ? 0 : 1;
                if (aClosed !== bClosed) return aClosed - bClosed;
                return getStrategyComplexityScore(a) - getStrategyComplexityScore(b);
              })
            : activeStrats;

          // Caches compartilhados no ciclo para evitar recálculos entre estratégias de mesmo Timeframe e Modo
          const tfCandlesCache = new Map<number, Candle[]>();
          const tfEvalContextCache = new Map<string, {
            candlesToCalc: Candle[];
            prevCandlesToCalc: Candle[];
            closeList: { close: number }[] | null;
            registry: Record<string, any>;
            registryPrev: Record<string, any>;
            indicatorMemo: Map<string, { val: any; num: number | null }>;
            loadedGroups: Record<string, boolean>;
            evalPrice: number;
            prevPrice: number;
            lastCandle: Candle;
            prevCandle: Candle | null;
          }>();

          const forcesMapShared: Record<string, number> = { 'momentum_forca_total': avgBuyForce };
          finalForces.forEach(f => {
            const key = `momentum_forca_${f.symbol.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
            forcesMapShared[key] = Number(f.buy) || 50;
          });
          const gBiasShared = currentVies.toLowerCase();

          // Avaliar cada estratégia ativa na ordem de prioridade
          for (const strat of prioritizedStrats) {
            if (!strat.id) continue;

            const stratTf = strat.timeframe || 1;
            const isClosedBarMode = strat.execution_mode !== 'realtime'; // Padrão constitucional: Barra Fechada (a menos que explicitamente 'realtime')

            // 1. Obter velas do Timeframe (com cache por Timeframe; para TF=1 usa referência direta O(1))
            let cachedTfCandles: Candle[] | undefined = tfCandlesCache.get(stratTf);
            if (!cachedTfCandles) {
              const baseCandles: Candle[] = (effectiveCandles || []) as Candle[];
              cachedTfCandles = (stratTf <= 1 ? baseCandles : aggregateCandles(baseCandles, stratTf)) || [];
              tfCandlesCache.set(stratTf, cachedTfCandles);
            }
            const candlesForTf: Candle[] = cachedTfCandles || [];
            if (candlesForTf.length === 0) continue;

            // =========================================================================
            // PRIORIDADE ZERO (1º E 2º PLANO): VERIFICAÇÃO IMEDIATA DE BARRA FECHADA
            // Se o algoritmo trabalha em Barra Fechada, a PRIMEIRA checagem é se a vela
            // fechada consolidada já foi avaliada. Se a barra atual ainda estiver em
            // formação, aborta IMEDIATAMENTE (O(1)) sem disparar indicadores nem lógicas!
            // =========================================================================
            if (isClosedBarMode && candlesForTf.length < 2) continue;

            const offset = isClosedBarMode ? 2 : 1;
            const targetCandle = candlesForTf[candlesForTf.length - offset];
            if (!targetCandle) continue;

            const targetCandleTime = targetCandle.timestamp || (targetCandle as any).time;
            const closedEvalKey = `closed_${strat.id}_${targetPanel.id}`;

            if (isClosedBarMode) {
              if (lastEvaluatedClosedCandleRef.current[closedEvalKey] === targetCandleTime) {
                continue;
              }
            } else {
              // Modo Barra Corrente (realtime): verifica cooldown de segurança imediatamente em O(1)
              const lastActionTime = alertCooldownsRef.current[`strat_${strat.id}`] || 0;
              if (Date.now() - lastActionTime < 60 * 1000) continue;
            }

            // 2. Validação Prévia de Janelas Operacionais (Sessões):
            // Se nenhum horário estiver configurado (sessions vazio ou desativado), isTimeInSessions retorna true (todos os horários).
            // Se estiver fora do horário configurado, aborta antes de acionar qualquer indicador!
            let inSession = isTimeInSessions(timeStrForPause, strat.sessions);
            if (!inSession && isClosedBarMode && targetCandle && targetCandle.timestamp) {
              const closedTimeStr = formatSaoPauloTime(targetCandle.timestamp, true);
              inSession = isTimeInSessions(closedTimeStr, strat.sessions);
            }
            if (!inSession) {
              continue;
            }

            // 3. Contexto de Avaliação Lazy (Sob Demanda) Compartilhado por Timeframe + Modo
            // Indicadores técnicos e estruturais SÓ são calculados quando solicitados por uma condição do algoritmo!
            const ctxKey = `${stratTf}_${isClosedBarMode ? 'closed' : 'realtime'}`;
            let evalCtx = tfEvalContextCache.get(ctxKey);

            if (!evalCtx) {
              let candlesToCalcInit: Candle[] = [];
              if (isClosedBarMode) {
                candlesToCalcInit = candlesForTf.slice(0, -1);
              } else {
                candlesToCalcInit = candlesForTf.map((c: any, idx: number) => {
                  if (idx === candlesForTf!.length - 1 && currentPrice > 0) {
                    const h = Math.max(Number(c.high || c.open), currentPrice);
                    const l = Number(c.low) > 0 ? Math.min(Number(c.low), currentPrice) : currentPrice;
                    return { ...c, close: currentPrice, high: h, low: l };
                  }
                  return c;
                });
              }
              if (candlesToCalcInit.length === 0) continue;

              const prevCandlesToCalcInit = candlesToCalcInit.length > 1 ? candlesToCalcInit.slice(0, -1) : candlesToCalcInit;
              const lastCandleInit = targetCandle;
              const prevCandleInit = candlesForTf.length >= offset + 1 ? candlesForTf[candlesForTf.length - (offset + 1)] : null;

              let lastCandleHigh = Number(lastCandleInit.high);
              let lastCandleLow = Number(lastCandleInit.low);
              let lastCandleClose = Number(lastCandleInit.close);
              let lastCandleOpen = Number(lastCandleInit.open);

              if (!isClosedBarMode && currentPrice > 0) {
                lastCandleClose = currentPrice;
                lastCandleHigh = Math.max(lastCandleHigh, currentPrice);
                lastCandleLow = lastCandleLow > 0 ? Math.min(lastCandleLow, currentPrice) : currentPrice;
              }

              const lastCandleSize = Math.max(0, lastCandleHigh - lastCandleLow);
              const lastCandleBody = Math.abs(lastCandleClose - lastCandleOpen);
              const evalPriceInit = isClosedBarMode ? lastCandleClose : currentPrice;
              const prevPriceInit = prevCandleInit ? Number(prevCandleInit.close) : (isClosedBarMode ? lastCandleClose : currentPrice);
              const prevCandleSize = prevCandleInit ? Math.max(0, Number(prevCandleInit.high) - Number(prevCandleInit.low)) : 0;
              const prevCandleBody = prevCandleInit ? Math.abs(Number(prevCandleInit.close) - Number(prevCandleInit.open)) : 0;

              // Padrões de Candle O(1) (apenas leitura das últimas 3 velas)
              let pinbarPattern = 'neutro';
              let engulfingPattern = 'neutro';
              let pattern180 = 'neutro';

              const isLastBullish = lastCandleClose > lastCandleOpen;
              const isLastBearish = lastCandleClose < lastCandleOpen;

              const range = lastCandleHigh - lastCandleLow;
              if (range > 0) {
                const lowerWick = Math.min(lastCandleOpen, lastCandleClose) - lastCandleLow;
                const upperWick = lastCandleHigh - Math.max(lastCandleOpen, lastCandleClose);
                if (isLastBullish && lowerWick / range >= 0.55) {
                  pinbarPattern = 'compra';
                } else if (isLastBearish && upperWick / range >= 0.55) {
                  pinbarPattern = 'venda';
                }
              }

              if (prevCandleInit) {
                const lClose = lastCandleClose;
                const pOpen = Number(prevCandleInit.open);
                const pClose = Number(prevCandleInit.close);
                const lHigh = lastCandleHigh;
                const lLow = lastCandleLow;
                const pHigh = Number(prevCandleInit.high);
                const pLow = Number(prevCandleInit.low);

                const isPrevBullish = pClose > pOpen;
                const isPrevBearish = pClose < pOpen;

                if (lHigh > pHigh && lLow < pLow) {
                  if (isLastBullish) {
                    engulfingPattern = 'compra';
                  } else if (isLastBearish) {
                    engulfingPattern = 'venda';
                  }
                }

                const meetsSize80 = prevCandleSize > 0 ? (lastCandleSize >= prevCandleSize * 0.80) : true;
                if (isPrevBearish && isLastBullish) {
                  if (lClose >= pOpen && meetsSize80) pattern180 = 'compra';
                } else if (isPrevBullish && isLastBearish) {
                  if (lClose <= pOpen && meetsSize80) pattern180 = 'venda';
                }
              }

              let star3Pattern = 'neutro';
              const prev2Candle = candlesForTf.length >= offset + 2 ? candlesForTf[candlesForTf.length - (offset + 2)] : null;
              if (prevCandleInit && prev2Candle) {
                const c1Close = lastCandleClose, c1Open = lastCandleOpen, c1High = lastCandleHigh, c1Low = lastCandleLow;
                const c2Close = Number(prevCandleInit.close), c2Open = Number(prevCandleInit.open), c2High = Number(prevCandleInit.high), c2Low = Number(prevCandleInit.low);
                const c3Close = Number(prev2Candle.close), c3Open = Number(prev2Candle.open), c3High = Number(prev2Candle.high), c3Low = Number(prev2Candle.low);

                const isC1Bull = c1Close > c1Open;
                const isC1Bear = c1Close < c1Open;
                const isC2Bull = c2Close > c2Open;
                const isC2Bear = c2Close < c2Open;
                const isC3Bull = c3Close > c3Open;
                const isC3Bear = c3Close < c3Open;
                const mid3 = (c3High + c3Low) / 2;

                if (isC3Bear && isC2Bear && isC1Bull && c2Low < c3Low && c1High > c2High && c1Low < c2Low && c1Close > c2Close && c1High <= mid3) {
                  star3Pattern = 'compra';
                } else if (isC3Bull && isC2Bull && isC1Bear && c2High > c3High && c1High > c2High && c1Low < c2Low && c1Close < c2Close && c1Low >= mid3) {
                  star3Pattern = 'venda';
                }
              }

              let chutePattern = 'neutro';
              if (prevCandleInit) {
                const c1Open = lastCandleOpen, c1Close = lastCandleClose, c1High = lastCandleHigh, c1Low = lastCandleLow;
                const c2Open = Number(prevCandleInit.open), c2Close = Number(prevCandleInit.close), c2High = Number(prevCandleInit.high), c2Low = Number(prevCandleInit.low);

                const isC1Bull = c1Close > c1Open;
                const isC1Bear = c1Close < c1Open;
                const isC2Bull = c2Close > c2Open;
                const isC2Bear = c2Close < c2Open;

                const b1 = Math.abs(c1Close - c1Open);
                const b2 = Math.abs(c2Close - c2Open);
                const r1 = c1High - c1Low;
                const r2 = c2High - c2Low;
                const wicks1 = r1 - b1;
                const wicks2 = r2 - b2;

                const isMarubozu1 = b1 > 0 && (wicks1 / b1) <= 0.30;
                const isMarubozu2 = b2 > 0 && (wicks2 / b2) <= 0.30;

                if (isMarubozu1 && isMarubozu2) {
                  if (isC2Bear && isC1Bull && (c1Low > c2High || c1Open > c2Open)) {
                    chutePattern = 'compra';
                  } else if (isC2Bull && isC1Bear && (c1High < c2Low || c1Open < c2Open)) {
                    chutePattern = 'venda';
                  }
                }
              }

              const btLastSide = finalData.blockTrades && finalData.blockTrades.length > 0 ? finalData.blockTrades[finalData.blockTrades.length - 1].side.toLowerCase() : 'neutro';
              const btLastVol = finalData.blockTrades && finalData.blockTrades.length > 0 ? Number(finalData.blockTrades[finalData.blockTrades.length - 1].volume) : 0;

              const regInit: Record<string, any> = {
                'price': evalPriceInit,
                'sentiment': Number(finalData.sentiment),
                'sentiment_macro': Number(finalData.sentiment),
                'market_sentiment': Number(finalData.marketSentiment !== undefined ? finalData.marketSentiment : finalData.sentiment),
                'sentiment_micro': Number(finalData.marketSentiment !== undefined ? finalData.marketSentiment : finalData.sentiment),
                'delta': Number(finalData.delta),
                'deltaRatio': Number(finalData.deltaRatio),
                'zScore': Number(finalData.zScore),
                'atrRatio': Number(finalData.atrRatio),
                'printsPerSecond': Number(finalData.printsPerSecond),
                'buyVolume': Number(finalData.buyVolume),
                'sellVolume': Number(finalData.sellVolume),
                'estado': String(finalData.estado || 'AGUARDANDO').toUpperCase(),
                'blockTrades_volume': btLastVol,
                'blockTrades_side': btLastSide,
                'blocktrades_side': btLastSide,
                'gamma_bias': gBiasShared,
                'candle_size': lastCandleSize,
                'candle_body': lastCandleBody,
                'pattern_pinbar': pinbarPattern,
                'pattern_engolfo': engulfingPattern,
                'pattern_180': pattern180,
                'pattern_star3': star3Pattern,
                'pattern_chute': chutePattern,
                'candle_open': lastCandleOpen,
                'candle_high': lastCandleHigh,
                'candle_low': lastCandleLow,
                'candle_close': lastCandleClose,
                ...forcesMapShared
              };

              const regPrevInit: Record<string, any> = {
                'price': prevPriceInit,
                'sentiment': Number(finalData.sentiment),
                'sentiment_macro': Number(finalData.sentiment),
                'market_sentiment': Number(finalData.marketSentiment !== undefined ? finalData.marketSentiment : finalData.sentiment),
                'sentiment_micro': Number(finalData.marketSentiment !== undefined ? finalData.marketSentiment : finalData.sentiment),
                'delta': Number(finalData.delta),
                'deltaRatio': Number(finalData.deltaRatio),
                'zScore': Number(finalData.zScore),
                'atrRatio': Number(finalData.atrRatio),
                'printsPerSecond': Number(finalData.printsPerSecond),
                'buyVolume': Number(finalData.buyVolume),
                'sellVolume': Number(finalData.sellVolume),
                'estado': String(finalData.estado || 'AGUARDANDO').toUpperCase(),
                'blockTrades_volume': btLastVol,
                'blockTrades_side': btLastSide,
                'blocktrades_side': btLastSide,
                'gamma_bias': gBiasShared,
                'pattern_pinbar': 'neutro',
                'pattern_engolfo': 'neutro',
                'pattern_180': 'neutro',
                'pattern_star3': 'neutro',
                'pattern_chute': 'neutro',
                'candle_open': prevCandleInit ? Number(prevCandleInit.open) : 0,
                'candle_high': prevCandleInit ? Number(prevCandleInit.high) : 0,
                'candle_low': prevCandleInit ? Number(prevCandleInit.low) : 0,
                'candle_close': prevCandleInit ? Number(prevCandleInit.close) : 0,
                'candle_size': prevCandleSize,
                'candle_body': prevCandleBody,
                ...forcesMapShared
              };

              evalCtx = {
                candlesToCalc: candlesToCalcInit,
                prevCandlesToCalc: prevCandlesToCalcInit,
                closeList: null,
                registry: regInit,
                registryPrev: regPrevInit,
                indicatorMemo: new Map(),
                loadedGroups: {},
                evalPrice: evalPriceInit,
                prevPrice: prevPriceInit,
                lastCandle: lastCandleInit,
                prevCandle: prevCandleInit
              };
              tfEvalContextCache.set(ctxKey, evalCtx);
            }

            const {
              candlesToCalc,
              prevCandlesToCalc,
              registry,
              registryPrev,
              indicatorMemo,
              loadedGroups,
              evalPrice,
              prevPrice,
              lastCandle,
              prevCandle
            } = evalCtx;

            const getCloseList = () => {
              if (!evalCtx!.closeList) {
                evalCtx!.closeList = candlesToCalc.map((c: any) => ({ close: Number(c.close || 0) }));
              }
              return evalCtx!.closeList;
            };

            // =========================================================================
            // CARREGADORES SOB DEMANDA (LAZY LOADERS):
            // Cada família de indicador só é calculada SE o algoritmo possuir uma
            // condição que a consulte, e apenas uma única vez por ciclo/timeframe!
            // =========================================================================
            const ensureGammaAndSR = () => {
              if (loadedGroups.gammaSR) return;
              loadedGroups.gammaSR = true;

              let effectiveLevels: any = levels ? { ...levels } : null;
              if (!effectiveLevels && candlesToCalc.length >= 5) {
                const sysStart = targetSettings?.global_cycle_start || settings?.global_cycle_start || '20:00:00';
                const sessionsMap = new Map<string, { high: number; low: number; close: number }[]>();
                const sessionKeysOrder: string[] = [];
                for (let i = 0; i < candlesToCalc.length; i++) {
                  const c: any = candlesToCalc[i];
                  const sKey = getTradingSessionKey(c.time || c.timestamp, sysStart);
                  if (!sessionsMap.has(sKey)) {
                    sessionsMap.set(sKey, []);
                    sessionKeysOrder.push(sKey);
                  }
                  sessionsMap.get(sKey)!.push({
                    high: Number(c.high ?? c.close ?? 0),
                    low: Number(c.low ?? c.close ?? 0),
                    close: Number(c.close ?? 0)
                  });
                }
                const prevKey = sessionKeysOrder.length >= 2 ? sessionKeysOrder[sessionKeysOrder.length - 2] : sessionKeysOrder[0];
                const prevCandles = prevKey ? (sessionsMap.get(prevKey) || []) : [];
                if (prevCandles.length > 0) {
                  let pH = -Infinity;
                  let pL = Infinity;
                  for (const pc of prevCandles) {
                    if (pc.high > pH) pH = pc.high;
                    if (pc.low < pL) pL = pc.low;
                  }
                  const pClose = prevCandles[prevCandles.length - 1].close;
                  const diff = (pH !== -Infinity && pL !== Infinity && pH > pL) ? (pH - pL) : (pClose > 0 ? pClose * 0.01 : 100);

                  effectiveLevels = {
                    hvl: ((pH + pL + pClose) / 3).toFixed(2),
                    gwall: (pH + diff * 0.382).toFixed(2),
                    hvl0: (((pClose + (pH + pL) / 2) / 2)).toFixed(2),
                    call: pH.toFixed(2),
                    put: pL.toFixed(2),
                    call0: (pClose + diff * 0.236).toFixed(2),
                    put0: (pClose - diff * 0.236).toFixed(2),
                    max1d: (pClose + diff).toFixed(2),
                    min1d: (pClose - diff).toFixed(2),
                    prev: pClose.toFixed(2),
                    prevH: pH.toFixed(2),
                    prevL: pL.toFixed(2)
                  };
                }
              }

              const curSR = computeDynamicSupportResistance(evalPrice, effectiveLevels);
              const prevSR = computeDynamicSupportResistance(prevPrice, effectiveLevels);

              const populateGamma = (reg: Record<string, any>, sr: any) => {
                reg['gamma_max1d'] = effectiveLevels ? Number(effectiveLevels.max1d || 0) : 0;
                reg['gamma_min1d'] = effectiveLevels ? Number(effectiveLevels.min1d || 0) : 0;
                reg['gamma_prev'] = effectiveLevels ? Number(effectiveLevels.prev || 0) : 0;
                reg['gamma_prevH'] = effectiveLevels ? Number(effectiveLevels.prevH || 0) : 0;
                reg['gamma_prevL'] = effectiveLevels ? Number(effectiveLevels.prevL || 0) : 0;
                reg['gamma_hvl'] = effectiveLevels ? Number(effectiveLevels.hvl || 0) : 0;
                reg['gamma_gwall'] = effectiveLevels ? Number(effectiveLevels.gwall || 0) : 0;
                reg['gamma_hvl0'] = effectiveLevels ? Number(effectiveLevels.hvl0 || 0) : 0;
                reg['gamma_call'] = effectiveLevels ? Number(effectiveLevels.call || 0) : 0;
                reg['gamma_put'] = effectiveLevels ? Number(effectiveLevels.put || 0) : 0;
                reg['gamma_call0'] = effectiveLevels ? Number(effectiveLevels.call0 || 0) : 0;
                reg['gamma_put0'] = effectiveLevels ? Number(effectiveLevels.put0 || 0) : 0;
                reg['buy_strength'] = effectiveLevels ? Number(effectiveLevels.buy_strength || 0) : 0;
                reg['sell_strength'] = effectiveLevels ? Number(effectiveLevels.sell_strength || 0) : 0;
                reg['nearest_resistance'] = sr.nearestResistance;
                reg['nearest_support'] = sr.nearestSupport;
                reg['distance_to_resistance'] = sr.distanceToResistance;
                reg['distance_to_support'] = sr.distanceToSupport;
                if (levels?.bl && Array.isArray(levels.bl)) {
                  for (let i = 0; i < Math.min(10, levels.bl.length); i++) {
                    reg[`gamma_bl${i + 1}`] = Number(levels.bl[i] || 0);
                  }
                }
                if (levels?.gex && Array.isArray(levels.gex)) {
                  for (let i = 0; i < Math.min(10, levels.gex.length); i++) {
                    reg[`gamma_gex${i + 1}`] = Number(levels.gex[i] || 0);
                  }
                }
              };
              populateGamma(registry, curSR);
              populateGamma(registryPrev, prevSR);
            };

            const ensureLegacySMAs = () => {
              if (loadedGroups.legacySMAs) return;
              loadedGroups.legacySMAs = true;
              const cl = getCloseList();
              const sma8Values = calculateSMA(cl, 8);
              const sma20Values = calculateSMA(cl, 20);
              const sma50Values = calculateSMA(cl, 50);

              const lastSma8 = sma8Values[sma8Values.length - 1] || 0;
              const lastSma20 = sma20Values[sma20Values.length - 1] || 0;
              const lastSma50 = sma50Values[sma50Values.length - 1] || 0;
              const prevSma8 = sma8Values.length >= 2 ? sma8Values[sma8Values.length - 2] : 0;
              const prevSma20 = sma20Values.length >= 2 ? sma20Values[sma20Values.length - 2] : 0;
              const prevSma50 = sma50Values.length >= 2 ? sma50Values[sma50Values.length - 2] : 0;

              registry['sma8'] = lastSma8;
              registry['sma20'] = lastSma20;
              registry['sma50'] = lastSma50;
              registry['dist_sma8_sma20'] = Math.abs(lastSma8 - lastSma20);
              registry['dist_sma20_sma50'] = Math.abs(lastSma20 - lastSma50);
              registry['dist_price_sma8'] = Math.abs(evalPrice - lastSma8);
              registry['dist_price_sma20'] = Math.abs(evalPrice - lastSma20);
              registry['dist_price_sma50'] = Math.abs(evalPrice - lastSma50);

              registryPrev['sma8'] = prevSma8;
              registryPrev['sma20'] = prevSma20;
              registryPrev['sma50'] = prevSma50;
              registryPrev['dist_sma8_sma20'] = Math.abs(prevSma8 - prevSma20);
              registryPrev['dist_sma20_sma50'] = Math.abs(prevSma20 - prevSma50);
              registryPrev['dist_price_sma8'] = Math.abs(prevPrice - prevSma8);
              registryPrev['dist_price_sma20'] = Math.abs(prevPrice - prevSma20);
              registryPrev['dist_price_sma50'] = Math.abs(prevPrice - prevSma50);
            };

            const ensureLegacyMACD = () => {
              if (loadedGroups.legacyMACD) return;
              loadedGroups.legacyMACD = true;
              const macdResult = calculateMACD(getCloseList());
              registry['macd_line'] = macdResult.macd[macdResult.macd.length - 1] || 0;
              registry['macd_signal'] = macdResult.signal[macdResult.signal.length - 1] || 0;
              registry['macd_histogram'] = macdResult.histogram[macdResult.histogram.length - 1] || 0;
              registryPrev['macd_line'] = macdResult.macd.length >= 2 ? macdResult.macd[macdResult.macd.length - 2] : 0;
              registryPrev['macd_signal'] = macdResult.signal.length >= 2 ? macdResult.signal[macdResult.signal.length - 2] : 0;
              registryPrev['macd_histogram'] = macdResult.histogram.length >= 2 ? macdResult.histogram[macdResult.histogram.length - 2] : 0;
            };

            const ensureLegacyEMACD = () => {
              if (loadedGroups.legacyEMACD) return;
              loadedGroups.legacyEMACD = true;
              const emacdResult = calculateEMACD(getCloseList());
              registry['emacd_histogram'] = emacdResult.histogram[emacdResult.histogram.length - 1] || 0;
              registry['emacd_histogram_compra'] = emacdResult.histogram_compra[emacdResult.histogram_compra.length - 1] || 0;
              registry['emacd_histogram_venda'] = emacdResult.histogram_venda[emacdResult.histogram_venda.length - 1] || 0;
              registry['emacd_histogram_abs'] = emacdResult.histogram_abs[emacdResult.histogram_abs.length - 1] || 0;
              registry['emacd_explosion'] = emacdResult.explosion[emacdResult.explosion.length - 1] || 0;
              registry['emacd_deadzone'] = emacdResult.deadZone[emacdResult.deadZone.length - 1] || 20;
              registry['emacd_trend'] = emacdResult.trend[emacdResult.trend.length - 1] || 'neutro';

              registryPrev['emacd_histogram'] = emacdResult.histogram.length >= 2 ? emacdResult.histogram[emacdResult.histogram.length - 2] : 0;
              registryPrev['emacd_histogram_compra'] = emacdResult.histogram_compra.length >= 2 ? emacdResult.histogram_compra[emacdResult.histogram_compra.length - 2] : 0;
              registryPrev['emacd_histogram_venda'] = emacdResult.histogram_venda.length >= 2 ? emacdResult.histogram_venda[emacdResult.histogram_venda.length - 2] : 0;
              registryPrev['emacd_histogram_abs'] = emacdResult.histogram_abs.length >= 2 ? emacdResult.histogram_abs[emacdResult.histogram_abs.length - 2] : 0;
              registryPrev['emacd_explosion'] = emacdResult.explosion.length >= 2 ? emacdResult.explosion[emacdResult.explosion.length - 2] : 0;
              registryPrev['emacd_deadzone'] = emacdResult.deadZone.length >= 2 ? emacdResult.deadZone[emacdResult.deadZone.length - 2] : 20;
              registryPrev['emacd_trend'] = emacdResult.trend.length >= 2 ? emacdResult.trend[emacdResult.trend.length - 2] : 'neutro';
            };

            const ensureLegacyPVA = () => {
              if (loadedGroups.legacyPVA) return;
              loadedGroups.legacyPVA = true;
              let stratPvaType = 'neutro';
              const pvaTargetIdx = candlesToCalc.length - 1;
              if (pvaTargetIdx >= 10 && candlesToCalc[pvaTargetIdx]) {
                const prev10 = candlesToCalc.slice(pvaTargetIdx - 10, pvaTargetIdx);
                if (prev10.length === 10) {
                  const sumVol = prev10.reduce((acc: number, c: any) => acc + (Number(c.volume) || 0), 0);
                  const avgVol = sumVol / 10;
                  let highestVolumeRange = 0;
                  for (const c of prev10) {
                    const vol = Number(c.volume) || 0;
                    const h = Number(c.high) || 0;
                    const l = Number(c.low) || 0;
                    const rng = vol * (h - l);
                    if (rng > highestVolumeRange) highestVolumeRange = rng;
                  }
                  const currentCandle = candlesToCalc[pvaTargetIdx];
                  const currentVol = Number(currentCandle.volume) || 0;
                  const currentHigh = Number(currentCandle.high) || 0;
                  const currentLow = Number(currentCandle.low) || 0;
                  const currentClose = Number(currentCandle.close) || 0;
                  const currentOpen = Number(currentCandle.open) || 0;
                  const currentVolumeRange = currentVol * (currentHigh - currentLow);
                  const isClimax = currentVol > 0 && avgVol > 0 && ((highestVolumeRange > 0 && currentVolumeRange >= highestVolumeRange) || (currentVol >= avgVol * 2.0));
                  if (isClimax) {
                    if (currentClose > currentOpen) stratPvaType = 'compra';
                    else if (currentClose < currentOpen) stratPvaType = 'venda';
                  }
                }
              }
              registry['pva'] = stratPvaType;
              registryPrev['pva'] = stratPvaType;
            };

            const ensureLegacyNews = () => {
              if (loadedGroups.legacyNews) return;
              loadedGroups.legacyNews = true;
              const lastCandleTimestamp = lastCandle ? (lastCandle.timestamp || (lastCandle as any).time) : new Date();
              const newsStatus = getNewsStatusForTimestamp(newsRef.current, lastCandleTimestamp);
              const prevCandleTimestamp = prevCandle ? (prevCandle.timestamp || (prevCandle as any).time) : new Date();
              const newsStatusPrev = getNewsStatusForTimestamp(newsRef.current, prevCandleTimestamp);

              registry['noticia_impacto'] = newsStatus.impact;
              registry['noticia_minutos'] = newsStatus.minutesAgo;
              registry['noticia_pais'] = newsStatus.country;
              registryPrev['noticia_impacto'] = newsStatusPrev.impact;
              registryPrev['noticia_minutos'] = newsStatusPrev.minutesAgo;
              registryPrev['noticia_pais'] = newsStatusPrev.country;
            };

            const ensureLegacyFVG = () => {
              if (loadedGroups.legacyFVG) return;
              loadedGroups.legacyFVG = true;
              const fvgValues = calculateFVGs(candlesToCalc, 1, 1.0, 1, 10, false);

              const checkIndex = candlesToCalc.length - 1;
              const activeFvgs = fvgValues.filter(g => g.startIndex <= checkIndex && (g.endIndex >= checkIndex || !g.isFilled || g.endIndex === -1));
              const lastActiveFvg = activeFvgs[activeFvgs.length - 1] || null;
              const lastBuyFvg = activeFvgs.filter(g => g.isUp).pop() || null;
              const lastSellFvg = activeFvgs.filter(g => !g.isUp).pop() || null;

              registry['fvg_topo'] = lastActiveFvg ? lastActiveFvg.top : 0;
              registry['fvg_centro'] = lastActiveFvg ? lastActiveFvg.midpoint : 0;
              registry['fvg_fundo'] = lastActiveFvg ? lastActiveFvg.bottom : 0;
              registry['fvg_tamanho'] = lastActiveFvg ? lastActiveFvg.size : 0;
              registry['fvg_tipo'] = lastActiveFvg ? (lastActiveFvg.isUp ? 'compra' : 'venda') : '';
              registry['fvg_compra_topo'] = lastBuyFvg ? lastBuyFvg.top : 0;
              registry['fvg_compra_centro'] = lastBuyFvg ? lastBuyFvg.midpoint : 0;
              registry['fvg_compra_fundo'] = lastBuyFvg ? lastBuyFvg.bottom : 0;
              registry['fvg_venda_topo'] = lastSellFvg ? lastSellFvg.top : 0;
              registry['fvg_venda_centro'] = lastSellFvg ? lastSellFvg.midpoint : 0;
              registry['fvg_venda_fundo'] = lastSellFvg ? lastSellFvg.bottom : 0;

              const prevCheckIndex = candlesToCalc.length - 2;
              const prevActiveFvgs = fvgValues.filter(g => g.startIndex <= prevCheckIndex && (g.endIndex >= prevCheckIndex || !g.isFilled || g.endIndex === -1));
              const prevActiveFvg = prevActiveFvgs[prevActiveFvgs.length - 1] || null;
              const prevBuyFvg = prevActiveFvgs.filter(g => g.isUp).pop() || null;
              const prevSellFvg = prevActiveFvgs.filter(g => !g.isUp).pop() || null;

              registryPrev['fvg_topo'] = prevActiveFvg ? prevActiveFvg.top : 0;
              registryPrev['fvg_centro'] = prevActiveFvg ? prevActiveFvg.midpoint : 0;
              registryPrev['fvg_fundo'] = prevActiveFvg ? prevActiveFvg.bottom : 0;
              registryPrev['fvg_tamanho'] = prevActiveFvg ? prevActiveFvg.size : 0;
              registryPrev['fvg_tipo'] = prevActiveFvg ? (prevActiveFvg.isUp ? 'compra' : 'venda') : '';
              registryPrev['fvg_compra_topo'] = prevBuyFvg ? prevBuyFvg.top : 0;
              registryPrev['fvg_compra_centro'] = prevBuyFvg ? prevBuyFvg.midpoint : 0;
              registryPrev['fvg_compra_fundo'] = prevBuyFvg ? prevBuyFvg.bottom : 0;
              registryPrev['fvg_venda_topo'] = prevSellFvg ? prevSellFvg.top : 0;
              registryPrev['fvg_venda_centro'] = prevSellFvg ? prevSellFvg.midpoint : 0;
              registryPrev['fvg_venda_fundo'] = prevSellFvg ? prevSellFvg.bottom : 0;
            };

            const ensureLegacySpike = (forPrev: boolean) => {
              const flagKey = forPrev ? 'legacySpikePrev' : 'legacySpikeCurr';
              if (loadedGroups[flagKey]) return;
              loadedGroups[flagKey] = true;
              const hist = forPrev ? prevCandlesToCalc : candlesToCalc;
              const prc = forPrev ? prevPrice : evalPrice;
              const reg = forPrev ? registryPrev : registry;
              const spk = calculateVolumeSpikePivotsAnalysis(hist, { currentPrice: prc });

              reg['nearest_buy_level'] = spk.nearestBuyLevel;
              reg['nearest_sell_level'] = spk.nearestSellLevel;
              reg['recent_buy_level'] = spk.recentBuyLevel;
              reg['recent_sell_level'] = spk.recentSellLevel;
              reg['dist_buy_level'] = spk.distanceToNearestBuy;
              reg['dist_sell_level'] = spk.distanceToNearestSell;
              reg['active_buy_count'] = spk.activeBuyCount;
              reg['active_sell_count'] = spk.activeSellCount;
              reg['spike_status'] = spk.spikeStatus;
              reg['touch_buy'] = spk.touchBuy;
              reg['touch_sell'] = spk.touchSell;
              reg['spike_nearest_buy_level'] = spk.nearestBuyLevel;
              reg['spike_nearest_sell_level'] = spk.nearestSellLevel;
              reg['spike_recent_buy_level'] = spk.recentBuyLevel;
              reg['spike_recent_sell_level'] = spk.recentSellLevel;
              reg['spike_dist_buy_level'] = spk.distanceToNearestBuy;
              reg['spike_dist_sell_level'] = spk.distanceToNearestSell;
              reg['spike_active_buy_count'] = spk.activeBuyCount;
              reg['spike_active_sell_count'] = spk.activeSellCount;
            };

            const ensureLegacyVP = () => {
              if (loadedGroups.legacyVP) return;
              loadedGroups.legacyVP = true;
              try {
                if (candlesToCalc.length >= 3) {
                  const vpResult = calculateVolumeProfileAnalysis(candlesToCalc, {
                    sessionMode: 'all',
                    topNodesCount: 6,
                    lookbackDays: 1,
                    valueAreaPct: 70
                  });
                  if (vpResult && vpResult.levels) {
                    const populateVP = (reg: Record<string, any>) => {
                      reg['vpoc'] = vpResult.levels.poc || 0;
                      reg['vah'] = vpResult.levels.vah || 0;
                      reg['val_level'] = vpResult.levels.val || 0;
                      reg['naked_pocs'] = vpResult.levels.nakedPocs || [];
                      reg['naked_poc1'] = vpResult.levels.nakedPocs?.[0]?.price || 0;
                      reg['naked_poc2'] = vpResult.levels.nakedPocs?.[1]?.price || 0;
                      reg['naked_poc3'] = vpResult.levels.nakedPocs?.[2]?.price || 0;

                      if (Array.isArray(vpResult.hvnBlocks)) {
                        reg['hvn_blocks'] = vpResult.hvnBlocks;
                        for (let i = 0; i < Math.min(6, vpResult.hvnBlocks.length); i++) {
                          const blk = vpResult.hvnBlocks[i];
                          reg[`hvn${i + 1}_center`] = blk.priceCenter;
                          reg[`hvn${i + 1}_top`] = blk.priceTop;
                          reg[`hvn${i + 1}_bottom`] = blk.priceBottom;
                        }
                      }
                    };
                    populateVP(registry);
                    populateVP(registryPrev);
                  }
                }
              } catch (_) {}
            };

          const isStateMatching = (sourceVal: any, targetVal: any): boolean => {
            const norm = (s: any) =>
              String(s || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[_-]+/g, ' ')
                .toUpperCase()
                .trim();

            const s = norm(sourceVal);
            const t = norm(targetVal);
            if (!s || !t) return false;
            if (s === t) return true;

            // Explosão Compra
            const isTargetExplosionBuy =
              (t.includes('EXPLOSAO') || t.includes('EXPLOSION')) &&
              (t.includes('COMPRA') || t.includes('BUY') || t.includes('ALTA'));
            if (isTargetExplosionBuy) {
              return (
                (s.includes('EXPLOSAO') || s.includes('EXPLOSION')) &&
                (s.includes('COMPRA') || s.includes('BUY') || s.includes('ALTA'))
              );
            }

            // Explosão Venda
            const isTargetExplosionSell =
              (t.includes('EXPLOSAO') || t.includes('EXPLOSION')) &&
              (t.includes('VENDA') || t.includes('SELL') || t.includes('BAIXA'));
            if (isTargetExplosionSell) {
              return (
                (s.includes('EXPLOSAO') || s.includes('EXPLOSION')) &&
                (s.includes('VENDA') || s.includes('SELL') || s.includes('BAIXA'))
              );
            }

            // Exaustão de Compra / Alta (topo)
            const isTargetExhaustionBuy =
              (t.includes('EXAUSTAO') || t.includes('EXHAUSTION')) &&
              (t.includes('COMPRA') || t.includes('BUY') || t.includes('ALTA'));
            if (isTargetExhaustionBuy) {
              return (
                (s.includes('EXAUSTAO') || s.includes('EXHAUSTION')) &&
                (s.includes('COMPRA') || s.includes('BUY') || s.includes('ALTA'))
              );
            }

            // Exaustão de Venda / Baixa (fundo)
            const isTargetExhaustionSell =
              (t.includes('EXAUSTAO') || t.includes('EXHAUSTION')) &&
              (t.includes('VENDA') || t.includes('SELL') || t.includes('BAIXA'));
            if (isTargetExhaustionSell) {
              return (
                (s.includes('EXAUSTAO') || s.includes('EXHAUSTION')) &&
                (s.includes('VENDA') || s.includes('SELL') || s.includes('BAIXA'))
              );
            }

            // Compressão
            const isTargetCompression = t.includes('COMPRESSAO') || t.includes('COMPRESSION');
            if (isTargetCompression) {
              return s.includes('COMPRESSAO') || s.includes('COMPRESSION');
            }

            // Normal
            if (t === 'NORMAL') {
              return s === 'NORMAL';
            }

            // Aguardando / Neutro
            if (t === 'AGUARDANDO' || t === 'NEUTRO' || t === 'WAITING' || t === 'NEUTRAL') {
              return s === 'AGUARDANDO' || s === 'NEUTRO' || s === 'WAITING' || s === 'NEUTRAL';
            }

            // Sair
            if (t === 'SAIR' || t === 'EXIT') {
              return s === 'SAIR' || s === 'EXIT';
            }

            // Compra geral (apenas se não for exaustão)
            const isTargetBuy = t === 'COMPRA' || t === 'BUY';
            if (isTargetBuy) {
              if (s.includes('EXAUSTAO') || s.includes('EXHAUSTION')) return false;
              return s === 'COMPRA' || s === 'BUY' || s.includes('COMPRA') || s.includes('BUY');
            }

            // Venda geral (apenas se não for exaustão)
            const isTargetSell = t === 'VENDA' || t === 'SELL';
            if (isTargetSell) {
              if (s.includes('EXAUSTAO') || s.includes('EXHAUSTION')) return false;
              return s === 'VENDA' || s === 'SELL' || s.includes('VENDA') || s.includes('SELL');
            }

            return s === t;
          };

          const parseNum = (v: any): number | null => {
            if (typeof v === 'number') return isNaN(v) ? null : v;
            if (typeof v === 'string') {
              const clean = v.replace(/,/g, '.').replace(/[^\d.-]/g, '');
              const p = parseFloat(clean);
              return isNaN(p) ? null : p;
            }
            return null;
          };

          const getIndicatorVal = (condOrKey: any, isTarget: boolean, isPrev: boolean): { val: any; num: number | null } => {
            let key = '';
            let param = 0;
            let params: Record<string, any> = {};
            let subSeries = '';

            if (typeof condOrKey === 'string') {
              key = condOrKey;
            } else if (condOrKey && typeof condOrKey === 'object') {
              if (isTarget) {
                key = condOrKey.target_indicator || condOrKey.target_value || condOrKey.target || condOrKey.value || '';
                param = Number(condOrKey.target_param1 || condOrKey.target_param || condOrKey.param2 || 0);
                params = condOrKey.target_params || {};
                subSeries = condOrKey.target_subSeries || '';
              } else {
                key = condOrKey.source || condOrKey.indicator || '';
                param = Number(condOrKey.param1 || condOrKey.param || 0);
                params = condOrKey.source_params || condOrKey.params || {};
                subSeries = condOrKey.source_subSeries || condOrKey.subSeries || '';
              }
            }
            if (!key && condOrKey && typeof condOrKey === 'object') {
              key = String(isTarget ? (condOrKey.target_value || condOrKey.value || '') : (condOrKey.source || ''));
            }

            if (LEGACY_INDICATOR_MAP[key]) {
              const leg = LEGACY_INDICATOR_MAP[key];
              key = leg.indicatorId;
              if (leg.subSeries && !subSeries) subSeries = leg.subSeries;
              if (leg.params) params = { ...leg.params, ...params };
            }

            const normKey = String(key || '').toLowerCase().trim();

            // Acionar carregadores sob demanda apenas para a família de indicadores consultada
            if (
              normKey.startsWith('gamma_') ||
              ['levels_gamma', 'levels_options', 'levels_daily', 'levels_liquidity', 'gammalevels',
               'buy_strength', 'sell_strength', 'nearest_resistance', 'nearest_support',
               'distance_to_resistance', 'distance_to_support'].includes(normKey)
            ) {
              ensureGammaAndSR();
            } else if (['sma8', 'sma20', 'sma50', 'dist_sma8_sma20', 'dist_sma20_sma50', 'dist_price_sma8', 'dist_price_sma20', 'dist_price_sma50'].includes(normKey)) {
              ensureLegacySMAs();
            } else if (['macd_line', 'macd_signal', 'macd_histogram'].includes(normKey)) {
              ensureLegacyMACD();
            } else if (normKey.startsWith('emacd_')) {
              ensureLegacyEMACD();
            } else if (normKey === 'pva') {
              ensureLegacyPVA();
            } else if (normKey.startsWith('noticia_')) {
              ensureLegacyNews();
            } else if (normKey.startsWith('fvg_')) {
              ensureLegacyFVG();
            } else if (
              normKey.startsWith('spike_') ||
              ['nearest_buy_level', 'nearest_sell_level', 'recent_buy_level', 'recent_sell_level',
               'dist_buy_level', 'dist_sell_level', 'active_buy_count', 'active_sell_count',
               'spike_status', 'touch_buy', 'touch_sell'].includes(normKey)
            ) {
              ensureLegacySpike(isPrev);
            } else if (
              ['volume_levels', 'volume_hvn_blocks', 'hvn_blocks', 'hvn', 'vpoc', 'vah', 'val_level',
               'naked_pocs', 'naked_poc1', 'naked_poc2', 'naked_poc3'].includes(normKey) ||
              normKey.startsWith('hvn')
            ) {
              ensureLegacyVP();
            }

            // Verificar cache memoizado para evitar recalcular o mesmo indicador/parâmetros no mesmo ciclo
            const memoKey = `${normKey}|${subSeries}|${param}|${JSON.stringify(params)}|${isPrev ? 'prev' : 'curr'}`;
            const cachedVal = indicatorMemo.get(memoKey);
            if (cachedVal !== undefined) {
              return cachedVal;
            }

            const activeReg = isPrev ? registryPrev : registry;
            const activeHist = isPrev ? prevCandlesToCalc : candlesToCalc;

            // Indicadores CALCULÁVEIS: sempre recalculados a partir dos candles históricos (e cacheados em indicatorMemo).
            const CALCULABLE_KEYS = ['sma', 'ema', 'rsi', 'macd', 'bollinger', 'tma', 'supertrend', 'emacd', 'volume_spike_pivots', 'volume_spike', 'spike_pivots', 'spike', 'smc_bos_choch', 'smc_range_filter', 'order_block_range', 'smc_ob_range', 'ma_cloud_filter', 'macloud_filter', 'ma_cloud', 'macloud', 'axion_trend', 'axiontrend'];
            const isCalculable = CALCULABLE_KEYS.some(ci => normKey === ci || normKey.startsWith(ci + '_') || normKey.startsWith(ci + '-'));

            if (!isCalculable && activeReg[key] !== undefined) {
              const raw = activeReg[key];
              const num = parseNum(raw);
              const res = { val: raw, num };
              indicatorMemo.set(memoKey, res);
              return res;
            }

            const computeIndicatorResult = (): { val: any; num: number | null } => {

            const smaMatch = normKey.match(/^sma[_\-]?(\d+)$/);
            if (smaMatch || normKey === 'sma') {
              const period = params.period || param || (smaMatch ? parseInt(smaMatch[1], 10) : 20);
              const smaArr = calculateSMA(activeHist, period);
              const val = smaArr.length > 0 ? smaArr[smaArr.length - 1] : 0;
              return { val, num: val };
            }

            const emaMatch = normKey.match(/^ema[_\-]?(\d+)$/);
            if (emaMatch || normKey === 'ema') {
              const period = params.period || param || (emaMatch ? parseInt(emaMatch[1], 10) : 21);
              const emaArr = calculateEMA(activeHist, period);
              const val = emaArr.length > 0 ? emaArr[emaArr.length - 1] : 0;
              return { val, num: val };
            }

            const rsiMatch = normKey.match(/^rsi[_\-]?(\d+)$/);
            if (rsiMatch || normKey === 'rsi') {
              const period = params.period || param || (rsiMatch ? parseInt(rsiMatch[1], 10) : 14);
              const rsiArr = calculateRSI(activeHist, period);
              const val = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : 50;
              return { val, num: val };
            }

            if (normKey === 'macd') {
              const fast = params.fastPeriod || 12;
              const slow = params.slowPeriod || 26;
              const sig = params.signalPeriod || 9;
              const divMinBars = Number(params.divergenceMinBars || 5);
              const divLookback = Number(params.divergenceLookback || 60);

              const emaFast = calculateEMA(activeHist, fast);
              const emaSlow = calculateEMA(activeHist, slow);
              const macdLine: number[] = [];
              for (let i = 0; i < activeHist.length; i++) {
                macdLine.push((emaFast[i] || 0) - (emaSlow[i] || 0));
              }
              const macdData = macdLine.map(v => ({ close: v }));
              const signalLine = calculateEMA(macdData, sig);

              const subNorm = String(subSeries || '').toLowerCase().trim();

              // Detecção e avaliação de divergências de alta e baixa do MACD
              if (subNorm.includes('divergence') || subNorm.includes('divergencia')) {
                const histArr: { time: number; value: number }[] = [];
                const candleData = activeHist.map((c: any, i: number) => {
                  const rawT = c.timestamp || c.time || (i + 1);
                  const numT = typeof rawT === 'number' ? rawT : (new Date(rawT).getTime() / 1000);
                  const mVal = macdLine[i] || 0;
                  const sVal = signalLine[i] || 0;
                  histArr.push({ time: numT, value: mVal - sVal });
                  return {
                    time: numT,
                    high: Number(c.high || c.close || 0),
                    low: Number(c.low || c.close || 0),
                    close: Number(c.close || 0)
                  };
                });

                const divMode = (params.divergenceMode as any) || 'swing_pivots';
                const divs = calculateMACDDivergences(candleData, histArr, divLookback, divMinBars, 2, true, divMode);

                const isDivergenceRecent = (div: any): boolean => {
                  if (!div) return false;
                  const peakIdx = candleData.findIndex((c: any) => c.time === div.t2);
                  if (peakIdx < 0) return false;
                  const barsSincePeak = (candleData.length - 1) - peakIdx;
                  // A divergência é confirmada com confirmationBars = 2.
                  // Considera-se gatilho ativo se confirmada na barra atual ou nas últimas 3 barras.
                  return barsSincePeak >= 2 && barsSincePeak <= 4;
                };

                const matchingBull = divs.filter(d => d.type === 'BULLISH').find(d => isDivergenceRecent(d));
                const matchingBear = divs.filter(d => d.type === 'BEARISH').find(d => isDivergenceRecent(d));

                if (subNorm === 'divergence_bullish' || subNorm === 'divergencia_alta' || subNorm === 'sinal_compra') {
                  const isBull = Boolean(matchingBull);
                  return { val: isBull ? 'compra' : 'neutro', num: isBull ? 1 : 0 };
                }
                if (subNorm === 'divergence_bearish' || subNorm === 'divergencia_baixa' || subNorm === 'sinal_venda') {
                  const isBear = Boolean(matchingBear);
                  return { val: isBear ? 'venda' : 'neutro', num: isBear ? 1 : 0 };
                }
                if (subNorm === 'divergence_trend' || subNorm === 'divergencia_tendencia' || subNorm === 'divergence' || subNorm === 'divergencia') {
                  if (matchingBull) return { val: 'compra', num: 1 };
                  if (matchingBear) return { val: 'venda', num: -1 };
                  return { val: 'neutro', num: 0 };
                }
              }

              let val = 0;
              const idx = activeHist.length - 1;
              if (idx >= 0) {
                if (subSeries === 'line') val = macdLine[idx];
                else if (subSeries === 'signal') val = signalLine[idx];
                else val = (macdLine[idx] || 0) - (signalLine[idx] || 0);
              }
              return { val, num: val };
            }

            if (normKey === 'emacd') {
              const emacdResult = calculateEMACD(activeHist);
              const idx = activeHist.length - 1;
              let val: any = 0;
              if (idx >= 0) {
                if (subSeries === 'histogram_compra') val = emacdResult.histogram_compra[idx];
                else if (subSeries === 'histogram_venda') val = emacdResult.histogram_venda[idx];
                else if (subSeries === 'histogram_abs') val = emacdResult.histogram_abs[idx];
                else if (subSeries === 'explosion') val = emacdResult.explosion[idx];
                else if (subSeries === 'deadzone') val = emacdResult.deadZone[idx];
                else if (subSeries === 'trend') val = emacdResult.trend[idx];
                else val = emacdResult.histogram[idx];
              }
              const num = parseNum(val);
              return { val, num };
            }

            if (normKey === 'bollinger') {
              const period = params.period || 20;
              const stdDevMult = params.stdDev || params.multiplier || params.atrMultiplier || 2.0;
              if (activeHist.length < period) return { val: 0, num: 0 };
              const slice = activeHist.slice(-period);
              const mean = slice.reduce((sum, c) => sum + c.close, 0) / period;
              const variance = slice.reduce((sum, c) => sum + Math.pow(c.close - mean, 2), 0) / period;
              const stdDev = Math.sqrt(variance);

              const subNorm = String(subSeries || '').toLowerCase().trim();
              let val = mean;
              if (subNorm.includes('upper') || subNorm.includes('superior') || subNorm.includes('topo') || subNorm.includes('high') || subNorm === '1') {
                val = mean + stdDev * stdDevMult;
              } else if (subNorm.includes('lower') || subNorm.includes('inferior') || subNorm.includes('fundo') || subNorm.includes('low') || subNorm === '2') {
                val = mean - stdDev * stdDevMult;
              }
              return { val, num: val };
            }

            if (normKey === 'tma') {
              const period = params.period || 20;
              const mult = params.atrMultiplier || params.mult || params.multiplier || params.stdDev || 2.0;
              const halfPeriod = Math.ceil((period + 1) / 2);
              if (activeHist.length < period) return { val: 0, num: 0 };
              const prices = activeHist.map(c => c.close);
              const sma1: number[] = [];
              for (let i = 0; i < prices.length; i++) {
                if (i < halfPeriod - 1) { sma1.push(prices[i]); continue; }
                let sum = 0;
                for (let j = 0; j < halfPeriod; j++) sum += prices[i - j];
                sma1.push(sum / halfPeriod);
              }
              let sum = 0;
              const lastIdx = prices.length - 1;
              for (let j = 0; j < halfPeriod; j++) sum += sma1[lastIdx - j];
              const tmaVal = sum / halfPeriod;
              let atr = 0;
              const lookback = Math.min(lastIdx, 14);
              for (let k = lastIdx - lookback + 1; k <= lastIdx; k++) {
                if (k > 0) atr += Math.max(activeHist[k].high - activeHist[k].low, Math.abs(activeHist[k].high - activeHist[k - 1].close));
              }
              atr = atr / (lookback || 1);

              const subNorm = String(subSeries || '').toLowerCase().trim();
              let val = tmaVal;
              if (subNorm.includes('range') || subNorm.includes('tamanho') || subNorm.includes('largura') || subNorm.includes('width')) {
                // Range / Tamanho do canal em pontos entre a banda superior e a banda inferior
                val = (atr * mult) * 2;
              } else if (subNorm.includes('upper') || subNorm.includes('superior') || subNorm.includes('topo') || subNorm.includes('high') || subNorm === '1') {
                val = tmaVal + atr * mult;
              } else if (subNorm.includes('lower') || subNorm.includes('inferior') || subNorm.includes('fundo') || subNorm.includes('low') || subNorm === '2') {
                val = tmaVal - atr * mult;
              }
              return { val, num: val };
            }

            if (normKey === 'supertrend') {
              const period = Number(params.atrPeriod || 10);
              const factor = Number(params.multiplier || 3.0);
              if (activeHist.length <= period) return { val: 0, num: 0 };

              // 1. True Range (TR)
              const trList: number[] = [activeHist[0].high - activeHist[0].low];
              for (let i = 1; i < activeHist.length; i++) {
                const h = activeHist[i].high;
                const l = activeHist[i].low;
                const prevC = activeHist[i - 1].close;
                trList.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));
              }

              // 2. Wilder's RMA ATR (Padrão TradingView)
              const atrList: number[] = new Array(activeHist.length).fill(0);
              let initialSum = 0;
              for (let i = 0; i < period; i++) {
                initialSum += trList[i];
              }
              let prevAtr = initialSum / period;
              atrList[period - 1] = prevAtr;

              for (let i = period; i < activeHist.length; i++) {
                const curAtr = (prevAtr * (period - 1) + trList[i]) / period;
                atrList[i] = curAtr;
                prevAtr = curAtr;
              }

              // 3. Supertrend Bands (TradingView Algorithm)
              const upperBand: number[] = new Array(activeHist.length).fill(0);
              const lowerBand: number[] = new Array(activeHist.length).fill(0);
              const trendArr: number[] = new Array(activeHist.length).fill(1);

              const hl2_0 = (activeHist[period - 1].high + activeHist[period - 1].low) / 2;
              const atr_0 = atrList[period - 1];
              upperBand[period - 1] = hl2_0 + factor * atr_0;
              lowerBand[period - 1] = hl2_0 - factor * atr_0;
              trendArr[period - 1] = activeHist[period - 1].close >= hl2_0 ? 1 : -1;

              let supertrendVal = 0;
              let isBuyFlip = false;
              let isSellFlip = false;

              for (let i = period; i < activeHist.length; i++) {
                const hl2 = (activeHist[i].high + activeHist[i].low) / 2;
                const atr = atrList[i];
                const basicUpper = hl2 + factor * atr;
                const basicLower = hl2 - factor * atr;

                const prevUpper = upperBand[i - 1];
                const prevLower = lowerBand[i - 1];
                const prevClose = activeHist[i - 1].close;
                const prevTrend = trendArr[i - 1];

                const currLower = (prevClose > prevLower) ? Math.max(basicLower, prevLower) : basicLower;
                const currUpper = (prevClose < prevUpper) ? Math.min(basicUpper, prevUpper) : basicUpper;

                lowerBand[i] = currLower;
                upperBand[i] = currUpper;

                let currTrend = prevTrend;
                if (prevTrend === 1 && activeHist[i].close < prevLower) {
                  currTrend = -1;
                } else if (prevTrend === -1 && activeHist[i].close > prevUpper) {
                  currTrend = 1;
                }
                trendArr[i] = currTrend;

                if (i === activeHist.length - 1) {
                  isBuyFlip = (prevTrend === -1 && currTrend === 1);
                  isSellFlip = (prevTrend === 1 && currTrend === -1);
                  supertrendVal = currTrend === 1 ? currLower : currUpper;
                }
              }

              const trend = trendArr[activeHist.length - 1] || 1;

              if (subSeries === 'signal_buy' || subSeries === 'sinal_compra') {
                return { val: isBuyFlip ? 'compra' : 'neutro', num: isBuyFlip ? 1 : 0 };
              }
              if (subSeries === 'signal_sell' || subSeries === 'sinal_venda') {
                return { val: isSellFlip ? 'venda' : 'neutro', num: isSellFlip ? 1 : 0 };
              }
              if (subSeries === 'trend' || subSeries === 'tendencia') {
                const tStr = trend === 1 ? 'compra' : 'venda';
                return { val: tStr, num: trend };
              }
              return { val: supertrendVal, num: supertrendVal };
            }

            if (normKey === 'axion_trend' || normKey === 'axiontrend' || normKey.startsWith('axion_trend_')) {
              const sliceHist = activeHist.length > 220 ? activeHist.slice(-220) : activeHist;
              const axRes = calculateAxionTrend(sliceHist, params);
              const lastBar = axRes.last;
              if (!lastBar) return { val: 'neutro', num: 0 };

              const subNorm = String(subSeries || '').toLowerCase().trim();

              // 1. Sinais de Compra e Venda conforme as Setas do Indicador
              if (normKey === 'axion_trend_arrows' || subNorm === 'signal_arrow' || subNorm === 'arrows' || subNorm === 'setas' || subNorm === 'sinal') {
                const sig = lastBar.arrowSignal; // 'compra' | 'venda' | 'neutro'
                const num = sig === 'compra' ? 1 : sig === 'venda' ? -1 : 0;
                return { val: sig, num };
              }

              // 2. Indicador de Tendência dos Candles Verdes e Vermelhos
              if (normKey === 'axion_trend_candles' || subNorm === 'candle_trend' || subNorm === 'candles' || subNorm === 'cor_candle') {
                const cTrend = lastBar.candleTrend; // 'compra' | 'venda' | 'neutro'
                const num = cTrend === 'compra' ? 1 : cTrend === 'venda' ? -1 : 0;
                return { val: cTrend, num };
              }

              // 3. Indicador de Tendência Conciliado (Candles Coloridos + Média de Bolinhas Acima/Abaixo do Nível Zero)
              if (normKey === 'axion_trend_conciliated' || subNorm === 'conciliated_trend' || subNorm === 'conciliated_signal' || subNorm === 'conciliacao' || subNorm === 'conciliated') {
                if (subNorm === 'conciliated_signal') {
                  const cSig = lastBar.conciliatedSignal;
                  const num = cSig === 'compra' ? 1 : cSig === 'venda' ? -1 : 0;
                  return { val: cSig, num };
                }
                const cTrend = lastBar.conciliatedTrend;
                const num = cTrend === 'compra' ? 1 : cTrend === 'venda' ? -1 : 0;
                return { val: cTrend, num };
              }

              // 4. Média de Bolinhas do Histograma com Filtro de Nível Zero (> 0 Compra / < 0 Venda)
              if (subNorm === 'macdbb_zero_trend') {
                const zTrend = lastBar.macdbbZeroTrend;
                const num = zTrend === 'compra' ? 1 : zTrend === 'venda' ? -1 : 0;
                return { val: zTrend, num };
              }

              // 5. Cor da Média de Bolinhas (MACDBB State)
              if (subNorm === 'macdbb_state') {
                const mState = lastBar.macdbbState;
                const num = mState === 'compra' ? 1 : mState === 'venda' ? -1 : 0;
                return { val: mState, num };
              }

              // 6. Transição Bull/Bear
              if (subNorm === 'bullbear_signal' || subNorm === 'bullbear_trend') {
                const bVal = subNorm === 'bullbear_signal' ? lastBar.bullBearSignal : lastBar.bullBearTrend;
                const num = bVal === 'compra' ? 1 : bVal === 'venda' ? -1 : 0;
                return { val: bVal, num };
              }

              // 7. Séries Numéricas (MACDBB Line, MACD Diff Histograma, Bandas de Bollinger do MACD)
              if (subNorm === 'macdbb_line') return { val: lastBar.macdbbLine, num: lastBar.macdbbLine };
              if (subNorm === 'macd_diff') return { val: lastBar.rsmMacdDiff, num: lastBar.rsmMacdDiff };
              if (subNorm === 'bb_upper') return { val: lastBar.macdbbUpper, num: lastBar.macdbbUpper };
              if (subNorm === 'bb_lower') return { val: lastBar.macdbbLower, num: lastBar.macdbbLower };
              if (subNorm === 'bb_midline') return { val: lastBar.macdbbMidline, num: lastBar.macdbbMidline };

              // Default: Sinais de Compra e Venda (Setas)
              const defSig = lastBar.arrowSignal;
              return { val: defSig, num: defSig === 'compra' ? 1 : defSig === 'venda' ? -1 : 0 };
            }

            if (normKey === 'volume_spike_pivots' || normKey === 'spike_pivots' || normKey === 'volume_spike' || normKey === 'spike') {
              const bars = params.barsToCheck || 5;
              const period = params.volumeAveragePeriod || 20;
              const mult = params.volumeMultiple || 1.5;
              const curP = isPrev ? prevPrice : evalPrice;

              const res = calculateVolumeSpikePivotsAnalysis(activeHist, {
                barsToCheck: bars,
                volumeAveragePeriod: period,
                volumeMultiple: mult,
                currentPrice: curP
              });

              const subNorm = String(subSeries || '').toLowerCase().trim();
              if (subNorm === 'nearest_buy_level' || subNorm === 'buy_level' || subNorm === 'compra_nivel') {
                return { val: res.nearestBuyLevel, num: res.nearestBuyLevel };
              }
              if (subNorm === 'nearest_sell_level' || subNorm === 'sell_level' || subNorm === 'venda_nivel') {
                return { val: res.nearestSellLevel, num: res.nearestSellLevel };
              }
              if (subNorm === 'recent_buy_level' || subNorm === 'compra_recente') {
                return { val: res.recentBuyLevel, num: res.recentBuyLevel };
              }
              if (subNorm === 'recent_sell_level' || subNorm === 'venda_recente') {
                return { val: res.recentSellLevel, num: res.recentSellLevel };
              }
              if (subNorm === 'dist_buy_level' || subNorm === 'dist_compra') {
                return { val: res.distanceToNearestBuy, num: res.distanceToNearestBuy };
              }
              if (subNorm === 'dist_sell_level' || subNorm === 'dist_venda') {
                return { val: res.distanceToNearestSell, num: res.distanceToNearestSell };
              }
              if (subNorm === 'active_buy_count' || subNorm === 'qtd_compra') {
                return { val: res.activeBuyCount, num: res.activeBuyCount };
              }
              if (subNorm === 'active_sell_count' || subNorm === 'qtd_venda') {
                return { val: res.activeSellCount, num: res.activeSellCount };
              }
              if (subNorm === 'touch_buy' || subNorm === 'toque_compra') {
                return { val: res.touchBuy, num: null };
              }
              if (subNorm === 'touch_sell' || subNorm === 'toque_venda') {
                return { val: res.touchSell, num: null };
              }
              if (subNorm === 'spike_status' || subNorm === 'status' || subNorm === 'spike_active') {
                return { val: res.spikeStatus, num: null };
              }

              // Default: se subSeries for vazia, retorna o nível mais próximo ativo
              const defaultLevel = res.nearestBuyLevel || res.nearestSellLevel || 0;
              return { val: defaultLevel, num: defaultLevel };
            }

            if (normKey === 'forca_momentum' || normKey === 'momentum_forca') {
              const assetKey = String(params.asset || 'total').toLowerCase();
              const regKey = assetKey === 'total' ? 'momentum_forca_total' : `momentum_forca_${assetKey}`;
              if (activeReg[regKey] !== undefined) {
                const val = activeReg[regKey];
                return { val, num: parseNum(val) };
              }
              const period = 14;
              const slice = activeHist.slice(-period);
              if (slice.length < 2) return { val: 50, num: 50 };
              const firstClose = Number(slice[0].close || slice[0].open || 1);
              const lastClose = Number(slice[slice.length - 1].close || firstClose);
              const pctChange = ((lastClose - firstClose) / firstClose) * 100;
              let rawMom = 50 + pctChange * 15;
              if (assetKey === 'vix') rawMom = 100 - rawMom;
              else if (assetKey === 'tesla' || assetKey === 'nvidia') rawMom = 50 + pctChange * 20;
              const momVal = Math.min(98, Math.max(2, Math.round(rawMom * 10) / 10));
              return { val: momVal, num: momVal };
            }

            if (['sentiment', 'market_sentiment', 'sentiment_macro', 'sentiment_micro'].includes(normKey)) {
              if (activeReg[normKey] !== undefined) {
                const val = activeReg[normKey];
                return { val, num: parseNum(val) };
              }
              const period = 20;
              const slice = activeHist.slice(-period);
              if (slice.length < 2) return { val: 50, num: 50 };
              const sma = slice.reduce((sum: number, c: any) => sum + (Number(c.close) || 0), 0) / slice.length;
              const lastClose = Number(slice[slice.length - 1].close || sma);
              const diffPct = sma !== 0 ? ((lastClose - sma) / sma) * 100 : 0;
              const sentVal = Math.min(95, Math.max(5, Math.round((50 + diffPct * 25) * 10) / 10));
              return { val: sentVal, num: sentVal };
            }

            if (normKey === 'estado') {
              if (activeReg['estado'] !== undefined && activeReg['estado'] !== '') {
                const val = activeReg['estado'];
                return { val, num: null };
              }
              const period = 20;
              const slice = activeHist.slice(-period);
              if (slice.length < 2) return { val: 'AGUARDANDO', num: null };
              const closes = slice.map((c: any) => Number(c.close || 0));
              const ema12 = calculateEMA(slice, 12);
              const ema26 = calculateEMA(slice, 26);
              const hist = (ema12[ema12.length - 1] || 0) - (ema26[ema26.length - 1] || 0);
              const mean = closes.reduce((a: number, b: number) => a + b, 0) / closes.length;
              const variance = closes.reduce((a: number, b: number) => a + Math.pow(b - mean, 2), 0) / closes.length;
              const stdDev = Math.sqrt(variance);
              const threshold = stdDev * 0.15;
              const z = stdDev > 0 ? (closes[closes.length - 1] - mean) / stdDev : 0;

              let estVal = 'NORMAL';
              if (z >= 2.0) estVal = 'EXAUSTÃO COMPRA';
              else if (z <= -2.0) estVal = 'EXAUSTÃO VENDA';
              else if (hist > threshold * 1.5) estVal = 'EXPLOSÃO COMPRA';
              else if (hist < -threshold * 1.5) estVal = 'EXPLOSÃO VENDA';
              else if (hist > 0) estVal = 'COMPRA';
              else if (hist < 0) estVal = 'VENDA';

              return { val: estVal, num: null };
            }

            if (normKey === 'elliottwaves' || normKey === 'elliott_waves') {
              const rawWave = String(activeReg['wave'] || activeReg['elliott_wave'] || '1').toUpperCase();
              if (subSeries.startsWith('wave_')) {
                const targetWave = subSeries.replace('wave_', '').toUpperCase();
                const isMatch = rawWave === targetWave;
                return { val: isMatch ? targetWave : 'neutro', num: isMatch ? 1 : 0 };
              }
              return { val: rawWave, num: parseNum(rawWave) };
            }

            if (['price', 'preco', 'close', 'fechamento'].includes(normKey)) {
              const val = isPrev ? prevPrice : evalPrice;
              return { val, num: val };
            }

            const refPrice = isPrev ? prevPrice : evalPrice;

            // Handlers para Níveis Gamma roteados pelo subSeries para as chaves corretas do registry
            if (normKey === 'levels_gamma') {
              const subMap: Record<string, string> = { hvl: 'gamma_hvl', gwall: 'gamma_gwall', hvl0: 'gamma_hvl0' };
              const sub = (subSeries || '').toLowerCase().trim();
              if (!sub || sub === 'any' || sub === 'todos') {
                const pool = [Number(activeReg['gamma_hvl'] || 0), Number(activeReg['gamma_gwall'] || 0), Number(activeReg['gamma_hvl0'] || 0)].filter(v => v > 0);
                if (pool.length > 0) {
                  const closest = pool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
                  return { val: closest, num: closest };
                }
              }
              const regKey = subMap[sub] || 'gamma_hvl';
              const val = activeReg[regKey] !== undefined ? Number(activeReg[regKey]) : 0;
              return { val, num: val };
            }
            if (normKey === 'levels_options') {
              const subMap: Record<string, string> = { call: 'gamma_call', put: 'gamma_put', call0: 'gamma_call0', put0: 'gamma_put0' };
              const sub = (subSeries || '').toLowerCase().trim();
              if (!sub || sub === 'any' || sub === 'todos') {
                const pool = [Number(activeReg['gamma_call'] || 0), Number(activeReg['gamma_put'] || 0), Number(activeReg['gamma_call0'] || 0), Number(activeReg['gamma_put0'] || 0)].filter(v => v > 0);
                if (pool.length > 0) {
                  const closest = pool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
                  return { val: closest, num: closest };
                }
              }
              const regKey = subMap[sub] || 'gamma_call';
              const val = activeReg[regKey] !== undefined ? Number(activeReg[regKey]) : 0;
              return { val, num: val };
            }
            if (normKey === 'levels_daily') {
              const subMap: Record<string, string> = { max1d: 'gamma_max1d', min1d: 'gamma_min1d', prev: 'gamma_prev', prevh: 'gamma_prevH', prevl: 'gamma_prevL' };
              const sub = (subSeries || '').toLowerCase().trim();
              if (!sub || sub === 'any' || sub === 'todos') {
                const pool = [Number(activeReg['gamma_max1d'] || 0), Number(activeReg['gamma_min1d'] || 0), Number(activeReg['gamma_prev'] || 0), Number(activeReg['gamma_prevH'] || 0), Number(activeReg['gamma_prevL'] || 0)].filter(v => v > 0);
                if (pool.length > 0) {
                  const closest = pool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
                  return { val: closest, num: closest };
                }
              }
              const regKey = subMap[sub] || 'gamma_max1d';
              const val = activeReg[regKey] !== undefined ? Number(activeReg[regKey]) : 0;
              return { val, num: val };
            }
            if (normKey === 'gammalevels') {
              const subMap: Record<string, string> = {
                hvl: 'gamma_hvl', gwall: 'gamma_gwall', hvl0: 'gamma_hvl0',
                call: 'gamma_call', put: 'gamma_put', call0: 'gamma_call0', put0: 'gamma_put0',
                max1d: 'gamma_max1d', min1d: 'gamma_min1d', prev: 'gamma_prev', prevh: 'gamma_prevH', prevl: 'gamma_prevL'
              };
              const sub = (subSeries || '').toLowerCase().trim();
              if (!sub || sub === 'any' || sub === 'todos') {
                const pool = [
                  Number(activeReg['gamma_hvl'] || 0), Number(activeReg['gamma_gwall'] || 0), Number(activeReg['gamma_hvl0'] || 0),
                  Number(activeReg['gamma_call'] || 0), Number(activeReg['gamma_put'] || 0), Number(activeReg['gamma_call0'] || 0), Number(activeReg['gamma_put0'] || 0),
                  Number(activeReg['gamma_max1d'] || 0), Number(activeReg['gamma_min1d'] || 0), Number(activeReg['gamma_prev'] || 0), Number(activeReg['gamma_prevH'] || 0), Number(activeReg['gamma_prevL'] || 0)
                ].filter(v => v > 0);
                if (pool.length > 0) {
                  const closest = pool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
                  return { val: closest, num: closest };
                }
              }
              const regKey = subMap[sub] || 'gamma_hvl';
              const val = activeReg[regKey] !== undefined ? Number(activeReg[regKey]) : 0;
              return { val, num: val };
            }
            if (normKey === 'nearest_resistance') {
              const val = activeReg['nearest_resistance'] !== undefined ? Number(activeReg['nearest_resistance']) : 0;
              return { val, num: val };
            }
            if (normKey === 'nearest_support') {
              const val = activeReg['nearest_support'] !== undefined ? Number(activeReg['nearest_support']) : 0;
              return { val, num: val };
            }
            if (normKey === 'distance_to_resistance') {
              const val = activeReg['distance_to_resistance'] !== undefined ? Number(activeReg['distance_to_resistance']) : 9999;
              return { val, num: val };
            }
            if (normKey === 'distance_to_support') {
              const val = activeReg['distance_to_support'] !== undefined ? Number(activeReg['distance_to_support']) : 9999;
              return { val, num: val };
            }
            if (normKey === 'levels_liquidity') {
              const sub = (subSeries || '').toLowerCase().trim();
              const blPool = [
                Number(activeReg['gamma_bl1'] || 0), Number(activeReg['gamma_bl2'] || 0),
                Number(activeReg['gamma_bl3'] || 0), Number(activeReg['gamma_bl4'] || 0),
                Number(activeReg['gamma_bl5'] || 0)
              ].filter(v => v > 0);
              const gexPool = [
                Number(activeReg['gamma_gex1'] || 0), Number(activeReg['gamma_gex2'] || 0),
                Number(activeReg['gamma_gex3'] || 0)
              ].filter(v => v > 0);

              if (!sub || sub === 'all' || sub === 'todos' || sub === 'any') {
                const pool = [...blPool, ...gexPool];
                if (pool.length > 0) {
                  const closest = pool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
                  return { val: closest, num: closest };
                }
              }
              if (sub === 'all_bl') {
                if (blPool.length > 0) {
                  const closest = blPool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
                  return { val: closest, num: closest };
                }
              }
              if (sub === 'all_gex') {
                if (gexPool.length > 0) {
                  const closest = gexPool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
                  return { val: closest, num: closest };
                }
              }
              const subMap: Record<string, string> = {
                bl1: 'gamma_bl1', bl2: 'gamma_bl2', bl3: 'gamma_bl3', bl4: 'gamma_bl4', bl5: 'gamma_bl5',
                gex1: 'gamma_gex1', gex2: 'gamma_gex2', gex3: 'gamma_gex3'
              };
              const regKey = subMap[sub] || `gamma_${sub}`;
              const val = activeReg[regKey] !== undefined ? Number(activeReg[regKey]) : 0;
              return { val, num: val };
            }

            if (normKey === 'volume_levels') {
              const sub = (subSeries || '').toLowerCase().trim();
              let poc = Number(activeReg['vpoc'] || 0);
              let vah = Number(activeReg['vah'] || 0);
              let val = Number(activeReg['val_level'] || 0);
              let nakedList: any[] = Array.isArray(activeReg['naked_pocs']) ? activeReg['naked_pocs'] : [];

              if (params && (params.sessionMode === 'bars' || params.sessionMode === 'custom' || (params.lookbackDays && params.lookbackDays !== 1) || (params.valueAreaPct && params.valueAreaPct !== 70))) {
                const customVp = calculateVolumeProfileAnalysis(activeHist, {
                  sessionMode: params.sessionMode || 'all',
                  customStart: params.customStart || '09:00',
                  customEnd: params.customEnd || '18:00',
                  lookbackDays: params.lookbackDays || 1,
                  lookbackBars: params.lookbackBars || 30,
                  valueAreaPct: params.valueAreaPct || 70
                });
                if (customVp?.levels) {
                  poc = customVp.levels.poc || 0;
                  vah = customVp.levels.vah || 0;
                  val = customVp.levels.val || 0;
                  nakedList = customVp.levels.nakedPocs || [];
                }
              }

              const nakedPrices = nakedList.map((p: any) => Number(p.price || 0)).filter(p => p > 0);

              if (!sub || sub === 'all' || sub === 'todos' || sub === 'any') {
                const pool = [poc, vah, val, ...nakedPrices].filter(p => p > 0);
                if (pool.length > 0) {
                  const closest = pool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
                  return { val: closest, num: closest };
                }
                return { val: poc || refPrice, num: poc || refPrice };
              }
              if (sub === 'all_naked_pocs' || sub === 'naked_pocs' || sub === 'todos_naked') {
                if (nakedPrices.length > 0) {
                  const closest = nakedPrices.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
                  return { val: closest, num: closest };
                }
                return { val: 0, num: 0 };
              }
              if (sub === 'poc' || sub === 'vpoc') {
                return { val: poc, num: poc };
              }
              if (sub === 'vah') {
                return { val: vah, num: vah };
              }
              if (sub === 'val') {
                return { val: val, num: val };
              }
              if (sub === 'naked_poc1') {
                const p1 = Number(nakedPrices[0] || activeReg['naked_poc1'] || 0);
                return { val: p1, num: p1 };
              }
              if (sub === 'naked_poc2') {
                const p2 = Number(nakedPrices[1] || activeReg['naked_poc2'] || 0);
                return { val: p2, num: p2 };
              }
              if (sub === 'naked_poc3') {
                const p3 = Number(nakedPrices[2] || activeReg['naked_poc3'] || 0);
                return { val: p3, num: p3 };
              }
              if (sub === 'dist_poc') {
                const dist = Math.abs(refPrice - poc);
                return { val: dist, num: dist };
              }
              if (sub === 'dist_vah') {
                const dist = Math.abs(refPrice - vah);
                return { val: dist, num: dist };
              }
              if (sub === 'dist_val') {
                const dist = Math.abs(refPrice - val);
                return { val: dist, num: dist };
              }
              if (sub === 'dist_naked_poc') {
                if (nakedPrices.length > 0) {
                  const closest = nakedPrices.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
                  const dist = Math.abs(refPrice - closest);
                  return { val: dist, num: dist };
                }
                return { val: 9999, num: 9999 };
              }
              return { val: poc, num: poc };
            }

            if (normKey === 'volume_hvn_blocks' || normKey === 'hvn_blocks' || normKey === 'hvn') {
              const sub = (subSeries || '').toLowerCase().trim();
              let hvnList: any[] = Array.isArray(activeReg['hvn_blocks']) ? activeReg['hvn_blocks'] : [];

              if (params && (params.sessionMode === 'bars' || params.sessionMode === 'custom' || (params.lookbackDays && params.lookbackDays !== 1) || params.topNodesCount || params.blockThicknessPct)) {
                const customVp = calculateVolumeProfileAnalysis(activeHist, {
                  sessionMode: params.sessionMode || 'all',
                  customStart: params.customStart || '09:00',
                  customEnd: params.customEnd || '18:00',
                  lookbackDays: params.lookbackDays || 1,
                  lookbackBars: params.lookbackBars || 30,
                  topNodesCount: params.topNodesCount || 6,
                  blockThicknessPct: params.blockThicknessPct || 0.5
                });
                if (customVp?.hvnBlocks) {
                  hvnList = customVp.hvnBlocks;
                }
              }

              const centers = hvnList.map((b: any) => Number(b.priceCenter || 0)).filter(p => p > 0);

              if (!sub || sub === 'all' || sub === 'todos' || sub === 'any') {
                if (centers.length > 0) {
                  const closest = centers.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
                  return { val: closest, num: closest };
                }
                return { val: refPrice, num: refPrice };
              }
              if (sub === 'dist_nearest') {
                if (centers.length > 0) {
                  const closest = centers.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
                  const dist = Math.abs(refPrice - closest);
                  return { val: dist, num: dist };
                }
                return { val: 9999, num: 9999 };
              }
              if (sub === 'inside_any') {
                const isInside = hvnList.some((b: any) => refPrice >= b.priceBottom && refPrice <= b.priceTop);
                return { val: isInside ? 'sim' : 'nao', num: isInside ? 1 : 0 };
              }

              // Níveis específicos (hvn1, hvn1_top, hvn1_bottom, etc.)
              const match = sub.match(/^hvn(\d+)(?:_(center|top|bottom))?$/);
              if (match) {
                const rank = parseInt(match[1], 10);
                const part = match[2] || 'center';
                const blk = hvnList.find((b: any) => b.rank === rank) || hvnList[rank - 1];
                if (blk) {
                  const v = part === 'top' ? blk.priceTop : part === 'bottom' ? blk.priceBottom : blk.priceCenter;
                  return { val: v, num: v };
                }
                const regVal = Number(activeReg[`hvn${rank}_${part}`] || activeReg[`hvn${rank}_center`] || 0);
                return { val: regVal, num: regVal };
              }

              return { val: centers[0] || refPrice, num: centers[0] || refPrice };
            }
            if (normKey === 'zscore') {
              const period = params.period || 20;
              if (activeHist.length < period) return { val: 0, num: 0 };
              const sliceZ = activeHist.slice(-period);
              const meanZ = sliceZ.reduce((sum: number, c: any) => sum + (Number(c.close) || 0), 0) / period;
              const varianceZ = sliceZ.reduce((sum: number, c: any) => sum + Math.pow((Number(c.close) || 0) - meanZ, 2), 0) / period;
              const stdDevZ = Math.sqrt(varianceZ);
              const valZ = stdDevZ !== 0 ? ((Number(activeHist[activeHist.length - 1]?.close) || 0) - meanZ) / stdDevZ : 0;
              return { val: valZ, num: valZ };
            }

            if (normKey === 'vwap') {
              const resetMode = params.resetMode || 'session_1900';
              let sessionStartStr = String(params.sessionStart || targetSettings?.global_cycle_start || settings?.global_cycle_start || '20:00').slice(0, 5);
              if (resetMode === 'session_1900') sessionStartStr = '19:00';
              else if (resetMode === 'session_1800') sessionStartStr = '18:00';
              else if (resetMode === 'session_0930') sessionStartStr = '09:30';
              else if (resetMode === 'daily_utc') sessionStartStr = '00:00';

              const cycleStartFull = sessionStartStr.includes(':') ? (sessionStartStr.split(':').length === 2 ? `${sessionStartStr}:00` : sessionStartStr) : '19:00:00';

              // Identificar a sessão do candle mais recente
              const lastCandle: any = activeHist[activeHist.length - 1];
              const lastTime = lastCandle ? (lastCandle.timestamp || (typeof lastCandle.time === 'number' ? lastCandle.time * 1000 : lastCandle.time)) : null;
              const currentSessionKey = lastTime ? getTradingSessionKey(lastTime, cycleStartFull) : '';

              let sumPV = 0;
              let sumV = 0;
              for (let i = 0; i < activeHist.length; i++) {
                const c: any = activeHist[i];
                const cTime = c.timestamp || (typeof c.time === 'number' ? c.time * 1000 : c.time);
                if (cTime && currentSessionKey) {
                  if (getTradingSessionKey(cTime, cycleStartFull) !== currentSessionKey) {
                    continue;
                  }
                }
                const p = (Number(c.high || 0) + Number(c.low || 0) + Number(c.close || 0)) / 3;
                const v = Number(c.volume || 1);
                sumPV += p * v;
                sumV += v;
              }
              const val = sumV > 0 ? sumPV / sumV : (Number(activeHist[activeHist.length - 1]?.close) || 0);
              return { val, num: val };
            }

            if (normKey === 'levels_session_percent') {
              const stepPct = Number(params.stepPercent || 0.5);
              const center = Number(activeReg['candle_open'] || activeReg['open'] || activeHist[0]?.open || activeHist[0]?.close || refPrice);
              const sub = (subSeries || '').toLowerCase();
              const u1 = center * (1 + stepPct / 100);
              const u2 = center * (1 + (2 * stepPct) / 100);
              const u3 = center * (1 + (3 * stepPct) / 100);
              const l1 = center * (1 - stepPct / 100);
              const l2 = center * (1 - (2 * stepPct) / 100);
              const l3 = center * (1 - (3 * stepPct) / 100);

              if (!sub || sub === 'all' || sub === 'todos' || sub === 'any') {
                const pool = [center, u1, u2, u3, l1, l2, l3].filter(p => p > 0);
                if (pool.length > 0) {
                  const closest = pool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
                  return { val: closest, num: closest };
                }
                return { val: center, num: center };
              }
              if (sub === 'center') return { val: center, num: center };
              if (sub === 'upper1') return { val: u1, num: u1 };
              if (sub === 'upper2') return { val: u2, num: u2 };
              if (sub === 'upper3') return { val: u3, num: u3 };
              if (sub === 'lower1') return { val: l1, num: l1 };
              if (sub === 'lower2') return { val: l2, num: l2 };
              if (sub === 'lower3') return { val: l3, num: l3 };
              return { val: center, num: center };
            }

            if (normKey === 'levels_time_range') {
              const isAll = params.sessionMode === 'all' || params.useFullSession === true;
              const sysStart = String(targetSettings?.global_cycle_start || settings?.global_cycle_start || '19:00').slice(0, 5);
              const sysEnd = String(targetSettings?.global_cycle_end || settings?.global_cycle_end || '18:00').slice(0, 5);
              const startTime = isAll ? sysStart : String(params.startTime || '09:00');
              const endTime = isAll ? sysEnd : String(params.endTime || '09:30');

              // Identificar a sessão do candle mais recente
              const lastCandle: any = activeHist[activeHist.length - 1];
              const lastTime = lastCandle ? (lastCandle.timestamp || (typeof lastCandle.time === 'number' ? lastCandle.time * 1000 : lastCandle.time)) : null;
              const currentSessionKey = lastTime ? getTradingSessionKey(lastTime, sysStart + ':00') : '';

              const filtered = activeHist.filter((c: any) => {
                const cTime = c.timestamp || (typeof c.time === 'number' ? c.time * 1000 : c.time);
                if (!cTime) return isAll;
                if (currentSessionKey && getTradingSessionKey(cTime, sysStart + ':00') !== currentSessionKey) {
                  return false;
                }
                if (isAll) return true;
                const d = getSaoPauloDate(cTime);
                const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                if (startTime <= endTime) {
                  return hhmm >= startTime && hhmm <= endTime;
                } else {
                  return hhmm >= startTime || hhmm <= endTime;
                }
              });
              const rangeCandles = filtered.length > 0 ? filtered : (lastCandle ? [lastCandle] : activeHist);
              const highs = rangeCandles.map((c: any) => Number(c.high || c.close || 0));
              const lows = rangeCandles.map((c: any) => Number(c.low || c.close || 0));
              const maxH = Math.max(...highs);
              const minL = Math.min(...lows);
              const mid = (maxH + minL) / 2;

              activeReg['time_range_high'] = maxH;
              activeReg['time_range_mid'] = mid;
              activeReg['time_range_low'] = minL;

              const sub = (subSeries || '').toLowerCase();
              if (!sub || sub === 'all' || sub === 'todos' || sub === 'any') {
                const pool = [maxH, mid, minL].filter(v => v > 0);
                if (pool.length > 0) {
                  const closest = pool.reduce((prev, curr) => Math.abs(curr - refPrice) < Math.abs(prev - refPrice) ? curr : prev);
                  return { val: closest, num: closest };
                }
              }
              let val = mid;
              if (sub === 'high') val = maxH;
              else if (sub === 'low') val = minL;
              return { val, num: val };
            }

            if (['buyvolume', 'sellvolume', 'delta', 'deltaratio'].includes(normKey)) {
              const lastC = activeHist[activeHist.length - 1] || {};
              const totV = Number(lastC.volume || 100);
              const isBull = Number(lastC.close || 0) >= Number(lastC.open || 0);
              const bVol = Number((lastC as any).buyVolume || (lastC as any).buy_volume || (isBull ? totV * 0.7 : totV * 0.3));
              const sVol = Number((lastC as any).sellVolume || (lastC as any).sell_volume || (isBull ? totV * 0.3 : totV * 0.7));
              if (normKey === 'buyvolume') return { val: bVol, num: bVol };
              if (normKey === 'sellvolume') return { val: sVol, num: sVol };
              if (normKey === 'delta') return { val: bVol - sVol, num: bVol - sVol };
              if (normKey === 'deltaratio') {
                const ratio = totV > 0 ? (bVol - sVol) / totV : 0;
                return { val: ratio, num: ratio };
              }
            }

            if (normKey === 'smc_ob') {
              const sub = (subSeries || '').toLowerCase();
              const isDemand = sub === 'demand';
              let obVal = Number(activeHist[activeHist.length - 1]?.close || 0);
              for (let i = activeHist.length - 2; i >= 0; i--) {
                const c = activeHist[i];
                if (isDemand && Number(c.close || 0) < Number(c.open || 0)) {
                  obVal = Number(c.low || c.close || 0);
                  break;
                } else if (!isDemand && Number(c.close || 0) > Number(c.open || 0)) {
                  obVal = Number(c.high || c.close || 0);
                  break;
                }
              }
              return { val: obVal, num: obVal };
            }

            if (normKey === 'smc_bos_choch') {
              const swingLen = Math.max(2, Math.min(20, Number(params.swingLength || 5)));
              let lastSwingHigh: { index: number; price: number } | null = null;
              let lastSwingLow: { index: number; price: number } | null = null;
              let currentTrend: 1 | -1 = 1;
              let targetBOS: 'compra' | 'venda' | 'neutro' = 'neutro';
              let targetCHoCH: 'compra' | 'venda' | 'neutro' = 'neutro';
              let lastBreakPrice = 0;

              const targetIdx = activeHist.length - 1;

              for (let i = 0; i < activeHist.length; i++) {
                const p = i - swingLen;
                if (p >= swingLen) {
                  let isHigh = true;
                  let isLow = true;
                  const pH = Number(activeHist[p].high || 0);
                  const pL = Number(activeHist[p].low || 0);
                  for (let k = 1; k <= swingLen; k++) {
                    if (pH <= Number(activeHist[p - k].high || 0) || pH <= Number(activeHist[p + k].high || 0)) isHigh = false;
                    if (pL >= Number(activeHist[p - k].low || 0) || pL >= Number(activeHist[p + k].low || 0)) isLow = false;
                  }

                  if (isHigh) {
                    lastSwingHigh = { index: p, price: pH };
                  }
                  if (isLow) {
                    lastSwingLow = { index: p, price: pL };
                  }
                }

                // Avaliar rompimento na barra i
                const closeI = Number(activeHist[i].close || 0);
                if (lastSwingHigh && closeI > lastSwingHigh.price) {
                  const isBOS = currentTrend === 1;
                  if (i === targetIdx) {
                    if (isBOS) targetBOS = 'compra';
                    else targetCHoCH = 'compra';
                  }
                  lastBreakPrice = lastSwingHigh.price;
                  currentTrend = 1;
                  lastSwingHigh = null;
                } else if (lastSwingLow && closeI < lastSwingLow.price) {
                  const isBOS = currentTrend === -1;
                  if (i === targetIdx) {
                    if (isBOS) targetBOS = 'venda';
                    else targetCHoCH = 'venda';
                  }
                  lastBreakPrice = lastSwingLow.price;
                  currentTrend = -1;
                  lastSwingLow = null;
                }
              }

              const sub = String(subSeries || '').toLowerCase().trim();
              if (sub === 'bos') {
                return { val: targetBOS, num: targetBOS === 'compra' ? 1 : targetBOS === 'venda' ? -1 : 0 };
              }
              if (sub === 'choch') {
                return { val: targetCHoCH, num: targetCHoCH === 'compra' ? 1 : targetCHoCH === 'venda' ? -1 : 0 };
              }
              if (sub === 'bos_bullish') {
                const match = targetBOS === 'compra' ? 'compra' : 'neutro';
                return { val: match, num: match === 'compra' ? 1 : 0 };
              }
              if (sub === 'bos_bearish') {
                const match = targetBOS === 'venda' ? 'venda' : 'neutro';
                return { val: match, num: match === 'venda' ? 1 : 0 };
              }
              if (sub === 'choch_bullish') {
                const match = targetCHoCH === 'compra' ? 'compra' : 'neutro';
                return { val: match, num: match === 'compra' ? 1 : 0 };
              }
              if (sub === 'choch_bearish') {
                const match = targetCHoCH === 'venda' ? 'venda' : 'neutro';
                return { val: match, num: match === 'venda' ? 1 : 0 };
              }
              if (sub === 'price') {
                return { val: lastBreakPrice, num: lastBreakPrice };
              }

              // Default / signal: qualquer quebra recente
              const combinedSig = targetBOS !== 'neutro' ? targetBOS : targetCHoCH;
              return { val: combinedSig, num: combinedSig === 'compra' ? 1 : combinedSig === 'venda' ? -1 : 0 };
            }

            if (normKey === 'smc_range_filter' || normKey === 'order_block_range' || normKey === 'smc_ob_range') {
              const candleHistory = Math.max(2, Number(params.candleHistory || 10));
              const rangeMinSize = Number(params.rangeMinSize !== undefined ? params.rangeMinSize : 0.0);
              const rangeMaxSize = Number(params.rangeMaxSize !== undefined ? params.rangeMaxSize : 200.0);
              const limitMinPct = Number(params.limitMinPct !== undefined ? params.limitMinPct : 0.0);
              const limitMaxPct = Number(params.limitMaxPct !== undefined ? params.limitMaxPct : 50.0);
              const filterMode = String(params.filterMode || 'both').toLowerCase();
              const allowBreakout = params.allowBreakout !== false && (filterMode === 'both' || filterMode === 'breakout');
              const allowPullback = params.allowPullback !== false && (filterMode === 'both' || filterMode === 'pullback');

              const barsToAnalyze = Math.min(candleHistory, activeHist.length - 1);
              if (barsToAnalyze < 1) {
                return { val: 'reprovado', num: 0 };
              }

              let blockHigh = -Infinity;
              let blockLow = Infinity;
              const lastIdx = activeHist.length - 1;

              for (let i = 1; i <= barsToAnalyze; i++) {
                const cIdx = lastIdx - i;
                if (cIdx >= 0) {
                  const h = Number(activeHist[cIdx].high || activeHist[cIdx].close || 0);
                  const l = Number(activeHist[cIdx].low || activeHist[cIdx].close || 0);
                  if (h > blockHigh) blockHigh = h;
                  if (l < blockLow) blockLow = l;
                }
              }

              const blockRange = blockHigh - blockLow;
              const sub = String(subSeries || '').toLowerCase().trim();

              if (sub === 'block_high') return { val: blockHigh, num: blockHigh };
              if (sub === 'block_low') return { val: blockLow, num: blockLow };
              if (sub === 'block_range') return { val: blockRange, num: blockRange };

              // 1. Validar range
              const isRangeValid = blockRange >= rangeMinSize && blockRange <= rangeMaxSize;
              if (!isRangeValid) {
                if (sub === 'status') return { val: 'reprovado', num: 0 };
                return { val: 'neutro', num: 0 };
              }

              const triggerCandle = activeHist[lastIdx] || {};
              const triggerClose = Number(triggerCandle.close || 0);
              const triggerOpen = Number(triggerCandle.open || triggerClose);
              const isBullishCandle = triggerClose >= triggerOpen;
              const isBearishCandle = triggerClose <= triggerOpen;

              const minDistance = blockRange * (limitMinPct / 100.0);
              const maxDistance = blockRange * (limitMaxPct / 100.0);

              let isBreakoutBuy = false;
              let isBreakoutSell = false;
              let isPullbackBuy = false;
              let isPullbackSell = false;

              if (allowBreakout) {
                isBreakoutBuy = isBullishCandle && triggerClose >= (blockHigh + minDistance) && triggerClose <= (blockHigh + maxDistance);
                isBreakoutSell = isBearishCandle && triggerClose <= (blockLow - minDistance) && triggerClose >= (blockLow - maxDistance);
              }

              if (allowPullback) {
                const maxPullbackDist = blockRange * (limitMaxPct / 100.0);
                const minPullbackDist = blockRange * (limitMinPct / 100.0);
                isPullbackBuy = triggerClose >= (blockLow + minPullbackDist) && triggerClose <= (blockLow + maxPullbackDist);
                isPullbackSell = triggerClose <= (blockHigh - minPullbackDist) && triggerClose >= (blockHigh - maxPullbackDist);
              }

              if (sub === 'breakout_buy') {
                return { val: isBreakoutBuy ? 'compra' : 'neutro', num: isBreakoutBuy ? 1 : 0 };
              }
              if (sub === 'breakout_sell') {
                return { val: isBreakoutSell ? 'venda' : 'neutro', num: isBreakoutSell ? 1 : 0 };
              }
              if (sub === 'pullback_buy') {
                return { val: isPullbackBuy ? 'compra' : 'neutro', num: isPullbackBuy ? 1 : 0 };
              }
              if (sub === 'pullback_sell') {
                return { val: isPullbackSell ? 'venda' : 'neutro', num: isPullbackSell ? 1 : 0 };
              }
              if (sub === 'breakout_status') {
                const bSig = isBreakoutBuy ? 'compra' : isBreakoutSell ? 'venda' : 'neutro';
                return { val: bSig, num: bSig === 'compra' ? 1 : bSig === 'venda' ? -1 : 0 };
              }
              if (sub === 'pullback_status') {
                const pSig = isPullbackBuy ? 'compra' : isPullbackSell ? 'venda' : 'neutro';
                return { val: pSig, num: pSig === 'compra' ? 1 : pSig === 'venda' ? -1 : 0 };
              }

              // Status geral do filtro / direção
              const isBuyAny = isBreakoutBuy || isPullbackBuy;
              const isSellAny = isBreakoutSell || isPullbackSell;

              if (sub === 'zone_direction') {
                const dir = isBuyAny ? 'compra' : isSellAny ? 'venda' : 'neutro';
                return { val: dir, num: dir === 'compra' ? 1 : dir === 'venda' ? -1 : 0 };
              }

              const isApproved = isBuyAny || isSellAny;
              return { val: isApproved ? 'aprovado' : 'reprovado', num: isApproved ? 1 : 0 };
            }

            if (normKey === 'ma_cloud_filter' || normKey === 'macloud_filter' || normKey === 'ma_cloud' || normKey === 'macloud') {
              const fastPeriod = Math.max(1, Number(params.fastPeriod || 8));
              const slowPeriod = Math.max(2, Number(params.slowPeriod || 21));
              const minDistance = Number(params.minDistance !== undefined ? params.minDistance : 0.0);
              const maxDistance = Number(params.maxDistance !== undefined ? params.maxDistance : 100.0);
              const reverseLogic = params.reverseLogic === true;
              const useAutoAvg = params.useAutoAvg === true;
              const barCount = Math.max(1, Number(params.barCount || 5));

              const fastSMA = calculateSMA(activeHist, fastPeriod);
              const slowSMA = calculateSMA(activeHist, slowPeriod);

              const lastIdx = activeHist.length - 1;
              const e = fastSMA.length > 0 ? (fastSMA[fastSMA.length - 1] || 0) : 0;
              const s = slowSMA.length > 0 ? (slowSMA[slowSMA.length - 1] || 0) : 0;

              // Calcular diff (direto ou AutoRangeAVG)
              let diff = Math.abs(e - s);
              if (useAutoAvg) {
                let totalDiff = 0;
                let count = 0;
                for (let i = 0; i < barCount; i++) {
                  const idx = lastIdx - i;
                  if (idx >= 0 && idx < fastSMA.length && idx < slowSMA.length) {
                    totalDiff += Math.abs((fastSMA[idx] || 0) - (slowSMA[idx] || 0));
                    count++;
                  }
                }
                diff = count > 0 ? totalDiff / count : diff;
              }

              const sub = String(subSeries || '').toLowerCase().trim();
              if (sub === 'cloud_diff' || sub === 'diff') return { val: diff, num: diff };
              if (sub === 'fast_ma' || sub === 'fast') return { val: e, num: e };
              if (sub === 'slow_ma' || sub === 'slow') return { val: s, num: s };

              // 1. Validar limites de distância
              const isDistanceValid = diff >= minDistance && diff <= maxDistance;
              if (!isDistanceValid) {
                if (sub === 'status') return { val: 'reprovado', num: 0 };
                return { val: 'neutro', num: 0 };
              }

              // 2. Validação da Direção (Conforme NinjaTrader CheckMACLOUDFilter)
              // !rev: dir == 1 ? e > s : e < s
              // rev:  dir == 1 ? e < s : e > s
              let isBuyValid = false;
              let isSellValid = false;

              if (!reverseLogic) {
                isBuyValid = e > s;
                isSellValid = e < s;
              } else {
                isBuyValid = e < s;
                isSellValid = e > s;
              }

              if (sub === 'buy_valid') {
                return { val: isBuyValid ? 'compra' : 'neutro', num: isBuyValid ? 1 : 0 };
              }
              if (sub === 'sell_valid') {
                return { val: isSellValid ? 'venda' : 'neutro', num: isSellValid ? 1 : 0 };
              }
              if (sub === 'direction') {
                const dir = isBuyValid ? 'compra' : isSellValid ? 'venda' : 'neutro';
                return { val: dir, num: dir === 'compra' ? 1 : dir === 'venda' ? -1 : 0 };
              }

              const isApproved = isBuyValid || isSellValid;
              return { val: isApproved ? 'aprovado' : 'reprovado', num: isApproved ? 1 : 0 };
            }

            const parseNumVal = parseNum(key);
            return { val: key, num: parseNumVal };
            };

            const computedRes = computeIndicatorResult();
            indicatorMemo.set(memoKey, computedRes);
            return computedRes;
          };

          const normalizeOp = (opRaw: string): string => {
            const op = String(opRaw || '').toLowerCase().trim();
            if (['cross_above', 'crosses_above', 'cruzou_acima', 'crossesabove', 'crossabove', 'cruzacima', 'cruz. acima', 'cruz.acima', 'cruz_acima'].includes(op)) return 'cross_above';
            if (['cross_below', 'crosses_below', 'cruzou_abaixo', 'crossesbelow', 'crossbelow', 'cruzabaixo', 'cruz. abaixo', 'cruz.abaixo', 'cruz_abaixo'].includes(op)) return 'cross_below';
            if (['gt', '>', 'greater_than', 'maior', 'maior_que'].includes(op)) return 'gt';
            if (['gte', '>=', 'greater_equal', 'maior_igual'].includes(op)) return 'gte';
            if (['lt', '<', 'less_than', 'menor', 'menor_que'].includes(op)) return 'lt';
            if (['lte', '<=', 'less_equal', 'menor_igual'].includes(op)) return 'lte';
            if (['eq', '=', '==', 'equal', 'igual'].includes(op)) return 'eq';
            if (['neq', '!=', 'not_equal', 'diferente'].includes(op)) return 'neq';
            return op;
          };

          const evalCond = (cond: any): boolean => {
            if (!cond) return false;
            const op = normalizeOp(cond.operator || cond.comparator || cond.op);
            const isTargetIndicator = cond.target_type === 'indicator' || (!cond.target_type && Boolean(cond.target_indicator));
            const sourceCurr = getIndicatorVal(cond, false, false);
            if (sourceCurr.val === undefined || sourceCurr.val === null) return false;

            const targetCurr = isTargetIndicator 
              ? getIndicatorVal(cond, true, false) 
              : { val: cond.target_value ?? cond.value ?? cond.target ?? cond.target_param1, num: parseNum(cond.target_value ?? cond.value ?? cond.target ?? cond.target_param1) };

            // Operadores relacionais e de igualdade: avaliam apenas a barra atual sem gastar CPU com a barra anterior (sourcePrev / targetPrev)
            if (op === 'gt') { if (sourceCurr.num === null || targetCurr.num === null) return false; return sourceCurr.num > targetCurr.num; }
            if (op === 'gte') { if (sourceCurr.num === null || targetCurr.num === null) return false; return sourceCurr.num >= targetCurr.num; }
            if (op === 'lt') { if (sourceCurr.num === null || targetCurr.num === null) return false; return sourceCurr.num < targetCurr.num; }
            if (op === 'lte') { if (sourceCurr.num === null || targetCurr.num === null) return false; return sourceCurr.num <= targetCurr.num; }
            if (op === 'eq') {
              if (typeof sourceCurr.val === 'string' || typeof targetCurr.val === 'string') {
                return isStateMatching(sourceCurr.val, targetCurr.val);
              }
              return sourceCurr.val == targetCurr.val;
            }
            if (op === 'neq') {
              if (typeof sourceCurr.val === 'string' || typeof targetCurr.val === 'string') {
                return !isStateMatching(sourceCurr.val, targetCurr.val);
              }
              return sourceCurr.val != targetCurr.val;
            }

            // Apenas operadores de cruzamento (cross_above / cross_below) calculam a barra anterior
            const sourcePrev = getIndicatorVal(cond, false, true);
            const targetPrev = isTargetIndicator 
              ? getIndicatorVal(cond, true, true) 
              : targetCurr;

            const targetKeyNorm = String(cond.target_indicator || cond.target_value || cond.target || '').toLowerCase().trim();
            const isTargetNearestResistance = targetKeyNorm === 'nearest_resistance';
            const isTargetNearestSupport = targetKeyNorm === 'nearest_support';

            if (op === 'cross_above') {
              const currentA = sourceCurr.num;
              const currentB = targetCurr.num;
              const prevA = sourcePrev.num;
              const prevB = targetPrev.num;
              if (currentA === null || prevA === null) return false;

              // Rompimento de Resistência Dinâmica (Preço estava abaixo/igual da resistência anterior e agora rompeu acima)
              if (isTargetNearestResistance && prevB !== null && prevB > 0) {
                return currentA > prevB && prevA <= prevB;
              }
              // Rompimento/Retorno acima do Suporte Dinâmico
              if (isTargetNearestSupport && prevB !== null && prevB > 0) {
                return currentA > prevB && prevA <= prevB;
              }

              // Se for grupo de níveis com subSeries 'all', 'todos', 'any' ou vazio
              const targetSub = String(cond.target_subSeries || '').toLowerCase().trim();
              const isLevelGroup = ['levels_gamma', 'levels_options', 'levels_daily', 'levels_time_range', 'gammalevels', 'levels_liquidity', 'levels_session_percent', 'volume_levels', 'volume_hvn_blocks'].includes(targetKeyNorm);
              const isAllOrAny = !targetSub || ['all', 'todos', 'any', 'all_bl', 'all_gex', 'all_naked_pocs', 'naked_pocs'].includes(targetSub);
              if (isLevelGroup && isAllOrAny) {
                let pool: number[] = [];
                if (targetKeyNorm === 'levels_gamma') {
                  pool = [Number(registry['gamma_hvl'] || 0), Number(registry['gamma_gwall'] || 0), Number(registry['gamma_hvl0'] || 0)];
                } else if (targetKeyNorm === 'levels_options') {
                  pool = [Number(registry['gamma_call'] || 0), Number(registry['gamma_put'] || 0), Number(registry['gamma_call0'] || 0), Number(registry['gamma_put0'] || 0)];
                } else if (targetKeyNorm === 'levels_daily') {
                  pool = [Number(registry['gamma_max1d'] || 0), Number(registry['gamma_min1d'] || 0), Number(registry['gamma_prev'] || 0), Number(registry['gamma_prevH'] || 0), Number(registry['gamma_prevL'] || 0)];
                } else if (targetKeyNorm === 'gammalevels') {
                  pool = [
                    Number(registry['gamma_hvl'] || 0), Number(registry['gamma_gwall'] || 0), Number(registry['gamma_hvl0'] || 0),
                    Number(registry['gamma_call'] || 0), Number(registry['gamma_put'] || 0), Number(registry['gamma_call0'] || 0), Number(registry['gamma_put0'] || 0),
                    Number(registry['gamma_max1d'] || 0), Number(registry['gamma_min1d'] || 0), Number(registry['gamma_prev'] || 0), Number(registry['gamma_prevH'] || 0), Number(registry['gamma_prevL'] || 0)
                  ];
                } else if (targetKeyNorm === 'levels_liquidity') {
                  if (targetSub === 'all_bl') {
                    pool = [Number(registry['gamma_bl1'] || 0), Number(registry['gamma_bl2'] || 0), Number(registry['gamma_bl3'] || 0), Number(registry['gamma_bl4'] || 0), Number(registry['gamma_bl5'] || 0)];
                  } else if (targetSub === 'all_gex') {
                    pool = [Number(registry['gamma_gex1'] || 0), Number(registry['gamma_gex2'] || 0), Number(registry['gamma_gex3'] || 0)];
                  } else {
                    pool = [
                      Number(registry['gamma_bl1'] || 0), Number(registry['gamma_bl2'] || 0), Number(registry['gamma_bl3'] || 0), Number(registry['gamma_bl4'] || 0), Number(registry['gamma_bl5'] || 0),
                      Number(registry['gamma_gex1'] || 0), Number(registry['gamma_gex2'] || 0), Number(registry['gamma_gex3'] || 0)
                    ];
                  }
                } else if (targetKeyNorm === 'levels_session_percent') {
                  const openPrice = Number(registry['candle_open'] || registry['open'] || evalPrice);
                  const stepPercent = Number(cond.target_params?.stepPercent || 0.5);
                  pool = [
                    openPrice,
                    openPrice * (1 + (stepPercent * 1) / 100),
                    openPrice * (1 + (stepPercent * 2) / 100),
                    openPrice * (1 + (stepPercent * 3) / 100),
                    openPrice * (1 - (stepPercent * 1) / 100),
                    openPrice * (1 - (stepPercent * 2) / 100),
                    openPrice * (1 - (stepPercent * 3) / 100)
                  ];
                } else if (targetKeyNorm === 'levels_time_range') {
                  pool = [Number(registry['time_range_high'] || 0), Number(registry['time_range_mid'] || 0), Number(registry['time_range_low'] || 0)];
                } else if (targetKeyNorm === 'volume_levels') {
                  const poc = Number(registry['vpoc'] || 0);
                  const vah = Number(registry['vah'] || 0);
                  const val = Number(registry['val_level'] || 0);
                  const nakedList: any[] = Array.isArray(registry['naked_pocs']) ? registry['naked_pocs'] : [];
                  const nakedPrices = nakedList.map((p: any) => Number(p.price || 0)).filter(p => p > 0);
                  if (targetSub === 'all_naked_pocs' || targetSub === 'naked_pocs') {
                    pool = nakedPrices;
                  } else {
                    pool = [poc, vah, val, ...nakedPrices];
                  }
                } else if (targetKeyNorm === 'volume_hvn_blocks') {
                  const hvnList: any[] = Array.isArray(registry['hvn_blocks']) ? registry['hvn_blocks'] : [];
                  pool = hvnList.map((b: any) => Number(b.priceCenter || 0)).filter(p => p > 0);
                  if (pool.length === 0) {
                    pool = [
                      Number(registry['hvn1_center'] || 0), Number(registry['hvn2_center'] || 0), Number(registry['hvn3_center'] || 0),
                      Number(registry['hvn4_center'] || 0), Number(registry['hvn5_center'] || 0), Number(registry['hvn6_center'] || 0)
                    ];
                  }
                }
                const validPool = pool.filter(v => typeof v === 'number' && isFinite(v) && v > 0);
                if (validPool.length > 0) {
                  const anyCross = validPool.some(lvl => prevA <= lvl && currentA > lvl);
                  if (anyCross) return true;
                }
              }

              if (currentB === null || prevB === null) return false;
              // Cruzamento genuíno: A estava menor ou igual a B na barra anterior E agora está estritamente acima de B
              return currentA > currentB && prevA <= prevB;
            }
            if (op === 'cross_below') {
              const currentA = sourceCurr.num;
              const currentB = targetCurr.num;
              const prevA = sourcePrev.num;
              const prevB = targetPrev.num;
              if (currentA === null || prevA === null) return false;

              // Rompimento de Suporte Dinâmico (Preço estava acima/igual do suporte anterior e agora rompeu abaixo)
              if (isTargetNearestSupport && prevB !== null && prevB > 0) {
                return currentA < prevB && prevA >= prevB;
              }
              // Rompimento/Retorno abaixo da Resistência Dinâmica
              if (isTargetNearestResistance && prevB !== null && prevB > 0) {
                return currentA < prevB && prevA >= prevB;
              }

              // Se for grupo de níveis com subSeries 'all', 'todos', 'any' ou vazio
              const targetSub = String(cond.target_subSeries || '').toLowerCase().trim();
              const isLevelGroup = ['levels_gamma', 'levels_options', 'levels_daily', 'levels_time_range', 'gammalevels', 'levels_liquidity', 'levels_session_percent', 'volume_levels', 'volume_hvn_blocks'].includes(targetKeyNorm);
              const isAllOrAny = !targetSub || ['all', 'todos', 'any', 'all_bl', 'all_gex', 'all_naked_pocs', 'naked_pocs'].includes(targetSub);
              if (isLevelGroup && isAllOrAny) {
                let pool: number[] = [];
                if (targetKeyNorm === 'levels_gamma') {
                  pool = [Number(registry['gamma_hvl'] || 0), Number(registry['gamma_gwall'] || 0), Number(registry['gamma_hvl0'] || 0)];
                } else if (targetKeyNorm === 'levels_options') {
                  pool = [Number(registry['gamma_call'] || 0), Number(registry['gamma_put'] || 0), Number(registry['gamma_call0'] || 0), Number(registry['gamma_put0'] || 0)];
                } else if (targetKeyNorm === 'levels_daily') {
                  pool = [Number(registry['gamma_max1d'] || 0), Number(registry['gamma_min1d'] || 0), Number(registry['gamma_prev'] || 0), Number(registry['gamma_prevH'] || 0), Number(registry['gamma_prevL'] || 0)];
                } else if (targetKeyNorm === 'gammalevels') {
                  pool = [
                    Number(registry['gamma_hvl'] || 0), Number(registry['gamma_gwall'] || 0), Number(registry['gamma_hvl0'] || 0),
                    Number(registry['gamma_call'] || 0), Number(registry['gamma_put'] || 0), Number(registry['gamma_call0'] || 0), Number(registry['gamma_put0'] || 0),
                    Number(registry['gamma_max1d'] || 0), Number(registry['gamma_min1d'] || 0), Number(registry['gamma_prev'] || 0), Number(registry['gamma_prevH'] || 0), Number(registry['gamma_prevL'] || 0)
                  ];
                } else if (targetKeyNorm === 'levels_liquidity') {
                  if (targetSub === 'all_bl') {
                    pool = [Number(registry['gamma_bl1'] || 0), Number(registry['gamma_bl2'] || 0), Number(registry['gamma_bl3'] || 0), Number(registry['gamma_bl4'] || 0), Number(registry['gamma_bl5'] || 0)];
                  } else if (targetSub === 'all_gex') {
                    pool = [Number(registry['gamma_gex1'] || 0), Number(registry['gamma_gex2'] || 0), Number(registry['gamma_gex3'] || 0)];
                  } else {
                    pool = [
                      Number(registry['gamma_bl1'] || 0), Number(registry['gamma_bl2'] || 0), Number(registry['gamma_bl3'] || 0), Number(registry['gamma_bl4'] || 0), Number(registry['gamma_bl5'] || 0),
                      Number(registry['gamma_gex1'] || 0), Number(registry['gamma_gex2'] || 0), Number(registry['gamma_gex3'] || 0)
                    ];
                  }
                } else if (targetKeyNorm === 'levels_session_percent') {
                  const openPrice = Number(registry['candle_open'] || registry['open'] || evalPrice);
                  const stepPercent = Number(cond.target_params?.stepPercent || 0.5);
                  pool = [
                    openPrice,
                    openPrice * (1 + (stepPercent * 1) / 100),
                    openPrice * (1 + (stepPercent * 2) / 100),
                    openPrice * (1 + (stepPercent * 3) / 100),
                    openPrice * (1 - (stepPercent * 1) / 100),
                    openPrice * (1 - (stepPercent * 2) / 100),
                    openPrice * (1 - (stepPercent * 3) / 100)
                  ];
                } else if (targetKeyNorm === 'levels_time_range') {
                  pool = [Number(registry['time_range_high'] || 0), Number(registry['time_range_mid'] || 0), Number(registry['time_range_low'] || 0)];
                } else if (targetKeyNorm === 'volume_levels') {
                  const poc = Number(registry['vpoc'] || 0);
                  const vah = Number(registry['vah'] || 0);
                  const val = Number(registry['val_level'] || 0);
                  const nakedList: any[] = Array.isArray(registry['naked_pocs']) ? registry['naked_pocs'] : [];
                  const nakedPrices = nakedList.map((p: any) => Number(p.price || 0)).filter(p => p > 0);
                  if (targetSub === 'all_naked_pocs' || targetSub === 'naked_pocs') {
                    pool = nakedPrices;
                  } else {
                    pool = [poc, vah, val, ...nakedPrices];
                  }
                } else if (targetKeyNorm === 'volume_hvn_blocks') {
                  const hvnList: any[] = Array.isArray(registry['hvn_blocks']) ? registry['hvn_blocks'] : [];
                  pool = hvnList.map((b: any) => Number(b.priceCenter || 0)).filter(p => p > 0);
                  if (pool.length === 0) {
                    pool = [
                      Number(registry['hvn1_center'] || 0), Number(registry['hvn2_center'] || 0), Number(registry['hvn3_center'] || 0),
                      Number(registry['hvn4_center'] || 0), Number(registry['hvn5_center'] || 0), Number(registry['hvn6_center'] || 0)
                    ];
                  }
                }
                const validPool = pool.filter(v => typeof v === 'number' && isFinite(v) && v > 0);
                if (validPool.length > 0) {
                  const anyCross = validPool.some(lvl => prevA >= lvl && currentA < lvl);
                  if (anyCross) return true;
                }
              }

              if (currentB === null || prevB === null) return false;
              // Cruzamento genuíno: A estava maior ou igual a B na barra anterior E agora está estritamente abaixo de B
              return currentA < currentB && prevA >= prevB;
            }
            return false;
          };

          // --- AVALIAÇÃO SEQUENCIAL MULTI-ETAPAS (Lógica 1 ➔ Lógica 2 ➔ Lógica 3...) ---
          const buyStagesNorm = normalizeStrategyStages(strat.buy_stages || strat.buy_conditions, 'buy');
          const sellStagesNorm = normalizeStrategyStages(strat.sell_stages || strat.sell_conditions, 'sell');

          // Avalia condições de uma etapa priorizando SEMPRE os cálculos mais rápidos (Nível 1 -> Nível 4)
          // para que o short-circuit (.every no AND / .some no OR) evite rodar indicadores complexos desnecessariamente!
          const evalStageConditionsPrioritized = (st: any): boolean => {
            if (!st || !st.conditions || st.conditions.length === 0) return false;
            const orderedConds = st.conditions.length > 1
              ? [...st.conditions].sort((a: any, b: any) => getConditionComplexityScore(a) - getConditionComplexityScore(b))
              : st.conditions;
            return st.logic === 'OR'
              ? orderedConds.some((c: any) => evalCond(c))
              : orderedConds.every((c: any) => evalCond(c));
          };

          const evalSequentialSide = (sideKey: 'buy' | 'sell', stages: any[]): boolean => {
            if (!stages || stages.length === 0) return false;
            const activeStages = stages.filter(s => s.conditions && s.conditions.length > 0);
            if (activeStages.length === 0) return false;

            // Se possui apenas 1 estágio simples, avalia diretamente no candle corrente (com condições ordenadas por velocidade)
            if (activeStages.length === 1) {
              return evalStageConditionsPrioritized(activeStages[0]);
            }

            const stateKey = `${strat.id}_${targetPanel.id}_${sideKey}`;
            if (!strategySequenceStateRef.current[stateKey]) {
              strategySequenceStateRef.current[stateKey] = {
                currentStageIndex: 0,
                candlesSinceStageCompletion: 0,
                lastCheckedCandleTime: targetCandleTime,
                lastCompletedCandleTime: undefined
              };
            }

            const seqState = strategySequenceStateRef.current[stateKey];

            // Se for um novo candle, incrementa contador de velas aguardando a próxima etapa
            if (targetCandleTime && seqState.lastCheckedCandleTime !== targetCandleTime) {
              if (seqState.currentStageIndex > 0) {
                seqState.candlesSinceStageCompletion += 1;
              }
              seqState.lastCheckedCandleTime = targetCandleTime;
            }

            // Garante que o índice esteja dentro dos limites
            if (seqState.currentStageIndex >= activeStages.length) {
              seqState.currentStageIndex = 0;
              seqState.candlesSinceStageCompletion = 0;
            }

            const currentStage = activeStages[seqState.currentStageIndex];
            const maxWait = currentStage?.max_wait_candles !== undefined
              ? Number(currentStage.max_wait_candles)
              : ((strat as any).max_wait_candles !== undefined ? Number((strat as any).max_wait_candles) : 0);

            // Verifica expiração de tempo (max_wait_candles): se a Lógica 2 não ativar dentro do limite de candles, reseta tudo e volta ao início (0 = ilimitado)
            if (seqState.currentStageIndex > 0 && maxWait > 0) {
              if (seqState.candlesSinceStageCompletion > maxWait) {
                console.log(`[ALGORITMO SEQUENCIAL] "${strat.name}" (${sideKey.toUpperCase()}): Limite de espera expirou (${seqState.candlesSinceStageCompletion} > ${maxWait} candles). Resetando tudo para o início (Lógica 1).`);
                seqState.currentStageIndex = 0;
                seqState.candlesSinceStageCompletion = 0;
                seqState.lastCompletedCandleTime = undefined;
              }
            }

            // Loop de cascata para permitir avanço de etapas subsequentes na mesma barra ou barras seguintes
            while (seqState.currentStageIndex < activeStages.length) {
              const stageToEval = activeStages[seqState.currentStageIndex];
              const stageMet = evalStageConditionsPrioritized(stageToEval);

              if (stageMet) {
                const isFinalStage = seqState.currentStageIndex === activeStages.length - 1;
                if (isFinalStage) {
                  // Todas as etapas atendidas em sequência! Reseta IMEDIATAMENTE para a Lógica 1 (impossibilita 2º disparo da Lógica 2)
                  seqState.currentStageIndex = 0;
                  seqState.candlesSinceStageCompletion = 0;
                  seqState.lastCompletedCandleTime = targetCandleTime;
                  return true;
                } else {
                  // Etapa intermediária concluída! Avança para a próxima etapa na sequência
                  seqState.currentStageIndex += 1;
                  seqState.candlesSinceStageCompletion = 0;
                  seqState.lastCompletedCandleTime = targetCandleTime;
                  console.log(`[ALGORITMO SEQUENCIAL] "${strat.name}" (${sideKey.toUpperCase()}): Etapa ${seqState.currentStageIndex} (${stageToEval.name}) concluída no candle ${targetCandleTime}. Aguardando Etapa ${seqState.currentStageIndex + 1} (${activeStages[seqState.currentStageIndex]?.name || 'Lógica ' + (seqState.currentStageIndex + 1)})...`);
                  // Continua o loop para verificar se a próxima etapa já está satisfeita nesta mesma barra
                  continue;
                }
              } else {
                break;
              }
            }

            return false;
          };

          const buyMet = evalSequentialSide('buy', buyStagesNorm);
          const sellMet = evalSequentialSide('sell', sellStagesNorm);

          // Registra que a barra fechada foi avaliada para evitar reavaliações repetidas dentro do minuto
          if (isClosedBarMode) {
            lastEvaluatedClosedCandleRef.current[closedEvalKey] = targetCandleTime;
            console.log(`[ROBÔ] 🤖 "${strat.name}" [${targetPanel.name}] avaliado no candle ${targetCandleTime}: Compra=${buyMet} | Venda=${sellMet}`);
          }

          if (buyMet || sellMet) {
            // Define o cooldown imediatamente para evitar loops contínuos a cada 250ms
            if (!isClosedBarMode) {
              alertCooldownsRef.current[`strat_${strat.id}`] = Date.now();
            }

            const side = buyMet ? 'COMPRA' : 'VENDA';
            console.log(`[ROBÔ] 🚀 SINAL DISPARADO para "${strat.name}" (${side}) no ativo ${targetPanel.name}!`);
            const now = new Date(getSyncedNowMs());
            const nowSP = getSaoPauloDate(now);
            const padFn = (n: number) => String(n).padStart(2, '0');
            const timeStr = `${padFn(nowSP.getHours())}:${padFn(nowSP.getMinutes())}:${padFn(nowSP.getSeconds())}`;

            // A. Validar Janelas Operacionais Específicas do Robô (Sessões com suporte a segundos)
            let inSession = isTimeInSessions(timeStr, strat.sessions);
            if (!inSession && isClosedBarMode && targetCandle && targetCandle.timestamp) {
              const closedTimeStr = formatSaoPauloTime(targetCandle.timestamp, true);
              inSession = isTimeInSessions(closedTimeStr, strat.sessions);
            }
            if (!inSession) {
              console.log(`[ALGORITMO] "${strat.name}" bloqueado: fora das sessões de horário configuradas (${timeStr})`);
              continue;
            }

            // Mapear rotas e contas vinculadas diretamente (somente para algoritmos Ativos / No Painel)
            const isActiveOnPanel = strat.active !== false && (strat as any).is_active !== false && (strat as any).is_enabled !== false;
            const linkedRoutes = isActiveOnPanel
              ? currentAccountStrategies.filter(
                  (s: AccountStrategy) => s.manual_strategy_id === strat.id && s.is_enabled !== false
                )
              : [];
            const activeLinkedAccounts = currentAccounts.filter((acc: BrokerAccount) => 
              acc.is_active !== false && linkedRoutes.some((r: AccountStrategy) => r.account_id === acc.id)
            );

            // Buscar se existem Prompts de IA vinculados a este Robô Algoritmo (gatilho reativo disparado por sinal do robô):
            // 1) Prompts Geradores de Sinais (prompt_type === 'signal_generator'): rodam em 2º plano para QUALQUER conta ativa vinculada e habilitada, independente do gráfico/conta na tela e do Copilot.
            // 2) Prompts de Copilot (prompt_type !== 'signal_generator'): só rodam se o Ciclo Geral do Copilot estiver ATIVO, o gráfico do ativo estiver ativo e a conta ativa tiver o prompt vinculado.
            const isCopilotActiveForTrigger = Boolean(aiEnabledRef.current && activePanelRef.current?.id === targetPanel.id);
            const currentChartAccForTrigger = activeAccountRef.current;
            const compatibleCopilotPromptIds = (isCopilotActiveForTrigger && currentChartAccForTrigger && currentChartAccForTrigger.is_active !== false)
              ? getCompatibleCopilotRoutesForAccountAndPanel(currentChartAccForTrigger, targetPanel).map(r => r.prompt_id)
              : [];

            const linkedPromptsForRobot = currentPrompts.filter(p => {
              if (!p.trigger_strategy_id) return false;
              const matchesStrat = p.trigger_strategy_id === strat.id || (() => {
                const linkedStrat = allKnownStrategies.find(s => s.id === p.trigger_strategy_id);
                return linkedStrat ? linkedStrat.name.trim().toLowerCase() === strat.name.trim().toLowerCase() : false;
              })();
              if (!matchesStrat) return false;

              if (p.prompt_type === 'signal_generator') {
                return currentAccountStrategies.some((s: AccountStrategy) =>
                  s.prompt_id === p.id &&
                  s.is_enabled !== false &&
                  currentAccounts.some(a => a.id === s.account_id && a.is_active !== false)
                );
              }

              return isCopilotActiveForTrigger && compatibleCopilotPromptIds.includes(p.id);
            });

            if (activeLinkedAccounts.length === 0 && linkedPromptsForRobot.length === 0) {
              console.log(`[ROBÔ] ⏸️ "${strat.name}" [${targetPanel.name}] ignorado: nenhuma conta vinculada ativa e nenhum prompt IA ativo.`);
              continue;
            }

            const actionType = strat.action || 'alert';

            // Cooldown de segurança por algoritmo
            alertCooldownsRef.current[`strat_${strat.id}`] = Date.now();

            const candleTimeStr = lastCandle && lastCandle.timestamp ? new Date(lastCandle.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : 'N/A';
            const execTimeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            const delaySec = lastCandle && lastCandle.timestamp ? ((now.getTime() - new Date(lastCandle.timestamp).getTime()) / 1000).toFixed(1) : '0.0';

            // Timestamp do marcador visual no gráfico: sempre a barra avaliada
            const markerCandleTime = targetCandleTime || now.toISOString();

            // =========================================================================
            // MODO 1: ESTRATÉGIA (ABERTURA DE POSIÇÃO AUTOMÁTICA NA CONTA VINCULADA)
            // =========================================================================
            if (actionType === 'position' && linkedPromptsForRobot.length === 0) {
              cache.strategyDailyTrades = cache.strategyDailyTrades || {};
              const nowSPForLimit = getSaoPauloDate(now);
              const todayCycleStartForLimit = new Date(nowSPForLimit.getFullYear(), nowSPForLimit.getMonth(), nowSPForLimit.getDate(), 19, 0, 0);
              const currentCycleStartForLimit = nowSPForLimit >= todayCycleStartForLimit ? todayCycleStartForLimit : new Date(todayCycleStartForLimit.getTime() - 24 * 60 * 60 * 1000);
              const cycleKey = currentCycleStartForLimit.toISOString();

              if (!cache.strategyDailyTrades[strat.id] || cache.strategyDailyTrades[strat.id].date !== cycleKey) {
                cache.strategyDailyTrades[strat.id] = { count: 0, date: cycleKey };
              }
              const stratLimit = Number(strat.risk_settings?.max_daily_trades || strat.max_entries || 5);

              // Cruzar com reports do banco salvos na sessão atual (desde 19:00 BRT)
              const dbTodayCount = (reportsRef.current || []).filter(r => {
                if (r.strategy_id !== strat.id && r.strategy_name !== strat.name) return false;
                if (!r.created_at) return false;
                return getSaoPauloDate(r.created_at) >= currentCycleStartForLimit;
              }).length;

              const currentTradeCount = Math.max(dbTodayCount, cache.strategyDailyTrades[strat.id].count);
              if (currentTradeCount >= stratLimit) {
                console.log(`[ALGORITMO] "${strat.name}" bloqueado: atingiu o limite de ${stratLimit} operações diárias (${currentTradeCount} já realizadas).`);
                continue;
              }

              // 🎯 Verificação e carregamento dinâmico da Estratégia ATM viva no cadastro central
              const algoAtmObj: ATMStrategy | null = resolveAlgorithmAtm(strat, atmStrategiesRef.current);
              const isUsingAtm = Boolean(strat.risk_settings?.use_atm !== false && algoAtmObj && algoAtmObj.brackets && algoAtmObj.brackets.length > 0);
              const bracketsToExecute: ATMBracket[] = isUsingAtm && algoAtmObj ? algoAtmObj.brackets : [];

              const stopValNum = Number(strat.risk_settings?.stop_value || 0);
              const takeValNum = Number(strat.risk_settings?.take_value || 0);

              let calculatedSlPrice: number | null = null;
              let calculatedTpPrice: number | null = null;

              if (stopValNum > 0) {
                calculatedSlPrice = side === 'COMPRA' ? currentPrice - stopValNum : currentPrice + stopValNum;
              }
              if (takeValNum > 0) {
                calculatedTpPrice = side === 'COMPRA' ? currentPrice + takeValNum : currentPrice - takeValNum;
              }

              let stratLots = strat.risk_settings?.lots || 1;
              if (isUsingAtm && algoAtmObj) {
                stratLots = bracketsToExecute.reduce((acc, b) => acc + (Number(b.quantity) || 1), 0);
              } else if (strat.risk_settings?.sizing_mode === 'risco' && strat.risk_settings?.max_risk_usd) {
                const pointVal = targetPanel?.point_value !== undefined && targetPanel?.point_value !== null ? Number(targetPanel.point_value) : 1.0;
                if (stopValNum > 0) {
                  const riskPerContractUsd = Math.max(0.01, stopValNum * pointVal);
                  const targetRiskUsd = Number(strat.risk_settings.max_risk_usd);
                  stratLots = Math.max(1, Math.floor(targetRiskUsd / riskPerContractUsd));
                }
              }

              const lotsToUse = stratLots;

              const openOpsInPanel = (reportsRef.current || []).filter(r => r.status === 'Em Andamento' && (r.panel_id === targetPanel.id || r.instance_id === targetPanel.instance_id));
              const allLinkedAccountsHaveOpenOps = activeLinkedAccounts.length > 0 && activeLinkedAccounts.every(acc => 
                openOpsInPanel.some(r => r.account_id === acc.id) || 
                (acc.allow_multi_signals === false && (reportsRef.current || []).some(r => r.status === 'Em Andamento' && r.account_id === acc.id))
              );

              if (allLinkedAccountsHaveOpenOps) {
                addLog('AVISO', `⚠️ [ALGORITMO] Sinal de '${strat.name}' no ativo ${targetPanel.name} ignorado: Todas as contas vinculadas já possuem operações 'Em Andamento' neste ativo ou estão no limite de sinais.`, 'alerta');
                continue;
              }

              let openedCount = 0;

              for (const targetAcc of activeLinkedAccounts) {
                const route = linkedRoutes.find((r: AccountStrategy) => r.account_id === targetAcc.id);
                const multiplier = route?.contract_size_multiplier || 1.0;

                // 🛡️ Validação Completa de Risco da Conta (Stop Diário, Meta de Lucro, Max Drawdown, Max Trades e Posição Única por Ativo)
                const opCheck = await checkOperationalLimits(targetPanel.id, targetSettings, targetAcc, false, isUsingAtm);
                if (!opCheck.allowed) {
                  addLog('AVISO', `⚠️ [ALGORITMO] Ordem de '${strat.name}' na conta '${targetAcc.account_name}' bloqueada pela Gestão: ${opCheck.reason}`, 'alerta');
                  continue;
                }

                // 🛡️ Validação de Lote Máximo Permitido na Conta
                const maxAccLots = Number(targetAcc.manual_max_lots || 0);
                const totalLotsForAcc = isUsingAtm && algoAtmObj
                  ? bracketsToExecute.reduce((sum, b) => sum + Math.max(1, Math.round((Number(b.quantity) || 1) * multiplier)), 0)
                  : Math.max(1, Math.round(lotsToUse * multiplier));

                if (maxAccLots > 0 && totalLotsForAcc > maxAccLots) {
                  addLog('AVISO', `⚠️ [ALGORITMO] Ordem de '${strat.name}' na conta '${targetAcc.account_name}' bloqueada: Lote solicitado (${totalLotsForAcc}x) excede o limite máximo permitido na conta (${maxAccLots}x).`, 'alerta');
                  continue;
                }

                const insertKey = `${targetAcc.id}_${targetPanel.id}`;
                if (pendingSignalInsertsRef.current.has(insertKey)) {
                  addLog('AVISO', `⚠️ [ALGORITMO] Ordem de '${strat.name}' na conta '${targetAcc.account_name}' ignorada: Inserção de ordem já em andamento.`, 'alerta');
                  continue;
                }
                pendingSignalInsertsRef.current.add(insertKey);

                try {
                  const targetSymbol = targetPanel.gamma_symbol || targetSettings?.gamma_symbol || (() => {
                    const norm = (targetPanel.name || targetPanel.instance_id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (norm.includes('sp500') || norm.includes('sp') || norm.includes('es')) return 'ES';
                    if (norm.includes('nasdaq') || norm.includes('nq')) return 'NQ';
                    if (norm.includes('gold') || norm.includes('ouro') || norm.includes('gc')) return 'GC';
                    if (norm.includes('oil') || norm.includes('petr') || norm.includes('cl')) return 'CL';
                    if (norm.includes('dxy') || norm.includes('usdindex')) return 'DXY';
                    return targetPanel.name || 'NQ';
                  })();

                  const tickSize = resolvePanelTickSize(targetPanel, targetSettings);

                  if (isUsingAtm && bracketsToExecute.length > 0 && algoAtmObj) {
                    // =========================================================================
                    // MODO ATM: EXECUÇÃO POR ALVOS MÚLTIPLOS (BRACKETS, BE & TRAILING STOP)
                    // =========================================================================
                    let accountOpenedBrackets = 0;

                    for (let idx = 0; idx < bracketsToExecute.length; idx++) {
                      const bracket = bracketsToExecute[idx];
                      const maxAccLots = Number(targetAcc.manual_max_lots || 0);
                      const rawBracketLots = Math.max(1, Math.round((Number(bracket.quantity) || 1) * multiplier));
                      const bracketLots = maxAccLots > 0 && rawBracketLots > maxAccLots ? maxAccLots : rawBracketLots;
                      const actualSlPts = bracket.stopLossPts;
                      const actualTpPts = bracket.takeProfitPts;

                      const bSlPrice = roundToTick(side === 'COMPRA' ? currentPrice - actualSlPts : currentPrice + actualSlPts, tickSize);
                      const bTpPrice = roundToTick(side === 'COMPRA' ? currentPrice + actualTpPts : currentPrice - actualTpPts, tickSize);

                      const beStr = bracket.autoBreakevenEnabled ? ` | BE: ${bracket.autoBreakevenTriggerPts}+${bracket.autoBreakevenOffsetPts}` : '';
                      const trailStr = bracket.trailingStopEnabled ? ` | TRAIL: ${bracket.trailingStopTriggerPts}/${bracket.trailingStopStepPts}` : '';
                      const stratReportName = bracketsToExecute.length > 1 ? `${strat.name} (Alvo ${idx + 1})` : strat.name;

                      const newReport = await insertStrategyReportSupabase({
                        strategy_id: strat.id || null,
                        strategy_name: stratReportName,
                        side: side,
                        entry_price: currentPrice,
                        stop_loss: bSlPrice,
                        take_profit: bTpPrice,
                        exit_price: null,
                        status: 'Em Andamento',
                        description: `[${targetSymbol}] ${strat.name} - ${algoAtmObj.name} (${bracketLots}x - SL: ${actualSlPts}pt / TP: ${actualTpPts}pt${beStr}${trailStr})`,
                        instance_id: targetPanel.instance_id,
                        panel_id: targetPanel.id,
                        contrato: bracketLots,
                        account_id: targetAcc.id,
                        symbol: targetSymbol,
                        is_atm: true,
                        allow_multi: true,
                        created_at: now.toISOString()
                      });

                      if (newReport) {
                        accountOpenedBrackets++;
                        openedCount++;
                        reportsRef.current = [newReport, ...reportsRef.current.filter(r => r.id !== newReport.id)];
                        setReports(prev => [newReport, ...prev.filter(r => r.id !== newReport.id)]);

                        if (!activeReportIdsRef.current.has(targetPanel.id)) {
                          activeReportIdsRef.current.set(targetPanel.id, new Set());
                        }
                        activeReportIdsRef.current.get(targetPanel.id)!.add(newReport.id);
                      }
                    }

                    if (accountOpenedBrackets > 0) {
                      addLog('SISTEMA', `🚀 [ALGORITMO ATM] Ordens (${side}) ABERTAS para '${strat.name}' [ATM: ${algoAtmObj.name}] na conta '${targetAcc.account_name}'! (${accountOpenedBrackets} alvos executados)`, 'sistema');
                      await fetchReportsList();

                      if (targetSettings.alert_sound_enabled !== false) {
                        playAlertBeep(659.25, 300);
                      }

                      setActiveAlert({
                        title: `[ALGO ATM] ${strat.name.toUpperCase()} (🔴 ${accountOpenedBrackets} ALVOS ABERTOS - ${targetAcc.account_name})`,
                        message: `Sinal de ${side} com ATM ${algoAtmObj.name} na conta ${targetAcc.account_name}!`,
                        detail: `Executados ${accountOpenedBrackets} alvos com gestão ATM autônoma (Breakeven/Trailing Stop).`,
                        tipo: `strat_${strat.id}`,
                        strategyId: strat.id,
                        panelId: targetPanel.id,
                        panelName: targetPanel.name
                      } as any);

                      if (targetSettings.telegram_enabled) {
                        enviarTelegramAlert(
                          `ALGORITMO ATM: ${strat.name} [CONTA: ${targetAcc.account_name}]`,
                          `[${targetPanel.name}] Executada ATM ${algoAtmObj.name} (${side}) na conta ${targetAcc.account_name}`,
                          `Alvos: ${accountOpenedBrackets} | Preço Entrada: ${currentPrice.toFixed(2)}`,
                          targetSettings,
                          undefined,
                          targetPanel
                        );
                      }

                      // Registrar sinal visual específico para a conta
                      setCustomSignals(prev => {
                        const exists = prev.some(s => s.panelId === targetPanel.id && s.time === markerCandleTime && s.strategyId === strat.id && s.accountId === targetAcc.id);
                        if (exists) return prev;
                        return [...prev, {
                          id: Math.random().toString(36).substring(2, 9),
                          strategyId: strat.id,
                          strategyName: strat.name,
                          panelId: targetPanel.id,
                          accountId: targetAcc.id,
                          accountName: targetAcc.account_name,
                          time: markerCandleTime,
                          side: side,
                          price: currentPrice
                        }];
                      });
                    } else {
                      addLog('ERRO', `❌ [ALGORITMO ATM] Falha ao registrar ordens para '${strat.name}' na conta '${targetAcc.account_name}'.`, 'erro');
                    }
                  } else {
                    // =========================================================================
                    // MODO LEGADO (1 ÚNICA ORDEM FIXA COM STOP / TAKE DA CONFIGURAÇÃO)
                    // =========================================================================
                    const maxAccLots = Number(targetAcc.manual_max_lots || 0);
                    const rawFinalLots = Math.max(1, Math.round(lotsToUse * multiplier));
                    const finalLots = maxAccLots > 0 && rawFinalLots > maxAccLots ? maxAccLots : rawFinalLots;
                    const detailsMsg = `📍 Entrada: ${currentPrice.toFixed(2)}\n` +
                      `🛑 Stop Loss: ${calculatedSlPrice ? calculatedSlPrice.toFixed(2) : 'Sem Nível'}\n` +
                      `🎯 Take Profit: ${calculatedTpPrice ? calculatedTpPrice.toFixed(2) : 'Sem Nível'}\n` +
                      `📊 Contratos: ${finalLots}\n` +
                      `👤 Conta: ${targetAcc.account_name}\n` +
                      `🤖 Estratégia: ${strat.name}\n` +
                      `⏱️ Vela: ${candleTimeStr} | Execução: ${execTimeStr} (Latência: ${delaySec}s)`;

                    const newReport = await insertStrategyReportSupabase({
                      strategy_id: strat.id || null,
                      strategy_name: strat.name,
                      side: side,
                      entry_price: currentPrice,
                      stop_loss: calculatedSlPrice,
                      take_profit: calculatedTpPrice,
                      exit_price: null,
                      status: 'Em Andamento',
                      description: detailsMsg,
                      instance_id: targetPanel.instance_id,
                      panel_id: targetPanel.id,
                      contrato: finalLots,
                      account_id: targetAcc.id,
                      symbol: targetSymbol,
                      created_at: now.toISOString()
                    });

                    if (newReport) {
                      openedCount++;
                      reportsRef.current = [newReport, ...reportsRef.current.filter(r => r.id !== newReport.id)];
                      setReports(prev => [newReport, ...prev.filter(r => r.id !== newReport.id)]);

                      if (!activeReportIdsRef.current.has(targetPanel.id)) {
                        activeReportIdsRef.current.set(targetPanel.id, new Set());
                      }
                      activeReportIdsRef.current.get(targetPanel.id)!.add(newReport.id);
                      addLog('SISTEMA', `🚀 [ALGORITMO] Ordem (${side}) ABERTA com sucesso para '${strat.name}' na conta '${targetAcc.account_name}'! (Lote: ${finalLots}x)`, 'sistema');
                      await fetchReportsList();

                      if (targetSettings.alert_sound_enabled !== false) {
                        playAlertBeep(659.25, 300);
                      }

                      setActiveAlert({
                        title: `[ALGO] ${strat.name.toUpperCase()} (🔴 ORDEM ABERTA - ${targetAcc.account_name})`,
                        message: `Sinal de ${side} na conta ${targetAcc.account_name}!`,
                        detail: detailsMsg,
                        tipo: `strat_${strat.id}`,
                        strategyId: strat.id,
                        panelId: targetPanel.id,
                        panelName: targetPanel.name
                      } as any);

                      if (targetSettings.telegram_enabled) {
                        enviarTelegramAlert(
                          `ALGORITMO: ${strat.name} [ORDEM NA CONTA: ${targetAcc.account_name}]`,
                          `[${targetPanel.name}] Executada Ordem de ${side} na conta ${targetAcc.account_name}`,
                          detailsMsg,
                          targetSettings,
                          undefined,
                          targetPanel
                        );
                      }

                      // Registrar sinal visual específico para a conta
                      setCustomSignals(prev => {
                        const exists = prev.some(s => s.panelId === targetPanel.id && s.time === markerCandleTime && s.strategyId === strat.id && s.accountId === targetAcc.id);
                        if (exists) return prev;
                        return [...prev, {
                          id: Math.random().toString(36).substring(2, 9),
                          strategyId: strat.id,
                          strategyName: strat.name,
                          panelId: targetPanel.id,
                          accountId: targetAcc.id,
                          accountName: targetAcc.account_name,
                          time: markerCandleTime,
                          side: side,
                          price: currentPrice
                        }];
                      });
                    } else {
                      addLog('ERRO', `❌ [ALGORITMO] Falha ao registrar ordem para '${strat.name}' na conta '${targetAcc.account_name}'.`, 'erro');
                    }
                  }
                } catch (err: any) {
                  console.error('[ALGORITMO] Erro ao salvar report de operação:', err);
                  addLog('ERRO', `❌ [ALGORITMO] Erro na inserção de ordem para '${strat.name}': ${err.message || err}`, 'erro');
                } finally {
                  pendingSignalInsertsRef.current.delete(insertKey);
                }
              }

              if (openedCount > 0) {
                cache.strategyDailyTrades[strat.id].count++;
              }
            } 
            // =========================================================================
            // MODO 2: INDICADOR (AVISOS VISUAIS E NOTIFICAÇÕES SEM GESTÃO DE ORDENS)
            // =========================================================================
            else {
              const hasLinkedPrompts = linkedPromptsForRobot.length > 0;

              if (!hasLinkedPrompts) {
                if (targetSettings.alert_sound_enabled !== false) {
                  playAlertBeep(659.25, 300);
                }

                if (activeLinkedAccounts.length > 0) {
                  // Dispara alerta individualizado para cada conta vinculada
                  for (const targetAcc of activeLinkedAccounts) {
                    const detailsMsg = `📍 Preço: ${currentPrice.toFixed(2)}\n` +
                      `👤 Conta: ${targetAcc.account_name}\n` +
                      `🤖 Indicador: ${strat.name}\n` +
                      `⏱️ Vela: ${candleTimeStr} | Disparo: ${execTimeStr} (Latência: ${delaySec}s)`;

                    setActiveAlert({
                      title: `[ALGO] ${strat.name.toUpperCase()} (⚡ INDICADOR - ${targetAcc.account_name})`,
                      message: `Sinal de ${side} na conta ${targetAcc.account_name}!`,
                      detail: detailsMsg,
                      tipo: `strat_${strat.id}`,
                      strategyId: strat.id,
                      panelId: targetPanel.id,
                      panelName: targetPanel.name
                    } as any);

                    if (targetSettings.telegram_enabled) {
                      enviarTelegramAlert(
                        `ALGORITMO: ${strat.name} [INDICADOR - ${targetAcc.account_name}]`,
                        `[${targetPanel.name}] Sinal de ${side} na conta ${targetAcc.account_name}`,
                        detailsMsg,
                        targetSettings,
                        undefined,
                        targetPanel
                      );
                    }

                    // Registrar sinal visual específico para a conta vinculada
                    setCustomSignals(prev => {
                      const exists = prev.some(s => s.panelId === targetPanel.id && s.time === markerCandleTime && s.strategyId === strat.id && s.accountId === targetAcc.id);
                      if (exists) return prev;
                      return [...prev, {
                        id: Math.random().toString(36).substring(2, 9),
                        strategyId: strat.id,
                        strategyName: strat.name,
                        panelId: targetPanel.id,
                        accountId: targetAcc.id,
                        accountName: targetAcc.account_name,
                        time: markerCandleTime,
                        side: side,
                        price: currentPrice
                      }];
                    });
                  }
                } else {
                  // Sem conta vinculada: Alerta Global
                  const detailsMsg = `📍 Preço: ${currentPrice.toFixed(2)}\n` +
                    `🤖 Indicador: ${strat.name}\n` +
                    `⏱️ Vela: ${candleTimeStr} | Disparo: ${execTimeStr} (Latência: ${delaySec}s)`;

                  if (targetSettings.resource_chart_alerts_enabled !== false) {
                    setActiveAlert({
                      title: `[ALGO] ${strat.name.toUpperCase()} (⚡ INDICADOR)`,
                      message: `Sinal de ${side} (ALERTA)!`,
                      detail: detailsMsg,
                      tipo: `strat_${strat.id}`,
                      strategyId: strat.id,
                      panelId: targetPanel.id,
                      panelName: targetPanel.name
                    } as any);
                  }

                  if (targetSettings.telegram_enabled) {
                    enviarTelegramAlert(
                      `ALGORITMO: ${strat.name} [INDICADOR]`,
                      `[${targetPanel.name}] Sinal de ${side}`,
                      detailsMsg,
                      targetSettings,
                      undefined,
                      targetPanel
                    );
                  }

                  setCustomSignals(prev => {
                    const exists = prev.some(s => s.panelId === targetPanel.id && s.time === markerCandleTime && s.strategyId === strat.id);
                    if (exists) return prev;
                    return [...prev, {
                      id: Math.random().toString(36).substring(2, 9),
                      strategyId: strat.id,
                      strategyName: strat.name,
                      panelId: targetPanel.id,
                      accountId: null,
                      accountName: null,
                      time: markerCandleTime,
                      side: side,
                      price: currentPrice
                    }];
                  });
                }

                addLog('SISTEMA', `ℹ️ [ALGORITMO] Sinal de '${strat.name}' emitiu ALERTA/INDICADOR.`, 'sistema');
              } else {
                addLog('SISTEMA', `🧠 [ALGORITMO] '${strat.name}' acionou o Prompt IA vinculado — delegando análise e ordem à IA.`, 'sistema');
              }
            }

            // Executar validação por IA se houver prompts vinculados ao robô
            if (linkedPromptsForRobot.length > 0) {
              (async () => {
                for (const prompt of linkedPromptsForRobot) {
                  const detailsMsg = `📍 Entrada: ${currentPrice.toFixed(2)}\n` +
                    `🤖 Algoritmo: ${strat.name}\n` +
                    `⏱️ Vela: ${candleTimeStr} | Execução: ${execTimeStr} (Latência: ${delaySec}s)`;

                  await executeAiCycleForPanel(targetPanel, { ...targetSettings, selected_prompt_id: prompt.id }, {
                    strategyName: strat.name,
                    side: side as 'COMPRA' | 'VENDA',
                    timeframe: strat.timeframe || 1,
                    details: detailsMsg,
                    lots: strat.risk_settings?.lots || 1
                  });
                }
              })();
            }

            // Incrementa o contador de execuções da estratégia
            if (cache.strategyDailyTrades && cache.strategyDailyTrades[strat.id]) {
              cache.strategyDailyTrades[strat.id].count++;
            }
          }
        }
      }
    }
  }
};

  /**
   * 🛡️ Filtro de Integridade e Compatibilidade de Cotação de Mercado com o Painel
   * Impede contaminação cruzada (ex: cotação de 29.000 do NASDAQ sendo aplicada ao gráfico do SP500 de 7.780).
   */
  const isMarketDataCompatibleWithPanel = (panelNameOrId: string, marketSymbol?: string): boolean => {
    if (!panelNameOrId || !marketSymbol) return true;
    const p = String(panelNameOrId).toUpperCase();
    const m = String(marketSymbol).toUpperCase();

    const isSP = p.includes('SP500') || p.includes('MES') || p.includes('S&P') || p.includes('ES');
    const isNQ = p.includes('NASDAQ') || p.includes('MNQ') || p.includes('NQ') || p.includes('PRINCIPAL');
    const isGold = p.includes('GOLD') || p.includes('MGC') || p.includes('GC') || p.includes('OURO');
    const isOil = p.includes('OIL') || p.includes('PETROLEO') || p.includes('PETRÓLEO') || p.includes('MCL') || p.includes('CL');
    const isDow = p.includes('DOW') || p.includes('MYM') || p.includes('YM') || p.includes('US30');
    const isRussel = p.includes('RUSSEL') || p.includes('M2K') || p.includes('RTY');

    if (isSP && (m.includes('NQ') || m.includes('GC') || m.includes('CL') || m.includes('YM') || m.includes('RTY') || m.includes('M2K'))) return false;
    if (isNQ && (m.includes('ES') || m.includes('MES') || m.includes('GC') || m.includes('CL') || m.includes('YM') || m.includes('RTY') || m.includes('M2K'))) return false;
    if (isGold && (m.includes('NQ') || m.includes('ES') || m.includes('MES') || m.includes('CL') || m.includes('YM') || m.includes('RTY') || m.includes('M2K'))) return false;
    if (isOil && (m.includes('NQ') || m.includes('ES') || m.includes('MES') || m.includes('GC') || m.includes('YM') || m.includes('RTY') || m.includes('M2K'))) return false;
    if (isDow && (m.includes('NQ') || m.includes('ES') || m.includes('MES') || m.includes('GC') || m.includes('CL') || m.includes('RTY') || m.includes('M2K'))) return false;
    if (isRussel && (m.includes('NQ') || m.includes('ES') || m.includes('MES') || m.includes('GC') || m.includes('CL') || m.includes('YM'))) return false;

    return true;
  };

  const executeMarketCycleForPanel = async (targetPanel: any, targetSettings: any) => {
    if (!targetPanel || !targetSettings) return;

    if (runningMarketCycles.current.has(targetPanel.id)) {
      return;
    }
    runningMarketCycles.current.add(targetPanel.id);

    try {
      const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
      const adminSet = !isSystemAdmin ? getAdminSetForPanel(targetPanel) : null;
      const mode = adminSet?.source_market || targetSettings.source_market;

      const instanceMarket = (adminSet?.instance_id_market) 
        || targetSettings.instance_id_market 
        || targetPanel.instance_id 
        || 'nt8_main';

      const instanceForce = (adminSet?.instance_id_force) 
        || targetSettings.instance_id_force 
        || 'painel_principal_web';

      const gammaSymbol = adminSet?.gamma_symbol || targetSettings.gamma_symbol;

      const checkIsActive = () => activePanelRef.current?.id === targetPanel.id;

      const isWsConfigured = (adminSet?.transmission_mode || targetSettings.transmission_mode) === 'websocket';
      const isWs = isWsConfigured && Boolean(wsHubSocketRef.current && wsHubSocketRef.current.readyState === WebSocket.OPEN);

      // a. Inicializar Cache do Painel (persiste imediatamente na referência para impedir re-alocações quando mData é nulo)
      if (!panelDataCache.current[targetPanel.id]) {
        panelDataCache.current[targetPanel.id] = {
          marketData: null,
          forces: [],
          gammaLevels: null,
          screenshot: null,
          candles: [],
          lastGammaFetch: 0,
          lastGammaSymbol: '',
          lastScreenshotFetch: 0,
          lastCandlesFetch: 0,
          lastForceFetch: 0,
          isFetchingForce: false,
          isFetchingGamma: false,
          isFetchingCandles: false,
          isFetchingScreenshot: false
        };
      }
      const cache = panelDataCache.current[targetPanel.id];

      // b. Buscar Market Data em Alta Velocidade
      let mData: MarketData | null = null;
      if (isWs) {
        // No modo WebSocket Streaming, os dados vêm 100% em tempo real pelo Hub
        mData = cache.marketData;
      } else if (mode === 'local') {
        mData = await fetchLocalSinal();
      } else {
        // Modo Híbrido: se o WebSocket do NinjaTrader local (:8002) estiver conectado, os dados já chegam por push (<1ms)!
        // Evita chamadas HTTP contínuas redundantes a cada ciclo de relógio
        if (isStreamerWsConnected() && cache.marketData) {
          mData = cache.marketData;
        } else {
          const localStreamQuote = await fetchStreamerMarketData(targetPanel, targetSettings);
          if (localStreamQuote) {
            mData = localStreamQuote;
          } else {
            mData = await fetchMarketDataSupabase(instanceMarket);
          }
        }
      }

      // Validação de compatibilidade do instrumento para impedir contaminação cruzada
      if (mData && mData.symbol) {
        const isCompatible = isMarketDataCompatibleWithPanel(targetPanel.name || targetPanel.id, mData.symbol);
        if (!isCompatible) {
          mData = null;
        }
      }

      const now = Date.now();

      // Atualização imediata do preço em tempo real no candle em formação (somente se a cotação for recente <= 45s)
      const isMDataTimestampFresh = mData?.updated_at ? (Date.now() - (parseInputToDate(mData.updated_at)?.getTime() || 0) <= 45000) : false;
      if (mData && isMDataTimestampFresh && mData.price && mData.price !== '--' && cache.candles && cache.candles.length > 0) {
        const numPrice = parseNumericValue(mData.price);
        if (numPrice && !isNaN(numPrice) && numPrice > 0) {
          const { updatedCandles, hasChanged, isNewBar } = applyRealtimePriceToCandles(cache.candles, numPrice, mData.updated_at);
          if (hasChanged) {
            cache.candles = updatedCandles;
            if (isNewBar && checkIsActive()) {
              setCandles([...updatedCandles]);
            } else if (!checkIsActive()) {
              bumpPanelCacheVersion();
            }
          }
        }
      }

      // c. Executar a lógica de mercado, preço, relógio e algoritmos IMEDIATAMENTE
      runMarketLogicForPanel(targetPanel, targetSettings, cache, mData, cache.forces || [], cache.gammaLevels || null);

      // d. Definição de intervalos dinâmicos configurados para consultas auxiliares
      const forcesInterval = targetSettings.force_update_interval !== undefined
        ? Number(targetSettings.force_update_interval)
        : (adminSet?.force_update_interval !== undefined ? Number(adminSet.force_update_interval) : 1500);

      const candlesInterval = targetSettings.candles_update_interval !== undefined
        ? Number(targetSettings.candles_update_interval)
        : (adminSet?.candles_update_interval !== undefined ? Number(adminSet.candles_update_interval) : 2000);

      const screenshotInterval = targetSettings.screenshot_update_interval !== undefined
        ? Number(targetSettings.screenshot_update_interval)
        : (adminSet?.screenshot_update_interval !== undefined ? Number(adminSet.screenshot_update_interval) : 3000);

      // e. Buscar Força em background (atualiza periodicamente as forças da cesta macro/IMF)
      const lastForceFetch = cache.lastForceFetch || 0;
      if (!cache.isFetchingForce && (now - lastForceFetch >= forcesInterval || !cache.forces || cache.forces.length === 0)) {
        cache.isFetchingForce = true;
        cache.lastForceFetch = now;
        fetchForceSupabase(instanceForce).then(forceData => {
          if (forceData && forceData.forces) {
            const prevForces = cache.forces || [];
            const isForcesChanged = prevForces.length !== forceData.forces.length ||
              forceData.forces.some((f: any, idx: number) => !prevForces[idx] || prevForces[idx].buy !== f.buy || prevForces[idx].sell !== f.sell);
            cache.forces = forceData.forces;
            if (checkIsActive() && isForcesChanged) {
              setForces(forceData.forces);
            }
          }
        }).catch(() => {}).finally(() => {
          cache.isFetchingForce = false;
        });
      }

      // f. Buscar Níveis Gamma em background
      const needsFetchGamma =
        cache.lastGammaSymbol !== gammaSymbol ||
        (now - cache.lastGammaFetch) > 60 * 1000;

      if (!cache.isFetchingGamma && needsFetchGamma && gammaSymbol) {
        cache.isFetchingGamma = true;
        cache.lastGammaSymbol = gammaSymbol;
        cache.lastGammaFetch = now;
        fetchGammaLevelsSupabase(gammaSymbol).then(fetchedLevels => {
          if (fetchedLevels) {
            const prevGamma = cache.gammaLevels;
            const isGammaChanged = !prevGamma ||
              prevGamma.hvl !== fetchedLevels.hvl ||
              prevGamma.call !== fetchedLevels.call ||
              prevGamma.put !== fetchedLevels.put ||
              prevGamma.max1d !== fetchedLevels.max1d ||
              prevGamma.min1d !== fetchedLevels.min1d ||
              prevGamma.prev !== fetchedLevels.prev ||
              prevGamma.prevH !== fetchedLevels.prevH ||
              prevGamma.prevL !== fetchedLevels.prevL ||
              prevGamma.gwall !== fetchedLevels.gwall ||
              prevGamma.hvl0 !== fetchedLevels.hvl0 ||
              prevGamma.gamma_bias !== fetchedLevels.gamma_bias ||
              prevGamma.buy_strength !== fetchedLevels.buy_strength ||
              prevGamma.sell_strength !== fetchedLevels.sell_strength ||
              prevGamma.bias_score !== fetchedLevels.bias_score ||
              prevGamma.recommended_strategy !== fetchedLevels.recommended_strategy ||
              prevGamma.nearest_support !== fetchedLevels.nearest_support ||
              prevGamma.nearest_resistance !== fetchedLevels.nearest_resistance ||
              prevGamma.confluence_type !== fetchedLevels.confluence_type;
            cache.gammaLevels = fetchedLevels;
            if (checkIsActive() && isGammaChanged) {
              setGammaLevels(fetchedLevels);
            }
          }
        }).catch(() => {}).finally(() => {
          cache.isFetchingGamma = false;
        });
      }

      // f2. Buscar Dados de Mercado de Opções (GRIX Core) em background
      const lastOptionsMarketFetch = cache.lastOptionsMarketFetch || 0;
      const needsFetchOptionsMarket = (now - lastOptionsMarketFetch) > 30 * 1000;

      if (!cache.isFetchingOptionsMarket && needsFetchOptionsMarket) {
        cache.isFetchingOptionsMarket = true;
        cache.lastOptionsMarketFetch = now;
        fetchOptionsMarketSupabase().then(fetchedOptions => {
          if (fetchedOptions) {
            cache.optionsMarket = fetchedOptions;
            if (checkIsActive()) {
              setOptionsMarket(fetchedOptions);
            }
          }
        }).catch(() => {}).finally(() => {
          cache.isFetchingOptionsMarket = false;
        });
      }

      // g. Sincronização periódica de Candles do banco de dados (Ativo em 1º plano E painéis em 2º plano para algoritmos/prompts geradores de sinais)
      const lastCandles = cache.lastCandlesFetch || 0;
      const lastScreenshot = cache.lastScreenshotFetch || 0;
      const isForced = lastCandles === 0;
      const effectiveCandlesInterval = checkIsActive() ? candlesInterval : Math.max(candlesInterval, 5000);

      const hasExisting = Boolean(cache.candles && cache.candles.length > 0);
      const historyDays = Math.max(3, Number(targetSettings.chart_history_days) || 3);
      const maxCandleLimit = Math.min(50000, Math.max(4320, historyDays * 1440));

      // Verificar se existe um GAP de dados (> 2 minutos) na ponta ou lacuna interna anormal (ex: computador desconectado)
      const lastExistingMs = (hasExisting && cache.candles && cache.candles.length > 0)
        ? new Date(cache.candles[cache.candles.length - 1].timestamp).getTime()
        : 0;
      if (lastExistingMs > 0) {
        syncServerClock(lastExistingMs);
      }
      const syncedNow = getSyncedNowMs();
      // Tolerância de 5 minutos para pausa normal de fechamento de barras
      const hasTailGap = hasExisting && (!lastExistingMs || isNaN(lastExistingMs) || (syncedNow - lastExistingMs > 5 * 60 * 1000));
      const hasInternalGap = hasExisting && cache.candles ? detectInternalCandleGap(cache.candles) : false;
      const isMissingHistory = hasExisting && cache.candles ? (cache.candles.length < Math.min(maxCandleLimit, 1440)) : false;
      
      const lastGapCheck = (cache as any).lastGapCheckTime || 0;
      const canCheckGap = (now - lastGapCheck) >= 30000; // Cooldown de 30s para checagens de gap
      const hasGap = canCheckGap && (hasTailGap || hasInternalGap || isMissingHistory);

      // Em modo WebSocket, o streaming atende o tempo real, mas SE HOUVER GAP verificado, recarga forçada ou ausência de velas,
      // DEVE buscar dados para preencher lacunas de quando o PC esteve desligado/suspenso!
      const shouldFetchCandles = isWs
        ? (isForced || hasGap || !hasExisting)
        : (isForced || hasGap || now - lastCandles >= effectiveCandlesInterval || !hasExisting);

      if (!cache.isFetchingCandles && shouldFetchCandles) {
        cache.isFetchingCandles = true;
        cache.lastCandlesFetch = now;
        if (hasGap) (cache as any).lastGapCheckTime = now;
        if (!hasExisting && checkIsActive()) setIsCandlesLoading(true);

        const candleInstanceId = targetSettings.instance_id_screen 
          || targetPanel.instance_id 
          || (adminSet ? adminSet.instance_id_screen : null) 
          || 'nt8_main';

        // REGRA DE OURO: Se já temos velas na memória, buscamos apenas as últimas 50 para preencher qualquer gap da ponta.
        // O limite histórico completo (ex: 4320 barras para 3 dias) só é consultado na carga inicial do painel ativo ou por recarga forçada!
        const isActivePanelNow = checkIsActive();
        const isVisibleMultiPanel = visibleMultiPanelIdsRef.current.includes(targetPanel.id);
        const isPanelDisplayed = isActivePanelNow || isVisibleMultiPanel;
        const isInitialForPanel = !initialLoadedPanelsRef.current.has(targetPanel.id);
        const effectiveMaxLimit = isPanelDisplayed ? maxCandleLimit : Math.min(maxCandleLimit, 500);
        const lastCandle = hasExisting && cache.candles && cache.candles.length > 0 ? cache.candles[cache.candles.length - 1] : null;
        const deltaSince = (!isForced && hasExisting && !hasGap && !isInitialForPanel && lastCandle?.timestamp) ? lastCandle.timestamp : undefined;
        const queryLimit = (isForced || !hasExisting || (isInitialForPanel && isPanelDisplayed) || hasGap) ? effectiveMaxLimit : 50;
        const shouldShowSlotGauge = isPanelDisplayed && (!hasExisting || isInitialForPanel || isMissingHistory || queryLimit > 500);

        if (shouldShowSlotGauge) {
          (cache as any).loadingProgress = {
            isLoading: true,
            percent: 15,
            loaded: 0,
            total: queryLimit,
            days: historyDays,
            isExplicitDaysChange: true
          };
          if (isActivePanelNow) {
            setCandlesLoadingProgress((cache as any).loadingProgress);
            setIsCandlesLoading(true);
          } else {
            bumpPanelCacheVersion();
          }
        }

        // Watchdog de 30s: o semáforo isFetchingCandles NUNCA pode ficar preso (causa do gauge congelado em 15%)
        withDbTimeout(fetchCandlesSupabase(
          targetPanel.id,
          candleInstanceId,
          queryLimit,
          targetPanel,
          targetSettings,
          (pct, loaded, _total) => {
            // O modal de Gauge circular só deve ser exibido na carga inicial sem velas, falta de histórico ou troca explícita de dias
            if (shouldShowSlotGauge) {
              const nextProgress = {
                isLoading: pct < 100,
                percent: pct,
                loaded,
                total: queryLimit,
                days: historyDays,
                isExplicitDaysChange: true
              };
              (cache as any).loadingProgress = nextProgress;
              if (checkIsActive()) {
                setCandlesLoadingProgress(nextProgress);
              } else {
                bumpPanelCacheVersion();
              }
            }
          },
          deltaSince
        ), 30000).then(candlesData => {
          if (candlesData && candlesData.length > 0) {
            if (isPanelDisplayed || candlesData.length >= maxCandleLimit) {
              initialLoadedPanelsRef.current.add(targetPanel.id);
            }
            // O histórico retornado por fetchCandlesSupabase é a fonte canônica higienizada
            const minuteMap = new Map<number, Candle>();

            // 1. Preservar SEMPRE todo o histórico que já existe na memória!
            // Se já tínhamos milhares de velas carregadas, NUNCA descartá-las quando a consulta periódica for de 50 barras!
            if (cache.candles && cache.candles.length > 0) {
              cache.candles.forEach((c: Candle) => {
                if (!c || !c.timestamp) return;
                const t = new Date(c.timestamp).getTime();
                if (isNaN(t) || t <= 0) return;
                minuteMap.set(Math.floor(t / 60000), c);
              });
            }

            // 2. Popula e sobrepõe com os dados históricos oficiais
            candlesData.forEach((c: Candle) => {
              if (!c || !c.timestamp) return;
              const t = new Date(c.timestamp).getTime();
              if (isNaN(t) || t <= 0) return;
              minuteMap.set(Math.floor(t / 60000), c);
            });

            // 2.1 SELAGEM DE VELAS FECHADAS: na consulta periódica (últimas 50 barras) só a vela corrente
            // (e a que acabou de fechar, durante 5s de tolerância para receber o fechamento final) pode ser alterada.
            // Toda vela com minuto já encerrado e consolidado em memória é imutável e NÃO é replotada pelo feed.
            if (queryLimit <= 50 && cache.candles && cache.candles.length > 0) {
              const sealBeforeMinute = Math.floor((getSyncedNowMs() - 5000) / 60000);
              cache.candles.forEach((c: Candle) => {
                if (!c || !c.timestamp) return;
                const t = new Date(c.timestamp).getTime();
                if (isNaN(t) || t <= 0) return;
                const key = Math.floor(t / 60000);
                if (key < sealBeforeMinute) minuteMap.set(key, c);
              });
            }

            // 2. Preserva apenas velas locais contíguas (no máximo 1 minuto após o histórico) e com preço coerente
            const lastHistCandle = candlesData[candlesData.length - 1];
            const lastHistMs = new Date(lastHistCandle.timestamp).getTime();
            const lastHistClose = Number(lastHistCandle.close) || 0;

            if (cache.candles && cache.candles.length > 0 && lastHistMs > 0 && lastHistClose > 0) {
              cache.candles.forEach((c: Candle) => {
                if (!c || !c.timestamp) return;
                const t = new Date(c.timestamp).getTime();
                if (isNaN(t) || t <= lastHistMs) return;
                // Só aceita vela posterior se for contígua (até 3 minutos à frente para preservar a vela corrente em formação)
                // e com variação máxima de 3.5% em relação ao fechamento do histórico
                if (t <= lastHistMs + 180000) {
                  const cClose = Number(c.close) || 0;
                  if (cClose > 0 && Math.abs(cClose - lastHistClose) / lastHistClose <= 0.035) {
                    minuteMap.set(Math.floor(t / 60000), c);
                  }
                }
              });
            }

            const sortedCandles = Array.from(minuteMap.values())
              .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            let finalCandlesList = cleanAndSanitizeCandles(sortedCandles).slice(-maxCandleLimit);

            // 3. Aplicar o preço em tempo real imediatamente sobre o histórico recém baixado (apenas se a cotação for recente <= 45s)
            const isMDataRecent = mData?.updated_at ? (Date.now() - (parseInputToDate(mData.updated_at)?.getTime() || 0) <= 45000) : false;
            if (mData && isMDataRecent && mData.price && mData.price !== '--') {
              const numPrice = parseNumericValue(mData.price);
              if (numPrice && !isNaN(numPrice) && numPrice > 0) {
                const { updatedCandles } = applyRealtimePriceToCandles(finalCandlesList, numPrice, mData.updated_at);
                finalCandlesList = cleanAndSanitizeCandles(updatedCandles).slice(-maxCandleLimit);
              }
            }

            const lastCandle = finalCandlesList[finalCandlesList.length - 1];
            const lastCandleTime = lastCandle ? lastCandle.timestamp : null;
            if ((cache as any).previousLastCandleTime && lastCandleTime && lastCandleTime !== (cache as any).previousLastCandleTime) {
              if (checkIsActive() && aiEnabledRef.current && targetSettings.ai_trigger_mode === 'barra') {
                addLog('IA', `[${targetPanel.name}] Novo candle fechado detectado (${lastCandleTime}). Disparando análise de IA...`, 'sistema');
                executeAiCycleForPanel(targetPanel, targetSettings);
              }
            }
            (cache as any).previousLastCandleTime = lastCandleTime;

            const prevCandles = cache.candles || [];
            let isDifferent = prevCandles.length !== finalCandlesList.length;
            if (!isDifferent && prevCandles.length > 0 && finalCandlesList.length > 0) {
              const checkBars = Math.min(6, finalCandlesList.length);
              for (let i = 1; i <= checkBars; i++) {
                const p = prevCandles[prevCandles.length - i];
                const f = finalCandlesList[finalCandlesList.length - i];
                if (!p || !f || p.timestamp !== f.timestamp || p.close !== f.close || p.high !== f.high || p.low !== f.low || p.open !== f.open) {
                  isDifferent = true;
                  break;
                }
              }
            }

            cache.candles = finalCandlesList;
            if (finalCandlesList.length > 0 && isPanelDisplayed && queryLimit >= maxCandleLimit) {
              initialLoadedPanelsRef.current.add(targetPanel.id);
              (cache as any).loadedHistoryDays = Math.max((cache as any).loadedHistoryDays || 0, historyDays);
            }
            if (checkIsActive() && (isDifferent || isForced || prevCandles.length === 0)) {
              setCandles(finalCandlesList);
            } else if (!checkIsActive() && (isDifferent || !hasExisting)) {
              bumpPanelCacheVersion();
              // Avaliar algoritmos e Prompts Geradores de Sinais em segundo plano assim que as velas forem carregadas/atualizadas
              runMarketLogicForPanel(targetPanel, targetSettings, cache, mData || cache.marketData, cache.forces || [], cache.gammaLevels || null);
            }
          } else if (isForced || !cache.candles || cache.candles.length === 0) {
            cache.lastCandlesFetch = 0;
          }
        }).catch(() => {}).finally(() => {
          cache.isFetchingCandles = false;
          if ((cache as any).loadingProgress?.isLoading) {
            (cache as any).loadingProgress = {
              ...(cache as any).loadingProgress,
              isLoading: false,
              percent: 100,
              isExplicitDaysChange: false
            };
          }
          if (checkIsActive()) {
            setCandlesLoadingProgress(prev => prev.isLoading ? ({ ...prev, isLoading: false, percent: 100, isExplicitDaysChange: false }) : prev);
            setIsCandlesLoading(false);
          } else {
            bumpPanelCacheVersion();
          }
        });
      }

      if (checkIsActive()) {
        // Buscar screenshot em background (apenas quando o painel está ativo e usa imagem externa)
        const needsScreenshot = targetSettings.source_screen !== 'candles' && targetSettings.resource_chart_screenshots_enabled !== false;
        if (!cache.isFetchingScreenshot && needsScreenshot && (now - lastScreenshot >= screenshotInterval || !cache.screenshot)) {
          cache.isFetchingScreenshot = true;
          cache.lastScreenshotFetch = now;
          fetchScreenshotSupabase(targetPanel.id).then(screenshotData => {
            if (screenshotData) {
              cache.screenshot = screenshotData;
              if (checkIsActive()) {
                setScreenshot(screenshotData);
              }
            }
          }).catch(() => {}).finally(() => {
            cache.isFetchingScreenshot = false;
          });
        }
      }

    } catch (err) {
      console.error(`[CONTEXT] Erro no ciclo de mercado do painel ${targetPanel.name}:`, err);
    } finally {
      runningMarketCycles.current.delete(targetPanel.id);
    }
  };

  const refreshMarketData = async (overrideSettings?: any, targetPanelIds?: string[], perPanelDays?: Record<string, number>) => {
    const resolvedIds = Array.from(
      new Set(
        (targetPanelIds && targetPanelIds.length > 0
          ? targetPanelIds
          : [activePanel?.id, ...visibleMultiPanelIdsRef.current]
        ).filter(Boolean) as string[]
      )
    );
    if (resolvedIds.length === 0) return;

    const tasks = resolvedIds.map(async (pId) => {
      const targetPanel = (panels || []).find(p => p.id === pId) || (activePanel?.id === pId ? activePanel : null);
      if (!targetPanel) return;

      const baseSettings = allSettingsRef.current?.[pId] || (pId === activePanel?.id ? settings : null) || settings;
      if (!baseSettings && !overrideSettings && !perPanelDays?.[pId]) return;
      const customDays = perPanelDays?.[pId];
      const mergedOverride = customDays !== undefined
        ? { ...(overrideSettings || {}), chart_history_days: Math.max(3, customDays) }
        : overrideSettings;
      const effSettings = mergedOverride ? { ...(baseSettings || {}), ...mergedOverride } : baseSettings;

      if (panelDataCache.current[pId]) {
        panelDataCache.current[pId].lastCandlesFetch = 0;
        panelDataCache.current[pId].lastGammaFetch = 0;
        panelDataCache.current[pId].lastScreenshotFetch = 0;
        panelDataCache.current[pId].lastForceFetch = 0;
        panelDataCache.current[pId].isFetchingCandles = false;
      }

      if (mergedOverride?.chart_history_days !== undefined) {
        const nextDays = Math.max(3, Number(mergedOverride.chart_history_days) || 3);
        const nextTotal = Math.min(50000, nextDays * 1440);
        initialLoadedPanelsRef.current.delete(pId);
        const progressObj = {
          isLoading: true,
          percent: 15,
          loaded: 0,
          total: nextTotal,
          days: nextDays,
          isExplicitDaysChange: true
        };
        if (panelDataCache.current[pId]) {
          (panelDataCache.current[pId] as any).loadingProgress = progressObj;
        }
        if (pId === activePanel?.id) {
          setCandlesLoadingProgress(progressObj);
          setIsCandlesLoading(true);
        }
      }

      runningMarketCycles.current.delete(pId);
      await executeMarketCycleForPanel(targetPanel, effSettings);
    });

    await Promise.all(tasks);
    bumpPanelCacheVersion();
  };

  // Inicializar Notícias uma vez e atualizar periodicamente
  const updateNews = async () => {
    const list = await fetchNewsSupabase();
    setNews(list);
    newsRef.current = list;
  };

  // Verificar alertas de notícias econômicas
  const checkNewsAlerts = (targetSettings = settings) => {
    if (!targetSettings || news.length === 0) return;
    const now = new Date();

    // Configurações
    const alertBefore = targetSettings.news_alert_before !== undefined ? Number(targetSettings.news_alert_before) : 5;
    const alertAfter = targetSettings.news_alert_after !== undefined ? Number(targetSettings.news_alert_after) : 15;
    const cooldownMins = targetSettings.news_cooldown !== undefined ? Number(targetSettings.news_cooldown) : 10;
    const countries = targetSettings.news_countries || ['USD', 'EUR', 'GBP', 'JPY'];

    const impHigh = targetSettings.news_impact_high !== false;
    const impMedium = targetSettings.news_impact_medium !== false;
    const impLow = targetSettings.news_impact_low || false;

    const alertTelegram = targetSettings.news_telegram !== false;
    const alertSound = targetSettings.news_sound !== false;

    news.forEach((event) => {
      const eventTime = new Date(event.date);
      const diffMs = eventTime.getTime() - now.getTime();
      const diffMin = Math.round(diffMs / 60000);
      const eventKey = `${eventTime.getTime()}_${event.country}_${event.title}_${targetSettings.panel_id || 'active'}`;

      // Filtros de país e impacto
      if (!countries.includes(event.country) && event.country !== 'ALL') return;
      if (event.impact === 'high' && !impHigh) return;
      if (event.impact === 'medium' && !impMedium) return;
      if (event.impact === 'low' && !impLow) return;

      if (!newsAlertedRef.current[eventKey]) {
        newsAlertedRef.current[eventKey] = { before: false, after: false, on_hour: false } as any;
      }

      // Alerta ANTES
      if (diffMin > 0 && diffMin <= alertBefore) {
        const lastAlerted = newsCooldownsRef.current[eventKey + '_before'] || 0;
        if (!newsAlertedRef.current[eventKey].before && (Date.now() - lastAlerted >= cooldownMins * 60 * 1000)) {
          const msg = `${event.country} — ${event.title} em ${diffMin} min! (Impacto: ${event.impact.toUpperCase()})`;
          addLog('NOTICIA', `⏰ ${msg}`, 'noticia');

          const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
          const canShowAlerts = isSystemAdmin || userPermissions.allow_alerts;
          if (activePanel?.id === targetSettings.panel_id && canShowAlerts && targetSettings.resource_chart_alerts_enabled !== false) {
            setActiveAlert({
              title: `NOTÍCIA EM ${diffMin} MIN`,
              message: msg,
              detail: `${event.country}: ${event.title}\nImpacto: ${event.impact.toUpperCase()}\nHorário: ${eventTime.toLocaleTimeString('pt-BR')}\nPrevisão: ${event.forecast || '--'} | Anterior: ${event.previous || '--'}`,
              tipo: 'noticia'
            });
            if (alertSound) playAlertBeep(587.33, 300);
          }

          if (alertTelegram && targetSettings.telegram_enabled) {
            enviarTelegramAlert('NOTÍCIA EM BREVE', msg, `País: ${event.country}\nImpacto: ${event.impact.toUpperCase()}\nPrevisão: ${event.forecast || '--'}\nAnterior: ${event.previous || '--'}`, targetSettings);
          }

          // Disparar IA no modo Notícia (Minutos Antes)
          if (aiEnabled && targetSettings.ai_trigger_mode === 'noticia') {
            const targetPanel = panels.find(p => p.id === targetSettings.panel_id || p.id === targetSettings.id) || activePanel;
            if (targetPanel) {
              console.log(`[IA] [${targetPanel.name}] Disparando IA por Notícia Próxima: ${event.title} (em ${diffMin} min)`);
              addLog('IA', `[${targetPanel.name}] Disparando análise de IA para notícia em ${diffMin} min...`, 'sistema');
              executeAiCycleForPanel(targetPanel, targetSettings);
            }
          }

          newsCooldownsRef.current[eventKey + '_before'] = Date.now();
          newsAlertedRef.current[eventKey].before = true;
        }
      }

      // Alerta NA HORA (Exato momento)
      if (diffMin === 0) {
        if (!(newsAlertedRef.current[eventKey] as any).on_hour) {
          (newsAlertedRef.current[eventKey] as any).on_hour = true;

          // Disparar IA no modo Notícia (Na hora)
          if (aiEnabled && targetSettings.ai_trigger_mode === 'noticia') {
            const targetPanel = panels.find(p => p.id === targetSettings.panel_id || p.id === targetSettings.id) || activePanel;
            if (targetPanel) {
              console.log(`[IA] [${targetPanel.name}] Disparando IA Na Hora da Notícia: ${event.title}`);
              addLog('IA', `[${targetPanel.name}] Disparando análise de IA no horário exato da notícia...`, 'sistema');
              executeAiCycleForPanel(targetPanel, targetSettings);
            }
          }
        }
      }

      // Alerta DEPOIS (Liberada)
      if (diffMin <= 0 && diffMin >= -alertAfter) {
        if (!newsAlertedRef.current[eventKey].after) {
          const msg = `${event.country} — ${event.title} ACABOU DE SAIR! (Impacto: ${event.impact.toUpperCase()})`;
          addLog('NOTICIA', `🔥 ${msg}`, 'noticia');

          const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
          const canShowAlerts = isSystemAdmin || userPermissions.allow_alerts;
          if (activePanel?.id === targetSettings.panel_id && canShowAlerts && targetSettings.resource_chart_alerts_enabled !== false) {
            setActiveAlert({
              title: `NOTÍCIA LIBERADA!`,
              message: msg,
              detail: `${event.country}: ${event.title}\nImpacto: ${event.impact.toUpperCase()}\nHorário: ${eventTime.toLocaleTimeString('pt-BR')}`,
              tipo: 'noticia'
            });
            if (alertSound) playAlertBeep(659.25, 400);
          }

          if (alertTelegram && targetSettings.telegram_enabled) {
            enviarTelegramAlert('NOTÍCIA LIBERADA', msg, `País: ${event.country}\nImpacto: ${event.impact.toUpperCase()}`, targetSettings);
          }

          // Disparar IA no modo Notícia (Minutos Depois)
          if (aiEnabled && targetSettings.ai_trigger_mode === 'noticia') {
            const targetPanel = panels.find(p => p.id === targetSettings.panel_id || p.id === targetSettings.id) || activePanel;
            if (targetPanel) {
              console.log(`[IA] [${targetPanel.name}] Disparando IA por Notícia Liberada: ${event.title} (há ${Math.abs(diffMin)} min)`);
              addLog('IA', `[${targetPanel.name}] Disparando análise de IA após publicação de notícia...`, 'sistema');
              executeAiCycleForPanel(targetPanel, targetSettings);
            }
          }

          newsAlertedRef.current[eventKey].after = true;
        }
      }
    });
  };

  // Sincroniza a permissão de fechamento da janela no app Desktop Windows (Electron)
  useEffect(() => {
    try {
      if ((window as any).electronAPI?.setClosable) {
        // Se autenticado: false (bloqueia botão X e Alt+F4)
        // Se não autenticado (tela de login): true (libera botão X)
        (window as any).electronAPI.setClosable(!isAuthenticated);
      }
    } catch (err) {
      console.warn('[ELECTRON] Erro ao sincronizar estado de fechamento da janela:', err);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && settings?.resource_news_enabled !== false) {
      updateNews();
      const newsInterval = setInterval(updateNews, 300000); // 5 minutos
      return () => clearInterval(newsInterval);
    }
  }, [isAuthenticated, settings?.resource_news_enabled]);

  // Loop separado apenas para alertas de notícias (roda a cada 5 segundos)
  useEffect(() => {
    if (isAuthenticated && news.length > 0 && settings?.resource_news_enabled !== false) {
      const newsTimer = setInterval(() => {
        if (settings && settings.resource_news_enabled !== false) {
          checkNewsAlerts(settings);
        }
        // Roda para painéis em segundo plano se habilitado
        panels.forEach((p) => {
          if (p.id !== activePanel?.id) {
            const pSet = allSettings[p.id];
            if (pSet && pSet.news_background_enabled === true && pSet.resource_news_enabled !== false) {
              checkNewsAlerts(pSet);
            }
          }
        });
      }, 5000);
      return () => clearInterval(newsTimer);
    }
  }, [isAuthenticated, settings, allSettings, news, panels, activePanel, settings?.resource_news_enabled]);

  // 6. Controle de Acesso Único (Verificar e Heartbeat a cada 10 segundos)
  useEffect(() => {
    if (isAuthenticated && user && sessionId) {
      sessionCheckRef.current = setInterval(async () => {
        const storedSubscriptionId = localStorage.getItem('vortex_subscription_id');
        const storedIsRestricted = localStorage.getItem('vortex_is_restricted') === 'true';
        const activeData = await checkActiveSessionAndHeartbeat(user.id, sessionId, storedSubscriptionId, storedIsRestricted, user.email);

        if (!activeData.active) {
          if (activeData.blocked) {
            addLog('ALERTA', 'Acesso negado: Seu IP foi bloqueado pelo administrador.', 'alerta');
            alert('Acesso negado: Seu IP foi bloqueado pelo administrador.');
          } else {
            addLog('ALERTA', 'Conta detectada em outro login. Desconectando...', 'alerta');
            alert('Sua conta foi acessada em outro dispositivo. Esta sessão foi encerrada.');
          }
          logout();
        } else {
          setIsRestrictedSession(activeData.role === 'restricted');
          setUserPermissions(prev => ({
            allow_telegram_news: activeData.allow_telegram_news !== false,
            allow_alerts: activeData.allow_alerts !== false,
            allow_operations: activeData.allow_operations !== false,
            allow_share_strategies: activeData.allow_share_strategies === true,
            allow_simulator: activeData.allow_simulator === true,
            allow_panel_mode_2: activeData.allow_panel_mode_2 ?? prev?.allow_panel_mode_2 ?? true,
            allow_copy_trading: activeData.allow_copy_trading ?? prev?.allow_copy_trading ?? false,
            max_strategies: activeData.max_strategies ?? prev?.max_strategies ?? 2,
            max_accounts: activeData.max_accounts ?? prev?.max_accounts ?? 5
          }));
        }
      }, 10000);

      return () => {
        if (sessionCheckRef.current) clearInterval(sessionCheckRef.current);
      };
    }
  }, [isAuthenticated, user, sessionId]);

  const fetchPromptsList = async () => {
    setIsLoadingPrompts(true);
    const list = await fetchPromptsSupabase();
    setPrompts(list);
    setIsLoadingPrompts(false);
  };

  const savePromptAction = async (prompt: Partial<AIPrompt>): Promise<{ success: boolean; error?: string }> => {
    try {
      const payload: Partial<AIPrompt> = {
        ...prompt,
        user_id: user ? user.id : null,
        panel_id: prompt.panel_id !== undefined ? prompt.panel_id : (activePanel ? activePanel.id : null)
      };

      const data = await savePromptSupabase(payload);
      if (data) {
        // Garantir que a lista local preserva o prompt_type e trigger_strategy_id salvos
        setPrompts((prev: AIPrompt[]) => {
          const updatedType = payload.prompt_type || data.prompt_type || 'context_filter';
          const updatedTrigger = payload.trigger_strategy_id !== undefined ? payload.trigger_strategy_id : (data.trigger_strategy_id || null);
          const updatedItem = { ...data, prompt_type: updatedType, trigger_strategy_id: updatedTrigger };
          const exists = prev.some((p: AIPrompt) => p.id === data.id);
          if (exists) {
            return prev.map((p: AIPrompt) => (p.id === data.id ? updatedItem : p));
          }
          return [updatedItem, ...prev];
        });

        addLog('SISTEMA', `Estratégia '${data.name}' salva com sucesso.`, 'sistema');
        fetchPromptsList().catch(() => {});
        return { success: true };
      }
      return { success: false, error: 'Nenhum dado retornado ao salvar estratégia.' };
    } catch (err: any) {
      console.error('[CONTEXT] Erro ao salvar prompt:', err);
      const errMsg = err.message || JSON.stringify(err);
      addLog('ERRO', `Erro ao salvar estratégia: ${errMsg}`, 'erro');
      return { success: false, error: errMsg };
    }
  };


  const deletePromptAction = async (id: string): Promise<boolean> => {
    try {
      const success = await deletePromptSupabase(id);
      if (success) {
        setPrompts((prev: AIPrompt[]) => prev.filter((p: AIPrompt) => p.id !== id));
        addLog('SISTEMA', 'Estratégia excluída com sucesso.', 'sistema');

        // Se a estratégia excluída era a selecionada, limpa a seleção
        if (settings && settings.selected_prompt_id === id) {
          await saveSettings({ selected_prompt_id: null });
        }

        fetchPromptsList().catch(() => {});
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('[CONTEXT] Erro ao deletar prompt:', err);
      addLog('ERRO', `Erro ao deletar estratégia: ${err.message || err}`, 'erro');
      return false;
    }
  };

  const fetchPublicStrategiesList = async () => {
    const list = await fetchPublicCustomStrategies();
    setPublicStrategies(list);
  };

  const fetchStrategiesList = async () => {
    setIsLoadingStrategies(true);
    const list = await fetchCustomStrategies();
    setCustomStrategies(list);
    await fetchPublicStrategiesList();
    await fetchAtmStrategiesList();
    setIsLoadingStrategies(false);
  };

  const saveStrategyAction = async (strat: CustomStrategy): Promise<{ success: boolean; error?: string }> => {
    try {
      const data = await saveCustomStrategy(strat);
      if (data) {
        // Atualização otimista imediata no estado (0ms de latência)
        setCustomStrategies(prev => {
          const idx = prev.findIndex(s => s.id === (data.id || strat.id));
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], ...data };
            return copy;
          }
          return [data, ...prev];
        });

        addLog('SISTEMA', `Algoritmo '${data.name}' salvo com sucesso.`, 'sistema');

        // Sincroniza lista em background sem travar o retorno para a tela
        fetchStrategiesList().catch(() => {});
        return { success: true };
      }
      return { success: false, error: 'Erro ao salvar algoritmo dinâmico.' };
    } catch (err: any) {
      console.error('[CONTEXT] Erro ao salvar algoritmo:', err);
      return { success: false, error: err.message };
    }
  };

  const deleteStrategyAction = async (id: string): Promise<boolean> => {
    try {
      // 1. Verificar se a estratégia está sendo usada em alguma configuração de IA do Supabase
      try {
        const { data: usage } = await withDbTimeout(
          supabase
            .from('painelvm_settings')
            .select('panel_id')
            .eq('ai_trigger_strategy_id', id) as any,
          2500
        );

        if (usage && usage.length > 0) {
          const linkedPanelNames = usage.map((u: any) => {
            const panel = panels.find(p => p.id === u.panel_id);
            return panel ? `"${panel.name}"` : `Painel ID: ${u.panel_id}`;
          }).join(', ');

          alert(`Não é possível excluir esta estratégia porque ela está vinculada como o gatilho ativo da IA nos seguintes painéis: ${linkedPanelNames}.\n\nPor favor, vá em Configurações > Geral dos painéis indicados e altere o Modo de Acionamento da IA antes de tentar excluir.`);
          return false;
        }
      } catch (e) {}

      // Atualização otimista imediata
      setCustomStrategies(prev => prev.filter(s => s.id !== id));
      addLog('SISTEMA', 'Algoritmo removido com sucesso.', 'sistema');

      const success = await deleteCustomStrategy(id);
      fetchStrategiesList().catch(() => {});
      refreshAccountStrategies().catch(() => {});
      return success;
    } catch (err: any) {
      console.error('[CONTEXT] Erro ao deletar estratégia:', err);
      alert(`Erro ao validar/excluir estratégia: ${err.message}`);
      return false;
    }
  };

  const toggleStrategyActiveAction = async (id: string, activeStatus: boolean): Promise<boolean> => {
    if (activeStatus) {
      const targetStrat = customStrategies.find(s => s.id === id);
      const isFeatured = targetStrat?.is_admin_featured === true;

      if (!isFeatured) {
        const activeCount = customStrategies.filter(s => s.active && s.id !== id && !s.is_admin_featured).length;
        const limit = userPermissions.max_strategies || 2;
        if (activeCount >= limit) {
          addLog('AVISO', `Limite máximo de estratégias ativas atingido (${limit}). Aumento disponível através do painel admin.`, 'alerta');
          setActiveAlert({
            title: 'LIMITE DE ASSINATURA',
            message: `Você atingiu o limite de ${limit} estratégias ativas simultaneamente.`,
            detail: 'Para rodar mais algoritmos simultaneamente, entre em contato com o suporte ou solicite aumento ao Administrador.',
            tipo: 'assinatura'
          });
          return false;
        }
      }
    }

    // Atualização otimista imediata
    setCustomStrategies(prev => prev.map(s => s.id === id ? { ...s, active: activeStatus } : s));
    addLog('SISTEMA', `Algoritmo ${activeStatus ? 'ativado' : 'desativado'} com sucesso.`, 'sistema');

    const success = await toggleCustomStrategyActive(id, activeStatus);
    fetchStrategiesList().catch(() => {});
    return success;
  };

  const createPanelAction = async (name: string, instanceId: string, pointValue = 1.0, tickSize = 0.25, defaultSlPoints = 50, defaultTpPoints = 50): Promise<boolean> => {
    if (!user) return false;
    try {
      const isSystemAdmin = user.email?.toLowerCase() === 'admin@vortex.com';
      const storedSubscriptionId = isSystemAdmin ? 'admin' : localStorage.getItem('vortex_subscription_id');
      const safeTick = Number(tickSize) > 0 ? Number(tickSize) : 0.25;
      const safePoint = Number(pointValue) > 0 ? Number(pointValue) : 1.0;
      const safeSl = Number(defaultSlPoints) > 0 ? Number(defaultSlPoints) : 50;
      const safeTp = Number(defaultTpPoints) > 0 ? Number(defaultTpPoints) : 50;
      const payload: any = {
        user_id: user.id,
        subscription_id: storedSubscriptionId,
        instance_id: instanceId,
        name: name,
        point_value: safePoint
      };

      let { data: newPanel, error: panelError } = await withDbTimeout(
        supabase
          .from('painelvm_panels')
          .insert([payload])
          .select()
          .single(),
        4000
      );

      if (panelError) {
        if (panelError.message && panelError.message.includes('point_value')) {
          delete payload.point_value;
          const { data: fallbackPanel, error: fallbackErr } = await withDbTimeout(
            supabase
              .from('painelvm_panels')
              .insert([payload])
              .select()
              .single(),
            4000
          );
          if (fallbackErr) throw fallbackErr;
          newPanel = fallbackPanel;
        } else {
          throw panelError;
        }
      }

      if (newPanel?.id) {
        try {
          localStorage.setItem(`vortex_panel_tick_size_${newPanel.id}`, String(safeTick));
          localStorage.setItem(`vortex_panel_point_value_${newPanel.id}`, String(safePoint));
          localStorage.setItem(`vortex_panel_default_sl_${newPanel.id}`, String(safeSl));
          localStorage.setItem(`vortex_panel_default_tp_${newPanel.id}`, String(safeTp));
        } catch (_) {}
      }

      // Criar as configurações padrão para o novo painel
      let gammaSymbol = 'NQ';
      if (instanceId.toLowerCase().includes('sp')) gammaSymbol = 'ES';
      if (instanceId.toLowerCase().includes('gold') || instanceId.toLowerCase().includes('ouro')) gammaSymbol = 'GC';

      const { error: settingsError } = await withDbTimeout(
        supabase
          .from('painelvm_settings')
          .insert([{
            panel_id: newPanel.id,
            ai_provider: settings?.ai_provider || 'groq',
            groq_api_key: settings?.groq_api_key || '',
            gemini_api_key: settings?.gemini_api_key || '',
            openai_api_key: settings?.openai_api_key || '',
            groq_model: (settings?.groq_model && settings.groq_model !== 'qwen/qwen3.6-27b') ? settings.groq_model : 'qwen/qwen3.8-27b',
            gemini_model: settings?.gemini_model || 'gemini-3.8-flash',
            openai_model: settings?.openai_model || 'gpt-4o-mini',
            intervalo: settings?.intervalo || 30000,
            instance_id_force: instanceId,
            instance_id_market: instanceId,
            instance_id_screen: instanceId,
            gamma_symbol: gammaSymbol,
            alert_mode: 'individual',
            ai_trigger_mode: settings?.ai_trigger_mode || 'tempo',
            telegram_enabled: settings?.telegram_enabled || false,
            telegram_bot_token: settings?.telegram_bot_token || '',
            telegram_chat_id: settings?.telegram_chat_id || '',
            disabled_levels: [
              `cfg:chart_manual_sl_points:${safeSl}`,
              `cfg:chart_manual_tp_points:${safeTp}`
            ]
          }]),
        4000
      );

      if (settingsError) throw settingsError;

      addLog('SISTEMA', `Novo painel/ativo '${name}' adicionado com sucesso (Ponto: U$ ${safePoint}, Tick: ${safeTick} pts, SL Sugerido: ${safeSl} pts, TP Sugerido: ${safeTp} pts).`, 'sistema');
      await loadUserSettings(user.id, storedSubscriptionId, { skipAuxiliary: true });
      return true;
    } catch (err: any) {
      console.error('[CONTEXT] Erro ao criar painel:', err);
      addLog('ERRO', `Erro ao criar painel: ${err.message}`, 'erro');
      return false;
    }
  };

  const updatePanelAction = async (panelId: string, name: string, instanceId: string, pointValue = 1.0, tickSize = 0.25, defaultSlPoints = 50, defaultTpPoints = 50): Promise<boolean> => {
    if (!user) return false;
    try {
      const isSystemAdmin = user.email?.toLowerCase() === 'admin@vortex.com';
      const storedSubscriptionId = isSystemAdmin ? 'admin' : localStorage.getItem('vortex_subscription_id');
      const safeTick = Number(tickSize) > 0 ? Number(tickSize) : 0.25;
      const safePoint = Number(pointValue) > 0 ? Number(pointValue) : 1.0;
      const safeSl = Number(defaultSlPoints) > 0 ? Number(defaultSlPoints) : 50;
      const safeTp = Number(defaultTpPoints) > 0 ? Number(defaultTpPoints) : 50;

      // 1. Salvar no localStorage de imediato
      try {
        localStorage.setItem(`vortex_panel_tick_size_${panelId}`, String(safeTick));
        localStorage.setItem(`vortex_panel_point_value_${panelId}`, String(safePoint));
        localStorage.setItem(`vortex_panel_default_sl_${panelId}`, String(safeSl));
        localStorage.setItem(`vortex_panel_default_tp_${panelId}`, String(safeTp));
      } catch (_) {}

      // 2. Atualizar estado em memória de imediato (UI instantânea, sem atraso de 10-20 segundos)
      setPanels(prev => prev.map(p => {
        if (p.id === panelId) {
          return {
            ...p,
            name,
            instance_id: instanceId,
            point_value: safePoint,
            tick_size: safeTick,
            default_sl_points: safeSl,
            default_tp_points: safeTp
          };
        }
        return p;
      }));

      if (activePanelRef.current?.id === panelId || activePanel?.id === panelId) {
        const updated = {
          ...(activePanelRef.current || activePanel),
          name,
          instance_id: instanceId,
          point_value: safePoint,
          tick_size: safeTick,
          default_sl_points: safeSl,
          default_tp_points: safeTp
        };
        activePanelRef.current = updated as any;
        setActivePanel(updated as any);
        setPanel(updated as any);
      }

      // 3. Persistir no Supabase com timeout de 4s
      // IMPORTANTE: NÃO enviar tick_size para painelvm_panels pois a coluna não existe no banco Supabase
      const payload: any = {
        name: name,
        instance_id: instanceId,
        point_value: safePoint
      };

      const { error: panelError } = await withDbTimeout(
        supabase
          .from('painelvm_panels')
          .update(payload)
          .eq('id', panelId),
        4000
      );

      if (panelError) {
        // Se der erro especificamente no point_value, tenta atualizar apenas name e instance_id
        if (panelError.message && panelError.message.includes('point_value')) {
          delete payload.point_value;
          const { error: fallbackErr } = await withDbTimeout(
            supabase
              .from('painelvm_panels')
              .update(payload)
              .eq('id', panelId),
            4000
          );
          if (fallbackErr) throw fallbackErr;
        } else {
          throw panelError;
        }
      }

      // 4. Também sincronizar os instance_ids nas configurações do painel
      await withDbTimeout(
        supabase
          .from('painelvm_settings')
          .update({
            instance_id_force: instanceId,
            instance_id_market: instanceId,
            instance_id_screen: instanceId
          })
          .eq('panel_id', panelId),
        4000
      ).catch(err => {
        console.warn('[CONTEXT] Aviso ao sincronizar painelvm_settings:', err);
      });

      addLog('SISTEMA', `Painel '${name}' atualizado com sucesso (Ponto: U$ ${safePoint}, Tick: ${safeTick} pts).`, 'sistema');
      
      // 5. Recarregar painéis de forma enxuta sem recarregar todos os relatórios/prompts da aplicação
      await loadUserSettings(user.id, storedSubscriptionId, { skipAuxiliary: true });
      return true;
    } catch (err: any) {
      console.error('[CONTEXT] Erro ao atualizar painel:', err);
      addLog('ERRO', `Erro ao atualizar painel: ${err.message}`, 'erro');
      return false;
    }
  };

  const deletePanelAction = async (panelId: string): Promise<boolean> => {
    if (!user || panels.length <= 1) return false;
    try {
      const isSystemAdmin = user.email?.toLowerCase() === 'admin@vortex.com';
      const storedSubscriptionId = isSystemAdmin ? 'admin' : localStorage.getItem('vortex_subscription_id');

      // Se for o painel ativo, mudar o ativo para outro primeiro
      if (activePanel?.id === panelId) {
        const fallbackPanel = panels.find(p => p.id !== panelId);
        if (fallbackPanel) {
          switchPanel(fallbackPanel.id);
        }
      }

      const { error: deleteError } = await withDbTimeout(
        supabase
          .from('painelvm_panels')
          .delete()
          .eq('id', panelId),
        4000
      );

      if (deleteError) throw deleteError;

      addLog('SISTEMA', 'Painel excluído com sucesso.', 'sistema');
      await loadUserSettings(user.id, storedSubscriptionId, { skipAuxiliary: true });
      return true;
    } catch (err: any) {
      console.error('[CONTEXT] Erro ao deletar painel:', err);
      addLog('ERRO', `Erro ao deletar painel: ${err.message}`, 'erro');
      return false;
    }
  };

  const fetchReportsList = async (silent = false) => {
    if (!silent) setIsLoadingReports(true);
    const list = await fetchStrategyReportsSupabase();
    if (!list) {
      if (!silent) setIsLoadingReports(false);
      return;
    }

    // 🛡️ Fusão Inteligente Anti-Flicker e Anti-Reabertura:
    // Garante que operações recém-criadas ou encerradas localmente NUNCA sumam nem reabram
    // por conta de atraso de sincronização ou lag de replicação no banco de dados.
    const currentMemory = reportsRef.current || [];
    const memoryMap = new Map<string, StrategyReport>(currentMemory.map(r => [r.id, r]));

    const mergedList: StrategyReport[] = list.map(serverReport => {
      const memReport = memoryMap.get(serverReport.id);
      if (memReport) {
        // Se localmente a ordem já foi ENCERRADA (Cancelado, Gain, Stop) e o servidor ainda reporta 'Em Andamento',
        // PRESERVA o encerramento local! NUNCA reabra a operação na tela!
        if ((memReport.status === 'Cancelado' || memReport.status === 'Gain' || memReport.status === 'Stop') && serverReport.status === 'Em Andamento') {
          return {
            ...serverReport,
            status: memReport.status,
            exit_price: memReport.exit_price ?? serverReport.exit_price,
            closed_at: memReport.closed_at ?? serverReport.closed_at
          };
        }

        // 🛡️ Proteção Anti-Reversão de Níveis SL/TP Modificados pelo Usuário:
        // Se o usuário moveu o Stop Loss ou Take Profit recentemente (< 30s),
        // PRESERVA os níveis locais e impede que listagens defasadas do banco voltem o preço antigo!
        const memLevelsTime = (memReport as any)._levels_modified_at || 0;
        const isRecentlyModified = (Date.now() - memLevelsTime) < 30000;
        if (isRecentlyModified && serverReport.status === 'Em Andamento') {
          return {
            ...serverReport,
            stop_loss: memReport.stop_loss !== undefined ? memReport.stop_loss : serverReport.stop_loss,
            take_profit: memReport.take_profit !== undefined ? memReport.take_profit : serverReport.take_profit,
            _levels_modified_at: memLevelsTime
          };
        }
      }
      return serverReport;
    });

    // Se há ordens em memória criadas recentemente (< 60s) ou ordens de copy trading locais ainda em andamento
    // que o servidor não retornou na listagem, MANTÉM no topo para a ordem NÃO desaparecer da tela!
    currentMemory.forEach(memReport => {
      if (!mergedList.some(m => m.id === memReport.id)) {
        const ageMs = Date.now() - new Date(memReport.created_at || Date.now()).getTime();
        const isActiveLocalCopy = Boolean((memReport as any).is_copy_trade && memReport.status === 'Em Andamento');
        if (ageMs < 60000 || isActiveLocalCopy) {
          mergedList.unshift(memReport);
        }
      }
    });

    setReports(mergedList);
    reportsRef.current = mergedList;
    saveLocalStrategyReports(mergedList);
    if (!silent) setIsLoadingReports(false);

    // Restaurar operações em andamento de cada painel
    const panelsWithActiveReports = new Set<string>();
    const effectiveList = (list && list.length > 0) ? list : (reportsRef.current || []);

    effectiveList.forEach((r) => {
      if (r.status === 'Em Andamento') {
        // Encontrar a qual painel esse relatório pertence usando panel_id primeiro, depois instance_id, com fallback para o formato da descrição "[Nome do Painel] ..."
        let targetPanel = r.panel_id
          ? panels.find((p) => p.id === r.panel_id)
          : (r.instance_id
            ? panels.find((p) => p.instance_id === r.instance_id)
            : null);

        if (!targetPanel) {
          const match = r.description?.match(/\[(.*?)\]/);
          const panelName = match ? match[1] : '';
          const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
          targetPanel = panels.find((p) => normalize(p.name) === normalize(panelName));
        }

        if (targetPanel) {
          panelsWithActiveReports.add(targetPanel.id);
          // Registrar no Set de relatórios ativos por painel (suporta múltiplas contas)
          if (!activeReportIdsRef.current.has(targetPanel.id)) {
            activeReportIdsRef.current.set(targetPanel.id, new Set());
          }
          activeReportIdsRef.current.get(targetPanel.id)!.add(r.id);

          // Inicializar o cache deste painel se necessário
          if (!panelDataCache.current[targetPanel.id]) {
            panelDataCache.current[targetPanel.id] = {
              marketData: null,
              forces: [],
              gammaLevels: null,
              screenshot: null,
              lastGammaFetch: 0,
              lastGammaSymbol: '',
              aiResult: null
            };
          }

          const cache = panelDataCache.current[targetPanel.id];

          // Se não houver aiResult no cache ou se for AGUARDANDO, reconstrói o sinal ativo
          if (!cache.aiResult || cache.aiResult.sinal === 'AGUARDANDO') {
            const restoredSignal: AIResponse = {
              success: true,
              sinal: r.side as any,
              confianca: 'Ativa',
              alvo: r.take_profit !== null ? String(r.take_profit) : '--',
              stop: r.stop_loss !== null ? String(r.stop_loss) : '--',
              resumo: r.description || 'Operação recuperada.'
            };
            cache.aiResult = restoredSignal;

            // Se for o painel ativo atual na tela, atualiza o estado para exibir no card Decisão IA
            const currentActiveId = activePanelRef.current?.id || activePanel?.id || localStorage.getItem('vortex_active_panel_id');
            if (currentActiveId === targetPanel.id) {
              setAiResult(restoredSignal);
            }

            const targetAccObj = (accounts || []).find((a: any) => a.id === r.account_id);
            const accNameStr = targetAccObj ? targetAccObj.account_name : 'Conta MASTER';
            addLog('IA', `🔄 Operação de ${r.side} ('${r.strategy_name}' - ${accNameStr}) para [${targetPanel.name}] em andamento restaurada do Supabase.`, 'ia');
          }
        }
      }
    });

    // Limpar o mapa de relatórios ativos antigos e caches de painéis que não têm mais operações em andamento
    activeReportIdsRef.current.forEach((_, key) => {
      if (!panelsWithActiveReports.has(key)) {
        activeReportIdsRef.current.delete(key);
        const cache = panelDataCache.current[key];
        if (cache) {
          cache.aiResult = null;
          // Bug #1 Fix: limpar cache.aiResults (por prompt) para liberar próximo disparo de IA/algoritmo
          if (cache.aiResults) {
            cache.aiResults = {};
          }
        }
        const currentActiveId = activePanelRef.current?.id || activePanel?.id || localStorage.getItem('vortex_active_panel_id');
        if (currentActiveId === key) {
          setAiResult(null);
        }
        // Limpar sinais visuais/marcadores de algoritmo no gráfico para painéis sem ordens ativas
        setCustomSignals(prev => prev.filter(s => s.panelId !== key));
      }
    });
  };

  const fetchGeneralAnalysesList = async () => {
    setIsLoadingGeneralAnalyses(true);
    const list = await fetchGeneralAnalysesSupabase();
    setGeneralAnalyses(list);
    setIsLoadingGeneralAnalyses(false);
  };

  const deleteGeneralAnalysisAction = async (id: string): Promise<boolean> => {
    try {
      const ok = await deleteGeneralAnalysisSupabase(id);
      if (ok) {
        setGeneralAnalyses(prev => prev.filter(a => a.id !== id));
        addLog('SISTEMA', 'Projeção excluída com sucesso.', 'sistema');
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('[CONTEXT] Erro ao excluir projeção:', err);
      addLog('ERRO', `Erro ao excluir projeção: ${err.message || err}`, 'erro');
      return false;
    }
  };

  const createReportAction = async (
    report: Omit<StrategyReport, 'id' | 'created_at' | 'closed_at' | 'user_id'>
  ): Promise<StrategyReport | null> => {
    try {
      const targetAccId = report.account_id || activeAccount?.id;
      const targetAcc = accounts.find(a => a.id === targetAccId) || activeAccount;
      if (targetAcc && targetAcc.is_active === false) {
        addLog('AVISO', `⚠️ Ordem bloqueada: A conta "${targetAcc.account_name}" está DESATIVADA.`, 'alerta');
        alert(`Operação bloqueada: A conta "${targetAcc.account_name}" está DESATIVADA. Ative a conta na Gestão de Contas para enviar ordens.`);
        return null;
      }

      // 🔒 Bloqueio de Conta Master NinjaTrader: Entradas manuais e de robôs via painel web são bloqueadas
      if (isNinjaMasterAccount(targetAcc) && !(report as any).is_master_event && !(report as any).already_dispatched) {
        const msg = `🔒 Operação Bloqueada no Painel:\n\nA conta "${targetAcc?.account_name}" está configurada como MASTER NINJATRADER.\n\nPara garantir sincronização limpa e evitar ordens duplicadas, entradas nesta conta devem ser feitas diretamente no NinjaTrader 8 (Chart Trader, DOM ou Boleta NT8).\n\nAs ordens abertas no NT8 serão replicadas automaticamente para as contas Slaves.`;
        addLog('AVISO', `⚠️ [NINJA MASTER] Ordem via painel bloqueada na conta "${targetAcc?.account_name}". Opere diretamente no NinjaTrader 8.`, 'alerta');
        alert(msg);
        return null;
      }

      // 🔌 Bloqueio de Conexão NinjaTrader: Se a conta selecionada for NinjaTrader / Local, o Gateway deve estar online
      if (targetAcc && (targetAcc.platform === 'nt8' || targetAcc.send_localhost === true)) {
        const ninjaHealth = await checkNinjaStatus();
        if (ninjaHealth.status !== 'online') {
          const msg = `⚠️ NinjaTrader Desconectado: A conta "${targetAcc.account_name}" é vinculada ao NinjaTrader 8, mas o Vortex Gateway local (Porta 8001) está offline.\n\nAbra o NinjaTrader 8 e verifique se o conector está ativo antes de abrir operações.`;
          addLog('AVISO', msg, 'alerta');
          alert(msg);
          return null;
        }
      }

      // 🔒 Bloqueio de Mercado Fechado (Fim de semana / Sexta após fechamento / Domingo antes da abertura)
      const cycleEnd = settings?.global_cycle_end || '18:00:00';
      const cycleStart = settings?.global_cycle_start || '19:00:00';
      const marketStatus = isMarketClosed(cycleEnd, cycleStart);
      if (marketStatus.closed) {
        addLog('AVISO', `🔒 Ordem bloqueada: ${marketStatus.reason}`, 'alerta');
        alert(`🔒 Operação bloqueada:\n${marketStatus.reason}`);
        return null;
      }

      const targetPanelForReport = report.panel_id
        ? (panels || []).find(p => p.id === report.panel_id || p.instance_id === report.panel_id)
        : activePanel;

      const targetPanelSettings = targetPanelForReport ? allSettings[targetPanelForReport.id] : null;

      let resolvedSymbol = report.symbol ||
        targetPanelSettings?.gamma_symbol ||
        targetPanelForReport?.gamma_symbol ||
        targetPanelForReport?.symbol ||
        (() => {
          const norm = (targetPanelForReport?.name || targetPanelForReport?.instance_id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (norm.includes('sp500') || norm.includes('sp') || norm.includes('es')) return 'ES';
          if (norm.includes('nasdaq') || norm.includes('nq')) return 'NQ';
          if (norm.includes('russell') || norm.includes('russel') || norm.includes('m2k') || norm.includes('rty')) return 'RTY';
          if (norm.includes('gold') || norm.includes('ouro') || norm.includes('gc')) return 'GC';
          if (norm.includes('oil') || norm.includes('petr') || norm.includes('cl')) return 'CL';
          if (norm.includes('dxy') || norm.includes('usdindex')) return 'DXY';
          return targetPanelForReport?.name || 'NQ';
        })();

      if (targetAcc) {
        resolvedSymbol = resolveAccountExecutionSymbol(targetAcc, resolvedSymbol);
      }

      if (targetAcc && !(report as any).is_master_event && !(report as any).is_ninja_event && (!report.status || report.status === 'Em Andamento')) {
        const isAtmOp = Boolean(
          (report as any).is_atm ||
          (report.strategy_name && report.strategy_name.includes('Alvo')) ||
          (report.description && report.description.includes('ATM')) ||
          (report as any).allow_multi
        );
        const ruleCheck = validateAccountTradingRules(targetAcc, {
          symbol: resolvedSymbol,
          side: report.side,
          panelId: report.panel_id || targetPanelForReport?.id || activePanel?.id,
          panelInstanceId: report.instance_id || targetPanelForReport?.instance_id || activePanel?.instance_id,
          isManualTrade: !report.strategy_id || report.strategy_id === 'manual-trade',
          isAtm: isAtmOp,
          reports: reportsRef.current,
          panels: panels || [],
          customSettings: settings
        });
        if (!ruleCheck.allowed) {
          addLog('AVISO', `⚠️ Ordem bloqueada (${targetAcc.account_name}): ${ruleCheck.reason}`, 'alerta');
          alert(`Operação bloqueada na conta "${targetAcc.account_name}":\n\n${ruleCheck.reason}`);
          return null;
        }
      }

      let clampedLots = Number(report.contrato || 1);
      const maxLotsAcc = Number(targetAcc?.manual_max_lots || 0);
      if (maxLotsAcc > 0 && clampedLots > maxLotsAcc) {
        addLog('INFO', `⚠️ Lote ajustado de ${clampedLots}x para o limite máximo da conta "${targetAcc?.account_name}" (${maxLotsAcc}x).`, 'sistema');
        clampedLots = maxLotsAcc;
      }

      const payload: any = {
        ...report,
        contrato: clampedLots,
        account_id: report.account_id || activeAccount?.id || null,
        instance_id: report.instance_id || targetPanelForReport?.instance_id || activePanel?.instance_id || 'painel_principal',
        panel_id: report.panel_id || targetPanelForReport?.id || activePanel?.id || null,
        symbol: resolvedSymbol
      };


      // 🚀 Atualização Otimista Imediata (0ms de delay no gráfico e na interface)
      const reportId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : ('rep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
      const targetAccObj = (accounts || []).find(a => a.id === payload.account_id) || activeAccount;
      const resolvedManualId = getAccountManualStrategyId(targetAccObj);
      const finalStrategyId = (payload.strategy_id && payload.strategy_id !== 'manual-trade') ? payload.strategy_id : resolvedManualId;
      payload.strategy_id = finalStrategyId;
      payload.id = reportId;

      const finalStatus = payload.status || 'Em Andamento';

      const optimisticReport: StrategyReport = {
        id: reportId,
        user_id: user?.id || '',
        strategy_id: finalStrategyId,
        strategy_name: payload.strategy_name || 'Entrada Manual',
        side: payload.side,
        entry_price: payload.entry_price,
        stop_loss: payload.stop_loss,
        take_profit: payload.take_profit,
        exit_price: payload.exit_price || null,
        status: finalStatus,
        description: payload.description,
        created_at: new Date().toISOString(),
        closed_at: null,
        panel_id: payload.panel_id,
        instance_id: payload.instance_id,
        contrato: payload.contrato,
        account_id: payload.account_id,
        symbol: resolvedSymbol
      };

      const allAccounts = getLocalBrokerAccounts();
      let localAcc: BrokerAccount | null = null;
      if (payload.account_id) {
        localAcc = allAccounts.find((a: BrokerAccount) => a.id === payload.account_id)
          || accountsRef.current?.find(a => a.id === payload.account_id)
          || accounts.find(a => a.id === payload.account_id)
          || null;
      }
      if (!localAcc && payload.account_name) {
        localAcc = allAccounts.find(a => a.account_name?.trim().toLowerCase() === payload.account_name?.trim().toLowerCase())
          || accountsRef.current?.find(a => a.account_name?.trim().toLowerCase() === payload.account_name?.trim().toLowerCase())
          || accounts.find(a => a.account_name?.trim().toLowerCase() === payload.account_name?.trim().toLowerCase())
          || null;
      }
      // SOMENTE se nem account_id nem account_name foram informados, usa a conta ativa da boleta
      if (!localAcc && !payload.account_id && !payload.account_name) {
        localAcc = activeAccount;
      }

      const isLocalExecutionAccount = isNinjaExecutionAccount(localAcc);

      // Injeta imediatamente no estado síncrono (0ms) para plotar no gráfico e habilitar a boleta instantaneamente
      reportsRef.current = [optimisticReport, ...reportsRef.current.filter(r => r.id !== reportId)];
      setReports(prev => [optimisticReport, ...prev.filter(r => r.id !== reportId)]);

      // ⚡ DISPARO INSTANTÂNEO DIRETO DO CONTEXT (0ms) APENAS SE FOR CONTA NINJA/LOCAL COM SL E TP VÁLIDOS
      const shouldDispatchLocal = isLocalExecutionAccount && !payload.already_dispatched && finalStatus === 'Em Andamento';
      if (shouldDispatchLocal && localAcc) {
        // Garantir que nenhuma ordem a mercado seja enviada sem StopLoss e Take Profit
        let finalSl = Number(payload.stop_loss || 0);
        let finalTp = Number(payload.take_profit || 0);
        let entryP = Number(payload.entry_price || 0);

        if (entryP <= 0) {
          const cache = targetPanelForReport ? panelDataCache.current[targetPanelForReport.id] : null;
          entryP = Number(cache?.marketData?.price || marketData?.price || 0);
          if (entryP > 0) {
            payload.entry_price = entryP;
          }
        }

        if (finalSl <= 0 && entryP > 0) {
          finalSl = payload.side === 'COMPRA' ? entryP - 20 : entryP + 20;
          payload.stop_loss = finalSl;
        }
        if (finalTp <= 0 && entryP > 0) {
          finalTp = payload.side === 'COMPRA' ? entryP + 40 : entryP - 40;
          payload.take_profit = finalTp;
        }

        if (finalSl > 0 && finalTp > 0) {
          payload.already_dispatched = true;
          const resolvedNinjaSymbol = resolveAccountExecutionSymbol(localAcc, payload.symbol);
          const stopPoints = entryP > 0 ? Math.abs(entryP - finalSl) : 0;
          const takePoints = entryP > 0 ? Math.abs(finalTp - entryP) : 0;

          const effectiveQty = Number(payload.contrato || (payload as any).quantity || 1);
          mirrorToLocalServer('/sinal_local', {
            ...payload,
            id: reportId,
            status: 'Em Andamento',
            created_at: optimisticReport.created_at,
            contrato: effectiveQty,
            quantity: effectiveQty,
            stop_loss: finalSl,
            take_profit: finalTp,
            stop_loss_points: stopPoints,
            take_profit_points: takePoints,
            price: entryP,
            entry_price: entryP,
            // account_name é OBRIGATÓRIO para o gateway encontrar a conta correta no NinjaTrader
            account_name: localAcc?.account_name || payload.account_name,
            symbol: resolvedNinjaSymbol
          });
        } else {
          console.warn('[CONTEXT] Ordem local bloqueada para o NinjaTrader: Stop Loss e Take Profit são obrigatórios.');
        }
      }

      // ⚡ DISPARO INSTANTÂNEO DE COPY TRADING (0ms): Centralizado sem duplicações (Apenas com permissão liberada pelo Admin)
      const isSysAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
      const canRunCopyTrading = (isSysAdmin || userPermissions?.allow_copy_trading !== false) &&
        !payload.already_dispatched_to_slaves &&
        finalStatus === 'Em Andamento';

      if (canRunCopyTrading) {
        await triggerCopyTradingForMaster(optimisticReport, payload);
        (payload as any).already_dispatched_to_slaves = true;
      }

      const newReport = await insertStrategyReportSupabase(payload);
      const finalReport = newReport || optimisticReport;

      // Contas NinjaTrader locais NÃO salvam relatórios simulados no cache local (usam execução real do NT8)
      if (!isLocalExecutionAccount) {
        const latestLocalReports = getLocalStrategyReports();
        const mergedMemory = [finalReport, ...latestLocalReports.filter(r => r.id !== reportId && r.id !== finalReport.id)];
        reportsRef.current = mergedMemory;
        setReports(mergedMemory);
        saveLocalStrategyReports(mergedMemory);
      }
      return finalReport;

    } catch (err: any) {
      console.error('[CONTEXT] Erro ao criar relatório:', err);
      addLog('ERRO', `Erro ao registrar operação no relatório: ${err.message || err}`, 'erro');
      return null;
    }
  };

  const getPanelPrice = useCallback((panelId?: string, symbol?: string): number => {
    if (panelId) {
      const cache = panelDataCache.current[panelId];
      if (cache?.marketData?.price && Number(cache.marketData.price) > 0) {
        return Number(cache.marketData.price);
      }
      if (cache?.candles && cache.candles.length > 0) {
        const lastCandle = cache.candles[cache.candles.length - 1];
        if (lastCandle?.close && Number(lastCandle.close) > 0) {
          return Number(lastCandle.close);
        }
      }
    }

    let matchedPanel = panelId ? (panels || []).find(p => p.id === panelId || p.instance_id === panelId) : null;
    if (!matchedPanel && symbol) {
      const cleanSym = symbol.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      matchedPanel = (panels || []).find(p => {
        const pSym = (p.symbol || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const pGamma = (p.gamma_symbol || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const pName = (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const pInst = (p.instance_id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return pSym === cleanSym || pGamma === cleanSym || pName.includes(cleanSym) || pInst.includes(cleanSym);
      });
    }

    if (matchedPanel) {
      const cache = panelDataCache.current[matchedPanel.id];
      if (cache?.marketData?.price && Number(cache.marketData.price) > 0) {
        return Number(cache.marketData.price);
      }
      if (cache?.candles && cache.candles.length > 0) {
        const lastCandle = cache.candles[cache.candles.length - 1];
        if (lastCandle?.close && Number(lastCandle.close) > 0) {
          return Number(lastCandle.close);
        }
      }
    }

    if (activePanel) {
      const cache = panelDataCache.current[activePanel.id];
      if (cache?.marketData?.price && Number(cache.marketData.price) > 0) {
        return Number(cache.marketData.price);
      }
      if (cache?.candles && cache.candles.length > 0) {
        const lastCandle = cache.candles[cache.candles.length - 1];
        if (lastCandle?.close && Number(lastCandle.close) > 0) {
          return Number(lastCandle.close);
        }
      }
    }

    if (marketData?.price && Number(marketData.price) > 0) {
      return Number(marketData.price);
    }
    if (candles && candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      if (lastCandle?.close && Number(lastCandle.close) > 0) {
        return Number(lastCandle.close);
      }
    }

    return 0;
  }, [panels, activePanel, marketData, candles]);

  const getPanelSnapshot = useCallback((panelId: string) => {
    if (!panelId || panelId === activePanel?.id) {
      return {
        candles: candles || [],
        marketData,
        gammaLevels,
        isLoading: isCandlesLoading,
        loadingProgress: candlesLoadingProgress
      };
    }
    const cache = panelDataCache.current[panelId];
    return {
      candles: cache?.candles || [],
      marketData: cache?.marketData || null,
      gammaLevels: cache?.gammaLevels || null,
      isLoading: Boolean(cache?.isFetchingCandles && (!cache?.candles || cache.candles.length === 0 || (cache as any)?.loadingProgress?.isLoading)),
      loadingProgress: (cache as any)?.loadingProgress || null
    };
  }, [activePanel?.id, candles, marketData, gammaLevels, isCandlesLoading, candlesLoadingProgress, panelCacheVersion]);

  const ensurePanelDataLoaded = useCallback((panelId: string) => {
    if (!panelId) return;
    const targetPanel = (panels || []).find(p => p.id === panelId);
    if (!targetPanel) return;
    const cache = panelDataCache.current[panelId];
    const pSettings = allSettings?.[panelId] || {
      ...(settings || {}),
      instance_id_screen: targetPanel.instance_id,
      instance_id_market: targetPanel.instance_id,
      gamma_symbol: targetPanel.symbol || targetPanel.name
    };
    const historyDays = Math.max(3, Number(pSettings?.chart_history_days) || 3);
    const loadedDays = Number((cache as any)?.loadedHistoryDays || 0);
    const hasCachedCandles = Boolean(cache && cache.candles && cache.candles.length > 0);
    const hasRequiredHistory = hasCachedCandles && (loadedDays >= historyDays || initialLoadedPanelsRef.current.has(panelId));
    const needsInitialOrBackfill = !hasCachedCandles || !hasRequiredHistory;
    if (needsInitialOrBackfill && !cache?.isFetchingCandles) {
      if (pSettings) {
        if (!panelDataCache.current[panelId]) {
          panelDataCache.current[panelId] = {
            marketData: null,
            forces: [],
            gammaLevels: null,
            screenshot: null,
            candles: [],
            lastGammaFetch: 0,
            lastGammaSymbol: '',
            lastScreenshotFetch: 0,
            lastCandlesFetch: 0,
            lastForceFetch: 0
          };
        }
        (panelDataCache.current[panelId] as any).loadingProgress = {
          isLoading: true,
          percent: 15,
          loaded: 0,
          total: Math.min(50000, historyDays * 1440),
          days: historyDays,
          isExplicitDaysChange: true
        };
        bumpPanelCacheVersion();
        executeMarketCycleForPanel(targetPanel, pSettings).then(() => {
          bumpPanelCacheVersion();
        }).catch(() => {});
      }
    }
  }, [panels, allSettings, settings, bumpPanelCacheVersion]);

  const ensurePanelHistoryDays = useCallback((panelId: string, requiredDays: number) => {
    if (!panelId) return;
    const targetDays = Math.max(3, Number(requiredDays) || 3);
    const cache = panelDataCache.current[panelId];
    const cachedCandles = cache?.candles;
    const loadedDays = Number((cache as any)?.loadedHistoryDays || 0);

    if (cachedCandles && cachedCandles.length > 0) {
      if (loadedDays >= targetDays) {
        return; // Já carregado em memória: zero requisição ao servidor
      }
      const firstMs = new Date(cachedCandles[0].timestamp).getTime();
      const lastMs = new Date(cachedCandles[cachedCandles.length - 1].timestamp).getTime();
      if (!isNaN(firstMs) && !isNaN(lastMs) && lastMs > firstMs) {
        const coveredDays = (lastMs - firstMs) / (24 * 60 * 60 * 1000);
        if (coveredDays >= targetDays - 1.5) {
          if (cache) (cache as any).loadedHistoryDays = Math.max(loadedDays, targetDays);
          return; // Já possui cobertura temporal suficiente em memória
        }
      }
    }

    // Só busca no servidor se realmente precisar de mais dias do que o já carregado
    refreshMarketData({ chart_history_days: targetDays }, [panelId]);
  }, []);

  const updateReportAction = async (
    id: string,
    status: 'Gain' | 'Stop' | 'Cancelado',
    exitPrice?: number
  ): Promise<boolean> => {
    try {
      let resolvedPrice = (exitPrice !== undefined && exitPrice !== null && !isNaN(exitPrice) && exitPrice > 0) ? exitPrice : undefined;
      const reportObj = (reportsRef.current || []).find(r => r.id === id) || reports.find(r => r.id === id);
      if (!resolvedPrice && reportObj) {
        let matchedPanel = reportObj.panel_id
          ? panels.find(p => p.id === reportObj.panel_id)
          : (reportObj.instance_id
            ? panels.find(p => p.instance_id === reportObj.instance_id)
            : null);
        if (!matchedPanel && reportObj.description) {
          const match = reportObj.description.match(/\[(.*?)\]/);
          if (match && match[1]) {
            const cleanName = match[1].toLowerCase().replace(/[^a-z0-9]/g, '');
            matchedPanel = panels.find(p => p.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanName || p.instance_id.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanName);
          }
        }
        if (matchedPanel) {
          const cache = panelDataCache.current[matchedPanel.id];
          if (cache && cache.marketData && cache.marketData.price) {
            resolvedPrice = Number(cache.marketData.price);
          }
        }
      }

      // Final fallback if we couldn't resolve a price
      if (!resolvedPrice || resolvedPrice <= 0) {
        resolvedPrice = marketData?.price ? Number(marketData.price) : (reportObj ? Number(reportObj.entry_price) : 0);
      }

      const closedAt = new Date().toISOString();

      // 🚀 Atualização Otimista Imediata no encerramento de posições (0ms de delay no gráfico) - propaga também para cópias SLAVE
      reportsRef.current = reportsRef.current.map(r => 
        (r.id === id || (r.master_operation_id === id && r.status === 'Em Andamento'))
          ? { ...r, status, exit_price: resolvedPrice, closed_at: closedAt }
          : r
      );
      setReports(prev => prev.map(r => 
        (r.id === id || (r.master_operation_id === id && r.status === 'Em Andamento'))
          ? { ...r, status, exit_price: resolvedPrice, closed_at: closedAt }
          : r
      ));
      saveLocalStrategyReports(reportsRef.current);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vortex_reports_updated'));
      }

      const success = await updateStrategyReportStatusSupabase(id, status, resolvedPrice, closedAt, false);
      return success;
    } catch (err: any) {
      console.error('[CONTEXT] Erro ao atualizar relatório:', err);
      addLog('ERRO', `Erro ao atualizar relatório: ${err.message || err}`, 'erro');
      return false;
    }
  };

  const updateReportLevelsAction = async (
    id: string,
    stopLoss: number | null,
    takeProfit: number | null,
    currentPrice?: number | null,
    _skipNinjaSync: boolean = false
  ): Promise<boolean> => {
    try {
      const nowTs = Date.now();
      const targetRepForTick = reportsRef.current.find(r => r.id === id || r.master_operation_id === id);
      const targetPanel = panels.find(p => p.id === (targetRepForTick?.panel_id || activePanel?.id));
      const tickSize = resolvePanelTickSize(targetPanel, settings);

      const safeStopLoss = stopLoss !== null && stopLoss !== undefined && !isNaN(Number(stopLoss))
        ? roundToTick(Number(stopLoss), tickSize)
        : null;
      const safeTakeProfit = takeProfit !== null && takeProfit !== undefined && !isNaN(Number(takeProfit))
        ? roundToTick(Number(takeProfit), tickSize)
        : null;

      // Atualiza o relatório MASTER no estado local e referências com carimbo de tempo
      reportsRef.current = reportsRef.current.map(r => {
        if (r.id === id) return { ...r, stop_loss: safeStopLoss, take_profit: safeTakeProfit, _levels_modified_at: nowTs };
        if (r.master_operation_id === id && r.status === 'Em Andamento') {
          return { ...r, stop_loss: safeStopLoss, take_profit: safeTakeProfit, _levels_modified_at: nowTs };
        }
        return r;
      });

      setReports(prev =>
        prev.map(r => {
          if (r.id === id) return { ...r, stop_loss: safeStopLoss, take_profit: safeTakeProfit, _levels_modified_at: nowTs };
          // Propaga também para cópias SLAVE vinculadas ainda em andamento
          if (r.master_operation_id === id && r.status === 'Em Andamento') {
            return { ...r, stop_loss: safeStopLoss, take_profit: safeTakeProfit, _levels_modified_at: nowTs };
          }
          return r;
        })
      );
      saveLocalStrategyReports(reportsRef.current);

      addLog(
        'OPERAÇÃO',
        `Ajuste fino de linhas: Stop Loss = ${safeStopLoss !== null ? safeStopLoss.toFixed(2) : '--'} | Take Profit = ${safeTakeProfit !== null ? safeTakeProfit.toFixed(2) : '--'} (propagado para cópias SLAVE em andamento | Tick: ${tickSize})`,
        'sistema'
      );

      // Resolução inteligente do ID real para o banco de dados
      let realDbId = id;
      if (id.startsWith('temp_')) {
        const found = reportsRef.current.find(r => r.status === 'Em Andamento' && !r.id.startsWith('temp_'));
        if (found) {
          realDbId = found.id;
        }
      }

      await updateStrategyReportLevelsSupabase(realDbId, stopLoss, takeProfit, currentPrice);

      try {
        window.dispatchEvent(new CustomEvent('vortex_report_levels_updated', {
          detail: { id: realDbId, stop_loss: stopLoss, take_profit: takeProfit }
        }));
      } catch {}

      return true;
    } catch (err: any) {
      console.error('[CONTEXT] Erro ao atualizar níveis da operação:', err);
      return false;
    }
  };


  const deleteReportAction = async (id: string): Promise<boolean> => {
    if (isRestrictedSession) return false;
    try {
      const success = await deleteStrategyReportSupabase(id);
      if (success) {
        // Limpar das referências do mapa de relatórios ativos por painel
        let foundPanelId: string | null = null;
        activeReportIdsRef.current.forEach((idSet, key) => {
          if (idSet.has(id)) {
            foundPanelId = key;
          }
        });
        if (foundPanelId) {
          const panelSet = activeReportIdsRef.current.get(foundPanelId);
          if (panelSet) {
            panelSet.delete(id);
            if (panelSet.size === 0) {
              activeReportIdsRef.current.delete(foundPanelId);
              const cache = panelDataCache.current[foundPanelId];
              if (cache) {
                cache.aiResult = null;
              }
              if (activePanelRef.current?.id === foundPanelId) {
                setAiResult(null);
              }
            }
          }
        }
        await fetchReportsList();
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('[CONTEXT] Erro ao deletar relatório:', err);
      addLog('ERRO', `Erro ao deletar relatório: ${err.message || err}`, 'erro');
      return false;
    }
  };

  const deleteMultipleReportsAction = async (ids: string[]): Promise<boolean> => {
    if (isRestrictedSession || ids.length === 0) return false;
    try {
      const { error } = await supabase
        .from('painelvm_strategy_reports')
        .delete()
        .in('id', ids);

      if (error) throw error;

      // Limpar das referências do mapa de relatórios ativos por painel
      ids.forEach(id => {
        let foundPanelId: string | null = null;
        activeReportIdsRef.current.forEach((idSet, key) => {
          if (idSet.has(id)) {
            foundPanelId = key;
          }
        });
        if (foundPanelId) {
          const panelSet = activeReportIdsRef.current.get(foundPanelId);
          if (panelSet) {
            panelSet.delete(id);
            if (panelSet.size === 0) {
              activeReportIdsRef.current.delete(foundPanelId);
              const cache = panelDataCache.current[foundPanelId];
              if (cache) {
                cache.aiResult = null;
              }
              if (activePanelRef.current?.id === foundPanelId) {
                setAiResult(null);
              }
            }
          }
        }
      });

      await fetchReportsList();
      return true;
    } catch (err: any) {
      console.error('[CONTEXT] Erro ao deletar múltiplos relatórios:', err);
      addLog('ERRO', `Erro ao deletar múltiplos relatórios: ${err.message || err}`, 'erro');
      return false;
    }
  };

  const isMarketDataStaleForPanel = (panelId: string, timeoutSec: number = 15): boolean => {
    const cache = panelDataCache.current[panelId];
    const timeoutMs = timeoutSec * 1000;
    const lastUpdate = cache?.lastMarketUpdateAt || lastRealtimeTickRef.current;

    if (lastUpdate && lastUpdate > 0) {
      const ageMs = Date.now() - lastUpdate;
      if (ageMs > timeoutMs) return true;
      return false;
    }

    // Se temos dados de mercado válidos no estado ou cache, não bloquear
    if (cache?.marketData?.price && cache.marketData.price !== '--') {
      return false;
    }

    return false;
  };

  const cancelAllOpenOperationsAction = async (targetPanelId?: string, targetAccountId?: string, exitPrice?: number): Promise<{ success: boolean; count: number }> => {
    try {
      const directOpenReports = (reportsRef.current || []).filter(r =>
        (r.status === 'Em Andamento' || (r.status as string) === 'Pendente') &&
        (!targetPanelId || r.panel_id === targetPanelId || r.instance_id === targetPanelId) &&
        (!targetAccountId || r.account_id === targetAccountId)
      );

      if (directOpenReports.length === 0) {
        return { success: true, count: 0 };
      }

      // 🔗 Inclui também todas as operações SLAVE vinculadas a estas operações MASTER abertas
      const masterIds = new Set(directOpenReports.map(r => r.id));
      const slaveOpenReports = (reportsRef.current || []).filter(r =>
        (r.status === 'Em Andamento' || (r.status as string) === 'Pendente') &&
        r.master_operation_id && masterIds.has(r.master_operation_id)
      );
      const openReports = [...directOpenReports, ...slaveOpenReports];

      const closedAt = new Date().toISOString();
      const openIds = new Set(openReports.map(r => r.id));

      // 🚀 1. Atualização Otimista Imediata Instantânea (0ms no gráfico - zera no mesmo milissegundo)
      reportsRef.current = reportsRef.current.map(r => 
        openIds.has(r.id) ? { ...r, status: 'Cancelado' as const, exit_price: exitPrice || r.entry_price || 0, closed_at: closedAt } : r
      );
      setReports(prev => prev.map(r => 
        openIds.has(r.id) ? { ...r, status: 'Cancelado' as const, exit_price: exitPrice || r.entry_price || 0, closed_at: closedAt } : r
      ));
      saveLocalStrategyReports(reportsRef.current);

      // ⚡ 2. Execução Paralela em Lote (propaga encerramento local e para todas as contas Slaves no NinjaTrader)
      const results = await Promise.all(
        openReports.map(r => {
          const resolvedPrice = exitPrice || (r.entry_price ? Number(r.entry_price) : 0);
          return updateStrategyReportStatusSupabase(r.id, 'Cancelado', resolvedPrice, closedAt, false);
        })
      );

      const cancelledCount = results.filter(Boolean).length;
      addLog('ALERTA', `🛑 Encerradas ${cancelledCount} operações (Cancelamento Imediato)`, 'alerta');
      return { success: true, count: cancelledCount };
    } catch (err: any) {
      console.error('[CONTEXT] Erro ao cancelar todas as operações abertas:', err);
      addLog('ERRO', `Erro ao cancelar todas as operações abertas: ${err.message || err}`, 'erro');
      return { success: false, count: 0 };
    }
  };

  const checkOperationalLimits = async (
    panelId: string,
    customSettings?: any,
    targetAcc?: BrokerAccount | null,
    isManualTrade?: boolean,
    isAtm?: boolean,
    side?: 'COMPRA' | 'VENDA' | string
  ): Promise<{ allowed: boolean; reason?: string }> => {
    const accToCheck = targetAcc || activeAccount;
    if (!accToCheck) {
      return { allowed: false, reason: 'Nenhuma conta operacional selecionada.' };
    }

    // 0.0.1. 🔒 Bloqueio de Mercado Fechado (Fim de semana / Sexta após fechamento / Domingo antes da abertura)
    const mktCycleEnd = customSettings?.global_cycle_end || settings?.global_cycle_end || '18:00:00';
    const mktCycleStart = customSettings?.global_cycle_start || settings?.global_cycle_start || '19:00:00';
    const mktStatus = isMarketClosed(mktCycleEnd, mktCycleStart);
    if (mktStatus.closed) {
      return {
        allowed: false,
        reason: mktStatus.reason
      };
    }

    // 0.1. Verificação de Mercado Parado (Sem novos preços)
    const timeoutSec = Number(customSettings?.stale_market_timeout_sec || settings?.stale_market_timeout_sec) || 15;
    if (panelId && isMarketDataStaleForPanel(panelId, timeoutSec)) {
      return {
        allowed: false,
        reason: `Mercado parado ou sessão encerrada (sem alteração de preço nos últimos ${timeoutSec}s). Operações bloqueadas.`
      };
    }

    // 0.2. Verificação de Parada de Sessão do Mercado (das 18:00 às 19:00 por padrão)
    const nowSP = getSaoPauloDate();
    const pad = (num: number) => String(num).padStart(2, '0');
    const currentTimeStr = `${pad(nowSP.getHours())}:${pad(nowSP.getMinutes())}:${pad(nowSP.getSeconds())}`;

    if (isMarketSessionPaused(currentTimeStr, mktCycleEnd, mktCycleStart)) {
      return {
        allowed: false,
        reason: `Parada da sessão operacional do mercado (${mktCycleEnd} às ${mktCycleStart}). Operações, robôs e alertas pausados.`
      };
    }

    const matchedPanel = (panels || []).find((p: any) => p.id === panelId);

    // 🛡️ Validação Completa das Regras da Conta (Stop Diário, Meta de Lucro, Max Drawdown, Max Trades, Posição Única no Mesmo Ativo e Múltiplos Sinais)
    return validateAccountTradingRules(accToCheck, {
      panelId,
      panelInstanceId: matchedPanel?.instance_id,
      symbol: matchedPanel?.gamma_symbol || matchedPanel?.name,
      assetName: matchedPanel?.name,
      side,
      isManualTrade,
      isAtm,
      reports: reportsRef.current || reports || [],
      panels,
      customSettings
    });
  };

  // 7. Lógica do Ciclo da Inteligência Artificial (Copilot do Gráfico + Prompts Geradores de Sinais em 2º Plano)
  const executeAiCycleForPanel = async (
    targetPanel: any,
    targetSettings: any,
    robotSignal?: { strategyName: string; side: 'COMPRA' | 'VENDA'; timeframe: number; details: string; lots?: number },
    isManual: boolean = false
  ): Promise<any> => {
    if (isRestrictedSession) return null;

    if (isMarketDataStaleForPanel(targetPanel.id, 15) && !isManual) {
      console.log(`[AI ENGINE] [${targetPanel.name}] Análise de IA ignorada pois o mercado está sem atualização de preços.`);
      return null;
    }

    const currentChartAcc = activeAccountRef.current || activeAccount;
    const currentChartPanel = activePanelRef.current || activePanel;
    const currentPromptsList = (promptsRef.current && promptsRef.current.length > 0) ? promptsRef.current : (prompts || []);
    const currentAccountsList = (accountsRef.current && accountsRef.current.length > 0) ? accountsRef.current : (accounts || []);
    const currentAccountStrategiesList = (accountStrategiesRef.current && accountStrategiesRef.current.length > 0)
      ? accountStrategiesRef.current
      : (accountStrategies || []);

    // Identificar se o prompt solicitado é um Prompt Gerador de Sinais (prompt_type === 'signal_generator'),
    // o qual é vinculado na Gestão de Contas e DEVE rodar em 2º plano para TODAS as contas ativas vinculadas,
    // independente do painel/conta ativos no gráfico e independente do botão do Copilot!
    const requestedSinglePrompt = (targetSettings.selected_prompt_id && !String(targetSettings.selected_prompt_id).includes(','))
      ? currentPromptsList.find(p => p.id === targetSettings.selected_prompt_id)
      : null;
    const isSignalGeneratorRun = Boolean(
      requestedSinglePrompt && requestedSinglePrompt.prompt_type === 'signal_generator'
    );

    // =========================================================================
    // REGRAS 2b e 2c (GOVERNANÇA ESTRITA EXCLUSIVA DO COPILOT DO GRÁFICO):
    // Quando NÃO for um Prompt Gerador de Sinais de Conta (isSignalGeneratorRun === false):
    // b) Se o ciclo geral do Copilot estiver desativado (aiEnabledRef === false),
    //    NENHUMA conta com prompt Copilot vinculado pode disparar análises autônomas.
    // c) O Copilot SÓ deve funcionar se o gráfico do ativo correspondente E a
    //    conta vinculada estiverem ativos no gráfico em primeiro plano.
    // =========================================================================
    if (!isManual && !isSignalGeneratorRun) {
      if (!aiEnabledRef.current) {
        return null;
      }
      if (!currentChartPanel || currentChartPanel.id !== targetPanel.id) {
        return null;
      }
      if (!currentChartAcc || currentChartAcc.is_active === false) {
        return null;
      }
    }

    // Resolver os prompts compatíveis do Copilot vinculados especificamente à Conta ativa no gráfico e ao Ativo ativo no gráfico
    const compatibleRoutesForActiveChart = currentChartAcc
      ? getCompatibleCopilotRoutesForAccountAndPanel(currentChartAcc, targetPanel)
      : [];
    const compatiblePromptIdsForChart = compatibleRoutesForActiveChart
      .map(r => r.prompt_id)
      .filter((id): id is string => Boolean(id));

    if (!isManual && !isSignalGeneratorRun && compatiblePromptIdsForChart.length === 0) {
      // A conta ativa no gráfico não possui prompt Copilot compatível e habilitado para este ativo
      return null;
    }

    // Se houver múltiplas estratégias selecionadas (ou se precisar resolver a partir da conta ativa), mapeia individualmente
    const rawPromptIdStr = targetSettings.selected_prompt_id || compatiblePromptIdsForChart.join(',');
    if (rawPromptIdStr.includes(',')) {
      const candidateIds = rawPromptIdStr.split(',').filter(Boolean);
      const linkedActiveIds = candidateIds.filter((singleId: string) => {
        const pObj = currentPromptsList.find(p => p.id === singleId);
        if (pObj && pObj.prompt_type === 'signal_generator') {
          if (!robotSignal && !isManual) return false;
          return currentAccountStrategiesList.some((s: AccountStrategy) =>
            s.prompt_id === singleId &&
            s.is_enabled !== false &&
            currentAccountsList.some(a => a.id === s.account_id && a.is_active !== false)
          );
        }
        if (!isManual && !compatiblePromptIdsForChart.includes(singleId)) {
          return false;
        }
        if (!robotSignal && pObj && pObj.trigger_strategy_id) {
          return false;
        }
        return true;
      });
      let lastRes = null;
      for (const singleId of linkedActiveIds) {
        lastRes = await executeAiCycleForPanel(
          targetPanel,
          { ...targetSettings, selected_prompt_id: singleId },
          robotSignal,
          isManual
        );
      }
      return lastRes;
    }

    const effectivePromptId = isSignalGeneratorRun
      ? rawPromptIdStr
      : ((!isManual && rawPromptIdStr && !compatiblePromptIdsForChart.includes(rawPromptIdStr))
          ? (compatiblePromptIdsForChart[0] || rawPromptIdStr)
          : (rawPromptIdStr || compatiblePromptIdsForChart[0] || 'default'));

    const activePromptId = effectivePromptId || 'default';
    const activePromptObj = activePromptId !== 'default' && currentPromptsList.length > 0
      ? currentPromptsList.find(p => p.id === activePromptId)
      : null;

    // Determinar as Contas e Rotas alvo desta análise:
    // - Para Prompt Gerador de Sinais (isSignalGeneratorRun): TODAS as contas ativas que possuem este prompt vinculado e habilitado na Gestão de Contas (roda em 2º plano!).
    // - Para Copilot do Gráfico: EXCLUSIVAMENTE a conta ativa no gráfico (currentChartAcc).
    const signalGeneratorRoutes = (isSignalGeneratorRun && activePromptObj)
      ? currentAccountStrategiesList.filter((s: AccountStrategy) =>
          s.prompt_id === activePromptObj.id && s.is_enabled !== false
        )
      : [];
    const signalGeneratorAccounts = (isSignalGeneratorRun && activePromptObj)
      ? currentAccountsList.filter((acc: BrokerAccount) =>
          acc.is_active !== false && signalGeneratorRoutes.some((r: AccountStrategy) => r.account_id === acc.id)
        )
      : [];

    if (isSignalGeneratorRun && !isManual && signalGeneratorAccounts.length === 0) {
      return null;
    }

    const reqAccName = isSignalGeneratorRun
      ? (signalGeneratorAccounts.map(a => a.account_name).join(', ') || 'Sem Conta Vinculada')
      : (currentChartAcc ? currentChartAcc.account_name : 'Sem Conta Ativa');
    const promptLabel = activePromptObj ? activePromptObj.name : (activePromptId !== 'default' ? activePromptId : 'Prompt Padrão');
    const aiLogPrefix = `[${targetPanel.name} | Conta: '${reqAccName}' | Prompt: '${promptLabel}']`;

    // Se este ciclo NÃO veio de um sinal de robô e o prompt exige robô acionador (trigger_strategy_id):
    if (activePromptObj && activePromptObj.trigger_strategy_id && !robotSignal && !isManual) {
      console.log(`[AI ENGINE] ${aiLogPrefix} Ignorado no ciclo autônomo (este prompt só é disparado pelo robô algoritmo vinculado).`);
      return null;
    }

    // Validar que o prompt de Copilot pertence à conta ativa no gráfico quando não for manual nem Gerador de Sinais
    if (!isManual && !isSignalGeneratorRun && activePromptObj && !compatiblePromptIdsForChart.includes(activePromptObj.id)) {
      return null;
    }

    // Se o prompt possui um robô acionador, validar as sessões operacionais do robô vinculado
    if (activePromptObj && activePromptObj.trigger_strategy_id && !isManual) {
      const linkedAlgo = (customStrategiesRef.current || []).find(s => s.id === activePromptObj.trigger_strategy_id)
        || (customStrategies || []).find(s => s.id === activePromptObj.trigger_strategy_id)
        || (publicStrategiesRef.current || []).find(s => s.id === activePromptObj.trigger_strategy_id)
        || (publicStrategies || []).find(s => s.id === activePromptObj.trigger_strategy_id);
      if (linkedAlgo && linkedAlgo.sessions && linkedAlgo.sessions.some((s: any) => s && s.active)) {
        const nowSP = getSaoPauloDate();
        const padFn = (n: number) => String(n).padStart(2, '0');
        const currentTimeStr = `${padFn(nowSP.getHours())}:${padFn(nowSP.getMinutes())}:${padFn(nowSP.getSeconds())}`;
        if (!isTimeInSessions(currentTimeStr, linkedAlgo.sessions)) {
          addLog('AVISO', `⚠️ [PROMPT IA] ${aiLogPrefix} Bloqueado: Robô acionador '${linkedAlgo.name}' está fora da sessão operacional (${currentTimeStr}).`, 'alerta');
          return null;
        }
      }
    }

    const lockKey = isSignalGeneratorRun
      ? `${targetPanel.id}_siggen_${activePromptId}`
      : `${targetPanel.id}_${currentChartAcc?.id || 'noacc'}_${activePromptId}`;

    if (panelAnalyzingRef.current.get(lockKey)) {
      console.log(`[IA] ${aiLogPrefix} Análise já em andamento. Ignorando chamada concorrente.`);
      return null;
    }

    const cache = panelDataCache.current[targetPanel.id];
    if (!cache || !cache.marketData) {
      addLog('IA', `${aiLogPrefix} Erro: Dados de mercado ausentes para análise de IA.`, 'erro');
      return null;
    }

    // Controle Estrito de Frequência de Execução da IA (Anti-Flooding e Prevenção de Rate Limit 429)
    const nowMs = Date.now();
    const triggerMode = targetSettings.ai_trigger_mode || 'barra';
    const lastExecutionTime = lastAiExecutionTimeRef.current[lockKey] || 0;

    // 1. Modo Barra Fechada: Avaliar estritamente UMA ÚNICA VEZ por candle fechado consolidado
    if (triggerMode === 'barra' && !isManual && !robotSignal) {
      const currentCandles = (cache.candles && cache.candles.length > 0) ? cache.candles : (candles || []);
      if (currentCandles.length > 1) {
        const closedCandle = currentCandles[currentCandles.length - 2] || currentCandles[currentCandles.length - 1];
        const closedCandleTimestamp = closedCandle ? closedCandle.timestamp : null;
        if (closedCandleTimestamp) {
          const lastEvaluatedCandle = lastEvaluatedAiClosedCandleRef.current[lockKey];
          if (lastEvaluatedCandle === closedCandleTimestamp) {
            return null;
          }
        }
      }
      if (nowMs - lastExecutionTime < 10000) {
        return null;
      }
    } else if (!isManual && !robotSignal) {
      // 2. Modo Tempo / Outros Modos: Respeitar estritamente o intervalo configurado (mínimo 15 segundos)
      const configuredIntervalMs = Math.max(15000, Number(targetSettings.intervalo || targetSettings.aiInterval || 30000));
      if (nowMs - lastExecutionTime < configuredIntervalMs) {
        return null;
      }
    }

    // Buscar screenshot de última hora caso a análise de gráfico esteja habilitada no prompt
    let finalScreenshot = cache.screenshot;
    const needsScreenshot = activePromptObj ? activePromptObj.analyze_chart !== false : false;

    if (needsScreenshot) {
      if (targetSettings.source_screen === 'candles') {
        addLog('IA', `${aiLogPrefix} Buscando candles e gerando captura de tela sob demanda para IA...`, 'sistema');
        try {
          const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
          const adminSet = !isSystemAdmin ? getAdminSetForPanel(targetPanel) : null;
          const candleInstanceId = targetSettings.instance_id_screen 
            || targetPanel.instance_id 
            || (adminSet ? adminSet.instance_id_screen : null) 
            || 'nt8_main';
          const candlesData = (cache.candles && cache.candles.length > 0)
            ? cache.candles
            : await fetchCandlesSupabase(targetPanel.id, candleInstanceId, 2880, targetPanel, targetSettings);
          if (candlesData && candlesData.length > 0) {
            if (!cache.candles || cache.candles.length === 0) {
              cache.candles = candlesData;
            }
            const chartB64 = await generateCandleChartScreenshot({
              candles: candlesData,
              gammaLevels: cache.gammaLevels,
              disabledLevels: targetSettings.disabled_levels || [],
              showSma9,
              showEma21,
              showEma50,
              showRsi,
              showMacd,
              candleBarCount: targetSettings.chart_candle_bar_count
            });
            if (chartB64) {
              finalScreenshot = chartB64.replace(/^data:image\/png;base64,/, '');
              cache.screenshot = finalScreenshot;
            }
          }
        } catch (err: any) {
          console.error('[IA] Erro ao obter candles/gerar screenshot:', err);
          addLog('IA', `${aiLogPrefix} Erro ao gerar imagem sob demanda: ${err.message}`, 'erro');
        }
      } else {
        addLog('IA', `${aiLogPrefix} Buscando captura de tela sob demanda do Supabase para IA...`, 'sistema');
        try {
          const screenshotData = await fetchScreenshotSupabase(targetPanel.id);
          if (screenshotData) {
            finalScreenshot = screenshotData;
            cache.screenshot = screenshotData;
          }
        } catch (err: any) {
          console.error('[IA] Erro ao buscar captura de tela:', err);
        }
      }
    }

    const finalData = cache.marketData;
    const finalForces = cache.forces;
    const finalLevels = cache.gammaLevels;

    if (!cache.aiResults) {
      cache.aiResults = {};
    }

    const targetAcc = isSignalGeneratorRun ? (signalGeneratorAccounts[0] || currentChartAcc) : currentChartAcc;
    const allOpenOps = (reportsRef.current || []).filter(r => r.status === 'Em Andamento');

    // Helper para formatar detalhamento de qual Conta tem operação aberta (Regra 2a)
    const formatOpenOpDetails = (op: any) => {
      if (!op) return '';
      const opAcc = currentAccountsList.find(a => a.id === op.account_id);
      const opAccName = opAcc ? opAcc.account_name : (op.account_id || reqAccName);
      const opPanel = (panels || []).find(p => p.id === op.panel_id || p.instance_id === op.instance_id);
      const opAsset = opPanel ? opPanel.name : (op.symbol || targetPanel.name);
      return `Operação de ${op.side || 'N/A'} aberta na Conta '${opAccName}' [Ativo: ${opAsset} | Estratégia: '${op.strategy_name || 'Manual'}' | Entrada: ${op.entry_price || '--'}]`;
    };

    if (isSignalGeneratorRun) {
      // Para Prompt Gerador de Sinais em 2º plano: validar se pelo menos uma das contas ativas vinculadas pode operar
      if (cache.aiResults[activePromptId || 'default']) {
        delete cache.aiResults[activePromptId || 'default'];
      }
      const eligibleSignalAccounts: BrokerAccount[] = [];
      for (const sigAcc of signalGeneratorAccounts) {
        const accOps = allOpenOps.filter(r => r.account_id === sigAcc.id);
        const accSameAssetOp = accOps.find(r => r.panel_id === targetPanel.id || r.instance_id === targetPanel.instance_id);
        if (accSameAssetOp) {
          addLog('IA', `[${targetPanel.name} | Conta: '${sigAcc.account_name}' | Prompt: '${promptLabel}'] Análise ignorada nesta conta: ${formatOpenOpDetails(accSameAssetOp)}.`, 'sistema');
          continue;
        }
        if (sigAcc.allow_multi_signals === false && accOps.length > 0) {
          addLog('IA', `[${targetPanel.name} | Conta: '${sigAcc.account_name}' | Prompt: '${promptLabel}'] Análise ignorada nesta conta: Múltiplos Sinais desativado — ${formatOpenOpDetails(accOps[0])}.`, 'sistema');
          continue;
        }
        if (!isManual) {
          const opCheck = await checkOperationalLimits(targetPanel.id, targetSettings, sigAcc, true);
          if (!opCheck.allowed) {
            addLog('IA', `[${targetPanel.name} | Conta: '${sigAcc.account_name}' | Prompt: '${promptLabel}'] Análise ignorada nesta conta: ${opCheck.reason}`, 'sistema');
            continue;
          }
        }
        eligibleSignalAccounts.push(sigAcc);
      }
      if (eligibleSignalAccounts.length === 0 && !isManual) {
        return null;
      }
    } else {
      const accountOps = allOpenOps.filter(r => !targetAcc || r.account_id === targetAcc.id);
      const sameAssetOp = accountOps.find(r => r.panel_id === targetPanel.id || r.instance_id === targetPanel.instance_id);

      // Se NÃO há operação real "Em Andamento" neste ativo para a conta ativa:
      if (!sameAssetOp) {
        if (cache.aiResults[activePromptId || 'default']) {
          delete cache.aiResults[activePromptId || 'default'];
        }

        if (targetAcc && targetAcc.allow_multi_signals === false && accountOps.length > 0) {
          const blockingOp = accountOps[0];
          addLog('IA', `${aiLogPrefix} Análise ignorada: Múltiplos Sinais em Ativos Diferentes desativado — ${formatOpenOpDetails(blockingOp)}.`, 'sistema');
          return;
        }

        if (!isManual) {
          const opCheck = await checkOperationalLimits(targetPanel.id, targetSettings, targetAcc || undefined, Boolean(robotSignal));
          if (!opCheck.allowed) {
            const anyOpenInAsset = allOpenOps.find(r => (r.panel_id === targetPanel.id || r.instance_id === targetPanel.instance_id) && (!targetAcc || r.account_id === targetAcc.id));
            const extraOpDetail = anyOpenInAsset ? ` (${formatOpenOpDetails(anyOpenInAsset)})` : '';
            addLog('IA', `${aiLogPrefix} Análise ignorada: ${opCheck.reason}${extraOpDetail}`, 'sistema');
            return;
          }
        }
      }
    }

    const checkIsActive = () => activePanelRef.current?.id === targetPanel.id;

    if (checkIsActive()) {
      isAnalyzingRef.current = true;
      setIsAnalyzing(true);
    }
    panelAnalyzingRef.current.set(lockKey, true);

    addLog('IA', `${aiLogPrefix} Iniciando análise com provedor: ${(targetSettings.ai_provider || 'Groq').toUpperCase()}...`, 'ia');

    try {
      const apiKey =
        targetSettings.ai_provider === 'groq' ? targetSettings.groq_api_key :
          targetSettings.ai_provider === 'gemini' ? targetSettings.gemini_api_key :
            targetSettings.openai_api_key;

      if (!apiKey || apiKey.trim() === '') {
        const provName = (targetSettings.ai_provider || 'Groq').toUpperCase();
        addLog('ERRO', `⚠️ [IA] Nenhuma Chave de API (${provName}) configurada. Acesse as Configurações para inserir sua API Key.`, 'erro');
        if (isManual) {
          alert(`⚠️ Nenhuma Chave de API configurada para o provedor ${provName}!\n\nPor favor, acesse o menu Configurações (⚙️) e insira sua API Key do provedor ${provName} para receber a análise da IA.`);
        }
        if (checkIsActive()) {
          isAnalyzingRef.current = false;
          setIsAnalyzing(false);
        }
        panelAnalyzingRef.current.delete(lockKey);
        return null;
      }

      const model =
        targetSettings.ai_provider === 'groq' ? targetSettings.groq_model :
          targetSettings.ai_provider === 'gemini' ? targetSettings.gemini_model :
            targetSettings.openai_model;

      const levelsObj: { [key: string]: string } = formatGammaLevelsObject(finalLevels);

      const formattedTrades = finalData.blockTrades.map(t =>
        `[${t.time}] ${t.side} | Vol: ${t.volume} @ Price: ${t.price}`
      );

      // 1. Extração de Macro Índices (S&P 500, USDIndex, VIX, Nasdaq) e Ações M7
      const macroIndexes: { [key: string]: { buy: number; sell: number; description?: string } } = {};
      const stocksM7: { [key: string]: { buy: number; sell: number; description?: string } } = {};

      const macroKeys = ['sp500', 'usdindex', 'vix', 'nasdaq'];
      const m7Keys = ['nvidia', 'microsoft', 'apple', 'meta', 'amazon', 'alphabet', 'tesla'];

      (finalForces || []).forEach(f => {
        const sLower = f.symbol.toLowerCase();
        if (macroKeys.some(k => sLower.includes(k))) {
          macroIndexes[f.symbol] = { buy: f.buy, sell: f.sell, description: `${f.symbol}: Compra ${f.buy}% / Venda ${f.sell}%` };
        } else if (m7Keys.some(k => sLower.includes(k))) {
          stocksM7[f.symbol] = { buy: f.buy, sell: f.sell, description: `${f.symbol}: Compra ${f.buy}% / Venda ${f.sell}%` };
        }
      });

      // 2. Extração de Volume Profile & Liquidez para IA
      let volumeProfileData: any = undefined;
      const rawCandles = cache.candles || [];
      if (rawCandles && rawCandles.length > 30) {
        try {
          const vpResult = calculateVolumeProfileAnalysis(rawCandles, {
            valueAreaPct: 70,
            topNodesCount: 5,
            sessionMode: 'all',
            systemSessionStart: targetSettings?.global_cycle_start || targetSettings?.session1_start,
            systemSessionEnd: targetSettings?.session1_end
          });
          if (vpResult && vpResult.levels) {
            volumeProfileData = {
              vpoc: vpResult.levels.poc,
              vah: vpResult.levels.vah,
              val: vpResult.levels.val,
              nakedPocs: vpResult.levels.nakedPocs,
              hvnBlocks: vpResult.hvnBlocks
            };
          }
        } catch (vpErr) {
          console.warn('[AI ENGINE] Erro ao extrair Volume Profile para IA:', vpErr);
        }
      }

      // 3. Gestão de Risco e Dimensionamento de Posição
      const sizingMode = (targetSettings.chart_manual_sizing_mode === 'risco' ? 'risco' : 'lote') as 'lote' | 'risco';
      const riskUsd = Number(targetSettings.chart_manual_risk_usd || 350);
      const pointVal = Number(targetPanel.point_value || targetSettings.point_value || targetSettings.point_value_usd || 1.0);
      const fixedContracts = Number(targetSettings.chart_manual_contracts || targetSettings.contracts || 1);

      const finalCandles = rawCandles && rawCandles.length > 0 ? rawCandles : (candles || []);
      const priceActionCandles = extractPriceActionFromCandles(finalCandles);
      const activeChartIndicators = extractActiveIndicatorsFromStorage(targetPanel, finalCandles, finalLevels, targetAcc?.id);
      const activeWidgetsData = extractActiveWidgetsFromStorage(targetPanel, finalData, finalForces, finalLevels, cache.optionsMarket || optionsMarket, targetAcc?.id);
      const lastClosedTrade = extractLastClosedTradeReview(reportsRef.current, targetPanel.id, targetPanel.instance_id, targetAcc?.id);

      const currentTradeOp = (reportsRef.current || []).find(r => 
        r.status === 'Em Andamento' && 
        (r.panel_id === targetPanel.id || r.instance_id === targetPanel.instance_id) &&
        (!targetAcc || r.account_id === targetAcc.id)
      );

      const curPriceNum = parseNumericValue(finalData.price) || 0;
      const entryPriceNum = currentTradeOp ? Number(currentTradeOp.entry_price || 0) : 0;
      const opSide = currentTradeOp ? (currentTradeOp.side || 'COMPRA') : 'COMPRA';
      const diffPts = currentTradeOp ? (opSide === 'COMPRA' ? (curPriceNum - entryPriceNum) : (entryPriceNum - curPriceNum)) : 0;
      const durationMins = currentTradeOp
        ? Math.max(0, Math.round((Date.now() - new Date(currentTradeOp.created_at).getTime()) / 60000))
        : 0;

      const aiReqData = {
        provider: targetSettings.ai_provider,
        apiKey: apiKey || '',
        model: model || '',
        symbol: finalData.symbol,
        price: finalData.price,
        zScore: finalData.zScore,
        atrRatio: finalData.atrRatio,
        sentiment: Number((finalData as any).sentiment || 50),
        macroSentiment: Number((finalData as any).macroSentiment !== undefined ? (finalData as any).macroSentiment : (finalData as any).sentiment || 50),
        microSentiment: Number((finalData as any).marketSentiment !== undefined ? (finalData as any).marketSentiment : ((finalData as any).microSentiment !== undefined ? (finalData as any).microSentiment : (finalData as any).sentiment || 50)),
        estado: (finalData as any).estado || 'NORMAL',
        delta: finalData.delta,
        deltaRatio: finalData.deltaRatio,
        prints: finalData.printsPerSecond,
        forces: finalForces,
        macroIndexes,
        stocksM7,
        volumeProfile: volumeProfileData,
        priceActionCandles,
        activeChartIndicators,
        activeWidgetsData,
        lastClosedTrade,
        sizingManagement: {
          mode: sizingMode,
          riskUsd,
          pointValue: pointVal,
          fixedContracts
        },
        currentPosition: currentTradeOp ? {
          side: opSide,
          entryPrice: entryPriceNum,
          currentProfit: diffPts,
          currentPrice: curPriceNum,
          stopLoss: Number(currentTradeOp.stop_loss || 0),
          takeProfit: Number(currentTradeOp.take_profit || 0),
          durationMinutes: durationMins,
          contracts: Number(currentTradeOp.contrato || 1)
        } : undefined,
        blockTrades: formattedTrades,
        news: news.map(n => `[${n.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}] ${n.country} - ${n.title} (Impacto: ${n.impact})`),
        levels: levelsObj,
        screenshotBase64: (() => {
          if (targetSettings.enviar_imagem_ia === false) return undefined;
          if (activePromptObj && activePromptObj.analyze_chart === false) {
            return undefined;
          }
          return finalScreenshot || undefined;
        })(),
        promptTemplate: (() => {
          let customPromptSection = '';
          if (activePromptObj) {
            customPromptSection = `\n\n[ESTRATÉGIA COMPLEMENTAR VINCULADA]:
- Nome da Estratégia: ${activePromptObj.name}
- Descrição: ${activePromptObj.description || 'Nenhuma descrição fornecida.'}
- Confluências Exigidas: ${activePromptObj.confluences || 'Não especificado.'}
- Gatilho de Entrada: ${activePromptObj.trigger_entry || 'Não especificado.'}
- Stop Loss: ${activePromptObj.stop_loss_type === 'regions' ? 'Níveis Gamma/Volume' : 'Pontos'} (${activePromptObj.stop_loss_value})
- Take Profit: ${activePromptObj.take_profit_type === 'regions' ? 'Níveis Gamma/Volume' : 'Pontos'} (${activePromptObj.take_profit_value})
Complemente a análise técnica do gráfico exigindo o alinhamento com esta estratégia.`;
          }

          let basePrompt = `Você é o Copilot de Trading Quantitativo Institucional de Alta Precisão (Axion TradeStation AI).
Seu objetivo é analisar o mercado em tempo real através do CONTEXTO TÉCNICO COMPLETO DO GRÁFICO e da conta de negociação.

REGRAS MANDATÓRIAS DE ANÁLISE E GESTÃO:

1. REGRA MANDATÓRIA DE OPERAÇÃO ABERTA NA CONTA:
- Se houver operação aberta na conta (current_open_position não for nulo): SUA PRIORIDADE MÁXIMA E OBRIGATÓRIA É A GESTÃO E PROTEÇÃO DESSA OPERAÇÃO.
- Avalie o preço de entrada (${currentTradeOp?.entry_price || '--'}), lucro/prejuízo atual (${currentTradeOp ? (currentTradeOp.side === 'COMPRA' ? curPriceNum - Number(currentTradeOp.entry_price || 0) : Number(currentTradeOp.entry_price || 0) - curPriceNum) : 0} pts), duração (${durationMins} min), distância para o Stop Loss (${currentTradeOp?.stop_loss || '--'}) e Take Profit (${currentTradeOp?.take_profit || '--'}).
- Se a operação tiver < 3 minutos de duração: MANTENHA A OPERAÇÃO ("tradeAction": "HOLD") para permitir a evolução da tese.
- Se o preço avançou significativamente a favor (40-50% do alvo): sugira "BREAK_EVEN" ou "TRAIL_STOP".
- Se houver reversão técnica estrutural contra a posição: sugira "CLOSE" ou "SAIR".

2. ANÁLISE TÉCNICA PURA DO GRÁFICO E INDICADORES ATIVOS:
- Avalie todos os indicadores ativos no gráfico (active_chart_indicators_readings), como EMAs, VWAP, Supertrend, SMC Order Blocks, Faixas de Horário e Volume Profile.
- Avalie os widgets em tempo real: Z-Score (extremos estatísticos), Sentimento Macro e Micro, Tape Reading (Block Trades, Delta, Delta Ratio), Forças Agregadas (com regra inversa de VIX e DXY) e Níveis Gamma (HVL, GWall, Call Wall, Put Wall, Void Gamma).
- Avalie a imagem limpa da tela do gráfico (screenshot dos candles) para confirmar formações e rejeições.

3. SE NÃO HOUVER OPERAÇÃO ABERTA:
- Se houver confluência técnica clara entre Indicadores + Widgets + Gamma + Gatilho de Price Action com confiança >= 75%: defina "sinal": "COMPRA" | "VENDA", "tradeAction": "OPEN", "confianca": "ex: 85%", com "alvo" e "stop" protegidos.
- Caso contrário: defina "sinal": "AGUARDANDO", "tradeAction": "HOLD".
${customPromptSection}`;

          if (robotSignal) {
            basePrompt += `\n\n[DISPARO POR ESTRATÉGIA DO ROBÔ]
Um algoritmo técnico disparou um sinal reativo para este ativo:
- Nome do Robô: ${robotSignal.strategyName}
- Sinal do Robô: ${robotSignal.side}
- Timeframe: M${robotSignal.timeframe}
- Regras Atendidas:
${robotSignal.details}

Por favor, valide se esse sinal de ${robotSignal.side} emitido pelo robô está correto de acordo com o contexto atual do mercado. Caso concorde, confirme o sinal no campo "sinal" (COMPRA, VENDA ou AGUARDANDO).`;
          }
          return basePrompt;
        })(),
        gammaBias: finalLevels ? {
          buyStrength: finalLevels.buy_strength,
          sellStrength: finalLevels.sell_strength,
          gammaBias: finalLevels.gamma_bias,
          biasScore: finalLevels.bias_score,
          nearestResistance: finalLevels.nearest_resistance,
          nearestSupport: finalLevels.nearest_support,
          distanceToResistance: finalLevels.distance_to_resistance,
          distanceToSupport: finalLevels.distance_to_support,
          confluenceType: finalLevels.confluence_type,
          recommendedStrategy: finalLevels.recommended_strategy,
          voidGammaAbove: finalLevels.void_gamma_above,
          voidGammaBelow: finalLevels.void_gamma_below,
          biasTimestamp: finalLevels.bias_timestamp
        } : undefined
      };

      const res = await runMarketAnalysis(aiReqData);

      // Atualizar marcadores de tempo e candle fechado avaliado
      lastAiExecutionTimeRef.current[lockKey] = Date.now();
      if (triggerMode === 'barra') {
        const currentCandles = (cache.candles && cache.candles.length > 0) ? cache.candles : (candles || []);
        if (currentCandles.length > 1) {
          const closedCandle = currentCandles[currentCandles.length - 2] || currentCandles[currentCandles.length - 1];
          if (closedCandle?.timestamp) {
            lastEvaluatedAiClosedCandleRef.current[lockKey] = closedCandle.timestamp;
          }
        }
      }

      // Validação de Sanidade
      if (res.success && (res.sinal === 'COMPRA' || res.sinal === 'VENDA')) {
        const currentPrice = parseNumericValue(finalData.price) || 0;
        const alvoPrice = parseNumericValue(res.alvo);
        const stopPrice = parseNumericValue(res.stop);

        if (alvoPrice !== null && stopPrice !== null && currentPrice > 0) {
          let swapped = false;
          if (res.sinal === 'COMPRA') {
            if (alvoPrice < currentPrice || stopPrice > currentPrice) {
              swapped = true;
            }
          } else if (res.sinal === 'VENDA') {
            if (alvoPrice > currentPrice || stopPrice < currentPrice) {
              swapped = true;
            }
          }

          if (swapped) {
            addLog('IA', `🚨 [IA Sanity Check] ${aiLogPrefix} Valores de Alvo (${res.alvo}) e Stop (${res.stop}) invertidos. Corrigindo...`, 'sistema');
            const temp = res.alvo;
            res.alvo = res.stop;
            res.stop = temp;
          }
        }
      }

      if (!cache.aiResults) {
        cache.aiResults = {};
      }
      cache.aiResults[activePromptId || 'default'] = res;
      (cache as any).aiResult = res;
      if (checkIsActive()) {
        setAiResult(res);
      }

      // Notificar o Copilot Drawer e Chat em tempo real
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vortex_copilot_thought', {
          detail: {
            signal: res.sinal,
            confianca: res.confianca,
            alvo: res.alvo,
            stop: res.stop,
            gatilho: res.gatilho,
            resumo: res.resumo,
            copilotThought: res.copilotThought,
            tradeAction: res.tradeAction
          }
        }));
      }

      if (res.success && res.sinal) {
        addLog('IA', `${aiLogPrefix} Decisão: ${res.sinal} (Confiança: ${res.confianca}) - ${res.copilotThought || res.resumo}`, 'ia');

        // Síntese de Voz (TTS) automática
        const thoughtToSpeak = res.copilotThought || res.resumo || (res.sinal !== 'AGUARDANDO' ? `${res.sinal} no preço ${finalData.price}` : '');
        const isCriticalAction = res.tradeAction !== 'HOLD' || res.sinal === 'COMPRA' || res.sinal === 'VENDA' || res.sinal === 'SAIR';

        if (thoughtToSpeak && targetSettings.enable_tts && targetSettings.resource_tts_enabled !== false) {
          speakText(thoughtToSpeak, {
            enabled: targetSettings.enable_tts,
            provider: targetSettings.tts_provider,
            groqApiKey: targetSettings.tts_groq_api_key || targetSettings.groq_api_key,
            groqModel: targetSettings.tts_groq_model,
            groqVoice: targetSettings.tts_groq_voice,
            geminiApiKey: targetSettings.tts_gemini_api_key || targetSettings.gemini_api_key,
            geminiModel: targetSettings.tts_gemini_model || 'gemini-3.8-flash-lite-tts',
            geminiVoice: targetSettings.tts_gemini_voice || 'Puck',
            openaiApiKey: targetSettings.tts_openai_api_key || targetSettings.openai_api_key,
            openaiModel: targetSettings.tts_openai_model || 'gpt-4o-mini-tts',
            openaiVoice: targetSettings.tts_openai_voice,
            triggerMode: targetSettings.tts_trigger_mode,
            cooldownSeconds: targetSettings.tts_cooldown_seconds,
            volume: targetSettings.tts_volume,
            isCritical: isCriticalAction
          }).catch(e => console.warn('[TTS Auto Cycle Error]', e));
        }

        if (res.sinal !== 'AGUARDANDO' && checkIsActive() && targetSettings.alert_sound_enabled) {
          playAlertBeep(880, 300);
        }

        if (res.alerta && res.alerta !== '--') {
          addLog('ALERTA', `Alerta IA ${aiLogPrefix}: ${res.alerta}`, 'alerta');
        }

        // Notificação Telegram
        if (targetSettings.telegram_enabled && targetSettings.telegram_bot_token && targetSettings.telegram_chat_id) {
          sendTelegramNotification(res, targetSettings, targetPanel.name, finalScreenshot);
        }

        // Gestão e Proteção Automática de Posição Aberta
        if (currentTradeOp && currentTradeOp.status === 'Em Andamento') {
          // 1. Encerramento Emergencial / Reversão Estrutural (CLOSE / SAIR)
          if (res.tradeAction === 'CLOSE' || res.sinal === 'SAIR') {
            addLog('SISTEMA', `🛡️ [GESTÃO IA] ${aiLogPrefix} Encerrando operação ${currentTradeOp.id} por recomendação da IA (${res.copilotThought || res.resumo})...`, 'sistema');
            updateReportAction(currentTradeOp.id, 'Cancelado', curPriceNum).catch(err =>
              console.error('[IA] Erro ao encerrar operação na gestão:', err)
            );
          }
          // 2. Proteção de Lucro / Breakeven (BREAK_EVEN / TRAIL_STOP)
          else if (res.tradeAction === 'BREAK_EVEN' || res.tradeAction === 'TRAIL_STOP') {
            const entryP = Number(currentTradeOp.entry_price || 0);
            const currentSL = currentTradeOp.stop_loss ? Number(currentTradeOp.stop_loss) : null;
            let targetSL = entryP;

            if (res.suggestedStopUpdate) {
              const parsedSL = parseNumericValue(res.suggestedStopUpdate, entryP);
              if (parsedSL) targetSL = parsedSL;
            }

            // Atualizar Stop Loss se o novo stop for mais favorável / protetivo
            const isBuy = currentTradeOp.side === 'COMPRA';
            const isImprovement = isBuy
              ? (currentSL === null || targetSL > currentSL)
              : (currentSL === null || targetSL < currentSL);

            if (isImprovement && targetSL > 0) {
              addLog('SISTEMA', `🛡️ [GESTÃO IA] ${aiLogPrefix} Ajustando Stop Loss de ${currentSL || '--'} para ${targetSL.toFixed(2)} (${res.tradeAction})...`, 'sistema');
              updateReportLevelsAction(currentTradeOp.id, targetSL, currentTradeOp.take_profit ? Number(currentTradeOp.take_profit) : null).catch(err =>
                console.error('[IA] Erro ao ajustar stop na gestão:', err)
              );
            }
          }
        }

        // Registrar nova ordem no Supabase apenas se NÃO houver operação em andamento neste ativo
        if (!currentTradeOp && (res.sinal === 'COMPRA' || res.sinal === 'VENDA')) {
          try {
            const strategyId = activePromptObj ? activePromptObj.id : null;
            const strategyName = activePromptObj ? activePromptObj.name : 'Prompt Padrão';
            const activePrompt = activePromptObj;

            const entryPriceNum = parseNumericValue(finalData.price) || 0;
            const stopLossNum = parseNumericValue(res.stop, entryPriceNum);
            const takeProfitNum = parseNumericValue(res.alvo, entryPriceNum);

            // Dimensionamento inteligente e Estrito de Lotes e Stop Loss (Garantia Inviolável de Limite de Risco em Dólares)
            let baseLots = (robotSignal && robotSignal.lots) ? Number(robotSignal.lots) : fixedContracts;
            let finalStopLossNum = stopLossNum;

            // Garantia de Stop Loss seguro se não retornado pela IA
            const defaultStopDist = (sizingMode === 'risco' && riskUsd > 0) ? (riskUsd / pointVal) : 40;
            if (!finalStopLossNum && entryPriceNum > 0) {
              finalStopLossNum = res.sinal === 'COMPRA'
                ? entryPriceNum - defaultStopDist
                : entryPriceNum + defaultStopDist;
            }

            if (sizingMode === 'risco' && entryPriceNum > 0) {
              const maxPtsFor1Lot = riskUsd / pointVal;
              let currentStopDistance = finalStopLossNum ? Math.abs(entryPriceNum - finalStopLossNum) : maxPtsFor1Lot;

              if (currentStopDistance <= 0 || !finalStopLossNum) {
                currentStopDistance = maxPtsFor1Lot;
              }

              if (currentStopDistance > maxPtsFor1Lot) {
                baseLots = 1;
                finalStopLossNum = res.sinal === 'COMPRA'
                  ? entryPriceNum - maxPtsFor1Lot
                  : entryPriceNum + maxPtsFor1Lot;
                addLog('IA', `🛡️ [GESTÃO DE RISCO ESTRITA] ${aiLogPrefix} Stop Loss ajustado para ${finalStopLossNum.toFixed(2)} (${maxPtsFor1Lot.toFixed(1)} pts) para garantir risco máximo de $${riskUsd}.`, 'sistema');
              } else {
                const calculatedLots = Math.max(1, Math.floor(riskUsd / (currentStopDistance * pointVal)));
                baseLots = calculatedLots;
                const totalRisk = calculatedLots * currentStopDistance * pointVal;
                addLog('IA', `🛡️ [GESTÃO DE RISCO] ${aiLogPrefix} Stop: ${currentStopDistance.toFixed(2)} pts | Lotes: ${calculatedLots} | Risco Total: $${totalRisk.toFixed(2)} (Limite: $${riskUsd})`, 'sistema');
              }
            }

            let finalTakeProfitNum = takeProfitNum;
            if (!finalTakeProfitNum && entryPriceNum > 0 && finalStopLossNum) {
              const stopDist = Math.abs(entryPriceNum - finalStopLossNum);
              finalTakeProfitNum = res.sinal === 'COMPRA' ? (entryPriceNum + stopDist * 2) : (entryPriceNum - stopDist * 2);
            }

            // Determinar contas vinculadas para abertura da ordem:
            // - Se for Prompt Gerador de Sinais (isSignalGeneratorRun): abre ordem em TODAS as contas ativas vinculadas e habilitadas (em 1º ou 2º plano).
            // - Se for Copilot do Gráfico (!isSignalGeneratorRun): Regra 2c — abre ordem estritamente na Conta ativa no gráfico (targetAcc).
            const linkedRoutes = isSignalGeneratorRun ? signalGeneratorRoutes : compatibleRoutesForActiveChart;
            const activeLinkedAccounts = isSignalGeneratorRun
              ? signalGeneratorAccounts
              : ((targetAcc && targetAcc.is_active !== false) ? [targetAcc] : []);

            const openOpsInPanel = (reportsRef.current || []).filter(r => r.status === 'Em Andamento' && (r.panel_id === targetPanel.id || r.instance_id === targetPanel.instance_id));
            const allTargetsHaveOpenOp = activeLinkedAccounts.length > 0 && activeLinkedAccounts.every(acc =>
              openOpsInPanel.some(r => r.account_id === acc.id)
            );

            if (allTargetsHaveOpenOp) {
              const firstBlockingOp = openOpsInPanel.find(r => activeLinkedAccounts.some(a => a.id === r.account_id));
              addLog('AVISO', `⚠️ [PROMPT IA] ${aiLogPrefix} Sinal (${res.sinal}) ignorado: ${formatOpenOpDetails(firstBlockingOp)}.`, 'alerta');
              res.sinal = 'AGUARDANDO' as any;
            }

            if (activeLinkedAccounts.length === 0) {
              addLog('AVISO', `⚠️ [PROMPT IA] ${aiLogPrefix} Ordem ignorada: Nenhuma conta ativa vinculada e habilitada.`, 'alerta');
            } else if (res.sinal === 'COMPRA' || res.sinal === 'VENDA') {
              for (const execAcc of activeLinkedAccounts) {
                const existingOpOnExecAcc = openOpsInPanel.find(r => r.account_id === execAcc.id);
                if (existingOpOnExecAcc) {
                  addLog('AVISO', `⚠️ [PROMPT IA] ${aiLogPrefix} Ordem na conta '${execAcc.account_name}' ignorada: ${formatOpenOpDetails(existingOpOnExecAcc)}.`, 'alerta');
                  continue;
                }
                const route = linkedRoutes.find((r: AccountStrategy) => r.account_id === execAcc.id && (!activePrompt || r.prompt_id === activePrompt.id))
                  || linkedRoutes.find((r: AccountStrategy) => r.account_id === execAcc.id);
                const multiplier = route?.contract_size_multiplier || 1.0;
                const finalLots = Math.max(1, Math.round(baseLots * multiplier));

                // 🛡️ Validação Completa de Risco da Conta e Bloqueio de Master NinjaTrader
                const opCheck = await checkOperationalLimits(targetPanel.id, targetSettings, execAcc, false, false);
                if (!opCheck.allowed) {
                  addLog('AVISO', `⚠️ [PROMPT IA] ${aiLogPrefix} Ordem na conta '${execAcc.account_name}' bloqueada: ${opCheck.reason}`, 'alerta');
                  continue;
                }

                const insertKey = `${execAcc.id}_${targetPanel.id}`;
                if (pendingSignalInsertsRef.current.has(insertKey)) continue;
                pendingSignalInsertsRef.current.add(insertKey);

                try {
                  const newReport = await insertStrategyReportSupabase({
                    strategy_id: strategyId,
                    strategy_name: strategyName,
                    instance_id: targetPanel.instance_id,
                    side: res.sinal,
                    entry_price: entryPriceNum,
                    stop_loss: finalStopLossNum,
                    take_profit: takeProfitNum,
                    exit_price: null,
                    status: 'Em Andamento',
                    description: `[${targetPanel.name}] ${res.resumo || ''}`,
                    panel_id: targetPanel.id,
                    contrato: finalLots,
                    account_id: execAcc.id,
                    symbol: targetPanel.gamma_symbol || targetSettings?.gamma_symbol || (() => {
                      const norm = (targetPanel.name || targetPanel.instance_id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                      if (norm.includes('sp500') || norm.includes('sp') || norm.includes('es')) return 'ES';
                      if (norm.includes('nasdaq') || norm.includes('nq')) return 'NQ';
                      if (norm.includes('gold') || norm.includes('ouro') || norm.includes('gc')) return 'GC';
                      if (norm.includes('oil') || norm.includes('petr') || norm.includes('cl')) return 'CL';
                      if (norm.includes('dxy') || norm.includes('usdindex')) return 'DXY';
                      return targetPanel.name || 'NQ';
                    })()
                  });

                  if (newReport) {
                    reportsRef.current = [newReport, ...reportsRef.current.filter(r => r.id !== newReport.id)];
                    setReports(prev => [newReport, ...prev.filter(r => r.id !== newReport.id)]);

                    if (!activeReportIdsRef.current.has(targetPanel.id)) {
                      activeReportIdsRef.current.set(targetPanel.id, new Set());
                    }
                    activeReportIdsRef.current.get(targetPanel.id)!.add(newReport.id);
                    addLog('SISTEMA', `🚀 [PROMPT IA] ${aiLogPrefix} Ordem (${res.sinal}) enviada com sucesso na conta '${execAcc.account_name}'! (Lote: ${finalLots}x)`, 'sistema');
                    await fetchReportsList();
                  }
                } finally {
                  pendingSignalInsertsRef.current.delete(insertKey);
                }
              }
            }
          } catch (reportErr) {
            console.error('[IA] Erro ao registrar operação no relatório:', reportErr);
          }
        }
      } else {
        addLog('ERRO', `Análise falhou ${aiLogPrefix}: ${res.resumo}`, 'erro');
      }
      return res;
    } catch (err: any) {
      console.error(`[IA] Erro na análise do painel ${targetPanel.name}:`, err);
      const isRateLimit = String(err?.message || err).includes('429') || String(err?.message || err).includes('Rate limit');
      if (isRateLimit) {
        // Backoff de 15 segundos em caso de 429 para permitir que a janela de tokens por minuto (TPM) da Groq/OpenAI se restabeleça
        lastAiExecutionTimeRef.current[lockKey] = Date.now() + 15000;
        addLog('AVISO', `⏳ [${targetPanel.name}] Limite de requisições por minuto da IA atingido (Rate Limit 429). Pausando análises temporariamente por 15s...`, 'alerta');
      } else {
        addLog('ERRO', `[${targetPanel.name}] Erro na análise de IA: ${err.message || err}`, 'erro');
      }
      return { success: false, resumo: err.message || String(err), sinal: 'AGUARDANDO' };
    } finally {
      if (checkIsActive()) {
        isAnalyzingRef.current = false;
        setIsAnalyzing(false);
      }
      panelAnalyzingRef.current.set(lockKey, false);
    }
  };

  const runManualAIAnalysis = async () => {
    if (activePanel && settings) {
      const promptToUseId = settings.manual_prompt_id || settings.selected_prompt_id || (prompts && prompts[0]?.id) || 'preset-copilot-quant-360';
      const customSettings = { ...settings, selected_prompt_id: promptToUseId };
      return await executeAiCycleForPanel(activePanel, customSettings, undefined, true);
    }
    return null;
  };

  const askCopilotChatMessage = async (question: string, chatHistory?: any[]) => {
    if (!activePanel || !settings) return null;
    const cache = panelDataCache.current[activePanel.id] || {};

    const apiKey =
      settings.ai_provider === 'groq' ? settings.groq_api_key :
        settings.ai_provider === 'gemini' ? settings.gemini_api_key :
          settings.openai_api_key;

    const model =
      settings.ai_provider === 'groq' ? settings.groq_model :
        settings.ai_provider === 'gemini' ? settings.gemini_model :
          settings.openai_model;

    const finalData = cache.marketData || {
      symbol: activePanel.symbol || activePanel.name || 'NASDAQ',
      price: String(activePanel.price || (candles && candles.length > 0 ? candles[candles.length - 1].close : 0)),
      zScore: 0,
      atrRatio: 1,
      sentiment: 50,
      delta: 0,
      deltaRatio: 1,
      printsPerSecond: 0,
      blockTrades: []
    };
    const finalForces = cache.forces || forces || [];
    const finalLevels = cache.gammaLevels || gammaLevels;
    // Somente anexar captura de tela se o usuário pedir expressamente análise visual/gráfico (poupa dezenas de milhares de tokens/minuto)
    const isVisualQuestion = /(?:gr[áa]fico|imagem|print|screenshot|candle|vela|padr[ãa]o visual|olh[ae]|veja a tela|analis[ae] visual)/i.test(question);
    const finalScreenshot = isVisualQuestion ? cache.screenshot : undefined;

    const levelsObj: { [key: string]: string } = formatGammaLevelsObject(finalLevels);

    const macroIndexes: { [key: string]: { buy: number; sell: number; description?: string } } = {};
    const stocksM7: { [key: string]: { buy: number; sell: number; description?: string } } = {};
    const macroKeys = ['sp500', 'sp 500', 'usdindex', 'usd index', 'dxy', 'vix', 'nasdaq', 'ndaq'];
    const m7Keys = ['nvidia', 'nvda', 'microsoft', 'msft', 'apple', 'aapl', 'meta', 'amazon', 'amzn', 'alphabet', 'googl', 'google', 'tesla', 'tsla'];
    const totalKeys = ['forca_final', 'força final', 'forca total', 'força total', 'forca', 'força'];

    finalForces.forEach((f: any) => {
      const sLower = f.symbol.toLowerCase();
      if (macroKeys.some(k => sLower.includes(k))) {
        macroIndexes[f.symbol] = { buy: f.buy, sell: f.sell, description: `${f.symbol}: Compra ${f.buy}% / Venda ${f.sell}%` };
      } else if (m7Keys.some(k => sLower.includes(k))) {
        stocksM7[f.symbol] = { buy: f.buy, sell: f.sell, description: `${f.symbol}: Compra ${f.buy}% / Venda ${f.sell}%` };
      } else if (totalKeys.some(k => sLower.includes(k))) {
        macroIndexes[f.symbol] = { buy: f.buy, sell: f.sell, description: `Força Média Geral: Compra ${f.buy}% / Venda ${f.sell}%` };
      }
    });

    const finalCandles = cache.candles || candles || [];
    const optData = optionsMarket || cache.optionsMarket;
    const priceActionCandles = extractPriceActionFromCandles(finalCandles);
    const activeChartIndicators = extractActiveIndicatorsFromStorage(activePanel, finalCandles, finalLevels, activeAccount?.id);
    const activeWidgetsData = extractActiveWidgetsFromStorage(activePanel, finalData, finalForces, finalLevels, optData, activeAccount?.id);
    const lastClosedTrade = extractLastClosedTradeReview(reportsRef.current, activePanel.id, activePanel.instance_id, activeAccount?.id);

    const currentTradeOp = (reportsRef.current || []).find(r => 
      r.status === 'Em Andamento' && 
      (r.panel_id === activePanel.id || r.instance_id === activePanel.instance_id) &&
      (!activeAccount || r.account_id === activeAccount.id)
    );

    const curPriceNum = parseNumericValue(finalData.price) || 0;
    const durationMins = currentTradeOp
      ? Math.max(0, Math.round((Date.now() - new Date(currentTradeOp.created_at).getTime()) / 60000))
      : 0;

    const currentPositionPayload = currentTradeOp ? {
      side: currentTradeOp.side || 'COMPRA',
      entryPrice: Number(currentTradeOp.entry_price || 0),
      currentProfit: (currentTradeOp.side === 'COMPRA' ? curPriceNum - Number(currentTradeOp.entry_price || 0) : Number(currentTradeOp.entry_price || 0) - curPriceNum),
      currentPrice: curPriceNum,
      stopLoss: Number(currentTradeOp.stop_loss || 0),
      takeProfit: Number(currentTradeOp.take_profit || 0),
      durationMinutes: durationMins,
      contracts: Number(currentTradeOp.contrato || 1)
    } : undefined;

    const formattedTrades = (finalData.blockTrades || []).map((t: any) =>
      `[${t.time || t.timestamp || '--'}] ${t.side || 'COMPRA'} ${t.volume || t.contracts || 0} cts @ ${Number(t.price || 0).toFixed(2)}`
    );

    // ========================================================================
    // REGRAS ESTRITAS DE CONTEXTO EXCLUSIVO:
    // - PAINEL 1: Cards Ativos do Dashboard & Indicadores Técnicos do Gráfico
    // - PAINEL 2: Indicadores Técnicos do Gráfico & Widgets Flutuantes Ativos
    // ========================================================================
    const isPanel1 = activePanel.id === panels[0]?.id || 
                     activePanel.instance_id === 'painel_principal' || 
                     panels.indexOf(activePanel) === 0;

    const panelModeLabel = isPanel1 
      ? 'Painel 1 (Cards Ativos & Indicadores do Gráfico)' 
      : `Painel ${panels.indexOf(activePanel) + 1 || 2} (Indicadores do Gráfico & Widgets Flutuantes)`;

    const activeCardNames: string[] = [];
    const pSymbol = activePanel.symbol || activePanel.name || 'NQ';
    const pKey = activePanel.id;

    let panelActiveWidgets: any[] = [];
    try {
      const savedSym = localStorage.getItem(`vortex_active_widgets_${pSymbol}`);
      const savedKey = localStorage.getItem(`vortex_active_widgets_${pKey}`);
      const savedGen = localStorage.getItem('vortex_workstation_widgets');
      const rawW = savedSym || savedKey || savedGen;
      if (rawW) panelActiveWidgets = JSON.parse(rawW);
    } catch {}

    const isWidgetActive = (type: string) => {
      // Verifica com rigor se o widget existe na lista de widgets do painel e está visível
      return panelActiveWidgets.some((w: any) => (w.type === type || w.id?.includes(type)) && w.visible !== false);
    };

    let coreAnalyticsPayload: any = undefined;
    let anchorsPayload: any = undefined;
    let flowExposurePayload: any = undefined;
    let stockReplacementPayload: any = undefined;

    if (optData) {
      if (isWidgetActive('grix_analytics')) {
        activeCardNames.push('Core Analytics');
        const a = optData.analytics || {};
        coreAnalyticsPayload = {
          analyticsQqqPct: Number(a.analytics_qqq_pct ?? 18.7),
          marketStructureQqqPct: Number(a.market_structure_qqq_pct ?? 53.8),
          marketStructureSpyPct: Number(a.market_structure_spy_pct ?? 22.6),
          aiStatus: a.ai_status || 'ACTIVE'
        };
      }

      if (isWidgetActive('grix_anchors')) {
        activeCardNames.push('Anchors');
        const an = optData.anchors || {};
        anchorsPayload = {
          spyPct: Number(an.spy_pct ?? 49.0),
          spySignal: (an.spy_signal || 'SELL').toUpperCase(),
          qqqPct: Number(an.qqq_pct ?? 33.0),
          qqqSignal: (an.qqq_signal || 'BUY').toUpperCase()
        };
      }

      if (isWidgetActive('grix_flow')) {
        activeCardNames.push('Flow & Exposure');
        const f = optData.flow_and_exposure || {};
        flowExposurePayload = {
          rhoIndexPct: Number(f.rho_index_pct ?? -17.6),
          tailRiskPct: Number(f.tail_risk_pct ?? 100.0),
          volatilitySmileQqqPct: Number(f.volatility_smile_qqq_pct ?? -100.0),
          volatilitySmileSpyPct: Number(f.volatility_smile_spy_pct ?? -100.0),
          netGammaPct: Number(f.net_gamma_pct ?? 22.4)
        };
      }

      if (isWidgetActive('grix_stock_replacement')) {
        activeCardNames.push('Stock Replacement');
        const s = optData.stock_replacement || {};
        stockReplacementPayload = {
          symbol: s.symbol || 'QQQ',
          callPct: Number(s.call_pct ?? 100.0),
          callSignal: (s.call_signal || 'BUY').toUpperCase(),
          putPct: Number(s.put_pct ?? 100.0),
          putSignal: (s.put_signal || 'SELL').toUpperCase()
        };
      }
    }

    const activeCardsPayload = {
      panelModeLabel,
      isPanel1,
      activeCardNames,
      coreAnalytics: coreAnalyticsPayload,
      anchors: anchorsPayload,
      flowAndExposure: flowExposurePayload,
      stockReplacement: stockReplacementPayload
    };

    const reqData: any = {
      provider: settings.ai_provider || 'groq',
      apiKey: apiKey || '',
      model: model || '',
      symbol: finalData.symbol,
      price: String(finalData.price),
      panelModeLabel,
      isPanel1,
      zScore: Number(finalData.zScore || 0),
      atrRatio: Number(finalData.atrRatio || 1),
      estado: (finalData as any).estado || 'NORMAL',
      sentiment: Number((finalData as any).sentiment || 50),
      macroSentiment: Number((finalData as any).macroSentiment !== undefined ? (finalData as any).macroSentiment : (finalData as any).sentiment || 50),
      microSentiment: Number((finalData as any).marketSentiment !== undefined ? (finalData as any).marketSentiment : ((finalData as any).microSentiment !== undefined ? (finalData as any).microSentiment : (finalData as any).sentiment || 50)),
      delta: Number(finalData.delta || 0),
      deltaRatio: Number(finalData.deltaRatio || 1),
      prints: Number((finalData as any).printsPerSecond || 0),
      forces: finalForces,
      macroIndexes,
      stocksM7,
      blockTrades: formattedTrades,
      priceActionCandles,
      activeChartIndicators,
      activeWidgetsData,
      activeCardsData: activeCardsPayload,
      lastClosedTrade,
      news: news.map(n => `[${n.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}] ${n.country} - ${n.title} (Impacto: ${n.impact})`),
      levels: levelsObj,
      screenshotBase64: finalScreenshot || undefined,
      currentPosition: currentPositionPayload
    };

    const result = await askCopilotChat(reqData, question, Boolean(aiEnabled), chatHistory);

    if (result && result.success && (result.spokenText || result.text) && settings.enable_tts && settings.resource_tts_enabled !== false) {
      const isCritical = result.action !== 'HOLD' || result.signal === 'COMPRA' || result.signal === 'VENDA' || result.signal === 'SAIR';
      speakText(result.spokenText || result.text, {
        enabled: settings.enable_tts,
        provider: settings.tts_provider,
        groqApiKey: settings.tts_groq_api_key || settings.groq_api_key,
        groqModel: settings.tts_groq_model,
        groqVoice: settings.tts_groq_voice,
        geminiApiKey: settings.tts_gemini_api_key || settings.gemini_api_key,
        geminiModel: settings.tts_gemini_model || 'gemini-3.8-flash-lite-tts',
        geminiVoice: settings.tts_gemini_voice || 'Puck',
        openaiApiKey: settings.tts_openai_api_key || settings.openai_api_key,
        openaiModel: settings.tts_openai_model || 'gpt-4o-mini-tts',
        openaiVoice: settings.tts_openai_voice,
        triggerMode: settings.tts_trigger_mode,
        cooldownSeconds: settings.tts_cooldown_seconds,
        volume: settings.tts_volume,
        isCritical
      }).catch(e => console.warn('[TTS Copilot Error]', e));
    }

    return result;
  };

  // 7b. Execução e Gestão Operacional de Ordens por Voz em Português (pt-BR)
  const executeVoiceTradeCommand = async (intent: any): Promise<{ success: boolean; message: string }> => {
    const targetPanel = activePanel || panels[0];
    const targetAcc = activeAccount || (accounts || []).find(a => a.is_active !== false);

    if (!targetPanel || !targetAcc) {
      const msg = 'Nenhum painel ou conta ativa selecionada para executar a ordem.';
      return { success: false, message: msg };
    }

    const curPriceNum = parseNumericValue(targetPanel?.price) || (candles && candles[candles.length - 1]?.close) || 0;
    const targetSettings = allSettings[targetPanel.id] || settings;
    const pointVal = Number(targetSettings.point_value_usd || 2.0);

    const speakVoiceResponse = (msgText: string) => {
      speakText(msgText, {
        enabled: settings.enable_tts,
        provider: settings.tts_provider,
        groqApiKey: settings.tts_groq_api_key || settings.groq_api_key,
        groqModel: settings.tts_groq_model,
        groqVoice: settings.tts_groq_voice,
        geminiApiKey: settings.tts_gemini_api_key || settings.gemini_api_key,
        geminiModel: settings.tts_gemini_model || 'gemini-3.8-flash-lite-tts',
        geminiVoice: settings.tts_gemini_voice || 'Puck',
        openaiApiKey: settings.tts_openai_api_key || settings.openai_api_key,
        openaiModel: settings.tts_openai_model || 'gpt-4o-mini-tts',
        openaiVoice: settings.tts_openai_voice,
        volume: settings.tts_volume,
        browserVoiceName: settings.tts_browser_voice_name,
        isCritical: true
      }).catch(() => {});
    };

    // 1. ZERAR / CANCELAR / FECHAR POSIÇÃO DA CONTA ATIVA SELECIONADA
    if (intent.type === 'CLOSE_POSITION') {
      const res = await cancelAllOpenOperationsAction(undefined, targetAcc?.id, curPriceNum);
      if (res && res.count > 0) {
        const msg = `${res.count} operação(ões) da conta '${targetAcc?.account_name || 'selecionada'}' encerrada(s) com sucesso a mercado.`;
        speakVoiceResponse(msg);
        return { success: true, message: msg };
      } else {
        const msg = `Nenhuma operação em andamento encontrada na conta '${targetAcc?.account_name || 'selecionada'}' para encerrar.`;
        speakVoiceResponse(msg);
        return { success: false, message: msg };
      }
    }

    // 2. BREAK-EVEN / PROTEGER OPERAÇÃO (STOP NA ENTRADA OU +X PONTOS)
    if (intent.type === 'BREAK_EVEN') {
      const openOp = (reportsRef.current || []).find(r => r.status === 'Em Andamento' && (!r.account_id || r.account_id === targetAcc.id));
      if (!openOp) {
        const msg = 'Nenhuma operação aberta encontrada para proteger no break-even.';
        speakVoiceResponse(msg);
        return { success: false, message: msg };
      }

      const entryNum = Number(openOp.entry_price || curPriceNum);
      const isBuy = openOp.side === 'COMPRA';
      const isProfitable = isBuy ? (curPriceNum > entryNum + 0.20) : (curPriceNum < entryNum - 0.20);
      if (!isProfitable && curPriceNum > 0 && entryNum > 0) {
        const msg = `O Break-Even não pode ser acionado: a operação precisa estar com lucro positivo para proteger na entrada.`;
        speakVoiceResponse(msg);
        return { success: false, message: msg };
      }

      const offset = Number(intent.protectOffsetPoints || 0);
      let newStop = entryNum;
      if (isBuy) {
        newStop = offset > 0 && curPriceNum >= (entryNum + offset + 0.5) ? (entryNum + offset) : entryNum;
        if (newStop >= curPriceNum - 0.10) newStop = entryNum;
      } else {
        newStop = offset > 0 && curPriceNum <= (entryNum - offset - 0.5) ? (entryNum - offset) : entryNum;
        if (newStop <= curPriceNum + 0.10) newStop = entryNum;
      }

      await updateReportLevelsAction(openOp.id, newStop, openOp.take_profit);

      const msg = offset > 0 
        ? `Operação protegida a +${offset} pontos da entrada com Stop Loss em ${newStop.toFixed(2)}.`
        : `Operação colocada no break-even (zero a zero) com Stop Loss em ${newStop.toFixed(2)}.`;
      speakVoiceResponse(msg);
      return { success: true, message: msg };
    }

    // 3. MOVER / AJUSTAR STOP LOSS DE POSIÇÃO ABERTA
    if (intent.type === 'MOVE_STOP') {
      const openOp = (reportsRef.current || []).find(r => r.status === 'Em Andamento' && (!r.account_id || r.account_id === targetAcc.id));
      if (!openOp) {
        const msg = 'Nenhuma operação aberta encontrada para mover o stop.';
        speakVoiceResponse(msg);
        return { success: false, message: msg };
      }

      let newStop = Number(openOp.stop_loss || openOp.entry_price || curPriceNum);

      if (intent.stopLevel) {
        newStop = Number(intent.stopLevel);
      } else if (intent.indicatorStopName) {
        // Fallback: resolver nível do indicador direto do gammaLevels global do contexto
        const indName = String(intent.indicatorStopName).toLowerCase();
        const gLevels: any = targetPanel.levels || targetPanel.gammaLevels || gammaLevels || {};
        if (indName.includes('gwall') && gLevels.gwall) newStop = Number(gLevels.gwall);
        else if (indName.includes('put0dte') && (gLevels.put0dte || gLevels.put)) newStop = Number(gLevels.put0dte || gLevels.put);
        else if (indName.includes('call0dte') && (gLevels.call0dte || gLevels.call)) newStop = Number(gLevels.call0dte || gLevels.call);
        else if (indName.includes('hvl') && (gLevels.hvl || gLevels.hvl0)) newStop = Number(gLevels.hvl || gLevels.hvl0);
        else if (indName.includes('gex') && Array.isArray(gLevels.gex)) {
          const idxMatch = indName.match(/\d+/);
          const idx = idxMatch ? parseInt(idxMatch[0], 10) - 1 : 0;
          if (gLevels.gex[idx] !== undefined) newStop = Number(gLevels.gex[idx]);
        } else if (indName.includes('bl') && Array.isArray(gLevels.bl)) {
          const idxMatch = indName.match(/\d+/);
          const idx = idxMatch ? parseInt(idxMatch[0], 10) - 1 : 0;
          if (gLevels.bl[idx] !== undefined) newStop = Number(gLevels.bl[idx]);
        }
      } else if (intent.stopCandleReference) {
        const panelCandles = targetPanel.candles || candles || [];
        const curC = panelCandles[panelCandles.length - 1];
        const priorC = panelCandles[panelCandles.length - 2];
        if (intent.stopCandleReference === 'current_candle_low' && curC) newStop = curC.low;
        else if (intent.stopCandleReference === 'current_candle_high' && curC) newStop = curC.high;
        else if (intent.stopCandleReference === 'prior_candle_low' && priorC) newStop = priorC.low;
        else if (intent.stopCandleReference === 'prior_candle_high' && priorC) newStop = priorC.high;
      } else if (intent.deltaPoints) {
        const delta = Number(intent.deltaPoints);
        newStop = intent.direction === 'up' ? (newStop + delta) : (newStop - delta);
      }

      await updateReportLevelsAction(openOp.id, newStop, openOp.take_profit);

      const refLabel = intent.indicatorStopName ? ` (${intent.indicatorStopName})` : '';
      const msg = `Stop Loss ajustado com sucesso para ${newStop.toFixed(2)}${refLabel}.`;
      speakVoiceResponse(msg);
      return { success: true, message: msg };
    }

    // 3b. MOVER / AJUSTAR TAKE PROFIT (ALVO) DE POSIÇÃO ABERTA
    if (intent.type === 'UPDATE_TAKE') {
      const openOp = (reportsRef.current || []).find(r => r.status === 'Em Andamento' && (!r.account_id || r.account_id === targetAcc.id));
      if (!openOp) {
        const msg = 'Nenhuma operação aberta encontrada para alterar o alvo.';
        speakVoiceResponse(msg);
        return { success: false, message: msg };
      }

      let newTake = Number(openOp.take_profit || openOp.entry_price || curPriceNum);

      if (intent.takeLevel) {
        newTake = Number(intent.takeLevel);
      } else if (intent.indicatorTakeName) {
        // Fallback: resolver nível do indicador direto do gammaLevels global do contexto
        const indName = String(intent.indicatorTakeName).toLowerCase();
        const gLevels: any = targetPanel.levels || targetPanel.gammaLevels || gammaLevels || {};
        if (indName.includes('gwall') && gLevels.gwall) newTake = Number(gLevels.gwall);
        else if (indName.includes('put0dte') && (gLevels.put0dte || gLevels.put)) newTake = Number(gLevels.put0dte || gLevels.put);
        else if (indName.includes('call0dte') && (gLevels.call0dte || gLevels.call)) newTake = Number(gLevels.call0dte || gLevels.call);
        else if (indName.includes('hvl') && (gLevels.hvl || gLevels.hvl0)) newTake = Number(gLevels.hvl || gLevels.hvl0);
        else if (indName.includes('gex') && Array.isArray(gLevels.gex)) {
          const idxMatch = indName.match(/\d+/);
          const idx = idxMatch ? parseInt(idxMatch[0], 10) - 1 : 0;
          if (gLevels.gex[idx] !== undefined) newTake = Number(gLevels.gex[idx]);
        } else if (indName.includes('bl') && Array.isArray(gLevels.bl)) {
          const idxMatch = indName.match(/\d+/);
          const idx = idxMatch ? parseInt(idxMatch[0], 10) - 1 : 0;
          if (gLevels.bl[idx] !== undefined) newTake = Number(gLevels.bl[idx]);
        }
      } else if (intent.takePoints) {
        const entryNum = Number(openOp.entry_price || curPriceNum);
        newTake = openOp.side === 'COMPRA' ? (entryNum + intent.takePoints) : (entryNum - intent.takePoints);
      }

      await updateReportLevelsAction(openOp.id, openOp.stop_loss, newTake);

      const refLabel = intent.indicatorTakeName ? ` (${intent.indicatorTakeName})` : '';
      const msg = `Take Profit ajustado com sucesso para ${newTake.toFixed(2)}${refLabel}.`;
      speakVoiceResponse(msg);
      return { success: true, message: msg };
    }

    // 4. ORDEM INCOMPLETA (SEM STOP OU SEM TAKE) -> BLOQUEAR E PERGUNTAR
    if (intent.type === 'INCOMPLETE_ORDER') {
      const msg = intent.promptFeedback || 'Para abrir a ordem é necessário definir Stop Loss e Take Profit.';
      speakVoiceResponse(msg);
      return { success: false, message: msg };
    }

    // 5. ABRIR POSIÇÃO (COMPRA / VENDA)
    if (intent.type === 'OPEN_POSITION' && intent.side) {
      if (curPriceNum <= 0) {
        return { success: false, message: 'Preço de mercado indisponível no momento.' };
      }

      // Verificar se já tem posição aberta na conta
      const existingOp = (reportsRef.current || []).find(r => r.status === 'Em Andamento' && r.account_id === targetAcc.id && (r.panel_id === targetPanel.id || r.instance_id === targetPanel.instance_id));
      if (existingOp) {
        const msg = `Já existe uma operação em andamento na conta ${targetAcc.account_name}.`;
        speakVoiceResponse(msg);
        return { success: false, message: msg };
      }

      let finalStop: number | null = null;
      let finalTake: number | null = null;
      let finalContracts = Number(intent.contracts || 1);

      // Calcular Stop
      if (intent.stopLevel) {
        finalStop = intent.stopLevel;
      } else if (intent.stopCandleReference) {
        const panelCandles = targetPanel.candles || candles || [];
        const curC = panelCandles[panelCandles.length - 1];
        const priorC = panelCandles[panelCandles.length - 2];
        if (intent.stopCandleReference === 'current_candle_low' && curC) finalStop = curC.low;
        else if (intent.stopCandleReference === 'current_candle_high' && curC) finalStop = curC.high;
        else if (intent.stopCandleReference === 'prior_candle_low' && priorC) finalStop = priorC.low;
        else if (intent.stopCandleReference === 'prior_candle_high' && priorC) finalStop = priorC.high;
      } else if (intent.stopPoints) {
        finalStop = intent.side === 'COMPRA' ? (curPriceNum - intent.stopPoints) : (curPriceNum + intent.stopPoints);
      }

      // Calcular Take
      if (intent.takeLevel) {
        finalTake = intent.takeLevel;
      } else if (intent.takePoints) {
        finalTake = intent.side === 'COMPRA' ? (curPriceNum + intent.takePoints) : (curPriceNum - intent.takePoints);
      } else if (finalStop && intent.riskRewardMultiplier) {
        const dist = Math.abs(curPriceNum - finalStop);
        finalTake = intent.side === 'COMPRA' ? (curPriceNum + dist * intent.riskRewardMultiplier) : (curPriceNum - dist * intent.riskRewardMultiplier);
      } else if (intent.stopPoints && intent.riskRewardMultiplier) {
        const dist = intent.stopPoints * intent.riskRewardMultiplier;
        finalTake = intent.side === 'COMPRA' ? (curPriceNum + dist) : (curPriceNum - dist);
      }

      // Garantia Inviolável de Proteção: Fallback de Stop e Take se não vierem especificados
      const defaultStopPts = Number(targetSettings?.default_stop_loss_points || targetSettings?.stop_loss_pts || 40);
      const defaultTakePts = Number(targetSettings?.default_take_profit_points || targetSettings?.take_profit_pts || (defaultStopPts * 2));

      if (!finalStop && curPriceNum > 0) {
        finalStop = intent.side === 'COMPRA' ? (curPriceNum - defaultStopPts) : (curPriceNum + defaultStopPts);
      }

      if (!finalTake && curPriceNum > 0) {
        const takeDist = finalStop ? Math.abs(curPriceNum - finalStop) * (intent.riskRewardMultiplier || 2.0) : defaultTakePts;
        finalTake = intent.side === 'COMPRA' ? (curPriceNum + takeDist) : (curPriceNum - takeDist);
      }

      // Calcular contratos por risco em dólares ($)
      if (intent.riskUsd && finalStop) {
        const dist = Math.abs(curPriceNum - finalStop);
        if (dist > 0) {
          finalContracts = Math.max(1, Math.floor(intent.riskUsd / (dist * pointVal)));
        }
      }

      const stopLabel = intent.indicatorStopName ? `Stop (${intent.indicatorStopName}): ${finalStop ? finalStop.toFixed(2) : '--'}` : `Stop: ${finalStop ? finalStop.toFixed(2) : '--'}`;
      const takeLabel = intent.indicatorTakeName ? `Take (${intent.indicatorTakeName}): ${finalTake ? finalTake.toFixed(2) : '--'}` : `Take: ${finalTake ? finalTake.toFixed(2) : '--'}`;

      const newReport = await insertStrategyReportSupabase({
        strategy_id: null,
        strategy_name: 'Comando de Voz Axion',
        instance_id: targetPanel.instance_id,
        side: intent.side,
        entry_price: curPriceNum,
        stop_loss: finalStop,
        take_profit: finalTake,
        exit_price: null,
        status: 'Em Andamento',
        description: `[Voz] ${intent.side} ${finalContracts}x @ ${curPriceNum.toFixed(2)} (${stopLabel} | ${takeLabel})`,
        panel_id: targetPanel.id,
        contrato: finalContracts,
        account_id: targetAcc.id,
        symbol: targetPanel.name || 'NQ'
      });

      if (newReport) {
        reportsRef.current = [newReport, ...reportsRef.current.filter(r => r.id !== newReport.id)];
        setReports(prev => [newReport, ...prev.filter(r => r.id !== newReport.id)]);
        await fetchReportsList();

        const stopMsg = finalStop 
          ? (intent.indicatorStopName ? `Stop no ${intent.indicatorStopName} em ${finalStop.toFixed(2)}` : `Stop em ${finalStop.toFixed(2)}`)
          : 'sem stop';
        const takeMsg = finalTake 
          ? (intent.indicatorTakeName ? `Alvo no ${intent.indicatorTakeName} em ${finalTake.toFixed(2)}` : `Alvo em ${finalTake.toFixed(2)}`)
          : '';
        const msg = `Ordem de ${intent.side} de ${finalContracts} contrato(s) executada em ${curPriceNum.toFixed(2)}. ${stopMsg}. ${takeMsg}.`;
        speakVoiceResponse(msg);
        return { success: true, message: msg };
      }
    }

    return { success: false, message: 'Comando não reconhecido ou parâmetros inválidos.' };
  };

  // 7c. Lógica do Ciclo do Prompt Geral (Omni-Engine)
  const executeGeneralPromptCycleForPanel = async (targetPanel: any, targetSettings: any) => {
    if (isRestrictedSession) return;

    // Resolve if there is a specific target panel enabled for prompt geral in any panel settings
    let targetPanelId = '';
    const userPanels = panels || [];
    for (const p of userPanels) {
      const s = allSettings[p.id];
      if (s && s.general_prompt_enabled && s.general_prompt_panel_id) {
        targetPanelId = s.general_prompt_panel_id;
        break;
      }
    }

    if (targetPanelId && targetPanel.id !== targetPanelId) {
      console.log(`[PROMPT GERAL] [${targetPanel.name}] Ignorando execução pois o painel alvo ativo no sistema é ${targetPanelId}`);
      return;
    }

    // Verificações de Horário e Dias de Funcionamento
    const startTimeStr = targetSettings.general_prompt_start_time || '09:00';
    const endTimeStr = targetSettings.general_prompt_end_time || '18:00';

    const now = new Date();

    // Filtro de dias da semana (Todos os dias vs Segunda a Sexta)
    const gpDays = targetSettings.general_prompt_days || 'all';
    if (gpDays === 'mon_fri') {
      const dayOfWeek = now.getDay(); // 0 = Domingo, 6 = Sábado
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        console.log(`[PROMPT GERAL] [${targetPanel.name}] Ignorando execução de fim de semana (Configurado para Segunda a Sexta).`);
        return;
      }
    }

    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentMinutesSinceMidnight = currentHour * 60 + currentMin;

    const [startH, startM] = startTimeStr.split(':').map(Number);
    const startMinutes = (startH || 0) * 60 + (startM || 0);

    const [endH, endM] = endTimeStr.split(':').map(Number);
    const endMinutes = (endH || 0) * 60 + (endM || 0);

    let isWithinTimeWindow = false;
    if (startMinutes <= endMinutes) {
      isWithinTimeWindow = currentMinutesSinceMidnight >= startMinutes && currentMinutesSinceMidnight <= endMinutes;
    } else {
      // Overnight window (ex: 19:00 - 18:00 or 22:00 - 05:00)
      isWithinTimeWindow = currentMinutesSinceMidnight >= startMinutes || currentMinutesSinceMidnight <= endMinutes;
    }

    if (!isWithinTimeWindow) {
      console.log(`[PROMPT GERAL] [${targetPanel.name}] Fora do horário configurado (${startTimeStr} - ${endTimeStr}). Ignorando.`);
      return;
    }

    // Controle de Intervalo Permanente (Evita reiniciar timer por mudanças do react useEffect)
    const lastRun = lastGeneralPromptExecution.current.get(targetPanel.id) || 0;
    const freqMinutes = targetSettings.general_prompt_frequency || 15;
    const gpInterval = freqMinutes * 60 * 1000;
    const elapsed = Date.now() - lastRun;

    if (lastRun > 0 && elapsed < (gpInterval - 10000)) {
      console.log(`[PROMPT GERAL] [${targetPanel.name}] Ainda não completou o intervalo de ${freqMinutes} min (decorrido: ${Math.round(elapsed / 1000)}s / necessário: ${freqMinutes * 60}s). Ignorando.`);
      return;
    }

    if (generalPromptAnalyzingRef.current.get(targetPanel.id)) {
      console.log(`[PROMPT GERAL] [${targetPanel.name}] Análise já em andamento. Ignorando.`);
      return;
    }

    const cache = panelDataCache.current[targetPanel.id];
    if (!cache || !cache.marketData) {
      console.warn(`[PROMPT GERAL] [${targetPanel.name}] Dados de mercado ausentes para análise de Prompt Geral.`);
      return;
    }

    const finalData = cache.marketData;
    const finalForces = cache.forces;
    const finalLevels = cache.gammaLevels;
    const finalScreenshot = cache.screenshot;

    generalPromptAnalyzingRef.current.set(targetPanel.id, true);
    lastGeneralPromptExecution.current.set(targetPanel.id, Date.now());
    addLog('IA', `[${targetPanel.name}] Iniciando análise do Prompt Geral (Omni-Engine)...`, 'ia');

    try {
      const apiKey =
        targetSettings.ai_provider === 'groq' ? targetSettings.groq_api_key :
          targetSettings.ai_provider === 'gemini' ? targetSettings.gemini_api_key :
            targetSettings.openai_api_key;

      const model =
        targetSettings.ai_provider === 'groq' ? targetSettings.groq_model :
          targetSettings.ai_provider === 'gemini' ? targetSettings.gemini_model :
            targetSettings.openai_model;

      const levelsObj: { [key: string]: string } = formatGammaLevelsObject(finalLevels);

      const formattedTrades = finalData.blockTrades ? finalData.blockTrades.map((t: any) =>
        `[${t.time}] ${t.side} | Vol: ${t.volume} @ Price: ${t.price}`
      ) : [];

      const aiReqData = {
        provider: targetSettings.ai_provider,
        apiKey: apiKey || '',
        model: model || '',
        symbol: finalData.symbol,
        price: finalData.price,
        zScore: finalData.zScore,
        atrRatio: finalData.atrRatio,
        sentiment: Number((finalData as any).sentiment || 50),
        macroSentiment: Number((finalData as any).macroSentiment !== undefined ? (finalData as any).macroSentiment : (finalData as any).sentiment || 50),
        microSentiment: Number((finalData as any).marketSentiment !== undefined ? (finalData as any).marketSentiment : ((finalData as any).microSentiment !== undefined ? (finalData as any).microSentiment : (finalData as any).sentiment || 50)),
        estado: (finalData as any).estado || 'NORMAL',
        delta: finalData.delta,
        deltaRatio: finalData.deltaRatio,
        prints: finalData.printsPerSecond,
        forces: finalForces || [],
        blockTrades: formattedTrades,
        news: news ? news.map(n => `[${n.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}] ${n.country} - ${n.title} (Impacto: ${n.impact})`) : [],
        levels: levelsObj,
        screenshotBase64: finalScreenshot || undefined,
        promptTemplate: targetSettings.general_prompt_template,
        gammaBias: finalLevels ? {
          buyStrength: finalLevels.buy_strength,
          sellStrength: finalLevels.sell_strength,
          gammaBias: finalLevels.gamma_bias,
          biasScore: finalLevels.bias_score,
          nearestResistance: finalLevels.nearest_resistance,
          nearestSupport: finalLevels.nearest_support,
          distanceToResistance: finalLevels.distance_to_resistance,
          distanceToSupport: finalLevels.distance_to_support,
          confluenceType: finalLevels.confluence_type,
          recommendedStrategy: finalLevels.recommended_strategy,
          voidGammaAbove: finalLevels.void_gamma_above,
          voidGammaBelow: finalLevels.void_gamma_below,
          biasTimestamp: finalLevels.bias_timestamp
        } : undefined
      };

      const res = await runGeneralAnalysis(aiReqData);

      if (res.success) {
        // Filtrar duplicados: Decidir se deve salvar e notificar
        let shouldSave = true;
        const lastAnalysisForPanel = generalAnalyses.find(a => a.panel_id === targetPanel.id);

        if (lastAnalysisForPanel) {
          const isSameDirection = lastAnalysisForPanel.direction === (res.setup_direction || 'AGUARDAR');
          const isSameTrigger = lastAnalysisForPanel.entry_point === (res.setup_trigger || '--');
          const isSameStop = lastAnalysisForPanel.stop_loss === (res.setup_stop || '--');
          const isSameTake = lastAnalysisForPanel.take_profit === `${res.setup_target_1 || '--'} / ${res.setup_target_2 || '--'}`;

          if (isSameDirection && isSameTrigger && isSameStop && isSameTake) {
            if (res.setup_direction === 'AGUARDAR') {
              shouldSave = false;
            } else {
              // Setup ativo (COMPRAR/VENDA): Salvar somente se o último foi há mais de 1 hora
              const lastTime = new Date(lastAnalysisForPanel.created_at || 0).getTime();
              const elapsedSinceLastSave = Date.now() - lastTime;
              if (elapsedSinceLastSave < 60 * 60 * 1000) {
                shouldSave = false;
              }
            }
          }
        }

        if (shouldSave) {
          addLog('IA', `[${targetPanel.name}] Projeção VM Mentor atualizada. Registrando nova análise: ${res.setup_direction}`, 'ia');

          await insertGeneralAnalysisSupabase({
            panel_id: targetPanel.id,
            instance_id: targetPanel.instance_id,
            direction: res.setup_direction || 'AGUARDAR',
            entry_point: res.setup_trigger || '--',
            stop_loss: res.setup_stop || '--',
            take_profit: `${res.setup_target_1 || '--'} / ${res.setup_target_2 || '--'}`,
            market_analysis: res.macro_sentiment || 'Sem análise macro estruturada.',
            full_json: res
          });

          await fetchGeneralAnalysesList();

          if (targetSettings.general_prompt_telegram_enabled !== false && targetSettings.telegram_enabled && targetSettings.telegram_bot_token && targetSettings.telegram_chat_id) {
            sendGeneralAnalysisTelegramNotification(res, targetSettings, targetPanel.name, finalScreenshot);
          }
        } else {
          addLog('IA', `[${targetPanel.name}] Análise VM Mentor processada (sem alterações no setup: ${res.setup_direction}). Pulando salvamento/Telegram.`, 'ia');
        }
      } else {
        console.error(`[PROMPT GERAL] Erro no retorno da IA:`, res.error);
        addLog('ERRO', `Erro no processamento do Prompt Geral: ${res.error || 'Erro desconhecido'}`, 'erro');
      }
    } catch (err: any) {
      console.error(`[PROMPT GERAL] Erro no ciclo para o painel ${targetPanel.name}:`, err);
      addLog('ERRO', `Erro no ciclo do Prompt Geral [${targetPanel.name}]: ${err.message || err}`, 'erro');
    } finally {
      generalPromptAnalyzingRef.current.set(targetPanel.id, false);
    }
  };

  const sendGeneralAnalysisTelegramNotification = async (res: AIGeneralAnalysisResponse, setts: any, assetName = '', customScreenshot?: string | null, targetPanelParam?: any) => {
    try {
      const botToken = setts.telegram_bot_token;
      const chatId = setts.telegram_chat_id;

      let text = `🧠 *Axion TradeStation [${assetName}] - Análise Geral*\n\n`;
      text += `🎯 *Direção:* ${res.setup_direction}\n`;
      text += `📊 *Z-Score:* ${res.z_score}\n`;
      text += `⚡ *Estratégia:* ${res.setup_strategy}\n`;
      text += `🚪 *Gatilho:* ${res.setup_trigger}\n`;
      text += `🟢 *Alvo 1:* ${res.setup_target_1}\n`;
      text += `🟢 *Alvo 2:* ${res.setup_target_2}\n`;
      text += `🛑 *Stop:* ${res.setup_stop}\n\n`;
      text += `📝 *Sentimento Macro:* ${res.macro_sentiment}\n`;
      text += `📈 *Regime de Opções:* ${res.options_regime}\n`;
      text += `🧱 *Paredes Ativas:* ${res.active_walls}\n`;
      text += `🧲 *Alvo Magnético:* ${res.magnetic_target}\n`;
      text += `💧 *Pressão do Fluxo:* ${res.flow_pressure}\n`;
      text += `⚠️ *Alertas:* ${res.alerts}\n`;

      const urlText = `https://api.telegram.org/bot${botToken}/sendMessage`;
      await fetch(urlText, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown'
        })
      });

      if (setts.general_prompt_telegram_send_image !== false) {
        let finalImg = customScreenshot || undefined;
        if (!finalImg) {
          const panelForScreen = targetPanelParam || panels.find(p => p.name === assetName || p.id === assetName) || activePanel;
          finalImg = (await getFreshScreenshotForPanel(panelForScreen, setts)) || undefined;
        }

        if (finalImg) {
          const urlPhoto = `https://api.telegram.org/bot${botToken}/sendPhoto`;
          const byteCharacters = atob(finalImg);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'image/png' });

          const formData = new FormData();
          formData.append('chat_id', chatId);
          formData.append('photo', blob, 'chart.png');
          formData.append('caption', `Gráfico do ativo ${assetName} (Axion TradeStation).`);

          await fetch(urlPhoto, {
            method: 'POST',
            body: formData
          });
        }
      }
    } catch (err) {
      console.error('[TELEGRAM GERAL] Erro ao notificar:', err);
    }
  };

  // Enviar Sinal ao Telegram
  const sendTelegramNotification = async (res: AIResponse, setts: any, assetName = '', customScreenshot?: string | null, targetPanelParam?: any) => {
    try {
      const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
      if (!isSystemAdmin && !userPermissions.allow_operations) {
        console.warn('[TELEGRAM] Envio de operações bloqueado por falta de permissão.');
        return;
      }

      const botToken = setts.telegram_bot_token;
      const chatId = setts.telegram_chat_id;

      // Decidir se envia o sinal baseado na configuração
      if (setts.telegram_only_signals) {
        if (res.sinal !== 'COMPRA' && res.sinal !== 'VENDA') {
          return;
        }
      } else if (!setts.telegram_send_signal) {
        return;
      }

      let text = `🤖 *Axion TradeStation [${assetName}] - Alerta de Operação*\n\n`;
      text += `🎯 *Sinal:* ${res.sinal}\n`;
      text += `📊 *Confiança:* ${res.confianca}\n`;
      text += `🟢 *Alvo:* ${res.alvo}\n`;
      text += `🛑 *Stop:* ${res.stop}\n\n`;
      text += `📝 *Resumo:* ${res.resumo}\n`;
      if (res.gatilho && res.gatilho !== '--') text += `⚡ *Gatilho:* ${res.gatilho}\n`;
      if (res.alerta && res.alerta !== '--') text += `⚠️ *Alerta:* ${res.alerta}\n`;

      // Enviar mensagem simples
      const urlText = `https://api.telegram.org/bot${botToken}/sendMessage`;
      await fetch(urlText, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown'
        })
      });

      // Se configurado para enviar a imagem do gráfico junto
      if (setts.telegram_send_image !== false) {
        let finalImg = customScreenshot;
        if (!finalImg) {
          const panelForScreen = targetPanelParam || panels.find(p => p.name === assetName || p.id === assetName) || activePanel;
          finalImg = (await getFreshScreenshotForPanel(panelForScreen, setts)) || undefined;
        }

        if (finalImg) {
          const urlPhoto = `https://api.telegram.org/bot${botToken}/sendPhoto`;
          const byteCharacters = atob(finalImg);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'image/png' });

          const formData = new FormData();
          formData.append('chat_id', chatId);
          formData.append('photo', blob, 'chart.png');
          formData.append('caption', `Gráfico do ativo ${assetName} analisado pela IA.`);

          await fetch(urlPhoto, {
            method: 'POST',
            body: formData
          });
        }
      }
    } catch (err) {
      console.error('[TELEGRAM] Erro ao notificar:', err);
    }
  };

  // Loop de Execução Automática da IA (Copilot)
  const setAiEnabled = (enabled: boolean) => {
    aiEnabledRef.current = enabled;
    setAiEnabledState(enabled);
    if (activePanel) {
      saveSettings({ vortex_ai_enabled: enabled });
    }
    const curAcc = activeAccountRef.current || activeAccount;
    const curPanel = activePanelRef.current || activePanel;
    if (enabled) {
      addLog('IA', `Modo Automático de IA (Copilot) ATIVADO [Conta: '${curAcc?.account_name || 'Sem Conta'}' | Ativo: '${curPanel?.name || '--'}'].`, 'ia');
    } else {
      addLog('IA', `Modo Automático de IA (Copilot) DESATIVADO [Conta: '${curAcc?.account_name || 'Sem Conta'}' | Ativo: '${curPanel?.name || '--'}'].`, 'ia');
    }
  };

  // Alternar Força clicável
  const toggleForceConfig = (id: string) => {
    if (id === 'forca_final') return; // FORÇA FINAL sempre fica ativa e não pode ser alternada

    const next = forcesConfig.map(f => (f.id === id ? { ...f, ativo: !f.ativo } : f));
    setForcesConfig(next);
    forcesConfigRef.current = next;

    if (activePanel) {
      localStorage.setItem(`vortex_forces_config_${activePanel.id}`, JSON.stringify(next));
    }

    if (marketDataRef.current) {
      const recalculated = recalculateSentimentAndDelta(
        marketDataRef.current,
        forcesRef.current,
        next,
        windowMinutes,
        windowBaseline
      );
      setMarketData(recalculated);
    }

    if (activePanel) {
      const activeIds = next.filter(f => f.ativo).map(f => f.id);
      saveSettings({ forces_active_symbols: activeIds });
    }

    addLog('SISTEMA', `Filtro de força Momentum atualizado para ${id}.`, 'sistema');
  };

  const testTelegramMessage = async (customText?: string): Promise<boolean> => {
    if (!settings || !settings.telegram_bot_token || !settings.telegram_chat_id) {
      addLog('ERRO', 'Telegram não configurado para envio de teste.', 'erro');
      return false;
    }
    try {
      const botToken = settings.telegram_bot_token;
      const chatId = settings.telegram_chat_id;
      const text = customText || `🤖 *Axion TradeStation - MENSAGEM DE TESTE*\n\nSeu bot do Telegram foi conectado e configurado com sucesso! ✅`;
      const urlText = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(urlText, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown'
        })
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      addLog('SISTEMA', 'Mensagem de teste enviada com sucesso para o Telegram.', 'sistema');
      return true;
    } catch (err: any) {
      console.error('[TELEGRAM] Erro ao enviar mensagem de teste:', err);
      addLog('ERRO', `Erro ao enviar mensagem de teste: ${err.message}`, 'erro');
      return false;
    }
  };

  // 6. Sincronização Dinâmica dos Loops de Todos os Painéis (Concorrente em Background)
  useEffect(() => {
    if (!isAuthenticated) {
      // Limpar todos os loops ao deslogar
      runningLoops.current.forEach((timers) => {
        clearInterval(timers.marketTimer);
        if (timers.aiTimer) clearInterval(timers.aiTimer);
        if (timers.generalPromptTimer) clearInterval(timers.generalPromptTimer);
      });
      runningLoops.current.clear();
      return;
    }

    const activeIds = new Set(panels.map(p => p.id));

    // 1. Encerrar loops de painéis removidos
    runningLoops.current.forEach((timers, panelId) => {
      if (!activeIds.has(panelId)) {
        clearWorkerTimer(timers.marketTimer);
        if (timers.aiTimer) clearWorkerTimer(timers.aiTimer);
        if (timers.generalPromptTimer) clearWorkerTimer(timers.generalPromptTimer);
        runningLoops.current.delete(panelId);
      }
    });

    // 2. Criar ou atualizar loops para painéis ativos
    panels.forEach((panel) => {
      const panelId = panel.id;
      const panelSettings = allSettings[panelId];
      if (!panelSettings) return;

      const isCurrentActive = activePanel?.id === panelId;
      const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
      const adminSet = !isSystemAdmin ? getAdminSetForPanel(panel) : null;
      // Regra 2b e 2c: O Copilot só está habilitado se o ciclo geral (aiEnabled) estiver ativo E este for o gráfico ativo E a conta estiver ativa
      const panelAiEnabled = Boolean(isCurrentActive && aiEnabled && activeAccount && activeAccount.is_active !== false);
      const panelGeneralPromptEnabled = isSystemAdmin && panelSettings.general_prompt_enabled === true;

      // Se o painel for inativo E (background panels desativado OU sem Prompt geral / operações abertas / robôs diretos ativos / Prompts Geradores de Sinais vinculados), não precisamos rodar loop em background!
      // O Copilot de tela (panelAiEnabled) NUNCA roda em painéis de segundo plano (!isCurrentActive), mas Algoritmos Ativos nas Contas e Prompts Geradores de Sinais RODAM em segundo plano!
      const bgPanelsAllowed = panelSettings.resource_bg_panels_enabled !== false;
      const hasOpenOpsForBgPanel = (reportsRef.current || []).some(r => r.status === 'Em Andamento' && (r.panel_id === panelId || r.instance_id === panel.instance_id));

      const allKnownBgStrats = [
        ...(customStrategiesRef.current || customStrategies || []),
        ...(publicStrategiesRef.current || publicStrategies || [])
      ];
      const currentBgRoutes = (accountStrategiesRef.current && accountStrategiesRef.current.length > 0)
        ? accountStrategiesRef.current
        : (accountStrategies || []);
      const currentBgAccounts = (accountsRef.current && accountsRef.current.length > 0)
        ? accountsRef.current
        : (accounts || []);
      const currentBgPrompts = (promptsRef.current && promptsRef.current.length > 0)
        ? promptsRef.current
        : (prompts || []);

      const matchesBgPanel = (strat: any): boolean => {
        if (!strat) return false;
        const stratTarget = (strat.panel_id && strat.panel_id !== 'all')
          ? strat.panel_id
          : (strat.risk_settings?.target_panel_id || null);
        if (!stratTarget || stratTarget === 'all') return true;
        if (stratTarget === panelId || stratTarget === panel.instance_id) return true;
        const norm = (v: string) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const sNorm = norm(stratTarget);
        return Boolean(sNorm && (sNorm === norm(panel.name) || sNorm === norm(panel.instance_id) || sNorm === norm(panel.gamma_symbol)));
      };

      const hasDirectActiveAlgoForBgPanel = allKnownBgStrats.some(s =>
        s &&
        s.active !== false &&
        matchesBgPanel(s) &&
        currentBgRoutes.some((r: AccountStrategy) =>
          r.manual_strategy_id === s.id &&
          r.is_enabled !== false &&
          currentBgAccounts.some(a => a.id === r.account_id && a.is_active !== false)
        )
      );

      const hasSignalGeneratorPromptForBgPanel = currentBgPrompts.some(p => {
        if (!p || p.prompt_type !== 'signal_generator' || !p.trigger_strategy_id) return false;
        const hasActiveRoute = currentBgRoutes.some((r: AccountStrategy) =>
          r.prompt_id === p.id &&
          r.is_enabled !== false &&
          currentBgAccounts.some(a => a.id === r.account_id && a.is_active !== false)
        );
        if (!hasActiveRoute) return false;
        const trigStrat = allKnownBgStrats.find(s => s && (s.id === p.trigger_strategy_id || s.name?.trim().toLowerCase() === p.trigger_strategy_id?.trim().toLowerCase()));
        return trigStrat ? matchesBgPanel(trigStrat) : true;
      });

      const isVisuallyDisplayed = isCurrentActive || visibleMultiPanelIds.includes(panelId);

      if (!isVisuallyDisplayed && (!bgPanelsAllowed || (!panelGeneralPromptEnabled && !hasOpenOpsForBgPanel && !hasDirectActiveAlgoForBgPanel && !hasSignalGeneratorPromptForBgPanel))) {
        const existing = runningLoops.current.get(panelId);
        if (existing) {
          clearWorkerTimer(existing.marketTimer);
          if (existing.aiTimer) clearWorkerTimer(existing.aiTimer);
          if (existing.generalPromptTimer) clearWorkerTimer(existing.generalPromptTimer);
          if (existing.opsTimer) clearWorkerTimer(existing.opsTimer);
          runningLoops.current.delete(panelId);
        }
        return;
      }

      // Loop ativo ou exibido no Multi-Gráfico roda na velocidade máxima configurada (tick-a-tick); inativos rodam a cada 5 segundos
      const activeInterval = panelSettings.market_update_interval !== undefined
        ? Number(panelSettings.market_update_interval)
        : (adminSet?.market_update_interval !== undefined ? Number(adminSet.market_update_interval) : globalMarketInterval);
      const marketInterval = isVisuallyDisplayed ? activeInterval : 5000;

      const existing = runningLoops.current.get(panelId);

      // Limpar timers anteriores para recriar com novos parâmetros
      if (existing) {
        clearWorkerTimer(existing.marketTimer);
        if (existing.aiTimer) clearWorkerTimer(existing.aiTimer);
        if (existing.generalPromptTimer) clearWorkerTimer(existing.generalPromptTimer);
        if (existing.opsTimer) clearWorkerTimer(existing.opsTimer);
      }

      // Ativar ou desativar Web Audio keep-alive conforme configuração de Recursos
      if (panelSettings.resource_audio_keepalive_enabled !== false) {
        enableBackgroundAudioKeepAlive();
      } else {
        disableBackgroundAudioKeepAlive();
      }

      // Ciclo de Mercado (Worker em background sem throttling)
      let marketTimer: any = null;
      const runMarketCycle = () => {
        executeMarketCycleForPanel(panel, panelSettings);
      };
      runMarketCycle();
      marketTimer = createWorkerInterval(runMarketCycle, marketInterval);

      // Ciclo Ultrarrápido de Monitoramento de Operações (Stop Loss, Take Profit e Trailing Stop)
      let opsTimer: any = null;
      const adminOpsInterval = Math.max(100, Number(adminSet?.ops_check_interval_ms || panelSettings.ops_check_interval_ms || 500));
      const runOpsCheckCycle = () => {
        const hasOpenOps = reportsRef.current.some(r => r.status === 'Em Andamento' && (
          r.panel_id === panel.id || 
          (!r.panel_id && r.instance_id && r.instance_id === panel.instance_id) ||
          (!r.panel_id && !r.instance_id && panel.id === 'default')
        ));
        if (hasOpenOps) {
          const cache = panelDataCache.current[panel.id];
          if (cache && cache.marketData) {
            runMarketLogicForPanel(panel, panelSettings, cache, cache.marketData, cache.forces || [], cache.gammaLevels || null);
          }
        }
      };
      opsTimer = createWorkerInterval(runOpsCheckCycle, adminOpsInterval);

      // Ciclo de IA (Apenas se o Ciclo Geral do Copilot estiver ativo, no painel ativo e na conta ativa com prompt compatível vinculado)
      let aiTimer: any = null;
      const compatibleRoutes = (panelAiEnabled && activeAccount)
        ? getCompatibleCopilotRoutesForAccountAndPanel(activeAccount, panel)
        : [];
      const compatiblePromptIds = compatibleRoutes.map(r => r.prompt_id).filter((id): id is string => Boolean(id));

      // Um prompt só roda ciclo autônomo por tempo se:
      // a) Pertence às rotas compatíveis e habilitadas da conta ativa no gráfico para este ativo
      // b) NÃO possui robô acionador (trigger_strategy_id), pois os com acionador só disparam quando o robô dispara
      const validAutonomousPrompts = compatiblePromptIds.filter((pid: string) => {
        const p = (prompts || []).find(pItem => pItem.id === pid);
        if (!p || p.trigger_strategy_id) return false;
        return true;
      });

      if (panelAiEnabled && panelSettings.ai_trigger_mode === 'tempo' && validAutonomousPrompts.length > 0) {
        const aiInterval = panelSettings.intervalo || 30000;
        const runAiCycle = () => {
          executeAiCycleForPanel(panel, { ...panelSettings, selected_prompt_id: validAutonomousPrompts.join(',') });
        };
        setTimeout(runAiCycle, 1000);
        aiTimer = createWorkerInterval(runAiCycle, aiInterval);
      }

      // Ciclo de Prompt Geral (Omni-Engine do Admin executado ininterruptamente via Web Worker)
      let generalPromptTimer: any = null;
      if (panelGeneralPromptEnabled) {
        const runGeneralPromptCycle = () => {
          executeGeneralPromptCycleForPanel(panel, panelSettings);
        };
        setTimeout(runGeneralPromptCycle, 3000);
        generalPromptTimer = createWorkerInterval(runGeneralPromptCycle, 15000);
      }

      runningLoops.current.set(panelId, { marketTimer, aiTimer, generalPromptTimer, opsTimer });
    });

    return () => {
      runningLoops.current.forEach((timers) => {
        clearWorkerTimer(timers.marketTimer);
        if (timers.aiTimer) clearWorkerTimer(timers.aiTimer);
        if (timers.generalPromptTimer) clearWorkerTimer(timers.generalPromptTimer);
        if (timers.opsTimer) clearWorkerTimer(timers.opsTimer);
      });
      runningLoops.current.clear();
    };
  }, [isAuthenticated, user, panels, allSettings, activePanel?.id, visibleMultiPanelIds, activeAccount?.id, accounts, accountStrategies, prompts, customStrategies, publicStrategies, aiEnabled, wakeTrigger, globalMarketInterval]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 📡 MOTOR DE EXECUÇÃO: COPY REMOTO (SEGUIR CONTAS & ROBÔS EXTERNOS)
  // ─────────────────────────────────────────────────────────────────────────────
  const processedRemoteOpsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    let remoteCopyTimer: any = null;

    const checkRemoteCopyCycle = async () => {
      try {
        const activeSubs = (remoteCopyConfigsRef.current || []).filter(c => c.is_active);
        if (activeSubs.length === 0) return;

        const sourceIds = Array.from(new Set(activeSubs.map(s => s.remote_source_id))).filter(Boolean);
        if (sourceIds.length === 0) return;

        // Query recente no Supabase para buscar operações geradas por esses sourceIds
        const { data: remoteOps, error } = await supabase
          .from('painelvm_strategy_reports')
          .select('*')
          .or(`account_id.in.(${sourceIds.map(id => `"${id}"`).join(',')}),strategy_id.in.(${sourceIds.map(id => `"${id}"`).join(',')})`)
          .order('created_at', { ascending: false })
          .limit(25);

        if (!error && remoteOps && remoteOps.length > 0) {
          for (const op of remoteOps) {
            // Encontra todas as inscrições locais que seguem esse remote_source_id (seja account_id ou strategy_id)
            const matchingSubs = activeSubs.filter(s => 
              (op.account_id && s.remote_source_id === op.account_id) || 
              (op.strategy_id && s.remote_source_id === op.strategy_id)
            );

            if (matchingSubs.length === 0) continue;

            if (op.status === 'Em Andamento') {
              for (const sub of matchingSubs) {
                const dedupeKey = `${op.id}_${sub.account_id}`;
                if (processedRemoteOpsRef.current.has(dedupeKey)) continue;

                // Evitar clonar se a conta local já possui essa operação
                const alreadyExists = (reportsRef.current || []).some(
                  r => r.master_operation_id === op.id && r.account_id === sub.account_id
                );
                if (alreadyExists) {
                  processedRemoteOpsRef.current.add(dedupeKey);
                  continue;
                }

                const targetAcc = (accountsRef.current || []).find((a: BrokerAccount) => a.id === sub.account_id);
                if (!targetAcc || targetAcc.is_active === false) continue;

                // Validar travas de segurança e risco da conta local
                const limits = await checkOperationalLimits('', undefined, targetAcc, false);
                if (!limits.allowed) {
                  console.warn(`[COPY REMOTO] Conta ${targetAcc.account_name} bloqueada por risco: ${limits.reason}`);
                  continue;
                }

                processedRemoteOpsRef.current.add(dedupeKey);

                const contratoClonado = Math.max(1, Math.round((Number(op.contrato) || 1) * (Number(sub.lot_multiplier) || 1)));
                const resolvedSymbol = resolveAccountExecutionSymbol(targetAcc, op.symbol);

                const entryP = Number(op.entry_price || 0);
                let slP = Number(op.stop_loss || 0);
                let tpP = Number(op.take_profit || 0);
                if (slP <= 0 && entryP > 0) slP = op.side === 'COMPRA' ? entryP - 20 : entryP + 20;
                if (tpP <= 0 && entryP > 0) tpP = op.side === 'COMPRA' ? entryP + 40 : entryP - 40;

                const stopPoints = Number(op.stop_loss_points) || (entryP > 0 ? Math.abs(entryP - slP) : 20);
                const takePoints = Number(op.take_profit_points) || (entryP > 0 ? Math.abs(tpP - entryP) : 40);

                const cloneId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `rc_op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

                const copyPayload = {
                  id: cloneId,
                  user_id: user.id,
                  account_id: targetAcc.id,
                  account_name: targetAcc.account_name,
                  symbol: resolvedSymbol,
                  side: op.side,
                  entry_price: entryP,
                  stop_loss: slP,
                  take_profit: tpP,
                  stop_loss_points: stopPoints,
                  take_profit_points: takePoints,
                  contrato: contratoClonado,
                  status: 'Em Andamento' as const,
                  master_operation_id: op.id,
                  is_copy_trade: true,
                  description: `${op.description || 'Operação'} (Copy Remoto ${sub.lot_multiplier}x - ${sub.label || 'Master'})`,
                  created_at: new Date().toISOString()
                };

                // Se for conta com execução local/NinjaTrader:
                if (isNinjaExecutionAccount(targetAcc) && slP > 0 && tpP > 0) {
                  mirrorToLocalServer('/sinal_local', copyPayload);
                }

                // Salva no banco e atualiza estado local
                try {
                  await supabase.from('painelvm_strategy_reports').insert([copyPayload]);
                } catch {}

                reportsRef.current = [copyPayload as any, ...reportsRef.current.filter(r => r.id !== cloneId)];
                setReports(prev => [copyPayload as any, ...prev.filter(r => r.id !== cloneId)]);
                saveLocalStrategyReports(reportsRef.current);
                addLog('SISTEMA', `⚡ [Copy Remoto] Operação espelhada na conta ${targetAcc.account_name}: ${op.side} ${contratoClonado}x ${resolvedSymbol} (Master: ${sub.label || op.account_name || op.account_id})`, 'sistema');
              }
            } else if (op.status === 'Gain' || op.status === 'Stop' || op.status === 'Cancelado') {
              // Sincronizar encerramento na conta local
              const localClones = (reportsRef.current || []).filter(
                r => r.master_operation_id === op.id && r.status === 'Em Andamento'
              );

              for (const clone of localClones) {
                const exitP = Number(op.exit_price || (op.status === 'Gain' ? clone.take_profit : clone.stop_loss));
                await updateReportAction(clone.id, op.status, exitP);

                const targetAcc = (accountsRef.current || []).find((a: BrokerAccount) => a.id === clone.account_id);
                if (targetAcc && isNinjaExecutionAccount(targetAcc) && op.status === 'Cancelado') {
                  mirrorToLocalServer('/sinal_local/status', {
                    id: clone.id,
                    status: 'Cancelado',
                    account_name: targetAcc.account_name,
                    symbol: clone.symbol
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('[COPY REMOTO] Erro no ciclo de monitoramento:', err);
      }
    };

    // Worker Interval ininterrupto (1500ms) que não sofre throttling em background
    remoteCopyTimer = createWorkerInterval(checkRemoteCopyCycle, 1500);

    return () => {
      if (remoteCopyTimer) clearWorkerTimer(remoteCopyTimer);
    };
  }, [isAuthenticated, user]);

  // 5.0.1 Loop de Monitoramento de Execuções Master no NinjaTrader (Reverse Copy Trading & Watchdog de Segurança)
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    let ninjaMasterTimer: any = null;
    let lastBridgePublishTimestamp = 0;
    let lastRemoteCmdCheckTimestamp = 0;
    const processedEvents = new Set<string>();
    const nakedPositionsTracker = new Map<string, number>();
    const orphanOrdersTracker = new Map<string, number>();

    let isMasterCycleRunning = false;
    const checkNinjaMasterCycle = async () => {
      if (isMasterCycleRunning) return;
      isMasterCycleRunning = true;
      try {
        // 🔌 Verifica a saúde do gateway NT8 a cada ciclo (400ms) e atualiza o estado de visibilidade das operações no gráfico
        const ninjaHealth = await checkNinjaStatus();
        const isGatewayOnline = ninjaHealth.status === 'online';
        setNinjaGatewayOnline(prev => prev !== isGatewayOnline ? isGatewayOnline : prev);

        // Se o gateway estiver offline, reseta rastreadores e não processa
        if (!isGatewayOnline) {
          nakedPositionsTracker.clear();
          orphanOrdersTracker.clear();
          return;
        }

        const allAccs = accountsRef.current || getLocalBrokerAccounts();
        const copyConfigs = getLocalCopyTradingConfigs();

        // 1. Processamento de Eventos Master (Reverse Copy Trading)
        try {
          const events = await fetchNinjaMasterEvents();
          if (events && events.length > 0) {
            for (const ev of events) {
              const evKey = `${ev.eventId || ev.orderId || ''}_${ev.eventType}_${ev.timestamp || ''}`;
              if (processedEvents.has(evKey)) continue;
              processedEvents.add(evKey);

              // Manter tamanho do set controlado
              if (processedEvents.size > 2000) {
                const first = processedEvents.values().next().value;
                if (first) processedEvents.delete(first);
              }

              // Tratamento imediato de eventos de rejeição vindos do NinjaTrader Add-On (ex: Master sem SL/TP ou violação de risco)
              if (ev.eventType === 'REJECTED') {
                const rejSide = ev.action === 'SELL' ? 'VENDA' : 'COMPRA';
                const rejReason = ev.orderName || 'Operação rejeitada pelas regras operacionais / falta de Stop Loss e Take Profit';
                const rejSlave = ev.orderId || ev.accountName || 'Slaves';
                logCopyTradingMessage({
                  type: 'REJEITADO',
                  masterAccount: ev.accountName || 'Master',
                  slaveAccount: rejSlave,
                  symbol: ev.symbol || 'NQ',
                  side: rejSide,
                  quantity: Number(ev.quantity || 1),
                  reason: rejReason,
                  message: `❌ Cópia/Ordem bloqueada (${ev.accountName} -> ${rejSlave}): ${rejReason}`
                });
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('vortex_copy_order_rejected', {
                    detail: {
                      masterAccount: ev.accountName,
                      slaveAccount: rejSlave,
                      symbol: ev.symbol,
                      reason: rejReason,
                      message: rejReason
                    }
                  }));
                }
                addLog('AVISO', `⚠️ [COPY TRADING REJEIÇÃO] ${ev.accountName} (${ev.symbol}): ${rejReason}`, 'alerta');
                continue;
              }

              // Encontrar conta correspondente no painel
              const targetAcc = allAccs.find(a => 
                a.account_name?.toLowerCase() === ev.accountName?.toLowerCase() ||
                a.id === ev.accountName
              );

              if (!targetAcc) continue;

              // Verificar se a conta é MASTER ou tem slaves configurados
              const isMaster = Boolean(targetAcc.is_master) || copyConfigs.some(c => 
                (c.master_account_id === targetAcc.id || c.master_account_id === targetAcc.account_name) && c.is_active !== false
              );

              // 🔒 Premissa Arquitetural: Se a conta for Slave de outra Master ativa no Vortex, NÃO cria relatório de entrada (evita duplicação no Supabase)
              const isSlaveOfActiveMaster = copyConfigs.some(c => 
                c.is_active !== false && 
                (c.slave_account_id === targetAcc.id || c.slave_account_id === targetAcc.account_name)
              );

              if (!isMaster || isSlaveOfActiveMaster) {
                // Para contas Slave, apenas processa CLOSE e LEVELS para manter encerramentos e trailing sincronizados
                if (ev.eventType !== 'CLOSE' && ev.eventType !== 'LEVELS') {
                  continue;
                }
              }

              if (ev.eventType === 'ENTRY') {
                const side = ev.action === 'BUY' ? 'COMPRA' : 'VENDA';
                const entryPrice = Number(ev.price || 0);
                let stopLoss = Number(ev.stopLoss || 0);
                let takeProfit = Number(ev.takeProfit || 0);
                let stopPoints = Number(ev.stopLossPoints || 0);
                let takePoints = Number(ev.takeProfitPoints || 0);

                if (stopPoints <= 0 && stopLoss > 0 && entryPrice > 0) {
                  stopPoints = Math.abs(entryPrice - stopLoss);
                }
                if (takePoints <= 0 && takeProfit > 0 && entryPrice > 0) {
                  takePoints = Math.abs(takeProfit - entryPrice);
                }

                if (stopLoss <= 0 && stopPoints > 0 && entryPrice > 0) {
                  stopLoss = side === 'COMPRA' ? entryPrice - stopPoints : entryPrice + stopPoints;
                }
                if (takeProfit <= 0 && takePoints > 0 && entryPrice > 0) {
                  takeProfit = side === 'COMPRA' ? entryPrice + takePoints : entryPrice - takePoints;
                }

                // 🛡️ Prevenção de duplicação: Se a ordem já foi aberta e registrada pelo painel/robô, apenas sincroniza métricas sem criar novo relatório
                const existingOpenOp = (reportsRef.current || []).find(r => 
                  (r.account_id === targetAcc.id || r.account_name?.toLowerCase() === targetAcc.account_name?.toLowerCase()) &&
                  isSameAsset(r.symbol, ev.symbol) &&
                  r.status === 'Em Andamento'
                );

                if (existingOpenOp) {
                  // A ordem já existe no painel. Apenas sincroniza o preço real de entrada do NinjaTrader e metas
                  const updatedReports = (reportsRef.current || []).map(r => {
                    if (r.id === existingOpenOp.id) {
                      return {
                        ...r,
                        symbol: ev.symbol || r.symbol,
                        entry_price: entryPrice > 0 ? entryPrice : r.entry_price,
                        stop_loss: stopLoss > 0 ? stopLoss : r.stop_loss,
                        take_profit: takeProfit > 0 ? takeProfit : r.take_profit,
                        stop_loss_points: stopPoints > 0 ? stopPoints : (r as any).stop_loss_points,
                        take_profit_points: takePoints > 0 ? takePoints : (r as any).take_profit_points
                      } as StrategyReport;
                    }
                    return r;
                  });
                  reportsRef.current = updatedReports;
                  setReports(updatedReports);
                  saveLocalStrategyReports(updatedReports);
                  continue;
                }

                const matchedPanel = panels.find(p => isSameAsset(p.symbol, ev.symbol) || isSameAsset(p.name, ev.symbol)) || activePanel;
                const reportId = ev.orderId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ntmaster_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);

                let masterLots = Number(ev.quantity || 1);
                const maxMasterLots = Number(targetAcc.manual_max_lots || 0);
                if (maxMasterLots > 0 && masterLots > maxMasterLots) {
                  masterLots = maxMasterLots;
                }

                const payload: any = {
                  id: reportId,
                  panel_id: matchedPanel?.id || 'ninja_direct',
                  instance_id: matchedPanel?.instance_id || 'master_nt',
                  strategy_id: 'ninja_master_direct',
                  strategy_name: `Ninja Master (${targetAcc.account_name})`,
                  symbol: ev.symbol,
                  side,
                  contrato: masterLots,
                  entry_price: entryPrice,
                  stop_loss: stopLoss,
                  take_profit: takeProfit,
                  stop_loss_points: stopPoints,
                  take_profit_points: takePoints,
                  status: 'Em Andamento',
                  account_id: targetAcc.id,
                  account_name: targetAcc.account_name,
                  created_at: ev.timestamp || new Date().toISOString(),
                  description: `[${matchedPanel?.name || ev.symbol}] Entrada direta no NinjaTrader (${ev.orderName || 'Chart Trader'})`,
                  is_master_event: true,
                  source: 'ninjatrader_master_execution',
                  origin: 'ninjatrader_native',
                  is_broadcast_blocked: true,
                  is_remote_signal: false,
                  already_dispatched: true,
                  already_dispatched_to_slaves: true,
                  is_atm: Boolean(ev.stopLoss || ev.takeProfit)
                };

                const newRep = await insertStrategyReportSupabase(payload);
                const finalReport = newRep || payload;
                const currentLocals = getLocalStrategyReports();
                const mergedMemory = [finalReport, ...currentLocals.filter(r => r.id !== reportId && r.id !== finalReport.id)];
                reportsRef.current = mergedMemory;
                setReports(mergedMemory);
                saveLocalStrategyReports(mergedMemory);

                await triggerCopyTradingForMaster(finalReport, payload);

                addLog(
                  'SUCESSO',
                  `[NINJA MASTER] Ordem ${payload.side} (${payload.contrato}x ${payload.symbol}) capturada na conta ${targetAcc.account_name} e sincronizada no painel (SL: ${stopLoss || '--'} | TP: ${takeProfit || '--'}).`,
                  'sistema'
                );
              } else if (ev.eventType === 'LEVELS') {
                const newSl = Number(ev.stopLoss || 0);
                const newTp = Number(ev.takeProfit || 0);

                const masterOpenReports = (reportsRef.current || []).filter(r => 
                  r.account_id === targetAcc.id &&
                  isSameAsset(r.symbol, ev.symbol) &&
                  r.status === 'Em Andamento'
                );

                if (masterOpenReports.length === 1) {
                  const rep = masterOpenReports[0];
                  const updatedSl = newSl > 0 ? newSl : rep.stop_loss;
                  const updatedTp = newTp > 0 ? newTp : rep.take_profit;
                  await updateReportLevelsAction(rep.id, updatedSl, updatedTp, null, true);
                  addLog(
                    'INFO',
                    `[NINJA MASTER] Metas atualizadas para ${targetAcc.account_name} (${ev.symbol}): SL = ${updatedSl ? updatedSl.toFixed(2) : '--'} | TP = ${updatedTp ? updatedTp.toFixed(2) : '--'}.`,
                    'sistema'
                  );
                } else if (masterOpenReports.length > 1) {
                  // Múltiplos alvos / ATM: localizar o alvo específico sem sobrescrever os outros alvos
                  let targetRep = ev.reportId ? masterOpenReports.find(r => r.id === ev.reportId) : null;
                  if (!targetRep && newTp > 0) {
                    targetRep = masterOpenReports.reduce((best, curr) => {
                      const bestDist = curr.take_profit ? Math.abs(curr.take_profit - newTp) : 999999;
                      const currDist = best.take_profit ? Math.abs(best.take_profit - newTp) : 999999;
                      return bestDist < currDist ? curr : best;
                    }, masterOpenReports[0]);
                  }
                  if (targetRep) {
                    const updatedSl = newSl > 0 ? newSl : targetRep.stop_loss;
                    const updatedTp = newTp > 0 ? newTp : targetRep.take_profit;
                    await updateReportLevelsAction(targetRep.id, updatedSl, updatedTp, null, true);
                    addLog(
                      'INFO',
                      `[NINJA MASTER] Metas atualizadas para ${targetAcc.account_name} (${ev.symbol} - ${targetRep.strategy_name}): SL = ${updatedSl ? updatedSl.toFixed(2) : '--'} | TP = ${updatedTp ? updatedTp.toFixed(2) : '--'}.`,
                      'sistema'
                    );
                  }
                }
              } else if (ev.eventType === 'CLOSE') {
                const openReports = (reportsRef.current || []).filter(r => 
                  r.account_id === targetAcc.id &&
                  isSameAsset(r.symbol, ev.symbol) &&
                  r.status === 'Em Andamento'
                );

                if (openReports.length === 0) {
                  continue;
                }

                const isFlatCommand = ev.action === 'FLAT' || (ev.quantity === 0 && !ev.reportId);

                if (isFlatCommand || openReports.length === 1) {
                  // Zeragem Geral ou operação única
                  for (const rep of openReports) {
                    const exitPrice = (ev.price && Number(ev.price) > 0) ? Number(ev.price) : Number(rep.entry_price);
                    const isBuy = rep.side === 'COMPRA';
                    const pts = isBuy ? (exitPrice - Number(rep.entry_price)) : (Number(rep.entry_price) - exitPrice);
                    const status: 'Gain' | 'Stop' = pts >= 0 ? 'Gain' : 'Stop';

                    await updateReportAction(rep.id, status, exitPrice);
                    addLog(
                      'INFO',
                      `[NINJA MASTER] Posição encerrada na conta ${targetAcc.account_name} (${ev.symbol}): Saída = ${exitPrice.toFixed(2)} (${pts >= 0 ? '+' : ''}${pts.toFixed(1)} pts - ${status}).`,
                      'sistema'
                    );
                  }
                } else {
                  // Saída individual / parcial (ATM múltiplos alvos)
                  // 1. Tenta casar por reportId
                  let targetRep = ev.reportId ? openReports.find(r => r.id === ev.reportId) : null;
                  
                  // 2. Se não casou por reportId, busca pelo alvo mais próximo do preço de saída (TP ou SL)
                  if (!targetRep) {
                    const exitPrice = (ev.price && Number(ev.price) > 0) ? Number(ev.price) : 0;
                    targetRep = openReports.reduce((best, curr) => {
                      const bestDist = Math.min(
                        best.take_profit ? Math.abs(best.take_profit - exitPrice) : 999999,
                        best.stop_loss ? Math.abs(best.stop_loss - exitPrice) : 999999
                      );
                      const currDist = Math.min(
                        curr.take_profit ? Math.abs(curr.take_profit - exitPrice) : 999999,
                        curr.stop_loss ? Math.abs(curr.stop_loss - exitPrice) : 999999
                      );
                      return currDist < bestDist ? curr : best;
                    }, openReports[0]);
                  }

                  if (targetRep) {
                    const exitPrice = (ev.price && Number(ev.price) > 0) ? Number(ev.price) : Number(targetRep.entry_price);
                    const isBuy = targetRep.side === 'COMPRA';
                    const pts = isBuy ? (exitPrice - Number(targetRep.entry_price)) : (Number(targetRep.entry_price) - exitPrice);
                    const status: 'Gain' | 'Stop' = pts >= 0 ? 'Gain' : 'Stop';

                    await updateReportAction(targetRep.id, status, exitPrice);
                    addLog(
                      'INFO',
                      `[NINJA MASTER] Alvo individual finalizado (${targetRep.strategy_name}) na conta ${targetAcc.account_name} (${ev.symbol}): Saída = ${exitPrice.toFixed(2)} (${pts >= 0 ? '+' : ''}${pts.toFixed(1)} pts - ${status}). Demais alvos permanecem ativos.`,
                      'sistema'
                    );
                  }
                }
              }
            }
          }
        } catch { }

        // Consulta unificada de posições e ordens no NinjaTrader
        let liveNinjaPositions: any[] = [];
        let ninjaWorkingOrders: any[] = [];
        try {
          const resPos = await fetchNinjaPositionsAndOrders();
          liveNinjaPositions = resPos.positions || [];
          ninjaWorkingOrders = resPos.orders || [];
        } catch { }

        // 2. 🔄 Auto-recuperação: Se houver ordem Master aberta sem metas no painel, consulta ordens para recuperar
        const unlinkedMasters = (reportsRef.current || []).filter(r =>
          r.status === 'Em Andamento' &&
          allAccs.some(a => a.id === r.account_id && (a.is_master || copyConfigs.some(c => (c.master_account_id === a.id || c.master_account_id === a.account_name) && c.is_active !== false))) &&
          (!r.stop_loss || !r.take_profit)
        );

        if (unlinkedMasters.length > 0 && ninjaWorkingOrders.length > 0) {
          for (const mRep of unlinkedMasters) {
            const isRecentlyModified = (Date.now() - ((mRep as any)._levels_modified_at || 0)) < 5000;
            if (isRecentlyModified) continue;
            const accObj = allAccs.find(a => a.id === mRep.account_id);
            if (!accObj) continue;
            const mOrders = ninjaWorkingOrders.filter(o => 
              o.account?.toLowerCase() === accObj.account_name?.toLowerCase() &&
              isSameAsset(o.symbol, mRep.symbol)
            );

            let slVal = mRep.stop_loss || 0;
            let tpVal = mRep.take_profit || 0;

            for (const ord of mOrders) {
              const typeLower = (ord.orderType || '').toLowerCase();
              if ((typeLower.includes('stop') || Number(ord.stopPrice) > 0) && Number(ord.stopPrice) > 0) {
                slVal = Number(ord.stopPrice);
              }
              if ((typeLower.includes('limit') || Number(ord.limitPrice) > 0) && Number(ord.limitPrice) > 0) {
                tpVal = Number(ord.limitPrice);
              }
            }

            if ((slVal > 0 && slVal !== mRep.stop_loss) || (tpVal > 0 && tpVal !== mRep.take_profit)) {
              // 🔒 skipNinjaSync = true: Auto-recuperação apenas sincroniza o painel, não reenvia para o NT8
              await updateReportLevelsAction(mRep.id, slVal > 0 ? slVal : null, tpVal > 0 ? tpVal : null, null, true);
            }
          }
        }

        // 3. 🔄 Preservação de Posições Sincronizadas:
        // Posições de contas sincronizadas devem permanecer 'Em Andamento' durante oscilações de conexão ou falhas de dados.
        // O encerramento ocorre exclusivamente via evento explícito do NinjaTrader (CLOSE) ou na reconciliação de performance.

        // 4. 🛡️ DISPOSITIVO DE SEGURANÇA (5 SEGUNDOS):
        // a) Posições abertas sem Stop Loss ou sem Take Profit por > 5s são encerradas a mercado.
        // b) Ordens pendentes órfãs (sem posição de mercado aberta na conta/ativo) por > 5s são canceladas.
        const activeLiveNinjaPositions = liveNinjaPositions.filter(p => 
          (p.marketPosition === 'BUY' || p.marketPosition === 'SELL') && 
          Number(p.quantity) > 0
        );
        const currentActivePosKeys = new Set<string>();

        for (const pos of activeLiveNinjaPositions) {
          const accObj = allAccs.find(a => 
            a.account_name?.trim().toLowerCase() === pos.account?.trim().toLowerCase() ||
            a.id === pos.account
          );
          if (!accObj || !isNinjaExecutionAccount(accObj)) continue;

          const posKey = `${pos.account?.trim().toLowerCase()}_${pos.symbol?.trim().toLowerCase()}`;
          currentActivePosKeys.add(posKey);

          // 1. Verifica se há ordem de Stop Loss ativa/pendente no NinjaTrader
          const hasNinjaStopOrder = ninjaWorkingOrders.some(o => 
            o.account?.trim().toLowerCase() === pos.account?.trim().toLowerCase() &&
            isSameAsset(o.symbol, pos.symbol) &&
            (o.orderState === 'Working' || o.orderState === 'Accepted' || o.orderState === 'Submitted' || o.orderState === 'TriggerPending' || !o.orderState) &&
            ((o.orderType || '').toLowerCase().includes('stop') || Number(o.stopPrice) > 0 || (o.name || '').toLowerCase().includes('stop') || (o.name || '').toLowerCase().includes('sl'))
          );

          // 2. Verifica se há proteção de Stop Loss gerenciada pelo Painel Vortex
          const hasPanelStopProtection = (reportsRef.current || []).some(r => 
            (r.account_id === accObj.id || r.account_name?.trim().toLowerCase() === accObj.account_name?.trim().toLowerCase()) &&
            isSameAsset(r.symbol, pos.symbol) &&
            r.status === 'Em Andamento' &&
            Number(r.stop_loss || 0) > 0
          );

          const hasStopProtection = hasNinjaStopOrder || hasPanelStopProtection;

          if (!hasStopProtection) {
            if (!nakedPositionsTracker.has(posKey)) {
              nakedPositionsTracker.set(posKey, Date.now());
            } else {
              const firstSeen = nakedPositionsTracker.get(posKey)!;
              const elapsedSec = (Date.now() - firstSeen) / 1000;
              if (elapsedSec >= 5) {
                // Passou de 5 segundos com posição aberta sozinha (sem Stop Loss): encerra a mercado imediatamente por segurança
                await closeNinjaPosition(pos.account, pos.symbol);
                addLog(
                  'ALERTA',
                  `🛡️ [SEGURANÇA 5s] Posição aberta em ${pos.symbol} (${pos.account}) desprotegida (sem Stop Loss) por mais de 5s foi encerrada a mercado.`,
                  'sistema'
                );
                nakedPositionsTracker.delete(posKey);
              }
            }
          } else {
            nakedPositionsTracker.delete(posKey);
          }
        }

        // Limpa posições que já foram fechadas da lista de monitoramento do watchdog
        for (const key of Array.from(nakedPositionsTracker.keys())) {
          if (!currentActivePosKeys.has(key)) {
            nakedPositionsTracker.delete(key);
          }
        }

        // 4b. 🛡️ Limpeza de Ordens Pendentes Órfãs (sem posição de mercado aberta por > 5s)
        const currentOrphanOrderKeys = new Set<string>();
        for (const ord of ninjaWorkingOrders) {
          if (!ord.account || !ord.orderId) continue;
          const hasOpenPosForOrder = activeLiveNinjaPositions.some(p =>
            p.account?.trim().toLowerCase() === ord.account?.trim().toLowerCase() &&
            isSameAsset(p.symbol, ord.symbol)
          );
          if (!hasOpenPosForOrder) {
            const ordKey = `${ord.account.trim().toLowerCase()}_${ord.orderId}`;
            currentOrphanOrderKeys.add(ordKey);
            if (!orphanOrdersTracker.has(ordKey)) {
              orphanOrdersTracker.set(ordKey, Date.now());
            } else {
              const firstSeenOrd = orphanOrdersTracker.get(ordKey)!;
              const elapsedOrdSec = (Date.now() - firstSeenOrd) / 1000;
              if (elapsedOrdSec >= 5) {
                await cancelNinjaOrder(ord.orderId, ord.account);
                addLog(
                  'INFO',
                  `🧹 [LIMPEZA 5s] Ordem pendente órfã '${ord.name || ord.orderId}' em ${ord.symbol} (${ord.account}) sem posição aberta há >5s foi cancelada automaticamente.`,
                  'sistema'
                );
                orphanOrdersTracker.delete(ordKey);
              }
            }
          }
        }

        for (const key of Array.from(orphanOrdersTracker.keys())) {
          if (!currentOrphanOrderKeys.has(key)) {
            orphanOrdersTracker.delete(key);
          }
        }

        // 🌐 3. Sincronização Cloud Bridge NT8: Publica estado ao vivo para o Celular / Acesso Restrito (a cada ~1.2s)
        const nowMs = Date.now();
        if (nowMs - lastBridgePublishTimestamp >= 1200) {
          lastBridgePublishTimestamp = nowMs;
          fetchNinjaAccounts().then(accsData => {
            const activeConnected = (accsData || []).filter((a: any) => a.isConnected === true || a.isConnected === undefined);
            saveNinjaLiveBridgeSnapshotSupabase({
              updatedAt: new Date().toISOString(),
              isOnline: true,
              latencyMs: ninjaHealth.latencyMs || 1,
              accounts: activeConnected,
              positions: liveNinjaPositions || [],
              orders: ninjaWorkingOrders || [],
              metricsMap: getNinjaAccountMetricsCache(),
              copyMessages: getLocalCopyMessages()
            }).catch(() => {});
          }).catch(() => {});
        }

        // 📱 4. Processamento de Comandos Remotos enviados pelo Celular / Acesso Restrito (a cada ~800ms)
        if (nowMs - lastRemoteCmdCheckTimestamp >= 800) {
          lastRemoteCmdCheckTimestamp = nowMs;
          fetchNinjaPendingRemoteCommandsSupabase().then(async pendingCmds => {
            if (pendingCmds && pendingCmds.length > 0) {
              for (const cmd of pendingCmds) {
                try {
                  if (cmd.type === 'CLOSE_POSITION' && cmd.account) {
                    await closeNinjaPosition(cmd.account, cmd.symbol);
                    addLog('ALERTA', `📱 [COMANDO REMOTO] Posição de ${cmd.symbol || 'todas'} na conta ${cmd.account} encerrada via acesso mobile/remoto.`, 'sistema');
                  } else if (cmd.type === 'CANCEL_ORDER' && cmd.orderId) {
                    await cancelNinjaOrder(cmd.orderId, cmd.account);
                    addLog('ALERTA', `📱 [COMANDO REMOTO] Ordem ${cmd.orderId} cancelada via acesso mobile/remoto.`, 'sistema');
                  } else if (cmd.type === 'CANCEL_ALL_ORDERS') {
                    await cancelAllNinjaOrders(cmd.account);
                    addLog('ALERTA', '📱 [COMANDO REMOTO] Todas as ordens pendentes foram canceladas via acesso mobile/remoto.', 'sistema');
                  } else if (cmd.type === 'FLATTEN_ALL') {
                    await flattenAllNinjaAccounts();
                    addLog('ALERTA', '📱 [COMANDO REMOTO] PÂNICO: Todas as posições e ordens zeradas via acesso mobile/remoto.', 'sistema');
                  }
                  await markNinjaRemoteCommandExecutedSupabase(cmd.id);
                } catch (cmdErr) {
                  console.warn('[REMOTE COMMAND] Erro ao processar comando remoto:', cmdErr);
                  await markNinjaRemoteCommandExecutedSupabase(cmd.id);
                }
              }
            }
          }).catch(() => {});
        }

      } catch (err) {
        // Erros de polling do gateway local são ignorados silenciosamente
      } finally {
        isMasterCycleRunning = false;
      }
    };

    // Polling rápido via Worker Interval (400ms) sem sofrer throttling
    ninjaMasterTimer = createWorkerInterval(checkNinjaMasterCycle, 400);

    return () => {
      if (ninjaMasterTimer) clearWorkerTimer(ninjaMasterTimer);
    };
  }, [isAuthenticated, user, panels, activePanel]);

  // 5.1 Configuração do Supabase Realtime (WebSockets)
  useEffect(() => {
    if (!isAuthenticated || !user || !panels || panels.length === 0) {
      // Limpar todas as inscrições se não autenticado
      Object.keys(realtimeSubscriptions.current).forEach((panelId) => {
        const info = realtimeSubscriptions.current[panelId];
        if (info && info.channel) {
          supabase.removeChannel(info.channel);
        }
      });
      realtimeSubscriptions.current = {};
      return;
    }

    // Subscrever a tabelas no Supabase para todos os painéis
    panels.forEach((panel) => {
      const panelId = panel.id;
      const panelSettings = allSettings[panelId];
      if (!panelSettings) return;

      const isCurrentActive = activePanel?.id === panelId;
      const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
      const adminSet = !isSystemAdmin ? getAdminSetForPanel(panel) : null;

      const instanceMarket = panelSettings.instance_id_market 
        || panel.instance_id 
        || (adminSet ? adminSet.instance_id_market : null) 
        || 'nt8_main';

      const rawInstance = (panel.instance_id || panel.id || '').toLowerCase();
      const rawName = (panel.name || '').toLowerCase();
      const rawCombined = `${rawInstance} ${rawName}`;

      let autoGammaSymbol = 'NQ';
      if (rawCombined.includes('gold') || rawCombined.includes('ouro') || rawCombined.includes('gc') || rawCombined.includes('mgc') || rawCombined.includes('xauusd')) {
        autoGammaSymbol = 'GC';
      } else if (rawCombined.includes('oil') || rawCombined.includes('petr') || rawCombined.includes('cl') || rawCombined.includes('mcl') || rawCombined.includes('wti')) {
        autoGammaSymbol = 'CL';
      } else if (rawCombined.includes('sp500') || rawCombined.includes('sp') || rawCombined.includes('es') || rawCombined.includes('mes')) {
        autoGammaSymbol = 'ES';
      } else if (rawCombined.includes('russel') || rawCombined.includes('russell') || rawCombined.includes('rty') || rawCombined.includes('m2k')) {
        autoGammaSymbol = 'RTY';
      } else if (rawCombined.includes('dow') || rawCombined.includes('ym') || rawCombined.includes('mym')) {
        autoGammaSymbol = 'YM';
      }

      const instanceForce = panelSettings.instance_id_force 
        || (adminSet ? adminSet.instance_id_force : null) 
        || 'painel_principal';

      const candleInstanceId = panelSettings.instance_id_screen 
        || panel.instance_id 
        || autoGammaSymbol.toLowerCase()
        || 'nt8_main';

      const gammaSymbol = panelSettings.gamma_symbol 
        || panel.gamma_symbol 
        || autoGammaSymbol;

      const checkIsActive = () => activePanelRef.current?.id === panel.id;

      // Inicializar Cache do Painel se não existir
      if (!panelDataCache.current[panelId]) {
        panelDataCache.current[panelId] = {
          marketData: null,
          forces: [],
          gammaLevels: null,
          screenshot: null,
          candles: [],
          lastGammaFetch: 0,
          lastGammaSymbol: '',
          lastScreenshotFetch: 0,
          lastCandlesFetch: 0,
          lastForceFetch: 0
        };
      }
      const cache = panelDataCache.current[panelId];

      // Busca inicial para Força Nasdaq
      if (cache.forces.length === 0 || isCurrentActive) {
        fetchForceSupabase(instanceForce).then(forceData => {
          if (forceData && forceData.forces && forceData.forces.length > 0) {
            cache.forces = forceData.forces;
            if (checkIsActive()) setForces(forceData.forces);
            runMarketLogicForPanel(panel, panelSettings, cache, cache.marketData, forceData.forces, cache.gammaLevels);
          }
        });
      }

      // Busca inicial para preencher o cache do mercado se a fonte for Supabase e não for WebSocket
      if (panelSettings.transmission_mode !== 'websocket' && panelSettings.source_market === 'supabase') {
        if (!cache.marketData) {
          fetchMarketDataSupabase(instanceMarket).then(mData => {
            if (mData) {
              cache.marketData = mData;
              if (checkIsActive()) setMarketData(mData);
              runMarketLogicForPanel(panel, panelSettings, cache, mData, cache.forces, cache.gammaLevels);
            }
          });
        }
      }

      // Busca inicial (uma vez) para preencher o cache do mercado se a fonte for Supabase
      if (panelSettings.source_market === 'supabase') {
        if (!cache.marketData) {
          fetchMarketDataSupabase(instanceMarket).then(mData => {
            if (mData) {
              cache.marketData = mData;
              if (checkIsActive()) setMarketData(mData);
              runMarketLogicForPanel(panel, panelSettings, cache, mData, cache.forces, cache.gammaLevels);
            }
          });
        }
        if (gammaSymbol && (!cache.gammaLevels || cache.lastGammaSymbol !== gammaSymbol)) {
          fetchGammaLevelsSupabase(gammaSymbol).then(levels => {
            if (levels) {
              cache.gammaLevels = levels;
              cache.lastGammaSymbol = gammaSymbol;
              cache.lastGammaFetch = Date.now();
              if (checkIsActive()) setGammaLevels(levels);
              runMarketLogicForPanel(panel, panelSettings, cache, cache.marketData, cache.forces, levels);
            }
          }).catch(err => console.error('[REALTIME] Erro inicial de níveis:', err));
        }
      }

      if (isCurrentActive) {
        const historyDays = Number(panelSettings.chart_history_days) || 3;
        const maxCandleLimit = Math.min(50000, Math.max(720, historyDays * 1440));

        const isAlreadyLoaded = initialLoadedPanelsRef.current.has(panel.id) && cache.candles && cache.candles.length >= 10;

        if (!isAlreadyLoaded && !cache.isFetchingCandles) {
          // Semáforo: impede que o ciclo de mercado dispare a MESMA carga completa em paralelo
          cache.isFetchingCandles = true;
          cache.lastCandlesFetch = Date.now();
          setCandlesLoadingProgress({
            isLoading: true,
            percent: 15,
            loaded: 0,
            total: maxCandleLimit,
            days: historyDays,
            isExplicitDaysChange: true
          });
          setIsCandlesLoading(true);

          withDbTimeout(fetchCandlesSupabase(
            panel.id,
            candleInstanceId,
            maxCandleLimit,
            panel,
            panelSettings,
            (pct, loaded, _total) => {
              if (checkIsActive()) {
                setCandlesLoadingProgress({
                  isLoading: pct < 100,
                  percent: pct,
                  loaded,
                  total: maxCandleLimit,
                  days: historyDays,
                  isExplicitDaysChange: true
                });
              }
            }
          ), 30000).then(candlesData => {
            if (candlesData && candlesData.length > 0) {
              const minuteMap = new Map<number, Candle>();

              // 1. Preserva histórico existente na memória se houver
              const existingMem = cache.candles || [];
              if (existingMem.length > 0) {
                existingMem.forEach((c: Candle) => {
                  if (!c || !c.timestamp) return;
                  const t = new Date(c.timestamp).getTime();
                  if (isNaN(t) || t <= 0) return;
                  minuteMap.set(Math.floor(t / 60000), c);
                });
              }

              // 2. Popula com os dados históricos oficiais
              candlesData.forEach((c: Candle) => {
                if (!c || !c.timestamp) return;
                const t = new Date(c.timestamp).getTime();
                if (isNaN(t) || t <= 0) return;
                minuteMap.set(Math.floor(t / 60000), c);
              });

              // 2. Preserva apenas velas locais contíguas (no máximo 3 minutos após o histórico) e com preço coerente
              const lastHistCandle = candlesData[candlesData.length - 1];
              const lastHistMs = new Date(lastHistCandle.timestamp).getTime();
              const lastHistClose = Number(lastHistCandle.close) || 0;
              const existing = cache.candles || [];

              if (existing.length > 0 && lastHistMs > 0 && lastHistClose > 0) {
                existing.forEach((c: Candle) => {
                  if (!c || !c.timestamp) return;
                  const t = new Date(c.timestamp).getTime();
                  if (isNaN(t) || t <= lastHistMs) return;
                  if (t <= lastHistMs + 180000) {
                    const cClose = Number(c.close) || 0;
                    if (cClose > 0 && Math.abs(cClose - lastHistClose) / lastHistClose <= 0.035) {
                      minuteMap.set(Math.floor(t / 60000), c);
                    }
                  }
                });
              }

              const sorted = Array.from(minuteMap.values())
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

              let finalCandles = cleanAndSanitizeCandles(sorted).slice(-maxCandleLimit);

              // 3. Aplica preço em tempo real atual sobre o histórico baixado, se compatível
              if (cache.marketData && cache.marketData.price && cache.marketData.price !== '--' && cache.marketData.updated_at && (Date.now() - (parseInputToDate(cache.marketData.updated_at)?.getTime() || 0) <= 45000)) {
                const isCompatible = isMarketDataCompatibleWithPanel(panel.name || panel.id, cache.marketData.symbol);
                if (isCompatible) {
                  const numPrice = parseNumericValue(cache.marketData.price);
                  if (numPrice && !isNaN(numPrice) && numPrice > 0) {
                    const { updatedCandles } = applyRealtimePriceToCandles(finalCandles, numPrice, cache.marketData.updated_at);
                    finalCandles = cleanAndSanitizeCandles(updatedCandles).slice(-maxCandleLimit);
                  }
                }
              }

              cache.candles = finalCandles;
              initialLoadedPanelsRef.current.add(panel.id);
              if (checkIsActive()) {
                setCandles(finalCandles);
                setCandlesLoadingProgress({
                  isLoading: false,
                  percent: 100,
                  loaded: finalCandles.length,
                  total: maxCandleLimit,
                  days: historyDays,
                  isExplicitDaysChange: false
                });
                setIsCandlesLoading(false);
              }
            }
          }).catch(err => {
            console.error('[REALTIME] Erro inicial ao buscar candles:', err);
          }).finally(() => {
            cache.isFetchingCandles = false;
            if (checkIsActive()) {
              setCandlesLoadingProgress(prev => ({ ...prev, isLoading: false, percent: 100, isExplicitDaysChange: false }));
              setIsCandlesLoading(false);
            }
          });
        }
        if (!cache.screenshot) {
          fetchScreenshotSupabase(panel.id).then(screenshotData => {
            if (screenshotData) {
              cache.screenshot = screenshotData;
              setScreenshot(screenshotData);
            }
          });
        }
      }

      // Se já existir canal ativo com configurações iguais, evitar recriar.
      // Se as chaves do canal mudaram (símbolos/instâncias), recriamos o canal.
      const currentKey = `key:${instanceMarket}:${instanceForce}:${candleInstanceId}:${gammaSymbol}`;
      const existingChannelInfo = realtimeSubscriptions.current[panelId];

      if (existingChannelInfo && existingChannelInfo.key === currentKey) {
        return;
      }

      if (existingChannelInfo) {
        supabase.removeChannel(existingChannelInfo.channel);
        delete realtimeSubscriptions.current[panelId];
      }

      const channelName = `panel-realtime-${panelId}`;
      const channel = supabase.channel(channelName);

      if (panelSettings.source_market === 'supabase') {
        // Escutar alterações de market_data
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'market_data',
            filter: `instance_id=eq.${instanceMarket}`
          },
          (payload: any) => {
            lastRealtimeTickRef.current = Date.now();
            console.log(`[REALTIME market_data] Evento recebido para ${instanceMarket}:`, payload.eventType);
            const data = payload.new;
            if (!data) return;

            const recentTrades = data.recent_trades ? (typeof data.recent_trades === 'string' ? JSON.parse(data.recent_trades) : data.recent_trades) : [];
            const formattedTrades: BlockTrade[] = Array.isArray(recentTrades) ? recentTrades.map((t: any) => ({
              time: t.time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              price: Number(t.price || 0),
              volume: Number(t.volume || 0),
              side: String(t.side || 'COMPRA').toUpperCase()
            })) : [];

            const mData: MarketData = {
              symbol: data.symbol || '--',
              price: data.price !== undefined ? String(data.price) : '--',
              zScore: Number(data.zscore || 0),
              atrRatio: Number(data.atr_ratio || 0),
              estado: data.estado || 'AGUARDANDO',
              timestamp: data.updated_at ? new Date(data.updated_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : (data.ts || '--:--:--'),
              sentiment: Number(data.delta_pct !== undefined ? data.delta_pct : 50),
              originalSentiment: Number(data.delta_pct !== undefined ? data.delta_pct : 50),
              delta: Number(data.delta || 0),
              deltaRatio: Number(data.ratio !== undefined ? data.ratio : 1.0),
              buyVolume: Number(data.buy_volume || 0),
              sellVolume: Number(data.sell_volume || 0),
              printsPerSecond: Number(data.print_rate || 0),
              blockTrades: formattedTrades,
              updated_at: data.updated_at
            };

            runMarketLogicForPanel(panel, panelSettings, cache, mData, cache.forces, cache.gammaLevels);
          }
        );

        // Escutar alterações de nasdaq_force
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'nasdaq_force'
          },
          (payload: any) => {
            console.log(`[REALTIME nasdaq_force] Evento recebido:`, payload.eventType);
            const data = payload.new;
            if (!data) return;

            let forcesList: { symbol: string; buy: number; sell: number }[] = [];
            if (data.force_data) {
              forcesList = typeof data.force_data === 'string' ? JSON.parse(data.force_data) : data.force_data;
            } else {
              const mapping = [
                { key: 'nasdaq', display: 'NASDAQ' },
                { key: 'sp500', display: 'S&P 500' },
                { key: 'usdindex', display: 'USD Index' },
                { key: 'vix', display: 'VIX' },
                { key: 'nvidia', display: 'NVIDIA' },
                { key: 'microsoft', display: 'MICROSOFT' },
                { key: 'apple', display: 'APPLE' },
                { key: 'meta', display: 'META' },
                { key: 'amazon', display: 'AMAZON' },
                { key: 'alphabet', display: 'ALPHABET' },
                { key: 'tesla', display: 'TESLA' },
                { key: 'forca_final', display: 'FORÇA FINAL' }
              ];
              mapping.forEach(m => {
                const buyVal = data[`${m.key}_compra`];
                const sellVal = data[`${m.key}_venda`];
                if (buyVal !== undefined && sellVal !== undefined) {
                  forcesList.push({ symbol: m.display, buy: Number(buyVal), sell: Number(sellVal) });
                }
              });
            }

            cache.forces = forcesList;
            if (checkIsActive()) {
              setForces(forcesList);
            }
            runMarketLogicForPanel(panel, panelSettings, cache, cache.marketData, forcesList, cache.gammaLevels);
          }
        );

        // Escutar alterações de gamma_levels
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'gamma_levels',
            filter: `reference_symbol=eq.${gammaSymbol}`
          },
          (payload: any) => {
            console.log(`[REALTIME gamma_levels] Evento recebido para ${gammaSymbol}:`, payload.eventType);
            const data = payload.new;
            if (!data) return;

            const parseGammaArray = (val: any): number[] => {
              if (!val) return [];
              if (Array.isArray(val)) return val.map(Number);
              return String(val)
                .split(',')
                .map(v => parseFloat(v.trim()))
                .filter(v => !isNaN(v) && v > 0);
            };

            const levels: GammaLevels = {
              hvl: data.hvl !== undefined ? String(data.hvl) : '--',
              call: data.call_resistance !== undefined ? String(data.call_resistance) : '--',
              put: data.put_support !== undefined ? String(data.put_support) : '--',
              max1d: data.max_1d !== undefined ? String(data.max_1d) : '--',
              min1d: data.min_1d !== undefined ? String(data.min_1d) : '--',
              prev: data.prev_day_adjust !== undefined ? String(data.prev_day_adjust) : '--',
              prevH: data.prev_day_high !== undefined ? String(data.prev_day_high) : '--',
              prevL: data.prev_day_low !== undefined ? String(data.prev_day_low) : '--',
              hvl0: data.hvl_0dte !== undefined ? String(data.hvl_0dte) : '--',
              call0: data.call_resistance_0dte !== undefined ? String(data.call_resistance_0dte) : '--',
              put0: data.put_support_0dte !== undefined ? String(data.put_support_0dte) : '--',
              gwall: data.gamma_wall_0dte !== undefined ? String(data.gamma_wall_0dte) : '--',
              gex_count: data.gex ? String(data.gex).split(',').length : 0,
              bl_count: data.bl ? String(data.bl).split(',').length : 0,
              gex: parseGammaArray(data.gex),
              bl: parseGammaArray(data.bl),
              buy_strength: data.buy_strength !== undefined ? Number(data.buy_strength) : 0,
              sell_strength: data.sell_strength !== undefined ? Number(data.sell_strength) : 0,
              gamma_bias: data.gamma_bias !== undefined ? String(data.gamma_bias) : '--',
              bias_score: data.bias_score !== undefined ? Number(data.bias_score) : 0,
              nearest_resistance: data.nearest_resistance !== undefined ? Number(data.nearest_resistance) : 0,
              nearest_support: data.nearest_support !== undefined ? Number(data.nearest_support) : 0,
              distance_to_resistance: data.distance_to_resistance !== undefined ? Number(data.distance_to_resistance) : 0,
              distance_to_support: data.distance_to_support !== undefined ? Number(data.distance_to_support) : 0,
              confluence_type: data.confluence_type !== undefined ? String(data.confluence_type) : '--',
              recommended_strategy: data.recommended_strategy !== undefined ? String(data.recommended_strategy) : '--',
              void_gamma_above: data.void_gamma_above !== undefined ? Number(data.void_gamma_above) : 0,
              void_gamma_below: data.void_gamma_below !== undefined ? Number(data.void_gamma_below) : 0,
              bias_timestamp: data.bias_timestamp !== undefined ? String(data.bias_timestamp) : '--'
            };

            cache.gammaLevels = levels;
            cache.lastGammaSymbol = gammaSymbol;
            cache.lastGammaFetch = Date.now();
            if (checkIsActive()) {
              setGammaLevels(levels);
            }
            runMarketLogicForPanel(panel, panelSettings, cache, cache.marketData, cache.forces, levels);
          }
        );

        // Escutar alterações de painvelvm_options_market em tempo real
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'painvelvm_options_market'
          },
          (payload: any) => {
            console.log('[REALTIME painvelvm_options_market] Evento recebido:', payload.eventType);
            const data = payload.new;
            if (!data) return;

            const opts: OptionsMarketData = {
              id: data.id,
              market_symbol: data.market_symbol || 'NQ',
              gamma_wall_positivo: data.gamma_wall_positivo !== undefined ? Number(data.gamma_wall_positivo) : undefined,
              flip_zone: data.flip_zone !== undefined ? Number(data.flip_zone) : undefined,
              gamma_wall_negativo: data.gamma_wall_negativo !== undefined ? Number(data.gamma_wall_negativo) : undefined,
              analytics: data.analytics || undefined,
              anchors: data.anchors || undefined,
              flow_and_exposure: data.flow_and_exposure || undefined,
              stock_replacement: data.stock_replacement || undefined,
              market_bias: data.market_bias || undefined,
              nq_projection: data.nq_projection || undefined,
              captured_at: data.captured_at || undefined
            };

            cache.optionsMarket = opts;
            cache.lastOptionsMarketFetch = Date.now();
            if (checkIsActive()) {
              setOptionsMarket(opts);
            }
          }
        );
      }

      if (isCurrentActive) {
        // Escutar novos candles inseridos em tempo real via WebSockets
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'painelvm_candles_1m',
            filter: `instance_id=eq.${candleInstanceId}`
          },
          (payload: any) => {
            const c = payload.new;
            if (!c || !c.timestamp) return;

            lastRealtimeTickRef.current = Date.now();

            const existingCandles = cache.candles || [];
            if (existingCandles.length === 0) return; // Evita criar estado de 1 vela se o histórico ainda está baixando
            
            const newCandle: Candle = {
              timestamp: c.timestamp,
              open: Number(c.open || 0),
              high: Number(c.high || 0),
              low: Number(c.low || 0),
              close: Number(c.close || 0),
              volume: c.volume !== undefined ? Number(c.volume) : undefined
            };

            const existingMap = new Map<number, Candle>(existingCandles.map((x: Candle) => [Math.floor(new Date(x.timestamp).getTime() / 60000), x]));
            const nKey = Math.floor(new Date(newCandle.timestamp).getTime() / 60000);
            if (!isNaN(nKey) && nKey > 0) {
              existingMap.set(nKey, newCandle);
            }

            const updatedCandles = Array.from(existingMap.values())
              .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            const historyDays = Number(panelSettings.chart_history_days) || 7;
            const maxCandleLimit = Math.min(50000, historyDays * 1440);
            const finalCandlesList = updatedCandles.slice(-maxCandleLimit);

            const previousLastCandleTime = (cache as any).previousLastCandleTime;
            const lastCandle = finalCandlesList[finalCandlesList.length - 1];
            const lastCandleTime = lastCandle ? lastCandle.timestamp : null;

            if (previousLastCandleTime && lastCandleTime && lastCandleTime !== previousLastCandleTime) {
              if (aiEnabled && panelSettings.ai_trigger_mode === 'barra') {
                console.log(`[IA REALTIME] Novo candle fechado (${lastCandleTime}). Disparando modo Barra!`);
                executeAiCycleForPanel(panel, panelSettings);
              }
            }
            (cache as any).previousLastCandleTime = lastCandleTime;

            cache.candles = finalCandlesList;
            setCandles(finalCandlesList);
          }
        );

        // Escutar alterações de screenshots (apenas quando não estiver em modo candles)
        if (panelSettings.source_screen !== 'candles') {
          channel.on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'screenshots',
              filter: `instance_id=eq.${panelId}`
            },
            (payload: any) => {
              console.log(`[REALTIME screenshots] Novo screenshot para painel ${panelId}`);
              const data = payload.new;
              if (data && data.image_data) {
                cache.screenshot = data.image_data;
                setScreenshot(data.image_data);
              }
            }
          );
        }
      }

      channel.subscribe((status) => {
        console.log(`[REALTIME CHANNEL ${channelName}] Connection status:`, status);
      });

      realtimeSubscriptions.current[panelId] = { channel, key: currentKey };
    });

    return () => {
      // O cleanup remove apenas os canais de painéis removidos ou na desmontagem geral
      Object.keys(realtimeSubscriptions.current).forEach((panelId) => {
        const found = panels.some(p => p.id === panelId);
        if (!found) {
          const info = realtimeSubscriptions.current[panelId];
          if (info && info.channel) {
            supabase.removeChannel(info.channel);
          }
          delete realtimeSubscriptions.current[panelId];
        }
      });
    };
  }, [isAuthenticated, user, panels, allSettings, activePanel?.id, aiEnabled]);

  // Conexão WebSocket Hub Relay (Modo B: Streaming Instantâneo)
  useEffect(() => {
    if (!isAuthenticated || !user || !activePanel) return;
    const panelSettings = settings || allSettings[activePanel.id];
    if (!panelSettings) return;

    const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
    const adminSet = !isSystemAdmin ? getAdminSetForPanel(activePanel) : null;

    const isWsMode = (adminSet?.transmission_mode || panelSettings.transmission_mode) === 'websocket';
    if (!isWsMode) {
      if (wsHubSocketRef.current) {
        try { wsHubSocketRef.current.close(); } catch (_) {}
        wsHubSocketRef.current = null;
        setWsHubConnected(false);
      }
      return;
    }

    let wsUrl = adminSet?.websocket_hub_url || panelSettings.websocket_hub_url || 'ws://144.126.141.254/ws';

    // Auto-ajuste transparente para HTTPS (Proxy Reverso NGINX em wss://) e Executável Desktop (.NET 8 WebView2 / axion.station)
    if (typeof window !== 'undefined') {
      const host = (window.location.host || '').toLowerCase();
      const isVirtualOrLocalHost =
        host.includes('axion.station') ||
        host.startsWith('localhost') ||
        host.startsWith('127.0.0.1') ||
        window.location.protocol === 'file:';

      if (isVirtualOrLocalHost) {
        if (wsUrl.startsWith('/ws') || wsUrl.includes('144.126.141.254') || wsUrl.includes('axion.station')) {
          wsUrl = 'wss://painel.vemviraramesa.com.br/ws';
        }
      } else if (window.location.protocol === 'https:') {
        if (wsUrl.startsWith('/ws')) {
          wsUrl = `wss://${window.location.host}${wsUrl}`;
        } else if (wsUrl.startsWith('ws://')) {
          // Se a página estiver em HTTPS, o navegador bloqueia qualquer ws:// inseguro.
          // Redirecionamos para o proxy reverso seguro do NGINX no mesmo domínio:
          wsUrl = `wss://${window.location.host}/ws`;
        }
      }
    }

    let isMounted = true;
    let reconnectTimeout: any = null;

    const connectWs = () => {
      if (!isMounted) return;
      try {
        console.log(`[WS HUB] Conectando ao Relay Hub em ${wsUrl}...`);
        const ws = new WebSocket(wsUrl);
        wsHubSocketRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          console.log(`[WS HUB] 🟢 Conectado com sucesso ao Relay Hub (${wsUrl})!`);
          setWsHubConnected(true);
          if (user?.id) {
            try {
              ws.send(JSON.stringify({ type: 'identify', user_id: user.id }));
            } catch (_) {}
          }
          if (isSystemAdmin) {
            addLog('SISTEMA', `Conexão WebSocket Hub ativa em ${wsUrl}`, 'sistema');
          }
          // Sincronização pós-reconexão: força checagem de histórico para preencher lacunas/gaps de quando a máquina esteve offline
          const targetPanel = activePanelRef.current || activePanel;
          if (targetPanel && panelDataCache.current[targetPanel.id]) {
            panelDataCache.current[targetPanel.id].lastCandlesFetch = 0;
            panelDataCache.current[targetPanel.id].isFetchingCandles = false;
          }
          refreshMarketData();
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const msg = JSON.parse(event.data);
            if (!msg || !msg.type) return;

            const incomingInst = msg.instance_id || msg.data?.instance_id;
            let targetPanel = activePanelRef.current || activePanel;
            if (incomingInst && allPanelsRef.current.length > 0) {
              const matched = allPanelsRef.current.find((p: any) => {
                const pSet = allSettingsRef.current[p.id];
                const pAdmin = !isSystemAdmin ? getAdminSetForPanel(p) : null;
                const mktInst = pAdmin?.instance_id_market || pSet?.instance_id_market;
                const cndInst = pAdmin?.instance_id_candles || pSet?.instance_id_candles;
                return (
                  p.instance_id === incomingInst ||
                  mktInst === incomingInst ||
                  cndInst === incomingInst
                );
              });
              if (matched) {
                targetPanel = matched;
              }
            }
            if (!targetPanel) return;
            const currentAdminSet = !isSystemAdmin ? getAdminSetForPanel(targetPanel) : null;
            const targetSettings = allSettingsRef.current[targetPanel.id] || allSettings[targetPanel.id] || settings;
            if (!targetSettings) return;

            if (!panelDataCache.current[targetPanel.id]) {
              panelDataCache.current[targetPanel.id] = {
                marketData: null,
                forces: [],
                gammaLevels: null,
                screenshot: null,
                candles: [],
                lastGammaFetch: 0,
                lastGammaSymbol: ''
              };
            }
            const cache = panelDataCache.current[targetPanel.id];

            if (msg.type === 'market_data' && msg.data) {
              const d = msg.data;
              const msgInst = msg.instance_id || d.instance_id;
              const expectedMarketInst = currentAdminSet?.instance_id_market || targetSettings.instance_id_market || targetPanel.instance_id;
              const expectedCandleInst = currentAdminSet?.instance_id_candles || targetSettings.instance_id_candles || targetPanel.instance_id;
              if (msgInst && expectedMarketInst && msgInst !== expectedMarketInst && msgInst !== expectedCandleInst && msgInst !== targetPanel.instance_id) {
                return;
              }

              const recentTrades = d.recent_trades ? (typeof d.recent_trades === 'string' ? JSON.parse(d.recent_trades) : d.recent_trades) : [];
              const formattedTrades: BlockTrade[] = Array.isArray(recentTrades) ? recentTrades.map((t: any) => ({
                time: t.time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                price: Number(t.price || 0),
                volume: Number(t.volume || 0),
                side: String(t.side || 'COMPRA').toUpperCase()
              })) : [];

              const mData: MarketData = {
                symbol: d.symbol || '--',
                price: d.price !== undefined ? String(d.price) : '--',
                zScore: Number(d.zscore || 0),
                atrRatio: Number(d.atr_ratio || 0),
                estado: d.estado || 'AGUARDANDO',
                timestamp: d.updated_at ? new Date(d.updated_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : (d.ts || '--:--:--'),
                sentiment: Number(d.delta_pct !== undefined ? d.delta_pct : 50),
                originalSentiment: Number(d.delta_pct !== undefined ? d.delta_pct : 50),
                delta: Number(d.delta || 0),
                deltaRatio: Number(d.ratio !== undefined ? d.ratio : 1.0),
                buyVolume: Number(d.buy_volume || 0),
                sellVolume: Number(d.sell_volume || 0),
                printsPerSecond: Number(d.print_rate || 0),
                blockTrades: formattedTrades,
                updated_at: d.updated_at
              };

              lastRealtimeTickRef.current = Date.now();
              cache.lastMarketUpdateAt = Date.now();
              cache.marketData = mData;
              if (activePanelRef.current?.id === targetPanel.id) {
                setMarketData(mData);
              } else {
                bumpPanelCacheVersion();
              }

              // Atualiza candle em formação com proteção de sanidade
              if (mData.price && mData.price !== '--' && cache.candles && cache.candles.length > 0 && mData.updated_at && (Date.now() - (parseInputToDate(mData.updated_at)?.getTime() || 0) <= 45000)) {
                const numPrice = parseNumericValue(mData.price);
                if (numPrice && !isNaN(numPrice) && numPrice > 0) {
                  const { updatedCandles, hasChanged, isNewBar } = applyRealtimePriceToCandles(cache.candles, numPrice, mData.updated_at);
                  if (hasChanged) {
                    cache.candles = updatedCandles;
                    if (isNewBar && activePanelRef.current?.id === targetPanel.id) {
                      setCandles([...updatedCandles]);
                    } else if (activePanelRef.current?.id !== targetPanel.id) {
                      bumpPanelCacheVersion();
                    }
                  }
                }
              }

              runMarketLogicForPanel(targetPanel, targetSettings, cache, mData, cache.forces, cache.gammaLevels);
            } else if (msg.type === 'nasdaq_force' && msg.data) {
              const d = msg.data;
              const msgInst = msg.instance_id || d.instance_id;
              if (msgInst && targetSettings.instance_id_force && msgInst !== targetSettings.instance_id_force && msgInst !== targetPanel.instance_id) {
                return;
              }

              let forcesList: { symbol: string; buy: number; sell: number }[] = [];
              if (d.force_data) {
                forcesList = typeof d.force_data === 'string' ? JSON.parse(d.force_data) : d.force_data;
              } else {
                const mapping = [
                  { key: 'nasdaq', display: 'NASDAQ' },
                  { key: 'sp500', display: 'S&P 500' },
                  { key: 'usdindex', display: 'USD Index' },
                  { key: 'vix', display: 'VIX' },
                  { key: 'nvidia', display: 'NVIDIA' },
                  { key: 'microsoft', display: 'MICROSOFT' },
                  { key: 'apple', display: 'APPLE' },
                  { key: 'meta', display: 'META' },
                  { key: 'amazon', display: 'AMAZON' },
                  { key: 'alphabet', display: 'ALPHABET' },
                  { key: 'tesla', display: 'TESLA' },
                  { key: 'forca_final', display: 'FORÇA FINAL' }
                ];

                mapping.forEach(m => {
                  const buyVal = d[`${m.key}_compra`] !== undefined ? d[`${m.key}_compra`] : d[`${m.key}_impulso_compra`];
                  const sellVal = d[`${m.key}_venda`] !== undefined ? d[`${m.key}_venda`] : d[`${m.key}_impulso_venda`];
                  if (buyVal !== undefined && sellVal !== undefined && buyVal !== null && sellVal !== null) {
                    forcesList.push({
                      symbol: m.display,
                      buy: Number(buyVal),
                      sell: Number(sellVal)
                    });
                  }
                });
              }

              if (forcesList.length > 0) {
                cache.lastMarketUpdateAt = Date.now();
                lastRealtimeTickRef.current = Date.now();
                cache.forces = forcesList;
                if (activePanelRef.current?.id === targetPanel.id) {
                  setForces(forcesList);
                }
                runMarketLogicForPanel(targetPanel, targetSettings, cache, cache.marketData, forcesList, cache.gammaLevels);
              }
            } else if (msg.type === 'candle' && msg.data) {
              const c = msg.data;
              const msgInst = msg.instance_id || c.instance_id;
              const expectedCandleInst = currentAdminSet?.instance_id_screen || currentAdminSet?.instance_id_market || targetSettings.instance_id_screen || targetSettings.instance_id_market || targetPanel.instance_id;
              if (msgInst && expectedCandleInst && msgInst !== expectedCandleInst && msgInst !== targetSettings.instance_id_market && msgInst !== targetPanel.instance_id) {
                return;
              }

              if (c && c.timestamp) {
                syncServerClock(c.timestamp);
                const o = Number(c.open || 0);
                const h = Number(c.high || 0);
                const l = Number(c.low || 0);
                const cl = Number(c.close || 0);

                if (o > 0 && h > 0 && l > 0 && cl > 0 && h >= l) {
                  cache.lastMarketUpdateAt = Date.now();
                  lastRealtimeTickRef.current = Date.now();
                  const newCandle: Candle = {
                    timestamp: c.timestamp,
                    open: o,
                    high: h,
                    low: l,
                    close: cl,
                    volume: c.volume !== undefined ? Number(c.volume) : undefined
                  };
                  const existingCandles = cache.candles || [];
                  const existingMap = new Map<number, Candle>(existingCandles.map((x: Candle) => [Math.floor(new Date(x.timestamp).getTime() / 60000), x]));
                  const nKey = Math.floor(new Date(newCandle.timestamp).getTime() / 60000);
                  if (!isNaN(nKey) && nKey > 0) {
                    existingMap.set(nKey, newCandle);
                  }
                  const updated = Array.from(existingMap.values())
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                  const finalCandles = updated.slice(-10000);
                  const lastCandle = finalCandles[finalCandles.length - 1];
                  const lastCandleTime = lastCandle ? lastCandle.timestamp : null;
                  if ((cache as any).previousLastCandleTime && lastCandleTime && lastCandleTime !== (cache as any).previousLastCandleTime) {
                    if (aiEnabled && targetSettings.ai_trigger_mode === 'barra') {
                      addLog('IA', `[${targetPanel.name}] Novo candle fechado detectado (${lastCandleTime}). Disparando análise de IA...`, 'sistema');
                      executeAiCycleForPanel(targetPanel, targetSettings);
                    }
                  }
                  (cache as any).previousLastCandleTime = lastCandleTime;
                  cache.candles = finalCandles;
                  if (cache.marketData && lastCandle && lastCandle.timestamp === newCandle.timestamp) {
                    cache.marketData = { ...cache.marketData, price: String(cl) };
                  }
                  if (activePanelRef.current?.id === targetPanel.id) {
                    setCandles(finalCandles);
                  } else {
                    bumpPanelCacheVersion();
                  }
                  runMarketLogicForPanel(targetPanel, targetSettings, cache, cache.marketData, cache.forces, cache.gammaLevels);
                }
              }
            } else if (msg.type === 'strategy_report_closed' || msg.type === 'order_closed') {
              const payload = msg.data || msg;
              const closedId = payload.id || payload.report_id;
              const closedStatus = payload.status || 'Gain';
              const exitPrice = Number(payload.exit_price || payload.exitPrice || 0);
              const closedAt = payload.closed_at || new Date().toISOString();
              if (closedId) {
                reportsRef.current = (reportsRef.current || []).map(r =>
                  r.id === closedId ? { ...r, status: closedStatus, exit_price: exitPrice, closed_at: closedAt } : r
                );
                setReports(prev => prev.map(r =>
                  r.id === closedId ? { ...r, status: closedStatus, exit_price: exitPrice, closed_at: closedAt } : r
                ));
                fetchReportsList();
              }
            }
          } catch (_) {}
        };

        ws.onclose = () => {
          if (!isMounted) return;
          console.warn(`[WS HUB] ⚠️ Desconectado do Relay Hub. Reconectando em 3s...`);
          setWsHubConnected(false);
          reconnectTimeout = setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
          try { ws.close(); } catch (_) {}
        };
      } catch (err) {
        console.warn(`[WS HUB] Falha ao iniciar WebSocket:`, err);
        if (isMounted) reconnectTimeout = setTimeout(connectWs, 3000);
      }
    };

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsHubSocketRef.current) {
        try { wsHubSocketRef.current.close(); } catch (_) {}
        wsHubSocketRef.current = null;
      }
      setWsHubConnected(false);
    };
  }, [isAuthenticated, user, activePanel?.id, settings?.transmission_mode, settings?.websocket_hub_url]);

  // Sincronização periódica em segundo plano para manter sessões em sincronia (Relatórios e IA Ativa)
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    let syncCounter = 0;

    const syncSettingsAndReports = async () => {
      try {
        // Verifica se há operações em andamento no estado atual dos relatórios
        const hasActiveReports = (reportsRef.current || []).some(r => r.status === 'Em Andamento');

        // Se houver ordens em andamento, sincroniza a cada 5 segundos.
        // Se não houver, sincroniza a cada 30 segundos (1 vez a cada 6 ciclos) para poupar recursos.
        const shouldSyncReports = hasActiveReports || syncCounter % 6 === 0;

        if (shouldSyncReports) {
          await fetchReportsList(true); // silent = true
        }

        // 1.5 Sincronizar Contas e Regras de Espelhamento (Copy Trading) do Supabase a cada 30s
        // Garante que qualquer regra ou conta criada no PC Local apareça automaticamente no PC Remoto / Conexão Restrita e vice-versa
        // Nota: syncAllCopyRulesToNinjaTrader possui cache inteligente de payload e só dispara RPC caso haja alterações reais
        if (syncCounter % 6 === 0) {
          const syncedAccs = await refreshAccounts(false);
          await refreshCopyConfigs(syncedAccs);
          if (!isRestrictedSession) {
            await syncAllCopyRulesToNinjaTrader().catch(() => {});
          }
        }

        // 2. Atualizar configurações do painel ativo
        const targetPanel = activePanelRef.current || activePanel;
        if (targetPanel) {
          const { data: settingsData, error: settingsError } = await withDbTimeout(
            supabase
              .from('painelvm_settings')
              .select('*')
              .eq('panel_id', targetPanel.id)
              .single(),
            3000
          ).catch(() => ({ data: null, error: true }));

          if (!settingsError && settingsData && Date.now() - lastLocalSettingsSaveAtRef.current > 8000) {
            const enriched = enrichSettingsWithVirtualConfigs(settingsData);
            setSettings(enriched);
            syncStateFromSettings(enriched);
            
            setAllSettings(prev => {
              const prevStr = JSON.stringify(prev[targetPanel.id]);
              const nextStr = JSON.stringify(enriched);
              if (prevStr === nextStr) return prev;
              return { ...prev, [targetPanel.id]: enriched };
            });
          }
        }

        // 3. Buscar o intervalo global de atualização do admin de forma segura
        const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
        if (!isSystemAdmin && !rpcMarketIntervalFailedRef.current) {
          try {
            const { data: globalIntervalData, error: rpcError } = await supabase.rpc('get_admin_market_interval');
            if (rpcError) {
              if (rpcError.message?.includes('schema cache') || (rpcError as any).status === 404 || rpcError.code === 'PGRST202') {
                rpcMarketIntervalFailedRef.current = true;
              }
            } else if (globalIntervalData !== undefined && globalIntervalData !== null) {
              setGlobalMarketInterval(Number(globalIntervalData));
            }
          } catch (err) {
            console.warn('[CONTEXT] Erro ao sincronizar intervalo global de mercado do admin:', err);
          }
        }

        // 3.5 Atualizar configurações do admin para usuários normais
        if (!isSystemAdmin) {
          const didChange = await refreshAdminSettings();
          if (didChange) {
            console.log('[CONTEXT] Configurações do admin foram atualizadas no banco. Reiniciando timers...');
            setWakeTrigger(prev => prev + 1);
          }
        }

        // 4. Watchdog da conexão Realtime (Reconexão se estagnar >120s / 2 minutos para barras fechadas)
        const now = Date.now();
        if (now - lastRealtimeTickRef.current > 120000) {
          console.warn('[WATCHDOG] Dados em tempo real estagnados por >120s. Sincronizando ponta de mercado...');
          lastRealtimeTickRef.current = now;
          if (activePanel && panelDataCache.current[activePanel.id]) {
            // Sincroniza sem apagar o histórico de velas
            panelDataCache.current[activePanel.id].lastCandlesFetch = 0;
          }
        }

        // 5. Verificar encerramento automático de operações por horário (Apenas no minuto exato configurado)
        const activePanelSettings = settings;
        if (activePanelSettings && activePanelSettings.auto_cancel_open_ops_enabled === true) {
          const cancelTimeStr = activePanelSettings.auto_cancel_open_ops_time || '17:59:00';
          const nowSP = getSaoPauloDate();
          const pad = (n: number) => n.toString().padStart(2, '0');
          const currentTimeStr = `${pad(nowSP.getHours())}:${pad(nowSP.getMinutes())}:${pad(nowSP.getSeconds())}`;
          const currentMinuteStr = currentTimeStr.slice(0, 5);
          const targetMinuteStr = cancelTimeStr.slice(0, 5);

          if (currentMinuteStr === targetMinuteStr && lastAutoCancelTriggeredRef.current !== currentMinuteStr) {
            const openOpsCount = (reportsRef.current || []).filter(r => r.status === 'Em Andamento').length;
            if (openOpsCount > 0) {
              lastAutoCancelTriggeredRef.current = currentMinuteStr;
              cancelAllOpenOperationsAction();
              addLog('ALERTA', `⏰ Encerrando automaticamente todas as ${openOpsCount} operações abertas pelo horário configurado (${cancelTimeStr})`, 'alerta');
            }
          }
        }

        syncCounter++;
      } catch (err) {
        console.error('[CONTEXT] Erro na sincronização periódica de configurações e relatórios:', err);
      }
    };

    const interval = setInterval(syncSettingsAndReports, 5000);
    return () => clearInterval(interval);
  }, [isAuthenticated, user, activePanel]);

  // Sincronização segura após retorno de suspensão (apenas visibilitychange/online, sem focus de clique de mouse)
  useEffect(() => {
    let lastVisibilitySync = 0;

    const handleVisibilityChange = () => {
      const now = Date.now();
      // Throttling de 10s: só processa se a aba estava oculta e voltou a ficar visível
      if (document.visibilityState === 'visible' && (now - lastVisibilitySync > 10000)) {
        lastVisibilitySync = now;
        console.log('[CONTEXT] Aba visível pós-suspensão. Sincronizando relatórios.');
        setWakeTrigger(prev => prev + 1);
        fetchReportsList(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleVisibilityChange);
    };
  }, [fetchReportsList]);

  // =========================================================================
  // MOTOR EVENT-DRIVEN EM TEMPO REAL (< 1ms) VIA WEBSOCKET DO NINJATRADER 8 (:8002)
  // Desacopla a cotação e a proteção de ordens do timer de relógio (250ms/500ms)
  // =========================================================================
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let rafId: number | null = null;
    let pendingUiAction: (() => void) | null = null;

    const handleStreamerTick = (e: any) => {
      const detail = e.detail;
      if (!detail || !detail.price || detail.price <= 0) return;

      const sym = (detail.symbol || '').toUpperCase();
      const pan = (detail.panel || '').toUpperCase();
      const numPrice = Number(detail.price);

      // 1. Identificar o painel correspondente no cache
      const currentPanels = allPanelsRef.current || [];
      const matchedPanel = currentPanels.find((p: any) => {
        const pName = (p.name || p.id || '').toUpperCase();
        return (pan && pName.includes(pan)) || isMarketDataCompatibleWithPanel(p.name || p.id, sym);
      });

      if (!matchedPanel) return;

      const cache = panelDataCache.current[matchedPanel.id];
      if (!cache) return;

      // 2. Atualização imediata do cache de MarketData
      const mData: MarketData = {
        symbol: sym,
        price: String(numPrice),
        zScore: 0,
        atrRatio: 1.0,
        estado: 'ONLINE',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        sentiment: 50,
        originalSentiment: 50,
        delta: 0,
        deltaRatio: 1.0,
        buyVolume: 0,
        sellVolume: 0,
        printsPerSecond: 0,
        blockTrades: cache.marketData?.blockTrades || [],
        updated_at: detail.updated_at || new Date().toISOString()
      };
      cache.marketData = mData;

      // 3. Atualização imediata do candle em formação (<1ms)
      if (cache.candles && cache.candles.length > 0) {
        const { updatedCandles, hasChanged, isNewBar } = applyRealtimePriceToCandles(cache.candles, numPrice, detail.updated_at);
        if (hasChanged) {
          cache.candles = updatedCandles;
          const isActive = activePanelRef.current?.id === matchedPanel.id;
          if (isActive) {
            pendingUiAction = () => {
              setMarketData(mData);
              if (isNewBar) setCandles([...updatedCandles]);
            };
            if (!rafId) {
              rafId = requestAnimationFrame(() => {
                if (pendingUiAction) {
                  pendingUiAction();
                  pendingUiAction = null;
                }
                rafId = null;
              });
            }
          }
        }
      }

      // 4. Execução IMEDIATA de proteção de ordens (Stop Loss, Take Profit, Trailing Stop) no exato milissegundo do tick!
      const hasOpenOps = reportsRef.current.some(r => r.status === 'Em Andamento' && (
        r.panel_id === matchedPanel.id ||
        (!r.panel_id && r.instance_id && r.instance_id === matchedPanel.instance_id) ||
        (!r.panel_id && !r.instance_id && matchedPanel.id === 'default')
      ));

      if (hasOpenOps) {
        const pSettings = allSettingsRef.current[matchedPanel.id] || {};
        runMarketLogicForPanel(matchedPanel, pSettings, cache, mData, cache.forces || [], cache.gammaLevels || null);
      }
    };

    window.addEventListener('vortex_streamer_tick', handleStreamerTick);
    return () => {
      window.removeEventListener('vortex_streamer_tick', handleStreamerTick);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const [panelMode, setPanelModeState] = useState<'mode1' | 'mode2'>(() => {
    const saved = localStorage.getItem('vortex_panel_mode');
    return saved === 'mode2' ? 'mode2' : 'mode1';
  });

  const setPanelMode = (mode: 'mode1' | 'mode2') => {
    setPanelModeState(mode);
    localStorage.setItem('vortex_panel_mode', mode);
  };

  return (
    <AppContext.Provider value={{
      user,
      panel,
      settings,
      sessionId,
      isAuthenticated,
      isCheckingAuth,
      isRestrictedSession,
      planDetails,
      canAccessAlgorithmCreator,
      canAccessCopilotAI,
      canAccessCopyTrading,
      canAccessReplay,
      maxDemoAccounts,
      maxSyncAccounts,
      userPermissions,
      panelMode,
      setPanelMode,
      signIn,
      signUp,
      resetOrSetPassword,
      changePassword,
      logout,
      panels,
      activePanel,
      switchPanel,
      getPanelSnapshot,
      ensurePanelDataLoaded,
      ensurePanelHistoryDays,
      setVisibleMultiPanelIds,
      panelCacheVersion,
      accounts,
      setAccounts,
      activeAccount,
      setActiveAccount,
      switchAccount,
      refreshAccounts,
      deleteAccountAction,
      resetAccountAction,
      accountStrategies,
      setAccountStrategies,
      linkStrategyToAccount,
      unlinkStrategyFromAccount,
      refreshAccountStrategies,
      copyConfigs,
      setCopyConfigs,
      refreshCopyConfigs,
      remoteCopyConfigs,
      refreshRemoteCopyConfigs,
      marketData,
      getPanelPrice,
      forces,
      gammaLevels,
      optionsMarket,
      news,
      screenshot,
      candles,
      isCandlesLoading,
      candlesLoadingProgress,
      aiEnabled,
      isAnalyzing,
      aiResult,
      setAiEnabled,
      runManualAIAnalysis,
      askCopilotChatMessage,
      executeVoiceTradeCommand,
      isCopilotModalOpen,
      setIsCopilotModalOpen,
      prompts,
      isLoadingPrompts,
      fetchPromptsList,
      savePromptAction,
      deletePromptAction,
      customStrategies,
      publicStrategies,
      isLoadingStrategies,
      fetchStrategiesList,
      fetchPublicStrategiesList,
      saveStrategyAction,
      deleteStrategyAction,
      toggleStrategyActiveAction,
      atmStrategies,
      fetchAtmStrategiesList,
      pausedStrategyIds,
      toggleStrategyPause,
      customSignals,
      clearCustomSignals,
      createPanelAction,
      updatePanelAction,
      deletePanelAction,
      reports,
      isLoadingReports,
      fetchReportsList,
      createReportAction,
      updateReportAction,
      updateReportLevelsAction,
      deleteReportAction,
      deleteMultipleReportsAction,
      checkOperationalLimits,
      cancelAllOpenOperationsAction,
      isMarketDataStaleForPanel,
      generalAnalyses,
      isLoadingGeneralAnalyses,
      fetchGeneralAnalysesList,
      deleteGeneralAnalysisAction,
      executeGeneralPromptCycleForPanel,
      systemLogs,
      addLog,
      clearLogs,
      forcesConfig,
      toggleForceConfig,
      windowMinutes,
      setWindowMinutes: changeWindowMinutes,
      windowBaseline,
      setWindowBaseline,
      saveSettings,
      allSettings,
      refreshMarketData,
      authError,
      activeAlert,
      setActiveAlert,
      disarmAlert,
      updateNews,
      testTelegramMessage,
      showSma9,
      setShowSma9,
      showEma21,
      setShowEma21,
      showEma50,
      setShowEma50,
      showRsi,
      setShowRsi,
      showMacd,
      setShowMacd,
      showPva,
      setShowPva,
      showEMacd,
      setShowEMacd,
      showFvg,
      setShowFvg,
      wsHubConnected,
      ninjaGatewayOnline
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp deve ser usado dentro de um AppProvider');
  }
  return context;
};
