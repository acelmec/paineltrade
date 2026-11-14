import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export const AlertSettings: React.FC = () => {
  const { settings, allSettings, saveSettings, panels, activePanel, marketData, gammaLevels, forces } = useApp();
  
  // Aba Superior: 'configurar' (form clássico com seletor de ativo) vs 'criados' (tabela consolidada)
  const [topTab, setTopTab] = useState<'configurar' | 'criados'>('configurar');
  
  // Ativo Selecionado para Configuração
  const [selectedAssetId, setSelectedAssetId] = useState<string>(() => {
    return activePanel?.id || (panels && panels[0]?.id) || 'default';
  });

  // Sub-abas do formulário de configuração
  const [activeTab, setActiveTab] = useState<'sentimento' | 'sentimento_micro' | 'blocktrades' | 'delta' | 'acelerometro' | 'niveis' | 'forca_vies' | 'pva'>('sentimento');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modo Global do Ativo
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

  // Sincronizar seletor quando panels carregarem ou activePanel mudar
  useEffect(() => {
    if (selectedAssetId === 'default' && (activePanel?.id || (panels && panels[0]?.id))) {
      setSelectedAssetId(activePanel?.id || panels[0].id);
    }
  }, [panels, activePanel?.id]);

  // Carregar dados de configurações para o ativo selecionado
  useEffect(() => {
    const currentAssetSettings = (selectedAssetId && allSettings?.[selectedAssetId])
      ? allSettings[selectedAssetId]
      : (settings?.panel_id === selectedAssetId ? settings : allSettings?.[selectedAssetId] || settings);

    if (currentAssetSettings) {
      setAlertMode(currentAssetSettings.alert_mode || 'individual');
      
      setAlertSentAtivo(currentAssetSettings.alert_sent_ativo || false);
      setAlertSentMax(currentAssetSettings.alert_sent_max !== undefined ? Number(currentAssetSettings.alert_sent_max) : 75);
      setAlertSentMin(currentAssetSettings.alert_sent_min !== undefined ? Number(currentAssetSettings.alert_sent_min) : 25);
      setAlertSentCooldown(currentAssetSettings.alert_sent_cooldown !== undefined ? Number(currentAssetSettings.alert_sent_cooldown) : 5);
      setAlertSentTelegram(currentAssetSettings.alert_sent_telegram || false);

      setAlertSentMicroAtivo(currentAssetSettings.alert_sent_micro_ativo || false);
      setAlertSentMicroMax(currentAssetSettings.alert_sent_micro_max !== undefined ? Number(currentAssetSettings.alert_sent_micro_max) : 75);
      setAlertSentMicroMin(currentAssetSettings.alert_sent_micro_min !== undefined ? Number(currentAssetSettings.alert_sent_micro_min) : 25);
      setAlertSentMicroCooldown(currentAssetSettings.alert_sent_micro_cooldown !== undefined ? Number(currentAssetSettings.alert_sent_micro_cooldown) : 5);
      setAlertSentMicroTelegram(currentAssetSettings.alert_sent_micro_telegram || false);

      setAlertBtAtivo(currentAssetSettings.alert_bt_ativo || false);
      setAlertBtVol(currentAssetSettings.alert_bt_vol !== undefined ? Number(currentAssetSettings.alert_bt_vol) : 50);
      setAlertBtCooldown(currentAssetSettings.alert_bt_cooldown !== undefined ? Number(currentAssetSettings.alert_bt_cooldown) : 5);
      setAlertBtTelegram(currentAssetSettings.alert_bt_telegram || false);

      setAlertDeltaAtivo(currentAssetSettings.alert_delta_ativo || false);
      setAlertDeltaSell(currentAssetSettings.alert_delta_sell !== undefined ? Number(currentAssetSettings.alert_delta_sell) : 0.5);
      setAlertDeltaBuy(currentAssetSettings.alert_delta_buy !== undefined ? Number(currentAssetSettings.alert_delta_buy) : 1.5);
      setAlertDeltaVolMin(currentAssetSettings.alert_delta_vol_min !== undefined ? Number(currentAssetSettings.alert_delta_vol_min) : 50);
      setAlertDeltaCooldown(currentAssetSettings.alert_delta_cooldown !== undefined ? Number(currentAssetSettings.alert_delta_cooldown) : 5);
      setAlertDeltaTelegram(currentAssetSettings.alert_delta_telegram || false);

      setAlertAcelAtivo(currentAssetSettings.alert_acel_ativo || false);
      setAlertAcelExplosao(currentAssetSettings.alert_acel_explosao || false);
      setAlertAcelExaustao(currentAssetSettings.alert_acel_exaustao || false);
      setAlertAcelCompressao(currentAssetSettings.alert_acel_compressao || false);
      setAlertAcelCooldown(currentAssetSettings.alert_acel_cooldown !== undefined ? Number(currentAssetSettings.alert_acel_cooldown) : 5);
      setAlertAcelTelegram(currentAssetSettings.alert_acel_telegram || false);

      setAlertNivelAtivo(currentAssetSettings.alert_nivel_ativo || false);
      setAlertNivelDist(currentAssetSettings.alert_nivel_dist !== undefined ? Number(currentAssetSettings.alert_nivel_dist) : 25);
      setAlertNivelCooldown(currentAssetSettings.alert_nivel_cooldown !== undefined ? Number(currentAssetSettings.alert_nivel_cooldown) : 10);
      setAlertNivelTelegram(currentAssetSettings.alert_nivel_telegram || false);
      setSelectedNiveis(currentAssetSettings.alert_nivel_niveis || []);

      setAlertForceAtivo(currentAssetSettings.alert_force_ativo || false);
      setAlertForceBuyMin(currentAssetSettings.alert_force_buy_min !== undefined ? Number(currentAssetSettings.alert_force_buy_min) : 75);
      setAlertForceSellMax(currentAssetSettings.alert_force_sell_max !== undefined ? Number(currentAssetSettings.alert_force_sell_max) : 25);
      setAlertForceCooldown(currentAssetSettings.alert_force_cooldown !== undefined ? Number(currentAssetSettings.alert_force_cooldown) : 5);
      setAlertForceTelegram(currentAssetSettings.alert_force_telegram || false);
      setAlertForceViesShift(currentAssetSettings.alert_force_vies_shift || false);

      setAlertPvaAtivo(currentAssetSettings.alert_pva_ativo || false);
      setAlertPvaCooldown(currentAssetSettings.alert_pva_cooldown !== undefined ? Number(currentAssetSettings.alert_pva_cooldown) : 5);
      setAlertPvaTelegram(currentAssetSettings.alert_pva_telegram || false);
    }
  }, [selectedAssetId, allSettings, settings]);

  const handleSaveAlertConfig = async (updatedFields: Partial<any>, targetId?: string) => {
    setMessage(null);
    const destPanelId = targetId || selectedAssetId;
    const success = await saveSettings(updatedFields, destPanelId);
    if (success) {
      setMessage({ text: 'Configuração de Alertas salva no banco de dados com sucesso!', type: 'success' });
    } else {
      setMessage({ text: 'Falha ao salvar configurações de alertas.', type: 'error' });
    }
    return success;
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
        if (est.includes('COMPRA') || est.includes('BUY') || est.includes('ALTA')) {
          accelDir = 'venda';
        } else if (est.includes('VENDA') || est.includes('SELL') || est.includes('BAIXA')) {
          accelDir = 'compra';
        }
      } else if (alertAcelCompressao && (est.includes('COMPRESSAO') || est.includes('LATERAL') || est.includes('CONSOLIDACAO'))) {
        accelMet = true;
        accelDir = null;
      }
    }

    let levelsMet = false;
    if (gammaLevels && (gammaLevels as any)?.levels && selectedNiveis.length > 0 && marketData) {
      const currentPrice = Number(marketData.price || 0);
      if (currentPrice > 0) {
        for (const key of selectedNiveis) {
          const lvlPrice = Number((gammaLevels as any)?.levels[key]);
          if (!isNaN(lvlPrice) && Math.abs(currentPrice - lvlPrice) <= alertNivelDist) {
            levelsMet = true;
            break;
          }
        }
      }
    }

    let forceMet = false;
    let forceDir: 'compra' | 'venda' | null = null;
    if (forces && forces.length > 0) {
      const totalPower = forces.reduce((acc: number, f: any) => acc + (Number(f.power) || 0), 0);
      const avgPower = totalPower / forces.length;
      if (avgPower >= alertForceBuyMin) {
        forceMet = true;
        forceDir = 'compra';
      } else if (avgPower <= alertForceSellMax) {
        forceMet = true;
        forceDir = 'venda';
      }
    }

    let viesMet = false;
    let viesDir: 'compra' | 'venda' | null = null;
    if (alertForceViesShift && gammaLevels && gammaLevels.gamma_bias && gammaLevels.gamma_bias !== '--') {
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

  // Helper para alternar status direto na Aba de Alertas Criados
  const handleToggleAlertDirect = async (panelId: string, keyAtivo: string, currentValue: boolean) => {
    await handleSaveAlertConfig({ [keyAtivo]: !currentValue }, panelId);
  };

  const handleToggleTelegramDirect = async (panelId: string, keyTelegram: string, currentValue: boolean) => {
    await handleSaveAlertConfig({ [keyTelegram]: !currentValue }, panelId);
  };

  // Definição dos tipos de alerta para tabela de Alertas Criados
  const ALERT_TYPES_DEF: {
    typeId: 'sentimento' | 'sentimento_micro' | 'blocktrades' | 'delta' | 'acelerometro' | 'niveis' | 'forca_vies' | 'pva';
    name: string;
    icon: string;
    keyAtivo: string;
    keyTelegram: string;
    getSummary: (cfg: any) => string;
  }[] = [
    {
      typeId: 'sentimento',
      name: 'Sentimento MACRO',
      icon: '📊',
      keyAtivo: 'alert_sent_ativo',
      keyTelegram: 'alert_sent_telegram',
      getSummary: (cfg) => `Sup: ≥${cfg.alert_sent_max ?? 75}% | Inf: ≤${cfg.alert_sent_min ?? 25}% | Cd: ${cfg.alert_sent_cooldown ?? 5}m`
    },
    {
      typeId: 'sentimento_micro',
      name: 'Sentimento MICRO',
      icon: '🔬',
      keyAtivo: 'alert_sent_micro_ativo',
      keyTelegram: 'alert_sent_micro_telegram',
      getSummary: (cfg) => `Sup: ≥${cfg.alert_sent_micro_max ?? 75}% | Inf: ≤${cfg.alert_sent_micro_min ?? 25}% | Cd: ${cfg.alert_sent_micro_cooldown ?? 5}m`
    },
    {
      typeId: 'blocktrades',
      name: 'Block Trades',
      icon: '🐋',
      keyAtivo: 'alert_bt_ativo',
      keyTelegram: 'alert_bt_telegram',
      getSummary: (cfg) => `Volume Mín: ≥${cfg.alert_bt_vol ?? 50} lotes | Cd: ${cfg.alert_bt_cooldown ?? 5}m`
    },
    {
      typeId: 'delta',
      name: 'Delta / Ratio',
      icon: '📈',
      keyAtivo: 'alert_delta_ativo',
      keyTelegram: 'alert_delta_telegram',
      getSummary: (cfg) => `Compra: ≥${cfg.alert_delta_buy ?? 1.5} | Venda: ≤${cfg.alert_delta_sell ?? 0.5} | Vol: ≥${cfg.alert_delta_vol_min ?? 50} | Cd: ${cfg.alert_delta_cooldown ?? 5}m`
    },
    {
      typeId: 'acelerometro',
      name: 'Acelerômetro',
      icon: '⚡',
      keyAtivo: 'alert_acel_ativo',
      keyTelegram: 'alert_acel_telegram',
      getSummary: (cfg) => {
        const triggers = [];
        if (cfg.alert_acel_explosao) triggers.push('Explosão');
        if (cfg.alert_acel_exaustao) triggers.push('Exaustão');
        if (cfg.alert_acel_compressao) triggers.push('Compressão');
        return triggers.length > 0 ? `${triggers.join(', ')} | Cd: ${cfg.alert_acel_cooldown ?? 5}m` : `Padrão | Cd: ${cfg.alert_acel_cooldown ?? 5}m`;
      }
    },
    {
      typeId: 'niveis',
      name: 'Níveis de Proximidade',
      icon: '🗺️',
      keyAtivo: 'alert_nivel_ativo',
      keyTelegram: 'alert_nivel_telegram',
      getSummary: (cfg) => `Distância: ≤${cfg.alert_nivel_dist ?? 25} pts | Níveis: ${(cfg.alert_nivel_niveis || []).length} selecionados | Cd: ${cfg.alert_nivel_cooldown ?? 10}m`
    },
    {
      typeId: 'forca_vies',
      name: 'Força / Viés',
      icon: '🧬',
      keyAtivo: 'alert_force_ativo',
      keyTelegram: 'alert_force_telegram',
      getSummary: (cfg) => `Compra: ≥${cfg.alert_force_buy_min ?? 75}% | Venda: ≤${cfg.alert_force_sell_max ?? 25}% | Cd: ${cfg.alert_force_cooldown ?? 5}m`
    },
    {
      typeId: 'pva',
      name: 'PVA Clímax (200% Vol)',
      icon: '🔥',
      keyAtivo: 'alert_pva_ativo',
      keyTelegram: 'alert_pva_telegram',
      getSummary: (cfg) => `Clímax 2x Média (10 velas) | Cd: ${cfg.alert_pva_cooldown ?? 5}m`
    }
  ];

  return (
    <div className="glass p-6 rounded-lg max-w-5xl mx-auto my-4 border border-slate-700">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔔</span>
          <div>
            <h2 className="text-2xl font-bold text-yellow-400">Configurações de Alertas</h2>
            <p className="text-xs text-slate-400">Configure limites técnicos por ativo e gerencie os alertas em segundo plano.</p>
          </div>
        </div>

        {/* Abas Principais: Configurar Alertas vs Alertas Criados */}
        <div className="flex bg-slate-900 border border-slate-700 rounded p-1 w-fit">
          <button
            type="button"
            onClick={() => setTopTab('configurar')}
            className={`px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-1.5 ${
              topTab === 'configurar'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>⚙️</span> Configurar Alertas
          </button>
          <button
            type="button"
            onClick={() => setTopTab('criados')}
            className={`px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-1.5 ${
              topTab === 'criados'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>📋</span> Alertas Criados
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded mb-4 text-xs font-bold border ${message.type === 'success' ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-red-500/50 bg-red-500/10 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* ABA 2: ALERTAS CRIADOS (TABELA CONSOLIDADA DE TODOS OS ATIVOS) */}
      {topTab === 'criados' && (
        <div className="space-y-4">
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex justify-between items-center">
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>📋</span> Visão Consolidada de Alertas por Ativo
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Ative ou desative regras e notificações do Telegram diretamente nesta tabela.
              </div>
            </div>
            <span className="text-xs font-mono bg-blue-950/40 text-blue-300 border border-blue-800/40 px-2 py-1 rounded">
              {panels.length} Ativo(s) Registrado(s)
            </span>
          </div>

          <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden shadow-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900/70 border-b border-slate-800 text-slate-400 uppercase font-mono text-[11px]">
                    <th className="py-2.5 px-3">Ativo</th>
                    <th className="py-2.5 px-3">Tipo de Alerta</th>
                    <th className="py-2.5 px-3">Parâmetros / Resumo</th>
                    <th className="py-2.5 px-3 text-center">Alerta Ativo</th>
                    <th className="py-2.5 px-3 text-center">Telegram</th>
                    <th className="py-2.5 px-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {panels.map((p) => {
                    const pSettings = (allSettings && allSettings[p.id]) || (settings?.panel_id === p.id ? settings : {});
                    return ALERT_TYPES_DEF.map((alertDef) => {
                      const isAlertAtivo = pSettings[alertDef.keyAtivo] === true;
                      const isTelegramAtivo = pSettings[alertDef.keyTelegram] === true;
                      return (
                        <tr
                          key={`${p.id}_${alertDef.typeId}`}
                          className="hover:bg-slate-900/30 transition text-slate-300"
                        >
                          <td className="py-2.5 px-3 font-bold text-white flex items-center gap-1.5">
                            <span className="text-blue-400">📈</span>
                            <span>{p.name}</span>
                            <span className="text-[10px] text-slate-500 font-normal">({p.instance_id})</span>
                          </td>
                          <td className="py-2.5 px-3 font-medium">
                            <span className="mr-1.5">{alertDef.icon}</span>
                            {alertDef.name}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                            {alertDef.getSummary(pSettings)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleAlertDirect(p.id, alertDef.keyAtivo, isAlertAtivo)}
                              className={`px-2.5 py-1 rounded text-[10px] font-bold transition ${
                                isAlertAtivo
                                  ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30'
                                  : 'bg-slate-800 text-slate-500 border border-slate-700 hover:text-slate-300'
                              }`}
                            >
                              {isAlertAtivo ? '🟢 ATIVO' : '⚪ DESATIVADO'}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleTelegramDirect(p.id, alertDef.keyTelegram, isTelegramAtivo)}
                              className={`px-2.5 py-1 rounded text-[10px] font-bold transition ${
                                isTelegramAtivo
                                  ? 'bg-sky-600/20 text-sky-300 border border-sky-500/40 hover:bg-sky-600/30'
                                  : 'bg-slate-800 text-slate-500 border border-slate-700 hover:text-slate-300'
                              }`}
                            >
                              {isTelegramAtivo ? '✈️ SIM' : '⚪ NÃO'}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAssetId(p.id);
                                setActiveTab(alertDef.typeId);
                                setTopTab('configurar');
                              }}
                              className="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white px-2 py-1 rounded text-[10px] font-bold transition border border-blue-500/30"
                              title="Editar este alerta"
                            >
                              ✏️ Editar
                            </button>
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA 1: CONFIGURAR ALERTAS (FORMULÁRIO POR ATIVO) */}
      {topTab === 'configurar' && (
        <form onSubmit={handleSaveAll} className="space-y-6">
          {/* Seletor de Ativo */}
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <label className="text-xs font-bold text-white uppercase tracking-wider block mb-0.5">
                📈 Ativo para Configuração
              </label>
              <p className="text-xs text-slate-400">
                Selecione o ativo cujos limites e regras de alertas serão calibrados abaixo.
              </p>
            </div>
            <select
              value={selectedAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-blue-300 font-bold text-xs p-2.5 rounded focus:outline-none focus:border-blue-500 w-full sm:w-64"
            >
              {panels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.instance_id})
                </option>
              ))}
            </select>
          </div>

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
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
                />
              </div>
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-1">Limite Inferior (Vendedor)</label>
                <input
                  type="number"
                  value={alertSentMin}
                  onChange={(e) => setAlertSentMin(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
                />
              </div>
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-1">Cooldown (Minutos)</label>
                <input
                  type="number"
                  value={alertSentCooldown}
                  onChange={(e) => setAlertSentCooldown(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
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
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
                />
              </div>
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-1">Limite Inferior (Vendedor)</label>
                <input
                  type="number"
                  value={alertSentMicroMin}
                  onChange={(e) => setAlertSentMicroMin(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
                />
              </div>
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-1">Cooldown (Minutos)</label>
                <input
                  type="number"
                  value={alertSentMicroCooldown}
                  onChange={(e) => setAlertSentMicroCooldown(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
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
                  <span className="text-xs text-slate-300 font-bold">Ativar Alerta de Block Trades</span>
                </div>
              </div>
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-1">Volume Mínimo</label>
                <input
                  type="number"
                  value={alertBtVol}
                  onChange={(e) => setAlertBtVol(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
                />
              </div>
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-1">Cooldown (Minutos)</label>
                <input
                  type="number"
                  value={alertBtCooldown}
                  onChange={(e) => setAlertBtCooldown(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
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

          {/* ABA: Delta / Ratio */}
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
                <label className="text-xs text-slate-400 uppercase block mb-1">Ratio Venda (Menor ou Igual)</label>
                <input
                  type="number"
                  step="0.1"
                  value={alertDeltaSell}
                  onChange={(e) => setAlertDeltaSell(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
                />
              </div>
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-1">Ratio Compra (Maior ou Igual)</label>
                <input
                  type="number"
                  step="0.1"
                  value={alertDeltaBuy}
                  onChange={(e) => setAlertDeltaBuy(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
                />
              </div>
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-1">Volume Mínimo Filtrado</label>
                <input
                  type="number"
                  value={alertDeltaVolMin}
                  onChange={(e) => setAlertDeltaVolMin(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
                />
              </div>
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-1">Cooldown (Minutos)</label>
                <input
                  type="number"
                  value={alertDeltaCooldown}
                  onChange={(e) => setAlertDeltaCooldown(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
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
            <div className="space-y-4">
              <div className="alert-config-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
                  <label className="text-xs text-slate-400 uppercase block mb-1">Status do Alerta</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={alertAcelAtivo}
                      onChange={(e) => setAlertAcelAtivo(e.target.checked)}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-slate-300 font-bold">Ativar Alerta de Acelerômetro</span>
                  </div>
                </div>
                <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                  <label className="text-xs text-slate-400 uppercase block mb-1">Cooldown (Minutos)</label>
                  <input
                    type="number"
                    value={alertAcelCooldown}
                    onChange={(e) => setAlertAcelCooldown(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
                  />
                </div>
                <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
                  <label className="text-xs text-slate-400 uppercase block mb-1">Telegram</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={alertAcelTelegram}
                      onChange={(e) => setAlertAcelTelegram(e.target.checked)}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-slate-300">Notificar via Telegram</span>
                  </div>
                </div>
              </div>
              <div className="bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-3 font-bold">Disparar Alerta Em:</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="flex items-center gap-2 bg-slate-950 p-2.5 rounded border border-slate-800/80 cursor-pointer hover:border-slate-700">
                    <input
                      type="checkbox"
                      checked={alertAcelExplosao}
                      onChange={(e) => setAlertAcelExplosao(e.target.checked)}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-slate-200 font-medium">💥 Explosão de Fluxo</span>
                  </label>
                  <label className="flex items-center gap-2 bg-slate-950 p-2.5 rounded border border-slate-800/80 cursor-pointer hover:border-slate-700">
                    <input
                      type="checkbox"
                      checked={alertAcelExaustao}
                      onChange={(e) => setAlertAcelExaustao(e.target.checked)}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-slate-200 font-medium">🛑 Exaustão de Movimento</span>
                  </label>
                  <label className="flex items-center gap-2 bg-slate-950 p-2.5 rounded border border-slate-800/80 cursor-pointer hover:border-slate-700">
                    <input
                      type="checkbox"
                      checked={alertAcelCompressao}
                      onChange={(e) => setAlertAcelCompressao(e.target.checked)}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-slate-200 font-medium">📦 Compressão / Lateralização</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ABA: Níveis */}
          {activeTab === 'niveis' && (
            <div className="space-y-4">
              <div className="alert-config-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
                  <label className="text-xs text-slate-400 uppercase block mb-1">Status do Alerta</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={alertNivelAtivo}
                      onChange={(e) => setAlertNivelAtivo(e.target.checked)}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-slate-300 font-bold">Ativar Alerta de Níveis</span>
                  </div>
                </div>
                <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                  <label className="text-xs text-slate-400 uppercase block mb-1">Distância Máxima (Pontos)</label>
                  <input
                    type="number"
                    value={alertNivelDist}
                    onChange={(e) => setAlertNivelDist(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
                  />
                </div>
                <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                  <label className="text-xs text-slate-400 uppercase block mb-1">Cooldown (Minutos)</label>
                  <input
                    type="number"
                    value={alertNivelCooldown}
                    onChange={(e) => setAlertNivelCooldown(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
                  />
                </div>
                <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
                  <label className="text-xs text-slate-400 uppercase block mb-1">Telegram</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={alertNivelTelegram}
                      onChange={(e) => setAlertNivelTelegram(e.target.checked)}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-slate-300">Notificar via Telegram</span>
                  </div>
                </div>
              </div>
              <div className="bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-2 font-bold">Níveis a Monitorar:</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {gammaLevels && (gammaLevels as any)?.levels ? Object.keys((gammaLevels as any)?.levels).map(k => (
                    <label key={k} className="flex items-center gap-2 bg-slate-950 p-2 rounded border border-slate-800 text-xs text-slate-300 cursor-pointer hover:border-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedNiveis.includes(k)}
                        onChange={() => toggleNivelSelection(k)}
                        className="accent-blue-500"
                      />
                      <span className="truncate">{k.toUpperCase()}</span>
                    </label>
                  )) : (
                    <div className="text-xs text-slate-500 italic col-span-4">Nenhum nível detectado no momento</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ABA: Força / Viés */}
          {activeTab === 'forca_vies' && (
            <div className="alert-config-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
                <label className="text-xs text-slate-400 uppercase block mb-1">Status do Alerta</label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={alertForceAtivo}
                    onChange={(e) => setAlertForceAtivo(e.target.checked)}
                    className="accent-blue-500"
                  />
                  <span className="text-xs text-slate-300 font-bold">Ativar Alerta de Força / Viés</span>
                </div>
              </div>
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-1">Média Mínima Compradora</label>
                <input
                  type="number"
                  value={alertForceBuyMin}
                  onChange={(e) => setAlertForceBuyMin(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
                />
              </div>
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-1">Média Máxima Vendedora</label>
                <input
                  type="number"
                  value={alertForceSellMax}
                  onChange={(e) => setAlertForceSellMax(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
                />
              </div>
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                <label className="text-xs text-slate-400 uppercase block mb-1">Cooldown (Minutos)</label>
                <input
                  type="number"
                  value={alertForceCooldown}
                  onChange={(e) => setAlertForceCooldown(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
                />
              </div>
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
                <label className="text-xs text-slate-400 uppercase block mb-1">Telegram</label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={alertForceTelegram}
                    onChange={(e) => setAlertForceTelegram(e.target.checked)}
                    className="accent-blue-500"
                  />
                  <span className="text-xs text-slate-300">Notificar via Telegram</span>
                </div>
              </div>
              <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
                <label className="text-xs text-slate-400 uppercase block mb-1">Shift de Viés</label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={alertForceViesShift}
                    onChange={(e) => setAlertForceViesShift(e.target.checked)}
                    className="accent-blue-500"
                  />
                  <span className="text-xs text-slate-300">Alertar na Inversão de Viés</span>
                </div>
              </div>
            </div>
          )}

          {/* ABA: PVA Clímax */}
          {activeTab === 'pva' && (
            <div className="space-y-4">
              <div className="alert-config-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
                  <label className="text-xs text-slate-400 uppercase block mb-1">Status do Alerta</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={alertPvaAtivo}
                      onChange={(e) => setAlertPvaAtivo(e.target.checked)}
                      className="accent-blue-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs text-slate-300 font-bold">Ativar Alerta PVA Clímax (200% Vol)</span>
                  </div>
                </div>
                <div className="alert-card bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                  <label className="text-xs text-slate-400 uppercase block mb-1">Cooldown (Minutos)</label>
                  <input
                    type="number"
                    value={alertPvaCooldown}
                    onChange={(e) => setAlertPvaCooldown(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 p-2 rounded text-xs w-full text-slate-200"
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
            Salvar Todas as Configurações de Alertas do Ativo
          </button>
        </form>
      )}
    </div>
  );
};
