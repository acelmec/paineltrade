import React, { useState, useEffect } from 'react';
import { useApp } from './context/AppContext';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { TradeWorkstation } from './components/TradeWorkstation';
import { Settings } from './components/Settings';
import { AlertSettings } from './components/AlertSettings';
import { PromptManager } from './components/PromptManager';
import { StrategyReportComponent } from './components/StrategyReport';
import { UsersDashboard } from './components/UsersDashboard';
import { Manual } from './components/Manual';
import { AlgorithmBuilder } from './components/AlgorithmBuilder';
import { ReplayWorkstation } from './components/ReplayWorkstation';
import { AccountsDashboard } from './components/AccountsDashboard';
import { CopyTradingDashboard } from './components/CopyTradingDashboard';
import { CopilotModal } from './components/CopilotModal';
import { CopilotFloatingChat } from './components/CopilotFloatingChat';
import { ChartDiagnosticsViewer } from './components/ChartDiagnosticsViewer';

import { ErrorBoundary } from './components/ErrorBoundary';
import { fetchBroadcastMessagesAdmin } from './services/db';
import { 
  NotificationCenterDrawer, 
  BroadcastPopupModal, 
  type BroadcastNotificationItem 
} from './components/NotificationCenterDrawer';
import { useIsMobile } from './utils/platform';
import { MobileBottomNav } from './components/MobileBottomNav';

