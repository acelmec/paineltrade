import React, { useState } from 'react';
import type { OptionsMarketData } from '../services/db';

interface SegmentedLedBarProps {
  value: number;
  totalSegments?: number;
  positiveColor?: string;
  negativeColor?: string;
  isSigned?: boolean;
}

export const SegmentedLedBar: React.FC<SegmentedLedBarProps> = ({
  value,
  totalSegments = 24,
  positiveColor = '#00E676',
  negativeColor = '#FF3B30',
  isSigned = false
}) => {
  const isNegative = isSigned && value < 0;
  const absPct = Math.min(100, Math.max(0, Math.abs(value)));
  const activeCount = Math.round((absPct / 100) * totalSegments);
  const activeColor = isNegative ? negativeColor : positiveColor;

  return (
    <div className="flex items-center gap-[2px] w-full py-0.5 select-none">
      {Array.from({ length: totalSegments }).map((_, idx) => {
        const isActive = idx < activeCount;
        return (
          <div
            key={idx}
            className="flex-1 h-[7px] rounded-[1px] transition-all duration-300"
            style={{
              backgroundColor: isActive ? activeColor : '#0f172a',
              boxShadow: isActive ? `0 0 6px ${activeColor}80` : 'none',
              opacity: isActive ? 1 : 0.4
            }}
          />
        );
      })}
    </div>
  );
};

interface CompactGaugeProps {
  value: number; // 0 a 100
  label?: string;
  signal?: string;
  size?: 'sm' | 'md';
}

export const CompactSpeedometer: React.FC<CompactGaugeProps> = ({
  value,
  label,
  signal,
  size = 'md'
}) => {
  const clampedVal = Math.max(0, Math.min(100, isNaN(value) ? 0 : value));
  const isBuy = (signal || '').toUpperCase() === 'BUY';

  // Ângulo de -180° a 0° no semicírculo
  const angleDeg = -180 + (clampedVal / 100) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;

  // Centro do SVG (cx=60, cy=56), raio r=42
  const cx = 60;
  const cy = 52;
  const rNeedle = 38;
  const needleX = cx + rNeedle * Math.cos(angleRad);
  const needleY = cy + rNeedle * Math.sin(angleRad);

  const gradId = `arcGrad_${isBuy ? 'buy' : 'sell'}_${Math.random().toString(36).substr(2, 4)}`;
  const glowColor = isBuy ? '#00E676' : '#FF3B30';

  const w = size === 'sm' ? 95 : 110;
  const h = size === 'sm' ? 55 : 62;

  return (
    <div className="flex flex-col items-center select-none">
      {label && (
        <div className="text-[10px] font-extrabold text-slate-300 uppercase tracking-wider mb-0.5">
          {label}
        </div>
      )}
      <div className="relative flex items-center justify-center">
        <svg width={w} height={h} viewBox="0 0 120 62" className="overflow-visible">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              {isBuy ? (
                <>
                  <stop offset="0%" stopColor="#052e16" />
                  <stop offset="50%" stopColor="#16a34a" />
                  <stop offset="100%" stopColor="#00E676" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#450a0a" />
                  <stop offset="50%" stopColor="#dc2626" />
                  <stop offset="100%" stopColor="#FF3B30" />
                </>
              )}
            </linearGradient>
            <filter id={`glow_${gradId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor={glowColor} floodOpacity="0.6" />
            </filter>
          </defs>

          {/* Arco de fundo (escuro) */}
          <path
            d="M 16 52 A 44 44 0 0 1 104 52"
            fill="none"
            stroke="#1e293b"
            strokeWidth="10"
            strokeLinecap="round"
          />

          {/* Arco com degradê dinâmico */}
          <path
            d="M 16 52 A 44 44 0 0 1 104 52"
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="8"
            strokeLinecap="round"
            filter={`url(#glow_${gradId})`}
          />

          {/* Agulha branca clássica estilo Velocímetro de Sentimento */}
          <line
            x1={cx}
            y1={cy}
            x2={needleX}
            y2={needleY}
            stroke="#ffffff"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 3px rgba(255,255,255,0.85))' }}
          />

          {/* Centro do pivô branco */}
          <circle
            cx={cx}
            cy={cy}
            r="4.5"
            fill="#ffffff"
            style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.9))' }}
          />
        </svg>

        {/* Valor numérico no centro do arco (mais acima como no Velocímetro de Sentimento) */}
        <div className="absolute top-[18px] left-1/2 -translate-x-1/2 text-center pointer-events-none">
          <span className="font-mono text-xs font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] tracking-tight">
            {Math.round(clampedVal)}%
          </span>
        </div>
      </div>
    </div>
  );
};

export const GrixCompactSpeedometer = CompactSpeedometer;

const ptSignal = (signal: string): string => {
  const s = (signal || '').toUpperCase();
  if (s === 'BUY') return 'COMPRA';
  if (s === 'SELL') return 'VENDA';
  return s;
};

