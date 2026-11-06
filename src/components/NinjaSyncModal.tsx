import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  checkNinjaStatus, 
  fetchNinjaAccounts, 
  getNinjaGatewayUrl, 
  setNinjaGatewayUrl, 
  DEFAULT_NINJA_GATEWAY_URL,
  getNinjaPairingToken,
  setNinjaPairingToken,
  getNinjaConnectionMode,
  setNinjaConnectionMode,
  isNinjaExecutionAccount,
  type NinjaConnectionMode
} from '../services/ninjaGateway';
import type { NinjaAccountDto, NinjaStatusDto } from '../services/ninjaGateway';
import { 
  createDemoAccountSupabase, 
  updateAccountSupabase,
  fetchAccountsSupabase,
  saveNinjaTunnelConfigSupabase,
  fetchAndSyncNinjaTunnelConfigSupabase,
  DEFAULT_SYMBOL_MAPPING,
  DEFAULT_MANUAL_START_TIME,
  DEFAULT_MANUAL_END_TIME
} from '../services/db';
import type { BrokerAccount } from '../services/db';
import { useApp } from '../context/AppContext';

interface NinjaSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: BrokerAccount[];
  maxAccountsAllowed: number;
  canAccessCopyTrading?: boolean;
  onAccountsUpdated: () => Promise<any>;
  addLog?: (prefix: string, content: string, type: 'alerta' | 'sistema' | 'ia' | 'erro' | 'noticia') => void;
}

