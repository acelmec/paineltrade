import React from 'react';
import { useApp } from '../context/AppContext';

interface SidebarProps {
  currentPage: string;
  setCurrentPage: (page: string) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage, collapsed, setCollapsed }) => {
  const { logout, aiEnabled, setAiEnabled, isAnalyzing, marketData } = useApp();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', sublabel: 'Painel principal', icon: '📊' },
    { id: 'configuracoes', label: 'Configurações', sublabel: 'APIs e intervalos', icon: '⚙️' },
    { id: 'prompts', label: 'Prompts IA', sublabel: 'Análise principal', icon: '📝' },
    { id: 'alertas', label: 'Alertas', sublabel: 'Configurações de alarme', icon: '🔔' }
  ];

  const handleToggleIA = () => {
    setAiEnabled(!aiEnabled);
  };

  const isMarketDataActive = marketData && marketData.timestamp !== '--:--:--';

  return (
    <div className={`side-menu ${collapsed ? 'collapsed' : ''}`} id="sideMenu">
      {/* Menu Toggle */}
      <div className="menu-toggle" onClick={() => setCollapsed(!collapsed)} title="Recolher/Expandir menu">
        <div className="menu-toggle-icon">☰</div>
        <div className="menu-text">
          <div className="menu-label text-sm text-slate-200">Menu</div>
          <div className="menu-sublabel text-[10px] text-slate-500">Recolher/Expandir</div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="flex-1 py-2">
        {menuItems.map((item) => (
          <div
            key={item.id}
            className={`menu-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => setCurrentPage(item.id)}
          >
            <div className="menu-icon text-lg">{item.icon}</div>
            <div className="menu-text">
              <div className="menu-label text-slate-200">{item.label}</div>
              <div className="menu-sublabel text-[10px] text-slate-500">{item.sublabel}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Menu Footer */}
      <div className="menu-footer p-4 border-t border-slate-800">
        <div id="cicloStatus" className="text-slate-500 text-xs text-center mb-1 bg-slate-900/60 p-1.5 rounded border border-slate-800/50">
          {isAnalyzing ? '🧠 Analisando...' : aiEnabled ? '🔄 Ciclo Ativo' : '⬜ Aguardando...'}
        </div>
        <div id="statusIndicator" className={`text-[10px] text-center mb-2 font-bold ${isMarketDataActive ? 'text-green-500' : 'text-slate-500'}`}>
          {isMarketDataActive ? '● DADOS ATIVOS' : '● DADOS PARADOS'}
        </div>
        
        {/* Logout Button */}
        <button
          onClick={logout}
          className="w-full px-3 py-2 mb-2 text-xs font-bold text-red-400 bg-red-900/20 hover:bg-red-900/40 border border-red-800/50 rounded transition-all flex items-center justify-center gap-2"
        >
          <span>🚪</span>
          <span className="menu-text">SAIR</span>
        </button>

        {/* AI Action Button */}
        {!aiEnabled ? (
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
        )}
      </div>
    </div>
  );
};
