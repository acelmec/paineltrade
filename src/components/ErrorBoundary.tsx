import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { recordChartError } from '../utils/chartErrorLogger';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  autoRetries: number;
  copied: boolean;
  showDetails: boolean;
}

interface ParsedDiagnostics {
  origin: string;
  probableCause: string;
  componentTrace: string[];
  suggestedAction: string;
  sourceFileHint?: string;
}

export const isChartRelatedError = (error: Error | null, errorInfo: ErrorInfo | null): boolean => {
  const message = (error?.message || String(error || '')).toLowerCase();
  const stack = (error?.stack || '').toLowerCase();
  const componentStack = (errorInfo?.componentStack || '').toLowerCase();

  return (
    message.includes('value is null') ||
    message.includes('assertion failed') ||
    message.includes('ensurenotnull') ||
    message.includes('seriesbarcolorer') ||
    message.includes('linepaneview') ||
    message.includes('pricetocoordinate') ||
    message.includes('timetocoordinate') ||
    message.includes('coordinatetoprice') ||
    stack.includes('lightweight-charts') ||
    stack.includes('candlechart') ||
    stack.includes('ensurenotnull') ||
    stack.includes('seriesbarcolorer') ||
    componentStack.includes('candlechart') ||
    componentStack.includes('chartdrawingsoverlay')
  );
};

export class ErrorBoundary extends Component<Props, State> {
  private retryTimer: any = null;

  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    autoRetries: 0,
    copied: false,
    showDetails: false
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const isChart = isChartRelatedError(error, errorInfo);
    
    // 📝 Registra no histórico diagnóstico administrativo mesmo que silenciado para o usuário
    recordChartError({
      type: isChart ? 'lightweight-charts' : 'error-boundary',
      message: error?.message || String(error || 'Erro não especificado'),
      stack: error?.stack || '',
      componentStack: errorInfo?.componentStack || '',
      panelName: 'Interface Global'
    });

