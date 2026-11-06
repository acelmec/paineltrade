const fs = require('fs');
const path = require('path');

const dbPath = path.resolve('src/services/db.ts');
let dbContent = fs.readFileSync(dbPath, 'utf8');

const targetOld = `  // 1. Tentar coletar dados do streamer local NinjaTrader (:8002) se disponível
  // O streamer local NUNCA pode bloquear o carregamento: teto de 2.5s e fallback imediato para o Supabase.
  let localCandles: Candle[] | null = null;
  try {
    const contextTarget = targetPanelObj || queryId;
    localCandles = await withDbTimeout(
      (async () => {
        const hasLocal = await hasLocalStreamForPanel(contextTarget, panelSettings);
        return hasLocal ? await fetchStreamerCandles(contextTarget, panelSettings) : null;
      })(),
      2500
    ).catch(() => null);
  } catch (err) {
    console.warn('[DB] Erro ao obter dados do streamer local:', err);
  }

  const hasLocalData = Boolean(localCandles && localCandles.length > 0);
  const localHasGap = hasLocalData ? detectInternalCandleGap(localCandles!) : false;
  const localCoversLimit = hasLocalData && localCandles!.length >= limit;
  const lastLocal = hasLocalData ? localCandles![localCandles!.length - 1] : null;
  const lastLocalMs = lastLocal ? new Date(lastLocal.timestamp).getTime() : 0;
  // Se a última vela local estiver com mais de 3 minutos de atraso em relação ao relógio atual,
  // os dados locais estão desatualizados/congelados e DEVEM buscar no Supabase para preencher o vazio
  const isLocalStale = !lastLocalMs || isNaN(lastLocalMs) || (Date.now() - lastLocalMs > 3 * 60 * 1000);

  // Se o NinjaTrader local já tiver TODO o limite solicitado sem nenhuma lacuna/gap temporal anormal
  // E estiver rigorosamente atualizado com o minuto corrente do mercado:
  if (hasLocalData && localCoversLimit && !localHasGap && !isLocalStale) {
    onProgress?.(100, localCandles!.length, limit);
    saveLocalCandles(queryId, localCandles!);
    return localCandles!.slice(-limit);
  }`;

const replacementNew = `  // 1. Tentar coletar dados do streamer local NinjaTrader (:8002) se disponível
  // Prioridade Máxima Local: O streamer local alimenta até 50.000 velas direto do NinjaTrader 8
  let localCandles: Candle[] | null = null;
  try {
    const contextTarget = targetPanelObj || queryId;
    localCandles = await withDbTimeout(
      (async () => {
        const hasLocal = await hasLocalStreamForPanel(contextTarget, panelSettings);
        return hasLocal ? await fetchStreamerCandles(contextTarget, panelSettings, false, limit) : null;
      })(),
      6500
    ).catch(() => null);
  } catch (err) {
    console.warn('[DB] Erro ao obter dados do streamer local:', err);
  }

  const hasLocalData = Boolean(localCandles && localCandles.length > 0);
  const localHasGap = hasLocalData ? detectInternalCandleGap(localCandles!) : false;
  const localCoversLimit = hasLocalData && (localCandles!.length >= limit || localCandles!.length >= 1000);
  const lastLocal = hasLocalData ? localCandles![localCandles!.length - 1] : null;
  const lastLocalMs = lastLocal ? new Date(lastLocal.timestamp).getTime() : 0;

  // Se o NinjaTrader local tiver dados sem lacunas internas anormais, usamos com prioridade local
  if (hasLocalData && localCoversLimit && !localHasGap) {
    onProgress?.(100, localCandles!.length, limit);
    saveLocalCandles(queryId, localCandles!);
    return localCandles!.slice(-limit);
  }`;

if (!dbContent.includes(targetOld)) {
  console.error('Target old block not found in db.ts!');
  process.exit(1);
}

dbContent = dbContent.replace(targetOld, replacementNew);

// Usar temporary file e copyFile ou replace
const tempPath = path.resolve('src/services/db.ts.tmp');
fs.writeFileSync(tempPath, dbContent, 'utf8');

// Tentar substituir usando Set-Content ou Move-Item
console.log('Temporary file written, ready to swap.');
