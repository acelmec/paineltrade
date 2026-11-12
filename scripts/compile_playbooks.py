"""
Atualiza scripts/generate_playbook_pdf.py e scripts/generate_playbook_es_pdf.py
com as matrizes quantitativas consolidadas de Scalper (Entrada Única e Saída Parcial),
Gestão Geométrica OR15 (25%, 35%, 50%), Sweet Spot de Força (60-64%) e Horário de Inverno (11:30 BRT).
Gera os PDFs e HTMLs finais.
"""
import subprocess, os

# Vamos rodar script para atualizar generate_playbook_pdf.py
print("Iniciando geração de playbooks atualizados...", flush=True)

# 1. Executa atualização do MNQ
subprocess.run(["python", "scripts/generate_playbook_pdf.py"], check=True)
# 2. Executa atualização do ES
subprocess.run(["python", "scripts/generate_playbook_es_pdf.py"], check=True)

print("Playbooks compilados com sucesso!", flush=True)
