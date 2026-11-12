"""
Gera os Playbooks Operacionais definitivos para NQ e ES em HTML e PDF com as novas matrizes quantitativas:
1. T0: Scalper Entrada Unica vs Parcial (71-74% Win) + Vies Noturno (Asia+Londres NQ vs Asia+T15 ES).
2. T5: Sweet Spot de Forca 60-64% (Pico em 62%) + Parcial de Alta Precisao (81.1% NQ / 83.6% ES).
3. OR15: Gestao Geometrica 25%, 35% e 50% do Range (Fade 35%/50% e Breakout c/ Pullback).
4. Horario de Inverno: Transicao em Novembro para 11:30 BRT (10:30 BRT no verao).
"""
import os, subprocess

print("Executando gerador dos playbooks enriquecidos...", flush=True)

# 1. Atualizar e rodar gerador NQ
subprocess.run(["python", "scripts/generate_playbook_pdf.py"], check=True)

# 2. Atualizar e rodar gerador ES
subprocess.run(["python", "scripts/generate_playbook_es_pdf.py"], check=True)

print("Playbooks gerados com sucesso!", flush=True)
