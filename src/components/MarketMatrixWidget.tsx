import React, { useEffect, useState, useMemo } from 'react';
import {
  fetchMarketMatrixData,
  subscribeMarketMatrix,
  type MarketMatrixData
} from '../services/marketMatrixService';

interface MarketMatrixWidgetProps {
  opacity?: number;
  params?: {
    showQqq?: boolean;
    showSpy?: boolean;
    showSetupAbertura?: boolean;
    fontSize?: number;
    titleMode?: 'grix' | 'matrix';
  };
}

export const MarketMatrixWidget: React.FC<MarketMatrixWidgetProps> = ({
  params = {}
}) => {
  const [data, setData] = useState<MarketMatrixData | null>(null);
  const [timeAgoStr, setTimeAgoStr] = useState<string>('agora');

  const showQqq = params.showQqq !== false;
  const showSpy = params.showSpy !== false;
  const showSetupAbertura = params.showSetupAbertura !== false;
  const titleMode = params.titleMode || 'grix';

  useEffect(() => {
    // Busca inicial
    fetchMarketMatrixData(true).then(d => {
      if (d) setData(d);
    });

    // Inscrição para atualizações
    const unsubscribe = subscribeMarketMatrix(newData => {
      setData(newData);
    });

    const timer = setInterval(() => {
      if (data?.fetchedAt) {
        const secs = Math.floor((Date.now() - data.fetchedAt.getTime()) / 1000);
        if (secs < 60) {
          setTimeAgoStr(`há ${secs}s`);
        } else if (secs < 3600) {
          setTimeAgoStr(`há ${Math.floor(secs / 60)}min`);
        } else {
          setTimeAgoStr(`há ${(secs / 3600).toFixed(1)}h`);
        }
      }
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [data?.fetchedAt]);

  const rowsQqq = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Net Gamma', value: data.net_gamma, type: 'bipolar' as const },
      { label: 'Analytics', value: data.analytics, type: 'bipolar' as const },
      { label: 'Rho', value: data.rho, type: 'bipolar' as const },
      { label: 'Market Structure', value: data.ms_qqq, type: 'bipolar' as const },
      { label: 'Anchors', value: data.anchors_qqq, type: 'bipolar' as const },
      { label: 'Hedge', value: data.hedge_qqq, type: 'bipolar' as const },
      { label: 'Smart Delta', value: data.smart_delta_qqq, type: 'bipolar' as const },
      { label: 'Tail Risk', value: data.tail_risk_qqq, type: 'bipolar' as const },
      { label: 'Vol Smile', value: data.vol_smile_qqq, type: 'bipolar' as const },
      { label: 'VAP', value: data.vap_qqq, type: 'bipolar' as const },
      { label: 'Stock Repl. call', value: data.sr_call_qqq, type: 'bipolar' as const },
      { label: 'Stock Repl. put', value: data.sr_put_qqq, type: 'bipolar' as const },
      { label: 'Fluxo QQQ', value: data.flow_qqq, type: 'split' as const },
      { label: 'Fluxo SPY', value: data.flow_spy, type: 'split' as const },
      { label: 'PHC (compr.)', value: data.phc_bull, type: 'split' as const }
    ];
  }, [data]);

  const rowsSpy = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Net Gamma', value: data.spy_net_gamma, type: 'bipolar' as const },
      { label: 'Analytics', value: data.spy_analytics, type: 'bipolar' as const },
      { label: 'Rho', value: data.spy_rho, type: 'bipolar' as const },
      { label: 'Market Structure', value: data.ms_spy, type: 'bipolar' as const }
    ];
  }, [data]);

  const rowsSetup = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'QQQ', value: data.setup_abertura_qqq, type: 'bipolar' as const },
      { label: 'SPY', value: data.setup_abertura_spy, type: 'bipolar' as const }
    ];
  }, [data]);

  const renderBipolarBar = (val: number) => {
    const clamped = Math.max(-100, Math.min(100, isNaN(val) ? 0 : val));
    const isZero = Math.abs(clamped) < 0.05;
    const isPositive = clamped > 0;
    const lenPct = (Math.abs(clamped) / 100) * 50; // 0% a 50% de largura da barra a partir do centro

    return (
      <div className="relative w-[86px] h-[10px] bg-white/10 rounded-[1px] overflow-hidden flex items-center">
        {/* Linha de centro neutra */}
        <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-white/40 -translate-x-1/2 z-10" />

        {!isZero && (
          <div
            className={`absolute top-0 bottom-0 transition-all duration-300 ${
              isPositive ? 'bg-[#26c265]' : 'bg-[#e5433d]'
            }`}
            style={{
              left: isPositive ? '50%' : `${50 - lenPct}%`,
              width: `${lenPct}%`
            }}
          />
        )}
      </div>
    );
  };

  const renderSplitBar = (val: number) => {
    const clamped = Math.max(0, Math.min(100, isNaN(val) ? 0 : val));
    const greenPct = clamped;

    return (
      <div className="relative w-[86px] h-[10px] bg-white/10 rounded-[1px] overflow-hidden flex">
        <div
          className="h-full bg-[#26c265] transition-all duration-300"
          style={{ width: `${greenPct}%` }}
        />
        <div
          className="h-full bg-[#e5433d] transition-all duration-300"
          style={{ width: `${100 - greenPct}%` }}
        />
      </div>
    );
  };

  const formatValue = (item: { value: number; type: 'bipolar' | 'split' }) => {
    if (isNaN(item.value)) return '—';
    if (item.type === 'bipolar') {
      const rounded = Math.round(item.value);
      if (rounded === 0) return '0';
      return rounded > 0 ? `+${rounded}` : `${rounded}`;
    }
    return `${Math.round(item.value)}%`;
  };

  const getValueColor = (item: { value: number; type: 'bipolar' | 'split' }) => {
    if (isNaN(item.value)) return 'text-slate-400';
    if (item.type === 'bipolar') {
      const rounded = Math.round(item.value);
      if (rounded > 0) return 'text-[#26c265]';
      if (rounded < 0) return 'text-[#e5433d]';
      return 'text-slate-400';
    }
    const rounded = Math.round(item.value);
    if (rounded >= 60) return 'text-[#26c265]';
    if (rounded <= 40) return 'text-[#e5433d]';
    return 'text-white';
  };

  return (
    <div className="flex flex-col font-mono text-[11px] select-none text-slate-200 w-[240px]">
      {/* Caixa 1: QQQ & SPY */}
      <div className="bg-[#080b11]/90 border border-slate-800/80 rounded p-2.5 shadow-xl space-y-3">
        {/* Bloco QQQ */}
        {showQqq && (
          <div>
            <div className="text-[11px] font-bold text-amber-400/95 tracking-wider uppercase mb-1.5 flex items-center justify-between border-b border-white/5 pb-0.5">
              <span>QQQ · {titleMode === 'grix' ? 'GRIX' : 'MARKET MATRIX'}</span>
              {data?.qqq ? (
                <span className="text-[10px] text-slate-400 font-normal">
                  ${data.qqq.toFixed(2)}
                </span>
              ) : null}
            </div>
            <div className="space-y-1">
              {rowsQqq.map((row, idx) => (
                <div key={idx} className="flex items-center justify-between gap-1 text-[11px]">
                  <span className="text-slate-400 text-left truncate flex-1">{row.label}</span>
                  {row.type === 'bipolar' ? renderBipolarBar(row.value) : renderSplitBar(row.value)}
                  <span className={`w-[34px] text-right font-bold ${getValueColor(row)}`}>
                    {formatValue(row)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bloco SPY */}
        {showSpy && rowsSpy.length > 0 && (
          <div className="pt-1.5 border-t border-white/10">
            <div className="text-[11px] font-bold text-amber-400/95 tracking-wider uppercase mb-1.5 flex items-center justify-between border-b border-white/5 pb-0.5">
              <span>SPY · {titleMode === 'grix' ? 'GRIX' : 'MARKET MATRIX'}</span>
              {data?.spy ? (
                <span className="text-[10px] text-slate-400 font-normal">
                  ${data.spy.toFixed(2)}
                </span>
              ) : null}
            </div>
            <div className="space-y-1">
              {rowsSpy.map((row, idx) => (
                <div key={idx} className="flex items-center justify-between gap-1 text-[11px]">
                  <span className="text-slate-400 text-left truncate flex-1">{row.label}</span>
                  {renderBipolarBar(row.value)}
                  <span className={`w-[34px] text-right font-bold ${getValueColor(row)}`}>
                    {formatValue(row)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Caixa 2: Setup Abertura */}
      {showSetupAbertura && (
        <div className="mt-2 bg-[#080b11]/90 border border-slate-800/80 rounded p-2.5 shadow-xl">
          <div className="text-[11px] font-bold text-amber-400/95 tracking-wider uppercase mb-1.5 flex items-center justify-between border-b border-white/5 pb-0.5">
            <span>SETUP ABERTURA · {titleMode === 'grix' ? 'GRIX' : 'MATRIX'}</span>
          </div>
          <div className="space-y-1">
            {rowsSetup.map((row, idx) => (
              <div key={idx} className="flex items-center justify-between gap-1 text-[11px]">
                <span className="text-slate-400 text-left truncate flex-1">{row.label}</span>
                {renderBipolarBar(row.value)}
                <span className={`w-[34px] text-right font-bold ${getValueColor(row)}`}>
                  {formatValue(row)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rodapé: Status do Feed e Sincronização */}
      <div className="mt-1.5 text-[9px] text-slate-500 flex items-center justify-between px-1">
        <span>
          Feed {data?.hora_et ? `${data.hora_et} ET` : 'ativo'}
        </span>
        <span className="text-slate-400 font-sans">
          {timeAgoStr}
        </span>
      </div>
    </div>
  );
};
