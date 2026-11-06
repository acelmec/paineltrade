import React, { useState, useEffect, useMemo } from 'react';
import {
  getChartErrorLogs,
  clearChartErrorLogs,
  exportChartErrorReport,
  type ChartErrorEntry
} from '../utils/chartErrorLogger';

export const ChartDiagnosticsViewer: React.FC = () => {
  const [logs, setLogs] = useState<ChartErrorEntry[]>(() => getChartErrorLogs());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('todos');
  const [selectedPanel, setSelectedPanel] = useState<string>('todos');
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [reportCopied, setReportCopied] = useState<boolean>(false);

  // Sincronização em tempo real (0ms) com novas capturas de erro
  useEffect(() => {
    const handleUpdate = () => {
      setLogs(getChartErrorLogs());
    };
    window.addEventListener('vortex_chart_error_recorded', handleUpdate);
    window.addEventListener('vortex_chart_error_cleared', handleUpdate);
    return () => {
      window.removeEventListener('vortex_chart_error_recorded', handleUpdate);
      window.removeEventListener('vortex_chart_error_cleared', handleUpdate);
    };
  }, []);

  const panelsList = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => {
      if (l.panelName) set.add(l.panelName);
    });
    return Array.from(set);
  }, [logs]);

  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => {
      if (l.elementCategory) set.add(l.elementCategory);
    });
    return Array.from(set);
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (selectedType !== 'todos' && log.type !== selectedType) return false;
      if (selectedPanel !== 'todos' && log.panelName !== selectedPanel) return false;
      if (selectedCategory !== 'todos' && log.elementCategory !== selectedCategory) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      return (
        log.message.toLowerCase().includes(q) ||
        (log.graphicElement && log.graphicElement.toLowerCase().includes(q)) ||
        (log.probableFile && log.probableFile.toLowerCase().includes(q)) ||
        (log.panelName && log.panelName.toLowerCase().includes(q)) ||
        (log.stack && log.stack.toLowerCase().includes(q)) ||
        (log.componentStack && log.componentStack.toLowerCase().includes(q))
      );
    });
  }, [logs, selectedType, selectedPanel, selectedCategory, searchQuery]);

  const totalErrors = logs.length;
  const totalOccurrences = logs.reduce((acc, l) => acc + (l.count || 1), 0);
  const chartErrorsCount = logs.filter(l => l.type === 'lightweight-charts').length;
  const unhandledCount = logs.filter(l => l.type === 'unhandled-rejection').length;

  const handleCopyLog = (log: ChartErrorEntry) => {
    const text = `[ERRO TW #${log.id}]\nData: ${log.timestamp}\nOcorrências: ${log.count}x\nElemento Gráfico: ${log.graphicElement || 'N/A'}\nArquivo Provável: ${log.probableFile || 'N/A'}\nAção Recomendada: ${log.actionableFix || 'N/A'}\nTipo: ${log.type}\nPainel: ${log.panelName} (${log.panelId})\nMensagem: ${log.message}\nStack:\n${log.stack || 'N/A'}\nComponentStack:\n${log.componentStack || 'N/A'}`;
    navigator.clipboard.writeText(text);
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyFullReport = () => {
    const report = exportChartErrorReport();
    navigator.clipboard.writeText(report);
    setReportCopied(true);
    setTimeout(() => setReportCopied(false), 2500);
  };

  const handleExportJSON = () => {
    const jsonStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vortex_tw_errors_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearAll = () => {
    if (window.confirm('Deseja realmente limpar todo o histórico de erros do TradingView?')) {
      clearChartErrorLogs();
      setLogs([]);
    }
  };

  const getCategoryBadge = (cat?: string) => {
    switch (cat) {
      case 'drawings':
        return { label: 'Desenhos (Overlay)', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
      case 'indicator':
        return { label: 'Indicador Técnico', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
      case 'markers':
        return { label: 'Marcadores de Sinais', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
      case 'levels':
        return { label: 'Níveis Gamma / Linhas', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
      case 'news':
        return { label: 'Notícias Econômicas', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
      case 'widgets':
        return { label: 'Widgets Overlay', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' };
      default:
        return { label: 'Motor do Gráfico', color: 'bg-slate-700/40 text-slate-300 border-slate-600' };
    }
  };

  return (
    <div className="w-full min-h-[85vh] p-3 md:p-6 bg-[#0a0e1a] text-slate-100 flex flex-col gap-5">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center text-2xl shadow-inner shadow-red-500/20">
            🛠️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Central de Diagnóstico & Logs do TradingView
              </h1>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                Admin
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Identificação exata de elementos gráficos, indicadores, desenhos e exceções do Lightweight Charts.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCopyFullReport}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md ${
              reportCopied
                ? 'bg-emerald-600 text-white border border-emerald-500'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            {reportCopied ? '✅ Relatório Copiado!' : '📋 Copiar Relatório'}
          </button>

          <button
            onClick={handleExportJSON}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-all shadow-md"
            title="Exportar logs em arquivo JSON"
          >
            📥 Exportar JSON
          </button>

          <button
            onClick={handleClearAll}
            disabled={logs.length === 0}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5 transition-all shadow-md"
          >
            🗑️ Limpar Logs
          </button>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900/60 border border-slate-800/80 p-3 rounded-lg flex flex-col">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Erros Únicos</span>
          <span className="text-2xl font-bold text-white mt-1">{totalErrors}</span>
          <span className="text-[10px] text-slate-500 mt-0.5">Assinaturas distintas</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 p-3 rounded-lg flex flex-col">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total de Ocorrências</span>
          <span className="text-2xl font-bold text-amber-400 mt-1">{totalOccurrences}</span>
          <span className="text-[10px] text-slate-500 mt-0.5">Eventos interceptados</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 p-3 rounded-lg flex flex-col">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Lightweight Charts</span>
          <span className="text-2xl font-bold text-purple-400 mt-1">{chartErrorsCount}</span>
          <span className="text-[10px] text-slate-500 mt-0.5">Exceções de motor gráfico</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 p-3 rounded-lg flex flex-col">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Rejeições Assíncronas</span>
          <span className="text-2xl font-bold text-cyan-400 mt-1">{unhandledCount}</span>
          <span className="text-[10px] text-slate-500 mt-0.5">Unhandled Promises</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-900/50 border border-slate-800/80 p-3 rounded-lg flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="w-full md:w-80 relative">
          <span className="absolute left-3 top-2.5 text-slate-500 text-xs">🔍</span>
          <input
            type="text"
            placeholder="Buscar por elemento, mensagem, stack ou painel..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950/80 border border-slate-700/80 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          {categoriesList.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span>Elemento:</span>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="todos">Todos Elementos</option>
                <option value="indicator">Indicadores Técnicos</option>
                <option value="drawings">Desenhos / Retângulos</option>
                <option value="markers">Marcadores de Sinais</option>
                <option value="levels">Níveis Gamma / Linhas</option>
                <option value="news">Notícias</option>
                <option value="widgets">Widgets Overlay</option>
                <option value="engine">Motor do Gráfico</option>
              </select>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Tipo:</span>
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="todos">Todos os Tipos</option>
              <option value="lightweight-charts">Lightweight Charts</option>
              <option value="unhandled-rejection">Rejeição Assíncrona</option>
              <option value="error-boundary">ErrorBoundary React</option>
              <option value="indicator-calc">Cálculo de Indicador</option>
            </select>
          </div>

          {panelsList.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span>Painel:</span>
              <select
                value={selectedPanel}
                onChange={e => setSelectedPanel(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="todos">Todos os Painéis</option>
                {panelsList.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Error Logs List */}
      {filteredLogs.length === 0 ? (
        <div className="w-full py-16 flex flex-col items-center justify-center bg-slate-900/30 border border-slate-800/60 rounded-xl text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-3xl mb-3 shadow-inner shadow-emerald-500/20">
            🛡️
          </div>
          <h3 className="text-base font-bold text-slate-200">
            {logs.length === 0 ? 'Nenhum erro de gráfico registrado' : 'Nenhum erro corresponde aos filtros'}
          </h3>
          <p className="text-xs text-slate-400 max-w-md mt-1">
            {logs.length === 0
              ? 'O motor gráfico do TradingView e os cálculos de indicadores estão operando de forma 100% estável e saudável.'
              : 'Tente alterar os termos de busca ou remover os filtros aplicados acima.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredLogs.map(log => {
            const isExpanded = expandedLogId === log.id;
            const isCopied = copiedId === log.id;
            const catBadge = getCategoryBadge(log.elementCategory);

            return (
              <div
                key={log.id}
                className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden transition-all shadow-md"
              >
                {/* Item Header */}
                <div
                  className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer select-none bg-slate-950/40"
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-lg mt-0.5">⚠️</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Graphical Element Badge */}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${catBadge.color}`}>
                          {catBadge.label}
                        </span>

                        {log.count > 1 && (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {log.count}x ocorrências
                          </span>
                        )}

                        <span className="text-xs font-semibold text-slate-300">
                          {log.panelName || 'Painel Principal'}
                        </span>

                        {log.timeframe && (
                          <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                            {log.timeframe}m
                          </span>
                        )}
                      </div>

                      {/* Explicit Graphic Element Identification */}
                      <div className="text-xs font-bold text-amber-300 mt-1 flex items-center gap-1.5">
                        <span>🎯 Elemento Gráfico:</span>
                        <span className="text-white font-mono bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                          {log.graphicElement || 'Motor Gráfico TradingView'}
                        </span>
                      </div>

                      {/* Error Message */}
                      <div className="text-xs md:text-sm font-mono font-medium text-rose-400 mt-1 truncate max-w-[80vw] md:max-w-3xl">
                        {log.message}
                      </div>

                      <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-3">
                        <span>Primeira: {log.timestamp}</span>
                        {log.count > 1 && <span>Última: {log.lastOccurred}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyLog(log);
                      }}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                        isCopied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                      title="Copiar detalhes do erro"
                    >
                      {isCopied ? '✅ Copiado' : '📋 Copiar'}
                    </button>

                    <span className="text-slate-400 text-xs px-1">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {/* Diagnostic Suggestion Ribbon */}
                <div className="px-4 py-2 bg-blue-950/25 border-t border-b border-blue-900/30 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs text-blue-300">
                  <div className="flex items-start gap-2">
                    <span className="text-sm">💡</span>
                    <div>
                      <span className="font-semibold text-blue-200">Causa & Ação Recomendada: </span>
                      <span>{log.actionableFix || 'Exceção interceptada e tratada com segurança pelo sistema.'}</span>
                    </div>
                  </div>
                  {log.probableFile && (
                    <div className="text-[11px] text-slate-400 font-mono self-end md:self-auto bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      📁 {log.probableFile}
                    </div>
                  )}
                </div>

                {/* Expanded Details Drawer */}
                {isExpanded && (
                  <div className="p-4 bg-[#060a14] border-t border-slate-800 flex flex-col gap-4 text-xs">
                    {log.activeIndicators && log.activeIndicators.length > 0 && (
                      <div>
                        <div className="text-slate-400 font-semibold mb-1">Indicadores Ativos no Momento:</div>
                        <div className="flex flex-wrap gap-1.5">
                          {log.activeIndicators.map(ind => (
                            <span key={ind} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">
                              {ind}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {log.stack && (
                      <div>
                        <div className="flex items-center justify-between text-slate-400 font-semibold mb-1">
                          <span>Stack Trace Detalhado:</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(log.stack || '')}
                            className="text-[11px] text-blue-400 hover:text-blue-300 underline"
                          >
                            Copiar Stack
                          </button>
                        </div>
                        <pre className="p-3 rounded-lg bg-black/80 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
                          {log.stack}
                        </pre>
                      </div>
                    )}

                    {log.componentStack && (
                      <div>
                        <div className="text-slate-400 font-semibold mb-1">Hierarquia de Componentes React:</div>
                        <pre className="p-3 rounded-lg bg-black/80 border border-slate-800 font-mono text-[11px] text-slate-400 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                          {log.componentStack}
                        </pre>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                      <div>
                        <span className="font-semibold text-slate-300">URL: </span>
                        <span className="font-mono">{log.url}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-300">Navegador: </span>
                        <span className="font-mono truncate block">{log.userAgent}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ChartDiagnosticsViewer;
