# Guia de Deploy e Compilação — Easypanel (Docker) & Windows (.NET 8)

Este documento registra as causas raízes dos problemas identificados nas compilações do Easypanel e do aplicativo Windows, as soluções aplicadas no código-fonte e o passo a passo seguro para gerar novas versões em qualquer ambiente.

---

## 1. Diagnóstico dos Problemas Identificados

### A. Easypanel (Docker)
* **Causa Raiz:** O arquivo `Dockerfile.easypanel` utiliza Nginx Alpine leve e **não executa `npm run build` dentro do container**. Ele copia diretamente a pasta `dist` pré-compilada da máquina hospedeira:
  ```dockerfile
  COPY dist /usr/share/nginx/html
  ```
  Se o pacote `.zip` for gerado antes de rodar `npm run build`, o Easypanel subirá com arquivos JavaScript/CSS defasados da compilação anterior.

### B. Aplicativo Windows .NET 8 (`AxionTradeStation.exe` e `Instalador_AxionTradeStation.exe`)
Três fatores combinados causavam o travamento do aplicativo em versões antigas no Windows:
1. **Executável Bloqueado pelo Windows durante Instalação:**
   Se o usuário executasse o `Instalador_AxionTradeStation.exe` com o `AxionTradeStation.exe` aberto (ou em segundo plano), o Windows bloqueava a substituição do arquivo em `%LOCALAPPDATA%\Programs\AxionTradeStation\AxionTradeStation.exe`. O instalador ignorava o erro e mantinha o `.exe` antigo (ex: versão de 11/10/2026).
2. **Extração de `wwwroot` no Primeiro Boot do .NET 8:**
   O `AxionTradeStation.exe` embute o frontend compilado em `wwwroot.zip`. No início da execução, o método `EnsureWwwRoot` em `MainWindow.xaml.cs` verificava se a pasta de extração já existia. Caso os arquivos já estivessem lá, a extração era ignorada, impedindo a atualização do HTML/JS mesmo com um novo executável.
3. **Cache de Disco Persistente do WebView2:**
   O componente WebView2 armazena recursos em cache na pasta `%LOCALAPPDATA%\AxionTradeStation_UserData\EBWebView`. Mesmo com arquivos novos no disco, o WebView2 servia scripts antigos da memória cache.

---

## 2. Soluções Implementadas no Código

### 1. Atualização do Instalador Windows (`Axion.Installer/MainWindow.xaml.cs`)
* Adicionada verificação ativa de processos: antes de tentar gravar os arquivos no disco, o instalador localiza e encerra qualquer instância de `AxionTradeStation` em execução.
* Se o arquivo estiver bloqueado, limpa os atributos de somente-leitura e substitui com tratamento de exceções adequado.

### 2. Validação por Hash e Limpeza Forçada no App (`Vortex.Desktop/MainWindow.xaml.cs`)
* O método `EnsureWwwRoot` agora compara o **hash SHA256** do `index.html` embutido no `wwwroot.zip` contra o `index.html` presente no disco.
* Se os hashes forem diferentes ou se qualquer arquivo diferir de tamanho, uma extração limpa e completa é disparada.
* **Limpeza Automática de Cache WebView2:** No evento `CoreWebView2InitializationCompleted`, o app executa:
  ```csharp
  await cw2.Profile.ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds.DiskCache);
  ```
  garantindo que qualquer novo bundle de JavaScript/CSS seja carregado imediatamente na inicialização.

### 3. Correção do Indicador Wyckoff Structural Sweeps (`src/utils/indicatorRegistry.ts`)
* O parâmetro `requireGammaConfluence` foi definido como `false` por padrão. Anteriormente, quando ativo sem confluência de dados Gamma (0DTE), 100% dos sinais e caixotes eram descartados.
* Adicionada tolerância dinâmica via ATR (`atrApprox`) para permitir a detecção de consolidações e sweeps em qualquer ativo (MNQ, NQ, ES, BTC) e tempo gráfico.
* O indicador plota estritamente marcadores (`markers`), mantendo `series: []` para evitar cruzamentos e linhas indesejadas sobre o gráfico.

---

## 3. Passo a Passo para Gerar os Pacotes de Release

### Procedimento para o Easypanel (Docker)
1. **Compilar o Frontend:**
   ```bash
   npm run build
   ```
2. **Gerar os arquivos `.zip` do Easypanel:**
   Execute o script Python de empacotamento:
   ```bash
   python -c "
   import os, zipfile, shutil
   EXCLUDE_DIRS = {'node_modules', '.git', '.github', '.vscode', 'src-csharp', 'src-tauri', 'android', 'ios', 'publish-output', 'release', 'temp_test_isolate', '__pycache__', 'scratch'}
   EXCLUDE_EXTS = {'.pyc', '.zip', '.apk', '.pdb'}
   zip_name = 'easypanel-deploy.zip'
   if os.path.exists(zip_name): os.remove(zip_name)
   with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED) as z:
       for root, dirs, files in os.walk('.'):
           dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
           for f in files:
               if os.path.splitext(f)[1].lower() in EXCLUDE_EXTS: continue
               path = os.path.join(root, f)
               z.write(path, os.path.relpath(path, '.'))
   shutil.copyfile(zip_name, 'vortex-easypanel.zip')
   print('Pronto: easypanel-deploy.zip e vortex-easypanel.zip gerados com sucesso!')
   "
   ```
3. Fazer o upload do `easypanel-deploy.zip` ou `vortex-easypanel.zip` no painel do Easypanel.

---

### Procedimento para o Aplicativo Windows (.NET 8)
1. **Compilar o Frontend:**
   ```bash
   npm run build
   ```
2. **Compilar o Executável Principal (`AxionTradeStation.exe`):**
   ```bash
   dotnet publish src-csharp/Vortex.Desktop/Vortex.Desktop.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o publish-output
   ```
3. **Compilar o Instalador Oficial (`Instalador_AxionTradeStation.exe`):**
   ```bash
   dotnet publish src-csharp/Axion.Installer/Axion.Installer.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o publish-output
   ```
   *(Nota: O comando `npm run installer:build` executa as etapas 1, 2 e 3 em sequência automaticamente).*

4. **Gerar os Arquivos `.zip` dos Binários:**
   ```powershell
   powershell -Command "
   Compress-Archive -Path 'publish-output\AxionTradeStation.exe' -DestinationPath 'publish-output\AxionTradeStation.zip' -Force
   Compress-Archive -Path 'publish-output\Instalador_AxionTradeStation.exe' -DestinationPath 'publish-output\Instalador_AxionTradeStation.zip' -Force
   "
   ```

---

## 4. Localização dos Artefatos Prontos

| Plataforma | Arquivo | Finalidade |
| :--- | :--- | :--- |
| **Easypanel** | `easypanel-deploy.zip` | Pacote completo para deploy via Docker no Easypanel |
| **Easypanel (Backup)** | `vortex-easypanel.zip` | Cópia idêntica de contingência |
| **Windows** | `publish-output/Instalador_AxionTradeStation.exe` | Instalador oficial de arquivo único (Standalone) |
| **Windows** | `publish-output/Instalador_AxionTradeStation.zip` | Instalador compactado para download |
| **Windows** | `publish-output/AxionTradeStation.exe` | Executável direto portátil (sem instalação) |
| **Windows** | `publish-output/AxionTradeStation.zip` | Executável portátil compactado |
