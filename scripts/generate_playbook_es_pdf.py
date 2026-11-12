"""Gera o PDF didatico do Playbook Operacional para o ES / MES (S&P 500)
usando HTML/CSS + SVG e renderizacao headless via Edge/Chrome.
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

  ul {
    padding-left: 15px;
    margin: 2px 0;
  }
  li {
    margin-bottom: 2px;
  }
  .formula-box {
    background: #0f172a;
    color: #f8fafc;
    padding: 6px 10px;
    border-radius: 6px;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 8.2pt;
    margin: 4px 0;
  }
  .footer-note {
    margin-top: 5px;
    padding-top: 3px;
    border-top: 1px solid #cbd5e1;
    display: flex;
    justify-content: space-between;
    font-size: 7.4pt;
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
      <p>Guia Didático do S&amp;P 500 Futuro com Leitura de Força Multi-Timeframe &amp; NinjaTrader 8</p>
    </div>
    <div class="hero-badge">
      <strong>VALIDAÇÃO: 365 DIAS</strong><br/>
      11/11/2025 a 10/11/2026<br/>
      254 Pregões • 350.253 Minutos
    </div>
  </div>

  <div class="grid-4">
    <div class="card">
      <div class="kpi-label">Amostra Cash NY</div>
      <div class="kpi-num">97.714 min</div>
      <div style="font-size:7.5pt;color:#475569;">254 pregões completos</div>
    </div>
    <div class="card">
      <div class="kpi-label">Correlação Positiva ES</div>
      <div class="kpi-num" style="color:#16a34a;">100% (254/254)</div>
      <div style="font-size:7.5pt;color:#475569;">r médio = +0,372 (ret_0)</div>
    </div>
    <div class="card">
      <div class="kpi-label">Armadilha 1º Minuto</div>
      <div class="kpi-num" style="color:#dc2626;">54,9% dos dias</div>
      <div style="font-size:7.5pt;color:#475569;">Reverte nos 14 min seguintes</div>
    </div>
    <div class="card">
      <div class="kpi-label">Amplitude Média OR15</div>
      <div class="kpi-num">21,19 pts</div>
      <div style="font-size:7.5pt;color:#475569;">50% = 10,6 pts | 25% = 5,3 pts</div>
    </div>
  </div>

  <div class="section-header">
    <span>1. O ES (S&amp;P 500) E A PROPORÇÃO EM RELAÇÃO AO NASDAQ (NQ)</span>
    <span class="tag">FUNDAMENTO DO ATIVO</span>
  </div>

  <div class="grid-2">
    <div class="card-white">
      <h3>Características Técnicas e Financeiras do ES e MES</h3>
      <ul>
        <li><strong>Tamanho do Tick:</strong> <code>0,25 pontos</code> (4 ticks = 1 ponto completo).</li>
        <li><strong>Financeiro MES (Micro):</strong> Cada ponto vale <strong>$5,00</strong> ($1,25 por tick).</li>
        <li><strong>Financeiro ES (Mini):</strong> Cada ponto vale <strong>$50,00</strong> ($12,50 por tick).</li>
        <li><strong>Proporção Volatilidade NQ / ES:</strong> O NQ oscila cerca de <strong>6,9x a 7,2x mais pontos</strong> que o ES. Logo, <code>140 pts no NQ &asymp; 20 pts no ES</code>.</li>
      </ul>
      <div class="formula-box">
        Força Final = 35% NQ + 15% ES + 35% (7 Techs) + 15% VIX_Invertido
      </div>
    </div>
    <div class="card-amber">
      <h3>Por que o ES é mais estável e tem maior taxa de acerto?</h3>
      <p style="margin-bottom:4px;">Enquanto o NQ tem forte concentração em tecnologia, o <strong>S&amp;P 500 (ES)</strong> representa as 500 maiores empresas de todos os setores (bancos, saúde, energia, consumo, tech). Isso gera:</p>
      <ul>
        <li><strong>Menos violinadas e falso rompimento:</strong> Na OR15, a taxa de acerto da Reversão no ES sobe para <strong>74,2%</strong> (contra 66,7% no NQ).</li>
        <li><strong>Velas mais limpas:</strong> Range médio de 1m na sessão cash é de <strong>3,24 pontos</strong> (~13 ticks).</li>
      </ul>
    </div>
  </div>

  <div class="section-header">
    <span>2. CRONOLOGIA OFICIAL DE HORÁRIOS (FUSO BRASÍLIA — BRT)</span>
    <span class="tag">AJUSTE AUTOMÁTICO NO ROBÔ</span>
  </div>

  <table>
    <thead>
      <tr>
        <th>Regime de Horário (EUA)</th>
        <th>Sessão Asiática (Noite Anterior)</th>
        <th>Pré-Mercado (T-15m)</th>
        <th>ETAPA 1: Abertura NY (T0)</th>
        <th>ETAPA 2: Confirmação M5</th>
        <th>ETAPAS 3 e 4: Caixa OR15 (15 min)</th>
      </tr>
    </thead>
    <tbody>
      <tr class="highlight">
        <td><strong>Horário de Inverno EUA (EST)</strong><br/><span style="font-size:7.4pt;color:#475569;">Novembro a Março</span></td>
        <td><strong>20:00 BRT</strong> (18:00 ET)</td>
        <td><strong>11:15 BRT</strong> (09:15 ET)</td>
        <td><strong>11:30:00 BRT</strong> (09:30 ET)</td>
        <td><strong>11:35:00 BRT</strong> (09:35 ET)</td>
        <td><strong>11:45 às 13:30 BRT</strong> (09:45 às 11:30 ET)</td>
      </tr>
      <tr>
        <td><strong>Horário de Verão EUA (EDT)</strong><br/><span style="font-size:7.4pt;color:#475569;">Março a Novembro</span></td>
        <td><strong>19:00 BRT</strong> (18:00 ET)</td>
        <td><strong>10:15 BRT</strong> (09:15 ET)</td>
        <td><strong>10:30:00 BRT</strong> (09:30 ET)</td>
        <td><strong>10:35:00 BRT</strong> (09:35 ET)</td>
        <td><strong>10:45 às 12:30 BRT</strong> (09:45 às 11:30 ET)</td>
      </tr>
    </tbody>
  </table>

  <div class="section-header">
    <span>3. MAPA CRONOLÓGICO NO ES (AS 4 OPORTUNIDADES DIÁRIAS)</span>
    <span class="tag">FLUXO DE DECISÃO</span>
  </div>

  <div class="card-white" style="padding:8px;text-align:center;">
    <svg width="100%" height="135" viewBox="0 0 820 135" xmlns="http://www.w3.org/2000/svg">
      <line x1="30" y1="55" x2="790" y2="55" stroke="#94a3b8" stroke-width="4" />
      
      <!-- Ponto 1: Asia -->
      <circle cx="70" cy="55" r="10" fill="#1e293b" />
      <text x="70" y="24" text-anchor="middle" font-size="10.5" font-weight="bold" fill="#0f172a">1. ÁSIA (Noite)</text>
      <text x="70" y="38" text-anchor="middle" font-size="9" fill="#475569">20:00 / 19:00 BRT</text>
      <rect x="15" y="70" width="110" height="48" rx="6" fill="#f1f5f9" stroke="#94a3b8" />
      <text x="70" y="87" text-anchor="middle" font-size="8.8" font-weight="bold" fill="#1e293b">Força Ásia</text>
      <text x="70" y="100" text-anchor="middle" font-size="8" fill="#475569">&ge; 52% C | &le; 48% V</text>

      <!-- Ponto 2: T-15m -->
      <circle cx="220" cy="55" r="10" fill="#1e293b" />
      <text x="220" y="24" text-anchor="middle" font-size="10.5" font-weight="bold" fill="#0f172a">2. PRÉ-OPEN (T-15m)</text>
      <text x="220" y="38" text-anchor="middle" font-size="9" fill="#475569">11:15 / 10:15 BRT</text>
      <rect x="155" y="70" width="130" height="48" rx="6" fill="#f1f5f9" stroke="#94a3b8" />
      <text x="220" y="87" text-anchor="middle" font-size="8.8" font-weight="bold" fill="#1e293b">Compara c/ Ásia</text>
      <text x="220" y="100" text-anchor="middle" font-size="8" fill="#16a34a">Alinhadas &rarr; Libera T0</text>

      <!-- Ponto 3: T0 -->
      <circle cx="385" cy="55" r="12" fill="#2563eb" />
      <text x="385" y="24" text-anchor="middle" font-size="10.5" font-weight="bold" fill="#1d4ed8">3. ABERTURA (T0)</text>
      <text x="385" y="38" text-anchor="middle" font-size="9" fill="#2563eb">11:30 / 10:30 BRT</text>
      <rect x="315" y="70" width="140" height="48" rx="6" fill="#eff6ff" stroke="#2563eb" stroke-width="1.5" />
      <text x="385" y="86" text-anchor="middle" font-size="8.8" font-weight="bold" fill="#1e3a8a">[FLAG 1] 1º Segundo</text>
      <text x="385" y="99" text-anchor="middle" font-size="8" fill="#1e293b">Scalp 7x7 | Swing 22x14 pts</text>

      <!-- Ponto 4: T+5m -->
      <circle cx="555" cy="55" r="12" fill="#0d9488" />
      <text x="555" y="24" text-anchor="middle" font-size="10.5" font-weight="bold" fill="#0f766e">4. CONFIRMAÇÃO M5</text>
      <text x="555" y="38" text-anchor="middle" font-size="9" fill="#0d9488">11:35 / 10:35 BRT</text>
      <rect x="480" y="70" width="150" height="48" rx="6" fill="#f0fdfa" stroke="#0d9488" stroke-width="1.5" />
      <text x="555" y="86" text-anchor="middle" font-size="8.8" font-weight="bold" fill="#115e59">[FLAG 2] Pós-Armadilha</text>
      <text x="555" y="99" text-anchor="middle" font-size="8" fill="#16a34a">Força &ge; 55% + Tech &ge; 52%</text>

      <!-- Ponto 5: T+15m OR15 -->
      <circle cx="730" cy="55" r="12" fill="#16a34a" />
      <text x="730" y="24" text-anchor="middle" font-size="10.5" font-weight="bold" fill="#15803d">5. CAIXA OR15</text>
      <text x="730" y="38" text-anchor="middle" font-size="9" fill="#16a34a">11:45 / 10:45 BRT</text>
      <rect x="650" y="70" width="160" height="48" rx="6" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.5" />
      <text x="730" y="86" text-anchor="middle" font-size="8.8" font-weight="bold" fill="#14532d">[FLAGS 3 &amp; 4] Fade / Brk</text>
      <text x="730" y="99" text-anchor="middle" font-size="8" fill="#16a34a">74,2% Win na Reversão</text>
    </svg>
  </div>

  <div class="footer-note">
    <span>VortexWeb Quant Research • Playbook Operacional ES / MES (S&amp;P 500)</span>
    <span>Página 1 de 4</span>
  </div>
</div>

<!-- ==================== PÁGINA 2 ==================== -->
<div class="page">
  <div class="hero" style="padding:10px 14px;">
    <div>
      <h1 style="font-size:13.5pt;">ETAPAS 1 E 2 — ABERTURA DO ES: ENTRADA T0 E CONFIRMAÇÃO M5</h1>
      <p>Como operar no primeiro segundo da abertura ou aguardar a confirmação da 5ª vela no S&amp;P 500</p>
    </div>
    <div class="hero-badge">
      <strong>FLAGS 1 &amp; 2</strong><br/>
      Abertura ES
    </div>
  </div>

  <div class="section-header">
    <span>ETAPA 1 ([FLAG 1]): ENTRADA NO 1º SEGUNDO DA ABERTURA (T0 = 11:30:00 / 10:30:00 BRT)</span>
    <span class="tag">61,6% ACERTO NO 1º MINUTO</span>
  </div>

  <div class="grid-2">
    <div class="card-blue">
      <h3>Critério de Disparo Pré-Abertura (Às 11:15 / 10:15 BRT)</h3>
      <p style="margin-bottom:4px;">No ES, a entrada no 1º segundo da abertura é validada exclusivamente quando há <strong>consenso direcional</strong> entre a sessão noturna e o pré-mercado:</p>
      <ul>
        <li><span class="badge-buy">COMPRA NO T0</span><br/>
          <strong>Força Ásia &ge; 52%</strong> <u>E</u> <strong>Força T-15m &ge; 52%</strong>.</li>
        <li style="margin-top:3px;"><span class="badge-sell">VENDA NO T0</span><br/>
          <strong>Força Ásia &le; 48%</strong> <u>E</u> <strong>Força T-15m &le; 48%</strong>.</li>
        <li style="margin-top:3px;"><span class="badge-neutral">AGUARDAR M5</span><br/>
          Se houver divergência entre Ásia e T-15m, <strong>fique flat</strong> e espere o M5!</li>
      </ul>
    </div>

    <div class="card-white">
      <h3>Desempenho no ES em 365 Dias (99 Pregões)</h3>
      <table>
        <thead>
          <tr>
            <th>Modo no ES</th>
            <th>Alvo (TP)</th>
            <th>Stop (SL)</th>
            <th>Resultado (1 Ano)</th>
          </tr>
        </thead>
        <tbody>
          <tr class="highlight">
            <td><strong>Scalp 5m ES</strong><br/>(Recomendado)</td>
            <td><strong>7,0 pts</strong><br/>(28 ticks)</td>
            <td><strong>7,0 pts</strong><br/>(28 ticks)</td>
            <td><strong>59,6% Win Rate</strong><br/>+1,36 pts/trade (<strong>+135,0 pts</strong>)<br/>+$6.750 ES / +$675 MES</td>
          </tr>
          <tr>
            <td><strong>Swing 60m ES</strong><br/>(Alvo Longo)</td>
            <td><strong>22,0 pts</strong><br/>(88 ticks)</td>
            <td><strong>14,0 pts</strong><br/>(56 ticks)</td>
            <td><strong>44,4% Win</strong> (1,57:1)<br/>+1,72 pts/trade (<strong>+170,25 pts</strong>)<br/>+$8.512 ES / +$851 MES</td>
          </tr>
        </tbody>
      </table>
      <p style="font-size:7.8pt;color:#475569;">💡 <em>No ES, a vela do 1º minuto (T0 &rarr; T+1m) acertou a direção em <strong>61,6% dos pregões</strong> (média de +0,94 pts imediatos).</em></p>
    </div>
  </div>

  <div class="section-header">
    <span>ETAPA 2 ([FLAG 2]): CONFIRMAÇÃO PÓS-ARMADILHA EM M5 (T+5m = 11:35:00 / 10:35:00 BRT)</span>
    <span class="tag">+357,0 PONTOS NO ANO</span>
  </div>

  <div class="grid-2">
    <div class="card-green">
      <h3>Por que aguardar 5 minutos no S&amp;P 500?</h3>
      <p style="margin-bottom:4px;">No ES, <strong>54,9% das primeiras velas de 1 minuto são armadilhas</strong> (o preço testa uma direção e inverte logo em seguida). Aguardar 5 minutos permite que todas as 500 ações do índice abram o pregão à vista em Nova York:</p>
      <ul>
        <li><span class="badge-buy">COMPRA EM T+5m</span><br/>
          Quando <strong>Força Final &ge; 55%</strong> <u>E</u> <strong>Média 7 Techs &ge; 52%</strong>.</li>
        <li style="margin-top:3px;"><span class="badge-sell">VENDA EM T+5m</span><br/>
          Quando <strong>Força Final &le; 45%</strong> <u>E</u> <strong>Média 7 Techs &le; 48%</strong>.</li>
      </ul>
    </div>

    <div class="card-white">
      <h3>Gestão Operacional no ES (151 Pregões no Ano)</h3>
      <table>
        <thead>
          <tr>
            <th>Parâmetro no ES</th>
            <th>Valor Recomendado (ES / MES)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Horário de Avaliação</strong></td>
            <td><code>11:35:00 BRT</code> (Inverno) / <code>10:35:00 BRT</code> (Verão)</td>
          </tr>
          <tr class="highlight">
            <td><strong>Take Profit (Alvo)</strong></td>
            <td><strong>16,0 pontos</strong> (64 ticks)</td>
          </tr>
          <tr>
            <td><strong>Stop Loss (Proteção)</strong></td>
            <td><strong>11,0 pontos</strong> (44 ticks)</td>
          </tr>
          <tr>
            <td><strong>Saída por Tempo Máximo</strong></td>
            <td>Encerra em <strong>T+60m</strong> (55 min após a entrada)</td>
          </tr>
          <tr class="highlight">
            <td><strong>Resultado em 365 Dias</strong></td>
            <td><strong>54,3% Win • +2,36 pts/trade • +357,00 pts</strong><br/>(+$17.850 no ES / +$1.785 no MES)</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Comparativo visual ES -->
  <div class="card" style="margin-top:4px;">
    <h3>Fluxo de Decisão da Abertura do ES</h3>
    <svg width="100%" height="88" viewBox="0 0 800 88" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="230" height="68" rx="7" fill="#1e293b" />
      <text x="125" y="32" text-anchor="middle" font-size="10" font-weight="bold" fill="#38bdf8">11:15 / 10:15 BRT (Pré-Open ES)</text>
      <text x="125" y="48" text-anchor="middle" font-size="9" fill="#ffffff">Verificar Força Ásia e T-15m</text>
      <text x="125" y="64" text-anchor="middle" font-size="8.5" fill="#cbd5e1">Ambas &ge; 52% ou &le; 48%?</text>

      <line x1="240" y1="28" x2="310" y2="28" stroke="#16a34a" stroke-width="2.5" />
      <text x="275" y="21" text-anchor="middle" font-size="8.8" font-weight="bold" fill="#16a34a">SIM (39%)</text>
      <rect x="310" y="6" width="475" height="36" rx="6" fill="#dcfce7" stroke="#16a34a" stroke-width="1.5" />
      <text x="547" y="21" text-anchor="middle" font-size="9" font-weight="bold" fill="#14532d">ENTRA NO 1º SEGUNDO DO ES (T0 = 11:30:00 / 10:30:00 BRT)</text>
      <text x="547" y="34" text-anchor="middle" font-size="8" fill="#166534">Scalp 7x7 pts (59,6% Win, +135 pts) • Swing 22x14 pts (+170 pts) • 61,6% na 1ª vela</text>

      <line x1="240" y1="60" x2="310" y2="60" stroke="#d97706" stroke-width="2.5" />
      <text x="275" y="53" text-anchor="middle" font-size="8.8" font-weight="bold" fill="#d97706">NÃO (61%)</text>
      <rect x="310" y="46" width="475" height="36" rx="6" fill="#fef3c7" stroke="#d97706" stroke-width="1.5" />
      <text x="547" y="61" text-anchor="middle" font-size="9" font-weight="bold" fill="#92400e">AGUARDA 5 MINUTOS NO ES (T+5m = 11:35:00 / 10:35:00 BRT)</text>
      <text x="547" y="74" text-anchor="middle" font-size="8" fill="#78350f">Entra se Força &ge; 55% + Techs &ge; 52% (ou &le; 45% / &le; 48%) • 54,3% Win (+357 pts)</text>
    </svg>
  </div>

  <div class="footer-note">
    <span>VortexWeb Quant Research • Playbook Operacional ES / MES (S&amp;P 500)</span>
    <span>Página 2 de 4</span>
  </div>
</div>

<!-- ==================== PÁGINA 3 ==================== -->
<div class="page">
  <div class="hero" style="padding:10px 14px;">
    <div>
      <h1 style="font-size:13.5pt;">ETAPAS 3 E 4 — A CAIXA DOS 15 MINUTOS (OR15) NO ES COM GESTÃO 50% E 25%</h1>
      <p>Reversão (Fade) de Alta Assertividade (74,2%) e Rompimento (Breakout) no S&amp;P 500 Futuro</p>
    </div>
    <div class="hero-badge">
      <strong>FLAGS 3 &amp; 4</strong><br/>
      Pós-15 Minutos ES
    </div>
  </div>

  <div class="section-header">
    <span>ANATOMIA DA CAIXA OR15 NO ES: 50% (OR_Mid) E 25% (50% DA METADE)</span>
    <span class="tag">MÉTRICAS DO ES</span>
  </div>

  <div class="grid-2">
    <div class="card-white">
      <h3>Parâmetros Médios da OR15 no ES (365 Dias)</h3>
      <ul>
        <li><strong>Amplitude Média Total (<code>OR_Range</code>):</strong> <strong><code>21,2 pontos</code></strong> (~85 ticks).</li>
        <li><strong>50% da Caixa (<code>OR_Mid</code> Centro):</strong> <code>0,50 &times; 21,2 =</code> <strong><code>10,6 pontos</code></strong>.</li>
        <li><strong>50% da Metade (<code>q25 = 25% da Caixa</code>):</strong> <code>0,25 &times; 21,2 =</code> <strong><code>5,3 pontos</code></strong> (~21 ticks).</li>
      </ul>
      <p style="margin-top:4px;"><em>Exemplo Prático:</em> Se nos primeiros 15 min a Máxima foi <code>5.920,00</code> e a Mínima <code>5.900,00</code> (Range = 20 pts):<br/>
      &bull; <strong>OR_Mid (50%):</strong> <code>5.910,00</code> (10 pts de alvo no centro).<br/>
      &bull; <strong>25% da OR:</strong> <code>5,00 pts</code> (Alvo da parcial e Stop Loss).</p>
      <div class="formula-box" style="margin-top:4px;">
        Stop no ES = 25% da OR &nbsp;|&nbsp; Parcial = 25% da OR &nbsp;|&nbsp; Alvo Final = 50% da OR (Centro)
      </div>
    </div>

    <!-- Diagrama SVG da Caixa OR15 no ES -->
    <div class="card-white" style="text-align:center;padding:5px;">
      <svg width="100%" height="165" viewBox="0 0 380 165" xmlns="http://www.w3.org/2000/svg">
        <line x1="25" y1="14" x2="355" y2="14" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4,3" />
        <text x="30" y="11" font-size="8.2" font-weight="bold" fill="#dc2626">Stop Venda Fade (+25% OR fora) = 5.925,00 (+5,0 pts)</text>

        <rect x="25" y="34" width="330" height="96" fill="#f8fafc" stroke="#64748b" stroke-width="1" />

        <line x1="25" y1="34" x2="355" y2="34" stroke="#dc2626" stroke-width="2.5" />
        <text x="30" y="30" font-size="8.8" font-weight="bold" fill="#dc2626">ORH_15 (Máxima) = 5.920,00 (Venda Fade / Compra Breakout)</text>

        <line x1="25" y1="58" x2="355" y2="58" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="2,2" />
        <text x="30" y="55" font-size="8" font-weight="bold" fill="#2563eb">25% OR (50% Metade) = 5.915,00 &rarr; Parcial 50% + Breakeven</text>

        <line x1="25" y1="82" x2="355" y2="82" stroke="#d97706" stroke-width="2.2" stroke-dasharray="5,3" />
        <text x="30" y="78" font-size="8.8" font-weight="bold" fill="#b45309">50% OR (OR_Mid Centro) = 5.910,00 &rarr; ALVO FINAL FADE (10 pts)</text>

        <line x1="25" y1="106" x2="355" y2="106" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="2,2" />
        <text x="30" y="103" font-size="8" font-weight="bold" fill="#2563eb">25% OR (50% Metade) = 5.905,00 &rarr; Parcial 50% + Breakeven</text>

        <line x1="25" y1="130" x2="355" y2="130" stroke="#16a34a" stroke-width="2.5" />
        <text x="30" y="142" font-size="8.8" font-weight="bold" fill="#16a34a">ORL_15 (Mínima) = 5.900,00 (Compra Fade / Venda Breakout)</text>

        <line x1="25" y1="154" x2="355" y2="154" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4,3" />
        <text x="30" y="163" font-size="8.2" font-weight="bold" fill="#dc2626">Stop Compra Fade (-25% OR fora) = 5.895,00 (-5,0 pts)</text>
      </svg>
    </div>
  </div>

  <div class="section-header">
    <span>ETAPA 3 ([FLAG 3]): REVERSÃO / FADE NO 1º TOQUE DA OR15 (74,2% DE ACERTO NO ES)</span>
    <span class="tag">+266 A +398 PONTOS NO ANO</span>
  </div>

  <div class="card-green" style="margin-bottom:6px;">
    <h3>Regra de Reversão no ES (Assertividade Excepcional de 74,2%)</h3>
    <p>No 1º toque na máxima (<code>ORH_15</code>) ou mínima (<code>ORL_15</code>): se o candle de 1m <strong>fechar de volta dentro da caixa (pavio de rejeição)</strong> <u>OU</u> a <strong>Força a favor for &lt; 55%</strong>, opere a volta para o centro da caixa (<code>OR_Mid</code>)!</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>Modelo de Gestão no ES</th>
        <th>Todas as Caixas c/ Rejeição (132 trades/ano)</th>
        <th>Caixas Amplas &ge; 20 pts (53 trades/ano)</th>
        <th>Financeiro Anual (1 Contrato ES / MES)</th>
      </tr>
    </thead>
    <tbody>
      <tr class="highlight">
        <td><strong>1. Parcial 25% + BE + Final 50% (Stop 25% OR)</strong></td>
        <td><strong>74,2% Win Rate</strong> • +2,02 pts/trade</td>
        <td><strong>69,8% Win Rate</strong> • +2,16 pts/trade</td>
        <td><strong>+$13.304 ES</strong> / +$1.330 MES (<strong>+266,09 pts</strong>)</td>
      </tr>
      <tr>
        <td><strong>2. Alvo 50% OR (Centro) | Stop 50% OR (1:1)</strong></td>
        <td><strong>67,4% Win Rate</strong> • +3,02 pts/trade</td>
        <td><strong>58,5% Win Rate</strong> • +2,44 pts/trade</td>
        <td><strong>+$19.900 ES</strong> / +$1.990 MES (<strong>+398,00 pts</strong>)</td>
      </tr>
      <tr>
        <td><strong>3. Alvo 25% OR (Curto) | Stop 25% OR (1:1)</strong></td>
        <td><strong>74,2% Win Rate</strong> • +2,30 pts/trade</td>
        <td><strong>69,8% Win Rate</strong> • +2,69 pts/trade</td>
        <td><strong>+$15.178 ES</strong> / +$1.517 MES (<strong>+303,56 pts</strong>)</td>
      </tr>
      <tr>
        <td><strong>4. Parcial 25% + BE + Final 50% (Stop 50% OR)</strong></td>
        <td><strong>82,6% Win Rate</strong> • +1,71 pts/trade</td>
        <td><strong>77,4% Win Rate</strong> • +1,44 pts/trade</td>
        <td><strong>+$11.312 ES</strong> / +$1.131 MES (<strong>+226,25 pts</strong>)</td>
      </tr>
    </tbody>
  </table>

  <div class="section-header">
    <span>ETAPA 4 ([FLAG 4]): ROMPIMENTO / BREAKOUT DA OR15 NO ES (63,2% A 83,0% DE ACERTO)</span>
    <span class="tag">+202 PONTOS NO ANO</span>
  </div>

  <div class="grid-2">
    <div class="card-blue">
      <h3>Breakout de Caixa Comprimida (<code>OR_Range &le; 20 pts</code>)</h3>
      <p style="margin-bottom:3px;">Quando a caixa foi estreita (<code>&le; 20 pts</code>) e o candle fecha o corpo fora da OR15 com <strong>Força a favor &ge; 55%</strong> (106 trades no ano):</p>
      <ul>
        <li><strong>Alvo Expansão +50% OR | Stop 50% OR (no OR_Mid):</strong><br/>
          <strong>63,2% Win</strong> • <code>+1,91 pts/trade</code> • <strong>+202,12 pts</strong> (+$10.106 ES).</li>
        <li><strong>Parcial +25% OR + BE + Final +50% OR | Stop 50% OR:</strong><br/>
          <strong>83,0% Win</strong> • <code>+1,72 pts/trade</code> • <strong>+182,81 pts</strong> (+$9.140 ES).</li>
      </ul>
    </div>

    <div class="card-amber">
      <h3>Breakout de Caixa Explosiva (<code>OR_Range &ge; 30 pts</code>)</h3>
      <p style="margin-bottom:3px;">Em dias de fortes notícias econômicas onde a OR15 passou de 30 pontos e fecha rompendo com <strong>Força &ge; 55%</strong> (37 trades no ano):</p>
      <ul>
        <li><strong>Alvo Expansão +50% OR | Stop 25% OR (Payoff 2:1):</strong><br/>
          <strong>45,9% Win</strong> (2:1) • <code>+4,67 pts/trade</code> • <strong>+172,62 pts</strong> (+$8.631 ES).</li>
        <li><strong>Parcial +25% OR + BE + Final +50% OR | Stop 50% OR:</strong><br/>
          <strong>73,0% Win</strong> • <code>+2,35 pts/trade</code> • <strong>+86,94 pts</strong> (+$4.347 ES).</li>
      </ul>
    </div>
  </div>

  <div class="footer-note">
    <span>VortexWeb Quant Research • Playbook Operacional ES / MES (S&amp;P 500)</span>
    <span>Página 3 de 4</span>
  </div>
</div>

<!-- ==================== PÁGINA 4 ==================== -->
<div class="page">
  <div class="hero" style="padding:10px 14px;">
    <div>
      <h1 style="font-size:13.5pt;">CONFIGURAÇÃO NO NINJATRADER 8 &amp; TABELA COMPARATIVA NQ VS. ES</h1>
      <p>Como rodar a estratégia VMPlaybookNasdaq no ES/MES e resumo anual consolidado</p>
    </div>
    <div class="hero-badge">
      <strong>ES / MES</strong><br/>
      NinjaTrader 8
    </div>
  </div>

  <div class="section-header">
    <span>1. TABELA DE CONVERSÃO EXATA DE PARÂMETROS: NQ (NASDAQ) VS. ES (S&amp;P 500)</span>
    <span class="tag">GUIA DE TICKS</span>
  </div>

  <table>
    <thead>
      <tr>
        <th>Parâmetro Operacional</th>
        <th>Configuração no NQ / MNQ</th>
        <th>Configuração no ES / MES</th>
        <th>Equivalência em Ticks no ES (0,25 pt)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Corte Caixa Comprimida</strong></td>
        <td><code>&le; 120 pontos</code></td>
        <td><strong><code>&le; 20 pontos</code></strong></td>
        <td>&le; 80 ticks</td>
      </tr>
      <tr>
        <td><strong>Corte Caixa Explosiva</strong></td>
        <td><code>&ge; 180 pontos</code></td>
        <td><strong><code>&ge; 30 pontos</code></strong></td>
        <td>&ge; 120 ticks</td>
      </tr>
      <tr class="highlight">
        <td><strong>T0 Scalp (5 min)</strong></td>
        <td>TP 45 pts / SL 45 pts</td>
        <td><strong>TP 7,0 pts / SL 7,0 pts</strong></td>
        <td>28 ticks / 28 ticks</td>
      </tr>
      <tr class="highlight">
        <td><strong>T0 Swing (60 min)</strong></td>
        <td>TP 130 pts / SL 85 pts</td>
        <td><strong>TP 22,0 pts / SL 14,0 pts</strong></td>
        <td>88 ticks / 56 ticks</td>
      </tr>
      <tr class="highlight">
        <td><strong>M5 Confirmação (T+5m)</strong></td>
        <td>TP 110 pts / SL 75 pts</td>
        <td><strong>TP 16,0 pts / SL 11,0 pts</strong></td>
        <td>64 ticks / 44 ticks</td>
      </tr>
      <tr>
        <td><strong>OR15 Reversão (Fade)</strong></td>
        <td>Parcial 25% + BE + Final 50% OR</td>
        <td><strong>Parcial 25% + BE + Final 50% OR</strong></td>
        <td>Dinâmico conforme a caixa do dia</td>
      </tr>
      <tr>
        <td><strong>OR15 Breakout</strong></td>
        <td>Expansão +50% OR | Stop 50% OR</td>
        <td><strong>Expansão +50% OR | Stop 50% OR</strong></td>
        <td>Dinâmico conforme a caixa do dia</td>
      </tr>
    </tbody>
  </table>

  <div class="section-header">
    <span>2. COMO CONFIGURAR O ROBÔ NO NINJATRADER 8 PARA O ES / MES</span>
    <span class="tag">PASSOS RÁPIDOS</span>
  </div>

  <div class="card-white" style="margin-bottom:7px;">
    <ul>
      <li><strong>Passo 1:</strong> Abra um gráfico de <strong>1 Minuto (M1)</strong> do contrato vigente do <strong>ES</strong> (ex: <code>ES 12-26</code>) ou <strong>MES</strong> (<code>MES 12-26</code>).</li>
      <li><strong>Passo 2:</strong> Adicione a estratégia <code>VM PLAYBOOK NASDAQ 1.0</code> ([`VMPlaybookNasdaq.cs`](file:///c:/Users/Pichau/Projetos%20React/VortexWeb/experts/VMPlaybookNasdaq.cs)).</li>
      <li><strong>Passo 3:</strong> Na seção <code>04. RISCO</code>, defina <code>LOTE_Size = 2</code> (para permitir a saída parcial de 50% dos contratos em 25% da OR + Breakeven automático).</li>
      <li><strong>Passo 4:</strong> Na seção <code>26. PLAYBOOK NASDAQ FORCE</code>, configure os cortes do ES:
        <br/>&bull; <code>23. [OR15 Reversão] Amplitude Mínima: 10 pts</code>
        <br/>&bull; <code>24. [OR15 Breakout] Caixa Comprimida Máx: 20 pts</code>
        <br/>&bull; <code>25. [OR15 Breakout] Caixa Explosiva Mín: 30 pts</code>
        <br/>&bull; <code>16. [M5] Take Profit: 16 pts</code> &bull; <code>17. [M5] Stop Loss: 11 pts</code></li>
    </ul>
  </div>

  <div class="section-header">
    <span>3. TABELA CONSOLIDADA DE RESULTADOS ANUAIS NO ES (365 DIAS)</span>
    <span class="tag">PERFORMANCE 1 ANO</span>
  </div>

  <table>
    <thead>
      <tr>
        <th>Etapa Cronológica</th>
        <th>Setup no ES / MES</th>
        <th>Trades / Ano</th>
        <th>Win Rate</th>
        <th>Expectativa</th>
        <th>Saldo Pontos ES</th>
        <th>Saldo Financeiro (1 Contrato)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>1. Abertura T0 (Scalp)</strong></td>
        <td>Ásia + T-15m (&ge; 52 / &le; 48) — TP 7 / SL 7 pts</td>
        <td>99</td>
        <td><strong>59,6%</strong></td>
        <td><strong>+1,36 pts</strong></td>
        <td><strong>+135,00 pts</strong></td>
        <td>+$6.750 ES / +$675 MES</td>
      </tr>
      <tr>
        <td><strong>1. Abertura T0 (Swing)</strong></td>
        <td>Ásia + T-15m (&ge; 52 / &le; 48) — TP 22 / SL 14 pts</td>
        <td>99</td>
        <td><strong>44,4%</strong> (1,57:1)</td>
        <td><strong>+1,72 pts</strong></td>
        <td><strong>+170,25 pts</strong></td>
        <td>+$8.512 ES / +$851 MES</td>
      </tr>
      <tr class="highlight">
        <td><strong>2. Confirmação M5</strong></td>
        <td>Força &ge; 55% + Tech &ge; 52% (TP 16 / SL 11 pts)</td>
        <td>151</td>
        <td><strong>54,3%</strong></td>
        <td><strong>+2,36 pts</strong></td>
        <td><strong>+357,00 pts</strong></td>
        <td><strong>+$17.850 ES</strong> / <strong>+$1.785 MES</strong></td>
      </tr>
      <tr class="highlight">
        <td><strong>3. OR15 Reversão (Fade)</strong></td>
        <td>1º Toque c/ Pavio (Parcial 25% + BE + Final 50%)</td>
        <td>132</td>
        <td><strong>74,2%</strong></td>
        <td><strong>+2,02 pts</strong></td>
        <td><strong>+266,09 pts</strong></td>
        <td><strong>+$13.304 ES</strong> / <strong>+$1.330 MES</strong></td>
      </tr>
      <tr>
        <td><strong>3. OR15 Reversão (Alvo 50%)</strong></td>
        <td>1º Toque c/ Pavio (Alvo Centro 50% | SL 50% OR)</td>
        <td>132</td>
        <td><strong>67,4%</strong></td>
        <td><strong>+3,02 pts</strong></td>
        <td><strong>+398,00 pts</strong></td>
        <td><strong>+$19.900 ES</strong> / <strong>+$1.990 MES</strong></td>
      </tr>
      <tr>
        <td><strong>4. OR15 Breakout (&le; 20 pts)</strong></td>
        <td>Caixa Comprimida + Fecha Fora + Força &ge; 55%</td>
        <td>106</td>
        <td><strong>63,2%</strong></td>
        <td><strong>+1,91 pts</strong></td>
        <td><strong>+202,12 pts</strong></td>
        <td>+$10.106 ES / +$1.010 MES</td>
      </tr>
      <tr>
        <td><strong>4. OR15 Breakout (&ge; 30 pts)</strong></td>
        <td>Caixa Explosiva + Fecha Fora + Força &ge; 55%</td>
        <td>37</td>
        <td><strong>45,9%</strong> (2:1)</td>
        <td><strong>+4,67 pts</strong></td>
        <td><strong>+172,62 pts</strong></td>
        <td>+$8.631 ES / +$863 MES</td>
      </tr>
    </tbody>
  </table>

  <div class="footer-note">
    <span>VortexWeb Quant Research • Playbook Operacional ES / MES • Arquivo: Playbook_Operacional_ES_MES_NasdaqForce.pdf</span>
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
