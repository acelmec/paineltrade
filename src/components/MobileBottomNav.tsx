import React, { useRef, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

interface MobileBottomNavProps {
  currentPage: string;
  setCurrentPage: (page: string) => void;
  onOpenNotifications?: () => void;
  unreadCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentPage,
  setCurrentPage,
  onOpenNotifications,
  unreadCount = 0
}) => {
  const {
    user,
    logout,
    planDetails,
    canAccessAlgorithmCreator,
    canAccessCopilotAI,
    canAccessCopyTrading,
    canAccessReplay,
    isRestrictedSession,
    panelMode,
    setPanelMode,
    setIsCopilotModalOpen
  } = useApp();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Controle de arrasto com mouse ou touch para rolagem fluida
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftStartRef = useRef(0);
  const hasMovedRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!scrollRef.current) return;
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    startXRef.current = e.clientX;
    scrollLeftStartRef.current = scrollRef.current.scrollLeft;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !scrollRef.current) return;
    const dx = e.clientX - startXRef.current;
    if (Math.abs(dx) > 3) {
      hasMovedRef.current = true;
    }
    scrollRef.current.scrollLeft = scrollLeftStartRef.current - dx;
    checkScroll();
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
    setTimeout(() => {
      hasMovedRef.current = false;
    }, 60);
  };

  const isCopyOnly = planDetails?.isCopyTraderOnly === true;
  const isSystemAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    }
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      return () => {
        el.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }
  }, []);

  interface NavItem {
    id: string;
    label: string;
    icon: string;
    sub?: string;
    isActive?: boolean;
    action: () => void;
  }

  // Construção dos itens dinâmicos do rodapé mobile
  const navItems: NavItem[] = isCopyOnly
    ? [
        { id: 'copytrade', label: 'CopyTrade', icon: '⚡', action: () => setCurrentPage('copytrade') },
        { id: 'contas', label: 'Contas', icon: '🏦', action: () => setCurrentPage('contas') },
        { id: 'relatorios', label: 'Relatórios', icon: '📈', action: () => setCurrentPage('relatorios') },
        { id: 'manual', label: 'Manual', icon: '📖', action: () => setCurrentPage('manual') },
        ...(isSystemAdmin ? [{ id: 'usuarios', label: 'Usuários', icon: '👥', action: () => setCurrentPage('usuarios') }] : [])
      ]
    : [
        {
          id: 'painel1',
          label: 'Painel 1',
          sub: 'Análise',
          icon: '📊',
          isActive: currentPage === 'dashboard' && panelMode === 'mode1',
          action: () => {
            setCurrentPage('dashboard');
            if (setPanelMode) setPanelMode('mode1');
          }
        },
        {
          id: 'painel2',
          label: 'Painel 2',
          sub: 'Operar',
          icon: '⚡',
          isActive: currentPage === 'dashboard' && panelMode === 'mode2',
          action: () => {
            setCurrentPage('dashboard');
            if (setPanelMode) setPanelMode('mode2');
          }
        },
        ...(canAccessCopyTrading ? [
          {
            id: 'copytrade',
            label: 'CopyTrade',
            icon: '🔄',
            isActive: currentPage === 'copytrade',
            action: () => setCurrentPage('copytrade')
          }
        ] : []),
        {
          id: 'contas',
          label: 'Contas',
          icon: '🏦',
          isActive: currentPage === 'contas',
          action: () => setCurrentPage('contas')
        },
        ...(!isRestrictedSession && canAccessAlgorithmCreator ? [
          {
            id: 'algoritmos',
            label: 'Robôs',
            icon: '🤖',
            isActive: currentPage === 'algoritmos',
            action: () => setCurrentPage('algoritmos')
          }
        ] : []),
        ...(!isRestrictedSession && canAccessReplay ? [
          {
            id: 'replay',
            label: 'Replay',
            icon: '⏪',
            isActive: currentPage === 'replay',
            action: () => setCurrentPage('replay')
          }
        ] : []),
        {
          id: 'relatorios',
          label: 'Relatórios',
          icon: '📈',
          isActive: currentPage === 'relatorios',
          action: () => setCurrentPage('relatorios')
        },
        ...(!isRestrictedSession ? [
          {
            id: 'configuracoes',
            label: 'Config',
            icon: '⚙️',
            isActive: currentPage === 'configuracoes',
            action: () => setCurrentPage('configuracoes')
          },
          {
            id: 'alertas',
            label: 'Alertas',
            icon: '🔔',
            isActive: currentPage === 'alertas',
            action: () => setCurrentPage('alertas')
          },
          {
            id: 'noticias',
            label: 'Notícias',
            icon: '📰',
            isActive: currentPage === 'noticias',
            action: () => setCurrentPage('noticias')
          }
        ] : []),
        {
          id: 'manual',
          label: 'Manual',
          icon: '📖',
          isActive: currentPage === 'manual',
          action: () => setCurrentPage('manual')
        },
        ...(isSystemAdmin ? [
          {
            id: 'usuarios',
            label: 'Usuários',
            icon: '👥',
            isActive: currentPage === 'usuarios',
            action: () => setCurrentPage('usuarios')
          }
        ] : [])
      ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-[9990] bg-[#0c101d]/95 backdrop-blur-xl border-t border-slate-800/90 shadow-[0_-6px_25px_rgba(0,0,0,0.6)] select-none"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 6px)' }}
      aria-label="Navegação Mobile"
    >
      <div className="relative w-full">
        {/* Container horizontal com scroll suave touch e arraste fluido */}
        <div
          ref={scrollRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="flex items-center gap-1.5 px-2 py-1.5 overflow-x-auto no-scrollbar scroll-smooth w-full cursor-grab active:cursor-grabbing select-none"
          style={{
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-x',
            overscrollBehaviorX: 'contain'
          }}
        >
          {navItems.map((item) => {
            const active = item.isActive !== undefined ? item.isActive : currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (hasMovedRef.current) return;
                  item.action();
                }}
                className={`flex flex-col items-center justify-center min-w-[62px] px-2 py-1 rounded-xl transition-all duration-150 active:scale-95 shrink-0 select-none ${
                  active
                    ? 'bg-blue-600/25 border border-blue-500/50 text-blue-300 shadow-sm shadow-blue-950/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                }`}
              >
                <div className="relative text-lg leading-tight flex items-center justify-center pointer-events-none">
                  <span>{item.icon}</span>
                  {active && (
                    <span className="absolute -top-0.5 -right-1 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)] animate-pulse" />
                  )}
                </div>
                <span className={`text-[10px] tracking-tight font-extrabold mt-0.5 whitespace-nowrap pointer-events-none ${active ? 'text-blue-300' : 'text-slate-400'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}

          {/* Central de Avisos / Notificações */}
          <button
            onClick={() => {
              if (hasMovedRef.current) return;
              if (onOpenNotifications) onOpenNotifications();
            }}
            className="flex flex-col items-center justify-center min-w-[62px] px-2 py-1 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent transition-all active:scale-95 shrink-0 relative select-none"
            title="Avisos e Comunicados"
          >
            <div className="relative text-lg leading-tight pointer-events-none">
              <span>📢</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-rose-500 text-white font-black text-[9px] px-1 py-0.2 rounded-full border border-rose-400 animate-pulse">
                  {unreadCount}
                </span>
              )}
            </div>
            <span className="text-[10px] tracking-tight font-extrabold mt-0.5 text-slate-400 whitespace-nowrap pointer-events-none">
              Avisos
            </span>
          </button>

          {/* Copilot IA Botão no Rodapé */}
          {!isCopyOnly && canAccessCopilotAI && (
            <button
              onClick={() => {
                if (hasMovedRef.current) return;
                setIsCopilotModalOpen(true);
              }}
              className="flex flex-col items-center justify-center min-w-[62px] px-2 py-1 rounded-xl bg-purple-950/40 border border-purple-800/50 text-purple-300 transition-all active:scale-95 shrink-0 select-none"
              title="Copilot IA"
            >
              <div className="text-lg leading-tight pointer-events-none">🤖</div>
              <span className="text-[10px] tracking-tight font-extrabold mt-0.5 text-purple-300 whitespace-nowrap pointer-events-none">
                Copilot
              </span>
            </button>
          )}

          {/* Sair do Sistema */}
          <button
            onClick={() => {
              if (hasMovedRef.current) return;
              logout();
            }}
            className="flex flex-col items-center justify-center min-w-[56px] px-2 py-1 rounded-xl text-rose-400 hover:bg-rose-950/30 border border-transparent transition-all active:scale-95 shrink-0 select-none"
            title="Sair da Conta"
          >
            <div className="text-lg leading-tight pointer-events-none">🚪</div>
            <span className="text-[10px] tracking-tight font-extrabold mt-0.5 text-rose-400 whitespace-nowrap pointer-events-none">
              Sair
            </span>
          </button>
        </div>

        {/* Indicador visual de rolagem horizontal (fade + seta) à direita se houver mais itens */}
        {canScrollRight && (
          <div
            onClick={() => {
              if (scrollRef.current) {
                scrollRef.current.scrollBy({ left: 120, behavior: 'smooth' });
              }
            }}
            className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#0c101d] via-[#0c101d]/80 to-transparent flex items-center justify-end pr-1 cursor-pointer pointer-events-auto"
            title="Deslize para ver mais opções"
          >
            <span className="text-slate-400 text-xs animate-pulse">›</span>
          </div>
        )}
      </div>
    </nav>
  );
};
