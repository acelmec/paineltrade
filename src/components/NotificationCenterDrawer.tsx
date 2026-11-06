import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';

export interface BroadcastNotificationItem {
  id: string;
  subject: string;
  content: string;
  created_at: string;
}

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  broadcasts: BroadcastNotificationItem[];
  onMarkAllAsRead: () => void;
  onDismissBroadcast: (id: string) => void;
  readBroadcastIds: string[];
}

export const NotificationCenterDrawer: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  onClose,
  broadcasts,
  onMarkAllAsRead,
  onDismissBroadcast,
  readBroadcastIds
}) => {
  const { user } = useApp();

  const nextPaymentDateStr = typeof window !== 'undefined' ? localStorage.getItem('vortex_next_payment_date') : null;

  // Cálculo da proximidade da renovação
  const renewalInfo = useMemo(() => {
    if (!nextPaymentDateStr || user?.email?.toLowerCase() === 'admin@vortex.com') return null;
    const dueDate = new Date(nextPaymentDateStr);
    if (isNaN(dueDate.getTime())) return null;

    const now = new Date();
    const diffTime = dueDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
      dueDateFormatted: dueDate.toLocaleDateString('pt-BR'),
      daysLeft: diffDays,
      isClose: diffDays <= 5,
      isExpired: diffDays <= 0
    };
  }, [nextPaymentDateStr, user?.email]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex justify-end bg-black/60 backdrop-blur-sm animate-fadeIn">
      {/* Backdrop click to close */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer Container */}
      <div className="w-full max-w-md h-full bg-[#0b0f19] border-l border-slate-800 shadow-2xl flex flex-col animate-slideLeft">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center text-base">
              🔔
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Central de Comunicações</h3>
              <p className="text-[11px] text-slate-400">Avisos administrativos e status de assinatura</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {broadcasts.length > 0 && (
              <button
                type="button"
                onClick={onMarkAllAsRead}
                className="text-[10.5px] text-blue-400 hover:text-blue-300 font-semibold px-2 py-1 rounded hover:bg-blue-950/40 transition"
              >
                Marcar lidos
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-xs transition"
              title="Fechar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
          
          {/* Card de Proximidade da Renovação de Assinatura */}
          {renewalInfo && (
            <div className={`p-3.5 rounded-xl border flex items-start gap-3 transition ${
              renewalInfo.isExpired 
                ? 'bg-red-950/30 border-red-700/50 text-red-200' 
                : renewalInfo.isClose 
                  ? 'bg-amber-950/30 border-amber-600/40 text-amber-200' 
                  : 'bg-slate-900/60 border-slate-800 text-slate-300'
            }`}>
              <div className="text-xl shrink-0 mt-0.5">
                {renewalInfo.isExpired ? '⚠️' : renewalInfo.isClose ? '⏳' : '📅'}
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {renewalInfo.isExpired 
                      ? 'Assinatura Vencendo' 
                      : renewalInfo.isClose 
                        ? 'Proximidade de Renovação' 
                        : 'Próxima Renovação'}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                    renewalInfo.isExpired 
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                      : renewalInfo.isClose 
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  }`}>
                    {renewalInfo.daysLeft <= 0 ? 'Hoje' : `Em ${renewalInfo.daysLeft} dia(s)`}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  Sua assinatura está agendada para renovação em <strong className="text-white">{renewalInfo.dueDateFormatted}</strong>.
                  {renewalInfo.isClose && ' Mantenha seu meio de pagamento atualizado no Asaas/WordPress para evitar interrupções de acesso.'}
                </p>
                <div className="pt-1.5 flex items-center gap-2">
                  <a
                    href="https://ffbinvest.amsolucoes.net.br/minha-conta/subscriptions/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10.5px] font-bold text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
                  >
                    <span>Ver no Painel do Cliente</span>
                    <span>↗</span>
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Seção de Comunicados da Administração */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider font-extrabold text-slate-400">
                Comunicados VM Trader ({broadcasts.length})
              </span>
            </div>

            {broadcasts.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs italic bg-slate-900/30 border border-slate-800/60 rounded-xl p-4">
                Nenhum comunicado recente no momento.
              </div>
            ) : (
              <div className="space-y-3">
                {broadcasts.map((b) => {
                  const isRead = readBroadcastIds.includes(b.id);
                  return (
                    <div
                      key={b.id}
                      className={`p-3.5 rounded-xl border transition flex flex-col gap-2 ${
                        isRead
                          ? 'bg-slate-900/40 border-slate-800/70 text-slate-300'
                          : 'bg-blue-950/20 border-blue-600/40 text-white shadow-sm shadow-blue-950/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {!isRead && (
                            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" title="Não lido" />
                          )}
                          <span className="text-xs font-bold text-slate-100">{b.subject}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono shrink-0">
                          {b.created_at ? new Date(b.created_at).toLocaleDateString('pt-BR') : ''}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {b.content}
                      </p>

                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/50">
                        {!isRead ? (
                          <button
                            type="button"
                            onClick={() => onDismissBroadcast(b.id)}
                            className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold px-2 py-0.5 rounded hover:bg-slate-800 transition"
                          >
                            Marcar como Lido
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-semibold">✓ Lido</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/40 text-center text-[10px] text-slate-500">
          VortexWeb • Central de Comunicações &amp; Notificações
        </div>
      </div>
    </div>
  );
};

// Modal de Destaque Pop-Up exibido na entrada (apenas se houver mensagens não lidas urgentes)
interface BroadcastPopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  broadcast: BroadcastNotificationItem | null;
  onMarkAsRead: (id: string) => void;
}

export const BroadcastPopupModal: React.FC<BroadcastPopupModalProps> = ({
  isOpen,
  onClose,
  broadcast,
  onMarkAsRead
}) => {
  if (!isOpen || !broadcast) return null;

  const handleDismiss = () => {
    onMarkAsRead(broadcast.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-lg bg-[#0e1322] border border-blue-500/40 rounded-2xl p-6 shadow-2xl space-y-4 animate-scaleUp">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/40 flex items-center justify-center text-xl shrink-0">
            📢
          </div>
          <div className="flex-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
              Comunicado Importante da Administração
            </span>
            <h3 className="text-base font-bold text-white mt-1 leading-snug">
              {broadcast.subject}
            </h3>
            <span className="text-[10.5px] text-slate-500 font-mono">
              {broadcast.created_at ? new Date(broadcast.created_at).toLocaleString('pt-BR') : ''}
            </span>
          </div>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-200 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
          {broadcast.content}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-lg shadow-lg shadow-blue-900/40 transition active:scale-95"
          >
            Entendido / Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
