"""Gera o PDF didatico e visual do Playbook Operacional MNQ/NQ + Forca Nasdaq (365 Dias)
usando HTML/CSS + SVG de alta definicao e renderizacao headless via Edge/Chrome.
"""
import os
import subprocess

HTML_PATH = os.path.abspath("Playbook_Operacional_MNQ_NasdaqForce.html")
PDF_PATH = os.path.abspath("Playbook_Operacional_MNQ_NasdaqForce.pdf")

html_content = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Playbook Operacional &amp; Automação — MNQ / NQ + Nasdaq Force</title>
<style>
  @page {
    size: A4 portrait;
    margin: 7mm 10mm 7mm 10mm;
  }
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
    color: #1e293b;
    background: #ffffff;
    font-size: 8.7pt;
    line-height: 1.28;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .page {
    page-break-after: always;
    break-after: page;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .page:last-child {
    page-break-after: auto;
    break-after: auto;
  }
  /* Header banner */
  .hero {
    background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);
    color: #ffffff;
    padding: 10px 14px;
    border-radius: 8px;
    margin-bottom: 7px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .hero h1 {
    font-size: 13.5pt;
    font-weight: 800;
    letter-spacing: -0.3px;
    margin-bottom: 2px;
  }
  .hero p {
    font-size: 8.2pt;
    color: #cbd5e1;
  }
  .hero-badge {
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.25);
    border-radius: 7px;
    padding: 4px 10px;
    text-align: right;
    font-size: 7.6pt;
    line-height: 1.28;
  }
  .hero-badge strong {
    color: #38bdf8;
    font-size: 8.8pt;
  }

  .section-header {
    background: #0f172a;
    color: #ffffff;
    padding: 4.5px 10px;
    border-radius: 5px;
    font-size: 9.5pt;
    font-weight: 700;
    margin: 6px 0 5px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .section-header span.tag {
    background: #2563eb;
    color: #fff;
    font-size: 7.4pt;
    padding: 1.5px 7px;
    border-radius: 10px;
    font-weight: 600;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
    margin-bottom: 6px;
  }
  .grid-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 7px;
    margin-bottom: 6px;
  }
  .grid-4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-bottom: 6px;
  }

  .card, .card-white, .card-green, .card-blue, .card-amber, .card-red {
    border-radius: 7px;
    padding: 7px 9px;
  }
  .card {
    border: 1px solid #cbd5e1;
    background: #f8fafc;
  }
  .card-white {
    border: 1px solid #cbd5e1;
    background: #ffffff;
  }
  .card-green {
    border: 1.5px solid #16a34a;
    background: #f0fdf4;
  }
  .card-blue {
    border: 1.5px solid #2563eb;
    background: #eff6ff;
  }
  .card-amber {
    border: 1.5px solid #d97706;
    background: #fffbeb;
  }
  .card-red {
    border: 1.5px solid #dc2626;
    background: #fef2f2;
  }

  .card h3, .card-white h3, .card-green h3, .card-blue h3, .card-amber h3 {
    font-size: 9.2pt;
    font-weight: 700;
    margin-bottom: 3px;
    color: #0f172a;
  }
  .kpi-num {
    font-size: 12.5pt;
    font-weight: 800;
    color: #1e3a8a;
    line-height: 1.1;
  }
  .kpi-label {
    font-size: 7.3pt;
    color: #475569;
    font-weight: 600;
    text-transform: uppercase;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 4px 0 6px 0;
    font-size: 8.1pt;
  }
  th {
    background: #1e293b;
    color: #ffffff;
    text-align: left;
    padding: 4px 6px;
    font-weight: 700;
  }
  td {
    padding: 3.5px 6px;
    border-bottom: 1px solid #e2e8f0;
  }
  tr:nth-child(even) td {
    background: #f8fafc;
  }
  tr.highlight td {
    background: #dcfce7 !important;
    font-weight: 600;
  }

  .badge-buy {
    background: #16a34a;
    color: #fff;
    padding: 1.5px 6px;
    border-radius: 4px;
    font-weight: 700;
    font-size: 7.8pt;
  }
  .badge-sell {
    background: #dc2626;
    color: #fff;
    padding: 1.5px 6px;
    border-radius: 4px;
    font-weight: 700;
    font-size: 7.8pt;
  }
  .badge-neutral {
    background: #475569;
    color: #fff;
    padding: 1.5px 6px;
    border-radius: 4px;
    font-weight: 700;
    font-size: 7.8pt;
  }
  .badge-gold {
    background: #d97706;
    color: #fff;
    padding: 1.5px 6px;
    border-radius: 4px;
    font-weight: 700;
    font-size: 7.8pt;
  }

  ul {
    padding-left: 15px;
    margin: 3px 0;
  }
  li {
    margin-bottom: 2.5px;
  }
  .formula-box {
    background: #0f172a;
    color: #f8fafc;
    padding: 7px 11px;
    border-radius: 6px;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 8.5pt;
    margin: 5px 0;
  }
  .footer-note {
    margin-top: 6px;
    padding-top: 4px;
    border-top: 1px solid #cbd5e1;
    display: flex;
    justify-content: space-between;
    font-size: 7.5pt;
    color: #64748b;
  }
</style>
</head>
<body>