const signalClasses = (signal: string) => {
  const s = (signal || '').toUpperCase();
  return s === 'BUY'
    ? 'text-[#00E676] bg-[#00E676]/10 border-[#00E676]/30'
    : 'text-[#FF3B30] bg-[#FF3B30]/10 border-[#FF3B30]/30';
};

// 1. CORE ANALYTICS
export const GrixCoreAnalyticsView: React.FC<{ data?: OptionsMarketData | null }> = ({ data }) => {
  const analytics = data?.analytics || {
    analytics_qqq_pct: 18.7,
    market_structure_qqq_pct: 53.8,
    market_structure_spy_pct: 22.6,
    ai_status: 'ACTIVE'
  };

  const aQqq = Number(analytics.analytics_qqq_pct ?? 18.7);
  const msQqq = Number(analytics.market_structure_qqq_pct ?? 53.8);
  const msSpy = Number(analytics.market_structure_spy_pct ?? 22.6);

  return (
    <div className="flex flex-col justify-between h-full font-mono text-xs space-y-2.5 p-1">
      <div>
        <div className="flex justify-between items-center text-[10px] font-bold tracking-wider mb-0.5">
          <span className="text-[#00FF9D] uppercase">ANALYTICS — QQQ</span>
          <span className="text-[#00FF9D]">{aQqq.toFixed(1)}%</span>
        </div>
        <SegmentedLedBar value={aQqq} positiveColor="#00E676" />
      </div>
      <div>
        <div className="flex justify-between items-center text-[10px] font-bold tracking-wider mb-0.5">
          <span className="text-[#FF3B30] uppercase">ESTRUTURA — QQQ</span>
          <span className="text-[#FF3B30]">{msQqq.toFixed(1)}%</span>
        </div>
        <SegmentedLedBar value={msQqq} positiveColor="#FF3B30" />
      </div>
      <div>
        <div className="flex justify-between items-center text-[10px] font-bold tracking-wider mb-0.5">
          <span className="text-[#FF3B30] uppercase">ESTRUTURA — SPY</span>
          <span className="text-[#FF3B30]">{msSpy.toFixed(1)}%</span>
        </div>
        <SegmentedLedBar value={msSpy} positiveColor="#FF3B30" />
      </div>
    </div>
  );
};

// 2. ANCHORS
export const GrixAnchorsView: React.FC<{ data?: OptionsMarketData | null }> = ({ data }) => {
  const anchors = data?.anchors || {
    spy_pct: 49.0, spy_signal: 'SELL', qqq_pct: 33.0, qqq_signal: 'BUY'
  };
  const spyPct = Number(anchors.spy_pct ?? 49);
  const spySignal = (anchors.spy_signal || 'SELL').toUpperCase();
  const qqqPct = Number(anchors.qqq_pct ?? 33);
  const qqqSignal = (anchors.qqq_signal || 'BUY').toUpperCase();

  return (
    <div className="flex flex-col justify-center h-full font-mono p-1">
      <div className="grid grid-cols-2 gap-3 items-center justify-center">
        <div className="flex flex-col items-center text-center">
          <CompactSpeedometer value={spyPct} signal={spySignal} />
          <div className="text-[11px] font-bold text-slate-400 mt-1">SPY</div>
          <div className={`text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded border mt-0.5 ${signalClasses(spySignal)}`}>
            {ptSignal(spySignal)}
          </div>
        </div>
        <div className="flex flex-col items-center text-center">
          <CompactSpeedometer value={qqqPct} signal={qqqSignal} />
          <div className="text-[11px] font-bold text-slate-400 mt-1">QQQ</div>
          <div className={`text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded border mt-0.5 ${signalClasses(qqqSignal)}`}>
            {ptSignal(qqqSignal)}
          </div>
        </div>
      </div>
    </div>
  );
};

// 3. FLOW AND EXPOSURE
export const GrixFlowExposureView: React.FC<{ data?: OptionsMarketData | null }> = ({ data }) => {
  const flow = data?.flow_and_exposure || {
    rho_index_pct: -17.6, tail_risk_pct: 100.0,
    volatility_smile_qqq_pct: -100.0, volatility_smile_spy_pct: -100.0, net_gamma_pct: 22.4
  };
  const items = [
    { label: 'RHO INDEX', value: Number(flow.rho_index_pct ?? -17.6) },
    { label: 'TAIL RISK %', value: Number(flow.tail_risk_pct ?? 100.0) },
    { label: 'VOL SMILE — QQQ', value: Number(flow.volatility_smile_qqq_pct ?? -100.0) },
    { label: 'VOL SMILE — SPY', value: Number(flow.volatility_smile_spy_pct ?? -100.0) },
    { label: 'NET GAMMA', value: Number(flow.net_gamma_pct ?? 22.4) }
  ];
  return (
    <div className="flex flex-col justify-between h-full font-mono text-xs space-y-1 p-0.5">
      {items.map((item, idx) => {
        const isPos = item.value >= 0;
        const color = isPos ? '#00E676' : '#FF3B30';
        return (
          <div key={idx} className="space-y-0">
            <div className="flex justify-between items-center text-[10px] font-bold tracking-wider leading-tight">
              <span className="text-slate-300 uppercase">{item.label}</span>
              <span style={{ color }}>{isPos ? `+${item.value.toFixed(1)}%` : `${item.value.toFixed(1)}%`}</span>
            </div>
            <SegmentedLedBar value={item.value} isSigned={true} positiveColor="#00E676" negativeColor="#FF3B30" />
          </div>
        );
      })}
    </div>
  );
};

