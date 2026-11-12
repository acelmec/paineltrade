import React, { useState, useEffect } from 'react';
import {
  INDICATOR_DEFINITIONS,
  PRESET_CHART_TEMPLATES,
  type IndicatorConfig,
  type ChartTemplate
} from '../utils/indicatorRegistry';
import {
  WIDGET_DEFINITIONS,
  MOMENTUM_ASSETS,
  type WidgetConfig,
  type WidgetType
} from '../utils/widgetRegistry';
import { supabase } from '../supabaseClient';
import { useApp } from '../context/AppContext';
import { sanitizeTimeMask } from '../utils/date';
import { playPatternSound, PATTERN_SOUND_PRESETS } from '../utils/soundEffects';

interface IndicatorsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEditingIndicator?: IndicatorConfig | null;
  activeIndicators: IndicatorConfig[];
  onAddIndicator: (type: string, customConfig?: IndicatorConfig) => void;
  onUpdateIndicator: (updated: IndicatorConfig) => void;
  onRemoveIndicator: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onLoadTemplate: (indicators: IndicatorConfig[], widgets?: WidgetConfig[], timeframe?: number) => void;
  activeWidgets?: WidgetConfig[];
  currentTimeframe?: number;
  onAddWidget?: (type: WidgetType, customParams?: Record<string, any>, customTitle?: string) => void;
  onRemoveWidget?: (id: string) => void;
  onToggleWidgetVisibility?: (id: string) => void;
  onResetWidgetPositions?: () => void;
  hideWidgetsTab?: boolean;
  initialTab?: 'catalog' | 'active' | 'templates' | 'widgets';
}

const PRESET_COLORS = [
  '#06b6d4', '#3b82f6', '#6366f1', '#a855f7',
  '#ec4899', '#ef4444', '#f97316', '#eab308',
  '#10b981', '#14b8a6', '#f43f5e', '#ffffff'
];

