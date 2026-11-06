const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');

const root = path.resolve(__dirname, '..');

function packSingleAddon(csFileName, zipFileName) {
  const tmpDir = path.join(os.tmpdir(), 'vortex_pack_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
  const ninjaDir = path.join(tmpDir, 'bin', 'Custom', 'AddOns');
  fs.mkdirSync(ninjaDir, { recursive: true });

  const sourceCs = path.join(root, 'experts', csFileName);
  if (!fs.existsSync(sourceCs)) {
    console.warn(`[PACK] Arquivo fonte não encontrado: ${sourceCs}`);
    return;
  }

  fs.copyFileSync(sourceCs, path.join(ninjaDir, csFileName));

  const targets = [
    `public/${zipFileName}`,
    `dist/${zipFileName}`,
    `src-csharp/wwwroot/${zipFileName}`,
    `src-csharp/Vortex.Desktop/wwwroot/${zipFileName}`,
    `android/app/src/main/assets/public/${zipFileName}`
  ];

  targets.forEach(t => {
    const fullT = path.join(root, t);
    // Só grava se o diretório pai ou o projeto existir
    const parentDir = path.dirname(fullT);
    if (!fs.existsSync(parentDir)) {
      try { fs.mkdirSync(parentDir, { recursive: true }); } catch { return; }
    }
    if (fs.existsSync(fullT)) {
      try { fs.unlinkSync(fullT); } catch { }
    }
    const psCmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${tmpDir.replace(/\\/g, '\\\\')}', '${fullT.replace(/\\/g, '\\\\')}')"`;
    try {
      cp.execSync(psCmd, { stdio: 'pipe' });
      console.log(`[PACK] ✅ ${zipFileName} atualizado em ${t}`);
    } catch (err) {
      console.warn(`[PACK] ⚠️ Falha ao atualizar ${t}:`, err.message);
    }
  });

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
}

console.log('--- Compactando Add-Ons NinjaTrader 8 ---');
packSingleAddon('AxionGatewayAddOn.cs', 'AxionGatewayAddOn.zip');
packSingleAddon('AxionGatewayAddOn.cs', 'VortexGatewayAddOn.zip');
packSingleAddon('AxionStreamerAddOn.cs', 'AxionStreamerAddOn.zip');
console.log('--- Add-Ons NinjaTrader 8 compactados com sucesso! ---');