export const NinjaSyncModal: React.FC<NinjaSyncModalProps> = ({
  isOpen,
  onClose,
  accounts,
  maxAccountsAllowed,
  canAccessCopyTrading = true,
  onAccountsUpdated,
  addLog
}) => {
  const { user, planDetails, isRestrictedSession } = useApp();
  const rawPlan = typeof localStorage !== 'undefined' ? localStorage.getItem('vortex_plan_details') : null;
  const parsedPlan = rawPlan ? JSON.parse(rawPlan) : null;
  const isCopyOnly = planDetails?.isCopyTraderOnly === true || parsedPlan?.isCopyTraderOnly === true || parsedPlan?.productId === 9286;

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState<NinjaStatusDto>({ status: 'offline' });
  const [ninjaAccounts, setNinjaAccounts] = useState<NinjaAccountDto[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [updatedSuccessMsg, setUpdatedSuccessMsg] = useState<string | null>(null);
  const [selectionBlockedMsg, setSelectionBlockedMsg] = useState<string | null>(null);
  const [gatewayUrlInput, setGatewayUrlInput] = useState(() => getNinjaGatewayUrl());
  const [showConfig, setShowConfig] = useState(false);
  const [configSavedNotice, setConfigSavedNotice] = useState<string | null>(null);
  const [pairingTokenInput, setPairingTokenInput] = useState(() => getNinjaPairingToken());
  const [connectionMode, setConnectionModeState] = useState<NinjaConnectionMode>(() => getNinjaConnectionMode());
  const [copiedToken, setCopiedToken] = useState(false);
  const [syncedCloudAccounts, setSyncedCloudAccounts] = useState<BrokerAccount[]>([]);

  const allKnownAccounts = syncedCloudAccounts.length > 0 ? syncedCloudAccounts : accounts;
  const filteredKnownAccounts = isCopyOnly
    ? allKnownAccounts.filter(a => a.platform === 'nt8' || a.send_localhost || isNinjaExecutionAccount(a))
    : allKnownAccounts;
  const totalCurrentAccounts = filteredKnownAccounts.length;
  const availableSlots = Math.max(0, maxAccountsAllowed - totalCurrentAccounts);

  // Mapeia contas já importadas por nome (case insensitive)
  const existingAccountMap = useMemo(() => {
    const map = new Map<string, BrokerAccount>();
    filteredKnownAccounts.forEach(acc => {
      if (acc.account_name) {
        map.set(acc.account_name.trim().toLowerCase(), acc);
      }
    });
    return map;
  }, [filteredKnownAccounts]);


  const handleResetDefaultUrl = async () => {
    setNinjaGatewayUrl(DEFAULT_NINJA_GATEWAY_URL);
    setGatewayUrlInput(DEFAULT_NINJA_GATEWAY_URL);
    saveNinjaTunnelConfigSupabase({
      pairing_token: pairingTokenInput,
      connection_mode: connectionMode,
      gateway_url: DEFAULT_NINJA_GATEWAY_URL
    });
    setConfigSavedNotice('Restaurado para http://localhost:8001');
    setTimeout(() => setConfigSavedNotice(null), 3000);
    await loadData();
  };

  const handleSavePairingToken = async () => {
    const trimmed = pairingTokenInput.trim();
    if (trimmed && trimmed.length < 8) {
      setConfigSavedNotice('⚠️ Token muito curto: use pelo menos 8 caracteres para garantir exclusividade.');
      setTimeout(() => setConfigSavedNotice(null), 3500);
      return;
    }
    setNinjaPairingToken(trimmed);
    saveNinjaTunnelConfigSupabase({
      pairing_token: trimmed,
      connection_mode: connectionMode,
      gateway_url: gatewayUrlInput
    });
    if (trimmed) {
      fetch('http://localhost:8001/tunnel_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: trimmed })
      }).catch(() => {});
    }
    setConfigSavedNotice(trimmed ? `Token Salvo e Sincronizado na Nuvem: ${trimmed}` : 'Token de Nuvem Removido');
    setTimeout(() => setConfigSavedNotice(null), 3000);
    await loadData();
  };

  const handleGenerateNewToken = () => {
    // 🛡️ Blindagem de Isolamento: Prefixa com o ID único do usuário autenticado no Supabase
    // tornando matematicamente impossível dois usuários compartilharem o mesmo canal no Relay Hub.
    const userPart = user?.id ? user.id.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8) : 'usr';
    const randomSuffix = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/[^a-zA-Z0-9]/g, '').substring(0, 10)
      : (Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 6));
    const uniqueToken = `vtx_${userPart}_${randomSuffix}`;

    setPairingTokenInput(uniqueToken);
    setNinjaPairingToken(uniqueToken);
    saveNinjaTunnelConfigSupabase({
      pairing_token: uniqueToken,
      connection_mode: connectionMode,
      gateway_url: gatewayUrlInput
    });
    fetch('http://localhost:8001/tunnel_config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: uniqueToken })
    }).catch(() => {});
    setConfigSavedNotice(`Novo token único e blindado gerado: ${uniqueToken}`);
    setTimeout(() => setConfigSavedNotice(null), 3500);
    loadData();
  };

  const handleCopyToken = () => {
    if (pairingTokenInput && typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(pairingTokenInput);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const handleChangeMode = async (mode: NinjaConnectionMode) => {
    setConnectionModeState(mode);
    setNinjaConnectionMode(mode);
    let targetUrl = gatewayUrlInput;
    if (mode === 'local') {
      targetUrl = DEFAULT_NINJA_GATEWAY_URL;
      setNinjaGatewayUrl(DEFAULT_NINJA_GATEWAY_URL);
      setGatewayUrlInput(DEFAULT_NINJA_GATEWAY_URL);
    }
    saveNinjaTunnelConfigSupabase({
      pairing_token: pairingTokenInput,
      connection_mode: mode,
      gateway_url: targetUrl
    });
    const label = mode === 'local' ? '💻 Local (Mesmo PC)' : '🌐 Túnel em Nuvem (Relay Hub)';
    setConfigSavedNotice(`Modo Ativo: ${label}`);
    setTimeout(() => setConfigSavedNotice(null), 3000);
    await loadData();
  };

  const loadData = async () => {
    setLoading(true);
    setUpdatedSuccessMsg(null);
    setSelectionBlockedMsg(null);
    try {
      // Sincroniza contas da nuvem (Supabase) primeiro para reconhecer contas já importadas em outro PC
      const cloudAccounts = await fetchAccountsSupabase().catch(() => accounts);
      setSyncedCloudAccounts(cloudAccounts || []);

      const activeList = cloudAccounts || accounts;
      const relevantList = isCopyOnly
        ? activeList.filter(a => a.platform === 'nt8' || a.send_localhost || isNinjaExecutionAccount(a))
        : activeList;

      const freshAccountMap = new Map<string, BrokerAccount>();
      relevantList.forEach(acc => {
        if (acc.account_name) {
          freshAccountMap.set(acc.account_name.trim().toLowerCase(), acc);
        }
      });
      await onAccountsUpdated().catch(() => {});

      const status = await checkNinjaStatus(true);
      setGatewayStatus(status);

      if (status.status === 'online') {
        const accs = await fetchNinjaAccounts();
        // Filtra apenas contas ativas e conectadas na corretora/provedor do NinjaTrader
        const connectedOnly = accs.filter(a => 
          a.isConnected === true && 
          a.name !== 'Backtest' && 
          a.name !== 'Playback101'
        );
        setNinjaAccounts(connectedOnly);

        const currentTotal = relevantList.length;
        const freshAvailableSlots = Math.max(0, maxAccountsAllowed - currentTotal);

        // Pré-seleciona as primeiras novas contas até o limite disponível
        const initialSelected = new Set<string>();
        let slotsUsed = 0;
        for (const acc of connectedOnly) {
          const isAlreadyImported = freshAccountMap.has(acc.name.trim().toLowerCase());
          if (!isAlreadyImported && slotsUsed < freshAvailableSlots) {
            initialSelected.add(acc.name);
            slotsUsed++;
          }
        }
        setSelectedAccounts(initialSelected);
      } else {
        setNinjaAccounts([]);
      }
    } catch (err) {
      console.error('Erro ao consultar NinjaTrader:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAndSyncNinjaTunnelConfigSupabase()
        .then((cfg) => {
          if (cfg?.pairing_token) setPairingTokenInput(cfg.pairing_token);
          if (cfg?.connection_mode) setConnectionModeState(cfg.connection_mode as NinjaConnectionMode);
          if (cfg?.gateway_url) setGatewayUrlInput(cfg.gateway_url);
        })
        .finally(() => {
          loadData();
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleSelect = (accName: string) => {
    if (!canAccessCopyTrading) {
      setSelectionBlockedMsg('Recurso exclusivo: A sincronização de contas NinjaTrader requer o módulo ou plano com Copy NT8.');
      return;
    }
    const next = new Set(selectedAccounts);
    if (next.has(accName)) {
      next.delete(accName);
      setSelectionBlockedMsg(null);
    } else {
      if (next.size >= availableSlots) {
        const msg = availableSlots === 0
          ? `Limite de contas atingido: você possui ${totalCurrentAccounts} de ${maxAccountsAllowed} contas cadastradas (0 vagas). Exclua contas antigas em 'Gestão de Contas' para liberar espaço.`
          : `Limite de vagas atingido (${availableSlots} vaga${availableSlots > 1 ? 's' : ''}). Desmarque uma conta para selecionar outra.`;
        setSelectionBlockedMsg(msg);
        if (addLog) addLog('NINJA', msg, 'alerta');
        return;
      }
      next.add(accName);
      setSelectionBlockedMsg(null);
    }
    setSelectedAccounts(next);
  };

  const handleBlockedClick = (accName: string) => {
    if (existingAccountMap.has(accName.trim().toLowerCase())) return;
    const msg = availableSlots === 0
      ? `Limite de contas atingido: seu painel possui ${totalCurrentAccounts} de ${maxAccountsAllowed} contas em uso (0 vagas). Exclua contas não utilizadas na tela de 'Gestão de Contas' para liberar vagas e importar do NinjaTrader.`
      : `Limite de ${availableSlots} vaga(s) atingido. Desmarque uma conta já selecionada para marcar esta.`;
    setSelectionBlockedMsg(msg);
    if (addLog) addLog('NINJA', msg, 'alerta');
  };

  const handleSelectAllAvailable = () => {
    const next = new Set<string>();
    let count = 0;
    for (const acc of ninjaAccounts) {
      const isAlreadyImported = existingAccountMap.has(acc.name.trim().toLowerCase());
      if (!isAlreadyImported && count < availableSlots) {
        next.add(acc.name);
        count++;
      }
    }
    setSelectedAccounts(next);
  };

  const handleDeselectAll = () => {
    setSelectedAccounts(new Set());
  };

  // Importar contas selecionadas
  const handleImportSelected = async () => {
    if (!canAccessCopyTrading) {
      alert('A sincronização de contas NinjaTrader requer o módulo ou plano com Copy NT8.');
      return;
    }
    if (selectedAccounts.size === 0) return;
    setSyncing(true);
    setUpdatedSuccessMsg(null);

    let importedCount = 0;
    try {
      for (const accName of selectedAccounts) {
        const ninjaAcc = ninjaAccounts.find(a => a.name === accName);
        if (!ninjaAcc) continue;

        const initialBal = ninjaAcc.cashValue > 0 ? ninjaAcc.cashValue : 50000;
        await createDemoAccountSupabase({
          account_name: ninjaAcc.name,
          platform: 'nt8',
          initial_balance: initialBal,
          dd_mode: 'intraday_trailing',
          max_drawdown_usd: 2500,
          daily_stop_loss_usd: 1000,
          daily_max_gain_usd: 2000,
          daily_max_entries: 0,
          allow_multi_signals: true,
          enforce_dd_lockout: true,
          simulate_elimination: false,
          is_master: false,
          send_localhost: true,
          manual_trading_enabled: true,
          manual_start_time: DEFAULT_MANUAL_START_TIME,
          manual_end_time: DEFAULT_MANUAL_END_TIME,
          symbol_mapping: DEFAULT_SYMBOL_MAPPING,
          manual_max_lots: 10,
          manual_max_daily_trades: 0,
          trader_daily_stop_loss_usd: 0,
          trader_daily_take_profit_usd: 0
        });
        importedCount++;
      }

      await onAccountsUpdated();
      setUpdatedSuccessMsg(`✅ ${importedCount} conta(s) do NinjaTrader importadas e salvas com sucesso!`);
      if (addLog) addLog('NINJA', `${importedCount} conta(s) sincronizadas e salvas com sucesso.`, 'sistema');
      setSelectedAccounts(new Set());
      await loadData();
    } catch (err: any) {
      console.error('Erro ao importar contas:', err);
      if (addLog) addLog('NINJA', `Erro ao importar contas do NinjaTrader: ${err.message}`, 'erro');
    } finally {
      setSyncing(false);
    }
  };

  // Atualizar saldo de conta existente
  const handleUpdateBalance = async (ninjaAcc: NinjaAccountDto) => {
    const existing = existingAccountMap.get(ninjaAcc.name.trim().toLowerCase());
    if (!existing) return;

    try {
      await updateAccountSupabase(existing.id, {
        balance: ninjaAcc.cashValue > 0 ? ninjaAcc.cashValue : existing.balance,
        send_localhost: true,
        platform: 'nt8'
      });
      await onAccountsUpdated();
      setUpdatedSuccessMsg(`Saldo da conta ${ninjaAcc.name} atualizado para $${ninjaAcc.cashValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}!`);
      if (addLog) addLog('NINJA', `Saldo da conta ${ninjaAcc.name} atualizado no Vortex.`, 'sistema');
    } catch (err: any) {
      console.error('Erro ao atualizar saldo:', err);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in" translate="no">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">Sincronizar NinjaTrader 8</h2>
              <p className="text-xs text-slate-400">Importação direta de contas locais com execução sub-milissegundo</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Status Bar */}
        <div className="px-6 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-300">Status Gateway:</span>
            {loading ? (
              <span className="text-slate-400">Verificando...</span>
            ) : gatewayStatus.status === 'online' ? (
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Online ({gatewayStatus.latencyMs}ms)
                {gatewayStatus.transport === 'cloud' && (
                  <span className="ml-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-950 border border-blue-500/60 text-blue-300 flex items-center gap-1">
                    <span>🌐</span> Nuvem
                  </span>
                )}
                {gatewayStatus.transport === 'local' && (
                  <span className="ml-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/60 text-emerald-300 flex items-center gap-1">
                    <span>⚡</span> Local (:8001)
                  </span>
                )}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-rose-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                Offline
              </span>
            )}
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
              {connectionMode === 'cloud'
                ? `🌐 Túnel: ${pairingTokenInput || 'Sem Token'}`
                : `💻 Local: localhost:8001`}
            </span>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition underline underline-offset-2 flex items-center gap-1 ml-1"
            >
              <span>⚙️</span> {showConfig ? 'Fechar Configurações' : 'Alterar Modo de Conexão'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Seu Limite:</span>
            <span className="font-bold text-blue-400">{totalCurrentAccounts} / {maxAccountsAllowed} contas</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400">Vagas disponíveis:</span>
            <span className="font-bold text-emerald-400">{availableSlots}</span>
          </div>
        </div>

        {/* Configuration Drawer */}
        {showConfig && (
          <div className="px-6 py-4 bg-slate-900/95 border-b border-blue-500/30 text-xs space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-100 flex items-center gap-1.5 text-sm">
                ⚙️ Selecione o Modo de Conexão com o NinjaTrader 8
              </span>
              {configSavedNotice && (
                <span className="text-[11px] text-emerald-400 font-bold animate-pulse">{configSavedNotice}</span>
              )}
            </div>

            {/* 2 Modos Claros: Local e Túnel */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Opção 1: Local */}
              <button
                type="button"
                onClick={() => handleChangeMode('local')}
                className={`p-3.5 rounded-xl border text-left transition flex flex-col gap-1 cursor-pointer ${
                  connectionMode === 'local'
                    ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200 ring-1 ring-emerald-500/40'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5 text-slate-100">
                    <span>💻</span> 1. Conexão Local (Mesmo PC)
                  </span>
                  {connectionMode === 'local' && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </div>
                <span className="text-[10px] text-slate-400 leading-tight">
                  NinjaTrader aberto neste mesmo computador (http://localhost:8001).
                </span>
              </button>

              {/* Opção 2: Túnel Próprio */}
              <button
                type="button"
                onClick={() => handleChangeMode('cloud')}
                className={`p-3.5 rounded-xl border text-left transition flex flex-col gap-1 cursor-pointer ${
                  connectionMode === 'cloud'
                    ? 'bg-indigo-950/40 border-indigo-500 text-indigo-200 ring-1 ring-indigo-500/40'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5 text-slate-100">
                    <span>🌐</span> 2. Túnel Próprio Vortex (Remoto)
                  </span>
                  {connectionMode === 'cloud' && (
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                  )}
                </div>
                <span className="text-[10px] text-slate-400 leading-tight">
                  Conexão ponto-a-ponto via Relay Hub com token exclusivo (PC, Celular ou VPS).
                </span>
              </button>
            </div>

            {/* PAINEL EXCLUSIVO 1: LOCAL */}
            {connectionMode === 'local' && (
              <div className="bg-slate-950/90 border border-emerald-500/30 rounded-xl p-3.5 space-y-2 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5 text-xs">
                    💻 Conexão Local Direta (:8001)
                  </span>
                  <span className="text-[11px] font-mono text-emerald-300 bg-slate-900 px-2 py-0.5 rounded border border-emerald-500/30">
                    http://localhost:8001
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Modo padrão para uso no mesmo PC. Não requer nenhuma configuração de rede: basta que o NinjaTrader 8 esteja aberto nesta mesma máquina com o Add-On ativo.
                </p>
                <div className="pt-1 flex items-center gap-2">
                  <button
                    onClick={handleResetDefaultUrl}
                    disabled={loading}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs transition flex items-center gap-1 cursor-pointer"
                  >
                    <span>🔄</span> Testar Conexão Localhost
                  </button>
                </div>
              </div>
            )}

            {/* PAINEL EXCLUSIVO 3: TÚNEL EM NUVEM */}
            {connectionMode === 'cloud' && (
              <div className="bg-slate-950/90 border border-indigo-500/30 rounded-xl p-3.5 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-300 flex items-center gap-1.5 text-xs">
                    🌐 Token de Pareamento da Nuvem (Supabase Broadcast)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleGenerateNewToken}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-medium cursor-pointer"
                    >
                      Gerar Novo
                    </button>
                    {pairingTokenInput && (
                      <button
                        type="button"
                        onClick={handleCopyToken}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 underline font-medium cursor-pointer"
                      >
                        {copiedToken ? '✓ Copiado!' : 'Copiar Token'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={pairingTokenInput}
                    onChange={(e) => setPairingTokenInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSavePairingToken(); }}
                    placeholder="Ex: vortex_minha_vps_123"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleSavePairingToken}
                    disabled={loading}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs transition flex items-center gap-1 cursor-pointer"
                  >
                    <span>💾</span> Salvar Token
                  </button>
                </div>

                {/* Informações do Túnel */}
                <div className="p-3 bg-cyan-950/30 border border-cyan-800/40 rounded-lg text-[11px] space-y-1">
                  <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                    <span>⚡</span> Túnel Ponto-a-Ponto Vortex Ativo:
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[10px]">
                    Comunicação privada e instantânea de alta performance via WebSocket Relay Hub dedicado. Dispensa totalmente o TailScale, VPNs ou abertura de portas na sua rede.
                  </p>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  💡 <strong>Como usar:</strong> No NinjaTrader, abra com <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-300 font-mono">Ctrl+Shift+A</kbd> ➔ aba <strong>Gateway</strong> ➔ marque <em>Ativar Túnel Broadcast em Nuvem</em>, cole este token e clique em Salvar.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
          {!canAccessCopyTrading && (
            <div className="p-3 bg-amber-950/70 border border-amber-500/50 rounded-xl text-xs text-amber-200 flex items-center gap-3 animate-fade-in shadow-lg shadow-amber-950/30">
              <span className="text-xl">🔒</span>
              <div>
                <div className="font-bold text-amber-300">Recurso Exclusivo do Módulo Copy NT8</div>
                <div className="text-[11px] text-amber-200/80">
                  A importação e sincronização de contas com o NinjaTrader 8 requer assinatura do plano com Copy NT8 ativo.
                </div>
              </div>
            </div>
          )}

          {gatewayStatus.status === 'online' && gatewayStatus.isLicensed === false && (
            <div className="p-3.5 bg-rose-950/80 border border-rose-500/60 rounded-xl text-xs text-rose-200 flex items-start gap-3 animate-fade-in shadow-lg shadow-rose-950/30">
              <span className="text-xl leading-none">🔒</span>
              <div>
                <div className="font-bold text-rose-300">Licença do Add-On NinjaTrader Inativa ou Expirada</div>
                <div className="text-[11px] text-rose-200/90 mt-0.5 leading-relaxed">
                  O sistema de Sincronização, Copy Trading e relatórios via Telegram do Gateway estão bloqueados. Abra a janela do <strong>Axion Gateway V2 (Ctrl+Shift+A)</strong> no NinjaTrader 8, acesse a aba <strong>Sobre / Licença</strong> e valide sua assinatura ativa.
                </div>
              </div>
            </div>
          )}

          {updatedSuccessMsg && (
            <div className="p-3 bg-emerald-950/80 border border-emerald-600/50 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
              <span>{updatedSuccessMsg}</span>
              <button onClick={() => setUpdatedSuccessMsg(null)} className="text-emerald-400 hover:text-white ml-2">✕</button>
            </div>
          )}

          {selectionBlockedMsg && (
            <div className="p-3 bg-rose-950/70 border border-rose-500/50 rounded-xl text-xs text-rose-200 flex items-center justify-between animate-fade-in shadow-lg shadow-rose-950/30">
              <div className="flex items-center gap-2">
                <span className="text-base">🚫</span>
                <span>{selectionBlockedMsg}</span>
              </div>
              <button onClick={() => setSelectionBlockedMsg(null)} className="text-rose-400 hover:text-white font-bold ml-2">✕</button>
            </div>
          )}

          {availableSlots === 0 && gatewayStatus.status === 'online' && (
            <div className="p-3.5 bg-amber-950/40 border border-amber-500/40 rounded-xl text-xs text-amber-200 flex items-start gap-3">
              <span className="text-lg leading-none">⚠️</span>
              <div className="flex-1 space-y-1">
                <div className="font-bold text-amber-300 flex items-center justify-between">
                  <span>Limite de Contas Atingido ({totalCurrentAccounts} / {maxAccountsAllowed} contas em uso)</span>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-amber-900/70 text-amber-300 font-mono font-bold">0 Vagas</span>
                </div>
                <p className="text-amber-200/80 leading-relaxed text-[11px]">
                  O seu painel já está com todas as {maxAccountsAllowed} contas cadastradas. Para importar novas contas do NinjaTrader, exclua contas não utilizadas na tela de <strong>Gestão de Contas</strong> para liberar vagas ou entre com a conta Administrador.
                </p>
              </div>
            </div>
          )}

          {gatewayStatus.status !== 'online' ? (
            <div className="p-6 bg-slate-950/60 border border-slate-800 rounded-xl text-center space-y-3">
              <div className="text-3xl">🔌</div>
              <h3 className="text-sm font-bold text-slate-200">
                {connectionMode === 'local' && 'NinjaTrader 8 Não Detectado Localmente'}
                {connectionMode === 'cloud' && 'Túnel Vortex Sem Resposta'}
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {connectionMode === 'local' && (
                  <>Não foi possível conectar ao NinjaTrader em <code className="text-emerald-400 bg-slate-900 px-1.5 py-0.5 rounded font-mono text-[11px]">localhost:8001</code>. Certifique-se de que o NinjaTrader 8 está aberto neste computador com o Add-On ativo.</>
                )}
                {connectionMode === 'cloud' && (
                  <>O NinjaTrader não respondeu via Túnel Relay Hub. Certifique-se de que o NinjaTrader 8 está aberto na VPS ou no seu computador com a opção <em>Ativar Túnel Broadcast</em> marcada e o token correto inserido.</>
                )}
              </p>

              <div className="pt-2 flex justify-center gap-3">
                <button
                  onClick={loadData}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span>🔄</span> {loading ? 'Tentando Conectar...' : 'Tentar Novamente'}
                </button>
                <button
                  onClick={() => setShowConfig(true)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span>⚙️</span> {connectionMode === 'cloud' ? 'Configurar Token' : 'Ver Opções de Conexão'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Controls bar */}
              <div className="flex items-center justify-between text-xs">
                <div className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>Contas Conectadas no NinjaTrader ({ninjaAccounts.length}):</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSelectAllAvailable}
                    disabled={availableSlots === 0}
                    className="text-blue-400 hover:text-blue-300 text-xs font-semibold disabled:opacity-40"
                  >
                    Selecionar Permitidas ({availableSlots})
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    onClick={handleDeselectAll}
                    className="text-slate-400 hover:text-slate-200 text-xs font-semibold"
                  >
                    Desmarcar Todas
                  </button>
                </div>
              </div>

              {/* Account list table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-slate-400">
                      <th className="p-3 w-10 text-center">Sel.</th>
                      <th className="p-3">Conta / Identificador</th>
                      <th className="p-3">Conexão</th>
                      <th className="p-3 text-right">Saldo Real</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {ninjaAccounts.map(acc => {
                      const isAlreadyImported = existingAccountMap.has(acc.name.trim().toLowerCase());
                      const isSelected = selectedAccounts.has(acc.name);
                      const canSelect = isSelected || selectedAccounts.size < availableSlots;

                      return (
                        <tr
                          key={acc.name}
                          className={`hover:bg-slate-800/40 transition ${
                            isSelected ? 'bg-blue-950/30' : ''
                          }`}
                        >
                          <td 
                            className={`p-3 text-center ${!canSelect && !isSelected && !isAlreadyImported ? 'cursor-not-allowed' : ''}`}
                            onClick={!canSelect && !isSelected && !isAlreadyImported ? () => handleBlockedClick(acc.name) : undefined}
                            title={!canSelect && !isSelected && !isAlreadyImported ? (availableSlots === 0 ? `Limite de ${maxAccountsAllowed} contas atingido. Exclua uma conta para liberar vaga.` : `Limite de ${availableSlots} vaga(s) atingido.`) : undefined}
                          >
                            {isAlreadyImported ? (
                              <span className="text-slate-500 font-bold text-xs" title="Conta já cadastrada no Vortex">✓</span>
                            ) : (
                              <div className="inline-flex items-center justify-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={!canSelect && !isSelected}
                                  onChange={() => handleToggleSelect(acc.name)}
                                  className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                />
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>{acc.displayName || acc.name}</span>
                              {isAlreadyImported && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800 font-semibold">
                                  Já Importada
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">{acc.name}</div>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">
                              {acc.connection || 'Local'}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-200">
                            ${acc.cashValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-3 text-center">
                            {isAlreadyImported ? (
                              <button
                                onClick={() => handleUpdateBalance(acc)}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded text-[10px] font-bold transition border border-slate-700"
                                title="Atualizar saldo atual do NinjaTrader para o Vortex"
                              >
                                🔄 Atualizar Saldo
                              </button>
                            ) : (
                              <span className={`inline-flex items-center gap-1 text-[11px] ${
                                acc.isConnected ? 'text-emerald-400 font-semibold' : 'text-slate-400'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${acc.isConnected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                                {acc.isConnected ? 'Conectada' : 'Simulação'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Notice */}
              <div className="text-[11px] text-slate-400 bg-slate-950/80 p-3 rounded-lg border border-slate-800/80">
                💡 <strong className="text-slate-300">Dica:</strong> As contas importadas são salvas de forma permanente no Supabase e ativadas com conexão local direta (<strong className="text-emerald-400">&lt; 1ms</strong>) para abertura instantânea de ordens, stop loss e take profit.
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {gatewayStatus.status === 'online' && (
              <span>
                Selecionadas: <strong className="text-blue-400">{selectedAccounts.size}</strong> de <strong className="text-slate-200">{availableSlots}</strong> disponíveis
              </span>
            )}
            {isRestrictedSession && (
              <span className="text-xs text-emerald-400 font-bold ml-2">
                📱 Segundo Acesso Remoto: Sincronização liberada.
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-bold text-slate-300 hover:bg-slate-800 transition border border-slate-700"
            >
              Fechar
            </button>
            {gatewayStatus.status === 'online' && (
              <button
                onClick={handleImportSelected}
                disabled={selectedAccounts.size === 0 || syncing || !canAccessCopyTrading}
                className={`px-5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                  selectedAccounts.size > 0 && !syncing && canAccessCopyTrading
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 active:scale-95 cursor-pointer'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                }`}
              >
                <span>📥</span>
                <span>{syncing ? 'Importando...' : `Importar e Salvar ${selectedAccounts.size} Contas`}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
