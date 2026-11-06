FROM node:20-alpine AS builder

WORKDIR /app

# Aceita os argumentos de build passados pelo Easypanel
ARG WS_HUB_TARGET=""
ARG GIT_SHA=""

COPY . .

# Se a pasta dist já existir com index.html (como no pacote de deploy ZIP), pula o build
# Caso contrário (ex: deploy direto via repositório Git), instala dependências e compila
RUN if [ ! -f "dist/index.html" ]; then \
      echo "=== [BUILD] dist não encontrado. Compilando aplicação React/Vite... ===" && \
      npm install --ignore-scripts --legacy-peer-deps && \
      node scripts/patchLightweightCharts.cjs && \
      npm run build; \
    else \
      echo "=== [BUILD] dist pré-compilado detectado com sucesso. Pulando compilação frontend. ==="; \
    fi

FROM nginx:alpine

# Aceita os argumentos do Easypanel para não gerar warnings/falhas no buildx
ARG WS_HUB_TARGET=""
ARG GIT_SHA=""

ENV WS_HUB_TARGET=$WS_HUB_TARGET
ENV GIT_SHA=$GIT_SHA

# Instalar Node.js para rodar o monitor de operações autônomo (backgroundWorker) no servidor 24/7
RUN apk add --no-cache nodejs npm

WORKDIR /app
# Configuração limpa e isolada para o worker, sem depender do package.json do frontend
RUN echo '{"name":"vortex-worker","type":"module"}' > package.json && \
    npm install --ignore-scripts --omit=dev --no-audit --no-fund @supabase/supabase-js ws

COPY src/backgroundWorker.js ./src/backgroundWorker.js
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-start.sh /app/docker-start.sh
# Corrige quebras de linha Windows CRLF para Unix LF e adiciona permissão de execução
RUN sed -i 's/\r$//' /app/docker-start.sh && chmod 755 /app/docker-start.sh

EXPOSE 80

CMD ["/app/docker-start.sh"]
