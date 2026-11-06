import React, { useState, useRef, useEffect } from 'react';

interface ReplayControlCardProps {
  currentSimulatedTime: string;
  startDate: string;
  setStartDate: (d: string) => void;
  endDate: string;
  setEndDate: (d: string) => void;
  minAvailableDate?: string;
  maxAvailableDate?: string;
  isPlaying: boolean;
  onTogglePlay: () => void;
  progressPercent: number;
  onSeek: (percent: number) => void;
  speed: number;
  onSetSpeed: (speed: number) => void;
  onOpenAccountModal: () => void;
  onJumpTime: (minutes: number) => void;
  onNextCandle: () => void;
  onFastForwardNoChart: () => void;
  onResetReplay: () => void;
  onJumpToDateTime: (targetDateTimeISO: string) => void;
  isLoadingData: boolean;
  onLoadData: () => void;
  totalCandlesCount: number;
  dataSource?: 'local' | 'supabase';
  onSetDataSource?: (source: 'local' | 'supabase') => void;
  isStreamerOnline?: boolean;
  streamerBarsCount?: number;
}

const SPEED_OPTIONS = [1, 2, 3, 5, 10, 20, 50, 100, 500, 1000];

export const ReplayControlCard: React.FC<ReplayControlCardProps> = ({
  currentSimulatedTime,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  minAvailableDate,
  maxAvailableDate,
  isPlaying,
  onTogglePlay,
  progressPercent,
  onSeek,
  speed,
  onSetSpeed,
  onOpenAccountModal,
  onJumpTime,
  onNextCandle,
  onFastForwardNoChart,
  onResetReplay,
  onJumpToDateTime,
  isLoadingData,
  onLoadData,
  totalCandlesCount,
  dataSource = 'local',
  onSetDataSource,
  isStreamerOnline = false,
  streamerBarsCount = 0
}) => {
  // Draggable Card State
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 24, y: 70 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [showJumpMenu, setShowJumpMenu] = useState<boolean>(false);
  const [showDateTimeModal, setShowDateTimeModal] = useState<boolean>(false);
  const [customTargetDateTime, setCustomTargetDateTime] = useState<string>('');
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.tagName === 'SELECT' || target.closest('.no-drag')) {
      return;
    }
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newX = Math.max(10, Math.min(window.innerWidth - 330, e.clientX - dragOffset.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 150, e.clientY - dragOffset.y));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handleSpeedStep = (direction: 'up' | 'down') => {
    const currentIndex = SPEED_OPTIONS.indexOf(speed);
    if (direction === 'up') {
      const nextIndex = currentIndex < SPEED_OPTIONS.length - 1 ? currentIndex + 1 : currentIndex;
      onSetSpeed(SPEED_OPTIONS[nextIndex]);
    } else {
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : 0;
      onSetSpeed(SPEED_OPTIONS[prevIndex]);
    }
  };

  const speedLabel = speed >= 1000 ? 'MAX' : `${speed}x`;

  // Handle Jump to specified Date/Time
  const handleApplyCustomJump = () => {
    if (!customTargetDateTime) return;
    onJumpToDateTime(customTargetDateTime);
    setShowDateTimeModal(false);
  };

  return (
    <div
      ref={cardRef}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onMouseDown={handleMouseDown}
      className={`fixed z-[9990] bg-[#161a25]/95 backdrop-blur-md border border-[#2d3241] shadow-2xl rounded-lg text-slate-100 font-sans transition-shadow select-none ${
        isDragging ? 'cursor-grabbing shadow-[0_0_25px_rgba(59,130,246,0.3)] ring-1 ring-blue-500/50' : 'cursor-grab'
      } ${isMinimized ? 'w-64' : 'w-[325px]'}`}
    >
      {/* Header Bar - NinjaTrader "Reprodução" Style */}
      <div className="bg-[#0f121d] border-b border-[#242836] px-3 py-1.5 rounded-t-lg flex items-center justify-between relative">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          <span className="font-bold text-xs text-slate-200">Reprodução</span>
        </div>

        {/* Current Replay Timestamp - Clicável para especificar Data/Hora */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setShowDateTimeModal(!showDateTimeModal);
            }}
            className="no-drag font-mono text-[11px] font-bold text-amber-400 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/40 hover:border-amber-400 px-1.5 py-0.5 rounded transition flex items-center gap-1 cursor-pointer active:scale-95 shadow"
            title="Clique para ir para uma Data e Hora específica"
          >
            <span>{currentSimulatedTime || '07/07/2026 01:00:00'}</span>
            <span className="text-[9px] opacity-75">✏️</span>
          </button>

          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="no-drag text-slate-400 hover:text-white text-[10px] px-1 py-0.2 rounded hover:bg-slate-800 transition cursor-pointer"
            title={isMinimized ? 'Expandir' : 'Minimizar'}
          >
            {isMinimized ? '🗖' : '🗕'}
          </button>
        </div>

        {/* Popover para Especificar Data e Hora de Avanço */}
        {showDateTimeModal && (
          <div className="no-drag absolute top-full right-2 mt-1 w-64 bg-[#0d111c] border border-amber-500/50 rounded-xl shadow-2xl p-2.5 z-50 animate-in fade-in zoom-in-95 duration-100 font-sans text-xs">
            <div className="flex items-center justify-between mb-1.5 border-b border-slate-800 pb-1">
              <span className="font-bold text-slate-200 text-[11px] flex items-center gap-1">
                <span>⏱️</span>
                <span>Ir para Data/Hora</span>
              </span>
              <button
                onClick={() => setShowDateTimeModal(false)}
                className="text-slate-400 hover:text-white text-[10px] px-1 py-0.2 rounded hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <label className="text-[10px] font-bold text-slate-400 block">
                    Selecione o Momento Desejado:
                  </label>
                  {minAvailableDate && maxAvailableDate && (
                    <span className="text-[9px] text-slate-500 font-mono">
                      {minAvailableDate.split('-').reverse().join('/')} a {maxAvailableDate.split('-').reverse().join('/')}
                    </span>
                  )}
                </div>
                <input
                  type="datetime-local"
                  value={customTargetDateTime}
                  onChange={(e) => setCustomTargetDateTime(e.target.value)}
                  className="w-full bg-[#1c2130] border border-[#2d3241] rounded px-2 py-1 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Botões de Ação */}
              <div className="flex gap-1.5 pt-1">
                <button
                  onClick={handleApplyCustomJump}
                  disabled={!customTargetDateTime || isLoadingData}
                  className="flex-1 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-black text-[11px] rounded transition active:scale-95 cursor-pointer flex items-center justify-center gap-1"
                >
                  {isLoadingData ? (
                    <>
                      <span className="animate-spin text-xs">🔄</span>
                      <span>Carregando...</span>
                    </>
                  ) : (
                    <>
                      <span>⏩</span>
                      <span>Avançar</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowDateTimeModal(false)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px] rounded transition cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {!isMinimized && (
        <div className="p-2.5 space-y-2">
          {/* Seletor de Fonte de Dados: Local (:8002) vs Nuvem (Supabase) */}
          <div className="bg-[#0f121d] p-1.5 rounded border border-[#242836] space-y-1.5 no-drag">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400">Fonte de Dados:</span>
              {dataSource === 'local' && (
                <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold flex items-center gap-1 ${
                  isStreamerOnline
                    ? 'bg-emerald-950/70 border border-emerald-500/40 text-emerald-400'
                    : 'bg-rose-950/70 border border-rose-500/40 text-rose-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isStreamerOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                  {isStreamerOnline ? `NT8 Online (${streamerBarsCount} velas)` : 'NT8 Offline'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1 bg-[#161a25] p-0.5 rounded border border-[#2d3241]">
              <button
                type="button"
                onClick={() => onSetDataSource?.('local')}
                className={`py-1 px-1.5 rounded text-[10px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  dataSource === 'local'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#1f2433]'
                }`}
                title="Consome dados diretamente do Add-on do NinjaTrader 8 na porta 8002"
              >
                <span>🖥️</span>
                <span>Add-on Local</span>
              </button>

              <button
                type="button"
                onClick={() => onSetDataSource?.('supabase')}
                className={`py-1 px-1.5 rounded text-[10px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  dataSource === 'supabase'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#1f2433]'
                }`}
                title="Consome dados do banco de dados na Nuvem (Supabase)"
              >
                <span>☁️</span>
                <span>Nuvem</span>
              </button>
            </div>
          </div>

          {/* Row 1: Start & Fim Selectors with Min / Max Bounds + Botão de Ação */}
          <div className="bg-[#0f121d]/80 p-1.5 rounded border border-[#242836] space-y-1.5 no-drag">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-bold text-slate-400">Start</span>
                <input
                  type="date"
                  value={startDate}
                  min={minAvailableDate}
                  max={maxAvailableDate || endDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-[#1c2130] border border-[#2d3241] rounded px-1.5 py-0.5 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-blue-500/60 w-24"
                />
              </div>

              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-bold text-slate-400">Fim</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || minAvailableDate}
                  max={maxAvailableDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-[#1c2130] border border-[#2d3241] rounded px-1.5 py-0.5 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-blue-500/60 w-24"
                />
              </div>
            </div>

            <button
              onClick={onLoadData}
              disabled={isLoadingData}
              className="w-full py-1 bg-blue-600/90 hover:bg-blue-500 active:scale-[0.98] text-white font-bold text-[11px] rounded transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shadow"
              title={`Carregar candles via ${dataSource === 'local' ? 'Add-on Local (:8002)' : 'Nuvem (Supabase)'}`}
            >
              {isLoadingData ? (
                <>
                  <span className="animate-spin text-xs">🔄</span>
                  <span>Carregando dados...</span>
                </>
              ) : (
                <>
                  <span>📥</span>
                  <span>Carregar ({dataSource === 'local' ? 'Add-on Local' : 'Nuvem'})</span>
                </>
              )}
            </button>
          </div>

          {/* Row 2: Play/Pause, Scrubber, Speed */}
          <div className="flex items-center gap-2 no-drag pt-0.5">
            {/* Play/Pause Button */}
            <button
              onClick={onTogglePlay}
              disabled={totalCandlesCount === 0}
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all transform active:scale-90 shadow cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                isPlaying
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/30'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/30'
              }`}
              title={isPlaying ? 'Pausar' : 'Iniciar'}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>

            {/* Scrubber Timeline Slider */}
            <div className="flex-1 flex flex-col justify-center">
              <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={progressPercent}
                onChange={(e) => onSeek(parseFloat(e.target.value))}
                disabled={totalCandlesCount === 0}
                className="w-full h-1.5 bg-slate-700 rounded appearance-none cursor-pointer accent-emerald-400 disabled:opacity-40"
                title={`Progresso: ${progressPercent.toFixed(1)}%`}
              />
            </div>

            {/* Speed Multiplier */}
            <div className="flex items-center bg-[#0f121d] border border-[#242836] rounded px-1.5 py-0.5 gap-1 shrink-0">
              <div className="flex flex-col justify-center">
                <button
                  onClick={() => handleSpeedStep('up')}
                  className="text-[8px] text-slate-400 hover:text-emerald-400 leading-none py-0.2"
                  title="Aumentar Velocidade"
                >
                  ▲
                </button>
                <button
                  onClick={() => handleSpeedStep('down')}
                  className="text-[8px] text-slate-400 hover:text-emerald-400 leading-none py-0.2"
                  title="Diminuir Velocidade"
                >
                  ▼
                </button>
              </div>
              <span className="font-mono text-[11px] font-black text-emerald-400 min-w-[24px] text-center">
                {speedLabel}
              </span>
            </div>
          </div>

          {/* Row 3: Compact Quick Action Tools (Conta, Avançar, Sem Gráfico, Reset) */}
          <div className="grid grid-cols-4 gap-1 pt-1 border-t border-[#242836] no-drag">
            {/* Conta */}
            <button
              onClick={onOpenAccountModal}
              className="bg-[#0f121d] hover:bg-slate-800 border border-[#242836] hover:border-emerald-500/50 text-emerald-300 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 transition cursor-pointer"
              title="Configurar Conta Replay"
            >
              <span>🏦</span>
              <span>Conta</span>
            </button>

            {/* Avançar Intervalo */}
            <div className="relative">
              <button
                onClick={() => setShowJumpMenu(!showJumpMenu)}
                className="w-full bg-[#0f121d] hover:bg-slate-800 border border-[#242836] hover:border-amber-500/50 text-amber-300 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 transition cursor-pointer"
                title="Avançar Intervalo"
              >
                <span>⏩</span>
                <span>Avançar</span>
              </button>

              {showJumpMenu && (
                <div className="absolute bottom-full left-0 mb-1 w-32 bg-[#0f121d] border border-[#2d3241] rounded-lg shadow-2xl p-1 space-y-0.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={() => { onNextCandle(); setShowJumpMenu(false); }}
                    className="w-full text-left px-2 py-1 text-[10px] font-bold text-slate-200 hover:bg-slate-800 rounded transition"
                  >
                    +1 Candle (1m)
                  </button>
                  <button
                    onClick={() => { onJumpTime(5); setShowJumpMenu(false); }}
                    className="w-full text-left px-2 py-1 text-[10px] font-bold text-slate-200 hover:bg-slate-800 rounded transition"
                  >
                    +5 Minutos
                  </button>
                  <button
                    onClick={() => { onJumpTime(15); setShowJumpMenu(false); }}
                    className="w-full text-left px-2 py-1 text-[10px] font-bold text-slate-200 hover:bg-slate-800 rounded transition"
                  >
                    +15 Minutos
                  </button>
                  <button
                    onClick={() => { onJumpTime(60); setShowJumpMenu(false); }}
                    className="w-full text-left px-2 py-1 text-[10px] font-bold text-slate-200 hover:bg-slate-800 rounded transition"
                  >
                    +1 Hora
                  </button>
                </div>
              )}
            </div>

            {/* Sem Gráfico */}
            <button
              onClick={onFastForwardNoChart}
              className="bg-[#0f121d] hover:bg-slate-800 border border-[#242836] hover:border-purple-500/50 text-purple-300 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 transition cursor-pointer"
              title="Execução Ultra Rápida sem Gráfico"
            >
              <span>⚡</span>
              <span>Fast</span>
            </button>

            {/* Reset */}
            <button
              onClick={onResetReplay}
              className="bg-[#0f121d] hover:bg-rose-950/60 border border-[#242836] hover:border-rose-500/50 text-rose-300 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 transition cursor-pointer"
              title="Reiniciar Replay"
            >
              <span>🔄</span>
              <span>Reset</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
