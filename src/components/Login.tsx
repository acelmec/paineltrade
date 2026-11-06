import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export const Login: React.FC = () => {
  const { signIn, resetOrSetPassword, authError } = useApp();
  
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState<string>('');
  const [subscriptionId, setSubscriptionId] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [choiceRequired, setChoiceRequired] = useState<boolean>(false);
  const [pendingPaymentInfo, setPendingPaymentInfo] = useState<{
    orderId?: number;
    status?: string;
    total?: string;
    bankSlipUrl?: string;
    invoiceUrl?: string;
    paymentUrl?: string;
    subscriptionId?: string;
  } | null>(null);

  const isFormValid = tab === 'login' 
    ? (email.trim() && (email.toLowerCase() === 'admin@vortex.com' || subscriptionId.trim()) && password.trim())
    : (email.trim() && subscriptionId.trim() && password.trim() && confirmPassword.trim());

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setMessage({ text: 'Por favor, preencha todos os campos obrigatórios.', type: 'error' });
      return;
    }

    const isAdmin = email.toLowerCase() === 'admin@vortex.com';
    if (!isAdmin && !subscriptionId) {
      setMessage({ text: 'Por favor, informe o número da assinatura do WordPress.', type: 'error' });
      return;
    }

    setIsLoading(true);
    setMessage(null);
    setPendingPaymentInfo(null);

    try {
      const res = await signIn(email, password, isAdmin ? 'admin' : subscriptionId);
      if (res.success) {
        setMessage({ text: 'Acesso autorizado! Carregando painel...', type: 'success' });
      } else if (res.needsChoice) {
        setChoiceRequired(true);
        setMessage(null);
      } else if (res.isPendingPayment) {
        setPendingPaymentInfo({
          ...res.pendingPayment,
          subscriptionId: subscriptionId.trim()
        });
        setMessage(null);
      } else {
        setMessage({ text: res.message || 'Erro ao realizar login.', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: `Erro inesperado: ${err.message || err}`, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterOrResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !subscriptionId || !password || !confirmPassword) {
      setMessage({ text: 'Por favor, preencha todos os campos.', type: 'error' });
      return;
    }

    if (password.length < 6) {
      setMessage({ text: 'A senha deve conter no mínimo 6 caracteres.', type: 'error' });
      return;
    }

    if (password !== confirmPassword) {
      setMessage({ text: 'As senhas digitadas não coincidem.', type: 'error' });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const res = await resetOrSetPassword(email, subscriptionId, password);
      if (res.success) {
        setMessage({ text: `${res.message} Efetuando login...`, type: 'success' });
        setTimeout(async () => {
          const loginRes = await signIn(email, password, subscriptionId);
          if (!loginRes.success && !loginRes.needsChoice) {
            setTab('login');
            setMessage({ text: 'Senha definida com sucesso! Faça login com sua nova senha.', type: 'success' });
          }
        }, 1200);
      } else {
        setMessage({ text: res.message, type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: `Erro inesperado: ${err.message || err}`, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChoice = async (forcedMode: 'admin' | 'restricted') => {
    setIsLoading(true);
    setMessage(null);
    setChoiceRequired(false);

    try {
      const res = await signIn(email, password, subscriptionId, forcedMode);
      if (res.success) {
        setMessage({ text: 'Acesso autorizado! Carregando painel...', type: 'success' });
      } else {
        setMessage({ text: res.message || 'Erro ao realizar login.', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: `Erro inesperado: ${err.message || err}`, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const activeMsg = message ? message.text : (authError || null);
  const isSuccessMsg = message?.type === 'success' || (!authError && activeMsg?.includes('autorizado'));

  return (
    <div className="login-overlay">
      <div className="login-card glass">
        <div className="login-header">
          <img 
            src="./Picture/logo_vm_trader.png" 
            alt="VM Trader" 
            className="h-16 w-auto mx-auto mb-1 object-contain drop-shadow-[0_4px_12px_rgba(234,179,8,0.25)]" 
          />
          <div className="login-title font-bold text-xl text-blue-400">Axion TradeStation</div>
          <div 
            className="text-yellow-400 italic text-xs tracking-wider" 
            style={{ fontFamily: "'Dancing Script', 'Brush Script MT', cursive, sans-serif" }}
          >
            by VM Trader
          </div>
        </div>

        {/* Tab Selector */}
        {!choiceRequired && (
          <div className="flex bg-slate-900/90 p-1 rounded-lg mb-3 border border-slate-800">
            <button
              type="button"
              onClick={() => { setTab('login'); setMessage(null); }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${
                tab === 'login' 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🔑 Entrar
            </button>
            <button
              type="button"
              onClick={() => { setTab('register'); setMessage(null); }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${
                tab === 'register' 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ✨ Criar / Redefinir Senha
            </button>
          </div>
        )}

        {activeMsg && (
          <div className={`login-error show ${
            isSuccessMsg 
              ? 'border-green-500/50 bg-green-500/10 text-green-300' 
              : 'border-red-500/50 bg-red-500/10 text-red-300'
          } text-[11px] p-2.5 rounded-lg mb-3 border`}>
            {activeMsg}
          </div>
        )}

        {choiceRequired ? (
          <div className="flex flex-col gap-3 text-center mt-2">
            <p className="text-xs font-medium border border-blue-900/40 bg-blue-900/15 p-2.5 rounded-lg text-slate-300 leading-relaxed">
              ⚠️ Uma sessão ativa foi identificada. Escolha o tipo de acesso desejado:
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleChoice('restricted')}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-650 font-bold text-white rounded-lg transition active:scale-95 flex flex-col items-center justify-center gap-0.5 shadow-md shadow-blue-900/20"
              >
                <span className="text-xs">🛡️ Acessar Modo Restrito</span>
                <span className="text-[9.5px] font-normal text-blue-200">Painel, Gestão de Contas, CopyTrade NT8 e Monitoramento</span>
              </button>

              <button
                type="button"
                onClick={() => handleChoice('admin')}
                className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-500 hover:to-red-650 font-bold text-white rounded-lg transition active:scale-95 flex flex-col items-center justify-center gap-0.5 border border-red-500/20 shadow-md shadow-red-950/20"
              >
                <span className="text-xs">⚡ Forçar Acesso Completo</span>
                <span className="text-[9.5px] font-normal text-amber-200">Desconecta a sessão ativa no outro dispositivo</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChoiceRequired(false);
                  setMessage(null);
                }}
                className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 font-semibold text-slate-300 rounded-lg transition text-xs"
              >
                Voltar
              </button>
            </div>
          </div>
        ) : pendingPaymentInfo ? (
          <div className="flex flex-col gap-3 p-3.5 bg-amber-950/30 border border-amber-600/40 rounded-xl text-slate-200 animate-fadeIn">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-base shrink-0 border border-amber-500/30">
                💳
              </div>
              <div>
                <h4 className="text-xs font-bold text-amber-300">Assinatura com Pagamento Pendente</h4>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                  Identificamos que a inscrição <span className="font-bold text-white">#{pendingPaymentInfo.subscriptionId}</span> está com status pendente de renovação ou pagamento.
                </p>
              </div>
            </div>

            {pendingPaymentInfo.total && (
              <div className="bg-slate-900/70 border border-slate-800 p-2 rounded-lg flex items-center justify-between text-xs">
                <span className="text-slate-400">Valor da Fatura:</span>
                <span className="font-black text-amber-400 text-sm">R$ {pendingPaymentInfo.total}</span>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-1">
              {pendingPaymentInfo.bankSlipUrl && (
                <a
                  href={pendingPaymentInfo.bankSlipUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-lg text-center shadow-lg shadow-emerald-950/40 transition active:scale-95 flex items-center justify-center gap-2"
                >
                  <span>📄</span>
                  <span>Acessar Boleto Bancário (Asaas)</span>
                </a>
              )}

              {pendingPaymentInfo.invoiceUrl && (
                <a
                  href={pendingPaymentInfo.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-lg text-center shadow transition active:scale-95 flex items-center justify-center gap-2"
                >
                  <span>🔗</span>
                  <span>Visualizar Fatura &amp; PIX (Asaas)</span>
                </a>
              )}

              {pendingPaymentInfo.paymentUrl && !pendingPaymentInfo.bankSlipUrl && !pendingPaymentInfo.invoiceUrl && (
                <a
                  href={pendingPaymentInfo.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-xs rounded-lg text-center shadow transition active:scale-95 flex items-center justify-center gap-2"
                >
                  <span>💳</span>
                  <span>Pagar no Site (Área do Cliente)</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => setPendingPaymentInfo(null)}
                className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold rounded-lg transition"
              >
                Voltar ao Formulário de Login
              </button>
            </div>

            <div className="text-[10px] text-center text-slate-400 border-t border-slate-800 pt-2 flex items-center justify-center gap-1">
              <span>💬 Dúvidas ou suporte?</span>
              <a 
                href="https://wa.me/5551999860180" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-emerald-400 hover:underline font-bold"
              >
                Fale com a VM Trader
              </a>
            </div>
          </div>
        ) : tab === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="space-y-3">
            <div className="login-field">
              <label className="login-label">✉️ E-MAIL</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="login-input"
                placeholder="seuemail@exemplo.com"
                required
                autoComplete="email"
              />
            </div>

            {email.toLowerCase() !== 'admin@vortex.com' && (
              <div className="login-field">
                <label className="login-label">
                  🎟️ Número Inscrição
                </label>
                <input
                  type="text"
                  value={subscriptionId}
                  onChange={(e) => setSubscriptionId(e.target.value)}
                  className="login-input"
                  placeholder="Ex: 12345"
                  required
                />
              </div>
            )}

            <div className="login-field">
              <label className="login-label">🔒 Senha de Acesso</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="login-input pr-9"
                  placeholder="Sua senha pessoal"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs focus:outline-none p-1"
                  tabIndex={-1}
                  title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? '👁️' : '🔒'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !isFormValid}
              className="login-btn w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-500 hover:to-blue-700 font-bold text-white rounded-lg transition disabled:opacity-50 text-xs"
            >
              {isLoading ? 'Validando...' : 'Validar e Acessar'}
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => { setTab('register'); setMessage(null); }}
                className="text-[11px] text-blue-400 hover:text-blue-300 underline font-medium transition"
              >
                Primeiro acesso ou criar/redefinir senha? Clique aqui
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegisterOrResetSubmit} className="space-y-2.5">
            <div className="p-2 bg-blue-950/40 border border-blue-800/40 rounded-lg text-[10.5px] text-blue-200 leading-relaxed">
              💡 <strong>Primeiro Acesso:</strong> Informe seu e-mail e número de inscrição ativos para criar sua senha pessoal. Clientes existentes mantêm configurações intactas.
            </div>

            <div className="login-field">
              <label className="login-label">✉️ E-MAIL</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="login-input"
                placeholder="seuemail@exemplo.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="login-field">
              <label className="login-label">
                🎟️ Número Inscrição
              </label>
              <input
                type="text"
                value={subscriptionId}
                onChange={(e) => setSubscriptionId(e.target.value)}
                className="login-input"
                placeholder="Ex: 12345"
                required
              />
            </div>

            <div className="login-field">
              <label className="login-label">🔒 Nova Senha (mínimo 6 caracteres)</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="login-input pr-9"
                  placeholder="Defina sua senha"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs focus:outline-none p-1"
                  tabIndex={-1}
                  title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? '👁️' : '🔒'}
                </button>
              </div>
            </div>

            <div className="login-field">
              <label className="login-label">🔒 Confirmar Nova Senha</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="login-input"
                placeholder="Repita a nova senha"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !isFormValid}
              className="login-btn w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 font-bold text-white rounded-lg transition disabled:opacity-50 text-xs"
            >
              {isLoading ? 'Processando...' : 'Cadastrar Senha e Acessar'}
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => { setTab('login'); setMessage(null); }}
                className="text-[11px] text-slate-400 hover:text-slate-200 font-medium transition"
              >
                Já possui senha? <span className="text-blue-400 underline">Voltar para o Login</span>
              </button>
            </div>
          </form>
        )}

        {/* Rodapé Legal & Institucional */}
        <div className="mt-3 pt-2.5 border-t border-slate-800/60 text-center text-[10px] text-yellow-400 font-medium leading-tight space-y-1">
          <div>Todos os Direitos Reservados - VM GESTÃO &amp; TECNOLOGIA</div>
          <div className="text-[9.5px] text-yellow-500/85 font-mono">CNPJ: 67.109.367/0001-19</div>
        </div>
      </div>
    </div>
  );
};
