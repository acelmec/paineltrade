# Guia de Implantação VPS - Vortex AI
Este guia orienta o deploy da aplicação Vortex AI (React + Vite + Python Backend) em uma VPS Linux (Ubuntu/Debian) usando o domínio **painel.vemviraramesa.com.br**.

---

## 🏗️ Arquitetura do Deploy

- **Frontend (React + Vite):** Compilado localmente (`npm run build`) ou na VPS. Os arquivos estáticos de produção ficam na pasta `dist/`.
- **Servidor Python (`main.py`):** Atua como backend de API (porta `8001`), controlador de licenças WooCommerce e servidor HTTP de fallback (porta `8000`).
- **Nginx:** Servidor web reverso que recebe as requisições HTTPS na porta 443 sob o domínio `painel.vemviraramesa.com.br` e faz o proxy para o servidor local.
- **Certbot (Let's Encrypt):** Provedor automático e gratuito do certificado SSL (HTTPS).

---

## 🛠️ Passo a Passo para Deploy na VPS

### Passo 1: Preparar o Servidor VPS (Ubuntu/Debian)

Acesse sua VPS via SSH e instale os pacotes básicos de sistema:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3 python3-pip python3-venv nginx git curl
```

### Passo 2: Clonar ou Enviar o Projeto para a VPS

Você pode enviar os arquivos do projeto via SFTP (FileZilla/VS Code) para a pasta `/var/www/vortexweb` ou clonar direto com Git:
```bash
sudo mkdir -p /var/www/vortexweb
sudo chown -R $USER:$USER /var/www/vortexweb
cd /var/www/vortexweb
# [Copie os arquivos do projeto para este diretório]
```

### Passo 3: Configurar Variáveis de Ambiente (`.env`)

Crie o arquivo `.env` no diretório raiz do projeto na VPS `/var/www/vortexweb/.env` com as configurações do seu Supabase e chaves API:
```env
VITE_SUPABASE_URL=https://sua-url-supabase.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key-aqui
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui (usada para criação/sincronização de usuários)
```

### Passo 4: Compilar o Frontend (React)

Você pode instalar o Node.js e compilar diretamente na VPS ou compilar na sua máquina local e apenas transferir a pasta `dist/` para a VPS.

Para compilar na VPS:
```bash
# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar dependências e rodar build
npm install
npm run build
```

---

## 🐍 Passo 5: Configurar e Rodar o Python Backend

Como a VPS Linux não possui interface gráfica ou suporte nativo para `ctypes.windll` (usado no Windows para o controle de instância única por Mutex e Machine ID), precisamos ajustar a execução do `main.py` para rodar em modo Linux headless.

### Executando em Linux (Headless)

Se você verificar o arquivo `main.py`, as seguintes linhas dependem do Windows:
- `ctypes.windll.kernel32.CreateMutexW(...)`
- `gerar_machine_id_windows()` executando comandos PowerShell.

No Linux, esses métodos retornam fallback silencioso, mas para garantir que o script execute sem problemas e sem tentar abrir a tela do navegador localmente (já que o servidor VPS não possui display gráfico):
A aplicação executa normalmente o servidor de API na porta `8001` e o servidor HTML na porta `8000`.

Para gerenciar o processo do Python e mantê-lo rodando em segundo plano mesmo após desconectar do SSH, usaremos o **PM2** (utilitário popular de gerenciamento de processos) ou o **systemd** do Linux.

#### Opção A: Usando PM2 (Recomendado)
```bash
# Instalar PM2 globalmente
sudo npm install -y -g pm2

# Iniciar o servidor Python
pm2 start main.py --name vortex-backend --interpreter python3

# Salvar a lista de processos para iniciar com o boot da VPS
pm2 save
pm2 startup
```

#### Opção B: Criando um Serviço do Systemd
Crie o arquivo de serviço:
```bash
sudo nano /etc/systemd/system/vortex.service
```
Cole o seguinte conteúdo:
```ini
[Unit]
Description=Vortex AI Backend
After=network.target

[Service]
User=root
WorkingDirectory=/var/www/vortexweb
ExecStart=/usr/bin/python3 main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
Inicie e habilite o serviço para iniciar com a VPS:
```bash
sudo systemctl daemon-reload
sudo systemctl start vortex
sudo systemctl enable vortex
```

---

## 🌐 Passo 6: Configurar o Servidor Web Nginx

O Nginx escutará as requisições no domínio `painel.vemviraramesa.com.br` e direcionará para o serviço correto.

1. Remova a configuração padrão do Nginx:
   ```bash
   sudo rm /etc/nginx/sites-enabled/default
   ```

2. Crie uma nova configuração para o domínio:
   ```bash
   sudo nano /etc/nginx/sites-available/vortex
   ```

3. Cole o seguinte bloco de configuração (substituindo o domínio se necessário):
   ```nginx
   server {
       listen 80;
       server_name painel.vemviraramesa.com.br;

       # Redirecionamento de tráfego para HTTPS (será inserido automaticamente pelo Certbot)
       
       # Servir os arquivos estáticos compilados do React (Frontend)
       location / {
           root /var/www/vortexweb/dist;
           index index.html;
           try_files $uri $uri/ /index.html;
           add_header Cache-Control "no-cache, no-store, must-revalidate";
       }

       # Proxy das requisições de API local (para o main.py na porta 8001)
       location /api/ {
           proxy_pass http://127.0.0.1:8001/;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded-for;
       }
   }
   ```

4. Ative a configuração e reinicie o Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/vortex /etc/nginx/sites-enabled/
   sudo nginx -t  # Verifica se não há erros de sintaxe
   sudo systemctl restart nginx
   ```

---

## 🔒 Passo 7: Instalar Certificado SSL (HTTPS) com Let's Encrypt

Acesse o Certbot para obter o certificado SSL e configurar o HTTPS de forma automática no seu arquivo do Nginx:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d painel.vemviraramesa.com.br
```
*Siga as instruções na tela. O Certbot irá perguntar se deseja redirecionar o tráfego HTTP para HTTPS automaticamente. Selecione **Yes/Redirect**.*

Após a conclusão, o seu painel estará disponível de forma segura em:
**`https://painel.vemviraramesa.com.br`**

---

## 📈 Integração com NinjaTrader 8

Para que a VPS receba os dados em tempo real enviados pelo NinjaTrader 8 (que roda na sua máquina de trading local):
1. No script do NinjaTrader 8 (que faz as requisições POST com os dados de mercado e screenshots), altere o endpoint de envio de `http://localhost:8001` para:
   **`https://painel.vemviraramesa.com.br/api`**
2. O Nginx no seu servidor VPS receberá as requisições HTTPS e fará o encaminhamento interno seguro de forma silenciosa para o servidor Python rodando na porta `8001`.

---

## ⚡ Monitoramento e Logs na VPS

Para monitorar os logs em tempo real e garantir o correto funcionamento:
- **Ver logs do Nginx:**
  ```bash
  sudo tail -f /var/log/nginx/error.log
  sudo tail -f /var/log/nginx/access.log
  ```
- **Ver logs do Servidor Python (PM2):**
  ```bash
  pm2 logs vortex-backend
  ```
- **Ver status do serviço (Systemd):**
  ```bash
  sudo systemctl status vortex
  sudo journalctl -u vortex -f
  ```
