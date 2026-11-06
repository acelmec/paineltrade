import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchStudiesRegistry,
  fetchAllStudiesForAsset,
  deleteStudyFromSupabase,
  fetchAssetRange,
  fetchMLSchedule,
  fetchMLRunStatus,
  triggerMLRetest,
  type StudyRecord,
  type AssetRangeInfo,
  type MLScheduleConfig,
  type TestConfigFlags
} from '../services/mlService';
import { runClientSideGammaQuantStudy } from '../services/gammaQuantService';
import { runClientSideStructuralStudy } from '../services/structuralPatternQuantService';

const AVAILABLE_ASSETS = [
  { symbol: 'NQ', name: 'NASDAQ 100 Future (NQ)' },
  { symbol: 'ES', name: 'S&P 500 Future (ES)' },
  { symbol: 'GC', name: 'Ouro / Gold Future (GC)' },
  { symbol: 'YM', name: 'Dow Jones Future (YM)' },
  { symbol: 'CL', name: 'Petróleo WTI (CL)' }
];

export const PatternMLSettings: React.FC = () => {
  // Aba Ativa: 100% Separadas e Independentes
  const [activeTab, setActiveTab] = useState<'neural_network' | 'gamma_quant' | 'structural_study'>('structural_study');

  const [selectedSymbol, setSelectedSymbol] = useState<string>('NQ');
  const [, setStudies] = useState<Record<string, StudyRecord>>({});
  const [rangeInfo, setRangeInfo] = useState<AssetRangeInfo | null>(null);
  const [isLoadingRange, setIsLoadingRange] = useState<boolean>(false);
  const [isRunningRetest, setIsRunningRetest] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // ABA 1: Parâmetros Estudo Quantitativo Gamma
  const [gammaModelName, setGammaModelName] = useState<string>('Gamma Quant Map NQ (+25/-12)');
  const [gammaTpPoints, setGammaTpPoints] = useState<number>(25.0);
  const [gammaSlPoints, setGammaSlPoints] = useState<number>(12.0);
  const [dateRangeMode, setDateRangeMode] = useState<'all' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Flags específicas do Estudo de Gamma
  const [gammaFlags, setGammaFlags] = useState({
    analyze_0dte_walls: true,
    analyze_hvl_adjust: true,
    analyze_gex_bl_concreto: true,
    stratify_sessions: true
  });

  // ABA 2: Parâmetros Rede Neural TensorFlow (Candles M1)
  const [nnModelName, setNnModelName] = useState<string>('Axion NQ Scalper (+25/-12)');
  const [nnTpPoints, setNnTpPoints] = useState<number>(25.0);
  const [nnSlPoints, setNnSlPoints] = useState<number>(12.0);
  const [epochs, setEpochs] = useState<number>(10);
  const [fetchFromDb, setFetchFromDb] = useState<boolean>(true);
  const [testFlags, setTestFlags] = useState<TestConfigFlags>({
    use_candle_patterns: true,
    use_levels: true,
    use_gamma_levels: true,
    use_rsi: true,
    use_atr: true,
    use_macd: true,
    use_moving_averages: true,
    use_volume: true
  });

  // ABA 3: Modelagem Estrutural & Confluências (Wyckoff Spring / Liquidity Sweep)
  const [structModelName, setStructModelName] = useState<string>('Wyckoff Spring & Sweeps NQ (+25/-12)');
  const [structTpPoints, setStructTpPoints] = useState<number>(25.0);
  const [structSlPoints, setStructSlPoints] = useState<number>(12.0);
  const [structDateRangeMode, setStructDateRangeMode] = useState<'all' | 'custom'>('all');
  const [structCustomStartDate, setStructCustomStartDate] = useState<string>('');
  const [structCustomEndDate, setStructCustomEndDate] = useState<string>('');

  const [structConfig, setStructConfig] = useState({
    min_range_candles: 8,
    max_range_candles: 25,
    max_range_atr_mult: 2.5,
    sweep_min_pts: 3.0,
    sweep_max_pts: 30.0,
    require_reclaim: true
  });

  const [structInstFlags, setStructInstFlags] = useState({
    use_0dte_walls: true,
    use_gbl_gravity: true,
    use_gex_bl_concreto: true
  });

  const [structTechFlags, setStructTechFlags] = useState({
    use_rsi: true,
    use_macd: true,
    use_atr: true,
    use_measured_move: true
  });

  // Lista de modelos e estudos salvos
  const [assetModelsList, setAssetModelsList] = useState<StudyRecord[]>([]);
  const [isLoadingModelsList, setIsLoadingModelsList] = useState<boolean>(false);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [viewingMatrixStudy, setViewingMatrixStudy] = useState<StudyRecord | null>(null);

  // Agendamento State
  const [, setScheduleConfig] = useState<MLScheduleConfig>({
    enabled: false,
    time: '18:15',
    assets: ['NQ', 'ES', 'GC'],
    last_executed_date: undefined
  });

  // Carregar Estudos e Agendamento
  const loadAllData = useCallback(async () => {
    try {
      const [allStudies, sched] = await Promise.all([
        fetchStudiesRegistry(),
        fetchMLSchedule()
      ]);
      setStudies(allStudies);
      setScheduleConfig(sched);
    } catch (e) {
      console.error('[MLSettings] Erro ao carregar dados:', e);
    }
  }, []);

  const loadRange = useCallback(async (sym: string) => {
    setIsLoadingRange(true);
    try {
      const r = await fetchAssetRange(sym);
      setRangeInfo(r);
    } catch (e) {
      setRangeInfo(null);
    } finally {
      setIsLoadingRange(false);
    }
  }, []);

  const loadAssetModels = useCallback(async (sym: string) => {
    setIsLoadingModelsList(true);
    try {
      const list = await fetchAllStudiesForAsset(sym);
      setAssetModelsList(list);
    } catch (e) {
      setAssetModelsList([]);
    } finally {
      setIsLoadingModelsList(false);
    }
  }, []);

  const handleSelectSymbol = (sym: string) => {
    setSelectedSymbol(sym);
    setNnModelName(`Axion ${sym} Scalper (+${nnTpPoints}/-${nnSlPoints})`);
    setGammaModelName(`Gamma Quant Map ${sym} (+${gammaTpPoints}/-${gammaSlPoints})`);
    setStructModelName(`Wyckoff Spring & Sweeps ${sym} (+${structTpPoints}/-${structSlPoints})`);
    if (sym === 'ES' || sym === 'GC') {
      setStructConfig(c => ({ ...c, sweep_min_pts: 1.0, sweep_max_pts: 8.0 }));
    } else {
      setStructConfig(c => ({ ...c, sweep_min_pts: 3.0, sweep_max_pts: 30.0 }));
    }
    loadRange(sym);
    loadAssetModels(sym);
  };

  useEffect(() => {
    loadAllData();
    loadRange(selectedSymbol);
    loadAssetModels(selectedSymbol);
  }, [loadAllData, loadRange, loadAssetModels, selectedSymbol]);

  // Execução Manual da Modelagem
  const handleRunManualRetest = async () => {
    if (isRunningRetest) return;
    setIsRunningRetest(true);

    if (activeTab === 'gamma_quant') {
      setStatusMessage({ text: `Processando Estudo de Padrões Gamma para ${selectedSymbol} [TP: ${gammaTpPoints} / SL: ${gammaSlPoints}] diretamente no Supabase...`, type: 'info' });
      try {
        const res = await runClientSideGammaQuantStudy({
          symbol: selectedSymbol,
          tp_points: Number(gammaTpPoints),
          sl_points: Number(gammaSlPoints),
          model_name: gammaModelName.trim() || `Gamma Quant Map ${selectedSymbol} (+${gammaTpPoints}/-${gammaSlPoints})`,
          start_date: dateRangeMode === 'custom' && customStartDate ? customStartDate : undefined,
          end_date: dateRangeMode === 'custom' && customEndDate ? customEndDate : undefined,
          flags: gammaFlags
        }, (progMsg) => {
          setStatusMessage({ text: progMsg, type: 'info' });
        });

        if (res.success) {
          setStatusMessage({ text: res.message, type: 'success' });
          if ((res as any).study) {
            const newStudy = (res as any).study;
            setAssetModelsList(prev => [newStudy, ...prev.filter(m => m.id !== newStudy.id)]);
          }
          loadAssetModels(selectedSymbol);
        } else {
          setStatusMessage({ text: res.message, type: 'error' });
        }
      } catch (err: any) {
        setStatusMessage({ text: `Erro ao processar: ${err.message}`, type: 'error' });
      } finally {
        setIsRunningRetest(false);
      }
    } else if (activeTab === 'structural_study') {
      setStatusMessage({ text: `Processando Modelagem Estrutural & Confluências para ${selectedSymbol} [TP: ${structTpPoints} / SL: ${structSlPoints}]...`, type: 'info' });
      try {
        const res = await runClientSideStructuralStudy({
          symbol: selectedSymbol,
          tp_points: Number(structTpPoints),
          sl_points: Number(structSlPoints),
          model_name: structModelName.trim() || `Wyckoff Spring & Sweeps ${selectedSymbol} (+${structTpPoints}/-${structSlPoints})`,
          start_date: structDateRangeMode === 'custom' && structCustomStartDate ? structCustomStartDate : undefined,
          end_date: structDateRangeMode === 'custom' && structCustomEndDate ? structCustomEndDate : undefined,
          structure_config: structConfig,
          institutional_flags: structInstFlags,
          technical_flags: structTechFlags
        }, (progMsg) => {
          setStatusMessage({ text: progMsg, type: 'info' });
        });

        if (res.success) {
          setStatusMessage({ text: res.message, type: 'success' });
          if ((res as any).study) {
            const newStudy = (res as any).study;
            setAssetModelsList(prev => [newStudy, ...prev.filter(m => m.id !== newStudy.id)]);
          }
          loadAssetModels(selectedSymbol);
        } else {
          setStatusMessage({ text: res.message, type: 'error' });
        }
      } catch (err: any) {
        setStatusMessage({ text: `Erro ao processar modelagem: ${err.message}`, type: 'error' });
      } finally {
        setIsRunningRetest(false);
      }
    } else {
      setStatusMessage({ text: `Iniciando Treinamento da Rede Neural TensorFlow para ${selectedSymbol} [TP: ${nnTpPoints} pts / SL: ${nnSlPoints} pts]...`, type: 'info' });
      const res = await triggerMLRetest({
        symbol: selectedSymbol,
        epochs,
        fetch_db: fetchFromDb,
        config: testFlags,
        model_name: nnModelName.trim() || `Axion ${selectedSymbol} (+${nnTpPoints}/-${nnSlPoints})`,
        tp_points: Number(nnTpPoints),
        sl_points: Number(nnSlPoints),
        study_type: 'tensorflow_patterns'
      });

      if (!res.success) {
        setIsRunningRetest(false);
        setStatusMessage({ text: res.message, type: 'error' });
      } else {
        setStatusMessage({ text: `Treinamento da Rede Neural em execução no servidor para ${selectedSymbol}. Acompanhe os resultados na tabela abaixo.`, type: 'info' });
      }
    }
  };

  // Monitorar status de execução
  useEffect(() => {
    if (!isRunningRetest) return;
    const timer = setInterval(async () => {
      try {
        const st = await fetchMLRunStatus();
        if (!st.is_running) {
          setIsRunningRetest(false);
          if (st.last_error) {
            setStatusMessage({ text: `Erro na execução: ${st.last_error}`, type: 'error' });
          } else {
            setStatusMessage({ text: `Estudo finalizado com sucesso! Novos modelos registrados.`, type: 'success' });
            loadAllData();
            loadRange(selectedSymbol);
            loadAssetModels(selectedSymbol);
          }
        }
      } catch (e) {}
    }, 2500);

    return () => clearInterval(timer);
  }, [isRunningRetest, loadAllData, loadRange, loadAssetModels, selectedSymbol]);

  // Excluir Modelo
  const handleDeleteModel = async (id?: string, name?: string) => {
    if (!id) return;
    if (!window.confirm(`Tem certeza que deseja remover o estudo "${name || id}"?`)) return;

    // 1. Atualização Otimista Imediata na UI (0ms de espera visual)
    setAssetModelsList(prev => prev.filter(m => m.id !== id));
    setDeletingModelId(id);
    try {
      const ok = await deleteStudyFromSupabase(id);
      if (ok) {
        setStatusMessage({ text: `Estudo "${name || id}" excluído com sucesso!`, type: 'success' });
      } else {
        // Fallback em caso de erro na nuvem
        loadAssetModels(selectedSymbol);
      }
    } catch (err: any) {
      setStatusMessage({ text: `Erro ao excluir: ${err.message}`, type: 'error' });
      loadAssetModels(selectedSymbol);
    } finally {
      setDeletingModelId(null);
    }
  };

  // Separar listas de modelos estritamente por metodologia
  const gammaModels = useMemo(() => {
    return assetModelsList.filter(m => m.model_type === 'gamma_quant_study' || m.model_name?.toLowerCase().includes('gamma'));
  }, [assetModelsList]);

  const structuralModels = useMemo(() => {
    return assetModelsList.filter(m =>
      m.model_type === 'structural_pattern_study' ||
      m.model_name?.toLowerCase().includes('spring') ||
      m.model_name?.toLowerCase().includes('sweep') ||
      m.model_name?.toLowerCase().includes('wyckoff')
    );
  }, [assetModelsList]);

  const nnModels = useMemo(() => {
    return assetModelsList.filter(m =>
      m.model_type !== 'gamma_quant_study' &&
      m.model_type !== 'structural_pattern_study' &&
      !m.model_name?.toLowerCase().includes('gamma') &&
      !m.model_name?.toLowerCase().includes('spring') &&
      !m.model_name?.toLowerCase().includes('sweep') &&
      !m.model_name?.toLowerCase().includes('wyckoff')
    );
  }, [assetModelsList]);

  const filteredModels = activeTab === 'gamma_quant'
    ? gammaModels
    : activeTab === 'structural_study'
    ? structuralModels
    : nnModels;

  return (
    <div className="space-y-6 text-slate-200">
      {/* Header com Navegação por Abas Independentes */}
      <div className="bg-slate-800/80 p-5 rounded-xl border border-slate-700 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🔬 Central de Estudos Quantitativos &amp; Modelagens</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Escolha a metodologia desejada abaixo. As configurações e filtros são 100% isolados para evitar qualquer conflito.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { loadAllData(); loadRange(selectedSymbol); loadAssetModels(selectedSymbol); }}
              className="px-3 py-1.5 bg-slate-700/80 hover:bg-slate-600 text-slate-200 text-xs rounded-lg border border-slate-600 transition flex items-center gap-1.5 cursor-pointer"
            >
              🔄 Atualizar Dados
            </button>
          </div>
        </div>

        {/* BARRAS DE ABAS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-700/80">
          {/* ABA 1: Gamma */}
          <button
            type="button"
            onClick={() => setActiveTab('gamma_quant')}
            className={`p-3 rounded-xl border text-left transition cursor-pointer ${
              activeTab === 'gamma_quant'
                ? 'bg-purple-950/70 border-purple-500 text-white shadow-lg shadow-purple-950/50'
                : 'bg-slate-900/60 border-slate-700/70 text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-sm flex items-center gap-2">
                <span>🗺️ ABA 1: Padrões Gamma &amp; Sessões</span>
              </span>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                activeTab === 'gamma_quant' ? 'bg-purple-500/30 text-purple-200' : 'bg-slate-800 text-slate-400'
              }`}>
                {gammaModels.length} ESTUDOS
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Blocos institucionais (HVL, Ajuste, 0DTE, GEX/BL) e comportamento nas 4 sessões do dia.
            </p>
          </button>

          {/* ABA 2: TensorFlow */}
          <button
            type="button"
            onClick={() => setActiveTab('neural_network')}
            className={`p-3 rounded-xl border text-left transition cursor-pointer ${
              activeTab === 'neural_network'
                ? 'bg-cyan-950/70 border-cyan-500 text-white shadow-lg shadow-cyan-950/50'
                : 'bg-slate-900/60 border-slate-700/70 text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-sm flex items-center gap-2">
                <span>🧠 ABA 2: Rede Neural TensorFlow (M1)</span>
              </span>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                activeTab === 'neural_network' ? 'bg-cyan-500/30 text-cyan-200' : 'bg-slate-800 text-slate-400'
              }`}>
                {nnModels.length} MODELOS
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Classificação profunda de candles de 1m, padrões de price action e Triple Barrier Method.
            </p>
          </button>

          {/* ABA 3: Modelagem Estrutural & Confluências */}
          <button
            type="button"
            onClick={() => setActiveTab('structural_study')}
            className={`p-3 rounded-xl border text-left transition cursor-pointer ${
              activeTab === 'structural_study'
                ? 'bg-amber-950/70 border-amber-500 text-white shadow-lg shadow-amber-950/50'
                : 'bg-slate-900/60 border-slate-700/70 text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-sm flex items-center gap-2">
                <span>⚡ ABA 3: Estruturas &amp; Confluências (Wyckoff/Sweep)</span>
              </span>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                activeTab === 'structural_study' ? 'bg-amber-500/30 text-amber-200' : 'bg-slate-800 text-slate-400'
              }`}>
                {structuralModels.length} MODELOS
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Caixote + Falso Rompimento (Spring) com filtros de confluência 0DTE, GBL, GEX 8-10, RSI e MACD.
            </p>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className={`p-3.5 rounded-lg text-xs font-semibold border flex items-center justify-between ${
          statusMessage.type === 'success' ? 'bg-green-500/10 border-green-500/40 text-green-300' :
          statusMessage.type === 'error' ? 'bg-red-500/10 border-red-500/40 text-red-300' :
          'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
        }`}>
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white ml-2 text-sm">✕</button>
        </div>
      )}

      {/* Seletor do Ativo em Estudo */}
      <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap">
            🎯 Ativo Selecionado:
          </label>
          <select
            value={selectedSymbol}
            onChange={(e) => handleSelectSymbol(e.target.value)}
            disabled={isRunningRetest}
            className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-cyan-300 font-bold outline-none cursor-pointer"
          >
            {AVAILABLE_ASSETS.map(asset => (
              <option key={asset.symbol} value={asset.symbol}>
                {asset.name}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
          <span>Total Candles M1: <strong className="text-white">{isLoadingRange ? 'Carregando...' : (rangeInfo?.total_candles ? rangeInfo.total_candles.toLocaleString('pt-BR') : '--')}</strong></span>
          <span>•</span>
          <span>Período: <strong className="text-slate-300">{isLoadingRange ? '...' : (rangeInfo?.data_start ? `${new Date(rangeInfo.data_start).toLocaleDateString('pt-BR')} até ${new Date(rangeInfo.data_end).toLocaleDateString('pt-BR')}` : '--')}</strong></span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CONTEÚDO DA ABA 1: ESTUDO QUANTITATIVO DE GAMMA (LIMPO, SEM FILTROS DE M1) */}
      {/* ========================================================================= */}
      {activeTab === 'gamma_quant' && (
        <div className="space-y-5 animate-fadeIn">
          {/* Caixa de Configuração de Parâmetros Gamma */}
          <div className="bg-gradient-to-r from-purple-950/40 via-slate-900 to-purple-950/40 p-5 rounded-xl border border-purple-500/40 shadow-xl space-y-4">
            <div className="border-b border-purple-800/40 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-purple-200 flex items-center gap-2">
                  <span>🗺️ Configuração do Estudo de Padrões Gamma ({selectedSymbol})</span>
                  <span className="text-[10px] bg-purple-500/30 text-purple-200 px-2 py-0.5 rounded font-mono font-bold">
                    BASE DE NÍVEIS
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Este estudo avalia as distâncias pontuais entre Ajuste, HVL, 0DTE Walls e Malhas de GEX/BL em relação ao preço nas 4 sessões temporais.
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase">Alvo : Risco</span>
                <span className="font-mono text-xs font-bold text-emerald-400">
                  {gammaSlPoints > 0 ? `1 : ${(gammaTpPoints / gammaSlPoints).toFixed(2)} (${(gammaTpPoints / gammaSlPoints).toFixed(1)}x)` : '--'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              {/* Nome do Estudo */}
              <div className="bg-slate-900/90 p-3.5 rounded-lg border border-purple-700/50 space-y-1">
                <label className="text-[11px] font-bold text-purple-300 uppercase tracking-wider block">
                  🏷️ Identificação / Nome do Estudo
                </label>
                <input
                  type="text"
                  value={gammaModelName}
                  onChange={(e) => setGammaModelName(e.target.value)}
                  placeholder={`Ex: Gamma Quant Map ${selectedSymbol} (+${gammaTpPoints}/-${gammaSlPoints})`}
                  disabled={isRunningRetest}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-semibold outline-none focus:border-purple-400"
                />
                <span className="text-[10px] text-slate-400 block pt-0.5">Nome exibido no seletor do widget do gráfico</span>
              </div>

              {/* Take Profit */}
              <div className="bg-slate-900/90 p-3.5 rounded-lg border border-emerald-500/40 space-y-1">
                <label className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider block flex items-center justify-between">
                  <span>🎯 Take Profit Esperado</span>
                  <span className="font-mono text-emerald-400 font-bold">+{gammaTpPoints} pts</span>
                </label>
                <input
                  type="number"
                  step={0.5}
                  value={gammaTpPoints}
                  onChange={(e) => setGammaTpPoints(Math.max(0.1, parseFloat(e.target.value) || 0))}
                  disabled={isRunningRetest}
                  className="w-full bg-slate-950 border border-emerald-500/50 rounded px-3 py-1.5 text-sm text-emerald-300 font-mono font-bold outline-none"
                />
                <span className="text-[10px] text-slate-400 block pt-0.5">Alvo de pontos para medir a assertividade dos arquétipos</span>
              </div>

              {/* Stop Loss */}
              <div className="bg-slate-900/90 p-3.5 rounded-lg border border-rose-500/40 space-y-1">
                <label className="text-[11px] font-bold text-rose-300 uppercase tracking-wider block flex items-center justify-between">
                  <span>🛑 Stop Loss Limite</span>
                  <span className="font-mono text-rose-400 font-bold">-{gammaSlPoints} pts</span>
                </label>
                <input
                  type="number"
                  step={0.5}
                  value={gammaSlPoints}
                  onChange={(e) => setGammaSlPoints(Math.max(0.1, parseFloat(e.target.value) || 0))}
                  disabled={isRunningRetest}
                  className="w-full bg-slate-950 border border-rose-500/50 rounded px-3 py-1.5 text-sm text-rose-300 font-mono font-bold outline-none"
                />
                <span className="text-[10px] text-slate-400 block pt-0.5">Limite de perda tolerado na invalidação do nível</span>
              </div>
            </div>

            {/* Filtro de Período Histórico para o Gamma */}
            <div className="bg-slate-900/90 p-3.5 rounded-lg border border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  📅 Período de Análise Histórica dos Níveis Gamma
                </span>
                <div className="flex items-center gap-2 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setDateRangeMode('all')}
                    className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                      dateRangeMode === 'all'
                        ? 'bg-purple-600/50 text-purple-200 border border-purple-500'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Base Completa
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateRangeMode('custom')}
                    className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                      dateRangeMode === 'custom'
                        ? 'bg-purple-600/50 text-purple-200 border border-purple-500'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Intervalo de Datas
                  </button>
                </div>
              </div>

              {dateRangeMode === 'all' ? (
                <div className="p-2.5 bg-slate-950/60 rounded border border-slate-800 text-[11px] text-slate-400">
                  Processando todos os registros históricos disponíveis do ativo na tabela <code>gamma_levels</code>.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-0.5">Data Inicial:</span>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-0.5">Data Final:</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Filtros Estruturais de Gamma */}
            <div className="space-y-2 pt-1">
              <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wider block">
                🧱 Dimensões e Filtros Estruturais Inclusos no Estudo:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <label className="p-2.5 rounded-lg bg-slate-900/80 border border-purple-800/40 flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gammaFlags.analyze_0dte_walls}
                    onChange={(e) => setGammaFlags(p => ({ ...p, analyze_0dte_walls: e.target.checked }))}
                    className="mt-0.5 rounded text-purple-500"
                  />
                  <div>
                    <strong className="block text-purple-200 text-[11px]">Paredões 0DTE</strong>
                    <span className="text-[10px] text-slate-400">Put 0DTE &amp; Call 0DTE e compressão de spread</span>
                  </div>
                </label>

                <label className="p-2.5 rounded-lg bg-slate-900/80 border border-purple-800/40 flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gammaFlags.analyze_hvl_adjust}
                    onChange={(e) => setGammaFlags(p => ({ ...p, analyze_hvl_adjust: e.target.checked }))}
                    className="mt-0.5 rounded text-purple-500"
                  />
                  <div>
                    <strong className="block text-purple-200 text-[11px]">Gravidade HVL vs Ajuste</strong>
                    <span className="text-[10px] text-slate-400">Atração ao centro de liquidez institucional</span>
                  </div>
                </label>

                <label className="p-2.5 rounded-lg bg-slate-900/80 border border-purple-800/40 flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gammaFlags.analyze_gex_bl_concreto}
                    onChange={(e) => setGammaFlags(p => ({ ...p, analyze_gex_bl_concreto: e.target.checked }))}
                    className="mt-0.5 rounded text-purple-500"
                  />
                  <div>
                    <strong className="block text-purple-200 text-[11px]">Malhas GEX &amp; BL 8-10</strong>
                    <span className="text-[10px] text-slate-400">Zonas de concreto e exaustão contra a tendência</span>
                  </div>
                </label>

                <label className="p-2.5 rounded-lg bg-slate-900/80 border border-purple-800/40 flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gammaFlags.stratify_sessions}
                    onChange={(e) => setGammaFlags(p => ({ ...p, stratify_sessions: e.target.checked }))}
                    className="mt-0.5 rounded text-purple-500"
                  />
                  <div>
                    <strong className="block text-purple-200 text-[11px]">Estratificação por Sessões</strong>
                    <span className="text-[10px] text-slate-400">Ásia, Europa, Pré-Mercado e Abertura NY</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Botão de Disparo do Estudo Gamma */}
            <div className="pt-3 border-t border-purple-800/40 flex justify-end">
              <button
                type="button"
                onClick={handleRunManualRetest}
                disabled={isRunningRetest}
                className={`px-6 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-lg cursor-pointer ${
                  isRunningRetest
                    ? 'bg-purple-900/60 text-purple-300 border border-purple-500/40 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-500/20 active:scale-95'
                }`}
              >
                {isRunningRetest ? (
                  <>
                    <span className="animate-spin text-sm">⏳</span>
                    <span>Processando Estudo Quantitativo de Gamma...</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>Rodar Estudo de Padrões Gamma Agora</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONTEÚDO DA ABA 2: REDE NEURAL TENSORFLOW (CANDLES M1 E FILTROS TÉCNICOS) */}
      {/* ========================================================================= */}
      {activeTab === 'neural_network' && (
        <div className="space-y-5 animate-fadeIn">
          {/* Caixa de Ajuste de Targets da Rede Neural */}
          <div className="bg-gradient-to-r from-cyan-950/40 via-slate-900 to-cyan-950/40 p-5 rounded-xl border border-cyan-500/40 shadow-xl space-y-4">
            <div className="border-b border-cyan-800/40 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-cyan-200 flex items-center gap-2">
                  <span>🧠 Treinamento da Rede Neural TensorFlow ({selectedSymbol})</span>
                  <span className="text-[10px] bg-cyan-500/30 text-cyan-200 px-2 py-0.5 rounded font-mono font-bold">
                    CANDLES 1 MINUTO
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Treina o modelo LightGBM / Deep Learning sobre candles de 1m para identificar padrões direcionais de curto prazo com Triple Barrier Method.
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase">Alvo : Risco</span>
                <span className="font-mono text-xs font-bold text-emerald-400">
                  {nnSlPoints > 0 ? `1 : ${(nnTpPoints / nnSlPoints).toFixed(2)} (${(nnTpPoints / nnSlPoints).toFixed(1)}x)` : '--'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              {/* Nome do Modelo */}
              <div className="bg-slate-900/90 p-3.5 rounded-lg border border-cyan-700/50 space-y-1">
                <label className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider block">
                  🏷️ Identificação / Nome da Modelagem
                </label>
                <input
                  type="text"
                  value={nnModelName}
                  onChange={(e) => setNnModelName(e.target.value)}
                  placeholder={`Ex: Axion ${selectedSymbol} Scalper 25/12`}
                  disabled={isRunningRetest}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-semibold outline-none focus:border-cyan-400"
                />
                <span className="text-[10px] text-slate-400 block pt-0.5">Nome exibido nos parâmetros do Radar Axion ML</span>
              </div>

              {/* Take Profit */}
              <div className="bg-slate-900/90 p-3.5 rounded-lg border border-emerald-500/40 space-y-1">
                <label className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider block flex items-center justify-between">
                  <span>🎯 Take Profit (Alvo em Pontos)</span>
                  <span className="font-mono text-emerald-400 font-bold">+{nnTpPoints} pts</span>
                </label>
                <input
                  type="number"
                  step={0.5}
                  value={nnTpPoints}
                  onChange={(e) => setNnTpPoints(Math.max(0.1, parseFloat(e.target.value) || 0))}
                  disabled={isRunningRetest}
                  className="w-full bg-slate-950 border border-emerald-500/50 rounded px-3 py-1.5 text-sm text-emerald-300 font-mono font-bold outline-none"
                />
                <span className="text-[10px] text-slate-400 block pt-0.5">Distância que a vela deve atingir para ser VITÓRIA</span>
              </div>

              {/* Stop Loss */}
              <div className="bg-slate-900/90 p-3.5 rounded-lg border border-rose-500/40 space-y-1">
                <label className="text-[11px] font-bold text-rose-300 uppercase tracking-wider block flex items-center justify-between">
                  <span>🛑 Stop Loss (Risco em Pontos)</span>
                  <span className="font-mono text-rose-400 font-bold">-{nnSlPoints} pts</span>
                </label>
                <input
                  type="number"
                  step={0.5}
                  value={nnSlPoints}
                  onChange={(e) => setNnSlPoints(Math.max(0.1, parseFloat(e.target.value) || 0))}
                  disabled={isRunningRetest}
                  className="w-full bg-slate-950 border border-rose-500/50 rounded px-3 py-1.5 text-sm text-rose-300 font-mono font-bold outline-none"
                />
                <span className="text-[10px] text-slate-400 block pt-0.5">Se atingir antes do TP, a operação é DERROTA</span>
              </div>
            </div>

            {/* Filtros de Confluência Técnicos para a Rede Neural */}
            <div className="space-y-2 pt-1">
              <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider block">
                ⚙️ Filtros de Confluência Técnicos (Entradas da Árvore de Features):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <label className="p-3 rounded-lg bg-slate-900/70 border border-slate-700/70 flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={testFlags.use_candle_patterns}
                    onChange={(e) => setTestFlags(prev => ({ ...prev, use_candle_patterns: e.target.checked }))}
                    className="mt-0.5 rounded text-cyan-500"
                  />
                  <div>
                    <span className="text-slate-200 font-semibold block">Padrões de Candle M1</span>
                    <span className="text-[10px] text-slate-400">Martelo, Estrela Cadente, Engolfos, Doji</span>
                  </div>
                </label>

                <label className="p-3 rounded-lg bg-slate-900/70 border border-slate-700/70 flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={testFlags.use_moving_averages}
                    onChange={(e) => setTestFlags(prev => ({ ...prev, use_moving_averages: e.target.checked }))}
                    className="mt-0.5 rounded text-cyan-500"
                  />
                  <div>
                    <span className="text-slate-200 font-semibold block">Médias Móveis (SMA9, EMA21, EMA50)</span>
                    <span className="text-[10px] text-slate-400">Cruzamentos e distâncias relativas em ATR</span>
                  </div>
                </label>

                <label className="p-3 rounded-lg bg-slate-900/70 border border-slate-700/70 flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={testFlags.use_rsi}
                    onChange={(e) => setTestFlags(prev => ({ ...prev, use_rsi: e.target.checked }))}
                    className="mt-0.5 rounded text-cyan-500"
                  />
                  <div>
                    <span className="text-slate-200 font-semibold block">Oscilador RSI (14)</span>
                    <span className="text-[10px] text-slate-400">Sobrecompra e sobrevenda em M1</span>
                  </div>
                </label>

                <label className="p-3 rounded-lg bg-slate-900/70 border border-slate-700/70 flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={testFlags.use_macd}
                    onChange={(e) => setTestFlags(prev => ({ ...prev, use_macd: e.target.checked }))}
                    className="mt-0.5 rounded text-cyan-500"
                  />
                  <div>
                    <span className="text-slate-200 font-semibold block">Indicador MACD (12, 26, 9)</span>
                    <span className="text-[10px] text-slate-400">Linha de sinal e histograma</span>
                  </div>
                </label>

                <label className="p-3 rounded-lg bg-slate-900/70 border border-slate-700/70 flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={testFlags.use_atr}
                    onChange={(e) => setTestFlags(prev => ({ ...prev, use_atr: e.target.checked }))}
                    className="mt-0.5 rounded text-cyan-500"
                  />
                  <div>
                    <span className="text-slate-200 font-semibold block">Volatilidade &amp; ATR</span>
                    <span className="text-[10px] text-slate-400">Normalização por regime de volatilidade</span>
                  </div>
                </label>

                <label className="p-3 rounded-lg bg-slate-900/70 border border-slate-700/70 flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={testFlags.use_volume}
                    onChange={(e) => setTestFlags(prev => ({ ...prev, use_volume: e.target.checked }))}
                    className="mt-0.5 rounded text-cyan-500"
                  />
                  <div>
                    <span className="text-slate-200 font-semibold block">Volume &amp; Order Flow Proxy</span>
                    <span className="text-[10px] text-slate-400">Volume Z-Score e Delta agressor</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Controles de Épocas e Treinamento */}
            <div className="pt-3 border-t border-cyan-800/40 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-300">Épocas (Epochs):</span>
                  <input
                    type="number"
                    min={5}
                    max={50}
                    value={epochs}
                    onChange={(e) => setEpochs(Number(e.target.value))}
                    className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white font-mono text-center font-bold"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={fetchFromDb}
                    onChange={(e) => setFetchFromDb(e.target.checked)}
                    className="rounded text-cyan-500"
                  />
                  <span>Sincronizar novos candles do banco</span>
                </label>
              </div>

              <button
                type="button"
                onClick={handleRunManualRetest}
                disabled={isRunningRetest}
                className={`px-6 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-lg cursor-pointer ${
                  isRunningRetest
                    ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-500/40 cursor-not-allowed'
                    : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-500/20 active:scale-95'
                }`}
              >
                {isRunningRetest ? (
                  <>
                    <span className="animate-spin text-sm">⏳</span>
                    <span>Treinando Rede Neural TensorFlow...</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>Executar Treinamento da Rede Neural</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONTEÚDO DA ABA 3: MODELAGEM ESTRUTURAL & CONFLUÊNCIAS (WYCKOFF / SWEEPS) */}
      {/* ========================================================================= */}
      {activeTab === 'structural_study' && (
        <div className="space-y-5 animate-fadeIn">
          <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/40 p-5 rounded-xl border border-amber-500/40 shadow-xl space-y-4">
            <div className="border-b border-amber-800/40 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-amber-200 flex items-center gap-2">
                  <span>⚡ Modelagem Estrutural &amp; Confluências Institucionais ({selectedSymbol})</span>
                  <span className="text-[10px] bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded font-mono font-bold">
                    WYCKOFF / SMC / SWEEP
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Detecção geométrica da anatomia de reversão: Consolidação em Caixote $\to$ Rompimento Falso (Spring/Stop Hunt) $\to$ Absorção Imediata (Reclaim), com filtros institucionais de Opções e indicadores de confluência.
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase">Alvo : Risco</span>
                <span className="font-mono text-xs font-bold text-emerald-400">
                  {structSlPoints > 0 ? `1 : ${(structTpPoints / structSlPoints).toFixed(2)} (${(structTpPoints / structSlPoints).toFixed(1)}x)` : '--'}
                </span>
              </div>
            </div>

            {/* Parâmetros Operacionais */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="bg-slate-900/90 p-3.5 rounded-lg border border-amber-700/50 space-y-1">
                <label className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block">
                  🏷️ Nome da Modelagem
                </label>
                <input
                  type="text"
                  value={structModelName}
                  onChange={(e) => setStructModelName(e.target.value)}
                  placeholder={`Ex: Wyckoff Spring & Sweeps ${selectedSymbol}`}
                  disabled={isRunningRetest}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-semibold outline-none focus:border-amber-400"
                />
                <span className="text-[10px] text-slate-400 block pt-0.5">Identificador do modelo no banco e no construtor</span>
              </div>

              <div className="bg-slate-900/90 p-3.5 rounded-lg border border-emerald-500/40 space-y-1">
                <label className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider block flex items-center justify-between">
                  <span>🎯 Take Profit (Alvo)</span>
                  <span className="font-mono text-emerald-400 font-bold">+{structTpPoints} pts</span>
                </label>
                <input
                  type="number"
                  step={0.5}
                  value={structTpPoints}
                  onChange={(e) => setStructTpPoints(Math.max(0.1, parseFloat(e.target.value) || 0))}
                  disabled={isRunningRetest}
                  className="w-full bg-slate-950 border border-emerald-500/50 rounded px-3 py-1.5 text-sm text-emerald-300 font-mono font-bold outline-none"
                />
                <span className="text-[10px] text-slate-400 block pt-0.5">Pontos de ganho para confirmação da tese</span>
              </div>

              <div className="bg-slate-900/90 p-3.5 rounded-lg border border-rose-500/40 space-y-1">
                <label className="text-[11px] font-bold text-rose-300 uppercase tracking-wider block flex items-center justify-between">
                  <span>🛑 Stop Loss Limite</span>
                  <span className="font-mono text-rose-400 font-bold">-{structSlPoints} pts</span>
                </label>
                <input
                  type="number"
                  step={0.5}
                  value={structSlPoints}
                  onChange={(e) => setStructSlPoints(Math.max(0.1, parseFloat(e.target.value) || 0))}
                  disabled={isRunningRetest}
                  className="w-full bg-slate-950 border border-rose-500/50 rounded px-3 py-1.5 text-sm text-rose-300 font-mono font-bold outline-none"
                />
                <span className="text-[10px] text-slate-400 block pt-0.5">Limite de invalidação do fundo do Spring</span>
              </div>
            </div>

            {/* Intervalo de Datas */}
            <div className="bg-slate-900/90 p-3.5 rounded-lg border border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  📅 Período de Análise Histórica dos Candles M1
                </span>
                <div className="flex items-center gap-2 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setStructDateRangeMode('all')}
                    className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                      structDateRangeMode === 'all'
                        ? 'bg-amber-600/50 text-amber-200 border border-amber-500'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Base Completa
                  </button>
                  <button
                    type="button"
                    onClick={() => setStructDateRangeMode('custom')}
                    className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                      structDateRangeMode === 'custom'
                        ? 'bg-amber-600/50 text-amber-200 border border-amber-500'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Intervalo de Datas
                  </button>
                </div>
              </div>

              {structDateRangeMode === 'all' ? (
                <div className="p-2.5 bg-slate-950/60 rounded border border-slate-800 text-[11px] text-slate-400">
                  Processando todos os candles de 1 minuto disponíveis de {selectedSymbol} com paginação de até 40.000 barras.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-0.5">Data Inicial:</span>
                    <input
                      type="date"
                      value={structCustomStartDate}
                      onChange={(e) => setStructCustomStartDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-0.5">Data Final:</span>
                    <input
                      type="date"
                      value={structCustomEndDate}
                      onChange={(e) => setStructCustomEndDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Parâmetros Estruturais da Anatomia de Preço */}
            <div className="bg-slate-900/90 p-4 rounded-lg border border-amber-800/40 space-y-3">
              <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block">
                📐 Calibração da Estrutura (Caixote &amp; Spring):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Mín. Velas no Caixote:</label>
                  <input
                    type="number"
                    min={4}
                    max={40}
                    value={structConfig.min_range_candles}
                    onChange={(e) => setStructConfig(c => ({ ...c, min_range_candles: Number(e.target.value) || 8 }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white font-mono text-center font-bold"
                  />
                  <span className="text-[9px] text-slate-500 block pt-0.5">Tamanho mín. da consolidação</span>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Máx. Velas no Caixote:</label>
                  <input
                    type="number"
                    min={10}
                    max={60}
                    value={structConfig.max_range_candles}
                    onChange={(e) => setStructConfig(c => ({ ...c, max_range_candles: Number(e.target.value) || 25 }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white font-mono text-center font-bold"
                  />
                  <span className="text-[9px] text-slate-500 block pt-0.5">Limite de acúmulo temporal</span>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Sweep Mínimo (pts):</label>
                  <input
                    type="number"
                    step={0.5}
                    value={structConfig.sweep_min_pts}
                    onChange={(e) => setStructConfig(c => ({ ...c, sweep_min_pts: parseFloat(e.target.value) || 1.0 }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white font-mono text-center font-bold"
                  />
                  <span className="text-[9px] text-slate-500 block pt-0.5">Penetração mín. abaixo do piso</span>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Sweep Máximo (pts):</label>
                  <input
                    type="number"
                    step={0.5}
                    value={structConfig.sweep_max_pts}
                    onChange={(e) => setStructConfig(c => ({ ...c, sweep_max_pts: parseFloat(e.target.value) || 20.0 }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white font-mono text-center font-bold"
                  />
                  <span className="text-[9px] text-slate-500 block pt-0.5">Não exceder para evitar tendência</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-xs">
                  <input
                    type="checkbox"
                    checked={structConfig.require_reclaim}
                    onChange={(e) => setStructConfig(c => ({ ...c, require_reclaim: e.target.checked }))}
                    className="rounded text-amber-500"
                  />
                  <span className="font-semibold text-amber-200">
                    Exigir Reclaim Imediato / Absorção (Vela fecha de volta para dentro do caixote com cauda de rejeição)
                  </span>
                </label>
              </div>
            </div>

            {/* Filtros Institucionais / Gamma */}
            <div className="space-y-2 pt-1">
              <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block">
                🏛️ Filtros Institucionais de Opções &amp; Gamma (Confluência Macro):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <label className="p-3 rounded-lg bg-slate-900/80 border border-amber-800/40 flex items-start gap-2.5 cursor-pointer hover:border-amber-600 transition">
                  <input
                    type="checkbox"
                    checked={structInstFlags.use_0dte_walls}
                    onChange={(e) => setStructInstFlags(f => ({ ...f, use_0dte_walls: e.target.checked }))}
                    className="mt-0.5 rounded text-amber-500"
                  />
                  <div>
                    <strong className="block text-amber-200 text-xs">Paredes 0DTE (Put Wall)</strong>
                    <span className="text-[10px] text-slate-400">
                      O Spring ocorre testando a Put Wall 0DTE do dia, onde os market makers absorvem as vendas a mercado.
                    </span>
                  </div>
                </label>

                <label className="p-3 rounded-lg bg-slate-900/80 border border-amber-800/40 flex items-start gap-2.5 cursor-pointer hover:border-amber-600 transition">
                  <input
                    type="checkbox"
                    checked={structInstFlags.use_gbl_gravity}
                    onChange={(e) => setStructInstFlags(f => ({ ...f, use_gbl_gravity: e.target.checked }))}
                    className="mt-0.5 rounded text-amber-500"
                  />
                  <div>
                    <strong className="block text-amber-200 text-xs">Gravidade GBL &amp; Ajuste</strong>
                    <span className="text-[10px] text-slate-400">
                      Confluência direta com HVL ou Ajuste do dia anterior, atraindo retorno violento ao centro.
                    </span>
                  </div>
                </label>

                <label className="p-3 rounded-lg bg-slate-900/80 border border-amber-800/40 flex items-start gap-2.5 cursor-pointer hover:border-amber-600 transition">
                  <input
                    type="checkbox"
                    checked={structInstFlags.use_gex_bl_concreto}
                    onChange={(e) => setStructInstFlags(f => ({ ...f, use_gex_bl_concreto: e.target.checked }))}
                    className="mt-0.5 rounded text-amber-500"
                  />
                  <div>
                    <strong className="block text-amber-200 text-xs">Ajustes GEX &amp; BL 8 a 10</strong>
                    <span className="text-[10px] text-slate-400">
                      Zonas de concreto institucional com altíssima barreira de liquidez contra rompimentos.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Filtros Técnicos de Confluência */}
            <div className="space-y-2 pt-1">
              <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block">
                📊 Filtros Técnicos de Confluência (Price Action &amp; Osciladores):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <label className="p-2.5 rounded-lg bg-slate-900/80 border border-amber-800/40 flex items-start gap-2 cursor-pointer hover:border-amber-600 transition">
                  <input
                    type="checkbox"
                    checked={structTechFlags.use_rsi}
                    onChange={(e) => setStructTechFlags(f => ({ ...f, use_rsi: e.target.checked }))}
                    className="mt-0.5 rounded text-amber-500"
                  />
                  <div>
                    <strong className="block text-amber-200 text-[11px]">RSI Sobrevenda (&le; 35)</strong>
                    <span className="text-[10px] text-slate-400">Confirma exaustão de baixa na ponta da mola</span>
                  </div>
                </label>

                <label className="p-2.5 rounded-lg bg-slate-900/80 border border-amber-800/40 flex items-start gap-2 cursor-pointer hover:border-amber-600 transition">
                  <input
                    type="checkbox"
                    checked={structTechFlags.use_macd}
                    onChange={(e) => setStructTechFlags(f => ({ ...f, use_macd: e.target.checked }))}
                    className="mt-0.5 rounded text-amber-500"
                  />
                  <div>
                    <strong className="block text-amber-200 text-[11px]">MACD Invertendo</strong>
                    <span className="text-[10px] text-slate-400">Histograma desacelerando vendas e virando compra</span>
                  </div>
                </label>

                <label className="p-2.5 rounded-lg bg-slate-900/80 border border-amber-800/40 flex items-start gap-2 cursor-pointer hover:border-amber-600 transition">
                  <input
                    type="checkbox"
                    checked={structTechFlags.use_atr}
                    onChange={(e) => setStructTechFlags(f => ({ ...f, use_atr: e.target.checked }))}
                    className="mt-0.5 rounded text-amber-500"
                  />
                  <div>
                    <strong className="block text-amber-200 text-[11px]">Filtro de ATR</strong>
                    <span className="text-[10px] text-slate-400">Elimina sinais em momentos de mercado sem volatilidade</span>
                  </div>
                </label>

                <label className="p-2.5 rounded-lg bg-slate-900/80 border border-amber-800/40 flex items-start gap-2 cursor-pointer hover:border-amber-600 transition">
                  <input
                    type="checkbox"
                    checked={structTechFlags.use_measured_move}
                    onChange={(e) => setStructTechFlags(f => ({ ...f, use_measured_move: e.target.checked }))}
                    className="mt-0.5 rounded text-amber-500"
                  />
                  <div>
                    <strong className="block text-amber-200 text-[11px]">Simetria AB=CD</strong>
                    <span className="text-[10px] text-slate-400">Perna 1 de queda proporcional à perna do Sweep</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Botão de Disparo da Modelagem */}
            <div className="pt-3 border-t border-amber-800/40 flex justify-end">
              <button
                type="button"
                onClick={handleRunManualRetest}
                disabled={isRunningRetest}
                className={`px-6 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-lg cursor-pointer ${
                  isRunningRetest
                    ? 'bg-amber-900/60 text-amber-300 border border-amber-500/40 cursor-not-allowed'
                    : 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-500 hover:from-amber-500 hover:to-orange-500 text-white shadow-amber-500/20 active:scale-95'
                }`}
              >
                {isRunningRetest ? (
                  <>
                    <span className="animate-spin text-sm">⏳</span>
                    <span>Executando Modelagem Estrutural &amp; Confluências...</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>Executar Modelagem Estrutural &amp; Confluências Agora</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TABELA DE MODELOS SALVOS (FILTRADA AUTOMATICAMENTE PELA ABA ATIVA)       */}
      {/* ========================================================================= */}
      <div className="bg-slate-800/60 p-5 rounded-xl border border-slate-700 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700/70 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>
                📚 {activeTab === 'gamma_quant'
                  ? 'Estudos de Padrões Gamma Salvos'
                  : activeTab === 'structural_study'
                  ? 'Modelagens Estruturais & Confluências Salvas'
                  : 'Modelos de Rede Neural Salvos'} ({selectedSymbol})
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                activeTab === 'gamma_quant'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : activeTab === 'structural_study'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              }`}>
                {filteredModels.length} DISPONÍVEIS
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {activeTab === 'gamma_quant'
                ? 'Estudos quantitativos de Gamma salvos que alimentam o widget "Mapa Quantitativo de Gamma & Sessões" no gráfico.'
                : activeTab === 'structural_study'
                ? 'Estudos de estruturas de Wyckoff, Sweeps e confluências quantitativas com taxas de acerto reais apuradas.'
                : 'Modelagens de rede neural salvas que alimentam o "Radar Axion ML" no gráfico.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadAssetModels(selectedSymbol)}
              disabled={isLoadingModelsList}
              className="px-2.5 py-1 bg-slate-700/60 hover:bg-slate-700 text-slate-300 text-[11px] rounded border border-slate-600 transition flex items-center gap-1 cursor-pointer"
            >
              <span>🔄</span>
              <span>{isLoadingModelsList ? 'Carregando...' : 'Recarregar'}</span>
            </button>
          </div>
        </div>

        {filteredModels.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/80 text-[10px] text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700">
                <tr>
                  <th className="py-2.5 px-3">Nome da Modelagem / Estudo</th>
                  <th className="py-2.5 px-3 text-center">Alvo / Stop</th>
                  <th className="py-2.5 px-3 text-center">Assertividade</th>
                  <th className="py-2.5 px-3 text-center">AUC Score</th>
                  <th className="py-2.5 px-3 text-center">Amostras</th>
                  <th className="py-2.5 px-3 text-center">Data do Reteste</th>
                  <th className="py-2.5 px-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredModels.map((model: StudyRecord) => (
                  <tr key={model.id || model.last_run} className="hover:bg-slate-700/30 transition">
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-white">{model.model_name || `Estudo ${model.symbol}`}</div>
                      <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 flex-wrap pt-0.5">
                        <span className={
                          model.model_type === 'gamma_quant_study'
                            ? 'text-purple-400'
                            : model.model_type === 'structural_pattern_study'
                            ? 'text-amber-400 font-bold'
                            : 'text-cyan-400'
                        }>
                          {model.model_type === 'gamma_quant_study'
                            ? '🗺️ Padrões Gamma'
                            : model.model_type === 'structural_pattern_study'
                            ? '⚡ Wyckoff / Sweeps'
                            : '🧠 Rede Neural M1'}
                        </span>
                        <span>•</span>
                        <span>{model.symbol}</span>
                      </div>

                      {/* Sub-padrões / Confluências do Estudo Estrutural */}
                      {Array.isArray(model.top_patterns) && model.top_patterns.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-1.5">
                          {model.top_patterns.slice(0, 3).map((p, idx) => (
                            <span
                              key={idx}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 font-mono"
                            >
                              {p.pattern.replace('Spring + ', '+')}: <strong className="text-emerald-400">{p.winrate}%</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="font-mono text-[11px]">
                        <span className="text-emerald-400 font-bold">+{model.tp_points || 25} pts</span>
                        <span className="text-slate-500 mx-1">/</span>
                        <span className="text-rose-400 font-bold">-{model.sl_points || 12} pts</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-amber-400">
                      {model.metrics?.accuracy ? `${model.metrics.accuracy}%` : '--'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-cyan-400 font-bold">
                      {model.metrics?.auc || '--'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-300">
                      {model.test_samples ? model.test_samples.toLocaleString('pt-BR') : '--'}
                    </td>
                    <td className="py-2.5 px-3 text-center text-[11px] text-slate-400">
                      {model.last_run ? new Date(model.last_run).toLocaleDateString('pt-BR') : '--'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {model.model_type === 'structural_pattern_study' && (
                          <button
                            onClick={() => setViewingMatrixStudy(model)}
                            className="px-2 py-1 bg-amber-950/50 hover:bg-amber-900/70 text-amber-300 text-[10px] font-bold rounded border border-amber-800/50 transition cursor-pointer flex items-center gap-1"
                            title="Visualizar Mapeamento de Assertividade (Matriz TP x SL)"
                          >
                            <span>📊</span>
                            <span>Matriz TP/SL</span>
                          </button>
                        )}
                        {model.id && (
                          <button
                            onClick={() => handleDeleteModel(model.id, model.model_name)}
                            disabled={deletingModelId === model.id}
                            className="px-2 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-[10px] font-bold rounded border border-rose-800/40 transition cursor-pointer"
                            title="Excluir este estudo do banco"
                          >
                            {deletingModelId === model.id ? '...' : '🗑️'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4 text-center text-xs text-slate-400 bg-slate-900/30 rounded-lg border border-dashed border-slate-700/80">
            Nenhum estudo salvo encontrado para esta metodologia no ativo {selectedSymbol}. Execute uma modelagem para gravar.
          </div>
        )}
      </div>

      {/* MODAL / OVERLAY DA MATRIZ TP x SL (HEATMAP DE ASSERTIVIDADE) */}
      {viewingMatrixStudy && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl animate-fadeIn text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>📊 Mapeamento de Assertividade (Grade TP x SL)</span>
                  <span className="text-[10px] bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded font-mono font-bold">
                    {viewingMatrixStudy.symbol}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Estudo: <strong className="text-white">{viewingMatrixStudy.model_name}</strong> • {viewingMatrixStudy.analyzed_samples} eventos analisados
                </p>
              </div>

              <button
                onClick={() => setViewingMatrixStudy(null)}
                className="text-slate-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* Ponto Ótimo */}
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 text-base">⭐</span>
                <div>
                  <strong className="text-emerald-200 block text-xs">Ponto Ótimo de Expectativa Matemática:</strong>
                  <span className="text-[10px] text-slate-300">
                    Alvo: +{(viewingMatrixStudy.metrics as any)?.best_tp || viewingMatrixStudy.tp_points} pts / Stop: -{(viewingMatrixStudy.metrics as any)?.best_sl || viewingMatrixStudy.sl_points} pts
                  </span>
                </div>
              </div>
              <div className="text-right font-mono">
                <span className="text-[10px] text-slate-400 block uppercase">Expectativa Média</span>
                <span className="text-emerald-400 font-bold text-xs">
                  +{(viewingMatrixStudy.metrics as any)?.best_ev || '--'} pts/trade
                </span>
              </div>
            </div>

            {/* A Grade Heatmap */}
            {Array.isArray((viewingMatrixStudy.metrics as any)?.tp_sl_matrix) && (viewingMatrixStudy.metrics as any).tp_sl_matrix.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Clique em qualquer célula para calibrar os parâmetros no formulário:</span>
                  <span className="font-mono text-[10px] text-amber-400">Linhas = Stop Loss | Colunas = Take Profit</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-center text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-700 bg-slate-950/60 text-[10px] text-slate-400">
                        <th className="p-2 text-left">Stop \ Alvo</th>
                        {((viewingMatrixStudy.metrics as any)?.tp_grid || [15, 20, 25, 30, 40]).map((tp: number) => (
                          <th key={tp} className="p-2 font-mono text-emerald-400">+{tp} pts</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                      {((viewingMatrixStudy.metrics as any)?.sl_grid || [8, 10, 12, 15, 20]).map((sl: number) => (
                        <tr key={sl}>
                          <td className="p-2 text-left font-bold text-rose-400 bg-slate-950/40">-{sl} pts</td>
                          {((viewingMatrixStudy.metrics as any)?.tp_grid || [15, 20, 25, 30, 40]).map((tp: number) => {
                            const cell = (viewingMatrixStudy.metrics as any).tp_sl_matrix.find((c: any) => c.tp === tp && c.sl === sl);
                            if (!cell) return <td key={tp} className="p-2 text-slate-600">--</td>;

                            const isSelected = structTpPoints === cell.tp && structSlPoints === cell.sl;
                            const isHigh = cell.winrate >= 70;
                            const isMid = cell.winrate >= 55;

                            return (
                              <td key={tp} className="p-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStructTpPoints(cell.tp);
                                    setStructSlPoints(cell.sl);
                                    setStatusMessage({
                                      text: `Parâmetros calibrados para Alvo +${cell.tp} pts / Stop -${cell.sl} pts (Assertividade: ${cell.winrate}% • EV: +${cell.ev} pts)`,
                                      type: 'success'
                                    });
                                    setViewingMatrixStudy(null);
                                  }}
                                  className={`w-full p-2 rounded border transition cursor-pointer ${
                                    isSelected
                                      ? 'ring-2 ring-amber-400 border-amber-400 bg-amber-950/80 shadow-lg'
                                      : isHigh
                                      ? 'bg-emerald-950/60 border-emerald-600/50 hover:border-emerald-400 text-emerald-200'
                                      : isMid
                                      ? 'bg-cyan-950/50 border-cyan-700/40 hover:border-cyan-400 text-cyan-200'
                                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-600 text-slate-400'
                                  }`}
                                  title={`Clique para selecionar +${cell.tp}/-${cell.sl}`}
                                >
                                  <div className="font-bold text-xs">{cell.winrate}%</div>
                                  <div className="text-[9px] text-slate-400 flex items-center justify-center gap-1 pt-0.5">
                                    <span>EV:</span>
                                    <strong className={cell.ev > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                      {cell.ev > 0 ? `+${cell.ev}` : cell.ev}
                                    </strong>
                                  </div>
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-slate-400 bg-slate-950/40 rounded-lg border border-dashed border-slate-700">
                Grade detalhada não gravada neste estudo anterior. Execute uma nova modelagem na Aba 3 para calcular a matriz completa.
              </div>
            )}

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setViewingMatrixStudy(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
              >
                Fechar Visualização
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
