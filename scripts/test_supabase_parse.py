import urllib.request
import json

url = 'https://db.vemviraramesa.com.br/rest/v1/nasdaq_force?instance_id=eq.painel_principal_web&order=timestamp.desc&limit=5'
key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.YtBPvGJb6-WoLS70wxSXaKTg4TGQnMUcUTeD2p_2jBY'

req = urllib.request.Request(url, headers={'apikey': key, 'Authorization': f'Bearer {key}'})
with urllib.request.urlopen(req) as resp:
    raw_json = resp.read().decode('utf-8')

print("Raw JSON length:", len(raw_json))
print("Raw JSON preview:", raw_json[:200])

def extract_str(obj, key):
    pat = '"' + key + '":'
    idx = obj.lower().find(pat.lower())
    if idx < 0: return ""
    st = idx + len(pat)
    while st < len(obj) and (obj[st].isspace() or obj[st] == '"'): st += 1
    ed = st
    while ed < len(obj) and obj[ed] not in ['"', ',', '}']: ed += 1
    return obj[st:ed].strip() if ed > st else ""

def extract_double(obj, key, fallback=50.0):
    s = extract_str(obj, key)
    if not s: return fallback
    try:
        return float(s.replace(',', '.'))
    except:
        return fallback

items = json.loads(raw_json)
print("Parsed with Python json:", len(items))
for it in items:
    s_it = json.dumps(it)
    ff = extract_double(s_it, "forca_final_compra")
    nq = extract_double(s_it, "nasdaq_compra")
    ts = extract_str(s_it, "timestamp")
    print(f"Item -> ts: {ts} | forca_final_compra: {ff}% | nq: {nq}%")
