import React from 'react';

export interface LevelItemDef {
  key: string;
  code: string;
  name: string;
  description: string;
  color: string;
  group: 1 | 2 | 3 | 4;
}

export const LEVEL_DEFINITIONS_BY_GROUP: Record<1 | 2 | 3 | 4, { title: string; icon: string; description: string; items: LevelItemDef[] }> = {
  1: {
    title: 'Níveis de Gamma e Volatilidade',
    icon: '🟣',
    description: 'Pivots centrais de volatilidade, transição de regime e Gamma Wall institucional.',
    items: [
      { key: 'hvl', code: 'HVL', name: 'High Volatility Level', description: 'Pivot Gamma principal e divisor de regime de volatilidade', color: '#a855f7', group: 1 },
      { key: 'gwall', code: 'GWall', name: 'Gamma Wall Principal', description: 'Parede principal de Gamma institucional consolidada', color: '#fbbf24', group: 1 },
      { key: 'hvl0', code: 'HVL0', name: 'HVL Intradiário (Strike 0)', description: 'Nível de volatilidade intradiário em tempo real', color: '#c084fc', group: 1 }
    ]
  },
  2: {
    title: 'Barreiras de Opções (Call / Put Walls)',
    icon: '🔴🟢',
    description: 'Zonas de maior concentração de contratos de Opções de Compra e Venda.',
    items: [
      { key: 'call', code: 'Call', name: 'Call Wall Principal', description: 'Maior barreira de resistência institucional em Opções Call', color: '#ef4444', group: 2 },
      { key: 'put', code: 'Put', name: 'Put Wall Principal', description: 'Maior barreira de suporte institucional em Opções Put', color: '#22c55e', group: 2 },
      { key: 'call0', code: 'Call0', name: 'Call Intradiária (Strike 0)', description: 'Barreira de resistência intradiária de curto prazo', color: '#fca5a5', group: 2 },
      { key: 'put0', code: 'Put0', name: 'Put Intradiária (Strike 0)', description: 'Barreira de suporte intradiário de curto prazo', color: '#86efac', group: 2 }
    ]
  },
  3: {
    title: 'Níveis de Pregão e Referências Diárias',
    icon: '📊',
    description: 'Preços de fechamento anterior, ajustes e projeções de amplitude do dia.',
    items: [
      { key: 'max1d', code: 'Max', name: 'Máxima Projetada 1D', description: 'Limite superior de amplitude diária esperada', color: '#06b6d4', group: 3 },
      { key: 'min1d', code: 'Min', name: 'Mínima Projetada 1D', description: 'Limite inferior de amplitude diária esperada', color: '#eab308', group: 3 },
      { key: 'prev', code: 'Ajuste', name: 'Preço de Ajuste / Fechamento', description: 'Preço de ajuste oficial do pregão anterior', color: '#f97316', group: 3 },
      { key: 'prevH', code: 'MxAnt', name: 'Máxima do Pregão Anterior', description: 'Máxima histórica atingida na sessão anterior', color: '#f87171', group: 3 },
      { key: 'prevL', code: 'MnAnt', name: 'Mínima do Pregão Anterior', description: 'Mínima histórica atingida na sessão anterior', color: '#4ade80', group: 3 }
    ]
  },
  4: {
    title: 'Níveis de Liquidez e Exposição Dinâmica',
    icon: '⚡',
    description: 'Camadas de ordens de compra e exposição Gamma por strike dinâmico.',
    items: [
      { key: 'bl_count', code: 'BL (1..10)', name: 'Buy Levels (Liquidez)', description: 'Níveis dinâmicos de compra institucional e liquidez', color: '#3b82f6', group: 4 },
      { key: 'gex_count', code: 'GEX (1..10)', name: 'Gamma Exposure Levels', description: 'Níveis de exposição Gamma calculados por strike', color: '#a855f7', group: 4 }
    ]
  }
};

interface LevelsConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  panelName?: string;
  disabledLevels: string[];
  onToggleLevel: (key: string) => void;
  onSetGroupLevels: (keys: string[], enable: boolean) => void;
  onResetDefaults: () => void;
}