    if (isChart) {
      console.warn('[ErrorBoundary] Erro do motor gráfico interceptado e registrado no histórico diagnóstico:', error?.message || error);
    } else {
      console.error('[ErrorBoundary] Exceção capturada na interface do React:', error, errorInfo);
    }
    this.setState({ errorInfo });

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }

    if (isChart && this.state.autoRetries < 2) {
      // Auto-recuperação controlada (500ms) sem piscar continuamente
      this.retryTimer = setTimeout(() => {
        this.setState(prevState => ({
          hasError: false,
          error: null,
          errorInfo: null,
          autoRetries: prevState.autoRetries + 1,
          copied: false
        }));
      }, 500);
    } else if (!isChart && this.state.autoRetries < 3) {
      // Erros gerais da interface: auto-recuperação em 3 segundos (máximo 3 tentativas)
      this.retryTimer = setTimeout(() => {
        console.log(`[ErrorBoundary] Tentativa de auto-recuperação ${this.state.autoRetries + 1}/3...`);
        this.setState(prevState => ({
          hasError: false,
          error: null,
          errorInfo: null,
          autoRetries: prevState.autoRetries + 1,
          copied: false
        }));
      }, 3000);
    }
  }

  public componentWillUnmount() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
  }

  private handleManualReset = () => {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.setState({ hasError: false, error: null, errorInfo: null, autoRetries: 0, copied: false });
  };

  private parseDiagnostics = (error: Error | null, errorInfo: ErrorInfo | null): ParsedDiagnostics => {
    const message = error?.message || String(error || '');
    const stack = error?.stack || '';
    const componentStack = errorInfo?.componentStack || '';

    // Extrair nomes dos componentes afetados
    const componentMatches = Array.from(componentStack.matchAll(/^\s*at\s+([A-Za-z0-9_]+)/gm)).map(m => m[1]);
    const uniqueComponents = Array.from(new Set(componentMatches)).slice(0, 5);

    // Tentar identificar linha ou arquivo causador no stack
    let sourceFileHint = '';
    const fileMatch = stack.match(/([a-zA-Z0-9_\-.]+\.(?:tsx|ts|js|jsx):\d+:\d+)/);
    if (fileMatch) {
      sourceFileHint = fileMatch[1];
    }

    // 1. Erro de TradingView / Lightweight Charts
    if (
      message.includes('Value is null') ||
      message.includes('Assertion failed') ||
      stack.includes('lightweight-charts') ||
      stack.includes('ensureNotNull') ||
      stack.includes('priceToCoordinate') ||
      stack.includes('timeToCoordinate') ||
      stack.includes('coordinateToPrice')
    ) {
      return {
        origin: 'TradingView Lightweight Charts (Motor Gráfico)',
        probableCause: 'Uma função interna do gráfico (ex: cálculo de coordenadas de preço/tempo, posicionamento de linhas de ordens ou atualização de velas) recebeu um valor nulo (null/undefined/NaN) ou tentou acessar uma escala antes dos dados serem consolidados.',
        componentTrace: uniqueComponents.length ? uniqueComponents : ['CandleChart', 'TradeWorkstation'],
        suggestedAction: 'Verificar alimentação de candles em tempo real, cálculo de indicadores ou referências de coordenadas no CandleChart.',
        sourceFileHint: sourceFileHint || 'CandleChart.tsx (lightweight-charts)'
      };
    }

    // 2. Erro de Objeto / Propriedade Nula
    if (message.includes('Cannot read properties of') || message.includes('is undefined') || message.includes('is null')) {
      return {
        origin: 'Acesso a Propriedade Indefinida (Runtime React)',
        probableCause: `Tentativa de ler uma propriedade em um objeto inexistente ou nulo: ${message}`,
        componentTrace: uniqueComponents.length ? uniqueComponents : ['Interface React'],
        suggestedAction: 'Adicionar validação opcional (?.) no componente identificado.',
        sourceFileHint
      };
    }

    // 3. Erro de WebSocket / Conexão
    if (message.includes('WebSocket') || message.includes('network') || message.includes('fetch')) {
      return {
        origin: 'Camada de Rede / Conexão em Tempo Real',
        probableCause: 'Falha ou desconexão no fluxo de dados em tempo real.',
        componentTrace: uniqueComponents.length ? uniqueComponents : ['Feed de Cotações'],
        suggestedAction: 'Verificar status da conexão de mercado ou reiniciar o Hub de cotações.',
        sourceFileHint
      };
    }

    // 4. Erro de Interferência no DOM por Extensões ou Tradutores do Navegador
    if (
      message.includes('insertbefore') ||
      message.includes('removechild') ||
      message.includes('not a child of this node') ||
      message.includes('notfounderror')
    ) {
      return {
        origin: 'Interferência de Extensões / Tradutor do Navegador no DOM',
        probableCause: 'O Google Tradutor ou extensões do navegador (ex: tradutores automáticos, corretores, extensões de injeção) alteraram nós do DOM sem o conhecimento do React, desincronizando a árvore de renderização.',
        componentTrace: uniqueComponents.length ? uniqueComponents : ['Interface React'],
        suggestedAction: 'Desative o recurso de tradução automática do navegador para esta página (ou use Aba Anônima) para evitar a mutação de nós nativos.',
        sourceFileHint
      };
    }

    // Diagnóstico Padrão
    return {
      origin: 'Interface / Componente React',
      probableCause: message || 'Exceção não tratada capturada durante a renderização.',
      componentTrace: uniqueComponents.length ? uniqueComponents : ['Componente Desconhecido'],
      suggestedAction: 'Copiar o diagnóstico e inspecionar o código do componente informado.',
      sourceFileHint
    };
  };

  private handleCopyReport = () => {
    const { error, errorInfo } = this.state;
    const diag = this.parseDiagnostics(error, errorInfo);

    const report = [
      '==================================================',
      '        VORTEX WEB - RELATÓRIO DE DIAGNÓSTICO     ',
      '==================================================',
      `Data/Hora: ${new Date().toLocaleString('pt-BR')}`,
      `URL: ${window.location.href}`,
      `Navegador: ${navigator.userAgent}`,
      '',
      `[DIAGNÓSTICO AUTOMÁTICO]`,
      `• Origem Identificada: ${diag.origin}`,
      `• Arquivo/Local Provável: ${diag.sourceFileHint || 'Não identificado no stack'}`,
      `• Causa Provável: ${diag.probableCause}`,
      `• Componentes Afetados: <${diag.componentTrace.join('> -> <')}>`,
      `• Ação Recomendada: ${diag.suggestedAction}`,
      '',
      `[MENSAGEM ORIGINAL]`,
      `${error?.name || 'Error'}: ${error?.message || String(error || 'Sem mensagem')}`,
      '',
      `[STACK TRACE (PILHA DE EXECUÇÃO)]`,
      error?.stack || 'Stack trace indisponível',
      '',
      `[REACT COMPONENT STACK]`,
      errorInfo?.componentStack || 'Component stack indisponível',
      '=================================================='
    ].join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(report).then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 3000);
      }).catch(() => {
        this.fallbackCopy(report);
      });
    } else {
      this.fallbackCopy(report);
    }
  };

  private fallbackCopy = (text: string) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 3000);
    } catch (e) {
      console.error('Falha ao copiar relatório:', e);
    }
  };

  public render() {
    if (this.state.hasError) {
      const { error, errorInfo, autoRetries, copied, showDetails } = this.state;
      const isChart = isChartRelatedError(error, errorInfo);

      // SE FOR ERRO DO MOTOR GRÁFICO (TradingView / Lightweight Charts), INIBE TOTALMENTE A TELA VERMELHA DE DIAGNÓSTICO
      if (isChart) {
        return (
          <div className="w-full h-full min-h-[300px] flex items-center justify-center bg-[#0a0e1a]/80 text-slate-500 font-mono text-xs select-none">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Sincronizando interface e motor gráfico...</span>
            </div>
          </div>
        );
      }

      const diag = this.parseDiagnostics(error, errorInfo);

      return (
        <div className="p-5 md:p-6 bg-slate-900/95 border border-red-500/40 rounded-xl m-2 md:m-4 text-slate-200 shadow-2xl backdrop-blur">
          {/* Cabeçalho */}
          <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <span className="text-3xl animate-pulse">⚠️</span>
              <div>
                <h3 className="text-base md:text-lg font-bold text-red-400 flex items-center gap-2">
                  {this.props.fallbackTitle || 'Instabilidade Temporária Detectada no Painel'}
                </h3>
                <p className="text-xs text-slate-400">
                  Ocorreu uma exceção inesperada durante o processamento da interface em tempo real.
                </p>
              </div>
            </div>

            {/* Badge de Origem */}
            <div className="hidden sm:inline-flex items-center px-2.5 py-1 rounded bg-red-950/80 border border-red-800/60 text-[11px] font-mono text-red-300 font-semibold">
              {diag.origin.split('(')[0].trim()}
            </div>
          </div>

          {/* Card de Diagnóstico Estruturado */}
          <div className="bg-slate-950/90 border border-slate-800/80 rounded-lg p-3.5 mb-4 space-y-2 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="font-bold text-slate-400 min-w-[130px]">📍 Origem / Módulo:</span>
              <span className="text-amber-300 font-semibold">{diag.origin}</span>
            </div>

            {diag.sourceFileHint && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <span className="font-bold text-slate-400 min-w-[130px]">📄 Arquivo Provável:</span>
                <span className="font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/50">
                  {diag.sourceFileHint}
                </span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="font-bold text-slate-400 min-w-[130px]">🧩 Componente:</span>
              <span className="font-mono text-blue-300">
                &lt;{diag.componentTrace.join('&gt; → &lt;')}&gt;
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2">
              <span className="font-bold text-slate-400 min-w-[130px] pt-0.5">🔍 Causa Provável:</span>
              <span className="text-slate-300 leading-relaxed">{diag.probableCause}</span>
            </div>

            {/* Mensagem Bruta */}
            <div className="mt-2 pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="font-bold text-red-400 min-w-[130px]">⚠️ Erro Original:</span>
              <span className="font-mono text-red-300 bg-red-950/50 px-2 py-0.5 rounded border border-red-900/50 text-[11px] break-all">
                {error?.name || 'Error'}: {error?.message || String(error || 'Sem mensagem')}
              </span>
            </div>
          </div>

          {/* Seção Expansível de Detalhes Técnicos (Stack Trace) */}
          <div className="mb-4">
            <button
              onClick={() => this.setState({ showDetails: !showDetails })}
              className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 underline transition mb-1"
            >
              {showDetails ? '▼ Ocultar Detalhes Técnicos (Stack Trace)' : '▶ Ver Detalhes Técnicos (Stack Trace & Component Stack)'}
            </button>

            {showDetails && (
              <div className="bg-slate-950/95 border border-slate-800 p-3 rounded text-[10px] font-mono text-slate-400 space-y-2 overflow-x-auto max-h-48">
                {error?.stack && (
                  <div>
                    <div className="text-red-400 font-bold mb-1">Stack Trace:</div>
                    <pre className="whitespace-pre-wrap">{error.stack}</pre>
                  </div>
                )}
                {errorInfo?.componentStack && (
                  <div className="mt-2 pt-2 border-t border-slate-800">
                    <div className="text-blue-400 font-bold mb-1">Component Stack:</div>
                    <pre className="whitespace-pre-wrap">{errorInfo.componentStack}</pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Rodapé com Ações */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
            <span className="text-xs text-slate-400 italic">
              {autoRetries < 3
                ? `Tentando auto-recuperar em 3 segundos (Tentativa ${autoRetries + 1}/3)...`
                : 'Tentativas automáticas esgotadas. Use os botões ao lado.'}
            </span>

            <div className="flex items-center gap-2">
              {/* Botão Copiar Diagnóstico */}
              <button
                onClick={this.handleCopyReport}
                className={`font-bold px-3.5 py-2 rounded text-xs transition active:scale-95 shadow-md flex items-center justify-center gap-1.5 border ${
                  copied
                    ? 'bg-emerald-700 text-white border-emerald-500'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 hover:border-slate-600'
                }`}
                title="Copiar relatório detalhado para enviar ao suporte ou IA"
              >
                {copied ? '✅ Diagnóstico Copiado!' : '📋 Copiar Diagnóstico'}
              </button>

              {/* Botão Restaurar Painel */}
              <button
                onClick={this.handleManualReset}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded text-xs transition active:scale-95 shadow-md flex items-center justify-center gap-1.5"
              >
                🔄 Restaurar Painel
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
