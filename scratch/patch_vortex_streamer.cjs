const fs = require('fs');
const path = require('path');

// 1. Atualizar vortexStreamer.ts
const vsPath = path.resolve('src/services/vortexStreamer.ts');
let vsContent = fs.readFileSync(vsPath, 'utf8');

// Ajustar timeouts
vsContent = vsContent.replace(
  /const STATUS_TIMEOUT_MS = \d+;\r?\nconst DATA_TIMEOUT_MS = \d+;/,
  `const STATUS_TIMEOUT_MS = 1500;\nconst DATA_TIMEOUT_MS = 6500;`
);

// Ajustar isStreamFresh para 10 minutos
vsContent = vsContent.replace(
  /return \(Date\.now\(\) - t\) <= 30 \* 1000;/,
  `return (Date.now() - t) <= 10 * 60 * 1000;`
);

// Ajustar getStreamerInfoForPanel para aceitar streams que tenham velas ou preço válido
vsContent = vsContent.replace(
  /if \(matched && isStreamFresh\(matched\.updated_at\) && Number\(matched\.last_price \|\| 0\) > 0\) \{/g,
  `if (matched && (matched.bars_count > 0 || Number(matched.last_price || 0) > 0 || isStreamFresh(matched.updated_at))) {`
);

// Ajustar fetchStreamerCandles para aceitar limit e usar contagem generosa
vsContent = vsContent.replace(
  /export async function fetchStreamerCandles\(panelOrId: any, panelSettings\?: any, force = false\): Promise<Candle\[\] \| null> \{/,
  `export async function fetchStreamerCandles(panelOrId: any, panelSettings?: any, force = false, limit?: number): Promise<Candle[] | null> {`
);

vsContent = vsContent.replace(
  /const countParam = force \? '' : '&count=15000';/,
  `const requestedCount = limit ? Math.max(limit, 15000) : 35000;\n    const countParam = force ? '' : \`&count=\${requestedCount}\`;`
);

fs.writeFileSync(vsPath, vsContent, 'utf8');
console.log('vortexStreamer.ts updated successfully');
