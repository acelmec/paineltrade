import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';

interface StockQuoteItem {
  symbol: string;
  label: string;
  price: number;
  pct: number;
}

interface MarketHeadlineItem {
  title: string;
  source: string;
  time: string;
  link?: string;
}

// 7 Magníficas + Juros 10Y Americanos + Índices
const WATCHLIST = [
  { symbol: '^TNX', label: 'US 10Y (Juros)', isYield: true },
  { symbol: 'NVDA', label: 'Nvidia' },
  { symbol: 'AAPL', label: 'Apple' },
  { symbol: 'MSFT', label: 'Microsoft' },
  { symbol: 'AMZN', label: 'Amazon' },
  { symbol: 'META', label: 'Meta' },
  { symbol: 'GOOGL', label: 'Google' },
  { symbol: 'TSLA', label: 'Tesla' }
];

export const MarketPulseTicker: React.FC = () => {
  const { panels, getPanelSnapshot, news } = useApp();

  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('vortex_pulse_ticker_visible') !== 'false';
  });

  const [tickerMode, setTickerMode] = useState<'all' | 'stocks' | 'news'>('all');

  const toggleVisibility = () => {
    setIsVisible(prev => {
      const next = !prev;
      try {
        localStorage.setItem('vortex_pulse_ticker_visible', String(next));
      } catch {}
      return next;
    });
  };

  // 1. Cotações dos Futuros Locais (NQ, ES, GOLD, etc.)
  const panelQuotes = useMemo(() => {
    if (!panels || panels.length === 0) return [];

    return panels.map((p: any) => {
      const snapshot = getPanelSnapshot ? getPanelSnapshot(p.id) : null;
      const candles = snapshot?.candles || [];
      const mData = snapshot?.marketData;

      let currentPrice = 0;
      let openPrice = 0;

      if (mData?.price && mData.price !== '--') {
        currentPrice = parseFloat(String(mData.price).replace(/[^\d.-]/g, '')) || 0;
      }

      if (candles.length > 0) {
        if (!currentPrice || currentPrice <= 0) {
          currentPrice = Number(candles[candles.length - 1].close) || 0;
        }
        openPrice = Number(candles[0].open) || currentPrice;
      }

      let changePct = 0;
      if (openPrice > 0 && currentPrice > 0) {
        changePct = ((currentPrice - openPrice) / openPrice) * 100;
      }

      const cleanName = (p.name || 'ATIVO').replace(/\s*\([^)]*\)/g, '').trim();

      return {
        id: p.id,
        name: cleanName,
        price: currentPrice,
        pct: changePct
      };
    }).filter(q => q.price > 0);
  }, [panels, getPanelSnapshot]);

  // 2. Ações Mais Negociadas (7 Magníficas) + Juros 10Y Americanos
  const [stockQuotes, setStockQuotes] = useState<StockQuoteItem[]>([]);

  useEffect(() => {
    let isMounted = true;

    const fetchStockData = async () => {
      try {
        const results = await Promise.all(
          WATCHLIST.map(async (item) => {
            try {
              const res = await fetch(
                `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.symbol)}?interval=1d&range=1d`,
                { headers: { 'User-Agent': 'Mozilla/5.0' } }
              );
              if (!res.ok) return null;
              const json = await res.json();
              const meta = json.chart?.result?.[0]?.meta;
              if (!meta) return null;

              const price = meta.regularMarketPrice || 0;
              const prev = meta.chartPreviousClose || meta.previousClose || price;
              const pct = prev > 0 ? ((price - prev) / prev) * 100 : 0;

              return {
                symbol: item.symbol,
                label: item.label,
                price: price,
                pct: Number(pct.toFixed(2))
              };
            } catch {
              return null;
            }
          })
        );

        if (isMounted) {
          const valid = results.filter((r): r is StockQuoteItem => r !== null);
          if (valid.length > 0) {
            setStockQuotes(valid);
          }
        }
      } catch {}
    };

    fetchStockData();
    const interval = setInterval(fetchStockData, 60000); // Atualiza a cada 60s
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // 3. Notícias Americanas Traduzidas em Português
  const [headlines, setHeadlines] = useState<MarketHeadlineItem[]>([]);
  const translationCache = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let isMounted = true;

    const fetchAndTranslateHeadlines = async () => {
      try {
        // Feeds ativos e em tempo real (MarketWatch Top Stories + CNBC Notícias de Mercado)
        const feedMW = encodeURIComponent('https://feeds.content.dowjones.io/public/rss/mw_topstories');
        const feedCNBC = encodeURIComponent('https://www.cnbc.com/id/100003114/device/rss/rss.html');

        const [resMW, resCNBC] = await Promise.all([
          fetch(`https://api.rss2json.com/v1/api.json?rss_url=${feedMW}`).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`https://api.rss2json.com/v1/api.json?rss_url=${feedCNBC}`).then(r => r.ok ? r.json() : null).catch(() => null)
        ]);

        const itemsMW = (resMW?.items || []).map((it: any) => ({ ...it, source: 'MarketWatch' }));
        const itemsCNBC = (resCNBC?.items || []).map((it: any) => ({ ...it, source: 'CNBC' }));
        const combined = [...itemsMW, ...itemsCNBC];

        if (isMounted && combined.length > 0) {
          const now = Date.now();
          const maxAgeMs = 24 * 60 * 60 * 1000; // Máximo 24h - descarta notícias antigas

          // Filtra estritamente notícias válidas e recentes das últimas 24 horas
          const sortedItems = combined
            .filter((it: any) => it?.title && it?.pubDate)
            .filter((it: any) => {
              const t = new Date(it.pubDate).getTime();
              return !isNaN(t) && (now - t) < maxAgeMs;
            })
            .sort((a: any, b: any) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

          // Mantém estritamente as 5 notícias mais recentes do dia (FIFO / Janela Deslizante)
          const rawItems = sortedItems.slice(0, 5);

          const translatedList = await Promise.all(
            rawItems.map(async (item: any) => {
              const originalTitle = item.title || '';
              let translated = translationCache.current.get(originalTitle);

              if (!translated && originalTitle) {
                try {
                  const tRes = await fetch(
                    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q=${encodeURIComponent(originalTitle)}`
                  );
                  if (tRes.ok) {
                    const tJson = await tRes.json();
                    const text = tJson?.[0]?.[0]?.[0];
                    if (typeof text === 'string' && text.trim().length > 0) {
                      translated = text;
                      translationCache.current.set(originalTitle, text);
                    }
                  }
                } catch {}
              }

              const pubDate = new Date(item.pubDate);
              let timeStr = '';
              if (!isNaN(pubDate.getTime())) {
                const diffMins = Math.floor((now - pubDate.getTime()) / 60000);
                if (diffMins < 60 && diffMins >= 0) {
                  timeStr = diffMins === 0 ? 'agora' : `há ${diffMins}m`;
                } else {
                  timeStr = pubDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
                }
              }

              return {
                title: translated || originalTitle,
                source: item.source || 'Mercado',
                time: timeStr,
                link: item.link
              };
            })
          );

          if (isMounted) {
            setHeadlines(translatedList);
          }
        }
      } catch {}
    };

    fetchAndTranslateHeadlines();
    const interval = setInterval(fetchAndTranslateHeadlines, 120000); // 2 minutos
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // 4. Próxima Notícia do Calendário Econômico
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [nextUpcomingNews, setNextUpcomingNews] = useState<any | null>(null);

  useEffect(() => {
    const updateNextNews = () => {
      if (!news || news.length === 0) {
        setNextUpcomingNews(null);
        return;
      }

      const now = new Date();
      const upcoming = news
        .filter(n => {
          const nDate = new Date(n.date);
          const diffMs = nDate.getTime() - now.getTime();
          return diffMs > -15 * 60 * 1000 && diffMs < 24 * 60 * 60 * 1000;
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (upcoming.length > 0) {
        const next = upcoming[0];
        setNextUpcomingNews(next);

        const diffMs = new Date(next.date).getTime() - now.getTime();
        if (diffMs <= 0) {
          setTimeRemaining('AGORA');
        } else {
          const totalSec = Math.floor(diffMs / 1000);
          const hours = Math.floor(totalSec / 3600);
          const mins = Math.floor((totalSec % 3600) / 60);
          const secs = totalSec % 60;
          if (hours > 0) {
            setTimeRemaining(`em ${hours}h ${mins.toString().padStart(2, '0')}m`);
          } else {
            setTimeRemaining(`em ${mins}m ${secs.toString().padStart(2, '0')}s`);
          }
        }
      } else {
        setNextUpcomingNews(null);
      }
    };

    updateNextNews();
    const timer = setInterval(updateNextNews, 1000);
    return () => clearInterval(timer);
  }, [news]);

  const nextNewsTime = useMemo(() => {
    if (!nextUpcomingNews?.date) return '';
    const d = new Date(nextUpcomingNews.date);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
  }, [nextUpcomingNews]);

  if (!isVisible) {
    return (
      <button
        onClick={toggleVisibility}
        className="hidden xl:flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition border border-slate-800 cursor-pointer"
        title="Mostrar Letreiro de Ações, Juros e Notícias"
      >
        <span>📈</span>
        <span>Letreiro</span>
      </button>
    );
  }

  // Renderiza uma sequência completa de itens para o Marquee
  const renderItemsSequence = () => (
    <div className="flex items-center gap-4 shrink-0 pr-4">
      {/* Futuros Locais */}
      {(tickerMode === 'all' || tickerMode === 'stocks') && panelQuotes.map((q) => {
        const isPos = q.pct >= 0;
        return (
          <div key={`pq_${q.id}`} className="flex items-center gap-1.5 text-[11px] shrink-0 font-medium">
            <span className="text-white font-bold">{q.name}</span>
            <span className="text-slate-300 font-mono">{q.price.toFixed(q.price > 1000 ? 1 : 2)}</span>
            <span className={`px-1 py-0.2 rounded text-[10px] font-bold font-mono ${
              isPos ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/30' : 'bg-rose-950/70 text-rose-400 border border-rose-500/30'
            }`}>
              {isPos ? '+' : ''}{q.pct.toFixed(2)}%
            </span>
            <span className="text-slate-700 ml-1">|</span>
          </div>
        );
      })}

      {/* 7 Magníficas + Juros Americanos 10Y */}
      {(tickerMode === 'all' || tickerMode === 'stocks') && stockQuotes.map((s) => {
        const isPos = s.pct >= 0;
        const isYield = s.symbol === '^TNX';
        return (
          <div key={`sq_${s.symbol}`} className="flex items-center gap-1.5 text-[11px] shrink-0 font-medium">
            <span className={isYield ? 'text-amber-400' : 'text-blue-400'}>
              {isYield ? '🏛️' : '📈'}
            </span>
            <span className={`font-bold ${isYield ? 'text-amber-300' : 'text-slate-200'}`}>
              {s.label}
            </span>
            <span className="text-slate-300 font-mono">
              {isYield ? `${s.price.toFixed(3)}%` : `$${s.price.toFixed(2)}`}
            </span>
            <span className={`px-1 py-0.2 rounded text-[10px] font-bold font-mono ${
              isPos ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/30' : 'bg-rose-950/70 text-rose-400 border border-rose-500/30'
            }`}>
              {isPos ? '+' : ''}{s.pct.toFixed(2)}%
            </span>
            <span className="text-slate-700 ml-1">|</span>
          </div>
        );
      })}

      {/* Calendário Econômico de Alto Impacto */}
      {(tickerMode === 'all' || tickerMode === 'news') && nextUpcomingNews && (
        <div className="flex items-center gap-1.5 text-[11px] shrink-0 font-medium">
          <span className="text-amber-400 animate-pulse">🚨</span>
          <span className="text-amber-300 font-bold uppercase text-[10px] bg-amber-950/60 px-1 rounded border border-amber-500/30">
            [{nextUpcomingNews.country}] {nextUpcomingNews.title}
          </span>
          <span className="text-amber-400 font-bold font-mono text-[10px]">
            {nextNewsTime ? `às ${nextNewsTime} • ` : ''}{timeRemaining}
          </span>
          <span className="text-slate-700 ml-1">|</span>
        </div>
      )}

      {/* Manchetes Americanas Traduzidas */}
      {(tickerMode === 'all' || tickerMode === 'news') && headlines.map((h, idx) => (
        <div key={`hl_${idx}`} className="flex items-center gap-1.5 text-[11px] shrink-0">
          <span className="text-sky-400">🇧🇷</span>
          <span className="text-slate-400 text-[10px] font-mono">[{h.time}]</span>
          {h.link ? (
            <a
              href={h.link}
              target="_blank"
              rel="noreferrer"
              className="text-slate-300 hover:text-blue-300 hover:underline transition"
              title="Abrir matéria completa"
            >
              {h.title}
            </a>
          ) : (
            <span className="text-slate-300">{h.title}</span>
          )}
          <span className="text-slate-700 ml-1">|</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="hidden xl:flex items-center gap-2 overflow-hidden w-full max-w-[50vw] 2xl:max-w-[62vw] px-2 py-0.5 bg-slate-950/70 border border-slate-800/80 rounded-lg text-xs font-sans select-none relative group">
      {/* Botão de Modo do Letreiro */}
      <button
        onClick={() => {
          setTickerMode(prev => prev === 'all' ? 'stocks' : prev === 'stocks' ? 'news' : 'all');
        }}
        className="text-[10px] text-slate-400 hover:text-blue-300 font-bold transition px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 shrink-0 cursor-pointer z-10"
        title="Alternar Modo do Letreiro: Tudo / Ações & Juros / Notícias Traduzidas"
      >
        {tickerMode === 'all' ? '🌐 TUDO' : tickerMode === 'stocks' ? '📊 AÇÕES/JUROS' : '🇧🇷 NOTÍCIAS'}
      </button>

      {/* Trilho de Rolagem Contínua (Marquee) */}
      <div className="overflow-hidden flex-1 relative">
        <div className="vortex-ticker-track flex items-center">
          {renderItemsSequence()}
          {renderItemsSequence()}
        </div>
      </div>

      {/* Botão Discreto de Fechar */}
      <button
        onClick={toggleVisibility}
        className="text-[10px] text-slate-600 hover:text-slate-300 transition px-1 cursor-pointer shrink-0 z-10"
        title="Ocultar Letreiro"
      >
        ✕
      </button>
    </div>
  );
};
