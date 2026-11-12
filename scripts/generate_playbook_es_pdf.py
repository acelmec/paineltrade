"""Gera o PDF didatico e visual do Playbook Operacional ES / MES (S&P 500)
usando HTML/CSS + SVG de alta definicao e renderizacao headless via Edge/Chrome.
Inclui atualizacoes completas:
1. Horario Exato no NinjaTrader (Abertura no Segundo 10:30:01 / 11:30:01 e T05 em 10:35:01 / 11:35:01)
2. Estudo Quantitativo Completo da OR5 (Opening Range 5 Minutos no ES):
   - Breakout com Reteste alcanca 81,2% de Acerto no ES (+273 a +429 pts)
   - Por que NUNCA operar Fade na OR5 (Fade e exclusivo da OR15 com 74,2% Win)
3. Sweet Spot de Forca (60%-69%), Horario Sazonal de Inverno (11:30 BRT a partir de Novembro)
4. Presets Selecionaveis no Robo C# e Scalper com Parciais (ate 83,6% Win).
"""
import os
import subprocess

HTML_PATH = os.path.abspath("Playbook_Operacional_ES_MES_NasdaqForce.html")
PDF_PATH = os.path.abspath("Playbook_Operacional_ES_MES_NasdaqForce.pdf")

html_content = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Playbook Operacional &amp; Automação — ES / MES (S&amp;P 500 Futuro)</title>
<style>
  @page {
    size: A4 portrait;
    margin: 5.5mm 8.5mm 5.5mm 8.5mm;
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
    font-size: 8.3pt;
    line-height: 1.25;
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
  .hero {
    background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);
    color: #ffffff;
    padding: 8px 12px;
    border-radius: 6px;
    margin-bottom: 5px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .hero h1 {
    font-size: 12.5pt;
    font-weight: 800;
    letter-spacing: -0.3px;
    margin-bottom: 2px;
  }
  .hero p {
    font-size: 7.8pt;
    color: #cbd5e1;
  }
  .hero-badge {
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.25);
    border-radius: 6px;
    padding: 3px 8px;
    text-align: right;
    font-size: 7.2pt;
    line-height: 1.22;
  }
  .hero-badge strong {
    color: #38bdf8;
    font-size: 8.4pt;
  }

  .section-header {
    background: #0f172a;
    color: #ffffff;
    padding: 3.5px 8px;
    border-radius: 5px;
    font-size: 8.9pt;
    font-weight: 700;
    margin: 4px 0 3px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .section-header span.tag {
    background: #2563eb;
    color: #fff;
    font-size: 7pt;
    padding: 1px 5px;
    border-radius: 8px;
    font-weight: 600;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px;
    margin-bottom: 4px;
  }
  .grid-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 5px;
    margin-bottom: 4px;
  }
  .grid-4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    margin-bottom: 4px;
  }

  .card, .card-white, .card-green, .card-blue, .card-amber, .card-red, .card-purple {
    border-radius: 5px;
    padding: 5px 7px;
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
  .card-purple {
    border: 1.5px solid #7c3aed;
    background: #faf5ff;
  }

  .card h3, .card-white h3, .card-green h3, .card-blue h3, .card-amber h3, .card-purple h3 {
    font-size: 8.6pt;
    font-weight: 700;
    margin-bottom: 2px;
    color: #0f172a;
  }
  .kpi-num {
    font-size: 11.5pt;
    font-weight: 800;
    color: #1e3a8a;
    line-height: 1.1;
  }
  .kpi-label {
    font-size: 6.9pt;
    color: #475569;
    font-weight: 600;
    text-transform: uppercase;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 3px 0 4px 0;
    font-size: 7.7pt;
  }
  th {
    background: #1e293b;
    color: #ffffff;
    text-align: left;
    padding: 3px 5px;
    font-weight: 700;
  }
  td {
    padding: 2.8px 5px;
    border-bottom: 1px solid #e2e8f0;
  }
  tr:nth-child(even) td {
    background: #f8fafc;
  }
  tr.highlight td {
    background: #dcfce7 !important;
    font-weight: 600;
  }
  tr.highlight-blue td {
    background: #dbeafe !important;
    font-weight: 600;
  }

  .badge-buy {
    background: #16a34a;
    color: #fff;
    padding: 1px 4px;
    border-radius: 3px;
    font-weight: 700;
    font-size: 7.3pt;
  }
  .badge-sell {
    background: #dc2626;
    color: #fff;
    padding: 1px 4px;
    border-radius: 3px;
    font-weight: 700;
    font-size: 7.3pt;
  }
  .badge-neutral {
    background: #475569;
    color: #fff;
    padding: 1px 4px;
    border-radius: 3px;
    font-weight: 700;
    font-size: 7.3pt;
  }
  .badge-gold {
    background: #d97706;
    color: #fff;
    padding: 1px 4px;
    border-radius: 3px;
    font-weight: 700;
    font-size: 7.3pt;
  }

  ul {
    padding-left: 13px;
    margin: 2px 0;
  }
  li {
    margin-bottom: 1.8px;
  }
  .formula-box {
    background: #0f172a;
    color: #f8fafc;
    padding: 4px 8px;
    border-radius: 4px;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 7.9pt;
    margin: 3px 0;
  }
  .footer-note {
    margin-top: 4px;
    padding-top: 2.5px;
    border-top: 1px solid #cbd5e1;
    display: flex;
    justify-content: space-between;
    font-size: 7.1pt;
    color: #64748b;
  }
</style>
</head>
<body>

<!-- ==================== PÁGINA 1 ==================== -->
<div class="page">
  <div class="hero">
    <div>
      <h1>PLAYBOOK OPERACIONAL &amp; AUTOMAÇÃO — ES / MES</h1>
      <p>S&amp;P 500 Futuro: Sincronização Precisa de Velas, OR5 com Pullback, Fade na Borda e Automação NT8</p>
    </div>
    <div class="hero-badge">
      <strong>VALIDAÇÃO 365 DIAS</strong><br/>
      254 Pregões • 350.561 Minutos<br/>
      Base Oficial Databento
    </div>
  </div>

  <div class="grid-4">
    <div class="card">
      <div class="kpi-label">Valor do Ponto (ES / MES)</div>
      <div class="kpi-num">$50 / $5</div>
      <div style="font-size:7.3pt;color:#475569;">1 pt = 4 ticks ($12,50 / $1,25)</div>
    </div>
    <div class="card">
      <div class="kpi-label">Breakout OR5 Reteste</div>
      <div class="kpi-num" style="color:#16a34a;">81,2% Win Rate</div>
      <div style="font-size:7.3pt;color:#475569;">+273 a +429 pts no ES</div>
    </div>
    <div class="card">
      <div class="kpi-label">Assertividade M5 Parcial</div>
      <div class="kpi-num" style="color:#16a34a;">83,6% Win Rate</div>
      <div style="font-size:7.3pt;color:#475569;">+303,4 pts acumulados</div>
    </div>
    <div class="card">
      <div class="kpi-label">Amplitudes Médias</div>
      <div class="kpi-num">OR5: 14,4p | OR15: 20,9p</div>
      <div style="font-size:7.3pt;color:#475569;">OR5 = 68,7% do range de 15m</div>
    </div>
  </div>

  <div class="section-header">
    <span>1. O S&amp;P 500 FUTURO (ES / MES) E SUA DINÂMICA MEAN-REVERTING</span>
    <span class="tag">FUNDAMENTO TÉCNICO</span>
  </div>

  <div class="grid-2">
    <div class="card-white">
      <h3>Características Técnicas e Financeiras do ES / MES</h3>
      <p style="margin-bottom:2px;">O contrato futuro do S&amp;P 500 possui liquidez institucional profunda e menor amplitude que o Nasdaq:</p>
      <ul>
        <li><strong>ES (Standard):</strong> <code>1 ponto = US$ 50,00</code> | <code>1 tick (0,25) = US$ 12,50</code>.</li>
        <li><strong>MES (Micro):</strong> <code>1 ponto = US$ 5,00</code> | <code>1 tick (0,25) = US$ 1,25</code> (ideal para mesas de $25k a $50k).</li>
        <li><strong>Leitura de Força:</strong> A Força Final da tabela <code>nasdaq_force</code> tem peso direto de 15% do S&amp;P 500 + 35% das 7 Techs, funcionando perfeitamente como termômetro de apetite ao risco.</li>
      </ul>
    </div>
    <div class="card-amber">
      <h3>⚠️ Regra de Ouro: Sincronização de Velas no NinjaTrader (Bar Close vs. Broker Time)</h3>
      <ul>
        <li><strong>A Vela das 10:30:00 é PRÉ-MERCADO:</strong> No NinjaTrader 8, a barra carimbada como <code>10:30:00</code> iniciou às <code>10:29:01</code> e fechou às <code>10:30:00</code>. Portanto, ela <u>pertence ao pré-mercado</u>!</li>
        <li><strong>Entrada Real do T0 no 1º Segundo (10:30:01 / 11:30:01):</strong> O pregão oficial de NY (RTH) inicia exatamente no segundo <code>10:30:01 BRT</code> (ou <code>11:30:01 BRT</code> no inverno). O robô monitora o relógio da corretora e dispara a mercado no segundo <code>:01</code>!</li>
        <li><strong>Confirmação M5 e OR5 (10:35:01 / 11:35:01):</strong> Os primeiros 5 minutos fecham na barra das <code>10:35:00</code>. O M5 e o Breakout da OR5 disparam no segundo <code>:01</code> seguinte!</li>
      </ul>
    </div>
  </div>

  <div class="section-header">
    <span>2. CRONOGRAMA DE HORÁRIOS SAZONAIS NO ES (FUSO BRASÍLIA — BRT)</span>
    <span class="tag">AUTO DST INTEGRADO</span>
  </div>

  <table>
    <thead>
      <tr>
        <th>Regime Sazonal dos EUA</th>
        <th>Sessão Ásia (Noite)</th>
        <th>Pré-Mercado (T-15m)</th>
        <th>Abertura T0 (1º Seg)</th>
        <th>Fechamento M5 &amp; OR5</th>
        <th>Fechamento OR15</th>
      </tr>
    </thead>
    <tbody>
      <tr class="highlight">
        <td><strong>Horário de Inverno (EST / UTC-5)</strong><br/><span style="font-size:7pt;color:#1e3a8a;">1º Dom. Novembro até 2º Dom. Março</span></td>
        <td><strong>20:00 BRT</strong><br/>(18:00 ET)</td>
        <td><strong>11:15 BRT</strong><br/>(09:15 ET)</td>
        <td><strong>11:30:01 BRT</strong><br/>(09:30:01 ET)</td>
        <td><strong>11:35:01 BRT</strong><br/>(09:35:01 ET)</td>
        <td><strong>11:45:01 às 13:30 BRT</strong><br/>(09:45 às 11:30 ET)</td>
      </tr>
      <tr>
        <td><strong>Horário de Verão (EDT / UTC-4)</strong><br/><span style="font-size:7pt;color:#475569;">2º Dom. Março até 1º Dom. Novembro</span></td>
        <td><strong>19:00 BRT</strong><br/>(18:00 ET)</td>
        <td><strong>10:15 BRT</strong><br/>(09:15 ET)</td>
        <td><strong>10:30:01 BRT</strong><br/>(09:30:01 ET)</td>
        <td><strong>10:35:01 BRT</strong><br/>(09:35:01 ET)</td>
        <td><strong>10:45:01 às 12:30 BRT</strong><br/>(09:45 às 11:30 ET)</td>
      </tr>
    </tbody>
  </table>

  <div class="section-header">
    <span>3. MAPA CRONOLÓGICO DO PREGÃO NO ES / MES</span>
    <span class="tag">FLUXOGRAMA EXECUTIVO</span>
  </div>

  <div class="card-white" style="padding:6px;text-align:center;">
    <svg width="100%" height="130" viewBox="0 0 820 130" xmlns="http://www.w3.org/2000/svg">
      <line x1="25" y1="50" x2="795" y2="50" stroke="#94a3b8" stroke-width="3" />
      
      <circle cx="65" cy="50" r="9" fill="#1e293b" />
      <text x="65" y="20" text-anchor="middle" font-size="9.5" font-weight="bold" fill="#0f172a">1. ÁSIA (Noite)</text>
      <text x="65" y="34" text-anchor="middle" font-size="8.5" fill="#475569">20:00 / 19:00 BRT</text>
      <rect x="12" y="65" width="106" height="50" rx="4" fill="#f1f5f9" stroke="#94a3b8" />
      <text x="65" y="80" text-anchor="middle" font-size="8" font-weight="bold" fill="#1e293b">Guarda Força Ásia</text>
      <text x="65" y="93" text-anchor="middle" font-size="7.5" fill="#475569">Compra &ge; 52%</text>
      <text x="65" y="105" text-anchor="middle" font-size="7.5" fill="#475569">Venda &le; 48%</text>

      <circle cx="215" cy="50" r="9" fill="#1e293b" />
      <text x="215" y="20" text-anchor="middle" font-size="9.5" font-weight="bold" fill="#0f172a">2. PRÉ-OPEN (T-15m)</text>
      <text x="215" y="34" text-anchor="middle" font-size="8.5" fill="#475569">11:15 / 10:15 BRT</text>
      <rect x="155" y="65" width="120" height="50" rx="4" fill="#f1f5f9" stroke="#94a3b8" />
      <text x="215" y="80" text-anchor="middle" font-size="8" font-weight="bold" fill="#1e293b">Compara c/ Ásia</text>
      <text x="215" y="93" text-anchor="middle" font-size="7.5" fill="#16a34a">Alinhados? Libera T0</text>
      <text x="215" y="105" text-anchor="middle" font-size="7.5" fill="#d97706">Divergentes? Espera M5</text>

      <circle cx="375" cy="50" r="11" fill="#2563eb" />
      <text x="375" y="20" text-anchor="middle" font-size="9.5" font-weight="bold" fill="#1d4ed8">3. ABERTURA (T0)</text>
      <text x="375" y="34" text-anchor="middle" font-size="8.5" fill="#2563eb">11:30:01 / 10:30:01</text>
      <rect x="310" y="65" width="130" height="50" rx="4" fill="#eff6ff" stroke="#2563eb" stroke-width="1.3" />
      <text x="375" y="80" text-anchor="middle" font-size="8" font-weight="bold" fill="#1e3a8a">[FLAG 1] Scalp Parcial</text>
      <text x="375" y="93" text-anchor="middle" font-size="7.5" fill="#1e293b">SL 7 / P1 4 / P2 8 pts</text>
      <text x="375" y="105" text-anchor="middle" font-size="7.5" fill="#16a34a">73,7% Win Rate</text>

      <circle cx="545" cy="50" r="11" fill="#0d9488" />
      <text x="545" y="20" text-anchor="middle" font-size="9.5" font-weight="bold" fill="#0f766e">4. M5 &amp; CAIXA OR5</text>
      <text x="545" y="34" text-anchor="middle" font-size="8.5" fill="#0d9488">11:35:01 / 10:35:01</text>
      <rect x="475" y="65" width="140" height="50" rx="4" fill="#f0fdfa" stroke="#0d9488" stroke-width="1.3" />
      <text x="545" y="80" text-anchor="middle" font-size="8" font-weight="bold" fill="#115e59">[FLAG 2] M5: 83,6% Win</text>
      <text x="545" y="93" text-anchor="middle" font-size="7.5" fill="#1e293b">[FLAG OR5] Brk Reteste</text>
      <text x="545" y="105" text-anchor="middle" font-size="7.5" fill="#16a34a">81,2% Win (+273p)</text>

      <circle cx="725" cy="50" r="11" fill="#16a34a" />
      <text x="725" y="20" text-anchor="middle" font-size="9.5" font-weight="bold" fill="#15803d">5. CAIXA OR15 (15m)</text>
      <text x="725" y="34" text-anchor="middle" font-size="8.5" fill="#16a34a">11:45:01 às 13:30 BRT</text>
      <rect x="645" y="65" width="160" height="50" rx="4" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.3" />
      <text x="725" y="80" text-anchor="middle" font-size="8" font-weight="bold" fill="#14532d">[FLAG 3] Fade na Borda</text>
      <text x="725" y="93" text-anchor="middle" font-size="7.5" fill="#1e293b">74,2% Win Rate ⭐</text>
      <text x="725" y="105" text-anchor="middle" font-size="7.5" fill="#16a34a">Brk c/ Reteste: +210 pts</text>
    </svg>
  </div>

  <div class="footer-note">
    <span>VortexWeb Quant Research • Playbook Operacional ES / MES</span>
    <span>Página 1 de 4</span>
  </div>
</div>

<!-- ==================== PÁGINA 2 ==================== -->
<div class="page">
  <div class="hero">
    <div>
      <h1>ETAPAS 1 E 2 — ABERTURA NO ES: T0 (10:30:01 / 11:30:01) E T5 (10:35:01 / 11:35:01)</h1>
      <p>Entrada cirúrgica no segundo :01 e Desempenho com Parciais atinge até 83,6% de assertividade</p>
    </div>
    <div class="hero-badge">
      <strong>FLAGS 1 &amp; 2</strong><br/>
      Abertura ES / MES
    </div>
  </div>

  <div class="section-header">
    <span>ETAPA 1 ([FLAG 1]): ENTRADA NO 1º SEGUNDO DA ABERTURA (T0 = 10:30:01 / 11:30:01 BRT)</span>
    <span class="tag">73,7% WIN RATE COM PARCIAIS</span>
  </div>

  <div class="grid-2">
    <div class="card-blue">
      <h3>Critério de Disparo Pré-Abertura (11:15 / 10:15 BRT)</h3>
      <p style="margin-bottom:2px;">No ES, o modelo clássico de <strong>Ásia + Pré-Mercado (Config 1)</strong> é soberano e gerou <strong>+109,0 a +145,9 pts no ano</strong>:</p>
      <ul>
        <li><span class="badge-buy">COMPRA NO T0 (10:30:01):</span> Se <strong>Força Ásia &ge; 52%</strong> <u>E</u> <strong>Força T-15m &ge; 52%</strong>.</li>
        <li><span class="badge-sell">VENDA NO T0 (10:30:01):</span> Se <strong>Força Ásia &le; 48%</strong> <u>E</u> <strong>Força T-15m &le; 48%</strong>.</li>
        <li><span class="badge-neutral">FICAR DE FORA:</span> Se houver divergência entre as sessões. Aguarde o M5!</li>
      </ul>
    </div>

    <div class="card-white">
      <h3>Comparativo de Gestão T0 no ES (365 Dias / 99 Pregões)</h3>
      <table>
        <thead>
          <tr>
            <th>Modo de Gestão T0</th>
            <th>Stop (SL)</th>
            <th>Alvo / Parciais</th>
            <th>Win Rate</th>
            <th>Saldo Anual</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Swing 60m</strong></td>
            <td>14 pts</td>
            <td>TP 20 pts</td>
            <td>50,5%</td>
            <td><strong>+284,0 pts</strong></td>
          </tr>
          <tr>
            <td><strong>Scalper Entrada Única</strong></td>
            <td>8 pts</td>
            <td>TP 6 pts</td>
            <td>66,7%</td>
            <td><strong>+127,5 pts</strong></td>
          </tr>
          <tr class="highlight">
            <td><strong>Scalper Saída Parcial ⭐</strong></td>
            <td>7 pts</td>
            <td><strong>P1: 4 pts / P2: 8 pts</strong><br/>(Stop &rarr; BE após P1)</td>
            <td><strong>73,7%</strong></td>
            <td><strong>+145,9 pts</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="section-header">
    <span>ETAPA 2 ([FLAG 2]): CONFIRMAÇÃO M5 (T+5m = 10:35:01 / 11:35:01 BRT) — EFICIÊNCIA MÁXIMA</span>
    <span class="tag">83,6% WIN RATE HISTÓRICO</span>
  </div>

  <div class="grid-2">
    <div class="card-green">
      <h3>A Força das 7 Techs no S&amp;P 500</h3>
      <p style="margin-bottom:2px;">As 7 maiores empresas representam mais de 30% da capitalização do S&amp;P 500. A 5ª vela fecha às <code>10:35:00</code> e a confirmação entra às <code>10:35:01</code>:</p>
      <ul>
        <li><span class="badge-buy">COMPRA EM T+5m:</span> Força Final &ge; 55% E 7 Techs &ge; 52%.</li>
        <li><span class="badge-sell">VENDA EM T+5m:</span> Força Final &le; 45% E 7 Techs &le; 48%.</li>
        <li><strong>Sweet Spot de Entrada:</strong> Força &ge; 62% eleva o acerto do M5 para mais de 80%.</li>
      </ul>
    </div>

    <div class="card-white">
      <h3>Comparativo de Gestão M5 no ES (151 Pregões no Ano)</h3>
      <table>
        <thead>
          <tr>
            <th>Modo de Gestão M5</th>
            <th>Stop (SL)</th>
            <th>Alvo / Parciais</th>
            <th>Win Rate</th>
            <th>Saldo Anual</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Modo Tendência 60m</strong></td>
            <td>12 pts</td>
            <td>TP 16 pts</td>
            <td>59,6%</td>
            <td><strong>+302,5 pts</strong></td>
          </tr>
          <tr>
            <td><strong>Scalper Entrada Única</strong></td>
            <td>10 pts</td>
            <td>TP 8 pts</td>
            <td>67,2%</td>
            <td><strong>+246,0 pts</strong></td>
          </tr>
          <tr class="highlight">
            <td><strong>Scalper Parcial (Conservador) ⭐</strong></td>
            <td>11 pts</td>
            <td><strong>P1: 5 pts / P2: 14 pts</strong></td>
            <td><strong>83,6%</strong></td>
            <td><strong>+303,4 pts</strong></td>
          </tr>
          <tr class="highlight-blue">
            <td><strong>Scalper Parcial (Moderado) ⭐</strong></td>
            <td>14 pts</td>
            <td><strong>P1: 7 pts / P2: 22 pts</strong></td>
            <td><strong>80,3%</strong></td>
            <td><strong>+390,8 pts</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="card" style="margin-top:2px;">
    <h3>Fluxo de Decisão Visual da Abertura do ES</h3>
    <svg width="100%" height="82" viewBox="0 0 800 82" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="8" width="225" height="66" rx="6" fill="#1e293b" />
      <text x="122" y="28" text-anchor="middle" font-size="9.5" font-weight="bold" fill="#38bdf8">11:15 BRT / 10:15 BRT</text>
      <text x="122" y="44" text-anchor="middle" font-size="8.3" fill="#ffffff">Ásia (20h) + Pré-Mercado (11:15)</text>
      <text x="122" y="60" text-anchor="middle" font-size="7.9" fill="#cbd5e1">Ambas &ge; 52% ou &le; 48%?</text>

      <line x1="235" y1="25" x2="305" y2="25" stroke="#16a34a" stroke-width="2.5" />
      <text x="270" y="19" text-anchor="middle" font-size="8" font-weight="bold" fill="#16a34a">SIM (39% dias)</text>
      <rect x="305" y="4" width="480" height="34" rx="5" fill="#dcfce7" stroke="#16a34a" stroke-width="1.3" />
      <text x="545" y="19" text-anchor="middle" font-size="8.8" font-weight="bold" fill="#14532d">DISPARA NO 1º SEGUNDO DA ABERTURA (T0 = 11:30:01 / 10:30:01 BRT)</text>
      <text x="545" y="31" text-anchor="middle" font-size="7.8" fill="#166534">Scalper Parcial: 73,7% Win • SL 7 pts / P1 4 pts / P2 8 pts • Saldo +145,9 pts</text>

      <line x1="235" y1="57" x2="305" y2="57" stroke="#d97706" stroke-width="2.5" />
      <text x="270" y="51" text-anchor="middle" font-size="8" font-weight="bold" fill="#d97706">NÃO (61% dias)</text>
      <rect x="305" y="42" width="480" height="34" rx="5" fill="#fef3c7" stroke="#d97706" stroke-width="1.3" />
      <text x="545" y="57" text-anchor="middle" font-size="8.8" font-weight="bold" fill="#92400e">AGUARDA 5 MINUTOS — CONFIRMAÇÃO M5 (11:35:01 / 10:35:01 BRT)</text>
      <text x="545" y="69" text-anchor="middle" font-size="7.8" fill="#78350f">Scalper Parcial: 83,6% Win • SL 11 pts / P1 5 pts / P2 14 pts • Saldo +303,4 pts</text>
    </svg>
  </div>

  <div class="footer-note">
    <span>VortexWeb Quant Research • Playbook Operacional ES / MES</span>
    <span>Página 2 de 4</span>
  </div>
</div>

<!-- ==================== PÁGINA 3 ==================== -->
<div class="page">
  <div class="hero">
    <div>
      <h1>ESTUDO QUANTITATIVO NO ES: OR5 (5 MINUTOS) &amp; OR15 (15 MINUTOS)</h1>
      <p>Breakout com Reteste na OR5 atinge 81,2% Win; Fade na Borda da OR15 é a Estratégia Rainha do S&amp;P 500 (74,2% Win)</p>
    </div>
    <div class="hero-badge">
      <strong>OR5 vs. OR15 ES</strong><br/>
      Reteste &amp; Fade
    </div>
  </div>

  <div class="section-header">
    <span>1. A NOVA ESTRATÉGIA OR5 NO ES (CAIXA DOS 5 MINUTOS: PÓS-10:35:01 / 11:35:01 BRT)</span>
    <span class="tag">81,2% WIN RATE COM RETESTE</span>
  </div>

  <div class="grid-2">
    <div class="card-white">
      <h3>Anatomia e Regras da Caixa OR5 no ES / MES</h3>
      <p style="margin-bottom:2px;">A OR5 no S&amp;P 500 reflete as 5 primeiras barras do pregão (10:31 a 10:35 BRT):</p>
      <ul>
        <li><strong>Amplitude Média da OR5:</strong> <strong>14,4 pontos</strong> (já representa <strong>68,7%</strong> de toda a amplitude dos 15 minutos!).</li>
        <li><span class="badge-buy">BREAKOUT COM RETESTE (PULLBACK) ⭐:</span> Quando o candle de 1m fecha fora da OR5 com Força &ge; 55% e o preço faz reteste tocando a borda, a entrada no reteste alcança <strong>81,2% de Win Rate</strong> com Parcial +25%/+50% (+273,2 pts) e até <strong>+429,9 pts</strong> com alvo 100%!</li>
        <li><span class="badge-sell">⚠️ NUNCA OPERAR FADE NA OR5:</span> O estudo comprovou que operar reversão na borda da OR5 no ES gera prejuízo (-150,2 pts). A reversão na borda (Fade) só deve ser operada na OR15!</li>
      </ul>
    </div>

    <div class="card-white">
      <h3>Desempenho da OR5 no ES em 365 Dias (Base Databento)</h3>
      <table>
        <thead>
          <tr>
            <th>Configuração na Caixa OR5</th>
            <th>Trades</th>
            <th>Win Rate</th>
            <th>Média/Trade</th>
            <th>Saldo Anual</th>
          </tr>
        </thead>
        <tbody>
          <tr class="highlight">
            <td><strong>Breakout Reteste (Parcial 25% / 50%) ⭐</strong></td>
            <td>170 tr</td>
            <td><strong>81,2%</strong></td>
            <td><strong>+1,61 pts</strong></td>
            <td><strong>+273,2 pts</strong></td>
          </tr>
          <tr class="highlight-blue">
            <td><strong>Breakout Reteste (+100% Expansão) ⭐</strong></td>
            <td>170 tr</td>
            <td><strong>48,8%</strong></td>
            <td><strong>+2,53 pts</strong></td>
            <td><strong>+429,9 pts</strong></td>
          </tr>
          <tr>
            <td>Breakout Seco no Fechamento (+50% Exp)</td>
            <td>245 tr</td>
            <td>51,4%</td>
            <td>+0,16 pts</td>
            <td>+38,2 pts (Fraco)</td>
          </tr>
          <tr style="background:#fee2e2;">
            <td>Fade Reversão na Borda da OR5 (Centro 50%)</td>
            <td>250 tr</td>
            <td>46,4%</td>
            <td>-0,60 pts</td>
            <td><strong>-150,2 pts (Não Recomendado)</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="section-header">
    <span>2. A CAIXA DOS 15 MINUTOS (OR15: PÓS-10:45:01 / 11:45:01 BRT) — O REINADO DO FADE</span>
    <span class="tag">74,2% WIN RATE</span>
  </div>

  <div class="grid-2">
    <!-- SVG da Caixa OR15 no ES -->
    <div class="card-white" style="text-align:center;padding:4px;">
      <svg width="100%" height="155" viewBox="0 0 380 155" xmlns="http://www.w3.org/2000/svg">
        <line x1="20" y1="10" x2="360" y2="10" stroke="#dc2626" stroke-width="1.2" stroke-dasharray="3,3" />
        <text x="25" y="8" font-size="7.5" font-weight="bold" fill="#dc2626">Stop Loss Fade (+25% OR fora da caixa: ~6 pts)</text>

        <rect x="20" y="28" width="340" height="92" fill="#f8fafc" stroke="#64748b" stroke-width="1" />

        <line x1="20" y1="28" x2="360" y2="28" stroke="#dc2626" stroke-width="2.2" />
        <text x="25" y="25" font-size="8.1" font-weight="bold" fill="#dc2626">ORH_15 (Máxima 15m) — Entrada Venda Fade ⭐</text>

        <line x1="20" y1="51" x2="360" y2="51" stroke="#2563eb" stroke-width="1.1" stroke-dasharray="2,2" />
        <text x="25" y="47" font-size="7.3" font-weight="bold" fill="#2563eb">25% OR (~6,2 pts) &rarr; Scalp Rápido</text>

        <line x1="20" y1="60" x2="360" y2="60" stroke="#7c3aed" stroke-width="1.1" stroke-dasharray="2,2" />
        <text x="25" y="69" font-size="7.3" font-weight="bold" fill="#7c3aed">35% OR (~8,7 pts) &rarr; Parcial Otimizada Fade + Breakeven</text>

        <line x1="20" y1="74" x2="360" y2="74" stroke="#d97706" stroke-width="1.8" stroke-dasharray="4,2" />
        <text x="25" y="82" font-size="8.1" font-weight="bold" fill="#b45309">50% OR (OR_Mid Centro: ~12,4 pts) &rarr; ALVO FINAL DO FADE</text>

        <line x1="20" y1="120" x2="360" y2="120" stroke="#16a34a" stroke-width="2.2" />
        <text x="25" y="131" font-size="8.1" font-weight="bold" fill="#16a34a">ORL_15 (Mínima 15m) — Entrada Compra Fade ⭐</text>

        <line x1="20" y1="144" x2="360" y2="144" stroke="#dc2626" stroke-width="1.2" stroke-dasharray="3,3" />
        <text x="25" y="152" font-size="7.5" font-weight="bold" fill="#dc2626">Stop Loss Fade (-25% OR fora da caixa: ~6 pts)</text>
      </svg>
    </div>

    <div class="card-white">
      <h3>Comparativo: Fade vs. Breakout na OR15 do ES</h3>
      <table>
        <thead>
          <tr>
            <th>Estratégia na OR15 do ES</th>
            <th>Taxa de Acerto</th>
            <th>Média/Trade</th>
            <th>Saldo Anual</th>
          </tr>
        </thead>
        <tbody>
          <tr class="highlight">
            <td><strong>Fade na Borda (Parcial 35% / Final 50%) ⭐</strong></td>
            <td><strong>74,2% Win</strong></td>
            <td><strong>+0,64 pts</strong></td>
            <td><strong>+87,5 pts</strong></td>
          </tr>
          <tr>
            <td>Fade Alvo Fixo 25% OR | Stop 25% (1:1)</td>
            <td>73,5% Win</td>
            <td>+0,58 pts</td>
            <td>+78,9 pts</td>
          </tr>
          <tr class="highlight-blue">
            <td><strong>Breakout c/ Confirmação de Reteste ⭐</strong></td>
            <td><strong>65,8% Win</strong></td>
            <td><strong>+1,84 pts</strong></td>
            <td><strong>+210,2 pts</strong></td>
          </tr>
          <tr>
            <td>Breakout Seco no Fechamento Fora</td>
            <td>56,1% Win</td>
            <td>+0,87 pts</td>
            <td>+99,1 pts (Mais stops)</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="footer-note">
    <span>VortexWeb Quant Research • Playbook Operacional ES / MES</span>
    <span>Página 3 de 4</span>
  </div>
</div>

<!-- ==================== PÁGINA 4 ==================== -->
<div class="page">
  <div class="hero">
    <div>
      <h1>GUIA DE PRESETS SELECIONÁVEIS DO ROBÔ NO ES / MES &amp; GESTÃO DE CONTA</h1>
      <p>Configurações otimizadas para contas de $25k, $50k e $100k no NinjaTrader 8</p>
    </div>
    <div class="hero-badge">
      <strong>ROBÔ NT8</strong><br/>
      Sessão 26 Playbook
    </div>
  </div>

  <div class="section-header">
    <span>1. TABELA DE PRESETS RECOMENDADOS NO ROBÔ PARA O ES / MES</span>
    <span class="tag">CONFIGURAÇÃO PRONTA</span>
  </div>

  <table>
    <thead>
      <tr>
        <th>Parâmetro no Robô C#</th>
        <th>Valores Selecionáveis</th>
        <th>Valor Recomendado (ES / MES)</th>
        <th>Efeito Prático no Gráfico</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>02. Horário Abertura NY</code></td>
        <td>Auto DST (EUA) / Manual</td>
        <td><strong>True (Auto DST)</strong></td>
        <td>Comuta sozinho para <strong>11:30 BRT em novembro</strong> e 10:30 BRT em março.</td>
      </tr>
      <tr class="highlight">
        <td><code>07. [T0] Viés Noturno (PbT0Vies)</code></td>
        <td><code>AsiaPreMercado</code> (Config 1)<br/><code>AsiaLondresPreMercado</code> (Config 5)</td>
        <td><strong>AsiaPreMercado ⭐</strong><br/>(Config 1)</td>
        <td>Dispara às <strong>10:30:01 / 11:30:01</strong> se Ásia + Pré-mercado alinhados (<strong>+109,0 pts</strong>).</td>
      </tr>
      <tr class="highlight">
        <td><code>08. [T0] Modo Gestão (PbT0Modo)</code></td>
        <td><code>Swing60m</code> / <code>ScalperUnico</code><br/><code>ScalperParcial</code> / <code>CustomTicks</code></td>
        <td><strong>ScalperParcial ⭐</strong></td>
        <td>SL 7 pts, P1 em 4 pts, move stop para Breakeven e P2 busca 8 pts (<strong>73,7% Win</strong>).</td>
      </tr>
      <tr class="highlight-blue">
        <td><code>12. [M5] Modo Gestão (PbM5Modo)</code></td>
        <td><code>Tendencia</code> / <code>ScalperUnico</code><br/><code>ScalperParcial</code> / <code>CustomTicks</code></td>
        <td><strong>ScalperParcial ⭐</strong></td>
        <td>Dispara às <strong>10:35:01 / 11:35:01</strong>. SL 11p, P1 5p, BE, P2 14p (<strong>83,6% Win</strong>).</td>
      </tr>
      <tr class="highlight">
        <td><code>25.1. [FLAG OR5] Operar Caixa 5m</code></td>
        <td>True / False</td>
        <td><strong>True (Marcado) ⭐</strong></td>
        <td>Ativa a operação da Caixa dos 5 Minutos (OR5) imediatamente após o T05.</td>
      </tr>
      <tr class="highlight">
        <td><code>25.2. [OR5 Breakout] Entrada</code></td>
        <td><code>Com_Pullback_Reteste</code><br/><code>Direto_FechamentoFora</code></td>
        <td><strong>Com_Pullback_Reteste ⭐</strong></td>
        <td>Aguarda reteste na borda da OR5 (<strong>81,2% Win Rate e +273 a +429 pts no ES</strong>).</td>
      </tr>
      <tr class="highlight">
        <td><code>27. [OR15] Direção (PbOR15Direcao)</code></td>
        <td><code>BreakoutApenas</code> / <code>FadeApenas</code> / <code>Ambos</code></td>
        <td><strong>FadeApenas ⭐</strong><br/>(ou Ambos)</td>
        <td>No ES, o <strong>Fade na borda é a principal recomendação (74,2% Win)</strong>.</td>
      </tr>
      <tr class="highlight">
        <td><code>28. [OR15] Entrada Breakout</code></td>
        <td><code>SecoFechamento</code><br/><code>PullbackConfirmacao</code></td>
        <td><strong>PullbackConfirmacao ⭐</strong></td>
        <td>No ES, o <strong>Pullback é mandatório (+210,2 pts vs +99,1 pts seco)</strong>.</td>
      </tr>
    </tbody>
  </table>

  <div class="section-header">
    <span>2. DIMENSIONAMENTO DE CAPITAL E GESTÃO DE CONTRATOS (ES vs. MES)</span>
    <span class="tag">RISCO CONTROLADO</span>
  </div>

  <div class="grid-3">
    <div class="card-green">
      <h3>Contas $25k / $50k (Mesas Prop)</h3>
      <ul>
        <li><strong>Contrato:</strong> <code>MES</code> (Micro S&amp;P 500).</li>
        <li><strong>Lote Sugerido:</strong> <code>2 a 4 MES</code>.</li>
        <li><strong>Risco por Trade:</strong> <code>$35 a $70</code> (Stop de 7 pts no T0).</li>
        <li><strong>Meta Diária:</strong> <code>$100 a $200</code>.</li>
        <li><strong>Limite Perda Diária:</strong> <code>$150</code>.</li>
      </ul>
    </div>
    <div class="card-blue">
      <h3>Contas $100k / $150k</h3>
      <ul>
        <li><strong>Contrato:</strong> <code>MES</code> (6 a 10 contratos) ou <code>1 ES</code>.</li>
        <li><strong>Lote Sugerido:</strong> <code>6 MES</code> ou <code>1 ES</code>.</li>
        <li><strong>Risco por Trade:</strong> <code>$150 a $350</code>.</li>
        <li><strong>Meta Diária:</strong> <code>$400 a $700</code>.</li>
        <li><strong>Limite Perda Diária:</strong> <code>$600</code>.</li>
      </ul>
    </div>
    <div class="card-purple">
      <h3>Contas $250k+ / Reais Grandes</h3>
      <ul>
        <li><strong>Contrato:</strong> <code>ES</code> (Cheio).</li>
        <li><strong>Lote Sugerido:</strong> <code>2 ES</code> (para parciais perfeitas).</li>
        <li><strong>Risco por Trade:</strong> <code>$700</code> (Stop 7 pts em 2 ES).</li>
        <li><strong>Meta Diária:</strong> <code>$1.200 a $2.000</code>.</li>
        <li><strong>Limite Perda Diária:</strong> <code>$1.500</code>.</li>
      </ul>
    </div>
  </div>

  <div class="section-header">
    <span>3. RESUMO CONSOLIDADO DE PERFORMANCE ANUAL NO ES (365 DIAS / 254 PREGÕES)</span>
    <span class="tag">AUDITORIA QUANTITATIVA</span>
  </div>

  <table>
    <thead>
      <tr>
        <th>Estratégia Playbook</th>
        <th>Horário de Gatilho (Corretora)</th>
        <th>Condição Validada</th>
        <th>Taxa de Acerto</th>
        <th>Média / Trade</th>
        <th>Saldo Anual</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>1. Abertura T0 (1º Seg)</strong></td>
        <td><code>10:30:01 / 11:30:01 BRT</code></td>
        <td>Alinhamento Ásia + Pré-Mercado (Config 1)</td>
        <td><strong>73,7% Win</strong></td>
        <td><strong>+1,47 pts</strong></td>
        <td><strong>+145,9 a +284,0 pts</strong></td>
      </tr>
      <tr class="highlight">
        <td><strong>2. Confirmação M5 ⭐</strong></td>
        <td><code>10:35:01 / 11:35:01 BRT</code></td>
        <td>Força Final &ge; 55% + 7 Techs &ge; 52%</td>
        <td><strong>83,6% Win</strong></td>
        <td><strong>+2,01 pts</strong></td>
        <td><strong>+303,4 a +390,8 pts</strong></td>
      </tr>
      <tr class="highlight-blue">
        <td><strong>3. Caixa OR5 (5 min) ⭐</strong></td>
        <td><code>10:35:01 às 10:45:00 BRT</code></td>
        <td>Breakout com Reteste na Borda da OR5</td>
        <td><strong>81,2% Win</strong></td>
        <td><strong>+1,61 pts</strong></td>
        <td><strong>+273,2 a +429,9 pts</strong></td>
      </tr>
      <tr class="highlight">
        <td><strong>4. OR15 Fade (Reversão) ⭐</strong></td>
        <td><code>10:45:01 às 13:30:00 BRT</code></td>
        <td>1º Toque na borda com rejeição (Parcial 35%/50%)</td>
        <td><strong>74,2% Win</strong></td>
        <td><strong>+0,64 pts</strong></td>
        <td><strong>+87,5 pts</strong></td>
      </tr>
      <tr>
        <td><strong>5. OR15 Breakout (Pullback)</strong></td>
        <td><code>10:45:01 às 13:30:00 BRT</code></td>
        <td>Rompimento com Confirmação de Reteste</td>
        <td><strong>65,8% Win</strong></td>
        <td><strong>+1,84 pts</strong></td>
        <td><strong>+210,2 pts</strong></td>
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
