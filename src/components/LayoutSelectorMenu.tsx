import React, { useState } from 'react';
import {
  LAYOUT_OPTIONS,
  type ChartLayoutType,
  type WorkspaceTemplate,
} from '../types/chartLayout';

interface LayoutSelectorMenuProps {
  currentLayout: ChartLayoutType;
  onSelectLayout: (layout: ChartLayoutType) => void;
  onResetRatios: () => void;
  templates: WorkspaceTemplate[];
  onSaveTemplate: (name: string) => void;
  onLoadTemplate: (template: WorkspaceTemplate) => void;
  onDeleteTemplate: (id: string) => void;
  wsBtnBg: string;
}

const LayoutIcon: React.FC<{ type: ChartLayoutType; active: boolean }> = ({ type, active }) => {
  const stroke = active ? '#60a5fa' : '#94a3b8';
  const fill = active ? 'rgba(59,130,246,0.22)' : 'rgba(148,163,184,0.1)';

  return (
    <svg width="28" height="20" viewBox="0 0 28 20" className="shrink-0">
      {type === 'single' && (
        <rect x="1" y="1" width="26" height="18" rx="2" fill={fill} stroke={stroke} strokeWidth="1.5" />
      )}
      {type === 'split-v' && (
        <>
          <rect x="1" y="1" width="12" height="18" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
          <rect x="15" y="1" width="12" height="18" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
        </>
      )}
      {type === 'split-h' && (
        <>
          <rect x="1" y="1" width="26" height="8" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
          <rect x="1" y="11" width="26" height="8" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
        </>
      )}
      {type === 'triple-mixed-left' && (
        <>
          <rect x="1" y="1" width="12" height="18" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
          <rect x="15" y="1" width="12" height="8" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
          <rect x="15" y="11" width="12" height="8" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
        </>
      )}
      {type === 'triple-mixed-right' && (
        <>
          <rect x="1" y="1" width="12" height="8" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
          <rect x="1" y="11" width="12" height="8" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
          <rect x="15" y="1" width="12" height="18" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
        </>
      )}
      {type === 'triple-cols' && (
        <>
          <rect x="1" y="1" width="7.5" height="18" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
          <rect x="10.2" y="1" width="7.5" height="18" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
          <rect x="19.5" y="1" width="7.5" height="18" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
        </>
      )}
      {type === 'quad' && (
        <>
          <rect x="1" y="1" width="12" height="8" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
          <rect x="15" y="1" width="12" height="8" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
          <rect x="1" y="11" width="12" height="8" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
          <rect x="15" y="11" width="12" height="8" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
};

export const LayoutSelectorMenu: React.FC<LayoutSelectorMenuProps> = ({
  currentLayout,
  onSelectLayout,
  onResetRatios,
  templates,
  onSaveTemplate,
  onLoadTemplate,
  onDeleteTemplate,
  wsBtnBg,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTemplateName.trim();
    if (!trimmed) return;
    onSaveTemplate(trimmed);
    setNewTemplateName('');
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className={`px-2 py-1 rounded-lg border font-bold transition active:scale-95 cursor-pointer flex items-center gap-1.5 text-xs shadow ${
          currentLayout !== 'single'
            ? 'border-blue-500 bg-blue-600/25 text-blue-300 hover:bg-blue-600/40'
            : wsBtnBg
        }`}
        title="Layouts Multi-Gráficos e Templates de Visão"
      >
        <LayoutIcon type={currentLayout} active={currentLayout !== 'single'} />
        <span className="text-[9px]">▼</span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[99990]"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute top-full right-0 mt-1.5 w-80 bg-[#181d28] border border-slate-700 rounded-xl shadow-2xl z-[99999] p-3 space-y-3 font-sans text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-300">
                Disposição dos Gráficos
              </span>
              {currentLayout !== 'single' && (
                <button
                  type="button"
                  onClick={() => {
                    onResetRatios();
                  }}
                  className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                  title="Restaurar divisórias para proporções iguais"
                >
                  Resetar Divisões
                </button>
              )}
            </div>

            {/* Grade de Layouts */}
            <div className="grid grid-cols-2 gap-1.5">
              {LAYOUT_OPTIONS.map((opt) => {
                const isActive = currentLayout === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onSelectLayout(opt.id);
                      setIsOpen(false);
                    }}
                    className={`p-2 rounded-lg border flex items-center gap-2 text-left transition cursor-pointer ${
                      isActive
                        ? 'bg-blue-600/20 border-blue-500 text-white shadow'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-600 text-slate-300'
                    }`}
                    title={opt.description}
                  >
                    <LayoutIcon type={opt.id} active={isActive} />
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold truncate">{opt.label}</div>
                      <div className="text-[9px] text-slate-400 truncate">
                        {opt.slotsCount} {opt.slotsCount === 1 ? 'janela' : 'janelas'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Salvar Template de Espaço de Trabalho */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Templates de Visão Salvos
              </div>

              <form onSubmit={handleSave} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Nome do template (ex: NQ 60m+5m+1m)"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white placeholder-slate-500 outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={!newTemplateName.trim()}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-[11px] cursor-pointer transition shrink-0"
                >
                  Salvar
                </button>
              </form>

              {templates.length > 0 ? (
                <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5">
                  {templates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="flex items-center justify-between gap-1.5 bg-slate-900/80 border border-slate-800 hover:border-slate-600 rounded-lg px-2 py-1.5 transition"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onLoadTemplate(tpl);
                          setIsOpen(false);
                        }}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
                      >
                        <LayoutIcon type={tpl.layout} active={false} />
                        <span className="text-[11px] font-semibold text-slate-200 truncate">
                          {tpl.name}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteTemplate(tpl.id);
                        }}
                        className="text-slate-500 hover:text-rose-400 text-xs px-1 cursor-pointer"
                        title="Excluir template"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] text-slate-500 italic">
                  Nenhum template salvo ainda. Monte seu layout, escolha os ativos/tempos e salve acima.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
