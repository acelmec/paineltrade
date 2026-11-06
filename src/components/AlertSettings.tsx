import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export const AlertSettings: React.FC = () => {
  const { settings, saveSettings, marketData, gammaLevels, forces, forcesConfig } = useApp();
  const [activeTab, setActiveTab] = useState<'sentimento' | 'sentimento_micro' | 'blocktrades' | 'delta' | 'acelerometro' | 'niveis' | 'forca_vies' | 'pva'>('sentimento');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modo Global
  const [alertMode, setAlertMode] = useState<'individual' | 'logica'>('individual');

  // Aba Sentimento Macro State
  const [alertSentAtivo, setAlertSentAtivo] = useState(false);
  const [alertSentMax, setAlertSentMax] = useState(75);
  const [alertSentMin, setAlertSentMin] = useState(25);
  const [alertSentCooldown, setAlertSentCooldown] = useState(5);
  const [alertSentTelegram, setAlertSentTelegram] = useState(false);

  // Aba Sentimento Micro State
  const [alertSentMicroAtivo, setAlertSentMicroAtivo] = useState(false);
  const [alertSentMicroMax, setAlertSentMicroMax] = useState(75);
  const [alertSentMicroMin, setAlertSentMicroMin] = useState(25);
  const [alertSentMicroCooldown, setAlertSentMicroCooldown] = useState(5);
  const [alertSentMicroTelegram, setAlertSentMicroTelegram] = useState(false);

  // Aba Block Trades State
  const [alertBtAtivo, setAlertBtAtivo] = useState(false);
  const [alertBtVol, setAlertBtVol] = useState(50);
  const [alertBtCooldown, setAlertBtCooldown] = useState(5);
  const [alertBtTelegram, setAlertBtTelegram] = useState(false);

  // Aba Delta/Ratio State
  const [alertDeltaAtivo, setAlertDeltaAtivo] = useState(false);
  const [alertDeltaSell, setAlertDeltaSell] = useState(0.5);
  const [alertDeltaBuy, setAlertDeltaBuy] = useState(1.5);
  const [alertDeltaVolMin, setAlertDeltaVolMin] = useState(50);
  const [alertDeltaCooldown, setAlertDeltaCooldown] = useState(5);
  const [alertDeltaTelegram, setAlertDeltaTelegram] = useState(false);

  // Aba Acelerometro State
  const [alertAcelAtivo, setAlertAcelAtivo] = useState(false);
  const [alertAcelExplosao, setAlertAcelExplosao] = useState(false);
  const [alertAcelExaustao, setAlertAcelExaustao] = useState(false);
  const [alertAcelCompressao, setAlertAcelCompressao] = useState(false);
  const [alertAcelCooldown, setAlertAcelCooldown] = useState(5);
  const [alertAcelTelegram, setAlertAcelTelegram] = useState(false);

  // Aba Níveis State
  const [alertNivelAtivo, setAlertNivelAtivo] = useState(false);
  const [alertNivelDist, setAlertNivelDist] = useState(25);
  const [alertNivelCooldown, setAlertNivelCooldown] = useState(10);
  const [alertNivelTelegram, setAlertNivelTelegram] = useState(false);
  const [selectedNiveis, setSelectedNiveis] = useState<string[]>([]);

  // Aba Força / Viés State
  const [alertForceAtivo, setAlertForceAtivo] = useState(false);
  const [alertForceBuyMin, setAlertForceBuyMin] = useState(75);
  const [alertForceSellMax, setAlertForceSellMax] = useState(25);
  const [alertForceCooldown, setAlertForceCooldown] = useState(5);
  const [alertForceTelegram, setAlertForceTelegram] = useState(false);
  const [alertForceViesShift, setAlertForceViesShift] = useState(false);

  // Aba PVA State
  const [alertPvaAtivo, setAlertPvaAtivo] = useState(false);
  const [alertPvaCooldown, setAlertPvaCooldown] = useState(5);
  const [alertPvaTelegram, setAlertPvaTelegram] = useState(false);

  // Carregar dados de configurações do AppContext
  useEffect(() => {
    if (settings) {
      setAlertMode(settings.alert_mode || 'individual');
      
      setAlertSentAtivo(settings.alert_sent_ativo || false);
      setAlertSentMax(settings.alert_sent_max !== undefined ? Number(settings.alert_sent_max) : 75);
      setAlertSentMin(settings.alert_sent_min !== undefined ? Number(settings.alert_sent_min) : 25);
      setAlertSentCooldown(settings.alert_sent_cooldown !== undefined ? Number(settings.alert_sent_cooldown) : 5);
      setAlertSentTelegram(settings.alert_sent_telegram || false);

      setAlertSentMicroAtivo(settings.alert_sent_micro_ativo || false);
      setAlertSentMicroMax(settings.alert_sent_micro_max !== undefined ? Number(settings.alert_sent_micro_max) : 75);
      setAlertSentMicroMin(settings.alert_sent_micro_min !== undefined ? Number(settings.alert_sent_micro_min) : 25);
      setAlertSentMicroCooldown(settings.alert_sent_micro_cooldown !== undefined ? Number(settings.alert_sent_micro_cooldown) : 5);
      setAlertSentMicroTelegram(settings.alert_sent_micro_telegram || false);

      setAlertBtAtivo(settings.alert_bt_ativo || false);
      setAlertBtVol(settings.alert_bt_vol !== undefined ? Number(settings.alert_bt_vol) : 50);
      setAlertBtCooldown(settings.alert_bt_cooldown !== undefined ? Number(settings.alert_bt_cooldown) : 5);
      setAlertBtTelegram(settings.alert_bt_telegram || false);

      setAlertDeltaAtivo(settings.alert_delta_ativo || false);
      setAlertDeltaSell(settings.alert_delta_sell !== undefined ? Number(settings.alert_delta_sell) : 0.5);
      setAlertDeltaBuy(settings.alert_delta_buy !== undefined ? Number(settings.alert_delta_buy) : 1.5);
      setAlertDeltaVolMin(settings.alert_delta_vol_min !== undefined ? Number(settings.alert_delta_vol_min) : 50);
      setAlertDeltaCooldown(settings.alert_delta_cooldown !== undefined ? Number(settings.alert_delta_cooldown) : 5);
      setAlertDeltaTelegram(settings.alert_delta_telegram || false);

      setAlertAcelAtivo(settings.alert_acel_ativo || false);
      setAlertAcelExplosao(settings.alert_acel_explosao || false);
      setAlertAcelExaustao(settings.alert_acel_exaustao || false);
      setAlertAcelCompressao(settings.alert_acel_compressao || false);
      setAlertAcelCooldown(settings.alert_acel_cooldown !== undefined ? Number(settings.alert_acel_cooldown) : 5);
      setAlertAcelTelegram(settings.alert_acel_telegram || false);

      setAlertNivelAtivo(settings.alert_nivel_ativo || false);
      setAlertNivelDist(settings.alert_nivel_dist !== undefined ? Number(settings.alert_nivel_dist) : 25);
      setAlertNivelCooldown(settings.alert_nivel_cooldown !== undefined ? Number(settings.alert_nivel_cooldown) : 10);
      setAlertNivelTelegram(settings.alert_nivel_telegram || false);
      setSelectedNiveis(settings.alert_nivel_niveis || []);

      setAlertForceAtivo(settings.alert_force_ativo || false);
      setAlertForceBuyMin(settings.alert_force_buy_min !== undefined ? Number(settings.alert_force_buy_min) : 75);
      setAlertForceSellMax(settings.alert_force_sell_max !== undefined ? Number(settings.alert_force_sell_max) : 25);
      setAlertForceCooldown(settings.alert_force_cooldown !== undefined ? Number(settings.alert_force_cooldown) : 5);
      setAlertForceTelegram(settings.alert_force_telegram || false);
      setAlertForceViesShift(settings.alert_force_vies_shift || false);

      setAlertPvaAtivo(settings.alert_pva_ativo || false);
      setAlertPvaCooldown(settings.alert_pva_cooldown !== undefined ? Number(settings.alert_pva_cooldown) : 5);
      setAlertPvaTelegram(settings.alert_pva_telegram || false);
    }
  }, [settings?.panel_id]);

  const handleSaveAlertConfig = async (updatedFields: Partial<any>) => {
    setMessage(null);
    const success = await saveSettings(updatedFields);
    if (success) {
      setMessage({ text: 'Configuração de Alertas salva no banco de dados com sucesso!', type: 'success' });
    } else {
      setMessage({ text: 'Falha ao salvar configurações de alertas.', type: 'error' });
    }
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSaveAlertConfig({
      alert_mode: alertMode,
      alert_sent_ativo: alertSentAtivo,
      alert_sent_max: Number(alertSentMax),
      alert_sent_min: Number(alertSentMin),
      alert_sent_cooldown: Number(alertSentCooldown),
      alert_sent_telegram: alertSentTelegram,
      alert_sent_micro_ativo: alertSentMicroAtivo,
      alert_sent_micro_max: Number(alertSentMicroMax),
      alert_sent_micro_min: Number(alertSentMicroMin),
      alert_sent_micro_cooldown: Number(alertSentMicroCooldown),
      alert_sent_micro_telegram: alertSentMicroTelegram,
      alert_bt_ativo: alertBtAtivo,
      alert_bt_vol: Number(alertBtVol),
      alert_bt_cooldown: Number(alertBtCooldown),
      alert_bt_telegram: alertBtTelegram,
      alert_delta_ativo: alertDeltaAtivo,
      alert_delta_sell: Number(alertDeltaSell),
      alert_delta_buy: Number(alertDeltaBuy),
      alert_delta_vol_min: Number(alertDeltaVolMin),
      alert_delta_cooldown: Number(alertDeltaCooldown),
      alert_delta_telegram: alertDeltaTelegram,
      alert_acel_ativo: alertAcelAtivo,
      alert_acel_explosao: alertAcelExplosao,
      alert_acel_exaustao: alertAcelExaustao,
      alert_acel_compressao: alertAcelCompressao,
      alert_acel_cooldown: Number(alertAcelCooldown),
      alert_acel_telegram: alertAcelTelegram,
      alert_nivel_ativo: alertNivelAtivo,
      alert_nivel_dist: Number(alertNivelDist),
      alert_nivel_cooldown: Number(alertNivelCooldown),
      alert_nivel_telegram: alertNivelTelegram,
      alert_nivel_niveis: selectedNiveis,
      alert_force_ativo: alertForceAtivo,
      alert_force_buy_min: Number(alertForceBuyMin),
      alert_force_sell_max: Number(alertForceSellMax),
      alert_force_cooldown: Number(alertForceCooldown),
      alert_force_telegram: alertForceTelegram,
      alert_force_vies_shift: alertForceViesShift,
      alert_pva_ativo: alertPvaAtivo,
      alert_pva_cooldown: Number(alertPvaCooldown),
      alert_pva_telegram: alertPvaTelegram
    });
  };

  const toggleNivelSelection = (key: string) => {
    setSelectedNiveis(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  // Lógica de cálculo de condições ativas para visualização em Lógica
  const renderLogicalStatus = () => {
    const sentimentMet = marketData && (marketData.sentiment >= alertSentMax || marketData.sentiment <= alertSentMin);
    const sentimentDir = marketData
      ? (marketData.sentiment >= alertSentMax
          ? 'compra'
          : (marketData.sentiment <= alertSentMin
              ? 'venda'
              : null))
      : null;

    const microSentVal = marketData
      ? (marketData.marketSentiment !== undefined ? marketData.marketSentiment : marketData.sentiment)
      : 50;
    const sentimentMicroMet = marketData && (microSentVal >= alertSentMicroMax || microSentVal <= alertSentMicroMin);
    const sentimentMicroDir = marketData
      ? (microSentVal >= alertSentMicroMax
          ? 'compra'
          : (microSentVal <= alertSentMicroMin
              ? 'venda'
              : null))
      : null;

    let blockTradeMet = false;
    let blockTradeDir: 'compra' | 'venda' | null = null;
    if (marketData && marketData.blockTrades) {
      const minVol = Number(alertBtVol ?? 50);
      const lastTrade = marketData.blockTrades[marketData.blockTrades.length - 1];
      if (lastTrade && lastTrade.volume >= minVol) {
        blockTradeMet = true;
        const sideUpper = lastTrade.side.toUpperCase();
        if (sideUpper.includes('COMPRA') || sideUpper.includes('BUY')) {
          blockTradeDir = 'compra';
        } else if (sideUpper.includes('VENDA') || sideUpper.includes('SELL')) {
          blockTradeDir = 'venda';
        }
      }
    }

    const deltaMet = marketData && (marketData.deltaRatio >= alertDeltaBuy || marketData.deltaRatio <= alertDeltaSell);
    const deltaDir = marketData
      ? (marketData.deltaRatio >= alertDeltaBuy
          ? 'compra'
          : (marketData.deltaRatio <= alertDeltaSell
              ? 'venda'
              : null))
      : null;

    let accelMet = false;
    let accelDir: 'compra' | 'venda' | null = null;
    if (marketData) {
      const est = (marketData.estado || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]+/g, ' ').toUpperCase().trim();
      if (est === 'COMPRA' || est === 'BUY') {
        accelMet = true;
        accelDir = 'compra';
      } else if (est === 'VENDA' || est === 'SELL') {
        accelMet = true;
        accelDir = 'venda';
      } else if (est === 'SAIR' || est === 'EXIT') {
        accelMet = true;
        accelDir = null;
      } else if (alertAcelExplosao && est.includes('EXPLOSAO')) {
        accelMet = true;
        if (est.includes('COMPRA') || est.includes('BUY') || est.includes('ALTA')) {
          accelDir = 'compra';
        } else if (est.includes('VENDA') || est.includes('SELL') || est.includes('BAIXA')) {
          accelDir = 'venda';
        }
      } else if (alertAcelExaustao && est.includes('EXAUSTAO')) {
        accelMet = true;
        if (est.includes('ALTA') || est.includes('HIGH') || est.includes('COMPRA')) {
          accelDir = 'venda';
        } else if (est.includes('BAIXA') || est.includes('LOW') || est.includes('VENDA')) {
          accelDir = 'compra';
        }
      } else if (alertAcelCompressao && est.includes('COMPRESSAO')) {
        accelMet = true;
        accelDir = null;
      }
    }

    let levelsMet = false;
    if (marketData && gammaLevels && selectedNiveis.length > 0) {
      const price = Number(marketData.price);
      for (const key of selectedNiveis) {
        const val = Number((gammaLevels as any)[key]);
        if (!isNaN(val) && val > 0 && Math.abs(price - val) <= alertNivelDist) {
          levelsMet = true;
          break;
        }
      }
    }

    let avgBuyForce = 50;
    const activeForces = (forces || []).filter(f => {
      const cfg = (forcesConfig || []).find(c => c.id === f.symbol || c.nome === f.symbol);
      return cfg ? cfg.ativo : true;
    });
    if (activeForces.length > 0) {
      const sumBuy = activeForces.reduce((acc, f) => acc + (Number(f.buy) || 0), 0);
      avgBuyForce = sumBuy / activeForces.length;
    }

    let forceMet = false;
    let forceDir: 'compra' | 'venda' | null = null;
    if (alertForceAtivo) {
      if (avgBuyForce >= alertForceBuyMin) {
        forceMet = true;
        forceDir = 'compra';
      } else if (avgBuyForce <= alertForceSellMax) {
        forceMet = true;
        forceDir = 'venda';
      }
    }

    let viesMet = false;
    let viesDir: 'compra' | 'venda' | null = null;
    if (alertForceViesShift && gammaLevels && gammaLevels.gamma_bias && gammaLevels.gamma_bias !== '--') {
      // Shift triggers when we have a bias, in this panel we just display active status if bias is non-neutral
      const viesUpper = gammaLevels.gamma_bias.toUpperCase();
      if (viesUpper.includes('COMPRA') || viesUpper.includes('BULL') || viesUpper.includes('CALL')) {
        viesMet = true;
        viesDir = 'compra';
      } else if (viesUpper.includes('VENDA') || viesUpper.includes('BEAR') || viesUpper.includes('PUT')) {
        viesMet = true;
        viesDir = 'venda';
      }
    }

    let forceViesDir: 'compra' | 'venda' | null = null;
    if (forceMet && viesMet) {
      if (forceDir === viesDir) {
        forceViesDir = forceDir;
      }
    } else if (forceMet) {
      forceViesDir = forceDir;
    } else if (viesMet) {
      forceViesDir = viesDir;
    }

    const conditions = [
      { name: 'Sentimento MACRO', active: alertSentAtivo, met: sentimentMet, dir: sentimentDir },
      { name: 'Sentimento MICRO', active: alertSentMicroAtivo, met: sentimentMicroMet, dir: sentimentMicroDir },
      { name: 'Block Trade', active: alertBtAtivo, met: blockTradeMet, dir: blockTradeDir },
      { name: 'Delta / Ratio', active: alertDeltaAtivo, met: deltaMet, dir: deltaDir },
      { name: 'Acelerômetro', active: alertAcelAtivo, met: accelMet, dir: accelDir },
      { name: 'Níveis de Proximidade', active: alertNivelAtivo, met: levelsMet, dir: null },
      { name: 'Força / Viés', active: alertForceAtivo || alertForceViesShift, met: forceMet || viesMet, dir: forceViesDir }
    ];

    const activeConds = conditions.filter(c => c.active);
    const metConds = activeConds.filter(c => c.met);

    const directions = metConds
      .map(c => c.dir)
      .filter((d): d is 'compra' | 'venda' => d !== null);

    const allCompra = directions.length === 0 || directions.every(d => d === 'compra');
    const allVenda = directions.length === 0 || directions.every(d => d === 'venda');
    const directionConsistent = allCompra || allVenda;

    return (
      <div className="space-y-2 mt-3 p-3 bg-slate-900/50 rounded border border-slate-800">
        <div className="text-xs font-bold text-slate-300">📊 Status das Condições da Lógica:</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {conditions.map((c, i) => (
            <div key={i} className={`flex items-center gap-2 text-xs p-1.5 rounded ${c.active ? 'bg-slate-800' : 'opacity-30'}`}>
              <span className={c.met && c.active ? 'text-green-400' : 'text-slate-400'}>
                {c.met && c.active ? '🟢' : '🔴'}
              </span>
              <span className="font-bold text-slate-200">
                {c.name} {c.active && c.met && c.dir ? `(${c.dir.toUpperCase()})` : ''}
              </span>
            </div>
          ))}
        </div>
        {alertMode === 'logica' && (
          <div className={`mt-2 p-2 rounded text-xs font-bold text-center border ${
            metConds.length === activeConds.length && activeConds.length > 0
              ? directionConsistent
                ? 'bg-green-950/20 border-green-500/30 text-green-400'
                : 'bg-red-950/20 border-red-500/30 text-red-400'
              : 'bg-yellow-950/20 border-yellow-500/30 text-yellow-400'
          }`}>
            {metConds.length === activeConds.length && activeConds.length > 0 ? (
              directionConsistent ? (
                `🔥 TODAS as ${activeConds.length} condições ativadas foram atendidas na mesma direção (${directions.length === 0 ? 'NEUTRO' : (allCompra ? 'COMPRA' : 'VENDA')})!`
              ) : (
                `⚠️ Condições atendidas, mas com direções divergentes (mismatch de sentido)!`
              )
            ) : (
              `⌛ Aguardando: ${metConds.length}/${activeConds.length} condições atendidas.`
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="glass p-6 rounded-lg max-w-5xl mx-auto my-4 border border-slate-700">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">🔔</span>
        <h2 className="text-2xl font-bold text-yellow-400">Configurações de Alertas</h2>
      </div>

      {message && (
        <div className={`p-3 rounded mb-4 text-xs font-bold border ${message.type === 'success' ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-red-500/50 bg-red-500/10 text-red-400'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSaveAll} className="space-y-6">
        {/* Modo de Operação */}
        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-bold text-white">🎛️ Modo de Operação dos Alertas</div>
              <div className="text-xs text-slate-400 mt-1">Escolha como os alertas devem se comportar</div>
            </div>
            <div className="logic-mode-toggle flex border border-slate-700 rounded overflow-hidden">
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-bold transition-all ${alertMode === 'individual' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400'}`}
                onClick={() => setAlertMode('individual')}
              >
                📋 Individual
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-bold transition-all ${alertMode === 'logica' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400'}`}
                onClick={() => setAlertMode('logica')}
              >
                🔗 Lógica
              </button>
            </div>
          </div>
          <div className="text-xs text-slate-400 leading-relaxed p-3 bg-slate-950/50 rounded border border-slate-800 font-mono">
            {alertMode === 'individual' ? (
              <span><strong className="text-blue-300">📋 Modo Individual:</strong> Cada tipo de alerta dispara independentemente quando sua condição é atendida.</span>
            ) : (
              <span><strong className="text-blue-300">🔗 Modo Lógica:</strong> Alerta combinado só dispara quando TODAS as condições ativadas estiverem satisfeitas simultaneamente e na mesma direção.</span>
            )}
          </div>
          {renderLogicalStatus()}
        </div>

        {/* Cooldown Information Banner */}
        <div className="bg-yellow-900/10 border border-yellow-800/30 p-3 rounded-lg">
          <div className="text-xs text-yellow-300/90 leading-relaxed font-mono">
            <strong>💡 Cooldown:</strong> Tempo mínimo em minutos entre disparos consecutivos para evitar excesso de alertas.
            <br /><strong>🔓 Desarmar:</strong> No popup de alerta, o botão silencia temporariamente as notificações daquele tipo.
          </div>
        </div>

        {/* Sub-abas de Alertas */}
        <div className="flex gap-1 mb-4 border-b border-slate-700 pb-2 overflow-x-auto scrollbar-hide">
          {[
            { id: 'sentimento', label: '📊 Sentimento MACRO' },
            { id: 'sentimento_micro', label: '🔬 Sentimento MICRO' },
            { id: 'blocktrades', label: '🐋 Block Trades' },
            { id: 'delta', label: '📈 Delta / Ratio' },
            { id: 'acelerometro', label: '⚡ Acelerômetro' },
            { id: 'niveis', label: '🗺️ Níveis' },
            { id: 'forca_vies', label: '🧬 Força / Viés' },
            { id: 'pva', label: '🔥 PVA Clímax' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`alert-tab-btn px-3 py-1.5 rounded text-xs transition font-bold ${activeTab === tab.id ? 'active bg-blue-600 text-white' : 'bg-slate-800/50 text-slate-400'}`}
              onClick={() => setActiveTab(tab.id as any)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ABA: Sentimento MACRO */}
        {activeTab === 'sentimento' && (
          <div className="alert-config-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
              <label className="text-xs text-slate-400 uppercase block mb-1">Status do Alerta</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={alertSentAtivo}
                  onChange={(e) => setAlertSentAtivo(e.target.checked)}
                  className="accent-blue-500"
                />
                <span className="text-xs text-slate-300 font-bold">Ativar Alerta de Sentimento MACRO</span>
              </div>
            </div>
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
              <label className="text-xs text-slate-400 uppercase block mb-1">Limite Superior (Comprador)</label>
              <input
                type="number"
                value={alertSentMax}
                onChange={(e) => setAlertSentMax(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
              />
            </div>
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
              <label className="text-xs text-slate-400 uppercase block mb-1">Limite Inferior (Vendedor)</label>
              <input
                type="number"
                value={alertSentMin}
                onChange={(e) => setAlertSentMin(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
              />
            </div>
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
              <label className="text-xs text-slate-400 uppercase block mb-1">⏱️ Cooldown (minutos)</label>
              <input
                type="number"
                value={alertSentCooldown}
                onChange={(e) => setAlertSentCooldown(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
              />
            </div>
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
              <label className="text-xs text-slate-400 uppercase block mb-1">Telegram</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={alertSentTelegram}
                  onChange={(e) => setAlertSentTelegram(e.target.checked)}
                  className="accent-blue-500"
                />
                <span className="text-xs text-slate-300">Notificar via Telegram</span>
              </div>
            </div>
          </div>
        )}

        {/* ABA: Sentimento MICRO */}
        {activeTab === 'sentimento_micro' && (
          <div className="alert-config-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
              <label className="text-xs text-slate-400 uppercase block mb-1">Status do Alerta</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={alertSentMicroAtivo}
                  onChange={(e) => setAlertSentMicroAtivo(e.target.checked)}
                  className="accent-blue-500"
                />
                <span className="text-xs text-slate-300 font-bold">Ativar Alerta de Sentimento MICRO</span>
              </div>
            </div>
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
              <label className="text-xs text-slate-400 uppercase block mb-1">Limite Superior (Comprador)</label>
              <input
                type="number"
                value={alertSentMicroMax}
                onChange={(e) => setAlertSentMicroMax(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
              />
            </div>
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
              <label className="text-xs text-slate-400 uppercase block mb-1">Limite Inferior (Vendedor)</label>
              <input
                type="number"
                value={alertSentMicroMin}
                onChange={(e) => setAlertSentMicroMin(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
              />
            </div>
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
              <label className="text-xs text-slate-400 uppercase block mb-1">⏱️ Cooldown (minutos)</label>
              <input
                type="number"
                value={alertSentMicroCooldown}
                onChange={(e) => setAlertSentMicroCooldown(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
              />
            </div>
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
              <label className="text-xs text-slate-400 uppercase block mb-1">Telegram</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={alertSentMicroTelegram}
                  onChange={(e) => setAlertSentMicroTelegram(e.target.checked)}
                  className="accent-blue-500"
                />
                <span className="text-xs text-slate-300">Notificar via Telegram</span>
              </div>
            </div>
          </div>
        )}

        {/* ABA: Block Trades */}
        {activeTab === 'blocktrades' && (
          <div className="alert-config-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
              <label className="text-xs text-slate-400 uppercase block mb-1">Status do Alerta</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={alertBtAtivo}
                  onChange={(e) => setAlertBtAtivo(e.target.checked)}
                  className="accent-blue-500"
                />
                <span className="text-xs text-slate-300 font-bold">Ativar Alerta (Novos Trades)</span>
              </div>
            </div>
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
              <label className="text-xs text-slate-400 uppercase block mb-1">Volume Mínimo (Contratos)</label>
              <input
                type="number"
                value={alertBtVol}
                onChange={(e) => setAlertBtVol(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
              />
            </div>
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
              <label className="text-xs text-slate-400 uppercase block mb-1">⏱️ Cooldown (minutos)</label>
              <input
                type="number"
                value={alertBtCooldown}
                onChange={(e) => setAlertBtCooldown(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
              />
            </div>
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
              <label className="text-xs text-slate-400 uppercase block mb-1">Telegram</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={alertBtTelegram}
                  onChange={(e) => setAlertBtTelegram(e.target.checked)}
                  className="accent-blue-500"
                />
                <span className="text-xs text-slate-300">Notificar via Telegram</span>
              </div>
            </div>
          </div>
        )}

        {/* ABA: Delta */}
        {activeTab === 'delta' && (
          <div className="alert-config-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
              <label className="text-xs text-slate-400 uppercase block mb-1">Status do Alerta</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={alertDeltaAtivo}
                  onChange={(e) => setAlertDeltaAtivo(e.target.checked)}
                  className="accent-blue-500"
                />
                <span className="text-xs text-slate-300 font-bold">Ativar Alerta de Delta/Ratio</span>
              </div>
            </div>
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
              <label className="text-xs text-slate-400 uppercase block mb-1">Ratio Vendedor (Abaixo de)</label>
              <input
                type="number"
                step="0.01"
                value={alertDeltaSell}
                onChange={(e) => setAlertDeltaSell(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
              />
            </div>
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
              <label className="text-xs text-slate-400 uppercase block mb-1">Ratio Comprador (Acima de)</label>
              <input
                type="number"
                step="0.01"
                value={alertDeltaBuy}
                onChange={(e) => setAlertDeltaBuy(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
              />
            </div>
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
              <label className="text-xs text-slate-400 uppercase block mb-1">Volume Mínimo (Filtro)</label>
              <input
                type="number"
                value={alertDeltaVolMin}
                onChange={(e) => setAlertDeltaVolMin(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
              />
            </div>
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
              <label className="text-xs text-slate-400 uppercase block mb-1">⏱️ Cooldown (minutos)</label>
              <input
                type="number"
                value={alertDeltaCooldown}
                onChange={(e) => setAlertDeltaCooldown(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
              />
            </div>
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
              <label className="text-xs text-slate-400 uppercase block mb-1">Telegram</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={alertDeltaTelegram}
                  onChange={(e) => setAlertDeltaTelegram(e.target.checked)}
                  className="accent-blue-500"
                />
                <span className="text-xs text-slate-300">Notificar via Telegram</span>
              </div>
            </div>
          </div>
        )}

        {/* ABA: Acelerômetro */}
        {activeTab === 'acelerometro' && (
          <div className="alert-config-grid grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
              <label className="text-xs text-slate-400 uppercase block mb-2">Ativar Alerta de Acelerômetro</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={alertAcelAtivo}
                  onChange={(e) => setAlertAcelAtivo(e.target.checked)}
                  className="accent-blue-500 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs text-slate-300">Dispara nos eventos ativos</span>
              </div>
            </div>

            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 md:col-span-2">
              <label className="text-xs text-slate-400 uppercase block mb-2">Tipos de Eventos Monitorados</label>
              <div className="flex flex-wrap gap-4 py-1.5">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={alertAcelExplosao}
                    onChange={(e) => setAlertAcelExplosao(e.target.checked)}
                    className="accent-yellow-500 w-4 h-4"
                  />
                  <span>💥 EXPLOSÃO</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={alertAcelExaustao}
                    onChange={(e) => setAlertAcelExaustao(e.target.checked)}
                    className="accent-red-500 w-4 h-4"
                  />
                  <span>🔄 EXAUSTÃO</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={alertAcelCompressao}
                    onChange={(e) => setAlertAcelCompressao(e.target.checked)}
                    className="accent-blue-500 w-4 h-4"
                  />
                  <span>📦 COMPRESSÃO</span>
                </label>
              </div>
            </div>

            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
              <label className="text-xs text-slate-400 uppercase block mb-1">⏱️ Cooldown (minutos)</label>
              <input
                type="number"
                value={alertAcelCooldown}
                onChange={(e) => setAlertAcelCooldown(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
              />
            </div>

            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
              <label className="text-xs text-slate-400 uppercase block mb-2">Telegram</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={alertAcelTelegram}
                  onChange={(e) => setAlertAcelTelegram(e.target.checked)}
                  className="accent-blue-500 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs text-slate-300">Notificar via Telegram</span>
              </div>
            </div>
          </div>
        )}

        {/* ABA: Níveis */}
        {activeTab === 'niveis' && (
          <div className="space-y-3">
            <div className="alert-config-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
                <label className="text-xs text-slate-400 uppercase block mb-2">Ativar Alerta de Proximidade</label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={alertNivelAtivo}
                    onChange={(e) => setAlertNivelAtivo(e.target.checked)}
                    className="accent-blue-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs text-slate-300">Alerta se preço aproximar</span>
                </div>
              </div>
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-1">Distância (Pontos)</label>
                <input
                  type="number"
                  step="0.1"
                  value={alertNivelDist}
                  onChange={(e) => setAlertNivelDist(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
                />
              </div>
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-1">⏱️ Cooldown (minutos)</label>
                <input
                  type="number"
                  value={alertNivelCooldown}
                  onChange={(e) => setAlertNivelCooldown(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
                />
              </div>
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
                <label className="text-xs text-slate-400 uppercase block mb-2">Telegram</label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={alertNivelTelegram}
                    onChange={(e) => setAlertNivelTelegram(e.target.checked)}
                    className="accent-blue-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs text-slate-300">Notificar via Telegram</span>
                </div>
              </div>
            </div>

            <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
              <label className="text-xs text-slate-400 uppercase block mb-3 font-semibold">Selecione quais Níveis monitorar</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {[
                  { key: 'hvl', label: 'HVL' },
                  { key: 'call', label: 'Call' },
                  { key: 'put', label: 'Put' },
                  { key: 'max1d', label: '1D Max' },
                  { key: 'min1d', label: '1D Min' },
                  { key: 'prev', label: 'Ajuste' },
                  { key: 'prevH', label: 'Máx Ant' },
                  { key: 'prevL', label: 'Mín Ant' },
                  { key: 'hvl0', label: 'HVL 0DTE' },
                  { key: 'call0', label: 'Call 0DTE' },
                  { key: 'put0', label: 'Put 0DTE' },
                  { key: 'gwall', label: 'GWall 0DTE' }
                ].map(level => (
                  <label key={level.key} className="flex items-center gap-2 bg-slate-950/40 p-2 rounded border border-slate-800/80 cursor-pointer select-none hover:bg-slate-950/80 transition">
                    <input
                      type="checkbox"
                      checked={selectedNiveis.includes(level.key)}
                      onChange={() => toggleNivelSelection(level.key)}
                      className="accent-blue-500 w-4 h-4"
                    />
                    <span className="text-xs text-slate-200">{level.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
        {/* ABA: Força / Viés */}
        {activeTab === 'forca_vies' && (
          <div className="space-y-4">
            <div className="alert-config-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
                <label className="text-xs text-slate-400 uppercase block mb-1">Status do Alerta de Força</label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={alertForceAtivo}
                    onChange={(e) => setAlertForceAtivo(e.target.checked)}
                    className="accent-blue-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs text-slate-300 font-bold">Ativar Alerta de Força</span>
                </div>
              </div>

              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
                <label className="text-xs text-slate-400 uppercase block mb-1">Mudança do Viés Gamma</label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={alertForceViesShift}
                    onChange={(e) => setAlertForceViesShift(e.target.checked)}
                    className="accent-blue-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs text-slate-300 font-bold">Alerta ao Mudar Viés Gamma</span>
                </div>
              </div>

              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-1">Limite Compra Força Média (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={alertForceBuyMin}
                  onChange={(e) => setAlertForceBuyMin(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
                />
              </div>

              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-1">Limite Venda Força Média (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={alertForceSellMax}
                  onChange={(e) => setAlertForceSellMax(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
                />
              </div>

              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-1">⏱️ Cooldown (minutos)</label>
                <input
                  type="number"
                  min="1"
                  value={alertForceCooldown}
                  onChange={(e) => setAlertForceCooldown(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
                />
              </div>

              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
                <label className="text-xs text-slate-400 uppercase block mb-1">Telegram</label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={alertForceTelegram}
                    onChange={(e) => setAlertForceTelegram(e.target.checked)}
                    className="accent-blue-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs text-slate-300">Notificar via Telegram</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-800 text-xs text-slate-300 space-y-2">
              <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                <span>📋</span> Valores Atuais (Em Tempo Real)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <span className="text-slate-400">Média Força de Compra (Ativos Ativos):</span>{' '}
                  <span className="font-bold font-mono text-yellow-400">
                    {(() => {
                      let avgBuyForce = 50;
                      const activeForces = (forces || []).filter(f => {
                        const cfg = (forcesConfig || []).find(c => c.id === f.symbol || c.nome === f.symbol);
                        return cfg ? cfg.ativo : true;
                      });
                      if (activeForces.length > 0) {
                        const sumBuy = activeForces.reduce((acc, f) => acc + (Number(f.buy) || 0), 0);
                        avgBuyForce = sumBuy / activeForces.length;
                      }
                      return `${avgBuyForce.toFixed(1)}%`;
                    })()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Viés Gamma Atual:</span>{' '}
                  <span className={`font-bold uppercase ${gammaLevels?.gamma_bias?.toUpperCase().includes('COMPRA') || gammaLevels?.gamma_bias?.toUpperCase().includes('BULL') ? 'text-green-400' : gammaLevels?.gamma_bias?.toUpperCase().includes('VENDA') || gammaLevels?.gamma_bias?.toUpperCase().includes('BEAR') ? 'text-red-400' : 'text-slate-400'}`}>
                    {gammaLevels?.gamma_bias || '--'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA: PVA Clímax */}
        {activeTab === 'pva' && (
          <div className="alert-config-grid flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
                <label className="text-xs text-slate-400 uppercase block mb-1">Status do Alerta</label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={alertPvaAtivo}
                    onChange={(e) => setAlertPvaAtivo(e.target.checked)}
                    className="accent-blue-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs text-slate-300 font-bold">Ativar Alerta PVA Clímax (200%)</span>
                </div>
              </div>

              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-1">⏱️ Cooldown (minutos)</label>
                <input
                  type="number"
                  min="1"
                  value={alertPvaCooldown}
                  onChange={(e) => setAlertPvaCooldown(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200 font-mono"
                />
              </div>

              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
                <label className="text-xs text-slate-400 uppercase block mb-1">Telegram</label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={alertPvaTelegram}
                    onChange={(e) => setAlertPvaTelegram(e.target.checked)}
                    className="accent-blue-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs text-slate-300">Notificar via Telegram</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-800 text-xs text-slate-300 space-y-2">
              <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                <span>💡</span> Detalhes do Indicador PVA Clímax (200% Volume)
              </h4>
              <p className="text-slate-400 leading-relaxed">
                Este alerta monitora o candle mais recente da instância ativa do painel e sinaliza quando ocorre um <strong>Clímax de Volume (200% da média de volume das últimas 10 velas)</strong>.
              </p>
              <ul className="list-disc list-inside text-slate-400 space-y-1 pl-1">
                <li>Ocorre quando o Volume do candle atual é igual ou maior que 2x a média de volume recente das últimas 10 velas.</li>
              </ul>
            </div>
          </div>
        )}

        <button
          type="submit"
          className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold p-3 rounded text-xs w-full transition flex items-center justify-center gap-2 uppercase tracking-wide border border-yellow-500/20 shadow-[0_0_15px_rgba(234,179,8,0.05)]"
        >
          <span>💾</span>
          Salvar Todas as Configurações de Alertas
        </button>
      </form>
    </div>
  );
};