export const IndicatorsManagerModal: React.FC<IndicatorsManagerModalProps> = ({
  isOpen,
  onClose,
  initialEditingIndicator,
  activeIndicators,
  onAddIndicator,
  onUpdateIndicator,
  onRemoveIndicator,
  onToggleVisibility,
  onLoadTemplate,
  activeWidgets = [],
  currentTimeframe = 5,
  onAddWidget,
  onRemoveWidget,
  onToggleWidgetVisibility,
  onResetWidgetPositions,
  hideWidgetsTab = false,
  initialTab
}) => {
  const { user, customStrategies, settings, panels, activePanel } = useApp();
  const currentPanelObj = panels?.find(p => p.id === activePanel);
  const targetSettings = currentPanelObj?.settings || settings;
  const sysStart = targetSettings?.global_cycle_start || targetSettings?.session1_start || '19:00:00';
  const sysEnd = targetSettings?.global_cycle_end || targetSettings?.session1_end || '18:00:00';
  const [activeTab, setActiveTab] = useState<'catalog' | 'active' | 'templates' | 'widgets'>(initialTab || 'catalog');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODOS');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingIndicator, setEditingIndicator] = useState<IndicatorConfig | null>(initialEditingIndicator || null);
  const [selectedMomentumAsset, setSelectedMomentumAsset] = useState<string>('NVIDIA');
  const [blockTradesLimit, setBlockTradesLimit] = useState<number>(5);
  const [dbStudiesList, setDbStudiesList] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      if (initialEditingIndicator) {
        setEditingIndicator(initialEditingIndicator);
      }
      // Buscar todos os estudos salvos no Supabase para popular o dropdown de modelos
      (async () => {
        try {
          const { data } = await supabase
            .from('painelvm_ml_studies')
            .select('*')
            .order('last_run', { ascending: false });
          if (data && Array.isArray(data)) {
            setDbStudiesList(data);
          }
        } catch (_) {}
      })();
    }
  }, [isOpen, initialTab, initialEditingIndicator]);

  // Chart templates state
  const [userTemplates, setUserTemplates] = useState<ChartTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState<string>('');
  const [saveWidgetsWithTemplate, setSaveWidgetsWithTemplate] = useState<boolean>(true);
  const [saveTimeframeWithTemplate, setSaveTimeframeWithTemplate] = useState<boolean>(true);
  const [setAsDefaultPanel2, setSetAsDefaultPanel2] = useState<boolean>(false);
  const [defaultTemplateId, setDefaultTemplateId] = useState<string | null>(() => {
    try {
      const def = localStorage.getItem('vortex_default_template_panel2');
      if (def) {
        const parsed = JSON.parse(def);
        return parsed?.id || null;
      }
    } catch {}
    return null;
  });
  const [defaultTemplateObj, setDefaultTemplateObj] = useState<ChartTemplate | null>(() => {
    try {
      const def = localStorage.getItem('vortex_default_template_panel2');
      if (def) {
        return JSON.parse(def);
      }
    } catch {}
    return null;
  });
  const [templateMsg, setTemplateMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchUserTemplates = async () => {
    try {
      const savedLocal = localStorage.getItem('vortex_user_chart_templates');
      let templates: ChartTemplate[] = savedLocal ? JSON.parse(savedLocal) : [];

      let currentDefId = defaultTemplateId;
      try {
        const defSaved = localStorage.getItem('vortex_default_template_panel2');
        if (defSaved) {
          const parsed = JSON.parse(defSaved);
          if (parsed?.id) {
            currentDefId = parsed.id;
            setDefaultTemplateObj(parsed);
          }
        }
      } catch {}

      if (user?.id) {
        const { data, error } = await supabase
          .from('painelvm_chart_templates')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          templates = data.map(d => {
            let inds: IndicatorConfig[] = [];
            let wds: WidgetConfig[] | undefined = undefined;
            let tf: number | undefined = undefined;

            const parsedRaw = typeof d.indicators === 'string' ? JSON.parse(d.indicators) : d.indicators;
            if (parsedRaw && !Array.isArray(parsedRaw) && parsedRaw.indicators) {
              inds = parsedRaw.indicators;
              wds = parsedRaw.widgets;
              tf = parsedRaw.timeframe;
            } else if (Array.isArray(parsedRaw)) {
              inds = parsedRaw;
            }

            const isDef = !!d.is_default || d.id === currentDefId;
            if (d.is_default) {
              currentDefId = d.id;
            }

            return {
              id: d.id,
              name: d.name,
              indicators: inds,
              widgets: wds,
              timeframe: tf,
              isDefault: isDef,
              isDefaultPanel2: isDef,
              created_at: d.created_at
            };
          });
        }
      }

      setUserTemplates(templates);
      if (currentDefId) {
        setDefaultTemplateId(currentDefId);
        const match = templates.find(t => t.id === currentDefId) || PRESET_CHART_TEMPLATES.find(p => p.id === currentDefId);
        if (match) {
          setDefaultTemplateObj(match);
        }
      }
    } catch (e) {
      console.warn('[TEMPLATES] Erro ao carregar templates:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUserTemplates();
    }
  }, [isOpen, user?.id]);

  if (!isOpen) return null;

  const categories: string[] = ['TODOS', 'ALGORITMOS', 'Tendência', 'SMC', 'Volatilidade', 'Osciladores', 'Volume', 'Níveis'];

  const filteredCatalog = Object.values(INDICATOR_DEFINITIONS).filter(def => {
    const matchesCategory = selectedCategory === 'TODOS' || def.category === selectedCategory;
    const matchesQuery = def.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         def.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  const activeAlgos = (customStrategies || []).filter(strat => {
    const matchesCategory = selectedCategory === 'TODOS' || selectedCategory === 'ALGORITMOS';
    const matchesQuery = !searchQuery || 
      strat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (strat.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim()) return;
    if (activeIndicators.length === 0) {
      setTemplateMsg({ text: 'Adicione pelo menos 1 indicador antes de salvar o modelo!', type: 'error' });
      return;
    }

    const tName = newTemplateName.trim();
    const clonedIndicators = JSON.parse(JSON.stringify(activeIndicators));
    const clonedWidgets = saveWidgetsWithTemplate && activeWidgets && activeWidgets.length > 0
      ? JSON.parse(JSON.stringify(activeWidgets))
      : undefined;
    const chosenTf = saveTimeframeWithTemplate && currentTimeframe ? currentTimeframe : undefined;

    const newT: ChartTemplate = {
      id: `tpl-${Date.now()}`,
      name: tName,
      indicators: clonedIndicators,
      widgets: clonedWidgets,
      timeframe: chosenTf,
      isDefault: setAsDefaultPanel2,
      isDefaultPanel2: setAsDefaultPanel2,
      created_at: new Date().toISOString()
    };

    try {
      if (setAsDefaultPanel2) {
        localStorage.setItem('vortex_default_template_panel2', JSON.stringify(newT));
        setDefaultTemplateId(newT.id);
        setDefaultTemplateObj(newT);
        if (user?.id) {
          await supabase
            .from('painelvm_chart_templates')
            .update({ is_default: false })
            .eq('user_id', user.id);
        }
      }

      if (user?.id) {
        const payloadToStore = (clonedWidgets || chosenTf)
          ? { indicators: clonedIndicators, widgets: clonedWidgets, timeframe: chosenTf }
          : clonedIndicators;

        const { data: inserted, error: insErr } = await supabase
          .from('painelvm_chart_templates')
          .insert({
            user_id: user.id,
            name: tName,
            indicators: JSON.stringify(payloadToStore),
            is_default: setAsDefaultPanel2
          })
          .select();

        if (!insErr && inserted && inserted[0]) {
          newT.id = inserted[0].id;
          if (setAsDefaultPanel2) {
            localStorage.setItem('vortex_default_template_panel2', JSON.stringify(newT));
            setDefaultTemplateId(newT.id);
            setDefaultTemplateObj(newT);
          }
        }
      }

      const updated = [
        newT,
        ...userTemplates.map(t => setAsDefaultPanel2 ? { ...t, isDefault: false, isDefaultPanel2: false } : t).filter(t => t.id !== newT.id)
      ];
      setUserTemplates(updated);
      localStorage.setItem('vortex_user_chart_templates', JSON.stringify(updated));
      setNewTemplateName('');
      setSetAsDefaultPanel2(false);
      setTemplateMsg({
        text: setAsDefaultPanel2
          ? `Template "${tName}" salvo e definido como PADRÃO no Painel 2!`
          : `Template "${tName}" salvo com sucesso!`,
        type: 'success'
      });
    } catch (err: any) {
      setTemplateMsg({ text: `Erro ao salvar template: ${err.message}`, type: 'error' });
    }
  };

  const handleSetDefaultTemplate = async (tpl: ChartTemplate) => {
    try {
      const isCurrentDefault = defaultTemplateId === tpl.id;
      if (isCurrentDefault) {
        // Desmarcar template padrão
        localStorage.removeItem('vortex_default_template_panel2');
        setDefaultTemplateId(null);
        setDefaultTemplateObj(null);
        if (user?.id) {
          await supabase
            .from('painelvm_chart_templates')
            .update({ is_default: false })
            .eq('user_id', user.id);
        }
        const updated = userTemplates.map(t => ({ ...t, isDefault: false, isDefaultPanel2: false }));
        setUserTemplates(updated);
        localStorage.setItem('vortex_user_chart_templates', JSON.stringify(updated));
        setTemplateMsg({ text: `Template "${tpl.name}" não é mais o padrão do Painel 2.`, type: 'success' });
        return;
      }

      // Definir este template como padrão
      const templateToSave: ChartTemplate = {
        ...tpl,
        isDefault: true,
        isDefaultPanel2: true
      };
      localStorage.setItem('vortex_default_template_panel2', JSON.stringify(templateToSave));
      setDefaultTemplateId(tpl.id);
      setDefaultTemplateObj(templateToSave);

      if (user?.id) {
        await supabase
          .from('painelvm_chart_templates')
          .update({ is_default: false })
          .eq('user_id', user.id);

        if (!tpl.id.startsWith('preset-') && !tpl.id.startsWith('tpl-')) {
          await supabase
            .from('painelvm_chart_templates')
            .update({ is_default: true })
            .eq('id', tpl.id);
        }
      }

      const updated = userTemplates.map(t => ({
        ...t,
        isDefault: t.id === tpl.id,
        isDefaultPanel2: t.id === tpl.id
      }));
      setUserTemplates(updated);
      localStorage.setItem('vortex_user_chart_templates', JSON.stringify(updated));
      setTemplateMsg({ text: `⭐ Template "${tpl.name}" definido como PADRÃO no Painel 2!`, type: 'success' });
    } catch (err: any) {
      setTemplateMsg({ text: `Erro ao definir template como padrão: ${err.message}`, type: 'error' });
    }
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    if (!window.confirm(`Deseja excluir o template "${name}"?`)) return;
    try {
      if (defaultTemplateId === id) {
        localStorage.removeItem('vortex_default_template_panel2');
        setDefaultTemplateId(null);
        setDefaultTemplateObj(null);
      }
      if (user?.id && !id.startsWith('tpl-')) {
        await supabase.from('painelvm_chart_templates').delete().eq('id', id);
      }
      const updated = userTemplates.filter(t => t.id !== id);
      setUserTemplates(updated);
      localStorage.setItem('vortex_user_chart_templates', JSON.stringify(updated));
      setTemplateMsg({ text: `Template "${name}" removido.`, type: 'success' });
    } catch (err: any) {
      setTemplateMsg({ text: `Erro ao excluir template: ${err.message}`, type: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-[#0f172a] border border-slate-700/80 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col text-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <div>
              <h3 className="text-lg font-bold text-white tracking-wide">Gerenciador de Indicadores & Templates</h3>
              <p className="text-xs text-slate-400">Insira indicadores no gráfico ou salve e carregue modelos de setup</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 p-2 rounded-lg text-sm transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 pt-2 gap-4">
          <button
            onClick={() => { setActiveTab('catalog'); setEditingIndicator(null); }}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'catalog'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            ➕ Catálogo de Indicadores
          </button>
          <button
            onClick={() => { setActiveTab('active'); setEditingIndicator(null); }}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'active'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📋 Indicadores Inseridos ({activeIndicators.length})
          </button>
          <button
            onClick={() => { setActiveTab('templates'); setEditingIndicator(null); }}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'templates'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📁 Templates de Gráfico
          </button>
          {!hideWidgetsTab && (
            <button
              onClick={() => { setActiveTab('widgets'); setEditingIndicator(null); }}
              className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
                activeTab === 'widgets'
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              🧩 Widgets de Gráfico
              {activeWidgets.length > 0 && (
                <span className="bg-purple-900/80 text-purple-200 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {activeWidgets.filter(w => w.visible).length}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {editingIndicator ? (
            /* Editing Form for an Active Indicator */
            <div className="bg-slate-900/80 border border-slate-700/60 rounded-lg p-5">
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-800">
                <h4 className="font-bold text-blue-400 text-base flex items-center gap-2">
                  ⚙️ Configurar: {editingIndicator.name}
                </h4>
                <button
                  onClick={() => setEditingIndicator(null)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded text-slate-300 transition"
                >
                  Voltar à Lista
                </button>
              </div>

              {/* Parameter Settings */}
              <div className="space-y-4">
                <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Parâmetros Técnicos</h5>

                {editingIndicator.type === 'LEVELS_TIME_RANGE' && (editingIndicator.params.sessionMode === 'all' || editingIndicator.params.useFullSession) && (
                  <div className="p-3 rounded-lg bg-blue-950/40 border border-blue-800/60 text-xs text-blue-300 flex items-start gap-2.5">
                    <span className="text-base shrink-0">🕒</span>
                    <div>
                      <strong className="block text-blue-200 font-bold mb-0.5">Modo Toda a Sessão Ativo</strong>
                      <span className="text-slate-300 leading-relaxed">
                        O indicador marcará as referências de Máxima, Mínima e 50% formadas durante todo o ciclo da sessão cadastrada no sistema (das {sysStart.slice(0, 5)} de um dia até as {sysEnd.slice(0, 5)} do dia seguinte).
                      </span>
                    </div>
                  </div>
                )}

                {(['VOLUME_LEVELS', 'VOLUME_HVN_BLOCKS', 'VOLUME_HEATMAP'].includes(editingIndicator.type)) && editingIndicator.params.sessionMode === 'bars' && (
                  <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300 flex items-start gap-2.5">
                    <span className="text-base shrink-0">📊</span>
                    <div>
                      <strong className="block text-emerald-200 font-bold mb-0.5">Modo Últimas {editingIndicator.params.lookbackBars || 30} Velas (Timeframe Atual)</strong>
                      <span className="text-slate-300 leading-relaxed">
                        As regiões de volume e absorção são calculadas dinamicamente com base nas últimas {editingIndicator.params.lookbackBars || 30} velas do timeframe ativo no gráfico (1m, 5m, 15m, 30m, 1h, 4h).
                      </span>
                    </div>
                  </div>
                )}

                {editingIndicator.type === 'MOMENTUM_CONFLUENCE' && (
                  <div className="p-3.5 rounded-xl bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-purple-950/40 border border-cyan-800/50 text-xs text-cyan-200 flex items-start gap-3 shadow-lg">
                    <span className="text-2xl shrink-0">🌊</span>
                    <div className="space-y-1">
                      <strong className="block text-cyan-100 font-bold text-sm tracking-wide">
                        Subpainel de Confluência de Força (Momentum Matrix 1m)
                      </strong>
                      <p className="text-slate-300 leading-relaxed text-[11.5px]">
                        Exibe os percentuais de força de momentum calculados e consolidados a cada 1 minuto (escala 0 a 100 com linha de equilíbrio no <strong>50</strong>).
                        Ideal para observar visualmente a conciliação dos ativos: quando os Índices e as Big Techs rompem juntos o 50 para cima ocorre o <strong>Rally de Alta</strong>; quando caem juntos abaixo de 50 ocorre o <strong>Rally de Baixa</strong>.
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-cyan-900/40 border border-cyan-700/60 text-cyan-300 font-mono">
                          📈 NQ + ES: {editingIndicator.params.indicesMode === 'combined' ? '🔗 Somados' : editingIndicator.params.indicesMode === 'individual' ? '📊 Individuais' : '🚫 Ocultos'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-amber-900/40 border border-amber-700/60 text-amber-300 font-mono">
                          🔥 Mag7: {editingIndicator.params.stocksMode === 'combined' ? '🔗 Cesta Somada (7 Techs)' : editingIndicator.params.stocksMode === 'individual' ? '🏢 Individuais' : '🚫 Ocultas'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-purple-900/40 border border-purple-700/60 text-purple-300 font-mono">
                          ⚡ VIX: {editingIndicator.params.showVix !== false ? (editingIndicator.params.invertVix ? 'Invertido (100-x)' : 'Ativo') : 'Oculto'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-900/40 border border-emerald-700/60 text-emerald-300 font-mono">
                          💵 DXY: {editingIndicator.params.showDxy !== false ? (editingIndicator.params.invertDxy ? 'Invertido (100-x)' : 'Ativo') : 'Oculto'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {editingIndicator.type === 'CANDLE_PATTERNS' ? (
                  <div className="space-y-4">
                    <div className="p-3 rounded-lg bg-blue-950/30 border border-blue-800/40 text-xs text-blue-300 flex items-start gap-2.5">
                      <span className="text-base shrink-0">🕯️</span>
                      <div>
                        <strong className="block text-blue-200 font-bold mb-0.5">Configuração Individual dos Padrões de Candlestick</strong>
                        <span className="text-slate-300 leading-relaxed">
                          Defina a pontuação mínima, o modo de execução (Barra Fechada ou Tempo Real) e o alerta sonoro exclusivo com pré-escuta para cada padrão gráfico.
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 shadow-inner">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                            <th className="py-3 px-3.5 min-w-[200px]">Padrão & Ativação</th>
                            <th className="py-3 px-3.5 min-w-[130px]">Mínimo Pontos</th>
                            <th className="py-3 px-3.5 min-w-[180px]">Modo de Execução</th>
                            <th className="py-3 px-3.5 min-w-[220px]">Alerta Sonoro</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {[
                            {
                              id: 'engolfo',
                              name: 'Engolfo',
                              badge: 'E',
                              badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
                              toggleKey: 'showEngolfo',
                              minPointsKey: 'minPointsEngolfo',
                              pointsNote: 'Candle 1 (Gatilho)',
                              modeKey: 'barModeEngolfo',
                              soundKey: 'soundEngolfo',
                              modeOptions: [
                                { label: '🔒 Barra Fechada (Padrão)', value: 'closed' }
                              ]
                            },
                            {
                              id: 'pinbar',
                              name: 'Pinbar / Martelo / Shooting Star',
                              badge: 'P',
                              badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
                              toggleKey: 'showPinbar',
                              minPointsKey: 'minPointsPinbar',
                              pointsNote: 'Candle 1 (Gatilho)',
                              modeKey: 'barModePinbar',
                              soundKey: 'soundPinbar',
                              modeOptions: [
                                { label: '🔒 Barra Fechada (Padrão)', value: 'closed' }
                              ]
                            },
                            {
                              id: 'bull180',
                              name: 'Bull 180 / Bear 180',
                              badge: 'B',
                              badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
                              toggleKey: 'showPattern180',
                              minPointsKey: 'minPoints180',
                              pointsNote: 'Candle 2 (Referência)',
                              modeKey: 'barMode180',
                              soundKey: 'sound180',
                              modeOptions: [
                                { label: '🔒 Barra Fechada', value: 'closed' },
                                { label: '⚡ Barra em Tempo Real', value: 'realtime' }
                              ]
                            },
                            {
                              id: 'star3',
                              name: 'Estrela de Reversão (3 Candles)',
                              badge: '3',
                              badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
                              toggleKey: 'showStar3Candles',
                              minPointsKey: 'minPointsStar3',
                              pointsNote: 'Candle 1 (Gatilho)',
                              modeKey: 'barModeStar3',
                              soundKey: 'soundStar3',
                              modeOptions: [
                                { label: '🔒 Barra Fechada (Padrão)', value: 'closed' }
                              ]
                            },
                            {
                              id: 'chute',
                              name: 'Chute / Kicking Pattern',
                              badge: 'C',
                              badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
                              toggleKey: 'showChute',
                              minPointsKey: 'minPointsChute',
                              pointsNote: 'Candle 1 (Gatilho)',
                              modeKey: 'barModeChute',
                              soundKey: 'soundChute',
                              modeOptions: [
                                { label: '🔒 Barra Fechada (Padrão)', value: 'closed' }
                              ]
                            }
                          ].map(pat => {
                            const isEnabled = editingIndicator.params[pat.toggleKey] !== false;
                            const minPoints = editingIndicator.params[pat.minPointsKey] ?? 0;
                            const barMode = editingIndicator.params[pat.modeKey] || 'closed';
                            const sound = editingIndicator.params[pat.soundKey] || 'none';

                            return (
                              <tr key={pat.id} className={`transition-colors ${isEnabled ? 'hover:bg-slate-800/40' : 'opacity-40 bg-slate-950/40'}`}>
                                <td className="py-3 px-3.5">
                                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={isEnabled}
                                      onChange={(e) => {
                                        setEditingIndicator({
                                          ...editingIndicator,
                                          params: { ...editingIndicator.params, [pat.toggleKey]: e.target.checked }
                                        });
                                      }}
                                      className="w-4 h-4 rounded bg-slate-950 border border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
                                    />
                                    <div className="flex items-center gap-2">
                                      <span className={`w-5 h-5 rounded-full border text-[10px] font-black flex items-center justify-center ${pat.badgeColor}`}>
                                        {pat.badge}
                                      </span>
                                      <span className="font-semibold text-slate-200 text-xs">{pat.name}</span>
                                    </div>
                                  </label>
                                </td>
                                <td className="py-3 px-3.5">
                                  <div className="flex flex-col gap-1">
                                    <input
                                      type="number"
                                      disabled={!isEnabled}
                                      value={minPoints}
                                      min={0}
                                      max={1000}
                                      step={0.5}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        setEditingIndicator({
                                          ...editingIndicator,
                                          params: { ...editingIndicator.params, [pat.minPointsKey]: isNaN(val) ? 0 : val }
                                        });
                                      }}
                                      className="w-24 bg-slate-950 border border-slate-700 disabled:border-slate-800 rounded px-2.5 py-1 text-xs text-slate-100 focus:border-blue-500 outline-none"
                                    />
                                    <span className="text-[10px] text-slate-400">{pat.pointsNote}</span>
                                  </div>
                                </td>
                                <td className="py-3 px-3.5">
                                  <select
                                    disabled={!isEnabled}
                                    value={barMode}
                                    onChange={(e) => {
                                      setEditingIndicator({
                                        ...editingIndicator,
                                        params: { ...editingIndicator.params, [pat.modeKey]: e.target.value }
                                      });
                                    }}
                                    className="bg-slate-950 border border-slate-700 disabled:border-slate-800 rounded px-2.5 py-1 text-xs text-slate-100 focus:border-blue-500 outline-none w-full max-w-[190px]"
                                  >
                                    {pat.modeOptions.map(opt => (
                                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-3 px-3.5">
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      disabled={!isEnabled}
                                      value={sound}
                                      onChange={(e) => {
                                        setEditingIndicator({
                                          ...editingIndicator,
                                          params: { ...editingIndicator.params, [pat.soundKey]: e.target.value }
                                        });
                                      }}
                                      className="bg-slate-950 border border-slate-700 disabled:border-slate-800 rounded px-2 py-1 text-xs text-slate-100 focus:border-blue-500 outline-none flex-1 min-w-[150px]"
                                    >
                                      {PATTERN_SOUND_PRESETS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      disabled={!isEnabled}
                                      onClick={() => playPatternSound(sound === 'none' ? 'default_axion' : sound)}
                                      className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 active:bg-blue-600 rounded text-slate-300 hover:text-white transition shadow text-xs shrink-0"
                                      title="Ouvir demonstração sonora"
                                    >
                                      ▶️
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {INDICATOR_DEFINITIONS[editingIndicator.type]?.paramDefs.filter(pDef => {
                      const sMode = editingIndicator.params.sessionMode || (editingIndicator.type === 'LEVELS_TIME_RANGE' ? 'custom' : 'all');
                      const isAll = sMode === 'all' || Boolean(editingIndicator.params.useFullSession);
                      if ((pDef.key === 'customStart' || pDef.key === 'customEnd') && sMode !== 'custom') {
                        return false;
                      }
                      if (pDef.key === 'lookbackBars' && sMode !== 'bars') {
                        return false;
                      }
                      if (pDef.key === 'lookbackDays' && sMode === 'bars') {
                        return false;
                      }
                      if (editingIndicator.type === 'LEVELS_TIME_RANGE' && isAll) {
                        if (pDef.key === 'startTime' || pDef.key === 'endTime' || pDef.key === 'sessionEnd' || pDef.key === 'extendSession') {
                          return false;
                        }
                      }
                      return true;
                    }).map(pDef => (
                      <div key={pDef.key} className="flex flex-col gap-1.5">
                        <label className="text-xs text-slate-300 font-medium">{pDef.label}</label>
                        {pDef.type === 'number' ? (
                          <input
                            type="number"
                            value={editingIndicator.params[pDef.key] ?? pDef.default}
                            min={pDef.min}
                            max={pDef.max}
                            step={pDef.step || 1}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setEditingIndicator({
                                ...editingIndicator,
                                params: { ...editingIndicator.params, [pDef.key]: isNaN(val) ? pDef.default : val }
                              });
                            }}
                            className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:border-blue-500 outline-none"
                          />
                        ) : pDef.type === 'select' ? (
                          (() => {
                            let selectOptions = pDef.options || [];
                            if (editingIndicator.type === 'AXION_ML_PREDICTOR' && pDef.key === 'selectedModel') {
                              const dynamicOpts: { label: string; value: string }[] = [
                                { label: '🤖 Auto (Estudo Mais Recente do Ativo)', value: 'auto' }
                              ];

                              // Adiciona modelos gravados no Supabase (exclusivo para Rede Neural M1 / TensorFlow)
                              if (dbStudiesList.length > 0) {
                                dbStudiesList
                                  .filter(st => st.model_type === 'tensorflow_patterns' || (!st.model_type && !st.model_name?.toLowerCase().includes('gamma') && !st.model_name?.toLowerCase().includes('spring') && !st.model_name?.toLowerCase().includes('sweep') && !st.model_name?.toLowerCase().includes('wyckoff')))
                                  .forEach(st => {
                                  const modelKey = st.id || st.model_name || `${st.symbol}_retest`;
                                  let cleanName = st.model_name || `Axion ${st.symbol}`;
                                  // Remove sufixos repetitivos de acurácia se já existirem no nome
                                  cleanName = cleanName.replace(/\s*\(\d+(\.\d+)?%\s*Acc\)/gi, '').trim();

                                  const tp = st.tp_points ? `+${st.tp_points}` : '+25';
                                  const sl = st.sl_points ? `-${st.sl_points}` : '-12';
                                  const acc = st.metrics?.accuracy ? ` (${st.metrics.accuracy}% Acc)` : '';
                                  dynamicOpts.push({
                                    label: `🧠 ${cleanName} [${tp}/${sl} pts]${acc}`,
                                    value: modelKey
                                  });
                                });
                              }

                              dynamicOpts.push({
                                label: '⚙️ Axion Padrão Institucional (+25/-12)',
                                value: 'default_v1'
                              });

                              selectOptions = dynamicOpts;
                            } else if (editingIndicator.type === 'WYCKOFF_STRUCTURAL_SWEEPS' && pDef.key === 'selectedModel') {
                              const dynamicOpts: { label: string; value: string }[] = [
                                { label: '⚡ Auto (Estudo Estrutural Mais Recente)', value: 'auto' }
                              ];

                              // Adiciona estudos estruturais gravados no Supabase (exclusivo para ABA 3: Wyckoff / Sweeps)
                              if (dbStudiesList.length > 0) {
                                dbStudiesList
                                  .filter(st => st.model_type === 'structural_pattern_study' || st.model_name?.toLowerCase().includes('spring') || st.model_name?.toLowerCase().includes('sweep') || st.model_name?.toLowerCase().includes('wyckoff'))
                                  .forEach(st => {
                                    const modelKey = st.id || st.model_name || `${st.symbol}_struct`;
                                    let cleanName = st.model_name || `Wyckoff ${st.symbol}`;
                                    const tp = st.tp_points ? `+${st.tp_points}` : '+25';
                                    const sl = st.sl_points ? `-${st.sl_points}` : '-12';
                                    const win = st.metrics?.accuracy ? ` (${st.metrics.accuracy}% Win)` : '';
                                    dynamicOpts.push({
                                      label: `⚡ ${cleanName} [${tp}/${sl} pts]${win}`,
                                      value: modelKey
                                    });
                                  });
                              }

                              selectOptions = dynamicOpts;
                            }
                            return (
                              <select
                                value={editingIndicator.params[pDef.key] ?? pDef.default}
                                onChange={(e) => {
                                  const updated = { ...editingIndicator.params, [pDef.key]: e.target.value };
                                  if (editingIndicator.type === 'LEVELS_TIME_RANGE' && pDef.key === 'sessionMode') {
                                    updated.useFullSession = e.target.value === 'all';
                                  }
                                  setEditingIndicator({
                                    ...editingIndicator,
                                    params: updated
                                  });
                                }}
                                className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:border-blue-500 outline-none"
                              >
                                {selectOptions.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            );
                          })()
                        ) : pDef.type === 'string' ? (
                          <input
                            type="text"
                            value={editingIndicator.params[pDef.key] ?? pDef.default}
                            placeholder={pDef.default && String(pDef.default).includes(':') ? 'HH:MM' : 'Ex: 09:00'}
                            maxLength={5}
                            onChange={(e) => {
                              const isTime = pDef.key.toLowerCase().includes('time') || 
                                             pDef.key.toLowerCase().includes('start') || 
                                             pDef.key.toLowerCase().includes('end') || 
                                             pDef.key.toLowerCase().includes('session') ||
                                             pDef.label.includes('HH:MM') ||
                                             (typeof pDef.default === 'string' && /^\d{2}:\d{2}/.test(pDef.default));
                              const val = isTime ? sanitizeTimeMask(e.target.value, false) : e.target.value;
                              setEditingIndicator({
                                ...editingIndicator,
                                params: { ...editingIndicator.params, [pDef.key]: val }
                              });
                            }}
                            onBlur={() => {
                              const currentVal = editingIndicator.params[pDef.key];
                              const isTime = pDef.key.toLowerCase().includes('time') || 
                                             pDef.key.toLowerCase().includes('start') || 
                                             pDef.key.toLowerCase().includes('end') || 
                                             pDef.key.toLowerCase().includes('session') ||
                                             pDef.label.includes('HH:MM') ||
                                             (typeof pDef.default === 'string' && /^\d{2}:\d{2}/.test(pDef.default));
                              if (isTime) {
                                if (!currentVal || currentVal.length < 3) {
                                  setEditingIndicator({
                                    ...editingIndicator,
                                    params: { ...editingIndicator.params, [pDef.key]: pDef.default }
                                  });
                                } else if (currentVal.length < 5 && currentVal.includes(':')) {
                                  const [h, m] = currentVal.split(':');
                                  setEditingIndicator({
                                    ...editingIndicator,
                                    params: { ...editingIndicator.params, [pDef.key]: `${h.padStart(2, '0')}:${(m || '').padEnd(2, '0')}` }
                                  });
                                }
                              }
                            }}
                            className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 font-mono focus:border-blue-500 outline-none"
                          />
                        ) : pDef.type === 'boolean' ? (
                          <label className="flex items-center gap-2 cursor-pointer pt-1">
                            <input
                              type="checkbox"
                              checked={editingIndicator.params[pDef.key] ?? pDef.default}
                              onChange={(e) => {
                                const updated = { ...editingIndicator.params, [pDef.key]: e.target.checked };
                                if (editingIndicator.type === 'LEVELS_TIME_RANGE' && pDef.key === 'useFullSession') {
                                  updated.sessionMode = e.target.checked ? 'all' : 'custom';
                                }
                                setEditingIndicator({
                                  ...editingIndicator,
                                  params: updated
                                });
                              }}
                              className="w-4 h-4 rounded bg-slate-950 border border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
                            />
                            <span className="text-xs text-slate-300 font-medium">
                              {editingIndicator.type === 'LEVELS_TIME_RANGE' && pDef.key === 'useFullSession'
                                ? ((editingIndicator.params[pDef.key] ?? pDef.default) ? '✅ Toda a Sessão Ativa' : 'Desativado (Horário Customizado)')
                                : ((editingIndicator.params[pDef.key] ?? pDef.default) ? '✅ Exibir no Gráfico' : '❌ Ocultar')}
                            </span>
                          </label>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}

                <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-2">Aparência & Estilo Visual</h5>
                
                {/* Paleta de Cores de Exemplos Pré-Prontas */}
                <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1 mr-1">
                    🎨 Paleta Rápida:
                  </span>
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditingIndicator({
                        ...editingIndicator,
                        style: { ...editingIndicator.style, color: c }
                      })}
                      className="w-5 h-5 rounded-full border border-slate-700 hover:scale-125 transition flex-shrink-0 shadow-sm cursor-pointer"
                      style={{ backgroundColor: c }}
                      title={`Aplicar cor ${c} na linha principal`}
                    />
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-slate-300 font-medium">Cor da Linha Principal (Alta)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editingIndicator.style.color}
                        onChange={(e) => setEditingIndicator({
                          ...editingIndicator,
                          style: { ...editingIndicator.style, color: e.target.value }
                        })}
                        className="w-10 h-9 rounded cursor-pointer bg-slate-950 border border-slate-700"
                      />
                      <span className="text-xs font-mono text-slate-400">{editingIndicator.style.color}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-slate-300 font-medium">Cor Secundária (Venda / Bandas)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editingIndicator.style.secondaryColor || '#ef4444'}
                        onChange={(e) => setEditingIndicator({
                          ...editingIndicator,
                          style: { ...editingIndicator.style, secondaryColor: e.target.value }
                        })}
                        className="w-10 h-9 rounded cursor-pointer bg-slate-950 border border-slate-700"
                      />
                      <span className="text-xs font-mono text-slate-400">{editingIndicator.style.secondaryColor || '#ef4444'}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-slate-300 font-medium">Espessura da Linha</label>
                    <select
                      value={editingIndicator.style.lineWidth}
                      onChange={(e) => setEditingIndicator({
                        ...editingIndicator,
                        style: { ...editingIndicator.style, lineWidth: parseInt(e.target.value) as any }
                      })}
                      className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:border-blue-500 outline-none"
                    >
                      <option value={1}>1px (Fina)</option>
                      <option value={2}>2px (Média)</option>
                      <option value={3}>3px (Forte)</option>
                      <option value={4}>4px (Extra Forte)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-slate-300 font-medium">Estilo da Linha</label>
                    <select
                      value={editingIndicator.style.lineStyle}
                      onChange={(e) => setEditingIndicator({
                        ...editingIndicator,
                        style: { ...editingIndicator.style, lineStyle: e.target.value as any }
                      })}
                      className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:border-blue-500 outline-none"
                    >
                      <option value="solid">Sólida (───)</option>
                      <option value="dashed">Tracejada ( - - - )</option>
                      <option value="dotted">Pontilhada ( • • • )</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    onClick={() => {
                      onUpdateIndicator(editingIndicator);
                      setEditingIndicator(null);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition"
                  >
                    💾 Salvar Alterações
                  </button>
                </div>
              </div>
            </div>
          ) : activeTab === 'catalog' ? (
            /* Catalog Tab */
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
                <div className="flex gap-1.5 overflow-x-auto w-full sm:w-auto pb-1">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`text-xs px-3 py-1.5 rounded-full font-medium transition whitespace-nowrap ${
                        selectedCategory === cat
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    placeholder="Buscar indicador..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500"
                  />
                  <span className="absolute left-2.5 top-2 text-slate-500 text-xs">🔍</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {activeAlgos.map(strat => {
                  const isAlert = strat.action === 'alert';
                  return (
                    <div
                      key={`algo-${strat.id}`}
                      className="bg-slate-900/60 border border-purple-900/40 hover:border-purple-500/60 rounded-xl p-4 flex flex-col justify-between transition group"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-900/40 text-purple-300 border border-purple-800/40">
                            ALGORITMOS
                          </span>
                          <span className="text-[11px] font-bold text-amber-400">
                            {isAlert ? '🔔 Indicador' : '📈 Estratégia'}
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-100 text-sm group-hover:text-purple-300 transition">{strat.name}</h4>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          {strat.description || 'Algoritmo personalizado configurado no Construtor de Algoritmos.'}
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          const customInd: IndicatorConfig = {
                            id: `algo-${strat.id}-${Date.now()}`,
                            type: 'ALGORITMO',
                            name: isAlert ? `🔔 Indicador: ${strat.name}` : `📈 Estratégia: ${strat.name}`,
                            category: 'ALGORITMOS',
                            visible: true,
                            overlay: true,
                            params: { strategy_id: strat.id, strategy_name: strat.name, action: strat.action },
                            style: { color: isAlert ? '#f59e0b' : '#a855f7', lineWidth: 2, lineStyle: 'solid' }
                          };
                          onAddIndicator('ALGORITMO', customInd);
                          setActiveTab('active');
                        }}
                        className="mt-4 w-full bg-purple-600/20 hover:bg-purple-600 border border-purple-500/40 hover:border-purple-500 text-purple-300 hover:text-white text-xs font-bold py-2 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        ➕ Inserir no Gráfico
                      </button>
                    </div>
                  );
                })}

                {filteredCatalog.map(def => (
                  <div
                    key={def.type}
                    className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col justify-between transition group"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-900/40 text-blue-400 border border-blue-800/40">
                          {def.category}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {def.overlay ? '📍 No Gráfico' : '📉 Sub-painel'}
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-100 text-sm group-hover:text-blue-400 transition">{def.name}</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">{def.description}</p>
                    </div>

                    <button
                      onClick={() => {
                        onAddIndicator(def.type);
                        setActiveTab('active');
                      }}
                      className="mt-4 w-full bg-blue-600/20 hover:bg-blue-600 border border-blue-500/40 hover:border-blue-500 text-blue-300 hover:text-white text-xs font-bold py-2 rounded-lg transition flex items-center justify-center gap-1.5"
                    >
                      ➕ Inserir no Gráfico
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : activeTab === 'active' ? (
            /* Active Indicators Tab */
            <div>
              {activeIndicators.length === 0 ? (
                <div className="text-center py-12 bg-slate-900/40 border border-dashed border-slate-800 rounded-xl">
                  <div className="text-3xl mb-2">📊</div>
                  <h4 className="text-sm font-bold text-slate-300">Nenhum indicador inserido no gráfico</h4>
                  <p className="text-xs text-slate-500 mt-1">Acesse a guia "Catálogo de Indicadores" para escolher e inserir indicadores no seu gráfico.</p>
                  <button
                    onClick={() => setActiveTab('catalog')}
                    className="mt-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition"
                  >
                    Navegar no Catálogo
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeIndicators.map(ind => (
                    <div
                      key={ind.id}
                      className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 flex items-center justify-between gap-4 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full border border-slate-600"
                          style={{ backgroundColor: ind.style.color }}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-200 text-sm">{ind.name}</h4>
                            <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                              {Object.entries(ind.params).map(([k, v]) => `${k}:${v}`).join(' | ')}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500">
                            Linha {ind.style.lineWidth}px • {ind.style.lineStyle}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onToggleVisibility(ind.id)}
                          className={`p-2 rounded-lg text-xs font-semibold transition ${
                            ind.visible
                              ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                              : 'bg-slate-950 text-slate-600 border border-slate-800 hover:text-slate-400'
                          }`}
                          title={ind.visible ? 'Ocultar no Gráfico' : 'Exibir no Gráfico'}
                        >
                          {ind.visible ? '👁️ Exibindo' : '🙈 Oculto'}
                        </button>
                        <button
                          onClick={() => setEditingIndicator(ind)}
                          className="p-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-xs font-semibold transition"
                          title="Editar Parâmetros"
                        >
                          ⚙️ Editar
                        </button>
                        <button
                          onClick={() => onRemoveIndicator(ind.id)}
                          className="p-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 rounded-lg text-xs font-semibold transition"
                          title="Remover Indicador"
                        >
                          🗑️ Deletar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'templates' ? (
            /* Templates Tab */
            <div className="space-y-6">
              {templateMsg && (
                <div className={`p-3 rounded-lg text-xs font-bold border transition-all animate-fadeIn flex items-center justify-between ${
                  templateMsg.type === 'success'
                    ? 'bg-emerald-950/70 border-emerald-700/80 text-emerald-300 shadow-lg shadow-emerald-950/40'
                    : 'bg-rose-950/70 border-rose-700/80 text-rose-300 shadow-lg shadow-rose-950/40'
                }`}>
                  <div className="flex items-center gap-2">
                    <span>{templateMsg.type === 'success' ? '✅' : '⚠️'}</span>
                    <span>{templateMsg.text}</span>
                  </div>
                  <button
                    onClick={() => setTemplateMsg(null)}
                    className="text-slate-400 hover:text-white text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Active Default Template Card */}
              {defaultTemplateObj ? (
                <div className="bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-slate-900/60 border-2 border-amber-500/50 rounded-xl p-4 shadow-xl shadow-amber-950/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 font-extrabold text-xs uppercase tracking-wider bg-amber-950/80 border border-amber-500/60 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                        <span>⭐</span>
                        <span>Template Padrão do Painel 2 Ativo</span>
                      </span>
                    </div>
                    <h4 className="font-extrabold text-base text-white tracking-wide">{defaultTemplateObj.name}</h4>
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-300">
                      <span className="bg-slate-900/90 border border-slate-700/80 px-2 py-0.5 rounded-md font-mono text-blue-300">
                        📊 {defaultTemplateObj.indicators?.length || 0} Indicadores
                      </span>
                      {defaultTemplateObj.widgets && defaultTemplateObj.widgets.length > 0 && (
                        <span className="bg-slate-900/90 border border-slate-700/80 px-2 py-0.5 rounded-md font-mono text-purple-300">
                          🧩 {defaultTemplateObj.widgets.length} Widgets
                        </span>
                      )}
                      {defaultTemplateObj.timeframe && (
                        <span className="bg-slate-900/90 border border-slate-700/80 px-2 py-0.5 rounded-md font-mono text-cyan-300">
                          ⏱️ Timeframe {defaultTemplateObj.timeframe}m
                        </span>
                      )}
                      <span className="text-slate-400 italic text-[10px]">
                        (Este layout é carregado automaticamente ao iniciar o Painel 2)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        onLoadTemplate(
                          JSON.parse(JSON.stringify(defaultTemplateObj.indicators || [])),
                          defaultTemplateObj.widgets ? JSON.parse(JSON.stringify(defaultTemplateObj.widgets)) : undefined,
                          defaultTemplateObj.timeframe
                        );
                        setTemplateMsg({ text: `Template padrão "${defaultTemplateObj.name}" aplicado ao gráfico!`, type: 'success' });
                      }}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs px-3.5 py-2 rounded-lg transition active:scale-95 flex items-center gap-1.5 shadow-md shadow-amber-950/50 cursor-pointer"
                      title="Aplicar o template padrão imediatamente no gráfico atual"
                    >
                      <span>⚡</span>
                      <span>Aplicar no Gráfico</span>
                    </button>
                    <button
                      onClick={() => handleSetDefaultTemplate(defaultTemplateObj)}
                      className="bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 border border-slate-700 font-bold text-xs px-2.5 py-2 rounded-lg transition active:scale-95 cursor-pointer"
                      title="Remover este template como padrão do Painel 2"
                    >
                      ✕ Desvincular
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-900/50 border border-dashed border-slate-700/80 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs text-slate-400">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">⭐</span>
                    <div>
                      <span className="font-bold text-slate-200">Nenhum Template Padrão Definido para o Painel 2</span>
                      <p className="text-[11px] text-slate-400">
                        Defina qualquer modelo abaixo como padrão para que seus indicadores, widgets e timeframe abram automaticamente.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Save Current Layout Form */}
              <form onSubmit={handleSaveTemplate} className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <h4 className="font-bold text-sm text-blue-400 flex items-center gap-2">
                    <span>💾 Salvar Template Completo do Gráfico</span>
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono font-bold">
                      {activeIndicators.length} indicadores ativos
                    </span>
                  </h4>
                  <span className="text-[11px] text-slate-400">Grave seu setup com indicadores, cards e timeframe</span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Nome do seu Template (ex: Setup SMC + Order Flow 5M)..."
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500 font-medium"
                  />
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2 rounded-lg transition active:scale-95 shrink-0 flex items-center justify-center gap-1.5 shadow cursor-pointer"
                  >
                    <span>💾</span>
                    <span>Salvar Template</span>
                  </button>
                </div>

                {/* Additional Template Options Checkboxes */}
                <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-slate-800/80 text-xs">
                  {activeWidgets && activeWidgets.length > 0 && (
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white select-none">
                      <input
                        type="checkbox"
                        checked={saveWidgetsWithTemplate}
                        onChange={(e) => setSaveWidgetsWithTemplate(e.target.checked)}
                        className="rounded bg-slate-950 border-slate-700 text-blue-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>🧩 Incluir {activeWidgets.length} Widgets & Cards Ativos</span>
                    </label>
                  )}

                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white select-none">
                    <input
                      type="checkbox"
                      checked={saveTimeframeWithTemplate}
                      onChange={(e) => setSaveTimeframeWithTemplate(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-700 text-blue-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>⏱️ Incluir Timeframe Atual ({currentTimeframe}m)</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer text-amber-300 hover:text-amber-200 font-bold select-none ml-auto">
                    <input
                      type="checkbox"
                      checked={setAsDefaultPanel2}
                      onChange={(e) => setSetAsDefaultPanel2(e.target.checked)}
                      className="rounded bg-slate-950 border-amber-600 text-amber-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>⭐ Definir como PADRÃO no Painel 2</span>
                  </label>
                </div>
              </form>

              {/* Preset Templates */}
              <div>
                <h4 className="font-bold text-xs text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <span>🌟</span>
                  <span>Modelos Recomendados de Fábrica (Presets Ready-to-Use)</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {PRESET_CHART_TEMPLATES.map(preset => {
                    const isDefault = defaultTemplateId === preset.id;
                    return (
                      <div
                        key={preset.id}
                        className={`bg-slate-900/60 border rounded-xl p-3.5 flex flex-col justify-between transition ${
                          isDefault
                            ? 'border-amber-500/70 shadow-lg shadow-amber-950/30 bg-amber-950/10'
                            : 'border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <h5 className="font-bold text-slate-100 text-xs">{preset.name}</h5>
                            {isDefault && (
                              <span className="text-[9px] font-black uppercase text-amber-400 bg-amber-950 border border-amber-500/50 px-1.5 py-0.5 rounded shrink-0 flex items-center gap-0.5">
                                ⭐ PADRÃO
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 line-clamp-2">
                            {preset.indicators.map(i => i.name).join(', ')}
                          </p>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center gap-2">
                          <button
                            onClick={() => {
                              onLoadTemplate(
                                JSON.parse(JSON.stringify(preset.indicators)),
                                preset.widgets ? JSON.parse(JSON.stringify(preset.widgets)) : undefined,
                                preset.timeframe
                              );
                              setTemplateMsg({ text: `Template "${preset.name}" carregado no gráfico!`, type: 'success' });
                            }}
                            className="flex-1 bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white text-xs font-bold py-1.5 px-2 rounded transition text-center cursor-pointer"
                          >
                            ⚡ Carregar
                          </button>
                          <button
                            onClick={() => handleSetDefaultTemplate(preset)}
                            className={`px-2.5 py-1.5 rounded text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                              isDefault
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                                : 'bg-slate-850 hover:bg-slate-750 text-slate-400 hover:text-amber-300 border border-slate-750'
                            }`}
                            title={isDefault ? 'Remover como padrão do Painel 2' : 'Definir este template como padrão do Painel 2'}
                          >
                            <span>⭐</span>
                            <span className="hidden sm:inline">{isDefault ? 'Padrão' : 'Definir Padrão'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* User Saved Templates */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-xs text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span>📁</span>
                    <span>Meus Templates Salvos ({userTemplates.length})</span>
                  </h4>
                </div>

                {userTemplates.length === 0 ? (
                  <div className="text-center py-8 bg-slate-900/30 border border-dashed border-slate-800 rounded-xl text-xs text-slate-500">
                    Você ainda não possui nenhum modelo salvo. Monte seus indicadores e clique em "Salvar Template".
                  </div>
                ) : (
                  <div className="space-y-2">
                    {userTemplates.map(tpl => {
                      const isDefault = defaultTemplateId === tpl.id || tpl.isDefault;
                      return (
                        <div
                          key={tpl.id}
                          className={`bg-slate-900/80 border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                            isDefault
                              ? 'border-amber-500/80 bg-amber-950/15 shadow-lg shadow-amber-950/20'
                              : 'border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <h5 className="font-bold text-slate-100 text-xs">{tpl.name}</h5>
                              {isDefault && (
                                <span className="text-[9px] font-black uppercase text-amber-400 bg-amber-950 border border-amber-500/50 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                                  ⭐ PADRÃO DO PAINEL 2
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-slate-400 font-mono">
                              <span className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-blue-300">
                                📊 {tpl.indicators.length} ind.
                              </span>
                              {tpl.widgets && tpl.widgets.length > 0 && (
                                <span className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-purple-300">
                                  🧩 {tpl.widgets.length} widgets
                                </span>
                              )}
                              {tpl.timeframe && (
                                <span className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-cyan-300">
                                  ⏱️ {tpl.timeframe}m
                                </span>
                              )}
                              <span className="text-slate-500">
                                • Salvo em {new Date(tpl.created_at || Date.now()).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => {
                                onLoadTemplate(
                                  JSON.parse(JSON.stringify(tpl.indicators)),
                                  tpl.widgets ? JSON.parse(JSON.stringify(tpl.widgets)) : undefined,
                                  tpl.timeframe
                                );
                                setTemplateMsg({ text: `Template "${tpl.name}" aplicado com sucesso!`, type: 'success' });
                              }}
                              className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 cursor-pointer"
                            >
                              <span>⚡</span>
                              <span>Carregar</span>
                            </button>

                            <button
                              onClick={() => handleSetDefaultTemplate(tpl)}
                              className={`font-bold text-xs px-2.5 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer ${
                                isDefault
                                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 font-black shadow'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 border border-slate-700'
                              }`}
                              title={isDefault ? 'Remover este template como padrão' : 'Definir este template como padrão do Painel 2'}
                            >
                              <span>⭐</span>
                              <span>{isDefault ? 'Padrão Ativo' : 'Tornar Padrão'}</span>
                            </button>

                            <button
                              onClick={() => handleDeleteTemplate(tpl.id, tpl.name)}
                              className="bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 font-bold text-xs px-2.5 py-1.5 rounded-lg transition active:scale-95 cursor-pointer"
                              title="Excluir Template"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'widgets' ? (
            <div className="space-y-6">
              {/* Header & Reset Action */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>🧩 Catálogo de Elementos Visuais e Cards para o Gráfico</span>
                  </h4>
                  <p className="text-xs text-slate-400">
                    Insira cards interativos sobre o gráfico. Arraste e posicione livremente conforme a sua conveniência.
                  </p>
                </div>
                {onResetWidgetPositions && (
                  <button
                    onClick={onResetWidgetPositions}
                    className="text-xs font-bold text-amber-400 hover:text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/40 px-3 py-1.5 rounded-lg transition self-start sm:self-auto shrink-0 flex items-center gap-1.5"
                  >
                    <span>🔄 Auto-Organizar Layout</span>
                  </button>
                )}
              </div>

              {/* Grid of Available Widgets to Insert */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Axion ML Radar (Destaque Principal) */}
                <div className="bg-gradient-to-br from-purple-950/40 via-slate-900/90 to-slate-900/80 border-2 border-purple-500/60 hover:border-purple-400 p-4 rounded-xl flex flex-col justify-between transition group md:col-span-2 shadow-xl shadow-purple-950/30">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">🧠</span>
                        <div>
                          <h5 className="text-sm font-black text-white group-hover:text-purple-300 transition flex items-center gap-1.5">
                            <span>Axion ML Radar & Confluência Gamma</span>
                            <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/80 border border-emerald-500/40 px-1.5 py-0.5 rounded">NOVO</span>
                          </h5>
                          <span className="text-[11px] text-slate-400 font-mono">Widget móvel de alta precisão preditiva</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded bg-purple-500/25 text-purple-300 border border-purple-500/50 shadow-sm">
                        IA Preditiva + ATR + Gamma
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Card móvel arrastável sobre o gráfico. Exibe probabilidades de Compra/Venda, equilíbrio dinâmico (cabo de guerra), perspectiva tática Gamma (Reversão, Breakout ou Corredor), confluência de volume e alvos dinâmicos calculados por ATR. Integrado diretamente nas análises do Copilot IA.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-purple-900/40 flex items-center justify-between">
                    <span className="text-[11px] text-purple-300/80 font-mono flex items-center gap-1">
                      <span>⚡</span>
                      <span>Arraste e solte em qualquer posição</span>
                    </span>
                    <button
                      onClick={() => onAddWidget && onAddWidget('axion_ml_radar', {}, '🧠 Axion ML Radar')}
                      className="bg-purple-600 hover:bg-purple-500 text-white font-black text-xs px-4 py-2 rounded-lg transition active:scale-95 flex items-center gap-1.5 shadow-lg shadow-purple-950/60 cursor-pointer"
                    >
                      <span>➕ Inserir no Gráfico</span>
                    </button>
                  </div>
                </div>

                {/* 2. Velocímetro */}
                <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xl">⚡</span>
                      <h5 className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                        Velocímetro de Sentimento
                      </h5>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Gauges circulares com agulhas móveis indicando Sentimento Macro (compensado) e Micro (direto do mercado).
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={() => onAddWidget && onAddWidget('speedometer')}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                    >
                      <span>➕ Inserir no Gráfico</span>
                    </button>
                  </div>
                </div>

                {/* 3. Block Trades */}
                <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xl">🐋</span>
                      <h5 className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                        Block Trades Institucionais
                      </h5>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mb-3">
                      Últimas ordens institucionais de alto volume com lado COMPRA/VENDA, quantidade, preço e horário.
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <span>Exibir:</span>
                      <select
                        value={blockTradesLimit}
                        onChange={(e) => setBlockTradesLimit(Number(e.target.value))}
                        className="bg-slate-950 border border-slate-700 text-white rounded px-2 py-1 outline-none text-xs font-bold"
                      >
                        <option value={3}>3 trades</option>
                        <option value={5}>5 trades</option>
                        <option value={8}>8 trades</option>
                        <option value={10}>10 trades</option>
                        <option value={15}>15 trades</option>
                        <option value={20}>20 trades</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={() => onAddWidget && onAddWidget('block_trades', { limit: blockTradesLimit }, '🐋 Block Trades')}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                    >
                      <span>➕ Inserir no Gráfico</span>
                    </button>
                  </div>
                </div>

                {/* 3. Acelerômetro */}
                <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xl">⚡</span>
                      <h5 className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                        Acelerômetro de Mercado
                      </h5>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Medidores dinâmicos de Z-Score e ATR Ratio com barras de gradiente e identificação do estado de expansão.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={() => onAddWidget && onAddWidget('accelerometer')}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                    >
                      <span>➕ Inserir no Gráfico</span>
                    </button>
                  </div>
                </div>

                {/* 4. Viés Gamma */}
                <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xl">🗺️</span>
                      <h5 className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                        Viés do Gamma & Níveis
                      </h5>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Viés consolidado (BULL/BEAR), Score numérico, força Compra vs Venda % e suportes/resistências chave.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={() => onAddWidget && onAddWidget('gamma_bias')}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                    >
                      <span>➕ Inserir no Gráfico</span>
                    </button>
                  </div>
                </div>

                {/* 5. Medidor Delta */}
                <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xl">⚖️</span>
                      <h5 className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                        Medidor de Delta
                      </h5>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Barra de balanço Delta Venda/Compra, Δ numérico, Delta Ratio, Prints por segundo e seletor de janelas temporais.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={() => onAddWidget && onAddWidget('delta_meter')}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                    >
                      <span>➕ Inserir no Gráfico</span>
                    </button>
                  </div>
                </div>

                {/* 6. Gauge de Ativo Individual */}
                <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xl">💪</span>
                      <h5 className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                        Gauge de Ativo Momentum
                      </h5>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mb-3">
                      Gauge com agulha e direção Compra/Venda para qualquer ativo individual da cesta.
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <span>Escolher Ativo:</span>
                      <select
                        value={selectedMomentumAsset}
                        onChange={(e) => setSelectedMomentumAsset(e.target.value)}
                        className="bg-slate-950 border border-slate-700 text-white rounded px-2 py-1 outline-none text-xs font-bold"
                      >
                        {MOMENTUM_ASSETS.map(a => (
                          <option key={a.symbol} value={a.symbol}>
                            {a.shortName} — {a.fullName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={() => {
                        const assetObj = MOMENTUM_ASSETS.find(a => a.symbol === selectedMomentumAsset);
                        const title = `💪 Gauge ${assetObj?.shortName || selectedMomentumAsset}`;
                        if (onAddWidget) onAddWidget('momentum_asset', { assetSymbol: selectedMomentumAsset }, title);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                    >
                      <span>➕ Inserir Gauge ({MOMENTUM_ASSETS.find(a => a.symbol === selectedMomentumAsset)?.shortName})</span>
                    </button>
                  </div>
                </div>

                {/* 7. Força Momentum Cesta Completa */}
                <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between transition group md:col-span-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xl">📊</span>
                      <h5 className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                        Força Momentum (Cesta Completa)
                      </h5>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Card compacto exibindo todos os ativos da cesta (NDAQ, SP500, DXY, VIX, NVDA, TSLA, AAPL, MSFT, META, etc.) com suas forças de compra e venda.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={() => onAddWidget && onAddWidget('momentum_overview')}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1 shadow"
                    >
                      <span>➕ Inserir Cesta Completa</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Active Widgets on Chart Section */}
              <div className="pt-4 border-t border-slate-800">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                  📋 Widgets Atualmente Inseridos no Gráfico ({activeWidgets.length})
                </h4>
                {activeWidgets.length === 0 ? (
                  <div className="text-center py-6 bg-slate-900/30 border border-dashed border-slate-800 rounded-xl text-xs text-slate-500">
                    Nenhum widget inserido no gráfico. Clique em "➕ Inserir no Gráfico" acima para adicionar.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeWidgets.map(w => (
                      <div
                        key={w.id}
                        className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-lg">{WIDGET_DEFINITIONS[w.type]?.icon || '🧩'}</span>
                          <div>
                            <h5 className="font-bold text-slate-100 text-xs">{w.title}</h5>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Posição: X={w.position.x}px, Y={w.position.y}px
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onToggleWidgetVisibility && onToggleWidgetVisibility(w.id)}
                            className={`text-xs px-2.5 py-1 rounded-lg font-bold border transition ${
                              w.visible
                                ? 'bg-blue-950/60 border-blue-800 text-blue-300 hover:bg-blue-900/60'
                                : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            {w.visible ? '👁️ Visível' : '🙈 Oculto'}
                          </button>
                          <button
                            onClick={() => onRemoveWidget && onRemoveWidget(w.id)}
                            className="bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 font-bold text-xs px-2.5 py-1 rounded-lg transition"
                            title="Remover Widget"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
