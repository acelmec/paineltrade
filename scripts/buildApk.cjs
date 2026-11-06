const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');

const root = path.resolve(__dirname, '..');
console.log('=== [ANDROID BUILDER] Iniciando compilação do APK Release ===');

// 1. Atualiza zips dos Add-Ons
console.log('1/4 Atualizando zips dos Add-Ons...');
cp.execSync('node scripts/pack_addon.cjs', { cwd: root, stdio: 'inherit' });

// 2. Compila frontend e sincroniza com o Capacitor
console.log('2/4 Compilando frontend e sincronizando assets do Capacitor...');
cp.execSync('npm run build', { cwd: root, stdio: 'inherit' });
cp.execSync('npx cap sync', { cwd: root, stdio: 'inherit' });

// 3. Configura ambiente Java e Android SDK
console.log('3/4 Configurando ambiente de compilação Android...');
const androidDir = path.join(root, 'android');
const env = { ...process.env };

// Detecção de JAVA_HOME
if (!env.JAVA_HOME) {
  const javaCandidates = [
    'C:\\Program Files\\Java\\jdk-17',
    'C:\\Program Files\\Java\\jdk-21',
    '/usr/lib/jvm/java-17-openjdk-amd64',
    '/usr/lib/jvm/java-21-openjdk-amd64'
  ];
  for (const cand of javaCandidates) {
    if (fs.existsSync(cand)) {
      env.JAVA_HOME = cand;
      break;
    }
  }
}

// Detecção de ANDROID_HOME
if (!env.ANDROID_HOME) {
  const homeDir = os.homedir();
  const sdkCandidates = [
    path.join(homeDir, 'AppData', 'Local', 'Android', 'Sdk'),
    '/home/andre/Android/Sdk',
    path.join(homeDir, 'Android', 'Sdk')
  ];
  for (const cand of sdkCandidates) {
    if (fs.existsSync(cand)) {
      env.ANDROID_HOME = cand;
      break;
    }
  }
}

console.log(`   JAVA_HOME: ${env.JAVA_HOME || '(padrão do sistema)'}`);
console.log(`   ANDROID_HOME: ${env.ANDROID_HOME || '(padrão do sistema)'}`);

// 4. Executa Gradle assembleRelease
console.log('4/4 Compilando APK via Gradle (assembleRelease)...');
const isWindows = process.platform === 'win32';
const gradlewCmd = isWindows ? 'gradlew.bat' : './gradlew';

try {
  cp.execSync(`${gradlewCmd} assembleRelease`, {
    cwd: androidDir,
    env,
    stdio: 'inherit'
  });
} catch (err) {
  console.error('[ERRO] Falha ao compilar com Gradle:', err.message);
  process.exit(1);
}

const apkPath = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (fs.existsSync(apkPath)) {
  const stats = fs.statSync(apkPath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`\n✅ [SUCESSO] APK Release gerado com êxito!`);
  console.log(`   Arquivo: ${apkPath}`);
  console.log(`   Tamanho: ${sizeMb} MB (${stats.size.toLocaleString()} bytes)\n`);

  // Copia para a raiz e para a pasta release
  const rootApk = path.join(root, 'vortexweb-release.apk');
  const releaseDir = path.join(root, 'release');
  if (!fs.existsSync(releaseDir)) fs.mkdirSync(releaseDir, { recursive: true });
  const releaseApk = path.join(releaseDir, 'VortexWeb.apk');
  fs.copyFileSync(apkPath, rootApk);
  fs.copyFileSync(apkPath, releaseApk);
  console.log(`   + Copiado para: ${rootApk}`);
  console.log(`   + Copiado para: ${releaseApk}`);
} else {
  console.error('\n❌ [ERRO] O arquivo app-release.apk não foi encontrado após o build.\n');
  process.exit(1);
}
