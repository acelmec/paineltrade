@echo off
chcp 65001 > nul
echo ==============================================================================
echo       COMPILADOR AXION TRADESTATION & INSTALADOR — VM TRADER (C# NET8)
echo ==============================================================================
echo.
echo [1/4] Compilando Frontend React / Vite...
call npm.cmd run build
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao compilar o frontend!
    pause
    exit /b %errorlevel%
)

echo.
echo [2/4] Publicando Executavel Principal AxionTradeStation.exe (win-x64)...
dotnet publish src-csharp/Vortex.Desktop/Vortex.Desktop.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o publish-output
if %errorlevel% neq 0 (
    echo [ERRO] Falha na publicacao do executavel principal!
    pause
    exit /b %errorlevel%
)

echo.
echo [3/4] Publicando Instalador Oficial Personalizado Instalador_AxionTradeStation.exe...
dotnet publish src-csharp/Axion.Installer/Axion.Installer.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o publish-output
if %errorlevel% neq 0 (
    echo [ERRO] Falha na publicacao do instalador!
    pause
    exit /b %errorlevel%
)

echo.
echo [4/4] Gerando pacote ZIP para distribuicao...
powershell -NoProfile -Command "Compress-Archive -Path 'publish-output\AxionTradeStation.exe','publish-output\Instalador_AxionTradeStation.exe' -DestinationPath 'publish-output\AxionTradeStation.zip' -Force"

echo.
echo ==============================================================================
echo [SUCESSO] Binarios gerados com sucesso em publish-output\ :
echo  - publish-output\Instalador_AxionTradeStation.exe (Instalador Oficial com UI, Atalhos e VM Trader)
echo  - publish-output\AxionTradeStation.exe            (Executavel Direto Portatil)
echo  - publish-output\AxionTradeStation.zip            (Pacote ZIP para Download)
echo ==============================================================================
echo.
pause
