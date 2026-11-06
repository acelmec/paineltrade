import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppProvider } from './context/AppContext.tsx'

import { recordChartError } from './utils/chartErrorLogger'

// 🛡️ Proteção do DOM contra extensões de terceiros e tradutores automáticos (Google Tradutor, Grammarly, etc.)
// Extensões de tradução ou injeção alteram nós de texto (<font>) e quebram a hierarquia interna do React.
// Sem este guard, o React lança: "NotFoundError: Failed to execute 'insertBefore' on 'Node'".
if (typeof window !== 'undefined' && typeof Node === 'function' && Node.prototype) {
  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      console.warn('[DOM Guard] insertBefore com nó de referência desvinculado (interferência de tradutor/extensão). Aplicando fallback com appendChild seguro.');
      return originalInsertBefore.call(this, newNode, null) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      console.warn('[DOM Guard] removeChild de nó que não é mais filho direto (já desacoplado por tradutor/extensão). Prevenindo crash.');
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };
}

// Inibidor global de exceções transitórias do motor gráfico (TradingView / Lightweight Charts)
if (typeof window !== 'undefined') {
  window.addEventListener(
    'error',
    (event) => {
      const msg = (event?.message || '').toLowerCase();
      const filename = (event?.filename || '').toLowerCase();
      if (
        msg.includes('value is null') ||
        msg.includes('assertion failed') ||
        msg.includes('ensurenotnull') ||
        msg.includes('seriesbarcolorer') ||
        msg.includes('linepaneview') ||
        msg.includes('pricetocoordinate') ||
        msg.includes('timetocoordinate') ||
        filename.includes('lightweight-charts')
      ) {
        recordChartError({
          type: 'lightweight-charts',
          message: event.message || 'Erro de renderização em Lightweight Charts',
          stack: (event.error?.stack) || `Arquivo: ${event.filename}:${event.lineno}:${event.colno}`,
          panelName: 'Motor Gráfico TradingView'
        });
        console.warn('[GlobalChartGuard] Erro transitório de evento gráfico registrado e absorvido silenciosamente:', event.message);
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      const reason = String(event?.reason || '').toLowerCase();
      if (
        reason.includes('value is null') ||
        reason.includes('assertion failed') ||
        reason.includes('ensurenotnull') ||
        reason.includes('lightweight-charts')
      ) {
        recordChartError({
          type: 'unhandled-rejection',
          message: String(event.reason?.message || event.reason || 'Rejeição assíncrona do gráfico'),
          stack: event.reason?.stack || '',
          panelName: 'Motor Gráfico TradingView'
        });
        console.warn('[GlobalChartGuard] Rejeição assíncrona do gráfico registrada e absorvida silenciosamente:', event.reason);
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)
