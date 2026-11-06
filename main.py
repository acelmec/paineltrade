import sys
import os

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

import webbrowser
import time
import signal
import threading
import socket
import ctypes
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request
import urllib.error
import hashlib
import socketserver
import uuid
from datetime import datetime

# Fila em memória para armazenar os sinais locais disparados para o VMBot
sinais_locais_queue = []

# ================================================================
#  INSTÂNCIA ÚNICA VIA MUTEX DO WINDOWS
# ================================================================
_mutex = None

def criar_mutex():
    global _mutex
    try:
        _mutex = ctypes.windll.kernel32.CreateMutexW(None, False, "VortexAI_SingleInstance_Mutex")
        if _mutex == 0:
            return False
        if ctypes.windll.kernel32.GetLastError() == 183:
            ctypes.windll.kernel32.CloseHandle(_mutex)
            _mutex = None
            return False
        return True
    except:
        return True

def liberar_mutex():
    global _mutex
    if _mutex:
        try:
            ctypes.windll.kernel32.ReleaseMutex(_mutex)
            ctypes.windll.kernel32.CloseHandle(_mutex)
        except:
            pass
        _mutex = None

# ================================================================
#  CONFIGURAÇÕES GLOBAIS
# ================================================================
HTML_FILE = "dist/index.html" # Atualizado para apontar para a build do Vite
PORT_HTML = 8000
PORT_API = 8001
URL_PAINEL = f"http://localhost:{PORT_HTML}/index.html"

# Caminho fixo para arquivos gerados pelo NinjaTrader
NINJA_PANEL_DIR = r'C:\NinjaPanel'
JSON_PATH = os.path.join(NINJA_PANEL_DIR, 'sinal.json')

# WooCommerce
CONSUMER_KEY = 'ck_75f9d0f430cb40c64c902ed43ce2bceb08e5e649'
CONSUMER_SECRET = 'cs_a741c57b4368102a1daf3fbfc4598833ffb23e77'
COD_PRODUTO = 8426
COD_PRODUTO_ALTERNATIVO = 7375
PRODUTOS_PERMITIDOS = [COD_PRODUTO, COD_PRODUTO_ALTERNATIVO]
BASE_URL = 'https://ffbinvest.amsolucoes.net.br/wp-json/wc/v3'

# Sessões
sessoes_validas = {}
_navegador_aberto = False

# ================================================================
#  DETECTAR SE ESTÁ RODANDO DENTRO DO .EXE
# ================================================================
def resource_path(relative_path):
    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS
    else:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

# ================================================================
#  GERAR MACHINE ID DIRETO DO HARDWARE (SILENCIOSO)
# ================================================================
def gerar_machine_id_windows():
    import subprocess
    info = {'mobo': 'UNKNOWN', 'cpu': 'UNKNOWN', 'mac': 'UNKNOWN'}
    CREATE_NO_WINDOW = 0x08000000 
    try:
        result = subprocess.run(
            ['powershell', '-NoProfile', '-WindowStyle', 'Hidden', '-Command', 
             'Get-CimInstance Win32_BaseBoard | Select-Object -ExpandProperty SerialNumber'],
            capture_output=True, text=True, check=True, timeout=5,
            creationflags=CREATE_NO_WINDOW
        )
        info['mobo'] = result.stdout.strip()
    except Exception:
        pass

    try:
        result = subprocess.run(
            ['powershell', '-NoProfile', '-WindowStyle', 'Hidden', '-Command', 
             'Get-CimInstance Win32_Processor | Select-Object -ExpandProperty ProcessorId'],
            capture_output=True, text=True, check=True, timeout=5,
            creationflags=CREATE_NO_WINDOW
        )
        info['cpu'] = result.stdout.strip()
    except Exception:
        pass

    try:
        result = subprocess.run(
            ['powershell', '-NoProfile', '-WindowStyle', 'Hidden', '-Command', 
             'Get-NetAdapter | Where-Object {$_.Virtual -eq $false -and $_.Status -eq "Up"} | Select-Object -First 1 -ExpandProperty MacAddress'],
            capture_output=True, text=True, check=True, timeout=5,
            creationflags=CREATE_NO_WINDOW
        )
        info['mac'] = result.stdout.strip().replace('-', '').replace(':', '').upper()
    except Exception:
        pass

    raw_string = f"{info['mobo']}|{info['cpu']}|{info['mac']}"
    SECRET_SALT = "VORTEX_AI_GAMMA_SCALPE_2024_SECRET_KEY"
    hash_obj = hashlib.sha256((raw_string + SECRET_SALT).encode('utf-8'))
    hash_hex = hash_obj.hexdigest().upper()
    formatted_id = '-'.join([hash_hex[i:i+4] for i in range(0, 16, 4)])

    return formatted_id

