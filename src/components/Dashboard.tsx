import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export const Dashboard: React.FC = () => {
  const {
    marketData,
    forces,
    gammaLevels,
    news,
    screenshot,
    aiEnabled,
    isAnalyzing,
    aiResult,
    runManualAIAnalysis,
    clearLogs,
    systemLogs
  } = useApp();

  // Estados locais
  const [activeLogTab, setActiveLogTab] = useState<'mensagens' | 'noticias'>('mensagens');
  const [newsFilter, setNewsFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [disabledLevels, setDisabledLevels] = useState<string[]>([]);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);

  // Toggle nível no mapa
  const toggleLevelVisibility = (levelKey: string) => {
    if (disabledLevels.includes(levelKey)) {
      setDisabledLevels(prev => prev.filter(k => k !== levelKey));
    } else {
      setDisabledLevels(prev => [...prev, levelKey]);
    }
  };

  // Cálculo do Mapa de Níveis
  const renderLevelsMap = () => {
    if (!marketData || !gammaLevels) {
      return <div className="text-slate-600 text-sm text-center py-6">Aguardando dados do mercado...</div>;
    }

    const currentPrice = Number(marketData.price);
    if (isNaN(currentPrice)) {
      return <div className="text-slate-600 text-sm text-center py-6">Preço do mercado inválido...</div>;
    }

    // Mapear chaves de níveis e suas cores/labels
    const levelConfigs: { [key: string]: { label: string; class: string; price: number } } = {};
    
    const mappingKeys = [
      { key: 'hvl', label: 'HVL', class: 'hvl' },
      { key: 'call', label: 'Call', class: 'call' },
      { key: 'put', label: 'Put', class: 'put' },
      { key: 'max1d', label: '1D Max', class: 'max1d' },
      { key: 'min1d', label: '1D Min', class: 'min1d' },
      { key: 'prev', label: 'Ajuste', class: 'prev' },
      { key: 'prevH', label: 'Máx Ant', class: 'prevH' },
      { key: 'prevL', label: 'Mín Ant', class: 'prevL' },
      { key: 'hvl0', label: 'HVL 0DTE', class: 'hvl0' },
      { key: 'call0', label: 'Call 0DTE', class: 'call0' },
      { key: 'put0', label: 'Put 0DTE', class: 'put0' },
      { key: 'gwall', label: 'GWall 0DTE', class: 'gwall' }
    ];

    const activePrices: number[] = [currentPrice];

    mappingKeys.forEach(cfg => {
      const priceRaw = (gammaLevels as any)[cfg.key];
      const priceNum = Number(priceRaw);
      if (priceRaw && !isNaN(priceNum) && priceNum > 0 && !disabledLevels.includes(cfg.key)) {
        levelConfigs[cfg.key] = {
          label: cfg.label,
          class: cfg.class,
          price: priceNum
        };
        activePrices.push(priceNum);
      }
    });

    const minPrice = Math.min(...activePrices);
    const maxPrice = Math.max(...activePrices);
    const range = maxPrice - minPrice || 1;

    // Margem de 5% nas pontas para não esmagar os elementos nas bordas
    const padding = range * 0.05;
    const mapMin = minPrice - padding;
    const mapMax = maxPrice + padding;
    const mapRange = mapMax - mapMin;

    const getPercent = (p: number) => {
      return ((p - mapMin) / mapRange) * 100;
    };

    return (
      <div className="relative h-full w-full">
        {/* Linha do Preço Atual */}
        <div
          className="preco-marker"
          style={{ left: `${getPercent(currentPrice)}%` }}
          title={`Preço Atual: ${currentPrice}`}
        />

        {/* Linhas de Nível */}
        {Object.entries(levelConfigs).map(([key, cfg]) => {
          const pct = getPercent(cfg.price);
          return (
            <div
              key={key}
              className={`nivel-linha ${cfg.class}`}
              style={{ left: `${pct}%` }}
            >
              <span className="nivel-label bg-slate-900 border border-slate-700 text-slate-300">
                {cfg.label}: {cfg.price}
              </span>
            </div>
          );
        })}

        {/* Eixo de Min/Max */}
        <div className="absolute bottom-1 left-2 text-[10px] text-slate-500 font-mono">
          Min: {mapMin.toFixed(2)}
        </div>
        <div className="absolute bottom-1 right-2 text-[10px] text-slate-500 font-mono">
          Max: {mapMax.toFixed(2)}
        </div>
      </div>
    );
  };

  // Filtrar Notícias
  const filteredNews = news.filter(item => {
    if (newsFilter === 'all') return true;
    return item.impact === newsFilter;
  });

  // Rotação do Needle do Sentiment Gauge (-90deg a 90deg)
  const getSentimentRotation = () => {
    if (!marketData) return -90;
    const value = marketData.sentiment; // De 0 a 100
    // Mapear de [0, 100] para [-90, 90]
    return (value / 100) * 180 - 90;
  };

  // Posicionamento do marcador Delta (0% a 100%)
  const getDeltaLeft = () => {
    if (!marketData) return 50;
    // deltaRatio idealmente fica entre 0.0 (total venda) e 2.0 (total compra), com 1.0 no centro
    const ratio = marketData.deltaRatio;
    const pct = (ratio / 2) * 100;
    return Math.max(0, Math.min(100, pct));
  };

  // Cores do Sinal IA
  const getSignalColorClass = (sinal: string) => {
    switch (sinal) {
      case 'COMPRA': return 'text-green-500 font-black';
      case 'VENDA': return 'text-red-500 font-black';
      case 'SAIR': return 'text-orange-500 font-bold';
      default: return 'text-slate-500';
    }
  };

  const getSignalBorderClass = (sinal: string) => {
    switch (sinal) {
      case 'COMPRA': return 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.15)]';
      case 'VENDA': return 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)]';
      case 'SAIR': return 'border-orange-500/50';
      default: return 'border-slate-700';
    }
  };

  return (
    <div className="space-y-4">
      {/* Linha superior: Widgets do Dashboard */}
      <div className="grid grid-cols-12 gap-3">
        {/* Coluna 1: Preço, ATR, Sentimento - Largura 2/12 */}
        <div className="col-span-12 lg:col-span-2 space-y-2">
          {/* Card Preço */}
          <div className="glass p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between items-center mb-1">
              <div className="text-[13px] font-bold text-blue-300 font-mono tracking-wider">
                {marketData?.symbol || '--'}
              </div>
              <div className="text-xs text-slate-500 text-right">
                Hora: {marketData?.timestamp || '--:--:--'}
              </div>
            </div>
            <div className="text-3xl font-mono font-bold text-white">
              {marketData?.price || '--'}
            </div>
          </div>

          {/* Card Acelerômetro */}
          <div className="glass p-3 rounded-lg border border-slate-800">
            <div className="text-xs font-bold text-yellow-400 uppercase mb-2">⚡ Acelerômetro</div>
            <div className="mb-2">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Z-Score</span>
                <span className="font-mono font-bold">{marketData?.zScore?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
                  style={{
                    width: `${Math.max(0, Math.min(100, ((marketData?.zScore || 0) + 3) * 16.6))}%`,
                    transition: 'width 0.3s'
                  }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">ATR Ratio</span>
                <span className="font-mono font-bold">{marketData?.atrRatio?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                  style={{
                    width: `${Math.max(0, Math.min(100, (marketData?.atrRatio || 0) * 33.3))}%`,
                    transition: 'width 0.3s'
                  }}
                ></div>
              </div>
            </div>
            <div className="mt-3 p-1.5 rounded text-center text-xs font-bold bg-blue-900/30 text-blue-300 border border-blue-800">
              {marketData?.estado || 'AGUARDANDO'}
            </div>
          </div>

          {/* Card Sentimento */}
          <div className="glass p-3 rounded-lg border border-slate-800 text-center">
            <div className="text-[11px] font-bold text-purple-400 uppercase mb-1">📊 SENTIMENTO</div>
            <div className="gauge-container-compact">
              <div className="gauge-bg-compact">
                <div className="gauge-mask-compact"></div>
              </div>
              <div
                className="gauge-needle-compact"
                style={{ transform: `rotate(${getSentimentRotation()}deg)` }}
              ></div>
              <div className="gauge-center-compact"></div>
              <div className="gauge-value-compact">
                <div className="gauge-value-number-compact text-white font-mono">
                  {marketData?.sentiment !== undefined ? `${marketData.sentiment}%` : '0%'}
                </div>
              </div>
            </div>
            <div className="gauge-labels-compact text-[9px] flex justify-between px-2">
              <span className="text-red-400">Vendedor</span>
              <span className="text-green-400">Comprador</span>
            </div>
          </div>
        </div>

        {/* Coluna 2: Força Momentum - Largura 2/12 */}
        <div className="col-span-12 md:col-span-6 lg:col-span-2">
          <div className="glass p-3 rounded-lg h-full border border-slate-800 flex flex-col">
            <div className="text-xs font-bold text-purple-400 uppercase mb-2">💪 Força Momentum</div>
            <div className="space-y-1 flex-1 overflow-y-auto pr-1">
              {forces.length === 0 ? (
                <div className="text-slate-500 text-xs py-4 text-center">Buscando forças...</div>
              ) : (
                forces.map((item) => (
                  <div key={item.symbol} className="flex items-center gap-1.5 py-0.5 border-b border-slate-800/20 last:border-b-0 text-[10px]">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.buy >= 50 ? 'bg-green-500 shadow-[0_0_4px_#22c55e]' : 'bg-red-500 shadow-[0_0_4px_#ef4444]'}`}></span>
                    <span className="font-bold text-slate-300 font-mono w-9 truncate" title={item.symbol}>{item.symbol}</span>
                    <span className="text-green-400 font-bold w-7 text-right font-mono">{item.buy}%</span>
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                      <div
                        className="bg-green-500"
                        style={{ width: `${item.buy}%` }}
                      ></div>
                      <div
                        className="bg-red-500"
                        style={{ width: `${item.sell}%` }}
                      ></div>
                    </div>
                    <span className="text-red-400 font-bold w-7 text-left font-mono">{item.sell}%</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Coluna 3: Mapa de Níveis - Largura 4/12 */}
        <div className="col-span-12 md:col-span-6 lg:col-span-4 space-y-2">
          <div className="glass p-3 rounded-lg border border-slate-800 flex flex-col h-full justify-between">
            <div>
              <div className="text-xs font-bold text-purple-400 uppercase mb-2">🗺️ Mapa de Níveis</div>
              <div className="mapa-track h-16 relative rounded overflow-hidden border border-slate-800 bg-slate-900 mb-3 flex items-center justify-center">
                {renderLevelsMap()}
              </div>
            </div>

            {/* Grid dos Cards de Níveis toggles - Estruturado */}
            <div className="space-y-1 py-1 text-[9px] max-h-36 overflow-y-auto pr-0.5 select-none">
              <div className="grid grid-cols-4 gap-1">
                {[
                  { key: 'hvl', label: 'HVL', color: 'card-hvl' },
                  { key: 'call', label: 'Call', color: 'card-call' },
                  { key: 'put', label: 'Put', color: 'card-put' },
                  { key: 'max1d', label: '1D Max', color: 'card-max' }
                ].map(cfg => (
                  <button
                    key={cfg.key}
                    onClick={() => toggleLevelVisibility(cfg.key)}
                    className={`card-nivel ${cfg.color} text-center py-1 rounded transition ${disabledLevels.includes(cfg.key) ? 'nivel-off opacity-30 grayscale' : ''}`}
                  >
                    <div className="font-bold text-[8px] truncate">{cfg.label}</div>
                    <div className="font-mono text-white text-[8px] truncate">
                      {gammaLevels ? (gammaLevels as any)[cfg.key] !== undefined ? String((gammaLevels as any)[cfg.key]) : '--' : '--'}
                    </div>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { key: 'min1d', label: '1D Min', color: 'card-min' },
                  { key: 'prev', label: 'Ajuste', color: 'card-ajuste' },
                  { key: 'prevH', label: 'Máx Ant', color: 'card-prevH' },
                  { key: 'prevL', label: 'Mín Ant', color: 'card-prevL' }
                ].map(cfg => (
                  <button
                    key={cfg.key}
                    onClick={() => toggleLevelVisibility(cfg.key)}
                    className={`card-nivel ${cfg.color} text-center py-1 rounded transition ${disabledLevels.includes(cfg.key) ? 'nivel-off opacity-30 grayscale' : ''}`}
                  >
                    <div className="font-bold text-[8px] truncate">{cfg.label}</div>
                    <div className="font-mono text-white text-[8px] truncate">
                      {gammaLevels ? (gammaLevels as any)[cfg.key] !== undefined ? String((gammaLevels as any)[cfg.key]) : '--' : '--'}
                    </div>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { key: 'hvl0', label: 'HVL 0DTE', color: 'card-hvl0' },
                  { key: 'call0', label: 'Call 0DTE', color: 'card-call0' },
                  { key: 'put0', label: 'Put 0DTE', color: 'card-put0' },
                  { key: 'gwall', label: 'GWall 0DTE', color: 'card-gwall' }
                ].map(cfg => (
                  <button
                    key={cfg.key}
                    onClick={() => toggleLevelVisibility(cfg.key)}
                    className={`card-nivel ${cfg.color} text-center py-1 rounded transition ${disabledLevels.includes(cfg.key) ? 'nivel-off opacity-30 grayscale' : ''}`}
                  >
                    <div className="font-bold text-[8px] truncate">{cfg.label}</div>
                    <div className="font-mono text-white text-[8px] truncate">
                      {gammaLevels ? (gammaLevels as any)[cfg.key] !== undefined ? String((gammaLevels as any)[cfg.key]) : '--' : '--'}
                    </div>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1">
                {[
                  { key: 'gex_count', label: 'GEX Count', color: 'card-gex' },
                  { key: 'bl_count', label: 'BL Count', color: 'card-bl' }
                ].map(cfg => (
                  <button
                    key={cfg.key}
                    onClick={() => toggleLevelVisibility(cfg.key)}
                    className={`card-nivel ${cfg.color} text-center py-1 rounded transition ${disabledLevels.includes(cfg.key) ? 'nivel-off opacity-30 grayscale' : ''}`}
                  >
                    <div className="font-bold text-[8px] truncate">{cfg.label}</div>
                    <div className="font-mono text-white text-[8px] truncate">
                      {gammaLevels ? (gammaLevels as any)[cfg.key] !== undefined ? String((gammaLevels as any)[cfg.key]) : '--' : '--'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Coluna 4: IA Decision Card & Delta Gauge - Largura 4/12 */}
        <div className="col-span-12 lg:col-span-4">
          <div className={`relative glass p-3 rounded-lg border-2 ${!aiEnabled ? 'border-yellow-500/40' : aiResult ? getSignalBorderClass(aiResult.sinal) : 'border-slate-800'} h-full flex flex-col justify-between`}>
            {/* Overlay de IA Desativada */}
            {!aiEnabled && (
              <div className="absolute inset-0 bg-slate-950/85 border border-yellow-500/40 rounded-lg flex flex-col items-center justify-center z-20">
                <span className="text-yellow-500 text-3xl mb-1">⚠️</span>
                <span className="text-yellow-500 font-black text-sm tracking-wider uppercase">IA DESATIVADA</span>
                <span className="text-slate-400 text-[10px] mt-1 px-4 text-center">Ative o ciclo nas configurações ou no menu lateral</span>
              </div>
            )}

            {/* Decisão principal */}
            <div className="text-center">
              <div className="text-xs text-slate-400 mb-1">Decisão Inteligência Artificial</div>
              <div className={`text-3xl font-black ${!aiEnabled ? 'text-slate-600' : isAnalyzing ? 'text-blue-400' : aiResult ? getSignalColorClass(aiResult.sinal) : 'text-slate-500'}`}>
                {!aiEnabled ? 'DESATIVADA' : isAnalyzing ? 'PROCESSANDO...' : aiResult ? aiResult.sinal : 'AGUARDANDO'}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Confiança: <span className="text-white font-bold">{aiResult?.confianca || '--'}</span>
              </div>

              {/* Botão Manual de Análise */}
              <button
                onClick={runManualAIAnalysis}
                disabled={isAnalyzing || !aiEnabled}
                className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded text-xs font-bold w-full transition"
              >
                {isAnalyzing ? 'Executando...' : '🔍 Analisar Agora'}
              </button>

              <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                <div className="bg-slate-900 border border-slate-800 p-2 rounded">
                  <div className="text-[10px] text-slate-500">🎯 Alvo</div>
                  <div className="text-green-400 font-mono font-bold">{aiResult?.alvo || '--'}</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-2 rounded">
                  <div className="text-[10px] text-slate-500">🛑 Stop</div>
                  <div className="text-red-400 font-mono font-bold">{aiResult?.stop || '--'}</div>
                </div>
              </div>

              {aiResult?.resumo && (
                <div className="mt-2 text-[10px] text-slate-300 text-left bg-slate-900/50 p-2 rounded border border-slate-850 max-h-20 overflow-y-auto leading-relaxed">
                  {aiResult.resumo}
                </div>
              )}
            </div>

            {/* Delta Gauge */}
            <div className="delta-gauge-wrap border-t border-slate-800 pt-2 mt-2">
              <div className="delta-gauge-labels text-[9px] flex justify-between font-bold text-slate-400">
                <span className="text-red-400">VENDA</span>
                <span>DELTA</span>
                <span className="text-green-400">COMPRA</span>
              </div>
              <div className="delta-gauge-bar mt-1 h-2 bg-slate-850 rounded-full relative overflow-hidden">
                <div
                  className="delta-gauge-marker absolute top-0 bottom-0 w-1 bg-white shadow-md transition-all duration-350"
                  style={{ left: `${getDeltaLeft()}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-1">
                <span>Δ: <strong className="text-slate-300">{marketData?.delta || 0}</strong></span>
                <span>Ratio: <strong className="text-slate-300">{marketData?.deltaRatio?.toFixed(2) || '1.00'}</strong></span>
                <span>P/s: <strong className="text-slate-300">{marketData?.printsPerSecond || 0}</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Linha Inferior: Captura do Gráfico, Block Trades e Logs */}
      <div className="grid grid-cols-12 gap-3">
        {/* Captura de Tela */}
        <div className="col-span-12 md:col-span-5">
          <div className="glass p-3 rounded-lg border border-slate-800 flex flex-col h-80">
            <div className="flex justify-between items-center mb-2">
              <div className="text-xs font-bold text-blue-400 uppercase">📸 Gráfico (Captura NT8)</div>
              <span className="text-[10px] text-slate-500">
                {screenshot ? 'Disponível' : 'Aguardando captura...'}
              </span>
            </div>
            <div className="bg-slate-900 rounded-lg overflow-hidden flex-1 flex items-center justify-center border border-slate-800/80 relative">
              {screenshot ? (
                <img
                  src={`data:image/png;base64,${screenshot}`}
                  alt="Gráfico de Mercado"
                  className="max-h-full max-w-full object-contain cursor-zoom-in hover:scale-[1.02] transition"
                  onDoubleClick={() => setIsZoomed(true)}
                  title="Clique duplo para ampliar"
                />
              ) : (
                <span className="text-slate-600 text-xs font-mono">Nenhuma captura disponível no Supabase</span>
              )}
            </div>
            <div className="text-[9px] text-slate-500 mt-1.5 text-center">
              💡 Dê um <strong>clique duplo</strong> na imagem para expandir
            </div>
          </div>
        </div>

        {/* Block Trades */}
        <div className="col-span-12 md:col-span-3">
          <div className="glass p-3 rounded-lg border border-slate-800 h-80 flex flex-col justify-between">
            <div className="text-xs font-bold text-orange-400 uppercase pb-2 border-b border-slate-800 flex justify-between items-center">
              <span>🐋 Block Trades</span>
              <span className="text-[9px] bg-orange-950/20 text-orange-400 px-1.5 py-0.5 rounded font-mono border border-orange-800/30">Ordens Grandes</span>
            </div>
            <div className="flex-1 overflow-y-auto py-2 font-mono text-[10px] text-slate-400 space-y-1 scrollbar-hide">
              {!marketData?.blockTrades || marketData.blockTrades.length === 0 ? (
                <div className="text-slate-500 text-center py-10">Sem ordens registradas...</div>
              ) : (
                marketData.blockTrades.map((trade, idx) => (
                  <div key={idx} className="bg-slate-900/30 border border-slate-850 p-1.5 rounded text-left">
                    {trade}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Logs do Sistema e Notícias */}
        <div className="col-span-12 md:col-span-4">
          <div className="glass p-3 rounded-lg border border-slate-800 h-80 flex flex-col">
            <div className="flex justify-between items-center mb-2 pb-1 border-b border-slate-800">
              <span className="text-xs font-bold text-orange-400 uppercase">📜 Log do Sistema</span>
              <div className="flex gap-1.5">
                <button
                  className={`log-tab-btn ${activeLogTab === 'mensagens' ? 'active' : ''}`}
                  onClick={() => setActiveLogTab('mensagens')}
                >
                  MENSAGENS
                </button>
                <button
                  className={`log-tab-btn ${activeLogTab === 'noticias' ? 'active' : ''}`}
                  onClick={() => setActiveLogTab('noticias')}
                >
                  NOTÍCIAS
                </button>
              </div>
            </div>

            {/* Conteúdo Aba MENSAGENS */}
            {activeLogTab === 'mensagens' && (
              <div className="flex-1 flex flex-col justify-between overflow-hidden">
                <div className="flex-1 overflow-y-auto space-y-1 font-mono text-[9px] scrollbar-hide pr-1">
                  {systemLogs.length === 0 ? (
                    <div className="text-slate-600 text-center py-10">Sem mensagens no log...</div>
                  ) : (
                    systemLogs.map(log => (
                      <div
                        key={log.id}
                        className={`log-entry log-entry-${log.type} border-l-2 p-1 rounded bg-slate-900/30`}
                      >
                        <span className="log-time text-slate-500 mr-1">[{log.time}]</span>
                        <span className="log-prefix font-bold mr-1">[{log.prefix}]</span>
                        <span className="text-slate-300">{log.content}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex justify-between items-center mt-2 border-t border-slate-800 pt-1.5">
                  <button
                    onClick={clearLogs}
                    className="text-[9px] bg-red-900/20 hover:bg-red-900/40 text-red-400 px-2 py-0.5 rounded border border-red-800/40"
                  >
                    🗑 Limpar
                  </button>
                  <span className="text-[9px] text-slate-500">{systemLogs.length} logs registrados</span>
                </div>
              </div>
            )}

            {/* Conteúdo Aba NOTÍCIAS */}
            {activeLogTab === 'noticias' && (
              <div className="flex-1 flex flex-col justify-between overflow-hidden">
                <div className="news-filter-bar flex gap-1 mb-2">
                  {(['all', 'high', 'medium', 'low'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setNewsFilter(f)}
                      className={`news-filter-btn px-2 py-0.5 text-[9px] rounded border ${newsFilter === f ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                    >
                      {f === 'all' ? 'Todas' : f === 'high' ? 'Alto' : f === 'medium' ? 'Médio' : 'Baixo'}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto space-y-1 font-mono text-[9px] scrollbar-hide pr-1">
                  {filteredNews.length === 0 ? (
                    <div className="text-slate-600 text-center py-10">Nenhuma notícia para o filtro...</div>
                  ) : (
                    filteredNews.map(item => (
                      <div
                        key={item.id}
                        className={`news-item ${item.impact === 'high' ? 'news-high border-l-red-500 bg-red-950/5' : item.impact === 'medium' ? 'news-medium border-l-yellow-500 bg-yellow-950/5' : 'news-low border-l-green-500 bg-green-950/5'} border-l-2 p-1.5 rounded flex justify-between items-start`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1">
                            <span className="news-country bg-blue-900/30 text-blue-300 px-1 rounded text-[8px]">{item.country}</span>
                            <span className="font-bold text-slate-200">{item.event_name}</span>
                          </div>
                          <div className="text-[8px] text-slate-500 flex gap-2">
                            <span>Previsão: {item.forecast || '--'}</span>
                            <span>Anterior: {item.previous || '--'}</span>
                          </div>
                        </div>
                        <span className="news-countdown text-slate-400 font-bold text-[8px] whitespace-nowrap bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                          {item.event_time}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Zoom da Imagem */}
      {isZoomed && screenshot && (
        <div
          className="fixed inset-0 bg-black/95 z-[99999] flex flex-col justify-center items-center p-4 cursor-zoom-out"
          onClick={() => setIsZoomed(false)}
        >
          <button
            onClick={() => setIsZoomed(false)}
            className="absolute top-4 right-4 bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded shadow-lg text-sm"
          >
            Fechar [X]
          </button>
          <img
            src={`data:image/png;base64,${screenshot}`}
            alt="Gráfico Ampliado"
            className="max-h-[90%] max-w-[95%] object-contain border border-slate-700 rounded shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};
