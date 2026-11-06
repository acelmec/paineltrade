const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');

const root = path.resolve(__dirname, '..');
const releaseDir = path.join(root, 'release');
const bundleDir = path.join(root, 'release', 'bundle');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function hasFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function safeUnlink(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.warn(`Aviso: não foi possível remover ${filePath}: ${error.message}`);
  }
}

console.log('=== [RELEASE BUNDLE] Iniciando build de entrega ===');
ensureDir(releaseDir);
ensureDir(bundleDir);

const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-');
const targetZip = path.join(releaseDir, `vortex-easypanel-${stamp}.zip`);
const bundleZip = path.join(releaseDir, `vortex-release-bundle-${stamp}.zip`);

console.log('1/4 Atualizando add-ons...');
cp.execSync('node scripts/pack_addon.cjs', { cwd: root, stdio: 'inherit' });

console.log('2/4 Compilando frontend...');
cp.execSync('npm run build', { cwd: root, stdio: 'inherit' });

console.log('3/4 Preparando empacotamento do EasyPanel...');
const stagingDir = path.join(os.tmpdir(), `vortex_easypanel_${Date.now()}`);
ensureDir(stagingDir);

const requiredItems = [
  'dist',
  'Dockerfile',
  'Dockerfile.easypanel',
  'docker-compose.yml',
  'docker-start.sh',
  'nginx.conf',
  'package.json',
  'package-lock.json',
  'src/backgroundWorker.js'
];

for (const item of requiredItems) {
  const source = path.join(root, item);
  const dest = path.join(stagingDir, item);
  if (!fs.existsSync(source)) {
    console.warn(`  ! Item ausente: ${item}`);
    continue;
  }

  if (fs.statSync(source).isDirectory()) {
    fs.cpSync(source, dest, { recursive: true });
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(source, dest);
  }
}

console.log('4/4 Gerando zips finais...');
try {
  const zipCreate = `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${stagingDir.replace(/\\/g, '\\\\')}', '${targetZip.replace(/\\/g, '\\\\')}', [System.IO.Compression.CompressionLevel]::Optimal, $false)"`;
  cp.execSync(zipCreate, { stdio: 'inherit' });
  console.log(`✅ ZIP EasyPanel gerado: ${path.basename(targetZip)}`);
} catch (error) {
  console.error('Falha ao gerar ZIP do EasyPanel:', error.message);
}

const bundleEntries = [
  { path: targetZip, name: path.basename(targetZip) },
  { path: path.join(root, 'release', 'VortexWeb-Desktop-Portable.zip'), name: 'VortexWeb-Desktop-Portable.zip' },
  { path: path.join(root, 'release', 'VortexWeb Desktop 1.0.0.exe'), name: 'VortexWeb Desktop 1.0.0.exe' },
  { path: path.join(root, 'release', 'VortexWeb Desktop Setup 1.0.0.exe'), name: 'VortexWeb Desktop Setup 1.0.0.exe' }
].filter(entry => hasFile(entry.path));

if (bundleEntries.length > 0) {
  const bundleRoot = path.join(bundleDir, `vortex-release-${stamp}`);
  ensureDir(bundleRoot);

  for (const entry of bundleEntries) {
    if (!hasFile(entry.path)) continue;
    const dest = path.join(bundleRoot, entry.name);
    fs.copyFileSync(entry.path, dest);
  }

  const bundleZipCmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${bundleRoot.replace(/\\/g, '\\\\')}', '${bundleZip.replace(/\\/g, '\\\\')}', [System.IO.Compression.CompressionLevel]::Optimal, $false)"`;
  cp.execSync(bundleZipCmd, { stdio: 'inherit' });
  console.log(`✅ ZIP de bundle gerado: ${path.basename(bundleZip)}`);
} else {
  console.warn('Nenhum instalador Windows antigo foi encontrado para incluir no bundle.');
}

try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch (error) {};
console.log('=== [RELEASE BUNDLE] Concluído ===');
