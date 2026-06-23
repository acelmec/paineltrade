import React, { useState } from 'react';
import { useApp } from './context/AppContext';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Settings } from './components/Settings';

export const AppContent: React.FC = () => {
  const { isAuthenticated, isCheckingAuth } = useApp();
  const [currentPage, setCurrentPage] = useState<string>('dashboard');

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
      {/* Sidebar */}
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />

      {/* Main Content Area */}
      <div className="main-content pl-[240px] p-4 transition-all duration-300">
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
