const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');

/**
 * Obtém a data local no formato DDMMAAAA (ex: 16112026)
 */
function getFormattedDate(d = new Date()) {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear());
  return `${day}${month}${year}`;
}

/**
 * Localiza a próxima pasta de versão para a data informada: public/V<DDMMAAAA>_<NN>
 */
function getNextVersionFolder(dateStr = getFormattedDate()) {
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const prefix = `V${dateStr}_`;
  const entries = fs.readdirSync(publicDir, { withFileTypes: true });
  let maxSeq = 0;

  entries.forEach(entry => {
    if (entry.isDirectory() && entry.name.startsWith(prefix)) {
      const seqPart = entry.name.substring(prefix.length);
      const seqNum = parseInt(seqPart, 10);
      if (!isNaN(seqNum) && seqNum > maxSeq) {
        maxSeq = seqNum;
      }
    }
  });

  const nextSeq = String(maxSeq + 1).padStart(2, '0');
  const folderName = `${prefix}${nextSeq}`;
  return {
    folderName,
    folderPath: path.join(publicDir, folderName),
    seq: maxSeq + 1
  };
}

/**
 * Encontra a última pasta de versão existente para a data informada (ou data mais recente)
 */
function getLastVersionFolder(excludeName = null) {
  if (!fs.existsSync(publicDir)) return null;
  const entries = fs.readdirSync(publicDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && /^V\d{8}_\d{2}$/.test(e.name) && (!excludeName || e.name !== excludeName))
    .map(e => e.name)
    .sort()
    .reverse();

  if (entries.length === 0) return null;
  return path.join(publicDir, entries[0]);
}

/**
 * Mapeamento dos 3 arquivos de release
 */
const PACKAGE_SOURCES = {
  easypanel: [
    path.join(root, 'easypanel-deploy.zip'),
    path.join(root, 'vortex-easypanel.zip'),
    path.join(root, 'release', 'vortex-easypanel.zip')
  ],
  windows: [
    path.join(root, 'release', 'Instalador_AxionTradeStation.exe'),
    path.join(root, 'publish-output', 'Instalador_AxionTradeStation.exe'),
    path.join(root, 'Instalador_AxionTradeStation.exe')
  ],
  android: [
    path.join(root, 'release', 'VortexWeb.apk'),
    path.join(root, 'vortexweb-release.apk'),
    path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
  ]
};

const TARGET_FILENAMES = {
  easypanel: 'easypanel-deploy.zip',
  windows: 'Instalador_AxionTradeStation.exe',
  android: 'VortexWeb.apk'
};

function resolveSourceFile(type) {
  const candidates = PACKAGE_SOURCES[type] || [];
  let newestFile = null;
  let newestMtime = -1;

  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      const mtime = fs.statSync(c).mtimeMs;
      if (mtime > newestMtime) {
        newestMtime = mtime;
        newestFile = c;
      }
    }
  }
  return newestFile;
}

/**
 * Salva a versão na pasta public/V<DDMMAAAA>_<NN>
 * @param {('all'|'easypanel'|'windows'|'android')} targetType 
 */
function saveVersion(targetType = 'all') {
  const next = getNextVersionFolder();
  const lastFolder = getLastVersionFolder(next.folderName);
  fs.mkdirSync(next.folderPath, { recursive: true });

  console.log(`\n=== [GERENCIADOR DE VERSÕES PUBLIC] ===`);
  console.log(`📁 Criando nova versão: public/${next.folderName}`);

  const typesToCopy = targetType === 'all' 
    ? ['easypanel', 'windows', 'android'] 
    : [targetType];

  // Se for atualização individual, copia os outros 2 pacotes da última versão para manter a pasta íntegra
  const allTypes = ['easypanel', 'windows', 'android'];
  const results = [];

  for (const type of allTypes) {
    const destFileName = TARGET_FILENAMES[type];
    const destPath = path.join(next.folderPath, destFileName);

    if (typesToCopy.includes(type)) {
      const src = resolveSourceFile(type);
      if (src) {
        fs.copyFileSync(src, destPath);
        const sizeMb = (fs.statSync(destPath).size / (1024 * 1024)).toFixed(2);
        results.push({ type, status: 'ATUALIZADO', file: destFileName, size: `${sizeMb} MB`, path: destPath });
      } else {
        results.push({ type, status: 'NÃO ENCONTRADO', file: destFileName, size: '-', path: null });
      }
    } else if (lastFolder && fs.existsSync(path.join(lastFolder, destFileName))) {
      // Reutiliza o pacote anterior
      const prevFile = path.join(lastFolder, destFileName);
      fs.copyFileSync(prevFile, destPath);
      const sizeMb = (fs.statSync(destPath).size / (1024 * 1024)).toFixed(2);
      results.push({ type, status: 'MANTIDO DA VERSÃO ANTERIOR', file: destFileName, size: `${sizeMb} MB`, path: destPath });
    }
  }

  console.log('\nResumo da Versão:');
  results.forEach(r => {
    console.log(` - [${r.status}] ${r.file} (${r.size})`);
    if (r.path) {
      const fileUrl = 'file:///' + r.path.replace(/\\/g, '/');
      console.log(`   Link: ${fileUrl}`);
    }
  });

  console.log(`\n✅ Versão ${next.folderName} finalizada com sucesso!\n`);
  return { next, results };
}

// Execução direta via CLI
const arg = process.argv[2] || 'all';
saveVersion(arg);
