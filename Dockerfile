# Stage 1: Build a aplicação React
FROM node:20-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Garantir que os binários locais no container tenham permissão de execução
RUN chmod -R +x node_modules/.bin

# Argumentos de Build para passar variáveis do .env no build do Vite
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_WOO_BASE_URL
ARG VITE_WOO_CONSUMER_KEY
ARG VITE_WOO_CONSUMER_SECRET
ARG VITE_WOO_COD_PRODUTO

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_WOO_BASE_URL=$VITE_WOO_BASE_URL
ENV VITE_WOO_CONSUMER_KEY=$VITE_WOO_CONSUMER_KEY
ENV VITE_WOO_CONSUMER_SECRET=$VITE_WOO_CONSUMER_SECRET
ENV VITE_WOO_COD_PRODUTO=$VITE_WOO_COD_PRODUTO

RUN npm run build

# Stage 2: Servir os arquivos com Nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
