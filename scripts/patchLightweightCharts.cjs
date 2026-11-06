const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'node_modules', 'lightweight-charts', 'dist');

if (!fs.existsSync(distDir)) {
  console.log('[patchLightweightCharts] Directory not found, skipping:', distDir);
  process.exit(0);
}

const files = fs.readdirSync(distDir);
let patchedCount = 0;

for (const file of files) {
  if (!file.endsWith('.js') && !file.endsWith('.mjs')) continue;
  const filePath = path.join(distDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Development files
  if (content.includes("throw new Error('Value is null');")) {
    content = content.replace(
      /throw new Error\('Value is null'\);/g,
      "return value ?? { Wt: [0,0,0,0], R: undefined, Ht: undefined, hh: undefined, _internal_value: [0,0,0,0], _internal_color: undefined, _internal_lineColor: undefined };"
    );
    changed = true;
  }

  // Production files
  if (content.includes('if(null===t)throw new Error("Value is null");return t')) {
    content = content.replace(
      /if\(null===t\)throw new Error\("Value is null"\);return t/g,
      "return t ?? { Wt: [0,0,0,0], R: void 0, Ht: void 0, hh: void 0, _internal_value: [0,0,0,0] }"
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    patchedCount++;
    console.log(`[patchLightweightCharts] Successfully patched: ${file}`);
  }
}

// Clear Vite cache so dev server picks up patched files
const viteCacheDir = path.join(__dirname, '..', 'node_modules', '.vite');
if (fs.existsSync(viteCacheDir)) {
  try {
    fs.rmSync(viteCacheDir, { recursive: true, force: true });
    console.log('[patchLightweightCharts] Cleared node_modules/.vite cache');
  } catch (err) {
    console.warn('[patchLightweightCharts] Could not clear .vite cache:', err.message);
  }
}

console.log(`[patchLightweightCharts] Done! Patched ${patchedCount} files.`);
