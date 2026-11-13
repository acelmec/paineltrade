import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { getStreamerInfoForPanel, type StreamerItem } from '../services/vortexStreamer';

interface SidebarProps {
  currentPage: string;
  setCurrentPage: (page: string) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  onOpenNotifications?: () => void;
  unreadCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentPage, 
  setCurrentPage, 
  collapsed, 
  setCollapsed,
  onOpenNotifications,
  unreadCount = 0
}) => {
  const {
    user,
    logout,
    aiEnabled,
    setAiEnabled,
    isAnalyzing,
    marketData,
    panels,
    activePanel,
    switchPanel,
    isRestrictedSession,
    setIsCopilotModalOpen,
    planDetails,
    canAccessAlgorithmCreator,
    canAccessCopilotAI,
    canAccessCopyTrading,
    canAccessReplay,
    settings,
    allSettings
  } = useApp();

  const [streamerInfo, setStreamerInfo] = useState<{ isLocal: boolean; stream: StreamerItem | null }>({ isLocal: false, stream: null });

  useEffect(() => {
    let isMounted = true;
    const checkStream = async () => {
      if (!activePanel) return;
      try {
        const activePanelSettings = (activePanel?.id && allSettings ? allSettings[activePanel.id] : null) || settings;
        const info = await getStreamerInfoForPanel(activePanel, activePanelSettings);
        if (isMounted) setStreamerInfo(info);
      } catch {}
    };

    checkStream();
    const interval = setInterval(checkStream, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activePanel, settings, allSettings]);

  const isAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';
  const isCopyOnly = planDetails?.isCopyTraderOnly === true;

  const copyIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );

  // Montagem dinâmica dos menus conforme o perfil do produto
  const menuItems = isCopyOnly ? [
    { id: 'copytrade', label: 'CopyTrade NT8', sublabel: 'Espelhamento NinjaTrader', icon: copyIcon },
    { id: 'contas', label: 'Gestão de Contas', sublabel: 'Contas Sincronizadas', icon: '🏦' },
    { id: 'relatorios', label: 'Análise de Desempenho', sublabel: 'Resultado de operações', icon: '📈' },
    { id: 'manual', label: 'Manual', sublabel: 'Guia de uso e dicas', icon: '📖' },
    ...(isAdmin ? [
      { id: 'usuarios', label: 'Gestão de Usuários', sublabel: 'Controle de acessos', icon: '👥' },
      { id: 'diagnostico-tw', label: 'Logs TradingView', sublabel: 'Erros e Diagnósticos TW', icon: '🛠️' }
    ] : [])
  ] : [
    { id: 'dashboard', label: 'Dashboard', sublabel: 'Painel principal', icon: '📊' },
    { id: 'relatorios', label: 'Análise de Desempenho', sublabel: 'Resultado de sinais', icon: '📈' },
    ...(canAccessCopyTrading ? [
      { id: 'copytrade', label: 'CopyTrade NT8', sublabel: 'Espelhamento NinjaTrader', icon: copyIcon }
    ] : []),
    { id: 'contas', label: 'Gestão de Contas', sublabel: 'Contas e Robôs', icon: '🏦' },
    ...(!isRestrictedSession ? [
      ...(canAccessAlgorithmCreator ? [
        { id: 'algoritmos', label: 'Robôs Axion', sublabel: 'Lógicas e Automação', icon: '🤖' }
      ] : []),
      ...(canAccessReplay ? [
        { id: 'replay', label: 'Replay de Mercado', sublabel: 'Ninja Replay & Painel 2', icon: '⏪' }
      ] : []),
      { id: 'configuracoes', label: 'Configurações', sublabel: 'APIs e intervalos', icon: '⚙️' },
      ...(isAdmin ? [
        { id: 'remodelagem-ml', label: 'Remodelagem ML', sublabel: 'TensorFlow & Padrões', icon: '🧠' }
      ] : []),
      ...(canAccessCopilotAI ? [
        { id: 'prompts', label: 'Prompts IA', sublabel: 'Análise principal', icon: '📝' }
      ] : []),
      { id: 'alertas', label: 'Alertas', sublabel: 'Configurações de alarme', icon: '🔔' }
    ] : []),
    { id: 'manual', label: 'Manual', sublabel: 'Guia de uso e dicas', icon: '📖' },
    ...(isAdmin ? [
      { id: 'usuarios', label: 'Gestão de Usuários', sublabel: 'Controle de acessos', icon: '👥' },
      { id: 'diagnostico-tw', label: 'Logs TradingView', sublabel: 'Erros e Diagnósticos TW', icon: '🛠️' }
    ] : [])
  ];

  const handleToggleIA = () => {
    setAiEnabled(!aiEnabled);
  };

  const isMarketDataActive = marketData && marketData.timestamp !== '--:--:--';

  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    return localStorage.getItem('vortex_chart_theme') || 'black';
  });

  useEffect(() => {
    const handleThemeChange = (e: any) => {
      if (e.detail?.theme) setCurrentTheme(e.detail.theme);
    };
    window.addEventListener('vortex_chart_theme_changed', handleThemeChange);
    return () => window.removeEventListener('vortex_chart_theme_changed', handleThemeChange);
  }, []);

  const isBlackTheme = currentTheme === 'black' || currentTheme === 'ninja_black';
  const isSlateTheme = currentTheme === 'slate' || currentTheme === 'cinza_escuro' || currentTheme === 'ninja_slate';
  const isMidnightTheme = currentTheme === 'midnight' || currentTheme === 'azul_noturno' || currentTheme === 'ninja_carbon' || currentTheme === 'ninja_midnight';
  const isLightTheme = currentTheme === 'light' || currentTheme === 'cinza_grafite' || currentTheme === 'ninja_light';

  const sidebarBg = isBlackTheme
    ? '!bg-[#000000] !border-zinc-800'
    : isSlateTheme || isLightTheme
    ? '!bg-[#1e2430] !border-slate-700'
    : isMidnightTheme
    ? '!bg-[#070e20] !border-blue-900/60'
    : '!bg-[#1e2430] !border-slate-700';

  const sidebarSelectBg = isBlackTheme
    ? 'bg-black border-zinc-800 text-white'
    : isSlateTheme || isLightTheme
    ? 'bg-[#181d28] border-slate-700 text-slate-100'
    : isMidnightTheme
    ? 'bg-[#070e20] border-blue-900/60 text-slate-100'
    : 'bg-[#181d28] border-slate-700 text-slate-100';

  return (
    <div className={`side-menu ${sidebarBg} ${collapsed ? 'collapsed' : ''} transition-colors duration-200`} id="sideMenu">
      {/* Menu Toggle */}
      <div className="menu-toggle" onClick={() => setCollapsed(!collapsed)} title="Recolher/Expandir menu">
        <div className="menu-toggle-icon">☰</div>
        <div className="menu-text">
          <div className="menu-label text-sm text-slate-200">Menu</div>
          <div className="menu-sublabel text-[10px] text-slate-500">Recolher/Expandir</div>
        </div>
      </div>

      {/* Seletor de Painel e Feed de Dados (Ocultado no Produto Copy Trader 9286) */}
      {!isCopyOnly && (
        <div className="px-4 py-2.5 border-b border-slate-800/80 flex flex-col gap-2">
          {!collapsed && (
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                📈 Ativo Selecionado
              </div>
              {activePanel && (
                <button
                  onClick={() => switchPanel(activePanel.id)}
                  title="Atualizar dados do ativo selecionado"
                  className="text-slate-400 hover:text-blue-400 text-xs font-bold transition flex items-center gap-1 active:scale-95 px-1 py-0.5 rounded hover:bg-slate-800/50"
                >
                  🔄
                </button>
              )}
            </div>
          )}
          {!collapsed ? (
            <>
              <select
                value={activePanel?.id || ''}
                onChange={(e) => switchPanel(e.target.value)}
                className={`${sidebarSelectBg} border p-2 rounded text-xs font-bold text-blue-300 w-full focus:outline-none focus:border-blue-500/50`}
              >
                {panels.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#181d28] text-slate-200">
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="mt-1">
                {streamerInfo.isLocal ? (
                  <div 
                    className="flex items-center justify-between px-2 py-1 bg-emerald-950/40 border border-emerald-500/30 rounded text-[10px] text-emerald-300 font-medium"
                    title={`NinjaTrader 8 conectado na porta 8002 | Ativo: ${streamerInfo.stream?.symbol} (${streamerInfo.stream?.bars_count || 0} velas de 1m)`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                      <span className="truncate">Feed NT8 Local ({streamerInfo.stream?.symbol})</span>
                    </div>
                    <span className="text-[9px] text-emerald-400/80 font-mono shrink-0 ml-1">1m</span>
                  </div>
                ) : (
                  <div 
                    className="flex items-center justify-between px-2 py-1 bg-slate-800/40 border border-slate-700/40 rounded text-[10px] text-slate-400 font-medium"
                    title="Consumindo cotações e histórico via Feed Axion. Abra o NinjaTrader 8 com o AxionStreamer para alternar para Local."
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0"></span>
                      <span className="truncate">Feed Axion</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex justify-center">
              <div 
                onClick={() => setCollapsed(false)}
                className="w-8 h-8 rounded-full bg-blue-900/20 border border-blue-500/30 flex items-center justify-center text-[10px] font-black text-blue-300 cursor-pointer hover:bg-blue-900/40 transition active:scale-95"
                title={`Ativo: ${activePanel?.name || '--'}`}
              >
                {activePanel?.instance_id === 'nasdaq' ? 'NQ' : activePanel?.instance_id === 'sp500' ? 'ES' : activePanel?.instance_id === 'gold' ? 'GC' : '⚡'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Menu Items */}
      <div className="flex-1 py-2 overflow-y-auto overflow-x-hidden min-h-0 custom-scrollbar">
        {menuItems.map((item) => (
          <div
            key={item.id}
            className={`menu-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => {
              setCurrentPage(item.id);
              // Como collapsed controla se o menu está fechado ou não (e por padrão fica colapsado/true no celular),
              // se o usuário clicar em um item e o menu estiver aberto (!collapsed), nós o fechamos setCollapsed(true)
              if (!collapsed) {
                setCollapsed(true);
              }
            }}
          >
            <div className="menu-icon text-lg">{item.icon}</div>
            <div className="menu-text">
              <div className="menu-label text-slate-200">{item.label}</div>

            </div>
          </div>
        ))}
      </div>

      {/* Menu Footer */}
      <div className={`menu-footer ${collapsed ? 'px-2 py-4 flex flex-col items-center gap-3' : 'p-4'} border-t border-slate-800`}>
        {!collapsed ? (
          <>
            {!isCopyOnly && (
              <>
                <div id="cicloStatus" className="text-slate-500 text-xs text-center mb-1 bg-slate-900/60 p-1.5 rounded border border-slate-800/50">
                  {isAnalyzing ? '🧠 Analisando...' : aiEnabled ? '🔄 Ciclo Ativo' : '⬜ Aguardando...'}
                </div>
                <div id="statusIndicator" className={`text-[10px] text-center mb-2 font-bold ${isMarketDataActive ? 'text-green-500' : 'text-slate-500'}`}>
                  {isMarketDataActive ? '● DADOS ATIVOS' : '● DADOS PARADOS'}
                </div>
              </>
            )}
            
            {/* Botão Central de Notificações / Comunicados */}
            <button
              onClick={onOpenNotifications}
              className={`w-full px-3 py-2 mb-2 text-xs font-bold rounded-lg transition-all flex items-center justify-between border ${
                unreadCount > 0
                  ? 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border-blue-500/40 shadow-sm shadow-blue-950/40'
                  : 'bg-slate-900/60 hover:bg-slate-800/80 text-slate-300 border-slate-800'
              }`}
              title="Abrir Central de Notificações e Comunicados"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">🔔</span>
                <span className="menu-text">AVISOS</span>
              </div>
              {unreadCount > 0 && (
                <span className="bg-blue-500 text-white font-black text-[10px] px-1.5 py-0.2 rounded-full border border-blue-400 animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Logout Button */}
            <button
              onClick={logout}
              className="w-full px-3 py-2 mb-2 text-xs font-bold text-red-400 bg-red-900/20 hover:bg-red-900/40 border border-red-800/50 rounded transition-all flex items-center justify-center gap-2"
            >
              <span>🚪</span>
              <span className="menu-text">SAIR</span>
            </button>

            {/* Botão Central COPILOT IA */}
            {!isCopyOnly && canAccessCopilotAI && (
              <button
                onClick={() => setIsCopilotModalOpen(true)}
                className={`w-full py-2 mb-2 rounded-lg font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md border ${
                  aiEnabled
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-400 shadow-purple-900/50 animate-pulse'
                    : 'bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border-purple-800/80'
                }`}
                title="Abrir Central e Configurações do COPILOT IA"
              >
                <span className="btn-icon text-sm">🤖</span>
                <span className="btn-label menu-text">MODO COPILOT</span>
                <span className={`w-2 h-2 rounded-full ${aiEnabled ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              </button>
            )}

            {/* AI Action Button */}
            {!isCopyOnly && (
              !aiEnabled ? (
                <button
                  onClick={handleToggleIA}
                  className="btn-ia-iniciar w-full py-2 bg-green-500/15 text-green-500 border border-green-500 rounded font-bold text-xs hover:bg-green-500 hover:text-white transition flex items-center justify-center gap-2"
                >
                  <span className="btn-icon">🧠</span>
                  <span className="btn-label menu-text">ATIVAR IA</span>
                </button>
              ) : (
                <button
                  onClick={handleToggleIA}
                  className="btn-ia-parar w-full py-2 bg-orange-500/15 text-orange-500 border border-orange-500 rounded font-bold text-xs hover:bg-orange-500 hover:text-white transition flex items-center justify-center gap-2"
                >
                  <span className="btn-icon">⏸</span>
                  <span className="btn-label menu-text">PAUSAR IA</span>
                </button>
              )
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 w-full">
            {!isCopyOnly && (
              <div className="flex gap-2.5 justify-center items-center">
                {/* Ciclo Status Indicator */}
                <div 
                  className={`w-6 h-6 rounded-full flex items-center justify-center border text-[11px] cursor-help transition ${
                    isAnalyzing 
                      ? 'bg-blue-950/40 border-blue-500/40 text-blue-400 animate-pulse' 
                      : aiEnabled 
                        ? 'bg-green-950/40 border-green-500/40 text-green-400' 
                        : 'bg-slate-900/40 border-slate-800 text-slate-500'
                  }`}
                  title={isAnalyzing ? 'Ciclo IA: Analisando...' : aiEnabled ? 'Ciclo IA: Ativo' : 'Ciclo IA: Aguardando'}
                >
                  {isAnalyzing ? '🧠' : aiEnabled ? '🔄' : '⬜'}
                </div>

                {/* Data Connection Dot */}
                <div 
                  className={`w-3 h-3 rounded-full border cursor-help ${
                    isMarketDataActive 
                      ? 'bg-green-500 border-green-400 shadow-[0_0_6px_rgba(34,197,94,0.6)]' 
                      : 'bg-slate-700 border-slate-600'
                  }`}
                  title={isMarketDataActive ? 'Conexão: Dados de Mercado Ativos' : 'Conexão: Dados de Mercado Parados'}
                />
              </div>
            )}

            {/* Botão de Avisos Circular (Com Badge) */}
            <button
              onClick={onOpenNotifications}
              className={`relative w-9 h-9 rounded-full border flex items-center justify-center text-sm transition-all active:scale-95 cursor-pointer ${
                unreadCount > 0
                  ? 'bg-blue-600/30 hover:bg-blue-600/40 border-blue-400 text-blue-300 shadow-md shadow-blue-900/50'
                  : 'bg-slate-900/60 hover:bg-slate-800/80 border-slate-800 text-slate-300'
              }`}
              title="Central de Avisos e Comunicações"
            >
              <span>🔔</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-500 text-white font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center border border-blue-400 animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Logout Button (Circular) */}
            <button
              onClick={logout}
              className="w-9 h-9 rounded-full bg-red-950/30 hover:bg-red-900/40 border border-red-800/40 flex items-center justify-center text-sm transition-all active:scale-95"
              title="Sair do Sistema"
            >
              🚪
            </button>

            {/* Copilot Action Button (Circular) */}
            {!isCopyOnly && canAccessCopilotAI && (
              <button
                onClick={() => setIsCopilotModalOpen(true)}
                className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm transition-all active:scale-95 shadow-md cursor-pointer ${
                  aiEnabled
                    ? 'bg-purple-600 border-purple-400 shadow-purple-900/50 animate-pulse'
                    : 'bg-purple-950/60 hover:bg-purple-900/80 border-purple-800/80 text-purple-300'
                }`}
                title="Abrir Central do COPILOT IA"
              >
                🤖
              </button>
            )}

            {/* AI Action Button (Circular) */}
            {!isCopyOnly && (
              !aiEnabled ? (
                <button
                  onClick={handleToggleIA}
                  className="w-9 h-9 rounded-full bg-green-950/30 hover:bg-green-500 border border-green-500/40 flex items-center justify-center text-sm transition-all active:scale-95"
                  title="Ativar Ciclo IA"
                >
                  🧠
                </button>
              ) : (
                <button
                  onClick={handleToggleIA}
                  className="w-9 h-9 rounded-full bg-orange-950/30 hover:bg-orange-500 border border-orange-500/40 flex items-center justify-center text-sm transition-all active:scale-95"
                  title="Pausar Ciclo IA"
                >
                  ⏸
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
};