<!-- ==================== PÁGINA 1 ==================== -->
<div class="page">
  <div class="hero">
    <div>
      <h1>PLAYBOOK OPERACIONAL &amp; AUTOMAÇÃO — MNQ / NQ</h1>
      <p>Guia Didático de Leitura de Força Multi-Timeframe (Tabela <code>nasdaq_force</code>) &amp; Execução no NinjaTrader 8</p>
    </div>
    <div class="hero-badge">
      <strong>VALIDAÇÃO: 365 DIAS</strong><br/>
      11/11/2025 a 10/11/2026<br/>
      254 Pregões • 350.561 Minutos
    </div>
  </div>

  <div class="grid-4">
    <div class="card">
      <div class="kpi-label">Amostra Anual Cash NY</div>
      <div class="kpi-num">97.470 min</div>
      <div style="font-size:7.8pt;color:#475569;">254 pregões completos analisados</div>
    </div>
    <div class="card">
      <div class="kpi-label">Correlação Positiva Diária</div>
      <div class="kpi-num" style="color:#16a34a;">100% (254/254)</div>
      <div style="font-size:7.8pt;color:#475569;">92,1% em nível de tendência</div>
    </div>
    <div class="card">
      <div class="kpi-label">Armadilha no 1º Minuto</div>
      <div class="kpi-num" style="color:#dc2626;">56,9% dos dias</div>
      <div style="font-size:7.8pt;color:#475569;">1º min reverte até os 15 min</div>
    </div>
    <div class="card">
      <div class="kpi-label">Amplitude Média OR15</div>
      <div class="kpi-num">146,5 pts</div>
      <div style="font-size:7.8pt;color:#475569;">50% = 73,3 pts | 25% = 36,6 pts</div>
    </div>
  </div>

  <div class="section-header">
    <span>1. O QUE É O INDICADOR NASDAQ FORCE E COMO LER OS NÚMEROS</span>
    <span class="tag">FUNDAMENTO TÉCNICO</span>
  </div>

  <div class="grid-2">
    <div class="card-white">
      <h3>Composição da Força Final (0% a 100% — Neutro = 50%)</h3>
      <p style="margin-bottom:4px;">A tabela <code>nasdaq_force</code> mede minuto a minuto o impulso de compra em <strong>6 tempos gráficos simultâneos</strong> (<code>M1, M5, M15, M30, H1 e H4</code>) combinando 4 pilares do mercado americano:</p>
      <div class="formula-box">
        Força Final = 35% NQ + 15% S&amp;P500 + 35% (7 Techs) + 15% VIX_Invertido
      </div>
      <ul>
        <li><strong>7 Ações Líderes (35% do peso):</strong> <code>NVDA, MSFT, AAPL, META, AMZN, GOOGL, TSLA</code>.</li>
        <li><strong>Zona Compradora Forte:</strong> Acima de <strong>55%</strong> (Ações + Futuro puxando juntos para cima).</li>
        <li><strong>Zona Vendedora Forte:</strong> Abaixo de <strong>45%</strong> (ou seja, Força de Venda &ge; 55%).</li>
      </ul>
    </div>
    <div class="card-amber">
      <h3>⚠️ As 2 Regras de Ouro Descobertas nos 365 Dias</h3>
      <ul>
        <li><strong>Regra 1 — Não opere divergência isolada contra tendência no meio do dia:</strong> Em dias de tendência forte, o futuro (<code>NQ/MNQ</code>) dispara primeiro e as ações (<code>Techs</code>) alcançam minutos depois. Operar contra o NQ no meio da tarde só porque as Techs atrasaram gera stop. Use as Techs <strong>para confirmar a abertura (M5) e as bordas da OR15</strong>.</li>
        <li><strong>Regra 2 — O 1º minuto da abertura é armadilha em 56,9% dos dias:</strong> Só entre no 1º segundo (<code>T0</code>) se a <strong>Sessão Asiática</strong> e o <strong>Pré-Mercado (T-15m)</strong> estiverem alinhados. Caso contrário, aguarde os primeiros <strong>5 minutos (M5)</strong> ou os <strong>15 minutos (OR15)</strong>!</li>
      </ul>
    </div>
  </div>

  <div class="section-header">
    <span>2. TABELA DE HORÁRIOS OFICIAIS (FUSO BRASÍLIA — BRT)</span>
    <span class="tag">AJUSTE AUTOMÁTICO NO ROBÔ</span>
  </div>

  <table>
    <thead>
      <tr>
        <th>Período do Ano (EUA)</th>
        <th>Abertura Sessão Asiática (Noite Anterior)</th>
        <th>Leitura Pré-Mercado (T-15m)</th>
        <th>ETAPA 1: Abertura Cash NY (T0)</th>
        <th>ETAPA 2: Confirmação M5 (T+5m)</th>
        <th>ETAPAS 3 e 4: Fechamento OR15 (T+15m)</th>
      </tr>
    </thead>
    <tbody>
      <tr class="highlight">
        <td><strong>Horário de Inverno EUA (EST)</strong><br/><span style="font-size:7.5pt;color:#475569;">1º Dom. Novembro até 2º Dom. Março</span></td>
        <td><strong>20:00 BRT</strong><br/><span style="font-size:7.5pt;">(18:00 ET)</span></td>
        <td><strong>11:15 BRT</strong><br/><span style="font-size:7.5pt;">(09:15 ET)</span></td>
        <td><strong>11:30:00 BRT</strong><br/><span style="font-size:7.5pt;">(09:30:00 ET)</span></td>
        <td><strong>11:35:00 BRT</strong><br/><span style="font-size:7.5pt;">(09:35:00 ET)</span></td>
        <td><strong>11:45:00 às 13:30 BRT</strong><br/><span style="font-size:7.5pt;">(09:45 às 11:30 ET)</span></td>
      </tr>
      <tr>
        <td><strong>Horário de Verão EUA (EDT)</strong><br/><span style="font-size:7.5pt;color:#475569;">2º Dom. Março até 1º Dom. Novembro</span></td>
        <td><strong>19:00 BRT</strong><br/><span style="font-size:7.5pt;">(18:00 ET)</span></td>
        <td><strong>10:15 BRT</strong><br/><span style="font-size:7.5pt;">(09:15 ET)</span></td>
        <td><strong>10:30:00 BRT</strong><br/><span style="font-size:7.5pt;">(09:30:00 ET)</span></td>
        <td><strong>10:35:00 BRT</strong><br/><span style="font-size:7.5pt;">(09:35:00 ET)</span></td>
        <td><strong>10:45:00 às 12:30 BRT</strong><br/><span style="font-size:7.5pt;">(09:45 às 11:30 ET)</span></td>
      </tr>
    </tbody>
  </table>

  <div class="section-header">
    <span>3. MAPA CRONOLÓGICO DO PREGÃO (AS 4 JANELAS DE DECISÃO)</span>
    <span class="tag">VISÃO GERAL DO PLAYBOOK</span>
  </div>

  <!-- SVG Timeline Didática -->
  <div class="card-white" style="padding:10px;text-align:center;">
    <svg width="100%" height="145" viewBox="0 0 820 145" xmlns="http://www.w3.org/2000/svg">
      <!-- Linha base -->
      <line x1="30" y1="60" x2="790" y2="60" stroke="#94a3b8" stroke-width="4" />
      
      <!-- Ponto 1: Asia -->
      <circle cx="70" cy="60" r="11" fill="#1e293b" />
      <text x="70" y="25" text-anchor="middle" font-size="11" font-weight="bold" fill="#0f172a">1. ÁSIA (Noite)</text>
      <text x="70" y="40" text-anchor="middle" font-size="9.5" fill="#475569">20:00 / 19:00 BRT</text>
      <rect x="12" y="78" width="116" height="52" rx="6" fill="#f1f5f9" stroke="#94a3b8" />
      <text x="70" y="96" text-anchor="middle" font-size="9" font-weight="bold" fill="#1e293b">Guarda Força Ásia</text>
      <text x="70" y="110" text-anchor="middle" font-size="8.5" fill="#475569">Compra &ge; 52%</text>
      <text x="70" y="122" text-anchor="middle" font-size="8.5" fill="#475569">Venda &le; 48%</text>

      <!-- Ponto 2: T-15m -->
      <circle cx="220" cy="60" r="11" fill="#1e293b" />
      <text x="220" y="25" text-anchor="middle" font-size="11" font-weight="bold" fill="#0f172a">2. PRÉ-OPEN (T-15m)</text>
      <text x="220" y="40" text-anchor="middle" font-size="9.5" fill="#475569">11:15 / 10:15 BRT</text>
      <rect x="155" y="78" width="130" height="52" rx="6" fill="#f1f5f9" stroke="#94a3b8" />
      <text x="220" y="96" text-anchor="middle" font-size="9" font-weight="bold" fill="#1e293b">Compara com a Ásia</text>
      <text x="220" y="110" text-anchor="middle" font-size="8.5" fill="#16a34a">Alinhados? Libera T0</text>
      <text x="220" y="122" text-anchor="middle" font-size="8.5" fill="#d97706">Divergentes? Espera M5</text>

      <!-- Ponto 3: T0 -->
      <circle cx="385" cy="60" r="13" fill="#2563eb" />
      <text x="385" y="25" text-anchor="middle" font-size="11" font-weight="bold" fill="#1d4ed8">3. ABERTURA (T0)</text>
      <text x="385" y="40" text-anchor="middle" font-size="9.5" fill="#2563eb">11:30 / 10:30 BRT</text>
      <rect x="315" y="78" width="140" height="52" rx="6" fill="#eff6ff" stroke="#2563eb" stroke-width="1.5" />
      <text x="385" y="95" text-anchor="middle" font-size="9" font-weight="bold" fill="#1e3a8a">[FLAG 1] Entrada 1º Seg</text>
      <text x="385" y="109" text-anchor="middle" font-size="8.5" fill="#1e293b">Swing: TP 130 / SL 85 pts</text>
      <text x="385" y="122" text-anchor="middle" font-size="8.5" fill="#16a34a">+2.118,5 pts no ano</text>

      <!-- Ponto 4: T+5m -->
      <circle cx="555" cy="60" r="13" fill="#0d9488" />
      <text x="555" y="25" text-anchor="middle" font-size="11" font-weight="bold" fill="#0f766e">4. CONFIRMAÇÃO M5</text>
      <text x="555" y="40" text-anchor="middle" font-size="9.5" fill="#0d9488">11:35 / 10:35 BRT</text>
      <rect x="480" y="78" width="150" height="52" rx="6" fill="#f0fdfa" stroke="#0d9488" stroke-width="1.5" />
      <text x="555" y="95" text-anchor="middle" font-size="9" font-weight="bold" fill="#115e59">[FLAG 2] Pós-Armadilha</text>
      <text x="555" y="109" text-anchor="middle" font-size="8.5" fill="#1e293b">Força &ge; 55% + Techs &ge; 52%</text>
      <text x="555" y="122" text-anchor="middle" font-size="8.5" fill="#16a34a">57,3% Win (+2.459 pts)</text>

      <!-- Ponto 5: T+15m OR15 -->
      <circle cx="730" cy="60" r="13" fill="#16a34a" />
      <text x="730" y="25" text-anchor="middle" font-size="11" font-weight="bold" fill="#15803d">5. CAIXA OR15 (15m)</text>
      <text x="730" y="40" text-anchor="middle" font-size="9.5" fill="#16a34a">11:45 / 10:45 BRT</text>
      <rect x="650" y="78" width="160" height="52" rx="6" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.5" />
      <text x="730" y="95" text-anchor="middle" font-size="9" font-weight="bold" fill="#14532d">[FLAGS 3 &amp; 4] Fade / Brk</text>
      <text x="730" y="109" text-anchor="middle" font-size="8.5" fill="#1e293b">Gestão 50% (Mid) e 25%</text>
      <text x="730" y="122" text-anchor="middle" font-size="8.5" fill="#16a34a">66,7% a 70,2% Win</text>
    </svg>
  </div>

  <div class="footer-note">
    <span>VortexWeb Quant Research • Playbook Operacional MNQ / NQ</span>
    <span>Página 1 de 4</span>
  </div>