export const LevelsConfigModal: React.FC<LevelsConfigModalProps> = ({
  isOpen,
  onClose,
  panelName,
  disabledLevels,
  onToggleLevel,
  onSetGroupLevels,
  onResetDefaults
}) => {
  if (!isOpen) return null;

  const allKeys = Object.values(LEVEL_DEFINITIONS_BY_GROUP).flatMap(g => g.items.map(i => i.key));
  const activeCount = allKeys.filter(k => !disabledLevels.includes(k)).length;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0b1329] border border-slate-700/80 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 bg-[#0f172a] border-b border-slate-800 flex items-center justify-between select-none">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-xl">
              🎯
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">Personalização de Níveis</h3>
                {panelName && (
                  <span className="px-2 py-0.5 rounded bg-blue-500/20 border border-blue-500/40 text-blue-400 font-mono text-[11px] font-bold">
                    {panelName.toUpperCase()}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure quais níveis de suporte, resistência e liquidez serão exibidos no gráfico deste painel ({activeCount} de {allKeys.length} ativos)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Global Toolbar Controls */}
        <div className="px-5 py-2.5 bg-[#090e1f] border-b border-slate-800/70 flex items-center justify-between gap-2 text-xs select-none">
          <span className="text-slate-400 font-mono text-[11px]">
            ⚙️ Personalização isolada exclusiva deste painel
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSetGroupLevels(allKeys, true)}
              className="px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-600/40 text-emerald-300 hover:bg-emerald-900/60 font-bold transition cursor-pointer text-[11px]"
            >
              ✓ Marcar Todos
            </button>
            <button
              onClick={() => onSetGroupLevels(allKeys, false)}
              className="px-2.5 py-1 rounded-md bg-rose-950/40 border border-rose-600/40 text-rose-300 hover:bg-rose-900/60 font-bold transition cursor-pointer text-[11px]"
            >
              ✕ Desmarcar Todos
            </button>
            <button
              onClick={onResetDefaults}
              className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 font-bold transition cursor-pointer text-[11px]"
            >
              ↺ Padrão
            </button>
          </div>
        </div>

        {/* Body (4 Groups Accordion / Grid) */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          {([1, 2, 3, 4] as const).map(groupId => {
            const group = LEVEL_DEFINITIONS_BY_GROUP[groupId];
            const groupKeys = group.items.map(i => i.key);
            const isAllEnabled = groupKeys.every(k => !disabledLevels.includes(k));
            const isAllDisabled = groupKeys.every(k => disabledLevels.includes(k));

            return (
              <div
                key={groupId}
                className="bg-[#0f172a]/90 border border-slate-800 rounded-xl overflow-hidden shadow-lg transition"
              >
                {/* Group Header */}
                <div className="p-3.5 bg-[#131d36] border-b border-slate-800/80 flex items-center justify-between select-none">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{group.icon}</span>
                    <div>
                      <h4 className="text-xs font-bold text-white tracking-wide uppercase flex items-center gap-2">
                        <span>GRUPO {groupId}:</span> {group.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">{group.description}</p>
                    </div>
                  </div>

                  {/* Group Quick Toggle Buttons */}
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <button
                      onClick={() => onSetGroupLevels(groupKeys, true)}
                      className={`px-2 py-0.5 rounded border transition cursor-pointer font-bold ${
                        isAllEnabled
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                      title="Ativar todos os níveis deste grupo"
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => onSetGroupLevels(groupKeys, false)}
                      className={`px-2 py-0.5 rounded border transition cursor-pointer font-bold ${
                        isAllDisabled
                          ? 'bg-rose-600 border-rose-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                      title="Ocultar todos os níveis deste grupo"
                    >
                      Nenhum
                    </button>
                  </div>
                </div>

                {/* Items List */}
                <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {group.items.map(item => {
                    const isEnabled = !disabledLevels.includes(item.key);

                    return (
                      <div
                        key={item.key}
                        onClick={() => onToggleLevel(item.key)}
                        className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isEnabled
                            ? 'bg-[#15223e] border-slate-700 hover:border-slate-600'
                            : 'bg-[#090e1f]/60 border-slate-850 opacity-60 hover:opacity-80'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Color Badge / Level Tag */}
                          <div
                            className="px-2 py-1 rounded font-mono font-bold text-xs shrink-0 flex items-center justify-center border"
                            style={{
                              backgroundColor: `${item.color}15`,
                              borderColor: `${item.color}60`,
                              color: item.color
                            }}
                          >
                            {item.code}
                          </div>

                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-200 truncate flex items-center gap-1.5">
                              <span>{item.name}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 truncate mt-0.5">{item.description}</div>
                          </div>
                        </div>

                        {/* Modern Toggle Switch */}
                        <div className="relative inline-flex items-center shrink-0">
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={() => {}}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#0f172a] border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            As alterações são aplicadas e salvas automaticamente em tempo real para este painel.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition cursor-pointer"
          >
            ✓ Concluído
          </button>
        </div>

      </div>
    </div>
  );
};
