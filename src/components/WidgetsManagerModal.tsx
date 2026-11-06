import React, { useState } from 'react';
import {
  WIDGET_DEFINITIONS,
  MOMENTUM_ASSETS,
  type WidgetConfig,
  type WidgetType
} from '../utils/widgetRegistry';

interface WidgetsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeWidgets: WidgetConfig[];
  onAddWidget: (type: WidgetType, customParams?: Record<string, any>, customTitle?: string) => void;
  onToggleVisibility: (id: string) => void;
  onRemoveWidget: (id: string) => void;
  onResetPositions: () => void;
}

export const WidgetsManagerModal: React.FC<WidgetsManagerModalProps> = ({
  isOpen,
  onClose,
  activeWidgets,
  onAddWidget,
  onToggleVisibility,
  onRemoveWidget,
  onResetPositions
}) => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'active'>('catalog');
  const [selectedAsset, setSelectedAsset] = useState<string>('NVIDIA');
  const [blockTradesLimit, setBlockTradesLimit] = useState<number>(5);

  if (!isOpen) return null;

  const handleAddMomentumAsset = () => {
    const assetObj = MOMENTUM_ASSETS.find(a => a.symbol === selectedAsset);
    const title = `💪 Gauge ${assetObj?.shortName || selectedAsset}`;
    onAddWidget('momentum_asset', { assetSymbol: selectedAsset }, title);
  };

  const handleAddBlockTrades = () => {
    onAddWidget('block_trades', { limit: blockTradesLimit }, '🐋 Block Trades');
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-[#0f172a] border border-slate-700/80 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col text-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧩</span>
            <div>
              <h3 className="text-lg font-bold text-white tracking-wide">Gerenciador de Widgets do Gráfico</h3>
              <p className="text-xs text-slate-400">Insira elementos visuais e cards flutuantes diretamente sobre o gráfico do TradeStation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 p-2 rounded-lg text-sm transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/40 px-6 pt-2">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
                activeTab === 'catalog'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              ➕ Catálogo de Widgets
            </button>
            <button
              onClick={() => setActiveTab('active')}
              className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
                activeTab === 'active'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              📋 Widgets Ativos
              <span className="bg-slate-800 text-slate-300 text-xs px-2 py-0.5 rounded-full font-mono font-bold">
                {activeWidgets.length}
              </span>
            </button>
          </div>

          <button
            onClick={onResetPositions}
            className="text-xs font-bold text-amber-400 hover:text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/40 px-2.5 py-1 rounded-lg mb-2 transition flex items-center gap-1"
            title="Auto-organizar todos os widgets em posições limpas na tela"
          >
            <span>🔄 Auto-Organizar Posições</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {activeTab === 'catalog' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* 1. Axion ML Radar (Destaque Principal) */}
                <div className="bg-gradient-to-br from-purple-950/40 via-slate-900/90 to-slate-900/80 border-2 border-purple-500/60 hover:border-purple-400 p-4 rounded-xl flex flex-col justify-between transition group md:col-span-2 shadow-xl shadow-purple-950/30">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">🧠</span>
                        <div>
                          <h4 className="text-sm font-black text-white group-hover:text-purple-300 transition flex items-center gap-1.5">
                            <span>Axion ML Radar & Confluência Gamma</span>
                            <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/80 border border-emerald-500/40 px-1.5 py-0.5 rounded">NOVO</span>
                          </h4>
                          <span className="text-[11px] text-slate-400 font-mono">Radar móvel de Inteligência Preditiva + ATR + Gamma</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded bg-purple-500/25 text-purple-300 border border-purple-500/50 shadow-sm">
                        IA Preditiva + ATR
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Card móvel arrastável sobre o gráfico. Exibe probabilidades de Compra/Venda, equilíbrio dinâmico (cabo de guerra), perspectiva tática Gamma (Reversão, Breakout ou Corredor), confluência de volume institucional e alvos dinâmicos calculados por ATR. Totalmente integrado com o Copilot IA.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-purple-900/40 flex items-center justify-between">
                    <span className="text-[11px] text-purple-300/80 font-mono flex items-center gap-1">
                      <span>⚡</span>
                      <span>Arraste e solte livremente na tela</span>
                    </span>
                    <button
                      onClick={() => onAddWidget('axion_ml_radar', {}, '🧠 Axion ML Radar')}
                      className="bg-purple-600 hover:bg-purple-500 text-white font-black text-xs px-4 py-2 rounded-lg transition active:scale-95 flex items-center gap-1.5 shadow-lg shadow-purple-950/60 cursor-pointer"
                    >
                      <span>➕ Inserir no Gráfico</span>
                    </button>
                  </div>
                </div>

                {/* 1.1 Mapa Quantitativo de Gamma & Sessões (Destaque Novo) */}
                <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900/90 to-slate-900/80 border-2 border-indigo-500/60 hover:border-indigo-400 p-4 rounded-xl flex flex-col justify-between transition group md:col-span-2 shadow-xl shadow-indigo-950/30">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">🗺️</span>
                        <div>
                          <h4 className="text-sm font-black text-white group-hover:text-indigo-300 transition flex items-center gap-1.5">
                            <span>Mapa Quantitativo de Gamma &amp; Sessões</span>
                            <span className="text-[10px] text-indigo-400 font-mono bg-indigo-950/80 border border-indigo-500/40 px-1.5 py-0.5 rounded">NOVO</span>
                          </h4>
                          <span className="text-[11px] text-slate-400 font-mono">Cockpit tático com Arquétipos, Viés do Dia/Momento e Sessões</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded bg-indigo-500/25 text-indigo-300 border border-indigo-500/50 shadow-sm">
                        GAMMA + SESSÕES
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Painel tático flutuante sobre o gráfico. Identifica o <strong className="text-indigo-300">Arquétipo do Dia</strong> (Gaiola, Vácuo, Imã HVL ou Concreto), a <strong className="text-indigo-300">Sessão Vigente</strong> (Ásia, Europa, Pré-Mercado, RTH), matriz de distâncias exatas em pontos (Ajuste, HVL, Put/Call 0DTE) e projeção de alvos TP/SL com seletor dinâmico dos estudos salvos pelo Admin.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-indigo-900/40 flex items-center justify-between">
                    <span className="text-[11px] text-indigo-300/80 font-mono flex items-center gap-1">
                      <span>⚡</span>
                      <span>Arraste e solte livremente na tela</span>
                    </span>
                    <button
                      onClick={() => onAddWidget('gamma_quant_map', {}, '🗺️ Mapa Quantitativo de Gamma & Sessões')}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs px-4 py-2 rounded-lg transition active:scale-95 flex items-center gap-1.5 shadow-lg shadow-indigo-950/60 cursor-pointer"
                    >
                      <span>➕ Inserir no Gráfico</span>
                    </button>
                  </div>
                </div>

                {/* 2. Velocímetro */}
                <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">⚡</span>
                      <h4 className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                        Velocímetro de Sentimento
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Gauges circulares com agulhas móveis para Sentimento Macro (compensado) e Micro (mercado direto).
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={() => onAddWidget('speedometer')}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                    >
                      <span>➕ Inserir no Gráfico</span>
                    </button>
                  </div>
                </div>

                {/* 2. Block Trades */}
                <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">🐋</span>
                      <h4 className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                        Block Trades Institucionais
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mb-3">
                      Últimas ordens institucionais de alto volume com lado COMPRA/VENDA, quantidade de contratos, preço e horário.
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <span>Exibir:</span>
                      <select
                        value={blockTradesLimit}
                        onChange={(e) => setBlockTradesLimit(Number(e.target.value))}
                        className="bg-slate-950 border border-slate-700 text-white rounded px-2 py-1 outline-none text-xs font-bold"
                      >
                        <option value={3}>3 trades</option>
                        <option value={5}>5 trades (Padrão)</option>
                        <option value={8}>8 trades</option>
                        <option value={10}>10 trades</option>
                        <option value={15}>15 trades</option>
                        <option value={20}>20 trades</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={handleAddBlockTrades}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                    >
                      <span>➕ Inserir no Gráfico</span>
                    </button>
                  </div>
                </div>

                {/* 3. Acelerômetro */}
                <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">⚡</span>
                      <h4 className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                        Acelerômetro de Mercado
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Medidores de Z-Score e ATR Ratio com barras de gradiente e identificação do estado de expansão.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={() => onAddWidget('accelerometer')}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                    >
                      <span>➕ Inserir no Gráfico</span>
                    </button>
                  </div>
                </div>

                {/* 4. Viés Gamma */}
                <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">🗺️</span>
                      <h4 className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                        Viés do Gamma & Níveis
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Viés consolidado (BULL/BEAR), Score de confluência, força Compra vs Venda % e suportes/resistências chave.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={() => onAddWidget('gamma_bias')}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                    >
                      <span>➕ Inserir no Gráfico</span>
                    </button>
                  </div>
                </div>

                {/* 5. Medidor Delta */}
                <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">⚖️</span>
                      <h4 className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                        Medidor de Delta
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Barra de balanço Delta Venda/Compra, Δ numérico, Delta Ratio, Prints por segundo e seletor de janelas temporais.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={() => onAddWidget('delta_meter')}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                    >
                      <span>➕ Inserir no Gráfico</span>
                    </button>
                  </div>
                </div>

                {/* 6. Gauge Individual de Ativo Momentum */}
                <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">💪</span>
                      <h4 className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                        Gauge de Ativo Momentum
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mb-3">
                      Gauge com agulha e direção Compra/Venda para qualquer ativo individual da cesta de confluência.
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <span>Escolher Ativo:</span>
                      <select
                        value={selectedAsset}
                        onChange={(e) => setSelectedAsset(e.target.value)}
                        className="bg-slate-950 border border-slate-700 text-white rounded px-2 py-1 outline-none text-xs font-bold"
                      >
                        {MOMENTUM_ASSETS.map(a => (
                          <option key={a.symbol} value={a.symbol}>
                            {a.shortName} — {a.fullName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={handleAddMomentumAsset}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                    >
                      <span>➕ Inserir Gauge ({MOMENTUM_ASSETS.find(a => a.symbol === selectedAsset)?.shortName})</span>
                    </button>
                  </div>
                </div>

                {/* 7. Força Momentum Cesta Geral */}
                <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition group md:col-span-2">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">📊</span>
                      <h4 className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                        Força Momentum (Cesta Geral Completa)
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Painel compacto listando todos os ativos da cesta (NDAQ, SP500, DXY, VIX, NVDA, TSLA, AAPL, MSFT, META, etc.) com suas forças de compra e venda.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={() => onAddWidget('momentum_overview')}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                    >
                      <span>➕ Inserir Cesta Completa</span>
                    </button>
                  </div>
                </div>

                {/* 8. Core Analytics */}
                <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">📊</span>
                      <h4 className="text-sm font-bold text-white group-hover:text-emerald-400 transition">
                        Core Analytics
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Barras LED segmentadas para Analytics QQQ, Estrutura de Mercado QQQ/SPY e status de IA com glow ativo.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={() => onAddWidget('grix_analytics', {}, '📊 Core Analytics')}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                    >
                      <span>➕ Inserir no Gráfico</span>
                    </button>
                  </div>
                </div>

                {/* 9. Anchors SPY & QQQ */}
                <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">🧭</span>
                      <h4 className="text-sm font-bold text-white group-hover:text-emerald-400 transition">
                        Anchors — SPY &amp; QQQ
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Velocímetros com ARO dinâmico verde/vermelho de SPY e QQQ com percentuais e sinais COMPRA/VENDA.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={() => onAddWidget('grix_anchors', {}, '🧭 Anchors — SPY & QQQ')}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                    >
                      <span>➕ Inserir no Gráfico</span>
                    </button>
                  </div>
                </div>

                {/* 10. Flow and Exposure */}
                <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">🌊</span>
                      <h4 className="text-sm font-bold text-white group-hover:text-cyan-400 transition">
                        Flow &amp; Exposure
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      5 barras LED: Rho Index, Tail Risk, Volatility Smile QQQ/SPY e Net Gamma.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={() => onAddWidget('grix_flow', {}, '🌊 Flow & Exposure')}
                      className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                    >
                      <span>➕ Inserir no Gráfico</span>
                    </button>
                  </div>
                </div>

                {/* 11. Stock Replacement */}
                <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">🔄</span>
                      <h4 className="text-sm font-bold text-white group-hover:text-emerald-400 transition">
                        Stock Replacement (QQQ)
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Velocímetros com ARO dinâmico para estratégias de CALL e PUT com percentuais e sinais COMPRA/VENDA.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={() => onAddWidget('grix_stock_replacement', {}, '🔄 Stock Replacement (QQQ)')}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                    >
                      <span>➕ Inserir no Gráfico</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* ── GRUPO: PROJEÇÕES ── */}
              <div>
                <div className="flex items-center gap-2 mb-3 mt-2">
                  <span className="text-base">🔭</span>
                  <h3 className="text-xs font-extrabold text-violet-400 uppercase tracking-[0.15em]">Projeções</h3>
                  <div className="flex-1 h-px bg-violet-800/40" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* 12. Projeções de Mercado */}
                  <div className="bg-slate-900/60 border border-violet-900/60 hover:border-violet-700/60 p-4 rounded-xl flex flex-col justify-between transition group md:col-span-2">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">🔭</span>
                        <h4 className="text-sm font-bold text-white group-hover:text-violet-400 transition">
                          Projeções de Mercado
                        </h4>
                        <span className="text-[9px] font-bold bg-violet-600/30 border border-violet-500/40 text-violet-300 px-1.5 py-0.5 rounded uppercase tracking-wide">Novo</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Painel com 3 abas: <strong className="text-slate-300">Projeção</strong> técnica do NQ/QQQ, <strong className="text-slate-300">Resumo</strong> analítico completo e <strong className="text-slate-300">Viés</strong> de Mercado (Altista, Baixista, Neutro, Misto, Volátil).
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                      <button
                        onClick={() => onAddWidget('projecao_mercado', {}, '🔭 Projeções de Mercado')}
                        className="bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                      >
                        <span>➕ Inserir no Gráfico</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'active' && (
            <div className="space-y-3">
              {activeWidgets.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <span className="text-3xl block mb-2">🧩</span>
                  <p className="text-sm">Nenhum widget ativo no momento.</p>
                  <p className="text-xs mt-1 text-slate-600">Acesse o Catálogo para adicionar widgets sobre o gráfico.</p>
                </div>
              ) : (
                activeWidgets.map((w) => (
                  <div
                    key={w.id}
                    className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">
                        {WIDGET_DEFINITIONS[w.type]?.icon || '🧩'}
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-white">{w.title}</h4>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                          <span>Posição: X={w.position.x}px, Y={w.position.y}px</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onToggleVisibility(w.id)}
                        className={`text-xs px-2.5 py-1 rounded-lg font-bold border transition ${
                          w.visible
                            ? 'bg-blue-950/60 border-blue-800 text-blue-300 hover:bg-blue-900/60'
                            : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {w.visible ? '👁️ Visível' : '🙈 Oculto'}
                      </button>

                      <button
                        onClick={() => onRemoveWidget(w.id)}
                        className="text-xs bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 hover:text-rose-200 px-2.5 py-1 rounded-lg font-bold transition"
                      >
                        🗑️ Excluir
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/40 flex justify-between items-center text-xs text-slate-400">
          <span>💡 Arraste os cards diretamente no gráfico segurando o cabeçalho.</span>
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-1.5 rounded-lg transition"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
