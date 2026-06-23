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

  // Helper de cores de fundo para os badges de níveis
  const getCorFundo = (tipo: string) => {
    const c: { [key: string]: string } = {
      hvl: '#a855f7',
      call: '#ef4444',
      put: '#22c55e',
      max1d: '#06b6d4',
      min1d: '#eab308',
      prev: '#f97316',
      prevH: '#f87171',
      prevL: '#4ade80',
      hvl0: '#c084fc',
      call0: '#fca5a5',
      put0: '#86efac',
      gwall: '#fbbf24',
      gex: '#a855f7',
      bl: '#3b82f6'
    };
    return c[tipo] || '#64748b';
  };

  // Cálculo do Mapa de Níveis
  const renderLevelsMap = () => {
    if (!marketData || !gammaLevels) {
      return <div className="text-slate-600 text-sm text-center py-6">Aguardando dados...</div>;
    }

    const currentPrice = Number(marketData.price);
    const activePrices: number[] = [];
    if (!isNaN(currentPrice) && currentPrice > 0) {
      activePrices.push(currentPrice);
    }

    // Mapear chaves de níveis e suas cores/labels
    const niveis: { label: string; class: string; price: number }[] = [];
    
    const pushNivel = (val: any, label: string, tipo: string) => {
      const num = Number(val);
      if (val && !isNaN(num) && num > 0 && !disabledLevels.includes(tipo)) {
        niveis.push({ label, class: tipo, price: num });
        activePrices.push(num);
      }
    };

    pushNivel(gammaLevels.hvl, 'HVL', 'hvl');
    pushNivel(gammaLevels.call, 'Call', 'call');
    pushNivel(gammaLevels.put, 'Put', 'put');
    pushNivel(gammaLevels.max1d, 'Max', 'max1d');
    pushNivel(gammaLevels.min1d, 'Min', 'min1d');
    pushNivel(gammaLevels.prev, 'Ajuste', 'prev');
    pushNivel(gammaLevels.prevH, 'MxAnt', 'prevH');
    pushNivel(gammaLevels.prevL, 'MnAnt', 'prevL');
    pushNivel(gammaLevels.hvl0, 'HVL0', 'hvl0');
    pushNivel(gammaLevels.call0, 'Call0', 'call0');
    pushNivel(gammaLevels.put0, 'Put0', 'put0');
    pushNivel(gammaLevels.gwall, 'GWall', 'gwall');

    // Adicionar listas GEX e BL adicionais
    if (gammaLevels.bl && !disabledLevels.includes('bl')) {
      gammaLevels.bl.forEach((v, i) => {
        if (v > 0) {
          niveis.push({ label: `BL${i + 1}`, class: 'bl', price: v });
          activePrices.push(v);
        }
      });
    }
    if (gammaLevels.gex && !disabledLevels.includes('gex')) {
      gammaLevels.gex.forEach((v, i) => {
        if (v > 0) {
          niveis.push({ label: `GEX${i + 1}`, class: 'gex', price: v });
          activePrices.push(v);
        }
      });
    }

    if (niveis.length === 0 && activePrices.length === 0) {
      return <div className="text-slate-600 text-sm text-center py-6">Aguardando dados...</div>;
    }

    const rawMin = Math.min(...activePrices);
    const rawMax = Math.max(...activePrices);
    const rawRange = rawMax - rawMin || 20;
    const margem = rawRange * 0.10; // Margem de 10% do projeto base offline
    const tMin = rawMin - margem;
    const tMax = rawMax + margem;
    const range = tMax - tMin;

    const getPercent = (p: number) => {
      // Inverter a direção conforme lógica offline (100 - x)
      return 100 - ((p - tMin) / range) * 100;
    };

    return (
      <div className="relative h-full w-full">
        {/* Linhas de Nível */}
        {niveis.map((n, idx) => {
          const pct = getPercent(n.price);
          return (
            <div
              key={idx}
              className={`nivel-linha ${n.class}`}
              style={{ left: `${pct.toFixed(2)}%` }}
            >
              <span 
                className="nivel-label text-white text-[8px]" 
                style={{ backgroundColor: getCorFundo(n.class) }}
              >
                {n.label}
              </span>
            </div>
          );
        })}

        {/* Linha do Preço Atual */}
        {!isNaN(currentPrice) && currentPrice > 0 && (
          <div
            className="preco-marker"
            style={{ left: `${getPercent(currentPrice).toFixed(2)}%` }}
            title={`Preço Atual: ${currentPrice}`}
          />
        )}

        {/* Indicadores de Mínimo e Máximo do Range nas extremidades */}
        <div className="absolute bottom-1 left-1 text-[8px] text-slate-500 font-mono font-bold">
          {tMax.toFixed(2)}
        </div>
        <div className="absolute bottom-1 right-1 text-[8px] text-slate-500 font-mono font-bold text-right">
          {tMin.toFixed(2)}
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
    const value = Math.round(marketData.sentiment); // Apenas valor inteiro sem decimal
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

  const renderNewsCountdown = (itemDate: Date) => {
    const now = new Date();
    const itemTime = new Date(itemDate);
    const diffMs = itemTime.getTime() - now.getTime();
    const diffMin = Math.round(diffMs / 60000);
    const timeStr = itemTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Pega limites locais (default 5 e 15 como no projeto base)
    const alertBefore = 5;
    const alertAfter = 15;

    if (diffMs > 0) {
      if (diffMin <= alertBefore) {
        return <span className="news-countdown imminent">⏰ {diffMin}min</span>;
      } else if (diffMin <= 30) {
        const hours = Math.floor(diffMin / 60);
        const mins = diffMin % 60;
        const label = hours > 0 ? `${hours}h${mins}m` : `${mins}min`;
        return <span className="news-countdown soon">⏰ {label}</span>;
      } else {
        return <span className="news-countdown distant">{timeStr}</span>;
      }
    } else {
      const afterMin = Math.abs(diffMin);
      if (afterMin <= alertAfter) {
        return <span className="news-countdown imminent animate-pulse">🔥 ATIVA</span>;
      } else {
        return <span className="news-countdown passed">✓ {timeStr}</span>;
      }
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
                  {marketData?.sentiment !== undefined ? `${Math.round(marketData.sentiment)}%` : '0%'}
                </div>
              </div>
            </div>
            <div className="gauge-labels-compact text-[9px] flex justify-between px-2">
              <span className="text-red-400 font-bold">Vendedor</span>
              <span className="text-green-400 font-bold">Comprador</span>
            </div>
          </div>
        </div>

        {/* Coluna 2: Força Momentum - Largura 2/12 */}
        <div className="col-span-12 md:col-span-6 lg:col-span-2">
          <div className="glass p-3 rounded-lg h-full border border-slate-800 flex flex-col">
            <div className="text-xs font-bold text-purple-400 uppercase mb-2">💪 Força Momentum</div>
            <div className="space-y-1 flex-1 overflow-y-auto pr-1">
              {forces.length === 0 ? (
                <div className="text-slate-500 text-xs py-4 text-center">Buscando forces...</div>
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
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-3">
          {/* Card Decisão IA */}
          <div className={`relative flex-1 glass p-3 rounded-lg border-2 ${!aiEnabled ? 'border-yellow-500/40' : aiResult ? getSignalBorderClass(aiResult.sinal) : 'border-slate-800'} flex flex-col justify-between min-h-[180px]`}>
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
                className="mt-2.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded text-xs font-bold w-full transition"
              >
                {isAnalyzing ? 'Executando...' : '🔍 Analisar Agora'}
              </button>

              <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                <div className="bg-slate-900 border border-slate-800 p-1.5 rounded">
                  <div className="text-[10px] text-slate-500">🎯 Alvo</div>
                  <div className="text-green-400 font-mono font-bold">{aiResult?.alvo || '--'}</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-1.5 rounded">
                  <div className="text-[10px] text-slate-500">🛑 Stop</div>
                  <div className="text-red-400 font-mono font-bold">{aiResult?.stop || '--'}</div>
                </div>
              </div>

              {aiResult?.resumo && (
                <div className="mt-2 text-[10px] text-slate-300 text-left bg-slate-900/50 p-2 rounded border border-slate-850 max-h-16 overflow-y-auto leading-relaxed">
                  {aiResult.resumo}
                </div>
              )}
            </div>
          </div>

          {/* Delta Gauge (Sempre Visível) */}
          <div className="glass p-3 rounded-lg border border-slate-800 flex flex-col justify-between">
            <div className="delta-gauge-wrap !border-t-0 !pt-0 !mt-0">
              <div className="delta-gauge-labels text-[9px] flex justify-between font-bold text-slate-400">
                <span className="text-red-400 font-bold">VENDA</span>
                <span>DELTA</span>
                <span className="text-green-400 font-bold">COMPRA</span>
              </div>
              <div className="delta-gauge-bar mt-1 h-2.5 bg-slate-850 rounded-full relative overflow-hidden">
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

            {/* Seletor de Janelas Temporais */}
            <div className="flex gap-1 mt-2.5 justify-center">
              <button className="window-btn active text-[9px] px-2 py-0.5">Acumulado</button>
              <button className="window-btn text-[9px] px-2 py-0.5">1m</button>
              <button className="window-btn text-[9px] px-2 py-0.5">5m</button>
              <button className="window-btn text-[9px] px-2 py-0.5">15m</button>
            </div>
            <div className="text-[8px] text-center text-slate-500 mt-1">
              Janela ativa: <span className="text-blue-400 font-bold">Acumulado</span>
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
            <div className="flex-1 overflow-y-auto py-2 font-mono text-[10px] text-slate-400 space-y-1.5 scrollbar-hide">
              {!marketData?.blockTrades || marketData.blockTrades.length === 0 ? (
                <div className="text-slate-500 text-center py-10">Sem ordens registradas...</div>
              ) : (
                marketData.blockTrades.map((trade, idx) => {
                  const isCompra = trade.side === 'COMPRA';
                  return (
                    <div 
                      key={idx} 
                      className={`p-1.5 rounded border border-l-2 text-[9px] flex justify-between items-center ${
                        isCompra 
                          ? 'bg-green-950/25 border-green-900/50 border-l-green-500 text-green-400' 
                          : 'bg-red-950/25 border-red-900/50 border-l-red-500 text-red-400'
                      }`}
                    >
                      <span className="font-bold">{trade.side}</span>
                      <span>{trade.volume} ct @ {trade.price}</span>
                      <span className="text-slate-500 text-[8px]">{trade.time}</span>
                    </div>
                  );
                })
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
                            <span className="font-bold text-slate-200">{item.title}</span>
                          </div>
                          <div className="text-[8px] text-slate-500 flex gap-2">
                            <span>Previsão: {item.forecast || '--'}</span>
                            <span>Anterior: {item.previous || '--'}</span>
                          </div>
                        </div>
                        {renderNewsCountdown(item.date)}
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
