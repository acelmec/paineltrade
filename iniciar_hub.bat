@echo off
title VortexWeb WebSocket Hub Relay (Porta 80 Padrao)
color 0A
echo ========================================================
echo   INICIANDO SERVICO VORTEXWEB WEBSOCKET HUB RELAY (24/7)
echo ========================================================
echo Porta: 80 (HTTP Padrao sem restricao no MT4)
echo WebSocket: ws://127.0.0.1/ws
echo HTTP API: http://127.0.0.1/market_data
echo ========================================================
cd /d "%~dp0"

set PORT=80

echo [1/2] Liberando porta 80 caso esteja ocupada...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":80 " ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo [2/2] Iniciando o Hub WebSocket na porta 80...
echo.

:loop
if exist "server\websocket_hub.cjs" (
    node server\websocket_hub.cjs
) else if exist "websocket_hub.cjs" (
    node websocket_hub.cjs
) else (
    echo.
    echo [ERRO] O arquivo websocket_hub.cjs nao foi encontrado em:
    echo        "%~dp0server\websocket_hub.cjs" nem em "%~dp0websocket_hub.cjs"
    echo.
    echo Por favor, copie o arquivo websocket_hub.cjs para esta pasta!
    timeout /t 5 /nobreak >nul
)

echo.
echo [AVISO] Servico finalizado. Reiniciando em 3 segundos...
timeout /t 3 /nobreak >nul
goto loop
