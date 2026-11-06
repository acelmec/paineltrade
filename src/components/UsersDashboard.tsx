import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useApp } from '../context/AppContext';
import { 
  sendBroadcastMessageAdmin, 
  fetchBroadcastMessagesAdmin, 
  deleteBroadcastMessageAdmin 
} from '../services/db';

export const UsersDashboard: React.FC = () => {
  const { user } = useApp();
  const isAdmin = user?.email?.toLowerCase() === 'admin@vortex.com';

  const [activeTab, setActiveTab] = useState<'usuarios' | 'comunicados'>('usuarios');

  const [sessions, setSessions] = useState<any[]>([]);
  const [blockedIps, setBlockedIps] = useState<any[]>([]);
  const [newBlockedIp, setNewBlockedIp] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [connectionFilter, setConnectionFilter] = useState<'all' | 'regular' | 'restricted' | 'both'>('all');

  // Broadcast Messages State
  const [broadcastList, setBroadcastList] = useState<any[]>([]);
  const [msgSubject, setMsgSubject] = useState<string>('');
  const [msgContent, setMsgContent] = useState<string>('');
  const [isSendingMsg, setIsSendingMsg] = useState<boolean>(false);

  const fetchBroadcasts = async () => {
    try {
      const data = await fetchBroadcastMessagesAdmin();
      setBroadcastList(data);
    } catch (e) {
      console.warn('[USERS DASHBOARD] Erro ao buscar comunicados:', e);
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgSubject.trim() || !msgContent.trim()) {
      setMessage({ type: 'error', text: 'Preencha o título e o conteúdo da mensagem.' });
      return;
    }

    setIsSendingMsg(true);
    try {
      const res = await sendBroadcastMessageAdmin(msgSubject, msgContent);
      if (!res.success) {
        throw new Error(res.error || 'Falha ao salvar comunicado no servidor.');
      }

      setMessage({ type: 'success', text: 'Comunicado emitido e disparado com sucesso para todos os usuários!' });
      setMsgSubject('');
      setMsgContent('');
      await fetchBroadcasts();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Erro ao enviar comunicado: ${err.message || err}` });
    } finally {
      setIsSendingMsg(false);
    }
  };

  const handleDeleteBroadcast = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta mensagem enviada?')) return;
    try {
      const ok = await deleteBroadcastMessageAdmin(id);
      if (!ok) throw new Error('Não foi possível excluir o comunicado.');

      setMessage({ type: 'success', text: 'Comunicado excluído com sucesso!' });
      await fetchBroadcasts();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Erro ao excluir comunicado: ${err.message || err}` });
    }
  };

  const fetchData = async () => {
    if (!isAdmin) return;
    try {
      // 1. Fetch sessions
      const { data: sessionsData, error: sessionsErr } = await supabase
        .from('painelvm_users_sessions')
        .select('*')
        .order('last_access', { ascending: false });

      if (sessionsErr) throw sessionsErr;
      setSessions(sessionsData || []);

      // 2. Fetch Blocked IPs
      const { data: blockedData, error: blockedErr } = await supabase
        .from('painelvm_blocked_ips')
        .select('*')
        .order('created_at', { ascending: false });

      if (blockedErr) throw blockedErr;
      setBlockedIps(blockedData || []);
      setError(null);
    } catch (err: any) {
      console.error('[USERS DASHBOARD] Erro ao carregar dados:', err);
      setError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchBroadcasts();
    // 5-second automatic real-time sync
    const interval = setInterval(() => {
      fetchData();
      fetchBroadcasts();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleBlockIp = async (ip: string) => {
    if (!ip || ip === '127.0.0.1') return;
    if (!window.confirm(`Tem certeza que deseja bloquear o IP ${ip}?`)) return;
    try {
      const { error: blockErr } = await supabase
        .from('painelvm_blocked_ips')
        .insert({ ip_address: ip });

      if (blockErr) throw blockErr;
      setMessage({ type: 'success', text: `IP ${ip} bloqueado com sucesso!` });
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Erro ao bloquear IP: ${err.message}` });
    }
  };

  const handleUnblockIp = async (ip: string) => {
    if (!window.confirm(`Tem certeza que deseja desbloquear o IP ${ip}?`)) return;
    try {
      const { error: unblockErr } = await supabase
        .from('painelvm_blocked_ips')
        .delete()
        .eq('ip_address', ip);

      if (unblockErr) throw unblockErr;
      setMessage({ type: 'success', text: `IP ${ip} desbloqueado com sucesso!` });
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Erro ao desbloquear IP: ${err.message}` });
    }
  };

  const handleAddBlockedIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlockedIp.trim()) return;
    try {
      const { error: addErr } = await supabase
        .from('painelvm_blocked_ips')
        .insert({ ip_address: newBlockedIp.trim() });

      if (addErr) throw addErr;
      setMessage({ type: 'success', text: `IP ${newBlockedIp} bloqueado com sucesso!` });
      setNewBlockedIp('');
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Erro ao adicionar IP bloqueado: ${err.message}` });
    }
  };

  const handleTerminateSession = async (sessionId: string, type: 'regular' | 'restricted' | 'both', emailStr: string) => {
    if (!window.confirm(`Deseja derrubar a conexão (${type}) do usuário ${emailStr}?`)) return;
    try {
      if (type === 'regular') {
        const { error: updateErr } = await supabase
          .from('painelvm_users_sessions')
          .update({ session_id: null })
          .eq('session_id', sessionId);
        if (updateErr) throw updateErr;
      } else if (type === 'restricted') {
        const { error: updateErr } = await supabase
          .from('painelvm_users_sessions')
          .update({ restricted_session_id: null })
          .eq('restricted_session_id', sessionId);
        if (updateErr) throw updateErr;
      } else {
        // 'both' (delete entire row)
        const { error: deleteErr } = await supabase
          .from('painelvm_users_sessions')
          .delete()
          .eq('id', sessionId);
        if (deleteErr) throw deleteErr;
      }
      setMessage({ type: 'success', text: `Conexão do usuário ${emailStr} encerrada!` });
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Erro ao derrubar sessão: ${err.message}` });
    }
  };

  const handleTogglePermission = async (sessionId: string, permissionKey: string, value: boolean, emailStr: string) => {
    try {
      const { error: updateErr } = await supabase
        .from('painelvm_users_sessions')
        .update({ [permissionKey]: value })
        .eq('id', sessionId);

      if (updateErr) throw updateErr;

      const permLabel = permissionKey === 'allow_telegram_news' 
        ? 'Notícias Telegram' 
        : permissionKey === 'allow_alerts' 
        ? 'Alertas' 
        : permissionKey === 'allow_operations' 
        ? 'Operações' 
        : permissionKey === 'allow_simulator' 
        ? 'Replay de Mercado' 
        : permissionKey === 'allow_copy_trading'
        ? 'Copy Trading NT8'
        : permissionKey === 'allow_panel_mode_2'
        ? 'Modo 2 (Painel Avançado)'
        : 'Compartilhar Estratégias';
      setMessage({ 
        type: 'success', 
        text: `Permissão '${permLabel}' atualizada para o usuário ${emailStr}!` 
      });
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Erro ao atualizar permissão: ${err.message}` });
    }
  };

  const handleUpdateMaxStrategies = async (sessionId: string, currentVal: number, emailStr: string, directVal?: number) => {
    let newVal: number;
    if (directVal !== undefined) {
      newVal = directVal;
    } else {
      const newValStr = window.prompt(`Defina o limite máximo de robôs/estratégias para ${emailStr}:`, String(currentVal));
      if (newValStr === null) return;
      newVal = parseInt(newValStr);
    }
    if (isNaN(newVal) || newVal < 0) {
      alert('Por favor, insira um número válido!');
      return;
    }
    try {
      const { error: updateErr } = await supabase
        .from('painelvm_users_sessions')
        .update({ max_strategies: newVal })
        .eq('id', sessionId);

      if (updateErr) throw updateErr;

      setMessage({ 
        type: 'success', 
        text: `Limite de estratégias atualizado para ${newVal} para o usuário ${emailStr}!` 
      });
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Erro ao atualizar limite: ${err.message}` });
    }
  };

  const handleUpdateMaxAccounts = async (sessionId: string, currentVal: number, emailStr: string, directVal?: number) => {
    let newVal: number;
    if (directVal !== undefined) {
      newVal = directVal;
    } else {
      const newValStr = window.prompt(`Defina o limite máximo de contas permitidas para ${emailStr}:`, String(currentVal || 5));
      if (newValStr === null) return;
      newVal = parseInt(newValStr);
    }
    if (isNaN(newVal) || newVal < 1) {
      alert('Por favor, insira um número válido maior ou igual a 1!');
      return;
    }
    try {
      const { error: updateErr } = await supabase
        .from('painelvm_users_sessions')
        .update({ max_accounts: newVal })
        .eq('id', sessionId);

      if (updateErr) throw updateErr;

      setMessage({ 
        type: 'success', 
        text: `Limite de contas atualizado para ${newVal} para o usuário ${emailStr}!` 
      });
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Erro ao atualizar limite de contas: ${err.message}` });
    }
  };

  const handleAdminResetPassword = async (emailStr: string, subIdStr: string) => {
    if (!emailStr || emailStr === 'N/A') {
      alert('E-mail do usuário não identificado.');
      return;
    }
    const newPass = window.prompt(`Defina a nova senha de acesso para o usuário ${emailStr} (mínimo 6 caracteres):`);
    if (!newPass) return;
    if (newPass.length < 6) {
      alert('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    try {
      const { data: userData, error: listErr } = await supabase.auth.admin.listUsers();
      if (listErr) throw listErr;
      const target = userData?.users?.find(u => u.email?.toLowerCase() === emailStr.toLowerCase());

      if (target) {
        const { error: updErr } = await supabase.auth.admin.updateUserById(target.id, {
          password: newPass,
          user_metadata: { subscription_id: subIdStr }
        });
        if (updErr) throw updErr;
      } else {
        const { error: crtErr } = await supabase.auth.admin.createUser({
          email: emailStr,
          password: newPass,
          email_confirm: true,
          user_metadata: { subscription_id: subIdStr }
        });
        if (crtErr) throw crtErr;
      }

      setMessage({
        type: 'success',
        text: `Senha do usuário ${emailStr} atualizada com sucesso para "${newPass}"!`
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: `Erro ao redefinir senha do usuário: ${err.message || err}` });
    }
  };

  const handleResetAllUserPanels = async () => {
    if (!window.confirm("⚠️ ATENÇÃO: Tem certeza que deseja EXCLUIR todos os painéis e configurações de todos os usuários não-administradores?\n\nQuando os usuários fizerem login, eles receberão automaticamente uma cópia idêntica e atualizada dos painéis do Administrador.")) {
      return;
    }

    try {
      setIsLoading(true);
      // 1. Buscar todos os painéis que NÃO são do admin
      const { data: nonAdminPanels, error: fetchErr } = await supabase
        .from('painelvm_panels')
        .select('id')
        .neq('subscription_id', 'admin');

      if (fetchErr) throw fetchErr;

      const panelIds = (nonAdminPanels || []).map(p => p.id);
      if (panelIds.length > 0) {
        // 2. Excluir configurações associadas
        await supabase
          .from('painelvm_settings')
          .delete()
          .in('panel_id', panelIds);

        // 3. Excluir painéis não-admin
        const { error: delErr } = await supabase
          .from('painelvm_panels')
          .delete()
          .in('id', panelIds);

        if (delErr) throw delErr;
      }

      setMessage({
        type: 'success',
        text: `✅ Sucesso! ${panelIds.length} painéis de usuários foram excluídos do banco de dados. Ao logarem, todos os usuários receberão uma cópia idêntica dos painéis atuais do Admin!`
      });
    } catch (err: any) {
      console.error('[RESET PANELS] Erro:', err);
      setMessage({ type: 'error', text: `Erro ao resetar painéis: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="bg-red-950/20 border border-red-800/40 p-6 rounded-lg text-center text-red-400 font-bold m-4">
        ⚠️ Acesso Restrito: Apenas o Administrador pode visualizar esta página.
      </div>
    );
  }

  // Calculate statistics
  const now = Date.now();
  const getIsOnline = (lastAccess: string | null, updatedAt: string | null) => {
    if (!lastAccess && !updatedAt) return false;
    const time = new Date(lastAccess || updatedAt || '').getTime();
    return now - time < 45000;
  };

  let totalUsers = sessions.length;
  let onlineAdmins = 0;
  let onlineRestricted = 0;

  sessions.forEach(s => {
    const mainOnline = s.session_id && getIsOnline(s.updated_at, s.last_access);
    const restOnline = s.restricted_session_id && getIsOnline(s.restricted_updated_at, s.last_access);
    if (mainOnline) onlineAdmins++;
    if (restOnline) onlineRestricted++;
  });

  // Filtered Sessions list
  const filteredSessions = sessions.filter(s => {
    // 1. Text search
    const query = searchQuery.toLowerCase().trim();
    const matchesQuery = !query || 
      (s.email && s.email.toLowerCase().includes(query)) ||
      (s.subscription_id && s.subscription_id.toLowerCase().includes(query)) ||
      (s.ip_address && s.ip_address.toLowerCase().includes(query));

    if (!matchesQuery) return false;

    // 2. Status filter
    const mainOnline = s.session_id && getIsOnline(s.updated_at, s.last_access);
    const restOnline = s.restricted_session_id && getIsOnline(s.restricted_updated_at, s.last_access);
    const isAnyOnline = mainOnline || restOnline;

    if (statusFilter === 'online' && !isAnyOnline) return false;
    if (statusFilter === 'offline' && isAnyOnline) return false;

    // 3. Connection type filter
    if (connectionFilter === 'regular' && !s.session_id) return false;
    if (connectionFilter === 'restricted' && !s.restricted_session_id) return false;
    if (connectionFilter === 'both' && (!s.session_id || !s.restricted_session_id)) return false;

    return true;
  });

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-blue-400">👥 Gestão Administrativa de Usuários</h2>
          <p className="text-xs text-slate-400 mt-1">Supervisão de conexões ativas, IPs bloqueados e controle de sessão em tempo real.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetAllUserPanels}
            disabled={isLoading}
            className="px-3 py-1.5 bg-rose-950/50 hover:bg-rose-900/70 border border-rose-700/60 text-rose-300 hover:text-white rounded text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            title="Exclui todos os painéis e configurações dos usuários não-admin para que recebam uma cópia nova do Admin no próximo login"
          >
            🗑️ Redefinir Painéis de Todos Usuários
          </button>
          <button
            onClick={() => {
              fetchData();
              fetchBroadcasts();
            }}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded text-xs font-bold transition flex items-center gap-1.5"
          >
            🔄 Sincronizar Agora
          </button>
        </div>
      </div>

      {/* Navegação entre Sub-Abas */}
      <div className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800/80 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('usuarios')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'usuarios'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <span>👥</span>
          <span>Usuários &amp; Conexões</span>
          <span className="bg-slate-950/60 text-[10px] px-1.5 py-0.5 rounded-full text-slate-300 border border-slate-800">
            {sessions.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('comunicados')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'comunicados'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <span>📢</span>
          <span>Central de Comunicados</span>
          {broadcastList.length > 0 && (
            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-1.5 py-0.5 rounded-full border border-emerald-500/30 font-extrabold">
              {broadcastList.length}
            </span>
          )}
        </button>
      </div>

      {/* Message Notifications */}
      {message && (
        <div className={`p-3 rounded text-xs font-bold border flex items-center justify-between transition-all ${
          message.type === 'success' 
            ? 'border-green-500/50 bg-green-500/10 text-green-400' 
            : 'border-red-500/50 bg-red-500/10 text-red-400'
        }`}>
          <span>{message.type === 'success' ? '✅' : '❌'} {message.text}</span>
          <button onClick={() => setMessage(null)} className="text-[10px] opacity-75 hover:opacity-100 uppercase tracking-wider font-extrabold ml-4">Fechar</button>
        </div>
      )}

      {error && (
        <div className="p-3 border border-red-500/50 bg-red-500/10 rounded text-xs text-red-400">
          ⚠️ <strong>Erro de Conexão:</strong> {error}. Certifique-se de que a migração SQL foi aplicada no Supabase.
        </div>
      )}

      {/* Content Tabs */}
      {activeTab === 'usuarios' ? (
        <>
          {/* Dashboard Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Card 1: Total Assinaturas */}
        <div className="bg-slate-800/30 border border-slate-700/60 p-4 rounded-lg flex items-center justify-between hover:border-slate-600 transition">
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Total de Assinaturas</span>
            <h4 className="text-3xl font-black text-slate-100 mt-1">{totalUsers}</h4>
          </div>
          <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center text-lg">📁</div>
        </div>

        {/* Card 2: Conexões Principais */}
        <div className="bg-slate-800/30 border border-slate-700/60 p-4 rounded-lg flex items-center justify-between hover:border-slate-600 transition">
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Conexões Principais Online</span>
            <h4 className="text-3xl font-black text-emerald-400 mt-1">{onlineAdmins}</h4>
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-lg">⚡</div>
        </div>

        {/* Card 3: Conexões Restritas */}
        <div className="bg-slate-800/30 border border-slate-700/60 p-4 rounded-lg flex items-center justify-between hover:border-slate-600 transition">
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Sessões Restritas Online</span>
            <h4 className="text-3xl font-black text-amber-400 mt-1">{onlineRestricted}</h4>
          </div>
          <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center text-lg">🔒</div>
        </div>

        {/* Card 4: IPs Bloqueados */}
        <div className="bg-slate-800/30 border border-slate-700/60 p-4 rounded-lg flex items-center justify-between hover:border-slate-600 transition">
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">IPs Bloqueados</span>
            <h4 className="text-3xl font-black text-red-400 mt-1">{blockedIps.length}</h4>
          </div>
          <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center text-lg">🚫</div>
        </div>
      </div>

      {/* Main Panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Columns: Users and Sessions */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 space-y-4">
            
            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar por email, assinatura ou IP..."
                  className="bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 px-3 py-2 rounded text-xs w-full focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              {/* Status Select */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 px-3 py-2 rounded text-xs text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="all">Todos os Status</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
              </select>

              {/* Connection Type Select */}
              <select
                value={connectionFilter}
                onChange={(e) => setConnectionFilter(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 px-3 py-2 rounded text-xs text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="all">Todas as Conexões</option>
                <option value="regular">Somente Principais</option>
                <option value="restricted">Somente Restritas</option>
                <option value="both">Ambas Conectadas</option>
              </select>
            </div>

            {/* Users list table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 uppercase tracking-wider font-bold bg-slate-900/35">
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">E-mail</th>
                    <th className="py-2.5 px-3">Assinatura</th>
                    <th className="py-2.5 px-3">IP Utilizado</th>
                    <th className="py-2.5 px-3">Último Acesso</th>
                    <th className="py-2.5 px-3">Permissões</th>
                    <th className="py-2.5 px-3 text-center min-w-[210px]">Limites (Contas & Robôs)</th>
                    <th className="py-2.5 px-3 text-right min-w-[150px]">Ações & Sessão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 animate-pulse">Carregando sessões de usuários...</td>
                    </tr>
                  ) : filteredSessions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">Nenhum usuário correspondente aos filtros.</td>
                    </tr>
                  ) : (
                    filteredSessions.map((s) => {
                      const mainOnline = s.session_id && getIsOnline(s.updated_at, s.last_access);
                      const restOnline = s.restricted_session_id && getIsOnline(s.restricted_updated_at, s.last_access);
                      const isOnline = mainOnline || restOnline;
                      
                      return (
                        <tr key={s.id} className="hover:bg-slate-700/10 transition-colors">
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1.5 w-fit ${
                              isOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'
                             }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
                              {isOnline ? 'Online' : 'Offline'}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-200">{s.email || 'N/A'}</td>
                          <td className="py-3 px-3 font-mono text-slate-400">{s.subscription_id}</td>
                          <td className="py-3 px-3 font-mono text-slate-300">{s.ip_address || 'N/A'}</td>
                          <td className="py-3 px-3 text-slate-400">
                            {s.last_access ? new Date(s.last_access).toLocaleString('pt-BR') : 'N/A'}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-col gap-1.5 bg-slate-900/50 p-2 rounded border border-slate-800/40 w-fit">
                              <label className="flex items-center gap-2 cursor-pointer text-[10px] text-slate-300 hover:text-slate-100 select-none">
                                <input
                                  type="checkbox"
                                  checked={s.subscription_id === 'admin' || s.allow_telegram_news === true}
                                  onChange={(e) => handleTogglePermission(s.id, 'allow_telegram_news', e.target.checked, s.email || s.subscription_id)}
                                  className="accent-blue-500 rounded border-slate-700 w-3.5 h-3.5 cursor-pointer"
                                  disabled={s.subscription_id === 'admin'}
                                  />
                                📰 Notícias Telegram
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer text-[10px] text-slate-300 hover:text-slate-100 select-none">
                                <input
                                  type="checkbox"
                                  checked={s.subscription_id === 'admin' || s.allow_alerts !== false}
                                  onChange={(e) => handleTogglePermission(s.id, 'allow_alerts', e.target.checked, s.email || s.subscription_id)}
                                  className="accent-blue-500 rounded border-slate-700 w-3.5 h-3.5 cursor-pointer"
                                  disabled={s.subscription_id === 'admin'}
                                />
                                🔔 Alertas
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer text-[10px] text-slate-300 hover:text-slate-100 select-none">
                                <input
                                  type="checkbox"
                                  checked={s.subscription_id === 'admin' || s.allow_operations !== false}
                                  onChange={(e) => handleTogglePermission(s.id, 'allow_operations', e.target.checked, s.email || s.subscription_id)}
                                  className="accent-blue-500 rounded border-slate-700 w-3.5 h-3.5 cursor-pointer"
                                  disabled={s.subscription_id === 'admin'}
                                />
                                💼 Operações
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer text-[10px] text-slate-300 hover:text-slate-100 select-none">
                                <input
                                  type="checkbox"
                                  checked={s.subscription_id === 'admin' || s.allow_simulator === true}
                                  onChange={(e) => handleTogglePermission(s.id, 'allow_simulator', e.target.checked, s.email || s.subscription_id)}
                                  className="accent-green-500 rounded border-slate-700 w-3.5 h-3.5 cursor-pointer"
                                  disabled={s.subscription_id === 'admin'}
                                />
                                ⏪ Replay de Mercado
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer text-[10px] text-slate-300 hover:text-slate-100 select-none">
                                <input
                                  type="checkbox"
                                  checked={s.subscription_id === 'admin' || s.allow_panel_mode_2 === true}
                                  onChange={(e) => handleTogglePermission(s.id, 'allow_panel_mode_2', e.target.checked, s.email || s.subscription_id)}
                                  className="accent-cyan-500 rounded border-slate-700 w-3.5 h-3.5 cursor-pointer"
                                  disabled={s.subscription_id === 'admin'}
                                />
                                ⚡ Modo 2 (Painel Avançado)
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer text-[10px] text-slate-300 hover:text-slate-100 select-none">
                                <input
                                  type="checkbox"
                                  checked={s.subscription_id === 'admin' || s.allow_share_strategies === true}
                                  onChange={(e) => handleTogglePermission(s.id, 'allow_share_strategies', e.target.checked, s.email || s.subscription_id)}
                                  className="accent-purple-500 rounded border-slate-700 w-3.5 h-3.5 cursor-pointer"
                                  disabled={s.subscription_id === 'admin'}
                                />
                                🌐 Compartilhar Estratégias
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer text-[10px] text-amber-300 hover:text-amber-100 select-none">
                                <input
                                  type="checkbox"
                                  checked={s.subscription_id === 'admin' || s.allow_copy_trading === true}
                                  onChange={(e) => handleTogglePermission(s.id, 'allow_copy_trading', e.target.checked, s.email || s.subscription_id)}
                                  className="accent-amber-500 rounded border-slate-700 w-3.5 h-3.5 cursor-pointer"
                                  disabled={s.subscription_id === 'admin'}
                                />
                                ⚡ Copy Trading NT8
                              </label>
                            </div>
                          </td>
                          {/* Dedicated Limites Column (Contas & Robôs) */}
                          <td className="py-3 px-3 text-center">
                            {s.subscription_id === 'admin' ? (
                              <span className="px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                                ♾️ Ilimitado (Admin)
                              </span>
                            ) : (
                              <div className="flex flex-col gap-1.5 items-center justify-center">
                                {/* Limite de Contas com Stepper e Botão +5 */}
                                <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-700/80 rounded-md px-2 py-1 shadow-sm w-fit">
                                  <span className="text-[10px] font-bold text-slate-300 mr-1 flex items-center gap-1">
                                    💼 Contas:
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateMaxAccounts(s.id, s.max_accounts || 5, s.email || s.subscription_id, Math.max(1, (s.max_accounts || 5) - 1))}
                                    className="w-5 h-5 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 rounded text-xs font-bold transition active:scale-90 cursor-pointer"
                                    title="Diminuir 1 conta"
                                  >
                                    -
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateMaxAccounts(s.id, s.max_accounts || 5, s.email || s.subscription_id)}
                                    className="px-2 py-0.5 min-w-[26px] bg-blue-950/70 hover:bg-blue-900 border border-blue-600/60 text-blue-300 rounded text-[11px] font-mono font-bold transition cursor-pointer"
                                    title="Clique para digitar qualquer valor desejado"
                                  >
                                    {s.max_accounts || 5}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateMaxAccounts(s.id, s.max_accounts || 5, s.email || s.subscription_id, (s.max_accounts || 5) + 1)}
                                    className="w-5 h-5 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 rounded text-xs font-bold transition active:scale-90 cursor-pointer"
                                    title="Aumentar 1 conta"
                                  >
                                    +
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateMaxAccounts(s.id, s.max_accounts || 5, s.email || s.subscription_id, (s.max_accounts || 5) + 5)}
                                    className="px-1.5 py-0.5 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-400 rounded text-[9px] font-bold transition active:scale-90 cursor-pointer ml-0.5"
                                    title="Adicionar +5 contas rapidamente"
                                  >
                                    +5
                                  </button>
                                </div>

                                {/* Limite de Robôs com Stepper */}
                                <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-700/80 rounded-md px-2 py-1 shadow-sm w-fit">
                                  <span className="text-[10px] font-bold text-slate-300 mr-1 flex items-center gap-1">
                                    🤖 Robôs:
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateMaxStrategies(s.id, s.max_strategies || 2, s.email || s.subscription_id, Math.max(0, (s.max_strategies || 2) - 1))}
                                    className="w-5 h-5 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 rounded text-xs font-bold transition active:scale-90 cursor-pointer"
                                    title="Diminuir 1 robô"
                                  >
                                    -
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateMaxStrategies(s.id, s.max_strategies || 2, s.email || s.subscription_id)}
                                    className="px-2 py-0.5 min-w-[26px] bg-purple-950/70 hover:bg-purple-900 border border-purple-600/60 text-purple-300 rounded text-[11px] font-mono font-bold transition cursor-pointer"
                                    title="Clique para digitar qualquer limite de robôs"
                                  >
                                    {s.max_strategies || 2}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateMaxStrategies(s.id, s.max_strategies || 2, s.email || s.subscription_id, (s.max_strategies || 2) + 1)}
                                    className="w-5 h-5 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 rounded text-xs font-bold transition active:scale-90 cursor-pointer"
                                    title="Aumentar 1 robô"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>

                          {/* Ações & Sessão */}
                          <td className="py-3 px-3 text-right">
                            <div className="flex flex-wrap gap-1 justify-end w-fit ml-auto max-w-[170px]">
                              {/* Admin Reset Password Action */}
                              {s.subscription_id !== 'admin' && (
                                <button
                                  type="button"
                                  onClick={() => handleAdminResetPassword(s.email, s.subscription_id)}
                                  className="px-2 py-1 bg-indigo-950/30 hover:bg-indigo-900/50 border border-indigo-800/40 text-indigo-300 rounded text-[10px] font-bold transition cursor-pointer"
                                  title="Redefinir / cadastrar senha deste usuário manualmente"
                                >
                                  🔑 Senha
                                </button>
                              )}

                              {/* Terminate Regular Session */}
                              {s.session_id && (
                                <button
                                  type="button"
                                  onClick={() => handleTerminateSession(s.session_id, 'regular', s.email || s.subscription_id)}
                                  className="px-2 py-1 bg-amber-950/30 hover:bg-amber-900/50 border border-amber-800/40 text-amber-400 rounded text-[10px] font-bold transition cursor-pointer"
                                  title="Terminar Sessão Principal (Admin/Operações)"
                                >
                                  ⚡ Principal
                                </button>
                              )}

                              {/* Terminate Restricted Session */}
                              {s.restricted_session_id && (
                                <button
                                  type="button"
                                  onClick={() => handleTerminateSession(s.restricted_session_id, 'restricted', s.email || s.subscription_id)}
                                  className="px-2 py-1 bg-blue-950/30 hover:bg-blue-900/50 border border-blue-800/40 text-blue-400 rounded text-[10px] font-bold transition cursor-pointer"
                                  title="Terminar Sessão Restrita (Espelho)"
                                >
                                  🔒 Restrita
                                </button>
                              )}

                              {/* Block IP Action */}
                              {s.ip_address && s.ip_address !== '127.0.0.1' && (
                                <button
                                  type="button"
                                  onClick={() => handleBlockIp(s.ip_address)}
                                  className="px-2 py-1 bg-red-950/30 hover:bg-red-900/50 border border-red-800/40 text-red-400 rounded text-[10px] font-bold transition cursor-pointer"
                                  title="Bloquear endereço de IP do usuário"
                                >
                                  🚫 Bloquear
                                </button>
                              )}

                              {/* Terminate Both (Delete session row) */}
                              <button
                                type="button"
                                onClick={() => handleTerminateSession(s.id, 'both', s.email || s.subscription_id)}
                                className="px-2 py-1 bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded text-[10px] font-bold transition cursor-pointer"
                                title="Derrubar todas as conexões e limpar sessão do banco"
                              >
                                💀 Tudo
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right 1 Column: Blocked IPs and Manual Addition */}
        <div className="space-y-6">
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 flex items-center gap-1.5">
              <span>🚫 Lista de IPs Bloqueados</span>
              <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 text-[10px] border border-red-500/25">{blockedIps.length}</span>
            </h3>

            {/* Block manual IP form */}
            <form onSubmit={handleAddBlockedIp} className="flex gap-2">
              <input
                type="text"
                value={newBlockedIp}
                onChange={(e) => setNewBlockedIp(e.target.value)}
                placeholder="Ex: 191.240.56.98"
                className="bg-slate-900 border border-slate-700 text-slate-200 px-3 py-1.5 rounded text-xs focus:outline-none focus:border-blue-500 flex-1 font-mono"
              />
              <button
                type="submit"
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-xs font-bold transition whitespace-nowrap"
              >
                Bloquear IP
              </button>
            </form>

            {/* Blocked IPs table */}
            <div className="overflow-y-auto max-h-[350px] scrollbar-thin">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 uppercase tracking-wider font-bold">
                    <th className="py-2 px-2">IP Bloqueado</th>
                    <th className="py-2 px-2 text-right">Desbloquear</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {blockedIps.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="py-4 text-center text-slate-500 italic">Nenhum IP bloqueado.</td>
                    </tr>
                  ) : (
                    blockedIps.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-700/10 transition-colors">
                        <td className="py-2 px-2 font-mono font-semibold text-red-400 text-[11px]">{b.ip_address}</td>
                        <td className="py-2 px-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleUnblockIp(b.ip_address)}
                            className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded text-[10px] font-semibold transition"
                            title="Remover IP do bloqueio"
                          >
                            Liberar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-slate-800/20 border border-slate-800/80 p-4 rounded-lg text-slate-400 text-[11px] space-y-2 leading-relaxed">
            <h4 className="font-bold text-slate-300">💡 Como Funciona o Bloqueio</h4>
            <p>1. Usuários que tentarem realizar login com um IP listado no painel acima receberão uma mensagem de <strong>Acesso Negado</strong>.</p>
            <p>2. Usuários que já estiverem logados e tiverem seu IP bloqueado serão desconectados automaticamente no próximo batimento (em no máximo 10 segundos).</p>
            <p>3. Derrubar conexões individuais (Principal ou Restrita) limpa a chave da sessão ativa do banco, forçando o logout imediato no respectivo dispositivo.</p>
          </div>
        </div>

          </div>
        </>
      ) : (
        /* Aba de Central de Comunicados */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna 1: Formulário de Envio de Comunicado */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
              <span className="text-xl">✉️</span>
              <div>
                <h3 className="text-sm font-bold text-slate-200">Emitir Novo Comunicado</h3>
                <p className="text-[11px] text-slate-400">Mensagens enviadas aparecerão no sino e no pop-up de entrada de todos os usuários.</p>
              </div>
            </div>

            <form onSubmit={handleSendBroadcast} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                  Título / Assunto
                </label>
                <input
                  type="text"
                  value={msgSubject}
                  onChange={(e) => setMsgSubject(e.target.value)}
                  placeholder="Ex: Atualização do Sistema / Aviso Importante"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 text-slate-200 text-xs px-3 py-2 rounded-lg outline-none transition"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                  Mensagem / Conteúdo
                </label>
                <textarea
                  value={msgContent}
                  onChange={(e) => setMsgContent(e.target.value)}
                  placeholder="Digite aqui o comunicado completo que os usuários visualizarão..."
                  rows={6}
                  className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 text-slate-200 text-xs p-3 rounded-lg outline-none resize-none transition"
                  required
                />
              </div>

              <div className="p-3 bg-blue-950/30 border border-blue-800/40 rounded-lg text-[11px] text-blue-200 leading-relaxed">
                ℹ️ <strong>Disparo Global:</strong> Este aviso é exibido imediatamente para todos os usuários ativos no painel através do sino de notificações e ao abrirem a plataforma.
              </div>

              <button
                type="submit"
                disabled={isSendingMsg || !msgSubject.trim() || !msgContent.trim()}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-lg shadow-blue-900/40 transition active:scale-95 flex items-center justify-center gap-2"
              >
                <span>🚀</span>
                <span>{isSendingMsg ? 'Disparando...' : 'Disparar Comunicado para Todos'}</span>
              </button>
            </form>
          </div>

          {/* Coluna 2 e 3: Histórico de Mensagens Enviadas */}
          <div className="lg:col-span-2 bg-slate-800/40 border border-slate-700 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">📜</span>
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Histórico de Comunicados Enviados</h3>
                  <p className="text-[11px] text-slate-400">Total de {broadcastList.length} comunicado(s) registrado(s).</p>
                </div>
              </div>

              <button
                type="button"
                onClick={fetchBroadcasts}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
              >
                🔄 Atualizar
              </button>
            </div>

            {broadcastList.length === 0 ? (
              <div className="py-12 text-center text-slate-500 italic text-xs">
                Nenhum comunicado enviado até o momento. Utilize o formulário ao lado para emitir o primeiro!
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto max-h-[550px] pr-1">
                {broadcastList.map((b) => (
                  <div
                    key={b.id}
                    className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col md:flex-row md:items-start justify-between gap-3 hover:border-slate-700 transition"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-bold border border-blue-500/30">
                          COMUNICADO ADMIN
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {b.created_at ? new Date(b.created_at).toLocaleString('pt-BR') : ''}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white">{b.subject}</h4>
                      <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{b.content}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteBroadcast(b.id)}
                      className="px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 hover:text-white rounded-lg text-[11px] font-bold transition self-end md:self-start shrink-0"
                      title="Excluir comunicado"
                    >
                      🗑️ Excluir
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
