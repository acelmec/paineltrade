#!/bin/sh
echo "🚀 Iniciando Vortex Background Worker no Servidor..."
node src/backgroundWorker.js > /var/log/worker.log 2>&1 &

echo "🌐 Iniciando Servidor Nginx Web..."
exec nginx -g "daemon off;"
