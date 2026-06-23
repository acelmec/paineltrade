import React, { useState } from 'react';
import { useApp } from './context/AppContext';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Settings } from './components/Settings';

export const AppContent: React.FC = () => {
  const { isAuthenticated, isCheckingAuth } = useApp();
  const [currentPage, setCurrentPage] = useState<string>('dashboard');
  const [collapsed, setCollapsed] = useState<boolean>(true); // Começa fechado (colapsado) por padrão no celular

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] flex flex-col justify-center items-center font-sans text-slate-200">
        <div className="text-4xl mb-4 animate-pulse">🧠</div>
        <div className="text-sm font-bold tracking-wider text-slate-400">VERIFICANDO SESSÃO VORTEX AI...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-[#e2e8f0] font-sans">
      {/* Botão flutuante para abrir o menu no celular */}
      <button 
        onClick={() => setCollapsed(!collapsed)}
        className="fixed top-3 left-3 z-[9999] md:hidden bg-slate-900/90 border border-slate-700 text-white p-2 rounded shadow-lg text-lg flex items-center justify-center w-9 h-9 active:scale-95 transition"
        title="Menu"
      >
        ☰
      </button>

      {/* Sidebar */}
      <Sidebar 
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage} 
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />

      {/* Main Content Area */}
      <div className={`p-3 md:p-4 transition-all duration-300 ${collapsed ? 'pl-3 md:pl-[80px]' : 'pl-3 md:pl-[240px]'}`}>
        {currentPage === 'dashboard' && <Dashboard />}
        {currentPage === 'configuracoes' && <Settings initialTab="geral" />}
        {currentPage === 'prompts' && <Settings initialTab="prompts" />}
        {currentPage === 'alertas' && <Settings initialTab="alertas" />}
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AppContent />
  );
};

export default App;
