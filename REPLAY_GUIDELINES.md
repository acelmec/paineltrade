# VortexWeb — Constituição e Diretrizes Invioláveis do Replay de Mercado (ReplayEngine)

Este documento estabelece as **Diretrizes Arquiteturais Invioláveis** e as regras de negócio do motor de **Replay de Mercado** do VortexWeb (`ReplayWorkstation.tsx`, `ReplayControlCard.tsx`, `replayEngine.ts`, `db.ts`, `vortexStreamer.ts`). 

> [!IMPORTANT]
> **REGRA DE OURO:** O motor de Replay do VortexWeb já foi amplamente testado e funciona com alta precisão operacional (execução de ordens simuladas, estratégias ATM, boleta, avanço fractal intra-candle e cálculo de PnL). Qualquer modificação, correção ou inclusão de recursos no Replay **DEVE OBRIGATORIAMENTE** consultar, respeitar e preservar as diretrizes deste documento, evitando regressões ou quebras de processos já estabilizados.

---

## 1. As Duas Fontes de Dados (Data Sources)

O Replay de Mercado opera através de duas fontes distintas de alimentação, selecionáveis no card de controle:

### A. Modo Local (`dataSource: 'local'`) — Add-on Streamer NinjaTrader 8 (:8002)
* **Origem:** Comunicação HTTP direta com o add-on local `AxionStreamerAddOn.cs` rodando no NinjaTrader 8 na porta `8002` (`/candles`).
* **Comportamento e Capacidade:**
  - Extrai os candles de 1 minuto mantidos na memória RAM do NT8.
  - A quantidade de dias disponíveis é governada pelo parâmetro `DaysToLoad` configurado no NinjaTrader (padrão 5 dias, expansível conforme configuração do usuário).
  - É a fonte de menor latência quando o NinjaTrader 8 está aberto localmente.

### B. Modo Nuvem (`dataSource: 'supabase'`) — Banco de Dados Supabase
* **Origem:** Tabela `painelvm_candles_1m` no Supabase.
* **Comportamento e Capacidade:**
  - Fonte persistente de longo prazo (dias, semanas ou meses de histórico).
  - Permite replay retroativo mesmo com o NinjaTrader 8 fechado ou em máquinas sem NT8 instalado.

---

## 2. Regras Mandatórias de Carregamento e Paginação no Supabase

### A. Paginação Estrita com Limite PostgREST (`chunkSize <= 1000`)
* O motor PostgREST do Supabase Cloud possui um limite global de segurança de **1.000 linhas por requisição HTTP** (`db_max_rows = 1000`).
* **PROIBIÇÃO ABSOLUTA:** É terminantemente proibido utilizar `chunkSize` maior que `1000` (como 5000) em queries paginadas (`.range(from, to)`).
  - *Motivo:* Se o código solicitar um range de 0 a 4999 com `chunkSize = 5000`, o Supabase retornará apenas 1.000 registros, e o loop avançará para o próximo bloco pulando 4.000 velas (~3 dias de pregão), causando perda catastrófica de dados.
* Toda busca por intervalo de datas DEVE paginar em blocos de no máximo 1.000 registros, concatenando até atingir o volume total retornado pelo `count: 'exact'`.

### B. Compatibilidade Universal de Formatos de Timestamp
* O NinjaTrader (`GammaPainelHttpCandles.cs`) grava timestamps locais no formato `yyyy-MM-ddTHH:mm:ss` (sem o sufixo `Z`).
* O front-end VortexWeb frequentemente utiliza strings ISO UTC com sufixo `Z`.
* **Regra:** O `fetchCandlesByDateRangeSupabase` DEVE normalizar e testar tanto o formato puro (sem `Z`) quanto o formato UTC (com `Z`), garantindo que velas gravadas por qualquer versão do add-on ou da API sejam localizadas sem falhas.

---

## 3. Preservação de Datas Selecionadas pelo Usuário (Proibição de Reset Forçado)

* **Respeito à Escolha do Usuário:** Se o usuário selecionou um período específico (ex: `05/10/2026` até `19/10/2026`), o sistema **NUNCA DEVE sobrescrever ou resetar** essas datas para os "últimos 2 dias" (`maxDate - 1`).
* **Validação de Limites (`checkBounds`):**
  - O código deve apenas verificar se a data inicial e final do usuário estão contidas dentro do limite físico de dados do banco (`minAvailableDate <= start <= end <= maxAvailableDate`).
  - Se estiverem dentro dos limites válidos, as datas selecionadas DEVEM ser rigorosamente preservadas.
  - A inicialização para um intervalo padrão (ex: últimos 5 a 7 dias) SOMENTE é permitida na primeiríssima vez em que o sistema for aberto sem nenhuma preferência salva no `localStorage` ou no estado.
* **Isolamento de Eventos no Botão Carregar:**
  - Ao vincular o clique do botão "Carregar" (`onLoadData`), NUNCA passar referências diretas de função sem encapsulamento (ex: `onClick={onLoadData}`), pois o React injeta o objeto `MouseEvent` como primeiro argumento (`overrideStartDate`), corrompendo a data inicial.
  - O correto é sempre: `onLoadData={() => handleLoadData(startDate, endDate, undefined, true)}`.

---

## 4. Exibição Gráfica Contínua e Lookback Histórico

* **Sem Poda Artificial do Histórico:** O array `displayedCandles` NUNCA deve ser truncado para janelas artificiais pequenas (como 800 velas).
  - *Motivo:* 800 velas de 1 minuto equivalem a apenas 13 horas e 20 minutos de pregão. Se o usuário carregar 15 dias para analisar suportes e resistências, podar em 800 velas esconde todo o histórico anterior e cria a ilusão de que apenas os últimos 2 dias foram carregados.
* **Janela Ampla:** A janela de visualização suporta confortavelmente até 15.000+ velas de 1m (~15 dias completos de pregão contínuo), renderizadas a 60 FPS com altíssima performance no TradingView Lightweight Charts.
* **Anti-Lookahead Bias:** Conforme o replay é reproduzido ou o cursor de tempo é movido, os indicadores e cálculos técnicos devem refletir estritamente o histórico até o candle simulado corrente (`currentCandleIndex`), sem conhecimento de velas futuras.

---

## 5. Integridade do Motor Operacional do Replay

* **Ambiente 100% Simulado:** O Replay possui contas simuladas (`ReplayAccountModal`, `account.is_replay = true`), boletas dedicadas e semáforos próprios. Nenhuma ordem simulada do Replay pode interagir com os websockets ou ordens de contas reais da corretora ou NinjaTrader.
* **Regras de Risco:** As operações no Replay respeitam rigorosamente a gestão de risco simulada (`daily_stop_loss_usd`, `daily_max_entries`, contratos máximos e metas).
* **Ordens ATM Simuladas:** O motor de ATM do Replay simula a execução de Stop Loss e Take Profit com base na máxima e mínima de cada vela (ou oscilação intra-candle fractal em tempo real), preservando a fidelidade da execução.
