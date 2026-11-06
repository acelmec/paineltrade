import React, { useState, useEffect, useMemo } from 'react';

export const Manual: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'manual' | 'gamma'>('manual');
  const [activeTopic, setActiveTopic] = useState<string>('topic-1');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [currentSlide, setCurrentSlide] = useState<number>(1);
  const totalSlides = 8;

  // Navegação por teclado para os slides de Gamma
  useEffect(() => {
    if (activeTab !== 'gamma') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        setCurrentSlide(prev => Math.min(totalSlides, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentSlide(prev => Math.max(1, prev - 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab]);

  // Lista dos Tópicos do Manual Exaustivo
  const topics = [
    { id: 'topic-1', icon: '🚀', title: '1. Visão Geral & Arquitetura', desc: 'Conceitos centrais, fuso oficial, Web Workers e ecossistema' },
    { id: 'topic-2', icon: '🏦', title: '2. Gestão de Contas & Risk Management', desc: 'Contas Demo/Reais, Sincronização NinjaTrader, Saldo e Travas' },
    { id: 'topic-3', icon: '🔗', title: '3. Axion Copy & NinjaTrader 8', desc: 'Manual completo: Sincronização Local/Túnel, Add-On, Regras e Telegram' },
    { id: 'topic-4', icon: '⏪', title: '4. Replay de Mercado & Simulador Visual', desc: 'Backtesting interativo, velocidade 1x-100x e boleta de replay' },
    { id: 'topic-5', icon: '🧠', title: '5. Criador de Algoritmos & Robôs Dinâmicos', desc: 'Indicador vs Estratégia, Barra Fechada vs Realtime, Filtros e Regras' },
    { id: 'topic-6', icon: '🌡️', title: '6. Indicadores & Volume Institucional', desc: 'Volume Heatmap, VPOC, VAH/VAL, HVN, SMC, PVA e Templates' },
    { id: 'topic-7', icon: '🧩', title: '7. Gerenciador de Widgets Flutuantes', desc: 'Z-Score, Delta, Relógio Oficial, Painel de Posições e M7 Tracker' },
    { id: 'topic-8', icon: '🎮', title: '8. Gráfico, Boleta, Desenhos & Estratégias ATM', desc: 'Timeframes, Boleta Manual, Alvos Parciais, Break-Even e Trailing Stop' },
    { id: 'topic-9', icon: '🤖', title: '9. IA, Copilot & 4 Modos de Disparo', desc: 'Tempo, Alerta, Barra a Barra, Notícias, Chat Copilot e Validação' },
    { id: 'topic-10', icon: '🔔', title: '10. Central de Alertas & Telegram', desc: 'Gatilhos de Z-Score, GEX, Notícias de Alto Impacto e Bot' },
    { id: 'topic-11', icon: '🔌', title: '11. Conectores NinjaTrader 8 & MT5', desc: 'Integração via Account ID e scripts C# (VMBot)' },
    { id: 'topic-12', icon: '📈', title: '12. Análise de Desempenho & Históricos', desc: 'Sincronização NT8, KPIs, Win Rate, Profit Factor, Curva e CSV' },
    { id: 'topic-13', icon: '⚡', title: '13. Otimização de GPU & Background VPS', desc: 'Aceleração de hardware, Web Workers e estabilidade 24/7' },
    { id: 'topic-14', icon: '📚', title: '14. Glossário Exaustivo de A a Z', desc: 'Dicionário técnico completo de termos quantitativos e operacionais' },
  ];

  const filteredTopics = useMemo(() => {
    if (!searchTerm.trim()) return topics;
    const term = searchTerm.toLowerCase();
    return topics.filter(t => 
      t.title.toLowerCase().includes(term) || 
      t.desc.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  return (
    <div className="max-w-7xl mx-auto my-4 space-y-6">
      
      {/* Cabeçalho do Manual */}
      <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded text-[10px] font-mono font-bold uppercase">
              DOCUMENTAÇÃO TÉCNICA OFICIAL VORTEX TRADESTATION 2.0
            </span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight mt-1 flex items-center gap-2">
            📖 Manual do Sistema & Guia Operacional Completo
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Guia didático, exaustivo e passo a passo detalhando todas as telas, parâmetros de risco, automações de IA, criador de algoritmos, widgets flutuantes, replay de mercado e integração com plataformas externas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/docs/Estrategias_Volume_Gamma_Vortex.pdf"
            target="_blank"
            rel="noopener noreferrer"
            download="Playbook_Estrategias_Volume_Gamma_Vortex.pdf"
            className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2"
          >
            📥 Baixar Playbook PDF (Volume & Gamma)
          </a>
        </div>
      </div>

      {/* Abas Superiores Temáticas */}
      <div className="flex gap-2 bg-slate-950/80 p-2 rounded-xl border border-slate-800 shadow-lg">
        <button
          onClick={() => setActiveTab('manual')}
          className={`flex-1 py-3 px-4 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 ${
            activeTab === 'manual'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          📖 Manual Exaustivo do Sistema (14 Módulos)
        </button>
        <button
          onClick={() => {
            setActiveTab('gamma');
            setCurrentSlide(1);
          }}
          className={`flex-1 py-3 px-4 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 ${
            activeTab === 'gamma'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          📊 Apresentação Interativa Gamma Levels (Opções Institucionais)
        </button>
      </div>

      {activeTab === 'manual' ? (
        /* ================= TÓPICO 1: MANUAL DIDÁTICO EXAUSTIVO ================= */
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Menu Lateral de Tópicos e Busca */}
          <div className="md:col-span-4 space-y-3">
            
            {/* Campo de Busca Rápida */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 shadow-md">
              <label className="text-[10px] uppercase font-bold text-slate-400 block font-mono">
                🔍 Pesquisar em todo o Manual
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Ex: drawdown, copy trade, z-score, ninja, lote..."
                className="w-full bg-slate-900 border border-slate-750 p-2.5 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 font-medium"
              />
            </div>

            {/* Lista de Tópicos */}
            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 space-y-1 max-h-[700px] overflow-y-auto custom-scrollbar shadow-md">
              {filteredTopics.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTopic(t.id)}
                  className={`w-full text-left p-3 rounded-xl transition flex items-center gap-3 border ${
                    activeTopic === t.id
                      ? 'bg-blue-600/20 border-blue-500/50 text-white shadow-md'
                      : 'border-transparent text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
                  }`}
                >
                  <span className="text-xl shrink-0">{t.icon}</span>
                  <div className="overflow-hidden">
                    <div className="text-xs font-bold truncate">{t.title}</div>
                    <div className="text-[10px] text-slate-500 truncate">{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Dica para Iniciantes */}
            <div className="bg-emerald-950/20 border border-emerald-500/30 p-4 rounded-xl text-[11px] text-emerald-300 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-emerald-400 text-xs">
                💡 Guia Rápido para Iniciantes
              </div>
              <p className="text-[11px] text-emerald-200/80 leading-relaxed">
                Se você está usando a plataforma pela primeira vez, siga a ordem sugerida:
              </p>
              <ol className="list-decimal pl-4 space-y-1 text-[10.5px] text-emerald-300 font-medium">
                <li>Leia o <strong>Módulo 1</strong> para entender o conceito.</li>
                <li>Vá ao <strong>Módulo 2</strong> para criar sua conta demo.</li>
                <li>Consulte o <strong>Módulo 5</strong> para aprender a operar no gráfico.</li>
              </ol>
            </div>

          </div>

          {/* Área Principal de Conteúdo Detalhado */}
          <div className="md:col-span-8 bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-8 text-slate-200 shadow-xl">
            
            {/* TÓPICO 1: PRIMEIRAS PASSOS & VISÃO GERAL */}
            {activeTopic === 'topic-1' && (
              <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
                <div>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded font-mono">
                    Módulo 1 • Conceito Central
                  </span>
                  <h2 className="text-2xl font-black text-white mt-1">🚀 Visão Geral, Filosofia & Arquitetura do Sistema</h2>
                  <p className="text-xs text-slate-400">O que é a plataforma VortexWeb e como suas tecnologias de tempo real e inteligência se integram.</p>
                </div>

                <div className="bg-blue-950/30 p-5 rounded-xl border border-blue-500/30 space-y-2">
                  <h3 className="text-xs font-bold text-blue-400 uppercase flex items-center gap-1.5 font-mono">
                    💡 Entenda em 1 Minuto (Resumo Prático)
                  </h3>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    O <strong>VortexWeb</strong> é uma estação de trabalho analítica e operacional de nível institucional para traders e mesas proprietárias, unindo **quatro pilares essenciais**:
                  </p>
                  <ul className="list-disc pl-5 text-xs text-slate-300 space-y-1.5 pt-1">
                    <li><strong>1. Leitura de Liquidez Institucional (Gamma Levels & Volume Profile)</strong>: Visualização de zonas de atuação de Market Makers (Call/Put 0DTE, BL, GEX, VPOC, VAH/VAL e HVN).</li>
                    <li><strong>2. Tomada de Decisão com Inteligência Artificial & Copilot</strong>: Análise probabilística em linguagem natural, leitura de fluxo, macroeconomia e confirmação de entradas.</li>
                    <li><strong>3. Criador Dinâmico de Algoritmos & Robôs</strong>: Construção visual sem código de estratégias de execução e indicadores técnicos com regras de risco rígidas.</li>
                    <li><strong>4. Gestão Multi-Contas, Copy Trading & Conectores</strong>: Controle de Drawdown Trailing/EOD, espelhamento Master/Slave e conexão direta com NinjaTrader 8 e MetaTrader 5 via C#.</li>
                  </ul>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-100 border-b border-slate-800 pb-2">
                    ⚙️ Como o Ecossistema Vortex Funciona Passo a Passo:
                  </h3>
                  
                  <div className="space-y-3 text-xs">
                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-blue-300 text-xs">🌐 Etapa A: Coleta de Dados & Higienização Contínua</div>
                      <p className="text-slate-400 text-[11.5px] leading-relaxed">
                        O sistema recebe fluxos de cotações em tempo real de ativos globais (<strong>NQ / Nasdaq</strong>, <strong>ES / S&P 500</strong>, <strong>GC / Gold</strong>, <strong>BTC / ETH</strong>). Todos os candles passam por higienização universal (descarte de pavios fantasmas, aberrações e NaNs) e cálculo instantâneo de <strong>Z-Score</strong> e <strong>Delta de Agressão</strong>.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-purple-300 text-xs">📊 Etapa B: Análise de Confluência & Notícias</div>
                      <p className="text-slate-400 text-[11.5px] leading-relaxed">
                        Monitoramento sincronizado de indicadores macroeconômicos como <strong>VIX (Índice de Volatilidade)</strong>, <strong>DXY (Índice do Dólar)</strong>, calendário de notícias econômicas de alto impacto (CPI, NFP, FOMC) e a força das <strong>Magníficas 7 (NVDA, AAPL, MSFT, AMZN, GOOGL, META, TSLA)</strong>.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-emerald-300 text-xs">🧠 Etapa C: Motores de Execução (IA & Algoritmos)</div>
                      <p className="text-slate-400 text-[11.5px] leading-relaxed">
                        Algoritmos customizados e ciclos de Inteligência Artificial avaliam a confluência em <strong>Barra Fechada</strong> ou <strong>Barra Corrente</strong>, emitindo alertas visuais ou gerando relatórios operacionais completos com direção (<span className="text-green-400 font-bold">COMPRA</span> / <span className="text-red-400 font-bold">VENDA</span>), preço de entrada, Stop Loss e Take Profit.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-amber-300 text-xs">⚡ Etapa D: Roteamento Seguro, Copy Trading & Conectores</div>
                      <p className="text-slate-400 text-[11.5px] leading-relaxed">
                        A ordem é validada pelas travas de risco da Conta de Negociação (Drawdown, limite diário de trades e regras de concorrência). Se a conta for <strong>MASTER</strong>, as contas <strong>SLAVE</strong> filhas espelham a posição na hora via multiplicador de lotes. Se houver conexão com o NinjaTrader 8, o script C# <code>VMBot</code> recebe o sinal via <code>Account ID</code> e abre a ordem na corretora.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Arquitetura de Background e Fuso */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
                    <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                      ⚡ Execução Ininterrupta (Web Workers)
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Loops de monitoramento de robôs e cálculo de indicadores rodam em threads dedicadas de <strong>Web Workers</strong> com sinal de áudio keep-alive. O sistema não congela nem reduz a frequência quando a aba está em segundo plano ou minimizada.
                    </p>
                  </div>

                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
                    <div className="font-bold text-blue-300 flex items-center gap-1.5">
                      📌 Horário Oficial de Brasília (GMT-3)
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Toda a marcação de tempo dos gráficos, relatórios e sessões operacionais é sincronizada no horário oficial de Brasília (GMT-3). Isso garante paridade total de horários mesmo operando em VPSs hospedadas em Nova York ou na Europa.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TÓPICO 2: GESTÃO DE CONTAS & RISK MANAGEMENT */}
            {activeTopic === 'topic-2' && (
              <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
                <div>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded font-mono">
                    Módulo 2 • Gestão de Contas & Risk Management
                  </span>
                  <h2 className="text-2xl font-black text-white mt-1">🏦 Gestão de Contas Demonstrativas, Reais & Sincronização NT8</h2>
                  <p className="text-xs text-slate-400">Guia completo para sincronizar contas do NinjaTrader 8, criar contas virtuais, ajustar travas de risco de mesas proprietárias e monitorar saldos.</p>
                </div>

                <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 space-y-2">
                  <h3 className="text-xs font-bold text-emerald-400 uppercase flex items-center gap-1.5 font-mono">
                    💡 Entenda em 1 Minuto (Filosofia de Contas)
                  </h3>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    Você nunca opera no "vazio". No Vortex, cada ordem executada manual, por robô ou via Copy Trading pertence a uma <strong>Conta de Negociação</strong> com parâmetros individuais de risco. O ecossistema suporta dois tipos principais de contas:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-[11px]">
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-blue-400 flex items-center gap-1.5">
                        <span>🔌</span> Contas Sincronizadas (NinjaTrader 8)
                      </div>
                      <p className="text-slate-400 mt-1 leading-relaxed">
                        Conectadas diretamente à sua corretora ou mesa proprietária (Apex, Leantech, Topstep, Tradovate, Rithmic, CQG). O saldo real, PnL flutuante e margem vêm direto do motor de execução do NinjaTrader.
                      </p>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-purple-400 flex items-center gap-1.5">
                        <span>🧪</span> Contas Virtuais / Paper Trading (Axion)
                      </div>
                      <p className="text-slate-400 mt-1 leading-relaxed">
                        Contas simuladas internas para treinar estratégias no gráfico, simular limites de mesas com Drawdown Trailing/EOD e testar robôs sem risco financeiro.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sincronização NinjaTrader */}
                <div className="bg-blue-950/20 border border-blue-500/30 p-5 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-blue-400 uppercase flex items-center gap-1.5 font-mono">
                      <span>🔄</span> Como Sincronizar Suas Contas do NinjaTrader 8
                    </h3>
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded font-mono font-bold">
                      NinjaSyncModal
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Para trazer suas contas reais ou de avaliação do NinjaTrader 8 para o painel Web:
                  </p>
                  <ol className="list-decimal pl-5 text-xs text-slate-300 space-y-2 leading-relaxed">
                    <li>
                      <strong>Conecte o NinjaTrader 8:</strong> No NinjaTrader, certifique-se de que sua conexão de dados/corretora está ativa (bolinha verde em <em>Connections</em>).
                    </li>
                    <li>
                      <strong>Abra o Modal de Sincronização:</strong> Na tela <strong>Gestão de Contas</strong> ou no topo do painel, clique em <strong>"Conectar NinjaTrader"</strong> ou no ícone da plataforma.
                    </li>
                    <li>
                      <strong>Escolha o Modo de Transporte:</strong>
                      <ul className="list-disc pl-5 mt-1 space-y-1 text-slate-400 text-[11px]">
                        <li><strong className="text-white">Modo Local:</strong> Para uso no mesmo computador (porta <code>http://localhost:8001</code>).</li>
                        <li><strong className="text-white">Modo Túnel Nuvem:</strong> Para VPS ou acesso externo via celular com Pairing Token blindado.</li>
                        <li><strong className="text-white">Modo Auto:</strong> Recomendado. Tenta local primeiro e chaveia para nuvem automaticamente.</li>
                      </ul>
                    </li>
                    <li>
                      <strong>Selecione as Contas a Importar:</strong> O painel lista todas as contas conectadas no NT8 (ex: <code>Sim101</code>, <code>PAAPEX-12345</code>, <code>LFE-98765</code>). Marque as contas desejadas e clique em <strong>"Importar e Sincronizar"</strong>.
                    </li>
                    <li>
                      <strong>Auto-Reconhecimento:</strong> As contas importadas recebem automaticamente a tag <span className="text-amber-400 font-bold bg-amber-500/10 px-1 rounded border border-amber-500/20 text-[10px]">Gerenciado pelo NinjaTrader</span>, garantindo que o saldo seja sempre auditado em tempo real.
                    </li>
                  </ol>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-100 border-b border-slate-800 pb-2">
                    🛠️ Detalhamento de Cada Parâmetro de Risco da Conta:
                  </h3>

                  <div className="space-y-3 text-xs">
                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-white text-xs">1. Identificação & Saldo Inicial (US$)</div>
                      <p className="text-slate-300 text-[11.5px] leading-relaxed">
                        Nome identificador da conta (ex: <code>"Apex 50k - PA01"</code>). Em contas simuladas, você define o capital inicial (ex: $50.000). Em contas sincronizadas do NT8, o saldo inicial e o saldo líquido atual (*Cash Value*) são lidos automaticamente do Rithmic/NinjaTrader.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-red-400 text-xs">2. Stop Loss Diário (US$) — Limite Máximo de Perda no Dia</div>
                      <p className="text-slate-300 text-[11.5px] leading-relaxed">
                        Prejuízo máximo permitido em um único dia (ex: <code>US$ 1.000,00</code>). O motor monitora PnL Realizado + Não Realizado. Ao atingir o limite, o sistema encerra posições abertas e bloqueia novas ordens pelo restante da sessão.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-emerald-400 text-xs">3. Gain Máximo Diário (US$) — Meta de Lucro do Dia</div>
                      <p className="text-slate-300 text-[11.5px] leading-relaxed">
                        Meta financeira da sessão (ex: <code>US$ 1.500,00</code>). Ao alcançar a meta, a conta entra em trava de proteção para evitar a devolução dos lucros conquistados (*Lock Diário*).
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-blue-400 text-xs">4. Limite de Operações Diárias (Max Trades / Dia)</div>
                      <p className="text-slate-300 text-[11.5px] leading-relaxed">
                        Número máximo de entradas permitidas no dia (ex: <code>6 operações</code>). Previne o *overtrading* e força a disciplina operacional do trader.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-amber-300 text-xs">5. Lote Máximo por Operação (`MaxLots`)</div>
                      <p className="text-slate-300 text-[11.5px] leading-relaxed">
                        Teto máximo de contratos permitidos para a conta (ex: <code>2 contratos</code>). Essencial para contas de mesa que limitam contratos por faixa de saldo. Caso uma ordem exceda esse limite, o guardião de lote entra em ação imediatamente antes ou durante o envio.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-cyan-300 text-xs">6. Janelas de Horários Operacionais (`Horários Permitidos`)</div>
                      <p className="text-slate-300 text-[11.5px] leading-relaxed">
                        Configuração do horário inicial e final de negociação com precisão de segundos (ex: <code>10:30:00 às 16:45:00</code>). Ordens fora dessa janela são rejeitadas preventivamente.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
                      <div className="font-bold text-amber-300 text-xs">7. Modalidades de Drawdown (Mesas Proprietárias)</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                          <div className="font-bold text-amber-400 text-[11px]">Intraday Trailing (High-Watermark)</div>
                          <p className="text-slate-400 text-[10.5px] mt-1 leading-relaxed">
                            A linha de perda máxima acompanha o topo mais alto de saldo flutuante alcançado durante o dia. Se o saldo sobe $1.000, o piso de segurança sobe junto. Padrão das mesas americanas (Apex, Earn2Trade).
                          </p>
                        </div>
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                          <div className="font-bold text-blue-400 text-[11px]">End-Of-Day (EOD)</div>
                          <p className="text-slate-400 text-[10.5px] mt-1 leading-relaxed">
                            A linha de perda permanece estática durante todo o pregão intraday e só é recalculada no fechamento do dia. Ideal para swing trade ou mesas com regra EOD.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-purple-400 text-xs">8. Simular Reprovação (Eliminação Definitiva)</div>
                      <p className="text-slate-300 text-[11.5px] leading-relaxed">
                        • <strong>Ativado (`true`)</strong>: Se o Drawdown Máximo ou o Stop Diário for violado, a conta trava imediatamente, mudando o status para <code className="text-red-400 font-bold">REPROVADA</code> e impedindo qualquer nova abertura até reset explícito.<br />
                        • <strong>Desativado (`false`)</strong>: O sistema alerta visualmente sem bloquear permanentemente a conta.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-blue-300 text-xs">9. Controle de Posição Única por Ativo</div>
                      <p className="text-slate-300 text-[11.5px] leading-relaxed">
                        <span className="text-red-400 font-bold">⚠️ REGRA INVIOLÁVEL:</span> Em nenhuma hipótese o sistema permite duas posições simultâneas no <strong>MESMO ATIVO</strong> na mesma conta, evitando trades conflitantes ou sobre-alavancagem acidental.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-amber-300">🔄 Sincronização e Reset</div>
                    <div className="text-[11px] text-slate-400">Em contas simuladas, use "Reset Saldo" para reiniciar o capital. Em contas NT8, o botão "Atualizar Métricas" sincroniza instantaneamente com a corretora.</div>
                  </div>
                </div>
              </div>
            )}

            {/* TÓPICO 3: AXION COPY & NINJATRADER 8 */}
            {activeTopic === 'topic-3' && (
              <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
                <div>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded font-mono">
                    Módulo 3 • Manual Completo Axion Copy
                  </span>
                  <h2 className="text-2xl font-black text-white mt-1">🔗 Axion Copy — Manual Operacional & NinjaTrader 8</h2>
                  <p className="text-xs text-slate-400">Guia definitivo para sincronização de contas (Local e Túnel Nuvem), configuração de regras, ativação de licença, Add-On NT8, Telegram e gestão de risco.</p>
                </div>

                {/* Bloco 1: O que é o Axion Copy */}
                <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 space-y-2">
                  <h3 className="text-xs font-bold text-amber-400 uppercase flex items-center gap-1.5 font-mono">
                    💡 1. O que é o Axion Copy e sua Arquitetura de Ultra-Baixa Latência
                  </h3>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    O <strong>AXION COPY</strong> é um motor profissional de replicação e governança de risco para o <strong>NinjaTrader 8</strong>. Ele permite operar em uma única conta <strong>MASTER</strong> (manual, boleta ou robô) e espelhar as entradas, saídas parciais, movimentações de Stop Loss e Take Profit instantaneamente para dezenas de contas <strong>SLAVES</strong> (contas de avaliação Apex, Leantech, Topstep, contas financiadas PA ou contas Reais).
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <div className="font-bold text-blue-400">⚡ Latência &lt; 1ms</div>
                      <div className="text-slate-400 text-[10px]">Execução em thread nativa C# sem gargalos de navegador.</div>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <div className="font-bold text-emerald-400">🛡️ Risco Inviolável</div>
                      <div className="text-slate-400 text-[10px]">Proteção contra lote excessivo, falta de SL/TP e ordens órfãs.</div>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <div className="font-bold text-purple-400">🌐 Acesso Híbrido</div>
                      <div className="text-slate-400 text-[10px]">Controle local e remoto via celular ou notebook através de Túnel Nuvem.</div>
                    </div>
                  </div>
                </div>

                {/* Bloco 2: Modos de Sincronização Local vs Túnel */}
                <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold text-cyan-400 uppercase flex items-center gap-1.5 font-mono">
                    🌐 2. Modos de Sincronização: Local vs. Túnel Nuvem (Relay Hub)
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    O Axion Copy suporta 3 modalidades de transporte para atender tanto quem opera no próprio computador quanto quem gerencia servidores VPS:
                  </p>
                  <div className="space-y-2.5 text-xs">
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-blue-300 flex items-center justify-between">
                        <span>A. Modo Local (HTTP :8001)</span>
                        <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono">localhost:8001</span>
                      </div>
                      <p className="text-slate-400 text-[11px] mt-1 leading-relaxed">
                        • <strong>Como funciona:</strong> O navegador e o NinjaTrader comunicam-se via chamada HTTP direta em sua máquina local.<br />
                        • <strong>Quando usar:</strong> Quando você opera no mesmo computador físico em que o NinjaTrader está aberto.<br />
                        • <strong>Vantagem:</strong> Latência mínima absoluta (&lt; 1ms) e consumo zero de internet para a rota interna.
                      </p>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-purple-300 flex items-center justify-between">
                        <span>B. Modo Túnel Nuvem (WebSocket Relay Hub)</span>
                        <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-mono">Pairing Token Blindado</span>
                      </div>
                      <p className="text-slate-400 text-[11px] mt-1 leading-relaxed">
                        • <strong>Como funciona:</strong> O NinjaTrader (no seu PC ou VPS) conecta-se a um servidor seguro Relay Hub via WebSocket através de um token único e blindado (ex: <code>vtx_usr_xxxx</code>). O painel Web conecta-se ao mesmo canal.<br />
                        • <strong>Quando usar:</strong> Quando o NinjaTrader roda em um servidor VPS ou no computador de casa e você deseja monitorar, alterar regras e disparar zeragens pelo celular ou notebook de qualquer lugar.<br />
                        • <strong>Vantagem:</strong> Não exige abertura de portas no roteador, não necessita IP fixo nem serviços externos como ngrok.
                      </p>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-emerald-300 flex items-center justify-between">
                        <span>C. Modo Automático (Auto) — Recomendado</span>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">Fallback Inteligente</span>
                      </div>
                      <p className="text-slate-400 text-[11px] mt-1 leading-relaxed">
                        Tenta comunicação local prioritariamente. Se a conexão local falhar ou você estiver fora de casa, chaveia instantaneamente para o Túnel Nuvem sem travar a tela ou perder ordens.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bloco 3: Instalação e Licença */}
                <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold text-amber-400 uppercase flex items-center gap-1.5 font-mono">
                    📥 3. Instalação do Add-On no NinjaTrader 8 e Ativação de Licença
                  </h3>
                  <ol className="list-decimal pl-5 text-xs text-slate-300 space-y-2 leading-relaxed">
                    <li>
                      <strong>Importação do Arquivo .zip:</strong> No NinjaTrader 8, vá em <code>Tools ➔ Import ➔ NinjaScript Add-On...</code> e selecione o arquivo <code>AxionGatewayAddOn.zip</code>. Confirme os avisos e reinicie o NinjaTrader.
                    </li>
                    <li>
                      <strong>Abrindo o Painel do Add-On:</strong> No menu principal do NinjaTrader, clique em <code>New</code> (ou <code>Ferramentas</code>) ➔ <code>Axion Gateway AddOn</code>.
                    </li>
                    <li>
                      <strong>Ativação da Licença:</strong>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        Na janela do Add-On, acesse a aba <strong>🏢 Sobre & Licença</strong>. Insira seu <strong>ID de Assinatura / Número do Pedido</strong> e clique em <strong>Validar Licença</strong>. O status mudará para <span className="text-emerald-400 font-bold">"Licença Ativa e Autorizada"</span> com seu Machine ID registrado.
                      </p>
                    </li>
                  </ol>
                </div>

                {/* Bloco 4: As 8 Abas do Painel AddOn NT8 */}
                <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold text-blue-400 uppercase flex items-center gap-1.5 font-mono">
                    🖥️ 4. Conhecendo o Painel AddOn no NinjaTrader 8 (8 Abas)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-blue-300">1. 🌐 Gateway</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">Status do listener local (porta 8001), ativação do Túnel Nuvem (Pairing Token) e teste de ping.</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-amber-300">2. 👥 Copy Trading</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">Interruptor geral da copiadora, lista de regras ativas e contadores de ordens processadas.</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-emerald-300">3. 📊 Posições Abertas</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">Monitor multi-contas em tempo real com PnL flutuante total e botão de zeragem rápida.</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-red-300">4. 🛡️ Gestão de Risco</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">Limites de perda diária ($), meta de ganho ($), limite de trades/dia e horários operacionais.</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-cyan-300">5. 📱 Telegram</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">Token do bot, Chat ID e flags de alertas para trades abertos, encerrados e intervenções.</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-purple-300">6. 📊 Relatórios</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">Agendamento de relatórios periódicos de balanço enviados ao Telegram (ex: a cada 30min ou 09:00 e 18:00).</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-slate-300">7. 📜 Logs & Auditoria</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">Terminal em tempo real com carimbo de milissegundos para cada requisição e rejeição.</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-indigo-300">8. 🏢 Sobre & Licença</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">Validação da chave de ativação, exibição do Machine ID e status da assinatura.</div>
                    </div>
                  </div>
                </div>

                {/* Bloco 5: Configuração de Regras no Painel Web */}
                <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold text-emerald-400 uppercase flex items-center gap-1.5 font-mono">
                    ⚙️ 5. Configuração Passo a Passo de Regras de Copy Trading
                  </h3>
                  <ol className="list-decimal pl-5 text-xs text-slate-300 space-y-2.5 leading-relaxed">
                    <li>
                      Acesse a aba <strong>Regras de Cópia</strong> no <strong>Copy Trading Dashboard</strong> no painel Web.
                    </li>
                    <li>
                      Clique no botão <strong>"+ Nova Regra de Copy"</strong>.
                    </li>
                    <li>
                      <strong>Selecione a Conta MASTER:</strong> A conta principal que você operará manualmente ou com robôs.
                    </li>
                    <li>
                      <strong>Selecione as Contas SLAVES:</strong> Marque uma ou várias contas que devem replicar a Master.
                    </li>
                    <li>
                      <strong>Defina o Multiplicador de Lote:</strong>
                      <ul className="list-disc pl-5 mt-1 space-y-1 text-slate-400 text-[11px]">
                        <li><code>1.0x</code>: Abre o mesmo lote da Master.</li>
                        <li><code>2.0x</code>: Dobra o lote (Master 1 ➔ Slave 2).</li>
                        <li><code>0.5x</code>: Reduz à metade proporcional.</li>
                      </ul>
                    </li>
                    <li>
                      <strong>Filtro e Mapeamento de Ativos:</strong> Permite restringir os ativos (ex: operar somente NQ) ou mapear ativos entre contas (ex: Master opera <code>NQ</code> e Slaves com capital reduzido replicam no micro <code>MNQ</code>).
                    </li>
                    <li>
                      <strong>Copiar Estratégia ATM & Fechar Slaves:</strong> Mantenha marcadas as opções para garantir sincronização de Stop Loss, Take Profit e zeragem simultânea.
                    </li>
                    <li>
                      Clique em <strong>Salvar Regra</strong>. A regra é enviada em milissegundos para o NinjaTrader 8.
                    </li>
                  </ol>
                </div>

                {/* Bloco 6: Constituição de Risco e Regras Invioláveis */}
                <div className="bg-red-950/20 border border-red-500/30 p-5 rounded-xl space-y-3">
                  <h3 className="text-xs font-bold text-red-400 uppercase flex items-center gap-1.5 font-mono">
                    🛡️ 6. Constituição Operacional & Regras Invioláveis do Motor de Cópia
                  </h3>
                  <div className="space-y-2.5 text-xs text-slate-300">
                    <div className="bg-slate-950 p-3 rounded-lg border border-red-900/30 space-y-1">
                      <div className="font-bold text-red-300">1. Controle Estrito de Lote Máximo (`MaxLots`) Pré-Cópia</div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        • <strong>Na Master:</strong> Se a conta Master abrir lote acima do seu limite (ex: limite é 2 contratos, mas abriu 3), o sistema encerra imediatamente 1 contrato a mercado (<code>RiskLotCap</code>), ajusta as ordens de Stop e Take da Master para 2 contratos e <strong>somente após a confirmação do lote corrigido</strong> envia para as Slaves!<br />
                        • <strong>Na Slave:</strong> Caso o lote calculado pelo multiplicador exceda o <code>MaxLots</code> da Slave, a ordem na Slave <strong>já abre diretamente no teto máximo permitido</strong>, sem nunca expor a Slave a contratos excedentes.
                      </p>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-lg border border-red-900/30 space-y-1">
                      <div className="font-bold text-amber-300">2. Proibição Absoluta de Cópia sem Stop Loss e Take Profit</div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Se uma operação for aberta na Master sem ordens de proteção (SL e TP), o motor de cópia <strong>bloqueia imediatamente o envio para todas as Slaves</strong> e registra a rejeição na aba de auditoria. Suas contas de mesa proprietária nunca ficarão expostas a risco descontrolado.
                      </p>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-lg border border-red-900/30 space-y-1">
                      <div className="font-bold text-blue-300">3. Movimentação Dinâmica de Stops e Takes em Tempo Real</div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Qualquer alteração de preço do Stop Loss ou Take Profit na Master (arrastando a linha no gráfico, SuperDOM, Break-Even ou Trailing Stop) é sincronizada em tempo real para todas as Slaves, preservando vínculos OCO.
                      </p>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-lg border border-red-900/30 space-y-1">
                      <div className="font-bold text-purple-300">4. Zeragem Total Correta (100% dos Lotes das Slaves)</div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Quando a Master zera a posição ou o botão "Zerar Tudo" é clicado, o sistema consulta a quantidade <strong>real</strong> aberta na Slave (ex: 4 contratos quando a Master tinha 2 com multiplicador 2x) e encerra <strong>100% dos contratos da Slave</strong>, cancelando todas as ordens pendentes órfãs.
                      </p>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-lg border border-red-900/30 space-y-1">
                      <div className="font-bold text-cyan-300">5. Guardião de Segurança de 5 Segundos</div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        • Se restarem ordens pendentes órfãs sem posição a mercado após 5 segundos da zeragem, o sistema cancela todas automaticamente.<br />
                        • Se uma posição a mercado ficar aberta sozinha sem Stop Loss ativo por 5 segundos, o guardião a encerra a mercado preventivamente.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bloco 7: Recursos do Painel Web */}
                <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold text-purple-400 uppercase flex items-center gap-1.5 font-mono">
                    💻 7. Recursos do Painel Web (Axion Copy Dashboard)
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-white">Aba Regras (Rules)</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">Visualize suas contas Master agrupadas. Pause ou ative qualquer Slave com 1 clique (botão Play/Pause) ou acione "Zerar Tudo" para uma Master específica.</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-white">Aba Posições e Ordens (Positions)</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">Acompanhe em tempo real os contratos abertos, preço médio, PnL flutuante por conta e ordens trabalhando. Inclui botão de zeragem individual por ativo.</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-red-400">🚨 Botão de Pânico Geral (Flatten All)</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">Localizado no canto superior direito do painel. Em situações de alta volatilidade, notícias inesperadas ou falhas externas, clique para encerrar na hora 100% das posições e cancelar todas as ordens em todas as contas conectadas.</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-white">Aba Mensagens / Auditoria (Messages)</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">Histórico completo de auditoria filtrado por COPIADO, REJEITADO e ALERTA. Qualquer bloqueio por risco exibe o motivo detalhado com carimbo de horário.</div>
                    </div>
                  </div>
                </div>

                {/* Bloco 8: Telegram Bot */}
                <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold text-cyan-400 uppercase flex items-center gap-1.5 font-mono">
                    📱 8. Configuração do Bot do Telegram & Alertas nos Canais
                  </h3>
                  <ol className="list-decimal pl-5 text-xs text-slate-300 space-y-2 leading-relaxed">
                    <li>
                      <strong>Criar o Bot:</strong> No Telegram, pesquise por <code>@BotFather</code> e digite <code>/newbot</code>. Dê um nome e um username ao bot. Copie o <strong>Token HTTP API</strong> gerado.
                    </li>
                    <li>
                      <strong>Obter seu Chat ID:</strong> Procure pelo bot <code>@userinfobot</code> no Telegram para descobrir seu ID numérico (ex: <code>123456789</code>). Para grupos/canais, adicione seu bot como administrador e obtenha o ID do grupo (começa com sinal negativo <code>-100...</code>).
                    </li>
                    <li>
                      <strong>Configurar no Add-On:</strong> No NinjaTrader 8, abra a aba <strong>📱 Telegram</strong> do Add-On, insira o Token, o Chat ID e o Título das mensagens. Marque os alertas desejados (Abertura, Resultado em $ e pontos, Alertas de Risco) e clique em <strong>Testar Envio</strong>.
                    </li>
                  </ol>
                </div>
              </div>
            )}

            {/* TÓPICO 4: REPLAY DE MERCADO & SIMULADOR VISUAL */}
            {activeTopic === 'topic-4' && (
              <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
                <div>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded font-mono">
                    Módulo 4 • Backtesting Interativo
                  </span>
                  <h2 className="text-2xl font-black text-white mt-1">⏪ Replay de Mercado & Simulador Visual</h2>
                  <p className="text-xs text-slate-400">Treinamento operacional, backtesting visual com velocidade variável de 1x a 100x e boleta de simulação isolada.</p>
                </div>

                <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 space-y-2">
                  <h3 className="text-xs font-bold text-purple-400 uppercase flex items-center gap-1.5 font-mono">
                    💡 O que é a Estação de Replay (ReplayWorkstation)?
                  </h3>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    O <strong>Replay de Mercado</strong> permite reproduzir qualquer pregão histórico candle por candle com velocidade controlada. Você pode treinar leitura de fluxo, testar indicadores de volume e executar ordens em tempo real simulado fora do horário de mercado ou nos fins de semana.
                  </p>
                </div>

                <div className="space-y-4 text-xs">
                  <h3 className="text-sm font-bold text-slate-100 border-b border-slate-800 pb-2">
                    🎮 Principais Recursos e Controles do Replay:
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-purple-300 text-xs">📅 1. Seleção de Intervalo & Ativo</div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Escolha o ativo (NQ, ES, Gold, BTC), o timeframe gráfico (1m, 5m, etc.) e o período histórico desejado. O sistema carrega a base de dados histórica integral para o leitor de replay.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-blue-300 text-xs">⚡ 2. Velocidade Ajustável (1x a 100x)</div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Ajuste o ritmo da reprodução entre <strong>1x</strong> (tempo real), <strong>2x, 5x, 10x, 25x, 50x</strong> até <strong>100x</strong> para acelerar a formação dos candles e validar estratégias com rapidez.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-emerald-300 text-xs">⏭️ 3. Avanço Vela a Vela (Frame-by-Frame)</div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Com a reprodução pausada, utilize o botão <code>Passo a Passo (⏭️)</code> para avançar exatamente 1 candle por clique, analisando confluências técnicas detalhadamente antes de cada decisão.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-amber-300 text-xs">🎯 4. Boleta de Replay Flutuante</div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Execute ordens a mercado de Compra ou Venda com Stop Loss e Take Profit em pontos diretamente na tela de replay. O P&L e os alvos são computados em tempo real na velocidade selecionada.
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
                    <div className="font-bold text-cyan-400 text-xs">🏦 Contas Dedicadas de Replay</div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      As ordens executadas no Replay de Mercado utilizam contas do tipo Replay, garantindo que suas estatísticas de treinamento fiquem 100% isoladas do histórico de operações ao vivo das suas Contas Demonstrativas e Reais.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TÓPICO 5: CRIADOR DE ALGORITMOS & ROBÔS DINÂMICOS */}
            {activeTopic === 'topic-5' && (
              <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
                <div>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded font-mono">
                    Módulo 5 • Automação Quantitativa
                  </span>
                  <h2 className="text-2xl font-black text-white mt-1">🧠 Criador de Algoritmos & Robôs Dinâmicos</h2>
                  <p className="text-xs text-slate-400">Arquitetura completa do AlgorithmBuilder: Indicador vs Estratégia, Barra Fechada vs Realtime, Operadores e Account Binding.</p>
                </div>

                <div className="space-y-4 text-xs">
                  {/* PILARES: INDICADOR VS ESTRATÉGIA */}
                  <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                    <div className="font-bold text-white text-sm">⚖️ Os 2 Modos de Algoritmo: Indicador vs Estratégia</div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-slate-950 p-3.5 rounded-lg border border-blue-500/30 space-y-1.5">
                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded text-[9px] font-mono font-bold">
                          action: 'alert'
                        </span>
                        <div className="font-bold text-blue-400 text-xs">Modo INDICADOR</div>
                        <p className="text-slate-400 text-[10.5px] leading-relaxed">
                          • Emite alertas visuais no gráfico (marcadores e setas) e notificações sonoras/Telegram.<br />
                          • <strong>Sem Execução de Ordens</strong>: Não consome o limite diário de trades da conta.<br />
                          • <strong>Livre de Bloqueios de Risco</strong>: Não é travado por Stop Diário ou posições em andamento.
                        </p>
                      </div>

                      <div className="bg-slate-950 p-3.5 rounded-lg border border-emerald-500/30 space-y-1.5">
                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded text-[9px] font-mono font-bold">
                          action: 'position'
                        </span>
                        <div className="font-bold text-emerald-400 text-xs">Modo ESTRATÉGIA</div>
                        <p className="text-slate-400 text-[10.5px] leading-relaxed">
                          • Executa ordens autônomas de Compra/Venda na conta da corretora.<br />
                          • <strong>Governança Rigorosa de Risco</strong>: Valida limite de trades, Stop Diário, Posição Única por Ativo e horários permitidos.<br />
                          • Controle de concorrência com semáforos de memória seguros.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* MODOS DE EXECUÇÃO TEMPORAL */}
                  <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                    <div className="font-bold text-purple-300 text-sm">⏱️ Modos de Execução Temporal: Barra Fechada vs Barra Corrente</div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1">
                        <div className="font-bold text-purple-400 text-xs">🕯️ Barra Fechada (`closed`)</div>
                        <p className="text-slate-400 text-[10.5px] leading-relaxed">
                          A decisão é tomada sobre o <strong>candle anterior já consolidado</strong> (`targetCandle = length - 2`). Dispara exatamente 1 vez por vela recém-fechada via chave única de timestamp (`closedEvalKey`), eliminando repetições ou falsos rompimentos intradiários.
                        </p>
                      </div>

                      <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1">
                        <div className="font-bold text-amber-400 text-xs">⚡ Barra Corrente / Realtime (`realtime`)</div>
                        <p className="text-slate-400 text-[10.5px] leading-relaxed">
                          A decisão é calculada na <strong>vela em formação</strong> (`targetCandle = length - 1`) com o preço de mercado atual. Exige cooldown temporal (ex: 60s) para evitar que a oscilação do mesmo candle gere disparos múltiplos.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* OPERADORES: CRUZAMENTO VS NÍVEL */}
                  <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                    <div className="font-bold text-cyan-300 text-sm">🔀 Lógica de Condições: Cruzamento vs Nível Relacional</div>

                    <div className="space-y-2">
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <div className="font-bold text-cyan-400 text-xs">1. Operadores de Cruzamento (`cross_above` / `cross_below`)</div>
                        <p className="text-slate-400 text-[10.5px] mt-0.5 leading-relaxed">
                          Representam a <strong>transição de estado</strong> exata na barra: <code>A_atual &gt; B_atual E A_anterior &lt;= B_anterior</code>. Disparam **exclusivamente na barra do cruzamento** e não nas barras subsequentes.
                        </p>
                      </div>

                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <div className="font-bold text-blue-400 text-xs">2. Operadores Relacionais de Nível (`&gt;`, `&lt;`, `&gt;=`, `&lt;=`)</div>
                        <p className="text-slate-400 text-[10.5px] mt-0.5 leading-relaxed">
                          Permanecem válidos em **todas as barras** enquanto a condição persistir (ex: filtro de tendência onde <code>SMA_9 &gt; EMA_21</code>).
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* VÍNCULO COM CONTAS */}
                  <div className="bg-amber-950/20 border border-amber-500/30 p-4 rounded-xl space-y-1.5">
                    <div className="font-bold text-amber-400 text-xs">🔗 Regra de Vínculo Mandatório com Contas (Account Binding)</div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      Nenhum algoritmo roda solto no sistema. Ele <strong>somente executa se estiver explicitamente vinculado a pelo menos uma Conta ATIVA</strong> na Gestão de Contas (via botão <code>🤖 Robôs</code> no card da conta). Sem vínculo ativo, o algoritmo permanece em repouso sem consumir recursos.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TÓPICO 6: INDICADORES TÉCNICOS & VOLUME INSTITUCIONAL */}
            {activeTopic === 'topic-6' && (
              <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
                <div>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded font-mono">
                    Módulo 6 • Análise Técnica & Volume Institucional
                  </span>
                  <h2 className="text-2xl font-black text-white mt-1">🌡️ Indicadores Técnicos & Pacote de Volume Institucional</h2>
                  <p className="text-xs text-slate-400">Guia definitivo: Volume Heatmap, Auction Market Theory (VPOC, VAH, VAL, Naked POCs), Blocos HVN, PVA, Waddah Explosion, SMC e Templates.</p>
                </div>

                <div className="space-y-5 text-xs">
                  {/* GERENCIADOR DE TEMPLATES */}
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
                    <div className="font-bold text-amber-300 text-sm flex items-center gap-2">
                      ⚙️ Gerenciador Central de Indicadores & Templates
                    </div>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      No topo do gráfico, clique no botão <strong>⚙️ Indicadores</strong> para adicionar múltiplos indicadores simultâneos, ajustar parâmetros/cores em tempo real ou salvar suas combinações favoritas em <strong>Templates</strong> para aplicar com 1 clique em qualquer ativo.
                    </p>
                  </div>

                  {/* VOLUME HEATMAP */}
                  <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-cyan-400 text-sm flex items-center gap-2">
                        🌡️ 1. Zonas de Calor de Volume (Volume Heatmap)
                      </div>
                      <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded text-[9px] font-mono font-bold uppercase">
                        Overlay de Fundo
                      </span>
                    </div>

                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      Discretiza o gráfico em dezenas de faixas de preço (<em>price bins</em>) e calcula a densidade de contratos negociados. As regiões de maior acúmulo ganham cores vivas e opacidade destacada, enquanto vazios de liquidez permanecem escuros.
                    </p>

                    <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
                      <div className="font-bold text-slate-200 text-xs">🛠️ Parâmetros Detalhados:</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                        <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
                          <strong className="text-cyan-300">Lookback Histórico:</strong>
                          <p className="text-slate-400 mt-1 text-[10.5px]">De 1 dia (apenas a sessão anterior D-1) até 5 dias compostos projetados sobre o pregão atual.</p>
                        </div>
                        <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
                          <strong className="text-cyan-300">Temas Térmicos:</strong>
                          <p className="text-slate-400 mt-1 text-[10.5px]">Cyberpunk (Ciano-Magenta), Fire (Âmbar-Laranja-Vermelho), Plasma (Azul-Violeta-Amarelo) e Matrix (Verde fluorescente).</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AUCTION MARKET THEORY */}
                  <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-amber-400 text-sm flex items-center gap-2">
                        🏛️ 2. Níveis de Volume Institucional (VPOC, VAH, VAL & Naked POCs)
                      </div>
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[9px] font-mono font-bold uppercase">
                        Auction Market Theory
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                      <div className="bg-slate-950 p-3 rounded-lg border border-amber-500/30">
                        <div className="font-bold text-amber-400">🟡 VPOC (Volume Point of Control)</div>
                        <p className="text-slate-400 text-[10.5px] mt-1 leading-relaxed">Preço com maior volume da sessão anterior. Funciona como ímã central de liquidez e suporte/resistência maior.</p>
                      </div>
                      <div className="bg-slate-950 p-3 rounded-lg border border-cyan-500/30">
                        <div className="font-bold text-cyan-400">🔵 VAH (Value Area High - 70%)</div>
                        <p className="text-slate-400 text-[10.5px] mt-1 leading-relaxed">Teto da Área de Valor (70% do volume). Atua como forte resistência em consolidações.</p>
                      </div>
                      <div className="bg-slate-950 p-3 rounded-lg border border-purple-500/30">
                        <div className="font-bold text-purple-400">🟣 VAL (Value Area Low - 70%)</div>
                        <p className="text-slate-400 text-[10.5px] mt-1 leading-relaxed">Piso da Área de Valor. Atua como suporte de compra primário quando o preço retorna para testar a base de valor.</p>
                      </div>
                      <div className="bg-slate-950 p-3 rounded-lg border border-red-500/30">
                        <div className="font-bold text-red-400">🔴 Naked POCs (POCs Virgens)</div>
                        <p className="text-slate-400 text-[10.5px] mt-1 leading-relaxed">Níveis de VPOC anteriores que ainda não foram tocados. Apresentam probabilidade &gt;80% de busca pelo mercado.</p>
                      </div>
                    </div>

                    <div className="bg-amber-950/20 border border-amber-500/30 p-3 rounded-lg text-[11px] text-slate-300">
                      <strong className="text-amber-400">📊 Regra dos 80% da Value Area:</strong> Se o preço abrir fora da Value Area (acima de VAH ou abaixo de VAL) e fechar 2 candles consecutivos dentro dela, a probabilidade estatística de buscar o extremo oposto é de 80%!
                    </div>
                  </div>

                  {/* HVN BLOCKS, PVA, WADDAH, SMC */}
                  <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                    <div className="font-bold text-emerald-400 text-sm flex items-center gap-2">
                      📈 3. Demais Indicadores Técnicos Nativos
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <strong className="text-emerald-300">📦 HVN Blocks (High Volume Nodes):</strong>
                        <p className="text-slate-400 mt-1 text-[10.5px]">Caixas de absorção desenhadas nos picos de volume da sessão anterior para posicionamento de Stop Loss atrás da muralha institucional.</p>
                      </div>
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <strong className="text-emerald-300">🔥 PVA (Price Volume Analysis / PVSRA):</strong>
                        <p className="text-slate-400 mt-1 text-[10.5px]">Pinta candles com base em volume anormal: Verde/Rosa indicam Clímax institucional (200% do volume médio), Cinza/Azul são barras sem interesse.</p>
                      </div>
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <strong className="text-emerald-300">💥 e-MACD (Waddah Attar Explosion):</strong>
                        <p className="text-slate-400 mt-1 text-[10.5px]">Combinação de Bollinger e MACD. A linha amarela é a <em>Dead Zone</em>; opere somente quando as barras superarem essa linha.</p>
                      </div>
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <strong className="text-emerald-300">🧱 SMC (Smart Money Concepts) & TMA:</strong>
                        <p className="text-slate-400 mt-1 text-[10.5px]">Plota automaticamente Order Blocks (OB), BOS, CHoCH e canais TMA não-repintáveis para alvos de retorno à média.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TÓPICO 7: GERENCIADOR DE WIDGETS FLUTUANTES */}
            {activeTopic === 'topic-7' && (
              <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
                <div>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded font-mono">
                    Módulo 7 • Interface Flutuante
                  </span>
                  <h2 className="text-2xl font-black text-white mt-1">🧩 Gerenciador de Widgets Flutuantes do Gráfico</h2>
                  <p className="text-xs text-slate-400">Controle completo do WidgetsManagerModal e ChartWidgetsOverlay: Z-Score, Delta, Relógio Oficial, Painel de Posições, Notícias e M7 Tracker.</p>
                </div>

                <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 space-y-2">
                  <h3 className="text-xs font-bold text-cyan-400 uppercase flex items-center gap-1.5 font-mono">
                    💡 O que são os Widgets Flutuantes?
                  </h3>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    São cartões flutuantes sobrepostos ao gráfico que você pode ativar, desativar e reorganizar livremente. Eles entregam métricas quantitativas cruciais diretamente no seu campo visual sem precisar trocar de aba.
                  </p>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-blue-400 text-xs">⚡ 1. Acelerômetro Z-Score (Gauge)</div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Exibe o desvio estatístico do preço em formato de velocímetro: faixas verdes para normalidade, amarelas para atenção e vermelhas para esticadas extremas (&gt; +2.0 ou &lt; -2.0).
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-purple-400 text-xs">📊 2. Delta de Agressão em Tempo Real</div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Mede a pressão compradora vs vendedora líquida em contratos, destacando absorções e divergências de fluxo instantâneas.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-emerald-400 text-xs">⏰ 3. Relógio Oficial GMT-3 & Sessões Globais</div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Horário de Brasília em tempo real com status ativo das sessões mundiais: Ásia, Londres, Nova York e B3.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-amber-400 text-xs">🌐 4. M7 Tracker (Magníficas 7)</div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Variação percentual ao vivo das 7 gigantes: NVDA, AAPL, MSFT, AMZN, GOOGL, META e TSLA, antecipando movimentações no índice Nasdaq.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-cyan-400 text-xs">💼 5. Painel de Posições Ativas</div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Card com P&L flutuante em dólares, preço de entrada, alvos e botão de encerramento rápido a mercado com 1 clique.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="font-bold text-red-400 text-xs">📰 6. Contador de Notícias (News Countdown)</div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Contagem regressiva em minutos para a próxima notícia de alto impacto (3 estrelas), prevenindo entradas desavisadas em momentos de alta volatilidade.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TÓPICO 8: GRÁFICO, BOLETA, DESENHOS & ESTRATÉGIAS ATM */}
            {activeTopic === 'topic-8' && (
              <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
                <div>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded font-mono">
                    Módulo 8 • Execução & Gráfico
                  </span>
                  <h2 className="text-2xl font-black text-white mt-1">🎮 Gráfico Interativo, Boleta, Desenhos & Estratégias ATM</h2>
                  <p className="text-xs text-slate-400">Navegação em timeframes, ferramentas de desenho, boleta manual e gestão avançada de ordens ATM (Alvos Parciais, Break-Even e Trailing Stop).</p>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
                    <div className="font-bold text-blue-300 text-xs">📈 1. Timeframes & Ferramentas de Desenho</div>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      Alterne instantaneamente entre timeframes (<strong>1m, 3m, 5m, 15m, 1h, 4h, Diário</strong>). Na barra lateral de ferramentas, utilize linhas de tendência, canais, retângulos, projeções de Fibonacci e caixas de texto para mapear suas confluências gráficas.
                    </p>
                  </div>

                  <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                    <div className="font-bold text-emerald-400 text-sm flex items-center gap-2">
                      🛡️ 2. Estratégias ATM (Advanced Trade Management)
                    </div>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      As regras de ATM automatizam a proteção do capital e a realização de lucros assim que uma ordem é executada:
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <strong className="text-emerald-300">🎯 Alvos Parciais (TP1, TP2, TP3):</strong>
                        <p className="text-slate-400 mt-1 text-[10.5px]">Encerra frações da posição (ex: 50% em 20 pts, 30% em 40 pts e 20% no alvo final), garantindo lucro no bolso.</p>
                      </div>

                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <strong className="text-blue-300">🔒 Auto Break-Even:</strong>
                        <p className="text-slate-400 mt-1 text-[10.5px]">Move o Stop Loss automaticamente para o preço de entrada (ou entrada + 1 pt) assim que o trade atinge X pontos de lucro.</p>
                      </div>

                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <strong className="text-purple-300">🏃 Dynamic Trailing Stop:</strong>
                        <p className="text-slate-400 mt-1 text-[10.5px]">Stop móvel dinâmico que persegue o preço a uma distância fixa, travando o ganho conforme o ativo expande a tendência.</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
                    <div className="font-bold text-white text-xs">🎯 3. Boleta Manual no Rodapé com Validação da IA</div>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      Selecione a <strong>Conta de Negociação</strong>, defina o número de contratos/lotes, Stop Loss e Take Profit em pontos e clique em <span className="text-green-400 font-bold">COMPRA</span> ou <span className="text-red-400 font-bold">VENDA</span>. Se a opção <em>"Validação Inteligente da IA"</em> estiver ativa, o modelo verifica a confluência técnica antes de liberar a ordem.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TÓPICO 9: IA, COPILOT & 4 MODOS DE DISPARO */}
            {activeTopic === 'topic-9' && (
              <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
                <div>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded font-mono">
                    Módulo 9 • Inteligência Artificial
                  </span>
                  <h2 className="text-2xl font-black text-white mt-1">🤖 Inteligência Artificial, Copilot & 4 Modos de Disparo</h2>
                  <p className="text-xs text-slate-400">Entenda os acionamentos por Tempo, Alerta, Barra a Barra, Notícias, o Chat Copilot Contextual e a validação de risco.</p>
                </div>

                <div className="space-y-3 text-xs">
                  <h3 className="text-sm font-bold text-slate-100 border-b border-slate-800 pb-2">
                    ⚡ Os 4 Modos de Acionamento da IA:
                  </h3>

                  <div className="space-y-2">
                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1">
                      <div className="font-bold text-blue-400">⏱️ 1. Por Tempo (Ciclo Fixo em Segundos)</div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        A IA executa uma análise periódica a cada X segundos (configurável, ex: 30s). Ideal para monitoramento contínuo em mercados de alta frequência.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1">
                      <div className="font-bold text-amber-400">⚡ 2. Por Alerta (Modo Reativo Economizador)</div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        A IA permanece em modo de espera e **só é disparada quando ocorre um pico de volatilidade** (Z-Score ou Delta ultrapassam os limites configurados). Economiza consumo de tokens na API.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1">
                      <div className="font-bold text-purple-400">🕯️ 3. Barra a Barra (Fechamento Exato do Candle)</div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        A IA aguarda a conclusão exata do candle no timeframe selecionado e dispara a análise no milissegundo de abertura da nova vela.
                      </p>
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-1">
                      <div className="font-bold text-red-400">📰 4. Reativo por Notícias Econômicas</div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        Monitora o calendário macroeconômico e aciona a IA minutos antes (ex: 5m antes), no momento exato e após divulgações de alto impacto (CPI, Payroll, FOMC).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-purple-300">💬 Copilot Contextual & Chat Integrado</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Abra o Copilot lateral a qualquer momento para conversar com a IA sobre o cenário atual. O Copilot lê automaticamente o livro de opções (GEX), o gráfico em tempo real, os níveis de volume e responde com análises probabilísticas estruturadas.
                  </p>
                </div>
              </div>
            )}

            {/* TÓPICO 10: CENTRAL DE ALERTAS & TELEGRAM */}
            {activeTopic === 'topic-10' && (
              <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
                <div>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded font-mono">
                    Módulo 10 • Alertas & Bot
                  </span>
                  <h2 className="text-2xl font-black text-white mt-1">🔔 Central de Alertas & Notificações no Telegram</h2>
                  <p className="text-xs text-slate-400">Como configurar gatilhos estatísticos de Z-Score, GEX, notícias e receber relatórios no celular via Telegram Bot.</p>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
                    <div className="font-bold text-yellow-400 text-xs">⚡ Configuração de Gatilhos de Alerta</div>
                    <ul className="list-disc pl-5 text-slate-300 space-y-1.5 text-[11px]">
                      <li><strong>Gatilho Z-Score</strong>: Dispara quando o preço sofre esticada estatística (ex: &lt; -2.0 ou &gt; +2.0).</li>
                      <li><strong>Gatilho Delta de Agressão</strong>: Dispara quando a agressão compradora/vendedora supera o volume configurado.</li>
                      <li><strong>Gatilho Gamma Levels</strong>: Notifica quando o preço encosta em suportes (Put 0DTE, BL 7-10) ou resistências (Call 0DTE, GEX 7-10).</li>
                      <li><strong>Gatilho de Notícias</strong>: Emite aviso prévio 5 a 15 minutos antes de eventos de 3 estrelas.</li>
                    </ul>
                  </div>

                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
                    <div className="font-bold text-blue-400 text-xs">✈️ Configuração do Bot do Telegram</div>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      Acesse a tela <strong>Alertas</strong>, insira seu <code>Telegram Bot Token</code> e seu <code>Telegram Chat ID</code>. Clique em "Testar Notificação". Ao ativar, o sistema enviará relatórios com dados do trade, preços de entrada, Stop Loss e Take Profit direto no seu grupo ou conversa privada do Telegram.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TÓPICO 11: CONECTORES NINJATRADER 8 & MT5 */}
            {activeTopic === 'topic-11' && (
              <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
                <div>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded font-mono">
                    Módulo 11 • Conectores Externos
                  </span>
                  <h2 className="text-2xl font-black text-white mt-1">🔌 Conectores NinjaTrader 8 & MetaTrader 5</h2>
                  <p className="text-xs text-slate-400">Como conectar o robô externo C# (VMBot) às suas contas de negociação através do Account ID.</p>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                    <h3 className="font-bold text-white text-xs">📋 Tutorial Completo de Integração NinjaTrader 8:</h3>
                    
                    <ol className="list-decimal pl-5 text-slate-300 space-y-2.5 leading-relaxed text-[11.5px]">
                      <li>
                        <strong>Copiar o Account ID no Vortex:</strong><br />
                        Acesse a tela <strong>Gestão de Contas</strong> e localize a conta desejada. Clique no botão <code>📋 Copiar Account ID</code> (código em formato UUID, ex: <code>b8a91234-5678-4abc...</code>).
                      </li>
                      <li>
                        <strong>Abrir as Propriedades da Estratégia no NinjaTrader 8:</strong><br />
                        No NinjaTrader 8, vá ao menu <em>Strategies</em> e adicione a estratégia <code>VMBot.cs</code>, <code>VMBotD.cs</code> ou <code>VMBotF.cs</code>.
                      </li>
                      <li>
                        <strong>Cole o ID no Campo `VM_PainelId`:</strong><br />
                        No parâmetro <code>VM_PainelId / Account ID</code>, cole o código UUID copiado.
                      </li>
                      <li>
                        <strong>Filtro Opcional de Estratégia (`VM_StrategyId`):</strong><br />
                        Se quiser que o robô escute apenas uma estratégia específica, informe o <code>Strategy ID</code>. Se deixar em branco, ele executará todas as ordens destinadas àquela conta.
                      </li>
                    </ol>
                  </div>

                  <div className="bg-blue-950/30 border border-blue-500/30 p-4 rounded-xl space-y-1">
                    <div className="font-bold text-blue-300">💡 Consulta Inteligente OR no C#</div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      Os robôs C# possuem consulta inteligente compatível com o novo **Account ID** e o **Panel ID** legado, garantindo roteamento transparente de ordens manuais, algorítmicas e de IA.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TÓPICO 12: ANÁLISE DE DESEMPENHO & HISTÓRICOS */}
            {activeTopic === 'topic-12' && (
              <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
                <div>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded font-mono">
                    Módulo 12 • Analytics & Históricos
                  </span>
                  <h2 className="text-2xl font-black text-white mt-1">📈 Análise de Desempenho & Sincronização de Históricos</h2>
                  <p className="text-xs text-slate-400">Como sincronizar o histórico do NinjaTrader 8 (Modo Dia, Histórico e Delta Sync), auditar trades reais, analisar métricas e exportar relatórios.</p>
                </div>

                {/* 1. Performance em Tempo Real no Copy Dashboard */}
                <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 space-y-2">
                  <h3 className="text-xs font-bold text-emerald-400 uppercase flex items-center gap-1.5 font-mono">
                    💡 1. Monitoramento de Performance em Tempo Real (Copy Dashboard)
                  </h3>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    Na aba <strong>📊 Performance das Contas</strong> do <strong>Copy Trading Dashboard</strong>, o sistema conecta-se diretamente à memória de execução do NinjaTrader 8 e exibe para cada conta ativa:
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-center">
                      <div className="text-[10px] text-slate-400 uppercase font-mono">Saldo Líquido</div>
                      <div className="font-bold text-white text-xs mt-0.5">Cash Value</div>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-center">
                      <div className="text-[10px] text-slate-400 uppercase font-mono">Margem Livre</div>
                      <div className="font-bold text-blue-400 text-xs mt-0.5">Buying Power</div>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-center">
                      <div className="text-[10px] text-slate-400 uppercase font-mono">PnL Fechado</div>
                      <div className="font-bold text-emerald-400 text-xs mt-0.5">Realized PnL</div>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-center">
                      <div className="text-[10px] text-slate-400 uppercase font-mono">PnL Aberto</div>
                      <div className="font-bold text-amber-400 text-xs mt-0.5">Unrealized PnL</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    Abaixo dos medidores, uma tabela detalhada exibe cada trade individualmente: <strong>Ativo, Lado (BUY/SELL), Contratos, Preço de Entrada, Preço de Saída, Lucro em Moeda (US$), Lucro em Pontos/Ticks, Comissões e Horários</strong>.
                  </p>
                </div>

                {/* 2. Como Sincronizar Históricos do NinjaTrader 8 */}
                <div className="bg-blue-950/20 border border-blue-500/30 p-5 rounded-xl space-y-3">
                  <h3 className="text-xs font-bold text-blue-400 uppercase flex items-center gap-1.5 font-mono">
                    🔄 2. Como Sincronizar Históricos e Execuções Reais do NinjaTrader 8
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    No menu <strong>Relatório de Desempenho (Strategy Report)</strong>, você pode puxar todo o histórico gravado no banco de dados SQLite interno do NinjaTrader para auditoria estatística:
                  </p>
                  <div className="space-y-2.5 text-xs">
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-cyan-300">A. Modo Dia (`day`):</div>
                      <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                        Puxa as execuções da sessão atual e do dia anterior com reconciliação imediata de PnL diário. Ideal para conferir os resultados logo após o fechamento do pregão.
                      </p>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-purple-300">B. Modo Histórico por Período (`history`):</div>
                      <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                        Permite selecionar uma data inicial (<code>startDate</code>) e final (<code>endDate</code>). O sistema vasculha o banco de dados do NinjaTrader e importa semanas ou meses inteiros de trades passados.
                      </p>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-emerald-300">C. Sincronização Inteligente Incremental (Delta Sync):</div>
                      <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                        Ao clicar em sincronizar, o Vortex identifica a data do trade mais recente já salvo no seu histórico e solicita ao NinjaTrader apenas as operações ocorridas após essa data (<code>since</code>), evitando duplicidade e economizando tempo de processamento.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3. Métricas e KPIs */}
                <div className="space-y-3 text-xs">
                  <h3 className="text-sm font-bold text-slate-100 border-b border-slate-800 pb-2">
                    📊 3. Métricas Matemáticas e KPIs Institucionais
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-green-400">Resultado Líquido Total (US$)</div>
                      <p className="text-slate-400 text-[10.5px] mt-0.5">Soma financeira de todos os lucros e prejuízos encerrados após o desconto de comissões da corretora.</p>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-blue-400">Taxa de Acerto (Win Rate %)</div>
                      <p className="text-slate-400 text-[10.5px] mt-0.5">Percentual exato de operações que encerraram no ganho em relação ao total de operações finalizadas.</p>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-purple-400">Fator de Lucro (Profit Factor)</div>
                      <p className="text-slate-400 text-[10.5px] mt-0.5">Divisão entre o Lucro Bruto e o Prejuízo Bruto. Valores superiores a 1.5 indicam alta consistência estatística.</p>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-amber-400">Payoff Ratio (Média Ganho / Perda)</div>
                      <p className="text-slate-400 text-[10.5px] mt-0.5">Relação entre o valor médio dos trades vencedores e o valor médio dos trades perdedores.</p>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-red-400">Drawdown Máximo Absoluto</div>
                      <p className="text-slate-400 text-[10.5px] mt-0.5">A maior queda percentual e financeira do capital a partir de um topo da Curva de Equity. Fundamental para aprovação em mesas.</p>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="font-bold text-cyan-400">Curva de Capital (Equity Curve)</div>
                      <p className="text-slate-400 text-[10.5px] mt-0.5">Gráfico contínuo da evolução patrimonial da conta trade a trade, facilitando a identificação de fases de estagnação ou crescimento.</p>
                    </div>
                  </div>
                </div>

                {/* 4. Exportação */}
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-blue-300 text-xs">📥 Exportação Completa para Planilhas (CSV / Excel)</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Clique em <code>Exportar CSV</code> para baixar uma planilha contendo a data, horário com segundos, conta, ativo, preços de entrada e saída, Stop Loss, Take Profit e lucro líquido de cada trade para declaração de IR ou prestação de contas.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TÓPICO 13: OTIMIZAÇÃO DE GPU & BACKGROUND VPS */}
            {activeTopic === 'topic-13' && (
              <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
                <div>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded font-mono">
                    Módulo 13 • Performance & VPS
                  </span>
                  <h2 className="text-2xl font-black text-white mt-1">⚡ Otimização de GPU, Background Workers & VPS 24/7</h2>
                  <p className="text-xs text-slate-400">Configurações para garantir execução ininterrupta sem congelamento do navegador ou da máquina virtual.</p>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
                    <div className="font-bold text-slate-200 text-xs">💻 1. Aceleração de Hardware (Uso da Placa de Vídeo)</div>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      No navegador (Chrome/Brave/Edge), acesse <code>Configurações ➔ Sistema</code> e ative <strong>"Usar aceleração de hardware quando disponível"</strong>. Isso transfere a renderização do gráfico do processador (CPU) para a placa de vídeo (GPU).
                    </p>
                  </div>

                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
                    <div className="font-bold text-slate-200 text-xs">☕ 2. Exceção do Economizador de Memória (Memory Saver)</div>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      Navegadores modernos congelam abas em segundo plano. Para evitar que loops de robôs parem: vá em <code>Configurações ➔ Desempenho</code> e adicione o endereço do Vortex na lista de exceções do Economizador de Memória.
                    </p>
                  </div>

                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
                    <div className="font-bold text-slate-200 text-xs">🗔 3. Prioridade de Janela em Servidores VPS</div>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      Em servidores VPS, não minimize a janela do navegador na barra de tarefas. Mantenha a janela maximizada para que o Windows Server priorize as threads da aplicação.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TÓPICO 14: GLOSSÁRIO EXAUSTIVO DE A A Z */}
            {activeTopic === 'topic-14' && (
              <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
                <div>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded font-mono">
                    Módulo 14 • Dicionário Técnico
                  </span>
                  <h2 className="text-2xl font-black text-white mt-1">📚 Glossário Exaustivo de Termos de A a Z</h2>
                  <p className="text-xs text-slate-400">Dicionário técnico completo cobrindo todos os conceitos quantitativos, institucionais e de plataforma.</p>
                </div>

                <div className="grid grid-cols-1 gap-2 text-xs">
                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-bold text-blue-400 font-mono text-xs">Account ID:</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">Identificador universal único em formato UUID de uma Conta de Negociação no Vortex. Usado para conectar robôs externos em C# (NinjaTrader 8 / MT5).</div>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-bold text-cyan-400 font-mono text-xs">Auction Market Theory (Teoria do Mercado de Leilão):</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">Modelo conceitual que estuda a formação de valor do preço através da distribuição de volume (VPOC, VAH, VAL).</div>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-bold text-emerald-400 font-mono text-xs">Auto Break-Even:</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">Regra de proteção que desloca automaticamente o Stop Loss para o preço de entrada assim que a operação alcança X pontos de lucro.</div>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-bold text-amber-400 font-mono text-xs">BL (Buy/Sell Liquidity Level):</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">Níveis de suporte ou resistência baseados em concentradores de liquidez no livro de opções. Níveis 7-10 indicam regiões de altíssima probabilidade de defesa.</div>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-bold text-purple-400 font-mono text-xs">BOS & CHoCH (Smart Money Concepts):</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">BOS (Break of Structure) indica a continuação de uma tendência e CHoCH (Change of Character) sinaliza a reversão estrutural de tendência do mercado.</div>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-bold text-yellow-400 font-mono text-xs">Copy Trading Master / Slave:</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">Arquitetura onde a conta Master executa a ordem original e o sistema replica a operação proporcionalmente em todas as contas Slave filhas.</div>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-bold text-purple-300 font-mono text-xs">Delta de Agressão:</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">Saldo líquido entre agressões de compra (no preço de ask) e agressões de venda (no preço de bid).</div>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-bold text-emerald-400 font-mono text-xs">Drawdown Trailing (High-Watermark):</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">Modalidade onde o limite máximo de perda acompanha o topo de equity mais alto alcançado pela conta no dia.</div>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-bold text-red-400 font-mono text-xs">Drawdown End-Of-Day (EOD):</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">Modalidade onde o limite de perda é recalculado apenas no encerramento da sessão diária anterior.</div>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-bold text-purple-400 font-mono text-xs">GEX (Gamma Exposure):</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">Métrica quantitativa que expressa a exposição gama dos formadores de mercado (Market Makers) em cada nível de strike.</div>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-bold text-blue-300 font-mono text-xs">HVN (High Volume Nodes):</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">Picos de alto volume acumulado onde ocorreu forte troca de contratos, formando blocos de suporte e resistência.</div>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-bold text-red-400 font-mono text-xs">Naked POC:</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">Nível de VPOC histórico que ainda não foi revisitado pelo preço. Atua como forte ímã de liquidez.</div>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-bold text-emerald-300 font-mono text-xs">PVA / PVSRA (Price Volume Analysis):</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">Metodologia de coloração de candles para identificar intervenção institucional clímax e absorção de mercado.</div>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-bold text-purple-400 font-mono text-xs">Replay de Mercado:</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">Simulador visual interativo para reproduzir sessões históricas com velocidade variável de 1x a 100x e boleta de ordens dedicada.</div>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-bold text-amber-400 font-mono text-xs">VAH / VAL (Value Area High / Low):</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">Limites superior (VAH) e inferior (VAL) da região que engloba 70% do volume negociado na sessão anterior.</div>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-bold text-cyan-400 font-mono text-xs">VIX (CBOE Volatility Index):</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">Índice da volatilidade implícita das opções do S&P 500, conhecido como o "termômetro do medo" do mercado global.</div>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-bold text-yellow-300 font-mono text-xs">VPOC (Volume Point of Control):</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">O nível exato de preço com maior volume financeiro e de contratos de toda a sessão de leilão.</div>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <div className="font-bold text-blue-300 font-mono text-xs">Z-Score:</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">Número de desvios padrão que o preço atual se encontra em relação à sua média móvel de volume ponderada.</div>
                  </div>
                </div>
              </div>
            )}

          </div>

        </div>
      ) : (
        

        <div className="glass p-6 rounded-xl border border-slate-700 text-slate-200 relative overflow-hidden space-y-6">
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <div>
              <h2 className="text-xl font-bold text-purple-400 flex items-center gap-2">
                📊 Estrutura de Mercado Gamma Levels (Opções Institucionais)
              </h2>
              <p className="text-[11px] text-slate-400">
                Apresentação Interativa — Pressione as setas do teclado (◀ ▶) ou use os botões abaixo.
              </p>
            </div>
            <div className="text-xs font-mono bg-slate-900/60 py-1 px-3 rounded-full border border-slate-800 text-slate-400">
              Slide {currentSlide} de {totalSlides}
            </div>
          </div>

          <div className="min-h-[480px] flex flex-col justify-between">
            {/* Slide 1 */}
            {currentSlide === 1 && (
              <div className="space-y-4 animate-[fadeIn_0.4s_ease-out]">
                <h3 className="text-center text-lg font-bold text-slate-100">O Mapa do Mercado Institucional</h3>
                <div className="chart-container">
                  <div className="chart-title">Como o Mercado Realmente se Move</div>
                  <svg viewBox="0 0 800 400" className="w-full max-w-[800px] h-auto">
                    <rect width="800" height="400" fill="#0b0f19" rx="14" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
                    <line x1="50" y1="200" x2="750" y2="200" stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>
                    <line x1="400" y1="50" x2="400" y2="350" stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>
                    
                    <rect x="50" y="60" width="200" height="130" fill="url(#blueGradManual)" rx="10"/>
                    <text x="150" y="105" textAnchor="middle" fill="white" fontSize="16" fontWeight="800" letterSpacing="0.05em">MARKET</text>
                    <text x="150" y="130" textAnchor="middle" fill="white" fontSize="16" fontWeight="800" letterSpacing="0.05em">MAKERS</text>
                    <text x="150" y="155" textAnchor="middle" fill="#93c5fd" fontSize="12">(Grandes Bancos)</text>
                    
                    <path d="M 250 95 L 320 85" stroke="#60a5fa" strokeWidth="3" fill="none" markerEnd="url(#arrowheadManual)"/>
                    <path d="M 250 155 L 320 235" stroke="#60a5fa" strokeWidth="3" fill="none" markerEnd="url(#arrowheadManual)"/>
                    
                    <rect x="320" y="50" width="150" height="60" fill="url(#pinkGradManual)" rx="8"/>
                    <text x="395" y="86" textAnchor="middle" fill="white" fontSize="15" fontWeight="700">CALLS</text>
                    
                    <rect x="320" y="210" width="150" height="60" fill="url(#cyanGradManual)" rx="8"/>
                    <text x="395" y="246" textAnchor="middle" fill="white" fontSize="15" fontWeight="700">PUTS</text>
                    
                    <path d="M 470 80 Q 550 80, 550 140 L 550 200" stroke="#f43f5e" strokeWidth="2.5" fill="none" strokeDasharray="5,3" markerEnd="url(#arrowheadRedManual)"/>
                    <text x="565" y="145" fill="#f43f5e" fontSize="11" fontWeight="700">HEDGE</text>
                    
                    <path d="M 470 240 Q 550 240, 550 180 L 550 140" stroke="#10b981" strokeWidth="2.5" fill="none" strokeDasharray="5,3" markerEnd="url(#arrowheadGreenManual)"/>
                    
                    <rect x="600" y="100" width="160" height="110" fill="url(#purpleGradManual)" rx="10"/>
                    <text x="680" y="140" textAnchor="middle" fill="white" fontSize="16" fontWeight="800">FUTURES</text>
                    <text x="680" y="165" textAnchor="middle" fill="#e9d5ff" fontSize="14" fontWeight="600">NASDAQ</text>
                    <text x="680" y="190" textAnchor="middle" fill="#c084fc" fontSize="11">(Preço se move)</text>
                    
                    <rect x="50" y="295" width="710" height="85" fill="#1e293b" rx="10" stroke="rgba(245, 158, 11, 0.3)" strokeWidth="1.5"/>
                    <text x="75" y="325" fill="#fbbf24" fontSize="13" fontWeight="700">💡 CONCEITO CHAVE:</text>
                    <text x="75" y="347" fill="#cbd5e1" fontSize="12">Os Market Makers são OBRIGADOS a se proteger (fazer hedge) quando vendem opções de índices.</text>
                    <text x="75" y="365" fill="#cbd5e1" fontSize="12">Essa proteção cria barreiras invisíveis de compra/venda que nós rastreamos para surfar com os robôs!</text>
                    
                    <defs>
                      <linearGradient id="blueGradManual" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#1d4ed8" />
                      </linearGradient>
                      <linearGradient id="pinkGradManual" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#ec4899" />
                          <stop offset="100%" stopColor="#db2777" />
                      </linearGradient>
                      <linearGradient id="cyanGradManual" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#06b6d4" />
                          <stop offset="100%" stopColor="#0891b2" />
                      </linearGradient>
                      <linearGradient id="purpleGradManual" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#8b5cf6" />
                          <stop offset="100%" stopColor="#6d28d9" />
                      </linearGradient>
                      <marker id="arrowheadManual" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                          <polygon points="0 0, 6 3, 0 6" fill="#60a5fa"/>
                      </marker>
                      <marker id="arrowheadRedManual" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                          <polygon points="0 0, 6 3, 0 6" fill="#f43f5e"/>
                      </marker>
                      <marker id="arrowheadGreenManual" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                          <polygon points="0 0, 6 3, 0 6" fill="#10b981"/>
                      </marker>
                    </defs>
                  </svg>
                </div>
                <div className="highlight-blue">
                  <strong>Nossa Vantagem:</strong> Não tentamos adivinhar para onde o preço vai. Nós enxergamos exatamente os patamares de preço onde os robôs dos grandes bancos são forçados a comprar ou vender!
                </div>
              </div>
            )}

            {/* Slide 2 */}
            {currentSlide === 2 && (
              <div className="space-y-4 animate-[fadeIn_0.4s_ease-out]">
                <h3 className="text-center text-lg font-bold text-slate-100">🗺️ Níveis de Gama: Do Papel ao Concreto Armado</h3>
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 text-center shadow-inner">
                  <div className="text-xs uppercase font-bold text-slate-400 mb-3 tracking-wider">Como Diferenciar Níveis Fracos vs. Barreiras Institucionais</div>
                  <svg viewBox="0 0 900 420" className="w-full h-auto">
                    <rect width="900" height="420" fill="#0b0f19" rx="14" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
                    <line x1="50" y1="60" x2="850" y2="60" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4,4"/>
                    <line x1="50" y1="180" x2="850" y2="180" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4,4"/>
                    <line x1="50" y1="300" x2="850" y2="300" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4,4"/>
                    
                    <path d="M 50 340 Q 150 280, 250 310 T 450 240 T 650 200 T 850 140" stroke="#3b82f6" strokeWidth="3.5" fill="none" opacity="0.85"/>
                    
                    <g opacity="0.8">
                        <rect x="180" y="295" width="110" height="24" fill="#fbbf24" rx="4"/>
                        <text x="235" y="311" textAnchor="middle" fill="#1e293b" fontSize="11" fontWeight="700">BL 3 (Papel)</text>
                        <rect x="380" y="225" width="110" height="24" fill="#fbbf24" rx="4"/>
                        <text x="435" y="241" textAnchor="middle" fill="#1e293b" fontSize="11" fontWeight="700">GEX 2 (Papel)</text>
                    </g>
                    
                    <g>
                        <rect x="580" y="185" width="120" height="28" fill="#ef4444" rx="4"/>
                        <text x="640" y="203" textAnchor="middle" fill="white" fontSize="11" fontWeight="800">BL 9 (Concreto)</text>
                        <rect x="730" y="125" width="120" height="28" fill="#ef4444" rx="4"/>
                        <text x="790" y="143" textAnchor="middle" fill="white" fontSize="11" fontWeight="800">GEX 10 (Concreto)</text>
                    </g>
                    
                    <rect x="60" y="335" width="130" height="50" fill="rgba(16, 185, 129, 0.15)" rx="6" stroke="#10b981" strokeWidth="1.5"/>
                    <text x="125" y="355" textAnchor="middle" fill="#10b981" fontSize="12" fontWeight="800">PUT 0DTE</text>
                    <text x="125" y="372" textAnchor="middle" fill="#6ee7b7" fontSize="10">(Suporte Diário)</text>
                    
                    <rect x="710" y="20" width="140" height="50" fill="rgba(236, 72, 153, 0.15)" rx="6" stroke="#ec4899" strokeWidth="1.5"/>
                    <text x="780" y="40" textAnchor="middle" fill="#ec4899" fontSize="12" fontWeight="800">CALL 0DTE</text>
                    <text x="780" y="57" textAnchor="middle" fill="#f472b6" fontSize="10">(Resistência Diária)</text>
                    
                    <rect x="420" y="325" width="130" height="60" fill="rgba(6, 182, 212, 0.15)" rx="6" stroke="#06b6d4" strokeWidth="1.5" strokeDasharray="4,2"/>
                    <text x="485" y="350" textAnchor="middle" fill="#06b6d4" fontSize="13" fontWeight="800">HVL</text>
                    <text x="485" y="368" textAnchor="middle" fill="#67e8f9" fontSize="10">(Alta Liquidez)</text>
                    
                    <circle cx="640" cy="200" r="6" fill="#ef4444" stroke="#ffffff" strokeWidth="2"/>
                    <path d="M 645 200 L 700 175" stroke="#ef4444" strokeWidth="1.5"/>
                    <text x="705" y="173" fill="#fca5a5" fontSize="11" fontWeight="700">PREÇO RETRAI/DEFENDE</text>
                    
                    <circle cx="235" cy="309" r="5" fill="#fbbf24" stroke="#ffffff" strokeWidth="1.5"/>
                    <path d="M 239 309 L 280 335" stroke="#fbbf24" strokeWidth="1.5"/>
                    <text x="285" y="347" fill="#fde047" fontSize="11">ROMPIMENTO FÁCIL</text>
                  </svg>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <h4 className="font-bold text-amber-400 flex items-center gap-1.5">📍 BL & GEX 1-4</h4>
                    <p className="text-slate-400 text-[11px] leading-relaxed">Níveis fracos baseados em poucos contratos. O preço costuma furar sem dificuldades. Não compre ou venda neles.</p>
                  </div>
                  <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <h4 className="font-bold text-red-400 flex items-center gap-1.5">🧱 BL & GEX 7-10</h4>
                    <p className="text-slate-400 text-[11px] leading-relaxed">Barreiras reais ("concreto armado"). Regiões com grande acúmulo de proteção dos bancos. Alvos ideais para operações.</p>
                  </div>
                  <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <h4 className="font-bold text-emerald-400 flex items-center gap-1.5">⚡ Zonas 0DTE</h4>
                    <p className="text-slate-400 text-[11px] leading-relaxed">Opções com vencimento no dia. Geram defesas brutais e rápidas para segurar o preço antes do fechamento do mercado.</p>
                  </div>
                  <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <h4 className="font-bold text-cyan-400 flex items-center gap-1.5">🌊 HVL (High Volume)</h4>
                    <p className="text-slate-400 text-[11px] leading-relaxed">Preço Histórico de Alto Volume. Funciona como um poderoso ímã de liquidez que desacelera a velocidade do preço.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Slide 3 */}
            {currentSlide === 3 && (
              <div className="space-y-4 animate-[fadeIn_0.4s_ease-out]">
                <h3 className="text-center text-lg font-bold text-slate-100">🌍 O Filtro Macro - A "Gravidade" do Mercado</h3>
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 text-center shadow-inner">
                  <div className="text-xs uppercase font-bold text-slate-400 mb-3 tracking-wider">Correlações Intermercados que Movem o Nasdaq</div>
                  <svg viewBox="0 0 900 500" className="w-full h-auto">
                    <rect width="900" height="500" fill="#0b0f19" rx="14" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
                    
                    {/* Central Nasdaq Core */}
                    <circle cx="450" cy="250" r="75" fill="url(#blueGradManual)" stroke="rgba(255,255,255,0.2)" strokeWidth="2"/>
                    <text x="450" y="245" textAnchor="middle" fill="white" fontSize="18" fontWeight="800" letterSpacing="0.05em">NASDAQ</text>
                    <text x="450" y="265" textAnchor="middle" fill="#93c5fd" fontSize="13" fontWeight="600">(QQQ)</text>
                    
                    {/* VIX - Inverse Correlation */}
                    <circle cx="200" cy="120" r="60" fill="url(#redGradManual)" />
                    <text x="200" y="115" textAnchor="middle" fill="white" fontSize="18" fontWeight="800">VIX</text>
                    <text x="200" y="135" textAnchor="middle" fill="#fca5a5" fontSize="12">Termômetro do Medo</text>
                    
                    <path d="M 250 145 Q 350 185, 385 220" stroke="#ef4444" strokeWidth="3" fill="none" markerEnd="url(#arrowheadRedManual)"/>
                    <text x="295" y="165" fill="#fca5a5" fontSize="11" fontWeight="700">CORRELAÇÃO INVERSA</text>
                    <text x="295" y="180" fill="#ef4444" fontFamily="monospace" fontSize="10">VIX ↑ = NASDAQ ↓</text>
                    
                    {/* DXY - Inverse */}
                    <circle cx="200" cy="380" r="60" fill="url(#amberGradManual)" />
                    <text x="200" y="375" textAnchor="middle" fill="white" fontSize="18" fontWeight="800">DXY</text>
                    <text x="200" y="395" textAnchor="middle" fill="#fde047" fontSize="12">Índice do Dólar</text>
                    
                    <path d="M 255 355 Q 350 315, 385 275" stroke="#f59e0b" strokeWidth="3" fill="none" markerEnd="url(#arrowheadAmberManual)"/>
                    <text x="290" y="335" fill="#fde047" fontSize="11" fontWeight="700">INVERSO (Dólar Forte)</text>
                    
                    {/* SP500 - Direct */}
                    <circle cx="700" cy="120" r="60" fill="url(#greenGradManual)" />
                    <text x="700" y="115" textAnchor="middle" fill="white" fontSize="16" fontWeight="800">S&P 500</text>
                    <text x="700" y="135" textAnchor="middle" fill="#a7f3d0" fontSize="12">(SPY)</text>
                    
                    <path d="M 645 145 Q 550 185, 515 220" stroke="#10b981" strokeWidth="3" fill="none" markerEnd="url(#arrowheadGreenManual)"/>
                    <text x="560" y="165" fill="#a7f3d0" fontSize="11" fontWeight="700">ALINHAMENTO DIRETO</text>
                    <text x="560" y="180" fill="#10b981" fontFamily="monospace" fontSize="10">SPY ↑ = QQQ ↑</text>
                    
                    {/* Magnificent 7 */}
                    <rect x="620" y="315" width="220" height="135" fill="#1e293b" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" rx="10"/>
                    <text x="730" y="340" textAnchor="middle" fill="white" fontSize="14" fontWeight="800" letterSpacing="0.05em">MOTORES (MAGNÍFICAS 7)</text>
                    
                    <g transform="translate(635, 355)">
                        <rect width="50" height="24" fill="rgba(255,255,255,0.06)" rx="4"/>
                        <text x="25" y="16" textAnchor="middle" fill="white" fontFamily="monospace" fontSize="10">NVDA</text>
                    </g>
                    <g transform="translate(695, 355)">
                        <rect width="50" height="24" fill="rgba(255,255,255,0.06)" rx="4"/>
                        <text x="25" y="16" textAnchor="middle" fill="white" fontFamily="monospace" fontSize="10">AAPL</text>
                    </g>
                    <g transform="translate(755, 355)">
                        <rect width="50" height="24" fill="rgba(255,255,255,0.06)" rx="4"/>
                        <text x="25" y="16" textAnchor="middle" fill="white" fontFamily="monospace" fontSize="10">MSFT</text>
                    </g>
                    <g transform="translate(665, 395)">
                        <rect width="55" height="24" fill="rgba(255,255,255,0.06)" rx="4"/>
                        <text x="27" y="16" textAnchor="middle" fill="white" fontFamily="monospace" fontSize="10">AMZN</text>
                    </g>
                    <g transform="translate(730, 395)">
                        <rect width="55" height="24" fill="rgba(255,255,255,0.06)" rx="4"/>
                        <text x="27" y="16" textAnchor="middle" fill="white" fontFamily="monospace" fontSize="10">META</text>
                    </g>
                    
                    <path d="M 730 315 L 730 280 Q 730 262, 690 258" stroke="#60a5fa" strokeWidth="3" fill="none" markerEnd="url(#arrowheadManual)"/>
                    <text x="645" y="290" fill="#93c5fd" fontSize="11" fontWeight="700">PESO MÁXIMO</text>
                    
                    {/* Key Rules Box */}
                    <rect x="50" y="470" width="800" height="25" fill="#1e1b4b" rx="5" stroke="rgba(99, 102, 241, 0.3)" strokeWidth="1"/>
                    <text x="450" y="487" textAnchor="middle" fill="#c7d2fe" fontSize="11">
                        ⚠️ REGRA CRÍTICA: Se VIX subir +3% e NVDA cair -2%, suportes de Gama são ignorados (mercado em queda livre)!
                    </text>
                    
                    <defs>
                        <linearGradient id="redGradManual" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#ef4444" />
                            <stop offset="100%" stopColor="#b91c1c" />
                        </linearGradient>
                        <linearGradient id="greenGradManual" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#10b981" />
                            <stop offset="100%" stopColor="#047857" />
                        </linearGradient>
                        <linearGradient id="amberGradManual" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#f59e0b" />
                            <stop offset="100%" stopColor="#b45309" />
                        </linearGradient>
                        <marker id="arrowheadAmberManual" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                            <polygon points="0 0, 6 3, 0 6" fill="#f59e0b"/>
                        </marker>
                    </defs>
                  </svg>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-red-950/30 border border-red-500/40 p-4 rounded-xl text-red-200 leading-relaxed">
                    <strong className="text-red-400 font-bold block mb-1">🚨 VIX Disparando:</strong>
                    A gravidade puxa para BAIXO. Qualquer tentativa de compra em suportes de Gama vira armadilha, pois a liquidez evapora. Fique de fora ou venda!
                  </div>
                  <div className="bg-emerald-950/30 border border-emerald-500/40 p-4 rounded-xl text-emerald-200 leading-relaxed">
                    <strong className="text-emerald-400 font-bold block mb-1">✅ VIX Estável/Queda + Magníficas 7 Verdes:</strong>
                    A gravidade joga para CIMA. O ambiente operacional torna-se altamente confiável para comprar suportes de Gama e surfar as retrações.
                  </div>
                </div>
              </div>
            )}

            {/* Slide 4 */}
            {currentSlide === 4 && (
              <div className="space-y-4 animate-[fadeIn_0.4s_ease-out]">
                <h3 className="text-center text-lg font-bold text-slate-100">✅ Checklist Inicial (Antes de Qualquer Operação)</h3>
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 text-center shadow-inner">
                  <div className="text-xs uppercase font-bold text-slate-400 mb-3 tracking-wider">Fluxo de Triangulação e Decisão Estrutural</div>
                  <svg viewBox="0 0 900 400" className="w-full h-auto">
                    <rect width="900" height="400" fill="#0b0f19" rx="14" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
                    
                    {/* Start */}
                    <rect x="300" y="20" width="300" height="60" fill="url(#blueGradManual)" rx="30"/>
                    <text x="450" y="45" textAnchor="middle" fill="white" fontSize="15" fontWeight="800" letterSpacing="0.05em">NOVA OPERAÇÃO</text>
                    <text x="450" y="65" textAnchor="middle" fill="#93c5fd" fontSize="11">Fluxo de Triangulação</text>
                    
                    <path d="M 450 80 L 450 110" stroke="#3b82f6" strokeWidth="3" fill="none" markerEnd="url(#arrowheadManual)"/>
                    
                    {/* Question 1 */}
                    <rect x="40" y="120" width="180" height="85" fill="#1e293b" rx="10" stroke="rgba(96, 165, 250, 0.4)" strokeWidth="1.5"/>
                    <text x="130" y="145" textAnchor="middle" fill="white" fontSize="13" fontWeight="700">1. GAMMA WoW</text>
                    <text x="130" y="168" textAnchor="middle" fill="#94a3b8" fontSize="11">Preço acima/abaixo?</text>
                    <text x="130" y="185" textAnchor="middle" fill="#94a3b8" fontSize="11">Alinhamento semanal</text>
                    
                    {/* Question 2 */}
                    <rect x="250" y="120" width="180" height="85" fill="#1e293b" rx="10" stroke="rgba(244, 63, 94, 0.4)" strokeWidth="1.5"/>
                    <text x="340" y="145" textAnchor="middle" fill="white" fontSize="13" fontWeight="700">2. VIX & DXY</text>
                    <text x="340" y="168" textAnchor="middle" fill="#94a3b8" fontSize="11">Estão calmos ou</text>
                    <text x="340" y="185" textAnchor="middle" fill="#94a3b8" fontSize="11">explodindo em alta?</text>
                    
                    {/* Question 3 */}
                    <rect x="460" y="120" width="180" height="85" fill="#1e293b" rx="10" stroke="rgba(16, 185, 129, 0.4)" strokeWidth="1.5"/>
                    <text x="550" y="145" textAnchor="middle" fill="white" fontSize="13" fontWeight="700">3. MAGNÍFICAS 7</text>
                    <text x="550" y="168" textAnchor="middle" fill="#94a3b8" fontSize="11">Mínimo 4 alinhadas?</text>
                    <text x="550" y="185" textAnchor="middle" fill="#94a3b8" fontSize="11">NVDA está a favor?</text>
                    
                    {/* Question 4 */}
                    <rect x="670" y="120" width="190" height="85" fill="#1e293b" rx="10" stroke="rgba(168, 85, 247, 0.4)" strokeWidth="1.5"/>
                    <text x="765" y="145" textAnchor="middle" fill="white" fontSize="13" fontWeight="700">4. REGEX DE NÍVEL</text>
                    <text x="765" y="168" textAnchor="middle" fill="#94a3b8" fontSize="11">Primeiro toque (forte)?</text>
                    <text x="765" y="185" textAnchor="middle" fill="#94a3b8" fontSize="11">Nível 7-10?</text>
                    
                    <path d="M 450 205 L 450 235" stroke="#3b82f6" strokeWidth="3" fill="none" markerEnd="url(#arrowheadManual)"/>
                    
                    {/* Decision */}
                    <rect x="250" y="245" width="400" height="70" fill="url(#amberGradManual)" rx="10"/>
                    <text x="450" y="275" textAnchor="middle" fill="white" fontSize="14" fontWeight="800" letterSpacing="0.05em">CONVERGÊNCIA TOTAL?</text>
                    <text x="450" y="297" textAnchor="middle" fill="#fef3c7" fontSize="12">Mínimo de 3 critérios favoráveis = Entrada Autorizada</text>
                    
                    <path d="M 450 315 L 450 345" stroke="#10b981" strokeWidth="3" fill="none" markerEnd="url(#arrowheadGreenManual)"/>
                    
                    {/* Result */}
                    <rect x="275" y="350" width="350" height="40" fill="url(#greenGradManual)" rx="20"/>
                    <text x="450" y="375" textAnchor="middle" fill="white" fontSize="14" fontWeight="800" letterSpacing="0.05em">✅ CONFIGURAÇÃO AUTORIZADA</text>
                  </svg>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 flex items-start gap-2.5">
                    <span className="text-blue-400 font-bold">✓</span>
                    <div>
                      <strong className="text-white">Gamma WoW:</strong>
                      <span className="text-slate-300 ml-1">Identifique se o preço está trabalhando acima ou abaixo da base de fluxo semanal institucional.</span>
                    </div>
                  </div>
                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 flex items-start gap-2.5">
                    <span className="text-purple-400 font-bold">✓</span>
                    <div>
                      <strong className="text-white">VIX e DXY:</strong>
                      <span className="text-slate-300 ml-1">O medo macro deve estar controlado. Alta acentuada do VIX derrete posições longs.</span>
                    </div>
                  </div>
                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 flex items-start gap-2.5">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <div>
                      <strong className="text-white">Confluência Magníficas:</strong>
                      <span className="text-slate-300 ml-1">Robôs dependem do peso das 7 gigantes. Verifique se estão majoritariamente alinhadas na mesma direção.</span>
                    </div>
                  </div>
                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 flex items-start gap-2.5">
                    <span className="text-amber-400 font-bold">✓</span>
                    <div>
                      <strong className="text-white">Qualidade do Nível:</strong>
                      <span className="text-slate-300 ml-1">Dê preferência absoluta a níveis do dia (0DTE) e de concreto (níveis 7 a 10).</span>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-950/30 border border-blue-500/30 p-4 rounded-xl text-xs text-blue-200 leading-relaxed">
                  <strong className="text-blue-400">💡 Regra de Ouro:</strong> Se a triangulação do checklist não bater, a melhor atitude é a inércia. Proteger o caixa é o que gera lucro no longo prazo!
                </div>
              </div>
            )}

            {/* Slide 5 */}
            {currentSlide === 5 && (
              <div className="space-y-4 animate-[fadeIn_0.4s_ease-out]">
                <h3 className="text-center text-lg font-bold text-slate-100">🟢 Checklist de COMPRAS e Rompimento ACIMA</h3>
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 text-center shadow-inner">
                  <div className="text-xs uppercase font-bold text-slate-400 mb-3 tracking-wider">Setup Ideal de Compra com Rejeição Institucional</div>
                  <svg viewBox="0 0 900 450" className="w-full h-auto">
                    <rect width="900" height="450" fill="#0b0f19" rx="14" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
                    
                    {/* Horizontal Levels */}
                    <line x1="50" y1="360" x2="850" y2="360" stroke="rgba(16, 185, 129, 0.2)" strokeWidth="2"/>
                    <text x="70" y="350" fill="#10b981" fontFamily="monospace" fontSize="11" fontWeight="bold">SUPORTE: PUT 0DTE (BL 9-10)</text>
                    
                    <line x1="50" y1="120" x2="850" y2="120" stroke="rgba(236, 72, 153, 0.2)" strokeWidth="2"/>
                    <text x="70" y="110" fill="#ec4899" fontFamily="monospace" fontSize="11" fontWeight="bold">RESISTÊNCIA: CALL 0DTE (ALVO)</text>
                    
                    {/* Price Path */}
                    <path d="M 100 220 Q 200 240, 250 310 L 350 360 L 400 360 Q 420 310, 480 250 T 650 170 L 750 120" 
                          stroke="rgba(255, 255, 255, 0.4)" strokeWidth="2.5" fill="none" strokeDasharray="6,4"/>
                    
                    <path d="M 350 360 L 400 360 Q 420 310, 480 250 T 650 170 L 750 120" 
                          stroke="#10b981" strokeWidth="4.5" fill="none"/>
                    
                    {/* First Touch point */}
                    <circle cx="350" cy="360" r="8" fill="#fbbf24" stroke="white" strokeWidth="2.5"/>
                    <text x="350" y="340" textAnchor="middle" fill="#fbbf24" fontWeight="800" fontSize="11">1º TOQUE (REJEIÇÃO)</text>
                    
                    {/* Rejection Candle visualization */}
                    <g transform="translate(420, 280)">
                        <line x1="10" y1="0" x2="10" y2="70" stroke="#10b981" strokeWidth="2"/>
                        <rect x="0" y="15" width="20" height="35" fill="#10b981" rx="2"/>
                        <text x="30" y="38" fill="#10b981" fontWeight="700" fontSize="12">GATILHO COMPRA</text>
                    </g>
                    
                    {/* Stop loss indication */}
                    <line x1="300" y1="395" x2="450" y2="395" stroke="#ef4444" strokeWidth="2" strokeDasharray="4,4"/>
                    <text x="375" y="415" textAnchor="middle" fill="#ef4444" fontSize="11">STOP LOSS (Abaixo da Mínima)</text>
                    
                    {/* Target Point */}
                    <circle cx="750" cy="120" r="8" fill="#06b6d4" stroke="white" strokeWidth="2.5"/>
                    <text x="750" y="98" textAnchor="middle" fill="#22d3ee" fontWeight="800" fontSize="11">TAKE PROFIT (ALVO)</text>
                    
                    {/* Conditions Box */}
                    <rect x="50" y="20" width="240" height="75" fill="rgba(16, 185, 129, 0.08)" rx="8" stroke="rgba(16, 185, 129, 0.2)" strokeWidth="1"/>
                    <text x="65" y="42" fill="#a7f3d0" fontSize="12" fontWeight="800">CENÁRIO IDEAL:</text>
                    <text x="65" y="60" fill="#cbd5e1" fontSize="10.5">✓ VIX estável ou em queda</text>
                    <text x="65" y="75" fill="#cbd5e1" fontSize="10.5">✓ Ações de Peso (M7) em alta</text>
                  </svg>
                </div>
                
                <div className="bg-emerald-950/30 border border-emerald-500/40 p-4 rounded-xl text-xs text-emerald-200 leading-relaxed">
                  <strong className="text-emerald-400 font-bold block mb-1">🎯 Gatilho de Operação:</strong>
                  Aguarde o preço testar o nível forte, segurar e mostrar rejeição clara no fechamento do candle de 5 min (deixando pavio inferior longo ou candle comprador com alto volume).
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <strong className="text-red-400 block mb-1">🛑 Posicionamento de Stop Loss:</strong>
                    <p className="text-slate-400 text-[11px] leading-relaxed">Posicionado logo abaixo do pavio de teste ou 5 a 10 pontos abaixo do nível forte de Gama.</p>
                  </div>
                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <strong className="text-cyan-400 block mb-1">🎯 Alvo de Saída (Take Profit):</strong>
                    <p className="text-slate-400 text-[11px] leading-relaxed">Realize saídas parciais ou totais na próxima região relevante de resistência (Call 0DTE) ou HVL acima.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Slide 6 */}
            {currentSlide === 6 && (
              <div className="space-y-4 animate-[fadeIn_0.4s_ease-out]">
                <h3 className="text-center text-lg font-bold text-slate-100">🔴 Checklist de VENDAS e Rompimento ABAIXO</h3>
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 text-center shadow-inner">
                  <div className="text-xs uppercase font-bold text-slate-400 mb-3 tracking-wider">A Armadilha do 2º Toque & Aceleração em Queda Livre</div>
                  <svg viewBox="0 0 900 450" className="w-full h-auto">
                    <rect width="900" height="450" fill="#0b0f19" rx="14" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
                    
                    {/* Horizontal Levels */}
                    <line x1="50" y1="130" x2="850" y2="130" stroke="rgba(236, 72, 153, 0.2)" strokeWidth="2"/>
                    <text x="70" y="120" fill="#ec4899" fontFamily="monospace" fontSize="11" fontWeight="bold">RESISTÊNCIA: CALL 0DTE</text>
                    
                    <line x1="50" y1="260" x2="850" y2="260" stroke="rgba(239, 68, 68, 0.2)" strokeWidth="2"/>
                    <text x="70" y="250" fill="#ef4444" fontFamily="monospace" fontSize="11" fontWeight="bold">SUPORTE TESTADO: PUT 0DTE (2º TOQUE = FRÁGIL)</text>
                    
                    {/* Price Path */}
                    <path d="M 80 180 Q 150 150, 200 130 L 250 130 Q 300 200, 360 260 L 400 260 L 450 290 Q 520 330, 600 380" 
                          stroke="rgba(255, 255, 255, 0.4)" strokeWidth="2.5" fill="none" strokeDasharray="6,4"/>
                    
                    <path d="M 360 260 L 400 260 L 450 290 Q 520 330, 600 380" 
                          stroke="#ef4444" strokeWidth="4.5" fill="none"/>
                    
                    {/* Warning Area */}
                    <g transform="translate(250, 290)">
                        <rect width="110" height="40" fill="rgba(245, 158, 11, 0.15)" rx="6" stroke="#f59e0b" strokeWidth="1.5"/>
                        <text x="55" y="24" textAnchor="middle" fill="#f59e0b" fontWeight="800" fontSize="11">PAREDE FRÁGIL</text>
                    </g>
                    
                    {/* Breakdown Point */}
                    <circle cx="400" cy="260" r="8" fill="#fbbf24" stroke="white" strokeWidth="2.5"/>
                    <text x="400" y="240" textAnchor="middle" fill="#fbbf24" fontWeight="800" fontSize="11">ROMPIMENTO (ENTRY)</text>
                    
                    {/* Acceleration */}
                    <path d="M 450 290 L 530 340" stroke="#ef4444" strokeWidth="3.5" fill="none" markerEnd="url(#arrowheadRedManual)"/>
                    <text x="525" y="325" fill="#fca5a5" fontWeight="800" fontSize="13">CACHOEIRA</text>
                    
                    {/* Next Target Support */}
                    <rect x="600" y="360" width="180" height="50" fill="url(#purpleGradManual)" rx="8"/>
                    <text x="690" y="383" textAnchor="middle" fill="white" fontSize="12" fontWeight="800">BL/GEX 9-10</text>
                    <text x="690" y="398" textAnchor="middle" fill="#e9d5ff" fontSize="10">(PRÓXIMA DEFESA)</text>
                    
                    {/* Stop Loss Line */}
                    <line x1="300" y1="180" x2="420" y2="180" stroke="#10b981" strokeWidth="2" strokeDasharray="4,4"/>
                    <text x="360" y="170" textAnchor="middle" fill="#10b981" fontSize="11">STOP LOSS (Abaixo da Resistência)</text>
                    
                    {/* Conditions Box */}
                    <rect x="50" y="20" width="240" height="75" fill="rgba(239, 68, 68, 0.08)" rx="8" stroke="rgba(239, 68, 68, 0.2)" strokeWidth="1"/>
                    <text x="65" y="42" fill="#fca5a5" fontSize="12" fontWeight="800">CENÁRIO IDEAL:</text>
                    <text x="65" y="60" fill="#cbd5e1" fontSize="10.5">✓ VIX em forte alta (+3% ou mais)</text>
                    <text x="65" y="75" fill="#cbd5e1" fontSize="10.5">✓ Pesos Pesados (NVDA/AAPL) caindo</text>
                  </svg>
                </div>
                
                <div className="bg-red-950/30 border border-red-500/40 p-4 rounded-xl text-xs text-red-200 leading-relaxed">
                  <strong className="text-red-400 font-bold block mb-1">⚠️ A Armadilha do 2º Toque:</strong>
                  Níveis de suporte/resistência de 0DTE tocados repetidas vezes sofrem desgaste rápido porque a proteção do market maker é consumida. Ao romper, geram acelerações violentas de preço.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <strong className="text-amber-400 block mb-1">📉 Gatilho de Venda:</strong>
                    <p className="text-slate-400 text-[11px] leading-relaxed">Entrada após o fechamento do candle de 5 minutos perder e fechar abaixo do nível de Put 0DTE.</p>
                  </div>
                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                    <strong className="text-purple-400 block mb-1">🎯 Alvo Final:</strong>
                    <p className="text-slate-400 text-[11px] leading-relaxed">Próxima barreira estrutural importante (BL ou GEX 7 a 10 de compra) marcada no fluxo.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Slide 7 */}
            {currentSlide === 7 && (
              <div className="space-y-4 animate-[fadeIn_0.4s_ease-out]">
                <h3 className="text-center text-lg font-bold text-slate-100">🏆 As 3 Regras de Ouro da Sobrevivência</h3>
                
                <div className="grid grid-cols-1 gap-3 text-xs">
                  <div className="bg-gradient-to-r from-red-950/40 to-slate-900 p-4 rounded-xl border border-red-500/30 space-y-1">
                    <h4 className="font-bold text-red-400 text-sm flex items-center gap-2">⚡ Regra #1: Nível Tocado é Nível Queimado</h4>
                    <p className="text-slate-300 text-[11.5px] leading-relaxed">
                      Evite operar o segundo ou terceiro rebate no mesmo patamar de 0DTE. O primeiro toque oferece a maior taxa de acerto. A partir do segundo toque o nível enfraquece, abrindo caminho para rompimentos direcionais extremamente fortes.
                    </p>
                  </div>
                  
                  <div className="bg-gradient-to-r from-blue-950/40 to-slate-900 p-4 rounded-xl border border-blue-500/30 space-y-1">
                    <h4 className="font-bold text-blue-400 text-sm flex items-center gap-2">⚡ Regra #2: Nunca opere o "ONDE" sem checar o "SE"</h4>
                    <p className="text-slate-300 text-[11.5px] leading-relaxed">
                      De nada adianta o preço tocar em um suporte de Gama Nível 10 se o VIX está subindo mais de 3% e a NVDA cai mais de 2%. O sentimento e a gravidade macro do mercado sempre vencem os níveis micro. Alinhe os dois!
                    </p>
                  </div>
                  
                  <div className="bg-gradient-to-r from-emerald-950/40 to-slate-900 p-4 rounded-xl border border-emerald-500/30 space-y-1">
                    <h4 className="font-bold text-emerald-400 text-sm flex items-center gap-2">⚡ Regra #3: A Inércia também é Operação</h4>
                    <p className="text-slate-300 text-[11.5px] leading-relaxed">
                      Se a matriz de dados apresentar divergências (ex: VIX caindo mas Nasdaq sem força, ou ações pesadas mistas), a melhor operação é ficar de fora. Preservar o caixa operacional é a chave da consistência matemática.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 text-center shadow-inner">
                  <div className="text-xs uppercase font-bold text-slate-400 mb-3 tracking-wider">Matriz de Decisão: Quando Operar vs. Quando Esperar</div>
                  <svg viewBox="0 0 900 280" className="w-full h-auto">
                    <rect width="900" height="280" fill="#0b0f19" rx="14" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
                    
                    {/* DO Column */}
                    <rect x="30" y="20" width="400" height="240" fill="rgba(16, 185, 129, 0.05)" rx="8" stroke="rgba(16, 185, 129, 0.2)" strokeWidth="1.5"/>
                    <text x="230" y="52" textAnchor="middle" fill="#10b981" fontSize="16" fontWeight="800">✅ OPERE QUANDO:</text>
                    
                    <text x="60" y="88" fill="#cbd5e1" fontSize="12.5">✓ VIX estável ou em queda livre</text>
                    <text x="60" y="112" fill="#cbd5e1" fontSize="12.5">✓ Magníficas 7 alinhadas (mínimo 4 verdes)</text>
                    <text x="60" y="136" fill="#cbd5e1" fontSize="12.5">✓ Primeiro toque da região no dia</text>
                    <text x="60" y="160" fill="#cbd5e1" fontSize="12.5">✓ Preço trabalhando a favor da tendência WoW</text>
                    <text x="60" y="184" fill="#cbd5e1" fontSize="12.5">✓ Rejeição visual no gráfico de velas de 5 min</text>
                    <text x="60" y="208" fill="#cbd5e1" fontSize="12.5">✓ Mínimo 3 critérios confirmados no checklist</text>
                    
                    {/* DONT Column */}
                    <rect x="470" y="20" width="400" height="240" fill="rgba(239, 68, 68, 0.05)" rx="8" stroke="rgba(239, 68, 68, 0.2)" strokeWidth="1.5"/>
                    <text x="670" y="52" textAnchor="middle" fill="#ef4444" fontSize="16" fontWeight="800">⚠️ EVITE OPERAR SE:</text>
                    
                    <text x="500" y="88" fill="#cbd5e1" fontSize="12.5">✗ VIX explodindo (variação de +3% ou maior)</text>
                    <text x="500" y="112" fill="#cbd5e1" fontSize="12.5">✗ Ações líderes (NVDA/AAPL) caindo forte</text>
                    <text x="500" y="136" fill="#cbd5e1" fontSize="12.5">✗ Nível já testado múltiplas vezes no dia</text>
                    <text x="500" y="160" fill="#cbd5e1" fontSize="12.5">✗ Sinais mistos ou fluxo institucional travado</text>
                    <text x="500" y="184" fill="#cbd5e1" fontSize="12.5">✗ Sem sinal claro de rejeição ou reversão</text>
                    <text x="500" y="208" fill="#cbd5e1" fontSize="12.5">✗ Menos de 3 confluências no checklist diário</text>
                    
                    <line x1="450" y1="30" x2="450" y2="250" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" strokeDasharray="4,4"/>
                  </svg>
                </div>
              </div>
            )}

            {/* Slide 8 */}
            {currentSlide === 8 && (
              <div className="space-y-4 animate-[fadeIn_0.4s_ease-out]">
                <h3 className="text-center text-lg font-bold text-slate-100">📋 Rotina Diária de Análise Operacional</h3>
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 text-center shadow-inner">
                  <div className="text-xs uppercase font-bold text-slate-400 mb-3 tracking-wider">Passo a Passo de Execução do Trader Institucional</div>
                  <svg viewBox="0 0 900 560" className="w-full h-auto">
                    <rect width="900" height="560" fill="#0b0f19" rx="14" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
                    
                    {/* Step 1 */}
                    <rect x="50" y="30" width="800" height="75" fill="url(#blueGradManual)" rx="8"/>
                    <text x="80" y="60" fill="white" fontSize="14" fontWeight="800">1️⃣ VERIFICAÇÃO DE ABERTURA E FILTROS MACRO</text>
                    <text x="80" y="85" fill="#bfdbfe" fontSize="12">Avalie o viés de fluxo semanal (Gamma WoW) e consulte o comportamento do VIX e das Ações Líderes.</text>
                    
                    <path d="M 450 105 L 450 125" stroke="#3b82f6" strokeWidth="2.5" fill="none" markerEnd="url(#arrowheadManual)"/>
                    
                    {/* Step 2 */}
                    <rect x="50" y="135" width="800" height="75" fill="#1e293b" stroke="rgba(255,255,255,0.05)" strokeWidth="1" rx="8"/>
                    <text x="80" y="165" fill="white" fontSize="14" fontWeight="800">2️⃣ MAPEAMENTO DAS ZONAS DE LIQUIDEZ E GAMA</text>
                    <text x="80" y="190" fill="#94a3b8" fontSize="12">Identifique suportes (Put 0DTE), resistências (Call 0DTE), níveis de concreto (GEX 7-10) e zonas HVL.</text>
                    
                    <path d="M 450 210 L 450 230" stroke="#3b82f6" strokeWidth="2.5" fill="none" markerEnd="url(#arrowheadManual)"/>
                    
                    {/* Step 3 */}
                    <rect x="50" y="240" width="800" height="75" fill="#1e293b" stroke="rgba(255,255,255,0.05)" strokeWidth="1" rx="8"/>
                    <text x="80" y="270" fill="white" fontSize="14" fontWeight="800">3️⃣ ESPERE PELA CHEGADA DO PREÇO NAS ZONAS</text>
                    <text x="80" y="295" fill="#94a3b8" fontSize="12">Evite operar fora dos níveis marcados. A paciência garante que você compre barato e venda caro.</text>
                    
                    <path d="M 450 315 L 450 335" stroke="#3b82f6" strokeWidth="2.5" fill="none" markerEnd="url(#arrowheadManual)"/>
                    
                    {/* Step 4 */}
                    <rect x="50" y="345" width="800" height="75" fill="#1e293b" stroke="rgba(255,255,255,0.05)" strokeWidth="1" rx="8"/>
                    <text x="80" y="375" fill="white" fontSize="14" fontWeight="800">4️⃣ IDENTIFIQUE A CONFIRMAÇÃO DO GATILHO</text>
                    <text x="80" y="400" fill="#94a3b8" fontSize="12">Aguarde sinais gráficos de rejeição no tempo de 5 ou 15 min (pavios, engolfos ou barras direcionais).</text>
                    
                    <path d="M 450 420 L 450 440" stroke="#10b981" strokeWidth="2.5" fill="none" markerEnd="url(#arrowheadGreenManual)"/>
                    
                    {/* Step 5 */}
                    <rect x="150" y="455" width="600" height="65" fill="url(#greenGradManual)" rx="30"/>
                    <text x="450" y="485" textAnchor="middle" fill="white" fontSize="15" fontWeight="800" letterSpacing="0.05em">5️⃣ ENTRADA AUTORIZADA COM STOP E ALVO FIXOS</text>
                    <text x="450" y="505" textAnchor="middle" fill="#a7f3d0" fontSize="11">Configure o gerenciamento de risco e deixe a estatística matemática trabalhar.</text>
                  </svg>
                </div>

                <div className="bg-blue-950/30 border border-blue-500/30 p-4 rounded-xl text-xs text-blue-200 leading-relaxed">
                  <strong className="text-blue-400">💡 Dica do Vortex:</strong> Mantenha essa rotina mental ou visível na sua mesa de operações. Seguir esse passo a passo protege o capital e potencializa os ganhos matemáticos!
                </div>
              </div>
            )}

            {/* Navegação de Slides */}
            <div className="flex justify-between items-center bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 mt-4">
              <button
                onClick={() => setCurrentSlide(prev => Math.max(1, prev - 1))}
                disabled={currentSlide === 1}
                className="px-4 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-xs font-bold text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                ◀ Anterior
              </button>
              
              <div className="flex gap-1.5">
                {Array.from({ length: totalSlides }).map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentSlide(idx + 1)}
                    className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                      currentSlide === idx + 1 ? 'bg-purple-500 scale-125' : 'bg-slate-700 hover:bg-slate-500'
                    }`}
                    title={`Slide ${idx + 1}`}
                  />
                ))}
              </div>

              <button
                onClick={() => setCurrentSlide(prev => Math.min(totalSlides, prev + 1))}
                disabled={currentSlide === totalSlides}
                className="px-4 py-2 bg-purple-600 rounded-lg text-xs font-bold text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Próximo ▶
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