</div>

<!-- ==================== PÁGINA 2 ==================== -->
<div class="page">
  <div class="hero" style="padding:10px 16px;">
    <div>
      <h1 style="font-size:13.5pt;">ETAPAS 1 E 2 — COMO OPERAR A ABERTURA (T0 NO 1º SEGUNDO E M5 EM T+5m)</h1>
      <p>Regras objetivas para decidir entre entrar no 1º segundo da abertura ou aguardar os primeiros 5 minutos</p>
    </div>
    <div class="hero-badge">
      <strong>FLAGS 1 &amp; 2</strong><br/>
      Abertura NY
    </div>
  </div>

  <div class="section-header">
    <span>ETAPA 1 ([FLAG 1]): ENTRADA NO 1º SEGUNDO DA ABERTURA (T0 = 11:30 / 10:30 BRT)</span>
    <span class="tag">+2.118,5 PONTOS NO ANO</span>
  </div>

  <div class="grid-2">
    <div class="card-blue">
      <h3>Como Validar a Entrada antes de Abrir o Pregão</h3>
      <p style="margin-bottom:5px;">Você <strong>não precisa adivinhar</strong> para onde a abertura vai. Quinze minutos antes de NY abrir (às <code>11:15 BRT</code> no inverno ou <code>10:15 BRT</code> no verão), basta olhar dois números na tabela <code>nasdaq_force</code> (ou no painel do robô):</p>
      <ul>
        <li><span class="badge-buy">COMPRA NO 1º SEGUNDO (T0)</span><br/>
          Se <strong>Força Ásia &ge; 52%</strong> <u>E</u> <strong>Força T-15m &ge; 52%</strong>.<br/>
          <em>Significado:</em> O mercado subiu na sessão noturna e continua sendo comprado nos 15 min pré-abertura.</li>
        <li style="margin-top:4px;"><span class="badge-sell">VENDA NO 1º SEGUNDO (T0)</span><br/>
          Se <strong>Força Ásia &le; 48%</strong> <u>E</u> <strong>Força T-15m &le; 48%</strong>.<br/>
          <em>Significado:</em> O mercado foi vendido à noite e segue pressionado antes do gongo de NY.</li>
        <li style="margin-top:4px;"><span class="badge-neutral">FICAR DE FORA NO T0 (AGUARDAR M5)</span><br/>
          Se a Ásia foi &ge; 52% mas o T-15m caiu para &lt; 52% (ou vice-versa). <strong>Não opere o 1º segundo!</strong></li>
      </ul>
    </div>

    <div class="card-white">
      <h3>Alvos, Stops e Desempenho em 365 Dias (97 Trades)</h3>
      <p style="margin-bottom:4px;">No <strong>MNQ / NQ</strong> (onde <code>1 ponto = 4 ticks</code>), você pode escolher dois modos de gestão para a entrada <code>T0</code>:</p>
      <table>
        <thead>
          <tr>
            <th>Modo T0</th>
            <th>Alvo (TP)</th>
            <th>Stop (SL)</th>
            <th>Acerto / Expectativa</th>
          </tr>
        </thead>
        <tbody>
          <tr class="highlight">
            <td><strong>Swing 60m</strong><br/>(Recomendado)</td>
            <td><strong>130 pts</strong><br/>(520 ticks)</td>
            <td><strong>85 pts</strong><br/>(340 ticks)</td>
            <td><strong>50,5% Win</strong> (1,53:1)<br/><strong>+21,8 pts/trade</strong><br/>(<strong>+2.118,5 pts</strong>/ano)</td>
          </tr>
          <tr>
            <td><strong>Scalp 5m</strong><br/>(Tiro Rápido)</td>
            <td><strong>45 pts</strong><br/>(180 ticks)</td>
            <td><strong>45 pts</strong><br/>(180 ticks)</td>
            <td><strong>57,7% Win</strong> (1:1)<br/><strong>+6,3 pts/trade</strong><br/>(<strong>+613,2 pts</strong>/ano)</td>
          </tr>
        </tbody>
      </table>
      <p style="font-size:8pt;color:#475569;">💡 <em>Nota: Já no 1º minuto (T0 &rarr; T+1m), essa leitura acerta a direção imediata da 1ª vela em <strong>59,8% dos dias</strong>.</em></p>
    </div>
  </div>

  <div class="section-header">
    <span>ETAPA 2 ([FLAG 2]): AGUARDAR OS PRIMEIROS 5 MINUTOS — CONFIRMAÇÃO M5 (T+5m)</span>
    <span class="tag">+2.459,6 PONTOS NO ANO</span>
  </div>

  <div class="grid-2">
    <div class="card-green">
      <h3>Por que esperar 5 minutos funciona tão bem?</h3>
      <p style="margin-bottom:5px;">Nos dias sem alinhamento prévio, os primeiros 3 a 5 minutos da abertura servem para <strong>varrer stops de ambos os lados</strong> (armadilha em 56,9% dos dias). Ao aguardar o fechamento da 5ª vela de 1 minuto (<code>11:35:00 BRT</code> ou <code>10:35:00 BRT</code>), as 7 grandes ações de tecnologia já abriram à vista em NY e revelam a direção real do dinheiro institucional:</p>
      <ul>
        <li><span class="badge-buy">COMPRA EM T+5m (Fechamento do M5)</span><br/>
          Quando <strong>Força Final &ge; 55%</strong> <u>E</u> <strong>Média das 7 Techs &ge; 52%</strong>.</li>
        <li style="margin-top:4px;"><span class="badge-sell">VENDA EM T+5m (Fechamento do M5)</span><br/>
          Quando <strong>Força Final &le; 45%</strong> <u>E</u> <strong>Média das 7 Techs &le; 48%</strong>.</li>
      </ul>
    </div>

    <div class="card-white">
      <h3>Gestão da Operação M5 (143 Trades no Ano)</h3>
      <table>
        <thead>
          <tr>
            <th>Parâmetro M5</th>
            <th>Valor Recomendado (MNQ / NQ)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Horário Exato de Avaliação</strong></td>
            <td><code>11:35:00 BRT</code> (Inverno) / <code>10:35:00 BRT</code> (Verão)</td>
          </tr>
          <tr class="highlight">
            <td><strong>Take Profit (Alvo)</strong></td>
            <td><strong>110 pontos</strong> (440 ticks)</td>
          </tr>
          <tr>
            <td><strong>Stop Loss (Proteção)</strong></td>
            <td><strong>75 pontos</strong> (300 ticks)</td>
          </tr>
          <tr>
            <td><strong>Saída por Tempo Máximo</strong></td>
            <td>Encerra em <strong>T+60m</strong> (55 min após a entrada)</td>
          </tr>
          <tr class="highlight">
            <td><strong>Resultado em 365 Dias</strong></td>
            <td><strong>57,3% Win Rate • +17,2 pts/trade • +2.459,6 pts</strong></td>
          </tr>
        </tbody>
      </table>
      <p style="font-size:8pt;color:#475569;">📌 <em>No robô, a opção <code>11. [M5] Operar M5 Apenas se T0 Não Entrou</code> evita duplicar posição caso o T0 já tenha operado naquele dia.</em></p>
    </div>
  </div>

  <!-- Comparativo visual T0 vs M5 -->
  <div class="card" style="margin-top:4px;">
    <h3>Resumo Visual: Como as Etapas 1 (T0) e 2 (M5) se Complementam</h3>
    <svg width="100%" height="95" viewBox="0 0 800 95" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="12" width="230" height="70" rx="8" fill="#1e293b" />
      <text x="125" y="34" text-anchor="middle" font-size="10.5" font-weight="bold" fill="#38bdf8">11:15 / 10:15 BRT (Pré-Open)</text>
      <text x="125" y="52" text-anchor="middle" font-size="9.5" fill="#ffffff">Checar Força Ásia e Força T-15m</text>
      <text x="125" y="68" text-anchor="middle" font-size="9" fill="#cbd5e1">Ambas &ge; 52% ou Ambas &le; 48%?</text>

      <!-- Seta SIM -->
      <line x1="240" y1="30" x2="310" y2="30" stroke="#16a34a" stroke-width="2.5" />
      <text x="275" y="23" text-anchor="middle" font-size="9" font-weight="bold" fill="#16a34a">SIM (38% dias)</text>
      <rect x="310" y="6" width="475" height="38" rx="6" fill="#dcfce7" stroke="#16a34a" stroke-width="1.5" />
      <text x="547" y="23" text-anchor="middle" font-size="9.5" font-weight="bold" fill="#14532d">ENTRA NO 1º SEGUNDO DA ABERTURA (T0 = 11:30:00 / 10:30:00 BRT)</text>
      <text x="547" y="37" text-anchor="middle" font-size="8.5" fill="#166534">Swing: Alvo 130 pts / Stop 85 pts (+21,8 pts/trade) • Scalp: Alvo 45 pts / Stop 45 pts (57,7% Win)</text>

      <!-- Seta NÃO -->
      <line x1="240" y1="65" x2="310" y2="65" stroke="#d97706" stroke-width="2.5" />
      <text x="275" y="58" text-anchor="middle" font-size="9" font-weight="bold" fill="#d97706">NÃO (62% dias)</text>
      <rect x="310" y="50" width="475" height="38" rx="6" fill="#fef3c7" stroke="#d97706" stroke-width="1.5" />
      <text x="547" y="67" text-anchor="middle" font-size="9.5" font-weight="bold" fill="#92400e">AGUARDA 5 MINUTOS (T+5m = 11:35:00 / 10:35:00 BRT)</text>
      <text x="547" y="81" text-anchor="middle" font-size="8.5" fill="#78350f">Entra se Força Final &ge; 55% + Techs &ge; 52% (Compra) ou &le; 45% + &le; 48% (Venda) • 57,3% Win</text>
    </svg>
  </div>

  <div class="footer-note">
    <span>VortexWeb Quant Research • Playbook Operacional MNQ / NQ</span>
    <span>Página 2 de 4</span>
  </div>
