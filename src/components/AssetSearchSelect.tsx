import React, { useState, useRef, useEffect, useMemo } from 'react';

interface AssetSearchSelectProps {
  panels: any[];
  currentPanelId: string;
  onSelectPanel: (panelId: string) => void;
  className?: string;
  dropdownWidth?: string;
  compact?: boolean;
}

export const AssetSearchSelect: React.FC<AssetSearchSelectProps> = ({
  panels,
  currentPanelId,
  onSelectPanel,
  className = '',
  dropdownWidth = 'w-64',
  compact = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentPanel = useMemo(() => {
    return (panels || []).find(p => p.id === currentPanelId) || panels?.[0];
  }, [panels, currentPanelId]);

  const displayName = useMemo(() => {
    if (!currentPanel) return 'ATIVO';
    const raw = currentPanel.name || currentPanel.symbol || 'Painel';
    return raw.replace(/\s*\([^)]*\)/g, '').trim().toUpperCase();
  }, [currentPanel]);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Foco no input ao abrir
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  // Filtro de busca inteligente (a partir de 2 caracteres, busca em qualquer parte do nome/símbolo)
  const filteredPanels = useMemo(() => {
    const list = panels || [];
    const query = searchQuery.trim().toLowerCase();
    if (!query || query.length < 2) {
      return list;
    }
    return list.filter(p => {
      const name = String(p.name || '').toLowerCase();
      const sym = String(p.symbol || '').toLowerCase();
      const inst = String(p.instance_id || '').toLowerCase();
      return name.includes(query) || sym.includes(query) || inst.includes(query);
    });
  }, [panels, searchQuery]);

  return (
    <div ref={containerRef} className="relative inline-block text-left shrink-0 select-none">
      <div
        className={`flex items-center gap-1 bg-[#121622] hover:bg-[#181e2b] border border-slate-700/80 rounded px-1.5 py-0.5 font-black text-white tracking-wider uppercase transition-colors cursor-pointer shadow-sm ${
          compact ? 'text-[10px]' : 'text-[11px]'
        } ${className}`}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        <span className="text-slate-400 text-[10px] pointer-events-none">☰</span>
        {isOpen ? (
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder={displayName}
            className="bg-transparent text-white font-black outline-none border-b border-blue-500 w-20 uppercase text-[10px] placeholder:text-slate-400"
          />
        ) : (
          <span className="truncate max-w-[110px]" title={currentPanel?.name || displayName}>
            {displayName}
          </span>
        )}
        <span className="text-slate-400 text-[8px] pointer-events-none ml-0.5">▼</span>
      </div>

      {isOpen && (
        <div
          className={`absolute left-0 mt-1 ${dropdownWidth} bg-[#0b0f19] border border-slate-700 rounded-lg shadow-2xl z-[150] overflow-hidden animate-in fade-in zoom-in-95 duration-150`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Caixa de pesquisa interna */}
          <div className="p-1.5 border-b border-slate-800 bg-[#121622]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Digite no mínimo 2 letras (ex: AS p/ NASDAQ)..."
              className="w-full bg-[#182030] text-slate-100 text-[11px] rounded px-2 py-1 outline-none border border-slate-700 focus:border-blue-500 transition-colors placeholder:text-slate-500 font-sans normal-case"
              autoFocus
            />
          </div>

          {/* Lista de Ativos */}
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/40 text-[11px] font-sans">
            {filteredPanels.length > 0 ? (
              filteredPanels.map((p) => {
                const isSelected = p.id === currentPanelId;
                const cleanName = p.name ? p.name.replace(/\s*\([^)]*\)/g, '').trim() : 'Painel';
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onSelectPanel(p.id);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-2 hover:bg-blue-600/20 transition-colors ${
                      isSelected ? 'bg-blue-600/30 text-blue-400 font-bold' : 'text-slate-200'
                    }`}
                  >
                    <div className="flex flex-col truncate">
                      <span className="font-extrabold uppercase truncate tracking-wide">{cleanName}</span>
                    </div>
                    {isSelected && <span className="text-blue-400 text-[10px]">✓</span>}
                  </button>
                );
              })
            ) : (
              <div className="p-3 text-center text-slate-500 text-[10px]">
                Nenhum ativo encontrado para "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
