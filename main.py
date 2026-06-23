import sys
import os
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
            produto_ok = any(item.get('product_id') == COD_PRODUTO for item in line_items)
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

def iniciar_servidor_api():
    try:
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

def encerrar_tudo():
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
    
    abrir_navegador()
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        encerrar_tudo()
    finally:
        encerrar_tudo()