export const AppContent: React.FC = () => {
  const {
    user,
    isAuthenticated,
    isCheckingAuth,
    activeAlert,
    disarmAlert,
    activePanel,
    switchPanel,
    isRestrictedSession,
    userPermissions,
    panelMode,
    isCopilotModalOpen,
    setIsCopilotModalOpen,
    planDetails,
    canAccessAlgorithmCreator,
    canAccessCopilotAI,
    canAccessCopyTrading,
    canAccessReplay
  } = useApp();
  
  const isCopyOnly = planDetails?.isCopyTraderOnly === true;
  const isMobile = useIsMobile();
  const [currentPage, setCurrentPage] = useState<string>(() => {
    return isCopyOnly ? 'copytrade' : 'dashboard';
  });
  const [collapsed, setCollapsed] = useState<boolean>(true); // Começa fechado (colapsado) por padrão no celular

  const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
  const canUseMode2 = isSystemAdmin || userPermissions?.allow_panel_mode_2 !== false;

  // Central de Notificações & Comunicados
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState<boolean>(false);
  const [broadcasts, setBroadcasts] = useState<BroadcastNotificationItem[]>([]);
  const [popupBroadcast, setPopupBroadcast] = useState<BroadcastNotificationItem | null>(null);
  const [isPopupOpen, setIsPopupOpen] = useState<boolean>(false);

  const [readBroadcastIds, setReadBroadcastIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vortex_read_broadcast_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const fetchBroadcastMessages = async () => {
    try {
      const data = await fetchBroadcastMessagesAdmin();
      if (Array.isArray(data)) {
        setBroadcasts(data);

        // Se houver mensagem nova não lida, exibir Pop-up Modal Inicial ao logar (apenas uma vez por mensagem)
        const unread = data.filter((b: any) => !readBroadcastIds.includes(b.id));
        if (unread.length > 0) {
          const latestUnread = unread[0];
          const hasShownPopupFor = sessionStorage.getItem(`vortex_popup_shown_${latestUnread.id}`);
          if (!hasShownPopupFor) {
            setPopupBroadcast(latestUnread);
            setIsPopupOpen(true);
            sessionStorage.setItem(`vortex_popup_shown_${latestUnread.id}`, 'true');
          }
        }
      }
    } catch (e) {
      console.warn('[NOTIFICATIONS] Erro ao sincronizar comunicados:', e);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchBroadcastMessages();
      const interval = setInterval(fetchBroadcastMessages, 15000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, readBroadcastIds]);

  const handleMarkAsRead = (id: string) => {
    setReadBroadcastIds((prev) => {
      const next = Array.from(new Set([...prev, id]));
      try {
        localStorage.setItem('vortex_read_broadcast_ids', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleMarkAllAsRead = () => {
    const allIds = broadcasts.map(b => b.id);
    const next = Array.from(new Set([...readBroadcastIds, ...allIds]));
    setReadBroadcastIds(next);
    try {
      localStorage.setItem('vortex_read_broadcast_ids', JSON.stringify(next));
    } catch {}
  };

  const unreadBroadcastCount = broadcasts.filter(b => !readBroadcastIds.includes(b.id)).length;

  useEffect(() => {
    if (isCopyOnly) {
      if (!['copytrade', 'contas', 'relatorios', 'manual', 'usuarios', 'diagnostico-tw'].includes(currentPage)) {
        setCurrentPage('copytrade');
      }
      return;
    }

    if ((isRestrictedSession && ['configuracoes', 'prompts', 'noticias', 'alertas', 'replay', 'algoritmos'].includes(currentPage)) ||
        ((currentPage === 'usuarios' || currentPage === 'diagnostico-tw' || currentPage === 'remodelagem-ml') && !isSystemAdmin) ||
        (currentPage === 'algoritmos' && !canAccessAlgorithmCreator) ||
        (currentPage === 'prompts' && !canAccessCopilotAI) ||
        (currentPage === 'replay' && !canAccessReplay) ||
        (currentPage === 'copytrade' && !canAccessCopyTrading)) {
      setCurrentPage('dashboard');
    }
  }, [isRestrictedSession, currentPage, user, canAccessAlgorithmCreator, canAccessCopilotAI, canAccessReplay, canAccessCopyTrading, isSystemAdmin, isCopyOnly]);

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] flex flex-col justify-center items-center font-sans text-slate-200">
        <div className="text-4xl mb-4 animate-pulse">🧠</div>
        <div className="text-sm font-bold tracking-wider text-slate-400">VERIFICANDO SESSÃO AXION TRADESTATION...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  const isWorkstationActive = !isCopyOnly && currentPage === 'dashboard' && (canUseMode2 && panelMode === 'mode2');

  return (
    <div className={`w-full max-w-full ${isMobile && isWorkstationActive ? 'fixed inset-0 h-[100dvh] overflow-hidden' : 'min-h-screen overflow-x-hidden'} bg-[#0a0e1a] text-[#e2e8f0] font-sans`}>
      {/* Botão flutuante para abrir o menu caso necessário */}
      {!isMobile && (
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="fixed top-3 left-3 z-[9999] md:hidden bg-slate-900/90 border border-slate-700 text-white p-2 rounded shadow-lg text-lg flex items-center justify-center w-9 h-9 active:scale-95 transition"
          title="Menu"
        >
          ☰
        </button>
      )}

      {/* Sidebar - Na versão desktop mantém-se 100% como antes */}
      <Sidebar 
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage} 
        collapsed={isMobile ? true : collapsed}
        setCollapsed={setCollapsed}
        onOpenNotifications={() => setIsNotificationDrawerOpen(true)}
        unreadCount={unreadBroadcastCount}
      />

      {/* Main Content Area */}
      <div className={`w-full max-w-full overflow-x-hidden transition-all duration-300 ${
        isMobile 
          ? (isWorkstationActive ? 'p-0 pl-0 pb-0 h-full overflow-hidden' : 'p-[6px] pl-0 pb-20 min-h-screen') 
          : (collapsed ? 'p-[6px] md:p-2 pl-[6px] md:pl-[70px]' : 'p-[6px] md:p-2 pl-[6px] md:pl-[230px]')
      }`}>
        <ErrorBoundary fallbackTitle="Erro na Interface do Painel">
              {!isCopyOnly && currentPage === 'dashboard' && (
                (canUseMode2 && panelMode === 'mode2') ? <TradeWorkstation /> : <Dashboard />
              )}
              {canAccessCopyTrading && currentPage === 'copytrade' && <CopyTradingDashboard />}
              {currentPage === 'contas' && <AccountsDashboard />}
              {!isRestrictedSession && !isCopyOnly && currentPage === 'configuracoes' && <Settings initialTab="geral" />}
              {!isRestrictedSession && !isCopyOnly && currentPage === 'remodelagem-ml' && isSystemAdmin && <Settings initialTab="remodelagem_ml" />}
              {!isRestrictedSession && !isCopyOnly && canAccessCopilotAI && currentPage === 'prompts' && <PromptManager />}
              {!isRestrictedSession && !isCopyOnly && currentPage === 'noticias' && <Settings initialTab="noticias" />}
              {!isRestrictedSession && !isCopyOnly && currentPage === 'alertas' && <AlertSettings />}
              {!isRestrictedSession && !isCopyOnly && canAccessAlgorithmCreator && currentPage === 'algoritmos' && <AlgorithmBuilder />}
              {!isRestrictedSession && !isCopyOnly && canAccessReplay && currentPage === 'replay' && <ReplayWorkstation />}
              {currentPage === 'relatorios' && <StrategyReportComponent />}
              {currentPage === 'manual' && <Manual />}
              {currentPage === 'usuarios' && isSystemAdmin && <UsersDashboard />}
              {currentPage === 'diagnostico-tw' && isSystemAdmin && <ChartDiagnosticsViewer />}
            </ErrorBoundary>
      </div>

      {activeAlert && (
        <div id="alertPopup" className="active">
          <div className="alert-title font-bold">⚠️ ALERTA DISPARADO: {activeAlert.title}</div>
          <div className="alert-msg text-sm font-semibold">{activeAlert.message}</div>
          <div className="alert-detail bg-slate-900/60 p-2 rounded text-xs font-mono text-slate-300 mt-2 whitespace-pre-wrap border-l-2 border-yellow-500 max-h-32 overflow-y-auto">
            {activeAlert.detail}
          </div>
          <div className="alert-btns mt-3 flex justify-end gap-2">
            {activeAlert.panelId && activePanel?.id !== activeAlert.panelId && (
              <button 
                className="btn-go bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded text-xs transition"
                onClick={() => {
                  switchPanel(activeAlert.panelId!);
                  disarmAlert();
                }}
              >
                🔍 Ir para o Painel
              </button>
            )}
            <button className="btn-disarm bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-bold px-3 py-1.5 rounded text-xs transition" onClick={disarmAlert}>
              🔓 Desarmar Este Alerta
            </button>
          </div>
        </div>
      )}

      {/* Modal Central do Copilot Global */}
      {!isCopyOnly && canAccessCopilotAI && (
        <CopilotModal
          isOpen={isCopilotModalOpen}
          onClose={() => setIsCopilotModalOpen(false)}
        />
      )}

      {/* Chat Flutuante do Copilot IA (Balão de Chat Redimensionável) */}
      {!isCopyOnly && canAccessCopilotAI && (
        <CopilotFloatingChat currentPage={currentPage} />
      )}

      {/* Central de Notificações / Comunicados Drawer */}
      <NotificationCenterDrawer
        isOpen={isNotificationDrawerOpen}
        onClose={() => setIsNotificationDrawerOpen(false)}
        broadcasts={broadcasts}
        onMarkAllAsRead={handleMarkAllAsRead}
        onDismissBroadcast={handleMarkAsRead}
        readBroadcastIds={readBroadcastIds}
      />

      {/* Pop-Up Modal de Destaque na Entrada */}
      <BroadcastPopupModal
        isOpen={isPopupOpen}
        onClose={() => setIsPopupOpen(false)}
        broadcast={popupBroadcast}
        onMarkAsRead={handleMarkAsRead}
      />

      {/* Menu Inferior Deslizável no Rodapé (Exclusivo Mobile / Android) */}
      <MobileBottomNav
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onOpenNotifications={() => setIsNotificationDrawerOpen(true)}
        unreadCount={unreadBroadcastCount}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AppContent />
  );
};

export default App;
