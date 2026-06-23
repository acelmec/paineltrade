import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export const Login: React.FC = () => {
  const { signIn, authError } = useApp();
  
  const [email, setEmail] = useState<string>('');
  const [subscriptionId, setSubscriptionId] = useState<string>('');
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !subscriptionId) {
      setMessage('Por favor, preencha todos os campos.');
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      // Passa a assinatura como segundo parâmetro também (onde era a senha) por compatibilidade com a assinatura do método signIn no Contexto
      const success = await signIn(email, subscriptionId, subscriptionId);
      if (success) {
        setMessage('Acesso autorizado! Carregando painel...');
      }
    } catch (err: any) {
      setMessage(`Erro inesperado: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-overlay">
      <div className="login-card glass">
        <div className="login-header">
          <div className="login-logo text-5xl mb-2">⚡</div>
          <div className="login-title font-bold text-2xl text-blue-400">Vortex AI</div>
          <div className="login-subtitle text-xs text-slate-400 mt-1">
            Gamma Scalpe v10.5 — Acesso Restrito
          </div>
        </div>

        {(authError || message) && (
          <div className={`login-error show ${!authError && message?.includes('autorizado') ? 'border-green-500/50 bg-green-500/10 text-green-300' : 'border-red-500/50 bg-red-500/10 text-red-300'} text-xs p-3 rounded-lg mb-4 border`}>
            {authError || message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="login-field">
            <label className="login-label">✉️ E-mail da Assinatura</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="login-input"
              placeholder="seuemail@exemplo.com"
              required
            />
          </div>

          <div className="login-field">
            <label className="login-label">
              🎟️ Número da Assinatura WordPress
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

          <button
            type="submit"
            disabled={isLoading}
            className="login-btn w-full py-3 bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-500 hover:to-blue-700 font-bold text-white rounded-lg transition disabled:opacity-50"
          >
            {isLoading ? 'Processando...' : 'Validar e Acessar'}
          </button>
        </form>

        <div className="login-info mt-6 text-xs border border-blue-900/40 bg-blue-900/10 p-3 rounded-lg text-slate-400 leading-relaxed">
          <strong>⚠️ Como funciona:</strong><br />
          • O controle de sessão permite apenas **um acesso ativo** por conta.<br />
          • A assinatura é validada no WooCommerce do WordPress.<br />
          • Se for seu primeiro login, sua conta será registrada automaticamente caso possua assinatura ativa.
        </div>
      </div>
    </div>
  );
};
