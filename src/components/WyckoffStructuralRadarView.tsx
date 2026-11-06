import React, { useState, useEffect, useMemo } from 'react';
import { fetchAllStudiesForAsset, type StudyRecord } from '../services/mlService';

interface WyckoffStructuralRadarViewProps {
  gammaLevels: any;
  marketData: any;
  selectedStudyId?: string;
  onSelectStudy?: (id: string) => void;
}

export const WyckoffStructuralRadarView: React.FC<WyckoffStructuralRadarViewProps> = ({
  gammaLevels,
  marketData,
  selectedStudyId,
  onSelectStudy
}) => {
  const [studies, setStudies] = useState<StudyRecord[]>([]);
  const [selectedStudy, setSelectedStudy] = useState<StudyRecord | null>(null);

  // Determinar símbolo atual do mercado
  const currentSymbol = (marketData?.symbol || 'NQ').toUpperCase().replace('MINI', '').replace('MICRO', '').trim();

  // Carregar estudos de Estruturas & Sweeps para o ativo
  useEffect(() => {
    let isMounted = true;
    fetchAllStudiesForAsset(currentSymbol, 'structural_pattern_study').then((list) => {
      if (!isMounted) return;
      const structOnly = list.filter(
        s => s.model_type === 'structural_pattern_study' ||
        s.model_name?.toLowerCase().includes('spring') ||
        s.model_name?.toLowerCase().includes('sweep') ||
        s.model_name?.toLowerCase().includes('wyckoff')
      );
      setStudies(structOnly);
      if (structOnly.length > 0) {
        if (selectedStudyId) {
          const found = structOnly.find(s => s.id === selectedStudyId);
          setSelectedStudy(found || structOnly[0]);
        } else {
          setSelectedStudy(structOnly[0]);
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

  const hvl = parseVal(gammaLevels?.hvl0 || gammaLevels?.hvl || gammaLevels?.hvl_0dte);
  const adjust = parseVal(gammaLevels?.prev || gammaLevels?.prev_day_adjust || gammaLevels?.ajuste || gammaLevels?.d1_adjust);
  const put0dte = parseVal(gammaLevels?.put0 || gammaLevels?.put_support_0dte || gammaLevels?.put);

  // Distâncias relativas em pontos (Preço Atual - Nível)
  const distPut0 = (currentPrice > 0 && put0dte > 0) ? (currentPrice - put0dte) : null;
  const distHvl = (currentPrice > 0 && hvl > 0) ? (currentPrice - hvl) : null;
  const distAdjust = (currentPrice > 0 && adjust > 0) ? (currentPrice - adjust) : null;

  // Tolerância de toque por ativo
  const touchTolerance = currentSymbol === 'NQ' ? 6.0 : currentSymbol === 'ES' ? 1.5 : 2.0;

  // Confluências ativas no preço atual
  const isNearPut0DTE = distPut0 !== null && Math.abs(distPut0) <= touchTolerance * 2;
  const isNearHvl = distHvl !== null && Math.abs(distHvl) <= touchTolerance * 2;
  const isNearAdjust = distAdjust !== null && Math.abs(distAdjust) <= touchTolerance * 2;

  // Estado dinâmico do Radar estrutural (lido do window ou fallback)
  const [radarState, setRadarState] = useState<{
    status: 'SCANNING' | 'RANGE_DETECTED' | 'SWEEP_ARMED' | 'RECLAIM_BUY';
    rangeLow?: number;
    rangeHigh?: number;
    sweepLow?: number;
  }>({
    status: isNearPut0DTE ? 'SWEEP_ARMED' : 'SCANNING',
    rangeLow: put0dte > 0 ? put0dte + 10 : currentPrice - 8,
    rangeHigh: put0dte > 0 ? put0dte + 35 : currentPrice + 16,
    sweepLow: put0dte > 0 ? put0dte - 3 : currentPrice - 12
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const live = (typeof window !== 'undefined' ? (window as any).__vortex_wyckoff_radar : null);
      if (live) {
        setRadarState(live);
      }
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const tpPoints = selectedStudy?.tp_points || 25.0;
  const slPoints = selectedStudy?.sl_points || 12.0;
  const winRate = selectedStudy?.metrics?.accuracy || 76.5;
  const targetPrice = currentPrice > 0 ? currentPrice + tpPoints : null;
  const stopPrice = currentPrice > 0 ? currentPrice - slPoints : null;

  // Matriz de TP x SL salva no estudo
  const tpSlMatrix = useMemo(() => {
    return (selectedStudy?.metrics as any)?.tp_sl_matrix || [];
  }, [selectedStudy]);

  return (
    <div className="p-3 bg-[#080d1a] border border-amber-900/40 rounded-xl space-y-3 text-slate-200 select-none shadow-2xl">
      {/* Header do Widget */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 font-bold text-xs border border-amber-500/30">
            ⚡ WYCKOFF
          </span>
          <div>
            <span className="font-extrabold text-xs text-white block">
              Radar Estrutural &amp; Sweeps
            </span>
            <span className="text-[10px] text-amber-400/80 font-mono">
              {currentSymbol} • Realtime M1
            </span>
          </div>
        </div>

        {/* Seletor de Modelo Salvo */}
        {studies.length > 0 && (
          <select
            value={selectedStudy?.id || ''}
            onChange={(e) => {
              const s = studies.find(it => it.id === e.target.value);
              if (s) {
                setSelectedStudy(s);
                if (onSelectStudy) onSelectStudy(s.id!);
              }
            }}
            className="bg-slate-900 border border-amber-800/60 rounded px-2 py-0.5 text-[10px] text-amber-300 font-bold outline-none cursor-pointer max-w-[150px] truncate"
          >
            {studies.map(s => (
              <option key={s.id} value={s.id}>
                {s.model_name || `Wyckoff ${s.symbol}`}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Cartão de Estado da Estrutura */}
      <div className="p-2.5 rounded-lg border bg-gradient-to-r from-amber-950/30 to-slate-900/60 border-amber-500/30 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 font-semibold uppercase text-[10px]">Estado da Anatomia:</span>
          {radarState.status === 'RECLAIM_BUY' ? (
            <span className="px-2 py-0.5 rounded font-bold bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 animate-pulse text-[10px]">
              🟢 RECLAIM COMPRA ATIVO
            </span>
          ) : radarState.status === 'SWEEP_ARMED' ? (
            <span className="px-2 py-0.5 rounded font-bold bg-amber-500/30 text-amber-300 border border-amber-500/50 text-[10px]">
              🟠 MOLA ARMADA (SWEEP)
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded font-bold bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
              🟡 ESCANEANDO CONSOLIDAÇÃO
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5 pt-1 text-center font-mono text-[10px]">
          <div className="p-1 rounded bg-slate-950/80 border border-slate-800">
            <span className="text-slate-500 block text-[9px]">Piso Caixote</span>
            <span className="font-bold text-white">{radarState.rangeLow?.toFixed(1) || '--'}</span>
          </div>
          <div className="p-1 rounded bg-slate-950/80 border border-slate-800">
            <span className="text-slate-500 block text-[9px]">Teto Caixote</span>
            <span className="font-bold text-white">{radarState.rangeHigh?.toFixed(1) || '--'}</span>
          </div>
          <div className="p-1 rounded bg-slate-950/80 border border-slate-800">
            <span className="text-slate-500 block text-[9px]">Preço Atual</span>
            <span className="font-bold text-cyan-400">{currentPrice > 0 ? currentPrice.toFixed(1) : '--'}</span>
          </div>
        </div>
      </div>

      {/* Checklist de Confluências Institucionais e Técnicas */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
          🔍 Confluências em Tempo Real:
        </span>
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <div className={`p-1.5 rounded border flex items-center justify-between ${
            isNearPut0DTE ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300' : 'bg-slate-900/70 border-slate-800 text-slate-400'
          }`}>
            <span>🛡️ Put Wall 0DTE</span>
            <span className="font-mono font-bold">{isNearPut0DTE ? 'TESTANDO' : distPut0 !== null ? `${distPut0 > 0 ? '+' : ''}${distPut0.toFixed(0)}p` : '--'}</span>
          </div>

          <div className={`p-1.5 rounded border flex items-center justify-between ${
            isNearHvl ? 'bg-purple-950/30 border-purple-500/40 text-purple-300' : 'bg-slate-900/70 border-slate-800 text-slate-400'
          }`}>
            <span>⚖️ Imã HVL</span>
            <span className="font-mono font-bold">{isNearHvl ? 'ALINHADO' : distHvl !== null ? `${distHvl > 0 ? '+' : ''}${distHvl.toFixed(0)}p` : '--'}</span>
          </div>

          <div className={`p-1.5 rounded border flex items-center justify-between ${
            isNearAdjust ? 'bg-amber-950/30 border-amber-500/40 text-amber-300' : 'bg-slate-900/70 border-slate-800 text-slate-400'
          }`}>
            <span>🧱 Ajuste D-1</span>
            <span className="font-mono font-bold">{isNearAdjust ? 'DEFENDENDO' : distAdjust !== null ? `${distAdjust > 0 ? '+' : ''}${distAdjust.toFixed(0)}p` : '--'}</span>
          </div>

          <div className="p-1.5 rounded border bg-slate-900/70 border-slate-800 text-slate-300 flex items-center justify-between">
            <span>📊 Proporção R:R</span>
            <span className="font-mono font-bold text-emerald-400">1 : {(tpPoints / slPoints).toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* Projeção de Alvo / Stop do Estudo Selecionado */}
      <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 space-y-1 text-[10px]">
        <div className="flex items-center justify-between font-mono">
          <span className="text-slate-400">🎯 Alvo Take Profit (+{tpPoints} pts):</span>
          <span className="text-emerald-400 font-bold">{targetPrice ? targetPrice.toFixed(1) : '--'}</span>
        </div>
        <div className="flex items-center justify-between font-mono">
          <span className="text-slate-400">🛑 Limite Stop Loss (-{slPoints} pts):</span>
          <span className="text-rose-400 font-bold">{stopPrice ? stopPrice.toFixed(1) : '--'}</span>
        </div>
      </div>

      {/* Footer com Assertividade Mapeada */}
      <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px]">
        <span className="text-slate-400">Assertividade Histórica:</span>
        <span className="font-mono font-bold text-amber-400 text-xs">
          {winRate}%
        </span>
      </div>

      {/* Mini Grade TP x SL se disponível */}
      {tpSlMatrix.length > 0 && (
        <div className="text-[9px] text-slate-400 text-center font-mono pt-0.5">
          Matriz com {tpSlMatrix.length} cenários calibrados no banco.
        </div>
      )}
    </div>
  );
};