# ================================================================
#  FUNÇÕES AUXILIARES DO SERVIDOR API
# ================================================================
def gerar_token(assinatura_id):
    raw = f"{assinatura_id}_{int(time.time())}_vortex_ai"
    return hashlib.sha256(raw.encode()).hexdigest()

def validar_assinatura_wc(assinatura_id):
    machine_id_local = gerar_machine_id_windows()
    if not machine_id_local:
        return False, "Erro ao gerar Machine ID do hardware.", None
    
    try:
        url = f"{BASE_URL}/subscriptions/{assinatura_id}?consumer_key={CONSUMER_KEY}&consumer_secret={CONSUMER_SECRET}"
        req = urllib.request.Request(url)
        req.add_header('User-Agent', 'VortexAI-Panel/1.0')
        
        with urllib.request.urlopen(req, timeout=10) as response:
            json_data = response.read().decode('utf-8')
            data = json.loads(json_data)
            
            status = data.get('status', '').lower()
            if status not in ['active', 'on-hold']:
                return False, f"Licenca nao esta ativa (status: {status})", data
            
            line_items = data.get('line_items', [])
            
            produto_ok = False
            for item in line_items:
                try:
                    p_id = int(item.get('product_id'))
                    if p_id in PRODUTOS_PERMITIDOS:
                        produto_ok = True
                        break
                except (ValueError, TypeError):
                    if str(item.get('product_id')) in [str(p) for p in PRODUTOS_PERMITIDOS]:
                        produto_ok = True
                        break
                        
            if not produto_ok:
                return False, f"Produto incorreto na assinatura", data
            
            id_nt = None
            for item in line_items:
                for meta in item.get('meta_data', []):
                    if meta.get('key') == 'id_nt':
                        id_nt = meta.get('value', '')
                        break
                if id_nt:
                    break
            
            if not id_nt:
                return False, "Machine ID (id_nt) nao encontrado na assinatura", data
            
            if id_nt.upper() != machine_id_local.upper():
                return False, f"Licenca invalida para esta maquina", data
            
            return True, "Assinatura valida!", data
            
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False, "Assinatura inexistente", None
        return False, f"Erro HTTP {e.code}", None
    except Exception as e:
        return False, f"Erro: {str(e)}", None

def rotina_revalidacao_silenciosa():
    while True:
        time.sleep(43200)
        sessoes_validas_copy = list(sessoes_validas.items())
        sessoes_para_remover = []
        for token, dados in sessoes_validas_copy:
            assinatura_id = dados.get('assinatura_id')
            if not assinatura_id:
                sessoes_para_remover.append(token)
                continue
            sucesso, mensagem, _ = validar_assinatura_wc(assinatura_id)
            if sucesso:
                dados['expires_at'] = time.time() + (24 * 60 * 60)
                dados['last_revalidated'] = time.time()
            else:
                sessoes_para_remover.append(token)
        for token in sessoes_para_remover:
            del sessoes_validas[token]