// 4. STOCK REPLACEMENT
export const GrixStockReplacementView: React.FC<{ data?: OptionsMarketData | null }> = ({ data }) => {
  const stock = data?.stock_replacement || {
    symbol: 'QQQ', call_pct: 100.0, call_signal: 'BUY', put_pct: 100.0, put_signal: 'SELL'
  };
  const callPct = Number(stock.call_pct ?? 100);
  const callSignal = (stock.call_signal || 'BUY').toUpperCase();
  const putPct = Number(stock.put_pct ?? 100);
  const putSignal = (stock.put_signal || 'SELL').toUpperCase();

  return (
    <div className="flex flex-col justify-center h-full font-mono p-1">
      <div className="grid grid-cols-2 gap-3 items-center justify-center">
        <div className="flex flex-col items-center text-center">
          <CompactSpeedometer value={callPct} signal={callSignal} />
          <div className="text-[11px] font-bold text-white mt-1">CALL</div>
          <div className={`text-[10px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded border mt-0.5 ${signalClasses(callSignal)}`}>
            {ptSignal(callSignal)}
          </div>
        </div>
        <div className="flex flex-col items-center text-center">
          <CompactSpeedometer value={putPct} signal={putSignal} />
          <div className="text-[11px] font-bold text-white mt-1">PUT</div>
          <div className={`text-[10px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded border mt-0.5 ${signalClasses(putSignal)}`}>
            {ptSignal(putSignal)}
          </div>
        </div>
      </div>
    </div>
  );
};

// 5. PROJECOES
type ProjecaoTab = 'projecao' | 'resumo' | 'bias';

const BIAS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  BULLISH:  { label: 'ALTISTA',  color: '#00E676', bg: 'rgba(0,230,118,0.12)',  icon: '▲' },
  BEARISH:  { label: 'BAIXISTA', color: '#FF3B30', bg: 'rgba(255,59,48,0.12)',  icon: '▼' },
  NEUTRAL:  { label: 'NEUTRO',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '◆' },
  MIXED:    { label: 'MISTO',    color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', icon: '⟺' },
  VOLATILE: { label: 'VOLÁTIL',  color: '#fb923c', bg: 'rgba(251,146,60,0.12)', icon: '⚡' },
};

export const ProjecaoView: React.FC<{ data?: OptionsMarketData | null }> = ({ data }) => {
  const [activeTab, setActiveTab] = useState<ProjecaoTab>('projecao');
  const projecao = data?.nq_projection || 'Aguardando dados de projeção...';
  const resumo = data?.summary || 'Aguardando dados de resumo de mercado...';
  const biasRaw = (data?.market_bias || 'NEUTRAL').toUpperCase();
  const biasConfig = BIAS_CONFIG[biasRaw] || BIAS_CONFIG['NEUTRAL'];
  const capturedAt = data?.captured_at
    ? new Date(data.captured_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  const createdAt = data?.created_at
    ? new Date(data.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : (capturedAt !== '--:--' ? capturedAt : '--:--');

  const tabs: { key: ProjecaoTab; label: string }[] = [
    { key: 'projecao', label: 'Projeção' },
    { key: 'resumo',   label: 'Resumo'   },
    { key: 'bias',     label: 'Viés'     },
  ];

  return (
    <div className="flex flex-col h-full font-mono text-xs">
      <div className="flex border-b border-slate-800 mb-2">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
              activeTab === t.key
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-400/5'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto no-scrollbar px-1 pb-1">
        {activeTab === 'projecao' && (
          <div className="space-y-2">
            <div className="text-[9px] text-slate-500 text-right">Atualizado: {capturedAt}</div>
            <p className="text-[11px] text-slate-200 leading-relaxed whitespace-pre-line">{projecao}</p>
          </div>
        )}
        {activeTab === 'resumo' && (
          <div className="space-y-2">
            <div className="text-[9px] text-slate-500 text-right">Atualizado: {capturedAt}</div>
            <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-line">{resumo}</p>
          </div>
        )}
        {activeTab === 'bias' && (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-4">
            <div
              className="flex flex-col items-center justify-center w-28 h-28 rounded-full border-2"
              style={{ borderColor: biasConfig.color, background: biasConfig.bg, boxShadow: `0 0 24px ${biasConfig.color}40` }}
            >
              <span className="text-3xl" style={{ color: biasConfig.color }}>{biasConfig.icon}</span>
              <span className="text-[13px] font-black tracking-widest mt-1" style={{ color: biasConfig.color }}>{biasConfig.label}</span>
            </div>
            <div className="text-center space-y-0.5">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Viés de Mercado</div>
              <div className="text-[9px] text-slate-600">Referência: {createdAt}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

