const fs = require('fs');
const path = require('path');

const dbPath = path.resolve('src/services/db.ts');
let content = fs.readFileSync(dbPath, 'utf8');
const isCrlf = content.includes('\r\n');
if (isCrlf) content = content.replace(/\r\n/g, '\n');

const target = `  const lastLocal = hasLocalData ? localCandles![localCandles!.length - 1] : null;
  const lastLocalMs = lastLocal ? new Date(lastLocal.timestamp).getTime() : 0;

  // Se o NinjaTrader local tiver dados sem lacunas internas anormais, usamos com prioridade local`;

const replacement = `  // Se o NinjaTrader local tiver dados sem lacunas internas anormais, usamos com prioridade local`;

if (!content.includes(target)) {
  console.error('Target not found in db.ts');
  process.exit(1);
}

content = content.replace(target, replacement);
if (isCrlf) content = content.replace(/\n/g, '\r\n');

const tempPath = path.resolve('src/services/db.ts.tmp');
fs.writeFileSync(tempPath, content, 'utf8');
console.log('db.ts.tmp written');