</div>

<!-- ==================== PÁGINA 3 ==================== -->
<div class="page">
  <div class="hero" style="padding:10px 16px;">
    <div>
      <h1 style="font-size:13.5pt;">ETAPAS 3 E 4 — A CAIXA DOS 15 MINUTOS (OR15) COM GESTÃO DE 50% E 25%</h1>
      <p>Como operar Reversão (Fade) e Rompimento (Breakout) usando 50% da Caixa (OR_Mid) e 50% da Metade (25%)</p>
    </div>
    <div class="hero-badge">
      <strong>FLAGS 3 &amp; 4</strong><br/>
      Pós-15 Minutos
    </div>
  </div>

  <div class="section-header">
    <span>ANATOMIA DA CAIXA OR15: COMO TRAÇAR OS NÍVEIS DE 50% (OR_Mid) E 25% (50% DA METADE)</span>
    <span class="tag">MATEMÁTICA DA CAIXA</span>
  </div>

  <div class="grid-2">
    <div class="card-white">
      <h3>Fórmulas Simples (Com Exemplo Prático)</h3>
      <p style="margin-bottom:4px;">Assim que fecha o 15º minuto da abertura (<code>11:45 BRT</code> ou <code>10:45 BRT</code>), marque a Máxima (<code>ORH_15</code>) e a Mínima (<code>ORL_15</code>) desse período:</p>
      <ul>
        <li><strong>Amplitude Total (<code>OR_Range</code>):</strong> <code>ORH_15 - ORL_15</code><br/>
          <em>Exemplo:</em> Máxima = <code>21.160</code> | Mínima = <code>21.000</code> &rarr; <strong>Range = 160 pts</strong>.</li>
        <li><strong>50% da Caixa (<code>OR_Mid</code> — Centro):</strong> <code>0,50 &times; OR_Range</code><br/>
          <em>No exemplo:</em> <code>50% de 160 = 80 pts</code> &rarr; Linha central em <strong>21.080</strong>.</li>
        <li><strong>50% da Metade (<code>q25 = 25% da Caixa</code>):</strong> <code>0,25 &times; OR_Range</code><br/>
          <em>No exemplo:</em> Metade de 80 pts = <strong>40 pts (160 ticks)</strong>.</li>
      </ul>
      <div class="formula-box" style="margin-top:6px;">
        Stop Padrão = 25% da OR &nbsp;|&nbsp; Parcial + BE = 25% da OR &nbsp;|&nbsp; Alvo Final = 50% da OR
      </div>
    </div>

    <!-- Diagrama SVG da Caixa OR15 -->
    <div class="card-white" style="text-align:center;padding:6px;">
      <svg width="100%" height="175" viewBox="0 0 380 175" xmlns="http://www.w3.org/2000/svg">
        <!-- Stop Acima (+25%) -->
        <line x1="25" y1="15" x2="355" y2="15" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4,3" />
        <text x="30" y="12" font-size="8.5" font-weight="bold" fill="#dc2626">Stop Loss Venda Fade (+25% OR fora) = 21.200 (+40 pts)</text>

        <!-- Caixa Principal OR15 -->
        <rect x="25" y="38" width="330" height="100" fill="#f8fafc" stroke="#64748b" stroke-width="1" />

        <!-- ORH_15 -->
        <line x1="25" y1="38" x2="355" y2="38" stroke="#dc2626" stroke-width="2.5" />
        <text x="30" y="34" font-size="9" font-weight="bold" fill="#dc2626">ORH_15 (Máxima 15m) = 21.160 (Entrada Venda Fade / Compra Breakout)</text>

        <!-- Q25 Superior -->
        <line x1="25" y1="63" x2="355" y2="63" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="2,2" />
        <text x="30" y="60" font-size="8.2" font-weight="bold" fill="#2563eb">25% da OR (50% da Metade) = 21.120 &rarr; Parcial 50% + Move Stop p/ Breakeven</text>

        <!-- OR_Mid (50%) -->
        <line x1="25" y1="88" x2="355" y2="88" stroke="#d97706" stroke-width="2.2" stroke-dasharray="5,3" />
        <text x="30" y="84" font-size="9" font-weight="bold" fill="#b45309">50% da OR (OR_Mid Centro) = 21.080 &rarr; ALVO FINAL DA REVERSÃO (80 pts)</text>

        <!-- Q25 Inferior -->
        <line x1="25" y1="113" x2="355" y2="113" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="2,2" />
        <text x="30" y="110" font-size="8.2" font-weight="bold" fill="#2563eb">25% da OR (50% da Metade) = 21.040 &rarr; Parcial 50% + Move Stop p/ Breakeven</text>

        <!-- ORL_15 -->
        <line x1="25" y1="138" x2="355" y2="138" stroke="#16a34a" stroke-width="2.5" />
        <text x="30" y="150" font-size="9" font-weight="bold" fill="#16a34a">ORL_15 (Mínima 15m) = 21.000 (Entrada Compra Fade / Venda Breakout)</text>

        <!-- Stop Abaixo (-25%) -->
        <line x1="25" y1="163" x2="355" y2="163" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4,3" />
        <text x="30" y="173" font-size="8.5" font-weight="bold" fill="#dc2626">Stop Loss Compra Fade (-25% OR fora) = 20.960 (-40 pts)</text>
      </svg>
    </div>
  </div>

  <div class="section-header">
    <span>ETAPA 3 ([FLAG 3]): REVERSÃO / FADE NO 1º TOQUE DA OR15 (66,7% A 67,9% DE ACERTO)</span>
    <span class="tag">+1.317,1 PONTOS NO ANO</span>
  </div>

  <div class="card-green" style="margin-bottom:7px;">
    <h3>Regra de Disparo da Reversão (Operar para Dentro da Caixa)</h3>
    <p>No <strong>1º toque do dia</strong> na Máxima (<code>ORH_15</code>) ou Mínima (<code>ORL_15</code>) após os 15 minutos iniciais: se <strong>o candle de 1 minuto fechar de volta dentro da caixa (deixando pavio de rejeição)</strong> <u>OU</u> a <strong>Força a favor do rompimento for &lt; 55%</strong>, entre <strong>contra a borda</strong> voltando para o centro da caixa!</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>Modelo de Gestão na Reversão OR15</th>
        <th>Todas as Caixas c/ Rejeição (123 trades/ano)</th>
        <th>Caixas Normais/Amplas &ge; 120 pts (78 trades/ano)</th>
        <th>Recomendação de Uso</th>
      </tr>
    </thead>
    <tbody>
      <tr class="highlight">
        <td><strong>1. Parcial em 25% OR + BE + Final em 50% OR (Stop 25% OR)</strong></td>
        <td><strong>66,7% Win</strong> • +10,31 pts/trade (<strong>+1.267,6 pts</strong>)</td>
        <td><strong>67,9% Win</strong> • +14,02 pts/trade (<strong>+1.093,6 pts</strong>)</td>
        <td>⭐ <strong>Padrão Oficial do Robô</strong> (melhor curva e proteção rápida)</td>
      </tr>
      <tr>
        <td><strong>2. Alvo Único em 25% OR | Stop 25% OR (Payoff 1:1)</strong></td>
        <td><strong>66,7% Win</strong> • +10,71 pts/trade (<strong>+1.317,1 pts</strong>)</td>
        <td><strong>67,9% Win</strong> • +13,78 pts/trade (<strong>+1.074,8 pts</strong>)</td>
        <td>Ideal para quem opera apenas <strong>1 contrato</strong> de MNQ</td>
      </tr>
      <tr>
        <td><strong>3. Alvo Único em 50% OR (Mid) | Stop 25% OR (Payoff 2:1)</strong></td>
        <td><strong>45,5% Win</strong> • +9,37 pts/trade (<strong>+1.151,9 pts</strong>)</td>
        <td><strong>47,4% Win</strong> • +12,35 pts/trade (<strong>+963,1 pts</strong>)</td>
        <td>Para buscar 2:1 cheio sem fazer parcial</td>
      </tr>
    </tbody>
  </table>

  <div class="section-header">
    <span>ETAPA 4 ([FLAG 4]): ROMPIMENTO / BREAKOUT DA OR15 (64,3% A 70,2% DE ACERTO)</span>
    <span class="tag">+1.342,0 PONTOS NO ANO</span>
  </div>

  <div class="grid-2">
    <div class="card-blue">
      <h3>Breakout de Caixa Comprimida (<code>OR_Range &le; 120 pts</code>)</h3>
      <p style="margin-bottom:4px;">Quando os primeiros 15 minutos tiveram range estreito (<code>&le; 120 pts</code>) e o candle de 1m <strong>fecha o corpo fora da OR15</strong> com <strong>Força a favor &ge; 55%</strong>:</p>
      <ul>
        <li><strong>Alvo Expansão +50% OR | Stop 50% OR (no OR_Mid):</strong><br/>
          <strong>64,3% de acerto</strong> • <code>+12,92 pts/trade</code> • <strong>+904,2 pts no ano</strong> (70 trades).</li>
        <li><strong>Alvo Expansão +50% OR | Stop 25% OR (Payoff 2:1):</strong><br/>
          <strong>48,6% de acerto</strong> • <code>+10,33 pts/trade</code> • <strong>+723,4 pts no ano</strong>.</li>
        <li><strong>Parcial +25% OR + BE + Final +50% OR (Stop 50%):</strong><br/>
          <strong>77,1% de acerto</strong> • <code>+6,82 pts/trade</code>.</li>
      </ul>
    </div>

    <div class="card-amber">
      <h3>Breakout de Caixa Explosiva (<code>OR_Range &ge; 180 pts</code>)</h3>
      <p style="margin-bottom:4px;">Em dias de notícias fortes (CPI, Payroll, FOMC) onde a OR15 passa de <code>180 pts</code> e o candle <strong>fecha fora</strong> com <strong>Força &ge; 55%</strong>:</p>
      <ul>
        <li><strong>Parcial +25% OR + BE + Final +50% OR | Stop 50% OR:</strong><br/>
          <strong>70,2% de acerto</strong> • <code>+9,31 pts/trade</code> • <strong>+437,8 pts no ano</strong> (47 trades).</li>
        <li><strong>Parcial +25% OR + BE + Final +50% OR | Stop 25% OR:</strong><br/>
          <strong>55,3% de acerto</strong> • <code>+7,44 pts/trade</code> • <strong>+349,5 pts no ano</strong>.</li>
      </ul>
    </div>
  </div>

  <div class="footer-note">
    <span>VortexWeb Quant Research • Playbook Operacional MNQ / NQ</span>
    <span>Página 3 de 4</span>
  </div>
