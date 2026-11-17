/**
 * Cotação de exibição (Bid / Ask / Spread) baseada EXCLUSIVAMENTE em dados vindos da fonte
 * (banco de dados, WebSocket ou API do MetaTrader).
 *
 * Regras invioláveis:
 *  1. Bid e Ask só são considerados "par real" quando AMBOS chegam da fonte com Ask > Bid
 *     (e não são marcados como is_synthetic).
 *  2. O tick mínimo do ativo (ex.: 0.25) NUNCA é usado como spread. Um spread real que por acaso
 *     seja igual ao tick (ex.: SP500 = 0.25) continua válido, pois a decisão é por PROVENIÊNCIA e não por valor.
 *  3. Quando a leitura vier sem Ask (falha de leitura), permanece SEMPRE a última diferença real conhecida.
 *  4. Se nunca houve spread real, o Ask NÃO é plotado (nada é inventado).
 */

const memSpread = new Map<string, number>();
const LS_PREFIX = 'vortex_last_real_spread_';

export function getLastRealSpread(key?: string | null): number {
  if (!key) return 0;
  const m = memSpread.get(key);
  if (m && m > 0) return m;
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = Number(localStorage.getItem(LS_PREFIX + key));
      if (raw > 0 && isFinite(raw)) {
        memSpread.set(key, raw);
        return raw;
      }
    }
  } catch {}
  return 0;
}

export function rememberRealSpread(key: string | null | undefined, spread: number): void {
  if (!key || !(spread > 0) || !isFinite(spread)) return;
  if (memSpread.get(key) === spread) return;
  memSpread.set(key, spread);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LS_PREFIX + key, String(spread));
  } catch {}
}

export interface DisplayQuote {
  bid: number;
  /** 0 quando não existe nenhum Ask real nem spread real memorizado (não plotar). */
  ask: number;
  spread: number;
  /** true = Bid e Ask vieram juntos da fonte nesta leitura; false = Ask reconstruído com o último spread real. */
  isRealPair: boolean;
}

export function resolveDisplayQuote(
  key: string | null | undefined,
  md: { bid?: any; ask?: any; price?: any; is_synthetic?: boolean } | null | undefined
): DisplayQuote | null {
  if (!md) return null;

  const isSynth = Boolean((md as any).is_synthetic);
  const bid = Number(md.bid || 0);
  const ask = Number(md.ask || 0);

  if (!isSynth && bid > 0 && ask > bid) {
    const spread = Number((ask - bid).toFixed(6));
    rememberRealSpread(key, spread);
    return { bid, ask, spread, isRealPair: true };
  }

  // Leitura sem par Bid/Ask real: o preço da fonte (MT: price = Bid) é a referência de Bid
  const refBid = bid > 0 ? bid : Number(md.price || 0);
  if (!(refBid > 0)) return null;

  const last = getLastRealSpread(key);
  if (last > 0) {
    return { bid: refBid, ask: Number((refBid + last).toFixed(6)), spread: last, isRealPair: false };
  }
  return { bid: refBid, ask: 0, spread: 0, isRealPair: false };
}
