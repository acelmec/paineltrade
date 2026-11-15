import React, { useState, useEffect } from 'react';
import {
  fetchPlatformConnectionsSupabase,
  savePlatformConnectionsSupabase,
  testConnectionPing,
  CONNECTION_PRESETS,
  type PlatformConnection,
  type DetectedAccountDetail
} from '../services/connectionsService';
import { createDemoAccountSupabase, updateAccountSupabase, type BrokerAccount } from '../services/db';

interface ConnectionsHubProps {
  onSelectConnection?: (conn: PlatformConnection, detectedAcc?: DetectedAccountDetail) => void;
  onClose?: () => void;
  accounts?: BrokerAccount[];
  onAccountsUpdated?: () => Promise<any>;
}

export const ConnectionsHub: React.FC<ConnectionsHubProps> = ({ onSelectConnection, onClose, accounts = [], onAccountsUpdated }) => {
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [importingAccId, setImportingAccId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { online: boolean; message: string; latency?: number }>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  // Modal para Incluir / Editar Conexão
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedPresetType, setSelectedPresetType] = useState<PlatformConnection['connection_type']>('mt4_vps');
  const [formName, setFormName] = useState<string>('');
  const [formHost, setFormHost] = useState<string>('');
  const [formToken, setFormToken] = useState<string>('');
  const [formApiKey, setFormApiKey] = useState<string>('');
  const [formApiSecret, setFormApiSecret] = useState<string>('');

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    setLoading(true);
    const data = await fetchPlatformConnectionsSupabase();
    setConnections(data);
    setLoading(false);
  };

  const handleOpenAddModal = (presetType: PlatformConnection['connection_type'] = 'mt4_vps') => {
    const preset = CONNECTION_PRESETS.find(p => p.type === presetType) || CONNECTION_PRESETS[0];
    setEditingId(null);
    setSelectedPresetType(preset.type);
    setFormName(preset.name);
    setFormHost(preset.host_url);
    setFormToken(preset.pairing_token || '');
    setFormApiKey('');
    setFormApiSecret('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (conn: PlatformConnection) => {
    setEditingId(conn.id);
    setSelectedPresetType(conn.connection_type || 'mt4_vps');
    setFormName(conn.name);
    setFormHost(conn.host_url);
    setFormToken(conn.pairing_token || '');
    setFormApiKey(conn.api_key || '');
    setFormApiSecret(conn.api_secret || '');
    setIsModalOpen(true);
  };

  const handlePresetChange = (type: PlatformConnection['connection_type']) => {
    setSelectedPresetType(type);
    const preset = CONNECTION_PRESETS.find(p => p.type === type);
    if (preset) {
      setFormName(preset.name);
      setFormHost(preset.host_url);
      setFormToken(preset.pairing_token || '');
    }
  };

  const handleSaveModalConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    const preset = CONNECTION_PRESETS.find(p => p.type === selectedPresetType) || CONNECTION_PRESETS[0];

    let updatedList: PlatformConnection[];

    if (editingId) {
      updatedList = connections.map(c => {
        if (c.id === editingId) {
          return {
            ...c,
            name: formName.trim() || preset.name,
            connection_type: selectedPresetType,
            platform: preset.platform,
            host_url: formHost.trim() || preset.host_url,
            pairing_token: formToken.trim(),
            api_key: formApiKey.trim(),
            api_secret: formApiSecret.trim(),
            notes: preset.description
          };
        }
        return c;
      });
    } else {
      const newConn: PlatformConnection = {
        id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        connection_type: selectedPresetType,
        platform: preset.platform,
        name: formName.trim() || preset.name,
        host_url: formHost.trim() || preset.host_url,
        pairing_token: formToken.trim(),
        api_key: formApiKey.trim(),
        api_secret: formApiSecret.trim(),
        is_active: true,
        status: 'pending',
        notes: preset.description
      };
      updatedList = [...connections, newConn];
    }

    setConnections(updatedList);
    setIsModalOpen(false);

    // Salva automaticamente no Supabase
    setSaving(true);
    await savePlatformConnectionsSupabase(updatedList);
    setSaving(false);
    setFeedback(`✅ Conexão "${formName}" salva com sucesso no Supabase!`);
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleDeleteConnection = async (id: string, name: string) => {
    if (!window.confirm(`Deseja realmente remover a conexão "${name}"?`)) return;
    const filtered = connections.filter(c => c.id !== id);
    setConnections(filtered);
    setSaving(true);
    await savePlatformConnectionsSupabase(filtered);
    setSaving(false);
    setFeedback(`🗑️ Conexão "${name}" excluída.`);
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    const success = await savePlatformConnectionsSupabase(connections);
    setSaving(false);
    if (success) {
      setFeedback('✅ Todas as conexões foram salvas com sucesso no Supabase (Por Usuário e Inscrição)!');
      setTimeout(() => setFeedback(null), 5000);
    } else {
      setFeedback('⚠️ As conexões foram salvas localmente, mas houve falha de sincronização com o banco.');
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleTestPing = async (conn: PlatformConnection) => {
    setTestingId(conn.id);
    const result = await testConnectionPing(conn);
    setTestingId(null);

    setTestResults(prev => ({
      ...prev,
      [conn.id]: {
        online: result.online,
        message: result.message,
        latency: result.latencyMs
      }
    }));

    const updated = connections.map(c => {
      if (c.id === conn.id) {
        return {
          ...c,
          status: (result.online ? 'online' : 'offline') as any,
          last_ping_at: new Date().toISOString(),
          latency_ms: result.latencyMs,
          detected_accounts: result.detectedAccounts || c.detected_accounts,
          detected_accounts_detail: result.detectedAccountsDetail || c.detected_accounts_detail
        };
      }
      return c;
    });

    setConnections(updated);
    savePlatformConnectionsSupabase(updated);
  };

  const handleImportDetectedAccount = async (conn: PlatformConnection, acc: DetectedAccountDetail) => {
    setImportingAccId(acc.id);
    try {
      const existing = accounts.find(a => 
        a.platform === conn.platform && 
        (a.account_name.includes(acc.account_number) || (a as any).account_number === acc.account_number)
      );

      const isLocalHostPlatform = conn.platform === 'nt8';

      if (existing) {
        // Atualiza o saldo real da conta existente!
        await updateAccountSupabase(existing.id, {
          balance: acc.balance > 0 ? acc.balance : existing.balance,
          initial_balance: acc.balance > 0 ? acc.balance : existing.initial_balance,
          api_key: conn.api_key || (existing as any).api_key,
          api_secret: conn.api_secret || (existing as any).api_secret,
          send_localhost: isLocalHostPlatform
        });
        setFeedback(`✅ Conta ${acc.name} sincronizada e atualizada com Saldo Real de ${acc.currency} ${acc.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}!`);
      } else {
        // Cria a conta real no Supabase com os dados da plataforma!
        const initialBal = acc.balance > 0 ? acc.balance : 10000;
        await createDemoAccountSupabase({
          account_name: acc.name,
          platform: conn.platform,
          initial_balance: initialBal,
          dd_mode: 'intraday_trailing',
          max_drawdown_usd: Math.round(initialBal * 0.1),
          daily_stop_loss_usd: Math.round(initialBal * 0.05),
          daily_max_gain_usd: Math.round(initialBal * 0.1),
          daily_max_entries: 0,
          allow_multi_signals: true,
          enforce_dd_lockout: true,
          simulate_elimination: false,
          is_master: false,
          send_localhost: isLocalHostPlatform,
          api_key: conn.api_key,
          api_secret: conn.api_secret,
          manual_trading_enabled: true
        });
        setFeedback(`✅ Conta real ${acc.name} (${acc.broker}) importada no painel com Saldo de ${acc.currency} ${initialBal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}!`);
      }

      if (onAccountsUpdated) {
        await onAccountsUpdated();
      }
    } catch (err: any) {
      setFeedback(`❌ Erro ao sincronizar conta do MetaTrader: ${err.message}`);
    } finally {
      setImportingAccId(null);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleTestAll = async () => {
    for (const conn of connections) {
      if (conn.is_active) {
        await handleTestPing(conn);
      }
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'nt8': return '🟧';
      case 'mt4': return '🟦';
      case 'mt5': return '🔷';
      case 'ctrader': return '🟪';
      case 'binance': return '🟡';
      default: return '🔌';
    }
  };

  const getDownloadLink = (platform: string) => {
    switch (platform) {
      case 'mt4': return { href: '/AxionGatewayEA.mq4', label: '📥 Baixar Robô MT4 (.mq4)' };
      case 'mt5': return { href: '/AxionGatewayEA.mq5', label: '📥 Baixar Robô MT5 (.mq5)' };
      case 'ctrader': return null;
      case 'nt8': return { href: '/AxionGatewayAddOn.zip', label: '📥 Baixar Add-on NT8 (.zip)' };
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔌</span>
            <h2 className="text-xl font-black text-white tracking-wide">
              Central de Conexões (Connection Hub)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Inclua e gerencie apenas as conexões que você realmente utiliza (Local NT8, Túnel Nuvem, MT4 VPS, MT5 VPS, cTrader, Binance). 
            Todas as conexões validadas ficam salvas no <strong>Supabase</strong> vinculadas ao seu <strong>Usuário e Inscrição</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => handleOpenAddModal('mt4_vps')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-950/40 cursor-pointer"
          >
            <span>➕</span> Incluir Conexão
          </button>

          {connections.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleTestAll}
                disabled={loading}
                className="px-3.5 py-2 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/40 text-blue-300 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>⚡</span> Testar Conexões
              </button>

              <button
                type="button"
                onClick={handleSaveAll}
                disabled={saving}
                className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Salvar alterações no banco Supabase"
              >
                <span>💾</span> {saving ? 'Salvando...' : 'Salvar no Supabase'}
              </button>
            </>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition"
            >
              ✕ Fechar
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-950/70 border border-emerald-700/60 rounded-lg text-xs text-emerald-200 font-semibold animate-[fadeIn_0.3s_ease-out]">
          {feedback}
        </div>
      )}

      {/* Listagem de Conexões Cadastradas */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 space-y-2">
          <div className="text-2xl animate-spin">⏳</div>
          <p className="text-xs font-semibold">Carregando conexões do Supabase...</p>
        </div>
      ) : connections.length === 0 ? (
        /* Empty State: Nenhuma Conexão Cadastrada */
        <div className="bg-slate-950/70 border border-dashed border-slate-800 rounded-2xl p-10 text-center space-y-4">
          <div className="text-4xl">🔌✨</div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-200">Nenhuma Conexão Incluída Ainda</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Você pode incluir apenas as conexões que você realmente utiliza. Escolha uma das opções abaixo para começar:
            </p>
          </div>

          {/* Botões Rápidos de Presets */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl mx-auto pt-2">
            {CONNECTION_PRESETS.map(preset => (
              <button
                key={preset.type}
                type="button"
                onClick={() => handleOpenAddModal(preset.type)}
                className="p-3 bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 rounded-xl text-left transition flex flex-col justify-between cursor-pointer group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xl">{preset.icon}</span>
                  <span className="text-[10px] text-emerald-400 font-black opacity-0 group-hover:opacity-100 transition">
                    + Incluir
                  </span>
                </div>
                <div className="mt-2">
                  <div className="font-bold text-xs text-white group-hover:text-emerald-300 transition">
                    {preset.name}
                  </div>
                  <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                    {preset.host_url}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Grid das Conexões que o Usuário Escolheu Incluir */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {connections.map(conn => {
            const isTesting = testingId === conn.id;
            const res = testResults[conn.id];
            const isOnline = res ? res.online : conn.status === 'online';
            const dl = getDownloadLink(conn.platform);

            return (
              <div
                key={conn.id}
                className={`bg-slate-950/80 border rounded-xl p-5 shadow-md space-y-4 transition ${
                  conn.is_active
                    ? isOnline
                      ? 'border-emerald-600/60 ring-1 ring-emerald-500/20'
                      : 'border-slate-800 hover:border-slate-700'
                    : 'border-slate-800/60 opacity-60'
                }`}
              >
                {/* Header do Card */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{getPlatformIcon(conn.platform)}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">{conn.name}</h3>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                          {conn.platform.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{conn.host_url}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(conn)}
                      className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition cursor-pointer text-xs"
                      title="Editar Conexão"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteConnection(conn.id, conn.name)}
                      className="p-1.5 text-red-400 hover:text-red-300 rounded hover:bg-red-950/30 transition cursor-pointer text-xs"
                      title="Excluir Conexão"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Status Bar */}
                <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs font-mono ${
                  !conn.is_active
                    ? 'bg-slate-900 border-slate-800 text-slate-500'
                    : isOnline
                    ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                    : 'bg-red-950/40 border-red-900/60 text-red-300'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isOnline && conn.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
                    <span className="font-bold">
                      {!conn.is_active ? 'DESATIVADA' : isOnline ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>
                  {res?.latency !== undefined && res.latency > 0 && (
                    <span className="text-[10px] text-slate-400">Ping: {res.latency}ms</span>
                  )}
                  {conn.detected_accounts && conn.detected_accounts.length > 0 && (
                    <span className="text-[10px] text-cyan-300 font-bold">
                      Contas: {conn.detected_accounts.join(', ')}
                    </span>
                  )}
                </div>

                {/* Detalhes da Conexão */}
                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800/80 space-y-1.5 text-[11px] font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Host / Servidor:</span>
                    <span className="text-slate-200 font-semibold">{conn.host_url}</span>
                  </div>
                  {conn.pairing_token && (
                    <div className="flex justify-between text-slate-400">
                      <span>Token de Pareamento:</span>
                      <span className="text-cyan-300 font-bold">{conn.pairing_token}</span>
                    </div>
                  )}
                  {conn.last_ping_at && (
                    <div className="flex justify-between text-slate-500 text-[10px]">
                      <span>Último Teste:</span>
                      <span>{new Date(conn.last_ping_at).toLocaleTimeString('pt-BR')}</span>
                    </div>
                  )}
                </div>

                {/* Contas Detectadas no MetaTrader / Gateway */}
                {conn.detected_accounts_detail && conn.detected_accounts_detail.length > 0 && (
                  <div className="bg-sky-950/40 border border-sky-600/40 rounded-lg p-2.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-sky-200 font-bold">
                      <span className="flex items-center gap-1.5">
                        <span>{getPlatformIcon(conn.platform)}</span> Contas Reais Detectadas:
                      </span>
                      <span className="text-[10px] text-sky-400 font-mono">
                        {conn.detected_accounts_detail.length} conta(s) online
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {conn.detected_accounts_detail.map(acc => (
                        <div key={acc.id} className="flex items-center justify-between bg-slate-900/90 px-3 py-2 rounded-lg border border-slate-800 text-[11px] gap-2">
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{acc.name}</span>
                              <span className="text-[10px] text-slate-400 font-normal">({acc.broker})</span>
                            </div>
                            <div className="text-[10px] text-emerald-400 font-mono font-bold mt-0.5">
                              Saldo: {acc.currency} {acc.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleImportDetectedAccount(conn, acc)}
                            disabled={importingAccId === acc.id}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-[10.5px] transition flex items-center gap-1 cursor-pointer shrink-0 shadow active:scale-95 disabled:opacity-50"
                            title="Sincronizar e importar esta conta real para o painel de contas"
                          >
                            <span>📥</span>
                            <span>{importingAccId === acc.id ? 'Importando...' : 'Sincronizar no Painel'}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Botões de Ação do Card */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTestPing(conn)}
                      disabled={isTesting}
                      className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/40 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <span>⚡</span> {isTesting ? 'Testando...' : 'Testar Conexão'}
                    </button>

                    {onSelectConnection && isOnline && (
                      <button
                        type="button"
                        onClick={() => onSelectConnection(conn)}
                        className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <span>👉</span> Usar na Conta
                      </button>
                    )}
                  </div>

                  {dl && (
                    <a
                      href={dl.href}
                      download
                      className="text-[11px] text-slate-400 hover:text-white font-semibold transition underline decoration-slate-600 hover:decoration-white"
                    >
                      {dl.label}
                    </a>
                  )}
                </div>

                {res?.message && (
                  <div className={`p-2 rounded text-[10.5px] font-mono ${
                    res.online ? 'bg-emerald-950/40 text-emerald-300' : 'bg-red-950/40 text-red-300'
                  }`}>
                    {res.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Incluir ou Editar Conexão */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>{editingId ? '⚙️' : '➕'}</span>
                <span>{editingId ? 'Editar Conexão' : 'Incluir Nova Conexão'}</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white transition text-sm font-bold cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveModalConnection} className="space-y-4">
              {/* Seletor de Tipo de Conexão */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Tipo de Conexão Desejada:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CONNECTION_PRESETS.map(p => (
                    <button
                      key={p.type}
                      type="button"
                      onClick={() => handlePresetChange(p.type)}
                      className={`p-2 rounded-lg border text-left transition flex items-center gap-2 cursor-pointer ${
                        selectedPresetType === p.type
                          ? 'bg-blue-600/20 border-blue-500 text-blue-300 font-bold'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="text-base">{p.icon}</span>
                      <span className="text-xs truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Nome da Conexão */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Nome Amigável da Conexão:
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Ex: Meu MT4 VPS Principal"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-xs outline-none focus:border-emerald-500"
                />
              </div>

              {/* Host URL */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  URL do Servidor / Host:
                </label>
                <input
                  type="text"
                  required
                  value={formHost}
                  onChange={e => setFormHost(e.target.value)}
                  placeholder="Ex: http://144.126.141.254:8003 ou http://localhost:8001"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-xs font-mono outline-none focus:border-emerald-500"
                />
              </div>

              {/* Token de Pareamento (se aplicável para MT4/MT5/NT8) */}
              {selectedPresetType !== 'binance_api' && selectedPresetType !== 'ctrader_vps' && (
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Token de Pareamento de Nuvem (Pairing Token):
                  </label>
                  <input
                    type="text"
                    value={formToken}
                    onChange={e => setFormToken(e.target.value)}
                    placeholder="Ex: vps_mt4 ou vps_nt8"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-xs font-mono outline-none focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Informe o mesmo token configurado no parâmetro <code>InpPairingToken</code> do robô.
                  </p>
                </div>
              )}

              {/* cTrader Open API Keys (se aplicável) */}
              {selectedPresetType === 'ctrader_vps' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Account ID cTrader:</label>
                    <input
                      type="text"
                      value={formApiKey}
                      onChange={e => setFormApiKey(e.target.value)}
                      placeholder="Ex: 1234567"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Access Token Spotware:</label>
                    <input
                      type="password"
                      value={formApiSecret}
                      onChange={e => setFormApiSecret(e.target.value)}
                      placeholder="Token Open API Spotware"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Binance Keys (se aplicável) */}
              {selectedPresetType === 'binance_api' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">API Key:</label>
                    <input
                      type="password"
                      value={formApiKey}
                      onChange={e => setFormApiKey(e.target.value)}
                      placeholder="API Key Binance"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Secret Key:</label>
                    <input
                      type="password"
                      value={formApiSecret}
                      onChange={e => setFormApiSecret(e.target.value)}
                      placeholder="Secret Key Binance"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Botões do Modal */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition shadow-md shadow-emerald-950/40 cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Incluir Conexão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