</div>

<!-- ==================== PÁGINA 4 ==================== -->
<div class="page">
  <div class="hero" style="padding:10px 16px;">
    <div>
      <h1 style="font-size:13.5pt;">GUIA DO ROBÔ NINJATRADER 8 (VMPlaybookNasdaq) &amp; CHECKLIST DE BOLSO</h1>
      <p>Como configurar a Sessão 26 no NinjaTrader 8 e operar no MNQ com leitura automática do Supabase</p>
    </div>
    <div class="hero-badge">
      <strong>AUTOMAÇÃO NT8</strong><br/>
      Sessão 26
    </div>
  </div>

  <div class="section-header">
    <span>1. COMO FUNCIONA A LEITURA AUTOMÁTICA DA FORÇA NO ROBÔ</span>
    <span class="tag">ZERO CONFIGURAÇÃO MANUAL</span>
  </div>

  <div class="card-white" style="margin-bottom:8px;">
    <ul>
      <li><strong>Você NÃO precisa deixar o NinjaTrader aberto à noite:</strong> Assim que você ativa o robô <code>VM PLAYBOOK NASDAQ 1.0</code> no gráfico de <strong>1 Minuto (M1) do MNQ</strong>, ele faz uma busca cirúrgica na tabela <code>nasdaq_force</code> do Supabase para capturar qual foi a <strong>Força da Abertura Asiática (20:00 / 19:00 BRT)</strong> e a <strong>Força do Pré-Mercado (11:15 / 10:15 BRT)</strong>, travando ambas na memória RAM.</li>
      <li><strong>Polling Assíncrono a cada 4 segundos:</strong> Durante o pregão ao vivo, o robô atualiza a cada 4 segundos a <code>Força Final</code> e calcula a média das <code>7 Ações Tech</code> sem travar o gráfico, exibindo tudo no painel visual no canto da tela.</li>
    </ul>
  </div>

  <div class="section-header">
    <span>2. PARÂMETROS DA SESSÃO 26 NO NINJATRADER 8 (26. PLAYBOOK NASDAQ FORCE)</span>
    <span class="tag">GUIA DE CONFIGURAÇÃO</span>
  </div>

  <table>
    <thead>
      <tr>
        <th>Parâmetro na Sessão 26</th>
        <th>Valor Padrão</th>
        <th>O que faz na prática</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>02. Horário Abertura NY — Auto DST (EUA)</code></td>
        <td><strong>True (Marcado)</strong></td>
        <td>Muda sozinho entre <code>10:30 BRT</code> (Verão EUA) e <code>11:30 BRT</code> (Inverno EUA a partir de Novembro).</td>
      </tr>
      <tr>
        <td><code>05. Desenhar Níveis OR15</code></td>
        <td><strong>True (Marcado)</strong></td>
        <td>Desenha no gráfico a Máxima (vermelha), Mínima (verde), Centro <strong>50% OR_Mid</strong> (dourada) e linhas de <strong>25%</strong> (azuis).</td>
      </tr>
      <tr class="highlight">
        <td><code>06. [FLAG 1] Operar Abertura 1º Segundo (T0)</code></td>
        <td><strong>True / False</strong></td>
        <td>Liga/desliga a entrada no 1º segundo da abertura quando Ásia e T-15m estão alinhadas (&ge; 52% ou &le; 48%).</td>
      </tr>
      <tr>
        <td><code>07. [T0] Modo de Gestão</code></td>
        <td><code>Swing60m_130x85pts</code></td>
        <td>Escolhe entre <strong>Swing 60m</strong> (TP 130 / SL 85 pts), <strong>Scalp 5m</strong> (TP 45 / SL 45 pts) ou Ticks fixos.</td>
      </tr>
      <tr class="highlight">
        <td><code>10. [FLAG 2] Aguardar e Operar Confirmação M5</code></td>
        <td><strong>True / False</strong></td>
        <td>Liga/desliga a entrada no fechamento do 5º minuto (<code>11:35 / 10:35 BRT</code>) quando Força &ge; 55% + Techs &ge; 52%.</td>
      </tr>
      <tr>
        <td><code>11. [M5] Operar M5 Apenas se T0 Não Entrou</code></td>
        <td><strong>True (Marcado)</strong></td>
        <td>Se o T0 já abriu operação no dia, pula o M5 para seguir fielmente o fluxograma do Playbook.</td>
      </tr>
      <tr class="highlight">
        <td><code>19. [FLAG 3] Operar OR15 — Reversão / Fade</code></td>
        <td><strong>True / False</strong></td>
        <td>Liga/desliga a operação contra a borda dos 15 min no 1º toque com rejeição (pavio) ou Força &lt; 55%.</td>
      </tr>
      <tr class="highlight">
        <td><code>20. [FLAG 4] Operar OR15 — Rompimento / Breakout</code></td>
        <td><strong>True / False</strong></td>
        <td>Liga/desliga a operação a favor do rompimento quando a vela fecha fora da OR15 com Força &ge; 55%.</td>
      </tr>
      <tr>
        <td><code>21. [OR15] Modelo de Gestão 50% e 25%</code></td>
        <td><code>Parcial25_BE_Final50_Stop25</code></td>
        <td>Com 2+ contratos no MNQ, realiza <strong>50% em 25% da OR</strong>, move o Stop para o <strong>Breakeven</strong> e busca <strong>50% da OR (OR_Mid)</strong>.</td>
      </tr>
    </tbody>
  </table>

  <div class="section-header">
    <span>3. PERFIS PRONTOS DE CONFIGURAÇÃO E RESULTADO ANUAL CONSOLIDADO</span>
    <span class="tag">ESCOLHA SEU ESTILO</span>
  </div>

  <div class="grid-3">
    <div class="card-green">
      <h3>Perfil 1: Completo (Quadro 4)</h3>
      <ul>
        <li><strong>Flags Ativas:</strong> <code>FLAG 1 + 2 + 3 + 4</code></li>
        <li><strong>Max Operações (Sessão 03):</strong> <code>2</code> ou <code>3</code></li>
        <li><strong>Contratos MNQ (Sessão 04):</strong> <code>2</code> (ou par)</li>
        <li><strong>Foco:</strong> Opera 1 oportunidade na abertura (T0 ou M5) + 1 oportunidade na caixa OR15.</li>
      </ul>
    </div>
    <div class="card-blue">
      <h3>Perfil 2: Só Caixa OR15 (Pós-15m)</h3>
      <ul>
        <li><strong>Flags Ativas:</strong> <code>FLAG 3 + FLAG 4</code> (Desmarcar 1 e 2)</li>
        <li><strong>Max Operações:</strong> <code>1</code> ou <code>2</code></li>
        <li><strong>Foco:</strong> Ignora totalmente a volatilidade dos primeiros 15 min e opera só a matemática de 50% e 25% da OR15 (<strong>66,7% a 70,2% Win</strong>).</li>
      </ul>
    </div>
    <div class="card-amber">
      <h3>Perfil 3: Abertura Segura (M5 + OR15)</h3>
      <ul>
        <li><strong>Flags Ativas:</strong> <code>FLAG 2 + FLAG 3</code> (Desmarcar T0)</li>
        <li><strong>Max Operações:</strong> <code>2</code></li>
        <li><strong>Foco:</strong> Nunca entra no 1º segundo; espera os 5 minutos iniciais confirmarem com as 7 ações Tech e depois opera a rejeição da OR15.</li>
      </ul>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Etapa Cronológica</th>
        <th>Setup Validado (365 Dias)</th>
        <th>Trades / Ano</th>
        <th>Taxa de Acerto</th>
        <th>Expectativa Média</th>
        <th>Saldo Acumulado (1 Ano)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>1. Abertura 1º Seg (T0)</strong></td>
        <td>Alinhamento Ásia + T-15m (&ge; 52% ou &le; 48%) — Swing 60m</td>
        <td>97 trades</td>
        <td><strong>50,5%</strong> (1,53:1)</td>
        <td><strong>+21,84 pts</strong></td>
        <td><strong>+2.118,5 pts</strong></td>
      </tr>
      <tr>
        <td><strong>2. Confirmação M5 (T+5m)</strong></td>
        <td>Força Final &ge; 55% + 7 Techs &ge; 52% (ou &le; 45% / &le; 48%)</td>
        <td>143 trades</td>
        <td><strong>57,3%</strong></td>
        <td><strong>+17,20 pts</strong></td>
        <td><strong>+2.459,6 pts</strong></td>
      </tr>
      <tr class="highlight">
        <td><strong>3. OR15 Reversão (Fade)</strong></td>
        <td>1º Toque c/ Pavio ou Força &lt; 55% (Gestão 25% / 50% OR_Mid)</td>
        <td>123 trades</td>
        <td><strong>66,7% a 67,9%</strong></td>
        <td><strong>+10,31 a +14,02 pts</strong></td>
        <td><strong>+1.267,6 a +1.317,1 pts</strong></td>
      </tr>
      <tr>
        <td><strong>4. OR15 Breakout (&lt;120 / &gt;180)</strong></td>
        <td>Vela fecha fora + Força &ge; 55% (Expansão +25% / +50% OR)</td>
        <td>117 trades</td>
        <td><strong>64,3% a 70,2%</strong></td>
        <td><strong>+9,31 a +12,92 pts</strong></td>
        <td><strong>+1.342,0 pts</strong></td>
      </tr>
    </tbody>
  </table>

  <div class="footer-note">
    <span>VortexWeb Quant Research • Arquivos: experts/VMPlaybookNasdaq.cs &amp; experts/VMBotF.cs</span>
    <span>Página 4 de 4</span>
  </div>
</div>

</body>
</html>
"""

with open(HTML_PATH, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"HTML gerado em: {HTML_PATH}")

browsers = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]

for b in browsers:
    if os.path.exists(b):
        cmd = [
            b,
            "--headless",
            "--disable-gpu",
            "--no-pdf-header-footer",
            f"--print-to-pdf={PDF_PATH}",
            f"file:///{HTML_PATH.replace(os.sep, '/')}"
        ]
        subprocess.run(cmd, check=True)
        if os.path.exists(PDF_PATH):
            print(f"PDF gerado com sucesso em: {PDF_PATH} ({os.path.getsize(PDF_PATH)} bytes)")
            break
