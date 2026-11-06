const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');

const root = path.resolve(__dirname, '..');

console.log('=== [EASYPANEL PACKAGER] Iniciando preparação do pacote de deploy ===');

// 1. Atualiza zips dos Add-Ons
console.log('1/4 Atualizando zips dos Add-Ons...');
cp.execSync('node scripts/pack_addon.cjs', { cwd: root, stdio: 'inherit' });

// 2. Compila a aplicação Vite + patch de charts
console.log('2/4 Compilando frontend (npm run build)...');
cp.execSync('npm run build', { cwd: root, stdio: 'inherit' });

// 3. Monta diretório temporário para empacotamento limpo
console.log('3/4 Coletando módulos necessários para Easypanel...');
const stagingDir = path.join(os.tmpdir(), 'vortex_easypanel_' + Date.now());
fs.mkdirSync(stagingDir, { recursive: true });

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(child => {
      copyRecursive(path.join(src, child), path.join(dest, child));
    });
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

const requiredItems = [
  'dist',
  'Dockerfile',
  'Dockerfile.easypanel',
  'docker-compose.yml',
  'docker-start.sh',
  'nginx.conf',
  'package.json',
  'package-lock.json',
  'scripts',
  'src/backgroundWorker.js'
];

requiredItems.forEach(item => {
  const fullSrc = path.join(root, item);
  const fullDest = path.join(stagingDir, item);
  if (fs.existsSync(fullSrc)) {
    copyRecursive(fullSrc, fullDest);
    console.log(`   + [OK] ${item}`);
  } else {
    console.warn(`   ! [AVISO] Item não encontrado: ${item}`);
  }
});

// 4. Cria os arquivos zip finais
console.log('4/4 Gerando arquivos compactados...');
const releaseDir = path.join(root, 'release');
if (!fs.existsSync(releaseDir)) fs.mkdirSync(releaseDir, { recursive: true });

const zipTargets = [
  path.join(root, 'easypanel-deploy.zip'),
  path.join(root, 'vortex-easypanel.zip'),
  path.join(releaseDir, 'vortex-easypanel.zip')
];

zipTargets.forEach(zipPath => {
  if (fs.existsSync(zipPath)) {
    try { fs.unlinkSync(zipPath); } catch { }
  }
  const psCmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${stagingDir.replace(/\\/g, '\\\\')}', '${zipPath.replace(/\\/g, '\\\\')}', [System.IO.Compression.CompressionLevel]::Optimal, $false)"`;
  cp.execSync(psCmd, { stdio: 'inherit' });
  console.log(`   ✅ Pacote gerado com sucesso: ${path.basename(zipPath)} (${(fs.statSync(zipPath).size / (1024 * 1024)).toFixed(2)} MB)`);
});

try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch { }

console.log('=== [EASYPANEL PACKAGER] Pacotes prontos para upload no Easypanel! ===');