# ================================================================
#  SERVIDOR API (porta 8001)
# ================================================================
class APIHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_POST(self):
        if self.path == '/validar':
            self._handle_validar()
            return
        elif self.path == '/sinal_local' or self.path == '/sinal_local/':
            self._handle_post_sinal_local()
            return
        elif self.path.startswith('/sinal_local/status') or self.path.startswith('/sinal_local/update_status'):
            self._handle_post_sinal_local_status()
            return
        elif self.path.startswith('/sinal_local/levels') or self.path.startswith('/sinal_local/update_levels'):
            self._handle_post_sinal_local_levels()
            return
        length = int(self.headers.get('Content-Length', 0))
        data = json.loads(self.rfile.read(length))
        with open(JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        self._send_json(200, {'ok': True})

    def do_GET(self):
        if self.path == '/machine-id':
            self._handle_machine_id()
        elif self.path == '/check-auth':
            self._handle_check_auth()
        elif self.path == '/sinal' or self.path == '/sinal/':
            self._handle_get_sinal()
        elif self.path.startswith('/sinal_local'):
            self._handle_get_sinal_local()
        elif self.path.startswith('/analise_contexto'):
            self._handle_analise_contexto()
        else:
            self.send_response(404)
            self.end_headers()

    def _handle_validar(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            data = json.loads(body)
            assinatura_id = data.get('assinatura_id', '').strip()
            if not assinatura_id:
                self._send_json(400, {'success': False, 'message': 'Numero da assinatura nao informado'})
                return
            sucesso, mensagem, _ = validar_assinatura_wc(assinatura_id)
            if sucesso:
                # Remover sessões anteriores da mesma assinatura para permitir login único por assinatura
                tokens_para_remover = [t for t, d in sessoes_validas.items() if d.get('assinatura_id') == assinatura_id]
                for t in tokens_para_remover:
                    del sessoes_validas[t]

                token = gerar_token(assinatura_id)
                sessoes_validas[token] = {
                    'assinatura_id': assinatura_id,
                    'created_at': time.time(),
                    'expires_at': time.time() + (24 * 60 * 60)
                }
                self._send_json(200, {
                    'success': True,
                    'message': mensagem,
                    'token': token,
                    'assinatura_id': assinatura_id
                })
            else:
                self._send_json(401, {'success': False, 'message': mensagem})
        except Exception as e:
            self._send_json(500, {'success': False, 'message': f'Erro: {str(e)}'})

    def _handle_check_auth(self):
        token = self.headers.get('Authorization', '').replace('Bearer ', '')
        if not token or token not in sessoes_validas:
            self._send_json(401, {'authenticated': False, 'message': 'Token invalido'})
            return
        sessao = sessoes_validas[token]
        if time.time() > sessao['expires_at']:
            del sessoes_validas[token]
            self._send_json(401, {'authenticated': False, 'message': 'Sessao expirada'})
            return
        self._send_json(200, {
            'authenticated': True,
            'assinatura_id': sessao['assinatura_id']
        })

    def _handle_machine_id(self):
        machine_id = gerar_machine_id_windows()
        if machine_id:
            self._send_json(200, {'machine_id': machine_id})
        else:
            self._send_json(500, {'error': 'Erro ao gerar Machine ID do hardware.'})

    def _handle_post_sinal_local(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            sinal_data = json.loads(body)
            if not sinal_data.get('id'):
                sinal_data['id'] = str(uuid.uuid4())
            now_iso = datetime.utcnow().isoformat() + "Z"
            sinal_data['created_at'] = sinal_data.get('created_at') or now_iso
            sinal_data['timestamp'] = sinal_data.get('timestamp') or now_iso
            if not sinal_data.get('status'):
                sinal_data['status'] = 'Em Andamento'
            
            sinais_locais_queue.append(sinal_data)
            if len(sinais_locais_queue) > 100:
                sinais_locais_queue.pop(0)
            
            print(f"[CONECTOR LOCALHOST] ⚡ Sinal registrado com sucesso! ID: {sinal_data['id']} | {sinal_data.get('side', '').upper()} {sinal_data.get('symbol', '')} | Entry: {sinal_data.get('entry_price', 0)} | Status: {sinal_data['status']}")
            self._send_json(200, {'success': True, 'signal_id': sinal_data['id'], 'signal': sinal_data, 'message': 'Sinal local registrado com sucesso'})
        except Exception as e:
            self._send_json(500, {'error': f'Erro ao registrar sinal local: {str(e)}'})

    def _handle_post_sinal_local_status(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            data = json.loads(body)
            sig_id = data.get('id')
            new_status = data.get('status', 'Encerrado')
            exit_price = data.get('exit_price')
            closed_at = data.get('closed_at') or (datetime.utcnow().isoformat() + "Z")

            found = False
            for s in reversed(sinais_locais_queue):
                if sig_id and s.get('id') == sig_id:
                    s['status'] = new_status
                    if exit_price is not None:
                        s['exit_price'] = exit_price
                    s['closed_at'] = closed_at
                    found = True
                    break
            
            if not found and sinais_locais_queue:
                # Se não especificou ID ou não achou, atualiza o último que estava Em Andamento
                for s in reversed(sinais_locais_queue):
                    if s.get('status') == 'Em Andamento':
                        s['status'] = new_status
                        if exit_price is not None:
                            s['exit_price'] = exit_price
                        s['closed_at'] = closed_at
                        found = True
                        break

            print(f"[CONECTOR LOCALHOST] 🛑 Status atualizado localmente para '{new_status}' (ID: {sig_id})")
            self._send_json(200, {'success': True, 'updated': found, 'status': new_status})
        except Exception as e:
            self._send_json(500, {'error': f'Erro ao atualizar status local: {str(e)}'})

    def _handle_post_sinal_local_levels(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            data = json.loads(body)
            sig_id = data.get('id')
            sl = data.get('stop_loss')
            tp = data.get('take_profit')

            found = False
            for s in reversed(sinais_locais_queue):
                if sig_id and s.get('id') == sig_id:
                    if sl is not None:
                        s['stop_loss'] = sl
                    if tp is not None:
                        s['take_profit'] = tp
                    found = True
                    break
            
            if not found and sinais_locais_queue:
                for s in reversed(sinais_locais_queue):
                    if s.get('status') == 'Em Andamento':
                        if sl is not None:
                            s['stop_loss'] = sl
                        if tp is not None:
                            s['take_profit'] = tp
                        found = True
                        break

            print(f"[CONECTOR LOCALHOST] 🔄 Níveis atualizados localmente (ID: {sig_id}) -> SL: {sl} | TP: {tp}")
            self._send_json(200, {'success': True, 'updated': found, 'stop_loss': sl, 'take_profit': tp})
        except Exception as e:
            self._send_json(500, {'error': f'Erro ao atualizar níveis locais: {str(e)}'})

    def _handle_get_sinal_local(self):
        try:
            from urllib.parse import urlparse, parse_qs
            parsed_url = urlparse(self.path)
            query_params = parse_qs(parsed_url.query)
            
            account_id = query_params.get('account_id', [''])[0].strip()
            strategy_id = query_params.get('strategy_id', [''])[0].strip()
            sig_id = query_params.get('id', [''])[0].strip()
            req_status = query_params.get('status', [''])[0].strip()

            # 1. Se pediu por ID específico (Fase 2: Monitoramento em posição)
            if sig_id:
                for s in reversed(sinais_locais_queue):
                    if s.get('id') and str(s.get('id')).strip() == sig_id:
                        self._send_json(200, [s])
                        return
                self._send_json(200, [])
                return

            # 2. Se pediu novo sinal (Fase 1: Sem posição / Em Andamento)
            sinais_filtrados = []
            acc_clean = account_id.lower()
            strat_clean = strategy_id.lower()

            for s in reversed(sinais_locais_queue):
                s_acc_id = str(s.get('account_id') or '').strip().lower()
                s_acc_name = str(s.get('account_name') or '').strip().lower()
                s_panel_id = str(s.get('panel_id') or '').strip().lower()
                s_instance_id = str(s.get('instance_id') or '').strip().lower()

                # Filtro por conta (aceita UUID, nome da conta, panel_id ou instance_id)
                if acc_clean:
                    match_acc = (acc_clean == s_acc_id or acc_clean == s_acc_name or acc_clean == s_panel_id or acc_clean == s_instance_id)
                    # Se o sinal não tem account_id especificado ou não bateu, ignora
                    if s_acc_id and not match_acc:
                        continue

                # Filtro por estratégia (aceita ID da estratégia ou Nome)
                if strat_clean:
                    s_strat_id = str(s.get('strategy_id') or '').strip().lower()
                    s_strat_name = str(s.get('strategy_name') or '').strip().lower()
                    match_strat = (strat_clean == s_strat_id or strat_clean == s_strat_name)
                    if s_strat_id and not match_strat:
                        continue

                if req_status:
                    s_status = str(s.get('status') or '').strip().lower()
                    if s_status and s_status != req_status.lower():
                        continue

                sinais_filtrados.append(s)

            # Retorna lista compatível com formato de array REST do Supabase
            self._send_json(200, sinais_filtrados)
        except Exception as e:
            self._send_json(500, {'error': f'Erro ao ler sinais locais: {str(e)}'})

def consultar_supabase_api(endpoint):
    supabase_url = os.environ.get('VITE_SUPABASE_URL', 'https://db.vemviraramesa.com.br')
    supabase_key = os.environ.get('VITE_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY')
    
    env_path = os.path.join(os.path.abspath("."), ".env")
    if os.path.exists(env_path):
        try:
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        if k.strip() == 'VITE_SUPABASE_URL':
                            supabase_url = v.strip()
                        elif k.strip() == 'VITE_SUPABASE_ANON_KEY':
                            supabase_key = v.strip()
        except Exception:
            pass

    url = f"{supabase_url.rstrip('/')}/rest/v1/{endpoint}"
    req = urllib.request.Request(url)
    req.add_header('apikey', supabase_key)
    req.add_header('Authorization', f'Bearer {supabase_key}')
    req.add_header('Content-Type', 'application/json')
    
    with urllib.request.urlopen(req, timeout=5) as resp:
        content = resp.read().decode('utf-8')
        return json.loads(content)

def chamar_llm_python(provider, api_key, model, prompt_text):
    if not provider or not api_key:
        raise ValueError("Provedor ou Chave API ausente.")

    if provider == 'groq':
        url = "https://api.groq.com/openai/v1/chat/completions"
        payload = json.dumps({
            "model": model or "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": "Você é um analisador técnico de mercado que responde estritamente em formato JSON."},
                {"role": "user", "content": prompt_text}
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }).encode('utf-8')
        req = urllib.request.Request(url, data=payload, method='POST')
        req.add_header('Content-Type', 'application/json')
        req.add_header('Authorization', f'Bearer {api_key}')
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data['choices'][0]['message']['content']
    elif provider == 'openai':
        url = "https://api.openai.com/v1/chat/completions"
        payload = json.dumps({
            "model": model or "gpt-4o-mini",
            "messages": [{"role": "user", "content": prompt_text}],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }).encode('utf-8')
        req = urllib.request.Request(url, data=payload, method='POST')
        req.add_header('Content-Type', 'application/json')
        req.add_header('Authorization', f'Bearer {api_key}')
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data['choices'][0]['message']['content']
    elif provider == 'gemini':
        model_name = model or "gemini-1.5-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        payload = json.dumps({
            "contents": [{"role": "user", "parts": [{"text": prompt_text}]}]
        }).encode('utf-8')
        req = urllib.request.Request(url, data=payload, method='POST')
        req.add_header('Content-Type', 'application/json')
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data['candidates'][0]['content']['parts'][0]['text']
    else:
        raise ValueError(f"Provedor desconhecido: {provider}")

def executar_inferencia_realtime_prompt(prompt_id, direction):
    prompts = consultar_supabase_api(f"painelvm_prompts?id=eq.{prompt_id}")
    if not prompts or len(prompts) == 0:
        return None
    prompt_obj = prompts[0]

    panel_id = prompt_obj.get('panel_id')
    settings_list = []
    if panel_id:
        settings_list = consultar_supabase_api(f"painelvm_settings?panel_id=eq.{panel_id}")
    if not settings_list:
        settings_list = consultar_supabase_api("painelvm_settings?limit=1")
    
    if not settings_list or len(settings_list) == 0:
        return None
    setts = settings_list[0]

    provider = setts.get('ai_provider', 'groq')
    api_key = setts.get('groq_api_key') if provider == 'groq' else (setts.get('gemini_api_key') if provider == 'gemini' else setts.get('openai_api_key'))
    model = setts.get('groq_model') if provider == 'groq' else (setts.get('gemini_model') if provider == 'gemini' else setts.get('openai_model'))

    if not api_key:
        return None

    market_list = consultar_supabase_api("market_data?order=id.desc&limit=1")
    market_data = market_list[0] if market_list and len(market_list) > 0 else {}

    gamma_list = consultar_supabase_api("gamma_levels?order=id.desc&limit=1")
    gamma_data = gamma_list[0] if gamma_list and len(gamma_list) > 0 else {}

    dir_label = "COMPRA" if direction == 1 else "VENDA"

    prompt_text = f"""Você é o VM Mentor, uma IA especialista em mercado financeiro (Order Flow e Opções).
Sua tarefa é analisar o contexto do mercado em tempo real e decidir se APROVA a operação de {dir_label}.

ESTRATÉGIA DO PROMPT:
- Nome: {prompt_obj.get('name', 'Filtro de Contexto')}
- Descrição: {prompt_obj.get('description', '')}
- Confluências Exigidas: {prompt_obj.get('confluences', '')}
- Gatilho de Entrada: {prompt_obj.get('trigger_entry', '')}

DADOS ATUAIS DE MERCADO:
- Ativo: {market_data.get('symbol', 'NQ')}
- Preço Atual: {market_data.get('price', '--')}
- Z-Score: {market_data.get('zscore', 0)}
- ATR Ratio: {market_data.get('atr_ratio', 0)}
- Sentimento / Delta %: {market_data.get('delta_pct', 50)}%
- Delta Acumulado: {market_data.get('delta', 0)}
- Gamma Bias: {gamma_data.get('gamma_bias', 'NEUTRO')} (Score: {gamma_data.get('bias_score', 0)})
- HVL: {gamma_data.get('hvl', '--')}, Call Wall: {gamma_data.get('call_resistance', '--')}, Put Wall: {gamma_data.get('put_support', '--')}

DIREÇÃO SOLICITADA PARA VALIDAÇÃO: {dir_label}

Responda ESTRITAMENTE em formato JSON puro sem tags markdown:
{{
  "sinal": "{dir_label}" ou "AGUARDANDO",
  "confianca_compra": <numero_entre_0_e_100>,
  "confianca_venda": <numero_entre_0_e_100>,
  "aprovado": true ou false,
  "resumo": "Breve justificativa técnica em português (máx 15 palavras)"
}}"""

    llm_resp_text = chamar_llm_python(provider, api_key, model, prompt_text)
    
    clean_json_str = llm_resp_text.strip()
    if clean_json_str.startswith("```"):
        lines = clean_json_str.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        clean_json_str = "\n".join(lines).strip()
    
    first_b = clean_json_str.find('{')
    last_b = clean_json_str.rfind('}')
    if first_b != -1 and last_b != -1:
        clean_json_str = clean_json_str[first_b:last_b+1]

    parsed = json.loads(clean_json_str)

    score_compra = int(parsed.get('confianca_compra', 85 if direction == 1 else 15))
    score_venda = int(parsed.get('confianca_venda', 85 if direction != 1 else 15))
    aprovado = bool(parsed.get('aprovado', True))
    resumo = str(parsed.get('resumo', 'Análise em tempo real concluída.'))

    return {
        'confianca_compra': score_compra,
        'confianca_venda': score_venda,
        'aprovado': aprovado,
        'resumo': resumo,
        'sinal': parsed.get('sinal', dir_label)
    }

    def _handle_analise_contexto(self):
        try:
            # Parse query params (strategy_id, prompt_id, direction)
            from urllib.parse import urlparse, parse_qs
            parsed_url = urlparse(self.path)
            query_params = parse_qs(parsed_url.query)
            
            strat_id = query_params.get('strategy_id', [''])[0]
            prompt_id = query_params.get('prompt_id', [''])[0]
            direction = int(query_params.get('direction', ['1'])[0])

            # Tentativa de inferência em tempo real via Supabase + LLM caso prompt_id seja informado
            if prompt_id:
                try:
                    realtime_res = executar_inferencia_realtime_prompt(prompt_id, direction)
                    if realtime_res:
                        res_score = realtime_res['confianca_compra'] if direction == 1 else realtime_res['confianca_venda']
                        res = {
                            'strategy_id': strat_id,
                            'prompt_id': prompt_id,
                            'direction': direction,
                            'confianca_compra': realtime_res['confianca_compra'],
                            'confianca_venda': realtime_res['confianca_venda'],
                            'confianca_pct': res_score,
                            'aprovado': realtime_res['aprovado'],
                            'resumo': realtime_res.get('resumo', 'Análise em tempo real concluída.'),
                            'realtime': True
                        }
                        self._send_json(200, res)
                        return
                except Exception as realtime_err:
                    print(f"[ERRO INFERENCIA TEMPO REAL] {realtime_err}")

            # Fallback local via sinal.json ou valores padrão
            score_compra = 85
            score_venda = 15

            if os.path.exists(JSON_PATH):
                with open(JSON_PATH, 'r', encoding='utf-8') as f:
                    try:
                        sdata = json.load(f)
                        if 'confianca_compra' in sdata:
                            score_compra = int(sdata['confianca_compra'])
                        elif 'confianca' in sdata:
                            try:
                                score_compra = int(str(sdata['confianca']).replace('%', '').strip())
                            except Exception:
                                pass
                        
                        if 'confianca_venda' in sdata:
                            score_venda = int(sdata['confianca_venda'])
                        else:
                            score_venda = 100 - score_compra
                    except Exception:
                        pass

            res_score = score_compra if direction == 1 else score_venda

            res = {
                'strategy_id': strat_id,
                'prompt_id': prompt_id,
                'direction': direction,
                'confianca_compra': score_compra,
                'confianca_venda': score_venda,
                'confianca_pct': res_score,
                'aprovado': res_score >= 50,
                'realtime': False
            }

            self._send_json(200, res)
        except Exception as e:
            self._send_json(500, {'error': str(e), 'confianca_compra': 85, 'confianca_venda': 85, 'confianca_pct': 85})

    def _handle_get_sinal(self):
        try:
            if os.path.exists(JSON_PATH):
                with open(JSON_PATH, 'r', encoding='utf-8') as f:
                    data = f.read()
                self.send_response(200)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(data.encode('utf-8'))
            else:
                self.send_response(404)
                self.end_headers()
        except Exception as e:
            self.send_response(500)
            self.end_headers()

    def _send_json(self, code, data):
        self.send_response(code)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def log_message(self, format, *args):
        pass

def iniciar_servidor_api_port80():
    try:
        server80 = HTTPServer(('0.0.0.0', 80), APIHandler)
        print("[SERVIDOR LOCAL] 🚀 Conector Local escutando na porta 80 (MetaTrader 4 WebRequest)")
        server80.serve_forever()
    except Exception as e:
        print(f"[SERVIDOR LOCAL] ℹ️ Porta 80 não vinculada diretamente (requer privilégios de Admin ou porta em uso): {e}")

def iniciar_servidor_api():
    # Inicia listener na porta 80 para MetaTrader 4
    threading.Thread(target=iniciar_servidor_api_port80, daemon=True).start()
    try:
        print(f"[SERVIDOR LOCAL] 🚀 Conector Local escutando na porta {PORT_API} (MT5, NinjaTrader, VMBot, ConectorVM)")
        server = HTTPServer(('0.0.0.0', PORT_API), APIHandler)
        server.serve_forever()
    except Exception as e:
        print(f"[ERRO API] {e}")

class NinjaPanelHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?')[0].split('#')[0]
        if path == '/' or path == '/index.html':
            self._serve_html()
            return
        self._serve_static_file(path)

    def _serve_html(self):
        try:
            html_path = resource_path(HTML_FILE)
            if os.path.exists(html_path):
                with open(html_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(content.encode('utf-8'))
            else:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b'<h1>404 - index.html not found. Run npm run build first.</h1>')
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f'Erro: {str(e)}'.encode('utf-8'))

    def _serve_static_file(self, path):
        filename = path.lstrip('/')
        if '..' in filename or filename.startswith('\\'):
            self.send_response(403)
            self.end_headers()
            return
        # Servir da pasta dist/ gerada pelo build do Vite
        file_path = os.path.join("dist", filename)
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            file_path = os.path.join(NINJA_PANEL_DIR, filename)
            
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            self.send_response(404)
            self.end_headers()
            return
        ext = os.path.splitext(filename)[1].lower()
        content_types = {
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.txt': 'text/plain',
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript'
        }
        content_type = content_types.get(ext, 'application/octet-stream')
        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_response(500)
            self.end_headers()

    def log_message(self, format, *args):
        pass

def iniciar_servidor_html():
    try:
        socketserver.TCPServer.allow_reuse_address = True
        httpd = socketserver.TCPServer(("0.0.0.0", PORT_HTML), NinjaPanelHandler)
        httpd.serve_forever()
    except Exception as e:
        print(f"[ERRO HTML] {e}")

def abrir_navegador():
    global _navegador_aberto
    if _navegador_aberto:
        return
    _navegador_aberto = True
    time.sleep(3)
    try:
        webbrowser.open(URL_PAINEL)
    except Exception as e:
        print(f"[ERRO] Ao abrir navegador: {e}")

_worker_process = None

def iniciar_background_worker():
    global _worker_process
    import subprocess
    try:
        CREATE_NO_WINDOW = 0x08000000 if os.name == 'nt' else 0
        script_path = os.path.join(os.path.abspath("."), "src", "backgroundWorker.js")
        _worker_process = subprocess.Popen(
            ['node', script_path],
            creationflags=CREATE_NO_WINDOW
        )
        print("[INFO] Background worker Node.js iniciado com sucesso.")
    except Exception as e:
        print(f"[ERRO WORKER] Erro ao iniciar background worker: {e}")

def encerrar_tudo():
    global _worker_process
    if _worker_process:
        try:
            _worker_process.terminate()
            _worker_process.wait(timeout=2)
        except:
            pass
    liberar_mutex()
    os._exit(0)

if __name__ == "__main__":
    if not criar_mutex():
        print("[ERRO] Vortex AI ja esta em execucao!")
        time.sleep(5)
        sys.exit(1)
    
    try:
        signal.signal(signal.SIGINT, lambda s, f: encerrar_tudo())
        signal.signal(signal.SIGTERM, lambda s, f: encerrar_tudo())
    except:
        pass
    
    # Thread 1: Servidor API
    thread_api = threading.Thread(target=iniciar_servidor_api, daemon=True)
    thread_api.start()
    time.sleep(1)
    
    # Thread 2: Servidor HTML
    thread_html = threading.Thread(target=iniciar_servidor_html, daemon=True)
    thread_html.start()
    time.sleep(1)
    
    # Thread 3: Revalidação de licenças
    thread_revalidacao = threading.Thread(target=rotina_revalidacao_silenciosa, daemon=True)
    thread_revalidacao.start()
    time.sleep(1)

    # Thread 4: Background Worker Node.js
    thread_worker = threading.Thread(target=iniciar_background_worker, daemon=True)
    thread_worker.start()
    time.sleep(1)
    
    abrir_navegador()
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        encerrar_tudo()
    finally:
        encerrar_tudo()
